import http from 'node:http'
import https from 'node:https'
import type { Duplex } from 'node:stream'
import { forwardHeaders } from './api-proxy.ts'

/**
 * Local preview only: a WebSocket handshake under `/api/` (the live room) goes to the upstream like any API request,
 * as Apache's `upgrade=websocket` does in production; a refusal (401, 404, 422) reaches the browser as the status.
 */
export function proxyUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer, target: URL, base: URL): void {
  const headers = forwardHeaders(req.headers, base, req.headers.host)
  headers.connection = 'Upgrade'
  headers.upgrade = req.headers.upgrade ?? 'websocket'
  const client = target.protocol === 'https:' ? https : http
  const upstream = client.request(target, { method: req.method, headers })
  upstream.on('upgrade', (answer, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${answer.statusCode ?? 101} ${answer.statusMessage ?? 'Switching Protocols'}`]
    for (let i = 0; i < answer.rawHeaders.length; i += 2) lines.push(`${answer.rawHeaders[i]}: ${answer.rawHeaders[i + 1]}`)
    socket.write(lines.join('\r\n') + '\r\n\r\n')
    if (upHead.length) socket.write(upHead)
    if (head.length) upSocket.write(head)
    upSocket.on('error', () => socket.destroy())
    socket.on('error', () => upSocket.destroy())
    upSocket.pipe(socket).pipe(upSocket)
  })
  upstream.on('response', (answer) => {
    answer.resume()
    socket.end(`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage ?? ''}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  })
  upstream.on('error', () => { socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n') })
  socket.on('error', () => upstream.destroy())
  upstream.end()
}
