// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Typeahead.test.tsx
 * @input Uses vitest, @testing-library/react, Typeahead, BaseTypeahead
 * @output Unit tests for Typeahead components
 * @position Testing; validates Typeahead.tsx and BaseTypeahead.tsx
 *
 * SYNC: When Typeahead components change, update tests to match
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {
  createRef,
  Profiler,
  startTransition,
  StrictMode,
  Suspense,
  useState,
  type ProfilerOnRenderCallback,
} from 'react';
import {Typeahead} from './Typeahead';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {BaseTypeahead} from './BaseTypeahead';
import {
  BusyIndicatorLaneProvider,
  createBusyIndicatorLane,
} from './busyIndicatorLane';
import type {SearchSource, SearchableItem} from './types';
import {InternationalizationProvider} from '../i18n';
import {InputGroup} from '../InputGroup';

// Store original matches to restore later
const originalMatches = HTMLElement.prototype.matches;

// Track popover open state per element
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

// Mock Popover API for jsdom
beforeAll(() => {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

afterEach(() => {
  __resetLiveRegionsForTest();
});

// Test data
const fruits: SearchableItem[] = [
  {id: '1', label: 'Apple'},
  {id: '2', label: 'Banana'},
  {id: '3', label: 'Cherry'},
  {id: '4', label: 'Date'},
  {id: '5', label: 'Elderberry'},
];

const fruitSource: SearchSource = {
  search: (query: string) =>
    fruits.filter(f => f.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => fruits.slice(0, 3),
};

/**
 * The search Spinner: named but not live (family:input-fields FR7,
 * spec:AST-086 FR8), so it is found as an image named "Loading".
 */
function queryBusySpinner(): Element | null {
  return screen.queryByRole('img', {name: 'Loading'});
}
function getBusySpinner(): Element {
  return screen.getByRole('img', {name: 'Loading'});
}

describe('BaseTypeahead', () => {
  it('renders input with combobox role', () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders placeholder text', () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        placeholder="Pick a fruit..."
      />,
    );
    expect(screen.getByPlaceholderText('Pick a fruit...')).toBeInTheDocument();
  });

  it('sets aria-expanded=false initially', () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows results on input change', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'App'}});

    await waitFor(() => {
      expect(screen.getByRole('listbox', {hidden: true})).toBeInTheDocument();
    });
  });

  it('announces the result count to a live region (comboboxes-6)', async () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.typeahead.resultCount':
              '{count, number} {count, plural, one {résultat} other {résultats}}',
          },
        }}>
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />
      </InternationalizationProvider>,
    );
    const input = screen.getByRole('combobox');
    // "Ap" matches Apple only — the singular ICU branch.
    fireEvent.change(input, {target: {value: 'Ap'}});

    await waitFor(() => {
      const region = document.querySelector(
        '[data-astryx-live-region="polite"]',
      );
      // Exact, so the plural branch ("1 résultats") would fail.
      expect(region?.textContent).toBe('1 résultat');
    });
  });

  it('announces the plural result count', async () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.typeahead.resultCount':
              '{count, number} {count, plural, one {résultat} other {résultats}}',
          },
        }}>
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />
      </InternationalizationProvider>,
    );
    const input = screen.getByRole('combobox');
    // "err" matches Cherry and Elderberry.
    fireEvent.change(input, {target: {value: 'err'}});

    await waitFor(() => {
      const region = document.querySelector(
        '[data-astryx-live-region="polite"]',
      );
      expect(region?.textContent).toBe('2 résultats');
    });
  });

  it('speaks the result count from a provider catalog', async () => {
    render(
      <InternationalizationProvider
        locale="fr"
        messages={{
          fr: {
            '@astryx.typeahead.resultCount': {
              defaultMessage:
                '{count, number} {count, plural, one {résultat} other {résultats}}',
            },
          },
        }}>
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />
      </InternationalizationProvider>,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'err'}});

    await waitFor(() => {
      const region = document.querySelector(
        '[data-astryx-live-region="polite"]',
      );
      // Same key through the catalog path rather than `overrides`.
      expect(region?.textContent).toBe('2 résultats');
    });
  });

  it('announces "no results found" when the search is empty (comboboxes-6)', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
        emptySearchText="No results found"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'zzzzz'}});

    await waitFor(() => {
      const region = document.querySelector(
        '[data-astryx-live-region="polite"]',
      );
      expect(region).toHaveTextContent('No results found');
    });
  });

  it('exposes the empty state as a themeable target', async () => {
    const {container} = render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
        emptySearchText="No results found"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'zzzzz'}});

    await waitFor(() => {
      const emptyState = container.querySelector(
        '.astryx-typeahead-empty-state',
      );
      expect(emptyState).not.toBeNull();
      expect(emptyState).toHaveTextContent('No results found');
    });
  });

  describe('empty results active descendant (#4059)', () => {
    it('does not set aria-activedescendant when search has 0 results', async () => {
      render(
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />,
      );
      const input = screen.getByRole('combobox');
      fireEvent.change(input, {target: {value: 'zzzzz'}});

      await waitFor(() => {
        expect(input).not.toHaveAttribute('aria-activedescendant');
      });

      // Press ArrowDown — should NOT set aria-activedescendant to option-0
      fireEvent.keyDown(input, {key: 'ArrowDown'});
      expect(input).not.toHaveAttribute('aria-activedescendant');

      // Press Home — should NOT set aria-activedescendant
      fireEvent.keyDown(input, {key: 'Home'});
      expect(input).not.toHaveAttribute('aria-activedescendant');
    });
  });

  describe('IME composition guard (#4828)', () => {
    it('does not select the highlighted result on a composing Enter', async () => {
      const onChange = vi.fn();
      render(
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={onChange}
          debounceMs={0}
        />,
      );
      const input = screen.getByRole('combobox');
      fireEvent.change(input, {target: {value: 'App'}});
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });

      // The browser fires this composing keydown for the Enter that commits
      // an IME candidate (isComposing: true, or legacy keyCode 229) before
      // compositionend writes the pending syllable into the input. Without
      // the guard this both selects the highlighted result AND clears the
      // input via handleSelect, so the syllable that compositionend then
      // writes lands in an emptied field instead of being part of the word.
      fireEvent.keyDown(input, {key: 'Enter', isComposing: true});
      expect(onChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('App');

      fireEvent.keyDown(input, {key: 'Enter', keyCode: 229});
      expect(onChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('App');

      // A real, non-composing Enter still selects normally.
      fireEvent.keyDown(input, {key: 'Enter'});
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({label: 'Apple'}),
      );
    });
  });

  it('disables input when isDisabled', () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        isDisabled
      />,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('uses anchorRef for dropdown positioning', () => {
    const anchorRef = {current: document.createElement('div')};
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        anchorRef={anchorRef}
      />,
    );
    // Component renders without error — anchor is wired up internally
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not select every result when items lack ids', async () => {
    const idlessItems = [
      {label: 'Alpha'},
      {label: 'Beta'},
    ] as unknown as SearchableItem[];
    const idlessSource: SearchSource = {
      search: () => idlessItems,
      bootstrap: () => idlessItems,
    };

    render(
      <BaseTypeahead
        searchSource={idlessSource}
        value={idlessItems[0]}
        onChange={() => {}}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getAllByRole('option', {hidden: true})).toHaveLength(2);
    });

    const options = screen.getAllByRole('option', {hidden: true});
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });
});

describe('BaseTypeahead focus-out', () => {
  it('closes the dropdown when focus leaves the input', async () => {
    render(
      <>
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />
        <button type="button">Outside</button>
      </>,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'App'}});

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    // Focus moves to an element outside the field/dropdown → menu closes.
    const outside = screen.getByRole('button', {name: 'Outside'});
    fireEvent.blur(input, {relatedTarget: outside});

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('closes the list on the Tab keydown, before the blur it produces', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, {target: {value: 'App'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    // No blur is fired here on purpose: dismissing from the blur instead lets
    // the popover close mid-focus-move, which Chrome answers by dropping
    // focus to <body>.
    fireEvent.keyDown(input, {key: 'Tab'});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('Tab from the input with the list open moves focus to the next control', async () => {
    const user = userEvent.setup();
    render(
      <>
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />
        <button type="button">Next</button>
      </>,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, {target: {value: 'App'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', {name: 'Next'})).toHaveFocus();
  });

  it('keeps the dropdown open when focus moves into the anchor wrapper', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    const anchorRef = {current: anchor};
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        anchorRef={anchorRef}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    // The input lives inside the wrapper we hand to anchorRef.
    anchor.appendChild(input.closest('div') ?? input);
    fireEvent.change(input, {target: {value: 'App'}});

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    // A sibling control inside the field (e.g. a clear button) receives focus.
    const sibling = document.createElement('button');
    anchor.appendChild(sibling);
    fireEvent.blur(input, {relatedTarget: sibling});

    // Menu stays open because focus is still within the field.
    expect(input).toHaveAttribute('aria-expanded', 'true');
    document.body.removeChild(anchor);
  });

  it('does not close when a dropdown option receives focus', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'App'}});

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    const option = screen.getByRole('option', {hidden: true});
    fireEvent.blur(input, {relatedTarget: option});

    expect(input).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Typeahead', () => {
  describe('out-of-order async results', () => {
    it('discards a stale response that resolves after a newer query', async () => {
      const resolvers = new Map<string, (items: SearchableItem[]) => void>();
      const rawSource: SearchSource = {
        search: async (query: string) =>
          new Promise<SearchableItem[]>(resolve => {
            resolvers.set(query, resolve);
          }),
        bootstrap: () => [],
      };

      render(
        <Typeahead
          label="Fruit"
          searchSource={rawSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, {target: {value: 'a'}});
      fireEvent.change(input, {target: {value: 'ap'}});

      // The newer query resolves first…
      await act(async () => {
        resolvers.get('ap')!([{id: 'apple', label: 'Apple'}]);
      });
      expect(screen.getByText('Apple')).toBeInTheDocument();

      // …then the abandoned query's slow response arrives and must be
      // discarded rather than overwriting the current results.
      await act(async () => {
        resolvers.get('a')!([
          {id: 'avocado', label: 'Avocado'},
          {id: 'apricot', label: 'Apricot'},
        ]);
      });
      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.queryByText('Avocado')).not.toBeInTheDocument();
    });

    it('discards a response from a source that was replaced while it was in flight', async () => {
      let resolveOld: ((items: SearchableItem[]) => void) | null = null;
      const oldSource: SearchSource = {
        search: async () =>
          new Promise<SearchableItem[]>(resolve => {
            resolveOld = resolve;
          }),
        bootstrap: () => [],
      };
      const newSource: SearchSource = {
        search: () => [{id: 'banana', label: 'Banana'}],
        bootstrap: () => [],
      };

      const {rerender} = render(
        <Typeahead
          label="Fruit"
          searchSource={oldSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, {target: {value: 'a'}});
      await waitFor(() => expect(resolveOld).not.toBeNull());

      // The source is swapped while the old search is still pending and no
      // new query is typed. The stale response must not populate a menu that
      // now reads from a different source.
      rerender(
        <Typeahead
          label="Fruit"
          searchSource={newSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />,
      );

      await act(async () => {
        resolveOld!([{id: 'apple', label: 'Apple'}]);
      });
      expect(screen.queryByText('Apple')).not.toBeInTheDocument();

      // Work started against the new source still lands normally.
      fireEvent.change(input, {target: {value: 'ba'}});
      await waitFor(() =>
        expect(screen.getByText('Banana')).toBeInTheDocument(),
      );
    });
  });

  it('renders with label', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Fruit')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(
      <Typeahead
        label="Fruit"
        description="Pick your favorite fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Pick your favorite fruit')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(
      <Typeahead
        label="Fruit"
        isRequired
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/Required/)).toBeInTheDocument();
  });

  it('renders error status message', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Selection required'}}
      />,
    );
    expect(screen.getByText('Selection required')).toBeInTheDocument();
  });

  it('shows selected value as a token', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(fruits[0].label)).toBeInTheDocument();
  });

  it('shows clear button when hasClear and value is selected', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
        hasClear
      />,
    );
    expect(
      screen.getByRole('button', {name: 'Clear selection'}),
    ).toBeInTheDocument();
  });

  it('does not show clear button when hasClear is false', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
        hasClear={false}
      />,
    );
    expect(
      screen.queryByRole('button', {name: 'Clear selection'}),
    ).not.toBeInTheDocument();
  });

  it('calls onChange with null when clear button is clicked', () => {
    const onChange = vi.fn();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={onChange}
        hasClear
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Clear selection'}));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('forwards DOM props and ref to the combobox input while preserving edit and blur behavior', async () => {
    const ref = createRef<HTMLInputElement>();
    const onClick = vi.fn();
    const onBlur = vi.fn();
    const onChange = vi.fn();
    const {container} = render(
      <Typeahead
        ref={ref}
        id="fruit-field"
        data-tracking="fruit-picker"
        data-testid="fruit-input"
        containerClassName="custom-typeahead"
        containerStyle={{marginTop: 7}}
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={onChange}
        onClick={onClick}
        onBlur={onBlur}
        debounceMs={0}
      />,
    );
    const surface = container.querySelector<HTMLElement>('.astryx-typeahead')!;
    const input = screen.getByRole('combobox');

    expect(ref.current).toBe(input);
    expect(screen.getByTestId('fruit-input')).toBe(input);
    expect(input).toHaveAttribute('id', 'fruit-field');
    expect(input).toHaveAttribute('data-tracking', 'fruit-picker');
    expect(input).toHaveAccessibleName('Fruit');
    const fieldRoot = container.querySelector('.custom-typeahead');
    expect(fieldRoot).toHaveClass('astryx-field');
    expect(fieldRoot).toHaveStyle({marginTop: '7px'});

    fireEvent.click(surface);
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('Apple');
    fireEvent.click(input);
    expect(onClick).toHaveBeenCalledOnce();

    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards DOM props and ref to the input inside InputGroup, with control* on the surface', async () => {
    const ref = createRef<HTMLInputElement>();
    const onClick = vi.fn();
    const onBlur = vi.fn();
    const onChange = vi.fn();
    const {container} = render(
      <InputGroup label="Produce">
        <Typeahead
          ref={ref}
          id="fruit-field"
          data-tracking="fruit-picker"
          controlClassName="custom-typeahead"
          controlStyle={{marginTop: 7}}
          label="Fruit"
          searchSource={fruitSource}
          value={fruits[0]}
          onChange={onChange}
          onClick={onClick}
          onBlur={onBlur}
          debounceMs={0}
        />
      </InputGroup>,
    );
    const surface = container.querySelector<HTMLElement>('.astryx-typeahead')!;
    const input = screen.getByRole('combobox');

    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('id', 'fruit-field');
    expect(input).toHaveAttribute('data-tracking', 'fruit-picker');
    expect(surface).toHaveClass('custom-typeahead');
    expect(surface).toHaveStyle({marginTop: '7px'});
    expect(input).toHaveAccessibleName('Produce Fruit');

    fireEvent.click(surface);
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('Apple');
    fireEvent.click(input);
    expect(onClick).toHaveBeenCalledOnce();

    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Typeahead size', () => {
  it('renders with size="lg"', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        size="lg"
      />,
    );
    expect(screen.getByLabelText('Fruit')).toBeInTheDocument();
  });
});

describe('BaseTypeahead hasEntriesOnFocus', () => {
  it('does not commit a loading cycle for an empty synchronous bootstrap', async () => {
    const bootstrap = vi.fn((): SearchableItem[] => []);
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    render(
      <Profiler id="typeahead" onRender={onRender}>
        <BaseTypeahead
          searchSource={{search: () => [], bootstrap}}
          value={null}
          onChange={() => {}}
          hasEntriesOnFocus
        />
      </Profiler>,
    );
    const input = screen.getByRole('combobox');
    onRender.mockClear();

    await act(async () => {
      fireEvent.focus(input);
      await Promise.resolve();
    });

    expect(bootstrap).toHaveBeenCalledOnce();
    expect(onRender).not.toHaveBeenCalled();
  });

  it('does not report loading for synchronous bootstrap results', async () => {
    const lane = createBusyIndicatorLane();
    const onLoadingChange = vi.fn(lane.onBusyChange);
    render(
      <BusyIndicatorLaneProvider
        value={{...lane, onBusyChange: onLoadingChange}}>
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          hasEntriesOnFocus
        />
      </BusyIndicatorLaneProvider>,
    );
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    expect(onLoadingChange).not.toHaveBeenCalled();
  });

  it('clears a pending search loading state before synchronous bootstrap', async () => {
    let settleSearch: (items: SearchableItem[]) => void = () => {};
    const searchSource: SearchSource = {
      search: async () =>
        new Promise<SearchableItem[]>(resolve => {
          settleSearch = resolve;
        }),
      bootstrap: () => [],
    };
    render(
      <BaseTypeahead
        searchSource={searchSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, {target: {value: 'a'}});
    await waitFor(() => {
      expect(getBusySpinner()).toBeInTheDocument();
    });

    fireEvent.change(input, {target: {value: ''}});
    await waitFor(() => {
      expect(queryBusySpinner()).not.toBeInTheDocument();
    });

    await act(async () => {
      settleSearch(fruits.slice(0, 1));
      await Promise.resolve();
    });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the loading state for an asynchronous bootstrap', async () => {
    let settle: (items: SearchableItem[]) => void = () => {};
    const bootstrap = vi.fn(
      async () =>
        new Promise<SearchableItem[]>(resolve => {
          settle = resolve;
        }),
    );
    render(
      <BaseTypeahead
        searchSource={{search: () => [], bootstrap}}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    await waitFor(() => {
      expect(getBusySpinner()).toBeInTheDocument();
    });

    await act(async () => {
      settle([]);
      await Promise.resolve();
    });
    expect(queryBusySpinner()).not.toBeInTheDocument();
  });

  it('clears the loading state when the search source is replaced during an in-flight load', async () => {
    let settle: (items: SearchableItem[]) => void = () => {};
    const bootstrap = vi.fn(
      async () =>
        new Promise<SearchableItem[]>(resolve => {
          settle = resolve;
        }),
    );
    const initialSource: SearchSource = {search: () => [], bootstrap};
    const replacementSource: SearchSource = {
      search: () => [],
      bootstrap: () => [],
    };

    const {rerender} = render(
      <BaseTypeahead
        searchSource={initialSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    await waitFor(() => {
      expect(getBusySpinner()).toBeInTheDocument();
    });

    rerender(
      <BaseTypeahead
        searchSource={replacementSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
      />,
    );

    await waitFor(() => {
      expect(queryBusySpinner()).not.toBeInTheDocument();
    });

    await act(async () => {
      settle([]);
      await Promise.resolve();
    });
    expect(queryBusySpinner()).not.toBeInTheDocument();
  });

  it('keeps the loading state under StrictMode for a pending autofocus bootstrap', async () => {
    let settle: (items: SearchableItem[]) => void = () => {};
    const bootstrap = vi.fn(
      async () =>
        new Promise<SearchableItem[]>(resolve => {
          settle = resolve;
        }),
    );
    render(
      <StrictMode>
        <Typeahead
          label="Test"
          searchSource={{search: () => [], bootstrap}}
          value={null}
          onChange={() => {}}
          hasAutoFocus
          hasEntriesOnFocus
        />
      </StrictMode>,
    );

    expect(getBusySpinner()).toBeInTheDocument();

    await act(async () => {
      settle([]);
      await Promise.resolve();
    });
    expect(queryBusySpinner()).not.toBeInTheDocument();
  });

  let settlePendingTransitionA: (items: SearchableItem[]) => void = () => {};
  const stableTransitionSourceA: SearchSource = {
    search: vi.fn(
      async () =>
        new Promise<SearchableItem[]>(resolve => {
          settlePendingTransitionA = resolve;
        }),
    ),
    bootstrap: () => [],
  };
  const stableTransitionSourceB: SearchSource = {
    search: vi.fn(async () => []),
    bootstrap: () => [],
  };

  it('clears loading and aria-busy when source is replaced in a transition that suspends and retries', async () => {
    let isSuspended = false;
    let resolveSuspension: () => void = () => {};
    let pendingSuspension: Promise<void> | null = null;

    function SuspendingSibling({shouldSuspend}: {shouldSuspend: boolean}) {
      if (shouldSuspend && isSuspended && pendingSuspension) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw pendingSuspension;
      }
      return null;
    }

    let updateState!: (source: SearchSource, shouldSuspend: boolean) => void;

    function TransitionContainer() {
      const [source, setSource] = useState<SearchSource>(
        stableTransitionSourceA,
      );
      const [shouldSuspend, setShouldSuspend] = useState(false);
      updateState = (newSource, suspend) => {
        setSource(newSource);
        setShouldSuspend(suspend);
      };

      return (
        <Suspense fallback={<div>Suspended...</div>}>
          <Typeahead
            label="Test"
            searchSource={source}
            value={null}
            onChange={() => {}}
            debounceMs={0}
          />
          <SuspendingSibling shouldSuspend={shouldSuspend} />
        </Suspense>
      );
    }

    render(<TransitionContainer />);
    const input = screen.getByRole('combobox');

    // Trigger a load so aria-busy="true" is set on the combobox
    fireEvent.change(input, {target: {value: 'query'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-busy', 'true');
    });
    expect(getBusySpinner()).toBeInTheDocument();

    // Create the pending promise for suspension
    isSuspended = true;
    pendingSuspension = new Promise<void>(resolve => {
      resolveSuspension = () => {
        isSuspended = false;
        resolve();
      };
    });

    // Inside startTransition, switch from source A to source B while sibling suspends
    act(() => {
      startTransition(() => {
        updateState(stableTransitionSourceB, true);
      });
    });

    // The render suspended, so the previous committed state remains
    expect(input).toHaveAttribute('aria-busy', 'true');

    // Resolve the pending promise and let the transition commit
    await act(async () => {
      resolveSuspension();
      await pendingSuspension;
    });

    // Settle the abandoned load
    await act(async () => {
      settlePendingTransitionA([]);
      await Promise.resolve();
    });

    // The combobox must not keep aria-busy and the spinner must be gone
    expect(input).not.toHaveAttribute('aria-busy');
    expect(queryBusySpinner()).not.toBeInTheDocument();
  });

  it('shows bootstrap results on mouse click', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    // Simulate full mouse click sequence (pointerdown → focus → pointerup → click)
    fireEvent.pointerDown(input);
    fireEvent.focus(input);
    fireEvent.pointerUp(input);
    fireEvent.click(input);

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('shows bootstrap results on keyboard focus', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    // Keyboard focus — no pointer events
    fireEvent.focus(input);

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('re-shows results on refocus when results already exist', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    // Initial focus to load bootstrap results
    fireEvent.focus(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    // Blur to close, then refocus
    fireEvent.blur(input);
    fireEvent.focus(input);

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('reopens on click when the input was already focused and the dropdown closed without a blur (#6845)', async () => {
    const user = userEvent.setup();
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    // A real click focuses the input (justFocusedRef suppresses the click
    // handler's own open logic here, since handleFocus already opened it).
    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    // Escape closes the dropdown via popover.hide() alone — same as
    // selecting a result (which also re-focuses the input internally) or a
    // composing field re-focusing this input after committing something
    // elsewhere, the input is never actually blurred.
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
    expect(input).toHaveFocus();

    // Clicking the still-focused input must reopen it — before the fix,
    // this click dispatched no focus event (the input never lost focus) and
    // nothing else reopened the dropdown.
    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('does not double-fire an async bootstrap source on a single first click (#6848 review)', async () => {
    // A microtask-based "did a focus event just run" flag, tried first,
    // cleared before the click event arrived for an async source — the
    // click path then ran openIfEligible a second time while the first
    // bootstrap call was still in flight. The fix reads document.activeElement
    // at pointerdown instead, which has no event-loop timing dependency.
    const user = userEvent.setup();
    const bootstrap = vi.fn(async (): Promise<SearchableItem[]> => {
      await Promise.resolve();
      return fruits.slice(0, 3);
    });
    render(
      <BaseTypeahead
        searchSource={{search: () => [], bootstrap}}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    expect(bootstrap).toHaveBeenCalledTimes(1);
  });
});

describe('BaseTypeahead minQueryLength', () => {
  it('does not search or open the menu below the threshold', async () => {
    const search = vi.fn((query: string) =>
      fruits.filter(f => f.label.toLowerCase().includes(query.toLowerCase())),
    );
    render(
      <BaseTypeahead
        searchSource={{search, bootstrap: () => []}}
        value={null}
        onChange={() => {}}
        minQueryLength={3}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, {target: {value: 'Ap'}});
    await act(async () => {
      await Promise.resolve();
    });

    expect(search).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    // Positive control: the third character crosses the threshold, so the
    // same harness does see the search and the open menu.
    fireEvent.change(input, {target: {value: 'App'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    expect(search).toHaveBeenCalledExactlyOnceWith('App');
  });

  it('closes the menu again when the query falls back below the threshold', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        minQueryLength={3}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, {target: {value: 'App'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    fireEvent.change(input, {target: {value: 'Ap'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('does not fall back to bootstrap entries on ArrowDown below the threshold', async () => {
    const bootstrap = vi.fn(() => fruits.slice(0, 3));
    render(
      <BaseTypeahead
        searchSource={{search: () => [], bootstrap}}
        value={null}
        onChange={() => {}}
        hasEntriesOnFocus
        minQueryLength={3}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    bootstrap.mockClear();

    // Typing below the threshold closes the bootstrap menu...
    fireEvent.change(input, {target: {value: 'Ap'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    // ...and ArrowDown must not re-open it with entries that ignore the
    // two characters already typed.
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    await act(async () => {
      await Promise.resolve();
    });
    expect(bootstrap).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('searches on the first character when minQueryLength is not set', async () => {
    const search = vi.fn(() => fruits.slice(0, 1));
    render(
      <BaseTypeahead
        searchSource={{search, bootstrap: () => []}}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, {target: {value: 'A'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    expect(search).toHaveBeenCalledExactlyOnceWith('A');
  });

  it('stops reporting "Loading" when the query falls below the threshold mid-search', async () => {
    // Falling below the threshold abandons the in-flight search by bumping the
    // search generation, which also makes that search decline to clear the
    // loading flag on its way out. Backspacing from three characters to two on
    // a remote source is the everyday way to hit it, and the field would
    // otherwise report "Loading" to a screen reader until the third character
    // went back in.
    let settle: (items: SearchableItem[]) => void = () => {};
    const search = vi.fn(
      async () =>
        new Promise<SearchableItem[]>(resolve => {
          settle = resolve;
        }),
    );
    render(
      <BaseTypeahead
        searchSource={{search, bootstrap: () => []}}
        value={null}
        onChange={() => {}}
        minQueryLength={3}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, {target: {value: 'App'}});
    await waitFor(() => {
      expect(getBusySpinner()).toBeInTheDocument();
    });
    expect(input).toHaveAttribute('aria-busy', 'true');

    fireEvent.change(input, {target: {value: 'Ap'}});
    await act(async () => {
      settle(fruits.slice(0, 1));
      await Promise.resolve();
    });

    expect(queryBusySpinner()).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-busy');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('BaseTypeahead hasSearched reset', () => {
  it('does not show "No results found" after selecting an item and re-entering', async () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={onChange}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    // Type a query that returns results
    fireEvent.change(input, {target: {value: 'Apple'}});
    await waitFor(() => {
      expect(screen.getByText('Apple')).toBeInTheDocument();
    });

    // Select the item
    fireEvent.click(screen.getByText('Apple'));
    expect(onChange).toHaveBeenCalledWith(fruits[0]);

    // Re-render with the selected value
    rerender(
      <BaseTypeahead
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={onChange}
        debounceMs={0}
      />,
    );

    // Focus the input again — "No results found" should NOT appear
    fireEvent.focus(input);

    // The empty state text should not be visible since hasSearched was reset
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
  });

  it('resets hasSearched when query is cleared without hasEntriesOnFocus', async () => {
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    // Type a query that returns no results
    fireEvent.change(input, {target: {value: 'xyz'}});
    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    // Clear the query
    fireEvent.change(input, {target: {value: ''}});

    // "No results found" should disappear since hasSearched is reset
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
  });

  it('resets hasSearched and does not announce "No results found" when search source is replaced during a pending search', async () => {
    let settle: (items: SearchableItem[]) => void = () => {};
    const initialSource: SearchSource = {
      search: vi.fn(
        async () =>
          new Promise<SearchableItem[]>(resolve => {
            settle = resolve;
          }),
      ),
      bootstrap: () => [],
    };
    const replacementSource: SearchSource = {
      search: vi.fn(async () => []),
      bootstrap: () => [],
    };

    const {rerender} = render(
      <BaseTypeahead
        searchSource={initialSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    // Type a query that starts an asynchronous search
    fireEvent.change(input, {target: {value: 'abc'}});
    expect(initialSource.search).toHaveBeenCalledWith('abc');

    // Replace the search source while the search is still pending
    rerender(
      <BaseTypeahead
        searchSource={replacementSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );

    // Settle the abandoned search
    await act(async () => {
      settle([]);
      await Promise.resolve();
    });

    await act(
      async () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
    );
    expect(
      document.querySelector('[data-astryx-live-region="polite"]')
        ?.textContent ?? '',
    ).not.toContain('No results found');
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
  });
});

describe('BaseTypeahead popover after selection', () => {
  it('does not show an empty popover after selecting an item with hasEntriesOnFocus', async () => {
    const onChange = vi.fn();
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={onChange}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    // Focus to open bootstrap results
    fireEvent.focus(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    // Select an item — popover should close
    fireEvent.click(screen.getByText('Apple'));
    expect(onChange).toHaveBeenCalledWith(fruits[0]);

    // After selection, input is refocused but popover should NOT reopen
    // with an empty menu. The handleFocus handler should be suppressed.
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

describe('Typeahead edit mode', () => {
  // iOS raises the software keyboard only for a focus made while the browser
  // still dispatches the person's tap, so the focus must not wait for a frame.
  it.each([
    ['the token', () => screen.getByText(fruits[0].label)],
    [
      'the field around it',
      () => screen.getByText(fruits[0].label).closest('div')!,
    ],
  ])(
    'focuses the input with the label selected inside the tap on %s',
    (_name, target) => {
      const onChangeQuery = vi.fn();
      render(
        <Typeahead
          label="Fruit"
          searchSource={fruitSource}
          value={fruits[0]}
          onChange={vi.fn()}
          onChangeQuery={onChangeQuery}
        />,
      );
      const input = screen.getByRole<HTMLInputElement>('combobox');
      // The event the browser is dispatching when focus() runs.
      const focusedDuring: (string | undefined)[] = [];
      // An own property: some test setups make `focus` an accessor on the
      // prototype, which a plain assignment cannot shadow.
      const focus = HTMLElement.prototype.focus;
      Object.defineProperty(input, 'focus', {
        configurable: true,
        value(options?: FocusOptions) {
          focusedDuring.push(window.event?.type);
          focus.call(input, options);
        },
      });

      fireEvent.click(target());

      // No frame has run: the focus, the text and its selection are all in
      // place by the time the tap's own dispatch returns.
      expect(input).toHaveFocus();
      expect(input.value).toBe(fruits[0].label);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(fruits[0].label.length);
      expect(focusedDuring.length).toBeGreaterThan(0);
      expect(focusedDuring.every(type => type === 'click')).toBe(true);
      expect(onChangeQuery).toHaveBeenLastCalledWith(fruits[0].label);
    },
  );

  // The base sees the label as its query by the time the focus lands, so a
  // hasEntriesOnFocus field searches the label instead of opening its
  // bootstrap entries, and Enter cannot commit a bootstrap item.
  it('with hasEntriesOnFocus, editing the value searches its label instead of opening the bootstrap entries', async () => {
    const onChange = vi.fn();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[3]}
        onChange={onChange}
        hasEntriesOnFocus
        debounceMs={0}
      />,
    );
    const input = screen.getByRole<HTMLInputElement>('combobox');

    fireEvent.click(screen.getByText(fruits[3].label));

    expect(input).toHaveFocus();
    expect(input.value).toBe(fruits[3].label);
    // Let any bootstrap or search settle (debounceMs is 0).
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    // Apple is the first bootstrap entry, which the label does not match.
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalledWith(fruits[0]);
  });

  it('enters edit mode on token container click', () => {
    const onChange = vi.fn();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={onChange}
      />,
    );
    screen.getByRole('combobox');

    // Click the token text to enter edit mode
    const tokenText = screen.getByText(fruits[0].label);
    const tokenContainer = tokenText.closest('div')!;
    fireEvent.click(tokenContainer);

    // onChange should NOT have been called (value is preserved for restore)
    expect(onChange).not.toHaveBeenCalled();
  });

  it('empties the input when cleared while editing the selected value (#7038)', async () => {
    const onChangeQuery = vi.fn();
    function Controlled() {
      const [value, setValue] = useState<SearchableItem | null>(fruits[0]);
      return (
        <Typeahead
          label="Fruit"
          searchSource={fruitSource}
          value={value}
          onChange={setValue}
          onChangeQuery={onChangeQuery}
          hasClear
        />
      );
    }
    render(<Controlled />);
    const input = screen.getByRole<HTMLInputElement>('combobox');

    // Enter edit mode: the token gives way to the label as editable text
    fireEvent.click(screen.getByText(fruits[0].label).closest('div')!);
    await waitFor(() => expect(input.value).toBe(fruits[0].label));

    fireEvent.click(screen.getByRole('button', {name: 'Clear selection'}));

    // The value and the visible text agree: nothing selected, nothing typed
    await waitFor(() => expect(input.value).toBe(''));
    expect(onChangeQuery).toHaveBeenLastCalledWith('');
    expect(input).toHaveFocus();
  });

  // Escape and blur restore the token but leave the edit-mode label in the
  // base's query, so a clear from the restored token faces the same stale text.
  it.each([
    [
      'Escape',
      (input: HTMLElement) => fireEvent.keyDown(input, {key: 'Escape'}),
    ],
    ['blur', (input: HTMLElement) => fireEvent.blur(input)],
  ])(
    'empties the input when cleared after %s restored the token (#7038)',
    async (_name, leaveEditMode) => {
      const onChangeQuery = vi.fn();
      function Controlled() {
        const [value, setValue] = useState<SearchableItem | null>(fruits[0]);
        return (
          <Typeahead
            label="Fruit"
            searchSource={fruitSource}
            value={value}
            onChange={setValue}
            onChangeQuery={onChangeQuery}
            hasClear
          />
        );
      }
      render(<Controlled />);
      const input = screen.getByRole<HTMLInputElement>('combobox');

      fireEvent.click(screen.getByText(fruits[0].label).closest('div')!);
      await waitFor(() => expect(input.value).toBe(fruits[0].label));

      leaveEditMode(input);
      await screen.findByRole('button', {name: 'Clear selection'});

      fireEvent.click(screen.getByRole('button', {name: 'Clear selection'}));

      await waitFor(() => expect(input.value).toBe(''));
      expect(onChangeQuery).toHaveBeenLastCalledWith('');
    },
  );

  it('does not report a query change when cleared outside edit mode', () => {
    const onChangeQuery = vi.fn();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={vi.fn()}
        onChangeQuery={onChangeQuery}
        hasClear
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Clear selection'}));

    expect(onChangeQuery).not.toHaveBeenCalled();
  });

  it('restores token on blur without action', async () => {
    const onChange = vi.fn();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('combobox');

    // Enter edit mode
    const tokenText = screen.getByText(fruits[0].label);
    fireEvent.click(tokenText.closest('div')!);

    // Blur without selecting anything
    fireEvent.blur(input);

    // onChange should not have been called — value restored
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not exit edit mode on a composing Escape (IME)', async () => {
    const onChange = vi.fn();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={onChange}
      />,
    );

    // Enter edit mode by clicking the token; the input uncollapses and
    // rejoins the Tab order (tabindex is cleared).
    const tokenText = screen.getByText(fruits[0].label);
    fireEvent.click(tokenText.closest('div')!);
    await act(async () => {
      await new Promise(r => requestAnimationFrame(r));
    });
    const input = screen.getByRole('combobox');
    expect(input).not.toHaveAttribute('tabindex', '-1');

    // BaseTypeahead invokes this external handler before its own IME guard, so
    // a composing Escape (isComposing / legacy keyCode 229) — which an IME uses
    // to cancel the pending candidate — must not exit edit mode here.
    fireEvent.keyDown(input, {key: 'Escape', isComposing: true});
    expect(screen.getByRole('combobox')).not.toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(input, {key: 'Escape', keyCode: 229});
    expect(screen.getByRole('combobox')).not.toHaveAttribute('tabindex', '-1');

    // A real, non-composing Escape still exits edit mode: the token is
    // restored and the collapsed input drops back out of the Tab order.
    fireEvent.keyDown(input, {key: 'Escape'});
    expect(screen.getByRole('combobox')).toHaveAttribute('tabindex', '-1');
  });
});

describe('Typeahead collapsed input tab order', () => {
  it('removes the invisible input from the Tab order while a token is shown', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    // While the token is shown the input is collapsed (width 0 / opacity 0);
    // it must stay programmatically focusable for token interactions but must
    // not be an invisible Tab stop (WCAG 2.4.3 / 2.4.7).
    expect(screen.getByRole('combobox')).toHaveAttribute('tabindex', '-1');
  });

  it('Tab from the token skips the invisible input', async () => {
    const user = userEvent.setup();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    // Focus the token's internal button, then Tab away — focus must not land
    // on the visually hidden combobox input.
    const tokenButton = screen.getByRole('button', {name: fruits[0].label});
    tokenButton.focus();
    await user.tab();
    expect(screen.getByRole('combobox')).not.toHaveFocus();
  });

  it('keeps the input in the Tab order when no token is shown', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox')).not.toHaveAttribute('tabindex');
  });

  it('restores the input to the Tab order in edit mode', () => {
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    // Entering edit mode removes the token and uncollapses the input
    const tokenText = screen.getByText(fruits[0].label);
    fireEvent.click(tokenText.closest('div')!);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('tabindex');
  });
});

describe('BaseTypeahead paste behavior', () => {
  it('pasting text triggers search results like typing', async () => {
    const user = userEvent.setup();
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.paste('App');

    await waitFor(() => {
      expect(screen.getByText('Apple')).toBeInTheDocument();
    });
  });

  it('pasting non-matching text shows no results', async () => {
    const user = userEvent.setup();
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.paste('xyz');

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });

  it('scrolls the highlighted option into view during arrow navigation', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const user = userEvent.setup();
      render(
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.paste('e'); // matches multiple fruits, opens listbox
      await waitFor(() => {
        expect(screen.getByRole('listbox', {hidden: true})).toBeInTheDocument();
      });

      scrollIntoView.mockClear();
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');

      expect(scrollIntoView).toHaveBeenCalledWith({block: 'nearest'});
    } finally {
      delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
        .scrollIntoView;
    }
  });

  it('highlights on hover without scrolling, keyboard still scrolls (#6077)', async () => {
    // Hover must highlight only: scrollIntoView under a stationary pointer
    // moves the next option under it, re-highlighting and scrolling again —
    // a runaway auto-scroll loop with no user input.
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const user = userEvent.setup();
      render(
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.paste('e'); // matches Cherry, Date, Elderberry
      await waitFor(() => {
        expect(screen.getByRole('listbox', {hidden: true})).toBeInTheDocument();
      });

      scrollIntoView.mockClear();
      const options = screen.getAllByRole('option', {hidden: true});
      fireEvent.mouseMove(options[1]);

      expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
      expect(scrollIntoView).not.toHaveBeenCalled();

      await user.keyboard('{ArrowDown}');
      expect(scrollIntoView).toHaveBeenCalledWith({block: 'nearest'});
    } finally {
      delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
        .scrollIntoView;
    }
  });
});

describe('BaseTypeahead highlight under a resting pointer', () => {
  it('keeps the keyboard highlight when an option appears under the pointer, and follows pointer movement', async () => {
    // A menu that opens or reflows under a pointer the user is not moving
    // fires mouseenter on the option that lands beneath it. Taking the
    // highlight from that would make Enter pick an option the user never
    // pointed at; only real pointer movement moves the highlight.
    const user = userEvent.setup();
    render(
      <BaseTypeahead
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.paste('e'); // matches Cherry, Date, Elderberry
    await waitFor(() => {
      expect(screen.getByRole('listbox', {hidden: true})).toBeInTheDocument();
    });
    const options = screen.getAllByRole('option', {hidden: true});
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);

    fireEvent.mouseEnter(options[2]);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);

    fireEvent.mouseMove(options[2]);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[2].id);
  });
});

describe('Typeahead disabledMessage', () => {
  // jsdom does not implement the Popover API used by the tooltip, so mock
  // showPopover/hidePopover to toggle a `popover-open` attribute the tests
  // can assert on.
  beforeEach(() => {
    HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
      this.setAttribute('popover-open', '');
    });
    HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
      this.removeAttribute('popover-open');
    });
  });

  // jsdom popover content is in the DOM but not "visible" in the
  // accessibility tree; use hidden: true to find it.
  const h = {hidden: true} as const;

  it('shows the reason tooltip on hover when disabled with a reason', async () => {
    render(
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        isDisabled
        disabledMessage="You need the Editor role"
      />,
    );

    // The field itself, by its own class: the input no longer sits directly
    // inside it — it is in the content lane that bounds the value — and
    // `mouseEnter` does not bubble, so the hover has to land on the element
    // the tooltip is actually bound to.
    const container = document.querySelector(
      '.astryx-typeahead',
    ) as HTMLElement;
    const tooltip = screen.getByRole('tooltip', h);
    expect(tooltip).toHaveTextContent('You need the Editor role');

    fireEvent.mouseEnter(container);
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });

    fireEvent.mouseLeave(container);
    await waitFor(() => {
      expect(tooltip).not.toHaveAttribute('popover-open');
    });
  });

  it('shows the reason tooltip on keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        isDisabled
        disabledMessage="You need the Editor role"
      />,
    );

    const tooltip = screen.getByRole('tooltip', h);
    await user.tab();
    expect(screen.getByRole('combobox')).toHaveFocus();
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });
  });

  it('does not render a tooltip when not disabled', () => {
    render(
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        disabledMessage="You need the Editor role"
      />,
    );
    expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
  });

  it('does not render a tooltip when disabled without a reason', () => {
    render(
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        isDisabled
      />,
    );
    expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
  });

  it('keeps the input focusable via aria-disabled when a reason is provided', () => {
    render(
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        isDisabled
        disabledMessage="You need the Editor role"
      />,
    );
    const input = screen.getByRole('combobox');
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).toHaveAttribute('readonly');
  });

  it('links the reason tooltip from the input via aria-describedby', () => {
    render(
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        isDisabled
        disabledMessage="You need the Editor role"
      />,
    );
    const input = screen.getByRole('combobox');
    const tooltip = screen.getByRole('tooltip', h);
    expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('blocks typing and selection while focusable-disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={onChange}
        isDisabled
        disabledMessage="You need the Editor role"
      />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'App');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('remains natively disabled when disabled without a reason', () => {
    render(
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        isDisabled
      />,
    );
    const input = screen.getByRole('combobox');
    expect(input).toBeDisabled();
    expect(input).not.toHaveAttribute('aria-disabled');
  });
});

describe('Typeahead statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'attached',
    );
  });

  it('forwards statusVariant="detached" to the underlying Field status', () => {
    const {container} = render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
        statusVariant="detached"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });
});

describe('busy indicator ownership', () => {
  /** A source that stays in flight until the test settles it. */
  const pendingSource = () => {
    let settle: (items: SearchableItem[]) => void = () => {};
    return {
      source: {
        search: async () =>
          new Promise<SearchableItem[]>(resolve => {
            settle = resolve;
          }),
        bootstrap: () => [],
      },
      settle: (items: SearchableItem[] = []) => settle(items),
    };
  };

  it('renders its own indicator for a direct caller', async () => {
    // BaseTypeaheadProps is re-exported from the package entry point, so the
    // base has direct callers this repo cannot see. They painted no indicator
    // of their own — the base did it for them — so it keeps doing it. The
    // Spinner is decorative and the base announces the search's busy start
    // through the shared channel (spec:AST-086 FR8).
    const {source, settle} = pendingSource();
    render(
      <BaseTypeahead
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, {target: {value: 'App'}});
    await waitFor(() => {
      expect(getBusySpinner()).toBeInTheDocument();
    });
    // A Spinner, not the static clock glyph this used to render: `clock`
    // means *time* everywhere else in core, and nothing about it moved while
    // a search was out.
    expect(getBusySpinner().querySelector('svg')).toBeInTheDocument();

    await act(async () => {
      settle();
      await Promise.resolve();
    });
    expect(queryBusySpinner()).not.toBeInTheDocument();
  });

  it('hands the indicator over to a field that takes it, and renders none itself', async () => {
    // Typeahead and Tokenizer paint the spinner in the one inline-end lane
    // they already own. Two indicators in one field is the defect this PR
    // exists to fix, so the base must yield rather than add to it.
    const {source, settle} = pendingSource();
    // A real lane with its notify spied, rather than a hand-built object: the
    // lane is a store now, and the base must drive the store the wrappers use.
    const lane = createBusyIndicatorLane();
    const onLoadingChange = vi.fn(lane.onBusyChange);
    render(
      <BusyIndicatorLaneProvider
        value={{...lane, onBusyChange: onLoadingChange}}>
        <BaseTypeahead
          searchSource={source}
          value={null}
          onChange={() => {}}
          debounceMs={0}
        />
      </BusyIndicatorLaneProvider>,
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, {target: {value: 'App'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-busy', 'true');
    });
    // Scoped by name: the announcer for result counts is a role="status"
    // live region too, and it is not the indicator.
    expect(queryBusySpinner()).not.toBeInTheDocument();
    expect(onLoadingChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      settle();
      await Promise.resolve();
    });
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the busy handoff out of the exported prop surface', async () => {
    // The handoff used to be `__onLoadingChange` on BaseTypeaheadProps, which
    // the package entry point re-exports — so a builder reading the exported
    // declaration would find it and could reasonably wire it, pinning a detail
    // between two wrappers and their base as permanent API. An `@internal` tag
    // is a note to a reader; a module boundary is the actual seam.
    const entry = await import('./index');
    expect(Object.keys(entry)).not.toContain('BusyIndicatorLaneProvider');
    expect(Object.keys(entry)).not.toContain('useBusyIndicatorLane');

    const source = await readFile(
      resolve(__dirname, 'BaseTypeahead.tsx'),
      'utf8',
    );
    expect(source).not.toContain('__onLoadingChange');
  });

  it('reports each transition once, and reports nothing when nothing changed', async () => {
    // Edge-triggered on purpose. Every keystroke below the query threshold
    // clears the flag, and an unconditional report would hand the wrapper a
    // `false` per character — each one a state write, and on a field that is
    // re-rendering as the user types.
    const {source, settle} = pendingSource();
    // A real lane with its notify spied, rather than a hand-built object: the
    // lane is a store now, and the base must drive the store the wrappers use.
    const lane = createBusyIndicatorLane();
    const onLoadingChange = vi.fn(lane.onBusyChange);
    render(
      <BusyIndicatorLaneProvider
        value={{...lane, onBusyChange: onLoadingChange}}>
        <BaseTypeahead
          searchSource={source}
          value={null}
          onChange={() => {}}
          minQueryLength={3}
          debounceMs={0}
        />
      </BusyIndicatorLaneProvider>,
    );
    const input = screen.getByRole('combobox');

    // Below the threshold: no search, so nothing to report.
    fireEvent.change(input, {target: {value: 'A'}});
    fireEvent.change(input, {target: {value: 'Ap'}});
    await act(async () => {
      await Promise.resolve();
    });
    expect(onLoadingChange).not.toHaveBeenCalled();

    fireEvent.change(input, {target: {value: 'App'}});
    await waitFor(() => {
      expect(onLoadingChange).toHaveBeenCalledTimes(1);
    });
    expect(onLoadingChange).toHaveBeenCalledWith(true);

    // Back below the threshold: one report out, not one per keystroke.
    fireEvent.change(input, {target: {value: 'Ap'}});
    fireEvent.change(input, {target: {value: 'A'}});
    fireEvent.change(input, {target: {value: ''}});
    await act(async () => {
      settle();
      await Promise.resolve();
    });
    expect(onLoadingChange).toHaveBeenCalledTimes(2);
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });
});

describe('end controls stay in flow', () => {
  // The fix for the transform bug, expressed as a rule rather than a
  // measurement: these controls are ordinary flex siblings of the input, so
  // they take up room and nothing has to reserve it for them. jsdom performs
  // no layout, so what is asserted is the absence of the two things that
  // stopped that being true — an out-of-flow lane, and a padding reserve fed
  // by a measured width. The geometry itself is browser-verified in the PR.
  it('renders the clear button without taking it out of flow', () => {
    const {container} = render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    const field = container.querySelector('.astryx-typeahead');
    const clear = screen.getByRole('button', {name: /clear/i});
    expect(field).toContainElement(clear);
    // The controls sit in a lane that is itself an ordinary in-flow child of
    // the field — not a box positioned over it, which is what reserved no
    // room and put the input underneath.
    const lane = clear.parentElement as HTMLElement;
    expect(lane.parentElement).toBe(field);
    expect(getComputedStyle(lane).position).not.toBe('absolute');
  });

  it('never reserves room with a measured width', () => {
    // The custom property is Tokenizer's mechanism and must not reappear
    // here: a width measured in viewport space and spent as local padding is
    // wrong under any CSS transform (measured on Tokenizer's 123px lane,
    // scale(.5) covered 14px of the query and scale(2) left a 125.95px gap).
    const {container} = render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    expect(
      container.querySelector('[style*="--_tokenizer-end-lane-width"]'),
    ).toBeNull();
  });

  it('holds the controls at the inline end when a token shows', () => {
    // `auto` gives free space to the margin rather than to a sibling, so the
    // controls stay in the corner in the states where the content lane is not
    // the only flexible item in the row. Without it the clear button sat
    // against the token in mid-field instead of in the corner (measured:
    // x=39 in a 300px field, against TextInput's 281).
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    const clear = screen.getByRole('button', {name: /clear/i});
    const lane = clear.parentElement as HTMLElement;
    expect(getComputedStyle(lane).marginInlineStart).toBe('auto');
  });

  it('keeps the field on one row so the controls cannot be pushed off it', () => {
    // `flex-wrap` moves an item to a new line rather than shrinking it, so a
    // wrapping field put the controls on a row of their own once the token
    // got long. The shared field base does not wrap; this must not either.
    const {container} = render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    const field = container.querySelector('.astryx-typeahead') as HTMLElement;
    expect(getComputedStyle(field).flexWrap).not.toBe('wrap');
  });

  it('keeps the input in flow while a token shows, so the field keeps its width', () => {
    // A field's width must not depend on its value. Every other field in the
    // family gets that for free: the `<input>` stays in flow and the field is
    // as wide as the input's own intrinsic width. This one used to take the
    // input out of flow and zero its width when a token showed, leaving the
    // field measuring the token — in a shrink-to-fit parent it snapped to the
    // value's length (199px to 57px in Chromium, #5560). Block parents hid it,
    // which is why no story caught it. jsdom resolves no layout, so assert the
    // mechanism: the input still occupies the row.
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('combobox');
    const style = getComputedStyle(input);
    expect(style.position).not.toBe('absolute');
    expect(style.width).not.toBe('0px');
    expect(style.flex).not.toBe('0 0 0');
  });

  it('paints the token over the input rather than beside it', () => {
    // In flow the token would add its own width to the row — the same
    // value-dependent sizing from the other direction, where a long value
    // grows the field instead of collapsing it.
    const {container} = render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    const token = container.querySelector('.astryx-token') as HTMLElement;
    expect(getComputedStyle(token).position).toBe('absolute');
  });

  it('lets the token take the pointer that the hidden input would swallow', () => {
    // The input still covers that space, so it has to stop intercepting the
    // clicks that enter edit mode.
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
      />,
    );
    expect(getComputedStyle(screen.getByRole('combobox')).pointerEvents).toBe(
      'none',
    );
  });
});

describe('the value is bounded by the content lane', () => {
  // Keeping the input in flow fixed the field's width, but it left the token
  // positioned against the whole field, which has no idea where the end
  // controls start. A value longer than the input then ran under the clear
  // button and out past the field's own border — measured in Chromium at
  // 28-33px of overlap and up to 4px outside the border, worse than the 12px
  // of overlap on main. The lane is the box the value may occupy: an ordinary
  // flex item that ends exactly where the end lane begins.
  //
  // jsdom resolves no layout, so what is asserted here is the mechanism. The
  // geometry is browser-verified in the PR.
  const renderWithValue = () =>
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
        hasClear
      />,
    );

  it('puts the input and the token in one lane, inside the field', () => {
    const {container} = renderWithValue();
    const field = container.querySelector('.astryx-typeahead');
    const input = screen.getByRole('combobox');
    const token = container.querySelector('.astryx-token') as HTMLElement;

    const lane = input.parentElement as HTMLElement;
    expect(lane).not.toBe(field);
    expect(lane.parentElement).toBe(field);
    // The token's containing block is the lane, which is what bounds it.
    expect(token.parentElement).toBe(lane);
    expect(getComputedStyle(lane).position).toBe('relative');
  });

  it('lets the lane yield its whole width, so a narrow field cannot overflow', () => {
    // `min-width: 0` is the half of this that the earlier `200px` floor got
    // wrong: the field states no width of its own, so it still shrinks to
    // whatever a narrow parent or an InputGroup gives it.
    const {container} = renderWithValue();
    const lane = screen.getByRole('combobox').parentElement as HTMLElement;
    const style = getComputedStyle(lane);
    expect(style.minWidth).toBe('0');
    expect(style.flexGrow).toBe('1');
    // Nothing states a width: a narrow parent gets all of it back.
    expect(
      (container.querySelector('.astryx-typeahead') as HTMLElement).style
        .minWidth,
    ).toBe('');
  });

  it("anchors the token at the lane's end, not just its start", () => {
    // The bound that stops the value reaching the end controls. Anchored at
    // one end only, the token is capped by the field's own padding box, which
    // is past the clear button.
    const {container} = renderWithValue();
    const token = container.querySelector('.astryx-token') as HTMLElement;
    const style = getComputedStyle(token);
    expect(style.insetInlineEnd).toBe('0');
    // `fit-content` against that pair of insets is what shrink-wraps the
    // label yet still caps it at the lane; the `auto` end margin is what
    // keeps the pair from being over-constrained and dropping the end inset.
    expect(style.width).toBe('fit-content');
    expect(style.marginInlineEnd).toBe('auto');
  });
});

// `emptySearchResultsText` was renamed to `emptySearchText` and widened from
// `string` to `ReactNode` (`spec:AST-056` FR1). The overlap ended in a minor
// release (`CLN-0001`–`CLN-0004`, `spec:AST-017` FR31): the old name is no
// longer part of the type and is no longer read.
describe('emptySearchText rename', () => {
  function searchForNothing() {
    fireEvent.change(screen.getByRole('combobox'), {
      target: {value: 'zzzzz'},
    });
  }

  describe('Typeahead', () => {
    it('renders an element, which the old string type could not express', async () => {
      render(
        <Typeahead
          label="Fruit"
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          emptySearchText={
            <span>
              Nothing ripe. <a href="/add">Add a fruit</a>
            </span>
          }
        />,
      );
      searchForNothing();

      await waitFor(() => {
        expect(screen.getByText('Add a fruit')).toBeInTheDocument();
      });
    });

    it('no longer reads the removed emptySearchResultsText (CLN-0002)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // The unknown prop reaches the root element, which React reports.
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <Typeahead
          label="Fruit"
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          // @ts-expect-error -- removed in the minor release (CLN-0002)
          emptySearchResultsText="Nothing ripe"
        />,
      );
      searchForNothing();

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
      expect(screen.queryByText('Nothing ripe')).not.toBeInTheDocument();
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('is deprecated'),
      );
      warn.mockRestore();
      error.mockRestore();
    });
  });

  describe('BaseTypeahead', () => {
    it('announces the text of an element, not the catalog default', async () => {
      render(
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          emptySearchText={
            <span>
              Nothing ripe. <a href="/add">Add a fruit</a>
            </span>
          }
        />,
      );
      searchForNothing();

      // Widening to ReactNode without this would hand the live region an
      // object: the AR1 defect, spread to a fourth component.
      await waitFor(() => {
        expect(
          document.querySelector('[data-astryx-live-region="polite"]'),
        ).toHaveTextContent('Nothing ripe. Add a fruit');
      });
    });

    it('no longer announces the removed emptySearchResultsText (CLN-0003)', async () => {
      // The unknown prop reaches the root element, which React reports.
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <BaseTypeahead
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          // @ts-expect-error -- removed in the minor release (CLN-0003)
          emptySearchResultsText="Nothing ripe"
        />,
      );
      searchForNothing();

      await waitFor(() => {
        expect(
          document.querySelector('[data-astryx-live-region="polite"]'),
        ).toHaveTextContent('No results found');
      });
      expect(
        document.querySelector('[data-astryx-live-region="polite"]')
          ?.textContent,
      ).not.toContain('Nothing ripe');
      error.mockRestore();
    });
  });
});

describe('Typeahead consumer key handler order', () => {
  it('runs onKeyDown on the input after built-in key handling, so it cannot cancel navigation', async () => {
    let currentTarget: EventTarget | null = null;
    const onKeyDown = vi.fn((event: React.KeyboardEvent) => {
      currentTarget = event.currentTarget;
      event.preventDefault();
    });
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        debounceMs={0}
        hasEntriesOnFocus
        onKeyDown={onKeyDown}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(
        screen.getAllByRole('option', {hidden: true}).length,
      ).toBeGreaterThan(0);
    });
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(currentTarget).toBe(screen.getByRole('combobox'));
    expect(input).toHaveAttribute('aria-activedescendant');
  });
});

describe('Typeahead consumer key handler target', () => {
  it('still runs onKeyDown for keys on the clear button', () => {
    const onKeyDown = vi.fn();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={fruits[0]}
        onChange={() => {}}
        onKeyDown={onKeyDown}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', {name: /clear/i}), {
      key: 'Enter',
    });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it('runs onKeyDown once for a key on the input', () => {
    const onKeyDown = vi.fn();
    render(
      <Typeahead
        label="Fruit"
        searchSource={fruitSource}
        value={null}
        onChange={() => {}}
        onKeyDown={onKeyDown}
      />,
    );
    fireEvent.keyDown(screen.getByRole('combobox'), {key: 'a'});
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});
