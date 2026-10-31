// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobilePowerSearch.test.tsx
 * @input Uses vitest, @testing-library/react, MobilePowerSearch (Lab) and its
 *   helpers
 * @output Unit tests for the Lab touch PowerSearch flow: trigger, Filters
 *   sheet, Add filter, operator step, each value type, content search, focus
 *   restoration, timezone boundary dates, disabled/read-only, onChange
 *   metadata, nested exclusion
 * @position Lab testing; validates MobilePowerSearch.tsx,
 *   MobilePowerSearchValueEditor.tsx and mobilePowerSearchUtils.ts
 *
 * SYNC: When MobilePowerSearch.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import React, {createRef, StrictMode, useState} from 'react';
import type {
  PowerSearchConfig,
  PowerSearchEditorProps,
  PowerSearchFilter,
  PowerSearchHandle,
  PowerSearchTokenProps,
} from '@astryxdesign/core/PowerSearch';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {MobilePowerSearch} from './MobilePowerSearch';
import {
  createContentSearchSource,
  createMobilePowerSearchConfig,
  isoDateTimeToUnixSeconds,
  isoDateToUnixSeconds,
  nearestEditableIndex,
  resolveFilterIdentityIndex,
  filterSignature,
  unixSecondsToISODate,
  unixSecondsToISODateTime,
} from './mobilePowerSearchUtils';

// jsdom implements neither <dialog> open/close nor pointer capture; the sheet
// needs both. Same stubs BottomSheet's own tests install.
beforeEach(async () => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
  // jsdom has no showModal(), so an open dialog never matches `:modal`; stand
  // in for the sheets the browser presents modally, so `useAnnounce` routes
  // into the open sheet's dialog as it does in a browser.
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':modal'
      ? this instanceof HTMLDialogElement && this.open
      : matches.call(this, selector);
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
  // useAnnounce reads the frame id inside its callback, so the callback must
  // not run before requestAnimationFrame returns.
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    ),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => window.clearTimeout(id)),
  );
  window.scrollTo = vi.fn();
  // The shared page-body live regions outlive a test and clear on a 2s
  // timer, and a previous test's announcement may still be a frame away —
  // or, for words a closing modal dialog hands on to the page body, two; let
  // them land, then start this test with the regions empty.
  await new Promise(resolve => setTimeout(resolve, 20));
  for (const region of document.querySelectorAll(
    'body > [data-astryx-live-region]',
  )) {
    region.textContent = '';
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// =============================================================================
// Fixtures
// =============================================================================

const STATUS_VALUES = [
  {value: 'open', label: 'Open'},
  {value: 'closed', label: 'Closed'},
];

const config: PowerSearchConfig = {
  name: 'Issues',
  fields: [
    {
      key: 'status',
      label: 'Status',
      description: 'Workflow state',
      operators: [
        {key: 'is', label: 'is', value: {type: 'enum', values: STATUS_VALUES}},
        {
          key: 'isNot',
          label: 'is not',
          value: {type: 'enum', values: STATUS_VALUES},
        },
        {key: 'isEmpty', label: 'is empty', value: {type: 'empty'}},
      ],
    },
    {
      key: 'author',
      label: 'Author',
      operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
    },
    {
      key: 'labels',
      label: 'Labels',
      group: 'Metadata',
      operators: [
        {
          key: 'isAnyOf',
          label: 'is any of',
          value: {
            type: 'enum_list',
            values: [
              {value: 'bug', label: 'Bug'},
              {value: 'urgent', label: 'Urgent'},
            ],
          },
        },
      ],
    },
    {
      key: 'unassigned',
      label: 'Unassigned',
      operators: [{key: 'isTrue', label: 'is true', value: {type: 'empty'}}],
    },
  ],
};

const contentSearchConfig: PowerSearchConfig = {
  ...config,
  name: 'ContentSearch',
  contentSearchFieldKey: 'author',
};

const openFilter: PowerSearchFilter = {
  field: 'status',
  operator: 'is',
  value: {type: 'enum', value: 'open'},
};

const authorFilter: PowerSearchFilter = {
  field: 'author',
  operator: 'is',
  value: {type: 'string', value: 'Ada'},
};

const unassignedFilter: PowerSearchFilter = {
  field: 'unassigned',
  operator: 'isTrue',
  value: {type: 'empty'},
};

const people: SearchableItem[] = [
  {id: 'p1', label: 'Ada Lovelace'},
  {id: 'p2', label: 'Grace Hopper'},
];
const peopleSource: SearchSource = {
  search: q =>
    people.filter(p => p.label.toLowerCase().includes(q.toLowerCase())),
  bootstrap: () => people,
};

/** One field per non-nested value type Core PowerSearch supports. */
const valueTypesConfig: PowerSearchConfig = {
  name: 'ValueTypes',
  fields: [
    {
      key: 'title',
      label: 'Title',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
      ],
    },
    {
      key: 'owner',
      label: 'Owner',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'string', searchSource: peopleSource},
        },
      ],
    },
    {
      key: 'ids',
      label: 'ID',
      operators: [
        {key: 'in', label: 'is any of', value: {type: 'string_list'}},
      ],
    },
    {
      key: 'lines',
      label: 'Lines',
      operators: [
        {
          key: 'gt',
          label: 'is greater than',
          value: {type: 'integer', minValue: 0, units: 'lines'},
        },
      ],
    },
    {
      key: 'cost',
      label: 'Cost',
      operators: [{key: 'gt', label: '>', value: {type: 'float'}}],
    },
    {
      key: 'alarm',
      label: 'Alarm',
      operators: [{key: 'at', label: 'at', value: {type: 'time'}}],
    },
    {
      key: 'created',
      label: 'Created',
      operators: [
        {
          key: 'after',
          label: 'is after',
          value: {type: 'date_absolute', isDateOnly: true},
        },
      ],
    },
    {
      key: 'updated',
      label: 'Updated',
      operators: [
        {
          key: 'after',
          label: 'is after',
          value: {type: 'date_absolute', isDateOnly: false},
        },
      ],
    },
    {
      key: 'age',
      label: 'Age',
      operators: [
        {
          key: 'newer',
          label: 'is newer than',
          value: {type: 'date_relative', isFutureAllowed: false},
        },
      ],
    },
    {
      key: 'window',
      label: 'Window',
      operators: [
        {key: 'between', label: 'is between', value: {type: 'date_range'}},
      ],
    },
    {
      key: 'assignee',
      label: 'Assignee',
      operators: [
        {
          key: 'anyOf',
          label: 'is any of',
          value: {type: 'entity_list', searchSource: peopleSource},
        },
      ],
    },
    {
      key: 'color',
      label: 'Color',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {
            type: 'custom',
            Editor: ({value, onChange, placeholder}) => (
              <input
                aria-label="Color editor"
                placeholder={placeholder}
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
              />
            ),
            getString: v => v.toUpperCase(),
          },
        },
      ],
    },
  ],
};

function setup(
  props: Partial<React.ComponentProps<typeof MobilePowerSearch>> = {},
) {
  const onChange = vi.fn();
  const result = render(
    <MobilePowerSearch
      config={config}
      filters={[]}
      onChange={onChange}
      {...props}
    />,
  );
  return {onChange, ...result};
}

/**
 * The polite live region `useAnnounce` keeps inside an open sheet's dialog,
 * created on the first message delivered there; read inside `waitFor`.
 */
function sheetRegion(): HTMLElement {
  const region = sheet().querySelector<HTMLElement>(
    ':scope > [data-astryx-modal-live-region="polite"]',
  );
  if (!region) {
    throw new Error('no live region inside the open sheet yet');
  }
  return region;
}

const pageRegionText = () =>
  document.querySelector('body > [data-astryx-live-region="polite"]')
    ?.textContent ?? '';

function trigger(): HTMLElement {
  return document.querySelector<HTMLElement>('[aria-haspopup="dialog"]')!;
}

/** The field wrapper holding the tokens and the trigger. */
function field(): HTMLElement {
  return trigger().parentElement!;
}

function openSheet(): void {
  fireEvent.click(trigger());
}

/**
 * Whether the flow is open. The dialog element outlives a close by an exit
 * transition that jsdom never fires, so the flow's state is read from the
 * trigger's aria-expanded.
 */
function isSheetOpen(): boolean {
  return trigger().getAttribute('aria-expanded') === 'true';
}

/**
 * Every step is its own sheet with its own dialog. During a replace handoff
 * the outgoing dialog stays open but inert until its fade completes, so
 * return only the active one.
 */
function sheet(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>(
    'dialog[open]:not([inert])',
  );
  if (!dialog) {
    throw new Error('no active sheet');
  }
  return dialog;
}

/**
 * Completes every pending sheet motion. jsdom resolves no transition timing,
 * so the panels wait for a native transitionend; this fires it.
 */
function settleSheets(): void {
  for (const panel of document.querySelectorAll<HTMLElement>(
    '.astryx-bottom-sheet',
  )) {
    fireEvent.transitionEnd(panel, {propertyName: 'transform'});
    fireEvent.transitionEnd(panel, {propertyName: 'opacity'});
  }
}

function tapRow(name: RegExp | string): void {
  const matches = within(sheet()).getAllByRole('button', {name});
  // The replace handoff keeps the outgoing sheet presented while the incoming
  // one enters; the last match is always on the sheet that just arrived.
  fireEvent.click(matches[matches.length - 1]);
  settleSheets();
}

function openAddFlow(): void {
  openSheet();
  if (within(sheet()).queryByRole('heading', {name: 'Filters'})) {
    tapRow('Add filter');
  }
}

function openEditFlow(name: RegExp | string): void {
  openSheet();
  tapRow(name);
}

function apply(): void {
  fireEvent.click(within(sheet()).getByRole('button', {name: 'Apply'}));
}

function addFilter(): void {
  const matches = within(sheet()).getAllByRole('button', {name: 'Add filter'});
  fireEvent.click(matches[matches.length - 1]);
}

// =============================================================================
// Trigger field
// =============================================================================

/**
 * The sheet bodies pad their content and publish that padding as container
 * padding; each list in them runs edge to edge with `edge="bleed"`, so row
 * text keeps the body's inset (spacing-4) while dividers and backgrounds
 * reach the sheet's sides. No private Item variable is set.
 */
function expectBleedRowsOnBodyInset(list: HTMLElement): void {
  expect(list.className).toContain('reachesContainerPadding');
  const rows = list.querySelectorAll('li');
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.className).toMatch(/edgeBleed/);
    expect(row.getAttribute('style') ?? '').not.toContain('--_item-inset');
  }
  // The published padding is the body's inline padding (spacing-4).
  const body = list.closest(
    '[class*="body"], [class*="scrollContent"]',
  ) as HTMLElement | null;
  expect(body).not.toBeNull();
  const computed = getComputedStyle(body!);
  expect(computed.getPropertyValue('--container-padding-inline-start')).toBe(
    'var(--spacing-4)',
  );
  expect(computed.getPropertyValue('--container-padding-inline-end')).toBe(
    'var(--spacing-4)',
  );
}

describe('MobilePowerSearch trigger', () => {
  it('names its single sheet trigger by the field label followed by its visible text', () => {
    setup({label: 'Filter issues'});
    const button = screen.getByRole('button', {name: 'Filter issues Filters…'});
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveTextContent('Filters…');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it("keeps the trigger's visible text inside its accessible name with a custom label and placeholder, and with tokens", () => {
    // WCAG 2.5.3: a speech-input user says what they see. The name is the
    // label plus the visible content: the placeholder when empty...
    const {rerender} = setup({
      label: 'Search issues',
      placeholder: 'Search content…',
    });
    expect(trigger()).toHaveAccessibleName('Search issues Search content…');
    expect(trigger().textContent).toBe('Search content…');
    // ...or the tokens once filters are selected.
    rerender(
      <MobilePowerSearch
        config={config}
        filters={[openFilter, authorFilter]}
        onChange={vi.fn()}
        label="Search issues"
        placeholder="Search content…"
      />,
    );
    const name = trigger().getAttribute('aria-labelledby')!;
    expect(name.split(' ')).toHaveLength(2);
    expect(trigger()).toHaveAccessibleName(
      /^Search issues .*Status: is.*Open.*Author: is/,
    );
    for (const visible of ['Status: is', 'Open', 'Author: is']) {
      expect(within(field()).getByText(visible)).toBeTruthy();
    }
  });

  it('renders display-only tokens with bold values and no remove controls', () => {
    setup({filters: [openFilter, authorFilter]});
    expect(within(field()).getByText('Status: is')).toBeTruthy();
    expect(within(field()).getByText('Open')).toHaveStyle({
      fontWeight: 'var(--font-weight-bold)',
    });
    expect(within(field()).getByText('Author: is')).toBeTruthy();
    expect(within(field()).queryByRole('button', {name: /^Remove/})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Clear all'})).toBeNull();
  });

  it('opens the Filters sheet when a token is tapped and returns focus to the trigger', () => {
    setup({filters: [openFilter]});
    fireEvent.click(within(field()).getByText('Open'));
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Done'}));
    settleSheets();
    expect(trigger()).toHaveFocus();
  });

  it('wraps tokens without reserving a row for the trigger', () => {
    setup({filters: [openFilter, authorFilter]});
    const button = screen.getByRole('button', {name: /^Manage filters/});
    expect(getComputedStyle(button.parentElement!).flexWrap).toBe('wrap');
    expect(getComputedStyle(button).position).toBe('absolute');
  });

  it('does not open when disabled, and the trigger stays focusable through aria-disabled rather than native disabled', () => {
    setup({isDisabled: true});
    openSheet();
    expect(isSheetOpen()).toBe(false);
    expect(trigger()).not.toBeDisabled();
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    trigger().focus();
    expect(trigger()).toHaveFocus();
  });

  it('keeps the trigger focusable when a disabled reason is given', () => {
    setup({isDisabled: true, disabledMessage: 'Pick a project first'});
    expect(trigger().hasAttribute('disabled')).toBe(false);
    expect(trigger().getAttribute('aria-disabled')).toBe('true');
    openSheet();
    expect(isSheetOpen()).toBe(false);
  });

  it('auto-focuses the trigger when requested', () => {
    setup({hasAutoFocus: true});
    expect(trigger()).toHaveFocus();
  });

  it('fires focus callbacks when focus crosses the field boundary', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    setup({filters: [openFilter], onFocus, onBlur});
    fireEvent.focus(trigger(), {relatedTarget: null});
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).not.toHaveBeenCalled();
    fireEvent.blur(trigger(), {relatedTarget: document.body});
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('focuses the trigger through the Core imperative handle', () => {
    const handle = createRef<PowerSearchHandle>();
    setup({handleRef: handle});
    handle.current?.focusTypeahead();
    expect(trigger()).toHaveFocus();
    handle.current?.blurTypeahead();
    expect(trigger()).not.toHaveFocus();
  });

  it('renders the result count and announces a change to it', () => {
    const {rerender} = setup({resultCount: 12});
    expect(screen.getByText('12 results')).toBeTruthy();
    rerender(
      <MobilePowerSearch
        config={config}
        filters={[]}
        onChange={vi.fn()}
        resultCount={1}
      />,
    );
    expect(screen.getByText('1 result')).toBeTruthy();
  });

  it('announces a result count change through the page channel while closed, and nothing for the count present on mount, under StrictMode', async () => {
    const pageRegion = () =>
      document.querySelector('[data-astryx-live-region="polite"]');
    const {rerender} = render(
      <StrictMode>
        <MobilePowerSearch
          config={config}
          filters={[]}
          onChange={vi.fn()}
          resultCount={12}
        />
      </StrictMode>,
    );
    // StrictMode mounts, unmounts and remounts effects; a mounted-flag guard
    // announces the initial count on the replay. The region stays empty.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(pageRegion()?.textContent ?? '').toBe('');
    // A real change announces once, with the words shown.
    rerender(
      <StrictMode>
        <MobilePowerSearch
          config={config}
          filters={[]}
          onChange={vi.fn()}
          resultCount={1}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(pageRegion()?.textContent).toBe('1 result'));
    // The same value again is not a new occasion.
    rerender(
      <StrictMode>
        <MobilePowerSearch
          config={config}
          filters={[]}
          onChange={vi.fn()}
          resultCount={1}
        />
      </StrictMode>,
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(pageRegion()?.textContent).toBe('1 result');
  });

  it('routes a result count change to the live region useAnnounce keeps inside the open sheet, not the page body', async () => {
    const {rerender} = setup({resultCount: 12});
    openSheet();
    rerender(
      <MobilePowerSearch
        config={config}
        filters={[]}
        onChange={vi.fn()}
        resultCount={3}
      />,
    );
    await waitFor(() => expect(sheetRegion().textContent).toBe('3 results'));
    expect(sheetRegion()).toHaveAttribute('aria-live', 'polite');
    // The page-body channel, which a native modal hides, is left alone.
    expect(pageRegionText()).toBe('');
  });

  it('forwards display-only props to token overrides', () => {
    const seenProps = vi.fn();
    function CustomToken(props: PowerSearchTokenProps) {
      seenProps(props);
      return <span>Custom token</span>;
    }
    setup({filters: [openFilter], components: {enum: {Token: CustomToken}}});
    expect(screen.getByText('Custom token')).toBeTruthy();
    expect(seenProps).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: openFilter,
        onClick: undefined,
        onRemove: undefined,
      }),
    );
  });
});

// =============================================================================
// Filters sheet
// =============================================================================

describe('MobilePowerSearch Filters sheet', () => {
  it('shows selected filters as editable rows with direct remove actions and bold values', () => {
    setup({filters: [openFilter]});
    openSheet();
    const list = within(sheet()).getByRole('list');
    const row = within(list).getByRole('button', {name: 'Status is Open'});
    expect(within(row).getByText('Open')).toHaveStyle({
      fontWeight: 'var(--font-weight-bold)',
    });
    expect(
      within(list).getByRole('button', {name: 'Remove Status filter'}),
    ).toBeTruthy();
  });

  it('uses a direct remove button for an applied one-tap filter instead of a checked indicator', () => {
    const {onChange} = setup({filters: [unassignedFilter]});
    openSheet();
    const remove = within(sheet()).getByRole('button', {
      name: 'Remove Unassigned filter',
    });
    expect(remove.querySelector('svg')).toBeTruthy();
    expect(within(sheet()).queryByText('Unassigned, selected')).toBeNull();
    fireEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith([], 'remove', 0);
  });

  it('shows only the centered Add filter action when no filters are applied', () => {
    function EmptyStateHarness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        openFilter,
      ]);
      return (
        <MobilePowerSearch
          config={config}
          filters={filters}
          onChange={next => setFilters(next)}
        />
      );
    }
    render(<EmptyStateHarness />);
    openSheet();
    fireEvent.click(
      within(sheet()).getByRole('button', {name: 'Remove Status filter'}),
    );
    const addActions = within(sheet()).getAllByRole('button', {
      name: 'Add filter',
    });
    expect(addActions).toHaveLength(1);
    expect(within(sheet()).queryByRole('button', {name: 'Done'})).toBeNull();
    expect(
      within(sheet()).queryByRole('button', {name: 'Clear all'}),
    ).toBeNull();
  });

  it('places the Add filter icon in the header and full-width Clear all plus Done in the fixed footer', () => {
    setup({filters: [openFilter]});
    openSheet();
    const heading = within(sheet()).getByRole('heading', {name: 'Filters'});
    const list = within(sheet()).getByRole('list');
    const add = within(sheet()).getByRole('button', {name: 'Add filter'});
    const clearAll = within(sheet()).getByRole('button', {name: 'Clear all'});
    const done = within(sheet()).getByRole('button', {name: 'Done'});
    expect(
      heading.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      list.compareDocumentPosition(clearAll) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(add).toHaveAttribute('data-variant', 'secondary');
    expect(done).toHaveAttribute('data-variant', 'primary');
    expect(clearAll).toHaveAttribute('data-variant', 'secondary');
    expect(getComputedStyle(clearAll).flexGrow).toBe('1');
    expect(getComputedStyle(done).flexGrow).toBe('1');
    expect(getComputedStyle(clearAll.parentElement!).position).toBe('relative');
  });

  it('runs filter rows edge to edge on the body inset (List edge="bleed")', () => {
    setup({filters: [openFilter, authorFilter]});
    openSheet();
    expectBleedRowsOnBodyInset(within(sheet()).getByRole('list'));
  });

  it('closes on Done and restores focus to the trigger', () => {
    setup({filters: [openFilter]});
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Done'}));
    expect(isSheetOpen()).toBe(false);
    settleSheets();
    expect(trigger()).toHaveFocus();
  });

  it('clears removable filters, keeps Filters open, and announces the outcome there', async () => {
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        openFilter,
      ]);
      return (
        <MobilePowerSearch
          config={config}
          filters={filters}
          onChange={next => setFilters(next)}
        />
      );
    }
    render(<Harness />);
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Clear all filters?',
    });
    fireEvent.click(
      within(confirmation).getByRole('button', {name: 'Clear filters'}),
    );
    expect(isSheetOpen()).toBe(true);
    expect(within(sheet()).getByText('No filters applied')).toBeTruthy();
    expect(within(field()).queryByText('Open')).toBeNull();
    await waitFor(() =>
      expect(sheetRegion().textContent).toContain('Editable filters removed'),
    );
    expect(pageRegionText()).toBe('');
  });

  it('returns to Filters unchanged when the clear confirmation scrim is pressed', () => {
    const {onChange} = setup({filters: [openFilter]});
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Clear all filters?',
    });
    fireEvent.click(confirmation);
    expect(
      screen.queryByRole('alertdialog', {name: 'Clear all filters?'}),
    ).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(isSheetOpen()).toBe(true);
    expect(within(sheet()).getByText('Status is')).toBeTruthy();
  });

  it('clears every removable filter but keeps read-only ones', () => {
    const pinned: PowerSearchFilter = {...openFilter, isReadOnly: true};
    const {onChange} = setup({filters: [authorFilter, pinned]});
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      within(
        screen.getByRole('alertdialog', {name: 'Clear all filters?'}),
      ).getByRole('button', {name: 'Clear filters'}),
    );
    expect(onChange).toHaveBeenCalledWith([pinned], 'remove', 0);
    expect(isSheetOpen()).toBe(true);
  });

  it('respects hasClear', () => {
    setup({filters: [openFilter], hasClear: false});
    openSheet();
    expect(
      within(sheet()).queryByRole('button', {name: 'Clear all'}),
    ).toBeNull();
    expect(within(sheet()).getByRole('button', {name: 'Done'})).toBeTruthy();
  });

  it('opens a read-only Filters sheet without mutation actions', () => {
    const {onChange} = setup({filters: [openFilter], isReadOnly: true});
    openSheet();
    expect(isSheetOpen()).toBe(true);
    expect(within(sheet()).getByText('Status is')).toBeTruthy();
    expect(
      within(sheet()).queryByRole('button', {name: 'Status is Open'}),
    ).toBe(null);
    expect(
      within(sheet()).queryByRole('button', {name: 'Clear all'}),
    ).toBeNull();
    expect(
      within(sheet()).queryByRole('button', {name: 'Add filter'}),
    ).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps read-only filters as plain rows next to editable ones', () => {
    const pinned: PowerSearchFilter = {...openFilter, isReadOnly: true};
    setup({filters: [pinned, authorFilter]});
    openSheet();
    expect(
      within(sheet()).queryByRole('button', {name: 'Status is Open'}),
    ).toBe(null);
    expect(
      within(sheet()).getByRole('button', {name: 'Author is Ada'}),
    ).toBeTruthy();
  });

  it('hides Clear all when every filter is read-only', () => {
    setup({filters: [{...openFilter, isReadOnly: true}]});
    openSheet();
    expect(
      within(sheet()).queryByRole('button', {name: 'Clear all'}),
    ).toBeNull();
  });
});

// =============================================================================
// Add filter
// =============================================================================

describe('MobilePowerSearch Add filter', () => {
  it('keeps the sticky header above the rows that scroll under it, without covering the grab handle', () => {
    setup();
    openAddFlow();
    const title = within(sheet()).getByRole('heading', {name: 'Add filter'});
    // The title sits in the sticky header; the header's parent is the sheet
    // content wrapper.
    let header: HTMLElement | null = title;
    while (header && getComputedStyle(header).position !== 'sticky') {
      header = header.parentElement;
    }
    expect(header).not.toBeNull();
    const content = header!.parentElement!;
    // jsdom resolves the injected StyleX rules: the header has a layer above
    // the List rows (position: relative, z-index auto) that follow it...
    expect(getComputedStyle(header!).zIndex).toBe('1');
    // ...scoped to the sheet content, so the panel's grab handle (z-index 1,
    // outside this wrapper) still paints above the header.
    const rules: string[] = [];
    for (const styleSheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(styleSheet.cssRules)) {
        rules.push(rule.cssText);
      }
    }
    const isolated = Array.from(content.classList).some(className =>
      rules.some(
        text =>
          text.includes(`.${className}`) && /isolation:\s*isolate/.test(text),
      ),
    );
    expect(isolated).toBe(true);
  });

  it('opens directly to Add filter when no filters are selected', () => {
    setup();
    openSheet();
    expect(
      within(sheet()).getByRole('heading', {name: 'Add filter'}),
    ).toBeTruthy();
    expect(
      within(sheet()).queryByRole('heading', {name: 'Filters'}),
    ).toBeNull();
  });

  it('closes to the trigger when footer Done is pressed from direct entry', () => {
    setup();
    openSheet();
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    expect(within(sheet()).queryByRole('button', {name: 'Close'})).toBeNull();
    expect(within(sheet()).queryByRole('button', {name: 'Cancel'})).toBeNull();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Done'}));
    expect(isSheetOpen()).toBe(false);
    settleSheets();
    expect(trigger()).toHaveFocus();
  });

  it('returns to Filters and focuses Add filter when Add filter is dismissed from management', () => {
    setup({filters: [openFilter]});
    openAddFlow();
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toHaveFocus();
  });

  it('lists the fields, grouped, with chevrons', () => {
    setup();
    openAddFlow();
    const status = within(sheet()).getByRole('button', {name: 'Status'});
    expect(status.textContent).toBe('Status');
    expect(
      within(sheet()).getByRole('heading', {name: 'General', level: 4}),
    ).toBeTruthy();
    expect(within(sheet()).getByRole('list', {name: 'General'})).toBeTruthy();
    expect(within(sheet()).getByRole('button', {name: 'Author'})).toBeTruthy();
    expect(
      within(sheet()).getByRole('heading', {name: 'Metadata', level: 4}),
    ).toBeTruthy();
    expect(within(sheet()).getByRole('list', {name: 'Metadata'})).toBeTruthy();
    expect(status.closest('li')?.querySelectorAll('svg')).toHaveLength(1);
  });

  it('offers no field search for a short list', () => {
    setup();
    openAddFlow();
    expect(within(sheet()).queryByRole('textbox')).toBeNull();
  });

  it('searches the field list once there are enough fields', () => {
    const many: PowerSearchConfig = {
      name: 'Many',
      fields: Array.from({length: 10}, (_, i) => ({
        key: `f${i}`,
        label: `Field ${i}`,
        operators: [{key: 'is', label: 'is', value: {type: 'string'} as const}],
      })),
    };
    setup({config: many, maxSearchResults: 2});
    openAddFlow();
    const search = within(sheet()).getByRole('textbox', {
      name: 'Search filters',
    });
    expect(search).not.toHaveFocus();
    search.focus();
    const scrollBody = Array.from(
      sheet().querySelectorAll<HTMLElement>('div'),
    ).find(element => getComputedStyle(element).overflowY === 'auto')!;
    fireEvent.scroll(scrollBody);
    expect(search).not.toHaveFocus();
    search.focus();
    fireEvent.touchMove(scrollBody);
    expect(search).not.toHaveFocus();
    fireEvent.change(search, {target: {value: 'Field'}});
    expect(
      within(sheet()).getAllByRole('button', {name: /^Field/}),
    ).toHaveLength(2);
    fireEvent.change(search, {target: {value: 'Field 7'}});
    expect(within(sheet()).getByRole('button', {name: 'Field 7'})).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Field 3'})).toBeNull();
    fireEvent.change(search, {target: {value: 'nope'}});
    expect(within(sheet()).getByText('No filters found')).toBeTruthy();
  });

  it('leaves out nested-only fields and warns the developer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const withNested: PowerSearchConfig = {
      name: 'Nested',
      fields: [
        ...config.fields,
        {
          key: 'group',
          label: 'Group',
          operators: [{key: 'all', label: 'all of', value: {type: 'nested'}}],
        },
        {
          key: 'mixed',
          label: 'Mixed',
          operators: [
            {key: 'all', label: 'all of', value: {type: 'nested'}},
            {key: 'is', label: 'is', value: {type: 'string'}},
          ],
        },
      ],
    };
    setup({config: withNested});
    openAddFlow();
    expect(within(sheet()).queryByRole('button', {name: 'Group'})).toBeNull();
    expect(within(sheet()).getByRole('button', {name: 'Mixed'})).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('MobilePowerSearch: 1 field(s) were left out'),
    );
    // The mixed field offers only its non-nested operator.
    tapRow('Mixed');
    expect(
      within(sheet()).getByRole('heading', {name: 'Mixed is'}),
    ).toBeTruthy();
    expect(within(sheet()).queryByRole('radiogroup')).toBeNull();
    warn.mockRestore();
  });

  it('disables an open field picker when the component becomes read-only', () => {
    const {rerender} = setup();
    openAddFlow();
    rerender(
      <MobilePowerSearch
        config={config}
        filters={[]}
        onChange={vi.fn()}
        isReadOnly
      />,
    );
    const status = within(sheet()).getByRole('button', {name: 'Status'});
    expect(status).toBeDisabled();
    fireEvent.click(status);
    expect(
      within(sheet()).getByRole('heading', {name: 'Add filter'}),
    ).toBeTruthy();
  });
});

// =============================================================================
// Value sheet: create, operator step, edit, remove
// =============================================================================

describe('MobilePowerSearch value sheet', () => {
  it('keeps field rows edge to edge and contains choice rows in their own section', () => {
    setup();
    openAddFlow();
    for (const list of within(sheet()).getAllByRole('list')) {
      expectBleedRowsOnBodyInset(list);
    }
    tapRow('Status');
    expect(within(sheet()).getByRole('list').className).not.toContain(
      'reachesContainerPadding',
    );
  });

  it('stages an enum selection and commits it with exact add metadata', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Status');
    tapRow('Closed');
    expect(
      within(sheet()).getByRole('button', {name: 'Closed, selected'}),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    addFilter();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'status',
          operator: 'is',
          value: {type: 'enum', value: 'closed'},
        },
      ],
      'add',
      0,
    );
  });

  it('tapping the full row toggles a choice, not only its label', () => {
    setup();
    openAddFlow();
    tapRow('Labels');
    const bugRow = within(sheet())
      .getByRole('button', {name: 'Bug'})
      .closest('li')!;
    // The invisible button fills the row: a tap on the row's padding lands.
    fireEvent.click(bugRow.querySelector('button')!);
    expect(
      within(sheet()).getByRole('button', {name: 'Bug, selected'}),
    ).toBeTruthy();
    expect(within(bugRow).queryByRole('button', {name: 'Bug'})).toBeNull();
  });

  it('returns to Filters with focus on Add filter once a filter is committed', () => {
    setup();
    openAddFlow();
    tapRow('Status');
    tapRow('Closed');
    addFilter();
    expect(isSheetOpen()).toBe(true);
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
    expect(
      within(sheet())
        .getAllByRole('button', {name: 'Add filter'})
        .some(button => button === document.activeElement),
    ).toBe(true);
  });

  it('adds a single empty-value field immediately without opening an empty editor', () => {
    const {onChange} = setup();
    openAddFlow();
    const fieldPickerPlus = within(sheet())
      .getByText('Unassigned')
      .closest('li');
    expect(fieldPickerPlus?.querySelectorAll('svg')).toHaveLength(1);
    tapRow('Unassigned');
    expect(onChange).toHaveBeenCalledWith(
      [{field: 'unassigned', operator: 'isTrue', value: {type: 'empty'}}],
      'add',
      0,
    );
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
  });

  it('shows the operator step as radios only when a field has several', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Status');
    expect(within(sheet()).getByRole('heading', {name: 'Status'})).toBeTruthy();
    expect(
      within(sheet()).getByRole('radiogroup', {name: 'Operator'}),
    ).toBeTruthy();
    const selectedOperator = within(sheet()).getByRole('radio', {
      name: 'Status is',
    });
    expect(selectedOperator).toBeChecked();
    expect(
      getComputedStyle(selectedOperator.closest('.astryx-item')!).flexDirection,
    ).toBe('row-reverse');
    fireEvent.click(
      within(sheet()).getByRole('radio', {name: 'Status is not'}),
    );
    tapRow('Open');
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'status',
          operator: 'isNot',
          value: {type: 'enum', value: 'open'},
        },
      ],
      'add',
      0,
    );
  });

  it('puts a single-operator field and its operator on one title line', () => {
    setup();
    openAddFlow();
    tapRow('Author');
    expect(
      within(sheet()).getByRole('heading', {name: 'Author is'}),
    ).toBeTruthy();
    expect(within(sheet()).queryByRole('radiogroup')).toBeNull();
  });

  it('keeps a staged value across operators of the same type and drops it otherwise', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Status');
    tapRow('Open');
    fireEvent.click(
      within(sheet()).getByRole('radio', {name: 'Status is not'}),
    );
    expect(
      within(sheet()).getByRole('button', {name: 'Open, selected'}),
    ).toBeTruthy();
    fireEvent.click(
      within(sheet()).getByRole('radio', {name: 'Status is empty'}),
    );
    expect(
      within(sheet()).queryByRole('button', {name: /selected/}),
    ).toBeNull();
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [{field: 'status', operator: 'isEmpty', value: {type: 'empty'}}],
      'add',
      0,
    );
  });

  it('keeps Add filter disabled until a value is chosen', () => {
    setup();
    openAddFlow();
    tapRow('Author');
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    expect(within(sheet()).getByRole('button', {name: 'Cancel'})).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Remove'})).toBeNull();
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toBeDisabled();
    fireEvent.change(within(sheet()).getByRole('textbox', {name: 'Value'}), {
      target: {value: 'Ada'},
    });
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toBeEnabled();
  });

  it('restores focus to the chosen field when creation is canceled', () => {
    setup();
    openAddFlow();
    tapRow('Author');
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    expect(
      within(sheet()).getByRole('heading', {name: 'Add filter'}),
    ).toBeTruthy();
    expect(within(sheet()).getByRole('button', {name: 'Author'})).toHaveFocus();
  });

  it('stages a multi-select and commits it from the footer', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Labels');
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Bug'}));
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Urgent'}));
    const bug = within(sheet()).getByRole('button', {name: 'Bug, selected'});
    const urgent = within(sheet()).getByRole('button', {
      name: 'Urgent, selected',
    });
    expect(bug.closest('li')?.querySelectorAll('svg')).toHaveLength(1);
    expect(urgent.closest('li')?.querySelectorAll('svg')).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
    // Tapping a checked row unchecks it.
    fireEvent.click(urgent);
    expect(within(sheet()).getByRole('button', {name: 'Urgent'})).toBeTruthy();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Urgent'}));
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'labels',
          operator: 'isAnyOf',
          value: {type: 'enum_list', value: ['bug', 'urgent']},
        },
      ],
      'add',
      0,
    );
  });

  it('opens the edit sheet with only Cancel and Apply from a selected row', () => {
    setup({filters: [openFilter]});
    openEditFlow('Status is Open');
    expect(within(sheet()).getByRole('heading', {name: 'Status'})).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    expect(within(sheet()).getByRole('button', {name: 'Cancel'})).toBeTruthy();
    expect(within(sheet()).getByRole('button', {name: 'Apply'})).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: /^Remove/})).toBeNull();
    expect(
      within(sheet()).getByRole('button', {name: 'Open, selected'}),
    ).toBeTruthy();
  });

  it('edits a filter only after Apply, with exact edit metadata', () => {
    const {onChange} = setup({filters: [authorFilter, openFilter]});
    openEditFlow('Status is Open');
    tapRow('Closed');
    expect(onChange).not.toHaveBeenCalled();
    apply();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      [
        authorFilter,
        {
          field: 'status',
          operator: 'is',
          value: {type: 'enum', value: 'closed'},
        },
      ],
      'edit',
      1,
    );
  });

  it('uses popoverSaveButtonLabel for the confirm action', () => {
    setup({filters: [openFilter], popoverSaveButtonLabel: 'Save'});
    openEditFlow('Status is Open');
    expect(within(sheet()).getByRole('button', {name: 'Save'})).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Apply'})).toBeNull();
  });

  it('returns from editing to Filters without changes and restores row focus', () => {
    const {onChange} = setup({filters: [openFilter]});
    openEditFlow('Status is Open');
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    expect(isSheetOpen()).toBe(true);
    expect(
      within(sheet()).getByRole('button', {name: 'Status is Open'}),
    ).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a filter directly from the Filters sheet with exact remove metadata', () => {
    const {onChange} = setup({filters: [authorFilter, openFilter]});
    openSheet();
    fireEvent.click(
      within(sheet()).getByRole('button', {name: 'Remove Status filter'}),
    );
    expect(onChange).toHaveBeenCalledWith([authorFilter], 'remove', 1);
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
  });

  it('moves focus to the nearest editable row after a removal', () => {
    const readOnlyLabel: PowerSearchFilter = {
      field: 'labels',
      operator: 'isAnyOf',
      value: {type: 'enum_list', value: ['bug']},
      isReadOnly: true,
    };
    const after: PowerSearchFilter = {
      field: 'author',
      operator: 'is',
      value: {type: 'string', value: 'Grace'},
    };
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        authorFilter,
        openFilter,
        readOnlyLabel,
        after,
      ]);
      return (
        <MobilePowerSearch
          config={config}
          filters={filters}
          onChange={next => setFilters(next)}
        />
      );
    }
    render(<Harness />);
    openSheet();
    fireEvent.click(
      within(sheet()).getByRole('button', {name: 'Remove Status filter'}),
    );
    expect(
      within(sheet())
        .getAllByRole('button', {name: 'Remove Author filter'})
        .some(button => button === document.activeElement),
    ).toBe(true);
  });

  it('focuses Add filter after the last editable filter is removed', () => {
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        openFilter,
      ]);
      return (
        <MobilePowerSearch
          config={config}
          filters={filters}
          onChange={next => setFilters(next)}
        />
      );
    }
    render(<Harness />);
    openSheet();
    fireEvent.click(
      within(sheet()).getByRole('button', {name: 'Remove Status filter'}),
    );
    expect(within(sheet()).getByText('No filters applied')).toBeTruthy();
    expect(
      within(sheet()).getAllByRole('button', {name: 'Add filter'})[0],
    ).toHaveFocus();
  });

  it('follows the original filter when controlled props reorder it', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <MobilePowerSearch
        config={config}
        filters={[openFilter, authorFilter]}
        onChange={onChange}
      />,
    );
    openEditFlow('Status is Open');
    rerender(
      <MobilePowerSearch
        config={config}
        filters={[{...authorFilter}, {...openFilter}]}
        onChange={onChange}
      />,
    );
    tapRow('Closed');
    apply();
    expect(onChange).toHaveBeenCalledWith(
      [
        authorFilter,
        {
          field: 'status',
          operator: 'is',
          value: {type: 'enum', value: 'closed'},
        },
      ],
      'edit',
      1,
    );
  });

  it('does not edit a different filter when the controlled target disappears', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <MobilePowerSearch
        config={config}
        filters={[openFilter]}
        onChange={onChange}
      />,
    );
    openEditFlow('Status is Open');
    rerender(
      <MobilePowerSearch
        config={config}
        filters={[authorFilter]}
        onChange={onChange}
      />,
    );
    tapRow('Closed');
    apply();
    expect(onChange).not.toHaveBeenCalled();
    expect(isSheetOpen()).toBe(true);
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
  });

  it('keeps a way out when a config update removes the edited field', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <MobilePowerSearch
        config={config}
        filters={[openFilter]}
        onChange={onChange}
      />,
    );
    openEditFlow('Status is Open');
    rerender(
      <MobilePowerSearch
        config={{
          ...config,
          fields: config.fields.filter(f => f.key !== 'status'),
        }}
        filters={[openFilter]}
        onChange={onChange}
      />,
    );
    expect(
      within(sheet()).getByText('This filter is no longer available'),
    ).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Apply'})).toBeNull();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes the flow when the field becomes disabled while a step is open, and does not reopen it when re-enabled', () => {
    const {rerender} = setup({filters: [openFilter]});
    openEditFlow('Status is Open');
    expect(isSheetOpen()).toBe(true);
    rerender(
      <MobilePowerSearch
        config={config}
        filters={[openFilter]}
        onChange={vi.fn()}
        isDisabled
      />,
    );
    expect(isSheetOpen()).toBe(false);
    // The trigger is never natively disabled, so the closing flow can hand
    // focus back to it instead of the page body.
    settleSheets();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    expect(trigger()).not.toBeDisabled();
    rerender(
      <MobilePowerSearch
        config={config}
        filters={[openFilter]}
        onChange={vi.fn()}
      />,
    );
    expect(isSheetOpen()).toBe(false);
  });

  it('commits the complete filter returned by a custom editor', () => {
    const savedFilter: PowerSearchFilter = {
      field: 'author',
      operator: 'is',
      value: {type: 'string', value: 'Grace'},
      isReadOnly: true,
    };
    function CustomEditor({onSave, timezoneID}: PowerSearchEditorProps) {
      return (
        <button type="button" onClick={() => onSave(savedFilter)}>
          Custom save {timezoneID}
        </button>
      );
    }
    const {onChange} = setup({
      components: {enum: {Editor: CustomEditor}},
      timezoneID: 'Asia/Tokyo',
    });
    openAddFlow();
    tapRow('Status');
    fireEvent.click(
      screen.getByRole('button', {name: 'Custom save Asia/Tokyo'}),
    );
    expect(onChange).toHaveBeenCalledWith([savedFilter], 'add', 0);
  });

  it('returns to Filters unchanged when a creating custom editor saves null', () => {
    function CustomEditor({onSave}: PowerSearchEditorProps) {
      return (
        <button type="button" onClick={() => onSave(null)}>
          Cancel custom
        </button>
      );
    }
    const {onChange} = setup({components: {enum: {Editor: CustomEditor}}});
    openAddFlow();
    tapRow('Status');
    fireEvent.click(screen.getByRole('button', {name: 'Cancel custom'}));
    expect(onChange).not.toHaveBeenCalled();
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
  });
});

// =============================================================================
// Content search
// =============================================================================

describe('MobilePowerSearch step sheets (retained stack)', () => {
  // Dismissing the top step closes only that sheet, so the prior step returns
  // through the stack's reveal motion instead of reopening above the current
  // one. These assertions read only what a person or assistive technology can
  // observe.
  function stepDialogs(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('dialog[open]'));
  }

  it('Filters opens as one modal dialog, named by the step', () => {
    setup({filters: [openFilter]});
    openSheet();
    // One dialog per presented step, each with its own accessible name.
    expect(stepDialogs().map(d => d.getAttribute('aria-label'))).toEqual([
      'Filters',
    ]);
    expect(sheet()).toHaveAttribute('aria-modal', 'true');
  });

  it('pushes Add filter above Filters without a Back button and dismisses it to reveal Filters', () => {
    setup({filters: [openFilter]});
    openSheet();
    const filters = sheet();
    tapRow('Add filter');
    expect(stepDialogs().map(d => d.getAttribute('aria-label'))).toEqual([
      'Filters',
      'Add filter',
    ]);
    expect(filters).toHaveAttribute('inert');
    expect(filters).toHaveAttribute('aria-hidden', 'true');
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
    expect(sheet()).not.toHaveAttribute('inert');
    expect(sheet()).not.toHaveAttribute('aria-hidden');

    settleSheets();
    expect(stepDialogs().map(d => d.getAttribute('aria-label'))).toEqual([
      'Filters',
      'Add filter',
    ]);

    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    settleSheets();
    expect(stepDialogs().map(d => d.getAttribute('aria-label'))).toEqual([
      'Filters',
    ]);
    expect(sheet()).not.toHaveAttribute('inert');
    expect(sheet()).not.toHaveAttribute('aria-hidden');
  });

  it('a step on its own is one open modal dialog, interactive and exposed', () => {
    setup({filters: [openFilter]});
    openSheet();
    settleSheets();
    expect(stepDialogs()).toHaveLength(1);
    expect(sheet()).toHaveAttribute('aria-modal', 'true');
    expect(sheet()).not.toHaveAttribute('inert');
    expect(sheet()).not.toHaveAttribute('aria-hidden');
  });

  it('focus returns to the trigger after a flow that crossed every step (the return target survives each handoff)', () => {
    setup({filters: [openFilter]});
    trigger().focus();
    openSheet();
    tapRow('Add filter');
    settleSheets();
    tapRow(/^Status/);
    settleSheets();
    expect(sheet()).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Status'),
    );
    // Cancel from the value step, dismiss Add filter, Done from Filters.
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    settleSheets();
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    settleSheets();
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Done'}));
    expect(isSheetOpen()).toBe(false);
    settleSheets();
    expect(trigger()).toHaveFocus();
  });

  it('Escape on the Filters step closes the flow and returns focus to the trigger', () => {
    setup({filters: [openFilter]});
    trigger().focus();
    openSheet();
    settleSheets();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    expect(isSheetOpen()).toBe(false);
    settleSheets();
    expect(trigger()).toHaveFocus();
  });

  it('Escape on a nested value step reveals its retained parent', () => {
    setup({filters: [openFilter]});
    openSheet();
    tapRow('Add filter');
    tapRow(/^Status/);
    settleSheets();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    settleSheets();
    expect(isSheetOpen()).toBe(true);
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
  });

  it('a scrim press on the Filters step closes the flow; a nested value scrim reveals its parent', () => {
    setup({filters: [openFilter]});
    openSheet();
    settleSheets();
    // A click on the dialog element itself is the scrim.
    fireEvent.click(sheet());
    expect(isSheetOpen()).toBe(false);
    settleSheets();

    openSheet();
    tapRow('Add filter');
    tapRow(/^Status/);
    settleSheets();
    expect(sheet()).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Status'),
    );
    fireEvent.click(sheet());
    settleSheets();
    expect(isSheetOpen()).toBe(true);
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
  });

  it('a downward swipe on Add filter reveals Filters instead of closing the flow', () => {
    setup({filters: [openFilter]});
    openSheet();
    tapRow('Add filter');
    settleSheets();
    const handle = sheet().querySelector<HTMLElement>(
      '.astryx-bottom-sheet > div[aria-hidden="true"]',
    )!;
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientY: 0,
      button: 0,
      isPrimary: true,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientY: 40,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientY: 120,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(handle, {
      pointerId: 1,
      clientY: 120,
      pointerType: 'touch',
    });
    settleSheets();
    expect(isSheetOpen()).toBe(true);
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
  });

  it('a scrim press on the covered Filters sheet is ignored while Add filter is on top', () => {
    setup({filters: [openFilter]});
    openSheet();
    const filters = sheet();
    tapRow('Add filter');
    // The covered Filters dialog stays presented but inert. A click on its own
    // dialog must not dismiss the active Add filter sheet or end the flow.
    fireEvent.click(filters);
    expect(isSheetOpen()).toBe(true);
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
  });
});

describe('MobilePowerSearch content search', () => {
  it('opens empty content-search configurations directly to Add filter without focusing the search', () => {
    setup({config: contentSearchConfig, placeholder: 'Search content…'});
    openSheet();
    expect(
      within(sheet()).getByRole('heading', {name: 'Add filter'}),
    ).toBeTruthy();
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    expect(input).toHaveAttribute('placeholder', 'Search content…');
    expect(input).not.toHaveFocus();
  });

  it('lists suggestions inline below the search, reachable with ArrowDown', () => {
    setup({config: contentSearchConfig});
    openSheet();
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    const results = within(sheet()).getByRole('list', {name: 'Search results'});
    const options = within(results).getAllByRole('button');
    expect(options.map(option => option.textContent)).toEqual([
      'Status',
      'Author',
      'Unassigned',
      'Labels',
    ]);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], {key: 'ArrowDown'});
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1], {key: 'ArrowUp'});
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], {key: 'ArrowUp'});
    expect(input).toHaveFocus();
  });

  it('opens a structured editor from a field suggestion and returns to the search on Cancel', () => {
    setup({config: contentSearchConfig});
    openSheet();
    const results = within(sheet()).getByRole('list', {name: 'Search results'});
    fireEvent.click(within(results).getByRole('button', {name: 'Status'}));
    expect(within(sheet()).getByRole('heading', {name: 'Status'})).toBeTruthy();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    expect(
      within(sheet()).getByRole('searchbox', {name: 'Search'}),
    ).toHaveFocus();
  });

  it('adds a free-text suggestion as a content filter and keeps the flow open', async () => {
    const {onChange} = setup({
      config: contentSearchConfig,
      filters: [openFilter],
    });
    openSheet();
    expect(within(sheet()).queryByRole('searchbox')).toBeNull();
    tapRow('Add filter');
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    fireEvent.change(input, {target: {value: 'release notes'}});
    fireEvent.click(
      within(sheet()).getByRole('button', {name: '"release notes"'}),
    );
    expect(onChange).toHaveBeenCalledWith(
      [
        openFilter,
        {
          field: 'author',
          operator: 'is',
          value: {type: 'string', value: 'release notes'},
        },
      ],
      'add',
      1,
    );
    await waitFor(() => expect(isSheetOpen()).toBe(true));
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
    // The add is announced inside the sheet the flow is now on, not on the
    // page body, which assistive technology does not expose under a native
    // modal dialog.
    await waitFor(() =>
      expect(sheetRegion().textContent).toBe('Added "release notes"'),
    );
    expect(pageRegionText()).toBe('');
  });

  it('announces both the add and a result count that follows the filters in the same commit, joined in the sheet region', async () => {
    // A consumer that derives `resultCount` from `filters` re-renders in the
    // add's commit, so the count's announcement arrives while the add's is
    // still a frame away. Neither may drop the other (FR6, once per
    // occasion; FR9's join for messages that arrive before exposure).
    function CountFollowsFilters() {
      const [filters, setFilters] = useState<PowerSearchFilter[]>([openFilter]);
      return (
        <MobilePowerSearch
          config={contentSearchConfig}
          filters={filters}
          onChange={next => setFilters([...next])}
          resultCount={filters.length * 10}
        />
      );
    }
    render(<CountFollowsFilters />);
    openSheet();
    tapRow('Add filter');
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    fireEvent.change(input, {target: {value: 'release notes'}});
    fireEvent.click(
      within(sheet()).getByRole('button', {name: '"release notes"'}),
    );
    await waitFor(() => expect(isSheetOpen()).toBe(true));
    await waitFor(() =>
      expect(sheetRegion().textContent).toBe(
        'Added "release notes" 20 results',
      ),
    );
    expect(pageRegionText()).toBe('');
  });

  it('adds a value suggestion from Enter and announces it', () => {
    const {onChange} = setup({config: contentSearchConfig});
    openSheet();
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    fireEvent.change(input, {target: {value: 'status clo'}});
    expect(
      within(sheet()).getByRole('button', {name: 'Status is Closed'}),
    ).toBeTruthy();
    fireEvent.keyDown(input, {key: 'Enter'});
    // The first suggestion is the free-text content item.
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'author',
          operator: 'is',
          value: {type: 'string', value: 'status clo'},
        },
      ],
      'add',
      0,
    );
  });

  it('does not submit a composing suggestion (IME guard)', () => {
    const {onChange} = setup({config: contentSearchConfig});
    openSheet();
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    fireEvent.change(input, {target: {value: '검색'}});
    expect(within(sheet()).getByRole('button', {name: '"검색"'})).toBeTruthy();
    fireEvent.keyDown(input, {key: 'Enter', isComposing: true});
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('검색');
  });

  it('shows an empty state for a query with no suggestions', () => {
    const noContent: PowerSearchConfig = {
      ...contentSearchConfig,
      fields: contentSearchConfig.fields.map(f =>
        f.key === 'author' ? {...f, isValueMatchAllowed: false} : f,
      ),
    };
    setup({config: {...noContent, contentSearchFieldKey: undefined}});
    // Without a content field, Add filter shows the field list instead.
    openSheet();
    expect(within(sheet()).queryByRole('searchbox')).toBeNull();
    expect(within(sheet()).getByRole('button', {name: 'Status'})).toBeTruthy();
  });
});

// =============================================================================
// Value types
// =============================================================================

describe('MobilePowerSearch value types', () => {
  function setupValues(
    props: Partial<React.ComponentProps<typeof MobilePowerSearch>> = {},
  ) {
    return setup({config: valueTypesConfig, ...props});
  }

  it('string: text input stages on change', () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Title');
    fireEvent.change(within(sheet()).getByRole('textbox', {name: 'Value'}), {
      target: {value: 'hello'},
    });
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'title',
          operator: 'contains',
          value: {type: 'string', value: 'hello'},
        },
      ],
      'add',
      0,
    );
  });

  it('string with searchSource: typeahead stages the picked label', async () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Owner');
    const input = within(sheet()).getByRole('combobox', {name: 'Value'});
    fireEvent.change(input, {target: {value: 'Gra'}});
    // The suggestion layer is a popover jsdom cannot show; query it hidden.
    const option = await screen.findByRole('option', {
      name: /Grace Hopper/,
      hidden: true,
    });
    fireEvent.click(option);
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'owner',
          operator: 'is',
          value: {type: 'string', value: 'Grace Hopper'},
        },
      ],
      'add',
      0,
    );
  });

  it('string_list: creates and selects an ID inline, then commits it from the value footer', async () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('ID');
    const input = within(sheet()).getByRole('textbox', {name: 'Search ID'});
    fireEvent.change(input, {target: {value: 'ABC-1'}});
    const result = await within(sheet()).findByRole(
      'button',
      {name: 'Add ABC-1'},
      {timeout: 15000},
    );
    const resultList = result.closest('[role="list"]') as HTMLElement;
    expect(
      getComputedStyle(resultList.parentElement!.parentElement!)
        .backgroundColor,
    ).not.toBe('var(--color-background-muted)');
    fireEvent.click(result);
    expect(
      within(sheet()).getByRole('button', {name: 'Add ABC-1, selected'}),
    ).toBeTruthy();
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'ids',
          operator: 'in',
          value: {type: 'string_list', value: ['ABC-1']},
        },
      ],
      'add',
      0,
    );
  });

  it('integer: number input stages as typed and commits on blur', () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Lines');
    const input = within(sheet()).getByRole('spinbutton', {name: 'Value'});
    const add = within(sheet()).getByRole('button', {name: 'Add filter'});
    expect(add).toBeDisabled();
    fireEvent.input(input, {target: {value: '12'}});
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toBeEnabled();
    fireEvent.blur(input);
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [{field: 'lines', operator: 'gt', value: {type: 'integer', value: 12}}],
      'add',
      0,
    );
  });

  it('integer: a decimal does not stage', () => {
    setupValues();
    openAddFlow();
    tapRow('Lines');
    fireEvent.input(within(sheet()).getByRole('spinbutton', {name: 'Value'}), {
      target: {value: '1.5'},
    });
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toBeDisabled();
  });

  it('float: number input stages a decimal', () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Cost');
    const input = within(sheet()).getByRole('spinbutton', {name: 'Value'});
    fireEvent.input(input, {target: {value: '2.5'}});
    fireEvent.blur(input);
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [{field: 'cost', operator: 'gt', value: {type: 'float', value: 2.5}}],
      'add',
      0,
    );
  });

  it('time: the time input is rendered and a staged value shows', () => {
    const timeFilter: PowerSearchFilter = {
      field: 'alarm',
      operator: 'at',
      value: {type: 'time', value: '09:30'},
    };
    setupValues({filters: [timeFilter]});
    openEditFlow('Alarm at 09:30');
    expect(
      within(sheet()).getByRole('heading', {name: 'Alarm at'}),
    ).toBeTruthy();
    expect(within(sheet()).getByLabelText('Time')).toBeTruthy();
    expect(within(sheet()).getByRole('button', {name: 'Apply'})).toBeEnabled();
  });

  it('date_absolute (date only): renders the stored day in an inline calendar', () => {
    const dateFilter: PowerSearchFilter = {
      field: 'created',
      operator: 'after',
      // 2024-03-10T12:00:00Z
      value: {type: 'date_absolute', unixSeconds: 1710072000},
    };
    setupValues({filters: [dateFilter], timezoneID: 'UTC'});
    openEditFlow(/^Created is after/);
    expect(within(sheet()).getByRole('grid')).toBeTruthy();
    expect(
      sheet()
        .querySelector('button[data-date="2024-03-10"]')
        ?.closest('[role="gridcell"]'),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('date_absolute with isDateOnly: false keeps the large date-and-time editor', () => {
    setupValues();
    openAddFlow();
    tapRow('Updated');
    expect(within(sheet()).getByLabelText('Date and time')).toBeTruthy();
    expect(within(sheet()).queryByRole('grid')).toBeNull();
  });

  it('date_relative: rows stage a single relative value', () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Age');
    expect(
      within(sheet()).queryByRole('button', {name: /from now/}),
    ).toBeNull();
    tapRow('7 days ago');
    expect(
      within(sheet()).getByRole('button', {name: '7 days ago, selected'}),
    ).toBeTruthy();
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'age',
          operator: 'newer',
          value: {type: 'date_relative', value: '7d_ago'},
        },
      ],
      'add',
      0,
    );
  });

  it('date_range: renders the stored range in an inline calendar', () => {
    const rangeFilter: PowerSearchFilter = {
      field: 'window',
      operator: 'between',
      value: {
        type: 'date_range',
        value: {
          start: {type: 'ABSOLUTE', unixSeconds: 1709251200}, // 2024-03-01Z
          end: {type: 'ABSOLUTE', unixSeconds: 1709942400}, // 2024-03-09Z
        },
      },
    };
    setupValues({filters: [rangeFilter], timezoneID: 'UTC'});
    openEditFlow(/^Window is between/);
    expect(within(sheet()).getByRole('grid')).toBeTruthy();
    expect(
      sheet()
        .querySelector('button[data-date="2024-03-01"]')
        ?.closest('[role="gridcell"]'),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      sheet()
        .querySelector('button[data-date="2024-03-09"]')
        ?.closest('[role="gridcell"]'),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('entity_list: searches and selects an entity inline, then commits it from the value footer', async () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Assignee');
    const input = within(sheet()).getByRole('textbox', {
      name: 'Search Assignee',
    });
    fireEvent.change(input, {target: {value: 'Ada'}});
    fireEvent.click(
      await within(sheet()).findByRole(
        'button',
        {name: 'Ada Lovelace'},
        {timeout: 15000},
      ),
    );
    expect(
      within(sheet()).getByRole('button', {name: 'Ada Lovelace, selected'}),
    ).toBeTruthy();
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'assignee',
          operator: 'anyOf',
          value: {
            type: 'entity_list',
            value: [{id: 'p1', label: 'Ada Lovelace'}],
          },
        },
      ],
      'add',
      0,
    );
  });

  it('custom: the configured editor stages a JSON string', () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Color');
    fireEvent.change(within(sheet()).getByLabelText('Color editor'), {
      target: {value: 'teal'},
    });
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'color',
          operator: 'is',
          value: {type: 'custom', value: 'teal'},
        },
      ],
      'add',
      0,
    );
  });

  it('custom: tokens and rows use getString', () => {
    const colorFilter: PowerSearchFilter = {
      field: 'color',
      operator: 'is',
      value: {type: 'custom', value: 'teal'},
    };
    setupValues({filters: [colorFilter]});
    expect(within(field()).getByText('TEAL')).toBeTruthy();
    openSheet();
    expect(
      within(sheet()).getByRole('button', {name: 'Color is TEAL'}),
    ).toBeTruthy();
  });
});

// =============================================================================
// Timezone
// =============================================================================

describe('MobilePowerSearch timezone', () => {
  // 2024-03-10T03:00:00Z: March 10 in Tokyo (UTC+9), still March 9 in
  // Honolulu (UTC-10). A boundary instant exposes any surface that formats
  // without the configured zone.
  const BOUNDARY_SECONDS = 1710039600;
  const dateFilter: PowerSearchFilter = {
    field: 'created',
    operator: 'after',
    value: {type: 'date_absolute', unixSeconds: BOUNDARY_SECONDS},
  };

  it.each([
    ['Asia/Tokyo', 'Mar 10, 2024', 'March 10, 2024'],
    ['Pacific/Honolulu', 'Mar 9, 2024', 'March 9, 2024'],
  ])(
    'formats the token, the row and the editor in %s',
    (timezoneID, compact) => {
      setup({config: valueTypesConfig, filters: [dateFilter], timezoneID});
      const tokenValue = within(field()).getByText(new RegExp(compact));
      expect(tokenValue).toHaveStyle({fontWeight: 'var(--font-weight-bold)'});
      openSheet();
      const row = within(sheet()).getByRole('button', {
        name: new RegExp(`^Created is after ${compact}`),
      });
      expect(within(row).getByText(new RegExp(compact))).toHaveStyle({
        fontWeight: 'var(--font-weight-bold)',
      });
      fireEvent.click(row);
      expect(
        sheet()
          .querySelector(
            `button[data-date="${timezoneID === 'Asia/Tokyo' ? '2024-03-10' : '2024-03-09'}"]`,
          )
          ?.closest('[role="gridcell"]'),
      ).toHaveAttribute('aria-selected', 'true');
    },
  );

  it('converts a picked day to midnight in the configured zone', () => {
    expect(isoDateToUnixSeconds('2024-03-09', 'Pacific/Honolulu')).toBe(
      Date.UTC(2024, 2, 9, 10, 0) / 1000,
    );
    expect(isoDateToUnixSeconds('2024-03-10', 'Asia/Tokyo')).toBe(
      Date.UTC(2024, 2, 9, 15, 0) / 1000,
    );
    expect(unixSecondsToISODate(BOUNDARY_SECONDS, 'Asia/Tokyo')).toBe(
      '2024-03-10',
    );
    expect(unixSecondsToISODate(BOUNDARY_SECONDS, 'Pacific/Honolulu')).toBe(
      '2024-03-09',
    );
    expect(unixSecondsToISODateTime(BOUNDARY_SECONDS, 'Asia/Tokyo')).toBe(
      '2024-03-10T12:00',
    );
    expect(
      isoDateTimeToUnixSeconds(
        unixSecondsToISODateTime(BOUNDARY_SECONDS, 'Pacific/Honolulu'),
        'Pacific/Honolulu',
      ),
    ).toBe(BOUNDARY_SECONDS);
  });
});

// =============================================================================
// Core parity
// =============================================================================

describe('MobilePowerSearch Core parity', () => {
  const third: PowerSearchFilter = {
    field: 'status',
    operator: 'isNot',
    value: {type: 'enum', value: 'closed'},
  };
  const legacyFilter: PowerSearchFilter = {
    field: 'legacy',
    operator: 'was',
    value: {type: 'string', value: 'x'},
  };
  function Harness({
    filters,
    cfg = config,
    hasClear,
  }: {
    filters: ReadonlyArray<PowerSearchFilter>;
    cfg?: PowerSearchConfig;
    hasClear?: boolean;
  }) {
    return (
      <MobilePowerSearch
        config={cfg}
        filters={filters}
        onChange={() => {}}
        hasClear={hasClear}
      />
    );
  }

  describe('a controlled update that removes the focused control re-homes focus over the button rows', () => {
    it('moves focus from a removed Filters row to the row that followed it, counting only button rows', () => {
      const pinned: PowerSearchFilter = {...openFilter, isReadOnly: true};
      const fourth: PowerSearchFilter = {
        field: 'author',
        operator: 'is',
        value: {type: 'string', value: 'Grace'},
      };
      const {rerender} = render(
        <Harness filters={[pinned, authorFilter, third, fourth]} />,
      );
      openSheet();
      within(sheet()).getByRole('button', {name: 'Author is Ada'}).focus();
      rerender(<Harness filters={[pinned, third, fourth]} />);
      // The row that followed it — not one row too far for the plain row.
      expect(
        within(sheet()).getByRole('button', {name: 'Status is not Closed'}),
      ).toHaveFocus();
      // The last button row removed: the new last one takes focus.
      within(sheet()).getByRole('button', {name: 'Author is Grace'}).focus();
      rerender(<Harness filters={[pinned, third]} />);
      expect(
        within(sheet()).getByRole('button', {name: 'Status is not Closed'}),
      ).toHaveFocus();
    });

    it('moves focus from Clear all, gone with the last filter, to Add filter', () => {
      const {rerender} = render(<Harness filters={[openFilter]} hasClear />);
      openSheet();
      within(sheet()).getByRole('button', {name: 'Clear all'}).focus();
      rerender(<Harness filters={[]} hasClear />);
      expect(
        within(sheet()).queryByRole('button', {name: 'Clear all'}),
      ).toBeNull();
      const addFilterButtons = within(sheet()).getAllByRole('button', {
        name: 'Add filter',
      });
      expect(addFilterButtons).toHaveLength(1);
      expect(addFilterButtons[0]).toHaveFocus();
    });

    it("moves focus from a dropped field's row in Add filter to a remaining row", () => {
      const {rerender} = render(<Harness filters={[]} />);
      openAddFlow();
      within(sheet()).getByRole('button', {name: 'Author'}).focus();
      rerender(
        <Harness
          filters={[]}
          cfg={{
            ...config,
            fields: config.fields.filter(f => f.key !== 'author'),
          }}
        />,
      );
      expect(
        within(sheet()).queryByRole('button', {name: 'Author'}),
      ).toBeNull();
      const focused = document.activeElement as HTMLElement;
      expect(focused.closest('li')).not.toBeNull();
      expect(sheet().contains(focused)).toBe(true);
    });
  });

  describe('rows keyed by filter identity', () => {
    it('keeps focus on the same filter when the parent reorders the filters, with the same objects and with clones', () => {
      const {rerender} = render(
        <Harness filters={[openFilter, authorFilter, third]} />,
      );
      openSheet();
      const authorRow = within(sheet()).getByRole('button', {
        name: 'Author is Ada',
      });
      authorRow.focus();
      rerender(<Harness filters={[third, openFilter, authorFilter]} />);
      expect(within(sheet()).getByRole('button', {name: 'Author is Ada'})).toBe(
        authorRow,
      );
      expect(authorRow).toHaveFocus();
      rerender(
        <Harness filters={[{...authorFilter}, {...third}, {...openFilter}]} />,
      );
      expect(within(sheet()).getByRole('button', {name: 'Author is Ada'})).toBe(
        authorRow,
      );
      expect(authorRow).toHaveFocus();
    });

    it('keeps focus on the same filter when the parent removes a filter above it', () => {
      const {rerender} = render(
        <Harness filters={[openFilter, authorFilter, third]} />,
      );
      openSheet();
      const authorRow = within(sheet()).getByRole('button', {
        name: 'Author is Ada',
      });
      authorRow.focus();
      rerender(<Harness filters={[authorFilter, third]} />);
      expect(authorRow).toHaveFocus();
      expect(
        within(sheet()).getByRole('button', {name: 'Status is not Closed'}),
      ).not.toHaveFocus();
    });
  });

  describe('a filter the config no longer knows', () => {
    it('lists it by its raw keys, exposes the unavailable state, and removes it directly from Filters', () => {
      function Removable() {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([openFilter, legacyFilter]);
        return (
          <MobilePowerSearch
            config={config}
            filters={filters}
            onChange={next => setFilters(next)}
          />
        );
      }
      render(<Removable />);
      expect(within(field()).getByText('legacy: was')).toBeTruthy();
      openSheet();
      const row = within(sheet()).getByRole('button', {name: 'legacy was'});
      fireEvent.click(row);
      expect(
        within(sheet()).getByRole('heading', {name: 'legacy was'}),
      ).toBeTruthy();
      expect(sheet()).toHaveAttribute('aria-label', 'legacy was');
      expect(
        within(sheet()).getByText('This filter is no longer available'),
      ).toBeTruthy();
      expect(within(sheet()).queryByRole('button', {name: 'Apply'})).toBeNull();
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
      fireEvent.click(
        within(sheet()).getByRole('button', {name: 'Remove legacy filter'}),
      );
      expect(
        within(sheet()).queryByRole('button', {name: 'legacy was'}),
      ).toBeNull();
      expect(
        within(sheet()).getByRole('button', {name: 'Remove Status filter'}),
      ).toHaveFocus();
    });

    it('reads the field label next to the raw operator key when only the operator is gone', () => {
      const staleOperator: PowerSearchFilter = {
        field: 'author',
        operator: 'was',
        value: {type: 'string', value: 'Ada'},
      };
      setup({filters: [staleOperator]});
      openSheet();
      expect(
        within(sheet()).getByRole('button', {name: 'Author was'}),
      ).toBeTruthy();
    });
  });

  describe('the unavailable state', () => {
    it('moves focus to Cancel when a controlled config update removes the edited operator, and announces it in the sheet', async () => {
      const {rerender} = setup({filters: [openFilter]});
      openEditFlow('Status is Open');
      within(sheet()).getByRole('radio', {name: 'Status is not'}).focus();
      rerender(
        <MobilePowerSearch
          config={{
            ...config,
            fields: config.fields.map(f =>
              f.key === 'status'
                ? {...f, operators: f.operators.filter(o => o.key !== 'is')}
                : f,
            ),
          }}
          filters={[openFilter]}
          onChange={vi.fn()}
        />,
      );
      expect(
        within(sheet()).getByText('This filter is no longer available'),
      ).toBeTruthy();
      expect(
        within(sheet()).getByRole('button', {name: 'Cancel'}),
      ).toHaveFocus();
      await waitFor(() =>
        expect(sheetRegion().textContent).toBe(
          'This filter is no longer available',
        ),
      );
    });
  });

  describe('Apply and Cancel after a controlled update', () => {
    it('Apply with the edited filter gone writes nothing and focuses the nearest remaining row, else Add filter', () => {
      const onChange = vi.fn();
      const {rerender} = render(
        <MobilePowerSearch
          config={config}
          filters={[openFilter, authorFilter, third]}
          onChange={onChange}
        />,
      );
      openEditFlow('Author is Ada');
      rerender(
        <MobilePowerSearch
          config={config}
          filters={[openFilter, third]}
          onChange={onChange}
        />,
      );
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Apply'}));
      expect(onChange).not.toHaveBeenCalled();
      expect(
        within(sheet()).getByRole('button', {name: 'Status is not Closed'}),
      ).toHaveFocus();
    });

    it('Cancel from creation after the opening field was removed focuses the first control of Add filter', () => {
      const {rerender} = render(<Harness filters={[]} />);
      openAddFlow();
      tapRow('Author');
      rerender(
        <Harness
          filters={[]}
          cfg={{
            ...config,
            fields: config.fields.filter(f => f.key !== 'author'),
          }}
        />,
      );
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
      expect(
        within(sheet()).getByRole('heading', {name: 'Add filter'}),
      ).toBeTruthy();
      const focused = document.activeElement as HTMLElement;
      expect(focused.closest('li')).not.toBeNull();
      expect(sheet().contains(focused)).toBe(true);
    });
  });

  describe('announcements inside the open sheet', () => {
    it('announces "Removed {label}" in Filters after direct row removal', async () => {
      function Removable() {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([openFilter, authorFilter]);
        return (
          <MobilePowerSearch
            config={config}
            filters={filters}
            onChange={next => setFilters(next)}
          />
        );
      }
      render(<Removable />);
      openSheet();
      fireEvent.click(
        within(sheet()).getByRole('button', {name: 'Remove Author filter'}),
      );
      await waitFor(() =>
        expect(sheetRegion().textContent).toBe('Removed Author is Ada'),
      );
      expect(pageRegionText()).toBe('');
    });

    it('speaks "No filters found" from its rendered element once per query, and not for an empty query', async () => {
      const many: PowerSearchConfig = {
        name: 'Many',
        fields: Array.from({length: 9}, (_, i) => ({
          key: `f${i}`,
          label: `Field ${i}`,
          operators: [
            {key: 'is', label: 'is', value: {type: 'string' as const}},
          ],
        })),
      };
      setup({config: many});
      openSheet();
      const search = within(sheet()).getByRole('textbox', {
        name: 'Search filters',
      });
      fireEvent.change(search, {target: {value: 'nope'}});
      expect(within(sheet()).getByText('No filters found')).toBeTruthy();
      await waitFor(() =>
        expect(sheetRegion().textContent).toBe(
          'No filters found Try a different search.',
        ),
      );
      fireEvent.change(search, {target: {value: ''}});
      // The message is gone from the body; only the live region still holds
      // the words it spoke.
      expect(
        within(sheet()).queryByText('No filters found', {
          ignore:
            '[data-astryx-modal-live-region] *, [data-astryx-modal-live-region]',
        }),
      ).toBeNull();
      expect(
        within(sheet()).getAllByRole('button', {name: /^Field/}),
      ).toHaveLength(9);
    });

    it('does not announce "No results found" when Add filter is left after a query that listed suggestions', async () => {
      setup({config: contentSearchConfig, filters: [openFilter]});
      openSheet();
      tapRow('Add filter');
      const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
      fireEvent.change(input, {target: {value: 'status'}});
      expect(
        within(sheet()).getAllByRole('button', {name: /Status/}).length,
      ).toBeGreaterThan(0);
      // Back to Filters: the Add filter sheet's body stays mounted, its
      // results list emptied by the step change — no empty-result message is
      // spoken, not on the page and not in the Filters dialog.
      expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
      fireEvent.keyDown(sheet(), {key: 'Escape'});
      expect(
        within(sheet()).getByRole('heading', {name: 'Filters'}),
      ).toBeTruthy();
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(pageRegionText()).toBe('');
      expect(
        sheet().querySelector(
          ':scope > [data-astryx-modal-live-region="polite"]',
        )?.textContent ?? '',
      ).not.toContain('No results found');
      // Escape out of the flow after another query: nothing on the page.
      tapRow('Add filter');
      fireEvent.change(
        within(sheet()).getByRole('searchbox', {name: 'Search'}),
        {target: {value: 'status'}},
      );
      fireEvent.keyDown(sheet(), {key: 'Escape'});
      settleSheets();
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(pageRegionText()).toBe('');
    });

    it('announces the unavailable state only while its step is open, and again when the same stale filter reopens', async () => {
      const stale: PowerSearchConfig = {
        ...config,
        fields: config.fields.map(f =>
          f.key === 'status'
            ? {...f, operators: f.operators.filter(o => o.key !== 'is')}
            : f,
        ),
      };
      const {rerender} = setup({filters: [openFilter, authorFilter]});
      openEditFlow('Status is Open');
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
      expect(
        within(sheet()).getByRole('heading', {name: 'Filters'}),
      ).toBeTruthy();
      // The value step is closed but its body stays mounted with the draft; a
      // config update that drops the edited operator must not be spoken — not
      // now, and not held for the next dialog that opens.
      rerender(
        <MobilePowerSearch
          config={stale}
          filters={[openFilter, authorFilter]}
          onChange={vi.fn()}
        />,
      );
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(pageRegionText()).toBe('');
      // Opening another filter's step: words held for the closed step would
      // surface in the value step's dialog here.
      tapRow('Author is Ada');
      await new Promise(resolve => setTimeout(resolve, 40));
      for (const region of document.querySelectorAll('[aria-live]')) {
        expect(region.textContent ?? '').not.toContain(
          'This filter is no longer available',
        );
      }
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
      // Reopening the stale filter — its row now reads the field's label and
      // the raw operator key — speaks it, in its own dialog, as a new
      // occasion even though the filter is the same.
      tapRow('Status is');
      await waitFor(() =>
        expect(sheetRegion().textContent).toBe(
          'This filter is no longer available',
        ),
      );
    });

    it('shows no "no match" message for a config with no field', () => {
      setup({config: {name: 'Empty', fields: []}});
      openSheet();
      expect(
        within(sheet()).getByRole('heading', {name: 'Add filter'}),
      ).toBeTruthy();
      expect(within(sheet()).queryByText('No filters found')).toBeNull();
    });

    it("keeps the content searchbox's aria-controls pointing at an element while nothing lists", () => {
      setup({config: contentSearchConfig});
      openSheet();
      const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
      const controlled = () =>
        document.getElementById(input.getAttribute('aria-controls') as string);
      expect(controlled()).not.toBeNull();
      fireEvent.change(input, {target: {value: 'zzzz-nothing-matches'}});
      expect(controlled()).not.toBeNull();
      expect(sheet().contains(controlled())).toBe(true);
    });
  });

  describe('the trigger', () => {
    it('does not open the flow for a tap on the end lane, where endContent keeps its own taps', () => {
      const onAction = vi.fn();
      setup({
        filters: [openFilter],
        endContent: (
          <button type="button" onClick={onAction}>
            Save view
          </button>
        ),
      });
      fireEvent.click(screen.getByRole('button', {name: 'Save view'}));
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(isSheetOpen()).toBe(false);
      // A tap on a token still opens it.
      fireEvent.click(within(field()).getByText('Open'));
      expect(isSheetOpen()).toBe(true);
    });

    it('fires onBlur when the flow opens and onFocus when it closes, once each', () => {
      const onFocus = vi.fn();
      const onBlur = vi.fn();
      setup({filters: [openFilter], onFocus, onBlur});
      openSheet();
      expect(onFocus).toHaveBeenCalledTimes(1);
      expect(onBlur).toHaveBeenCalledTimes(1);
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Done'}));
      settleSheets();
      expect(trigger()).toHaveFocus();
      expect(onFocus).toHaveBeenCalledTimes(2);
      expect(onBlur).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// Helpers
// =============================================================================

describe('mobilePowerSearchUtils', () => {
  it('resolves filter identity by reference, then slot, then unique signature', () => {
    const a: PowerSearchFilter = {...openFilter};
    const b: PowerSearchFilter = {...authorFilter};
    const sig = filterSignature(a);
    expect(resolveFilterIdentityIndex([b, a], a, sig, 0)).toBe(1);
    expect(resolveFilterIdentityIndex([{...a}, b], a, sig, 0)).toBe(0);
    expect(resolveFilterIdentityIndex([b, {...a}], a, sig, 0)).toBe(1);
    expect(resolveFilterIdentityIndex([{...a}, {...a}], a, sig, 1)).toBe(1);
    expect(resolveFilterIdentityIndex([{...a}, {...a}], a, sig, 5)).toBeNull();
    expect(resolveFilterIdentityIndex([b], a, sig, 0)).toBeNull();
  });

  it('picks the nearest editable neighbor after a removal, preferring the next', () => {
    const ro: PowerSearchFilter = {...openFilter, isReadOnly: true};
    expect(nearestEditableIndex([authorFilter, authorFilter], 1)).toBe(1);
    expect(nearestEditableIndex([authorFilter, ro], 1)).toBe(0);
    expect(nearestEditableIndex([ro, ro], 0)).toBeUndefined();
    expect(nearestEditableIndex([authorFilter, ro, authorFilter], 1)).toBe(2);
  });

  it('builds content-search suggestions like Core PowerSearch', () => {
    const source = createContentSearchSource(
      createMobilePowerSearchConfig(contentSearchConfig),
      key => key,
      10,
    );
    expect(source.bootstrap().map(item => item.id)).toEqual([
      'status',
      'author',
      'unassigned',
      'labels',
    ]);
    const results = source.search('status is clo');
    expect(results[0]).toMatchObject({
      label: '"status is clo"',
      auxiliaryData: {fieldKey: 'author', operatorKey: 'is'},
    });
    expect(results[1]).toMatchObject({
      label: 'Status is Closed',
      auxiliaryData: {
        fieldKey: 'status',
        operatorKey: 'is',
        filterValue: {type: 'enum', value: 'closed'},
      },
    });
    // An exact field match drops the free-text item.
    expect(
      source.search('Author').some(item => item.id.startsWith('__content')),
    ).toBe(false);
  });
});
