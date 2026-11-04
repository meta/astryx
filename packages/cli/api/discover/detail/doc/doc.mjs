// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file discover.detail.doc leaf — resolve one external component's docs.
 *
 * Two entry points, both producing the discover.detail.doc envelope:
 *   - {@link doc} resolves a `@scope/name/Component` query (package + component
 *     lookup, with ERR_UNKNOWN_PACKAGE / ERR_UNKNOWN_COMPONENT suggestions).
 *   - {@link docFromResult} wraps an already-resolved component (used by the
 *     search leaf when a free-text query narrows to exactly one component).
 *
 * @position api/discover/detail/doc — projection over ../../_adapter's resolver
 *   + doc loader; owns the discover.detail.doc envelope.
 */

import {findComponent, loadValidatedDoc} from '../../_adapter.mjs';
import {linkComponentResponse} from '../../../component/_adapter.mjs';
import {levenshteinDistance} from '../../../../foundation/text/string-utils.mjs';
import {AstryxError} from '../../../error.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';

/**
 * Wrap an already-resolved component in the discover.detail.doc envelope by
 * loading + validating its docs. The single place the envelope is built.
 *
 * @param {import('../../_adapter.mjs').ComponentResolution} result
 * @param {{lang?: string | null, zh?: boolean}} opts
 * @returns {Promise<import('../../discover.type.mjs').DiscoverDetailDocResponse>}
 */
export async function docFromResult(result, opts) {
  const data = await loadValidatedDoc(result, opts);
  // Its `{@link}`s read as the commands that open their docs, as
  // `astryx component` prints them (spec:AST-047 FR9).
  const linked = await linkComponentResponse(
    {type: 'component.detail', package: result.pkg.name, data},
    process.cwd(),
  );
  return {
    type: 'discover.detail.doc',
    package: result.pkg.name,
    data: linked.data,
  };
}

/**
 * Resolve a `@scope/name/Component` query to its validated docs. Throws
 * AstryxError (ERR_UNKNOWN_PACKAGE) when the scope is unknown, or
 * (ERR_UNKNOWN_COMPONENT) — with substring/fuzzy suggestions — when the
 * component is not in the package.
 *
 * @param {import('../../_package-scanner.mjs').ScannedPackage[]} packages
 * @param {string} pkgName
 * @param {string} compName
 * @param {{lang?: string | null, zh?: boolean}} opts
 * @returns {Promise<import('../../discover.type.mjs').DiscoverDetailDocResponse>}
 */
export async function doc(packages, pkgName, compName, {lang, zh}) {
  const pkg = packages.find(p => p.name === pkgName);
  if (!pkg)
    throw new AstryxError(
      `Package "${pkgName}" not found`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_PACKAGE,
    );

  const result = findComponent([pkg], compName);
  if (!result) {
    const lower = compName.toLowerCase();
    const hits = pkg.components.filter(c => c.toLowerCase().includes(lower));
    const suggestions =
      hits.length > 0
        ? hits
        : pkg.components
            .map(c => ({
              name: c,
              distance: levenshteinDistance(lower, c.toLowerCase()),
            }))
            .filter(m => m.distance <= 3)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5)
            .map(m => m.name);
    throw new AstryxError(
      `Component "${compName}" not found in ${pkgName}`,
      suggestions.map(s => ({name: s, reason: 'similar name'})),
      ERROR_CODES.ERR_UNKNOWN_COMPONENT,
    );
  }

  return docFromResult(result, {lang, zh});
}
