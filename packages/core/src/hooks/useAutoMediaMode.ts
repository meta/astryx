// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAutoMediaMode.ts
 * @input Ref to the element whose backdrop should be measured
 * @output 'dark' | 'light' | null (not yet measurable)
 * @position Internal; powers `MediaTheme mode="auto"`. Not exported from the
 *   package. Sibling to useImageMode, which does the same for images.
 */

// The hook measures what the browser painted and does not trust a token's
// name. `--color-background-inverted` need not be inverted: a theme can make
// it pale grey, and a fixed `mode="dark"` then paints white text on it at
// 1.25:1. The surface color is a runtime value, so only a measurement can
// catch this.
//
// The answer can be `'off'` when the surface's own text already reads on it.
// A dark page already resolves those tokens to the media context's values,
// so a chromatic but legible surface loses nothing.

import {useRef, useState} from 'react';
import type {RefObject} from 'react';
import type {RGBA} from '../utils/color';
import {parseColor, formatColor} from '../utils/color';
import {compositeOver} from '../theme/contrast';
import {useTheme} from '../theme/useTheme';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {
  pickMediaMode,
  type DetectedMediaMode,
  type MediaSidePicker,
} from './mediaSide';

/**
 * Resolve token references to the colors they paint, through a hidden probe.
 * `getPropertyValue` returns a token's specified text, and Astryx tokens are
 * `light-dark(a, b)` pairs that resolve only in a real property. The probe
 * sets each token as `color` and reads the computed value. `display: none`
 * keeps the probe out of layout, so this costs a style recalc and no reflow.
 */
function resolvePaintedColors(
  host: HTMLElement,
  tokens: ReadonlyArray<string>,
): (RGBA | null)[] {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  host.appendChild(probe);
  try {
    return tokens.map(token => {
      probe.style.color = `var(${token})`;
      return parseColor(getComputedStyle(probe).color);
    });
  } finally {
    probe.remove();
  }
}

/**
 * The color actually behind an element: its own background if opaque,
 * otherwise its translucent layers composited down onto the first opaque
 * ancestor.
 *
 * Returns null when the paint is not knowable from CSS:
 * - a `background-image` (gradient, photo, video poster) anywhere in the
 *   chain — its pixels need sampling, which is `useImageMode`'s job and
 *   needs CORS access the stylesheet cannot give us;
 * - no opaque layer at all, where the paint is the browser canvas.
 */
function resolveBackdrop(element: HTMLElement): RGBA | null {
  const layers: RGBA[] = [];
  let node: HTMLElement | null = element;

  while (node !== null) {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== 'none') {
      return null;
    }
    const color = parseColor(style.backgroundColor);
    if (color !== null && color.a > 0) {
      layers.push(color);
      if (color.a >= 1) {
        break;
      }
    }
    node = node.parentElement;
  }

  const base = layers.pop();
  if (base === undefined || base.a < 1) {
    return null;
  }
  // layers is now top-first; composite downward so the topmost lands last.
  return layers.reduceRight(
    (backdrop, layer) => compositeOver(layer, backdrop),
    base,
  );
}

/**
 * Detect the media context for the element's surroundings.
 *
 * Measures `ref`'s PARENT, never `ref` itself: MediaTheme sets its media
 * attribute on its own element, so measuring that would feed the decision
 * back into its own input and let it oscillate. The parent owns the
 * background and sits outside the media context, so both inputs stay
 * independent of the result.
 *
 * Returns null until a measurement succeeds — on the server, before the
 * layout effect runs, and whenever the backdrop is not knowable from CSS.
 * The caller renders its fallback for those.
 */
export function useAutoMediaMode(
  ref: RefObject<HTMLElement | null>,
  isEnabled: boolean,
): DetectedMediaMode | null {
  return useMeasuredMediaMode(
    () => ref.current?.parentElement ?? null,
    isEnabled,
    pickMediaMode,
  );
}

/**
 * Detect the media side for the surface `ref` paints itself, by `pick`.
 * Returns null until a measurement succeeds, as useAutoMediaMode does.
 */
export function useSurfaceMediaMode(
  ref: RefObject<HTMLElement | null>,
  isEnabled: boolean,
  pick: MediaSidePicker,
): DetectedMediaMode | null {
  return useMeasuredMediaMode(() => ref.current, isEnabled, pick);
}

function useMeasuredMediaMode(
  surfaceOf: () => HTMLElement | null,
  isEnabled: boolean,
  pick: MediaSidePicker,
): DetectedMediaMode | null {
  const [detected, setDetected] = useState<DetectedMediaMode | null>(null);
  // `tokens` is a stable reference unless the theme or color mode changes.
  const {tokens} = useTheme();
  const lastRef = useRef<{background: string; tokens: unknown} | null>(null);

  // Syncs the media mode with the painted color behind the element.
  // No dependency array. A surface color is a painted value, and it changes
  // when a prop on some ancestor changes. No dependency that this hook can
  // name catches that. So the measurement runs on each render, and it skips
  // its expensive half when nothing moved (see the early return below).
  useIsomorphicLayoutEffect(() => {
    const surface = surfaceOf();
    if (!isEnabled || surface === null) {
      return;
    }

    const background = resolveBackdrop(surface);
    if (background === null) {
      return;
    }

    // The probe adds a node and forces another style resolution. Skip it when
    // neither the painted backdrop nor the theme moved, which is the usual
    // case.
    const backgroundKey = formatColor(background);
    const last = lastRef.current;
    if (
      last !== null &&
      last.background === backgroundKey &&
      last.tokens === tokens
    ) {
      return;
    }
    lastRef.current = {background: backgroundKey, tokens};

    const [ambient, onDark, onLight] = resolvePaintedColors(surface, [
      '--color-text-primary',
      '--color-on-dark',
      '--color-on-light',
    ]);
    const next = pick(background, ambient, onDark, onLight);
    if (next === null) {
      return;
    }

    // eslint-disable-next-line @eslint-react/set-state-in-effect -- the mode is derived from painted DOM colors
    setDetected(current => (current === next ? current : next));
  });

  // A disabled hook must not answer with a value measured while it was on.
  return isEnabled ? detected : null;
}
