// A WebSocket the live channel (online-live.js) can open in node: the test plays the server, accepting, sending
// messages and closing with the codes of docs/openapi.yaml ("Live channel").
export interface FakeSocket {
  url: string
  readyState: number
  /** Messages the client sent, parsed. */
  sent: Record<string, unknown>[]
  /** The code of the client's own close(), if it closed. */
  closedWith: number | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: ((event: unknown) => void) | null
  send(text: string): void
  close(code?: number): void
  /** The server's side. */
  accept(): void
  receive(message: Record<string, unknown>): void
  drop(code: number): void
}

/** A WebSocket constructor whose instances land in `sockets`, newest last. */
export function fakeWebSocket() {
  const sockets: FakeSocket[] = []
  function FakeWebSocket(this: FakeSocket, url: string) {
    this.url = url
    this.readyState = 0
    this.sent = []
    this.closedWith = null
    this.onmessage = this.onclose = this.onerror = null
    sockets.push(this)
  }
  FakeWebSocket.prototype.send = function (this: FakeSocket, text: string) {
    if (this.readyState !== 1) throw new Error('not open')
    this.sent.push(JSON.parse(text))
  }
  FakeWebSocket.prototype.close = function (this: FakeSocket, code = 1000) {
    this.closedWith = code
    this.readyState = 3
  }
  FakeWebSocket.prototype.accept = function (this: FakeSocket) { this.readyState = 1 }
  FakeWebSocket.prototype.receive = function (this: FakeSocket, message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  FakeWebSocket.prototype.drop = function (this: FakeSocket, code: number) {
    this.readyState = 3
    this.onclose?.({ code })
  }
  return { WebSocket: FakeWebSocket as unknown as new (url: string) => FakeSocket, sockets }
}
