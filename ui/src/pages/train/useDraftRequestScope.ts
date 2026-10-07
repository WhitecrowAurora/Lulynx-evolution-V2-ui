// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useRef } from 'react'
import { useTrainConfigStore } from '@/stores/configStore'

/** A result may update only the exact draft revision that requested it. */
export function useDraftRequestScope(config: Record<string, unknown>) {
  const state = useTrainConfigStore.getState()
  const typeId = state.typeId
  const draft = state.drafts[typeId]
  const scope = useRef({ config, revision: 0, mounted: true })
  if (scope.current.config !== config) {
    scope.current.config = config
    scope.current.revision += 1
  }
  useEffect(() => {
    scope.current.mounted = true
    const unsubscribe = useTrainConfigStore.subscribe((next, previous) => {
      if (next.typeId !== previous.typeId || next.drafts[next.typeId] !== previous.drafts[previous.typeId]) {
        scope.current.revision += 1
      }
    })
    return () => {
      unsubscribe()
      scope.current.mounted = false
      scope.current.revision += 1
    }
  }, [])
  return () => {
    const revision = scope.current.revision
    return () => {
      const current = useTrainConfigStore.getState()
      return scope.current.mounted && scope.current.revision === revision &&
        scope.current.config === config && current.typeId === typeId && current.drafts[typeId] === draft
    }
  }
}
