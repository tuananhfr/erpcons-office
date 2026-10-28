'use client'

import { useCallback, useRef, useState } from 'react'
import { createIdempotency } from '@/lib/documents/idempotency.ts'
import type { Problem, Result } from '@/lib/documents/types.ts'

/**
 * Runs one dialog's request: busy flag, the last problem, and an Idempotency-Key that survives a retry of the same
 * body (dropped after any definite answer, see idempotency.ts).
 */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const idempotency = useRef(createIdempotency())

  const run = useCallback(async <T,>(body: unknown, send: (key: string) => Promise<Result<T>>): Promise<T | null> => {
    setBusy(true)
    setProblem(null)
    const result = await send(idempotency.current.keyFor(body))
    setBusy(false)
    if (result.ok || !result.problem.retryable) idempotency.current.reset()
    if (result.ok) return result.value
    setProblem(result.problem)
    return null
  }, [])

  return { busy, problem, setProblem, run }
}
