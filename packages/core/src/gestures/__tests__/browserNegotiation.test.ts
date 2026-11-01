// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file browserNegotiation.test.ts
 * @input Recognizer sets, touch-action strings, and jsdom elements with
 *   scripted scroll metrics
 * @output What the browser is told (touch-action and long-press styles) and
 *   what the native scroll probe answers (edges, touch-action, chaining,
 *   RTL)
 * @position Unit tests of touchAction.ts and nativeScroll.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {createNativeScrollProbe, parseTouchAction} from '../nativeScroll';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {PinchGestureRecognizer} from '../PinchGestureRecognizer';
import {ScreenEdgePanGestureRecognizer} from '../ScreenEdgePanGestureRecognizer';
import {SwipeGestureRecognizer} from '../SwipeGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {
  deriveTouchAction,
  gestureHostStyle,
  holdSelectionStyle,
} from '../touchAction';

describe('deriveTouchAction', () => {
  it('needs nothing without touch recognizers', () => {
    expect(deriveTouchAction([])).toBeNull();
    expect(
      deriveTouchAction([
        new PanGestureRecognizer({allowedPointerTypes: ['mouse']}),
      ]),
    ).toBeNull();
  });

  it('removes only double-tap zoom for taps and long presses', () => {
    expect(deriveTouchAction([new TapGestureRecognizer()])).toBe(
      'manipulation',
    );
    expect(deriveTouchAction([new LongPressGestureRecognizer()])).toBe(
      'manipulation',
    );
  });

  it('gives the browser the other axis of a one-axis pan or swipe, and keeps pinch-zoom', () => {
    expect(
      deriveTouchAction([new PanGestureRecognizer({direction: 'horizontal'})]),
    ).toBe('pan-y pinch-zoom');
    expect(
      deriveTouchAction([new PanGestureRecognizer({direction: 'vertical'})]),
    ).toBe('pan-x pinch-zoom');
    expect(deriveTouchAction([new PanGestureRecognizer()])).toBe('pinch-zoom');
    expect(
      deriveTouchAction([new SwipeGestureRecognizer({direction: 'left'})]),
    ).toBe('pan-y pinch-zoom');
  });

  it('leaves the browser everything for a one-way pan, or one that shares native scrolling', () => {
    // The other direction keeps scrolling natively; the pan claims its own
    // by cancelling touchmove when it begins.
    expect(
      deriveTouchAction([new PanGestureRecognizer({direction: 'down'})]),
    ).toBeNull();
    // A screen-edge pan from one edge goes one way, inward (spec:AST-094 FR18).
    expect(
      deriveTouchAction([
        new ScreenEdgePanGestureRecognizer({edges: ['leading']}),
      ]),
    ).toBeNull();
    expect(
      deriveTouchAction([
        new PanGestureRecognizer({direction: 'down', scrollEdge: true}),
      ]),
    ).toBeNull();
    expect(
      deriveTouchAction([
        new PanGestureRecognizer({direction: 'down', scrollEdge: true}),
        new TapGestureRecognizer(),
      ]),
    ).toBe('manipulation');
  });

  it('takes pinch-zoom only for a pinch recognizer', () => {
    expect(deriveTouchAction([new PinchGestureRecognizer()])).toBe(
      'pan-x pan-y',
    );
    expect(
      deriveTouchAction([
        new PinchGestureRecognizer(),
        new PanGestureRecognizer(),
      ]),
    ).toBe('none');
  });

  it('intersects every recognizer on the element', () => {
    expect(
      deriveTouchAction([
        new TapGestureRecognizer(),
        new PanGestureRecognizer({direction: 'horizontal'}),
      ]),
    ).toBe('pan-y pinch-zoom');
  });

  it('locks selection only for a held press, never on the element (spec:AST-094 FR41)', () => {
    // The attached style is the touch-action alone: a mouse and a keyboard
    // keep selecting (spec:AST-017 FR59).
    expect(gestureHostStyle([new LongPressGestureRecognizer()])).toEqual({
      touchAction: 'manipulation',
    });
    // The host applies this for one press, from touch-down to the lift.
    expect(holdSelectionStyle([new LongPressGestureRecognizer()])).toEqual({
      WebkitTouchCallout: 'none',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    });
    // A hold that does nothing selects natively.
    expect(holdSelectionStyle([new TapGestureRecognizer()])).toBeNull();
  });
});

describe('parseTouchAction', () => {
  it('reads the pans each value allows', () => {
    expect(parseTouchAction('auto')).toEqual({x: true, y: true});
    expect(parseTouchAction('manipulation')).toEqual({x: true, y: true});
    expect(parseTouchAction('none')).toEqual({x: false, y: false});
    expect(parseTouchAction('pan-y pinch-zoom')).toEqual({x: false, y: true});
    expect(parseTouchAction('pan-left')).toEqual({x: true, y: false});
    expect(parseTouchAction('pinch-zoom')).toEqual({x: false, y: false});
  });
});

/** Give an element the scroll metrics jsdom cannot lay out. */
function scroller(
  element: HTMLElement,
  metrics: {
    scrollTop?: number;
    scrollHeight?: number;
    clientHeight?: number;
    scrollLeft?: number;
    scrollWidth?: number;
    clientWidth?: number;
  },
): void {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {configurable: true, value});
  }
}

/**
 * jsdom drops `touch-action` from styles, so the elements under test carry
 * it in `data-touch-action` and computed style reports it from there.
 */
function withTouchActionFromData(): () => void {
  const original = window.getComputedStyle.bind(window);
  const spy = vi
    .spyOn(window, 'getComputedStyle')
    .mockImplementation((element: Element, pseudo?: string | null) => {
      const style = original(element, pseudo);
      const touchAction = element.getAttribute('data-touch-action');
      if (touchAction == null) {
        return style;
      }
      return new Proxy(style, {
        get(target, key): string | number | object | null | undefined {
          if (key === 'touchAction') {
            return touchAction;
          }
          const value = Reflect.get(target, key) as
            string | number | object | null | undefined;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
  return () => spy.mockRestore();
}

describe('createNativeScrollProbe', () => {
  let restore: () => void = () => {};
  beforeEach(() => {
    restore = withTouchActionFromData();
  });
  afterEach(() => {
    restore();
    document.body.innerHTML = '';
    document.documentElement.style.overflow = '';
  });

  function setup(listStyle: string) {
    // The page itself does not scroll in these cases.
    document.documentElement.style.overflow = 'hidden';
    document.body.innerHTML = `<div id="list" style="${listStyle}"><button id="row">Row</button></div>`;
    const list = document.getElementById('list') as HTMLElement;
    const row = document.getElementById('row') as HTMLElement;
    return {list, row};
  }

  it('answers by edge: at the top a pull down scrolls nothing, a pull up does', () => {
    const {list, row} = setup('overflow-y: auto');
    scroller(list, {scrollTop: 0, scrollHeight: 1000, clientHeight: 400});
    const probe = createNativeScrollProbe(row);
    expect(probe.canScroll(0, 20)).toBe(false);
    expect(probe.canScroll(0, -20)).toBe(true);
    expect(probe.isInsideScroller).toBe(true);
    scroller(list, {scrollTop: 600});
    expect(probe.canScroll(0, -20)).toBe(false);
    expect(probe.canScroll(0, 20)).toBe(true);
  });

  it('finds a scroller in a shadow tree around the slot a light-DOM row is slotted into', () => {
    document.documentElement.style.overflow = 'hidden';
    document.body.innerHTML =
      '<div id="host"><button id="row">Row</button></div>';
    const host = document.getElementById('host') as HTMLElement;
    const row = document.getElementById('row') as HTMLElement;
    const shadow = host.attachShadow({mode: 'open'});
    shadow.innerHTML =
      '<div id="list" style="overflow-y: auto"><slot></slot></div>';
    const list = shadow.getElementById('list') as HTMLElement;
    scroller(list, {scrollTop: 0, scrollHeight: 1000, clientHeight: 400});
    const probe = createNativeScrollProbe(row);
    expect(probe.isInsideScroller).toBe(true);
    expect(probe.canScroll(0, -20)).toBe(true);
  });

  it('puts a control in a fixed bar outside the page it floats over (spec:AST-094 FR11)', () => {
    document.body.innerHTML =
      '<div id="bar" style="position: fixed"><button id="row">Row</button></div>';
    const root = document.scrollingElement ?? document.documentElement;
    scroller(root as HTMLElement, {
      scrollTop: 0,
      scrollHeight: 3000,
      clientHeight: 800,
    });
    const probe = createNativeScrollProbe(document.getElementById('row'));
    // The page still scrolls under a drag that starts on the bar, but the bar
    // is not in a scroll view, so its control gets no content-touch delay.
    expect(probe.isInsideScroller).toBe(false);
    expect(probe.canScroll(0, -20)).toBe(true);
    for (const key of ['scrollTop', 'scrollHeight', 'clientHeight']) {
      Reflect.deleteProperty(root, key);
    }
  });

  it('honors touch-action between the touch and the scroller', () => {
    const {list, row} = setup('overflow-y: auto');
    row.setAttribute('data-touch-action', 'pan-x');
    scroller(list, {scrollTop: 100, scrollHeight: 1000, clientHeight: 400});
    const probe = createNativeScrollProbe(row);
    expect(probe.canScroll(0, 20)).toBe(false);
    expect(probe.allowsNativePan).toBe(true);
    row.setAttribute('data-touch-action', 'none');
    expect(createNativeScrollProbe(row).allowsNativePan).toBe(false);
  });

  it('ignores the wobble of a mostly straight drag', () => {
    const {list, row} = setup('overflow-x: auto; overflow-y: hidden');
    scroller(list, {scrollLeft: 50, scrollWidth: 1000, clientWidth: 300});
    const probe = createNativeScrollProbe(row);
    expect(probe.canScroll(2, 30)).toBe(false);
    expect(probe.canScroll(30, 2)).toBe(true);
  });

  it('follows the RTL scrollLeft range', () => {
    const {list, row} = setup(
      'overflow-x: auto; overflow-y: hidden; direction: rtl',
    );
    // RTL starts at 0 and runs negative toward the inline end (the left).
    scroller(list, {scrollLeft: 0, scrollWidth: 1000, clientWidth: 300});
    const probe = createNativeScrollProbe(row);
    expect(probe.canScroll(30, 0)).toBe(true); // reveals content on the left
    expect(probe.canScroll(-30, 0)).toBe(false);
    scroller(list, {scrollLeft: -700});
    expect(probe.canScroll(30, 0)).toBe(false);
  });

  it('stops the chain at overscroll-behavior: contain', () => {
    document.documentElement.style.overflow = '';
    document.body.innerHTML = `<div id="outer" style="overflow-y: auto"><div id="inner" style="overflow-y: auto; overscroll-behavior: contain"><span id="t">x</span></div></div>`;
    const outer = document.getElementById('outer') as HTMLElement;
    const inner = document.getElementById('inner') as HTMLElement;
    scroller(outer, {scrollTop: 300, scrollHeight: 2000, clientHeight: 500});
    scroller(inner, {scrollTop: 0, scrollHeight: 800, clientHeight: 400});
    const probe = createNativeScrollProbe(document.getElementById('t'));
    // The inner list is at its top and contains its overscroll: a pull
    // down reaches nothing, though the outer one could scroll.
    expect(probe.canScroll(0, 20)).toBe(false);
    inner.style.overscrollBehavior = 'auto';
    expect(
      createNativeScrollProbe(document.getElementById('t')).canScroll(0, 20),
    ).toBe(true);
  });
});
