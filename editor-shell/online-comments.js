(function () {
  // Comments of the page's document (plan-m5): loads the threads, answers the panel's actions through the API,
  // hands the placed ones to the editor (erpHost v3 comment calls, docs/erp-host.md) and follows the live room's
  // `comments.changed`. An editor without anchorOfSelection still gets document-wide threads ("Nhận xét chung").
  var online = window.erpOnline = window.erpOnline || {}
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  var CHANGED_WAIT = 250
  // An editor applies a burst of remote region updates one by one; anchors are placed again once it settles.
  var RESOLVE_WAIT = 1500
  var ANCHOR_MAX_BYTES = 8 * 1024
  // Every member reads the whole list on comments.changed without a thread; anchor patches while someone types
  // would otherwise make each page fetch it every 1.5 s.
  var FULL_RELOAD_GAP = 5000
  var NO_SELECTION = 'Chọn nội dung để nhận xét'

  function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b) }
  // The server's 8 KiB anchor limit counts UTF-8 bytes; Vietnamese text takes 2–3 per character.
  function utf8Length(text) {
    var length = 0
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i)
      if (code < 0x80) length += 1
      else if (code < 0x800) length += 2
      else if (code >= 0xd800 && code <= 0xdbff) { length += 4; i++ } else length += 3
    }
    return length
  }
  function anchorFits(anchor) { return utf8Length(JSON.stringify(anchor)) <= ANCHOR_MAX_BYTES }

  /**
   * deps: { api (online-comments-api.js), host (online-host.js), doc() → the page's document record | null,
   * notice(text), resolver() → true when this page places anchors again for everyone (the room's leader, or a page
   * with no leader around), onAccessChanged() after a 403/404, onChange() when the count or the panel changed,
   * onDeepLinkDone() once `?comment=` was handled }
   */
  online.createComments = function (deps) {
    var store = online.createCommentStore()
    var visible = false
    var docId = null
    var state = 'loading'
    var canResolve = null
    var loading = false
    var loadAgain = false
    var refused = false
    var mutations = 0
    var forkOpened = false
    var lastEditorView = null
    var draftAnchor = null
    var draftKey = null
    var replyKeys = {}
    var changedIds = null
    var changedTimer = null
    var resolveTimer = null
    var deepLink = null
    var anchorWaiting = null
    var knownRole = null
    var soonTimer = null
    var soonAgain = false

    var panel = online.createCommentsPanel({
      onClose: function () { closePanel() },
      onAdd: function () { add() },
      onCreate: create,
      onCancelCreate: function () {
        draftAnchor = null
        draftKey = null
      },
      onReply: reply,
      onEdit: function (threadId, commentId, body) {
        return write(deps.api.edit(docId, threadId, commentId, body), function (outcome) { if (!store.putComment(outcome.comment)) refreshThread(threadId) })
      },
      onDelete: function (threadId, commentId) {
        return write(deps.api.remove(docId, threadId, commentId), function () { refreshThread(threadId) })
      },
      onResolve: function (threadId) { return write(deps.api.resolve(docId, threadId), putThread) },
      onReopen: function (threadId) { return write(deps.api.reopen(docId, threadId), putThread) },
      onDeleteThread: function (threadId) {
        return write(deps.api.removeThread(docId, threadId), function () { store.remove(threadId) })
      },
      onSelect: function (threadId) { focusAnchor(store.get(threadId)) },
      onRetry: function () { load() }
    })

    function rights() {
      var doc = deps.doc()
      if (!doc || !doc.open || doc.accessLost) return { see: false, write: false, resolve: false }
      return online.commentRights(doc.role, doc.mode, canResolve)
    }
    function general() { return !deps.host.has('anchorOfSelection') }
    // The rights the panel last drew with; the bar renders often and the panel only when they change.
    var shownRights = null
    function render() {
      shownRights = rights()
      panel.setData({ state: state, threads: store.all(), rights: rights(), general: general() })
      showInEditor()
      deps.onChange()
    }
    // The editor draws a mark for each placed open thread; it is told again only when that list changes.
    function showInEditor() {
      if (!forkOpened) return
      var view = visible ? online.commentsForEditor(store.all()) : []
      if (lastEditorView !== null && sameJson(view, lastEditorView)) return
      lastEditorView = view
      deps.host.call('showComments', view)
    }
    function focusAnchor(thread) {
      if (!thread || online.commentAnchor.isDocument(thread.anchor)) return
      if (!forkOpened) {
        anchorWaiting = thread.id
        return
      }
      anchorWaiting = null
      deps.host.call('focusAnchor', thread.anchor, thread.id)
    }

    function load() {
      if (!visible) return
      if (loading) {
        loadAgain = true
        return
      }
      loading = true
      var id = docId
      var before = mutations
      deps.api.list(id).then(function (outcome) {
        loading = false
        if (id !== docId || !visible) return
        if (outcome.kind === 'ok') {
          // A change made here while the list was on its way is newer than the list.
          refused = false
          if (mutations === before) {
            store.reset(outcome.threads)
            canResolve = outcome.canResolve
            state = 'ready'
          } else {
            loadAgain = true
          }
        } else {
          // Once per refusal: the access check it starts may poll again before the new role reaches the bar.
          if ((outcome.kind === 'forbidden' || outcome.kind === 'notFound') && !refused) {
            refused = true
            deps.onAccessChanged()
          }
          if (state !== 'ready') state = 'error'
        }
        render()
        applyDeepLink()
        if (loadAgain) {
          loadAgain = false
          load()
        }
      })
    }
    // A whole-list read that follows the room, not the user: at most one per FULL_RELOAD_GAP, the last never lost.
    function loadSoon() {
      if (soonTimer) {
        soonAgain = true
        return
      }
      load()
      soonTimer = setTimeout(function () {
        soonTimer = null
        if (!soonAgain) return
        soonAgain = false
        loadSoon()
      }, FULL_RELOAD_GAP)
    }
    function refreshThread(threadId) {
      if (!UUID.test(threadId)) return
      var id = docId
      deps.api.get(id, threadId).then(function (outcome) {
        if (id !== docId || !visible) return
        if (outcome.kind === 'ok') store.put(outcome.thread)
        else if (outcome.kind === 'notFound') store.remove(threadId)
        else return
        render()
      })
    }
    function putThread(outcome) { store.put(outcome.thread) }

    function messageOf(outcome) {
      if (outcome.kind === 'offline') return 'Không kết nối được máy chủ. Hãy thử lại.'
      if (outcome.kind === 'signIn') return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
      if (outcome.kind === 'forbidden') return 'Bạn không có quyền làm việc này.'
      if (outcome.kind === 'notFound') return 'Không tìm thấy nhận xét này. Có thể nó vừa bị xoá.'
      var generic = [online.messages.failed, online.messages.busy, online.messages.rejected]
      if (outcome.message && generic.indexOf(outcome.message) === -1) return outcome.message
      return outcome.retryable ? 'Máy chủ đang bận. Hãy thử lại sau.' : 'Không gửi được. Hãy thử lại.'
    }
    // One write of the panel: null when it went through, its message otherwise.
    function write(promise, onOk) {
      mutations += 1
      return promise.then(function (outcome) {
        if (outcome.kind === 'ok') {
          onOk(outcome)
          render()
          return null
        }
        if (outcome.kind === 'forbidden') deps.onAccessChanged()
        if (outcome.kind === 'notFound') load()
        return messageOf(outcome)
      })
    }
    function create(body) {
      var doc = deps.doc()
      if (!doc || !draftAnchor) return Promise.resolve('Không tìm thấy chỗ cần nhận xét. Hãy chọn lại.')
      // The same key for every retry of this thread: a lost answer must not create it twice.
      if (!draftKey) draftKey = online.commentKey()
      var anchor = draftAnchor
      var input = { anchor: anchor, region: online.commentAnchor.region(anchor), version: typeof doc.version === 'number' ? doc.version : null, body: body }
      return write(deps.api.create(docId, input, draftKey), function (outcome) {
        draftAnchor = null
        draftKey = null
        store.put(outcome.thread)
        panel.focusThread(outcome.thread.id, 'open')
      })
    }
    function reply(threadId, body) {
      if (!replyKeys[threadId]) replyKeys[threadId] = online.commentKey()
      return write(deps.api.reply(docId, threadId, body, replyKeys[threadId]), function (outcome) {
        delete replyKeys[threadId]
        if (!store.putComment(outcome.comment)) refreshThread(threadId)
      })
    }

    function openPanel() {
      if (!visible) return
      panel.open()
      render()
    }
    function closePanel() {
      panel.close()
      deps.onChange()
    }

    /** "Thêm nhận xét" and Ctrl+Alt+M: the editor's selection becomes the new thread's place. */
    function add() {
      if (!visible || !rights().write) return
      if (general()) {
        draftAnchor = online.DOCUMENT_ANCHOR
        openPanel()
        panel.compose({ general: true })
        return
      }
      Promise.resolve(deps.host.call('anchorOfSelection')).then(function (anchor) {
        var json = anchor && typeof anchor === 'object' && !Array.isArray(anchor) ? JSON.stringify(anchor) : null
        if (!json || online.commentAnchor.isDocument(anchor)) return deps.notice(NO_SELECTION)
        if (!anchorFits(anchor)) return deps.notice('Không gắn được nhận xét vào chỗ này. Hãy chọn đoạn ngắn hơn.')
        if (!sameJson(draftAnchor, anchor)) draftKey = null
        draftAnchor = anchor
        openPanel()
        panel.compose({ quote: online.commentAnchor.quote(anchor) })
      }, function () { deps.notice(NO_SELECTION) })
    }

    function reconcile() {
      resolveTimer = null
      if (!visible || !forkOpened || !rights().write || !deps.host.has('resolveAnchors') || !deps.resolver()) return
      var threads = online.commentsForEditor(store.all())
      if (!threads.length) return
      var id = docId
      Promise.resolve(deps.host.call('resolveAnchors', threads)).then(function (updates) {
        if (id !== docId || !visible) return
        // An anchor the server would refuse (422) is left as it is rather than sent again on every pause.
        var changes = online.anchorChanges(updates, store).filter(function (change) { return !change.anchor || anchorFits(change.anchor) })
        if (!changes.length) return
        mutations += 1
        changes.forEach(function (change) {
          var thread = store.get(change.thread_id)
          var next = Object.assign({}, thread)
          if (change.anchor) {
            next.anchor = change.anchor
            next.region = change.region
          }
          if (change.status) next.status = change.status
          store.put(next)
        })
        render()
        return deps.api.patchAnchors(id, changes).then(function (outcome) {
          if (outcome.kind !== 'ok') loadSoon()
        })
      }, function () { /* the editor could not place them now; the next content change tries again */ })
    }

    function contentChanged() {
      clearTimeout(resolveTimer)
      resolveTimer = setTimeout(reconcile, RESOLVE_WAIT)
    }

    function applyDeepLink() {
      if (!deepLink) return
      var doc = deps.doc()
      if (!doc || !doc.open) return
      var target = deepLink
      if (!visible) {
        // Opened, but the bar has not drawn this role yet: update() comes back here.
        if (rights().see) return
        deepLink = null
        if (!doc.accessLost) deps.notice('Bạn không có quyền xem nhận xét của tài liệu này.')
        return deps.onDeepLinkDone()
      }
      if (state === 'loading') return
      deepLink = null
      var thread = store.get(target)
      if (!thread) {
        deps.notice('Không tìm thấy nhận xét này. Có thể nó đã bị xoá.')
        return deps.onDeepLinkDone()
      }
      openPanel()
      panel.focusThread(thread.id, online.commentFilterOf(thread))
      focusAnchor(thread)
      deps.onDeepLinkDone()
    }

    document.addEventListener('keydown', function (event) {
      var m = event.code === 'KeyM' || event.key === 'm' || event.key === 'M'
      if (!m || !event.altKey || !(event.ctrlKey || event.metaKey) || event.shiftKey) return
      if (!visible || !rights().write) return
      // Typing in a shell dialog or the share frame is not the document's selection.
      if (event.target && typeof event.target.closest === 'function' && event.target.closest('.erp-online, .erp-online-panel')) return
      event.preventDefault()
      event.stopPropagation()
      add()
    }, true)

    return {
      /** The page's access may have changed: show, hide or reload. Called on every render of the bar. */
      update: function () {
        var doc = deps.doc()
        var nowVisible = rights().see
        var id = doc ? doc.id : null
        var role = doc ? doc.role : null
        var roleChanged = role !== knownRole
        knownRole = role
        if (nowVisible && visible && id === docId && roleChanged) {
          // can_resolve came with the last list and belongs to the old role.
          canResolve = null
          load()
        }
        if (nowVisible && (!visible || id !== docId)) {
          visible = true
          docId = id
          state = 'loading'
          canResolve = null
          store.reset([])
          load()
          render()
        } else if (!nowVisible && visible) {
          visible = false
          store.reset([])
          state = 'loading'
          panel.close()
          render()
        } else if (visible && !sameJson(rights(), shownRights)) {
          render()
        }
        applyDeepLink()
      },
      visible: function () { return visible },
      canWrite: function () { return visible && rights().write },
      isOpen: function () { return panel.isOpen() },
      openCount: function () { return visible ? online.commentSections(store.all()).counts.open : 0 },
      toggle: function () {
        if (panel.isOpen()) closePanel()
        else openPanel()
      },
      add: add,
      /** `comments.changed` from the live room: one thread, or (null) several. */
      changed: function (threadId) {
        if (!visible) return
        if (!changedIds) changedIds = {}
        changedIds[typeof threadId === 'string' && UUID.test(threadId) ? threadId : '*'] = true
        if (changedTimer) return
        changedTimer = setTimeout(function () {
          var ids = changedIds
          changedIds = null
          changedTimer = null
          if (ids['*']) return loadSoon()
          Object.keys(ids).forEach(refreshThread)
        }, CHANGED_WAIT)
      },
      /** A (re)joined room: whatever changed while away. */
      resync: function () { load() },
      /** The periodic check of a page without a live room. */
      poll: function () { if (state !== 'loading') load() },
      /** The editor was handed content; its marks come again once it opened it. */
      loaded: function () {
        forkOpened = false
        lastEditorView = null
      },
      /** The editor opened the content: marks, a waiting focus, and anchors placed again on that content. */
      opened: function () {
        forkOpened = true
        lastEditorView = null
        showInEditor()
        if (anchorWaiting) focusAnchor(store.get(anchorWaiting))
        contentChanged()
      },
      /** The document's content changed under the anchors (a new version, remote region updates). */
      contentChanged: contentChanged,
      /** erpHost.commentClicked: the user clicked a thread's mark in the document. */
      clicked: function (threadId) {
        var thread = store.get(threadId)
        if (!visible || !thread) return
        openPanel()
        panel.focusThread(thread.id, online.commentFilterOf(thread))
      },
      /** `?comment=<thread>`: open the panel on it once the threads are known. */
      deepLink: function (threadId) {
        if (!UUID.test(threadId)) {
          deps.notice('Không tìm thấy nhận xét này. Có thể nó đã bị xoá.')
          return deps.onDeepLinkDone()
        }
        deepLink = threadId
        applyDeepLink()
      },
      panel: panel
    }
  }
})()
