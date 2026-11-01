(function () {
  // Region co-editing in the live room (erpHost v3, docs/erp-host.md; server side: erpcons-office-server
  // docs/openapi.yaml, "Co-editing (M4)"): locks with their 2 s renewals, coalesced `region.update`s with a cid, acks,
  // each remote update applied once by seq, replay after every join, and the edits made offline with their conflict
  // question. Region ids, payloads, ranges and names never reach a log.
  var online = window.erpOnline = window.erpOnline || {}
  var COALESCE = 150
  var RENEW = 2000
  var CURSOR_GAP = 100
  // An unanswered lock.acquire: the connection is in trouble and the reconnect sorts it out.
  var LOCK_WAIT = 5000
  var RETRY_FLOOR = 500
  var DEFAULT_REGION_BYTES = 1024 * 1024

  function noop() {}
  function isSeq(value) { return typeof value === 'number' && value >= 0 && Math.floor(value) === value }
  function isText(value) { return typeof value === 'string' && value.length > 0 }
  function utf8Length(text) {
    var length = 0
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i)
      if (code < 0x80) length += 1
      else if (code < 0x800) length += 2
      else if (code >= 0xd800 && code <= 0xdbff) { length += 4; i++ } else length += 3
    }
    return length
  }

  /**
   * deps: {
   *   send(msg) → boolean (online-live.js),
   *   host: { call(name, ...args), supports() → true when the editor speaks erpHost v3 },
   *   editable() → true while this page's document is open in `edit` mode,
   *   isOpen() → true once the editor reported the current content as opened,
   *   contentVersion() → the version of the content the editor shows,
   *   reload() → loads the latest content into the editor again (preserving the view),
   *   ask(regions) → Promise<'mine' | 'theirs'>: the shell's conflict dialog for editors without regionConflict,
   *   onChange(): this page's unsynced edits changed, onRoomChange(): a change reached the room (local or remote),
   *   canCursor() → true in `edit` and `comment` mode,
   *   onLeader(isLeader), onSaved(savedSeq, version), onSaveRequest(), notice(text)
   * }
   */
  online.createRegions = function (deps) {
    var cidPrefix = online.clientId || 'c'
    var cidCount = 0
    var you = null
    // This page's member ids of earlier sessions too: a replay may bring back its own unacknowledged update.
    var mine = {}
    var leader = null
    var members = []
    var table = {}
    // offline: no greeted session; waiting: greeted, the content or the editor is not ready; replaying; synced.
    var phase = 'offline'
    var applied = null
    var savedSeq = null
    var savedVersion = null
    var maxRegionBytes = DEFAULT_REGION_BYTES
    var replayBuffer = null
    var replaySince = null
    var reloading = false
    var reloadTries = 0
    // region → { editing, granted, resolving, auto }: locks this page holds or wants.
    var locks = {}
    var acquiring = {}
    var retryTimers = {}
    var deniedWait = {}
    var renewTimer = null
    // region → { payload, first }: edits inside the 150 ms window.
    var buffer = {}
    var bufferTimer = null
    var changeCount = 0
    // Edits on their way: { cid, region, payload, first, sent }, in the order they were made.
    var outbox = []
    // region → { payload, author, seq }: remote updates held back over this page's own unsent edits.
    var theirs = {}
    // Regions whose content the editor lost in a reload (REPLAY_GONE) while it still had unsent edits there.
    var reloaded = {}
    var resolving = false
    var tooBigNoticed = false
    var cursors = {}
    var cursorTimer = null
    var cursorWaiting = null

    function call(name) {
      var args = Array.prototype.slice.call(arguments, 1)
      return deps.host.call.apply(null, [name].concat(args))
    }
    function v3() { return deps.host.supports() }
    function nextCid() {
      cidCount += 1
      return cidPrefix + '-' + cidCount.toString(36)
    }
    function send(message) {
      message.v = 1
      return deps.send(message)
    }
    function changed() { try { deps.onChange() } catch (e) { console.error('erpOnline regions onChange failed') } }
    function memberOf(id) {
      for (var i = 0; i < members.length; i++) if (members[i].id === id) return members[i]
      return null
    }
    function describe(id) {
      var member = memberOf(id)
      return { name: member ? online.memberName(member) : '', colour: member && member.colour ? member.colour : '' }
    }

    // ---- What the editor is shown

    function showLocks() {
      if (!v3()) return
      var list = Object.keys(table).map(function (region) {
        var lock = table[region] || {}
        var who = describe(lock.holder)
        return { region: region, holder: lock.holder, name: who.name, colour: lock.colour || who.colour, mine: lock.holder === you }
      })
      call('showLocks', list)
    }
    function showCursors() {
      if (!v3()) return
      var list = Object.keys(cursors).map(function (author) {
        var who = describe(author)
        return { author: author, name: who.name, colour: who.colour, region: cursors[author].region, range: cursors[author].range }
      })
      call('showCursors', list)
    }
    function showPresence() {
      if (!v3()) return
      call('showPresence', members.map(function (member) {
        return {
          id: member.id, kind: member.kind, name: online.memberName(member), colour: member.colour, mode: member.mode,
          state: member.state, person: member.person || member.id, you: member.id === you
        }
      }))
    }

    // ---- Locks

    function lockOf(region) { return locks[region] || (locks[region] = { editing: false, granted: false, resolving: false }) }
    function hasUnsent(region) {
      if (buffer[region]) return true
      for (var i = 0; i < outbox.length; i++) if (outbox[i].region === region && !outbox[i].sent) return true
      return false
    }
    function hasPending(region) {
      if (buffer[region]) return true
      for (var i = 0; i < outbox.length; i++) if (outbox[i].region === region) return true
      return false
    }
    function startRenewals() {
      if (renewTimer) return
      renewTimer = setTimeout(renew, RENEW)
    }
    function renew() {
      renewTimer = null
      if (phase !== 'synced') return
      var any = false
      Object.keys(locks).forEach(function (region) {
        var lock = locks[region]
        if (!lock.granted) return
        if (!lock.editing && !lock.resolving && !hasUnsent(region)) return release(region)
        send({ type: 'lock.renew', region: region })
        any = true
      })
      if (any) startRenewals()
    }
    function release(region) {
      var lock = locks[region]
      if (!lock) return
      if (lock.granted) send({ type: 'lock.release', region: region })
      delete locks[region]
    }
    function maybeRelease(region) {
      var lock = locks[region]
      if (lock && lock.granted && !lock.editing && !lock.resolving && !hasUnsent(region)) release(region)
    }
    /** → Promise<true | false | null>; null: no answer (offline). */
    function acquire(region) {
      return new Promise(function (resolve) {
        var cid = nextCid()
        if (!send({ type: 'lock.acquire', region: region, cid: cid })) return resolve(null)
        acquiring[cid] = {
          region: region,
          resolve: resolve,
          timer: setTimeout(function () { settleAcquire(cid, null, 0) }, LOCK_WAIT)
        }
      })
    }
    function settleAcquire(cid, granted, expires) {
      var wait = acquiring[cid]
      if (!wait) return
      delete acquiring[cid]
      clearTimeout(wait.timer)
      if (granted) {
        lockOf(wait.region).granted = true
        startRenewals()
      }
      wait.expires = expires
      wait.resolve(granted)
    }
    function acquiringRegion(region) {
      return Object.keys(acquiring).some(function (cid) { return acquiring[cid].region === region })
    }
    function retryLater(region, delay) {
      if (retryTimers[region]) return
      retryTimers[region] = setTimeout(function () {
        delete retryTimers[region]
        pump()
      }, Math.max(delay || 0, RETRY_FLOOR))
    }
    function lost(region) {
      var lock = locks[region]
      if (!lock) return
      var wasEditing = lock.editing
      lock.granted = false
      lock.editing = false
      if (!hasPending(region) && !lock.resolving) delete locks[region]
      if (wasEditing) call('lockDenied', region)
    }

    function willEdit(region) {
      if (!isText(region) || !deps.editable()) return Promise.resolve(false)
      var lock = locks[region]
      if (lock && lock.granted) {
        lock.editing = true
        return Promise.resolve(true)
      }
      // Offline or still joining: the edit goes ahead and is synced (locked, checked, sent) after the join.
      if (phase !== 'synced') {
        lockOf(region).editing = true
        return Promise.resolve(true)
      }
      return acquire(region).then(function (granted) {
        if (granted === false) return false
        lockOf(region).editing = true
        return true
      })
    }

    function didEndEdit(region) {
      var lock = locks[region]
      if (!lock) return
      lock.editing = false
      if (buffer[region]) drain()
      if (!lock.granted && !lock.resolving && !hasPending(region)) delete locks[region]
      else maybeRelease(region)
    }

    // ---- Outgoing edits

    function changedRegion(region, payload) {
      if (!isText(region) || typeof payload !== 'string' || !deps.editable()) return
      changeCount += 1
      if (buffer[region]) buffer[region].payload = payload
      else buffer[region] = { payload: payload, first: changeCount }
      if (!bufferTimer) bufferTimer = setTimeout(drain, COALESCE)
      changed()
      deps.onRoomChange()
    }
    function drain() {
      clearTimeout(bufferTimer)
      bufferTimer = null
      Object.keys(buffer).forEach(function (region) {
        var edit = buffer[region]
        var waiting = null
        for (var i = 0; i < outbox.length; i++) if (outbox[i].region === region && !outbox[i].sent) waiting = outbox[i]
        // A region's content is whole in each payload: an unsent older one is simply replaced.
        if (waiting) waiting.payload = edit.payload
        else outbox.push({ cid: nextCid(), region: region, payload: edit.payload, first: edit.first, sent: false })
      })
      buffer = {}
      pump()
    }
    function sendEdit(edit) {
      var message = { type: 'region.update', v: 1, region: edit.region, cid: edit.cid, payload: edit.payload }
      if (utf8Length(JSON.stringify(message)) > maxRegionBytes) {
        // The server would close the connection (1009); the edit stays here, unsynced, and says so once.
        edit.tooBig = true
        if (!tooBigNoticed && deps.notice) deps.notice('Một thay đổi quá lớn để gửi cho những người đang cùng sửa. Thay đổi đó chỉ có trên máy này.')
        tooBigNoticed = true
        return
      }
      if (deps.send(message)) edit.sent = true
    }
    function pump() {
      if (phase !== 'synced' || !v3() || !deps.editable()) return
      outbox.forEach(function (edit) {
        if (edit.sent || edit.tooBig) return
        var region = edit.region
        var lock = locks[region]
        if (lock && lock.granted) {
          if (lock.resolving) return
          if (theirs[region] || reloaded[region]) return askLater()
          return sendEdit(edit)
        }
        if (acquiringRegion(region) || retryTimers[region]) return
        acquire(region).then(function (granted) {
          if (granted) return pump()
          // Someone else holds it: try again when theirs lapses or the table changes.
          retryLater(region, granted === false ? deniedWait[region] : RENEW)
        })
      })
      Object.keys(locks).forEach(maybeRelease)
    }

    // ---- Conflicts (edits made while away, on a region someone else changed meanwhile)

    var askTimer = null
    function askLater() {
      if (askTimer || resolving) return
      askTimer = setTimeout(function () { askTimer = null; resolveConflicts() }, 0)
    }
    function conflictRegions() {
      var regions = []
      outbox.forEach(function (edit) {
        var lock = locks[edit.region]
        if (!edit.sent && lock && lock.granted && (theirs[edit.region] || reloaded[edit.region]) && regions.indexOf(edit.region) === -1) regions.push(edit.region)
      })
      return regions
    }
    function settle(region, choice) {
      var lock = locks[region]
      var mine = null
      outbox.forEach(function (edit) { if (edit.region === region && !edit.sent) mine = edit.payload })
      var remote = theirs[region]
      var wasReloaded = reloaded[region]
      delete theirs[region]
      delete reloaded[region]
      if (lock) lock.resolving = false
      if (choice === 'theirs') {
        outbox = outbox.filter(function (edit) { return edit.region !== region || edit.sent })
        delete buffer[region]
        if (remote && remote.payload !== null) call('applyRemote', region, remote.payload, remote.author)
      } else if (wasReloaded && mine !== null) {
        // The reload put the server's content there; the editor shows this page's edit again.
        call('applyRemote', region, mine, you)
      }
    }
    function resolveConflicts() {
      if (resolving || phase !== 'synced') return
      var regions = conflictRegions()
      if (!regions.length) return
      resolving = true
      regions.forEach(function (region) { lockOf(region).resolving = true })
      startRenewals()
      var asked
      if (deps.host.has('regionConflict')) {
        // One region at a time: the editor shows each region it is asked about.
        asked = regions.reduce(function (chain, region) {
          return chain.then(function () {
            var answer
            try { answer = call('regionConflict', region) } catch (e) { answer = null }
            return Promise.resolve(answer).then(null, function () { return null }).then(function (choice) {
              // An editor that cannot say keeps the user's edit: it was made in good faith and the lock is now ours.
              settle(region, choice === 'theirs' ? 'theirs' : 'mine')
            })
          })
        }, Promise.resolve())
      } else {
        asked = Promise.resolve(deps.ask(regions)).then(null, function () { return 'mine' }).then(function (choice) {
          regions.forEach(function (region) { settle(region, choice === 'theirs' ? 'theirs' : 'mine') })
        })
      }
      asked.then(function () {
        resolving = false
        changed()
        pump()
        askLater()
      })
    }

    // ---- Incoming

    function ownEcho(msg) {
      if (mine[msg.author]) return true
      if (buffer[msg.region] && buffer[msg.region].payload === msg.payload) return true
      return outbox.some(function (edit) { return edit.region === msg.region && edit.payload === msg.payload })
    }
    function applyIncoming(msg) {
      if (applied !== null && msg.seq <= applied) return
      applied = msg.seq
      // This page's own update taken before a drop: resending its cid gets the old ack, nothing to apply or ask.
      if (hasPending(msg.region) && ownEcho(msg)) return
      if (hasPending(msg.region)) {
        theirs[msg.region] = { payload: msg.payload, author: msg.author, seq: msg.seq }
        if (hasUnsent(msg.region)) askLater()
      } else {
        call('applyRemote', msg.region, msg.payload, msg.author)
      }
      deps.onRoomChange()
    }
    function onAck(msg) {
      var at = -1
      for (var i = 0; i < outbox.length; i++) if (outbox[i].cid === msg.cid) at = i
      if (at === -1) return
      var edit = outbox.splice(at, 1)[0]
      if (applied === null || msg.seq > applied) applied = msg.seq
      var remote = theirs[edit.region]
      if (remote && !hasPending(edit.region)) {
        delete theirs[edit.region]
        // An update ordered after this page's own one is the region's content now, here too.
        if (remote.seq > msg.seq) call('applyRemote', edit.region, remote.payload, remote.author)
      }
      maybeRelease(edit.region)
      changed()
    }
    function onError(msg) {
      if (msg.code === 'REPLAY_GONE') return replayGone(msg)
      if (typeof msg.cid !== 'string') return
      if (acquiring[msg.cid]) return settleAcquire(msg.cid, false, 0)
      var edit = null
      outbox.forEach(function (item) { if (item.cid === msg.cid) edit = item })
      if (!edit) return
      if (msg.code === 'LOCK_REQUIRED') {
        // The lock lapsed before the update arrived: lock again, then the same cid goes again.
        edit.sent = false
        lost(edit.region)
        pump()
      } else if (msg.code === 'FORBIDDEN_MODE') {
        edit.sent = false
      } else {
        outbox = outbox.filter(function (item) { return item !== edit })
        console.warn('erpOnline region update refused', msg.code)
        changed()
      }
    }

    function startSync() {
      if (phase !== 'waiting' || reloading || !deps.isOpen()) return
      if (!v3()) {
        phase = 'synced'
        return
      }
      var since = applied
      if (since === null) {
        // Fresh content: it holds the room's updates up to its last save, provided it is at least that save.
        var version = deps.contentVersion()
        // A read racing the leader's commit may still bring the older version: a few more tries, then go on with it.
        if (savedVersion !== null && typeof version === 'number' && version < savedVersion && reloadTries < 3) return reload()
        since = isSeq(savedSeq) ? savedSeq : null
      }
      if (since === null) {
        phase = 'synced'
        return pump()
      }
      replayBuffer = {}
      replaySince = since
      phase = 'replaying'
      if (!send({ type: 'region.replay', since: since })) phase = 'waiting'
    }
    function onReplayed(msg) {
      if (phase !== 'replaying') return
      var buffered = replayBuffer || {}
      replayBuffer = null
      phase = 'synced'
      reloadTries = 0
      if (applied === null) applied = replaySince
      Object.keys(buffered).map(Number).sort(function (a, b) { return a - b }).forEach(function (seq) {
        if (seq > replaySince) applyIncoming(buffered[seq])
      })
      if (isSeq(msg.seq) && msg.seq > applied) applied = msg.seq
      afterSync()
    }
    // Locks went with the old connection: the regions being edited are locked again, or the editor hears it lost them.
    function afterSync() {
      Object.keys(locks).forEach(function (region) {
        var lock = locks[region]
        if (lock.granted || !lock.editing) return
        acquire(region).then(function (granted) {
          if (granted === false) lost(region)
          pump()
        })
      })
      pump()
      askLater()
      changed()
    }
    function replayGone(msg) {
      if (isSeq(msg.saved_seq)) savedSeq = msg.saved_seq
      if (msg.saved_version === null || isSeq(msg.saved_version)) savedVersion = msg.saved_version
      replayBuffer = null
      // Whatever this page still has to send was made on content the reload replaces: each such region is asked about.
      outbox.forEach(function (edit) { if (!edit.sent) reloaded[edit.region] = true })
      Object.keys(buffer).forEach(function (region) { reloaded[region] = true })
      applied = null
      phase = 'waiting'
      reload()
    }
    function reload() {
      if (reloading) return
      reloading = true
      reloadTries += 1
      var start = function () {
        Promise.resolve(deps.reload()).then(null, noop).then(function () {
          reloading = false
          startSync()
        })
      }
      if (reloadTries > 1) setTimeout(start, 1000)
      else start()
    }

    function receive(msg) {
      switch (msg.type) {
        case 'locks':
          table = msg.locks && typeof msg.locks === 'object' ? msg.locks : {}
          showLocks()
          // A lock someone let go may be the one an edit waits for.
          Object.keys(retryTimers).forEach(function (region) {
            if (!table[region]) { clearTimeout(retryTimers[region]); delete retryTimers[region] }
          })
          pump()
          break
        case 'lock.granted':
          if (typeof msg.cid === 'string') settleAcquire(msg.cid, true, msg.expires_ms)
          break
        case 'lock.denied':
          if (typeof msg.cid === 'string') {
            var wait = acquiring[msg.cid]
            if (wait) deniedWait[wait.region] = isSeq(msg.expires_ms) ? msg.expires_ms : RENEW
            settleAcquire(msg.cid, false, msg.expires_ms)
          } else if (isText(msg.region)) {
            lost(msg.region)
            pump()
          }
          break
        case 'region.update':
          if (!isSeq(msg.seq) || !isText(msg.region) || typeof msg.payload !== 'string') return
          if (phase === 'replaying') {
            replayBuffer[msg.seq] = msg
            return
          }
          // Until the replay, everything comes with it.
          if (phase === 'synced') applyIncoming(msg)
          break
        case 'ack':
          if (typeof msg.cid === 'string' && isSeq(msg.seq)) onAck(msg)
          break
        case 'cursor':
          if (typeof msg.author !== 'string' || msg.author === you || typeof msg.region !== 'string' || typeof msg.range !== 'string') return
          cursors[msg.author] = { region: msg.region, range: msg.range }
          showCursors()
          break
        case 'region.replayed':
          onReplayed(msg)
          break
        case 'save.request':
          deps.onSaveRequest()
          break
        case 'saved':
          if (isSeq(msg.saved_seq)) savedSeq = msg.saved_seq
          if (isSeq(msg.version)) savedVersion = msg.version
          deps.onSaved(savedSeq, savedVersion)
          break
        case 'error':
          onError(msg)
          break
      }
    }

    var told = null
    function setLeader(id, force) {
      leader = id
      var now = leader !== null && leader === you
      if (now === told && !force) return
      told = now
      call('isLeader', now)
      deps.onLeader(now)
    }
    function showAll() {
      showPresence()
      showLocks()
      showCursors()
      told = leader !== null && leader === you
      call('isLeader', told)
    }

    function selection(region, range) {
      if (typeof region !== 'string' || typeof range !== 'string' || phase === 'offline' || !deps.canCursor()) return
      var message = { type: 'cursor', region: region, range: range }
      if (cursorTimer) {
        cursorWaiting = message
        return
      }
      send(message)
      cursorTimer = setTimeout(function tick() {
        if (cursorWaiting && phase !== 'offline') {
          send(cursorWaiting)
          cursorWaiting = null
          cursorTimer = setTimeout(tick, CURSOR_GAP)
        } else {
          cursorTimer = null
          cursorWaiting = null
        }
      }, CURSOR_GAP)
    }

    return {
      willEdit: willEdit,
      changed: changedRegion,
      didEndEdit: didEndEdit,
      selection: selection,
      receive: receive,
      hello: function (msg) {
        you = typeof msg.you === 'string' ? msg.you : null
        if (you) mine[you] = true
        members = Array.isArray(msg.members) ? msg.members : []
        if (isSeq(msg.saved_seq)) savedSeq = msg.saved_seq
        savedVersion = isSeq(msg.saved_version) ? msg.saved_version : null
        if (msg.limits && isSeq(msg.limits.max_region_message_bytes)) maxRegionBytes = msg.limits.max_region_message_bytes
        // The server dropped this page's locks with the old connection; unacked edits go again with their cids.
        Object.keys(locks).forEach(function (region) { locks[region].granted = false })
        outbox.forEach(function (edit) { edit.sent = false })
        table = {}
        phase = 'waiting'
        showPresence()
        showLocks()
        setLeader(typeof msg.leader === 'string' ? msg.leader : null, true)
        startSync()
      },
      presence: function (list) {
        members = Array.isArray(list) ? list : []
        var present = {}
        members.forEach(function (member) { present[member.id] = true })
        var gone = Object.keys(cursors).filter(function (author) { return !present[author] })
        gone.forEach(function (author) { delete cursors[author] })
        showPresence()
        if (gone.length) showCursors()
      },
      leader: function (id) { setLeader(typeof id === 'string' ? id : null, false) },
      down: function () {
        phase = 'offline'
        replayBuffer = null
        Object.keys(acquiring).forEach(function (cid) { settleAcquire(cid, null, 0) })
        Object.keys(locks).forEach(function (region) { locks[region].granted = false })
        Object.keys(retryTimers).forEach(function (region) { clearTimeout(retryTimers[region]) })
        retryTimers = {}
        outbox.forEach(function (edit) { edit.sent = false })
        clearTimeout(renewTimer)
        renewTimer = null
        clearTimeout(cursorTimer)
        cursorTimer = null
        cursorWaiting = null
        members = []
        cursors = {}
        table = {}
        showCursors()
        showLocks()
        if (leader !== null) setLeader(null, false)
        changed()
      },
      /** The editor was handed new content of this document: whatever it showed before is gone. */
      loaded: function () {
        applied = null
        cursors = {}
        if (phase !== 'offline') phase = 'waiting'
      },
      /** The editor opened the content it was handed (an editor that registered late sees the room now). */
      opened: function () {
        if (v3() && phase !== 'offline') showAll()
        startSync()
      },
      /** Sends what the 150 ms window holds now (a flush before the page hides or a downgrade). */
      flush: function () { if (bufferTimer) drain() },
      phase: function () { return phase },
      you: function () { return you },
      isLeader: function () { return leader !== null && leader === you },
      /** Members in `edit` mode, this page included. */
      editors: function () { return members.filter(function (member) { return member.mode === 'edit' }).length },
      /** How many edits this page made so far; a save remembers it to know when they all reached the room. */
      mark: function () { return changeCount },
      /** True when the room acknowledged every edit up to `mark`. */
      covered: function (mark) {
        var regions = Object.keys(buffer)
        for (var i = 0; i < regions.length; i++) if (buffer[regions[i]].first <= mark) return false
        for (var j = 0; j < outbox.length; j++) if (outbox[j].first <= mark) return false
        return true
      },
      /** The last room update the editor's content holds (what a save of it may claim in X-Live-Seq). */
      contentSeq: function () {
        if (applied === null) return null
        var seq = applied
        // Updates held back over this page's own edits are not in the content yet.
        Object.keys(theirs).forEach(function (region) { if (theirs[region].seq - 1 < seq) seq = theirs[region].seq - 1 })
        return seq
      },
      savedSeq: function () { return savedSeq },
      savedVersion: function () { return savedVersion },
      /** True while the room delivers this document's changes as they happen. */
      live: function () { return v3() && phase !== 'offline' }
    }
  }
})()
