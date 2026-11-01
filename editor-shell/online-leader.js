(function () {
  // Saving while the document's live room is open (plan-m4 "Lưu"; server "Leader" and "Saves" in
  // erpcons-office-server docs/openapi.yaml). With an erpHost v3 editor only the room's leader stores the document:
  // 30 s after the last change in the room, at once on `save.request`, on Ctrl+S, when it is left as the last editor
  // and when the page goes away, with X-Live-Seq naming the last update its bytes hold. The other pages never PUT:
  // their edits are safe once the room acknowledged them. An editor without v3 keeps the v2 saves, except that a page
  // which is not the leader holds its bytes while the room has several editors (the server would answer NOT_LEADER).
  var online = window.erpOnline = window.erpOnline || {}
  var QUIET = 30 * 1000
  // Edits that never pause for 30 s still reach storage this often.
  var LONGEST = 2 * 60 * 1000
  var FLUSH_WAIT = 10 * 1000
  // A room that never answered within this time (a proxy without WebSocket, say): saves go the v2 way. A room that
  // did answer and dropped is waited for, since others may be editing in it; the device keeps the edits meanwhile.
  var ROOM_WAIT = 60 * 1000

  function noop() {}
  function within(promise, ms) {
    return new Promise(function (resolve) {
      var timer = setTimeout(resolve, ms)
      Promise.resolve(promise).then(function () { clearTimeout(timer); resolve() }, function () { clearTimeout(timer); resolve() })
    })
  }
  function revisionOf(options) {
    var revision = options && options.revision
    return typeof revision === 'number' && isFinite(revision) ? revision : undefined
  }

  /**
   * deps: { docId, saver (online-saver.js), regions (online-regions.js), host (online-host.js createHost),
   *   api (online-api.js) }
   */
  online.createLeader = function (deps) {
    var id = deps.docId
    var saver = deps.saver
    var regions = deps.regions
    // The editor's newest bytes of the document: { bytes, revision, seq, done }; done once stored or not ours to store.
    var latest = null
    // Saves answered `offline` because the room did not have their edits yet: { revision, mark }.
    var waiting = []
    var heldMark = null
    var quietTimer = null
    var longestTimer = null
    var roomTimer = null
    var saving = null
    var again = false
    var leading = false
    var editors = 0
    var stopped = false
    var greetedOnce = false
    // The room never answered: saves go the v2 way until it greets.
    var fallback = false

    function doc() { return saver.get(id) }
    function synced() { return regions.phase() === 'synced' }
    function knownVersion() {
      var current = doc()
      var room = regions.savedVersion()
      var version = current ? current.version : 0
      return typeof room === 'number' && room > version ? room : version
    }
    function clearTimers() {
      clearTimeout(quietTimer)
      clearTimeout(longestTimer)
      quietTimer = null
      longestTimer = null
    }
    // Bytes newer than what the room stored, and never older: a save may not drop updates a previous one stored.
    function needsSave() {
      if (!latest || latest.done) return false
      var saved = regions.savedSeq()
      return latest.seq === null || typeof saved !== 'number' || latest.seq >= saved
    }

    function schedule() {
      if (!leading || stopped) return
      clearTimeout(quietTimer)
      quietTimer = setTimeout(function () { saveNow(false) }, QUIET)
      if (!longestTimer) longestTimer = setTimeout(function () { saveNow(false) }, LONGEST)
    }
    function rebase() {
      var room = regions.savedVersion()
      var current = doc()
      if (typeof room !== 'number' || !current || room <= current.version) return Promise.resolve()
      // Another leader's save is the base, but only that very version: a save made outside the room must conflict.
      return deps.api.getDocument(id).then(function (meta) {
        if (meta.kind === 'ok' && meta.doc.version === room) saver.rebase(id, room, meta.etag)
      }, noop)
    }
    // checked: the page is going away; it led when the save started, and the room may already be leaving with it.
    function put(checked) {
      if (stopped || !needsSave() || (!checked && (!leading || !synced()))) return
      var entry = latest
      return saver.save(id, entry.bytes, { liveSeq: entry.seq === null ? undefined : entry.seq, reason: 'live' }).then(function (result) {
        if (result.status === 'saved') entry.done = true
        else if (result.notLeader) {
          // Leadership moved on before the PUT arrived: the new leader stores what the room holds.
          entry.done = true
          if (regions.covered(regions.mark())) saver.unhold(id)
        }
      })
    }
    /** immediate: the page is going away, so no round to the editor for fresher bytes first. */
    function saveNow(immediate) {
      clearTimers()
      if (!leading || stopped || !synced()) return Promise.resolve()
      if (saving) {
        again = true
        return saving
      }
      var fresh = immediate ? Promise.resolve() : within(deps.host.flush(), FLUSH_WAIT)
      var done = function () {
        saving = null
        if (again) {
          again = false
          if (needsSave()) saveNow(true)
        }
      }
      saving = fresh.then(rebase).then(function () { return put(immediate) }).then(done, done)
      return saving
    }

    function room() {
      var all = regions.covered(regions.mark())
      var inRoom = synced() && all
      saver.setRoom(id, { synced: inRoom, safe: inRoom && (!leading || editors > 1) })
    }
    function update() {
      var version = knownVersion()
      var done = waiting.filter(function (item) { return regions.covered(item.mark) })
      waiting = waiting.filter(function (item) { return !regions.covered(item.mark) })
      done.forEach(function (item) { if (item.revision !== undefined) deps.host.call('acknowledged', id, item.revision, version) })
      if (heldMark !== null && regions.covered(heldMark)) {
        heldMark = null
        saver.unhold(id)
      }
      room()
    }
    function releaseLegacy() {
      var current = doc()
      if (deps.host.supports() || !current || !current.pending || !current.pending.held) return
      if (stopped || fallback || leading || editors <= 1 || regions.phase() === 'offline') saver.release(id)
    }
    function watchRoom() {
      clearTimeout(roomTimer)
      roomTimer = null
      if (stopped || greetedOnce || regions.phase() !== 'offline') return
      roomTimer = setTimeout(function () {
        roomTimer = null
        if (stopped || regions.phase() !== 'offline') return
        fallback = true
        saver.release(id)
      }, ROOM_WAIT)
    }

    function saveV3(bytes, options) {
      var revision = revisionOf(options)
      var mark = regions.mark()
      var copy = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      latest = { bytes: copy, revision: revision, seq: regions.contentSeq(), stored: false }
      var covered = regions.covered(mark)
      if (!covered) {
        saver.hold(id, copy, revision, synced() ? null : 'offline')
        heldMark = mark
      }
      var reason = options && options.reason
      if (leading && synced()) {
        if (reason === 'manual' || reason === 'flush') saveNow(reason === 'flush')
        else if (!quietTimer) schedule()
      }
      room()
      if (covered) return Promise.resolve({ status: 'saved', version: knownVersion() })
      waiting.push({ revision: revision, mark: mark })
      return Promise.resolve({ status: 'offline' })
    }
    function saveLegacy(bytes, options) {
      if (regions.phase() !== 'offline' && !leading && editors > 1) {
        saver.hold(id, bytes, revisionOf(options), 'turn')
        return Promise.resolve({ status: 'offline' })
      }
      return saver.save(id, bytes, options)
    }

    function onPageHide() {
      if (leading && needsSave()) saveNow(true)
    }
    window.addEventListener('pagehide', onPageHide)
    watchRoom()

    return {
      /** erpHost.save for the room's document; anything else goes to the saver as before. */
      save: function (docId, bytes, options) {
        var current = saver.get(docId)
        var editing = current && current.open && current.mode === 'edit' && bytes && ArrayBuffer.isView(bytes)
        if (stopped || fallback || docId !== id || !editing) return saver.save(docId, bytes, options)
        return deps.host.supports() ? saveV3(bytes, options) : saveLegacy(bytes, options)
      },
      /** Coverage of this page's edits changed (online-regions.js onChange). */
      update: update,
      /** A change reached the room, this page's or someone else's. */
      roomChanged: function () { if (leading && deps.host.supports()) schedule() },
      leader: function (now) {
        leading = now
        if (!now) clearTimers()
        else if (deps.host.supports() && (needsSave() || (regions.contentSeq() !== null && regions.contentSeq() > (regions.savedSeq() || 0)))) schedule()
        releaseLegacy()
        room()
      },
      presence: function (members) {
        var before = editors
        editors = (members || []).filter(function (member) { return member && member.mode === 'edit' }).length
        // The others left: the leader stores what is unsaved instead of waiting.
        if (leading && before > 1 && editors <= 1 && needsSave()) saveNow(false)
        releaseLegacy()
        room()
      },
      saved: function (savedSeq) {
        if (latest && latest.seq !== null && typeof savedSeq === 'number' && latest.seq <= savedSeq) latest.done = true
        update()
      },
      saveRequest: function () { if (deps.host.supports()) saveNow(false) },
      greeted: function () {
        greetedOnce = true
        fallback = false
        clearTimeout(roomTimer)
        roomTimer = null
      },
      down: function () {
        clearTimers()
        leading = false
        editors = 0
        watchRoom()
        releaseLegacy()
        room()
      },
      /** The room is gone for this page: whatever waits on the device is saved the v2 way. */
      stop: function () {
        stopped = true
        clearTimers()
        clearTimeout(roomTimer)
        saver.setRoom(id, null)
        saver.release(id)
      },
      busySaving: function () { return Boolean(saving) }
    }
  }
})()
