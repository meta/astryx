// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `integrationExampleScope()`: the scope Doctor reads a package's
 *   component examples against, as JSON a catalog can store.
 * @input A package: the local one rooted at `cwd`, or one installed beside
 *   it by name.
 * @output An `integration.example-scope` envelope: the package's identity and
 *   its ExampleScope, or why there is none.
 * @position api/integration; the same `exampleScopeFor` runs inside
 *   `validateIntegration`, so a preview tool that reads examples with this
 *   scope and `previewableExample` judges each one as Doctor does.
 */

import {findPackageRoot} from '../../foundation/fs/paths.mjs';
import {
  loadLocalIntegration,
  resolveInstalledIntegrationDir,
} from '../../foundation/integrations/integrations.mjs';
import {exampleScopeFor} from '../../foundation/integrations/example-code.mjs';
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
  /** @type {string | null} */
  let packageDir;
  if (pkg) {
    try {
      packageDir = resolveInstalledIntegrationDir(pkg, cwd);
    } catch (err) {
      throw new AstryxError(
        /** @type {Error} */ (err).message,
        [],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  } else {
    packageDir = findPackageRoot(cwd);
  }
  /** @type {any} */
  let integration = null;
  /** @type {string | undefined} */
  let reason;
  if (packageDir) {
    try {
      integration = await loadLocalIntegration(packageDir);
    } catch (err) {
      reason = /** @type {Error} */ (err).message;
    }
  }
  if (integration?.__loadError) reason = integration.__loadError;
  if (!integration || reason) {
    return {
      type: TYPE,
      data: {
        found: false,
        name: integration?.name ?? null,
        version: integration?.version ?? null,
        scope: null,
        reason:
          reason ??
          (packageDir
            ? `No astryx.integration.{ts,mjs,js} next to the package.json in ${packageDir}.`
            : 'No package.json found.'),
      },
    };
  }
  const read = await exampleScopeFor(integration);
  return {
    type: TYPE,
    data: {
      found: true,
      name: integration.name ?? null,
      version: integration.version ?? null,
      scope: read.scope,
      ...(read.reason ? {reason: read.reason} : {}),
      ...(read.incomplete ? {incomplete: read.incomplete} : {}),
    },
  };
}
