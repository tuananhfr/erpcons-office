(function () {
  // The online document's buttons in the shell bar: Thêm nhận xét, Nhận xét, Chia sẻ, Lịch sử phiên bản (signed-in
  // documents) and Tải về (public link page). Only the buttons the caller's role allows are shown.
  var online = window.erpOnline = window.erpOnline || {}
  // bootstrap-icons 1.13.1 (MIT), the set the site renders everywhere else.
  var ICONS = {
    comment: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/></svg>',
    comments: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4.414A2 2 0 0 0 3 11.586l-2 2V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v12.793a.5.5 0 0 0 .854.353l2.853-2.853A1 1 0 0 1 4.414 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z"/><path d="M3 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5M3 6a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 6m0 2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5"/></svg>',
    share: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.5 2.5 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5m-8.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m11 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"/></svg>',
    history: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z"/><path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z"/><path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5"/></svg>',
    download: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/></svg>'
  }
  var BUTTONS = [
    { key: 'comment', label: 'Thêm nhận xét', name: 'Thêm nhận xét (Ctrl+Alt+M)' },
    { key: 'comments', label: 'Nhận xét', name: 'Nhận xét', toggle: true },
    { key: 'share', label: 'Chia sẻ', name: 'Chia sẻ tài liệu', primary: true },
    { key: 'history', label: 'Lịch sử', name: 'Lịch sử phiên bản' },
    { key: 'download', label: 'Tải về', name: 'Tải tệp về máy' }
  ]

  /**
   * handlers: { onComment, onComments, onShare, onHistory, onDownload }; render({ comment, comments, share, history,
   * download }) shows the allowed ones; `commentCount` and `commentsOpen` decorate the Nhận xét button.
   */
  online.createDocBar = function (bar, handlers) {
    var group = document.createElement('div')
    group.className = 'erp-shell__online'
    group.setAttribute('data-erp-online-actions', '')
    group.hidden = true
    var buttons = {}
    var callbacks = { comment: handlers.onComment, comments: handlers.onComments, share: handlers.onShare, history: handlers.onHistory, download: handlers.onDownload }
    var count = document.createElement('span')
    count.className = 'erp-shell__online-count'
    count.setAttribute('data-erp-online-count', '')
    count.hidden = true
    BUTTONS.forEach(function (spec) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'erp-shell__online-btn' + (spec.primary ? ' erp-shell__online-btn--primary' : '')
      button.setAttribute('data-erp-online-' + spec.key, '')
      button.setAttribute('aria-label', spec.name)
      button.title = spec.name
      button.hidden = true
      var icon = document.createElement('span')
      icon.className = 'erp-shell__online-icon'
      icon.innerHTML = ICONS[spec.key]
      var text = document.createElement('span')
      text.className = 'erp-shell__online-label'
      text.textContent = spec.label
      button.appendChild(icon)
      button.appendChild(text)
      if (spec.toggle) {
        button.setAttribute('aria-pressed', 'false')
        button.appendChild(count)
      }
      button.addEventListener('click', function () { if (callbacks[spec.key]) callbacks[spec.key]() })
      buttons[spec.key] = button
      group.appendChild(button)
    })
    bar.insertBefore(group, bar.querySelector('.erp-shell__nav'))
    return {
      element: group,
      render: function (allowed) {
        var any = false
        BUTTONS.forEach(function (spec) {
          var show = Boolean(allowed && allowed[spec.key] && callbacks[spec.key])
          buttons[spec.key].hidden = !show
          any = any || show
        })
        group.hidden = !any
        var open = allowed && typeof allowed.commentCount === 'number' ? allowed.commentCount : 0
        count.hidden = !open
        count.textContent = open > 99 ? '99+' : open ? String(open) : ''
        buttons.comments.setAttribute('aria-pressed', allowed && allowed.commentsOpen ? 'true' : 'false')
        buttons.comments.setAttribute('aria-label', open ? 'Nhận xét, ' + open + ' đang mở' : 'Nhận xét')
      }
    }
  }
})()
