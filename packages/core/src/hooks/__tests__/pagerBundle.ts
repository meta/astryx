// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pagerBundle.ts
 * @input The pager and the paging math
 * @output The surface the pager's browser proofs bundle onto their fixture
 *   page (esbuild, IIFE global `Pager`)
 * @position Test-only entry of usePager.interaction.browser.spec.ts
 */

export {createPager, pageForRelease} from '../usePager';
export {
  pagingSettleVelocity,
  solveAnimatedPageScroll,
  solvePaging,
} from '../../motion/paging';
export {rubberBand} from '../../motion/rubberBand';
export {paging} from '../../motion/uikit/paging';
export {VelocityTracker} from '../../gestures/VelocityTracker';
