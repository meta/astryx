// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionMotion.test.ts
 * @input vitest, the UIKit constants table (motion/uikit/selection.ts), the
 *   build-time mirror and the checkbox and radio indicators
 * @output Holds the mirror to the table, and asserts what each mark ships.
 *   Under a finger (a coarse primary pointer) its colour change takes the
 *   table's one frame. With a mouse it keeps the theme's duration token, and
 *   under Reduce Motion it is immediate.
 * @position Unit test beside Indicator/selectionMotion.stylex.ts; the
 *   real-engine proof (a tap's first frame, storyboard, busy main thread) is
 *   Indicator/__tests__/SelectionMarks.interaction.browser.spec.ts
 */

import {createElement} from 'react';
import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {selection} from '../motion/uikit/selection';
import {CheckboxIndicator} from './CheckboxIndicator';
import {RadioIndicator} from './RadioIndicator';
import {selectionMotionConsts} from './selectionMotion.stylex';

interface Declared {
  /** The enclosing at-rule conditions, outermost first, joined by " | ". */
  media: string | null;
  text: string;
}

/**
 * Every injected rule that names one of the element's classes, with the
 * media and supports conditions it sits in (null at the top level).
 */
function declaredFor(el: Element): Declared[] {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const out: Declared[] = [];
  const walk = (list: CSSRuleList, conditions: string[]) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, [...conditions, rule.media.mediaText]);
      } else if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, [...conditions, rule.conditionText]);
      } else if (rule instanceof CSSStyleRule) {
        if (classes.some(cls => rule.selectorText.startsWith(cls))) {
          out.push({
            media: conditions.length === 0 ? null : conditions.join(' | '),
            text: rule.style.cssText,
          });
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, []);
  }
  return out;
}

/** The `transition-duration` each media condition declares on `el`. */
function durationsOf(el: Element): Map<string | null, string> {
  const durations = new Map<string | null, string>();
  for (const {media, text} of declaredFor(el)) {
    const match = /transition-duration:\s*([^;]+)/.exec(text);
    if (match) {
      durations.set(media, match[1].trim());
    }
  }
  return durations;
}

describe('selection mark clock', () => {
  it('is the constants table’s mark change, mirrored for the stylesheet', () => {
    expect(selectionMotionConsts.markChangeMs).toBe(selection.mark.changeMs);
  });

  it('is one frame: UIKit never animates a selection mark', () => {
    expect(selection.mark.changeMs).toBe(0);
  });
});

type MarkState = 'checked' | 'unchecked';

/** The instant key of the Reduce Motion policy (motion/reducedMotion.ts). */
const REDUCED_MOTION_INSTANT =
  '(prefers-reduced-motion: reduce) and (not (pointer: coarse))';

describe.each<[string, (state: MarkState) => ReturnType<typeof createElement>]>(
  [
    [
      'CheckboxIndicator',
      state => createElement(CheckboxIndicator, {state, size: 'md'}),
    ],
    [
      'RadioIndicator',
      state => createElement(RadioIndicator, {state, size: 'md'}),
    ],
  ],
)('%s', (_name, element) => {
  function mark(state: MarkState): Element {
    const {container} = render(element(state));
    const root = container.firstElementChild;
    if (root == null) {
      throw new Error('the indicator rendered nothing');
    }
    return root;
  }

  it('changes its colour in one frame under a finger, on every touch device', () => {
    const durations = [...durationsOf(mark('checked'))];
    // TOUCH_QUERY with no platform gate. StyleX keeps the earlier media key
    // exclusive of the later reduced-motion one, which still leaves every
    // coarse pointer.
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
  });

  it('keeps the theme’s duration token with a mouse, and changes at once with a mouse under Reduce Motion', () => {
    const durations = durationsOf(mark('unchecked'));
    expect(durations.get(null)).toMatch(/^var\(--duration-fast/);
    // design:reduced-motion DR3, in the reduced-motion policy's instant key.
    expect(durations.get(REDUCED_MOTION_INSTANT)).toBe('0s');
  });
});
