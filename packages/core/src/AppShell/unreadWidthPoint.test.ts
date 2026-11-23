// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file unreadWidthPoint.test.ts
 * @input UNREAD_STYLES, DEFAULT_WIDTH_BREAKPOINTS and the rules the StyleX
 *   dev runtime injects in tests
 * @output Checks that each standard width point's rules apply below that
 *   point's width in DEFAULT_WIDTH_BREAKPOINTS
 * @position Unit test beside unreadWidthPoint.ts. StyleX takes a media key
 *   there only as a literal, so this test ties each literal to the shared
 *   widths: a change to one without the other fails here.
 */

import * as stylex from '@stylexjs/stylex';
import {describe, expect, it} from 'vitest';
import {
  DEFAULT_WIDTH_BREAKPOINTS,
  type WidthBreakpointName,
} from '../theme/themeAdaptations';
import {UNREAD_STYLES} from './unreadWidthPoint';

const PARTS = ['sideNav', 'corner', 'topNavRegion'] as const;

/** The `@media` conditions of the injected rules for one compiled style. */
function mediaConditionsOf(style: stylex.StyleXStyles): string[] {
  const classes = (stylex.props(style).className ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const conditions: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSMediaRule)) {
        continue;
      }
      for (const inner of Array.from(rule.cssRules)) {
        if (
          inner instanceof CSSStyleRule &&
          classes.some(name => inner.selectorText.startsWith(name))
        ) {
          conditions.push(rule.media.mediaText);
        }
      }
    }
  }
  return conditions;
}

describe('the rules a shell uses before it reads the window', () => {
  it('has rules for each standard width point and no other', () => {
    expect(Object.keys(UNREAD_STYLES).sort()).toEqual(
      Object.keys(DEFAULT_WIDTH_BREAKPOINTS).sort(),
    );
  });

  it.each(
    Object.entries(DEFAULT_WIDTH_BREAKPOINTS) as [
      WidthBreakpointName,
      number,
    ][],
  )('applies the %s rules below %i px', (point, width) => {
    for (const part of PARTS) {
      expect(mediaConditionsOf(UNREAD_STYLES[point][part])).toEqual([
        `not all and (min-width: ${width}px)`,
      ]);
    }
  });
});
