(function () {
  // Dialogs of online documents: conflict, unsaved local copy, not found, offline, sign-in. One at a time; the
  // look is the crash dialog's (shell.css), one layer below it.
  var online = window.erpOnline = window.erpOnline || {}
  var current = null

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  function quoted(title) { return '“' + title + '”' }
  function time(at) { return new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }
  function when(at) {
    var date = new Date(at)
    return date.toDateString() === new Date().toDateString() ? 'hôm nay lúc ' + time(at) : time(at) + ', ' + date.toLocaleDateString('vi-VN')
  }
  function focusEditor() {
    var canvas = document.querySelector('canvas')
    if (canvas) canvas.focus()
  }

  /**
   * options: { id, title, paragraphs, actions: [{ label, kind, onClick } | { label, kind, href }], onEscape }.
   * onClick may return a promise: the buttons stay disabled until it settles.
   */
  function open(options) {
    if (current) current.close()
    var overlay = el('div', 'erp-online')
    overlay.setAttribute('data-erp-online-dialog', options.id)
    var box = el('section', 'erp-online__box')
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-modal', 'true')
    box.setAttribute('aria-labelledby', 'erp-online-title')
    box.setAttribute('aria-describedby', 'erp-online-body')
    var heading = el('h2', 'erp-online__title', options.title)
    heading.id = 'erp-online-title'
    var body = el('div', 'erp-online__body')
    body.id = 'erp-online-body'
    options.paragraphs.forEach(function (text) { body.appendChild(el('p', '', text)) })
    var note = el('p', 'erp-online__note')
    note.setAttribute('role', 'alert')
    note.hidden = true
    var actions = el('div', 'erp-online__actions')
    var buttons = []
    var dialog = null
    options.actions.forEach(function (action) {
      var node
      if (action.href) {
        node = el('a', 'erp-online__button erp-online__button--' + action.kind, action.label)
        node.href = action.href
      } else {
        node = el('button', 'erp-online__button erp-online__button--' + action.kind, action.label)
        node.type = 'button'
        node.addEventListener('click', function () {
          if (dialog.busy) return
          var result = action.onClick(dialog)
          if (result && typeof result.then === 'function') {
            dialog.setBusy(true)
            result.then(function () { dialog.setBusy(false) }, function () { dialog.setBusy(false) })
          }
        })
      }
      buttons.push(node)
      actions.appendChild(node)
    })
    box.appendChild(heading)
    box.appendChild(body)
    box.appendChild(note)
    box.appendChild(actions)
    overlay.appendChild(box)

    function keepFocus(event) {
      if (current === dialog && !overlay.contains(event.target) && buttons[0]) buttons[0].focus()
    }
    function onKey(event) {
      // The editor under the dialog must not receive what is typed here.
      event.stopPropagation()
      if (event.key === 'Escape' && options.onEscape) { event.preventDefault(); options.onEscape(dialog); return }
      if (event.key !== 'Tab' || !buttons.length) return
      var first = buttons[0]
      var last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    dialog = {
      busy: false,
      element: overlay,
      close: function () {
        if (current !== dialog) return
        current = null
        overlay.remove()
        document.removeEventListener('focusin', keepFocus, true)
        focusEditor()
      },
      setBusy: function (busy) {
        dialog.busy = busy
        buttons.forEach(function (node) { if (node.tagName !== 'A') node.disabled = busy })
        box.setAttribute('aria-busy', busy ? 'true' : 'false')
      },
      setNote: function (text) {
        note.textContent = text || ''
        note.hidden = !text
      }
    }
    current = dialog
    document.body.appendChild(overlay)
    document.addEventListener('focusin', keepFocus, true)
    overlay.addEventListener('keydown', onKey)
    if (buttons[0]) buttons[0].focus()
    return dialog
  }

  function close(dialog) { dialog.close() }

  online.dialogs = {
    open: open,
    current: function () { return current },
    conflict: function (title, handlers) {
      return open({
        id: 'conflict',
        title: 'Tài liệu đã được lưu ở nơi khác',
        paragraphs: [
          'Có người hoặc một tab khác đã lưu ' + quoted(title) + ' sau khi bạn mở. Bản của bạn chưa ghi đè lên bản đó.',
          '“Mở bản mới nhất” sẽ bỏ các thay đổi chưa lưu của bạn.'
        ],
        actions: [
          { label: 'Lưu bản của tôi thành bản sao', kind: 'primary', onClick: handlers.onCopy },
          { label: 'Mở bản mới nhất', kind: 'quiet', onClick: handlers.onLatest }
        ]
      })
    },
    // record: the pending-store entry; serverVersion is null when the server could not be reached.
    pending: function (record, serverVersion, handlers) {
      var paragraphs = ['Thiết bị này còn giữ một bản của ' + quoted(record.title) + ' chưa lưu lên máy chủ (' + when(record.savedAt) + ').']
      if (serverVersion === null) paragraphs.push(online.messages.offline + '. Bạn vẫn mở được bản này; Văn phòng sẽ lưu khi có mạng.')
      else if (serverVersion > record.baseVersion) paragraphs.push('Trên máy chủ đã có bản mới hơn. Khi lưu, Văn phòng sẽ hỏi bạn giữ bản nào.')
      var actions = [{ label: 'Khôi phục bản chưa lưu', kind: 'primary', onClick: handlers.onRestore }]
      if (serverVersion === null) actions.push({ label: 'Thử lại', kind: 'quiet', onClick: handlers.onRetry })
      else {
        paragraphs.push('Nếu mở bản trên máy chủ, bản chưa lưu này sẽ bị bỏ.')
        actions.push({ label: 'Mở bản trên máy chủ', kind: 'quiet', onClick: handlers.onDiscard })
      }
      return open({ id: 'pending', title: 'Có bản chưa lưu lên máy chủ', paragraphs: paragraphs, actions: actions })
    },
    notFound: function () {
      return open({
        id: 'not-found',
        title: online.messages.notFound,
        paragraphs: ['Kiểm tra lại đường liên kết, hoặc mở tài liệu từ danh sách tài liệu của bạn.'],
        actions: [{ label: 'Về trang chủ', kind: 'primary', href: '/' }, { label: 'Đóng', kind: 'quiet', onClick: close }],
        onEscape: close
      })
    },
    // title: "Không kết nối được máy chủ", or the server's own message when it answered with an error.
    unreachable: function (title, handlers) {
      return open({
        id: 'unreachable',
        title: title,
        paragraphs: ['Chưa mở được tài liệu. Kiểm tra mạng rồi thử lại.'],
        actions: [{ label: 'Thử lại', kind: 'primary', onClick: handlers.onRetry }, { label: 'Đóng', kind: 'quiet', onClick: close }],
        onEscape: close
      })
    },
    signIn: function (handlers) {
      return open({
        id: 'sign-in',
        title: 'Cần đăng nhập để mở tài liệu này',
        paragraphs: ['Tài liệu này được lưu trên máy chủ. Hãy đăng nhập PI ID để mở và lưu nó.'],
        actions: [{ label: 'Đăng nhập', kind: 'primary', onClick: handlers.onSignIn }, { label: 'Đóng', kind: 'quiet', onClick: close }],
        onEscape: close
      })
    }
  }
})()
