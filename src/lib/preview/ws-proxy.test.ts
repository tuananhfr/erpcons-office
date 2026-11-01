import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { apiProxyBase, upstreamUrl } from './api-proxy.ts'
import { proxyUpgrade } from './ws-proxy.ts'

const servers: http.Server[] = []
afterEach(() => { for (const s of servers.splice(0)) s.close() })
const listen = (server: http.Server) => new Promise<number>((resolve) => {
  servers.push(server)
  server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
})

/** An upstream that upgrades /api/ok (echoing bytes back) and refuses anything else with 401. */
async function upstream(seen: http.IncomingHttpHeaders[]) {
  const server = http.createServer((_req, res) => res.writeHead(401).end())
  server.on('upgrade', (req, socket) => {
    seen.push(req.headers)
    if (!req.url?.startsWith('/api/ok')) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
      return
    }
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: abc\r\n\r\n')
    socket.on('data', (data) => socket.write(data))
  })
  return listen(server)
}
async function proxyTo(port: number) {
  const base = apiProxyBase(`http://127.0.0.1:${port}`)!
  const server = http.createServer((_req, res) => res.writeHead(404).end())
  server.on('upgrade', (req, socket, head) => {
    const target = upstreamUrl(base, req.url ?? '/')
    if (!target) return socket.destroy()
    proxyUpgrade(req, socket, head, target, base)
  })
  return listen(server)
}
function handshake(port: number, path: string) {
  return new Promise<{ status: number; echo?: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13' } })
    req.on('upgrade', (res, socket) => {
      socket.write('ping')
      socket.once('data', (data) => { socket.destroy(); resolve({ status: res.statusCode!, echo: data.toString(), headers: res.headers }) })
    })
    req.on('response', (res) => { res.resume(); resolve({ status: res.statusCode!, headers: res.headers }) })
    req.on('error', reject)
    req.end()
  })
}

describe('proxyUpgrade', () => {
  it('passes the handshake with its WebSocket headers and pipes both ways', async () => {
    const seen: http.IncomingHttpHeaders[] = []
    const port = await proxyTo(await upstream(seen))
    const answer = await handshake(port, '/api/ok?ticket=t')
    expect(answer.status).toBe(101)
    expect(answer.headers['sec-websocket-accept']).toBe('abc')
    expect(answer.echo).toBe('ping')
    expect(seen[0]['sec-websocket-key']).toBe('dGhlIHNhbXBsZSBub25jZQ==')
    expect(seen[0].upgrade).toBe('websocket')
  })

  it('a refused handshake reaches the browser as its status', async () => {
    const port = await proxyTo(await upstream([]))
    expect((await handshake(port, '/api/nope')).status).toBe(401)
  })
})
