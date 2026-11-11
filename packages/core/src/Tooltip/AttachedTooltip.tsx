// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AttachedTooltip.tsx
 * @input A ref to an element, a callback for its attach function, the tooltip text
 *   and its placement
 * @output Exports AttachedTooltip, a tooltip layer attached to an element that
 *   the caller renders
 * @position Internal to Core. Loaded on demand through
 *   utils/attachedTooltipModule by utils/OnDemandTooltip, so importing Button
 *   or Link does not load the Tooltip. The layer is not a describedby target:
 *   the caller describes its element with its own copy of the text.
 */

import {useLayoutEffect, type ReactNode, type RefObject} from 'react';
import type {LayerPlacement} from '../Layer/useLayer';
import {useTooltip} from './useTooltip';

export function AttachedTooltip({
  anchorRef,
  onAttachChange,
  content,
  placement,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * Receives the function that moves the tooltip to a new element, and null
   * when the tooltip unmounts.
   */
  onAttachChange: (attach: ((element: HTMLElement) => void) | null) => void;
  content: string;
  placement: LayerPlacement;
}): ReactNode {
  const tooltip = useTooltip({placement});
  const attach = tooltip.ref;
  // Syncs the tooltip's trigger with the element, which this part does not
  // render. The caller's ref calls the function it receives with each new
  // element, which moves the trigger to it without a render.
  useLayoutEffect(() => {
    let detach = attach(anchorRef.current) ?? null;
    onAttachChange(element => {
      detach?.();
      detach = attach(element) ?? null;
    });
    return () => {
      onAttachChange(null);
      detach?.();
    };
  }, [anchorRef, onAttachChange, attach]);
  return tooltip.renderTooltip(content);
}
