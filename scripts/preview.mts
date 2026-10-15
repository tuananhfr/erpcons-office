import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { REPO_ROOT } from '../src/lib/build/workspace.ts'
import { cacheControlFor, contentTypeFor, pickEncoding, resolveRequest } from '../src/lib/preview/static-server.ts'

const root = path.join(REPO_ROOT, 'out')
const port = Number(process.env.PORT ?? 3011)
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('out/ is empty — run npm run build:site first')

const isDirectory = (rel: string) => fs.statSync(path.join(root, rel), { throwIfNoEntry: false })?.isDirectory() ?? false

http.createServer((req, res) => {
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
}).listen(port, () => console.log(`ERPCons Văn phòng preview: http://localhost:${port}/`))
