// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file discover.list leaf — the integrations the project has, and, when it has
 * discover sources, the ones it could add.
 *
 * @position api/discover/list — pure projection of the packages and catalog
 *   resolved by ../_adapter into the discover.list envelope.
 */

import {toEntry} from '../_adapter.mjs';
import {hasKind} from '../_catalog-view.mjs';

/**
 * Build the discover.list response. `data` lists installed integrations and
 * the official packages the project declares. A `data` with no integration
 * carries `meta.configured`, so callers can distinguish "nothing configured"
 * from "configured but nothing discovered". With discover sources,
 * `meta.available` lists what the project could add and `meta.sources` reports
 * what each source did.
 *
 * @param {Array<import('../_adapter.mjs').InstalledPackage & {latest?: string}>} packages
 * @param {{
 *   configured: boolean,
 *   available?: Array<Record<string, unknown>>,
 *   sources?: import('../_adapter.mjs').SourceState[],
 *   type?: import('../../../authoring/discover/type').DiscoverKind,
 *   only?: 'installed' | 'available',
 * }} options
 * @returns {import('../discover.type.mjs').DiscoverListResponse}
 */
export function list(packages, {configured, available, sources, type, only}) {
  const keep = (/** @type {Record<string, unknown>} */ entry) =>
    type == null || hasKind(entry, type);
  const shown =
    only === 'available'
      ? []
      : packages.filter(pkg =>
          keep(/** @type {Record<string, unknown>} */ (toEntry(pkg))),
        );
  const data = shown.map(toEntry);

  /** @type {Record<string, unknown>} */
  const meta = {};
  // An official package the project declares is not an integration, so it
  // never hides whether any integration is configured.
  if (
    !shown.some(
      pkg => !(/** @type {{declaredOfficial?: true}} */ (pkg).declaredOfficial),
    )
  )
    meta.configured = configured;
  if (sources !== undefined) {
    meta.available = only === 'installed' ? [] : (available ?? []).filter(keep);
    meta.sources = sources;
  }
  return Object.keys(meta).length > 0
    ? {
        type: 'discover.list',
        data,
        meta: /** @type {import('../discover.type.mjs').DiscoverListMeta} */ (
          meta
        ),
      }
    : {type: 'discover.list', data};
}
