// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nestedPadding.test.tsx
 * @input Uses vitest, @testing-library/react, Layout, AppShell, Card, Section
 * @output Tests which outer inset a Layout's regions resolve to when Layouts
 *   are nested or composed inside padding containers
 * @position Layout tests; validates the scope of Layout's `padding` prop
 *
 * A Layout's `padding` belongs to its own regions. A nested Layout without
 * `padding` takes the nearest padding container's inset (Card, Section,
 * Dialog) or the default, and never an ancestor Layout's value. AppShell's
 * internal Layout uses `padding={0}`, so before this was scoped every page
 * Layout inside AppShell lost its default inset.
 *
 * jsdom neither inherits custom properties nor keeps logical padding
 * declarations, so `resolvedInset` reproduces the cascade from the injected
 * StyleX rules: it reads the region's republished
 * `--container-padding-inline-start` (the same expression as its applied
 * inline-start padding) and substitutes each `var()` from the nearest
 * declaring ancestor. The pixel results are verified in a browser; see the
 * pull request description.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Layout} from '../Layout';
import {LayoutHeader} from '../LayoutHeader';
import {LayoutContent} from '../LayoutContent';
import {AppShell} from '../../AppShell';
import {Card} from '../../Card';
import {Section} from '../../Section';

/** Custom-property declarations keyed by StyleX atomic class name. */
function declarationsByClass(): Map<string, Map<string, string>> {
  const byClass = new Map<string, Map<string, string>>();
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }
      const match = /^\.([\w-]+)$/.exec(rule.selectorText);
      if (match == null) {
        continue;
      }
      for (let i = 0; i < rule.style.length; i++) {
        const name = rule.style[i];
        if (name.startsWith('--')) {
          const decls = byClass.get(match[1]) ?? new Map<string, string>();
          decls.set(name, rule.style.getPropertyValue(name).trim());
          byClass.set(match[1], decls);
        }
      }
    }
  }
  return byClass;
}

/** Splits `var(--name, fallback)` args at the first top-level comma. */
function splitVarArgs(args: string): [string, string | undefined] {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      return [args.slice(0, i).trim(), args.slice(i + 1).trim()];
    }
  }
  return [args.trim(), undefined];
}

function resolveValue(
  el: HTMLElement,
  value: string,
  byClass: Map<string, Map<string, string>>,
  resolving: Set<string>,
): string {
  const start = value.indexOf('var(');
  if (start === -1) {
    return value;
  }
  let depth = 0;
  let end = start + 3;
  for (; end < value.length; end++) {
    if (value[end] === '(') {
      depth++;
    } else if (value[end] === ')' && --depth === 0) {
      break;
    }
  }
  const [name, fallback] = splitVarArgs(value.slice(start + 4, end));
  const inherited = lookup(el, name, byClass, resolving);
  const replacement =
    inherited ??
    (fallback != null
      ? resolveValue(el, fallback, byClass, resolving)
      : `var(${name})`);
  // `replacement` is already resolved; continue after it.
  return (
    value.slice(0, start) +
    replacement +
    resolveValue(el, value.slice(end + 1), byClass, resolving)
  );
}

/**
 * The inherited value of a custom property at `el`: the nearest ancestor (or
 * `el`) that declares it, resolved where it is declared. `initial` is the
 * guaranteed-invalid value, so the reader's fallback applies; so is a
 * reference cycle.
 */
function lookup(
  el: HTMLElement,
  name: string,
  byClass: Map<string, Map<string, string>>,
  resolving: Set<string> = new Set(),
): string | undefined {
  let depth = 0;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    depth++;
    for (const cls of Array.from(node.classList)) {
      const declared = byClass.get(cls)?.get(name);
      if (declared == null) {
        continue;
      }
      const key = `${name}@${depth}:${cls}`;
      if (declared === 'initial' || resolving.has(key)) {
        return undefined;
      }
      resolving.add(key);
      const value = resolveValue(node, declared, byClass, resolving);
      resolving.delete(key);
      return value;
    }
  }
  return undefined;
}

/**
 * The inline-start inset a region applies, as a spacing token reference.
 * LayoutHeader pads its inner wrapper; LayoutContent pads its root.
 */
function resolvedInset(testId: string): string | undefined {
  const region = screen.getByTestId(testId);
  const padded = region.classList.contains('astryx-layout-header')
    ? (region.firstElementChild as HTMLElement)
    : region;
  return lookup(
    padded,
    '--container-padding-inline-start',
    declarationsByClass(),
  );
}

function PageLayout({padding}: {padding?: 2}) {
  return (
    <Layout
      padding={padding}
      header={<LayoutHeader data-testid="page-header">Orders</LayoutHeader>}
      content={<LayoutContent data-testid="page-content">Body</LayoutContent>}
    />
  );
}

describe('Layout padding scope', () => {
  beforeEach(() => {
    // AppShell reads a viewport media query; render the desktop shell.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives a Layout inside AppShell content its default inset', () => {
    render(
      <AppShell sideNav={<nav>Nav</nav>}>
        <PageLayout />
      </AppShell>,
    );
    expect(resolvedInset('page-header')).toBe('var(--spacing-4)');
    expect(resolvedInset('page-content')).toBe('var(--spacing-4)');
  });

  it("does not pass a full-bleed Layout's padding to a nested Layout", () => {
    render(
      <Layout
        padding={0}
        header={<LayoutHeader data-testid="outer-header">Shell</LayoutHeader>}
        content={<PageLayout />}
      />,
    );
    expect(resolvedInset('outer-header')).toBe('var(--spacing-0)');
    expect(resolvedInset('page-header')).toBe('var(--spacing-4)');
  });

  it('does not pass a non-zero Layout padding to a nested Layout', () => {
    render(
      <Layout
        padding={8}
        header={<LayoutHeader data-testid="outer-header">Shell</LayoutHeader>}
        content={<PageLayout />}
      />,
    );
    expect(resolvedInset('outer-header')).toBe('var(--spacing-8)');
    expect(resolvedInset('page-header')).toBe('var(--spacing-4)');
  });

  it('keeps an explicit padding on a nested Layout', () => {
    render(<Layout padding={0} content={<PageLayout padding={2} />} />);
    expect(resolvedInset('page-header')).toBe('var(--spacing-2)');
  });

  // Unchanged path: padding containers publish the inset for Layouts inside
  // them. Clearing the inherited container value (rather than only an
  // ancestor Layout's own value) would reset these to the default.
  it("keeps a Card's padding for a Layout inside it", () => {
    render(
      <Card padding={2}>
        <PageLayout />
      </Card>,
    );
    expect(resolvedInset('page-header')).toBe('var(--spacing-2)');
    expect(resolvedInset('page-content')).toBe('var(--spacing-2)');
  });

  it("keeps a Section's padding for a Layout inside it", () => {
    render(
      <Section padding={6}>
        <PageLayout />
      </Section>,
    );
    expect(resolvedInset('page-header')).toBe('var(--spacing-6)');
  });

  it('lets a Card inside a full-bleed Layout set the inset for its own Layout', () => {
    render(
      <Layout
        padding={0}
        content={
          <Card padding={2}>
            <PageLayout />
          </Card>
        }
      />,
    );
    expect(resolvedInset('page-header')).toBe('var(--spacing-2)');
  });
});
