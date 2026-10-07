// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect } from 'react'
import { hydrateRunHistoryFromDisk } from '@/stores/historyStore'
import { hydrateRuntimeCapabilities } from '@/stores/runtimeStore'
import { Topbar } from './Topbar'
import { PageHost } from './PageHost'
import { ToastHost } from '@/components/overlay'
import { useRouteStore } from '@/stores/routeStore'
import { subscribeLauncherTheme } from '@/stores/themeStore'

export function AppShell() {
  const syncFromHash = useRouteStore((s) => s.syncFromHash)

  useEffect(subscribeLauncherTheme, [])

  useEffect(() => {
    const onHash = () => syncFromHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [syncFromHash])

  // 启动时 hydrate 运行历史(磁盘 → LS merge)
  useEffect(() => {
    void hydrateRunHistoryFromDisk()
  }, [])

  // 启动时拉一次运行时能力(当前运行时 + 实测可用注意力后端 + 显卡表)
  useEffect(() => {
    void hydrateRuntimeCapabilities()
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
