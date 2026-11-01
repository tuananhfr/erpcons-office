(function () {
  // Comment threads of a document (erpcons-office-server docs/openapi.yaml, "Comments"; plan-m5). Outcomes as in
  // online-api.js: ok, notFound, forbidden, offline, signIn, failed. Bodies, names and anchors never reach a log.
  var online = window.erpOnline = window.erpOnline || {}
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  var STATUSES = ['open', 'resolved', 'orphaned']
  var PAGE = 200
  // The server keeps at most 2 000 threads per document.
  var MAX_PAGES = 10
  var MAX_ANCHOR_CHANGES = 200

  function text(value) { return typeof value === 'string' ? value : '' }
  function stamp(value) { return typeof value === 'string' && value ? value : null }

  function commentOf(body) {
    if (!body || !UUID.test(body.id) || !UUID.test(body.thread_id)) return null
    return {
      id: body.id, threadId: body.thread_id, authorName: text(body.author_name), mine: body.mine === true,
      // null once deleted: its place in the thread stays, the words do not.
      body: typeof body.body === 'string' && !body.deleted_at ? body.body : null,
      createdAt: stamp(body.created_at), editedAt: stamp(body.edited_at), deletedAt: stamp(body.deleted_at)
    }
  }
  function threadOf(body) {
    if (!body || !UUID.test(body.id) || STATUSES.indexOf(body.status) === -1 || !Array.isArray(body.comments)) return null
    var comments = []
    for (var i = 0; i < body.comments.length; i++) {
      var comment = commentOf(body.comments[i])
      if (comment) comments.push(comment)
    }
    if (!comments.length) return null
    return {
      id: body.id,
      anchor: body.anchor && typeof body.anchor === 'object' && !Array.isArray(body.anchor) ? body.anchor : null,
      region: typeof body.region === 'string' ? body.region : null,
      createdVersion: typeof body.created_version === 'number' ? body.created_version : null,
      status: body.status,
      createdByName: text(body.created_by_name),
      mine: body.mine === true,
      createdAt: stamp(body.created_at), updatedAt: stamp(body.updated_at),
      resolvedByName: typeof body.resolved_by_name === 'string' ? body.resolved_by_name : null,
      resolvedAt: stamp(body.resolved_at),
      comments: comments
    }
  }
  online.commentThreadOf = threadOf

  /** A fresh Idempotency-Key; the caller keeps it across retries of one create or reply. */
  online.commentKey = function () {
    if (crypto.randomUUID) return crypto.randomUUID()
    var bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.prototype.map.call(bytes, function (b) { return (b + 256).toString(16).slice(1) }).join('')
  }

  online.createCommentsApi = function (apiFetch) {
    var call = online.apiCaller(apiFetch)
    var JSON_HEADERS = { Accept: 'application/json' }
    function path(docId, rest) {
      return '/api/v1/documents/' + encodeURIComponent(docId) + '/comments' + (rest || '')
    }
    function threadPath(docId, threadId, rest) {
      if (!UUID.test(threadId)) return null
      return path(docId, '/' + encodeURIComponent(threadId) + (rest || ''))
    }
    function send(method, payload, key) {
      var headers = { Accept: 'application/json' }
      if (payload !== undefined) headers['Content-Type'] = 'application/json'
      if (key) headers['Idempotency-Key'] = key
      return { method: method, headers: headers, body: payload === undefined ? undefined : JSON.stringify(payload) }
    }
    function json(read) {
      return function (response) {
        return online.readJson(response).then(function (body) {
          var value = read(body)
          return value ? value : online.MALFORMED
        })
      }
    }
    function noContent() { return { kind: 'ok' } }
    var NOT_FOUND = Promise.resolve({ kind: 'notFound' })

    function listPage(docId, cursor) {
      var query = '?limit=' + PAGE + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
      return call(path(docId, query), { method: 'GET', headers: JSON_HEADERS }, json(function (body) {
        if (!body || !Array.isArray(body.threads)) return null
        var threads = body.threads.map(threadOf).filter(Boolean)
        return { kind: 'ok', threads: threads, canResolve: body.can_resolve === true, next: typeof body.next_cursor === 'string' && body.next_cursor ? body.next_cursor : null }
      }))
    }

    function setStatus(docId, threadId, rest) {
      var target = threadPath(docId, threadId, rest)
      if (!target) return NOT_FOUND
      return call(target, send('POST'), json(function (body) {
        var thread = threadOf(body)
        return thread && { kind: 'ok', thread: thread }
      }))
    }

    return {
      /** Every thread of the document, all statuses, oldest first; canResolve: owner and editors. */
      list: function (docId) {
        var all = []
        function more(cursor, pages) {
          return listPage(docId, cursor).then(function (outcome) {
            if (outcome.kind !== 'ok') return outcome
            all = all.concat(outcome.threads)
            if (!outcome.next || pages + 1 >= MAX_PAGES) return { kind: 'ok', threads: all, canResolve: outcome.canResolve }
            return more(outcome.next, pages + 1)
          })
        }
        return more(null, 0)
      },
      get: function (docId, threadId) {
        var target = threadPath(docId, threadId)
        if (!target) return NOT_FOUND
        return call(target, { method: 'GET', headers: JSON_HEADERS }, json(function (body) {
          var thread = threadOf(body)
          return thread && { kind: 'ok', thread: thread }
        }))
      },
      /** input: { anchor: object, region: string|null, version: number|null, body } */
      create: function (docId, input, key) {
        var payload = { anchor: input.anchor, body: input.body }
        if (input.region) payload.region = input.region
        if (typeof input.version === 'number') payload.version = input.version
        return call(path(docId), send('POST', payload, key), json(function (body) {
          var thread = threadOf(body)
          return thread && { kind: 'ok', thread: thread }
        }))
      },
      reply: function (docId, threadId, body, key) {
        var target = threadPath(docId, threadId, '/replies')
        if (!target) return NOT_FOUND
        return call(target, send('POST', { body: body }, key), json(function (answer) {
          var comment = commentOf(answer)
          return comment && { kind: 'ok', comment: comment }
        }))
      },
      edit: function (docId, threadId, commentId, body) {
        var target = UUID.test(commentId) ? threadPath(docId, threadId, '/comments/' + encodeURIComponent(commentId)) : null
        if (!target) return NOT_FOUND
        return call(target, send('PATCH', { body: body }), json(function (answer) {
          var comment = commentOf(answer)
          return comment && { kind: 'ok', comment: comment }
        }))
      },
      remove: function (docId, threadId, commentId) {
        var target = UUID.test(commentId) ? threadPath(docId, threadId, '/comments/' + encodeURIComponent(commentId)) : null
        if (!target) return NOT_FOUND
        return call(target, send('DELETE'), noContent)
      },
      resolve: function (docId, threadId) { return setStatus(docId, threadId, '/resolve') },
      reopen: function (docId, threadId) { return setStatus(docId, threadId, '/reopen') },
      removeThread: function (docId, threadId) {
        var target = threadPath(docId, threadId)
        if (!target) return NOT_FOUND
        return call(target, send('DELETE'), noContent)
      },
      /** updates: [{ thread_id, anchor?, region?, status? }], sent in batches of the server's limit. */
      patchAnchors: function (docId, updates) {
        var batches = []
        for (var i = 0; i < updates.length; i += MAX_ANCHOR_CHANGES) batches.push(updates.slice(i, i + MAX_ANCHOR_CHANGES))
        var updated = 0
        function next(index) {
          if (index >= batches.length) return Promise.resolve({ kind: 'ok', updated: updated })
          return call(path(docId, '/anchors'), send('PATCH', { updates: batches[index] }), json(function (body) {
            return { kind: 'ok', updated: body && typeof body.updated === 'number' ? body.updated : 0 }
          })).then(function (outcome) {
            if (outcome.kind !== 'ok') return outcome
            updated += outcome.updated
            return next(index + 1)
          })
        }
        return next(0)
      }
    }
  }
})()
