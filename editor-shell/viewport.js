(function () {
  // iOS (and Android without interactive-widget) keeps the layout viewport when the soft keyboard opens, so the
  // canvas would stay full height with the caret under the keys. Publishing the covered height as
  // --erp-keyboard-h lifts the canvas bottom; eframe's ResizeObserver then resizes the engine.
  var viewport = window.visualViewport
  var root = document.documentElement
  if (!viewport || !root || !root.style) return
  // Below this the shrink is toolbar or rounding noise, not a keyboard.
  var MIN_KEYBOARD_PX = 40
  // Avoid re-laying out the engine for every pixel of the keyboard animation.
  var MIN_CHANGE_PX = 4
  var applied = 0
  var pending = false

  function update() {
    pending = false
    // Pinch zoom shrinks the visual viewport too; that is not a keyboard.
    if (Math.abs((viewport.scale || 1) - 1) > 0.01) return
    var covered = Math.round(root.clientHeight - viewport.height - (viewport.offsetTop || 0))
    if (!(covered >= MIN_KEYBOARD_PX)) covered = 0
    if (Math.abs(covered - applied) < MIN_CHANGE_PX) return
    applied = covered
    if (covered) root.style.setProperty('--erp-keyboard-h', covered + 'px')
    else root.style.removeProperty('--erp-keyboard-h')
  }

  function schedule() {
    if (pending) return
    pending = true
    window.requestAnimationFrame(update)
  }

  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
  schedule()
})()
