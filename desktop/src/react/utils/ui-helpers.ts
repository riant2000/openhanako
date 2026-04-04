/**
 * ui-helpers.ts — 连接状态 / 错误提示 / 模型加载
 *
 * 纯 store 操作，无 DOM 依赖。
 */

import { useStore } from '../stores';
import { hanaFetch } from '../hooks/use-hana-fetch';
// @ts-expect-error — shared JS module
import { errorBus } from '../../../../shared/error-bus.js';
// @ts-expect-error — shared JS module
import { AppError } from '../../../../shared/errors.js';

// ── 连接状态 ──

export function setStatus(key: string, connected: boolean, vars: Record<string, string | number> = {}): void {
  useStore.setState({ connected, statusKey: key, statusVars: vars });
}

// ── 错误显示 ──

export function showError(message: string): void {
  errorBus.report(new AppError('UNKNOWN', { message }));
}

// ── 模型加载 ──

export async function loadModels(): Promise<void> {
  try {
    const res = await hanaFetch('/api/models');
    const data = await res.json();
    const { pendingNewSession } = useStore.getState();
    // session 实际绑定的 model 优先（非 pending 状态时）
    // pending 状态用 isCurrent（= pendingModel ?? agent 默认）
    const activeModel = data.activeModel;
    const displayModel = (!pendingNewSession && activeModel)
      ? (data.models || []).find((m: any) => m.id === activeModel.id && m.provider === activeModel.provider)
      : (data.models || []).find((m: any) => m.isCurrent);
    useStore.setState({
      models: data.models || [],
      currentModel: displayModel ? { id: displayModel.id, provider: displayModel.provider } : null,
    });
  } catch { /* silent */ }
}

