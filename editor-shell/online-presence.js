(function () {
  // Who else has the document open (the live room's members): overlapping initials in the shell bar, "+N" past the
  // first few, and a list on click. Link holders and names the server withholds stay anonymous.
  var online = window.erpOnline = window.erpOnline || {}
  // Faces shown before "+N": the narrow bar (under 480 px, shell.css) keeps one, the others three.
  var WIDE = 3
  var NARROW = 1
  var COLOUR = /^#[0-9a-f]{6}$/i
  var FALLBACK = '#5b6b7a'
  // bootstrap-icons 1.13.1 person-fill (MIT), the set the shell bar already uses.
  var PERSON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/></svg>'

  /** What the list and tooltips call a member. */
  online.memberName = function (member) {
    if (member.kind === 'link') return 'Người xem qua liên kết'
    return typeof member.name === 'string' && member.name.trim() ? member.name.trim() : 'Người dùng'
  }
  function initial(member) {
    if (member.kind === 'link' || typeof member.name !== 'string' || !member.name.trim()) return null
    // Vietnamese names put the given name last (as account-ui.js).
    var words = member.name.trim().split(/\s+/)
    var word = words[words.length - 1]
    return (word.normalize ? word.normalize('NFC') : word).charAt(0).toLocaleUpperCase('vi')
  }
  function activity(member) { return member.mode === 'edit' ? 'đang sửa' : 'đang xem' }
  // White or ink on the server's colour, whichever reads better (WCAG relative luminance).
  function inkOn(hex) {
    var channel = function (at) {
      var c = parseInt(hex.slice(at, at + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    var lum = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
    return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.0628) ? '#ffffff' : '#101820'
  }

  function face(member, className, decorative) {
    var colour = COLOUR.test(member.colour) ? member.colour : FALLBACK
    var el = document.createElement('span')
    el.className = className + (member.state === 'idle' ? ' ' + className + '--idle' : '')
    el.style.backgroundColor = colour
    el.style.color = inkOn(colour)
    var letter = initial(member)
    if (letter) el.textContent = letter
    else el.innerHTML = PERSON
    if (decorative) el.setAttribute('aria-hidden', 'true')
    return el
  }

  /** bar: the `.erp-shell` header. render(members, you) shows everyone but `you` in the bar, everyone in the list. */
  online.createPresence = function (bar) {
    var root = document.createElement('div')
    root.className = 'erp-shell__people'
    root.setAttribute('data-erp-presence', '')
    root.hidden = true
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'erp-shell__people-btn'
    button.setAttribute('aria-haspopup', 'true')
    button.setAttribute('aria-expanded', 'false')
    var panel = document.createElement('div')
    panel.className = 'erp-shell__people-panel'
    panel.setAttribute('data-erp-presence-list', '')
    panel.setAttribute('role', 'group')
    panel.setAttribute('aria-label', 'Những người đang mở tài liệu')
    panel.hidden = true
    root.appendChild(button)
    root.appendChild(panel)
    var before = bar.querySelector('[data-erp-online-actions]') || bar.querySelector('.erp-shell__nav')
    bar.insertBefore(root, before)

    var shown = { members: [], you: null }

    function close(refocus) {
      if (panel.hidden) return
      panel.hidden = true
      button.setAttribute('aria-expanded', 'false')
      if (refocus) button.focus()
    }
    function fillPanel() {
      panel.textContent = ''
      var title = document.createElement('p')
      title.className = 'erp-shell__people-title'
      title.textContent = 'Đang mở tài liệu này'
      panel.appendChild(title)
      var list = document.createElement('ul')
      list.className = 'erp-shell__people-list'
      var ordered = shown.members.filter(function (m) { return m.id === shown.you }).concat(shown.members.filter(function (m) { return m.id !== shown.you }))
      ordered.forEach(function (member) {
        var row = document.createElement('li')
        row.className = 'erp-shell__people-row'
        row.setAttribute('data-erp-presence-row', member.id === shown.you ? 'you' : member.kind)
        row.appendChild(face(member, 'erp-shell__face', true))
        var text = document.createElement('span')
        text.className = 'erp-shell__people-text'
        var name = document.createElement('span')
        name.className = 'erp-shell__people-name'
        name.textContent = member.id === shown.you ? online.memberName(member) + ' (bạn)' : online.memberName(member)
        var what = document.createElement('span')
        what.className = 'erp-shell__people-mode'
        var doing = activity(member)
        what.textContent = doing.charAt(0).toUpperCase() + doing.slice(1) + (member.state === 'idle' ? ', tạm vắng' : '')
        text.appendChild(name)
        text.appendChild(what)
        row.appendChild(text)
        list.appendChild(row)
      })
      panel.appendChild(list)
    }

    function render(members, you) {
      shown = { members: Array.isArray(members) ? members.filter(function (m) { return m && typeof m.id === 'string' }) : [], you: you || null }
      var others = shown.members.filter(function (m) { return m.id !== shown.you })
      root.hidden = others.length === 0
      if (root.hidden) close(false)
      button.textContent = ''
      others.slice(0, WIDE).forEach(function (member, at) {
        var el = face(member, 'erp-shell__face', false)
        if (at >= NARROW) el.className += ' erp-shell__face--wide'
        el.setAttribute('data-erp-presence-member', member.mode === 'edit' ? 'edit' : 'view')
        el.setAttribute('role', 'img')
        el.setAttribute('aria-label', online.memberName(member) + ' ' + activity(member))
        el.title = online.memberName(member) + ' · ' + activity(member)
        button.appendChild(el)
      })
      ;[[WIDE, 'erp-shell__face--more-wide'], [NARROW, 'erp-shell__face--more-narrow']].forEach(function (pair) {
        var rest = others.length - pair[0]
        if (rest <= 0) return
        var more = document.createElement('span')
        more.className = 'erp-shell__face erp-shell__face--more ' + pair[1]
        more.textContent = '+' + rest
        more.setAttribute('aria-hidden', 'true')
        button.appendChild(more)
      })
      var label = others.length === 1 ? online.memberName(others[0]) + ' ' + activity(others[0]) : others.length + ' người khác đang mở tài liệu'
      button.setAttribute('aria-label', label + '. Xem danh sách')
      button.title = others.length > 1 ? label : ''
      if (!panel.hidden) fillPanel()
    }

    button.addEventListener('click', function () {
      if (!panel.hidden) return close(false)
      fillPanel()
      panel.hidden = false
      button.setAttribute('aria-expanded', 'true')
    })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) close(true)
    })
    document.addEventListener('pointerdown', function (event) {
      if (!panel.hidden && !root.contains(event.target)) close(false)
    })

    return {
      element: root,
      render: render,
      close: function () { close(false) },
      /** Hides the group (the live session ended). */
      clear: function () { render([], null) }
    }
  }
})()
