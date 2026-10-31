// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Preview only (do not merge): shows what the browser reports for each wheel
 * event over the box, and whether the rescope reads it as a trackpad
 * ("continuous") or a mouse wheel ("discrete"). Mirrors the classifier in
 * gestures/GestureHost.ts on this branch.
 */

import {useEffect, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';

type Row = {gap: number; mode: number; dx: number; dy: number; wdx: number | null; wdy: number | null; kind: string};

function classify(e: WheelEvent): string {
  if (e.deltaMode !== 0) return 'discrete (lines/pages)';
  const remainder = (v: number) => {
    const f = Math.abs(v - Math.round(v));
    return f > 0 && f < 0.01;
  };
  if (remainder(e.deltaX) || remainder(e.deltaY)) return 'discrete (accelerated mouse)';
  const legacy = e as WheelEvent & {wheelDeltaX?: number; wheelDeltaY?: number};
  if (typeof legacy.wheelDeltaY === 'number' && typeof legacy.wheelDeltaX === 'number') {
    const precise = (d: number, l: number) =>
      d === 0 ? l === 0 : Math.abs(Math.abs(l) - 3 * Math.abs(d)) <= Math.max(1.5, 0.15 * Math.abs(d));
    if (!precise(e.deltaY, legacy.wheelDeltaY) || !precise(e.deltaX, legacy.wheelDeltaX)) return 'discrete (no trackpad signature)';
    const tick = (d: number, l: number) => l !== 0 && l % 120 === 0 && d % 40 === 0;
    if (tick(e.deltaY, legacy.wheelDeltaY) || tick(e.deltaX, legacy.wheelDeltaX)) return 'discrete (whole tick)';
    return 'continuous (trackpad)';
  }
  return 'no wheelDelta: older rule';
}

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const now = e.timeStamp;
      const legacy = e as WheelEvent & {wheelDeltaX?: number; wheelDeltaY?: number};
      const row: Row = {gap: last ? Math.round(now - last) : 0, mode: e.deltaMode, dx: e.deltaX, dy: e.deltaY, wdx: legacy.wheelDeltaX ?? null, wdy: legacy.wheelDeltaY ?? null, kind: classify(e)};
      last = now;
      setRows(r => [row, ...r].slice(0, 40));
    };
    el.addEventListener('wheel', on, {passive: false});
    return () => el.removeEventListener('wheel', on);
  }, []);
  return (
    <div style={{fontFamily: 'ui-monospace, monospace', fontSize: 12}}>
      <div ref={ref} style={{height: 160, border: '2px dashed var(--color-border-emphasized)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', fontSize: 15}}>
        Scroll here with the trackpad, then with the mouse wheel
      </div>
      <button type="button" onClick={() => setRows([])} style={{margin: '8px 0'}}>Clear</button>
      <table>
        <thead><tr><th>gap ms</th><th>mode</th><th>deltaX</th><th>deltaY</th><th>wheelDeltaX</th><th>wheelDeltaY</th><th>read as</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td>{r.gap}</td><td>{r.mode}</td><td>{r.dx}</td><td>{r.dy}</td><td>{r.wdx}</td><td>{r.wdy}</td><td>{r.kind}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const meta: Meta<typeof Probe> = {title: 'Preview/Wheel input probe', component: Probe};
export default meta;
export const Default: StoryObj<typeof Probe> = {render: () => <Probe />};
