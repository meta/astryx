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
 * The wait between checks starts at 15 s and grows to at most 60 s, for up to
 * 30 minutes in total. A new version of a package with a very large registry
 * document (Core keeps every canary) can take minutes to become readable.
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
const DEFAULT_MAX_WAIT_MS = 30 * 60_000;
const INTERVAL_GROWTH = 1.5;

/**
 * The waits between checks: `intervalMs`, growing by half each time up to
 * `maxIntervalMs`, while their sum stays within `maxWaitMs`.
 */
export function verificationWaits({
  intervalMs = DEFAULT_INTERVAL_MS,
  maxIntervalMs = DEFAULT_MAX_INTERVAL_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
} = {}) {
  const waits = [];
  let total = 0;
  let wait = intervalMs;
  while (total + wait <= maxWaitMs && waits.length < 10_000) {
    waits.push(wait);
    total += wait;
    wait = Math.min(Math.round(wait * INTERVAL_GROWTH), maxIntervalMs);
    if (wait <= 0) break;
  }
  return waits;
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
  waits = verificationWaits(),
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onAttempt = () => {},
}) {
  const pending = new Map(packages.map(name => [name, 'not checked']));
  const attempts = waits.length + 1;
  let waitedMs = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const names = [...pending.keys()];
    onAttempt({attempt, attempts, names, waitedMs});
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
    if (attempt < attempts) {
      await sleep(waits[attempt - 1]);
      waitedMs += waits[attempt - 1];
    }
  }
  throw new Error(
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
        'expected --version X.Y.Z and optional --tag, --registry, --interval-ms, --max-interval-ms, or --max-wait-ms',
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
  const packages = stablePackageNames(root, version);
  if (packages.length === 0) throw new Error('no stable packages found');
  await verifyPublishedPackages({
    packages,
    version,
    tag: values.tag ?? 'latest',
    registry: values.registry ?? DEFAULT_REGISTRY,
    waits: verificationWaits({
      intervalMs: Number(values['interval-ms'] ?? DEFAULT_INTERVAL_MS),
      maxIntervalMs: Number(
        values['max-interval-ms'] ?? DEFAULT_MAX_INTERVAL_MS,
      ),
      maxWaitMs: Number(values['max-wait-ms'] ?? DEFAULT_MAX_WAIT_MS),
    }),
    onAttempt({attempt, attempts, names, waitedMs}) {
      console.log(
        `Registry verification ${attempt}/${attempts} after ${Math.round(waitedMs / 1000)} s: ${names.length} package(s) pending`,
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
    console.error(
      `published package registry verification failed:\n${error.message}`,
    );
    process.exit(1);
  });
}
