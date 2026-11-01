// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ButtonGroup.tsx
 * @input Uses React, StyleX, Button/IconButton children, OverflowList, DropdownMenu
 * @output Exports ButtonGroup component, context, and types
 * @position Groups buttons with connected styling; consumed by index.ts
 *
 * Children (Button, IconButton) consume the ButtonGroup context to apply
 * position-aware styles in pure CSS — no cloneElement or wrapper divs needed.
 * The end-cap radius rules live in Button.tsx; see IS_LAST_ITEM there for why
 * the trailing edge cannot use :last-child (#2508).
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/ButtonGroup/ButtonGroup.doc.mjs (props table, features)
 * - /packages/core/src/ButtonGroup/ButtonGroup.test.tsx (tests)
 * - /packages/core/src/ButtonGroup/index.ts (exports if types change)
 * - /apps/storybook/stories/ButtonGroup.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/ButtonGroup/ (showcase blocks)
 */

import {useCallback, useMemo, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {ButtonSize} from '../Button';
import {radiusVars, shadowVars} from '../theme/tokens.stylex';
import type {Elevation} from '../utils/types';
import {SizeProvider, useSize} from '../SizeContext/SizeContext';
import {useListFocus} from '../hooks/useListFocus';
import {mergeProps, composeEventHandlers} from '../utils';
import type {BaseProps} from '../BaseProps';
import {ButtonGroupContext} from './ButtonGroupContext';
import type {ButtonGroupOrientation} from './ButtonGroupContext';
import {themeProps} from '../utils/themeProps';
import {OverflowList} from '../OverflowList';
import {DropdownMenu} from '../DropdownMenu';
import {useIcon} from '../Icon';
import {useTranslator} from '../i18n';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

import {useMergedRefs} from '../hooks/useMergedRefs';
// =============================================================================
// Props
// =============================================================================

export interface ButtonGroupProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element. */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Button or IconButton children.
   */
  children: ReactNode;

  /**
   * Accessible label for the group (used as aria-label).
   */
  label: string;

  /**
   * Orientation of the button group.
   * @default 'horizontal'
   */
  orientation?: ButtonGroupOrientation;

  /**
   * Default size for buttons in the group.
   * Individual buttons can override this with their own `size` prop.
   * @default 'md'
   */
  size?: ButtonSize;

  /**
   * Resting elevation for the group. The connected buttons share one surface,
   * so the shadow sits on the group and lifts them together. Use for a floating
   * group of actions above content.
   * @default 'none'
   */
  elevation?: Elevation;

  /**
   * Whether all buttons in the group are disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Collapses horizontal members that no longer fit into an overflow actions
   * menu. The overflow trigger participates in the group's roving focus.
   * @default undefined
   */
  overflow?: 'menu';

  /**
   * Test ID for testing frameworks.
   */
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  group: {
    display: 'inline-flex',
    alignItems: 'stretch',
  },
  vertical: {
    flexDirection: 'column',
  },
  // OverflowList stretches to its parent while collapsed; the group's surface
  // (elevation, radius) must hug the members that are actually shown.
  overflowHug: {
    width: 'auto',
    maxWidth: '100%',
  },
});

// Resting elevation for the whole group — the connected buttons share one
// surface, so the shadow sits on the group wrapper and lifts them as a unit.
// The wrapper takes the element radius so the shadow follows the group's
// rounded outer corners rather than a bare rectangle. 'none' is the default.
const elevationStyles = stylex.create({
  none: {boxShadow: 'none'},
  low: {
    boxShadow: shadowVars['--shadow-low'],
    borderRadius: radiusVars['--radius-element'],
  },
  med: {
    boxShadow: shadowVars['--shadow-med'],
    borderRadius: radiusVars['--radius-element'],
  },
  high: {
    boxShadow: shadowVars['--shadow-high'],
    borderRadius: radiusVars['--radius-element'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * Groups buttons with connected styling — shared borders, proper border-radius
 * handling (only on outer edges), horizontal or vertical orientation, and an
 * optional overflow actions menu for horizontal groups.
 *
 * Children automatically detect the group via context and apply position-aware
 * styles in pure CSS.
 *
 * The group is a single tab stop: arrow keys move between members along the
 * orientation, Home/End jump to the ends, focus wraps, and disabled members are
 * skipped (the APG roving tabindex technique, via `useListFocus`).
 *
 * Members that render their own layer — a Button with a `tooltip`, or a
 * DropdownMenu — compose correctly, including as the trailing member.
 *
 * @example
 * ```
 * <ButtonGroup label="Actions">
 *   <Button label="Copy" />
 *   <Button label="Cut" />
 *   <Button label="Paste" />
 * </ButtonGroup>
 * ```
 *
 * @example
 * ```
 * <ButtonGroup label="Approve action">
 *   <Button label="Allow once" variant="primary" />
 *   <DropdownMenu
 *     button={{label: 'Allow options', variant: 'primary', isIconOnly: true, icon: <Icon icon="chevronDown" />}}
 *     items={[{label: 'Allow for 30 minutes'}, {label: 'Always allow'}]}
 *   />
 * </ButtonGroup>
 * ```
 */
export function ButtonGroup({
  children,
  label,
  orientation = 'horizontal',
  overflow,
  size: sizeProp,
  isDisabled = false,
  elevation = 'none',
  xstyle,
  className,
  style,
  ref,
  'data-testid': testId,
  onKeyDown,
  onFocus,
  ...props
}: ButtonGroupProps): ReactNode {
  const size = useSize(sizeProp, 'md');
  const t = useTranslator();
  const moreIcon = useIcon('moreHorizontal');
  const lastFocusedMemberRef = useRef<HTMLElement | null>(null);
  const overflowTriggerRef = useRef<HTMLButtonElement | null>(null);

  const {listRef, handleKeyDown, handleFocus} = useListFocus<HTMLDivElement>({
    // Roving rewrites `tabindex` on every item, so the selector cannot key off
    // a value: `[tabindex="0"]` would drop each member the moment it is
    // stamped -1. `a[href]` catches a Button rendered with `href`.
    itemSelector: 'button, a[href], [tabindex]',
    // A member's layer renders inline inside the group (useLayer does not
    // portal it), so a key pressed in an open DropdownMenu bubbles here. The
    // boundary is the group's own root or any layer, whichever is nearer to
    // the target. Naming the group's own root is what keeps a group rendered
    // inside a Popover or Toast working: bailing on any [popover] ancestor
    // instead would swallow every arrow key it owns.
    boundarySelector: '[role="group"], [popover]',
    orientation,
    hasRovingTabIndex: true,
  });

  const contextValue = useMemo(
    () => ({orientation, isDisabled}),
    [orientation, isDisabled],
  );
  // Collapsed members read this and render as ordinary menu rows.
  const overflowMenuContextValue = useMemo(
    () => ({
      orientation: 'vertical' as const,
      isDisabled,
      isOverflowMenu: true,
    }),
    [isDisabled],
  );

  // React unmounts a member when it moves into the overflow menu. Keep the
  // composite widget's tab stop valid by returning focus to its visible
  // overflow trigger rather than letting it fall back to document.body.
  useIsomorphicLayoutEffect(() => {
    const focused = lastFocusedMemberRef.current;
    if (focused != null && !focused.isConnected) {
      overflowTriggerRef.current?.focus({preventScroll: true});
    }
  });

  const handleGroupFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (event.target.closest('[aria-hidden="true"], [inert]') == null) {
        lastFocusedMemberRef.current = event.target;
      }
      handleFocus(event);
    },
    [handleFocus],
  );

  const mergedRef = useMergedRefs(ref, listRef);
  const {className: themeClassName, ...themeAttributes} = themeProps(
    'button-group',
    {size, orientation, elevation},
  );
  const groupProps = {
    ...props,
    ...themeAttributes,
    role: 'group',
    'aria-label': label,
    onKeyDown: composeEventHandlers(onKeyDown, handleKeyDown),
    onFocus: composeEventHandlers(onFocus, handleGroupFocus),
    'aria-disabled': isDisabled || undefined,
    'data-testid': testId,
  };

  return (
    <ButtonGroupContext value={contextValue}>
      <SizeProvider value={size}>
        {overflow === 'menu' && orientation === 'horizontal' ? (
          // The list is the group itself: it measures the space its parent
          // offers, while its own box shrinks to the members it shows.
          <OverflowList
            {...groupProps}
            ref={mergedRef}
            gap={0}
            behavior="observeParent"
            xstyle={[
              styles.group,
              elevationStyles[elevation],
              styles.overflowHug,
              xstyle,
            ]}
            className={
              className ? `${themeClassName} ${className}` : themeClassName
            }
            style={style}
            overflowRenderer={items => (
              <DropdownMenu
                hasChevron={false}
                button={{
                  label: t('@astryx.moreMenu.label'),
                  icon: moreIcon,
                  size,
                  isDisabled,
                  tooltip: t('@astryx.moreMenu.label'),
                  isIconOnly: true,
                  ref: element => {
                    // The hidden measurement copy has its own trigger. It is
                    // never a focus-return target; keep the visible one.
                    if (
                      element?.closest('[aria-hidden="true"], [inert]') == null
                    ) {
                      overflowTriggerRef.current = element;
                    }
                  },
                }}>
                <ButtonGroupContext value={overflowMenuContextValue}>
                  {items.map(({child}) => child)}
                </ButtonGroupContext>
              </DropdownMenu>
            )}>
            {children}
          </OverflowList>
        ) : (
          <div
            ref={mergedRef}
            {...groupProps}
            {...mergeProps(
              {className: themeClassName},
              stylex.props(
                styles.group,
                orientation === 'vertical' && styles.vertical,
                elevationStyles[elevation],
                xstyle,
              ),
              className,
              style,
            )}>
            {children}
          </div>
        )}
      </SizeProvider>
    </ButtonGroupContext>
  );
}

ButtonGroup.displayName = 'ButtonGroup';
