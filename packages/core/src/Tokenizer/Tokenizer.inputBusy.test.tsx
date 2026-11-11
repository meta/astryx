// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tokenizer.inputBusy.test.tsx
 * @input Uses vitest, Testing Library, Tokenizer with `isLoading` and
 *   `changeAction`
 * @output Tests for the field's input-busy state: the shared end-lane Spinner,
 *   `aria-busy`, and the optimistic `changeAction` value
 * @position Core tests; validates Tokenizer.tsx (component:Tokenizer, Input
 *   busy; family:input-fields FR5, FR6)
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {Tokenizer, type TokenizerChange} from './Tokenizer';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import type {SearchSource, SearchableItem} from '../Typeahead/types';

// The sheet module loads on demand. Load it before any test, so the first
// sheet test spends no time limit on the load.
await import('./TokenizerBottomSheet');

type Change = TokenizerChange<SearchableItem>;

const alice = {id: '1', label: 'Alice'};
const bob = {id: '2', label: 'Bob'};
const charlie = {id: '3', label: 'Charlie'};
const diana = {id: '4', label: 'Diana'};
const users: SearchableItem[] = [alice, bob, charlie, diana];

const userSource: SearchSource = {
  search: query =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users,
};

const popoverOpenState = new WeakMap<HTMLElement, boolean>();
const originalMatches = HTMLElement.prototype.matches;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
  window.scrollTo = vi.fn();
});

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(async () => {
  for (const settle of [...openSettles]) {
    await settle();
  }
  __resetLiveRegionsForTest();
  vi.unstubAllGlobals();
});

/**
 * Every visible Spinner. A Spinner kept idle in its slot is `aria-hidden`, so
 * the role query leaves it out.
 */
function visibleSpinners(): HTMLElement[] {
  return screen.queryAllByRole('img', {name: 'Loading'});
}

/**
 * Records each message written to the shared polite live region. Each
 * announce writes its text in a later frame, so two announces add it twice.
 */
function recordPoliteWrites(): {written: string[]; stop: () => void} {
  const written: string[] = [];
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target as Element;
      if (target.getAttribute?.('data-astryx-live-region') !== 'polite') {
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.textContent) {
          written.push(node.textContent);
        }
      }
    }
  });
  observer.observe(document.body, {childList: true, subtree: true});
  return {written, stop: () => observer.disconnect()};
}

/** The labels of the tokens on screen, read from their remove buttons. */
function tokenLabels(): string[] {
  return screen
    .queryAllByRole('button', {name: /^Remove /})
    .map(button => button.getAttribute('aria-label')!.replace(/^Remove /, ''));
}

function optionLabels(): string[] {
  return screen
    .queryAllByRole('option', {hidden: true})
    .map(option => option.textContent ?? '');
}

async function typeQuery(value: string) {
  await act(async () => {
    fireEvent.change(screen.getByRole('combobox'), {target: {value}});
  });
  // The debounce is zero; this lets the search settle.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/**
 * The usual `changeAction` caller: `onChange` does nothing, and the action
 * saves the change and then sets `value`, or leaves it when the save fails.
 */
function SavingTokenizer({
  initial,
  onSave,
  ...props
}: {
  initial: SearchableItem[];
  onSave: (
    items: SearchableItem[],
    change: Change,
  ) => Promise<'accept' | 'reject'>;
  hasClear?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={value}
        onChange={() => {}}
        changeAction={async (items, change) => {
          if ((await onSave(items, change)) === 'accept') {
            setValue(items);
          }
        }}
        debounceMs={0}
        {...props}
      />
      <button type="button" onClick={() => setValue([charlie])}>
        Replace with Charlie
      </button>
    </>
  );
}

// React holds every transition until all pending async actions settle, also
// actions from an earlier test. Each test therefore settles what it leaves.
const openSettles = new Set<() => Promise<void>>();

/**
 * Saves that wait for the test: each call holds a `settle(result)` that
 * settles it as accepted or rejected.
 */
function controlledSaves() {
  const saves: {
    items: SearchableItem[];
    settle: (result: 'accept' | 'reject') => Promise<void>;
  }[] = [];
  const onSave = async (items: SearchableItem[]) =>
    new Promise<'accept' | 'reject'>(resolve => {
      const settle = async (result: 'accept' | 'reject') => {
        openSettles.delete(reject);
        await act(async () => {
          resolve(result);
        });
      };
      const reject = async () => settle('reject');
      openSettles.add(reject);
      saves.push({items, settle});
    });
  return {saves, onSave};
}

async function pickOption(name: string) {
  const user = userEvent.setup();
  await typeQuery(name.slice(0, 2));
  await user.click(screen.getByRole('option', {name, hidden: true}));
}

describe('Tokenizer isLoading', () => {
  it('shows no Spinner and no aria-busy without it', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[alice]}
        onChange={() => {}}
      />,
    );
    expect(visibleSpinners()).toHaveLength(0);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-busy');
  });

  it('shows one Spinner and sets aria-busy, also while a search runs', async () => {
    let settleSearch: (items: SearchableItem[]) => void = () => {};
    const search = vi.fn(
      async () =>
        new Promise<SearchableItem[]>(resolve => {
          settleSearch = resolve;
        }),
    );
    const props = {
      label: 'Members',
      searchSource: {search, bootstrap: () => []},
      value: [alice],
      onChange: () => {},
      debounceMs: 0,
    };
    const {rerender} = render(<Tokenizer {...props} isLoading />);
    const input = screen.getByRole('combobox');

    expect(visibleSpinners()).toHaveLength(1);
    expect(input).toHaveAttribute('aria-busy', 'true');

    // A search in flight is busy as well, and shares the same Spinner.
    await act(async () => {
      fireEvent.change(input, {target: {value: 'Bo'}});
    });
    expect(search).toHaveBeenCalledWith('Bo', expect.anything());
    expect(visibleSpinners()).toHaveLength(1);
    expect(input).toHaveAttribute('aria-busy', 'true');

    // The search settles; the value is still loading.
    await act(async () => {
      settleSearch([bob]);
    });
    expect(visibleSpinners()).toHaveLength(1);
    expect(input).toHaveAttribute('aria-busy', 'true');

    rerender(<Tokenizer {...props} isLoading={false} />);
    expect(visibleSpinners()).toHaveLength(0);
    expect(input).not.toHaveAttribute('aria-busy');

    // A search alone shows that same Spinner: the single one above was both.
    await act(async () => {
      fireEvent.change(input, {target: {value: 'Al'}});
    });
    expect(search).toHaveBeenCalledWith('Al', expect.anything());
    expect(visibleSpinners()).toHaveLength(1);
    await act(async () => {
      settleSearch([alice]);
    });
    expect(visibleSpinners()).toHaveLength(0);
  });

  it('announces "Loading" once for a busy start, also when a search starts during it', async () => {
    const search = vi.fn(async () => new Promise<SearchableItem[]>(() => {}));
    const {written, stop} = recordPoliteWrites();
    render(
      <Tokenizer
        label="Members"
        searchSource={{search, bootstrap: () => []}}
        value={[alice]}
        onChange={() => {}}
        debounceMs={0}
        isLoading
      />,
    );
    await waitFor(() => expect(written).toContain('Loading'));

    // A search starts while the value is still loading. The field is busy
    // already, so this is not a new busy start.
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Bo'}});
    });
    expect(search).toHaveBeenCalledWith('Bo', expect.anything());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    stop();

    expect(written.filter(text => text === 'Loading')).toHaveLength(1);
  });

  it('sets aria-busy on the sheet trigger, with no Spinner (FR17)', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[alice]}
        onChange={() => {}}
        presentation="bottom-sheet"
        isLoading
      />,
    );
    expect(screen.getByRole('button', {name: 'Members'})).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(visibleSpinners()).toHaveLength(0);
  });
});

describe('Tokenizer changeAction', () => {
  describe('runs after onChange, with the same arguments, on every path', () => {
    function setup(
      props: Partial<React.ComponentProps<typeof Tokenizer>> = {},
    ) {
      const order: string[] = [];
      const onChange = vi.fn((_items: SearchableItem[], _change: Change) => {
        order.push('onChange');
      });
      const changeAction = vi.fn(
        async (_items: SearchableItem[], _change: Change) => {
          order.push('changeAction');
        },
      );
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[alice, bob]}
          onChange={onChange}
          changeAction={changeAction}
          debounceMs={0}
          {...props}
        />,
      );
      return {
        expectOneCall(items: SearchableItem[], change: Change) {
          expect(order).toEqual(['onChange', 'changeAction']);
          expect(onChange).toHaveBeenCalledWith(items, change);
          // The same objects, not equal copies.
          expect(changeAction.mock.calls[0][0]).toBe(onChange.mock.calls[0][0]);
          expect(changeAction.mock.calls[0][1]).toBe(onChange.mock.calls[0][1]);
        },
      };
    }

    it('add', async () => {
      const {expectOneCall} = setup();
      await pickOption('Charlie');
      expectOneCall([alice, bob, charlie], {item: charlie, type: 'add'});
    });

    it('create', async () => {
      const {expectOneCall} = setup({hasCreate: true});
      const user = userEvent.setup();
      await typeQuery('QA');
      await user.click(
        screen.getByRole('option', {name: 'Create "QA"', hidden: true}),
      );
      const qa = {id: 'QA', label: 'QA'};
      expectOneCall([alice, bob, qa], {item: qa, type: 'create'});
    });

    it('remove', async () => {
      const {expectOneCall} = setup();
      fireEvent.click(screen.getByRole('button', {name: 'Remove Alice'}));
      expectOneCall([bob], {item: alice, type: 'remove'});
    });

    it('Backspace', () => {
      const {expectOneCall} = setup();
      fireEvent.keyDown(screen.getByRole('combobox'), {key: 'Backspace'});
      expectOneCall([alice], {item: bob, type: 'remove'});
    });

    it('Clear all', () => {
      const {expectOneCall} = setup({hasClear: true});
      fireEvent.click(screen.getByRole('button', {name: 'Clear all'}));
      expectOneCall([], {item: bob, type: 'remove'});
    });

    it("the sheet's Save", async () => {
      const {expectOneCall} = setup({presentation: 'bottom-sheet'});
      await act(async () => {
        fireEvent.click(screen.getByRole('button', {name: 'Members'}));
      });
      fireEvent.click(await screen.findByRole('checkbox', {name: 'Charlie'}));
      fireEvent.click(screen.getByRole('button', {name: 'Save'}));
      expectOneCall([alice, bob, charlie], {item: charlie, type: 'add'});
    });
  });

  it('shows the proposed tokens at once and stays busy while they show', async () => {
    const {saves, onSave} = controlledSaves();
    render(<SavingTokenizer initial={[alice]} onSave={onSave} />);
    const input = screen.getByRole('combobox');
    expect(visibleSpinners()).toHaveLength(0);

    await pickOption('Bob');

    expect(tokenLabels()).toEqual(['Alice', 'Bob']);
    expect(visibleSpinners()).toHaveLength(1);
    expect(input).toHaveAttribute('aria-busy', 'true');
    expect(saves).toHaveLength(1);

    // Time passes; the save is still pending, so the field is still busy.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(visibleSpinners()).toHaveLength(1);
    expect(input).toHaveAttribute('aria-busy', 'true');

    await saves[0].settle('accept');

    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'));
    expect(visibleSpinners()).toHaveLength(0);
    expect(tokenLabels()).toEqual(['Alice', 'Bob']);
  });

  it('shows value again when the action settles without the parent accepting', async () => {
    const {saves, onSave} = controlledSaves();
    render(<SavingTokenizer initial={[alice]} onSave={onSave} />);
    const input = screen.getByRole('combobox');

    await pickOption('Bob');
    expect(tokenLabels()).toEqual(['Alice', 'Bob']);

    await saves[0].settle('reject');

    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'));
    expect(tokenLabels()).toEqual(['Alice']);
  });

  it('shows a value the parent replaces while the action is pending, at once', async () => {
    const {saves, onSave} = controlledSaves();
    render(<SavingTokenizer initial={[alice]} onSave={onSave} />);

    await pickOption('Bob');
    expect(tokenLabels()).toEqual(['Alice', 'Bob']);

    // The action is still pending.
    act(() => {
      screen.getByRole('button', {name: 'Replace with Charlie'}).click();
    });
    expect(saves).toHaveLength(1);
    // The replacement ends the busy state, though the save is still pending.
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-busy');
    expect(visibleSpinners()).toHaveLength(0);
    expect(tokenLabels()).toEqual(['Charlie']);

    // The rejected save does not bring back the old proposal or the old value.
    await saves[0].settle('reject');
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-busy');
    expect(tokenLabels()).toEqual(['Charlie']);
  });

  it('is not busy when onChange sets value, though the action is pending', async () => {
    const {saves, onSave} = controlledSaves();
    function OptimisticParent() {
      const [value, setValue] = useState([alice]);
      return (
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={value}
          onChange={items => setValue(items)}
          changeAction={async items => {
            await onSave(items);
          }}
          debounceMs={0}
        />
      );
    }
    render(<OptimisticParent />);

    await pickOption('Bob');

    // value already holds the change, so no proposal shows.
    expect(saves).toHaveLength(1);
    expect(tokenLabels()).toEqual(['Alice', 'Bob']);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-busy');
    expect(visibleSpinners()).toHaveLength(0);

    await saves[0].settle('accept');
    expect(tokenLabels()).toEqual(['Alice', 'Bob']);
  });

  it('keeps the first edit when a second one is made while the first saves', async () => {
    const {saves, onSave} = controlledSaves();
    render(<SavingTokenizer initial={[alice]} onSave={onSave} />);

    await pickOption('Bob');
    await pickOption('Charlie');

    // The second change builds on the tokens on screen, not on `value`.
    expect(saves.map(save => save.items)).toEqual([
      [alice, bob],
      [alice, bob, charlie],
    ]);
    expect(tokenLabels()).toEqual(['Alice', 'Bob', 'Charlie']);

    // The first save lands while the second is pending: both edits stay.
    await saves[0].settle('accept');
    expect(tokenLabels()).toEqual(['Alice', 'Bob', 'Charlie']);
    await saves[1].settle('accept');

    await waitFor(() =>
      expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-busy'),
    );
    expect(tokenLabels()).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('does not offer a pending token in the suggestions (FR13)', async () => {
    const {saves, onSave} = controlledSaves();
    render(<SavingTokenizer initial={[]} onSave={onSave} />);

    await typeQuery('a');
    expect(optionLabels()).toEqual(['Alice', 'Charlie', 'Diana']);

    const user = userEvent.setup();
    await user.click(screen.getByRole('option', {name: 'Alice', hidden: true}));
    expect(saves).toHaveLength(1);

    await typeQuery('');
    await typeQuery('a');
    // The same query, settled: only the pending token is gone.
    expect(optionLabels()).toEqual(['Charlie', 'Diana']);
  });

  it('clears the pending tokens too with Clear all', async () => {
    const {saves, onSave} = controlledSaves();
    render(<SavingTokenizer initial={[]} onSave={onSave} hasClear />);
    expect(
      screen.queryByRole('button', {name: 'Clear all'}),
    ).not.toBeInTheDocument();

    await pickOption('Bob');
    // The only token is still saving; Clear all follows the shown tokens.
    fireEvent.click(screen.getByRole('button', {name: 'Clear all'}));

    expect(saves.map(save => save.items)).toEqual([[bob], []]);
    expect(tokenLabels()).toEqual([]);
  });
});
