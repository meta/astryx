// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.test.tsx
 * @input Vitest, Testing Library, StyleX's injected rules, and a stubbed
 *   watchHitArea (utils/hitArea.ts)
 * @output Tests for the shared touch hit area hook and layer: what the hook
 *   watches and with which size, that a measurement taken while the
 *   element's parent moves waits for the motion to end (an endless animation
 *   holds nothing), that it stops when disabled or unmounted, and the
 *   layer's CSS (coarse-only `::after`, four sides grown by the inset
 *   properties, the element as a clip-path hole, no paint, no stacking)
 * @position Unit test for utils/touchHitArea.ts and
 *   utils/touchHitArea.stylex.ts; List rows' wiring is in
 *   List/ListItem.hitArea.test.tsx, real hit testing in
 *   List/__tests__/ListTouchHitArea.interaction.browser.spec.ts
 */

import {useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import type * as HitAreaModule from './hitArea';
import {HIT_INSET_PROPERTIES, type HitInsets} from './hitArea';

const watches = vi.hoisted(
  () =>
    [] as {
      element: Element;
      onInsets: (insets: HitInsets) => void;
      minSize: number | undefined;
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
      options?: {readonly minSize?: number},
    ) => {
      const stop = vi.fn();
      watches.push({element, onInsets, minSize: options?.minSize, stop});
      return stop;
    },
  };
});

import {useTouchHitArea} from './touchHitArea';
import {touchHitAreaStyles} from './touchHitArea.stylex';

function Host({enabled}: {enabled: boolean}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useTouchHitArea(ref, enabled);
  return (
    <div>
      <span
        data-testid="host"
        ref={ref}
        {...stylex.props(touchHitAreaStyles.layer)}
      />
    </div>
  );
}

/** The element's injected `::after` rules, split by the touch gate. */
function afterRules(el: Element): {touch: string[]; other: string[]} {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const out = {touch: [] as string[], other: [] as string[]};
  const visit = (rules: CSSRuleList, touch: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (
          rule.selectorText.includes('::after') &&
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

  it('watches the element while enabled, toward the theme’s touch target under a finger, and stops when disabled or unmounted', () => {
    const {rerender, unmount} = render(<Host enabled={false} />);
    expect(watches).toHaveLength(0);
    rerender(<Host enabled />);
    expect(watches.map(watch => watch.element)).toEqual([
      screen.getByTestId('host'),
    ]);
    // No coarse pointer here: the 44 px minimum.
    expect(watches[0].minSize).toBe(44);
    rerender(<Host enabled={false} />);
    expect(watches[0].stop).toHaveBeenCalledTimes(1);
    unmount();

    stubCoarse();
    const host = render(<Host enabled />);
    const element = screen.getByTestId('host');
    expect(watches[1].element).toBe(element);
    expect(watches[1].minSize).toBe(44);
    host.unmount();
    expect(watches[1].stop).toHaveBeenCalledTimes(1);
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

describe('touchHitAreaStyles.layer', () => {
  it('is a coarse-only ::after grown on all four sides by the inset properties, the element as its clip-path hole, painting nothing and starting no stacking context', () => {
    render(<Host enabled={false} />);
    const {touch, other} = afterRules(screen.getByTestId('host'));
    const layer = touch.join('\n');
    expect(layer).toContain('position: absolute');
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      expect(layer).toMatch(
        new RegExp(
          `${side}: calc\\(var\\(${HIT_INSET_PROPERTIES[side]}, ?0px\\) \\* -1\\)`,
        ),
      );
      expect(layer).toContain(`var(${HIT_INSET_PROPERTIES[side]}`);
    }
    expect(layer).toMatch(/clip-path: polygon\(evenodd/);
    expect(layer).not.toMatch(
      /background|border|box-shadow|outline|z-index|isolation/,
    );
    // With a mouse: no pseudo-element.
    expect(other).toEqual([]);
  });
});
