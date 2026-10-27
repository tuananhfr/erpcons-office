var CACHE = 'erpcons-office-__BUILD_ID__'
// Every URL path of this build, filled in by assemble; empty means "unknown", which disables pruning.
var MANIFEST = /*__ASSET_MANIFEST__*/[]
// The intake contract and editor-shell/intake.js, filled in by assemble (self.erpIntake).
/*__INTAKE__*/

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

// `links` replaces the default "Thử lại · Về trang chủ" pair; hrefs and labels are the worker's own, never user input.
function messagePage(status, message, retryUrl, links) {
  var pairs = links || (retryUrl ? [[retryUrl, 'Thử lại']] : []).concat([['/', 'Về trang chủ']])
  var html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Văn phòng by ERPCons</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">'
    + '<p>' + message + '</p><p>' + pairs.map(function (pair) { return '<a href="' + pair[0] + '">' + pair[1] + '</a>' }).join(' · ') + '</p></body></html>'
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

var PAGE_ASSET = /(?:src|href)="(\/(?!\/)[^"?#]+\.(?:js|css|woff2|svg|png|webp|ico))"/g

function pageAssets(html, origin) {
  var urls = []
  var match
  PAGE_ASSET.lastIndex = 0
  while ((match = PAGE_ASSET.exec(html))) if (urls.indexOf(origin + match[1]) === -1) urls.push(origin + match[1])
  return urls
}

async function storeAll(cache, urls) {
  var stored = await Promise.all(urls.map(async function (url) {
    if (await cache.match(url)) return true
    try {
      var response = await fetch(url)
      if (!storable(response)) return false
      await cache.put(url, response.clone())
      return true
    } catch (error) { await quotaWarning(error); return false }
  }))
  return stored.every(Boolean)
}

// A page carried over from an older build can name chunks prune() has since dropped; it only counts with all of them.
async function batchPageComplete(cache, origin) {
  var hit = await cache.match(origin + BATCH_PAGE)
  if (!hit) return false
  var assets = pageAssets(await hit.clone().text(), origin)
  for (var i = 0; i < assets.length; i++) {
    if (MANIFEST.length && MANIFEST.indexOf(new URL(assets[i]).pathname) === -1) return false
    if (!(await cache.match(assets[i]))) return false
  }
  return true
}

// The batch page is reached only through this worker's share redirect, often offline, so no tab ever reports it:
// it is warmed with every report, together with the scripts and styles its HTML names.
async function warmBatchPage(origin) {
  var url = origin + BATCH_PAGE
  var cache = await caches.open(CACHE)
  try {
    if (await batchPageComplete(cache, origin)) return
    var response = await fetch(url)
    if (!storable(response)) return
    // Without every asset the page would hydrate to nothing offline; keep the previous copy instead.
    if (!(await storeAll(cache, pageAssets(await response.clone().text(), origin)))) return
    await cache.put(url, response)
  } catch (error) { await quotaWarning(error) }
}

self.addEventListener('message', function (event) {
  var data = event.data
  if (data && data.type === 'erpcons-apply-update') { event.waitUntil(self.skipWaiting()); return }
  if (!data || data.type !== 'erpcons-warm') return
  var origin = self.location.origin
  event.waitUntil(Promise.all([warm(warmableUrls(data.urls, origin)), warmBatchPage(origin)]))
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

// Android "Share" to the installed app (manifest share_target). Same queue as the landing's Open button
// (src/lib/files/pending-file.ts); docs/file-transfer.md describes the records and the batch page.
var SHARE_PATH = '/share-target/'
var BATCH_PAGE = '/nhan-tep/'

function isFile(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.name === 'string' && typeof value.size === 'number'
}

function sharedText(form) {
  return ['title', 'text', 'url'].some(function (key) { var value = form.get(key); return typeof value === 'string' && value.trim() !== '' })
}

function storeShared(records) {
  return self.erpIntake.openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var name = self.erpIntake.contract.store
      var transaction = db.transaction(name, 'readwrite')
      var store = transaction.objectStore(name)
      self.erpIntake.pruneExpired(store, Date.now())
      records.forEach(function (record) { store.put(record) })
      transaction.oncomplete = function () { db.close(); resolve() }
      transaction.onabort = function () { db.close(); reject(transaction.error) }
    })
  })
}

// Every file gets a record, refused ones without bytes, so the batch page can say why each one was left out.
async function intakeShared(files) {
  var intake = self.erpIntake
  var limits = intake.contract.limits
  var batchId = self.crypto.randomUUID()
  var accepted = 0
  var records = []
  for (var i = 0; i < files.length; i++) {
    var file = files[i]
    var record = intake.record({
      id: self.crypto.randomUUID(), batchId: batchId, position: i, sourceMode: 'SHARE_IN', name: file.name,
      claimedMime: typeof file.type === 'string' ? file.type : '', size: file.size, editor: intake.editorFor(file.name) || null, state: 'VALIDATING',
    })
    var reason = i >= limits.maxFiles ? 'tooMany' : await intake.validate(file)
    if (!reason && accepted + file.size > limits.maxBatchBytes) reason = 'batchTooLarge'
    if (reason) intake.fail(record, reason)
    else { accepted += file.size; record.state = 'READY'; record.file = file }
    records.push(record)
  }
  return { batchId: batchId, records: records }
}

async function receiveShare(request) {
  var intake = self.erpIntake
  // The OS share sheet sends no referrer; a cross-site form posting here could push its file into the editor.
  if (request.referrer && new URL(request.referrer).origin !== self.location.origin) {
    return messagePage(403, intake.message('crossSite'))
  }
  var form
  try { form = await request.formData() } catch (error) { return messagePage(400, intake.message('unreadableShare')) }
  var files = form.getAll('file').filter(isFile)
  // A link or text is never fetched, logged or shown back: it may be a private Zalo/Messenger URL.
  if (!files.length) {
    return sharedText(form)
      ? messagePage(200, intake.contract.linkOnly, null, [['/', 'Chọn tệp trên máy']])
      : messagePage(415, intake.message('unsupported'))
  }
  var batch = await intakeShared(files)
  try {
    await storeShared(batch.records)
  } catch (error) {
    return messagePage(507, intake.message(error && error.name === 'QuotaExceededError' ? 'quota' : 'noSpace'))
  }
  // The OS share sheet and a cross-site page that strips its referrer look the same here, so a share without a
  // same-origin referrer never opens an editor by itself: the batch page waits for the user's click.
  var trusted = Boolean(request.referrer)
  var only = batch.records.length === 1 ? batch.records[0] : null
  var target = trusted && only && only.state === 'READY'
    ? '/' + only.editor + '/?open=' + encodeURIComponent(only.id)
    : BATCH_PAGE + '?batch=' + encodeURIComponent(batch.batchId)
  return Response.redirect(self.location.origin + target, 303)
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
