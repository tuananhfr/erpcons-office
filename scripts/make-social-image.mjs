// Renders public/brand/van-phong-social.png (1200×630 og:image) with headless Chrome.
// usage: node scripts/make-social-image.mjs   (CHROME=<path> to override the browser)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const logo = pathToFileURL(path.join(root, 'public/brand/van-phong-logo.png')).href
const target = path.join(root, 'public/brand/van-phong-social.png')

const CHROME_CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p))
if (!chrome) throw new Error('Chrome not found; set CHROME=<path to chrome>')

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=block&subset=vietnamese">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { display: flex; align-items: center; gap: 96px; padding: 0 0 0 114px; box-sizing: border-box;
    background: linear-gradient(135deg, #fff 45%, #edf5fc); font-family: Inter, sans-serif; color: #082674; }
  img { width: 270px; height: 270px; flex: none; }
  .label { margin: 0 0 18px; font-size: 14px; font-weight: 600; letter-spacing: .18em; }
  h1 { margin: 0 0 26px; font-size: 64px; line-height: 1.12; font-weight: 800; letter-spacing: -.05em; }
  h1 span { color: #0960ea; }
  .apps { margin: 0 0 16px; font-size: 21px; color: #4c5e7d; }
  .note { margin: 0 0 44px; font-size: 17px; color: #4c5e7d; }
  .url { display: flex; align-items: center; gap: 18px; margin: 0; font-size: 18px; font-weight: 600; }
  .url::before { content: ''; width: 52px; height: 3px; background: #e81927; }
</style></head><body>
  <img src="${logo}" alt="">
  <div>
    <p class="label">VĂN PHÒNG BY ERPCONS</p>
    <h1>Mở tệp là<br><span>làm việc.</span></h1>
    <p class="apps">Văn bản · Bảng tính · Trình chiếu · PDF</p>
    <p class="note">Miễn phí. Không cần tài khoản.</p>
    <p class="url">office.erpcons.ai</p>
  </div>
</body></html>`

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-social-'))
try {
  const page = path.join(dir, 'social.html')
  fs.writeFileSync(page, html)
  // The budget lets the web font finish before the shot; without it Chrome may paint the fallback font.
  execFileSync(chrome, ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--window-size=1200,630', '--virtual-time-budget=8000', `--screenshot=${target}`, pathToFileURL(page).href], { stdio: 'ignore' })
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
console.log(`wrote ${path.relative(root, target)}`)
