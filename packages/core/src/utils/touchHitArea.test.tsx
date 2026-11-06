// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.test.tsx
 * @input Vitest, Testing Library, StyleX's injected rules, and a stubbed
 *   watchHitArea (utils/hitArea.ts)
 * @output Tests for the shared touch hit area hook and layer. They cover what
 *   the hook watches, an owner's growth and press check, a measurement while
 *   the parent moves, the stop, and the layer's CSS.
 * @position Unit test for utils/touchHitArea.ts and
 *   internal/touchHitArea.stylex.ts. List/ListItem.hitArea.test.tsx covers the
 *   row wiring.
 */

import {useCallback} from 'react';
import * as stylex from '@stylexjs/stylex';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import type * as HitAreaModule from './hitArea';
import {HIT_INSET_PROPERTIES, type HitInsets, type HitRect} from './hitArea';
import {useMergedRefs} from '../hooks/useMergedRefs';

const watches = vi.hoisted(
  () =>
    [] as {
      element: Element;
      onInsets: (insets: HitInsets) => void;
      minSize: number | undefined;
      options: HitAreaModule.WatchHitAreaOptions | undefined;
      stop: ReturnType<typeof vi.fn>;
    }[],
);

vi.mock('./hitArea', async importOriginal => {
  const actual = await importOriginal<typeof HitAreaModule>();
  return {
    ...actual,
    watchHitArea: (
      element: Element,
      onInsets: (insets: HitInsets) => void,
      options?: HitAreaModule.WatchHitAreaOptions,
    ) => {
      const stop = vi.fn();
      watches.push({
        element,
        onInsets,
        minSize: options?.minSize,
        options,
        stop,
      });
      return stop;
    },
  };
});

import {useTouchHitArea} from './touchHitArea';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';

function Host({
  enabled,
  target,
  swap = false,
}: {
  enabled: boolean;
  target?: string;
  swap?: boolean;
}) {
  const hitAreaRef = useTouchHitArea(enabled);
  // The page's touch target, set before the hit area reads the element.
  const setTarget = useCallback(
    (node: HTMLSpanElement | null) => {
      if (node != null && target != null) {
        node.style.setProperty('--size-touch-target', target);
      }
    },
    [target],
  );
  const ref = useMergedRefs(setTarget, hitAreaRef);
  return (
    <div>
      <span
        key={swap ? 'replaced' : 'first'}
        data-testid="host"
        ref={ref}
        {...stylex.props(touchHitAreaStyles.layer)}
      />
    </div>
  );
}

/** The element's injected rules for `pseudo`, split by the touch gate. */
function pseudoRules(
  el: Element,
  pseudo: '::after' | '::before' = '::after',
): {touch: string[]; other: string[]} {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const out = {touch: [] as string[], other: [] as string[]};
  const visit = (rules: CSSRuleList, touch: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (
          rule.selectorText.includes(pseudo) &&
          classes.some(cls => rule.selectorText.startsWith(cls))
        ) {
          (touch ? out.touch : out.other).push(
            `${rule.selectorText} {${rule.style.cssText}}`,
          );
        }
        continue;
      }
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested == null) {
        continue;
      }
      const condition = (rule as CSSConditionRule).conditionText ?? '';
      visit(nested, touch || condition.includes('pointer: coarse'));
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    visit(sheet.cssRules, false);
  }
  return out;
}

function stubCoarse(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('useTouchHitArea', () => {
  afterEach(() => {
    watches.length = 0;
    vi.unstubAllGlobals();
  });

  it('watches the element while enabled, toward 44 px, and stops when disabled or unmounted', async () => {
    const {rerender, unmount} = render(<Host enabled={false} />);
    expect(watches).toHaveLength(0);
    rerender(<Host enabled />);
    expect(watches.map(watch => watch.element)).toEqual([
      screen.getByTestId('host'),
    ]);
    // No coarse pointer here: the 44 px minimum.
    expect(watches[0].minSize).toBe(44);
    rerender(<Host enabled={false} />);
    await Promise.resolve();
    expect(watches[0].stop).toHaveBeenCalledTimes(1);
    unmount();

    stubCoarse();
    const host = render(<Host enabled />);
    const element = screen.getByTestId('host');
    expect(watches[1].element).toBe(element);
    expect(watches[1].minSize).toBe(44);
    host.unmount();
    await Promise.resolve();
    expect(watches[1].stop).toHaveBeenCalledTimes(1);
  });

  it("passes an owner's growth, with the element, its press check and its descendant-touch choice to the watch; a plain watch keeps the defaults", () => {
    const grown = {top: 1, right: 2, bottom: 3, left: 4};
    const growth = vi.fn(() => grown);
    const options = {growth, checkAtPress: false, ownsDescendantTouches: false};
    function Owner() {
      const hitAreaRef = useTouchHitArea(true, options);
      return <span data-testid="owner" ref={hitAreaRef} />;
    }
    render(
      <>
        <Owner />
        <Host enabled />
      </>,
    );
    const owner = screen.getByTestId('owner');
    const ownerWatch = watches.find(watch => watch.element === owner);
    const plainWatch = watches.find(
      watch => watch.element === screen.getByTestId('host'),
    );
    expect(ownerWatch?.options?.checkAtPress).toBe(false);
    expect(ownerWatch?.options?.ownsDescendantTouches).toBe(false);
    const box = {left: 0, top: 0, right: 32, bottom: 32};
    const toLayout = (rect: HitRect) => rect;
    expect(ownerWatch?.options?.growth?.(box, toLayout)).toBe(grown);
    expect(growth).toHaveBeenCalledWith(box, toLayout, owner);
    expect(plainWatch?.options?.growth).toBeUndefined();
    expect(plainWatch?.options?.checkAtPress).toBeUndefined();
    expect(plainWatch?.options?.ownsDescendantTouches).toBe(true);
  });

  it('follows a replaced element: the new element is watched and the old one’s watch stops', async () => {
    const {rerender} = render(<Host enabled />);
    const first = screen.getByTestId('host');
    expect(watches.map(watch => watch.element)).toEqual([first]);
    rerender(<Host enabled swap />);
    await Promise.resolve();
    const replaced = screen.getByTestId('host');
    expect(replaced).not.toBe(first);
    expect(watches[0].stop).toHaveBeenCalledTimes(1);
    expect(watches.map(watch => watch.element)).toEqual([first, replaced]);
  });

  it('keeps the 44 px target under a finger whatever a page sets: no token admits `--size-touch-target` yet', () => {
    stubCoarse();
    render(<Host enabled target="60px" />);
    expect(watches[0].minSize).toBe(44);
  });

  it('listens to no media query of its own: the shared hit area owns the pointer query', () => {
    const listeners: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => listeners.push(query),
      removeEventListener: () => {},
    }));
    render(<Host enabled target="60px" />);
    // Present first: the hit area is on, watching the element.
    expect(watches).toHaveLength(1);
    expect(listeners).toEqual([]);
  });

  it('writes the insets it hears on the element', () => {
    render(<Host enabled />);
    watches[0].onInsets({top: 3, right: 2, bottom: 1, left: 0});
    const element = screen.getByTestId('host');
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe(
      '3px',
    );
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.right)).toBe(
      '2px',
    );
  });

  it('clears the insets when a watch stops, so a fresh watch that measures zero leaves none behind', async () => {
    const {rerender} = render(<Host enabled />);
    watches[0].onInsets({top: 6, right: 0, bottom: 6, left: 0});
    const element = screen.getByTestId('host');
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe(
      '6px',
    );
    // Watched afresh. The new watch hears no zero measurement, since it
    // starts at zero, so the stop clears the old insets.
    rerender(<Host enabled={false} />);
    await Promise.resolve();
    rerender(<Host enabled />);
    expect(watches).toHaveLength(2);
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe(
      '0px',
    );
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.bottom)).toBe(
      '0px',
    );
  });

  it('drops a measurement taken while the element’s parent moves, and watches afresh once the motion ends', async () => {
    render(<Host enabled />);
    const element = screen.getByTestId('host');
    const parent = element.parentElement!;
    let finish = (): void => {};
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    const slide = {
      playState: 'running',
      effect: {getComputedTiming: () => ({endTime: 300})},
      finished,
    } as unknown as Animation;
    parent.getAnimations = () => [slide];
    watches[0].onInsets({top: 3, right: 0, bottom: 1, left: 0});
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe('');
    parent.getAnimations = () => [];
    finish();
    await vi.waitFor(() => expect(watches).toHaveLength(2));
    expect(watches[0].stop).toHaveBeenCalledTimes(1);
    watches[1].onInsets({top: 4, right: 0, bottom: 1, left: 0});
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe(
      '4px',
    );
  });

  it('does not wait on an endless animation nearby (a spinner)', () => {
    render(<Host enabled />);
    const element = screen.getByTestId('host');
    const spinner = {
      playState: 'running',
      effect: {getComputedTiming: () => ({endTime: Infinity})},
      finished: new Promise<void>(() => {}),
    } as unknown as Animation;
    element.parentElement!.getAnimations = () => [spinner];
    watches[0].onInsets({top: 2, right: 0, bottom: 2, left: 0});
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe(
      '2px',
    );
  });
});

describe('useTouchHitArea across re-renders', () => {
  afterEach(() => {
    watches.length = 0;
  });

  /** A host that merges whatever ref its caller passes. */
  function RefHost({
    nodeRef,
  }: {
    nodeRef: (node: HTMLSpanElement | null) => void;
  }) {
    const hitAreaRef = useTouchHitArea(true);
    const ref = useMergedRefs(nodeRef, hitAreaRef);
    return <span data-testid="host" ref={ref} />;
  }

  /** The caller, which passes a new inline ref on every render. */
  function InlineRefHost({tick}: {tick: number}) {
    return (
      <RefHost
        nodeRef={node => {
          node?.setAttribute('data-tick', String(tick));
        }}
      />
    );
  }

  it('keeps one watch, and its insets, when a re-render hands the element a new merged ref', async () => {
    const {rerender} = render(<InlineRefHost tick={0} />);
    const element = screen.getByTestId('host');
    watches[0].onInsets({top: 6, right: 0, bottom: 6, left: 0});
    rerender(<InlineRefHost tick={1} />);
    await Promise.resolve();
    expect(element.getAttribute('data-tick')).toBe('1');
    expect(watches).toHaveLength(1);
    expect(watches[0].stop).not.toHaveBeenCalled();
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe(
      '6px',
    );
  });

  it('writes no insets on an element whose watch never measured, as under a mouse', async () => {
    const {rerender} = render(<Host enabled />);
    const element = screen.getByTestId('host');
    rerender(<Host enabled={false} />);
    await Promise.resolve();
    expect(watches[0].stop).toHaveBeenCalledTimes(1);
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe('');
  });
});

describe('touchHitAreaStyles.layer', () => {
  it('is a coarse-only ::after grown on all four sides by the inset properties past the host’s border, the element as its clip-path hole, with no z-index of its own, painting nothing, and the host starting no stacking context', () => {
    render(<Host enabled={false} />);
    const {touch, other} = pseudoRules(screen.getByTestId('host'));
    const layer = touch.join('\n');
    expect(layer).toContain('position: absolute');
    // Offset from the host's padding box: the inset, plus the border the host
    // declares on that side (the inset is measured from its border box). One
    // per side, in physical order: top, right, bottom, left.
    const offset = (side: keyof typeof HIT_INSET_PROPERTIES) =>
      `calc\\(\\(var\\(${HIT_INSET_PROPERTIES[side]}, ?0px\\) \\+ var\\(--_hit-border-${side}, ?0px\\)\\) \\* -1\\)`;
    expect(layer).toMatch(
      new RegExp(
        `inset: ${offset('top')} ${offset('right')} ${offset('bottom')} ${offset('left')}`,
      ),
    );
    expect(layer).toMatch(/clip-path: polygon\(evenodd/);
    // No z-index of its own: what bounds a raise is the host's container's
    // call (a List raises its rows' layers and isolates them, ListItem).
    expect(layer).not.toMatch(/z-index/);
    // It paints nothing: no paint declaration of its own.
    expect(layer).not.toMatch(
      /[{;]\s*(?:background|border|box-shadow|outline|isolation)[\w-]*\s*:/,
    );
    // With a mouse: no pseudo-element.
    expect(other).toEqual([]);
  });
});

describe('touchHitAreaStyles.layerBelowChildren', () => {
  it("is the same coarse-only band as the host's ::before, so the host's positioned children paint over its edge, and draws no ::after", () => {
    render(
      <>
        <span
          data-testid="below"
          {...stylex.props(touchHitAreaStyles.layerBelowChildren)}
        />
        <span data-testid="above" {...stylex.props(touchHitAreaStyles.layer)} />
      </>,
    );
    const below = screen.getByTestId('below');
    const declarations = (rules: string[]) =>
      rules.map(rule => rule.slice(rule.indexOf('{'))).sort();
    const band = pseudoRules(below, '::before');
    expect(band.touch.length).toBeGreaterThan(0);
    expect(declarations(band.touch)).toEqual(
      declarations(pseudoRules(screen.getByTestId('above')).touch),
    );
    // With a mouse: no pseudo-element, and never an `::after`.
    expect(band.other).toEqual([]);
    expect(pseudoRules(below)).toEqual({touch: [], other: []});
  });
});
