// Deterministic 1200x630 social card, using exact Office PNG marks (no AI redraw).
// usage: node scripts/make-social-image.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const brand = path.join(root, 'public/brand')
const tools = [
  ['van-ban', 'Văn bản', 'DOCX'], ['bang-tinh', 'Bảng tính', 'XLSX'],
  ['trinh-chieu', 'Trình chiếu', 'PPTX'], ['pdf', 'PDF', 'PDF'],
]
const cards = tools.map(([, name, extension], index) => {
  const x = 790 + index % 2 * 168, y = 160 + Math.floor(index / 2) * 174
  return `<rect x="${x}" y="${y}" width="148" height="154" rx="14" fill="white" stroke="#dce7f1"/>
    <text x="${x + 74}" y="${y + 120}" text-anchor="middle" font-size="17" font-weight="700">${name}</text>
    <text x="${x + 74}" y="${y + 141}" text-anchor="middle" font-size="11" fill="#64788c">${extension}</text>`
}).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#edf5fc"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1100" cy="70" r="260" fill="#e6f0fb" opacity=".65"/>
  <g font-family="Arial, sans-serif" fill="#082b4b">
    <text x="164" y="107" font-size="52" font-weight="700" letter-spacing="-2">Offi<tspan fill="#df1724">ce</tspan></text>
    <text x="167" y="132" font-size="16">by ERPCons</text>
    <rect x="362" y="76" width="94" height="31" rx="7" fill="#e7f1fd"/>
    <text x="409" y="97" font-size="14" text-anchor="middle" font-weight="700">Miễn phí</text>
    <text x="68" y="203" font-size="13" letter-spacing="2" fill="#586b7d">BỘ CÔNG CỤ VĂN PHÒNG TRỰC TUYẾN</text>
    <text x="64" y="289" font-size="72" font-weight="700" letter-spacing="-3">Làm việc</text>
    <text x="64" y="369" font-size="66" font-weight="700" letter-spacing="-3" fill="#df1724">mọi lúc, mọi nơi.</text>
    <text x="68" y="428" font-size="21" fill="#586b7d">Văn bản · Bảng tính · Trình chiếu · PDF</text>
    <text x="68" y="463" font-size="17" fill="#586b7d">Dùng ngay trên web. Không cần tài khoản.</text>
    <path d="M68 551h42" stroke="#df1724" stroke-width="3"/>
    <text x="126" y="557" font-size="19" font-weight="700">office.erpcons.ai</text>
    ${cards}
  </g>
</svg>`
const layers = [{ input: await sharp(path.join(brand, 'office/office-mark.png')).resize(84, 84).png().toBuffer(), left: 66, top: 61 }]
for (const [index, [slug]] of tools.entries()) {
  layers.push({ input: await sharp(path.join(brand, `office/${slug}-new.png`)).resize(76, 76).png().toBuffer(), left: 826 + index % 2 * 168, top: 178 + Math.floor(index / 2) * 174 })
}
const png = await sharp(Buffer.from(svg)).composite(layers).png({ compressionLevel: 9 }).toBuffer()
// New canonical URL, plus updated legacy copies for previously shared links.
for (const name of ['office/office-social.png', 'van-phong-social.png', 'og-image.png']) await fs.writeFile(path.join(brand, name), png)
console.log('Office social card and legacy compatibility copies regenerated (1200x630).')
