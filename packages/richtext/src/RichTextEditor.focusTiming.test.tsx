// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.focusTiming.test.tsx
 * @input RichTextEditor, and the text field timing it shares with Core's text
 *   fields
 * @output Proof that the editor's field shows its focus look at once under a
 *   coarse pointer or reduced motion, and fades it under a fine pointer
 * @position Unit test for RichTextEditor's use of
 *   `inputWrapperStyles.textField`
 */

import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import * as stylex from '@stylexjs/stylex';
import {inputWrapperStyles} from '@astryxdesign/core/Field';
import {RichTextEditor} from './RichTextEditor';

afterEach(() => {
  cleanup();
});

/** Every `transition-duration` declared for the element's own classes. */
function durationsOf(element: Element) {
  const classes = Array.from(element.classList, name => `.${name}`);
  const out: Array<{condition: string; value: string}> = [];
  const visit = (rules: CSSRuleList, condition: string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const value = rule.style.getPropertyValue('transition-duration');
        if (value && classes.some(cls => rule.selectorText.startsWith(cls))) {
          out.push({condition, value: value.trim()});
        }
        continue;
      }
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested != null) {
        const own = (rule as CSSConditionRule).conditionText ?? '';
        visit(nested, [condition, own].filter(Boolean).join(' and '));
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    visit(sheet.cssRules, '');
  }
  return out;
}

describe('RichTextEditor focus timing', () => {
  it('shows its focus look at once under a coarse pointer or reduced motion, and fades it under a fine pointer', () => {
    const {container} = render(<RichTextEditor label="Notes" />);
    const textField = (
      stylex.props(inputWrapperStyles.textField).className ?? ''
    ).split(/\s+/);
    const wrappers = Array.from(
      container.querySelectorAll<HTMLElement>('*'),
    ).filter(element =>
      textField.every(name => element.classList.contains(name)),
    );
    expect(wrappers).toHaveLength(1);
    const durations = durationsOf(wrappers[0]);
    const values = (match: (condition: string) => boolean) => [
      ...new Set(durations.filter(d => match(d.condition)).map(d => d.value)),
    ];
    expect(values(condition => condition.includes('pointer: coarse'))).toEqual([
      '0s',
    ]);
    expect(
      values(condition => condition.includes('prefers-reduced-motion')),
    ).toEqual(['0s']);
    const fine = values(condition => condition === '');
    expect(fine).toHaveLength(1);
    expect(fine[0]).not.toBe('0s');
  });
});
