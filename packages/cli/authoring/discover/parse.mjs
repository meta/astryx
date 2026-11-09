// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Runtime checks for discover sources and the catalogs they return.
 *
 * The catalog schema is deliberately not strict: a source may add fields this
 * CLI does not know, and they are dropped. An unknown `schemaVersion` is
 * refused, and an item of a kind this CLI does not know is skipped, so a newer
 * source never breaks an older CLI.
 *
 * @position packages/cli/authoring/discover — parse + validate, no I/O.
 */

import {z} from 'zod';

/** Item kinds a catalog may list, in display order. */
export const DISCOVER_KINDS = /** @type {const} */ ([
  'component',
  'template',
  'doc',
  'theme',
  'codemod',
  'agent-doc',
  'icon-set',
]);

const text = (/** @type {number} */ max) => z.string().min(1).max(max);

const contributionSchema = z.object({
  kind: text(32),
  name: text(512),
  title: z.string().max(512).optional(),
  summary: z.string().max(4096).optional(),
  keywords: z.array(z.string().max(128)).max(64).optional(),
  iconCount: z.number().int().min(0).optional(),
  definitions: z.array(z.string().max(128)).max(2048).optional(),
});

const versionSchema = z.object({
  version: text(256),
  publishedAt: z.string().max(64).nullable(),
  prerelease: z.boolean(),
  status: text(64),
});

const packageSchema = z.object({
  package: text(214),
  integration: text(214),
  aliases: z.array(text(214)).max(64),
  description: z.string().max(1024).optional(),
  latest: text(256).nullable(),
  versions: z.array(versionSchema).max(50_000),
  contributions: z.array(contributionSchema).max(50_000),
});

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    name: text(256),
    generatedAt: text(64),
    complete: z.boolean(),
  }),
  packages: z.array(packageSchema).max(20_000),
});

/**
 * Newest first by publish time. A version with no known publish time goes
 * last, and ties fall back to the version number.
 * @param {{version: string, publishedAt: string | null}} a
 * @param {{version: string, publishedAt: string | null}} b
 */
function newestFirst(a, b) {
  const at = Date.parse(a.publishedAt ?? '');
  const bt = Date.parse(b.publishedAt ?? '');
  if (Number.isNaN(at) !== Number.isNaN(bt)) return Number.isNaN(at) ? 1 : -1;
  if (!Number.isNaN(at) && at !== bt) return bt - at;
  return b.version.localeCompare(a.version, 'en', {numeric: true});
}

/** Item fields read only for the experimental `icon-set` kind. */
const ICON_SET_FIELDS = /** @type {const} */ (['iconCount', 'definitions']);

/**
 * The catalog with every icon-set-only field taken off its items, so a project
 * that has not opted into icon sets checks a catalog exactly as a CLI without
 * them does: those fields are unknown, so dropped unread. Anything not shaped
 * like a catalog is returned as is, for the schema to report.
 * @param {unknown} value
 * @returns {unknown}
 */
function withoutIconSetFields(value) {
  if (value == null || typeof value !== 'object') return value;
  const catalog = /** @type {{packages?: unknown}} */ (value);
  if (!Array.isArray(catalog.packages)) return value;
  return {
    ...catalog,
    packages: catalog.packages.map(pkg => {
      if (pkg == null || typeof pkg !== 'object') return pkg;
      const {contributions} = /** @type {{contributions?: unknown}} */ (pkg);
      if (!Array.isArray(contributions)) return pkg;
      return {
        ...pkg,
        contributions: contributions.map(item => {
          if (item == null || typeof item !== 'object') return item;
          const copy = {...item};
          for (const field of ICON_SET_FIELDS) delete copy[field];
          return copy;
        }),
      };
    }),
  };
}

/**
 * Check a catalog a discover source returned. Throws an Error naming the first
 * problem. Items of a kind this CLI does not read are dropped, and versions are
 * put newest first whatever order the source used.
 *
 * The experimental `icon-set` kind and its item fields (`iconCount`,
 * `definitions`) are read only with `iconSets` (spec:AST-084). Without it they
 * are unknown: the fields are taken off before the check and the items are
 * dropped after it, exactly as for any kind or field this CLI does not know
 * (spec:AST-051 FR7).
 *
 * @param {unknown} value
 * @param {string} [label]
 * @param {{iconSets?: boolean}} [options] `iconSets`: the project opts into
 *   icon sets (`experimental.iconSet`)
 * @returns {import('./type.js').DiscoverCatalog}
 */
export function parseDiscoverCatalog(
  value,
  label = 'discover source',
  {iconSets = false} = {},
) {
  const version =
    value != null && typeof value === 'object'
      ? /** @type {{schemaVersion?: unknown}} */ (value).schemaVersion
      : undefined;
  if (version !== undefined && version !== 1) {
    throw new Error(
      `${label} returned schemaVersion ${String(version)}; this CLI reads schemaVersion 1`,
    );
  }
  const parsed = catalogSchema.safeParse(
    iconSets ? value : withoutIconSetFields(value),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
    throw new Error(
      `${label} returned an invalid catalog${where}: ${issue?.message}`,
    );
  }
  const known = /** @type {readonly string[]} */ (DISCOVER_KINDS).filter(
    kind => iconSets || kind !== 'icon-set',
  );
  return /** @type {import('./type.js').DiscoverCatalog} */ ({
    ...parsed.data,
    packages: parsed.data.packages.map(pkg => ({
      ...pkg,
      versions: [...pkg.versions].sort(newestFirst),
      contributions: pkg.contributions.filter(c => known.includes(c.kind)),
    })),
  });
}

/**
 * Check a discover source itself: an async function, like `debug`, that takes
 * `{signal, package?, version?}` and resolves to a catalog.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {import('./type.js').DiscoverSource}
 */
export function parseDiscoverSource(value, label) {
  if (typeof value !== 'function') {
    throw new Error(`${label} must be a function`);
  }
  return /** @type {import('./type.js').DiscoverSource} */ (value);
}
