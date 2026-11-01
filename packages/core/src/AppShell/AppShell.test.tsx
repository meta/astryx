// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AppShell.test.tsx
 * @input Uses vitest, React server rendering, @testing-library/react, AppShell component
 * @output Unit tests for AppShell client behavior and SSR breakpoint semantics
 * @position Testing; validates AppShell.tsx implementation
 *
 * SYNC: When AppShell.tsx changes, update tests to match new behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {renderToString} from 'react-dom/server';
import {act, render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {AppShell} from './AppShell';
import {InternationalizationProvider} from '../i18n';
import {MobileNav} from '../MobileNav';
import {SideNav, SideNavItem, SideNavSection} from '../SideNav';
import {TopNav, TopNavHeading, TopNavItem} from '../TopNav';
import {TextInput} from '../TextInput';
import {useAppShellMobile} from './AppShellMobileContext';
import {Theme, defineTheme} from '../theme';

// jsdom doesn't implement showModal/close on <dialog>, so we mock them
beforeAll(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

// Helper: minimal SideNav that provides the navigation landmark
function TestSideNav({children}: {children?: React.ReactNode}) {
  return (
    <SideNav>
      <SideNavSection title="Test" isHeaderHidden>
        <SideNavItem label={typeof children === 'string' ? children : 'Nav'} />
      </SideNavSection>
    </SideNav>
  );
}

// Mock matchMedia
function createMockMatchMedia(matches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(
      (_event: string, handler: (e: MediaQueryListEvent) => void) => {
        listeners.push(handler);
      },
    ),
    removeEventListener: vi.fn(
      (_event: string, handler: (e: MediaQueryListEvent) => void) => {
        const idx = listeners.indexOf(handler);
        if (idx >= 0) {
          listeners.splice(idx, 1);
        }
      },
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    // Expose for test control
    _listeners: listeners,
    _setMatches: (newMatches: boolean) => {
      mql.matches = newMatches;
      for (const listener of listeners) {
        listener({matches: newMatches} as MediaQueryListEvent);
      }
    },
  };
  return mql;
}

let mockMql: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockMql = createMockMatchMedia(false);
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    document.documentElement.removeAttribute('data-astryx-theme');
  });
});

describe('AppShell', () => {
  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  it('renders children as main content', () => {
    render(
      <AppShell>
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.getByText('Main content')).toBeInTheDocument();
  });

  it('renders main element with role="main"', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders topNav in the header area', () => {
    render(
      <AppShell topNav={<div>Top Nav</div>}>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByText('Top Nav')).toBeInTheDocument();
  });

  it('renders banner when provided', () => {
    render(
      <AppShell banner={<div>System banner</div>}>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByText('System banner')).toBeInTheDocument();
  });

  it('renders sideNav in a nav element', () => {
    render(
      <AppShell sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Nav')).toBeInTheDocument();
  });

  it('renders without optional slots', () => {
    render(
      <AppShell>
        <div>Just content</div>
      </AppShell>,
    );
    expect(screen.getByText('Just content')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('supports data-testid', () => {
    render(
      <AppShell data-testid="my-shell">
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByTestId('my-shell')).toBeInTheDocument();
  });

  // ===========================================================================
  // Skip-to-content link
  // ===========================================================================

  it('renders a skip-to-content link', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );
    const skipLink = screen.getByTestId('skip-to-content');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#astryx-app-shell-main');
    expect(skipLink.textContent).toBe('Skip to content');
  });

  it('main content has the correct id for skip link', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'astryx-app-shell-main');
  });

  it('moves focus to the main content when the skip link is activated', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );
    const skipLink = screen.getByTestId('skip-to-content');
    const main = screen.getByRole('main');
    // The target must be programmatically focusable for focus to move
    expect(main).toHaveAttribute('tabindex', '-1');
    fireEvent.click(skipLink);
    expect(document.activeElement).toBe(main);
  });

  it('skip link text comes from the i18n catalog', () => {
    render(
      <InternationalizationProvider
        locale="en"
        overrides={{en: {'@astryx.appShell.skipToContent': 'Jump to main'}}}>
        <AppShell>
          <div>Content</div>
        </AppShell>
      </InternationalizationProvider>,
    );
    expect(screen.getByTestId('skip-to-content').textContent).toBe(
      'Jump to main',
    );
  });

  // ===========================================================================
  // Banner landmark
  // ===========================================================================

  it('exposes the header region as a banner landmark', () => {
    render(
      <AppShell topNav={<div>Top Nav</div>}>
        <div>Content</div>
      </AppShell>,
    );
    const banner = screen.getByRole('banner');
    expect(banner).toBeInTheDocument();
    // banner must be top-level — not nested inside another landmark
    expect(screen.getByRole('main')).not.toContainElement(banner);
  });

  it('does not render a banner landmark without header content', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  // ===========================================================================
  // SideNav accessibility
  // ===========================================================================

  it('sideNav has aria-label', () => {
    render(
      <AppShell sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'Side navigation');
  });

  // ===========================================================================
  // SideNav collapse — uncontrolled
  // ===========================================================================

  it('sideNav is visible by default (uncontrolled)', () => {
    render(
      <AppShell sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByText('Nav')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  // (Collapse tests removed — collapse is now managed by SideNav, not AppShell)

  // ===========================================================================
  // Responsive breakpoint
  // ===========================================================================

  it('preserves input value and focus across mobile breakpoints.', async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        variant="elevated"
        topNav="Top navigation"
        sideNav="Side navigation"
        mobileNav={{breakpoint: 'md'}}>
        <input aria-label="Page draft" />
      </AppShell>,
    );
    await user.type(
      screen.getByRole('textbox', {name: 'Page draft'}),
      'Keep this draft',
    );

    for (const isMobile of [true, false]) {
      act(() => mockMql._setMatches(isMobile));
      const input = screen.getByRole('textbox', {name: 'Page draft'});
      expect(input).toHaveValue('Keep this draft');
      expect(input).toHaveFocus();
    }
  });

  it('uses the default named breakpoint with an exclusive upper edge', () => {
    render(
      <AppShell sideNav={<TestSideNav />} mobileNav={{breakpoint: 'md'}}>
        <div>Content</div>
      </AppShell>,
    );

    expect(window.matchMedia).toHaveBeenCalledWith('(width < 768px)');
  });

  it('resolves all named points through the nearest Theme', () => {
    const theme = {
      ...defineTheme({
        name: 'app-shell-points',
        adaptations: {widthBreakpoints: {xl: 1400, '2xl': 1800}},
      }),
      __built: true as const,
    };

    render(
      <Theme theme={theme}>
        <AppShell sideNav={<TestSideNav />} mobileNav={{breakpoint: '2xl'}}>
          <div>Content</div>
        </AppShell>
      </Theme>,
    );

    expect(window.matchMedia).toHaveBeenCalledWith('(width < 1800px)');
  });

  it('uses the provider object when another theme shares its name', () => {
    const outer = {
      ...defineTheme({
        name: 'same-name',
        adaptations: {widthBreakpoints: {md: 700}},
      }),
      __built: true as const,
    };
    const inner = {
      ...defineTheme({
        name: 'same-name',
        adaptations: {widthBreakpoints: {md: 900}},
      }),
      __built: true as const,
    };

    render(
      <Theme theme={outer}>
        <Theme theme={inner}>
          <div>Nested</div>
        </Theme>
        <AppShell sideNav={<TestSideNav />} mobileNav={{breakpoint: 'md'}}>
          <div>Content</div>
        </AppShell>
      </Theme>,
    );

    expect(window.matchMedia).toHaveBeenCalledWith('(width < 700px)');
  });

  it('uses a built theme object from provider context', () => {
    const builtTheme = {
      ...defineTheme({
        name: 'built-app-shell-points',
        adaptations: {widthBreakpoints: {'2xl': 1700}},
      }),
      __built: true as const,
      __adaptationRules: undefined,
    };

    render(
      <Theme theme={builtTheme}>
        <AppShell sideNav={<TestSideNav />} mobileNav={{breakpoint: '2xl'}}>
          <div>Content</div>
        </AppShell>
      </Theme>,
    );

    expect(window.matchMedia).toHaveBeenCalledWith('(width < 1700px)');
  });

  it('falls back per key when built metadata has a partial width map', () => {
    const partialBuiltTheme = {
      ...defineTheme({name: 'partial-built-app-shell-points'}),
      __built: true as const,
      __adaptations: {
        widthBreakpoints: {md: 700},
        rules: [],
      },
    } as unknown as ReturnType<typeof defineTheme>;

    render(
      <Theme theme={partialBuiltTheme}>
        <AppShell sideNav={<TestSideNav />} mobileNav={{breakpoint: 'xl'}}>
          <div>Content</div>
        </AppShell>
      </Theme>,
    );

    expect(window.matchMedia).toHaveBeenCalledWith('(width < 1280px)');
  });

  it('follows the registered root theme without provider context', () => {
    defineTheme({
      name: 'root-app-shell-points',
      adaptations: {widthBreakpoints: {lg: 1111}},
    });
    const originalGetAttribute = document.documentElement.getAttribute.bind(
      document.documentElement,
    );
    vi.spyOn(document.documentElement, 'getAttribute').mockImplementation(
      name =>
        name === 'data-astryx-theme'
          ? 'root-app-shell-points'
          : originalGetAttribute(name),
    );

    render(
      <AppShell sideNav={<TestSideNav />} mobileNav={{breakpoint: 'lg'}}>
        <div>Content</div>
      </AppShell>,
    );

    expect(window.matchMedia).toHaveBeenCalledWith('(width < 1111px)');
  });

  it('supports the added xl breakpoint without a Theme provider', () => {
    render(
      <AppShell sideNav={<TestSideNav />} mobileNav={{breakpoint: 'xl'}}>
        <div>Content</div>
      </AppShell>,
    );

    expect(window.matchMedia).toHaveBeenCalledWith('(width < 1280px)');
  });

  it('does not enter mobile mode when mobileNav breakpoint is none', () => {
    render(
      <AppShell sideNav={<TestSideNav />} mobileNav={{breakpoint: 'none'}}>
        <div>Content</div>
      </AppShell>,
    );

    // breakpoint 'none' uses (width < 0px), which never matches,
    // so sideNav stays inline and no mobile nav toggle appears
    expect(screen.getByText('Nav')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: /menu/i}),
    ).not.toBeInTheDocument();
  });

  it('renders breakpoint none as non-mobile on the server regardless of the SSR hint', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(
      <AppShell
        sideNav={<TestSideNav />}
        mobileNav={{breakpoint: 'none', defaultIsMobile: true}}>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      host.querySelector(
        '.astryx-app-shell > .astryx-layout .astryx-layout-panel',
      ),
    ).not.toBeNull();
  });

  // ===========================================================================
  // Mobile overlay (default MobileNav wrapping sideNav)
  // ===========================================================================

  it('shows default mobile nav when below breakpoint and not collapsed', () => {
    // Start below breakpoint with sideNav expanded
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );

    // Should show default mobile nav (MobileNav wrapping sideNav)
    expect(screen.getByRole('dialog', {hidden: true})).toBeInTheDocument();
    // Should show nav content inside the mobile nav
    expect(screen.getByText('Nav')).toBeInTheDocument();
  });

  it('renders default mobile nav when below breakpoint', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );

    // Default mobile nav should be rendered when below breakpoint
    expect(screen.getByRole('dialog', {hidden: true})).toBeInTheDocument();
  });

  it('keeps TopNav children in the combined mobile drawer with sideNav content', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell
        topNav={
          <TopNav label="Navigation" heading={<TopNavHeading heading="App" />}>
            <TopNavItem label="Home" href="/" />
          </TopNav>
        }
        sideNav={<TestSideNav>Side item</TestSideNav>}>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole('button', {name: /open navigation/i}),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('dialog', {hidden: true}).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getAllByText('Side item').length).toBeGreaterThan(0);
  });

  it('shows mobile nav toggle for sideNav-only layout with heading-only topNav (#2243)', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell
        topNav={
          <TopNav
            label="Main navigation"
            heading={<TopNavHeading heading="My App" />}
          />
        }
        sideNav={<TestSideNav>Home</TestSideNav>}
        mobileNav={{breakpoint: 'md'}}>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole('button', {name: /open navigation/i}),
    ).toBeInTheDocument();
  });

  it('renders sidenav items exactly once in mobile drawer when topNav has only heading (#2243)', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell
        variant="section"
        topNav={
          <TopNav
            label="Main navigation"
            heading={<TopNavHeading heading="My App" />}
          />
        }
        sideNav={
          <SideNav>
            <SideNavItem label="Dashboard" href="/" isSelected />
            <SideNavItem label="Settings" href="/settings" />
          </SideNav>
        }
        mobileNav={{breakpoint: 'md'}}
        contentPadding={4}>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole('button', {name: /open navigation/i}),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard')).toHaveLength(1);
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('does not show auto mobile toggle when sideNav is explicitly undefined (#2243)', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell
        topNav={
          <TopNav
            label="Main navigation"
            heading={<TopNavHeading heading="My App" />}
          />
        }
        sideNav={undefined}
        mobileNav={{breakpoint: 'md'}}>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.queryByRole('button', {name: /open navigation/i}),
    ).not.toBeInTheDocument();
  });

  it('does not show auto mobile toggle when sideNav is omitted entirely', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell
        topNav={
          <TopNav
            label="Main navigation"
            heading={<TopNavHeading heading="My App" />}
          />
        }
        mobileNav={{breakpoint: 'md'}}>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.queryByRole('button', {name: /open navigation/i}),
    ).not.toBeInTheDocument();
  });

  it('heading-only topNav does not prevent sidenav from collapsing to mobile (#2243)', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    const {container} = render(
      <AppShell
        topNav={
          <TopNav
            label="Main navigation"
            heading={<TopNavHeading heading="My App" />}
          />
        }
        sideNav={<TestSideNav>Home</TestSideNav>}
        mobileNav={{breakpoint: 'md'}}>
        <div>Content</div>
      </AppShell>,
    );

    const inlinePanel = container.querySelector('.astryx-layout-panel');
    expect(inlinePanel).toBeNull();
  });

  it('renders mobile layout on first render when defaultIsMobile is true', () => {
    // matchMedia says mobile too — simulates correct SSR hint
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    const {container} = render(
      <AppShell sideNav={<TestSideNav />} mobileNav={{defaultIsMobile: true}}>
        <div>Content</div>
      </AppShell>,
    );

    // SideNav should NOT be rendered inline — it's in the mobile drawer
    const inlinePanel = container.querySelector(
      '.astryx-app-shell > .astryx-layout .astryx-layout-panel',
    );
    expect(inlinePanel).toBeNull();
  });

  // ===========================================================================
  // Height modes
  // ===========================================================================

  it('defaults to fill mode', () => {
    render(
      <AppShell data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    // The root element should exist (fill is default)
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  it('supports auto height mode', () => {
    render(
      <AppShell height="auto" data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  it('renders topNav in auto mode', () => {
    render(
      <AppShell height="auto" topNav={<div>Nav</div>} data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByText('Nav')).toBeInTheDocument();
  });

  // ===========================================================================
  // Sticky navigation in auto mode
  // ===========================================================================

  // A Field input wrapper carries a local z-index (it paints above the
  // attached status message box via a negative-margin overlap), so without a
  // component-owned isolation boundary it competes with page-level stacking —
  // a field scrolled underneath the sticky header then paints over it (#5689).
  // The fix is local containment: the Field root isolates the wrapper's local
  // layer, so the header needs no escalated z-index to stay above it. This
  // asserts that ownership boundary — the field's painted surface is an
  // isolated stacking context — not a comparison between two page-level
  // z-index values.
  it('contains Field input stacking locally so the sticky header needs no escalated z-index in auto mode', () => {
    render(
      <AppShell height="auto" topNav={<div>Nav</div>}>
        <TextInput
          label="Name"
          statusVariant="detached"
          value=""
          onChange={() => {}}
        />
      </AppShell>,
    );
    const header = screen.getByRole('banner');
    const inputWrapper = screen.getByRole('textbox').parentElement!;
    // The detached variant renders the input wrapper outside Field's isolated
    // attached-status wrapper, so the Field root must own the boundary.
    const fieldRoot = inputWrapper.parentElement!;
    expect(inputWrapper).toBeTruthy();
    expect(getComputedStyle(header).position).toBe('sticky');
    // The header stays at its normal local stacking level — no escalation.
    expect(Number(getComputedStyle(header).zIndex)).toBe(1);
    expect(getComputedStyle(inputWrapper).position).toBe('relative');
    // Field's local layers cannot escape into page-level stacking: the root
    // establishes an isolation boundary around the input wrapper's z-index.
    expect(getComputedStyle(fieldRoot).isolation).toBe('isolate');
  });

  it('wraps header in sticky container in auto mode', () => {
    render(
      <AppShell
        height="auto"
        topNav={<div data-testid="topnav">Nav</div>}
        data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    const topNav = screen.getByTestId('topnav');
    // The sticky wrapper is the parent of the LayoutHeader div
    // topNav -> LayoutHeader div -> sticky wrapper div
    const headerWrapper = topNav.parentElement?.parentElement;
    expect(headerWrapper).toBeTruthy();
    expect(
      headerWrapper?.style.position ||
        getComputedStyle(headerWrapper!).position,
    ).toBeDefined();
  });

  it('renders an opaque section header only in auto mode', () => {
    const {rerender} = render(
      <AppShell height="auto" variant="section" topNav={<div>Nav</div>}>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      getComputedStyle(screen.getByRole('banner')).backgroundColor,
    ).not.toBe('rgba(0, 0, 0, 0)');

    rerender(
      <AppShell height="fill" variant="section" topNav={<div>Nav</div>}>
        <div>Content</div>
      </AppShell>,
    );
    expect(getComputedStyle(screen.getByRole('banner')).backgroundColor).toBe(
      'rgba(0, 0, 0, 0)',
    );
  });

  it('does not apply sticky wrapper in fill mode', () => {
    render(
      <AppShell
        height="fill"
        topNav={<div data-testid="topnav">Nav</div>}
        data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    // In fill mode, header still renders but without sticky wrapper styles
    expect(screen.getByTestId('topnav')).toBeInTheDocument();
  });

  it('wraps sideNav in sticky container in auto mode', () => {
    render(
      <AppShell
        height="auto"
        topNav={<div>Nav</div>}
        sideNav={<div data-testid="sidenav">Side</div>}
        data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByTestId('sidenav')).toBeInTheDocument();
    // The sideNav should be wrapped in a sticky div in auto mode
    const sideNav = screen.getByTestId('sidenav');
    // sideNav -> LayoutPanel div -> sticky wrapper div
    const stickyWrapper = sideNav.parentElement?.parentElement;
    expect(stickyWrapper).toBeTruthy();
  });

  it('sets up ResizeObserver on header in auto mode', () => {
    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(public callback: ResizeObserverCallback) {}
        observe = observeSpy;
        unobserve = vi.fn();
        disconnect = disconnectSpy;
      },
    );

    render(
      <AppShell height="auto" topNav={<div>Nav</div>} data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );

    expect(observeSpy).toHaveBeenCalled();
  });

  it('does not observe the header in fill mode', () => {
    const observeSpy = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(public callback: ResizeObserverCallback) {}
        observe = observeSpy;
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );

    render(
      <AppShell height="fill" topNav={<div>Nav</div>} data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );

    // Only the header offset needs measuring for sticky positioning, which
    // fill mode does not use. (Main is measured for keyboard access.)
    const observed = new Set<unknown>();
    for (const call of observeSpy.mock.calls) {
      observed.add(call[0]);
    }
    expect(observed.has(screen.getByRole('banner'))).toBe(false);
  });

  // ===========================================================================
  // Mobile nav slot
  // ===========================================================================

  it('renders mobileNav slot content', () => {
    render(
      <AppShell
        sideNav={<TestSideNav />}
        mobileNav={
          <MobileNav
            isOpen={true}
            onOpenChange={() => {}}
            header="Test App"
            data-testid="appshell-mobile-nav">
            <div>Mobile Nav Content</div>
          </MobileNav>
        }>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByTestId('appshell-mobile-nav')).toBeInTheDocument();
    expect(screen.getByText('Mobile Nav Content')).toBeInTheDocument();
  });

  it('does not render mobileNav when not provided', () => {
    render(
      <AppShell sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.queryByTestId('appshell-mobile-nav')).not.toBeInTheDocument();
  });

  it('uses explicit mobileNav instead of default when provided', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell
        sideNav={<TestSideNav />}
        mobileNav={
          <MobileNav
            isOpen={false}
            onOpenChange={() => {}}
            data-testid="appshell-mobile-nav">
            <div>Mobile Nav</div>
          </MobileNav>
        }>
        <div>Content</div>
      </AppShell>,
    );
    // Default auto-generated mobile nav should NOT appear — only the explicit one
    // (The explicit mobileNav is rendered as a ReactNode, so only one dialog exists)
    const dialogs = screen.getAllByRole('dialog', {hidden: true});
    expect(dialogs).toHaveLength(1);
    // Explicit mobileNav slot should be rendered
    expect(screen.getByTestId('appshell-mobile-nav')).toBeInTheDocument();
  });

  it('mobileNav onOpenChange is called when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <AppShell
        sideNav={<TestSideNav />}
        mobileNav={
          <MobileNav isOpen={true} onOpenChange={onClose} header="Nav">
            <div>Mobile Nav</div>
          </MobileNav>
        }>
        <div>Content</div>
      </AppShell>,
    );
    const closeButton = screen.getByRole('button', {
      name: /close/i,
    });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  // ===========================================================================
  // Content padding
  // ===========================================================================

  it('passes contentPadding to main content area', () => {
    render(
      <AppShell contentPadding={4} data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    // Main content should render — contentPadding is passed through
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('defaults to contentPadding={0} when not specified', () => {
    render(
      <AppShell data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    // Should render without error — padding=0 is the default
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('supports contentPadding={0} for full-bleed content', () => {
    render(
      <AppShell contentPadding={0} data-testid="shell">
        <div>Full bleed content</div>
      </AppShell>,
    );
    expect(screen.getByText('Full bleed content')).toBeInTheDocument();
  });

  // ===========================================================================
  // Ref forwarding
  // ===========================================================================

  it('forwards ref to root element', () => {
    const ref = vi.fn();
    render(
      <AppShell ref={ref} data-testid="shell">
        <div>Content</div>
      </AppShell>,
    );
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBe(screen.getByTestId('shell'));
  });
  // ===========================================================================
  // Keyboard operation
  //
  // The focus TRAP and focus RESTORE contracts of the drawer are native
  // <dialog> behaviour and cannot be asserted here: jsdom has no dialog
  // implementation, so this file shims showModal()/close() with an `open`
  // attribute. Those two were verified in Chromium instead. What is asserted
  // here is everything the shim can still prove: the keyboard path to each
  // control, and the ARIA wiring between the toggle and the drawer.
  // ===========================================================================

  it('reaches the skip link with Tab and moves focus to main with Enter', async () => {
    const user = userEvent.setup();
    render(
      <AppShell topNav={<TopNav label="Main navigation" />}>
        <div>Content</div>
      </AppShell>,
    );

    await user.tab();
    const skipLink = screen.getByTestId('skip-to-content');
    expect(skipLink).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('opens the mobile drawer from the keyboard and points the toggle at it', async () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));
    const user = userEvent.setup();

    render(
      <AppShell sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );

    const toggle = screen.getByRole('button', {name: 'Open navigation'});
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    toggle.focus();
    await user.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByRole('dialog', {hidden: true});
    // aria-controls has to name the drawer that actually opened, or a screen
    // reader cannot follow the toggle to it.
    expect(toggle.getAttribute('aria-controls')).toBe(drawer.id);
    expect(drawer.id).toBeTruthy();
  });

  // ===========================================================================
  // Banner landmark on the mobile top bar
  // ===========================================================================

  it('exposes the mobile top bar as a banner landmark in a sidenav-only layout', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );

    // Same landmark structure as the topNav layout: one banner region holding
    // the top bar, whichever nav slots the page happens to fill.
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders exactly one banner landmark when a banner slot joins the mobile top bar', () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));

    render(
      <AppShell banner={<div>Announcement</div>} sideNav={<TestSideNav />}>
        <div>Content</div>
      </AppShell>,
    );

    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });

  // ===========================================================================
  // useAppShellMobile
  // ===========================================================================

  function MobileProbe() {
    const {isMobile, isMobileNavOpen, isMobileNavEnabled, mobileNavId} =
      useAppShellMobile();
    return (
      <span data-testid="probe">
        {JSON.stringify({
          isMobile,
          isMobileNavOpen,
          isMobileNavEnabled,
          hasId: mobileNavId != null,
        })}
      </span>
    );
  }

  it('useAppShellMobile is inert outside an AppShell', () => {
    render(<MobileProbe />);
    expect(JSON.parse(screen.getByTestId('probe').textContent)).toEqual({
      isMobile: false,
      isMobileNavOpen: false,
      isMobileNavEnabled: false,
      hasId: false,
    });
  });

  it('useAppShellMobile reports the shell mobile state and drawer id', async () => {
    mockMql = createMockMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql));
    const user = userEvent.setup();

    render(
      <AppShell sideNav={<TestSideNav />}>
        <MobileProbe />
      </AppShell>,
    );

    expect(JSON.parse(screen.getByTestId('probe').textContent)).toEqual({
      isMobile: true,
      isMobileNavOpen: false,
      isMobileNavEnabled: true,
      hasId: true,
    });

    await user.click(screen.getByRole('button', {name: 'Open navigation'}));

    expect(
      JSON.parse(screen.getByTestId('probe').textContent).isMobileNavOpen,
    ).toBe(true);
  });
});

describe('AppShell main keyboard access', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    // jsdom does not expand LayoutContent's `overflow` into its longhands.
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudo) => {
        const computed = nativeGetComputedStyle(element, pseudo);
        return new Proxy(computed, {
          // eslint-disable-next-line @typescript-eslint/promise-function-async -- Proxy traps must remain synchronous
          get(target, property) {
            if (property === 'overflowX' || property === 'overflowY') {
              return target.overflow || 'visible';
            }
            return Reflect.get(target, property, target);
          },
        });
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  function setMainGeometry(main: HTMLElement, scrollHeight: number) {
    for (const [key, value] of [
      ['clientWidth', 800],
      ['scrollWidth', 800],
      ['clientHeight', 300],
      ['scrollHeight', scrollHeight],
      ['scrollTop', 0],
      ['scrollLeft', 0],
    ] as const) {
      Object.defineProperty(main, key, {
        configurable: true,
        value,
        writable: true,
      });
    }
  }

  function remeasure() {
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    act(() => {
      const pending = frames.splice(0);
      pending.forEach(callback => callback(performance.now()));
    });
  }

  it('makes main a keyboard stop while it scrolls overflowing content, and a skip target again once it fits', () => {
    render(
      <AppShell topNav={<div>Nav</div>}>
        <p>Long content</p>
      </AppShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('tabindex', '-1');

    setMainGeometry(main, 1200);
    remeasure();
    expect(main).toHaveAttribute('tabindex', '0');

    setMainGeometry(main, 300);
    remeasure();
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('observes main only with fill, where it can become a keyboard stop', () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(public callback: ResizeObserverCallback) {}
        observe(target: Element) {
          observed.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const inMain = (main: HTMLElement) =>
      observed.filter(target => target === main || main.contains(target));

    const {unmount} = render(
      <AppShell height="auto" topNav={<div>Nav</div>}>
        <p>Long content</p>
      </AppShell>,
    );
    expect(inMain(screen.getByRole('main'))).toEqual([]);
    unmount();

    render(
      <AppShell topNav={<div>Nav</div>}>
        <p>Long content</p>
      </AppShell>,
    );
    expect(inMain(screen.getByRole('main')).length).toBeGreaterThan(0);
  });

  it('stops observing main when the shell switches to auto, and measures it again back in fill', () => {
    const {rerender} = render(
      <AppShell topNav={<div>Nav</div>}>
        <p>Long content</p>
      </AppShell>,
    );
    const main = screen.getByRole('main');
    setMainGeometry(main, 1200);
    remeasure();
    expect(main).toHaveAttribute('tabindex', '0');

    rerender(
      <AppShell height="auto" topNav={<div>Nav</div>}>
        <p>Long content</p>
      </AppShell>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    remeasure();
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');

    // Back in fill, main is measured as it attaches, with no other signal.
    rerender(
      <AppShell topNav={<div>Nav</div>}>
        <p>Long content</p>
      </AppShell>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '0');
  });

  it('never makes main a keyboard stop when the page scrolls instead (auto)', () => {
    render(
      <AppShell height="auto" topNav={<div>Nav</div>}>
        <p>Long content</p>
      </AppShell>,
    );
    const main = screen.getByRole('main');

    setMainGeometry(main, 1200);
    remeasure();
    expect(main).toHaveAttribute('tabindex', '-1');
  });
});
