(function () {
  var intake = window.erpIntake
  var banner
  // Counts messages so a delayed hide never takes down a newer one.
  var shown = 0
  function say(text, role) {
    if (!banner) {
      banner = document.createElement('div')
      banner.className = 'erp-shell__transfer'
      document.body.appendChild(banner)
    }
    shown++
    banner.setAttribute('role', role || 'status')
    banner.textContent = text
  }
  function hideLater(ms) {
    var mine = shown
    setTimeout(function () {
      if (mine !== shown || !banner) return
      banner.remove()
      banner = undefined
    }, ms || 4500)
  }
  function addLink(href, text) {
    var link = document.createElement('a')
    link.href = href
    link.textContent = text
    banner.appendChild(link)
  }
  function clean(name) { return intake ? intake.displayName(name) : String(name) }
  function quoted(name) { return '“' + clean(name) + '”' }
  function text(reason) { return intake ? intake.message(reason) : reason }
  function dismissButton() {
    var button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Đóng'
    button.onclick = function () {
      shown++
      if (banner) banner.remove()
      banner = undefined
    }
    banner.appendChild(button)
  }
  function fail(message, cleanup, timer, reason) {
    clearInterval(timer)
    if (cleanup) cleanup(reason)
    say(message + ' ', 'alert')
    addLink('/', 'Chọn lại tệp')
  }
  // share.js shows its outcome in the same note.
  window.erpShellNotice = function (message, role, ms) {
    say(message, role)
    hideLater(ms)
  }

  // Hands files to the editor as a drop on its canvas; `done` runs once the editor has taken them.
  // Each handoff owns its timer: an ERP page may send the next file before the last one landed.
  function deliver(files, name, done, cleanup) {
    var started = Date.now()
    var what = files.length > 1 ? files.length + ' tệp' : quoted(name)
    say('Đang khởi tạo công cụ để nhận ' + what + '…')
    var timer = setInterval(function () {
      if (Date.now() - started > 120000) { fail(text('notReady'), cleanup, timer, 'notReady'); return }
      var canvas = document.querySelector('canvas')
      if (!canvas) return
      try {
        var transfer = new DataTransfer()
        files.forEach(function (file) { transfer.items.add(file) })
        // eframe cancels handled drops; until its listener is ready, keep the file queued.
        var drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
        if (canvas.dispatchEvent(drop)) return
        clearInterval(timer)
        say('Đã chuyển ' + what + ' vào công cụ.')
        hideLater()
        if (done) done()
      } catch (error) { fail(text('deliverFailed'), cleanup, timer, 'deliverFailed') }
    }, 300)
  }
  // host-bridge.js opens files sent by an embedding ERP page through the same path.
  window.erpShellDeliver = deliver

  // Files handed over by this page whose open result the editor has not reported yet (contract §3).
  var RESULT_GRACE_MS = 120000
  var awaiting = []
  function persist(id, change) {
    if (!id || !intake) return
    intake.openDb().then(function (db) {
      return intake.update(db, id, change).then(function () { db.close() }, function () { db.close() })
    }).catch(function () { /* the banner already told the user; the record expires on its own */ })
  }
  function awaitResults(items, note) {
    var round = { items: items, note: note || '' }
    items.forEach(function (item) { item.round = round; item.ok = null; awaiting.push(item) })
    // Old editor builds never report; their records stay DELIVERED, but the bytes go now rather than in an hour.
    setTimeout(function () {
      awaiting = awaiting.filter(function (item) {
        if (item.round !== round) return true
        if (item.ok === null) persist(item.id, function (record) { if (record.state !== 'DELIVERED') return false; delete record.file })
        return false
      })
    }, RESULT_GRACE_MS)
  }
  function summarise(round) {
    var items = round.items
    var failed = items.filter(function (item) { return item.ok === false })
    var opened = items.filter(function (item) { return item.ok === true }).length
    var line
    if (items.length === 1) {
      line = failed.length ? quoted(items[0].name) + ': ' + text('parserFailed') : 'Đã mở ' + quoted(items[0].name) + '.'
    } else {
      var names = failed.map(function (item) { return clean(item.name) }).join(', ')
      line = 'Đã mở ' + opened + '/' + items.length + ' tệp' + (failed.length ? '; không mở được: ' + names : '') + '.'
    }
    var warn = failed.length || round.note
    say(round.note ? line + ' ' + round.note : line, warn ? 'alert' : 'status')
    hideLater(warn ? 12000 : 4500)
  }
  window.erpIntakeResult = function (name, size, ok) {
    var item = null
    for (var i = 0; i < awaiting.length && !item; i++) {
      if (awaiting[i].ok === null && awaiting[i].name === name && awaiting[i].size === size) item = awaiting[i]
    }
    if (!item) return
    item.ok = Boolean(ok)
    awaiting.splice(awaiting.indexOf(item), 1)
    persist(item.id, function (record) {
      if (ok) { record.state = 'OPENED'; delete record.file } else intake.fail(record, 'parserFailed')
    })
    summarise(item.round)
  }

  // The installed app was opened from "Open with" in the operating system.
  if (window.launchQueue) {
    window.launchQueue.setConsumer(function (params) {
      if (!params.files || !params.files.length) return
      Promise.all(params.files.map(function (handle) { return handle.getFile() }))
        .then(function (files) {
          deliver(files, files[0].name, function () {
            awaitResults(files.map(function (file) { return { id: null, name: file.name, size: file.size, sourceMode: 'OPEN_WITH' } }))
          })
        })
        .catch(function () { fail(text('unreadableFile')) })
    })
  }

  var param = new URLSearchParams(location.search).get('open')
  if (!param) return
  var ids = param.split(',').filter(function (id, i, all) { return id && all.indexOf(id) === i })
  if (!ids.length || !intake) return
  say('Đang chuẩn bị tệp từ máy của bạn…')
  var editor = location.pathname.split('/')[1]

  // Each id is checked on its own: one expired or misrouted entry never blocks the others of its batch.
  function reasonFor(record, now) {
    if (!record || intake.isExpired(record, now)) return 'expired'
    if (record.editor !== editor) return 'wrongEditor'
    if (!intake.deliverable(record, now)) return intake.deliverable(record, Infinity) ? 'busy' : 'already'
    if (!record.file) return 'expired'
    return null
  }
  // Read and claim in one readwrite transaction (the browser serialises those), so two tabs opening the same link
  // never both deliver; expired entries are dropped on the way.
  function claimAll(db) {
    return new Promise(function (resolve, reject) {
      var now = Date.now()
      var transaction = db.transaction(intake.contract.store, 'readwrite')
      var store = transaction.objectStore(intake.contract.store)
      intake.pruneExpired(store, now)
      var entries = ids.map(function (id) { return { id: id, record: undefined, reason: null } })
      entries.forEach(function (item) {
        var read = store.get(item.id)
        read.onsuccess = function () {
          item.record = read.result
          item.reason = reasonFor(item.record, now)
          if (item.reason) return
          item.record.claimedAt = now
          store.put(item.record)
        }
      })
      transaction.oncomplete = function () { resolve(entries) }
      transaction.onabort = function () { reject(transaction.error) }
      transaction.onerror = function () { reject(transaction.error) }
    })
  }
  function writeAll(db, list, change) {
    var transaction = db.transaction(intake.contract.store, 'readwrite')
    var store = transaction.objectStore(intake.contract.store)
    intake.pruneExpired(store, Date.now())
    list.forEach(function (item) { change(item.record); delete item.record.claimedAt; store.put(item.record) })
    transaction.oncomplete = function () { db.close() }
    transaction.onabort = function () { db.close() }
  }
  function sort(entries) {
    var ready = []
    var skipped = []
    entries.forEach(function (item) {
      if (item.reason) skipped.push({ name: item.record ? item.record.name : '', reason: item.reason })
      else ready.push(item)
    })
    return { ready: ready, skipped: skipped }
  }
  function skippedNote(skipped) {
    return skipped.map(function (item) {
      var who = item.name ? quoted(item.name) : 'Một tệp'
      if (item.reason === 'already') return who + ' đã được mở trước đó.'
      if (item.reason === 'busy') return who + ' đang được mở ở một cửa sổ khác.'
      return who + ': ' + text(item.reason)
    }).join(' ')
  }

  intake.openDb().then(function (db) {
    return claimAll(db).then(function (entries) {
      var sorted = sort(entries)
      if (!sorted.ready.length) {
        db.close()
        if (sorted.skipped.every(function (item) { return item.reason === 'busy' })) {
          say(skippedNote(sorted.skipped) + ' ', 'status')
          dismissButton()
          hideLater()
          return
        }
        var only = sorted.skipped.length === 1 ? sorted.skipped[0].reason : null
        fail(only && only !== 'already' ? text(only) : skippedNote(sorted.skipped))
        return
      }
      var files = sorted.ready.map(function (item) {
        var record = item.record
        return new File([record.file], record.name, { type: record.file.type })
      })
      deliver(files, files[0].name, function () {
        // Bytes stay until the editor reports the result: a FAILED_RETRYABLE or a reload can still use them.
        writeAll(db, sorted.ready, function (record) { record.state = 'DELIVERED'; record.errorCode = null; record.reason = null; record.recoverable = false })
        var note = sorted.skipped.length ? skippedNote(sorted.skipped) : ''
        awaitResults(sorted.ready.map(function (item) {
          return { id: item.id, name: item.record.name, size: item.record.file.size, sourceMode: item.record.sourceMode || 'PICKER' }
        }), note)
        if (note) {
          say('Đã chuyển ' + (files.length > 1 ? files.length + ' tệp' : quoted(files[0].name)) + ' vào công cụ. ' + note, 'alert')
          hideLater(12000)
        }
        var url = new URL(location.href)
        url.searchParams.delete('open')
        history.replaceState(null, '', url.pathname + url.search + url.hash)
      }, function (reason) {
        writeAll(db, sorted.ready, function (record) { intake.fail(record, reason, true) })
      })
    }, function () {
      db.close()
      fail(text('storageError'))
    })
  }, function (error) {
    fail(text(error && error.reason ? error.reason : 'storageError'))
  })
})()
