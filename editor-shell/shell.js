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
  window.addEventListener('TrunkApplicationStarted', function () {
    var note = document.querySelector('[data-erpcons-loading]')
    if (note) note.remove()
  })
  // The page loads before any worker controls it, and a deploy swaps workers mid-visit; so always
  // post to the current controller and re-send everything when a new one takes over.
  function warmUp(container) {
    function send(urls) {
      if (container.controller) container.controller.postMessage({ type: 'erpcons-warm', urls: urls })
    }
    function sendAll() {
      send([location.href].concat(performance.getEntriesByType('resource').map(function (e) { return e.name })))
    }
    container.addEventListener('controllerchange', function () {
      sendAll()
      if (window.erpUpdateActivated) window.erpUpdateActivated()
    })
    // The engine's wasm can finish after `load`.
    if (typeof PerformanceObserver !== 'undefined') {
      new PerformanceObserver(function (list) { send(list.getEntries().map(function (e) { return e.name })) }).observe({ type: 'resource' })
    }
    sendAll()
  }
  function updates(container, registration) {
    var waiting = null
    var notice = null
    var apply = null
    function refresh() {
      if (!apply) return
      var store = window.erpDraftStore
      var busy = store && store.hasPending()
      apply.disabled = Boolean(busy)
      notice.title = busy ? 'Đang giữ bản nháp. Hãy chờ lưu nháp xong rồi cập nhật.' : 'Bản nháp đã được giữ trên thiết bị.'
    }
    function ready(worker) {
      waiting = worker
      if (!notice) {
        var bar = document.querySelector('.erp-shell')
        if (!bar) return
        notice = document.createElement('span')
        notice.className = 'erp-shell__draft erp-shell__draft--warn'
        notice.setAttribute('role', 'status')
        notice.textContent = 'Có bản cập nhật. '
        apply = document.createElement('button')
        apply.type = 'button'
        apply.textContent = 'Cập nhật'
        apply.addEventListener('click', function () {
          refresh()
          if (!apply.disabled && waiting) waiting.postMessage({ type: 'erpcons-apply-update' })
        })
        notice.appendChild(apply)
        bar.appendChild(notice)
        if (window.erpDraftStore) window.erpDraftStore.subscribe(refresh)
      }
      refresh()
    }
    if (registration.waiting) ready(registration.waiting)
    function installing() {
      var worker = registration.installing
      if (worker) worker.addEventListener('statechange', function () {
        if (worker.state === 'installed' && container.controller) ready(registration.waiting || worker)
      })
    }
    installing()
    if (registration.addEventListener) registration.addEventListener('updatefound', installing)
    container.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'erpcons-quota' && window.erpDraftStore) window.erpDraftStore.warnQuota()
    })
    // Activation never replaces the running editor; recovery remains available on the next navigation.
    // The first install also fires controllerchange (clients.claim); only a shown update notice is an update.
    window.erpUpdateActivated = function () {
      if (!notice) return
      waiting = null
      apply = null
      notice.title = ''
      notice.textContent = 'Đã cập nhật nền. Tiếp tục soạn thảo; chưa tải lại trang.'
    }
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      warmUp(navigator.serviceWorker)
      navigator.serviceWorker.register('/sw.js').then(function (registration) { updates(navigator.serviceWorker, registration) }).catch(function () {})
    })
  }
})()
