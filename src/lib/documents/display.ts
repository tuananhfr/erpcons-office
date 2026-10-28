const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const
const DAY_MS = 24 * 60 * 60 * 1000
/** Trash retention of the server (openapi.yaml, `/trash`). */
export const TRASH_DAYS = 30

export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value)} ${UNITS[unit]}`
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "Hôm nay, 14:05", "Hôm qua, 09:30" or "12/10/2026". */
export function formatUpdated(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date)
  if (sameDay(date, now)) return `Hôm nay, ${time}`
  if (sameDay(date, new Date(now.getTime() - DAY_MS))) return `Hôm qua, ${time}`
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

/** Whole days left before the purge job deletes a trashed item; 0 once it is due. */
export function trashDaysLeft(trashedAt: string | null, now: number = Date.now()): number | null {
  if (!trashedAt) return null
  const at = new Date(trashedAt).getTime()
  if (Number.isNaN(at)) return null
  return Math.max(0, Math.ceil((at + TRASH_DAYS * DAY_MS - now) / DAY_MS))
}

export function trashNote(daysLeft: number | null): string {
  if (daysLeft === null) return ''
  return daysLeft === 0 ? 'Sắp bị xoá hẳn' : `Tự xoá hẳn sau ${daysLeft} ngày`
}
