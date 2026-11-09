// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file observeMainOverflow.test.ts
 * @input observeMainOverflow on a main element with mocked geometry, a
 *   recorded resize observer, and frames run by hand
 * @output Regression coverage for measuring a scroll container that holds its
 *   content as direct children: the children's sizes, the children coming and
 *   going, unknown geometry, and stopping
 * @position Unit contract of AppShell's internal overflow observer;
 *   AppShell.test.tsx covers main becoming a keyboard stop
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {observeMainOverflow} from './observeMainOverflow';

const observed = vi.hoisted(
  () => new Map<Element, {callback: () => void; stopped: boolean}>(),
);

vi.mock('../utils/sharedResizeObserver', () => ({
  observeResize: (element: Element, callback: () => void) => {
    const entry = {callback, stopped: false};
    observed.set(element, entry);
    return () => {
      entry.stopped = true;
    };
  },
}));

function setGeometry(element: HTMLElement, client: number, scroll: number) {
  for (const [key, value] of [
    ['clientWidth', 800],
    ['scrollWidth', 800],
    ['clientHeight', client],
    ['scrollHeight', scroll],
    ['scrollTop', 0],
    ['scrollLeft', 0],
  ] as const) {
    Object.defineProperty(element, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
}

describe('observeMainOverflow', () => {
  let frames: FrameRequestCallback[];
  let main: HTMLElement;
  let stop: (() => void) | null;

  beforeEach(() => {
    observed.clear();
    frames = [];
    stop = null;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    // jsdom computes no overflow longhands; main scrolls (`overflow: auto`).
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      const computed = nativeGetComputedStyle(element);
      return new Proxy(computed, {
        // eslint-disable-next-line @typescript-eslint/promise-function-async -- Proxy traps must remain synchronous
        get(target, property) {
          if (property === 'overflowX' || property === 'overflowY') {
            return 'auto';
          }
          return Reflect.get(target, property, target);
        },
      });
    });
    main = document.createElement('div');
    main.innerHTML = '<p id="first">First</p><p id="second">Second</p>';
    document.body.append(main);
    setGeometry(main, 300, 300);
  });

  afterEach(() => {
    stop?.();
    main.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function runFrames() {
    const pending = frames.splice(0);
    pending.forEach(callback => callback(performance.now()));
  }

  it('reports the first measurement at once, then only changes', () => {
    const onChange = vi.fn();
    stop = observeMainOverflow(main, onChange);
    expect(onChange.mock.calls).toEqual([[false]]);

    window.dispatchEvent(new Event('resize'));
    runFrames();
    expect(onChange.mock.calls).toEqual([[false]]);

    setGeometry(main, 300, 1200);
    window.dispatchEvent(new Event('resize'));
    runFrames();
    expect(onChange.mock.calls).toEqual([[false], [true]]);
  });

  it('watches each direct child, so content growing inside main is measured', () => {
    const onChange = vi.fn();
    stop = observeMainOverflow(main, onChange);
    const second = main.querySelector('#second');
    expect(observed.has(main)).toBe(true);
    expect(observed.has(main.querySelector('#first') as Element)).toBe(true);
    expect(second != null && observed.has(second)).toBe(true);

    // The child grows; main keeps its own size.
    setGeometry(main, 300, 1200);
    observed.get(second as Element)?.callback();
    runFrames();

    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('follows the children as they come and go', async () => {
    stop = observeMainOverflow(main, vi.fn());
    const first = main.querySelector('#first') as Element;

    const replacement = document.createElement('section');
    first.replaceWith(replacement);
    // The mutation observer reports the change asynchronously.
    await Promise.resolve();

    expect(observed.get(first)?.stopped).toBe(true);
    expect(observed.has(replacement)).toBe(true);
  });

  it('keeps the last answer while main cannot be measured', () => {
    const onChange = vi.fn();
    setGeometry(main, 300, 1200);
    stop = observeMainOverflow(main, onChange);
    expect(onChange.mock.calls).toEqual([[true]]);

    // A hidden or zero-size main is unknown, not fitting.
    setGeometry(main, 0, 0);
    window.dispatchEvent(new Event('resize'));
    runFrames();
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('stops every observer and listener, and measures nothing after', () => {
    const onChange = vi.fn();
    stop = observeMainOverflow(main, onChange);
    const children = Array.from(main.children);
    window.dispatchEvent(new Event('resize'));
    stop();
    stop = null;

    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(observed.get(main)?.stopped).toBe(true);
    for (const child of children) {
      expect(observed.get(child)?.stopped).toBe(true);
    }
    setGeometry(main, 300, 1200);
    window.dispatchEvent(new Event('resize'));
    runFrames();
    expect(frames).toEqual([]);
    expect(onChange.mock.calls).toEqual([[false]]);
  });
});
