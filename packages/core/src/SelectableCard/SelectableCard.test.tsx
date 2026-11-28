// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCard.test.tsx
 * @input Uses vitest, Testing Library, and SelectableCard
 * @output Component-specific callback, keyboard extension, and styling tests;
 *   shared checkbox semantics live under CheckboxInput/__tests__.
 * @position Local behavior coverage that remains after AST-021 migration.
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {SelectableCard} from './SelectableCard';
import {
  afterPaintsPress,
  hasReleaseFade,
  pressArmsShadowedByDefault,
  readsPressStrength,
} from '../__tests__/pressState';

describe('SelectableCard', () => {
  it('renders children', () => {
    render(
      <SelectableCard label="Test" isSelected={false} onChange={() => {}}>
        <span>Card content</span>
      </SelectableCard>,
    );
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('calls onChange with true when card surface is clicked (unselected)', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard label="Test" isSelected={false} onChange={handleChange}>
        <span>Content</span>
      </SelectableCard>,
    );
    fireEvent.click(screen.getByText('Content'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when card surface is clicked (selected)', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard label="Test" isSelected={true} onChange={handleChange}>
        <span>Content</span>
      </SelectableCard>,
    );
    fireEvent.click(screen.getByText('Content'));
    expect(handleChange).toHaveBeenCalledWith(false);
  });

  it('calls onChange when checkbox itself is clicked', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard label="Test" isSelected={false} onChange={handleChange}>
        Content
      </SelectableCard>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Test'});
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled card is clicked', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard
        label="Disabled"
        isSelected={false}
        onChange={handleChange}
        isDisabled>
        <span>Content</span>
      </SelectableCard>,
    );
    fireEvent.click(screen.getByText('Content'));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('calls onChange with true when Enter is pressed on the checkbox (unselected)', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard label="Test" isSelected={false} onChange={handleChange}>
        Content
      </SelectableCard>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Test'});
    fireEvent.keyDown(checkbox, {key: 'Enter'});
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when Enter is pressed on the checkbox (selected)', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard label="Test" isSelected={true} onChange={handleChange}>
        Content
      </SelectableCard>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Test'});
    fireEvent.keyDown(checkbox, {key: 'Enter'});
    expect(handleChange).toHaveBeenCalledWith(false);
  });

  it('does not toggle on Enter when disabled', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard
        label="Disabled"
        isSelected={false}
        onChange={handleChange}
        isDisabled>
        Content
      </SelectableCard>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Disabled'});
    fireEvent.keyDown(checkbox, {key: 'Enter'});
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not toggle on Space when disabled', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard
        label="Disabled"
        isSelected={false}
        onChange={handleChange}
        isDisabled>
        Content
      </SelectableCard>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Disabled'});
    fireEvent.keyDown(checkbox, {key: ' '});
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('toggles exactly once on Space (native), not doubled by the Enter handler', () => {
    const handleChange = vi.fn();
    render(
      <SelectableCard label="Test" isSelected={false} onChange={handleChange}>
        Content
      </SelectableCard>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Test'});
    // Space activates the native checkbox, firing a single change event.
    fireEvent.click(checkbox);
    fireEvent.keyDown(checkbox, {key: ' '});
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  describe('elevation', () => {
    const noop = () => {};

    it('forwards a distinct elevation class to the card for each level', () => {
      const classFor = (elevation: 'none' | 'low' | 'med' | 'high') => {
        const {container} = render(
          <SelectableCard
            label="Card"
            isSelected={false}
            onChange={noop}
            elevation={elevation}>
            Content
          </SelectableCard>,
        );
        return container.firstElementChild!.className;
      };
      const classes = new Set([
        classFor('none'),
        classFor('low'),
        classFor('med'),
        classFor('high'),
      ]);
      expect(classes.size).toBe(4);
    });

    it('still varies elevation while selected (ring composes with elevation)', () => {
      const selectedClassFor = (elevation: 'none' | 'med') => {
        const {container} = render(
          <SelectableCard
            label="Card"
            isSelected
            onChange={noop}
            elevation={elevation}>
            Content
          </SelectableCard>,
        );
        return container.firstElementChild!.className;
      };
      // A selected card at 'med' must differ from a selected card at 'none' —
      // proving the selection ring does not clobber the elevation shadow.
      expect(selectedClassFor('med')).not.toBe(selectedClassFor('none'));
    });
  });
});

describe('SelectableCard pressed state (touch)', () => {
  it('fades the touch press out on the card, whose overlay layer reads its strength', () => {
    const {container} = render(
      <SelectableCard label="Test" isSelected={false} onChange={() => {}}>
        Content
      </SelectableCard>,
    );
    const card = container.querySelector('[data-astryx-pressable]');
    if (card == null) {
      throw new Error('the card carries no pressable marker');
    }
    expect(hasReleaseFade(card)).toBe(true);
    expect(readsPressStrength(card, '[data-astryx-press="on"]')).toBe(true);
    expect(readsPressStrength(card)).toBe(true);
    expect(afterPaintsPress(card, '[data-astryx-press="on"]')).toBe(true);
    expect(afterPaintsPress(card)).toBe(true);
    // In a layered stylesheet a press arm on a custom property the card also
    // declares without it never applies.
    expect(pressArmsShadowedByDefault(card)).toEqual([]);
  });
});

describe('SelectableCard target, handler order and passthrough (FR1, FR2, FR5, FR6)', () => {
  function card(container: HTMLElement) {
    const root = container.querySelector('.astryx-selectable-card');
    if (!(root instanceof HTMLElement)) {
      throw new Error('no selectable-card target');
    }
    return root;
  }

  it('reflects variant, selection and disabled on the selectable-card target', () => {
    const {container, rerender} = render(
      <SelectableCard
        label="Test"
        isSelected={false}
        onChange={() => {}}
        variant="blue">
        Content
      </SelectableCard>,
    );
    expect(card(container)).toHaveAttribute('data-variant', 'blue');
    expect(card(container)).toHaveAttribute('data-selected', 'false');
    expect(card(container)).not.toHaveAttribute('data-disabled');
    rerender(
      <SelectableCard
        label="Test"
        isSelected
        onChange={() => {}}
        variant="blue"
        isDisabled>
        Content
      </SelectableCard>,
    );
    expect(card(container)).toHaveAttribute('data-selected', 'true');
    expect(card(container)).toHaveAttribute('data-disabled', 'disabled');
  });

  it('toggles once for a surface click and then runs the caller onClick', () => {
    const calls: string[] = [];
    render(
      <SelectableCard
        label="Test"
        isSelected={false}
        onChange={value => calls.push(`change:${value}`)}
        onClick={() => calls.push('click')}>
        <span>Content</span>
      </SelectableCard>,
    );
    fireEvent.click(screen.getByText('Content'));
    expect(calls).toEqual(['change:true', 'click']);
  });

  it('runs the caller onClick before the toggle for a click on the checkbox, and not for Enter', () => {
    const calls: string[] = [];
    render(
      <SelectableCard
        label="Test"
        isSelected={false}
        onChange={value => calls.push(`change:${value}`)}
        onClick={() => calls.push('click')}>
        Content
      </SelectableCard>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Test'});
    fireEvent.click(checkbox);
    expect(calls).toEqual(['click', 'change:true']);
    calls.length = 0;
    fireEvent.keyDown(checkbox, {key: 'Enter'});
    expect(calls).toEqual(['change:true']);
  });

  it('does not toggle for a click on a nested button, but still runs the caller onClick', () => {
    const onChange = vi.fn();
    const onClick = vi.fn();
    const onNested = vi.fn();
    render(
      <SelectableCard
        label="Test"
        isSelected={false}
        onChange={onChange}
        onClick={onClick}>
        <button type="button" onClick={onNested}>
          Details
        </button>
      </SelectableCard>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Details'}));
    expect(onNested).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('runs no caller onClick or onMouseUp while disabled', () => {
    const onClick = vi.fn();
    const onMouseUp = vi.fn();
    render(
      <SelectableCard
        label="Test"
        isSelected={false}
        onChange={() => {}}
        onClick={onClick}
        onMouseUp={onMouseUp}
        isDisabled>
        <span>Content</span>
      </SelectableCard>,
    );
    fireEvent.mouseUp(screen.getByText('Content'));
    fireEvent.click(screen.getByText('Content'));
    expect(onClick).not.toHaveBeenCalled();
    expect(onMouseUp).not.toHaveBeenCalled();
  });

  it('connects ref and data props to the card root, which adds no role or tab stop', () => {
    const ref = {current: null as HTMLDivElement | null};
    const {container} = render(
      <SelectableCard
        ref={ref}
        label="Test"
        isSelected={false}
        onChange={() => {}}
        data-testid="plan"
        className="caller"
        style={{marginInlineStart: '4px'}}>
        Content
      </SelectableCard>,
    );
    const root = card(container);
    expect(ref.current).toBe(root);
    expect(screen.getByTestId('plan')).toBe(root);
    expect(root).toHaveClass('caller');
    expect(root.style.marginInlineStart).toBe('4px');
    expect(root).not.toHaveAttribute('role');
    expect(root).not.toHaveAttribute('tabindex');
  });
});
