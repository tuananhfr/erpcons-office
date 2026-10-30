(function () {
  // Access modes of erpHost v2 (docs/erp-host.md, "v2"): the caller's role on the document decides what the editor
  // allows, and the bar says so next to the save state.
  var online = window.erpOnline = window.erpOnline || {}
  var MODES = { owner: 'edit', editor: 'edit', commenter: 'comment', viewer: 'view', link: 'view' }
  // Comments on the web come with M5; until then comment mode reads like view mode, in the forks' words too.
  var LABELS = { comment: 'Chỉ xem', view: 'Chỉ xem' }
  var HINTS = {
    comment: 'Nhận xét trên web sẽ có sau, hiện chỉ xem được',
    view: 'Bạn có quyền xem tài liệu này, không sửa được nội dung.'
  }
  var RANK = { view: 0, comment: 1, edit: 2 }

  // Anything unknown maps to the narrowest mode; the server enforces the role anyway.
  online.modeOf = function (role) { return MODES[role] || 'view' }
  /** Owners and editors manage sharing (an editor may still be refused when the owner turned that off). */
  online.canManageSharing = function (role) { return role === 'owner' || role === 'editor' }
  /** True when `next` takes away something `current` allowed. */
  online.isDowngrade = function (current, next) { return RANK[next] < RANK[current] }

  online.createModeBadge = function (bar) {
    var badge = document.createElement('span')
    badge.className = 'erp-shell__mode'
    badge.setAttribute('data-erp-mode', '')
    badge.setAttribute('role', 'status')
    badge.hidden = true
    var save = bar.querySelector('[data-erp-save-state]')
    bar.insertBefore(badge, save || bar.querySelector('.erp-shell__nav'))
    return {
      element: badge,
      render: function (mode) {
        var label = LABELS[mode]
        badge.hidden = !label
        badge.setAttribute('data-erp-mode', label ? mode : '')
        badge.textContent = label || ''
        badge.title = label ? HINTS[mode] : ''
      }
    }
  }
})()
