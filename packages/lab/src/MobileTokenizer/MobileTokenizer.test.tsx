// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file MobileTokenizer.test.tsx
 * @input Uses vitest, @testing-library/react, MobileTokenizer
 * @output Lab tests for the single-sheet touch flow
 * @position Lab tests; validates MobileTokenizer.tsx
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
import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {MobileTokenizer, type MobileTokenizerChange} from './MobileTokenizer';
import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';

const ITEMS: SearchableItem[] = [
  {id: 'design', label: 'Design'},
  {id: 'eng', label: 'Eng'},
  {id: 'engineer', label: 'Engineer'},
  {id: 'energizer', label: 'Energizer'},
];
const source: SearchSource<SearchableItem> = {
  search: q =>
    ITEMS.filter(item => item.label.toLowerCase().includes(q.toLowerCase())),
  bootstrap: () => ITEMS,
};

function Harness({
  spy,
}: {
  spy?: (
    items: SearchableItem[],
    change: MobileTokenizerChange<SearchableItem>,
  ) => void;
}) {
  const [value, setValue] = useState<SearchableItem[]>([ITEMS[0], ITEMS[1]]);
  return (
    <MobileTokenizer
      label="Tags"
      searchSource={source}
      value={value}
      debounceMs={0}
      placeholder="Add tags"
      onChange={(items, change) => {
        setValue(items);
        spy?.(items, change);
      }}
    />
  );
}

function CreateHarness({
  spy,
}: {
  spy: (
    items: SearchableItem[],
    change: MobileTokenizerChange<SearchableItem>,
  ) => void;
}) {
  const [value, setValue] = useState<SearchableItem[]>([]);
  return (
    <MobileTokenizer
      label="Tags"
      searchSource={source}
      value={value}
      hasCreate
      debounceMs={0}
      onChange={(items, change) => {
        setValue(items);
        spy(items, change);
      }}
    />
  );
}

beforeEach(() => {
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
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('MobileTokenizer (Lab, single-sheet flow)', () => {
  it('keeps rows stable while open and applies selected-first order on reopen', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const trigger = screen.getByRole('button', {name: /Tags/});
    fireEvent.click(trigger);

    const list = await screen.findByTestId('mobile-tokenizer-list');
    await screen.findByRole('checkbox', {name: 'Energizer'});
    const checkboxLabels = () =>
      within(list)
        .getAllByRole('checkbox')
        .map(row => row.getAttribute('aria-label'));
    expect(checkboxLabels()).toEqual([
      'Design',
      'Eng',
      'Engineer',
      'Energizer',
    ]);
    const search = screen.getByLabelText('Search Tags');
    expect(
      search.closest('.astryx-text-input')?.querySelector('.astryx-icon'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Add item'}),
    ).not.toBeInTheDocument();
    const design = screen.getByRole('checkbox', {name: 'Design'});
    expect(design).toBeChecked();
    expect(design.lastElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(design.lastElementChild).toHaveAttribute('data-size', 'md');

    fireEvent.click(screen.getByRole('checkbox', {name: 'Energizer'}));
    expect(spy).toHaveBeenCalledWith(
      [ITEMS[0], ITEMS[1], ITEMS[3]],
      expect.objectContaining({type: 'add'}),
    );
    await waitFor(() =>
      expect(screen.getByRole('checkbox', {name: 'Energizer'})).toBeChecked(),
    );
    expect(checkboxLabels()).toEqual([
      'Design',
      'Eng',
      'Engineer',
      'Energizer',
    ]);

    fireEvent.click(screen.getByRole('checkbox', {name: 'Eng'}));
    expect(spy).toHaveBeenLastCalledWith(
      [ITEMS[0], ITEMS[3]],
      expect.objectContaining({type: 'remove'}),
    );
    expect(checkboxLabels()).toEqual([
      'Design',
      'Eng',
      'Engineer',
      'Energizer',
    ]);

    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await act(async () => {
      fireEvent.click(trigger);
    });
    expect(checkboxLabels()).toEqual([
      'Design',
      'Energizer',
      'Eng',
      'Engineer',
    ]);
  });

  it('creates a custom entry with a trailing Add action', async () => {
    const spy = vi.fn();
    render(<CreateHarness spy={spy} />);
    const trigger = screen.getByRole('button', {name: /Tags/});
    fireEvent.click(trigger);
    const search = await screen.findByLabelText('Search Tags');
    fireEvent.change(search, {target: {value: 'Custom'}});

    expect(
      screen.queryByRole('checkbox', {name: 'Create "Custom"'}),
    ).not.toBeInTheDocument();
    const create = await screen.findByRole('button', {name: 'Add Custom'});
    expect(
      screen.queryByRole('button', {name: 'Clear all'}),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Done'}),
    ).not.toBeInTheDocument();
    expect(create).toHaveAttribute('data-size', 'lg');
    expect(screen.getByTestId('mobile-tokenizer-create-row')).toHaveTextContent(
      'Create "Custom"',
    );
    await act(async () => {
      fireEvent.click(create);
    });
    expect(spy).toHaveBeenCalledWith(
      [{id: 'Custom', label: 'Custom'}],
      expect.objectContaining({type: 'create'}),
    );
    await waitFor(() => expect(trigger).toHaveTextContent('Custom'));
    expect(search).toHaveValue('');
    const custom = await screen.findByRole('checkbox', {name: 'Custom'});
    expect(custom).toBeChecked();
  });

  it('renders long lists in 50-item batches and resets the window for search', async () => {
    const longItems: SearchableItem[] = Array.from(
      {length: 120},
      (_, index) => ({
        id: `item-${index + 1}`,
        label: `Item ${String(index + 1).padStart(3, '0')}`,
      }),
    );
    const longSource: SearchSource<SearchableItem> = {
      bootstrap: () => longItems,
      search: query =>
        longItems.filter(item =>
          item.label.toLowerCase().includes(query.toLowerCase()),
        ),
    };
    render(
      <MobileTokenizer
        label="Items"
        searchSource={longSource}
        value={[]}
        onChange={() => {}}
        maxMenuItems={120}
        debounceMs={0}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Items'}));
    const list = await screen.findByTestId('mobile-tokenizer-list');
    await waitFor(() => {
      expect(list).toHaveAttribute('data-rendered-count', '50');
      expect(list).toHaveAttribute('data-total-count', '120');
    });
    expect(screen.getAllByRole('checkbox')).toHaveLength(50);
    expect(
      screen.queryByRole('checkbox', {name: 'Item 051'}),
    ).not.toBeInTheDocument();

    Object.defineProperties(list, {
      clientHeight: {configurable: true, value: 600},
      scrollHeight: {configurable: true, value: 2400},
      scrollTop: {configurable: true, value: 1700, writable: true},
    });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-rendered-count', '100');
    expect(screen.getAllByRole('checkbox')).toHaveLength(100);
    expect(
      screen.getByRole('checkbox', {name: 'Item 100'}),
    ).toBeInTheDocument();

    Object.defineProperties(list, {
      scrollHeight: {configurable: true, value: 4400},
      scrollTop: {
        configurable: true,
        value: 3600,
        writable: true,
      },
    });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-rendered-count', '120');
    expect(screen.getAllByRole('checkbox')).toHaveLength(120);

    fireEvent.change(screen.getByLabelText('Search Items'), {
      target: {value: 'Item'},
    });
    await waitFor(() =>
      expect(list).toHaveAttribute('data-rendered-count', '50'),
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(50);

    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-rendered-count', '100');
    expect(screen.getAllByRole('checkbox')).toHaveLength(100);
  });

  it('searches within the same sheet and centers the no-results state', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', {name: /Tags/}));
    const search = await screen.findByLabelText('Search Tags');
    fireEvent.change(search, {target: {value: 'zzz'}});

    const title = await screen.findByRole('heading', {
      name: 'No results found',
    });
    const emptyState = title.closest('[role="status"]');
    expect(emptyState).toHaveTextContent('Try a different search.');
    expect(emptyState?.querySelector('.astryx-icon')).toHaveAttribute(
      'data-size',
      'lg',
    );
  });

  it('keeps large equal-width Clear all and Done footer actions while guarding the bulk clear', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.click(screen.getByRole('button', {name: /Tags/}));
    const list = await screen.findByTestId('mobile-tokenizer-list');

    const clearAll = screen.getByRole('button', {name: 'Clear all'});
    const done = screen.getByRole('button', {name: 'Done'});
    expect(clearAll).toHaveAttribute('data-size', 'lg');
    expect(clearAll).toHaveAttribute('data-variant', 'secondary');
    expect(done).toHaveAttribute('data-size', 'lg');
    expect(list.compareDocumentPosition(clearAll)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(list.compareDocumentPosition(done)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.click(clearAll);
    const confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Clear all selected items?');
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole('button', {name: 'Clear selection'}),
    );
    expect(spy).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({type: 'remove'}),
    );
  });

  it('hides the visible label on request while the trigger and the sheet keep it as their name, and renders rows through renderItem', async () => {
    render(
      <MobileTokenizer
        label="Tags"
        isLabelHidden
        searchSource={source}
        value={[]}
        debounceMs={0}
        onChange={() => {}}
        renderItem={item => <em data-testid="custom-row">{item.label}!</em>}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Tags'});
    // The Field's label is clipped out of the layout (sr-only), as Core
    // Tokenizer's is, while the trigger keeps it as its name.
    const label = screen.getByText('Tags', {selector: 'label'});
    expect(getComputedStyle(label).position).toBe('absolute');
    expect(getComputedStyle(label).clip).toMatch(
      /^rect\(0(px)?, 0(px)?, 0(px)?, 0(px)?\)$/,
    );
    expect(trigger).toHaveAccessibleName('Tags');
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Tags');
    const row = await screen.findByRole('checkbox', {name: 'Design'});
    expect(within(row).getByTestId('custom-row')).toHaveTextContent('Design!');
  });

  it('keeps a disabled trigger focusable without opening the sheet (AST-085 FR1, FR2)', () => {
    render(
      <MobileTokenizer
        label="Tags"
        searchSource={source}
        value={[ITEMS[0]]}
        onChange={() => {}}
        isDisabled
      />,
    );
    const trigger = screen.getByRole('button', {name: /Tags/});
    expect(trigger).not.toHaveAttribute('disabled');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    trigger.focus();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByTestId('mobile-tokenizer-list'),
    ).not.toBeInTheDocument();
  });

  it('keeps an unselectable row at the limit focusable but inert (AST-085 FR1, FR2)', async () => {
    const spy = vi.fn();
    render(
      <MobileTokenizer
        label="Tags"
        searchSource={source}
        value={[ITEMS[0]]}
        maxEntries={1}
        debounceMs={0}
        onChange={spy}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: /Tags/}));
    const row = await screen.findByRole('checkbox', {name: 'Energizer'});
    expect(row).not.toHaveAttribute('disabled');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(row);
    expect(spy).not.toHaveBeenCalled();
    expect(row).toHaveAttribute('aria-checked', 'false');
    // In forced colors its indicator border takes GrayText (AST-085 FR6).
    const indicatorClasses = stylex
      .props(
        stylex.create({
          border: {
            borderColor: {
              default: colorVars['--color-border'],
              '@media (forced-colors: active)': 'GrayText',
            },
          },
        }).border,
      )
      .className!.split(' ')
      .filter(name => !name.includes('__'));
    const indicator = row.querySelector('.astryx-checkbox-indicator')!;
    for (const name of indicatorClasses) {
      expect(indicator).toHaveClass(name);
    }
  });

  it('paints the placeholder of a disabled empty trigger GrayText in forced colors (AST-085 FR6)', () => {
    const placeholderClasses = stylex
      .props(
        stylex.create({
          placeholder: {
            color: {
              default: colorVars['--color-text-secondary'],
              '@media (forced-colors: active)': 'GrayText',
            },
          },
        }).placeholder,
      )
      .className!.split(' ')
      .filter(name => !name.includes('__'));
    render(
      <MobileTokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        placeholder="Add tags"
        isDisabled
      />,
    );
    const placeholder = screen.getByText('Add tags');
    for (const name of placeholderClasses) {
      expect(placeholder).toHaveClass(name);
    }
  });

  it('paints a disabled trigger and its tokens GrayText in forced colors (AST-085 FR6)', () => {
    // The same declarations as the component's styles compile to the same
    // atomic classes; without them the tokens keep their CanvasText label.
    const atoms = (style: stylex.StyleXStyles) =>
      stylex
        .props(style)
        .className!.split(' ')
        .filter(name => !name.includes('__'));
    const forced = stylex.create({
      trigger: {
        borderColor: {
          default: colorVars['--color-border'],
          '@media (forced-colors: active)': 'GrayText',
        },
        color: {default: null, '@media (forced-colors: active)': 'GrayText'},
      },
      token: {
        color: {
          default: colorVars['--color-text-primary'],
          '@media (forced-colors: active)': 'GrayText',
        },
      },
    });
    render(
      <MobileTokenizer
        label="Tags"
        searchSource={source}
        value={[ITEMS[0], ITEMS[1]]}
        onChange={() => {}}
        isDisabled
      />,
    );
    const trigger = screen.getByRole('button', {name: /Tags/});
    for (const name of atoms(forced.trigger)) {
      expect(trigger).toHaveClass(name);
    }
    const tokens = trigger.querySelectorAll('.astryx-token');
    expect(tokens).toHaveLength(2);
    for (const token of tokens) {
      for (const name of atoms(forced.token)) {
        expect(token).toHaveClass(name);
      }
    }
  });
});
