(function () {
  // Saves of online documents: erpHost.save → PUT …/content with If-Match, the SaveResult mapping of
  // docs/erp-host.md, retries with backoff, and the pending store copy until the server acknowledges.
  var online = window.erpOnline = window.erpOnline || {}
  var IN_CALL_TRIES = 3
  // Longer waits go to the background retry: the editor must not sit on one save for minutes.
  var IN_CALL_WAIT_MAX = 10 * 1000
  var NOT_OPEN = 'Tài liệu này không còn mở để lưu lên máy chủ.'

  function noop() {}
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms) }) }

  /**
   * deps: { api, pending, backoff, user() → sub, onChange(docs), onConflict(doc), onAcknowledged(id, revision, version),
   * onAccessLost(doc, kind), viewOnly }; kind is 'forbidden' (still visible, no longer editable) or 'notFound'.
   * viewOnly: the page shows an old version (`&version=`), which nothing may ever be saved over.
   */
  online.createSaver = function (deps) {
    var messages = online.messages
    var docs = {}

    function list() {
      return Object.keys(docs).map(function (id) { return docs[id] }).filter(function (doc) { return doc.open || doc.pending || doc.inflight })
    }
    function changed() { deps.onChange(list()) }
    function enqueue(doc, task) {
      var run = doc.chain.then(task, task)
      doc.chain = run.then(noop, noop)
      return run
    }
    function clearRetry(doc) {
      clearTimeout(doc.retry.timer)
      doc.retry.timer = null
    }
    // The account the document was opened with owns its bytes, whoever is signed in now.
    function persist(doc, entry) {
      if (!doc.sub) return
      deps.pending.put({
        docId: doc.id, sub: doc.sub, title: doc.title, format: doc.format, folderId: doc.folderId,
        baseVersion: doc.version, baseEtag: doc.etag, role: doc.role, canDownload: doc.canDownload, savedAt: entry.savedAt, bytes: entry.bytes
      }).then(null, function () { console.warn('Online pending copy not stored') })
    }
    // awaited: the save() call that handed these bytes over has not had its answer yet.
    function keep(doc, bytes, revision) {
      doc.pending = { bytes: bytes, revision: revision, awaited: true, savedAt: Date.now() }
      persist(doc, doc.pending)
      return doc.pending
    }
    // Signed out is not another account: apiFetch then refuses without a request and the user is asked to sign in.
    function otherAccount(doc) {
      var current = deps.user()
      return Boolean(current) && current !== doc.sub
    }
    function conflictResult(doc) { return { status: 'conflict', latestVersion: doc.conflict.latestVersion } }
    function failed(retryable, message) { return { status: 'failed', retryable: retryable, message: message } }

    function scheduleRetry(doc, retryAfter) {
      if (doc.retry.timer || doc.conflict || !doc.pending || doc.waitingSignIn) return
      doc.retry.attempt += 1
      doc.retry.timer = setTimeout(function () {
        doc.retry.timer = null
        if (doc.pending && !doc.conflict && !doc.waitingSignIn) enqueue(doc, function () { return send(doc, false) })
      }, deps.backoff(doc.retry.attempt, retryAfter))
    }

    function settle(doc, entry, outcome) {
      if (outcome.kind === 'saved') {
        doc.version = outcome.version
        doc.etag = outcome.etag
        doc.error = null
        doc.retry.attempt = 0
        if (doc.pending === entry) {
          doc.pending = null
          deps.pending.remove(doc.sub, doc.id).then(null, noop)
        } else if (doc.pending) {
          // A newer copy waits behind this save: its base is now the version just written, not a conflict.
          persist(doc, doc.pending)
        }
        return { status: 'saved', version: outcome.version }
      }
      if (outcome.kind === 'conflict') {
        doc.conflict = { latestVersion: outcome.latestVersion, bytes: (doc.pending || entry).bytes }
        doc.error = null
        clearRetry(doc)
        deps.onConflict(doc)
        return conflictResult(doc)
      }
      if (outcome.kind === 'offline') {
        doc.error = { offline: true, retryable: true, message: messages.offline }
        scheduleRetry(doc, null)
        return { status: 'offline' }
      }
      if (outcome.kind === 'signIn') {
        // No timer: retrying cannot help until the user signs in again (resume()).
        doc.error = { retryable: true, message: messages.signIn }
        doc.waitingSignIn = true
        clearRetry(doc)
        return failed(true, messages.signIn)
      }
      if (outcome.kind === 'notFound' || outcome.kind === 'forbidden') {
        // Access was removed while the document was open: the bytes stay in the pending store for a copy.
        var message = outcome.kind === 'notFound' ? messages.notFound : messages.forbidden
        doc.error = { retryable: false, message: message }
        // The flushes of the downgrade that follows are refused too; the user hears about it once.
        var first = !doc.accessLost
        doc.accessLost = outcome.kind
        clearRetry(doc)
        if (first && deps.onAccessLost) deps.onAccessLost(doc, outcome.kind)
        return failed(false, message)
      }
      doc.error = { retryable: outcome.retryable, message: outcome.message }
      if (outcome.retryable) scheduleRetry(doc, outcome.retryAfter)
      return failed(outcome.retryable, outcome.message)
    }

    // interactive: the editor waits on this save, so 429/503 get a few quick retries before it hears back.
    function send(doc, interactive) {
      if (doc.conflict) return Promise.resolve(conflictResult(doc))
      var entry = doc.pending
      if (!entry) return Promise.resolve({ status: 'saved', version: doc.version })
      clearRetry(doc)
      if (otherAccount(doc)) {
        // Another account's token must never carry these bytes; they wait in the pending store for their owner.
        doc.error = { offline: true, retryable: true, message: messages.otherAccount }
        changed()
        return Promise.resolve({ status: 'offline' })
      }
      doc.inflight += 1
      changed()
      function attempt(tries) {
        return deps.api.putContent(doc.id, entry.bytes, doc.etag).then(function (outcome) {
          if (interactive && outcome.kind === 'failed' && outcome.retryable && tries < IN_CALL_TRIES) {
            var delay = deps.backoff(tries, outcome.retryAfter)
            if (delay <= IN_CALL_WAIT_MAX) return wait(delay).then(function () { return attempt(tries + 1) })
          }
          return outcome
        })
      }
      return attempt(1).then(function (outcome) {
        doc.inflight -= 1
        var result = settle(doc, entry, outcome)
        changed()
        // The editor heard offline/failed for these bytes; it learns they landed only from here. A caller still
        // waiting on them gets "saved" itself, and bytes recovered from the pending store carry no revision.
        if (!interactive && result.status === 'saved' && doc.open && entry.revision !== undefined && !entry.awaited) {
          deps.onAcknowledged(doc.id, entry.revision, result.version)
        }
        return result
      }, function (error) {
        doc.inflight -= 1
        doc.error = { retryable: false, message: messages.failed }
        changed()
        console.error('Online save failed', error && error.code)
        return failed(false, messages.failed)
      })
    }

    function revisionOf(options) {
      var revision = options && options.revision
      return typeof revision === 'number' && isFinite(revision) ? revision : undefined
    }

    function save(id, bytes, options) {
      var doc = docs[id]
      if (deps.viewOnly) return Promise.resolve(failed(false, messages.readOnly))
      if (!doc || !doc.open || !bytes || !ArrayBuffer.isView(bytes)) return Promise.resolve(failed(false, NOT_OPEN))
      // Read-only saves nothing, except the flush of edits made before a downgrade (docs/erp-host.md, rule 13).
      if (doc.mode !== 'edit' && !(doc.downgraded && options && options.reason === 'flush')) return Promise.resolve(failed(false, messages.readOnly))
      // The editor may reuse its wasm memory as soon as the call returns.
      var copy = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      var entry = keep(doc, copy, revisionOf(options))
      if (doc.conflict) {
        doc.conflict.bytes = copy
        entry.awaited = false
        return Promise.resolve(conflictResult(doc))
      }
      changed()
      return enqueue(doc, function () { return send(doc, true) }).then(function (result) {
        entry.awaited = false
        return result
      })
    }

    return {
      save: save,
      /** Starts tracking a document opened at `meta.version` / `meta.etag`, dropping any earlier state of it. */
      track: function (meta) {
        var doc = docs[meta.id] || (docs[meta.id] = { id: meta.id, chain: Promise.resolve(), inflight: 0, retry: { timer: null, attempt: 0 } })
        clearRetry(doc)
        doc.retry.attempt = 0
        doc.sub = deps.user()
        doc.title = meta.title
        doc.format = meta.format
        doc.folderId = meta.folderId || null
        doc.version = meta.version
        doc.etag = meta.etag
        doc.mode = meta.mode || 'edit'
        doc.canDownload = meta.canDownload !== false
        doc.canShare = meta.canShare !== false
        doc.role = meta.role || 'owner'
        doc.accessLost = null
        doc.downgraded = false
        doc.open = true
        doc.dirty = false
        doc.pending = null
        doc.error = null
        doc.conflict = null
        doc.waitingSignIn = false
        changed()
        return doc
      },
      get: function (id) { return docs[id] || null },
      /** Access changed while open (erpHost v2 setMode); a downgraded document keeps its edits until they are flushed. */
      setAccess: function (id, mode, canDownload, role) {
        var doc = docs[id]
        if (!doc) return
        if (doc.mode === 'edit' && mode !== 'edit') doc.downgraded = true
        doc.mode = mode
        doc.canDownload = canDownload !== false
        if (role) doc.role = role
        changed()
      },
      /** The owner's "editors can share" switch, seen on a refresh; it changes no mode. */
      setCanShare: function (id, canShare) {
        var doc = docs[id]
        if (!doc || doc.canShare === (canShare !== false)) return
        doc.canShare = canShare !== false
        changed()
      },
      /** True while an account other than the document's owner is signed in. */
      otherAccount: function (id) { return Boolean(docs[id]) && otherAccount(docs[id]) },
      dirty: function (id, dirty) {
        var doc = docs[id]
        if (!doc) return
        doc.dirty = (doc.mode === 'edit' || doc.downgraded) && Boolean(dirty)
        changed()
      },
      closed: function (id) {
        var doc = docs[id]
        if (!doc) return
        doc.open = false
        doc.dirty = false
        // Unacknowledged bytes keep retrying after their tab closed; they are the user's last edits.
        if (!doc.pending && !doc.inflight) delete docs[id]
        changed()
      },
      /** Drops unsaved bytes of a document (the user chose another version). */
      discard: function (id) {
        var doc = docs[id]
        if (doc) {
          doc.pending = null
          doc.conflict = null
          doc.error = null
          clearRetry(doc)
          changed()
        }
        return deps.pending.remove(doc && doc.sub ? doc.sub : deps.user(), id).then(null, noop)
      },
      /** The document is gone for this user, as a refused save would have found out. */
      markLost: function (id, kind) {
        var doc = docs[id]
        if (!doc) return
        doc.accessLost = kind
        changed()
      },
      /** Retries every waiting copy now: back online, or signed in again. */
      resume: function () {
        Object.keys(docs).forEach(function (id) {
          var doc = docs[id]
          if (!doc.pending || doc.conflict || (doc.error && !doc.error.retryable)) return
          clearRetry(doc)
          doc.retry.attempt = 0
          doc.waitingSignIn = false
          enqueue(doc, function () { return send(doc, false) })
        })
      },
      busy: function () {
        return list().some(function (doc) { return (doc.open && doc.dirty) || doc.inflight > 0 || Boolean(doc.pending) })
      },
      /** Settles once every save queued so far has finished. */
      idle: function () {
        return Promise.all(Object.keys(docs).map(function (id) { return docs[id].chain })).then(noop)
      },
      list: list
    }
  }
})()
