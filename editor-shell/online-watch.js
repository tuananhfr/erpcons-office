(function () {
  // Re-reads a document's metadata while it is open: a changed role reaches the editor as setMode, a newer version
  // reaches a read-only reader in place, and a removed permission shows at the next check. Phase 2 has no live channel
  // yet (plan §9), so this polls, and only while the page is visible.
  var online = window.erpOnline = window.erpOnline || {}
  var INTERVAL = 30 * 1000

  function noop() {}

  /** deps: { check() → Promise<outcome>, onResult(outcome), interval? } */
  online.createWatcher = function (deps) {
    var interval = deps.interval || INTERVAL
    var timer = null
    var running = false
    var started = false

    function schedule() {
      clearTimeout(timer)
      timer = started ? setTimeout(tick, interval) : null
    }
    function tick() {
      if (!started || running) return
      if (document.visibilityState === 'hidden') return schedule()
      running = true
      var settled = function () { running = false; schedule() }
      var checked
      try { checked = deps.check() } catch (e) { checked = Promise.reject(e) }
      checked.then(function (outcome) { deps.onResult(outcome) }).then(null, noop).then(settled)
    }
    document.addEventListener('visibilitychange', function () {
      if (started && document.visibilityState === 'visible') tick()
    })
    return {
      start: function () {
        if (started) return
        started = true
        schedule()
      },
      stop: function () {
        started = false
        clearTimeout(timer)
        timer = null
      },
      /** Checks now, e.g. after the user changed sharing in a panel. */
      now: tick
    }
  }
})()
