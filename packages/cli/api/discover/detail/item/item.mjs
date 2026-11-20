// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file discover.item leaf — one item a package adds, when it is not an
 * installed component (those keep resolving to their full doc through
 * ../doc).
 *
 * @position api/discover/detail/item — pure projection over the packages and
 *   catalog entry resolved by ../../_adapter.
 */

import {KIND_FIELDS} from '../../_adapter.mjs';
import {defaultVersion, shownEntry} from '../../_catalog-view.mjs';
import {setIconSetCoverage} from '../../_icon-set-coverage.mjs';

/**
 * Find one item of a package: an installed package's own templates, docs,
 * themes, and codemods first, then what a discover source lists for the
 * package. Returns null when neither has it, so the caller can report the
 * component lookup's own error.
 *
 * @param {import('../../_adapter.mjs').InstalledPackage[]} packages
 * @param {string} packageName
 * @param {string} itemName
 * @param {{
 *   catalog?: import('../../_catalog-view.mjs').CatalogPackage,
 *   version?: string,
 *   add?: (name: string, version?: string) => string,
 *   installedAs?: string,
 *   iconSets?: boolean,
 *   coverageOf?: (definitions: string[]) => {mapped: number, total: number},
 * }} [options] `iconSets`: icon features are on in the project, so an installed
 *   package's set answers and a set's `definitions` are shown. `coverageOf`
 *   counts how many of this CLI's icon definitions a set maps
 *   (iconSetCoverageOf).
 * @returns {import('../../discover.type.mjs').DiscoverItemResponse | null}
 */
export function item(packages, packageName, itemName, options = {}) {
  const {catalog, version, add, installedAs, iconSets, coverageOf} = options;
  const pkg = packages.find(p => p.name === packageName);
  if (pkg && (!version || version === pkg.version)) {
    for (const [kind, field] of KIND_FIELDS) {
      if (kind === 'component') continue;
      const names = /** @type {Record<string, unknown>} */ (pkg)[field];
      if (Array.isArray(names) && names.includes(itemName)) {
        const set =
          kind === 'icon-set'
            ? pkg.iconSetDetails?.find(entry => entry.name === itemName)
            : undefined;
        if (set) {
          return {
            type: 'discover.item',
            package: packageName,
            data: {
              package: packageName,
              ...(pkg.version ? {version: pkg.version} : {}),
              kind,
              name: itemName,
              title: set.displayName,
              summary: set.description,
              license: set.license,
              iconCount: set.iconCount,
              ...(set.default ? {default: set.default} : {}),
              definitions: set.definitions,
              command: `astryx experimental icon <words> --set ${packageName}/${itemName}`,
              experimental: true,
              installed: true,
            },
          };
        }
        // A doc that adds sections to another package's topic names them,
        // so a reader can open its own section straight away.
        const sections =
          kind === 'doc' ? pkg.docSections?.[itemName] : undefined;
        return {
          type: 'discover.item',
          package: packageName,
          data: {
            package: packageName,
            ...(pkg.version ? {version: pkg.version} : {}),
            kind,
            name: itemName,
            ...(sections ? {sections} : {}),
            installed: true,
          },
        };
      }
    }
  }

  if (!catalog) return null;
  const items = shownEntry(catalog, {
    installed: pkg != null || !!installedAs,
    iconSets,
  }).contributions;
  const lower = itemName.toLowerCase();
  const found =
    items.find(c => c.name === itemName) ??
    items.find(c => c.name.toLowerCase() === lower);
  if (!found) return null;
  const shown = version ?? defaultVersion(catalog);
  /** @type {import('../../discover.type.mjs').DiscoverItemResponse} */
  const response = {
    type: 'discover.item',
    package: packageName,
    data: {
      package: packageName,
      ...(shown ? {version: shown} : {}),
      kind: found.kind,
      name: found.name,
      ...(found.title ? {title: found.title} : {}),
      ...(found.summary ? {summary: found.summary} : {}),
      ...(found.keywords ? {keywords: found.keywords} : {}),
      ...(found.license ? {license: found.license} : {}),
      ...(found.iconCount != null ? {iconCount: found.iconCount} : {}),
      ...(found.definitions && iconSets
        ? {definitions: found.definitions}
        : {}),
      ...(found.kind === 'icon-set' && pkg != null
        ? {
            command: `astryx experimental icon <words> --set ${packageName}/${found.name}`,
          }
        : {}),
      ...(found.kind === 'icon-set' ? {experimental: true} : {}),
      installed: pkg != null,
      ...(pkg == null && installedAs ? {installedAs} : {}),
      ...(pkg == null && !installedAs && add
        ? {install: add(packageName, version)}
        : {}),
      source: catalog.source,
    },
  };
  if (found.definitions && coverageOf) {
    setIconSetCoverage(response, coverageOf(found.definitions));
  }
  return response;
}
