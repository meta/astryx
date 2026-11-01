// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteInput.test.tsx
 * @input Uses vitest, @testing-library/react, CommandPaletteInput, Dialog
 * @output Unit tests for CommandPaletteInput component
 * @position Testing; validates CommandPaletteInput.tsx implementation
 */

import {createRef} from 'react';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {CommandPaletteInput} from './CommandPaletteInput';
import {CommandPaletteContext} from './CommandPaletteContext';
import {Dialog} from '../Dialog';
import type {CommandPaletteContextValue} from './CommandPaletteContext';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

beforeEach(() => {
  __resetInteractionModalityForTest();
});

function makeContext(
  overrides: Partial<CommandPaletteContextValue> = {},
): CommandPaletteContextValue {
  return {
    search: '',
    setSearch: vi.fn(),
    value: '',
    setValue: vi.fn(),
    listId: 'list-1',
    highlightedIndex: -1,
    setHighlightedIndex: vi.fn(),
    getItemId: (i: number) => `item-${i}`,
    selectableItems: [{value: 'open', label: 'Open'}],
    searchResults: [],
    selectItem: vi.fn(),
    onKeyDown: vi.fn(),
    onClose: vi.fn(),
    isOpen: true,
    isBusy: false,
    ...overrides,
  };
}

describe('CommandPaletteInput', () => {
  it('renders with default placeholder', () => {
    render(<CommandPaletteInput />);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
  });

  it('renders the local input target and delegated search icon', () => {
    const {container} = render(<CommandPaletteInput />);

    expect(container.firstElementChild).toHaveClass(
      'astryx-command-palette-input',
    );
    expect(container.querySelector('.astryx-icon')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('renders with custom placeholder', () => {
    render(<CommandPaletteInput placeholder="Type a command..." />);
    expect(
      screen.getByPlaceholderText('Type a command...'),
    ).toBeInTheDocument();
  });

  it('uses searchbox semantics when no popup context exists', () => {
    render(<CommandPaletteInput />);
    const input = screen.getByRole('searchbox');
    expect(input).not.toHaveAttribute('aria-expanded');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).not.toHaveAttribute('aria-autocomplete');
  });

  it('preserves standalone caller-owned popup semantics', () => {
    render(
      <CommandPaletteInput
        aria-expanded="false"
        aria-autocomplete="both"
        aria-controls="caller-list"
        aria-activedescendant="caller-item"
      />,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'both');
    expect(input).toHaveAttribute('aria-controls', 'caller-list');
    expect(input).toHaveAttribute('aria-activedescendant', 'caller-item');
  });

  it('infers caller-owned popup defaults from aria-controls alone', () => {
    render(<CommandPaletteInput aria-controls="caller-list" />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-controls', 'caller-list');
  });

  it('preserves a caller-owned combobox role and supplies popup defaults', () => {
    render(<CommandPaletteInput role="combobox" />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('keeps a toggling caller popup a combobox with its own values', () => {
    function CallerPopup({open}: {open: boolean}) {
      return (
        <CommandPaletteInput
          aria-expanded={open || undefined}
          aria-controls={open ? 'caller-list' : undefined}
        />
      );
    }
    const {rerender} = render(<CallerPopup open={false} />);

    const closed = screen.getByRole('combobox');
    expect(closed).not.toHaveAttribute('aria-expanded');
    expect(closed).not.toHaveAttribute('aria-controls');

    rerender(<CallerPopup open />);
    const open = screen.getByRole('combobox');
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(open).toHaveAttribute('aria-controls', 'caller-list');

    rerender(<CallerPopup open={false} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-expanded');
  });

  it('omits an explicitly undefined aria-expanded beside a caller list', () => {
    render(
      <CommandPaletteInput
        aria-expanded={undefined}
        aria-controls="caller-list"
      />,
    );

    const input = screen.getByRole('combobox');
    expect(input).not.toHaveAttribute('aria-expanded');
    expect(input).toHaveAttribute('aria-controls', 'caller-list');
  });

  it.each([
    ['aria-owns', {'aria-owns': 'caller-list'}],
    ['aria-haspopup="listbox"', {'aria-haspopup': 'listbox' as const}],
    ['aria-haspopup={true}', {'aria-haspopup': true}],
  ])(
    'keeps a field wired to its popup only through %s a combobox',
    (_label, popupProps) => {
      render(<CommandPaletteInput {...popupProps} />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    },
  );

  it.each([
    ['false', false],
    ['"false"', 'false' as const],
  ])('stays a searchbox when aria-haspopup is %s', (_label, value) => {
    render(<CommandPaletteInput aria-haspopup={value} />);

    const input = screen.getByRole('searchbox');
    expect(input).not.toHaveAttribute('aria-expanded');
    expect(input).not.toHaveAttribute('aria-autocomplete');
  });

  it('is named "Search commands" by default, not by its placeholder', () => {
    render(<CommandPaletteInput />);
    const input = screen.getByRole('searchbox', {name: 'Search commands'});
    expect(input).toHaveAttribute('placeholder', 'Search…');
  });

  it('uses the label prop as the accessible name', () => {
    render(<CommandPaletteInput label="Find files" />);
    const input = screen.getByRole('searchbox', {name: 'Find files'});
    expect(input).toHaveAttribute('placeholder', 'Search…');
  });

  it('never takes its name from a custom placeholder', () => {
    render(<CommandPaletteInput placeholder="Type a command..." />);
    expect(
      screen.getByRole('searchbox', {name: 'Search commands'}),
    ).toHaveAttribute('placeholder', 'Type a command...');
  });

  it('owns role and popup state inside CommandPalette context, passing other ARIA through', () => {
    render(
      <CommandPaletteContext value={makeContext()}>
        <CommandPaletteInput
          role="searchbox"
          aria-expanded={false}
          aria-controls="caller-list"
          aria-haspopup="dialog"
          aria-owns="caller-owned"
        />
      </CommandPaletteContext>,
    );
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', 'list-1');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-haspopup', 'dialog');
    expect(input).toHaveAttribute('aria-owns', 'caller-owned');
  });

  it('keeps the default name inside CommandPalette context', () => {
    render(
      <CommandPaletteContext value={makeContext()}>
        <CommandPaletteInput placeholder="Jump to…" />
      </CommandPaletteContext>,
    );
    expect(
      screen.getByRole('combobox', {name: 'Search commands'}),
    ).toBeInTheDocument();
  });

  it('lets a consumer-passed aria-label override the default', () => {
    render(
      <CommandPaletteInput label="Search commands" aria-label="Custom name" />,
    );
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'aria-label',
      'Custom name',
    );
  });

  it('calls onValueChange when typing', () => {
    const handleChange = vi.fn();
    render(<CommandPaletteInput onValueChange={handleChange} />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: {value: 'test'},
    });

    expect(handleChange).toHaveBeenCalledWith('test');
  });

  it('displays controlled value', () => {
    render(<CommandPaletteInput value="hello" onValueChange={() => {}} />);
    expect(screen.getByRole('searchbox')).toHaveValue('hello');
  });

  it('forwards native onChange alongside onValueChange', () => {
    const handleChange = vi.fn();
    const handleNativeChange = vi.fn();

    render(
      <CommandPaletteInput
        onValueChange={handleChange}
        onChange={handleNativeChange}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox'), {target: {value: 'x'}});

    expect(handleChange).toHaveBeenCalledWith('x');
    expect(handleNativeChange).toHaveBeenCalled();
  });

  it('keeps visible numeric end content in the trailing group', () => {
    render(<CommandPaletteInput endContent={0} />);
    const input = screen.getByRole('searchbox');
    const trailingGroup = screen.getByText('0');
    expect(trailingGroup.tagName).toBe('SPAN');
    expect(input.parentElement?.lastElementChild).toBe(trailingGroup);
  });

  it.each([false, true, '', null, undefined])(
    'omits trailing chrome for empty end content %#',
    endContent => {
      render(<CommandPaletteInput endContent={endContent} />);
      expect(
        screen.getByRole('searchbox').parentElement?.children,
      ).toHaveLength(2);
    },
  );

  it('draws the shared ring only when keyboard navigation acquired focus', () => {
    render(<CommandPaletteInput hasAutoFocus={false} />);
    const input = screen.getByRole('searchbox');
    const ringClasses = stylex
      .props(focusOutlineStyles.focusVisible)
      .className!.split(' ');
    const isRinged = () =>
      ringClasses.every(className => input.classList.contains(className));

    fireEvent.pointerDown(input);
    fireEvent.focus(input);
    expect(isRinged()).toBe(false);

    fireEvent.blur(input);
    fireEvent.keyDown(input, {key: 'Tab'});
    fireEvent.focus(input);
    expect(isRinged()).toBe(true);
  });

  it('preserves caller focus and blur handlers while tracking modality', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(
      <CommandPaletteInput
        hasAutoFocus={false}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );
    const input = screen.getByRole('searchbox');

    fireEvent.keyDown(input, {key: 'Tab'});
    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('does not schedule focus when hasAutoFocus is false', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    render(<CommandPaletteInput hasAutoFocus={false} />);

    const input = screen.getByRole('searchbox');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const inputFocusCalls = focusSpy.mock.calls.filter((_, i) => {
      return focusSpy.mock.contexts[i] === input;
    });
    expect(input).not.toHaveAttribute('data-autofocus');
    expect(inputFocusCalls).toHaveLength(0);
    focusSpy.mockRestore();
  });

  it('forwards the ref and native data attributes to the query field', () => {
    const ref = createRef<HTMLInputElement>();
    render(<CommandPaletteInput ref={ref} data-testid="query-field" />);

    expect(ref.current).toBe(screen.getByTestId('query-field'));
  });
});

describe('CommandPaletteInput popup context', () => {
  it('preserves component-owned combobox semantics against rest props', () => {
    render(
      <CommandPaletteContext value={makeContext({isOpen: false})}>
        <CommandPaletteInput
          role="button"
          aria-expanded="true"
          aria-autocomplete="none"
          aria-controls="wrong-list"
          aria-activedescendant="wrong-item"
        />
      </CommandPaletteContext>,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-controls', 'list-1');
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('renders the busy spinner before trailing content', () => {
    render(
      <CommandPaletteContext value={makeContext({isBusy: true})}>
        <CommandPaletteInput
          endContent={<span data-testid="trailing-content">⌘K</span>}
        />
      </CommandPaletteContext>,
    );

    // The Spinner is decorative (spec:AST-086 FR8), so find it by its class.
    const spinner = document.querySelector('.astryx-spinner') as HTMLElement;
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    const trailingContent = screen.getByTestId('trailing-content');
    expect(trailingContent.parentElement?.firstElementChild).toContainElement(
      spinner,
    );
  });

  it('reports the contextual open state and controlled list', () => {
    render(
      <CommandPaletteContext value={makeContext()}>
        <CommandPaletteInput />
      </CommandPaletteContext>,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', 'list-1');
  });

  it('exposes the highlighted option as the active descendant', () => {
    render(
      <CommandPaletteContext
        value={makeContext({
          highlightedIndex: 2,
          selectableItems: [{value: 'a'}, {value: 'b'}, {value: 'c'}],
        })}>
        <CommandPaletteInput />
      </CommandPaletteContext>,
    );

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-activedescendant',
      'item-2',
    );
  });

  it('reads and writes search state through context', () => {
    const setSearch = vi.fn();
    render(
      <CommandPaletteContext value={makeContext({search: 'hel', setSearch})}>
        <CommandPaletteInput />
      </CommandPaletteContext>,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('hel');
    fireEvent.change(input, {target: {value: 'help'}});
    expect(setSearch).toHaveBeenCalledWith('help');
  });

  it('gives explicit search state precedence over context', () => {
    const setSearch = vi.fn();
    const onValueChange = vi.fn();
    render(
      <CommandPaletteContext
        value={makeContext({search: 'context', setSearch})}>
        <CommandPaletteInput value="explicit" onValueChange={onValueChange} />
      </CommandPaletteContext>,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('explicit');
    fireEvent.change(input, {target: {value: 'next'}});
    expect(onValueChange).toHaveBeenCalledWith('next');
    expect(setSearch).not.toHaveBeenCalled();
  });

  it('does not delegate a consumer-prevented keyboard event', () => {
    const onKeyDown = vi.fn();
    render(
      <CommandPaletteContext value={makeContext({onKeyDown})}>
        <CommandPaletteInput onKeyDown={event => event.preventDefault()} />
      </CommandPaletteContext>,
    );

    fireEvent.keyDown(screen.getByRole('combobox'), {key: 'ArrowDown'});
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('omits popup ARIA while the result surface has no listbox', () => {
    render(
      <CommandPaletteContext value={makeContext({selectableItems: []})}>
        <CommandPaletteInput />
      </CommandPaletteContext>,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('omits an active descendant whose highlighted index has no option', () => {
    render(
      <CommandPaletteContext
        value={makeContext({
          highlightedIndex: 1,
          selectableItems: [{value: 'home'}],
        })}>
        <CommandPaletteInput />
      </CommandPaletteContext>,
    );

    expect(screen.getByRole('combobox')).not.toHaveAttribute(
      'aria-activedescendant',
    );
  });

  it('does not route IME composition keys to palette commands', () => {
    const onKeyDown = vi.fn();
    render(
      <CommandPaletteContext value={makeContext({onKeyDown})}>
        <CommandPaletteInput />
      </CommandPaletteContext>,
    );

    fireEvent.keyDown(screen.getByRole('combobox'), {
      key: 'Enter',
      isComposing: true,
    });

    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('does not auto-focus inside an inline dialog', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    render(
      <Dialog isOpen isInline onOpenChange={() => {}}>
        <CommandPaletteContext value={makeContext()}>
          <CommandPaletteInput />
        </CommandPaletteContext>
      </Dialog>,
    );

    const input = screen.getByRole('combobox');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const inputFocusCalls = focusSpy.mock.calls.filter((_, i) => {
      return focusSpy.mock.contexts[i] === input;
    });
    expect(inputFocusCalls).toHaveLength(0);
    focusSpy.mockRestore();
  });

  it('auto-focuses outside an inline dialog', async () => {
    render(
      <CommandPaletteContext value={makeContext()}>
        <CommandPaletteInput />
      </CommandPaletteContext>,
    );

    await act(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );
    });
    expect(screen.getByRole('combobox')).toHaveFocus();
  });
});
