// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeList.test.tsx
 * @input Uses vitest, @testing-library/react, TreeList
 * @output Unit tests for TreeList component
 * @position Testing; validates TreeList.tsx implementation
 *
 * SYNC: When modified, update this header
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import type {ReactNode} from 'react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {TreeList} from './TreeList';
import type {TreeListItemData} from './TreeListTypes';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {FOCUS_OUTLINE} from '../utils/focusOutline.stylex';

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}

/**
 * Concatenate all StyleX-injected CSS (both CSSOM sheets and <style> text) so
 * tests can assert on compiled stylesheet rules — jsdom does not resolve the
 * @layer cascade or compute layout, so structural CSS assertions read the
 * generated declarations directly.
 */
function collectCssText(): string {
  let out = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        out += rule.cssText + '\n';
      }
    } catch {
      // ignore cross-origin sheets
    }
  }
  out += Array.from(document.querySelectorAll('style'))
    .map(s => s.textContent || '')
    .join('\n');
  return out;
}
const rowStyles = stylex.create({
  custom: {opacity: 0.75},
});

const simpleItems: TreeListItemData[] = [
  {id: 'a', label: 'Item A'},
  {id: 'b', label: 'Item B'},
];

const nestedItems: TreeListItemData[] = [
  {
    id: 'parent',
    label: 'Parent',
    children: [
      {id: 'child-1', label: 'Child 1'},
      {id: 'child-2', label: 'Child 2'},
    ],
  },
  {id: 'sibling', label: 'Sibling'},
];

const nestedItemsExpanded: TreeListItemData[] = [
  {
    id: 'parent',
    label: 'Parent',
    isExpanded: true,
    children: [
      {id: 'child-1', label: 'Child 1'},
      {id: 'child-2', label: 'Child 2'},
    ],
  },
  {id: 'sibling', label: 'Sibling'},
];

const deepItems: TreeListItemData[] = [
  {
    id: 'root',
    label: 'Root',
    isExpanded: true,
    children: [
      {
        id: 'mid',
        label: 'Mid',
        isExpanded: true,
        children: [{id: 'leaf', label: 'Leaf'}],
      },
    ],
  },
];

// APG keyboard fixtures (module-level to satisfy no-unstable-default-props).
const flatItems: TreeListItemData[] = [
  {id: 'a', label: 'Apple'},
  {id: 'b', label: 'Banana'},
  {id: 'c', label: 'Cherry'},
];

const withDisabledItems: TreeListItemData[] = [
  {id: 'a', label: 'Apple'},
  {id: 'b', label: 'Banana', isDisabled: true},
  {id: 'c', label: 'Cherry'},
];

const collapsedParentItems: TreeListItemData[] = [
  {
    id: 'parent',
    label: 'Parent',
    children: [
      {id: 'child-1', label: 'Child 1'},
      {id: 'child-2', label: 'Child 2'},
    ],
  },
  {id: 'sibling', label: 'Sibling'},
];

const expandedParentItems: TreeListItemData[] = [
  {
    id: 'parent',
    label: 'Parent',
    isExpanded: true,
    children: [
      {id: 'child-1', label: 'Child 1'},
      {id: 'child-2', label: 'Child 2'},
    ],
  },
  {id: 'sibling', label: 'Sibling'},
];

describe('TreeList', () => {
  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  it('renders items', () => {
    render(<TreeList items={simpleItems} />);
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Item B')).toBeInTheDocument();
  });

  it('renders with data-testid', () => {
    render(<TreeList items={simpleItems} data-testid="tree" />);
    expect(screen.getByTestId('tree')).toBeInTheDocument();
  });

  it('forwards aria-label to the tree element', () => {
    render(<TreeList items={simpleItems} aria-label="File tree" />);
    const tree = screen.getByRole('tree');
    expect(tree).toHaveAttribute('aria-label', 'File tree');
  });

  it('forwards id to the root element', () => {
    render(<TreeList items={simpleItems} id="file-tree" />);
    const root = screen.getByRole('tree').parentElement;
    expect(root).toHaveAttribute('id', 'file-tree');
  });

  it('renders description text', () => {
    const items: TreeListItemData[] = [
      {id: 'a', label: 'Label', description: 'Description text'},
    ];
    render(<TreeList items={items} />);
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });

  // ===========================================================================
  // Row accessible name and description (APG tree view: named by the label)
  // ===========================================================================

  it('names a parent row by its label alone, not the chevron toggle', () => {
    const items: TreeListItemData[] = [
      {id: 'docs', label: 'Documents', children: [{id: 'a', label: 'Annual'}]},
    ];
    render(<TreeList items={items} />);
    const row = screen.getByText('Documents').closest('li')!;
    expect(row).toHaveAccessibleName('Documents');
  });

  it('names a plain row by its label and describes it with its description', () => {
    const items: TreeListItemData[] = [
      {id: 'a', label: 'Budget', description: 'Updated yesterday'},
    ];
    render(<TreeList items={items} />);
    const row = screen.getByText('Budget').closest('li')!;
    expect(row).toHaveAccessibleName('Budget');
    expect(row).toHaveAccessibleDescription('Updated yesterday');
  });

  it('names and describes link and action rows themselves, not only their inner control', () => {
    const items: TreeListItemData[] = [
      {id: 'l', label: 'Report', description: 'Opens the report', href: '#'},
      {
        id: 'b',
        label: 'Export',
        description: 'Downloads a file',
        onClick: () => {},
      },
    ];
    render(<TreeList items={items} />);
    const link = screen.getByText('Report').closest('li')!;
    expect(link).toHaveAccessibleName('Report');
    expect(link).toHaveAccessibleDescription('Opens the report');
    const action = screen.getByText('Export').closest('li')!;
    expect(action).toHaveAccessibleName('Export');
    expect(action).toHaveAccessibleDescription('Downloads a file');
  });

  it('keeps start and end content, including controls, out of the row name', () => {
    const items: TreeListItemData[] = [
      {
        id: 'a',
        label: 'Invoices',
        startContent: <span>12</span>,
        endContent: <button type="button">Pin folder</button>,
      },
    ];
    render(<TreeList items={items} />);
    const row = screen.getByText('Invoices').closest('li')!;
    expect(row).toHaveAccessibleName('Invoices');
  });

  it('typeahead matches the label, not the description or start content', async () => {
    const user = userEvent.setup();
    const items: TreeListItemData[] = [
      {id: 'a', label: 'Apple', description: 'Cherry-red fruit'},
      {id: 'b', label: 'Banana', startContent: <span>Curved</span>},
      {id: 'c', label: 'Cherry'},
    ];
    render(<TreeList items={items} />);
    const apple = screen.getByText('Apple').closest('li')!;
    apple.focus();
    await user.keyboard('c');
    expect(document.activeElement).toBe(
      screen.getByText('Cherry').closest('li'),
    );
  });

  // ===========================================================================
  // Semantic HTML
  // ===========================================================================

  it('renders a tree role on the list', () => {
    render(<TreeList items={simpleItems} />);
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it('renders treeitem role on items', () => {
    render(<TreeList items={simpleItems} />);
    const treeitems = screen.getAllByRole('treeitem');
    expect(treeitems).toHaveLength(2);
  });

  it('renders items as <li> elements', () => {
    const {container} = render(<TreeList items={simpleItems} />);
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
  });

  // ===========================================================================
  // Header with aria-labelledby
  // ===========================================================================

  it('renders header and associates via aria-labelledby', () => {
    render(<TreeList items={simpleItems} header={<span>File Tree</span>} />);
    expect(screen.getByText('File Tree')).toBeInTheDocument();
    const tree = screen.getByRole('tree');
    const headerId = tree.getAttribute('aria-labelledby');
    expect(headerId).toBeTruthy();
    const headerEl = document.getElementById(headerId!);
    expect(headerEl?.textContent).toBe('File Tree');
  });

  it('does not render aria-labelledby when no header', () => {
    render(<TreeList items={simpleItems} />);
    const tree = screen.getByRole('tree');
    expect(tree).not.toHaveAttribute('aria-labelledby');
  });

  it('prefers the visible header id over caller aria-labelledby when header exists', () => {
    render(
      <TreeList
        items={simpleItems}
        header={<span>File Tree</span>}
        aria-labelledby="external-label"
      />,
    );
    const tree = screen.getByRole('tree');
    const headerId = tree.getAttribute('aria-labelledby');
    expect(headerId).toBeTruthy();
    expect(headerId).not.toBe('external-label');
    const headerEl = document.getElementById(headerId!);
    expect(headerEl?.textContent).toBe('File Tree');
  });

  it('uses caller aria-labelledby on the headerless path', () => {
    render(<TreeList items={simpleItems} aria-labelledby="external-label" />);
    const tree = screen.getByRole('tree');
    expect(tree).toHaveAttribute('aria-labelledby', 'external-label');
  });

  it('ignores caller aria-label when a header names the tree', () => {
    render(
      <TreeList
        items={simpleItems}
        header={<span>File Tree</span>}
        aria-label="External name"
      />,
    );
    const tree = screen.getByRole('tree');
    expect(tree).not.toHaveAttribute('aria-label');
    const headerId = tree.getAttribute('aria-labelledby');
    const headerEl = document.getElementById(headerId!);
    expect(headerEl?.textContent).toBe('File Tree');
  });

  // ===========================================================================
  // Expansion (internal state)
  // ===========================================================================

  it('does not render children by default', () => {
    render(<TreeList items={nestedItems} />);
    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
  });

  it('renders children when item has isExpanded: true', () => {
    render(<TreeList items={nestedItemsExpanded} />);
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
  });

  it('sets aria-expanded on items with children', () => {
    render(<TreeList items={nestedItemsExpanded} />);
    const parent = screen.getByText('Parent').closest('li');
    expect(parent).toHaveAttribute('aria-expanded', 'true');
  });

  it('sets aria-expanded=false on collapsed items with children', () => {
    render(<TreeList items={nestedItems} />);
    const parent = screen.getByText('Parent').closest('li');
    expect(parent).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not set aria-expanded on leaf items', () => {
    render(<TreeList items={simpleItems} />);
    const item = screen.getByText('Item A').closest('li');
    expect(item).not.toHaveAttribute('aria-expanded');
  });

  it('renders a keyboard-focusable toggle button for parents without onClick/href', () => {
    render(<TreeList items={nestedItems} />);
    const toggle = screen.getByRole('button', {name: 'Toggle children'});
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands a parent from the keyboard via the toggle button', async () => {
    const user = userEvent.setup();
    render(<TreeList items={nestedItems} />);
    // Collapsed: children are not rendered.
    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', {name: 'Toggle children'});
    toggle.focus();
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders group role for nested children', () => {
    render(<TreeList items={nestedItemsExpanded} />);
    const groups = document.querySelectorAll('[role="group"]');
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });

  it('expands a collapsed item when clicked', async () => {
    const user = userEvent.setup();
    render(<TreeList items={nestedItems} />);
    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
    await user.click(screen.getByText('Parent'));
    expect(screen.getByText('Child 1')).toBeInTheDocument();
  });

  it('collapses an expanded item when clicked', async () => {
    const user = userEvent.setup();
    render(<TreeList items={nestedItemsExpanded} />);
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    await user.click(screen.getByText('Parent'));
    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
  });

  // ===========================================================================
  // Deep nesting
  // ===========================================================================

  it('renders deeply nested items when all expanded', () => {
    render(<TreeList items={deepItems} />);
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('Mid')).toBeInTheDocument();
    expect(screen.getByText('Leaf')).toBeInTheDocument();
  });

  // ===========================================================================
  // Focus-visible outline scoping (regression: focusing a parent row must not
  // leak the ring onto descendant rows — see #4130)
  // ===========================================================================

  it('scopes the focus-visible outline to the focused row, not its descendants', () => {
    render(<TreeList items={deepItems} />);
    const root = screen.getByText('Root').closest('li')!;
    const mid = screen.getByText('Mid').closest('li')!;
    const leaf = screen.getByText('Leaf').closest('li')!;

    // A keydown before .focus() establishes keyboard modality so jsdom's
    // :focus-visible heuristic applies deterministically, regardless of
    // pointer events left over from other tests in this file.
    fireEvent.keyDown(document.body, {key: 'Tab'});
    root.focus();
    expect(root).toHaveFocus();

    expect(
      getComputedStyle(root).getPropertyValue('--_focus-outline').trim(),
    ).toBe(FOCUS_OUTLINE);
    // Mid and Leaf are DOM descendants of Root's <li> (nested <ul role="group">
    // subtrees) — their own outline var must stay unset, not inherit Root's.
    expect(getComputedStyle(mid).getPropertyValue('--_focus-outline')).toBe(
      'none',
    );
    expect(getComputedStyle(leaf).getPropertyValue('--_focus-outline')).toBe(
      'none',
    );
  });

  // ===========================================================================
  // Interactive items
  // ===========================================================================

  it('renders an invisible button when onClick is provided', () => {
    const items: TreeListItemData[] = [
      {id: 'a', label: 'Clickable', onClick: () => {}},
    ];
    const {container} = render(<TreeList items={items} />);
    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    expect(button?.textContent).toContain('Clickable');
  });

  it('fires onClick when invisible button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const items: TreeListItemData[] = [{id: 'a', label: 'Clickable', onClick}];
    render(<TreeList items={items} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders an invisible anchor when href is provided', () => {
    const items: TreeListItemData[] = [{id: 'a', label: 'Link', href: '/docs'}];
    const {container} = render(<TreeList items={items} />);
    const anchor = container.querySelector('a');
    expect(anchor).toBeInTheDocument();
    expect(anchor).toHaveAttribute('href', '/docs');
  });

  it('does not render button or anchor for static items', () => {
    const {container} = render(<TreeList items={simpleItems} />);
    expect(container.querySelector('button')).not.toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
  });

  // ===========================================================================
  // Disabled state
  // ===========================================================================

  it('applies aria-disabled when isDisabled', () => {
    const items: TreeListItemData[] = [
      {id: 'a', label: 'Disabled', isDisabled: true},
    ];
    render(<TreeList items={items} />);
    const li = screen.getByText('Disabled').closest('li');
    expect(li).toHaveAttribute('aria-disabled', 'true');
  });

  // ===========================================================================
  // Selected state
  // ===========================================================================

  it('applies aria-selected when isSelected', () => {
    const items: TreeListItemData[] = [
      {id: 'a', label: 'Selected', isSelected: true},
    ];
    render(<TreeList items={items} />);
    const li = screen.getByText('Selected').closest('li');
    expect(li).toHaveAttribute('aria-selected', 'true');
  });

  it('does not apply aria-selected when not selected', () => {
    render(<TreeList items={simpleItems} />);
    const li = screen.getByText('Item A').closest('li');
    expect(li).not.toHaveAttribute('aria-selected');
  });

  // ===========================================================================
  // startContent and endContent
  // ===========================================================================

  it('renders startContent', () => {
    const items: TreeListItemData[] = [
      {
        id: 'a',
        label: 'With Icon',
        startContent: <span data-testid="icon">★</span>,
      },
    ];
    render(<TreeList items={items} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders endContent', () => {
    const items: TreeListItemData[] = [
      {
        id: 'a',
        label: 'With Badge',
        endContent: <span data-testid="badge">3</span>,
      },
    ];
    render(<TreeList items={items} />);
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });

  it('forwards xstyle, className, and style to an item row', () => {
    const items: TreeListItemData[] = [
      {
        id: 'a',
        label: 'Styled row',
        xstyle: rowStyles.custom,
        className: 'consumer-row',
        style: {visibility: 'visible'},
      },
    ];
    render(<TreeList items={items} />);

    const row = screen
      .getByText('Styled row')
      .closest('li')!
      .querySelector('.astryx-tree-list-item')!;
    expect(row).toHaveClass('consumer-row');
    expect(row.className).toContain(
      stylex.props(rowStyles.custom).className!.split(' ')[0],
    );
    expect(row).toHaveStyle({visibility: 'visible'});
    expect(row.getAttribute('style')).toContain('--_tree-indent');
  });

  // ===========================================================================
  // Density
  // ===========================================================================

  it('renders with compact density', () => {
    render(<TreeList items={simpleItems} density="compact" />);
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it('renders with spacious density', () => {
    render(<TreeList items={simpleItems} density="spacious" />);
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  // ===========================================================================
  // Variant (guide lines)
  // ===========================================================================

  describe('variant', () => {
    it('renders guide lines by default', () => {
      const {container} = render(<TreeList items={nestedItemsExpanded} />);
      expect(container.querySelector('.astryx-tree-list-guide')).not.toBeNull();
    });

    it("variant='lineGuides' renders guide lines (explicit == default)", () => {
      const {container} = render(
        <TreeList items={nestedItemsExpanded} variant="lineGuides" />,
      );
      expect(container.querySelector('.astryx-tree-list-guide')).not.toBeNull();
    });

    it("variant='noGuides' renders NO guide lines", () => {
      const {container} = render(
        <TreeList items={nestedItemsExpanded} variant="noGuides" />,
      );
      expect(container.querySelector('.astryx-tree-list-guide')).toBeNull();
    });

    it("variant='noGuides' preserves the tree structure and items", () => {
      render(<TreeList items={nestedItemsExpanded} variant="noGuides" />);
      // Rows, roles, and nesting are all intact — only the connectors are gone.
      expect(screen.getByRole('tree')).toBeInTheDocument();
      expect(screen.getAllByRole('treeitem')).toHaveLength(4);
      expect(screen.getByText('Parent')).toBeInTheDocument();
      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Sibling')).toBeInTheDocument();
    });

    it("variant='noGuides' preserves per-level indentation on the rows", () => {
      // Indentation lives inside the row's padding-inline-start (not the
      // guide element), so it must survive when the connectors are
      // suppressed. The per-row distance is published as the `--_tree-indent`
      // custom property (not an inline longhand — see #4308), so the theme
      // layer can override the `padding-inline-start` declaration. A deeper
      // row is indented more than a shallower one.
      const {container} = render(
        <TreeList items={deepItems} variant="noGuides" />,
      );
      const indentOf = (text: string): string => {
        const li = screen.getByText(text).closest('li')!;
        const styled = li.querySelector('[style*="--_tree-indent"]');
        return styled?.getAttribute('style') ?? '';
      };
      // Guides are gone…
      expect(container.querySelector('.astryx-tree-list-guide')).toBeNull();
      // …but each level still publishes an indent distance, and the level
      // multiplier grows with depth (0, 1, 2).
      expect(indentOf('Root')).toContain('--_tree-indent');
      expect(indentOf('Mid')).toContain('--_tree-indent');
      expect(indentOf('Leaf')).toContain('--_tree-indent');
      const level = (text: string): number => {
        const m = /calc\((\d+)/.exec(indentOf(text));
        return m ? Number(m[1]) : NaN;
      };
      expect(level('Mid')).toBeGreaterThan(level('Root'));
      expect(level('Leaf')).toBeGreaterThan(level('Mid'));
    });
  });

  // ===========================================================================
  // Guide theme target
  // ===========================================================================

  describe('guide theme target', () => {
    it('renders the astryx-tree-list-guide target on the connector lines', () => {
      const {container} = render(<TreeList items={nestedItemsExpanded} />);
      const guide = container.querySelector('.astryx-tree-list-guide');
      // A dedicated, stable target so a theme can recolor or hide the guides
      // without hiding the built-in connectors and reimplementing them.
      expect(guide).not.toBeNull();
    });

    it('exposes tree-list-guide as a themeable defineTheme target', () => {
      // jsdom cannot resolve the @layer cascade, so the generated CSS is what
      // proves a theme override reaches the guide element.
      const theme = defineTheme({
        name: 'tree-list-guide-test',
        components: {
          'tree-list-guide': {
            base: {backgroundColor: 'var(--color-accent)'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);
      expect(css).toContain('.astryx-tree-list-guide {');
      expect(css).toContain('background-color: var(--color-accent)');
    });

    it('lets a theme hide the guides via display: none on the target', () => {
      // Hiding the guides is done through the theme target, not a prop — the
      // theme rule lands in @layer astryx-theme, above StyleX's base layer.
      const theme = defineTheme({
        name: 'tree-list-guide-hidden-test',
        components: {
          'tree-list-guide': {
            base: {display: 'none'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);
      expect(css).toContain('.astryx-tree-list-guide {');
      expect(css).toContain('display: none');
    });
  });

  // ===========================================================================
  // Indent lever (--tree-list-indent)
  // ===========================================================================

  describe('indent lever', () => {
    it('lets a theme retune the indent step via the tree-list target', () => {
      // The per-level step is a public, themeable var (default --spacing-4) set
      // on the tree-list root, so a theme can retune the indent metric (e.g. to
      // --spacing-5) via defineTheme. jsdom cannot resolve the @layer cascade,
      // so the generated CSS is what proves the override reaches the lever.
      const theme = defineTheme({
        name: 'tree-list-indent-test',
        components: {
          'tree-list': {
            base: {'--tree-list-indent': 'var(--spacing-5)'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);
      expect(css).toContain('.astryx-tree-list {');
      expect(css).toContain('--tree-list-indent: var(--spacing-5)');
    });

    it('rows consume the indent step in their published indent distance', () => {
      // Each row's --_tree-indent is calc(level * var(--tree-list-indent)),
      // so retuning the step scales every level uniformly.
      render(<TreeList items={deepItems} variant="noGuides" />);
      const indentOf = (text: string): string => {
        const li = screen.getByText(text).closest('li')!;
        const styled = li.querySelector('[style*="--_tree-indent"]');
        return styled?.getAttribute('style') ?? '';
      };
      expect(indentOf('Mid')).toContain('var(--tree-list-indent)');
      expect(indentOf('Leaf')).toContain('var(--tree-list-indent)');
    });

    it('indents inside the row so nested rows keep the full list width', () => {
      // The row box keeps its own inline padding and stays full width; the
      // indent is padding on a child inside it. A nested row's hover and
      // selected fill therefore spans the list like a root row's, while its
      // content lands where a margin indent would have put it.
      render(<TreeList items={deepItems} />);
      const rules = collectCssText();
      expect(rules).toMatch(
        /padding-inline-start:\s*var\(--_tree-indent,\s*0px\)/,
      );
      expect(rules).not.toMatch(/margin-inline-start:\s*var\(--_tree-indent/);

      const row = screen
        .getByText('Leaf')
        .closest<HTMLElement>('.astryx-tree-list-item')!;
      const indented = row.firstElementChild as HTMLElement;
      expect(indented.className).toContain('indentedContent');
      expect(row.className).not.toContain('indentedContent');
    });

    it("keeps the indent when a caller sets the row's padding", () => {
      // Caller padding lands on the row box; the indent is on a separate
      // element inside it, so the two compose instead of one replacing the
      // other.
      const items = [
        {
          id: 'root',
          label: 'Root',
          isExpanded: true,
          children: [
            {id: 'leaf', label: 'Leaf', style: {paddingInlineStart: '20px'}},
          ],
        },
      ];
      render(<TreeList items={items} />);
      const row = screen
        .getByText('Leaf')
        .closest<HTMLElement>('.astryx-tree-list-item')!;
      expect(row.style.paddingInlineStart).toBe('20px');
      expect(row.getAttribute('style')).toContain('--_tree-indent');
      expect((row.firstElementChild as HTMLElement).className).toContain(
        'indentedContent',
      );
    });

    describe('link rows', () => {
      const linkItems = (endContent?: ReactNode): TreeListItemData[] => [
        {
          id: 'docs',
          label: 'Docs',
          isExpanded: true,
          children: [
            {id: 'report', label: 'Report', href: '/report', endContent},
          ],
        },
      ];
      const rowSurfaceOf = (link: HTMLElement) =>
        link.closest<HTMLElement>('.astryx-tree-list-item')!
          .firstElementChild as HTMLElement;

      it('follows the link when the row is clicked outside its label', () => {
        // The indent is part of the row now, so a click there must do what
        // the row does. The click is delegated to the anchor through the
        // shared enlarged-surface hook, modifier keys included.
        render(<TreeList items={linkItems()} />);
        const link = screen.getByRole('link', {name: 'Report'});
        const clicks: MouseEvent[] = [];
        link.addEventListener('click', e => {
          clicks.push(e);
          e.preventDefault();
        });

        fireEvent.click(rowSurfaceOf(link), {metaKey: true});
        expect(clicks).toHaveLength(1);
        expect(clicks[0].metaKey).toBe(true);

        // The row box's own padding follows the link too.
        fireEvent.click(rowSurfaceOf(link).parentElement!);
        expect(clicks).toHaveLength(2);

        // Clicking the label itself reaches the anchor once, not twice.
        fireEvent.click(link);
        expect(clicks).toHaveLength(3);
      });

      it('reports one click to ancestors per press', () => {
        // The delegated click bubbles from the anchor; the original stops,
        // so a listener above the tree sees exactly one click.
        const onTreeClick = vi.fn();
        render(<TreeList items={linkItems()} onClick={onTreeClick} />);
        const link = screen.getByRole('link', {name: 'Report'});
        link.addEventListener('click', e => e.preventDefault());

        fireEvent.click(rowSurfaceOf(link));
        expect(onTreeClick).toHaveBeenCalledTimes(1);
        expect(onTreeClick.mock.calls[0][0].target).toBe(link);
      });

      it('leaves a role-based control in the row to itself', () => {
        const onSwitch = vi.fn();
        render(
          <TreeList
            items={linkItems(
              <span
                role="switch"
                aria-checked="false"
                aria-label="Pin"
                tabIndex={0}
                onClick={onSwitch}>
                Pin
              </span>,
            )}
          />,
        );
        const link = screen.getByRole('link', {name: 'Report'});
        const onLinkClick = vi.fn((e: Event) => e.preventDefault());
        link.addEventListener('click', onLinkClick);

        fireEvent.click(screen.getByRole('switch', {name: 'Pin'}));
        expect(onSwitch).toHaveBeenCalledTimes(1);
        expect(onLinkClick).not.toHaveBeenCalled();
      });

      it('opens the link in a new tab on a middle-click in the row', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        render(<TreeList items={linkItems()} />);
        const link = screen.getByRole('link', {name: 'Report'});

        fireEvent.mouseUp(rowSurfaceOf(link), {button: 1});
        expect(open).toHaveBeenCalledWith('/report', '_blank', 'noopener');

        // A middle-click on the label is the browser's own.
        open.mockClear();
        fireEvent.mouseUp(link, {button: 1});
        expect(open).not.toHaveBeenCalled();
        open.mockRestore();
      });
    });

    it("keeps focus on an item's inner link when the item becomes disabled (spec:AST-085 FR4)", () => {
      const tree = (isDisabled: boolean) => [
        {
          id: 'docs',
          label: 'Docs',
          isExpanded: true,
          children: [
            {id: 'report', label: 'Report', href: '/report', isDisabled},
          ],
        },
      ];
      const {rerender} = render(<TreeList items={tree(false)} />);
      // A pointer click leaves focus on the inner link.
      screen.getByRole('link', {name: 'Report', hidden: true}).focus();
      rerender(<TreeList items={tree(true)} />);
      const disabled = screen.getByRole('link', {name: 'Report', hidden: true});
      expect(disabled).not.toHaveAttribute('href');
      expect(disabled).toHaveFocus();
    });

    it('does not follow a disabled link row', () => {
      const items = [
        {
          id: 'docs',
          label: 'Docs',
          isExpanded: true,
          children: [
            {id: 'report', label: 'Report', href: '/report', isDisabled: true},
          ],
        },
      ];
      render(<TreeList items={items} />);
      const link = screen.getByRole('link', {name: 'Report', hidden: true});
      const onLinkClick = vi.fn((e: Event) => e.preventDefault());
      link.addEventListener('click', onLinkClick);
      const row = link.closest<HTMLElement>('.astryx-tree-list-item')!;
      fireEvent.click(row.firstElementChild!);
      expect(onLinkClick).not.toHaveBeenCalled();
      // No destination, so a screen reader's click or a link menu cannot
      // navigate either (spec:AST-085 FR2).
      expect(link).toHaveAttribute('aria-disabled', 'true');
      for (const attribute of ['href', 'target']) {
        expect(link).not.toHaveAttribute(attribute);
      }
    });

    describe('row clicks outside the label (FR7)', () => {
      // Each row sits under an expanded root, so it has an indent; the click
      // lands on the row surface (indent, reserved chevron column, padding),
      // not on the label.
      const underRoot = (children: TreeListItemData[]): TreeListItemData[] => [
        {id: 'root', label: 'Root', isExpanded: true, children},
      ];
      // The row box itself (its own padding) and the indented content inside
      // it: FR7 covers clicks on both.
      const rowOf = (label: string) =>
        screen.getByText(label).closest<HTMLElement>('.astryx-tree-list-item')!;
      const rowSurfaceOf = (label: string) =>
        rowOf(label).firstElementChild as HTMLElement;
      const folder: TreeListItemData = {
        id: 'folder',
        label: 'Folder',
        children: [{id: 'file', label: 'File'}],
      };

      it("runs an action row's onClick once", () => {
        const onClick = vi.fn();
        render(
          <TreeList items={underRoot([{id: 'run', label: 'Run', onClick}])} />,
        );
        fireEvent.click(rowSurfaceOf('Run'));
        expect(onClick).toHaveBeenCalledTimes(1);
        fireEvent.click(rowOf('Run'));
        expect(onClick).toHaveBeenCalledTimes(2);

        // The label's own button still runs it once per press, not twice.
        fireEvent.click(screen.getByRole('button', {name: 'Run'}));
        expect(onClick).toHaveBeenCalledTimes(3);
      });

      it('toggles a parent row', () => {
        render(<TreeList items={underRoot([folder])} />);
        expect(screen.queryByText('File')).not.toBeInTheDocument();
        fireEvent.click(rowSurfaceOf('Folder'));
        expect(screen.getByText('File')).toBeInTheDocument();
        fireEvent.click(rowOf('Folder'));
        expect(screen.queryByText('File')).not.toBeInTheDocument();
      });

      it('does nothing on a disabled action or parent row', () => {
        const onClick = vi.fn();
        render(
          <TreeList
            items={underRoot([
              {id: 'run', label: 'Run', onClick, isDisabled: true},
              {...folder, isDisabled: true},
            ])}
          />,
        );
        fireEvent.click(rowSurfaceOf('Run'));
        fireEvent.click(rowOf('Run'));
        expect(onClick).not.toHaveBeenCalled();
        fireEvent.click(rowSurfaceOf('Folder'));
        fireEvent.click(rowOf('Folder'));
        expect(screen.queryByText('File')).not.toBeInTheDocument();
      });

      it("exposes a disabled row's toggle and action as aria-disabled and keeps them inert", () => {
        const onClick = vi.fn();
        const {container} = render(
          <TreeList
            items={underRoot([
              {id: 'run', label: 'Run', onClick, isDisabled: true},
              {...folder, isDisabled: true},
            ])}
          />,
        );
        // spec:AST-085 FR1/FR2: no native disabled anywhere, and a click
        // dispatched straight on the inner controls does nothing.
        expect(container.querySelector('[disabled]')).toBeNull();
        const toggle = container.querySelector<HTMLElement>(
          '[data-tree-toggle][aria-disabled="true"]',
        )!;
        expect(toggle).not.toBeNull();
        toggle.click();
        fireEvent.keyDown(toggle, {key: 'Enter'});
        expect(screen.queryByText('File')).not.toBeInTheDocument();
        const action = Array.from(container.querySelectorAll('button')).find(
          button => button.textContent?.includes('Run'),
        )!;
        expect(action).toHaveAttribute('aria-disabled', 'true');
        action.click();
        expect(onClick).not.toHaveBeenCalled();
      });

      it('leaves a role-based control in start or end content to itself', () => {
        // Native and role-based controls alike keep their own activation,
        // the same rule link rows get from the shared enlarged-surface hook.
        const onClick = vi.fn();
        const onSwitch = vi.fn();
        const pin = (name: string) => (
          <span
            role="switch"
            aria-checked="false"
            aria-label={name}
            tabIndex={0}
            onClick={onSwitch}>
            {name}
          </span>
        );
        render(
          <TreeList
            items={underRoot([
              {
                id: 'run',
                label: 'Run',
                onClick,
                startContent: pin('Pin run start'),
                endContent: pin('Pin run end'),
              },
              {
                ...folder,
                startContent: pin('Pin folder start'),
                endContent: pin('Pin folder end'),
              },
            ])}
          />,
        );
        for (const name of [
          'Pin run start',
          'Pin run end',
          'Pin folder start',
          'Pin folder end',
        ]) {
          fireEvent.click(screen.getByRole('switch', {name}));
        }
        expect(onSwitch).toHaveBeenCalledTimes(4);
        expect(onClick).not.toHaveBeenCalled();
        expect(screen.queryByText('File')).not.toBeInTheDocument();
      });
    });

    it('draws guides above full-width rows without taking pointer input', () => {
      // Guide columns now sit inside deeper rows' boxes. They paint above the
      // rows so a row fill never breaks the line, and let clicks fall through
      // to the row underneath.
      const {container} = render(<TreeList items={deepItems} />);
      const guide = container.querySelector('.astryx-tree-list-guide');
      expect(guide).not.toBeNull();
      const column = guide!.parentElement!;
      expect(getComputedStyle(column).pointerEvents).toBe('none');
      expect(getComputedStyle(column).zIndex).toBe('1');
      // The tree contains that stacking so a guide cannot climb over
      // positioned content outside the list.
      const treeRoot = screen.getByRole('tree').parentElement!;
      expect(treeRoot.className).toContain('astryx-tree-list');
      expect(getComputedStyle(treeRoot).isolation).toBe('isolate');
    });

    it('lifts only rows that draw a focus ring above the guides', () => {
      // A plain row (no onClick, href or children) draws no focus ring, so it
      // stays under the guides: a focused selected plain row must not hide
      // them with its fill (DD3). Rows that draw the ring take the lift.
      render(
        <TreeList
          items={[
            {
              id: 'root',
              label: 'Root',
              isExpanded: true,
              children: [
                {id: 'plain', label: 'Plain', isSelected: true},
                {id: 'run', label: 'Run', onClick: () => {}},
              ],
            },
          ]}
        />,
      );
      const rowOf = (label: string) =>
        screen.getByText(label).closest<HTMLElement>('.astryx-tree-list-item')!;
      expect(rowOf('Plain').className).not.toContain('focusLift');
      expect(rowOf('Run').className).toContain('focusLift');
      expect(rowOf('Root').className).toContain('focusLift');
    });

    it('lifts the focused row above the guides so they never cut its ring', () => {
      // Each treeitem publishes its own focus as `--_tree-focus-z`, and the
      // row reads it as its z-index, so the focused row paints above the
      // guide columns (z-index 1). Nested treeitems redeclare the default.
      render(<TreeList items={deepItems} />);
      const rules = collectCssText();
      expect(rules).toMatch(/--_tree-focus-z:\s*2/);
      expect(rules).toMatch(/z-index:\s*var\(--_tree-focus-z,\s*auto\)/);
    });
  });

  // ===========================================================================
  // Leaf chevron-column offset (group-expandable-sibling awareness)
  // ===========================================================================

  describe('leaf chevron-column offset', () => {
    // A row publishes its indent as the inline `--_tree-indent` custom property.
    // A leaf that reserves the chevron column adds a fixed offset
    // (chevron width + gap) on top of its level indent; a flush leaf does not.
    // The reserved column is expressed as the literal `+ <spacing-4> + <spacing-2>`
    // suffix in the calc(), so its presence is what we assert (jsdom does not
    // resolve the token values, so we check the structure, not pixels).
    const indentStyleOf = (text: string): string => {
      const li = screen.getByText(text).closest('li')!;
      const styled = li.querySelector('[style*="--_tree-indent"]');
      return styled?.getAttribute('style') ?? '';
    };
    // A reserved chevron column adds two extra terms to the indent calc()
    // beyond the single `level * var(--tree-list-indent)` term.
    const reservesColumn = (text: string): boolean => {
      const style = indentStyleOf(text);
      // count the `var(` occurrences inside --_tree-indent: a flush row has
      // exactly one (the indent step); a reserving leaf adds the chevron
      // width + gap tokens, so it has more.
      const m = /--_tree-indent:\s*calc\(([^;]*)\)/.exec(style);
      const body = m?.[1] ?? '';
      return (body.match(/\bvar\(/g)?.length ?? 0) > 1 || body.includes('+');
    };

    it('a leaf in a mixed group reserves the chevron column (aligns under its expandable sibling)', () => {
      // Group: [Parent (has children), Sibling (leaf)] → Sibling must line up
      // under Parent's caret, so it keeps the chevron-column offset.
      render(<TreeList items={nestedItems} />);
      expect(reservesColumn('Sibling')).toBe(true);
    });

    it('a leaf under an expandable ancestor reserves the chevron column even when its own group is all leaves', () => {
      // 'Root' → 'Mid' → 'Leaf'; 'Leaf' is the only item in its immediate
      // group, but the tree has carets (Root, Mid), so Leaf must reserve the
      // chevron column to stay indented past its parent's label. Flushing it
      // here would push it left of Mid's label — the all-leaf-group bug.
      render(<TreeList items={deepItems} variant="noGuides" />);
      expect(reservesColumn('Leaf')).toBe(true);
    });

    it("an expanded parent's all-leaf children reserve the chevron column (do not flush left of the parent label)", () => {
      // Regression: Parent (caret) → [Child 1, Child 2] is an all-leaf group
      // nested under an expandable parent. Per-group flushing wrongly dropped
      // these children's chevron column, pushing them LEFT of Parent's own
      // label. Because the tree has a caret, they must reserve the column and
      // stay indented past Parent.
      render(<TreeList items={nestedItemsExpanded} />);
      expect(reservesColumn('Child 1')).toBe(true);
      expect(reservesColumn('Child 2')).toBe(true);
    });

    it('every row in a flat (all-leaf) tree sits flush — no chevron column reserved', () => {
      render(<TreeList items={flatItems} />);
      expect(reservesColumn('Apple')).toBe(false);
      expect(reservesColumn('Banana')).toBe(false);
      expect(reservesColumn('Cherry')).toBe(false);
    });

    it('leaves flush in an all-leaf group have the same indent structure as a parent at that level', () => {
      // In a mixed group the reserving leaf indent has the extra terms; in an
      // all-leaf group the leaf indent is the bare level step, exactly like a
      // parent row's indent.
      render(<TreeList items={flatItems} />);
      const flush = indentStyleOf('Apple');
      // bare level step: one var(--tree-list-indent), no additive chevron terms
      expect(flush).toContain('var(--tree-list-indent)');
      expect(/--_tree-indent:\s*calc\([^;]*\+[^;]*\)/.test(flush)).toBe(false);
    });
  });

  // ===========================================================================
  // Inter-row gap lever (--tree-list-row-gap) + guide spanning
  // ===========================================================================

  describe('row gap lever', () => {
    it('defaults the row gap to a subtle 2px separation', () => {
      // The lever is published on the tree-list root; its default is
      // --spacing-0-5 (2px) so rows have a light separation out of the box. A
      // theme can widen or close it via the tree-list target. jsdom does not
      // resolve token vars, so the declared value is the --spacing-0-5 token.
      render(<TreeList items={simpleItems} data-testid="tree" />);
      const root = screen.getByTestId('tree');
      expect(
        getComputedStyle(root).getPropertyValue('--tree-list-row-gap').trim(),
      ).toBe('var(--spacing-0-5)');
    });

    it('lets a theme open a row gap via the tree-list target', () => {
      // jsdom cannot resolve the @layer cascade, so the generated CSS is what
      // proves the override reaches the lever.
      const theme = defineTheme({
        name: 'tree-list-row-gap-test',
        components: {
          'tree-list': {
            base: {'--tree-list-row-gap': 'var(--spacing-1)'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);
      expect(css).toContain('.astryx-tree-list {');
      expect(css).toContain('--tree-list-row-gap: var(--spacing-1)');
    });

    it('the guide of a row with a sibling below spans into it (verticalFull)', () => {
      // A row that is NOT last in its group bridges the 1px hairline into the
      // next contiguous sibling so the connector reads as one continuous line.
      // Assert the APPLIED class on that row's own connector — not a global
      // stylesheet regex — so the isLast ? verticalLast : verticalFull branch
      // is actually exercised (Child 1 has Child 2 below it).
      render(<TreeList items={nestedItemsExpanded} />);
      const child1 = screen.getByText('Child 1').closest('li')!;
      const guide = child1.firstElementChild!.querySelector(
        '.astryx-tree-list-guide',
      );
      expect(guide).not.toBeNull();
      expect(guide!.className).toContain('verticalFull');
      expect(guide!.className).not.toContain('verticalLast');
    });

    it('clamps the last-in-group guide so it does not overhang the gap (verticalLast)', () => {
      // The last row in a group has nothing below it, so its connector must NOT
      // run through the row wrapper's bottom padding into empty space — it uses
      // verticalLast, which subtracts half the row gap. Assert the applied class
      // on the last child's own connector (Child 2 is last in its group), so a
      // reverted branch is caught.
      render(<TreeList items={nestedItemsExpanded} />);
      const child2 = screen.getByText('Child 2').closest('li')!;
      const guide = child2.firstElementChild!.querySelector(
        '.astryx-tree-list-guide',
      );
      expect(guide).not.toBeNull();
      expect(guide!.className).toContain('verticalLast');
      expect(guide!.className).not.toContain('verticalFull');
    });

    it('carries the inter-row gap as collapse-proof padding on the row wrapper, not the paint target', () => {
      // Finding from review: the gap must be `padding-block` (which cannot
      // collapse) on the row WRAPPER, not `margin-block` on the row box — a
      // margin there collapses through the position:relative wrapper and the
      // <li>, delivering only half the configured gap. It also must not sit on
      // `tree-list-item`, which is a paint seam (per the theming-target
      // guidelines): layout longhands do not belong on a paintable target.
      const {container} = render(<TreeList items={simpleItems} />);
      const item = container.querySelector<HTMLElement>(
        '.astryx-tree-list-item',
      );
      expect(item).not.toBeNull();
      const rowWrapper = item!.parentElement!;

      const rules = collectCssText();
      // Map the rowWrapper's compiled class to its declaration block and assert
      // it declares padding-block from the row-gap lever (half above/below).
      const rowWrapperClass = Array.from(rowWrapper.classList).find(c =>
        c.includes('rowWrapper'),
      );
      expect(rowWrapperClass).toBeDefined();
      // The gap rides padding-block (collapse-proof), keyed off the lever.
      expect(rules).toMatch(
        /padding-block:\s*calc\(\s*var\(--tree-list-row-gap[^)]*\)\s*\/\s*2\s*\)/,
      );
      // And the paint target (tree-list-item / contentWrapper) must NOT carry a
      // margin-block gap — the layout seam has moved off the paintable element.
      const itemClass = Array.from(item!.classList).find(c =>
        c.includes('contentWrapper'),
      );
      expect(itemClass).toBeDefined();
      expect(rules).not.toMatch(
        /margin-block:\s*calc\([^;]*var\(--tree-list-row-gap/,
      );
    });
  });

  // ===========================================================================
  // xds class name
  // ===========================================================================

  it('applies astryx-tree-list class name', () => {
    render(<TreeList items={simpleItems} data-testid="tree" />);
    const root = screen.getByTestId('tree');
    expect(root.className).toContain('astryx-tree-list');
  });

  // ===========================================================================
  // Chevron theme target
  // ===========================================================================

  describe('chevron theme target', () => {
    it('renders the astryx-tree-list-chevron target on the toggle button', () => {
      render(<TreeList items={nestedItems} />);
      const toggle = screen
        .getByText('Parent')
        .closest('li')!
        .querySelector('[data-tree-toggle]')!;

      // Dedicated, stable theme target on the expand/collapse control, so a
      // theme can restyle the chevron without a fragile [data-tree-toggle] hook.
      expect(toggle).toHaveClass('astryx-tree-list-chevron');
      // Open/closed state is reflected so a theme can target each state alone.
      expect(toggle).toHaveAttribute('data-state', 'collapsed');
    });

    it('reflects the expanded state on the toggle when open', () => {
      render(<TreeList items={nestedItemsExpanded} />);
      const toggle = screen
        .getByText('Parent')
        .closest('li')!
        .querySelector('[data-tree-toggle]')!;

      expect(toggle).toHaveClass('astryx-tree-list-chevron');
      expect(toggle).toHaveAttribute('data-state', 'expanded');
    });

    it('keeps the functional data-tree-toggle hook alongside the new target', () => {
      // The theme target is additive — the toggle is still a real <button> and
      // still carries the functional activation attribute TreeList relies on.
      render(<TreeList items={nestedItems} />);
      const toggle = screen
        .getByText('Parent')
        .closest('li')!
        .querySelector('[data-tree-toggle]')!;
      expect(toggle.tagName).toBe('BUTTON');
      expect(toggle).toHaveAttribute('data-tree-toggle');
    });

    it('exposes tree-list-chevron as a themeable defineTheme target', () => {
      // The generated CSS is what proves the target is reachable by a theme:
      // jsdom cannot resolve the @layer cascade, so the DOM-class assertions
      // above and this generation assertion together cover the seam.
      const theme = defineTheme({
        name: 'tree-list-chevron-test',
        components: {
          'tree-list-chevron': {
            base: {color: 'var(--color-accent)'},
            'state:expanded': {color: 'var(--color-text-primary)'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);
      expect(css).toContain('.astryx-tree-list-chevron {');
      expect(css).toContain('color: var(--color-accent)');
      expect(css).toContain('.astryx-tree-list-chevron[data-state="expanded"]');
      expect(css).toContain('color: var(--color-text-primary)');
    });
  });

  // ===========================================================================
  // Item label theme target
  // ===========================================================================

  describe('item label theme target', () => {
    it('renders the astryx-tree-list-item-label target on the label span', () => {
      render(<TreeList items={simpleItems} />);
      const label = screen.getByText('Item A');

      // Dedicated, stable theme target on the label text, so a theme can style
      // just the label without a fragile `button:not([data-tree-toggle]) > span`
      // structural selector.
      expect(label).toHaveClass('astryx-tree-list-item-label');
      // A non-selected item's label carries no selected reflection.
      expect(label).not.toHaveAttribute('data-selected');
    });

    it('reflects the selected state on the selected item label', () => {
      render(
        <TreeList items={[{id: 'a', label: 'Item A', isSelected: true}]} />,
      );
      const label = screen.getByText('Item A');
      expect(label).toHaveClass('astryx-tree-list-item-label');
      expect(label).toHaveAttribute('data-selected', 'selected');
    });

    it('keeps the label linked to its row via aria-labelledby', () => {
      // The theme target is additive — the label still owns the id the
      // interactive row references for its accessible name.
      render(
        <TreeList items={[{id: 'a', label: 'Item A', onClick: () => {}}]} />,
      );
      const label = screen.getByText('Item A');
      const action = screen.getByRole('button');
      expect(action).toHaveAttribute('aria-labelledby', label.id);
    });

    it('exposes tree-list-item-label as a themeable defineTheme target', () => {
      // The generated CSS is what proves the target is reachable by a theme:
      // jsdom cannot resolve the @layer cascade, so the DOM-class assertions
      // above and this generation assertion together cover the seam.
      const theme = defineTheme({
        name: 'tree-list-item-label-test',
        components: {
          'tree-list-item-label': {
            base: {color: 'var(--color-text-primary)'},
            selected: {fontWeight: 'var(--font-weight-bold)'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);
      expect(css).toContain('.astryx-tree-list-item-label {');
      expect(css).toContain('color: var(--color-text-primary)');
      expect(css).toContain(
        '.astryx-tree-list-item-label[data-selected="selected"]',
      );
      expect(css).toContain('font-weight: var(--font-weight-bold)');
    });
  });

  // ===========================================================================
  // APG structural ARIA (aria-level / aria-posinset / aria-setsize)
  // ===========================================================================

  it('sets aria-level, aria-posinset, and aria-setsize at the top level', () => {
    render(<TreeList items={flatItems} />);
    const apple = screen.getByText('Apple').closest('li');
    expect(apple).toHaveAttribute('aria-level', '1');
    expect(apple).toHaveAttribute('aria-posinset', '1');
    expect(apple).toHaveAttribute('aria-setsize', '3');

    const cherry = screen.getByText('Cherry').closest('li');
    expect(cherry).toHaveAttribute('aria-posinset', '3');
    expect(cherry).toHaveAttribute('aria-setsize', '3');
  });

  it('sets aria-level/posinset/setsize correctly at deeper levels', () => {
    render(<TreeList items={expandedParentItems} />);
    const parent = screen.getByText('Parent').closest('li');
    expect(parent).toHaveAttribute('aria-level', '1');
    expect(parent).toHaveAttribute('aria-setsize', '2');

    const child1 = screen.getByText('Child 1').closest('li');
    expect(child1).toHaveAttribute('aria-level', '2');
    expect(child1).toHaveAttribute('aria-posinset', '1');
    expect(child1).toHaveAttribute('aria-setsize', '2');

    const child2 = screen.getByText('Child 2').closest('li');
    expect(child2).toHaveAttribute('aria-level', '2');
    expect(child2).toHaveAttribute('aria-posinset', '2');
  });

  it('sets aria-level across three depths', () => {
    render(<TreeList items={deepItems} />);
    expect(screen.getByText('Root').closest('li')).toHaveAttribute(
      'aria-level',
      '1',
    );
    expect(screen.getByText('Mid').closest('li')).toHaveAttribute(
      'aria-level',
      '2',
    );
    expect(screen.getByText('Leaf').closest('li')).toHaveAttribute(
      'aria-level',
      '3',
    );
  });

  // ===========================================================================
  // Roving tabindex
  // ===========================================================================

  it('makes exactly one treeitem tabbable by default (the first enabled)', () => {
    render(<TreeList items={flatItems} />);
    const treeitems = screen.getAllByRole('treeitem');
    const tabbable = treeitems.filter(
      el => el.getAttribute('tabindex') === '0',
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(screen.getByText('Apple').closest('li'));
    expect(screen.getByText('Banana').closest('li')).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('defaults the tab stop to the selected item when one is selected', () => {
    const items: TreeListItemData[] = [
      {id: 'a', label: 'Apple'},
      {id: 'b', label: 'Banana', isSelected: true},
      {id: 'c', label: 'Cherry'},
    ];
    render(<TreeList items={items} />);
    expect(screen.getByText('Banana').closest('li')).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByText('Apple').closest('li')).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('moves the single tab stop when focus moves via keyboard', async () => {
    const user = userEvent.setup();
    render(<TreeList items={flatItems} />);
    const apple = screen.getByText('Apple').closest('li')!;
    apple.focus();
    await user.keyboard('{ArrowDown}');
    const treeitems = screen.getAllByRole('treeitem');
    const tabbable = treeitems.filter(
      el => el.getAttribute('tabindex') === '0',
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(screen.getByText('Banana').closest('li'));
  });

  // ===========================================================================
  // APG keyboard navigation
  // ===========================================================================

  it('ArrowDown / ArrowUp move focus between visible treeitems', async () => {
    const user = userEvent.setup();
    render(<TreeList items={flatItems} />);
    const apple = screen.getByText('Apple').closest('li')!;
    apple.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(
      screen.getByText('Banana').closest('li'),
    );
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(
      screen.getByText('Cherry').closest('li'),
    );
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(
      screen.getByText('Banana').closest('li'),
    );
  });

  it('ArrowDown / ArrowUp skip disabled treeitems', async () => {
    const user = userEvent.setup();
    render(<TreeList items={withDisabledItems} />);
    const apple = screen.getByText('Apple').closest('li')!;
    apple.focus();
    await user.keyboard('{ArrowDown}');
    // Banana is disabled → skipped, lands on Cherry.
    expect(document.activeElement).toBe(
      screen.getByText('Cherry').closest('li'),
    );
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(
      screen.getByText('Apple').closest('li'),
    );
  });

  it('ArrowRight expands a collapsed parent, then enters the first child', async () => {
    const user = userEvent.setup();
    render(<TreeList items={collapsedParentItems} />);
    const parent = screen.getByText('Parent').closest('li')!;
    parent.focus();
    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    // First ArrowRight expands.
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(document.activeElement).toBe(parent);
    await user.keyboard('{ArrowRight}');
    // Second ArrowRight moves into first child.
    expect(document.activeElement).toBe(
      screen.getByText('Child 1').closest('li'),
    );
  });

  it('ArrowRight on a leaf is a no-op', async () => {
    const user = userEvent.setup();
    render(<TreeList items={flatItems} />);
    const apple = screen.getByText('Apple').closest('li')!;
    apple.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(apple);
  });

  it('ArrowLeft collapses an expanded parent, then moves to parent', async () => {
    const user = userEvent.setup();
    render(<TreeList items={expandedParentItems} />);
    const parent = screen.getByText('Parent').closest('li')!;
    // Focus a child first.
    const child1 = screen.getByText('Child 1').closest('li')!;
    child1.focus();
    await user.keyboard('{ArrowLeft}');
    // Child is a leaf → ArrowLeft moves to parent.
    expect(document.activeElement).toBe(parent);
    await user.keyboard('{ArrowLeft}');
    // Parent is expanded → ArrowLeft collapses it.
    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
  });

  it('Home and End move to the first and last visible treeitems', async () => {
    const user = userEvent.setup();
    render(<TreeList items={flatItems} />);
    const banana = screen.getByText('Banana').closest('li')!;
    banana.focus();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(
      screen.getByText('Cherry').closest('li'),
    );
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(
      screen.getByText('Apple').closest('li'),
    );
  });

  it('Enter activates the item onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const items: TreeListItemData[] = [{id: 'a', label: 'Apple', onClick}];
    render(<TreeList items={items} />);
    const apple = screen.getByText('Apple').closest('li')!;
    apple.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Space activates the item onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const items: TreeListItemData[] = [{id: 'a', label: 'Apple', onClick}];
    render(<TreeList items={items} />);
    const apple = screen.getByText('Apple').closest('li')!;
    apple.focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Enter toggles expansion for a parent without its own action', async () => {
    const user = userEvent.setup();
    render(<TreeList items={collapsedParentItems} />);
    const parent = screen.getByText('Parent').closest('li')!;
    parent.focus();
    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Child 1')).toBeInTheDocument();
  });

  it('typeahead moves focus to the next item matching typed characters', async () => {
    const user = userEvent.setup();
    render(<TreeList items={flatItems} />);
    const apple = screen.getByText('Apple').closest('li')!;
    apple.focus();
    await user.keyboard('c');
    expect(document.activeElement).toBe(
      screen.getByText('Cherry').closest('li'),
    );
  });

  it('lets a consumer prevent built-in TreeList keyboard navigation while receiving root div as event.currentTarget', () => {
    let capturedCurrentTarget: Element | null = null;
    const ref = {current: null as HTMLDivElement | null};
    render(
      <TreeList
        ref={el => {
          ref.current = el;
        }}
        items={[
          {id: 'one', label: 'One'},
          {id: 'two', label: 'Two'},
        ]}
        onKeyDown={event => {
          capturedCurrentTarget = event.currentTarget;
          event.preventDefault();
        }}
      />,
    );

    const items = screen.getAllByRole('treeitem');
    items[0].focus();
    fireEvent.keyDown(items[0], {key: 'ArrowDown'});

    expect(capturedCurrentTarget).toBe(ref.current);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(items[0]).toHaveFocus();
    expect(items[0]).toHaveAttribute('tabindex', '0');
    expect(items[1]).toHaveAttribute('tabindex', '-1');
  });

  it('fires non-canceling consumer onKeyDown with root div as event.currentTarget while built-in navigation works', () => {
    let capturedCurrentTarget: Element | null = null;
    const ref = {current: null as HTMLDivElement | null};
    const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLDivElement>) => {
      capturedCurrentTarget = event.currentTarget;
    });
    render(
      <TreeList
        ref={el => {
          ref.current = el;
        }}
        items={[
          {id: 'one', label: 'One'},
          {id: 'two', label: 'Two'},
        ]}
        onKeyDown={onKeyDown}
      />,
    );

    const items = screen.getAllByRole('treeitem');
    items[0].focus();
    fireEvent.keyDown(items[0], {key: 'ArrowDown'});

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(capturedCurrentTarget).toBe(ref.current);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(items[1]).toHaveFocus();
    expect(items[1]).toHaveAttribute('tabindex', '0');
  });

  it('does not trigger built-in tree navigation when keydown originates inside the header slot', () => {
    let capturedCurrentTarget: Element | null = null;
    const ref = {current: null as HTMLDivElement | null};
    const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLDivElement>) => {
      capturedCurrentTarget = event.currentTarget;
    });

    render(
      <TreeList
        ref={el => {
          ref.current = el;
        }}
        header={<button type="button">Header Action</button>}
        items={[
          {id: 'one', label: 'One'},
          {id: 'two', label: 'Two'},
        ]}
        onKeyDown={onKeyDown}
      />,
    );

    const headerButton = screen.getByRole('button', {name: 'Header Action'});
    headerButton.focus();
    fireEvent.keyDown(headerButton, {key: 'ArrowDown'});

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(capturedCurrentTarget).toBe(ref.current);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    // Focus remains on header button, internal tree navigation was not triggered
    expect(document.activeElement).toBe(headerButton);
    const items = screen.getAllByRole('treeitem');
    expect(items[0]).toHaveAttribute('tabindex', '0');
  });
});
