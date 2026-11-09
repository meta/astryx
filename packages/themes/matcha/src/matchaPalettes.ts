// Copyright (c) Meta Platforms, Inc. and affiliates.

import {black, palette, white} from './matchaPalettes.generated';

/** Matcha's reviewed light and dark palette, generated from ../palette.config.json. */
export const matchaPalettes = {
  black,
  white,
  neutral: palette.neutral,
  red: palette.red,
  orange: palette.orange,
  yellow: palette.yellow,
  green: palette.green,
  teal: palette.teal,
  cyan: palette.cyan,
  blue: palette.blue,
  purple: palette.purple,
  pink: palette.pink,
} as const;

export default matchaPalettes;
