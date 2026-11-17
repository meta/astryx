// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file circleCheck.stylex.ts
 * @input The theme's duration and easing tokens
 * @output Exports `circleCheckConsts`, the build-time mirror of
 *   circleCheck.table.ts, and the circle's motion and size styles
 * @position Internal to CircleCheckIndicator
 *
 * StyleX cannot read the table at build time, so these constants mirror it,
 * and circleCheck.test.tsx fails if they drift. StyleX inlines a
 * `defineConsts` value only in its own file, so the styles live here too.
 *
 * SYNC: When modified, update circleCheck.test.tsx.
 */

import * as stylex from '@stylexjs/stylex';
import {durationVars, easeVars} from '@astryxdesign/core/theme/tokens.stylex';

/**
 * `md` is UIKit's circle at the Large text size, and `sm` at xSmall. Two `sm`
 * values derive from their Large proportions: the check stroke and its offset.
 * The partial state's bar has no UIKit counterpart, so it takes the
 * checkmark's width and stroke.
 */
export const circleCheckConsts = stylex.defineConsts({
  /** `circleCheckTable.large.diameter`. */
  mdDiameter: '21.8px',
  /** `circleCheckTable.large.stroke`. */
  mdStroke: '1.54px',
  /** `circleCheckTable.large.checkSize`. */
  mdCheckSize: '9px',
  /** `circleCheckTable.large.checkStroke`. */
  mdCheckStroke: '1.35px',
  /** `circleCheckTable.large.checkOffsetY`. */
  mdCheckOffsetY: '1px',
  /** `circleCheckTable.xSmall.diameter`. */
  smDiameter: '18px',
  /** `circleCheckTable.xSmall.stroke`. */
  smStroke: '1.27px',
  /** `circleCheckTable.xSmall.checkSize`. */
  smCheckSize: '8px',
  /** Derived: the Large check stroke, scaled by the check size (9 → 8). */
  smCheckStroke: '1.2px',
  /** Derived: the Large offset, scaled by the diameter (21.8 → 18). */
  smCheckOffsetY: '0.83px',
});

export const circleCheckMotionStyles = stylex.create({
  mark: {
    transitionProperty: 'background-color, box-shadow',
    // Core's indicators time their marks the same way.
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
});

export const circleCheckSizeStyles = stylex.create({
  // The ring is an inset shadow, not a border. Engines snap a border to whole
  // device pixels: 1.54 px becomes 1.33 px at 3×. A shadow keeps its exact
  // width, antialiased like UIKit's symbol.
  mdCircle: {
    width: circleCheckConsts.mdDiameter,
    height: circleCheckConsts.mdDiameter,
    '--_circle-stroke': circleCheckConsts.mdStroke,
  },
  smCircle: {
    width: circleCheckConsts.smDiameter,
    height: circleCheckConsts.smDiameter,
    '--_circle-stroke': circleCheckConsts.smStroke,
  },
  mdCheck: {
    width: circleCheckConsts.mdCheckSize,
    height: circleCheckConsts.mdCheckSize,
    translate: `0 ${circleCheckConsts.mdCheckOffsetY}`,
  },
  smCheck: {
    width: circleCheckConsts.smCheckSize,
    height: circleCheckConsts.smCheckSize,
    translate: `0 ${circleCheckConsts.smCheckOffsetY}`,
  },
  mdBar: {
    width: circleCheckConsts.mdCheckSize,
    height: circleCheckConsts.mdCheckStroke,
  },
  smBar: {
    width: circleCheckConsts.smCheckSize,
    height: circleCheckConsts.smCheckStroke,
  },
});
