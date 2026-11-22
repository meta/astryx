// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file tooltipSurfaceSide.tsx
 * @input The tooltip's surface element, whether it shows, and a callback
 * @output Exports `TooltipSurfaceSide`, which measures the media side that
 *   reads on the painted tooltip surface and reports it
 * @position Internal to Tooltip. TooltipMediaContent loads this module after
 *   the first paint, so the color measurement adds no code to a page's first
 *   load.
 */

import type {ReactNode, RefObject} from 'react';
import {useSurfaceMediaMode} from '../hooks/useAutoMediaMode';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  pickInvertedSide,
  type DetectedMediaMode,
  type MediaSidePicker,
} from '../hooks/mediaSide';

/**
 * The page's primary text is not the color this surface uses. So only the two
 * on-colors compete, and the content always gets a media side.
 */
const pickTooltipSide: MediaSidePicker = (
  background,
  _ambient,
  onDark,
  onLight,
) => pickInvertedSide(background, null, onDark, onLight);

/**
 * Measures the media side on the painted surface while the tooltip shows and
 * reports it before that frame paints. It renders nothing.
 */
export function TooltipSurfaceSide({
  surfaceRef,
  isShown,
  onSide,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  isShown: boolean;
  onSide: (side: DetectedMediaMode | null) => void;
}): ReactNode {
  const side = useSurfaceMediaMode(surfaceRef, isShown, pickTooltipSide);
  // Syncs the measured side with the content's media context.
  useIsomorphicLayoutEffect(() => {
    onSide(side);
  }, [side, onSide]);
  return null;
}
