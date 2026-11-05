// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file discover.detail leaf — one package: what it adds, and, when a discover
 * source knows it, every version and the latest one.
 *
 * @position api/discover/detail — pure projection over the packages and catalog
 *   entry resolved by ../_adapter; throws AstryxError (ERR_UNKNOWN_PACKAGE) for
 *   a package neither the project nor any source knows.
 */

import {toEntry} from '../_adapter.mjs';
import {catalogEntry, defaultVersion} from '../_catalog-view.mjs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';

/**
 * Build the discover.detail response for one package. The project's installed
 * copy describes itself; any other version is described by its source. For a
 * package the project does not have, `install` is the package-manager command
 * that adds it — printed, never run.
 *
 * @param {import('../_adapter.mjs').InstalledPackage[]} packages
 * @param {string} name package name, e.g. `@scope/name`
 * @param {{
 *   catalog?: import('../_catalog-view.mjs').CatalogPackage,
 *   version?: string,
 *   add?: (name: string, version?: string) => string,
 *   installedAs?: string,
 * }} [options]
 * @returns {import('../discover.type.mjs').DiscoverDetailResponse}
 */
export function detail(packages, name, options = {}) {
  const {catalog, version, add, installedAs} = options;
  const pkg = packages.find(p => p.name === name);
  if (!pkg && !catalog) {
    throw new AstryxError(
      `Package "${name}" not found`,
      packages.map(p => ({name: p.name, reason: 'available package'})),
      ERROR_CODES.ERR_UNKNOWN_PACKAGE,
    );
  }

  const known = new Set([
    ...(catalog?.versions.map(v => v.version) ?? []),
    ...(pkg?.version ? [pkg.version] : []),
  ]);
  if (version && !known.has(version)) {
    const releases = catalog?.versions.filter(v => !v.prerelease) ?? [];
    throw new AstryxError(
      `Version "${version}" of ${name} not found`,
      (releases.length > 0 ? releases.map(v => v.version) : [...known])
        .slice(0, 5)
        .map(v => ({name: `${name}@${v}`, reason: 'published version'})),
      ERROR_CODES.ERR_NOT_FOUND,
    );
  }

  const local = pkg != null && (!version || version === pkg.version);
  /** @type {Record<string, unknown>} */
  const data = local
    ? {...toEntry(pkg), installed: true}
    : {
        ...catalogEntry(
          /** @type {NonNullable<typeof catalog>} */ (catalog),
          version ?? defaultVersion(/** @type {NonNullable<typeof catalog>} */ (catalog)),
        ),
        installed: pkg != null,
        ...(pkg?.version ? {installedVersion: pkg.version} : {}),
      };
  if (catalog) {
    if (catalog.latest) data.latest = catalog.latest;
    if (catalog.aliases.length > 0) data.aliases = catalog.aliases;
    data.source = catalog.source;
  }
  if (!pkg) {
    if (installedAs) data.installedAs = installedAs;
    else if (add) data.install = add(name, version);
  }
  if (catalog) data.versions = catalog.versions;
  return {
    type: 'discover.detail',
    package: String(data.name),
    data: /** @type {import('../discover.type.mjs').DiscoverDetailResponse['data']} */ (
      data
    ),
  };
}
