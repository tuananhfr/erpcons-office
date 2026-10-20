import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EDITORS, editorPath } from '../../config/editors.ts'
import { webManifest } from './web-manifest.ts'

describe('webManifest', () => {
  const manifest = webManifest()

  it('has what Chrome needs to offer installation', () => {
    expect(manifest.name).toBe('Văn phòng by ERPCons')
    expect(manifest.short_name).toBe('Văn phòng')
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    const sizes = (manifest.icons ?? []).filter((i) => i.purpose !== 'maskable').map((i) => i.sizes)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  })

  it('ships a maskable icon so Android shapes do not crop the round logo', () => {
    expect(manifest.icons).toContainEqual({ src: '/brand/van-phong-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' })
  })

  it('keeps the whole site in one app scope', () => {
    expect(manifest.id).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('registers each editor as an "Open with" handler for its own file type', () => {
    expect(manifest.file_handlers).toMatchObject([
      { action: '/van-ban/', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } },
      { action: '/bang-tinh/', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } },
      { action: '/trinh-chieu/', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] } },
      { action: '/pdf/', accept: { 'application/pdf': ['.pdf'] } },
    ])
  })

  it('provides a distinct local PNG icon for each file handler', () => {
    const expected = [
      { action: '/van-ban/', file: 'van-ban-256.png' },
      { action: '/bang-tinh/', file: 'bang-tinh-256.png' },
      { action: '/trinh-chieu/', file: 'trinh-chieu-256.png' },
      { action: '/pdf/', file: 'pdf-256.png' },
    ]
    const handlers = manifest.file_handlers as { action: string; icons?: { src: string; sizes: string; type: string }[] }[]
    expect(handlers).toHaveLength(4)
    const imageBytes = expected.map(({ action, file }) => {
      expect(handlers.find(handler => handler.action === action)?.icons).toEqual([
        { src: `/brand/office/${file}`, sizes: '256x256', type: 'image/png' },
      ])
      const bytes = fs.readFileSync(fileURLToPath(new URL(`../../../public/brand/office/${file}`, import.meta.url)))
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      expect(bytes.readUInt32BE(16)).toBe(256)
      expect(bytes.readUInt32BE(20)).toBe(256)
      return bytes.toString('base64')
    })
    expect(new Set(imageBytes).size).toBe(4)
  })
  it('offers a shortcut to every editor', () => {
    expect(manifest.shortcuts?.map((s) => [s.name, s.url])).toEqual(EDITORS.map((e) => [e.name, editorPath(e.slug)]))
  })
})
