'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { DocIconName } from './icon-names.ts'

export type DocIcons = Readonly<Record<DocIconName, ReactNode>>

const IconsContext = createContext<DocIcons | null>(null)

export function IconsProvider({ icons, children }: { icons: DocIcons; children: ReactNode }) {
  return <IconsContext.Provider value={icons}>{children}</IconsContext.Provider>
}

export function useIcon(name: DocIconName): ReactNode {
  const icons = useContext(IconsContext)
  if (!icons) throw new Error('useIcon outside IconsProvider')
  return icons[name]
}
