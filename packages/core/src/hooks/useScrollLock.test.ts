// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollLock.test.ts
 * @input Uses vitest, @testing-library/react, useScrollLock hook
 * @output Unit tests for single and concurrent useScrollLock instances: the
 *   root's overflow claim, the untouched scroll offset, the touch guard and the
 *   scrollbar gutter
 * @position Testing; validates useScrollLock.ts implementation
 *
 * SYNC: When useScrollLock.ts changes, update tests to match new behavior
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, renderHook} from '@testing-library/react';
import {useScrollLock} from './useScrollLock';
import {isScrollLockActive, subscribeScrollLock} from './rootScrollStyles';
import {isPanAbsorbedBeforePage} from './scrollLockTouchGuard';
import {
  coarsePrimaryPointer,
  pointerQuery,
} from '../gestures/__tests__/pointerQuery';

/**
 * A one-finger (or `fingers`-finger) touch event at (x, y) on `target`. Every
 * touch reuses identifier 0, as Chrome for Android does for each new touch.
 */
function touch(
  target: EventTarget,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number,
  fingers = 1,
): Event {
  if (type === 'touchstart') {
    // A browser sends a contact's pointerdown before its touchstart; the page
    // hold reads the primary pointer at a hold's first touch contact.
    const down = new Event('pointerdown', {bubbles: true, composed: true});
    Object.assign(down, {
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
      clientX: x,
      clientY: y,
    });
    target.dispatchEvent(down);
  }
  // Touch events are composed: they leave shadow roots, retargeted to the host.
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const point = {clientX: x, clientY: y, identifier: 0, target};
  // As a browser does: `touches` lists the fingers still down (none once the
  // finger lifts), `changedTouches` the one this event is about.
  Object.defineProperty(event, 'touches', {
    value:
      type === 'touchend' ? [] : Array.from({length: fingers}, () => point),
  });
  Object.defineProperty(event, 'changedTouches', {value: [point]});
  target.dispatchEvent(event);
  return event;
}

/**
 * A pan from (x, y0) to (x, y1) that lifts at the end, returning whether its
 * move was cancelled.
 */
function pan(target: EventTarget, y0: number, y1: number, fingers = 1) {
  touch(target, 'touchstart', 100, y0, fingers);
  const move = touch(target, 'touchmove', 100, y1, fingers);
  touch(target, 'touchend', 100, y1, fingers);
  return move.defaultPrevented;
}

/** A vertical scroller with `overflow` px to scroll, scrolled to `top`. */
function scroller(
  overflow: number,
  top: number,
  overscrollBehaviorY = 'auto',
): HTMLElement {
  const element = document.createElement('div');
  element.style.overflowY = 'auto';
  element.style.overscrollBehaviorY = overscrollBehaviorY;
  Object.defineProperty(element, 'clientHeight', {value: 200});
  Object.defineProperty(element, 'scrollHeight', {value: 200 + overflow});
  element.scrollTop = top;
  document.body.append(element);
  return element;
}

const originalCss = Object.getOwnPropertyDescriptor(window, 'CSS');

/**
 * A desktop page with a classic scrollbar: a 1024px window over a 1009px
 * layout viewport (a 15px scrollbar), on an engine with `scrollbar-gutter`.
 */
function classicScrollbar(clientWidth = 1009): void {
  Object.defineProperty(window, 'innerWidth', {
    value: 1024,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  });
  Object.defineProperty(window, 'CSS', {
    value: {
      supports: (property: string, value: string) =>
        property === 'scrollbar-gutter' && value === 'stable',
    },
    configurable: true,
    writable: true,
  });
}

/**
 * An engine whose `CSS.supports('selector(…)')` knows these selectors, on
 * top of whatever `CSS.supports` already answered.
 */
function supportSelectors(selectors: ReadonlyArray<string>): void {
  const previous = window.CSS;
  Object.defineProperty(window, 'CSS', {
    value: {
      supports: (...args: [string] | [string, string]) =>
        args.length === 1
          ? selectors.some(selector => args[0] === `selector(${selector})`)
          : (previous?.supports(args[0], args[1]) ?? false),
    },
    configurable: true,
    writable: true,
  });
}

describe('useScrollLock', () => {
  afterEach(() => {
    cleanup();
    document.body.style.cssText = '';
    document.body.replaceChildren();
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the viewport stub so jsdom's own value comes back
    delete document.documentElement.clientWidth;
    if (originalCss) {
      Object.defineProperty(window, 'CSS', originalCss);
    } else {
      Reflect.deleteProperty(window, 'CSS');
    }
    vi.restoreAllMocks();
  });

  it('hides the page overflow while locked and gives the page its own value back', () => {
    document.documentElement.style.overflow = 'auto';

    const lock = renderHook(() => useScrollLock(true));
    expect(document.documentElement.style.overflow).toBe('hidden');

    lock.unmount();
    expect(document.documentElement.style.overflow).toBe('auto');
  });

  it("turns the page's overscroll off on the root and the body while locked, so a pull cannot refresh the page behind the overlay", () => {
    const {unmount} = renderHook(() => useScrollLock(true));
    expect(document.documentElement.style.overscrollBehaviorY).toBe('none');
    expect(document.body.style.overscrollBehaviorY).toBe('none');

    unmount();
    expect(document.documentElement.style.overscrollBehaviorY).toBe('');
    expect(document.body.style.overscrollBehaviorY).toBe('');
  });

  it('never moves the page: no body pinning, no scroll restore', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(480);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const lock = renderHook(() => useScrollLock(true));
    // The body carries only the overscroll mirror, never a pin.
    expect(document.body.style.cssText).toBe('overscroll-behavior-y: none;');

    lock.unmount();
    expect(document.body.style.cssText).toBe('');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('leaves the page alone when it is not locked', () => {
    const lock = renderHook(() => useScrollLock(false));

    expect(document.documentElement.style.overflow).toBe('');
    expect(isScrollLockActive()).toBe(false);
    lock.unmount();
  });

  it('keeps one lock in place across rerenders with the same value', () => {
    const changes = vi.fn();
    const unsubscribe = subscribeScrollLock(changes);
    const lock = renderHook(({locked}) => useScrollLock(locked), {
      initialProps: {locked: true},
    });

    lock.rerender({locked: true});
    lock.rerender({locked: true});

    expect(changes).toHaveBeenCalledTimes(1);
    expect(isScrollLockActive()).toBe(true);
    lock.unmount();
    unsubscribe();
  });

  it('stays locked while a second overlay is still open, even if the first closes out of order', () => {
    const first = renderHook(() => useScrollLock(true));
    const second = renderHook(() => useScrollLock(true));

    first.unmount();

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(isScrollLockActive()).toBe(true);

    second.unmount();

    expect(document.documentElement.style.overflow).toBe('');
    expect(isScrollLockActive()).toBe(false);
  });

  it('reports the page becoming locked and free', () => {
    const states: boolean[] = [];
    const unsubscribe = subscribeScrollLock(() =>
      states.push(isScrollLockActive()),
    );

    const lock = renderHook(({locked}) => useScrollLock(locked), {
      initialProps: {locked: true},
    });
    lock.rerender({locked: false});

    expect(states).toEqual([true, false]);
    unsubscribe();
  });

  describe('touch guard', () => {
    // A phone or tablet: the page hold listens only where the primary pointer
    // is coarse (`spec:AST-094` FR19), and jsdom models a desktop.
    let restorePointer: () => void = () => {};
    beforeEach(() => {
      restorePointer = coarsePrimaryPointer();
    });
    afterEach(() => {
      restorePointer();
    });

    it('cancels a one-finger pan that no scroller under the finger can take', () => {
      const scrim = document.createElement('div');
      document.body.append(scrim);
      renderHook(() => useScrollLock(true));

      expect(pan(scrim, 300, 200)).toBe(true);
    });

    it('lets a one-finger drag through on a pinch-zoomed page, so a zoomed-in reader can pan around the overlay', () => {
      const scrim = document.createElement('div');
      document.body.append(scrim);
      const zoom = {scale: 2};
      Object.defineProperty(window, 'visualViewport', {
        value: zoom,
        configurable: true,
      });
      try {
        renderHook(() => useScrollLock(true));

        expect(pan(scrim, 300, 200)).toBe(false);

        // Read per touch: back at 1x, the same lock holds the page again.
        zoom.scale = 1;
        expect(pan(scrim, 300, 200)).toBe(true);
      } finally {
        Reflect.deleteProperty(window, 'visualViewport');
      }
    });

    it('lets a drag on a native range input through, so the slider follows the finger', () => {
      const dialog = document.createElement('dialog');
      const slider = document.createElement('input');
      slider.type = 'range';
      dialog.append(slider);
      document.body.append(dialog);
      renderHook(() => useScrollLock(true));

      // Along the slider, and along the page's axis alike: the input takes
      // the drag, so it never scrolls the page (spec:AST-094 FR19).
      touch(slider, 'touchstart', 100, 200);
      expect(touch(slider, 'touchmove', 240, 200).defaultPrevented).toBe(false);
      touch(slider, 'touchend', 240, 200);
      expect(pan(slider, 300, 200)).toBe(false);

      // A disabled slider takes nothing: the drag is the page's, and held.
      slider.disabled = true;
      expect(pan(slider, 300, 200)).toBe(true);
    });

    it('lets a pan through when a scroller under the finger can move that way', () => {
      const list = scroller(400, 100);
      const row = document.createElement('div');
      list.append(row);
      renderHook(() => useScrollLock(true));

      expect(pan(row, 300, 200)).toBe(false);
      expect(pan(row, 200, 300)).toBe(false);
    });

    it('cancels a pan on a scroller whose content fits', () => {
      const body = scroller(0, 0);
      renderHook(() => useScrollLock(true));

      expect(pan(body, 300, 200)).toBe(true);
    });

    it('cancels a pan past a scroller edge that would chain to the page', () => {
      const list = scroller(400, 0);
      renderHook(() => useScrollLock(true));

      // At the top, a finger moving down has nothing left to scroll in the list.
      expect(pan(list, 200, 300)).toBe(true);
    });

    it('lets a pan through at an edge when the scroller keeps its own overscroll', () => {
      const list = scroller(400, 0, 'contain');
      renderHook(() => useScrollLock(true));

      expect(pan(list, 200, 300)).toBe(false);
    });

    describe('an overlay rendered inside a scrolling container', () => {
      /**
       * An open modal dialog: jsdom has no top layer, so `:modal` is stubbed,
       * on an engine that knows it.
       */
      function modalDialog(parent: HTMLElement): HTMLDialogElement {
        supportSelectors([':modal', ':popover-open']);
        const dialog = document.createElement('dialog');
        dialog.setAttribute('open', '');
        const matches = Element.prototype.matches;
        vi.spyOn(dialog, 'matches').mockImplementation(
          selector => selector === ':modal' || matches.call(dialog, selector),
        );
        parent.append(dialog);
        return dialog;
      }

      it("cancels a scrim drag: a modal dialog's untaken pans go to the page, not to the container", () => {
        const container = scroller(400, 100);
        const dialog = modalDialog(container);
        renderHook(() => useScrollLock(true));

        expect(pan(dialog, 300, 200)).toBe(true);
        expect(pan(dialog, 200, 300)).toBe(true);
      });

      it('never asks an engine without `:modal` or `:popover-open` to match them: it has no element in either state', () => {
        supportSelectors([]);
        const container = scroller(400, 100);
        const dialog = document.createElement('dialog');
        dialog.setAttribute('open', '');
        container.append(dialog);
        const matches = vi.spyOn(dialog, 'matches');
        renderHook(() => useScrollLock(true));

        pan(dialog, 300, 200);
        const asked = matches.mock.calls.map(call => call[0]);
        expect(asked).not.toContain(':modal');
        expect(asked).not.toContain(':popover-open');
      });

      it('lets an error from a state the engine reports knowing surface: nothing is caught and defaulted', () => {
        supportSelectors([':modal', ':popover-open']);
        const dialog = document.createElement('dialog');
        document.body.append(dialog);
        const matches = Element.prototype.matches;
        vi.spyOn(dialog, 'matches').mockImplementation(selector => {
          if (selector === ':modal') {
            throw new DOMException('the engine failed', 'SyntaxError');
          }
          return matches.call(dialog, selector);
        });

        expect(() => isPanAbsorbedBeforePage(dialog, 0, 50)).toThrow(
          'the engine failed',
        );
      });

      it('cancels a drag on a fixed-position overlay inside the container', () => {
        const container = scroller(400, 100);
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        container.append(overlay);
        renderHook(() => useScrollLock(true));

        expect(pan(overlay, 300, 200)).toBe(true);
      });

      it('still lets a pan through to a scroller inside the dialog, or the dialog itself', () => {
        const container = scroller(400, 100);
        const dialog = modalDialog(container);
        const list = scroller(400, 100);
        const row = document.createElement('div');
        list.append(row);
        dialog.append(list);
        renderHook(() => useScrollLock(true));

        expect(pan(row, 300, 200)).toBe(false);

        const scrolling = modalDialog(container);
        scrolling.style.overflowY = 'auto';
        Object.defineProperty(scrolling, 'clientHeight', {value: 200});
        Object.defineProperty(scrolling, 'scrollHeight', {value: 600});
        scrolling.scrollTop = 100;
        expect(pan(scrolling, 300, 200)).toBe(false);
      });
    });

    it('lets a pan through when the scroller under the finger is inside a shadow root', () => {
      const host = document.createElement('div');
      document.body.append(host);
      const list = document.createElement('div');
      list.style.overflowY = 'auto';
      Object.defineProperty(list, 'clientHeight', {value: 200});
      Object.defineProperty(list, 'scrollHeight', {value: 600});
      list.scrollTop = 100;
      const row = document.createElement('div');
      list.append(row);
      host.attachShadow({mode: 'open'}).append(list);
      renderHook(() => useScrollLock(true));

      expect(pan(row, 300, 200)).toBe(false);
    });

    it('judges a swipe after a small slop, so a first wobble does not cancel a horizontal scroll', () => {
      const strip = document.createElement('div');
      strip.style.overflowX = 'auto';
      Object.defineProperty(strip, 'clientWidth', {value: 200});
      Object.defineProperty(strip, 'scrollWidth', {value: 600});
      strip.scrollLeft = 100;
      document.body.append(strip);
      renderHook(() => useScrollLock(true));

      touch(strip, 'touchstart', 100, 300);
      const wobble = new Event('touchmove', {
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      const point = (x: number, y: number) => [
        {clientX: x, clientY: y, identifier: 0, target: strip},
      ];
      Object.defineProperty(wobble, 'touches', {value: point(102, 302)});
      strip.dispatchEvent(wobble);
      const swipe = new Event('touchmove', {
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      Object.defineProperty(swipe, 'touches', {value: point(80, 303)});
      strip.dispatchEvent(swipe);

      expect(wobble.defaultPrevented).toBe(false);
      expect(swipe.defaultPrevented).toBe(false);
    });

    it('never cancels a two-finger gesture, so pinch-zoom keeps working', () => {
      const scrim = document.createElement('div');
      document.body.append(scrim);
      renderHook(() => useScrollLock(true));

      expect(pan(scrim, 300, 200, 2)).toBe(false);
    });

    it('decides once per touch, as the browser picks its scroller once', () => {
      const list = scroller(400, 100);
      renderHook(() => useScrollLock(true));

      touch(list, 'touchstart', 100, 300);
      expect(touch(list, 'touchmove', 100, 250).defaultPrevented).toBe(false);
      // The list reaching its end mid-gesture does not flip the verdict.
      list.scrollTop = 400;
      expect(touch(list, 'touchmove', 100, 200).defaultPrevented).toBe(false);
    });

    it('is gone once the last lock is released', () => {
      const scrim = document.createElement('div');
      document.body.append(scrim);
      const first = renderHook(() => useScrollLock(true));
      const second = renderHook(() => useScrollLock(true));

      first.unmount();
      expect(pan(scrim, 300, 200)).toBe(true);

      second.unmount();
      expect(pan(scrim, 300, 200)).toBe(false);
    });

    it('holds no touch where the primary pointer is fine, and starts once it turns coarse', () => {
      restorePointer();
      const pointer = pointerQuery(false);
      restorePointer = pointer.restore;
      const scrim = document.createElement('div');
      document.body.append(scrim);
      renderHook(() => useScrollLock(true));

      // A touchscreen whose primary pointer is fine keeps the browser's own
      // touch behavior; `overflow: hidden` still stops wheel and keyboard.
      expect(pan(scrim, 300, 200)).toBe(false);
      expect(document.documentElement.style.overflow).toBe('hidden');

      pointer.set(true);
      expect(pan(scrim, 300, 200)).toBe(true);
    });
  });

  it('holds the page still across the scrollbar it hides', () => {
    // Hiding the page overflow hides the classic scrollbar, which would widen
    // the page by its 15px and reflow everything sideways.
    classicScrollbar();

    const lock = renderHook(() => useScrollLock(true));

    expect(document.documentElement.style.scrollbarGutter).toBe('stable');

    lock.unmount();

    expect(document.documentElement.style.scrollbarGutter).toBe('');
  });

  it('leaves the page alone when the scrollbar is an overlay one', () => {
    classicScrollbar(1024);

    const lock = renderHook(() => useScrollLock(true));

    expect(document.documentElement.style.scrollbarGutter).toBe('');
    expect(document.documentElement.style.paddingRight).toBe('');

    lock.unmount();
  });

  it('holds the gutter for the outermost overlay only, and gives it back once', () => {
    classicScrollbar();

    const first = renderHook(() => useScrollLock(true));
    const second = renderHook(() => useScrollLock(true));

    expect(document.documentElement.style.scrollbarGutter).toBe('stable');

    first.unmount();

    expect(document.documentElement.style.scrollbarGutter).toBe('stable');

    second.unmount();

    expect(document.documentElement.style.scrollbarGutter).toBe('');
  });
});
