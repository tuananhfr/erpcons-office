(function () {
  // A Rust panic, a wasm trap or running out of memory kills the engine but leaves its last frame on
  // the canvas, so the page looks alive while ignoring every key. Tell the user and offer a reload:
  // drafts are already in IndexedDB, and the next load offers them back.
  var Wasm = typeof WebAssembly !== 'undefined' ? WebAssembly : null
  var OUT_OF_MEMORY = /out of memory|array buffer allocation failed|could not allocate memory|cannot allocate wasm memory|maximum memory size exceeded|memory allocation of \d+ bytes failed/i
  // Trap texts of V8, SpiderMonkey and JavaScriptCore.
  var TRAP = /unreachable code should not be executed|unreachable executed|memory access out of bounds|out of bounds memory access/i
  // Only trusted when the event has no error object: another script may name its own errors RuntimeError.
  var NAMED_TRAP = /^(uncaught )?(webassembly\.)?runtimeerror\b/i
  var WASM_FRAME = /wasm-function\[|wasm:\/\/wasm\//
  var PANIC = 'panicked at '

  var draftStore = window.erpDraftStore
  var lastDraftAt = null
  if (draftStore && draftStore.subscribe) {
    draftStore.subscribe(function (status) {
      if (status && (status.kind === 'saved' || status.kind === 'nearFull') && status.at) lastDraftAt = status.at
    })
  }

  function isWasmTrap(error) {
    return Boolean(error && Wasm && Wasm.RuntimeError && error instanceof Wasm.RuntimeError)
  }
  function engineDied(error, message) {
    if (isWasmTrap(error)) return true
    var hasError = error !== null && error !== undefined
    var text = hasError ? (typeof error.message === 'string' ? error.message : String(error)) : (typeof message === 'string' ? message : '')
    return OUT_OF_MEMORY.test(text) || TRAP.test(text) || (!hasError && NAMED_TRAP.test(text))
  }

  var overlay = null
  var primary = null

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  function time(at) {
    return new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }

  function keepFocus(event) {
    if (overlay && !overlay.contains(event.target)) primary.focus()
  }
  function trapKeys(event) {
    if (!overlay) return
    // A runner that is still half alive must not get keys typed while the dialog is up.
    event.stopPropagation()
    if (event.key !== 'Tab') return
    var stops = overlay.querySelectorAll('button, a[href]')
    var first = stops[0]
    var last = stops[stops.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  function show() {
    if (overlay) return
    var embedded = Boolean(window.erpEmbed)
    overlay = el('div', 'erp-crash')
    var box = el('section', 'erp-crash__box')
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-modal', 'true')
    box.setAttribute('aria-labelledby', 'erp-crash-title')
    box.setAttribute('aria-describedby', 'erp-crash-body')
    var title = el('h2', 'erp-crash__title', 'Công cụ gặp sự cố và đã dừng')
    title.id = 'erp-crash-title'
    var body = el('div', 'erp-crash__body')
    body.id = 'erp-crash-body'
    body.appendChild(el('p', '', draftStore
      ? 'Phần việc từ lần lưu bản nháp gần nhất đến giờ có thể đã mất.'
      : 'Phần việc chưa lưu có thể đã mất.'))
    if (draftStore && lastDraftAt) {
      body.appendChild(el('p', '', 'Bản nháp gần nhất được lưu lúc ' + time(lastDraftAt) + ' trên thiết bị này; tải lại trang để khôi phục.'))
    }
    var actions = el('div', 'erp-crash__actions')
    primary = el('button', 'erp-crash__button erp-crash__button--primary', 'Tải lại trang')
    primary.type = 'button'
    primary.addEventListener('click', function () { location.reload() })
    // Inside the ERP iframe the host page owns navigation.
    if (!embedded) {
      var home = el('a', 'erp-crash__button erp-crash__button--quiet', 'Về trang chủ')
      home.href = '/'
      actions.appendChild(home)
    }
    actions.appendChild(primary)
    box.appendChild(title)
    box.appendChild(body)
    box.appendChild(actions)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    document.addEventListener('focusin', keepFocus, true)
    overlay.addEventListener('keydown', trapKeys)
    primary.focus()
    if (embedded && typeof window.erpEmbed.post === 'function') {
      try { window.erpEmbed.post('crashed', {}) } catch (error) { /* the host may already be gone */ }
    }
  }

  window.addEventListener('error', function (event) {
    var error = event.error
    // An exception that unwound through wasm skipped Rust's cleanup, so the engine's state is no longer sound.
    var throughWasm = Boolean(error && typeof error.stack === 'string' && WASM_FRAME.test(error.stack))
    if (throughWasm || engineDied(error, event.message)) show()
  })
  window.addEventListener('unhandledrejection', function (event) {
    if (engineDied(event.reason, '')) show()
  })
  // The editors' own "leave page?" guard would only add a step to the reload: the engine is gone and
  // whatever the last draft holds is all that can be restored. Capture runs before their listeners.
  window.addEventListener('beforeunload', function (event) {
    if (overlay) event.stopImmediatePropagation()
  }, true)

  // eframe's panic hook reports through console.error ("panicked at …") just before the trap; on
  // wasm a panic always aborts, and nothing on `window` reflects WebRunner::has_panicked.
  var nativeError = console.error
  console.error = function (first) {
    if (typeof first === 'string' && first.indexOf(PANIC) === 0) {
      try { show() } catch (error) { /* reporting the panic matters more */ }
    }
    return nativeError.apply(console, arguments)
  }
})()
