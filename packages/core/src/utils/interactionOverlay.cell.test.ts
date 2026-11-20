// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interactionOverlay.cell.test.ts
 * @input vitest, the press
 *   layer style (`rowPressLayerStyles.cell`, privateAttributes/press.stylex.ts) and the rows that compose
 *   it (Item, TreeList)
 * @output Holds the layer's release to the theme's exit motion tokens, and
 *   asserts what a row ships for the touch press: the pressed token on a
 *   `::before` shown at once on the on arm, an opacity release on the fading
 *   arm on the exit tokens, and none of the overlay's own main-thread release,
 *   all under a finger; a fine pointer's row as it was (no layer, no
 *   stacking context, the overlay's own paint); and that the layer and the
 *   overlay cap their release under reduced motion with DR2's bound
 * @position Unit test of the row press layer (privateAttributes/press.stylex.ts
 *   `rowPressLayerStyles.cell`); the real-engine proofs (compositor, busy main
 *   thread, curve) are in
 *   List/__tests__/ListRowPress.interaction.browser.spec.ts
 */

import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as stylex from '@stylexjs/stylex';
import {createElement} from 'react';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {Item} from '../Item';
import {TreeList} from '../TreeList';
import {durationToMs, rulesDeclaredFor} from '../__tests__/pressState';
import {reducedMotionFadeConsts} from '../motion/reducedMotion.stylex';
import {interactionOverlayStyles} from './interactionOverlay.stylex';
import {PRESS_FADE_MS} from './pressGesture';

const ON = '[data-astryx-press="on"]';
const FADING = '[data-astryx-press="fading"]';

const selectorOf = (rule: string) => rule.slice(0, rule.indexOf('{'));
const layerRules = (el: Element, arm: string) =>
  rulesDeclaredFor(el).filter(rule => {
    const selector = selectorOf(rule);
    return selector.includes('::before') && selector.includes(arm);
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

/** A declared value without spaces, as StyleX may minify it. */
const compact = (css: string) => css.replace(/\s+/g, '');

describe('press layer clock', () => {
  it("plays the strength release's clock, the exit duration with DR2's bound under Reduce Motion, so the layer and the strength land together (spec:AST-094 FR5)", () => {
    const clocksOf = (file: string) =>
      readFileSync(resolve(__dirname, file), 'utf8').match(
        /(?:durationVars\['--duration-exit'\]|`min\(\$\{durationVars\['--duration-exit'\]\}, \$\{reducedMotionFadeConsts\.duration\}\)`);/g,
      ) ?? [];
    const layer = clocksOf('../privateAttributes/press.stylex.ts');
    expect(layer.length).toBe(2);
    expect(new Set(layer)).toEqual(
      new Set(clocksOf('interactionOverlay.stylex.ts')),
    );
  });

  it('resolves, without a theme, to the clock the controller checks the release at', () => {
    expect(durationToMs('var(--duration-exit)')).toBe(PRESS_FADE_MS);
  });

  it("the shared overlay's release plays the exit easing", () => {
    const element = document.createElement('button');
    element.className =
      stylex.props(interactionOverlayStyles.pressedAlpha).className ?? '';
    document.body.append(element);
    const fading = rulesDeclaredFor(element).filter(rule => {
      const selector = selectorOf(rule);
      return selector.includes(FADING) && !selector.includes('::');
    });
    expect(values(fading, 'animation-timing-function').map(compact)).toEqual([
      'var(--ease-exit)',
    ]);
    element.remove();
  });
});

describe("the row layer's constants", () => {
  it('reach only the components that render a press row: a Card ships none of them (architecture:component-style-authoring INV6)', () => {
    // The shared overlay reaches nearly every component (`.stylex` modules
    // are side effects in core's package.json), so whatever it imports does
    // too. esbuild runs in its own process: it needs a native TextEncoder.
    const script = [
      "import {build} from 'esbuild';",
      'const result = await build({',
      `  entryPoints: ${JSON.stringify([resolve(__dirname, '../Card/index.ts')])},`,
      "  bundle: true, write: false, format: 'esm', logLevel: 'silent',",
      "  external: ['react', 'react-dom', 'react/*', 'react-dom/*', '@stylexjs/stylex'],",
      '});',
      'process.stdout.write(result.outputFiles.map(file => file.text).join("\\n"));',
    ].join('\n');
    const bundle = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {cwd: resolve(__dirname, '../../../..'), encoding: 'utf8'},
    );
    // The shared overlay reaches the Card…
    expect(bundle).toContain('astryx-press-alpha');
    // …and brings none of the row layer's constants.
    expect(bundle).not.toContain('cellRelease');
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

  it('releases with an opacity animation on the exit tokens', () => {
    const row = mount();
    const fading = layerRules(row, FADING);
    expect(values(fading, 'animation-name')).toHaveLength(1);
    // The clock, and its reduced-motion cap (DR2).
    expect(new Set(values(fading, 'animation-duration').map(compact))).toEqual(
      new Set([
        'var(--duration-exit)',
        `min(var(--duration-exit),${reducedMotionFadeConsts.duration})`,
      ]),
    );
    expect(values(fading, 'animation-timing-function').map(compact)).toEqual([
      'var(--ease-exit)',
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
