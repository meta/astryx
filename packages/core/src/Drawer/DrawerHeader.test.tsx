// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DrawerHeader.test.tsx
 * @input Uses vitest, @testing-library/react, DrawerHeader component
 * @output Unit tests for DrawerHeader rendering, close action, slots, and theming targets
 * @position Core testing; validates DrawerHeader.tsx implementation
 *
 * SYNC: When DrawerHeader.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {DrawerHeader} from './DrawerHeader';

describe('DrawerHeader', () => {
  it('renders the title as an h2 and the subtitle below it', () => {
    render(<DrawerHeader title="Host details" subtitle="web-prod-04" />);
    expect(
      screen.getByRole('heading', {level: 2, name: 'Host details'}),
    ).toBeInTheDocument();
    expect(screen.getByText('web-prod-04')).toBeInTheDocument();
  });

  it('renders no close button without onOpenChange', () => {
    render(<DrawerHeader title="Details" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a named close button that calls onOpenChange(false)', () => {
    const handleOpenChange = vi.fn();
    render(<DrawerHeader title="Details" onOpenChange={handleOpenChange} />);
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));
    expect(handleOpenChange).toHaveBeenCalledTimes(1);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders start and end content around the title', () => {
    render(
      <DrawerHeader
        title="Details"
        startContent={<button type="button">Back</button>}
        endContent={<button type="button">Edit</button>}
        onOpenChange={() => {}}
      />,
    );
    const names = screen
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual(['Back', 'Edit', 'Close']);
  });

  it('renders 0 values inside their start and end content slots', () => {
    const {container} = render(
      <DrawerHeader title="Details" startContent={0} endContent={0} />,
    );

    expect(
      container.querySelector('.astryx-drawer-header-start-content'),
    ).toHaveTextContent('0');
    expect(
      container.querySelector('.astryx-drawer-header-end-content'),
    ).toHaveTextContent('0');
  });

  it('renders a 0 subtitle and skips an empty one', () => {
    const {rerender, container} = render(
      <DrawerHeader title="Details" subtitle={0} />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
    rerender(<DrawerHeader title="Details" subtitle="" />);
    const titleBlock = container.querySelector(
      '.astryx-drawer-header-title-block',
    );
    expect(titleBlock?.children).toHaveLength(1);
  });

  it('emits its theming targets', () => {
    const {container} = render(
      <DrawerHeader
        title="Details"
        startContent="Start"
        endContent="End"
        onOpenChange={() => {}}
      />,
    );
    for (const target of [
      'drawer-header',
      'drawer-header-start-content',
      'drawer-header-title-block',
      'drawer-header-end-content',
      'drawer-header-close-icon',
    ]) {
      expect(container.querySelector(`.astryx-${target}`)).not.toBeNull();
    }
  });

  it('does not move focus on mount', () => {
    render(<DrawerHeader title="Details" onOpenChange={() => {}} />);
    expect(document.activeElement).toBe(document.body);
  });
});
