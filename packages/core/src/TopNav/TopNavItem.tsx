// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavItem.tsx
 * @input Uses React, ReactNode, BaseProps, LinkComponentType
 * @output Exports TopNavItem component and TopNavItemProps
 * @position Navigation item component for TopNav startContent
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
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {useLinkComponent} from '../Link/useLinkComponent';
import type {LinkComponentType} from '../Link/types';
import {useTopNavRenderMode} from './TopNavRenderContext';
import {navItemStyles, type NavItemSize} from '../NavItem/navItemStyles.stylex';
import {mergeProps} from '../utils';
import {useAppShellMobile} from '../AppShell/AppShellMobileContext';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';

/**
 * NavItem styles with hover/selected states
 */
const styles = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
    textDecoration: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-color, color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  selected: {
    color: colorVars['--color-text-primary'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    backgroundColor: {
      default: colorVars['--color-neutral'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-neutral'],
      },
      ':active': colorVars['--color-neutral'],
      // The touch press model writes these instead of `:active`; the selected
      // item keeps its fill under a finger the way it does under a mouse, and
      // paints no overlay at any phase of the press.
      '[data-astryx-press="on"]': colorVars['--color-neutral'],
      '[data-astryx-press="fading"]': colorVars['--color-neutral'],
    },
    backgroundImage: {
      default: null,
      '[data-astryx-press="on"]': 'none',
      '[data-astryx-press="fading"]': 'none',
    },
  },
  iconOnly: {
    paddingInline: spacingVars['--spacing-2'],
  },
  // Drawer mode — focus outline (base item + selected come from navItemStyles)
});

export interface TopNavItemProps extends BaseProps<HTMLAnchorElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLAnchorElement>;
  /** Link destination URL. */
  href?: string;
  /** Where to open the linked document. */
  target?: string;
  /** Link relationship. */
  rel?: string;
  /** Causes the browser to download the linked URL. */
  download?: string | boolean;
  /** Referrer policy for the link. */
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  /**
   * Custom component to render instead of `<a>`.
   * Overrides the provider-level default set by LinkProvider.
   * Must accept href, className, style, and children props.
   */
  as?: LinkComponentType;
  /**
   * The accessible label for the nav item.
   * Rendered as visible text by default. When `isIconOnly` is true,
   * used as aria-label instead.
   */
  label: string;
  /**
   * Whether this nav item is currently selected/highlighted.
   * @default false
   */
  isSelected?: boolean;
  /**
   * Whether the nav item is disabled.
   * A disabled item renders as a plain anchor without an href (and without
   * target), so it cannot navigate and is removed from the tab order.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Renders the item as a square icon-only element.
   * When true, `label` becomes the aria-label and visible text is hidden.
   * Requires `icon` to be set.
   * @default false
   */
  isIconOnly?: boolean;
  /**
   * Optional icon to display before the label.
   */
  icon?: ReactNode;
  /**
   * Optional content to render instead of the label.
   */
  children?: ReactNode;
  /**
   * Size variant for the nav item. Has no effect in horizontal mode;
   * controls height/padding in drawer mode.
   * @default 'md'
   */
  size?: NavItemSize;
}

/**
 * Click handler for disabled items. The disabled anchor renders without an
 * href, so there is no navigation to block in practice; preventDefault is a
 * defensive guard against synthetic/programmatic clicks.
 */
function preventDefaultClick(event: React.MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
}

/**
 * A navigation item for use within TopNav startContent.
 *
 * Renders as an anchor element with hover/selected states.
 * Supports icons and selected state indication with highlighted appearance.
 *
 * @example
 * ```
 * <TopNav
 *   startContent={
 *     <>
 *       <TopNavItem label="Home" href="/" isSelected />
 *       <TopNavItem label="Products" href="/products" />
 *       <TopNavItem label="Settings" href="/settings" icon={<GearIcon />} isIconOnly />
 *     </>
 *   }
 * />
 * ```
 */
export function TopNavItem({
  as,
  href,
  target,
  onClick,
  label,
  isSelected = false,
  isDisabled = false,
  isIconOnly = false,
  icon,
  children,
  size = 'md',
  xstyle,
  className,
  style,
  ref,
  ...props
}: TopNavItemProps) {
  const pressable = usePressFeedback();
  const LinkComponent = useLinkComponent(as);
  const renderMode = useTopNavRenderMode();
  const {closeMobileNav} = useAppShellMobile();

  // A disabled item renders as a plain <a> with no href: an href-less anchor
  // is not focusable and exposes no link affordance, so programmatic focus +
  // Enter, AT activation commands, and middle-click cannot navigate or fire
  // the consumer onClick. The router LinkComponent is deliberately skipped —
  // a disabled item performs no navigation, and custom router links may
  // require a live href. target is omitted with the href. (Mirrors the
  // disabled paths of Link and SideNavItem.)
  const Root = isDisabled ? 'a' : LinkComponent;

  // =========================================================================
  // Drawer mode — render as a SideNavItem-style vertical list element
  // =========================================================================
  if (renderMode === 'drawer') {
    const handleDrawerClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (isDisabled) {
        preventDefaultClick(e);
        return;
      }
      // Forward the original onClick if present
      onClick?.(e);
      closeMobileNav();
    };

    return (
      <Root
        ref={ref}
        href={isDisabled ? undefined : href}
        target={isDisabled ? undefined : target}
        aria-label={isIconOnly ? label : undefined}
        aria-current={isSelected ? 'page' : undefined}
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : undefined}
        {...pressable}
        {...mergeProps(
          themeProps('top-nav-item', {
            mode: 'drawer',
            selected: isSelected ? 'selected' : null,
          }),
          focusOutlineProps.focusVisible(
            navItemStyles.item,
            interactionOverlayStyles.backgroundColor,
            navItemStyles[size],
            isSelected && navItemStyles.selected,
            isDisabled && navItemStyles.disabled,
            xstyle,
          ),
          className,
          style,
        )}
        {...props}
        onClick={handleDrawerClick}>
        {icon}
        {!isIconOnly && (children ?? label)}
      </Root>
    );
  }

  // =========================================================================
  // Default / mobile-bar mode — standard horizontal nav item
  // =========================================================================

  return (
    <Root
      ref={ref}
      href={isDisabled ? undefined : href}
      target={isDisabled ? undefined : target}
      onClick={isDisabled ? preventDefaultClick : onClick}
      aria-label={isIconOnly ? label : undefined}
      aria-current={isSelected ? 'page' : undefined}
      aria-disabled={isDisabled || undefined}
      tabIndex={isDisabled ? -1 : undefined}
      {...pressable}
      {...mergeProps(
        themeProps('top-nav-item', {
          selected: isSelected ? 'selected' : null,
        }),
        focusOutlineProps.focusVisible(
          styles.base,
          interactionOverlayStyles.backgroundColor,
          isSelected && styles.selected,
          isDisabled && navItemStyles.disabled,
          isIconOnly && styles.iconOnly,
          xstyle,
        ),
        className,
        style,
      )}
      {...props}>
      {icon}
      {!isIconOnly && (children ?? label)}
    </Root>
  );
}

TopNavItem.displayName = 'TopNavItem';
