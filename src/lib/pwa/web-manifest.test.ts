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
    expect(manifest.file_handlers).toEqual([
      { action: '/van-ban/', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } },
      { action: '/bang-tinh/', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } },
      { action: '/trinh-chieu/', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] } },
      { action: '/pdf/', accept: { 'application/pdf': ['.pdf'] } },
    ])
  })

  it('offers a shortcut to every editor', () => {
    expect(manifest.shortcuts?.map((s) => [s.name, s.url])).toEqual(EDITORS.map((e) => [e.name, editorPath(e.slug)]))
  })
})
