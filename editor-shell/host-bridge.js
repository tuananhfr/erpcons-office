(function () {
  // An ERP page on another origin embeds the editor: it sends a file in and takes saves back.
  // Protocol v1 is documented in docs/erp-embed.md; the ERP side must match it.
  var NS = 'erp-office'
  var VERSION = 1
  var params = new URLSearchParams(location.search)
  if (params.get('embed') !== 'erpcons') return
  var origin = params.get('parent')
  var hosts = window.erpEmbedHosts || []
  if (!origin || hosts.indexOf(origin) === -1) return

  var editor = location.pathname.split('/')[1]
  var originalName = null

  function post(type, payload, transfer) {
    var message = { ns: NS, v: VERSION, type: type }
    for (var key in payload) message[key] = payload[key]
    window.parent.postMessage(message, origin, transfer || [])
  }

  window.erpEditorClosed = function () {
    originalName = null
    post('closed', {})
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
  function sendSave(name, bytes, ack) {
    counter += 1
    var id = Date.now().toString(36) + '-' + counter
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
    var next = Object.keys(unsaved).length > 0
    if (dirty === next) return
    dirty = next
    post('dirty', { dirty: next })
  }
  window.erpDrafts = {
    put: function (key) { unsaved[key] = true; report() },
    remove: function (key) { delete unsaved[key]; report() },
    ready: function () {},
  }

  var handlers = {
    open: onOpen,
    saved: function (data) { settle(data.id) },
    'save-failed': function (data) { settle(data.id, new Error(typeof data.message === 'string' && data.message ? data.message : 'Lưu thất bại')) },
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== origin || event.source !== window.parent) return
    var data = event.data
    if (!data || data.ns !== NS || data.v !== VERSION || !handlers.hasOwnProperty(data.type)) return
    handlers[data.type](data)
  })

  window.erpEmbed = {
    origin: origin,
    editor: editor,
    post: post,
    handlers: handlers,
    classifySave: classifySave,
    originalName: function () { return originalName },
  }
  document.documentElement.classList.add('erp-embedded')
  post('ready', { editor: editor })
})()
