(function () {
  // The engines' pickers (rfd) list extensions only, which iOS Safari maps poorly to its file types and
  // greys files out; append the matching MIME types (window.erpMimeTypes) right before the native click.
  var types = window.erpMimeTypes
  var Input = typeof HTMLInputElement === 'undefined' ? null : HTMLInputElement
  if (!types || !Input || typeof Input.prototype.click !== 'function') return
  var nativeClick = Input.prototype.click

  function withMimeTypes(accept) {
    var tokens = accept.split(',').map(function (t) { return t.trim() }).filter(Boolean)
    var present = {}
    tokens.forEach(function (t) { present[t.toLowerCase()] = true })
    var result = tokens.slice()
    tokens.forEach(function (t) {
      if (t.charAt(0) !== '.') return
      var ext = t.slice(1).toLowerCase()
      var mimes = Object.prototype.hasOwnProperty.call(types, ext) ? types[ext] : []
      mimes.forEach(function (mime) {
        if (present[mime]) return
        present[mime] = true
        result.push(mime)
      })
    })
    return result.join(',')
  }

  // rfd clicks synchronously inside the user's gesture, so rewriting here keeps the activation the picker needs.
  Input.prototype.click = function () {
    if (this.type === 'file' && this.accept) {
      var accept = withMimeTypes(this.accept)
      if (accept !== this.accept) this.accept = accept
    }
    return nativeClick.apply(this, arguments)
  }
})()
