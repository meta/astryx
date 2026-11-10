// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useLayer.test.tsx
 * @input Uses vitest, @testing-library/react, useLayer hook
 * @output Tests for useLayer show/hide feature-detection guards and context-mode positioning
 * @position Testing; validates useLayer.tsx implementation
 *
 * SYNC: When useLayer.tsx changes, update tests accordingly
 */

import {describe, it, expect, vi, afterEach, beforeEach} from 'vitest';
import {
  render,
  renderHook,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Profiler,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import * as stylex from '@stylexjs/stylex';
import {
  useKeepLayerOpenProps,
  useLayer,
  useLayerInternal,
  getPositionTryFallbacks,
  getSelfAlignment,
} from './useLayer';
import {preserveAnimations} from './preserveAnimations';
import {getAnchorClearFallbacks} from './layerSlideRules';
import {typeScaleVars} from '../theme/tokens.stylex';
import type {
  LayerPlacement,
  LayerAlignment,
  ContextRenderProps,
  ContextLayerReturn,
  FixedLayerReturn,
} from './useLayer';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {observeBrowserHide} from './popoverOperations';

vi.mock('./preserveAnimations', async importOriginal => {
  const actual: {preserveAnimations: typeof preserveAnimations} =
    await importOriginal();
  return {...actual, preserveAnimations: vi.fn(actual.preserveAnimations)};
});

function mockCSSStyleDeclaration(
  styles: Partial<CSSStyleDeclaration>,
): CSSStyleDeclaration {
  return styles as CSSStyleDeclaration;
}

/**
 * Minimal harness that exposes the imperative show/hide callbacks and renders
 * the layer element so tests can assert on visibility.
 */
function LayerHarness({
  onReady,
}: {
  onReady: (api: {show: () => void; hide: () => void}) => void;
}) {
  const layer = useLayer({mode: 'fixed'});
  onReady({show: layer.show, hide: layer.hide});
  return <>{layer.render(<span>Layer content</span>, {x: 0, y: 0})}</>;
}

/**
 * Context-mode harness: renders a trigger plus the layer so tests can assert
 * on the anchor-positioning styles applied to the popover element.
 */
function ContextLayerHarness({
  placement,
  alignment,
}: {
  placement?: LayerPlacement;
  alignment?: LayerAlignment;
}) {
  const layer = useLayer({mode: 'context'});
  return (
    <>
      <button type="button" ref={layer.ref} onClick={layer.show}>
        Trigger
      </button>
      {layer.render(<span>Layer content</span>, {placement, alignment})}
    </>
  );
}

function ContextHostingHarness({
  unsafe,
  themeColor,
  direction,
  writingMode,
}: {
  unsafe?: boolean;
  themeColor?: string;
  direction?: React.CSSProperties['direction'];
  writingMode?: React.CSSProperties['writingMode'];
}) {
  const layer = useLayer({mode: 'context', lazyMount: true});
  const contents = (
    <>
      <button type="button" ref={layer.ref} onClick={layer.show}>
        Trigger
      </button>
      {layer.render(<button type="button">Layer action</button>)}
      <button type="button">Following control</button>
    </>
  );

  const hostStyle = {
    ...(themeColor ? {'--test-layer-color': themeColor} : {}),
    direction,
    writingMode,
  } as React.CSSProperties;

  return (
    <div data-testid="host" style={hostStyle}>
      {unsafe ? <p>{contents}</p> : contents}
    </div>
  );
}

function EagerContextHostingHarness({
  layerStyle,
}: {
  layerStyle?: React.CSSProperties;
}) {
  const layer = useLayer({mode: 'context'});
  return (
    <div data-testid="host">
      <p>
        <button type="button" ref={layer.ref} onClick={layer.show}>
          Trigger
        </button>
        {layer.render(<span>Layer content</span>, {style: layerStyle})}
      </p>
    </div>
  );
}

function RelocatingContextHostingHarness({unsafe}: {unsafe: boolean}) {
  const layer = useLayer({mode: 'context'});
  const renderedLayer = layer.render(<span>Layer content</span>);

  return unsafe ? (
    <div data-testid="unsafe-host">
      <p>{renderedLayer}</p>
    </div>
  ) : (
    <section data-testid="render-position">{renderedLayer}</section>
  );
}

function RelocatingOpenContextHostingHarness({
  unsafe,
  onShow,
}: {
  unsafe: boolean;
  onShow?: () => void;
}) {
  const layer = useLayer({mode: 'context', lazyMount: true, onShow});
  const renderedLayer = layer.render(
    <button type="button">Layer action</button>,
  );

  return (
    <>
      <button type="button" ref={layer.ref} onClick={layer.show}>
        Trigger
      </button>
      {unsafe ? (
        <div data-testid="unsafe-host">
          <p>{renderedLayer}</p>
        </div>
      ) : (
        <section data-testid="safe-host">{renderedLayer}</section>
      )}
    </>
  );
}

/**
 * A lazily mounted layer through the internal options path, optionally kept
 * mounted after its first show, whose render call can move between a safe and
 * an unsafe host.
 */
function KeptLazyContextHarness({
  unsafe = false,
  keepsMountAfterShow = true,
  onHide,
}: {
  unsafe?: boolean;
  keepsMountAfterShow?: boolean;
  onHide?: () => void;
}) {
  const layer = useLayerInternal({
    mode: 'context',
    lazyMount: true,
    keepsMountAfterShow,
    onHide,
  });
  const renderedLayer = layer.render(
    <button type="button">Layer action</button>,
  );
  return (
    <>
      <button type="button" ref={layer.ref} onClick={layer.show}>
        Trigger
      </button>
      <button type="button" onClick={layer.hide}>
        Close
      </button>
      {unsafe ? (
        <div data-testid="unsafe-host">
          <p>{renderedLayer}</p>
        </div>
      ) : (
        <section data-testid="safe-host">{renderedLayer}</section>
      )}
    </>
  );
}

describe('useLayer identity', () => {
  it('keeps the context ref and API object stable across rerenders', () => {
    const {result, rerender} = renderHook(() => useLayer({mode: 'context'}));
    const first = result.current;

    rerender();

    expect(result.current.ref).toBe(first.ref);
    expect(result.current).toBe(first);
  });

  it('keeps the context ref stable when callbacks change', () => {
    const firstOnShow = vi.fn();
    const secondOnShow = vi.fn();
    const {result, rerender} = renderHook(
      ({onShow}: {onShow: () => void}) => useLayer({mode: 'context', onShow}),
      {initialProps: {onShow: firstOnShow}},
    );
    const first = result.current;
    const firstRef = result.current.ref;

    rerender({onShow: secondOnShow});

    expect(result.current).not.toBe(first);
    expect(result.current.ref).toBe(firstRef);
  });

  it('keeps the fixed API object stable across rerenders', () => {
    const {result, rerender} = renderHook(() => useLayer({mode: 'fixed'}));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe('getPositionTryFallbacks (issue #3671, spec:AST-059 FR4)', () => {
  const FLIPS = 'flip-block, flip-inline, flip-block flip-inline';
  const slides = (p: LayerPlacement, a: LayerAlignment) =>
    `--astryx-layer-slide-${p}-${a}-same, --astryx-layer-slide-${p}-${a}-opposite`;

  it('appends inline span fallbacks for centered above/below layers so inline overflow can resolve (flip-inline is a no-op on center), then the named slides', () => {
    expect(getPositionTryFallbacks('above', 'center')).toBe(
      `${FLIPS}, top span-left, top span-right, bottom span-left, bottom span-right, ${slides('above', 'center')}`,
    );
    expect(getPositionTryFallbacks('below', 'center')).toBe(
      `${FLIPS}, bottom span-left, bottom span-right, top span-left, top span-right, ${slides('below', 'center')}`,
    );
  });

  it('appends block span fallbacks for centered start/end layers so block overflow can resolve (flip-block is a no-op on center), then the named slides', () => {
    expect(getPositionTryFallbacks('start', 'center')).toBe(
      `${FLIPS}, left span-top, left span-bottom, right span-top, right span-bottom, ${slides('start', 'center')}`,
    );
    expect(getPositionTryFallbacks('end', 'center')).toBe(
      `${FLIPS}, right span-top, right span-bottom, left span-top, left span-bottom, ${slides('end', 'center')}`,
    );
  });

  it('gives aligned layers the flips, then the named slide on the same side and on the opposite side', () => {
    for (const placement of ['above', 'below', 'start', 'end'] as const) {
      for (const alignment of ['start', 'end'] as const) {
        expect(getPositionTryFallbacks(placement, alignment)).toBe(
          `${FLIPS}, ${slides(placement, alignment)}`,
        );
      }
    }
  });

  it('installs the slide rules once in the document head, with the gutter on both alignment-axis edges and the clearance facing the anchor on the landing side', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <ContextLayerHarness placement="below" alignment="start" />,
    );
    await user.click(container.querySelector('button')!);
    const popover = container.querySelector('[popover]');
    // One sheet in the document head: never inside the layer, where a
    // role-bearing layer's text would name it to assistive technology, and
    // never beside it, where it would change a parent's last child.
    expect(popover?.querySelector('style')).toBeNull();
    expect(container.querySelector('style')).toBeNull();
    const css =
      document.getElementById('astryx-layer-slide-rules')?.textContent ?? '';
    expect(css).toContain(
      '@position-try --astryx-layer-slide-below-start-same{position-area:self-block-end span-all;margin-block-start:var(--_astryx-layer-clearance, 0px);',
    );
    expect(css).toContain(
      '@position-try --astryx-layer-slide-below-start-opposite{position-area:self-block-start span-all;margin-block-end:var(--_astryx-layer-clearance, 0px);',
    );
    expect(css).toMatch(
      /margin-inline-start:[^;]*;margin-inline-start:[^;]*env\(safe-area-inset-left/,
    );
    expect(css).toContain('inset-inline-start:0;inset-inline-end:0;');
  });

  it('defaults to above/center when called without arguments (matches renderContext defaults)', () => {
    expect(getPositionTryFallbacks()).toBe(
      getPositionTryFallbacks('above', 'center'),
    );
    expect(getPositionTryFallbacks(undefined, undefined)).toBe(
      getPositionTryFallbacks('above', 'center'),
    );
  });

  it('produces well-formed, duplicate-free lists with flips first and axis-correct spans for every placement/alignment combo', () => {
    const placements: LayerPlacement[] = ['above', 'below', 'start', 'end'];
    const alignments: LayerAlignment[] = ['start', 'center', 'end'];
    const spanPattern: Record<LayerPlacement, RegExp> = {
      above: /^(top|bottom) span-(left|right)$|^--astryx-layer-slide-above-/,
      below: /^(top|bottom) span-(left|right)$|^--astryx-layer-slide-below-/,
      start: /^(left|right) span-(top|bottom)$|^--astryx-layer-slide-start-/,
      end: /^(left|right) span-(top|bottom)$|^--astryx-layer-slide-end-/,
    };
    for (const placement of placements) {
      for (const alignment of alignments) {
        const items = getPositionTryFallbacks(placement, alignment).split(', ');
        expect(items.slice(0, 3)).toEqual([
          'flip-block',
          'flip-inline',
          'flip-block flip-inline',
        ]);
        expect(new Set(items).size).toBe(items.length);
        for (const item of items.slice(3)) {
          expect(item).toMatch(spanPattern[placement]);
        }
        expect(items.length).toBe(alignment === 'center' ? 9 : 5);
      }
    }
  });

  it('updates the fallback list when placement/alignment props change on re-render', async () => {
    const user = userEvent.setup();
    const {container, rerender} = render(
      <ContextLayerHarness placement="above" alignment="center" />,
    );
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl.style.positionTryFallbacks).toContain('top span-left');

    rerender(<ContextLayerHarness placement="above" alignment="start" />);
    expect(layerEl.style.positionTryFallbacks).toBe(
      getPositionTryFallbacks('above', 'start'),
    );

    rerender(<ContextLayerHarness placement="start" alignment="center" />);
    expect(layerEl.style.positionTryFallbacks).toBe(
      getPositionTryFallbacks('start', 'center'),
    );
  });

  it('does not apply anchor fallbacks in fixed mode (manual coordinates)', () => {
    function FixedHarness() {
      const layer = useLayer({mode: 'fixed'});
      return <>{layer.render(<span>Fixed content</span>, {x: 10, y: 20})}</>;
    }
    const {container} = render(<FixedHarness />);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl.style.positionTryFallbacks ?? '').toBeFalsy();
    expect(layerEl.style.left).toBe('10px');
    expect(layerEl.style.top).toBe('20px');
  });

  it('applies span fallbacks to the rendered popover for the default (above/center) layer', async () => {
    const user = userEvent.setup();
    const {container} = render(<ContextLayerHarness />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).not.toBeNull();
    expect(layerEl.style.positionTryFallbacks).toBe(
      getPositionTryFallbacks('above', 'center'),
    );
  });
});

describe('viewport inset (spec:AST-059)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caps every anchor-mode layer on the placement axis and keeps the far-edge gutter of its alignment axis (FR1, FR3)', async () => {
    const user = userEvent.setup();
    const cases: [LayerPlacement, LayerAlignment, string[], string[]][] = [
      [
        'below',
        'start',
        ['farBelow', 'gutterInlineEnd'],
        ['gutterInlineStart', 'farAbove'],
      ],
      ['below', 'end', ['farBelow', 'gutterInlineStart'], ['gutterInlineEnd']],
      [
        'above',
        'center',
        ['farAbove', 'gutterInlineStart', 'gutterInlineEnd'],
        ['farBelow'],
      ],
      [
        'end',
        'start',
        ['farEnd', 'gutterBlockEnd'],
        ['gutterBlockStart', 'farStart'],
      ],
      ['start', 'end', ['farStart', 'gutterBlockStart'], ['gutterBlockEnd']],
      ['end', 'center', ['farEnd', 'gutterBlockStart', 'gutterBlockEnd'], []],
    ];
    for (const [placement, alignment, present, absent] of cases) {
      const {container, unmount} = render(
        <ContextLayerHarness placement={placement} alignment={alignment} />,
      );
      await user.click(container.querySelector('button')!);
      const layerEl = container.querySelector('[popover]') as HTMLElement;
      expect(layerEl.className).toContain('useLayer__styles.viewportFit');
      for (const key of present) {
        expect(layerEl.className).toContain(`useLayer__styles.${key}`);
      }
      for (const key of absent) {
        expect(layerEl.className).not.toContain(`useLayer__styles.${key}`);
      }
      // The gutter never caps the layer box's inline size: an auto-width
      // layer shrinks to the room beside its trigger on its own, and a cap on
      // the box keeps the browser from choosing a flip.
      expect(layerEl.className).not.toMatch(/useLayer__styles\.maxInline/);
      unmount();
    }
  });

  it('leaves custom and fixed positioning without the viewport fit (INV3)', () => {
    function CustomHarness() {
      const layer = useLayer({mode: 'context'});
      return (
        <>
          <button type="button" ref={layer.ref} onClick={layer.show}>
            Trigger
          </button>
          {layer.render(<span>Custom</span>, {positioning: 'custom'})}
        </>
      );
    }
    const {container} = render(<CustomHarness />);
    fireEvent.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl.className).not.toContain('useLayer__styles.viewportFit');
    expect(layerEl.className).not.toMatch(/useLayer__styles\.gutter/);
  });

  it('pins an aligned layer unsafe toward its anchor only while the anchor is out of view (FR4, FR5)', () => {
    expect(getSelfAlignment('below', 'start', true)).toEqual({});
    expect(getSelfAlignment('below', 'start', false)).toEqual({
      justifySelf: 'unsafe self-start',
    });
    expect(getSelfAlignment('above', 'end', false)).toEqual({
      justifySelf: 'unsafe self-end',
    });
    expect(getSelfAlignment('end', 'start', false)).toEqual({
      alignSelf: 'unsafe self-start',
    });
    expect(getSelfAlignment('start', 'end', false)).toEqual({
      alignSelf: 'unsafe self-end',
    });
    // Centered layers slide through their span fallbacks and never pin.
    expect(getSelfAlignment('below', 'center', false)).toEqual({});
  });

  it('withdraws the slide when the observed anchor leaves the viewport and restores it when it returns (FR5)', async () => {
    let notify!: IntersectionObserverCallback;
    const observed: Element[] = [];
    const disconnect = vi.fn();
    class Observer {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect = disconnect;
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', Observer);

    const user = userEvent.setup();
    const {container} = render(
      <ContextLayerHarness placement="below" alignment="start" />,
    );
    const trigger = container.querySelector('button')!;
    await user.click(trigger);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(observed).toEqual([trigger]);
    expect(layerEl.style.justifySelf).toBe('');

    act(() => {
      notify(
        [{isIntersecting: false} as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(layerEl.style.justifySelf).toBe('unsafe self-start');
    // The fallback list stays; only the overflow shift is withdrawn.
    expect(layerEl.style.positionTryFallbacks).toBe(
      getPositionTryFallbacks('below', 'start'),
    );

    act(() => {
      notify(
        [{isIntersecting: true} as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(layerEl.style.justifySelf).toBe('');
  });
});

describe('useLayer', () => {
  const originalShowPopover = HTMLElement.prototype.showPopover;
  const originalHidePopover = HTMLElement.prototype.hidePopover;

  afterEach(() => {
    // Restore whatever the environment originally provided.
    if (originalShowPopover === undefined) {
      // @ts-expect-error - deleting to simulate original absence
      delete HTMLElement.prototype.showPopover;
    } else {
      HTMLElement.prototype.showPopover = originalShowPopover;
    }
    if (originalHidePopover === undefined) {
      // @ts-expect-error - deleting to simulate original absence
      delete HTMLElement.prototype.hidePopover;
    } else {
      HTMLElement.prototype.hidePopover = originalHidePopover;
    }
  });

  describe('context hosting', () => {
    it('installs the slide rules for a render call that mounts after its host', () => {
      document.getElementById('astryx-layer-slide-rules')?.remove();
      function LateRenderHarness({showLayer}: {readonly showLayer: boolean}) {
        const layer = useLayer({mode: 'context'});
        return (
          <div>
            <button type="button" ref={layer.ref} onClick={layer.show}>
              Trigger
            </button>
            {showLayer ? layer.render(<span>Layer content</span>) : null}
          </div>
        );
      }
      const {rerender} = render(<LateRenderHarness showLayer={false} />);
      expect(document.getElementById('astryx-layer-slide-rules')).toBeNull();

      rerender(<LateRenderHarness showLayer />);
      // The marker's arrival resolves the mount and installs the sheet, so a
      // layer that joins its host later still slides (FR4) instead of
      // covering its own trigger on a narrow viewport.
      expect(
        document.getElementById('astryx-layer-slide-rules'),
      ).not.toBeNull();
    });

    it('keeps closed content mounted by default for existing consumers', () => {
      const {container} = render(<ContextLayerHarness />);

      expect(container.querySelector('template')).not.toBeNull();
      expect(container.querySelector('[popover]')).not.toBeNull();
      expect(container).toHaveTextContent('Layer content');
    });

    it('renders the host once on a closed mount; the second commit is the slot placing the layer', () => {
      const renders = {host: 0, commits: 0};
      function CountingHarness() {
        renders.host += 1;
        const layer = useLayer({mode: 'context'});
        return (
          <div data-testid="host">
            <button type="button" ref={layer.ref} onClick={layer.show}>
              Trigger
            </button>
            {layer.render(<span>Layer content</span>)}
          </div>
        );
      }
      const {container, getByTestId} = render(
        <Profiler
          id="layer"
          onRender={() => {
            renders.commits += 1;
          }}>
          <CountingHarness />
        </Profiler>,
      );

      expect(renders.host).toBe(1);
      expect(renders.commits).toBe(2);
      const layer = container.querySelector('[popover]');
      expect(layer).not.toBeNull();
      expect(layer?.parentElement).toBe(getByTestId('host'));
      expect(layer?.previousElementSibling?.tagName).toBe('TEMPLATE');
    });

    it('renders the host once when the marker sits in an unsafe parent; the slot portals the layer out', () => {
      const renders = {host: 0};
      function CountingUnsafeHarness() {
        renders.host += 1;
        const layer = useLayer({mode: 'context'});
        return (
          <div data-testid="host">
            <p data-testid="paragraph">
              <button type="button" ref={layer.ref} onClick={layer.show}>
                Trigger
              </button>
              {layer.render(<span>Layer content</span>)}
            </p>
          </div>
        );
      }
      const {container, getByTestId} = render(<CountingUnsafeHarness />);

      expect(renders.host).toBe(1);
      const layer = container.querySelector('[popover]');
      expect(layer?.parentElement).toBe(getByTestId('host'));
      expect(getByTestId('paragraph').querySelector('[popover]')).toBeNull();
      expect(getByTestId('paragraph').querySelector('template')).not.toBeNull();
    });

    it('hydrates server markup that carries the marker alone, then mounts the layer', () => {
      const markup = renderToString(<ContextLayerHarness />);
      expect(markup).toContain('<template');
      expect(markup).not.toContain('popover=');

      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const container = document.createElement('div');
      container.innerHTML = markup;
      document.body.appendChild(container);
      try {
        act(() => {
          hydrateRoot(container, <ContextLayerHarness />);
        });
        expect(errors).not.toHaveBeenCalled();
        const layer = container.querySelector('[popover]');
        expect(layer).not.toBeNull();
        expect(layer?.previousElementSibling?.tagName).toBe('TEMPLATE');
        expect(container).toHaveTextContent('Layer content');
      } finally {
        errors.mockRestore();
        container.remove();
      }
    });

    it('renders only an inert marker until show is requested', () => {
      const {container} = render(<ContextHostingHarness />);

      const sentinel = container.querySelector('template');
      expect(sentinel).not.toBeNull();
      expect(sentinel).not.toHaveAttribute('id');
      expect(container.querySelector('[popover]')).toBeNull();
      expect(container).not.toHaveTextContent('Layer action');
    });

    it('keeps the final layer inline when the JSX position is safe', async () => {
      HTMLElement.prototype.showPopover = vi.fn();
      const user = userEvent.setup();
      const {container, getByRole} = render(<ContextHostingHarness />);

      await user.click(getByRole('button', {name: 'Trigger'}));

      const layer = container.querySelector('[popover]');
      const following = getByRole('button', {name: 'Following control'});
      expect(layer?.parentElement).toBe(container.firstElementChild);
      expect(layer?.nextElementSibling).toBe(following);
      expect(container.querySelector('template')).not.toBeNull();
    });

    it('portals out of an unsafe parent and preserves its logical writing context', async () => {
      const getComputedStyleSpy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation(() =>
          mockCSSStyleDeclaration({
            getPropertyValue: () => '',
            direction: 'rtl',
            writingMode: 'vertical-rl',
          }),
        );
      const showSpy = vi.fn();
      HTMLElement.prototype.showPopover = showSpy;
      const user = userEvent.setup();

      try {
        const {container, getByRole} = render(<ContextHostingHarness unsafe />);
        const trigger = getByRole('button', {name: 'Trigger'});

        await user.click(trigger);

        const host = container.querySelector('[data-testid="host"]');
        const paragraph = container.querySelector('p');
        const layer = container.querySelector('[popover]') as HTMLElement;
        expect(layer.parentElement).toBe(host);
        expect(paragraph?.contains(layer)).toBe(false);
        expect(layer).toHaveStyle({
          direction: 'rtl',
          writingMode: 'vertical-rl',
        });
        expect(showSpy).toHaveBeenCalledWith({source: trigger});
      } finally {
        getComputedStyleSpy.mockRestore();
      }
    });

    it('reads no computed style for a closed layer mounted ahead of its first show', () => {
      const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle');
      try {
        const {container} = render(<EagerContextHostingHarness />);
        const layer = container.querySelector('[popover]') as HTMLElement;
        // Mounted closed, outside the unsafe paragraph, with no style read.
        expect(layer.parentElement).toBe(
          container.querySelector('[data-testid="host"]'),
        );
        expect(getComputedStyleSpy).not.toHaveBeenCalled();
        expect(layer.style.direction).toBe('');
      } finally {
        getComputedStyleSpy.mockRestore();
      }
    });

    it("applies a closed layer's deferred writing context before it opens", async () => {
      const getComputedStyleSpy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation(element =>
          mockCSSStyleDeclaration({
            getPropertyValue: () => '',
            // The marker sits in a right-to-left, vertical paragraph; the
            // corrective host does not.
            direction:
              element.tagName.toLowerCase() === 'template' ? 'rtl' : 'ltr',
            writingMode:
              element.tagName.toLowerCase() === 'template'
                ? 'vertical-rl'
                : 'horizontal-tb',
          }),
        );
      const atShow: {direction: string; writingMode: string}[] = [];
      HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
        atShow.push({
          direction: this.style.direction,
          writingMode: this.style.writingMode,
        });
      });
      const user = userEvent.setup();
      try {
        const {container, getByRole} = render(<EagerContextHostingHarness />);
        expect(getComputedStyleSpy).not.toHaveBeenCalled();

        await user.click(getByRole('button', {name: 'Trigger'}));

        // Present when the popover opened, and kept by the render after it.
        expect(atShow).toEqual([
          {direction: 'rtl', writingMode: 'vertical-rl'},
        ]);
        const layer = container.querySelector('[popover]') as HTMLElement;
        expect(layer.style.direction).toBe('rtl');
        expect(layer.style.writingMode).toBe('vertical-rl');
      } finally {
        getComputedStyleSpy.mockRestore();
      }
    });

    it("keeps the caller's own direction over a deferred writing context", async () => {
      const getComputedStyleSpy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation(element =>
          mockCSSStyleDeclaration({
            getPropertyValue: () => '',
            direction:
              element.tagName.toLowerCase() === 'template' ? 'rtl' : 'ltr',
            writingMode: 'horizontal-tb',
          }),
        );
      const atShow: string[] = [];
      HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
        atShow.push(this.style.direction);
      });
      const user = userEvent.setup();
      try {
        const {container, getByRole} = render(
          <EagerContextHostingHarness layerStyle={{direction: 'ltr'}} />,
        );

        await user.click(getByRole('button', {name: 'Trigger'}));

        expect(atShow).toEqual(['ltr']);
        const layer = container.querySelector('[popover]') as HTMLElement;
        expect(layer.style.direction).toBe('ltr');
      } finally {
        getComputedStyleSpy.mockRestore();
      }
    });

    it('inherits custom properties from the corrective host without freezing an inline snapshot', async () => {
      const originalGetComputedStyle = window.getComputedStyle.bind(window);
      const getComputedStyleSpy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation(element => {
          if (element.tagName.toLowerCase() !== 'template') {
            return originalGetComputedStyle(element);
          }
          return mockCSSStyleDeclaration({
            length: 1,
            item: () => '--test-layer-color',
            getPropertyValue: property =>
              property === '--test-layer-color' ? 'rgb(1, 2, 3)' : '',
            direction: 'ltr',
            writingMode: 'horizontal-tb',
          });
        });
      HTMLElement.prototype.showPopover = vi.fn();
      const user = userEvent.setup();
      try {
        const {container, getByRole, rerender} = render(
          <ContextHostingHarness unsafe themeColor="rgb(1, 2, 3)" />,
        );

        await user.click(getByRole('button', {name: 'Trigger'}));

        let host = container.querySelector(
          '[data-testid="host"]',
        ) as HTMLElement;
        let layer = container.querySelector('[popover]') as HTMLElement;
        expect(layer.parentElement).toBe(host);
        expect(layer.style.getPropertyValue('--test-layer-color')).toBe('');
        expect(host.style.getPropertyValue('--test-layer-color')).toBe(
          'rgb(1, 2, 3)',
        );

        rerender(<ContextHostingHarness unsafe themeColor="rgb(4, 5, 6)" />);

        host = container.querySelector('[data-testid="host"]') as HTMLElement;
        layer = container.querySelector('[popover]') as HTMLElement;
        expect(layer.parentElement).toBe(host);
        expect(layer.style.getPropertyValue('--test-layer-color')).toBe('');
        expect(host.style.getPropertyValue('--test-layer-color')).toBe(
          'rgb(4, 5, 6)',
        );
      } finally {
        getComputedStyleSpy.mockRestore();
      }
    });

    it('keeps a shared writing context inheriting live from the corrective host', async () => {
      const getComputedStyleSpy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation(element => {
          const htmlElement = element as HTMLElement;
          const host = htmlElement.matches('[data-testid="host"]')
            ? htmlElement
            : htmlElement.closest<HTMLElement>('[data-testid="host"]');
          return mockCSSStyleDeclaration({
            getPropertyValue: () => '',
            direction: host?.style.direction || 'ltr',
            writingMode: host?.style.writingMode || 'horizontal-tb',
          });
        });
      HTMLElement.prototype.showPopover = vi.fn();
      const user = userEvent.setup();

      try {
        const {container, getByRole, rerender} = render(
          <ContextHostingHarness
            unsafe
            direction="rtl"
            writingMode="vertical-rl"
          />,
        );

        await user.click(getByRole('button', {name: 'Trigger'}));

        let layer = container.querySelector('[popover]') as HTMLElement;
        expect(layer.style.direction).toBe('');
        expect(layer.style.writingMode).toBe('');
        expect(window.getComputedStyle(layer).direction).toBe('rtl');

        rerender(
          <ContextHostingHarness
            unsafe
            direction="ltr"
            writingMode="horizontal-tb"
          />,
        );

        layer = container.querySelector('[popover]') as HTMLElement;
        expect(layer.style.direction).toBe('');
        expect(layer.style.writingMode).toBe('');
        expect(window.getComputedStyle(layer).direction).toBe('ltr');
      } finally {
        getComputedStyleSpy.mockRestore();
      }
    });

    it('re-resolves the host when a persistent render call moves', () => {
      const {container, rerender} = render(
        <RelocatingContextHostingHarness unsafe />,
      );

      const host = container.querySelector('[data-testid="unsafe-host"]');
      const paragraph = container.querySelector('p');
      let layer = container.querySelector('[popover]');
      expect(layer?.parentElement).toBe(host);
      expect(paragraph?.contains(layer)).toBe(false);

      rerender(<RelocatingContextHostingHarness unsafe={false} />);

      const section = container.querySelector('section');
      layer = container.querySelector('[popover]');
      expect(layer?.parentElement).toBe(section);
      expect(section?.querySelector('template')).not.toBeNull();
    });

    it('reopens an open lazy layer after its render call moves', async () => {
      const showSpy = vi.fn(function (this: HTMLElement) {
        if (!this.isConnected) {
          throw new Error('showPopover called on a detached layer');
        }
        this.dataset.open = 'true';
      });
      const onShow = vi.fn();
      HTMLElement.prototype.showPopover = showSpy;
      const {container, getByRole, rerender} = render(
        <RelocatingOpenContextHostingHarness unsafe onShow={onShow} />,
      );

      fireEvent.click(getByRole('button', {name: 'Trigger'}));

      await waitFor(() => {
        expect(container.querySelector('[popover]')).toHaveAttribute(
          'data-open',
          'true',
        );
      });

      rerender(
        <RelocatingOpenContextHostingHarness unsafe={false} onShow={onShow} />,
      );

      await waitFor(() => {
        const layer = container.querySelector('[popover]');
        expect(layer?.parentElement).toBe(
          container.querySelector('[data-testid="safe-host"]'),
        );
        expect(layer).toHaveAttribute('data-open', 'true');
      });
      expect(showSpy).toHaveBeenCalledTimes(2);
      expect(onShow).toHaveBeenCalledOnce();
    });

    describe('a lazy layer kept mounted after its first show', () => {
      const mockPopover = () => {
        const showSpy = vi.fn(function (this: HTMLElement) {
          this.dataset.open = 'true';
        });
        HTMLElement.prototype.showPopover = showSpy;
        HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
          delete this.dataset.open;
        });
        return showSpy;
      };

      it('mounts only its inert marker until its first show', () => {
        const {container} = render(<KeptLazyContextHarness />);

        expect(container.querySelector('template')).not.toBeNull();
        expect(container.querySelector('[popover]')).toBeNull();
        expect(container).not.toHaveTextContent('Layer action');
      });

      it('stays mounted, closed, after its first hide, and its next show opens the same element at once', async () => {
        const showSpy = mockPopover();
        const onHide = vi.fn();
        const {container, getByRole} = render(
          <KeptLazyContextHarness onHide={onHide} />,
        );

        fireEvent.click(getByRole('button', {name: 'Trigger'}));
        await waitFor(() => {
          expect(container.querySelector('[popover]')).toHaveAttribute(
            'data-open',
            'true',
          );
        });
        const layer = container.querySelector('[popover]');

        fireEvent.click(getByRole('button', {name: 'Close'}));
        expect(onHide).toHaveBeenCalledOnce();
        // Still in the page, closed, so its close can play out.
        expect(layer?.isConnected).toBe(true);
        expect(container.querySelector('[popover]')).toBe(layer);
        expect(layer).not.toHaveAttribute('data-open');

        act(() => {
          getByRole('button', {name: 'Trigger'}).click();
          // Mounted: shown within the call, not after a commit.
          expect(showSpy).toHaveBeenCalledTimes(2);
        });
        expect(container.querySelector('[popover]')).toBe(layer);
        expect(layer).toHaveAttribute('data-open', 'true');
      });

      it('without the option, a lazy layer still unmounts on hide', async () => {
        mockPopover();
        const {container, getByRole} = render(
          <KeptLazyContextHarness keepsMountAfterShow={false} />,
        );

        fireEvent.click(getByRole('button', {name: 'Trigger'}));
        await waitFor(() => {
          expect(container.querySelector('[popover]')).not.toBeNull();
        });
        fireEvent.click(getByRole('button', {name: 'Close'}));

        await waitFor(() => {
          expect(container.querySelector('[popover]')).toBeNull();
        });
        expect(container.querySelector('template')).not.toBeNull();
      });

      it('re-resolves its kept mount when its render call moves, closed, and opens there on the next show', async () => {
        mockPopover();
        const {container, getByRole, rerender} = render(
          <KeptLazyContextHarness unsafe />,
        );

        fireEvent.click(getByRole('button', {name: 'Trigger'}));
        await waitFor(() => {
          expect(container.querySelector('[popover]')).toHaveAttribute(
            'data-open',
            'true',
          );
        });
        // Portaled out of the paragraph, into its host.
        expect(container.querySelector('[popover]')?.parentElement).toBe(
          container.querySelector('[data-testid="unsafe-host"]'),
        );
        fireEvent.click(getByRole('button', {name: 'Close'}));

        rerender(<KeptLazyContextHarness unsafe={false} />);

        await waitFor(() => {
          expect(container.querySelector('[popover]')?.parentElement).toBe(
            container.querySelector('[data-testid="safe-host"]'),
          );
        });
        expect(container.querySelector('[popover]')).not.toHaveAttribute(
          'data-open',
        );

        fireEvent.click(getByRole('button', {name: 'Trigger'}));
        expect(container.querySelector('[popover]')).toHaveAttribute(
          'data-open',
          'true',
        );
      });
    });
  });

  describe('when the Popover API is supported', () => {
    it('calls showPopover/hidePopover on show/hide', () => {
      const showSpy = vi.fn();
      const hideSpy = vi.fn();
      HTMLElement.prototype.showPopover = showSpy;
      HTMLElement.prototype.hidePopover = hideSpy;

      let api: {show: () => void; hide: () => void} = {
        show: () => {},
        hide: () => {},
      };
      render(<LayerHarness onReady={a => (api = a)} />);

      act(() => api.show());
      expect(showSpy).toHaveBeenCalledTimes(1);

      act(() => api.hide());
      expect(hideSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('the invoker source', () => {
    /**
     * Mirror the Popover API's option conversion: `source` must be an HTML
     * element, from any document, and any other element throws before the
     * popover shows.
     */
    function installSourceCheckingShowPopover(
      view: Window & typeof globalThis,
    ) {
      const showSpy = vi.fn(function (
        this: HTMLElement,
        options?: ShowPopoverOptions,
      ) {
        const source: Element | undefined = options?.source;
        const sourceView = source?.ownerDocument.defaultView;
        if (
          source != null &&
          !(sourceView != null && source instanceof sourceView.HTMLElement)
        ) {
          throw new TypeError(
            "Failed to execute 'showPopover' on 'HTMLElement': Failed to read the 'source' property from 'ShowPopoverOptions': Failed to convert value to 'HTMLElement'.",
          );
        }
        this.dataset.open = 'true';
      });
      view.HTMLElement.prototype.showPopover = showSpy;
      return showSpy;
    }

    it('keeps an HTML trigger in another document as the source', () => {
      const frame = document.createElement('iframe');
      document.body.append(frame);
      try {
        const frameWindow = frame.contentWindow as Window & typeof globalThis;
        const showSpy = installSourceCheckingShowPopover(frameWindow);
        const container = frameWindow.document.body.appendChild(
          frameWindow.document.createElement('div'),
        );
        const {unmount} = render(<ContextLayerHarness />, {container});
        const trigger = container.querySelector('button') as HTMLElement;
        // An element of the frame's window, not of the test's.
        expect(trigger).not.toBeInstanceOf(HTMLElement);

        fireEvent.click(trigger);

        // Compared by identity: a deep comparison does not walk a node from
        // another window.
        expect(showSpy).toHaveBeenCalledOnce();
        expect(showSpy.mock.calls[0]?.[0]?.source).toBe(trigger);
        unmount();
      } finally {
        frame.remove();
      }
    });
  });

  describe('show() while another popover is mid show/hide', () => {
    /**
     * Mirror the Popover API's re-entrancy rule: hiding a popover hands focus
     * back to the element that had it, synchronously and while the document
     * still counts that popover as hiding, and `showPopover()` throws while
     * any popover in the document is being shown or hidden.
     */
    function installReentrantPopoverApi(
      duringHide?: (popover: HTMLElement) => void,
    ) {
      let operationsInFlight = 0;
      const previouslyFocused = new WeakMap<HTMLElement, Element | null>();
      const showSpy = vi.fn(function (this: HTMLElement) {
        if (operationsInFlight > 0) {
          throw new DOMException(
            "Failed to execute 'showPopover' on 'HTMLElement': Invalid to show a popover during another show operation",
            'InvalidStateError',
          );
        }
        operationsInFlight += 1;
        try {
          previouslyFocused.set(this, this.ownerDocument.activeElement);
          this.dataset.open = 'true';
        } finally {
          operationsInFlight -= 1;
        }
      });
      const hideSpy = vi.fn(function (this: HTMLElement) {
        operationsInFlight += 1;
        try {
          delete this.dataset.open;
          const target = previouslyFocused.get(this);
          previouslyFocused.delete(this);
          if (
            target instanceof HTMLElement &&
            this.contains(document.activeElement)
          ) {
            target.focus();
          }
          duringHide?.(this);
        } finally {
          operationsInFlight -= 1;
        }
      });
      HTMLElement.prototype.showPopover = showSpy;
      HTMLElement.prototype.hidePopover = hideSpy;
      return {showSpy, hideSpy};
    }

    /**
     * A trigger that opens a dismissible layer and also carries a focus-driven
     * layer (a tooltip), the shape every tooltip-bearing popover trigger has.
     */
    function FocusReturnHarness({onTooltipShow}: {onTooltipShow: () => void}) {
      const popover = useLayer({mode: 'context'});
      const tooltip = useLayer({mode: 'context', onShow: onTooltipShow});
      // A stable ref: an inline one detaches and reattaches the trigger on
      // every render, and each detach queues a microtask of its own that these
      // tests, which hold the ledger's microtasks by hand, do not mean to hold.
      const {ref: popoverRef} = popover;
      const {ref: tooltipRef} = tooltip;
      const triggerRef = useCallback(
        (el: HTMLButtonElement | null) => {
          popoverRef(el);
          tooltipRef(el);
        },
        [popoverRef, tooltipRef],
      );
      return (
        <>
          <button
            type="button"
            ref={triggerRef}
            onFocus={tooltip.show}
            onBlur={tooltip.hide}
            onClick={popover.show}>
            Trigger
          </button>
          {popover.render(
            <button
              type="button"
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  popover.hide();
                }
              }}>
              Inside
            </button>,
            {role: 'dialog'},
          )}
          {tooltip.render(<span>Tip</span>, {role: 'tooltip'})}
        </>
      );
    }

    it('defers the show a returning focus requests until the hide has returned', async () => {
      const {showSpy} = installReentrantPopoverApi();
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        errors.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', onError);
      const onTooltipShow = vi.fn();
      const {getByRole} = render(
        <FocusReturnHarness onTooltipShow={onTooltipShow} />,
      );
      const trigger = getByRole('button', {name: 'Trigger'});
      const inside = getByRole('button', {name: 'Inside', hidden: true});

      // Keyboard-open the popover: the tooltip shows on focus, the popover on
      // the press, and focus moves inside — the tooltip closes behind it.
      act(() => trigger.focus());
      fireEvent.click(trigger);
      act(() => inside.focus());
      expect(onTooltipShow).toHaveBeenCalledTimes(1);
      expect(getByRole('dialog', {hidden: true})).toHaveAttribute(
        'data-open',
        'true',
      );
      expect(getByRole('tooltip', {hidden: true})).not.toHaveAttribute(
        'data-open',
      );

      // Escape hides the popover; the browser returns focus to the trigger
      // inside that hide, and the tooltip asks to show.
      fireEvent.keyDown(inside, {key: 'Escape'});
      window.removeEventListener('error', onError);

      expect(errors).toEqual([]);
      expect(document.activeElement).toBe(trigger);
      expect(getByRole('dialog', {hidden: true})).not.toHaveAttribute(
        'data-open',
      );
      // Nothing reached the browser while the hide was running; the deferred
      // show runs exactly once, after the press has unwound.
      expect(onTooltipShow).toHaveBeenCalledTimes(1);
      await act(async () => {});
      expect(showSpy.mock.results.every(r => r.type === 'return')).toBe(true);
      expect(getByRole('tooltip', {hidden: true})).toHaveAttribute(
        'data-open',
        'true',
      );
      expect(onTooltipShow).toHaveBeenCalledTimes(2);
    });

    /**
     * The browser's own hide: an Escape its close watcher answers never calls
     * the hook's hide(). The engine fires `beforetoggle` synchronously as the
     * hide starts, restores focus inside the hide when focus was inside the
     * popover, and fires `toggle` in a task once it has ended; `showPopover()`
     * throws throughout.
     */
    function installBrowserHidePopoverApi() {
      // The ledger's backstop for a hide whose `toggle` never arrives is the
      // next task; under fake timers, the test decides when that task runs,
      // so the `toggle` tasks below end a hide first, as in a browser.
      vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
      let operationsInFlight = 0;
      const previouslyFocused = new WeakMap<HTMLElement, Element | null>();
      const toggleTasks: (() => void)[] = [];
      const fireToggle = (
        popover: HTMLElement,
        type: 'beforetoggle' | 'toggle',
        newState: 'open' | 'closed',
      ) => {
        const event = new Event(type, {bubbles: false});
        Object.defineProperty(event, 'newState', {
          value: newState,
          configurable: true,
        });
        popover.dispatchEvent(event);
      };
      const hide = (popover: HTMLElement) => {
        operationsInFlight += 1;
        try {
          fireToggle(popover, 'beforetoggle', 'closed');
          delete popover.dataset.open;
          toggleTasks.push(() => fireToggle(popover, 'toggle', 'closed'));
          const target = previouslyFocused.get(popover);
          previouslyFocused.delete(popover);
          if (
            target instanceof HTMLElement &&
            popover.contains(document.activeElement)
          ) {
            target.focus();
          }
        } finally {
          operationsInFlight -= 1;
        }
      };
      let refusals = 0;
      const showSpy = vi.fn(function (this: HTMLElement) {
        if (operationsInFlight > 0 || refusals > 0) {
          refusals = Math.max(0, refusals - 1);
          throw new DOMException(
            "Failed to execute 'showPopover' on 'HTMLElement': Invalid to show a popover during another show operation",
            'InvalidStateError',
          );
        }
        operationsInFlight += 1;
        try {
          fireToggle(this, 'beforetoggle', 'open');
          previouslyFocused.set(this, this.ownerDocument.activeElement);
          this.dataset.open = 'true';
          toggleTasks.push(() => fireToggle(this, 'toggle', 'open'));
        } finally {
          operationsInFlight -= 1;
        }
      });
      const hideSpy = vi.fn(function (this: HTMLElement) {
        hide(this);
      });
      HTMLElement.prototype.showPopover = showSpy;
      HTMLElement.prototype.hidePopover = hideSpy;
      return {
        showSpy,
        hideSpy,
        /** The browser hides the popover itself: a close watcher's Escape. */
        browserHide: (popover: HTMLElement) => hide(popover),
        /** The task after the hide: the queued `toggle` events fire. */
        runToggleTasks: () => {
          for (const task of toggleTasks.splice(0)) {
            task();
          }
        },
        /** The engine refuses the next show too, whatever is in flight. */
        refuseNextShow: () => {
          refusals += 1;
        },
      };
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('defers the show a browser-run hide wakes until that hide has ended, and replays it at its toggle', async () => {
      const {showSpy, browserHide, runToggleTasks} =
        installBrowserHidePopoverApi();
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        errors.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', onError);
      const onTooltipShow = vi.fn();
      const {getByRole} = render(
        <FocusReturnHarness onTooltipShow={onTooltipShow} />,
      );
      const trigger = getByRole('button', {name: 'Trigger'});
      const inside = getByRole('button', {name: 'Inside', hidden: true});
      const popover = getByRole('dialog', {hidden: true});

      act(() => trigger.focus());
      fireEvent.click(trigger);
      act(() => inside.focus());
      runToggleTasks();
      expect(onTooltipShow).toHaveBeenCalledTimes(1);
      expect(popover).toHaveAttribute('data-open', 'true');

      // Escape, answered by the browser's close watcher: it hides the popover
      // on its own and returns focus to the trigger inside that hide; the
      // tooltip asks to show.
      act(() => browserHide(popover));
      window.removeEventListener('error', onError);

      expect(errors).toEqual([]);
      expect(document.activeElement).toBe(trigger);
      expect(popover).not.toHaveAttribute('data-open');
      // The show was asked of the browser inside the hide and refused; the
      // hook kept the refusal to itself and parked the show. Nothing else is
      // asked before the hide ends at its `toggle`, not even after the
      // script unwound.
      await act(async () => {});
      const refusals = () =>
        showSpy.mock.results.filter(r => r.type === 'throw').length;
      expect(refusals()).toBe(1);
      expect(getByRole('tooltip', {hidden: true})).not.toHaveAttribute(
        'data-open',
      );
      expect(onTooltipShow).toHaveBeenCalledTimes(1);

      // The task after the hide: the popover's `toggle` fires, the hook
      // reconciles its state, and the parked show runs exactly once.
      act(() => runToggleTasks());
      await act(async () => {});
      expect(refusals()).toBe(1);
      expect(getByRole('tooltip', {hidden: true})).toHaveAttribute(
        'data-open',
        'true',
      );
      expect(onTooltipShow).toHaveBeenCalledTimes(2);
      expect(popover).not.toHaveAttribute('data-open');
    });

    it('lets a replay the browser refuses again reach the page, and parks nothing more', async () => {
      const {showSpy, browserHide, runToggleTasks, refuseNextShow} =
        installBrowserHidePopoverApi();
      const onTooltipShow = vi.fn();
      const {getByRole} = render(
        <FocusReturnHarness onTooltipShow={onTooltipShow} />,
      );
      const trigger = getByRole('button', {name: 'Trigger'});
      const inside = getByRole('button', {name: 'Inside', hidden: true});
      const popover = getByRole('dialog', {hidden: true});
      act(() => trigger.focus());
      fireEvent.click(trigger);
      act(() => inside.focus());
      runToggleTasks();
      const refusals = () =>
        showSpy.mock.results.filter(r => r.type === 'throw').length;

      // The hide wakes the tooltip; the browser refuses; the show is parked.
      act(() => browserHide(popover));
      expect(refusals()).toBe(1);

      // Hold the microtasks the ledger queues, to run the replay by hand.
      const held: (() => void)[] = [];
      const queue = vi
        .spyOn(globalThis, 'queueMicrotask')
        .mockImplementation(callback => {
          held.push(callback);
        });
      try {
        act(() => runToggleTasks());
        // The hide's end queued the batch; the batch queues the one replay.
        expect(held).toHaveLength(1);
        held.shift()?.();
        expect(held).toHaveLength(1);
        const replay = held.shift();
        // The replay runs outside the hide, so a browser that refuses again
        // throws to the page from the replay's own microtask: nothing catches
        // it, and nothing is parked again.
        refuseNextShow();
        expect(replay).toThrow(
          expect.objectContaining({name: 'InvalidStateError'}),
        );
        expect(held).toHaveLength(0);
      } finally {
        queue.mockRestore();
      }
      await act(async () => {});
      expect(refusals()).toBe(2);
      expect(getByRole('tooltip', {hidden: true})).not.toHaveAttribute(
        'data-open',
      );
      expect(onTooltipShow).toHaveBeenCalledTimes(1);
    });

    it('reports a close start as a hide starts, before its toggle: the browser\u2019s own hide and hide() alike', () => {
      const {browserHide, runToggleTasks} = installBrowserHidePopoverApi();
      const events: string[] = [];
      function CloseStartHarness() {
        const layer = useLayerInternal({
          mode: 'context',
          onCloseStart: () => events.push('close-start'),
          onHide: () => events.push('hide'),
        });
        return (
          <>
            <button type="button" ref={layer.ref} onClick={layer.show}>
              Trigger
            </button>
            <button type="button" onClick={layer.hide}>
              Close
            </button>
            {layer.render(<span>Content</span>)}
          </>
        );
      }
      const {getByRole, getByText} = render(<CloseStartHarness />);
      fireEvent.click(getByRole('button', {name: 'Trigger'}));
      act(() => runToggleTasks());
      expect(events).toEqual([]);
      // The browser hides the popover itself, as a close watcher's Escape.
      const popover = getByText('Content').closest<HTMLElement>('[popover]')!;
      act(() => browserHide(popover));
      expect(events).toEqual(['close-start']);
      act(() => runToggleTasks());
      expect(events).toEqual(['close-start', 'hide']);
      // The hook's own hide() starts a close the same way, before its hide.
      fireEvent.click(getByRole('button', {name: 'Trigger'}));
      act(() => runToggleTasks());
      fireEvent.click(getByRole('button', {name: 'Close'}));
      expect(events).toEqual(['close-start', 'hide', 'close-start', 'hide']);
    });

    it('opens a layer at once when the press that closed another one opens it after the hide has returned', () => {
      // A light dismiss runs at pointerup and the click that follows opens the
      // next layer in the same gesture: the browser accepts that show (its
      // hide has returned) although the hidden layer's `toggle` has not fired.
      const {showSpy, browserHide, runToggleTasks} =
        installBrowserHidePopoverApi();
      const api: {first?: FixedLayerReturn; second?: FixedLayerReturn} = {};
      const onSecondShow = vi.fn();
      function Harness() {
        api.first = useLayer({mode: 'fixed'});
        api.second = useLayer({mode: 'fixed', onShow: onSecondShow});
        return (
          <>
            {api.first.render(<span>First</span>, {x: 0, y: 0})}
            {api.second.render(<span>Second</span>, {x: 0, y: 0})}
          </>
        );
      }
      const {getByText} = render(<Harness />);
      act(() => api.first?.show());
      const first = getByText('First').closest('[popover]') as HTMLElement;
      const second = getByText('Second').closest('[popover]') as HTMLElement;

      act(() => {
        browserHide(first);
        api.second?.show();
      });
      expect(showSpy.mock.results.every(r => r.type === 'return')).toBe(true);
      expect(second).toHaveAttribute('data-open', 'true');
      expect(onSecondShow).toHaveBeenCalledTimes(1);
      expect(api.second?.isOpen).toBe(true);
      // The first layer's hide ends at its toggle, with nothing left to replay.
      act(() => runToggleTasks());
      expect(onSecondShow).toHaveBeenCalledTimes(1);
    });

    it('keeps counting a browser-run hide across a render it causes (an inline onHide, a state update in the focus handler)', async () => {
      const {showSpy, browserHide, runToggleTasks} =
        installBrowserHidePopoverApi();
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        errors.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', onError);
      const onTooltipShow = vi.fn();
      // The host re-renders inside the hide: the focus handler sets state,
      // and `onHide` is a new function each render, so React rebinds the
      // layer's `toggle` listener and ref while the hide is still running.
      function RerenderingHarness() {
        const [focusCount, setFocusCount] = useState(0);
        const popover = useLayer({mode: 'context', onHide: () => {}});
        const tooltip = useLayer({mode: 'context', onShow: onTooltipShow});
        return (
          <>
            <button
              type="button"
              ref={el => {
                popover.ref(el);
                tooltip.ref(el);
              }}
              onFocus={() => {
                setFocusCount(count => count + 1);
                tooltip.show();
              }}
              onBlur={tooltip.hide}
              onClick={popover.show}>
              Trigger {focusCount}
            </button>
            {popover.render(<button type="button">Inside</button>, {
              role: 'dialog',
            })}
            {tooltip.render(<span>Tip</span>, {role: 'tooltip'})}
          </>
        );
      }
      const {getByRole} = render(<RerenderingHarness />);
      const trigger = getByRole('button', {name: /Trigger/});
      const inside = getByRole('button', {name: 'Inside', hidden: true});
      const popover = getByRole('dialog', {hidden: true});

      act(() => trigger.focus());
      fireEvent.click(trigger);
      act(() => inside.focus());
      runToggleTasks();
      expect(onTooltipShow).toHaveBeenCalledTimes(1);

      act(() => browserHide(popover));
      window.removeEventListener('error', onError);
      expect(errors).toEqual([]);
      await act(async () => {});
      const refusals = () =>
        showSpy.mock.results.filter(r => r.type === 'throw').length;
      // One refusal, kept by the hook; still inside the hide's window, so
      // nothing replayed yet, however the host re-rendered meanwhile.
      expect(refusals()).toBe(1);
      expect(onTooltipShow).toHaveBeenCalledTimes(1);

      act(() => runToggleTasks());
      await act(async () => {});
      expect(refusals()).toBe(1);
      expect(getByRole('tooltip', {hidden: true})).toHaveAttribute(
        'data-open',
        'true',
      );
      expect(onTooltipShow).toHaveBeenCalledTimes(2);
    });

    it('releases a browser-run hide whose element detaches before its toggle, so later shows run', async () => {
      const {showSpy, browserHide} = installBrowserHidePopoverApi();
      const api: {popover?: FixedLayerReturn; tooltip?: FixedLayerReturn} = {};
      function Harness({withPopover}: {withPopover: boolean}) {
        api.popover = useLayer({mode: 'fixed'});
        api.tooltip = useLayer({mode: 'fixed'});
        return (
          <>
            {withPopover &&
              api.popover.render(<span>Popover</span>, {x: 0, y: 0})}
            {api.tooltip.render(<span>Tip</span>, {x: 0, y: 0})}
          </>
        );
      }
      const {getByText, rerender} = render(<Harness withPopover />);
      act(() => api.popover?.show());
      const popover = getByText('Popover').closest('[popover]') as HTMLElement;
      // The browser hides it, and React unmounts it before the `toggle` task.
      act(() => browserHide(popover));
      rerender(<Harness withPopover={false} />);
      expect(popover.isConnected).toBe(false);

      // The hide was synchronous: the task after it is past the window.
      act(() => {
        vi.runOnlyPendingTimers();
      });
      act(() => api.tooltip?.show());
      await act(async () => {});
      expect(showSpy).toHaveBeenCalledTimes(2);
      expect(getByText('Tip').closest('[popover]')).toHaveAttribute(
        'data-open',
        'true',
      );
    });

    it('drops a deferred show that hide() cancels before it replays', async () => {
      const api: {popover?: FixedLayerReturn; tooltip?: FixedLayerReturn} = {};
      // While the popover hides, the tooltip asks to show and then changes
      // its mind before the hide returns.
      const {showSpy} = installReentrantPopoverApi(() => {
        api.tooltip?.show();
        api.tooltip?.hide();
      });
      function Harness() {
        api.popover = useLayer({mode: 'fixed'});
        api.tooltip = useLayer({mode: 'fixed'});
        return (
          <>
            {api.popover.render(<span>Popover</span>, {x: 0, y: 0})}
            {api.tooltip.render(<span>Tip</span>, {x: 0, y: 0})}
          </>
        );
      }
      const {getByText} = render(<Harness />);

      act(() => api.popover?.show());
      act(() => api.popover?.hide());
      await act(async () => {});

      // Only the popover's own show reached the browser.
      expect(showSpy).toHaveBeenCalledTimes(1);
      expect(getByText('Tip').closest('[popover]')).not.toHaveAttribute(
        'data-open',
      );
    });
  });

  describe('the trigger is an anchor only while its layer is shown', () => {
    const anchorNames = (element: Element) =>
      (element as HTMLElement).style
        .getPropertyValue('anchor-name')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean);

    /** The close fade TopNavMegaMenu declares: the hidden layer stays shown. */
    const declareCloseFade = (layer: HTMLElement) => {
      layer.style.setProperty('transition-property', 'opacity, display');
      layer.style.setProperty('transition-behavior', 'allow-discrete');
      layer.style.setProperty('transition-duration', '0.2s');
    };

    function SharedTriggerHarness({
      onReady,
    }: {
      onReady: (api: {
        tooltip: {show: () => void; hide: () => void};
        menu: {show: () => void; hide: () => void};
      }) => void;
    }) {
      const tooltip = useLayer({mode: 'context'});
      const menu = useLayer({mode: 'context'});
      onReady({
        tooltip: {show: tooltip.show, hide: tooltip.hide},
        menu: {show: menu.show, hide: menu.hide},
      });
      const ref = useMergedRefs(tooltip.ref, menu.ref);
      return (
        <>
          <button type="button" ref={ref}>
            Trigger
          </button>
          {tooltip.render(<span>Tooltip</span>)}
          {menu.render(<span>Menu</span>)}
        </>
      );
    }

    function SwappedTriggerHarness({
      second,
      onReady,
    }: {
      second: boolean;
      onReady: (api: {show: () => void; hide: () => void}) => void;
    }) {
      const layer = useLayer({mode: 'context'});
      onReady({show: layer.show, hide: layer.hide});
      return (
        <>
          {second ? (
            <button type="button" key="second" ref={layer.ref}>
              Second
            </button>
          ) : (
            <button type="button" key="first" ref={layer.ref}>
              First
            </button>
          )}
          {layer.render(<span>Layer content</span>)}
        </>
      );
    }

    it('gives a closed trigger no anchor name, and a shown layer\u2019s trigger its own', () => {
      const {getByRole, container} = render(<ContextLayerHarness />);
      const trigger = getByRole('button', {name: 'Trigger'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      expect(anchorNames(trigger)).toEqual([]);

      fireEvent.click(trigger);

      const names = anchorNames(trigger);
      expect(names).toHaveLength(1);
      expect(layer.getAttribute('style')).toContain(names[0]);
    });

    it('takes the anchor name away when the layer hides, and when the browser closes it', () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      act(() => api.show());
      expect(anchorNames(trigger)).toHaveLength(1);

      act(() => api.hide());
      expect(anchorNames(trigger)).toEqual([]);

      act(() => api.show());
      expect(anchorNames(trigger)).toHaveLength(1);
      const layer = container.querySelector('[popover]') as HTMLElement;
      act(() => {
        layer.dispatchEvent(
          Object.assign(new Event('toggle'), {
            oldState: 'open',
            newState: 'closed',
          }),
        );
      });
      expect(anchorNames(trigger)).toEqual([]);
    });

    it('reads no animations when nothing keeps the hidden layer shown', () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      // Without a discrete `display` transition the layer stops painting as
      // it hides. Reading the animations would lay the page out once more.
      layer.style.setProperty('transition-property', 'opacity, overlay');
      layer.style.setProperty('transition-behavior', 'allow-discrete');
      layer.style.setProperty('transition-duration', '0.2s');
      const read = vi.fn((): Animation[] => []);
      layer.getAnimations = read;
      act(() => api.show());
      act(() => api.hide());
      expect(read).not.toHaveBeenCalled();
      expect(anchorNames(trigger)).toEqual([]);

      act(() => api.show());
      act(() => {
        layer.dispatchEvent(
          Object.assign(new Event('toggle'), {
            oldState: 'open',
            newState: 'closed',
          }),
        );
      });
      expect(read).not.toHaveBeenCalled();
      expect(anchorNames(trigger)).toEqual([]);
    });

    it('reads the animations of a layer whose closed state alone declares a keyframe animation', () => {
      let api = {show: () => {}, hide: () => {}};
      const {container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const layer = container.querySelector('[popover]') as HTMLElement;
      const read = vi.fn((): Animation[] => []);
      layer.getAnimations = read;
      // An entrance that both states declare: the hide stops it.
      layer.style.setProperty('animation-name', 'layer-enter');
      act(() => api.show());
      act(() => api.hide());
      expect(read).not.toHaveBeenCalled();

      // An exit that only the closed state declares starts at the close, and
      // it can animate `display`.
      layer.style.setProperty('animation-name', 'layer-exit');
      const show = vi.spyOn(layer, 'showPopover').mockImplementation(() => {
        layer.style.setProperty('animation-name', 'layer-enter');
      });
      act(() => api.show());
      act(() => api.hide());
      expect(read).toHaveBeenCalledTimes(1);
      show.mockRestore();
    });

    it('reads the close transition from the closed state\u2019s style', async () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      // An instant open and a fading close: only the closed state declares
      // the transition.
      declareCloseFade(layer);
      vi.spyOn(layer, 'showPopover').mockImplementation(() => {
        layer.style.setProperty('transition-duration', '0s');
      });
      let end = () => {};
      const finished = new Promise<void>(resolve => {
        end = resolve;
      });
      layer.getAnimations = () =>
        [
          {
            finished,
            playState: 'running',
            effect: {getComputedTiming: () => ({endTime: 200})},
          },
        ] as unknown as Animation[];
      act(() => api.show());
      act(() => api.hide());
      expect(anchorNames(trigger)).toHaveLength(1);
      await act(async () => {
        end();
        await finished;
      });
      expect(anchorNames(trigger)).toEqual([]);
    });

    const closing = () =>
      Object.assign(new Event('beforetoggle'), {
        oldState: 'open',
        newState: 'closed',
      });

    // The layer's own transition, set on its style while it is closed.
    function declareTransition(
      layer: HTMLElement,
      transition: {
        property: string;
        behavior: string;
        duration: string;
        delay: string;
      },
    ) {
      layer.style.setProperty('transition-property', transition.property);
      layer.style.setProperty('transition-behavior', transition.behavior);
      layer.style.setProperty('transition-duration', transition.duration);
      layer.style.setProperty('transition-delay', transition.delay);
    }

    // A running exit animation that ends when `end` is called.
    function exitAnimation() {
      let end = () => {};
      const finished = new Promise<void>(resolve => {
        end = resolve;
      });
      const animation = {
        finished,
        playState: 'running',
        effect: {getComputedTiming: () => ({endTime: 200})},
      } as unknown as Animation;
      return {animation, finished, end: () => end()};
    }

    it('drops the name inside our hide, in the layer\u2019s beforetoggle, and reads no animations after the hide', () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      const getAnimations = vi.fn(() => [] as Animation[]);
      layer.getAnimations = getAnimations;
      // A browser fires `beforetoggle` inside the hide, before the hide's own
      // layout.
      let namesInHide: string[] = [];
      const hidePopover = vi
        .spyOn(layer, 'hidePopover')
        .mockImplementation(() => {
          layer.dispatchEvent(closing());
          namesInHide = anchorNames(trigger);
        });
      try {
        act(() => api.show());
        act(() => api.hide());
        expect(namesInHide).toEqual([]);
        expect(anchorNames(trigger)).toEqual([]);
        // Nothing keeps the hidden layer shown, so the release reads nothing.
        expect(getAnimations).not.toHaveBeenCalled();
      } finally {
        hidePopover.mockRestore();
      }
    });

    it('keeps the name through the beforetoggle of a close the browser runs itself, and releases it from the toggle event', async () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      const toggle = () =>
        act(() => {
          layer.dispatchEvent(
            Object.assign(new Event('toggle'), {
              oldState: 'open',
              newState: 'closed',
            }),
          );
        });
      const exit = exitAnimation();
      layer.getAnimations = () => [exit.animation];

      // No exit: the toggle releases the name.
      act(() => api.show());
      act(() => {
        layer.dispatchEvent(closing());
      });
      expect(anchorNames(trigger)).toHaveLength(1);
      toggle();
      expect(anchorNames(trigger)).toEqual([]);

      // A close fade: the name stays until the fade ends.
      declareCloseFade(layer);
      act(() => api.show());
      act(() => {
        layer.dispatchEvent(closing());
      });
      toggle();
      expect(anchorNames(trigger)).toHaveLength(1);
      await act(async () => {
        exit.end();
        await exit.finished;
      });
      expect(anchorNames(trigger)).toEqual([]);
    });

    it('keeps the name through our hide for a layer whose closed state alone declares the fade, until the fade ends', async () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      // An instant open and a fading close: only the closed state declares
      // the transition.
      declareCloseFade(layer);
      vi.spyOn(layer, 'showPopover').mockImplementation(() => {
        layer.style.setProperty('transition-duration', '0s');
      });
      const exit = exitAnimation();
      layer.getAnimations = () => [exit.animation];
      let namesInHide: string[] = [];
      const hidePopover = vi
        .spyOn(layer, 'hidePopover')
        .mockImplementation(() => {
          layer.dispatchEvent(closing());
          namesInHide = anchorNames(trigger);
        });
      try {
        act(() => api.show());
        act(() => api.hide());
        expect(namesInHide).toHaveLength(1);
        // Still painting, so still placed against its trigger.
        expect(anchorNames(trigger)).toHaveLength(1);
        await act(async () => {
          exit.end();
          await exit.finished;
        });
        expect(anchorNames(trigger)).toEqual([]);
      } finally {
        hidePopover.mockRestore();
      }
    });

    it.each([
      {
        transition: {
          property: 'opacity, display, overlay',
          behavior: 'normal, allow-discrete, allow-discrete',
          duration: '0.2s',
          delay: '0s',
        },
        keepsShown: true,
      },
      {
        transition: {
          property: 'all',
          behavior: 'allow-discrete',
          duration: '150ms',
          delay: '0s',
        },
        keepsShown: true,
      },
      {
        transition: {
          property: 'display',
          behavior: 'normal',
          duration: '0.2s',
          delay: '0s',
        },
        keepsShown: false,
      },
      {
        transition: {
          property: 'display',
          behavior: 'allow-discrete',
          duration: '0s',
          delay: '0s',
        },
        keepsShown: false,
      },
      {
        transition: {
          property: 'opacity',
          behavior: 'allow-discrete',
          duration: '0.2s',
          delay: '0s',
        },
        keepsShown: false,
      },
      {
        transition: {
          property: 'overlay',
          behavior: 'allow-discrete',
          duration: '0.2s',
          delay: '0s',
        },
        keepsShown: false,
      },
    ])(
      'in our hide\u2019s beforetoggle, keeps the name only for a layer its closed state keeps shown: $transition.property $transition.duration $transition.behavior',
      ({transition, keepsShown}) => {
        let api = {show: () => {}, hide: () => {}};
        const {getByRole, container} = render(
          <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
        );
        const trigger = getByRole('button', {name: 'First'});
        const layer = container.querySelector('[popover]') as HTMLElement;
        declareTransition(layer, transition);
        layer.getAnimations = () => [];
        let namesInHide: string[] = [];
        const hidePopover = vi
          .spyOn(layer, 'hidePopover')
          .mockImplementation(() => {
            layer.dispatchEvent(closing());
            namesInHide = anchorNames(trigger);
          });
        try {
          act(() => api.show());
          act(() => api.hide());
          expect(namesInHide).toHaveLength(keepsShown ? 1 : 0);
        } finally {
          hidePopover.mockRestore();
        }
      },
    );

    it('keeps the name while the layer fades out, and for a show during the fade', async () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      // A close fade the browser runs after the hide, as TopNavMegaMenu's.
      declareCloseFade(layer);
      const fade = () => {
        let end = () => {};
        const finished = new Promise<void>(resolve => {
          end = resolve;
        });
        layer.getAnimations = () =>
          [
            {
              finished,
              playState: 'running',
              effect: {getComputedTiming: () => ({endTime: 200})},
            },
          ] as unknown as Animation[];
        return {end, finished};
      };

      let exit = fade();
      act(() => api.show());
      act(() => api.hide());
      // Still painting, so still placed against its trigger.
      expect(anchorNames(trigger)).toHaveLength(1);
      await act(async () => {
        exit.end();
        await exit.finished;
      });
      expect(anchorNames(trigger)).toEqual([]);

      exit = fade();
      act(() => api.show());
      act(() => api.hide());
      act(() => api.show());
      await act(async () => {
        exit.end();
        await exit.finished;
      });
      expect(anchorNames(trigger)).toHaveLength(1);
    });

    it('keeps the name on a trigger that attaches again while the layer fades out', async () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container, rerender} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const layer = container.querySelector('[popover]') as HTMLElement;
      declareCloseFade(layer);
      let end = () => {};
      const finished = new Promise<void>(resolve => {
        end = resolve;
      });
      layer.getAnimations = () =>
        [
          {
            finished,
            playState: 'running',
            effect: {getComputedTiming: () => ({endTime: 200})},
          },
        ] as unknown as Animation[];
      act(() => api.show());
      act(() => api.hide());
      // A render during the fade attaches another trigger element.
      rerender(<SwappedTriggerHarness second onReady={a => (api = a)} />);
      const second = getByRole('button', {name: 'Second'});
      expect(anchorNames(second)).toHaveLength(1);
      await act(async () => {
        end();
        await finished;
      });
      expect(anchorNames(second)).toEqual([]);
    });

    it('keeps the name for a show the browser refuses while the layer fades out', async () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      declareCloseFade(layer);
      let end = () => {};
      const finished = new Promise<void>(resolve => {
        end = resolve;
      });
      layer.getAnimations = () =>
        [
          {
            finished,
            playState: 'running',
            effect: {getComputedTiming: () => ({endTime: 200})},
          },
        ] as unknown as Animation[];
      act(() => api.show());
      act(() => api.hide());
      // Another popover's hide, which the browser runs itself, is in flight,
      // and the browser refuses the show.
      const other = document.createElement('div');
      document.body.append(other);
      observeBrowserHide(other);
      const refuse = vi.spyOn(layer, 'showPopover').mockImplementation(() => {
        throw new DOMException(
          'Invalid to show a popover during another show operation',
          'InvalidStateError',
        );
      });
      act(() => api.show());
      expect(anchorNames(trigger)).toHaveLength(1);
      refuse.mockRestore();
      // A hide forgets the parked show; the fade still paints.
      act(() => api.hide());
      expect(anchorNames(trigger)).toHaveLength(1);
      other.dispatchEvent(new Event('toggle'));
      other.remove();
      await act(async () => {
        end();
        await finished;
      });
      expect(anchorNames(trigger)).toEqual([]);
    });

    it('takes the name away at once when the layer\u2019s only animation is paused', () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      // A paused animation never finishes, so it must not hold the name.
      declareCloseFade(layer);
      layer.getAnimations = () =>
        [
          {
            finished: new Promise(() => {}),
            playState: 'paused',
            effect: {getComputedTiming: () => ({endTime: 200})},
          },
        ] as unknown as Animation[];
      act(() => api.show());
      act(() => api.hide());
      expect(anchorNames(trigger)).toEqual([]);
    });

    it('takes the name away at once when the layer only runs an animation that never ends', () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, container} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'First'});
      const layer = container.querySelector('[popover]') as HTMLElement;
      declareCloseFade(layer);
      layer.getAnimations = () =>
        [
          {
            finished: new Promise(() => {}),
            playState: 'running',
            effect: {getComputedTiming: () => ({endTime: Infinity})},
          },
        ] as unknown as Animation[];
      act(() => api.show());
      act(() => api.hide());
      expect(anchorNames(trigger)).toEqual([]);
    });

    it('keeps each layer\u2019s name on a shared trigger for as long as that layer is shown', () => {
      let api = {
        tooltip: {show: () => {}, hide: () => {}},
        menu: {show: () => {}, hide: () => {}},
      };
      const {getByRole} = render(
        <SharedTriggerHarness onReady={a => (api = a)} />,
      );
      const trigger = getByRole('button', {name: 'Trigger'});
      expect(anchorNames(trigger)).toEqual([]);

      act(() => api.tooltip.show());
      const [tooltipName] = anchorNames(trigger);
      act(() => api.menu.show());
      expect(anchorNames(trigger)).toHaveLength(2);
      const menuName = anchorNames(trigger).find(name => name !== tooltipName);

      act(() => api.tooltip.hide());
      expect(anchorNames(trigger)).toEqual([menuName]);
      act(() => api.menu.hide());
      expect(anchorNames(trigger)).toEqual([]);
    });

    it('moves the name to a trigger that replaces a shown layer\u2019s, and gives none to one that replaces a closed layer\u2019s', () => {
      let api = {show: () => {}, hide: () => {}};
      const {getByRole, rerender} = render(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      const first = getByRole('button', {name: 'First'});
      act(() => api.show());

      rerender(<SwappedTriggerHarness second onReady={a => (api = a)} />);

      const second = getByRole('button', {name: 'Second'});
      expect(anchorNames(first)).toEqual([]);
      expect(anchorNames(second)).toHaveLength(1);

      act(() => api.hide());
      rerender(
        <SwappedTriggerHarness second={false} onReady={a => (api = a)} />,
      );
      expect(anchorNames(getByRole('button', {name: 'First'}))).toEqual([]);
      expect(anchorNames(second)).toEqual([]);
    });
  });

  describe('when the Popover API is unsupported (Safari <17 / Firefox <125)', () => {
    it('show() does not throw when showPopover is undefined and the layer becomes visible', () => {
      // Simulate a browser without the Popover API (finding infra-4).
      // @ts-expect-error - simulate missing API
      delete HTMLElement.prototype.showPopover;
      // @ts-expect-error - simulate missing API
      delete HTMLElement.prototype.hidePopover;

      let api: {show: () => void; hide: () => void} = {
        show: () => {},
        hide: () => {},
      };
      const {container} = render(<LayerHarness onReady={a => (api = a)} />);

      const layerEl = container.querySelector('[popover]') as HTMLElement;
      expect(layerEl).not.toBeNull();

      expect(() => act(() => api.show())).not.toThrow();
      // Falls back to plain visibility so the layer is still usable.
      expect(layerEl.style.display).toBe('block');
    });

    it('hide() does not throw when hidePopover is undefined and the layer is hidden', () => {
      // @ts-expect-error - simulate missing API
      delete HTMLElement.prototype.showPopover;
      // @ts-expect-error - simulate missing API
      delete HTMLElement.prototype.hidePopover;

      let api: {show: () => void; hide: () => void} = {
        show: () => {},
        hide: () => {},
      };
      const {container} = render(<LayerHarness onReady={a => (api = a)} />);
      const layerEl = container.querySelector('[popover]') as HTMLElement;

      act(() => api.show());
      expect(() => act(() => api.hide())).not.toThrow();
      expect(layerEl.style.display).toBe('none');
    });
  });
});

/**
 * Harness that owns the trigger element.
 */
function Harness({
  placement,
  alignment,
  triggerStyle,
  triggerDir,
}: {
  placement: LayerPlacement;
  alignment: LayerAlignment;
  triggerStyle?: React.CSSProperties;
  triggerDir?: string;
}) {
  const layer = useLayer({mode: 'context'});
  return (
    <>
      <button
        type="button"
        ref={layer.ref}
        dir={triggerDir}
        style={triggerStyle}
        onClick={layer.isOpen ? layer.hide : layer.show}>
        trigger
      </button>
      {layer.render(<span>content</span>, {placement, alignment})}
    </>
  );
}

async function openAndGetStyle(ui: React.ReactElement): Promise<string> {
  const user = userEvent.setup();
  const {container, getByRole} = render(ui);
  await user.click(getByRole('button', {name: 'trigger'}));
  const popover = container.querySelector('[popover]');
  return popover?.getAttribute('style') ?? '';
}

describe('typography baseline', () => {
  const overrideStyles = stylex.create({
    supporting: {fontSize: typeScaleVars['--text-supporting-size']},
  });

  function TypographyHarness({
    ambientFontSize,
    xstyle,
  }: {
    ambientFontSize: string;
    xstyle?: ContextRenderProps['xstyle'];
  }) {
    const layer = useLayer({mode: 'context'});
    return (
      <div style={{fontSize: ambientFontSize, lineHeight: '3'}}>
        <button type="button" ref={layer.ref} onClick={layer.show}>
          trigger
        </button>
        {layer.render(<span>content</span>, {xstyle})}
      </div>
    );
  }

  async function openAndGetType(ui: React.ReactElement) {
    const user = userEvent.setup();
    const {container, getByRole} = render(ui);
    await user.click(getByRole('button', {name: 'trigger'}));
    const el = container.querySelector('[popover]') as HTMLElement;
    const computed = window.getComputedStyle(el);
    return {fontSize: computed.fontSize, lineHeight: computed.lineHeight};
  }

  // jsdom resolves no var() indirection, so the token reference is what the
  // assertion can see — the point is that a declaration exists at all, since
  // an absent one is exactly what let the ambient size through.
  it.each(['13px', '20px'])(
    'takes the body role rather than the surrounding %s',
    async ambientFontSize => {
      expect(
        await openAndGetType(
          <TypographyHarness ambientFontSize={ambientFontSize} />,
        ),
      ).toEqual({
        fontSize: 'var(--text-body-size)',
        lineHeight: 'var(--text-body-leading)',
      });
    },
  );

  it('still lets a consumer xstyle set its own size', async () => {
    const {fontSize} = await openAndGetType(
      <TypographyHarness
        ambientFontSize="13px"
        xstyle={overrideStyles.supporting}
      />,
    );
    expect(fontSize).toBe('var(--text-supporting-size)');
  });
});

describe('useLayer context positioning', () => {
  // The mapping uses the self-* logical keyword family, so the emitted
  // string is direction-independent by construction: the browser resolves
  // the inline axis against the popover's own inherited direction, and RTL
  // mirrors with no JS. jsdom has no layout engine, so these tests can only
  // assert the emitted string — the actual RTL geometry is covered by the
  // RTL Storybook story (and was verified against the full 12-cell matrix
  // in a real browser).
  describe('self-* position-area mapping', () => {
    it.each([
      // [placement, alignment, expected position-area]
      ['above', 'start', 'self-block-start span-self-inline-end'],
      ['above', 'center', 'self-block-start'],
      ['above', 'end', 'self-block-start span-self-inline-start'],
      ['below', 'start', 'self-block-end span-self-inline-end'],
      ['below', 'center', 'self-block-end'],
      ['below', 'end', 'self-block-end span-self-inline-start'],
      ['start', 'start', 'self-inline-start span-self-block-end'],
      ['start', 'center', 'self-inline-start'],
      ['start', 'end', 'self-inline-start span-self-block-start'],
      ['end', 'start', 'self-inline-end span-self-block-end'],
      ['end', 'center', 'self-inline-end'],
      ['end', 'end', 'self-inline-end span-self-block-start'],
    ] as const)(
      'placement=%s alignment=%s emits position-area %s',
      async (placement, alignment, expectedArea) => {
        const style = await openAndGetStyle(
          <Harness placement={placement} alignment={alignment} />,
        );
        expect(style).toMatch(
          new RegExp(`position-area: ${expectedArea}(;|$)`),
        );
        expect(style).not.toContain('justify-self');
      },
    );

    it('emits the same string regardless of trigger direction', async () => {
      const user = userEvent.setup();
      const first = render(<Harness placement="below" alignment="start" />);
      await user.click(first.getByRole('button', {name: 'trigger'}));
      const ltr =
        first.container.querySelector('[popover]')?.getAttribute('style') ?? '';
      first.unmount();

      const second = render(
        <Harness
          placement="below"
          alignment="start"
          triggerDir="rtl"
          triggerStyle={{direction: 'rtl'}}
        />,
      );
      await user.click(second.getByRole('button', {name: 'trigger'}));
      const rtl =
        second.container.querySelector('[popover]')?.getAttribute('style') ??
        '';
      // The unique position-anchor id differs per render; the placement
      // mapping must not.
      const positionArea = (s: string) => s.match(/position-area:[^;]*/)?.[0];
      expect(positionArea(rtl)).toBeDefined();
      expect(positionArea(rtl)).toBe(positionArea(ltr));
    });

    it('keeps position-try fallbacks intact', async () => {
      const style = await openAndGetStyle(
        <Harness placement="below" alignment="start" />,
      );
      expect(style).toContain(
        'position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline',
      );
    });
  });

  describe("positioning='custom' (consumer-authored position styles)", () => {
    // Consumers like Carousel and Tokenizer keep useLayer's popover behavior
    // and anchor wiring but position the layer themselves. The opt-out must
    // suppress every placement-derived style — position-area and the try
    // fallbacks — so those consumers never need to know which properties
    // the hook would have emitted.
    function CustomHarness({
      triggerStyle,
      renderProps,
    }: {
      triggerStyle?: React.CSSProperties;
      renderProps: ContextRenderProps;
    }) {
      const layer = useLayer({mode: 'context'});
      return (
        <>
          <button
            type="button"
            ref={layer.ref}
            style={triggerStyle}
            onClick={layer.isOpen ? layer.hide : layer.show}>
            trigger
          </button>
          {layer.render(<span>content</span>, renderProps)}
        </>
      );
    }

    it('keeps the anchor wiring but derives no placement styles', async () => {
      const style = await openAndGetStyle(
        <CustomHarness
          renderProps={{
            positioning: 'custom',
            style: {positionArea: 'center'},
          }}
        />,
      );
      expect(style).toContain('position-anchor');
      // The consumer-authored area is the only one present…
      expect(style).toContain('position-area: center');
      // …and no placement-derived styles leak through.
      expect(style).not.toContain('position-try-fallbacks');
    });

    it('ignores placement and alignment when positioning is custom', async () => {
      // placement/alignment are documented as ignored under custom. Derived
      // output would be position-area "self-block-end span-self-inline-end";
      // none of it may appear.
      const style = await openAndGetStyle(
        <CustomHarness
          renderProps={{
            positioning: 'custom',
            placement: 'below',
            alignment: 'start',
            style: {positionArea: 'center'},
          }}
        />,
      );
      expect(style).toContain('position-anchor');
      expect(style).toContain('position-area: center');
      expect(style).not.toContain('self-block');
      expect(style).not.toContain('position-try-fallbacks');
    });

    it('emits only the anchor wiring when custom positioning passes no style at all', async () => {
      // The strongest suppression probe: with no consumer style in the merge
      // (Tokenizer's insets-only shape reduces to this in jsdom), nothing can
      // clobber a leaked derived value — any position-area or try-fallbacks
      // in the output is a genuine leak.
      const style = await openAndGetStyle(
        <CustomHarness renderProps={{positioning: 'custom'}} />,
      );
      expect(style).toContain('position-anchor');
      expect(style).not.toContain('position-area');
      expect(style).not.toContain('position-try-fallbacks');
    });
  });

  describe('offset', () => {
    function OffsetHarness({
      placement,
      offset,
      positioning,
    }: {
      placement?: LayerPlacement;
      offset?: number | string;
      positioning?: 'anchor' | 'custom';
    }) {
      const layer = useLayer({mode: 'context'});
      return (
        <>
          <button type="button" ref={layer.ref} onClick={layer.show}>
            trigger
          </button>
          {layer.render(<span>content</span>, {
            placement,
            offset,
            positioning,
          })}
        </>
      );
    }

    // Debug-mode StyleX variable names for the dynamic offset style, as in
    // Grid.test.tsx. jsdom resolves neither the var indirection nor logical
    // margin properties, so the declarations themselves are the assertion.
    async function openAndGetOffsets(ui: React.ReactElement) {
      const user = userEvent.setup();
      const {container, getByRole} = render(ui);
      await user.click(getByRole('button', {name: 'trigger'}));
      const el = container.querySelector('[popover]') as HTMLElement;
      const read = (prop: string) => el.style.getPropertyValue(`--x-${prop}`);
      return {
        blockStart: read('marginBlockStart'),
        blockEnd: read('marginBlockEnd'),
        inlineStart: read('marginInlineStart'),
        inlineEnd: read('marginInlineEnd'),
      };
    }

    const NONE = {blockStart: '', blockEnd: '', inlineStart: '', inlineEnd: ''};

    // The clearance rides the anchor-facing edge of the placement axis; the
    // far edge carries the static viewport gutter (spec:AST-059 FR1), which is
    // a class, not a dynamic variable, so it does not appear here.
    it('is flush against the anchor by default', async () => {
      expect(
        await openAndGetOffsets(<OffsetHarness placement="below" />),
      ).toEqual(NONE);
    });

    // The flip tactic swaps the two block margins with the area, so the gap
    // survives a position-try-fallbacks flip to the opposite side (#4803).
    it('clears the anchor-facing block edge for a block placement', async () => {
      expect(
        await openAndGetOffsets(<OffsetHarness placement="above" offset={8} />),
      ).toEqual({...NONE, blockEnd: '8px'});
    });

    it('clears the opposite block edge when placed below', async () => {
      expect(
        await openAndGetOffsets(<OffsetHarness placement="below" offset={8} />),
      ).toEqual({...NONE, blockStart: '8px'});
    });

    it('clears the anchor-facing inline edge for an inline placement', async () => {
      expect(
        await openAndGetOffsets(<OffsetHarness placement="end" offset={8} />),
      ).toEqual({...NONE, inlineStart: '8px'});
    });

    it('takes a CSS length string', async () => {
      expect(
        await openAndGetOffsets(
          <OffsetHarness placement="below" offset="var(--spacing-1)" />,
        ),
      ).toEqual({...NONE, blockStart: 'var(--spacing-1)'});
    });

    it('puts the viewport gutter on the far edge of the placement axis (FR1, FR6)', async () => {
      const user = userEvent.setup();
      const {container, getByRole} = render(
        <OffsetHarness placement="below" offset={8} />,
      );
      await user.click(getByRole('button', {name: 'trigger'}));
      const el = container.querySelector('[popover]') as HTMLElement;
      expect(el.className).toContain('useLayer__styles.placementBelow');
      expect(el.className).not.toContain('useLayer__styles.placementAbove');
    });

    it('is ignored under custom positioning, which owns its own insets', async () => {
      expect(
        await openAndGetOffsets(
          <OffsetHarness placement="below" offset={8} positioning="custom" />,
        ),
      ).toEqual(NONE);
    });
  });

  it('fixed mode emits no anchor-positioning styles', async () => {
    function FixedHarness() {
      const layer = useLayer({mode: 'fixed'});
      return (
        <>
          <button type="button" onClick={layer.show}>
            opener
          </button>
          {layer.render(<span>content</span>, {x: 10, y: 20})}
        </>
      );
    }

    const user = userEvent.setup();
    const {container, getByRole} = render(<FixedHarness />);
    await user.click(getByRole('button', {name: 'opener'}));

    const style =
      container.querySelector('[popover]')?.getAttribute('style') ?? '';
    expect(style).not.toContain('position-area');
    expect(style).not.toContain('position-anchor');
  });
});

describe('useLayer public return types', () => {
  it('keeps dismissal helpers internal', () => {
    const contextHasKeepOpenProps: 'keepOpenProps' extends keyof ContextLayerReturn
      ? true
      : false = false;
    const fixedHasKeepOpenProps: 'keepOpenProps' extends keyof FixedLayerReturn
      ? true
      : false = false;
    const contextHasGuard: 'wasJustDismissed' extends keyof ContextLayerReturn
      ? true
      : false = false;
    const fixedHasGuard: 'wasJustDismissed' extends keyof FixedLayerReturn
      ? true
      : false = false;

    expect(contextHasKeepOpenProps).toBe(false);
    expect(fixedHasKeepOpenProps).toBe(false);
    expect(contextHasGuard).toBe(false);
    expect(fixedHasGuard).toBe(false);
  });
});

describe('internal keep-open props (controls on the trigger, #5004)', () => {
  function ClearableTriggerHarness() {
    const layer = useLayer({mode: 'context'});
    const keepOpenProps = useKeepLayerOpenProps(layer.id, layer.isOpen);
    return (
      <>
        <button type="button" ref={layer.ref} onClick={layer.show}>
          Trigger
        </button>
        <button type="button" {...keepOpenProps}>
          Clear
        </button>
        {layer.render(<span>Layer content</span>, {placement: 'below'})}
      </>
    );
  }

  it('names the control an invoker for the duration of the press', async () => {
    const user = userEvent.setup();
    const {container, getByRole} = render(<ClearableTriggerHarness />);
    const clear = getByRole('button', {name: 'Clear'});

    await user.click(getByRole('button', {name: 'Trigger'}));
    const popover = container.querySelector('[popover]') as HTMLElement;

    await user.pointer({keys: '[MouseLeft>]', target: clear});
    expect(clear.getAttribute('popovertarget')).toBe(popover.id);

    await user.pointer({keys: '[/MouseLeft]', target: clear});
    expect(clear).not.toHaveAttribute('popovertarget');
  });

  it('takes the invoker off when the press ends in pointercancel', async () => {
    const user = userEvent.setup();
    const {container, getByRole} = render(<ClearableTriggerHarness />);
    const clear = getByRole('button', {name: 'Clear'});

    await user.click(getByRole('button', {name: 'Trigger'}));
    const popover = container.querySelector('[popover]') as HTMLElement;

    await user.pointer({keys: '[MouseLeft>]', target: clear});
    expect(clear.getAttribute('popovertarget')).toBe(popover.id);

    // A touch the browser claims — for a scroll, for the platform's long-press
    // menu — ends here, and no pointerup ever arrives.
    await act(async () => {
      document.dispatchEvent(new Event('pointercancel'));
      await new Promise(resolve => {
        window.setTimeout(resolve, 0);
      });
    });

    expect(clear).not.toHaveAttribute('popovertarget');
  });

  it('leaves the control alone while the layer is closed', async () => {
    const user = userEvent.setup();
    const {getByRole} = render(<ClearableTriggerHarness />);
    const clear = getByRole('button', {name: 'Clear'});

    await user.click(clear);

    expect(clear).not.toHaveAttribute('popovertarget');
  });

  it("cancels the invoker's own toggle so the press cannot close the layer", async () => {
    const user = userEvent.setup();
    const {container, getByRole} = render(<ClearableTriggerHarness />);
    await user.click(getByRole('button', {name: 'Trigger'}));
    const popover = container.querySelector('[popover]') as HTMLElement;
    const clear = getByRole('button', {name: 'Clear'});

    const click = new MouseEvent('click', {bubbles: true, cancelable: true});
    await act(async () => {
      clear.setAttribute('popovertarget', popover.id);
      clear.dispatchEvent(click);
    });

    expect(click.defaultPrevented).toBe(true);
    expect(clear).not.toHaveAttribute('popovertarget');
  });
});

describe('wasJustDismissed (light dismiss vs. the trigger click, #5004)', () => {
  function GuardedTriggerHarness() {
    const layer = useLayerInternal({mode: 'context'});
    return (
      <>
        <button
          type="button"
          ref={layer.ref}
          onClick={() => {
            if (layer.wasJustDismissed()) {
              return;
            }
            if (layer.isOpen) {
              layer.hide();
            } else {
              layer.show();
            }
          }}>
          Trigger
        </button>
        <span data-testid="state">{layer.isOpen ? 'open' : 'closed'}</span>
        {layer.render(<span>Layer content</span>, {placement: 'below'})}
      </>
    );
  }

  /**
   * The browser closing the layer itself: it hides the element and queues a
   * `toggle` event, which is what reaches React — before the click, on the
   * engines that lose the race.
   */
  function lightDismiss(container: HTMLElement) {
    const popover = container.querySelector('[popover]') as HTMLElement;
    act(() => {
      popover.dispatchEvent(
        Object.assign(new Event('toggle'), {
          oldState: 'open',
          newState: 'closed',
        }),
      );
    });
  }

  it('absorbs the trigger click that follows a light dismiss', async () => {
    const user = userEvent.setup();
    const {container, getByRole, getByTestId} = render(
      <GuardedTriggerHarness />,
    );
    const trigger = getByRole('button', {name: 'Trigger'});

    await user.click(trigger);
    expect(getByTestId('state')).toHaveTextContent('open');

    // The next press reaches the browser dismissal before its click.
    fireEvent.pointerDown(trigger);
    lightDismiss(container);
    fireEvent.click(trigger);

    expect(getByTestId('state')).toHaveTextContent('closed');
  });

  it('acts on a deliberate second press', async () => {
    const user = userEvent.setup();
    const {container, getByRole, getByTestId} = render(
      <GuardedTriggerHarness />,
    );
    const trigger = getByRole('button', {name: 'Trigger'});

    await user.click(trigger);
    fireEvent.pointerDown(trigger);
    lightDismiss(container);
    fireEvent.click(trigger);
    // A press of its own — a new gesture, however soon it lands.
    await user.click(trigger);

    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('leaves a programmatic hide unguarded', async () => {
    const user = userEvent.setup();
    const {getByRole, getByTestId} = render(<GuardedTriggerHarness />);
    const trigger = getByRole('button', {name: 'Trigger'});

    // Three presses with no browser-initiated close between them.
    await user.click(trigger);
    await user.click(trigger);
    await user.click(trigger);

    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('acts on a synthesized click after a stopped click-first dismissal', async () => {
    const user = userEvent.setup();
    const {container, getByRole, getByTestId} = render(
      <GuardedTriggerHarness />,
    );
    const trigger = getByRole('button', {name: 'Trigger'});

    await user.click(trigger);
    fireEvent.pointerDown(document.body);
    document.body.addEventListener('click', event => event.stopPropagation(), {
      once: true,
    });
    fireEvent.click(document.body);
    lightDismiss(container);
    expect(getByTestId('state')).toHaveTextContent('closed');

    // Chromium delivers the dismissing click before the queued toggle. A later
    // bare click is a new activation even though it has no pointerdown.
    act(() => {
      trigger.click();
    });

    expect(getByTestId('state')).toHaveTextContent('open');
  });

  /** A trigger that calls show()/hide() directly, checking nothing. */
  function PlainTriggerHarness() {
    const layer = useLayerInternal({mode: 'context'});
    return (
      <>
        <button
          type="button"
          ref={layer.ref}
          onClick={() => (layer.isOpen ? layer.hide() : layer.show())}>
          Trigger
        </button>
        <span data-testid="state">{layer.isOpen ? 'open' : 'closed'}</span>
        {layer.render(<span>Layer content</span>, {placement: 'below'})}
      </>
    );
  }

  it('absorbs the click for a trigger that never calls wasJustDismissed', async () => {
    const user = userEvent.setup();
    const {container, getByRole, getByTestId} = render(<PlainTriggerHarness />);
    const trigger = getByRole('button', {name: 'Trigger'});

    await user.click(trigger);
    expect(getByTestId('state')).toHaveTextContent('open');

    fireEvent.pointerDown(trigger);
    lightDismiss(container);
    fireEvent.click(trigger);

    expect(getByTestId('state')).toHaveTextContent('closed');
  });
});

describe('a light-dismiss layer opened by a context-menu press', () => {
  function ContextOpenedHarness({lightDismiss}: {lightDismiss: boolean}) {
    const layer = useLayerInternal({mode: 'context', lightDismiss});
    return (
      <>
        <div
          data-testid="zone"
          ref={layer.ref}
          onContextMenu={event => {
            event.preventDefault();
            layer.show();
          }}
        />
        {layer.render(<span>Menu</span>, {placement: 'below'})}
      </>
    );
  }

  /** A press of `pointerId` on `target`, which jsdom's events do not carry. */
  function pressDown(target: Element, pointerId: number) {
    fireEvent(
      target,
      Object.assign(new MouseEvent('pointerdown', {bubbles: true, button: 2}), {
        pointerId,
      }),
    );
  }

  let captured: {element: Element; pointerId: number}[] = [];
  beforeEach(() => {
    captured = [];
    HTMLElement.prototype.setPointerCapture = function (pointerId: number) {
      captured.push({element: this, pointerId});
    };
  });
  afterEach(() => {
    // The press ends, so no claim outlives its test.
    fireEvent(
      document,
      Object.assign(new MouseEvent('pointerup', {bubbles: true}), {
        pointerId: 7,
      }),
    );
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  });

  it('captures the opening press, so its release lands on the layer and cannot dismiss it', () => {
    const {container, getByTestId} = render(
      <ContextOpenedHarness lightDismiss />,
    );
    const zone = getByTestId('zone');
    pressDown(zone, 7);
    fireEvent.contextMenu(zone);
    expect(captured).toEqual([
      {element: container.querySelector('[popover]'), pointerId: 7},
    ]);
  });

  it('lets the capture go while the pointer is over the layer, and takes it again outside', () => {
    const released: number[] = [];
    HTMLElement.prototype.hasPointerCapture = () => true;
    HTMLElement.prototype.releasePointerCapture = (pointerId: number) => {
      released.push(pointerId);
    };
    const {container, getByTestId} = render(
      <ContextOpenedHarness lightDismiss />,
    );
    const zone = getByTestId('zone');
    pressDown(zone, 7);
    fireEvent.contextMenu(zone);
    const layer = container.querySelector('[popover]') as HTMLElement;
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 100, 100, 100),
    );
    let at = {x: 150, y: 150};
    const move = (pointerId: number) =>
      fireEvent(
        layer,
        Object.assign(
          new MouseEvent('pointermove', {
            bubbles: true,
            clientX: at.x,
            clientY: at.y,
          }),
          {pointerId},
        ),
      );

    move(7);
    expect(released).toEqual([7]);
    at = {x: 20, y: 20};
    move(7);
    expect(captured).toHaveLength(2);
    // Another pointer's move leaves the claim alone.
    move(8);
    expect(captured).toHaveLength(2);

    // The release ends the claim: later moves capture nothing.
    fireEvent(
      zone,
      Object.assign(new MouseEvent('pointerup', {bubbles: true}), {
        pointerId: 7,
      }),
    );
    move(7);
    expect(captured).toHaveLength(2);
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>)
      .releasePointerCapture;
  });

  it('captures nothing for a context menu from the keyboard, which has no press', () => {
    const {getByTestId} = render(<ContextOpenedHarness lightDismiss />);
    const zone = getByTestId('zone');
    pressDown(zone, 7);
    fireEvent.pointerUp(zone);
    fireEvent.keyDown(zone, {key: 'F10', shiftKey: true});
    fireEvent.contextMenu(zone);
    expect(captured).toEqual([]);
  });

  it('captures nothing for a layer without light dismiss', () => {
    const {getByTestId} = render(<ContextOpenedHarness lightDismiss={false} />);
    const zone = getByTestId('zone');
    pressDown(zone, 7);
    fireEvent.contextMenu(zone);
    expect(captured).toEqual([]);
  });
});

describe('a layer that keeps its anchor clear (spec:AST-059 FR4)', () => {
  function ClearHarness({placement}: {placement?: LayerPlacement}) {
    const layer = useLayerInternal({mode: 'context', keepsAnchorClear: true});
    return (
      <>
        <button type="button" ref={layer.ref} onClick={layer.show}>
          Trigger
        </button>
        <button type="button" onClick={layer.hide}>
          Hide
        </button>
        {layer.render(<span>Layer content</span>, {placement})}
      </>
    );
  }

  function rect(top: number, left: number, height: number, width: number) {
    return {
      top,
      left,
      height,
      width,
      bottom: top + height,
      right: left + width,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /** Lay out the trigger and the layer at the given boxes. */
  function placeBoxes(trigger: DOMRect, layer: DOMRect) {
    return vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('popover') ? layer : trigger;
      });
  }

  const TRIGGER = rect(300, 400, 30, 100);

  /** Let the next animation frame run, as the browser does before it paints. */
  async function nextFrame() {
    await act(
      async () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve());
        }),
    );
  }

  /** Give the document a 720px-tall viewport for the duration of a test. */
  function viewport720() {
    return vi
      .spyOn(document.documentElement, 'clientHeight', 'get')
      .mockReturnValue(720);
  }

  /**
   * How many times a layer was placed afresh since the last clear: the
   * runtime keeps every animation through `preserveAnimations` only then.
   */
  const placedAfresh = () => vi.mocked(preserveAnimations).mock.calls.length;

  beforeEach(() => {
    vi.mocked(preserveAnimations).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the other block side at its own size, then beside the trigger, and only then each block side sized to its room', () => {
    expect(getAnchorClearFallbacks('above')).toBe(
      'flip-block, --astryx-layer-beside-end, --astryx-layer-beside-start, --astryx-layer-fit-above, --astryx-layer-fit-below',
    );
    expect(getAnchorClearFallbacks('below')).toBe(
      'flip-block, --astryx-layer-beside-end, --astryx-layer-beside-start, --astryx-layer-fit-below, --astryx-layer-fit-above',
    );
    // Side placements already slide along the block axis at full height.
    expect(getAnchorClearFallbacks('start')).toBe('');
    expect(getAnchorClearFallbacks('end')).toBe('');
    // Chromium tries no more than five options.
    for (const placement of ['above', 'below'] as const) {
      expect(
        getAnchorClearFallbacks(placement).split(', ').length,
      ).toBeLessThanOrEqual(5);
    }
  });

  it('installs the beside and fit rules, each aligned unsafe toward the anchor', async () => {
    const user = userEvent.setup();
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    const css =
      document.getElementById('astryx-layer-slide-rules')?.textContent ?? '';
    // Beside: an inline side spanning the block axis, at the content's own
    // inline size so a content-sized layer cannot squeeze into a sliver.
    expect(css).toContain(
      '@position-try --astryx-layer-beside-end{position-area:self-inline-end span-all;margin-inline-start:var(--_astryx-layer-clearance, 0px);',
    );
    expect(css).toMatch(
      /@position-try --astryx-layer-beside-start\{[^}]*inline-size:max-content;/,
    );
    // Fit: sized to the room on its side and never less than half of the
    // room the trigger leaves on the block axis, so it fits only on the
    // roomier side. No option is sized to whatever room is left: a browser
    // keeps an open layer on its last option while that still fits.
    for (const [side, area] of [
      ['above', 'self-block-start'],
      ['below', 'self-block-end'],
    ]) {
      expect(css).toMatch(
        new RegExp(
          `@position-try --astryx-layer-fit-${side}\\{position-area:${area} span-all;[^}]*block-size:max\\(calc\\(100% - [^}]*anchor-size\\(block\\)[^}]*100dvb`,
        ),
      );
    }
    expect(css).not.toMatch(/--astryx-layer-fit-[a-z]+-roomier/);
    expect(css.match(/@position-try --astryx-layer-fit-/g)).toHaveLength(2);
    // Every option aligns unsafe toward the anchor on the placement axis, so
    // a box that runs out of room overflows away from the anchor.
    expect(css).toMatch(
      /@position-try --astryx-layer-beside-end\{[^}]*align-self:normal;justify-self:unsafe self-start;\}/,
    );
    expect(css).toMatch(
      /@position-try --astryx-layer-beside-start\{[^}]*justify-self:unsafe self-end;\}/,
    );
    expect(css).toMatch(
      /@position-try --astryx-layer-fit-above\{[^}]*align-self:unsafe self-end;\}/,
    );
    expect(css).toMatch(
      /@position-try --astryx-layer-fit-below\{[^}]*align-self:unsafe self-start;\}/,
    );
    // One list: no switch to a second one.
    expect(css).not.toContain('clears-anchor');
  });

  it('uses its one combined list from the start, aligned unsafe toward its trigger', async () => {
    const user = userEvent.setup();
    const {container, rerender} = render(<ClearHarness placement="below" />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl.style.positionTryFallbacks).toBe(
      getAnchorClearFallbacks('below'),
    );
    expect(layerEl.style.alignSelf).toBe('unsafe self-start');
    rerender(<ClearHarness placement="above" />);
    expect(layerEl.style.positionTryFallbacks).toBe(
      getAnchorClearFallbacks('above'),
    );
    expect(layerEl.style.alignSelf).toBe('unsafe self-end');
    // A side placement keeps the standard list.
    rerender(<ClearHarness placement="end" />);
    expect(layerEl.style.positionTryFallbacks).toBe(
      getPositionTryFallbacks('end', 'center'),
    );
    expect(layerEl.style.alignSelf).toBe('');
  });

  it('places the shown layer afresh from its list when it covers its trigger', async () => {
    const user = userEvent.setup();
    placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    expect(placedAfresh()).toBeGreaterThan(0);
  });

  it('places a layer afresh without closing it or leaving a frame', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const displays: string[] = [];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute('popover')) {
          displays.push(this.style.display);
          return rect(16, 350, 688, 300);
        }
        return TRIGGER;
      },
    );
    const {container} = render(<ClearHarness />);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    layerEl.addEventListener('toggle', onToggle);
    layerEl.addEventListener('beforetoggle', onToggle);
    await user.click(container.querySelector('button')!);
    expect(placedAfresh()).toBeGreaterThan(0);
    // A browser keeps a laid-out layer on its last option until the layer
    // stops being rendered: the runtime takes it out of rendering for one
    // forced layout, then restores its own display, in the same task.
    expect(displays).toContain('none');
    expect(layerEl.style.display).not.toBe('none');
    // Only the show itself opened it; the re-placement neither closed nor
    // re-opened it.
    expect(
      onToggle.mock.calls.map(([e]) => (e as ToggleEvent).newState),
    ).not.toContain('closed');
    // A later read that finds it failing again places it afresh again; one
    // that finds it clear leaves it alone.
    displays.length = 0;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(displays).toContain('none');
    vi.restoreAllMocks();
    placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const spy = vi.spyOn(layerEl.style, 'display', 'set');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('places the shown layer afresh when it leaves the viewport on the block axis while its trigger is in view', async () => {
    const user = userEvent.setup();
    // Above the trigger, clear of it, but its top past the viewport: where
    // WebKit leaves a box that fits no option.
    viewport720();
    placeBoxes(TRIGGER, rect(-348, 350, 640, 300));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    expect(placedAfresh()).toBeGreaterThan(0);
  });

  it('leaves a layer past the viewport alone while its trigger is out of view too', async () => {
    const user = userEvent.setup();
    // The trigger is above the viewport: the layer holds (FR5).
    viewport720();
    placeBoxes(rect(-80, 400, 30, 100), rect(-200, 350, 100, 200));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    expect(placedAfresh()).toBe(0);
  });

  it('does not read on scroll events, when the layer has not followed its anchor yet', async () => {
    const user = userEvent.setup();
    viewport720();
    const spy = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    // Mid-scroll: the trigger has moved under the layer's stale box, which
    // reads as covering it and past the viewport. A scroll is checked only
    // after it stops.
    spy.mockRestore();
    placeBoxes(rect(-40, 380, 30, 100), rect(-60, 350, 100, 200));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('scroll'));
    });
    expect(placedAfresh()).toBe(0);
  });

  /** Let the task queued after a frame's paint run, then the next frame. */
  async function afterNextPaint() {
    await nextFrame();
    await act(
      async () =>
        new Promise<void>(resolve => {
          setTimeout(resolve);
        }),
    );
    await nextFrame();
  }

  async function wait(ms: number) {
    await act(
      async () =>
        new Promise<void>(resolve => {
          setTimeout(resolve, ms);
        }),
    );
  }

  it('checks the box once, in the first frame painted after a scroll of its trigger ends, with no read in the scroll handler', async () => {
    const view = window as {onscrollend?: unknown};
    view.onscrollend = null;
    try {
      const user = userEvent.setup();
      viewport720();
      const shown = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
      const {container} = render(<ClearHarness />);
      await user.click(container.querySelector('button')!);
      shown.mockRestore();
      // The scroll carried the trigger to the top: the layer above it now
      // runs past the viewport.
      const reads = placeBoxes(rect(12, 380, 30, 100), rect(-40, 350, 48, 200));
      vi.mocked(preserveAnimations).mockClear();
      // A scroll that does not carry the trigger is not its scroll.
      const other = document.createElement('div');
      document.body.append(other);
      act(() => {
        other.dispatchEvent(new Event('scrollend'));
      });
      await afterNextPaint();
      expect(placedAfresh()).toBe(0);
      reads.mockClear();
      act(() => {
        document.dispatchEvent(new Event('scrollend'));
      });
      expect(reads).not.toHaveBeenCalled();
      await nextFrame();
      expect(placedAfresh()).toBe(0);
      await afterNextPaint();
      expect(placedAfresh()).toBe(1);
      other.remove();
    } finally {
      delete view.onscrollend;
    }
  });

  it('cancels the check when a scroll of its trigger starts again before it, where the browser fires scrollend', async () => {
    const view = window as {onscrollend?: unknown};
    view.onscrollend = null;
    try {
      const user = userEvent.setup();
      viewport720();
      const shown = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
      const {container} = render(<ClearHarness />);
      await user.click(container.querySelector('button')!);
      shown.mockRestore();
      placeBoxes(rect(12, 380, 30, 100), rect(-40, 350, 48, 200));
      vi.mocked(preserveAnimations).mockClear();
      act(() => {
        document.dispatchEvent(new Event('scrollend'));
      });
      await nextFrame();
      act(() => {
        document.dispatchEvent(new Event('scroll'));
      });
      await afterNextPaint();
      expect(placedAfresh()).toBe(0);
    } finally {
      delete view.onscrollend;
    }
  });

  it('hears a scroll that stops inside a shadow root above its trigger', async () => {
    const view = window as {onscrollend?: unknown};
    view.onscrollend = null;
    const host = document.createElement('div');
    document.body.append(host);
    const shadowRoot = host.attachShadow({mode: 'open'});
    const scroller = document.createElement('div');
    shadowRoot.append(scroller);
    try {
      const user = userEvent.setup();
      viewport720();
      const shown = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
      render(<ClearHarness />, {container: scroller});
      await user.click(scroller.querySelector('button')!);
      shown.mockRestore();
      placeBoxes(rect(12, 380, 30, 100), rect(-40, 350, 48, 200));
      vi.mocked(preserveAnimations).mockClear();
      // Not composed: the event stops at the shadow root.
      act(() => {
        scroller.dispatchEvent(new Event('scrollend'));
      });
      await afterNextPaint();
      expect(placedAfresh()).toBe(1);
    } finally {
      delete view.onscrollend;
      host.remove();
    }
  });

  it('checks the box once, 150 ms after the last scroll of its trigger, where the browser fires no scrollend', async () => {
    expect('onscrollend' in window).toBe(false);
    const user = userEvent.setup();
    viewport720();
    const shown = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    shown.mockRestore();
    const reads = placeBoxes(rect(12, 380, 30, 100), rect(-40, 350, 48, 200));
    vi.mocked(preserveAnimations).mockClear();
    reads.mockClear();
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
    await wait(100);
    // Still scrolling: each scroll event starts the wait again.
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
    await wait(100);
    expect(reads).not.toHaveBeenCalled();
    expect(placedAfresh()).toBe(0);
    await wait(80);
    await afterNextPaint();
    expect(placedAfresh()).toBe(1);
  });

  it('leaves the shown layer alone when it sits clear of its trigger, even flush against it', async () => {
    const user = userEvent.setup();
    // Directly above the trigger, its bottom edge on the trigger's top edge.
    placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    expect(placedAfresh()).toBe(0);
  });

  it('judges every show afresh', async () => {
    const user = userEvent.setup();
    const spy = placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    const {getByText} = render(<ClearHarness />);
    await user.click(getByText('Trigger'));
    expect(placedAfresh()).toBeGreaterThan(0);

    await user.click(getByText('Hide'));
    spy.mockRestore();
    placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    vi.mocked(preserveAnimations).mockClear();
    await user.click(getByText('Trigger'));
    expect(placedAfresh()).toBe(0);
  });

  it('scrolls once its content overflows, by CSS alone, with no read of its scroll size', async () => {
    const user = userEvent.setup();
    placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const scrollSizeReads = vi.spyOn(
      HTMLElement.prototype,
      'scrollHeight',
      'get',
    );
    const {container, getByText} = render(<ClearHarness />);
    await user.click(getByText('Trigger'));
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl.className).toContain('useLayer__styles.scrollsOnOverflow');
    expect(scrollSizeReads).not.toHaveBeenCalled();
    const css =
      document.getElementById('astryx-layer-slide-rules')?.textContent ?? '';
    expect(css).not.toContain('overscroll-behavior');
  });

  it('re-reads its geometry while open when it or its content resizes', async () => {
    const callbacks: (() => void)[] = [];
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe(target: Element) {
          observed.push(target);
        }
        disconnect() {}
        unobserve() {}
      },
    );
    const user = userEvent.setup();
    const spy = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {container, getByText} = render(<ClearHarness />);
    await user.click(getByText('Trigger'));
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(placedAfresh()).toBe(0);
    expect(observed).toContain(layerEl);
    expect(observed).toContain(layerEl.firstElementChild);
    expect(observed).toContain(getByText('Trigger'));

    // The content grows and the standard list re-settles over the trigger.
    spy.mockRestore();
    placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    act(() => {
      for (const callback of callbacks) {
        callback();
      }
    });
    expect(placedAfresh()).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('moves its open-state observers to a trigger the caller replaces while it is open', async () => {
    const observed: Element[] = [];
    const disconnected: Element[][] = [];
    const events: string[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        targets: Element[] = [];
        observe(target: Element) {
          this.targets.push(target);
          observed.push(target);
          events.push(`observe ${target.textContent}`);
        }
        disconnect() {
          disconnected.push(this.targets);
          events.push(
            `disconnect ${this.targets.map(t => t.textContent).join(',')}`,
          );
        }
        unobserve() {}
      },
    );
    let renders = 0;
    function ReplacingHarness({generation}: {generation: number}) {
      renders += 1;
      const layer = useLayerInternal({
        mode: 'context',
        keepsAnchorClear: true,
      });
      useEffect(() => {
        layer.show();
      }, [layer]);
      return (
        <>
          <button type="button" key={generation} ref={layer.ref}>
            {`Trigger ${generation}`}
          </button>
          {layer.render(<span>Layer content</span>)}
        </>
      );
    }
    placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {getByText, rerender} = render(<ReplacingHarness generation={1} />);
    await waitFor(() => {
      expect(observed).toContain(getByText('Trigger 1'));
    });
    const first = getByText('Trigger 1');
    const rendersBefore = renders;

    rerender(<ReplacingHarness generation={2} />);

    await waitFor(() => {
      expect(observed).toContain(getByText('Trigger 2'));
    });
    // The observer that watched the first trigger was disconnected, before
    // the second trigger was observed.
    expect(disconnected.some(targets => targets.includes(first))).toBe(true);
    const disconnectFirst = events.findIndex(
      e => e.startsWith('disconnect') && e.includes('Trigger 1'),
    );
    const observeSecond = events.indexOf('observe Trigger 2');
    expect(disconnectFirst).toBeGreaterThanOrEqual(0);
    expect(disconnectFirst).toBeLessThan(observeSecond);
    // No DOM node is held in React state: replacing the trigger renders the
    // hook once, for the caller's own rerender.
    expect(renders - rendersBefore).toBe(1);
    vi.unstubAllGlobals();
  });

  it('gives a layer remounted while open by a moved render call the same treatment', async () => {
    function MovingClearHarness({unsafe}: {unsafe: boolean}) {
      const layer = useLayerInternal({
        mode: 'context',
        keepsAnchorClear: true,
      });
      const rendered = layer.render(<span>Layer content</span>);
      return (
        <>
          <button type="button" ref={layer.ref} onClick={layer.show}>
            Trigger
          </button>
          {unsafe ? (
            <div data-testid="unsafe-host">
              <p>{rendered}</p>
            </div>
          ) : (
            <section data-testid="safe-host">{rendered}</section>
          )}
        </>
      );
    }
    const showSpy = vi.fn(function (this: HTMLElement) {
      this.dataset.open = 'true';
    });
    HTMLElement.prototype.showPopover = showSpy;
    placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    const {container, getByRole, rerender} = render(
      <MovingClearHarness unsafe />,
    );
    fireEvent.click(getByRole('button', {name: 'Trigger'}));
    await waitFor(() => {
      expect(placedAfresh()).toBeGreaterThan(0);
    });
    const first = container.querySelector('[popover]');

    vi.mocked(preserveAnimations).mockClear();
    rerender(<MovingClearHarness unsafe={false} />);

    await waitFor(() => {
      const layer = container.querySelector('[popover]');
      expect(layer).not.toBe(first);
      expect(layer?.parentElement).toBe(
        container.querySelector('[data-testid="safe-host"]'),
      );
      expect(layer).toHaveAttribute('data-open', 'true');
      expect(placedAfresh()).toBeGreaterThan(0);
    });
  });

  it('leaves a standard layer on the standard list alone', async () => {
    const user = userEvent.setup();
    placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    const {container} = render(<ContextLayerHarness />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(placedAfresh()).toBe(0);
    expect(layerEl.style.positionTryFallbacks).toBe(
      getPositionTryFallbacks('above', 'center'),
    );
    expect(layerEl.style.alignSelf).toBe('');
    expect(layerEl.className).not.toContain(
      'useLayer__styles.scrollsOnOverflow',
    );
  });
});

describe('contextRef anchor-name churn (#5398)', () => {
  // Both candidate trigger elements always mount; only which one currently
  // receives `layer.ref` changes, so switching `refTarget` makes React call
  // the outgoing element's ref with `null` and the incoming one's ref with
  // itself in the same commit — the exact churn shape a combined ref utility
  // (e.g. Tooltip's) produces.
  // A trigger is an anchor only while its layer is shown, so each case opens
  // the layer first.
  function ChurnHarness({
    refTarget,
    onReady,
    onShow,
  }: {
    refTarget: 'x' | 'y' | 'none';
    onReady?: (anchorId: string) => void;
    onShow?: (show: () => void) => void;
  }) {
    const layer = useLayerInternal({mode: 'context'});
    onReady?.(layer.anchorId);
    onShow?.(layer.show);
    return (
      <>
        <button
          type="button"
          data-testid="x"
          ref={refTarget === 'x' ? layer.ref : undefined}>
          X
        </button>
        <button
          type="button"
          data-testid="y"
          ref={refTarget === 'y' ? layer.ref : undefined}>
          Y
        </button>
        {layer.render(<span>Layer content</span>)}
      </>
    );
  }

  function anchorNamesOf(el: HTMLElement): string[] {
    return el.style.anchorName
      .split(',')
      .map(name => name.trim())
      .filter(Boolean);
  }

  it('keeps the anchor name through a transient null-then-same-element reattach', () => {
    let anchorId = '';
    let show = () => {};
    const {getByTestId, rerender} = render(
      <ChurnHarness
        refTarget="x"
        onReady={id => (anchorId = id)}
        onShow={s => (show = s)}
      />,
    );
    const x = getByTestId('x');
    act(() => show());
    expect(anchorNamesOf(x)).toContain(anchorId);
    // Records every write to the trigger's style: a removal and re-add of
    // the name ends in the same state, so only the writes tell them apart.
    const styleWrites = new MutationObserver(() => {});
    styleWrites.observe(x, {attributes: true, attributeFilter: ['style']});

    // No await between these two: the churn (null, then the same element
    // again) happens within one synchronous stretch, before the pending
    // removal's microtask ever gets a chance to run.
    rerender(<ChurnHarness refTarget="none" onReady={id => (anchorId = id)} />);
    rerender(<ChurnHarness refTarget="x" onReady={id => (anchorId = id)} />);

    expect(anchorNamesOf(x)).toContain(anchorId);
    expect(styleWrites.takeRecords()).toEqual([]);
    styleWrites.disconnect();
  });

  it('removes the old element and adds the new one when a different element takes over the ref', () => {
    let anchorId = '';
    let show = () => {};
    const {getByTestId, rerender} = render(
      <ChurnHarness
        refTarget="x"
        onReady={id => (anchorId = id)}
        onShow={s => (show = s)}
      />,
    );
    const x = getByTestId('x');
    const y = getByTestId('y');
    act(() => show());
    expect(anchorNamesOf(x)).toContain(anchorId);
    expect(anchorNamesOf(y)).not.toContain(anchorId);

    rerender(<ChurnHarness refTarget="y" onReady={id => (anchorId = id)} />);

    expect(anchorNamesOf(x)).not.toContain(anchorId);
    expect(anchorNamesOf(y)).toContain(anchorId);
  });

  it('removes the anchor name once a persistent (still-mounted) anchor genuinely lets go of the ref', async () => {
    let anchorId = '';
    let show = () => {};
    const {getByTestId, rerender} = render(
      <ChurnHarness
        refTarget="x"
        onReady={id => (anchorId = id)}
        onShow={s => (show = s)}
      />,
    );
    const x = getByTestId('x');
    act(() => show());
    expect(anchorNamesOf(x)).toContain(anchorId);

    // `x` stays mounted — only the ref moves off it, nothing reattaches.
    await act(async () => {
      rerender(
        <ChurnHarness refTarget="none" onReady={id => (anchorId = id)} />,
      );
      // Let the deferred-removal microtask actually run.
      await Promise.resolve();
    });

    expect(anchorNamesOf(x)).not.toContain(anchorId);
  });
});

describe('show() anchor readiness (#5398)', () => {
  // jsdom reports every box as 0x0 and has no layout engine, so each piece of
  // one is stubbed: per-element boxes, a manual frame queue, a ResizeObserver
  // the test can watch, and the Web Animations API whose presence marks a real
  // layout environment.
  const boxes = new WeakMap<Element, {width: number; height: number}>();
  // Elements that render an empty box: one client rect of 0x0, as an empty
  // inline `<span>` has, unlike `display: none`, which has none.
  const emptyBoxes = new WeakSet<Element>();
  let frames: (FrameRequestCallback | null)[] = [];
  let observers: {disconnected: boolean}[] = [];
  let intersections: {disconnected: boolean; callback: () => void}[] = [];
  let animations: unknown[] = [];

  const originalRect = Element.prototype.getBoundingClientRect;
  const originalClientRects = Element.prototype.getClientRects;

  class FakeKeyframeEffect {
    constructor(public target: Element) {}
    getComputedTiming() {
      return {iterations: 1, endTime: 300};
    }
  }

  beforeEach(() => {
    frames = [];
    observers = [];
    intersections = [];
    animations = [];
    vi.stubGlobal('KeyframeEffect', FakeKeyframeEffect);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number =>
      frames.push(cb),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      frames[handle - 1] = null;
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        state = {disconnected: false};
        constructor() {
          observers.push(this.state);
        }
        observe() {}
        unobserve() {}
        disconnect() {
          this.state.disconnected = true;
        }
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        state: {disconnected: boolean; callback: () => void};
        constructor(callback: () => void) {
          this.state = {disconnected: false, callback};
          intersections.push(this.state);
        }
        observe() {}
        unobserve() {}
        disconnect() {
          this.state.disconnected = true;
        }
      },
    );
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => animations,
    });
    Element.prototype.getBoundingClientRect = function () {
      const box = boxes.get(this) ?? {width: 0, height: 0};
      return {
        ...box,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: box.width,
        bottom: box.height,
        toJSON: () => ({}),
      };
    };
    Element.prototype.getClientRects = function () {
      const box = boxes.get(this);
      const hasBox =
        emptyBoxes.has(this) ||
        (box != null && (box.width > 0 || box.height > 0));
      return (hasBox
        ? [this.getBoundingClientRect()]
        : []) as unknown as DOMRectList;
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Element.prototype.getBoundingClientRect = originalRect;
    Element.prototype.getClientRects = originalClientRects;
    delete (document as unknown as {getAnimations?: unknown}).getAnimations;
  });

  /** Run every queued frame callback once, as one animation frame would. */
  function flushFrame() {
    const pending = frames;
    frames = [];
    act(() => {
      for (const cb of pending) {
        cb?.(performance.now());
      }
    });
  }

  /** Deliver an IntersectionObserver entry, as a trigger gaining a box does. */
  function signal() {
    act(() => {
      for (const {disconnected, callback} of [...intersections]) {
        if (!disconnected) {
          callback();
        }
      }
    });
  }

  function Harness({target}: {target: 'a' | 'b' | 'none'}) {
    const layer = useLayerInternal({mode: 'context'});
    return (
      <>
        <button
          type="button"
          data-testid="a"
          ref={target === 'a' ? layer.ref : undefined}
          onClick={layer.show}>
          A
        </button>
        <button
          type="button"
          data-testid="b"
          ref={target === 'b' ? layer.ref : undefined}
          onClick={layer.show}>
          B
        </button>
        <button type="button" data-testid="hide" onClick={layer.hide}>
          Hide
        </button>
        <span data-testid="state">{layer.isOpen ? 'open' : 'closed'}</span>
        {layer.render(<span>Layer content</span>)}
      </>
    );
  }

  it('opens in the same task when the trigger already has a box', () => {
    const {getByTestId} = render(<Harness target="a" />);
    boxes.set(getByTestId('a'), {width: 80, height: 24});

    fireEvent.click(getByTestId('a'));

    expect(getByTestId('state')).toHaveTextContent('open');
    expect(observers).toHaveLength(0);
    expect(frames).toHaveLength(0);
  });

  it('opens at once for a trigger that renders an empty box (a ContextMenu cursor anchor)', () => {
    const {getByTestId} = render(<Harness target="a" />);
    emptyBoxes.add(getByTestId('a'));

    fireEvent.click(getByTestId('a'));

    // A 0x0 box is still a box: the wait is for `display: none` and closed
    // dialogs only, so an empty anchor does not hold the layer closed.
    expect(getByTestId('state')).toHaveTextContent('open');
    expect(observers).toHaveLength(0);
  });

  it('waits for a box on a boxless trigger, then settles, then opens', () => {
    const {getByTestId} = render(<Harness target="a" />);

    fireEvent.click(getByTestId('a'));
    expect(getByTestId('state')).toHaveTextContent('closed');
    // The runtime polls nothing (INV12): no frame is queued while it waits.
    expect(frames).toHaveLength(0);

    // The trigger gains a box; the observer signal sees it and starts the
    // settle frame, and only after that does the layer open.
    boxes.set(getByTestId('a'), {width: 80, height: 24});
    signal();
    expect(getByTestId('state')).toHaveTextContent('closed');
    flushFrame();
    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('does not hold the layer closed for a paused animation on an ancestor', () => {
    const {getByTestId} = render(<Harness target="a" />);
    const trigger = getByTestId('a');
    animations.push({
      effect: new FakeKeyframeEffect(trigger.parentElement as Element),
      timeline: document.timeline,
      playState: 'paused',
      finished: new Promise(() => {}),
    });

    fireEvent.click(trigger);
    boxes.set(trigger, {width: 80, height: 24});
    signal();
    flushFrame();

    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('does not hold the layer closed for a scroll-driven animation on an ancestor', () => {
    const {getByTestId} = render(<Harness target="a" />);
    const trigger = getByTestId('a');
    // A scroll() or view() timeline is not the document's, and its animation
    // finishes only when the person scrolls to the end of its range.
    animations.push({
      effect: new FakeKeyframeEffect(trigger.parentElement as Element),
      timeline: {},
      playState: 'running',
      finished: new Promise(() => {}),
    });

    fireEvent.click(trigger);
    boxes.set(trigger, {width: 80, height: 24});
    signal();
    flushFrame();

    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('still waits for a running animation on an ancestor to finish', async () => {
    const {getByTestId} = render(<Harness target="a" />);
    const trigger = getByTestId('a');
    let finish = () => {};
    animations.push({
      effect: new FakeKeyframeEffect(trigger.parentElement as Element),
      timeline: document.timeline,
      playState: 'running',
      finished: new Promise<void>(resolve => {
        finish = resolve;
      }),
    });

    fireEvent.click(trigger);
    boxes.set(trigger, {width: 80, height: 24});
    signal();
    flushFrame();
    expect(getByTestId('state')).toHaveTextContent('closed');

    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('opens without waiting when there is no layout engine, whatever the ResizeObserver does', () => {
    delete (document as unknown as {getAnimations?: unknown}).getAnimations;
    const {getByTestId} = render(<Harness target="a" />);

    fireEvent.click(getByTestId('a'));

    expect(getByTestId('state')).toHaveTextContent('open');
    expect(observers).toHaveLength(0);
  });

  it('restarts the wait on the new trigger when a boxless one is replaced', async () => {
    const {getByTestId, rerender} = render(<Harness target="a" />);
    boxes.set(getByTestId('b'), {width: 80, height: 24});

    fireEvent.click(getByTestId('a'));
    expect(getByTestId('state')).toHaveTextContent('closed');

    // The ref moves to `b`, which has a box. The wait that was polling `a`
    // would never end, so the layer has to be re-shown against `b`.
    await act(async () => {
      rerender(<Harness target="b" />);
      await Promise.resolve();
    });

    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('stops observing a trigger that unmounts without a replacement', async () => {
    const {getByTestId, rerender} = render(<Harness target="a" />);

    fireEvent.click(getByTestId('a'));
    expect(observers).toHaveLength(1);

    await act(async () => {
      rerender(<Harness target="none" />);
      await Promise.resolve();
    });

    expect(observers[0].disconnected).toBe(true);
    expect(intersections[0].disconnected).toBe(true);
    expect(frames.every(cb => cb === null)).toBe(true);
    expect(getByTestId('state')).toHaveTextContent('closed');
  });

  function SwapHarness({
    target,
    hideOnSwap = false,
  }: {
    target: 'a' | 'b';
    hideOnSwap?: boolean;
  }) {
    const layer = useLayerInternal({mode: 'context'});
    const {hide} = layer;
    useLayoutEffect(() => {
      if (hideOnSwap) {
        hide();
      }
    }, [hideOnSwap, hide]);
    return (
      <>
        <button
          type="button"
          data-testid="a"
          ref={target === 'a' ? layer.ref : undefined}
          onClick={layer.show}>
          A
        </button>
        <button
          type="button"
          data-testid="b"
          ref={target === 'b' ? layer.ref : undefined}
          onClick={layer.show}>
          B
        </button>
        <span data-testid="state">{layer.isOpen ? 'open' : 'closed'}</span>
        {layer.render(<span>Layer content</span>)}
      </>
    );
  }

  it('does not restart a wait that a hide() in the same commit cancelled', async () => {
    const {getByTestId, rerender} = render(<SwapHarness target="a" />);
    boxes.set(getByTestId('b'), {width: 80, height: 24});

    fireEvent.click(getByTestId('a'));
    expect(getByTestId('state')).toHaveTextContent('closed');

    // The trigger moves to `b` and the layer is hidden in that same commit.
    await act(async () => {
      rerender(<SwapHarness target="b" hideOnSwap />);
      await Promise.resolve();
    });

    expect(getByTestId('state')).toHaveTextContent('closed');
  });

  it('forgets a finished wait, so a later trigger swap does not reopen the layer', async () => {
    const {container, getByTestId, rerender} = render(
      <SwapHarness target="a" />,
    );
    boxes.set(getByTestId('b'), {width: 80, height: 24});

    fireEvent.click(getByTestId('a'));
    boxes.set(getByTestId('a'), {width: 80, height: 24});
    signal();
    flushFrame();
    expect(getByTestId('state')).toHaveTextContent('open');

    const popover = container.querySelector('[popover]') as HTMLElement;
    act(() => {
      popover.dispatchEvent(
        Object.assign(new Event('toggle'), {
          oldState: 'open',
          newState: 'closed',
        }),
      );
    });

    await act(async () => {
      rerender(<SwapHarness target="b" />);
      await Promise.resolve();
    });

    expect(getByTestId('state')).toHaveTextContent('closed');
  });

  it('waits for the dialog around the trigger to be open, even though the trigger has a box', async () => {
    function DialogHarness() {
      const layer = useLayerInternal({mode: 'context'});
      return (
        <>
          <dialog data-testid="dialog">
            <button
              type="button"
              data-testid="a"
              ref={layer.ref}
              onClick={layer.show}>
              A
            </button>
          </dialog>
          <span data-testid="state">{layer.isOpen ? 'open' : 'closed'}</span>
          {layer.render(<span>Layer content</span>)}
        </>
      );
    }
    const {getByTestId} = render(<DialogHarness />);
    boxes.set(getByTestId('a'), {width: 80, height: 24});

    fireEvent.click(getByTestId('a'));
    signal();
    flushFrame();
    expect(getByTestId('state')).toHaveTextContent('closed');

    // The dialog goes modal: its `open` attribute is the signal.
    await act(async () => {
      getByTestId('dialog').setAttribute('open', '');
      await Promise.resolve();
    });
    flushFrame();
    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('opens once a non-modal dialog shown as a popover (a Drawer) is showing', () => {
    function DrawerHarness() {
      const layer = useLayerInternal({mode: 'context'});
      return (
        <>
          <dialog data-testid="drawer">
            <button
              type="button"
              data-testid="a"
              ref={layer.ref}
              onClick={layer.show}>
              A
            </button>
          </dialog>
          <span data-testid="state">{layer.isOpen ? 'open' : 'closed'}</span>
          {layer.render(<span>Layer content</span>)}
        </>
      );
    }
    const {getByTestId} = render(<DrawerHarness />);
    const drawer = getByTestId('drawer');
    let isShowing = false;
    const originalMatches = drawer.matches.bind(drawer);
    Object.defineProperty(drawer, 'matches', {
      configurable: true,
      value: (selector: string) =>
        selector === ':popover-open' ? isShowing : originalMatches(selector),
    });
    boxes.set(getByTestId('a'), {width: 80, height: 24});

    fireEvent.click(getByTestId('a'));
    signal();
    flushFrame();
    expect(getByTestId('state')).toHaveTextContent('closed');

    // `showPopover()` never sets `open`; the `toggle` event is the signal.
    isShowing = true;
    act(() => {
      drawer.dispatchEvent(new Event('toggle'));
    });
    flushFrame();
    expect(getByTestId('state')).toHaveTextContent('open');
  });

  it('hide() cancels a settle wait that is already pending', async () => {
    const {getByTestId} = render(<Harness target="a" />);
    const trigger = getByTestId('a');
    let finish = () => {};
    animations.push({
      effect: new FakeKeyframeEffect(trigger.parentElement as Element),
      timeline: document.timeline,
      playState: 'running',
      finished: new Promise<void>(resolve => {
        finish = resolve;
      }),
    });

    fireEvent.click(trigger);
    boxes.set(trigger, {width: 80, height: 24});
    signal();
    flushFrame();
    expect(getByTestId('state')).toHaveTextContent('closed');

    fireEvent.click(getByTestId('hide'));
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    expect(getByTestId('state')).toHaveTextContent('closed');
  });
});
