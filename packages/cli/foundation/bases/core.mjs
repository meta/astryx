// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core's base declaration, which the CLI holds.
 * @input the step list
 * @output CORE_BASE_NAME and coreBase()
 * @position foundation/bases — Core is declared the same way as any other
 *   base; the CLI's own code performs Core's steps, so Core needs no
 *   integration manifest.
 */

import {CORE_PROVIDER_ID} from '../identity/providers.mjs';
import {BASE_STEPS} from './steps.mjs';

/** Core's package name. */
export const CORE_BASE_NAME = /** @type {string} */ (CORE_PROVIDER_ID);

/**
 * Core as a resolved base. Its version is read only when a caller asks for
 * it, so a run that never names its base reads no Core files for it.
 * @returns {import('./resolve.mjs').ActiveBase}
 */
export function coreBase() {
  return {
    name: CORE_BASE_NAME,
    core: true,
    dir: null,
    version: null,
    adapters: {},
    steps: BASE_STEPS,
  };
}
