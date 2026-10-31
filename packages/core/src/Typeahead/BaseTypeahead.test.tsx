// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BaseTypeahead.test.tsx
 * @input BaseTypeahead and composed public props with synchronous and deferred SearchSources
 * @output Combobox contracts, including source refresh and empty-to-pending red/green coverage
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
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {BaseTypeahead} from './BaseTypeahead';
import {Typeahead} from './Typeahead';
import {Tokenizer} from '../Tokenizer';
import {InternationalizationProvider} from '../i18n';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import type {SearchSource, SearchableItem} from './types';

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
    await waitFor(() => expect(search).toHaveBeenCalledExactlyOnceWith('😀a'));
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
          expect(search).toHaveBeenLastCalledWith('next');
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
