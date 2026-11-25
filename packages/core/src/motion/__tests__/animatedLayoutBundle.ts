// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayoutBundle.ts
 * @input The animated-layout module the browser proofs drive, and the
 *   hit-test registry its glides report to
 * @output Re-exports them as one entry point
 * @position The esbuild entry `animatedLayout.interaction.browser.spec.ts`
 *   bundles into its page (global `AnimatedLayout`)
 */

export {
  applyLayoutChangeTransition,
  createAnimatedLayout,
  holdLayoutEdge,
  holdLayoutExit,
  holdLayoutSwap,
  layoutStartFor,
  layoutStartReaderFor,
  playLayoutChange,
  playLayoutEdge,
  playLayoutSwap,
  releaseLayoutExit,
  reportLayoutChange,
  reportLayoutEdge,
} from '../animatedLayout';
export {presentedOffsetOf} from '../presentation';
