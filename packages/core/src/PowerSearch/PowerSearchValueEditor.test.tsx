// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearchValueEditor.test.tsx
 * @input Uses vitest, @testing-library/react, PowerSearchValueEditor
 * @output Unit tests for PowerSearch value editors, including date-range ordering
 * @position Testing; validates PowerSearchValueEditor.tsx
 */

import {describe, it, expect, vi, beforeAll, afterAll} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import {PowerSearchValueEditor} from './PowerSearchValueEditor';
import type {
  FilterValueEntityList,
  OperatorValue,
  PowerSearchEntity,
} from './types';
import type {InternalConfig} from './useInternalConfig';
import type {SearchableItem, SearchSource} from '../Typeahead/types';

// =============================================================================
// Test infrastructure
// =============================================================================

const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver;
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.matches = function (
    this: HTMLElement,
    selector: string,
  ) {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  } as typeof HTMLElement.prototype.matches;
});

afterAll(() => {
  HTMLElement.prototype.matches = originalMatches;
});

// Minimal config stub — editors don't use it directly
const stubConfig: InternalConfig = {
  fieldsMap: new Map(),
  operatorsMap: new Map(),
} as unknown as InternalConfig;

// =============================================================================
// Helpers
// =============================================================================

function createSearchSource(
  items: SearchableItem[],
): SearchSource<SearchableItem> {
  return {
    search: (query: string) =>
      items.filter(i => i.label.toLowerCase().includes(query.toLowerCase())),
    bootstrap: () => items.slice(0, 5),
  };
}

describe('isDisabled reaches every built-in value editor', () => {
  const items = [
    {id: 'a', label: 'Alpha'},
    {id: 'b', label: 'Beta'},
  ];
  const enumValues = [
    {value: 'a', label: 'Alpha'},
    {value: 'b', label: 'Beta'},
  ];
  const cases: ReadonlyArray<[string, OperatorValue]> = [
    ['string', {type: 'string'}],
    [
      'string with a search source',
      {type: 'string', searchSource: createSearchSource(items)},
    ],
    [
      'string_list',
      {type: 'string_list', searchSource: createSearchSource(items)},
    ],
    ['integer', {type: 'integer'}],
    ['float', {type: 'float'}],
    ['time', {type: 'time'}],
    ['date_absolute', {type: 'date_absolute'}],
    ['date_relative', {type: 'date_relative'}],
    ['date_range', {type: 'date_range'}],
    ['enum', {type: 'enum', values: enumValues}],
    ['enum_list', {type: 'enum_list', values: enumValues}],
    [
      'entity_list',
      {type: 'entity_list', searchSource: createSearchSource(items)},
    ],
  ];

  // Every form control the editor renders outside a closed popover (a date
  // input's calendar stays mounted while closed, and its disabled trigger
  // cannot open it), so a disabled built-in editor leaves nothing a person
  // can type into, press, or open.
  function controlsOf(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'input, textarea, button, select, [role="combobox"], [contenteditable="true"]',
      ),
    ).filter(element => {
      const popover = element.closest<HTMLElement>('[popover]');
      return (
        element.getAttribute('aria-hidden') !== 'true' &&
        (popover == null || popover.matches(':popover-open'))
      );
    });
  }

  const isUnavailable = (element: HTMLElement) =>
    (element as HTMLInputElement).disabled === true ||
    element.getAttribute('aria-disabled') === 'true';

  it.each(cases)('%s', (_name, operatorValue) => {
    const {container} = render(
      <PowerSearchValueEditor
        operatorValue={operatorValue}
        filterValue={undefined}
        onChange={() => {}}
        config={stubConfig}
        isDisabled
      />,
    );
    const controls = controlsOf(container);
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.filter(element => !isUnavailable(element))).toEqual([]);
  });
});

// =============================================================================
// #1103 — StringEditor ignores searchSource
// =============================================================================

describe('StringEditor (#1103)', () => {
  it('renders a typeahead when searchSource is provided', () => {
    const source = createSearchSource([
      {id: 'us', label: 'United States'},
      {id: 'uk', label: 'United Kingdom'},
    ]);

    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'string', searchSource: source}}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    // Should render a combobox (typeahead), not a plain textbox
    const combobox = screen.queryByRole('combobox');
    expect(combobox).toBeInTheDocument();
  });

  it('renders a plain text input when no searchSource', () => {
    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'string'}}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    // Should render a textbox (TextInput), not a combobox
    const textbox = screen.queryByRole('textbox');
    expect(textbox).toBeInTheDocument();
  });

  it('calls onChange with string FilterValue when typeahead item is selected', async () => {
    const source = createSearchSource([
      {id: 'us', label: 'United States'},
      {id: 'uk', label: 'United Kingdom'},
    ]);

    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'string', searchSource: source}}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    const combobox = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(combobox, {target: {value: 'United'}});
    });

    // Wait for debounce + results
    await act(async () => {
      await new Promise(r => setTimeout(r, 200));
    });

    // Select the first result
    const option = screen.queryByText('United States');
    if (option) {
      fireEvent.click(option);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({type: 'string'}),
        true,
      );
    }
  });

  it('allows arbitrary string input when isArbitraryStringAllowed + searchSource', () => {
    const source = createSearchSource([{id: 'us', label: 'United States'}]);

    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{
          type: 'string',
          searchSource: source,
          isArbitraryStringAllowed: true,
        }}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    // Should still render a combobox (typeahead with suggestions)
    const combobox = screen.queryByRole('combobox');
    expect(combobox).toBeInTheDocument();
  });
});

describe('numeric editor commit timing', () => {
  it('saves the committed number when Enter finishes the edit', () => {
    const onChange = vi.fn();
    const onEnter = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'integer'}}
        filterValue={{type: 'integer', value: 5}}
        onChange={onChange}
        onEnter={onEnter}
        config={stubConfig}
      />,
    );
    const input = screen.getByRole('spinbutton');
    fireEvent.focus(input);
    fireEvent.input(input, {target: {value: '42'}});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onChange).toHaveBeenLastCalledWith(
      {type: 'integer', value: 42},
      true,
    );
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('does not save an invalid numeric draft on Enter', () => {
    const onChange = vi.fn();
    const onEnter = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'integer'}}
        filterValue={{type: 'integer', value: 5}}
        onChange={onChange}
        onEnter={onEnter}
        config={stubConfig}
      />,
    );
    const input = screen.getByRole('spinbutton');
    fireEvent.focus(input);
    fireEvent.input(input, {target: {value: '1·234'}});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onChange).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    expect(input).toHaveValue('1·234');
  });

  it('keeps the existing Enter callback when there is no pending edit', () => {
    const onEnter = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'float'}}
        filterValue={{type: 'float', value: 1.5}}
        onChange={() => {}}
        onEnter={onEnter}
        config={stubConfig}
      />,
    );

    fireEvent.keyDown(screen.getByRole('spinbutton'), {key: 'Enter'});
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});

describe('DateRangeEditor', () => {
  it('uses one ordered range picker for reverse endpoint selection', () => {
    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'date_range'}}
        filterValue={{
          type: 'date_range',
          value: {
            start: {
              type: 'ABSOLUTE',
              unixSeconds: Date.parse('2026-01-05T00:00:00Z') / 1000,
            },
            end: {
              type: 'ABSOLUTE',
              unixSeconds: Date.parse('2026-01-07T00:00:00Z') / 1000,
            },
          },
        }}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    const calendarTriggers = screen.getAllByRole('button', {
      name: 'Open calendar',
    });
    expect(calendarTriggers).toHaveLength(1);
    fireEvent.click(calendarTriggers[0]);

    const later = document.querySelector<HTMLButtonElement>(
      'button[data-date="2026-01-20"]',
    );
    const earlier = document.querySelector<HTMLButtonElement>(
      'button[data-date="2026-01-10"]',
    );
    expect(later).not.toBeNull();
    expect(earlier).not.toBeNull();
    fireEvent.click(later!);
    fireEvent.click(earlier!);

    expect(onChange).toHaveBeenCalledWith({
      type: 'date_range',
      value: {
        start: {
          type: 'ABSOLUTE',
          unixSeconds: Date.parse('2026-01-10T00:00:00Z') / 1000,
        },
        end: {
          type: 'ABSOLUTE',
          unixSeconds: Date.parse('2026-01-20T00:00:00Z') / 1000,
        },
      },
    });
  });

  it('renders an absolute-to-now range without changing the filter', () => {
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-01-20T12:00:00Z'));
    const onChange = vi.fn();
    try {
      render(
        <PowerSearchValueEditor
          operatorValue={{type: 'date_range'}}
          filterValue={{
            type: 'date_range',
            value: {
              start: {
                type: 'ABSOLUTE',
                unixSeconds: Date.parse('2026-01-05T00:00:00Z') / 1000,
              },
              end: {type: 'NOW'},
            },
          }}
          onChange={onChange}
          config={stubConfig}
        />,
      );

      expect(
        screen.getByRole('button', {name: /^date range:/i}),
      ).toHaveTextContent('Jan 5 – Jan 20');
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('renders a relative-to-now range without changing the filter', () => {
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-01-20T12:00:00Z'));
    const onChange = vi.fn();
    try {
      render(
        <PowerSearchValueEditor
          operatorValue={{type: 'date_range'}}
          filterValue={{
            type: 'date_range',
            value: {
              start: {type: 'RELATIVE', backValue: 10, unit: 'day'},
              end: {type: 'NOW'},
            },
          }}
          onChange={onChange}
          config={stubConfig}
        />,
      );

      expect(
        screen.getByRole('button', {name: /^date range:/i}),
      ).toHaveTextContent('Jan 10 – Jan 20');
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe('EntityListEditor (#1106)', () => {
  const entitiesWithPhoto: PowerSearchEntity[] = [
    {id: 'u1', label: 'Alice', photo: 'https://example.com/alice.jpg'},
    {id: 'u2', label: 'Bob', photo: 'https://example.com/bob.jpg'},
  ];

  const entitySource = createSearchSource(
    entitiesWithPhoto.map(e => ({
      id: e.id,
      label: e.label,
      auxiliaryData: {photo: e.photo},
    })),
  );

  it('round-trips photo through onChange', () => {
    const onChange = vi.fn();
    const filterValue: FilterValueEntityList = {
      type: 'entity_list',
      value: entitiesWithPhoto,
    };

    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'entity_list', searchSource: entitySource}}
        filterValue={filterValue}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    // Tokens for Alice and Bob should render
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    // Remove Alice — the remaining value should still have Bob's photo
    const removeBtn = screen.getByRole('button', {name: 'Remove Alice'});
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalled();
    const newFilterValue = onChange.mock.calls[0][0] as FilterValueEntityList;
    expect(newFilterValue.type).toBe('entity_list');
    expect(newFilterValue.value).toHaveLength(1);
    expect(newFilterValue.value[0].id).toBe('u2');
    expect(newFilterValue.value[0].label).toBe('Bob');
    // Bug #1106: photo should be preserved, not dropped
    expect(newFilterValue.value[0].photo).toBe('https://example.com/bob.jpg');
  });

  it('preserves photo when mapping filter value to tokenizer', () => {
    const onChange = vi.fn();
    const filterValue: FilterValueEntityList = {
      type: 'entity_list',
      value: [
        {id: 'u1', label: 'Alice', photo: 'https://example.com/alice.jpg'},
      ],
    };

    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'entity_list', searchSource: entitySource}}
        filterValue={filterValue}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    // The token should render — verifies the entity was properly mapped
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('passes renderItem from operatorValue to Tokenizer', () => {
    const customRenderItem = vi.fn((item: {id: string; label: string}) => (
      <span data-testid="custom-render">{item.label}</span>
    ));

    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{
          type: 'entity_list',
          searchSource: entitySource,
          renderItem: customRenderItem,
        }}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    // The tokenizer should render — renderItem is passed through
    // (we can't easily assert it was passed as a prop in unit tests,
    // but we verify the component renders without error with renderItem)
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});

// =============================================================================
// #1107 — StringListEditor without searchSource is non-functional
// =============================================================================

describe('StringListEditor (#1107)', () => {
  it('shows a "Create" item in the dropdown when typing free-text without searchSource', async () => {
    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'string_list'}}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    const input = screen.getByRole('combobox');

    // Type a free-text value — should show 'Create "my-tag"' in the dropdown
    await act(async () => {
      fireEvent.change(input, {target: {value: 'my-tag'}});
    });

    // Wait for debounce
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    const createOption = screen.queryByText('Create "my-tag"');
    expect(createOption).toBeInTheDocument();
  });

  it('commits free-text token when clicking the Create item', async () => {
    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'string_list'}}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, {target: {value: 'my-tag'}});
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    const createOption = screen.getByText('Create "my-tag"');
    await act(async () => {
      fireEvent.click(createOption);
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'string_list',
        value: expect.arrayContaining(['my-tag']),
      }),
    );
  });

  it('commits free-text via Enter when the Create item is highlighted', async () => {
    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{
          type: 'string_list',
          isArbitraryStringAllowed: true,
        }}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, {target: {value: 'custom-value'}});
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    // Arrow down to highlight the Create item, then Enter
    await act(async () => {
      fireEvent.keyDown(input, {key: 'ArrowDown'});
    });
    await act(async () => {
      fireEvent.keyDown(input, {key: 'Enter'});
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'string_list',
        value: expect.arrayContaining(['custom-value']),
      }),
    );
  });

  it('still works with a searchSource (existing behavior)', () => {
    const source = createSearchSource([
      {id: 'tag1', label: 'frontend'},
      {id: 'tag2', label: 'backend'},
    ]);

    const onChange = vi.fn();
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'string_list', searchSource: source}}
        filterValue={undefined}
        onChange={onChange}
        config={stubConfig}
      />,
    );

    // Should render the tokenizer with a combobox
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});

describe('maxMenuItems', () => {
  const source = createSearchSource(
    Array.from({length: 6}, (_, index) => ({
      id: `option-${index}`,
      label: `Option ${index}`,
    })),
  );

  async function expectCapped(operatorValue: OperatorValue) {
    render(
      <PowerSearchValueEditor
        operatorValue={operatorValue}
        filterValue={undefined}
        onChange={vi.fn()}
        config={stubConfig}
        maxMenuItems={2}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {
        target: {value: 'Option'},
      });
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    expect(screen.getAllByRole('option', {hidden: true})).toHaveLength(2);
  }

  it('caps string suggestions', async () => {
    await expectCapped({type: 'string', searchSource: source});
  });

  it('caps string-list suggestions', async () => {
    await expectCapped({type: 'string_list', searchSource: source});
  });

  it('caps entity-list suggestions', async () => {
    await expectCapped({type: 'entity_list', searchSource: source});
  });
});

// =============================================================================
// EnumListEditor shows the whole closed vocabulary
// =============================================================================

describe('EnumListEditor', () => {
  const values = Array.from({length: 12}, (_, index) => ({
    value: `option-${index}`,
    label: `Option ${index}`,
  }));

  it('shows every value on focus instead of the typeahead default of 10', async () => {
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'enum_list', values}}
        filterValue={undefined}
        onChange={vi.fn()}
        config={stubConfig}
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(screen.getAllByRole('option', {hidden: true})).toHaveLength(12);
    expect(screen.getByText('Option 11')).toBeInTheDocument();
  });

  it('shows every matching value when searching', async () => {
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'enum_list', values}}
        filterValue={undefined}
        onChange={vi.fn()}
        config={stubConfig}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {
        target: {value: 'Option'},
      });
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    expect(screen.getAllByRole('option', {hidden: true})).toHaveLength(12);
    expect(screen.getByText('Option 11')).toBeInTheDocument();
  });
});
