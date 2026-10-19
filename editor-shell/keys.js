(function () {
  // eframe only cancels the browser default for Ctrl+O/P/S, so Ctrl+R reloads, Ctrl+L jumps to the
  // address bar and Ctrl+D bookmarks while the editor runs the same key. Clipboard keys stay
  // untouched: the engine needs the browser's copy/cut/paste events.
  var OFFICE_LETTERS = ['KeyB', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyM', 'KeyR', 'KeyU', 'KeyY']
  // F12 is Save As in every editor; developer tools stay reachable on F12 outside the editor and from the browser menu.
  var PLAIN = ['F1', 'F3', 'F7', 'F12']
  var BY_EDITOR = {
    '/van-ban/': { ctrl: [], plain: [] },
    '/bang-tinh/': { ctrl: [], plain: [] },
    '/trinh-chieu/': { ctrl: [], plain: ['F5'] },
    '/pdf/': { ctrl: ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'], plain: [] },
  }
  var editor = BY_EDITOR[location.pathname]
  if (!editor) return
  var ctrlCodes = OFFICE_LETTERS.concat(editor.ctrl)
  var plainCodes = PLAIN.concat(editor.plain)

  // The engine only hears keys while its canvas or its hidden text field (a canvas sibling) has focus.
  function inEditor(target) {
    if (!target || (target.closest && target.closest('.erp-shell'))) return false
    if (target.tagName === 'CANVAS') return true
    var canvas = document.querySelector('canvas')
    return Boolean(canvas) && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.parentElement === canvas.parentElement
  }

  window.addEventListener('keydown', function (event) {
    if (!inEditor(event.target)) return
    // Ctrl+Alt is AltGr on many layouts and types characters.
    if (event.altKey) return
    var codes = event.ctrlKey || event.metaKey ? ctrlCodes : plainCodes
    if (codes.indexOf(event.code) !== -1) event.preventDefault()
  }, { capture: true })
})()
