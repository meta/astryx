// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TooltipMediaContent.tsx
 * @input The tooltip's content, its surface element, and whether it shows
 * @output Exports `TooltipMediaContent`: the content with the tokens of the
 *   media side that reads on the tooltip surface
 * @position Internal to Tooltip. It reads no resolved theme tokens, and it
 *   loads its color measurement after the first paint, so a page that
 *   renders tooltips adds little code to its first load.
 */

import {
  use,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react';
import {MediaTokens} from '../theme/MediaTokens';
import {ThemeContext} from '../theme/useTheme';
import {createModuleLoader} from '../utils/moduleLoader';
import type {DetectedMediaMode} from '../hooks/mediaSide';
import type {TooltipSurfaceSide as TooltipSurfaceSideType} from './tooltipSurfaceSide';

const surfaceSideModule = createModuleLoader(
  async () => import('./tooltipSurfaceSide'),
);

/**
 * Content on the tooltip surface, with the tokens of the media side that
 * reads on it. Token-colored content, such as `Text`, otherwise resolves
 * against the page theme and can take the surface's own color. Inherited
 * text keeps the `tooltip` surface's color, and a MediaTheme inside the
 * content sets its own side for what it holds.
 *
 * The side is measured on the painted surface when the tooltip shows, before
 * that frame paints. Until a measurement, it is the side opposite the color
 * mode, as an inverted surface usually is.
 */
export function TooltipMediaContent({
  surfaceRef,
  isShown,
  children,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  isShown: boolean;
  children: ReactNode;
}): ReactNode {
  const theme = use(ThemeContext);
  const [measured, setMeasured] = useState<DetectedMediaMode | null>(null);
  const [SurfaceSide, setSurfaceSide] = useState<ComponentType<
    Parameters<typeof TooltipSurfaceSideType>[0]
  > | null>(() => surfaceSideModule.loaded()?.TooltipSurfaceSide ?? null);
  // Syncs with the module loader: element content loads the measurement.
  useEffect(() => {
    if (SurfaceSide != null) {
      return;
    }
    let isCurrent = true;
    surfaceSideModule.load().then(
      loaded => {
        if (isCurrent) {
          setSurfaceSide(() => loaded.TooltipSurfaceSide);
        }
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [SurfaceSide]);
  const mode =
    measured === 'dark' || measured === 'light'
      ? measured
      : theme?.mode === 'dark'
        ? 'light'
        : 'dark';
  return (
    <>
      {SurfaceSide != null && (
        <SurfaceSide
          surfaceRef={surfaceRef}
          isShown={isShown}
          onSide={setMeasured}
        />
      )}
      <MediaTokens mode={mode}>{children}</MediaTokens>
    </>
  );
}
