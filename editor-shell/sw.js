var CACHE = 'erpcons-office-__BUILD_ID__'
// Every URL path of this build, filled in by assemble; empty means "unknown", which disables pruning.
var MANIFEST = /*__ASSET_MANIFEST__*/[]

// PI sign-in popup and callback (src/config/pi.ts): the callback URL carries the one-time `code` and `state`, which
// must never reach Cache Storage or be served back offline. Issuer and API requests are cross-origin, so bypassed too.
var SIGN_IN_PREFIX = '/dang-nhap/'

function classify(url, method, mode, origin) {
  if (method !== 'GET' || url.origin !== origin || url.pathname === '/sw.js') return 'bypass'
  if (url.pathname.indexOf(SIGN_IN_PREFIX) === 0) return 'bypass'
  if (mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return 'network-first'
  return 'cache-first'
}

// Only full 200 responses are stored: Cache.put rejects 206 range replies.
function storable(response) {
  return response.status === 200 && response.type === 'basic'
}

// A page's directory, minus sub-directories that are pages of their own ("/" does not own "/van-ban/").
function ownedBy(pageDir, pathname) {
  if (pathname.indexOf(pageDir) !== 0) return false
  return !MANIFEST.some(function (p) { return p !== pageDir && p.slice(-1) === '/' && p.indexOf(pageDir) === 0 && pathname.indexOf(p) === 0 })
}

// A tab still running the previous build can lazy-load its old files (fonts, chunks) at any time.
async function pageOpenElsewhere(pageDir, requestingId) {
  var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return windows.some(function (client) {
    if (client.id === requestingId) return false
    var url
    try { url = new URL(client.url) } catch (error) { return false }
    return url.origin === self.location.origin && ownedBy(pageDir, url.pathname)
  })
}

// Old-build files stay until their page is fetched fresh: until then they are what that cached page needs offline.
async function prune(cache, pageDir, requestingId) {
  if (MANIFEST.length === 0) return
  if (await pageOpenElsewhere(pageDir, requestingId)) return
  var keys = await cache.keys()
  await Promise.all(keys.map(function (request) {
    var pathname = new URL(request.url).pathname
    if (ownedBy(pageDir, pathname) && MANIFEST.indexOf(pathname) === -1) return cache.delete(request)
  }))
}

var OFFLINE_MESSAGE = 'Không tải được trang này. Hãy kiểm tra kết nối mạng rồi thử lại. Khi mất mạng, mỗi công cụ chỉ mở được nếu trước đó đã mở ít nhất một lần lúc có mạng trên thiết bị này.'

function messagePage(status, message, retryUrl) {
  var retry = retryUrl ? '<a href="' + retryUrl + '">Thử lại</a> · ' : ''
  var html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Văn phòng by ERPCons</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">'
    + '<p>' + message + '</p><p>' + retry + '<a href="/">Về trang chủ</a></p></body></html>'
  return new Response(html, { status: status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function quotaWarning(error) {
  if (!error || error.name !== 'QuotaExceededError') return
  try {
    var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    windows.forEach(function (client) { if (client.postMessage) client.postMessage({ type: 'erpcons-quota' }) })
  } catch (ignored) { /* Reporting a cache failure must not break an online response. */ }
}

async function networkFirst(request, requestingId) {
  var cache = await caches.open(CACHE)
  try {
    var response = await fetch(request)
    if (storable(response)) {
      try {
        await cache.put(request, response.clone())
        var pathname = new URL(request.url).pathname
        if (pathname.slice(-1) === '/') await prune(cache, pathname, requestingId)
      } catch (error) {
        console.warn('Offline cache update failed', error)
        await quotaWarning(error)
      }
    }
    return response
  } catch (error) {
    var hit = await cache.match(request, { ignoreSearch: true })
    if (hit) return hit
    // Without this the browser shows its own English offline page, which says nothing about why.
    if (request.mode === 'navigate') {
      var url = new URL(request.url)
      return messagePage(503, OFFLINE_MESSAGE, url.pathname + url.search)
    }
    throw error
  }
}

async function cacheFirst(request) {
  var cache = await caches.open(CACHE)
  var hit = await cache.match(request)
  if (hit) return hit
  var response = await fetch(request)
  if (storable(response)) {
    try {
      await cache.put(request, response.clone())
    } catch (error) {
      console.warn('Offline cache update failed', error)
      await quotaWarning(error)
    }
  }
  return response
}

function warmableUrls(urls, origin) {
  if (!Array.isArray(urls)) return []
  var seen = []
  urls.forEach(function (raw) {
    if (typeof raw !== 'string') return
    var url
    try { url = new URL(raw) } catch (error) { return }
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin || url.pathname === '/sw.js' || url.pathname.indexOf(SIGN_IN_PREFIX) === 0) return
    url.hash = ''
    if (seen.indexOf(url.href) === -1) seen.push(url.href)
  })
  return seen
}

// The first visit loads everything before this worker controls the page, so nothing would be
// cached for going offline; the page sends what it loaded and the worker stores it here.
async function warm(urls) {
  var cache = await caches.open(CACHE)
  await Promise.all(urls.map(async function (url) {
    if (await cache.match(url)) return
    try {
      var response = await fetch(url)
      if (storable(response)) await cache.put(url, response.clone())
    } catch (error) { await quotaWarning(error) }
  }))
}

self.addEventListener('message', function (event) {
  var data = event.data
  if (data && data.type === 'erpcons-apply-update') { event.waitUntil(self.skipWaiting()); return }
  if (!data || data.type !== 'erpcons-warm') return
  event.waitUntil(warm(warmableUrls(data.urls, self.location.origin)))
})

// Deleting the previous build's cache would take every editor the user opened before offline;
// copy it over instead (newer entries win) and let prune() retire old files page by page.
async function carryOver(oldName) {
  var from = await caches.open(oldName)
  var to = await caches.open(CACHE)
  var keys = await from.keys()
  for (var i = 0; i < keys.length; i++) {
    if (await to.match(keys[i])) continue
    var hit = await from.match(keys[i])
    if (hit) await to.put(keys[i], hit)
  }
  await caches.delete(oldName)
}

// Android "Share" to the installed app (manifest share_target). Same handoff as the landing page's Open
// button (src/lib/files/pending-file.ts): queue the file on the device, then open its editor with ?open=<id>.
var SHARE_PATH = '/share-target/'
var SHARE_EDITORS = { docx: 'van-ban', xlsx: 'bang-tinh', pptx: 'trinh-chieu', pdf: 'pdf' }
var SHARE_MAX_BYTES = 100 * 1024 * 1024

function sharedEditor(file) {
  return SHARE_EDITORS[String(file.name).split('.').pop().toLowerCase()]
}

function queueShared(file, editor) {
  var id = self.crypto.randomUUID()
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open('erpcons-file-transfer-v1', 1)
    request.onupgradeneeded = function () { request.result.createObjectStore('pending', { keyPath: 'id' }) }
    request.onerror = function () { reject(request.error) }
    request.onsuccess = function () {
      var db = request.result
      var transaction = db.transaction('pending', 'readwrite')
      transaction.objectStore('pending').put({ id: id, name: file.name, file: file, editor: editor, expiresAt: Date.now() + 60 * 60 * 1000 })
      transaction.oncomplete = function () { db.close(); resolve(id) }
      transaction.onabort = function () { db.close(); reject(transaction.error) }
    }
  })
}

async function receiveShare(request) {
  // The OS share sheet sends no referrer; a cross-site form posting here could push its file into the editor.
  if (request.referrer && new URL(request.referrer).origin !== self.location.origin) {
    return messagePage(403, 'Chỉ nhận tệp được chia sẻ từ thiết bị của bạn.')
  }
  var form
  try { form = await request.formData() } catch (error) { return messagePage(400, 'Không đọc được tệp được chia sẻ.') }
  var file = form.getAll('file').filter(function (f) { return f && typeof f.name === 'string' && sharedEditor(f) })[0]
  if (!file) return messagePage(415, 'Văn phòng mở được tệp DOCX, XLSX, PPTX hoặc PDF. Tệp được chia sẻ không thuộc các loại này.')
  if (!file.size) return messagePage(422, 'Tệp được chia sẻ đang trống.')
  if (file.size > SHARE_MAX_BYTES) return messagePage(413, 'Tệp vượt quá 100 MB. Hãy mở trực tiếp từ menu Tệp của công cụ.')
  var editor = sharedEditor(file)
  try {
    var id = await queueShared(file, editor)
    return Response.redirect(self.location.origin + '/' + editor + '/?open=' + encodeURIComponent(id), 303)
  } catch (error) {
    return messagePage(507, 'Không lưu tạm được tệp trên thiết bị. Kiểm tra bộ nhớ hoặc quyền lưu trữ của trình duyệt.')
  }
}

self.addEventListener('install', function () {})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('erpcons-office-') === 0 && k !== CACHE }).map(function (name) { return carryOver(name).catch(quotaWarning) })) })
      .then(function () { return self.clients.claim() }),
  )
})

self.addEventListener('fetch', function (event) {
  if (event.request.method === 'POST' && new URL(event.request.url).pathname === SHARE_PATH) {
    event.respondWith(receiveShare(event.request))
    return
  }
  // Authenticated responses are per user and `no-store`; never cache them, whatever origin the API ends up on.
  if (event.request.headers && event.request.headers.has('Authorization')) return
  var strategy = classify(new URL(event.request.url), event.request.method, event.request.mode, self.location.origin)
  if (strategy === 'bypass') return
  // A navigation's own window only exists as resultingClientId; clientId is the tab that started it.
  var requestingId = event.resultingClientId || event.clientId
  event.respondWith(strategy === 'network-first' ? networkFirst(event.request, requestingId) : cacheFirst(event.request))
})
