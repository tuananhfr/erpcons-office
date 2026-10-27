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
  online.outcomeMessage = function (outcome) {
    var messages = online.messages
    if (outcome.kind === 'notFound') return messages.notFound
    if (outcome.kind === 'offline') return messages.offline
    if (outcome.kind === 'signIn') return messages.signIn
    return outcome.message || messages.failed
  }

  /** deps: { api, saver, pending, dialogs, user() → sub, deliver(doc), signIn() → Promise<snapshot> } */
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
        return { kind: 'ok', doc: meta.doc, bytes: content.bytes, version: content.version, etag: content.etag }
      })
    }
    function show(id, doc, bytes, version, etag) {
      deps.saver.track({ id: id, title: doc.title, format: doc.format, folderId: doc.folderId, version: version, etag: etag })
      deps.deliver({ docId: id, version: version, title: doc.title, format: doc.format, bytes: bytes })
    }
    function showFound(id, found) { show(id, found.doc, found.bytes, found.version, found.etag) }
    // The editor takes restored bytes as clean, so the shell saves them itself against their stored base: a newer
    // server version then surfaces as a conflict instead of being overwritten.
    function restore(id, record) {
      show(id, record, record.bytes, record.baseVersion, record.baseEtag)
      return deps.saver.save(id, record.bytes)
    }

    function offer(id, record, found) {
      deps.dialogs.pending(record, found ? found.version : null, {
        onRestore: function (dialog) {
          dialog.close()
          restore(id, record)
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

    function load(id) {
      return Promise.all([server(id), deps.pending.get(id)]).then(function (results) {
        var found = results[0]
        // A copy left by another account on this device is never shown.
        var record = results[1] && results[1].sub === deps.user() ? results[1] : null
        if (found.kind === 'notFound') return deps.dialogs.notFound()
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
        if (record) return offer(id, record, found)
        showFound(id, found)
      })
    }

    function openLatest(id) {
      return server(id).then(function (found) {
        if (found.kind !== 'ok') return found
        return deps.saver.discard(id).then(function () {
          showFound(id, found)
          return found
        })
      })
    }

    // The copy keeps the user's bytes; the original then goes back to its latest version, which settles the
    // conflict in editors that show one document at a time as well as in tabbed ones.
    function saveCopy(id, idempotencyKey) {
      var doc = deps.saver.get(id)
      if (!doc || !doc.conflict) return Promise.resolve({ kind: 'failed', retryable: false, message: online.messages.failed })
      var bytes = doc.conflict.bytes
      return deps.api.createDocument(bytes, online.copyTitle(doc.title), doc.format, doc.folderId, idempotencyKey).then(function (created) {
        if (created.kind !== 'ok') return created
        return deps.saver.discard(id).then(function () { return server(id) }).then(function (found) {
          if (found.kind === 'ok') showFound(id, found)
          show(created.doc.id, created.doc, bytes, created.doc.version, created.etag)
          return created
        })
      })
    }

    return { load: load, openLatest: openLatest, saveCopy: saveCopy }
  }
})()
