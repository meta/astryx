// Copyright (c) Meta Platforms, Inc. and affiliates.

import {black, palette, white} from './neutralPalettes.generated';

/** Neutral's reviewed palette, generated from ../palette.config.json. */
export const neutralPalettes = {
  black,
  white,
  ...palette,
} as const;

export default neutralPalettes;
