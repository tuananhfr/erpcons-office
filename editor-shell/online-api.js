(function () {
  // The Office API calls the shell makes (erpcons-office-server/docs/openapi.yaml), mapped to plain outcomes:
  // ok, saved, conflict, notFound, offline, signIn, failed { retryable, message, retryAfter }.
  var online = window.erpOnline = window.erpOnline || {}
  var FORMATS = ['docx', 'xlsx', 'pptx', 'pdf']
  var MESSAGE_MAX = 300
  var MESSAGES = {
    notFound: 'Không tìm thấy tài liệu hoặc bạn không có quyền mở',
    offline: 'Không kết nối được máy chủ',
    signIn: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để lưu lên máy chủ.',
    busy: 'Máy chủ đang bận. Văn phòng sẽ tự lưu lại sau.',
    rejected: 'Máy chủ không nhận bản lưu này.',
    failed: 'Không lưu được lên máy chủ. Hãy thử lại.'
  }
  online.messages = MESSAGES

  function readJson(response) {
    return response.text().then(function (text) {
      try { return text ? JSON.parse(text) : null } catch (e) { return null }
    }, function () { return null })
  }
  function serverMessage(body, fallback) {
    var text = body && typeof body.message_vi === 'string' ? body.message_vi.trim() : ''
    return text && text.length <= MESSAGE_MAX ? text : fallback
  }
  function retryAfter(response) {
    var value = response.headers.get('Retry-After')
    return value !== null && /^\d+$/.test(value.trim()) ? parseInt(value, 10) : null
  }
  function positive(value) {
    return typeof value === 'number' && value >= 1 && Math.floor(value) === value ? value : null
  }
  function documentOf(body) {
    if (!body || typeof body.id !== 'string' || typeof body.title !== 'string' || FORMATS.indexOf(body.format) === -1 || !positive(body.version)) return null
    return { id: body.id, title: body.title, format: body.format, version: body.version, folderId: typeof body.folder_id === 'string' ? body.folder_id : null }
  }
  var MALFORMED = { kind: 'failed', retryable: true, message: MESSAGES.failed, retryAfter: null }

  // Rejections of erpAccount.apiFetch carry account.js codes; a refused URL is a bug and must surface.
  function thrown(error) {
    var code = error && error.code
    if (code === 'invalid_api_path') throw error
    if (code === 'network') return { kind: 'offline' }
    if (code === 'unauthenticated' || code === 'signed_out' || code === 'session_expired' || code === 'insufficient_scope') return { kind: 'signIn' }
    if (code === 'rate_limited' || code === 'dependency_unavailable') {
      return { kind: 'failed', retryable: true, message: MESSAGES.busy, retryAfter: typeof error.retryAfter === 'number' ? error.retryAfter : null }
    }
    return MALFORMED
  }
  // Clients branch on status and `code` only; `message_vi` is just shown (openapi.yaml, Error).
  function problem(response) {
    return readJson(response).then(function (body) {
      var status = response.status
      var code = body && typeof body.code === 'string' ? body.code : null
      // 404 says nothing about whether the document exists (§08).
      if (status === 404) return { kind: 'notFound' }
      if (status === 409 && code === 'VERSION_CONFLICT') return { kind: 'conflict', latestVersion: positive(body.latest_version) }
      if (status === 429 || status === 503) return { kind: 'failed', retryable: true, message: serverMessage(body, MESSAGES.busy), retryAfter: retryAfter(response) }
      if (status === 413 || status === 422) return { kind: 'failed', retryable: false, message: serverMessage(body, MESSAGES.rejected), retryAfter: null }
      if (status === 428) return { kind: 'failed', retryable: false, message: MESSAGES.failed, retryAfter: null }
      // A 502/504 from the reverse proxy means the server is down: retry unless the body says otherwise.
      var retryable = status >= 500 ? !(body && body.retryable === false) : Boolean(body && body.retryable === true)
      return { kind: 'failed', retryable: retryable, message: serverMessage(body, MESSAGES.failed), retryAfter: retryAfter(response) }
    })
  }

  online.createApi = function (apiFetch) {
    function call(path, init, onOk) {
      var sent
      try { sent = apiFetch(path, init) } catch (error) { return Promise.reject(error) }
      return sent.then(function (response) {
        return response.ok ? onOk(response) : problem(response)
      }, function (error) { return thrown(error) })
    }
    function path(id, rest) { return '/api/v1/documents/' + encodeURIComponent(id) + (rest || '') }
    function getDocument(id) {
      return call(path(id), { method: 'GET', headers: { Accept: 'application/json' } }, function (response) {
        return readJson(response).then(function (body) {
          var doc = documentOf(body)
          var etag = response.headers.get('ETag')
          return doc && etag ? { kind: 'ok', doc: doc, etag: etag } : MALFORMED
        })
      })
    }
    function getContent(id) {
      return call(path(id, '/content'), { method: 'GET', headers: { Accept: 'application/octet-stream' } }, function (response) {
        var etag = response.headers.get('ETag')
        var version = parseInt(response.headers.get('X-Document-Version') || '', 10)
        if (!etag || !positive(version)) return MALFORMED
        return response.arrayBuffer().then(function (buffer) {
          return { kind: 'ok', bytes: new Uint8Array(buffer), etag: etag, version: version }
        }, function () { return { kind: 'offline' } })
      })
    }
    function putContent(id, bytes, etag) {
      var init = { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'If-Match': etag, Accept: 'application/json' }, body: bytes }
      return call(path(id, '/content'), init, function (response) {
        return readJson(response).then(function (body) {
          var doc = documentOf(body)
          var next = response.headers.get('ETag')
          if (!doc) return MALFORMED
          if (next) return { kind: 'saved', doc: doc, version: doc.version, etag: next }
          // Durable already; only the precondition for the next save is missing.
          return getDocument(id).then(function (meta) {
            return { kind: 'saved', doc: doc, version: doc.version, etag: meta.kind === 'ok' && meta.doc.version === doc.version ? meta.etag : null }
          })
        })
      })
    }
    function createDocument(bytes, title, format, folderId, idempotencyKey) {
      var form = new FormData()
      // The display name travels in `title`; the part's file name only carries the extension.
      form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), 'tai-lieu.' + format)
      form.append('title', title)
      if (folderId) form.append('folder_id', folderId)
      var init = { method: 'POST', headers: { Accept: 'application/json', 'Idempotency-Key': idempotencyKey }, body: form }
      return call('/api/v1/documents', init, function (response) {
        return readJson(response).then(function (body) {
          var doc = documentOf(body)
          var etag = response.headers.get('ETag')
          return doc && etag ? { kind: 'ok', doc: doc, etag: etag } : MALFORMED
        })
      })
    }
    return { getDocument: getDocument, getContent: getContent, putContent: putContent, createDocument: createDocument }
  }
})()
