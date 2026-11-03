// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenuTouch.ts
 * @input menuSurfaceMotion.ts (UIMenu's grow and collapse on the animator),
 *   the menu springs' register function, the press's scroll probe
 * @output DropdownMenu's touch layer: createMenuSurfaceMotion and its type,
 *   and isInScrollView
 * @position The one module DropdownMenu imports touch-only code through, and
 *   its only import site is DropdownMenu.tsx. The mouse paths stay outside
 *   it, so a desktop build can swap it for a no-op.
 *
 * UIKit's two menu springs register here as their roles, before the first
 * animation: nothing registers on import, and no other spring ships with it.
 *
 * SYNC: When modified, keep every touch-only import of DropdownMenu.tsx here.
 */

import {registerMenuSprings} from '../motion/uikit/springs';
import {
  createMenuSurfaceMotion as createSurfaceMotion,
  type MenuSurfaceMotion,
} from './menuSurfaceMotion';

export type {MenuSurfaceMotion};
export {isInScrollView} from '../hooks/menuScrollView';

/**
 * UIMenu's grow and collapse for a menu surface. Registers UIKit's two menu
 * springs first, the internal motion roles the motion reads
 * (`springs.menuOpen`, `springs.menuClose`);
 * registering again is a no-op. The menu table's values are constants, read
 * directly.
 */
export function createMenuSurfaceMotion(
  ...args: Parameters<typeof createSurfaceMotion>
): MenuSurfaceMotion {
  registerMenuSprings();
  return createSurfaceMotion(...args);
}
