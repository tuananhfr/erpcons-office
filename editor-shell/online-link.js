(function () {
  // The public view link `/<editor>/#link=<token>` (plan §8): opens without signing in, read-only, with "Tải về" when
  // the owner allows downloads. The token stays in the address bar's fragment (online.js), which no request carries;
  // the shell never logs or stores it and sends it only in the X-Link-Token header to this origin's API.
  var online = window.erpOnline = window.erpOnline || {}

  function noop() {}

  function saveFile(bytes, name) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
    var anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 60 * 1000)
  }

  /** deps: { token, account (window.erpAccount or null), fetch } */
  online.startLink = function (deps) {
    var dialogs = online.dialogs
    var account = deps.account
    var linkApi = online.createLinkApi(deps.fetch)
    var token = deps.token
    var current = null
    var bar = document.querySelector('.erp-shell')
    var badge = bar ? online.createModeBadge(bar) : null
    var docBar = bar ? online.createDocBar(bar, { onDownload: download }) : null
    var presence = bar ? online.createPresence(bar) : null
    var live = null
    // A link holder only watches: remote region updates, locks and cursors reach the editor, nothing goes out.
    var regions = null
    var contentOpen = false

    var hostApi = online.createHost({
      save: function () { return Promise.resolve({ status: 'failed', retryable: false, message: online.messages.readOnly }) },
      dirty: noop,
      opened: function (id, ok) {
        contentOpen = Boolean(ok)
        if (ok && regions) regions.opened()
        if (ok || !window.erpShellNotice) return
        var intake = window.erpIntake
        window.erpShellNotice('Không mở được tài liệu trong công cụ này.' + (intake ? ' ' + intake.message('parserFailed') : ''), 'alert', 15000)
      },
      closed: noop,
      // Anonymous by design: whoever is signed in, nothing on this page is theirs to author.
      user: function () { return null }
    })
    window.erpHost = hostApi.host

    function download() {
      if (!current || !current.doc.canDownload) return
      saveFile(current.bytes, current.doc.title + '.' + current.doc.format)
    }
    function show(found, preserveView) {
      current = found
      var meta = { title: found.doc.title, format: found.doc.format, mode: 'view', canDownload: found.doc.canDownload }
      contentOpen = false
      if (regions) regions.loaded()
      hostApi.deliver(online.hostDoc(found.doc.id, meta, found.bytes, found.version, preserveView))
      if (badge) badge.render('view')
      if (docBar) docBar.render({ download: found.doc.canDownload })
    }
    function fetchBoth() {
      return Promise.all([linkApi.getLink(token), linkApi.getLinkContent(token)]).then(function (results) {
        var meta = results[0]
        var content = results[1]
        if (meta.kind === 'notFound' || content.kind === 'notFound') return { kind: 'notFound' }
        if (meta.kind !== 'ok') return meta
        if (content.kind !== 'ok') return content
        return { kind: 'ok', doc: meta.doc, bytes: content.bytes, version: content.version }
      })
    }
    function load() {
      return fetchBoth().then(function (found) {
        if (found.kind === 'notFound') return dialogs.gone(true, true)
        if (found.kind !== 'ok') {
          return dialogs.unreachable(online.outcomeMessage(found), { onRetry: function (dialog) { dialog.close(); return load() } })
        }
        show(found, false)
        watcher.start()
        startLive(found.doc.id)
      })
    }
    // The room shows a link holder to the others without a name, and shows it nobody's name either (server rule).
    function startLive(id) {
      if (live || typeof window.WebSocket !== 'function') return
      regions = online.createRegions({
        send: function (message) { return live ? live.send(message) : false },
        host: hostApi,
        editable: function () { return false },
        canCursor: function () { return false },
        isOpen: function () { return contentOpen },
        contentVersion: function () { return current ? current.version : null },
        reload: function () { return fetchBoth().then(function (found) { if (found.kind === 'ok') show(found, true) }) },
        ask: function () { return Promise.resolve('theirs') },
        onChange: noop, onRoomChange: noop, onLeader: noop, onSaved: noop, onSaveRequest: noop, notice: noop
      })
      hostApi.useRegions(regions)
      live = online.createLive({
        ticket: function () { return linkApi.createLiveTicket(token, id) },
        connect: function (ticket) { return new window.WebSocket(online.liveUrl(location, id, ticket)) },
        backoff: online.backoff,
        onHello: function (hello) {
          hostApi.call('setClientId', online.clientId)
          if (presence) presence.render(hello.members, hello.you)
          regions.hello(hello)
        },
        onPresence: function (members) {
          if (presence) presence.render(members, live ? live.you() : null)
          regions.presence(members)
        },
        onLeader: function (leader) { regions.leader(leader) },
        onMessage: function (message) { regions.receive(message) },
        onDown: function () { regions.down() },
        onRevoked: function () { stopLive(); gone() },
        onRefused: function () { stopLive(); watcher.now() }
      })
      live.start()
    }
    function stopLive() {
      if (live) live.stop()
      hostApi.useRegions(null)
      regions = null
      if (presence) presence.clear()
    }
    function gone() {
      watcher.stop()
      dialogs.gone(true, false)
    }

    var watcher = online.createWatcher({
      check: function () { return linkApi.getLink(token) },
      onResult: function (outcome) {
        if (outcome.kind === 'notFound') {
          stopLive()
          gone()
          return
        }
        if (outcome.kind !== 'ok' || !current) return
        if (outcome.doc.canDownload !== current.doc.canDownload) {
          current.doc.canDownload = outcome.doc.canDownload
          hostApi.call('setMode', current.doc.id, 'view', outcome.doc.canDownload)
          if (docBar) docBar.render({ download: outcome.doc.canDownload })
        }
        if (outcome.doc.version > current.version && !(regions && regions.live())) {
          return fetchBoth().then(function (found) { if (found.kind === 'ok') show(found, true) })
        }
      }
    })

    // Signing in here: someone with their own access to the document continues on its signed-in page (their role,
    // their name); anyone else stays on the link view. Only the document id goes into that URL, never the token.
    var signedIn = Boolean(account) && account.status() === 'signed-in'
    var checking = false
    function continueSignedIn() {
      if (checking || !current) return
      checking = true
      var id = current.doc.id
      online.createApi(account.apiFetch).getDocument(id).then(function (found) {
        if (found.kind === 'ok' && found.doc.id === id) location.assign(location.pathname + '?doc=' + encodeURIComponent(id))
      }, noop).then(function () { checking = false })
    }
    if (account && typeof account.onChange === 'function' && typeof account.apiFetch === 'function') {
      account.onChange(function (snapshot) {
        var now = Boolean(snapshot) && snapshot.status === 'signed-in'
        if (now && !signedIn) continueSignedIn()
        signedIn = now
      })
    }
    if (!online.isLinkToken(token)) {
      dialogs.gone(true, true)
      return
    }
    load()
  }
})()
