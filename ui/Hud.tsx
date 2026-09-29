import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Effects} from './Effects';
import './adapter.css';
import {receiptLabels} from '../shared.mjs';

export type Status = {
  active: boolean;
  state: 'waiting' | 'running' | 'pausing' | 'paused' | 'done' | 'error' | 'stopping' | 'stopped' | 'idle' | 'yielded' | 'busy' | 'verified' | 'unconfirmed' | 'sent' | 'preview';
  paused: boolean;
  action: string;
  target: string;
  detail?: string;
  canPause?: boolean;
  canStop?: boolean;
  executing?: boolean;
  agents?: number;
  id?: string;
  started?: number;
  demo?: boolean;
};
export type Cursor = {x: number; y: number; pulse?: number | string; visible?: boolean};

declare global {
  interface Window {
    dshStatus: {
      subscribe(callback: (status: Status) => void): () => void;
      subscribeCursor?(callback: (cursor: Cursor) => void): () => void;
      command(command: 'pause' | 'stop'): void;
      resize(mode: 'bar'): void;
    };
  }
}

function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => window.dshStatus.subscribe(setStatus), []);
  return status;
}

function PauseIcon({paused}: {paused: boolean}) {
  return <svg viewBox="0 0 20 20" aria-hidden="true">{paused
    ? <path d="M7 4.4a.8.8 0 0 1 1.2-.69l8 5.6a.85.85 0 0 1 0 1.38l-8 5.6A.8.8 0 0 1 7 15.6Z" fill="currentColor"/>
    : <><rect x="5" y="4" width="3.2" height="12" rx="1" fill="currentColor"/><rect x="11.8" y="4" width="3.2" height="12" rx="1" fill="currentColor"/></>
  }</svg>;
}

function heading(status: Status) {
  if (status.state === 'stopped') return status.demo ? 'DSH 预览已结束' : 'DSH 已请求停止';
  if (status.state === 'stopping') return 'DSH 正在请求停止';
  if (status.state === 'pausing') return 'DSH 正在暂停';
  if (status.paused) return status.demo ? 'DSH 预览已暂停' : 'DSH 已暂停操作';
  if (status.state === 'error') return 'DSH 需要你查看';
  if (receiptLabels[status.state]) return `DSH ${receiptLabels[status.state]}`;
  if (!status.active || status.state === 'idle') return 'DSH 操作已结束';
  if (status.demo) return 'DSH 电脑操作预览';
  return 'DSH 正在操作电脑';
}

function Hud() {
  const status = useStatus();
  useEffect(() => { window.dshStatus.resize('bar'); }, []);
  if (!status) return null;
  const available = status.active && !['stopped', 'idle'].includes(status.state);
  const canPause = status.canPause ?? (available && !['pausing', 'stopping'].includes(status.state));
  const canStop = status.canStop ?? (available && status.state !== 'stopping');
  const paused = status.paused && status.state !== 'pausing';
  const pauseLabel = status.state === 'pausing' ? '取消暂停' : paused ? '继续操作' : '暂停操作';
  const phase = paused ? 'paused' : available ? 'active' : 'inactive';
  const detail = ['stopping', 'stopped'].includes(status.state) ? '后续操作已取消；已发出的动作可能正在收尾' : status.state === 'pausing' ? '当前动作结束后暂停' : paused ? '后续操作已暂停' : status.action || '正在准备操作';
  const target = status.target || '正在识别目标窗口';
  const receiptDetail = status.paused || ['stopping', 'stopped'].includes(status.state) ? '' : status.detail;
  return <main className={`status-surface is-${phase}`}>
    <section className="status-capsule" aria-label="DSH 电脑操作状态" title={`${heading(status)} · ${detail} · ${target}${receiptDetail ? ` · ${receiptDetail}` : ''}${(status.agents ?? 0) > 1 ? ` · ${status.agents} 个任务` : ''}`}>
      <div className="status-copy" aria-live="polite" aria-atomic="true">
        <span className="status-heading">{heading(status)}</span>
      </div>
      <div className="status-controls">
        <button className="status-pause" disabled={!canPause}
            onClick={() => window.dshStatus.command('pause')}
            title={status.paused ? pauseLabel : '暂停后续操作；当前已发出的动作可能继续完成'}
            aria-label={pauseLabel}>
            <PauseIcon paused={status.paused}/>
        </button>
        <span className="status-divider" aria-hidden="true"/>
        <button className="status-stop" disabled={!canStop}
          onClick={() => window.dshStatus.command('stop')}
          title="停止后续操作（Esc）；已发出的动作可能正在收尾"
          aria-label="停止电脑操作，快捷键 Esc">
          <kbd>Esc</kbd><span>停止</span>
        </button>
      </div>
    </section>
  </main>;
}

function EffectsSurface() {
  return <Effects status={useStatus()}/>;
}

const surface = new URLSearchParams(location.search).get('surface') === 'effects' ? 'effects' : 'status';
document.documentElement.dataset.surface = surface;
createRoot(document.getElementById('root')!).render(surface === 'effects' ? <EffectsSurface/> : <Hud/>);
