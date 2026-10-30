'use client'

import { useCallback } from 'react'
import type { DocumentsApi } from '@/lib/documents/api.ts'
import type { Problem } from '@/lib/documents/types.ts'
import type { MoveTarget } from './MoveDialog.tsx'
import type { ToastMessage } from './Toast.tsx'

const sentence = (problem: Problem) => (problem.kind === 'notFound' ? `${problem.message}.` : problem.message)

/**
 * Trash and restore. Both are reversible, so they run at once and answer in a toast; a trash offers "Hoàn tác"
 * instead of asking for confirmation first.
 */
export function useItemActions(api: DocumentsApi, refresh: () => void, show: (toast: ToastMessage) => void) {
  const restore = useCallback(async (target: MoveTarget) => {
    const result = target.kind === 'folder' ? await api.restoreFolder(target.id) : await api.restoreDocument(target.id)
    refresh()
    if (result.ok) return show({ tone: 'done', text: `Đã khôi phục “${target.name}”.` })
    // The only 409 of a restore: a folder of the same name now sits where this one would return.
    const text = result.problem.kind === 'nameTaken'
      ? `Chưa khôi phục được “${target.name}”: nơi khôi phục đã có thư mục trùng tên. Hãy đổi tên thư mục kia rồi thử lại.`
      : sentence(result.problem)
    show({ tone: 'error', text })
  }, [api, refresh, show])

  const trash = useCallback(async (target: MoveTarget) => {
    const result = target.kind === 'folder' ? await api.trashFolder(target.id) : await api.trashDocument(target.id)
    refresh()
    if (!result.ok) return show({ tone: 'error', text: sentence(result.problem) })
    show({
      tone: 'done',
      text: target.kind === 'folder' ? `Đã chuyển thư mục “${target.name}” và mọi thứ bên trong vào thùng rác.` : `Đã chuyển “${target.name}” vào thùng rác.`,
      action: { label: 'Hoàn tác', run: () => { void restore(target) } },
    })
  }, [api, refresh, show, restore])

  return { trash, restore }
}
