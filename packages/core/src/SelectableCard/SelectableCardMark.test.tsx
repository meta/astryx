// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardMark.test.tsx
 * @input vitest, Testing Library, SelectableCard and the UIKit constants
 *   table (motion/uikit/selection.ts)
 * @output Asserts the card's selection mark, its inset ring and its border.
 *   Under a finger (a coarse primary pointer) it changes on the table's one
 *   frame. With a mouse it keeps the theme's duration token, and under Reduce
 *   Motion it is immediate.
 * @position Unit test of SelectableCard's touch mark timing; the real-engine
 *   proof is __tests__/SelectableCardMark.interaction.browser.spec.ts
 */

import {describe, expect, it} from 'vitest';
import {render} from '@testing-library/react';
import {selection} from '../motion/uikit/selection';
import {SelectableCard} from './SelectableCard';

/**
 * The `transition-duration` each condition declares on `el`, keyed by its
 * enclosing media and supports conditions (outermost first, " | "-joined).
 */
function durationsOf(el: Element): Map<string | null, string> {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const durations = new Map<string | null, string>();
  const walk = (rules: CSSRuleList, conditions: string[]) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, [...conditions, rule.media.mediaText]);
      } else if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, [...conditions, rule.conditionText]);
      } else if (
        rule instanceof CSSStyleRule &&
        // The card itself, not its press layer (`::after`).
        !rule.selectorText.includes('::') &&
        classes.some(cls => rule.selectorText.startsWith(cls))
      ) {
        const match = /transition-duration:\s*([^;]+)/.exec(rule.style.cssText);
        if (match) {
          durations.set(
            conditions.length === 0 ? null : conditions.join(' | '),
            match[1].trim(),
          );
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, []);
  }
  return durations;
}

/** The instant key of the Reduce Motion policy (motion/reducedMotion.ts). */
const REDUCED_MOTION_INSTANT =
  '(prefers-reduced-motion: reduce) and (not (pointer: coarse))';

describe('SelectableCard selection mark', () => {
  it('changes its ring and border in one frame under a finger, keeps the theme’s duration with a mouse, and changes at once with a mouse under Reduce Motion', () => {
    const {container} = render(
      <SelectableCard label="Pro plan" isSelected onChange={() => {}}>
        Pro
      </SelectableCard>,
    );
    const card = container.querySelector('.astryx-selectable-card');
    if (card == null) {
      throw new Error('the card rendered no root');
    }
    const durations = [...durationsOf(card)];
    // TOUCH_QUERY with no platform gate (StyleX keeps it exclusive of the
    // later reduced-motion key, which still leaves every coarse pointer).
    const touch = durations.filter(
      ([media]) =>
        media != null &&
        media !== REDUCED_MOTION_INSTANT &&
        media.includes('(pointer: coarse)'),
    );
    expect(touch.map(([, value]) => value)).toEqual([
      `${selection.mark.changeMs}ms`,
    ]);
    expect(
      durations.filter(([media]) => media?.includes('-webkit-touch-callout')),
    ).toEqual([]);
    expect(new Map(durations).get(null)).toMatch(/^var\(--duration-fast/);
    // design:reduced-motion DR3, in the instant key the policy spells.
    expect(new Map(durations).get(REDUCED_MOTION_INSTANT)).toBe('0s');
  });
});
