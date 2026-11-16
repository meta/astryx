// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file cutTextTooltipLayer.tsx
 * @input The anchor element, the full text and the focus trigger rule
 * @output Exports `CutTextTooltipLayer`, the tooltip that shows cut text in full
 * @position Loaded on demand by `internal/cutTextTooltip.tsx` the first time text is
 *   found cut, so the tooltip hook stays out of the code a page loads up front.
 */

import type {ReactNode, RefObject} from 'react';
import {useTooltip, type TooltipFocusTrigger} from './useTooltip';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

export function CutTextTooltipLayer({
  anchorRef,
  content,
  focusTrigger,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: string;
  focusTrigger: TooltipFocusTrigger;
}): ReactNode {
  const tooltip = useTooltip({placement: 'above', focusTrigger});
  const attach = tooltip.ref;
  // Attaches without a description: the tooltip repeats the element's name,
  // so a screen reader does not hear it twice.
  useIsomorphicLayoutEffect(() => {
    attach(anchorRef.current);
    return () => {
      attach(null);
    };
  }, [anchorRef, attach]);
  return tooltip.renderTooltip(content);
}
