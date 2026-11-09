// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TabBarTouch.ts
 * @input The touch hooks beside it
 * @output TabBar's touch layer, its one import site: every hook that runs
 *   core's animator or gesture recognizers for TabBar (the exports below)
 * @position Internal to the lab TabBar (TabBar.tsx)
 *
 * It runs only in the touch presentation. Under a fine pointer a press is a
 * plain button press.
 */

export {useTabBarLens} from './useTabBarLens';
