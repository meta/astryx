#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * Wait until every stable package is actually readable from npm.
 *
 * A successful `npm publish` process can precede registry propagation. This
 * verifier checks the small version document, the requested dist-tag, and the
 * tarball response for each package before the release workflow reports
 * success. Packages that are already visible are not fetched again while a
 * slower package continues propagating.
 *
 * One run is a bounded window: the wait between checks starts at 15 s and
 * grows to at most 60 s, and no new check starts after 8 minutes. A new
 * version of a package with a very large registry document can take longer
 * than that to become readable, so packages still unreadable at the end exit 2
 * ("not yet readable") rather than 1, and the release workflow continues in a
 * follow-up verification job with a window of its own.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {isStableReleasePackage} from '../release/active-release.mjs';
import {
  DEFAULT_REGISTRY,
  fetchDistTags,
  fetchVersionDocument,
} from './registry.mjs';

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_MAX_INTERVAL_MS = 60_000;
const DEFAULT_WINDOW_MS = 8 * 60_000;
const INTERVAL_GROWTH = 1.5;
export const EXIT_NOT_YET_READABLE = 2;

/** Packages still unreadable when a verification window ends. */
export class NotYetReadableError extends Error {}

/** The wait before check `attempt + 1`: grows by half, capped. */
export function verificationWait(
  attempt,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxIntervalMs = DEFAULT_MAX_INTERVAL_MS,
) {
  return Math.min(
    Math.round(intervalMs * INTERVAL_GROWTH ** (attempt - 1)),
    maxIntervalMs,
  );
}

async function jsonResponse(response, label) {
  if (response.status !== 200) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

export async function verifyRegistryEntry({
  name,
  version,
  tag,
  registry = DEFAULT_REGISTRY,
  fetchImpl = fetch,
}) {
  const versionDocument = await jsonResponse(
    await fetchVersionDocument({name, version, registry, fetchImpl}),
    `${name}@${version} version document`,
  );
  if (versionDocument.version !== version) {
    throw new Error(
      `${name}@${version} version document reported ${versionDocument.version ?? 'no version'}`,
    );
  }

  const tags = await jsonResponse(
    await fetchDistTags({name, registry, fetchImpl}),
    `${name} dist-tags`,
  );
  if (tags[tag] !== version) {
    throw new Error(
      `${name} ${tag} dist-tag is ${tags[tag] ?? 'missing'}, expected ${version}`,
    );
  }

  const tarball = versionDocument.dist?.tarball;
  if (typeof tarball !== 'string' || tarball.length === 0) {
    throw new Error(`${name}@${version} version document has no tarball URL`);
  }
  const tarballResponse = await fetchImpl(tarball, {
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  if (tarballResponse.status !== 200) {
    await tarballResponse.body?.cancel();
    throw new Error(
      `${name}@${version} tarball returned HTTP ${tarballResponse.status}`,
    );
  }
  await tarballResponse.body?.cancel();
}

export async function verifyPublishedPackages({
  packages,
  version,
  tag = 'latest',
  registry = DEFAULT_REGISTRY,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxIntervalMs = DEFAULT_MAX_INTERVAL_MS,
  windowMs = DEFAULT_WINDOW_MS,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onAttempt = () => {},
}) {
  const pending = new Map(packages.map(name => [name, 'not checked']));
  const start = now();
  for (let attempt = 1; ; attempt += 1) {
    const names = [...pending.keys()];
    onAttempt({attempt, names, elapsedMs: now() - start});
    await Promise.all(
      names.map(async name => {
        try {
          await verifyRegistryEntry({
            name,
            version,
            tag,
            registry,
            fetchImpl,
          });
          pending.delete(name);
        } catch (error) {
          pending.set(name, error.message);
        }
      }),
    );
    if (pending.size === 0) return;
    const wait = verificationWait(attempt, intervalMs, maxIntervalMs);
    if (now() - start + wait > windowMs) break;
    await sleep(wait);
  }
  throw new NotYetReadableError(
    [...pending]
      .map(([name, error]) => `${name}@${version}: ${error}`)
      .join('\n'),
  );
}

export function stablePackageNames(root, version) {
  const directories = [
    ...fs
      .readdirSync(path.join(root, 'packages'), {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(root, 'packages', entry.name)),
    ...fs
      .readdirSync(path.join(root, 'packages', 'themes'), {
        withFileTypes: true,
      })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(root, 'packages', 'themes', entry.name)),
  ];
  return directories
    .map(directory => path.join(directory, 'package.json'))
    .filter(filename => fs.existsSync(filename))
    .map(filename => JSON.parse(fs.readFileSync(filename, 'utf8')))
    .filter(isStableReleasePackage)
    .map(manifest => {
      if (manifest.version !== version) {
        throw new Error(
          `${manifest.name} declares ${manifest.version}, expected ${version}`,
        );
      }
      return manifest.name;
    })
    .sort();
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null) {
      throw new Error(
        'expected --version X.Y.Z and optional --tag, --registry, --interval-ms, --max-interval-ms, or --window-ms',
      );
    }
    values[key.slice(2)] = value;
  }
  return values;
}

async function main() {
  const values = parseArgs(process.argv.slice(2));
  const version = values.version;
  if (!/^\d+\.\d+\.\d+$/u.test(version ?? '')) {
    throw new Error('--version must be X.Y.Z');
  }
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  const timing = Object.fromEntries(
    [
      ['interval-ms', DEFAULT_INTERVAL_MS],
      ['max-interval-ms', DEFAULT_MAX_INTERVAL_MS],
      ['window-ms', DEFAULT_WINDOW_MS],
    ].map(([key, fallback]) => {
      const value = Number(values[key] ?? fallback);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(
          `--${key} must be a non-negative number of milliseconds`,
        );
      }
      return [key, value];
    }),
  );
  const packages = stablePackageNames(root, version);
  if (packages.length === 0) throw new Error('no stable packages found');
  await verifyPublishedPackages({
    packages,
    version,
    tag: values.tag ?? 'latest',
    registry: values.registry ?? DEFAULT_REGISTRY,
    intervalMs: timing['interval-ms'],
    maxIntervalMs: timing['max-interval-ms'],
    windowMs: timing['window-ms'],
    onAttempt({attempt, names, elapsedMs}) {
      console.log(
        `Registry verification ${attempt} after ${Math.round(elapsedMs / 1000)} s: ${names.length} package(s) pending`,
      );
    },
  });
  console.log(
    `✅ Verified ${packages.length} package(s) at ${version}: version document, tarball HTTP 200, and ${values.tag ?? 'latest'} dist-tag.`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch(error => {
    if (error instanceof NotYetReadableError) {
      console.error(
        `published packages are not yet readable on the registry:\n${error.message}`,
      );
      process.exit(EXIT_NOT_YET_READABLE);
    }
    console.error(
      `published package registry verification failed:\n${error.message}`,
    );
    process.exit(1);
  });
}
