// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paddingStyles.stylex.ts
 * @input Uses @stylexjs/stylex, spacing from theme
 * @output paddingStyles: uniform padding on all four sides by SpacingStep
 * @position Layout utility, re-exported by padding.stylex.ts. Its own module so an
 *   overlay's eager code (usePopover) imports it without padding.stylex.ts:
 *   a lazily loaded overlay that uses the container padding styles there then
 *   keeps them out of the eager chunk it shares with this module.
 */

import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';

/**
 * Padding styles for all sides using spacing tokens.
 * Each key applies uniform padding to all four sides.
 */
export const paddingStyles = stylex.create({
  0: {
    paddingInlineStart: spacingVars['--spacing-0'],
    paddingInlineEnd: spacingVars['--spacing-0'],
    paddingBlockStart: spacingVars['--spacing-0'],
    paddingBlockEnd: spacingVars['--spacing-0'],
  },
  0.5: {
    paddingInlineStart: spacingVars['--spacing-0-5'],
    paddingInlineEnd: spacingVars['--spacing-0-5'],
    paddingBlockStart: spacingVars['--spacing-0-5'],
    paddingBlockEnd: spacingVars['--spacing-0-5'],
  },
  1: {
    paddingInlineStart: spacingVars['--spacing-1'],
    paddingInlineEnd: spacingVars['--spacing-1'],
    paddingBlockStart: spacingVars['--spacing-1'],
    paddingBlockEnd: spacingVars['--spacing-1'],
  },
  1.5: {
    paddingInlineStart: spacingVars['--spacing-1-5'],
    paddingInlineEnd: spacingVars['--spacing-1-5'],
    paddingBlockStart: spacingVars['--spacing-1-5'],
    paddingBlockEnd: spacingVars['--spacing-1-5'],
  },
  2: {
    paddingInlineStart: spacingVars['--spacing-2'],
    paddingInlineEnd: spacingVars['--spacing-2'],
    paddingBlockStart: spacingVars['--spacing-2'],
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  3: {
    paddingInlineStart: spacingVars['--spacing-3'],
    paddingInlineEnd: spacingVars['--spacing-3'],
    paddingBlockStart: spacingVars['--spacing-3'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },
  4: {
    paddingInlineStart: spacingVars['--spacing-4'],
    paddingInlineEnd: spacingVars['--spacing-4'],
    paddingBlockStart: spacingVars['--spacing-4'],
    paddingBlockEnd: spacingVars['--spacing-4'],
  },
  5: {
    paddingInlineStart: spacingVars['--spacing-5'],
    paddingInlineEnd: spacingVars['--spacing-5'],
    paddingBlockStart: spacingVars['--spacing-5'],
    paddingBlockEnd: spacingVars['--spacing-5'],
  },
  6: {
    paddingInlineStart: spacingVars['--spacing-6'],
    paddingInlineEnd: spacingVars['--spacing-6'],
    paddingBlockStart: spacingVars['--spacing-6'],
    paddingBlockEnd: spacingVars['--spacing-6'],
  },
  8: {
    paddingInlineStart: spacingVars['--spacing-8'],
    paddingInlineEnd: spacingVars['--spacing-8'],
    paddingBlockStart: spacingVars['--spacing-8'],
    paddingBlockEnd: spacingVars['--spacing-8'],
  },
  10: {
    paddingInlineStart: spacingVars['--spacing-10'],
    paddingInlineEnd: spacingVars['--spacing-10'],
    paddingBlockStart: spacingVars['--spacing-10'],
    paddingBlockEnd: spacingVars['--spacing-10'],
  },
});
