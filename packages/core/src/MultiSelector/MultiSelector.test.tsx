// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event
 * @output Unit tests for MultiSelector
 * @position Tests; validates MultiSelector behavior
 *
 * SYNC: When MultiSelector.tsx API changes, update these tests.
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
import * as stylex from '@stylexjs/stylex';
import {
  MultiSelector,
  type MultiSelectorHandle,
  type MultiSelectorChange,
} from './MultiSelector';
import {useRef, useState} from 'react';
import {Icon} from '../Icon';
import {InternationalizationProvider} from '../i18n';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {selectorPresentationStyles} from '../Selector/selectorPresentation.stylex';
import {groupStyles} from '../InputGroup/groupStyles';
import {InputGroup, InputGroupText} from '../InputGroup';
import {colorVars, focusVars} from '../theme/tokens.stylex';
import {COMPACT_TOUCH_PRESENTATION_QUERY} from '../hooks/useAdaptivePresentation';

/**
 * Enters a search query as one change. Typing it key by key can land several
 * keystrokes in one frame, whose result announcements are then joined into
 * one (spec:AST-086 FR9), so a test of what one query announces pastes it.
 */
async function enterQuery(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  query: string,
): Promise<void> {
  await user.click(input);
  await user.paste(query);
}

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}
// Module-level constants to satisfy @eslint-react/no-unstable-default-props.
const ANNOUNCE_OPTIONS = ['Apple', 'Banana', 'Orange'] as const;
const EMPTY_VALUE: string[] = [];

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

// Mock showPopover and hidePopover methods since they're not implemented in jsdom
beforeEach(() => {
  __resetInteractionModalityForTest();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
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
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
});

afterEach(() => {
  __resetLiveRegionsForTest();
});

// Helper: jsdom popover content is in the DOM but may not be
// "visible" in the accessibility tree. Use hidden: true to find it.
const h = {hidden: true} as const;

/** A busy control's Spinner is decorative and silent (spec:AST-086 FR8). */
function expectSilentBusySpinner() {
  const spinner = document.querySelector('.astryx-spinner');
  expect(spinner).not.toBeNull();
  expect(spinner).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('status', {name: 'Loading'})).toBeNull();
}

describe('MultiSelector', () => {
  const defaultOptions = ['Apple', 'Banana', 'Orange'];

  it('uses a bottom sheet and stays open while toggling options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={onChange}
        presentation="bottom-sheet"
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    expect(
      await screen.findByRole('dialog', {name: 'Fruit'}),
    ).toBeInTheDocument();
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('option', {name: 'Banana'}));
    expect(onChange).toHaveBeenCalledWith(['Banana']);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('uses a bottom sheet for adaptive presentation on compact touch', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === COMPACT_TOUCH_PRESENTATION_QUERY,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        presentation="adaptive"
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(
      await screen.findByRole('dialog', {name: 'Fruit'}),
    ).toBeInTheDocument();
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  });

  it('moves keyboard focus into a bottom-sheet listbox', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        presentation="bottom-sheet"
      />,
    );

    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus());
  });

  it('restores touch focus without painting a trigger focus ring', async () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        presentation="bottom-sheet"
      />,
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    fireEvent.click(trigger, {detail: 1});
    const dialog = await screen.findByRole('dialog', {name: 'Fruit'});
    fireEvent.pointerDown(dialog, {pointerType: 'touch'});
    fireEvent.click(dialog, {detail: 1});

    trigger.focus();
    expect(trigger).toHaveFocus();
    expect(trigger.parentElement).toHaveClass(
      stylex.props(selectorPresentationStyles.pointerRestoredFocus).className!,
    );
  });

  it('shows no disabled focus ring after a pointer pick (spec:AST-085 FR6)', async () => {
    const field = (isDisabled: boolean) => (
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        presentation="bottom-sheet"
        isDisabled={isDisabled}
      />
    );
    const {rerender} = render(field(false));
    const trigger = screen.getByRole('combobox');
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    fireEvent.click(trigger, {detail: 1});
    const dialog = await screen.findByRole('dialog', {name: 'Fruit'});
    fireEvent.pointerDown(dialog, {pointerType: 'touch'});
    fireEvent.click(dialog, {detail: 1});
    rerender(field(true));
    const ring = stylex
      .props(
        stylex.create({
          ring: {
            boxShadow: {
              default: null,
              ':has(> [aria-disabled="true"]:focus-visible)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
            },
          },
        }).ring,
      )
      .className!.split(' ')
      .pop()!;
    const wrapper = screen.getByRole('combobox').parentElement!;
    expect(wrapper).toHaveClass(
      stylex.props(selectorPresentationStyles.pointerRestoredFocus).className!,
    );
    expect(wrapper).not.toHaveClass(ring);
  });

  it('renders with label', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Fruit')).toBeInTheDocument();
  });

  it('applies distinct trigger chrome to the secondary variant', () => {
    // data-testid reaches the native control; the variant is on the trigger root.
    const triggerRoot = () =>
      screen
        .getByTestId('selector')
        .closest('.astryx-multi-selector') as HTMLElement;
    const {rerender} = render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        variant="input"
        data-testid="selector"
      />,
    );
    const inputClasses = triggerRoot().className;

    rerender(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        variant="secondary"
        data-testid="selector"
      />,
    );
    const secondary = triggerRoot();
    const secondaryClasses = secondary.className;
    expect(secondary).toHaveAttribute('data-variant', 'secondary');

    rerender(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        variant="ghost"
        data-testid="selector"
      />,
    );
    const ghostClasses = triggerRoot().className;

    expect(secondaryClasses).not.toBe(inputClasses);
    expect(secondaryClasses).not.toBe(ghostClasses);
  });

  it('renders custom option content with renderOption', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[{value: 'apple', label: 'Apple'}]}
        value={[]}
        onChange={() => {}}
        renderOption={option => (
          <span data-testid="custom-option">{option.label}</span>
        )}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByTestId('custom-option')).toHaveTextContent('Apple');
  });
  it('renders placeholder when no value selected', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        placeholder="Pick fruits..."
      />,
    );
    expect(screen.getByText('Pick fruits...')).toBeInTheDocument();
  });

  it('shows count display by default', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={['Apple', 'Banana']}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('formats the count display with formatValue', () => {
    render(
      <MultiSelector
        label="Spaces"
        options={defaultOptions}
        value={['Apple', 'Banana']}
        onChange={() => {}}
        formatValue={items => `${items.length} spaces selected`}
      />,
    );
    expect(screen.getByText('2 spaces selected')).toBeInTheDocument();
  });

  it('passes selected values and resolved labels to formatValue', () => {
    const formatValue = vi.fn(
      (items: {value: string; label: string}[]) =>
        `${items[0].label} and ${items.length - 1} more`,
    );
    render(
      <MultiSelector
        label="Fruit"
        options={[
          {value: 'a', label: 'Apple'},
          {value: 'b', label: 'Banana'},
        ]}
        value={['a', 'b']}
        onChange={() => {}}
        formatValue={formatValue}
      />,
    );
    expect(formatValue).toHaveBeenCalledWith([
      {value: 'a', label: 'Apple'},
      {value: 'b', label: 'Banana'},
    ]);
    expect(screen.getByText('Apple and 1 more')).toBeInTheDocument();
  });

  it('formats the labels display with formatValue', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={['Apple', 'Banana', 'Orange']}
        onChange={() => {}}
        triggerDisplay="labels"
        formatValue={items => items.map(item => item.label).join(' & ')}
      />,
    );
    expect(screen.getByText('Apple & Banana & Orange')).toBeInTheDocument();
  });

  it('ignores formatValue in badges display', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={['Apple', 'Banana']}
        onChange={() => {}}
        triggerDisplay="badges"
        formatValue={() => 'formatted'}
      />,
    );
    expect(screen.queryByText('formatted')).not.toBeInTheDocument();
    const trigger = within(screen.getByRole('combobox'));
    expect(trigger.getByText('Apple')).toBeInTheDocument();
    expect(trigger.getByText('Banana')).toBeInTheDocument();
  });

  it('shows the placeholder rather than calling formatValue when empty', () => {
    const formatValue = vi.fn(() => 'formatted');
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        placeholder="Pick fruits..."
        formatValue={formatValue}
      />,
    );
    expect(screen.getByText('Pick fruits...')).toBeInTheDocument();
    expect(formatValue).not.toHaveBeenCalled();
  });

  it('shows labels display', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={['Apple', 'Banana']}
        onChange={() => {}}
        triggerDisplay="labels"
      />,
    );
    expect(screen.getByText('Apple, Banana')).toBeInTheDocument();
  });

  it('shows labels display with overflow', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange', 'Mango', 'Pineapple']}
        value={['Apple', 'Banana', 'Orange', 'Mango', 'Pineapple']}
        onChange={() => {}}
        triggerDisplay="labels"
      />,
    );
    expect(screen.getByText('Apple, Banana, Orange, +2')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles item on click without closing dropdown', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    const options = screen.getAllByRole('option', h);
    await user.click(options[0]);

    expect(onChange).toHaveBeenCalledWith(['Apple']);
    // Dropdown should still be open
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('deselects item when clicking selected item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={['Apple', 'Banana']}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option', h);
    await user.click(options[0]); // Click Apple to deselect

    expect(onChange).toHaveBeenCalledWith(['Banana']);
  });

  it('does not toggle disabled items', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={[
          {value: 'apple', label: 'Apple', disabled: true},
          {value: 'banana', label: 'Banana'},
        ]}
        value={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option', h);
    await user.click(options[0]); // Click disabled Apple

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders disabled state', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        isDisabled
      />,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).not.toHaveAttribute('disabled');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
  });

  it('has correct ARIA attributes', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        isRequired
      />,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-required', 'true');
  });

  it('shows error status with aria-invalid', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes combobox on Tab and moves focus to next element', async () => {
    const user = userEvent.setup();
    render(
      <>
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
        />
        <button type="button">Next</button>
      </>,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Tab}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', {name: 'Next'})).toHaveFocus();
  });

  it('supports keyboard navigation with ArrowDown/ArrowUp', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    await user.keyboard('{ArrowDown}');
    const activeId = trigger.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
  });

  it('End/Home jump the highlight to the last/first option (non-search)', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    const options = screen.getAllByRole('option', h);

    await user.keyboard('{End}');
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      options[options.length - 1].id,
    );
    await user.keyboard('{Home}');
    expect(trigger).toHaveAttribute('aria-activedescendant', options[0].id);
  });

  it('toggles item with Enter key', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(['Apple']);
  });

  it('does not toggle the highlighted option on a composing Enter (IME)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={onChange}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    // Filter to Banana and highlight it so an unguarded Enter would toggle it.
    await user.type(search, 'ban');
    await user.keyboard('{ArrowDown}');
    expect(search).toHaveAttribute('aria-activedescendant');

    // The composing keydown (isComposing / legacy keyCode 229) that commits an
    // IME candidate must not be read as "toggle the highlighted option".
    fireEvent.keyDown(search, {key: 'Enter', isComposing: true});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(search, {key: 'Enter', keyCode: 229});
    expect(onChange).not.toHaveBeenCalled();

    // A real, non-composing Enter still toggles the highlighted option.
    fireEvent.keyDown(search, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith(['Banana']);
  });

  it('toggles the correct item when selected items are sorted to top', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // Orange is selected, so sorted order is: Orange, Apple, Banana
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={['Orange']}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    // highlightedIndex starts at 0 which is Orange (sorted first)
    await user.keyboard('{ArrowDown}');
    // Now at index 1 which should be Apple
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(['Orange', 'Apple']);
  });

  it('renders select-all checkbox when hasSelectAll', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSelectAll
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('Select all')).toBeInTheDocument();
  });

  it('select-all selects all enabled items', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={[
          {value: 'apple', label: 'Apple'},
          {value: 'banana', label: 'Banana', disabled: true},
          {value: 'orange', label: 'Orange'},
        ]}
        value={[]}
        onChange={onChange}
        hasSelectAll
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const selectAll = screen.getByText('Select all');
    await user.click(selectAll);

    expect(onChange).toHaveBeenCalledWith(['apple', 'orange']);
  });

  it('select-all deselects all when all are selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={['Apple', 'Banana', 'Orange']}
        onChange={onChange}
        hasSelectAll
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const selectAll = screen.getByText('Select all');
    await user.click(selectAll);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('select-all is a role="option" in the listbox', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSelectAll
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option', h);
    expect(options[0]).toHaveTextContent('Select all');
  });

  it('select-all accessible name reflects none/partial/all selection', async () => {
    const user = userEvent.setup();
    const options = [
      {value: 'apple', label: 'Apple'},
      {value: 'banana', label: 'Banana'},
    ];
    const {rerender} = render(
      <MultiSelector
        label="Fruit"
        options={options}
        value={[]}
        onChange={() => {}}
        hasSelectAll
      />,
    );

    await user.click(screen.getByRole('combobox'));

    // None selected: plain name, not selected
    let selectAll = screen.getAllByRole('option', h)[0];
    expect(selectAll).not.toHaveAccessibleName(/partially selected/);
    expect(selectAll).toHaveAttribute('aria-selected', 'false');

    // Partial: aria-selected="mixed" is invalid on role="option", so the
    // indeterminate state must be conveyed through the accessible name.
    rerender(
      <MultiSelector
        label="Fruit"
        options={options}
        value={['apple']}
        onChange={() => {}}
        hasSelectAll
      />,
    );
    selectAll = screen.getAllByRole('option', h)[0];
    expect(selectAll).toHaveAccessibleName('Select all, partially selected');
    expect(selectAll).toHaveAttribute('aria-selected', 'false');

    // All selected: plain name again, selected
    rerender(
      <MultiSelector
        label="Fruit"
        options={options}
        value={['apple', 'banana']}
        onChange={() => {}}
        hasSelectAll
      />,
    );
    selectAll = screen.getAllByRole('option', h)[0];
    expect(selectAll).not.toHaveAccessibleName(/partially selected/);
    expect(selectAll).toHaveAttribute('aria-selected', 'true');
  });

  it('select-all toggles via keyboard Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={onChange}
        hasSelectAll
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    // highlightedIndex starts at 0 which is select-all
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(['Apple', 'Banana', 'Orange']);
  });

  it('renders search input when hasSearch', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const searchInput = screen.getByRole('combobox', h);
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('filters options when searching', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const searchInput = screen.getByRole('combobox', h);
    await user.type(searchInput, 'app');

    const options = screen.getAllByRole('option', h);
    expect(options).toHaveLength(1);
  });

  describe('grouped search', () => {
    const GROUPED = [
      {
        type: 'section' as const,
        title: 'Citrus',
        options: [
          {value: 'orange', label: 'Orange'},
          {value: 'lemon', label: 'Lemon'},
        ],
      },
      {
        type: 'section' as const,
        title: 'Berries',
        options: [
          {value: 'strawberry', label: 'Strawberry'},
          {value: 'blueberry', label: 'Blueberry'},
        ],
      },
    ];

    it('keeps the group header above matching items while searching', async () => {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Fruit"
          options={GROUPED}
          value={[]}
          onChange={() => {}}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await user.type(screen.getByRole('combobox', h), 'orange');

      expect(
        screen.getByRole('group', {name: 'Citrus', ...h}),
      ).toBeInTheDocument();
      const options = screen.getAllByRole('option', h);
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Orange');
    });

    it('hides a group whose items have no match', async () => {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Fruit"
          options={GROUPED}
          value={[]}
          onChange={() => {}}
          hasSearch
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await user.type(screen.getByRole('combobox', h), 'berry');

      expect(
        screen.getByRole('group', {name: 'Berries', ...h}),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('group', {name: 'Citrus', ...h}),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('option', h)).toHaveLength(2);
    });
  });

  it('PageDown/PageUp jump the highlight to the last/first filtered option', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const searchInput = screen.getByRole('combobox', h);
    // Filter to Banana and Orange so "last" means last *visible* option.
    await user.type(searchInput, 'an');
    const options = screen.getAllByRole('option', h);
    expect(options).toHaveLength(2);

    await user.keyboard('{PageDown}');
    expect(searchInput).toHaveAttribute(
      'aria-activedescendant',
      options[options.length - 1].id,
    );
    await user.keyboard('{PageUp}');
    expect(searchInput).toHaveAttribute('aria-activedescendant', options[0].id);
  });

  it('Home/End move the search caret, not the option highlight', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const searchInput = screen.getByRole<HTMLInputElement>('combobox', h);
    await user.type(searchInput, 'an');
    expect(searchInput.selectionStart).toBe(2);
    const activeBefore = searchInput.getAttribute('aria-activedescendant');
    // Home/End stay on the input for caret movement (APG editable combobox);
    // the option highlight must not move.
    await user.keyboard('{Home}');
    expect(searchInput.selectionStart).toBe(0);
    expect(searchInput.getAttribute('aria-activedescendant')).toBe(
      activeBefore,
    );
    await user.keyboard('{End}');
    expect(searchInput.selectionStart).toBe(2);
    expect(searchInput.getAttribute('aria-activedescendant')).toBe(
      activeBefore,
    );
  });

  it('shows empty state when search has no results', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const searchInput = screen.getByRole('combobox', h);
    await user.type(searchInput, 'xyz');

    expect(
      within(screen.getByRole('listbox', h)).getByText('No results found'),
    ).toBeInTheDocument();
  });

  it('empty-state message is not exposed as a listbox child', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await user.type(screen.getByRole('combobox', h), 'xyz');

    // role="listbox" only permits option/group children — the visual
    // empty-state message must be presentational (it is announced through
    // the result-count live region instead).
    const listbox = screen.getByRole('listbox', h);
    const empty = within(listbox).getByText('No results found');
    expect(empty).toHaveAttribute('role', 'presentation');
  });

  it('renders emptySearchText in place of the default message', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
        emptySearchText="Nothing like that here"
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await user.type(screen.getByRole('combobox', h), 'xyz');

    const listbox = screen.getByRole('listbox', h);
    expect(
      within(listbox).getByText('Nothing like that here'),
    ).toBeInTheDocument();
    expect(
      within(listbox).queryByText('No results found'),
    ).not.toBeInTheDocument();
  });

  it('renders emptyText, not emptySearchText, with no options and no query', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[]}
        value={[]}
        onChange={() => {}}
        hasSearch
        emptySearchText="Nothing like that here"
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));

    const listbox = screen.getByRole('listbox', h);
    expect(within(listbox).getByText('No options')).toBeInTheDocument();
    expect(
      within(listbox).queryByText('Nothing like that here'),
    ).not.toBeInTheDocument();
  });

  it('announces emptySearchText, not the catalog default', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
        emptySearchText="Nothing like that here"
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await enterQuery(user, screen.getByRole('combobox', h), 'xyz');

    // The panel message is role="presentation", so the live region is the
    // only thing a screen reader gets — it has to say the same words.
    await waitFor(() =>
      expect(politeRegion()?.textContent).toBe('Nothing like that here'),
    );
  });

  // `emptySearchText` is typed ReactNode, which invites an element — a
  // "no results, create one" row is exactly what a dead end is for. The
  // announcement used to take the prop only when it was a string and
  // announce the catalog default otherwise, so a screen-reader user was told
  // something the sighted user was not reading (`spec:AST-056` AR1).
  it('announces the text of an element emptySearchText', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
        emptySearchText={
          <span>
            Nothing like that here. <a href="/new">Add a fruit</a>
          </span>
        }
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await enterQuery(user, screen.getByRole('combobox', h), 'xyz');

    await waitFor(() =>
      expect(politeRegion()?.textContent).toBe(
        'Nothing like that here. Add a fruit',
      ),
    );
  });

  it('announces the text of an element emptyText', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[]}
        value={[]}
        onChange={() => {}}
        emptyText={
          <span>
            Add a fruit first<span aria-hidden="true"> →</span>
          </span>
        }
      />,
    );

    await user.click(screen.getByRole('combobox', {name: 'Fruit'}));

    // The decorative arrow is hidden from the accessibility tree on screen,
    // so it stays out of the announcement too.
    await waitFor(() =>
      expect(politeRegion()?.textContent).toBe('Add a fruit first'),
    );
  });

  it('announces text a child component renders, which is only in the DOM', async () => {
    const user = userEvent.setup();
    // The words exist nowhere in the node the caller passed — they are
    // produced inside this component's own render. Reading the DOM after
    // render is what makes them announceable.
    function Message() {
      return <span>Nothing like that here</span>;
    }
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
        emptySearchText={<Message />}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await enterQuery(user, screen.getByRole('combobox', h), 'xyz');

    await waitFor(() =>
      expect(politeRegion()?.textContent).toBe('Nothing like that here'),
    );
  });

  it('announces the empty state when opened with no options', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[]}
        value={[]}
        onChange={() => {}}
        emptyText="Add a fruit first"
      />,
    );

    await user.click(screen.getByRole('combobox', {name: 'Fruit'}));

    await waitFor(() =>
      expect(politeRegion()?.textContent).toBe('Add a fruit first'),
    );
  });

  it('shows and announces nothing while isLoading', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[]}
        value={[]}
        onChange={() => {}}
        isLoading
      />,
    );

    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // useAnnounce writes on the next animation frame, so an immediate read
    // would pass whether or not anything was announced.
    await act(
      async () =>
        void (await new Promise(resolve => requestAnimationFrame(resolve))),
    );

    // The options have not arrived, so "No options" would be a claim the
    // component cannot make; the trigger's spinner carries the state.
    const listbox = screen.getByRole('listbox', h);
    expect(within(listbox).queryByText('No options')).not.toBeInTheDocument();
    // Only the busy start is spoken (spec:AST-086 FR8), never an empty or
    // no-results message the panel is suppressing.
    // (The channel clears its text on a timer, so it may already be empty.)
    expect(['', 'Loading']).toContain(politeRegion()?.textContent ?? '');
  });

  it('announces nothing while isLoading, matching the silent panel', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSearch
        isLoading
        emptySearchText="Nothing like that here"
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await user.type(screen.getByRole('combobox', h), 'xyz');

    // useAnnounce writes on the next animation frame, so an immediate read
    // would pass whether or not anything was announced.
    await act(
      async () =>
        void (await new Promise(resolve => requestAnimationFrame(resolve))),
    );

    // The panel is deliberately blank while loading; the live region is the
    // only channel left, so a result there would be a claim the screen
    // refuses to make.
    const listbox = screen.getByRole('listbox', h);
    expect(
      within(listbox).queryByText('Nothing like that here'),
    ).not.toBeInTheDocument();
    // Only the busy start is spoken (spec:AST-086 FR8), never an empty or
    // no-results message the panel is suppressing.
    // (The channel clears its text on a timer, so it may already be empty.)
    expect(['', 'Loading']).toContain(politeRegion()?.textContent ?? '');
  });

  it('renders emptyText when there are no options and no search input', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[]}
        value={[]}
        onChange={() => {}}
        emptyText="Add a fruit first"
      />,
    );

    // Without hasSearch the trigger itself is the combobox.
    await user.click(screen.getByRole('combobox', {name: 'Fruit'}));

    const listbox = screen.getByRole('listbox', h);
    expect(within(listbox).getByText('Add a fruit first')).toBeInTheDocument();
  });

  describe('result announcements', () => {
    it('announces the match count politely while searching', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{
            fr: {
              '@astryx.multiSelector.resultCount':
                '{count, number} {count, plural, one {résultat} other {résultats}}',
            },
          }}>
          <MultiSelector
            label="Fruit"
            options={defaultOptions}
            value={EMPTY_VALUE}
            onChange={() => {}}
            hasSearch
          />
        </InternationalizationProvider>,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      // "an" matches Banana and Orange.
      await enterQuery(user, screen.getByRole('combobox', h), 'an');
      await waitFor(() => {
        // The plural branch of a message no catalog supplies.
        expect(politeRegion()?.textContent).toBe('2 résultats');
      });
    });

    it('announces the singular form when one option matches', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{
            fr: {
              '@astryx.multiSelector.resultCount':
                '{count, number} {count, plural, one {résultat} other {résultats}}',
            },
          }}>
          <MultiSelector
            label="Fruit"
            options={defaultOptions}
            value={EMPTY_VALUE}
            onChange={() => {}}
            hasSearch
          />
        </InternationalizationProvider>,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      // "app" matches only Apple. Exact match, so "1 résultats" would fail.
      await enterQuery(user, screen.getByRole('combobox', h), 'app');
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('1 résultat');
      });
    });

    it('announces the empty-results message when nothing matches', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{
            fr: {'@astryx.multiSelector.emptySearchResults': 'Aucun résultat'},
          }}>
          <MultiSelector
            label="Fruit"
            options={defaultOptions}
            value={EMPTY_VALUE}
            onChange={() => {}}
            hasSearch
          />
        </InternationalizationProvider>,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await enterQuery(user, screen.getByRole('combobox', h), 'xyz');
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Aucun résultat');
      });
    });

    it('speaks the result count from a provider catalog (plural)', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="fr"
          messages={{
            fr: {
              '@astryx.multiSelector.resultCount': {
                defaultMessage:
                  '{count, number} {count, plural, one {résultat} other {résultats}}',
              },
            },
          }}>
          <MultiSelector
            label="Fruit"
            options={defaultOptions}
            value={EMPTY_VALUE}
            onChange={() => {}}
            hasSearch
          />
        </InternationalizationProvider>,
      );
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      // "an" matches Banana and Orange.
      await enterQuery(user, screen.getByRole('combobox', h), 'an');
      await waitFor(() => {
        // Same key through the catalog path rather than `overrides`.
        expect(politeRegion()?.textContent).toBe('2 résultats');
      });
    });

    it('does not announce results until the user searches', async () => {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={EMPTY_VALUE}
          onChange={() => {}}
          hasSearch
        />,
      );
      // Popover closed: nothing announced.
      expect(politeRegion()?.textContent ?? '').toBe('');
      // Open with an empty query: still nothing announced.
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      expect(politeRegion()?.textContent ?? '').toBe('');
    });
  });

  it('renders with description', () => {
    render(
      <MultiSelector
        label="Fruit"
        description="Choose your fruits"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Choose your fruits')).toBeInTheDocument();
  });

  it('supports data-testid', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        data-testid="fruit-selector"
      />,
    );
    expect(screen.getByTestId('fruit-selector')).toBeInTheDocument();
  });

  it('renders sections with dividers', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[
          {value: 'apple', label: 'Apple'},
          {
            type: 'section',
            title: 'Citrus',
            options: [
              {value: 'orange', label: 'Orange'},
              {value: 'lemon', label: 'Lemon'},
            ],
          },
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option', h);
    expect(options).toHaveLength(3);
    expect(screen.getByText('Citrus')).toBeInTheDocument();
  });

  it('shows loading state with a spinner and aria-busy', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        isLoading
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-busy', 'true');
    expectSilentBusySpinner();
  });

  it('renders with custom selectAllLabel', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={defaultOptions}
        value={[]}
        onChange={() => {}}
        hasSelectAll
        selectAllLabel="Check all"
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('Check all')).toBeInTheDocument();
  });

  it('sorts selected items to top', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={['Orange']}
        onChange={() => {}}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option', h);
    // Orange is selected so it should appear first
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveTextContent('Orange');
    expect(options[1]).toHaveTextContent('Apple');
    expect(options[2]).toHaveTextContent('Banana');
  });

  it('sorts selected items to top within sections', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[
          {
            type: 'section',
            title: 'Citrus',
            options: [
              {value: 'orange', label: 'Orange'},
              {value: 'lemon', label: 'Lemon'},
              {value: 'lime', label: 'Lime'},
            ],
          },
        ]}
        value={['lime']}
        onChange={() => {}}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option', h);
    // Lime is selected so it should appear first within the section
    expect(options[0]).toHaveTextContent('Lime');
    expect(options[1]).toHaveTextContent('Orange');
    expect(options[2]).toHaveTextContent('Lemon');
  });

  it('has displayName', () => {
    expect(MultiSelector.displayName).toBe('MultiSelector');
  });

  describe('keyboard accessibility', () => {
    it('trigger is focusable via Tab when enabled', async () => {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
        />,
      );
      await user.tab();
      expect(screen.getByRole('combobox')).toHaveFocus();
    });

    it('trigger keeps its tab stop when disabled (spec:AST-085 FR1)', () => {
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.getByRole('combobox')).toHaveAttribute('tabIndex', '0');
    });

    it('opens the listbox with ArrowDown from a focused trigger', async () => {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
        />,
      );
      const trigger = screen.getByRole('combobox');
      await user.tab();
      expect(trigger).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('clear button is reachable by keyboard', () => {
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={['Apple', 'Banana']}
          onChange={() => {}}
          hasClear
        />,
      );
      const clear = screen.getByRole('button', {name: 'Clear all Fruit'});
      expect(clear).not.toHaveAttribute('tabIndex', '-1');
    });

    it('returns focus to the trigger when the clear button is activated by keyboard', async () => {
      function Controlled() {
        const [value, setValue] = useState(['Apple', 'Banana']);
        return (
          <MultiSelector
            label="Fruit"
            options={defaultOptions}
            value={value}
            onChange={setValue}
            hasClear
          />
        );
      }
      const user = userEvent.setup();
      render(<Controlled />);
      screen.getByRole('button', {name: 'Clear all Fruit'}).focus();
      await user.keyboard('{Enter}');
      expect(
        screen.queryByRole('button', {name: 'Clear all Fruit'}),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveFocus();
    });

    it('leaves focus in the search input when the clear button is clicked with the list open', async () => {
      function Controlled() {
        const [value, setValue] = useState(['Apple', 'Banana']);
        return (
          <MultiSelector
            label="Fruit"
            options={defaultOptions}
            value={value}
            onChange={setValue}
            hasClear
            hasSearch
          />
        );
      }
      const user = userEvent.setup();
      const {container} = render(<Controlled />);
      await user.click(container.querySelector('[aria-haspopup]') as Element);
      const search = screen.getByRole('combobox', h);
      search.focus();
      await user.click(screen.getByRole('button', {name: 'Clear all Fruit'}));
      expect(
        screen.queryByRole('button', {name: 'Clear all Fruit'}),
      ).not.toBeInTheDocument();
      expect(search).toHaveFocus();
    });

    it('scrolls the highlighted option into view during arrow navigation', async () => {
      const scrollIntoView = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      });
      try {
        const user = userEvent.setup();
        const longOptions = Array.from(
          {length: 20},
          (_, i) => `Option ${i + 1}`,
        );
        render(
          <MultiSelector
            label="Fruit"
            options={longOptions}
            value={[]}
            onChange={() => {}}
          />,
        );

        const trigger = screen.getByRole('combobox');
        await user.click(trigger);
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
        const longOptions = Array.from(
          {length: 20},
          (_, i) => `Option ${i + 1}`,
        );
        render(
          <MultiSelector
            label="Fruit"
            options={longOptions}
            value={[]}
            onChange={() => {}}
          />,
        );

        const trigger = screen.getByRole('combobox');
        await user.click(trigger);
        scrollIntoView.mockClear();

        const options = screen.getAllByRole('option', {hidden: true});
        fireEvent.mouseEnter(options[3]);

        expect(trigger.getAttribute('aria-activedescendant')).toBe(
          options[3].id,
        );
        expect(scrollIntoView).not.toHaveBeenCalled();

        await user.keyboard('{ArrowDown}');
        expect(scrollIntoView).toHaveBeenCalledWith({block: 'nearest'});
      } finally {
        delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
          .scrollIntoView;
      }
    });

    it('clears all values via Delete on the focused trigger', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={['Apple', 'Banana']}
          onChange={onChange}
          hasClear
        />,
      );
      const trigger = screen.getByRole('combobox');
      trigger.focus();
      await user.keyboard('{Delete}');
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('clears all values via Backspace on the focused trigger', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={['Apple', 'Banana']}
          onChange={onChange}
          hasClear
        />,
      );
      const trigger = screen.getByRole('combobox');
      trigger.focus();
      await user.keyboard('{Backspace}');
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('does not clear via Delete when nothing is selected', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={onChange}
          hasClear
        />,
      );
      const trigger = screen.getByRole('combobox');
      trigger.focus();
      await user.keyboard('{Delete}');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('announcements', () => {
    it('announces the selection count politely when toggling an option', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{
            fr: {
              '@astryx.multiSelector.selectionCount':
                '{count, number} sur {total, number} sélectionnés',
            },
          }}>
          <MultiSelector
            label="Fruit"
            options={[...ANNOUNCE_OPTIONS]}
            value={EMPTY_VALUE}
            onChange={() => {}}
          />
        </InternationalizationProvider>,
      );
      await user.click(screen.getByRole('combobox'));
      const options = screen.getAllByRole('option', {hidden: true});
      await user.click(options[0]);
      await waitFor(() => {
        // Both arguments land, in the order the message asks for them.
        expect(politeRegion()?.textContent).toBe('1 sur 3 sélectionnés');
      });
    });

    it('announces the all-selected message when select-all selects everything', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{
            fr: {'@astryx.multiSelector.allSelected': 'Tout est là'},
          }}>
          <MultiSelector
            label="Fruit"
            options={[...ANNOUNCE_OPTIONS]}
            value={EMPTY_VALUE}
            onChange={() => {}}
            hasSelectAll
          />
        </InternationalizationProvider>,
      );
      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByText('Select all'));
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Tout est là');
      });
    });

    it('announces the selection-cleared message when clearing', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{
            fr: {'@astryx.multiSelector.selectionCleared': 'Plus rien'},
          }}>
          <MultiSelector
            label="Fruit"
            options={[...ANNOUNCE_OPTIONS]}
            value={['Apple', 'Banana']}
            onChange={() => {}}
            hasClear
          />
        </InternationalizationProvider>,
      );
      await user.click(screen.getByRole('button', {name: 'Clear all Fruit'}));
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Plus rien');
      });
    });

    it('prefers a provider override over the provider catalog', async () => {
      const user = userEvent.setup();
      render(
        <InternationalizationProvider
          locale="fr"
          messages={{
            fr: {
              '@astryx.multiSelector.selectionCount': {
                defaultMessage: '{count, number} du catalogue',
              },
            },
          }}
          overrides={{
            fr: {
              '@astryx.multiSelector.selectionCount':
                '{count, number} remplacé',
            },
          }}>
          <MultiSelector
            label="Fruit"
            options={[...ANNOUNCE_OPTIONS]}
            value={EMPTY_VALUE}
            onChange={() => {}}
          />
        </InternationalizationProvider>,
      );
      await user.click(screen.getByRole('combobox'));
      const options = screen.getAllByRole('option', {hidden: true});
      await user.click(options[0]);
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('1 remplacé');
      });
    });
  });

  describe('disabledMessage', () => {
    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
          isDisabled
          disabledMessage="Select a table first"
          data-testid="fruit-multi-selector"
        />,
      );

      // data-testid lands on the trigger; the reason tooltip anchors to the
      // control box around it.
      const container = screen
        .getByTestId('fruit-multi-selector')
        .closest('.astryx-multi-selector') as HTMLElement;
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent('Select a table first');

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
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
          isDisabled
          disabledMessage="Select a table first"
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
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
          disabledMessage="Select a table first"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the trigger focusable via aria-disabled when a reason is provided', () => {
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
          isDisabled
          disabledMessage="Select a table first"
        />,
      );
      const trigger = screen.getByRole('combobox');
      expect(trigger).not.toBeDisabled();
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      expect(trigger).toHaveAttribute('tabIndex', '0');
    });

    it('links the reason tooltip from the trigger via aria-describedby', () => {
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
          isDisabled
          disabledMessage="Select a table first"
        />,
      );
      const trigger = screen.getByRole('combobox');
      const tooltip = screen.getByRole('tooltip', h);
      expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks activation while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={onChange}
          isDisabled
          disabledMessage="Select a table first"
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await user.keyboard('{Enter}');
      await user.keyboard('{ArrowDown}');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('stays focusable when disabled without a reason (spec:AST-085 FR1)', () => {
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={[]}
          onChange={() => {}}
          isDisabled
        />,
      );
      const trigger = screen.getByRole('combobox');
      expect(trigger).not.toHaveAttribute('disabled');
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      expect(trigger).toHaveAttribute('tabIndex', '0');
    });
  });
  describe('isReadOnly', () => {
    const readOnlyCases = [
      {presentation: 'popover', hasSearch: false},
      {presentation: 'popover', hasSearch: true},
      {presentation: 'bottom-sheet', hasSearch: false},
      {presentation: 'bottom-sheet', hasSearch: true},
      {presentation: 'adaptive', hasSearch: false},
      {presentation: 'adaptive', hasSearch: true},
    ] as const;

    const sheetTransitionCases = [
      {presentation: 'bottom-sheet', hasSearch: false},
      {presentation: 'bottom-sheet', hasSearch: true},
      {presentation: 'adaptive', hasSearch: false},
      {presentation: 'adaptive', hasSearch: true},
    ] as const;

    const disabledPrecedenceCases = (
      ['popover', 'bottom-sheet', 'adaptive'] as const
    ).flatMap(presentation =>
      [false, true].flatMap(hasSearch =>
        [false, true].map(hasDisabledMessage => ({
          presentation,
          hasSearch,
          hasDisabledMessage,
        })),
      ),
    );

    function stubCompactTouch(presentation: 'bottom-sheet' | 'adaptive') {
      if (presentation !== 'adaptive') {
        return;
      }
      vi.mocked(matchMedia).mockImplementation(
        (query: string) =>
          ({
            matches: query === COMPACT_TOUCH_PRESENTATION_QUERY,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }) as MediaQueryList,
      );
    }

    it.each(readOnlyCases)(
      'uses a read-only combobox with no rendered popup ($presentation, search=$hasSearch)',
      async ({presentation, hasSearch}) => {
        const user = userEvent.setup();
        const {container} = render(
          <form>
            <MultiSelector
              label="Fruit"
              htmlName="fruit"
              options={defaultOptions}
              value={['Apple', 'Banana']}
              onChange={() => {}}
              hasClear
              hasSearch={hasSearch}
              presentation={presentation}
              isDefaultOpen
              triggerDisplay="labels"
              isReadOnly
            />
          </form>,
        );

        const trigger = screen.getByRole('combobox', {name: 'Fruit'});
        expect(trigger.tagName).toBe('BUTTON');
        expect(trigger).toHaveTextContent('Apple, Banana');
        expect(trigger).toHaveAttribute('aria-readonly', 'true');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        const readOnlyDescription = screen.getByText('Read only');
        expect(trigger.getAttribute('aria-describedby')).toContain(
          readOnlyDescription.id,
        );
        expect(trigger).not.toHaveAttribute('aria-controls');
        expect(trigger).not.toHaveAttribute('aria-haspopup');
        expect(screen.getAllByRole('combobox', h)).toHaveLength(1);
        expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', {name: 'Clear all Fruit'}),
        ).not.toBeInTheDocument();
        expect(
          container.querySelector('.astryx-multi-selector-indicator-icon'),
        ).toBeNull();
        expect(
          container.querySelector('.astryx-multi-selector'),
        ).toHaveAttribute('data-readonly', 'readonly');
        expect(
          new FormData(container.querySelector('form')!).getAll('fruit'),
        ).toEqual(['Apple', 'Banana']);

        await user.tab();
        expect(trigger).toHaveFocus();
      },
    );

    it('keeps loading feedback while blocking the selection surface', async () => {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={['Apple']}
          onChange={() => {}}
          isLoading
          isReadOnly
        />,
      );

      const trigger = screen.getByRole('combobox', {name: 'Fruit'});
      expect(trigger).toHaveAttribute('aria-busy', 'true');
      expectSilentBusySpinner();

      await user.click(trigger);
      expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
    });

    it('blocks pointer, keyboard, and typeahead changes', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const changeAction = vi.fn();
      render(
        <MultiSelector
          label="Fruit"
          options={defaultOptions}
          value={['Apple']}
          onChange={onChange}
          changeAction={changeAction}
          isReadOnly
        />,
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);
      trigger.focus();
      await user.keyboard('{Enter}{ArrowDown}b{Backspace}');

      expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      expect(changeAction).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      'restores popover focus when an open selector becomes read-only (search=%s)',
      async hasSearch => {
        const user = userEvent.setup();
        const selector = (isReadOnly: boolean) => (
          <MultiSelector
            label="Fruit"
            options={defaultOptions}
            value={['Apple']}
            onChange={() => {}}
            hasSearch={hasSearch}
            isReadOnly={isReadOnly}
          />
        );
        const {rerender} = render(selector(false));
        const editableTrigger = screen.getByRole(
          hasSearch ? 'button' : 'combobox',
          {name: 'Fruit'},
        );
        await user.click(editableTrigger);
        if (hasSearch) {
          await waitFor(() =>
            expect(screen.getByRole('combobox', h)).toHaveFocus(),
          );
        }

        rerender(selector(true));

        const readOnlyTrigger = screen.getByRole('combobox', {name: 'Fruit'});
        await waitFor(() => expect(readOnlyTrigger).toHaveFocus());
        expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
      },
    );

    it.each(sheetTransitionCases)(
      'finishes $presentation close and restores focus when read-only changes (search=$hasSearch)',
      async ({presentation, hasSearch}) => {
        stubCompactTouch(presentation);
        const user = userEvent.setup();
        const selector = (isReadOnly: boolean) => (
          <MultiSelector
            label="Fruit"
            options={defaultOptions}
            value={['Apple']}
            onChange={() => {}}
            hasSearch={hasSearch}
            presentation={presentation}
            isReadOnly={isReadOnly}
          />
        );
        const {rerender} = render(selector(false));
        const editableTrigger = screen.getByRole(
          hasSearch ? 'button' : 'combobox',
          {name: 'Fruit'},
        );
        await user.click(editableTrigger);
        const dialog = await screen.findByRole('dialog', {name: 'Fruit'});
        const panel = dialog.querySelector<HTMLElement>('.astryx-bottom-sheet');
        expect(panel).not.toBeNull();
        await waitFor(() =>
          expect(
            hasSearch
              ? screen.getByRole('combobox', h)
              : screen.getByRole('listbox'),
          ).toHaveFocus(),
        );

        rerender(selector(true));

        await waitFor(() => expect(dialog).toHaveAttribute('inert'));
        fireEvent.transitionEnd(panel!, {propertyName: 'transform'});
        const readOnlyTrigger = screen.getByRole('combobox', {name: 'Fruit'});
        await waitFor(() => expect(readOnlyTrigger).toHaveFocus());
        expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
        expect(screen.queryByRole('listbox', h)).not.toBeInTheDocument();
      },
    );

    it.each(disabledPrecedenceCases)(
      'matches disabled-only semantics for $presentation (search=$hasSearch, reason=$hasDisabledMessage)',
      async ({presentation, hasSearch, hasDisabledMessage}) => {
        if (presentation === 'adaptive') {
          stubCompactTouch(presentation);
        }
        const user = userEvent.setup();
        const onChange = vi.fn();
        const selector = (isReadOnly: boolean) => (
          <form>
            <MultiSelector
              label="Fruit"
              htmlName="fruit"
              options={defaultOptions}
              value={['Apple', 'Banana']}
              onChange={onChange}
              hasClear
              hasSearch={hasSearch}
              presentation={presentation}
              isDisabled
              isReadOnly={isReadOnly}
              disabledMessage={
                hasDisabledMessage ? 'Locked by policy' : undefined
              }
            />
          </form>
        );
        const {container, rerender} = render(selector(false));
        const getTrigger = () =>
          screen.getByRole(hasSearch ? 'button' : 'combobox', {name: 'Fruit'});
        const snapshot = () => {
          const trigger = getTrigger();
          const root = container.querySelector('.astryx-multi-selector');
          return {
            tagName: trigger.tagName,
            role: trigger.getAttribute('role'),
            hasPopup: trigger.getAttribute('aria-haspopup'),
            expanded: trigger.getAttribute('aria-expanded'),
            controls: trigger.getAttribute('aria-controls'),
            readOnly: trigger.getAttribute('aria-readonly'),
            disabled: trigger.matches(':disabled'),
            ariaDisabled: trigger.getAttribute('aria-disabled'),
            tabIndex: trigger.tabIndex,
            rootClassName: root?.className,
            rootDisabled: root?.getAttribute('data-disabled'),
            rootReadOnly: root?.getAttribute('data-readonly'),
            hasIndicator:
              root?.querySelector('.astryx-multi-selector-indicator-icon') !=
              null,
            listboxes: screen.queryAllByRole('listbox', h).length,
            dialogs: screen.queryAllByRole('dialog', h).length,
            formEntries: [
              ...new FormData(container.querySelector('form')!).entries(),
            ],
          };
        };
        const disabledOnly = snapshot();

        rerender(selector(true));

        expect(snapshot()).toEqual(disabledOnly);
        expect(disabledOnly.rootDisabled).toBe('disabled');
        expect(disabledOnly.rootReadOnly).toBeNull();
        expect(disabledOnly.readOnly).toBeNull();
        expect(disabledOnly.formEntries).toEqual([]);
        const trigger = getTrigger();
        await user.click(trigger);
        trigger.focus();
        await user.keyboard('{Enter}{ArrowDown}b{Backspace}');
        expect(onChange).not.toHaveBeenCalled();
      },
    );
  });

  describe('form participation', () => {
    it('submits one entry per selected value under htmlName', () => {
      const {container} = render(
        <form>
          <MultiSelector
            label="Fruit"
            htmlName="fruit"
            options={['Apple', 'Banana', 'Orange']}
            value={['Apple', 'Orange']}
            onChange={() => {}}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.getAll('fruit')).toEqual(['Apple', 'Orange']);
    });

    it('is excluded from form data when disabled', () => {
      const {container} = render(
        <form>
          <MultiSelector
            label="Fruit"
            htmlName="fruit"
            options={['Apple']}
            value={['Apple']}
            onChange={() => {}}
            isDisabled
          />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });
  });
});

describe('MultiSelector statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana']}
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
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana']}
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

  it('keeps the on-field status icon for the attached variant', () => {
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana']}
        value={[]}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    // Attached: the status glyph replaces the chevron indicator on the field.
    expect(
      container.querySelector('.astryx-multi-selector-indicator-icon'),
    ).toBeNull();
  });

  it('suppresses the on-field status icon for the detached variant', () => {
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana']}
        value={[]}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
        statusVariant="detached"
      />,
    );
    // Detached: the message box below carries its own leading icon, so the
    // field keeps its chevron indicator rather than duplicating the glyph.
    expect(
      container.querySelector('.astryx-multi-selector-indicator-icon'),
    ).not.toBeNull();
  });

  it.each(['secondary', 'ghost'] as const)(
    'detaches attached status by default for the %s variant',
    variant => {
      const {container} = render(
        <MultiSelector
          label="Fruit"
          options={['Apple', 'Banana']}
          value={[]}
          onChange={() => {}}
          variant={variant}
          status={{type: 'error', message: 'Required'}}
        />,
      );
      expect(container.querySelector('.astryx-multi-selector')).toHaveAttribute(
        'data-variant',
        variant,
      );
      expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
        'data-variant',
        'detached',
      );
    },
  );

  it('uses a status tooltip for ghost multi-selectors when requested', () => {
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana']}
        value={[]}
        onChange={() => {}}
        variant="ghost"
        status={{type: 'warning', message: 'Some rows are hidden'}}
        statusVariant="tooltip"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toBeNull();
    const statusButton = screen.getByRole('button', {
      name: /warning details/i,
    });
    const tooltip = screen.getByRole('tooltip', h);
    expect(tooltip).toHaveTextContent('Some rows are hidden');
    expect(statusButton.getAttribute('aria-describedby')).toContain(tooltip.id);
    expect(
      screen.getByRole('combobox').getAttribute('aria-describedby'),
    ).toContain(tooltip.id);
  });
});

describe('MultiSelector empty-state theme target', () => {
  const OPTIONS = ['Apple', 'Banana', 'Cherry'];

  it('renders the astryx-multi-selector-empty-state target on the "No results found" element', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await user.type(screen.getByRole('combobox', h), 'xyz');

    const empty = container.querySelector('.astryx-multi-selector-empty-state');
    expect(empty).not.toBeNull();
    expect(empty).toHaveTextContent('No results found');
  });
});

describe('MultiSelector clear icon theme target', () => {
  const ICON_OPTIONS = ['Apple', 'Banana', 'Orange'];

  // Resolve the clear glyph span (the astryx-icon element inside the clear
  // button), independent of the theme target class.
  const getClearIcon = (): HTMLElement => {
    const button = screen.getByRole('button', {name: 'Clear all Fruit'});
    const icon = button.querySelector('.astryx-icon');
    if (icon == null) {
      throw new Error('clear icon not found');
    }
    return icon as HTMLElement;
  };

  it('renders only the astryx-input-clear-icon target on the clear glyph', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={ICON_OPTIONS}
        value={['Banana']}
        onChange={() => {}}
        hasClear
      />,
    );
    // The canonical target lands on the icon element itself (not the button),
    // so a theme can restyle just this glyph (color, size, hover) via
    // `defineTheme` — a button-level target could not reach the icon's own
    // color/size.
    const icon = getClearIcon();
    expect(icon).toHaveClass('astryx-input-clear-icon');
    expect(icon).not.toHaveClass('astryx-multi-selector-clear-icon');
    expect(icon).toHaveClass('astryx-icon');
  });

  it('keeps the clear button functional alongside the target', () => {
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Fruit"
        options={ICON_OPTIONS}
        value={['Banana']}
        onChange={onChange}
        hasClear
      />,
    );
    const clear = screen.getByRole('button', {name: 'Clear all Fruit'});
    expect(clear.tagName).toBe('BUTTON');
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('routes the clear glyph through the shared clear button', () => {
    // The clear affordance composes the shared InputClearButton (a ghost Button
    // with a secondary/sm glyph), so the icon carries the canonical
    // `astryx-input-clear-icon` target. Aside from that target class it matches
    // the shared button's own `close`/`sm`/`secondary` glyph exactly, so the
    // default look is defined in one place.
    render(
      <MultiSelector
        label="Fruit"
        options={ICON_OPTIONS}
        value={['Banana']}
        onChange={() => {}}
        hasClear
      />,
    );
    const icon = getClearIcon();
    expect(icon).toHaveClass('astryx-input-clear-icon');
    expect(icon).not.toHaveClass('astryx-multi-selector-clear-icon');

    const {container: refContainer} = render(
      <Icon icon="close" size="sm" color="secondary" />,
    );
    const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;

    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => c !== 'astryx-input-clear-icon')
        .sort();

    expect(styleClasses(icon)).toEqual(styleClasses(refIcon));
  });

  it('uses input-clear-icon so a theme reaches the icon color, size, and hover', () => {
    // jsdom cannot resolve the @layer cascade, so the DOM-class assertion above
    // (target lands on the icon element) plus this generation assertion (the
    // theme emits same-element icon rules in @layer astryx-theme) together
    // prove the seam: a same-element theme rule wins over the icon's own
    // base-layer color/size.
    const theme = defineTheme({
      name: 'multi-selector-shared-clear-icon-test',
      components: {
        'input-clear-icon': {
          base: {
            width: '12px',
            height: '12px',
            fontSize: '12px',
            color: 'var(--color-icon-secondary)',
            ':hover': {color: 'var(--color-icon-primary)'},
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-input-clear-icon {');
    expect(css).toContain('width: 12px');
    expect(css).toContain('height: 12px');
    expect(css).toContain('.astryx-input-clear-icon:hover');
    expect(css).toContain('color: var(--color-icon-primary)');
  });
});

describe('MultiSelector indicator (chevron) icon theme target', () => {
  const ICON_OPTIONS = ['Apple', 'Banana', 'Orange'];

  const getIndicatorIcon = (container: HTMLElement): HTMLElement => {
    // The chevron is the only glyph carrying the indicator target class.
    const icon = container.querySelector(
      '.astryx-multi-selector-indicator-icon',
    );
    if (icon == null) {
      throw new Error('indicator icon not found');
    }
    return icon as HTMLElement;
  };

  it('renders the astryx-multi-selector-indicator-icon target on the chevron glyph', () => {
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={ICON_OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    );
    // The stable theme target lands on the icon element itself (not the trigger
    // button), so a theme can restyle just this glyph (color, size, hover) —
    // and each open/closed state — via `defineTheme`. A button-level target
    // could not reach the icon's own color/size.
    const icon = getIndicatorIcon(container);
    expect(icon).toHaveClass('astryx-multi-selector-indicator-icon');
    expect(icon).toHaveClass('astryx-icon');
    // Open/closed state is reflected so a theme can target each state alone.
    expect(icon).toHaveAttribute('data-state', 'collapsed');
  });

  it('reflects the expanded state on the chevron when the popover is open', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={ICON_OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(getIndicatorIcon(container)).toHaveAttribute(
        'data-state',
        'expanded',
      );
    });
  });

  it('renders the default icon (secondary color, sm size) byte-identically', () => {
    // Pixel-identical default guard: the chevron glyph must carry the exact
    // same StyleX color/size classes as a standalone secondary/sm icon. The
    // glyph now sets --color-icon-secondary itself rather than inheriting it
    // from a wrapper span that set the same token, so the rendered color is
    // unchanged. The added
    // target class + data-state are purely additive — they change nothing until
    // a theme targets them.
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={ICON_OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    );
    const icon = getIndicatorIcon(container);

    const {container: refContainer} = render(
      <Icon icon="chevronDown" size="sm" color="secondary" />,
    );
    const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;

    // Exclude the additive theme-target classes (the stable target + its
    // reflected state class) so only StyleX classes remain.
    const themeTargetClasses = new Set([
      'astryx-multi-selector-indicator-icon',
      'collapsed',
      'expanded',
    ]);
    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => !themeTargetClasses.has(c))
        .sort();

    // A superset, not an exact match: the chevron additionally carries the
    // rotation styles, which live on the glyph precisely so a theme can reach
    // the transform through the same selector as the color. The guard that
    // matters is that every color/size class of a standalone icon is still
    // present — i.e. the default look has not drifted.
    expect(styleClasses(icon)).toEqual(
      expect.arrayContaining(styleClasses(refIcon)),
    );
  });

  it('exposes multi-selector-indicator-icon so a theme reaches the icon size and per-state color', () => {
    // jsdom cannot resolve the @layer cascade, so the DOM-class assertions
    // above (target lands on the icon element) plus this generation assertion
    // (the theme emits same-element icon rules in @layer astryx-theme) together
    // prove the seam: a same-element theme rule wins over the icon's own
    // base-layer color/size.
    const theme = defineTheme({
      name: 'multi-selector-indicator-icon-test',
      components: {
        'multi-selector-indicator-icon': {
          base: {width: '14px', height: '14px', fontSize: '14px'},
          'state:expanded': {color: 'var(--color-icon-primary)'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-multi-selector-indicator-icon {');
    expect(css).toContain('width: 14px');
    expect(css).toContain('height: 14px');
    expect(css).toContain(
      '.astryx-multi-selector-indicator-icon[data-state="expanded"]',
    );
    expect(css).toContain('color: var(--color-icon-primary)');
  });
});

describe('MultiSelector list structure', () => {
  it('does not draw a divider under select-all', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSelectAll
      />,
    );
    await user.click(screen.getByRole('combobox'));
    // Select-all is the first row of the list, not a section of its own. No
    // option here declares a divider and there is no search row, so the panel
    // should contain no rule at all.
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(0);
    const [first] = screen.getAllByRole('option', h);
    expect(first).toHaveTextContent('Select all');
  });

  it('renders a section title as a plain heading inside the group, not a divider', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[
          {
            type: 'section',
            title: 'Citrus',
            options: [
              {value: 'orange', label: 'Orange'},
              {value: 'lemon', label: 'Lemon'},
            ],
          },
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    // A labeled Divider used to stand in for the heading; it rendered a
    // role="separator" as a direct child of the listbox and stacked a second
    // rule under the search row's own.
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(0);

    const group = screen.getByRole('group', {name: 'Citrus', ...h});
    const heading = group.querySelector(
      '.astryx-multi-selector-section-heading',
    );
    expect(heading).toBeTruthy();
    expect(heading).toHaveTextContent('Citrus');
    // The group already carries the title as its accessible name, so the
    // visible heading must not announce it a second time.
    expect(heading).toHaveAttribute('aria-hidden', 'true');
    // ...and it precedes the options it heads.
    const [firstOption] = within(group).getAllByRole('option', h);
    expect(
      heading!.compareDocumentPosition(firstOption) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('hides a standalone divider from the accessibility tree (#4994)', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', {type: 'divider'}, 'Banana']}
        value={[]}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    // role="listbox" only permits option/group children. The divider still
    // renders role="separator" (unchanged visual/DOM), but must be excluded
    // from the accessibility tree so it never reaches the listbox's exposed
    // children (axe aria-required-children).
    const divider = document.querySelector('[role="separator"]');
    expect(divider).toBeTruthy();
    expect(divider).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('MultiSelector search affordances', () => {
  it('renders the search row seamlessly — no nested input box, a divider under it', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));

    const search = screen.getByRole('combobox', h);
    // The row is the outer gutter; the input sits inside the rounded field.
    const row = search.closest('.astryx-multi-selector-search');
    const field = search.parentElement;
    if (!row || !field) {
      throw new Error('search row not found');
    }
    // The panel is already a bordered surface: the field inside it must not be
    // a second bordered box (this used to render a TextInput).
    expect(row).not.toHaveClass('astryx-text-input');
    expect(search.closest('.astryx-text-input')).toBeNull();
    // The field is a rounded box inset from the panel edge, shaped like the
    // option rows under it — not a full-bleed header strip.
    expect(field).not.toBe(row);
    // ...and a divider separates it from the options.
    const separator = document.querySelector('[role="separator"]');
    if (!separator) {
      throw new Error('divider not found');
    }
    // Order: row, then divider, then the listbox.
    expect(
      row.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const listbox = screen.getByRole('listbox', h);
    expect(
      separator.compareDocumentPosition(listbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the search row outside the scrolling option list', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    // The options scroll under the header rather than carrying it away, so the
    // field stays reachable in a long list.
    const search = screen.getByRole('combobox', h);
    const listbox = screen.getByRole('listbox', h);
    expect(listbox.contains(search)).toBe(false);
  });

  it('renders a decorative (aria-hidden) magnifier icon whenever hasSearch is on', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    // The magnifier leads the search row, as a sibling of the <input>.
    const wrapper = search.parentElement;
    const magnifier = wrapper?.querySelector('.astryx-icon');
    expect(magnifier).toBeTruthy();
    expect(magnifier?.getAttribute('aria-hidden')).toBe('true');
    expect(magnifier?.getAttribute('aria-label')).toBeNull();
  });

  it('renders the clear button once a query is typed and clears + refocuses on click', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'ap');
    expect(search).toHaveValue('ap');

    // The clear button is TextInput's built-in hasClear affordance; its name is
    // derived from the field label ("Search options").
    const clear = screen.getByRole('button', {
      name: 'Clear Search options',
      hidden: true,
    });

    await user.click(clear);
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
  });

  it('does not render the clear button when the query is empty', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    expect(
      screen.queryByRole('button', {
        name: 'Clear Search options',
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });

  it('keeps the combobox contract on the input, not the affordances', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const search = screen.getByRole('combobox', h);
    expect(search.tagName).toBe('INPUT');
    expect(search).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('tabs from the search input to the clear button (keeping the popup open) when a query is showing it', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    const trigger = screen.getByRole('button', {name: 'Fruit'});
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'ap');
    expect(search).toHaveFocus();

    // Forward-tab lands on the clear (✕) button and the popup stays open, so
    // the affordance is keyboard-reachable rather than being skipped when the
    // input's Tab dismisses the popup.
    await user.tab();
    const clear = screen.getByRole('button', {
      name: 'Clear Search options',
      hidden: true,
    });
    expect(clear).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('dismisses on Tab from the search input when there is no query (no clear button)', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Fruit'});
    await user.click(trigger);
    const search = screen.getByRole('combobox', h);
    // Focus moves into the search input on open (via rAF).
    await waitFor(() => expect(search).toHaveFocus());

    // With no query there is no clear button, so Tab dismisses the popup as a
    // plain combobox does.
    await user.tab();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('MultiSelector disabled state theme target', () => {
  const getSelectorRoot = (container: HTMLElement): HTMLElement => {
    const root = container.querySelector('.astryx-multi-selector');
    if (root == null) {
      throw new Error('multi-selector root not found');
    }
    return root as HTMLElement;
  };

  it('reflects data-state="disabled" on the root when disabled', () => {
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
        isDisabled
      />,
    );
    expect(getSelectorRoot(container)).toHaveAttribute(
      'data-disabled',
      'disabled',
    );
  });

  it('omits the disabled class/attribute when enabled', () => {
    const {container} = render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={() => {}}
      />,
    );
    const root = getSelectorRoot(container);
    expect(root).not.toHaveAttribute('data-disabled');
    expect(root).not.toHaveAttribute('data-disabled');
  });

  it('exposes the disabled state so a theme can key on it', () => {
    const theme = defineTheme({
      name: 'multi-selector-disabled-state-test',
      components: {
        'multi-selector': {
          'disabled:disabled': {opacity: '0.4'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-multi-selector[data-disabled="disabled"]');
    expect(css).toContain('opacity: 0.4');
  });
});

describe('MultiSelector dropdown option theme target', () => {
  const ROW_OPTIONS = ['Apple', 'Banana', 'Orange'];

  it('renders astryx-multi-selector-option, with its size, on every dropdown row', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={ROW_OPTIONS}
        value={[]}
        onChange={() => {}}
        size="lg"
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option', h);
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option).toHaveClass('astryx-multi-selector-option');
      expect(option).toHaveAttribute('data-size', 'lg');
      expect(option).toHaveAttribute('data-size', 'lg');
    }
  });

  it('carries the selected and disabled states a theme keys on', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[
          {value: 'apple', label: 'Apple'},
          {value: 'banana', label: 'Banana'},
          {value: 'orange', label: 'Orange', disabled: true},
        ]}
        value={['apple']}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const [selected, plain, disabled] = screen.getAllByRole('option', h);

    expect(selected).toHaveAttribute('data-selected', 'selected');
    expect(selected).toHaveAttribute('data-selected', 'selected');
    expect(plain).not.toHaveAttribute('data-selected');
    expect(plain).not.toHaveAttribute('data-selected');

    expect(disabled).toHaveAttribute('data-disabled', 'disabled');
    expect(disabled).toHaveAttribute('data-disabled', 'disabled');
    expect(plain).not.toHaveAttribute('data-disabled');
  });

  it('marks the Select All row with the select-all state, not a separate target', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={ROW_OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSelectAll
      />,
    );
    await user.click(screen.getByRole('combobox'));

    const [selectAllRow, ...regularRows] = screen.getAllByRole('option', h);
    expect(selectAllRow).toHaveTextContent('Select all');
    expect(selectAllRow).toHaveClass('astryx-multi-selector-option');
    expect(selectAllRow).toHaveAttribute('data-select-all', 'select-all');
    expect(selectAllRow).toHaveAttribute('data-select-all', 'select-all');

    for (const row of regularRows) {
      expect(row).toHaveClass('astryx-multi-selector-option');
      expect(row).not.toHaveClass('select-all');
      expect(row).not.toHaveAttribute('data-select-all');
    }
  });

  it('keeps the row targetable when renderOption replaces the label', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={[{value: 'apple', label: 'Apple'}]}
        value={[]}
        onChange={() => {}}
        renderOption={option => (
          <span data-testid="custom-row">{option.label}</span>
        )}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const option = screen.getAllByRole('option', h)[0];
    // The row owns the typography, so custom content inherits the same
    // treatment the fallback label gets — and one row override reaches both.
    expect(option).toHaveClass('astryx-multi-selector-option');
    expect(within(option).getByTestId('custom-row')).toHaveTextContent('Apple');
  });

  it('exposes the row target, its states and its size to defineTheme', () => {
    const theme = defineTheme({
      name: 'multi-selector-option-target-test',
      components: {
        'multi-selector-option': {
          base: {borderRadius: '8px', fontWeight: '600'},
          selected: {backgroundColor: 'var(--color-background-muted)'},
          'select-all': {fontWeight: '700'},
          'size:lg': {borderRadius: '12px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-multi-selector-option {');
    expect(css).toContain(
      '.astryx-multi-selector-option[data-selected="selected"]',
    );
    expect(css).toContain(
      '.astryx-multi-selector-option[data-select-all="select-all"]',
    );
    expect(css).toContain('.astryx-multi-selector-option[data-size="lg"]');
  });
});

describe('MultiSelector popup theme target', () => {
  it('puts astryx-multi-selector-popup on the surface that paints, not the list inside it', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana']}
        value={[]}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox', {name: /Fruit/}));

    const popup = document.querySelector(
      '.astryx-multi-selector-popup',
    ) as HTMLElement;
    expect(popup).not.toBeNull();
    expect(popup).toHaveClass('astryx-popover');
    // The scrolling list is a descendant, not the target itself.
    expect(popup.querySelector('[role="listbox"]')).not.toBeNull();
    expect(popup.getAttribute('role')).toBeNull();

    const layer = document.querySelector('[popover]') as HTMLElement;
    expect(popup).not.toBe(layer);
    expect(layer.contains(popup)).toBe(true);
  });

  it('stays closed when the trigger click follows its own light dismiss (#5004)', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Cherry']}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The browser dismissed the popup on pointerup and queued the toggle. When
    // that event lands before the click — WebKit, or any engine under load —
    // the click used to read a closed popup and reopen it.
    fireEvent.pointerDown(trigger);
    const popover = document.querySelector('[popover]') as HTMLElement;
    act(() => {
      popover.dispatchEvent(
        Object.assign(new Event('toggle'), {
          oldState: 'open',
          newState: 'closed',
        }),
      );
    });
    // Synchronously: the click falls inside the one gesture the guard covers,
    // as it does in a browser a few milliseconds behind the dismissal.
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.parentElement).toHaveClass(
      stylex.props(selectorPresentationStyles.pointerRestoredFocus).className!,
    );
  });
});

describe('MultiSelector trigger render prop', () => {
  const OPTIONS = [
    {value: 'bug', label: 'Bug'},
    {value: 'feature', label: 'Feature'},
    {value: 'docs', label: 'Docs'},
  ];

  it('renders the caller control instead of the field and button', () => {
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        renderTrigger={props => (
          <button type="button" {...props}>
            Pick labels
          </button>
        )}
      />,
    );
    const opener = screen.getByRole('button', {name: 'Pick labels'});
    expect(opener).toHaveAttribute('aria-haspopup', 'listbox');
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    expect(opener).toHaveAttribute('aria-controls');
    // No field chrome: exactly one button, and no Field label element.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('Labels')).toBeNull();
  });

  it('opens against the caller control and names the listbox by label', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={['bug']}
        onChange={() => {}}
        renderTrigger={props => (
          <button type="button" {...props}>
            Pick labels
          </button>
        )}
      />,
    );
    const opener = screen.getByRole('button', {name: 'Pick labels'});
    await user.click(opener);

    expect(opener).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox', {name: 'Labels', ...h});
    expect(opener.getAttribute('aria-controls')).toBe(listbox.id);
    expect(screen.getAllByRole('option', h)).toHaveLength(3);
    expect(screen.getByRole('option', {name: 'Bug', ...h})).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('the listbox owns the keyboard once open and toggles on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        renderTrigger={props => (
          <button type="button" {...props}>
            Pick labels
          </button>
        )}
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Pick labels'}));
    const listbox = screen.getByRole('listbox', h);
    expect(listbox).toHaveAttribute('tabindex', '0');
    await waitFor(() => expect(listbox).toHaveFocus());

    // Opening by click highlights the first option; Enter toggles it.
    fireEvent.keyDown(listbox, {key: 'ArrowDown'});
    fireEvent.keyDown(listbox, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith(['feature']);
  });

  it('handleRef opens and closes the panel and onOpenChange reports it', async () => {
    const onOpenChange = vi.fn();
    function Harness() {
      const handleRef = useRef<MultiSelectorHandle>(null);
      return (
        <>
          <button type="button" onClick={() => handleRef.current?.open()}>
            open from outside
          </button>
          <button type="button" onClick={() => handleRef.current?.close()}>
            close from outside
          </button>
          <MultiSelector
            label="Labels"
            options={OPTIONS}
            value={[]}
            onChange={() => {}}
            handleRef={handleRef}
            onOpenChange={onOpenChange}
            renderTrigger={props => (
              <button type="button" {...props}>
                anchor
              </button>
            )}
          />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const anchor = screen.getByRole('button', {name: 'anchor'});
    expect(anchor).toHaveAttribute('aria-expanded', 'false');
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', {name: 'open from outside'}));
    expect(anchor).toHaveAttribute('aria-expanded', 'true');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', {name: 'close from outside'}));
    await waitFor(() => {
      expect(anchor).toHaveAttribute('aria-expanded', 'false');
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('the handle does not open a disabled selector', () => {
    const handleRef = {current: null as MultiSelectorHandle | null};
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        isDisabled
        handleRef={handleRef}
        renderTrigger={props => (
          <button type="button" {...props}>
            anchor
          </button>
        )}
      />,
    );
    act(() => {
      handleRef.current?.open();
    });
    expect(handleRef.current?.isOpen()).toBe(false);
    expect(screen.getByRole('button', {name: 'anchor'})).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('MultiSelector renderTrigger — read-only', () => {
  it("a read-only selector advertises no panel on the caller's control", () => {
    // spec:AST-011 FR4. A read-only selector has no surface to open, so a
    // control that says "collapsed, has popup" sends a screen-reader user
    // to press Enter on something that cannot respond — with nothing to
    // tell them the value is read-only rather than the control broken.
    const onOpen = vi.fn();
    render(
      <MultiSelector
        label="Labels"
        value={['a']}
        onChange={() => {}}
        isReadOnly
        options={[
          {value: 'a', label: 'Alpha'},
          {value: 'b', label: 'Beta'},
        ]}
        renderTrigger={props => (
          <button type="button" {...props} onClick={onOpen}>
            Labels
          </button>
        )}
      />,
    );

    const trigger = screen.getByRole('button', {name: 'Labels'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    expect(trigger).not.toHaveAttribute('aria-controls');
    // Withholding the disclosure attributes stops the control lying about a
    // panel; this says why it does not open, which the field path conveys
    // through chrome the caller's control does not have.
    expect(trigger).toHaveAttribute('aria-readonly', 'true');
  });

  it('still advertises the panel when the selector is not read-only', () => {
    render(
      <MultiSelector
        label="Labels"
        value={[]}
        onChange={() => {}}
        options={[{value: 'a', label: 'Alpha'}]}
        renderTrigger={props => (
          <button type="button" {...props}>
            Labels
          </button>
        )}
      />,
    );

    const trigger = screen.getByRole('button', {name: 'Labels'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
  });
});

describe('MultiSelector renderTrigger — focus return', () => {
  it('returns focus to a control that takes no focus of its own', async () => {
    // A glyph is not keyboard-openable, but when it IS opened by pointer the
    // panel still has to give focus back somewhere the person recognises.
    // Without the fallback focus lands on the body and they lose their place.
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        value={[]}
        onChange={() => {}}
        options={[
          {value: 'a', label: 'Alpha'},
          {value: 'b', label: 'Beta'},
        ]}
        renderTrigger={props => (
          <span {...props} data-testid="glyph">
            #
          </span>
        )}
      />,
    );

    const glyph = screen.getByTestId('glyph');
    expect(glyph).toHaveAttribute('tabindex', '-1');

    await user.click(glyph);
    await waitFor(() => expect(glyph).toHaveAttribute('aria-expanded', 'true'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(glyph).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it('leaves a real control\u2019s own focusability alone', () => {
    render(
      <MultiSelector
        label="Labels"
        value={[]}
        onChange={() => {}}
        options={[{value: 'a', label: 'Alpha'}]}
        renderTrigger={props => (
          <button type="button" {...props}>
            Labels
          </button>
        )}
      />,
    );

    expect(screen.getByRole('button', {name: 'Labels'})).not.toHaveAttribute(
      'tabindex',
    );
  });
});

describe('MultiSelector hasCreate', () => {
  const OPTIONS = [
    {value: 'bug', label: 'Bug'},
    {value: 'feature', label: 'Feature'},
    {value: 'cafe', label: 'Café'},
  ];

  it('offers Create "<query>" first and reports the creation through onChange', async () => {
    const user = userEvent.setup();
    const onChange =
      vi.fn<(value: string[], change?: MultiSelectorChange) => void>();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={['bug']}
        onChange={onChange}
        hasSearch
        hasCreate
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'Urgent');

    const options = screen.getAllByRole('option', h);
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Create "Urgent"');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[0].querySelector('input[type="checkbox"]')).toBeNull();
    expect(screen.queryByText('No results found')).toBeNull();

    await user.click(options[0]);
    // One update: the query joins the value and the change says it is a
    // creation, so the caller adds the option and accepts the value together.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['bug', 'Urgent'], {
      type: 'create',
      query: 'Urgent',
    });
    // The filter is cleared so the option the caller adds is visible.
    expect(search).toHaveValue('');
  });

  it('a plain toggle passes no descriptor, so a one-argument handler is unchanged', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        hasSearch
        hasCreate
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    await user.click(screen.getByRole('option', {name: 'Bug', ...h}));
    expect(onChange).toHaveBeenCalledWith(['bug']);
    expect(onChange.mock.calls[0]).toHaveLength(1);
  });

  it('sits above partial matches and is skipped for a label the filter matches exactly', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
        hasCreate
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    const search = screen.getByRole('combobox', h);

    await user.type(search, 'Bu');
    expect(screen.getAllByRole('option', h).map(o => o.textContent)).toEqual([
      'Create "Bu"',
      'Bug',
    ]);

    await user.type(search, 'g');
    expect(screen.getAllByRole('option', h).map(o => o.textContent)).toEqual([
      'Bug',
    ]);

    await user.clear(search);
    await user.type(search, 'bug');
    // Case-insensitive, like the filter: "bug" is Bug, so nothing to create.
    expect(screen.getAllByRole('option', h).map(o => o.textContent)).toEqual([
      'Bug',
    ]);

    await user.clear(search);
    await user.type(search, 'CAFE');
    // The duplicate rule is the filter's rule: the filter cannot surface
    // Café for CAFE, so refusing to create would be a dead end.
    expect(screen.getAllByRole('option', h).map(o => o.textContent)).toEqual([
      'Create "CAFE"',
    ]);
  });

  it('leads the select-all row and is not handed to renderOption', async () => {
    const user = userEvent.setup();
    const renderOption = vi.fn((option: {label?: string}) => (
      <span>{`row:${option.label}`}</span>
    ));
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
        hasSelectAll
        hasCreate
        renderOption={renderOption}
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    await user.type(screen.getByRole('combobox', h), 'Bu');
    const options = screen.getAllByRole('option', h);
    expect(options[0]).toHaveTextContent('Create "Bu"');
    expect(options[1]).toHaveTextContent('Select all');
    expect(options[2]).toHaveTextContent('row:Bug');
    expect(
      renderOption.mock.calls.some(([option]) =>
        (option.label ?? '').startsWith('Create'),
      ),
    ).toBe(false);
  });

  it('Enter with nothing highlighted commits the create row; ArrowDown reaches it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        hasSearch
        hasCreate
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'Urgent');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['Urgent'], {
      type: 'create',
      query: 'Urgent',
    });

    await user.type(search, 'Later');
    fireEvent.keyDown(search, {key: 'ArrowDown'});
    const createRow = screen.getByRole('option', {
      name: 'Create "Later"',
      ...h,
    });
    expect(search).toHaveAttribute('aria-activedescendant', createRow.id);
    fireEvent.keyDown(search, {key: 'Enter'});
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining(['Later']),
      {type: 'create', query: 'Later'},
    );
  });

  it('offers nothing while isLoading, and Enter commits nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const {rerender} = render(
      <MultiSelector
        label="Labels"
        options={[]}
        value={[]}
        onChange={onChange}
        hasSearch
        hasCreate
        isLoading
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'Bug');
    expect(screen.queryAllByRole('option', h)).toHaveLength(0);
    expect(politeRegion()?.textContent ?? '').toBe('');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();

    // The options land: Bug exists, so still no create row for "Bug" — the
    // duplicate the gate was there to prevent.
    rerender(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        hasSearch
        hasCreate
      />,
    );
    expect(screen.getAllByRole('option', h).map(o => o.textContent)).toEqual([
      'Bug',
    ]);
  });

  it('announces the create row, not "No results found", when it is the only result', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
        hasCreate
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    await enterQuery(user, screen.getByRole('combobox', h), 'Urgent');
    // The empty-state message is role="presentation", so the live region is
    // what a screen reader gets — it must say what is on screen: a row.
    await waitFor(() => {
      expect(politeRegion()?.textContent).toBe('Create "Urgent"');
    });
  });

  it('warns in development and offers nothing when hasCreate is set without hasSearch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Labels"
          options={OPTIONS}
          value={[]}
          onChange={() => {}}
          hasCreate
        />,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/MultiSelector[\s\S]*hasSearch/),
      );
      await user.click(screen.getByRole('combobox', {name: 'Labels'}));
      // No search input, no query, no create row: the three real options only.
      expect(
        screen.queryByRole('combobox', {name: /search/i, ...h}),
      ).toBeNull();
      expect(screen.getAllByRole('option', h)).toHaveLength(3);
    } finally {
      warn.mockRestore();
    }
  });

  it('is off by default', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    await user.type(screen.getByRole('combobox', h), 'Urgent');
    expect(screen.queryAllByRole('option', h)).toHaveLength(0);
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });
});

describe('MultiSelector option actions (grid)', () => {
  const edit = vi.fn();
  const OPTIONS = [
    {
      value: 'bug',
      label: 'Bug',
      action: (
        <button
          type="button"
          onClick={() => {
            edit('bug');
          }}>
          Edit Bug
        </button>
      ),
    },
    {value: 'feature', label: 'Feature'},
    {
      value: 'docs',
      label: 'Docs',
      disabled: true,
      action: (
        <button
          type="button"
          onClick={() => {
            edit('docs');
          }}>
          Edit Docs
        </button>
      ),
    },
  ];
  beforeEach(() => {
    edit.mockClear();
  });

  it('stays a listbox when no option carries an action, and action: null is none', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={[
          {value: 'bug', label: 'Bug', action: null},
          {value: 'feature', label: 'Feature'},
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    await user.click(trigger);
    expect(screen.getByRole('listbox', h)).toBeInTheDocument();
    expect(screen.queryByRole('grid', h)).toBeNull();
    expect(screen.getAllByRole('option', h)).toHaveLength(2);
  });

  it('is a grid of rows with exactly two gridcells once an option carries an action', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={['bug']}
        onChange={() => {}}
        hasSelectAll
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'grid');
    await user.click(trigger);

    const grid = screen.getByRole('grid', h);
    expect(screen.queryByRole('listbox', h)).toBeNull();
    expect(screen.queryByRole('option', h)).toBeNull();
    expect(grid).toHaveAttribute('aria-multiselectable', 'true');
    expect(trigger.getAttribute('aria-controls')).toBe(grid.id);

    const rows = screen.getAllByRole('row', h);
    // select-all + 3 options
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const cells = Array.from(row.children);
      expect(cells).toHaveLength(2);
      expect(cells[0]).toHaveAttribute('role', 'gridcell');
      expect(cells[1]).toHaveAttribute('role', 'gridcell');
    }
    // Every exposed child of the grid is a row.
    expect(
      Array.from(grid.children).every(c => c.getAttribute('role') === 'row'),
    ).toBe(true);

    const bug = screen.getByRole('row', {name: 'Bug', ...h});
    expect(bug).toHaveAttribute('aria-selected', 'true');
    expect(bug.children[1]).toContainElement(
      screen.getByRole('button', {name: 'Edit Bug', ...h}),
    );
    // Rows without an action, and the select-all row, have an empty cell.
    expect(
      screen.getByRole('row', {name: 'Feature', ...h}).children[1],
    ).toBeEmptyDOMElement();
    expect(rows[0].children[1]).toBeEmptyDOMElement();
    // The row's name is the option; the control keeps its own.
    expect(bug).toHaveAccessibleName('Bug');
  });

  it('latches: a query that filters the actioned option out keeps the grid', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    expect(screen.getByRole('grid', h)).toBeInTheDocument();
    await user.type(screen.getByRole('combobox', h), 'Feat');
    expect(screen.getAllByRole('row', h).map(r => r.textContent)).toEqual([
      'Feature',
    ]);
    expect(screen.getByRole('grid', h)).toBeInTheDocument();
    // The action removed on a later render: still a grid.
    rerender(
      <MultiSelector
        label="Labels"
        options={[{value: 'feature', label: 'Feature'}]}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    expect(screen.getByRole('grid', h)).toBeInTheDocument();
  });

  it('becomes a grid when options arrive after loading, inside a section too', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <MultiSelector
        label="Labels"
        options={[]}
        value={[]}
        onChange={() => {}}
        isLoading
      />,
    );
    expect(screen.getByRole('combobox', {name: 'Labels'})).toHaveAttribute(
      'aria-haspopup',
      'listbox',
    );
    rerender(
      <MultiSelector
        label="Labels"
        options={[
          {
            type: 'section',
            title: 'Type',
            options: OPTIONS,
          },
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'grid');
    await user.click(trigger);
    const group = screen.getByRole('rowgroup', {name: 'Type', ...h});
    expect(screen.queryByRole('group', h)).toBeNull();
    expect(group.querySelectorAll('[role="row"]')).toHaveLength(3);
  });

  it('pressing the option cell toggles; pressing the action fires only the action', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('combobox', {name: 'Labels'}));
    const bug = screen.getByRole('row', {name: 'Bug', ...h});
    await user.click(bug.children[0]);
    expect(onChange).toHaveBeenCalledWith(['bug']);

    onChange.mockClear();
    await user.click(screen.getByRole('button', {name: 'Edit Bug', ...h}));
    expect(edit).toHaveBeenCalledWith('bug');
    expect(onChange).not.toHaveBeenCalled();
    // The panel stays open.
    expect(screen.getByRole('grid', h)).toBeInTheDocument();

    // A disabled option's action is the caller's control, still live.
    await user.click(screen.getByRole('button', {name: 'Edit Docs', ...h}));
    expect(edit).toHaveBeenCalledWith('docs');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws the standard focus ring on the active action cell, from the focus tokens', async () => {
    // jsdom resolves no custom property, so the ring is read from StyleX
    // classes: a class name hashes one property and its value, and the same
    // declaration yields the same class wherever it is written.
    const ring = stylex.create({
      active: {
        outlineWidth: focusVars['--focus-outline-width'],
        outlineStyle: focusVars['--focus-outline-style'],
        outlineColor: focusVars['--focus-outline-color'],
        outlineOffset: focusVars['--focus-outline-offset'],
      },
    });
    const ringClasses = stylex
      .props(ring.active)
      .className!.split(' ')
      .filter(token => /^x[a-z0-9]+$/.test(token));
    expect(ringClasses).toHaveLength(4);

    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    await user.click(trigger);
    const bug = screen.getByRole('row', {name: 'Bug', ...h});
    const actionCell = bug.children[1] as HTMLElement;
    for (const token of ringClasses) {
      expect(actionCell).not.toHaveClass(token);
    }
    fireEvent.keyDown(trigger, {key: 'ArrowRight'});
    expect(trigger).toHaveAttribute('aria-activedescendant', actionCell.id);
    for (const token of ringClasses) {
      expect(actionCell).toHaveClass(token);
    }
  });

  it('draws no focus ring on an action cell highlighted after pointer input, until a key moves the highlight', async () => {
    const ring = stylex.create({
      active: {
        outlineWidth: focusVars['--focus-outline-width'],
        outlineStyle: focusVars['--focus-outline-style'],
        outlineColor: focusVars['--focus-outline-color'],
        outlineOffset: focusVars['--focus-outline-offset'],
      },
    });
    const ringClasses = stylex
      .props(ring.active)
      .className!.split(' ')
      .filter(token => /^x[a-z0-9]+$/.test(token));
    expect(ringClasses).toHaveLength(4);

    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    await user.click(trigger);
    const bug = screen.getByRole('row', {name: 'Bug', ...h});
    const actionCell = bug.children[1] as HTMLElement;
    fireEvent.mouseEnter(actionCell);
    // The hover moved the highlight onto the action cell, without the ring.
    expect(trigger).toHaveAttribute('aria-activedescendant', actionCell.id);
    for (const token of ringClasses) {
      expect(actionCell).not.toHaveClass(token);
    }
    // Keyboard navigation back onto the cell draws it.
    fireEvent.keyDown(trigger, {key: 'ArrowLeft'});
    fireEvent.keyDown(trigger, {key: 'ArrowRight'});
    expect(trigger).toHaveAttribute('aria-activedescendant', actionCell.id);
    for (const token of ringClasses) {
      expect(actionCell).toHaveClass(token);
    }
  });

  describe('ring under mixed input', () => {
    const ringClasses = () => {
      const ring = stylex.create({
        active: {
          outlineWidth: focusVars['--focus-outline-width'],
          outlineStyle: focusVars['--focus-outline-style'],
          outlineColor: focusVars['--focus-outline-color'],
          outlineOffset: focusVars['--focus-outline-offset'],
        },
      });
      return stylex
        .props(ring.active)
        .className!.split(' ')
        .filter(token => /^x[a-z0-9]+$/.test(token));
    };
    const hasRing = (cell: HTMLElement) =>
      ringClasses().every(token => cell.classList.contains(token));

    async function openWithKeyboardOnBugAction() {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Labels"
          options={OPTIONS}
          value={[]}
          onChange={() => {}}
        />,
      );
      const trigger = screen.getByRole('combobox', {name: 'Labels'});
      await user.click(trigger);
      const row = (name: string) => screen.getByRole('row', {name, ...h});
      fireEvent.keyDown(trigger, {key: 'ArrowRight'});
      const bugAction = row('Bug').children[1] as HTMLElement;
      expect(trigger).toHaveAttribute('aria-activedescendant', bugAction.id);
      expect(hasRing(bugAction)).toBe(true);
      return {trigger, row, bugAction};
    }

    it('keeps the ring when the pointer crosses a disabled option the highlight ignores', async () => {
      const {trigger, row, bugAction} = await openWithKeyboardOnBugAction();
      fireEvent.mouseEnter(row('Docs').children[0]);
      expect(trigger).toHaveAttribute('aria-activedescendant', bugAction.id);
      expect(hasRing(bugAction)).toBe(true);
    });

    it('follows the keyboard modality when a hover moves the highlight to another action', async () => {
      const {trigger, row} = await openWithKeyboardOnBugAction();
      const docsAction = row('Docs').children[1] as HTMLElement;
      fireEvent.mouseEnter(docsAction);
      expect(trigger).toHaveAttribute('aria-activedescendant', docsAction.id);
      expect(hasRing(docsAction)).toBe(true);
    });

    it('draws no ring for a modifier chord after pointer input', async () => {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Labels"
          options={OPTIONS}
          value={[]}
          onChange={() => {}}
        />,
      );
      const trigger = screen.getByRole('combobox', {name: 'Labels'});
      await user.click(trigger);
      const bugAction = screen.getByRole('row', {name: 'Bug', ...h})
        .children[1] as HTMLElement;
      fireEvent.mouseEnter(bugAction);
      expect(hasRing(bugAction)).toBe(false);
      fireEvent.keyDown(trigger, {key: 'ArrowRight', ctrlKey: true});
      expect(hasRing(bugAction)).toBe(false);
    });
  });

  it('the inline-end arrow reaches the action cell, Enter fires it, inline-start returns', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    await user.click(trigger);
    const bug = screen.getByRole('row', {name: 'Bug', ...h});
    // Click-open highlights the first row, on its option cell.
    expect(trigger).toHaveAttribute('aria-activedescendant', bug.id);

    fireEvent.keyDown(trigger, {key: 'ArrowRight'});
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      bug.children[1].id,
    );
    fireEvent.keyDown(trigger, {key: 'Enter'});
    expect(edit).toHaveBeenCalledWith('bug');
    expect(onChange).not.toHaveBeenCalled();
    // The highlight stays where it was.
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      bug.children[1].id,
    );

    fireEvent.keyDown(trigger, {key: 'ArrowLeft'});
    expect(trigger).toHaveAttribute('aria-activedescendant', bug.id);
    fireEvent.keyDown(trigger, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith(['bug']);

    // A row without an action: the inline-end arrow is a no-op there, and
    // Down from the action cell lands on the next row's option cell.
    fireEvent.keyDown(trigger, {key: 'ArrowRight'});
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    const feature = screen.getByRole('row', {name: 'Feature', ...h});
    expect(trigger).toHaveAttribute('aria-activedescendant', feature.id);
    fireEvent.keyDown(trigger, {key: 'ArrowRight'});
    expect(trigger).toHaveAttribute('aria-activedescendant', feature.id);
  });

  it('follows visual direction under RTL', async () => {
    const user = userEvent.setup();
    const original = window.getComputedStyle;
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) => {
        const style = original.call(window, el, pseudo);
        Object.defineProperty(style, 'direction', {value: 'rtl'});
        return style;
      });
    try {
      render(
        <MultiSelector
          label="Labels"
          options={OPTIONS}
          value={[]}
          onChange={() => {}}
        />,
      );
      const trigger = screen.getByRole('combobox', {name: 'Labels'});
      await user.click(trigger);
      const bug = screen.getByRole('row', {name: 'Bug', ...h});
      fireEvent.keyDown(trigger, {key: 'ArrowRight'});
      expect(trigger).toHaveAttribute('aria-activedescendant', bug.id);
      fireEvent.keyDown(trigger, {key: 'ArrowLeft'});
      expect(trigger).toHaveAttribute(
        'aria-activedescendant',
        bug.children[1].id,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('with search, Left/Right move the caret until a row is highlighted', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    const search = screen.getByRole('combobox', h);
    await user.type(search, 'Bu');
    // No row highlighted: the arrow is the input's.
    const right = fireEvent.keyDown(search, {key: 'ArrowRight'});
    expect(right).toBe(true);
    expect(search).not.toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(search, {key: 'ArrowDown'});
    const bug = screen.getByRole('row', {name: 'Bug', ...h});
    expect(search).toHaveAttribute('aria-activedescendant', bug.id);
    const moved = fireEvent.keyDown(search, {key: 'ArrowRight'});
    expect(moved).toBe(false);
    expect(search).toHaveAttribute('aria-activedescendant', bug.children[1].id);
    fireEvent.keyDown(search, {key: 'Enter'});
    expect(edit).toHaveBeenCalledWith('bug');
    expect(search).toHaveValue('Bu');
  });

  it('hovering the action cell highlights that row on its action cell', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    await user.click(trigger);
    const bug = screen.getByRole('row', {name: 'Bug', ...h});
    const feature = screen.getByRole('row', {name: 'Feature', ...h});
    fireEvent.mouseEnter(feature.children[0]);
    expect(trigger).toHaveAttribute('aria-activedescendant', feature.id);
    fireEvent.mouseEnter(bug.children[1]);
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      bug.children[1].id,
    );
    fireEvent.mouseEnter(bug.children[0]);
    expect(trigger).toHaveAttribute('aria-activedescendant', bug.id);
  });

  it('Tab closes the panel as before: no action control is a stop inside it', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelector
        label="Labels"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Labels'});
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(trigger, {key: 'Tab'});
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('warns in development about an action control with no accessible name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        <MultiSelector
          label="Labels"
          options={[
            {value: 'bug', label: 'Bug', action: <button type="button" />},
          ]}
          value={[]}
          onChange={() => {}}
        />,
      );
      await user.click(screen.getByRole('combobox', {name: 'Labels'}));
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/MultiSelector[\s\S]*accessible name/),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe('MultiSelector create row inside a grid', () => {
  it('is a row with exactly two gridcells, the action cell empty, and the arrow stays on the option', async () => {
    // spec:AST-058 FR3: in a grid every row has exactly two cells, and a
    // system-minted row is no exception. The create row has no control of
    // its own, so its action cell is present and empty, and the inline-end
    // arrow has nowhere to go.
    const user = userEvent.setup();
    const onChange =
      vi.fn<(value: string[], change?: MultiSelectorChange) => void>();
    render(
      <MultiSelector
        label="Labels"
        options={[
          {
            value: 'bug',
            label: 'Bug',
            action: <button type="button">Edit Bug</button>,
          },
          {value: 'feature', label: 'Feature'},
        ]}
        value={[]}
        onChange={onChange}
        hasSearch
        hasCreate
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Labels'}));
    const search = screen.getByRole('combobox', {hidden: true});
    await user.type(search, 'Urgent');

    const rows = screen.getAllByRole('row', {hidden: true});
    expect(rows).toHaveLength(1);
    const create = rows[0];
    expect(create).toHaveTextContent('Create "Urgent"');
    const cells = Array.from(create.children).filter(
      c => c.getAttribute('role') === 'gridcell',
    );
    expect(cells).toHaveLength(2);
    expect(cells[1]).toBeEmptyDOMElement();

    await user.keyboard('{ArrowDown}{ArrowRight}{Enter}');
    expect(onChange).toHaveBeenCalledWith(['Urgent'], {
      type: 'create',
      query: 'Urgent',
    });
  });
});

describe('MultiSelector in an InputGroup', () => {
  const groupClasses = () =>
    stylex.props(groupStyles.inGroup).className!.split(' ');
  const triggerBox = (name: RegExp) =>
    screen
      .getByRole('combobox', {name})
      .closest('.astryx-multi-selector') as HTMLElement;

  it.each(['input', 'secondary'] as const)(
    'gives a grouped %s trigger the connected group geometry in every position',
    variant => {
      const selector = (label: string) => (
        <MultiSelector
          label={label}
          isLabelHidden
          variant={variant}
          options={['Apple', 'Banana', 'Cherry']}
          value={EMPTY_VALUE}
          onChange={() => {}}
        />
      );
      render(
        <>
          <InputGroup label="First">
            {selector('Fruit first')}
            <InputGroupText>kg</InputGroupText>
          </InputGroup>
          <InputGroup label="Middle">
            <InputGroupText>#</InputGroupText>
            {selector('Fruit middle')}
            <InputGroupText>kg</InputGroupText>
          </InputGroup>
          <InputGroup label="Last">
            <InputGroupText>#</InputGroupText>
            {selector('Fruit last')}
          </InputGroup>
        </>,
      );

      // Row height, seam radii, and focus stacking come from these classes;
      // a secondary trigger keeps its fill but not its standalone edges.
      for (const position of ['first', 'middle', 'last']) {
        const classes = new Set(
          triggerBox(new RegExp(`Fruit ${position}`)).className.split(' '),
        );
        expect(groupClasses().every(c => classes.has(c))).toBe(true);
      }
    },
  );

  it('keeps a standalone secondary trigger out of the group geometry', () => {
    render(
      <MultiSelector
        label="Fruit"
        variant="secondary"
        options={['Apple', 'Banana', 'Cherry']}
        value={EMPTY_VALUE}
        onChange={() => {}}
      />,
    );
    const classes = new Set(triggerBox(/Fruit/).className.split(' '));
    expect(groupClasses().some(c => classes.has(c))).toBe(false);
  });
});

describe('MultiSelector caller aria-labelledby', () => {
  const FRUITS = ['Apple', 'Banana', 'Cherry'];

  it('names the trigger by its label and a caller aria-labelledby', () => {
    render(
      <>
        <span id="lunch-heading">Lunch</span>
        <MultiSelector
          label="Fruits"
          options={FRUITS}
          value={[]}
          onChange={() => {}}
          aria-labelledby="lunch-heading"
        />
      </>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Fruits Lunch'});
    expect(trigger.getAttribute('aria-labelledby')?.split(' ')).toContain(
      'lunch-heading',
    );
  });

  it('names a grouped trigger by the group, its label, and a caller aria-labelledby', () => {
    render(
      <>
        <span id="lunch-heading">Lunch</span>
        <InputGroup label="Order">
          <MultiSelector
            label="Fruits"
            options={FRUITS}
            value={[]}
            onChange={() => {}}
            aria-labelledby="lunch-heading"
          />
        </InputGroup>
      </>,
    );
    expect(
      screen.getByRole('combobox', {name: 'Order Fruits Lunch'}),
    ).toBeInTheDocument();
  });

  it('leaves a standalone trigger named by its label element without a caller aria-labelledby', () => {
    render(
      <MultiSelector
        label="Fruits"
        options={FRUITS}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Fruits'});
    expect(trigger).not.toHaveAttribute('aria-labelledby');
  });

  it('still hands a caller aria-labelledby to a renderTrigger control unchanged', () => {
    render(
      <>
        <span id="lunch-heading">Lunch</span>
        <MultiSelector
          label="Fruits"
          options={FRUITS}
          value={[]}
          onChange={() => {}}
          aria-labelledby="lunch-heading"
          renderTrigger={props => (
            <button type="button" {...props}>
              Pick fruits
            </button>
          )}
        />
      </>,
    );
    const opener = screen.getByRole('button', {name: 'Lunch'});
    expect(opener).toHaveAttribute('aria-labelledby', 'lunch-heading');
  });

  it("leaves a renderTrigger control's own aria-labelledby in place without a caller value", () => {
    render(
      <>
        <span id="row-title">Lunch fruits</span>
        <MultiSelector
          label="Fruits"
          options={FRUITS}
          value={[]}
          onChange={() => {}}
          renderTrigger={props => (
            <button type="button" aria-labelledby="row-title" {...props} />
          )}
        />
      </>,
    );
    const opener = screen.getByRole('button', {name: 'Lunch fruits'});
    expect(opener).toHaveAttribute('aria-labelledby', 'row-title');
  });
});
