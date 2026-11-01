// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle adapter — the single fs + resolution seam the swizzle leaves
 * share.
 *
 * Both leaves need the consumer's @astryxdesign/core package dir and the list
 * of swizzlable components: `list` returns the names directly, `copy` uses them
 * for its "component not found" suggestions. Resolving core + listing lives
 * here once so neither leaf re-walks the filesystem. Throws AstryxError
 * (ERR_CORE_NOT_FOUND) when core can't be located.
 */

import {findProjectCoreDir, listComponents} from '../../foundation/fs/paths.mjs';
import {resolveComponentReplacements} from '../../foundation/discovery/component-replacement.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {AstryxError} from '../error.mjs';

/** The package that owns Core's components, hooks, and codemods. */
export {CORE_PROVIDER_ID as CORE_PACKAGE} from '../../foundation/identity/providers.mjs';

/**
 * The integration component that replaces the Core component `name`
 * (spec:AST-035 FR11), or undefined when none does.
 * @param {string} coreDir
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @param {string} name
 * @returns {Promise<import('../../foundation/discovery/component-replacement.mjs').ActiveComponentReplacement | undefined>}
 */
export async function resolveComponentReplacement(
  coreDir,
  loadedIntegrations,
  name,
) {
  if (loadedIntegrations.length === 0) return undefined;
  return (
    await resolveComponentReplacements(coreDir, loadedIntegrations)
  ).forTarget(name);
}

/**
 * Locate @astryxdesign/core for `cwd` and list its swizzlable components.
 * @param {string} cwd
 * @returns {{coreDir: string, components: string[]}}
 */
export function resolveCore(cwd) {
  const coreDir = findProjectCoreDir(cwd);
  if (!coreDir) {
    throw new AstryxError(
      'Could not find @astryxdesign/core package. Make sure you are inside the design system monorepo or have @astryxdesign/core installed.',
      [],
      ERROR_CODES.ERR_CORE_NOT_FOUND,
    );
  }

  const components = listComponents(coreDir);
  return {coreDir, components};
}
