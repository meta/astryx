// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useRefreshControl.test.tsx
 * @input vitest (jsdom), useRefreshControl in a minimal app scroll
 *   container, input events on its content, and stand-ins for a touch screen
 *   and a non-iOS WebKit
 * @output Covers the pull, the end, controlled and programmatic refreshes, and
 *   the announcement. Also covers the inputs that pull and those that do not,
 *   the disabled state and the scroll container's top-edge overscroll policy
 * @position Testing; colocated with useRefreshControl.ts. A real browser
 *   checks the motion itself (the interaction spec and its storyboards)
 */

import {useState, type ReactNode} from 'react';
import {act, render, screen, waitFor} from '@testing-library/react';
import {
  GestureRecognizer,
  PanGestureRecognizer,
  type MotionCurve,
  type MotionEngine,
} from '@astryxdesign/core/internal/touch';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type * as MotionEngineModule from '../internal/useMotionEngine';
import {revealProgress} from './refreshPull';
import {
  useRefreshControl,
  type UseRefreshControlOptions,
} from './useRefreshControl';

// Records the animators that the touch layer creates, the content's first,
// so a test can watch the settle and the indicator's fade.
const animators = vi.hoisted(() => ({list: [] as unknown[]}));
vi.mock('../internal/useMotionEngine', async importOriginal => {
  const real = await importOriginal<typeof MotionEngineModule>();
  return {
    ...real,
    useMotionEngine: (
      ...args: Parameters<typeof real.useMotionEngine>
    ): ReturnType<typeof real.useMotionEngine> => {
      const result = real.useMotionEngine(...args);
      if (!animators.list.includes(result.animator)) {
        animators.list.push(result.animator);
      }
      return result;
    },
  };
});

/**
 * Gives the content's settle back to the top the curve from `settleCurve`
 * and an end that the test controls. Records the curves that the indicator
 * plays on its opacity.
 */
function watchFade(settleCurve: () => MotionCurve | null) {
  const [contentAnimator, indicatorAnimator] = animators.list.slice(
    -2,
  ) as MotionEngine[];
  let finishSettle: (done: boolean) => void = () => {};
  const animate = contentAnimator.animate.bind(contentAnimator);
  vi.spyOn(contentAnimator, 'animate').mockImplementation(
    (to, transition, options) => {
      const handle = animate(to, transition, options);
      if (to.y !== 0) {
        return handle;
      }
      const curve = settleCurve();
      const finished = new Promise<boolean>(resolve => {
        finishSettle = resolve;
      });
      return {...handle, finished, curve: () => curve};
    },
  );
  const play = vi.spyOn(indicatorAnimator, 'play');
  return {
    fades: () =>
      play.mock.calls
        .map(([curves]) => curves.opacity)
        .filter((curve): curve is MotionCurve => curve != null),
    finishSettle: (done: boolean) => finishSettle(done),
  };
}

/**
 * Gives a scroll container the height of the scroll view that UIKit's frames
 * were measured on, and content that overflows it. The trigger distance is
 * then UIKit's floor, 73 px of overscroll. jsdom lays nothing out.
 */
function measured(element: HTMLElement | null): void {
  if (element != null) {
    sized(element, {client: 334, scroll: 1000});
  }
}

/** Gives an element a height and a content height. */
function sized(
  element: HTMLElement,
  {client, scroll}: {client: number; scroll: number},
): void {
  Object.defineProperty(element, 'clientHeight', {
    value: client,
    configurable: true,
  });
  Object.defineProperty(element, 'scrollHeight', {
    value: scroll,
    configurable: true,
  });
}

/**
 * The structure the hook drives: the app's scroll container, the pulled
 * content and an indicator. With `isBare`, the test supplies the container.
 */
function Refreshable({
  children,
  'data-testid': testId,
  isBare = false,
  announce = 'Refreshing',
  ...options
}: UseRefreshControlOptions & {
  children: ReactNode;
  'data-testid'?: string;
  isBare?: boolean;
}) {
  const control = useRefreshControl({announce, ...options});
  const pulled = (
    <div
      data-testid={testId}
      ref={control.contentRef}
      aria-busy={control.isRefreshing || undefined}>
      <div ref={control.indicatorRef} aria-hidden />
      {children}
    </div>
  );
  return isBare ? (
    pulled
  ) : (
    <div data-testid="list" ref={measured} style={{overflowY: 'auto'}}>
      {pulled}
    </div>
  );
}

const COARSE = /\(\s*pointer\s*:\s*coarse\s*\)/;
let originalMatchMedia: typeof window.matchMedia;
let originalInnerHeight: number;
const originalCss = Object.getOwnPropertyDescriptor(window, 'CSS');

/** Whether the engine answers iOS WebKit's `CSS.supports` query. */
function useIos(isIos: boolean): void {
  Object.defineProperty(window, 'CSS', {
    configurable: true,
    writable: true,
    value: {
      escape: (value: string) => value,
      supports: (query: string) =>
        isIos && query === '(-webkit-touch-callout: none)',
    },
  });
}

function useTouchScreen(isTouch: boolean): void {
  window.matchMedia = (query: string) =>
    ({
      matches: isTouch && COARSE.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

let clock = 0;
function touch(
  type: string,
  target: EventTarget,
  y: number,
  isLift = false,
): void {
  clock += 16;
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: 1, clientX: 100, clientY: y, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: isLift ? [] : [entry]});
  Object.defineProperty(event, 'timeStamp', {value: clock});
  act(() => {
    target.dispatchEvent(event);
  });
}

/** A one-finger drag from y 100 down by each step in turn. */
function pull(target: EventTarget, steps: number[], lift = true): void {
  let y = 100;
  touch('touchstart', target, y);
  for (const step of steps) {
    y += step;
    touch('touchmove', target, y);
  }
  if (lift) {
    touch('touchend', target, y, true);
  }
}

/**
 * A drag with a mouse or a pen from y 100. `move` goes down by a step with the
 * button held, and `lift` releases the button.
 */
function pointerDrag(target: EventTarget, pointerType: 'mouse' | 'pen') {
  let y = 100;
  const send = (type: string, buttons: number) => {
    clock += 16;
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType,
      isPrimary: true,
      clientX: 100,
      clientY: y,
      button: 0,
      buttons,
    });
    Object.defineProperty(event, 'timeStamp', {value: clock});
    act(() => {
      target.dispatchEvent(event);
    });
  };
  send('pointerdown', 1);
  return {
    move(step: number) {
      y += step;
      send('pointermove', 1);
    },
    lift() {
      send('pointerup', 0);
    },
  };
}

/**
 * Wheel steps of `dy` px each. `trackpad` adds the legacy `wheelDeltaY` that
 * Chromium and WebKit report for a trackpad, three times each delta against
 * the content. Without it, the gesture host reads a mouse wheel.
 */
function wheel(
  target: EventTarget,
  steps: number[],
  {trackpad}: {trackpad: boolean},
): void {
  for (const dy of steps) {
    clock += 16;
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 100,
      clientY: 100,
      deltaY: dy,
      deltaMode: 0,
    });
    Object.defineProperty(event, 'timeStamp', {value: clock});
    if (trackpad) {
      Object.defineProperty(event, 'wheelDeltaX', {value: 0});
      Object.defineProperty(event, 'wheelDeltaY', {value: -3 * dy});
    }
    act(() => {
      target.dispatchEvent(event);
    });
  }
}

function translateY(element: HTMLElement): number {
  const value = element.style.getPropertyValue('translate');
  if (value === '' || value === 'none') {
    return 0;
  }
  const parts = value.trim().split(/\s+/);
  return parseFloat(parts[1] ?? '0');
}

/** The app's indicator. */
function indicator(): HTMLElement {
  return content().firstElementChild as HTMLElement;
}

/** How much of the indicator the touch layer reveals, 0 to 1. */
function reveal(): string {
  return indicator().style.getPropertyValue('--astryx-refresh-reveal');
}

function content(): HTMLElement {
  return screen.getByTestId('refresh');
}

describe('useRefreshControl', () => {
  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    originalInnerHeight = window.innerHeight;
    useTouchScreen(true);
    // The page as tall as the scroll container, for anything that reads it.
    Object.defineProperty(window, 'innerHeight', {
      value: 334,
      configurable: true,
    });
    clock = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    window.matchMedia = originalMatchMedia;
    if (originalCss) {
      Object.defineProperty(window, 'CSS', originalCss);
    } else {
      Reflect.deleteProperty(window, 'CSS');
    }
    Object.defineProperty(window, 'innerHeight', {
      value: originalInnerHeight,
      configurable: true,
    });
    document.documentElement.style.overscrollBehaviorY = '';
  });

  it('pulls the content as UIKit does: one to one past the hysteresis, up to the height', () => {
    render(
      <Refreshable data-testid="refresh" onRefresh={() => {}}>
        <p>Inbox</p>
      </Refreshable>,
    );
    pull(content(), [12, 8, 20], false);
    // 40 px of finger travel, 10 of them the pan's hysteresis.
    expect(translateY(content())).toBeCloseTo(30, 5);
    touch('touchmove', content(), 170);
    expect(translateY(content())).toBeCloseTo(60, 5);
    touch('touchend', content(), 170, true);
  });

  it('triggers with the finger still down, then settles onto the refreshing inset', async () => {
    const onRefresh = vi.fn(() => new Promise<void>(() => {}));
    render(
      <Refreshable data-testid="refresh" onRefresh={onRefresh}>
        <p>Inbox</p>
      </Refreshable>,
    );
    pull(content(), [20, 20, 20, 20], false);
    expect(onRefresh).not.toHaveBeenCalled();
    // 105 px of travel: past the trigger (73 px of overscroll).
    touch('touchmove', content(), 205);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(content()).toHaveAttribute('aria-busy', 'true');
    expect(translateY(content())).toBeGreaterThan(74);
    expect(translateY(content())).toBeLessThan(95);
    // The next frame snaps to one to one with the finger, as UIKit does.
    touch('touchmove', content(), 210);
    expect(translateY(content())).toBeCloseTo(100, 5);
    touch('touchend', content(), 210, true);
    // The settle starts in the next frame; jsdom has no compositor, so it
    // lands on its target at once.
    await waitFor(() => expect(translateY(content())).toBeCloseTo(60, 5));
    await waitFor(() => expect(document.body).toHaveTextContent('Refreshing'));
  });

  it('pulls from the move that crosses the hysteresis, even one that lands on it exactly', () => {
    render(
      <Refreshable data-testid="refresh" onRefresh={() => {}}>
        <p>Inbox</p>
      </Refreshable>,
    );
    // 5 px steps: the second lands on the 10 px hysteresis, where the pan
    // begins at a translation of zero. The two after it pull 10 px.
    pull(content(), [5, 5, 5, 5], false);
    expect(translateY(content())).toBe(10);
  });

  it('keeps the indicator at the top of the scroll view while the content is pulled, settles and ends', async () => {
    let resolve: () => void = () => {};
    render(
      <Refreshable
        data-testid="refresh"
        onRefresh={() =>
          new Promise<void>(done => {
            resolve = done;
          })
        }>
        <p>Inbox</p>
      </Refreshable>,
    );
    const indicator = content().firstElementChild as HTMLElement;
    pull(content(), [30, 30, 30, 30], false);
    // UIRefreshControl stays where it is while the content moves away from it.
    // The indicator rides on the content's edge, so it moves back by what the
    // content moved past the inset.
    const pulled = translateY(content());
    expect(pulled).toBeGreaterThan(60);
    expect(translateY(indicator)).toBeCloseTo(60 - pulled, 5);
    touch('touchend', content(), 220, true);
    await waitFor(() => expect(translateY(content())).toBeCloseTo(60, 5));
    expect(translateY(indicator)).toBeCloseTo(0, 5);
    await act(async () => {
      resolve();
    });
    await waitFor(() => expect(translateY(content())).toBe(0));
    // Back at the top, the content's edge covers it.
    expect(translateY(indicator)).toBeCloseTo(60, 5);
  });

  it('leaves the content’s compositor layer to the animator: promoted once while it moves, given back at rest', async () => {
    let resolve: () => void = () => {};
    render(
      <Refreshable
        data-testid="refresh"
        onRefresh={() =>
          new Promise<void>(done => {
            resolve = done;
          })
        }>
        <p>Inbox</p>
      </Refreshable>,
    );
    const willChange = () => content().style.willChange;
    // A tap at the top moves nothing, so nothing is promoted.
    touch('touchstart', content(), 100);
    touch('touchend', content(), 100, true);
    expect(willChange()).toBe('');
    // A pull is promoted from its first move, once, and keeps the layer
    // through the refresh until the end has run.
    pull(content(), [30, 30, 30, 30]);
    expect(willChange()).toBe('translate');
    await act(async () => {
      resolve();
    });
    await waitFor(() => expect(willChange()).toBe(''), {timeout: 3000});
  });

  it('settles back to the top without refreshing below the trigger', async () => {
    const onRefresh = vi.fn();
    render(
      <Refreshable data-testid="refresh" onRefresh={onRefresh}>
        <p>Inbox</p>
      </Refreshable>,
    );
    pull(content(), [20, 20, 20, 10]);
    expect(onRefresh).not.toHaveBeenCalled();
    await waitFor(() => expect(translateY(content())).toBe(0));
    expect(content()).not.toHaveAttribute('aria-busy');
  });

  it('fades the indicator along the content settle curve when a pull ends below the trigger', () => {
    animators.list.length = 0;
    render(
      <Refreshable data-testid="refresh" onRefresh={() => {}}>
        <p>Inbox</p>
      </Refreshable>,
    );
    // A curve that no spring makes: the fade follows the settle's own curve.
    let from = 0;
    const settle: MotionCurve = {
      duration: 0.8,
      at: t => from * Math.max(0, 1 - t / 0.8),
      velocity: t => (t < 0.8 ? -from / 0.8 : 0),
    };
    const fade = watchFade(() => settle);
    pull(content(), [20, 20, 20, 10], false);
    from = translateY(content());
    expect(from).toBeGreaterThan(0);
    touch('touchend', content(), 170, true);
    const fades = fade.fades();
    expect(fades).toHaveLength(1);
    expect(fades[0].duration).toBe(0.8);
    const start = revealProgress(from, 334);
    for (const time of [0, 0.2, 0.4, 0.6, 0.8]) {
      expect(fades[0].at(time)).toBeCloseTo(
        revealProgress(settle.at(time), 334) / start,
        6,
      );
    }
  });

  it('holds the indicator under Reduce Motion, where the settle has no curve, and resets it once the content settles', async () => {
    animators.list.length = 0;
    render(
      <Refreshable data-testid="refresh" onRefresh={() => {}}>
        <p>Inbox</p>
      </Refreshable>,
    );
    const fade = watchFade(() => null);
    pull(content(), [20, 20, 20, 10]);
    expect(Number(reveal())).toBeGreaterThan(0);
    expect(fade.fades()).toEqual([]);
    await act(async () => {
      fade.finishSettle(true);
    });
    await waitFor(() => expect(reveal()).toBe('0'));
  });

  it('keeps what the indicator shows when a finger catches its fade, and the fade no longer resets it under the finger', async () => {
    animators.list.length = 0;
    render(
      <Refreshable data-testid="refresh" onRefresh={() => {}}>
        <p>Inbox</p>
      </Refreshable>,
    );
    const [, indicatorAnimator] = animators.list.slice(-2) as MotionEngine[];
    const play = vi.spyOn(indicatorAnimator, 'play');
    // Released below the trigger: the settle back and the fade start.
    pull(content(), [20, 20, 20, 10]);
    const fadeAt = play.mock.calls.findIndex(([curves]) => 'opacity' in curves);
    expect(fadeAt).toBeGreaterThanOrEqual(0);
    const fade = play.mock.results[fadeAt].value as ReturnType<
      MotionEngine['play']
    >;
    const shown = Number(reveal());
    expect(shown).toBeGreaterThan(0);
    // A finger catches the settle halfway through the fade.
    const presentedGet = indicatorAnimator.get.bind(indicatorAnimator);
    const presented = vi
      .spyOn(indicatorAnimator, 'get')
      .mockImplementation(property =>
        property === 'opacity' ? 0.5 : presentedGet(property),
      );
    const set = vi.spyOn(indicatorAnimator, 'set');
    touch('touchstart', content(), 100);
    presented.mockRestore();
    expect(Number(reveal())).toBeCloseTo(shown * 0.5, 6);
    expect(set).toHaveBeenCalledWith({opacity: 1});
    // The finger pulls on. The fade ends stopped, so it never resets the
    // indicator under the finger.
    touch('touchmove', content(), 110);
    touch('touchmove', content(), 120);
    let isFadeDone: boolean | undefined;
    await act(async () => {
      isFadeDone = await fade.finished;
    });
    expect(isFadeDone).toBe(false);
    expect(Number(reveal())).toBeGreaterThan(0);
  });

  it('ends when the promise from onRefresh settles, and removes the inset', async () => {
    let resolve: () => void = () => {};
    const onRefresh = vi.fn(
      () =>
        new Promise<void>(done => {
          resolve = done;
        }),
    );
    render(
      <Refreshable data-testid="refresh" onRefresh={onRefresh}>
        <p>Inbox</p>
      </Refreshable>,
    );
    pull(content(), [30, 30, 30, 30]);
    expect(content()).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      resolve();
    });
    expect(content()).not.toHaveAttribute('aria-busy');
    // The slide starts in the frame after the end has rendered.
    await waitFor(() => expect(translateY(content())).toBe(0));
  });

  it('ends after a rejected refresh as well', async () => {
    let reject: () => void = () => {};
    render(
      <Refreshable
        data-testid="refresh"
        onRefresh={() =>
          new Promise<void>((_, fail) => {
            reject = () => fail(new Error('offline'));
          })
        }>
        <p>Inbox</p>
      </Refreshable>,
    );
    pull(content(), [30, 30, 30, 30]);
    await act(async () => {
      reject();
    });
    expect(content()).not.toHaveAttribute('aria-busy');
  });

  it('follows a controlled isRefreshing without calling onRefresh for it', () => {
    const onRefresh = vi.fn();
    const {rerender} = render(
      <Refreshable
        data-testid="refresh"
        onRefresh={onRefresh}
        isRefreshing={false}>
        <p>Inbox</p>
      </Refreshable>,
    );
    rerender(
      <Refreshable data-testid="refresh" onRefresh={onRefresh} isRefreshing>
        <p>Inbox</p>
      </Refreshable>,
    );
    expect(content()).toHaveAttribute('aria-busy', 'true');
    expect(onRefresh).not.toHaveBeenCalled();
    rerender(
      <Refreshable
        data-testid="refresh"
        onRefresh={onRefresh}
        isRefreshing={false}>
        <p>Inbox</p>
      </Refreshable>,
    );
    expect(content()).not.toHaveAttribute('aria-busy');
  });

  it('keeps a pulled refresh running while a controlled parent holds it, until the parent ends it', async () => {
    let end: () => void = () => {};
    function Parent() {
      const [refreshing, setRefreshing] = useState(false);
      end = () => setRefreshing(false);
      return (
        <Refreshable
          data-testid="refresh"
          onRefresh={() => setRefreshing(true)}
          isRefreshing={refreshing}>
          <p>Inbox</p>
        </Refreshable>
      );
    }
    render(<Parent />);
    pull(content(), [30, 30, 30, 30]);
    await waitFor(() => expect(content()).toHaveAttribute('aria-busy', 'true'));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(content()).toHaveAttribute('aria-busy', 'true');
    act(() => {
      end();
    });
    await waitFor(() => expect(content()).not.toHaveAttribute('aria-busy'));
  });

  it.each(['pen', 'mouse'] as const)(
    'never pulls under a %s drag: it stays the browser’s, for text selection',
    pointerType => {
      useTouchScreen(false);
      const onRefresh = vi.fn();
      render(
        <Refreshable data-testid="refresh" onRefresh={onRefresh}>
          <p>Inbox</p>
        </Refreshable>,
      );
      const drag = pointerDrag(content(), pointerType);
      // 105 px of travel: past the trigger, were it a finger.
      for (const step of [12, 8, 20, 20, 20, 25]) {
        drag.move(step);
      }
      expect(translateY(content())).toBe(0);
      drag.lift();
      expect(onRefresh).not.toHaveBeenCalled();
      expect(content()).not.toHaveAttribute('aria-busy');
    },
  );

  it('takes a scroll only through a pan that claims it: the touch pull is a watcher and takes none, and the content’s only blocking listener is the scroll pull’s `wheel` (spec:AST-094 FR20)', () => {
    useTouchScreen(false);
    const enabled = vi.spyOn(GestureRecognizer.prototype, 'setEnabled');
    const added = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    try {
      render(
        <Refreshable data-testid="refresh" onRefresh={() => {}}>
          <p>Inbox</p>
        </Refreshable>,
      );
      const pans = [...new Set(enabled.mock.contexts as GestureRecognizer[])];
      expect(pans).toHaveLength(2);
      for (const pan of pans) {
        // A watcher registers only passive listeners. A pan that takes a
        // scroll gets a blocking `wheel` listener, so only a claimer may take a
        // scroll.
        expect(pan.allowedScrollTypes.size > 0).toBe(pan.claimsTouches);
      }
      const blocking = added.mock.calls
        .filter(
          (call, index) =>
            added.mock.contexts[index] === content() &&
            typeof call[2] === 'object' &&
            call[2] != null &&
            call[2].passive === false,
        )
        .map(call => call[0]);
      expect(blocking).toEqual(['wheel']);
    } finally {
      enabled.mockRestore();
      added.mockRestore();
    }
  });

  it('pulls under a trackpad’s two-finger scroll at the top as under a finger: the same mapping, a trigger, the settle onto the inset once the scroll ends (spec:AST-094 FR43)', async () => {
    useTouchScreen(false);
    const onRefresh = vi.fn(() => new Promise<void>(() => {}));
    render(
      <Refreshable data-testid="refresh" onRefresh={onRefresh}>
        <p>Inbox</p>
      </Refreshable>,
    );
    wheel(content(), [-12, -8, -20], {trackpad: true});
    // 40 px of scroll toward the top, 10 of them the pan's hysteresis, as
    // under a finger.
    expect(translateY(content())).toBeCloseTo(30, 5);
    wheel(content(), [-20, -20, -25], {trackpad: true});
    // 105 px: past the trigger (73 px of overscroll), mid-scroll.
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(content()).toHaveAttribute('aria-busy', 'true');
    // The scroll ends 100 ms after its last step: the content settles onto
    // the inset.
    await waitFor(() => expect(translateY(content())).toBeCloseTo(60, 5));
  });

  it('keeps the page’s text selection through a trackpad pull: a scroll selects nothing (spec:AST-094 FR43)', async () => {
    useTouchScreen(false);
    render(
      <Refreshable data-testid="refresh" onRefresh={() => {}}>
        <p>Inbox</p>
      </Refreshable>,
    );
    act(() => {
      document.getSelection()?.selectAllChildren(content());
    });
    wheel(content(), [-12, -8, -20], {trackpad: true});
    expect(translateY(content())).toBeGreaterThan(0);
    expect(document.getSelection()?.isCollapsed).toBe(false);
    await waitFor(() => expect(translateY(content())).toBe(0));
    expect(document.getSelection()?.isCollapsed).toBe(false);
  });

  it('never pulls under a mouse wheel’s notches: they scroll what is under the pointer (spec:AST-094 FR43)', () => {
    useTouchScreen(false);
    const onRefresh = vi.fn();
    render(
      <Refreshable data-testid="refresh" onRefresh={onRefresh}>
        <p>Inbox</p>
      </Refreshable>,
    );
    wheel(content(), [-100, -100], {trackpad: false});
    expect(translateY(content())).toBe(0);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('pulls on any touch screen, an Android phone’s included: one touch model, no iOS check', async () => {
    useIos(false);
    const onRefresh = vi.fn();
    const {unmount} = render(
      <Refreshable data-testid="refresh" onRefresh={onRefresh}>
        <p>Inbox</p>
      </Refreshable>,
    );
    // The pull owns its container's top edge, so the browser draws no
    // overscroll of its own there.
    expect(screen.getByTestId('list').style.overscrollBehaviorY).toBe('none');
    pull(content(), [30, 30, 30, 30]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(content()).not.toHaveAttribute('aria-busy'));
    await waitFor(() => expect(translateY(content())).toBe(0));
    unmount();
    render(<p data-testid="refresh">Gone</p>);
  });

  it('ends a pulled refresh on the next commit when a controlled isRefreshing stays false', async () => {
    // The parent never takes the refresh (or sets true then false in one
    // handler): the prop is the source, so the refresh ends.
    const onRefresh = vi.fn();
    render(
      <Refreshable
        data-testid="refresh"
        onRefresh={onRefresh}
        isRefreshing={false}>
        <p>Inbox</p>
      </Refreshable>,
    );
    pull(content(), [30, 30, 30, 30]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(content()).not.toHaveAttribute('aria-busy'));
    await waitFor(() => expect(translateY(content())).toBe(0));
  });

  it('renders a controlled isRefreshing from its first render', () => {
    const seen: boolean[] = [];
    function Probe({isRefreshing}: {isRefreshing: boolean}) {
      const control = useRefreshControl({isRefreshing});
      seen.push(control.isRefreshing);
      return <div ref={control.contentRef} />;
    }
    render(<Probe isRefreshing />);
    // No first render with the refresh off.
    expect(seen[0]).toBe(true);
  });

  it('leaves no inline translate on the content at rest, so its fixed children stay fixed', async () => {
    let resolve: () => void = () => {};
    render(
      <Refreshable
        data-testid="refresh"
        onRefresh={() =>
          new Promise<void>(done => {
            resolve = done;
          })
        }>
        <p>Inbox</p>
      </Refreshable>,
    );
    // Any translate, 0 included, makes the content the containing block of
    // its `position: fixed` children.
    pull(content(), [20, 20, 20, 10]);
    await waitFor(() =>
      expect(content().style.getPropertyValue('translate')).toBe(''),
    );
    pull(content(), [30, 30, 30, 30]);
    await waitFor(() => expect(translateY(content())).toBeCloseTo(60, 5));
    await act(async () => {
      resolve();
    });
    await waitFor(() =>
      expect(content().style.getPropertyValue('translate')).toBe(''),
    );
  });

  it('holds one scroll listener, on its scroll container, only while enabled, and no resize listener (spec:AST-094 FR24)', () => {
    // Optional behavior holds its resources only while enabled. Other parts,
    // such as the gesture host, keep their own, so the test compares a
    // disabled pull with an enabled one.
    const listenersFor = (isDisabled: boolean) => {
      const onDocument = vi.spyOn(document, 'addEventListener');
      const onElements = vi.spyOn(HTMLElement.prototype, 'addEventListener');
      const onWindow = vi.spyOn(window, 'addEventListener');
      const {unmount} = render(
        <Refreshable
          data-testid="refresh"
          onRefresh={() => {}}
          isDisabled={isDisabled}>
          <p>Inbox</p>
        </Refreshable>,
      );
      const list = screen.getByTestId('list');
      const counts = {
        documentScroll: onDocument.mock.calls.filter(
          call => call[0] === 'scroll',
        ).length,
        listScroll: onElements.mock.instances.filter(
          (element, index) =>
            element === list && onElements.mock.calls[index][0] === 'scroll',
        ).length,
        resize: onWindow.mock.calls.filter(call => call[0] === 'resize').length,
      };
      unmount();
      onDocument.mockRestore();
      onElements.mockRestore();
      onWindow.mockRestore();
      return counts;
    };
    const disabled = listenersFor(true);
    const enabled = listenersFor(false);
    expect(enabled.documentScroll).toBe(0);
    expect(enabled.listScroll - disabled.listScroll).toBe(1);
    expect(enabled.resize - disabled.resize).toBe(0);
    render(<p data-testid="refresh">Gone</p>);
  });

  it('sets up the edge for content that mounts after the hook: its container is claimed near the top, given back when scrolled away, and given back when the content leaves', async () => {
    function Late({isShown}: {isShown: boolean}) {
      const control = useRefreshControl({
        onRefresh: () => {},
        announce: 'Refreshing',
      });
      return (
        <div data-testid="list" ref={measured} style={{overflowY: 'auto'}}>
          {isShown ? (
            <div data-testid="refresh" ref={control.contentRef}>
              <div ref={control.indicatorRef} aria-hidden />
              <p>Inbox</p>
            </div>
          ) : null}
        </div>
      );
    }
    const {rerender} = render(<Late isShown={false} />);
    // The hook's own setup, two frames after it mounts, finds no content.
    await act(async () => {
      for (let frame = 0; frame < 3; frame += 1) {
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve());
        });
      }
    });
    const list = screen.getByTestId('list');
    const onList = vi.spyOn(list, 'addEventListener');
    const offList = vi.spyOn(list, 'removeEventListener');
    rerender(<Late isShown />);
    expect(list.style.overscrollBehaviorY).toBe('none');
    expect(onList.mock.calls.filter(call => call[0] === 'scroll')).toHaveLength(
      1,
    );
    // Scrolled away from the top, the container's edge is the browser's
    // again; back at the top, the pull claims it again.
    const scrollTo = (top: number) => {
      list.scrollTop = top;
      act(() => {
        list.dispatchEvent(new Event('scroll'));
      });
    };
    scrollTo(500);
    expect(list.style.overscrollBehaviorY).toBe('');
    scrollTo(0);
    expect(list.style.overscrollBehaviorY).toBe('none');
    rerender(<Late isShown={false} />);
    expect(list.style.overscrollBehaviorY).toBe('');
    expect(
      offList.mock.calls.filter(call => call[0] === 'scroll'),
    ).toHaveLength(1);
    onList.mockRestore();
    offList.mockRestore();
  });

  it('ends a refresh that begins and ends before React renders: refresh() from a timer, with an onRefresh that settles at once', async () => {
    let refresh: () => void = () => {};
    function Probe() {
      const control = useRefreshControl({onRefresh: () => {}});
      refresh = control.refresh;
      return (
        <div
          data-testid="refresh"
          ref={control.contentRef}
          aria-busy={control.isRefreshing || undefined}>
          <div ref={control.indicatorRef} aria-hidden />
          <p>Inbox</p>
        </div>
      );
    }
    render(<Probe />);
    // Outside any React event, so the begin and the end land in one render
    // and the rendered `isRefreshing` never changes.
    await new Promise<void>(resolve =>
      setTimeout(() => {
        refresh();
        resolve();
      }, 0),
    );
    // The inset went on with no visible motion; the end slides it off.
    await waitFor(() => expect(translateY(content())).toBe(0), {
      timeout: 3000,
    });
    expect(content()).not.toHaveAttribute('aria-busy');
  });

  it('does not pull while disabled', () => {
    const onRefresh = vi.fn();
    render(
      <Refreshable data-testid="refresh" onRefresh={onRefresh} isDisabled>
        <p>Inbox</p>
      </Refreshable>,
    );
    pull(content(), [30, 30, 30, 30]);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(translateY(content())).toBe(0);
  });

  it('owns the top edge of the scroll container it sits in, not the page’s', () => {
    const {unmount} = render(
      <div
        data-testid="scroller"
        ref={measured}
        style={{overflowY: 'auto', overscrollBehaviorY: 'contain'}}>
        <Refreshable data-testid="refresh" isBare onRefresh={() => {}}>
          <p>Inbox</p>
        </Refreshable>
      </div>,
    );
    const scroller = screen.getByTestId('scroller');
    expect(scroller.style.overscrollBehaviorY).toBe('none');
    expect(document.documentElement.style.overscrollBehaviorY).toBe('');
    unmount();
  });

  it('finds a scroll container that starts scrolling only after mount, as ScrollableArea does once it has measured', async () => {
    const {unmount} = render(
      <div
        data-testid="scroller"
        ref={measured}
        style={{overflowY: 'clip', overscrollBehaviorY: 'auto'}}>
        <Refreshable data-testid="refresh" isBare onRefresh={() => {}}>
          <p>Inbox</p>
        </Refreshable>
      </div>,
    );
    const scroller = screen.getByTestId('scroller');
    // Not scrolling yet: no element scrolls, and the page's own top edge
    // stays the browser's.
    expect(scroller.style.overscrollBehaviorY).toBe('auto');
    expect(document.documentElement.style.overscrollBehaviorY).toBe('');
    // The container's next render makes it scroll.
    scroller.style.overflowY = 'auto';
    await waitFor(() =>
      expect(scroller.style.overscrollBehaviorY).toBe('none'),
    );
    expect(document.documentElement.style.overscrollBehaviorY).toBe('');
    unmount();
    expect(scroller.style.overscrollBehaviorY).toBe('auto');
  });

  it('follows its scroll container’s scrolls: the top edge is the pull’s only near the top', () => {
    render(
      <div data-testid="scroller" ref={measured} style={{overflowY: 'auto'}}>
        <Refreshable data-testid="refresh" isBare onRefresh={() => {}}>
          <p>Inbox</p>
        </Refreshable>
      </div>,
    );
    const scroller = screen.getByTestId('scroller');
    expect(scroller.style.overscrollBehaviorY).toBe('none');
    const scrollTo = (top: number) => {
      Object.defineProperty(scroller, 'scrollTop', {
        value: top,
        configurable: true,
      });
      act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });
    };
    // Far from the top the browser keeps its own overscroll (the bottom
    // bounce), and near the top the pull takes it back.
    scrollTo(500);
    expect(scroller.style.overscrollBehaviorY).toBe('');
    scrollTo(0);
    expect(scroller.style.overscrollBehaviorY).toBe('none');
  });

  it('restores the scroll container’s own value when it unmounts', () => {
    function Host({hasControl}: {hasControl: boolean}) {
      return (
        <div data-testid="scroller" ref={measured} style={{overflowY: 'auto'}}>
          {hasControl ? (
            <Refreshable data-testid="refresh" isBare onRefresh={() => {}}>
              <p>Inbox</p>
            </Refreshable>
          ) : (
            <p>Inbox</p>
          )}
        </div>
      );
    }
    const {rerender} = render(<Host hasControl />);
    const scroller = screen.getByTestId('scroller');
    expect(scroller.style.overscrollBehaviorY).toBe('none');
    rerender(<Host hasControl={false} />);
    expect(scroller.style.overscrollBehaviorY).toBe('');
  });
  it('shows the indicator in full for a refresh begun without a pull', () => {
    function WithButton() {
      const control = useRefreshControl({
        onRefresh: () => new Promise<void>(() => {}),
      });
      return (
        <div data-testid="list" ref={measured} style={{overflowY: 'auto'}}>
          <div data-testid="refresh" ref={control.contentRef}>
            <div ref={control.indicatorRef} aria-hidden />
            <button type="button" onClick={control.refresh}>
              Refresh
            </button>
          </div>
        </div>
      );
    }
    render(<WithButton />);
    expect(reveal()).toBe('');
    act(() => {
      screen.getByRole('button', {name: 'Refresh'}).click();
    });
    expect(reveal()).toBe('1');
  });

  it('reveals the indicator with the pull, and hides it again when a refresh ends under the finger', async () => {
    function Controlled({isRefreshing}: {isRefreshing: boolean}) {
      return (
        <Refreshable
          data-testid="refresh"
          isRefreshing={isRefreshing}
          onRefresh={() => {}}>
          <p>Inbox</p>
        </Refreshable>
      );
    }
    const {rerender} = render(<Controlled isRefreshing={false} />);
    // Part of the way to the trigger: part of the indicator.
    pull(content(), [20, 20], false);
    const partway = Number(reveal());
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(1);
    // Past the trigger, the finger still down: all of it.
    for (const step of [30, 30]) {
      touch('touchmove', content(), 140 + step);
    }
    rerender(<Controlled isRefreshing />);
    expect(reveal()).toBe('1');
    rerender(<Controlled isRefreshing={false} />);
    touch('touchend', content(), 200, true);
    await waitFor(() => expect(reveal()).toBe('0'));
  });

  it('pulls only in an element that scrolls: on the page itself the browser keeps its own top edge', () => {
    document.documentElement.style.overscrollBehaviorY = 'auto';
    const onRefresh = vi.fn();
    render(
      <Refreshable data-testid="refresh" isBare onRefresh={onRefresh}>
        <p>Inbox</p>
      </Refreshable>,
    );
    expect(document.documentElement.style.overscrollBehaviorY).toBe('auto');
    pull(content(), [30, 30, 30, 30]);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(translateY(content())).toBe(0);
    document.documentElement.style.overscrollBehaviorY = '';
  });

  it('leaves a scroll container that fits to the browser: no top-edge claim and no pull (spec:AST-025 FR14, FR18)', () => {
    const onRefresh = vi.fn();
    render(
      <div
        data-testid="scroller"
        ref={element => {
          if (element != null) {
            sized(element, {client: 334, scroll: 334});
          }
        }}
        style={{overflowY: 'auto'}}>
        <Refreshable data-testid="refresh" isBare onRefresh={onRefresh}>
          <p>Inbox</p>
        </Refreshable>
      </div>,
    );
    // A scroll that starts here belongs to the page around the list. So the
    // list keeps no containment, and the pull takes nothing.
    expect(screen.getByTestId('scroller').style.overscrollBehaviorY).toBe('');
    pull(content(), [30, 30, 30, 30]);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(translateY(content())).toBe(0);
  });

  it('claims the top edge once its container overflows, and gives it back when the content fits again (spec:AST-025 FR14)', () => {
    type Dispatch = (entries: ResizeObserverEntry[]) => void;
    const observers: {callback: Dispatch; isConnected: boolean}[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        state: {callback: Dispatch; isConnected: boolean};
        constructor(callback: Dispatch) {
          this.state = {callback, isConnected: true};
          observers.push(this.state);
        }
        observe() {
          this.state.isConnected = true;
        }
        unobserve() {}
        disconnect() {
          this.state.isConnected = false;
        }
      },
    );
    const {unmount} = render(
      <div
        data-testid="scroller"
        ref={element => {
          if (element != null) {
            sized(element, {client: 334, scroll: 334});
          }
        }}
        style={{overflowY: 'auto'}}>
        <Refreshable data-testid="refresh" isBare onRefresh={() => {}}>
          <p>Inbox</p>
        </Refreshable>
      </div>,
    );
    const scroller = screen.getByTestId('scroller');
    const resize = (scroll: number) => {
      sized(scroller, {client: 334, scroll});
      act(() => {
        for (const observer of observers) {
          observer.callback([
            {target: scroller} as unknown as ResizeObserverEntry,
          ]);
        }
      });
    };
    expect(scroller.style.overscrollBehaviorY).toBe('');
    resize(1000);
    expect(scroller.style.overscrollBehaviorY).toBe('none');
    resize(334);
    expect(scroller.style.overscrollBehaviorY).toBe('');
    unmount();
    expect(observers.length).toBeGreaterThan(0);
    expect(observers.some(observer => observer.isConnected)).toBe(false);
  });

  it('never scrolls the page: a refresh begun with no container that overflows moves no scroll', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    function OnThePage() {
      const control = useRefreshControl({
        onRefresh: () => new Promise<void>(() => {}),
      });
      return (
        <div data-testid="refresh" ref={control.contentRef}>
          <div ref={control.indicatorRef} aria-hidden />
          <button type="button" onClick={control.refresh}>
            Refresh
          </button>
        </div>
      );
    }
    render(<OnThePage />);
    act(() => {
      screen.getByRole('button', {name: 'Refresh'}).click();
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('calls onRefresh once: a pull while refreshing only stretches', async () => {
    const onRefresh = vi.fn(() => new Promise<void>(() => {}));
    render(
      <Refreshable data-testid="refresh" onRefresh={onRefresh}>
        <p>Inbox</p>
      </Refreshable>,
    );
    pull(content(), [30, 30, 30, 30]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(translateY(content())).toBeCloseTo(60, 5));
    // Far past the trigger again, beyond the inset too.
    pull(content(), [30, 30, 30, 30, 30, 30]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(content()).toHaveAttribute('aria-busy', 'true');
  });

  it("starts each release's settle at the content's speed as the finger lifts: the finger's speed where it tracks one to one, less in the rubber band, and the same onto the refreshing inset", () => {
    // The gesture arena keeps one clock for the page across tests. The
    // events start past it, and the browser's clock follows them, so real
    // time between two events never reads as a pause before a lift. Both
    // clocks are put back afterwards.
    const eventClock = clock;
    clock = performance.now() + 100_000;
    const browserNow = vi
      .spyOn(performance, 'now')
      .mockImplementation(() => clock);
    const scrollVelocity = vi.spyOn(
      PanGestureRecognizer.prototype,
      'scrollVelocity',
    );
    try {
      const release = (
        steps: number[],
        onRefresh: UseRefreshControlOptions['onRefresh'] = () => {},
      ) => {
        animators.list.length = 0;
        const {unmount} = render(
          <Refreshable data-testid="refresh" onRefresh={onRefresh}>
            <p>Inbox</p>
          </Refreshable>,
        );
        const [contentAnimator, indicatorAnimator] = animators.list.slice(
          -2,
        ) as MotionEngine[];
        const contentAnimate = vi.spyOn(contentAnimator, 'animate');
        const indicatorAnimate = vi.spyOn(indicatorAnimator, 'animate');
        scrollVelocity.mockClear();
        pull(content(), steps);
        const [to, transition] = contentAnimate.mock.calls.at(-1) ?? [];
        const result = {
          to: to?.y,
          content: transition?.velocity?.y,
          indicator: indicatorAnimate.mock.calls.at(-1)?.[1].velocity?.y,
          scroll: scrollVelocity.mock.results.at(-1)?.value?.y as
            number | undefined,
          isBusy: content().getAttribute('aria-busy') === 'true',
        };
        unmount();
        return result;
      };
      // 10 px a frame of 16 ms is 625 px/s.
      const tracked = release([10, 10, 10, 10, 10]);
      expect(tracked.to).toBe(0);
      expect(tracked.content).toBeCloseTo(625, 6);
      expect(tracked.indicator).toBeCloseTo(-625, 6);
      // Past the one-to-one stretch the content moves slower than the finger.
      const banded = release([10, 10, 10, 10, 10, 10, 10, 10]);
      expect(banded.content).toBeGreaterThan(0);
      expect(banded.content).toBeLessThan(625);
      expect(banded.indicator).toBeCloseTo(-(banded.content ?? 0), 6);
      // An accelerating flick hands the scroll view's release velocity, the
      // blend of the pan's last two values, below its last frame's speed.
      const flick = release([5, 5, 5, 10, 15]);
      expect(flick.scroll).toBeGreaterThan(0);
      expect(flick.content).toBeCloseTo(flick.scroll ?? Number.NaN, 6);
      expect(flick.content).toBeLessThan(15 / 0.016);
      // A finger that held still before it lifted hands no speed.
      expect(release([10, 10, 10, 10, 0, 0, 0, 0, 0, 0]).content).toBe(0);
      // A pull that triggers carries its speed onto the refreshing inset.
      const inset = release(
        [20, 20, 20, 20, 20, 20, 20, 20],
        () => new Promise<void>(() => {}),
      );
      expect(inset.isBusy).toBe(true);
      expect(inset.to).toBe(60);
      expect(inset.content).toBeGreaterThan(600);
    } finally {
      scrollVelocity.mockRestore();
      browserNow.mockRestore();
      clock = eventClock;
    }
  });
});
