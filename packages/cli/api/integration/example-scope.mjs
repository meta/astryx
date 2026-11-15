// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `integrationExampleScope()`: the scope Doctor reads a package's
 *   component examples against, as JSON a catalog can store.
 * @input A package: the local one rooted at `cwd`, or one installed beside
 *   it by name.
 * @output An `integration.example-scope` envelope: the package's identity and
 *   its ExampleScope, or why there is none.
 * @position api/integration; the subject's adapter builds the scope with
 *   the `exampleScopeFor` that `validateIntegration` runs, so a preview tool
 *   that reads examples with it and `previewableExample` judges each one as
 *   Doctor does.
 */

import {loadExampleScope} from './_adapter.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const TYPE = /** @type {const} */ ('integration.example-scope');

/**
 * The scope a package's component examples are read against: the components
 * it documents with their imports, the components and hooks Core documents,
 * React's exports, the packages it declares, and its server-only modules and
 * async components. `found` is false when no integration manifest loads.
 *
 * @param {string} [pkg] installed package name; omit for the package at cwd
 * @param {import('./example-scope.type.mjs').IntegrationExampleScopeOptions} [options]
 * @returns {Promise<import('./example-scope.type.mjs').IntegrationExampleScopeResponse>}
 */
export async function integrationExampleScope(pkg, options = {}) {
  const {cwd = process.cwd()} = options;
  try {
    return {type: TYPE, data: await loadExampleScope(pkg, cwd)};
  } catch (err) {
    if (!pkg) throw err;
    throw new AstryxError(
      /** @type {Error} */ (err).message,
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
}
