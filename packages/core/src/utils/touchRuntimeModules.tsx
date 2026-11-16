// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchRuntimeModules.tsx
 * @input The shared touch core: the animator, and Safari on iOS's keyboard
 *   schedule (keyboard/uikitKeyboardSchedule.ts), which the keyboard riders
 *   register with the layout guide
 * @output `touchRuntime`, the one object the touch loader publishes
 * @position Loaded only through `import()` in utils/touchRuntime.ts. No
 *   other module imports this file. A component's own touch code is its touch
 *   part (createTouchPart), so a page that never renders that component does
 *   not load it
 */

import {animatorFor} from '../motion/animator';
import {createUIKitKeyboardSchedule} from '../keyboard/uikitKeyboardSchedule';

/**
 * What the touch loader publishes once the page has loaded it. Safari on iOS's
 * keyboard schedule comes from here, so a page that never loads the runtime
 * carries none of it.
 */
export const touchRuntime = {
  animatorFor,
  createUIKitKeyboardSchedule,
} as const;

export type TouchRuntime = typeof touchRuntime;
