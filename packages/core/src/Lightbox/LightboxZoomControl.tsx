// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LightboxZoomControl.tsx
 * @input A Lightbox's zoom, through useLightboxZoom
 * @output LightboxZoomControl: zoom out, the zoom level, zoom in and fit
 * @position Goes in a Lightbox's `footer`. Its buttons are disabled where the
 *   active item cannot zoom, such as a video or a custom item.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars, radiusVars, spacingVars} from '../theme/tokens.stylex';
import {Button} from '../Button/Button';
import {Text} from '../Text/Text';
import {useLightboxZoom} from './LightboxContext';

const styles = stylex.create({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    alignSelf: 'center',
    paddingInline: spacingVars['--spacing-1'],
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-on-light']} 75%, transparent)`,
  },
  level: {
    minWidth: 48,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
});

/** Zoom out, the zoom level, zoom in and back to fit, for the active image. */
export function LightboxZoomControl() {
  const {scale, canZoomIn, canZoomOut, zoomIn, zoomOut, reset} =
    useLightboxZoom();
  return (
    <div role="group" aria-label="Zoom" {...stylex.props(styles.pill)}>
      <Button
        label="Zoom out"
        variant="ghost"
        size="sm"
        isDisabled={!canZoomOut}
        onClick={zoomOut}>
        −
      </Button>
      <Text as="span" type="body" xstyle={styles.level}>
        {Math.round(scale * 100)}%
      </Text>
      <Button
        label="Zoom in"
        variant="ghost"
        size="sm"
        isDisabled={!canZoomIn}
        onClick={zoomIn}>
        +
      </Button>
      <Button
        label="Fit"
        variant="ghost"
        size="sm"
        isDisabled={!canZoomOut}
        onClick={reset}>
        Fit
      </Button>
    </div>
  );
}

LightboxZoomControl.displayName = 'LightboxZoomControl';
