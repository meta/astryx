// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shared semantic icon names (`IconName`) Core renders: the
 * built-in icon definitions every icon set maps (AST-084 FR3, FR12).
 *
 * SYNC: packages/core/src/Icon/globalIconRegistry.tsx (the `IconName` union).
 * `icon-names.test.mjs` fails when the two lists differ.
 *
 * @position packages/cli/authoring/doctypes/icon-set — data-file vocabulary
 */

/** Every `IconName`, in the order Core declares them. */
export const ICON_NAMES = Object.freeze([
  'close',
  'chevronDown',
  'chevronLeft',
  'chevronRight',
  'chevronsLeft',
  'chevronsRight',
  'check',
  'success',
  'error',
  'warning',
  'info',
  'calendar',
  'clock',
  'externalLink',
  'menu',
  'moreHorizontal',
  'search',
  'upload',
  'arrowUp',
  'arrowDown',
  'arrowsUpDown',
  'funnel',
  'eyeSlash',
  'viewColumns',
  'copy',
  'checkDouble',
  'wrench',
  'stop',
  'microphone',
]);
