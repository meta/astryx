// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file preserveAnimations.ts
 * @input An element whose subtree is about to leave rendering for one forced
 *   layout, and the function that does it
 * @output The same CSS animations and transitions afterwards, in the state
 *   they were in before
 * @position Layer runtime; the re-placement of a layer that keeps its anchor
 *   clear (spec:AST-059 FR4)
 *
 * Taking an element out of rendering cancels every CSS animation and
 * transition of it and its subtree. When it returns, the browser creates the
 * animations again from the stylesheet, at their start. It starts no
 * transition but one from `@starting-style`, and script-created animations
 * are untouched. `preserveAnimations` reads every animation's state first.
 * Afterwards it gives each recreated CSS animation that state, and resumes
 * each cancelled transition with a script animation at the same point. Any
 * other animation the return started is finished, unless it never ends
 * (motion/carryAnimations.ts). The browser fires
 * `animationcancel`/`transitioncancel` for the old ones and `animationstart`
 * for the new ones.
 */

import {restoreAnimations, saveAnimation} from '../motion/carryAnimations';

/**
 * Run `reset`, which takes `root` out of rendering and back, and put every
 * CSS animation and transition of `root` and its subtree back in the state it
 * was in before.
 */
export function preserveAnimations(root: Element, reset: () => void): void {
  if (typeof root.getAnimations !== 'function') {
    reset();
    return;
  }
  const before = root.getAnimations({subtree: true});
  const saved = before.map(saveAnimation);
  reset();
  restoreAnimations(root, saved, new Set(before));
}
