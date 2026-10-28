// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayoutBundle.ts
 * @input The animated-layout module the browser proofs drive
 * @output Re-exports it as one entry point
 * @position The esbuild entry `animatedLayout.interaction.browser.spec.ts`
 *   bundles into its page (global `AnimatedLayout`)
 */

export {
  createAnimatedLayout,
  holdLayoutExit,
  playLayoutChange,
  releaseLayoutExit,
  reportLayoutChange,
} from '../animatedLayout';
