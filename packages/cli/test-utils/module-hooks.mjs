// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether this Node runs module hooks in the loading thread.
 *
 * @input `node:module`.
 * @output `hasModuleHooks`, for tests of a theme module load.
 * @position Node runs these hooks from 22.15 and 23.5. A theme module that
 *   imports a stylesheet or an asset loads only with them; on an older Node
 *   the CLI supports (its oldest is 22.13), that load is refused, naming the
 *   file and the Node that loads it, and nothing is written. The CLI's kept
 *   search catalog needs them too.
 */

import nodeModule from 'node:module';

export const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';
