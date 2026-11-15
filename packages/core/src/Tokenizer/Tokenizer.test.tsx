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
import {createRef, Profiler, startTransition, useRef, useState} from 'react';
import userEvent from '@testing-library/user-event';
import {Tokenizer, type TokenizerHandle} from './Tokenizer';
import {Typeahead} from '../Typeahead/Typeahead';
import {TokenizerItemRemovableContext} from './TokenizerItemRemovableContext';
import {InputGroup} from '../InputGroup/InputGroup';
import {InputGroupText} from '../InputGroup/InputGroupText';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import type {SearchSource, SearchableItem} from '../Typeahead/types';
import {TestIcon} from '../__tests__/TestIcon';
import {InternationalizationProvider} from '../i18n';
import type * as TokenModule from '../Token';
import {Token} from '../Token/Token';
import {FormLayout} from '../FormLayout/FormLayout';

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

// A grouped row's token strip is a viewport of the shared scroll capability
// (AST-025), which marks the element with the axis it scrolls on.
function getTokenStrip(row: HTMLElement): HTMLElement {
  const strip = row.querySelector<HTMLElement>('[data-scroll-axis="inline"]');
  if (strip == null) {
    throw new Error('The grouped row has no scrolling token strip');
  }
  return strip;
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

// component:BaseTypeahead FR12 through Tokenizer: a press in the field keeps the list open.
describe('Tokenizer press inside and outside', () => {
  it('keeps the list open on a press in its input and closes it on a press elsewhere', async () => {
    render(
      <>
        <Tokenizer
          label="People"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          debounceMs={0}
        />
        <p>Elsewhere</p>
      </>,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, {target: {value: 'Ali'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    fireEvent.pointerDown(input);
    fireEvent.pointerUp(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(screen.getByText('Elsewhere'));
    fireEvent.pointerUp(screen.getByText('Elsewhere'));
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

describe('Tokenizer', () => {
  it('asks a touch keyboard for its Search key and no autocorrection, and Enter still adds the highlighted result', async () => {
    const onChange = vi.fn();
    render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[users[0]]}
        onChange={onChange}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('enterkeyhint', 'search');
    expect(input).toHaveAttribute('autocorrect', 'off');

    fireEvent.change(input, {target: {value: 'Bob'}});
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith(
      [users[0], expect.objectContaining({label: 'Bob'})],
      expect.objectContaining({type: 'add'}),
    );
  });

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

  // A touch keyboard rises when the field focuses its input during a tap. So
  // a finger that only removes a token with the keyboard down leaves focus
  // where it was. Every other removal keeps focusing the input.
  describe('focus after a removal', () => {
    beforeEach(() => {
      __resetInteractionModalityForTest();
    });

    // A mouse case runs under a fine primary pointer (no pointer media at
    // all counts as fine), asserted in the test's own context.
    function expectFinePrimaryPointer() {
      expect(window.matchMedia?.('(pointer: coarse)').matches ?? false).toBe(
        false,
      );
    }

    function renderPair(onChange = vi.fn()) {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={onChange}
        />,
      );
      return {
        input: screen.getByRole('combobox'),
        remove: screen.getByRole('button', {name: 'Remove Alice'}),
        onChange,
      };
    }

    it('leaves the input unfocused after a finger removes a token with the keyboard down', () => {
      const {input, remove, onChange} = renderPair();
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      fireEvent.click(remove);
      expect(onChange).toHaveBeenCalledWith([users[1]], {
        item: users[0],
        type: 'remove',
      });
      expect(input).not.toHaveFocus();
    });

    it('moves focus to the input after a pen removes a token, as a mouse removal does', () => {
      const {input, remove, onChange} = renderPair();
      fireEvent.pointerDown(remove, {pointerType: 'pen'});
      // A pen's press keeps its default, as a mouse's does.
      expect(fireEvent.mouseDown(remove)).toBe(true);
      act(() => remove.focus());
      fireEvent.click(remove);
      expect(onChange).toHaveBeenCalledWith([users[1]], {
        item: users[0],
        type: 'remove',
      });
      expect(input).toHaveFocus();
    });

    it('leaves the next tap alone after a finger press on a token’s × turns into a scroll', () => {
      const {input, remove} = renderPair();
      // The browser takes the press over for scrolling: no mouse events follow.
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      fireEvent.pointerCancel(remove, {pointerType: 'touch'});
      fireEvent.pointerDown(input, {pointerType: 'touch'});
      expect(fireEvent.mouseDown(input)).toBe(true);
    });

    it('leaves a pen’s press on a token’s × alone after a finger tap on the input', () => {
      const {input, remove} = renderPair();
      fireEvent.pointerDown(input, {pointerType: 'touch'});
      fireEvent.mouseDown(input);
      act(() => input.focus());
      act(() => input.blur());
      fireEvent.pointerDown(remove, {pointerType: 'pen'});
      expect(fireEvent.mouseDown(remove)).toBe(true);
    });

    it('focuses the input when a script activates another token’s × after a finger removal', async () => {
      const {input} = renderPair();
      const alice = screen.getByRole('button', {name: 'Remove Alice'});
      const bob = screen.getByRole('button', {name: 'Remove Bob'});
      fireEvent.pointerDown(alice, {pointerType: 'touch'});
      fireEvent.click(alice);
      // The tap's record ends with its click's task.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      act(() => bob.focus());
      fireEvent.click(bob, {detail: 0});
      expect(input).toHaveFocus();
    });

    it('leaves a mouse’s and a pen’s press on a token’s × alone after a finger press on a × turns into a scroll', () => {
      const {remove} = renderPair();
      const bob = screen.getByRole('button', {name: 'Remove Bob'});
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      fireEvent.pointerCancel(remove, {pointerType: 'touch'});
      fireEvent.pointerDown(bob, {pointerType: 'mouse'});
      expect(fireEvent.mouseDown(bob)).toBe(true);
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      fireEvent.pointerCancel(remove, {pointerType: 'touch'});
      fireEvent.pointerDown(bob, {pointerType: 'pen'});
      expect(fireEvent.mouseDown(bob)).toBe(true);
    });

    it('moves a script’s focus on a token’s × to the input after a finger press turns into a scroll', () => {
      const {input, remove} = renderPair();
      const bob = screen.getByRole('button', {name: 'Remove Bob'});
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      fireEvent.pointerCancel(remove, {pointerType: 'touch'});
      act(() => bob.focus());
      expect(input).toHaveFocus();
    });

    it('keeps the input focused after a finger removes a token while typing', () => {
      const {input, remove} = renderPair();
      act(() => input.focus());
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      // Chrome focuses the tapped button before the click.
      act(() => remove.focus());
      fireEvent.click(remove);
      expect(input).toHaveFocus();
    });

    it('keeps a finger tap on a token’s × from taking focus while the keyboard is down, so an unfocusedInline field stays collapsed', () => {
      const onChange = vi.fn();
      const onFocus = vi.fn();
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={onChange}
          onFocus={onFocus}
          tokenOverflowBehavior="unfocusedInline"
        />,
      );
      const remove = screen.getByRole('button', {name: 'Remove Alice'});
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      // The tap's compatibility mouse press has its default cancelled. That
      // default is Chrome focusing the pressed button, which would expand the
      // field and remount the button under the finger.
      expect(fireEvent.mouseDown(remove)).toBe(false);
      fireEvent.click(remove);
      expect(onChange).toHaveBeenCalledWith([users[1]], {
        item: users[0],
        type: 'remove',
      });
      expect(onFocus).not.toHaveBeenCalled();
      expect(screen.getByRole('combobox')).not.toHaveFocus();
    });

    it('leaves other controls in the field alone: an endContent button keeps its press and the redirect', () => {
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={vi.fn()}
          endContent={<button type="button">Filters</button>}
        />,
      );
      const input = screen.getByRole('combobox');
      const filters = screen.getByRole('button', {name: 'Filters'});
      fireEvent.pointerDown(filters, {pointerType: 'touch'});
      // Its press default (focusing it) is not cancelled…
      expect(fireEvent.mouseDown(filters)).toBe(true);
      // …and focus that lands on it moves on to the input, as before.
      act(() => filters.focus());
      expect(input).toHaveFocus();
    });

    it('still lets a mouse press, and a tap while typing, focus as before', () => {
      expectFinePrimaryPointer();
      const {input, remove} = renderPair();
      fireEvent.pointerDown(remove, {pointerType: 'mouse'});
      expect(fireEvent.mouseDown(remove)).toBe(true);
      act(() => input.focus());
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      expect(fireEvent.mouseDown(remove)).toBe(true);
    });

    it('moves focus to the input when the tapped × already held focus, as after Shift+Tab', async () => {
      const user = userEvent.setup();
      const onBlur = vi.fn();
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={vi.fn()}
          onBlur={onBlur}
        />,
      );
      const input = screen.getByRole('combobox');
      act(() => input.focus());
      await user.tab({shift: true});
      const remove = screen.getByRole('button', {name: 'Remove Bob'});
      expect(remove).toHaveFocus();
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      fireEvent.click(remove);
      expect(input).toHaveFocus();
      expect(onBlur).not.toHaveBeenCalled();
    });

    it('moves focus to the input when a finger removes a token whose own action held focus', async () => {
      const user = userEvent.setup();
      const onBlur = vi.fn();
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={vi.fn()}
          onBlur={onBlur}
          renderToken={(item, onRemove) => (
            <Token label={item.label} onClick={() => {}} onRemove={onRemove} />
          )}
        />,
      );
      const input = screen.getByRole('combobox');
      act(() => input.focus());
      await user.tab({shift: true});
      await user.tab({shift: true});
      const remove = screen.getByRole('button', {name: 'Remove Bob'});
      expect(remove).not.toHaveFocus();
      expect(remove.parentElement?.contains(document.activeElement)).toBe(true);
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      fireEvent.click(remove);
      expect(input).toHaveFocus();
      expect(onBlur).not.toHaveBeenCalled();
    });

    it('keeps the old refocus for a custom renderToken remove button: the removal focuses the input, with no blur', () => {
      const onBlur = vi.fn();
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={vi.fn()}
          onBlur={onBlur}
          renderToken={(item, onRemove) => (
            <span>
              {item.label}
              <button type="button" onClick={onRemove}>
                Drop {item.label}
              </button>
            </span>
          )}
        />,
      );
      const input = screen.getByRole('combobox');
      const drop = screen.getByRole('button', {name: 'Drop Alice'});
      fireEvent.pointerDown(drop, {pointerType: 'touch'});
      // Its press default stays, and the focus the press puts on it stays
      // there (Chrome focuses the pressed button).
      expect(fireEvent.mouseDown(drop)).toBe(true);
      act(() => drop.focus());
      expect(drop).toHaveFocus();
      // The removal moves focus to the input, as before.
      fireEvent.click(drop);
      expect(input).toHaveFocus();
      expect(onBlur).not.toHaveBeenCalled();
    });

    it('leaves focus on another control in the field when a finger removes a token with the keyboard down', () => {
      const onBlur = vi.fn();
      render(
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={vi.fn()}
          onBlur={onBlur}
          endContent={<button type="button">Filters</button>}
        />,
      );
      const input = screen.getByRole('combobox');
      const filters = screen.getByRole('button', {name: 'Filters'});
      // Keyboard focus resting on a control in the field (Tab from the input).
      act(() => input.focus());
      act(() => filters.focus());
      expect(filters).toHaveFocus();
      const remove = screen.getByRole('button', {name: 'Remove Alice'});
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      expect(fireEvent.mouseDown(remove)).toBe(false);
      fireEvent.click(remove);
      expect(filters).toHaveFocus();
      expect(onBlur).not.toHaveBeenCalled();
    });

    it('focuses the input after a mouse removes a token', () => {
      expectFinePrimaryPointer();
      const {input, remove} = renderPair();
      fireEvent.pointerDown(remove, {pointerType: 'mouse'});
      fireEvent.click(remove);
      expect(input).toHaveFocus();
    });

    it('focuses the input after a key press removes a token, even after an earlier touch', () => {
      const {input, remove} = renderPair();
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      fireEvent.keyDown(remove, {key: 'Enter'});
      fireEvent.click(remove, {detail: 0});
      expect(input).toHaveFocus();
    });

    it('does not pull focus onto the input when a finger focuses a remove button', () => {
      const {input, remove} = renderPair();
      fireEvent.pointerDown(remove, {pointerType: 'touch'});
      act(() => remove.focus());
      expect(remove).toHaveFocus();
      expect(input).not.toHaveFocus();
    });

    it('still moves keyboard focus that lands on a remove button to the input', () => {
      const {input, remove} = renderPair();
      fireEvent.keyDown(document.body, {key: 'Tab'});
      act(() => remove.focus());
      expect(input).toHaveFocus();
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
    // The input keeps its tab stop (spec:AST-085 FR1).
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
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

    it('labels the inline create row from the catalog, following the locale', async () => {
      const overrides = {
        de: {'@astryx.tokenizer.create': '„{value}“ erstellen'},
      };
      const {rerender} = render(
        <InternationalizationProvider locale="de" overrides={overrides}>
          <Tokenizer
            label="Obst"
            searchSource={emptySource}
            value={[]}
            onChange={() => {}}
            hasCreate
            debounceMs={0}
          />
        </InternationalizationProvider>,
      );
      await act(async () => {
        fireEvent.change(screen.getByRole('combobox'), {
          target: {value: 'Kiwi'},
        });
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });
      expect(screen.getByText('„Kiwi“ erstellen')).toBeInTheDocument();
      expect(screen.queryByText('Create "Kiwi"')).not.toBeInTheDocument();

      rerender(
        <InternationalizationProvider locale="en" overrides={overrides}>
          <Tokenizer
            label="Obst"
            searchSource={emptySource}
            value={[]}
            onChange={() => {}}
            hasCreate
            debounceMs={0}
          />
        </InternationalizationProvider>,
      );
      // The row is derived per query, so the next query takes the new locale.
      await act(async () => {
        fireEvent.change(screen.getByRole('combobox'), {
          target: {value: 'Kiwis'},
        });
      });
      expect(await screen.findByText('Create "Kiwis"')).toBeInTheDocument();
    });

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

      // Select an item. The caller does not commit it, so it stays eligible
      // (component:Tokenizer FR13) and the list keeps its choices.
      fireEvent.click(screen.getByText('Alice'));
      expect(onChange).toHaveBeenCalled();

      // The popover never shows an empty menu after selection.
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('option', {name: 'Alice', hidden: true}),
      ).toBeInTheDocument();
    });
  });

  // component:Tokenizer FR14, FR15, AR5: a pick from the focus list keeps the
  // input focused and the list open while another loaded choice remains.
  describe('focus list kept open after a pick', () => {
    const NO_MEMBERS: SearchableItem[] = [];
    function Members({
      initial = NO_MEMBERS,
      maxEntries,
      source,
    }: {
      initial?: SearchableItem[];
      maxEntries?: number;
      source: SearchSource;
    }) {
      const [value, setValue] = useState(initial);
      const [isDisabled, setIsDisabled] = useState(false);
      return (
        <>
          <Tokenizer
            label="Members"
            searchSource={source}
            value={value}
            onChange={setValue}
            hasEntriesOnFocus
            maxEntries={maxEntries}
            isDisabled={isDisabled}
            debounceMs={0}
          />
          <button type="button">Elsewhere</button>
          <button type="button" onClick={() => setIsDisabled(true)}>
            Disable
          </button>
        </>
      );
    }
    function countingSource() {
      const bootstrap = vi.fn(() => users.slice(0, 3));
      return {bootstrap, source: {search: userSource.search, bootstrap}};
    }
    const option = (name: string) =>
      screen.queryByRole('option', {name, hidden: true});
    function activeOptionName(input: HTMLElement): string | null {
      const id = input.getAttribute('aria-activedescendant');
      return id == null
        ? null
        : (document.getElementById(id)?.textContent ?? null);
    }
    async function openFocusList(user: ReturnType<typeof userEvent.setup>) {
      const input = screen.getByRole('combobox');
      await user.click(input);
      await waitFor(() => {
        expect(option('Charlie')).toBeInTheDocument();
      });
      return input;
    }

    it('keeps focus and the list after a pointer pick, makes the next choice active, and does not fetch again', async () => {
      const user = userEvent.setup();
      const {bootstrap, source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);
      expect(bootstrap).toHaveBeenCalledTimes(1);

      await user.click(option('Bob')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(
        screen.getByRole('button', {name: 'Remove Bob'}),
      ).toBeInTheDocument();
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(option('Bob')).not.toBeInTheDocument();
      expect(option('Alice')).toBeInTheDocument();
      expect(activeOptionName(input)).toBe('Charlie');
      expect(bootstrap).toHaveBeenCalledTimes(1);
    });

    it('keeps the list open through picks in a row by pointer, until no choice remains', async () => {
      const user = userEvent.setup();
      const {bootstrap, source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Alice')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(activeOptionName(input)).toBe('Bob');

      await user.click(option('Bob')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(activeOptionName(input)).toBe('Charlie');

      await user.click(option('Charlie')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      for (const name of ['Alice', 'Bob', 'Charlie']) {
        expect(
          screen.getByRole('button', {name: `Remove ${name}`}),
        ).toBeInTheDocument();
      }
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(bootstrap).toHaveBeenCalledTimes(1);
    });

    it('closes after Enter on typed results while the cleared query waits for its debounce', async () => {
      const user = userEvent.setup();
      function Debounced() {
        const [value, setValue] = useState<SearchableItem[]>([]);
        return (
          <Tokenizer
            label="Members"
            searchSource={userSource}
            value={value}
            onChange={setValue}
            hasEntriesOnFocus
            debounceMs={300}
          />
        );
      }
      render(<Debounced />);
      const input = await openFocusList(user);

      await user.type(input, 'i');
      await waitFor(() => {
        expect(option('Diana')).toBeInTheDocument();
      });
      // Clearing the text starts a focus-list reload that waits for the
      // debounce. Enter acts before it runs.
      await user.keyboard('{Backspace}{Enter}');
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });

      expect(input).toHaveAttribute('aria-expanded', 'false');

      await act(async () => {
        await new Promise(r => setTimeout(r, 400));
      });
      await user.keyboard('{ArrowDown}');
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
      expect(option('Bob')).toBeInTheDocument();
      expect(option('Diana')).not.toBeInTheDocument();
    });

    it('keeps the list open through picks in a row by keyboard', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      await user.keyboard('{Enter}');
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(activeOptionName(input)).toBe('Bob');

      await user.keyboard('{Enter}');
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(activeOptionName(input)).toBe('Charlie');

      await user.keyboard('{Enter}');
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(
        screen.getByRole('button', {name: 'Remove Charlie'}),
      ).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('keeps a choice the caller does not commit, and a later search still loads', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(
        <Tokenizer
          label="Members"
          searchSource={source}
          value={[]}
          onChange={() => {}}
          hasEntriesOnFocus
          debounceMs={0}
        />,
      );
      const input = await openFocusList(user);

      await user.click(option('Alice')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(option('Alice')).toBeInTheDocument();
      expect(activeOptionName(input)).toBe('Bob');

      await user.type(input, 'di');
      await waitFor(() => {
        expect(option('Diana')).toBeInTheDocument();
      });
      expect(option('Alice')).not.toBeInTheDocument();
    });

    it('keeps the list open when the caller commits each pick in a transition', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      function InTransition() {
        const [value, setValue] = useState<SearchableItem[]>([]);
        return (
          <Tokenizer
            label="Members"
            searchSource={source}
            value={value}
            onChange={items => startTransition(() => setValue(items))}
            hasEntriesOnFocus
            debounceMs={0}
          />
        );
      }
      render(<InTransition />);
      const input = await openFocusList(user);

      await user.click(option('Alice')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(
        screen.getByRole('button', {name: 'Remove Alice'}),
      ).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(option('Alice')).not.toBeInTheDocument();
      expect(activeOptionName(input)).toBe('Bob');

      await user.click(option('Bob')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(
        screen.getByRole('button', {name: 'Remove Bob'}),
      ).toBeInTheDocument();
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(activeOptionName(input)).toBe('Charlie');
    });

    it('makes the next choice active after a keyboard pick', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      // The first choice is active when the list opens.
      expect(activeOptionName(input)).toBe('Alice');
      await user.keyboard('{ArrowDown}');
      expect(activeOptionName(input)).toBe('Bob');
      await user.keyboard('{Enter}');
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(
        screen.getByRole('button', {name: 'Remove Bob'}),
      ).toBeInTheDocument();
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(activeOptionName(input)).toBe('Charlie');
    });

    it('makes the nearest preceding choice active when the last one is picked', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Charlie')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(activeOptionName(input)).toBe('Bob');
    });

    it('closes and clears the active option when no loaded choice remains', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members initial={[users[0], users[1]]} source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Charlie')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).not.toHaveAttribute('aria-activedescendant');
    });

    it('closes when the pick reaches maxEntries', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members initial={[users[0]]} maxEntries={2} source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Bob')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).not.toHaveAttribute('aria-activedescendant');
    });

    it('still closes after a pick from typed search results', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'ali');
      await waitFor(() => {
        expect(option('Alice')).toBeInTheDocument();
      });

      await user.click(option('Alice')!);
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('lets a press on another control take focus after a pointer pick', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Alice')!);
      await user.click(screen.getByRole('button', {name: 'Elsewhere'}));
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.getByRole('button', {name: 'Elsewhere'})).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).not.toHaveAttribute('aria-activedescendant');
    });

    it('lets a press on the page take focus from the field after a pointer pick', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Alice')!);
      expect(input).toHaveFocus();
      await user.click(document.body);
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(input).not.toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes on Escape after a pick, keeping focus in the field', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Alice')!);
      await user.keyboard('{Escape}');

      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).not.toHaveAttribute('aria-activedescendant');
    });

    it('closes when the field becomes disabled after a pick', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Alice')!);
      expect(input).toHaveAttribute('aria-expanded', 'true');
      act(() => {
        screen.getByRole('button', {name: 'Disable'}).click();
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).not.toHaveAttribute('aria-activedescendant');
    });

    it('cancels the source once when the field becomes disabled, not on each later render', async () => {
      const cancel = vi.fn();
      const source: SearchSource = {...userSource, cancel};
      function Parent() {
        const [renders, setRenders] = useState(0);
        return (
          <>
            <Tokenizer
              label="Members"
              searchSource={source}
              value={[]}
              onChange={() => {}}
              hasEntriesOnFocus
              isDisabled
            />
            <button type="button" onClick={() => setRenders(renders + 1)}>
              Rerender {renders}
            </button>
          </>
        );
      }
      render(<Parent />);
      const before = cancel.mock.calls.length;
      for (let i = 0; i < 5; i++) {
        act(() => {
          screen.getByRole('button', {name: /Rerender/}).click();
        });
      }
      expect(cancel.mock.calls.length).toBe(before);
    });

    it('leaves a single-select field inside its dialog menu closing after a pick', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      function WithDialogMenu() {
        const handleRef = useRef<TokenizerHandle>(null);
        const [inner, setInner] = useState<SearchableItem | null>(null);
        return (
          <>
            <button type="button" onClick={() => handleRef.current?.open()}>
              Open menu
            </button>
            <Tokenizer
              label="Members"
              searchSource={source}
              value={[]}
              onChange={() => {}}
              hasEntriesOnFocus
              handleRef={handleRef}
              menu={{
                role: 'dialog',
                label: 'Pick a lead',
                render: () => (
                  <Typeahead
                    label="Lead"
                    searchSource={source}
                    value={inner}
                    onChange={setInner}
                    hasEntriesOnFocus
                    debounceMs={0}
                  />
                ),
              }}
            />
          </>
        );
      }
      render(<WithDialogMenu />);
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      const lead = await screen.findByRole('combobox', {
        name: 'Lead',
        hidden: true,
      });
      await user.click(lead);
      await waitFor(() => {
        expect(lead).toHaveAttribute('aria-expanded', 'true');
      });

      await user.click(
        screen.getAllByRole('option', {name: 'Bob', hidden: true}).at(-1)!,
      );
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });

      expect(lead).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes when focus leaves by Tab after a pick', async () => {
      const user = userEvent.setup();
      const {source} = countingSource();
      render(<Members source={source} />);
      const input = await openFocusList(user);

      await user.click(option('Alice')!);
      await user.tab();
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(input).not.toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
  });

  // After the tokens change, the list the field shows is the current one
  // (spec:AST-092 FR4; component:Tokenizer FR13, FR15). Each row is one
  // situation from the state table in the pull request: the list open or
  // closed, a focus list or typed text, a typed search waiting for its
  // debounce, a reload that is slow or fails, a token added or removed from
  // inside or outside, and the limit.
  describe('list after the tokens change', () => {
    const slowSource: SearchSource = {
      search: async query =>
        users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
      bootstrap: async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return users.slice(0, 3);
      },
    };
    function failsOnReload(): SearchSource {
      let calls = 0;
      return {
        search: userSource.search,
        bootstrap: async () => {
          calls += 1;
          if (calls > 1) {
            throw new Error('offline');
          }
          return users.slice(0, 3);
        },
      };
    }

    function Controlled({
      initial,
      maxEntries,
      source = userSource,
    }: {
      initial: SearchableItem[];
      maxEntries?: number;
      source?: SearchSource;
    }) {
      const [value, setValue] = useState(initial);
      return (
        <>
          <Tokenizer
            label="Members"
            searchSource={source}
            value={value}
            onChange={setValue}
            hasEntriesOnFocus
            maxEntries={maxEntries}
          />
          <button type="button" onClick={() => setValue([users[2]])}>
            Set Charlie
          </button>
          <button type="button" onClick={() => setValue([users[0]])}>
            Set Alice
          </button>
          <button
            type="button"
            onClick={() => setValue([users[0], users[1], users[2]])}>
            Set all three
          </button>
        </>
      );
    }

    // Steps: `open` (click the field and wait for its list), `type:<text>`
    // (type without waiting for the debounce), `listed:<name>` (wait until
    // listed), `noResults` (wait for the empty-search message), `escape`,
    // `set:<button>` (a value set from outside, focus stays in the field),
    // `remove:<name>` (the token's remove button), `pick:<name>` (choose an
    // option), `absent:<name>` (not listed right now).
    type Row = {
      situation: string;
      initial: SearchableItem[];
      maxEntries?: number;
      source?: () => SearchSource;
      steps: string[];
      expanded?: boolean;
      listed?: string[];
      notListed?: string[];
    };
    const rows: Row[] = [
      {
        situation:
          'focus list open, outside adds a token, choices remain: reload',
        initial: [users[0]],
        steps: ['open', 'listed:Charlie', 'set:Set Charlie', 'listed:Alice'],
        expanded: true,
        listed: ['Alice', 'Bob'],
        notListed: ['Charlie'],
      },
      {
        situation: 'focus list open, outside commits its last row: close',
        initial: [users[0], users[1]],
        steps: ['open', 'listed:Charlie', 'set:Set all three'],
        expanded: false,
      },
      {
        situation: 'focus list open, token removed with its button: reload',
        initial: [users[0], users[1]],
        steps: ['open', 'escape', 'remove:Alice', 'listed:Alice'],
        expanded: true,
        listed: ['Alice', 'Charlie'],
      },
      {
        situation: 'focus list closed, outside change: stays closed',
        initial: [users[0]],
        steps: ['open', 'escape', 'set:Set Charlie'],
        expanded: false,
      },
      {
        // Whether a pick keeps the list open is FR14's, not this table's.
        situation: 'token picked from the list (inside add): not offered again',
        initial: [users[0]],
        steps: ['open', 'listed:Charlie', 'pick:Charlie'],
        notListed: ['Charlie'],
      },
      {
        situation: 'focus list open, slow reload: new token never listed',
        initial: [users[0]],
        source: () => slowSource,
        steps: [
          'open',
          'listed:Charlie',
          'set:Set Charlie',
          'absent:Charlie',
          'listed:Alice',
        ],
        expanded: true,
        notListed: ['Charlie'],
      },
      {
        situation: 'focus list open, reload fails: close',
        initial: [users[0]],
        source: failsOnReload,
        steps: ['open', 'listed:Charlie', 'set:Set Charlie'],
        expanded: false,
      },
      {
        situation: 'typed text, limit reached from outside: close',
        initial: [users[0]],
        maxEntries: 3,
        steps: ['type:i', 'listed:Diana', 'set:Set all three'],
        expanded: false,
      },
      {
        situation: 'typed text matched only a token, token removed: re-search',
        initial: [users[0], users[1]],
        steps: ['type:ali', 'noResults', 'set:Set Charlie', 'listed:Alice'],
        expanded: true,
        listed: ['Alice'],
      },
      {
        situation:
          'typed text, tokens return to a set that once emptied the list: re-search',
        initial: [users[0], users[1]],
        steps: [
          'open',
          'listed:Charlie',
          'set:Set all three',
          'set:Set Alice',
          'type:i',
          'listed:Diana',
          'set:Set all three',
          'listed:Diana',
        ],
        expanded: true,
        listed: ['Diana'],
        notListed: ['Charlie'],
      },
      {
        situation:
          'typed search waiting for its debounce, outside commit: re-search',
        initial: [users[0]],
        steps: ['type:char', 'set:Set Charlie', 'absent:Charlie'],
        expanded: true,
        notListed: ['Charlie'],
      },
      {
        situation:
          'typed search waiting for its debounce, commit empties the shown rows: re-search',
        initial: [users[0], users[1]],
        steps: [
          'open',
          'listed:Charlie',
          'type:d',
          'set:Set all three',
          'listed:Diana',
        ],
        expanded: true,
        listed: ['Diana'],
      },
    ];

    it.each(rows)('$situation', async row => {
      const user = userEvent.setup();
      render(
        <Controlled
          initial={row.initial}
          maxEntries={row.maxEntries}
          source={row.source?.()}
        />,
      );
      const input = screen.getByRole('combobox');
      const option = (name: string) =>
        screen.queryByRole('option', {name, hidden: true});
      for (const step of row.steps) {
        const [action, arg = ''] = step.split(/:(.*)/s);
        if (action === 'open') {
          await user.click(input);
          await waitFor(() => {
            expect(input).toHaveAttribute('aria-expanded', 'true');
          });
        } else if (action === 'type') {
          await user.type(input, arg);
        } else if (action === 'listed') {
          await waitFor(() => {
            expect(option(arg)).toBeInTheDocument();
          });
        } else if (action === 'noResults') {
          await waitFor(() => {
            expect(screen.getByText('No results found')).toBeInTheDocument();
          });
        } else if (action === 'escape') {
          await user.keyboard('{Escape}');
        } else if (action === 'set') {
          act(() => {
            screen.getByRole('button', {name: arg}).click();
          });
        } else if (action === 'remove') {
          await user.click(screen.getByRole('button', {name: `Remove ${arg}`}));
        } else if (action === 'pick') {
          await user.click(
            screen.getByRole('option', {name: arg, hidden: true}),
          );
        } else if (action === 'absent') {
          expect(option(arg)).not.toBeInTheDocument();
        } else {
          throw new Error(`Unknown step: ${step}`);
        }
      }
      // Let any reload or debounced search settle.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      });

      if (row.expanded != null) {
        expect(input).toHaveAttribute(
          'aria-expanded',
          row.expanded ? 'true' : 'false',
        );
      }
      for (const name of row.listed ?? []) {
        expect(option(name)).toBeInTheDocument();
      }
      for (const name of row.notListed ?? []) {
        expect(option(name)).not.toBeInTheDocument();
      }
    });

    it('never shows a value set from outside while an async reload is pending', async () => {
      const user = userEvent.setup();
      // Whether each commit after the change painted Charlie as a choice.
      const commitsListingCharlie: boolean[] = [];
      let isWatching = false;
      render(
        <Profiler
          id="tokenizer"
          onRender={() => {
            if (isWatching) {
              commitsListingCharlie.push(
                Array.from(document.querySelectorAll('[role="option"]')).some(
                  option => option.textContent?.includes('Charlie'),
                ),
              );
            }
          }}>
          <Controlled initial={[users[0]]} source={slowSource} />
        </Profiler>,
      );
      const input = screen.getByRole('combobox');

      await user.click(input);
      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Charlie', hidden: true}),
        ).toBeInTheDocument();
      });
      isWatching = true;
      act(() => {
        screen.getByRole('button', {name: 'Set Charlie'}).click();
      });
      isWatching = false;

      // No commit, not even the one that adds the token, lists Charlie.
      expect(commitsListingCharlie.length).toBeGreaterThan(0);
      expect(commitsListingCharlie).not.toContain(true);
      expect(
        screen.queryByRole('option', {name: 'Charlie', hidden: true}),
      ).not.toBeInTheDocument();
      expect(input).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => {
        expect(
          screen.getByRole('option', {name: 'Alice', hidden: true}),
        ).toBeInTheDocument();
      });
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

    it("keeps the input's tab stop when disabled without a reason", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <>
          <button type="button">Before</button>
          <Tokenizer
            label="Members"
            searchSource={userSource}
            value={[]}
            onChange={onChange}
            isDisabled
          />
        </>,
      );
      const input = screen.getByRole('combobox');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
      screen.getByRole('button', {name: 'Before'}).focus();
      await user.tab();
      expect(input).toHaveFocus();
      await user.keyboard('Ali{Enter}');
      expect(input).toHaveValue('');
      expect(onChange).not.toHaveBeenCalled();
    });
  });
  describe('announcements', () => {
    it("announces Clear all politely, in the sheet's words", async () => {
      const onChange = vi.fn();
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{
            fr: {'@astryx.tokenizer.allRemoved': 'Tout a été retiré'},
          }}>
          <Tokenizer
            label="Members"
            searchSource={userSource}
            value={[users[0], users[1]]}
            onChange={onChange}
            hasClear
          />
        </InternationalizationProvider>,
      );
      fireEvent.click(screen.getByRole('button', {name: /clear/i}));
      expect(onChange).toHaveBeenCalledWith(
        [],
        expect.objectContaining({type: 'remove'}),
      );
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Tout a été retiré');
      });
    });

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

  describe('InputGroup', () => {
    it('uses group ARIA and skips standalone Field chrome when grouped', () => {
      render(
        <InputGroup
          label="Recipients"
          description="Who receives the digest"
          status={{type: 'error', message: 'Pick at least one person'}}>
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            searchSource={userSource}
            value={[]}
            onChange={() => {}}
          />
        </InputGroup>,
      );

      const group = screen.getByRole('group', {name: 'Recipients'});
      const input = screen.getByRole('combobox', {name: 'Recipients People'});

      // The group owns the only Field chrome — the Tokenizer must not render a
      // second Field wrapper or a duplicate label inside the group.
      expect(document.querySelectorAll('.astryx-field')).toHaveLength(1);
      expect(document.querySelectorAll('.astryx-field-label')).toHaveLength(1);
      expect(screen.getByText('People')).not.toHaveClass('astryx-field-label');

      const labelledByIDs =
        input.getAttribute('aria-labelledby')?.split(' ') ?? [];
      expect(labelledByIDs).toHaveLength(2);
      expect(labelledByIDs[0]).toBe(group.getAttribute('aria-labelledby'));
      expect(document.getElementById(labelledByIDs[1])).toHaveTextContent(
        'People',
      );
      expect(input).not.toHaveAttribute('aria-label');
      expect(input).toHaveAttribute(
        'aria-describedby',
        group.getAttribute('aria-describedby'),
      );
      expect(screen.getByText('Pick at least one person')).toBeInTheDocument();
    });

    it('composes the group described-by with the disabled reason instead of clobbering it', () => {
      render(
        <InputGroup label="Recipients" description="Who receives the digest">
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            searchSource={userSource}
            value={[]}
            onChange={() => {}}
            isDisabled
            disabledMessage="You need edit access to change recipients"
          />
        </InputGroup>,
      );

      const group = screen.getByRole('group', {name: 'Recipients'});
      const input = screen.getByRole('combobox', {name: 'Recipients People'});
      const tooltip = screen.getByRole('tooltip', {hidden: true});
      const describedByIDs =
        input.getAttribute('aria-describedby')?.split(' ') ?? [];

      // Both the group's description and the input-local disabled reason are
      // present — neither one replaces the other.
      expect(describedByIDs).toContain(group.getAttribute('aria-describedby'));
      expect(describedByIDs).toContain(tooltip.id);
      expect(describedByIDs).toHaveLength(2);
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
    });

    it('keeps token removal working inside a group', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <InputGroup label="Recipients">
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            searchSource={userSource}
            value={[users[0]]}
            onChange={onChange}
          />
        </InputGroup>,
      );

      await user.click(screen.getByRole('button', {name: /remove alice/i}));
      expect(onChange).toHaveBeenCalledWith([], {
        item: users[0],
        type: 'remove',
      });
    });

    it('takes the group size over an explicit mismatched size', () => {
      render(
        <InputGroup label="Recipients" size="sm">
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            size="lg"
            searchSource={userSource}
            value={[users[0]]}
            onChange={() => {}}
          />
        </InputGroup>,
      );

      // The group row has a fixed `sm` height; an `lg` control or token would
      // escape it, so the group's size governs the whole grouped Tokenizer.
      expect(screen.getByRole('group', {name: 'People'})).toHaveAttribute(
        'data-size',
        'sm',
      );
      expect(document.querySelector('.astryx-token')).toHaveAttribute(
        'data-size',
        'sm',
      );
    });

    it('keeps an explicit size outside a group', () => {
      render(
        <Tokenizer
          label="People"
          size="lg"
          searchSource={userSource}
          value={[users[0]]}
          onChange={() => {}}
        />,
      );

      expect(screen.getByRole('group', {name: 'People'})).toHaveAttribute(
        'data-size',
        'lg',
      );
      expect(document.querySelector('.astryx-token')).toHaveAttribute(
        'data-size',
        'lg',
      );
    });

    it.each(['none', 'unfocusedLayer'] as const)(
      'drops local description and status in favor of the group (tokenOverflowBehavior=%s)',
      tokenOverflowBehavior => {
        const renderGrouped = (local: {
          description?: string;
          status?: {type: 'warning'; message: string};
        }) =>
          render(
            <InputGroup
              label="Recipients"
              description="Who receives the digest"
              status={{type: 'error', message: 'Pick at least one person'}}>
              <InputGroupText>To</InputGroupText>
              <Tokenizer
                label="People"
                isLabelHidden
                searchSource={userSource}
                value={[users[0]]}
                onChange={() => {}}
                tokenOverflowBehavior={tokenOverflowBehavior}
                {...local}
              />
            </InputGroup>,
          );
        const tokenizerClasses = () =>
          Array.from(
            document.querySelectorAll('.astryx-tokenizer'),
            el => el.className,
          );

        const {unmount} = renderGrouped({});
        const classesWithoutLocal = tokenizerClasses();
        unmount();

        renderGrouped({
          description: 'Local help',
          status: {type: 'warning', message: 'Local warning'},
        });

        const group = screen.getByRole('group', {name: 'Recipients'});
        const input = screen.getByRole('combobox', {
          name: 'Recipients People',
          hidden: true,
        });
        const describedByIDs =
          input.getAttribute('aria-describedby')?.split(' ') ?? [];

        // No Field renders the local text inside a group, so referencing it
        // would leave dangling IDs — the group's text is the description.
        expect(input).toHaveAttribute(
          'aria-describedby',
          group.getAttribute('aria-describedby'),
        );
        for (const id of describedByIDs) {
          expect(document.getElementById(id)).not.toBeNull();
        }
        expect(screen.queryByText('Local help')).not.toBeInTheDocument();
        expect(screen.queryByText('Local warning')).not.toBeInTheDocument();

        // The local warning must not paint beside the group's error: every
        // tokenizer surface (row, layer placeholder, layer content) renders
        // exactly as it does without a local status.
        for (const el of document.querySelectorAll('.astryx-tokenizer')) {
          expect(el).not.toHaveAttribute('data-status');
        }
        expect(tokenizerClasses()).toEqual(classesWithoutLocal);
      },
    );

    it('keeps the disabled reason while dropping local metadata in a group', () => {
      render(
        <InputGroup
          label="Recipients"
          description="Who receives the digest"
          status={{type: 'error', message: 'Pick at least one person'}}>
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            description="Local help"
            status={{type: 'warning', message: 'Local warning'}}
            searchSource={userSource}
            value={[]}
            onChange={() => {}}
            isDisabled
            disabledMessage="You need edit access to change recipients"
          />
        </InputGroup>,
      );

      const group = screen.getByRole('group', {name: 'Recipients'});
      const input = screen.getByRole('combobox', {name: 'Recipients People'});
      const tooltip = screen.getByRole('tooltip', {hidden: true});

      expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual([
        ...(group.getAttribute('aria-describedby')?.split(' ') ?? []),
        tooltip.id,
      ]);
    });

    it('joins a caller aria-labelledby with the group naming in a group', () => {
      render(
        <>
          <span id="digest-heading">Weekly digest</span>
          <InputGroup label="Recipients">
            <InputGroupText>To</InputGroupText>
            <Tokenizer
              label="People"
              isLabelHidden
              aria-labelledby="digest-heading"
              searchSource={userSource}
              value={[]}
              onChange={() => {}}
            />
          </InputGroup>
        </>,
      );

      expect(
        screen.getByRole('combobox', {name: 'Recipients People Weekly digest'}),
      ).toBeInTheDocument();
    });

    it('does not mark the input invalid from a local status the group drops', () => {
      render(
        <InputGroup label="Recipients">
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            status={{type: 'error', message: 'Local error'}}
            searchSource={userSource}
            value={[]}
            onChange={() => {}}
          />
        </InputGroup>,
      );

      const input = screen.getByRole('combobox', {name: 'Recipients People'});
      expect(input).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByText('Local error')).not.toBeInTheDocument();
    });

    it('forwards the ref and DOM props to the combobox input in a group', () => {
      const ref = vi.fn();
      const renderGrouped = () => (
        <InputGroup label="Recipients">
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            ref={ref}
            data-testid="people"
            label="People"
            isLabelHidden
            searchSource={userSource}
            value={[users[0]]}
            onChange={() => {}}
          />
        </InputGroup>
      );
      const {rerender} = render(renderGrouped());
      const input = screen.getByRole('combobox', {name: 'Recipients People'});

      // Grouped or not, base props reach the primary semantic control — never
      // the grouped row (family:input-fields FR10).
      expect(ref).toHaveBeenLastCalledWith(input);
      expect(screen.getByTestId('people')).toBe(input);

      // A ref merged during render is a new callback every render, so React
      // detaches and re-attaches it on each update.
      ref.mockClear();
      rerender(renderGrouped());
      expect(ref).not.toHaveBeenCalled();
    });

    it('keeps end controls outside the scrolling token row in a group', () => {
      render(
        <InputGroup label="Recipients">
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            searchSource={userSource}
            value={[users[0], users[1]]}
            onChange={() => {}}
            hasClear
            endContent={<span>2 selected</span>}
          />
        </InputGroup>,
      );

      const row = screen.getByRole('group', {name: 'People'});
      const input = screen.getByRole('combobox', {name: 'Recipients People'});
      const clearButton = screen.getByRole('button', {name: 'Clear all'});
      const track = getTokenStrip(row);

      // Tokens and the input share one track inside the row: the part that
      // scrolls. jsdom has no layout, so the rendered half of this contract is
      // the play function of the WithTokenizerOverflowEndControls story.
      expect(track.parentElement).toBe(row);
      expect(track).toContainElement(input);
      const tokens = row.querySelectorAll<HTMLElement>('.astryx-token');
      expect(tokens).toHaveLength(2);
      for (const token of tokens) {
        expect(track).toContainElement(token);
      }

      // The end controls are the track's siblings, so they can neither scroll
      // with the tokens nor sit over them.
      expect(row).toContainElement(clearButton);
      expect(track).not.toContainElement(clearButton);
      expect(track).not.toContainElement(screen.getByText('2 selected'));
    });

    it('leaves the keyboard path to the remove buttons when enabled in a group', () => {
      render(
        <InputGroup label="Recipients">
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            searchSource={userSource}
            value={[users[0], users[1]]}
            onChange={() => {}}
          />
        </InputGroup>,
      );

      // Every token keeps a native remove button in the Tab order: entering the
      // field lands on its input, and Shift+Tab walks back through the tokens,
      // scrolling each into view. So the strip adds no stop of its own
      // (AST-025 FR12: an existing focusable path reaches all the overflow).
      const row = screen.getByRole('group', {name: 'People'});
      const strip = getTokenStrip(row);
      expect(strip).not.toHaveAttribute('role');
      expect(strip).not.toHaveAttribute('aria-label');
      expect(strip).not.toHaveAttribute('tabindex');
      for (const label of ['Remove Alice', 'Remove Bob']) {
        expect(strip).toContainElement(
          screen.getByRole('button', {name: label}),
        );
      }
    });

    it('reveals the whole token when keyboard focus reaches its remove button in a group', async () => {
      // jsdom has no scrollIntoView; record the calls instead.
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        const user = userEvent.setup();
        render(
          <InputGroup label="Recipients">
            <InputGroupText>To</InputGroupText>
            <Tokenizer
              label="People"
              isLabelHidden
              searchSource={userSource}
              value={[users[0], users[1]]}
              onChange={() => {}}
            />
          </InputGroup>,
        );
        act(() => {
          screen.getByRole('combobox', {name: 'Recipients People'}).focus();
        });
        // The keyboard path to a token: back from the input.
        await user.tab({shift: true});
        const removeBob = screen.getByRole('button', {name: 'Remove Bob'});
        expect(removeBob).toHaveFocus();

        // Browsers scroll a focused control into view only as far as the
        // control, which can leave the token's label cut off or under a fade.
        // The scroll padding the token is revealed against is the fade width.
        expect(scrollIntoView).toHaveBeenLastCalledWith({
          block: 'nearest',
          inline: 'nearest',
        });
        expect(scrollIntoView.mock.contexts.at(-1)).toBe(
          removeBob.closest('.astryx-token'),
        );
      } finally {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    });

    it('names the strip as the keyboard path when disabled in a group', () => {
      render(
        <InputGroup label="Recipients">
          <InputGroupText>To</InputGroupText>
          <Tokenizer
            label="People"
            isLabelHidden
            searchSource={userSource}
            value={[users[0], users[1]]}
            onChange={() => {}}
            isDisabled
          />
        </InputGroup>,
      );

      // A disabled field has no remove buttons and no focusable input, so the
      // strip itself is how a keyboard reaches tokens scrolled out of view.
      expect(screen.queryAllByRole('button', {name: /^Remove /})).toHaveLength(
        0,
      );
      // The strip carries the Tokenizer's own name, as the field does.
      const [field] = screen.getAllByRole('group', {name: 'People'});
      const strip = getTokenStrip(field);
      expect(strip).toHaveAttribute('role', 'group');
      expect(strip).toHaveAccessibleName('People');
      // It joins the Tab order only while it overflows. jsdom has no layout, so
      // that half is browser evidence: TokenizerGroupScroll.a11y.browser.spec.ts.
      expect(strip).not.toHaveAttribute('tabindex');
    });

    it('keeps tokens and the input as direct children of the field outside a group', () => {
      render(
        <Tokenizer
          label="People"
          searchSource={userSource}
          value={[users[0]]}
          onChange={() => {}}
          hasClear
        />,
      );

      const row = screen.getByRole('group', {name: 'People'});
      expect(screen.getByRole('combobox').parentElement).toBe(row);
      expect(document.querySelector('.astryx-token')?.parentElement).toBe(row);
    });
  });
});

describe('Tokenizer search cancellation', () => {
  // A source that records each call and answers only when the test says so.
  function pendingSource() {
    const events: string[] = [];
    const answers = new Map<string, (items: SearchableItem[]) => void>();
    const source: SearchSource = {
      search: async query => {
        events.push(`search:${query}`);
        return new Promise(resolve => answers.set(query, resolve));
      },
      bootstrap: () => [],
      cancel: () => {
        events.push('cancel');
      },
    };
    return {events, answers, source};
  }

  async function type(input: HTMLElement, value: string) {
    fireEvent.change(input, {target: {value}});
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
  }

  it('cancels the previous search on the consumer source when a newer one starts', async () => {
    const {events, source} = pendingSource();
    render(
      <Tokenizer
        label="Members"
        searchSource={source}
        value={[]}
        onChange={vi.fn()}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    await type(input, 'a');
    await type(input, 'al');
    const first = events.indexOf('search:a');
    const second = events.indexOf('search:al');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(events.slice(first + 1, second)).toContain('cancel');
  });

  it('cancels a running search on the consumer source when the menu closes with Escape', async () => {
    const {events, answers, source} = pendingSource();
    render(
      <Tokenizer
        label="Members"
        searchSource={source}
        value={[]}
        onChange={vi.fn()}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    await type(input, 'a');
    await act(async () => {
      answers.get('a')?.([users[0]]);
    });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await type(input, 'al');
    const before = events.filter(e => e === 'cancel').length;
    fireEvent.keyDown(input, {key: 'Escape'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(events.filter(e => e === 'cancel').length).toBeGreaterThan(before);
  });

  it('cancels a running search on the consumer source when focus leaves the field', async () => {
    const {events, answers, source} = pendingSource();
    render(
      <>
        <Tokenizer
          label="Members"
          searchSource={source}
          value={[]}
          onChange={vi.fn()}
          debounceMs={0}
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    const input = screen.getByRole('combobox');
    await type(input, 'a');
    await act(async () => {
      answers.get('a')?.([users[0]]);
    });
    await type(input, 'al');
    const before = events.filter(e => e === 'cancel').length;
    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', {name: 'Elsewhere'}),
    });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(events.filter(e => e === 'cancel').length).toBeGreaterThan(before);
  });

  it('cancels a running search on the consumer source on unmount', async () => {
    const {events, source} = pendingSource();
    const {unmount} = render(
      <Tokenizer
        label="Members"
        searchSource={source}
        value={[]}
        onChange={vi.fn()}
        debounceMs={0}
      />,
    );
    await type(screen.getByRole('combobox'), 'a');
    const before = events.filter(e => e === 'cancel').length;
    unmount();
    expect(events.filter(e => e === 'cancel').length).toBeGreaterThan(before);
  });

  it('calls cancel with the consumer source as its receiver', async () => {
    const aborted: string[] = [];
    const source = {
      current: 'none',
      async search(query: string) {
        this.current = query;
        return new Promise<SearchableItem[]>(() => {});
      },
      bootstrap: () => [] as SearchableItem[],
      cancel() {
        aborted.push(this.current);
      },
    };
    const {unmount} = render(
      <Tokenizer
        label="Members"
        searchSource={source}
        value={[]}
        onChange={vi.fn()}
        debounceMs={0}
      />,
    );
    await type(screen.getByRole('combobox'), 'a');
    unmount();
    expect(aborted).toContain('a');
  });

  it("ignores a cancelled search's late answer when the source can't abort it", async () => {
    const {answers, source} = pendingSource();
    render(
      <Tokenizer
        label="Members"
        searchSource={source}
        value={[]}
        onChange={vi.fn()}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    await type(input, 'a');
    await type(input, 'b');
    await act(async () => {
      answers.get('b')?.([users[1]]);
    });
    await act(async () => {
      answers.get('a')?.([users[0]]);
    });
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('works with a source that has no cancel', async () => {
    const {unmount} = render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={[]}
        onChange={vi.fn()}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    await type(input, 'a');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(input, {key: 'Escape'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
    unmount();
  });
});

describe('Tokenizer required state (FormLayout FR5, AR2)', () => {
  it('exposes the resolved required state on the combobox', () => {
    const field = (props: {
      isRequired?: boolean;
      isOptional?: boolean;
      label: string;
    }) => (
      <Tokenizer
        {...props}
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />
    );
    render(
      <>
        {field({label: 'Plain'})}
        {field({label: 'Explicit', isRequired: true})}
        <FormLayout defaultOptionality="required">
          {field({label: 'By default'})}
          {field({label: 'Opted out', isOptional: true})}
        </FormLayout>
      </>,
    );
    const required = (name: string) =>
      screen
        .getByRole('combobox', {name: new RegExp(`^${name}`)})
        .getAttribute('aria-required');
    expect(required('Plain')).toBeNull();
    expect(required('Explicit')).toBe('true');
    expect(required('By default')).toBe('true');
    expect(required('Opted out')).toBeNull();
  });
});

describe('Tokenizer invalid state', () => {
  it('marks the combobox invalid for an error status only (WCAG 4.1.2)', () => {
    const field = (
      label: string,
      status?: {type: 'error' | 'warning'; message: string},
    ) => (
      <Tokenizer
        label={label}
        status={status}
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />
    );
    render(
      <>
        {field('None')}
        {field('Warned', {type: 'warning', message: 'Check this'})}
        {field('Failed', {type: 'error', message: 'Pick one'})}
      </>,
    );
    const invalid = (name: string) =>
      screen.getByRole('combobox', {name}).getAttribute('aria-invalid');
    expect(invalid('None')).toBeNull();
    expect(invalid('Warned')).toBeNull();
    expect(invalid('Failed')).toBe('true');
  });

  it("keeps a caller's own aria-invalid and aria-required when the field's own state is off", () => {
    render(
      <Tokenizer
        label="Caller"
        aria-invalid="true"
        aria-required="true"
        searchSource={userSource}
        value={[]}
        onChange={() => {}}
      />,
    );
    const combobox = screen.getByRole('combobox', {name: 'Caller'});
    expect(combobox).toHaveAttribute('aria-invalid', 'true');
    expect(combobox).toHaveAttribute('aria-required', 'true');
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

describe('Tokenizer pending search after a dismissal', () => {
  it('keeps a dismissed menu closed when its search answers late, and shows that answer on reopen', async () => {
    const answers = new Map<string, (items: SearchableItem[]) => void>();
    const search = vi.fn(
      async (query: string) =>
        new Promise<SearchableItem[]>(resolve => answers.set(query, resolve)),
    );
    // No cancel: the late answer still arrives, as it does for a source that
    // cannot abort its request.
    const source: SearchSource = {search, bootstrap: () => []};
    render(
      <Tokenizer
        label="Members"
        searchSource={source}
        value={[]}
        onChange={vi.fn()}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, {target: {value: 'a'}});
    await waitFor(() => expect(answers.has('a')).toBe(true));
    await act(async () => answers.get('a')?.([users[0]]));
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(input, {target: {value: 'b'}});
    await waitFor(() => expect(answers.has('b')).toBe(true));
    fireEvent.keyDown(input, {key: 'Escape'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-busy');

    await act(async () => answers.get('b')?.([users[1]]));
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(search.mock.calls.filter(([q]) => q === 'b')).toHaveLength(1);
  });

  it('searches the typed text when a press on a token dismissed it inside the debounce', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    try {
      const answers = new Map<string, (items: SearchableItem[]) => void>();
      const search = vi.fn(
        async (query: string) =>
          new Promise<SearchableItem[]>(resolve => answers.set(query, resolve)),
      );
      render(
        <Tokenizer
          label="Members"
          searchSource={{search, bootstrap: () => []}}
          value={[users[0]]}
          onChange={vi.fn()}
          debounceMs={200}
        />,
      );
      const input = screen.getByRole('combobox');
      input.focus();
      fireEvent.change(input, {target: {value: 'b'}});
      // A press on the token's text takes focus from the input with no target
      // in the field, then focus returns to the input.
      fireEvent.pointerDown(screen.getByText(users[0].label));
      act(() => input.blur());
      await act(async () => vi.advanceTimersByTime(400));
      expect(search).not.toHaveBeenCalled();

      act(() => input.focus());
      expect(search).toHaveBeenLastCalledWith('b', expect.anything());
      await waitFor(() => expect(answers.has('b')).toBe(true));
      await act(async () => answers.get('b')?.([users[1]]));
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(users[1].label)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reopens the Create entry after a query drops below minQueryLength inside the debounce', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    try {
      const search = vi.fn(() => []);
      render(
        <Tokenizer
          label="Labels"
          searchSource={{search, bootstrap: () => []}}
          value={[]}
          onChange={vi.fn()}
          hasCreate
          minQueryLength={3}
          debounceMs={200}
        />,
      );
      const input = screen.getByRole('combobox');
      input.focus();
      fireEvent.change(input, {target: {value: 'QAX'}});
      fireEvent.change(input, {target: {value: 'QA'}});
      await act(async () => vi.advanceTimersByTime(400));
      expect(screen.getByText('Create "QA"')).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(input, {key: 'Escape'});
      expect(input).toHaveAttribute('aria-expanded', 'false');
      fireEvent.keyDown(input, {key: 'ArrowDown'});
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Create "QA"')).toBeInTheDocument();
      expect(search).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reopens the Create entry for a query below minQueryLength with ArrowDown after Escape', async () => {
    const search = vi.fn(() => []);
    render(
      <Tokenizer
        label="Labels"
        searchSource={{search, bootstrap: () => []}}
        value={[]}
        onChange={vi.fn()}
        hasCreate
        minQueryLength={3}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    await act(async () => {
      fireEvent.change(input, {target: {value: 'QA'}});
    });
    expect(screen.getByText('Create "QA"')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(input, {key: 'Escape'});
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Create "QA"')).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });
});

describe('Tokenizer caller aria-labelledby', () => {
  it('names the input by its label and a caller aria-labelledby', () => {
    render(
      <>
        <span id="billing-heading">Billing</span>
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[]}
          onChange={() => {}}
          aria-labelledby="billing-heading"
        />
      </>,
    );
    expect(
      screen.getByRole('combobox', {name: 'Members Billing'}),
    ).toBeInTheDocument();
  });
});

describe('Tokenizer incremental results (spec:AST-092)', () => {
  const ben = {id: 'u2', label: 'Ben'};
  const benita = {id: 'u3', label: 'Benita'};
  const benShah = {id: 'u7', label: 'Ben Shah'};

  function pendingSource() {
    let settle: (items: SearchableItem[]) => void = () => {};
    const source: SearchSource = {
      bootstrap: () => [],
      async search(_query, context) {
        context?.update([ben, benita]);
        return new Promise<SearchableItem[]>(resolve => {
          settle = resolve;
        });
      },
    };
    return {source, settle: (items: SearchableItem[]) => settle(items)};
  }

  function optionLabels() {
    return screen
      .queryAllByRole('option', {hidden: true})
      .map(option => option.textContent);
  }

  it('removes committed values from partial lists too (FR1, component:Tokenizer FR13)', async () => {
    const {source, settle} = pendingSource();
    render(
      <Tokenizer
        label="People"
        searchSource={source}
        value={[benita]}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(input, {target: {value: 'ben'}});
    });
    expect(optionLabels()).toEqual(['Ben']);

    await act(async () => {
      settle([ben, benita, benShah]);
    });
    expect(optionLabels()).toEqual(['Ben', 'Ben Shah']);
  });

  it('offers the create row only once a searched query settles (FR1)', async () => {
    const {source, settle} = pendingSource();
    render(
      <Tokenizer
        label="People"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        hasCreate
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(input, {target: {value: 'ben s'}});
    });
    expect(optionLabels()).toEqual(['Ben', 'Benita']);

    await act(async () => {
      settle([ben, benita]);
    });
    expect(optionLabels()).toEqual(['Ben', 'Benita', 'Create "ben s"']);
  });

  it('keeps grouped rows in place and shows the create row after them when the query settles (FR1, FR2)', async () => {
    const people = {id: 'p1', label: 'Ben', auxiliaryData: {group: 'People'}};
    const teams = {id: 't1', label: 'Bento', auxiliaryData: {group: 'Teams'}};
    let settle: (items: SearchableItem[]) => void = () => {};
    const source: SearchSource = {
      bootstrap: () => [],
      async search(_query, context) {
        context?.update([people]);
        return new Promise<SearchableItem[]>(resolve => {
          settle = resolve;
        });
      },
    };
    render(
      <Tokenizer
        label="People"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        hasCreate
        debounceMs={0}
      />,
    );
    const input = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(input, {target: {value: 'ben x'}});
    });
    expect(optionLabels()).toEqual(['Ben']);
    await act(async () => {
      settle([people, teams]);
    });
    expect(optionLabels()).toEqual(['Ben', 'Bento', 'Create "ben x"']);
  });
});

describe('Tokenizer locked tokens (internal removable context)', () => {
  it('Clear all keeps a locked token and reports the last removed one', () => {
    const onChange = vi.fn();
    render(
      <TokenizerItemRemovableContext value={item => item.id !== '1'}>
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1], users[2]]}
          onChange={onChange}
          hasClear
        />
      </TokenizerItemRemovableContext>,
    );
    expect(
      screen.queryByRole('button', {name: 'Remove Alice'}),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Remove Bob'}),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /clear/i}));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([users[0]], {
      item: users[2],
      type: 'remove',
    });
  });

  it('has no Clear all when every token is locked', () => {
    render(
      <TokenizerItemRemovableContext value={() => false}>
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0]]}
          onChange={() => {}}
          hasClear
        />
      </TokenizerItemRemovableContext>,
    );
    expect(
      screen.queryByRole('button', {name: /clear/i}),
    ).not.toBeInTheDocument();
  });

  it('Backspace on an empty input removes nothing while the last token is locked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TokenizerItemRemovableContext value={item => item.id !== '2'}>
        <Tokenizer
          label="Members"
          searchSource={userSource}
          value={[users[0], users[1]]}
          onChange={onChange}
        />
      </TokenizerItemRemovableContext>,
    );
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Backspace}');
    expect(onChange).not.toHaveBeenCalled();
  });
});
