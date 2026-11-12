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
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import ThemeShowcase, {
  ThemeShowcaseStore,
} from '../../../../../packages/cli/assets/templates/pages/theme-showcase/page';
import {doc} from '../../../../../packages/cli/assets/templates/pages/theme-showcase/template.doc.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
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

const resizeCallbacks = new Map<Element, () => void>();
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
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        resizeCallbacks.set(target, () =>
          this.callback([{target} as ResizeObserverEntry], this),
        );
      }
      unobserve(target: Element) {
        resizeCallbacks.delete(target);
      }
      disconnect() {
        resizeCallbacks.clear();
      }
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
  resizeCallbacks.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('theme-showcase source contract', () => {
  it('keeps source, metadata and checked-in assets on Astryx conventions', () => {
    const tags = nodesOfType('JSXOpeningElement')
      .map(node => (node.name as {name?: string})?.name)
      .filter(Boolean) as string[];
    expect(tags.filter(tag => /^[a-z]/.test(tag))).toEqual(['img', 'img']);
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
    ).toEqual(['backgroundColor', 'flex', 'flex', 'maxHeight']);
    expect(source).not.toContain('stylex.create');
    expect(source).not.toContain('className=');
    expect(source).not.toContain('Track →');
    expect(doc.type).toBe('page');
    expect(doc.displayName).toBe('Theme Showcase');
    expect(doc.category).toBe('Shell - Top Nav');
    expect(doc.isHiddenFromOverview).toBe(true);
    expect(doc.isReady).toBe(true);
    expect(doc.description).toContain('comparison shell');
    expect(doc.description).toContain('embeddable');
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
  it('keeps standalone and embedded previews accessible and aligned', () => {
    const view = render(<ThemeShowcase />);
    expect(screen.getByRole('heading', {level: 1})).toHaveAttribute(
      'data-type',
      'display-2',
    );
    expect(view.container.querySelectorAll('.astryx-app-shell')).toHaveLength(
      1,
    );
    view.rerender(
      <div data-themes-card-preview>
        <h1>Host page</h1>
        <ThemeShowcaseStore />
      </div>,
    );
    expect(view.container.querySelectorAll('.astryx-app-shell')).toHaveLength(
      0,
    );
    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1);
    expect(
      screen.getByRole('heading', {level: 2, name: /Little joys/}),
    ).toHaveAttribute('data-type', 'display-2');
    const navigation = screen.getByRole('navigation', {
      name: 'Theme preview navigation',
    });
    const preview = navigation.closest<HTMLElement>(
      '[data-theme-preview="true"]',
    );
    expect(preview?.style.backgroundColor).toBe('var(--color-background-body)');
    expect(preview).toContainElement(screen.getByText('Little joys,'));

    const globals = fs.readFileSync(
      path.join(rootDir, 'apps/docsite/src/app/globals.css'),
      'utf8',
    );
    const selector = globals
      .match(/^\[data-themes-card-preview\][^{]+\{/m)?.[0]
      .replace(/\{$/, '')
      .trim();
    expect(navigation.matches(selector!)).toBe(true);
    const chatHeader = screen
      .getByRole('heading', {name: 'Studio AI'})
      .closest<HTMLElement>('.astryx-layout-header')!;
    expect(chatHeader.matches(selector!)).toBe(false);
    expect(chatHeader.parentElement?.matches(selector!)).toBe(false);
    expect(
      view.container.querySelectorAll('[data-theme-preview="true"]'),
    ).toHaveLength(1);
    const checkoutRow = screen
      .getByRole('heading', {name: 'Checkout'})
      .closest('.astryx-stack-item')?.parentElement;
    const inventoryRow = screen
      .getByRole('table')
      .closest('.astryx-stack-item')?.parentElement;
    expect(checkoutRow).toHaveClass('astryx-stack');
    expect((checkoutRow?.children[1] as HTMLElement).style.maxHeight).toBe('');
    expect(inventoryRow).toHaveClass('astryx-stack');
    expect(inventoryRow).not.toHaveClass('astryx-layout');
    const activity = screen
      .getByRole('heading', {name: 'Revenue'})
      .closest<HTMLElement>('.astryx-stack-item')!;
    expect(activity.parentElement).toBe(inventoryRow);
    expect(activity.style.height).toBe('');
    expect(getComputedStyle(activity).width).toBe('280px');
    expect(getComputedStyle(activity).flexShrink).toBe('0');
    const description = screen.getByText(
      'Water-resistant canvas with a quiet, modern profile.',
    );
    expect(getComputedStyle(description).display).toBe('block');
    expect(getComputedStyle(description).textAlign).toBe('center');
  });

  it('changes checkout fields locally and previews payment without submission', async () => {
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
    await user.click(screen.getByRole('button', {name: 'Pay now'}));
    expect(screen.getByText('Payment preview only')).toBeInTheDocument();
    expect(
      screen.getByText('No payment is submitted or saved.'),
    ).toBeInTheDocument();
  });

  it('opens a sign-in dialog from the navigation, closes it, and reopens it empty', async () => {
    // jsdom does not implement the modal dialog methods; remove the stubs
    // afterwards so other tests see jsdom unchanged.
    const proto = HTMLDialogElement.prototype;
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    onTestFinished(() => {
      delete (proto as Partial<HTMLDialogElement>).showModal;
      delete (proto as Partial<HTMLDialogElement>).close;
    });
    const user = userEvent.setup();
    render(<ThemeShowcaseStore />);
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Sign in'}));
    const dialog = await screen.findByRole('dialog', {name: 'Sign in'});
    const email = within(dialog).getByLabelText('Email');
    await user.type(email, 'customer@example.com');
    expect(email).toHaveValue('customer@example.com');
    await user.click(within(dialog).getByRole('button', {name: 'Cancel'}));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {name: 'Sign in'}),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', {name: 'Sign in'}));
    const reopened = await screen.findByRole('dialog', {name: 'Sign in'});
    expect(within(reopened).getByLabelText('Email')).toHaveValue('');
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

  it('clears category, location and tag filters to restore the full inventory', async () => {
    const user = userEvent.setup();
    const common = {
      meta: 'Preview fixture',
      available: 30,
      thumbnailFallback: 'I',
      selected: false,
    };
    render(
      <ThemeShowcaseStore
        inventory={[
          {
            ...common,
            id: 'first',
            name: 'Studio Headphones',
            category: 'Audio',
            location: 'Aisle 1',
            tags: [{label: 'Featured', variant: 'blue'}],
          },
          {
            ...common,
            id: 'second',
            name: 'Canvas Bag',
            category: 'Bags',
            location: 'Aisle 2',
            tags: [{label: 'Sale', variant: 'green'}],
          },
          {
            ...common,
            id: 'third',
            name: 'Desk Speaker',
            category: 'Audio',
            location: 'Aisle 1',
            tags: [{label: 'Sale', variant: 'green'}],
          },
        ]}
      />,
    );
    const table = screen.getByRole('table');
    async function choose(label: string, value: string) {
      const picker = screen.getByRole('combobox', {name: label});
      await user.click(picker);
      expect(picker).toHaveAttribute('aria-expanded', 'true');
      const popup = document.getElementById(
        picker.getAttribute('aria-controls')!,
      )!;
      fireEvent.click(
        within(popup).getByRole('option', {name: value, hidden: true}),
      );
    }
    await choose('Categories', 'Audio');
    expect(within(table).queryByText('Canvas Bag')).not.toBeInTheDocument();
    await choose('Locations', 'Aisle 2');
    expect(
      within(table).queryByText('Studio Headphones'),
    ).not.toBeInTheDocument();
    expect(within(table).queryByText('Desk Speaker')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /Clear.*Locations/i}));
    expect(within(table).getByText('Studio Headphones')).toBeInTheDocument();
    expect(within(table).getByText('Desk Speaker')).toBeInTheDocument();
    await choose('Tags', 'Sale');
    expect(
      within(table).queryByText('Studio Headphones'),
    ).not.toBeInTheDocument();
    expect(within(table).getByText('Desk Speaker')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /Clear.*Tags/i}));
    expect(within(table).getByText('Studio Headphones')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /Clear.*Categories/i}));
    expect(within(table).getByText('Studio Headphones')).toBeInTheDocument();
    expect(within(table).getByText('Canvas Bag')).toBeInTheDocument();
    expect(within(table).getByText('Desk Speaker')).toBeInTheDocument();
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
    expect(viewport.style.maxHeight).toBe('720px');
    Object.defineProperties(viewport, {
      clientHeight: {configurable: true, value: 200},
      scrollHeight: {configurable: true, value: 900},
    });
    const composer = view.container.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )!;
    await user.click(screen.getByRole('button', {name: 'Reschedule delivery'}));
    expect(composer).toHaveTextContent('Reschedule delivery');
    await user.click(composer);
    await user.keyboard('{Enter}');
    expect(
      within(viewport).getByText('Reschedule delivery'),
    ).toBeInTheDocument();
    expect(composer).toHaveTextContent('');
    await waitFor(() => expect(viewport.scrollTop).toBe(700));
    expect(viewport).toHaveAttribute('data-astryx-scroll-anchoring', 'off');
    const list = viewport.querySelector('.astryx-chat-message-list')!;
    expect(resizeCallbacks.has(list)).toBe(true);
    Object.defineProperty(viewport, 'scrollHeight', {value: 1200});
    resizeCallbacks.get(list)!();
    await waitFor(() => expect(viewport.scrollTop).toBe(1000), {timeout: 3000});
    viewport.scrollTop = 200;
    fireEvent.scroll(viewport);
    expect(viewport).not.toHaveAttribute('data-astryx-scroll-anchoring');
    Object.defineProperty(viewport, 'scrollHeight', {value: 1500});
    resizeCallbacks.get(list)!();
    expect(viewport.scrollTop).toBe(200);
  });
});
