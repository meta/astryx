// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the template command.
 *
 * This module is BOTH the template dispatcher and the stable import surface for
 * the template family. `template()` discovers the available templates, resolves
 * the requested one, and routes to a leaf (list/show/skeleton/copy/cdn). The shared
 * discovery/IO + cross-command helpers live in `foundation/discovery/template-adapter.mjs` and are
 * RE-EXPORTED here so external import paths (`api/template/template.mjs`) —
 * used by component, layout, search, init, discover, Doctor integration, and
 * lib/project — keep resolving unchanged.
 *
 * @position api/template — the template dispatcher + barrel; leaves live under
 *   ./list, ./show, ./skeleton, ./copy, ./cdn and shared discovery in foundation/discovery.
 */

import {
  discoverAll,
  discoverAllResolved,
  discoverAllUnresolved,
  pkgOf,
  templateLookupIds,
} from '../../foundation/discovery/template-adapter.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {orderByAffinity} from '../../foundation/text/suggest-order.mjs';
import {templateList} from './list/list.mjs';
import {templateShow} from './show/show.mjs';
import {templateSkeleton} from './skeleton/skeleton.mjs';
import {templateCopy} from './copy/copy.mjs';
import {templateCdn} from './cdn/cdn.mjs';
import {loadTemplateIconSets} from './_adapter.mjs';

// Re-export the shared discovery/IO + cross-command helpers so this module
// stays the single import surface for the template family (same exports as
// before the leaf split). `discoverAll` is exposed both under its own name and
// the historical `discoverTemplates` alias.
export {
  discoverAll,
  discoverAll as discoverTemplates,
  discoverAllWithErrors,
  discoverCoreTemplates,
  discoverIntegrationTemplatesForOne,
  stripTemplateAssetRefs,
  replaceDemoMedia,
  listTemplates,
  findRelatedBlocks,
  findShowcase,
  extractComponents,
  pkgOf,
} from '../../foundation/discovery/template-adapter.mjs';

/**
 * @typedef {import('../../foundation/discovery/template-adapter.mjs').DiscoveredTemplate} DiscoveredTemplate
 */
/**
 * @typedef {import('../../foundation/discovery/template-adapter.mjs').TemplateDiscoveryError} TemplateDiscoveryError
 */
/**
 * @typedef {import('../../foundation/discovery/template-adapter.mjs').TemplateDocModule} TemplateDocModule
 */

/**
 * @param {string} [name]
 * @param {object} [options]
 * @param {string} [options.targetPath]
 * @param {boolean} [options.overwrite]
 * @param {boolean} [options.list]
 * @param {boolean} [options.skeleton]
 * @param {boolean | string} [options.cdn] - Write the no-build-step CDN starter page; a string is used as the destination path.
 * @param {boolean} [options.show]
 * @param {'page'|'block'} [options.type] - Filter list views / narrow lookups by template kind.
 * @param {string} [options.package] - Narrow lookups to a specific package (id-only matches across packages are ambiguous).
 * @param {string} [options.cwd]
 * @returns {Promise<{type: string, data: unknown}>}
 */
export async function template(name, options = {}) {
  const {
    list = false,
    skeleton = false,
    show = false,
    cdn = false,
    targetPath,
    overwrite = false,
    type,
    package: packageFilter,
    cwd = process.cwd(),
  } = options;

  if (cdn) {
    const ignored = [
      name ? '<name>' : null,
      list ? '--list' : null,
      skeleton ? '--skeleton' : null,
      type ? '--type' : null,
      packageFilter ? '--package' : null,
    ].filter(Boolean);
    if (ignored.length > 0) {
      throw new AstryxError(
        `\`--cdn\` cannot be combined with ${ignored.join(', ')}: the CDN starter does not use templates.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  }
  if (list) {
    const ignored = [
      name ? '<name>' : null,
      targetPath ? '<path>' : null,
      skeleton ? '--skeleton' : null,
      overwrite ? '--overwrite' : null,
    ].filter(Boolean);
    if (ignored.length > 0) {
      throw new AstryxError(
        `\`--list\` cannot be combined with ${ignored.join(', ')}: it lists templates and does not scaffold.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  }
  if (skeleton) {
    const ignored = [
      targetPath ? '<path>' : null,
      overwrite ? '--overwrite' : null,
    ].filter(Boolean);
    if (ignored.length > 0) {
      throw new AstryxError(
        `\`--skeleton\` cannot be combined with ${ignored.join(', ')}: it prints the skeleton and does not write files.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  }

  // The CDN starter ships as an asset rather than as a discovered template, so
  // it answers before discovery — nothing here needs a name resolved.
  if (cdn) {
    return templateCdn({
      targetPath: typeof cdn === 'string' ? cdn : targetPath,
      overwrite,
      cwd,
    });
  }

  const templates =
    packageFilter === '@astryxdesign/core'
      ? await discoverAllUnresolved(cwd)
      : packageFilter
        ? await discoverAllResolved(cwd)
        : await discoverAll(cwd);

  if (list || (!name && !skeleton)) {
    return templateList(templates, {type, package: packageFilter});
  }

  // Resolve `name` to a single template. Without an explicit package, an active
  // integration replacement owns the Core id it names. Package-qualified lookup
  // stays exact, which keeps the original addressable as
  // `--package @astryxdesign/core`.
  let pool = templates;
  if (type) pool = pool.filter(t => t.type === type);
  if (packageFilter) pool = pool.filter(t => pkgOf(t) === packageFilter);
  // With no name there is nothing to replace; `--skeleton` alone must still
  // fail as an unknown template.
  const replacements =
    packageFilter || name == null ? [] : pool.filter(t => t.replaces === name);
  let candidates = packageFilter
    ? pool.filter(t => t.dirName === (name ?? ''))
    : replacements.length > 0
      ? replacements
      : pool.filter(t => templateLookupIds(t).includes(name ?? ''));

  // A rejected same-id declaration must not displace Core for the bare command,
  // but a different-kind integration template remains reachable with --type.
  if (!packageFilter && !type && candidates.length > 1) {
    const core = candidates.filter(t => pkgOf(t) === '@astryxdesign/core');
    const rejected = candidates.filter(t => pkgOf(t) !== '@astryxdesign/core');
    if (
      core.length === 1 &&
      rejected.length === candidates.length - 1 &&
      rejected.every(
        t => t.replacementRejected && t.replacementTarget === (name ?? ''),
      )
    ) {
      candidates = core;
    }
  }

  if (name && candidates.length === 0) {
    throw new AstryxError(
      `Unknown template "${name}"`,
      orderByAffinity(name, templates, t => [t.dirName, t.name], {
        closest: true,
      }).map(t => ({
        name: t.dirName,
        reason: `${t.type} template`,
      })),
      ERROR_CODES.ERR_UNKNOWN_TEMPLATE,
    );
  }
  if (name && candidates.length > 1) {
    throw new AstryxError(
      `Template "${name}" is ambiguous — narrow it with --type and/or --package.`,
      candidates.map(t => ({
        name: t.dirName,
        reason: `${t.type} template in ${pkgOf(t)}`,
      })),
      ERROR_CODES.ERR_AMBIGUOUS_TEMPLATE,
    );
  }
  const match = candidates[0];

  if (skeleton) {
    return templateSkeleton(match, templates);
  }

  // The project's icon set decides how the template's icons are written
  // (AST-084 FR9): both the printed source and the copied file follow it.
  const iconSets = await loadTemplateIconSets(cwd);
  if (show || !targetPath) {
    return templateShow(match, {iconSets});
  }

  return templateCopy(match, {targetPath, cwd, overwrite, iconSets});
}
