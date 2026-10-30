(function () {
  // An ERP page on another origin embeds the editor: it sends a file in and takes saves back.
  // Protocols v1 and v2 are documented in docs/erp-embed.md; the ERP side must match them.
  var NS = 'erp-office'
  var params = new URLSearchParams(location.search)
  if (params.get('embed') !== 'erpcons') return
  var origin = params.get('parent')
  var hosts = window.erpEmbedHosts || []
  if (!origin || hosts.indexOf(origin) === -1) return

  var editor = location.pathname.split('/')[1]
  var originalName = null
  var wantsV2 = params.get('v') === '2'
  // With v=2 it stays null until the editor shows whether it speaks erpHost; until then nothing from the ERP is read.
  var protocol = wantsV2 ? null : 1

  function post(type, payload, transfer) {
    var message = { ns: NS, v: protocol || 1, type: type }
    for (var key in payload) message[key] = payload[key]
    window.parent.postMessage(message, origin, transfer || [])
  }

  window.erpEditorClosed = function () {
    originalName = null
    // v2 reports the ERP's document closing through erpHost.closed; posting here as well would close it twice.
    if (protocol !== 2) post('closed', {})
  }

  function onOpen(data) {
    if (typeof data.name !== 'string' || !(data.bytes instanceof ArrayBuffer)) return
    var name = data.name
    window.erpShellDeliver([new File([data.bytes], name)], name, function () {
      originalName = name
      post('opened', { name: name })
    }, function () {
      post('open-failed', { reason: 'Công cụ không nhận được tệp “' + name + '”.' })
    })
  }

  function sameName(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase()
  }
  // Only a save under the opened file's own name becomes a new version: exports, prints, splits and
  // "Save As" copies download as usual.
  function classifySave(original, target) {
    return original && sameName(original, target) ? 'capture' : 'passthrough'
  }

  var counter = 0
  var waiting = {}
  function nextSaveId() {
    counter += 1
    return Date.now().toString(36) + '-' + counter
  }
  function sendSave(name, bytes, ack) {
    var id = nextSaveId()
    post('save', { id: id, name: name, bytes: bytes, ack: ack }, [bytes])
    return id
  }
  function settle(id, error) {
    var entry = waiting[id]
    if (!entry) return
    delete waiting[id]
    clearTimeout(entry.timer)
    if (error) entry.reject(error)
    else entry.resolve()
  }
  function awaitAck(id) {
    return new Promise(function (resolve, reject) {
      waiting[id] = { resolve: resolve, reject: reject, timer: setTimeout(function () { settle(id, new Error('Hết thời gian chờ lưu')) }, 120000) }
    })
  }

  function toBytes(data) {
    if (data instanceof Blob) return data.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer) })
    if (data instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(data.slice(0)))
    if (ArrayBuffer.isView(data)) return Promise.resolve(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)))
    if (data && data.type === 'write') return toBytes(data.data)
    return Promise.reject(new Error('Dữ liệu ghi không hợp lệ'))
  }
  function joined(chunks) {
    var size = 0
    chunks.forEach(function (chunk) { size += chunk.byteLength })
    var out = new Uint8Array(size)
    var at = 0
    chunks.forEach(function (chunk) { out.set(chunk, at); at += chunk.byteLength })
    return out.buffer
  }
  // A FileSystemFileHandle look-alike: the editors only call createWritable → write → close.
  function handleFor(name, finish) {
    return {
      kind: 'file',
      name: name,
      createWritable: function () {
        var chunks = []
        var pending = Promise.resolve()
        return Promise.resolve({
          write: function (data) {
            pending = pending.then(function () { return toBytes(data) }).then(function (chunk) { chunks.push(chunk) })
            return pending
          },
          close: function () { return pending.then(function () { return finish(joined(chunks)) }) },
          abort: function () { chunks = []; return Promise.resolve() },
        })
      },
    }
  }

  var nativeCreateUrl = URL.createObjectURL
  var nativeRevokeUrl = URL.revokeObjectURL
  var nativeClick = HTMLAnchorElement.prototype.click
  function download(name, buffer) {
    var url = nativeCreateUrl.call(URL, new Blob([buffer]))
    var anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    nativeClick.call(anchor)
    setTimeout(function () { nativeRevokeUrl.call(URL, url) }, 0)
  }

  // GridCraft answers a rejected save by re-delivering the same bytes as an anchor download; that copy
  // must reach the disk, not become a second save.
  var failedSave = null
  function isFallbackOfFailedSave(name) {
    return failedSave !== null && sameName(failedSave.name, name) && Date.now() - failedSave.at < 5000
  }

  // Never the native picker: a cross-origin frame may not show it (SecurityError) and
  // Word/PowerPoint have no fallback, so exports download directly.
  window.showSaveFilePicker = function (options) {
    var target = options && options.suggestedName ? String(options.suggestedName) : ''
    if (classifySave(originalName, target) === 'capture') {
      return Promise.resolve(handleFor(target, function (buffer) {
        return awaitAck(sendSave(target, buffer, true)).catch(function (error) {
          failedSave = { name: target, at: Date.now() }
          throw error
        })
      }))
    }
    return Promise.resolve(handleFor(target, function (buffer) { download(target, buffer) }))
  }

  // PdfCraft saves by clicking a blob: anchor and revoking the URL straight after, so keep each
  // blob by URL until it is revoked; the click handler takes the blob synchronously.
  var blobs = {}
  URL.createObjectURL = function (object) {
    var url = nativeCreateUrl.call(URL, object)
    if (object instanceof Blob) blobs[url] = object
    return url
  }
  URL.revokeObjectURL = function (url) {
    delete blobs[url]
    return nativeRevokeUrl.call(URL, url)
  }
  HTMLAnchorElement.prototype.click = function () {
    var blob = this.download ? blobs[this.href] : null
    if (blob && isFallbackOfFailedSave(this.download)) failedSave = null
    else if (blob && classifySave(originalName, this.download) === 'capture') {
      var name = this.download
      blob.arrayBuffer().then(function (buffer) { sendSave(name, buffer, false) })
      return
    }
    return nativeClick.apply(this, arguments)
  }

  // Keyed by draft: with several documents open, one being saved must not clear the others.
  var unsaved = {}
  var dirty = false
  function report() {
    // v2 has no dirty message: the ERP tracks saves itself and asks for a flush.
    if (protocol !== 1) return
    var next = Object.keys(unsaved).length > 0
    if (dirty === next) return
    dirty = next
    post('dirty', { dirty: next })
  }
  window.erpDrafts = {
    put: function (key) { unsaved[key] = true; report() },
    remove: function (key) { delete unsaved[key]; report() },
    ready: function () {
      // The editor's first frame: an editor that speaks erpHost registers with it within that frame.
      if (protocol === null) waitForEditor(REGISTER_GRACE_MS)
    },
  }

  var handlers = {
    open: onOpen,
    saved: function (data) { settle(data.id) },
    'save-failed': function (data) { settle(data.id, new Error(typeof data.message === 'string' && data.message ? data.message : 'Lưu thất bại')) },
  }

  // Protocol v2: the editor's own erpHost (docs/erp-host.md) is wired to the ERP page, which brings AutoSave,
  // conflicts, offline and access modes. An editor build without erpHost never registers and keeps v1.
  var REGISTER_GRACE_MS = 1500
  var READY_LIMIT_MS = 120000
  // Past this the save resolves `offline`; the ERP's answer arriving later still reaches the editor as acknowledged.
  var SAVE_ANSWER_MS = 60000
  // erp-host.md bounds the editor's flush to 10 s; this keeps an ERP waiting for `flushed` from hanging on a bad one.
  var FLUSH_LIMIT_MS = 10000
  var SAVE_FAILED = 'Lưu thất bại'
  var editorHandlers = null
  var decideTimer = null
  var hostDocs = {}
  var answers = {}
  var retried = {}

  function choose(version) {
    if (protocol !== null) return
    protocol = version
    clearTimeout(decideTimer)
    if (version === 2) post('ready', { editor: editor, host: true })
    else post('ready', { editor: editor })
  }
  function waitForEditor(ms) {
    clearTimeout(decideTimer)
    decideTimer = setTimeout(function () { choose(1) }, ms)
  }

  // Handlers past open are optional, as in online-host.js: an editor built against an older contract lacks some.
  function callEditor(name) {
    var fn = editorHandlers && editorHandlers[name]
    if (typeof fn !== 'function') return undefined
    try { return fn.apply(editorHandlers, Array.prototype.slice.call(arguments, 1)) } catch (error) { return undefined }
  }

  function copyOf(bytes) {
    if (bytes instanceof ArrayBuffer) return bytes.slice(0)
    if (ArrayBuffer.isView(bytes)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    return null
  }
  function extensionOf(name) {
    var dot = name.lastIndexOf('.')
    return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
  }
  // Only the shapes erp-host.md defines reach the editor; anything else is a failure it can show.
  function saveResult(raw) {
    var status = raw && raw.status
    if (status === 'saved' && typeof raw.version === 'number') return { status: 'saved', version: raw.version }
    if (status === 'conflict' && typeof raw.latestVersion === 'number') return { status: 'conflict', latestVersion: raw.latestVersion }
    if (status === 'offline') return { status: 'offline' }
    var message = status === 'failed' && typeof raw.message === 'string' && raw.message ? raw.message : SAVE_FAILED
    return { status: 'failed', retryable: status === 'failed' && raw.retryable === true, message: message }
  }
  function willRetry(result) {
    return result.status === 'offline' || (result.status === 'failed' && result.retryable)
  }

  function saveToErp(docId, bytes, options) {
    var buffer = copyOf(bytes)
    if (protocol !== 2 || !buffer) return Promise.resolve(saveResult(null))
    var id = nextSaveId()
    var revision = options ? options.revision : undefined
    var reason = options ? options.reason : undefined
    return new Promise(function (resolve) {
      answers[id] = {
        resolve: resolve,
        docId: String(docId),
        revision: revision,
        timer: setTimeout(function () { answer(id, { status: 'offline' }) }, SAVE_ANSWER_MS),
      }
      post('save', { id: id, docId: String(docId), revision: revision, reason: reason, bytes: buffer }, [buffer])
    })
  }
  // An `offline` or retryable `failed` save stays known: the ERP may store it later on its own retry and say
  // `saved` for the same id, which the editor hears as acknowledged (erp-host.md).
  function answer(id, raw) {
    var result = saveResult(raw)
    var entry = answers[id]
    if (entry) {
      delete answers[id]
      clearTimeout(entry.timer)
      if (willRetry(result)) retried[id] = { docId: entry.docId, revision: entry.revision }
      entry.resolve(result)
      return
    }
    var earlier = retried[id]
    if (!earlier || willRetry(result)) return
    delete retried[id]
    if (result.status === 'saved') callEditor('acknowledged', earlier.docId, earlier.revision, result.version)
  }

  var handlersV2 = {
    open: function (data) {
      var doc = data.doc
      if (!doc || typeof doc.docId !== 'string' || typeof doc.name !== 'string' || !(doc.bytes instanceof ArrayBuffer)) return
      hostDocs[doc.docId] = doc.name
      var given = {
        docId: doc.docId,
        version: typeof doc.revision === 'number' ? doc.revision : 0,
        title: doc.name,
        format: typeof doc.format === 'string' && doc.format ? doc.format : extensionOf(doc.name),
        bytes: new Uint8Array(doc.bytes),
      }
      if (doc.mode !== undefined) given.mode = doc.mode
      if (doc.canDownload !== undefined) given.canDownload = doc.canDownload
      callEditor('open', given)
    },
    'save-result': function (data) {
      if (typeof data.id === 'string') answer(data.id, data.result)
    },
    'set-mode': function (data) {
      if (typeof data.docId === 'string') callEditor('setMode', data.docId, data.mode, data.canDownload)
    },
    flush: function (data) {
      var replied = false
      var timer = null
      function reply() {
        if (replied) return
        replied = true
        clearTimeout(timer)
        post('flushed', { id: data.id })
      }
      timer = setTimeout(reply, FLUSH_LIMIT_MS)
      Promise.resolve(callEditor('flush')).then(reply, reply)
    },
  }

  if (wantsV2) {
    window.erpHost = Object.freeze({
      version: 2,
      ready: function (given) {
        if (editorHandlers || protocol === 1 || !given || typeof given.open !== 'function') return
        editorHandlers = given
        choose(2)
      },
      save: saveToErp,
      dirty: function () {},
      opened: function (docId, ok, reason) {
        var id = String(docId)
        if (!hostDocs.hasOwnProperty(id)) return
        if (ok) { post('opened', { name: hostDocs[id] }); return }
        var name = hostDocs[id]
        delete hostDocs[id]
        var intake = window.erpIntake
        var key = reason === 'unsupported' ? 'unsupported' : 'parserFailed'
        var why = intake && reason !== undefined ? ' ' + intake.message(key) : ''
        post('open-failed', { reason: 'Không mở được “' + name + '” trong công cụ này.' + why })
      },
      closed: function (docId) {
        var id = String(docId)
        if (!hostDocs.hasOwnProperty(id)) return
        delete hostDocs[id]
        post('closed', {})
      },
    })
    // An editor that never starts would leave the ERP waiting for ready; v1 at least reports its open as failed.
    waitForEditor(READY_LIMIT_MS)
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== origin || event.source !== window.parent) return
    var data = event.data
    if (!data || data.ns !== NS || protocol === null || data.v !== protocol) return
    var table = protocol === 2 ? handlersV2 : handlers
    if (!table.hasOwnProperty(data.type)) return
    table[data.type](data)
  })

  window.erpEmbed = {
    origin: origin,
    editor: editor,
    post: post,
    handlers: handlers,
    classifySave: classifySave,
    originalName: function () { return originalName },
    protocol: function () { return protocol },
  }
  document.documentElement.classList.add('erp-embedded')
  if (protocol === 1) post('ready', { editor: editor })
})()
