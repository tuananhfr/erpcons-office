(function () {
  // `window.erpHost` v1 (docs/erp-host.md): installed before the editor's wasm starts, only for a signed-in user on
  // `/<editor>/?doc=<id>`. Composes online-*.js; ships only with online documents on (src/config/online.ts).
  var EDITORS = ['van-ban', 'bang-tinh', 'trinh-chieu', 'pdf']
  var DOC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  var FORK_FLUSH_WAIT = 10 * 1000
  var SAVES_WAIT = 10 * 1000
  var READY_WAIT = 120 * 1000
  // Intake message keys the editor may give with opened(false); anything else reads as unreadable bytes.
  var OPENED_REASONS = ['unsupported', 'parserFailed']
  var online = window.erpOnline
  var account = window.erpAccount
  var editor = location.pathname.split('/')[1]
  var params = new URLSearchParams(location.search)
  if (!online || !account || typeof account.apiFetch !== 'function' || !params.has('doc')) return
  if (EDITORS.indexOf(editor) === -1 || location.pathname !== '/' + editor + '/') return
  // erpHost and the ERP embed bridge are never active together.
  if (params.get('embed') === 'erpcons' || params.get('host') === 'parent') return
  var status = account.status()
  if (status === 'disabled') return
  var dialogs = online.dialogs

  function noop() {}
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
  if (!DOC_ID.test(docId)) {
    dialogs.notFound()
    return
  }

  var bar = document.querySelector('.erp-shell')
  var indicator = bar ? online.createIndicator(bar) : null
  var renderQueued = false
  // Coalesced: after a save resolves, the editor's dirty(false) follows at once; showing the state in between
  // would flash "Chưa lưu lên máy chủ".
  function render() {
    if (!indicator || renderQueued) return
    renderQueued = true
    setTimeout(function () {
      renderQueued = false
      indicator.render(saver.list())
    }, 0)
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
  var handlers = null
  var saver = online.createSaver({
    api: api, pending: pending, backoff: online.backoff, user: user, onChange: render, onConflict: showConflict, onAcknowledged: acknowledge
  })
  // Optional in v1: an editor built before acknowledged() stays dirty until its next save.
  function acknowledge(id, revision, version) {
    if (!handlers || typeof handlers.acknowledged !== 'function') return
    try { handlers.acknowledged(id, revision, version) } catch (e) { console.error('erpHost acknowledged handler failed') }
  }

  var waiting = []
  var readyTimer = null
  function callOpen(doc) {
    try { handlers.open(doc) } catch (e) { console.error('erpHost open handler failed') }
  }
  function deliver(doc) {
    if (handlers) return callOpen(doc)
    waiting.push(doc)
    if (!readyTimer) {
      readyTimer = setTimeout(function () {
        var intake = window.erpIntake
        if (!handlers && window.erpShellNotice) window.erpShellNotice(intake ? intake.message('notReady') : 'Công cụ chưa sẵn sàng.', 'alert', 15000)
      }, READY_WAIT)
    }
  }
  var opener = online.createOpener({ api: api, saver: saver, pending: pending, dialogs: dialogs, user: user, sameAccount: sameAccount, deliver: deliver, signIn: function () { return account.signIn() } })

  function showDoc(id) {
    var next = new URLSearchParams(location.search)
    next.set('doc', id)
    try { history.replaceState(history.state, '', location.pathname + '?' + next.toString()) } catch (e) { /* the URL only matters on reload */ }
  }
  function randomKey() {
    if (crypto.randomUUID) return crypto.randomUUID()
    var bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.prototype.map.call(bytes, function (b) { return (b + 256).toString(16).slice(1) }).join('')
  }
  function showConflict(doc) {
    // One key per conflict: a retried click after a lost response must not create a second copy.
    var key = randomKey()
    dialogs.conflict(doc.title, {
      onCopy: function (dialog) {
        return opener.saveCopy(doc.id, key).then(function (outcome) {
          if (outcome.kind !== 'ok') return dialog.setNote(online.outcomeMessage(outcome))
          dialog.close()
          showDoc(outcome.doc.id)
        })
      },
      onLatest: function (dialog) {
        return opener.openLatest(doc.id).then(function (outcome) {
          if (outcome.kind !== 'ok') return dialog.setNote(online.outcomeMessage(outcome))
          dialog.close()
        })
      }
    })
  }

  function flushFork() {
    if (!handlers || typeof handlers.flush !== 'function') return Promise.resolve()
    try { return Promise.resolve(handlers.flush()).then(noop, noop) } catch (e) { return Promise.resolve() }
  }
  // The editor gets 10 s to hand over its edits, then the saves it started get as long again.
  function flush() {
    return within(flushFork(), FORK_FLUSH_WAIT).then(function () { return within(saver.idle(), SAVES_WAIT) })
  }
  online.flush = flush

  window.erpHost = Object.freeze({
    version: 1,
    ready: function (given) {
      if (handlers || !given || typeof given.open !== 'function') return
      handlers = given
      clearTimeout(readyTimer)
      waiting.splice(0).forEach(callOpen)
    },
    save: function (id, bytes, options) {
      try { return saver.save(String(id), bytes, options) } catch (e) {
        console.error('erpHost save failed')
        return Promise.resolve({ status: 'failed', retryable: false, message: online.messages.failed })
      }
    },
    dirty: function (id, dirty) { saver.dirty(String(id), dirty) },
    opened: function (id, ok, reason) {
      if (ok) return
      var doc = saver.get(String(id))
      var intake = window.erpIntake
      var key = OPENED_REASONS.indexOf(reason) === -1 ? 'parserFailed' : reason
      var why = intake && reason !== undefined ? ' ' + intake.message(key) : ''
      if (window.erpShellNotice) window.erpShellNotice('Không mở được ' + (doc ? '“' + doc.title + '”' : 'tài liệu') + ' trong công cụ này.' + why, 'alert', 15000)
      saver.closed(String(id))
    },
    closed: function (id) { saver.closed(String(id)) }
  })

  // Sign-out drops the token, so whatever the editor still holds goes out first (docs/erp-host.md, flush).
  var signOut = account.signOut
  account.signOut = function () { return flush().then(function () { return signOut() }) }

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
    signedIn = now
  })
  window.addEventListener('online', function () { if (sameAccount()) saver.resume() })
  // The page may never come back from hidden (mobile tab switch, then kill); pagehide is the last chance.
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushFork() })
  window.addEventListener('pagehide', function () { flushFork() })
  window.addEventListener('beforeunload', function (event) {
    if (!saver.busy()) return
    event.preventDefault()
    event.returnValue = ''
  })

  opener.load(docId)
})()
