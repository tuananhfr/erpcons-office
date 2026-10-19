(function () {
  var store = window.erpDraftStore
  var bar = document.querySelector('.erp-shell')
  if (!store || !bar) return

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  function button(text, kind, onClick) {
    var node = el('button', 'erp-drafts__button erp-drafts__button--' + kind, text)
    node.type = 'button'
    node.addEventListener('click', onClick)
    return node
  }
  function time(at) {
    return new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }
  function when(at) {
    var date = new Date(at)
    var today = new Date()
    var sameDay = date.toDateString() === today.toDateString()
    return sameDay ? 'hôm nay lúc ' + time(at) : time(at) + ', ' + date.toLocaleDateString('vi-VN')
  }
  function size(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'
  }

  var SAVE_KEY = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘S' : 'Ctrl+S'

  var STATUS = {
    saved: { text: function (s) { return 'Đã lưu bản nháp trên thiết bị · ' + time(s.at) }, short: 'Đã lưu nháp', tone: 'ok' },
    nearFull: { text: function (s) { return 'Đã lưu bản nháp · bộ nhớ trình duyệt sắp đầy · ' + time(s.at) }, short: 'Bộ nhớ sắp đầy', tone: 'warn' },
    quota: { text: function () { return 'Bộ nhớ trình duyệt đầy: bản nháp mới nhất chưa được lưu. Hãy bấm Lưu (' + SAVE_KEY + ') để tải bản sao.' }, short: 'Bộ nhớ đầy', tone: 'alert' },
    error: { text: function () { return 'Không lưu được bản nháp trên thiết bị. Hãy bấm Lưu (' + SAVE_KEY + ') để tải bản sao.' }, short: 'Lỗi lưu nháp', tone: 'alert' },
    unavailable: { text: function () { return 'Trình duyệt không cho lưu bản nháp trên thiết bị. Nhớ bấm Lưu (' + SAVE_KEY + ') thường xuyên.' }, short: 'Không lưu nháp', tone: 'alert' },
  }
  var NOT_A_FILE = 'Bản nháp chỉ nằm trong trình duyệt trên thiết bị này, chưa được ghi vào tệp. Bấm Lưu (' + SAVE_KEY + ') để ghi ra tệp.'

  var badge = el('span', 'erp-shell__draft')
  badge.hidden = true
  var badgeFull = el('span', 'erp-shell__draft-full')
  var badgeShort = el('span', 'erp-shell__draft-short')
  badge.appendChild(badgeFull)
  badge.appendChild(badgeShort)
  bar.insertBefore(badge, bar.querySelector('.erp-shell__nav'))

  store.subscribe(function (status) {
    var view = STATUS[status.kind]
    badge.hidden = !view
    if (!view) return
    var text = view.text(status)
    badge.className = 'erp-shell__draft erp-shell__draft--' + view.tone
    // Failures interrupt; routine saves must not chatter to screen readers on every pause in typing.
    badge.setAttribute('role', view.tone === 'alert' ? 'alert' : 'status')
    badge.setAttribute('aria-live', view.tone === 'alert' ? 'assertive' : 'off')
    badge.title = view.tone === 'alert' ? text : text + '. ' + NOT_A_FILE
    badgeFull.textContent = text
    badgeShort.textContent = view.short
  })

  var panel
  function focusEditor() {
    var canvas = document.querySelector('canvas')
    if (canvas) canvas.focus()
  }
  function closePanel() {
    // Back to the document: left on body, keys and Ctrl+S would not reach the editor.
    var hadFocus = Boolean(panel) && panel.contains(document.activeElement)
    if (panel) panel.remove()
    panel = null
    if (hadFocus) focusEditor()
    document.removeEventListener('keydown', onEscape, true)
  }
  function onEscape(event) {
    if (event.key === 'Escape' && panel && panel.contains(event.target)) closePanel()
  }

  function render(items, notice) {
    if (!panel) {
      panel = el('section', 'erp-drafts')
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-labelledby', 'erp-drafts-title')
      document.body.appendChild(panel)
      document.addEventListener('keydown', onEscape, true)
    }
    panel.textContent = ''
    var head = el('h2', 'erp-drafts__title', items.length ? 'Có bản nháp chưa lưu từ lần trước' : 'Bản nháp')
    head.id = 'erp-drafts-title'
    panel.appendChild(head)
    if (notice) panel.appendChild(el('p', 'erp-drafts__notice erp-drafts__notice--' + notice.tone, notice.text))
    if (items.length) {
      panel.appendChild(el('p', 'erp-drafts__intro', 'Các bản nháp này chỉ nằm trong trình duyệt trên thiết bị này và tự xoá sau 30 ngày.'))
      var list = el('ul', 'erp-drafts__list')
      items.forEach(function (item) { list.appendChild(row(item, items)) })
      panel.appendChild(list)
    }
    var actions = el('div', 'erp-drafts__actions')
    var restorable = items.filter(function (item) { return !item.corrupt })
    if (restorable.length > 1) actions.appendChild(button('Khôi phục tất cả', 'primary', function () { restoreAll(restorable, items) }))
    actions.appendChild(button(items.length ? 'Để sau' : 'Đóng', 'quiet', closePanel))
    panel.appendChild(actions)
  }

  function row(item, items) {
    var li = el('li', 'erp-drafts__item')
    var info = el('div', 'erp-drafts__info')
    info.appendChild(el('span', 'erp-drafts__name', item.name))
    info.appendChild(el('span', 'erp-drafts__meta', item.corrupt
      ? 'Bản nháp bị hỏng, không khôi phục được'
      : 'Lưu ' + when(item.savedAt) + ' · ' + size(item.size)))
    li.appendChild(info)
    var buttons = el('div', 'erp-drafts__row-actions')
    if (!item.corrupt) buttons.appendChild(button('Khôi phục', 'primary', function () { restoreOne(item, items) }))
    buttons.appendChild(button(item.corrupt ? 'Xoá' : 'Bỏ', 'quiet', function () { confirmDiscard(li, item, items) }))
    li.appendChild(buttons)
    return li
  }

  function without(items, item) {
    return items.filter(function (other) { return other.id !== item.id })
  }
  // Stops a second click from starting the same restore or discard while the first one runs.
  function lock() {
    if (panel) panel.querySelectorAll('button').forEach(function (b) { b.disabled = true })
  }
  function focusFirst() {
    var first = panel && panel.querySelector('button')
    if (first) first.focus()
  }

  // Back to the document: left on a panel button, Ctrl+S would save the web page instead.
  function backToEditor(rest) {
    focusEditor()
    if (rest.length) return
    var shown = panel
    setTimeout(function () { if (panel === shown) closePanel() }, 8000)
  }

  function markCorrupt(items, ids) {
    return items.map(function (other) { return ids.indexOf(other.id) !== -1 ? Object.assign({}, other, { corrupt: true }) : other })
  }

  function restoreOne(item, items) {
    lock()
    store.restore(item.id).then(function (result) {
      var rest = without(items, item)
      if (result === 'ok') {
        render(rest, { tone: 'ok', text: 'Đã mở lại “' + item.name + '”. ' + NOT_A_FILE })
        backToEditor(rest)
        return
      }
      if (result === 'corrupt') render(markCorrupt(items, [item.id]), null)
      else render(rest, { tone: 'alert', text: 'Không còn bản nháp “' + item.name + '”.' })
      focusFirst()
    }, function () {
      render(items, { tone: 'alert', text: 'Không mở lại được “' + item.name + '”. Hãy thử lại.' })
      focusFirst()
    })
  }

  function restoreAll(restorable, items) {
    lock()
    var done = []
    var gone = []
    var corrupt = []
    restorable.reduce(function (chain, item) {
      return chain.then(function () { return store.restore(item.id) }).then(function (result) {
        if (result === 'ok') done.push(item.id)
        else if (result === 'corrupt') corrupt.push(item.id)
        else gone.push(item.id)
      }, function () {})
    }, Promise.resolve()).then(function () {
      var rest = markCorrupt(items, corrupt).filter(function (item) { return done.indexOf(item.id) === -1 && gone.indexOf(item.id) === -1 })
      if (!done.length) {
        render(rest, { tone: 'alert', text: 'Không mở lại được bản nháp nào. Hãy thử từng bản.' })
        focusFirst()
        return
      }
      render(rest, { tone: 'ok', text: 'Đã mở lại ' + done.length + ' bản nháp. ' + NOT_A_FILE })
      backToEditor(rest)
    })
  }

  function confirmDiscard(li, item, items) {
    var box = el('div', 'erp-drafts__confirm')
    box.appendChild(el('span', '', 'Bỏ bản nháp này? Không lấy lại được.'))
    box.appendChild(button('Bỏ hẳn', 'danger', function () {
      lock()
      store.discard(item.id).then(function () {
        var rest = without(items, item)
        if (rest.length) {
          render(rest, null)
          focusFirst()
        } else closePanel()
      }, function () {
        render(items, { tone: 'alert', text: 'Không bỏ được “' + item.name + '”. Hãy thử lại.' })
        focusFirst()
      })
    }))
    box.appendChild(button('Thôi', 'quiet', function () { render(items, null); focusFirst() }))
    li.replaceWith(box)
    box.querySelector('button').focus()
  }

  store.onReady(function () {
    store.orphans().then(function (items) {
      if (!items.length) return
      render(items, null)
      focusFirst()
    }).catch(function () {})
  })
})()
