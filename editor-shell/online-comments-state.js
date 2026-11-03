(function () {
  // What the comments panel shows, apart from the DOM: anchors as the shell may read them (docs/erp-host.md, "v3
  // comments"), threads in document order, the sections of each filter and who may do what (plan-m5, "Quyền").
  var online = window.erpOnline = window.erpOnline || {}
  var QUOTE_MAX = 200
  var ORDER_MAX = 8

  /** The anchor a thread gets when the editor cannot place one (an editor without anchorOfSelection). */
  online.DOCUMENT_ANCHOR = { kind: 'document' }

  function isDocumentAnchor(anchor) {
    if (!anchor || typeof anchor !== 'object') return true
    return anchor.kind === 'document' || Object.keys(anchor).length === 0
  }
  /** The editor's position key: up to 8 finite numbers, compared in order (page, then y, then x…). */
  function orderOf(anchor) {
    if (!anchor || !Array.isArray(anchor.order) || !anchor.order.length || anchor.order.length > ORDER_MAX) return null
    for (var i = 0; i < anchor.order.length; i++) if (typeof anchor.order[i] !== 'number' || !isFinite(anchor.order[i])) return null
    return anchor.order
  }
  // The forks' `label` (where the thread sits: "Trang 3", "Sheet1!B4"); an older `quote` (the selected words) otherwise.
  function quoteOf(anchor) {
    var text = anchor && typeof anchor.label === 'string' && anchor.label.trim() ? anchor.label : anchor && anchor.quote
    if (typeof text !== 'string') return ''
    var quote = text.replace(/\s+/g, ' ').trim()
    return quote.length > QUOTE_MAX ? quote.slice(0, QUOTE_MAX - 1) + '…' : quote
  }
  function regionOf(anchor) {
    var region = anchor && anchor.region
    return typeof region === 'string' && region.length >= 1 && region.length <= 256 ? region : null
  }
  online.commentAnchor = { isDocument: isDocumentAnchor, order: orderOf, quote: quoteOf, region: regionOf }

  function compareOrder(a, b) {
    var n = Math.min(a.length, b.length)
    for (var i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return a.length - b.length
  }
  function byCreated(a, b) {
    var x = a.createdAt || ''
    var y = b.createdAt || ''
    return x < y ? -1 : x > y ? 1 : (a.id < b.id ? -1 : 1)
  }
  // Placed threads by the editor's position key; threads without one keep their creation order after them.
  function byPosition(a, b) {
    var x = orderOf(a.anchor)
    var y = orderOf(b.anchor)
    if (x && y) return compareOrder(x, y) || byCreated(a, b)
    if (x || y) return x ? -1 : 1
    return byCreated(a, b)
  }
  function byResolved(a, b) {
    var x = a.resolvedAt || ''
    var y = b.resolvedAt || ''
    return x > y ? -1 : x < y ? 1 : byCreated(a, b)
  }

  /**
   * The panel's lists: `open` the placed and general threads in document order, `orphaned` the threads whose place is
   * gone ("Không còn vị trí"), `resolved` the handled ones, newest first. Counts feed the filter and the bar.
   */
  online.commentSections = function (threads) {
    var open = []
    var orphaned = []
    var resolved = []
    threads.forEach(function (thread) {
      if (thread.status === 'resolved') resolved.push(thread)
      else if (thread.status === 'orphaned') orphaned.push(thread)
      else open.push(thread)
    })
    open.sort(byPosition)
    orphaned.sort(byCreated)
    resolved.sort(byResolved)
    return { open: open, orphaned: orphaned, resolved: resolved, counts: { open: open.length + orphaned.length, resolved: resolved.length } }
  }

  /** The filter a thread is listed under. */
  online.commentFilterOf = function (thread) { return thread && thread.status === 'resolved' ? 'resolved' : 'open' }

  var READERS = ['owner', 'editor', 'commenter', 'viewer', 'link']
  var WRITERS = ['owner', 'editor', 'commenter']
  /**
   * see: everyone who opens the document, viewers and link holders read-only; write: create, reply and change one's
   * own, owner/editors/commenters in edit or comment mode; resolve: resolve, reopen and delete anyone's threads.
   * `canResolve` is the server's word for it (list `can_resolve`); without one the role decides.
   */
  online.commentRights = function (role, mode, canResolve) {
    var see = READERS.indexOf(role) !== -1
    var write = WRITERS.indexOf(role) !== -1 && (mode === 'edit' || mode === 'comment')
    var moderator = typeof canResolve === 'boolean' ? canResolve : role === 'owner' || role === 'editor'
    return { see: see, write: write, resolve: write && moderator }
  }

  /** A thread's author resolves and reopens it while it may write; anyone else's needs `resolve`. */
  online.canResolveThread = function (rights, thread) {
    return Boolean(rights.resolve || (rights.write && thread && thread.mine))
  }

  /** A map of threads by id, the panel's source of truth between reads. */
  online.createCommentStore = function () {
    var byId = {}
    return {
      reset: function (threads) {
        byId = {}
        threads.forEach(function (thread) { byId[thread.id] = thread })
      },
      put: function (thread) { byId[thread.id] = thread },
      remove: function (id) { delete byId[id] },
      get: function (id) { return byId[id] || null },
      all: function () { return Object.keys(byId).map(function (id) { return byId[id] }) },
      /** A reply or an edit the server answered with: in its place, or after the others. */
      putComment: function (comment) {
        var thread = byId[comment.threadId]
        if (!thread) return false
        var comments = thread.comments.slice()
        var at = -1
        for (var i = 0; i < comments.length; i++) if (comments[i].id === comment.id) at = i
        if (at === -1) comments.push(comment)
        else comments[at] = comment
        byId[thread.id] = Object.assign({}, thread, { comments: comments })
        return true
      }
    }
  }

  /** What the editor gets in showComments and resolveAnchors: placed threads only, never names or words. */
  online.commentsForEditor = function (threads) {
    return threads.filter(function (thread) { return !isDocumentAnchor(thread.anchor) }).map(function (thread) {
      var count = thread.comments.filter(function (comment) { return !comment.deletedAt }).length
      return { id: thread.id, anchor: thread.anchor, status: thread.status, count: count }
    })
  }

  // The server keeps anchors as JSON whose key order it may change: compared with sorted keys, not as sent.
  function stableJson(value) {
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']'
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stableJson(value[key]) }).join(',') + '}'
    }
    return JSON.stringify(value)
  }

  /**
   * The PATCH anchors entries for what the editor's resolveAnchors returned, keeping only real changes.
   * updates: [{ id, anchor?, status?: 'open' | 'orphaned' }] (or `threadId`); omitted threads are unchanged.
   */
  online.anchorChanges = function (updates, store) {
    if (!Array.isArray(updates)) return []
    var changes = []
    var seen = {}
    updates.forEach(function (update) {
      // The forks answer with `id`, as showComments gave it; `threadId` is the earlier name.
      var threadId = update && (typeof update.id === 'string' ? update.id : update.threadId)
      if (typeof threadId !== 'string' || seen[threadId]) return
      var thread = store.get(threadId)
      if (!thread || isDocumentAnchor(thread.anchor)) return
      // The fork's first word on a thread counts; a repeat is a fork bug, not a second move.
      seen[thread.id] = true
      var change = { thread_id: thread.id }
      var differs = false
      var anchor = update.anchor
      if (anchor && typeof anchor === 'object' && !Array.isArray(anchor) && !isDocumentAnchor(anchor) && stableJson(anchor) !== stableJson(thread.anchor)) {
        change.anchor = anchor
        change.region = regionOf(anchor)
        differs = true
      }
      // A resolved thread keeps its status (the server ignores it too); only open and orphaned move.
      if ((update.status === 'open' || update.status === 'orphaned') && thread.status !== 'resolved' && update.status !== thread.status) {
        change.status = update.status
        differs = true
      }
      if (differs) changes.push(change)
    })
    return changes
  }
})()
