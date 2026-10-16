// Derives the PWA maskable icon and the editor-bar logo from public/brand/van-phong-logo.png.
// usage: node scripts/make-pwa-icons.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const brand = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'public/brand')
const logo = path.join(brand, 'van-phong-logo.png')
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

// Android masks to any shape inside the central 80% circle; the round logo must sit inside it.
const MASKABLE = 512
const inner = Math.round(MASKABLE * 0.78)
await sharp({ create: { width: MASKABLE, height: MASKABLE, channels: 4, background: WHITE } })
  .composite([{ input: await sharp(logo).resize(inner, inner).png().toBuffer(), gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(brand, 'van-phong-maskable-512.png'))

// Shown at 28px in the editor bar; 64px covers 2x screens without shipping the 1254px original.
await sharp(logo).resize(64, 64).png({ compressionLevel: 9 }).toFile(path.join(brand, 'van-phong-logo-64.png'))

console.log('wrote van-phong-maskable-512.png, van-phong-logo-64.png')
