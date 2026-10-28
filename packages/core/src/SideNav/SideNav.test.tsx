// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SideNav.test.tsx
 * @input Uses vitest, @testing-library/react, SideNav components
 * @output Unit tests for SideNav component suite
 * @position Testing; validates SideNav implementations
 *
 * SYNC: When SideNav components change, update tests to match new behavior
 */

import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useRef, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {getForcedColorsRules} from '../__tests__/forcedColors';
import {Button} from '../Button';
import {SideNav} from './SideNav';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {expectNativeLinkClicks} from '../hooks/__tests__/menuLinkClicks';
import {NavHeadingMenu, NavHeadingMenuItem} from '../NavMenu';
import {SideNavCollapseButton} from './SideNavCollapseButton';
import {SideNavHeading} from './SideNavHeading';
import {SideNavItem} from './SideNavItem';
import {SideNavSection} from './SideNavSection';
import {LinkProvider} from '../Link/LinkProvider';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import pseudoCatalog from '../../locales/pseudo.json';
import {
  SideNavCollapseContext,
  type SideNavImperativeCollapseHandle,
} from './SideNavCollapseContext';

function CustomLink({
  children,
  ref,
  ...props
}: React.ComponentPropsWithRef<'a'>) {
  return (
    <a ref={ref} data-custom-link {...props}>
      {children}
    </a>
  );
}

// =============================================================================
// SideNav
// =============================================================================

describe('SideNav', () => {
  it('renders with navigation role', () => {
    render(<SideNav>Content</SideNav>);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders aria-label for page navigation', () => {
    render(<SideNav>Content</SideNav>);
    expect(screen.getByRole('navigation')).toHaveAttribute(
      'aria-label',
      'Side navigation',
    );
  });

  it('renders children in scrollable area', () => {
    render(
      <SideNav>
        <span data-testid="nav-content">Nav items</span>
      </SideNav>,
    );
    expect(screen.getByTestId('nav-content')).toBeInTheDocument();
  });

  it('renders header slot', () => {
    render(
      <SideNav header={<span data-testid="header">Header</span>}>
        Content
      </SideNav>,
    );
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('renders topContent slot', () => {
    render(
      <SideNav topContent={<span data-testid="sticky">Sticky</span>}>
        Content
      </SideNav>,
    );
    expect(screen.getByTestId('sticky')).toBeInTheDocument();
  });

  it('renders footer slot', () => {
    render(
      <SideNav footer={<span data-testid="footer">Footer</span>}>
        Content
      </SideNav>,
    );
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('renders footerIcons slot', () => {
    render(
      <SideNav footerIcons={<span data-testid="footer-icons">Icons</span>}>
        Content
      </SideNav>,
    );
    expect(screen.getByTestId('footer-icons')).toBeInTheDocument();
  });

  it('renders all slots together', () => {
    render(
      <SideNav
        header={<span data-testid="header">Header</span>}
        topContent={<span data-testid="sticky">Sticky</span>}
        footer={<span data-testid="footer">Footer</span>}
        footerIcons={<span data-testid="icons">Icons</span>}>
        <span data-testid="content">Content</span>
      </SideNav>,
    );
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sticky')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('icons')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<SideNav ref={ref}>Content</SideNav>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('passes data-testid to root', () => {
    render(<SideNav data-testid="page-nav">Content</SideNav>);
    expect(screen.getByTestId('page-nav')).toBeInTheDocument();
  });

  it('renders and toggles from outside SideNav when handleRef is provided', async () => {
    const user = userEvent.setup();

    function Example() {
      const [isCollapsed, setIsCollapsed] = useState(false);
      const handleRef = useRef<SideNavImperativeCollapseHandle>(null);

      return (
        <>
          <SideNavCollapseButton handleRef={handleRef} />
          <SideNav
            handleRef={handleRef}
            collapsible={{
              isCollapsed,
              onCollapsedChange: setIsCollapsed,
              hasButton: false,
            }}>
            <SideNavSection title="Main">
              <SideNavItem label="Dashboard" icon={StubIcon} />
            </SideNavSection>
          </SideNav>
        </>
      );
    }

    render(<Example />);

    const button = screen.getByRole('button', {name: 'Collapse sidebar'});
    await user.click(button);

    expect(
      screen.getByRole('button', {name: 'Expand sidebar'}),
    ).toBeInTheDocument();
  });

  it('does not render an empty footer container when collapsible.hasButton is false', () => {
    render(
      <SideNav data-testid="nav" collapsible={{hasButton: false}}>
        Content
      </SideNav>,
    );

    // The built-in collapse button is opted out (consumers render their own
    // SideNavCollapseButton in the header), so it must not appear...
    expect(
      screen.queryByRole('button', {name: 'Collapse sidebar'}),
    ).not.toBeInTheDocument();

    // ...and no empty sticky-bottom container should be left behind. With no
    // footer/footerIcons and no built-in button, the scrollable content region
    // is the nav's only child.
    const nav = screen.getByTestId('nav');
    expect(nav.children).toHaveLength(1);
  });

  it('centers footer content when collapsed, matching children alignment', () => {
    render(
      <SideNav
        data-testid="nav"
        collapsible={{isCollapsed: true, hasButton: false}}
        footer={<span data-testid="footer-content">F</span>}>
        <span data-testid="children-content">C</span>
      </SideNav>,
    );

    // scrollableCollapsed (wraps children) and stickyBottomCollapsed (wraps
    // footer) are structurally parallel collapsed-rail containers; both
    // must center their content the same way, or full-width footer content
    // stretches to the collapsed rail's width instead of centering.
    const childrenContainer =
      screen.getByTestId('children-content').parentElement;
    const footerContainer = screen.getByTestId('footer-content').parentElement;
    expect(getComputedStyle(childrenContainer!).alignItems).toBe('center');
    expect(getComputedStyle(footerContainer!).alignItems).toBe('center');
  });

  it('fires a consumer onClick on the collapse button in addition to toggling', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    function Example() {
      const [isCollapsed, setIsCollapsed] = useState(false);
      const handleRef = useRef<SideNavImperativeCollapseHandle>(null);
      return (
        <>
          <SideNavCollapseButton handleRef={handleRef} onClick={onClick} />
          <SideNav
            handleRef={handleRef}
            collapsible={{
              isCollapsed,
              onCollapsedChange: setIsCollapsed,
              hasButton: false,
            }}>
            <SideNavSection title="Main">
              <SideNavItem label="Dashboard" icon={StubIcon} />
            </SideNavSection>
          </SideNav>
        </>
      );
    }

    render(<Example />);
    await user.click(screen.getByRole('button', {name: 'Collapse sidebar'}));

    expect(onClick).toHaveBeenCalledTimes(1);
    // Toggle still ran: the label flipped to "Expand sidebar".
    expect(
      screen.getByRole('button', {name: 'Expand sidebar'}),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// SideNavHeading
// =============================================================================

describe('SideNavHeading', () => {
  it('renders heading text', () => {
    render(<SideNavHeading heading="My App" />);
    expect(screen.getByText('My App')).toBeInTheDocument();
  });

  it('renders icon', () => {
    render(
      <SideNavHeading
        heading="My App"
        icon={<span data-testid="app-icon">🏠</span>}
      />,
    );
    expect(screen.getByTestId('app-icon')).toBeInTheDocument();
  });

  it('renders superheading', () => {
    render(<SideNavHeading heading="Product" superheading="Suite Name" />);
    expect(screen.getByText('Suite Name')).toBeInTheDocument();
  });

  it('renders subheading', () => {
    render(<SideNavHeading heading="Product" subheading="Account" />);
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('renders as link when headingHref is provided without menu', () => {
    render(<SideNavHeading heading="My App" headingHref="/home" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/home');
    expect(link).toHaveTextContent('My App');
  });

  it('uses custom link component from as prop', () => {
    render(
      <SideNavHeading heading="My App" headingHref="/home" as={CustomLink} />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('data-custom-link');
  });

  it('uses custom link component from LinkProvider', () => {
    render(
      <LinkProvider component={CustomLink}>
        <SideNavHeading heading="My App" headingHref="/home" />
      </LinkProvider>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('data-custom-link');
  });

  it('renders independent links when headingHref and superheadingHref are provided', () => {
    render(
      <SideNavHeading
        heading="Product"
        headingHref="/product"
        superheading="Suite"
        superheadingHref="/suite"
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/suite');
    expect(links[1]).toHaveAttribute('href', '/product');
  });

  it('gives every link an accessible name with superheadingHref, headingHref, and menu', () => {
    render(
      <SideNavHeading
        icon={<span>Icon</span>}
        superheading="Suite Name"
        superheadingHref="/suite"
        heading="Product Name"
        headingHref="/product"
        menu={<div>Analytics</div>}
      />,
    );
    // The icon link to /product previously rendered with no text and no
    // aria-label, producing an empty accessible name (axe rule: link-name).
    // Every link pointing at /product must now expose "Product Name".
    const productLinks = screen
      .getAllByRole('link', {name: 'Product Name'})
      .filter(link => link.getAttribute('href') === '/product');
    expect(productLinks.length).toBeGreaterThan(0);
    for (const link of productLinks) {
      expect(link).toHaveAccessibleName('Product Name');
    }
    // The independent superheading link is unaffected.
    expect(screen.getByRole('link', {name: 'Suite Name'})).toHaveAttribute(
      'href',
      '/suite',
    );
    // No link should be missing an accessible name.
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAccessibleName();
    }
  });

  it('shows chevron when menu is provided', () => {
    render(<SideNavHeading heading="My App" menu={<div>Menu content</div>} />);
    // The chevron SVG should be rendered
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('does not show chevron without menu', () => {
    const {container} = render(<SideNavHeading heading="My App" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('whole heading is popover trigger when menu provided without hrefs', () => {
    render(<SideNavHeading heading="My App" menu={<div>Menu</div>} />);
    const button = screen.getByRole('button');
    // The popup is no longer a dialog (role: 'none' on usePopover), so the
    // trigger advertises a generic popup rather than aria-haspopup="dialog".
    expect(button).toHaveAttribute('aria-haspopup', 'true');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('has popoverTarget on trigger button when menu is provided', () => {
    render(
      <SideNavHeading
        heading="My App"
        menu={<div data-testid="menu-content">Menu</div>}
      />,
    );
    const button = screen.getByRole('button');
    // The trigger button uses aria attributes from usePopover and
    // an onClick handler from useMenuHover for click-to-lock toggle.
    expect(button).toHaveAttribute('aria-haspopup', 'true');
    expect(button).toHaveAttribute('aria-expanded');
  });

  it('renders chevron as separate trigger when menu and hrefs are provided', () => {
    render(
      <SideNavHeading
        heading="Product"
        headingHref="/product"
        menu={<div>Menu</div>}
      />,
    );
    const button = screen.getByRole('button', {name: 'Open menu'});
    expect(button).toHaveAttribute('aria-haspopup', 'true');
  });

  it('passes data-testid', () => {
    render(<SideNavHeading heading="My App" data-testid="nav-header" />);
    expect(screen.getByTestId('nav-header')).toBeInTheDocument();
  });

  // ===========================================================================
  // Menu popover semantics — the popup must not be announced as a modal
  // dialog, and role="menu" must be scoped to the actual menu items so the
  // heading button is not an invalid child of the menu.
  // ===========================================================================

  // The popover layer keeps `popover` content display:none in jsdom even
  // when open, hiding it from role queries — so these tests assert the
  // popup's ARIA semantics at the DOM level instead.
  describe('menu popover semantics', () => {
    const menuItems = (
      <>
        <div role="menuitem">Alpha</div>
        <div role="menuitem">Beta</div>
      </>
    );

    it('leaves a press on caller content that is not an item to that content: a button click and a link click run (interaction-modality INV4)', async () => {
      __resetMenuPressForTest();
      const user = userEvent.setup();
      const onButton = vi.fn();
      const onLink = vi.fn((event: React.MouseEvent) => event.preventDefault());
      render(
        <SideNavHeading
          heading="My App"
          menu={
            <>
              <button type="button" onClick={onButton}>
                Switch account
              </button>
              <a href="#docs" onClick={onLink}>
                Docs
              </a>
            </>
          }
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      for (const pointer of [
        {pointerType: 'mouse', pointerId: 1, button: 0},
        {pointerType: 'touch', pointerId: 2},
      ]) {
        onButton.mockClear();
        onLink.mockClear();
        const button = screen.getByRole('button', {
          name: 'Switch account',
          hidden: true,
        });
        fireEvent.pointerDown(button, pointer);
        fireEvent.pointerUp(button, pointer);
        // A pointer's click reports detail 1 (a keyboard's reports 0).
        fireEvent.click(button, {detail: 1});
        expect(onButton).toHaveBeenCalledTimes(1);
        const link = screen.getByRole('link', {name: 'Docs', hidden: true});
        fireEvent.pointerDown(link, pointer);
        fireEvent.pointerUp(link, pointer);
        fireEvent.click(link, {detail: 1});
        expect(onLink).toHaveBeenCalledTimes(1);
      }
    });

    it('leaves a Ctrl-, Cmd-, Shift- or middle click on a link item in its menu to the browser', async () => {
      __resetMenuPressForTest();
      const user = userEvent.setup();
      render(
        <SideNavHeading
          heading="My App"
          menu={
            <NavHeadingMenu>
              <NavHeadingMenuItem label="Docs" href="/docs" />
              <NavHeadingMenuItem label="Status" href="/status" />
            </NavHeadingMenu>
          }
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      expectNativeLinkClicks(
        screen.getByRole('menuitem', {name: 'Docs', hidden: true}),
      );
    });

    it('closes when a mouse pressed on a NavHeadingMenu item is released outside the menu (useMenuPress FR3)', async () => {
      __resetMenuPressForTest();
      const user = userEvent.setup();
      render(
        <>
          <SideNavHeading
            heading="My App"
            menu={
              <NavHeadingMenu>
                <NavHeadingMenuItem label="Alpha" onClick={() => {}} />
                <NavHeadingMenuItem label="Beta" onClick={() => {}} />
              </NavHeadingMenu>
            }
          />
          <button type="button">Outside</button>
        </>,
      );
      const trigger = screen.getByRole('button', {name: 'Open menu'});
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const mouse = {pointerType: 'mouse', pointerId: 3, button: 0};
      const outside = screen.getByRole('button', {name: 'Outside'});
      fireEvent.pointerDown(
        screen.getByRole('menuitem', {name: 'Alpha', hidden: true}),
        mouse,
      );
      fireEvent.pointerMove(outside, mouse);
      fireEvent.pointerUp(outside, mouse);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('acts on the item a press slid across the menu lifts on, once (family:action-groups FR1, FR2, FR5)', async () => {
      __resetMenuPressForTest();
      const user = userEvent.setup();
      const onAlpha = vi.fn();
      const onBeta = vi.fn();
      render(
        <SideNavHeading
          heading="My App"
          menu={
            <>
              <div role="menuitem" tabIndex={-1} onClick={onAlpha}>
                Alpha
              </div>
              <div role="menuitem" tabIndex={-1} onClick={onBeta}>
                Beta
              </div>
            </>
          }
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      const item = (name: string) =>
        screen.getByRole('menuitem', {name, hidden: true});
      for (const pointer of [
        {pointerType: 'touch', pointerId: 1},
        {pointerType: 'mouse', pointerId: 2, button: 0},
      ]) {
        onAlpha.mockClear();
        onBeta.mockClear();
        fireEvent.pointerDown(item('Alpha'), pointer);
        fireEvent.pointerMove(item('Beta'), pointer);
        fireEvent.pointerUp(item('Beta'), pointer);
        expect(onBeta).toHaveBeenCalledTimes(1);
        expect(onAlpha).not.toHaveBeenCalled();
      }
    });

    it('does not wrap the heading menu popup in a modal dialog', async () => {
      const user = userEvent.setup();
      render(<SideNavHeading heading="My App" menu={menuItems} />);
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    });

    it('scopes role="menu" to only menuitem children with an accessible name', async () => {
      const user = userEvent.setup();
      render(<SideNavHeading heading="My App" menu={menuItems} />);
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      const menu = document.querySelector('[role="menu"]');
      expect(menu).not.toBeNull();
      expect(menu).toHaveAttribute('aria-label', 'My App');
      const children = Array.from(menu!.children);
      expect(children.length).toBeGreaterThan(0);
      for (const child of children) {
        expect(child).toHaveAttribute('role', 'menuitem');
      }
    });

    it('keeps the popup heading button outside the menu and closes on click', async () => {
      const user = userEvent.setup();
      render(<SideNavHeading heading="My App" menu={menuItems} />);
      const trigger = screen.getByRole('button', {name: 'Open menu'});
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const menu = document.querySelector('[role="menu"]');
      expect(menu).not.toBeNull();
      // The heading replica button in the popup is a sibling of the menu,
      // not an invalid menu child.
      const headingButton = Array.from(
        document.querySelectorAll('button'),
      ).find(b => b !== trigger && b.textContent?.includes('My App'));
      expect(headingButton).toBeDefined();
      expect(menu!.contains(headingButton!)).toBe(false);
      // Clicking it still closes the popup.
      fireEvent.click(headingButton!);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('applies the same semantics in mixed mode (menu + hrefs)', async () => {
      const user = userEvent.setup();
      render(
        <SideNavHeading
          heading="Product"
          headingHref="/product"
          menu={menuItems}
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      const menu = document.querySelector('[role="menu"]');
      expect(menu).not.toBeNull();
      expect(menu).toHaveAttribute('aria-label', 'Product');
      for (const child of Array.from(menu!.children)) {
        expect(child).toHaveAttribute('role', 'menuitem');
      }
    });
  });
});

// =============================================================================
// SideNavHeading — collapsed mode
// =============================================================================

const COLLAPSED_CONTEXT = {
  isCollapsed: true,
  toggle: () => {},
  isCollapsible: true,
};

function CollapsedWrapper({children}: {children: ReactNode}) {
  return (
    <SideNavCollapseContext value={COLLAPSED_CONTEXT}>
      {children}
    </SideNavCollapseContext>
  );
}

describe('SideNavHeading collapsed', () => {
  it('returns null when collapsed without icon', () => {
    const {container} = render(
      <CollapsedWrapper>
        <SideNavHeading heading="My App" />
      </CollapsedWrapper>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders icon when collapsed with icon', () => {
    render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          icon={<span data-testid="app-icon">🏠</span>}
        />
      </CollapsedWrapper>,
    );
    expect(screen.getByTestId('app-icon')).toBeInTheDocument();
  });

  it('does not show heading text inline when collapsed (only in tooltip)', () => {
    const {container} = render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          icon={<span data-testid="app-icon">🏠</span>}
        />
      </CollapsedWrapper>,
    );
    // The heading text should not appear as a visible inline element
    // (it exists only in the tooltip for accessibility)
    const headingSpans = container.querySelectorAll('span');
    const inlineHeadingText = Array.from(headingSpans).find(
      el =>
        el.textContent === 'My App' &&
        !el.closest('[role="tooltip"]') &&
        !el.hasAttribute('data-tooltip'),
    );
    expect(inlineHeadingText).toBeUndefined();
  });

  it('renders as link when collapsed with headingHref', () => {
    render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          headingHref="/home"
          icon={<span data-testid="app-icon">🏠</span>}
        />
      </CollapsedWrapper>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/home');
    expect(link).toHaveAttribute('aria-label', 'My App');
  });

  it('does not show chevron when collapsed', () => {
    const {container} = render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          headingHref="/home"
          icon={<span data-testid="app-icon">🏠</span>}
          menu={<div>Menu</div>}
        />
      </CollapsedWrapper>,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('passes data-testid when collapsed', () => {
    render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          icon={<span>🏠</span>}
          data-testid="nav-header"
        />
      </CollapsedWrapper>,
    );
    expect(screen.getByTestId('nav-header')).toBeInTheDocument();
  });

  it('collapsed menu popup is not a dialog and scopes role="menu" to menu items', async () => {
    const user = userEvent.setup();
    render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          icon={<span data-testid="app-icon">🏠</span>}
          menu={
            <>
              <div role="menuitem">Alpha</div>
              <div role="menuitem">Beta</div>
            </>
          }
        />
      </CollapsedWrapper>,
    );
    await user.click(screen.getByRole('button', {name: 'My App'}));
    // No modal dialog wrapper around the menu popup.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    // role="menu" is scoped to the menu items and has a direct name.
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu).toHaveAttribute('aria-label', 'My App');
    const children = Array.from(menu!.children);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      expect(child).toHaveAttribute('role', 'menuitem');
    }
    // No button (trigger or heading replica) lives inside the menu.
    for (const button of Array.from(document.querySelectorAll('button'))) {
      expect(menu!.contains(button)).toBe(false);
    }
  });

  it('anchors the collapsed icon-only trigger so the popover positions against it', () => {
    render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          icon={<span data-testid="app-icon">🏠</span>}
          menu={<div role="menuitem">Alpha</div>}
        />
      </CollapsedWrapper>,
    );
    const trigger = screen.getByRole('button', {name: 'My App'});
    // The same element also carries the collapsed-item Tooltip's own
    // anchor-name (via anchorRef={collapsedItemRef}), so a plain
    // non-empty check would pass even when the menu popover itself isn't
    // anchored. Assert the popover's own position-anchor id specifically
    // appears in the trigger's (possibly multi-value) anchor-name list.
    const popoverEl = document.querySelector('[popover]') as HTMLElement;
    const anchorId = popoverEl.style.positionAnchor;
    expect(anchorId).not.toBe('');
    const triggerAnchorNames = trigger.style.anchorName
      .split(',')
      .map(s => s.trim());
    expect(triggerAnchorNames).toContain(anchorId);
  });
});

// =============================================================================
// SideNavHeading — headerEndContent
// =============================================================================

describe('SideNavHeading headerEndContent', () => {
  it('renders headerEndContent in the default static path', () => {
    render(
      <SideNavHeading
        heading="My App"
        headerEndContent={<span data-testid="end-badge">3</span>}
      />,
    );
    expect(screen.getByTestId('end-badge')).toBeInTheDocument();
  });

  it('renders headerEndContent beside the link, not inside it, in isWholeHeadingLink path', () => {
    const onPress = vi.fn();
    render(
      <SideNavHeading
        heading="My App"
        headingHref="/home"
        headerEndContent={
          <button type="button" onClick={onPress}>
            Create
          </button>
        }
      />,
    );
    const link = screen.getByRole('link', {name: 'My App'});
    expect(link).toHaveAttribute('href', '/home');
    // A control inside a link is invalid and its press would follow the link.
    const button = screen.getByRole('button', {name: 'Create'});
    expect(button.closest('a')).toBeNull();
    expect(link.parentElement).toBe(button.parentElement?.parentElement);
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders headerEndContent in isWholeHeadingTrigger path', () => {
    render(
      <SideNavHeading
        heading="My App"
        menu={<div>Menu</div>}
        headerEndContent={<span data-testid="end-badge">3</span>}
      />,
    );
    const badge = screen.getByTestId('end-badge');
    expect(badge).toBeInTheDocument();
    // Badge renders inside the heading container (div), alongside the chevron button
    expect(badge.closest('[class]')).not.toBeNull();
  });

  it('renders headerEndContent in mixed mode (menu + href)', () => {
    render(
      <SideNavHeading
        heading="My App"
        headingHref="/home"
        menu={<div>Menu</div>}
        headerEndContent={<span data-testid="end-badge">3</span>}
      />,
    );
    expect(screen.getByTestId('end-badge')).toBeInTheDocument();
  });

  it('renders headerEndContent with independent links (no menu)', () => {
    render(
      <SideNavHeading
        heading="Product"
        headingHref="/product"
        superheading="Suite"
        superheadingHref="/suite"
        headerEndContent={<span data-testid="end-badge">3</span>}
      />,
    );
    expect(screen.getByTestId('end-badge')).toBeInTheDocument();
  });

  it('hides headerEndContent when collapsed', () => {
    render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          icon={<span>🏠</span>}
          headerEndContent={<span data-testid="end-badge">3</span>}
        />
      </CollapsedWrapper>,
    );
    expect(screen.queryByTestId('end-badge')).not.toBeInTheDocument();
  });
});

// =============================================================================
// SideNavHeading — truncation tooltips
// =============================================================================

describe('SideNavHeading truncation tooltips', () => {
  it('attaches truncation refs to heading text spans', () => {
    render(
      <SideNavHeading
        heading="My App"
        superheading="Acme Corp"
        subheading="admin@acme.com"
      />,
    );
    // All three text spans should be present
    expect(screen.getByText('My App')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('admin@acme.com')).toBeInTheDocument();
  });

  it('does not crash with truncation hooks when only heading is provided', () => {
    render(<SideNavHeading heading="My App" />);
    expect(screen.getByText('My App')).toBeInTheDocument();
  });
});

// =============================================================================
// SideNavItem
// =============================================================================

describe('SideNavItem', () => {
  it('renders label text', () => {
    render(<SideNavItem label="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders as link when href is provided', () => {
    render(<SideNavItem label="Dashboard" href="/dashboard" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders as button when no href', () => {
    render(<SideNavItem label="Dashboard" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('sets aria-current="page" when selected', () => {
    render(<SideNavItem label="Dashboard" isSelected />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current when not selected', () => {
    render(<SideNavItem label="Dashboard" />);
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('aria-current');
  });

  it('disables the button when isDisabled', () => {
    render(<SideNavItem label="Dashboard" isDisabled />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('calls onClick handler', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<SideNavItem label="Dashboard" onClick={handleClick} />);
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders endContent', () => {
    render(
      <SideNavItem
        label="Projects"
        endContent={<span data-testid="badge">3</span>}
      />,
    );
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });

  it('renders nested children', () => {
    render(
      <SideNavItem label="Settings">
        <SideNavItem label="General" />
        <SideNavItem label="Security" />
      </SideNavItem>,
    );
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('keeps nested rows full width and indents their content inside the row', () => {
    render(
      <SideNavItem label="Settings">
        <SideNavItem label="General" href="/settings/general">
          <SideNavItem label="Advanced" href="/settings/general/advanced" />
        </SideNavItem>
      </SideNavItem>,
    );

    // The children group adds no inset of its own, so a nested row's hover
    // and selected fill spans the nav list like a top-level row's.
    const groups = screen.getAllByRole('group', {hidden: true});
    for (const group of groups) {
      expect(declaredOn(group, 'padding-inline-start')).toEqual([]);
      expect(
        declaredOn(group.firstElementChild!, 'padding-inline-start'),
      ).toEqual([]);
    }

    // The indent lives inside each row instead, one step per nesting level.
    // An ordinary row is the link itself: its own padding plus the steps.
    const top = screen.getByRole('button', {name: 'Settings'});
    const general = screen.getByRole('link', {name: 'General'});
    const advanced = screen.getByRole('link', {name: 'Advanced'});
    expect(indentOf(top)).toBeNull();
    expect(indentOf(advanced)).toBe(
      'calc(var(--spacing-2) + 2 * var(--spacing-6))',
    );

    // A split row (own href plus children) keeps the wrapper's base padding
    // and puts the steps on the link, so the whole indent is clickable
    // instead of dead space that still shows hover and press feedback.
    expect(indentOf(general.parentElement!)).toBeNull();
    expect(indentOf(general)).toBe('calc(1 * var(--spacing-6))');
  });

  it('clips the children group only while it is collapsed', async () => {
    // Nested rows sit flush with the group, so a permanent clip would cut off
    // their focus ring. The group clips for the collapse animation only.
    const user = userEvent.setup();
    render(
      <SideNavItem label="Settings" collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    const group = () => screen.getByRole('group', {hidden: true});
    expect(declaredOn(group(), 'overflow')).toEqual(['visible']);
    expect(declaredOn(group().firstElementChild!, 'overflow')).toEqual([]);

    await user.click(screen.getByRole('button', {name: 'Settings'}));
    expect(declaredOn(group(), 'overflow')).toEqual(['hidden']);
  });

  it('puts the indent on the primary link of a nested actions row', () => {
    render(
      <SideNavItem label="Projects">
        <SideNavItem
          label="Alpha"
          href="/projects/alpha"
          actions={
            <button type="button" aria-label="Alpha actions">
              More
            </button>
          }
        />
      </SideNavItem>,
    );
    const alpha = screen.getByRole('link', {name: 'Alpha'});
    expect(indentOf(alpha.parentElement!)).toBeNull();
    expect(indentOf(alpha)).toBe('calc(1 * var(--spacing-6))');
  });

  it("composes a caller's style with the indent on a nested row", () => {
    render(
      <SideNavItem label="Settings">
        <SideNavItem
          label="General"
          href="/settings/general"
          style={{color: 'rebeccapurple'}}
        />
        <SideNavItem
          label="Security"
          href="/settings/security"
          style={{color: 'rebeccapurple'}}>
          <SideNavItem label="Keys" href="/settings/security/keys" />
        </SideNavItem>
      </SideNavItem>,
    );
    // Ordinary row: the link is the row.
    const general = screen.getByRole('link', {name: 'General'});
    expect(general.style.color).toBe('rebeccapurple');
    expect(indentOf(general)).toBe(
      'calc(var(--spacing-2) + 1 * var(--spacing-6))',
    );
    // Split row: the caller's style still lands on the primary link.
    const security = screen.getByRole('link', {name: 'Security'});
    expect(security.style.color).toBe('rebeccapurple');
    expect(indentOf(security)).toBe('calc(1 * var(--spacing-6))');
  });

  it("keeps a caller's className on the row element", () => {
    render(
      <SideNavItem label="Settings">
        <SideNavItem
          label="General"
          href="/settings/general"
          className="caller-row"
        />
        <SideNavItem
          label="Security"
          href="/settings/security"
          className="caller-row">
          <SideNavItem label="Keys" href="/settings/security/keys" />
        </SideNavItem>
      </SideNavItem>,
    );
    // Ordinary row: the link is the row, and the caller's class sits beside
    // the row's own classes instead of being replaced by them.
    const general = screen.getByRole('link', {name: 'General'});
    expect(general).toHaveClass('caller-row');
    expect(general).toHaveClass('astryx-side-nav-item');
    // Split row: the class lands on the primary link, as `style` does.
    expect(screen.getByRole('link', {name: 'Security'})).toHaveClass(
      'caller-row',
    );
  });

  it("keeps a caller's className on a collapsed rail item", () => {
    render(
      <SideNav collapsible={{isCollapsed: true, hasButton: false}}>
        <SideNavItem
          label="Home"
          href="/"
          icon="calendar"
          className="caller-row"
        />
      </SideNav>,
    );
    expect(screen.getByRole('link', {name: 'Home'})).toHaveClass('caller-row');
  });

  it("lets a caller's inline-start padding replace the indent", () => {
    // The caller's `style` composes after the indent: a caller-set
    // inline-start padding is an inline declaration, so it wins over the
    // indent's class rule on the element that carries the indent, on both
    // the ordinary and the split row path.
    render(
      <SideNavItem label="Settings">
        <SideNavItem
          label="General"
          href="/settings/general"
          style={{paddingInlineStart: '20px'}}
        />
        <SideNavItem
          label="Security"
          href="/settings/security"
          style={{paddingInlineStart: '20px'}}>
          <SideNavItem label="Keys" href="/settings/security/keys" />
        </SideNavItem>
      </SideNavItem>,
    );
    const general = screen.getByRole('link', {name: 'General'});
    expect(general.style.paddingInlineStart).toBe('20px');
    const security = screen.getByRole('link', {name: 'Security'});
    expect(security.style.paddingInlineStart).toBe('20px');
    // A row whose caller sets no padding keeps its indent.
    expect(indentOf(screen.getByRole('link', {name: 'Keys'}))).toBe(
      'calc(var(--spacing-2) + 2 * var(--spacing-6))',
    );
  });

  it('indents a small nested row from the small row padding', () => {
    render(
      <SideNavItem label="Settings">
        <SideNavItem label="General" href="/settings/general" size="sm" />
      </SideNavItem>,
    );
    expect(indentOf(screen.getByRole('link', {name: 'General'}))).toBe(
      'calc(var(--spacing-1) + 1 * var(--spacing-6))',
    );
  });

  it('does not indent the first level of a collapsed rail flyout', async () => {
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon}>
        <SideNavItem label="General" href="/settings/general">
          <SideNavItem label="Advanced" href="/settings/general/advanced" />
        </SideNavItem>
      </SideNavItem>,
    );
    await user.click(screen.getByRole('button', {name: 'Settings'}));

    // jsdom leaves the native popover `display: none`, hence `hidden: true`.
    // The flyout lists the parent's children as its own top level.
    const general = screen.getByRole('link', {name: 'General', hidden: true});
    const advanced = screen.getByRole('link', {name: 'Advanced', hidden: true});
    expect(indentOf(general)).toBeNull();
    expect(indentOf(general.parentElement!)).toBeNull();
    expect(indentOf(advanced)).toBe(
      'calc(var(--spacing-2) + 1 * var(--spacing-6))',
    );
  });

  it('passes data-testid', () => {
    render(<SideNavItem label="Dashboard" data-testid="nav-item" />);
    expect(screen.getByTestId('nav-item')).toBeInTheDocument();
  });

  it('renders with selected link', () => {
    render(<SideNavItem label="Dashboard" href="/dashboard" isSelected />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('places aria-current on the link, not the wrapper, for split-action items', () => {
    // A collapsible item (has children) WITH a primary href renders the
    // split-action path: the link and the expand toggle are siblings inside a
    // wrapper div. aria-current="page" must sit on the focusable link so it is
    // announced as the current page (navigation-8).
    render(
      <SideNavItem label="Reports" href="/reports" isSelected>
        <SideNavItem label="Weekly" href="/reports/weekly" />
      </SideNavItem>,
    );
    const link = screen.getByRole('link', {name: /Reports/});
    expect(link).toHaveAttribute('aria-current', 'page');
    // The wrapper div must NOT carry aria-current.
    expect(link.closest('[aria-current="page"]')).toBe(link);
  });

  it('renders custom component when as and href are provided', () => {
    render(<SideNavItem label="Dashboard" href="/dashboard" as={CustomLink} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('still renders button when no href even with as prop', () => {
    render(<SideNavItem label="Dashboard" as={CustomLink} />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveAttribute('data-custom-link');
  });

  it('renders custom component from LinkProvider when href is provided', () => {
    render(
      <LinkProvider component={CustomLink}>
        <SideNavItem label="Dashboard" href="/dashboard" />
      </LinkProvider>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('data-custom-link');
  });
});

// =============================================================================
// SideNavSection
// =============================================================================

describe('SideNavSection', () => {
  it('renders with group role', () => {
    render(
      <SideNavSection title="Main">
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('renders heading text', () => {
    render(
      <SideNavSection title="Main">
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    expect(screen.getByText('Main')).toBeInTheDocument();
  });

  it('uses aria-labelledby to link title to group', () => {
    render(
      <SideNavSection title="Main">
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    const group = screen.getByRole('group');
    const labelId = group.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const label = document.getElementById(labelId!);
    expect(label).toHaveTextContent('Main');
  });

  it('renders subheading', () => {
    render(
      <SideNavSection title="Main" subtitle="Primary navigation">
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    expect(screen.getByText('Primary navigation')).toBeInTheDocument();
  });

  it('renders endContent', () => {
    render(
      <SideNavSection
        title="Main"
        endContent={<span data-testid="section-action">+</span>}>
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    expect(screen.getByTestId('section-action')).toBeInTheDocument();
  });

  it('passes data-testid', () => {
    render(
      <SideNavSection title="Main" data-testid="nav-section">
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    expect(screen.getByTestId('nav-section')).toBeInTheDocument();
  });

  it('forwards className to root element', () => {
    render(
      <SideNavSection title="Main" className="custom-section">
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    const group = screen.getByRole('group');
    expect(group.className).toContain('custom-section');
  });

  it('forwards style to root element', () => {
    render(
      <SideNavSection title="Main" style={{marginTop: 16}}>
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    const group = screen.getByRole('group');
    expect(group.style.marginTop).toBe('16px');
  });

  it('forwards arbitrary pass-through attributes (id, aria-*) to root element', () => {
    render(
      <SideNavSection title="Main" id="section-1" aria-describedby="hint">
        <SideNavItem label="Dashboard" />
      </SideNavSection>,
    );
    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('id', 'section-1');
    expect(group).toHaveAttribute('aria-describedby', 'hint');
  });
});

// =============================================================================
// Resizable
// =============================================================================

describe('SideNav resizable', () => {
  it('renders drag handle when resizable', () => {
    render(<SideNav resizable>Content</SideNav>);
    expect(
      screen.getByTestId('astryx-sidenav-resize-handle'),
    ).toBeInTheDocument();
  });

  it('names the nav it resizes with aria-controls (APG window splitter)', () => {
    render(<SideNav resizable>Content</SideNav>);
    const nav = screen.getByRole('navigation');
    const handle = screen.getByRole('separator');
    expect(nav.id).not.toBe('');
    expect(handle).toHaveAttribute('aria-controls', nav.id);
  });

  it("keeps a consumer's nav id and points the handle at it", () => {
    render(
      <SideNav resizable id="primary-nav">
        Content
      </SideNav>,
    );
    expect(screen.getByRole('navigation')).toHaveAttribute('id', 'primary-nav');
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-controls',
      'primary-nav',
    );
  });

  it('keeps the generated nav id when a wrapper forwards id={undefined}', () => {
    render(
      <SideNav resizable id={undefined}>
        Content
      </SideNav>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav.id).not.toBe('');
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-controls',
      nav.id,
    );
  });

  it('clips the overlay drag handle within the resizable nav bounds', () => {
    render(<SideNav resizable>Content</SideNav>);
    const nav = screen.getByRole('navigation');
    const container = nav.parentElement;
    const handle = screen.getByTestId('astryx-sidenav-resize-handle');

    expect(container).toContainElement(handle);
    expect(getComputedStyle(container!).overflow).toBe('clip');
  });

  it('does not render drag handle without resizable', () => {
    render(<SideNav>Content</SideNav>);
    expect(
      screen.queryByTestId('astryx-sidenav-resize-handle'),
    ).not.toBeInTheDocument();
  });

  it('does not render drag handle when collapsed', () => {
    render(
      <SideNav
        resizable
        collapsible={{isCollapsed: true, onCollapsedChange: () => {}}}>
        Content
      </SideNav>,
    );
    expect(
      screen.queryByTestId('astryx-sidenav-resize-handle'),
    ).not.toBeInTheDocument();
  });

  it('calls onWidthChange after drag', () => {
    const handleWidthChange = vi.fn();
    render(
      <SideNav resizable={{onWidthChange: handleWidthChange}}>Content</SideNav>,
    );
    const handle = screen.getByTestId('astryx-sidenav-resize-handle');
    // The pointer event handler is on the hit area child inside the handle.
    const hitArea = handle.firstElementChild as HTMLElement;

    act(() => {
      fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 260});
      fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: 310});
      fireEvent.pointerUp(hitArea, {pointerId: 1, clientX: 310});
    });

    expect(handleWidthChange).toHaveBeenCalledTimes(1);
    expect(handleWidthChange).toHaveBeenCalledWith(expect.any(Number));
  });

  it('respects defaultWidth', () => {
    render(<SideNav resizable={{defaultWidth: 300}}>Content</SideNav>);
    const nav = screen.getByRole('navigation');
    expect(nav.style.width).toBe('300px');
  });

  it('drag handle has separator role', () => {
    render(<SideNav resizable>Content</SideNav>);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});

// =============================================================================
// Integration
// =============================================================================

describe('SideNav integration', () => {
  it('renders a complete page nav', () => {
    render(
      <SideNav
        header={<SideNavHeading heading="My App" />}
        topContent={<button type="button">Create</button>}
        footer={<div data-testid="promo">Promo</div>}
        footerIcons={<button type="button">Help</button>}>
        <SideNavSection title="Main">
          <SideNavItem label="Dashboard" isSelected />
          <SideNavItem label="Projects" />
        </SideNavSection>
        <SideNavSection title="Settings">
          <SideNavItem label="General" />
        </SideNavSection>
      </SideNav>,
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('My App')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByTestId('promo')).toBeInTheDocument();
  });
});

// Stub icon for testing
const StubIcon = () => <svg data-testid="stub-icon" />;

/** Helper to render inside a collapsed SideNav context */
function renderCollapsed(ui: React.ReactElement) {
  return render(
    <SideNavCollapseContext
      value={{isCollapsed: true, toggle: () => {}, isCollapsible: true}}>
      {ui}
    </SideNavCollapseContext>,
  );
}

/** Helper to render inside an expanded SideNav context */
function renderExpanded(ui: React.ReactElement) {
  return render(
    <SideNavCollapseContext
      value={{isCollapsed: false, toggle: () => {}, isCollapsible: true}}>
      {ui}
    </SideNavCollapseContext>,
  );
}

// =============================================================================
// SideNavItem — Collapsed mode
// =============================================================================

describe('SideNavItem (collapsed)', () => {
  it('hides items without icons when collapsed', () => {
    const {container} = renderCollapsed(<SideNavItem label="No Icon Item" />);
    expect(screen.queryByText('No Icon Item')).not.toBeInTheDocument();
    expect(container.querySelector('[data-xds="side-nav-item"]')).toBeNull();
  });

  it('renders icon-only button when collapsed with icon and no children', () => {
    renderCollapsed(
      <SideNavItem label="Dashboard" icon={StubIcon} data-testid="item" />,
    );
    // Should have an element with aria-label (icon-only)
    const item = screen.getByLabelText('Dashboard');
    expect(item).toBeInTheDocument();
    // Icon should be rendered
    expect(screen.getByTestId('stub-icon')).toBeInTheDocument();
  });

  it('renders collapsed link when href is provided', () => {
    renderCollapsed(
      <SideNavItem label="Dashboard" icon={StubIcon} href="/dashboard" />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/dashboard');
    expect(link).toHaveAttribute('aria-label', 'Dashboard');
  });

  it('renders popover trigger when collapsed with icon and children', () => {
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" />
        <SideNavItem label="Security" />
      </SideNavItem>,
    );
    const trigger = screen.getByTestId('parent');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-label', 'Settings');
  });

  describe('consumer aria-label (#5641)', () => {
    it('keeps a consumer aria-label on the collapsed link, instead of falling back to label', () => {
      renderCollapsed(
        <SideNavItem
          label="Home"
          icon={StubIcon}
          href="/home"
          aria-label="Open Home, 3 items need attention"
        />,
      );
      expect(screen.getByRole('link')).toHaveAttribute(
        'aria-label',
        'Open Home, 3 items need attention',
      );
    });

    it('keeps a consumer aria-label on the collapsed button, instead of falling back to label', () => {
      renderCollapsed(
        <SideNavItem
          label="Home"
          icon={StubIcon}
          aria-label="Open Home, 3 items need attention"
        />,
      );
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Open Home, 3 items need attention',
      );
    });

    it('keeps a consumer aria-label on the collapsed popover trigger, instead of falling back to label', () => {
      renderCollapsed(
        <SideNavItem
          label="Settings"
          icon={StubIcon}
          data-testid="parent"
          aria-label="Settings, 2 updates available">
          <SideNavItem label="General" />
        </SideNavItem>,
      );
      expect(screen.getByTestId('parent')).toHaveAttribute(
        'aria-label',
        'Settings, 2 updates available',
      );
    });

    it('falls back to label when a consumer aria-label is empty or whitespace', () => {
      const {rerender} = renderCollapsed(
        <SideNavItem
          label="Dashboard"
          icon={StubIcon}
          href="/dashboard"
          aria-label=""
        />,
      );
      expect(screen.getByRole('link')).toHaveAttribute(
        'aria-label',
        'Dashboard',
      );

      rerender(
        <SideNavCollapseContext value={COLLAPSED_CONTEXT}>
          <SideNavItem label="Dashboard" icon={StubIcon} aria-label="   " />
        </SideNavCollapseContext>,
      );
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Dashboard',
      );
    });

    it('still falls back to label when no consumer aria-label is given', () => {
      renderCollapsed(
        <SideNavItem label="Dashboard" icon={StubIcon} href="/dashboard" />,
      );
      expect(screen.getByRole('link')).toHaveAttribute(
        'aria-label',
        'Dashboard',
      );
    });
  });

  it('opens popover on click showing children in expanded form', async () => {
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" data-testid="child-general" />
        <SideNavItem label="Security" data-testid="child-security" />
      </SideNavItem>,
    );
    await user.click(screen.getByTestId('parent'));

    // Children should be visible in expanded form (label text visible)
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('shows parent label as header in the popover', async () => {
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" />
      </SideNavItem>,
    );
    await user.click(screen.getByTestId('parent'));
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not render children without icon when collapsed', () => {
    renderCollapsed(
      <SideNavItem label="Settings">
        <SideNavItem label="General" />
        <SideNavItem label="Security" />
      </SideNavItem>,
    );
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('General')).not.toBeInTheDocument();
  });

  it('renders normally when not collapsed', () => {
    renderExpanded(
      <SideNavItem label="Dashboard" icon={StubIcon}>
        <SideNavItem label="General" />
      </SideNavItem>,
    );
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});

// =============================================================================
// SideNavItem — collapsed submenu hover intent (useMenuHover adoption, C12)
// =============================================================================

/**
 * Pin the ambient pointer modality: the global `matchMedia` stub never
 * matches, which reads as a coarse pointer, so hover assertions must opt in.
 */
function stubPointerModality(modality: 'fine' | 'coarse') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: modality === 'fine' && query.includes('hover: hover'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** The hook's hover-intent delays: 150 ms to show, 200 ms to hide. */
const SHOW_DELAY = 150;
const HIDE_DELAY = 200;

describe('SideNavItem — collapsed submenu hover intent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderFlyout() {
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
        <SideNavItem label="Security" href="/settings/security" />
      </SideNavItem>,
    );
    return screen.getByTestId('parent');
  }

  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it('opens the flyout only after the hover-intent delay', () => {
    stubPointerModality('fine');
    vi.useFakeTimers();
    const trigger = renderFlyout();

    fireEvent.mouseEnter(trigger);
    // A pointer merely passing over the icon must not open anything.
    advance(SHOW_DELAY - 1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    advance(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes a hover-opened flyout when the pointer leaves', () => {
    stubPointerModality('fine');
    vi.useFakeTimers();
    const trigger = renderFlyout();

    fireEvent.mouseEnter(trigger);
    advance(SHOW_DELAY);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseLeave(trigger);
    advance(HIDE_DELAY);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps a click-opened flyout open when the pointer leaves', () => {
    stubPointerModality('fine');
    vi.useFakeTimers();
    const trigger = renderFlyout();

    // `detail: 1` marks a pointer click: the hook reads a detail-0 click as
    // Enter/Space, which always opens rather than toggling.
    fireEvent.click(trigger, {detail: 1});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Clicking is a commitment: the flyout outlives the pointer.
    fireEvent.mouseLeave(trigger);
    advance(HIDE_DELAY * 2);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not spring back open when a click dismisses it under a stationary pointer', () => {
    stubPointerModality('fine');
    vi.useFakeTimers();
    const trigger = renderFlyout();

    fireEvent.mouseEnter(trigger);
    advance(SHOW_DELAY);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The pointer never left, so dismissing fires a fresh mouseenter as the
    // flyout unmounts — which used to reopen what the user just closed.
    fireEvent.click(trigger, {detail: 1});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.mouseEnter(trigger);
    advance(SHOW_DELAY);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // One-shot, not a latch: a deliberate leave-and-return opens it again.
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(trigger);
    advance(SHOW_DELAY);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('schedules no hover timers on a coarse pointer', () => {
    stubPointerModality('coarse');
    vi.useFakeTimers();
    const trigger = renderFlyout();

    // A touch tap synthesises mouseenter. On a device that cannot hover there
    // is no hover intent to read, so nothing may be scheduled from it.
    fireEvent.mouseEnter(trigger);
    expect(vi.getTimerCount()).toBe(0);

    advance(SHOW_DELAY * 2);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Tapping still opens it — the touch path goes through click, untouched.
    fireEvent.click(trigger, {detail: 1});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not open the hover popover after the item unmounts', () => {
    stubPointerModality('fine');
    vi.useFakeTimers();
    const {unmount} = render(
      <SideNavCollapseContext
        value={{isCollapsed: true, toggle: () => {}, isCollapsible: true}}>
        <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
          <SideNavItem label="General" href="/settings/general" />
        </SideNavItem>
      </SideNavCollapseContext>,
    );

    fireEvent.mouseEnter(screen.getByTestId('parent'));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    // The hook owns the timer cleanup now; it still has to hold.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves arrow keys in the flyout to the browser', async () => {
    stubPointerModality('fine');
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
        <SideNavItem label="Security" href="/settings/security" />
      </SideNavItem>,
    );

    const trigger = screen.getByTestId('parent');
    await user.click(trigger);

    // The flyout renders as a native popover, which jsdom leaves
    // `display: none`, so its contents are outside the default a11y-tree
    // queries.
    const first = screen.getByRole('link', {name: 'General', hidden: true});
    first.focus();

    // A dialog of links, not a menu of menuitems: wiring the hook's
    // list-focus half would preventDefault every arrow key and find no
    // `[role="menuitem"]` to move to.
    const notPrevented = fireEvent.keyDown(first, {key: 'ArrowDown'});
    expect(notPrevented).toBe(true);
    expect(first).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens from the keyboard, moves focus into the flyout, and restores it on Escape', async () => {
    stubPointerModality('fine');
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
        <SideNavItem label="Security" href="/settings/security" />
      </SideNavItem>,
    );

    const trigger = screen.getByTestId('parent');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Keyboard opens move focus in; hover opens leave it on the trigger.
    await waitFor(() =>
      expect(
        screen.getByRole('link', {name: 'General', hidden: true}),
      ).toHaveFocus(),
    );

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('leaves focus on the trigger when hover opens the flyout', () => {
    stubPointerModality('fine');
    vi.useFakeTimers();
    const trigger = renderFlyout();
    trigger.focus();

    fireEvent.mouseEnter(trigger);
    advance(SHOW_DELAY);
    act(() => {
      vi.advanceTimersToNextFrame();
    });

    // `skipAutoFocus`: a mid-hover pointer user keeps their caret.
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveFocus();
  });
});

// =============================================================================
// Mobile nav close-on-activate
// =============================================================================

// =============================================================================
// SideNavItem — collapsible + href (independent toggle)
// =============================================================================

describe('SideNavItem — collapsible + href', () => {
  it('renders a link that navigates when both collapsible and href are set', () => {
    render(
      <SideNavItem
        label="Settings"
        href="/settings"
        collapsible
        data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    const link = screen.getByRole('link', {name: 'Settings'});
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('renders a separate toggle button for the chevron', () => {
    render(
      <SideNavItem label="Settings" href="/settings" collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    const toggle = screen.getByRole('button', {name: /collapse settings/i});
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggle button collapses children without navigating', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Settings" href="/settings" collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    const toggle = screen.getByRole('button', {name: /collapse settings/i});
    await user.click(toggle);
    // After collapsing, aria-hidden on children container
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('Expand Settings');
  });

  it('link does not toggle collapse when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <SideNavItem
        label="Settings"
        href="/settings"
        collapsible
        onClick={onClick}>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    const link = screen.getByRole('link', {name: 'Settings'});
    await user.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
    // Children should still be visible (not collapsed)
    const toggle = screen.getByRole('button', {name: /collapse settings/i});
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('link does not have aria-expanded (toggle button owns it)', () => {
    render(
      <SideNavItem label="Settings" href="/settings" collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    const link = screen.getByRole('link', {name: 'Settings'});
    expect(link).not.toHaveAttribute('aria-expanded');
  });

  it('without href or onClick, clicking the item toggles collapse', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Settings" collapsible>
        <SideNavItem label="General" />
      </SideNavItem>,
    );
    const button = screen.getByRole('button', {name: 'Settings'});
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('with onClick (no href), clicking the label fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <SideNavItem label="Settings" onClick={onClick} collapsible>
        <SideNavItem label="General" />
      </SideNavItem>,
    );
    const primaryButton = screen.getByRole('button', {name: 'Settings'});
    await user.click(primaryButton);
    expect(onClick).toHaveBeenCalledTimes(1);
    // Children should still be visible
    const toggle = screen.getByRole('button', {name: /collapse settings/i});
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('with onClick (no href), toggle collapses without firing onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <SideNavItem label="Settings" onClick={onClick} collapsible>
        <SideNavItem label="General" />
      </SideNavItem>,
    );
    const toggle = screen.getByRole('button', {name: /collapse settings/i});
    await user.click(toggle);
    expect(onClick).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('collapsed children are inert (not focusable)', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Settings" collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    // Collapse the item
    const button = screen.getByRole('button', {name: 'Settings'});
    await user.click(button);
    // The children container should have inert attribute
    const childrenContainer = document.getElementById(
      button.getAttribute('aria-controls')!,
    );
    expect(childrenContainer).toHaveAttribute('inert');
  });
});

// =============================================================================
// SideNavItem — actions slot (row-level secondary controls, #4988)
// =============================================================================

describe('SideNavItem — actions slot', () => {
  const rowAction = (onClick?: (e: React.MouseEvent) => void) => (
    <button type="button" data-testid="row-action" onClick={onClick}>
      ⋯
    </button>
  );

  it('renders actions outside the primary interactive element', () => {
    render(
      <SideNavItem label="Project" href="/project" actions={rowAction()} />,
    );
    const action = screen.getByTestId('row-action');
    const link = screen.getByRole('link', {name: 'Project'});
    // Sibling, not nested: the action's closest interactive element is itself.
    expect(within(link).queryByTestId('row-action')).toBeNull();
    expect(action.closest('a, button')).toBe(action);
  });

  it('places actions after the primary element and before nested children', () => {
    render(
      <SideNavItem
        label="Project"
        href="/project"
        collapsible
        actions={rowAction()}>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>,
    );
    const primary = screen.getByRole('link', {name: 'Project'});
    const action = screen.getByTestId('row-action');
    const group = screen.getByRole('group');
    // Compare real node positions, not serialized markup.
    expect(
      primary.compareDocumentPosition(action) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      action.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('reaches every row-level control before nested items when tabbing', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem
        label="Project"
        href="/project"
        collapsible
        actions={rowAction()}>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>,
    );
    await user.tab();
    expect(screen.getByRole('link', {name: 'Project'})).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('button', {name: /collapse project/i}),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('row-action')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', {name: 'Session'})).toHaveFocus();
  });

  it('clicking an action does not activate the item', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    const onActionClick = vi.fn();
    render(
      <SideNavItem
        label="Project"
        onClick={onItemClick}
        actions={rowAction(onActionClick)}
      />,
    );
    await user.click(screen.getByTestId('row-action'));
    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it('clicking an action does not toggle collapse of a whole-row toggle item', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Project" collapsible actions={rowAction()}>
        <SideNavItem label="Session" />
      </SideNavItem>,
    );
    const rowToggle = screen.getByRole('button', {name: 'Project'});
    expect(rowToggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByTestId('row-action'));
    expect(rowToggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('whole-row toggle still collapses when actions are present', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Project" collapsible actions={rowAction()}>
        <SideNavItem label="Session" />
      </SideNavItem>,
    );
    expect(screen.getByTestId('row-action')).toBeInTheDocument();
    const rowToggle = screen.getByRole('button', {name: 'Project'});
    await user.click(rowToggle);
    expect(rowToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('adds a row wrapper only when actions are present', () => {
    const {unmount} = render(<SideNavItem label="Project" href="/project" />);
    // Without actions, the link itself is the styled row element.
    expect(screen.getByRole('link', {name: 'Project'})).toHaveClass(
      'astryx-side-nav-item',
    );
    unmount();

    render(
      <SideNavItem
        label="Project"
        href="/project"
        data-testid="row"
        actions={rowAction()}
      />,
    );
    // With actions, a wrapper div is the styled row; the link sits inside it.
    const link = screen.getByRole('link', {name: 'Project'});
    expect(link).not.toHaveClass('astryx-side-nav-item');
    const row = screen.getByTestId('row');
    expect(row).toHaveClass('astryx-side-nav-item');
    expect(row).toContainElement(link);
    expect(row).toContainElement(screen.getByTestId('row-action'));
  });

  it('adds no row wrapper for a falsy actions value', () => {
    // `actions={canEdit ? <Menu /> : null}` is the ordinary consumer shape.
    // A wrapper there would change markup, focus order and the ring's
    // owner for a row that has no row controls at all.
    const {rerender} = render(
      <SideNavItem label="Project" href="/project" actions={null} />,
    );
    expect(screen.getByRole('link', {name: 'Project'})).toHaveClass(
      'astryx-side-nav-item',
    );

    rerender(<SideNavItem label="Project" href="/project" actions={false} />);
    expect(screen.getByRole('link', {name: 'Project'})).toHaveClass(
      'astryx-side-nav-item',
    );
  });

  it('keeps aria wiring on the toggle when actions are present', () => {
    render(
      <SideNavItem
        label="Project"
        href="/project"
        collapsible
        actions={rowAction()}>
        <SideNavItem label="Session" />
      </SideNavItem>,
    );
    expect(screen.getByTestId('row-action')).toBeInTheDocument();
    const toggle = screen.getByRole('button', {name: /collapse project/i});
    const group = screen.getByRole('group');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', group.id);
    expect(screen.getByRole('link', {name: 'Project'})).not.toHaveAttribute(
      'aria-expanded',
    );
  });

  it('keeps endContent inside the primary element when actions are present', () => {
    render(
      <SideNavItem
        label="Project"
        href="/project"
        endContent={<span data-testid="badge">3</span>}
        actions={rowAction()}
      />,
    );
    const link = screen.getByRole('link', {name: /Project/});
    expect(within(link).getByTestId('badge')).toBeInTheDocument();
    expect(within(link).queryByTestId('row-action')).toBeNull();
    expect(screen.getByTestId('row-action')).toBeInTheDocument();
  });

  it('keeps collapsed children inert while the action stays in the row', () => {
    render(
      <SideNavItem
        label="Project"
        collapsible={{defaultIsCollapsed: true}}
        actions={rowAction()}>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>,
    );
    const rowToggle = screen.getByRole('button', {name: 'Project'});
    const group = document.getElementById(
      rowToggle.getAttribute('aria-controls')!,
    );
    expect(group).toHaveAttribute('inert');
    expect(screen.getByTestId('row-action')).toBeInTheDocument();
  });

  it('does not render actions in the collapsed rail', () => {
    const {unmount} = renderCollapsed(
      <SideNavItem
        label="Project"
        icon={StubIcon}
        href="/project"
        actions={rowAction()}
      />,
    );
    expect(screen.getByLabelText('Project')).toBeInTheDocument();
    expect(screen.queryByTestId('row-action')).toBeNull();
    unmount();

    renderCollapsed(
      <SideNavItem label="Project" icon={StubIcon} actions={rowAction()}>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>,
    );
    expect(screen.getByLabelText('Project')).toBeInTheDocument();
    expect(screen.queryByTestId('row-action')).toBeNull();
  });

  it('keeps actions clickable on a disabled item', async () => {
    const user = userEvent.setup();
    const onActionClick = vi.fn();
    render(
      <SideNavItem
        label="Project"
        href="/project"
        isDisabled
        actions={rowAction(onActionClick)}
      />,
    );
    // The row's disabled styling must not swallow the sibling action:
    // the action control owns its own disabled state.
    await user.click(screen.getByTestId('row-action'));
    expect(onActionClick).toHaveBeenCalledTimes(1);
  });

  it('places actions after the toggle when endContent is also present', () => {
    render(
      <SideNavItem
        label="Project"
        href="/project"
        collapsible
        endContent={<span data-testid="badge">3</span>}
        actions={rowAction()}>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>,
    );
    const link = screen.getByRole('link', {name: /Project/});
    const toggle = screen.getByRole('button', {name: /collapse project/i});
    const action = screen.getByTestId('row-action');
    expect(within(link).getByTestId('badge')).toBeInTheDocument();
    expect(
      link.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      toggle.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('reaches the action after the whole-row toggle and before nested items', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Project" collapsible actions={rowAction()}>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>,
    );
    await user.tab();
    expect(screen.getByRole('button', {name: 'Project'})).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('row-action')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', {name: 'Session'})).toHaveFocus();
  });

  it('renders the custom link component inside the row wrapper', () => {
    render(
      <LinkProvider component={CustomLink}>
        <SideNavItem label="Project" href="/project" actions={rowAction()} />
      </LinkProvider>,
    );
    const link = screen.getByRole('link', {name: 'Project'});
    expect(link).toHaveAttribute('data-custom-link');
    expect(link.parentElement).toHaveClass('astryx-side-nav-item');
  });

  it('controlled collapse reports toggle intent without flipping until the prop changes', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    render(
      <SideNavItem
        label="Project"
        href="/project"
        collapsible={{isCollapsed: false, onCollapsedChange}}
        actions={rowAction()}>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>,
    );
    const toggle = screen.getByRole('button', {name: /collapse project/i});
    await user.click(toggle);
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    // Controlled mode: stays expanded until the consumer flips the prop.
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

import {SideNavRenderContext} from './SideNavRenderContext';
import {AppShellMobileContext} from '../AppShell/AppShellMobileContext';

describe('SideNavItem — mobile drawer close-on-activate', () => {
  function renderInDrawer(ui: ReactNode, closeMobileNav = vi.fn()) {
    return {
      closeMobileNav,
      ...render(
        <AppShellMobileContext
          value={{
            isMobile: true,
            isMobileNavOpen: true,
            toggleMobileNav: vi.fn(),
            openMobileNav: vi.fn(),
            closeMobileNav,
            isMobileNavEnabled: true,
            hasAutoToggle: true,
          }}>
          <SideNavRenderContext value="drawer">{ui}</SideNavRenderContext>
        </AppShellMobileContext>,
      ),
    };
  }

  it('closes the mobile nav when a link item is clicked', async () => {
    const user = userEvent.setup();
    const {closeMobileNav} = renderInDrawer(
      <SideNavItem label="Home" href="/" data-testid="item" />,
    );
    await user.click(screen.getByTestId('item'));
    expect(closeMobileNav).toHaveBeenCalledTimes(1);
  });

  it('closes the mobile nav when a button item is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const {closeMobileNav} = renderInDrawer(
      <SideNavItem label="Action" onClick={onClick} data-testid="item" />,
    );
    await user.click(screen.getByTestId('item'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(closeMobileNav).toHaveBeenCalledTimes(1);
  });

  it('does NOT close when a collapsible parent is toggled', async () => {
    const user = userEvent.setup();
    const {closeMobileNav} = renderInDrawer(
      <SideNavItem
        label="Settings"
        icon={StubIcon}
        collapsible
        data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    await user.click(screen.getByTestId('parent'));
    expect(closeMobileNav).not.toHaveBeenCalled();
  });

  it('does NOT close when not inside a drawer', async () => {
    const user = userEvent.setup();
    const closeMobileNav = vi.fn();
    render(
      <AppShellMobileContext
        value={{
          isMobile: false,
          isMobileNavOpen: false,
          toggleMobileNav: vi.fn(),
          openMobileNav: vi.fn(),
          closeMobileNav,
          isMobileNavEnabled: false,
          hasAutoToggle: true,
        }}>
        <SideNavItem label="Home" href="/" data-testid="item" />
      </AppShellMobileContext>,
    );
    await user.click(screen.getByTestId('item'));
    expect(closeMobileNav).not.toHaveBeenCalled();
  });

  it('does not close the mobile nav when a row action is clicked', async () => {
    const user = userEvent.setup();
    const onActionClick = vi.fn();
    const {closeMobileNav} = renderInDrawer(
      <SideNavItem
        label="Home"
        href="/"
        actions={
          <button
            type="button"
            data-testid="drawer-row-action"
            onClick={onActionClick}>
            ⋯
          </button>
        }
      />,
    );
    await user.click(screen.getByTestId('drawer-row-action'));
    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(closeMobileNav).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Keyboard operation (audit §6 V6)
// =============================================================================

describe('SideNav keyboard operation', () => {
  it('reaches every nav item with Tab, in document order', async () => {
    const user = userEvent.setup();
    render(
      <SideNav>
        <SideNavSection title="Main">
          <SideNavItem label="Dashboard" href="/dashboard" />
          <SideNavItem label="Projects" href="/projects" />
          <SideNavItem label="Settings" onClick={() => {}} />
        </SideNavSection>
      </SideNav>,
    );

    await user.tab();
    expect(screen.getByRole('link', {name: 'Dashboard'})).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', {name: 'Projects'})).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'Settings'})).toHaveFocus();
  });

  it('skips a disabled item in the tab order', async () => {
    const user = userEvent.setup();
    render(
      <SideNav>
        <SideNavItem label="Dashboard" onClick={() => {}} />
        <SideNavItem label="Archived" onClick={() => {}} isDisabled />
        <SideNavItem label="Settings" onClick={() => {}} />
      </SideNav>,
    );

    await user.tab();
    expect(screen.getByRole('button', {name: 'Dashboard'})).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'Settings'})).toHaveFocus();
  });

  it('toggles a collapsible group with Enter and with Space', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Settings" onClick={() => {}} collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    const toggle = screen.getByRole('button', {name: 'Collapse Settings'});
    toggle.focus();

    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('activates a button item with Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SideNavItem label="Log out" onClick={onClick} />);

    await user.tab();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('opens the collapsed submenu from the keyboard and closes it with Escape', async () => {
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    const trigger = screen.getByTestId('parent');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

// =============================================================================
// Focus management (audit §6 V7)
// =============================================================================

/**
 * Holds requestAnimationFrame callbacks until `flush`, so a test decides when
 * a popover's auto-focus frame runs instead of racing a timer.
 */
function holdAnimationFrames() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame += 1;
    frames.set(nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => {
    frames.delete(frame);
  });
  return {
    flush() {
      act(() => {
        const due = [...frames.values()];
        frames.clear();
        due.forEach(callback => callback(performance.now()));
      });
    },
  };
}

describe('SideNav focus management', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps focus on the toggle when a group collapses', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Settings" href="/settings" collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    const toggle = screen.getByRole('button', {name: 'Collapse Settings'});
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('does not leave focus on a child that the group just hid', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem label="Settings" href="/settings" collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    const child = screen.getByRole('link', {name: 'General'});
    child.focus();

    const toggle = screen.getByRole('button', {name: 'Collapse Settings'});
    await user.click(toggle);

    // The collapsed group is `inert`: focus may land neither inside it nor
    // on <body>.
    expect(document.activeElement).not.toBe(child);
    expect(document.activeElement).not.toBe(document.body);
    expect(toggle).toHaveFocus();
  });

  it('returns focus to the trigger when the collapsed submenu closes', async () => {
    const frames = holdAnimationFrames();
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    const trigger = screen.getByTestId('parent');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // The submenu focuses its first link in the frame after it opens.
    frames.flush();
    expect(screen.getByText('General').closest('a')).toHaveFocus();

    // Closing restores focus as part of the close itself.
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('keeps focus on the trigger when the submenu closes before its first frame', async () => {
    const frames = holdAnimationFrames();
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    const trigger = screen.getByTestId('parent');
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // The open's auto-focus frame, late on a busy runner, must not land
    // focus in the closed submenu.
    frames.flush();
    expect(trigger).toHaveFocus();
  });
});

// =============================================================================
// Audit regressions — the defects this pass fixed
// =============================================================================

describe('SideNav audit regressions', () => {
  it('names the collapsed submenu dialog from the catalog, not a concatenation', async () => {
    const user = userEvent.setup();
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    await user.click(screen.getByTestId('parent'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog).toHaveAttribute('aria-label', 'Settings submenu');
  });

  it('translates the collapsed submenu dialog name', async () => {
    const user = userEvent.setup();
    render(
      <InternationalizationProvider
        locale="pseudo"
        messages={{pseudo: pseudoCatalog}}>
        <SideNavCollapseContext
          value={{isCollapsed: true, toggle: () => {}, isCollapsible: true}}>
          <SideNavItem label="Settings" icon={StubIcon} data-testid="parent">
            <SideNavItem label="General" href="/settings/general" />
          </SideNavItem>
        </SideNavCollapseContext>
      </InternationalizationProvider>,
    );

    await user.click(screen.getByTestId('parent'));
    const label = document
      .querySelector('[role="dialog"]')
      ?.getAttribute('aria-label');

    // A concatenated `${label} submenu` would stay plain English here.
    expect(label).toContain('Settings');
    expect(label).not.toBe('Settings submenu');
  });

  it('forwards unrecognised props on SideNavItem through to the control', () => {
    render(
      <SideNavItem
        label="Dashboard"
        href="/dashboard"
        data-analytics="nav-dashboard"
        aria-describedby="hint"
      />,
    );

    const link = screen.getByRole('link', {name: 'Dashboard'});
    expect(link).toHaveAttribute('data-analytics', 'nav-dashboard');
    expect(link).toHaveAttribute('aria-describedby', 'hint');
  });

  it('forwards unrecognised props on a collapsed SideNavItem', () => {
    renderCollapsed(
      <SideNavItem
        label="Dashboard"
        icon={StubIcon}
        href="/dashboard"
        data-analytics="nav-dashboard"
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'data-analytics',
      'nav-dashboard',
    );
  });

  it('exposes a disabled item as a theming state', () => {
    render(<SideNavItem label="Archived" onClick={() => {}} isDisabled />);

    expect(screen.getByRole('button', {name: 'Archived'})).toHaveAttribute(
      'data-disabled',
      'disabled',
    );
  });

  it('keeps a hidden section header readable by assistive technology', () => {
    render(
      <SideNavSection title="Main" isHeaderHidden>
        <SideNavItem label="Dashboard" href="/dashboard" />
      </SideNavSection>,
    );

    expect(screen.getByRole('group')).toHaveAccessibleName('Main');
    expect(screen.getByText('Main')).toBeInTheDocument();
  });

  it('keeps a SideNavCollapseButton outside the sidenav in step with it', async () => {
    const user = userEvent.setup();

    function App() {
      const [isCollapsed, setIsCollapsed] = useState(false);
      const collapsible = {isCollapsed, onCollapsedChange: setIsCollapsed};
      return (
        <>
          <SideNavCollapseButton collapsible={collapsible} />
          <SideNav collapsible={{...collapsible, hasButton: false}}>
            <SideNavItem label="Dashboard" href="/dashboard" />
          </SideNav>
        </>
      );
    }

    render(<App />);

    await user.click(screen.getByRole('button', {name: 'Collapse sidebar'}));
    const expand = await screen.findByRole('button', {name: 'Expand sidebar'});

    await user.click(expand);
    expect(
      await screen.findByRole('button', {name: 'Collapse sidebar'}),
    ).toBeInTheDocument();
  });
});

// =============================================================================
// A15 — the shared focus ring
//
// jsdom does not derive `:focus-visible` from `.focus()` for an element
// matched directly, so the ring a tab stop draws on itself cannot be read
// back here; the geometry is measured in a real browser instead. These pin
// the composition — that the focusable element carries the classes
// `focusOutlineStyles.focusVisible` compiles to.
//
// Composition is only proof for a tab stop. A row wrapper is not one, so
// `:focus-visible` atoms sitting on it can never match, and asserting them
// there proves nothing: the actions-row tests below passed with the
// wrapper's ring deleted outright. A wrapper's ring is guarded by `:has()`,
// which jsdom *does* re-evaluate against live focus, so those rules are read
// out of the stylesheet and matched against the DOM instead.
// =============================================================================

const sharedFocusRingClasses = stylex
  .props(focusOutlineStyles.focusVisible)
  .className!.split(' ');

function expectSharedFocusRing(el: Element) {
  const classes = el.className.split(' ');
  for (const c of sharedFocusRingClasses) {
    expect(classes).toContain(c);
  }
}

function expectNoSharedFocusRing(el: Element) {
  const classes = el.className.split(' ');
  for (const c of sharedFocusRingClasses) {
    expect(classes).not.toContain(c);
  }
}

/** Every style rule in the live sheet, flattened out of any grouping rule. */
function allStyleRules(): CSSStyleRule[] {
  const out: CSSStyleRule[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested) {
        walk(nested);
      }
      if ((rule as CSSStyleRule).selectorText) {
        out.push(rule as CSSStyleRule);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      // A sheet we cannot read cannot be one StyleX injected.
    }
  }
  return out;
}

/**
 * A rule's declared value for `prop`, read out of its text.
 *
 * Not `rule.style`: these values are `var()`s, and jsdom's CSS object model
 * drops longhands it cannot parse, so they read back as an empty string there.
 */
function declaredValue(rule: CSSStyleRule, prop: string): string | undefined {
  const body = /\{([^}]*)\}/.exec(rule.cssText)?.[1] ?? '';
  return new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(body)?.[1].trim();
}

/** A rule's `outline-style` — the discriminator for a painting focus ring. */
function outlineStyleOf(rule: CSSStyleRule): string | undefined {
  return declaredValue(rule, 'outline-style');
}

/**
 * What the live sheet unconditionally declares for `prop` on `el`, gathered
 * from every bare-class rule the element carries. StyleX emits one atomic
 * class per property, so a well-formed element yields exactly one value —
 * comparing those values compares real CSS without pinning a generated hash.
 */
function declaredOn(el: Element, prop: string): string[] {
  const classes = new Set(el.className.split(' '));
  return allStyleRules()
    .filter(rule => {
      const bare = rule.selectorText.replace(/:not\(#\\?#\)/g, '');
      const owner = /^\.([^:\s]+)$/.exec(bare)?.[1];
      return owner != null && classes.has(owner);
    })
    .map(rule => declaredValue(rule, prop))
    .filter(value => value != null);
}

/**
 * The nesting indent a row carries, or null for none. The indent is a
 * runtime StyleX value, so it rides the row's inline style as a custom
 * property; read the value rather than the generated property name.
 */
function indentOf(el: HTMLElement): string | null {
  const {style} = el;
  for (let i = 0; i < style.length; i++) {
    const value = style.getPropertyValue(style[i]).trim();
    if (value.includes('var(--spacing-6)')) {
      return value;
    }
  }
  return null;
}

/**
 * The selectors that actually paint the shared ring on `el`, read out of the
 * live stylesheet with StyleX's `:not(#\#)` specificity padding stripped so
 * jsdom can evaluate them.
 *
 * `outline-style` is the discriminator: StyleX emits one rule per property,
 * and no outline paints while that one resolves to `none`.
 */
function ringSelectorsFor(el: Element): string[] {
  const classes = new Set(el.className.split(' '));
  return allStyleRules()
    .filter(rule => {
      const painted = outlineStyleOf(rule);
      if (!painted || painted === 'none') {
        return false;
      }
      const owner = /^\.([^:\s]+)/.exec(rule.selectorText)?.[1];
      return owner != null && classes.has(owner);
    })
    .map(rule => rule.selectorText.replace(/:not\(#\\?#\)/g, ''));
}

/**
 * Whether `el`'s ring is painting for whatever holds focus right now.
 *
 * `:focus-visible` is substituted with `:focus` before matching. jsdom
 * derives `:focus-visible` from a heuristic over the last interaction, so it
 * answers differently depending on which tests ran before — the same
 * assertion passes alone and fails in the file. `:focus` is unambiguous, and
 * the ring's modality is pinned separately, on the selector text, by the
 * keyboard-only test below.
 */
function ringIsPainting(el: Element): boolean {
  return ringSelectorsFor(el).some(selector =>
    el.matches(selector.replace(/:focus-visible/g, ':focus')),
  );
}

/**
 * Whether `el` unconditionally declares `outline-style: none`, which is what
 * keeps the UA's own focus ring off an element whose ring an ancestor paints.
 * Computed style cannot answer this: `none` is also the CSS initial value.
 */
function suppressesOwnOutline(el: Element): boolean {
  const classes = new Set(el.className.split(' '));
  return allStyleRules().some(rule => {
    if (outlineStyleOf(rule) !== 'none') {
      return false;
    }
    // Unconditional only — a bare class once the padding is stripped.
    const bare = rule.selectorText.replace(/:not\(#\\?#\)/g, '');
    const owner = /^\.([^:\s]+)$/.exec(bare)?.[1];
    return owner != null && classes.has(owner);
  });
}

describe('SideNav focus ring (A15)', () => {
  it('draws the shared ring on a link item', () => {
    render(<SideNavItem label="Dashboard" href="/dashboard" />);
    expectSharedFocusRing(screen.getByRole('link', {name: 'Dashboard'}));
  });

  it('draws the shared ring on a button item', () => {
    render(<SideNavItem label="Dashboard" onClick={() => {}} />);
    expectSharedFocusRing(screen.getByRole('button', {name: 'Dashboard'}));
  });

  it('draws the shared ring on a collapsed icon-only item', () => {
    renderCollapsed(
      <SideNavItem label="Dashboard" icon={StubIcon} href="/dashboard" />,
    );
    expectSharedFocusRing(screen.getByRole('link', {name: 'Dashboard'}));
  });

  it('draws the shared ring on a collapsed submenu trigger', () => {
    renderCollapsed(
      <SideNavItem label="Settings" icon={StubIcon}>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );
    expectSharedFocusRing(screen.getByRole('button', {name: 'Settings'}));
  });

  it('rings each focusable of a split-action row, and not the row itself', () => {
    render(
      <SideNavItem label="Settings" href="/settings" collapsible>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    const link = screen.getByRole('link', {name: 'Settings'});
    const toggle = screen.getByRole('button', {name: 'Collapse Settings'});
    expectSharedFocusRing(link);
    expectSharedFocusRing(toggle);

    // A presentational <div> holding two independent tab stops; ringing it
    // too would paint a second outline around the whole row.
    const row = link.parentElement!;
    expect(row.tagName).toBe('DIV');
    expect(row).toContainElement(toggle);
    expectNoSharedFocusRing(row);
  });

  it('rings the row wrapper of an actions row, not the truncated primary', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem
        label="Project"
        href="/project"
        actions={
          <button type="button" data-testid="row-action">
            More
          </button>
        }
      />,
    );

    const link = screen.getByRole('link', {name: 'Project'});
    const row = link.parentElement!;
    expect(row.tagName).toBe('DIV');
    expect(row).toContainElement(screen.getByTestId('row-action'));

    // Same pill as an ordinary row: the ring lives on the wrapper, whose box
    // includes the actions. Putting it on the primary would clip to the
    // truncated split-action element (square, not full-row).
    expect(ringIsPainting(row)).toBe(false);
    await user.tab();
    expect(link).toHaveFocus();
    expect(ringIsPainting(row)).toBe(true);
    // And exactly one ring: nothing paints a second one on the primary.
    expect(ringSelectorsFor(link)).toEqual([]);
  });

  it('leaves the wrapper ring to the primary, not the chevron toggle', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem
        label="Settings"
        href="/settings"
        collapsible
        actions={
          <button type="button" data-testid="row-action">
            More
          </button>
        }>
        <SideNavItem label="General" href="/settings/general" />
      </SideNavItem>,
    );

    const link = screen.getByRole('link', {name: 'Settings'});
    const toggle = screen.getByRole('button', {name: 'Collapse Settings'});
    const row = link.parentElement!;
    expect(row).toContainElement(screen.getByTestId('row-action'));

    await user.tab();
    expect(link).toHaveFocus();
    expect(ringIsPainting(row)).toBe(true);

    // The toggle owns its own ring, as it does in a split-action row with no
    // actions. Keeping the wrapper lit too would stack a full-row outline
    // around the chevron's own — two rings for one tab stop.
    await user.tab();
    expect(toggle).toHaveFocus();
    expectSharedFocusRing(toggle);
    expect(ringIsPainting(row)).toBe(false);
  });

  it('does not ring the row wrapper when a supplied action takes focus', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem
        label="Project"
        href="/project"
        actions={
          <button type="button" data-testid="row-action">
            More
          </button>
        }
      />,
    );

    const row = screen.getByRole('link', {name: 'Project'}).parentElement!;
    await user.tab();
    expect(ringIsPainting(row)).toBe(true);

    // An action draws whatever ring its own component draws. Focus is not on
    // the row, so the row must not light up around it.
    await user.tab();
    expect(screen.getByTestId('row-action')).toHaveFocus();
    expect(ringIsPainting(row)).toBe(false);
  });

  it('rings the wrapper of a whole-row toggle carrying actions', async () => {
    const user = userEvent.setup();
    render(
      <SideNavItem
        label="Project"
        collapsible
        actions={
          <button type="button" data-testid="row-action">
            More
          </button>
        }>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>,
    );

    // No href and no onClick, so the primary *is* the collapse toggle and
    // keeps the chevron inside it — a different row shape from the split.
    const primary = screen.getByRole('button', {name: 'Project'});
    const row = primary.parentElement!;

    await user.tab();
    expect(primary).toHaveFocus();
    expect(ringIsPainting(row)).toBe(true);

    await user.tab();
    expect(screen.getByTestId('row-action')).toHaveFocus();
    expect(ringIsPainting(row)).toBe(false);
  });

  it('keeps the UA focus ring off the primary the wrapper rings for', () => {
    render(
      <SideNavItem
        label="Project"
        href="/project"
        actions={
          <button type="button" data-testid="row-action">
            More
          </button>
        }
      />,
    );

    const link = screen.getByRole('link', {name: 'Project'});
    // Dropping the shared ring off the primary also drops the
    // `outline-style: none` default that came with it, and a bare <a> keeps
    // the browser's own focus ring — which would paint inside the wrapper's.
    expect(suppressesOwnOutline(link)).toBe(true);
  });

  it('paints the actions-row ring for keyboard focus only', () => {
    render(
      <SideNavItem
        label="Project"
        href="/project"
        actions={
          <button type="button" data-testid="row-action">
            More
          </button>
        }
      />,
    );

    const link = screen.getByRole('link', {name: 'Project'});
    const row = link.parentElement!;
    // The wrapper is not a tab stop, so its ring has to be guarded by a
    // relational selector. `:focus-within` or `:focus` would light the row
    // for mouse users too; only `:focus-visible` keeps it to the keyboard.
    const selectors = ringSelectorsFor(row);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toContain(':focus-visible');
    }

    // The guard is scoped to the wrapper's first child. Reordering the row
    // would hand the ring to the toggle or the actions instead.
    expect(row.firstElementChild).toBe(link);
  });

  it('draws the shared ring on a heading rendered as one link', () => {
    render(<SideNavHeading heading="My App" headingHref="/" />);
    expectSharedFocusRing(screen.getByRole('link', {name: /My App/}));
  });

  it('draws the shared ring on a collapsed heading link', () => {
    renderCollapsed(
      <SideNavHeading heading="My App" headingHref="/" icon={<span>i</span>} />,
    );
    expectSharedFocusRing(screen.getByRole('link', {name: 'My App'}));
  });

  it('draws the shared ring on the heading menu trigger', () => {
    render(<SideNavHeading heading="My App" menu={<div>menu</div>} />);
    expectSharedFocusRing(screen.getByRole('button', {name: 'Open menu'}));
  });
});

// jsdom cannot emulate forced-colors rendering, so these assert that the
// compiled output carries the rules the selected row relies on. The rendered
// behaviour was measured in Chromium under `forced-colors: active` — see the
// evidence on #4880.
describe('forced colors (WCAG 1.4.11)', () => {
  it('compiles forced-colors overrides so the current page survives Windows High Contrast', () => {
    render(
      <SideNav>
        <SideNavSection title="Main">
          <SideNavItem label="Dashboard" href="/dashboard" isSelected />
          <SideNavItem label="Projects" href="/projects" />
        </SideNavSection>
      </SideNav>,
    );
    const css = getForcedColorsRules();
    // `--color-neutral` is a background: forced colors flatten it to Canvas
    // and the selected row loses every trace of being selected. Highlight /
    // HighlightText is the platform convention that survives.
    expect(css).toContain('background-color: highlight;');
    expect(css).toContain('color: highlighttext;');
    // The hover fill has to hold the Highlight too, or hovering the current
    // page repaints it with the ordinary hover overlay and erases the state.
    // Nesting it inside the hover media query is what wins that fight: the
    // rule compiles to a triple-class selector, which outranks `item`'s
    // single-class hover overlay no matter the source order.
    expect(css).toMatch(
      /@media \(hover: hover\)[\s\S]*?forced-colors: active[\s\S]*?:hover[\s\S]*?background-color: highlight/,
    );
  });

  it('does not opt nav rows out of UA colour remapping', () => {
    render(
      <SideNav>
        <SideNavSection title="Main">
          <SideNavItem label="Dashboard" href="/dashboard" isSelected />
        </SideNavSection>
      </SideNav>,
    );
    // A nav row is not a native form control — it resets `appearance` and
    // paints its own background, so the system keywords land without
    // `forced-color-adjust: none`. Setting it would inherit into
    // `endContent`, keeping a Badge's authored fill instead of remapping it.
    const row = screen.getByRole('link', {name: 'Dashboard'});
    expect(getComputedStyle(row).forcedColorAdjust).not.toBe('none');
  });
});

// =============================================================================
// Footer icon row — one size for the whole row
// =============================================================================

describe('SideNav footer icon row sizing', () => {
  /**
   * The class(es) a `size="sm"` Button carries that a `size="md"` one does
   * not — i.e. whatever StyleX compiled the sm height into. Comparing class
   * sets keeps the assertion off the generated hashes.
   */
  function sizeOnlyClasses(size: 'sm' | 'lg'): string[] {
    const {unmount} = render(
      <>
        <Button
          label="sized reference"
          size={size}
          isIconOnly
          icon={<span />}
          data-testid="sized-ref"
        />
        <Button
          label="md reference"
          size="md"
          isIconOnly
          icon={<span />}
          data-testid="md-ref"
        />
      </>,
    );
    const sized = new Set(screen.getByTestId('sized-ref').classList);
    const md = new Set(screen.getByTestId('md-ref').classList);
    const only = [...sized].filter(c => !md.has(c));
    unmount();
    // Guard against a vacuous pass: if the two sizes compiled to the same
    // classes there is nothing to assert and every check would trivially hold.
    expect(only.length).toBeGreaterThan(0);
    return only;
  }

  it('renders the built-in collapse button at the row size, not the Button default', () => {
    const smClasses = sizeOnlyClasses('sm');
    render(
      <SideNav collapsible>
        <SideNavSection title="Main">
          <SideNavItem label="Dashboard" href="/dashboard" />
        </SideNavSection>
      </SideNav>,
    );
    const collapseButton = screen.getByRole('button', {
      name: /collapse sidebar/i,
    });
    for (const className of smClasses) {
      expect(collapseButton).toHaveClass(className);
    }
  });

  it('cascades the same size to footerIcons the consumer did not size', () => {
    const smClasses = sizeOnlyClasses('sm');
    render(
      <SideNav
        collapsible
        footerIcons={
          <Button label="Help" isIconOnly icon={<span />} data-testid="help" />
        }>
        <SideNavSection title="Main">
          <SideNavItem label="Dashboard" href="/dashboard" />
        </SideNavSection>
      </SideNav>,
    );
    const help = screen.getByTestId('help');
    for (const className of smClasses) {
      expect(help).toHaveClass(className);
    }
  });

  it('lets an explicit size on a footer icon win over the cascade', () => {
    const lgClasses = sizeOnlyClasses('lg');
    render(
      <SideNav
        collapsible
        footerIcons={
          <Button
            label="Help"
            size="lg"
            isIconOnly
            icon={<span />}
            data-testid="help"
          />
        }>
        <SideNavSection title="Main">
          <SideNavItem label="Dashboard" href="/dashboard" />
        </SideNavSection>
      </SideNav>,
    );
    const help = screen.getByTestId('help');
    for (const className of lgClasses) {
      expect(help).toHaveClass(className);
    }
  });

  it('honours an explicit size on SideNavCollapseButton outside the nav', () => {
    const lgClasses = sizeOnlyClasses('lg');
    render(
      <SideNavCollapseContext
        value={{isCollapsed: false, toggle: () => {}, isCollapsible: true}}>
        <SideNavCollapseButton size="lg" data-testid="collapse" />
      </SideNavCollapseContext>,
    );
    const collapse = screen.getByTestId('collapse');
    for (const className of lgClasses) {
      expect(collapse).toHaveClass(className);
    }
  });

  it('centres the chevron instead of seating it on a text baseline', () => {
    renderExpanded(<SideNavCollapseButton data-testid="collapse" />);
    // Icon renders its own `astryx-icon` span around the svg; the RTL-mirror
    // wrapper this component adds is that span's parent.
    const iconSpan = screen
      .getByTestId('collapse')
      .querySelector('span.astryx-icon');
    const mirror = iconSpan?.parentElement;
    // The RTL-mirror wrapper is a flex item of Button's icon slot, so it
    // blockifies; as a block it gets a line box and the glyph sits on the
    // baseline, 2.42px above centre (measured in Chromium). A flex container
    // has no line box.
    expect(mirror && getComputedStyle(mirror).display).toBe('flex');
  });
});

describe('SideNav row control sizing', () => {
  /**
   * The height an icon-only `Button` of this size declares — the box every
   * control sharing a nav row is measured against.
   */
  function iconButtonHeight(size: 'sm' | 'md' | 'lg'): string[] {
    const {unmount} = render(
      <Button
        label="sized reference"
        size={size}
        isIconOnly
        icon={<span />}
        data-testid="sized-ref"
      />,
    );
    const height = declaredOn(screen.getByTestId('sized-ref'), 'height');
    unmount();
    // Guard against a vacuous pass: nothing below means anything if the
    // reference itself declares no height.
    expect(height).toHaveLength(1);
    return height;
  }

  function collapsibleRow(actions: ReactNode) {
    return (
      <SideNavItem
        label="Project"
        href="/project"
        collapsible
        actions={actions}>
        <SideNavItem label="Session" href="/project/session" />
      </SideNavItem>
    );
  }

  const iconAction = (props?: {size?: 'sm' | 'md' | 'lg'}) => (
    <Button
      label="Project actions"
      isIconOnly
      icon={<span />}
      data-testid="row-action"
      {...props}
    />
  );

  it('sizes the expand toggle like the icon buttons it sits beside', () => {
    const sm = iconButtonHeight('sm');
    render(collapsibleRow(iconAction()));
    const toggle = screen.getByRole('button', {name: /collapse project/i});
    expect(declaredOn(toggle, 'height')).toEqual(sm);
    // Square, so its hover pill reads as the same box as the action's.
    expect(declaredOn(toggle, 'width')).toEqual(sm);
  });

  it('cascades that size to an action the consumer did not size', () => {
    const sm = iconButtonHeight('sm');
    // Without the cascade an unsized Button falls back to `md`; if the two
    // compiled to one height the assertion below could not fail.
    expect(sm).not.toEqual(iconButtonHeight('md'));
    render(collapsibleRow(iconAction()));
    expect(declaredOn(screen.getByTestId('row-action'), 'height')).toEqual(sm);
  });

  it('lets an explicit size on an action win over the cascade', () => {
    const lg = iconButtonHeight('lg');
    render(collapsibleRow(iconAction({size: 'lg'})));
    expect(declaredOn(screen.getByTestId('row-action'), 'height')).toEqual(lg);
  });
});

describe('SideNavHeading hover/click guard', () => {
  // tabIndex={-1} matches real menu items; a bare role=menuitem div is not
  // focusable.
  const menuItems = (
    <>
      <div role="menuitem" tabIndex={-1}>
        Alpha
      </div>
      <div role="menuitem" tabIndex={-1}>
        Beta
      </div>
    </>
  );

  it('keeps the menu open when a hover-open is immediately clicked', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    render(<SideNavHeading heading="My App" menu={menuItems} />);
    const trigger = screen.getByRole('button', {name: 'Open menu'});

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    vi.useRealTimers();
  });

  it('closes on a click that lands well after the hover-open', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    render(<SideNavHeading heading="My App" menu={menuItems} />);
    const trigger = screen.getByRole('button', {name: 'Open menu'});

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    vi.useRealTimers();
  });

  it('leaves focus on the trigger for a hover-open, and moves it in on click', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    render(<SideNavHeading heading="My App" menu={menuItems} />);
    const trigger = screen.getByRole('button', {name: 'Open menu'});

    await user.hover(trigger);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const firstItem = screen.getAllByRole('menuitem', {hidden: true})[0];
    expect(firstItem).not.toHaveFocus();

    await user.click(trigger);
    expect(firstItem).toHaveFocus();

    vi.useRealTimers();
  });

  it('returns focus to the trigger on Escape', async () => {
    const user = userEvent.setup();
    render(<SideNavHeading heading="My App" menu={menuItems} />);
    const trigger = screen.getByRole('button', {name: 'Open menu'});

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  // jsdom has no light dismiss, so the guard tests above cannot fail for the
  // collapsed heading. In a browser, the collapsed icon button sits outside the
  // auto popover, and only the invoker relationship stops the press that
  // should confirm a hover-open from dismissing it first.
  it('makes the collapsed trigger the native invoker of its flyout', () => {
    render(
      <CollapsedWrapper>
        <SideNavHeading
          heading="My App"
          icon={<span>🏠</span>}
          menu={menuItems}
        />
      </CollapsedWrapper>,
    );
    const trigger = screen.getByRole('button', {name: 'My App'});
    const panelId = trigger.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(trigger).toHaveAttribute('popovertarget', panelId);
  });

  // Expanded, the panel covers the heading, and the trigger is the heading
  // root itself: an invoker there would default-prevent clicks on its links.
  it('adds no invoker in the expanded layouts', () => {
    const {container} = render(
      <>
        <SideNavHeading heading="Whole" menu={menuItems} />
        <SideNavHeading heading="Mixed" headingHref="/home" menu={menuItems} />
      </>,
    );
    expect(container.querySelector('[popovertarget]')).toBeNull();
  });
});

// =============================================================================
// Collapse ownership — collapsible + resizable (#4790, #5073)
// =============================================================================

const AUTO_SAVE_ID = 'sidenav-collapse-owner';
const STORAGE_KEY = `astryx-resizable:${AUTO_SAVE_ID}`;

function expectCollapsed(isCollapsed: boolean) {
  const label = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  expect(screen.getByRole('button', {name: label})).toBeInTheDocument();
}

describe('SideNav collapse ownership', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Every row is a configuration that works on origin/main today, with the
  // collapse state main resolves for it. Normalizing the two props into one
  // owner must not move any of these — the one case whose outcome does change
  // is the divergence itself, pinned separately below.
  const preservedCases: {
    name: string;
    persisted?: string;
    element: React.ReactElement;
    isCollapsed: boolean;
  }[] = [
    {
      name: 'collapsible alone',
      element: <SideNav collapsible>Content</SideNav>,
      isCollapsed: false,
    },
    {
      name: 'collapsible with defaultIsCollapsed',
      element: (
        <SideNav collapsible={{defaultIsCollapsed: true}}>Content</SideNav>
      ),
      isCollapsed: true,
    },
    {
      name: 'controlled collapsible (collapsed)',
      element: (
        <SideNav collapsible={{isCollapsed: true, onCollapsedChange: () => {}}}>
          Content
        </SideNav>
      ),
      isCollapsed: true,
    },
    {
      name: 'controlled collapsible (expanded)',
      element: (
        <SideNav
          collapsible={{isCollapsed: false, onCollapsedChange: () => {}}}>
          Content
        </SideNav>
      ),
      isCollapsed: false,
    },
    {
      name: 'collapsible + resizable',
      element: (
        <SideNav collapsible resizable>
          Content
        </SideNav>
      ),
      isCollapsed: false,
    },
    {
      name: 'defaultIsCollapsed + resizable',
      element: (
        <SideNav collapsible={{defaultIsCollapsed: true}} resizable>
          Content
        </SideNav>
      ),
      isCollapsed: true,
    },
    {
      name: 'controlled collapsible + resizable',
      element: (
        <SideNav
          collapsible={{isCollapsed: true, onCollapsedChange: () => {}}}
          resizable>
          Content
        </SideNav>
      ),
      isCollapsed: true,
    },
    {
      name: 'defaultIsCollapsed + a persisted legacy width',
      persisted: '300',
      element: (
        <SideNav
          collapsible={{defaultIsCollapsed: true}}
          resizable={{autoSaveId: AUTO_SAVE_ID}}>
          Content
        </SideNav>
      ),
      isCollapsed: true,
    },
    {
      name: 'collapsible + a persisted legacy width',
      persisted: '300',
      element: (
        <SideNav collapsible resizable={{autoSaveId: AUTO_SAVE_ID}}>
          Content
        </SideNav>
      ),
      isCollapsed: false,
    },
  ];

  it.each(preservedCases)(
    'resolves $name the way main does',
    ({persisted, element, isCollapsed}) => {
      if (persisted != null) {
        localStorage.setItem(STORAGE_KEY, persisted);
      }
      render(element);
      expectCollapsed(isCollapsed);
    },
  );

  it('keeps resizable alone free of collapse', () => {
    render(<SideNav resizable>Content</SideNav>);
    expect(
      screen.queryByRole('button', {name: /sidebar/i}),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('navigation').style.width).toBe('260px');
  });

  it('restores the collapsed rail from a legacy persisted 0 (#4790)', () => {
    // main renders the expanded layout here while the resize hook restores
    // collapsed, so the nav paints at width 0 with no way back.
    localStorage.setItem(STORAGE_KEY, '0');
    render(
      <SideNav collapsible resizable={{autoSaveId: AUTO_SAVE_ID}}>
        Content
      </SideNav>,
    );

    expectCollapsed(true);
    expect(screen.getByRole('navigation').style.width).not.toBe('0px');
  });

  it('restores the collapsed rail and the pre-collapse width across a reload', async () => {
    const user = userEvent.setup();
    const nav = (
      <SideNav
        collapsible
        resizable={{autoSaveId: AUTO_SAVE_ID, defaultWidth: 260}}>
        Content
      </SideNav>
    );

    const first = render(nav);
    await user.click(screen.getByRole('button', {name: 'Collapse sidebar'}));
    expectCollapsed(true);
    first.unmount();

    render(nav);
    expectCollapsed(true);

    await user.click(screen.getByRole('button', {name: 'Expand sidebar'}));
    expect(screen.getByRole('navigation').style.width).toBe('260px');
  });

  it('expands to the persisted pre-collapse width, not the default', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({size: 320, isCollapsed: true}),
    );
    render(
      <SideNav
        collapsible
        resizable={{autoSaveId: AUTO_SAVE_ID, defaultWidth: 260}}>
        Content
      </SideNav>,
    );

    await user.click(screen.getByRole('button', {name: 'Expand sidebar'}));
    expect(screen.getByRole('navigation').style.width).toBe('320px');
  });

  it('reports one collapse change per toggle', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    render(
      <SideNav collapsible={{onCollapsedChange}} resizable>
        Content
      </SideNav>,
    );

    await user.click(screen.getByRole('button', {name: 'Collapse sidebar'}));
    expect(onCollapsedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('lets a controlled collapsible drive a resizable nav from outside', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [isCollapsed, setIsCollapsed] = useState(false);
      const collapsible = {isCollapsed, onCollapsedChange: setIsCollapsed};
      return (
        <>
          <SideNavCollapseButton collapsible={collapsible} label="Outside" />
          <SideNav
            collapsible={{...collapsible, hasButton: false}}
            resizable={{autoSaveId: AUTO_SAVE_ID}}>
            Content
          </SideNav>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('navigation').style.width).toBe('260px');

    await user.click(screen.getByRole('button', {name: 'Outside'}));
    expect(screen.getByRole('navigation').style.width).toBe('');
    expect(
      screen.queryByTestId('astryx-sidenav-resize-handle'),
    ).not.toBeInTheDocument();
  });

  it('lets resizable own collapse on its own', async () => {
    const user = userEvent.setup();
    const onCollapseChange = vi.fn();
    render(
      <SideNav resizable={{defaultIsCollapsed: true, onCollapseChange}}>
        Content
      </SideNav>,
    );

    expectCollapsed(true);
    await user.click(screen.getByRole('button', {name: 'Expand sidebar'}));
    expect(onCollapseChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('keeps collapse state when resize is toggled off and on', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <SideNav collapsible resizable>
        Content
      </SideNav>,
    );

    await user.click(screen.getByRole('button', {name: 'Collapse sidebar'}));
    expectCollapsed(true);

    rerender(<SideNav collapsible>Content</SideNav>);
    expectCollapsed(true);

    rerender(
      <SideNav collapsible resizable>
        Content
      </SideNav>,
    );
    expectCollapsed(true);
  });

  it('gives resizable the winning value when both set defaultIsCollapsed', () => {
    render(
      <SideNav
        collapsible={{defaultIsCollapsed: false}}
        resizable={{defaultIsCollapsed: true}}>
        Content
      </SideNav>,
    );
    expectCollapsed(true);
  });
});

describe('SideNav collapse conflict warning', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('warns when both props carry defaultIsCollapsed', () => {
    render(
      <SideNav
        collapsible={{defaultIsCollapsed: false}}
        resizable={{defaultIsCollapsed: true}}>
        Content
      </SideNav>,
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('collapsible.defaultIsCollapsed'),
    );
    expect(warn.mock.calls[0][0]).toContain('resizable.defaultIsCollapsed');
    expect(warn.mock.calls[0][0]).toContain('resizable wins');
  });

  it('warns when a controlled collapsible does not drive collapse', () => {
    render(
      <SideNav
        collapsible={{isCollapsed: false, onCollapsedChange: () => {}}}
        resizable={{isCollapsed: true, onCollapseChange: () => {}}}>
        Content
      </SideNav>,
    );

    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('collapsible.isCollapsed');
    expect(message).toContain('collapsible.onCollapsedChange');
    expect(message).toContain('resizable.isCollapsed');
    expect(message).toContain('resizable wins');
    // The winner is the state that actually renders.
    expectCollapsed(true);
  });

  it('does not split state and callback ownership across props', async () => {
    const user = userEvent.setup();
    const collapsibleChange = vi.fn();
    const resizableChange = vi.fn();
    render(
      <SideNav
        collapsible={{
          isCollapsed: true,
          onCollapsedChange: collapsibleChange,
        }}
        resizable={{onCollapseChange: resizableChange}}>
        Content
      </SideNav>,
    );

    expectCollapsed(false);
    await user.click(screen.getByRole('button', {name: 'Collapse sidebar'}));
    expect(resizableChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(collapsibleChange).not.toHaveBeenCalled();
  });

  it('stays silent for collapsible alongside a resize config', () => {
    render(
      <SideNav
        collapsible
        resizable={{autoSaveId: AUTO_SAVE_ID, defaultWidth: 300}}>
        Content
      </SideNav>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent for a controlled collapsible with a plain resize config', () => {
    render(
      <SideNav
        collapsible={{isCollapsed: true, onCollapsedChange: () => {}}}
        resizable={{defaultWidth: 300}}>
        Content
      </SideNav>,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

// =============================================================================
// SideNavItem — collapsed-from-mount rail tooltip
// =============================================================================

// Two interchangeable link components: switching between them remounts the
// rendered link element.
function RailLinkA({ref, ...props}: React.ComponentPropsWithRef<'a'>) {
  return <a ref={ref} {...props} />;
}

function RailLinkB({ref, ...props}: React.ComponentPropsWithRef<'a'>) {
  return <a ref={ref} {...props} />;
}

describe('SideNavItem collapsed-from-mount rail tooltip', () => {
  // #7435 / #7692: a childless item that mounts inside an already-collapsed
  // SideNav (the persisted-collapse case) must attach its tooltip on the first
  // render, and the tooltip must describe the control that takes focus — the
  // link or button — not the row around it.
  function railTooltipFor(trigger: HTMLElement) {
    const id = trigger.getAttribute('aria-describedby');
    return id == null ? null : document.getElementById(id);
  }

  function renderRail(item: ReactNode) {
    return render(
      <SideNav
        aria-label="Main"
        collapsible={{isCollapsed: true, hasButton: false}}>
        {item}
      </SideNav>,
    );
  }

  let showPopover: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    showPopover?.mockRestore();
    showPopover = undefined;
    vi.useRealTimers();
  });

  it('describes the rail link by its tooltip when the nav is collapsed at mount', () => {
    renderRail(
      <SideNavItem label="Dashboard" icon={StubIcon} href="/dashboard" />,
    );
    const link = screen.getByRole('link', {name: 'Dashboard'});

    const layer = railTooltipFor(link);
    expect(layer).not.toBeNull();
    expect(layer).toHaveAttribute('role', 'tooltip');
    expect(layer).toHaveTextContent('Dashboard');
  });

  it('shows a disabled item its label when the pointer rests on its row', async () => {
    // The disabled control is `pointer-events: none`, so in a browser the
    // pointer lands on the row; the tooltip has to listen there.
    vi.useFakeTimers();
    const spy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    showPopover = spy;
    renderRail(
      <SideNavItem
        label="Analytics (Coming Soon)"
        icon={StubIcon}
        href="/analytics"
        isDisabled
      />,
    );
    // Let the row's tooltip attach after the commit.
    await act(async () => {});
    const button = screen.getByRole('button', {
      name: 'Analytics (Coming Soon)',
    });
    const row = button.parentElement as HTMLElement;
    const layer = screen.getByRole('tooltip', {hidden: true});
    expect(layer).toHaveTextContent('Analytics (Coming Soon)');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(spy.mock.contexts).toContain(layer);
  });

  it('describes the link once a disabled item is enabled in the rail', () => {
    const item = (isDisabled: boolean) => (
      <SideNavItem
        label="Dashboard"
        icon={StubIcon}
        href="/dashboard"
        isDisabled={isDisabled}
      />
    );
    const {rerender} = renderRail(item(true));
    rerender(
      <SideNav
        aria-label="Main"
        collapsible={{isCollapsed: true, hasButton: false}}>
        {item(false)}
      </SideNav>,
    );

    const link = screen.getByRole('link', {name: 'Dashboard'});
    expect(railTooltipFor(link)).toHaveTextContent('Dashboard');
  });

  it('describes the new control when a rail item gains an href', () => {
    const item = (href?: string) => (
      <SideNavItem
        label="Dashboard"
        icon={StubIcon}
        href={href}
        onClick={() => {}}
      />
    );
    const {rerender} = renderRail(item());
    const button = screen.getByRole('button', {name: 'Dashboard'});
    expect(railTooltipFor(button)).toHaveTextContent('Dashboard');

    rerender(
      <SideNav
        aria-label="Main"
        collapsible={{isCollapsed: true, hasButton: false}}>
        {item('/dashboard')}
      </SideNav>,
    );
    const link = screen.getByRole('link', {name: 'Dashboard'});
    expect(railTooltipFor(link)).toHaveTextContent('Dashboard');
  });

  it('binds the replacement when a rail link element is replaced', () => {
    // Switching the link component remounts the element; the tooltip must
    // follow the new element.
    vi.useFakeTimers();
    const spy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    showPopover = spy;
    const item = (as: typeof RailLinkA) => (
      <SideNavItem
        label="Dashboard"
        icon={StubIcon}
        href="/dashboard"
        as={as}
      />
    );
    const {rerender} = renderRail(item(RailLinkA));
    const first = screen.getByRole('link', {name: 'Dashboard'});
    rerender(
      <SideNav
        aria-label="Main"
        collapsible={{isCollapsed: true, hasButton: false}}>
        {item(RailLinkB)}
      </SideNav>,
    );

    const link = screen.getByRole('link', {name: 'Dashboard'});
    expect(link).not.toBe(first);
    const layer = railTooltipFor(link);
    expect(layer).toHaveTextContent('Dashboard');
    fireEvent.mouseEnter(link);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(spy.mock.contexts).toContain(layer);
  });

  it("keeps the tooltip beside a caller's changing aria-describedby", () => {
    const item = (hint: string) => (
      <SideNavItem
        label="Dashboard"
        icon={StubIcon}
        href="/dashboard"
        aria-describedby={hint}
      />
    );
    const {rerender} = renderRail(item('hint-a'));
    rerender(
      <SideNav
        aria-label="Main"
        collapsible={{isCollapsed: true, hasButton: false}}>
        {item('hint-b')}
      </SideNav>,
    );

    const link = screen.getByRole('link', {name: 'Dashboard'});
    const tooltip = screen.getByRole('tooltip', {hidden: true});
    const ids = (link.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain('hint-b');
    expect(ids).toContain(tooltip.id);
    expect(ids).not.toContain('hint-a');
  });

  it('shows the label when keyboard focus reaches a rail link', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    showPopover = spy;
    renderRail(
      <SideNavItem label="Dashboard" icon={StubIcon} href="/dashboard" />,
    );
    const link = screen.getByRole('link', {name: 'Dashboard'});
    const layer = railTooltipFor(link);
    // jsdom does not model `:focus-visible`; stand in for a keyboard focus.
    const realMatches = link.matches.bind(link);
    vi.spyOn(link, 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible' ? true : realMatches(selector),
    );

    fireEvent.focusIn(link);
    expect(spy.mock.contexts).toContain(layer);
  });

  it('keeps a tooltip that was open when the rail expanded shut on the next collapse', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    showPopover = spy;
    const rail = (isCollapsed: boolean) => (
      <SideNav aria-label="Main" collapsible={{isCollapsed, hasButton: false}}>
        <SideNavItem label="Dashboard" icon={StubIcon} href="/dashboard" />
      </SideNav>
    );
    const {rerender} = render(rail(true));
    const link = screen.getByRole('link', {name: 'Dashboard'});
    fireEvent.mouseEnter(link);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(spy.mock.contexts).toContain(railTooltipFor(link));

    // Expanding (from a shortcut, say) removes the trigger without a leave.
    rerender(rail(false));
    spy.mockClear();
    rerender(rail(true));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
