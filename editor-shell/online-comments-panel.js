(function () {
  // The "Nhận xét" panel beside the editor (plan-m5, "Site"): a side sheet from 768 px, a bottom sheet on phones.
  // It owns what is being typed, which box is open and which button waits; the threads and every server call belong
  // to online-comments.js, which answers each action with null (done) or a Vietnamese message.
  var online = window.erpOnline = window.erpOnline || {}
  // bootstrap-icons 1.13.1 (MIT), the set the bar already uses.
  var ICONS = {
    check: '<path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z"/>',
    reopen: '<path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466"/>',
    trash: '<path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.53Zm5.058 0a.5.5 0 0 1 .47.53l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47M8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5"/>',
    close: '<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>',
    plus: '<path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/>'
  }
  // White text on each is at least 4.5:1.
  var AVATAR_COLOURS = ['#0b5cad', '#1d6b45', '#b42318', '#5b3fb0', '#8a4b08', '#344454']
  var BODY_MAX = 10000
  var MESSAGES = {
    emptyOpen: 'Chưa có nhận xét nào.',
    emptyOpenHint: 'Chọn nội dung trong tài liệu rồi bấm “Thêm nhận xét”.',
    emptyOpenGeneral: 'Bấm “Thêm nhận xét” để góp ý cho cả tài liệu.',
    emptyResolved: 'Chưa có nhận xét nào được đánh dấu đã xử lý.',
    failed: 'Không tải được nhận xét.',
    orphaned: 'Không còn vị trí',
    orphanedHint: 'Phần nội dung gắn với các nhận xét này đã bị xoá hoặc thay đổi.',
    general: 'Nhận xét chung',
    deleted: 'Nhận xét này đã bị xoá.',
    tooLong: 'Nhận xét dài quá 10 000 ký tự.',
    readOnly: 'Bạn chỉ xem được nhận xét, không thêm hay trả lời.'
  }

  function svg(name) {
    return '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>'
  }
  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  function initial(name) {
    var trimmed = (name || '').trim()
    if (!trimmed) return '?'
    var words = trimmed.split(/\s+/)
    // Vietnamese names end with the given name, the one people are called by.
    return words[words.length - 1].charAt(0).toUpperCase()
  }
  function colourOf(name) {
    var hash = 0
    for (var i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
    return AVATAR_COLOURS[hash % AVATAR_COLOURS.length]
  }
  function pad(n) { return (n < 10 ? '0' : '') + n }
  /** "Vừa xong", "5 phút trước", "14:20", "Hôm qua, 14:20", "02/11/2026". */
  online.commentTime = function (iso, now) {
    var at = iso ? new Date(iso) : null
    if (!at || isNaN(at.getTime())) return ''
    var current = new Date(typeof now === 'number' ? now : Date.now())
    var minutes = Math.floor((current.getTime() - at.getTime()) / 60000)
    if (minutes < 1) return 'Vừa xong'
    if (minutes < 60) return minutes + ' phút trước'
    var clock = pad(at.getHours()) + ':' + pad(at.getMinutes())
    if (at.toDateString() === current.toDateString()) return clock
    var yesterday = new Date(current.getTime())
    yesterday.setDate(yesterday.getDate() - 1)
    if (at.toDateString() === yesterday.toDateString()) return 'Hôm qua, ' + clock
    return pad(at.getDate()) + '/' + pad(at.getMonth() + 1) + '/' + at.getFullYear()
  }

  /**
   * deps: { onClose(), onAdd(), onCreate(body), onCancelCreate(), onReply(threadId, body), onEdit(threadId, commentId,
   * body), onDelete(threadId, commentId), onResolve(threadId), onReopen(threadId), onDeleteThread(threadId),
   * onSelect(threadId), onRetry() }. Each action returns a Promise of null or a message.
   */
  online.createCommentsPanel = function (deps) {
    var data = { state: 'loading', threads: [], rights: { see: false, write: false, resolve: false }, general: false }
    var filter = 'open'
    var activeId = null
    var composer = null
    // Typed text by box key ('new', 'reply:<thread>', 'edit:<comment>'), kept across re-renders.
    var drafts = {}
    var editing = {}
    var replying = {}
    var confirming = null
    var busy = {}
    var errors = {}
    var focusKey = null

    var root = el('aside', 'erp-comments')
    root.setAttribute('data-erp-comments', '')
    root.setAttribute('aria-label', 'Nhận xét')
    root.hidden = true
    var head = el('div', 'erp-comments__head')
    var title = el('h2', 'erp-comments__title', 'Nhận xét')
    title.id = 'erp-comments-title'
    var addButton = el('button', 'erp-comments__add')
    addButton.type = 'button'
    addButton.setAttribute('data-erp-comments-add', '')
    addButton.title = 'Thêm nhận xét (Ctrl+Alt+M)'
    addButton.innerHTML = svg('plus')
    addButton.appendChild(el('span', '', 'Thêm nhận xét'))
    addButton.addEventListener('click', function () { deps.onAdd() })
    var closeButton = el('button', 'erp-comments__icon')
    closeButton.type = 'button'
    closeButton.setAttribute('data-erp-comments-close', '')
    closeButton.setAttribute('aria-label', 'Đóng khung nhận xét')
    closeButton.title = 'Đóng'
    closeButton.innerHTML = svg('close')
    closeButton.addEventListener('click', function () { deps.onClose() })
    head.appendChild(title)
    head.appendChild(addButton)
    head.appendChild(closeButton)
    var tabs = el('div', 'erp-comments__filter')
    tabs.setAttribute('role', 'tablist')
    tabs.setAttribute('aria-label', 'Lọc nhận xét')
    var tabButtons = {}
    ;[['open', 'Đang mở'], ['resolved', 'Đã xử lý']].forEach(function (spec) {
      var tab = el('button', 'erp-comments__tab')
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('data-erp-comments-filter', spec[0])
      var label = el('span', '', spec[1])
      var count = el('span', 'erp-comments__count')
      tab.appendChild(label)
      tab.appendChild(count)
      tab.addEventListener('click', function () { setFilter(spec[0]) })
      tabButtons[spec[0]] = { button: tab, count: count }
      tabs.appendChild(tab)
    })
    var readOnlyNote = el('p', 'erp-comments__readonly', MESSAGES.readOnly)
    readOnlyNote.setAttribute('data-erp-comments-readonly', '')
    readOnlyNote.hidden = true
    var body = el('div', 'erp-comments__body')
    body.setAttribute('data-erp-comments-body', '')
    var live = el('p', 'erp-comments__live')
    live.setAttribute('role', 'status')
    live.setAttribute('aria-live', 'polite')
    root.appendChild(head)
    root.appendChild(tabs)
    root.appendChild(readOnlyNote)
    root.appendChild(body)
    root.appendChild(live)
    // The editor under the panel must not receive what is typed here (its keys and shortcuts).
    ;['keydown', 'keyup', 'keypress'].forEach(function (type) {
      root.addEventListener(type, function (event) {
        if (type === 'keydown' && event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault()
          deps.onClose()
        }
        event.stopPropagation()
      })
    })
    document.body.appendChild(root)

    function setFilter(next) {
      if (filter === next) return
      filter = next
      render()
    }
    function say(text) { live.textContent = text }

    // An action of the box `key`: its buttons wait, its message shows below it, `done` runs once it went through.
    function act(key, run, done) {
      if (busy[key]) return
      busy[key] = true
      delete errors[key]
      render()
      Promise.resolve().then(run).then(function (message) {
        delete busy[key]
        if (message) errors[key] = message
        else if (done) done()
        render()
      }, function () {
        delete busy[key]
        errors[key] = 'Đã có lỗi. Hãy thử lại.'
        render()
      })
    }
    function words(key) { return (drafts[key] || '').replace(/\s+$/, '') }
    function valid(key) {
      var text = words(key)
      return text.trim().length > 0 && text.length <= BODY_MAX
    }

    function textBox(key, label, placeholder, onSubmit, onCancel) {
      var wrap = el('div', 'erp-comments__box')
      var labelNode = el('label', 'erp-comments__sr', label)
      var id = 'erp-comments-' + key.replace(/[^a-z0-9]/gi, '-')
      labelNode.setAttribute('for', id)
      var area = el('textarea', 'erp-comments__input')
      area.id = id
      area.setAttribute('data-erp-comments-input', key)
      area.setAttribute('rows', key === 'new' ? '3' : '2')
      area.setAttribute('maxlength', String(BODY_MAX))
      area.placeholder = placeholder
      area.value = drafts[key] || ''
      area.disabled = Boolean(busy[key])
      area.addEventListener('input', function () {
        drafts[key] = area.value
        submit.disabled = Boolean(busy[key]) || !valid(key)
      })
      area.addEventListener('focus', function () { focusKey = key })
      area.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          if (valid(key)) onSubmit()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      })
      var actions = el('div', 'erp-comments__box-actions')
      var cancel = el('button', 'erp-comments__btn erp-comments__btn--quiet', 'Huỷ')
      cancel.type = 'button'
      cancel.disabled = Boolean(busy[key])
      cancel.addEventListener('click', onCancel)
      var submit = el('button', 'erp-comments__btn erp-comments__btn--primary', busy[key] ? 'Đang gửi…' : (key === 'new' ? 'Nhận xét' : key.indexOf('edit:') === 0 ? 'Lưu' : 'Trả lời'))
      submit.type = 'button'
      submit.setAttribute('data-erp-comments-submit', key)
      submit.disabled = Boolean(busy[key]) || !valid(key)
      submit.addEventListener('click', function () { if (valid(key)) onSubmit() })
      actions.appendChild(cancel)
      actions.appendChild(submit)
      wrap.appendChild(labelNode)
      wrap.appendChild(area)
      if (errors[key]) wrap.appendChild(errorNote(errors[key]))
      wrap.appendChild(actions)
      return wrap
    }
    function errorNote(text) {
      var note = el('p', 'erp-comments__error', text)
      note.setAttribute('role', 'alert')
      return note
    }
    function quoteNode(thread) {
      var quote = online.commentAnchor.quote(thread.anchor)
      if (online.commentAnchor.isDocument(thread.anchor)) return el('p', 'erp-comments__chip', MESSAGES.general)
      var node = el('p', 'erp-comments__quote', quote || 'Nội dung đã chọn')
      if (!quote) node.className += ' erp-comments__quote--plain'
      return node
    }

    function commentNode(thread, comment, isRoot) {
      var node = el('div', 'erp-comment' + (isRoot ? ' erp-comment--root' : ''))
      node.setAttribute('data-erp-comment', comment.id)
      var meta = el('div', 'erp-comment__meta')
      var avatar = el('span', 'erp-comment__avatar', initial(comment.authorName))
      avatar.setAttribute('aria-hidden', 'true')
      avatar.style.backgroundColor = colourOf(comment.authorName)
      var who = el('span', 'erp-comment__who')
      who.appendChild(el('span', 'erp-comment__name', comment.authorName || 'Người dùng'))
      var when = el('span', 'erp-comment__time', online.commentTime(comment.createdAt) + (comment.editedAt && comment.body !== null ? ' · đã sửa' : ''))
      if (comment.createdAt) when.title = new Date(comment.createdAt).toLocaleString('vi-VN')
      who.appendChild(when)
      meta.appendChild(avatar)
      meta.appendChild(who)
      node.appendChild(meta)
      var editKey = 'edit:' + comment.id
      if (comment.body === null) {
        node.appendChild(el('p', 'erp-comment__text erp-comment__text--deleted', MESSAGES.deleted))
        return node
      }
      if (editing[comment.id]) {
        node.appendChild(textBox(editKey, 'Sửa nhận xét', '', function () {
          act(editKey, function () { return deps.onEdit(thread.id, comment.id, words(editKey)) }, function () {
            delete editing[comment.id]
            delete drafts[editKey]
            say('Đã lưu nhận xét.')
          })
        }, function () {
          delete editing[comment.id]
          delete drafts[editKey]
          delete errors[editKey]
          render()
        }))
        return node
      }
      node.appendChild(el('p', 'erp-comment__text', comment.body))
      var deleteKey = 'delete:' + comment.id
      if (confirming === deleteKey) {
        node.appendChild(confirmRow(deleteKey, 'Xoá nhận xét này?', function () {
          return deps.onDelete(thread.id, comment.id)
        }, 'Đã xoá nhận xét.'))
      } else if (comment.mine && data.rights.write) {
        var tools = el('div', 'erp-comment__tools')
        var edit = el('button', 'erp-comments__link', 'Sửa')
        edit.type = 'button'
        edit.setAttribute('data-erp-comment-edit', comment.id)
        edit.addEventListener('click', function (event) {
          event.stopPropagation()
          editing[comment.id] = true
          drafts[editKey] = comment.body
          focusKey = editKey
          render()
        })
        var remove = el('button', 'erp-comments__link', 'Xoá')
        remove.type = 'button'
        remove.setAttribute('data-erp-comment-delete', comment.id)
        remove.addEventListener('click', function (event) {
          event.stopPropagation()
          confirming = deleteKey
          render()
        })
        tools.appendChild(edit)
        tools.appendChild(remove)
        node.appendChild(tools)
      }
      if (errors[deleteKey] && confirming !== deleteKey) node.appendChild(errorNote(errors[deleteKey]))
      return node
    }
    function confirmRow(key, question, run, spoken) {
      var row = el('div', 'erp-comments__confirm')
      row.setAttribute('data-erp-comments-confirm', key)
      row.appendChild(el('span', '', question))
      var no = el('button', 'erp-comments__btn erp-comments__btn--quiet', 'Huỷ')
      no.type = 'button'
      no.disabled = Boolean(busy[key])
      no.addEventListener('click', function (event) {
        event.stopPropagation()
        confirming = null
        delete errors[key]
        render()
      })
      var yes = el('button', 'erp-comments__btn erp-comments__btn--danger', busy[key] ? 'Đang xoá…' : 'Xoá')
      yes.type = 'button'
      yes.setAttribute('data-erp-comments-confirm-yes', '')
      yes.disabled = Boolean(busy[key])
      yes.addEventListener('click', function (event) {
        event.stopPropagation()
        act(key, run, function () {
          confirming = null
          say(spoken)
        })
      })
      row.appendChild(no)
      row.appendChild(yes)
      if (errors[key]) row.appendChild(errorNote(errors[key]))
      return row
    }
    function iconButton(name, label, attr, onClick, disabled) {
      var button = el('button', 'erp-comments__icon')
      button.type = 'button'
      button.setAttribute(attr, '')
      button.setAttribute('aria-label', label)
      button.title = label
      button.innerHTML = svg(name)
      button.disabled = Boolean(disabled)
      button.addEventListener('click', function (event) {
        event.stopPropagation()
        onClick()
      })
      return button
    }

    function threadNode(thread) {
      var card = el('li', 'erp-thread' + (thread.id === activeId ? ' erp-thread--active' : '') + (thread.status === 'resolved' ? ' erp-thread--resolved' : ''))
      card.setAttribute('data-erp-comment-thread', thread.id)
      card.setAttribute('data-status', thread.status)
      card.setAttribute('tabindex', '-1')
      card.addEventListener('click', function () {
        if (activeId === thread.id) return
        activeId = thread.id
        render()
        deps.onSelect(thread.id)
      })
      var top = el('div', 'erp-thread__top')
      top.appendChild(quoteNode(thread))
      var statusKey = 'status:' + thread.id
      if (data.rights.resolve) {
        var tools = el('div', 'erp-thread__tools')
        if (thread.status === 'resolved') {
          tools.appendChild(iconButton('reopen', 'Mở lại', 'data-erp-thread-reopen', function () {
            act(statusKey, function () { return deps.onReopen(thread.id) }, function () { say('Đã mở lại nhận xét.') })
          }, busy[statusKey]))
        } else {
          tools.appendChild(iconButton('check', 'Đánh dấu đã xử lý', 'data-erp-thread-resolve', function () {
            act(statusKey, function () { return deps.onResolve(thread.id) }, function () { say('Đã đánh dấu đã xử lý.') })
          }, busy[statusKey]))
        }
        tools.appendChild(iconButton('trash', 'Xoá cả chuỗi nhận xét', 'data-erp-thread-delete', function () {
          confirming = 'thread:' + thread.id
          render()
        }))
        top.appendChild(tools)
      }
      card.appendChild(top)
      if (errors[statusKey]) card.appendChild(errorNote(errors[statusKey]))
      if (confirming === 'thread:' + thread.id) {
        card.appendChild(confirmRow('thread:' + thread.id, 'Xoá cả chuỗi và mọi trả lời?', function () { return deps.onDeleteThread(thread.id) }, 'Đã xoá chuỗi nhận xét.'))
      }
      thread.comments.forEach(function (comment, index) { card.appendChild(commentNode(thread, comment, index === 0)) })
      if (thread.status === 'resolved') {
        var by = thread.resolvedByName ? 'Đã xử lý bởi ' + thread.resolvedByName : 'Đã xử lý'
        card.appendChild(el('p', 'erp-thread__resolved', by + (thread.resolvedAt ? ', ' + online.commentTime(thread.resolvedAt) : '')))
      } else if (data.rights.write) {
        var replyKey = 'reply:' + thread.id
        if (replying[thread.id] || drafts[replyKey]) {
          card.appendChild(textBox(replyKey, 'Trả lời nhận xét', 'Trả lời…', function () {
            act(replyKey, function () { return deps.onReply(thread.id, words(replyKey)) }, function () {
              delete drafts[replyKey]
              delete replying[thread.id]
              say('Đã gửi trả lời.')
            })
          }, function () {
            delete drafts[replyKey]
            delete replying[thread.id]
            delete errors[replyKey]
            render()
          }))
        } else {
          var open = el('button', 'erp-thread__reply', 'Trả lời…')
          open.type = 'button'
          open.setAttribute('data-erp-thread-reply', thread.id)
          open.addEventListener('click', function (event) {
            event.stopPropagation()
            replying[thread.id] = true
            focusKey = replyKey
            if (activeId !== thread.id) {
              activeId = thread.id
              deps.onSelect(thread.id)
            }
            render()
          })
          card.appendChild(open)
        }
      }
      return card
    }

    function skeleton() {
      var list = el('div', 'erp-comments__skeleton')
      list.setAttribute('aria-hidden', 'true')
      for (var i = 0; i < 3; i++) {
        var card = el('div', 'erp-comments__ghost')
        card.appendChild(el('span', 'erp-comments__ghost-line erp-comments__ghost-line--short'))
        card.appendChild(el('span', 'erp-comments__ghost-line'))
        card.appendChild(el('span', 'erp-comments__ghost-line erp-comments__ghost-line--mid'))
        list.appendChild(card)
      }
      return list
    }
    function emptyNode(lines) {
      var node = el('div', 'erp-comments__empty')
      node.setAttribute('data-erp-comments-empty', '')
      node.appendChild(el('p', 'erp-comments__empty-title', lines[0]))
      if (lines[1]) node.appendChild(el('p', 'erp-comments__empty-hint', lines[1]))
      return node
    }
    function listOf(threads, attr) {
      var list = el('ol', 'erp-comments__list')
      if (attr) list.setAttribute(attr, '')
      threads.forEach(function (thread) { list.appendChild(threadNode(thread)) })
      return list
    }

    function render() {
      var sections = online.commentSections(data.threads)
      tabButtons.open.count.textContent = sections.counts.open ? String(sections.counts.open) : ''
      tabButtons.resolved.count.textContent = sections.counts.resolved ? String(sections.counts.resolved) : ''
      Object.keys(tabButtons).forEach(function (key) {
        tabButtons[key].button.setAttribute('aria-selected', key === filter ? 'true' : 'false')
        tabButtons[key].button.className = 'erp-comments__tab' + (key === filter ? ' erp-comments__tab--on' : '')
      })
      addButton.hidden = !data.rights.write
      readOnlyNote.hidden = data.rights.write || !data.rights.see
      var scroll = body.scrollTop
      // A box being typed in keeps its focus and caret across a re-render (a reply arriving, a count changing).
      var typing = document.activeElement && body.contains(document.activeElement) ? document.activeElement.getAttribute('data-erp-comments-input') : null
      var caret = typing && typeof document.activeElement.selectionStart === 'number' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null
      if (typing && !focusKey) focusKey = typing
      body.textContent = ''
      if (composer && data.rights.write) {
        var card = el('div', 'erp-thread erp-thread--new')
        card.setAttribute('data-erp-comments-composer', '')
        card.appendChild(composer.general ? el('p', 'erp-comments__chip', MESSAGES.general) : el('p', 'erp-comments__quote' + (composer.quote ? '' : ' erp-comments__quote--plain'), composer.quote || 'Nội dung đã chọn'))
        card.appendChild(textBox('new', 'Nhận xét mới', 'Viết nhận xét…', function () {
          act('new', function () { return deps.onCreate(words('new')) }, function () {
            composer = null
            delete drafts.new
            say('Đã thêm nhận xét.')
          })
        }, function () {
          composer = null
          delete drafts.new
          delete errors.new
          render()
          deps.onCancelCreate()
        }))
        body.appendChild(card)
      }
      if (data.state === 'loading') {
        body.appendChild(skeleton())
      } else if (data.state === 'error') {
        var failed = emptyNode([MESSAGES.failed])
        var retry = el('button', 'erp-comments__btn erp-comments__btn--quiet', 'Thử lại')
        retry.type = 'button'
        retry.setAttribute('data-erp-comments-retry', '')
        retry.addEventListener('click', function () { deps.onRetry() })
        failed.appendChild(retry)
        body.appendChild(failed)
      } else if (filter === 'resolved') {
        if (sections.resolved.length) body.appendChild(listOf(sections.resolved, 'data-erp-comments-resolved'))
        else body.appendChild(emptyNode([MESSAGES.emptyResolved]))
      } else {
        if (sections.open.length) body.appendChild(listOf(sections.open, 'data-erp-comments-open'))
        if (sections.orphaned.length) {
          var section = el('section', 'erp-comments__section')
          section.setAttribute('data-erp-comments-orphaned', '')
          section.appendChild(el('h3', 'erp-comments__section-title', MESSAGES.orphaned))
          section.appendChild(el('p', 'erp-comments__section-hint', MESSAGES.orphanedHint))
          section.appendChild(listOf(sections.orphaned))
          body.appendChild(section)
        }
        if (!sections.open.length && !sections.orphaned.length && !composer) {
          body.appendChild(emptyNode(data.rights.write ? [MESSAGES.emptyOpen, data.general ? MESSAGES.emptyOpenGeneral : MESSAGES.emptyOpenHint] : [MESSAGES.emptyOpen]))
        }
      }
      body.scrollTop = scroll
      if (focusKey && !root.hidden) {
        var area = body.querySelector('[data-erp-comments-input="' + focusKey + '"]')
        if (area && !area.disabled) {
          area.focus()
          var at = caret && focusKey === typing ? caret : [area.value.length, area.value.length]
          if (typeof area.setSelectionRange === 'function') area.setSelectionRange(at[0], at[1])
        }
        if (!area || !busy[focusKey]) focusKey = null
      }
    }

    // shell.css narrows the canvas beside a desktop side sheet by this class.
    function pageClass(on) {
      var html = document.documentElement
      if (html && html.classList) html.classList[on ? 'add' : 'remove']('erp-comments-open')
    }
    function reveal(id, keepFocus) {
      var card = body.querySelector('[data-erp-comment-thread="' + id + '"]')
      if (!card) return
      if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest' })
      if (!keepFocus && typeof card.focus === 'function') card.focus()
    }

    return {
      element: root,
      isOpen: function () { return !root.hidden },
      open: function () {
        if (!root.hidden) return
        root.hidden = false
        pageClass(true)
        render()
      },
      close: function () {
        if (root.hidden) return
        root.hidden = true
        pageClass(false)
        var canvas = document.querySelector('canvas')
        if (canvas) canvas.focus()
      },
      /** data: { state: 'loading' | 'error' | 'ready', threads, rights, general } */
      setData: function (next) {
        data = next
        if (activeId && !data.threads.some(function (thread) { return thread.id === activeId })) activeId = null
        if (!data.rights.write) {
          composer = null
          editing = {}
          replying = {}
          confirming = null
        }
        render()
      },
      /** Opens the box for a new thread: `quote` from the anchor, `general` when it has no place in the document. */
      compose: function (options) {
        composer = { quote: options.quote || '', general: Boolean(options.general) }
        filter = 'open'
        focusKey = 'new'
        render()
      },
      /** Shows the thread as the current one, under the filter that lists it. */
      focusThread: function (id, threadFilter, keepFocus) {
        activeId = id
        if (threadFilter) filter = threadFilter
        render()
        reveal(id, keepFocus)
      },
      filter: function () { return filter },
      active: function () { return activeId }
    }
  }
})()
