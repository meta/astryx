// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearchBottomSheet.test.tsx
 * @input Uses vitest, @testing-library/react, PowerSearch with
 *   `experimental.presentation`, and the sheet helpers
 * @output Unit tests for the touch presentation (`component:PowerSearch`
 *   FR10–FR21, AR4–AR6): presentation resolution, the trigger, the Filters
 *   sheet, Add filter, the operator step, each value type (list values
 *   through the Tokenizer's sheet), content search, focus after each step,
 *   disabled while open, the StrictMode-safe result count, onChange metadata,
 *   nested filters through the built-in nested editor
 * @position Core testing; validates PowerSearch.tsx (sheet trigger),
 *   PowerSearchBottomSheet.tsx and powerSearchSheetUtils.ts
 *
 * SYNC: When PowerSearchBottomSheet.tsx changes, update tests to match new
 * behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import React, {createRef, StrictMode, useState} from 'react';
import {act} from '@testing-library/react';
import {PowerSearch, type PowerSearchProps} from './PowerSearch';
import type {
  PowerSearchConfig,
  PowerSearchEditorProps,
  PowerSearchFilter,
  PowerSearchHandle,
  PowerSearchTokenProps,
} from './types';
import type {SearchableItem, SearchSource} from '../Typeahead/types';
import {COMPACT_TOUCH_PRESENTATION_QUERY} from '../hooks/useAdaptivePresentation';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import * as stylex from '@stylexjs/stylex';
import {Dialog} from '../Dialog/Dialog';
import userEvent from '@testing-library/user-event';
import {rtlStyles} from '../utils';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import type {Overrides} from '../i18n/types';
import {useInternalConfig} from './useInternalConfig';
import {usePowerSearchSource} from './usePowerSearchSource';
import {
  createSheetSuggestionSource,
  filterSignature,
  nearestEditableIndex,
  resolveFilterIdentityIndex,
} from './powerSearchSheetUtils';
import {renderHook} from '@testing-library/react';

// =============================================================================
// Environment
// =============================================================================

function stubMatchMedia(matcher: (query: string) => boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: matcher(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

// jsdom implements neither <dialog> open/close nor pointer capture; the sheets
// need both. Same stubs BottomSheet's own tests install.
function stubEnvironment() {
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
  stubMatchMedia(() => false);
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
}

/**
 * jsdom has no showModal(), so an open dialog never matches `:modal`; stand in
 * for the sheets the browser presents modally. Returns the spy to restore.
 */
function mockModalDialogs() {
  const matches = Element.prototype.matches;
  return vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':modal'
      ? this instanceof HTMLDialogElement && this.open
      : matches.call(this, selector);
  });
}

const sharedLiveRegion = () =>
  document.querySelector('[data-astryx-live-region="polite"]');
const modalLiveRegion = (dialog: Element) =>
  dialog.querySelector(':scope > [data-astryx-modal-live-region="polite"]');

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

const people: SearchableItem[] = [
  {id: 'p1', label: 'Ada Lovelace'},
  {id: 'p2', label: 'Grace Hopper'},
];
const peopleSource: SearchSource = {
  search: q =>
    people.filter(p => p.label.toLowerCase().includes(q.toLowerCase())),
  bootstrap: () => people,
};

// A locale that puts the value first: module scope, since the provider
// memoizes on prop identity.
const REORDERED: Overrides = {
  en: {
    '@astryx.powersearch.sheet.labelValue': '{value} ({label})',
    '@astryx.powersearch.sheet.filtersClearedWithCount':
      '{resultCount} — all filters removed',
  },
};

/** One field per non-nested value type PowerSearch supports. */
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

type Presentation = NonNullable<
  NonNullable<PowerSearchProps['experimental']>['presentation']
>;

function setup(
  props: Partial<PowerSearchProps> & {presentation?: Presentation} = {},
) {
  const {presentation = 'bottom-sheet', ...rest} = props;
  const onChange = vi.fn();
  const result = render(
    <PowerSearch
      config={config}
      filters={[]}
      onChange={onChange}
      experimental={{presentation}}
      {...rest}
    />,
  );
  return {onChange, ...result};
}

// The sheet presentation's trigger: it opens a dialog and is named by the
// label and its content. A popover token that opens its editor also opens a
// dialog, but is named itself.
const SHEET_TRIGGER = 'button[aria-haspopup="dialog"][aria-labelledby]';

function trigger(): HTMLElement {
  return document.querySelector<HTMLElement>(SHEET_TRIGGER)!;
}

/** The field's control box holding the tokens and the trigger. */
function field(): HTMLElement {
  return trigger().parentElement!.parentElement!;
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
 * Every step is its own standalone sheet with its own dialog, and a list
 * value's Tokenizer opens one more above the step. A replaced or covered
 * dialog stays presented but inert, and a closing one that still holds focus
 * drops `aria-modal` until its exit ends, so return the topmost open modal.
 */
function sheet(): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLElement>(
    'dialog[open][aria-modal="true"]:not([inert])',
  );
  const dialog = dialogs[dialogs.length - 1];
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
  // A field or filter row is a button; a choice row is a radio or a checkbox
  // (FR17). The replace handoff keeps the outgoing sheet presented while the
  // incoming one enters; the last match is always on the sheet that just
  // arrived.
  const matches = [
    ...within(sheet()).queryAllByRole('button', {name}),
    ...within(sheet()).queryAllByRole('radio', {name}),
    ...within(sheet()).queryAllByRole('checkbox', {name}),
  ];
  expect(matches.length).toBeGreaterThan(0);
  fireEvent.click(matches[matches.length - 1]);
}

/** A choice row of the value step: a radio, or a checkbox for `enum_list`. */
function choice(name: string): HTMLElement {
  return (
    within(sheet()).queryByRole('radio', {name}) ??
    within(sheet()).getByRole('checkbox', {name})
  );
}

function expectBleedChoiceRows(group: HTMLElement): void {
  expect(group.className).toMatch(/choiceList/);
  const rows = group.querySelectorAll('[role="radio"], [role="checkbox"]');
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.className).toMatch(/choiceRow/);
  }
  const body = group.closest('[class*="body"]');
  expect(body).not.toBeNull();
  const computed = getComputedStyle(body!);
  expect(computed.getPropertyValue('--container-padding-inline-start')).toBe(
    'var(--spacing-4)',
  );
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

/** The Clear all confirmation, open above the Filters sheet. */
function clearConfirmation(): HTMLElement {
  return screen.getByRole('alertdialog', {name: 'Clear all filters?'});
}

function confirmClearAll(): void {
  fireEvent.click(
    within(clearConfirmation()).getByRole('button', {name: 'Clear filters'}),
  );
}

/** A Filters row's trailing remove action. */
function removeButton(fieldLabel: string): HTMLElement {
  return within(sheet()).getByRole('button', {
    name: `Remove ${fieldLabel} filter`,
  });
}

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
  const body = list.closest('[class*="scrollContent"], [class*="body"]');
  expect(body).not.toBeNull();
  const computed = getComputedStyle(body!);
  expect(computed.getPropertyValue('--container-padding-inline-start')).toBe(
    'var(--spacing-4)',
  );
  expect(computed.getPropertyValue('--container-padding-inline-end')).toBe(
    'var(--spacing-4)',
  );
}

// The sheet flow is loaded with React.lazy, so the first flow renders a tick
// after it opens. Open one up front so the module is cached and every later
// flow renders synchronously.
beforeAll(async () => {
  stubEnvironment();
  try {
    setup({filters: [openFilter]});
    openSheet();
    await screen.findByRole('heading', {name: 'Filters'}, {timeout: 15000});
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
}, 20000);

beforeEach(() => {
  __resetLiveRegionsForTest();
  stubEnvironment();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// Presentation resolution (FR10)
// =============================================================================

describe('PowerSearch presentation resolution (FR10)', () => {
  it('keeps the tokenizer field when experimental is omitted', () => {
    render(<PowerSearch config={config} filters={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(document.querySelector(SHEET_TRIGGER)).toBeNull();
  });

  it('keeps the tokenizer field for an empty experimental object and for popover', () => {
    const {unmount} = render(
      <PowerSearch
        config={config}
        filters={[]}
        onChange={vi.fn()}
        experimental={{}}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    unmount();
    setup({presentation: 'popover'});
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(document.querySelector(SHEET_TRIGGER)).toBeNull();
  });

  it('forces the trigger and the sheet flow for bottom-sheet', () => {
    setup({filters: [openFilter]});
    expect(screen.queryByRole('combobox')).toBeNull();
    openSheet();
    const dialog = sheet();
    expect(dialog).toHaveAttribute('aria-label', 'Filters');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('uses the sheet for adaptive on a compact coarse-pointer screen', () => {
    stubMatchMedia(query => query === COMPACT_TOUCH_PRESENTATION_QUERY);
    setup({presentation: 'adaptive', filters: [openFilter]});
    expect(screen.queryByRole('combobox')).toBeNull();
    openSheet();
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
  });

  it('keeps adaptive on the tokenizer field without compact touch', () => {
    setup({presentation: 'adaptive', filters: [openFilter]});
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(document.querySelector(SHEET_TRIGGER)).toBeNull();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it('warns once in development about props with no sheet surface', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setup({menuWidth: 320, tokenOverflowBehavior: 'unfocusedInline'});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('`menuWidth` has no surface'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('`tokenOverflowBehavior` has no surface'),
    );
    warn.mockClear();
    cleanup();
    setup({presentation: 'popover', menuWidth: 320});
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('has no surface'),
    );
    warn.mockRestore();
  });
});

// =============================================================================
// Trigger field (FR11, AR4)
// =============================================================================

describe('PowerSearch sheet trigger (FR11)', () => {
  it('names the trigger with the label and its visible placeholder', () => {
    setup({label: 'Filter issues', placeholder: 'Search issues…'});
    const button = trigger();
    expect(button).toHaveAccessibleName('Filter issues Search issues…');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveTextContent('Search issues…');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('exposes the selected filters in the trigger name', () => {
    setup({filters: [openFilter, authorFilter]});
    // Token text with no inline whitespace between label and value reads
    // "is Open" or "isOpen" depending on the name computation.
    expect(trigger()).toHaveAccessibleName(
      /^Search Status: is ?Open Author: is ?Ada$/,
    );
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
    const button = trigger();
    expect(getComputedStyle(button.parentElement!).flexWrap).toBe('wrap');
    expect(getComputedStyle(button).position).toBe('absolute');
  });

  it('stays focusable while disabled, with aria-disabled and no native disabled, and does not open', () => {
    setup({isDisabled: true});
    expect(trigger().hasAttribute('disabled')).toBe(false);
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    expect(trigger()).not.toHaveAttribute('tabindex');
    openSheet();
    expect(isSheetOpen()).toBe(false);
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it('describes a disabled trigger with its disabled reason', () => {
    setup({isDisabled: true, disabledMessage: 'Pick a project first'});
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.focus(trigger());
    expect(trigger().getAttribute('aria-describedby')).toBeTruthy();
    openSheet();
    expect(isSheetOpen()).toBe(false);
  });

  it('closes the flow and returns focus to the trigger when the field becomes disabled (AST-085 FR2)', () => {
    const {rerender} = setup({filters: [openFilter]});
    openEditFlow('Status is Open');
    expect(isSheetOpen()).toBe(true);
    rerender(
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={vi.fn()}
        experimental={{presentation: 'bottom-sheet'}}
        isDisabled
      />,
    );
    expect(isSheetOpen()).toBe(false);
    settleSheets();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    // Re-enabling does not reopen it.
    rerender(
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={vi.fn()}
        experimental={{presentation: 'bottom-sheet'}}
      />,
    );
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

  it('fires onBlur when the flow opens and onFocus when it closes, as the popover does around its editor (FR11)', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    setup({filters: [openFilter], onFocus, onBlur});
    openSheet();
    // Focus moved into the sheet's dialog, outside the field.
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Done'}));
    settleSheets();
    expect(trigger()).toHaveFocus();
    expect(onFocus).toHaveBeenCalledTimes(2);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('focuses the trigger through the imperative handle', () => {
    const handle = createRef<PowerSearchHandle>();
    setup({handleRef: handle});
    handle.current?.focusTypeahead();
    expect(trigger()).toHaveFocus();
    handle.current?.blurTypeahead();
    expect(trigger()).not.toHaveFocus();
  });

  it('forwards ref to the root, data-testid to the trigger, and the styling props to the field', () => {
    const ref = createRef<HTMLDivElement>();
    setup({
      ref,
      'data-testid': 'ps',
      className: 'custom-field',
      filters: [openFilter],
    });
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.contains(trigger())).toBe(true);
    expect(screen.getByTestId('ps')).toBe(trigger());
    expect(document.querySelector('.custom-field')).not.toBeNull();
  });

  it('renders an interactive endContent beside the trigger, with its own tab stop and taps (FR11)', () => {
    const onAction = vi.fn();
    setup({
      filters: [openFilter],
      resultCount: 4,
      endContent: (
        <button type="button" onClick={onAction}>
          Save view
        </button>
      ),
    });
    const action = screen.getByRole('button', {name: 'Save view'});
    // A sibling of the trigger, never a descendant of it; the end lane's
    // text is not part of the trigger's name.
    expect(trigger().contains(action)).toBe(false);
    expect(field().contains(action)).toBe(true);
    expect(trigger()).toHaveAccessibleName(/^Search Status: is ?Open$/);
    expect(screen.getByText('4 results')).toBeTruthy();
    // Its own tab stop: two tab stops in the field, the trigger and the action.
    expect(
      Array.from(field().querySelectorAll('button')).filter(
        element => element.tabIndex >= 0,
      ),
    ).toHaveLength(2);
    // Its own taps: the action fires and the flow stays closed.
    fireEvent.click(action);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(isSheetOpen()).toBe(false);
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
    // The empty space around the tokens still opens the flow.
    fireEvent.click(trigger().parentElement!);
    expect(isSheetOpen()).toBe(true);
  });

  it('keeps data-testid on the combobox input in the popover presentation', () => {
    render(
      <PowerSearch
        config={config}
        filters={[]}
        onChange={vi.fn()}
        data-testid="ps"
      />,
    );
    expect(screen.getByTestId('ps')).toBe(screen.getByRole('combobox'));
  });

  it('renders the result count and announces only a change to it, not the mount (FR19)', async () => {
    const {rerender} = render(
      <StrictMode>
        <PowerSearch
          config={config}
          filters={[]}
          onChange={vi.fn()}
          experimental={{presentation: 'bottom-sheet'}}
          resultCount={12}
        />
      </StrictMode>,
    );
    expect(screen.getByText('12 results')).toBeTruthy();
    const liveRegion = () =>
      document.querySelector('[data-astryx-live-region="polite"]');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(liveRegion()?.textContent ?? '').toBe('');
    rerender(
      <StrictMode>
        <PowerSearch
          config={config}
          filters={[]}
          onChange={vi.fn()}
          experimental={{presentation: 'bottom-sheet'}}
          resultCount={1}
        />
      </StrictMode>,
    );
    expect(screen.getByText('1 result')).toBeTruthy();
    await waitFor(() =>
      expect(liveRegion()?.textContent ?? '').toContain('1 result'),
    );
  });

  it('announces a result-count change inside the open sheet, and on the shared channel once closed (FR19; AST-086 FR14)', async () => {
    const spy = mockModalDialogs();
    try {
      const {rerender} = setup({filters: [openFilter], resultCount: 12});
      openSheet();
      const dialog = sheet();
      rerender(
        <PowerSearch
          config={config}
          filters={[openFilter]}
          onChange={vi.fn()}
          experimental={{presentation: 'bottom-sheet'}}
          resultCount={3}
        />,
      );
      await waitFor(() =>
        expect(modalLiveRegion(dialog)).toHaveTextContent('3 results'),
      );
      expect(modalLiveRegion(dialog)).toHaveAttribute('role', 'status');
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
      fireEvent.click(within(dialog).getByRole('button', {name: 'Done'}));
      settleSheets();
      rerender(
        <PowerSearch
          config={config}
          filters={[openFilter]}
          onChange={vi.fn()}
          experimental={{presentation: 'bottom-sheet'}}
          resultCount={1}
        />,
      );
      await waitFor(() =>
        expect(sharedLiveRegion()?.textContent ?? '').toContain('1 result'),
      );
    } finally {
      spy.mockRestore();
    }
  });

  function stubFlippableMatchMedia(initialCompact: boolean) {
    let compact = initialCompact;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return query === COMPACT_TOUCH_PRESENTATION_QUERY ? compact : false;
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) =>
          listeners.delete(cb),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    return (next: boolean) => {
      compact = next;
      act(() => {
        for (const cb of listeners) {
          cb();
        }
      });
    };
  }

  it('announces inside the modal that holds the field, in both presentations and after the flow closes (FR19, AR6; AST-086 FR14)', async () => {
    const spy = mockModalDialogs();
    try {
      // The field lives inside an open Astryx Dialog. Under FR14 its
      // announcements belong to that dialog's region: `useAnnounce` follows
      // the modal that encloses its caller.
      function Host({
        presentation,
        resultCount,
        filters,
        onChange,
      }: {
        presentation: 'popover' | 'bottom-sheet';
        resultCount: number;
        filters: ReadonlyArray<PowerSearchFilter>;
        onChange: (next: ReadonlyArray<PowerSearchFilter>) => void;
      }) {
        return (
          <Dialog isOpen onOpenChange={() => {}} aria-label="Settings">
            <PowerSearch
              config={config}
              filters={filters}
              onChange={onChange}
              resultCount={resultCount}
              experimental={{presentation}}
            />
          </Dialog>
        );
      }
      const noop = () => {};
      const {rerender} = render(
        <Host
          presentation="popover"
          resultCount={12}
          filters={[openFilter]}
          onChange={noop}
        />,
      );
      const host = screen.getByRole('dialog', {name: 'Settings'});
      // Popover presentation: a count change lands in the host dialog.
      rerender(
        <Host
          presentation="popover"
          resultCount={3}
          filters={[openFilter]}
          onChange={noop}
        />,
      );
      await waitFor(() =>
        expect(modalLiveRegion(host)).toHaveTextContent('3 results'),
      );
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
      // Sheet presentation, flow closed: the same.
      rerender(
        <Host
          presentation="bottom-sheet"
          resultCount={3}
          filters={[openFilter]}
          onChange={noop}
        />,
      );
      rerender(
        <Host
          presentation="bottom-sheet"
          resultCount={5}
          filters={[openFilter]}
          onChange={noop}
        />,
      );
      await waitFor(() =>
        expect(modalLiveRegion(host)).toHaveTextContent('5 results'),
      );
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
      // Clear all from the flow: its message, held until the sheet has gone,
      // then lands in the host dialog, not on the page body.
      const onChange = (next: ReadonlyArray<PowerSearchFilter>) => {
        rerender(
          <Host
            presentation="bottom-sheet"
            resultCount={next.length === 0 ? 240 : 5}
            filters={next}
            onChange={onChange}
          />,
        );
      };
      rerender(
        <Host
          presentation="bottom-sheet"
          resultCount={5}
          filters={[openFilter]}
          onChange={onChange}
        />,
      );
      openSheet();
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
      confirmClearAll();
      // Clear all leaves Filters open: its message lands in the Filters
      // sheet's own region once the confirmation has closed, never in the
      // host dialog's region or on the page body.
      expect(isSheetOpen()).toBe(true);
      const filtersSheet = screen.getByRole('dialog', {name: 'Filters'});
      await waitFor(() =>
        expect(modalLiveRegion(filtersSheet)).toHaveTextContent(
          'All filters removed. 240 results',
        ),
      );
      expect(modalLiveRegion(host)?.textContent ?? '').not.toContain(
        'All filters removed',
      );
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it("hands focus to the other presentation's control when adaptive flips while the closed field holds it, as one visit (FR10)", async () => {
    const flip = stubFlippableMatchMedia(true);
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    setup({presentation: 'adaptive', filters: [openFilter], onFocus, onBlur});
    // Trigger → combobox: the phone turned to landscape with the trigger
    // focused.
    trigger().focus();
    expect(trigger()).toHaveFocus();
    expect(onFocus).toHaveBeenCalledTimes(1);
    flip(false);
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    expect(document.querySelector(SHEET_TRIGGER)).toBeNull();
    expect(screen.getByRole('combobox')).toHaveFocus();
    // Combobox → trigger: back to a compact touch screen with the input
    // focused.
    flip(true);
    await waitFor(() =>
      expect(document.querySelector(SHEET_TRIGGER)).toBeTruthy(),
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
    // Both hand-offs continued the one visit: the caller saw the first focus
    // only, and no blur.
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).not.toHaveBeenCalled();
  });

  it('moves focus from any control the switch removes to the primary control (FR10)', async () => {
    const flip = stubFlippableMatchMedia(false);
    setup({
      presentation: 'adaptive',
      filters: [openFilter],
      endContent: <button type="button">Save view</button>,
    });
    // A token's remove button holds focus in the popover presentation; the
    // sheet presentation renders no remove button, so focus moves to the
    // trigger.
    screen.getByRole('button', {name: /^Remove/}).focus();
    flip(true);
    await waitFor(() =>
      expect(document.querySelector(SHEET_TRIGGER)).toBeTruthy(),
    );
    expect(trigger()).toHaveFocus();
    // `endContent` renders in both presentations, but each presentation
    // mounts its own element for it, so the focused one does not survive the
    // switch either: focus moves to the primary control.
    screen.getByRole('button', {name: 'Save view'}).focus();
    flip(false);
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    expect(screen.getByRole('combobox')).toHaveFocus();
    screen.getByRole('button', {name: 'Save view'}).focus();
    flip(true);
    await waitFor(() =>
      expect(document.querySelector(SHEET_TRIGGER)).toBeTruthy(),
    );
    expect(trigger()).toHaveFocus();
  });

  it('moves focus to the trigger when adaptive flips to the sheet while the editor popover is open (FR10)', async () => {
    const user = userEvent.setup();
    const flip = stubFlippableMatchMedia(false);
    // jsdom has no Popover API; track which layer elements were shown so the
    // test can tell an open layer from a mounted-but-closed one.
    const shown = new Set<HTMLElement>();
    HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
      shown.add(this);
    });
    HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
      shown.delete(this);
    });
    const openLayers = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[popover]')).filter(
        el => shown.has(el) || el.matches(':popover-open'),
      );
    setup({presentation: 'adaptive', filters: [openFilter]});
    // Open the popover presentation's editor on the token and focus a
    // control inside it (the popover is portaled, outside the field's root).
    await user.click(screen.getByText('Status: is'));
    const apply = await screen.findByRole('button', {
      name: 'Apply',
      hidden: true,
    });
    apply.focus();
    expect(apply).toHaveFocus();
    // The layer shows one frame after the editor state opens.
    await waitFor(() => expect(openLayers()).toHaveLength(1));
    // Rotate: the popover and its control unmount with the tokenizer field.
    flip(true);
    await waitFor(() =>
      expect(document.querySelector(SHEET_TRIGGER)).toBeTruthy(),
    );
    expect(
      screen.queryByRole('button', {name: 'Apply', hidden: true}),
    ).toBeNull();
    // Focus never fell to the body: the trigger has it.
    expect(trigger()).toHaveFocus();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
    // The sheet presentation renders no editor layer at all.
    expect(document.querySelectorAll('[popover]')).toHaveLength(0);
    // The edit ended with its surface: moving focus elsewhere and switching
    // back does not reopen a stale editor or pull focus into it.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    flip(false);
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(
      screen.queryByRole('button', {name: 'Apply', hidden: true}),
    ).toBeNull();
    expect(outside).toHaveFocus();
    // And the editor's layer did not come back open and empty for the next
    // Escape to close: the layer was hidden with its state at the swap (its
    // closed element is the field's normal idle mount).
    expect(openLayers()).toHaveLength(0);
    outside.remove();
  });

  it('applies hasAutoFocus on the first mount only: a resolution change with focus elsewhere leaves it there and reports no onFocus (FR10)', async () => {
    const flip = stubFlippableMatchMedia(false);
    const onFocus = vi.fn();
    render(
      <>
        <button type="button">Elsewhere</button>
        <PowerSearch
          config={config}
          filters={[openFilter]}
          onChange={() => {}}
          hasAutoFocus
          onFocus={onFocus}
          experimental={{presentation: 'adaptive'}}
        />
      </>,
    );
    // The first mount autofocused the combobox input.
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(onFocus).toHaveBeenCalledTimes(1);
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    elsewhere.focus();
    expect(elsewhere).toHaveFocus();
    // The swap remounts the field's control as a trigger; `autoFocus` must
    // not fire again.
    flip(true);
    await waitFor(() =>
      expect(document.querySelector(SHEET_TRIGGER)).toBeTruthy(),
    );
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(elsewhere).toHaveFocus();
    expect(onFocus).toHaveBeenCalledTimes(1);
    // And back.
    flip(false);
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(elsewhere).toHaveFocus();
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('leaves focus alone when adaptive flips while the closed field does not hold it (FR10)', async () => {
    const flip = stubFlippableMatchMedia(true);
    setup({presentation: 'adaptive', filters: [openFilter]});
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    flip(false);
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('keeps focus when adaptive stops resolving to the sheet while the flow is open, and the input takes over as one visit (FR10)', async () => {
    // A matchMedia stub whose match can flip, with a change listener the
    // test fires, as a phone turned to landscape would.
    let compact = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return query === COMPACT_TOUCH_PRESENTATION_QUERY ? compact : false;
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) =>
          listeners.delete(cb),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    setup({presentation: 'adaptive', filters: [openFilter], onFocus, onBlur});
    const button = trigger();
    openSheet();
    const dialog = sheet();
    within(dialog).getByRole('button', {name: 'Add filter'}).focus();
    // Opening the flow reported one blur (FR11).
    expect(onBlur).toHaveBeenCalledTimes(1);
    onFocus.mockClear();

    // The viewport stops being compact while the flow is open: nothing
    // changes until the flow closes.
    compact = false;
    act(() => {
      for (const cb of listeners) {
        cb();
      }
    });
    expect(sheet()).toBe(dialog);
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', {name: 'Done'}));
    // The flow is closing; the trigger stays mounted to take focus back, and
    // the tokenizer field does not appear yet.
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    settleSheets();
    // Focus came back to the trigger, the latch released into the popover
    // presentation, and the tokenizer input took the focus over.
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(document.querySelector(SHEET_TRIGGER)).toBeNull();
    // The close reported one focus (FR11, the trigger); the input taking
    // over is the same visit, so no second focus and no blur between.
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("renders a Token override on the trigger with the popover's props and its callbacks withheld (FR11)", () => {
    const seenProps = vi.fn();
    function CustomToken(props: PowerSearchTokenProps) {
      seenProps(props);
      return <span>Custom token</span>;
    }
    setup({filters: [openFilter], components: {enum: {Token: CustomToken}}});
    expect(screen.getByText('Custom token')).toBeTruthy();
    expect(
      trigger().parentElement!.contains(screen.getByText('Custom token')),
    ).toBe(true);
    // The same props the popover hands it — config, filter, field, operator,
    // maxLength, isDisabled — and `onClick`/`onRemove` undefined, as for a
    // read-only filter in the popover: the trigger's tokens are display-only.
    expect(seenProps).toHaveBeenLastCalledWith({
      config,
      filter: openFilter,
      field: config.fields[0],
      operator: config.fields[0].operators[0],
      maxLength: 40,
      onClick: undefined,
      onRemove: undefined,
      isDisabled: false,
    });
  });

  it('announces a row removal and Clear all inside the open Filters sheet (AR6)', async () => {
    const spy = mockModalDialogs();
    try {
      function Harness() {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([authorFilter, openFilter]);
        return (
          <PowerSearch
            config={config}
            filters={filters}
            onChange={next => setFilters(next)}
            // The count follows the filters, so Clear all changes it in the
            // same commit as the removal.
            resultCount={filters.length === 0 ? 240 : 12}
            experimental={{presentation: 'bottom-sheet'}}
          />
        );
      }
      render(<Harness />);
      openSheet();
      const filtersDialog = sheet();
      expect(filtersDialog).toHaveAttribute('aria-label', 'Filters');
      // A row's trailing remove action stays in Filters and speaks there at
      // once, naming the row's text, as the popover's token × names its token.
      fireEvent.click(removeButton('Status'));
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Removed Status is Open',
        ),
      );
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
      // Clear all asks first: nothing is removed or spoken while the
      // confirmation is the top modal.
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
      expect(clearConfirmation()).toBeTruthy();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(modalLiveRegion(filtersDialog)?.textContent ?? '').not.toMatch(
        /All filters removed|240 results/,
      );
      // Confirmed, the outcome and the count that changed with it are one
      // announcement in the still-open Filters sheet.
      confirmClearAll();
      expect(isSheetOpen()).toBe(true);
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'All filters removed. 240 results',
        ),
      );
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it('words Clear all as "Editable filters removed" while a read-only filter remains (AR6)', async () => {
    const spy = mockModalDialogs();
    try {
      const pinned: PowerSearchFilter = {...openFilter, isReadOnly: true};
      function Harness({resultCount}: {resultCount?: number}) {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([authorFilter, pinned]);
        return (
          <PowerSearch
            config={config}
            filters={filters}
            onChange={next => setFilters(next)}
            resultCount={resultCount}
            experimental={{presentation: 'bottom-sheet'}}
          />
        );
      }
      render(<Harness />);
      openSheet();
      const filtersDialog = sheet();
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
      confirmClearAll();
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Editable filters removed',
        ),
      );
      expect(modalLiveRegion(filtersDialog)?.textContent ?? '').not.toContain(
        'All filters removed',
      );
      // The kept read-only row is plain, so the first remaining control is
      // Add filter.
      expect(
        within(sheet()).getByRole('button', {name: 'Add filter'}),
      ).toHaveFocus();
    } finally {
      spy.mockRestore();
    }
  });
});

// =============================================================================
// Filters sheet (FR12)
// =============================================================================

describe('PowerSearch Filters sheet (FR12)', () => {
  it('shows selected filters as editable rows with trailing remove actions and bold values', () => {
    setup({filters: [openFilter]});
    openSheet();
    const list = within(sheet()).getByRole('list');
    const row = within(list).getByRole('button', {name: 'Status is Open'});
    expect(within(row).getByText('Open')).toHaveStyle({
      fontWeight: 'var(--font-weight-bold)',
    });
    const remove = within(list).getByRole('button', {
      name: 'Remove Status filter',
    });
    // An icon button: no chevron, and the remove glyph is the row's only
    // icon.
    expect(remove.querySelector('svg')).toBeTruthy();
    expect(list.querySelectorAll('svg')).toHaveLength(1);
  });

  it('removes a filter from its row without opening the step, with exact remove metadata (FR12, FR15)', () => {
    const {onChange} = setup({filters: [authorFilter, openFilter]});
    openSheet();
    fireEvent.click(removeButton('Status'));
    expect(onChange).toHaveBeenCalledWith([authorFilter], 'remove', 1);
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
  });

  it('removes a one-tap filter with a tap on its row or its remove action, not a checked indicator (FR12)', () => {
    const unassigned: PowerSearchFilter = {
      field: 'unassigned',
      operator: 'isTrue',
      value: {type: 'empty'},
    };
    const {onChange} = setup({filters: [unassigned]});
    openSheet();
    const remove = removeButton('Unassigned');
    expect(remove.querySelector('svg')).toBeTruthy();
    expect(within(sheet()).queryByRole('checkbox')).toBeNull();
    tapRow('Unassigned is true');
    expect(onChange).toHaveBeenLastCalledWith([], 'remove', 0);
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
    fireEvent.click(remove);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('shows one centered Add filter and no header action, Done or Clear all when no filter is applied (FR12)', () => {
    function EmptyStateHarness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        openFilter,
      ]);
      return (
        <PowerSearch
          config={config}
          filters={filters}
          onChange={next => setFilters(next)}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    render(<EmptyStateHarness />);
    openSheet();
    fireEvent.click(removeButton('Status'));
    expect(
      within(sheet()).getByRole('heading', {name: 'No filters applied'}),
    ).toBeTruthy();
    const addActions = within(sheet()).getAllByRole('button', {
      name: 'Add filter',
    });
    expect(addActions).toHaveLength(1);
    expect(addActions[0]).toHaveAttribute('data-variant', 'primary');
    // After the last removal, focus lands on that one action.
    expect(addActions[0]).toHaveFocus();
    expect(within(sheet()).queryByRole('button', {name: 'Done'})).toBeNull();
    expect(
      within(sheet()).queryByRole('button', {name: 'Clear all'}),
    ).toBeNull();
    fireEvent.click(addActions[0]);
    expect(
      within(sheet()).getByRole('heading', {name: 'Add filter'}),
    ).toBeTruthy();
  });

  it('keeps the header with the Add filter icon and the footer with Clear all and Done fixed around a scroll viewport (FR12)', () => {
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
    expect(add.textContent).toBe('');
    expect(done).toHaveAttribute('data-variant', 'primary');
    expect(clearAll).toHaveAttribute('data-variant', 'secondary');
    expect(getComputedStyle(clearAll).flexGrow).toBe('1');
    expect(getComputedStyle(done).flexGrow).toBe('1');
    // Only the rows scroll: the footer is outside the viewport.
    const footer = clearAll.parentElement!;
    expect(getComputedStyle(footer).position).toBe('relative');
    const viewport = list.closest<HTMLElement>('[class*="scrollViewport"]')!;
    expect(viewport).not.toBeNull();
    expect(getComputedStyle(viewport).overflowY).toBe('auto');
    expect(viewport.contains(footer)).toBe(false);
    expect(viewport.contains(heading)).toBe(false);
  });

  it('grows each icon-sized action to a 44px hit area under a coarse pointer, without resizing it (AR5)', () => {
    setup({filters: [openFilter]});
    openSheet();
    const rules: string[] = [];
    for (const styleSheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(styleSheet.cssRules)) {
        rules.push(rule.cssText);
      }
    }
    const hasRule = (element: HTMLElement, pattern: RegExp) =>
      Array.from(element.classList).some(className =>
        rules.some(
          text => text.includes(`.${className}`) && pattern.test(text),
        ),
      );
    for (const action of [
      within(sheet()).getByRole('button', {name: 'Add filter'}),
      removeButton('Status'),
    ]) {
      expect(
        hasRule(action, /--_power-search-sheet-hit-inset:\s*min\(0px/),
      ).toBe(true);
      expect(hasRule(action, /--_power-search-sheet-hit-content:\s*none/)).toBe(
        true,
      );
    }
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

  it('clears editable filters behind a confirmation, keeps Filters open, and focuses Add filter (FR12, FR16)', () => {
    const onChange = vi.fn();
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        authorFilter,
        openFilter,
      ]);
      return (
        <PowerSearch
          config={config}
          filters={filters}
          onChange={(next, type, index) => {
            onChange(next, type, index);
            setFilters(next);
          }}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    render(<Harness />);
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
    expect(onChange).not.toHaveBeenCalled();
    const confirmation = clearConfirmation();
    expect(
      within(confirmation).getByText(
        'This removes all editable filters from this search.',
      ),
    ).toBeTruthy();
    // The safe action takes focus first.
    expect(
      within(confirmation).getByRole('button', {name: 'Keep filters'}),
    ).toHaveFocus();
    confirmClearAll();
    expect(onChange).toHaveBeenCalledWith([], 'remove', 0);
    expect(
      screen.queryByRole('alertdialog', {name: 'Clear all filters?'}),
    ).toBeNull();
    expect(isSheetOpen()).toBe(true);
    expect(
      within(sheet()).getByRole('heading', {name: 'No filters applied'}),
    ).toBeTruthy();
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toHaveFocus();
    expect(within(field()).queryByText('Open')).toBeNull();
  });

  it('keeps read-only filters on Clear all, reporting the first removed index (FR12)', () => {
    const pinned: PowerSearchFilter = {...openFilter, isReadOnly: true};
    const {onChange} = setup({filters: [pinned, authorFilter]});
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
    confirmClearAll();
    expect(onChange).toHaveBeenCalledWith([pinned], 'remove', 1);
    expect(isSheetOpen()).toBe(true);
  });

  it('returns to Filters unchanged when the confirmation is dismissed or kept (FR12)', () => {
    const {onChange} = setup({filters: [openFilter]});
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
    // A scrim press, which starts and ends on the dialog itself, dismisses
    // the confirmation and returns focus to Clear all.
    const confirmation = clearConfirmation();
    fireEvent.pointerDown(confirmation);
    fireEvent.pointerUp(confirmation);
    fireEvent.click(confirmation);
    expect(
      screen.queryByRole('alertdialog', {name: 'Clear all filters?'}),
    ).toBeNull();
    expect(
      within(sheet()).getByRole('button', {name: 'Clear all'}),
    ).toHaveFocus();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
    fireEvent.click(
      within(clearConfirmation()).getByRole('button', {name: 'Keep filters'}),
    );
    expect(
      screen.queryByRole('alertdialog', {name: 'Clear all filters?'}),
    ).toBeNull();
    expect(
      within(sheet()).getByRole('button', {name: 'Clear all'}),
    ).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    expect(isSheetOpen()).toBe(true);
    expect(within(sheet()).getByText('Status is')).toBeTruthy();
  });

  it('hides Clear all when every filter is read-only', () => {
    setup({filters: [{...openFilter, isReadOnly: true}]});
    openSheet();
    expect(
      within(sheet()).queryByRole('button', {name: 'Clear all'}),
    ).toBeNull();
    expect(within(sheet()).getByRole('button', {name: 'Done'})).toBeTruthy();
  });

  it('closes the Clear all confirmation with the flow when the field becomes disabled', () => {
    const {rerender} = setup({filters: [openFilter]});
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
    expect(clearConfirmation()).toBeTruthy();
    rerender(
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={vi.fn()}
        experimental={{presentation: 'bottom-sheet'}}
        isDisabled
      />,
    );
    expect(
      screen.queryByRole('alertdialog', {name: 'Clear all filters?'}),
    ).toBeNull();
    expect(isSheetOpen()).toBe(false);
  });

  it('drops a focus target left pending when the flow closes, so a reopen does not move focus to it', () => {
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        openFilter,
      ]);
      const [isDisabled, setIsDisabled] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsDisabled(false)}>
            Enable
          </button>
          <PowerSearch
            config={config}
            filters={filters}
            isDisabled={isDisabled}
            // The commit that queues focus on Add filter also disables the
            // field, which closes the flow before that focus lands.
            onChange={next => {
              setFilters(next);
              setIsDisabled(true);
            }}
            experimental={{presentation: 'bottom-sheet'}}
          />
        </>
      );
    }
    render(<Harness />);
    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Add filter'}));
    tapRow('Status');
    tapRow('Closed');
    addFilter();
    expect(isSheetOpen()).toBe(false);
    // Reopened before the closing sheets finish their exit, so the flow is
    // still mounted.
    fireEvent.click(screen.getByRole('button', {name: 'Enable'}));
    openSheet();
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).not.toHaveFocus();
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

  it("lists a nested filter as a row whose step edits it with the popover's built-in nested editor, plain while read-only (FR12, FR14)", async () => {
    const spy = mockModalDialogs();
    try {
      const withNested: PowerSearchConfig = {
        name: 'Nested',
        fields: [
          ...config.fields,
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
      const nestedFilter: PowerSearchFilter = {
        field: 'mixed',
        operator: 'all',
        value: {type: 'nested', value: [openFilter]},
      };
      const onChange = vi.fn();
      function Harness({readOnly}: {readOnly?: boolean}) {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([openFilter, nestedFilter]);
        return (
          <PowerSearch
            config={withNested}
            filters={filters}
            onChange={(next, type, index) => {
              onChange(next, type, index);
              setFilters(next);
            }}
            isReadOnly={readOnly}
            experimental={{presentation: 'bottom-sheet'}}
          />
        );
      }
      const {unmount} = render(<Harness />);
      openSheet();
      // The row is a button; its step holds the popover's built-in nested
      // editor (the sub-filter tree with its Add action) and the Operator
      // group for the field's two operators, each in its own section, and no
      // Remove: the row's trailing action removes it.
      fireEvent.click(
        within(sheet()).getByRole('button', {name: 'Mixed all of 1 filter'}),
      );
      expect(within(sheet()).getByRole('tree')).toBeTruthy();
      expect(
        within(sheet()).getByRole('button', {name: '+ Add filter'}),
      ).toBeTruthy();
      expect(
        within(sheet()).getByRole('radio', {name: 'Mixed all of'}),
      ).toBeChecked();
      expect(within(sheet()).getByRole('button', {name: 'Apply'})).toBeTruthy();
      expect(
        within(sheet()).queryByRole('button', {name: 'Remove'}),
      ).toBeNull();
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
      // The value step finishes its exit before the removal.
      settleSheets();
      fireEvent.click(removeButton('Mixed'));
      expect(onChange).toHaveBeenCalledWith([openFilter], 'remove', 1);
      const filtersDialog = sheet();
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Removed Mixed all of 1 filter',
        ),
      );
      unmount();
      // Read-only field: a plain row.
      render(<Harness readOnly />);
      openSheet();
      expect(within(sheet()).getByText(/^Mixed all of/)).toBeTruthy();
      expect(
        within(sheet()).queryByRole('button', {name: /^Mixed all of/}),
      ).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('lists a stale filter as a plain row when it, or the field, is read-only (FR12)', () => {
    const orphan: PowerSearchFilter = {
      field: 'legacy',
      operator: 'was',
      value: {type: 'string', value: 'x'},
    };
    const {unmount} = setup({filters: [{...orphan, isReadOnly: true}]});
    openSheet();
    expect(within(sheet()).getByText(/^legacy was/)).toBeTruthy();
    expect(
      within(sheet()).queryByRole('button', {name: /^legacy was/}),
    ).toBeNull();
    unmount();
    setup({filters: [orphan], isReadOnly: true});
    openSheet();
    expect(within(sheet()).getByText(/^legacy was/)).toBeTruthy();
    expect(
      within(sheet()).queryByRole('button', {name: /^legacy was/}),
    ).toBeNull();
  });

  it("mirrors the field rows' chevrons in right-to-left layouts, and no sheet has a Back action (DR4, FR15a)", () => {
    const {className: mirrorClassName} = stylex.props(rtlStyles.mirror);
    const mirrorClasses = mirrorClassName?.split(' ') ?? [];
    expect(mirrorClasses.length).toBeGreaterThan(0);
    // The Icon applies `xstyle` to its wrapper, the element that holds the
    // glyph.
    const hasMirror = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('*')).some(el =>
        mirrorClasses.every(c => el.classList.contains(c)),
      );
    render(
      <div dir="rtl" style={{direction: 'rtl'}}>
        <PowerSearch
          config={config}
          filters={[openFilter]}
          onChange={vi.fn()}
          experimental={{presentation: 'bottom-sheet'}}
        />
      </div>,
    );
    openSheet();
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    tapRow('Add filter');
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    // Every field row's chevron points into the row's reading direction once
    // flipped; a one-tap field's plus is not mirrored.
    const statusRow = within(sheet())
      .getByRole('button', {name: 'Status'})
      .closest('li')!;
    expect(hasMirror(statusRow)).toBe(true);
    const unassignedRow = within(sheet())
      .getByRole('button', {name: 'Unassigned'})
      .closest('li')!;
    expect(hasMirror(unassignedRow)).toBe(false);
  });

  it("offers a nested-only field and its suggestion, and creates the filter through the popover's built-in nested editor (FR13, FR14)", async () => {
    const nestedOnly: PowerSearchConfig = {
      name: 'NestedOnly',
      contentSearchFieldKey: 'author',
      fields: [
        ...config.fields,
        {
          key: 'group',
          label: 'Group',
          operators: [{key: 'all', label: 'all of', value: {type: 'nested'}}],
        },
      ],
    };
    const {onChange} = setup({config: nestedOnly});
    openAddFlow();
    expect(within(sheet()).getByRole('button', {name: 'Group'})).toBeTruthy();
    fireEvent.change(within(sheet()).getByRole('searchbox', {name: 'Search'}), {
      target: {value: 'Gro'},
    });
    const suggestion = await within(sheet()).findByRole('button', {
      name: /^Group all of/,
    });
    fireEvent.click(suggestion);
    // One operator: no group, the title names the operator the step opened
    // with, and the body is the built-in nested editor. The primary action
    // ("Add filter" when creating) waits for a complete sub-filter.
    expect(
      within(sheet()).getByRole('heading', {name: 'Group all of'}),
    ).toBeTruthy();
    expect(within(sheet()).queryByRole('radiogroup')).toBeNull();
    expect(within(sheet()).getByRole('tree')).toBeTruthy();
    const primary = () =>
      within(sheet())
        .getAllByRole('button', {name: 'Add filter'})
        .find(button => button.closest('[role="tree"]') == null) as HTMLElement;
    expect(primary()).toBeDisabled();
    fireEvent.click(
      within(sheet()).getByRole('button', {name: '+ Add filter'}),
    );
    // The new sub-filter takes the first field (Status) and its default
    // operator; pick a value from the row's own Value selector to complete it.
    const valuePicker = within(sheet()).getByRole('combobox', {name: 'Value'});
    fireEvent.click(valuePicker);
    const listbox = document.getElementById(
      valuePicker.getAttribute('aria-controls') as string,
    ) as HTMLElement;
    fireEvent.click(
      within(listbox).getByRole('option', {name: 'Open', hidden: true}),
    );
    expect(primary()).toBeEnabled();
    fireEvent.click(primary());
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          field: 'group',
          operator: 'all',
          value: {type: 'nested', value: [openFilter]},
        },
      ],
      'add',
      0,
    );
  });

  it("checks the operator a suggestion opened the step with, not the field's default (FR13, FR14)", async () => {
    setup({config: contentSearchConfig});
    openAddFlow();
    fireEvent.change(within(sheet()).getByRole('searchbox', {name: 'Search'}), {
      target: {value: 'status is not'},
    });
    fireEvent.click(
      await within(sheet()).findByRole('button', {name: /^Status is not$/}),
    );
    expect(
      within(sheet()).getByRole('radio', {name: 'Status is not'}),
    ).toBeChecked();
    expect(
      within(sheet()).getByRole('radio', {name: 'Status is'}),
    ).not.toBeChecked();
  });

  it("keeps the Operator group outside a caller's Editor override, so a mixed field's other operator is still reachable (FR14)", () => {
    const mixed: PowerSearchConfig = {
      name: 'Mixed',
      fields: [
        ...config.fields,
        {
          key: 'mixed',
          label: 'Mixed',
          operators: [
            {key: 'all', label: 'all of', value: {type: 'nested'}},
            {key: 'is', label: 'is', value: {type: 'string'}},
          ],
          defaultOperator: 'all',
        },
      ],
    };
    const seen = vi.fn();
    function NestedEditor(props: PowerSearchEditorProps) {
      seen(props.filter.operator);
      return <div>Custom nested editor</div>;
    }
    setup({config: mixed, components: {nested: {Editor: NestedEditor}}});
    openAddFlow();
    tapRow('Mixed');
    // Opened on the default (nested) operator: the override is the body, the
    // group sits above it, and the title is the field alone.
    expect(within(sheet()).getByRole('heading', {name: 'Mixed'})).toBeTruthy();
    expect(within(sheet()).getByText('Custom nested editor')).toBeTruthy();
    expect(seen).toHaveBeenLastCalledWith('all');
    expect(
      within(sheet()).getByRole('radio', {name: 'Mixed all of'}),
    ).toBeChecked();
    // Switching the operator swaps the body for the sheet's own editor.
    fireEvent.click(within(sheet()).getByRole('radio', {name: 'Mixed is'}));
    expect(within(sheet()).queryByText('Custom nested editor')).toBeNull();
    expect(within(sheet()).getByRole('textbox')).toBeTruthy();
    // And back.
    fireEvent.click(within(sheet()).getByRole('radio', {name: 'Mixed all of'}));
    expect(within(sheet()).getByText('Custom nested editor')).toBeTruthy();
  });

  it('shows each group its own sub-filters when two groups on one field are edited in a row (FR14)', async () => {
    const withGroup: PowerSearchConfig = {
      name: 'Groups',
      fields: [
        ...config.fields,
        {
          key: 'group',
          label: 'Group',
          operators: [{key: 'all', label: 'all of', value: {type: 'nested'}}],
        },
      ],
    };
    const statusGroup: PowerSearchFilter = {
      field: 'group',
      operator: 'all',
      value: {type: 'nested', value: [openFilter]},
    };
    const authorGroup: PowerSearchFilter = {
      field: 'group',
      operator: 'all',
      value: {type: 'nested', value: [authorFilter]},
    };
    const onChange = vi.fn();
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        statusGroup,
        authorGroup,
      ]);
      return (
        <PowerSearch
          config={withGroup}
          filters={filters}
          onChange={(next, type, index) => {
            onChange(next, type, index);
            setFilters(next);
          }}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    render(<Harness />);
    openSheet();
    const rows = () =>
      within(sheet()).getAllByRole('button', {name: 'Group all of 1 filter'});
    // First group: its sub-filter is on Status.
    fireEvent.click(rows()[0]);
    const subField = () =>
      within(sheet())
        .getAllByRole('combobox', {name: 'Field'})
        .map(el => el.textContent);
    expect(subField()).toEqual(['Status']);
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    // Second group, same field and operator: the step remounts its editor
    // for the newly opened filter, so it shows this group's sub-filter, not
    // the first group's.
    fireEvent.click(rows()[1]);
    expect(subField()).toEqual(['Author']);
    // Saving writes this group, unchanged, at its own index.
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Apply'}));
    expect(onChange).toHaveBeenCalledWith(
      [statusGroup, authorGroup],
      'edit',
      1,
    );
    // And reopening the first group again shows the first group's content.
    fireEvent.click(rows()[0]);
    expect(subField()).toEqual(['Status']);
  });

  it('mounts nothing of the flow at rest: the trigger alone before a press and again after the exit (INV7)', async () => {
    setup({filters: [openFilter]});
    // Before any press: no dialog, no sheet content.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(document.querySelector('dialog')).toBeNull();
    expect(screen.queryByText('Add filter')).toBeNull();
    expect(screen.queryByRole('heading', {name: 'Filters'})).toBeNull();
    openSheet();
    expect(document.querySelectorAll('dialog').length).toBeGreaterThan(0);
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Done'}));
    // Closing: the sheets stay mounted through their exit, then leave once
    // focus is back on the trigger.
    expect(document.querySelector('dialog')).not.toBeNull();
    settleSheets();
    await waitFor(() => expect(trigger()).toHaveFocus());
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(screen.queryByRole('heading', {name: 'Filters'})).toBeNull();
  });

  it('returns focus to the nearest row when Apply or Cancel finds the edited filter gone after a controlled update (FR15, FR16)', () => {
    const third: PowerSearchFilter = {
      field: 'status',
      operator: 'is',
      value: {type: 'enum', value: 'closed'},
    };
    function Harness({filters}: {filters: ReadonlyArray<PowerSearchFilter>}) {
      return (
        <PowerSearch
          config={config}
          filters={filters}
          onChange={() => {}}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    // Apply: the edited (middle) filter is removed while its step is open.
    const {rerender, unmount} = render(
      <Harness filters={[openFilter, authorFilter, third]} />,
    );
    openEditFlow('Author is Ada');
    rerender(<Harness filters={[openFilter, third]} />);
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Apply'}));
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
    // Nothing was written, and focus is on the row that followed it.
    expect(
      within(sheet()).getByRole('button', {name: 'Status is Closed'}),
    ).toHaveFocus();
    unmount();
    // Cancel, with no row left: Add filter.
    const second = render(<Harness filters={[authorFilter]} />);
    openEditFlow('Author is Ada');
    second.rerender(<Harness filters={[]} />);
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toHaveFocus();
  });

  it("falls back to the Add filter sheet's first control when Cancel from creation finds the opening field row gone (FR14, FR16)", () => {
    function Harness({cfg}: {cfg: PowerSearchConfig}) {
      return (
        <PowerSearch
          config={cfg}
          filters={[]}
          onChange={() => {}}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    // Few fields: no search field, so the fallback is the first field row.
    const {rerender, unmount} = render(<Harness cfg={config} />);
    openAddFlow();
    tapRow('Author');
    const without = {
      ...config,
      fields: config.fields.filter(f => f.key !== 'author'),
    };
    rerender(<Harness cfg={without} />);
    expect(
      within(sheet()).getByText('This filter is no longer available'),
    ).toBeTruthy();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    expect(
      within(sheet()).getByRole('heading', {name: 'Add filter'}),
    ).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Author'})).toBeNull();
    const firstRow = within(sheet())
      .getAllByRole('button')
      .find(b => b.closest('li') != null) as HTMLElement;
    expect(firstRow).toHaveFocus();
    unmount();
    // Many fields: the search field shows, and takes the focus instead.
    const many: PowerSearchConfig = {
      name: 'Many',
      fields: Array.from({length: 9}, (_, i) => ({
        key: `f${i}`,
        label: `Field ${i}`,
        operators: [{key: 'is', label: 'is', value: {type: 'string'} as const}],
      })),
    };
    const second = render(<Harness cfg={many} />);
    openAddFlow();
    tapRow('Field 3');
    second.rerender(
      <Harness
        cfg={{...many, fields: many.fields.filter(f => f.key !== 'f3')}}
      />,
    );
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    expect(
      within(sheet()).getByRole('textbox', {name: 'Search filters'}),
    ).toHaveFocus();
  });

  describe('a controlled update that removes the focused control (FR16)', () => {
    const third: PowerSearchFilter = {
      field: 'status',
      operator: 'is',
      value: {type: 'enum', value: 'closed'},
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
        <PowerSearch
          config={cfg}
          filters={filters}
          onChange={() => {}}
          hasClear={hasClear}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }

    it('moves focus from a removed Filters row to the nearest remaining row by index', () => {
      const {rerender} = render(
        <Harness filters={[openFilter, authorFilter, third]} />,
      );
      openSheet();
      within(sheet()).getByRole('button', {name: 'Author is Ada'}).focus();
      // The focused (middle) row is removed by the parent.
      rerender(<Harness filters={[openFilter, third]} />);
      expect(
        within(sheet()).getByRole('button', {name: 'Status is Closed'}),
      ).toHaveFocus();
      // The focused (now last) row is removed: the new last row takes focus.
      within(sheet()).getByRole('button', {name: 'Status is Closed'}).focus();
      rerender(<Harness filters={[openFilter]} />);
      expect(
        within(sheet()).getByRole('button', {name: 'Status is Open'}),
      ).toHaveFocus();
    });

    it('keeps focus on the same filter when the parent reorders the filters (FR12, FR16)', () => {
      const {rerender} = render(
        <Harness filters={[openFilter, authorFilter, third]} />,
      );
      openSheet();
      const authorRow = within(sheet()).getByRole('button', {
        name: 'Author is Ada',
      });
      authorRow.focus();
      // Same objects, new order: the row moves, its element stays.
      rerender(<Harness filters={[third, openFilter, authorFilter]} />);
      expect(within(sheet()).getByRole('button', {name: 'Author is Ada'})).toBe(
        authorRow,
      );
      expect(authorRow).toHaveFocus();
      // Cloned objects, new order: the row is matched by its signature.
      rerender(
        <Harness filters={[{...authorFilter}, {...third}, {...openFilter}]} />,
      );
      expect(within(sheet()).getByRole('button', {name: 'Author is Ada'})).toBe(
        authorRow,
      );
      expect(authorRow).toHaveFocus();
    });

    it('keeps focus on the same filter when the parent removes a filter above it (FR12, FR16)', () => {
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
      expect(within(sheet()).getByRole('button', {name: 'Author is Ada'})).toBe(
        authorRow,
      );
      // Not the row at the old index.
      expect(
        within(sheet()).getByRole('button', {name: 'Status is Closed'}),
      ).not.toHaveFocus();
    });

    it('counts rows in one index space — plain read-only rows above the removed row are not counted (FR16)', () => {
      const readOnlyFirst: PowerSearchFilter = {
        ...openFilter,
        isReadOnly: true,
      };
      const fourth: PowerSearchFilter = {
        field: 'author',
        operator: 'is',
        value: {type: 'string', value: 'Grace'},
      };
      const {rerender} = render(
        <Harness filters={[readOnlyFirst, authorFilter, third, fourth]} />,
      );
      openSheet();
      // Row 0 is plain (read-only); the focused Author row is button row 0.
      within(sheet()).getByRole('button', {name: 'Author is Ada'}).focus();
      rerender(<Harness filters={[readOnlyFirst, third, fourth]} />);
      // The row that followed it — not one row too far (counting the plain
      // row would land on "Author is Grace").
      expect(
        within(sheet()).getByRole('button', {name: 'Status is Closed'}),
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
      expect(
        within(sheet()).getByRole('button', {name: 'Add filter'}),
      ).toHaveFocus();
    });

    it("moves focus from a dropped field's row in Add filter to the nearest remaining row", () => {
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

  it('shows "No filters match your search" only for a non-empty query: a config with no field lists nothing (FR13)', () => {
    setup({config: {name: 'Empty', fields: []}});
    openSheet();
    // No filter and no field: Add filter opens directly, and shows no
    // "no match" message for a query nobody typed.
    expect(
      within(sheet()).getByRole('heading', {name: 'Add filter'}),
    ).toBeTruthy();
    expect(
      within(sheet()).queryByText('No filters match your search'),
    ).toBeNull();
  });

  it("keeps the content searchbox's aria-controls pointing at an element while nothing lists (FR13)", async () => {
    const noContent: PowerSearchConfig = {
      name: 'NoContent',
      contentSearchFieldKey: 'author',
      fields: [
        {
          key: 'author',
          label: 'Author',
          isValueMatchAllowed: false,
          typeaheadMinQueryLength: 99,
          operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
        },
      ],
    };
    setup({config: noContent});
    openSheet();
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    const controlled = () =>
      document.getElementById(input.getAttribute('aria-controls') as string);
    // With results listed, the list.
    expect(controlled()).toBe(within(sheet()).getByRole('list'));
    // With a dead-end query, the empty-result message.
    fireEvent.change(input, {target: {value: 'Author'}});
    expect(controlled()).toHaveTextContent('No results found');
    // With an empty query and no bootstrap suggestion — here the free-text
    // item lists, so clear to a query that lists nothing: the message again.
    fireEvent.change(input, {target: {value: ''}});
    expect(controlled()).not.toBeNull();
    expect(sheet().contains(controlled())).toBe(true);
  });

  it("lists ungrouped fields first even when the config's first field is grouped, as the popover's suggestions do (FR13)", () => {
    const groupedFirst: PowerSearchConfig = {
      name: 'GroupedFirst',
      fields: [
        {
          key: 'owner',
          label: 'Owner',
          group: 'People',
          operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
        },
        {
          key: 'title',
          label: 'Title',
          operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
        },
        {
          key: 'reviewer',
          label: 'Reviewer',
          group: 'People',
          operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
        },
        {
          key: 'due',
          label: 'Due',
          group: 'Dates',
          operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
        },
      ],
    };
    setup({config: groupedFirst});
    openAddFlow();
    const names = within(sheet())
      .getAllByRole('button')
      .filter(button => button.closest('li') != null)
      .map(button => button.textContent?.trim());
    // Ungrouped first, then the groups in first-appearance order.
    expect(names).toEqual(['Title', 'Owner', 'Reviewer', 'Due']);
    const lists = within(sheet()).getAllByRole('list');
    expect(lists).toHaveLength(3);
    expect(within(sheet()).getByText('People')).toBeTruthy();
    expect(within(sheet()).getByText('Dates')).toBeTruthy();
  });

  it("renders a caller's nested Editor override in a nested filter's step, with the popover's props (FR12, FR14)", () => {
    const withNested: PowerSearchConfig = {
      name: 'Nested',
      fields: [
        ...config.fields,
        {
          key: 'mixed',
          label: 'Mixed',
          operators: [{key: 'all', label: 'all of', value: {type: 'nested'}}],
        },
      ],
    };
    const nestedFilter: PowerSearchFilter = {
      field: 'mixed',
      operator: 'all',
      value: {type: 'nested', value: [openFilter]},
    };
    const seenProps = vi.fn();
    const saved: PowerSearchFilter = {
      ...nestedFilter,
      value: {type: 'nested', value: [openFilter, authorFilter]},
    };
    function NestedEditor(props: PowerSearchEditorProps) {
      seenProps(props);
      return (
        <button type="button" onClick={() => props.onSave(saved)}>
          Save group
        </button>
      );
    }
    const {onChange} = setup({
      config: withNested,
      filters: [nestedFilter],
      components: {nested: {Editor: NestedEditor}},
    });
    openSheet();
    fireEvent.click(
      within(sheet()).getByRole('button', {name: 'Mixed all of 1 filter'}),
    );
    // The override replaces the body and footer, as it does in the popover,
    // and receives the popover's props; no remove-only message shows.
    expect(
      within(sheet()).queryByText("This filter can't be edited here"),
    ).toBeNull();
    expect(seenProps).toHaveBeenLastCalledWith({
      config: withNested,
      filter: nestedFilter,
      mode: 'edit',
      saveButtonLabel: 'Apply',
      isReadOnly: false,
      onSave: expect.any(Function),
      onCancel: expect.any(Function),
    });
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Save group'}));
    expect(onChange).toHaveBeenCalledWith([saved], 'edit', 0);
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
});

// =============================================================================
// Add filter (FR13)
// =============================================================================

describe('PowerSearch Add filter (FR13)', () => {
  it("keeps the value step's sticky header and footer above the body that scrolls under them, without covering the grab handle", () => {
    setup({filters: [openFilter]});
    openEditFlow('Status is Open');
    const title = within(sheet()).getByRole('heading', {name: 'Status'});
    // The title sits in the sticky header; the header's parent is the sheet
    // content wrapper.
    let header: HTMLElement | null = title;
    while (header && getComputedStyle(header).position !== 'sticky') {
      header = header.parentElement;
    }
    expect(header).not.toBeNull();
    const content = header!.parentElement!;
    let footer: HTMLElement | null = within(sheet()).getByRole('button', {
      name: 'Apply',
    });
    while (footer && getComputedStyle(footer).position !== 'sticky') {
      footer = footer.parentElement;
    }
    // jsdom resolves the injected StyleX rules: the header and footer have a
    // layer above the List rows (position: relative, z-index auto) between
    // them...
    expect(getComputedStyle(header!).zIndex).toBe('1');
    expect(footer).not.toBeNull();
    expect(getComputedStyle(footer!).zIndex).toBe('1');
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

  it('closes to the trigger from the footer Done when Add filter was the entry point, with no Back, Close or Cancel (FR13)', () => {
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

  it('closes the flow when Add filter, the entry point, is dismissed (FR15a)', () => {
    setup();
    openSheet();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    expect(isSheetOpen()).toBe(false);
    settleSheets();
    expect(trigger()).toHaveFocus();
  });

  it('reveals Filters and focuses Add filter when Add filter is dismissed from management (FR15a, FR16)', () => {
    setup({filters: [openFilter]});
    openAddFlow();
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    expect(within(sheet()).queryByRole('button', {name: 'Done'})).toBeNull();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    expect(isSheetOpen()).toBe(true);
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toHaveFocus();
  });

  it('lists the fields, ungrouped first under "General", then each group, with chevrons (FR13)', () => {
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

  it("focuses a directly added filter's row, not its remove action, after the last editable filter was removed (FR16)", () => {
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        openFilter,
      ]);
      return (
        <PowerSearch
          config={config}
          filters={filters}
          onChange={next => setFilters(next)}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    render(<Harness />);
    openSheet();
    // Removing the last editable filter sends focus to Add filter, not to a
    // remove action.
    fireEvent.click(removeButton('Status'));
    const addFilterButton = within(sheet()).getByRole('button', {
      name: 'Add filter',
    });
    expect(addFilterButton).toHaveFocus();
    fireEvent.click(addFilterButton);
    tapRow('Unassigned');
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
    expect(
      within(sheet()).getByRole('button', {name: 'Unassigned is true'}),
    ).toHaveFocus();
  });

  it('adds a one-tap field at once from its row, which shows a plus, and announces it in Filters (FR13, FR15, AR6)', async () => {
    const spy = mockModalDialogs();
    try {
      const onChange = vi.fn();
      function Harness() {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([openFilter]);
        return (
          <PowerSearch
            config={config}
            filters={filters}
            onChange={(next, type, index) => {
              onChange(next, type, index);
              setFilters(next);
            }}
            experimental={{presentation: 'bottom-sheet'}}
          />
        );
      }
      render(<Harness />);
      openAddFlow();
      const unassignedRow = within(sheet())
        .getByRole('button', {name: 'Unassigned'})
        .closest('li')!;
      expect(unassignedRow.querySelectorAll('svg')).toHaveLength(1);
      expect(unassignedRow.querySelector('path[d="M5 12h14"]')).not.toBeNull();
      tapRow('Unassigned');
      const unassigned = {
        field: 'unassigned',
        operator: 'isTrue',
        value: {type: 'empty'},
      };
      expect(onChange).toHaveBeenCalledWith([openFilter, unassigned], 'add', 1);
      const filtersDialog = sheet();
      expect(filtersDialog).toHaveAttribute('aria-label', 'Filters');
      expect(
        within(filtersDialog).getByRole('button', {name: 'Unassigned is true'}),
      ).toHaveFocus();
      // Add filter closed holding focus, so the words wait for its exit.
      settleSheets();
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Added Unassigned is true',
        ),
      );
    } finally {
      spy.mockRestore();
    }
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
    fireEvent.change(search, {target: {value: 'Field'}});
    expect(
      within(sheet()).getAllByRole('button', {name: /^Field/}),
    ).toHaveLength(2);
    fireEvent.change(search, {target: {value: 'Field 7'}});
    expect(within(sheet()).getByRole('button', {name: 'Field 7'})).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Field 3'})).toBeNull();
    fireEvent.change(search, {target: {value: 'nope'}});
    expect(
      within(sheet()).getByText('No filters match your search'),
    ).toBeTruthy();
  });

  it('lists nested-only and mixed fields like any other, with the Operator group for a mixed one (FR13, FR14)', () => {
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
    expect(within(sheet()).getByRole('button', {name: 'Group'})).toBeTruthy();
    expect(within(sheet()).getByRole('button', {name: 'Mixed'})).toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
    // The mixed field opens on its first operator (nested) with the group
    // listing both; the built-in nested editor is the body.
    tapRow('Mixed');
    expect(within(sheet()).getByRole('heading', {name: 'Mixed'})).toBeTruthy();
    expect(
      within(sheet()).getByRole('radio', {name: 'Mixed all of'}),
    ).toBeChecked();
    expect(within(sheet()).getByRole('radio', {name: 'Mixed is'})).toBeTruthy();
    const tree = within(sheet()).getByRole('tree');
    // The Operator group takes the place of the built-in editor's root
    // operator picker: the tree root shows the checked operator's label and
    // offers no second operator control.
    expect(
      within(sheet()).queryByRole('combobox', {name: 'Group operator'}),
    ).toBeNull();
    expect(within(tree).getAllByRole('treeitem')[0]).toHaveTextContent(
      /^all of/,
    );
    warn.mockRestore();
  });

  it('disables an open field picker when the component becomes read-only', () => {
    const {rerender} = setup();
    openAddFlow();
    rerender(
      <PowerSearch
        config={config}
        filters={[]}
        onChange={vi.fn()}
        experimental={{presentation: 'bottom-sheet'}}
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
// Value step: create, operator step, edit, remove (FR14–FR16)
// =============================================================================

describe('PowerSearch value step (FR14–FR16)', () => {
  it("runs field rows edge to edge, and a lone editor's choice rows on the sheet surface (FR14)", () => {
    setup();
    openAddFlow();
    for (const list of within(sheet()).getAllByRole('list')) {
      expectBleedRowsOnBodyInset(list);
    }
    // One operator: the editor is the body's only section and sits on the
    // sheet's surface, its rows on the body's inset.
    tapRow('Labels');
    const group = within(sheet()).getByRole('group', {name: 'Labels'});
    expectBleedChoiceRows(group);
    expect(group.closest('[class*="controlSection"]')).toBeNull();
  });

  it('puts the Operator group and the editor each in a muted section when the field has several operators (FR14)', () => {
    setup();
    openAddFlow();
    tapRow('Status');
    const operators = within(sheet()).getByRole('radiogroup', {
      name: 'Operator',
    });
    const values = within(sheet()).getByRole('radiogroup', {name: 'Status'});
    const operatorSection = operators.closest<HTMLElement>(
      '[class*="controlSection"]',
    );
    const valueSection = values.closest<HTMLElement>(
      '[class*="controlSection"]',
    );
    expect(operatorSection).not.toBeNull();
    expect(valueSection).not.toBeNull();
    expect(operatorSection).not.toBe(valueSection);
    expect(getComputedStyle(valueSection!).backgroundColor).toBe(
      'var(--color-background-muted)',
    );
    // The section publishes its own padding, so the choice rows run edge to
    // edge inside it.
    expect(values.className).toMatch(/choiceList/);
    expect(
      getComputedStyle(valueSection!).getPropertyValue(
        '--container-padding-inline-start',
      ),
    ).toBe('var(--spacing-3)');
  });

  it('stages an enum selection and commits it with exact add metadata', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Status');
    tapRow('Closed');
    expect(choice('Closed')).toBeChecked();
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
    // The whole row is the control: tapping its label toggles it.
    const bug = choice('Bug');
    expect(bug).not.toBeChecked();
    fireEvent.click(within(bug).getByText('Bug'));
    expect(choice('Bug')).toBeChecked();
    expect(choice('Bug')).toHaveAttribute('role', 'checkbox');
    expect(within(sheet()).getByRole('group', {name: 'Labels'})).toBeTruthy();
  });

  it('returns focus to Add filter when the closing steps finish their exit, even when the first move did not land (FR16)', () => {
    setup({filters: [openFilter]});
    openAddFlow();
    tapRow('Labels');
    tapRow('Bug');
    addFilter();
    // A browser can keep focus in a closing sheet until its exit ends, so
    // the first move may not land; the closing steps then return focus to
    // the control the commit named.
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    settleSheets();
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toHaveFocus();
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
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toHaveFocus();
  });

  it('opens Filters as the value step and Add filter close when Add filter was the entry point, with focus on Add filter once the sheets settle (FR15a, FR16)', () => {
    setup();
    openSheet();
    tapRow('Status');
    tapRow('Closed');
    const valueStep = sheet();
    expect(valueStep).toHaveAttribute('aria-label', 'Status');
    addFilter();
    // Two sheets close as one opens: the stack's ordinary closes and open,
    // not BottomSheet's replace, which pairs exactly one close with one open.
    expect(valueStep).not.toHaveAttribute('data-sheet-stack', 'replaced');
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
    settleSheets();
    expect(
      Array.from(document.querySelectorAll('dialog[open]')).map(d =>
        d.getAttribute('aria-label'),
      ),
    ).toEqual(['Filters']);
    // Focus is still on Add filter once every motion has settled.
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toHaveFocus();
  });

  it('confirms an empty-value operator of a field with several operators through Add filter', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Status');
    fireEvent.click(
      within(sheet()).getByRole('radio', {name: 'Status is empty'}),
    );
    expect(onChange).not.toHaveBeenCalled();
    addFilter();
    expect(onChange).toHaveBeenCalledWith(
      [{field: 'status', operator: 'isEmpty', value: {type: 'empty'}}],
      'add',
      0,
    );
  });

  it('shows the operator step as radios only when a field has several', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Status');
    expect(within(sheet()).getByRole('heading', {name: 'Status'})).toBeTruthy();
    expect(
      within(sheet()).getByRole('radiogroup', {name: 'Operator'}),
    ).toBeTruthy();
    expect(
      within(sheet()).getByRole('radio', {name: 'Status is'}),
    ).toBeChecked();
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
    expect(choice('Open')).toBeChecked();
    fireEvent.click(
      within(sheet()).getByRole('radio', {name: 'Status is empty'}),
    );
    expect(
      within(sheet()).queryByRole('radio', {
        checked: true,
        name: /^(Open|Closed)/,
      }),
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

  it('makes a radio group one tab stop whose arrow keys move and check, and leaves checkbox rows one stop each (FR17)', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Status');
    const group = within(sheet()).getByRole('radiogroup', {name: 'Status'});
    const radios = within(group).getAllByRole('radio');
    // Nothing checked yet: the first row is the group's single tab stop.
    expect(radios.map(r => r.tabIndex)).toEqual([0, -1]);
    radios[0].focus();
    fireEvent.keyDown(radios[0], {key: 'ArrowDown'});
    // The arrow moved focus and checked the row it landed on.
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toBeChecked();
    expect(radios.map(r => r.tabIndex)).toEqual([-1, 0]);
    fireEvent.keyDown(radios[1], {key: 'ArrowUp'});
    expect(radios[0]).toHaveFocus();
    expect(radios[0]).toBeChecked();
    fireEvent.keyDown(radios[0], {key: 'ArrowUp'});
    // Wraps.
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toBeChecked();
    fireEvent.keyDown(radios[1], {key: 'Home'});
    expect(radios[0]).toBeChecked();
    fireEvent.keyDown(radios[0], {key: 'End'});
    expect(radios[1]).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));

    tapRow('Labels');
    const boxes = within(
      within(sheet()).getByRole('group', {name: 'Labels'}),
    ).getAllByRole('checkbox');
    // Every checkbox row is a tab stop; arrows do nothing to them.
    expect(boxes.every(b => b.tabIndex === 0)).toBe(true);
    boxes[0].focus();
    fireEvent.keyDown(boxes[0], {key: 'ArrowDown'});
    expect(boxes[0]).toHaveFocus();
    expect(boxes[0]).not.toBeChecked();
    // Activation (Space/Enter on a button fires click) toggles.
    fireEvent.click(boxes[0]);
    expect(boxes[0]).toBeChecked();
  });

  it('checks a focused radio row with Space or Enter and toggles a checkbox row with Space (FR17; AST-020 FR15)', async () => {
    const user = userEvent.setup();
    setup();
    openAddFlow();
    tapRow('Status');
    const radios = within(
      within(sheet()).getByRole('radiogroup', {name: 'Status'}),
    ).getAllByRole('radio');
    radios[0].focus();
    await user.keyboard(' ');
    expect(radios[0]).toBeChecked();
    // Arrow to the next row without a pointer, then Enter checks it too (it
    // is already checked by the arrow; Enter keeps it so).
    await user.keyboard('{ArrowDown}');
    expect(radios[1]).toBeChecked();
    await user.keyboard('{Enter}');
    expect(radios[1]).toBeChecked();
    expect(radios[0]).not.toBeChecked();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));

    tapRow('Labels');
    const boxes = within(
      within(sheet()).getByRole('group', {name: 'Labels'}),
    ).getAllByRole('checkbox');
    boxes[1].focus();
    await user.keyboard(' ');
    expect(boxes[1]).toBeChecked();
    await user.keyboard(' ');
    expect(boxes[1]).not.toBeChecked();
    await user.keyboard('{Enter}');
    expect(boxes[1]).toBeChecked();
  });

  it('stages a multi-select and commits it from the footer', () => {
    const {onChange} = setup();
    openAddFlow();
    tapRow('Labels');
    fireEvent.click(choice('Bug'));
    fireEvent.click(choice('Urgent'));
    const bug = choice('Bug');
    const urgent = choice('Urgent');
    expect(bug).toBeChecked();
    expect(urgent).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(urgent);
    expect(choice('Urgent')).not.toBeChecked();
    fireEvent.click(choice('Urgent'));
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

  it('opens the edit step above Filters with only Cancel and Apply from a selected row (FR14, FR15a)', () => {
    setup({filters: [openFilter]});
    openEditFlow('Status is Open');
    expect(within(sheet()).getByRole('heading', {name: 'Status'})).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    expect(within(sheet()).getByRole('button', {name: 'Cancel'})).toBeTruthy();
    expect(within(sheet()).getByRole('button', {name: 'Apply'})).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Remove'})).toBeNull();
    expect(choice('Open')).toBeChecked();
    // Filters stays open beneath the step, covered and blocked.
    const filters = document.querySelector('dialog[aria-label="Filters"]');
    expect(filters).toHaveAttribute('open');
    expect(filters).toHaveAttribute('inert');
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

  it("moves focus to the next editable row's remove action after a removal (FR16)", () => {
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
        <PowerSearch
          config={config}
          filters={filters}
          onChange={next => setFilters(next)}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    render(<Harness />);
    openSheet();
    fireEvent.click(removeButton('Status'));
    // The read-only row in between is plain and is passed over.
    const graceRow = within(sheet())
      .getByRole('button', {name: 'Author is Grace'})
      .closest('li')!;
    expect(
      within(graceRow).getByRole('button', {name: 'Remove Author filter'}),
    ).toHaveFocus();
  });

  it("focuses a nested filter's remove action after a removal, since its row is editable too (FR16)", () => {
    const withNested: PowerSearchConfig = {
      name: 'Nested',
      fields: [
        ...config.fields,
        {
          key: 'mixed',
          label: 'Mixed',
          operators: [{key: 'all', label: 'all of', value: {type: 'nested'}}],
        },
      ],
    };
    const nested: PowerSearchFilter = {
      field: 'mixed',
      operator: 'all',
      value: {type: 'nested', value: [openFilter]},
    };
    const after: PowerSearchFilter = {
      field: 'author',
      operator: 'is',
      value: {type: 'string', value: 'Grace'},
    };
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        openFilter,
        nested,
        after,
      ]);
      return (
        <PowerSearch
          config={withNested}
          filters={filters}
          onChange={next => setFilters(next)}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    render(<Harness />);
    openSheet();
    fireEvent.click(removeButton('Status'));
    // The nested row is the nearest following row and is editable, so its
    // remove action takes focus.
    expect(removeButton('Mixed')).toHaveFocus();
  });

  it('focuses Add filter after the last editable filter is removed', () => {
    function Harness() {
      const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([
        openFilter,
      ]);
      return (
        <PowerSearch
          config={config}
          filters={filters}
          onChange={next => setFilters(next)}
          experimental={{presentation: 'bottom-sheet'}}
        />
      );
    }
    render(<Harness />);
    openSheet();
    fireEvent.click(removeButton('Status'));
    expect(within(sheet()).getByText('No filters applied')).toBeTruthy();
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toHaveFocus();
  });

  it('follows the original filter when controlled props reorder it', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <PowerSearch
        config={config}
        filters={[openFilter, authorFilter]}
        onChange={onChange}
        experimental={{presentation: 'bottom-sheet'}}
      />,
    );
    openEditFlow('Status is Open');
    rerender(
      <PowerSearch
        config={config}
        filters={[{...authorFilter}, {...openFilter}]}
        onChange={onChange}
        experimental={{presentation: 'bottom-sheet'}}
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
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={onChange}
        experimental={{presentation: 'bottom-sheet'}}
      />,
    );
    openEditFlow('Status is Open');
    rerender(
      <PowerSearch
        config={config}
        filters={[authorFilter]}
        onChange={onChange}
        experimental={{presentation: 'bottom-sheet'}}
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

  it('lists a saved filter the config no longer knows as a row that opens the unavailable step and stays removable from its row (FR12)', async () => {
    const spy = mockModalDialogs();
    try {
      const orphan: PowerSearchFilter = {
        field: 'legacy',
        operator: 'was',
        value: {type: 'string', value: 'x'},
      };
      const onChange = vi.fn();
      function Harness() {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([openFilter, orphan]);
        return (
          <PowerSearch
            config={config}
            filters={filters}
            onChange={(next, type, index) => {
              onChange(next, type, index);
              setFilters(next);
            }}
            experimental={{presentation: 'bottom-sheet'}}
          />
        );
      }
      render(<Harness />);
      openSheet();
      // Listed by its raw keys, as the token is; a button, not a plain row.
      const row = within(sheet()).getByRole('button', {name: 'legacy was'});
      fireEvent.click(row);
      // The step's title — the dialog's name — reads the raw keys, as the
      // row does (FR12, FR14, AR5).
      expect(
        within(sheet()).getByRole('heading', {name: 'legacy was'}),
      ).toBeTruthy();
      expect(sheet().getAttribute('aria-label')).toBe('legacy was');
      expect(
        within(sheet()).getByText('This filter is no longer available'),
      ).toBeTruthy();
      expect(within(sheet()).queryByRole('button', {name: 'Apply'})).toBeNull();
      expect(
        within(sheet()).queryByRole('button', {name: 'Remove'}),
      ).toBeNull();
      // Cancel is the way back; the row's trailing action removes it.
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
      expect(
        within(sheet()).getByRole('button', {name: 'legacy was'}),
      ).toHaveFocus();
      // The value step finishes its exit before the removal.
      settleSheets();
      fireEvent.click(removeButton('legacy'));
      expect(onChange).toHaveBeenCalledWith([openFilter], 'remove', 1);
      const filtersDialog = sheet();
      expect(
        within(filtersDialog).queryByRole('button', {name: 'legacy was'}),
      ).toBeNull();
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Removed legacy was',
        ),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps a way out when a config update removes the edited field, moves focus to Cancel, and announces it (FR14, FR16, AR6)', async () => {
    const spy = mockModalDialogs();
    const onChange = vi.fn();
    const {rerender} = render(
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={onChange}
        experimental={{presentation: 'bottom-sheet'}}
      />,
    );
    openEditFlow('Status is Open');
    const dialog = sheet();
    // Focus is on one of the body's controls — a choice row.
    const row = within(dialog).getByRole('radio', {name: 'Open'});
    row.focus();
    expect(row).toHaveFocus();
    rerender(
      <PowerSearch
        config={{
          ...config,
          fields: config.fields.filter(f => f.key !== 'status'),
        }}
        filters={[openFilter]}
        onChange={onChange}
        experimental={{presentation: 'bottom-sheet'}}
      />,
    );
    expect(
      within(sheet()).getByText('This filter is no longer available'),
    ).toBeTruthy();
    expect(within(sheet()).queryByRole('button', {name: 'Apply'})).toBeNull();
    // The row unmounted without a blur; focus did not fall to the page body
    // but moved to the way out, and the message was announced inside the
    // sheet's dialog.
    expect(within(sheet()).getByRole('button', {name: 'Cancel'})).toHaveFocus();
    await waitFor(() =>
      expect(modalLiveRegion(dialog)).toHaveTextContent(
        'This filter is no longer available',
      ),
    );
    expect(sharedLiveRegion()?.textContent ?? '').toBe('');
    spy.mockRestore();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    expect(
      within(sheet()).getByRole('heading', {name: 'Filters'}),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hands a custom editor the props the popover presentation hands it, and commits what it saves (FR14)', () => {
    const savedFilter: PowerSearchFilter = {
      field: 'author',
      operator: 'is',
      value: {type: 'string', value: 'Grace'},
      isReadOnly: true,
    };
    const seenProps = vi.fn();
    function CustomEditor(props: PowerSearchEditorProps) {
      seenProps(props);
      return (
        <button type="button" onClick={() => props.onSave(savedFilter)}>
          Custom save
        </button>
      );
    }
    const {onChange} = setup({
      components: {enum: {Editor: CustomEditor}},
      timezoneID: 'Asia/Tokyo',
      popoverSaveButtonLabel: 'Keep',
    });
    openAddFlow();
    tapRow('Status');
    // The same props, with the same meaning, as the popover passes: the
    // caller's config, the partial filter, the mode, the save label, the
    // read-only flag, and the two callbacks; no sheet-only `timezoneID`.
    expect(seenProps).toHaveBeenLastCalledWith({
      config,
      filter: {field: 'status', operator: 'is', value: undefined},
      mode: 'create',
      saveButtonLabel: 'Keep',
      isReadOnly: false,
      onSave: expect.any(Function),
      onCancel: expect.any(Function),
    });
    fireEvent.click(screen.getByRole('button', {name: 'Custom save'}));
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
// Content search (FR13)
// =============================================================================

// =============================================================================
// Stacked steps (FR15a)
// =============================================================================

describe('PowerSearch step sheets (retained stack, FR15a)', () => {
  // Dismissing the top step closes only that sheet, so the prior step returns
  // through the stack's reveal motion instead of reopening above the current
  // one. These assertions read only what a person or assistive technology can
  // observe.
  function stepDialogs(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('dialog[open]'));
  }
  const stepNames = () => stepDialogs().map(d => d.getAttribute('aria-label'));

  it('Filters opens as one modal dialog, named by the step', () => {
    setup({filters: [openFilter]});
    openSheet();
    expect(stepNames()).toEqual(['Filters']);
    expect(sheet()).toHaveAttribute('aria-modal', 'true');
    expect(sheet()).not.toHaveAttribute('inert');
    expect(sheet()).not.toHaveAttribute('aria-hidden');
  });

  it('opens Add filter above Filters without a Back button, and a dismissal reveals Filters', () => {
    setup({filters: [openFilter]});
    openSheet();
    const filters = sheet();
    tapRow('Add filter');
    expect(stepNames()).toEqual(['Filters', 'Add filter']);
    expect(filters).toHaveAttribute('inert');
    expect(filters).toHaveAttribute('aria-hidden', 'true');
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
    expect(sheet()).not.toHaveAttribute('inert');
    settleSheets();
    // Settling the motion keeps Filters beneath: it is covered, not replaced.
    expect(stepNames()).toEqual(['Filters', 'Add filter']);
    expect(within(sheet()).queryByRole('button', {name: 'Back'})).toBeNull();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    settleSheets();
    expect(stepNames()).toEqual(['Filters']);
    expect(sheet()).not.toHaveAttribute('inert');
    expect(sheet()).not.toHaveAttribute('aria-hidden');
  });

  it('stacks Filters, Add filter and the value step for a creation, and Filters and the value step for an edit', () => {
    setup({filters: [openFilter]});
    openSheet();
    tapRow('Add filter');
    tapRow('Author');
    expect(stepNames()).toEqual(['Filters', 'Add filter', 'Author is']);
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
    settleSheets();
    expect(stepNames()).toEqual(['Filters', 'Add filter']);
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    settleSheets();
    tapRow('Status is Open');
    expect(stepNames()).toEqual(['Filters', 'Status']);
  });

  it('stacks the value step above Add filter alone when Add filter was the entry point', () => {
    setup();
    openSheet();
    expect(stepNames()).toEqual(['Add filter']);
    tapRow('Author');
    expect(stepNames()).toEqual(['Add filter', 'Author is']);
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    settleSheets();
    expect(stepNames()).toEqual(['Add filter']);
    expect(isSheetOpen()).toBe(true);
  });

  it('returns focus to the trigger after a flow that crossed every step', () => {
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
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    settleSheets();
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Done'}));
    expect(isSheetOpen()).toBe(false);
    settleSheets();
    expect(trigger()).toHaveFocus();
  });

  it('closes the flow on Escape from Filters, the bottom sheet, and returns focus to the trigger', () => {
    setup({filters: [openFilter]});
    trigger().focus();
    openSheet();
    settleSheets();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    expect(isSheetOpen()).toBe(false);
    settleSheets();
    expect(trigger()).toHaveFocus();
  });

  it('reveals Add filter on Escape from a value step above it, with focus on the field row', () => {
    setup({filters: [openFilter]});
    openSheet();
    tapRow('Add filter');
    tapRow(/^Status/);
    settleSheets();
    fireEvent.keyDown(sheet(), {key: 'Escape'});
    settleSheets();
    expect(isSheetOpen()).toBe(true);
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
    expect(within(sheet()).getByRole('button', {name: 'Status'})).toHaveFocus();
  });

  it('closes the flow on a scrim press on Filters; a value step scrim reveals the step beneath', () => {
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
    // The value step is an info sheet: its scrim dismisses it.
    fireEvent.click(sheet());
    settleSheets();
    expect(isSheetOpen()).toBe(true);
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
  });

  it('reveals Filters on a downward swipe on Add filter instead of closing the flow', () => {
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

  it('ignores a scrim press on the covered Filters sheet while Add filter is on top', () => {
    setup({filters: [openFilter]});
    openSheet();
    const filters = sheet();
    tapRow('Add filter');
    fireEvent.click(filters);
    expect(isSheetOpen()).toBe(true);
    expect(sheet()).toHaveAttribute('aria-label', 'Add filter');
  });

  it('keeps the value step a dismissible info sheet (FR14)', () => {
    setup({filters: [openFilter]});
    openEditFlow('Status is Open');
    tapRow('Closed');
    // The staged value is not protected by a form purpose: a scrim press
    // reveals Filters, and nothing is committed.
    fireEvent.click(sheet());
    expect(sheet()).toHaveAttribute('aria-label', 'Filters');
  });

  it('speaks announcements only in the open step: a covered or retained step stays silent (AR6, FR18)', async () => {
    const spy = mockModalDialogs();
    try {
      setup({config: contentSearchConfig, filters: [openFilter]});
      openSheet();
      tapRow('Add filter');
      const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
      fireEvent.change(input, {target: {value: 'status'}});
      expect(
        within(sheet()).getAllByRole('button', {name: /Status/}).length,
      ).toBeGreaterThan(0);
      // Back to Filters: the Add filter sheet's body stays mounted; no
      // empty-result message is spoken, on the page or in Filters.
      fireEvent.keyDown(sheet(), {key: 'Escape'});
      expect(
        within(sheet()).getByRole('heading', {name: 'Filters'}),
      ).toBeTruthy();
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
      expect(modalLiveRegion(sheet())?.textContent ?? '').not.toContain(
        'No results found',
      );
      // Escape out of the flow after another query: nothing on the page.
      tapRow('Add filter');
      fireEvent.change(
        within(sheet()).getByRole('searchbox', {name: 'Search'}),
        {target: {value: 'status'}},
      );
      fireEvent.keyDown(sheet(), {key: 'Escape'});
      settleSheets();
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it('announces the unavailable state only while its step is open, and again when the same stale filter reopens (AR6)', async () => {
    const spy = mockModalDialogs();
    try {
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
      // config update that drops the edited operator is not spoken — not now,
      // and not held for the next dialog that opens.
      rerender(
        <PowerSearch
          config={stale}
          filters={[openFilter, authorFilter]}
          onChange={vi.fn()}
          experimental={{presentation: 'bottom-sheet'}}
        />,
      );
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
      tapRow('Author is Ada');
      await new Promise(resolve => setTimeout(resolve, 40));
      for (const region of document.querySelectorAll('[aria-live]')) {
        expect(region.textContent ?? '').not.toContain(
          'This filter is no longer available',
        );
      }
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
      // Reopening the stale filter — its row reads the field's label and the
      // raw operator key — speaks it in its own dialog, as a new occasion.
      tapRow('Status is');
      const dialog = sheet();
      await waitFor(() =>
        expect(modalLiveRegion(dialog)?.textContent).toBe(
          'This filter is no longer available',
        ),
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe('PowerSearch content search (FR13)', () => {
  it('opens empty content-search configurations directly to Add filter without focusing the search (FR13)', () => {
    setup({config: contentSearchConfig, placeholder: 'Search content…'});
    openSheet();
    expect(
      within(sheet()).getByRole('heading', {name: 'Add filter'}),
    ).toBeTruthy();
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    expect(input).toHaveAttribute('placeholder', 'Search content…');
    // The software keyboard stays down until the person taps the search.
    expect(input).not.toHaveFocus();
    expect(sheet().contains(document.activeElement)).toBe(true);
  });

  it('leaves the search unfocused when Add filter opens from Filters, and a vertical touch drag on the rows moves focus off it (FR13)', () => {
    setup({config: contentSearchConfig, filters: [openFilter]});
    openAddFlow();
    const dialog = sheet();
    const input = within(dialog).getByRole('searchbox', {name: 'Search'});
    expect(input).not.toHaveFocus();
    input.focus();
    const results = within(dialog).getByRole('list', {name: 'Search results'});
    const viewport = results.closest<HTMLElement>('[class*="scrollViewport"]')!;
    // A scroll alone (filtering can clamp it) and a small move leave focus.
    fireEvent.scroll(viewport);
    expect(input).toHaveFocus();
    fireEvent.touchStart(viewport, {touches: [{clientY: 100}]});
    fireEvent.touchMove(viewport, {touches: [{clientY: 107}]});
    expect(input).toHaveFocus();
    // A drag past the threshold moves focus to the sheet.
    fireEvent.touchMove(viewport, {touches: [{clientY: 109}]});
    expect(input).not.toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    // A multi-touch gesture leaves a focused search alone.
    input.focus();
    fireEvent.touchStart(viewport, {
      touches: [{clientY: 100}, {clientY: 140}],
    });
    fireEvent.touchMove(viewport, {
      touches: [{clientY: 140}, {clientY: 180}],
    });
    expect(input).toHaveFocus();
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
    // The search takes no focus on open; the person moves into it first.
    input.focus();
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], {key: 'ArrowDown'});
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1], {key: 'ArrowUp'});
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], {key: 'ArrowUp'});
    expect(input).toHaveFocus();
    // The ends do not wrap.
    fireEvent.keyDown(input, {key: 'ArrowUp'});
    expect(input).toHaveFocus();
    options[3].focus();
    fireEvent.keyDown(options[3], {key: 'ArrowDown'});
    expect(options[3]).toHaveFocus();
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
  });

  it('adds a value suggestion from Enter and announces it inside the Filters sheet (AR6; AST-086 FR14)', async () => {
    const spy = mockModalDialogs();
    try {
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
      // The announcement lands in the Filters sheet the flow moved to, the
      // dialog that stays open, not on the page body behind the modal.
      const filtersDialog = sheet();
      expect(filtersDialog).toHaveAttribute('aria-label', 'Filters');
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Added "status clo"',
        ),
      );
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
    } finally {
      spy.mockRestore();
    }
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

  it('shows the no-results empty state only for a non-empty query with no suggestion (FR18)', () => {
    const noMatches: PowerSearchConfig = {
      name: 'NoMatches',
      contentSearchFieldKey: 'author',
      fields: [
        {
          key: 'author',
          label: 'Author',
          isValueMatchAllowed: false,
          operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
        },
      ],
    };
    setup({config: noMatches});
    openSheet();
    expect(within(sheet()).queryByText('No results found')).toBeNull();
    const input = within(sheet()).getByRole('searchbox', {name: 'Search'});
    // "Author" matches the field exactly, which drops the free-text item.
    fireEvent.change(input, {target: {value: 'Author'}});
    expect(within(sheet()).getByRole('button', {name: 'Author'})).toBeTruthy();
    expect(within(sheet()).queryByText('No results found')).toBeNull();
  });

  it('announces the empty-result message once per query that matches nothing, read from the rendered element, inside the open sheet (AR6, INV10)', async () => {
    const spy = mockModalDialogs();
    try {
      // No content-search field: a non-matching query is a dead end with no
      // free-text fallback item.
      const noContent: PowerSearchConfig = {
        name: 'NoContent',
        contentSearchFieldKey: 'author',
        fields: [
          {
            key: 'author',
            label: 'Author',
            isValueMatchAllowed: false,
            typeaheadMinQueryLength: 99,
            operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
          },
        ],
      };
      setup({config: noContent});
      openSheet();
      const dialog = sheet();
      const input = within(dialog).getByRole('searchbox', {name: 'Search'});
      const region = () => modalLiveRegion(dialog);
      // The free-text item hides for a query equal to the field's label, and
      // the field itself is below its min query length: nothing lists.
      fireEvent.change(input, {target: {value: 'Author'}});
      expect(within(dialog).getByText('No results found')).toBeTruthy();
      await waitFor(() =>
        expect(region()).toHaveTextContent('No results found'),
      );
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
      // The same words for the same query are not spoken twice.
      await new Promise(resolve => setTimeout(resolve, 20));
      region()!.textContent = '';
      fireEvent.change(input, {target: {value: 'Author'}});
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(region()?.textContent ?? '').toBe('');
      // Back to results, then a dead end for a new query: a new occasion,
      // announced again, once.
      fireEvent.change(input, {target: {value: 'zzz'}});
      expect(within(dialog).getByRole('button', {name: '"zzz"'})).toBeTruthy();
      await new Promise(resolve => setTimeout(resolve, 20));
      region()!.textContent = '';
      fireEvent.change(input, {target: {value: 'Author'}});
      await waitFor(() =>
        expect(region()).toHaveTextContent('No results found'),
      );
      // One announcement of the empty state's rendered text, not one from
      // the element and one from the sheet.
      expect(region()?.textContent).toBe(
        'No results found Try a different search.',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('announces "No filters match your search" inside the Add filter sheet (AR6)', async () => {
    const spy = mockModalDialogs();
    try {
      const many: PowerSearchConfig = {
        name: 'Many',
        fields: Array.from({length: 10}, (_, i) => ({
          key: `f${i}`,
          label: `Field ${i}`,
          operators: [
            {key: 'is', label: 'is', value: {type: 'string'} as const},
          ],
        })),
      };
      setup({config: many});
      openAddFlow();
      const dialog = sheet();
      fireEvent.change(
        within(dialog).getByRole('textbox', {name: 'Search filters'}),
        {target: {value: 'nope'}},
      );
      await waitFor(() =>
        expect(modalLiveRegion(dialog)).toHaveTextContent(
          'No filters match your search',
        ),
      );
      expect(sharedLiveRegion()?.textContent ?? '').toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it('falls back to the field list without a content-search field', () => {
    setup({config: {...contentSearchConfig, contentSearchFieldKey: undefined}});
    openSheet();
    expect(within(sheet()).queryByRole('searchbox')).toBeNull();
    expect(within(sheet()).getByRole('button', {name: 'Status'})).toBeTruthy();
  });
});

// =============================================================================
// Value types (FR17, FR21)
// =============================================================================

describe('PowerSearch sheet value types (FR17)', () => {
  function setupValues(
    props: Partial<PowerSearchProps> & {presentation?: Presentation} = {},
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

  it("string_list: the Tokenizer's sheet, titled with the field, creates free-text values (FR21)", async () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('ID');
    expect(within(sheet()).queryByRole('combobox')).toBeNull();
    const tokenizerTrigger = within(sheet()).getByRole('button', {name: 'ID'});
    expect(tokenizerTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(tokenizerTrigger);
    const tokenizerSheet = await screen.findByRole('dialog', {name: 'ID'});
    expect(tokenizerSheet).toBe(sheet());
    fireEvent.change(within(tokenizerSheet).getByLabelText('Search ID'), {
      target: {value: 'ABC-1'},
    });
    fireEvent.click(
      await within(tokenizerSheet).findByRole('button', {name: 'Add ABC-1'}),
    );
    // Save closes only the topmost sheet and stages the values in the step.
    fireEvent.click(within(tokenizerSheet).getByRole('button', {name: 'Save'}));
    settleSheets();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'ID'})).toBeNull(),
    );
    expect(
      within(sheet()).getByRole('heading', {name: 'ID is any of'}),
    ).toBeTruthy();
    expect(within(sheet()).getByRole('button', {name: /^ID/})).toHaveFocus();
    // Escape on the unchanged sheet dismisses only that sheet; the value step
    // keeps its staged value.
    fireEvent.click(within(sheet()).getByRole('button', {name: /^ID/}));
    await screen.findByRole('dialog', {name: 'ID'});
    fireEvent.keyDown(document.activeElement ?? document.body, {key: 'Escape'});
    settleSheets();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'ID'})).toBeNull(),
    );
    expect(
      within(sheet()).getByRole('heading', {name: 'ID is any of'}),
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

  it('integer: number input stages as typed', () => {
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

  it('integer: clearing the field unstages the value and disables Add filter', () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Lines');
    const input = within(sheet()).getByRole('spinbutton', {name: 'Value'});
    fireEvent.input(input, {target: {value: '1'}});
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toBeEnabled();
    // Delete the digit: nothing stands to confirm.
    fireEvent.input(input, {target: {value: ''}});
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toBeDisabled();
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Add filter'}));
    expect(onChange).not.toHaveBeenCalled();
    // Not a number either: still nothing.
    fireEvent.input(input, {target: {value: '-'}});
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toBeDisabled();
    fireEvent.input(input, {target: {value: '12'}});
    expect(
      within(sheet()).getByRole('button', {name: 'Add filter'}),
    ).toBeEnabled();
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

  it("date_absolute: the date input shows the stored day in the field's zone, as the popover presentation reads it", () => {
    const dateFilter: PowerSearchFilter = {
      field: 'created',
      operator: 'after',
      // 2024-03-10T12:00:00Z
      value: {type: 'date_absolute', unixSeconds: 1710072000},
    };
    setupValues({filters: [dateFilter], timezoneID: 'UTC'});
    openEditFlow(/^Created is after/);
    const input = within(sheet()).getByRole('combobox', {name: 'Date'});
    expect(input).toHaveValue('March 10, 2024');
  });

  it('date_relative: rows stage a single relative value', () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Age');
    expect(
      within(sheet()).queryByRole('button', {name: /from now/}),
    ).toBeNull();
    tapRow('7 days ago');
    expect(choice('7 days ago')).toBeChecked();
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

  it('date_range: the range input is rendered with the stored range', () => {
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
    // The popover presentation's editor labels the range with the catalog's
    // lowercase noun; the sheet reuses that editor.
    const range = within(sheet()).getByRole('button', {
      name: /date range.*Mar 1, 2024/i,
    });
    expect(range).toHaveAttribute('aria-expanded', 'false');
  });

  it("entity_list: the Tokenizer's sheet picks entities from the search source (FR21)", async () => {
    const {onChange} = setupValues();
    openAddFlow();
    tapRow('Assignee');
    fireEvent.click(within(sheet()).getByRole('button', {name: 'Assignee'}));
    const tokenizerSheet = await screen.findByRole('dialog', {
      name: 'Assignee',
    });
    fireEvent.click(
      await within(tokenizerSheet).findByRole('checkbox', {
        name: 'Ada Lovelace',
      }),
    );
    fireEvent.click(within(tokenizerSheet).getByRole('button', {name: 'Save'}));
    settleSheets();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'Assignee'})).toBeNull(),
    );
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
// Values read the same everywhere
// =============================================================================

describe('PowerSearch sheet value text', () => {
  // 2024-03-10T03:00:00Z: March 10 in Tokyo (UTC+9), still March 9 in
  // Honolulu (UTC-10). A boundary instant exposes any surface that formats a
  // date differently from the popover presentation's token.
  const BOUNDARY_SECONDS = 1710039600;
  const dateFilter: PowerSearchFilter = {
    field: 'created',
    operator: 'after',
    value: {type: 'date_absolute', unixSeconds: BOUNDARY_SECONDS},
  };

  // The value text the popover presentation's token shows for each filter:
  // the token's end content, after its "{Field}: {operator}" label.
  function popoverTokenValues(
    filters: ReadonlyArray<PowerSearchFilter>,
    timezoneID?: string,
  ): string[] {
    const {unmount} = render(
      <PowerSearch
        config={valueTypesConfig}
        filters={filters}
        onChange={() => {}}
        timezoneID={timezoneID}
      />,
    );
    const texts = filters.map(filter => {
      const field = valueTypesConfig.fields.find(f => f.key === filter.field)!;
      const label = screen.getByText(new RegExp(`^${field.label}: `));
      let node: HTMLElement | null = label;
      while (node && node.textContent === label.textContent) {
        node = node.parentElement;
      }
      const whole = node?.textContent ?? '';
      return whole.slice(label.textContent.length).trim();
    });
    unmount();
    return texts;
  }

  it.each([['UTC'], ['Asia/Tokyo'], ['Pacific/Honolulu'], [undefined]])(
    'shows a date on the trigger token, in the Filters row and in the removal announcement exactly as the popover token shows it (timezoneID %s)',
    async timezoneID => {
      const [day] = popoverTokenValues([dateFilter], timezoneID);
      expect(day).toMatch(/^Mar (9|10), 2024$/);
      const spy = mockModalDialogs();
      try {
        function Harness() {
          const [filters, setFilters] = useState<
            ReadonlyArray<PowerSearchFilter>
          >([dateFilter]);
          return (
            <PowerSearch
              config={valueTypesConfig}
              filters={filters}
              onChange={next => setFilters(next)}
              timezoneID={timezoneID}
              experimental={{presentation: 'bottom-sheet'}}
            />
          );
        }
        render(<Harness />);
        // The sheet presentation's token is the popover's token.
        expect(within(field()).getByText(day)).toBeTruthy();
        // The Filters row reads the same value, bold.
        openSheet();
        const row = within(sheet()).getByRole('button', {
          name: `Created is after ${day}`,
        });
        expect(within(row).getByText(day)).toHaveStyle({
          fontWeight: 'var(--font-weight-bold)',
        });
        // And the removal announcement names the row's text.
        fireEvent.click(removeButton('Created'));
        const filtersDialog = sheet();
        await waitFor(() =>
          expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
            `Removed Created is after ${day}`,
          ),
        );
      } finally {
        spy.mockRestore();
      }
    },
  );

  it('reads a date into the editor as the popover presentation does (FR17)', () => {
    setup({
      config: valueTypesConfig,
      filters: [dateFilter],
      timezoneID: 'Pacific/Honolulu',
    });
    openEditFlow(/^Created is after/);
    // Both presentations' date editors read the instant's UTC day; the
    // token and row may name a neighbouring day in an off-UTC zone (the
    // record's known gap).
    expect(within(sheet()).getByRole('combobox', {name: 'Date'})).toHaveValue(
      'March 10, 2024',
    );
  });

  it("resolves the sheet's date-range and nested summaries through the catalog with the popover token's words", () => {
    // The row's value resolves "date range" and "{n} filters" through
    // `@astryx.powersearch.valueEditor.*` (ICU plural) so a locale can
    // translate them, while in English they stay the popover token's words.
    // (A list collapses to "{n} items" only under the token's width budget;
    // the untruncated row lists it in full.)
    const nestedConfig: PowerSearchConfig = {
      name: 'NestedSummary',
      fields: [
        ...valueTypesConfig.fields,
        {
          key: 'group',
          label: 'Group',
          operators: [{key: 'all', label: 'matches', value: {type: 'nested'}}],
        },
      ],
    };
    const filters: PowerSearchFilter[] = [
      {
        field: 'window',
        operator: 'between',
        value: {
          type: 'date_range',
          value: {
            start: {type: 'ABSOLUTE', unixSeconds: 0},
            end: {type: 'ABSOLUTE', unixSeconds: 86400},
          },
        },
      },
      {
        field: 'group',
        operator: 'all',
        value: {
          type: 'nested',
          value: [
            {
              field: 'title',
              operator: 'contains',
              value: {type: 'string', value: 'a'},
            },
          ],
        },
      },
    ];
    setup({config: nestedConfig, filters});
    openSheet();
    expect(
      within(sheet()).getByRole('button', {
        name: 'Window is between date range',
      }),
    ).toBeTruthy();
    // A nested filter's row (a button with a trailing remove action, FR12)
    // reads its value as the token's.
    expect(
      within(sheet()).getByRole('button', {name: 'Group matches 1 filter'}),
    ).toBeTruthy();
  });

  it("reads a relative-date value on the Filters row and in Removed as the value step's choice row does", async () => {
    const spy = mockModalDialogs();
    try {
      const relative: PowerSearchFilter = {
        field: 'age',
        operator: 'newer',
        value: {type: 'date_relative', value: '3d_ago'},
      };
      function Harness() {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([relative]);
        return (
          <PowerSearch
            config={valueTypesConfig}
            filters={filters}
            onChange={next => setFilters(next)}
            experimental={{presentation: 'bottom-sheet'}}
          />
        );
      }
      render(<Harness />);
      // The trigger shows the popover token as it is: the stored key.
      expect(within(field()).getByText('3d_ago')).toBeTruthy();
      openSheet();
      const row = within(sheet()).getByRole('button', {
        name: 'Age is newer than 3 days ago',
      });
      fireEvent.click(row);
      expect(choice('3 days ago')).toBeChecked();
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Cancel'}));
      // The value step finishes its exit before the removal.
      settleSheets();
      fireEvent.click(removeButton('Age'));
      const filtersDialog = sheet();
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Removed Age is newer than 3 days ago',
        ),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('renders the Filters row and the Removed text through one labelValue message, so a reordering locale keeps them consistent (INV1a)', async () => {
    const spy = mockModalDialogs();
    try {
      function Harness() {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([openFilter]);
        return (
          <InternationalizationProvider locale="en" overrides={REORDERED}>
            <PowerSearch
              config={config}
              filters={filters}
              onChange={next => setFilters(next)}
              experimental={{presentation: 'bottom-sheet'}}
            />
          </InternationalizationProvider>
        );
      }
      render(<Harness />);
      openSheet();
      const row = within(sheet()).getByRole('button', {
        name: 'Open (Status is)',
      });
      expect(within(row).getByText('Open')).toHaveStyle({
        fontWeight: 'var(--font-weight-bold)',
      });
      fireEvent.click(removeButton('Status'));
      const filtersDialog = sheet();
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Removed Open (Status is)',
        ),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('announces Clear all and a changed count through one catalog message a locale can reorder (INV1a)', async () => {
    const spy = mockModalDialogs();
    try {
      function Harness() {
        const [filters, setFilters] = useState<
          ReadonlyArray<PowerSearchFilter>
        >([openFilter]);
        return (
          <InternationalizationProvider locale="en" overrides={REORDERED}>
            <PowerSearch
              config={config}
              filters={filters}
              onChange={next => setFilters(next)}
              resultCount={filters.length === 0 ? 240 : 12}
              experimental={{presentation: 'bottom-sheet'}}
            />
          </InternationalizationProvider>
        );
      }
      render(<Harness />);
      openSheet();
      const filtersDialog = sheet();
      fireEvent.click(within(sheet()).getByRole('button', {name: 'Clear all'}));
      confirmClearAll();
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)?.textContent ?? '').toContain(
          '240 results — all filters removed',
        ),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    [1e21, '1e+21'],
    [1e-7, '1e-7'],
    [-0, '0'],
    [2.3456, '2.3456'],
  ])(
    'reads a number on the Filters row exactly as the token does in English, %s (FR12)',
    (value, text) => {
      setup({
        config: valueTypesConfig,
        filters: [
          {field: 'cost', operator: 'gt', value: {type: 'float', value}},
        ],
      });
      expect(within(field()).getByText(text)).toBeTruthy();
      openSheet();
      expect(
        within(sheet()).getByRole('button', {name: `Cost > ${text}`}),
      ).toBeTruthy();
    },
  );

  it("reads a number with the locale's digits and decimal mark where they differ from the token's, differing only in notation (FR12)", () => {
    render(
      <InternationalizationProvider locale="de">
        <PowerSearch
          config={valueTypesConfig}
          filters={[
            {
              field: 'cost',
              operator: 'gt',
              value: {type: 'float', value: 1e-7},
            },
            {
              field: 'lines',
              operator: 'gt',
              value: {type: 'integer', value: -0},
            },
            {
              field: 'cost',
              operator: 'gt',
              value: {type: 'float', value: 1e-21},
            },
          ]}
          onChange={() => {}}
          experimental={{presentation: 'bottom-sheet'}}
        />
      </InternationalizationProvider>,
    );
    openSheet();
    expect(
      within(sheet()).getByRole('button', {name: 'Cost > 0,0000001'}),
    ).toBeTruthy();
    expect(
      within(sheet()).getByRole('button', {name: 'Lines is greater than -0'}),
    ).toBeTruthy();
    // No rounding: the fraction cap is Intl's maximum.
    expect(
      within(sheet()).getByRole('button', {
        name: 'Cost > 0,000000000000000000001',
      }),
    ).toBeTruthy();
    // The token keeps its own text.
    expect(within(field()).getByText('1e-7')).toBeTruthy();
    expect(within(field()).getByText('0')).toBeTruthy();
  });

  it('formats a list and a number on the Filters row and in Removed in the provider locale (INV1a, INV8)', async () => {
    const spy = mockModalDialogs();
    try {
      const filters: PowerSearchFilter[] = [
        {
          field: 'ids',
          operator: 'in',
          value: {type: 'string_list', value: ['a', 'b', 'c']},
        },
        {
          field: 'lines',
          operator: 'gt',
          value: {type: 'integer', value: 1234567},
        },
        {field: 'cost', operator: 'gt', value: {type: 'float', value: 2.3456}},
      ];
      function Harness() {
        const [current, setCurrent] =
          useState<ReadonlyArray<PowerSearchFilter>>(filters);
        return (
          <InternationalizationProvider locale="de">
            <PowerSearch
              config={valueTypesConfig}
              filters={current}
              onChange={next => setCurrent(next)}
              experimental={{presentation: 'bottom-sheet'}}
            />
          </InternationalizationProvider>
        );
      }
      render(<Harness />);
      openSheet();
      // German list separators and digit grouping, not a literal ", " and
      // `String()`; the popover token keeps its own literals (known gap).
      const list = within(sheet()).getByRole('button', {
        name: 'ID is any of a, b und c',
      });
      // Provider digits and decimal mark, but no grouping and no rounding,
      // so in English the row reads exactly as the token does.
      expect(
        within(sheet()).getByRole('button', {
          name: 'Lines is greater than 1234567',
        }),
      ).toBeTruthy();
      expect(within(field()).getByText('a, b, c')).toBeTruthy();
      expect(within(field()).getByText('1234567')).toBeTruthy();
      // A float: the locale's decimal mark, no rounding.
      expect(
        within(sheet()).getByRole('button', {name: 'Cost > 2,3456'}),
      ).toBeTruthy();
      expect(within(field()).getByText('2.3456')).toBeTruthy();
      fireEvent.click(
        within(list.closest('li')!).getByRole('button', {
          name: 'Remove ID filter',
        }),
      );
      const filtersDialog = sheet();
      await waitFor(() =>
        expect(modalLiveRegion(filtersDialog)).toHaveTextContent(
          'Removed ID is any of a, b und c',
        ),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    ['en', 'Bug, Feature, Docs'],
    ['zh-CN', 'Bug、Feature、Docs'],
    ['ja-JP', 'Bug、Feature、Docs'],
    ['de-DE', 'Bug, Feature und Docs'],
  ])(
    'joins a list value on the Filters row with a narrow conjunction list in %s, so every value stays separated (FR12)',
    (locale, text) => {
      render(
        <InternationalizationProvider locale={locale}>
          <PowerSearch
            config={valueTypesConfig}
            filters={[
              {
                field: 'ids',
                operator: 'in',
                value: {type: 'string_list', value: ['Bug', 'Feature', 'Docs']},
              },
            ]}
            onChange={() => {}}
            experimental={{presentation: 'bottom-sheet'}}
          />
        </InternationalizationProvider>,
      );
      openSheet();
      expect(
        within(sheet()).getByRole('button', {name: `ID is any of ${text}`}),
      ).toBeTruthy();
      // The token keeps its literal join (known gap).
      expect(within(field()).getByText('Bug, Feature, Docs')).toBeTruthy();
    },
  );

  it("formats every value type on a Filters row with the popover token's words", () => {
    const filters: PowerSearchFilter[] = [
      {
        field: 'ids',
        operator: 'in',
        value: {type: 'string_list', value: ['a', 'b']},
      },
      {field: 'lines', operator: 'gt', value: {type: 'integer', value: 7}},
      {
        field: 'window',
        operator: 'between',
        value: {
          type: 'date_range',
          value: {
            start: {type: 'ABSOLUTE', unixSeconds: 0},
            end: {type: 'ABSOLUTE', unixSeconds: 86400},
          },
        },
      },
    ];
    const popover = popoverTokenValues(filters);
    expect(popover).toEqual(['a, b', '7', 'date range']);
    setup({config: valueTypesConfig, filters});
    openSheet();
    const rows = within(sheet()).getAllByRole('button', {
      name: /^(ID|Lines|Window) /,
    });
    expect(
      rows.map(row => row.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      `ID is any of ${popover[0]}`,
      `Lines is greater than ${popover[1]}`,
      `Window is between ${popover[2]}`,
    ]);
  });
});

// =============================================================================
// Helpers
// =============================================================================

describe('powerSearchSheetUtils', () => {
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

  it("offers the popover presentation's suggestions, nested fields included (FR13)", () => {
    const withNested: PowerSearchConfig = {
      ...contentSearchConfig,
      fields: [
        ...contentSearchConfig.fields,
        {
          key: 'group',
          label: 'Group',
          operators: [{key: 'all', label: 'all of', value: {type: 'nested'}}],
        },
      ],
    };
    const {result} = renderHook(() => {
      const internal = useInternalConfig(withNested);
      const source = usePowerSearchSource(internal, 10);
      return createSheetSuggestionSource(internal, source);
    });
    expect(result.current.bootstrap().map(item => item.id)).toEqual([
      'status',
      'author',
      'unassigned',
      'group',
      'labels',
    ]);
    const results = result.current.search('status is clo');
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
    expect(result.current.search('Group')[0]).toMatchObject({
      auxiliaryData: {fieldKey: 'group'},
    });
  });
});
