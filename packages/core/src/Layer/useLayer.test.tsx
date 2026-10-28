// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useLayer.test.tsx
 * @input Uses vitest, @testing-library/react, useLayer hook
 * @output Tests for useLayer show/hide feature-detection guards and context-mode positioning
 * @position Testing; validates useLayer.tsx implementation
 *
 * SYNC: When useLayer.tsx changes, update tests accordingly
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {
  render,
  renderHook,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Profiler, useEffect} from 'react';
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
import {getAnchorClearFallbacks} from './layerSlideRules';
import {typeScaleVars} from '../theme/tokens.stylex';
import type {
  LayerPlacement,
  LayerAlignment,
  ContextRenderProps,
  ContextLayerReturn,
  FixedLayerReturn,
} from './useLayer';

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
      return (
        <>
          <button
            type="button"
            ref={el => {
              popover.ref(el);
              tooltip.ref(el);
            }}
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

  /** Give the document a 720px-tall viewport for the duration of a test. */
  function viewport720() {
    return vi
      .spyOn(document.documentElement, 'clientHeight', 'get')
      .mockReturnValue(720);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists beside the trigger, then the other block side at its own size, and only then each block side sized to its room', () => {
    expect(getAnchorClearFallbacks('above')).toBe(
      '--astryx-layer-beside-end, --astryx-layer-beside-start, flip-block, --astryx-layer-fit-above, --astryx-layer-fit-below',
    );
    expect(getAnchorClearFallbacks('below')).toBe(
      '--astryx-layer-beside-end, --astryx-layer-beside-start, flip-block, --astryx-layer-fit-below, --astryx-layer-fit-above',
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

  it('installs the beside and fit rules and the switch to the clear list', async () => {
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
      /@position-try --astryx-layer-beside-start\{[^}]*inline-size:max-content;\}/,
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
    expect(css).toContain(
      '[data-astryx-clears-anchor]{--_astryx-layer-try-fallbacks:var(--_astryx-layer-clear-fallbacks);}',
    );
  });

  it('carries the clear list beside the standard one, which it uses until the switch', async () => {
    const user = userEvent.setup();
    const {container} = render(<ClearHarness placement="below" />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl.style.positionTryFallbacks).toBe(
      `var(--_astryx-layer-try-fallbacks, ${getPositionTryFallbacks('below', 'center')})`,
    );
    expect(
      layerEl.style.getPropertyValue('--_astryx-layer-clear-fallbacks'),
    ).toBe(getAnchorClearFallbacks('below'));
  });

  it('switches to the clear list when the shown layer covers its trigger', async () => {
    const user = userEvent.setup();
    placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).toHaveAttribute('data-astryx-clears-anchor');
  });

  it('places a layer afresh from the clear list when it switches, without closing it or leaving a frame', async () => {
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
    expect(layerEl).toHaveAttribute('data-astryx-clears-anchor');
    // A browser keeps a laid-out layer on its last option until the layer
    // stops being rendered: the switch takes it out of rendering for one
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

  it('switches to the clear list when the shown layer leaves the viewport on the block axis while its trigger is in view', async () => {
    const user = userEvent.setup();
    // Above the trigger, clear of it, but its top past the viewport: where
    // WebKit leaves a box that fits no option.
    viewport720();
    placeBoxes(TRIGGER, rect(-348, 350, 640, 300));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).toHaveAttribute('data-astryx-clears-anchor');
  });

  it('keeps the standard list for a layer past the viewport while its trigger is out of view too', async () => {
    const user = userEvent.setup();
    // The trigger is above the viewport: the layer holds (FR5), not switches.
    viewport720();
    placeBoxes(rect(-80, 400, 30, 100), rect(-200, 350, 100, 200));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');
  });

  it('does not read on scroll events, when the layer has not followed its anchor yet', async () => {
    const user = userEvent.setup();
    viewport720();
    const spy = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    // Mid-scroll: the trigger has moved under the layer's stale box, which
    // reads as covering it and past the viewport. A scroll is read only once
    // it has painted, by the anchor-move observer.
    spy.mockRestore();
    placeBoxes(rect(-40, 380, 30, 100), rect(-60, 350, 100, 200));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('scroll'));
    });
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');
  });

  it('keeps the standard list when the shown layer sits clear of its trigger, even flush against it', async () => {
    const user = userEvent.setup();
    // Directly above the trigger, its bottom edge on the trigger's top edge.
    placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {container} = render(<ClearHarness />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');
  });

  it('starts every show from the standard list', async () => {
    const user = userEvent.setup();
    const spy = placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    const {container, getByText} = render(<ClearHarness />);
    await user.click(getByText('Trigger'));
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).toHaveAttribute('data-astryx-clears-anchor');

    await user.click(getByText('Hide'));
    spy.mockRestore();
    placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    await user.click(getByText('Trigger'));
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');
  });

  it('scrolls only while its content overflows the box it was given', async () => {
    const user = userEvent.setup();
    placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    let scrollHeight = 100;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      () => scrollHeight,
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    const {container, getByText} = render(<ClearHarness />);
    await user.click(getByText('Trigger'));
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    // A layer that fits stays a plain box.
    expect(layerEl).not.toHaveAttribute('data-astryx-layer-scrolls');

    await user.click(getByText('Hide'));
    scrollHeight = 900;
    await user.click(getByText('Trigger'));
    expect(layerEl).toHaveAttribute('data-astryx-layer-scrolls');
    const css =
      document.getElementById('astryx-layer-slide-rules')?.textContent ?? '';
    expect(css).toContain(
      '[data-astryx-layer-scrolls]{overflow-y:auto;overscroll-behavior-block:contain;}',
    );
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
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');
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
    expect(layerEl).toHaveAttribute('data-astryx-clears-anchor');
    vi.unstubAllGlobals();
  });

  it('re-reads its geometry when its trigger moves in layout without resizing', async () => {
    const observers: {
      callback: (entries: {intersectionRatio: number}[]) => void;
      options: IntersectionObserverInit;
      disconnected: boolean;
    }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        record: (typeof observers)[number];
        constructor(
          callback: (entries: {intersectionRatio: number}[]) => void,
          options: IntersectionObserverInit,
        ) {
          this.record = {callback, options, disconnected: false};
          observers.push(this.record);
        }
        observe() {}
        disconnect() {
          this.record.disconnected = true;
        }
        unobserve() {}
      },
    );
    const user = userEvent.setup();
    const spy = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {container, getByText} = render(<ClearHarness />);
    await user.click(getByText('Trigger'));
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');
    // The move observer's root is the viewport shrunk to the trigger's rect.
    const move = observers.find(o => o.options?.root === document);
    expect(move?.options.threshold).toBe(1);
    expect(move?.options.rootMargin).toBe(
      `-300px ${-(document.documentElement.clientWidth - 500)}px ${-(document.documentElement.clientHeight - 330)}px -400px`,
    );

    // Its initial report: fully inside its own rect.
    act(() => move?.callback([{intersectionRatio: 1}]));
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');

    // The trigger moves; the standard list now settles over it.
    spy.mockRestore();
    placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    const before = observers.length;
    act(() => move?.callback([{intersectionRatio: 0.4}]));
    expect(layerEl).toHaveAttribute('data-astryx-clears-anchor');
    // Re-armed on the new rect.
    expect(move?.disconnected).toBe(true);
    expect(observers.length).toBe(before + 1);
    vi.unstubAllGlobals();
  });

  it('follows a move that spans several frames and never goes idle while a scrolled container clips its trigger', async () => {
    type Entry = {intersectionRatio: number; isIntersecting?: boolean};
    const observers: {
      callback: (entries: Entry[]) => void;
      options: IntersectionObserverInit;
      disconnected: boolean;
    }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        record: (typeof observers)[number];
        constructor(
          callback: (entries: Entry[]) => void,
          options: IntersectionObserverInit,
        ) {
          this.record = {callback, options, disconnected: false};
          observers.push(this.record);
        }
        observe() {}
        disconnect() {
          this.record.disconnected = true;
        }
        unobserve() {}
      },
    );
    const moves = () =>
      observers.filter(
        o => o.options?.root === document && o.options.rootMargin != null,
      );
    const visibilities = () =>
      observers.filter(
        o => o.options?.root === document && o.options.rootMargin == null,
      );
    const latest = () => moves()[moves().length - 1];
    const user = userEvent.setup();
    let spy = placeBoxes(TRIGGER, rect(200, 350, 100, 200));
    const {container, getByText} = render(<ClearHarness />);
    await user.click(getByText('Trigger'));
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');

    // A fresh observer's first report already differs: the trigger kept
    // moving after its rectangle was read, as in a smooth scroll. That is a
    // move: it re-reads, and re-arms at the reported ratio.
    spy.mockRestore();
    spy = placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    let armed = moves().length;
    act(() => latest().callback([{intersectionRatio: 0.7}]));
    expect(layerEl).toHaveAttribute('data-astryx-clears-anchor');
    expect(moves().length).toBe(armed + 1);
    expect(latest().options.threshold).toBe(0.7);

    // A first report of 0 for a trigger that moved since the observer read
    // its rectangle re-arms at once on the new rectangle.
    spy.mockRestore();
    spy = placeBoxes(rect(260, 400, 30, 100), rect(16, 350, 688, 300));
    armed = moves().length;
    act(() => latest().callback([{intersectionRatio: 0}]));
    expect(moves().length).toBe(armed + 1);
    expect(latest().options.threshold).toBe(1);

    // A first report of 0 for a trigger that has not moved: a scrolled
    // container clips it. No timer runs; a visibility observer rooted at the
    // viewport waits for it to come back into view, however long that takes.
    const timers = vi.spyOn(globalThis, 'setTimeout');
    armed = moves().length;
    act(() => latest().callback([{intersectionRatio: 0}]));
    expect(moves().length).toBe(armed);
    expect(timers).not.toHaveBeenCalled();
    const visibility = visibilities()[visibilities().length - 1];
    expect(visibility?.options.threshold).toBe(0);
    act(() =>
      visibility?.callback([{intersectionRatio: 0, isIntersecting: false}]),
    );
    expect(moves().length).toBe(armed);
    // Back in view: it re-reads and re-arms, and the visibility observer goes.
    act(() =>
      visibility?.callback([{intersectionRatio: 0.2, isIntersecting: true}]),
    );
    expect(moves().length).toBe(armed + 1);
    expect(visibility?.disconnected).toBe(true);
    expect(timers).not.toHaveBeenCalled();
    spy.mockRestore();
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
      expect(container.querySelector('[popover]')).toHaveAttribute(
        'data-astryx-clears-anchor',
      );
    });
    const first = container.querySelector('[popover]');

    rerender(<MovingClearHarness unsafe={false} />);

    await waitFor(() => {
      const layer = container.querySelector('[popover]');
      expect(layer).not.toBe(first);
      expect(layer?.parentElement).toBe(
        container.querySelector('[data-testid="safe-host"]'),
      );
      expect(layer).toHaveAttribute('data-open', 'true');
      expect(layer).toHaveAttribute('data-astryx-clears-anchor');
    });
  });

  it('leaves a standard layer on the standard list alone', async () => {
    const user = userEvent.setup();
    placeBoxes(TRIGGER, rect(16, 350, 688, 300));
    const {container} = render(<ContextLayerHarness />);
    await user.click(container.querySelector('button')!);
    const layerEl = container.querySelector('[popover]') as HTMLElement;
    expect(layerEl).not.toHaveAttribute('data-astryx-clears-anchor');
    expect(layerEl.style.positionTryFallbacks).toBe(
      getPositionTryFallbacks('above', 'center'),
    );
    expect(
      layerEl.style.getPropertyValue('--_astryx-layer-clear-fallbacks'),
    ).toBe('');
  });
});
