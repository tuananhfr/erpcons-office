'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentsApi } from '@/lib/documents/api.ts'
import { randomKey } from '@/lib/documents/idempotency.ts'
import type { DocumentItem, Quota } from '@/lib/documents/types.ts'
import { MAX_UPLOAD_FILES, TOO_MANY, checkUpload, readHead } from '@/lib/documents/upload-check.ts'

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'refused' | 'failed'

export interface Upload {
  id: string
  name: string
  status: UploadStatus
  message: string | null
  retryable: boolean
  file: File
  folderId: string | null
  /** Kept across retries of this file, so a lost answer never creates it twice. */
  key: string
}

/**
 * Uploads one file at a time, each checked first (upload-check.ts). `onStored` runs after every file the server
 * stored, so the list and the quota follow along.
 */
export function useUploads(api: DocumentsApi, quota: Quota | null, onStored: (doc: DocumentItem) => void) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const running = useRef(false)
  const latest = useRef({ api, quota, onStored })
  useEffect(() => { latest.current = { api, quota, onStored } })

  const patch = useCallback((id: string, change: Partial<Upload>) => {
    setUploads((list) => list.map((upload) => (upload.id === id ? { ...upload, ...change } : upload)))
  }, [])

  const send = useCallback(async (upload: Upload) => {
    const { api: client, quota: known } = latest.current
    patch(upload.id, { status: 'uploading', message: null })
    let refusal: { message: string } | null
    try {
      refusal = checkUpload(upload.name, upload.file.size, await readHead(upload.file), known)
    } catch {
      refusal = { message: 'Không đọc được tệp đã chọn. Hãy chọn lại tệp.' }
    }
    if (refusal) return patch(upload.id, { status: 'refused', message: refusal.message, retryable: false })
    const result = await client.upload(upload.file, upload.folderId, upload.key)
    if (result.ok) {
      patch(upload.id, { status: 'done', message: null })
      latest.current.onStored(result.value)
    } else {
      patch(upload.id, { status: 'failed', message: result.problem.message, retryable: result.problem.retryable })
    }
  }, [patch])

  // Serial on purpose: the quota check of the next file needs the answer for this one.
  const queue = useRef<Upload[]>([])
  const drain = useCallback(async (more: Upload[]) => {
    queue.current.push(...more)
    if (running.current) return
    running.current = true
    try {
      for (let next = queue.current.shift(); next; next = queue.current.shift()) await send(next)
    } finally {
      running.current = false
    }
  }, [send])

  const add = useCallback((files: File[], folderId: string | null) => {
    const accepted = files.slice(0, MAX_UPLOAD_FILES).map((file): Upload => ({
      id: randomKey(), name: file.name, status: 'waiting', message: null, retryable: false, file, folderId, key: randomKey(),
    }))
    const extra = files.slice(MAX_UPLOAD_FILES).map((file): Upload => ({
      id: randomKey(), name: file.name, status: 'refused', message: TOO_MANY, retryable: false, file, folderId, key: '',
    }))
    setUploads((list) => [...list.filter((upload) => upload.status === 'waiting' || upload.status === 'uploading'), ...accepted, ...extra])
    void drain(accepted)
  }, [drain])

  const retry = useCallback((id: string) => {
    const upload = uploads.find((entry) => entry.id === id)
    if (upload) void drain([upload])
  }, [uploads, drain])

  const clear = useCallback(() => setUploads((list) => list.filter((upload) => upload.status === 'waiting' || upload.status === 'uploading')), [])

  return { uploads, add, retry, clear }
}
