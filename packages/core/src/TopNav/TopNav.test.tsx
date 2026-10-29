// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNav.test.tsx
 * @input Uses vitest, @testing-library/react, TopNav components
 * @output Unit tests for TopNav component suite
 * @position Testing; validates TopNav implementations
 *
 * SYNC: When TopNav components change, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen, act} from '@testing-library/react';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {expectNativeLinkClicks} from '../hooks/__tests__/menuLinkClicks';
import {NavHeadingMenu, NavHeadingMenuItem} from '../NavMenu';
import userEvent from '@testing-library/user-event';
import {TopNav} from './TopNav';
import {TopNavRenderContext} from './TopNavRenderContext';
import {TopNavHeading} from './TopNavHeading';
import {NavIcon} from '../NavIcon';
import {TopNavItem} from './TopNavItem';
import {TopNavMegaMenuFeaturedCard} from './TopNavMegaMenuFeaturedCard';
import {LinkProvider} from '../Link/LinkProvider';

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

describe('TopNav', () => {
  it('renders with navigation role', () => {
    render(<TopNav label="Main navigation" />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders aria-label from label prop', () => {
    render(<TopNav label="Primary navigation" />);
    expect(screen.getByRole('navigation')).toHaveAttribute(
      'aria-label',
      'Primary navigation',
    );
  });

  it('defaults the landmark label to "Top navigation" when label is omitted', () => {
    render(<TopNav />);
    expect(
      screen.getByRole('navigation', {name: 'Top navigation'}),
    ).toBeInTheDocument();
  });

  it('defaults the landmark label in mobile-bar mode', () => {
    render(
      <TopNavRenderContext value="mobile-bar">
        <TopNav heading={<span>Logo</span>} />
      </TopNavRenderContext>,
    );
    expect(
      screen.getByRole('navigation', {name: 'Top navigation'}),
    ).toBeInTheDocument();
  });

  it('custom label overrides the default in mobile-bar mode', () => {
    render(
      <TopNavRenderContext value="mobile-bar">
        <TopNav label="Utility navigation" />
      </TopNavRenderContext>,
    );
    expect(
      screen.getByRole('navigation', {name: 'Utility navigation'}),
    ).toBeInTheDocument();
  });

  it('renders heading slot content', () => {
    render(<TopNav heading={<span data-testid="title-content">Logo</span>} />);
    expect(screen.getByTestId('title-content')).toBeInTheDocument();
  });

  it('renders startContent slot', () => {
    render(
      <TopNav
        startContent={<span data-testid="start-content">Nav Items</span>}
      />,
    );
    expect(screen.getByTestId('start-content')).toBeInTheDocument();
  });

  it('renders children as startContent', () => {
    render(
      <TopNav>
        <TopNavItem label="Home" href="/" />
        <TopNavItem label="About" href="/about" />
      </TopNav>,
    );

    expect(screen.getByRole('link', {name: 'Home'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'About'})).toBeInTheDocument();
  });

  it('prefers startContent when both startContent and children are provided', () => {
    render(
      <TopNav startContent={<TopNavItem label="Start" href="/start" />}>
        <TopNavItem label="Child" href="/child" />
      </TopNav>,
    );

    expect(screen.getByRole('link', {name: 'Start'})).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'Child'})).not.toBeInTheDocument();
  });

  it('renders endContent slot', () => {
    render(
      <TopNav endContent={<span data-testid="end-content">Actions</span>} />,
    );
    expect(screen.getByTestId('end-content')).toBeInTheDocument();
  });

  it('renders centerContent slot', () => {
    render(
      <TopNav
        centerContent={<span data-testid="center-content">Center</span>}
      />,
    );
    expect(screen.getByTestId('center-content')).toBeInTheDocument();
  });

  it('renders all slots together', () => {
    render(
      <TopNav
        heading={<span data-testid="title">Title</span>}
        startContent={<span data-testid="start">Start</span>}
        centerContent={<span data-testid="center">Center</span>}
        endContent={<span data-testid="end">End</span>}
      />,
    );
    expect(screen.getByTestId('title')).toBeInTheDocument();
    expect(screen.getByTestId('start')).toBeInTheDocument();
    expect(screen.getByTestId('center')).toBeInTheDocument();
    expect(screen.getByTestId('end')).toBeInTheDocument();
  });

  it('renders without centerContent (backward compatible)', () => {
    render(
      <TopNav
        heading={<span data-testid="title">Title</span>}
        startContent={<span data-testid="start">Start</span>}
        endContent={<span data-testid="end">End</span>}
      />,
    );
    expect(screen.getByTestId('title')).toBeInTheDocument();
    expect(screen.getByTestId('start')).toBeInTheDocument();
    expect(screen.getByTestId('end')).toBeInTheDocument();
  });

  it('renders centerContent without endContent', () => {
    render(
      <TopNav
        heading={<span data-testid="title">Title</span>}
        centerContent={<span data-testid="center">Center</span>}
      />,
    );
    expect(screen.getByTestId('title')).toBeInTheDocument();
    expect(screen.getByTestId('center')).toBeInTheDocument();

    const nav = screen.getByRole('navigation');
    // 3 child divs: left section, center section, right section (even without endContent)
    expect(nav.children).toHaveLength(3);
  });

  it('renders centerContent without startContent', () => {
    render(
      <TopNav
        centerContent={<span data-testid="center">Center</span>}
        endContent={<span data-testid="end">End</span>}
      />,
    );
    expect(screen.getByTestId('center')).toBeInTheDocument();
    expect(screen.getByTestId('end')).toBeInTheDocument();

    const nav = screen.getByRole('navigation');
    // 3 child divs: left section, center section, right section
    expect(nav.children).toHaveLength(3);
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<TopNav ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('does not create a stacking context on nav element', () => {
    render(
      <TopNav
        label="Main navigation"
        startContent={<span>Start</span>}
        endContent={<span>End</span>}
      />,
    );
    const nav = screen.getByRole('navigation');
    // Nav itself should NOT have position: relative — the wrapper provides
    // positioning context for the mega menu panel.
    expect(nav).not.toHaveStyle({position: 'relative'});
  });
});

describe('TopNavHeading', () => {
  it('renders heading text', () => {
    render(<TopNavHeading heading="My App" />);
    expect(screen.getByText('My App')).toBeInTheDocument();
  });

  it('renders logo element', () => {
    render(<TopNavHeading logo={<span data-testid="logo">Logo</span>} />);
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('renders both logo and heading', () => {
    render(
      <TopNavHeading
        heading="Dashboard"
        logo={<span data-testid="logo">Logo</span>}
      />,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  describe('logo link accessible name', () => {
    const logo = <img src="/logo.png" alt="" />;

    // A logo image is decorative; when the logo is wrapped in a link the link
    // itself needs an accessible name, otherwise axe reports link-name.
    it('names the logo link in the independent-links config', () => {
      render(
        <TopNavHeading
          logo={logo}
          superheading="Suite"
          superheadingHref="/suite"
          heading="Product"
          headingHref="/product"
        />,
      );
      // No link should have an empty accessible name.
      for (const link of screen.getAllByRole('link')) {
        expect(link).toHaveAccessibleName();
      }
      // The logo link is named from the heading.
      expect(
        screen.getAllByRole('link', {name: 'Product'}).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('names the logo link in the menu + hrefs config', () => {
      render(
        <TopNavHeading
          logo={logo}
          superheading="Suite"
          superheadingHref="/suite"
          heading="Product"
          headingHref="/product"
          menu={<a href="#menu">Menu item</a>}
        />,
      );
      for (const link of screen.getAllByRole('link')) {
        expect(link).toHaveAccessibleName();
      }
    });

    it('names a logo-only link via logoLabel', () => {
      render(
        <TopNavHeading logo={logo} headingHref="/home" logoLabel="Home" />,
      );
      expect(screen.getByRole('link', {name: 'Home'})).toHaveAttribute(
        'href',
        '/home',
      );
    });
  });

  it('renders as anchor when headingHref is provided', () => {
    render(<TopNavHeading heading="Home" headingHref="/" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders as div when no href', () => {
    render(<TopNavHeading heading="Home" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<TopNavHeading heading="Test" ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
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

    it('acts on the product-menu item a press slid across it lifts on, once (family:action-groups FR1, FR2, FR5)', async () => {
      __resetMenuPressForTest();
      const user = userEvent.setup();
      const onFirst = vi.fn();
      const onSecond = vi.fn();
      render(
        <TopNavHeading
          heading="My App"
          menu={
            <>
              <div role="menuitem" tabIndex={-1} onClick={onFirst}>
                Alpha
              </div>
              <div role="menuitem" tabIndex={-1} onClick={onSecond}>
                Beta
              </div>
            </>
          }
        />,
      );
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      const FIRST = 'Alpha';
      const SECOND = 'Beta';
      const item = (name: string) =>
        screen.getByRole('menuitem', {name, hidden: true});
      for (const pointer of [
        {pointerType: 'touch', pointerId: 1},
        {pointerType: 'mouse', pointerId: 2, button: 0},
      ]) {
        onFirst.mockClear();
        onSecond.mockClear();
        fireEvent.pointerDown(item(FIRST), pointer);
        fireEvent.pointerMove(item(SECOND), pointer);
        fireEvent.pointerUp(item(SECOND), pointer);
        expect(onSecond).toHaveBeenCalledTimes(1);
        expect(onFirst).not.toHaveBeenCalled();
      }
    });

    it('leaves a Ctrl-, Cmd-, Shift- or middle click on a link item in its product menu to the browser', async () => {
      __resetMenuPressForTest();
      const user = userEvent.setup();
      render(
        <TopNavHeading
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

    it('after a pointer pick, returns focus to the trigger without a keyboard ring (interaction-modality INV1)', async () => {
      __resetMenuPressForTest();
      const user = userEvent.setup();
      render(
        <TopNavHeading
          heading="My App"
          menu={
            <NavHeadingMenu>
              <NavHeadingMenuItem label="Alpha" onClick={() => {}} />
              <NavHeadingMenuItem label="Beta" onClick={() => {}} />
            </NavHeadingMenu>
          }
        />,
      );
      const trigger = screen.getByRole('button', {name: 'Open menu'});
      await user.click(trigger);
      const focusSpy = vi.spyOn(trigger, 'focus');
      const alpha = screen.getByRole('menuitem', {name: 'Alpha', hidden: true});
      const mouse = {pointerType: 'mouse', pointerId: 4, button: 0};
      alpha.focus();
      fireEvent.pointerDown(alpha, mouse);
      fireEvent.pointerUp(alpha, mouse);
      expect(focusSpy).toHaveBeenCalledWith(
        expect.objectContaining({focusVisible: false}),
      );
    });

    it('does not wrap the heading menu popup in a modal dialog', async () => {
      const user = userEvent.setup();
      render(<TopNavHeading heading="My App" menu={menuItems} />);
      await user.click(screen.getByRole('button', {name: 'Open menu'}));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    });

    it('scopes role="menu" to only menuitem children with an accessible name', async () => {
      const user = userEvent.setup();
      render(<TopNavHeading heading="My App" menu={menuItems} />);
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
      render(<TopNavHeading heading="My App" menu={menuItems} />);
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
        <TopNavHeading
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

describe('NavIcon', () => {
  it('renders icon content', () => {
    render(<NavIcon icon={<span data-testid="icon">Icon</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<NavIcon icon={<span>Icon</span>} ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLSpanElement));
  });
});

describe('TopNavItem', () => {
  it('renders label as visible text', () => {
    render(<TopNavItem label="Home" />);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('renders as anchor element', () => {
    render(<TopNavItem label="Home" href="/" />);
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders children instead of label when provided', () => {
    render(<TopNavItem label="Accessible name">Custom content</TopNavItem>);
    expect(screen.getByText('Custom content')).toBeInTheDocument();
  });

  it('applies aria-current when isSelected', () => {
    render(<TopNavItem label="Home" href="#" isSelected />);
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('does not have aria-current when not selected', () => {
    render(<TopNavItem label="Home" href="#" />);
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current');
  });

  it('applies aria-disabled when isDisabled', () => {
    render(<TopNavItem label="Home" href="#" isDisabled />);
    expect(screen.getByText('Home').closest('a')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('sets tabIndex to -1 when disabled', () => {
    render(<TopNavItem label="Home" href="#" isDisabled />);
    expect(screen.getByText('Home').closest('a')).toHaveAttribute(
      'tabIndex',
      '-1',
    );
  });

  describe('disabled items do not navigate', () => {
    it('drops href/target and suppresses clicks when disabled (default mode)', () => {
      const handleClick = vi.fn();
      render(
        <TopNavItem
          label="Home"
          href="/home"
          target="_blank"
          onClick={handleClick}
          isDisabled
        />,
      );
      // An href-less anchor exposes no link role, so it is not announced
      // with a live destination.
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      const item = screen.getByText('Home').closest('a') as HTMLAnchorElement;
      expect(item).not.toHaveAttribute('href');
      expect(item).not.toHaveAttribute('target');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAttribute('tabIndex', '-1');

      // fireEvent bypasses pointer-events: none, simulating programmatic/AT
      // activation. It returns false when preventDefault was called, i.e.
      // any default navigation behavior is cancelled.
      const notCancelled = fireEvent.click(item);
      expect(notCancelled).toBe(false);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('drops href/target and suppresses clicks when disabled (drawer mode)', () => {
      const handleClick = vi.fn();
      render(
        <TopNavRenderContext value="drawer">
          <TopNavItem
            label="Home"
            href="/home"
            target="_blank"
            onClick={handleClick}
            isDisabled
          />
        </TopNavRenderContext>,
      );
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      const item = screen.getByText('Home').closest('a') as HTMLAnchorElement;
      expect(item).not.toHaveAttribute('href');
      expect(item).not.toHaveAttribute('target');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAttribute('tabIndex', '-1');

      // fireEvent bypasses pointer-events: none, simulating programmatic/AT
      // activation. It returns false when preventDefault was called.
      const notCancelled = fireEvent.click(item);
      expect(notCancelled).toBe(false);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('keeps href and click behavior for enabled items (default mode)', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<TopNavItem label="Home" href="#" onClick={handleClick} />);
      const link = screen.getByRole('link', {name: 'Home'});
      expect(link).toHaveAttribute('href', '#');
      expect(link).not.toHaveAttribute('aria-disabled');

      await user.click(link);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('keeps href and click behavior for enabled items (drawer mode)', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <TopNavRenderContext value="drawer">
          <TopNavItem label="Home" href="#" onClick={handleClick} />
        </TopNavRenderContext>,
      );
      const link = screen.getByRole('link', {name: 'Home'});
      expect(link).toHaveAttribute('href', '#');
      expect(link).not.toHaveAttribute('aria-disabled');

      await user.click(link);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  it('renders icon with label', () => {
    render(
      <TopNavItem
        label="Settings"
        icon={<span data-testid="icon">Icon</span>}
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('hides label and sets aria-label when isIconOnly', () => {
    render(
      <TopNavItem
        label="Settings"
        href="#"
        icon={<span data-testid="icon">⚙️</span>}
        isIconOnly
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', 'Settings');
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<TopNavItem label="Click me" href="#" onClick={handleClick} />);

    await user.click(screen.getByRole('link'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<TopNavItem label="Test" ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLAnchorElement));
  });

  it('renders custom component when as is provided', () => {
    render(<TopNavItem label="Home" href="/" as={CustomLink} />);
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders custom component from LinkProvider', () => {
    render(
      <LinkProvider component={CustomLink}>
        <TopNavItem label="Home" href="/" />
      </LinkProvider>,
    );
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('data-custom-link');
  });

  it('as prop overrides LinkProvider', () => {
    function AnotherLink({
      children,
      ref,
      ...props
    }: React.ComponentPropsWithRef<'a'>) {
      return (
        <a ref={ref} data-another-link {...props}>
          {children}
        </a>
      );
    }
    render(
      <LinkProvider component={AnotherLink}>
        <TopNavItem label="Home" href="/" as={CustomLink} />
      </LinkProvider>,
    );
    const link = screen.getByRole('link', {name: 'Home'});
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).not.toHaveAttribute('data-another-link');
  });

  describe('TopNavMegaMenuFeaturedCard rest forwarding', () => {
    it('forwards data-testid, id, and aria-* to the root element', () => {
      render(
        <TopNavMegaMenuFeaturedCard
          title="What's new"
          description="Details"
          data-testid="featured-card"
          id="card-1"
          aria-label="Featured"
        />,
      );
      const card = screen.getByTestId('featured-card');
      expect(card).toHaveAttribute('id', 'card-1');
      expect(card).toHaveAttribute('aria-label', 'Featured');
    });
  });

  describe('TopNavMegaMenuFeaturedCard image alt handling', () => {
    it('marks the image as explicitly decorative when imageAlt is omitted', () => {
      render(
        <TopNavMegaMenuFeaturedCard
          title="What's new"
          image="/promo.jpg"
          data-testid="featured-card"
        />,
      );
      const img = screen.getByTestId('featured-card').querySelector('img');
      expect(img).toHaveAttribute('alt', '');
      expect(img).toHaveAttribute('role', 'presentation');
      expect(img).toHaveAttribute('aria-hidden', 'true');
      // The image must not be exposed to assistive technology as a nameless img.
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('exposes the image with normal img semantics when imageAlt is provided', () => {
      render(
        <TopNavMegaMenuFeaturedCard
          title="What's new"
          image="/promo.jpg"
          imageAlt="Team collaboration"
        />,
      );
      const img = screen.getByRole('img', {name: 'Team collaboration'});
      expect(img).not.toHaveAttribute('role');
      expect(img).not.toHaveAttribute('aria-hidden');
    });

    it('keeps title and link semantics unchanged with a decorative image', () => {
      render(
        <TopNavMegaMenuFeaturedCard
          title="What's new"
          image="/promo.jpg"
          linkLabel="Read the announcement"
          linkHref="/blog/v4"
        />,
      );
      expect(screen.getByText("What's new")).toBeInTheDocument();
      const link = screen.getByRole('link', {name: /Read the announcement/});
      expect(link).toHaveAttribute('href', '/blog/v4');
    });
  });
});

describe('TopNavHeading hover/click guard', () => {
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
    render(<TopNavHeading heading="My App" menu={menuItems} />);
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
    render(<TopNavHeading heading="My App" menu={menuItems} />);
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
    render(<TopNavHeading heading="My App" menu={menuItems} />);
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
    render(<TopNavHeading heading="My App" menu={menuItems} />);
    const trigger = screen.getByRole('button', {name: 'Open menu'});

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
