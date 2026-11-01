// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file snapBundle.ts
 * @input The public snap-point drag
 * @output Re-exports it as one entry point
 * @position The esbuild entry createDragToSnapPoints.interaction.browser.spec.ts
 *   bundles into its page (global `PublicSnap`)
 */

export {createDragToSnapPoints} from '../createDragToSnapPoints';
