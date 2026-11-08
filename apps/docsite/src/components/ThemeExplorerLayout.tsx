// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThemeExplorerLayout.tsx
 * @input Receives the theme explorer's sidebar, mobile controls, carousel, and preview content
 * @output Shared responsive layout primitives for the resolved explorer and its PPR fallback
 * @position Single source of truth for Themes desktop/mobile composition
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {Divider} from '@astryxdesign/core/Divider';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {layout} from '../layout.stylex';

/** Breakpoint shared by the resolved explorer and its loading state. */
export const THEME_EXPLORER_SIDEBAR_QUERY = '(max-width: 900px)';
const SIDEBAR_BREAKPOINT = '@media (max-width: 900px)';

const SIDEBAR_WIDTH = 260;
const SIDEBAR_STICKY_TOP =
  'calc(var(--appshell-header-height, 64px) + var(--spacing-4))';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 'var(--spacing-6)',
    [SIDEBAR_BREAKPOINT]: {
      flexDirection: 'column',
    },
  },
  sidebar: {
    flex: '0 0 auto',
    width: SIDEBAR_WIDTH,
    position: 'sticky',
    top: SIDEBAR_STICKY_TOP,
    maxHeight: `calc(100dvh - var(--appshell-header-height, 64px) - var(--spacing-4) * 2)`,
    overflowY: 'auto',
    [SIDEBAR_BREAKPOINT]: {
      display: 'none',
    },
  },
  sidebarCard: {
    padding: 'var(--spacing-4)',
  },
  themeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-2)',
  },
  rightColumn: {
    flex: '1 1 0',
    minWidth: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-8)',
  },
  mobileContext: {
    display: 'none',
    [SIDEBAR_BREAKPOINT]: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-5)',
    },
  },
  mobileCarousel: {
    display: 'none',
    [SIDEBAR_BREAKPOINT]: {
      display: 'flex',
      width: '100%',
    },
  },
  mobileCarouselItem: {
    flexShrink: 0,
    width: 140,
  },
  mobileBar: {
    display: 'none',
    [SIDEBAR_BREAKPOINT]: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 'var(--spacing-2)',
      padding: 'var(--spacing-2)',
      borderRadius: 'var(--radius-full)',
      borderWidth: 'var(--border-width)',
      borderStyle: 'solid',
      borderColor: 'var(--color-border)',
      backgroundColor: 'var(--color-background-card)',
      boxShadow: 'var(--shadow-high)',
      position: 'fixed',
      bottom: 'var(--spacing-4)',
      left: 0,
      right: 0,
      marginInline: 'auto',
      zIndex: 100,
      width: 'fit-content',
      maxWidth: `calc(100vw - var(--spacing-4) * 2)`,
      opacity: 0,
      pointerEvents: 'none',
      transition: 'opacity 0.2s ease',
    },
  },
  mobileBarVisible: {
    [SIDEBAR_BREAKPOINT]: {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
  mobileSelector: {
    minWidth: 160,
  },
  preview: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    marginInline: 'auto',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
  },
  previewSkeleton: {
    height: {default: 720, [SIDEBAR_BREAKPOINT]: 520},
    width: '100%',
    overflow: 'hidden',
  },
});

/**
 * Outer desktop-row/mobile-column shell. A `statusLabel` marks a temporary PPR
 * fallback: its visual tree becomes inert so no descendant can receive focus,
 * while a separate visually-hidden status remains available to assistive tech.
 */
export function ThemeExplorerLayout({
  children,
  statusLabel,
}: {
  children: ReactNode;
  /** Accessible loading label; omitted for the resolved explorer. */
  statusLabel?: string;
}) {
  return (
    <>
      {statusLabel && (
        <VisuallyHidden as="div" role="status">
          {statusLabel}
        </VisuallyHidden>
      )}
      <div
        inert={statusLabel ? true : undefined}
        {...stylex.props(styles.root)}>
        {children}
      </div>
    </>
  );
}

/** Sticky desktop sidebar, hidden at the shared mobile breakpoint. */
export function ThemeExplorerSidebar({children}: {children: ReactNode}) {
  return (
    <aside {...stylex.props(styles.sidebar)} aria-label="Theme picker">
      {children}
    </aside>
  );
}

/** Shared surface treatment inside the desktop sidebar. */
export function ThemeExplorerSidebarSurface({children}: {children: ReactNode}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.sidebarCard}>
      {children}
    </Card>
  );
}

/**
 * Shared desktop sidebar internals: heading/actions, divider, and theme list.
 * Fallback and resolved states supply different content to the same geometry.
 */
export function ThemeExplorerSidebarContent({
  heading,
  actions,
  themes,
}: {
  heading: ReactNode;
  actions: ReactNode;
  themes: ReactNode;
}) {
  return (
    <VStack gap={4}>
      <VStack gap={5}>
        {heading}
        {actions}
      </VStack>
      <Divider />
      <div {...stylex.props(styles.themeList)}>{themes}</div>
    </VStack>
  );
}

/** Shared vertical action cluster for resolved controls and Skeletons. */
export function ThemeExplorerActions({children}: {children: ReactNode}) {
  return (
    <VStack gap={2} align="stretch">
      {children}
    </VStack>
  );
}

/** Flexible right column containing mobile controls, carousel, and preview. */
export function ThemeExplorerRightColumn({children}: {children: ReactNode}) {
  return <div {...stylex.props(styles.rightColumn)}>{children}</div>;
}

/** Mobile-only heading/actions region above the theme carousel. */
export function ThemeExplorerMobileContext({children}: {children: ReactNode}) {
  return <div {...stylex.props(styles.mobileContext)}>{children}</div>;
}

/** Fixed mobile selector/mode toolbar; hidden until its carousel leaves view. */
export function ThemeExplorerMobileBar({
  isVisible,
  selector,
  modeToggle,
}: {
  isVisible: boolean;
  selector: ReactNode;
  modeToggle: ReactNode;
}) {
  return (
    <div
      {...stylex.props(styles.mobileBar, isVisible && styles.mobileBarVisible)}>
      <div {...stylex.props(styles.mobileSelector)}>{selector}</div>
      {modeToggle}
    </div>
  );
}

/**
 * Shared carousel slot. A render prop applies the responsive style to the
 * caller's own root, preserving Carousel's scroll and snap DOM geometry.
 */
export function ThemeExplorerMobileCarousel({
  children,
}: {
  children: (xstyle: StyleXStyles) => ReactNode;
}) {
  return children(styles.mobileCarousel);
}

/** Fixed-width item geometry shared by real and skeleton mobile carousels. */
export function ThemeExplorerMobileCarouselItem({
  children,
}: {
  children: ReactNode;
}) {
  return <div {...stylex.props(styles.mobileCarouselItem)}>{children}</div>;
}

/** Width, clipping, and centering shared by real and skeleton previews. */
export function ThemeExplorerPreview({children}: {children: ReactNode}) {
  return <div {...stylex.props(styles.preview)}>{children}</div>;
}

/** Shared responsive loading surface for the selected-theme preview. */
export function ThemeExplorerPreviewSkeleton({index = 0}: {index?: number}) {
  return (
    <div {...stylex.props(styles.previewSkeleton)}>
      <Skeleton width="100%" height="100%" index={index} />
    </div>
  );
}
