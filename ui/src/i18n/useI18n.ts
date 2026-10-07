// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useCallback } from 'react'
import { useLocaleStore } from '@/stores/localeStore'
import zh from './zh.json'
import en from './en.json'

const bundles: Record<string, Record<string, string>> = { zh, en }

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

function formatMessage(language: string, key: string, vars?: Record<string, string | number>): string {
  const bundle = bundles[language] ?? bundles.zh
  let text = bundle[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v))
  }
  return text
}

export function translate(key: string, vars?: Record<string, string | number>): string {
  return formatMessage(useLocaleStore.getState().language, key, vars)
}

export function useI18n() {
  const language = useLocaleStore((s) => s.language)
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => formatMessage(language, key, vars),
    [language],
  )
  return { t, language }
}
