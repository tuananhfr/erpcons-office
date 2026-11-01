(function () {
  // The document's live room (erpcons-office-server docs/openapi.yaml, "Live channel"): a one-time ticket, then a
  // WebSocket; on any drop a fresh ticket and a reconnect with backoff. The browser answers the server's pings itself.
  // Tickets, tokens, names and document ids never reach a log.
  var online = window.erpOnline = window.erpOnline || {}
  // Idle after five quiet minutes, counted in one-minute steps (no wall clock: timers alone).
  var IDLE_STEP = 60 * 1000
  var IDLE_STEPS = 5
  // A session that lasted this long was healthy: the next drop starts the backoff over.
  var STABLE = 30 * 1000
  // Room full (4029): another member has to leave first, so retrying quickly only adds load.
  var FULL_WAIT = 30 * 1000
  var CLOSE = { normal: 1000, revoked: 4003, full: 4029 }
  var OPEN = 1
  // Co-editing (M4) messages, handed on as they are; the bookkeeping lives in online-regions.js.
  var REGION_TYPES = ['locks', 'lock.granted', 'lock.denied', 'region.update', 'ack', 'cursor', 'region.replayed', 'save.request', 'saved', 'error']

  function noop() {}

  /** `wss://<host>/api/v1/documents/<id>/live?ticket=…` (ws:// on a plain-http preview). */
  online.liveUrl = function (location, id, ticket) {
    var scheme = location.protocol === 'https:' ? 'wss://' : 'ws://'
    return scheme + location.host + '/api/v1/documents/' + encodeURIComponent(id) + '/live?ticket=' + encodeURIComponent(ticket)
  }

  /**
   * deps: { ticket() → Promise<outcome> (online-api.js kinds), connect(ticket) → WebSocket, backoff(attempt, retryAfter),
   * onHello(msg), onPresence(members), onMode(mode, notice), onLeader(id), onRevoked(), onRefused(), onMessage(msg),
   * onDown() }
   * onMessage: the co-editing messages (online-regions.js); onDown: a greeted session ended.
   * onRevoked: the server ended the session because access is gone (bye `revoked`, 4003); onRefused: the ticket was
   * refused with 403/404. Neither reconnects.
   */
  online.createLive = function (deps) {
    var socket = null
    var timer = null
    var running = false
    var finished = false
    var attempt = 0
    var greeted = false
    var stableTimer = null
    var byeReason = null
    var state = 'active'
    var quietSteps = 0
    var idleTimer = null
    var you = null
    var members = []

    function call(name, a, b) {
      try { (deps[name] || noop)(a, b) } catch (e) { console.error('erpOnline live ' + name + ' failed') }
    }
    function schedule(delay) {
      clearTimeout(timer)
      timer = setTimeout(function () { timer = null; connect() }, delay)
    }
    function retry(retryAfter, floor) {
      attempt += 1
      schedule(Math.max(deps.backoff(attempt, retryAfter), floor || 0))
    }
    function end(callback) {
      finished = true
      running = false
      clearTimeout(timer)
      timer = null
      call(callback)
    }

    function connect() {
      if (!running || socket || timer) return
      var pending
      try { pending = Promise.resolve(deps.ticket()) } catch (e) { pending = Promise.resolve({ kind: 'offline' }) }
      // A placeholder so that a second connect() while the ticket is on its way does nothing.
      timer = -1
      pending.then(function (outcome) {
        if (timer === -1) timer = null
        if (!running || socket || timer) return
        if (outcome && outcome.kind === 'ok') return open(outcome.ticket)
        if (outcome && (outcome.kind === 'notFound' || outcome.kind === 'forbidden')) return end('onRefused')
        retry(outcome && outcome.retryAfter)
      }, function () {
        if (timer === -1) timer = null
        if (running) retry(null)
      })
    }

    function open(ticket) {
      var ws
      try { ws = deps.connect(ticket) } catch (e) { return retry(null) }
      socket = ws
      greeted = false
      byeReason = null
      ws.onmessage = function (event) { if (socket === ws) receive(event.data) }
      ws.onclose = function (event) { if (socket === ws) closed(event && event.code) }
      // onclose follows every failed handshake; nothing to do here.
      ws.onerror = noop
    }

    function receive(data) {
      var msg
      try { msg = typeof data === 'string' ? JSON.parse(data) : null } catch (e) { msg = null }
      if (!msg || typeof msg !== 'object' || msg.v !== 1) return
      if (msg.type === 'hello') {
        greeted = true
        clearTimeout(stableTimer)
        stableTimer = setTimeout(function () { attempt = 0 }, STABLE)
        you = typeof msg.you === 'string' ? msg.you : null
        members = Array.isArray(msg.members) ? msg.members : []
        // A new session starts as active on the server; an idle page says so at once.
        if (state !== 'active') send({ type: 'presence', v: 1, state: state })
        call('onHello', msg)
      } else if (msg.type === 'presence') {
        members = Array.isArray(msg.members) ? msg.members : []
        call('onPresence', members)
      } else if (msg.type === 'mode') {
        call('onMode', msg.mode, msg.notice || null)
      } else if (msg.type === 'leader') {
        call('onLeader', typeof msg.leader === 'string' ? msg.leader : null)
      } else if (msg.type === 'bye') {
        byeReason = msg.reason
      } else if (REGION_TYPES.indexOf(msg.type) !== -1) {
        call('onMessage', msg)
      }
    }

    function closed(code) {
      clearTimeout(stableTimer)
      stableTimer = null
      if (greeted) call('onDown')
      greeted = false
      socket = null
      you = null
      members = []
      call('onPresence', members)
      if (!running) return
      if (code === CLOSE.revoked || byeReason === 'revoked') return end('onRevoked')
      retry(null, code === CLOSE.full ? FULL_WAIT : 0)
    }

    function send(message) {
      if (!socket || socket.readyState !== OPEN) return false
      try { socket.send(JSON.stringify(message)) } catch (e) { return false }
      return true
    }
    function setState(next) {
      if (state === next) return
      state = next
      if (greeted) send({ type: 'presence', v: 1, state: next })
    }
    function quietStep() {
      idleTimer = null
      if (!running) return
      quietSteps += 1
      if (quietSteps >= IDLE_STEPS) return setState('idle')
      idleTimer = setTimeout(quietStep, IDLE_STEP)
    }
    function activity() {
      quietSteps = 0
      if (!running || document.visibilityState === 'hidden') return
      setState('active')
      if (!idleTimer) idleTimer = setTimeout(quietStep, IDLE_STEP)
    }

    function leave() {
      clearTimeout(timer)
      timer = null
      var ws = socket
      socket = null
      if (greeted) call('onDown')
      greeted = false
      if (!ws) return
      try {
        if (ws.readyState === OPEN) ws.send(JSON.stringify({ type: 'bye', v: 1 }))
        ws.close(CLOSE.normal)
      } catch (e) { /* already closing */ }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') setState('idle')
      else activity()
    })
    // Capture: the editor's canvas may stop its own events.
    document.addEventListener('pointerdown', activity, true)
    document.addEventListener('keydown', activity, true)
    // Leaving the page says bye, so the others see it at once rather than after the server's 30 s silence.
    window.addEventListener('pagehide', function () { if (running) leave() })
    window.addEventListener('pageshow', function (event) {
      if (running && event && event.persisted) { attempt = 0; connect() }
    })
    window.addEventListener('online', function () {
      if (!running || socket || timer === -1) return
      clearTimeout(timer)
      timer = null
      attempt = 0
      connect()
    })

    return {
      start: function () {
        if (running || finished) return
        running = true
        activity()
        connect()
      },
      stop: function () {
        if (!running) return
        running = false
        finished = true
        clearTimeout(idleTimer)
        idleTimer = null
        clearTimeout(stableTimer)
        leave()
      },
      you: function () { return you },
      members: function () { return members.slice() },
      state: function () { return state },
      connected: function () { return Boolean(socket) && greeted },
      /** Sends one message of a greeted session; false when it could not go out. */
      send: function (message) { return greeted ? send(message) : false }
    }
  }
})()
