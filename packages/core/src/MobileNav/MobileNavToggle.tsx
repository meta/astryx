// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobileNavToggle.tsx
 * @input Uses React, Button, Icon, AppShell mobile context; forwards host props
 *   to the Button
 * @output Exports MobileNavToggle component
 * @position Standalone toggle button; can be placed anywhere in the AppShell tree.
 *
 * Hamburger button that opens/closes the mobile nav drawer.
 * Reads from AppShell mobile context — renders nothing above the mobile breakpoint.
 * Can be placed anywhere in the component tree (TopNav, content area, custom toolbar, etc.).
 * Host attributes and DOM handlers reach the button; its `aria-expanded` and
 * `aria-controls` stay component-owned, and a caller `onClick` runs after the
 * toggle.
 */

import React, {type ReactNode} from 'react';
import {Button} from '../Button';
import {Icon} from '../Icon';
import {useAppShellMobile} from '../AppShell/AppShellMobileContext';
import type {BaseProps} from '../BaseProps';
import {useTranslator} from '../i18n';
import {composeEventHandlers} from '../utils';

export interface MobileNavToggleProps extends Omit<
  BaseProps<HTMLButtonElement>,
  'aria-expanded' | 'aria-controls'
> {
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Custom content to render instead of the default hamburger icon.
   */
  children?: ReactNode;
  /**
   * Accessible label for the toggle button.
   * @default 'Open navigation'
   */
  label?: string;
  /**
   * Test ID for the button element.
   */
  'data-testid'?: string;
}

/**
 * Mobile nav toggle button. Reads from AppShell context to open/close
 * the mobile navigation drawer.
 *
 * Renders nothing when above the mobile breakpoint — safe to include
 * unconditionally in your layout.
 *
 * @example
 * ```
 * <div className="my-toolbar">
 *   <MobileNavToggle />
 *   <h1>Page Title</h1>
 * </div>
 * <MobileNavToggle label="Menu">
 *   <MyCustomMenuIcon />
 * </MobileNavToggle>
 * ```
 */
export function MobileNavToggle({
  ref,
  children,
  label: labelFromProps,
  'data-testid': testId,
  xstyle,
  className,
  style,
  onClick,
  ...rest
}: MobileNavToggleProps) {
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.mobileNav.toggle.open');
  const {
    isMobile,
    isMobileNavEnabled,
    isMobileNavOpen,
    mobileNavId,
    toggleMobileNav,
  } = useAppShellMobile();

  // Don't render above the breakpoint or when mobile nav is disabled
  if (!isMobile || !isMobileNavEnabled) {
    return null;
  }

  return (
    <Button
      {...rest}
      ref={ref}
      variant="ghost"
      label={label}
      icon={children ?? <Icon icon="menu" color="inherit" />}
      onClick={composeEventHandlers(toggleMobileNav, onClick)}
      aria-expanded={isMobileNavOpen}
      aria-controls={mobileNavId || undefined}
      data-testid={testId ?? 'mobile-nav-toggle'}
      xstyle={xstyle}
      className={className}
      style={style}
      isIconOnly
    />
  );
}

MobileNavToggle.displayName = 'MobileNavToggle';
