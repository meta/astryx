// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePressFeedback.ts
 * @input The document-level press controller (utils/pressFeedback.ts)
 * @output Exports usePressFeedback
 * @position Core hook; every component that paints a press calls it and
 *   spreads its result on the element that paints
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/usePressFeedback.doc.mjs
 * - /packages/core/src/utils/pressFeedback.ts
 */

import {useEffect} from 'react';
import {installPressFeedback, pressableProps} from '../utils/pressFeedback';

/**
 * Mark an element as a pressable surface of the touch press model, and make
 * sure the document-level controller that drives it is installed.
 *
 * Spread the result on the element that paints the press, and compose one of
 * `interactionOverlayStyles` (from `@astryxdesign/core/utils`) on the same
 * element: `backgroundColor` or `backgroundImage` for a surface whose hover
 * and press are the system's overlays, `pressedBackgroundColor` for one
 * whose hover is its own. The controller writes its attribute on the element
 * while a touch press is believed (after the onset delay, cancelled by travel
 * or by a scroll) and for the release, and the composed style paints the
 * pressed token at the press's strength on the first frame and fades it over
 * the release, keeping `:active` for a mouse on a desktop. On a phone or
 * tablet the stylesheet drops `:active` for every press, so the controller
 * also paints a mouse, trackpad or Space-key press there, at once. A press is
 * themed through `--color-overlay-pressed`, which the hold, the flash and the
 * fade all read.
 * Every Astryx component that paints a press already does this; reach for it
 * when a local component paints its own press and must behave like the rest
 * of the system under a finger.
 *
 * Installation is shared and counted: the first mounted pressable installs
 * the controller, the last one to unmount removes it. No per-element listener
 * or state is added — a press costs one attribute write on one element.
 *
 * @example
 * ```
 * const pressable = usePressFeedback();
 * return <div role="button" {...pressable} {...stylex.props(styles.row)} />;
 * ```
 */
export function usePressFeedback(): typeof pressableProps {
  useEffect(() => installPressFeedback(), []);
  return pressableProps;
}
