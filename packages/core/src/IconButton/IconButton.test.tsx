// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file IconButton.test.tsx
 * @input Uses vitest, @testing-library/react, IconButton component
 * @output Unit tests for IconButton component behavior
 * @position Testing; validates IconButton.tsx implementation
 *
 * SYNC: When IconButton.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {unthemedLength} from '../__tests__/unthemedLength';
import {Icon} from '../Icon/Icon';
import {IconButton} from './IconButton';

describe('IconButton', () => {
  // Retained, narrowed: the shared button-pattern contract proves the role and
  // the computed accessible name in a real engine. What stays is IconButton's
  // own mapping — it always routes `label` to `aria-label`, and renders the
  // icon it was given.
  it('maps label to aria-label and renders the icon', () => {
    render(
      <IconButton label="Settings" icon={<span data-testid="icon">⚙</span>} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Settings',
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('does not render label as visible text', () => {
    render(
      <IconButton label="Settings" icon={<span data-testid="icon">⚙</span>} />,
    );
    const button = screen.getByRole('button');
    // The label text should not appear as visible content
    const visibleText = button.textContent;
    expect(visibleText).not.toContain('Settings');
  });

  it('reflects each variant on the button target', () => {
    for (const variant of [
      'primary',
      'secondary',
      'ghost',
      'destructive',
    ] as const) {
      const {unmount} = render(
        <IconButton label="Delete" icon={<span>🗑</span>} variant={variant} />,
      );
      expect(screen.getByRole('button', {name: 'Delete'})).toHaveAttribute(
        'data-variant',
        variant,
      );
      unmount();
    }
  });

  it('reflects each size on the button target', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const {unmount} = render(
        <IconButton label="Add" icon={<span>+</span>} size={size} />,
      );
      expect(screen.getByRole('button', {name: 'Add'})).toHaveAttribute(
        'data-size',
        size,
      );
      unmount();
    }
  });

  it('stays icon-only when a caller passes isIconOnly anyway', () => {
    // The type rejects this prop; an untyped caller can still pass it.
    const untyped = {isIconOnly: false} as Record<string, unknown>;
    render(<IconButton label="Settings" icon={<span>⚙</span>} {...untyped} />);
    const button = screen.getByRole('button', {name: 'Settings'});
    expect(button).toHaveAttribute('aria-label', 'Settings');
    expect(button.textContent).not.toContain('Settings');
  });

  it('describes the button with its tooltip, keeping label as the name', () => {
    render(
      <IconButton
        label="Notifications"
        icon={<span>🔔</span>}
        tooltip="View notifications"
      />,
    );
    const button = screen.getByRole('button', {name: 'Notifications'});
    expect(button).toHaveAccessibleDescription('View notifications');
  });

  it.each([
    ['sm', 'sm', '1rem'],
    ['md', 'sm', '1rem'],
    ['lg', 'md', '1.25rem'],
  ] as const)(
    'renders the %s button wrapper and inherited Icon at the same size',
    (buttonSize, iconSize, renderedSize) => {
      render(
        <IconButton
          label="Add"
          icon={<Icon icon="check" data-testid="icon" />}
          size={buttonSize}
        />,
      );

      const icon = screen.getByTestId('icon');
      const wrapper = icon.parentElement;
      expect(wrapper).not.toBeNull();

      expect(icon).toHaveAttribute('data-size', iconSize);
      // The glyph reads the theme's size vars; with no theme it falls back to
      // the size's own rem value, which the wrapper declares directly.
      expect(unthemedLength(getComputedStyle(icon).width)).toBe(renderedSize);
      expect(unthemedLength(getComputedStyle(icon).height)).toBe(renderedSize);
      expect(getComputedStyle(wrapper!).width).toBe(renderedSize);
      expect(getComputedStyle(wrapper!).height).toBe(renderedSize);
    },
  );

  it('preserves an explicit Astryx Icon size', () => {
    render(
      <IconButton
        label="Add"
        icon={<Icon icon="check" size="lg" data-testid="icon" />}
        size="sm"
      />,
    );

    expect(screen.getByTestId('icon')).toHaveAttribute('data-size', 'lg');
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <IconButton label="Close" icon={<span>✕</span>} onClick={handleClick} />,
    );

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when isDisabled is true', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <IconButton
        label="Close"
        icon={<span>✕</span>}
        isDisabled
        onClick={handleClick}
      />,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('shows loading state', () => {
    render(<IconButton label="Save" icon={<span>💾</span>} isLoading />);
    const button = screen.getByRole('button');
    // Busy is aria-disabled (focusable), not native disabled — see #4871.
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<IconButton label="Action" icon={<span>⚡</span>} ref={ref} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement);
  });

  it('has displayName set', () => {
    expect(IconButton.displayName).toBe('IconButton');
  });

  it('forwards the elevation prop through to the underlying button', () => {
    const classFor = (elevation: 'none' | 'med') => {
      const {container} = render(
        <IconButton label="Add" icon={<span>+</span>} elevation={elevation} />,
      );
      return container.querySelector('button')!.className;
    };
    // A raised FAB must render differently from the default flat icon button.
    expect(classFor('med')).not.toBe(classFor('none'));
  });
});
