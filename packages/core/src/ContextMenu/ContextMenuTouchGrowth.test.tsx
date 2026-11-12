// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuTouchGrowth.test.tsx
 * @input ContextMenu under a finger in jsdom, with the compositor animator
 *   replaced
 * @output Checks that the trigger's visual grows only while ContextMenu's
 *   recognizer follows a finger or a pen, and springs back when the
 *   recognizer fails
 * @position Unit tests of the press feedback's start and end in
 *   packages/core/src/ContextMenu/ContextMenuTouchLayer.tsx
 */

import {act, cleanup, render, screen, within} from '@testing-library/react';
import {Suspense, startTransition, use, useState} from 'react';
import {createPortal} from 'react-dom';
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

  it('grows from the committed render, when React drops a later render that shows no growth', async () => {
    // A transition whose render suspends never commits. Its render makes the
    // trigger inline, which shows no growth.
    const never = new Promise<never>(() => {});
    function Suspends({isSuspended}: {isSuspended: boolean}) {
      if (isSuspended) {
        use(never);
      }
      return null;
    }
    let setIsInline: (isInline: boolean) => void = () => {};
    function App() {
      const [isInline, set] = useState(false);
      setIsInline = set;
      return (
        <Suspense fallback={null}>
          <ContextMenu
            items={[{label: 'Item 1'}]}
            data-testid="ctx"
            triggerAs={isInline ? 'span' : undefined}>
            <div>Hold me</div>
          </ContextMenu>
          <Suspends isSuspended={isInline} />
        </Suspense>
      );
    }
    render(<App />);
    await act(async () => {
      startTransition(() => setIsInline(true));
    });
    const trigger = screen.getByTestId('ctx');
    const contact = {id: 1, x: 20, y: 20};
    const landedAt = performance.now();
    dispatchTouch('touchstart', trigger, [contact], [contact]);
    advance(150 + FRAME_MS);
    expectGrowthFromOnsetFrame(trigger, landedAt);
  });

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

  it('times a finger’s growth on a second document’s own clock: it starts at that clock’s onset, 150 ms after the landing', async () => {
    // An app can render a ContextMenu into a same-origin iframe or a Document
    // Picture-in-Picture window through a portal.
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const secondDocument = frame.contentDocument as Document;
    const view = secondDocument.defaultView as Window & typeof globalThis;
    // The frame opened after the page, so its clock reads 5 s less. Its
    // events come stamped on that clock.
    const frameNow = vi
      .spyOn(view.performance, 'now')
      .mockImplementation(() => performance.now() - 5000);
    // Its animation frames come with the page's fake ones.
    const frameRequest = vi
      .spyOn(view, 'requestAnimationFrame')
      .mockImplementation(callback => requestAnimationFrame(callback));
    const frameCancel = vi
      .spyOn(view, 'cancelAnimationFrame')
      .mockImplementation(handle => cancelAnimationFrame(handle));
    Object.defineProperty(view, 'matchMedia', {
      value: window.matchMedia,
      configurable: true,
    });
    try {
      render(
        createPortal(
          <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
            <div>Hold me</div>
          </ContextMenu>,
          secondDocument.body,
        ),
      );
      const trigger = within(secondDocument.body).getByTestId('ctx');
      const contact = {
        identifier: 1,
        clientX: 20,
        clientY: 20,
        target: trigger,
      };
      const event = new view.Event('touchstart', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'changedTouches', {value: [contact]});
      Object.defineProperty(event, 'touches', {value: [contact]});
      const landedAt = view.performance.now();
      Object.defineProperty(event, 'timeStamp', {value: landedAt});
      trigger.dispatchEvent(event);
      // Its nodes come from another window, so the checks read numbers.
      advance(149);
      expect(growths(trigger).map(startOf)).toEqual([]);
      advance(1 + FRAME_MS);
      expectGrowthFromOnsetFrame(trigger, landedAt);
    } finally {
      // Unmount before the frame goes, or React removes nodes from a
      // document that no longer exists.
      cleanup();
      frame.remove();
      frameNow.mockRestore();
      frameRequest.mockRestore();
      frameCancel.mockRestore();
    }
  });

  it('grows the trigger at the onset when the press machine marks the press before the recognizer has the finger', async () => {
    const trigger = renderMenu();
    const contact = {id: 1, x: 20, y: 20};
    // In a browser the press machine's mark can come first: its listener
    // runs before the recognizer's.
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

  it('times a pen’s growth from its landing, as a finger’s: it starts at the onset, 150 ms after the pen lands', async () => {
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
    trigger.dispatchEvent(down);
    await act(async () => {});
    advance(149);
    expect(growths(trigger)).toHaveLength(0);
    advance(1 + FRAME_MS);
    expectGrowthFromOnsetFrame(trigger, landedAt);
  });

  it('grows a pen that drifts past the press machine’s 10 px inside a scroll view, which the recognizer’s 11.5 px tolerance still follows, at its onset', async () => {
    render(
      <div data-testid="scroller" style={{overflowY: 'auto', height: 200}}>
        <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
          <div>Hold me</div>
        </ContextMenu>
      </div>,
    );
    // A scroller with content past its height: the press machine waits
    // 150 ms before it marks a press here, and a travel past 10 px ends it.
    const scroller = screen.getByTestId('scroller');
    Object.defineProperty(scroller, 'scrollHeight', {value: 400});
    Object.defineProperty(scroller, 'clientHeight', {value: 200});
    const trigger = screen.getByTestId('ctx');
    const pen = (type: string, x: number) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      Object.assign(event, {
        pointerId: 7,
        pointerType: 'pen',
        isPrimary: true,
        button: type === 'pointerdown' ? 0 : -1,
        buttons: 1,
        clientX: x,
        clientY: 20,
      });
      Object.defineProperty(event, 'timeStamp', {value: performance.now()});
      trigger.dispatchEvent(event);
    };
    const landedAt = performance.now();
    pen('pointerdown', 20);
    await act(async () => {});
    advance(60);
    // An 11 px drift, before the machine's 150 ms: it never marks the press.
    pen('pointermove', 31);
    await act(async () => {});
    expect(trigger.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    advance(89);
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
