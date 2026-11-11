// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AttachedTooltip.tsx
 * @input An element, the tooltip text and its placement
 * @output Exports AttachedTooltip, a tooltip layer attached to an element that
 *   the caller renders
 * @position Internal to Core. Loaded on demand through
 *   utils/attachedTooltipModule by utils/OnDemandTooltip, so importing Button
 *   or Link does not load the Tooltip. The layer is not a describedby target:
 *   the caller describes its element with its own copy of the text.
 */

import {useLayoutEffect, type ReactNode} from 'react';
import type {LayerPlacement} from '../Layer/useLayer';
import {useTooltip} from './useTooltip';

export function AttachedTooltip({
  anchor,
  content,
  placement,
}: {
  anchor: HTMLElement | null;
  content: string;
  placement: LayerPlacement;
}): ReactNode {
  const tooltip = useTooltip({placement});
  const attach = tooltip.ref;
  // Syncs the tooltip's trigger with the element, which this part does not
  // render. A new element moves the trigger to it.
  useLayoutEffect(() => attach(anchor), [anchor, attach]);
  return tooltip.renderTooltip(content);
}
