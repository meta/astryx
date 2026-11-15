// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BaseTypeahead.test.tsx
 * @input BaseTypeahead and composed public props with synchronous and deferred SearchSources
 * @output Combobox contracts, including source refresh, empty-to-pending red/green coverage,
 *   and pending work that settles after a dismissal
 * @position Colocated verification for BaseTypeahead
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {createRef} from 'react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {BaseTypeahead, type BaseTypeaheadHandle} from './BaseTypeahead';
import {CommittedChoicesKeyContext} from './committedChoicesKey';
import {Typeahead} from './Typeahead';
import {Tokenizer} from '../Tokenizer';
import {InternationalizationProvider} from '../i18n';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import type {SearchContext, SearchSource, SearchableItem} from './types';

const popoverOpenState = new WeakMap<HTMLElement, boolean>();
const originalMatchesDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'matches',
);
const originalMatches = HTMLElement.prototype.matches;

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {
    popoverOpenState.set(this, true);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  };
  HTMLElement.prototype.hidePopover = function () {
    popoverOpenState.set(this, false);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  };
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    ...originalMatchesDescriptor,
    value(this: HTMLElement, selector: string) {
      if (selector === ':popover-open') {
        return popoverOpenState.get(this) ?? false;
      }
      return originalMatches.call(this, selector);
    },
  });
});

afterAll(() => {
  if (originalMatchesDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'matches',
      originalMatchesDescriptor,
    );
  }
});

const emptySource: SearchSource<SearchableItem> = {
  search: () => [],
  bootstrap: () => [],
};

const resultItem: SearchableItem = {id: '1', label: 'Result'};

const testStyles = stylex.create({
  input: {textTransform: 'uppercase'},
});

describe('BaseTypeahead', () => {
  describe('picking a result', () => {
    const source: SearchSource<SearchableItem> = {
      search: () => [
        {id: 'a', label: 'Apple'},
        {id: 'b', label: 'Apricot'},
      ],
      bootstrap: () => [],
    };

    it('reports the emptied query to onChangeQuery in a Typeahead', async () => {
      const user = userEvent.setup();
      const onChangeQuery = vi.fn();
      render(
        <Typeahead
          label="Fruit"
          searchSource={source}
          value={null}
          onChange={() => {}}
          onChangeQuery={onChangeQuery}
        />,
      );

      await user.type(screen.getByRole('combobox'), 'Ap');
      expect(onChangeQuery).toHaveBeenLastCalledWith('Ap');
      await user.click(
        await screen.findByRole('option', {name: 'Apple', hidden: true}),
      );

      expect(screen.getByRole('combobox')).toHaveValue('');
      expect(onChangeQuery).toHaveBeenLastCalledWith('');
    });

    it('reports the emptied query to onChangeQuery in a Tokenizer', async () => {
      const user = userEvent.setup();
      const onChangeQuery = vi.fn();
      render(
        <Tokenizer
          label="Fruits"
          searchSource={source}
          value={[]}
          onChange={() => {}}
          onChangeQuery={onChangeQuery}
        />,
      );

      await user.type(screen.getByRole('combobox'), 'Ap');
      expect(onChangeQuery).toHaveBeenLastCalledWith('Ap');
      await user.click(
        await screen.findByRole('option', {name: 'Apple', hidden: true}),
      );

      expect(screen.getByRole('combobox')).toHaveValue('');
      expect(onChangeQuery).toHaveBeenLastCalledWith('');
    });

    it('does not report a change when the query was already empty', async () => {
      const user = userEvent.setup();
      const onChangeQuery = vi.fn();
      render(
        <Typeahead
          label="Fruit"
          hasEntriesOnFocus
          searchSource={{
            search: () => [],
            bootstrap: () => [{id: 'a', label: 'Apple'}],
          }}
          value={null}
          onChange={() => {}}
          onChangeQuery={onChangeQuery}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(
        await screen.findByRole('option', {name: 'Apple', hidden: true}),
      );

      expect(onChangeQuery).not.toHaveBeenCalled();
    });
  });

  it('asks a touch keyboard for its Search key and no autocorrection', () => {
    render(
      <BaseTypeahead
        searchSource={emptySource}
        value={null}
        onChange={() => {}}
        aria-label="Find a framework"
      />,
    );

    expect(
      screen.getByRole('combobox', {name: 'Find a framework'}),
    ).toHaveAttribute('enterkeyhint', 'search');

    expect(
      screen.getByRole('combobox', {name: 'Find a framework'}),
    ).toHaveAttribute('autocorrect', 'off');
  });

  it('forwards supported DOM, styling, and event props to the combobox input', () => {
    const onBlur = vi.fn();
    const onFocus = vi.fn();
    const onPointerDown = vi.fn();

    render(
      <BaseTypeahead
        searchSource={emptySource}
        value={null}
        onChange={() => {}}
        aria-label="Find a framework"
        aria-expanded="true"
        className="consumer-input"
        data-audit-state="forwarded"
        onBlur={onBlur}
        onFocus={onFocus}
        onPointerDown={onPointerDown}
        style={{letterSpacing: '0.08em'}}
        xstyle={testStyles.input}
      />,
    );

    const input = screen.getByRole('combobox', {name: 'Find a framework'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('data-audit-state', 'forwarded');
    expect(input).toHaveClass('consumer-input');
    expect(input).toHaveStyle({letterSpacing: '0.08em'});
    expect(getComputedStyle(input).textTransform).toBe('uppercase');

    fireEvent.pointerDown(input);
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it('preserves native input attributes when legacy aliases are undefined', () => {
    render(
      <BaseTypeahead
        searchSource={emptySource}
        value={null}
        onChange={() => {}}
        id="native-input"
        aria-describedby="native-description"
        aria-labelledby="native-label"
        tabIndex={3}
        inputId={undefined}
        ariaDescribedBy={undefined}
        ariaLabelledBy={undefined}
        inputTabIndex={undefined}
      />,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('id', 'native-input');
    expect(input).toHaveAttribute('aria-describedby', 'native-description');
    expect(input).toHaveAttribute('aria-labelledby', 'native-label');
    expect(input).toHaveAttribute('tabindex', '3');
  });

  it('lets defined legacy aliases override their native equivalents', () => {
    render(
      <BaseTypeahead
        searchSource={emptySource}
        value={null}
        onChange={() => {}}
        id="native-input"
        aria-describedby="native-description"
        aria-labelledby="native-label"
        tabIndex={3}
        inputId="legacy-input"
        ariaDescribedBy="legacy-description"
        ariaLabelledBy="legacy-label"
        inputTabIndex={-1}
      />,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('id', 'legacy-input');
    expect(input).toHaveAttribute('aria-describedby', 'legacy-description');
    expect(input).toHaveAttribute('aria-labelledby', 'legacy-label');
    expect(input).toHaveAttribute('tabindex', '-1');
  });

  it('refreshes nonempty cached results after source replacement on a focused-input click', async () => {
    const user = userEvent.setup();
    const originalSource: SearchSource<SearchableItem> = {
      search: () => [],
      bootstrap: () => [resultItem],
    };
    const updatedSource: SearchSource<SearchableItem> = {
      search: () => [],
      bootstrap: () => [{id: '2', label: 'Updated result'}],
    };
    const {rerender} = render(
      <BaseTypeahead
        searchSource={originalSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
      />,
    );
    const input = screen.getByRole('combobox');

    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    expect(
      screen.getByRole('option', {name: 'Result', hidden: true}),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    rerender(
      <BaseTypeahead
        searchSource={updatedSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
      />,
    );
    expect(input).toHaveFocus();
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('option', {name: 'Result', hidden: true}),
    ).toBeInTheDocument();

    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('option', {name: 'Updated result', hidden: true}),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('option', {name: 'Result', hidden: true}),
    ).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it.each([
    ['a click', 'click'],
    ['keyboard focus', 'tab'],
  ] as const)(
    'bootstraps the replacement source when %s refocuses the input',
    async (_label, refocus) => {
      const user = userEvent.setup();
      const originalSource: SearchSource<SearchableItem> = {
        search: () => [],
        bootstrap: () => [resultItem],
      };
      const updatedBootstrap = vi.fn(() => [
        {id: '2', label: 'Updated result'},
      ]);
      const updatedSource: SearchSource<SearchableItem> = {
        search: () => [],
        bootstrap: updatedBootstrap,
      };
      const renderField = (searchSource: SearchSource<SearchableItem>) => (
        <>
          <BaseTypeahead
            searchSource={searchSource}
            value={null}
            onChange={() => {}}
            hasEntriesOnFocus
          />
          <button type="button">Sort</button>
        </>
      );
      const {rerender} = render(renderField(originalSource));
      const input = screen.getByRole('combobox');
      const sortButton = screen.getByRole('button', {name: 'Sort'});

      await user.click(input);
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });

      // Focus moves to another control, which then hands the field a new
      // source (a sort or filter change rebuilding the caller's source).
      await user.click(sortButton);
      expect(input).not.toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      rerender(renderField(updatedSource));

      if (refocus === 'click') {
        await user.click(input);
      } else {
        await user.tab({shift: true});
      }
      expect(input).toHaveFocus();
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(
          screen.getByRole('option', {name: 'Updated result', hidden: true}),
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByRole('option', {name: 'Result', hidden: true}),
      ).not.toBeInTheDocument();
      expect(updatedBootstrap).toHaveBeenCalledTimes(1);
    },
  );

  // spec:AST-092 FR4: a replaced source's list is no longer current, so
  // ArrowDown on the closed field loads the new source instead of showing it.
  it('loads the replacement source when ArrowDown opens the closed field', async () => {
    const user = userEvent.setup();
    const originalSource: SearchSource<SearchableItem> = {
      search: () => [],
      bootstrap: () => [resultItem],
    };
    const updatedBootstrap = vi.fn(() => [{id: '2', label: 'Updated result'}]);
    const updatedSource: SearchSource<SearchableItem> = {
      search: () => [],
      bootstrap: updatedBootstrap,
    };
    const renderField = (searchSource: SearchSource<SearchableItem>) => (
      <BaseTypeahead
        searchSource={searchSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
      />
    );
    const {rerender} = render(renderField(originalSource));
    const input = screen.getByRole('combobox');

    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    await user.keyboard('{Escape}');
    rerender(renderField(updatedSource));
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('option', {name: 'Updated result', hidden: true}),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('option', {name: 'Result', hidden: true}),
    ).not.toBeInTheDocument();
    expect(updatedBootstrap).toHaveBeenCalledTimes(1);
  });

  it('searches the replacement source for the typed query when ArrowDown opens the closed field', async () => {
    const user = userEvent.setup();
    const originalSource: SearchSource<SearchableItem> = {
      search: () => [resultItem],
      bootstrap: () => [],
    };
    const updatedSearch = vi.fn(() => [{id: '2', label: 'Updated result'}]);
    const updatedSource: SearchSource<SearchableItem> = {
      search: updatedSearch,
      bootstrap: () => [],
    };
    const renderField = (searchSource: SearchSource<SearchableItem>) => (
      <BaseTypeahead
        searchSource={searchSource}
        value={null}
        onChange={() => {}}
      />
    );
    const {rerender} = render(renderField(originalSource));
    const input = screen.getByRole('combobox');

    await user.type(input, 're');
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('option', {name: 'Result', hidden: true}),
      ).toBeInTheDocument();
    });
    await user.keyboard('{Escape}');
    rerender(renderField(updatedSource));

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('option', {name: 'Updated result', hidden: true}),
      ).toBeInTheDocument();
    });
    expect(updatedSearch).toHaveBeenCalledWith('re', expect.anything());
    expect(
      screen.queryByRole('option', {name: 'Result', hidden: true}),
    ).not.toBeInTheDocument();
  });

  // FR2: a focus load that yields no choice, or fails, closes the list; a
  // completed empty search for a typed query still shows FR4's message.
  describe('focus list with no choices', () => {
    const renderField = (searchSource: SearchSource<SearchableItem>) =>
      render(
        <BaseTypeahead
          searchSource={searchSource}
          value={null}
          onChange={() => {}}
          hasEntriesOnFocus
        />,
      );

    it('closes when a cleared query loads an empty focus list', async () => {
      const user = userEvent.setup();
      renderField({search: () => [resultItem], bootstrap: () => []});
      const input = screen.getByRole('combobox');

      await user.type(input, 're');
      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Result', hidden: true}),
        ).toBeInTheDocument();
      });
      await user.clear(input);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('closes when a cleared query leaves the empty-search message for an empty focus list', async () => {
      const user = userEvent.setup();
      renderField({search: () => [], bootstrap: () => []});
      const input = screen.getByRole('combobox');

      await user.type(input, 'zz');
      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
      await user.clear(input);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('closes when a cleared query fails to load the focus list', async () => {
      const user = userEvent.setup();
      renderField({
        search: () => [resultItem],
        bootstrap: async () => {
          throw new Error('offline');
        },
      });
      const input = screen.getByRole('combobox');

      await user.type(input, 're');
      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Result', hidden: true}),
        ).toBeInTheDocument();
      });
      await user.clear(input);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('still shows the empty-search message for a typed query with no results', async () => {
      const user = userEvent.setup();
      renderField({search: () => [], bootstrap: () => [resultItem]});
      const input = screen.getByRole('combobox');

      await user.type(input, 'zz');

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
  });

  // component:Tokenizer FR13, spec:AST-092 FR4: when the caller's committed
  // values change, an open list reloads from the source they now filter.
  describe('committed values change', () => {
    const COMMITTED: Record<
      string,
      {key: string; ids: ReadonlySet<string>; isAtLimit: boolean}
    > = {
      a: {key: 'a', ids: new Set(), isAtLimit: false},
      b: {key: 'b', ids: new Set(), isAtLimit: false},
    };
    const renderField = (
      searchSource: SearchSource<SearchableItem>,
      key: 'a' | 'b',
      props: {hasEntriesOnFocus?: boolean} = {hasEntriesOnFocus: true},
    ) => (
      <CommittedChoicesKeyContext value={COMMITTED[key]}>
        <BaseTypeahead
          searchSource={searchSource}
          value={null}
          onChange={() => {}}
          {...props}
        />
      </CommittedChoicesKeyContext>
    );

    it('reloads an open focus list', async () => {
      const user = userEvent.setup();
      const updatedBootstrap = vi.fn(() => [
        {id: '2', label: 'Updated result'},
      ]);
      const {rerender} = render(
        renderField({search: () => [], bootstrap: () => [resultItem]}, 'a'),
      );
      const input = screen.getByRole('combobox');

      await user.click(input);
      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Result', hidden: true}),
        ).toBeInTheDocument();
      });
      rerender(
        renderField({search: () => [], bootstrap: updatedBootstrap}, 'b'),
      );

      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Updated result', hidden: true}),
        ).toBeInTheDocument();
      });
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.queryByRole('option', {name: 'Result', hidden: true}),
      ).not.toBeInTheDocument();
      expect(updatedBootstrap).toHaveBeenCalledTimes(1);
    });

    it('searches again for the typed query while the list is open', async () => {
      const user = userEvent.setup();
      const updatedSearch = vi.fn(() => [{id: '2', label: 'Updated result'}]);
      const {rerender} = render(
        renderField({search: () => [resultItem], bootstrap: () => []}, 'a', {}),
      );
      const input = screen.getByRole('combobox');

      await user.type(input, 're');
      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Result', hidden: true}),
        ).toBeInTheDocument();
      });
      rerender(
        renderField({search: updatedSearch, bootstrap: () => []}, 'b', {}),
      );

      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Updated result', hidden: true}),
        ).toBeInTheDocument();
      });
      expect(updatedSearch).toHaveBeenCalledWith('re', expect.anything());
    });

    it('leaves a closed list closed', async () => {
      const user = userEvent.setup();
      const updatedBootstrap = vi.fn(() => [
        {id: '2', label: 'Updated result'},
      ]);
      const {rerender} = render(
        renderField({search: () => [], bootstrap: () => [resultItem]}, 'a'),
      );
      const input = screen.getByRole('combobox');

      await user.click(input);
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
      await user.keyboard('{Escape}');
      rerender(
        renderField({search: () => [], bootstrap: updatedBootstrap}, 'b'),
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      });
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(updatedBootstrap).not.toHaveBeenCalled();
    });

    it('closes an open focus list when the reload finds nothing', async () => {
      const user = userEvent.setup();
      const {rerender} = render(
        renderField({search: () => [], bootstrap: () => [resultItem]}, 'a'),
      );
      const input = screen.getByRole('combobox');

      await user.click(input);
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
      rerender(renderField({search: () => [], bootstrap: () => []}, 'b'));

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('closes an open focus list when the reload fails', async () => {
      const user = userEvent.setup();
      const {rerender} = render(
        renderField({search: () => [], bootstrap: () => [resultItem]}, 'a'),
      );
      const input = screen.getByRole('combobox');

      await user.click(input);
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
      rerender(
        renderField(
          {
            search: () => [],
            bootstrap: async () => {
              throw new Error('offline');
            },
          },
          'b',
        ),
      );

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('closes an open focus list when focus entries are turned off', async () => {
      const user = userEvent.setup();
      const source = {search: () => [], bootstrap: () => [resultItem]};
      const {rerender} = render(renderField(source, 'a'));
      const input = screen.getByRole('combobox');

      await user.click(input);
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
      rerender(renderField(source, 'b', {hasEntriesOnFocus: false}));

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('does not reload or move the highlight when only the source is rebuilt', async () => {
      const user = userEvent.setup();
      const items = [
        {id: '1', label: 'First'},
        {id: '2', label: 'Second'},
      ];
      const bootstrap = vi.fn(() => items);
      const {rerender} = render(
        renderField({search: () => [], bootstrap: () => bootstrap()}, 'a'),
      );
      const input = screen.getByRole('combobox');

      await user.click(input);
      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Second', hidden: true}),
        ).toBeInTheDocument();
      });
      await user.keyboard('{ArrowDown}');
      const second = screen.getByRole('option', {name: 'Second', hidden: true});
      expect(input).toHaveAttribute('aria-activedescendant', second.id);
      expect(bootstrap).toHaveBeenCalledTimes(1);

      // A caller that builds its source in render passes a new object.
      rerender(
        renderField({search: () => [], bootstrap: () => bootstrap()}, 'a'),
      );
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      });

      expect(bootstrap).toHaveBeenCalledTimes(1);
      expect(input).toHaveAttribute(
        'aria-activedescendant',
        screen.getByRole('option', {name: 'Second', hidden: true}).id,
      );
    });
  });

  it('re-shows cached results without bootstrapping again when the source is unchanged', async () => {
    const user = userEvent.setup();
    const bootstrap = vi.fn(() => [resultItem]);
    const source: SearchSource<SearchableItem> = {search: () => [], bootstrap};
    render(
      <>
        <BaseTypeahead
          searchSource={source}
          value={null}
          onChange={() => {}}
          hasEntriesOnFocus
        />
        <button type="button">Sort</button>
      </>,
    );
    const input = screen.getByRole('combobox');

    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    await user.click(screen.getByRole('button', {name: 'Sort'}));
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    expect(
      screen.getByRole('option', {name: 'Result', hidden: true}),
    ).toBeInTheDocument();
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('counts grapheme clusters when enforcing minQueryLength', async () => {
    const search = vi.fn(() => [resultItem]);
    render(
      <BaseTypeahead
        searchSource={{search, bootstrap: () => []}}
        value={null}
        onChange={() => {}}
        debounceMs={0}
        minQueryLength={2}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: '😀'}});
    await Promise.resolve();
    expect(search).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, {target: {value: '😀a'}});
    await waitFor(() =>
      expect(search).toHaveBeenCalledExactlyOnceWith('😀a', expect.anything()),
    );
  });

  it('exposes a completed empty search as a disabled listbox option', async () => {
    render(
      <BaseTypeahead
        searchSource={emptySource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
        emptySearchText="No matching frameworks"
      />,
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: {value: 'none'},
    });

    await waitFor(() => {
      expect(
        screen.getByRole('option', {
          hidden: true,
          name: 'No matching frameworks',
        }),
      ).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('empty search followed by a newer query (#8903)', () => {
    beforeEach(() => {
      __resetLiveRegionsForTest();
      vi.useFakeTimers({
        toFake: [
          'setTimeout',
          'clearTimeout',
          'requestAnimationFrame',
          'cancelAnimationFrame',
        ],
      });
    });
    afterEach(() => {
      __resetLiveRegionsForTest();
      vi.useRealTimers();
    });

    it('keeps an empty focus bootstrap quiet when an empty search is cleared', async () => {
      render(
        <BaseTypeahead
          searchSource={emptySource}
          value={null}
          onChange={() => {}}
          hasEntriesOnFocus
          debounceMs={0}
          aria-label="Framework"
        />,
      );
      const input = screen.getByRole('combobox', {name: 'Framework'});
      fireEvent.focus(input);
      fireEvent.change(input, {target: {value: 'none'}});
      await act(async () => vi.advanceTimersByTimeAsync(32));
      const options = within(screen.getByRole('listbox', {hidden: true}));
      expect(options.getByRole('option', {hidden: true})).toHaveTextContent(
        'No results found',
      );

      fireEvent.change(input, {target: {value: ''}});
      await act(async () => vi.advanceTimersByTimeAsync(32));
      expect(input).toHaveValue('');
      expect(input).not.toHaveAttribute('aria-busy');
      expect(screen.queryByRole('img', {name: 'Loading'})).toBeNull();
      expect(options.queryAllByRole('option', {hidden: true})).toHaveLength(0);
    });

    // Bare and composed fields have different busy-indicator owners. Zero
    // debounce independently exercises the pending-request regression.
    describe.each([
      ['BaseTypeahead', 0],
      ['BaseTypeahead', 150],
      ['Typeahead', 150],
      ['Tokenizer', 150],
    ] as const)('%s with %i ms debounce', (field, debounceMs) => {
      it.each(['populated', 'empty'] as const)(
        'withholds the old empty result until a %s final response settles',
        async outcome => {
          let resolveNext!: (items: SearchableItem[]) => void;
          const pending = new Promise<SearchableItem[]>(resolve => {
            resolveNext = resolve;
          });
          const search = vi
            .fn<SearchSource<SearchableItem>['search']>()
            .mockResolvedValueOnce([])
            .mockReturnValueOnce(pending);
          const searchSource: SearchSource<SearchableItem> = {
            search,
            bootstrap: () => [],
          };
          const onChange = vi.fn();
          const props = {
            searchSource,
            onChange,
            debounceMs,
            emptySearchText: <span>No matching frameworks</span>,
          };
          render(
            <InternationalizationProvider
              locale="fr"
              overrides={{
                fr: {
                  '@astryx.typeahead.loading': 'Recherche en cours',
                  '@astryx.typeahead.resultCount': '{count, number} résultat',
                },
              }}>
              {field === 'Tokenizer' ? (
                <Tokenizer {...props} label="Framework" value={[]} />
              ) : field === 'Typeahead' ? (
                <Typeahead {...props} label="Framework" value={null} />
              ) : (
                <BaseTypeahead {...props} aria-label="Framework" value={null} />
              )}
            </InternationalizationProvider>,
          );
          const input = screen.getByRole('combobox', {name: 'Framework'});
          const liveRegion = () =>
            document.querySelector('[data-astryx-live-region="polite"]');
          fireEvent.focus(input);
          fireEvent.change(input, {target: {value: 'none'}});
          await act(async () => vi.advanceTimersByTimeAsync(debounceMs));
          await act(async () => vi.advanceTimersByTimeAsync(32));
          const options = within(screen.getByRole('listbox', {hidden: true}));
          expect(options.getByRole('option', {hidden: true})).toHaveTextContent(
            'No matching frameworks',
          );
          expect(liveRegion()).toHaveTextContent('No matching frameworks');
          expect(input).not.toHaveAttribute('aria-busy');
          // Let the first announcement clear normally: a premature new
          // empty-result announcement cannot hide behind the previous one.
          await act(async () => vi.advanceTimersByTimeAsync(2000));
          expect(liveRegion()?.textContent).toBe('');

          fireEvent.change(input, {target: {value: 'next'}});
          if (debounceMs > 0) {
            await act(async () => vi.advanceTimersByTimeAsync(debounceMs - 1));
            expect(search).toHaveBeenCalledTimes(1);
            expect(options.queryByText('No matching frameworks')).toBeNull();
            expect(
              options.queryAllByRole('option', {hidden: true}),
            ).toHaveLength(0);
            expect(liveRegion()?.textContent).toBe('');
            // Keep the existing spinner's request-start timing.
            expect(input).not.toHaveAttribute('aria-busy');
            await act(async () => vi.advanceTimersByTimeAsync(1));
          }
          expect(search).toHaveBeenLastCalledWith('next', expect.anything());
          expect(input).toHaveAttribute('aria-busy', 'true');
          expect(options.queryByText('No matching frameworks')).toBeNull();
          expect(options.queryAllByRole('option', {hidden: true})).toHaveLength(
            0,
          );
          expect(
            screen.getByRole('img', {name: 'Recherche en cours'}),
          ).toBeInTheDocument();
          expect(input).not.toHaveAttribute('aria-activedescendant');
          await act(async () => vi.advanceTimersByTimeAsync(32));
          expect(liveRegion()).toHaveTextContent('Recherche en cours');
          expect(liveRegion()).not.toHaveTextContent('No matching frameworks');

          await act(async () =>
            resolveNext(outcome === 'empty' ? [] : [resultItem]),
          );
          await act(async () => vi.advanceTimersByTimeAsync(32));
          expect(input).not.toHaveAttribute('aria-busy');
          expect(
            screen.queryByRole('img', {name: 'Recherche en cours'}),
          ).toBeNull();
          if (outcome === 'empty') {
            expect(options.getByRole('option', {hidden: true})).toHaveAttribute(
              'aria-disabled',
              'true',
            );
            expect(
              options.getByRole('option', {hidden: true}),
            ).toHaveTextContent('No matching frameworks');
            expect(liveRegion()).toHaveTextContent('No matching frameworks');
            expect(input).not.toHaveAttribute('aria-activedescendant');
          } else {
            expect(
              options.getByRole('option', {name: 'Result', hidden: true}),
            ).toBeInTheDocument();
            expect(options.queryByText('No matching frameworks')).toBeNull();
            expect(liveRegion()).toHaveTextContent('1 résultat');
            fireEvent.keyDown(input, {key: 'Enter'});
            if (field === 'Tokenizer') {
              expect(onChange).toHaveBeenCalledWith([resultItem], {
                type: 'add',
                item: resultItem,
              });
            } else {
              expect(onChange).toHaveBeenCalledWith(resultItem);
            }
          }
        },
      );
    });
  });
});

describe('BaseTypeahead pending work after a dismissal', () => {
  // A source that cannot abort: every search answers when the test says so.
  function pendingSource() {
    const answers = new Map<string, (items: SearchableItem[]) => void>();
    const search = vi.fn(
      async (query: string) =>
        new Promise<SearchableItem[]>(resolve => answers.set(query, resolve)),
    );
    const source: SearchSource<SearchableItem> = {search, bootstrap: () => []};
    const answer = async (query: string, labels: string[]) => {
      await waitFor(() => expect(answers.has(query)).toBe(true));
      answers.get(query)?.(labels.map(label => ({id: label, label})));
      await act(async () => {});
    };
    return {source, search, answer};
  }

  function renderPending(extra: Partial<Parameters<typeof BaseTypeahead>[0]>) {
    const pending = pendingSource();
    render(
      <>
        <BaseTypeahead
          searchSource={pending.source}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          {...extra}
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    return {...pending, input: screen.getByRole('combobox')};
  }

  async function openWithPendingQuery(
    input: HTMLElement,
    answer: (query: string, labels: string[]) => Promise<void>,
  ) {
    input.focus();
    fireEvent.change(input, {target: {value: 'a'}});
    await answer('a', ['Alpha']);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(input, {target: {value: 'al'}});
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));
  }

  it('stays closed and stops being busy when a search answers after Escape', async () => {
    const {input, answer} = renderPending({});
    await openWithPendingQuery(input, answer);

    fireEvent.keyDown(input, {key: 'Escape'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-busy');

    await answer('al', ['Alpine']);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-busy');
  });

  it('stays closed when a search answers after an outside click closed the popup', async () => {
    const {input, answer} = renderPending({});
    await openWithPendingQuery(input, answer);

    // Native light dismissal closes the popover itself and reports a toggle.
    const popup = screen
      .getByRole('listbox', {hidden: true})
      .closest('[popover]') as HTMLElement;
    act(() => popup.hidePopover());
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-busy');

    await answer('al', ['Alpine']);
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not open when a search answers after focus left the field', async () => {
    const {input, answer} = renderPending({});
    input.focus();
    fireEvent.change(input, {target: {value: 'a'}});
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));

    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', {name: 'Elsewhere'}),
    });
    expect(input).not.toHaveAttribute('aria-busy');

    await answer('a', ['Alpha']);
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not open when focus bootstrap answers after focus left the field', async () => {
    let resolve: (items: SearchableItem[]) => void = () => {};
    const source: SearchSource<SearchableItem> = {
      search: () => [],
      bootstrap: async () =>
        new Promise<SearchableItem[]>(r => {
          resolve = r;
        }),
    };
    render(
      <>
        <BaseTypeahead
          searchSource={source}
          value={null}
          onChange={() => {}}
          hasEntriesOnFocus
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));

    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', {name: 'Elsewhere'}),
    });
    expect(input).not.toHaveAttribute('aria-busy');

    await act(async () => resolve([{id: '1', label: 'Suggested'}]));
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the late answer, without searching again, when the same query is reopened', async () => {
    const {input, search, answer} = renderPending({});
    await openWithPendingQuery(input, answer);
    fireEvent.keyDown(input, {key: 'Escape'});
    await answer('al', ['Alpine']);

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('option', {name: 'Alpine', hidden: true}),
    ).toBeInTheDocument();
    expect(search.mock.calls.filter(([q]) => q === 'al')).toHaveLength(1);
  });

  it('drops a late answer for a query the person has since changed', async () => {
    const {input, answer} = renderPending({});
    await openWithPendingQuery(input, answer);
    fireEvent.keyDown(input, {key: 'Escape'});

    fireEvent.change(input, {target: {value: 'alp'}});
    await answer('al', ['Stale']);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('option', {name: 'Stale', hidden: true}),
    ).not.toBeInTheDocument();

    await answer('alp', ['Alpine']);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('option', {name: 'Alpine', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', {name: 'Stale', hidden: true}),
    ).not.toBeInTheDocument();
  });

  it('does not keep or show a late answer while a changed query waits on its debounce', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    try {
      const {input, search, answer} = renderPending({debounceMs: 200});
      input.focus();
      fireEvent.change(input, {target: {value: 'a'}});
      await act(async () => vi.advanceTimersByTime(200));
      await answer('a', ['Alpha']);
      fireEvent.change(input, {target: {value: 'al'}});
      await act(async () => vi.advanceTimersByTime(200));
      await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));
      fireEvent.keyDown(input, {key: 'Escape'});

      // The next query is typed but its search has not started yet.
      fireEvent.change(input, {target: {value: 'alp'}});
      await answer('al', ['Stale']);
      expect(input).toHaveAttribute('aria-expanded', 'false');

      // Asking for the menu searches the text the field holds now.
      fireEvent.keyDown(input, {key: 'ArrowDown'});
      expect(search).toHaveBeenLastCalledWith('alp', expect.anything());
      expect(input).toHaveAttribute('aria-busy', 'true');
      await answer('alp', ['Alpine']);
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('option', {name: 'Alpine', hidden: true}),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('option', {name: 'Stale', hidden: true}),
      ).not.toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(200));
      expect(search.mock.calls.filter(([q]) => q === 'alp')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['with', true],
    ['without', false],
  ] as const)(
    'reopens on ArrowDown %s entries on focus by waiting for the search still running for the typed text',
    async (_label, hasEntriesOnFocus) => {
      const bootstrap = vi.fn(() => [{id: 'b', label: 'Suggested'}]);
      const pending = pendingSource();
      pending.source.bootstrap = bootstrap;
      render(
        <BaseTypeahead
          searchSource={pending.source}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          hasEntriesOnFocus={hasEntriesOnFocus}
        />,
      );
      const input = screen.getByRole('combobox');
      input.focus();
      fireEvent.change(input, {target: {value: 'a'}});
      await pending.answer('a', ['Alpha']);
      fireEvent.change(input, {target: {value: 'al'}});
      await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));
      fireEvent.keyDown(input, {key: 'Escape'});
      expect(input).not.toHaveAttribute('aria-busy');
      bootstrap.mockClear();

      fireEvent.keyDown(input, {key: 'ArrowDown'});
      // The pending answer is the one wanted: no bootstrap, no second search.
      expect(bootstrap).not.toHaveBeenCalled();
      expect(input).toHaveAttribute('aria-busy', 'true');
      expect(input).toHaveAttribute('aria-expanded', 'false');

      await pending.answer('al', ['Alpine']);
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(input).not.toHaveAttribute('aria-busy');
      expect(
        screen.getByRole('option', {name: 'Alpine', hidden: true}),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('option', {name: 'Suggested', hidden: true}),
      ).not.toBeInTheDocument();
      expect(
        pending.search.mock.calls.filter(([q]) => q === 'al'),
      ).toHaveLength(1);
    },
  );

  it('opens with the pending answer when focus returns while its search still runs', async () => {
    const {input, search, answer} = renderPending({});
    input.focus();
    fireEvent.change(input, {target: {value: 'a'}});
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));
    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', {name: 'Elsewhere'}),
    });
    expect(input).not.toHaveAttribute('aria-busy');

    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-busy', 'true');
    await answer('a', ['Alpha']);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('still opens the entries on focus with ArrowDown for an empty field', async () => {
    const source: SearchSource<SearchableItem> = {
      search: () => [],
      bootstrap: () => [{id: 'b', label: 'Suggested'}],
    };
    render(
      <BaseTypeahead
        searchSource={source}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
      />,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    fireEvent.keyDown(input, {key: 'Escape'});
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    expect(
      screen.getByRole('option', {name: 'Suggested', hidden: true}),
    ).toBeInTheDocument();
  });

  it('does not run a search still waiting on its debounce after Escape', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    try {
      const {input, search, answer} = renderPending({debounceMs: 200});
      input.focus();
      fireEvent.change(input, {target: {value: 'a'}});
      await act(async () => vi.advanceTimersByTime(200));
      await answer('a', ['Alpha']);
      expect(input).toHaveAttribute('aria-expanded', 'true');

      fireEvent.change(input, {target: {value: 'al'}});
      fireEvent.keyDown(input, {key: 'Escape'});
      await act(async () => vi.advanceTimersByTime(400));
      expect(search.mock.calls.some(([query]) => query === 'al')).toBe(false);
      expect(input).not.toHaveAttribute('aria-busy');
      expect(input).toHaveAttribute('aria-expanded', 'false');

      fireEvent.keyDown(input, {key: 'ArrowDown'});
      expect(search).toHaveBeenLastCalledWith('al', expect.anything());
      await answer('al', ['Alpine']);
      expect(input).toHaveAttribute('aria-expanded', 'true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles a search cancelled by focus leaving without an empty result', async () => {
    // A source whose cancel rejects the request in flight.
    let reject: ((reason: unknown) => void) | null = null;
    const source: SearchSource<SearchableItem> = {
      search: async () =>
        new Promise<SearchableItem[]>((_, fail) => {
          reject = fail;
        }),
      bootstrap: () => [],
      cancel: () => reject?.(new Error('aborted')),
    };
    render(
      <>
        <BaseTypeahead
          searchSource={source}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, {target: {value: 'al'}});
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));

    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', {name: 'Elsewhere'}),
    });
    await act(async () => {});
    expect(input).not.toHaveAttribute('aria-busy');
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
  });

  it('searches the typed text when the handle opens after Escape inside the debounce', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    try {
      const handleRef = createRef<BaseTypeaheadHandle>();
      const {input, search, answer} = renderPending({
        debounceMs: 200,
        handleRef,
      });
      input.focus();
      fireEvent.change(input, {target: {value: 'a'}});
      await act(async () => vi.advanceTimersByTime(200));
      await answer('a', ['Alpha']);
      expect(input).toHaveAttribute('aria-expanded', 'true');

      fireEvent.change(input, {target: {value: 'al'}});
      fireEvent.keyDown(input, {key: 'Escape'});
      expect(input).toHaveAttribute('aria-expanded', 'false');

      act(() => handleRef.current?.open());
      expect(search).toHaveBeenLastCalledWith('al', expect.anything());
      await answer('al', ['Alpine']);
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Alpine')).toBeInTheDocument();
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reopens on an empty answer kept through Escape without searching again', async () => {
    const {input, search, answer} = renderPending({});
    input.focus();
    fireEvent.change(input, {target: {value: 'zz'}});
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));
    fireEvent.keyDown(input, {key: 'Escape'});
    await answer('zz', []);
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(search.mock.calls.filter(([query]) => query === 'zz')).toHaveLength(
      1,
    );
  });

  it('reopens a partial list kept through Escape as busy while its search is pending', async () => {
    let finish: ((items: SearchableItem[]) => void) | null = null;
    const source: SearchSource<SearchableItem> = {
      search: async (_query, context) =>
        new Promise<SearchableItem[]>(resolve => {
          context?.update([{id: 'Alpine', label: 'Alpine'}]);
          finish = resolve;
        }),
      bootstrap: () => [],
    };
    render(
      <BaseTypeahead
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, {target: {value: 'al'}});
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    expect(input).toHaveAttribute('aria-busy', 'true');

    fireEvent.keyDown(input, {key: 'Escape'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-busy');

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Alpine')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-busy', 'true');

    await act(async () =>
      finish?.([
        {id: 'Alpine', label: 'Alpine'},
        {id: 'Alps', label: 'Alps'},
      ]),
    );
    expect(input).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('Alps')).toBeInTheDocument();
  });

  it('announces the count of an answer kept through Escape when the menu reopens', async () => {
    __resetLiveRegionsForTest();
    try {
      const {input, answer} = renderPending({});
      await openWithPendingQuery(input, answer);
      fireEvent.keyDown(input, {key: 'Escape'});
      await answer('al', ['Alpine', 'Alps']);
      const liveRegion = () =>
        document.querySelector('[data-astryx-live-region="polite"]');
      // The announcer writes on the next frame.
      await act(
        async () =>
          new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
      );
      expect(liveRegion()?.textContent ?? '').not.toContain('2 results');

      fireEvent.keyDown(input, {key: 'ArrowDown'});
      expect(input).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(liveRegion()).toHaveTextContent('2 results'));
    } finally {
      __resetLiveRegionsForTest();
    }
  });

  describe('every open path after a dismissal shows the kept list at once', () => {
    // A source that shows a partial list at once and answers when the test
    // says so. It cannot abort.
    function partialSource() {
      let finish: ((items: SearchableItem[]) => void) | null = null;
      const search = vi.fn(
        async (_query: string, context?: SearchContext<SearchableItem>) =>
          new Promise<SearchableItem[]>(resolve => {
            context?.update([{id: 'Alpine', label: 'Alpine'}]);
            finish = resolve;
          }),
      );
      const settle = async () => {
        await act(async () =>
          finish?.([
            {id: 'Alpine', label: 'Alpine'},
            {id: 'Alps', label: 'Alps'},
          ]),
        );
      };
      return {source: {search, bootstrap: () => []}, search, settle};
    }

    type OpenPath = {
      dismiss: (input: HTMLElement) => void;
      open: (input: HTMLElement, handle: BaseTypeaheadHandle | null) => void;
    };
    const pressEscape = (input: HTMLElement) =>
      fireEvent.keyDown(input, {key: 'Escape'});
    const OPEN_PATHS: [string, OpenPath][] = [
      [
        'ArrowDown',
        {
          dismiss: pressEscape,
          open: input => fireEvent.keyDown(input, {key: 'ArrowDown'}),
        },
      ],
      [
        'focus return',
        {
          dismiss: () =>
            act(() => screen.getByRole('button', {name: 'Elsewhere'}).focus()),
          open: input => act(() => input.focus()),
        },
      ],
      [
        'pointer press',
        {
          dismiss: pressEscape,
          open: input => {
            fireEvent.pointerDown(input);
            fireEvent.click(input);
          },
        },
      ],
      [
        'handle open()',
        {
          dismiss: pressEscape,
          open: (_input, handle) => act(() => handle?.open()),
        },
      ],
    ];

    async function renderDismissed() {
      __resetLiveRegionsForTest();
      const handleRef = createRef<BaseTypeaheadHandle>();
      const pending = partialSource();
      render(
        <>
          <BaseTypeahead
            searchSource={pending.source}
            value={null}
            onChange={() => {}}
            debounceMs={0}
            handleRef={handleRef}
          />
          <button type="button">Elsewhere</button>
        </>,
      );
      const input = screen.getByRole('combobox');
      act(() => input.focus());
      fireEvent.change(input, {target: {value: 'al'}});
      await waitFor(() =>
        expect(input).toHaveAttribute('aria-expanded', 'true'),
      );
      expect(input).toHaveAttribute('aria-busy', 'true');
      return {...pending, input, handleRef};
    }
    const liveRegion = () =>
      document.querySelector('[data-astryx-live-region="polite"]');
    afterEach(() => __resetLiveRegionsForTest());

    it.each(OPEN_PATHS)(
      '%s shows the kept partial list, busy while its search is pending',
      async (_name, path) => {
        const {input, handleRef, search, settle} = await renderDismissed();
        path.dismiss(input);
        await waitFor(() =>
          expect(input).toHaveAttribute('aria-expanded', 'false'),
        );
        expect(input).not.toHaveAttribute('aria-busy');

        path.open(input, handleRef.current);
        await waitFor(() =>
          expect(input).toHaveAttribute('aria-expanded', 'true'),
        );
        expect(screen.getByText('Alpine')).toBeInTheDocument();
        expect(input).toHaveAttribute('aria-busy', 'true');
        expect(search).toHaveBeenCalledOnce();

        await settle();
        expect(input).not.toHaveAttribute('aria-busy');
        expect(screen.getByText('Alps')).toBeInTheDocument();
        await waitFor(() =>
          expect(liveRegion()).toHaveTextContent('2 results'),
        );
      },
    );

    it.each(OPEN_PATHS)(
      '%s shows a kept settled answer, not busy, and announces its count',
      async (_name, path) => {
        const {input, handleRef, search, settle} = await renderDismissed();
        path.dismiss(input);
        await waitFor(() =>
          expect(input).toHaveAttribute('aria-expanded', 'false'),
        );
        await settle();
        await act(
          async () =>
            new Promise<void>(resolve =>
              requestAnimationFrame(() => resolve()),
            ),
        );
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(liveRegion()?.textContent ?? '').not.toContain('2 results');

        path.open(input, handleRef.current);
        await waitFor(() =>
          expect(input).toHaveAttribute('aria-expanded', 'true'),
        );
        expect(screen.getByText('Alps')).toBeInTheDocument();
        expect(input).not.toHaveAttribute('aria-busy');
        expect(search).toHaveBeenCalledOnce();
        await waitFor(() =>
          expect(liveRegion()).toHaveTextContent('2 results'),
        );
      },
    );

    it("searches the typed text when a press on the field's label dismissed it inside the debounce", async () => {
      vi.useFakeTimers({shouldAdvanceTime: true});
      try {
        const {input, search, answer} = renderPending({debounceMs: 200});
        input.focus();
        fireEvent.change(input, {target: {value: 'al'}});
        // A press on the label takes focus from the input with no target in
        // the field, then the label returns focus to the input.
        act(() => input.blur());
        await act(async () => vi.advanceTimersByTime(400));
        expect(search).not.toHaveBeenCalled();

        act(() => input.focus());
        expect(search).toHaveBeenLastCalledWith('al', expect.anything());
        expect(input).toHaveAttribute('aria-busy', 'true');
        await answer('al', ['Alpine']);
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Alpine')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('searches again on ArrowDown for an empty settled answer not kept through a dismissal', async () => {
      const {input, search, answer} = renderPending({});
      input.focus();
      fireEvent.change(input, {target: {value: 'zz'}});
      await answer('zz', []);
      expect(input).toHaveAttribute('aria-expanded', 'true');
      fireEvent.keyDown(input, {key: 'Escape'});
      expect(input).toHaveAttribute('aria-expanded', 'false');

      fireEvent.keyDown(input, {key: 'ArrowDown'});
      await waitFor(() =>
        expect(
          search.mock.calls.filter(([query]) => query === 'zz'),
        ).toHaveLength(2),
      );
    });
  });

  it('does not run a search still waiting on its debounce after focus leaves', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    try {
      const {input, search} = renderPending({debounceMs: 200});
      input.focus();
      fireEvent.change(input, {target: {value: 'a'}});
      fireEvent.blur(input, {
        relatedTarget: screen.getByRole('button', {name: 'Elsewhere'}),
      });
      await act(async () => vi.advanceTimersByTime(400));
      expect(search).not.toHaveBeenCalled();
      expect(input).not.toHaveAttribute('aria-busy');
      expect(input).toHaveAttribute('aria-expanded', 'false');
    } finally {
      vi.useRealTimers();
    }
  });
});
