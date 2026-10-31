// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motionBundle.ts
 * @input The motion modules the browser proofs drive
 * @output Re-exports them as one entry point
 * @position The esbuild entry the compositor proofs bundle into their page
 *   (global `Motion`), and the type of that global
 */

export {createAnimator} from '../animator';
export {solveSpring, toSpring} from '../spring';
export {registerSpringsTable, springs} from '../uikit/springs';
export {motionRoleOf} from '../roles';
