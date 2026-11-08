// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {lazy, Suspense, useEffect, useRef, useState} from 'react';
import {usePathname} from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavRenderContext,
  useTopNavRenderMode,
} from '@astryxdesign/core/TopNav';
import {useAppShellMobile} from '@astryxdesign/core/AppShell';
import {MobileNav} from '@astryxdesign/core/MobileNav';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack} from '@astryxdesign/core/Layout';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {Search, HeartHandshake, Sun, Moon, Menu} from 'lucide-react';
import {GITHUB_REPO} from '../constants';
import {AstryxIcon} from './logos';
import {useThemeMode} from '../app/providers';
import {trackSearch, trackClickCta} from '../lib/analytics';
import {useAppShellHeaderHeight} from '../lib/useAppShellHeaderHeight';
import {warmSearch, whenIdle} from '../lib/searchWarmup';

type SearchPaletteModule = typeof import('./SearchPalette');
let searchPaletteModule: Promise<SearchPaletteModule> | undefined;

/** The palette's code, requested once; a failed load is tried again. */
function loadSearchPalette(): Promise<SearchPaletteModule> {
  searchPaletteModule ??= import('./SearchPalette').catch(error => {
    searchPaletteModule = undefined;
    throw error;
  });
  return searchPaletteModule;
}

const LazySearchPalette = lazy(() =>
  loadSearchPalette().then(module => ({default: module.SearchPalette})),
);

/**
 * Get search ready before the reader types: start the search server (throttled
 * per tab) and load the palette's code, so the first query waits for neither.
 */
function prepareSearch() {
  warmSearch();
  loadSearchPalette().catch(() => {});
}

const GitHubIcon = ({
  width = 20,
  height = 20,
}: {
  width?: number;
  height?: number;
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
  </svg>
);

// Responsive helpers. Keep a CSS-controlled hamburger in the server HTML;
// when AppShell switches to mobile-bar mode, its automatic toggle takes over.
// Match AppShell's default md breakpoint: equality belongs to desktop.
// Negate min-width so StyleX does not lower '<' to a rounded 767.99px bound.
const MOBILE_BREAKPOINT = '@media not (min-width: 768px)';

const styles = stylex.create({
  desktopNav: {
    display: {
      default: 'flex',
      [MOBILE_BREAKPOINT]: 'none',
    },
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  mobileToggle: {
    display: {
      default: 'none',
      [MOBILE_BREAKPOINT]: 'flex',
    },
    alignItems: 'center',
  },
  drawerItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
  },
  // Theme-toggle icons. Both Moon and Sun are always in the DOM; while the mode
  // is still unresolved ('system'), a pure CSS prefers-color-scheme query decides
  // which one shows so the first paint matches the OS — otherwise the icon starts
  // as Moon (resolvedMode's 'light' default) and visibly swaps to Sun on a
  // dark-OS machine after hydration. Once the mode resolves to a concrete value
  // (OS-detected or a manual toggle) React forces the icon explicitly; for the
  // OS-following case that matches what the media query already showed, so
  // nothing visibly changes.
  moonWhenSystem: {
    display: {
      default: 'inline-flex',
      '@media (prefers-color-scheme: dark)': 'none',
    },
  },
  sunWhenSystem: {
    display: {
      default: 'none',
      '@media (prefers-color-scheme: dark)': 'inline-flex',
    },
  },
  iconShown: {display: 'inline-flex'},
  iconHidden: {display: 'none'},
});

// Primary navigation links, shared by the desktop bar and the mobile drawer.
const NAV_ITEMS = [
  {key: 'docs', label: 'Docs', href: '/docs/getting-started'},
  {key: 'components', label: 'Components', href: '/components'},
  {key: 'templates', label: 'Templates', href: '/templates'},
  {key: 'themes', label: 'Themes', href: '/themes'},
  {key: 'playground', label: 'Playground', href: '/playground'},
] as const;

export function SharedTopNav() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hasLoadedSearch, setHasLoadedSearch] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const {mode, themeMode, toggleMode} = useThemeMode();
  // Enabled describes drawer ownership, not whether its automatic hamburger
  // has rendered yet. During SSR AppShell still renders the desktop top bar.
  const {
    isMobileNavEnabled,
    isMobileNavOpen,
    mobileNavId,
    openMobileNav,
    closeMobileNav,
  } = useAppShellMobile();
  const renderMode = useTopNavRenderMode();
  const navRef = useRef<HTMLElement>(null);
  useAppShellHeaderHeight(navRef);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        trackSearch({target: 'open'});
        prepareSearch();
        setHasLoadedSearch(true);
        setIsSearchOpen(true);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Synchronizes with the browser's idle scheduler: most readers open Search
  // seconds after a page loads, so once the page is idle, get search ready and
  // their first query does not wait on a cold start. Cleanup cancels the idle
  // callback. The warm-up request itself belongs to the tab, not this nav
  // (lib/searchWarmup.ts throttles it per tab), so a StrictMode replay or a
  // remount sends no second request.
  useEffect(() => whenIdle(prepareSearch), []);

  // Determine active nav item
  const getActiveItem = () => {
    if (
      pathname === '/docs' ||
      pathname.startsWith('/docs/') ||
      pathname.startsWith('/changelog')
    ) {
      return 'docs';
    }
    if (pathname.startsWith('/templates')) {
      return 'templates';
    }
    if (pathname.startsWith('/themes')) {
      return 'themes';
    }
    if (pathname.startsWith('/components')) {
      return 'components';
    }
    if (pathname.startsWith('/playground')) {
      return 'playground';
    }
    return undefined;
  };

  const navLinks = (onNavigate?: () => void) =>
    NAV_ITEMS.map(item => (
      <TopNavItem
        key={item.key}
        label={item.label}
        href={item.href}
        isSelected={getActiveItem() === item.key}
        onClick={onNavigate}
      />
    ));

  return (
    <>
      <TopNav
        ref={navRef}
        label="Astryx navigation"
        heading={
          <TopNavHeading
            logo={
              <AstryxIcon
                width={24}
                height={24}
                role="img"
                aria-label="Astryx"
                style={{display: 'block', color: 'var(--color-brand)'}}
              />
            }
            headingHref="/"
          />
        }
        centerContent={
          renderMode === 'drawer' ? (
            // Bare items — AppShell's drawer supplies its own vertical list;
            // the desktopNav wrapper would hide them (display:none) here.
            <>{navLinks(closeMobileNav)}</>
          ) : (
            <div {...stylex.props(styles.desktopNav)}>{navLinks()}</div>
          )
        }
        endContent={
          <HStack gap={2}>
            <HStack gap={0.5}>
              <Button
                label="Search"
                tooltip="Search"
                variant="ghost"
                isIconOnly
                icon={<Search size={20} />}
                onPointerEnter={prepareSearch}
                onFocus={prepareSearch}
                onClick={() => {
                  trackSearch({target: 'open'});
                  prepareSearch();
                  setHasLoadedSearch(true);
                  setIsSearchOpen(true);
                }}
              />
              <Button
                label={
                  mode === 'light'
                    ? 'Switch to dark mode'
                    : 'Switch to light mode'
                }
                tooltip={
                  mode === 'light'
                    ? 'Switch to dark mode'
                    : 'Switch to light mode'
                }
                variant="ghost"
                isIconOnly
                icon={
                  <>
                    <Moon
                      size={20}
                      {...stylex.props(
                        themeMode === 'system'
                          ? styles.moonWhenSystem
                          : mode === 'light'
                            ? styles.iconShown
                            : styles.iconHidden,
                      )}
                    />
                    <Sun
                      size={20}
                      {...stylex.props(
                        themeMode === 'system'
                          ? styles.sunWhenSystem
                          : mode === 'dark'
                            ? styles.iconShown
                            : styles.iconHidden,
                      )}
                    />
                  </>
                }
                onClick={toggleMode}
              />
              <Button
                label="Community"
                tooltip="Community"
                variant="ghost"
                isIconOnly
                icon={<HeartHandshake size={20} />}
                href="/community"
              />
              <Button
                label="GitHub"
                tooltip="GitHub"
                variant="ghost"
                isIconOnly
                icon={<GitHubIcon />}
                href={GITHUB_REPO}
                onClick={() => trackClickCta({target: 'github'})}
              />
            </HStack>
            <Button
              label="Get started"
              variant="primary"
              href="/docs/getting-started"
              onClick={() =>
                trackClickCta({page: 'landing', target: 'get_started'})
              }
            />
            {(!isMobileNavEnabled || renderMode === 'default') && (
              <div {...stylex.props(styles.mobileToggle)}>
                <Button
                  label={isMobileNavEnabled ? 'Open navigation' : 'Open menu'}
                  tooltip="Menu"
                  variant="ghost"
                  isIconOnly
                  icon={
                    isMobileNavEnabled ? (
                      // Match AppShell's glyph and Button-owned icon size.
                      <Icon icon="menu" color="inherit" />
                    ) : (
                      <Menu size={20} />
                    )
                  }
                  aria-expanded={
                    isMobileNavEnabled ? isMobileNavOpen : undefined
                  }
                  aria-controls={isMobileNavEnabled ? mobileNavId : undefined}
                  onClick={
                    isMobileNavEnabled
                      ? openMobileNav
                      : () => setIsMenuOpen(true)
                  }
                />
              </div>
            )}
          </HStack>
        }
      />
      {hasLoadedSearch && (
        <Suspense fallback={null}>
          <LazySearchPalette
            isOpen={isSearchOpen}
            onOpenChange={setIsSearchOpen}
          />
        </Suspense>
      )}
      {!isMobileNavEnabled && (
        <MobileNav
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          side="end"
          label="Astryx navigation"
          header={
            <AstryxIcon
              width={24}
              height={24}
              role="img"
              aria-label="Astryx"
              style={{display: 'block', color: 'var(--color-brand)'}}
            />
          }>
          <TopNavRenderContext value="drawer">
            <div {...stylex.props(styles.drawerItems)}>
              {navLinks(() => setIsMenuOpen(false))}
            </div>
          </TopNavRenderContext>
        </MobileNav>
      )}
    </>
  );
}
