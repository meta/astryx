// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PopoverTouch.ts
 * @input usePopoverSurfaceMotion.ts (the touch presentation's grow and
 *   shrink)
 * @output Popover's touch layer: usePopoverSurfaceMotion
 * @position The one module Popover imports touch-only code through, and its
 *   only import site is Popover.tsx. The mouse paths stay outside it.
 *
 * A pointer page carries this touch-only code. Components import the shared
 * touch modules statically, with no install call, so this module's cost is
 * in every Popover import.
 *
 * SYNC: When modified, keep every touch-only import of Popover.tsx here.
 */

export {usePopoverSurfaceMotion} from './usePopoverSurfaceMotion';
