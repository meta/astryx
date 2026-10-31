// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file actionGroupTracker.test.ts
 * @input vitest (jsdom), createActionGroupTracker over actions laid out with
 *   stubbed rects
 * @output The tracker's contract, driven directly as a recognizer elsewhere
 *   would drive it: begin highlights the action under the point and reads
 *   layout only then; move follows the finger and cuts (not fades) the action
 *   it leaves; end fades and runs only the action under the finger, once;
 *   cancel and an inert press run nothing; disabled actions are skipped;
 *   several roots are one group; offsetBy shifts the cached rects; the
 *   highlight callback (with the target it replaces) and the opt-out of the
 *   paint; an owner's own target resolution (a row of segments, past its
 *   ends), the finger's raw moves, the begin target, remeasure, a cancelled
 *   click reported, and the browser's own click swallowed once
 * @position jsdom tests of packages/core/src/hooks/actionGroupTracker.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {PRESS_FADE_MS} from '../utils/pressGesture';
import {
  createActionGroupTracker,
  type ActionGroupTarget,
  type ActionGroupTrackerOptions,
} from './actionGroupTracker';

function place(
  element: Element,
  box: {left: number; top: number; width: number; height: number},
) {
  const rect = DOMRect.fromRect({
    x: box.left,
    y: box.top,
    width: box.width,
    height: box.height,
  });
  const spy = vi.fn(() => rect);
  element.getBoundingClientRect = spy;
  return spy;
}

function action(label: string, box: Parameters<typeof place>[1]) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('data-action', '');
  const rectSpy = place(button, box);
  const onClick = vi.fn();
  button.addEventListener('click', onClick);
  return {button, onClick, rectSpy};
}

let root: HTMLDivElement;
let first: ReturnType<typeof action>;
let second: ReturnType<typeof action>;

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  first = action('First', {left: 0, top: 0, width: 200, height: 40});
  second = action('Second', {left: 0, top: 50, width: 200, height: 40});
  root.append(first.button, second.button);
  document.body.append(root);
});

afterEach(() => {
  root.remove();
  vi.useRealTimers();
});

function tracker(options: Partial<ActionGroupTrackerOptions> = {}) {
  return createActionGroupTracker(() => ({
    roots: () => [root],
    itemSelector: '[data-action]',
    highlightExpansion: 0,
    ...options,
  }));
}

describe('createActionGroupTracker', () => {
  it('begin highlights the action under the point and reads layout only then', () => {
    const group = tracker();
    group.begin(100, 20);
    expect(group.highlighted).toBe(first.button);
    expect(first.button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    group.move(100, 25);
    group.move(100, 70);
    group.move(100, 72);
    expect(first.rectSpy).toHaveBeenCalledTimes(1);
    expect(second.rectSpy).toHaveBeenCalledTimes(1);
  });

  it('move follows the finger: the action it leaves is cut, not faded', () => {
    const group = tracker();
    group.begin(100, 20);
    group.move(100, 70);
    expect(first.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    expect(second.button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    // Between the actions nothing is highlighted.
    group.move(100, 45);
    expect(group.highlighted).toBeNull();
    expect(second.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('end fades the action under the finger and runs it once, from inside the call', () => {
    const group = tracker();
    group.begin(100, 20);
    group.move(100, 70);
    expect(group.end()).toBe(second.button);
    expect(second.onClick).toHaveBeenCalledTimes(1);
    expect(first.onClick).not.toHaveBeenCalled();
    expect(second.button.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(second.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    // A second end has nothing to run.
    expect(group.end()).toBeNull();
    expect(second.onClick).toHaveBeenCalledTimes(1);
  });

  it('a lift with no action under the finger runs nothing', () => {
    const group = tracker();
    group.begin(100, 20);
    group.move(100, 200);
    expect(group.end()).toBeNull();
    expect(first.onClick).not.toHaveBeenCalled();
  });

  it('cancel cuts the highlight, reports it gone and runs nothing', () => {
    const onHighlightChange =
      vi.fn<(item: HTMLElement | null, previous: HTMLElement | null) => void>();
    const group = tracker({onHighlightChange});
    group.begin(100, 20);
    group.cancel();
    expect(onHighlightChange).toHaveBeenLastCalledWith(null, first.button);
    expect(first.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    expect(group.isTracking).toBe(false);
    expect(group.end()).toBeNull();
    expect(first.onClick).not.toHaveBeenCalled();
  });

  it('an inert press is taken but paints and runs nothing', () => {
    const group = tracker();
    group.begin(100, 20, {inert: true});
    expect(group.isTracking).toBe(true);
    expect(group.highlighted).toBeNull();
    expect(first.rectSpy).not.toHaveBeenCalled();
    group.move(100, 70);
    expect(group.end()).toBeNull();
    expect(first.onClick).not.toHaveBeenCalled();
    expect(second.onClick).not.toHaveBeenCalled();
  });

  it('skips disabled actions', () => {
    second.button.disabled = true;
    const group = tracker();
    group.begin(100, 70);
    expect(group.highlighted).toBeNull();
    expect(group.end()).toBeNull();
  });

  it('tracks the actions of several roots as one group', () => {
    const flyout = document.createElement('div');
    const third = action('Third', {left: 220, top: 0, width: 200, height: 40});
    flyout.append(third.button);
    document.body.append(flyout);
    const group = tracker({roots: () => [root, flyout]});
    group.begin(100, 20);
    group.move(300, 20);
    expect(group.highlighted).toBe(third.button);
    group.end();
    expect(third.onClick).toHaveBeenCalledTimes(1);
    flyout.remove();
  });

  it('offsetBy shifts the cached rects when the content moves under a still finger', () => {
    const group = tracker();
    group.begin(100, 20);
    // The list scrolled up by 50: the second action is now under the finger.
    group.offsetBy(0, -50);
    group.move(100, 20);
    expect(group.highlighted).toBe(second.button);
    expect(second.rectSpy).toHaveBeenCalledTimes(1);
  });

  it('reports highlight changes, and can leave the paint to its owner', () => {
    const onHighlightChange = vi.fn<(item: HTMLElement | null) => void>();
    const onActivate = vi.fn();
    const group = tracker({
      paintsHighlight: false,
      onHighlightChange,
      onActivate,
    });
    group.begin(100, 20);
    group.move(100, 70);
    group.end();
    // The lift leaves the highlight to the activation: no change reported.
    expect(onHighlightChange.mock.calls.map(([item]) => item)).toEqual([
      first.button,
      second.button,
    ]);
    expect(first.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    expect(second.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    // onActivate replaces the action's own click.
    expect(onActivate).toHaveBeenCalledWith(second.button);
    expect(second.onClick).not.toHaveBeenCalled();
  });

  it('a press that begins while another is tracked takes the paint off the first one', () => {
    const onHighlightChange = vi.fn<(item: HTMLElement | null) => void>();
    const group = tracker({onHighlightChange});
    group.begin(100, 20);
    expect(first.button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    // A second recognizer takes over the finger without an end or a cancel.
    group.begin(100, 70);
    expect(first.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    expect(second.button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    // Taken over onto nothing: the highlight is gone, and the owner is told.
    group.begin(100, 200);
    expect(second.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    expect(onHighlightChange.mock.calls.map(([item]) => item)).toEqual([
      first.button,
      second.button,
      null,
    ]);
  });

  it('dispose finishes a pending release fade', () => {
    const group = tracker();
    group.begin(100, 20);
    group.end();
    expect(first.button.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    group.dispose();
    expect(first.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(first.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('reads no idiom: an Android finger (no -webkit-touch-callout) tracks, fades and runs the same way', () => {
    vi.stubGlobal('CSS', {supports: () => false});
    try {
      const group = tracker();
      group.begin(100, 20);
      group.move(100, 70);
      expect(group.end()).toBe(second.button);
      expect(second.onClick).toHaveBeenCalledTimes(1);
      expect(second.button.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
      vi.advanceTimersByTime(PRESS_FADE_MS);
      expect(second.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('expands each action\u2019s hit area by the given margin', () => {
    const group = tracker({highlightExpansion: 6});
    group.begin(100, 44);
    expect(group.highlighted).toBe(first.button);
  });
});

describe('createActionGroupTracker: options for other trackers', () => {
  // A row of two segments, side by side with a 2 px gap: x 0-99 and 101-200.
  let left: ReturnType<typeof action>;
  let right: ReturnType<typeof action>;
  beforeEach(() => {
    left = action('Left', {left: 0, top: 0, width: 99, height: 30});
    right = action('Right', {left: 101, top: 0, width: 99, height: 30});
    root.replaceChildren(left.button, right.button);
  });

  /** The nearest segment along x: the gap counts for the nearer one, past the ends the end one. */
  const nearestAlongX = (
    x: number,
    _y: number,
    targets: ReadonlyArray<ActionGroupTarget>,
  ) => {
    let best: ActionGroupTarget | null = null;
    let bestDistance = Infinity;
    for (const target of targets) {
      const distance =
        x < target.left
          ? target.left - x
          : x > target.right
            ? x - target.right
            : 0;
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best?.element ?? null;
  };

  it('resolves the target with the owner\u2019s rule, from the rects read at the begin', () => {
    const group = tracker({resolveTarget: nearestAlongX});
    group.begin(99.6, 200);
    expect(group.highlighted).toBe(left.button);
    group.move(100.6, 200);
    expect(group.highlighted).toBe(right.button);
    // Past the end (and far below the row) the end segment is the target, and
    // the lift runs it wherever the finger lifts.
    group.move(400, 300);
    expect(group.highlighted).toBe(right.button);
    expect(group.end()).toBe(right.button);
    expect(right.onClick).toHaveBeenCalledTimes(1);
    expect(left.rectSpy).toHaveBeenCalledTimes(1);
  });

  it('hands every finger position to onMove before resolving it', () => {
    const order: string[] = [];
    const group = tracker({
      onMove: (x, y) => order.push(`move ${x},${y}`),
      onHighlightChange: item => order.push(`highlight ${item?.textContent}`),
    });
    group.begin(50, 10);
    group.move(150, 12);
    group.move(160, 14);
    expect(order).toEqual([
      'move 50,10',
      'highlight Left',
      'move 150,12',
      'highlight Right',
      'move 160,14',
    ]);
  });

  it('reports the target each highlight replaces, and the target the press began on', () => {
    const onHighlightChange =
      vi.fn<(item: HTMLElement | null, previous: HTMLElement | null) => void>();
    const group = tracker({onHighlightChange});
    group.begin(50, 10);
    expect(group.beganOn).toBe(left.button);
    group.move(150, 10);
    group.move(150, 100);
    expect(group.beganOn).toBe(left.button);
    expect(onHighlightChange.mock.calls).toEqual([
      [left.button, null],
      [right.button, left.button],
      [null, right.button],
    ]);
    group.cancel();
    expect(group.beganOn).toBeNull();
    // An inert press began on nothing.
    group.begin(50, 10, {inert: true});
    expect(group.beganOn).toBeNull();
  });

  it('remeasure reads the targets again and resolves the finger\u2019s last position', () => {
    const group = tracker();
    group.begin(50, 10);
    expect(group.highlighted).toBe(left.button);
    // The row moved 120 px down under the still finger (a scroll the owner
    // did not run): the finger is now over neither segment.
    place(left.button, {left: 0, top: 120, width: 99, height: 30});
    place(right.button, {left: 101, top: 120, width: 99, height: 30});
    group.remeasure();
    expect(group.highlighted).toBeNull();
    expect(left.button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    group.move(150, 130);
    expect(group.highlighted).toBe(right.button);
  });

  it('reports whether a click handler cancelled the activation', () => {
    const onActivated = vi.fn();
    right.button.addEventListener('click', event => event.preventDefault());
    const group = tracker({onActivated});
    group.begin(50, 10);
    group.end();
    group.begin(150, 10);
    group.end();
    expect(onActivated.mock.calls).toEqual([
      [left.button, false],
      [right.button, true],
    ]);
    // With onActivate the owner runs the action; there is no click to report.
    const onActivate = vi.fn();
    const owned = tracker({onActivate, onActivated});
    owned.begin(50, 10);
    owned.end();
    expect(onActivate).toHaveBeenCalledWith(left.button);
    expect(onActivated).toHaveBeenCalledTimes(2);
  });

  it('swallows the browser\u2019s own click after the lift once, listening only until then', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const group = tracker({swallowsNativeClick: true});
      group.begin(50, 10);
      add.mockClear();
      group.end();
      // The tracker's own click ran inside end, before the swallower.
      expect(left.onClick).toHaveBeenCalledTimes(1);
      // Listening now: what end added and did not take off again (the
      // capture that reads its own click comes and goes inside the call).
      const gone = new Set(remove.mock.calls.map(([, listener]) => listener));
      const armed = add.mock.calls.filter(
        ([, listener, capture]) => capture === true && !gone.has(listener),
      );
      expect(armed.map(([type]) => type).sort()).toEqual([
        'click',
        'keydown',
        'pointerdown',
      ]);
      remove.mockClear();
      // A script's click is not the browser's: it passes.
      const onDocumentClick = vi.fn();
      document.addEventListener('click', onDocumentClick);
      left.button.click();
      expect(onDocumentClick).toHaveBeenCalledTimes(1);
      // The browser's click for the touch is taken once, and the swallower goes.
      const swallow = armed.find(([type]) => type === 'click')?.[1] as (
        event: unknown,
      ) => void;
      const trusted = {
        isTrusted: true,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };
      swallow(trusted);
      expect(trusted.preventDefault).toHaveBeenCalled();
      expect(trusted.stopImmediatePropagation).toHaveBeenCalled();
      const removed = remove.mock.calls
        .filter(([, , capture]) => capture === true)
        .map(([type]) => type)
        .sort();
      expect(removed).toEqual(['click', 'keydown', 'pointerdown']);
      document.removeEventListener('click', onDocumentClick);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('lets an activation with detail 0 (keyboard, assistive technology) through while it waits for the browser\u2019s click (spec:AST-094 FR21)', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const group = tracker({swallowsNativeClick: true});
      group.begin(50, 10);
      add.mockClear();
      group.end();
      const gone = new Set(remove.mock.calls.map(([, listener]) => listener));
      const swallow = add.mock.calls.find(
        ([type, listener, capture]) =>
          type === 'click' && capture === true && !gone.has(listener),
      )?.[1] as (event: unknown) => void;
      remove.mockClear();
      // A screen reader's or a key's activation is not the touch's click: it
      // passes, and the swallower keeps waiting for the touch's own.
      const activation = {
        isTrusted: true,
        detail: 0,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };
      swallow(activation);
      expect(activation.preventDefault).not.toHaveBeenCalled();
      expect(activation.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      // The touch's own click (detail 1) is still taken once.
      const touchClick = {
        isTrusted: true,
        detail: 1,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      };
      swallow(touchClick);
      expect(touchClick.preventDefault).toHaveBeenCalled();
      expect(touchClick.stopImmediatePropagation).toHaveBeenCalled();
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('a press or a key before the browser\u2019s click ends the swallowing; without the option nothing stays listening', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const listening = () => {
      const gone = new Set(remove.mock.calls.map(([, listener]) => listener));
      return add.mock.calls
        .filter(([, listener]) => !gone.has(listener))
        .map(([type]) => type)
        .sort();
    };
    try {
      const plain = tracker();
      plain.begin(50, 10);
      plain.end();
      expect(listening()).toEqual([]);
      const group = tracker({swallowsNativeClick: true});
      group.begin(50, 10);
      group.end();
      expect(listening()).toEqual(['click', 'keydown', 'pointerdown']);
      // The next press comes first (the browser gave no click): disarmed.
      window.dispatchEvent(new PointerEvent('pointerdown'));
      expect(listening()).toEqual([]);
      group.begin(50, 10);
      group.end();
      window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
      expect(listening()).toEqual([]);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});
