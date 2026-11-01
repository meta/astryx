// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavMegaMenuItem.tsx
 * @input Uses React, StyleX, theme tokens, navItemStyles, TopNavRenderContext
 * @output Exports TopNavMegaMenuItem component and props
 * @position Individual item inside an TopNavMegaMenu — renders itself in both
 *   desktop (popover) and mobile drawer modes.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TopNav/TopNav.doc.mjs
 * - /packages/core/src/TopNav/index.ts
 * - /packages/cli/assets/templates/blocks/components/TopNav/ (showcase blocks)
 */

import React, {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  typeScaleVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import {navItemStyles} from '../NavItem/navItemStyles.stylex';
import {useLinkComponent} from '../Link/useLinkComponent';
import type {LinkComponentType} from '../Link/types';
import {useTopNavRenderMode} from './TopNavRenderContext';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {useAppShellMobile} from '../AppShell/AppShellMobileContext';
import {isModifiedClick} from '../DropdownMenu/menuItemRoles';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  // Desktop popover item
  desktop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
    textDecoration: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    borderWidth: 0,
    borderStyle: 'none',
    color: 'inherit',
    fontFamily: 'inherit',
    textAlign: 'start',
    boxSizing: 'border-box',
    width: '100%',
  },
  desktopIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-neutral'],
    flexShrink: 0,
    color: colorVars['--color-icon-secondary'],
  },
  desktopContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
    minWidth: 0,
  },
  desktopTitle: {
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    color: colorVars['--color-text-primary'],
  },
  desktopDescription: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
  // Drawer item overrides (base from navItemStyles.item)
  drawerItem: {
    paddingInlineStart: spacingVars['--spacing-6'],
    alignItems: 'flex-start',
    textDecoration: 'none',
  },
  drawerItemIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-neutral'],
    flexShrink: 0,
    color: colorVars['--color-icon-secondary'],
    marginBlockStart: spacingVars['--spacing-0-5'],
  },
  drawerItemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    minWidth: 0,
  },
  drawerItemDescription: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    fontWeight: fontWeightVars['--font-weight-normal'],
  },
});

// =============================================================================
// Types
// =============================================================================

export interface TopNavMegaMenuItemProps extends Omit<
  BaseProps<HTMLElement>,
  'onClick'
> {
  ref?: React.Ref<HTMLElement>;
  /** Display title for the menu item. */
  title: string;
  /** Optional description text displayed below the title. */
  description?: string;
  /** Optional icon element displayed to the left. */
  icon?: ReactNode;
  /** URL to navigate to when clicked. */
  href?: string;
  /** Callback when item is clicked. */
  onClick?: () => void;
  /**
   * Custom component to render instead of `<a>` for link items.
   * Overrides the provider-level default set by LinkProvider.
   */
  as?: LinkComponentType;
}

// =============================================================================
// Component
// =============================================================================

/**
 * An individual item inside an TopNavMegaMenu.
 *
 * Renders itself in both desktop (popover grid) and mobile drawer modes
 * using TopNavRenderContext to switch appearance.
 *
 * @example
 * ```
 * <TopNavMegaMenu
 *   label="Products"
 *   items={
 *     <>
 *       <TopNavMegaMenuItem
 *         title="Analytics"
 *         description="Track and analyze user behavior"
 *         icon={<ChartIcon />}
 *         href="/analytics"
 *       />
 *       <TopNavMegaMenuItem title="Reports" href="/reports" />
 *     </>
 *   }
 * />
 * ```
 */
export function TopNavMegaMenuItem({
  ref,
  title,
  description,
  icon,
  href,
  onClick,
  as,
  tabIndex,
  xstyle,
  className,
  style,
  ...restProps
}: TopNavMegaMenuItemProps) {
  const pressable = usePressFeedback();
  const renderMode = useTopNavRenderMode();
  const LinkComponent = useLinkComponent(as);
  const {closeMobileNav} = useAppShellMobile();

  // =========================================================================
  // Drawer mode — matches SideNavItem / TopNavMenu drawer appearance
  // =========================================================================
  if (renderMode === 'drawer') {
    const Element = href ? LinkComponent : 'button';
    const elementProps = Element === 'button' ? {type: 'button' as const} : {};
    const handleDrawerClick = (e: React.MouseEvent) => {
      onClick?.();
      // A modified click on a link is the browser's (a new tab): the drawer
      // stays open for the next one.
      if (!(href && isModifiedClick(e))) {
        closeMobileNav();
      }
    };
    return (
      <Element
        {...restProps}
        ref={ref}
        href={href}
        {...pressable}
        onClick={handleDrawerClick}
        tabIndex={tabIndex}
        {...elementProps}
        {...mergeProps(
          themeProps('top-nav-mega-menu-item', {mode: 'drawer'}),
          focusOutlineProps.focusVisible(
            navItemStyles.item,
            interactionOverlayStyles.backgroundColor,
            styles.drawerItem,
            xstyle,
          ),
          className,
          style,
        )}>
        {icon && <div {...stylex.props(styles.drawerItemIcon)}>{icon}</div>}
        <div {...stylex.props(styles.drawerItemContent)}>
          {title}
          {description && (
            <span {...stylex.props(styles.drawerItemDescription)}>
              {description}
            </span>
          )}
        </div>
      </Element>
    );
  }

  // =========================================================================
  // Default mode — desktop popover item with large icon + description
  // =========================================================================
  const Element = href ? LinkComponent : 'div';
  return (
    <Element
      {...restProps}
      ref={ref}
      href={href}
      {...pressable}
      onClick={onClick}
      tabIndex={tabIndex}
      {...mergeProps(
        themeProps('top-nav-mega-menu-item'),
        focusOutlineProps.focusVisible(
          styles.desktop,
          interactionOverlayStyles.backgroundColor,
          xstyle,
        ),
        className,
        style,
      )}>
      {icon && <div {...stylex.props(styles.desktopIcon)}>{icon}</div>}
      <div {...stylex.props(styles.desktopContent)}>
        <span {...stylex.props(styles.desktopTitle)}>{title}</span>
        {description && (
          <span {...stylex.props(styles.desktopDescription)}>
            {description}
          </span>
        )}
      </div>
    </Element>
  );
}

TopNavMegaMenuItem.displayName = 'TopNavMegaMenuItem';
