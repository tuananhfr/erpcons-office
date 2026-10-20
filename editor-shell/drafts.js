(function () {
  var EDITORS = ['van-ban', 'bang-tinh', 'trinh-chieu', 'pdf']
  var editor = location.pathname.split('/')[1]
  if (EDITORS.indexOf(editor) === -1 || location.pathname !== '/' + editor + '/') return
  // Embedded editors report unsaved work to the host page, which owns recovery there.
  var embedding = new URLSearchParams(location.search)
  if (embedding.get('host') === 'parent' || embedding.get('embed') === 'erpcons') return

  var STORE = 'drafts'
  var VERSION = 1
  var LOCK_PREFIX = 'erpcons-draft-tab:'
  var MAX_AGE = 30 * 24 * 3600 * 1000
  var tab = Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  var db = null
  var broken = false
  var queued = []
  var adopted = {}
  var restoring = {}
  var live = {}
  var listeners = []
  var readyListeners = []
  var openInEditor = null
  var persistAsked = false
  var status = { kind: 'idle' }
  function noop() {}

  // Synchronous on purpose: a draft flushed from `pagehide` must be written before the page is gone,
  // and crypto.subtle only answers asynchronously. Slice-by-8 (table k at k*256) keeps a 45 MB draft
  // around 40 ms instead of ~200 ms byte by byte.
  var CRC_TABLE = (function () {
    var table = new Uint32Array(2048)
    for (var n = 0; n < 256; n++) {
      var c = n
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    for (var slice = 1; slice < 8; slice++) {
      for (var m = 0; m < 256; m++) {
        var prev = table[(slice - 1) * 256 + m]
        table[slice * 256 + m] = (prev >>> 8) ^ table[prev & 0xff]
      }
    }
    return table
  })()
  function crc32(bytes) {
    var t = CRC_TABLE
    var crc = 0xffffffff
    var i = 0
    var end = bytes.length - (bytes.length % 8)
    for (; i < end; i += 8) {
      var lo = crc ^ (bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16 | bytes[i + 3] << 24)
      var hi = bytes[i + 4] | bytes[i + 5] << 8 | bytes[i + 6] << 16 | bytes[i + 7] << 24
      crc = t[1792 + (lo & 0xff)] ^ t[1536 + ((lo >>> 8) & 0xff)] ^ t[1280 + ((lo >>> 16) & 0xff)] ^ t[1024 + (lo >>> 24)]
        ^ t[768 + (hi & 0xff)] ^ t[512 + ((hi >>> 8) & 0xff)] ^ t[256 + ((hi >>> 16) & 0xff)] ^ t[hi >>> 24]
    }
    for (; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }
  function integer(value, max) {
    return typeof value === 'number' && value >= 0 && value <= max && Math.floor(value) === value
  }
  function intact(record) {
    return Boolean(record) && typeof record === 'object'
      && (typeof record.v === 'undefined' || record.v === VERSION)
      && typeof record.id === 'string' && record.id.length > 0
      && EDITORS.indexOf(record.editor) !== -1
      && typeof record.tab === 'string' && record.tab.length > 0
      && typeof record.name === 'string'
      && typeof record.format === 'string' && record.format.length > 0
      && integer(record.savedAt, 8640000000000000)
      && integer(record.size, 9007199254740991)
      && integer(record.crc, 0xffffffff)
      && record.bytes instanceof Uint8Array && record.bytes.length === record.size
      && crc32(record.bytes) === record.crc
  }
  function ownedByLiveTab(record, alive) {
    return record && typeof record.tab === 'string' && Object.prototype.hasOwnProperty.call(alive, record.tab)
  }

  function setStatus(next) {
    status = next
    listeners.forEach(function (fn) { fn(status) })
  }
  function anyLive() {
    for (var id in live) if (live[id]) return true
    return false
  }

  function request(store, mode, run) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, mode)
      var result
      var req = run(tx.objectStore(store))
      if (req) req.onsuccess = function () { result = req.result }
      tx.oncomplete = function () { resolve(result) }
      tx.onabort = function () { reject(tx.error) }
    })
  }
  // Read, decide and write in one readwrite transaction: another click or tab cannot slip in between.
  function update(id, change) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite')
      var store = tx.objectStore(STORE)
      var outcome
      var req = store.get(id)
      req.onsuccess = function () { outcome = change(req.result, store) }
      tx.oncomplete = function () { resolve(outcome) }
      tx.onabort = function () { reject(tx.error) }
    })
  }
  function whenOpen(task) {
    if (broken) return
    if (db) task()
    else queued.push(task)
  }

  // The browser hands each tab's lock back when that tab closes or crashes; that is how other tabs tell
  // a dead tab's drafts from those of a tab still being edited.
  var locks = navigator.locks
  if (locks && locks.request) locks.request(LOCK_PREFIX + tab, function () { return new Promise(noop) }).catch(noop)
  function liveTabs() {
    var alive = {}
    alive[tab] = true
    // Without Web Locks every other tab counts as gone: offering a copy twice is better than hiding one.
    if (!locks || !locks.query) return Promise.resolve(alive)
    return locks.query().then(function (snapshot) {
      (snapshot.held || []).concat(snapshot.pending || []).forEach(function (lock) {
        if (lock.name && lock.name.indexOf(LOCK_PREFIX) === 0) alive[lock.name.slice(LOCK_PREFIX.length)] = true
      })
      return alive
    })
  }
  function orphanRecords() {
    return Promise.all([liveTabs(), request(STORE, 'readonly', function (s) { return s.getAll() })]).then(function (both) {
      return both[1].filter(function (record) { return !ownedByLiveTab(record, both[0]) })
    })
  }

  function afterSave() {
    var storage = navigator.storage
    if (!storage) return
    if (!persistAsked && storage.persist) {
      persistAsked = true
      storage.persist().catch(noop)
    }
    if (storage.estimate) {
      storage.estimate().then(function (e) {
        if (e.quota && e.usage / e.quota > 0.9 && status.kind === 'saved') setStatus({ kind: 'nearFull', at: status.at, name: status.name })
      }).catch(noop)
    }
  }

  function put(key, name, format, bytes) {
    if (!bytes || typeof bytes.length !== 'number') return
    var id = adopted[key] ? key : tab + '|' + key
    var now = Date.now()
    var record = { v: VERSION, id: id, editor: editor, tab: tab, name: String(name), format: String(format), size: bytes.length, crc: crc32(bytes), bytes: bytes, savedAt: now }
    live[id] = true
    whenOpen(function () {
      // A full quota aborts the transaction, so the previous draft of this document stays as it was.
      request(STORE, 'readwrite', function (s) { s.put(record) }).then(function () {
        if (!live[id]) return
        setStatus({ kind: 'saved', at: now, name: record.name })
        afterSave()
      }, function (error) {
        setStatus({ kind: error && error.name === 'QuotaExceededError' ? 'quota' : 'error', at: now, name: record.name })
      })
    })
  }

  function remove(key) {
    var id = adopted[key] ? key : tab + '|' + key
    live[id] = false
    whenOpen(function () {
      request(STORE, 'readwrite', function (s) { s.delete(id) }).catch(noop)
    })
    if (!anyLive()) setStatus({ kind: 'idle' })
  }

  function fireReady() {
    if (!db || !openInEditor) return
    readyListeners.splice(0).forEach(function (fn) { fn() })
  }

  function expire() {
    var cutoff = Date.now() - MAX_AGE
    orphanRecords().then(function (records) {
      // Incompatible records stay available for recovery by a build that understands them.
      var old = records.filter(function (record) {
        return record && integer(record.savedAt, 8640000000000000) && record.savedAt < cutoff && intact(record)
      })
      if (old.length) return request(STORE, 'readwrite', function (s) { old.forEach(function (record) { s.delete(record.id) }) })
    }).catch(noop)
  }

  var opening
  try { opening = indexedDB.open('erpcons-drafts-v1', 1) } catch (error) { opening = null }
  function unavailable() {
    broken = true
    queued = []
    setStatus({ kind: 'unavailable' })
  }
  if (!opening) unavailable()
  else {
    opening.onupgradeneeded = function () { opening.result.createObjectStore(STORE, { keyPath: 'id' }) }
    opening.onerror = unavailable
    opening.onsuccess = function () {
      db = opening.result
      // A newer build that changes the schema must not be blocked by this tab.
      db.onversionchange = function () { db.close(); unavailable() }
      queued.splice(0).forEach(function (task) { task() })
      expire()
      fireReady()
    }
  }

  window.erpDrafts = {
    put: put,
    remove: remove,
    ready: function (restore) {
      openInEditor = restore
      fireReady()
    },
  }

  window.erpDraftStore = {
    tab: tab,
    subscribe: function (fn) { listeners.push(fn) },
    onReady: function (fn) {
      readyListeners.push(fn)
      fireReady()
    },
    orphans: function () {
      return orphanRecords().then(function (records) {
        return records.filter(function (record) { return !record || EDITORS.indexOf(record.editor) === -1 || record.editor === editor })
          .map(function (record) {
            var corrupt = !intact(record)
            record = record || {}
            return {
              id: typeof record.id === 'string' ? record.id : '',
              name: typeof record.name === 'string' ? record.name : '',
              format: typeof record.format === 'string' ? record.format : '',
              size: integer(record.size, 9007199254740991) ? record.size : 0,
              savedAt: integer(record.savedAt, 8640000000000000) ? record.savedAt : 0,
              corrupt: corrupt,
            }
          })
          .sort(function (a, b) { return b.savedAt - a.savedAt })
      })
    },
    // The list may be stale: another tab can have taken the draft over since it was shown.
    restore: function (id) {
      if (restoring[id] || !openInEditor) return Promise.resolve('missing')
      restoring[id] = true
      return liveTabs().then(function (alive) {
        return update(id, function (record, s) {
          if (typeof record === 'undefined' || ownedByLiveTab(record, alive)) return { result: 'missing' }
          if (!intact(record) || record.id !== id || record.editor !== editor) return { result: 'corrupt' }
          record.v = VERSION
          record.tab = tab
          // Expiry counts from when the draft was last in use, not from its last edit.
          record.savedAt = Date.now()
          s.put(record)
          return { result: 'ok', record: record }
        })
      }).then(function (outcome) {
        delete restoring[id]
        if (outcome.result !== 'ok') return outcome.result
        var record = outcome.record
        adopted[id] = true
        live[id] = true
        setStatus({ kind: 'saved', at: record.savedAt, name: record.name })
        openInEditor(id, record.name, record.format, new Uint8Array(record.bytes))
        return 'ok'
      }, function (error) {
        delete restoring[id]
        throw error
      })
    },
    discard: function (id) {
      return liveTabs().then(function (alive) {
        return update(id, function (record, s) {
          if (record && !ownedByLiveTab(record, alive)) s.delete(id)
        })
      })
    },
  }
})()
