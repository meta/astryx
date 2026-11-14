// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ButtonGroup.tsx
 * @input Uses React, StyleX, Button/IconButton children, and the shared group
 *   press tracking (hooks/useGroupPressTracking)
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

import {useMemo, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {ButtonSize} from '../Button';
import {radiusVars, shadowVars} from '../theme/tokens.stylex';
import type {Elevation} from '../utils/types';
import {SizeProvider, useSize} from '../SizeContext/SizeContext';
import {oneTabStopAmong, useInternalListFocus} from '../hooks/useListFocus';
import {PressGroupContext} from '../hooks/pressGroupContext';
import {
  GROUP_PRESS_POINTERS,
  useGroupPressTracking,
} from '../hooks/useGroupPressTracking';
import {useTouchPresentation} from '../utils/touchPresentation';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {mergeProps, composeEventHandlers} from '../utils';
import type {BaseProps} from '../BaseProps';
import {ButtonGroupContext} from './ButtonGroupContext';
import type {ButtonGroupOrientation} from './ButtonGroupContext';
import {themeProps} from '../utils/themeProps';

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

// Roving rewrites `tabindex` on every item, so the selector cannot key off
// a value: `[tabindex="0"]` would drop each member the moment it is stamped
// -1. `a[href]` catches a Button rendered with `href`.
const MEMBER_SELECTOR = 'button, a[href], [tabindex]';

const keepDisabledGroupStop = oneTabStopAmong(
  MEMBER_SELECTOR,
  '[role="group"], [popover]',
);

/**
 * Groups buttons with connected styling — shared borders, proper border-radius
 * handling (only on outer edges), and horizontal or vertical orientation.
 *
 * Children automatically detect the group via context and apply position-aware
 * styles in pure CSS.
 *
 * The group is a single tab stop: arrow keys move between members along the
 * orientation, Home/End jump to the ends, and focus wraps (the APG roving
 * tabindex technique, via `useListFocus`).
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

  const {listRef, handleKeyDown, handleFocus} =
    useInternalListFocus<HTMLDivElement>({
      itemSelector: MEMBER_SELECTOR,
      // A member's layer renders inline inside the group (useLayer does not
      // portal it), so a key pressed in an open DropdownMenu bubbles here. The
      // boundary is the group's own root or any layer, whichever is nearer to
      // the target. Naming the group's own root is what keeps a group rendered
      // inside a Popover or Toast working: bailing on any [popover] ancestor
      // instead would swallow every arrow key it owns.
      boundarySelector: '[role="group"], [popover]',
      orientation,
      hasRovingTabIndex: true,
      // A group of disabled buttons keeps its one Tab stop, so a keyboard user
      // still reaches it. Its members are focusable while disabled.
      tabStopOrder: keepDisabledGroupStop,
    });

  const contextValue = useMemo(
    () => ({orientation, isDisabled}),
    [orientation, isDisabled],
  );

  // Only under the touch presentation does a press slide across the buttons.
  // A desktop press stays the native button's.
  const {isTouch} = useTouchPresentation();
  const tracksPress = !isDisabled && isTouch;
  const groupRef = useRef<HTMLDivElement>(null);
  useGroupPressTracking(groupRef, tracksPress);

  return (
    <ButtonGroupContext value={contextValue}>
      <SizeProvider value={size}>
        <div
          ref={useMergedRefs(ref, listRef, groupRef)}
          {...props}
          {...mergeProps(
            themeProps('button-group', {size, orientation, elevation}),
            stylex.props(
              styles.group,
              orientation === 'vertical' && styles.vertical,
              // The buttons touch: no room between their touch bands.
              orientation === 'vertical'
                ? touchHitAreaStyles.blockGroup0
                : touchHitAreaStyles.inlineGroup0,
              elevationStyles[elevation],
              xstyle,
            ),
            className,
            style,
          )}
          role="group"
          aria-label={label}
          onKeyDown={composeEventHandlers(onKeyDown, handleKeyDown)}
          onFocus={composeEventHandlers(onFocus, handleFocus)}
          aria-disabled={isDisabled || undefined}
          data-testid={testId}>
          <PressGroupContext value={tracksPress ? GROUP_PRESS_POINTERS : null}>
            {children}
          </PressGroupContext>
        </div>
      </SizeProvider>
    </ButtonGroupContext>
  );
}

ButtonGroup.displayName = 'ButtonGroup';
