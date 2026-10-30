'use client'

import { useSyncExternalStore } from 'react'
import type { AccountSnapshot, ErpAccount } from '@/lib/account/types.ts'

type AccountWindow = Window & { erpAccount?: ErpAccount }

export const piAccount = (): ErpAccount | undefined => (window as AccountWindow).erpAccount
const subscribe = (onChange: () => void) => piAccount()?.onChange(onChange) ?? (() => {})
const read = () => piAccount()?.snapshot() ?? null

/** The account.js snapshot, or `null` before hydration and when account.js is absent (PI sign-in off). */
export function usePiAccount(): AccountSnapshot | null {
  return useSyncExternalStore(subscribe, read, () => null)
}
