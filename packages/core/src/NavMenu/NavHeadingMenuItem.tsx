// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file NavHeadingMenuItem.tsx
 * @input Uses React, StyleX, Icon, Text, NavMenuContext, useLinkComponent
 * @output Exports NavHeadingMenuItem component and NavHeadingMenuItemProps type
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update:
 * - /packages/core/src/NavMenu/index.ts
 */

import React, {useCallback, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {renderIconSlot, type IconType} from '../Icon';
import {Text} from '../Text';
import {
  colorVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
  radiusVars,
} from '../theme/tokens.stylex';
import {mergeProps, mergeRefs} from '../utils';
import type {BaseProps} from '../BaseProps';
import {useNavHeadingMenuContext} from './NavMenuContext';
import {useLinkComponent} from '../Link/useLinkComponent';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  root: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    borderRadius: radiusVars['--radius-element'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    color: colorVars['--color-text-primary'],
    backgroundColor: {
      default: 'transparent',
      ':focus': colorVars['--color-overlay-hover'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    borderWidth: 0,
    borderStyle: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start',
    outline: 'none',
    textDecoration: 'none',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  disabled: {
    opacity: 0.5,
    cursor: 'default',
  },
});

const sizeStyles = stylex.create({
  sm: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  md: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
  },
  lg: {
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-3'],
  },
});

export interface NavHeadingMenuItemProps extends Omit<
  BaseProps<HTMLElement>,
  'onClick'
> {
  ref?: React.Ref<HTMLElement>;
  /** Icon to display before the label. */
  icon?: ReactNode | IconType;
  /** Primary label text. */
  label: ReactNode;
  /** Secondary description text displayed below the label. */
  description?: ReactNode;
  /** URL to navigate to. Renders as an anchor element when provided. */
  href?: string;
  /** Callback when the item is selected. */
  onClick?: () => void;
  /** Whether the item is disabled. @default false */
  isDisabled?: boolean;
}

/**
 * Menu item for nav heading popovers.
 *
 * Reads size from the parent NavHeadingMenu for consistent padding.
 * Automatically dismisses the menu on click via context.
 * Renders as a link when `href` is provided.
 *
 * @example
 * ```
 * <NavHeadingMenu>
 *   <NavHeadingMenuItem label="Dashboard" href="/dashboard" />
 *   <NavHeadingMenuItem label="Settings" icon={GearIcon} onClick={open} />
 * </NavHeadingMenu>
 * ```
 */
export function NavHeadingMenuItem({
  ref,
  icon,
  label,
  description,
  href,
  onClick,
  isDisabled = false,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ...restProps
}: NavHeadingMenuItemProps) {
  const ctx = useNavHeadingMenuContext();
  const size = ctx?.size ?? 'md';

  const handleClick = useCallback(() => {
    if (isDisabled) {
      return;
    }
    onClick?.();
    ctx?.closeMenu();
  }, [isDisabled, onClick, ctx]);

  const LinkComponent = useLinkComponent();
  // A disabled link item must not navigate (spec:AST-085 FR2). Cancelling the
  // click would leave the destination live for middle-click, assistive
  // technology activation, and "open in new tab", so the item drops its href
  // instead. The router LinkComponent is skipped too: some routers reject a
  // missing destination. A plain anchor keeps the row's element shape.
  // (Mirrors the disabled paths of Link, Tab, and TopNavItem.)
  const Element = href ? (isDisabled ? 'a' : LinkComponent) : 'div';

  // The element type above changes when `isDisabled` flips, so React replaces
  // the row. Carry focus over to the replacement when the outgoing node held it
  // (spec:AST-085 FR4). The ref cleanup runs before the old node is removed, so
  // `activeElement` is still readable there. Only a different node replacing a
  // removed one takes focus, and only if focus has fallen to the page: React
  // also detaches and re-attaches the same node (for example when an <Activity>
  // boundary hides and reveals the row), and neither case may pull focus back
  // after the person has moved elsewhere.
  const focusedNodeRef = useRef<HTMLElement | null>(null);
  const itemRef = useCallback(
    (node: HTMLElement | null) => {
      if (node === null) {
        return;
      }
      const outgoing = focusedNodeRef.current;
      focusedNodeRef.current = null;
      // Focus only follows the swap when it has fallen to the page. If the
      // person moved focus elsewhere in the meantime (for example while an
      // <Activity> boundary kept the row hidden), leave it alone.
      const focusFell =
        document.activeElement === null ||
        document.activeElement === document.body;
      if (
        outgoing !== null &&
        outgoing !== node &&
        !outgoing.isConnected &&
        focusFell
      ) {
        node.focus();
      }
      const release = mergeRefs<HTMLElement>(ref)(node);
      return () => {
        focusedNodeRef.current = document.activeElement === node ? node : null;
        release?.();
      };
    },
    [ref],
  );

  return (
    <Element
      {...restProps}
      ref={itemRef}
      role="menuitem"
      // A disabled link row has no href, so without tabIndex it could not take
      // focus at all. -1 keeps it focusable but out of the Tab order, as an
      // enabled row is (spec:AST-085 FR1).
      tabIndex={isDisabled && !href ? undefined : -1}
      aria-disabled={isDisabled || undefined}
      href={isDisabled ? undefined : href}
      onClick={handleClick}
      data-testid={testId}
      {...mergeProps(
        themeProps('nav-heading-menu-item', {size}),
        stylex.props(
          styles.root,
          sizeStyles[size],
          isDisabled && styles.disabled,
          xstyle,
        ),
        className,
        style,
      )}>
      {icon && renderIconSlot(icon, {size: 'sm', color: 'secondary'})}
      <span {...stylex.props(styles.content)}>
        {typeof label === 'string' ? (
          <Text type="body" maxLines={1}>
            {label}
          </Text>
        ) : (
          label
        )}
        {description && (
          <Text type="supporting" maxLines={1}>
            {description}
          </Text>
        )}
      </span>
    </Element>
  );
}

NavHeadingMenuItem.displayName = 'NavHeadingMenuItem';
