// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SideNavCollapseButton.tsx
 * @input Uses React, StyleX, SideNavCollapseContext, Icon
 * @output Exports SideNavCollapseButton component
 * @position Composable toggle button for sidenav collapse
 *
 * Place inside SideNav (reads context automatically) or outside
 * (pass the same controlled `collapsible` config both get).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/SideNav/SideNav.doc.mjs
 * - /packages/core/src/SideNav/index.ts
 * - /packages/cli/assets/templates/blocks/components/SideNav/ (showcase blocks)
 */

import React, {use, useCallback, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {durationVars, easeVars} from '../theme/tokens.stylex';
import {Icon} from '../Icon';
import {Button} from '../Button';
import type {BaseProps} from '../BaseProps';
import {composeEventHandlers, rtlStyles} from '../utils';
import {
  useSideNavCollapse,
  type SideNavCollapseState,
  type SideNavControlledCollapsible,
  type SideNavImperativeCollapseHandle,
} from './SideNavCollapseContext';
import {useAppShellMobile} from '../AppShell/AppShellMobileContext';
import {useTranslator} from '../i18n';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {SideNavFocusTargetsContext} from './SideNavFocusTargetsContext';
import type {ElementSize} from '../SizeContext/SizeContext';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  // A flex container, so the glyph is a flex item. Left to blockify as a flex
  // item of Button's icon slot, this span gets a line box and seats the
  // chevron on its text baseline — 2.42px above the button's centre.
  chevronMirror: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    display: 'inline-flex',
    alignItems: 'center',
    transitionProperty: 'transform',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevronCollapsed: {
    transform: 'rotate(180deg)',
  },
});

// =============================================================================
// Types
// =============================================================================

export interface SideNavCollapseButtonProps extends BaseProps<HTMLButtonElement> {
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * The same controlled `collapsible` config given to SideNav
   * (`{isCollapsed, onCollapsedChange}`). Needed only when the button is
   * rendered outside the sidenav, where collapse context cannot reach it.
   */
  collapsible?: SideNavControlledCollapsible;

  /**
   * Imperative handle from SideNav.
   *
   * @deprecated Pass `collapsible` instead.
   */
  handleRef?: React.RefObject<SideNavImperativeCollapseHandle | null>;

  /**
   * Custom button label text. When provided, renders as a text button
   * with the chevron icon. When omitted, renders as an icon-only button.
   */
  label?: string;

  /**
   * Button size. Defaults to the size its container cascades — `sm` in a
   * SideNav footer — or `md` outside one. Set it for placements with no row
   * to inherit from, e.g. a button placed in a `TopNav`.
   */
  size?: ElementSize;

  /**
   * Custom button content. Overrides the default chevron icon and label.
   */
  children?: ReactNode;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Composable toggle button for sidenav collapse.
 *
 * Place anywhere inside SideNav (header, topContent, footer, footerIcons)
 * and it reads collapse state from context automatically. For placement
 * outside the sidenav (e.g. in TopNav or content area), hold the state and
 * hand the same `collapsible` config to both.
 *
 * @example
 * ```
 * <SideNav isCollapsible footerIcons={<SideNavCollapseButton />}>
 *   ...
 * </SideNav>
 * ```
 *
 * @example
 * ```
 * const [isCollapsed, setIsCollapsed] = useState(false);
 * const collapsible = {isCollapsed, onCollapsedChange: setIsCollapsed};
 * <TopNav endContent={<SideNavCollapseButton collapsible={collapsible} />} />
 * <SideNav collapsible={{...collapsible, hasButton: false}}>...</SideNav>
 * ```
 */
export function SideNavCollapseButton({
  ref,
  collapsible,
  handleRef,
  label,
  size,
  children,
  onClick: onClickProp,
  ...props
}: SideNavCollapseButtonProps) {
  const t = useTranslator();
  const {isCollapsed, toggle, isCollapsible} = useSideNavCollapseState(
    collapsible,
    handleRef,
  );
  const {isMobile} = useAppShellMobile();
  // A toggle inside its SideNav registers there, so a collapse that removes
  // the focused row can hand focus to it (`component:SideNav` AR3). One wired
  // to state outside the SideNav (`collapsible`, `handleRef`) does not.
  const focusTargets = use(SideNavFocusTargetsContext);
  const isInSideNav =
    focusTargets != null && collapsible == null && handleRef == null;
  const registerToggle = useCallback(
    (element: HTMLButtonElement | null) =>
      element == null || !isInSideNav || focusTargets == null
        ? undefined
        : focusTargets.registerToggle(element),
    [focusTargets, isInSideNav],
  );
  const mergedRef = useMergedRefs(ref, registerToggle);

  // Hide when not collapsible, or when in mobile mode (sidenav is in
  // the mobile drawer — collapse doesn't apply there)
  if (!isCollapsible || isMobile) {
    return null;
  }

  return (
    <Button
      ref={mergedRef}
      label={
        label ??
        (isCollapsed
          ? t('@astryx.sideNavCollapseButton.expandSidebar')
          : t('@astryx.sideNavCollapseButton.collapseSidebar'))
      }
      variant="ghost"
      size={size}
      {...props}
      onClick={composeEventHandlers(onClickProp, toggle)}
      icon={
        children ?? (
          // The RTL mirror stays on its own element, wrapping (not merged
          // into) the state rotation: both are `transform`, so on a single
          // element one would overwrite the other and the chevron would stop
          // mirroring under RTL. See utils/rtlStyles.ts.
          <span {...stylex.props(styles.chevronMirror, rtlStyles.mirror)}>
            {/* `sm` (1rem) matches what this glyph already renders at: Button's
                icon slot pins its wrapper to 16px, and the registry SVG is
                1em, so the chevron is 16px today. */}
            <Icon
              icon="chevronLeft"
              size="sm"
              color="inherit"
              xstyle={[styles.chevron, isCollapsed && styles.chevronCollapsed]}
            />
          </span>
        )
      }
      isIconOnly
    />
  );
}

SideNavCollapseButton.displayName = 'SideNavCollapseButton';

function useSideNavCollapseState(
  collapsible: SideNavControlledCollapsible | undefined,
  handleRef:
    React.RefObject<SideNavImperativeCollapseHandle | null> | undefined,
): SideNavCollapseState {
  const contextCollapseState = useSideNavCollapse();

  const {isCollapsed, onCollapsedChange} = collapsible ?? {};
  const toggleCollapsible = useCallback(
    () => onCollapsedChange?.(!isCollapsed),
    [isCollapsed, onCollapsedChange],
  );

  const toggleHandle = useCallback(() => {
    handleRef?.current?.getCollapseState()?.toggle();
  }, [handleRef]);

  if (collapsible != null) {
    return {
      isCollapsed: isCollapsed ?? false,
      toggle: toggleCollapsible,
      isCollapsible: true,
    };
  }

  if (handleRef == null) {
    return contextCollapseState;
  }

  const externalCollapseState = handleRef.current?.getCollapseState() ?? null;

  return {
    isCollapsed: externalCollapseState?.isCollapsed ?? false,
    toggle: toggleHandle,
    isCollapsible: externalCollapseState?.isCollapsible ?? true,
  };
}
