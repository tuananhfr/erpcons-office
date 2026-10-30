(function () {
  // Opening an online document: metadata and bytes from the server, the pending copy offered back, and the two
  // ways out of a conflict (docs/erp-host.md, "Shell responsibilities").
  var online = window.erpOnline = window.erpOnline || {}
  var COPY_SUFFIX = ' (bản của tôi)'
  var TITLE_MAX = 255

  // Counted in code points: the server's limit is 255 characters, and a cut must not split a surrogate pair.
  online.copyTitle = function (title) {
    var chars = Array.from(title)
    var room = TITLE_MAX - COPY_SUFFIX.length
    return (chars.length > room ? chars.slice(0, room).join('').trim() : title) + COPY_SUFFIX
  }
  function noop() {}
  function sameBytes(a, b) {
    if (a.length !== b.length) return false
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }

  online.outcomeMessage = function (outcome) {
    var messages = online.messages
    if (outcome.kind === 'notFound') return messages.notFound
    if (outcome.kind === 'forbidden') return messages.forbidden
    if (outcome.kind === 'offline') return messages.offline
    if (outcome.kind === 'signIn') return messages.signIn
    return outcome.message || messages.failed
  }

  /**
   * deps: { api, saver, pending, dialogs, user() → sub, sameAccount() → false once another account signed in,
   * deliver(doc), signIn() → Promise<snapshot>, onAccessLost(doc, kind, bytes) }
   */
  online.createOpener = function (deps) {
    // Title and format come from the metadata; version and ETag from the bytes, which may be newer.
    function server(id) {
      return Promise.all([deps.api.getDocument(id), deps.api.getContent(id)]).then(function (results) {
        var meta = results[0]
        var content = results[1]
        // Not found by either call answers the same, whatever the other one said (§08).
        if (meta.kind === 'notFound' || content.kind === 'notFound') return { kind: 'notFound' }
        if (meta.kind !== 'ok') return meta
        if (content.kind !== 'ok') return content
        return { kind: 'ok', doc: withMode(meta.doc), bytes: content.bytes, version: content.version, etag: content.etag }
      })
    }
    function withMode(doc) {
      var copy = {}
      Object.keys(doc).forEach(function (key) { copy[key] = doc[key] })
      copy.mode = doc.mode || online.modeOf(doc.role)
      return copy
    }
    function show(id, doc, bytes, version, etag, preserveView) {
      deps.saver.track({ id: id, title: doc.title, format: doc.format, folderId: doc.folderId, version: version, etag: etag, mode: doc.mode, canDownload: doc.canDownload, canShare: doc.canShare, role: doc.role })
      deps.deliver(online.hostDoc(id, doc, bytes, version, preserveView))
    }
    function showFound(id, found, preserveView) { show(id, found.doc, found.bytes, found.version, found.etag, preserveView) }
    // The editor takes restored bytes as clean, so the shell saves them itself against their stored base: a newer
    // server version then surfaces as a conflict instead of being overwritten. Without edit access any more, the
    // bytes are shown read-only and offered as a copy instead. Offline, the access is the one stored with the bytes;
    // a record that never stored it (pending store v1) opens read-only rather than assume edit access.
    function restore(id, record, found) {
      var role = record.role || 'viewer'
      var meta = { title: record.title, format: record.format, folderId: record.folderId, mode: online.modeOf(role), canDownload: record.canDownload !== false, role: role }
      if (found) meta = { title: found.doc.title, format: found.doc.format, folderId: found.doc.folderId, mode: found.doc.mode, canDownload: found.doc.canDownload, canShare: found.doc.canShare, role: found.doc.role }
      show(id, meta, record.bytes, record.baseVersion, record.baseEtag)
      if (meta.mode !== 'edit') {
        if (deps.onAccessLost) deps.onAccessLost(deps.saver.get(id), 'forbidden', record.bytes)
        return Promise.resolve()
      }
      return deps.saver.save(id, record.bytes)
    }

    function offer(id, record, found) {
      deps.dialogs.pending(record, found ? found.version : null, {
        onRestore: function (dialog) {
          dialog.close()
          restore(id, record, found)
        },
        onDiscard: function (dialog) {
          return deps.saver.discard(id).then(function () {
            dialog.close()
            showFound(id, found)
          })
        },
        onRetry: function (dialog) {
          dialog.close()
          return load(id)
        }
      })
    }

    // The document is gone for this user, but this device still holds their unsaved bytes: shown read-only, with
    // the copy offered (online.js accessLost); the record goes once that copy is made or the user drops it.
    function orphaned(id, record) {
      var meta = { title: record.title, format: record.format, folderId: null, mode: 'view', canDownload: record.canDownload !== false, role: 'viewer' }
      show(id, meta, record.bytes, record.baseVersion, record.baseEtag)
      deps.saver.markLost(id, 'notFound')
      if (deps.onAccessLost) deps.onAccessLost(deps.saver.get(id), 'notFound', record.bytes)
    }

    var OTHER_ACCOUNT = { kind: 'failed', retryable: false, message: online.messages.otherAccount }

    function load(id) {
      if (!deps.sameAccount()) return Promise.resolve()
      return Promise.all([server(id), deps.pending.get(deps.user(), id)]).then(function (results) {
        var found = results[0]
        // A copy left by another account on this device is never shown.
        var record = results[1] && results[1].sub === deps.user() ? results[1] : null
        if (found.kind === 'notFound') return record ? orphaned(id, record) : deps.dialogs.notFound()
        if (found.kind === 'signIn') {
          return deps.dialogs.signIn({
            onSignIn: function (dialog) {
              return deps.signIn().then(function (snapshot) {
                if (snapshot.status !== 'signed-in') return
                dialog.close()
                return load(id)
              })
            }
          })
        }
        if (found.kind !== 'ok') {
          if (record) return offer(id, record, null)
          return deps.dialogs.unreachable(online.outcomeMessage(found), {
            onRetry: function (dialog) {
              dialog.close()
              return load(id)
            }
          })
        }
        // A save at unload can land after the page lost the answer that would have dropped its copy: restoring those
        // same bytes against their old base would only raise a false conflict.
        if (record && !sameBytes(record.bytes, found.bytes)) return offer(id, record, found)
        if (record) return deps.pending.remove(record.sub, id).then(null, noop).then(function () { showFound(id, found) })
        showFound(id, found)
      })
    }

    function openLatest(id, preserveView) {
      if (!deps.sameAccount()) return Promise.resolve(OTHER_ACCOUNT)
      return server(id).then(function (found) {
        if (found.kind !== 'ok') return found
        return deps.saver.discard(id).then(function () {
          showFound(id, found, preserveView)
          return found
        })
      })
    }

    // `?doc=<id>&version=<seq>` from the version history: that version, read-only, never saved over the document.
    function loadVersion(id, seq) {
      return Promise.all([deps.api.getDocument(id), deps.api.getVersionContent(id, seq)]).then(function (results) {
        var meta = results[0]
        var content = results[1]
        if (meta.kind === 'notFound' || content.kind === 'notFound' || content.kind === 'forbidden') return deps.dialogs.notFound()
        var failed = meta.kind !== 'ok' ? meta : content.kind !== 'ok' ? content : null
        if (failed) {
          return deps.dialogs.unreachable(online.outcomeMessage(failed), {
            onRetry: function (dialog) {
              dialog.close()
              return loadVersion(id, seq)
            }
          })
        }
        var doc = withMode(meta.doc)
        doc.mode = 'view'
        doc.canDownload = true
        // No ETag: an old version is never a base to save against (the saver refuses saves on this page anyway).
        show(id, doc, content.bytes, seq, null)
      })
    }

    // The copy keeps the user's bytes; the original then goes back to its latest version, which settles the
    // conflict in editors that show one document at a time as well as in tabbed ones. `folderId` null is the
    // caller's own root, where the copy of a document someone else owns lands.
    function saveCopy(id, idempotencyKey, bytes, folderId) {
      if (!deps.sameAccount()) return Promise.resolve(OTHER_ACCOUNT)
      var doc = deps.saver.get(id)
      if (!doc || !bytes) return Promise.resolve({ kind: 'failed', retryable: false, message: online.messages.failed })
      return deps.api.createDocument(bytes, online.copyTitle(doc.title), doc.format, folderId, idempotencyKey).then(function (created) {
        if (created.kind !== 'ok') return created
        return deps.saver.discard(id).then(function () { return server(id) }).then(function (found) {
          if (found.kind === 'ok') showFound(id, found)
          show(created.doc.id, withMode(created.doc), bytes, created.doc.version, created.etag)
          return created
        })
      })
    }

    return { load: load, loadVersion: loadVersion, openLatest: openLatest, saveCopy: saveCopy }
  }
})()
