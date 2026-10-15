(function () {
  var id = new URLSearchParams(location.search).get('open')
  if (!id) return
  var banner = document.createElement('div')
  banner.className = 'erp-shell__transfer'
  banner.setAttribute('role', 'status')
  banner.textContent = 'Đang chuẩn bị tệp từ máy của bạn…'
  document.body.appendChild(banner)
  var db
  var timer
  function fail(message) {
    clearInterval(timer)
    if (db) db.close()
    banner.setAttribute('role', 'alert')
    banner.textContent = message + ' '
    var back = document.createElement('a')
    back.href = '/'
    back.textContent = 'Chọn lại tệp'
    banner.appendChild(back)
  }
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
    read.onerror = function () { fail('Không đọc được tệp tạm.') }
    read.onsuccess = function () {
      var entry = read.result
      if (!entry || entry.expiresAt < Date.now() || location.pathname !== '/' + entry.editor + '/') {
        fail('Tệp tạm đã hết hạn hoặc không dành cho công cụ này.')
        return
      }
      var started = Date.now()
      banner.textContent = 'Đang khởi tạo công cụ để nhận “' + entry.name + '”…'
      timer = setInterval(function () {
        if (Date.now() - started > 120000) { fail('Công cụ chưa sẵn sàng. Tải lại trang để thử lại hoặc mở tệp từ menu File.'); return }
        var canvas = document.querySelector('canvas')
        if (!canvas) return
        try {
          var transfer = new DataTransfer()
          transfer.items.add(new File([entry.file], entry.name, { type: entry.file.type }))
          // eframe cancels handled drops; until its listener is ready, keep the file queued.
          var drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
          if (canvas.dispatchEvent(drop)) return
          clearInterval(timer)
          var remove = db.transaction('pending', 'readwrite')
          remove.objectStore('pending').delete(id)
          remove.oncomplete = function () { db.close() }
          var url = new URL(location.href)
          url.searchParams.delete('open')
          history.replaceState(null, '', url.pathname + url.search + url.hash)
          banner.textContent = 'Đã chuyển “' + entry.name + '” vào công cụ.'
          setTimeout(function () { banner.remove() }, 4500)
        } catch (error) { fail('Không chuyển được tệp. Hãy mở tệp từ menu File của công cụ.') }
      }, 300)
    }
  }
})()
