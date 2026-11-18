// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether this Node runs module hooks in the loading thread.
 *
 * @input `node:module`.
 * @output `hasModuleHooks`, for tests of a theme module load.
 * @position Node runs these hooks from 22.15 and 23.5. Theme build and the
 *   theme editor load a theme module that imports a stylesheet or an asset
 *   only with them, and so does a recorded theme that imports an asset, or a
 *   stylesheet that a module in another folder imports by a relative path. On
 *   an older Node the CLI supports (its oldest is 22.13), those loads are
 *   refused, naming the file and the Node that loads it, and nothing is
 *   written. A recorded theme's other stylesheets load without them. The
 *   CLI's kept search catalog needs them too.
 */

import nodeModule from 'node:module';

export const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';
