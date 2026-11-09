// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SegmentedControl.tsx
 * @input Uses React, StyleX, SegmentedControlContext, useListFocus,
 *   useKeyboardHint, useTouchPresentation, useSegmentedSelectionMotion
 * @output Exports SegmentedControl component and SegmentedControlProps type
 * @position Container wrapper; provides context to SegmentedControlItem children
 *
 * SYNC: When modified, update:
 * - /packages/core/src/SegmentedControl/SegmentedControl.doc.mjs
 * - /packages/core/src/SegmentedControl/index.ts
 * - /packages/core/src/SegmentedControl/SegmentedControl.test.tsx
 * - /packages/core/src/SegmentedControl/useSegmentedSelectionMotion.ts
 * - /packages/cli/assets/templates/blocks/components/SegmentedControl/ (showcase blocks)
 */

import React, {useMemo, useCallback, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars, spacingVars, radiusVars} from '../theme/tokens.stylex';
import {SegmentedControlContext} from './SegmentedControlContext';
import {useInternalListFocus} from '../hooks/useListFocus';
import {isSegmentDisabledOnItsOwn} from '../privateAttributes/segmentDisabled.stylex';
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
import {useTouchPresentation} from '../utils/touchPresentation';
import {useSegmentedSelectionMotion} from './useSegmentedSelectionMotion';

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
   * Whether the entire control is disabled. The selected segment keeps the
   * control's Tab stop, announced as disabled (`aria-disabled`), and nothing
   * can be selected.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Explains why the control is disabled. Applies to the whole-group disabled
   * state (`isDisabled`), not individual segments. When set together with
   * `isDisabled`, the control shows a tooltip with this text on hover and
   * keyboard focus, and the reason describes each segment for assistive
   * technology. Selection stays blocked.
   *
   * Use this instead of wrapping a disabled control in `Tooltip`, so the
   * reason is attached to the control itself.
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
    // The lens's containing block and stacking context. The lens sits at
    // z-index -1 inside it: above the track's own background, below every
    // segment.
    position: 'relative',
    isolation: 'isolate',
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
  // Disabled: dimmed, with pointer events left on so a press can focus the
  // segment that holds the Tab stop and a reason tooltip can open on hover.
  // Selection is blocked by the isDisabled guards (spec:AST-085 FR1, FR2).
  disabled: {
    opacity: 0.5,
  },
  // The lens uses the radiogroup's own pseudo-elements, so it adds no
  // element. ::before carries the selected surface. Under Reduced Motion,
  // ::after is the old surface that fades out in place. Both are hidden at
  // rest. A negative z-index keeps them under every segment's content, inside
  // the stacking context the container's isolation makes. Above the segments,
  // a moving lens could paint over their titles. WebKit's overlap test can
  // miss what a moving layer covers.
  lens: {
    '::before': {
      content: '""',
      position: 'absolute',
      zIndex: -1,
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: laid out on a segment's box measured from client rects (useSegmentedSelectionMotion), in both directions.
      left: 'var(--_segmented-lens-left, 0px)',
      top: 'var(--_segmented-lens-top, 0px)',
      width: 'var(--_segmented-lens-width, 0px)',
      height: 'var(--_segmented-lens-height, 0px)',
      boxSizing: 'border-box',
      // Scales around its center: the lens's position and size are separate.
      transformOrigin: '50% 50%',
      pointerEvents: 'none',
      visibility: 'var(--_segmented-lens-visibility, hidden)',
      willChange: 'var(--astryx-motion-will-change-before, auto)',
      // It carries a copy of an already resolved surface, forced colors
      // included (Highlight), so the UA must not remap it again.
      forcedColorAdjust: 'none',
      backgroundColor: 'var(--_segmented-lens-background-color, transparent)',
      backgroundImage: 'var(--_segmented-lens-background-image, none)',
      backgroundPosition: 'var(--_segmented-lens-background-position, 0% 0%)',
      backgroundSize: 'var(--_segmented-lens-background-size, auto)',
      backgroundRepeat: 'var(--_segmented-lens-background-repeat, repeat)',
      backgroundOrigin: 'var(--_segmented-lens-background-origin, padding-box)',
      backgroundClip: 'var(--_segmented-lens-background-clip, border-box)',
      boxShadow: 'var(--_segmented-lens-box-shadow, none)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderTopLeftRadius: 'var(--_segmented-lens-border-top-left-radius, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderTopRightRadius:
        'var(--_segmented-lens-border-top-right-radius, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderBottomRightRadius:
        'var(--_segmented-lens-border-bottom-right-radius, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderBottomLeftRadius:
        'var(--_segmented-lens-border-bottom-left-radius, 0px)',
      borderTopWidth: 'var(--_segmented-lens-border-top-width, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderRightWidth: 'var(--_segmented-lens-border-right-width, 0px)',
      borderBottomWidth: 'var(--_segmented-lens-border-bottom-width, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderLeftWidth: 'var(--_segmented-lens-border-left-width, 0px)',
      borderTopStyle: 'var(--_segmented-lens-border-top-style, none)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderRightStyle: 'var(--_segmented-lens-border-right-style, none)',
      borderBottomStyle: 'var(--_segmented-lens-border-bottom-style, none)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderLeftStyle: 'var(--_segmented-lens-border-left-style, none)',
      borderTopColor: 'var(--_segmented-lens-border-top-color, currentcolor)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderRightColor:
        'var(--_segmented-lens-border-right-color, currentcolor)',
      borderBottomColor:
        'var(--_segmented-lens-border-bottom-color, currentcolor)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderLeftColor: 'var(--_segmented-lens-border-left-color, currentcolor)',
      backdropFilter: 'var(--_segmented-lens-backdrop-filter, none)',
      WebkitBackdropFilter:
        'var(--_segmented-lens-webkit-backdrop-filter, none)',
    },
    '::after': {
      content: '""',
      position: 'absolute',
      zIndex: -1,
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: laid out on a segment's box measured from client rects (useSegmentedSelectionMotion), in both directions.
      left: 'var(--_segmented-after-left, 0px)',
      top: 'var(--_segmented-after-top, 0px)',
      width: 'var(--_segmented-after-width, 0px)',
      height: 'var(--_segmented-after-height, 0px)',
      boxSizing: 'border-box',
      // Scales around its center: the lens's position and size are separate.
      transformOrigin: '50% 50%',
      pointerEvents: 'none',
      visibility: 'var(--_segmented-after-visibility, hidden)',
      willChange: 'var(--astryx-motion-will-change-after, auto)',
      // It carries a copy of an already resolved surface, forced colors
      // included (Highlight), so the UA must not remap it again.
      forcedColorAdjust: 'none',
      backgroundColor: 'var(--_segmented-after-background-color, transparent)',
      backgroundImage: 'var(--_segmented-after-background-image, none)',
      backgroundPosition: 'var(--_segmented-after-background-position, 0% 0%)',
      backgroundSize: 'var(--_segmented-after-background-size, auto)',
      backgroundRepeat: 'var(--_segmented-after-background-repeat, repeat)',
      backgroundOrigin:
        'var(--_segmented-after-background-origin, padding-box)',
      backgroundClip: 'var(--_segmented-after-background-clip, border-box)',
      boxShadow: 'var(--_segmented-after-box-shadow, none)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderTopLeftRadius:
        'var(--_segmented-after-border-top-left-radius, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderTopRightRadius:
        'var(--_segmented-after-border-top-right-radius, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderBottomRightRadius:
        'var(--_segmented-after-border-bottom-right-radius, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderBottomLeftRadius:
        'var(--_segmented-after-border-bottom-left-radius, 0px)',
      borderTopWidth: 'var(--_segmented-after-border-top-width, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderRightWidth: 'var(--_segmented-after-border-right-width, 0px)',
      borderBottomWidth: 'var(--_segmented-after-border-bottom-width, 0px)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderLeftWidth: 'var(--_segmented-after-border-left-width, 0px)',
      borderTopStyle: 'var(--_segmented-after-border-top-style, none)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderRightStyle: 'var(--_segmented-after-border-right-style, none)',
      borderBottomStyle: 'var(--_segmented-after-border-bottom-style, none)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderLeftStyle: 'var(--_segmented-after-border-left-style, none)',
      borderTopColor: 'var(--_segmented-after-border-top-color, currentcolor)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderRightColor:
        'var(--_segmented-after-border-right-color, currentcolor)',
      borderBottomColor:
        'var(--_segmented-after-border-bottom-color, currentcolor)',
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: a copy of the segment's computed (physical) surface.
      borderLeftColor:
        'var(--_segmented-after-border-left-color, currentcolor)',
      backdropFilter: 'var(--_segmented-after-backdrop-filter, none)',
      WebkitBackdropFilter:
        'var(--_segmented-after-webkit-backdrop-filter, none)',
    },
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
  // A touch device (a coarse primary pointer) gets UIKit's motion: the
  // selection slides on a spring. Under a mouse it slides on the theme's
  // duration and easing.
  const isTouchPresentation = useTouchPresentation().isTouch;
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Every pointer's press is tracked. A drag from the selected segment
  // carries the lens, and the lift commits the segment nearest the pointer.
  // A lift outside the control commits nothing.
  const {selection, attachTrack} = useSegmentedSelectionMotion(
    trackRef,
    value,
    isTouchPresentation,
    !isDisabled,
  );

  // Disabled-reason tooltip. Applies to the whole-group disabled state. The
  // tooltip listeners attach to the radiogroup container, which keeps pointer
  // events while disabled; the radios stay perceivable via aria-disabled.
  // Selection is blocked by the isDisabled guards in the click/focus handlers.
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
  const {listRef, handleKeyDown, handleFocus} =
    useInternalListFocus<HTMLDivElement>({
      itemSelector: '[role="radio"]:not([aria-disabled="true"])',
      hasRovingTabIndex: true,
      // One Tab stop, placed by the control (FR2, FR7): the selected segment,
      // enabled or not and in a disabled control too, else the first segment
      // not disabled by its own isDisabled, else the first.
      tabStopOrder: orderTabStop,
      wrap: true,
      orientation: 'horizontal',
    });

  const hint = useKeyboardHint({
    orientation: 'horizontal',
    isEnabled: !isDisabled,
  });

  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      selection.keyPressed();
      onKeyDownProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      hint.onKeyDown(e);
      handleKeyDown(e);
    },
    [selection, onKeyDownProp, hint, handleKeyDown],
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
      // A mouse or pen press moves focus at pointerdown. A finger moves it
      // after the lift, before the tap's click. The press commits through
      // that click, so this focus move selects nothing.
      if (selection.isPressing()) {
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
    [onFocusProp, hint, handleFocus, isDisabled, onChange, selection, value],
  );

  const contextValue = useMemo(
    () => ({
      value,
      onChange,
      size,
      layout,
      isDisabled,
      disabledReasonID: showsDisabledMessage
        ? disabledMessageTooltip.describedBy
        : undefined,
      isTouchPresentation,
    }),
    [
      value,
      onChange,
      size,
      layout,
      isDisabled,
      showsDisabledMessage,
      disabledMessageTooltip.describedBy,
      isTouchPresentation,
    ],
  );

  return (
    <SegmentedControlContext value={contextValue}>
      <div
        ref={useMergedRefs(
          ref,
          listRef,
          trackRef,
          attachTrack,
          disabledMessageTooltip.ref,
        )}
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
            (isTouchPresentation || !isDisabled) && styles.lens,
            isDisabled && styles.disabled,
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

/**
 * The control's segments, its Tab stop first: the selected segment, enabled
 * or not, else the first segment not disabled by its own isDisabled, else the
 * first (FR2, FR7).
 */
function orderTabStop(list: HTMLElement): ReadonlyArray<HTMLElement> {
  const segments = Array.from(
    list.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  const stop =
    segments.find(segment => segment.getAttribute('aria-checked') === 'true') ??
    segments.find(segment => !isSegmentDisabledOnItsOwn(segment)) ??
    segments[0];
  return stop == null
    ? []
    : [stop, ...segments.filter(segment => segment !== stop)];
}
