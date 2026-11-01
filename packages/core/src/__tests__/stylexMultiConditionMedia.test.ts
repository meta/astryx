// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexMultiConditionMedia.test.ts
 * @input StyleX styles under one-condition and multi-condition media queries
 * @output Proves the test runtime holds every rule StyleX generated under a
 *   multi-condition prelude, as the build does, through the runtime injection
 *   in internal/test-utils/src/stylexInject.ts
 * @position Testing; guards that test setup, which compensates StyleX 0.19.0's
 *   dev-runtime rule key
 */

import * as stylex from '@stylexjs/stylex';
import {expect, it} from 'vitest';

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
