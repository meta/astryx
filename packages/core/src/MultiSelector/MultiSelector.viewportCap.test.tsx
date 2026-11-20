// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.viewportCap.test.tsx
 * @input Uses vitest, Testing Library, and MultiSelector
 * @output Tests that MultiSelector's list layer clamps its trigger-width minimum to
 *   the layer runtime's viewport cap
 * @position Tests; beside MultiSelector.test.tsx
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {MultiSelector} from './MultiSelector';

// jsdom has no Popover API; reflect open state the way the browser does.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
  });
});

describe('MultiSelector list layer width', () => {
  it('keeps a trigger wider than the viewport cap from widening the layer past it', () => {
    render(
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana']}
        value={[]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', {name: 'Fruit'}));
    const layer = document.querySelector('[popover]');
    // A CSS minimum beats a maximum, so an unclamped trigger-width minimum
    // would defeat the layer's viewport cap and leave no position that fits.
    expect(layer).toHaveStyle(
      'min-width: min(anchor-size(width),calc(100vi - calc(max(var(--spacing-4), env(safe-area-inset-left, 0px)) + var(--astryx-layer-inset-inline-start, 0px)) - calc(max(var(--spacing-4), env(safe-area-inset-right, 0px)) + var(--astryx-layer-inset-inline-end, 0px))))',
    );
  });
});
