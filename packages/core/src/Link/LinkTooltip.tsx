// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LinkTooltip.tsx
 * @input The tooltip text, the caller's ref and handlers, and a render
 *   function for the link element
 * @output Exports LinkTooltip, which attaches an on-demand tooltip to the
 *   link element it renders, and LinkTooltipTriggerProps
 * @position Internal to Link. Link stays presentational: this part owns the
 *   held interaction, the anchor ref and the description id. It adds no DOM
 *   around the link. The Tooltip module loads on demand, and the first hover,
 *   tap or focus mounts the tooltip on the link element itself.
 */

import {useId, useRef, type ReactNode, type Ref} from 'react';
import {useDeferredTooltipInterest} from '../hooks/useDeferredTooltipInterest';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {TooltipPresentInterestContext} from '../Tooltip/tooltipPresentInterest';
import {attachedTooltipModule} from '../utils/attachedTooltipModule';
import {composeEventHandlers} from '../utils/composeEventHandlers';

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

/** The props Link puts on its element so the tooltip attaches to it. */
export type LinkTooltipTriggerProps = TriggerHandlers & {
  ref: Ref<HTMLElement>;
};

export function LinkTooltip({
  tooltip,
  callerRef,
  callerProps,
  children,
}: {
  tooltip: string;
  /** The caller's ref, merged with the tooltip's anchor. */
  callerRef: Ref<HTMLElement> | undefined;
  /** The caller's own handlers and description, composed with the tooltip's. */
  callerProps: TriggerHandlers;
  /** Renders the link element with the trigger props. */
  children: (triggerProps: LinkTooltipTriggerProps) => ReactNode;
}): ReactNode {
  const interest = useDeferredTooltipInterest(true, attachedTooltipModule);
  const descriptionId = useId();
  const anchorRef = useRef<HTMLElement | null>(null);
  const ref = useMergedRefs<HTMLElement>(callerRef, anchorRef);
  // The description is the link's own hidden copy of the tooltip text, after
  // any caller value, so a screen reader reads it once, before and after the
  // tooltip loads.
  const triggerProps: LinkTooltipTriggerProps = {
    ref,
    'aria-describedby':
      [callerProps['aria-describedby'], descriptionId]
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
      <span id={descriptionId} popover="manual">
        {tooltip}
      </span>
      {interest.isWanted && AttachedTooltip != null && (
        <TooltipPresentInterestContext value={interest.interestRef}>
          <AttachedTooltip
            anchorRef={anchorRef}
            content={tooltip}
            placement="above"
          />
        </TooltipPresentInterestContext>
      )}
    </>
  );
}
