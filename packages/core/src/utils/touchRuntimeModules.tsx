// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchRuntimeModules.tsx
 * @input The shared touch core: the animator
 * @output `touchRuntime`, the one object the touch loader publishes
 * @position Loaded only through `import()` in utils/touchRuntime.ts. No
 *   other module imports this file. A component's own touch code is its touch
 *   part (createTouchPart), so a page that never imports that component does
 *   not load it
 */

import {animatorFor} from '../motion/animator';

/** What the touch loader publishes once the page has loaded it. */
export const touchRuntime = {
  animatorFor,
} as const;

export type TouchRuntime = typeof touchRuntime;
