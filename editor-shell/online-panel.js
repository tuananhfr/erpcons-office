(function () {
  // The share dialog and the version history over the editor: the same React panels as /tai-lieu/, loaded from
  // /tai-lieu/chia-se/ and /tai-lieu/lich-su/ in a same-origin frame, so there is one implementation of each.
  // The frame talks back with postMessage `{ erpDocsPanel: 'close' | 'restored' | 'changed' }`.
  var online = window.erpOnline = window.erpOnline || {}
  var PANELS = {
    share: { path: '/tai-lieu/chia-se/', title: 'Chia sẻ' },
    history: { path: '/tai-lieu/lich-su/', title: 'Lịch sử phiên bản' }
  }

  /** deps: { onMessage(type) } for every message but 'close'. */
  online.createPanel = function (deps) {
    var current = null

    function close() {
      if (!current) return
      current.overlay.remove()
      current = null
      var canvas = document.querySelector('canvas')
      if (canvas) canvas.focus()
    }
    function open(kind, docId) {
      var panel = PANELS[kind]
      if (!panel) return
      close()
      var overlay = document.createElement('div')
      overlay.className = 'erp-online-panel'
      overlay.setAttribute('data-erp-online-panel', kind)
      var frame = document.createElement('iframe')
      frame.className = 'erp-online-panel__frame'
      frame.title = panel.title
      frame.src = panel.path + '?doc=' + encodeURIComponent(docId)
      overlay.appendChild(frame)
      document.body.appendChild(overlay)
      current = { kind: kind, overlay: overlay, frame: frame }
      frame.addEventListener('load', function () { if (current && current.frame === frame) frame.focus() })
    }
    // Only the frame this shell opened, on this origin, may drive it.
    window.addEventListener('message', function (event) {
      if (!current || event.origin !== location.origin || event.source !== current.frame.contentWindow) return
      var type = event.data && typeof event.data.erpDocsPanel === 'string' ? event.data.erpDocsPanel : null
      if (!type) return
      if (type === 'close') return close()
      deps.onMessage(type)
    })
    return { open: open, close: close, current: function () { return current ? current.kind : null } }
  }
})()
