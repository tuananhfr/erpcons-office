(function () {
  // Wires the account slot inject.ts renders only when PI sign-in is enabled; account.js owns all state.
  var account = window.erpAccount
  var slot = document.querySelector('[data-erp-account]')
  if (!account || !slot) return
  var NOTE_MS = 10000

  function part(name) { return slot.querySelector('[data-erp-account-' + name + ']') }
  var signInButton = part('sign-in')
  var userBox = part('user')
  var toggle = part('toggle')
  var panel = part('panel')
  var initialsEl = part('initials')
  var nameEl = part('name')
  var emailEl = part('email')
  var orgsEl = part('orgs')
  var signOutButton = part('sign-out')
  var note = part('note')
  var open = false
  var noteTimer = null
  var lastError = null

  // Vietnamese names put the given name last, which is what people are called by.
  function initials(user) {
    var source = (user.name || user.email || '').trim()
    if (!source) return '?'
    var words = source.split(/\s+/)
    var word = user.name ? words[words.length - 1] : source
    var first = word.normalize ? word.normalize('NFC').charAt(0) : word.charAt(0)
    return first.toLocaleUpperCase('vi')
  }

  function buttons() {
    return Array.prototype.slice.call(panel.querySelectorAll('button')).filter(function (b) { return !b.hidden && !b.disabled })
  }
  function setOpen(next, restoreFocus) {
    open = next
    panel.hidden = !next
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false')
    if (next) {
      var first = buttons()[0]
      if (first) first.focus()
    } else if (restoreFocus) {
      toggle.focus()
    }
  }

  function orgButton(label, orgId, active) {
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'erp-shell__account-action'
    button.textContent = label
    button.setAttribute('aria-pressed', active ? 'true' : 'false')
    button.addEventListener('click', function () {
      if (active) return
      setOpen(false, true)
      account.selectOrg(orgId)
    })
    return button
  }
  function renderOrgs(snapshot) {
    orgsEl.textContent = ''
    // Personal plus at least one organization: two contexts to choose from.
    if (!snapshot.orgs.length) {
      orgsEl.hidden = true
      return
    }
    var title = document.createElement('p')
    title.className = 'erp-shell__account-orgs-title'
    title.textContent = 'Tổ chức'
    orgsEl.appendChild(title)
    var activeId = snapshot.activeOrg ? snapshot.activeOrg.id : null
    orgsEl.appendChild(orgButton('Cá nhân', null, activeId === null))
    snapshot.orgs.forEach(function (org) { orgsEl.appendChild(orgButton(org.name, org.id, org.id === activeId)) })
    orgsEl.hidden = false
  }

  function hideNote() {
    clearTimeout(noteTimer)
    note.textContent = ''
  }
  // Each error shows once; a dismissed one stays hidden while the account keeps reporting it.
  function showNote(error) {
    var key = error ? error.code + '|' + error.message : null
    if (key === lastError) return
    lastError = key
    hideNote()
    if (!error) return
    note.textContent = error.message
    noteTimer = setTimeout(hideNote, NOTE_MS)
  }

  function render(snapshot) {
    if (snapshot.status === 'disabled') {
      slot.hidden = true
      return
    }
    slot.hidden = false
    var signedIn = snapshot.status === 'signed-in'
    signInButton.hidden = signedIn
    signInButton.disabled = snapshot.status === 'signing-in'
    signInButton.setAttribute('aria-busy', snapshot.status === 'signing-in' ? 'true' : 'false')
    userBox.hidden = !signedIn
    if (signedIn && snapshot.user) {
      var user = snapshot.user
      initialsEl.textContent = initials(user)
      nameEl.textContent = user.name || user.email || 'Tài khoản PI ID'
      emailEl.textContent = user.name && user.email ? user.email : ''
      var context = snapshot.activeOrg ? ' · ' + snapshot.activeOrg.name : ''
      toggle.setAttribute('aria-label', 'Tài khoản: ' + (user.name || user.email || 'PI ID') + context)
      toggle.title = (user.name || user.email || 'PI ID') + context
      renderOrgs(snapshot)
    } else if (open) {
      setOpen(false)
    }
    showNote(snapshot.error)
  }

  signInButton.addEventListener('click', function () { account.signIn() })
  toggle.addEventListener('click', function () { setOpen(!open) })
  signOutButton.addEventListener('click', function () {
    setOpen(false, true)
    account.signOut()
  })
  note.addEventListener('click', hideNote)
  slot.addEventListener('keydown', function (event) {
    if (!open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false, true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    var list = buttons()
    if (!list.length) return
    event.preventDefault()
    var index = list.indexOf(document.activeElement)
    if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = list.length - 1
    else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
    list[index].focus()
  })
  document.addEventListener('pointerdown', function (event) {
    if (open && !slot.contains(event.target)) setOpen(false)
  })
  slot.addEventListener('focusout', function (event) {
    if (open && event.relatedTarget && !slot.contains(event.relatedTarget)) setOpen(false)
  })

  account.onChange(render)
  render(account.snapshot())
})()
