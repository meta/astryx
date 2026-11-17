// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollableArea.test.tsx
 * @input Shared scroll hook, mocked geometry, and observed DOM changes
 * @output Regression coverage for measurement, composition, and stable viewport access
 * @position DOM-level hook contract; native traversal is verified in browser tests
 */

import {act, render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {
  Profiler,
  StrictMode,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  useScrollableArea,
  type ScrollAxis,
  type ScrollOverscroll,
  type ScrollStickyContainment,
} from './useScrollableArea';
import {
  findNearestScrollOwner,
  getRegisteredScrollOwnerState,
} from './scrollOwnerRegistry';
import {getLogicalAxisMapping} from './scrollGeometry';
import {subscribeScrollGeometry} from './scrollGeometrySubscriptions';

const testStyles = stylex.create({
  viewport: {borderWidth: 1, borderStyle: 'solid'},
  contentMinWidth: (minWidth: string) => ({minWidth}),
});

interface FixtureProps {
  axis?: ScrollAxis;
  chaining?: ScrollOverscroll;
  keyboardOwner?: 'viewport' | 'contentOrViewport';
  stickyContainment?: ScrollStickyContainment;
  externalRef?: Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

function Fixture({
  axis = 'inline',
  chaining = 'allow',
  keyboardOwner = 'viewport',
  stickyContainment,
  externalRef,
  onScroll,
}: FixtureProps) {
  const {getViewportProps, getContentProps, state} = useScrollableArea({
    axis,
    keyboardAccess: {
      owner: keyboardOwner,
      label: 'Scrollable results',
      role: 'region',
    },
    overscroll: chaining,
    stickyContainment,
  });

  return (
    <>
      <div
        data-testid="viewport"
        {...getViewportProps({
          ref: externalRef,
          onScroll,
          xstyle: testStyles.viewport,
          style: {backgroundColor: 'red', overflowX: 'scroll'},
        })}>
        <div data-testid="content" {...getContentProps()}>
          <span data-testid="descendant">Content</span>
        </div>
      </div>
      <output data-testid="state">{JSON.stringify(state)}</output>
    </>
  );
}

function setGeometry(
  element: HTMLElement,
  values: Partial<
    Pick<
      HTMLElement,
      | 'clientWidth'
      | 'clientHeight'
      | 'scrollWidth'
      | 'scrollHeight'
      | 'scrollLeft'
      | 'scrollTop'
    >
  >,
) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
}

function state(): {
  inline: {isScrollable: boolean; atStart: boolean; atEnd: boolean};
  block: {isScrollable: boolean; atStart: boolean; atEnd: boolean};
} {
  return JSON.parse(screen.getByTestId('state').textContent ?? '{}');
}

function makeMeasurable(viewport: HTMLElement) {
  setGeometry(viewport, {
    clientWidth: 100,
    clientHeight: 100,
    scrollWidth: 100,
    scrollHeight: 100,
    scrollLeft: 0,
    scrollTop: 0,
  });
}

/**
 * As in a browser, the computed overflow is the one the hook writes: an axis is
 * `clip` until the hook lets it scroll. `writingMode` reads the current mode.
 */
function mockOwnedComputedStyle(
  writingMode: () => string = () => 'horizontal-tb',
) {
  vi.mocked(window.getComputedStyle).mockImplementation(element => {
    const owned = (axis: 'X' | 'Y') =>
      element
        .getAttribute('style')
        ?.match(new RegExp(`--x-overflow${axis}:\\s*(\\w+)`))?.[1] ?? 'visible';
    return new Proxy({} as CSSStyleDeclaration, {
      get(_target, property) {
        if (property === 'overflowX') {
          return owned('X');
        }
        if (property === 'overflowY') {
          return owned('Y');
        }
        if (property === 'writingMode') {
          return writingMode();
        }
        if (property === 'direction') {
          return 'ltr';
        }
        return property === 'display' ? 'block' : '';
      },
    });
  });
}

describe('useScrollableArea', () => {
  let frames: FrameRequestCallback[];
  // A computed `direction` set by a stylesheet alone: no attribute changes.
  let stylesheetDirection: string | null;
  // The callbacks handed to ResizeObserver, to report a resize from a test.
  let resizeObservers: ResizeObserverCallback[];

  beforeEach(() => {
    frames = [];
    stylesheetDirection = null;
    resizeObservers = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function (callback: ResizeObserverCallback) {
        resizeObservers.push(callback);
        return {observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn()};
      }),
    );
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      const computed = nativeGetComputedStyle(element);
      return new Proxy(computed, {
        // eslint-disable-next-line @typescript-eslint/promise-function-async -- Proxy traps must remain synchronous
        get(target, property) {
          if (element instanceof HTMLElement && property === 'overflowX') {
            return element.style.overflowX || 'auto';
          }
          if (element instanceof HTMLElement && property === 'overflowY') {
            return element.style.overflowY || 'auto';
          }
          if (property === 'direction' && stylesheetDirection != null) {
            return stylesheetDirection;
          }
          return Reflect.get(target, property, target);
        },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function flushFrame() {
    void act(() => {
      const pending = frames.splice(0);
      pending.forEach(callback => callback(performance.now()));
    });
  }

  function setInlineOverflow(viewport: HTMLElement, isOverflowing: boolean) {
    setGeometry(viewport, {scrollWidth: isOverflowing ? 180 : 100});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
  }

  /** Focus listener changes in call order, as `add focusin <test id>`. */
  function recordFocusListeners() {
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const changes = (verb: string, spy: typeof add | typeof remove) =>
      spy.mock.calls.flatMap(([type], index) => {
        const target = spy.mock.contexts[index];
        return target instanceof HTMLElement &&
          target.dataset.testid != null &&
          (type === 'focusin' || type === 'focusout')
          ? [
              {
                order: spy.mock.invocationCallOrder[index],
                change: `${verb} ${type} ${target.dataset.testid}`,
              },
            ]
          : [];
      });
    return () =>
      [...changes('add', add), ...changes('remove', remove)]
        .sort((a, b) => a.order - b.order)
        .map(({change}) => change);
  }

  it('reports a change below the content root as content only and an outer change as layout', async () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    flushFrame();
    const calls: [boolean, boolean][] = [];
    const stop = subscribeScrollGeometry(viewport, (isContent, isLayout) =>
      calls.push([isContent, isLayout]),
    );
    await act(async () => {
      screen.getByTestId('descendant').append(document.createElement('b'));
    });
    flushFrame();
    expect(calls.at(-1)).toEqual([true, false]);
    await act(async () => {
      viewport.parentElement?.setAttribute('class', 'resized');
    });
    flushFrame();
    expect(calls.at(-1)).toEqual([true, true]);
    stop();
  });

  it('starts inactive and fitting without creating a tab stop', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');

    expect(state()).toEqual({
      inline: {isScrollable: false, atStart: true, atEnd: true},
      block: {isScrollable: false, atStart: true, atEnd: true},
    });
    expect(viewport).not.toHaveAttribute('tabindex');
    expect(viewport).toHaveAttribute('role', 'region');
    expect(viewport).toHaveAccessibleName('Scrollable results');
    expect(viewport).not.toHaveAttribute('xstyle');
    expect(viewport.style.backgroundColor).toBe('red');
    expect(viewport.style.overflowX).toBe('');
    expect(viewport.getAttribute('style')).toContain('clip');
  });

  it('is a tab stop from the first frame its content overflows, before any animation frame (AST-025 FR12)', () => {
    mockOwnedComputedStyle();
    // Content that is already taller than the viewport when it mounts, such
    // as loaded data replacing a loading fallback.
    const extent = (value: number, scrolled: number) =>
      function (this: HTMLElement) {
        return this.dataset.testid === 'viewport' ? scrolled : value;
      };
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
      extent(100, 100),
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
      extent(100, 100),
    );
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
      extent(100, 100),
    );
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      extent(100, 180),
    );

    render(<Fixture axis="block" />);
    const viewport = screen.getByTestId('viewport');

    // No animation frame has run.
    expect(viewport.getAttribute('style')).toContain('--x-overflowY: auto');
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(state().block.isScrollable).toBe(true);
  });

  it('settles content that fits only once a scrollbar takes space, without looping in one commit (AST-025 FR7)', () => {
    mockOwnedComputedStyle();
    // Under `clip` the content is 105 tall and overflows; under `auto` its
    // scrollbar narrows it and it fits (a 16:9 child at full width).
    const viewportOverflowY = (element: HTMLElement) =>
      element.getAttribute('style')?.match(/--x-overflowY:\s*(\w+)/)?.[1];
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.testid === 'viewport' &&
          viewportOverflowY(this) !== 'auto'
          ? 105
          : 100;
      },
    );

    expect(() => render(<Fixture axis="block" />)).not.toThrow();
    // At most one flip per animation frame, as before.
    expect(() => flushFrame()).not.toThrow();
    expect(() => flushFrame()).not.toThrow();
  });

  it('leaves one frame pending after an overflowing mount, and none after unmount (AST-025 FR7)', async () => {
    mockOwnedComputedStyle();
    const pending = new Set<number>();
    let nextId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => {
        nextId += 1;
        pending.add(nextId);
        return nextId;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => pending.delete(id)),
    );
    const extent = (fits: number, viewport: number) =>
      function (this: HTMLElement) {
        return this.dataset.testid === 'viewport' ? viewport : fits;
      };
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      extent(100, 180),
    );

    const {unmount} = render(<Fixture axis="block" />);
    // Let the style change reach the MutationObserver.
    await act(async () => {});
    expect(screen.getByTestId('viewport')).toHaveAttribute('tabindex', '0');
    expect(pending.size).toBe(1);

    unmount();
    expect(pending.size).toBe(0);
  });

  it('leaves an ancestor that moves on the compositor alone, and measures on its direction and its size', async () => {
    mockOwnedComputedStyle();
    render(<Fixture axis="block" />);
    const viewport = screen.getByTestId('viewport');
    const ancestor = viewport.parentElement!;
    // Let the mount's own style writes reach the observer, and settle.
    await act(async () => {});
    flushFrame();
    await act(async () => {});
    flushFrame();
    const framesBefore = frames.length;
    const styleReads = vi.mocked(window.getComputedStyle).mock.calls.length;

    // A surface dragged under a finger writes its transform, and a custom
    // property for its scrim, on every input sample.
    for (const offset of [8, 16, 24]) {
      await act(async () => {
        ancestor.style.transform = `translateY(${offset}px)`;
        ancestor.style.setProperty('--_scrim-opacity', `${1 - offset / 100}`);
      });
    }
    expect(frames.length).toBe(framesBefore);
    expect(vi.mocked(window.getComputedStyle).mock.calls).toHaveLength(
      styleReads,
    );

    // The axis mapping is the ancestor's to change.
    await act(async () => {
      ancestor.style.direction = 'rtl';
    });
    expect(frames.length).toBe(framesBefore + 1);
    flushFrame();

    // A size change reaches the hook through its resize observer, whatever
    // ancestor style caused it.
    const framesBeforeResize = frames.length;
    act(() => {
      for (const callback of resizeObservers) {
        callback(
          [
            {
              target: viewport,
            } as Partial<ResizeObserverEntry> as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        );
      }
    });
    expect(frames.length).toBe(framesBeforeResize + 1);
  });

  it('keeps the tab stop through a writing-mode change that moves the overflowing axis', async () => {
    let isVertical = false;
    mockOwnedComputedStyle(() =>
      isVertical ? 'vertical-rl' : 'horizontal-tb',
    );
    // The content overflows the block axis in either mode: physical y while
    // horizontal, physical x once vertical.
    const viewportExtent = (axis: 'x' | 'y') =>
      function (this: HTMLElement) {
        if (this.dataset.testid !== 'viewport') {
          return 100;
        }
        return (axis === 'x') === isVertical ? 180 : 100;
      };
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
      viewportExtent('x'),
    );
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      viewportExtent('y'),
    );

    render(<Fixture axis="block" />);
    const viewport = screen.getByTestId('viewport');
    expect(viewport).toHaveAttribute('tabindex', '0');

    isVertical = true;
    await act(async () => {
      viewport.parentElement!.setAttribute('dir', 'ltr');
    });
    flushFrame();
    expect(viewport.getAttribute('style')).toContain('--x-overflowX: auto');
    expect(viewport).toHaveAttribute('tabindex', '0');
  });

  it('owns fitting and explicit Sticky overflow styling for direct adopters', () => {
    const {rerender} = render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    expect(viewport.getAttribute('style')).toContain('clip');

    rerender(<Fixture stickyContainment="always" />);
    expect(viewport.getAttribute('style')).toContain('--x-overflowX: auto');
    expect(viewport.getAttribute('style')).toContain('--x-overflowY: hidden');
  });

  it('activates only the overflowing physical axis when both are requested', () => {
    render(<Fixture axis="both" />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 180});

    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(viewport.getAttribute('style')).toContain('--x-overflowX: auto');
    expect(viewport.getAttribute('style')).toContain('--x-overflowY: hidden');
  });

  it('keeps the named viewport available while content eligibility changes', () => {
    function AdaptiveFixture({children}: {children?: ReactNode}) {
      const area = useScrollableArea({
        axis: 'block',
        keyboardAccess: {
          owner: 'contentOrViewport',
          label: 'Adaptive results',
          role: 'region',
        },
      });
      return (
        <div data-testid="adaptive-viewport" {...area.getViewportProps()}>
          <div data-testid="adaptive-content" {...area.getContentProps()}>
            {children}
          </div>
        </div>
      );
    }

    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 20, 20),
    ] as unknown as DOMRectList);
    const {rerender} = render(<AdaptiveFixture>Plain text</AdaptiveFixture>);
    const viewport = screen.getByTestId('adaptive-viewport');
    const content = screen.getByTestId('adaptive-content');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollHeight: 180});

    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(viewport).toHaveAttribute('role', 'region');
    expect(viewport).toHaveAccessibleName('Adaptive results');
    expect(viewport).toHaveAttribute('tabindex', '0');

    void act(() => viewport.focus());
    rerender(
      <AdaptiveFixture>
        <button type="button">Use existing action</button>
      </AdaptiveFixture>,
    );
    void act(() => content.dispatchEvent(new Event('transitionend')));
    flushFrame();
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveFocus();

    rerender(<AdaptiveFixture>Plain text again</AdaptiveFixture>);
    void act(() => content.dispatchEvent(new Event('transitionend')));
    flushFrame();
    expect(viewport).toHaveAttribute('tabindex', '0');
  });

  it('requires scroll-capable computed overflow and more than 1px excess geometry', async () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);

    setGeometry(viewport, {scrollWidth: 101});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline.isScrollable).toBe(false);

    viewport.style.overflowX = 'hidden';
    setGeometry(viewport, {scrollWidth: 140});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline.isScrollable).toBe(false);

    // A style change with no geometry change reaches the hook through its
    // attribute observer; a scroll only ever moves the offset.
    await act(async () => {
      viewport.style.overflowX = 'auto';
    });
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: true,
      atEnd: false,
    });
    expect(viewport).toHaveAttribute('tabindex', '0');
  });

  it('publishes stable logical start, middle, and end edge state', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 300});

    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: true,
      atEnd: false,
    });

    setGeometry(viewport, {scrollLeft: 80});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: false,
    });

    setGeometry(viewport, {scrollLeft: 200});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: true,
    });
  });

  it('derives edges as a scroll is dispatched, without reading computed style or requesting a frame', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 300});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline.isScrollable).toBe(true);

    const styleReads = vi.mocked(window.getComputedStyle).mock.calls.length;
    const steps: [number, {atStart: boolean; atEnd: boolean}][] = [
      [80, {atStart: false, atEnd: false}],
      [200, {atStart: false, atEnd: true}],
      [0, {atStart: true, atEnd: false}],
    ];
    for (const [scrollLeft, edges] of steps) {
      setGeometry(viewport, {scrollLeft});
      void act(() => viewport.dispatchEvent(new Event('scroll')));
      expect(frames).toHaveLength(0);
      expect(state().inline).toEqual({isScrollable: true, ...edges});
    }
    expect(vi.mocked(window.getComputedStyle).mock.calls).toHaveLength(
      styleReads,
    );
  });

  it('leaves a scroll to the full measurement already pending in its frame', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    const content = screen.getByTestId('content');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 300});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();

    void act(() => content.dispatchEvent(new Event('transitionend')));
    expect(frames).toHaveLength(1);
    setGeometry(viewport, {scrollLeft: 80});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    expect(frames).toHaveLength(1);
    expect(state().inline.atStart).toBe(true);

    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: false,
    });
  });

  it('measures fully when a scroll finds the requested overflow gone', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 300, scrollLeft: 80});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(viewport).toHaveAttribute('tabindex', '0');

    // Content shrinking clamps the offset, which the browser reports as a
    // scroll: a change the offset cannot explain, measured in full.
    setGeometry(viewport, {scrollWidth: 100, scrollLeft: 0});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    expect(frames).toHaveLength(1);
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: false,
      atStart: true,
      atEnd: true,
    });
    expect(viewport).not.toHaveAttribute('tabindex');
  });

  it('keeps the last valid edges when a scroll arrives while the viewport has no box', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 300, scrollLeft: 80});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();

    // At offset 0 a zero-size box would report the start edge, so this step
    // fails if the zero-size guard is removed.
    setGeometry(viewport, {clientWidth: 0, clientHeight: 0, scrollLeft: 0});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: false,
    });
  });

  it('applies the measured writing direction on the scroll path', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    viewport.dir = 'rtl';
    setGeometry(viewport, {scrollWidth: 300});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: true,
      atEnd: false,
    });

    const styleReads = vi.mocked(window.getComputedStyle).mock.calls.length;
    setGeometry(viewport, {scrollLeft: -200});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: true,
    });
    expect(vi.mocked(window.getComputedStyle).mock.calls).toHaveLength(
      styleReads,
    );
  });

  it('derives vertical-rl block edges on the scroll path without requesting a frame', () => {
    render(<Fixture axis="block" />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    viewport.style.writingMode = 'vertical-rl';
    setGeometry(viewport, {scrollWidth: 220});
    void act(() => viewport.dispatchEvent(new Event('transitionend')));
    flushFrame();
    expect(state().block).toEqual({
      isScrollable: true,
      atStart: true,
      atEnd: false,
    });

    // The block axis runs right to left along x: its end is scrollLeft -120.
    setGeometry(viewport, {scrollLeft: -120});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    expect(frames).toHaveLength(0);
    expect(state().block).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: true,
    });
  });

  it('measures fully when a scroll offset contradicts the measured direction', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 300});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: true,
      atEnd: false,
    });

    // A stylesheet alone turns the area RTL, so nothing re-measured; the
    // next scroll reports a negative offset the stored mapping rules out.
    stylesheetDirection = 'rtl';
    setGeometry(viewport, {scrollLeft: -200});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    expect(frames).toHaveLength(1);
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: true,
    });
  });

  it('normalizes RTL inline offsets to logical edges', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    viewport.dir = 'rtl';
    setGeometry(viewport, {scrollWidth: 300, scrollLeft: -200});

    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: true,
    });
  });

  it('maps logical axes through vertical and sideways writing modes', () => {
    expect(getLogicalAxisMapping('vertical-rl', 'ltr')).toEqual({
      inline: 'y',
      block: 'x',
      inlineReversed: false,
      blockReversed: true,
    });
    expect(getLogicalAxisMapping('vertical-lr', 'rtl')).toEqual({
      inline: 'y',
      block: 'x',
      inlineReversed: true,
      blockReversed: false,
    });
    expect(getLogicalAxisMapping('sideways-lr', 'ltr')).toEqual({
      inline: 'y',
      block: 'x',
      inlineReversed: true,
      blockReversed: false,
    });
    expect(getLogicalAxisMapping('sideways-lr', 'rtl')).toEqual({
      inline: 'y',
      block: 'x',
      inlineReversed: false,
      blockReversed: false,
    });
    expect(getLogicalAxisMapping('sideways-rl', 'ltr')).toEqual({
      inline: 'y',
      block: 'x',
      inlineReversed: false,
      blockReversed: true,
    });
    expect(getLogicalAxisMapping('sideways-rl', 'rtl')).toEqual({
      inline: 'y',
      block: 'x',
      inlineReversed: true,
      blockReversed: true,
    });
    expect(getLogicalAxisMapping('vertical-rl', 'rtl')).toEqual({
      inline: 'y',
      block: 'x',
      inlineReversed: true,
      blockReversed: true,
    });
    expect(getLogicalAxisMapping('horizontal-tb', 'rtl')).toEqual({
      inline: 'x',
      block: 'y',
      inlineReversed: true,
      blockReversed: false,
    });
  });

  it('normalizes reversed inline offsets in sideways writing modes', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    viewport.style.writingMode = 'sideways-lr';
    setGeometry(viewport, {scrollHeight: 300, scrollTop: -200});

    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: true,
    });
  });

  it('measures both requested axes independently in vertical writing mode', () => {
    render(<Fixture axis="both" />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    viewport.style.writingMode = 'vertical-rl';
    setGeometry(viewport, {
      scrollWidth: 220,
      scrollHeight: 100,
      scrollLeft: -120,
    });

    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state()).toEqual({
      inline: {isScrollable: false, atStart: true, atEnd: true},
      block: {isScrollable: true, atStart: false, atEnd: true},
    });
  });

  it('contains only effective physical axes', () => {
    render(<Fixture axis="both" chaining="contain" />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 180, scrollHeight: 100});

    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(viewport.style.overscrollBehaviorX).toBe('contain');
    expect(viewport.style.overscrollBehaviorY).toBe('auto');
  });

  it('preserves caller overscroll behavior on axes outside the requested intent', () => {
    function InlineOnly() {
      const area = useScrollableArea({
        axis: 'inline',
        keyboardAccess: {owner: 'content'},
        overscroll: 'contain',
      });
      return (
        <div
          data-testid="inline-only"
          {...area.getViewportProps({
            style: {overflowX: 'auto', overscrollBehaviorY: 'none'},
          })}>
          <div {...area.getContentProps()}>Content</div>
        </div>
      );
    }

    render(<InlineOnly />);
    const viewport = screen.getByTestId('inline-only');
    expect(viewport.style.overscrollBehaviorX).toBe('auto');
    expect(viewport.style.overscrollBehaviorY).toBe('none');
  });

  it('removes a lost tab stop without moving current focus', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 180});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();

    void act(() => viewport.focus());
    expect(document.activeElement).toBe(viewport);
    setGeometry(viewport, {scrollWidth: 100});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();

    expect(viewport).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(viewport);
  });

  it.each(['viewport', 'contentOrViewport'] as const)(
    'removes the leftover tabindex once a fitting viewport is blurred (%s owner)',
    keyboardOwner => {
      render(<Fixture keyboardOwner={keyboardOwner} />);
      const viewport = screen.getByTestId('viewport');
      makeMeasurable(viewport);
      setGeometry(viewport, {scrollWidth: 180});
      void act(() => viewport.dispatchEvent(new Event('scroll')));
      flushFrame();

      void act(() => viewport.focus());
      setGeometry(viewport, {scrollWidth: 100});
      void act(() => viewport.dispatchEvent(new Event('scroll')));
      flushFrame();
      expect(viewport).toHaveAttribute('tabindex', '-1');
      expect(document.activeElement).toBe(viewport);

      void act(() => viewport.blur());
      expect(viewport).not.toHaveAttribute('tabindex');
    },
  );

  it('keeps a focused viewport in another document programmatically focusable when it loses overflow', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument as Document;
    const container = frameDocument.createElement('div');
    frameDocument.body.append(container);

    const {getByTestId, rerender, unmount} = render(
      <Fixture externalRef={() => {}} />,
      {container},
    );
    try {
      const viewport = getByTestId('viewport');
      makeMeasurable(viewport);
      viewport.style.overflowX = 'auto';
      setInlineOverflow(viewport, true);
      expect(viewport).toHaveAttribute('tabindex', '0');

      void act(() => viewport.focus());
      expect(frameDocument.activeElement).toBe(viewport);
      setInlineOverflow(viewport, false);

      expect(viewport).toHaveAttribute('tabindex', '-1');
      expect(frameDocument.activeElement).toBe(viewport);

      // Reattaching reads focus again, from the same document.
      rerender(<Fixture externalRef={() => {}} />);
      expect(viewport).toHaveAttribute('tabindex', '-1');
    } finally {
      unmount();
      frame.remove();
    }
  });

  it('ignores focus on a descendant of a viewport that loses overflow', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    const descendant = screen.getByTestId('descendant');
    descendant.tabIndex = -1;
    makeMeasurable(viewport);
    setInlineOverflow(viewport, true);

    void act(() => descendant.focus());
    setInlineOverflow(viewport, false);

    expect(document.activeElement).toBe(descendant);
    expect(viewport).not.toHaveAttribute('tabindex');
  });

  it('removes the leftover tabindex when focus moves from the viewport to a descendant', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    const descendant = screen.getByTestId('descendant');
    descendant.tabIndex = -1;
    makeMeasurable(viewport);
    setInlineOverflow(viewport, true);
    void act(() => viewport.focus());
    setInlineOverflow(viewport, false);
    expect(viewport).toHaveAttribute('tabindex', '-1');

    void act(() => descendant.focus());

    expect(document.activeElement).toBe(descendant);
    expect(viewport).not.toHaveAttribute('tabindex');
  });

  it('keeps the tabindex when focusout fires while the viewport is still the active element', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setInlineOverflow(viewport, true);
    void act(() => viewport.focus());
    setInlineOverflow(viewport, false);

    // A window blur fires focusout but leaves the element active.
    void act(() =>
      viewport.dispatchEvent(new FocusEvent('focusout', {bubbles: true})),
    );

    expect(document.activeElement).toBe(viewport);
    expect(viewport).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the tabindex when focus leaves and returns in one task', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setInlineOverflow(viewport, true);
    void act(() => viewport.focus());
    setInlineOverflow(viewport, false);

    void act(() => {
      viewport.blur();
      viewport.focus();
    });

    expect(document.activeElement).toBe(viewport);
    expect(viewport).toHaveAttribute('tabindex', '-1');
  });

  it('reads focus from the document when focus events never reach the viewport', () => {
    const stopFocusEvent = (event: FocusEvent<HTMLDivElement>) =>
      event.stopPropagation();
    render(
      <div onFocusCapture={stopFocusEvent} onBlurCapture={stopFocusEvent}>
        <Fixture />
      </div>,
    );
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setInlineOverflow(viewport, true);

    void act(() => viewport.focus());
    setInlineOverflow(viewport, false);
    expect(viewport).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(viewport);

    // No focusout arrives either, so only the next measurement can notice.
    void act(() => viewport.blur());
    expect(viewport).toHaveAttribute('tabindex', '-1');
    void act(() => window.dispatchEvent(new Event('resize')));
    flushFrame();
    expect(viewport).not.toHaveAttribute('tabindex');
  });

  it.each([
    ['inline', {scrollWidth: 180}],
    ['block', {scrollHeight: 180}],
  ] as const)(
    'does not commit for a focus change or the next measurement while the %s axis scrolls',
    (axis, overflowingGeometry) => {
      const onCommit = vi.fn();
      function CountedFixture() {
        const area = useScrollableArea({
          axis,
          keyboardAccess: {owner: 'viewport', label: 'Counted results'},
        });
        return (
          <div data-testid="counted" {...area.getViewportProps()}>
            <div {...area.getContentProps()} />
          </div>
        );
      }

      render(
        <Profiler id="counted" onRender={onCommit}>
          <CountedFixture />
        </Profiler>,
      );
      const viewport = screen.getByTestId('counted');
      makeMeasurable(viewport);
      setGeometry(viewport, overflowingGeometry);
      void act(() => viewport.dispatchEvent(new Event('scroll')));
      flushFrame();
      expect(viewport).toHaveAttribute('tabindex', '0');
      const remeasure = () => {
        void act(() => window.dispatchEvent(new Event('resize')));
        flushFrame();
      };
      remeasure();
      onCommit.mockClear();

      void act(() => viewport.focus());
      expect(document.activeElement).toBe(viewport);
      remeasure();
      void act(() => viewport.blur());
      remeasure();
      expect(onCommit).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['inline', 'block', {scrollWidth: 180}],
    ['block', 'inline', {scrollHeight: 180}],
  ] as const)(
    'keeps the tabindex of a focused viewport when its scrolling %s axis is dropped',
    (_scrollingAxis, nextAxis, overflowingGeometry) => {
      const {rerender} = render(<Fixture axis="both" />);
      const viewport = screen.getByTestId('viewport');
      makeMeasurable(viewport);
      setGeometry(viewport, overflowingGeometry);
      void act(() => viewport.dispatchEvent(new Event('scroll')));
      flushFrame();
      expect(viewport).toHaveAttribute('tabindex', '0');
      void act(() => viewport.focus());
      const removeAttribute = vi.spyOn(viewport, 'removeAttribute');

      // The first commit renders before the new axis is measured. Dropping
      // the tabindex there blurs the viewport in Chromium.
      rerender(<Fixture axis={nextAxis} />);

      expect(removeAttribute).not.toHaveBeenCalledWith('tabindex');
      expect(viewport).toHaveAttribute('tabindex', '-1');
      expect(document.activeElement).toBe(viewport);
    },
  );

  it('adds no commit when a commit moves focus between two of its descendants', () => {
    const onCommit = vi.fn();
    // A viewport with no scrollable axis tracks its focus. The picker's own
    // commit hands focus from one row to the next, as a sheet's toggle does.
    function Picker() {
      const area = useScrollableArea({
        axis: 'block',
        keyboardAccess: {owner: 'contentOrViewport', label: 'Picker'},
      });
      const [isSecond, setIsSecond] = useState(false);
      const firstRef = useRef<HTMLButtonElement>(null);
      const secondRef = useRef<HTMLButtonElement>(null);
      useLayoutEffect(() => {
        if (isSecond) {
          secondRef.current?.focus();
        }
      }, [isSecond]);
      return (
        <div data-testid="picker" {...area.getViewportProps()}>
          <div {...area.getContentProps()}>
            <button
              ref={firstRef}
              type="button"
              onClick={() => {
                setIsSecond(true);
              }}>
              First
            </button>
            <button ref={secondRef} type="button">
              Second
            </button>
          </div>
        </div>
      );
    }

    render(
      <Profiler id="picker" onRender={onCommit}>
        <Picker />
      </Profiler>,
    );
    makeMeasurable(screen.getByTestId('picker'));
    void act(() => window.dispatchEvent(new Event('resize')));
    flushFrame();
    const first = screen.getByRole('button', {name: 'First'});
    void act(() => first.focus());
    onCommit.mockClear();

    void act(() => first.click());

    expect(document.activeElement).toBe(
      screen.getByRole('button', {name: 'Second'}),
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('drops the tabindex of an unfocused viewport after an axis change', () => {
    const {rerender} = render(<Fixture axis="both" />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setInlineOverflow(viewport, true);
    expect(viewport).toHaveAttribute('tabindex', '0');

    rerender(<Fixture axis="block" />);

    expect(viewport).not.toHaveAttribute('tabindex');
  });

  it('keeps tracking focus when the caller passes a fresh ref every render', () => {
    const {rerender} = render(<Fixture externalRef={() => {}} />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 180});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();

    void act(() => viewport.focus());
    setGeometry(viewport, {scrollWidth: 100});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(viewport).toHaveAttribute('tabindex', '-1');

    const removeListener = vi.spyOn(viewport, 'removeEventListener');
    rerender(<Fixture externalRef={() => {}} />);
    expect(viewport).toHaveAttribute('tabindex', '-1');
    // Reattaching releases the previous listeners so they cannot pile up.
    expect(removeListener).toHaveBeenCalledWith(
      'focusin',
      expect.any(Function),
    );
    expect(removeListener).toHaveBeenCalledWith(
      'focusout',
      expect.any(Function),
    );

    void act(() => viewport.blur());
    expect(viewport).not.toHaveAttribute('tabindex');
  });

  it('keeps one focus listener pair and working tracking through StrictMode replay', () => {
    const focusListeners = recordFocusListeners();
    const {unmount} = render(
      <StrictMode>
        <Fixture />
      </StrictMode>,
    );
    const viewport = screen.getByTestId('viewport');
    expect(focusListeners()).toEqual([
      'add focusin viewport',
      'add focusout viewport',
      'remove focusin viewport',
      'remove focusout viewport',
      'add focusin viewport',
      'add focusout viewport',
    ]);

    makeMeasurable(viewport);
    setInlineOverflow(viewport, true);
    void act(() => viewport.focus());
    setInlineOverflow(viewport, false);
    expect(viewport).toHaveAttribute('tabindex', '-1');
    void act(() => viewport.blur());
    expect(viewport).not.toHaveAttribute('tabindex');

    unmount();
    expect(focusListeners().slice(-2)).toEqual([
      'remove focusin viewport',
      'remove focusout viewport',
    ]);
  });

  it('cleans up the old node before attaching the new one when the viewport is replaced in one commit', () => {
    function KeyedFixture({nodeKey}: {nodeKey: string}) {
      const area = useScrollableArea({
        axis: 'inline',
        keyboardAccess: {owner: 'viewport', label: 'Keyed results'},
      });
      return (
        <>
          <div
            key={nodeKey}
            data-testid={nodeKey}
            {...area.getViewportProps()}
          />
          {/* Outside the viewport, so it survives the replacement. */}
          <div {...area.getContentProps()} />
          <output data-testid="retained-tab-index">
            {String(area.getViewportProps().tabIndex)}
          </output>
        </>
      );
    }

    const {rerender} = render(<KeyedFixture nodeKey="old" />);
    const viewport = screen.getByTestId('old');
    makeMeasurable(viewport);
    setInlineOverflow(viewport, true);
    void act(() => viewport.focus());
    setInlineOverflow(viewport, false);
    expect(screen.getByTestId('retained-tab-index')).toHaveTextContent('-1');

    const focusListeners = recordFocusListeners();
    rerender(<KeyedFixture nodeKey="new" />);

    expect(focusListeners()).toEqual([
      'remove focusin old',
      'remove focusout old',
      'add focusin new',
      'add focusout new',
    ]);
    expect(screen.getByTestId('retained-tab-index')).toHaveTextContent(
      'undefined',
    );
    expect(getRegisteredScrollOwnerState(viewport)).toBeUndefined();
    expect(
      getRegisteredScrollOwnerState(screen.getByTestId('new')),
    ).toBeDefined();
  });

  it('stops tracking a viewport that detaches while the hook stays mounted', () => {
    function DetachableFixture({isAttached}: {isAttached: boolean}) {
      const area = useScrollableArea({
        axis: 'inline',
        keyboardAccess: {owner: 'viewport', label: 'Detachable results'},
      });
      return (
        <>
          {isAttached ? (
            <div data-testid="detachable" {...area.getViewportProps()} />
          ) : null}
          {/* Outside the viewport, so only its own detach can clear the state. */}
          <div {...area.getContentProps()} />
          <output data-testid="retained-tab-index">
            {String(area.getViewportProps().tabIndex)}
          </output>
        </>
      );
    }

    const {rerender} = render(<DetachableFixture isAttached />);
    const viewport = screen.getByTestId('detachable');
    const retainedTabIndex = screen.getByTestId('retained-tab-index');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 180});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    void act(() => viewport.focus());
    setGeometry(viewport, {scrollWidth: 100});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(retainedTabIndex).toHaveTextContent('-1');
    expect(getRegisteredScrollOwnerState(viewport)).toBeDefined();

    rerender(<DetachableFixture isAttached={false} />);
    expect(getRegisteredScrollOwnerState(viewport)).toBeUndefined();
    expect(retainedTabIndex).toHaveTextContent('undefined');

    // The old node's listeners are gone, so focusing it again changes nothing.
    document.body.append(viewport);
    try {
      void act(() => viewport.focus());
      expect(retainedTabIndex).toHaveTextContent('undefined');
    } finally {
      viewport.remove();
    }

    rerender(<DetachableFixture isAttached />);
    const replacement = screen.getByTestId('detachable');
    expect(replacement).not.toBe(viewport);
    expect(getRegisteredScrollOwnerState(replacement)).toBeDefined();
    expect(getRegisteredScrollOwnerState(viewport)).toBeUndefined();
  });

  it('composes caller refs and handlers without losing behavior', () => {
    const externalRef = vi.fn();
    const onScroll = vi.fn();
    const {rerender} = render(
      <Fixture externalRef={externalRef} onScroll={onScroll} />,
    );
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 180});

    void act(() =>
      viewport.dispatchEvent(new Event('scroll', {bubbles: true})),
    );
    flushFrame();
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(externalRef).toHaveBeenCalledWith(viewport);
    expect(state().inline.isScrollable).toBe(true);

    externalRef.mockClear();
    rerender(<Fixture externalRef={externalRef} onScroll={onScroll} />);
    expect(externalRef).not.toHaveBeenCalled();
  });

  it('registers effective owners by axis and skips inactive nested candidates', () => {
    function NestedFixture() {
      const outer = useScrollableArea({
        axis: 'block',
        keyboardAccess: {owner: 'content'},
      });
      const inner = useScrollableArea({
        axis: 'inline',
        keyboardAccess: {owner: 'content'},
      });
      const descendantRef = useRef<HTMLSpanElement>(null);
      return (
        <div
          data-testid="outer"
          {...outer.getViewportProps({style: {overflowY: 'auto'}})}>
          <div {...outer.getContentProps()}>
            <div
              data-testid="inner"
              {...inner.getViewportProps({style: {overflowX: 'auto'}})}>
              <div {...inner.getContentProps()}>
                <span ref={descendantRef} data-testid="nested-descendant" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    render(<NestedFixture />);
    const outer = screen.getByTestId('outer');
    const inner = screen.getByTestId('inner');
    const descendant = screen.getByTestId('nested-descendant');
    makeMeasurable(outer);
    makeMeasurable(inner);
    setGeometry(outer, {scrollHeight: 240});
    setGeometry(inner, {scrollWidth: 100});

    void act(() => outer.dispatchEvent(new Event('scroll')));
    flushFrame();

    expect(getRegisteredScrollOwnerState(outer)?.block.isScrollable).toBe(true);
    expect(getRegisteredScrollOwnerState(inner)?.inline.isScrollable).toBe(
      false,
    );
    expect(findNearestScrollOwner(descendant, 'block')).toBe(outer);
    expect(findNearestScrollOwner(descendant, 'inline')).toBeNull();
  });

  it('resolves the nearest of two nested block owners and unregisters both on unmount', () => {
    function DoubleBlockFixture() {
      const outer = useScrollableArea({
        axis: 'block',
        keyboardAccess: {owner: 'content'},
      });
      const inner = useScrollableArea({
        axis: 'block',
        keyboardAccess: {owner: 'content'},
      });
      return (
        <div
          data-testid="outer-owner"
          {...outer.getViewportProps({style: {overflowY: 'auto'}})}>
          <div {...outer.getContentProps()}>
            <div
              data-testid="inner-owner"
              {...inner.getViewportProps({style: {overflowY: 'auto'}})}>
              <div {...inner.getContentProps()}>
                <span data-testid="deep-descendant" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    const {unmount} = render(<DoubleBlockFixture />);
    const outer = screen.getByTestId('outer-owner');
    const inner = screen.getByTestId('inner-owner');
    const descendant = screen.getByTestId('deep-descendant');
    makeMeasurable(outer);
    makeMeasurable(inner);
    setGeometry(outer, {scrollHeight: 240});
    setGeometry(inner, {scrollHeight: 300});

    void act(() => {
      outer.dispatchEvent(new Event('scroll'));
      inner.dispatchEvent(new Event('scroll'));
    });
    flushFrame();

    expect(findNearestScrollOwner(descendant, 'block')).toBe(inner);

    unmount();
    expect(getRegisteredScrollOwnerState(inner)).toBeUndefined();
    expect(getRegisteredScrollOwnerState(outer)).toBeUndefined();
  });

  it('composes caller content props and consumes content xstyle', () => {
    const contentRef = vi.fn();
    const onClick = vi.fn();
    function ContentFixture() {
      const area = useScrollableArea({
        axis: 'inline',
        keyboardAccess: {owner: 'content'},
      });
      return (
        <div {...area.getViewportProps({style: {overflowX: 'auto'}})}>
          <div
            data-testid="styled-content"
            {...area.getContentProps<HTMLDivElement>({
              ref: contentRef,
              onClick,
              className: 'consumer-content',
              style: {color: 'red'},
              xstyle: [
                testStyles.viewport,
                testStyles.contentMinWidth('120px'),
              ],
            })}>
            Content
          </div>
        </div>
      );
    }

    render(<ContentFixture />);
    const content = screen.getByTestId('styled-content');
    expect(content).not.toHaveAttribute('xstyle');
    expect(content).toHaveClass('consumer-content');
    const expectedClasses = (stylex.props(testStyles.viewport).className ?? '')
      .split(' ')
      .filter(Boolean);
    expect(expectedClasses.length).toBeGreaterThan(0);
    for (const token of expectedClasses) {
      expect(content).toHaveClass(token);
    }
    expect(content.style.color).toBe('red');
    expect(content.getAttribute('style')).toContain('120px');
    expect(content).toHaveAttribute('data-scroll-content');
    content.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(contentRef).toHaveBeenCalledWith(content);
  });

  it('preserves the last valid state through a full measurement while the viewport has no box', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 180, scrollLeft: 40});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: false,
    });

    // A display:none box reads zero for every metric and fires no scroll; the
    // full measurement must keep the last valid state rather than publish
    // fitting.
    setGeometry(viewport, {
      clientWidth: 0,
      clientHeight: 0,
      scrollWidth: 0,
      scrollHeight: 0,
      scrollLeft: 0,
    });
    void act(() => window.dispatchEvent(new Event('resize')));
    expect(frames).toHaveLength(1);
    flushFrame();
    expect(state().inline).toEqual({
      isScrollable: true,
      atStart: false,
      atEnd: false,
    });
  });

  it('coalesces repeated invalidations into one animation frame', () => {
    render(<Fixture />);
    const viewport = screen.getByTestId('viewport');
    makeMeasurable(viewport);
    setGeometry(viewport, {scrollWidth: 180});

    void act(() => {
      viewport.dispatchEvent(new Event('scroll'));
      viewport.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });
    expect(frames).toHaveLength(1);
  });

  it('keeps behavior-owned accessibility over conflicting caller props', () => {
    function ConflictFixture() {
      const area = useScrollableArea({
        axis: 'inline',
        keyboardAccess: {owner: 'viewport', label: 'Owned name'},
      });
      return (
        <div
          data-testid="conflict-viewport"
          {...area.getViewportProps<HTMLDivElement>({
            role: 'list',
            'aria-label': 'Caller name',
            tabIndex: 5,
          })}>
          <div {...area.getContentProps()}>Content</div>
        </div>
      );
    }

    render(<ConflictFixture />);
    const viewport = screen.getByTestId('conflict-viewport');
    expect(viewport).toHaveAttribute('role', 'group');
    expect(viewport).toHaveAccessibleName('Owned name');
    expect(viewport).not.toHaveAttribute('tabindex');
  });
});
