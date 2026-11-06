// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useGridFocus.test.tsx
 * @input Uses vitest, @testing-library/react, useGridFocus hook
 * @output Unit tests for useGridFocus roving tabindex + RTL navigation
 * @position Testing; validates useGridFocus.ts roving-tabindex ownership
 *
 * SYNC: When useGridFocus.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {useGridFocus} from './useGridFocus';

const NO_DISABLED: number[] = [];

/**
 * A 3x3 grid of cells shaped like Calendar: each `role="gridcell"` div wraps a
 * focusable `<button>` (the focus target). `seed` marks which button starts
 * tabbable (mirrors Calendar seeding the selected/today/first-enabled day).
 */
function Grid({
  disabled = NO_DISABLED,
  seed = 0,
  dir,
  ...opts
}: {
  disabled?: number[];
  seed?: number;
  dir?: 'ltr' | 'rtl';
} & Partial<Parameters<typeof useGridFocus>[0]>) {
  const {gridRef, handleKeyDown, handleFocus} = useGridFocus<HTMLDivElement>({
    columns: 3,
    cellSelector: '[role="gridcell"]',
    isCellFocusable: cell =>
      cell.querySelector('button:not([disabled])') !== null,
    getFocusTarget: cell => cell.querySelector<HTMLElement>('button'),
    hasRovingTabIndex: true,
    ...opts,
  });
  return (
    <div
      ref={gridRef}
      role="grid"
      dir={dir}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}>
      {Array.from({length: 9}, (_, i) => (
        <div role="gridcell" key={i}>
          <button
            type="button"
            disabled={disabled.includes(i)}
            tabIndex={i === seed ? 0 : -1}
            data-testid={`cell-${i}`}>
            {i}
          </button>
        </div>
      ))}
    </div>
  );
}

describe('useGridFocus roving tabindex (hasRovingTabIndex)', () => {
  it('honors the seeded tab stop and stamps -1 on the rest', () => {
    render(<Grid seed={4} />);
    expect(screen.getByTestId('cell-4')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('cell-0')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('cell-8')).toHaveAttribute('tabindex', '-1');
  });

  it('repairs to the first focusable cell when no cell is seeded', () => {
    render(<Grid seed={-1} />);
    expect(screen.getByTestId('cell-0')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('cell-1')).toHaveAttribute('tabindex', '-1');
  });

  it('promotes the first ENABLED cell when the seed is disabled', () => {
    render(<Grid seed={-1} disabled={[0, 1]} />);
    expect(screen.getByTestId('cell-2')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('cell-0')).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight moves the tab stop to the next cell', () => {
    render(<Grid seed={0} />);
    const grid = screen.getByRole('grid');
    screen.getByTestId('cell-0').focus();
    fireEvent.keyDown(grid, {key: 'ArrowRight'});
    expect(screen.getByTestId('cell-1')).toHaveFocus();
    expect(screen.getByTestId('cell-1')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('cell-0')).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowDown moves the tab stop one row down', () => {
    render(<Grid seed={0} />);
    const grid = screen.getByRole('grid');
    screen.getByTestId('cell-0').focus();
    fireEvent.keyDown(grid, {key: 'ArrowDown'});
    expect(screen.getByTestId('cell-3')).toHaveFocus();
    expect(screen.getByTestId('cell-3')).toHaveAttribute('tabindex', '0');
  });

  it('handleFocus repairs the stop when the tabbable cell became disabled', () => {
    // Seed cell 0 as tabbable, then disable it and fire the container onFocus.
    // syncTabStops should promote the first still-focusable cell (cell 1).
    const {rerender} = render(<Grid seed={0} />);
    const grid = screen.getByRole('grid');
    expect(screen.getByTestId('cell-0')).toHaveAttribute('tabindex', '0');
    rerender(<Grid seed={-1} disabled={[0]} />);
    fireEvent.focus(grid);
    expect(screen.getByTestId('cell-1')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('cell-0')).toHaveAttribute('tabindex', '-1');
  });

  it('flips ArrowLeft/ArrowRight under RTL', () => {
    render(<Grid seed={1} dir="rtl" />);
    const grid = screen.getByRole('grid');
    screen.getByTestId('cell-1').focus();
    // In RTL, ArrowLeft is "forward" (moves to the next cell in DOM order).
    fireEvent.keyDown(grid, {key: 'ArrowLeft'});
    expect(screen.getByTestId('cell-2')).toHaveFocus();
  });

  it('does not manage tabindex when hasRovingTabIndex is off', () => {
    render(<Grid seed={0} hasRovingTabIndex={false} />);
    // The seeded -1/0 values are left untouched (caller owns them), and
    // navigation still works without stamping.
    const grid = screen.getByRole('grid');
    screen.getByTestId('cell-0').focus();
    fireEvent.keyDown(grid, {key: 'ArrowRight'});
    expect(screen.getByTestId('cell-1')).toHaveFocus();
    // cell-1 kept its seeded -1; the hook did not promote it.
    expect(screen.getByTestId('cell-1')).toHaveAttribute('tabindex', '-1');
  });
});

describe('useGridFocus RTL auto-detection (WCAG 1.3.2)', () => {
  // jsdom reflects the `dir` attribute into computed style only on the element
  // that carries it, so tests set dir="rtl" on the grid container itself — the
  // element the hook reads via gridRef.

  it('auto-detects dir="rtl": ArrowLeft moves forward (next cell)', () => {
    render(<Grid seed={1} dir="rtl" />);
    const grid = screen.getByRole('grid');
    screen.getByTestId('cell-1').focus();
    fireEvent.keyDown(grid, {key: 'ArrowLeft'});
    expect(screen.getByTestId('cell-2')).toHaveFocus();
  });

  it('auto-detects dir="rtl": ArrowRight moves backward (previous cell)', () => {
    render(<Grid seed={1} dir="rtl" />);
    const grid = screen.getByRole('grid');
    screen.getByTestId('cell-1').focus();
    fireEvent.keyDown(grid, {key: 'ArrowRight'});
    expect(screen.getByTestId('cell-0')).toHaveFocus();
  });

  it('leaves vertical navigation unaffected under dir="rtl"', () => {
    render(<Grid seed={0} dir="rtl" />);
    const grid = screen.getByRole('grid');
    screen.getByTestId('cell-0').focus();
    fireEvent.keyDown(grid, {key: 'ArrowDown'});
    expect(screen.getByTestId('cell-3')).toHaveFocus();
  });
});

describe('useGridFocus page keys', () => {
  it('passes the key event to onPageUp and onPageDown', () => {
    const onPageUp = vi.fn();
    const onPageDown = vi.fn();
    render(<Grid seed={4} onPageUp={onPageUp} onPageDown={onPageDown} />);
    const cell = screen.getByTestId('cell-4');
    cell.focus();
    fireEvent.keyDown(cell, {key: 'PageUp', shiftKey: true});
    fireEvent.keyDown(cell, {key: 'PageDown'});
    expect(onPageUp).toHaveBeenCalledWith(
      expect.objectContaining({key: 'PageUp', shiftKey: true}),
    );
    expect(onPageDown).toHaveBeenCalledWith(
      expect.objectContaining({key: 'PageDown', shiftKey: false}),
    );
  });
});
