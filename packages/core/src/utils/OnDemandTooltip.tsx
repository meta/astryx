// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file OnDemandTooltip.tsx
 * @input The tooltip text (or none), whether it describes its element, the
 *   caller's ref and handlers, and a render function for the element
 * @output Exports OnDemandTooltip and OnDemandTooltipTriggerProps
 * @position Internal to Core, shared by Button and Link. It renders the
 *   caller's element with the trigger props, the element's hidden copy of the
 *   tooltip text, and, after the first hover, tap or focus, the tooltip layer
 *   attached to that element. A caller renders through it with or without a
 *   tooltip, so turning the tooltip on or off keeps the element. Importing it
 *   loads no Tooltip module.
 */

import {useCallback, useId, useRef, type ReactNode, type Ref} from 'react';
import {useDeferredTooltipInterest} from '../hooks/useDeferredTooltipInterest';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {TooltipPresentInterestContext} from '../Tooltip/tooltipPresentInterest';
import type {LayerPlacement} from '../Layer/useLayer';
import {attachedTooltipModule} from './attachedTooltipModule';
import {composeEventHandlers} from './composeEventHandlers';

type TriggerHandlers = Pick<
  React.HTMLAttributes<HTMLElement>,
  | 'aria-describedby'
  | 'onPointerEnter'
  | 'onPointerLeave'
  | 'onPointerDown'
  | 'onMouseEnter'
  | 'onMouseLeave'
  | 'onFocus'
  | 'onBlur'
>;

/** The props the caller puts on its element. */
export type OnDemandTooltipTriggerProps = TriggerHandlers & {
  ref: Ref<HTMLElement>;
};

export function OnDemandTooltip({
  tooltip,
  isDescription,
  placement = 'above',
  callerRef,
  callerProps,
  children,
}: {
  /** The tooltip text. Without it, the element renders with no tooltip. */
  tooltip: string | null | undefined;
  /**
   * Whether the tooltip text describes the element. A caller whose tooltip
   * repeats the element's name passes false, so the text is not read twice.
   */
  isDescription: boolean;
  placement?: LayerPlacement;
  /** The caller's ref, merged with the tooltip's anchor. */
  callerRef: Ref<HTMLElement> | undefined;
  /** The caller's own handlers and description, composed with the tooltip's. */
  callerProps: TriggerHandlers;
  /** Renders the element with the trigger props. */
  children: (triggerProps: OnDemandTooltipTriggerProps) => ReactNode;
}): ReactNode {
  const hasTooltip = tooltip != null && tooltip !== '';
  const interest = useDeferredTooltipInterest(
    hasTooltip,
    attachedTooltipModule,
  );
  const descriptionId = useId();
  // The element the tooltip attaches to, and the loaded tooltip's attach. A
  // caller may render a new element (a link that becomes a button): the ref
  // hands it to the tooltip at once.
  const anchorRef = useRef<HTMLElement | null>(null);
  const attachRef = useRef<((element: HTMLElement) => void) | null>(null);
  const trackAnchor = useCallback((element: HTMLElement | null) => {
    if (element != null && element !== anchorRef.current) {
      anchorRef.current = element;
      attachRef.current?.(element);
    }
  }, []);
  const ref = useMergedRefs<HTMLElement>(callerRef, trackAnchor);
  const onAttachChange = useCallback(
    (attach: ((element: HTMLElement) => void) | null) => {
      attachRef.current = attach;
    },
    [],
  );
  if (!hasTooltip) {
    return children({ref});
  }
  const triggerProps: OnDemandTooltipTriggerProps = {
    ref,
    // The element's own hidden copy of the text, after any caller value, so a
    // screen reader reads it once, before and after the tooltip loads.
    'aria-describedby':
      [callerProps['aria-describedby'], isDescription ? descriptionId : null]
        .filter(Boolean)
        .join(' ') || undefined,
    onPointerEnter: composeEventHandlers(
      interest.onPointerEnter,
      callerProps.onPointerEnter,
    ),
    onPointerLeave: composeEventHandlers(
      interest.onPointerLeave,
      callerProps.onPointerLeave,
    ),
    onPointerDown: composeEventHandlers(
      interest.onPointerDown,
      callerProps.onPointerDown,
    ),
    onMouseEnter: composeEventHandlers(
      interest.onMouseEnter,
      callerProps.onMouseEnter,
    ),
    onMouseLeave: composeEventHandlers(
      interest.onMouseLeave,
      callerProps.onMouseLeave,
    ),
    onFocus: composeEventHandlers(interest.onFocus, callerProps.onFocus),
    onBlur: composeEventHandlers(interest.onBlur, callerProps.onBlur),
  };
  const AttachedTooltip = interest.loadedModule?.AttachedTooltip;
  return (
    <>
      {children(triggerProps)}
      {/* A closed manual popover beside the element, where the layer renders:
          a group's edge rules skip popovers, so the element keeps its place
          among its siblings. */}
      {isDescription && (
        <span id={descriptionId} popover="manual">
          {tooltip}
        </span>
      )}
      {interest.isWanted && AttachedTooltip != null && (
        <TooltipPresentInterestContext value={interest.interestRef}>
          <AttachedTooltip
            anchorRef={anchorRef}
            onAttachChange={onAttachChange}
            content={tooltip}
            placement={placement}
          />
        </TooltipPresentInterestContext>
      )}
    </>
  );
}
