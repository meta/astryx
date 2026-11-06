// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme-showcase.test.tsx
 * @input Uses the template, Babel parser, Testing Library and Vitest.
 * @output Verifies source constraints and local demo interactions.
 * @position Theme Showcase regression suite in the root UI project.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import ThemeShowcase, {
  ThemeShowcaseStore,
} from '../../../../packages/cli/assets/templates/pages/theme-showcase/page';
import {doc} from '../../../../packages/cli/assets/templates/pages/theme-showcase/template.doc.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const source = fs.readFileSync(
  path.join(
    rootDir,
    'packages/cli/assets/templates/pages/theme-showcase/page.tsx',
  ),
  'utf8',
);
const ast = parse(source, {
  sourceType: 'module',
  plugins: ['typescript', 'jsx'],
});

function nodesOfType(type: string): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === type) {
      nodes.push(node);
    }
    Object.values(node).forEach(visit);
  }
  visit(ast);
  return nodes;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(function (
    this: HTMLElement,
  ) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(function (
    this: HTMLElement,
  ) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
    this: HTMLElement,
    selector: string,
  ) {
    return selector === ':popover-open'
      ? this.hasAttribute('popover-open')
      : originalMatches.call(this, selector);
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('theme-showcase source contract', () => {
  it('uses Astryx instead of raw layout, text and icon markup', () => {
    const tags = nodesOfType('JSXOpeningElement')
      .map(node => (node.name as {name?: string})?.name)
      .filter(Boolean) as string[];
    expect(tags.filter(tag => /^[a-z]/.test(tag))).toEqual(['img', 'img']);
    expect(
      tags.filter(tag => ['svg', 'path', 'circle', 'rect'].includes(tag)),
    ).toEqual([]);
  });

  it('keeps only the three justified wrapping and chat-height styles', () => {
    const declaration = nodesOfType('VariableDeclarator').find(
      value => (value.id as {name?: string})?.name === 'styles',
    );
    const groups =
      (
        declaration?.init as {
          properties?: Array<{
            value: {properties: Array<{key: {name: string}}>};
          }>;
        }
      )?.properties ?? [];
    expect(
      groups.flatMap(group =>
        group.value.properties.map(property => property.key.name),
      ),
    ).toEqual(['flex', 'flex', 'maxHeight']);
    expect(source).not.toContain('stylex.create');
    expect(source).not.toContain('className=');
  });

  it('describes the actual shell and keeps the preview hidden from the gallery', () => {
    expect(doc.type).toBe('page');
    expect(doc.displayName).toBe('Theme Showcase');
    expect(doc.category).toBe('Shell - Top Nav');
    expect(doc.isHiddenFromOverview).toBe(true);
    expect(doc.isReady).toBe(true);
    expect(doc.description).toContain('comparison shell');
    expect(doc.description).toContain('embeddable');
  });

  it('uses checked-in demo assets and component-owned media fitting', () => {
    const images = [...source.matchAll(/'(\/template-assets\/[^']+)'/g)].map(
      match => match[1],
    );
    expect(images).toHaveLength(6);
    images.forEach(image =>
      expect(
        fs.existsSync(
          path.join(rootDir, 'apps/docsite/public', image.slice(1)),
        ),
      ).toBe(true),
    );
    expect(source).toContain('fit="cover"');
    expect(source).not.toContain('objectFit:');
  });
});

describe('theme-showcase local interactions', () => {
  it('uses one shell for the standalone page and none for the embedded preview', () => {
    const view = render(<ThemeShowcase />);
    expect(view.container.querySelectorAll('.astryx-app-shell')).toHaveLength(
      1,
    );
    view.rerender(<ThemeShowcaseStore />);
    expect(view.container.querySelectorAll('.astryx-app-shell')).toHaveLength(
      0,
    );
    expect(
      screen.getByRole('navigation', {name: 'Theme preview navigation'}),
    ).toBeInTheDocument();
  });

  it('lets checkout fields and saved-information selection change locally', async () => {
    const user = userEvent.setup();
    render(<ThemeShowcaseStore />);
    const email = screen.getByLabelText('Email');
    await user.type(email, 'customer@example.com');
    expect(email).toHaveValue('customer@example.com');
    const save = screen.getByRole('checkbox', {
      name: 'Securely save my information for 1-click checkout',
    });
    expect(save).toBeChecked();
    await user.click(save);
    expect(save).not.toBeChecked();
  });

  it('shows a safe payment preview instead of submitting a payment', async () => {
    const user = userEvent.setup();
    render(<ThemeShowcaseStore />);
    await user.click(screen.getByRole('button', {name: 'Pay now'}));
    expect(screen.getByText('Payment preview only')).toBeInTheDocument();
    expect(
      screen.getByText('No payment is submitted or saved.'),
    ).toBeInTheDocument();
  });

  it('filters inventory by text and changes cart feedback without navigation', async () => {
    const user = userEvent.setup();
    render(<ThemeShowcaseStore />);
    await user.type(screen.getByLabelText('Search inventory'), 'Wireless');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Wireless Headphones')).toBeInTheDocument();
    expect(
      within(table).queryByText('Minimalist Watch'),
    ).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', {name: 'Add to cart'})[0]);
    expect(
      screen.getByRole('button', {name: 'Added to cart'}),
    ).toBeInTheDocument();
  });

  it('filters inventory by a category declared in its fixtures', async () => {
    const user = userEvent.setup();
    render(<ThemeShowcaseStore />);
    const picker = screen.getByRole('combobox', {name: 'Categories'});
    await user.click(picker);
    expect(picker).toHaveAttribute('aria-expanded', 'true');
    const popup = document.getElementById(
      picker.getAttribute('aria-controls')!,
    )!;
    // JSDOM keeps native popovers out of its accessibility tree.
    fireEvent.click(
      within(popup).getByRole('option', {name: 'Audio', hidden: true}),
    );
    const table = screen.getByRole('table');
    expect(within(table).getByText('Wireless Headphones')).toBeInTheDocument();
    expect(
      within(table).queryByText('Canvas Backpack'),
    ).not.toBeInTheDocument();
  });

  it('keeps category-less inventory fixtures usable without an inert category picker', async () => {
    const user = userEvent.setup();
    render(
      <ThemeShowcaseStore
        inventory={[
          {
            id: 'custom',
            name: 'Custom item',
            meta: 'Preview fixture',
            available: 30,
            location: 'Aisle 1',
            tags: [],
            thumbnailFallback: 'C',
            selected: false,
          },
        ]}
      />,
    );
    const categories = screen.getByRole('combobox', {name: 'Categories'});
    expect(
      categories.matches(':disabled') ||
        categories.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    await user.click(categories);
    expect(categories).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(screen.getByRole('table')).getByText('Custom item'),
    ).toBeInTheDocument();
  });

  it('submits a draft and follows the actual message viewport with simulated scroll geometry', async () => {
    const user = userEvent.setup();
    const view = render(<ThemeShowcaseStore />);
    const viewport = screen.getByLabelText(
      'Studio AI conversation',
    ) as HTMLElement;
    Object.defineProperties(viewport, {
      clientHeight: {configurable: true, value: 200},
      scrollHeight: {configurable: true, value: 900},
    });
    const composer = view.container.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )!;
    await user.click(screen.getByRole('button', {name: 'Reschedule delivery'}));
    await user.click(composer);
    await user.keyboard('{Enter}');
    expect(
      within(viewport).getByText('Reschedule delivery'),
    ).toBeInTheDocument();
    expect(composer).toHaveTextContent('');
    await waitFor(() => expect(viewport.scrollTop).toBe(700));
    expect(viewport).toHaveAttribute('data-astryx-chat-following');
  });

  it('fills the chat draft from a suggested question', async () => {
    const user = userEvent.setup();
    const view = render(<ThemeShowcaseStore />);
    await user.click(screen.getByRole('button', {name: 'Reschedule delivery'}));
    expect(
      view.container.querySelector('[contenteditable="true"]'),
    ).toHaveTextContent('Reschedule delivery');
  });
});
