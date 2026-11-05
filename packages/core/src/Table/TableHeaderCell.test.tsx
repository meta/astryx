// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableHeaderCell.test.tsx
 * @input Uses vitest, @testing-library/react, StyleX, Table, TableHeaderCell
 * @output Unit tests for TableHeaderCell
 * @position Testing; validates the `<th>` contract, the standalone (no
 *   TableContext) plain render, and the context-driven density/divider styling
 *
 * SYNC: When TableHeaderCell.tsx changes, update tests to match
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {Table} from './Table';
import {TableHeaderCell} from './TableHeaderCell';
import type {TableColumn} from './types';

// =============================================================================
// Test Data
// =============================================================================

interface User extends Record<string, unknown> {
  name: string;
  age: number;
}

const users: User[] = [{name: 'Alice', age: 30}];

const columns: TableColumn<User>[] = [
  {key: 'name', header: 'Name'},
  {key: 'age', header: 'Age'},
];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Read back the CSS declarations that actually apply to an element's classes.
 * StyleX runs with `runtimeInjection` under vitest, so the real rules live in
 * `document.styleSheets` — this keeps the assertions on declarations instead
 * of on hashed class names.
 *
 * Conditional rules keep their pseudo-class prefix, e.g.
 * `:last-child border-inline-end-width: 0`.
 */
function cssDeclarationsOf(el: Element): string[] {
  const classes = new Set(
    (el as HTMLElement).className.split(/\s+/).filter(Boolean),
  );
  const declarations: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      const text = rule.cssText;
      const brace = text.indexOf('{');
      if (brace === -1) {
        continue;
      }
      // Strip StyleX's `:not(#\#)` specificity padding from the selector.
      const selector = text.slice(0, brace).replaceAll(':not(#\\#)', '').trim();
      const match = /^\.([\w-]+)(.*)$/.exec(selector);
      if (!match || !classes.has(match[1])) {
        continue;
      }
      const body = text
        .slice(brace + 1, text.lastIndexOf('}'))
        .trim()
        .replace(/;$/, '');
      const condition = match[2].trim();
      declarations.push(condition ? `${condition} ${body}` : body);
    }
  }

  return declarations;
}

/** Render a lone header cell with no Table around it. */
function renderStandalone(cell: React.ReactNode) {
  return render(
    <table>
      <thead>
        <tr>{cell}</tr>
      </thead>
    </table>,
  );
}

/** Declarations applying to the first header cell of a rendered Table. */
function headerCellDeclarations(container: HTMLElement): string[] {
  const th = container.querySelector('thead th');
  expect(th).not.toBeNull();
  return cssDeclarationsOf(th as Element);
}

// =============================================================================
// Tests
// =============================================================================

describe('TableHeaderCell', () => {
  it('renders a th element around its children', () => {
    const {container} = renderStandalone(
      <TableHeaderCell>Name</TableHeaderCell>,
    );
    const th = container.querySelector('th');
    expect(th).not.toBeNull();
    expect(th).toHaveTextContent('Name');
    expect(screen.getByRole('columnheader')).toBe(th);
  });

  it('sets no scope attribute unless one is given', () => {
    const {container} = renderStandalone(
      <TableHeaderCell>Name</TableHeaderCell>,
    );
    expect(container.querySelector('th')).not.toHaveAttribute('scope');
  });

  it('reflects the scope prop on the th', () => {
    const {container} = renderStandalone(
      <TableHeaderCell scope="rowgroup">Name</TableHeaderCell>,
    );
    expect(container.querySelector('th')).toHaveAttribute('scope', 'rowgroup');
  });

  it('renders unstyled when used outside a Table', () => {
    const {container} = renderStandalone(
      <TableHeaderCell>Name</TableHeaderCell>,
    );
    const th = container.querySelector('th') as HTMLElement;
    // No table context — no density, divider or overflow styling at all.
    expect(cssDeclarationsOf(th)).toEqual([]);
    expect(th).toHaveClass('astryx-table-header-cell');
  });

  it('takes the balanced density padding from the table by default', () => {
    const {container} = render(<Table data={users} columns={columns} />);
    const declarations = headerCellDeclarations(container);
    expect(declarations).toContain('padding-block: var(--spacing-2)');
    expect(declarations).toContain('padding-inline: var(--spacing-3)');
  });

  it('takes the compact density padding from the table', () => {
    const {container} = render(
      <Table data={users} columns={columns} density="compact" />,
    );
    const declarations = headerCellDeclarations(container);
    expect(declarations).toContain('padding-block: var(--spacing-1)');
    expect(declarations).toContain('padding-inline: var(--spacing-2)');
  });

  it('takes the spacious density padding from the table', () => {
    const {container} = render(
      <Table data={users} columns={columns} density="spacious" />,
    );
    const declarations = headerCellDeclarations(container);
    expect(declarations).toContain('padding-block: var(--spacing-3)');
    expect(declarations).toContain('padding-inline: var(--spacing-4)');
  });

  it('applies the header font weight and color inside a table', () => {
    const {container} = render(<Table data={users} columns={columns} />);
    const declarations = headerCellDeclarations(container);
    expect(declarations).toContain('font-weight: var(--font-weight-semibold)');
    expect(declarations).toContain('color: var(--color-text-secondary)');
  });

  it('draws the bottom divider even when the table has dividers off', () => {
    const {container} = render(
      <Table data={users} columns={columns} dividers="none" />,
    );
    const declarations = headerCellDeclarations(container);
    // The header/body separator is unconditional inside a table.
    expect(declarations).toContain('border-bottom-width: var(--border-width)');
    expect(declarations).toContain('border-bottom-style: solid');
    expect(declarations).toContain('border-bottom-color: var(--color-border)');
    // …but the column divider is not.
    expect(declarations.filter(d => d.includes('border-inline-end'))).toEqual(
      [],
    );
  });

  it('draws no column divider when the table divides rows only', () => {
    const {container} = render(
      <Table data={users} columns={columns} dividers="rows" />,
    );
    expect(
      headerCellDeclarations(container).filter(d =>
        d.includes('border-inline-end'),
      ),
    ).toEqual([]);
  });

  // StyleX packs the default and the `:last-child` override into one atomic
  // class, so this reads the rules the header cells carry rather than
  // comparing two cells — both carry byte-identical classes. The divider sits
  // on the logical inline-end edge so it mirrors under RTL.
  it('draws a column divider that the last header cell zeroes out', () => {
    const {container} = render(
      <Table data={users} columns={columns} dividers="columns" />,
    );
    const declarations = headerCellDeclarations(container);
    expect(declarations).toContain(
      'border-inline-end-width: var(--border-width)',
    );
    expect(declarations).toContain('border-inline-end-style: solid');
    expect(declarations).toContain(
      'border-inline-end-color: var(--color-border)',
    );
    expect(declarations).toContain(':last-child border-inline-end-width: 0');
  });

  it('draws a column divider when the table divides on a grid', () => {
    const {container} = render(
      <Table data={users} columns={columns} dividers="grid" />,
    );
    expect(headerCellDeclarations(container)).toContain(
      'border-inline-end-width: var(--border-width)',
    );
  });

  it('lets consumer xstyle win over the context header styling', () => {
    const custom = stylex.create({trailing: {textAlign: 'end'}});
    const {container} = render(
      <Table>
        <thead>
          <tr>
            <TableHeaderCell xstyle={custom.trailing}>Name</TableHeaderCell>
          </tr>
        </thead>
      </Table>,
    );
    const declarations = headerCellDeclarations(container);
    // The context sets `text-align: start`; xstyle merges on top of it.
    expect(declarations).toContain('text-align: end');
    expect(declarations).not.toContain('text-align: start');
    // The rest of the context styling survives the override.
    expect(declarations).toContain('padding-inline: var(--spacing-3)');
  });

  it('accepts an array of xstyle values', () => {
    const custom = stylex.create({
      caps: {textTransform: 'uppercase'},
      spaced: {letterSpacing: '2px'},
    });
    const {container} = renderStandalone(
      <TableHeaderCell xstyle={[custom.caps, custom.spaced]}>
        Name
      </TableHeaderCell>,
    );
    const th = container.querySelector('th') as HTMLElement;
    expect(cssDeclarationsOf(th).sort()).toEqual([
      'letter-spacing: 2px',
      'text-transform: uppercase',
    ]);
  });

  it('forwards the ref to the th element', () => {
    const ref = vi.fn();
    renderStandalone(<TableHeaderCell ref={ref}>Name</TableHeaderCell>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLTableCellElement));
  });

  it('spreads html attributes onto the th', () => {
    const {container} = renderStandalone(
      <TableHeaderCell
        id="name-header"
        aria-sort="ascending"
        data-column-key="name">
        Name
      </TableHeaderCell>,
    );
    const th = container.querySelector('th') as HTMLElement;
    expect(th.id).toBe('name-header');
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(th).toHaveAttribute('data-column-key', 'name');
  });

  it('keeps a consumer className and style alongside the astryx class', () => {
    const {container} = renderStandalone(
      <TableHeaderCell className="custom-header" style={{width: '10px'}}>
        Name
      </TableHeaderCell>,
    );
    const th = container.querySelector('th') as HTMLElement;
    expect(th).toHaveClass('astryx-table-header-cell');
    expect(th).toHaveClass('custom-header');
    expect(th.style.width).toBe('10px');
  });
});
