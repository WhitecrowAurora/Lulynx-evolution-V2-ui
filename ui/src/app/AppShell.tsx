// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect } from 'react'
import { hydrateRunHistoryFromDisk } from '@/stores/historyStore'
import { Topbar } from './Topbar'
import { PageHost } from './PageHost'
import { ToastHost } from '@/components/overlay'
import { useRouteStore } from '@/stores/routeStore'

export function AppShell() {
  const syncFromHash = useRouteStore((s) => s.syncFromHash)

  useEffect(() => {
    const onHash = () => syncFromHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [syncFromHash])

  // 启动时 hydrate 运行历史(磁盘 → LS merge)
  useEffect(() => {
    void hydrateRunHistoryFromDisk()
  }, [])

  return (
    <>
      <div className="lx-fx lx-fx-blobs" aria-hidden />
      <div className="lx-fx lx-fx-noise" aria-hidden />
      <Topbar />
      <main className="lx-main">
        <PageHost />
      </main>
      <ToastHost />
    </>
  )
}
