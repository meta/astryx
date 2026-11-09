// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNav.slotPresence.test.tsx
 * @input TopNav, TopNavHeading, TopNavMegaMenuItem, TopNavMenu and
 *   NavHeadingMenuItem slots
 * @output Proves each slot's presence follows the shared `isRenderable` check
 * @position Tests for `architecture:react-component-runtime` INV16 in TopNav
 *
 * An empty value (`null`, `false`, `''`) renders no slot wrapper, as an
 * omitted slot does. `0` is content: it renders inside the slot's wrapper,
 * never as a stray "0" beside it.
 */

import {beforeAll, describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {TopNav} from './TopNav';
import {TopNavHeading} from './TopNavHeading';
import {TopNavMegaMenuItem} from './TopNavMegaMenuItem';
import {TopNavMenu} from './TopNavMenu';
import {TopNavRenderContext} from './TopNavRenderContext';
import {TopNavMobileContentContext} from './TopNavMobileContentContext';
import {NavHeadingMenu} from '../NavMenu/NavHeadingMenu';
import {NavHeadingMenuItem} from '../NavMenu/NavHeadingMenuItem';
import {AppShellMobileContext} from '../AppShell/AppShellMobileContext';

// jsdom does not implement showModal/close on <dialog>; the drawer uses them.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ||= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ||= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const EMPTY_VALUES = [
  ['null', null],
  ['false', false],
  ['an empty string', ''],
] as const;

/** The element whose own text is exactly "0", if any. */
function zeroParent(): HTMLElement | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent === '0') {
      return node.parentElement;
    }
  }
  return null;
}

/** Whether the "0" sits inside an element whose class names `style`. */
function zeroIsInside(style: string): boolean {
  return zeroParent()?.closest(`[class*="${style}"]`) != null;
}

const OPEN_MOBILE_NAV = {
  isMobile: true,
  isMobileNavOpen: true,
  toggleMobileNav: vi.fn(),
  openMobileNav: vi.fn(),
  closeMobileNav: vi.fn(),
  isMobileNavEnabled: true,
  hasAutoToggle: true,
};

function InMode({
  children,
  mode,
  mobileContent = null,
}: {
  children: ReactNode;
  mode: 'drawer' | 'mobile-bar';
  mobileContent?: ReactNode;
}) {
  return (
    <AppShellMobileContext value={OPEN_MOBILE_NAV}>
      <TopNavMobileContentContext value={mobileContent}>
        <TopNavRenderContext value={mode}>{children}</TopNavRenderContext>
      </TopNavMobileContentContext>
    </AppShellMobileContext>
  );
}

function InDrawer(props: {children: ReactNode; mobileContent?: ReactNode}) {
  return <InMode mode="drawer" {...props} />;
}

describe('TopNav slots follow isRenderable', () => {
  describe.each([
    ['the desktop bar', (node: ReactNode): ReactNode => node, 'styles.heading'],
    [
      'the mobile bar',
      (node: ReactNode): ReactNode => (
        <TopNavRenderContext value="mobile-bar">{node}</TopNavRenderContext>
      ),
      'mobileBarHeading',
    ],
  ] as const)('heading in %s', (_mode, wrap, style) => {
    it.each(EMPTY_VALUES)('renders no heading for %s', (_label, value) => {
      render(wrap(<TopNav heading={value} />));
      expect(document.querySelector(`[class*="${style}"]`)).toBeNull();
    });

    it('renders a heading of 0 inside its slot', () => {
      render(wrap(<TopNav heading={0} />));
      expect(zeroIsInside(style)).toBe(true);
    });
  });

  it.each(EMPTY_VALUES)('renders no start content for %s', (_label, value) => {
    render(<TopNav startContent={value} />);
    expect(document.querySelector('[class*="startContent"]')).toBeNull();
  });

  it('renders a startContent of 0 in the start section', () => {
    render(<TopNav startContent={0} />);
    expect(zeroIsInside('startContent')).toBe(true);
  });

  it.each(EMPTY_VALUES)('renders no end content for %s', (_label, value) => {
    render(<TopNav endContent={value} />);
    expect(document.querySelector('[class*="styles.endContent"]')).toBeNull();
  });

  it('renders an endContent of 0 inside its slot', () => {
    render(<TopNav endContent={0} />);
    expect(zeroIsInside('styles.endContent')).toBe(true);
  });

  describe('mobile content in the drawer', () => {
    it.each(EMPTY_VALUES)('renders no drawer for %s', (_label, value) => {
      const {container} = render(
        <InDrawer mobileContent={value}>
          <TopNav heading="Product" />
        </InDrawer>,
      );
      expect(container.innerHTML).toBe('');
      expect(
        document.querySelector('[class*="drawerExtraContent"]'),
      ).toBeNull();
    });

    it('renders a mobile content of 0 inside its drawer slot', () => {
      render(
        <InDrawer mobileContent={0}>
          <TopNav heading="Product" startContent={<span>Home</span>} />
        </InDrawer>,
      );
      expect(zeroIsInside('drawerExtraContent')).toBe(true);
    });
  });
});

// TopNav's layout flags decide presence with the same check as the slots.
describe('TopNav layout follows isRenderable', () => {
  it.each(EMPTY_VALUES)(
    'an empty centerContent (%s) keeps the bar out of its center layout',
    (_label, value) => {
      render(<TopNav heading="Product" centerContent={value} />);
      expect(document.querySelector('[class*="centerContent"]')).toBeNull();
      expect(document.querySelector('[class*="rightSection"]')).toBeNull();
    },
  );

  it.each(EMPTY_VALUES)(
    'empty start, center and mobile content (%s) show no mobile-bar toggle',
    (_label, value) => {
      render(
        <InMode mode="mobile-bar" mobileContent={value}>
          <TopNav
            heading="Product"
            startContent={value}
            centerContent={value}
          />
        </InMode>,
      );
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('a mobile content of 0 shows the mobile-bar toggle', () => {
    render(
      <InMode mode="mobile-bar" mobileContent={0}>
        <TopNav heading="Product" />
      </InMode>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it.each(EMPTY_VALUES)(
    'an empty startContent (%s) renders no drawer',
    (_label, value) => {
      const {container} = render(
        <InDrawer>
          <TopNav heading="Product" startContent={value} />
        </InDrawer>,
      );
      expect(container.innerHTML).toBe('');
    },
  );
});

describe('TopNavHeading slots follow isRenderable', () => {
  // Each props set reaches a different render path of the heading.
  const paths: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['the logo-only heading', {heading: undefined}],
    ['the static heading', {}],
    ['a whole-heading link', {headingHref: '/home'}],
    ['a whole-heading menu trigger', {menu: <span>Menu</span>}],
    ['a mixed heading', {headingHref: '/home', menu: <span>Menu</span>}],
    [
      'a heading with independent links',
      {superheading: 'Suite', superheadingHref: '/suite'},
    ],
  ];

  describe.each(paths)('logo in %s', (_path, props) => {
    it.each(EMPTY_VALUES)('renders no logo for %s', (_label, value) => {
      render(<TopNavHeading heading="Product" logo={value} {...props} />);
      expect(document.querySelector('[class*="styles.logo"]')).toBeNull();
    });

    it('renders a logo of 0 inside its slot', () => {
      render(<TopNavHeading heading="Product" logo={0} {...props} />);
      expect(zeroIsInside('styles.logo')).toBe(true);
    });
  });

  it('renders a logo of 0 in the open menu heading', () => {
    render(
      <TopNavHeading heading="Product" logo={0} menu={<span>Menu</span>} />,
    );
    fireEvent.click(screen.getByRole('button', {name: /Product/}));
    const zeros = Array.from(
      document.querySelectorAll('[class*="styles.logo"]'),
    ).filter(element => element.textContent === '0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it.each(EMPTY_VALUES)(
    'renders no header end content for %s',
    (_label, value) => {
      render(<TopNavHeading heading="Product" headerEndContent={value} />);
      expect(document.querySelector('[class*="headerEndContent"]')).toBeNull();
    },
  );

  it('renders a headerEndContent of 0 inside its slot', () => {
    render(<TopNavHeading heading="Product" headerEndContent={0} />);
    expect(zeroIsInside('headerEndContent')).toBe(true);
  });
});

describe('TopNavMegaMenuItem icon follows isRenderable', () => {
  describe.each([
    [
      'the desktop popover',
      (node: ReactNode): ReactNode => node,
      'desktopIcon',
    ],
    [
      'the drawer',
      (node: ReactNode): ReactNode => (
        <TopNavRenderContext value="drawer">{node}</TopNavRenderContext>
      ),
      'drawerItemIcon',
    ],
  ] as const)('in %s', (_mode, wrap, style) => {
    it.each(EMPTY_VALUES)('renders no icon for %s', (_label, value) => {
      render(wrap(<TopNavMegaMenuItem title="Reports" icon={value} />));
      expect(document.querySelector(`[class*="${style}"]`)).toBeNull();
    });

    it('renders an icon of 0 inside its slot', () => {
      render(wrap(<TopNavMegaMenuItem title="Reports" icon={0} />));
      expect(zeroIsInside(style)).toBe(true);
    });
  });
});

describe('TopNavMenu drawer item icon follows isRenderable', () => {
  const renderDrawerMenu = (icon: ReactNode) => {
    render(
      <InDrawer>
        <TopNavMenu label="Products" items={[{title: 'Reports', icon}]} />
      </InDrawer>,
    );
    fireEvent.click(screen.getByRole('button', {name: /Products/}));
  };

  it.each(EMPTY_VALUES)('renders no icon for %s', (_label, value) => {
    renderDrawerMenu(value);
    expect(document.querySelector('[class*="itemIcon"]')).toBeNull();
  });

  it('renders an icon of 0 inside its slot', () => {
    renderDrawerMenu(0);
    expect(zeroIsInside('itemIcon')).toBe(true);
  });
});

describe('NavHeadingMenuItem description follows isRenderable', () => {
  it.each(EMPTY_VALUES)('renders no description for %s', (_label, value) => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Reports" description={value} />
      </NavHeadingMenu>,
    );
    expect(screen.getByRole('menuitem').textContent).toBe('Reports');
  });

  it('renders a description of 0 as the supporting text', () => {
    render(
      <NavHeadingMenu>
        <NavHeadingMenuItem label="Reports" description={0} />
      </NavHeadingMenu>,
    );
    expect(zeroParent()?.closest('.astryx-text')).not.toBeNull();
  });
});
