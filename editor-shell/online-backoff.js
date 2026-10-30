(function () {
  // Retry delays for saves to the Office API (docs/erp-host.md): offline, 429 and 503.
  var online = window.erpOnline = window.erpOnline || {}
  var FIRST = 1000
  var MAX = 60 * 1000
  var RETRY_AFTER_MAX = 5 * 60 * 1000

  // Half fixed, half jitter: tabs that lost the network together must not come back in lockstep, and the
  // fixed half keeps a flapping connection from hammering the server.
  online.backoff = function (attempt, retryAfterSeconds) {
    if (typeof retryAfterSeconds === 'number' && retryAfterSeconds >= 0) return Math.min(retryAfterSeconds * 1000, RETRY_AFTER_MAX)
    var ceiling = Math.min(MAX, FIRST * Math.pow(2, Math.max(0, attempt - 1)))
    return ceiling / 2 + Math.random() * (ceiling / 2)
  }
})()
