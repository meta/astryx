// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file colors.stylex.ts
 * @input The theme's icon colour roles
 * @output iconColorStyles, one colour style per SVGIconColor
 * @position Shared by SVGIcon and WeightedSVGIcon, so both paint the same
 *   roles for the same `color`
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';

export const iconColorStyles = stylex.create({
  primary: {color: colorVars['--color-icon-primary']},
  secondary: {color: colorVars['--color-icon-secondary']},
  disabled: {color: colorVars['--color-icon-disabled']},
  accent: {color: colorVars['--color-accent']},
  positive: {color: colorVars['--color-icon-success']},
  negative: {color: colorVars['--color-icon-error']},
  warning: {color: colorVars['--color-icon-warning']},
  inherit: {color: 'inherit'},
});
