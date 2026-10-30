'use client'

import { useSyncExternalStore } from 'react'
import type { AccountSnapshot, ErpAccount } from '@/lib/account/types.ts'

type AccountWindow = Window & { erpAccount?: ErpAccount }

export const account = (): ErpAccount | undefined => (window as AccountWindow).erpAccount
const subscribe = (onChange: () => void) => account()?.onChange(onChange) ?? (() => {})
// Without account.js on the page (it ships with PI sign-in) the page behaves as with sign-in off.
const MISSING: AccountSnapshot = Object.freeze({
  version: 1, status: 'disabled', user: null, orgs: [], activeOrg: null, product: null,
  entitlements: [], entitlementsFresh: false, error: null,
})
const read = () => account()?.snapshot() ?? MISSING

/** The account.js snapshot; `null` only before hydration, so the static HTML shows the loading state. */
export function useAccount(): AccountSnapshot | null {
  return useSyncExternalStore(subscribe, read, () => null)
}
