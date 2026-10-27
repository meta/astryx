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
 * whose hover is its own. Under a finger the controller tracks the press the
 * way UIKit tracks a control and writes its
 * attribute on the element while the press is held and for the release; the
 * composed style paints the pressed token on the first frame and fades it
 * over the release. A mouse's or a pen's press is the controller's on every
 * device, painted at once (`spec:AST-094` FR11); a Space press keeps `:active`
 * on a desktop and is painted by the controller on a phone or tablet, where
 * the stylesheet drops `:active`. A press is
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
 * return <button {...pressable} {...stylex.props(styles.button)} />;
 * ```
 */
export function usePressFeedback(): typeof pressableProps {
  useEffect(() => installPressFeedback(), []);
  return pressableProps;
}
