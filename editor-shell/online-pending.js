(function () {
  // Last unacknowledged bytes of each online document, until the server confirms them (docs/erp-host.md,
  // spec §07 "local checkpoint"). Apart from erpDrafts: a host document never lands there.
  // Keyed by [sub, docId]: on a shared device, one account's copy never replaces or reaches another's.
  var online = window.erpOnline = window.erpOnline || {}
  var NAME = 'erpcons-online-pending'
  var STORE = 'pending'
  var VERSION = 2
  var KEY_PATH = ['sub', 'docId']
  // Unsaved bytes are personal data on a possibly shared device; a month is long enough to come back for them.
  var TTL = 30 * 24 * 60 * 60 * 1000

  function noop() {}
  function integer(value) { return typeof value === 'number' && value >= 0 && Math.floor(value) === value }
  function shaped(record, version) {
    return Boolean(record) && record.v === version && typeof record.docId === 'string' && typeof record.sub === 'string'
      && typeof record.title === 'string' && typeof record.format === 'string' && typeof record.baseEtag === 'string'
      && integer(record.baseVersion) && integer(record.savedAt)
      && record.bytes instanceof Uint8Array && record.bytes.length === record.size
  }
  function intact(record) {
    return shaped(record, VERSION) && (record.role === null || typeof record.role === 'string') && typeof record.canDownload === 'boolean'
  }
  function expired(record) { return Date.now() - record.savedAt > TTL }

  // Version 1 stored by docId alone; each record already carried its owner's sub. Its records have no role, which
  // reads as "unknown": they reopen read-only until the server says otherwise (online-open.js).
  function upgrade(request, oldVersion) {
    var db = request.result
    if (oldVersion < 1) {
      db.createObjectStore(STORE, { keyPath: KEY_PATH })
      return
    }
    var old = request.transaction.objectStore(STORE)
    var all = old.getAll()
    all.onsuccess = function () {
      db.deleteObjectStore(STORE)
      var store = db.createObjectStore(STORE, { keyPath: KEY_PATH })
      ;(all.result || []).forEach(function (record) {
        if (!shaped(record, 1)) return
        record.v = VERSION
        record.role = null
        record.canDownload = true
        store.put(record)
      })
    }
  }

  online.createPendingStore = function (idb) {
    var opening = null
    function open() {
      if (opening) return opening
      opening = new Promise(function (resolve, reject) {
        if (!idb) return reject(new Error('unavailable'))
        var request
        try { request = idb.open(NAME, VERSION) } catch (e) { return reject(e) }
        request.onupgradeneeded = function (event) { upgrade(request, (event && event.oldVersion) || 0) }
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
    function readAll() {
      return open().then(function (db) {
        return new Promise(function (resolve) {
          var request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
          request.onsuccess = function () { resolve(request.result || []) }
          request.onerror = function () { resolve([]) }
        })
      }).then(null, function () { return [] })
    }
    function drop(records) {
      if (!records.length) return Promise.resolve()
      return write(function (store) { records.forEach(function (record) { store.delete([record.sub, record.docId]) }) }).then(null, noop)
    }
    // A failed write only loses the crash copy; the save itself goes on, so callers may ignore rejections.
    function put(record) {
      return write(function (store) {
        store.put({
          v: VERSION, docId: record.docId, sub: record.sub, title: record.title, format: record.format,
          folderId: record.folderId || null, baseVersion: record.baseVersion, baseEtag: record.baseEtag,
          role: typeof record.role === 'string' ? record.role : null, canDownload: record.canDownload !== false,
          savedAt: record.savedAt, size: record.bytes.length, bytes: record.bytes
        })
      })
    }
    function remove(sub, docId) {
      if (typeof sub !== 'string') return Promise.resolve()
      return write(function (store) { store.delete([sub, docId]) })
    }
    function get(sub, docId) {
      if (typeof sub !== 'string') return Promise.resolve(null)
      return open().then(function (db) {
        return new Promise(function (resolve) {
          var request = db.transaction(STORE, 'readonly').objectStore(STORE).get([sub, docId])
          request.onsuccess = function () { resolve(request.result) }
          request.onerror = function () { resolve(null) }
        })
      }).then(function (record) {
        if (!intact(record)) return null
        if (!expired(record)) return record
        return drop([record]).then(function () { return null })
      }, function () { return null })
    }
    /** Every live copy of one account; expired ones are deleted on the way. */
    function list(sub) {
      return readAll().then(function (records) {
        var mine = records.filter(function (record) { return intact(record) && record.sub === sub })
        var old = mine.filter(expired)
        return drop(old).then(function () { return mine.filter(function (record) { return !expired(record) }) })
      })
    }
    function removeAll(sub) {
      return readAll().then(function (records) {
        return drop(records.filter(function (record) { return record && record.sub === sub }))
      })
    }
    return { put: put, remove: remove, get: get, list: list, removeAll: removeAll }
  }
})()
