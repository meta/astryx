// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tokenizer.test.tsx
 * @input Uses vitest, @testing-library/react, Tokenizer
 * @output Unit tests for Tokenizer component
 * @position Testing; validates Tokenizer.tsx
 *
 * SYNC: When Tokenizer.tsx changes, update tests to match
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';
import {render, screen, fireEvent, act, waitFor} from '@testing-library/react';
import {createRef, Profiler, useState} from 'react';
import userEvent from '@testing-library/user-event';
import {Tokenizer} from './Tokenizer';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import type {SearchSource, SearchableItem} from '../Typeahead/types';
import {TestIcon} from '../__tests__/TestIcon';
import {InternationalizationProvider} from '../i18n';
import type * as TokenModule from '../Token';

// Every Token render, in order, by label.
//
// A spy that WRAPS the real component rather than replacing it: a stand-in
// would measure the stand-in, and the number under review is how often the
// real token subtree re-renders during a search.
const renderedTokens: string[] = [];
vi.mock('../Token', async importActual => {
  const actual = await importActual<typeof TokenModule>();
  return {
    ...actual,
    Token: (props: Parameters<typeof TokenModule.Token>[0]) => {
      renderedTokens.push(typeof props.label === 'string' ? props.label : '');
      return actual.Token(props);
    },
  };
});

// Test-supplied announcement strings: the assertions below depend on no
// catalog, and no hardcoded English in the component can satisfy them.
const TOKEN_MESSAGES = {
  fr: {
    '@astryx.tokenizer.tokenAdded': 'Ajouté : {label}',
    '@astryx.tokenizer.tokenRemoved': 'Retiré : {label}',
  },
};

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

// Store original matches to restore later
const originalMatches = HTMLElement.prototype.matches;

// Track popover open state per element
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock Popover API for jsdom
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
const users: SearchableItem[] = [
  {id: '1', label: 'Alice'},
  {id: '2', label: 'Bob'},
  {id: '3', label: 'Charlie'},
  {id: '4', label: 'Diana'},
];

const userSource: SearchSource = {
  search: (query: string) =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users.slice(0, 3),
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

describe('Tokenizer minQueryLength', () => {
  it('forwards the threshold to the typeahead engine', async () => {
    const search = vi.fn((query: string) =>
      users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
    );
    render(
      <Tokenizer
        label="People"
        searchSource={{search, bootstrap: () => []}}
        value={[]}
        onChange={() => {}}
        minQueryLength={3}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, {target: {value: 'Al'}});
    await act(async () => {
      await Promise.resolve();
    });
    expect(search).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, {target: {value: 'Ali'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
  });
});

describe('Tokenizer', () => {
  it('forwards DOM props and ref to the combobox input while preserving focus callbacks', () => {
    const ref = createRef<HTMLInputElement>();
    const onClick = vi.fn();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const {container} = render(
      <Tokenizer
        ref={ref}
        id="members-field"
        data-tracking="members-picker"
        data-testid="members-input"
        containerClassName="custom-tokenizer"
        containerStyle={{marginTop: 7}}
        label="Members"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );
    const input = screen.getByRole('combobox');
    const surface = container.querySelector('.astryx-tokenizer');

    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('id', 'members-field');
    expect(input).toHaveAttribute('data-tracking', 'members-picker');
    expect(screen.getByTestId('members-input')).toBe(input);
    expect(surface).toHaveAttribute('aria-label', 'Members');
    const fieldRoot = container.querySelector('.custom-tokenizer');
    expect(fieldRoot).toHaveClass('astryx-field');
    expect(fieldRoot).toHaveStyle({marginTop: '7px'});

    fireEvent.click(input);
    expect(onClick).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalledOnce();

    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it('exposes focus control through handleRef', () => {
    let handle: {focus: () => void; blur: () => void} | null = null;
    render(
      <Tokenizer
        handleRef={h => {
          handle = h;
        }}
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />,
    );

    act(() => {
      handle?.focus();
    });

    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('renders with label', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />,
    );
    // Label is rendered by Field
    expect(screen.getByText('Members')).toBeInTheDocument();
  });

  it('renders combobox input', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders placeholder when no tokens', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        placeholder="Search people..."
      />,
    );
    expect(screen.getByPlaceholderText('Search people...')).toBeInTheDocument();
  });

  it('renders tokens for selected items', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0], users[1]]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders remove buttons on tokens', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', {name: 'Remove Alice'}),
    ).toBeInTheDocument();
  });

  it('calls onChange with remove when token is removed', () => {
    const onChange = vi.fn();
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0], users[1]]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Remove Alice'}));
    expect(onChange).toHaveBeenCalledWith([users[1]], {
      item: users[0],
      type: 'remove',
    });
  });

  it('visually hides input when maxEntries is reached but preserves it for keyboard access', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0], users[1]]}
        onChange={() => {}}
        maxEntries={2}
      />,
    );
    // Input stays in the DOM for keyboard accessibility (backspace to remove)
    // but is visually hidden
    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();
  });

  it('shows input when under maxEntries', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
        maxEntries={2}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows clear all button when hasClear is true', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
        hasClear
      />,
    );
    expect(screen.getByRole('button', {name: 'Clear all'})).toBeInTheDocument();
  });

  it('does not show clear all when no tokens', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        hasClear
      />,
    );
    expect(
      screen.queryByRole('button', {name: 'Clear all'}),
    ).not.toBeInTheDocument();
  });

  it('renders description text', () => {
    render(
      <Tokenizer
        label="Members"
        description="Select team members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Select team members')).toBeInTheDocument();
  });

  it('renders error status', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        status={{type: 'error', message: 'At least one member required'}}
      />,
    );
    expect(
      screen.getByText('At least one member required'),
    ).toBeInTheDocument();
  });

  it('disables tokens and input when isDisabled', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
        isDisabled
      />,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
    // Remove button should not be present when disabled
    expect(
      screen.queryByRole('button', {name: 'Remove Alice'}),
    ).not.toBeInTheDocument();
  });

  it('renders with data-testid', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        data-testid="my-tokenizer"
      />,
    );
    expect(screen.getByTestId('my-tokenizer')).toBeInTheDocument();
  });

  it('renders group with aria-label', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Members');
  });

  it('hides placeholder when tokens are present', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
        placeholder="Search people..."
      />,
    );
    const input = screen.getByRole('combobox');
    // Placeholder should be empty when tokens exist
    expect(input).not.toHaveAttribute('placeholder', 'Search people...');
  });

  it('uses a non-painting placeholder to collapse only an empty trailing input', () => {
    const onChangeQuery = vi.fn();
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
        onChangeQuery={onChangeQuery}
        hasClear
      />,
    );
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('placeholder', ' ');

    fireEvent.change(input, {target: {value: 'Al'}});
    expect(input).toHaveValue('Al');
    expect(onChangeQuery).toHaveBeenLastCalledWith('Al');

    fireEvent.change(input, {target: {value: ''}});
    expect(onChangeQuery).toHaveBeenLastCalledWith('');
  });

  it('shows placeholder when no tokens are present', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        placeholder="Search people..."
      />,
    );
    expect(screen.getByPlaceholderText('Search people...')).toBeInTheDocument();
  });

  it('renders tokens as direct children of wrapper (not in a sub-container)', () => {
    const {container: _container} = render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0], users[1]]}
        onChange={() => {}}
      />,
    );
    const wrapper = _container.querySelector('.astryx-tokenizer')!;
    // Tokens should be direct children of the wrapper, not nested in a div
    const tokenElements = wrapper.querySelectorAll(':scope > span');
    expect(tokenElements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders with size="lg"', () => {
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        size="lg"
      />,
    );
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  describe('tokenOverflowBehavior', () => {
    it('none: renders all tokens directly without OverflowList', () => {
      const {container} = render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={() => {}}
          tokenOverflowBehavior="none"
          data-testid="tokenizer"
        />,
      );
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      // Should not have overflow list measurement containers
      expect(
        container.querySelector('[data-overflow-list]'),
      ).not.toBeInTheDocument();
    });

    it('unfocusedInline: renders OverflowList when blurred', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1], users[2]]}
          onChange={() => {}}
          tokenOverflowBehavior="unfocusedInline"
          data-testid="tokenizer"
        />,
      );
      // OverflowList renders a hidden measurement container plus visible items,
      // so tokens appear multiple times in the DOM
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    });

    it('unfocusedInline: removes truncation on focus', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1], users[2]]}
          onChange={() => {}}
          tokenOverflowBehavior="unfocusedInline"
          data-testid="tokenizer"
        />,
      );
      const wrapper = screen.getByTestId('tokenizer');
      // Focus the wrapper (simulates focusing the input within)
      fireEvent.focusIn(wrapper);
      // All tokens should be directly rendered (no overflow list)
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    it('unfocusedLayer: renders placeholder and top-layer popover', () => {
      const {container} = render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={() => {}}
          tokenOverflowBehavior="unfocusedLayer"
          data-testid="tokenizer"
        />,
      );
      // The wrapper should be rendered inside the placeholder (truncated view in-flow)
      const wrapper = screen.getByTestId('tokenizer');
      expect(wrapper).toBeInTheDocument();
      // A popover element should exist for the top-layer expanded content
      const popover = container.querySelector('[popover]');
      expect(popover).toBeInTheDocument();
      // Only one group role (the wrapper)
      expect(container.querySelectorAll('[role="group"]').length).toBe(1);
    });

    it('unfocusedLayer: shows expanded content in popover on focus', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1], users[2]]}
          onChange={() => {}}
          tokenOverflowBehavior="unfocusedLayer"
          data-testid="tokenizer"
        />,
      );
      const wrapper = screen.getByTestId('tokenizer');
      // Focus the wrapper to expand
      fireEvent.focusIn(wrapper);
      // showPopover should have been called
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      // All tokens should be visible
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    it('unfocusedLayer: RTL emits no justify-self into the inset-positioned popover', () => {
      // The popover positions itself with explicit anchor() insets
      // (positioning: 'custom'), so none of useLayer's placement-derived
      // styles may reach it — an RTL justify-self with insets and no
      // position-area would re-align the box inside the inset-modified
      // containing block instead of hugging the anchor.
      const original = window.getComputedStyle;
      let root: HTMLElement | null = null;
      const spy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation((el, pseudo) => {
          const style = original(el, pseudo);
          if (root && el instanceof Element && root.contains(el)) {
            Object.defineProperty(style, 'direction', {
              value: 'rtl',
              configurable: true,
            });
          }
          return style;
        });

      try {
        const {container} = render(
          <div style={{direction: 'rtl'}}>
            <Tokenizer
              label="Members"
              searchSource={userSource}
              value={[users[0], users[1], users[2]]}
              onChange={() => {}}
              tokenOverflowBehavior="unfocusedLayer"
              data-testid="tokenizer"
            />
          </div>,
        );
        root = container.firstElementChild as HTMLElement;

        fireEvent.focusIn(screen.getByTestId('tokenizer'));
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();

        const popover = container.querySelector('[popover]');
        const style = popover?.getAttribute('style') ?? '';
        // jsdom drops anchor() values for known properties (top/left), so
        // anchor the positive check on position-anchor instead. The negative
        // checks are meaningful: jsdom serializes both justify-self and
        // position-area when emitted (the DropdownMenu RTL test relies on it).
        expect(style).toContain('position-anchor');
        expect(style).not.toContain('justify-self');
        expect(style).not.toContain('position-area');
        expect(style).not.toContain('position-try-fallbacks');
      } finally {
        spy.mockRestore();
      }
    });

    it('unfocusedLayer: collapses on blur', () => {
      const {container} = render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1], users[2]]}
          onChange={() => {}}
          tokenOverflowBehavior="unfocusedLayer"
          data-testid="tokenizer"
        />,
      );
      const wrapper = screen.getByTestId('tokenizer');
      // Focus to expand — fires on wrapper in the placeholder
      act(() => {
        fireEvent.focusIn(wrapper);
      });
      // After focus, content moves to the popover. We need to blur
      // from the popover content, not the original wrapper.
      // Get the popover element and blur from it.
      const popover = container.querySelector('[popover]');
      expect(popover).toBeInTheDocument();
      // Find the wrapper again (it may have moved into the popover)
      const expandedWrapper = screen.getByTestId('tokenizer');
      act(() => {
        fireEvent.focusOut(expandedWrapper, {relatedTarget: document.body});
      });
      // hidePopover should have been called
      expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
    });

    it('unfocusedInline: does not truncate when no tokens', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          tokenOverflowBehavior="unfocusedInline"
          data-testid="tokenizer"
        />,
      );
      // With no tokens, should not be in truncated state
      const wrapper = screen.getByTestId('tokenizer');
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('hasCreate', () => {
    const emptySource: SearchSource = {
      search: () => [],
      bootstrap: () => [],
    };

    it('still offers Create below minQueryLength, and does not search', async () => {
      // The threshold exists to avoid a fetch too broad to be worth making.
      // Creating costs no fetch, so a field that can create `QA` should not
      // stop being able to just because a search for `QA` would match too
      // much. Reported on #5385.
      const search = vi.fn(() => []);
      const onChange = vi.fn();
      render(
        <Tokenizer
          label="Tags"
          searchSource={{search, bootstrap: () => []}}
          value={[]}
          onChange={onChange}
          hasCreate
          minQueryLength={3}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'QA'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // Offered...
      expect(screen.queryByText('Create "QA"')).toBeInTheDocument();
      // ...without the source ever being asked.
      expect(search).not.toHaveBeenCalled();
      // ...and it commits.
      fireEvent.click(screen.getByText('Create "QA"'));
      expect(onChange).toHaveBeenCalledWith(
        [expect.objectContaining({id: 'QA', label: 'QA'})],
        expect.objectContaining({type: 'create'}),
      );
    });

    it('offers no menu below the threshold without hasCreate', async () => {
      // The negative control for the case above: with nothing to derive from
      // the text, a below-threshold query still opens nothing, and never
      // reports "no results" for a query that was not searched.
      const search = vi.fn(() => []);
      render(
        <Tokenizer
          label="Tags"
          searchSource={{search, bootstrap: () => []}}
          value={[]}
          onChange={() => {}}
          minQueryLength={3}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'QA'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(search).not.toHaveBeenCalled();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    });

    it('does not offer Create below the threshold for a token already held', async () => {
      render(
        <Tokenizer
          label="Tags"
          searchSource={{search: () => [], bootstrap: () => []}}
          value={[{id: 'QA', label: 'QA'}]}
          onChange={() => {}}
          hasCreate
          minQueryLength={3}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'QA'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.queryByText('Create "QA"')).not.toBeInTheDocument();
    });

    it('offers Create on top of a full menu, not in place of a result', async () => {
      // The Create entry is appended after the results are cut to
      // `maxMenuItems`, so a full menu shows one more option rather than
      // dropping its last result to make room. Deliberate: creating is a
      // different capability from searching, and the cap exists to bound how
      // many *results* a menu shows.
      const many = Array.from({length: 20}, (_, i) => ({
        id: `qa-${i}`,
        label: `QA ${i}`,
      }));
      render(
        <Tokenizer
          label="Tags"
          searchSource={{search: () => many, bootstrap: () => []}}
          value={[]}
          onChange={() => {}}
          hasCreate
          maxMenuItems={3}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'QA'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // Queried off the document rather than by role: the popover renders
      // into a layer that jsdom keeps out of the accessibility tree, which is
      // why the tests around this one reach for text too.
      const options = document.querySelectorAll('[role="option"]');
      expect(options).toHaveLength(4);
      expect(options[3]).toHaveTextContent('Create "QA"');
    });

    it('shows a "Create" option when typing with hasCreate', async () => {
      render(
        <Tokenizer
          label="Tags"
          searchSource={emptySource}
          value={[]}
          onChange={() => {}}
          hasCreate
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'new-tag'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.queryByText('Create "new-tag"')).toBeInTheDocument();
    });

    it('fires onChange with type "create" when the Create item is clicked', async () => {
      const onChange = vi.fn();
      render(
        <Tokenizer
          label="Tags"
          searchSource={emptySource}
          value={[]}
          onChange={onChange}
          hasCreate
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'new-tag'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      const createOption = screen.getByText('Create "new-tag"');
      await act(async () => {
        fireEvent.click(createOption);
      });

      expect(onChange).toHaveBeenCalledWith(
        [{id: 'new-tag', label: 'new-tag'}],
        {item: {id: 'new-tag', label: 'new-tag'}, type: 'create'},
      );
    });

    it('does not show Create option for already-selected values', async () => {
      render(
        <Tokenizer
          label="Tags"
          searchSource={emptySource}
          value={[{id: 'existing', label: 'existing'}]}
          onChange={() => {}}
          hasCreate
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'existing'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.queryByText('Create "existing"')).not.toBeInTheDocument();
    });

    it('does not show Create option for an already-selected label whose id differs from it', async () => {
      // Real selections usually carry an opaque id (`u1` under the label
      // "Alice"). The duplicate check used to compare the typed text against
      // selected ids only, and the search results could not catch the match
      // because filteredSource had already removed the selected item — so
      // typing the label of an existing token offered "Create", which added a
      // duplicate token under a new id.
      const source: SearchSource = {
        search: (query: string) =>
          [{id: 'u1', label: 'Alice'}].filter(u =>
            u.label.toLowerCase().includes(query.toLowerCase()),
          ),
        bootstrap: () => [],
      };
      const onChange = vi.fn();
      render(
        <Tokenizer
          label="Tags"
          searchSource={source}
          value={[{id: 'u1', label: 'Alice'}]}
          onChange={onChange}
          hasCreate
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'Alice'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.queryByText('Create "Alice"')).not.toBeInTheDocument();
    });

    it('does not add a duplicate token when a stale Create entry is committed', async () => {
      // The guard in handleAdd must apply the same label check: a Create
      // entry rendered before the selection changed still commits through
      // here, and an opaque id must not let a same-label token through.
      const source: SearchSource = {
        search: (query: string) =>
          // A label that contains the query but is not exactly it, so the
          // Create entry for the query itself is legitimately offered.
          [{id: 'u2', label: 'Alice Smith'}].filter(u =>
            u.label.toLowerCase().includes(query.toLowerCase()),
          ),
        bootstrap: () => [],
      };
      const onChange = vi.fn();
      const {rerender} = render(
        <Tokenizer
          label="Tags"
          searchSource={source}
          value={[]}
          onChange={onChange}
          hasCreate
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'Alice'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });
      // The Create entry exists while the selection is empty...
      expect(screen.queryByText('Create "Alice"')).toBeInTheDocument();
      // ...then the selection gains Alice (under an opaque id) before the
      // entry is committed.
      rerender(
        <Tokenizer
          label="Tags"
          searchSource={source}
          value={[{id: 'u1', label: 'Alice'}]}
          onChange={onChange}
          hasCreate
          debounceMs={0}
        />,
      );
      fireEvent.click(screen.getByText('Create "Alice"'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not show Create option when hasCreate is false', async () => {
      render(
        <Tokenizer
          label="Tags"
          searchSource={emptySource}
          value={[]}
          onChange={() => {}}
          hasCreate={false}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'something'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.queryByText('Create "something"')).not.toBeInTheDocument();
    });

    it('appends Create option alongside real search results', async () => {
      const onChange = vi.fn();
      render(
        <Tokenizer
          label="Tags"
          searchSource={userSource}
          value={[]}
          onChange={onChange}
          hasCreate
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      // "Ali" matches Alice but "Ali" itself is a new value
      await act(async () => {
        fireEvent.change(input, {target: {value: 'Ali'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // Both the real result and the Create option should appear
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Create "Ali"')).toBeInTheDocument();
    });

    it('does not show Create when typed text exactly matches a result label', async () => {
      render(
        <Tokenizer
          label="Tags"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          hasCreate
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'Alice'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // "Alice" exactly matches a result — no Create option
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Create "Alice"')).not.toBeInTheDocument();
    });
  });

  describe('popover after selection', () => {
    it('does not show an empty popover after selecting an item with hasEntriesOnFocus', async () => {
      const onChange = vi.fn();
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={onChange}
          hasEntriesOnFocus
          debounceMs={0}
        />,
      );
      const input = screen.getByRole('combobox');

      // Focus to open bootstrap results
      fireEvent.focus(input);
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });
      expect(input).toHaveAttribute('aria-expanded', 'true');

      // Select an item
      fireEvent.click(screen.getByText('Alice'));
      expect(onChange).toHaveBeenCalled();

      // Popover should not reopen with an empty menu after selection
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('paste behavior', () => {
    it('pasting text triggers search results like typing', async () => {
      const user = userEvent.setup();
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.paste('Ali');
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('pasting text shows Create option with hasCreate', async () => {
      const user = userEvent.setup();
      render(
        <Tokenizer
          label="Tags"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          hasCreate
          debounceMs={0}
        />,
      );

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.paste('NewTag');
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.getByText('Create "NewTag"')).toBeInTheDocument();
    });
  });

  describe('startIcon', () => {
    it('does not render a start icon when omitted', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
        />,
      );
      expect(document.querySelector('svg')).not.toBeInTheDocument();
    });

    it('renders a ReactNode start icon before the tokens', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[{id: '1', label: 'Alice'}]}
          onChange={() => {}}
          startIcon={<TestIcon data-testid="start-icon" />}
        />,
      );
      const icon = screen.getByTestId('start-icon');
      const token = screen.getByText('Alice');
      expect(icon).toBeInTheDocument();
      expect(
        icon.compareDocumentPosition(token) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('renders an IconType (SVG component) start icon', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          startIcon={TestIcon}
        />,
      );
      expect(document.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('disabledMessage', () => {
    const h = {hidden: true} as const;
    const isOpen = (el: Element) => el.matches(':popover-open');

    function renderTokenizer(props?: {onChange?: () => void}) {
      return render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={props?.onChange ?? (() => {})}
          isDisabled
          disabledMessage="You need edit access to change members"
        />,
      );
    }

    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      renderTokenizer();
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent(
        'You need edit access to change members',
      );
      const wrapper = screen.getByRole('group', {name: 'Members'});
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => expect(isOpen(tooltip)).toBe(true));
      fireEvent.mouseLeave(wrapper);
      await waitFor(() => expect(isOpen(tooltip)).toBe(false));
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      renderTokenizer();
      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByRole('combobox')).toHaveFocus();
      await waitFor(() => expect(isOpen(tooltip)).toBe(true));
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          disabledMessage="You need edit access to change members"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the input focusable via aria-disabled when a reason is provided', () => {
      renderTokenizer();
      const input = screen.getByRole('combobox');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
    });

    it('links the reason tooltip via aria-describedby', () => {
      renderTokenizer();
      const input = screen.getByRole('combobox');
      const tooltip = screen.getByRole('tooltip', h);
      expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks typing, Backspace, and supplied token removal while disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0]]}
          onChange={onChange}
          isDisabled
          disabledMessage="Editing is unavailable"
          renderToken={(item, onRemove) => (
            <button type="button" onClick={onRemove}>
              Remove {item.label}
            </button>
          )}
        />,
      );
      await user.tab();
      await user.keyboard('Ali');
      expect(screen.getByRole('combobox')).toHaveValue('');
      await user.keyboard('{Backspace}');
      await user.click(screen.getByRole('button', {name: 'Remove Alice'}));
      expect(onChange).not.toHaveBeenCalled();
      expect(politeRegion()).toBeNull();
    });

    it('does not commit an open result after becoming disabled', async () => {
      const onChange = vi.fn();
      const props = {
        label: 'Members',
        searchSource: userSource,
        value: [],
        onChange,
        hasEntriesOnFocus: true,
        disabledMessage: 'Editing is unavailable',
      };
      const {rerender} = render(<Tokenizer {...props} />);
      fireEvent.focus(screen.getByRole('combobox'));
      const result = await screen.findByText('Alice');
      rerender(<Tokenizer {...props} isDisabled />);
      fireEvent.click(result);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps the input natively disabled when disabled without a reason', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });
  describe('announcements', () => {
    it('announces removal politely on Backspace with an empty input', async () => {
      const onChange = vi.fn();
      render(
        <InternationalizationProvider locale="fr" overrides={TOKEN_MESSAGES}>
          <Tokenizer
            label="Members"
            searchSource={userSource}
            value={[users[0], users[1]]}
            onChange={onChange}
          />
        </InternationalizationProvider>,
      );
      const input = screen.getByRole('combobox');
      fireEvent.keyDown(input, {key: 'Backspace'});
      expect(onChange).toHaveBeenCalledWith([users[0]], {
        item: users[1],
        type: 'remove',
      });
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Retiré : Bob');
      });
    });

    it("announces removal politely when clicking a token's remove button", async () => {
      render(
        <InternationalizationProvider locale="fr" overrides={TOKEN_MESSAGES}>
          <Tokenizer
            label="Members"
            searchSource={userSource}
            value={[users[0], users[1]]}
            onChange={() => {}}
          />
        </InternationalizationProvider>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Remove Alice'}));
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Retiré : Alice');
      });
    });

    it('announces addition politely when selecting a search result', async () => {
      render(
        <InternationalizationProvider locale="fr" overrides={TOKEN_MESSAGES}>
          <Tokenizer
            label="Members"
            searchSource={userSource}
            value={[]}
            onChange={() => {}}
            hasEntriesOnFocus
            debounceMs={0}
          />
        </InternationalizationProvider>,
      );
      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });
      fireEvent.click(screen.getByText('Alice'));
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Ajouté : Alice');
      });
    });

    it('announces addition politely when creating a token with hasCreate', async () => {
      const emptySource: SearchSource = {
        search: () => [],
        bootstrap: () => [],
      };
      render(
        <InternationalizationProvider locale="fr" overrides={TOKEN_MESSAGES}>
          <Tokenizer
            label="Tags"
            searchSource={emptySource}
            value={[]}
            onChange={() => {}}
            hasCreate
            debounceMs={0}
          />
        </InternationalizationProvider>,
      );
      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'new-tag'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });
      fireEvent.click(screen.getByText('Create "new-tag"'));
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Ajouté : new-tag');
      });
    });

    it('does not announce on mount', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0]]}
          onChange={() => {}}
        />,
      );
      // The live regions are created lazily on first announce, so a mount
      // with pre-selected tokens must not create (or speak through) one.
      expect(politeRegion()).toBeNull();
    });

    it('does not announce add/remove while typing', async () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          debounceMs={0}
        />,
      );
      const input = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(input, {target: {value: 'Ali'}});
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });
      // BaseTypeahead announces result counts while typing (existing
      // behavior); typing alone must not produce add/remove announcements.
      expect(politeRegion()?.textContent ?? '').not.toMatch(/Added|Removed/);
    });
  });

  describe('form participation', () => {
    it('submits one entry per token id under htmlName', () => {
      const {container} = render(
        <form>
          <Tokenizer
            label="Users"
            htmlName="users"
            searchSource={userSource}
            value={[users[0], users[1]]}
            onChange={() => {}}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.getAll('users')).toEqual([users[0].id, users[1].id]);
    });

    it('is excluded from form data when disabled', () => {
      const {container} = render(
        <form>
          <Tokenizer
            label="Users"
            htmlName="users"
            searchSource={userSource}
            value={[users[0]]}
            onChange={() => {}}
            isRequired
            isDisabled
          />
        </form>,
      );
      const form = container.querySelector('form')!;
      expect([...new FormData(form).keys()]).toEqual([]);
      expect(form.querySelector('input[type="hidden"]')).toBeNull();
      expect(form.checkValidity()).toBe(true);
    });
  });
});

describe('Tokenizer statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
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
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
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

describe('Tokenizer disabled theme state', () => {
  it('reflects disabled on the root target so themes can gate paint on it', () => {
    const {container} = render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        isDisabled
      />,
    );
    const root = container.querySelector('.astryx-tokenizer');
    expect(root).toHaveAttribute('data-disabled', 'disabled');
  });

  it('omits data-disabled when enabled, like status does', () => {
    const {container} = render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />,
    );
    const root = container.querySelector('.astryx-tokenizer');
    expect(root).not.toHaveAttribute('data-disabled');
  });
});

describe('Tokenizer end-lane reserve', () => {
  // Tokenizer keeps the measured lane that Typeahead no longer needs: its
  // lane stays pinned to the field's first row while tokens wrap below it,
  // so it has to be out of flow, and an out-of-flow box reserves nothing by
  // definition. jsdom performs no layout — it reports every width as 0 and
  // has no ResizeObserver — so these stub both, which is what makes the
  // mechanism, and the bug it had, reproducible in CI.
  class StubResizeObserver {
    static instances = 0;
    private readonly cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
      StubResizeObserver.instances++;
    }
    observe(target: Element) {
      this.cb(
        [
          {
            target,
            borderBoxSize: [{inlineSize: 24, blockSize: 20}],
            contentRect: {width: 24, height: 20},
          } as unknown as ResizeObserverEntry,
        ],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
  }

  // The lane's true, untransformed width. `offsetWidth` is what reports it.
  const LANE_LOCAL_WIDTH = 24;
  // What `getBoundingClientRect()` would report for that same lane inside a
  // `scale(.5)` subtree: viewport space, so half. Reading this instead is the
  // bug — the number is spent as padding, which is in local space.
  const LANE_VIEWPORT_WIDTH = 12;

  let originalRO: typeof ResizeObserver | undefined;
  beforeEach(() => {
    originalRO = globalThis.ResizeObserver;
    StubResizeObserver.instances = 0;
    globalThis.ResizeObserver = StubResizeObserver;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
      LANE_LOCAL_WIDTH,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: LANE_VIEWPORT_WIDTH,
      height: 20,
      top: 0,
      left: 0,
      right: LANE_VIEWPORT_WIDTH,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
  afterEach(() => {
    globalThis.ResizeObserver = originalRO as typeof ResizeObserver;
    vi.restoreAllMocks();
  });

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

  const laneHost = (container: HTMLElement) =>
    container.querySelector<HTMLElement>(
      '[style*="--_tokenizer-end-lane-reserve"]',
    );

  // The variable carries the whole reserve — the lane's inset plus its
  // measured width — so its ABSENCE means "no lane", not "a lane of zero
  // width". That distinction is what lets the input apply the padding rule
  // unconditionally and still keep its full content box when nothing is in
  // the lane.
  const reserveOf = (container: HTMLElement) =>
    laneHost(container)?.style.getPropertyValue(
      '--_tokenizer-end-lane-reserve',
    );

  it('reserves the lane\u2019s untransformed width, not its on-screen width', () => {
    // The regression. A CSS transform anywhere above the field scales what
    // `getBoundingClientRect()` reports but not what the padding means, so
    // the two must not be mixed: measured in Chromium under `scale(.5)` the
    // input reserved half what it needed and the live query ran under the
    // controls again (22.83px), and under `scale(2)` the caret sat in a
    // 202.69px gap. `offsetWidth` is the same number at every scale.
    const {container} = render(
      <Tokenizer
        label="Users"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
        hasClear
      />,
    );
    expect(reserveOf(container)).toBe(
      `calc(var(--spacing-2) + ${LANE_LOCAL_WIDTH}px)`,
    );
  });

  it('reserves the lane when the spinner is the only thing in it', () => {
    // Busy-only: no endContent and no clear button, so the lane exists for
    // the duration of the search and for nothing else. It still has width,
    // and the query still has to clear it.
    const {source} = pendingSource();
    const {container} = render(
      <Tokenizer
        label="Users"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        hasClear={false}
        debounceMs={0}
      />,
    );
    expect(laneHost(container)).toBeNull();

    act(() => {
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Al'}});
    });

    expect(getBusySpinner()).toBeInTheDocument();
    expect(reserveOf(container)).toBe(
      `calc(var(--spacing-2) + ${LANE_LOCAL_WIDTH}px)`,
    );
  });

  it('keeps token rows, not only the input, short of the lane', () => {
    // The lane is out of flow, so a token reaching the end of the first row
    // ran under the clear button. The field's own inline-end padding spends
    // the reserve, and every row of tokens wraps inside it. Real geometry is
    // proved in TokenizerEndLane.a11y.chromium.spec.ts.
    const {container} = render(
      <Tokenizer
        label="Users"
        searchSource={userSource}
        value={[users[0]]}
        onChange={() => {}}
        hasClear
      />,
    );
    const field = laneHost(container);
    expect(field).not.toBeNull();
    expect(getComputedStyle(field!).paddingInlineEnd).toContain(
      '--_tokenizer-end-lane-reserve',
    );
  });

  it('does not pad the input on the collapsed paths', () => {
    // Collapsed: with tokens truncated the input is given no width to pad —
    // `inputAtMax` zeroes its padding outright — so a reserve there would be
    // padding applied to a zero-width box, fighting the collapse. The lane
    // still publishes its width; what must not happen is the input claiming
    // the reserve class.
    const {container} = render(
      <Tokenizer
        label="Users"
        searchSource={userSource}
        value={[users[0], users[1], users[2]]}
        onChange={() => {}}
        tokenOverflowBehavior="unfocusedInline"
      />,
    );
    // The collapsed row keeps the Spinner's slot, so the lane is up and
    // publishing; the input still must not spend the reserve.
    expect(reserveOf(container)).toBeTruthy();
    const input = screen.getByRole('combobox');
    expect(getComputedStyle(input).paddingInlineEnd).not.toContain(
      '--_tokenizer-end-lane-reserve',
    );
  });

  it('costs no commit of its own across a whole search', async () => {
    // The measurement reaches CSS as a custom property written to the DOM,
    // never as state, so it cannot re-render the field. The two commits below
    // are the ones the search itself owes: the spinner arriving, and the
    // spinner leaving. Held in state, the measurement doubled that.
    const {source, settle} = pendingSource();
    const commits: string[] = [];
    render(
      <Profiler id="field" onRender={(_id, phase) => commits.push(phase)}>
        <Tokenizer
          label="Users"
          searchSource={source}
          value={[]}
          onChange={() => {}}
          debounceMs={0}
        />
      </Profiler>,
    );
    const input = screen.getByRole('combobox');
    commits.length = 0;

    await act(async () => {
      fireEvent.change(input, {target: {value: 'Al'}});
    });
    const afterStart = commits.length;

    await act(async () => {
      settle([]);
      await Promise.resolve();
    });

    expect(afterStart).toBe(1);
    expect(commits.length).toBe(2);
  });

  it('re-renders no token when a search starts or settles', async () => {
    // The regression this guards. The busy state has one owner — the base —
    // and the field only needs it to decide whether one Spinner is on screen.
    // Mirrored into the field's own state, every transition re-rendered the
    // whole field including every selected token: measured at six tokens,
    // 6 renders at search start and 6 more at settlement, and 20/40 at
    // twenty. A token contains no part of the indicator, so the correct
    // number is zero at any count.
    const {source, settle} = pendingSource();
    const selected = users.slice(0, 6);
    renderedTokens.length = 0;

    render(
      <Tokenizer
        label="Users"
        searchSource={source}
        value={selected}
        onChange={() => {}}
        hasClear
        debounceMs={0}
      />,
    );
    expect(new Set(renderedTokens).size).toBe(selected.length);
    renderedTokens.length = 0;

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Al'}});
    });
    // The indicator is up, so the transition really did happen. Scoped by
    // name: the announcer for result counts is a role="status" live region
    // too, and it is not the indicator.
    expect(getBusySpinner()).toBeInTheDocument();
    // ...and it cost no token a render.
    expect(renderedTokens).toEqual([]);

    await act(async () => {
      settle([]);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(queryBusySpinner()).not.toBeInTheDocument();
    });
    expect(renderedTokens).toEqual([]);
  });

  it('clears the busy spinner when a token is added while a bootstrap load is in flight', async () => {
    let settle: (items: SearchableItem[]) => void = () => {};
    const bootstrap = vi.fn(
      async () =>
        new Promise<SearchableItem[]>(resolve => {
          settle = resolve;
        }),
    );
    const source: SearchSource = {search: () => [], bootstrap};

    function Harness() {
      const [value, setValue] = useState<SearchableItem[]>([]);
      return (
        <>
          <Tokenizer
            label="Items"
            searchSource={source}
            value={value}
            onChange={setValue}
            hasEntriesOnFocus
          />
          <button type="button" onClick={() => setValue([users[0]])}>
            Add Token
          </button>
        </>
      );
    }

    render(<Harness />);
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    await waitFor(() => {
      expect(getBusySpinner()).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', {name: 'Add Token'}));

    await waitFor(() => {
      expect(queryBusySpinner()).not.toBeInTheDocument();
    });

    await act(async () => {
      settle([]);
      await Promise.resolve();
    });
    expect(queryBusySpinner()).not.toBeInTheDocument();
  });

  it('shares one observer across every field on the page', () => {
    // Browsers batch per observer instance, so one observer per lane meant N
    // callback dispatches a frame for N fields.
    render(
      <>
        <Tokenizer
          label="One"
          searchSource={userSource}
          value={[users[0]]}
          onChange={() => {}}
          hasClear
        />
        <Tokenizer
          label="Two"
          searchSource={userSource}
          value={[users[1]]}
          onChange={() => {}}
          hasClear
        />
        <Tokenizer
          label="Three"
          searchSource={userSource}
          value={[users[2]]}
          onChange={() => {}}
          hasClear
        />
      </>,
    );
    expect(StubResizeObserver.instances).toBeLessThanOrEqual(1);
  });

  it('takes the room back when the lane goes', async () => {
    const {source, settle} = pendingSource();
    const {container} = render(
      <Tokenizer
        label="Users"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        hasClear={false}
        debounceMs={0}
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Al'}});
    });
    expect(laneHost(container)).not.toBeNull();

    await act(async () => {
      settle([]);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(laneHost(container)).toBeNull();
    });
  });
});

// `emptySearchResultsText` was renamed to `emptySearchText` and widened from
// `string` to `ReactNode` (`spec:AST-056` FR1). The overlap ended in a minor
// release (`CLN-0001`–`CLN-0004`, `spec:AST-017` FR31): the old name is no
// longer part of the type and is no longer read.
describe('Tokenizer emptySearchText', () => {
  async function searchForNothing() {
    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'zzzzz'}});
  }

  it('renders an element, which the old string type could not express', async () => {
    render(
      <Tokenizer
        label="People"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        debounceMs={0}
        emptySearchText={
          <span>
            Nobody by that name. <a href="/invite">Invite them</a>
          </span>
        }
      />,
    );
    await searchForNothing();

    await waitFor(() => {
      expect(screen.getByText('Invite them')).toBeInTheDocument();
    });
  });

  it('announces what it rendered, not the catalog default', async () => {
    render(
      <Tokenizer
        label="People"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        debounceMs={0}
        emptySearchText={
          <span>
            Nobody by that name. <a href="/invite">Invite them</a>
          </span>
        }
      />,
    );
    await searchForNothing();

    await waitFor(() => {
      expect(
        document.querySelector('[data-astryx-live-region="polite"]'),
      ).toHaveTextContent('Nobody by that name. Invite them');
    });
  });

  it('leaves an aria-hidden decoration out of the announcement', async () => {
    render(
      <Tokenizer
        label="People"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        debounceMs={0}
        emptySearchText={
          <span>
            Nobody by that name<span aria-hidden="true"> →</span>
          </span>
        }
      />,
    );
    await searchForNothing();

    // The arrow is hidden from the accessibility tree on screen, so reading
    // it into the live region would announce something the sighted user is
    // not being shown either.
    await waitFor(() => {
      expect(
        document.querySelector('[data-astryx-live-region="polite"]'),
      ).toHaveTextContent('Nobody by that name');
    });
    expect(
      document.querySelector('[data-astryx-live-region="polite"]')?.textContent,
    ).not.toContain('→');
  });

  it('falls through to the default when null is the only value given', async () => {
    render(
      <Tokenizer
        label="People"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        debounceMs={0}
        emptySearchText={null}
      />,
    );
    await searchForNothing();

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });

  it('no longer reads the removed emptySearchResultsText (CLN-0001)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The unknown prop reaches the root element, which React reports.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Tokenizer
        label="People"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
        debounceMs={0}
        // @ts-expect-error -- removed in the minor release (CLN-0001)
        emptySearchResultsText="Nobody found"
      />,
    );
    await searchForNothing();

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
    expect(screen.queryByText('Nobody found')).not.toBeInTheDocument();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('is deprecated'),
    );
    warn.mockRestore();
    error.mockRestore();
  });
});

describe('Tokenizer consumer key handler order', () => {
  it('runs onKeyDown on the input after built-in key handling, so it cannot cancel token removal', () => {
    let currentTarget: EventTarget | null = null;
    const onKeyDown = vi.fn((event: React.KeyboardEvent) => {
      currentTarget = event.currentTarget;
      event.preventDefault();
    });
    const onChange = vi.fn();
    const {container} = render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0], users[1]]}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    );
    fireEvent.keyDown(screen.getByRole('combobox'), {key: 'Backspace'});
    expect(onChange).toHaveBeenCalledWith([users[0]], {
      item: users[1],
      type: 'remove',
    });
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(currentTarget).toBe(screen.getByRole('combobox'));
  });
});
