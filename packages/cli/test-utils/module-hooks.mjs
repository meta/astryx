// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether this Node runs module hooks in the loading thread.
 *
 * @input `node:module`.
 * @output `hasModuleHooks`, for tests of a theme module load.
 * @position Node runs these hooks from 22.15. A theme module that imports a
 *   stylesheet or an asset loads only with them; on an older Node the CLI
 *   supports (its oldest is 22.13), that load fails with Node's own
 *   "Unknown file extension" error, and nothing is written.
 */

import nodeModule from 'node:module';

export const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';
