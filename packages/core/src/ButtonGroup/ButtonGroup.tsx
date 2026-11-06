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

import {useCallback, useMemo, useRef, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {ButtonSize} from '../Button';
import {radiusVars, shadowVars} from '../theme/tokens.stylex';
import type {Elevation} from '../utils/types';
import {SizeProvider, useSize} from '../SizeContext/SizeContext';
import {useListFocus} from '../hooks/useListFocus';
import {PressGroupContext} from '../hooks/pressGroupContext';
import {
  GROUP_PRESS_POINTERS,
  useGroupPressTracking,
} from '../hooks/useGroupPressTracking';
import {useTouchPresentation} from '../utils/touchPresentation';
import {touchHitAreaStyles} from '../utils/touchHitArea.stylex';
import {mergeProps, composeEventHandlers, isRenderable} from '../utils';
import type {BaseProps} from '../BaseProps';
import {ButtonGroupContext} from './ButtonGroupContext';
import type {ButtonGroupOrientation} from './ButtonGroupContext';
import {themeProps} from '../utils/themeProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useToolbar} from '../Toolbar/ToolbarContext';
import {observeMutations} from '../utils/sharedMutationObserver';
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
   * Explicit role override for the group. Only `'toolbar'` and `'group'`
   * take effect; any other role renders as group; and the prop is ignored
   * when the ButtonGroup is inside a Toolbar.
   *
   * By default, ButtonGroup adapts: 3 or more members use role="toolbar"
   * with aria-orientation and roving tabindex; 2 or fewer members use
   * role="group" in standard Tab order.
   */
  role?: React.AriaRole;

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
  // While the group tracks presses, its hit layer is the root's `::before`,
  // below its buttons, so the root is the layer's containing block.
  tracking: {
    position: 'relative',
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
 * handling (only on outer edges), and horizontal or vertical orientation.
 *
 * Children automatically detect the group via context and apply position-aware
 * styles in pure CSS.
 *
 * A group with 3 or more members exposes `role="toolbar"` with `aria-orientation`
 * and acts as a composite widget with a single Tab stop and arrow-key roving focus
 * (WAI-ARIA APG toolbar pattern).
 *
 * A group with 2 or fewer members (e.g. split button) exposes `role="group"` and
 * keeps every member in the natural Tab order without roving tabindex.
 *
 * An explicit `role` override (`'toolbar'` or `'group'`) can be provided.
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
  role: roleProp,
  ...props
}: ButtonGroupProps): ReactNode {
  const size = useSize(sizeProp, 'md');

  const toolbarContext = useToolbar();
  const isInsideToolbar = toolbarContext != null;

  // Top-level children estimate the count until the first commit measures the DOM.
  const estimatedCount = useMemo(() => {
    let count = 0;
    const countItems = (nodes: ReactNode) => {
      if (Array.isArray(nodes)) {
        nodes.forEach(countItems);
      } else if (
        nodes != null &&
        typeof nodes === 'object' &&
        'props' in nodes
      ) {
        if (
          typeof (nodes as {type?: unknown}).type === 'symbol' &&
          String((nodes as {type?: unknown}).type) === 'Symbol(react.fragment)'
        ) {
          countItems((nodes as {props: {children?: ReactNode}}).props.children);
        } else if (isRenderable(nodes)) {
          count += 1;
        }
      } else if (isRenderable(nodes)) {
        count += 1;
      }
    };
    countItems(children);
    return count;
  }, [children]);

  const [renderedCount, setRenderedCount] = useState(estimatedCount);

  // When nested inside a Toolbar, always use role="group" without aria-orientation
  // and yield roving tabindex to the parent toolbar, preserving the Toolbar's
  // single Tab stop.
  // BaseProps already provides role?: AriaRole; act only on 'toolbar' and 'group',
  // replacing any other role with 'group' to preserve base contract (spec:AST-017 FR53).
  const resolvedRole = isInsideToolbar
    ? 'group'
    : roleProp === 'toolbar'
      ? 'toolbar'
      : roleProp != null
        ? 'group'
        : renderedCount >= 3
          ? 'toolbar'
          : 'group';
  const isToolbar = resolvedRole === 'toolbar';

  const {listRef, handleKeyDown, handleFocus, getItems} =
    useListFocus<HTMLDivElement>({
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
      boundarySelector: '[role="group"], [role="toolbar"], [popover]',
      orientation,
      hasRovingTabIndex: isToolbar,
    });

  const syncCount = useCallback(() => {
    const count = getItems().length;
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- rendered member count is derived from DOM layout
    setRenderedCount(prev => (prev === count ? prev : count));
  }, [getItems]);

  const syncCountRef = useRef(syncCount);

  // React runs the returned cleanup when the root detaches.
  const observerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }
    return observeMutations(node, {childList: true, subtree: true}, () => {
      syncCountRef.current();
    });
  }, []);

  // Read the member count after each commit, before paint. The observer's update can land after paint.
  useIsomorphicLayoutEffect(() => {
    syncCountRef.current = syncCount;
    syncCount();
  });

  const handleContainerFocus = (e: React.FocusEvent) => {
    const count = getItems().length;
    if (count !== renderedCount) {
      setRenderedCount(count);
    }
    if (isToolbar) {
      handleFocus(e);
    }
  };

  const contextValue = useMemo(
    () => ({orientation, isDisabled}),
    [orientation, isDisabled],
  );

  // Only under the touch presentation does a press slide across the buttons.
  // A desktop press stays the native button's.
  const {isTouch} = useTouchPresentation();
  const tracksPress = !isDisabled && isTouch;
  const groupRef = useRef<HTMLDivElement>(null);
  const {hitAreaRef} = useGroupPressTracking(groupRef, tracksPress);

  return (
    <ButtonGroupContext value={contextValue}>
      <SizeProvider value={size}>
        <div
          ref={useMergedRefs(ref, listRef, groupRef, hitAreaRef, observerRef)}
          {...props}
          {...mergeProps(
            themeProps('button-group', {size, orientation, elevation}),
            stylex.props(
              styles.group,
              tracksPress && styles.tracking,
              tracksPress && touchHitAreaStyles.layerBelowChildren,
              orientation === 'vertical' && styles.vertical,
              elevationStyles[elevation],
              xstyle,
            ),
            className,
            style,
          )}
          role={resolvedRole}
          aria-label={label}
          aria-orientation={isToolbar ? orientation : undefined}
          onKeyDown={composeEventHandlers(
            onKeyDown,
            isToolbar ? handleKeyDown : undefined,
          )}
          onFocus={composeEventHandlers(onFocus, handleContainerFocus)}
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
