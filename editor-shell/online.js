(function () {
  // `window.erpHost` v2 (docs/erp-host.md): installed before the editor's wasm starts, for a signed-in user on
  // `/<editor>/?doc=<id>` (optionally `&version=<seq>`, read-only) or for anyone on the public link
  // `/<editor>/#link=<token>`. Composes online-*.js; ships only with online documents on (src/config/online.ts).
  var EDITORS = ['van-ban', 'bang-tinh', 'trinh-chieu', 'pdf']
  var DOC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  var VERSION = /^[1-9][0-9]{0,8}$/
  var FORK_FLUSH_WAIT = 10 * 1000
  var SAVES_WAIT = 10 * 1000
  // Intake message keys the editor may give with opened(false); anything else reads as unreadable bytes.
  var OPENED_REASONS = ['unsupported', 'parserFailed']
  var linkHash = /^#link=([^&]*)$/.exec(location.hash)
  var online = window.erpOnline
  var account = window.erpAccount
  var editor = location.pathname.split('/')[1]
  var params = new URLSearchParams(location.search)
  var usable = Boolean(online && account && typeof account.apiFetch === 'function')
  var editorPage = EDITORS.indexOf(editor) !== -1 && location.pathname === '/' + editor + '/'
  // erpHost and the ERP embed bridge are never active together.
  var embedded = params.get('embed') === 'erpcons' || params.get('host') === 'parent'
  var linkPage = Boolean(linkHash) && usable && editorPage && !embedded && !params.has('doc')
  // The link page keeps its token in the address bar, so F5 and copying the URL work (as Google Docs): a fragment
  // reaches no request or Referer. Any other page has no use for a `#link=` fragment and drops it at once.
  if (/^#link=/.test(location.hash) && !linkPage) {
    try { history.replaceState(history.state, '', location.pathname + location.search) } catch (e) { /* not used here either way */ }
  }
  if (!usable || !editorPage || embedded) return
  if (linkPage) {
    online.startLink({ token: linkHash[1], account: account, fetch: window.fetch.bind(window) })
    return
  }
  online.installShare(account)
  if (!params.has('doc')) return
  // Set by the editor's "Chia sẻ" after it saved a local file here (online-share.js); one use only.
  var shareOnOpen = params.get('share') === '1'
  if (params.has('share')) {
    params.delete('share')
    try { history.replaceState(history.state, '', location.pathname + '?' + params.toString()) } catch (e) { /* the URL only matters on reload */ }
  }
  var status = account.status()
  if (status === 'disabled') return
  var dialogs = online.dialogs

  function within(promise, ms) {
    return new Promise(function (resolve) {
      var timer = setTimeout(resolve, ms)
      promise.then(function () { clearTimeout(timer); resolve() }, function () { clearTimeout(timer); resolve() })
    })
  }

  if (status !== 'signed-in') {
    // erpHost must exist before the editor starts, so a sign-in from here reloads the page.
    var signedOut = dialogs.signIn({ onSignIn: function () { account.signIn() } })
    account.onChange(function (snapshot) {
      if (snapshot.status !== 'signed-in') return
      signedOut.close()
      location.reload()
    })
    return
  }
  var docId = params.get('doc')
  var versionParam = params.get('version')
  if (!DOC_ID.test(docId) || (versionParam !== null && !VERSION.test(versionParam))) {
    dialogs.notFound()
    return
  }
  var viewingVersion = versionParam !== null

  var bar = document.querySelector('.erp-shell')
  var indicator = bar ? online.createIndicator(bar) : null
  var modeBadge = bar ? online.createModeBadge(bar) : null
  var docBar = bar && !viewingVersion ? online.createDocBar(bar, { onShare: openShare, onHistory: openHistory }) : null
  var renderQueued = false
  // Coalesced: after a save resolves, the editor's dirty(false) follows at once; showing the state in between
  // would flash "Chưa lưu lên máy chủ".
  function render() {
    if (renderQueued) return
    renderQueued = true
    setTimeout(function () {
      renderQueued = false
      if (indicator) indicator.render(saver.list())
      renderAccess()
    }, 0)
  }
  // The document in the URL speaks for the bar; a copy saved from a conflict takes its place there.
  function primary() { return saver.get(new URLSearchParams(location.search).get('doc')) }
  function renderAccess() {
    var doc = primary()
    if (modeBadge) modeBadge.render(doc && doc.open ? doc.mode : null, liveNotice)
    if (!docBar) return
    var signedIn = doc && doc.open && !doc.accessLost
    docBar.render({ share: signedIn && online.canManageSharing(doc.role) && doc.canShare !== false, history: signedIn && doc.mode === 'edit' })
  }
  var idb = null
  try { idb = window.indexedDB || null } catch (e) { idb = null }
  function user() {
    var current = account.user()
    return current ? current.id : null
  }
  // The account this page opened its documents with; a popup sign-in never reloads, so another one can follow.
  var pageSub = user()
  function sameAccount() {
    var current = user()
    return !current || current === pageSub
  }

  var api = online.createApi(account.apiFetch)
  var pending = online.createPendingStore(idb)
  var saver = online.createSaver({
    api: api, pending: pending, backoff: online.backoff, user: user, onChange: render, onConflict: showConflict,
    onAcknowledged: acknowledge, onAccessLost: function (doc, kind) { accessLost(doc, kind, null) }, viewOnly: viewingVersion
  })
  // Which documents the editor reported open since it was last handed their content (co-editing waits for it).
  var openedIds = {}
  var hostApi = online.createHost({
    save: function (id, bytes, options) {
      try { return cosave ? cosave.save(id, bytes, options) : saver.save(id, bytes, options) } catch (e) {
        console.error('erpHost save failed')
        return Promise.resolve({ status: 'failed', retryable: false, message: online.messages.failed })
      }
    },
    dirty: function (id, dirty) {
      saver.dirty(id, dirty)
      if (!dirty) return
      if (dirtyWaiters[id]) dirtyWaiters[id]()
      flushDowngraded(id, false)
    },
    opened: function (id, ok, reason) {
      openedIds[id] = Boolean(ok)
      if (ok && regions && id === liveId) regions.opened()
      if (ok) return
      var doc = saver.get(id)
      var intake = window.erpIntake
      var key = OPENED_REASONS.indexOf(reason) === -1 ? 'parserFailed' : reason
      var why = intake && reason !== undefined ? ' ' + intake.message(key) : ''
      if (window.erpShellNotice) window.erpShellNotice('Không mở được ' + (doc ? '“' + doc.title + '”' : 'tài liệu') + ' trong công cụ này.' + why, 'alert', 15000)
      saver.closed(id)
    },
    closed: function (id) { saver.closed(id) },
    user: function () { return online.hostUser(account) }
  })
  // Optional in v1: an editor built before acknowledged() stays dirty until its next save.
  function acknowledge(id, revision, version) { hostApi.call('acknowledged', id, revision, version) }
  function deliver(doc) {
    openedIds[doc.docId] = false
    if (regions && doc.docId === liveId) regions.loaded()
    return hostApi.deliver(doc)
  }
  var opener = online.createOpener({
    api: api, saver: saver, pending: pending, dialogs: dialogs, user: user, sameAccount: sameAccount, deliver: deliver,
    signIn: function () { return account.signIn() },
    onAccessLost: accessLost
  })

  function showDoc(id) {
    var next = new URLSearchParams(location.search)
    next.set('doc', id)
    next.delete('version')
    try { history.replaceState(history.state, '', location.pathname + '?' + next.toString()) } catch (e) { /* the URL only matters on reload */ }
    // The copy has its own room.
    if (live && liveId !== id) {
      stopLive()
      startLive(id)
    }
    render()
  }
  function randomKey() {
    if (crypto.randomUUID) return crypto.randomUUID()
    var bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.prototype.map.call(bytes, function (b) { return (b + 256).toString(16).slice(1) }).join('')
  }
  // The copy's outcome in the dialog it came from; the copy then becomes the page's document.
  function copied(dialog) {
    return function (outcome) {
      if (outcome.kind !== 'ok') return dialog.setNote(online.outcomeMessage(outcome))
      dialog.close()
      showDoc(outcome.doc.id)
    }
  }
  function showConflict(doc) {
    // One key per conflict: a retried click after a lost response must not create a second copy.
    var key = randomKey()
    dialogs.conflict(doc.title, {
      onCopy: function (dialog) {
        return opener.saveCopy(doc.id, key, doc.conflict ? doc.conflict.bytes : null, doc.folderId).then(copied(dialog))
      },
      onLatest: function (dialog) {
        return opener.openLatest(doc.id).then(function (outcome) {
          if (outcome.kind !== 'ok') return dialog.setNote(online.outcomeMessage(outcome))
          dialog.close()
        })
      }
    })
  }

  function setAccess(id, mode, canDownload, role) {
    var doc = saver.get(id)
    if (!doc) return
    var changed = doc.mode !== mode || doc.canDownload !== (canDownload !== false)
    saver.setAccess(id, mode, canDownload, role)
    if (changed) hostApi.call('setMode', id, mode, canDownload !== false)
  }
  // docs/erp-host.md, setMode: edits get their save attempt, then the switch, then whatever the switch itself
  // committed (text still in an inline editor) is flushed too.
  var downgrading = {}
  function downgrade(id, mode, canDownload, role) {
    if (downgrading[id]) return downgrading[id]
    var before = saver.get(id)
    var wasDirty = Boolean(before && (before.dirty || before.pending))
    var done = function () { delete downgrading[id] }
    downgrading[id] = flush().then(function () {
      var doc = saver.get(id)
      // A flush refused with 403/404 meanwhile means no access beyond reading, whatever the check saw.
      setAccess(id, doc && doc.accessLost ? 'view' : mode, canDownload, role)
      return doc && doc.dirty ? null : nextDirty(id)
    }).then(function () { return flushDowngraded(id, wasDirty) }).then(done, done)
    return downgrading[id]
  }
  // Forks report the commit of an inline edit asynchronously (Văn bản one frame after setMode).
  var COMMIT_WAIT = 500
  var dirtyWaiters = {}
  function nextDirty(id) {
    return new Promise(function (resolve) {
      var timer = setTimeout(finish, COMMIT_WAIT)
      function finish() {
        clearTimeout(timer)
        if (dirtyWaiters[id] === finish) delete dirtyWaiters[id]
        resolve()
      }
      dirtyWaiters[id] = finish
    })
  }
  var reflushing = {}
  // The second flush of a downgrade; `force` when the document had edits before it, even if they are acknowledged now.
  function flushDowngraded(id, force) {
    var doc = saver.get(id)
    if (!doc || !doc.open || doc.mode === 'edit' || !(doc.dirty || force)) return Promise.resolve()
    if (!reflushing[id]) {
      var done = function () { delete reflushing[id] }
      reflushing[id] = flush().then(done, done)
    }
    return reflushing[id]
  }
  // A save answered 403/404 (or a pending copy can no longer be saved): read-only from now on, and the user's bytes
  // go into a copy in their own root folder if they want (docs/erp-host.md, "Shell responsibilities added in v2").
  function accessLost(doc, kind, bytes) {
    if (!doc) return
    var switched = downgrading[doc.id] || (doc.mode === 'edit' ? downgrade(doc.id, 'view', doc.canDownload) : Promise.resolve())
    return switched.then(function () {
      setAccess(doc.id, 'view', doc.canDownload)
      if (!bytes && !doc.pending) return
      var key = randomKey()
      dialogs.accessLost(doc.title, kind, {
        // The newest bytes at the click: the downgrade's flushes may have added edits after the first refusal.
        onCopy: function (dialog) { return opener.saveCopy(doc.id, key, doc.pending ? doc.pending.bytes : bytes, null).then(copied(dialog)) },
        onDiscard: function (dialog) { return saver.discard(doc.id).then(function () { dialog.close() }) }
      })
    })
  }
  // What the periodic check found out about the page's document.
  function applyAccess(found) {
    var doc = primary()
    if (!doc || !doc.open || viewingVersion) return
    // Already known to be gone (a refused save, or bytes left on this device): the check would only cover the
    // copy offer with "not found".
    if (doc.accessLost === 'notFound') return watcher.stop()
    if (found.kind === 'notFound') {
      // Edits in hand go out first: their 404 then offers the copy. Otherwise there is nothing left to show.
      if (doc.mode === 'edit' && (doc.dirty || doc.pending)) return flush()
      watcher.stop()
      setAccess(doc.id, 'view', doc.canDownload)
      return dialogs.gone(false, false)
    }
    if (found.kind !== 'ok' || found.doc.id !== doc.id || doc.accessLost) return
    var meta = found.doc
    // The live room may narrow the role's mode (its editor slots are taken); it never widens it.
    var mode = online.capMode(online.modeOf(meta.role), liveMode)
    var reader = mode !== 'edit'
    // A reader catches up in place; an editor's newer versions come through the conflict flow as in v1. A co-editing
    // room already brings every change as it happens.
    if ((reader || doc.mode !== 'edit') && meta.version > doc.version && !doc.pending && !(regions && regions.live())) {
      return opener.openLatest(doc.id, true)
    }
    saver.setCanShare(doc.id, meta.canShare)
    if (mode === doc.mode && meta.canDownload === doc.canDownload && meta.role === doc.role) return
    if (online.isDowngrade(doc.mode, mode)) return downgrade(doc.id, mode, meta.canDownload, meta.role)
    setAccess(doc.id, mode, meta.canDownload, meta.role)
  }
  var watcher = online.createWatcher({
    check: function () {
      var doc = primary()
      // Another account's token must never reach this page's document (see the otherAccount dialog).
      if (!doc || account.status() !== 'signed-in' || !sameAccount()) return Promise.resolve({ kind: 'none' })
      return api.getDocument(doc.id)
    },
    onResult: applyAccess
  })

  // The live room (online-live.js): who else is here, and role changes or revocations as they happen. The check above
  // stays as the fallback for whatever the room cannot say (canDownload, can_share) and for a page without a channel.
  var presence = bar && !viewingVersion ? online.createPresence(bar) : null
  var live = null
  var liveId = null
  // Co-editing by region (online-regions.js) and the leader's saves (online-leader.js), for the room's lifetime.
  var regions = null
  var cosave = null
  // The room's narrower mode for this member and its reason, kept across reconnects until the next hello says otherwise.
  var liveMode = null
  var liveNotice = null
  var LIVE_MODES = ['edit', 'comment', 'view']
  function startLive(id) {
    if (live || viewingVersion || typeof window.WebSocket !== 'function') return
    liveId = id
    regions = online.createRegions({
      send: function (message) { return live ? live.send(message) : false },
      host: hostApi,
      editable: function () {
        var doc = saver.get(id)
        return Boolean(doc && doc.open && doc.mode === 'edit' && !doc.accessLost)
      },
      canCursor: function () {
        var doc = saver.get(id)
        return Boolean(doc && doc.open && (doc.mode === 'edit' || doc.mode === 'comment'))
      },
      isOpen: function () { return openedIds[id] === true },
      contentVersion: function () {
        var doc = saver.get(id)
        return doc ? doc.version : null
      },
      reload: function () { return opener.openLatest(id, true) },
      ask: function (list) { return dialogs.regionConflict(list.length) },
      onChange: function () { if (cosave) cosave.update() },
      onRoomChange: function () { if (cosave) cosave.roomChanged() },
      onLeader: function (now) { if (cosave) cosave.leader(now) },
      onSaved: function (seq) { if (cosave) cosave.saved(seq) },
      onSaveRequest: function () { if (cosave) cosave.saveRequest() },
      notice: function (text) { if (window.erpShellNotice) window.erpShellNotice(text, 'alert', 10000) }
    })
    cosave = online.createLeader({ docId: id, saver: saver, regions: regions, host: hostApi, api: api })
    hostApi.useRegions(regions)
    live = online.createLive({
      ticket: function () {
        // Another account's token must never open this page's room (see the otherAccount dialog).
        if (account.status() !== 'signed-in' || !sameAccount()) return Promise.resolve({ kind: 'signIn' })
        return api.createLiveTicket(id)
      },
      connect: function (ticket) { return new window.WebSocket(online.liveUrl(location, id, ticket)) },
      backoff: online.backoff,
      onHello: function (hello) {
        hostApi.call('setClientId', online.clientId)
        online.setEditorLimit(hello.limits)
        if (presence) presence.render(hello.members, hello.you)
        applyLiveMode(hello.mode, hello.notice)
        cosave.greeted()
        regions.hello(hello)
        cosave.presence(hello.members)
      },
      onPresence: function (members) {
        if (presence) presence.render(members, live ? live.you() : null)
        regions.presence(members)
        cosave.presence(members)
      },
      onLeader: function (leader) { regions.leader(leader) },
      onMessage: function (message) { regions.receive(message) },
      onDown: function () {
        regions.down()
        cosave.down()
      },
      onMode: applyLiveMode,
      // Access is gone: the same path as a check that found the document missing.
      onRevoked: function () {
        stopLive()
        applyAccess({ kind: 'notFound' })
      },
      onRefused: function () {
        stopLive()
        watcher.now()
      }
    })
    live.start()
  }
  function stopLive() {
    if (live) live.stop()
    if (cosave) cosave.stop()
    hostApi.useRegions(null)
    live = null
    liveId = null
    regions = null
    cosave = null
    if (presence) presence.clear()
  }
  function applyLiveMode(mode, notice) {
    if (LIVE_MODES.indexOf(mode) === -1) return
    var before = liveNotice
    liveMode = mode
    liveNotice = mode === 'view' && notice === 'editor_limit' ? notice : null
    var doc = primary()
    if (!doc || !doc.open || doc.accessLost || doc.id !== liveId) return render()
    if (liveNotice && !before && window.erpShellNotice) window.erpShellNotice(online.EDITOR_LIMIT_MESSAGE, 'status', 10000)
    if (before && !liveNotice && mode === 'edit' && window.erpShellNotice) window.erpShellNotice('Đã có chỗ trống, bạn có thể sửa tài liệu.', 'status', 6000)
    var target = online.capMode(online.modeOf(doc.role), mode)
    if (target !== doc.mode) {
      // A downgrade goes through flush → setMode → flush; the check then brings role, can_share and canDownload.
      if (online.isDowngrade(doc.mode, target)) downgrade(doc.id, target, doc.canDownload).then(function () { watcher.now() })
      else {
        setAccess(doc.id, target, doc.canDownload)
        watcher.now()
      }
    } else if (online.modeOf(doc.role) !== mode) {
      // The room knows of a role change the page has not read yet.
      watcher.now()
    }
    render()
  }

  var panel = online.createPanel({
    onMessage: function (type) {
      var doc = primary()
      if (type === 'restored' && doc) {
        panel.close()
        opener.openLatest(doc.id, true)
      }
      if (type === 'changed' || type === 'restored') watcher.now()
    }
  })
  function openShare() {
    var doc = primary()
    if (doc) panel.open('share', doc.id)
  }
  // The list must include the edits on screen, so they are saved first.
  function openHistory() {
    var doc = primary()
    if (!doc) return
    if (!saver.busy()) return panel.open('history', doc.id)
    flush().then(function () { panel.open('history', doc.id) })
  }

  // The editor's own "Chia sẻ" (online-share.js): true when it was for this page's document and the share dialog
  // opened, false when it was but this user may not share it, null when it was for another (local) document.
  online.pageShare = function (name) {
    var doc = primary()
    if (!doc || !doc.open || (name !== null && !online.sameDocument(name, doc.title, doc.format))) return null
    if (doc.accessLost || !online.canManageSharing(doc.role) || doc.canShare === false) return false
    openShare()
    return true
  }

  // The editor gets 10 s to hand over its edits, then the saves it started get as long again.
  function flush() {
    if (regions) regions.flush()
    return within(hostApi.flush(), FORK_FLUSH_WAIT).then(function () { return within(saver.idle(), SAVES_WAIT) })
  }
  online.flush = flush

  window.erpHost = hostApi.host

  // Sign-out drops the token, so whatever the editor still holds goes out first (docs/erp-host.md, flush). Bytes
  // the server still has not taken are the account's personal data on this device: the user decides whether they stay.
  var signOut = account.signOut
  account.signOut = function () {
    var sub = user()
    var signOutNow = function () { return signOut.apply(account, arguments) }
    return flush().then(function () { return sub ? pending.list(sub) : [] }).then(function (left) {
      if (!left.length) return signOutNow()
      return new Promise(function (resolve) {
        function choose(run) {
          return function (dialog) {
            dialog.close()
            return Promise.resolve(run()).then(resolve, resolve)
          }
        }
        dialogs.signOutPending({
          onDelete: choose(function () {
            saver.list().forEach(function (doc) { if (doc.sub === sub) saver.discard(doc.id) })
            return pending.removeAll(sub).then(null, function () {}).then(signOutNow)
          }),
          onKeep: choose(signOutNow),
          onCancel: choose(function () { return { status: account.status() } })
        })
      })
    })
  }

  var signedIn = true
  var otherAccount = null
  account.onChange(function (snapshot) {
    var now = snapshot.status === 'signed-in'
    if (now && !sameAccount()) {
      if (!otherAccount) otherAccount = dialogs.otherAccount({ onReload: function () { location.reload() } })
    } else if (now && (!signedIn || otherAccount)) {
      if (otherAccount) otherAccount.close()
      otherAccount = null
      saver.resume()
    }
    // The profile (and its name) may arrive after the first open.
    if (now && sameAccount()) hostApi.call('setUser', online.hostUser(account))
    if (!now) stopLive()
    else if (sameAccount() && !live) {
      var doc = primary()
      if (doc && doc.open && !doc.accessLost) startLive(doc.id)
    }
    signedIn = now
  })
  window.addEventListener('online', function () { if (sameAccount()) saver.resume() })
  // The page may never come back from hidden (mobile tab switch, then kill); pagehide is the last chance.
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') hostApi.flush() })
  window.addEventListener('pagehide', function () { hostApi.flush() })
  window.addEventListener('beforeunload', function (event) {
    if (!saver.busy()) return
    // A save started at pagehide is cancelled with the page a few ms later, often before it leaves the browser;
    // from here it has the whole navigation (and any prompt) to get out.
    hostApi.flush()
    event.preventDefault()
    event.returnValue = ''
  })

  if (viewingVersion) {
    opener.loadVersion(docId, parseInt(versionParam, 10))
  } else {
    opener.load(docId).then(function () {
      watcher.start()
      var doc = primary()
      if (doc && doc.open) startLive(doc.id)
      if (shareOnOpen) online.pageShare(null)
    })
  }
})()
