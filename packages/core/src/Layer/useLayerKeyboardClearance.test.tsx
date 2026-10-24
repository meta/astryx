// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useLayerKeyboardClearance.test.tsx
 * @input vitest (jsdom), a stand-in keyboard layout guide, and an anchored
 *   layer whose box the test computes from the cap the runtime writes
 * @output Checks the software keyboard's part of the viewport caps. The cap
 *   sits 10 px above the keyboard. It is written once a rising keyboard has
 *   arrived, and taken off as a falling one starts down. A keyboard already
 *   up at the open caps the layer before paint. The field stays in view. A
 *   layer clear of the keyboard, a bottom-held layer and a layer in another
 *   positioning are left as they are. The positioning is read from the last
 *   commit. An entering layer is read without its entrance transform. The
 *   cap is held through a press until its click. The window listeners are
 *   held only while a press is down. A layer element swapped in while open is
 *   measured again before it paints. The cap is read in layout px under a
 *   pinch zoom.
 * @position Testing; real keyboards are proven by the Popover keyboard
 *   browser spec and on the iOS simulator
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import React, {startTransition, use, useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {timing} from '../motion/uikit/timing';
import type {KeyboardTransition} from '../keyboard';
import type {KeyboardCurve, KeyboardProfile} from '../keyboard/keyboardModel';
import {BROWSER_CLICK_WAIT_MS} from '../utils/browserClickWait';
import type * as BrowserClickWaitModule from '../utils/browserClickWait';
import type {BrowserClickWaitHandlers} from '../utils/browserClickWait';
import type * as KeyboardHeightModule from '../keyboard/keyboardHeight';
import {
  keyboardClearanceCap,
  LAYER_ANCHORED_ATTRIBUTE,
  LAYER_KEYBOARD_CAP_PROPERTY,
  LAYER_KEYBOARD_CLEARANCE_PX,
  useLayerKeyboardClearance,
} from './useLayerKeyboardClearance';
import {useLayer} from './useLayer';

const guide = {
  inset: 0,
  profile: null as KeyboardProfile | null,
  listeners: new Set<(transition: KeyboardTransition) => void>(),
  subscribe(listener: (transition: KeyboardTransition) => void) {
    guide.listeners.add(listener);
    return () => {
      guide.listeners.delete(listener);
    };
  },
  emit(transition: Partial<KeyboardTransition>) {
    // A transition re-renders the layer with its cap.
    act(() => guide.deliver(transition));
  },
  deliver(transition: Partial<KeyboardTransition>) {
    for (const listener of guide.listeners) {
      listener({
        kind: 'show',
        from: 0,
        to: 0,
        start: performance.now(),
        velocity: 0,
        animated: true,
        predicted: false,
        curve: null,
        ...transition,
      });
    }
  },
};

// The cap imports the keyboard module's own files (not its index).
vi.mock('../keyboard/keyboardLayoutGuide', () => ({
  getKeyboardLayoutGuide: () => guide,
}));
vi.mock('../keyboard/keyboardHeight', async importOriginal => ({
  ...(await importOriginal<typeof KeyboardHeightModule>()),
  // The keyboard module's one height.
  getKeyboardHeight: () => guide.inset,
}));

// The browser's own click after a lift. A test calls the wait's handlers, as
// the shared wait does once a trusted click has run its handlers.
type ClickWait = {target: Element} & BrowserClickWaitHandlers;
const clickWaits = vi.hoisted(() => [] as ClickWait[]);
vi.mock('../utils/browserClickWait', async importOriginal => {
  const actual = await importOriginal<typeof BrowserClickWaitModule>();
  return {
    ...actual,
    awaitBrowserClick: (
      target: Element,
      handlers: BrowserClickWaitHandlers,
    ) => {
      clickWaits.push({target, ...handlers});
      return actual.awaitBrowserClick(target, handlers);
    },
  };
});

/** The browser's click for the last lift, as the shared wait reports it. */
const browserClick = () => {
  act(() => clickWaits.at(-1)!.onClicked(false));
};

// The layout viewport of an iPhone 17 Pro in Safari, and the cover the
// keyboard, its accessory bar and the toolbar report over it.
const VIEWPORT = 714;
const COVER = 337;
// A tall layer below its trigger: its box at rest.
const BOX = {top: 68, bottom: 509};
const CAPPED = `${VIEWPORT - COVER - 10 - BOX.top}px`;

function Harness({
  isOpen = true,
  isAnchored = true,
  box = BOX,
  focusRow = false,
  heldBottom = false,
  layerKey = 'a',
  entering,
  shiftedTop,
}: {
  isOpen?: boolean;
  isAnchored?: boolean;
  box?: {top: number; bottom: number};
  focusRow?: boolean;
  heldBottom?: boolean;
  /** A new key replaces the layer element while it stays open. */
  layerKey?: string;
  /**
   * Still entering: its entrance transform holds the layer this many px
   * below where it settles.
   */
  entering?: number;
  /**
   * At its full height the viewport fit places the layer here, higher than
   * `box` and over its trigger; any shorter, it sits at `box`.
   */
  shiftedTop?: number;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const {cap, followLayerElement} = useLayerKeyboardClearance(isOpen, layerRef);
  // The layer's box: its content height, no taller than the cap the hook
  // returned. The runtime applies the cap as the layer's own style, which its
  // block-size cap folds in; the harness applies it the same way. Below its
  // trigger the top stays; above it the bottom does.
  const height = (el: HTMLElement) => {
    const cap = parseFloat(
      el.style.getPropertyValue(LAYER_KEYBOARD_CAP_PROPERTY),
    );
    const natural = box.bottom - box.top;
    return Number.isNaN(cap) ? natural : Math.min(natural, cap);
  };
  return (
    <div
      key={layerKey}
      {...(isAnchored ? {[LAYER_ANCHORED_ATTRIBUTE]: ''} : {})}
      style={{
        ...(cap == null ? {} : {[LAYER_KEYBOARD_CAP_PROPERTY]: `${cap}px`}),
        ...(entering == null ? {} : {transform: `translateY(${entering}px)`}),
      }}
      data-testid="layer"
      ref={el => {
        layerRef.current = el;
        if (el != null) {
          // As the runtime's layer ref callback does.
          followLayerElement();
          Object.defineProperty(el, 'offsetHeight', {
            configurable: true,
            get: () => height(el),
          });
          el.getBoundingClientRect = () => {
            const h = height(el);
            // The box an engine reports carries the entrance transform.
            const shift =
              entering != null &&
              el.style.getPropertyValue('transform') !== 'none'
                ? entering
                : 0;
            const natural = box.bottom - box.top;
            const start =
              shiftedTop != null && h >= natural ? shiftedTop : box.top;
            const top = (heldBottom ? box.bottom - h : start) + shift;
            return {
              top,
              bottom: top + h,
              left: 0,
              right: 320,
              width: 320,
              height: h,
              x: 0,
              y: top,
              toJSON: () => ({}),
            };
          };
        }
      }}>
      <div
        data-testid="scroller"
        style={{overflowY: 'auto'}}
        ref={el => {
          if (el != null) {
            Object.defineProperty(el, 'scrollHeight', {
              configurable: true,
              get: () => 441,
            });
            Object.defineProperty(el, 'clientHeight', {
              configurable: true,
              get: () => height(layerRef.current ?? el),
            });
            el.getBoundingClientRect = () => {
              const h = height(layerRef.current ?? el);
              return {
                top: box.top,
                bottom: box.top + h,
                left: 0,
                right: 320,
                width: 320,
                height: h,
                x: 0,
                y: box.top,
                toJSON: () => ({}),
              };
            };
          }
        }}>
        <input
          aria-label="Title"
          ref={el => {
            if (el != null && focusRow) {
              el.getBoundingClientRect = () => ({
                top: 420,
                bottom: 444,
                left: 0,
                right: 300,
                width: 300,
                height: 24,
                x: 0,
                y: 420,
                toJSON: () => ({}),
              });
              el.focus();
            }
          }}
        />
      </div>
    </div>
  );
}

/** Runs the timers a keyboard change scheduled, inside act: they re-render. */
const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

const capOf = (container: HTMLElement) =>
  container
    .querySelector<HTMLElement>('[data-testid="layer"]')!
    .style.getPropertyValue(LAYER_KEYBOARD_CAP_PROPERTY);

describe('keyboardClearanceCap', () => {
  it('keeps the far edge 10 pt above the keyboard, and leaves a layer clear of it', () => {
    expect(LAYER_KEYBOARD_CLEARANCE_PX).toBe(10);
    expect(keyboardClearanceCap(BOX, VIEWPORT, COVER)).toBe(
      VIEWPORT - COVER - 10 - BOX.top,
    );
    expect(
      keyboardClearanceCap({top: 68, bottom: 300}, VIEWPORT, COVER),
    ).toBeNull();
    expect(keyboardClearanceCap(BOX, VIEWPORT, 0)).toBeNull();
    expect(keyboardClearanceCap({top: 400, bottom: 600}, VIEWPORT, COVER)).toBe(
      0,
    );
  });
});

/**
 * The cap a layer's own element declares: its own value of the cap property,
 * through the StyleX variable its class reads. It is never one inherited from
 * an ancestor layer.
 */
function ownCap(el: HTMLElement): string {
  const declared = getComputedStyle(el)
    .getPropertyValue(LAYER_KEYBOARD_CAP_PROPERTY)
    .trim();
  const variable = /^var\((--[^),\s]+)/.exec(declared)?.[1];
  return variable == null
    ? el.style.getPropertyValue(LAYER_KEYBOARD_CAP_PROPERTY).trim()
    : el.style.getPropertyValue(variable).trim();
}

/** A layer from the runtime that holds a second layer from the runtime. */
function NestedLayers() {
  const outer = useLayer({mode: 'context'});
  const inner = useLayer({mode: 'context'});
  return (
    <>
      <button type="button" ref={outer.ref} onClick={outer.show}>
        Outer
      </button>
      {outer.render(
        <>
          <button type="button" ref={inner.ref} onClick={inner.show}>
            Inner
          </button>
          {inner.render(<span>Inner content</span>, {className: 'inner'})}
        </>,
        {className: 'outer'},
      )}
    </>
  );
}

// A promise that never settles: a render that reads it suspends for good.
const never = new Promise<never>(() => {});

function Suspends({when}: {when: boolean}) {
  if (when) {
    use(never);
  }
  return null;
}

/**
 * A layer from the runtime whose positioning a render can change; a render
 * with `suspend` never commits.
 */
function Positioned({
  positioning,
  suspend = false,
}: {
  positioning: 'anchor' | 'custom';
  suspend?: boolean;
}) {
  const layer = useLayer({mode: 'context'});
  return (
    <>
      <button type="button" ref={layer.ref} onClick={layer.show}>
        Open
      </button>
      {layer.render(
        <>
          <Suspends when={suspend} />
          <span>Content</span>
        </>,
        {className: 'positioned', positioning},
      )}
    </>
  );
}

describe('useLayerKeyboardClearance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    guide.inset = 0;
    guide.profile = null;
    guide.listeners.clear();
    clickWaits.length = 0;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: VIEWPORT,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('caps a layer once a rising keyboard has arrived', () => {
    const {container} = render(<Harness />);
    guide.emit({kind: 'show', from: 0, to: COVER});
    // On its way up the keyboard covers the difference.
    expect(capOf(container)).toBe('');
    advance(timing.keyboardNotificationMs + 1);
    expect(capOf(container)).toBe(CAPPED);
  });

  it('caps a layer in Chrome when Gboard\u2019s slide ends, before UIKit\u2019s notification duration', () => {
    guide.profile = 'chromium';
    const {container} = render(<Harness />);
    const slide: KeyboardCurve = {durationMs: 267, points: [0.1, 0, 0, 1]};
    guide.emit({kind: 'show', from: 0, to: COVER, curve: slide});
    advance(slide.durationMs - 1);
    expect(capOf(container)).toBe('');
    advance(2);
    expect(capOf(container)).toBe(CAPPED);
    expect(slide.durationMs).toBeLessThan(timing.keyboardNotificationMs);
  });

  it('takes the cap off as soon as the keyboard starts down', () => {
    const {container} = render(<Harness />);
    guide.emit({kind: 'show', from: 0, to: COVER});
    advance(timing.keyboardNotificationMs + 1);
    guide.emit({kind: 'hide', from: COVER, to: 0});
    expect(capOf(container)).toBe('');
  });

  it('follows a keyboard that changes at once, at once', () => {
    const {container} = render(<Harness />);
    guide.emit({kind: 'change', from: 0, to: 300, animated: false});
    expect(capOf(container)).toBe(`${VIEWPORT - 300 - 10 - BOX.top}px`);
  });

  it('caps in layout px under a pinch zoom, where WebKit reports innerHeight zoomed (spec:AST-059 FR9)', () => {
    // WebKit reports innerHeight and innerWidth in the zoomed visual
    // viewport's px. Safari on iOS 26.2 reports 536 for a 714 px layout
    // viewport at a 1.33 zoom. Boxes and the keyboard's height stay in layout
    // px. A 1.5 zoom keeps the arithmetic exact.
    const zoom = 1.5;
    const saved = (['innerWidth', 'visualViewport'] as const).map(
      key => [key, Object.getOwnPropertyDescriptor(window, key)] as const,
    );
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: VIEWPORT / zoom,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 402 / zoom,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {width: 402 / zoom, height: VIEWPORT / zoom, scale: zoom},
    });
    try {
      const {container} = render(<Harness />);
      guide.emit({kind: 'change', from: 0, to: COVER, animated: false});
      expect(capOf(container)).toBe(CAPPED);
    } finally {
      for (const [key, descriptor] of saved) {
        if (descriptor == null) {
          Reflect.deleteProperty(window, key);
        } else {
          Object.defineProperty(window, key, descriptor);
        }
      }
    }
  });

  it('leaves a layer clear of the keyboard as it is', () => {
    const {container} = render(<Harness box={{top: 68, bottom: 300}} />);
    guide.emit({kind: 'show', from: 0, to: COVER});
    advance(timing.keyboardNotificationMs + 1);
    expect(capOf(container)).toBe('');
  });

  it('caps a layer the viewport fit pushed up over its trigger from where it starts once it is shorter', () => {
    const {container} = render(<Harness shiftedTop={40} />);
    guide.emit({kind: 'change', from: 0, to: COVER, animated: false});
    expect(capOf(container)).toBe(CAPPED);
  });

  it('reads a layer that is still entering without its entrance transform, in one read (spec:AST-059 FR8)', () => {
    const {container} = render(<Harness entering={40} />);
    guide.emit({kind: 'change', from: 0, to: COVER, animated: false});
    expect(capOf(container)).toBe(CAPPED);
  });

  it('leaves a layer in another positioning as it is', () => {
    const {container} = render(<Harness isAnchored={false} />);
    guide.emit({kind: 'show', from: 0, to: COVER});
    advance(timing.keyboardNotificationMs + 1);
    expect(capOf(container)).toBe('');
  });

  it('keeps the field being typed into in view in the layer\u2019s scroll container', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 0;
    });
    const {container} = render(<Harness focusRow />);
    guide.emit({kind: 'show', from: 0, to: COVER});
    advance(timing.keyboardNotificationMs + 1);
    const scroller = container.querySelector<HTMLElement>(
      '[data-testid="scroller"]',
    )!;
    // The box ends at 714 - 337 - 10 = 367; the field's bottom is at 444.
    expect(scroller.scrollTop).toBe(444 - 367);
  });

  it('caps a layer opened while a keyboard is up in the frame before it paints, and takes the cap off when it closes', () => {
    guide.inset = COVER;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    const {container, rerender} = render(<Harness />);
    // The commit sees the layer unplaced; the next frame places it.
    expect(capOf(container)).toBe('');
    act(() => {
      for (const frame of frames.splice(0)) {
        frame(0);
      }
    });
    expect(capOf(container)).toBe(CAPPED);
    rerender(<Harness isOpen={false} />);
    expect(capOf(container)).toBe('');
    expect(guide.listeners.size).toBe(0);
  });

  it('measures a layer element the runtime swaps in while open from its own box, before it paints (spec:AST-059 FR8)', () => {
    const {container, rerender} = render(<Harness />);
    guide.emit({kind: 'change', from: 0, to: COVER, animated: false});
    const before = container.querySelector<HTMLElement>(
      '[data-testid="layer"]',
    )!;
    expect(capOf(container)).toBe(CAPPED);
    guide.inset = COVER;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    // The new element sits lower than the old one: its own box decides.
    const lower = {top: 100, bottom: 600};
    rerender(<Harness layerKey="b" box={lower} />);
    const after = container.querySelector<HTMLElement>(
      '[data-testid="layer"]',
    )!;
    expect(after).not.toBe(before);
    act(() => {
      for (const frame of frames.splice(0)) {
        frame(0);
      }
    });
    expect(capOf(container)).toBe(`${VIEWPORT - COVER - 10 - lower.top}px`);
    // The keyboard going down takes the cap off the new element.
    guide.emit({kind: 'hide', from: COVER, to: 0, animated: false});
    expect(capOf(container)).toBe('');
  });

  it('measures a swapped-in layer element during a press in the layer at the press\u2019s click (spec:AST-059 FR10)', () => {
    const {container, rerender} = render(<Harness />);
    guide.inset = COVER;
    guide.emit({kind: 'change', from: 0, to: COVER, animated: false});
    expect(capOf(container)).toBe(CAPPED);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    fireEvent.pointerDown(
      container.querySelector<HTMLElement>('[data-testid="layer"]')!,
      {pointerId: 5},
    );
    const lower = {top: 100, bottom: 600};
    rerender(<Harness layerKey="b" box={lower} />);
    act(() => {
      for (const frame of frames.splice(0)) {
        frame(0);
      }
    });
    // Held for the press's click: the layer does not move under the finger.
    expect(capOf(container)).toBe(CAPPED);
    fireEvent.pointerUp(window, {pointerId: 5});
    browserClick();
    expect(capOf(container)).toBe(`${VIEWPORT - COVER - 10 - lower.top}px`);
  });

  it('leaves a layer element swapped in under a rising keyboard to the keyboard\u2019s arrival (spec:AST-059 FR10)', () => {
    const {container, rerender} = render(<Harness />);
    guide.inset = COVER;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    guide.emit({kind: 'show', from: 0, to: COVER});
    const lower = {top: 100, bottom: 600};
    rerender(<Harness layerKey="b" box={lower} />);
    act(() => {
      for (const frame of frames.splice(0)) {
        frame(0);
      }
    });
    // On its way up the keyboard covers the difference: no cap yet.
    expect(capOf(container)).toBe('');
    advance(timing.keyboardNotificationMs + 1);
    expect(capOf(container)).toBe(`${VIEWPORT - COVER - 10 - lower.top}px`);
  });

  it('follows a press in a replaced layer element to its click', () => {
    const {container, rerender} = render(<Harness />);
    guide.inset = COVER;
    guide.emit({kind: 'change', from: 0, to: COVER, animated: false});
    rerender(<Harness layerKey="b" />);
    const layer = container.querySelector<HTMLElement>(
      '[data-testid="layer"]',
    )!;
    fireEvent.pointerDown(layer, {pointerId: 1});
    guide.emit({kind: 'hide', from: COVER, to: 0});
    // Held for the press's click.
    expect(capOf(container)).toBe(CAPPED);
    fireEvent.pointerUp(layer, {pointerId: 1});
    expect(clickWaits.at(-1)?.target).toBe(layer);
    browserClick();
    expect(capOf(container)).toBe('');
  });

  it('leaves a layer whose bottom the fallback order holds (above its trigger) as it is', () => {
    const {container} = render(
      <Harness box={{top: 16, bottom: 505}} heldBottom />,
    );
    guide.emit({kind: 'show', from: 0, to: COVER});
    advance(timing.keyboardNotificationMs + 1);
    // A shorter box would move its top down and still end under the keyboard.
    expect(capOf(container)).toBe('');
  });

  it('keeps the cap through a press inside the layer until its click', () => {
    const {container, getByTestId} = render(<Harness />);
    const layer = getByTestId('layer');
    guide.emit({kind: 'show', from: 0, to: COVER});
    advance(timing.keyboardNotificationMs + 1);
    expect(capOf(container)).toBe(CAPPED);
    // A tap on a button in the layer blurs the field: the keyboard starts
    // down while the finger is still on the button.
    fireEvent.pointerDown(layer, {pointerId: 3});
    guide.emit({kind: 'hide', from: COVER, to: 0});
    expect(capOf(container)).toBe(CAPPED);
    fireEvent.pointerUp(window, {pointerId: 3});
    expect(capOf(container)).toBe(CAPPED);
    // The lift waits for the browser's click through the shared wait.
    expect(clickWaits.map(wait => wait.target)).toEqual([layer]);
    browserClick();
    expect(capOf(container)).toBe('');
  });

  it('a press that makes no click lets the change go a moment after it lifts', () => {
    const {container, getByTestId} = render(<Harness />);
    guide.emit({kind: 'show', from: 0, to: COVER});
    advance(timing.keyboardNotificationMs + 1);
    fireEvent.pointerDown(getByTestId('layer'), {pointerId: 4});
    guide.emit({kind: 'hide', from: COVER, to: 0});
    fireEvent.pointerUp(window, {pointerId: 4});
    advance(BROWSER_CLICK_WAIT_MS - 1);
    expect(capOf(container)).toBe(CAPPED);
    advance(1);
    expect(capOf(container)).toBe('');
  });

  it('a rising keyboard after the layer closed changes nothing', () => {
    const {container, rerender} = render(<Harness />);
    guide.emit({kind: 'show', from: 0, to: COVER});
    rerender(<Harness isOpen={false} />);
    advance(timing.keyboardNotificationMs + 1);
    expect(capOf(container)).toBe('');
  });

  it('follows a press to its click only while a press in the layer is live', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        added.push(type);
        add(type, listener, options);
      },
    );
    vi.spyOn(window, 'removeEventListener').mockImplementation(
      (type, listener, options) => {
        removed.push(type);
        remove(type, listener, options);
      },
    );
    const {getByTestId} = render(<Harness />);
    const press = (types: string[]) =>
      types.filter(type =>
        ['pointerup', 'pointercancel', 'click'].includes(type),
      );
    // Open: nothing on the window yet.
    expect(press(added)).toEqual([]);
    const layer = getByTestId('layer');
    fireEvent.pointerDown(layer, {pointerId: 1});
    expect(press(added)).toEqual(['pointerup', 'pointercancel']);
    fireEvent.pointerUp(layer, {pointerId: 1});
    // At the lift the shared wait listens for the browser's click.
    expect(press(added)).toEqual(['pointerup', 'pointercancel', 'click']);
    browserClick();
    expect(press(removed).sort()).toEqual([
      'click',
      'pointercancel',
      'pointerup',
    ]);
  });

  it('caps each layer on its own element, so a layer nested in a capped one is not clamped by it', () => {
    const natural = BOX.bottom - BOX.top;
    // The outer layer is tall and below its trigger; the inner one is short.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (!this.classList.contains('outer')) {
          return DOMRect.fromRect({x: 0, y: 100, width: 100, height: 40});
        }
        // Only a cap in px limits it; the uncapped limit is out of reach.
        const cap = ownCap(this);
        const height = cap.endsWith('px')
          ? Math.min(natural, parseFloat(cap))
          : natural;
        return DOMRect.fromRect({x: 0, y: BOX.top, width: 100, height});
      },
    );
    // A fixed layer is measured from its offset box.
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().top;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().height;
      },
    );
    render(<NestedLayers />);
    fireEvent.click(screen.getByText('Outer'));
    fireEvent.click(screen.getByText('Inner'));
    const outer = document.querySelector<HTMLElement>('.outer')!;
    const inner = document.querySelector<HTMLElement>('.inner')!;
    expect(outer.contains(inner)).toBe(true);
    guide.emit({kind: 'change', from: 0, to: COVER, animated: false});
    expect(ownCap(outer)).toBe(CAPPED);
    // The inner layer declares its own, uncapped limit rather than
    // inheriting the outer layer's cap.
    expect(ownCap(inner)).toBe('100vh');
    guide.emit({kind: 'hide', from: COVER, to: 0, animated: false});
    expect(ownCap(outer)).toBe('100vh');
  });

  it('decides from the positioning its last commit rendered, never from a render React threw away (react-component-runtime INV4)', () => {
    const natural = BOX.bottom - BOX.top;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (!this.classList.contains('positioned')) {
          return DOMRect.fromRect({x: 0, y: 30, width: 100, height: 30});
        }
        const cap = ownCap(this);
        const height = cap.endsWith('px')
          ? Math.min(natural, parseFloat(cap))
          : natural;
        return DOMRect.fromRect({x: 0, y: BOX.top, width: 100, height});
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().height;
      },
    );
    const {rerender} = render(<Positioned positioning="anchor" />);
    fireEvent.click(screen.getByText('Open'));
    const layer = document.querySelector<HTMLElement>('.positioned')!;
    // A transition renders the layer in custom positioning and suspends:
    // React throws that render away, and the anchored layer stays on screen.
    act(() => {
      startTransition(() => {
        rerender(<Positioned positioning="custom" suspend />);
      });
    });
    expect(document.querySelector('.positioned')).toBe(layer);
    guide.emit({kind: 'change', from: 0, to: COVER, animated: false});
    expect(ownCap(layer)).toBe(CAPPED);
  });
});
