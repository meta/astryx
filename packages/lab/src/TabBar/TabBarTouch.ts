// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TabBarTouch.ts
 * @input The touch hooks beside it
 * @output TabBar's touch layer, its one import site: every hook that runs
 *   core's animator or gesture recognizers for TabBar (the exports below)
 * @position Internal to the lab TabBar (TabBar.tsx)
 *
 * Under a fine pointer a drag moves the lens body on `lensTrack` and settles
 * it on `lensSettle`. The lift and the copy of the items stay a finger's.
 */

export {useTabBarLens} from './useTabBarLens';
export {useTabBarMinimize} from './useTabBarMinimize';
export {useTabBarSearch} from './useTabBarSearch';
