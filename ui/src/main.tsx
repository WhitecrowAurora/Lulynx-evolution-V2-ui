// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import './theme/tokens.css'
import './theme/base.css'
import './theme/components.css'
import './theme/themes/stitch-light.css'
import './theme/themes/stitch-dark.css'
import './theme/tw.css'
import './app/app.css'
import { initTheme } from './stores/themeStore'
import { AppShell } from './app/AppShell'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
)
