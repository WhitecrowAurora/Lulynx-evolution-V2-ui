// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useRef, useState } from 'react'
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { Button } from '@/components/primitives'
import { Modal } from '@/components/overlay'
import { useTrainConfigStore } from '@/stores/configStore'
import { ModelCodeTrustSession, modelCodePreviewConfig } from '@/lib/modelCodePermission'
import { buildRunConfig } from '@/schema/schemaIndex.js'

function currentScope() {
  const state = useTrainConfigStore.getState()
  return { typeId: state.typeId, config: state.drafts[state.typeId] }
}

export function useModelCodeTrust(typeId: string, config: Record<string, unknown>) {
  const session = useRef(new ModelCodeTrustSession()).current
  const [, refresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestEpoch = useRef(0)
  const previewFingerprint = useRef('')
  const scope = { typeId, config }
  const changed = () => refresh((value) => value + 1)
  const reset = () => {
    requestEpoch.current += 1
    session.reset()
    previewFingerprint.current = ''
    setBusy(false)
    setError('')
    changed()
  }

  useEffect(() => {
    reset()
    return () => { requestEpoch.current += 1; session.reset() }
  }, [typeId, config])

  async function requestConfirmation() {
    const snapshot = currentScope()
    if (snapshot.typeId !== 'aesthetic-scorer') return
    const epoch = ++requestEpoch.current
    const ticket = session.begin(snapshot)
    setBusy(true)
    setError('')
    changed()
    try {
      const payload = buildRunConfig(snapshot.config, snapshot.typeId)
      const fingerprint = JSON.stringify(modelCodePreviewConfig(payload))
      const data = unwrap<{ model_code?: { sources?: unknown } }>(
        await trainApi.modelCodeSources(payload),
      )
      if (epoch !== requestEpoch.current) return
      const current = currentScope()
      if (fingerprint !== JSON.stringify(modelCodePreviewConfig(buildRunConfig(current.config, current.typeId)))
        || !session.offer(ticket, current, data?.model_code?.sources)) {
        session.reset()
        setError('无法确认代码来源，已关闭授权。')
      } else {
        previewFingerprint.current = fingerprint
      }
    } catch (failure) {
      if (epoch === requestEpoch.current) {
        session.reset()
        setError(failure instanceof Error ? failure.message : '无法确认代码来源，已关闭授权。')
      }
    } finally {
      if (epoch === requestEpoch.current) { setBusy(false); changed() }
    }
  }

  return {
    enabled: session.enabled(scope), busy, error, sources: session.pending(scope),
    requestConfirmation, reset,
    confirm: () => { session.confirm(currentScope()); changed() },
    consume: () => {
      const current = currentScope()
      const expected = previewFingerprint.current
      const permission = session.consume(current)
      previewFingerprint.current = ''
      requestEpoch.current += 1
      setBusy(false)
      changed()
      if (permission.allow_model_code
        && expected !== JSON.stringify(modelCodePreviewConfig(buildRunConfig(current.config, current.typeId)))) {
        return { allow_model_code: false, model_code_sources: [] }
      }
      return permission
    },
  }
}

export function ModelCodeTrustControl({ trust, disabled }: {
  trust: ReturnType<typeof useModelCodeTrust>
  disabled: boolean
}) {
  return (
    <section className="lx-validation-banner lx-validation-warning" aria-label="模型代码安全">
      <div className="lx-validation-content">
        <label>
          <input type="checkbox" checked={trust.enabled} disabled={disabled || trust.busy}
            onChange={(event) => { if (event.target.checked) void trust.requestConfirmation(); else trust.reset() }} />
          {' '}允许加载模型自定义代码（高风险）
        </label>
        <p>{trust.busy ? '正在核对实际代码来源…' : '每次提交需重新确认，默认关闭。不会允许不安全 pickle 加载。'}</p>
        {trust.error && <p role="alert">{trust.error}</p>}
      </div>
      <Modal open={trust.sources.length > 0} title="确认允许模型代码在本机执行" onClose={trust.reset}>
        <p>下列来源的代码将在训练进程内执行，拥有同进程的文件读写和网络访问权限，并非隔离沙箱。请仅确认你信任且已核验的来源。</p>
        <ul>{trust.sources.map((row) => <li key={row.source}>
          <strong>{row.kind}</strong><br /><code style={{ overflowWrap: 'anywhere' }}>{row.location}</code>
        </li>)}</ul>
        <p>授权只作用于本次提交，不保存到草稿或预设；取消保持关闭。它不会放开 pickle 反序列化。</p>
        <Button onClick={trust.reset}>取消</Button>{' '}
        <Button variant="primary" onClick={trust.confirm} disabled={disabled}>我已核验来源，仅允许本次运行</Button>
      </Modal>
    </section>
  )
}
