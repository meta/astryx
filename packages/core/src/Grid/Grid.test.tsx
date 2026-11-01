// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Grid.test.tsx
 * @input Uses vitest, @testing-library/react, Grid and GridSpan components
 * @output Unit tests for Grid and GridSpan component behavior
 * @position Testing; validates Grid.tsx and GridSpan.tsx implementation
 *
 * SYNC: When Grid.tsx or GridSpan.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Grid} from './Grid';
import {GridSpan} from './GridSpan';

/**
 * The track template is applied via a StyleX dynamic style: the element
 * carries an inline CSS variable while the `grid-template-columns`
 * declaration lives in a class (so consumer xstyle/@media overrides can
 * win). `--x-gridTemplateColumns` is the debug-mode variable name emitted
 * by the StyleX transform in tests.
 */
function templateColumns(el: HTMLElement): string {
  return el.style.getPropertyValue('--x-gridTemplateColumns');
}

describe('Grid', () => {
  it('renders with fixed columns', () => {
    render(
      <Grid columns={3} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid).toBeInTheDocument();
    expect(templateColumns(grid)).toBe('repeat(3, 1fr)');
  });

  it('does not write grid-template-columns as a raw inline style (regression: inline style defeats xstyle/@media overrides)', () => {
    render(
      <Grid columns={3} rowHeight={80} data-testid="grid">
        <div>Item 1</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    // The declaration must live in a class (via CSS-var indirection), never
    // as a raw inline property — inline would beat any consumer override.
    expect(grid.style.gridTemplateColumns).toBe('');
    expect(grid.style.gridAutoRows).toBe('');
    expect(templateColumns(grid)).toBe('repeat(3, 1fr)');
    expect(grid.style.getPropertyValue('--x-gridAutoRows')).toBe('80px');
  });

  it('renders with columns object (auto-fill default)', () => {
    render(
      <Grid columns={{minWidth: 250}} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe('repeat(auto-fill, minmax(250px, 1fr))');
  });

  it('renders with columns object max (count capped, tracks still fill)', () => {
    render(
      <Grid columns={{minWidth: 250, max: 3}} gap={4} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    // Cap lives on the track MIN (min(100%, max(minWidth, perColumn))); the
    // track MAX stays 1fr so present columns fill the row (a lone column on
    // mobile stretches to 100% instead of leaving dead space).
    expect(templateColumns(grid)).toBe(
      'repeat(auto-fill, minmax(min(100%, max(250px, calc((100% - 2 * var(--spacing-4)) / 3))), 1fr))',
    );
    expect(grid.style.maxWidth).toBe('');
  });

  it('keeps track max at 1fr with a max cap so a lone column can fill (#3391)', () => {
    // Regression: previously the cap was applied to the track MAX
    // (minmax(minWidth, 100%/max)), so when fewer than `max` columns fit —
    // e.g. a single column on mobile — the lone column was pinned to ~100%/max
    // and left dead space on the right. The cap now lives on the track MIN and
    // the track MAX stays 1fr, so present columns always stretch to fill.
    render(
      <Grid columns={{minWidth: 360, max: 2}} gap={4} data-testid="grid">
        <div>Left</div>
        <div>Right</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    const template = templateColumns(grid);
    // Track max must be 1fr (fills), not a fraction-of-container cap.
    expect(template).toMatch(/, 1fr\)\)$/);
    expect(template).not.toMatch(/, calc\([^)]*\/ 2\)\)\)$/);
    expect(template).toBe(
      'repeat(auto-fill, minmax(min(100%, max(360px, calc((100% - 1 * var(--spacing-4)) / 2))), 1fr))',
    );
  });

  it('renders with columns object max using columnGap', () => {
    render(
      <Grid columns={{minWidth: 200, max: 4}} columnGap={6} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    // columnGap takes precedence in the perColumn floor calculation
    expect(templateColumns(grid)).toBe(
      'repeat(auto-fill, minmax(min(100%, max(200px, calc((100% - 3 * var(--spacing-6)) / 4))), 1fr))',
    );
    expect(grid.style.maxWidth).toBe('');
  });

  it('applies gap correctly', () => {
    render(
      <Grid columns={2} gap={4} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid).toBeInTheDocument();
    // Gap is applied via stylex class, just verify component renders
  });

  it('applies rowGap and columnGap separately', () => {
    render(
      <Grid columns={2} rowGap={2} columnGap={6} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid).toBeInTheDocument();
    // Gaps are applied via stylex classes
  });

  it('applies alignment props', () => {
    render(
      <Grid columns={2} align="center" justify="start" data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid).toBeInTheDocument();
    // Alignment is applied via stylex classes
  });

  it('defaults to 1 column when nothing specified', () => {
    render(
      <Grid data-testid="grid">
        <div>Item 1</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe('1fr');
  });

  // --- P1: columns={0} guard (hardening #719) ---

  it('falls back to 1fr when columns={0}', () => {
    render(
      <Grid columns={0} data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    // columns={0} must not produce repeat(0, 1fr) — should fall back to default
    expect(templateColumns(grid)).toBe('1fr');
  });

  it('falls back to 1fr when columns is negative', () => {
    render(
      <Grid columns={-1} data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe('1fr');
  });

  it('uses auto-fill with a plain 1fr track when no max specified', () => {
    render(
      <Grid columns={{minWidth: 200}} data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe('repeat(auto-fill, minmax(200px, 1fr))');
    expect(grid.style.maxWidth).toBe('');
  });

  // --- P2: width/height props (hardening #719) ---

  it('applies numeric width as pixels', () => {
    render(
      <Grid columns={2} width={600} data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid.style.width).toBe('600px');
  });

  it('applies string width as-is', () => {
    render(
      <Grid columns={2} width="100%" data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid.style.width).toBe('100%');
  });

  it('applies numeric height as pixels', () => {
    render(
      <Grid columns={2} height={400} data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid.style.height).toBe('400px');
  });

  it('applies string height as-is', () => {
    render(
      <Grid columns={2} height="50vh" data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid.style.height).toBe('50vh');
  });

  // --- P2: columns object + columnGap interaction (hardening #719) ---

  it('uses columnGap var in the count-cap floor when both columnGap and gap are set', () => {
    render(
      <Grid
        columns={{minWidth: 200, max: 3}}
        gap={2}
        columnGap={6}
        data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    // columnGap takes precedence over gap in the perColumn floor
    expect(templateColumns(grid)).toBe(
      'repeat(auto-fill, minmax(min(100%, max(200px, calc((100% - 2 * var(--spacing-6)) / 3))), 1fr))',
    );
    expect(grid.style.maxWidth).toBe('');
  });

  it('uses gap var in the count-cap floor when columnGap is not set', () => {
    render(
      <Grid columns={{minWidth: 150, max: 2}} gap={3} data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe(
      'repeat(auto-fill, minmax(min(100%, max(150px, calc((100% - 1 * var(--spacing-3)) / 2))), 1fr))',
    );
    expect(grid.style.maxWidth).toBe('');
  });

  it('uses simple fraction in the count-cap floor when no gap is set', () => {
    render(
      <Grid columns={{minWidth: 100, max: 3}} data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe(
      'repeat(auto-fill, minmax(min(100%, max(100px, calc(100% / 3))), 1fr))',
    );
    expect(grid.style.maxWidth).toBe('');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <Grid columns={2} ref={ref}>
        <div>Item</div>
      </Grid>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('passes through additional props', () => {
    render(
      <Grid columns={2} data-testid="grid" aria-label="Product grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid).toHaveAttribute('aria-label', 'Product grid');
  });

  it('keeps component-owned theme metadata over colliding pass-throughs', () => {
    render(
      <Grid
        columns={3}
        gap={4}
        align="end"
        justify="center"
        data-columns="9"
        data-gap="10"
        data-align="start"
        data-justify="stretch"
        data-testid="grid">
        <div>Item</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(grid).toHaveAttribute('data-columns', '3');
    expect(grid).toHaveAttribute('data-gap', '4');
    expect(grid).toHaveAttribute('data-align', 'end');
    expect(grid).toHaveAttribute('data-justify', 'center');
  });

  it('renders children correctly', () => {
    render(
      <Grid columns={3} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </Grid>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  // --- columns object API ---

  it('renders with columns={{minWidth}} using auto-fill', () => {
    render(
      <Grid columns={{minWidth: 280}} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe('repeat(auto-fill, minmax(280px, 1fr))');
  });

  it('renders with columns={{minWidth, repeat: "fit"}} using auto-fit', () => {
    render(
      <Grid columns={{minWidth: 280, repeat: 'fit'}} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe('repeat(auto-fit, minmax(280px, 1fr))');
  });

  it('renders with columns={{minWidth, repeat: "fill"}} using auto-fill', () => {
    render(
      <Grid columns={{minWidth: 280, repeat: 'fill'}} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe('repeat(auto-fill, minmax(280px, 1fr))');
  });

  it('renders with columns={{minWidth, max}} capping the count while filling', () => {
    render(
      <Grid columns={{minWidth: 280, max: 3}} gap={4} data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    // Count is capped via the track MIN; track MAX stays 1fr so present
    // columns fill the row (grid stays full width).
    expect(templateColumns(grid)).toBe(
      'repeat(auto-fill, minmax(min(100%, max(280px, calc((100% - 2 * var(--spacing-4)) / 3))), 1fr))',
    );
    expect(grid.style.maxWidth).toBe('');
  });

  it('renders with columns={{minWidth, max, repeat: "fit"}} using auto-fit + count cap', () => {
    render(
      <Grid
        columns={{minWidth: 280, max: 3, repeat: 'fit'}}
        gap={4}
        data-testid="grid">
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>,
    );
    const grid = screen.getByTestId('grid');
    expect(templateColumns(grid)).toBe(
      'repeat(auto-fit, minmax(min(100%, max(280px, calc((100% - 2 * var(--spacing-4)) / 3))), 1fr))',
    );
    expect(grid.style.maxWidth).toBe('');
  });
});

describe('GridSpan', () => {
  it('spans correct number of columns', () => {
    render(
      <Grid columns={4}>
        <GridSpan columns={2} data-testid="span">
          Wide item
        </GridSpan>
      </Grid>,
    );
    const span = screen.getByTestId('span');
    expect(span.style.gridColumn).toBe('span 2');
  });

  it('spans full width with columns="full"', () => {
    render(
      <Grid columns={4}>
        <GridSpan columns="full" data-testid="span">
          Full width
        </GridSpan>
      </Grid>,
    );
    const span = screen.getByTestId('span');
    expect(span.style.gridColumn).toBe('1 / -1');
  });

  it('spans correct number of rows', () => {
    render(
      <Grid columns={3}>
        <GridSpan rows={2} data-testid="span">
          Tall item
        </GridSpan>
      </Grid>,
    );
    const span = screen.getByTestId('span');
    expect(span.style.gridRow).toBe('span 2');
  });

  it('spans both columns and rows', () => {
    render(
      <Grid columns={4}>
        <GridSpan columns={2} rows={2} data-testid="span">
          2x2 item
        </GridSpan>
      </Grid>,
    );
    const span = screen.getByTestId('span');
    expect(span.style.gridColumn).toBe('span 2');
    expect(span.style.gridRow).toBe('span 2');
  });

  it('renders without span props', () => {
    render(
      <Grid columns={3}>
        <GridSpan data-testid="span">Normal item</GridSpan>
      </Grid>,
    );
    const span = screen.getByTestId('span');
    expect(span).toBeInTheDocument();
    expect(span.style.gridColumn).toBe('');
    expect(span.style.gridRow).toBe('');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <Grid columns={2}>
        <GridSpan ref={ref}>Item</GridSpan>
      </Grid>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('passes through additional props', () => {
    render(
      <Grid columns={2}>
        <GridSpan columns={2} data-testid="span" aria-label="Featured item">
          Content
        </GridSpan>
      </Grid>,
    );
    const span = screen.getByTestId('span');
    expect(span).toHaveAttribute('aria-label', 'Featured item');
  });

  it('renders children correctly', () => {
    render(
      <Grid columns={3}>
        <GridSpan columns="full">
          <span data-testid="child">Child content</span>
        </GridSpan>
      </Grid>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
