// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SegmentedControl.tsx
 * @input Uses React, StyleX, SegmentedControlContext, useListFocus, useKeyboardHint
 * @output Exports SegmentedControl component and SegmentedControlProps type
 * @position Container wrapper; provides context to SegmentedControlItem children
 *
 * SYNC: When modified, update:
 * - /packages/core/src/SegmentedControl/SegmentedControl.doc.mjs
 * - /packages/core/src/SegmentedControl/index.ts
 * - /packages/core/src/SegmentedControl/SegmentedControl.test.tsx
 * - /packages/cli/assets/templates/blocks/components/SegmentedControl/ (showcase blocks)
 */

import React, {useMemo, useCallback, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars, spacingVars, radiusVars} from '../theme/tokens.stylex';
import {SegmentedControlContext} from './SegmentedControlContext';
import {useListFocus} from '../hooks/useListFocus';
import {useKeyboardHint} from '../hooks/useKeyboardHint';
import {useTooltip} from '../Tooltip';
import type {
  SegmentedControlSize,
  SegmentedControlLayout,
} from './SegmentedControlContext';
import {mergeProps, composeEventHandlers} from '../utils';
import {joinAriaIDs} from '../utils/inputAria';
import {useSize} from '../SizeContext/SizeContext';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';

import {useMergedRefs} from '../hooks/useMergedRefs';
export interface SegmentedControlProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange'
> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * The currently selected value (controlled).
   */
  value: string;
  /**
   * Callback fired when a segment is selected.
   */
  onChange: (value: string) => void;
  /**
   * Accessible label for the radio group (used as aria-label, never rendered visually).
   */
  label: string;
  /**
   * Size variant for the control.
   * @default 'md'
   */
  size?: SegmentedControlSize;
  /**
   * Layout mode for segment sizing.
   * - `'hug'` (default): the control and each segment hug their content width,
   *   capped at the container (segment labels truncate when it is too narrow).
   * - `'fill'`: segments stretch equally to fill the container width.
   * @default 'hug'
   */
  layout?: SegmentedControlLayout;
  /**
   * Whether the entire control is disabled.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Explains why the control is disabled. Applies to the whole-group disabled
   * state (`isDisabled`), not individual segments. When set together with
   * `isDisabled`, the control shows a tooltip with this text on hover and
   * keyboard focus, and stays focusable (via `aria-disabled`) so the reason is
   * discoverable by keyboard and assistive technology. Selection stays blocked.
   *
   * Use this instead of wrapping a disabled control in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   */
  disabledMessage?: string;
  /**
   * SegmentedControlItem children.
   */
  children: ReactNode;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    width: 'fit-content',
    // Hug sizes to its segments but never past its container: in a narrow
    // card or a phone row the segments shrink and their labels truncate
    // instead of the control running off the edge. The cap and the min-size
    // reset apply only when a segment has a visible label to truncate
    // (icon-only segments carry `aria-label` and keep their size): a control
    // of icon-only segments has nothing that can shrink, and squeezing it
    // would leave segments hanging outside its track.
    maxWidth: {
      default: 'none',
      ':has([role="radio"]:not([aria-label]))': '100%',
    },
    minWidth: {
      default: 'auto',
      ':has([role="radio"]:not([aria-label]))': 0,
    },
    gap: spacingVars['--spacing-0-5'],
    '--_segmented-control-padding': spacingVars['--spacing-0-5'],
    padding: 'var(--_segmented-control-padding)',
    backgroundColor: colorVars['--color-neutral'],
  },
  fill: {
    display: 'flex',
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: 'none',
  },
  // Disabled *with* a disabledMessage: keep the dimmed look but leave pointer
  // events on so the group can receive hover and surface the reason tooltip.
  // Selection is still blocked by the isDisabled guards.
  disabledWithMessage: {
    opacity: 0.5,
  },
});

const sizeStyles = stylex.create({
  sm: {
    '--_segmented-control-radius': radiusVars['--radius-element'],
    borderRadius: 'var(--_segmented-control-radius)',
  },
  md: {
    '--_segmented-control-radius': radiusVars['--radius-element'],
    borderRadius: 'var(--_segmented-control-radius)',
  },
  lg: {
    '--_segmented-control-radius': radiusVars['--radius-element'],
    borderRadius: 'var(--_segmented-control-radius)',
  },
});

/**
 * Segmented button group for single selection (radio group semantics).
 * Visually resembles a tab bar but controls a value, not a view.
 *
 * @example
 * ```
 * <SegmentedControl value={view} onChange={setView} label="View mode">
 *   <SegmentedControlItem value="grid" label="Grid" />
 *   <SegmentedControlItem value="list" label="List" />
 *   <SegmentedControlItem value="table" label="Table" />
 * </SegmentedControl>
 * ```
 */
export function SegmentedControl({
  ref,
  value,
  onChange,
  label,
  size: sizeProp,
  layout = 'hug',
  isDisabled = false,
  disabledMessage,
  children,
  xstyle,
  className,
  style,
  onKeyDown: onKeyDownProp,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  'aria-describedby': ariaDescribedByProp,
  ...rest
}: SegmentedControlProps) {
  const size = useSize(sizeProp, 'md');

  // Disabled-reason tooltip. Applies to the whole-group disabled state. Disabled
  // controls swallow pointer events, so the tooltip listeners attach to the
  // radiogroup container (and the container keeps pointer events on in this
  // mode) while the radios stay perceivable via aria-disabled. Selection is
  // blocked by the isDisabled guards in the click/focus handlers.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The radiogroup container is not naturally focusable; focusin bubbles up
    // from the radios, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  // Roving tabindex + arrow/Home/End navigation is owned by the shared
  // useListFocus primitive: it stamps a single tab stop (tabIndex 0/-1) across
  // the radios, skips disabled ones, wraps at the ends, handles Home/End, and
  // repairs the tab stop on mount and whenever items mount/disable — replacing
  // the component's former inline keyboard handler and tab-stop repair effect.
  const {listRef, handleKeyDown, handleFocus} = useListFocus<HTMLDivElement>({
    itemSelector: '[role="radio"]:not([aria-disabled="true"])',
    hasRovingTabIndex: true,
    wrap: true,
    orientation: 'horizontal',
  });

  const hint = useKeyboardHint({
    orientation: 'horizontal',
    isEnabled: !isDisabled,
  });

  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      hint.onKeyDown(e);
      handleKeyDown(e);
    },
    [onKeyDownProp, hint, handleKeyDown],
  );

  // Selection-follows-focus (APG radiogroup): useListFocus only *moves* focus,
  // so whenever it lands focus on a new radio (arrow/Home/End, or a click) we
  // select that radio's value. Reading the focused element's data-value here
  // keeps selection in lockstep with focus without duplicating the navigation
  // logic. Disabled radios are ignored (they should never become the value),
  // and the already-selected value is skipped so an initial Tab-in (or a click
  // on the current segment) is a no-op, matching click behavior.
  const handleContainerFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      onFocusProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      hint.onFocus(e);
      handleFocus(e);
      if (isDisabled) {
        return;
      }
      // Only select when focus moved WITHIN the group (arrow/Home/End — APG
      // selection-follows-focus). When focus is entering from outside, Tab
      // must stay a pure focus move: with an unmatched or disabled-selected
      // value the roving tab stop falls back to the first enabled radio, and
      // selecting it here would rewrite the form value on mere traversal.
      // Clicks are unaffected: the item's own handleClick selects.
      if (!e.currentTarget.contains(e.relatedTarget)) {
        return;
      }
      const focused = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[role="radio"][data-value]',
      );
      if (!focused || focused.getAttribute('aria-disabled') === 'true') {
        return;
      }
      const nextValue = focused.dataset.value;
      if (nextValue != null && nextValue !== value) {
        onChange(nextValue);
      }
    },
    [onFocusProp, hint, handleFocus, isDisabled, onChange, value],
  );

  const contextValue = useMemo(
    () => ({
      value,
      onChange,
      size,
      layout,
      isDisabled,
      hasDisabledMessage: showsDisabledMessage,
    }),
    [value, onChange, size, layout, isDisabled, showsDisabledMessage],
  );

  return (
    <SegmentedControlContext value={contextValue}>
      <div
        ref={useMergedRefs(ref, listRef, disabledMessageTooltip.ref)}
        {...rest}
        role="radiogroup"
        aria-label={label}
        aria-disabled={isDisabled || undefined}
        // A caller aria-describedby comes before the disabled reason.
        aria-describedby={joinAriaIDs(
          ariaDescribedByProp,
          showsDisabledMessage ? disabledMessageTooltip.describedBy : undefined,
        )}
        onKeyDown={handleContainerKeyDown}
        onFocus={handleContainerFocus}
        onBlur={composeEventHandlers(onBlurProp, hint.onBlur)}
        {...mergeProps(
          themeProps('segmented-control', {size}),
          stylex.props(
            styles.container,
            sizeStyles[size],
            layout === 'fill' && styles.fill,
            isDisabled &&
              (showsDisabledMessage
                ? styles.disabledWithMessage
                : styles.disabled),
            xstyle,
          ),
          className,
          style,
        )}>
        {children}
        {hint.hintElement}
      </div>
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </SegmentedControlContext>
  );
}

SegmentedControl.displayName = 'SegmentedControl';
