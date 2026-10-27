import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EDITORS, editorPath } from '../../config/editors.ts'
import { MIME_BY_EXTENSION } from '../files/mime-types.ts'
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

  it('registers each editor as an "Open with" handler for every format it accepts, grouped by MIME type', () => {
    const handlers = manifest.file_handlers as { action: string; accept: Record<string, string[]> }[]
    expect(handlers.map((h) => h.action)).toEqual(EDITORS.map((e) => editorPath(e.slug)))
    for (const [i, editor] of EDITORS.entries()) {
      const extensions = new Set(Object.values(handlers[i].accept).flat())
      expect([...extensions].sort()).toEqual(editor.accepts.map((ext) => `.${ext}`).sort())
      for (const [mime, exts] of Object.entries(handlers[i].accept)) {
        for (const ext of exts) expect(MIME_BY_EXTENSION[ext.slice(1)], ext).toContain(mime)
      }
    }
    expect(handlers[0].accept['application/msword']).toEqual(['.doc', '.dot'])
    expect(handlers[0].accept['application/rtf']).toEqual(['.rtf'])
    expect(handlers[0].accept['text/rtf']).toEqual(['.rtf'])
    expect(handlers[3].accept).toEqual({ 'application/pdf': ['.pdf'] })
  })

  it('never registers formats the editors refuse (legacy ppt/odp, html, images)', () => {
    const handlers = manifest.file_handlers as { accept: Record<string, string[]> }[]
    const target = (manifest as { share_target?: { params: { files: { accept: string[] }[] } } }).share_target
    const all = [...handlers.flatMap((h) => [...Object.keys(h.accept), ...Object.values(h.accept).flat()]), ...(target?.params.files[0].accept ?? [])]
    for (const banned of ['.ppt', '.odp', '.html', '.jpg', '.png', 'application/octet-stream', 'application/vnd.ms-powerpoint']) expect(all).not.toContain(banned)
    expect(all.filter((value) => value.startsWith('image/'))).toEqual([])
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
  it('accepts every editor format from the Android share sheet as one multipart "file" field, by MIME type and extension', () => {
    const target = (manifest as { share_target?: { action: string; method: string; enctype: string; params: { title?: string; text?: string; url?: string; files: { name: string; accept: string[] }[] } } }).share_target
    expect(target).toMatchObject({ action: '/share-target/', method: 'post', enctype: 'multipart/form-data' })
    expect(target?.params.files).toHaveLength(1)
    expect(target?.params.files[0].name).toBe('file')
    const accept = target?.params.files[0].accept ?? []
    expect(new Set(accept).size).toBe(accept.length)
    for (const editor of EDITORS) {
      for (const ext of editor.accepts) {
        expect(accept).toContain(`.${ext}`)
        for (const mime of MIME_BY_EXTENSION[ext]) expect(accept).toContain(mime)
      }
    }
  })

  it('takes link and text shares too, so sw.js can explain that a file is needed', () => {
    const params = (manifest as { share_target?: { params: Record<string, unknown> } }).share_target?.params
    expect(params).toMatchObject({ title: 'title', text: 'text', url: 'url' })
  })

  it('opens a share or "Open with" in a new window instead of navigating an editor away from its document', () => {
    expect((manifest as { launch_handler?: unknown }).launch_handler).toEqual({ client_mode: 'navigate-new' })
  })

  it('offers a shortcut to every editor', () => {
    expect(manifest.shortcuts?.map((s) => [s.name, s.url])).toEqual(EDITORS.map((e) => [e.name, editorPath(e.slug)]))
  })
})
