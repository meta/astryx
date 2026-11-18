// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollEdgeEffect.test.tsx
 * @input vitest (jsdom), React Testing Library, a recording
 *   IntersectionObserver, a recording animator and Core's gesture host
 * @output The effect's decisions: what it observes, against which root, and
 *   the props it hands out. A finger's scroll fades and the program's
 *   switches. The layer's promotion and the veil's literals follow the bars
 *   table.
 * @position Unit tests of packages/lab/src/internal/useScrollEdgeEffect.ts.
 *   NavigationStackScrollEdge.interaction.browser.spec.ts proves the fade.
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {act, cleanup, render, screen} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getGestureHost} from '@astryxdesign/core/internal/touch';
import type * as TouchEntry from '@astryxdesign/core/internal/touch';
import type * as CoreUtils from '@astryxdesign/core/utils';
import {bars} from '../NavigationStack/navigationMotion';
import {coarsePrimaryPointer} from './__tests__/coarsePointer';
import {useScrollEdgeEffect} from './useScrollEdgeEffect';

const testStyles = stylex.create({
  staticSentinel: {
    insetBlockStart: 'auto',
    insetInlineStart: 'auto',
  },
});

const animator = {
  set: vi.fn(),
  animate: vi.fn(),
  /** The layer, where a test attaches it (the mocked ref attaches nothing). */
  element: null as HTMLElement | null,
};

vi.mock('./useMotionEngine', () => ({
  useMotionEngine: () => ({ref: () => {}, animator}),
}));

/**
 * Core's shared resize observer, as the hook subscribes to it. Like Core's,
 * it calls back once as it subscribes.
 */
const resize = {callbacks: [] as Array<() => void>, stops: 0};
vi.mock('@astryxdesign/core/utils', async importOriginal => ({
  ...(await importOriginal<typeof CoreUtils>()),
  observeResize: (_element: Element, callback: () => void) => {
    resize.callbacks.push(callback);
    callback();
    return () => {
      resize.stops += 1;
    };
  },
}));

/** The touch presentation the hook sees: a finger unless a test says otherwise. */
const pointer = {isTouch: true};
/**
 * Core's finger-scroll hook: what the hook asks it to watch, and whether the
 * scroll now moving is a finger's.
 */
const host = {
  isFinger: true,
  watched: [] as unknown[],
  /** The hook's latest end call, as the real one keeps it. */
  onEnd: null as (() => void) | null,
  /** Whether the scroll at a past time was a finger's, when a test sets it. */
  fingerAt: null as ((at: number) => boolean) | null,
};
/** useFingerScroll's reader is stable across renders, as the real one. */
const readFingerScroll = (at?: number) =>
  at != null && host.fingerAt != null ? host.fingerAt(at) : host.isFinger;
/** The finger-scroll hook saying that the finger's scroll has ended. */
function endFingerScroll() {
  host.isFinger = false;
  act(() => {
    host.onEnd?.();
  });
}
vi.mock('@astryxdesign/core/internal/touch', async importOriginal => ({
  ...(await importOriginal<typeof TouchEntry>()),
  useTouchPresentation: () => ({
    isTouch: pointer.isTouch,
    isCompact: true,
    isCompactTouch: pointer.isTouch,
  }),
  useFingerScroll: (scroller: unknown, options?: {onEnd?: () => void}) => {
    host.watched.push(scroller);
    host.onEnd = options?.onEnd ?? null;
    return readFingerScroll;
  },
}));

/** The node the hook last asked useFingerScroll to watch, if any. */
function watchedNode(): Document | Element | null {
  const last = host.watched.at(-1) as
    Document | {current: Element | null} | undefined;
  return last instanceof Document ? last : (last?.current ?? null);
}

class RecordingObserver {
  static instances: RecordingObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    RecordingObserver.instances.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  readonly unobserved: Element[] = [];
  unobserve(target: Element) {
    this.unobserved.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /**
   * Reports the sentinel intersecting its root (true) or gone (false). It
   * passes the root rectangle's top when given (the engine's, margin
   * applied), its height, and the crossing's time when given.
   */
  report(
    isIntersecting: boolean,
    rootTop?: number,
    rootHeight = 400,
    time?: number,
  ) {
    act(() => {
      this.callback(
        [
          {
            isIntersecting,
            rootBounds:
              rootTop == null
                ? null
                : ({top: rootTop, height: rootHeight} as DOMRectReadOnly),
            ...(time == null ? {} : {time}),
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      );
    });
  }
}

/** A touch event on `target` from finger 1 (down for touchstart). */
function touch(type: 'touchstart' | 'touchend', target: Element) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const finger = {identifier: 1, clientX: 10, clientY: 10, target};
  Object.defineProperty(event, 'changedTouches', {value: [finger]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchstart' ? [finger] : [],
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

/**
 * Takes `onscrollend` off the window, as in a browser that sends no
 * `scrollend`; returns the restore.
 */
function withoutScrollEnd(): () => void {
  const own = Object.getOwnPropertyDescriptor(window, 'onscrollend');
  const proto = Object.getPrototypeOf(window) as object;
  const inherited = Object.getOwnPropertyDescriptor(proto, 'onscrollend');
  Reflect.deleteProperty(window, 'onscrollend');
  Reflect.deleteProperty(proto, 'onscrollend');
  expect('onscrollend' in window).toBe(false);
  return () => {
    if (inherited != null) {
      Object.defineProperty(proto, 'onscrollend', inherited);
    }
    if (own != null) {
      Object.defineProperty(window, 'onscrollend', own);
    }
  };
}

beforeEach(() => {
  animator.element = null;
  pointer.isTouch = true;
  host.isFinger = true;
  host.watched = [];
  RecordingObserver.instances = [];
  host.onEnd = null;
  host.fingerAt = null;
  resize.callbacks = [];
  resize.stops = 0;
  animator.set.mockClear();
  animator.animate.mockClear();
  vi.stubGlobal('IntersectionObserver', RecordingObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let renders = 0;

function Bar({
  enabled,
  inContainer = false,
  sentinelKey = 'a',
  rootInset,
  color,
  sentinelXstyle,
}: {
  enabled: boolean;
  inContainer?: boolean;
  sentinelKey?: string;
  rootInset?: number;
  color?: string;
  sentinelXstyle?: StyleXStyles;
}) {
  renders += 1;
  const containerRef = useRef<HTMLDivElement>(null);
  const {layerProps, sentinelProps} = useScrollEdgeEffect({
    enabled,
    root: inContainer ? containerRef : undefined,
    rootInset,
    edge: '44px',
    color,
    sentinelXstyle,
    springs: bars.scrollEdgeEffect,
  });
  return (
    <div ref={containerRef} data-testid="container">
      <div {...layerProps} data-testid="layer" />
      <div key={sentinelKey} {...sentinelProps} data-testid="sentinel" />
    </div>
  );
}

/** Gives the test's scroller a layout: jsdom gives every element height 0. */
function withLayout(container: HTMLElement, top = 16) {
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: 500,
  });
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    top,
  } as DOMRect);
}

const observer = () => {
  const instance = RecordingObserver.instances.at(-1);
  if (instance == null) {
    throw new Error('no observer');
  }
  return instance;
};

describe('useScrollEdgeEffect', () => {
  it('observes the sentinel against its own document, at threshold 0', () => {
    const {getByTestId} = render(<Bar enabled />);
    expect(observer().observed).toEqual([getByTestId('sentinel')]);
    expect(observer().options.root).toBe(document);
    expect(observer().options.threshold).toBe(0);
  });

  it('observes against the scroll container when given one', () => {
    const {getByTestId} = render(<Bar enabled inContainer />);
    expect(observer().options.root).toBe(getByTestId('container'));
  });

  it('takes the inset of a bar that overlays its scroller off the root', () => {
    render(<Bar enabled inContainer rootInset={44} />);
    expect(observer().options.rootMargin).toBe('-44px 0px 0px 0px');
  });

  it('observes the page with no margin', () => {
    render(<Bar enabled />);
    expect(observer().options.rootMargin).toBe('0px 0px 0px 0px');
  });

  it('measures the root on the first report and, where the engine starts it at the content box, observes again from the padding edge', () => {
    // WebKit (iOS 26.2 Safari) starts a scroll container's root rectangle at
    // its content box. Here that is below a 44px top padding: the first
    // report's root top is the padding edge + 44 (padding) + 44 (the inset).
    const {getByTestId} = render(<Bar enabled inContainer rootInset={44} />);
    withLayout(getByTestId('container'));
    const first = observer();
    first.report(true, 16 + 44 + 44);
    // Not acted on: measured from the content box.
    expect(animator.set).not.toHaveBeenCalled();
    expect(first.disconnected).toBe(true);
    const second = observer();
    expect(second).not.toBe(first);
    expect(second.options.rootMargin).toBe('0px 0px 0px 0px');
    expect(second.observed).toEqual([getByTestId('sentinel')]);
    // Its first report puts the effect in place at once.
    second.report(true, 16 + 44);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 0},
      {promote: false},
    );
    expect(RecordingObserver.instances).toHaveLength(2);
  });

  it('keeps the first observer where the engine starts the root at the padding edge', () => {
    // Chromium: the root rectangle is the padding box.
    const {getByTestId} = render(<Bar enabled inContainer rootInset={44} />);
    withLayout(getByTestId('container'));
    observer().report(false, 16 + 44);
    expect(RecordingObserver.instances).toHaveLength(1);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 1},
      {promote: false},
    );
  });

  it('measures nothing while the scroller has no layout, and observes again once it has one', () => {
    // A stack in a hidden panel: the scroller and its root rectangle have no
    // size, so the first report holds nothing to measure.
    const {getByTestId} = render(<Bar enabled inContainer rootInset={44} />);
    const first = observer();
    first.report(false, 0, 0);
    expect(animator.set).not.toHaveBeenCalled();
    // The call as it subscribes finds no size: it neither stops the wait nor
    // observes again.
    expect(first.disconnected).toBe(false);
    expect(resize.callbacks).toHaveLength(1);
    expect(resize.stops).toBe(0);
    // A resize that leaves it without layout changes nothing.
    act(() => resize.callbacks[0]());
    expect(RecordingObserver.instances).toHaveLength(1);
    // Shown: a new observer from the padding edge reports at once, and the
    // veil is off at rest.
    withLayout(getByTestId('container'));
    act(() => resize.callbacks[0]());
    expect(resize.stops).toBe(1);
    expect(first.disconnected).toBe(true);
    const second = observer();
    expect(second).not.toBe(first);
    expect(second.options.rootMargin).toBe('-44px 0px 0px 0px');
    second.report(true, 16 + 44);
    expect(RecordingObserver.instances).toHaveLength(2);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 0},
      {promote: false},
    );
  });

  it('measures a laid-out scroller whose root rectangle has no height, with no wait', () => {
    // WebKit's content-box root for a scroller no taller than its 44px top
    // padding: the rectangle has no height, but its top is a real reading.
    const {getByTestId} = render(<Bar enabled inContainer rootInset={44} />);
    withLayout(getByTestId('container'));
    const first = observer();
    first.report(true, 16 + 44 + 44, 0);
    expect(resize.callbacks).toHaveLength(0);
    expect(first.disconnected).toBe(true);
    expect(observer().options.rootMargin).toBe('0px 0px 0px 0px');
  });

  it('hands out decorative layer and sentinel props, sized by edge', () => {
    const {getByTestId} = render(<Bar enabled color="rgb(1, 2, 3)" />);
    const layer = getByTestId('layer');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(getByTestId('sentinel').getAttribute('aria-hidden')).toBe('true');
    // The veil's colour and height are runtime values, StyleX custom
    // properties on the element. The height is the soft extent past the
    // bar's bottom, and the bar's bottom under Reduce Transparency.
    const style = layer.getAttribute('style') ?? '';
    expect(style).toContain('rgb(1, 2, 3)');
    expect(style).toContain('calc(44px + 54.8px)');
    expect(style).toContain('44px');
  });

  it("adds the caller's sentinel styles, e.g. its static position", () => {
    const plain = render(<Bar enabled />)
      .getByTestId('sentinel')
      .getAttribute('class');
    cleanup();
    const placed = render(
      <Bar enabled sentinelXstyle={testStyles.staticSentinel} />,
    )
      .getByTestId('sentinel')
      .getAttribute('class');
    expect(placed).not.toBe(plain);
    for (const name of (
      stylex.props(testStyles.staticSentinel).className ?? ''
    ).split(' ')) {
      expect(placed?.split(' ')).toContain(name);
    }
  });

  it('defaults the veil to the body colour', () => {
    const {getByTestId} = render(<Bar enabled />);
    expect(getByTestId('layer').getAttribute('style')).toContain(
      'var(--color-background-body)',
    );
  });

  it('puts the first report in place without a fade', () => {
    render(<Bar enabled />);
    observer().report(true);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 0},
      {promote: false},
    );
    expect(animator.animate).not.toHaveBeenCalled();
  });

  it('shows the effect at once when the page loads scrolled', () => {
    render(<Bar enabled />);
    observer().report(false);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 1},
      {promote: false},
    );
    expect(animator.animate).not.toHaveBeenCalled();
  });

  it('fades in on the appear spring and out on the disappear spring under a finger', () => {
    render(<Bar enabled />);
    observer().report(true);
    observer().report(false);
    expect(animator.animate).toHaveBeenLastCalledWith(
      {opacity: 1},
      {spring: bars.scrollEdgeEffect.appear},
    );
    // Back before the fade ended: the animator turns it around.
    observer().report(true);
    expect(animator.animate).toHaveBeenLastCalledWith(
      {opacity: 0},
      {spring: bars.scrollEdgeEffect.disappear},
    );
    expect(animator.animate).toHaveBeenCalledTimes(2);
  });

  it('ignores a report that changes nothing', () => {
    render(<Bar enabled />);
    observer().report(true);
    observer().report(false);
    observer().report(false);
    expect(animator.animate).toHaveBeenCalledTimes(1);
  });

  // On iOS 26.2, a fade that starts as the program's scroll crosses the
  // switch blanks the sticky bar's items.
  it('switches at once, without a fade, for a scroll the program drives', () => {
    host.isFinger = false;
    render(<Bar enabled />);
    observer().report(true);
    observer().report(false);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 1},
      {promote: false},
    );
    observer().report(true);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 0},
      {promote: false},
    );
    expect(animator.animate).not.toHaveBeenCalled();
  });

  it('fades for a finger and switches for the program within one page', () => {
    render(<Bar enabled />);
    observer().report(true);
    // A finger scrolls the content under the bar…
    observer().report(false);
    expect(animator.animate).toHaveBeenCalledTimes(1);
    // …and a status-bar tap brings it back.
    host.isFinger = false;
    observer().report(true);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 0},
      {promote: false},
    );
    expect(animator.animate).toHaveBeenCalledTimes(1);
  });

  it('fades for a report that runs after the finger’s scroll ended, read at the time the observer recorded it', () => {
    render(<Bar enabled />);
    observer().report(true);
    // The finger's scroll ran from 100 to 200 ms; a busy page reports later.
    host.isFinger = false;
    host.fingerAt = at => at >= 100 && at <= 200;
    observer().report(false, undefined, 400, 150);
    expect(animator.animate).toHaveBeenLastCalledWith(
      {opacity: 1},
      {spring: bars.scrollEdgeEffect.appear},
    );
  });

  it('switches at once for a program scroll right after a finger’s: the observer records it later', () => {
    render(<Bar enabled />);
    observer().report(true);
    host.isFinger = false;
    host.fingerAt = at => at >= 100 && at <= 200;
    observer().report(false, undefined, 400, 216);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 1},
      {promote: false},
    );
    expect(animator.animate).not.toHaveBeenCalled();
  });

  it('watches the page’s finger scrolls, or the scroll container’s', () => {
    const {unmount} = render(<Bar enabled />);
    expect(watchedNode()).toBe(document);
    unmount();
    render(<Bar enabled inContainer />);
    expect(watchedNode()).toBe(screen.getByTestId('container'));
  });

  // The sentinel lives in a ref, not React state.
  it('attaches the sentinel without re-rendering the host', () => {
    renders = 0;
    render(<Bar enabled />);
    expect(renders).toBe(1);
    expect(observer().observed).toEqual([screen.getByTestId('sentinel')]);
  });

  // The layer is composited only while a finger works the scroller. The
  // program's switch writes no compositing layer.
  it('a scroll the program drives switches the layer without promotion', () => {
    host.isFinger = false;
    render(<Bar enabled />);
    observer().report(true);
    observer().report(false);
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 1},
      {promote: false},
    );
    expect(animator.animate).not.toHaveBeenCalled();
  });

  // The gesture host listens only where the primary pointer is coarse, and
  // jsdom has no matchMedia.
  describe('under a coarse primary pointer', () => {
    let restorePointer: () => void = () => {};
    beforeEach(() => {
      restorePointer = coarsePrimaryPointer();
    });
    afterEach(() => {
      restorePointer();
    });

    it('in a scroll container, a finger’s landing composites the layer until it lifts', () => {
      host.isFinger = false;
      const {getByTestId} = render(<Bar enabled inContainer />);
      const layer = getByTestId('layer');
      animator.element = layer;
      const promotion = () =>
        layer.style.getPropertyValue('--_scroll-edge-will-change');
      expect(promotion()).toBe('');
      touch('touchstart', getByTestId('sentinel'));
      expect(promotion()).toBe('opacity');
      touch('touchend', getByTestId('sentinel'));
      expect(promotion()).toBe('');
    });

    it('keeps the layer composited through the finger’s momentum, until its scroll ends', () => {
      const {getByTestId} = render(<Bar enabled inContainer />);
      const layer = getByTestId('layer');
      animator.element = layer;
      const promotion = () =>
        layer.style.getPropertyValue('--_scroll-edge-will-change');
      touch('touchstart', getByTestId('sentinel'));
      // Lifted while its scroll still moves (useFingerScroll still reads it).
      touch('touchend', getByTestId('sentinel'));
      expect(promotion()).toBe('opacity');
      endFingerScroll();
      expect(promotion()).toBe('');
    });

    // Where the browser sends no `scrollend`, the finger-scroll hook times
    // the end itself. The effect keeps no timer: only the hook's end call
    // drops the layer.
    it('drops the layer only when the finger-scroll hook says the scroll ended, with no timer of its own', () => {
      vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
      const restoreScrollEnd = withoutScrollEnd();
      try {
        const {getByTestId} = render(<Bar enabled inContainer />);
        const container = getByTestId('container');
        const layer = getByTestId('layer');
        animator.element = layer;
        const promotion = () =>
          layer.style.getPropertyValue('--_scroll-edge-will-change');
        touch('touchstart', getByTestId('sentinel'));
        container.dispatchEvent(new Event('scroll'));
        // Lifted mid-fling: its momentum still scrolls.
        touch('touchend', getByTestId('sentinel'));
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        expect(promotion()).toBe('opacity');
        expect(vi.getTimerCount()).toBe(0);
        endFingerScroll();
        expect(promotion()).toBe('');
      } finally {
        restoreScrollEnd();
        vi.useRealTimers();
      }
    });

    it('adds no scroll listener of its own however many screens run it', () => {
      // The gesture host's own listeners start with its first retain. Take
      // it first, so that only the hook's are counted.
      const releaseHost = getGestureHost(document).retain();
      const onDocument = vi.spyOn(document, 'addEventListener');
      const onWindow = vi.spyOn(window, 'addEventListener');
      const scrollTypes = (spy: typeof onWindow) =>
        spy.mock.calls
          .map(([type]) => type)
          .filter(type => type === 'scroll' || type === 'scrollend');
      const three = () => (
        <>
          <Bar enabled inContainer sentinelKey="a" />
          <Bar enabled inContainer sentinelKey="b" />
          <Bar enabled inContainer sentinelKey="c" />
        </>
      );
      try {
        render(three());
        expect(scrollTypes(onDocument)).toEqual([]);
        expect(scrollTypes(onWindow)).toEqual([]);
        cleanup();
        onWindow.mockClear();
        // Where the browser sends no `scrollend`, nothing changes here: the
        // finger-scroll hook times the end.
        const restoreScrollEnd = withoutScrollEnd();
        try {
          render(three());
          expect(scrollTypes(onDocument)).toEqual([]);
          expect(scrollTypes(onWindow)).toEqual([]);
        } finally {
          restoreScrollEnd();
        }
      } finally {
        onDocument.mockRestore();
        onWindow.mockRestore();
        releaseHost();
      }
    });
  });

  it('with a mouse a finger never composites the layer', () => {
    pointer.isTouch = false;
    const restorePointer = coarsePrimaryPointer();
    try {
      const {getByTestId} = render(<Bar enabled inContainer />);
      const layer = getByTestId('layer');
      animator.element = layer;
      touch('touchstart', getByTestId('sentinel'));
      expect(layer.style.getPropertyValue('--_scroll-edge-will-change')).toBe(
        '',
      );
      touch('touchend', getByTestId('sentinel'));
    } finally {
      restorePointer();
    }
  });

  it('moves the observer to a replacement sentinel node', () => {
    const {rerender} = render(<Bar enabled />);
    const first = screen.getByTestId('sentinel');
    const instance = observer();
    rerender(<Bar enabled sentinelKey="b" />);
    const second = screen.getByTestId('sentinel');
    expect(second).not.toBe(first);
    expect(instance.unobserved).toContain(first);
    expect(instance.observed.at(-1)).toBe(second);
    expect(RecordingObserver.instances.at(-1)).toBe(instance);
  });

  it('observes nothing with a mouse', () => {
    pointer.isTouch = false;
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    render(<Bar enabled />);
    expect(RecordingObserver.instances).toHaveLength(0);
    // Nothing is watched: a mouse costs no touch work.
    expect(watchedNode()).toBeNull();
    expect(animator.animate).not.toHaveBeenCalled();
  });

  it('observes nothing while disabled', () => {
    render(<Bar enabled={false} />);
    expect(RecordingObserver.instances).toHaveLength(0);
  });

  it('stops observing and turns transparent when disabled', () => {
    const {rerender} = render(<Bar enabled />);
    const first = observer();
    first.report(false);
    rerender(<Bar enabled={false} />);
    expect(first.disconnected).toBe(true);
    expect(watchedNode()).toBeNull();
    expect(animator.set).toHaveBeenLastCalledWith(
      {opacity: 0},
      {promote: false},
    );
  });

  it('does nothing where IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    expect(() => render(<Bar enabled />)).not.toThrow();
    expect(animator.set).not.toHaveBeenCalled();
  });
});

describe('the veil follows the constants table', () => {
  const source = readFileSync(
    join(__dirname, 'useScrollEdgeEffect.ts'),
    'utf8',
  );

  /** The literal block of `styles.<name>` in useScrollEdgeEffect.ts. */
  function styleBlock(name: string): string {
    const start = source.indexOf(`\n  ${name}: {`);
    expect(start, `styles.${name} not found`).toBeGreaterThan(-1);
    const end = source.indexOf('\n  },', start);
    return source.slice(start, end);
  }

  // The veil's edge is the bar's bottom. The soft extent reaches
  // `softExtentPt` past it, so the edge is that far above the layer's bottom.
  const edgeAboveBottom = bars.scrollEdgeEffect.softExtentPt;
  // UIKit's edge sits `veil.edgeAboveContentBottomPt` higher; the stops are
  // sampled around it.
  const {edgeAboveContentBottomPt} = bars.scrollEdgeEffect.veil;

  it('the layer reaches softExtentPt past the bar; Reduce Transparency ends it at the bar', () => {
    expect(source).toContain(
      'dynamicStyles.geometry(`calc(${edge} + ' +
        edgeAboveBottom +
        'px)`, edge, color)',
    );
  });

  it('the layer’s will-change follows the hook’s promotion property', () => {
    expect(styleBlock('layer')).toContain(
      "willChange: 'var(--_scroll-edge-will-change, auto)',",
    );
  });

  it('the sentinel is switchPt tall', () => {
    expect(styleBlock('sentinel')).toContain(
      `height: ${bars.scrollEdgeEffect.switchPt},`,
    );
  });

  // Denser than UIKit's 0.85: 0.95, with the edge at the bar's bottom. A
  // bar's title keeps 4.5:1 over the brightest scrolled content (WCAG 1.4.3).
  it('the veil is 0.95 × (1 − Φ((y − edge) / softness)), sampled every 6px over ±3σ', () => {
    const maxAlpha = 0.95;
    const {softnessPt} = bars.scrollEdgeEffect.veil;
    expect(maxAlpha).toBeGreaterThan(bars.scrollEdgeEffect.veil.maxAlpha);
    const uikitEdge = edgeAboveBottom + edgeAboveContentBottomPt;
    const stops: string[] = [];
    for (let d = -3 * softnessPt; d <= 3 * softnessPt; d += 6) {
      const alpha =
        maxAlpha * (1 - normalCdf((d - edgeAboveContentBottomPt) / softnessPt));
      const offset = Math.round((uikitEdge - d) * 10) / 10;
      stops.push(`rgb(0 0 0 / ${alpha.toFixed(3)}) calc(100% - ${offset}px)`);
    }
    expect(styleBlock('layer')).toContain(
      `'linear-gradient(to bottom, ${stops.join(', ')})'`,
    );
  });
});

/** Standard normal CDF, by Simpson integration of the density (oracle). */
function normalCdf(z: number): number {
  const n = 2000;
  const h = Math.abs(z) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * h;
    const weight = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    sum += weight * Math.exp((-t * t) / 2);
  }
  const half = (sum * h) / 3 / Math.sqrt(2 * Math.PI);
  return z >= 0 ? 0.5 + half : 0.5 - half;
}
