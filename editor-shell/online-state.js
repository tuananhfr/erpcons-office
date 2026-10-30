(function () {
  // Save state of online documents (spec §07) and its badge in the shell bar, next to the editor name.
  var online = window.erpOnline = window.erpOnline || {}
  var LABELS = { LOCAL_ONLY: 'Chưa lưu lên máy chủ', SAVING: 'Đang lưu…', SERVER_DURABLE: 'Đã lưu' }
  var SHORT = { LOCAL_ONLY: 'Chưa lưu', SAVING: 'Đang lưu…', SERVER_DURABLE: 'Đã lưu', ERROR: 'Lỗi lưu' }
  var TONES = { LOCAL_ONLY: 'warn', SAVING: 'saving', SERVER_DURABLE: 'ok', ERROR: 'alert' }
  var RANK = { SERVER_DURABLE: 0, LOCAL_ONLY: 1, SAVING: 2, ERROR: 3 }
  var CONFLICT = 'Tài liệu đã được lưu ở nơi khác'

  /** { state, message } of one tracked document (online-saver.js shape). */
  online.saveStateOf = function (doc) {
    if (doc.conflict) return { state: 'ERROR', message: CONFLICT }
    if (doc.inflight > 0) return { state: 'SAVING', message: LABELS.SAVING }
    if (doc.error && !doc.error.offline) return { state: 'ERROR', message: doc.error.message }
    if (doc.dirty || doc.pending) {
      return { state: 'LOCAL_ONLY', message: doc.error && doc.error.offline ? LABELS.LOCAL_ONLY + ' · ' + doc.error.message : LABELS.LOCAL_ONLY }
    }
    return { state: 'SERVER_DURABLE', message: LABELS.SERVER_DURABLE }
  }

  online.createIndicator = function (bar) {
    var badge = document.createElement('span')
    badge.className = 'erp-shell__draft erp-shell__save'
    badge.setAttribute('data-erp-save-state', '')
    badge.hidden = true
    // The state comes first and keeps its width; only the document name gives way (shell.css).
    var full = document.createElement('span')
    full.className = 'erp-shell__draft-full'
    var status = document.createElement('span')
    status.className = 'erp-shell__save-status'
    var name = document.createElement('span')
    name.className = 'erp-shell__save-doc'
    full.appendChild(status)
    full.appendChild(name)
    var brief = document.createElement('span')
    brief.className = 'erp-shell__draft-short'
    badge.appendChild(full)
    badge.appendChild(brief)
    bar.insertBefore(badge, bar.querySelector('.erp-shell__nav'))

    // Several documents: the one that most needs attention speaks for all.
    function render(docs) {
      var worst = null
      docs.forEach(function (doc) {
        var view = online.saveStateOf(doc)
        if (!worst || RANK[view.state] > RANK[worst.view.state]) worst = { doc: doc, view: view }
      })
      badge.hidden = !worst
      if (!worst) return
      var state = worst.view.state
      var text = worst.doc.title + ': ' + worst.view.message
      badge.className = 'erp-shell__draft erp-shell__save erp-shell__draft--' + TONES[state]
      badge.setAttribute('data-erp-save-state', state)
      // Errors interrupt; routine saves every few seconds must not chatter to screen readers.
      badge.setAttribute('role', state === 'ERROR' ? 'alert' : 'status')
      badge.setAttribute('aria-live', state === 'ERROR' ? 'assertive' : 'off')
      // The visible parts may be cut; the whole sentence stays in the tooltip and the accessible name.
      badge.title = text
      badge.setAttribute('aria-label', text)
      status.textContent = worst.view.message
      name.textContent = worst.doc.title
      brief.textContent = SHORT[state]
    }
    return { render: render, element: badge }
  }
})()
