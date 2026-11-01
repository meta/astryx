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
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {isStableReleasePackage} from '../release/active-release.mjs';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const DEFAULT_ATTEMPTS = 41;
const DEFAULT_INTERVAL_MS = 15_000;

function packageKey(name) {
  return encodeURIComponent(name);
}

function registryUrl(registry, pathname) {
  return new URL(pathname, `${registry.replace(/\/+$/u, '')}/`).href;
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
  const encoded = packageKey(name);
  const versionUrl = registryUrl(
    registry,
    `${encoded}/${encodeURIComponent(version)}`,
  );
  const versionDocument = await jsonResponse(
    await fetchImpl(versionUrl, {
      cache: 'no-store',
      headers: {accept: 'application/json'},
      signal: AbortSignal.timeout(30_000),
    }),
    `${name}@${version} version document`,
  );
  if (versionDocument.version !== version) {
    throw new Error(
      `${name}@${version} version document reported ${versionDocument.version ?? 'no version'}`,
    );
  }

  const tagsUrl = registryUrl(registry, `-/package/${encoded}/dist-tags`);
  const tags = await jsonResponse(
    await fetchImpl(tagsUrl, {
      cache: 'no-store',
      headers: {accept: 'application/json'},
      signal: AbortSignal.timeout(30_000),
    }),
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
  attempts = DEFAULT_ATTEMPTS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onAttempt = () => {},
}) {
  const pending = new Map(packages.map(name => [name, 'not checked']));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const names = [...pending.keys()];
    onAttempt({attempt, attempts, names});
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
    if (attempt < attempts) await sleep(intervalMs);
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
        'expected --version X.Y.Z and optional --tag, --registry, --attempts, or --interval-ms',
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
    attempts: Number(values.attempts ?? DEFAULT_ATTEMPTS),
    intervalMs: Number(values['interval-ms'] ?? DEFAULT_INTERVAL_MS),
    onAttempt({attempt, attempts, names}) {
      console.log(
        `Registry verification ${attempt}/${attempts}: ${names.length} package(s) pending`,
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
