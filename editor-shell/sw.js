var CACHE = 'erpcons-office-__BUILD_ID__'
// Every URL path of this build, filled in by assemble; empty means "unknown", which disables pruning.
var MANIFEST = /*__ASSET_MANIFEST__*/[]

function classify(url, method, mode, origin) {
  if (method !== 'GET' || url.origin !== origin || url.pathname === '/sw.js') return 'bypass'
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

// Old-build files stay until their page is fetched fresh: until then they are what that cached page needs offline.
async function prune(cache, pageDir) {
  if (MANIFEST.length === 0) return
  var keys = await cache.keys()
  await Promise.all(keys.map(function (request) {
    var pathname = new URL(request.url).pathname
    if (ownedBy(pageDir, pathname) && MANIFEST.indexOf(pathname) === -1) return cache.delete(request)
  }))
}

async function networkFirst(request) {
  var cache = await caches.open(CACHE)
  try {
    var response = await fetch(request)
    if (storable(response)) {
      await cache.put(request, response.clone())
      var pathname = new URL(request.url).pathname
      if (pathname.slice(-1) === '/') await prune(cache, pathname)
    }
    return response
  } catch (error) {
    var hit = await cache.match(request, { ignoreSearch: true })
    if (hit) return hit
    throw error
  }
}

async function cacheFirst(request) {
  var cache = await caches.open(CACHE)
  var hit = await cache.match(request)
  if (hit) return hit
  var response = await fetch(request)
  if (storable(response)) await cache.put(request, response.clone())
  return response
}

function warmableUrls(urls, origin) {
  if (!Array.isArray(urls)) return []
  var seen = []
  urls.forEach(function (raw) {
    if (typeof raw !== 'string') return
    var url
    try { url = new URL(raw) } catch (error) { return }
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin || url.pathname === '/sw.js') return
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
    } catch (error) { /* stays uncached; the next online visit fills it */ }
  }))
}

self.addEventListener('message', function (event) {
  var data = event.data
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

self.addEventListener('install', function () { self.skipWaiting() })

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('erpcons-office-') === 0 && k !== CACHE }).map(carryOver)) })
      .then(function () { return self.clients.claim() }),
  )
})

self.addEventListener('fetch', function (event) {
  var strategy = classify(new URL(event.request.url), event.request.method, event.request.mode, self.location.origin)
  if (strategy === 'bypass') return
  event.respondWith(strategy === 'network-first' ? networkFirst(event.request) : cacheFirst(event.request))
})
