(function () {
  // The editors' own "Chia sẻ" with online documents on. The forks ask `erpCanShareFiles` once at start and call
  // `erpShare(bytes, name, mime)` inside the click (share.js, docs/file-transfer.md); `true` means the shell took it.
  // The page's online document opens the Cloud share dialog; a local file can go to "Tài liệu của tôi" first.
  var online = window.erpOnline = window.erpOnline || {}
  var EDITOR_OF_FORMAT = { docx: 'van-ban', xlsx: 'bang-tinh', pptx: 'trinh-chieu', pdf: 'pdf' }

  function extensionOf(name) {
    var match = /\.([A-Za-z0-9]+)$/.exec(name)
    return match ? match[1].toLowerCase() : ''
  }
  function withoutExtension(name, extension) {
    var lower = name.toLowerCase()
    return extension && lower.slice(-extension.length - 1) === '.' + extension ? name.slice(0, -extension.length - 1) : name
  }
  function key(text) { return text.trim().toLocaleLowerCase('vi') }

  /** Whether the file name an editor exports under is the one it gave this online document (title + format). */
  online.sameDocument = function (name, title, format) {
    var given = key(withoutExtension(String(name).trim(), extensionOf(String(name).trim())))
    // The forks name a document after its title, as the format's file: some replace path separators, some drop
    // everything up to the last one.
    var titled = String(title)
    return [titled.replace(/[\\/\u0000-\u001f\u007f]/g, '-'), titled.split(/[\\/]/).pop()].some(function (candidate) {
      return given !== '' && key(withoutExtension(candidate.trim(), format)) === given
    })
  }

  function randomKey() {
    if (crypto.randomUUID) return crypto.randomUUID()
    var bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.prototype.map.call(bytes, function (b) { return (b + 256).toString(16).slice(1) }).join('')
  }
  function saveFile(bytes, name, mime) {
    var url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }))
    var anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 60 * 1000)
  }
  function shown(name) { return window.erpIntake && typeof window.erpIntake.displayName === 'function' ? window.erpIntake.displayName(name) : name }
  function uploadMessage(outcome) {
    if (outcome.kind === 'forbidden') return 'Tài khoản này chưa lưu được tài liệu mới lên máy chủ.'
    return online.outcomeMessage(outcome)
  }

  /** Replaces share.js's two functions on an editor page that is not embedded and not the public link page. */
  online.installShare = function (account) {
    var webCanShare = window.erpCanShareFiles
    var webShare = window.erpShare
    if (typeof webShare !== 'function' || typeof webCanShare !== 'function' || account.status() === 'disabled') return
    var api = online.createApi(account.apiFetch)

    function upload(bytes, name, uploadKey, dialog) {
      return api.uploadFile(bytes, name, uploadKey).then(function (outcome) {
        if (outcome.kind !== 'ok') return dialog.setNote(uploadMessage(outcome))
        var editor = EDITOR_OF_FORMAT[outcome.doc.format]
        if (!editor) return dialog.setNote(online.messages.failed)
        dialog.setNote('Đã lưu vào Tài liệu của tôi. Đang mở để chia sẻ…')
        // A new page, so erpHost exists before the editor starts; the bytes uploaded are the document on screen.
        location.assign(location.origin + '/' + editor + '/?doc=' + encodeURIComponent(outcome.doc.id) + '&share=1')
        // Keeps the buttons disabled while the page goes.
        return new Promise(function () {})
      }, function () { dialog.setNote(online.messages.failed) })
    }

    function choose(bytes, name, mime) {
      // One key per dialog: a retried click after a lost answer must not store the file twice.
      var uploadKey = randomKey()
      var signedIn = account.status() === 'signed-in'
      var sendLabel = webCanShare(mime) ? 'Gửi bản sao' : 'Tải bản sao xuống'
      var close = function (dialog) { dialog.close() }
      var save = signedIn
        ? { label: 'Lưu lên Tài liệu của tôi và chia sẻ', kind: 'primary', onClick: function (dialog) { return upload(bytes, name, uploadKey, dialog) } }
        : {
          label: 'Đăng nhập để lưu lên Cloud',
          kind: 'primary',
          // Opens the sign-in popup, so it runs inside this click.
          onClick: function (dialog) {
            return account.signIn().then(function (snapshot) {
              if (snapshot && snapshot.status === 'signed-in') return upload(bytes, name, uploadKey, dialog)
            })
          }
        }
      online.dialogs.open({
        id: 'share-local',
        title: 'Chia sẻ tệp này',
        paragraphs: [signedIn
          ? '“' + shown(name) + '” đang mở từ máy của bạn. Lưu lên Tài liệu của tôi để mời người khác xem hoặc sửa, hoặc gửi một bản sao.'
          : '“' + shown(name) + '” đang mở từ máy của bạn. Đăng nhập PI ID để lưu lên Tài liệu của tôi rồi chia sẻ, hoặc gửi một bản sao.'],
        actions: [
          save,
          {
            label: sendLabel,
            kind: 'quiet',
            // A click in this dialog is a new user activation, so the share sheet may open from here.
            onClick: function (dialog) {
              dialog.close()
              if (!webShare(bytes, name, mime)) saveFile(bytes, name, mime)
            }
          },
          { label: 'Đóng', kind: 'quiet', onClick: close }
        ],
        onEscape: close
      })
    }

    window.erpCanShareFiles = function () { return true }
    window.erpShare = function (bytes, name, mime) {
      var page = typeof online.pageShare === 'function' ? online.pageShare(String(name)) : null
      if (page === true) return true
      var cloud = Boolean(EDITOR_OF_FORMAT[extensionOf(String(name))])
      // This user may not share the page's document, or the format cannot go to the server: as without the Cloud.
      if (page === false || !cloud) return webShare(bytes, name, mime)
      // Copied: the dialog outlives this call, and the fork may reuse the buffer it passed.
      choose(new Uint8Array(bytes), String(name), mime)
      return true
    }
  }
})()
