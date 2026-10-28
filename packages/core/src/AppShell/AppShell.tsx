// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import React from 'react';

/**
 * @file AppShell.tsx
 * @input Uses React, Theme-resolved breakpoints, Layout, navigation slots, and StyleX
 * @output Exports AppShell component and AppShellProps with SSR-safe mobile layout
 * @position Page shell for an application — the top-level wrapper for any app.
 *   Composes Layout internally to provide header, sideNav, and main content areas.
 *   Use for any app that needs a top nav, side navigation, and scrollable content.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/AppShell/AppShell.doc.mjs
 * - /packages/core/src/AppShell/index.ts
 * - /packages/core/src/AppShell/AppShell.test.tsx
 * - /apps/storybook/stories/AppShell.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/AppShell/ (showcase blocks)
 */

import {
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {Layout} from '../Layout/Layout';
import {LayoutHeader} from '../Layout/LayoutHeader';
import {LayoutPanel} from '../Layout/LayoutPanel';
import {LayoutContent} from '../Layout/LayoutContent';
import {MobileNavToggle} from '../MobileNav/MobileNavToggle';
import {MAX_CLOSE_DELAY_MS as MOBILE_NAV_MAX_CLOSE_DELAY_MS} from '../MobileNav/MobileNav';
import {SideNavRenderContext} from '../SideNav/SideNavRenderContext';
import {SideNavShellContext, type SideNavShell} from '../SideNav/railMotion';
import {useAnimatedLayout} from '../hooks/useAnimatedLayout';
import {
  holdLayoutSwap,
  landLayoutGlide,
  layoutMotionFor,
  playLayoutFrames,
  playLayoutSwap,
  reportLayoutChange,
  type LayoutChange,
  type LayoutSwap,
} from '../motion/animatedLayout';
import {TopNavRenderContext} from '../TopNav/TopNavRenderContext';
import {TopNavMobileContentContext} from '../TopNav/TopNavMobileContentContext';
import {AppShellMobileContext} from './AppShellMobileContext';
import type {AppShellMobileContextValue} from './AppShellMobileContext';
import type {SpacingStep} from '../utils/types';
import type {BaseProps} from '../BaseProps';
import {mergeProps, isRenderable} from '../utils';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {observeResize} from '../utils/sharedResizeObserver';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import {useThemeDefinition} from '../theme/useTheme';
import {
  DEFAULT_WIDTH_BREAKPOINTS,
  type WidthBreakpointName,
} from '../theme/themeAdaptations';
import type {AppShellVariantMap} from './index';

import {useMergedRefs} from '../hooks/useMergedRefs';
const HasActivity = typeof React.Activity !== 'undefined';
const ActivityWrapper = HasActivity
  ? ({
      mode,
      children,
    }: {
      mode: 'visible' | 'hidden';
      children: React.ReactNode;
    }) => <React.Activity mode={mode}>{children}</React.Activity>
  : ({children}: {mode: string; children: React.ReactNode}) => <>{children}</>;

// =============================================================================
// Constants
// =============================================================================

const MAIN_CONTENT_ID = 'astryx-app-shell-main';

/**
 * Extra time, on top of MobileNav's own worst-case close delay, that
 * AppShell waits before flipping its `Activity` boundary to `'hidden'`.
 *
 * React's `Activity` hides its subtree with `display: none !important`
 * synchronously in the same commit as the mode flip, and re-runs the
 * cleanup of every effect inside it — which would otherwise clear
 * MobileNav's own scheduled `dialog.close()` before it fires, or cut off
 * its slide-out CSS transition before it plays (#5701). Waiting strictly
 * longer than MobileNav's own cap, rather than the same duration, means
 * this never turns into a race decided by browser timer-firing order.
 */
const ACTIVITY_HIDE_BUFFER_MS = 50;

// =============================================================================
// Types
// =============================================================================

/**
 * SideNav breakpoint options. Named points resolve through the nearest Theme;
 * without an active theme they use Astryx's default width-breakpoint map.
 */
export type AppShellBreakpoint = WidthBreakpointName | 'none';

/**
 * Navigation background style:
 * - `wash`: Nav areas use wash background, no dividers
 * - `surface`: Nav areas use surface background, no dividers
 * - `section`: Dividers between nav and content (classic look)
 * - `elevated`: Wash nav background with elevated surface content + border radius
 * @default 'elevated'
 */

/**
 * Navigation background style. Extensible via module augmentation of AppShellVariantMap.
 */
export type AppShellVariant = keyof AppShellVariantMap;

/**
 * Configuration object for mobile navigation behavior.
 * Used when you need to customize the auto mobile nav without replacing it entirely.
 */
export interface MobileNavConfig {
  /**
   * Whether to auto-render the hamburger toggle.
   * When false, use `<MobileNavToggle />` to place it yourself.
   * @default true
   */
  hasToggle?: boolean;

  /**
   * Controlled open state. When provided, AppShell doesn't manage
   * mobile nav state internally.
   */
  isOpen?: boolean;

  /**
   * Callback when the mobile nav drawer open state changes.
   */
  onOpenChange?: (isOpen: boolean) => void;

  /**
   * Custom drawer content. Replaces the auto-generated drawer.
   * Can be an `<MobileNav>` for full drawer config (title, width, side)
   * or raw children.
   */
  content?: ReactNode;

  /**
   * Named Theme width point below which mobile nav activates. `sm`, `md`,
   * `lg`, `xl`, and `2xl` resolve through the nearest Theme's effective
   * `adaptations.widthBreakpoints`; equality belongs to the wider layout.
   * Use `none` to disable automatic mobile mode.
   * @default 'md'
   */
  breakpoint?: AppShellBreakpoint;

  /**
   * SSR hint: whether the initial render should assume mobile layout.
   * Seeds the breakpoint state so the server-rendered HTML matches
   * the client on mobile devices, avoiding a layout flash. Ignored when
   * `breakpoint` is `none`, which is always non-mobile.
   *
   * Derive from the User-Agent header or a device-detection cookie
   * in a server component, then pass down.
   *
   * @default false
   */
  defaultIsMobile?: boolean;
}

export interface AppShellProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Navigation background style controlling how nav areas contrast with content.
   * - `wash`: Nav uses wash background, no dividers
   * - `surface`: Nav uses surface background, no dividers
   * - `section`: Dividers between nav and content (classic look)
   * - `elevated`: Wash nav with elevated surface content area + border radius
   * @default 'elevated'
   */
  variant?: AppShellVariant;

  /**
   * Optional banner slot for system-wide announcements.
   * Renders above the top nav and scrolls away with the page in auto mode.
   */
  banner?: ReactNode;

  /**
   * Main content area (rendered as `<main>`).
   */
  children: ReactNode;

  /**
   * Padding for the main content area using the spacing scale.
   * Set based on the dominant content pattern for the page:
   * - `4` (16px) — standard padding for forms, settings, text-heavy pages
   * - `0` — no padding, for dashboards, maps, tables that need edge-to-edge
   * Override individual sections with `<Section padding={...}>`.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  contentPadding?: SpacingStep;

  /**
   * Height behavior:
   * - `fill`: Shell fills viewport, content scrolls internally (default)
   * - `auto`: Shell grows with content, page scrolls as a whole
   * @default 'fill'
   */
  height?: 'fill' | 'auto';

  /**
   * Mobile navigation configuration.
   *
   * Accepts three shapes:
   * - **`false`** — Disable mobile nav entirely.
   * - **`MobileNavConfig` object** — Configure auto behavior (toggle, controlled state, custom content).
   * - **`ReactNode`** — Full escape hatch: provide your own `<MobileNav>` (you own everything).
   *
   * When omitted, AppShell automatically generates a mobile drawer with
   * sideNav content (and TopNav items in the future) below the breakpoint.
   *
   * @example
   * ```
   * <AppShell topNav={...} sideNav={...} />
   * <AppShell mobileNav={{ isOpen, onOpenChange }} />
   * <AppShell mobileNav={{ hasToggle: false }}>
   *   <MobileNavToggle />
   * </AppShell>
   * <AppShell mobileNav={<MobileNav header="Menu">...</MobileNav>} />
   * <AppShell mobileNav={false} />
   * ```
   */
  mobileNav?: false | MobileNavConfig | ReactNode;

  /**
   * Side navigation — typically an SideNav.
   *
   * Pass `undefined` (or omit) when a page has no side navigation.
   * Do NOT pass a component that renders `null` — AppShell treats any
   * renderable value as "sidenav exists".
   *
   * **Next.js parallel routes:** Conditionally pass the slot based on
   * the current route rather than relying on a `default.tsx` that
   * returns `null`:
   *
   * @example
   * ```
   * const SIDEBAR_ROUTES = ['/dashboard', '/settings'];
   * function Layout({ children, sidebar }) {
   *   const hasSidebar = SIDEBAR_ROUTES.some(r => pathname.startsWith(r));
   *   return (
   *     <AppShell
   *       sideNav={hasSidebar ? sidebar : undefined}
   *       mobileNav={hasSidebar ? { breakpoint: 'md' } : false}>
   *       {children}
   *     </AppShell>
   *   );
   * }
   * ```
   */
  sideNav?: ReactNode;

  /**
   * Top navigation — typically an TopNav.
   * Same contract as `sideNav` — pass `undefined` when there's no top nav.
   */
  topNav?: ReactNode;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'clip',
  },
  variantWash: {
    backgroundColor: colorVars['--color-background-body'],
  },
  variantSurface: {
    backgroundColor: colorVars['--color-background-surface'],
  },
  variantSection: {
    backgroundColor: colorVars['--color-background-surface'],
  },
  variantElevated: {
    backgroundColor: colorVars['--color-background-body'],
  },
  rootFill: {
    height: '100dvh',
  },
  rootAuto: {
    minHeight: '100dvh',
  },
  skipLink: {
    // Visually hidden by default, visible on focus (keyboard navigation)
    position: {
      default: 'absolute',
      ':focus': 'fixed',
    },
    width: {
      default: '1px',
      ':focus': 'auto',
    },
    height: {
      default: '1px',
      ':focus': 'auto',
    },
    paddingBlock: {
      default: 0,
      ':focus': spacingVars['--spacing-2'],
    },
    paddingInline: {
      default: 0,
      ':focus': spacingVars['--spacing-4'],
    },
    margin: {
      default: '-1px',
      ':focus': 0,
    },
    overflow: {
      default: 'hidden',
      ':focus': 'visible',
    },
    clipPath: {
      default: 'inset(50%)',
      ':focus': 'none',
    },
    whiteSpace: {
      default: 'nowrap',
      ':focus': 'normal',
    },
    borderWidth: 0,
    // Focus styles
    top: {
      default: 0,
      ':focus': spacingVars['--spacing-2'],
    },
    insetInlineStart: {
      default: 0,
      ':focus': spacingVars['--spacing-2'],
    },
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-accent'],
    zIndex: 9999,
    textDecoration: 'none',
    fontWeight: fontWeightVars['--font-weight-semibold'],
    fontSize: typeScaleVars['--text-body-size'],
  },
  // Programmatic focus target for the skip link. The main container is only
  // focusable via tabIndex={-1} (never tabbable), so a focus ring around the
  // entire content area would be noise rather than guidance — suppress it.
  mainFocusTarget: {
    outline: {
      default: null,
      ':focus': 'none',
    },
  },

  elevatedBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: colorVars['--color-background-surface'],
    borderStartStartRadius: radiusVars['--radius-page'],
    pointerEvents: 'none',
  },
  contentWrapper: {
    display: 'contents',
  },
  elevatedContentWrapper: {
    position: 'relative',
    display: 'flex',
    flex: 1,
    minHeight: 0,
    height: '100%',
  },
  contentBgSurface: {
    backgroundColor: colorVars['--color-background-surface'],
  },
  contentBgWash: {
    backgroundColor: colorVars['--color-background-body'],
  },
  contentBgTransparent: {
    backgroundColor: 'transparent',
    isolation: 'isolate',
  },
  navAreaWash: {
    backgroundColor: colorVars['--color-background-body'],
  },
  navAreaSurface: {
    backgroundColor: colorVars['--color-background-surface'],
  },
  banner: {
    flexShrink: 0,
  },
  hidden: {
    display: 'none',
  },
  autoMobileTopBar: {
    display: 'flex',
    alignItems: 'center',
    height: spacingVars['--spacing-12'],
    paddingInline: spacingVars['--spacing-2'],
  },
  // Sticky header for auto height mode. The header stays at its local
  // stacking level — Field-owned input surfaces contain their own local
  // z-index layers (AST-027), so no escalated page-level value is needed
  // for the header to paint above scrolled content.
  headerSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  // Sticky sideNav for auto height mode — sticks within the wrapper.
  // This div replaces the panel as the direct flex child of the middle
  // (horizontal) container, so it needs the same flex properties that
  // LayoutPanel applies: flexShrink: 0 prevents the flex container
  // from collapsing the sidenav, and overflow: clip matches the panel's
  // default so content doesn't bleed horizontally.
  sideNavSticky: {
    flexShrink: 0,
    overflow: 'clip',
    position: 'sticky',
    top: 'var(--_app-shell-header-height, 0px)',
    height: 'calc(100dvh - var(--_app-shell-header-height, 0px))',
    // Ensure children (LayoutPanel → SideNav) fill the sticky container
    display: 'flex',
    flexDirection: 'column',
  },
  // Panel fill for auto mode — panel fills the sticky container vertically
  // and scrolls independently since the page (not the panel) owns the scroll
  panelAutoFill: {
    flex: 1,
    overflow: 'auto',
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * Page shell for an application. Provides the structural frame for an app:
 * top navigation, side navigation, and main content area.
 *
 * Slot-based API with `topNav`, `sideNav`, `banner`, and `children`.
 * Supports two height modes (`fill` and `auto`), responsive side nav
 * collapse, and mobile overlay with backdrop.
 *
 * @example
 * ```
 * <AppShell
 *   topNav={<TopNav label="Navigation" heading={<TopNavHeading heading="My App" />} />}
 *   sideNav={<SideNav>{navSections}</SideNav>}
 *   mobileNav={
 *     <MobileNav isOpen={mobileOpen} onOpenChange={(open) => setMobileOpen(open)} header="My App">
 *       {navSections}
 *     </MobileNav>
 *   }>
 *   <Content />
 * </AppShell>
 * ```
 */

/**
 * The column beside the rail that holds `main`: its ancestor whose parent
 * also holds the rail. The glide moves it; the rail's edge rides it.
 */
function columnOf(main: HTMLElement, rail: HTMLElement | null): HTMLElement {
  let column = main;
  while (column.parentElement != null && !column.parentElement.contains(rail)) {
    column = column.parentElement;
  }
  return column;
}

export function AppShell({
  variant = 'elevated',
  banner,
  children,
  contentPadding,
  'data-testid': dataTestId,
  height = 'fill',
  mobileNav,
  sideNav,
  topNav,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: AppShellProps) {
  const t = useTranslator();
  const activeTheme = useThemeDefinition();
  // =========================================================================
  // Parse mobileNav prop — normalize to config, custom element, or disabled
  // =========================================================================
  const mobileNavDisabled = mobileNav === false;
  const mobileNavConfig: MobileNavConfig | null =
    mobileNav != null &&
    mobileNav !== false &&
    typeof mobileNav === 'object' &&
    !isValidElement(mobileNav)
      ? (mobileNav as MobileNavConfig)
      : null;
  const sideNavBreakpoint: AppShellBreakpoint =
    mobileNavConfig?.breakpoint ?? 'md';
  // ReactNode shorthand — user provides <MobileNav> directly as the prop
  const mobileNavReactNode: ReactNode | null =
    mobileNav != null &&
    mobileNav !== false &&
    (isValidElement(mobileNav) || typeof mobileNav === 'string')
      ? mobileNav
      : null;
  // Custom content from config object
  const mobileNavConfigContent: ReactNode | null =
    mobileNavConfig?.content ?? null;
  const mobileNavHasToggle = mobileNavConfig?.hasToggle !== false;
  const mobileNavIsControlled = mobileNavConfig?.isOpen !== undefined;

  // =========================================================================
  // Slot presence — checks whether slot containers have rendered DOM content.
  // Refs are attached to wrapper divs around each slot; a MutationObserver
  // checks childNodes to track whether each slot has rendered content.
  // =========================================================================

  // =========================================================================
  // Mobile nav open state (controlled + uncontrolled)
  // =========================================================================
  const activeWidthBreakpoints = activeTheme?.__adaptations?.widthBreakpoints;
  const breakpointQuery =
    sideNavBreakpoint === 'none'
      ? '(width < 0px)'
      : `(width < ${
          activeWidthBreakpoints?.[sideNavBreakpoint] ??
          DEFAULT_WIDTH_BREAKPOINTS[sideNavBreakpoint]
        }px)`;
  const isBelowBreakpoint = useMediaQuery(
    breakpointQuery,
    sideNavBreakpoint === 'none' ? false : mobileNavConfig?.defaultIsMobile,
  );
  const [uncontrolledMobileOpen, setUncontrolledMobileOpen] = useState(false);
  const isMobileNavOpen = mobileNavConfig?.isOpen ?? uncontrolledMobileOpen;

  // Holds the mobile nav's `Activity` boundary visible for a beat after a
  // close, so MobileNav's own close effect gets a real chance to run its
  // slide-out transition and schedule its delayed `dialog.close()` before
  // Activity hides the subtree (#5701). Only the CLOSE is deferred: opening
  // reads `isMobileNavOpen` directly below, so a controlled open is visible in
  // the commit that carries it instead of one effect later.
  const [isMobileNavCloseHeld, setIsMobileNavCloseHeld] =
    useState(isMobileNavOpen);
  // Arm the hold during render, from the open state itself, so no Effect has
  // to copy props into state; the Effect below only owns the release timer.
  if (isMobileNavOpen && !isMobileNavCloseHeld) {
    setIsMobileNavCloseHeld(true);
  }
  useEffect(() => {
    if (!HasActivity || isMobileNavOpen) {
      return;
    }
    const delayMs = window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
      ? 0
      : MOBILE_NAV_MAX_CLOSE_DELAY_MS + ACTIVITY_HIDE_BUFFER_MS;
    const timeout = setTimeout(() => {
      setIsMobileNavCloseHeld(false);
    }, delayMs);
    return () => clearTimeout(timeout);
  }, [isMobileNavOpen]);
  const isMobileNavActivityVisible = isMobileNavOpen || isMobileNavCloseHeld;

  const mobileNavOnOpenChange = mobileNavConfig?.onOpenChange;
  const setMobileNavOpen = useCallback(
    (open: boolean) => {
      if (!mobileNavIsControlled) {
        setUncontrolledMobileOpen(open);
      }
      mobileNavOnOpenChange?.(open);
    },
    // Depend on the callback itself, not on the config object: the documented
    // usage is an inline `mobileNav={{isOpen, onOpenChange}}` literal, which is
    // a new object every render and would otherwise churn this callback and the
    // context value memo built from it on every render of the shell.
    [mobileNavIsControlled, mobileNavOnOpenChange],
  );

  // Move focus to the main content container when the skip link is activated.
  // Hash navigation alone doesn't reliably move focus in every browser, so
  // focus the target explicitly (it's focusable via tabIndex={-1}).
  const handleSkipLinkClick = useCallback(() => {
    document.getElementById(MAIN_CONTENT_ID)?.focus();
  }, []);

  const isFill = height === 'fill';
  const isAuto = height === 'auto';

  // Nav style derived values
  const hasBanner = isRenderable(banner);
  const hasTopNav = isRenderable(topNav);
  const hasSideNav = isRenderable(sideNav);
  const hasNavContent = hasTopNav || hasSideNav;
  const mobileNavEnabled =
    !mobileNavDisabled && hasNavContent && mobileNavReactNode == null;
  const navHasDividers = variant === 'section';
  const isElevated = variant === 'elevated';
  const navAreaStyle =
    variant === 'wash' || variant === 'elevated'
      ? styles.navAreaWash
      : variant === 'surface'
        ? styles.navAreaSurface
        : undefined;
  // Section normally inherits the shell's surface background. Its auto-height
  // header needs to paint that surface itself while content scrolls beneath it.
  const headerAreaStyle =
    navAreaStyle ??
    (isAuto && variant === 'section' ? styles.navAreaSurface : undefined);
  const contentAreaStyle =
    variant === 'wash'
      ? styles.contentBgWash
      : variant === 'elevated' && hasTopNav && hasSideNav && !isBelowBreakpoint
        ? styles.contentBgTransparent
        : variant === 'surface' || variant === 'elevated'
          ? styles.contentBgSurface
          : undefined;

  // Background for sticky elements in auto mode — must be opaque so content
  // doesn't show through when scrolling underneath. Uses the nav area bg if
  // set, otherwise falls back to the shell variant bg (always surface for section).
  const stickyBgStyle = navAreaStyle ?? styles.navAreaSurface;

  // =========================================================================
  // Header height measurement for sticky sideNav offset (auto mode)
  // =========================================================================
  const headerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuto || !headerRef.current || !shellRef.current) {
      return;
    }

    const headerEl = headerRef.current;
    const shellEl = shellRef.current;

    const updateHeight = () => {
      const height = headerEl.getBoundingClientRect().height;
      shellEl.style.setProperty('--_app-shell-header-height', `${height}px`);
    };

    return observeResize(headerEl, () => updateHeight());
  }, [isAuto]);

  // =========================================================================
  // Determine if sideNav should show as overlay (mobile) or inline
  // =========================================================================
  const showSideNavInline = hasSideNav && !isBelowBreakpoint;

  // Mobile nav rendering modes:
  // 1. ReactNode shorthand — user provided <MobileNav> directly
  const shouldRenderMobileNavReactNode = mobileNavReactNode != null;
  // 2. Config with custom content
  const shouldRenderConfigContent =
    mobileNavEnabled && mobileNavConfigContent != null && isBelowBreakpoint;

  // =========================================================================
  // Mobile context — shared with MobileNavToggle and future TopNav mobile
  // =========================================================================
  // Stable id shared by the drawer (applied as its `id`) and the toggle
  // (referenced via `aria-controls`) so screen readers know what it controls.
  const mobileNavId = useId();
  const mobileContextValue = useMemo<AppShellMobileContextValue>(
    () => ({
      isMobile: isBelowBreakpoint,
      isMobileNavOpen,
      mobileNavId,
      toggleMobileNav: () =>
        mobileNavEnabled && setMobileNavOpen(!isMobileNavOpen),
      openMobileNav: () => mobileNavEnabled && setMobileNavOpen(true),
      closeMobileNav: () => setMobileNavOpen(false),
      isMobileNavEnabled: mobileNavEnabled,
      hasAutoToggle: mobileNavHasToggle,
    }),
    [
      isBelowBreakpoint,
      isMobileNavOpen,
      mobileNavId,
      setMobileNavOpen,
      mobileNavEnabled,
      mobileNavHasToggle,
    ],
  );

  // =========================================================================
  // Build header content (topNav + banner)
  //
  // In auto mode, the header wrapper gets sticky positioning so the topNav
  // stays pinned while the page scrolls. The ref is used to measure header
  // height for the sideNav's sticky offset.
  // =========================================================================
  // When below breakpoint, TopNav renders in mobile-bar mode (heading + endContent + toggle).
  // Wrap with mobile content context so TopNav knows there's SideNav content
  // in the drawer and shows the toggle even without its own collapsible items.
  const mobileContentValue =
    hasSideNav && mobileNavHasToggle ? (
      // eslint-disable-next-line @eslint-react/no-unstable-context-value -- context transports ReactNode; instability is inherent
      <SideNavRenderContext value="drawer-content">
        {sideNav}
      </SideNavRenderContext>
    ) : null;

  const drawerMobileContentValue = hasSideNav ? (
    // eslint-disable-next-line @eslint-react/no-unstable-context-value -- context transports ReactNode; instability is inherent
    <SideNavRenderContext value="drawer-content">
      {sideNav}
    </SideNavRenderContext>
  ) : null;

  const topNavContent = hasTopNav ? (
    isBelowBreakpoint && !mobileNavDisabled && mobileNavReactNode == null ? (
      <TopNavMobileContentContext value={mobileContentValue}>
        <TopNavRenderContext value="mobile-bar">{topNav}</TopNavRenderContext>
      </TopNavMobileContentContext>
    ) : (
      topNav
    )
  ) : null;

  const headerInner =
    hasTopNav || hasBanner ? (
      <LayoutHeader padding={0} hasDivider={navHasDividers && hasTopNav}>
        {hasBanner && (
          <div {...stylex.props(styles.banner, navAreaStyle)}>{banner}</div>
        )}
        {hasTopNav && topNavContent}
      </LayoutHeader>
    ) : undefined;

  const headerContent = isRenderable(headerInner) ? (
    <div
      ref={headerRef}
      // Top-level banner landmark for the header region (topNav + banner).
      // Safe here: the wrapper is never nested inside main/nav/other landmarks.
      role="banner"
      {...mergeProps(
        themeProps('app-shell-header', {variant}),
        stylex.props(headerAreaStyle, isAuto && styles.headerSticky),
      )}>
      {headerInner}
    </div>
  ) : undefined;

  // =========================================================================
  // While the inline side nav collapses or expands, the content area holds
  // its own animated layout handle (`component:AppShell` FR17): the column
  // beside the rail glides from its old place, and the content swaps its old
  // wrap for its new one in place (`spec:AST-105` FR8), on the rail's clock
  // (`component:SideNav` FR6).
  const railRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentLayout = useAnimatedLayout({containerRef: shellRef});
  const pendingContentRef = useRef<{
    /** The column's glide, reported only for a spring motion. */
    change: LayoutChange | null;
    swap: LayoutSwap | null;
    before: DOMRect;
    /** The opacities the held and the entering wrap start from. */
    held: number;
    entering: number;
  } | null>(null);
  // The running swap: when it started and its wraps' starting opacities, so a
  // change made during it starts its cross-fade from what the content shows.
  const lastSwapRef = useRef<{
    startedAt: number;
    held: number;
    entering: number;
  } | null>(null);
  const sideNavShell = useMemo<SideNavShell>(
    () => ({
      animatedLayout: contentLayout,
      rail: () => railRef.current,
      column: () =>
        mainRef.current == null
          ? null
          : columnOf(mainRef.current, railRef.current),
      landContent() {
        if (mainRef.current != null) {
          landLayoutGlide(columnOf(mainRef.current, railRef.current));
        }
      },
      beforeRailChange() {
        const main = mainRef.current;
        if (main == null) {
          return;
        }
        const motion = layoutMotionFor(main);
        // Only a spring glides the column; under Reduce Motion the two wraps
        // cross-fade over a steady surface (`design:reduced-motion` DR2).
        let change: LayoutChange | null = null;
        if (motion.kind === 'spring') {
          change = reportLayoutChange(contentLayout, railRef);
          change.measureBefore();
        }
        // At rest the copy (the wrap shown now) starts opaque and the entering
        // wrap unseen; mid-swap the wrap in the DOM is the entering one and
        // the copy's wrap is the one entering next, each at what it shows.
        let held = 1;
        let entering = 0;
        const last = lastSwapRef.current;
        if (last != null && motion.kind === 'spring') {
          const elapsed =
            Number(main.ownerDocument.timeline?.currentTime ?? 0) -
            last.startedAt;
          if (elapsed < motion.progress.durationMs) {
            const p = 1 - motion.progress.remaining(elapsed);
            held = last.entering + (1 - last.entering) * p;
            entering = last.held * (1 - p);
          }
        }
        lastSwapRef.current = null;
        pendingContentRef.current = {
          change,
          swap: holdLayoutSwap(contentLayout, main, {isVisiblePart: true}),
          before: main.getBoundingClientRect(),
          held,
          entering,
        };
      },
      afterRailChange() {
        const pending = pendingContentRef.current;
        pendingContentRef.current = null;
        const main = mainRef.current;
        if (pending == null || main == null) {
          return () => {};
        }
        pending.change?.animate();
        // The column beside the rail, which the glide moves: the copy sits
        // beside it, in its parent, and rides its glide.
        const column = columnOf(main, railRef.current);
        const after = main.getBoundingClientRect();
        const isRtl = getComputedStyle(main).direction === 'rtl';
        const travel = isRtl
          ? pending.before.right - after.right
          : pending.before.left - after.left;
        // An expand slides the narrower column in from its old start, which
        // opens a gap at its trailing edge: the content surface (the elevated
        // backdrop, or the main element) reaches over it as it closes,
        // whether or not the old wrap is held.
        const cover: {element: Element; frames: (p: number) => Keyframe}[] = [];
        const surface = backdropRef.current ?? main;
        const color = getComputedStyle(surface).backgroundColor;
        const isPainted = !/^rgba\(.*,\s*0\)$|^transparent$/.test(color);
        const glides = layoutMotionFor(main).kind === 'spring';
        if ((isRtl ? travel > 0 : travel < 0) && glides && isPainted) {
          cover.push({
            element: surface,
            frames: p => ({
              boxShadow: `${-travel * (1 - p)}px 0px 0px 0px ${color}`,
            }),
          });
        }
        if (pending.swap == null || column.parentElement == null) {
          return playLayoutFrames(contentLayout, cover);
        }
        // Under Reduce Motion nothing glides: the old wrap's copy paints the
        // surface it sat on, so that surface fades out with it where it was
        // (`design:reduced-motion` DR2) instead of leaving a bare strip.
        if (!glides && isPainted) {
          pending.swap.copy.style.backgroundColor = color;
        }
        const {held, entering} = pending;
        lastSwapRef.current = {
          startedAt: Number(main.ownerDocument.timeline?.currentTime ?? 0),
          held,
          entering,
        };
        return playLayoutSwap(pending.swap, {
          host: column.parentElement,
          copy: p => ({opacity: held * (1 - p)}),
          rideWith: {element: column, travel: {x: travel, y: 0}},
          incoming: [
            ...Array.from(main.children, element => ({
              element,
              frames: (p: number) => ({opacity: entering + (1 - entering) * p}),
            })),
            ...cover,
          ],
        });
      },
    }),
    [contentLayout],
  );

  // Build sideNav content
  //
  // In auto mode, the sideNav panel is not internally scrollable (the page
  // scrolls as a whole), but it gets sticky positioning so it stays pinned
  // below the header while the main content scrolls. A wrapper div applies
  // the sticky behavior since LayoutPanel doesn't accept style/className.
  // =========================================================================
  const sideNavPanel = showSideNavInline ? (
    <LayoutPanel
      ref={railRef}
      padding={0}
      hasDivider={navHasDividers}
      isScrollable={isFill}
      {...themeProps('app-shell-sidenav', {variant})}
      xstyle={[
        navAreaStyle,
        isAuto && stickyBgStyle,
        isAuto && styles.panelAutoFill,
      ]}>
      <SideNavShellContext value={sideNavShell}>{sideNav}</SideNavShellContext>
    </LayoutPanel>
  ) : undefined;

  const sideNavContent =
    sideNavPanel != null && isAuto ? (
      <div {...stylex.props(styles.sideNavSticky)}>{sideNavPanel}</div>
    ) : (
      sideNavPanel
    );

  // =========================================================================
  // Build main content
  // =========================================================================
  const shouldElevateWithCorner = isElevated && hasTopNav && showSideNavInline;

  const mainInner = (
    <LayoutContent
      ref={mainRef}
      padding={contentPadding ?? 0}
      role="main"
      id={MAIN_CONTENT_ID}
      // Focusable skip-link target (WCAG 2.4.1) — without tabIndex, several
      // browsers won't move focus to the div when the skip link is activated.
      tabIndex={-1}
      isScrollable={isFill}
      xstyle={[contentAreaStyle, styles.mainFocusTarget]}>
      {children}
    </LayoutContent>
  );

  // Keep the parent and mainInner's position stable across breakpoints. Outside
  // the elevated desktop layout, the wrapper generates no layout box.
  const mainContent = (
    <div
      {...stylex.props(
        shouldElevateWithCorner
          ? styles.elevatedContentWrapper
          : styles.contentWrapper,
      )}>
      {shouldElevateWithCorner && (
        <div ref={backdropRef} {...stylex.props(styles.elevatedBackdrop)} />
      )}
      {mainInner}
    </div>
  );

  // =========================================================================
  // Render
  //
  // TODO: Include root providers (ThemeProvider, ProseProvider, LayerProvider)
  // at the app level once they're available for wrapping.
  // =========================================================================
  // =========================================================================
  // Build auto mobile nav hamburger for TopNav
  // Injected into the headerContent when mobileNav is enabled and hasToggle
  // =========================================================================
  const shouldShowAutoToggle =
    !mobileNavDisabled && mobileNavHasToggle && isBelowBreakpoint;

  // For sidenav-only layouts with no TopNav, render the sideNav in topbar
  // mode — it shows heading + footer icons horizontally, with the hamburger
  const autoMobileTopBar =
    shouldShowAutoToggle && !hasTopNav && hasSideNav ? (
      <div
        // Banner landmark for the mobile top bar, so the sidenav-only layout
        // exposes the same landmark structure as the topNav one. Only when
        // there is no headerContent: a banner slot with no topNav renders both,
        // and two sibling banner regions is worse than the one this restores.
        role={headerContent == null ? 'banner' : undefined}
        {...mergeProps(
          themeProps('app-shell-header', {variant}),
          stylex.props(headerAreaStyle, isAuto && styles.headerSticky),
        )}>
        <LayoutHeader padding={0} hasDivider={navHasDividers}>
          <div
            {...stylex.props(styles.autoMobileTopBar)}
            role="navigation"
            aria-label={t('@astryx.appShell.mobileNavigation')}>
            <SideNavRenderContext value="topbar">
              {sideNav}
            </SideNavRenderContext>
            <MobileNavToggle />
          </div>
        </LayoutHeader>
      </div>
    ) : undefined;

  return (
    <AppShellMobileContext value={mobileContextValue}>
      <div
        {...rest}
        ref={useMergedRefs(ref, shellRef)}
        data-testid={dataTestId}
        {...mergeProps(
          themeProps('app-shell', {variant}),
          stylex.props(
            styles.root,
            variant === 'wash'
              ? styles.variantWash
              : variant === 'surface'
                ? styles.variantSurface
                : variant === 'section'
                  ? styles.variantSection
                  : styles.variantElevated,
            isFill ? styles.rootFill : styles.rootAuto,
            xstyle,
          ),
          className,
          style,
        )}>
        {/* Skip-to-content link */}
        <a
          href={`#${MAIN_CONTENT_ID}`}
          onClick={handleSkipLinkClick}
          {...focusOutlineProps.focusVisible(styles.skipLink)}
          data-testid="skip-to-content">
          {t('@astryx.appShell.skipToContent')}
        </a>

        <Layout
          height={height}
          padding={0}
          header={
            <>
              {headerContent}
              {autoMobileTopBar}
            </>
          }
          start={sideNavContent}
          content={mainContent}
        />

        {/* Mobile nav — always mounted below breakpoint via Activity so DOM
            presence detection works. Hidden until the drawer opens. */}
        {shouldRenderMobileNavReactNode && mobileNavReactNode}
        {shouldRenderConfigContent && mobileNavConfigContent}
        {isBelowBreakpoint &&
          !mobileNavDisabled &&
          mobileNavReactNode == null &&
          !mobileNavConfigContent && (
            <ActivityWrapper
              mode={isMobileNavActivityVisible ? 'visible' : 'hidden'}>
              {/* SideNav drawer — always mounted so presence detection works.
                Hidden when TopNav owns the drawer (combined mode passes
                sideNav via TopNav's mobile content context instead). */}
              {hasSideNav && !hasTopNav && (
                <SideNavRenderContext value="drawer">
                  {sideNav}
                </SideNavRenderContext>
              )}
              {hasTopNav && (
                <TopNavMobileContentContext value={drawerMobileContentValue}>
                  <TopNavRenderContext value="drawer">
                    {topNav}
                  </TopNavRenderContext>
                </TopNavMobileContentContext>
              )}
            </ActivityWrapper>
          )}
      </div>
    </AppShellMobileContext>
  );
}

AppShell.displayName = 'AppShell';
