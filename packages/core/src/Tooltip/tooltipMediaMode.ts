// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file tooltipMediaMode.ts
 * @input The tooltip content element and whether the tooltip shows
 * @output useTooltipMediaMode: the media side for content on the tooltip's
 *   inverted surface
 * @position Tooltip internal; feeds the MediaTheme that useTooltip renders
 *   around the supplied content
 */

import type {RefObject} from 'react';
import {useTheme} from '../theme/useTheme';
import {useSurfaceMediaMode} from '../hooks/useAutoMediaMode';
import {pickInvertedSide, type MediaSidePicker} from '../hooks/mediaSide';
import {parseColor} from '../utils/color';

/**
 * The tooltip surface sets its own text color. That color does not tell
 * whether other text reads on the surface. So only the two on-colors compete,
 * and the content always gets a media side.
 */
export const pickTooltipSide: MediaSidePicker = (
  background,
  _ambient,
  onDark,
  onLight,
) => pickInvertedSide(background, null, onDark, onLight);

/**
 * The media side for content on the tooltip surface. Token-colored content,
 * such as `Text`, otherwise resolves against the page theme and can take the
 * surface's own color.
 *
 * Before a measurement, the side comes from the theme's resolved inverted
 * surface. When that color is translucent or unreadable, the side is the
 * opposite of the color mode.
 */
export function useTooltipMediaMode(
  contentRef: RefObject<HTMLElement | null>,
  isShown: boolean,
): 'dark' | 'light' {
  const {mode, tokens} = useTheme();
  const surface = parseColor(tokens['--color-background-inverted'] ?? '');
  const fromTokens =
    surface !== null && surface.a >= 1
      ? pickTooltipSide(
          surface,
          null,
          parseColor(tokens['--color-on-dark'] ?? ''),
          parseColor(tokens['--color-on-light'] ?? ''),
        )
      : null;
  const measured = useSurfaceMediaMode(contentRef, isShown, pickTooltipSide);
  const side = measured ?? fromTokens;
  if (side === 'dark' || side === 'light') {
    return side;
  }
  return mode === 'light' ? 'dark' : 'light';
}
