import type { PiConfig } from '../../config/pi.ts'
import { SEO_ASSETS, SEO_BRAND } from '../seo/page-seo.ts'

export interface StaticPage {
  /** Path relative to `out/`. */
  file: string
  html: string
}

const STYLE = [
  ':root{color-scheme:light dark;--ink:#101820;--muted:#344454;--surface:#fff;--border:#d6e0e6;--danger:#b42318}',
  '@media (prefers-color-scheme:dark){:root{--ink:#e7eef2;--muted:#b8c4cc;--surface:#101820;--border:#344454;--danger:#ff8a80}}',
  'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--surface);color:var(--ink);font:400 16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
  'main{box-sizing:border-box;width:min(360px,100%);padding:32px 16px;text-align:center}',
  'img{border-radius:50%}',
  '[hidden]{display:none!important}',
  '.error p{color:var(--danger)}',
  'button{min-height:40px;padding:0 20px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--ink);font:600 15px/1 inherit;font-family:inherit;cursor:pointer}',
  'button:focus-visible{outline:2px solid #3678d4;outline-offset:2px}',
].join('')

function page(title: string, script: string): string {
  // `</script` cannot appear in the inline script: account.js is plain ES5 and the config escapes `<`.
  if (/<\/script/i.test(script)) throw new Error('sign-in page script contains </script')
  return [
    '<!doctype html>',
    '<html lang="vi">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // ADR 0002: the callback URL holds the one-time code; no referrer may carry it to another site.
    '<meta name="referrer" content="no-referrer">',
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${title} | ${SEO_BRAND}</title>`,
    `<link rel="icon" href="${SEO_ASSETS.icon32}" type="image/png" sizes="32x32">`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<img src="${SEO_ASSETS.logo64}" alt="" width="48" height="48">`,
    '<p data-erp-sign-in-status role="status">Đang đăng nhập…</p>',
    '<div class="error" data-erp-sign-in-error role="alert" hidden><p data-erp-sign-in-message></p><button type="button" data-erp-sign-in-close>Đóng</button></div>',
    '<noscript><p>Cần bật JavaScript để đăng nhập.</p></noscript>',
    '</main>',
    `<script>${script}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/** The popup page and the OIDC callback at the paths the contract registers (`/dang-nhap/`, `/dang-nhap/callback/`). */
export function signInPages(config: PiConfig, script: string): StaticPage[] {
  const file = (urlPath: string) => `${urlPath.replace(/^\/+/, '')}index.html`
  return [
    { file: file(config.signInPath), html: page('Đăng nhập', script) },
    { file: file(config.callbackPath), html: page('Đăng nhập', script) },
  ]
}
