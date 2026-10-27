// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interactionOverlay.cell.test.ts
 * @input vitest, the UIKit constants table (motion/uikit/list.ts), the press
 *   layer style (`rowPressLayerStyles.cell`, rowPressLayer.ts) and the rows that compose
 *   it (Item, TreeList)
 * @output Holds the layer's build-time clock to the constants table, and
 *   asserts what a row ships for the touch press: the pressed token on a
 *   `::before` shown at once on the on arm, an opacity release on the fading
 *   arm on the cell clock, and none of the overlay's own main-thread release,
 *   all under a finger; a fine pointer's row as it was (no layer, no
 *   stacking context, the overlay's own paint)
 * @position Unit test beside utils/interactionOverlay.stylex.ts (`cell`); the real-engine
 *   proofs (compositor, busy main thread, curve) are in
 *   List/__tests__/ListRowPress.interaction.browser.spec.ts
 */

import {createElement} from 'react';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {list} from '../motion/uikit/list';
import {timing} from '../motion/uikit/timing';
import {Item} from '../Item';
import {TreeList} from '../TreeList';
import {durationToMs, rulesDeclaredFor} from '../__tests__/pressState';
import {PRESS_FADE_MS} from './pressGesture';
import {cellPressConsts} from './rowPressLayer.stylex';

const ON = '[data-astryx-press="on"]';
const FADING = '[data-astryx-press="fading"]';

const selectorOf = (rule: string) => rule.slice(0, rule.indexOf('{'));
const layerRules = (el: Element, arm: string) =>
  rulesDeclaredFor(el).filter(rule => {
    const selector = selectorOf(rule);
    return selector.includes('::before') && selector.includes(arm);
  });
const hostRules = (el: Element, arm: string) =>
  rulesDeclaredFor(el).filter(rule => {
    const selector = selectorOf(rule);
    return !selector.includes('::before') && selector.includes(arm);
  });

const COARSE = '(pointer: coarse)';

const isHost = (rule: string) => !selectorOf(rule).includes('::before');

/**
 * The element's style rules inside an `@media` naming `media`, or outside
 * every `@media` when `media` is null, as `selector {declarations}` text.
 */
function rulesIn(el: Element, media: string | null): string[] {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const out: string[] = [];
  const walk = (list: CSSRuleList, inside: string | null) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, rule.media.mediaText);
      } else if (rule instanceof CSSStyleRule) {
        const selector = rule.selectorText;
        // A `not (…)` query names the media only to exclude it.
        const here =
          media == null
            ? inside == null
            : inside?.includes(media) === true &&
              !inside.includes(`not ${media}`);
        if (here && classes.some(cls => selector.startsWith(cls))) {
          out.push(`${selector} {${rule.style.cssText}}`);
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, null);
    } catch {
      // A sheet the document cannot read holds no rule of ours.
    }
  }
  return out;
}

/** Declarations of `property` in the element's rules, by value. */
const values = (rules: string[], property: string) =>
  rules.flatMap(rule => {
    const match = rule.match(
      new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;}]+)`),
    );
    return match == null ? [] : [match[1].trim()];
  });

describe('press layer clock', () => {
  it('is the constants table’s cell release, mirrored for the stylesheet', () => {
    expect(cellPressConsts.cellReleaseMs).toBe(list.highlight.releaseMs);
    expect(cellPressConsts.cellReleaseEase).toBe(
      `cubic-bezier(${list.highlight.releaseCurve.join(', ')})`,
    );
  });

  it('runs on the clock the controller removes the attribute on', () => {
    expect(cellPressConsts.cellReleaseMs).toBe(PRESS_FADE_MS);
  });

  it("plays the table's release clock and curve", () => {
    expect(list.highlight.releaseMs).toBe(timing.press.highlightOutMs);
    expect(list.highlight.releaseCurve).toBe(timing.press.highlightOutCurve);
  });
});

describe.each([
  [
    'Item',
    () => {
      render(
        createElement(Item, {
          label: 'Row',
          onClick: () => {},
          'data-testid': 'row',
        }),
      );
      return screen.getByTestId('row');
    },
  ],
  [
    'TreeList row',
    () => {
      render(
        createElement(TreeList, {
          items: [{id: 'a', label: 'Row', onClick: () => {}}],
        }),
      );
      // The row box: the element the controller writes the press on.
      return screen
        .getByRole('treeitem')
        .querySelector('[data-astryx-pressable]') as HTMLElement;
    },
  ],
])('%s paints the touch press on a compositor layer', (_, mount) => {
  it('shows the pressed token on its ::before at once while the press is on', () => {
    const row = mount();
    expect(row).toHaveAttribute('data-astryx-pressable');
    const all = rulesDeclaredFor(row).filter(rule =>
      selectorOf(rule).includes('::before'),
    );
    expect(values(all, 'background-color')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('--color-overlay-pressed'),
      ]),
    );
    expect(values(all, 'opacity')).toContain('0');
    const on = layerRules(row, ON);
    expect(values(on, 'opacity')).toEqual(['1']);
    // The onset is instant: nothing animates on the on arm.
    expect(values(on, 'animation-name')).toEqual([]);
  });

  it('releases with an opacity animation on the cell clock and curve', () => {
    const row = mount();
    const fading = layerRules(row, FADING);
    expect(values(fading, 'animation-name')).toHaveLength(1);
    // The clock, and its reduced-motion cap (DR2), both the table's value.
    expect([
      ...new Set(values(fading, 'animation-duration').map(durationToMs)),
    ]).toEqual([list.highlight.releaseMs]);
    // StyleX writes the curve minified (`cubic-bezier(0,0,.2,1)`): compare
    // the control points.
    const points = (css: string) =>
      (css.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    expect(values(fading, 'animation-timing-function').map(points)).toEqual([
      [...list.highlight.releaseCurve],
    ]);
    expect(values(fading, 'animation-fill-mode')).toEqual(['both']);
  });

  it('turns off only the row’s own image under a finger: the press paint stays for what the row’s descendants paint, and the release is the layer’s', () => {
    const row = mount();
    const coarse = rulesIn(row, COARSE).filter(isHost);
    // The row's own image arms yield to the layer…
    expect(
      values(
        coarse.filter(rule => rule.includes(ON)),
        'background-image',
      ),
    ).toEqual(['none']);
    expect(
      values(
        coarse.filter(rule => rule.includes(FADING)),
        'background-image',
      ),
    ).toEqual(['none']);
    // …while the paint a row's descendants read from it stays the
    // overlay's own; the strength's main-thread release is dropped, the
    // layer fading instead.
    expect(values(coarse, '--_press-paint')).toEqual([]);
    expect(values(coarse, '--_press-paint-image')).toEqual([]);
    expect(
      values(
        coarse.filter(rule => rule.includes(FADING)),
        'animation-name',
      ),
    ).toEqual(['none']);
  });

  it('under a finger, nothing of the layer applies at rest: every rule of it waits for a press', () => {
    const row = mount();
    const coarse = rulesIn(row, COARSE);
    // The layer's box, and the stacking context it needs, exist only while
    // a press is on or releasing: at rest a row's own `::before` and its
    // children's stacking are as they were.
    const layer = coarse.filter(rule => !isHost(rule));
    expect(layer.length).toBeGreaterThan(0);
    for (const rule of layer) {
      expect(selectorOf(rule), rule).toMatch(/data-astryx-press=/);
    }
    const isolation = coarse.filter(
      rule => isHost(rule) && rule.includes('isolation:'),
    );
    expect(isolation).toHaveLength(1);
    expect(selectorOf(isolation[0] ?? '')).toMatch(/data-astryx-press=/);
  });

  it('leaves a fine pointer’s row as it was: the overlay’s own paint and release, no layer, no stacking context', () => {
    const row = mount();
    const outside = rulesIn(row, null);
    // The overlay's own touch paint and release, as the overlay declares
    // them (spec:AST-017 FR59/DEC-25).
    const paint = values(outside.filter(isHost), '--_press-paint');
    expect(paint).toHaveLength(1);
    expect(paint[0]).toContain('color-mix');
    const release = values(
      outside.filter(rule => isHost(rule) && rule.includes(FADING)),
      'animation-name',
    );
    expect(release).toHaveLength(1);
    expect(release[0]).not.toBe('none');
    // The layer's box and the stacking context it needs exist under a
    // finger only: no declaration of the layer applies outside it, so a
    // row's own `::before` keeps its opacity, stacking and hit testing.
    expect(outside.filter(rule => !isHost(rule))).toEqual([]);
    expect(values(outside, 'content')).toEqual([]);
    expect(values(outside, 'isolation')).toEqual([]);
    expect(values(rulesIn(row, COARSE), 'isolation')).toEqual(['isolate']);
    expect(
      values(
        rulesIn(row, COARSE).filter(rule => !isHost(rule)),
        'content',
      ),
    ).toEqual(['""']);
  });
});

it('a row without an action paints no press layer', () => {
  render(createElement(Item, {label: 'Static', 'data-testid': 'row'}));
  const row = screen.getByTestId('row');
  expect(row).not.toHaveAttribute('data-astryx-pressable');
  expect(layerRules(row, ON)).toEqual([]);
});
