// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file List.test.tsx
 * @input Uses vitest, @testing-library/react, List, ListItem
 * @output Unit tests for List and ListItem, including the row edge treatment
 * @position Testing; validates List.tsx and ListItem.tsx implementation
 *
 * SYNC: When modified, update this header
 */

import {createRef, useRef} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {rulesDeclaredFor} from '../__tests__/pressState';
import {swipeLayerLoaded} from '../Item/__tests__/swipeLayerLoaded';

/**
 * The element's injected rules split by the touch gate: inside
 * `@media (pointer: coarse)` (TOUCH_QUERY, utils/touchQueries.ts), or
 * not.
 */
function touchGatedRules(el: Element): {touch: string[]; other: string[]} {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const out = {touch: [] as string[], other: [] as string[]};
  const visit = (rules: CSSRuleList, touch: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (classes.some(cls => rule.selectorText.startsWith(cls))) {
          (touch ? out.touch : out.other).push(
            `${rule.selectorText} {${rule.style.cssText}}`,
          );
        }
        continue;
      }
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested == null) {
        continue;
      }
      const condition = (rule as CSSConditionRule).conditionText ?? '';
      visit(nested, touch || condition.includes('pointer: coarse'));
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    visit(sheet.cssRules, false);
  }
  return out;
}
import {List} from './List';
import {ListItem} from './ListItem';
import {ListMarkerScope} from './ListContext';
import {HIT_INSET_PROPERTIES} from '../utils/hitArea';
import {useAnimatedLayout} from '../hooks/useAnimatedLayout';

describe('List', () => {
  it('forwards ListItem align to its Item row unchanged', () => {
    render(
      <List>
        <ListItem label="Default" data-testid="default" />
        <ListItem label="Start" align="start" data-testid="start" />
        <ListItem label="First" align="first-line" data-testid="first" />
      </List>,
    );
    expect(screen.getByTestId('default')).toHaveAttribute(
      'data-align',
      'center',
    );
    expect(screen.getByTestId('start')).toHaveAttribute('data-align', 'start');
    expect(screen.getByTestId('first')).toHaveAttribute(
      'data-align',
      'first-line',
    );
  });

  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  it('renders a list with items', () => {
    render(
      <List>
        <ListItem label="Item 1" />
        <ListItem label="Item 2" />
      </List>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders label and description', () => {
    render(
      <List>
        <ListItem label="Settings" description="Manage your preferences" />
      </List>,
    );
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Manage your preferences')).toBeInTheDocument();
  });

  it('supports data-testid on list', () => {
    render(
      <List data-testid="my-list">
        <ListItem label="Item" />
      </List>,
    );
    expect(screen.getByTestId('my-list')).toBeInTheDocument();
  });

  it('supports data-testid on list item', () => {
    render(
      <List>
        <ListItem label="Item" data-testid="my-item" />
      </List>,
    );
    expect(screen.getByTestId('my-item')).toBeInTheDocument();
  });

  // ===========================================================================
  // Semantic HTML
  // ===========================================================================

  it('renders as <ul> by default', () => {
    const {container} = render(
      <List>
        <ListItem label="Item" />
      </List>,
    );
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(container.querySelector('ol')).not.toBeInTheDocument();
  });

  it('renders as <ol> when listStyle is decimal', () => {
    const {container} = render(
      <List listStyle="decimal">
        <ListItem label="First" />
        <ListItem label="Second" />
      </List>,
    );
    expect(container.querySelector('ol')).toBeInTheDocument();
    expect(container.querySelector('ul')).not.toBeInTheDocument();
  });

  it('applies custom counter start value', () => {
    const {container} = render(
      <List listStyle="decimal" start={3}>
        <ListItem label="Third" />
        <ListItem label="Fourth" />
      </List>,
    );
    const ol = container.querySelector('ol')!;
    // The counter-reset style should include the start offset (start - 1 = 2)
    expect(ol.className).toContain('counterStart');
  });

  it('emits the start HTML attribute on <ol> when start is non-default', () => {
    // Browsers and assistive tech read the start attribute directly; the CSS
    // counter alone is invisible to AT and copy-paste.
    const {container} = render(
      <List listStyle="decimal" start={5}>
        <ListItem label="Fifth" />
      </List>,
    );
    const ol = container.querySelector('ol')!;
    expect(ol.getAttribute('start')).toBe('5');
  });

  it('does not emit the start HTML attribute for the default (start=1)', () => {
    const {container} = render(
      <List listStyle="decimal">
        <ListItem label="First" />
      </List>,
    );
    const ol = container.querySelector('ol')!;
    expect(ol.hasAttribute('start')).toBe(false);
  });

  it('renders as <ul> when listStyle is disc', () => {
    const {container} = render(
      <List listStyle="disc">
        <ListItem label="Item" />
      </List>,
    );
    expect(container.querySelector('ul')).toBeInTheDocument();
  });

  it('renders as <ul> when listStyle is circle', () => {
    const {container} = render(
      <List listStyle="circle">
        <ListItem label="Item" />
      </List>,
    );
    expect(container.querySelector('ul')).toBeInTheDocument();
  });

  it.each(['none', 'disc', 'circle', 'decimal'] as const)(
    'adds an explicit role="list" when listStyle is %s (Safari fix)',
    listStyle => {
      // The base list style always sets list-style-type: none (markers are
      // custom-rendered by ListItem), so Safari/VoiceOver drops the implicit
      // list role for EVERY variant — the explicit role must always be there.
      render(
        <List listStyle={listStyle}>
          <ListItem label="Item 1" />
          <ListItem label="Item 2" />
        </List>,
      );
      const list = screen.getByRole('list');
      expect(list).toHaveAttribute('role', 'list');
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    },
  );

  it('renders items as <li> elements', () => {
    const {container} = render(
      <List>
        <ListItem label="Item 1" />
        <ListItem label="Item 2" />
      </List>,
    );
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
  });

  // ===========================================================================
  // Header with aria-labelledby
  // ===========================================================================

  it('renders header and associates via aria-labelledby', () => {
    const {container} = render(
      <List header={<span>Team Members</span>}>
        <ListItem label="Alice" />
      </List>,
    );
    expect(screen.getByText('Team Members')).toBeInTheDocument();
    const ul = container.querySelector('ul');
    const headerId = ul?.getAttribute('aria-labelledby');
    expect(headerId).toBeTruthy();
    const headerEl = document.getElementById(headerId!);
    expect(headerEl).toBeInTheDocument();
    expect(headerEl?.textContent).toBe('Team Members');
  });

  it('does not render aria-labelledby when no header', () => {
    const {container} = render(
      <List>
        <ListItem label="Item" />
      </List>,
    );
    const ul = container.querySelector('ul');
    expect(ul).not.toHaveAttribute('aria-labelledby');
  });

  it('wraps header and list in a column container', () => {
    const {container} = render(
      <List header={<span>Group</span>}>
        <ListItem label="Item" />
      </List>,
    );
    const header = screen.getByText('Group');
    const wrapper = header.parentElement?.parentElement;
    const ul = container.querySelector('ul');
    expect(wrapper).toContainElement(header.parentElement);
    expect(wrapper).toContainElement(ul);
  });

  it('does not add a wrapper div when header is absent', () => {
    const {container} = render(
      <List data-testid="my-list">
        <ListItem label="Item" />
      </List>,
    );
    const ul = container.querySelector('ul');
    expect(ul?.parentElement).toBe(container);
  });

  // ===========================================================================
  // Density variants
  // ===========================================================================

  it('renders with compact density', () => {
    const {container} = render(
      <List density="compact">
        <ListItem label="Item" />
      </List>,
    );
    const item = container.querySelector('li');
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute('data-density', 'compact');
  });

  it('renders with balanced density (default)', () => {
    const {container} = render(
      <List>
        <ListItem label="Item" />
      </List>,
    );
    const item = container.querySelector('li');
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute('data-density', 'balanced');
    expect(item).not.toHaveAttribute('data-density', 'spacious');
  });

  it('renders with spacious density', () => {
    const {container} = render(
      <List density="spacious">
        <ListItem label="Item" />
      </List>,
    );
    const item = container.querySelector('li');
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute('data-density', 'spacious');
  });

  // ===========================================================================
  // Edge treatment
  // ===========================================================================

  /** Every injected rule that names one of the element's classes. */
  function declarationsFor(el: Element): string {
    return rulesDeclaredFor(el).join('\n').replace(/\s+/g, '');
  }

  /** The declarations of the row inset variable that reach the row. */
  function insetDeclarations(item: Element): string[] {
    return rulesDeclaredFor(item).filter(rule =>
      rule.includes('--_item-inset-inline:'),
    );
  }

  const ZERO_INSET = /--_item-inset-inline:\s*0(px)?\s*;/;
  const LIST_REACH = [
    'margin-inline-start:calc(-1*var(--container-padding-inline-start,0px))',
    'margin-inline-end:calc(-1*var(--container-padding-inline-end,0px))',
    'width:calc(100%+var(--container-padding-inline-start,0px)+var(--container-padding-inline-end,0px))',
  ];
  const OUTSET_ROW = [
    'margin-inline-start:max(var(--container-padding-inline-start,0px)-var(--_item-inset-inline),0px)',
    'margin-inline-end:max(var(--container-padding-inline-end,0px)-var(--_item-inset-inline),0px)',
  ];
  const BLEED_ROW = [
    'padding-inline-start:max(var(--container-padding-inline-start,0px),var(--_item-inset-inline))',
    'padding-inline-end:max(var(--container-padding-inline-end,0px),var(--_item-inset-inline))',
  ];

  function renderEdge(props: Partial<React.ComponentProps<typeof List>>) {
    const {container} = render(
      <List header={<span>Items</span>} {...props}>
        <ListItem label="Static" />
        <ListItem label="Button" onClick={() => {}} />
        <ListItem label="Link" href="/docs" />
      </List>,
    );
    const ul = container.querySelector('ul')!;
    return {
      ul,
      header: ul.parentElement!,
      items: [...ul.querySelectorAll('li')],
    };
  }

  it('keeps the row padding and leaves the list and rows in place by default', () => {
    const {ul, items} = renderEdge({});
    for (const item of items) {
      expect(item.className).not.toMatch(/edge(Flush|Outset|Bleed)/);
      expect(insetDeclarations(item)).toHaveLength(1);
      expect(insetDeclarations(item)[0]).not.toMatch(ZERO_INSET);
    }
    expect(ul.className).not.toContain('reachesContainerPadding');
    expect(edgeContext(ul)).toBe('padded');
  });

  /** The edge each row resolved, read from the row's own edge class. */
  function edgeContext(ul: Element): string {
    const edges = [...ul.querySelectorAll('li')].map(li => {
      const match = /edge(Flush|Outset|Bleed)/.exec(li.className);
      return match ? match[1].toLowerCase() : 'padded';
    });
    expect(new Set(edges).size).toBe(1);
    return edges[0];
  }

  it('applies one treatment to every row, static or interactive, and never to the header', () => {
    for (const edge of ['flush', 'outset', 'bleed'] as const) {
      const {ul, header, items} = renderEdge({edge});
      expect(items).toHaveLength(3);
      expect(edgeContext(ul)).toBe(edge);
      expect(header.className).not.toMatch(/edge|reachesContainerPadding/);
      cleanup();
    }
  });

  it('flush: zeroes the shared inset at every density and leaves the list in place', () => {
    for (const density of ['compact', 'balanced', 'spacious'] as const) {
      const {ul, items} = renderEdge({edge: 'flush', density});
      expect(ul.className).not.toContain('reachesContainerPadding');
      for (const item of items) {
        expect(item).toHaveAttribute('data-density', density);
        const insets = insetDeclarations(item);
        expect(insets).toHaveLength(1);
        expect(insets[0]).toMatch(ZERO_INSET);
      }
      cleanup();
    }
  });

  it('outset: the list reaches the container padding and each row steps back in by what its inset does not fill, per edge', () => {
    // Each edge reads its own container padding var: one var on both edges
    // over-reaches the other edge under asymmetric padding (16px start /
    // 4px end), so a selected row would paint past the outer border.
    const {ul, items} = renderEdge({edge: 'outset'});
    const listCss = declarationsFor(ul);
    for (const declaration of LIST_REACH) {
      expect(listCss).toContain(declaration);
    }
    for (const item of items) {
      const css = declarationsFor(item);
      for (const declaration of OUTSET_ROW) {
        expect(css).toContain(declaration);
      }
      expect(css).not.toContain(
        'margin-inline-end:max(var(--container-padding-inline-start',
      );
      expect(insetDeclarations(item)[0]).not.toMatch(ZERO_INSET);
    }
  });

  it('bleed: the list reaches the container padding and rows fill it with text on the padding line, per edge', () => {
    const {ul, items} = renderEdge({edge: 'bleed'});
    const listCss = declarationsFor(ul);
    for (const declaration of LIST_REACH) {
      expect(listCss).toContain(declaration);
    }
    for (const item of items) {
      const css = declarationsFor(item);
      for (const declaration of BLEED_ROW) {
        expect(css).toContain(declaration);
      }
      expect(css).toContain('border-radius:0');
      expect(css).not.toMatch(/margin-inline-(start|end):max/);
    }
  });

  it('keeps the inline clip on the list for every treatment', () => {
    for (const edge of ['padded', 'flush', 'outset', 'bleed'] as const) {
      const {ul} = renderEdge({edge});
      expect(declarationsFor(ul)).toContain('overflow-x:clip');
      cleanup();
    }
  });

  it('treats the deprecated edgeCompensation="inline" as edge="outset" without a runtime warning', () => {
    // Plain use is reported statically by the @deprecated type; rendering
    // never warns merely because the old name is used (spec:AST-017 FR29a).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {ul} = renderEdge({edgeCompensation: 'inline'});
    expect(edgeContext(ul)).toBe('outset');
    expect(ul.className).toContain('reachesContainerPadding');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('lets edge win over the deprecated edgeCompensation and warns about the conflict', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {ul} = renderEdge({edge: 'flush', edgeCompensation: 'inline'});
    expect(edgeContext(ul)).toBe('flush');
    expect(ul.className).not.toContain('reachesContainerPadding');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('`edge` wins');
    expect(message).toContain('astryx upgrade');
    warn.mockRestore();
  });

  it('keeps the inset of a ListItem outside a List', () => {
    const {container} = render(<ListItem label="Standalone" />);
    expect(container.querySelector('li')!.className).not.toMatch(
      /edge(Flush|Outset|Bleed)/,
    );
  });
  // ===========================================================================
  // Dividers
  // ===========================================================================

  it('renders dividers between items when hasDividers is true', () => {
    const {container} = render(
      <List hasDividers>
        <ListItem label="Item 1" />
        <ListItem label="Item 2" />
        <ListItem label="Item 3" />
      </List>,
    );
    // Dividers are rendered as borders on <li> elements, not separate DOM nodes
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(3);
    // No <hr> elements should exist
    const hrs = container.querySelectorAll('hr');
    expect(hrs).toHaveLength(0);
  });

  it('does not add extra DOM elements for dividers', () => {
    const {container} = render(
      <List hasDividers>
        <ListItem label="Item 1" />
        <ListItem label="Item 2" />
      </List>,
    );
    const list = container.querySelector('ul');
    // Only <li> children — no <hr> or other divider elements
    const children = list?.children;
    expect(children).toHaveLength(2);
    expect(children?.[0]?.tagName).toBe('LI');
    expect(children?.[1]?.tagName).toBe('LI');
  });

  it('does not render dividers when hasDividers is false', () => {
    const {container} = render(
      <List>
        <ListItem label="Item 1" />
        <ListItem label="Item 2" />
      </List>,
    );
    const hrs = container.querySelectorAll('hr');
    expect(hrs).toHaveLength(0);
  });

  // ===========================================================================
  // Touch hit area
  // ===========================================================================

  /** The rules among `rules` whose selector reaches the row's `::after`. */
  const afterRules = (rules: string[]): string[] =>
    rules.filter(rule => rule.slice(0, rule.indexOf('{')).includes('::after'));

  it('gives an interactive, enabled row an invisible hit layer under a finger only', () => {
    render(
      <List>
        <ListItem label="Pressable" onClick={() => {}} />
        <ListItem label="Link" href="#settings" />
        <ListItem label="Read-only" />
        <ListItem label="Disabled" onClick={() => {}} isDisabled />
      </List>,
    );
    const row = (text: string) => screen.getByText(text).closest('li')!;
    for (const text of ['Pressable', 'Link']) {
      const {touch, other} = touchGatedRules(row(text));
      const layer = afterRules(touch).join('\n');
      // Positioned past the row by the measured insets, clipped to the band
      // outside the row's own box, and painting nothing.
      expect(layer).toContain('position: absolute');
      expect(layer).toMatch(/clip-path: polygon\(evenodd/);
      // One inset per side, in physical order: top, right, bottom, left.
      const offset = (side: keyof typeof HIT_INSET_PROPERTIES) =>
        `calc\\(\\(var\\(${HIT_INSET_PROPERTIES[side]}, ?0px\\) \\+ var\\(--_hit-border-${side}, ?0px\\)\\) \\* -1\\)`;
      expect(layer).toMatch(
        new RegExp(
          `inset: ${offset('top')} ${offset('right')} ${offset('bottom')} ${offset('left')}`,
        ),
      );
      // Above the rows after it, so a later row does not hit-test over the
      // band; painting nothing.
      expect(layer).toMatch(/z-index: 1/);
      expect(layer).not.toMatch(
        /[{;]\s*(?:background|border|box-shadow|outline)[\w-]*\s*:/,
      );
      // The row itself takes no z-index: it stays no stacking context.
      expect(
        touch.filter(
          rule =>
            !rule.slice(0, rule.indexOf('{')).includes('::') &&
            rule.includes('z-index'),
        ),
      ).toEqual([]);
      // At rest the row's stacking stays as it was: a rule that isolates the
      // row is keyed on a press.
      for (const rule of touch.filter(r => r.includes('isolation'))) {
        expect(rule.slice(0, rule.indexOf('{'))).toContain(
          '[data-astryx-press',
        );
      }
      // With a mouse: no pseudo-element.
      expect(afterRules(other)).toEqual([]);
    }
    // A row with nothing to press offers no target.
    for (const text of ['Read-only', 'Disabled']) {
      expect(afterRules(touchGatedRules(row(text)).touch)).toEqual([]);
    }
  });

  // ===========================================================================
  // Interactive items — onClick (invisible button pattern)
  // ===========================================================================

  it('renders an invisible button when onClick is provided', () => {
    const onClick = vi.fn();
    const {container} = render(
      <List>
        <ListItem label="Clickable" onClick={onClick} />
      </List>,
    );
    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    expect(button?.textContent).toContain('Clickable');
  });

  it('fires onClick when invisible button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <List>
        <ListItem label="Clickable" onClick={onClick} />
      </List>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when container area is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <List>
        <ListItem
          label="Clickable"
          onClick={onClick}
          data-testid="item"
          startContent={<span data-testid="start">★</span>}
        />
      </List>,
    );
    // Click on startContent (non-interactive, should propagate)
    await user.click(screen.getByTestId('start'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire item onClick when endContent interactive element is clicked', async () => {
    const user = userEvent.setup();
    const itemClick = vi.fn();
    const buttonClick = vi.fn();
    render(
      <List>
        <ListItem
          label="Item"
          onClick={itemClick}
          endContent={
            <button type="button" onClick={buttonClick}>
              Action
            </button>
          }
        />
      </List>,
    );
    await user.click(screen.getByText('Action'));
    expect(buttonClick).toHaveBeenCalledTimes(1);
    expect(itemClick).not.toHaveBeenCalled();
  });

  it('invisible button is focusable via keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <List>
        <ListItem label="Focusable" onClick={onClick} />
      </List>,
    );
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('invisible button can be activated via keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <List>
        <ListItem label="Pressable" onClick={onClick} />
      </List>,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render nested buttons — only one invisible button', () => {
    const {container} = render(
      <List>
        <ListItem label="Item" onClick={() => {}} />
      </List>,
    );
    const buttons = container.querySelectorAll('li button');
    // Should be exactly 1 invisible button (no nesting)
    expect(buttons).toHaveLength(1);
  });

  // ===========================================================================
  // Interactive items — href (invisible anchor pattern)
  // ===========================================================================

  it('renders an invisible anchor when href is provided', () => {
    const {container} = render(
      <List>
        <ListItem label="Link" href="/docs" />
      </List>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).toBeInTheDocument();
    expect(anchor).toHaveAttribute('href', '/docs');
    expect(anchor?.textContent).toContain('Link');
  });

  it('sets target on anchor when provided', () => {
    const {container} = render(
      <List>
        <ListItem label="External" href="https://example.com" target="_blank" />
      </List>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render button or anchor for static items', () => {
    const {container} = render(
      <List>
        <ListItem label="Static" />
      </List>,
    );
    expect(container.querySelector('button')).not.toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
  });

  // ===========================================================================
  // Disabled state
  // ===========================================================================

  it('applies aria-disabled when isDisabled', () => {
    const {container} = render(
      <List>
        <ListItem label="Disabled" isDisabled />
      </List>,
    );
    const item = container.querySelector('.astryx-item');
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the disabled action button focusable', () => {
    const {container} = render(
      <List>
        <ListItem label="Disabled" onClick={() => {}} isDisabled />
      </List>,
    );
    const button = container.querySelector('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
  });

  it('does not fire onClick when disabled item is clicked', async () => {
    const onClick = vi.fn();
    const {container} = render(
      <List>
        <ListItem label="Disabled" onClick={onClick} isDisabled />
      </List>,
    );
    // pointerEvents: none prevents click, but let's verify the handler guards
    const li = container.querySelector('li');
    // Manually dispatch click (bypassing pointer-events)
    li?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    expect(onClick).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // Selected state
  // ===========================================================================

  it('conveys selection via aria-current when isSelected', () => {
    // aria-selected is not permitted on an li (role listitem, axe:
    // aria-allowed-attr), so selection is exposed via aria-current — valid on
    // any element — so screen-reader users are still told which item is chosen.
    const {container} = render(
      <List>
        <ListItem label="Selected" isSelected onClick={() => {}} />
      </List>,
    );
    const item = container.querySelector('.astryx-item');
    expect(item).not.toHaveAttribute('aria-selected');
    expect(item).toHaveAttribute('aria-current', 'true');
  });

  it('applies neither aria-selected nor aria-current when not selected', () => {
    const {container} = render(
      <List>
        <ListItem label="Not Selected" />
      </List>,
    );
    const li = container.querySelector('li');
    expect(li).not.toHaveAttribute('aria-selected');
    expect(li).not.toHaveAttribute('aria-current');
  });

  // ===========================================================================
  // startContent and endContent
  // ===========================================================================

  it('renders startContent before label', () => {
    render(
      <List>
        <ListItem
          label="With Icon"
          startContent={<span data-testid="icon">★</span>}
        />
      </List>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders endContent after label', () => {
    render(
      <List>
        <ListItem
          label="With Badge"
          endContent={<span data-testid="badge">3</span>}
        />
      </List>,
    );
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });

  it('startContent and endContent are siblings to invisible button', () => {
    const {container} = render(
      <List>
        <ListItem
          label="Item"
          onClick={() => {}}
          startContent={<span data-testid="start">★</span>}
          endContent={<span data-testid="end">→</span>}
        />
      </List>,
    );
    const button = container.querySelector('button');
    const li = container.querySelector('li');
    // startContent and endContent should be children of li, not inside button
    expect(li?.querySelector('[data-testid="start"]')).toBeInTheDocument();
    expect(li?.querySelector('[data-testid="end"]')).toBeInTheDocument();
    expect(
      button?.querySelector('[data-testid="start"]'),
    ).not.toBeInTheDocument();
    expect(
      button?.querySelector('[data-testid="end"]'),
    ).not.toBeInTheDocument();
  });

  // ===========================================================================
  // Border radius
  // ===========================================================================

  it('applies content radius by default', () => {
    render(
      <List>
        <ListItem label="Item" data-testid="item" isSelected />
      </List>,
    );
    const item = screen.getByTestId('item');
    expect(item).toBeInTheDocument();
  });

  it('removes radius when hasDividers is true', () => {
    render(
      <List hasDividers>
        <ListItem label="Item" data-testid="item" isSelected />
      </List>,
    );
    const item = screen.getByTestId('item');
    expect(item).toBeInTheDocument();
  });

  // ===========================================================================
  // List markers
  // ===========================================================================

  it('renders list markers for disc style', () => {
    render(
      <List listStyle="disc">
        <ListItem label="Bullet item" data-testid="item" />
      </List>,
    );
    const item = screen.getByTestId('item');
    // Custom marker rendered as a span (dot marker container)
    const markerContainer = item.querySelector(':scope > span:first-child');
    expect(markerContainer).toBeInTheDocument();
    // The dot itself is a nested span
    const dot = markerContainer?.querySelector('span');
    expect(dot).toBeInTheDocument();
  });

  it('renders list markers for decimal style', () => {
    render(
      <List listStyle="decimal">
        <ListItem label="Numbered item" data-testid="item" />
      </List>,
    );
    const item = screen.getByTestId('item');
    // Number marker uses CSS counter via ::before pseudo-element
    const marker = item.querySelector(':scope > span:first-child');
    expect(marker).toBeInTheDocument();
  });

  it('does not render markers when listStyle is none', () => {
    render(
      <List listStyle="disc">
        <ListItem label="With marker" data-testid="with-marker" />
      </List>,
    );
    const withMarker = screen.getByTestId('with-marker');
    const markerCount = withMarker.children.length;

    render(
      <List listStyle="none">
        <ListItem label="Plain item" data-testid="no-marker" />
      </List>,
    );
    const noMarker = screen.getByTestId('no-marker');
    // Without markers, the item should have fewer direct children
    // (no marker container element)
    expect(noMarker.children.length).toBeLessThan(markerCount);
  });

  // ===========================================================================
  // Description rendering
  // ===========================================================================

  it('does not render description when not provided', () => {
    render(
      <List>
        <ListItem label="Label Only" />
      </List>,
    );
    // Should have the label span only (plus possibly wrapper spans)
    expect(screen.getByText('Label Only')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  // ===========================================================================
  // ReactNode description
  // ===========================================================================

  it('accepts ReactNode as description', () => {
    render(
      <List>
        <ListItem
          label="Item"
          description={
            <div>
              <span>Rich</span> <span>description</span>
            </div>
          }
        />
      </List>,
    );
    expect(screen.getByText('Rich')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
  });

  it('still accepts string description', () => {
    render(
      <List>
        <ListItem label="Item" description="Simple text" />
      </List>,
    );
    expect(screen.getByText('Simple text')).toBeInTheDocument();
  });

  it('forwards data and aria attributes onto the list element', () => {
    // BaseProps keeps data-*/aria-*; the list element dropped them.
    const {container} = render(
      <List listStyle="decimal" data-delimiter=")" aria-label="Steps">
        <ListItem label="First" />
      </List>,
    );
    const list = container.querySelector('ol')!;
    expect(list.getAttribute('data-delimiter')).toBe(')');
    expect(list.getAttribute('aria-label')).toBe('Steps');
  });

  it('keeps an aria-labelledby pointing outside the component', () => {
    // With no header of its own there is nothing to associate, so the
    // consumer's label must survive.
    const {container} = render(
      <List aria-labelledby="external-heading">
        <ListItem label="First" />
      </List>,
    );
    expect(container.querySelector('ul')!.getAttribute('aria-labelledby')).toBe(
      'external-heading',
    );
  });

  it('keeps its own list role and header association', () => {
    // The rest spread comes first so a consumer prop cannot drop the
    // Safari/VoiceOver role workaround or the generated header association.
    const {container} = render(
      <List header="Steps" role="presentation" aria-labelledby="elsewhere">
        <ListItem label="First" />
      </List>,
    );
    const list = container.querySelector('ul')!;
    expect(list.getAttribute('role')).toBe('list');
    expect(list.getAttribute('aria-labelledby')).not.toBe('elsewhere');
  });

  it('forwards ref to the list element, with or without a header', () => {
    for (const header of [undefined, 'Steps']) {
      for (const listStyle of ['none', 'decimal'] as const) {
        const ref = createRef<HTMLUListElement | HTMLOListElement>();
        const {container} = render(
          <List ref={ref} header={header} listStyle={listStyle}>
            <ListItem label="First" />
          </List>,
        );
        expect(ref.current).toBe(
          container.querySelector(listStyle === 'decimal' ? 'ol' : 'ul'),
        );
        cleanup();
      }
    }
  });

  it('merges className and style onto the list element beside its target, with or without a header', () => {
    for (const header of [undefined, 'Steps']) {
      const {container} = render(
        <List header={header} className="consumer" style={{maxWidth: 320}}>
          <ListItem label="First" />
        </List>,
      );
      const list = container.querySelector('ul')!;
      expect(list).toHaveClass('astryx-list', 'consumer');
      expect(list.style.maxWidth).toBe('320px');
      cleanup();
    }
  });

  it('keeps its own counter start beside a consumer style', () => {
    const {container} = render(
      <List listStyle="decimal" start={3} style={{maxWidth: 320}}>
        <ListItem label="Third" />
      </List>,
    );
    const list = container.querySelector('ol')!;
    expect(list.style.maxWidth).toBe('320px');
    expect(list.getAttribute('style')).toContain('astryx-list 2');
  });

  it('marks the corner reader where a bleeding list meets its container: the list, or its root under a header', () => {
    // A rounded container gives its corner only to a direct child that
    // carries the marker.
    const marked = (container: HTMLElement) => [
      ...container.querySelectorAll('[data-container-corner]'),
    ];
    const {container: bare} = render(
      <List edge="bleed">
        <ListItem label="First" />
      </List>,
    );
    expect(marked(bare)).toEqual([bare.querySelector('ul')]);
    cleanup();

    const {container: titled} = render(
      <List edge="bleed" header="Steps">
        <ListItem label="First" />
      </List>,
    );
    expect(marked(titled)).toEqual([titled.firstElementChild]);
    expect(titled.firstElementChild).toContainElement(
      titled.querySelector('ul'),
    );
    cleanup();

    for (const edge of ['padded', 'flush', 'outset'] as const) {
      const {container} = render(
        <List edge={edge} header="Steps">
          <ListItem label="First" />
        </List>,
      );
      expect(marked(container)).toEqual([]);
      cleanup();
    }
  });

  it('accepts number as description (ReactNode)', () => {
    render(
      <List>
        <ListItem label="Count" description={42} />
      </List>,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  describe('ListMarkerScope (internal, for Markdown nested lists)', () => {
    /** The shape inside the item's marker box. */
    const markerShape = (container: HTMLElement) => {
      // The dot, ring, or square: an empty element in the marker box.
      const shape = container.querySelector('li > span > span:empty');
      return shape == null ? null : getComputedStyle(shape);
    };

    it('draws the list style marker without a scope', () => {
      const {container} = render(
        <List listStyle="disc">
          <ListItem label="Item" />
        </List>,
      );
      expect(markerShape(container)?.borderRadius).toBe('50%');
    });

    it('draws the scope marker in place of the list style', () => {
      const {container} = render(
        <List listStyle="disc">
          <ListMarkerScope marker="square">
            <ListItem label="Item" />
          </ListMarkerScope>
        </List>,
      );
      const shape = markerShape(container);
      expect(shape).not.toBeNull();
      expect(shape?.borderRadius).not.toBe('50%');
      expect(container.querySelector('ul')).not.toBeNull();
    });

    it("draws a task item's read-only checkbox in place of its marker", () => {
      const {container} = render(
        <List listStyle="disc">
          <ListMarkerScope
            marker="disc"
            task={{isChecked: true, label: 'Done'}}>
            <ListItem label="Done" />
          </ListMarkerScope>
          <ListItem label="Plain" />
        </List>,
      );
      const checkbox = screen.getByRole('checkbox', {name: 'Done'});
      expect(checkbox).toBeChecked();
      expect(checkbox).toHaveAttribute('aria-readonly', 'true');
      const [task, plain] = container.querySelectorAll('li');
      expect(task?.contains(checkbox)).toBe(true);
      // The task item has no dot in its marker box; the plain item keeps it.
      expect(task?.querySelector(':scope > span > span:empty')).toBeNull();
      expect(plain?.querySelector(':scope > span > span:empty')).not.toBeNull();
    });

    it('draws no task checkbox in a list without markers', () => {
      render(
        <List>
          <ListMarkerScope
            marker="disc"
            task={{isChecked: true, label: 'Done'}}>
            <ListItem label="Done" />
          </ListMarkerScope>
        </List>,
      );
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('keeps a numbered list ordered with a letter marker', () => {
      render(
        <List listStyle="decimal" start={3}>
          <ListMarkerScope marker="lower-alpha">
            <ListItem label="Item" />
          </ListMarkerScope>
        </List>,
      );
      const list = screen.getByRole('list');
      expect(list.tagName).toBe('OL');
      expect(list).toHaveAttribute('start', '3');
    });

    it('draws no marker in a list without markers, or outside a list', () => {
      const {container} = render(
        <>
          <List>
            <ListMarkerScope marker="square">
              <ListItem label="In a plain list" />
            </ListMarkerScope>
          </List>
          <ListMarkerScope marker="square">
            <span>Outside a list</span>
          </ListMarkerScope>
        </>,
      );
      expect(markerShape(container)).toBeNull();
      expect(screen.getByText('Outside a list')).toBeInTheDocument();
    });
  });
});

/** A row whose press goes to a control inside it (`interactiveRef`), with swipe actions. */
function DelegateSwipeRow() {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <ListItem
      label="Delegate"
      interactiveRef={ref}
      endContent={
        <button ref={ref} type="button">
          Open
        </button>
      }
      swipeActions={{trailing: [{label: 'Archive', onActivate: () => {}}]}}
    />
  );
}

describe('List and swipe actions', () => {
  it('clips the rows in the inline axis with clip, never hidden, so a row dragged aside paints no further than the list', () => {
    render(
      <List>
        <ListItem label="A" />
      </List>,
    );
    const rules = rulesDeclaredFor(screen.getByRole('list'));
    // Declared as `overflow-inline`; StyleX emits the physical longhand of
    // the same axis in horizontal writing modes.
    expect(rules.some(r => /overflow-(inline|x): clip/.test(r))).toBe(true);
    expect(rules.some(r => /overflow[-a-z]*: hidden/.test(r))).toBe(false);
  });

  it('under a finger, isolates its rows, so what rises inside the list stays below a sticky header; with a mouse it keeps its stacking', () => {
    render(
      <List>
        <ListItem label="A" onClick={() => {}} />
      </List>,
    );
    const {touch, other} = touchGatedRules(screen.getByRole('list'));
    // Under a finger the list is the isolation boundary for its rows'
    // z-index. So a page-level sticky header at z-index 1 stays above every
    // part of the list.
    expect(touch.join('\n')).toMatch(/isolation: isolate/);
    // With a mouse nothing rises, so the list is no stacking context.
    expect(other.filter(rule => rule.includes('isolation'))).toEqual([]);
  });

  it('isolates for every pointer under an animatedLayout handle, since a sliding row rides above its neighbors with a mouse too', () => {
    function Animated() {
      const containerRef = useRef<HTMLDivElement | null>(null);
      const animatedLayout = useAnimatedLayout({containerRef});
      return (
        <div ref={containerRef}>
          <List animatedLayout={animatedLayout}>
            <ListItem label="A" itemKey="a" onClick={() => {}} />
          </List>
        </div>
      );
    }
    render(<Animated />);
    const {other} = touchGatedRules(screen.getByRole('list'));
    expect(other.join('\n')).toMatch(/isolation: isolate/);
  });

  it('under a finger, raises a swipeable interactive row above the rows after it: it is a stacking context, so its touch band’s own z-index orders only inside it', () => {
    render(
      <List>
        <ListItem
          label="Swipeable"
          onClick={() => {}}
          swipeActions={{trailing: [{label: 'Archive', onActivate: () => {}}]}}
        />
        <ListItem label="Pressable" onClick={() => {}} />
        <ListItem
          label="Static"
          swipeActions={{trailing: [{label: 'Archive', onActivate: () => {}}]}}
        />
        <ListItem
          label="Empty sides"
          onClick={() => {}}
          swipeActions={{leading: [], trailing: []}}
        />
        <DelegateSwipeRow />
      </List>,
    );
    const row = (text: string) => screen.getByText(text).closest('li')!;
    const rowZ = (el: Element) => {
      const {touch, other} = touchGatedRules(el);
      const own = (rules: string[]) =>
        rules.filter(
          rule =>
            !rule.slice(0, rule.indexOf('{')).includes('::') &&
            rule.includes('z-index:'),
        );
      return {touch: own(touch), other: own(other)};
    };
    const swipeable = rowZ(row('Swipeable'));
    expect(swipeable.touch.join('\n')).toMatch(/z-index: 1/);
    // With a mouse there is no band: the row's only z-index is an update's
    // travelling raise, while it slides across other rows.
    for (const rule of swipeable.other) {
      expect(rule.slice(0, rule.indexOf('{'))).toContain(
        '[data-astryx-travelling]',
      );
    }
    // A row that is no stacking context needs no raise (its band's own
    // z-index orders it), and a swipeable row with no band gets none.
    expect(rowZ(row('Pressable')).touch).toEqual([]);
    expect(rowZ(row('Static')).touch).toEqual([]);
    // Item serves no swipe actions on a row with no entry on either side. Nor
    // does it on a row whose press goes to a control inside it. Neither row is
    // a stacking context, so neither is raised.
    expect(rowZ(row('Empty sides')).touch).toEqual([]);
    expect(rowZ(row('Delegate')).touch).toEqual([]);
  });

  it('raises nothing in a ListItem outside a List, where nothing isolates it: its touch band and a swipeable row take no z-index', () => {
    render(
      <ul>
        <ListItem
          label="Outside"
          onClick={() => {}}
          swipeActions={{trailing: [{label: 'Archive', onActivate: () => {}}]}}
        />
      </ul>,
    );
    const {touch} = touchGatedRules(screen.getByText('Outside').closest('li')!);
    // It keeps its touch target, the band past its box.
    expect(
      touch
        .filter(rule => rule.slice(0, rule.indexOf('{')).includes('::after'))
        .join('\n'),
    ).toContain('position: absolute');
    // But nothing it draws rises: not the band, not the row. A rule keyed on
    // a press is left out, since it orders layers only inside the pressed row.
    expect(
      touch.filter(
        rule =>
          rule.includes('z-index') &&
          !rule.slice(0, rule.indexOf('{')).includes('[data-astryx-press'),
      ),
    ).toEqual([]);
  });

  it('passes swipeActions and swipeBehavior through to the row unchanged', async () => {
    render(
      <List>
        <ListItem
          label="A"
          data-testid="row"
          swipeBehavior="commit"
          swipeActions={{trailing: [{label: 'Archive', onActivate: () => {}}]}}
        />
      </List>,
    );
    const row = screen.getByTestId('row');
    expect(row.tagName).toBe('LI');
    expect(row.parentElement).toBe(screen.getByRole('list'));
    // The panel arrives with the lazily loaded swipe layer.
    await swipeLayerLoaded(row);
    const panel = row.querySelector('[data-swipe-panel="trailing"]');
    expect(panel).not.toBeNull();
    // Commit: presentational.
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });
});
