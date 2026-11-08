// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNav.tsx
 * @input Uses React, ReactNode
 * @output Exports TopNav component and TopNavProps
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TopNav/TopNav.doc.mjs
 * - /packages/core/src/TopNav/TopNav.test.tsx
 * - /packages/core/src/TopNav/index.ts
 * - /apps/storybook/stories/TopNav.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/TopNav/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {TopNavSlotContext} from './TopNavContext';
import {useTopNavRenderMode} from './TopNavRenderContext';
import {useTopNavMobileContent} from './TopNavMobileContentContext';
import {Divider} from '../Divider/Divider';
import {MobileNav} from '../MobileNav/MobileNav';
import {MobileNavToggle} from '../MobileNav/MobileNavToggle';
import {useAppShellMobile} from '../AppShell/AppShellMobileContext';
import {themeProps} from '../utils/themeProps';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/TopNav/TopNav.generated';
import {isRenderable} from '../utils/isRenderable';

registerEnglishFallback(english);

/**
 * Base TopNav styles
 */
const styles = stylex.create({
  base: {
    alignItems: 'center',
    width: '100%',
    padding: spacingVars['--spacing-2'],
    boxSizing: 'border-box',
  },
  // Flex layout (default, used when no centerContent)
  baseFlex: {
    display: 'flex',
  },
  // Grid layout (used when centerContent is present)
  baseGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-4'],
    flex: '1 1 0%',
    minWidth: 0,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  startContent: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  centerContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-1'],
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacingVars['--spacing-1'],
  },
  endContent: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    flexShrink: 0,
    marginInlineStart: 'auto',
  },
  // Mobile bar mode — simplified top bar with heading + toggle + endContent
  mobileBar: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: spacingVars['--spacing-2'],
    boxSizing: 'border-box',
  },
  // The heading gives up space first so the end content and toggle stay in view
  mobileBarHeading: {
    display: 'flex',
    alignItems: 'center',
    flex: '0 1 auto',
    minWidth: 0,
  },
  mobileBarEnd: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    flexShrink: 0,
    marginInlineStart: 'auto',
  },
  // Drawer mode — vertical list of nav items
  drawerItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
  },
  drawerDivider: {
    marginBlock: spacingVars['--spacing-2'],
  },
  drawerExtraContent: {},
});

export interface TopNavProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Heading slot content — typically TopNavHeading with logo and text.
   * Positioned at the left edge of the nav bar.
   */
  heading?: ReactNode;
  /**
   * Start content slot - typically navigation items or breadcrumbs.
   * Positioned after the title, left-aligned.
   */
  startContent?: ReactNode;
  /**
   * Alias for startContent. Prefer startContent when composing with other slots.
   *
   * This keeps the common React children pattern from silently dropping
   * navigation items. If both children and startContent are provided,
   * startContent takes precedence and children are ignored.
   */
  children?: ReactNode;
  /**
   * Center content slot - typically tabs, search bar, or primary navigation.
   * Positioned at the horizontal center of the nav bar.
   * When provided, the layout switches to a three-column CSS grid to ensure
   * true centering regardless of start/end content widths.
   */
  centerContent?: ReactNode;
  /**
   * End content slot - typically search, icons, user profile, utility menus.
   * Positioned at the right edge of the nav bar.
   */
  endContent?: ReactNode;
  /**
   * Accessible label for the navigation landmark.
   * Helps screen readers identify the navigation area.
   * @default 'Top navigation'
   */
  label?: string;
}

/**
 * Top navigation bar for application headers.
 *
 * Slot-based layout with `heading`, `startContent`, `centerContent`, and
 * `endContent`. `children` are accepted as an alias for `startContent`
 * so navigation items do not silently disappear when using the common
 * React children pattern. When `centerContent` is provided, the layout switches
 * to a three-column CSS grid to keep center content horizontally centered.
 *
 * @example
 * ```
 * <TopNav
 *   label="Main navigation"
 *   heading={<TopNavHeading heading="My App" />}
 *   startContent={<TopNavItem label="Home" href="/" isSelected />}
 *   endContent={<Button label="Search" variant="ghost" />}
 * />
 * ```
 */
export function TopNav({
  heading,
  startContent,
  children,
  centerContent,
  endContent,
  label: labelFromProps,
  xstyle,
  className,
  style,
  ref,
  ...props
}: TopNavProps) {
  const t = useComponentTranslator();
  const label = labelFromProps ?? t('@astryx.topNav.landmarkLabel');
  const renderMode = useTopNavRenderMode();
  const mobileContent = useTopNavMobileContent();
  const {hasAutoToggle} = useAppShellMobile();
  const resolvedStartContent = startContent ?? children;
  // The layout flags use the same test as the slots they gate.
  const hasCenterContent = isRenderable(centerContent);
  const hasStartContent = isRenderable(resolvedStartContent);
  const hasMobileContent = isRenderable(mobileContent);
  const hasCollapsibleContent = hasStartContent || hasCenterContent;
  // Show mobile toggle when there's ANY drawer content — own items OR SideNav via context
  const hasMobileDrawerContent = hasCollapsibleContent || hasMobileContent;

  // =========================================================================
  // Mobile bar mode — heading + endContent + toggle, hide nav items.
  // Falls through to default when there's no drawer content — no reason
  // to strip down the TopNav if there's nothing to put in the drawer.
  // =========================================================================
  if (renderMode === 'mobile-bar') {
    return (
      <nav
        ref={ref}
        role="navigation"
        aria-label={label}
        {...mergeProps(
          themeProps('top-nav', {mode: 'mobile-bar'}),
          stylex.props(styles.mobileBar, xstyle),
          className,
          style,
        )}
        {...props}>
        {isRenderable(heading) && (
          <div {...stylex.props(styles.mobileBarHeading)}>{heading}</div>
        )}
        <div {...stylex.props(styles.mobileBarEnd)}>
          {endContent}
          {hasMobileDrawerContent && hasAutoToggle && <MobileNavToggle />}
        </div>
      </nav>
    );
  }

  // =========================================================================
  // Drawer mode — render nav items vertically inside a MobileNav,
  // plus any additional content passed via context (e.g. SideNav items)
  // =========================================================================
  if (renderMode === 'drawer') {
    // Only render if there are collapsible items or extra content
    if (!hasCollapsibleContent && !hasMobileContent) {
      return null;
    }

    return (
      <MobileNav header={heading}>
        {hasCollapsibleContent && (
          <div {...stylex.props(styles.drawerItems)}>
            {resolvedStartContent}
            {centerContent}
          </div>
        )}
        {hasCollapsibleContent && hasMobileContent && (
          <Divider xstyle={styles.drawerDivider} />
        )}
        {hasMobileContent && (
          <div {...stylex.props(styles.drawerExtraContent)}>
            {mobileContent}
          </div>
        )}
      </MobileNav>
    );
  }

  // =========================================================================
  // Default mode — full top bar
  // =========================================================================

  return (
    <nav
      ref={ref}
      role="navigation"
      aria-label={label}
      {...mergeProps(
        themeProps('top-nav'),
        stylex.props(
          styles.base,
          hasCenterContent ? styles.baseGrid : styles.baseFlex,
          xstyle,
        ),
        className,
        style,
      )}
      {...props}>
      <div {...stylex.props(styles.leftSection)}>
        {isRenderable(heading) && (
          <div {...stylex.props(styles.heading)}>{heading}</div>
        )}
        {hasStartContent && (
          <TopNavSlotContext value="start">
            <div {...stylex.props(styles.startContent)}>
              {resolvedStartContent}
            </div>
          </TopNavSlotContext>
        )}
      </div>
      {hasCenterContent && (
        <TopNavSlotContext value="center">
          <div {...stylex.props(styles.centerContent)}>{centerContent}</div>
        </TopNavSlotContext>
      )}
      {hasCenterContent ? (
        <div {...stylex.props(styles.rightSection)}>
          <TopNavSlotContext value="end">{endContent}</TopNavSlotContext>
        </div>
      ) : (
        isRenderable(endContent) && (
          <div {...stylex.props(styles.endContent)}>
            <TopNavSlotContext value="end">{endContent}</TopNavSlotContext>
          </div>
        )
      )}
    </nav>
  );
}

TopNav.displayName = 'TopNav';
