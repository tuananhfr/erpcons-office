(function () {
  // Last unacknowledged bytes of each online document, until the server confirms them (docs/erp-host.md,
  // spec §07 "local checkpoint"). Apart from erpDrafts: a host document never lands there.
  var online = window.erpOnline = window.erpOnline || {}
  var NAME = 'erpcons-online-pending'
  var STORE = 'pending'
  var VERSION = 1

  function integer(value) { return typeof value === 'number' && value >= 0 && Math.floor(value) === value }
  function intact(record) {
    return Boolean(record) && record.v === VERSION && typeof record.docId === 'string' && typeof record.sub === 'string'
      && typeof record.title === 'string' && typeof record.format === 'string' && typeof record.baseEtag === 'string'
      && integer(record.baseVersion) && integer(record.savedAt)
      && record.bytes instanceof Uint8Array && record.bytes.length === record.size
  }

  online.createPendingStore = function (idb) {
    var opening = null
    function open() {
      if (opening) return opening
      opening = new Promise(function (resolve, reject) {
        if (!idb) return reject(new Error('unavailable'))
        var request
        try { request = idb.open(NAME, VERSION) } catch (e) { return reject(e) }
        request.onupgradeneeded = function () { request.result.createObjectStore(STORE, { keyPath: 'docId' }) }
        request.onsuccess = function () { resolve(request.result) }
        request.onerror = function () { reject(request.error) }
        request.onblocked = function () { reject(new Error('blocked')) }
      })
      opening.then(null, function () { opening = null })
      return opening
    }
    function write(apply) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite')
          apply(tx.objectStore(STORE))
          tx.oncomplete = function () { resolve() }
          tx.onabort = tx.onerror = function () { reject(tx.error) }
        })
      })
    }
    // A failed write only loses the crash copy; the save itself goes on, so callers may ignore rejections.
    function put(record) {
      return write(function (store) {
        store.put({
          v: VERSION, docId: record.docId, sub: record.sub, title: record.title, format: record.format,
          folderId: record.folderId || null, baseVersion: record.baseVersion, baseEtag: record.baseEtag,
          savedAt: record.savedAt, size: record.bytes.length, bytes: record.bytes
        })
      })
    }
    function remove(docId) {
      return write(function (store) { store.delete(docId) })
    }
    function get(docId) {
      return open().then(function (db) {
        return new Promise(function (resolve) {
          var request = db.transaction(STORE, 'readonly').objectStore(STORE).get(docId)
          request.onsuccess = function () { resolve(intact(request.result) ? request.result : null) }
          request.onerror = function () { resolve(null) }
        })
      }).then(null, function () { return null })
    }
    return { put: put, remove: remove, get: get }
  }
})()
