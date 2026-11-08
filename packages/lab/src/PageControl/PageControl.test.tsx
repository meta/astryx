// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PageControl.test.tsx
 * @input vitest (jsdom), Testing Library, PageControl
 * @output Proves the semantics, the keyboard, the measured geometry and
 *   alphas, the width cap, the window it renders and hidesForSinglePage
 * @position Testing; the real-touch proofs are
 *   __tests__/PageControl.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRef, useState} from 'react';
import {renderToString} from 'react-dom/server';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {PageControl} from './PageControl';
import {SWITCH} from './pageControlModel';

/**
 * The pointer and the Reduce Motion setting a case runs under, read live by
 * every media query list the stub below returns. Core's gesture host asks for
 * its `(pointer: coarse)` list once, when the document's host is created. It
 * keeps that list for the whole file. A list that froze its answer would
 * carry the first case's pointer into every later case.
 */
const media: {pointer: 'default' | 'coarse' | 'fine'; reduced: boolean} = {
  pointer: 'default',
  reduced: false,
};

function matchesNow(query: string): boolean {
  if (media.pointer === 'default') {
    // As the shared test setup's polyfill answers: a mouse-driven desktop
    // that hovers.
    return /\(\s*hover\s*:\s*hover\s*\)/.test(query);
  }
  return (
    (media.pointer === 'coarse' && query.includes('pointer: coarse')) ||
    (media.pointer === 'fine' && query.includes('pointer: fine')) ||
    (media.reduced && query.includes('prefers-reduced-motion: reduce'))
  );
}

beforeEach(() => {
  media.pointer = 'default';
  media.reduced = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return matchesNow(query);
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

/**
 * A finger: a coarse primary pointer, on any engine (one touch model; nothing
 * asks for iOS); `reduced` turns Reduce Motion on.
 */
function asTouch({reduced = false}: {reduced?: boolean} = {}) {
  media.pointer = 'coarse';
  media.reduced = reduced;
}

/** A mouse: a fine primary pointer, on any engine. */
function asMouse() {
  media.pointer = 'fine';
  media.reduced = false;
  // The case's pointer, as the control will read it.
  expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderControl(
  props: Partial<React.ComponentProps<typeof PageControl>> = {},
) {
  const onChange = vi.fn();
  const result = render(
    <PageControl totalPages={5} page={3} onChange={onChange} {...props} />,
  );
  return {onChange, ...result};
}

/**
 * A tap at `x` on `target`, through the gesture host's touch path. In jsdom,
 * boxes are 0 px wide, so any x > 0 is the trailing side of the current dot.
 */
function tap(target: Element, x: number) {
  for (const type of ['touchstart', 'touchend'] as const) {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const contact = {identifier: 1, clientX: x, clientY: 10, target};
    Object.defineProperty(event, 'changedTouches', {value: [contact]});
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [contact],
    });
    target.dispatchEvent(event);
  }
}

/**
 * A finger's swipe on `target` from `from` to `to` through the gesture host's
 * touch path, in `steps` moves. Returns whether any move was cancelled: a
 * cancelled move is one the page cannot scroll with.
 */
function swipe(
  target: Element,
  from: {x: number; y: number},
  to: {x: number; y: number},
  steps = 10,
): boolean {
  let cancelled = false;
  const send = (
    type: 'touchstart' | 'touchmove' | 'touchend',
    point: {x: number; y: number},
  ) => {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const contact = {identifier: 1, clientX: point.x, clientY: point.y, target};
    Object.defineProperty(event, 'changedTouches', {value: [contact]});
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [contact],
    });
    target.dispatchEvent(event);
    if (type === 'touchmove' && event.defaultPrevented) {
      cancelled = true;
    }
  };
  send('touchstart', from);
  for (let i = 1; i <= steps; i++) {
    send('touchmove', {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    });
  }
  send('touchend', to);
  return cancelled;
}

/** A mouse pointer event at `x` for the gesture host (jsdom has no PointerEvent). */
function mouse(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  pointerType: 'mouse' | 'pen' = 'mouse',
) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const fields: Record<string, unknown> = {
    pointerType,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: 10,
  };
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(event, key, {value});
  }
  target.dispatchEvent(event);
}

/**
 * A mouse's click at `x`, pressed at `fromX`. The press and release reach the
 * gesture host, which listens to every pointer. The browser sends its click
 * after them.
 */
function click(target: Element, x: number, fromX = x) {
  mouse(target, 'pointerdown', fromX);
  if (x !== fromX) {
    mouse(target, 'pointermove', x);
  }
  mouse(target, 'pointerup', x);
  fireEvent.click(target, {clientX: x, clientY: 10});
}

/**
 * Lays the row out for jsdom: page `i`'s dot 10 px wide at 100 + 16·i, the
 * control from 80 to 280.
 */
function layOutRow() {
  return vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element) {
      const page = this.getAttribute('data-page');
      if (page != null) {
        return new DOMRect(100 + 16 * Number(page), 0, 10, 10);
      }
      if (this.getAttribute('role') === 'slider') {
        return new DOMRect(80, 0, 200, 30);
      }
      return new DOMRect(0, 0, 0, 0);
    });
}

/** WCAG contrast of `fg` at `alpha` over `bg` against `bg`. */
function contrastOver(fg: number[], bg: number[], alpha: number): number {
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map(value => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const mixed = fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
  return (luminance(bg) + 0.05) / (luminance(mixed) + 0.05);
}

describe('PageControl', () => {
  it('is one slider named "Page indicators" that reads "Page 3 of 5"', () => {
    renderControl();
    const slider = screen.getByRole('slider', {name: 'Page indicators'});
    expect(slider).toHaveAttribute('aria-valuemin', '1');
    expect(slider).toHaveAttribute('aria-valuemax', '5');
    expect(slider).toHaveAttribute('aria-valuenow', '3');
    expect(slider).toHaveAttribute('aria-valuetext', 'Page 3 of 5');
    expect(slider).toHaveAttribute('tabindex', '0');
  });

  it('takes a custom label', () => {
    renderControl({label: 'Onboarding'});
    expect(
      screen.getByRole('slider', {name: 'Onboarding'}),
    ).toBeInTheDocument();
  });

  it('arrow keys, Home and End ask for a page', () => {
    const {onChange} = renderControl();
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, {key: 'ArrowRight'});
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(slider, {key: 'ArrowLeft'});
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(slider, {key: 'ArrowUp'});
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(slider, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(slider, {key: 'Home'});
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(slider, {key: 'End'});
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('mirrors the horizontal arrows in RTL', () => {
    const onChange = vi.fn();
    // jsdom does not inherit `direction`: set it on the control itself.
    render(
      <PageControl
        totalPages={5}
        page={3}
        onChange={onChange}
        style={{direction: 'rtl'}}
      />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, {key: 'ArrowRight'});
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(slider, {key: 'ArrowLeft'});
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('asks for nothing past the first or last page', () => {
    const {onChange} = renderControl({page: 5});
    fireEvent.keyDown(screen.getByRole('slider'), {key: 'ArrowRight'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it("draws UIPageControl's geometry: 9.67 px indicators, the current one opaque, the others at 48 % (UIKit's 45 % raised to 3:1)", () => {
    renderControl();
    const slider = screen.getByRole('slider');
    expect(slider.style.height).toBe('25.67px');
    expect(slider.style.width).toBe('108.35px');
    const indicators = Array.from(
      slider.querySelectorAll<HTMLElement>('[data-page]'),
    );
    expect(indicators).toHaveLength(5);
    // A 10 px box scaled to 9.67 px: round wherever it falls (see the browser
    // proof "every indicator paints round").
    expect(indicators[0].style.width).toBe('10px');
    // The animator writes `scale` as "x y".
    expect(Number.parseFloat(indicators[0].style.scale) * 10).toBeCloseTo(
      9.67,
      3,
    );
    expect(indicators.map(i => i.style.opacity)).toEqual([
      '0.48',
      '0.48',
      '1',
      '0.48',
      '0.48',
    ]);
  });

  it('never grows wider than 161.3 px; under a finger, with more than ten pages it renders the window around the current page', () => {
    asTouch();
    renderControl({totalPages: 50, page: 26});
    const slider = screen.getByRole('slider');
    expect(slider.style.width).toBe('161.3px');
    // `data-page` counts from 0. From page 1, page 26 (dot 25) sits in the
    // window's last full slot. The window starts at dot 18, with dots 20–25
    // full. Three slots on each side render for the slide.
    const dots = Array.from(
      slider.querySelectorAll<HTMLElement>('[data-page]'),
      i => Number(i.dataset.page),
    );
    expect(dots[0]).toBe(15);
    expect(dots[dots.length - 1]).toBe(30);
  });

  it('an Android finger (no -webkit-touch-callout) gets the window too: one touch model, no platform idiom', () => {
    asTouch();
    vi.stubGlobal('CSS', {supports: () => false});
    render(<PageControl totalPages={50} page={26} onChange={() => {}} />);
    const dots = screen
      .getByRole('slider')
      .querySelectorAll<HTMLElement>('[data-page]');
    // The window and its render margin, not the full row of 50.
    expect(dots.length).toBeLessThan(50);
  });

  it('with a mouse, a long control is the full row of pages, cropped', () => {
    asMouse();
    renderControl({totalPages: 50, page: 26});
    const slider = screen.getByRole('slider');
    expect(slider.style.width).toBe('161.3px');
    const dots = Array.from(
      slider.querySelectorAll<HTMLElement>('[data-page]'),
    );
    expect(dots).toHaveLength(50);
    // No fades and no shrinking slots with a mouse.
    expect(dots.every(dot => dot.style.transition === 'none')).toBe(true);
  });

  // Touch motion stays internal: no theme role, so no variable retunes it.
  it("under a finger, the old indicator fades on the table's measured 250 ms and curve, and a --motion-page-control-… variable changes nothing", () => {
    asTouch();
    const onChange = vi.fn();
    const themed = (value: number) => (
      <div
        data-astryx-theme="page-control-test"
        style={
          {
            '--motion-page-control-fade-out-ms': '500ms',
            '--motion-page-control-fade-out-curve': 'cubic-bezier(0, 0, 1, 1)',
          } as React.CSSProperties
        }>
        <PageControl totalPages={5} page={value} onChange={onChange} />
      </div>
    );
    const {rerender} = render(themed(3));
    const old = screen
      .getByRole('slider')
      .querySelector<HTMLElement>('[data-page="2"]') as HTMLElement;
    // Every transition written to the old indicator, in order.
    const observer = new MutationObserver(() => {});
    observer.observe(old, {
      attributes: true,
      attributeFilter: ['style'],
      attributeOldValue: true,
    });
    rerender(themed(4));
    const written = [
      ...observer.takeRecords().map(record => record.oldValue ?? ''),
      old.getAttribute('style') ?? '',
    ].map(style => /transition:\s*([^;]+)/.exec(style)?.[1].trim());
    observer.disconnect();
    expect(written).toContain('opacity 0.25s cubic-bezier(0, 0, 0.58, 1)');
    // Once the fade starts, the dot's next change is a switch again.
    expect(old.style.transition).toBe(SWITCH);
  });

  it('under a finger and Reduce Motion, the current indicator changes at once, with no fade, whatever the theme (design:reduced-motion DR2)', () => {
    asTouch({reduced: true});
    const onChange = vi.fn();
    const themed = (value: number) => (
      <div
        style={
          {
            '--motion-page-control-fade-out-ms': '500ms',
          } as React.CSSProperties
        }>
        <PageControl totalPages={5} page={value} onChange={onChange} />
      </div>
    );
    const {rerender} = render(themed(3));
    rerender(themed(4));
    const dots = Array.from(
      screen.getByRole('slider').querySelectorAll<HTMLElement>('[data-page]'),
    );
    expect(dots.length).toBe(5);
    for (const dot of dots) {
      expect(dot.style.transition).toBe('none');
    }
  });

  it('under a finger and Reduce Motion, a held finger’s platter and the dots’ dimming show at once and hide on the policy’s fade (design:reduced-motion DR2)', () => {
    vi.useFakeTimers();
    try {
      asTouch({reduced: true});
      renderControl();
      const slider = screen.getByRole('slider');
      const reduced = 'opacity 0.2s cubic-bezier(0.42, 0, 0.58, 1)';
      const fadeOfLook = () => ({
        platter: slider.style.getPropertyValue(
          '--_page-control-platter-transition',
        ),
        dots: Array.from(
          slider.querySelectorAll<HTMLElement>('[data-page]'),
          dot => dot.style.transition,
        ),
      });
      const touch = (type: 'touchstart' | 'touchend') => {
        const event = new Event(type, {bubbles: true, cancelable: true});
        const contact = {
          identifier: 1,
          clientX: 1,
          clientY: 10,
          target: slider,
        };
        Object.defineProperty(event, 'changedTouches', {value: [contact]});
        Object.defineProperty(event, 'touches', {
          value: type === 'touchend' ? [] : [contact],
        });
        slider.dispatchEvent(event);
      };
      touch('touchstart');
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(slider.hasAttribute('data-interacting')).toBe(true);
      expect(fadeOfLook()).toEqual({
        platter: 'none',
        dots: Array.from({length: 5}, () => 'none'),
      });
      act(() => {
        touch('touchend');
      });
      expect(slider.hasAttribute('data-interacting')).toBe(false);
      expect(fadeOfLook()).toEqual({
        platter: reduced,
        dots: Array.from({length: 5}, () => reduced),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('with a mouse, a click on the trailing side of the current dot asks for the next page, on the leading side for the previous', () => {
    asMouse();
    const {onChange} = renderControl();
    click(screen.getByRole('slider'), 50);
    expect(onChange).toHaveBeenLastCalledWith(4);
    click(screen.getByRole('slider'), -50);
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  // Input takes every pointer. The touch presentation (the window, the
  // platter, the fades) stays on a coarse pointer.
  it('with a mouse, a press and release on the trailing side ask for the next page through the tap recognizer, before any click', () => {
    asMouse();
    const {onChange} = renderControl();
    const slider = screen.getByRole('slider');
    mouse(slider, 'pointerdown', 50);
    mouse(slider, 'pointerup', 50);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('with a mouse, a tap pages once: the click the browser sends after it does not page again', () => {
    asMouse();
    const {onChange} = renderControl();
    click(screen.getByRole('slider'), 50);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('with a mouse, a drag scrubs: the page follows the pointer to the dot under it (spec:AST-094 FR43)', () => {
    asMouse();
    const rects = layOutRow();
    try {
      const {onChange} = renderControl();
      const slider = screen.getByRole('slider');
      // Pressed on page 3's dot (centre 137), dragged to page 5's (169).
      mouse(slider, 'pointerdown', 137);
      for (let i = 1; i <= 8; i++) {
        mouse(slider, 'pointermove', 137 + 4 * i);
      }
      mouse(slider, 'pointerup', 169);
      expect(onChange).toHaveBeenCalledWith(4);
      expect(onChange).toHaveBeenLastCalledWith(5);
    } finally {
      rects.mockRestore();
    }
  });

  it('with a mouse, a scrub on a cropped long row holds the row still until the lift, so the page stays the dot under the pointer', () => {
    asMouse();
    const rects = layOutRow();
    try {
      function Owner() {
        const [page, setPage] = useState(6);
        return <PageControl totalPages={50} page={page} onChange={setPage} />;
      }
      render(<Owner />);
      const slider = screen.getByRole('slider');
      const strip = slider.children[0] as HTMLElement;
      const rest = strip.style.translate;
      // Pressed on page 6's dot (centre 185), dragged three dots on. Each
      // event commits its render, as a browser's would.
      act(() => mouse(slider, 'pointerdown', 185));
      for (let i = 1; i <= 12; i++) {
        act(() => mouse(slider, 'pointermove', 185 + 4 * i));
        expect(strip.style.translate).toBe(rest);
      }
      expect(Number(slider.getAttribute('aria-valuenow'))).toBe(9);
      act(() => mouse(slider, 'pointerup', 233));
      expect(strip.style.translate).not.toBe(rest);
    } finally {
      rects.mockRestore();
    }
  });

  it('with a pen, a press and release on the trailing side ask for the next page', () => {
    asMouse();
    const {onChange} = renderControl();
    const slider = screen.getByRole('slider');
    mouse(slider, 'pointerdown', 50, 'pen');
    mouse(slider, 'pointerup', 50, 'pen');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('with a pen, a drag scrubs: the page follows the pen to the dot under it', () => {
    asMouse();
    const rects = layOutRow();
    try {
      const {onChange} = renderControl();
      const slider = screen.getByRole('slider');
      // Pressed on page 3's dot (centre 137), dragged to page 5's (169).
      mouse(slider, 'pointerdown', 137, 'pen');
      for (let i = 1; i <= 8; i++) {
        mouse(slider, 'pointermove', 137 + 4 * i, 'pen');
      }
      mouse(slider, 'pointerup', 169, 'pen');
      expect(onChange).toHaveBeenCalledWith(4);
      expect(onChange).toHaveBeenLastCalledWith(5);
    } finally {
      rects.mockRestore();
    }
  });

  it('under a coarse pointer, an invisible hit area grows the 25.67 px tall control toward 44 px', () => {
    asTouch();
    let reveal: ((entries: IntersectionObserverEntry[]) => void) | null = null;
    const frames: Array<() => void> = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
          reveal = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
      frames.push(run);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    renderControl();
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => new DOMRect(100, 100, 108.33, 25.67);
    act(() => {
      reveal?.([
        {
          target: slider,
          isIntersecting: true,
        } as unknown as IntersectionObserverEntry,
      ]);
      for (const run of frames.splice(0)) {
        run();
      }
    });
    const inset = (side: string) =>
      Number.parseFloat(
        slider.style.getPropertyValue(`--astryx-hit-inset-${side}`),
      );
    expect(inset('top')).toBeCloseTo((44 - 25.67) / 2, 1);
    expect(inset('bottom')).toBeCloseTo((44 - 25.67) / 2, 1);
    expect(inset('left')).toBe(0);
    expect(inset('right')).toBe(0);
  });

  it('with a mouse, a press held past 155 ms shows no platter and dims nothing: the held look is the touch presentation', () => {
    vi.useFakeTimers();
    try {
      asMouse();
      renderControl();
      const slider = screen.getByRole('slider');
      const dot = slider.querySelector('[data-page="0"]') as HTMLElement;
      const restOpacity = dot.style.opacity;
      mouse(slider, 'pointerdown', 50);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(slider.hasAttribute('data-interacting')).toBe(false);
      expect(dot.style.opacity).toBe(restOpacity);
      mouse(slider, 'pointerup', 50);
    } finally {
      vi.useRealTimers();
    }
  });

  // A recognizer that competes with the page's scroll decides within 10 px.
  // So a swipe that starts vertical is the page's.
  it("under a finger, a vertical swipe that starts on the dots pages nothing and leaves every move to the page's scroll", () => {
    asTouch();
    const {onChange} = renderControl();
    const slider = screen.getByRole('slider');
    const cancelled = swipe(slider, {x: 50, y: 10}, {x: 52, y: -290}, 30);
    expect(cancelled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('under a finger, the click the browser sends after a tap does not page again', () => {
    asTouch();
    const {onChange} = renderControl();
    const slider = screen.getByRole('slider');
    tap(slider, 50);
    fireEvent.click(slider, {clientX: 50, clientY: 10});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('clicks work when the control first renders with no pages and the pages arrive later', () => {
    const onChange = vi.fn();
    const view = render(
      <PageControl totalPages={0} page={1} onChange={onChange} />,
    );
    view.rerender(<PageControl totalPages={5} page={3} onChange={onChange} />);
    click(screen.getByRole('slider'), 50);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('a page the app declines can be asked for again', async () => {
    // The app keeps its value: no render follows onChange.
    const {onChange} = renderControl();
    click(screen.getByRole('slider'), 50);
    await new Promise(resolve => setTimeout(resolve, 0));
    click(screen.getByRole('slider'), 50);
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('slider'), {key: 'ArrowRight'});
    expect(onChange).toHaveBeenCalledTimes(2);
    await new Promise(resolve => setTimeout(resolve, 0));
    fireEvent.keyDown(screen.getByRole('slider'), {key: 'ArrowRight'});
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("a caller's onKeyDown runs first and can keep the page with preventDefault", () => {
    const onKeyDown = vi.fn((event: React.KeyboardEvent) => {
      if (event.key === 'End') {
        event.preventDefault();
      }
    });
    const {onChange} = renderControl({onKeyDown});
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, {key: 'ArrowRight'});
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(slider, {key: 'End'});
    expect(onKeyDown).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to the slider, and clicks still page with a ref passed', () => {
    const ref = createRef<HTMLDivElement>();
    const onChange = vi.fn();
    render(
      <PageControl ref={ref} totalPages={5} page={3} onChange={onChange} />,
    );
    expect(ref.current).toBe(screen.getByRole('slider'));
    click(screen.getByRole('slider'), 50);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("inactive dots reach 3:1 on Core's default page background (WCAG 1.4.11)", () => {
    renderControl();
    const dot = screen
      .getByRole('slider')
      .querySelector('[data-page="0"]') as HTMLElement;
    // Core's light defaults: --color-text-primary #0A1317 on
    // --color-background-body #F1F4F7.
    expect(
      contrastOver(
        [0x0a, 0x13, 0x17],
        [0xf1, 0xf4, 0xf7],
        Number(dot.style.opacity),
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it('server-rendered, a long control already carries its resting offset and sizes', () => {
    const html = renderToString(
      <PageControl totalPages={50} page={27} onChange={() => {}} />,
    );
    const rest = /--_page-control-rest:\s*([\d.]+)px/.exec(html);
    expect(rest).not.toBeNull();
    expect(Number(rest?.[1])).toBeGreaterThan(0);
    expect(html).toMatch(/--_page-control-scale:\s*0\.967/);
  });

  it('with hidesForSinglePage, renders nothing for one page', () => {
    renderControl({totalPages: 1, page: 1, hidesForSinglePage: true});
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
