(function () {
  // `window.erpHost` v2 (docs/erp-host.md): the object the editor talks to, the handlers it registers, and documents
  // waiting for it to be ready. Signed-in documents (online.js) and the public link page (online-link.js) share it.
  var online = window.erpOnline = window.erpOnline || {}
  var READY_WAIT = 120 * 1000

  function noop() {}

  /**
   * deps: { save(id, bytes, options) → Promise<SaveResult>, dirty(id, dirty), opened(id, ok, reason), closed(id),
   * user() → { id, name } | null }
   */
  online.createHost = function (deps) {
    var handlers = null
    var waiting = []
    var readyTimer = null

    // Every handler past open is optional: an editor built against an older contract lacks some of them.
    function call(name) {
      if (!handlers || typeof handlers[name] !== 'function') return undefined
      try { return handlers[name].apply(handlers, Array.prototype.slice.call(arguments, 1)) } catch (e) {
        console.error('erpHost ' + name + ' handler failed')
        return undefined
      }
    }
    function deliver(doc) {
      if (handlers) return call('open', doc)
      waiting.push(doc)
      if (!readyTimer) {
        readyTimer = setTimeout(function () {
          var intake = window.erpIntake
          if (!handlers && window.erpShellNotice) window.erpShellNotice(intake ? intake.message('notReady') : 'Công cụ chưa sẵn sàng.', 'alert', 15000)
        }, READY_WAIT)
      }
    }

    var host = Object.freeze({
      version: 2,
      ready: function (given) {
        if (handlers || !given || typeof given.open !== 'function') return
        handlers = given
        clearTimeout(readyTimer)
        // The author name must be known before the first document arrives (docs/erp-host.md, setUser).
        call('setUser', deps.user())
        waiting.splice(0).forEach(function (doc) { call('open', doc) })
      },
      save: function (id, bytes, options) { return deps.save(String(id), bytes, options) },
      dirty: function (id, dirty) { deps.dirty(String(id), dirty) },
      opened: function (id, ok, reason) { deps.opened(String(id), ok, reason) },
      closed: function (id) { deps.closed(String(id)) }
    })

    return {
      host: host,
      deliver: deliver,
      call: call,
      isReady: function () { return Boolean(handlers) },
      flush: function () {
        if (!handlers || typeof handlers.flush !== 'function') return Promise.resolve()
        try { return Promise.resolve(handlers.flush()).then(noop, noop) } catch (e) { return Promise.resolve() }
      }
    }
  }

  /** What `open` hands the editor; `preserveView` only when a newer version replaces one already shown. */
  online.hostDoc = function (id, meta, bytes, version, preserveView) {
    var doc = { docId: id, version: version, title: meta.title, format: meta.format, bytes: bytes, mode: meta.mode || 'edit', canDownload: meta.canDownload !== false }
    if (preserveView) doc.preserveView = true
    return doc
  }

  /** The signed-in account as the editor's author, or null. */
  online.hostUser = function (account) {
    var user = account && account.status() === 'signed-in' ? account.user() : null
    return user ? { id: user.id, name: user.name || '' } : null
  }
})()
