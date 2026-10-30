import { pageQuery } from './api.ts'
import { GET, createCaller, segment, send } from './http.ts'
import { problem } from './problem.ts'
import { inviteResultOf, linkTokenOf, permissionOf, settingsOf, sharedPageOf, sharingOf } from './parse.ts'
import type { ApiFetch, GrantRole, InviteResult, Result, ShareSettings } from './types.ts'

const NEW_PEOPLE_LIMIT = 'Bạn đã thêm quá nhiều người mới hôm nay. Hãy thử lại sau.'
// addPermissions answers the bound of 200 new addresses per 24 h with this Retry-After; other 429s are shorter.
const NEW_PEOPLE_RETRY_AFTER = 3600

/** Sharing calls (openapi.yaml, tag `sharing`): permissions by email, the gear's settings, the link, "Shared with me". */
export function createSharingApi(apiFetch: ApiFetch) {
  const call = createCaller(apiFetch)
  const none = () => true as const
  const doc = (id: string, rest: string) => `/documents/${segment(id)}${rest}`

  const sharing = (id: string) => call(doc(id, '/permissions'), GET, sharingOf)
  const remove = (id: string, permissionId: string) => call(doc(id, `/permissions/${segment(permissionId)}`), { method: 'DELETE' }, none)

  return {
    sharing,
    /** `message` goes into the email only with `notify`. */
    invite: async (id: string, emails: string[], role: GrantRole, notify: boolean, message: string | null): Promise<Result<InviteResult>> => {
      // A 503 here means an invitee's sign-in raced the request and nothing was kept: one more try is safe.
      let racedTwice = false
      const retryRace: ApiFetch = async (path, init) => {
        const first = await apiFetch(path, init)
        if (first.status !== 503) return first
        const second = await apiFetch(path, init)
        racedTwice = second.status === 503
        return second
      }
      const result = await createCaller(retryRace)(doc(id, '/permissions'), send('POST', { emails, role, notify, message: notify ? message : null }), inviteResultOf)
      if (result.ok) return result
      if (racedTwice) return { ok: false, problem: problem('failed', null, true) }
      const { kind, retryAfter } = result.problem
      if (kind === 'busy' && retryAfter !== null && retryAfter >= NEW_PEOPLE_RETRY_AFTER) return { ok: false, problem: { ...result.problem, message: NEW_PEOPLE_LIMIT } }
      return result
    },
    changeRole: (id: string, permissionId: string, role: GrantRole) =>
      call(doc(id, `/permissions/${segment(permissionId)}`), send('PATCH', { role }), permissionOf),
    /** `null` removes the expiry. */
    changeExpiry: (id: string, permissionId: string, expiresAt: string | null) =>
      call(doc(id, `/permissions/${segment(permissionId)}`), send('PATCH', { expires_at: expiresAt }), permissionOf),
    remove,
    /** "Gỡ khỏi danh sách của tôi": removes the caller's own permission (commenters and viewers see only theirs). */
    leave: async (id: string, actorId: string): Promise<Result<true>> => {
      const current = await sharing(id)
      if (!current.ok) return current
      const mine = current.value.permissions.find((p) => p.actorId === actorId)
      return mine ? remove(id, mine.id) : { ok: false, problem: problem('notFound') }
    },
    saveSettings: (id: string, settings: ShareSettings) =>
      call(doc(id, '/share-settings'), send('PUT', { editors_can_share: settings.editorsCanShare, viewers_can_download: settings.viewersCanDownload }), settingsOf),
    /** Turns the link on; while it is on, the same token comes back. */
    enableLink: (id: string) => call(doc(id, '/link'), send('PUT', {}), linkTokenOf),
    disableLink: (id: string) => call(doc(id, '/link'), { method: 'DELETE' }, none),
    shared: (cursor: string | null = null) => call(`/shared${pageQuery(cursor)}`, GET, sharedPageOf),
    markSeen: (id: string) => call(`/shared/${segment(id)}/seen`, { method: 'POST', headers: { Accept: 'application/json' } }, none),
  }
}

export type SharingApi = ReturnType<typeof createSharingApi>
