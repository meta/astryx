// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCombobox.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event,
 *   useCombobox and the layer dismissal stack
 * @output Unit tests for useCombobox over a single-line field the caller renders
 * @position Tests; validates the field props, keys and pointer model of
 *   hooks.ts against spec:AST-075 FR1–FR6
 *
 * SYNC: When useCombobox's field props or keys change, update these tests.
 */

import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useRef, useState, type ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  COMBOBOX_PATTERN,
  expectAccessibilitySpec,
  type ComboboxStateFacts,
} from '@astryxdesign/a11y-spec';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import {resetLayerStackForTests} from '../Layer/layerStack';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {useCombobox} from './hooks';

type Person = {value: string; label: string; disabled?: boolean};

const PEOPLE: Person[] = [
  {value: 'ada', label: 'Ada'},
  {value: 'bea', label: 'Bea', disabled: true},
  {value: 'cy', label: 'Cy'},
];

afterEach(() => {
  resetLayerStackForTests();
});

interface PickerProps {
  options?: Person[];
  isInitiallyOpen?: boolean;
  onSelect?: (value: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onFieldKeyDown?: (event: React.KeyboardEvent) => void;
}

/** A field the test renders itself, with its list in the page's flow. */
function Picker({
  options = PEOPLE,
  isInitiallyOpen = true,
  onSelect,
  onOpen,
  onClose,
  onFieldKeyDown,
}: PickerProps) {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);
  const combobox = useCombobox({
    selectableItems: options,
    isOpen,
    onOpen: () => {
      onOpen?.();
      setIsOpen(true);
    },
    onClose: () => {
      onClose?.();
      setIsOpen(false);
    },
    onSelect,
    listboxId: 'people',
  });
  const fieldProps = combobox.getFieldProps({onKeyDown: onFieldKeyDown});
  return (
    <>
      <input aria-label="To" {...fieldProps} />
      {isOpen && options.length > 0 ? (
        <div aria-label="People" {...combobox.getListboxProps()}>
          {options.map((person, index) => (
            <div key={person.value} {...combobox.getOptionProps(index)}>
              {person.label}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** A registered layer, like a Dialog or Popover, around the field. */
function Layer({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLayerDismissal({
    isActive: true,
    onDismiss,
    getContainer: () => containerRef.current,
  });
  return (
    <div ref={containerRef}>
      <LayerDepthProvider>{children}</LayerDepthProvider>
    </div>
  );
}

function toField(): HTMLElement {
  return screen.getByRole('combobox', {name: 'To'});
}

function option(name: string): HTMLElement {
  return screen.getByRole('option', {name});
}

describe('useCombobox field props — roles and state (FR1–FR3)', () => {
  it('a hidden list leaves the field collapsed with nothing to reference', () => {
    render(<Picker isInitiallyOpen={false} />);
    const box = toField();
    expect(box).toHaveAttribute('role', 'combobox');
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).not.toHaveAttribute('aria-controls');
    expect(box).not.toHaveAttribute('aria-activedescendant');
  });

  it('a shown list expands the field and names the listbox', () => {
    render(<Picker />);
    const box = toField();
    const listbox = screen.getByRole('listbox', {name: 'People'});
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(box).toHaveAttribute('aria-controls', listbox.id);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    // No option is active until the person moves to one.
    expect(box).not.toHaveAttribute('aria-activedescendant');
  });

  it('an open list with no options renders no listbox, so the field stays collapsed', () => {
    render(<Picker options={[]} />);
    const box = toField();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).not.toHaveAttribute('aria-controls');
  });

  it('moving the active option keeps focus in the field and names it (FR1)', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const box = toField();
    await user.click(box);

    await user.keyboard('{ArrowDown}');
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('aria-activedescendant', option('Ada').id);
    expect(option('Ada')).toHaveAttribute('aria-selected', 'true');
    expect(option('Cy')).toHaveAttribute('aria-selected', 'false');

    // The disabled option is skipped, and the arrows wrap at either end.
    await user.keyboard('{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', option('Cy').id);
    await user.keyboard('{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', option('Ada').id);
    await user.keyboard('{ArrowUp}');
    expect(box).toHaveAttribute('aria-activedescendant', option('Cy').id);
    expect(box).toHaveFocus();
    expect(option('Bea')).toHaveAttribute('aria-disabled', 'true');
  });

  it('ArrowUp with nothing active starts at the last option', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const box = toField();
    await user.click(box);
    await user.keyboard('{ArrowUp}');
    expect(box).toHaveAttribute('aria-activedescendant', option('Cy').id);
  });
});

describe('useCombobox field props — the reusable Combobox contract', () => {
  const closed: ComboboxStateFacts = {
    name: 'To',
    expanded: false,
    popupRole: 'listbox',
    popupVisible: false,
    activeDescendant: false,
    readOnly: false,
    busy: false,
    inertUnderOwnModal: false,
  };

  it.each([
    {open: false, facts: closed},
    {
      open: true,
      facts: {
        ...closed,
        expanded: true,
        popupVisible: true,
        activeDescendant: true,
      },
    },
  ] as const)('input, list shown: $open', async ({open, facts}) => {
    await expectAccessibilitySpec({
      spec: COMBOBOX_PATTERN,
      binding: 'useCombobox.field',
      state: `input-${open ? 'shown' : 'hidden'}`,
      facts,
      render: async () => {
        render(<Picker isInitiallyOpen={open} />);
        if (open) {
          toField().focus();
          fireEvent.keyDown(toField(), {key: 'ArrowDown'});
        }
      },
      subject: () => toField(),
      related: (): Record<string, Element> =>
        open
          ? {
              popup: screen.getByRole('listbox'),
              'active-descendant': option('Ada'),
            }
          : {},
      cleanup,
    });
  });
});

describe('useCombobox field props — keys (FR4)', () => {
  it('Enter picks only an active option, and only then stops the field’s own Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onFieldKeyDown = vi.fn();
    render(<Picker onSelect={onSelect} onFieldKeyDown={onFieldKeyDown} />);
    const box = toField();
    await user.click(box);

    // Nothing active: Enter is the field's own, such as a submit.
    expect(fireEvent.keyDown(box, {key: 'Enter'})).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onFieldKeyDown).toHaveBeenCalledTimes(1);

    await user.keyboard('{ArrowDown}');
    expect(fireEvent.keyDown(box, {key: 'Enter'})).toBe(false);
    expect(onSelect).toHaveBeenCalledWith('ada');
    // The arrow and the pick never reached the field's handler.
    expect(onFieldKeyDown).toHaveBeenCalledTimes(1);
    // Picking hides the list; focus never left the field.
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box).toHaveFocus();
  });

  it('Escape hides the list without dismissing the enclosing layer on the same press', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Layer onDismiss={onDismiss}>
        <Picker />
      </Layer>,
    );
    await user.click(toField());

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();

    // With the list hidden, Escape belongs to the layer again.
    await user.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('Escape also hides an open list that has no options', () => {
    const onClose = vi.fn();
    render(<Picker options={[]} onClose={onClose} />);
    expect(fireEvent.keyDown(toField(), {key: 'Escape'})).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(['shiftKey', 'ctrlKey', 'altKey', 'metaKey'] as const)(
    'Escape held with %s still hides the list first and leaves the enclosing layer open',
    modifier => {
      const onDismiss = vi.fn();
      render(
        <Layer onDismiss={onDismiss}>
          <Picker />
        </Layer>,
      );
      const box = toField();
      box.focus();
      expect(fireEvent.keyDown(box, {key: 'Escape', [modifier]: true})).toBe(
        false,
      );
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(onDismiss).not.toHaveBeenCalled();

      // With the list hidden, the same chord belongs to the layer again.
      fireEvent.keyDown(box, {key: 'Escape', [modifier]: true});
      expect(onDismiss).toHaveBeenCalledTimes(1);
    },
  );

  it('ArrowDown shows a hidden list in a single-line field', async () => {
    const user = userEvent.setup();
    render(<Picker isInitiallyOpen={false} />);
    const box = toField();
    await user.click(box);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', option('Ada').id);
  });

  it('ArrowDown leaves a hidden list alone when there is nothing to show', () => {
    const onOpen = vi.fn();
    render(<Picker options={[]} isInitiallyOpen={false} onOpen={onOpen} />);
    expect(fireEvent.keyDown(toField(), {key: 'ArrowDown'})).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keys other than the arrows, Enter and Escape reach the field while the list is shown', async () => {
    const user = userEvent.setup();
    const onFieldKeyDown = vi.fn();
    render(<Picker onFieldKeyDown={onFieldKeyDown} />);
    const box = toField();
    await user.click(box);
    await user.keyboard('{ArrowDown}');
    const active = box.getAttribute('aria-activedescendant');

    // Home and End stay with the caret: their combobox meaning is undecided.
    for (const key of ['Home', 'End', 'PageDown', 'Tab', ' ', 'a']) {
      expect(fireEvent.keyDown(box, {key})).toBe(true);
    }
    expect(onFieldKeyDown).toHaveBeenCalledTimes(6);
    expect(box).toHaveAttribute('aria-activedescendant', active);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('a chord such as Shift+Enter is the field’s own command', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Picker onSelect={onSelect} />);
    const box = toField();
    await user.click(box);
    await user.keyboard('{ArrowDown}');
    expect(fireEvent.keyDown(box, {key: 'Enter', shiftKey: true})).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('leaves onKeyDown with the trigger model it already had', async () => {
    const user = userEvent.setup();
    function Trigger() {
      const [isOpen, setIsOpen] = useState(true);
      const combobox = useCombobox({
        selectableItems: PEOPLE,
        isOpen,
        onOpen: () => setIsOpen(true),
        onClose: () => setIsOpen(false),
        listboxId: 'trigger',
      });
      return (
        <button
          type="button"
          aria-activedescendant={
            combobox.highlightedIndex >= 0
              ? combobox.getItemId(combobox.highlightedIndex)
              : undefined
          }
          onKeyDown={combobox.onKeyDown}>
          Pick
        </button>
      );
    }
    render(<Trigger />);
    const button = screen.getByRole('button', {name: 'Pick'});
    button.focus();
    await user.keyboard('{End}');
    expect(button).toHaveAttribute('aria-activedescendant', 'trigger-item-2');
  });
});

describe('useCombobox field props — input-method composition (FR5)', () => {
  it('a composing key neither moves, picks nor hides', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Picker onSelect={onSelect} onClose={onClose} />);
    const box = toField();
    await user.click(box);
    await user.keyboard('{ArrowDown}');
    const active = option('Ada').id;

    for (const init of [
      {key: 'ArrowDown', isComposing: true},
      {key: 'Enter', isComposing: true},
      {key: 'Escape', isComposing: true},
      {key: 'Enter', keyCode: 229},
    ]) {
      expect(fireEvent.keyDown(box, init)).toBe(true);
    }
    expect(box).toHaveAttribute('aria-activedescendant', active);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Once the composition ends, Enter picks again.
    fireEvent.keyDown(box, {key: 'Enter'});
    expect(onSelect).toHaveBeenCalledWith('ada');
  });
});

describe('useCombobox field props — pointer (FR6)', () => {
  it('hovering makes an option active and pressing picks it, with focus kept in the field', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Picker onSelect={onSelect} />);
    const box = toField();
    await user.click(box);

    await user.hover(option('Cy'));
    expect(box).toHaveAttribute('aria-activedescendant', option('Cy').id);
    expect(box).toHaveFocus();

    // A disabled option never becomes active and cannot be picked.
    await user.hover(option('Bea'));
    expect(box).toHaveAttribute('aria-activedescendant', option('Cy').id);
    await user.click(option('Bea'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(box).toHaveFocus();

    await user.click(option('Cy'));
    expect(onSelect).toHaveBeenCalledWith('cy');
    expect(box).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a press on the listbox itself keeps focus in the field', () => {
    render(<Picker />);
    const box = toField();
    box.focus();
    expect(fireEvent.mouseDown(screen.getByRole('listbox'))).toBe(false);
    expect(fireEvent.mouseDown(option('Ada'))).toBe(false);
  });
});
