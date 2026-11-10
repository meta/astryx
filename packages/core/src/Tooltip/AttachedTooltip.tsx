// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AttachedTooltip.tsx
 * @input An element's ref, the tooltip text and its placement
 * @output Exports AttachedTooltip, a tooltip layer attached to an element that
 *   the caller renders
 * @position Internal to Core. Loaded on demand through utils/attachedTooltipModule
 *   by a component that owns its own description (Button), so importing that
 *   component does not load the Tooltip. The layer is not a describedby
 *   target: the caller describes its element with its own copy of the text.
 */

import {useLayoutEffect, type ReactNode, type RefObject} from 'react';
import type {LayerPlacement} from '../Layer/useLayer';
import {useTooltip} from './useTooltip';

export function AttachedTooltip({
  anchorRef,
  content,
  placement,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: string;
  placement: LayerPlacement;
}): ReactNode {
  const tooltip = useTooltip({placement});
  const attach = tooltip.ref;
  // Syncs the tooltip's trigger with the element, which this part does not
  // render.
  useLayoutEffect(() => attach(anchorRef.current), [anchorRef, attach]);
  return tooltip.renderTooltip(content);
}
