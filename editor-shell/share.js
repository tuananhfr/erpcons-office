(function () {
  // Web Share for the editors' "Chia sẻ…" command (docs/file-transfer.md, fork contract §1–2 and Amendment 1).
  // Never when embedded: the ERP host page owns where documents go.
  function clean(name) { return window.erpIntake ? window.erpIntake.displayName(name) : String(name) }
  function notice(text, role) { if (window.erpShellNotice) window.erpShellNotice(text, role, role === 'alert' ? 12000 : 4500) }

  // Browsers decide per type and Chromium looks at the extension, so the probe carries both MIME and extension.
  function extensionFor(mime) {
    var map = window.erpMimeTypes || {}
    for (var ext in map) if (Object.prototype.hasOwnProperty.call(map, ext) && map[ext].indexOf(mime) !== -1) return ext
    return 'bin'
  }

  function canShare(file) {
    if (window.erpEmbed) return false
    try {
      if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
      return Boolean(navigator.canShare({ files: [file] }))
    } catch (error) { return false }
  }

  window.erpCanShareFiles = function (mime) {
    var type = typeof mime === 'string' && mime ? mime : 'application/pdf'
    return canShare(new File([''], 'x.' + extensionFor(type), { type: type }))
  }

  function download(file) {
    var url = URL.createObjectURL(file)
    var link = document.createElement('a')
    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 60000)
  }

  // Must run inside the click that asked for it: navigator.share needs that transient user activation.
  window.erpShare = function (bytes, name, mime) {
    var file
    var shared
    try {
      file = new File([bytes], name, { type: mime || 'application/octet-stream' })
      // A type this browser refuses (e.g. .xlsm where only .xlsx passes) is the fork's plain download, not an error.
      if (!canShare(file)) return false
      shared = navigator.share({ files: [file], title: name })
    } catch (error) { return false }
    Promise.resolve(shared).then(function () {
      notice('Đã gửi bản xuất ‘' + clean(name) + '’.')
    }, function (error) {
      if (error && error.name === 'AbortError') return
      // canShare already passed, so NotAllowedError here means the click's activation was lost (slow export).
      notice('Không mở được bảng chia sẻ. Đã tải tệp xuống máy để bạn gửi thủ công.', 'alert')
      download(file)
    })
    return true
  }
})()
