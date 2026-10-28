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
import userEvent from '@testing-library/user-event';
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
    // Next microtask, not synchronously: a real frame never runs before
    // requestAnimationFrame returns, and callers may rely on its id.
    vi.fn((cb: FrameRequestCallback) => {
      queueMicrotask(() => cb(0));
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
    const emptyState = title.closest('.astryx-empty-state');
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

/**
 * Behaviors at parity with Core's sheet presentation (`component:Tokenizer`
 * DEC-3, FR16–FR24, AR6), ported into the Lab prototype.
 */
describe('MobileTokenizer Core-sheet parity', () => {
  // The live region the hook writes inside an open modal (AST-086 FR14);
  // created by the first announcement, so absent means nothing was said.
  const liveText = (root: HTMLElement) =>
    root.querySelector('[data-astryx-modal-live-region]')?.textContent ?? '';
  // jsdom has no showModal(), so an open dialog never matches `:modal`;
  // stand in for the sheet the browser presents modally.
  let matchesSpy: ReturnType<typeof vi.spyOn> | null = null;
  const presentModally = () => {
    const matches = Element.prototype.matches;
    matchesSpy = vi
      .spyOn(Element.prototype, 'matches')
      .mockImplementation(function (this: Element, selector: string) {
        return selector === ':modal'
          ? this instanceof HTMLDialogElement && this.open
          : matches.call(this, selector);
      });
  };
  beforeEach(async () => {
    // The page's live regions outlive a test's tree, and a previous test's
    // announcement may still be a frame away; let it land, then start with
    // nothing said on the page.
    await new Promise(resolve => setTimeout(resolve, 0));
    for (const region of document.querySelectorAll(
      'body > [data-astryx-live-region]',
    )) {
      region.textContent = '';
    }
  });
  afterEach(() => {
    matchesSpy?.mockRestore();
    matchesSpy = null;
  });
  const openSheet = async (name = /Tags/) => {
    fireEvent.click(screen.getByRole('button', {name}));
    const sheet = await screen.findByRole('dialog');
    return sheet;
  };

  it('mounts the sheet only from the press until its exit completes, and keeps nothing of it at rest (INV7)', async () => {
    presentModally();
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Search Tags')).toBeNull();
    const sheet = await openSheet();
    expect(sheet).toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    // Closed but retained for its exit; the trigger's focus (BottomSheet's
    // hand-back after the exit) releases it.
    const trigger = screen.getByRole('button', {name: /Tags/});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    act(() => trigger.focus());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('caps the empty-query bootstrap set at maxMenuItems, and an empty bootstrap shows only the search field (FR20)', async () => {
    presentModally();
    const many: SearchableItem[] = Array.from({length: 30}, (_, i) => ({
      id: `i${i}`,
      label: `Item ${i + 1}`,
    }));
    const bigSource: SearchSource<SearchableItem> = {
      search: () => many,
      bootstrap: () => many,
    };
    const {unmount} = render(
      <MobileTokenizer
        label="Items"
        searchSource={bigSource}
        value={[]}
        onChange={() => {}}
        debounceMs={0}
        maxMenuItems={7}
      />,
    );
    await openSheet(/Items/);
    await waitFor(() =>
      expect(screen.getAllByRole('checkbox')).toHaveLength(7),
    );
    unmount();

    const emptySource: SearchSource<SearchableItem> = {
      search: () => [],
      bootstrap: () => [],
    };
    render(
      <MobileTokenizer
        label="Blank"
        searchSource={emptySource}
        value={[]}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const sheet = await openSheet(/Blank/);
    await waitFor(() =>
      expect(within(sheet).queryByRole('img', {name: 'Loading'})).toBeNull(),
    );
    expect(screen.getByLabelText('Search Blank')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-tokenizer-list')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('No items available')).toBeNull();
    expect(screen.queryByText('No results found')).toBeNull();
    expect(liveText(sheet)).toBe('');
  });

  it("describes the trigger in the inline input's order — caller ids, description, status, disabled reason, count, then the tokens by id — with no label repeated (AR6, AST-085 FR5)", async () => {
    render(
      <>
        <p id="hint">Pick a few</p>
        <MobileTokenizer
          label="Tags"
          aria-describedby="hint"
          description="Up to three"
          status={{type: 'error', message: 'Pick at least one'}}
          isDisabled
          disabledMessage="Locked by the owner"
          searchSource={source}
          value={[ITEMS[0], ITEMS[1]]}
          onChange={() => {}}
        />
      </>,
    );
    const trigger = screen.getByRole('button', {name: 'Tags'});
    const ids = trigger.getAttribute('aria-describedby')!.split(' ');
    const texts = ids.map(id => document.getElementById(id)!.textContent);
    expect(texts).toEqual([
      'Pick a few',
      'Up to three',
      'Pick at least one',
      'Locked by the owner',
      '2 selected',
      'Design',
      'Eng',
    ]);
    expect(trigger).toHaveAccessibleDescription(
      'Pick a few Up to three Pick at least one Locked by the owner 2 selected Design Eng',
    );
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    // The reason is a tooltip, not a native title: it is the element the
    // description names, and it opens on focus, so keyboard and touch users
    // get it too.
    expect(trigger).not.toHaveAttribute('title');
    const tooltip = screen.getByRole('tooltip', {hidden: true});
    expect(tooltip).toHaveTextContent('Locked by the owner');
    expect(ids).toContain(tooltip.id);
    // jsdom has no Popover API; the shared setup stubs showPopover, so the
    // open is observed as the call on the tooltip's element.
    const shown = vi.spyOn(HTMLElement.prototype, 'showPopover');
    try {
      // Keyboard focus: the tooltip opens for `:focus-visible` focus only.
      await userEvent.setup().tab();
      expect(trigger).toHaveFocus();
      await waitFor(() => {
        expect(shown.mock.instances).toContain(tooltip);
      });
    } finally {
      shown.mockRestore();
    }
  });

  it('paints the trigger on the input surface, so a status band behind it does not show through the tokens', () => {
    const atoms = (style: stylex.StyleXStyles) =>
      stylex
        .props(style)
        .className!.split(' ')
        .filter(name => !name.includes('__'));
    const surface = stylex.create({
      trigger: {backgroundColor: colorVars['--color-background-surface']},
    });
    render(
      <MobileTokenizer
        label="Tags"
        status={{type: 'error', message: 'Pick at least one'}}
        searchSource={source}
        value={[ITEMS[0]]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Tags'});
    for (const name of atoms(surface.trigger)) {
      expect(trigger).toHaveClass(name);
    }
    expect(screen.getByText('Pick at least one')).toBeInTheDocument();
  });

  it("composes the trigger's own handlers and attributes with the caller's: onClick after the open, onFocus for focus from outside only, aria-label winning, aria-describedby merged, className and style on the trigger", async () => {
    presentModally();
    const onClick = vi.fn();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(
      <>
        <p id="hint">Pick a few</p>
        <button type="button">Elsewhere</button>
        <MobileTokenizer
          label="Tags"
          aria-label="Project tags"
          aria-describedby="hint"
          className="caller-class"
          style={{marginBlockStart: 3}}
          onClick={onClick}
          onFocus={onFocus}
          onBlur={onBlur}
          searchSource={source}
          value={[ITEMS[0]]}
          onChange={() => {}}
          debounceMs={0}
        />
      </>,
    );
    // The caller's name wins; the description still starts with its ids.
    const trigger = screen.getByRole('button', {name: 'Project tags'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger.getAttribute('aria-describedby')!.split(' ')[0]).toBe(
      'hint',
    );
    expect(trigger).toHaveAccessibleDescription(
      /^Pick a few 1 selected Design/,
    );
    expect(trigger).toHaveClass('caller-class');
    expect(trigger.style.marginBlockStart).toBe('3px');
    // Focus from outside reports; the field's own label and tokens too.
    act(() => trigger.focus());
    expect(onFocus).toHaveBeenCalledTimes(1);
    // The click opens the sheet and then reaches the caller.
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const sheet = await screen.findByRole('dialog');
    await screen.findByRole('checkbox', {name: 'Design'});
    // Focus moving into the sheet is still the field's: no blur reported.
    act(() => screen.getByLabelText('Search Tags').focus());
    expect(onBlur).not.toHaveBeenCalled();
    // Closing hands focus back to the trigger: that is not focus entering
    // from outside, so the caller's onFocus stays quiet for it.
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    act(() => trigger.focus());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sheet).not.toBeInTheDocument();
    expect(onFocus).toHaveBeenCalledTimes(1);
    // Leaving the field reports the blur once.
    act(() => screen.getByRole('button', {name: 'Elsewhere'}).focus());
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("reports the sheet's focus hand-back as the entry when the trigger never had focus (a tap that opens without focusing, as Safari does), so the caller never gets a blur without its focus", async () => {
    presentModally();
    const events: string[] = [];
    render(
      <>
        <button type="button">Elsewhere</button>
        <MobileTokenizer
          label="Tags"
          onFocus={() => events.push('focus')}
          onBlur={() => events.push('blur')}
          searchSource={source}
          value={[ITEMS[0]]}
          onChange={() => {}}
          debounceMs={0}
        />
      </>,
    );
    const trigger = screen.getByRole('button', {name: 'Tags'});
    // A click with no focus first: the sheet opens, nothing reported yet.
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    await screen.findByRole('checkbox', {name: 'Design'});
    expect(trigger).not.toHaveFocus();
    expect(events).toEqual([]);
    // Done: BottomSheet hands focus to the trigger. The trigger never had
    // focus, so this is the entry.
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    act(() => trigger.focus());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(events).toEqual(['focus']);
    // Leaving the field reports the blur, after its focus.
    act(() => screen.getByRole('button', {name: 'Elsewhere'}).focus());
    expect(events).toEqual(['focus', 'blur']);
    // A second round from a focused trigger: entry on focus, quiet on the
    // hand-back, blur on leaving — one pair again.
    act(() => trigger.focus());
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    act(() => trigger.focus());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => screen.getByRole('button', {name: 'Elsewhere'}).focus());
    expect(events).toEqual(['focus', 'blur', 'focus', 'blur']);
  });

  it('forwards the base props — id, data-*, aria-*, handlers — to the trigger button, not the field root', () => {
    const onPointerDown = vi.fn();
    render(
      <MobileTokenizer
        label="Tags"
        id="tags-field"
        data-testid="tags-trigger"
        aria-label="Project tags"
        onPointerDown={onPointerDown}
        searchSource={source}
        value={[ITEMS[0]]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId('tags-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('id', 'tags-field');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    // The field's label still points at the control.
    expect(screen.getByText('Tags').closest('label')).toHaveAttribute(
      'for',
      'tags-field',
    );
    fireEvent.pointerDown(trigger);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(trigger.closest('.astryx-field')).not.toHaveAttribute('id');
    expect(trigger.closest('.astryx-field')).not.toHaveAttribute('data-testid');
  });

  it('renders one hidden form carrier per selected item only while enabled with an htmlName (FR10, FR17)', () => {
    const {container, rerender} = render(
      <MobileTokenizer
        label="Tags"
        htmlName="tags"
        searchSource={source}
        value={[ITEMS[0], ITEMS[1]]}
        onChange={() => {}}
      />,
    );
    const carriers = () =>
      Array.from(
        container.querySelectorAll<HTMLInputElement>(
          'input[type="hidden"][name="tags"]',
        ),
      ).map(input => input.value);
    expect(carriers()).toEqual(['design', 'eng']);
    rerender(
      <MobileTokenizer
        label="Tags"
        htmlName="tags"
        isDisabled
        searchSource={source}
        value={[ITEMS[0], ITEMS[1]]}
        onChange={() => {}}
      />,
    );
    expect(carriers()).toEqual([]);
    rerender(
      <MobileTokenizer
        label="Tags"
        searchSource={source}
        value={[ITEMS[0], ITEMS[1]]}
        onChange={() => {}}
      />,
    );
    expect(carriers()).toEqual([]);
  });

  it('reads the source through a ref: a source rebuilt on an unrelated render causes no new request (FR20)', async () => {
    const search = vi.fn((q: string) =>
      ITEMS.filter(item => item.label.toLowerCase().includes(q.toLowerCase())),
    );
    const bootstrap = vi.fn(() => ITEMS);
    function Rebuilding() {
      const [value, setValue] = useState<SearchableItem[]>([]);
      // A new source object every render, as a caller writing it inline does.
      const inline: SearchSource<SearchableItem> = {
        search: q => search(q),
        bootstrap: () => bootstrap(),
      };
      return (
        <MobileTokenizer
          label="Tags"
          searchSource={inline}
          value={value}
          onChange={items => setValue(items)}
          debounceMs={0}
        />
      );
    }
    render(<Rebuilding />);
    await openSheet();
    await screen.findByRole('checkbox', {name: 'Design'});
    expect(bootstrap).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('checkbox', {name: 'Design'}));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', {name: 'Design'})).toBeChecked(),
    );
    fireEvent.click(screen.getByRole('checkbox', {name: 'Eng'}));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', {name: 'Eng'})).toBeChecked(),
    );
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
  });

  it('is pending only for a query it will search: a kept query below minQueryLength opens settled (FR20, FR18)', async () => {
    let pending = () => {};
    const slow: SearchSource<SearchableItem> = {
      search: () =>
        new Promise<SearchableItem[]>(resolve => {
          pending = () => resolve([ITEMS[1]]);
        }),
      bootstrap: () =>
        new Promise<SearchableItem[]>(resolve => {
          pending = () => resolve(ITEMS);
        }),
    };
    function Flow() {
      const [isDisabled, setIsDisabled] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsDisabled(d => !d)}>
            Toggle
          </button>
          <MobileTokenizer
            label="Tags"
            searchSource={slow}
            value={[]}
            onChange={() => {}}
            debounceMs={0}
            minQueryLength={3}
            isDisabled={isDisabled}
          />
        </>
      );
    }
    render(<Flow />);
    const sheet = await openSheet();
    // Pending from open until the bootstrap settles.
    expect(within(sheet).getByRole('img', {name: 'Loading'})).toBeTruthy();
    await act(async () => {
      pending();
    });
    expect(within(sheet).queryByRole('img', {name: 'Loading'})).toBeNull();
    // Below the threshold: nothing is searched, nothing is pending.
    fireEvent.change(screen.getByLabelText('Search Tags'), {
      target: {value: 'en'},
    });
    expect(within(sheet).queryByRole('img', {name: 'Loading'})).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    // The field becomes disabled while open: the sheet closes and the query
    // is kept; re-enabled and reopened, it starts from "en", settled.
    fireEvent.click(screen.getByRole('button', {name: 'Toggle'}));
    expect(screen.getByRole('button', {name: /Tags/})).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    act(() => screen.getByRole('button', {name: /Tags/}).focus());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', {name: 'Toggle'}));
    const reopened = await openSheet();
    expect(screen.getByLabelText('Search Tags')).toHaveValue('en');
    expect(within(reopened).queryByRole('img', {name: 'Loading'})).toBeNull();
  });

  it('keeps a spent Clear all in the focus order with its reason, confirms, then focuses the search field and announces inside the sheet after the confirmation has closed (FR24, AST-085 FR1, AST-086 FR14)', async () => {
    presentModally();
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const sheet = await openSheet();
    await screen.findByRole('checkbox', {name: 'Design'});
    const clearAll = screen.getByRole('button', {name: 'Clear all'});
    expect(clearAll).not.toHaveAttribute('aria-disabled');
    fireEvent.click(clearAll);
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Clear all selected items?');
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole('button', {name: 'Clear selection'}),
    );
    expect(spy).toHaveBeenCalledWith(
      [],
      expect.objectContaining({type: 'remove'}),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByLabelText('Search Tags')).toHaveFocus();
    await waitFor(() => expect(liveText(sheet)).toBe('All items removed'));
    // Spent: still a tab stop, says why, opens no confirmation.
    const spent = screen.getByRole('button', {name: 'Clear all'});
    expect(spent).toHaveAttribute('aria-disabled', 'true');
    expect(spent).not.toHaveAttribute('disabled');
    expect(spent).toHaveAccessibleDescription('Nothing selected');
    fireEvent.click(spent);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('announces each toggle and the result count from inside the dialog (AR6, AST-086 FR14)', async () => {
    presentModally();
    render(<Harness />);
    const sheet = await openSheet();
    await screen.findByRole('checkbox', {name: 'Energizer'});
    fireEvent.click(screen.getByRole('checkbox', {name: 'Energizer'}));
    await waitFor(() => expect(liveText(sheet)).toBe('Added Energizer'));
    fireEvent.change(screen.getByLabelText('Search Tags'), {
      target: {value: 'eng'},
    });
    await waitFor(() => expect(liveText(sheet)).toBe('2 results'));
    // Nothing went to the page-level region behind the modal.
    for (const region of document.querySelectorAll(
      'body > [data-astryx-live-region]',
    )) {
      expect(region.textContent).toBe('');
    }
  });

  it('uses the shared catalog for the sheet strings', async () => {
    render(<CreateHarness spy={() => {}} />);
    await openSheet();
    const search = screen.getByLabelText('Search Tags');
    expect(search).toHaveAttribute('placeholder', 'Search…');
    fireEvent.change(search, {target: {value: 'Ops'}});
    await screen.findByTestId('mobile-tokenizer-create-row');
    expect(screen.getByText('Create "Ops"')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add Ops'})).toBeInTheDocument();
    // With `hasCreate`, an unmatched query offers the create row instead of
    // the empty state; the empty state's catalog words are checked with a
    // field without it, above ("searches within the same sheet").
    fireEvent.change(search, {target: {value: 'zzz'}});
    expect(
      await screen.findByRole('button', {name: 'Add zzz'}),
    ).toBeInTheDocument();
  });
});
