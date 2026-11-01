// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useDragToSnapPoints.test.tsx
 * @input vitest (jsdom, fake clock), React Testing Library, the hook
 * @output Checks `spec:AST-107` FR2 and FR6 for the hook: `settleTo` from a
 *   key settles and calls the latest `onSettle`, `settleTo` is stable, an
 *   unmount stops reporting, an empty list stays empty, and the hook module
 *   holds no behavior of its own
 * @position Testing; validates useDragToSnapPoints.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {act, render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {coarsePrimaryPointer} from '../gestures/__tests__/harness';
import {useDragToSnapPoints} from './useDragToSnapPoints';

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  HTMLElement.prototype.animate = function (
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
  ) {
    played.push(keyframes);
    let start: number | null = null;
    const animation = {
      get startTime() {
        return start;
      },
      set startTime(value: number | null) {
        start = value;
      },
      playState: 'running',
      ready: new Promise(() => {}),
      finish() {},
      cancel() {},
    };
    requestAnimationFrame(() => {
      start ??= performance.now();
    });
    return animation as unknown as Animation;
  };
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
});

const POINTS = [0, 240, 480];

function touch(
  type: string,
  target: EventTarget,
  contact: {x: number; y: number},
  time: number,
  isLift = false,
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: 1, clientX: contact.x, clientY: contact.y, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: isLift ? [] : [entry]});
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

// The document's host outlives a test, so event times only move forward.
let clock = 2_000_000;

/** The keyframes of every animation the element played, in order. */
const played: (Keyframe[] | PropertyIndexedKeyframes | null)[] = [];

function Drawer({
  onSettle,
  settlers,
  snapPoints = POINTS,
}: {
  onSettle: (index: number) => void;
  settlers: Set<(index: number) => void>;
  snapPoints?: ReadonlyArray<number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const {settleTo} = useDragToSnapPoints(ref, {
    axis: 'y',
    snapPoints,
    onSettle,
  });
  settlers.add(settleTo);
  return <div ref={ref} />;
}

describe('useDragToSnapPoints', () => {
  it('settleTo settles from a key and calls the latest onSettle; settleTo is stable', async () => {
    const settlers = new Set<(index: number) => void>();
    const first = vi.fn();
    const latest = vi.fn();
    const {rerender} = render(<Drawer onSettle={first} settlers={settlers} />);
    rerender(<Drawer onSettle={latest} settlers={settlers} />);
    expect(settlers.size).toBe(1);
    const [settleTo] = settlers;
    act(() => settleTo(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(2);
  });

  it('after an unmount nothing reports', async () => {
    const settlers = new Set<(index: number) => void>();
    const onSettle = vi.fn();
    const {unmount} = render(
      <Drawer onSettle={onSettle} settlers={settlers} />,
    );
    const [settleTo] = settlers;
    act(() => settleTo(1));
    unmount();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(() => settleTo(2)).not.toThrow();
  });

  it('an empty list stays empty: settleTo does nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settlers = new Set<(index: number) => void>();
    const onSettle = vi.fn();
    render(<Drawer onSettle={onSettle} settlers={settlers} snapPoints={[]} />);
    const [settleTo] = settlers;
    act(() => settleTo(0));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSettle).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drives an element mounted after the hook first ran, and follows the one that replaces it (INV6)', async () => {
    const settlers = new Set<(index: number) => void>();
    const onSettle = vi.fn();
    function Late({shown, version}: {shown: boolean; version: number}) {
      const ref = useRef<HTMLDivElement>(null);
      const {settleTo} = useDragToSnapPoints(ref, {
        axis: 'y',
        snapPoints: POINTS,
        onSettle,
      });
      settlers.add(settleTo);
      return shown ? <div key={version} ref={ref} data-testid="late" /> : null;
    }
    const {rerender, getByTestId} = render(<Late shown={false} version={0} />);
    rerender(<Late shown version={0} />);
    const [settleTo] = settlers;
    act(() => settleTo(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSettle).toHaveBeenLastCalledWith(1);
    // A new node behind the ref: the drag moves to it.
    rerender(<Late shown version={1} />);
    const replaced = getByTestId('late');
    act(() => settleTo(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSettle).toHaveBeenLastCalledWith(2);
    expect(replaced.style.translate).toContain('480px');
  });

  it('an option changed mid-use leaves the element where it is, and the next settle starts there', async () => {
    const settlers = new Set<(index: number) => void>();
    const onSettle = vi.fn();
    function Sheet({flickThreshold}: {flickThreshold: number}) {
      const ref = useRef<HTMLDivElement>(null);
      const {settleTo} = useDragToSnapPoints(ref, {
        axis: 'y',
        snapPoints: POINTS,
        flickThreshold,
        onSettle,
      });
      settlers.add(settleTo);
      return <div ref={ref} data-testid="sheet" />;
    }
    const {rerender, getByTestId} = render(<Sheet flickThreshold={1008} />);
    const element = getByTestId('sheet');
    const [settleTo] = settlers;
    act(() => settleTo(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const settled = element.style.translate;
    expect(settled).toContain('240px');
    rerender(<Sheet flickThreshold={600} />);
    expect(element.style.translate).toBe(settled);
    // The next settle moves on from 240, not from the resting position.
    played.length = 0;
    act(() => settleTo(2));
    expect(JSON.stringify(played[0])).toContain('240px');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSettle).toHaveBeenLastCalledWith(2);
  });

  it('an option changed during a settle stops it where it is, and the next settle starts there', async () => {
    const settlers = new Set<(index: number) => void>();
    const onSettle = vi.fn();
    function Sheet({flickThreshold}: {flickThreshold: number}) {
      const ref = useRef<HTMLDivElement>(null);
      const {settleTo} = useDragToSnapPoints(ref, {
        axis: 'y',
        snapPoints: POINTS,
        flickThreshold,
        onSettle,
      });
      settlers.add(settleTo);
      return <div ref={ref} />;
    }
    const {rerender} = render(<Sheet flickThreshold={1008} />);
    const [settleTo] = settlers;
    act(() => settleTo(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    played.length = 0;
    rerender(<Sheet flickThreshold={600} />);
    // The drag is created again with the new option and nothing more: the
    // settle stops where the element is, and nothing reports.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(played).toHaveLength(0);
    expect(onSettle).not.toHaveBeenCalled();
    // The next settle starts from there: never from 0, never a jump.
    const [next] = [...settlers].slice(-1);
    act(() => next(2));
    const frames = played[0] as Keyframe[];
    const yOf = (frame: Keyframe | undefined) =>
      Number.parseFloat(String(frame?.translate ?? '').split(' ')[1] ?? '');
    expect(yOf(frames[0])).toBeGreaterThan(0);
    expect(yOf(frames[0])).toBeLessThan(480);
    expect(yOf(frames.at(-1))).toBeCloseTo(480, 0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSettle).toHaveBeenLastCalledWith(2);
  });

  it('new snap points leave a resting element where it is, and the next settle starts there', async () => {
    const settlers = new Set<(index: number) => void>();
    const onSettle = vi.fn();
    function Sheet({snapPoints}: {snapPoints: number[]}) {
      const ref = useRef<HTMLDivElement>(null);
      const {settleTo} = useDragToSnapPoints(ref, {
        axis: 'y',
        snapPoints,
        onSettle,
      });
      settlers.add(settleTo);
      return <div ref={ref} />;
    }
    const {rerender} = render(<Sheet snapPoints={POINTS} />);
    const [settleTo] = settlers;
    act(() => settleTo(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // 240 is still a snap point, now the third: nothing moves.
    played.length = 0;
    rerender(<Sheet snapPoints={[0, 120, 240, 480]} />);
    expect(played).toHaveLength(0);
    // 240 is gone: still nothing moves, and nothing reports.
    onSettle.mockClear();
    rerender(<Sheet snapPoints={[0, 300, 600]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(played).toHaveLength(0);
    expect(onSettle).not.toHaveBeenCalled();
    // The next settle, to 300, starts from 240.
    act(() => settleTo(1));
    expect(JSON.stringify(played[0])).toContain('240px');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSettle).toHaveBeenLastCalledWith(1);
  });

  it('an option changed during a release\u2019s settle leaves it where it is: the hook only creates the drag again', async () => {
    // A flick from 260 toward 480, stopped about 330 by a new option. Creating
    // the drag again is all the hook does (spec:AST-107 FR6), so nothing aims
    // it at 240 or reports a point it never reached.
    const restore = coarsePrimaryPointer();
    try {
      const settlers = new Set<(index: number) => void>();
      const onSettle = vi.fn();
      function Sheet({flickThreshold}: {flickThreshold: number}) {
        const ref = useRef<HTMLDivElement>(null);
        const {settleTo} = useDragToSnapPoints(ref, {
          axis: 'y',
          snapPoints: POINTS,
          flickThreshold,
          onSettle,
        });
        settlers.add(settleTo);
        return <div ref={ref} />;
      }
      const {rerender, container} = render(<Sheet flickThreshold={1008} />);
      const element = container.firstElementChild as HTMLElement;
      const [settleTo] = settlers;
      act(() => settleTo(1));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      onSettle.mockClear();
      // From 240: 20 px down slowly, to 260, then 30 px in 20 ms (1500 px/s),
      // a flick toward 480.
      clock += 10_000;
      const start = clock;
      act(() => {
        touch('touchstart', element, {x: 10, y: 10}, start);
        touch('touchmove', element, {x: 10, y: 20}, start + 200);
        touch('touchmove', element, {x: 10, y: 30}, start + 400);
        touch('touchmove', element, {x: 10, y: 45}, start + 410);
        touch('touchmove', element, {x: 10, y: 60}, start + 420);
        touch('touchend', element, {x: 10, y: 60}, start + 424, true);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40);
      });
      played.length = 0;
      rerender(<Sheet flickThreshold={600} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(played).toHaveLength(0);
      expect(onSettle).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('delegates entirely to the factory: the hook module holds no behavior of its own', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'useDragToSnapPoints.ts'),
      'utf8',
    );
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    expect([...new Set(imports)].sort()).toEqual([
      '../dragToSnapPoints/createDragToSnapPoints',
      './useIsomorphicLayoutEffect',
      'react',
    ]);
    expect(source).toContain('createDragToSnapPoints(element');
    expect(source).not.toMatch(/\b(motion|gestures)\//);
  });
});
