// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokenDefaults.ts
 * @input The default values of each token group
 * @output `tokenDefaults`: every Astryx token's default value, in one flat map
 * @position Pure theme data; `defineTheme`, the token resolvers and
 *   `@astryxdesign/core/palette` read it without the theme runtime
 */

import {domainTokenDefaults} from './domainTokens/domainTokenDefaults';
import {
  colorDefaults,
  spacingDefaults,
  sizeDefaults,
  borderDefaults,
  focusDefaults,
  radiusDefaults,
  shadowDefaults,
  durationDefaults,
  easeDefaults,
  typographyDefaults,
  textSizeDefaults,
  fontWeightDefaults,
  typeScaleDefaults,
} from './tokens.stylex';

/** All Astryx token defaults as a flat map. Useful for resolving full token sets. */
export const tokenDefaults: Record<string, string> = {
  ...colorDefaults,
  ...spacingDefaults,
  ...sizeDefaults,
  ...borderDefaults,
  ...focusDefaults,
  ...radiusDefaults,
  ...shadowDefaults,
  ...durationDefaults,
  ...easeDefaults,
  ...typographyDefaults,
  ...textSizeDefaults,
  ...fontWeightDefaults,
  ...typeScaleDefaults,
  ...domainTokenDefaults,
};
