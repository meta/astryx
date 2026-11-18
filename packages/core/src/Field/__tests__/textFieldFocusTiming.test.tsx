// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textFieldFocusTiming.test.tsx
 * @input Every text field: TextInput, TextArea, NumberInput, the date and time
 *   fields in each presentation, Tokenizer, Typeahead, PowerSearch,
 *   PanelSearchInput with its input box, and ChatComposer
 * @output Proof that each field's focus look has no fade under a coarse
 *   pointer, and keeps its fast fade under a fine pointer
 * @position Unit test for the text field timing in inputStyles.stylex.ts
 */

import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as stylex from '@stylexjs/stylex';
import type {ReactElement} from 'react';
import {inputWrapperStyles} from '../inputStyles.stylex';
import {PanelSearchInput} from '../PanelSearchInput';
import {TextInput} from '../../TextInput/TextInput';
import {TextArea} from '../../TextArea/TextArea';
import {NumberInput} from '../../NumberInput/NumberInput';
import {DateInput} from '../../DateInput/DateInput';
import {DateRangeInput} from '../../DateRangeInput/DateRangeInput';
import {DateTimeInput} from '../../DateTimeInput/DateTimeInput';
import {TimeInput} from '../../TimeInput/TimeInput';
import {Tokenizer} from '../../Tokenizer/Tokenizer';
import {Typeahead} from '../../Typeahead/Typeahead';
import type {SearchSource} from '../../Typeahead/types';
import {PowerSearch} from '../../PowerSearch/PowerSearch';
import {ChatComposer} from '../../Chat/ChatComposer';

// The sheet presentations measure their panes; jsdom has no ResizeObserver.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const source: SearchSource = {search: async () => [], bootstrap: () => []};

/** A `transition-duration` the page declares for an element, by condition. */
interface Duration {
  readonly condition: string;
  readonly value: string;
}

/** Every `transition-duration` declared for the element's own classes. */
function durationsOf(element: Element): Duration[] {
  const classes = Array.from(element.classList, name => `.${name}`);
  const out: Duration[] = [];
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

/** The distinct focus durations a field's wrapper declares, per condition. */
function timingOf(element: Element) {
  const durations = durationsOf(element);
  const distinct = (list: Duration[]) =>
    [...new Set(list.map(d => d.value))].join(', ');
  return {
    fine: distinct(durations.filter(d => d.condition === '')),
    coarse: distinct(
      durations.filter(d => d.condition.includes('pointer: coarse')),
    ),
    reducedMotion: distinct(
      durations.filter(d => d.condition.includes('prefers-reduced-motion')),
    ),
  };
}

const TEXT_FIELD_CLASSES = (
  stylex.props(inputWrapperStyles.textField).className ?? ''
).split(/\s+/);

/** The elements that carry the text field timing, in render order. */
function textFieldWrappers(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('*')).filter(
    element =>
      TEXT_FIELD_CLASSES.every(name => element.classList.contains(name)),
  );
}

const FIELDS: ReadonlyArray<readonly [string, () => ReactElement]> = [
  ['TextInput', () => <TextInput label="Name" value="" onChange={() => {}} />],
  [
    'TextArea',
    () => <TextArea label="Description" value="" onChange={() => {}} />,
  ],
  [
    'NumberInput',
    () => <NumberInput label="Quantity" value={null} onChange={() => {}} />,
  ],
  [
    'DateInput, popover',
    () => <DateInput label="Date" presentation="popover" onChange={() => {}} />,
  ],
  [
    'DateInput, bottom sheet',
    () => (
      <DateInput label="Date" presentation="bottom-sheet" onChange={() => {}} />
    ),
  ],
  [
    'DateInput, native',
    () => <DateInput label="Date" presentation="native" onChange={() => {}} />,
  ],
  [
    'DateRangeInput',
    () => <DateRangeInput label="Range" value={null} onChange={() => {}} />,
  ],
  [
    'DateTimeInput, popover',
    () => (
      <DateTimeInput
        label="Meeting time"
        presentation="popover"
        onChange={() => {}}
      />
    ),
  ],
  [
    'DateTimeInput, bottom sheet',
    () => (
      <DateTimeInput
        label="Meeting time"
        presentation="bottom-sheet"
        onChange={() => {}}
      />
    ),
  ],
  [
    'TimeInput, popover',
    () => <TimeInput label="Time" presentation="popover" onChange={() => {}} />,
  ],
  [
    'TimeInput, bottom sheet',
    () => (
      <TimeInput label="Time" presentation="bottom-sheet" onChange={() => {}} />
    ),
  ],
  [
    'Tokenizer',
    () => (
      <Tokenizer
        label="Members"
        searchSource={source}
        value={[]}
        onChange={() => {}}
      />
    ),
  ],
  [
    'Typeahead',
    () => (
      <Typeahead
        label="Assignee"
        searchSource={source}
        value={null}
        onChange={() => {}}
      />
    ),
  ],
  [
    'PowerSearch',
    () => (
      <PowerSearch
        config={{
          name: 'Search',
          fields: [
            {
              key: 'title',
              label: 'Title',
              defaultOperator: 'contains',
              operators: [
                {key: 'contains', label: 'contains', value: {type: 'string'}},
              ],
            },
          ],
        }}
        filters={[]}
        onChange={() => {}}
      />
    ),
  ],
  ['ChatComposer', () => <ChatComposer onSubmit={() => {}} />],
  [
    'PanelSearchInput with its input box',
    () => (
      <PanelSearchInput
        label="Search"
        clearLabel="Clear search"
        value=""
        onValueChange={() => {}}
        hasInputBox
      />
    ),
  ],
];

describe('text field focus timing', () => {
  it.each(FIELDS)(
    '%s shows its focus look at once under a coarse pointer or reduced motion, and fades it under a fine pointer',
    (_name, renderField) => {
      const {container} = render(renderField());
      const wrappers = textFieldWrappers(container);
      expect(wrappers.length).toBeGreaterThan(0);
      for (const wrapper of wrappers) {
        const timing = timingOf(wrapper);
        expect(timing.coarse).toBe('0s');
        expect(timing.reducedMotion).toBe('0s');
        expect(timing.fine).not.toBe('');
        expect(timing.fine).not.toBe('0s');
      }
    },
  );
});
