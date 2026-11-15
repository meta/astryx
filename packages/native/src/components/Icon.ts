// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Icon.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Icon contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Icon documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const icon: NativeAdditions = {
  name: 'Icon',
  baseTarget: 'root',
  // A shared icon name (AST-082 FR17); an SVG component stays web-only.
  slots: {icon: 'icon'},
  // The semantic colors every platform draws; the palette colors stay on the
  // web.
  projections: {
    color: {
      primary: 'primary',
      secondary: 'secondary',
      tertiary: 'tertiary',
      disabled: 'disabled',
      accent: 'accent',
      info: 'info',
      success: 'success',
      error: 'error',
      warning: 'warning',
      inherit: 'inherit',
    },
  },
};
