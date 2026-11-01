// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file registry.mjs
 * @input A package name and version, an npm registry URL, and a fetch
 * @output `fetchVersionDocument`: the registry's response for one exact
 *   version's document
 * @position The one way the release scripts read a version from npm:
 *   publish-package.mjs asks whether a version exists before and after each
 *   publish, and verify-published.mjs confirms a release propagated. Keeping
 *   the URL and fetch options here stops the two from drifting apart.
 */

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/** A registry path for a package name, scoped names included. */
export function packageKey(name) {
  return encodeURIComponent(name);
}

/** `pathname` resolved against the registry root. */
export function registryUrl(registry, pathname) {
  return new URL(pathname, `${registry.replace(/\/+$/u, '')}/`).href;
}

/** Fetches the document for exactly `name@version`, never from a cache. */
export function fetchVersionDocument({
  name,
  version,
  registry = DEFAULT_REGISTRY,
  fetchImpl = fetch,
}) {
  return fetchImpl(
    registryUrl(registry, `${packageKey(name)}/${encodeURIComponent(version)}`),
    {
      cache: 'no-store',
      headers: {accept: 'application/json'},
      signal: AbortSignal.timeout(30_000),
    },
  );
}
