// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexMultiConditionMedia.test.ts
 * @input StyleX styles under one-condition and multi-condition queries, a
 *   multi-condition query inside a one-condition one, and `@starting-style`
 * @output Proves the test runtime holds every rule StyleX generated under an
 *   at-rule its dev runtime keys by the prelude alone, as the build does,
 *   through the runtime injection in internal/test-utils/src/stylexInject.ts
 * @position Testing; guards that test setup, which compensates StyleX 0.19.0's
 *   dev-runtime rule key
 */

import * as stylex from '@stylexjs/stylex';
import {expect, it, vi} from 'vitest';

// Two styles, each with one declaration under the same two-condition query.
const first = stylex.create({
  rule: {
    color: {
      default: null,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'red',
    },
  },
});
const second = stylex.create({
  rule: {
    opacity: {
      default: null,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))': 0,
    },
  },
});
// One style with two declarations under the same two-condition query.
const both = stylex.create({
  rule: {
    outlineColor: {
      default: null,
      '@media (hover: hover) and (forced-colors: none)': 'blue',
    },
    outlineWidth: {
      default: null,
      '@media (hover: hover) and (forced-colors: none)': '3px',
    },
  },
});
// The same pair under a one-condition query, which StyleX keys by its inner
// rule.
const firstSimple = stylex.create({
  rule: {color: {default: null, '@media (min-width: 100px)': 'red'}},
});
const secondSimple = stylex.create({
  rule: {opacity: {default: null, '@media (min-width: 100px)': 0}},
});

// A multi-condition query inside a one-condition one, which StyleX keys by
// the inner query alone.
const nestedFirst = stylex.create({
  rule: {
    color: {
      default: null,
      '@supports (display: grid)': {
        default: null,
        '@media (hover: hover) and (pointer: fine)': 'red',
      },
    },
  },
});
const nestedSecond = stylex.create({
  rule: {
    opacity: {
      default: null,
      '@supports (display: grid)': {
        default: null,
        '@media (hover: hover) and (pointer: fine)': 0.5,
      },
    },
  },
});
// Two `@starting-style` rules, which StyleX keys by `@starting-style` alone.
const startFirst = stylex.create({
  rule: {color: {default: null, '@starting-style': 'blue'}},
});
const startSecond = stylex.create({
  rule: {opacity: {default: null, '@starting-style': 0.25}},
});
// The group last-member rule (`:nth-last-child(1 of …)`, which the test setup
// keeps out of jsdom) as a later rule under a multi-condition query: this
// module loads only if the injection skips it.
const groupFirst = stylex.create({
  rule: {
    color: {
      default: null,
      '@media (hover: hover) and (min-resolution: 2dppx)': 'red',
    },
  },
});
const groupLast = stylex.create({
  rule: {
    opacity: {
      default: null,
      '@media (hover: hover) and (min-resolution: 2dppx)': {
        default: null,
        ':nth-last-child(1 of :not([popover]))': 0,
      },
    },
  },
});
// The same first rule under a multi-condition query, compiled twice.
const twiceA = stylex.create({
  rule: {
    color: {default: null, '@media (hover: none) and (pointer: coarse)': 'red'},
  },
});
const twiceB = stylex.create({
  rule: {
    color: {default: null, '@media (hover: none) and (pointer: coarse)': 'red'},
  },
});

/** Every rule's text in every sheet of the document, nested rules included. */
function allRules(): string[] {
  const found: string[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      found.push(rule.cssText);
      if ('cssRules' in rule) {
        walk((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules);
  }
  return found;
}

/** The rules under `media` in every sheet of the document. */
function rulesUnder(media: string): string {
  const found: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSMediaRule && rule.media.mediaText === media) {
        found.push(...Array.from(rule.cssRules).map(inner => inner.cssText));
      }
    }
  }
  return found.join(' ');
}

it('holds every rule written under a multi-condition media query, as the build does', () => {
  stylex.props(
    first.rule,
    second.rule,
    both.rule,
    firstSimple.rule,
    secondSimple.rule,
  );
  const simple = rulesUnder('(min-width: 100px)');
  expect(simple).toContain('color');
  expect(simple).toContain('opacity');
  const motion = rulesUnder(
    '(prefers-reduced-motion: reduce) and (not (pointer: coarse))',
  );
  expect(motion).toContain('color');
  expect(motion).toContain('opacity');
  const hover = rulesUnder('(hover: hover) and (forced-colors: none)');
  expect(hover).toContain('outline-color');
  expect(hover).toContain('outline-width');
});

it('holds every rule under a multi-condition query nested in a one-condition one, and every @starting-style rule', () => {
  stylex.props(
    nestedFirst.rule,
    nestedSecond.rule,
    startFirst.rule,
    startSecond.rule,
  );
  const rules = allRules().join(' ');
  const nested = allRules().filter(text =>
    text.startsWith('@supports (display: grid)'),
  );
  expect(nested.join(' ')).toContain('color: red');
  expect(nested.join(' ')).toContain('opacity: 0.5');
  const starting = allRules().filter(text =>
    text.startsWith('@starting-style'),
  );
  expect(starting.join(' ')).toContain('color: blue');
  expect(starting.join(' ')).toContain('opacity: 0.25');
  expect(rules).not.toBe('');
});

it('leaves the rule the test setup keeps out of jsdom out, and copies no rule StyleX already holds', () => {
  stylex.props(groupFirst.rule, groupLast.rule, twiceA.rule, twiceB.rule);
  const rules = allRules();
  expect(rules.some(text => text.includes(':nth-last-child(1 of'))).toBe(false);
  const coarse = rules.filter(text =>
    text.startsWith('@media (hover: none) and (pointer: coarse)'),
  );
  expect(coarse).toHaveLength(1);
});

it('keeps its record across vi.resetModules(): no rule is restored twice, and a later rule imported first after a reset is restored', async () => {
  // StyleX's own injector keeps its keys through a reset.
  const a = await import('./stylexResetA.fixture');
  const b = await import('./stylexResetB.fixture');
  stylex.props(a.styles.rule, b.styles.rule);
  vi.resetModules();
  const a2 = await import('./stylexResetA.fixture');
  const b2 = await import('./stylexResetB.fixture');
  stylex.props(a2.styles.rule, b2.styles.rule);
  const fast = allRules().filter(text =>
    text.startsWith('@media (hover: hover) and (update: fast)'),
  );
  expect(fast.filter(text => text.includes('opacity'))).toHaveLength(1);

  const c = await import('./stylexResetC.fixture');
  stylex.props(c.styles.rule);
  vi.resetModules();
  const d = await import('./stylexResetD.fixture');
  stylex.props(d.styles.rule);
  expect(rulesUnder('(hover: none) and (update: slow)')).toContain(
    'opacity: 0.5',
  );
});
