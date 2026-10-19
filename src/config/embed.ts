// ERP pages allowed to embed an editor and exchange files with it (editor-shell/host-bridge.js).
// The Apache `frame-ancestors` header on office.erpcons.vn must list the same origins.
// 3001: the port teammates run a second ERP dev server on.
const DEFAULT_EMBED_HOSTS = ['https://lpc.vn', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001']

const ORIGIN = /^https?:\/\/[^/\s]+$/

export function embedHosts(env: string | undefined): string[] {
  if (!env || !env.trim()) return [...DEFAULT_EMBED_HOSTS]
  return env.split(',').map(entry => entry.trim()).filter(entry => ORIGIN.test(entry))
}
