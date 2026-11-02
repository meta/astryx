// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createDragToSnapPoints.finePointer.test.ts
 * @input vitest (jsdom, fake clock), the factory driven by mouse and pen
 *   pointer events through the document's gesture host where the primary
 *   pointer is fine, a recording stand-in for Element.animate
 * @output Checks `spec:AST-094` FR43 for the snap-point drag (`spec:AST-107`
 *   FR2): on a page whose primary pointer is fine, a mouse or pen drag moves
 *   the element and settles it on a snap point, as a finger's does
 * @position Testing; validates createDragToSnapPoints.ts through the host. Its
 *   own file, so the document's host is created where the pointer is fine.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createDragToSnapPoints} from './createDragToSnapPoints';

const POINTS = [0, 240, 480];

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
  HTMLElement.prototype.animate = function () {
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
  document.body.replaceChildren();
});

// The document's host outlives a test, so event times only move forward.
let clock = 1_000_000;

/** A `pointerType` drag down by `dy` in `steps` steps of `ms`, then a release. */
function dragY(
  target: Element,
  pointerType: 'mouse' | 'pen',
  dy: number,
  steps = 4,
  ms = 16,
): void {
  clock += 10_000;
  const start = clock;
  const send = (type: string, y: number, time: number, buttons: number) => {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType,
      isPrimary: true,
      clientX: 10,
      clientY: y,
      button: 0,
      buttons,
    });
    Object.defineProperty(event, 'timeStamp', {value: time});
    target.dispatchEvent(event);
  };
  send('pointerdown', 10, start, 1);
  for (let step = 1; step <= steps; step++) {
    send('pointermove', 10 + (dy * step) / steps, start + step * ms, 1);
  }
  send('pointerup', 10 + dy, start + steps * ms + 4, 0);
}

describe('where the primary pointer is fine (spec:AST-094 FR43)', () => {
  it('a mouse or pen drag moves the element and settles it on the nearest snap point', async () => {
    expect(window.matchMedia?.('(pointer: coarse)').matches ?? false).toBe(
      false,
    );
    for (const pointerType of ['mouse', 'pen'] as const) {
      const element = document.createElement('div');
      document.body.append(element);
      const onSettle = vi.fn();
      const snap = createDragToSnapPoints(element, {
        axis: 'y',
        snapPoints: POINTS,
        onSettle,
      });
      // 300 px over a second: slow, nearer 240 than 480.
      dragY(element, pointerType, 300, 20, 50);
      await vi.advanceTimersByTimeAsync(3000);
      expect(onSettle, pointerType).toHaveBeenCalledTimes(1);
      expect(onSettle, pointerType).toHaveBeenCalledWith(1);
      snap.destroy();
    }
  });
});
