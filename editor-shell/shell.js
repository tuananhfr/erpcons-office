(function () {
  var supported = false
  try { supported = Boolean(navigator.gpu) } catch (e) { supported = false }
  if (!supported) {
    try {
      var gl = document.createElement('canvas').getContext('webgl2')
      supported = Boolean(gl)
      var lose = gl && gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
    } catch (e) { supported = false }
  }
  if (!supported) document.documentElement.classList.add('erp-shell-unsupported')
  // The page loads before any worker controls it, and a deploy swaps workers mid-visit; so always
  // post to the current controller and re-send everything when a new one takes over.
  function warmUp(container) {
    function send(urls) {
      if (container.controller) container.controller.postMessage({ type: 'erpcons-warm', urls: urls })
    }
    function sendAll() {
      send([location.href].concat(performance.getEntriesByType('resource').map(function (e) { return e.name })))
    }
    container.addEventListener('controllerchange', sendAll)
    // The engine's wasm can finish after `load`.
    if (typeof PerformanceObserver !== 'undefined') {
      new PerformanceObserver(function (list) { send(list.getEntries().map(function (e) { return e.name })) }).observe({ type: 'resource' })
    }
    sendAll()
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      warmUp(navigator.serviceWorker)
      navigator.serviceWorker.register('/sw.js').catch(function () {})
    })
  }
})()
