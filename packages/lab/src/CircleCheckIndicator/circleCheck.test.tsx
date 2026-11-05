// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file circleCheck.test.tsx
 * @input vitest, Testing Library, CircleCheckIndicator, its build-time
 *   mirror and its measured table (circleCheck.table.ts)
 * @output Holds the mirror to the table: the multiselect circle's geometry
 *   with the two derived xSmall values. Asserts what the circle ships. Its
 *   colour change takes the theme's duration token on every pointer and is
 *   immediate under Reduce Motion. Its diameter and stroke are UIKit's at
 *   each size.
 * @position Unit test beside circleCheck.stylex.ts. It renders the indicator
 *   alone: the stylesheet it reads is the one StyleX injects for this
 *   component.
 */

import {describe, expect, it} from 'vitest';
import {render} from '@testing-library/react';
import {circleCheckTable} from './circleCheck.table';
import {CircleCheckIndicator} from './CircleCheckIndicator';
import {circleCheckConsts} from './circleCheck.stylex';

const {large, xSmall} = circleCheckTable;

/**
 * Every declaration on `el`'s own classes, keyed by property, per enclosing
 * media and supports conditions (outermost first, " | "-joined; null at the
 * top level).
 */
function declarationsOf(el: Element): Map<string, Map<string | null, string>> {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const out = new Map<string, Map<string | null, string>>();
  const walk = (rules: CSSRuleList, conditions: string[]) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, [...conditions, rule.media.mediaText]);
      } else if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, [...conditions, rule.conditionText]);
      } else if (
        rule instanceof CSSStyleRule &&
        classes.some(cls => rule.selectorText.startsWith(cls))
      ) {
        const media = conditions.length === 0 ? null : conditions.join(' | ');
        for (const property of Array.from(rule.style)) {
          const byMedia = out.get(property) ?? new Map();
          byMedia.set(media, rule.style.getPropertyValue(property).trim());
          out.set(property, byMedia);
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, []);
  }
  return out;
}

/** A CSS length or duration as a number (px, or ms; `0s` is written so). */
function toNumber(value: string | undefined): number {
  if (value == null) {
    return Number.NaN;
  }
  if (value.endsWith('ms') || value.endsWith('px')) {
    return parseFloat(value);
  }
  return value.endsWith('s') ? parseFloat(value) * 1000 : parseFloat(value);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The Reduce Motion key that Core's indicators use. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

describe('circleCheckConsts mirror the constants table', () => {
  it('takes the circle at the Large text size for md', () => {
    expect(toNumber(circleCheckConsts.mdDiameter)).toBe(large.diameter);
    expect(toNumber(circleCheckConsts.mdStroke)).toBe(large.stroke);
    expect(toNumber(circleCheckConsts.mdCheckSize)).toBe(large.checkSize);
    expect(toNumber(circleCheckConsts.mdCheckStroke)).toBe(large.checkStroke);
    expect(toNumber(circleCheckConsts.mdCheckOffsetY)).toBe(large.checkOffsetY);
  });

  it('takes the circle at the xSmall text size for sm, deriving what was not measured there', () => {
    expect(toNumber(circleCheckConsts.smDiameter)).toBe(xSmall.diameter);
    expect(toNumber(circleCheckConsts.smStroke)).toBe(xSmall.stroke);
    expect(toNumber(circleCheckConsts.smCheckSize)).toBe(xSmall.checkSize);
    expect(toNumber(circleCheckConsts.smCheckStroke)).toBe(
      round2((large.checkStroke * xSmall.checkSize) / large.checkSize),
    );
    expect(toNumber(circleCheckConsts.smCheckOffsetY)).toBe(
      round2((large.checkOffsetY * xSmall.diameter) / large.diameter),
    );
  });
});

describe('CircleCheckIndicator ships the table', () => {
  function circle(size: 'sm' | 'md'): Element {
    render(<CircleCheckIndicator state="checked" size={size} />);
    const el = document.querySelector(
      `.astryx-circle-check-indicator[data-size="${size}"]`,
    );
    if (el == null) {
      throw new Error('no circle');
    }
    return el;
  }

  it('paints the touch press image only under a coarse pointer, so a held pen draws its press once', () => {
    // A pen on a fine-pointer page draws the mouse `:active` fill; the press
    // image as well would paint the press twice. CheckboxInput's own layer
    // gates its image the same way.
    const images = [
      ...(declarationsOf(circle('md')).get('background-image') ??
        new Map<string | null, string>()),
    ];
    expect(images.length).toBeGreaterThan(0);
    for (const [media, value] of images) {
      expect(media).toContain('(pointer: coarse)');
      expect(value).toContain('--_indicator-press-image');
    }
  });

  it("reads only the touch press image a CheckboxInput row hands down, so a mapped menu row's own press paints once", () => {
    const images = [
      ...(declarationsOf(circle('md')).get('background-image') ??
        new Map<string | null, string>()),
    ];
    expect(images.length).toBeGreaterThan(0);
    for (const [, value] of images) {
      expect(value).not.toContain('--_press-paint-image');
    }
  });

  it('fades over the theme’s duration on every pointer and changes at once under Reduce Motion', () => {
    const durations = [
      ...(declarationsOf(circle('md')).get('transition-duration') ??
        new Map<string | null, string>()),
    ];
    // No pointer gets a timing of its own.
    expect(durations.filter(([media]) => media?.includes('pointer'))).toEqual(
      [],
    );
    const byMedia = new Map(durations);
    expect(byMedia.get(null)).toMatch(/^var\(--duration-fast/);
    expect(byMedia.get(REDUCED_MOTION)).toBe('0s');
  });

  it.each([
    ['md', large],
    ['sm', xSmall],
  ] as const)(
    'draws the %s circle at UIKit’s diameter and stroke',
    (size, row) => {
      const declared = declarationsOf(circle(size));
      expect(toNumber(declared.get('width')?.get(null))).toBe(row.diameter);
      expect(toNumber(declared.get('height')?.get(null))).toBe(row.diameter);
      // The ring is an inset shadow of this width (a border would snap to
      // whole device pixels).
      expect(toNumber(declared.get('--_circle-stroke')?.get(null))).toBe(
        row.stroke,
      );
    },
  );

  it('draws the empty ring as an inset shadow of the stroke, and the filled circle without one', () => {
    render(<CircleCheckIndicator state="unchecked" size="md" />);
    const empty = document.querySelector(
      '.astryx-circle-check-indicator:not([data-checked])',
    );
    if (empty == null) {
      throw new Error('no empty circle');
    }
    expect(declarationsOf(empty).get('box-shadow')?.get(null)).toMatch(
      /^inset 0 0 0 var\(--_circle-stroke\)/,
    );
    render(<CircleCheckIndicator state="checked" size="md" />);
    const filled = document.querySelector(
      '.astryx-circle-check-indicator[data-checked="checked"]',
    );
    if (filled == null) {
      throw new Error('no filled circle');
    }
    expect(declarationsOf(filled).get('box-shadow')?.get(null)).toBe('none');
  });
});
