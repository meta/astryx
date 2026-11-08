// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Pick the published package version used to exercise the CDN starter page.
 *
 * The package registry's `versions` object is not a version-ordered API. Its
 * final key may be a canary, so an unpublished release pin must fall back to
 * the registry's authoritative stable `latest` dist-tag instead.
 *
 * @param {unknown} metadata
 * @param {string} pinned
 * @returns {string | null}
 */
export function resolvePublishedCdnVersion(metadata, pinned) {
  if (metadata == null || typeof metadata !== 'object') return null;

  const versions = metadata.versions;
  if (versions == null || typeof versions !== 'object') return null;
  if (Object.hasOwn(versions, pinned)) return pinned;

  const latest = metadata['dist-tags']?.latest;
  return typeof latest === 'string' && Object.hasOwn(versions, latest)
    ? latest
    : null;
}
