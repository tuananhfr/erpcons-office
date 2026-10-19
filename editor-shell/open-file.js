(function () {
  var banner
  var timer
  function say(text, role) {
    if (!banner) {
      banner = document.createElement('div')
      banner.className = 'erp-shell__transfer'
      document.body.appendChild(banner)
    }
    banner.setAttribute('role', role || 'status')
    banner.textContent = text
  }
  function fail(message, cleanup) {
    clearInterval(timer)
    if (cleanup) cleanup()
    say(message + ' ', 'alert')
    var back = document.createElement('a')
    back.href = '/'
    back.textContent = 'Chọn lại tệp'
    banner.appendChild(back)
  }
  // Hands files to the editor as a drop on its canvas; `done` runs once the editor has taken them.
  function deliver(files, name, done, cleanup) {
    var started = Date.now()
    say('Đang khởi tạo công cụ để nhận “' + name + '”…')
    timer = setInterval(function () {
      if (Date.now() - started > 120000) { fail('Công cụ chưa sẵn sàng. Tải lại trang để thử lại hoặc mở tệp từ menu File.', cleanup); return }
      var canvas = document.querySelector('canvas')
      if (!canvas) return
      try {
        var transfer = new DataTransfer()
        files.forEach(function (file) { transfer.items.add(file) })
        // eframe cancels handled drops; until its listener is ready, keep the file queued.
        var drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
        if (canvas.dispatchEvent(drop)) return
        clearInterval(timer)
        if (done) done()
        say('Đã chuyển “' + name + '” vào công cụ.')
        setTimeout(function () { banner.remove() }, 4500)
      } catch (error) { fail('Không chuyển được tệp. Hãy mở tệp từ menu File của công cụ.', cleanup) }
    }, 300)
  }
  // host-bridge.js opens files sent by an embedding ERP page through the same path.
  window.erpShellDeliver = deliver

  // The installed app was opened from "Open with" in the operating system.
  if (window.launchQueue) {
    window.launchQueue.setConsumer(function (params) {
      if (!params.files || !params.files.length) return
      Promise.all(params.files.map(function (handle) { return handle.getFile() }))
        .then(function (files) { deliver(files, files[0].name) })
        .catch(function () { fail('Không đọc được tệp đã chọn. Hãy mở tệp từ menu File của công cụ.') })
    })
  }

  var id = new URLSearchParams(location.search).get('open')
  if (!id) return
  say('Đang chuẩn bị tệp từ máy của bạn…')
  var db
  function closeDb() { if (db) db.close() }
  var request
  try { request = indexedDB.open('erpcons-file-transfer-v1', 1) }
  catch (error) { fail('Trình duyệt không cho phép lưu trữ tệp tạm. Hãy mở từ menu File.'); return }
  request.onblocked = function () { fail('Bộ nhớ tạm đang bận. Đóng các tab công cụ khác rồi thử lại.') }
  request.onupgradeneeded = function () { request.result.createObjectStore('pending', { keyPath: 'id' }) }
  request.onerror = function () { fail('Không truy cập được tệp tạm. Hãy mở tệp từ menu File của công cụ.') }
  request.onsuccess = function () {
    db = request.result
    var transaction = db.transaction('pending', 'readonly')
    var read = transaction.objectStore('pending').get(id)
    read.onerror = function () { fail('Không đọc được tệp tạm.', closeDb) }
    read.onsuccess = function () {
      var entry = read.result
      if (!entry || entry.expiresAt < Date.now() || location.pathname !== '/' + entry.editor + '/') {
        fail('Tệp tạm đã hết hạn hoặc không dành cho công cụ này.', closeDb)
        return
      }
      deliver([new File([entry.file], entry.name, { type: entry.file.type })], entry.name, function () {
        var remove = db.transaction('pending', 'readwrite')
        remove.objectStore('pending').delete(id)
        remove.oncomplete = closeDb
        var url = new URL(location.href)
        url.searchParams.delete('open')
        history.replaceState(null, '', url.pathname + url.search + url.hash)
      }, closeDb)
    }
  }
})()
