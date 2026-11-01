// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatorBundle.ts
 * @input The public animator and the math to check it against
 * @output Re-exports them as one entry point
 * @position The esbuild entry createAnimator.interaction.browser.spec.ts
 *   bundles into its page (global `PublicAnimator`), and that global's type
 */

export {createAnimator} from '../createAnimator';
export {solveDecay} from '../../motion/decay';
export {solveSpring, toSpring} from '../../motion/spring';
export {springs} from '../../motion/uikit/springs';
