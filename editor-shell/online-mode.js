(function () {
  // Access modes of erpHost v2 (docs/erp-host.md, "v2"): the caller's role on the document decides what the editor
  // allows, and the bar says so next to the save state.
  var online = window.erpOnline = window.erpOnline || {}
  var MODES = { owner: 'edit', editor: 'edit', commenter: 'comment', viewer: 'view', link: 'view' }
  var LABELS = { comment: 'Chỉ nhận xét', view: 'Chỉ xem' }
  var HINTS = {
    comment: 'Bạn có thể xem và nhận xét, không sửa được nội dung.',
    view: 'Bạn có quyền xem tài liệu này, không sửa được nội dung.'
  }
  var RANK = { view: 0, comment: 1, edit: 2 }
  var EDITORS_DEFAULT = 10
  function editorLimitMessage(max) { return 'Đã đủ ' + max + ' người sửa, bạn đang ở chế độ xem' }
  /** The live room let this editor in to view only: its editor slots are taken (openapi, "Live limits"). */
  online.EDITOR_LIMIT_MESSAGE = editorLimitMessage(EDITORS_DEFAULT)
  /** The room's own editor limit (hello `limits.max_editors`) names the number; older servers leave the default. */
  online.setEditorLimit = function (limits) {
    var max = limits && limits.max_editors
    if (typeof max === 'number' && max >= 1 && Math.floor(max) === max) online.EDITOR_LIMIT_MESSAGE = editorLimitMessage(max)
  }

  // Anything unknown maps to the narrowest mode; the server enforces the role anyway.
  online.modeOf = function (role) { return MODES[role] || 'view' }
  /** Owners and editors manage sharing (an editor may still be refused when the owner turned that off). */
  online.canManageSharing = function (role) { return role === 'owner' || role === 'editor' }
  /** True when `next` takes away something `current` allowed. */
  online.isDowngrade = function (current, next) { return RANK[next] < RANK[current] }
  /** The narrower of two modes; a missing cap leaves `mode` as it is. */
  online.capMode = function (mode, cap) { return cap && RANK[cap] !== undefined && RANK[cap] < RANK[mode] ? cap : mode }

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
      /** `notice` 'editor_limit' when the live room, not the role, keeps this user from editing. */
      render: function (mode, notice) {
        var label = LABELS[mode]
        badge.hidden = !label
        badge.setAttribute('data-erp-mode', label ? mode : '')
        badge.textContent = label || ''
        badge.title = label ? (notice === 'editor_limit' && mode === 'view' ? online.EDITOR_LIMIT_MESSAGE : HINTS[mode]) : ''
      }
    }
  }
})()
