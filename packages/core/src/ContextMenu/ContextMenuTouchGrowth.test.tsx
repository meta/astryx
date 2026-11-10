// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuTouchGrowth.test.tsx
 * @input ContextMenu under a finger in jsdom, with the compositor animator
 *   replaced
 * @output Checks that the trigger's visual grows only while ContextMenu's
 *   recognizer follows a finger, and springs back when the recognizer fails
 * @position Unit tests of the press feedback's start and end in
 *   packages/core/src/ContextMenu/ContextMenuTouchLayer.tsx
 */

import {act, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {ContextMenu} from './ContextMenu';

const animator = vi.hoisted(() => ({
  elements: [] as HTMLElement[],
  play: vi.fn(),
  animate: vi.fn(),
}));

vi.mock('../motion/animator', async importOriginal => {
  const original = await importOriginal<object>();
  return {
    ...original,
    createMotionEngine: (element: HTMLElement) => {
      animator.elements.push(element);
      const pending = () => ({finished: new Promise<boolean>(() => {})});
      return {
        element,
        play: (...args: unknown[]) => {
          animator.play(element, ...args);
          return pending();
        },
        animate: (...args: unknown[]) => {
          animator.animate(element, ...args);
          return pending();
        },
        stop: () => {},
        dispose: () => {},
        get: () => 1,
        getVelocity: () => 0,
        reducedMotion: () => 'off',
      };
    },
  };
});

interface Contact {
  id: number;
  x: number;
  y: number;
}

function dispatchTouch(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  target: EventTarget,
  changed: Contact[],
  all: Contact[],
) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const toTouch = (contact: Contact) => ({
    identifier: contact.id,
    clientX: contact.x,
    clientY: contact.y,
    target,
  });
  Object.defineProperty(event, 'changedTouches', {value: changed.map(toTouch)});
  Object.defineProperty(event, 'touches', {value: all.map(toTouch)});
  Object.defineProperty(event, 'timeStamp', {value: performance.now()});
  target.dispatchEvent(event);
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

// Fake animation frames come every 16 ms. The growth starts in the first one
// at or after its onset.
const FRAME_MS = 16;

/** The press machine's "on", as core's press machine writes it. */
async function pressMachineOn(trigger: HTMLElement) {
  trigger.setAttribute(PRESSED_ATTRIBUTE, 'on');
  await act(async () => {});
}

/** The press machine lets the press go. */
async function pressMachineOff(trigger: HTMLElement) {
  trigger.removeAttribute(PRESSED_ATTRIBUTE);
  await act(async () => {});
}

// The gesture host remembers the latest event time, and each install of fake
// timers restarts `performance.now()` near 0. So every case moves the clock on.
let clockEpoch = 0;

describe('ContextMenu’s growth under a finger', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
      ],
    });
    clockEpoch += 100_000;
    vi.advanceTimersByTime(clockEpoch);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    animator.elements.length = 0;
  });

  function renderMenu() {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
        <div>Hold me</div>
      </ContextMenu>,
    );
    return screen.getByTestId('ctx');
  }

  // The press feedback grows the trigger's own visual, its first child.
  const visualOf = (trigger: HTMLElement) => trigger.firstElementChild;

  const scaleBack = (trigger: HTMLElement) =>
    animator.animate.mock.calls.filter(
      ([element, to]) =>
        element === visualOf(trigger) && (to as {scale?: number}).scale === 1,
    );

  it('springs a grown trigger back when the finger lifts before the commit', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    advance(150 + FRAME_MS);
    await pressMachineOn(trigger);
    expect(growths(trigger)).toHaveLength(1);
    advance(100);
    dispatchTouch('touchend', trigger, [contact], []);
    expect(scaleBack(trigger)).toHaveLength(1);
  });

  const growths = (trigger: HTMLElement) =>
    animator.animate.mock.calls.filter(
      ([element, to]) =>
        element === visualOf(trigger) &&
        ((to as {scale?: number}).scale ?? 1) > 1,
    );
  const startOf = (call: unknown[]) => (call[3] as {at: number}).at;
  // One growth, started from rest in the first frame at or after the onset.
  const expectGrowthFromOnsetFrame = (
    trigger: HTMLElement,
    landedAt: number,
  ) => {
    const starts = growths(trigger).map(startOf);
    expect(starts).toHaveLength(1);
    expect(starts[0]).toBeGreaterThanOrEqual(landedAt + 150);
    expect(starts[0]).toBeLessThan(landedAt + 150 + FRAME_MS);
  };

  it('starts the growth at the onset, 150 ms after the finger lands, when the press machine marks the press as the finger lands', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    const landedAt = performance.now();
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    // Outside a scroll view the press machine marks a press as it lands.
    await pressMachineOn(trigger);
    advance(149);
    expect(growths(trigger)).toHaveLength(0);
    advance(1 + FRAME_MS);
    expectGrowthFromOnsetFrame(trigger, landedAt);
  });

  it('grows the trigger at the onset when the press machine marks the press before the recognizer has the finger', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    // In a browser the press machine's mark comes first: its listener runs
    // before the recognizer's, and the mark is read between the two.
    await pressMachineOn(trigger);
    const landedAt = performance.now();
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    advance(150 + FRAME_MS);
    expectGrowthFromOnsetFrame(trigger, landedAt);
  });

  it('still grows at the onset after a drift past the press machine’s 10 px that the recognizer’s 11.5 px tolerance still follows', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    const landedAt = performance.now();
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    await pressMachineOn(trigger);
    advance(60);
    // An 11 px drift: the press machine lets the press go at 10 px.
    const drifted = {...contact, x: 31};
    dispatchTouch('touchmove', trigger, [drifted], [drifted]);
    await pressMachineOff(trigger);
    advance(90 + FRAME_MS);
    expectGrowthFromOnsetFrame(trigger, landedAt);
  });

  it('grows at the onset after a drift the press machine never marks, as inside a scroll view, that the recognizer still follows', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    const landedAt = performance.now();
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    advance(60);
    // An (8, 8) px drift, 11.3 px: past the machine's 10 px, so it never
    // marks the press, and inside the recognizer's 11.5 px.
    const drifted = {...contact, x: 28, y: 28};
    dispatchTouch('touchmove', trigger, [drifted], [drifted]);
    advance(90 + FRAME_MS);
    expectGrowthFromOnsetFrame(trigger, landedAt);
  });

  it('grows at the onset, 150 ms after the finger lands, even when the press machine marks the press later', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    const landedAt = performance.now();
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    advance(150 + FRAME_MS);
    expectGrowthFromOnsetFrame(trigger, landedAt);
    // Inside a scroll view the machine's own timer marks it later.
    advance(90);
    await pressMachineOn(trigger);
    expect(growths(trigger)).toHaveLength(1);
  });

  it('grows a pen’s press at the onset from the press machine’s mark, which finds the recognizer following the pen', async () => {
    const trigger = renderMenu();
    const landedAt = performance.now();
    const down = new Event('pointerdown', {bubbles: true, cancelable: true});
    Object.assign(down, {
      pointerId: 7,
      pointerType: 'pen',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    });
    Object.defineProperty(down, 'timeStamp', {value: landedAt});
    // The press machine marks the pen's press from the same pointerdown.
    trigger.dispatchEvent(down);
    await act(async () => {});
    expect(trigger.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    advance(149);
    expect(growths(trigger)).toHaveLength(0);
    advance(1 + FRAME_MS);
    expectGrowthFromOnsetFrame(trigger, landedAt);
  });

  it('builds the motion engine in the first frame after the finger lands, not in its touchstart handler', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    expect(animator.elements).not.toContain(visualOf(trigger));
    advance(FRAME_MS);
    expect(animator.elements).toContain(visualOf(trigger));
    expect(growths(trigger)).toHaveLength(0);
  });

  it('shows nothing for a quick tap: no animation and no inline style', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    const style = trigger.getAttribute('style');
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    advance(40);
    dispatchTouch('touchend', trigger, [contact], []);
    advance(400);
    expect(animator.animate).not.toHaveBeenCalled();
    expect(animator.play).not.toHaveBeenCalled();
    expect(trigger.getAttribute('style')).toBe(style);
  });

  it.each([
    [
      'the finger lifts',
      (trigger: HTMLElement, contact: Contact) =>
        dispatchTouch('touchend', trigger, [contact], []),
    ],
    [
      'the finger moves past the hold’s tolerance',
      (trigger: HTMLElement, contact: Contact) => {
        const moved = {...contact, x: contact.x + 20};
        dispatchTouch('touchmove', trigger, [moved], [moved]);
      },
    ],
    [
      'the browser cancels the touch',
      (trigger: HTMLElement, contact: Contact) =>
        dispatchTouch('touchcancel', trigger, [contact], [contact]),
    ],
  ])(
    'stops watching frames for the onset when %s before it',
    async (_, stop) => {
      const trigger = renderMenu();
      const contact = {id: 1, x: 20, y: 20};
      dispatchTouch('touchstart', trigger, [contact], [contact]);
      advance(60);
      const frames = vi.spyOn(window, 'requestAnimationFrame');
      const cancels = vi.spyOn(window, 'cancelAnimationFrame');
      try {
        stop(trigger, contact);
        expect(cancels).toHaveBeenCalled();
        advance(200);
        // The onset's watch asks for no frame after it stops.
        expect(
          frames.mock.calls.filter(([callback]) => callback.name === 'look'),
        ).toEqual([]);
        expect(growths(trigger)).toHaveLength(0);
      } finally {
        frames.mockRestore();
        cancels.mockRestore();
      }
    },
  );

  it('does not grow the trigger for a press its recognizer does not follow, such as a mouse', async () => {
    const trigger = renderMenu();
    await pressMachineOn(trigger);
    expect(growths(trigger)).toHaveLength(0);
  });
});
