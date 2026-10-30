import type { DocumentItem, GrantRole, Role } from './types.ts'

/** Google Docs' Vietnamese names (plan §8). */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  owner: 'Chủ sở hữu',
  editor: 'Người chỉnh sửa',
  commenter: 'Người nhận xét',
  viewer: 'Người xem',
  link: 'Người xem qua đường liên kết',
}

/** Order of the role picker, narrowest first, as Google Docs lists them. */
export const GRANT_ROLE_OPTIONS: readonly { role: GrantRole; label: string }[] = [
  { role: 'viewer', label: ROLE_LABELS.viewer },
  { role: 'commenter', label: ROLE_LABELS.commenter },
  { role: 'editor', label: ROLE_LABELS.editor },
]

/** Plan §3: content changes, restores and the version history are for the owner and editors. */
export const canEdit = (doc: Pick<DocumentItem, 'role'>) => doc.role === 'owner' || doc.role === 'editor'
/** Only the owner moves, trashes and purges. */
export const isOwner = (doc: Pick<DocumentItem, 'role'>) => doc.role === 'owner'
