// Regenerate every web identity icon from the owner-supplied Office marks.
// usage: node scripts/make-pwa-icons.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const brand = path.join(root, 'public/brand')
const office = path.join(brand, 'office')
const logo = path.join(office, 'office-mark.png')

async function icon(source, size, inset = 0.88) {
  const inner = Math.round(size * inset)
  return sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: await sharp(source).resize(inner, inner).png().toBuffer(), gravity: 'center' }])
    .png({ compressionLevel: 9 }).toBuffer()
}
async function write(bytes, ...files) {
  for (const file of files) await fs.writeFile(path.join(brand, file), bytes)
}
for (const size of [16, 32, 192, 512]) {
  await write(await icon(logo, size), `office/office-icon-${size}.png`, `van-phong-icon-${size}.png`)
}
await write(await icon(logo, 192), 'icon-192.png')
await write(await icon(logo, 512), 'icon-512.png')
await write(await icon(logo, 180), 'office/office-apple-180.png', 'van-phong-apple-180.png')
// The whole square fits inside Android's central 80% safe circle.
await write(await icon(logo, 512, 0.56), 'office/office-maskable-512.png', 'van-phong-maskable-512.png')
await write(await icon(logo, 64), 'office/office-logo-64.png', 'van-phong-logo-64.png')
await write(await icon(logo, 176), 'van-phong-logo-176.png')
await write(await icon(logo, 512), 'van-phong-logo.png')
for (const slug of ['van-ban', 'bang-tinh', 'trinh-chieu', 'pdf']) {
  const source = path.join(office, `${slug}-new.png`)
  await write(await icon(source, 256), `office/${slug}-office-256.png`, `office/${slug}-256.png`)
  await write(await icon(source, 512), `office/${slug}.png`)
}
// Multi-size ICO, also copied to the root fallback /favicon.ico.
const sizes = [16, 32, 48]
const frames = await Promise.all(sizes.map(size => icon(logo, size)))
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16
  header[entry] = size
  header[entry + 1] = size
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frames[index].length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frames[index].length
}
const ico = Buffer.concat([header, ...frames])
await write(ico, 'office/office-favicon.ico')
await fs.writeFile(path.join(root, 'public/favicon.ico'), ico)
console.log('Office icons, tool file-handler icons, favicon and legacy compatibility copies regenerated.')
