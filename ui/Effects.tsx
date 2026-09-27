import React, {useEffect, useRef, useState} from 'react';
import type {Status, Cursor} from './Hud';
import './effects.css';

export function Effects({status}: {status: Status | null}) {
  const cursor = useRef<HTMLDivElement>(null);
  const lastPulse = useRef<Cursor['pulse']>(undefined);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const clearPulse = () => setPulse(0);
    media.addEventListener('change', clearPulse);
    return () => media.removeEventListener('change', clearPulse);
  }, []);
  useEffect(() => window.dshStatus.subscribeCursor?.(point => {
    if (!cursor.current) return;
    const previousPulse = lastPulse.current;
    if (point.pulse !== undefined) lastPulse.current = point.pulse;
    const visible = point.visible !== false && Number.isFinite(point.x) && Number.isFinite(point.y);
    cursor.current.dataset.visible = String(visible);
    if (!visible) return;
    cursor.current.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    if (previousPulse !== undefined && point.pulse && point.pulse !== previousPulse) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPulse(value => value + 1);
    }
  }), []);
  const active = !!status?.active && !['stopped', 'idle'].includes(status.state);
  const paused = active && status?.paused && status.state !== 'pausing';
  const moving = active && !paused && status?.executing !== false;
  useEffect(() => {
    if (!active || paused) setPulse(0);
    if (!active && cursor.current) cursor.current.dataset.visible = 'false';
  }, [active, paused]);
  return <div className={`effects-surface ${active ? 'is-active' : ''} ${paused ? 'is-paused' : ''} ${moving ? 'is-moving' : 'is-resting'}`} aria-hidden="true">
    <div className="edge-glow"/>
    <div ref={cursor} className="cursor-position" data-visible="false">
      <div className="cursor-aura"/>
      {pulse > 0 && <div key={pulse} className="cursor-click" onAnimationEnd={() => setPulse(0)}/>}
    </div>
  </div>;
}
