// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchFieldFrames.test.tsx
 * @input Vitest, Testing Library, and each Core field on every surface a
 *   coarse pointer can show
 * @output Checks that each field marks the box a person sees around its
 *   entry, so the touch press check (utils/touchHitArea.ts) gives a tap on
 *   that box to the field (spec:AST-094 FR42)
 * @position Coverage of the field-frame mark across Core's fields; the press
 *   check's behavior on a marked box is in utils/touchHitArea.test.tsx
 */

import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {ChatComposer} from '../../Chat/ChatComposer';
import {DateInput} from '../../DateInput/DateInput';
import {DateRangeInput} from '../../DateRangeInput/DateRangeInput';
import {DateTimeInput} from '../../DateTimeInput/DateTimeInput';
import {PanelSearchInput} from '../../Field/PanelSearchInput';
import {FileInput} from '../../FileInput/FileInput';
import {NumberInput} from '../../NumberInput/NumberInput';
import {PowerSearch} from '../../PowerSearch/PowerSearch';
import {TextArea} from '../../TextArea/TextArea';
import {TextInput} from '../../TextInput/TextInput';
import {TimeInput} from '../../TimeInput/TimeInput';
import {Tokenizer} from '../../Tokenizer/Tokenizer';
import {Typeahead} from '../../Typeahead/Typeahead';

const MARK = '[data-astryx-field-frame]';
const noop = () => {};

const coarse = (media: string) =>
  ({
    media,
    matches: media.includes('pointer: coarse'),
    onchange: null,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation(coarse);
  // The touch sheets observe their size; jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', NoResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The number of marked boxes that hold an entry or forward a click. */
function markedBoxes(): number {
  return document.querySelectorAll(MARK).length;
}

const cases: ReadonlyArray<[string, () => ReactElement, number]> = [
  ['TextInput', () => <TextInput label="Name" value="" onChange={noop} />, 1],
  ['TextArea', () => <TextArea label="Notes" value="" onChange={noop} />, 1],
  [
    'NumberInput',
    () => <NumberInput label="Count" value={null} onChange={noop} />,
    1,
  ],
  [
    'DateInput, popover',
    () => <DateInput label="Date" presentation="popover" onChange={noop} />,
    1,
  ],
  [
    'DateInput, bottom sheet',
    () => (
      <DateInput label="Date" presentation="bottom-sheet" onChange={noop} />
    ),
    1,
  ],
  [
    'DateInput, native',
    () => <DateInput label="Date" presentation="native" onChange={noop} />,
    1,
  ],
  [
    'TimeInput, popover',
    () => <TimeInput label="Time" presentation="popover" onChange={noop} />,
    1,
  ],
  [
    'TimeInput, bottom sheet',
    () => (
      <TimeInput label="Time" presentation="bottom-sheet" onChange={noop} />
    ),
    1,
  ],
  [
    'TimeInput, native',
    () => <TimeInput label="Time" presentation="native" onChange={noop} />,
    1,
  ],
  [
    'DateTimeInput, popover (date and time parts)',
    () => (
      <DateTimeInput label="Starts" presentation="popover" onChange={noop} />
    ),
    2,
  ],
  [
    'DateTimeInput, bottom sheet (date and time parts)',
    () => (
      <DateTimeInput
        label="Starts"
        presentation="bottom-sheet"
        onChange={noop}
      />
    ),
    2,
  ],
  [
    'DateTimeInput, native (date and time parts)',
    () => (
      <DateTimeInput label="Starts" presentation="native" onChange={noop} />
    ),
    2,
  ],
  [
    'DateRangeInput',
    () => <DateRangeInput label="Range" value={null} onChange={noop} />,
    1,
  ],
  [
    'Typeahead',
    () => (
      <Typeahead
        label="Fruit"
        searchSource={{search: () => [], bootstrap: () => []}}
        value={null}
        onChange={noop}
      />
    ),
    1,
  ],
  [
    'Tokenizer',
    () => (
      <Tokenizer
        label="People"
        searchSource={{search: () => [], bootstrap: () => []}}
        value={[]}
        onChange={noop}
      />
    ),
    1,
  ],
  [
    'Tokenizer, sheet field',
    () => (
      <Tokenizer
        label="People"
        presentation="bottom-sheet"
        searchSource={{search: () => [], bootstrap: () => []}}
        value={[]}
        onChange={noop}
      />
    ),
    1,
  ],
  [
    'Tokenizer, unfocused-layer field',
    () => (
      <Tokenizer
        label="People"
        tokenOverflowBehavior="unfocusedLayer"
        searchSource={{search: () => [], bootstrap: () => []}}
        value={[]}
        onChange={noop}
      />
    ),
    1,
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
        onChange={noop}
      />
    ),
    1,
  ],
  [
    'PanelSearchInput, with its field box',
    () => (
      <PanelSearchInput
        label="Search"
        clearLabel="Clear"
        value=""
        onValueChange={noop}
        hasInputBox
      />
    ),
    1,
  ],
  ['ChatComposer', () => <ChatComposer onSubmit={noop} />, 1],
  [
    'FileInput (its drop zone forwards the tap)',
    () => <FileInput label="Resume" value={null} onChange={noop} />,
    1,
  ],
  [
    'A field’s description that focuses the field (FieldLabel)',
    () => (
      <TextInput
        label="Name"
        description="As on your passport"
        value=""
        onChange={noop}
      />
    ),
    2,
  ],
];

describe('the field-frame mark under a coarse pointer (spec:AST-094 FR42)', () => {
  it.each(cases)('%s marks its field box', (_name, element, count) => {
    render(element());
    expect(markedBoxes()).toBe(count);
  });

  it('marks no box on a PanelSearchInput without its field box', () => {
    render(
      <PanelSearchInput
        label="Search"
        clearLabel="Clear"
        value=""
        onValueChange={noop}
      />,
    );
    expect(markedBoxes()).toBe(0);
  });

  it('holds its entry inside each marked frame, or forwards its own click', () => {
    render(<TextInput label="Name" value="" onChange={noop} />);
    const entry = screen.getByRole('textbox', {name: 'Name'});
    expect(entry.closest(MARK)).not.toBeNull();
  });
});
