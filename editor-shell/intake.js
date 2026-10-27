(function (root) {
  // File intake contract (src/lib/files/intake-contract.ts, serialised before this script): validation, messages and
  // the IndexedDB queue shared by sw.js (share target) and open-file.js (editor side).
  var C = root.erpIntakeContract
  if (!C || C.version !== 1) return
  var own = Object.prototype.hasOwnProperty

  function extensionOf(name) {
    var parts = String(name).split('.')
    return parts.length > 1 ? parts.pop().toLowerCase() : ''
  }
  function editorFor(name) {
    var ext = extensionOf(name)
    return own.call(C.routes, ext) ? C.routes[ext] : undefined
  }
  // Bidi overrides can show "\u202efdp.exe" as "exe.pdf"; only displayed names are cleaned, editors get the real one.
  function displayName(name) {
    return String(name).replace(/[\u202a-\u202e\u2066-\u2069]/g, '')
  }
  function entry(reason) {
    return own.call(C.messages, reason) ? C.messages[reason] : C.messages.storageError
  }
  function message(reason) { return entry(reason).text }
  function code(reason) { return entry(reason).code }

  function hasSignature(kind, head) {
    var magic = C.signatures[kind].magic
    for (var start = 0; start <= C.signatures[kind].within && start + magic.length <= head.length; start++) {
      var hit = true
      for (var i = 0; i < magic.length && hit; i++) hit = head[start + i] === magic[i]
      if (hit) return true
    }
    return false
  }
  function matchesSignature(ext, head) {
    if (!own.call(C.rules, ext)) return C.unchecked.indexOf(ext) !== -1
    return C.rules[ext].some(function (kind) { return hasSignature(kind, head) })
  }
  // Twin of signatureFailure() in intake-contract.ts.
  function signatureFailure(ext, head) {
    if (matchesSignature(ext, head)) return null
    return C.oleRefused.indexOf(ext) !== -1 && hasSignature('ole', head) ? 'encryptedPresentation' : 'signature'
  }

  // Resolves to the reason the file is refused, or null; reading only the first KB keeps a 100 MB share cheap.
  function validate(file) {
    if (!file || typeof file.name !== 'string' || !editorFor(file.name)) return Promise.resolve('unsupported')
    if (!file.size) return Promise.resolve('empty')
    if (file.size > C.limits.maxFileBytes) return Promise.resolve('tooLarge')
    return Promise.resolve()
      .then(function () { return file.slice(0, C.limits.headBytes).arrayBuffer() })
      .then(function (buffer) { return signatureFailure(extensionOf(file.name), new Uint8Array(buffer)) },
        function () { return 'unreadableShare' })
  }

  function record(fields) {
    var now = Date.now()
    var result = {
      id: fields.id, batchId: null, sourceMode: null, name: '', claimedMime: '', size: 0, editor: null,
      state: 'RECEIVED', errorCode: null, reason: null, recoverable: false, createdAt: now, expiresAt: now + C.limits.ttlMs,
    }
    for (var key in fields) if (own.call(fields, key)) result[key] = fields[key]
    return result
  }
  // Failed entries keep their metadata for the batch page; bytes stay only when a retry can still use them.
  function fail(item, reason, retryable) {
    item.state = retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL'
    item.reason = reason
    item.errorCode = code(reason)
    item.recoverable = Boolean(retryable)
    if (!retryable) delete item.file
    return item
  }
  function isExpired(item, now) {
    return !item || item.expiresAt < (now || Date.now())
  }
  // Records written before the contract have no state; they are as good as READY.
  // A claim (open-file.js, another tab) holds the record until it is delivered, fails, or the claimant died.
  function deliverable(item, now) {
    if (item.claimedAt && (now || Date.now()) - item.claimedAt < C.limits.claimMs) return false
    return !item.state || item.state === 'READY' || item.state === 'ROUTED' || item.state === 'FAILED_RETRYABLE'
  }

  // Rejects with an Error whose `reason` is a message key.
  function openDb() {
    return new Promise(function (resolve, reject) {
      function refuse(reason) { var error = new Error(reason); error.reason = reason; reject(error) }
      var request
      try { request = indexedDB.open(C.db, 1) } catch (error) { refuse('storageDenied'); return }
      request.onupgradeneeded = function () { request.result.createObjectStore(C.store, { keyPath: 'id' }) }
      request.onblocked = function () { refuse('storageBusy') }
      request.onerror = function () { refuse('storageError') }
      request.onsuccess = function () { resolve(request.result) }
    })
  }
  function pruneExpired(store, now) {
    var all = store.getAll()
    all.onsuccess = function () {
      (all.result || []).forEach(function (item) { if (isExpired(item, now)) store.delete(item.id) })
    }
  }
  // Read-modify-write in one transaction, so a slower tab never overwrites a newer state; `change` returns false to skip.
  function update(db, id, change) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(C.store, 'readwrite')
      var store = transaction.objectStore(C.store)
      var read = store.get(id)
      var result = null
      read.onsuccess = function () {
        var item = read.result
        if (!item || change(item) === false) return
        result = item
        store.put(item)
      }
      transaction.oncomplete = function () { resolve(result) }
      transaction.onabort = function () { reject(transaction.error) }
    })
  }

  root.erpIntake = {
    contract: C,
    extensionOf: extensionOf,
    editorFor: editorFor,
    displayName: displayName,
    message: message,
    code: code,
    matchesSignature: matchesSignature,
    validate: validate,
    record: record,
    fail: fail,
    isExpired: isExpired,
    deliverable: deliverable,
    openDb: openDb,
    pruneExpired: pruneExpired,
    update: update,
  }
})(typeof window !== 'undefined' ? window : self)
