import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { REPO_ROOT } from '../src/lib/build/workspace.ts'
import { API_PROXY_ENV, apiProxyBase, backwardHeaders, forwardHeaders, upstreamUrl } from '../src/lib/preview/api-proxy.ts'
import { cacheControlFor, contentTypeFor, pickEncoding, resolveRequest } from '../src/lib/preview/static-server.ts'

const root = path.join(REPO_ROOT, 'out')
const port = Number(process.env.PORT ?? 3011)
const apiBase = apiProxyBase(process.env[API_PROXY_ENV])
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('out/ is empty — run npm run build:site first')

const isDirectory = (rel: string) => fs.statSync(path.join(root, rel), { throwIfNoEntry: false })?.isDirectory() ?? false

function proxy(req: http.IncomingMessage, res: http.ServerResponse, target: URL, base: URL) {
  const client = target.protocol === 'https:' ? https : http
  const upstream = client.request(target, { method: req.method, headers: forwardHeaders(req.headers, base, req.headers.host) }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, backwardHeaders(answer.headers))
    answer.pipe(res)
  })
  // Like Apache with the backend down: the shell treats a 502 as retryable.
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad Gateway') })
  req.pipe(upstream)
}

http.createServer((req, res) => {
  const target = apiBase && upstreamUrl(apiBase, req.url ?? '/')
  if (apiBase && target) { proxy(req, res, target, apiBase); return }
  const resolved = resolveRequest(req.url ?? '/', isDirectory)
  if (resolved.kind === 'forbidden') { res.writeHead(403).end('Forbidden'); return }
  if (resolved.kind === 'redirect') { res.writeHead(301, { Location: resolved.location }).end(); return }

  const file = path.join(root, resolved.rel)
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    const notFound = path.join(root, '404.html')
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found')
    return
  }
  const encoding = pickEncoding(req.headers['accept-encoding'], { br: fs.existsSync(file + '.br'), gzip: fs.existsSync(file + '.gz') })
  const body = encoding === 'br' ? file + '.br' : encoding === 'gzip' ? file + '.gz' : file
  res.writeHead(200, {
    'Content-Type': contentTypeFor(resolved.rel),
    'Cache-Control': cacheControlFor(resolved.rel),
    'Vary': 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
    'Content-Length': fs.statSync(body).size,
  })
  if (req.method === 'HEAD') { res.end(); return }
  fs.createReadStream(body).pipe(res)
}).listen(port, () => console.log(`ERPCons Văn phòng preview: http://localhost:${port}/${apiBase ? ` (/api/ → ${apiBase.origin})` : ''}`))
