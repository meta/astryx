// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollableArea.test.tsx
 * @input Shared scroll hook, mocked geometry, and observed DOM changes
 * @output Regression coverage for measurement, composition, and stable viewport access
 * @position DOM-level hook contract; native traversal is verified in browser tests
 */

import {act, render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {useRef, type ReactNode, type Ref} from 'react';
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

const testStyles = stylex.create({
  viewport: {borderWidth: 1, borderStyle: 'solid'},
});

interface FixtureProps {
  axis?: ScrollAxis;
  chaining?: ScrollOverscroll;
  stickyContainment?: ScrollStickyContainment;
  externalRef?: Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

function Fixture({
  axis = 'inline',
  chaining = 'allow',
  stickyContainment,
  externalRef,
  onScroll,
}: FixtureProps) {
  const {getViewportProps, getContentProps, state} = useScrollableArea({
    axis,
    keyboardAccess: {
      owner: 'viewport',
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

  beforeEach(() => {
    frames = [];
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
      vi.fn(function () {
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
    expect(viewport.getAttribute('style')).toContain('auto');
    expect(viewport.getAttribute('style')).toContain('hidden');
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

    viewport.focus();
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

  it('requires scroll-capable computed overflow and more than 1px excess geometry', () => {
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

    viewport.style.overflowX = 'auto';
    void act(() => viewport.dispatchEvent(new Event('scroll')));
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

    viewport.focus();
    expect(document.activeElement).toBe(viewport);
    setGeometry(viewport, {scrollWidth: 100});
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();

    expect(viewport).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(viewport);
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
});
