// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaTheme.tsx
 * @input mode prop ("dark" | "light" | "auto" | "off") + children
 * @output Wrapper div that creates an inverted theming context
 * @position Theme system component; sibling to Theme
 *
 * Provides semantic token overrides for content rendered on a surface
 * with a different luminance than the page background. Used by Toast,
 * Overlay, and other components that render on inverted surfaces.
 *
 * How it works:
 * 1. Sets `data-astryx-media="dark|light"` — the theme's generated CSS
 *    targets this to apply token overrides (including color-scheme).
 * 2. Parent theme's component overrides pass through — structural
 *    styling (border-radius, font-weight, etc.) is preserved.
 *    Only tokens (colors, overlays, borders) change for the surface.
 * 3. Themes can further customize components on media surfaces via
 *    `onDark.components` / `onLight.components` in defineTheme().
 * 4. Children (Button, Link, Text, etc.) pick up inverted tokens
 *    naturally through CSS custom property inheritance
 * 5. `mode="auto"` measures the painted surface and picks a side — or none;
 *    `mode="off"` renders the same element with no media attribute, so
 *    either can change without remounting children.
 *
 * @example
 * ```
 * <div style={{ backgroundColor: 'var(--color-background-inverted)' }}>
 *   <MediaTheme mode="auto">
 *     <Button label="Undo" variant="ghost" />
 *   </MediaTheme>
 * </div>
 * ```
 */

import * as React from 'react';
import {useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from './tokens.stylex';
import {dataAttr} from '../naming';
import {useAutoMediaMode} from '../hooks/useAutoMediaMode';

const styles = stylex.create({
  root: {
    display: 'contents',
  },
  active: {
    color: colorVars['--color-text-primary'],
  },
});

/** Surface luminance context, or `"off"` for no media context at all. */
export type MediaThemeMode = 'dark' | 'light' | 'auto' | 'off';

export interface MediaThemeProps {
  /**
   * The surface luminance context for children.
   * - `"dark"` — children are on a dark background (get light text/icons)
   * - `"light"` — children are on a light background (get dark text/icons)
   * - `"auto"` — measure the painted surface and use whichever side reads
   *   better on it, or no media context at all when the surface's ambient
   *   text already reads better than either
   * - `"off"` — children keep the ambient theme; the surface needs no
   *   inversion
   */
  mode: MediaThemeMode;
  /**
   * Which side `mode="auto"` uses when the surface cannot be measured: on the
   * server, on the first client frame, and whenever the backdrop is not
   * knowable from CSS — most often a `background-image`, whose pixels need
   * sampling (see `useImageMode`) rather than a computed style.
   *
   * Ignored unless `mode="auto"`.
   * @default "dark"
   */
  fallback?: 'dark' | 'light';
  /** Content to render in the media context */
  children: React.ReactNode;
}

/**
 * Inverted surface theming context.
 *
 * Wraps children with `data-astryx-media` — the theme's CSS targets this
 * attribute to apply inverted tokens. Parent component overrides flow
 * through unchanged; only tokens change for the surface context.
 */
export function MediaTheme({
  mode,
  fallback = 'dark',
  children,
}: MediaThemeProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  // Measures this element's PARENT — see useAutoMediaMode. `display: contents`
  // means the parent is the element that actually paints the surface.
  const detected = useAutoMediaMode(ref, mode === 'auto');
  const resolved = mode === 'auto' ? (detected ?? fallback) : mode;

  // "off" keeps the element — and therefore the React tree and the DOM
  // structure — identical, so a surface can switch its media context on and
  // off without remounting its children.
  return (
    <div
      ref={ref}
      {...(resolved === 'off' ? null : {[dataAttr('media')]: resolved})}
      {...stylex.props(styles.root, resolved !== 'off' && styles.active)}>
      {children}
    </div>
  );
}

MediaTheme.displayName = 'MediaTheme';
