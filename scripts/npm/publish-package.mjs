#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Publish one package to npm, at most once, with retries the registry
 *   decides.
 * @input `--dir <package dir> --tag <dist-tag> [--skip-if-package-absent]`;
 *   the package's own package.json supplies its name and version. `ASTRYX_PUBLISH_REGISTRY`
 *   (default https://registry.npmjs.org), `ASTRYX_PUBLISH_ATTEMPTS` (3) and
 *   `ASTRYX_PUBLISH_WAITS_MS` (milliseconds to wait before each retry, default
 *   "20000,60000"; its first value is also the wait between registry reads,
 *   default 5000) exist so tests can run the real script quickly.
 * @output Exit 0 when the registry has `name@version` (already there, just
 *   published, or published by an attempt whose client reported a failure);
 *   exit 1 when every attempt failed and the registry still does not have it.
 *   With `--skip-if-package-absent`, exit 3 without publishing when the
 *   package itself does not exist on the registry, and exit 1 when the
 *   registry cannot say whether it exists.
 * @position Both publish jobs in .github/workflows/release.yml call it once
 *   per package. The registry, not a client's exit code, decides whether a
 *   package is published:
 *   - A version already on the registry is not published again (a re-run
 *     after a partial publish skips what already landed).
 *   - A failed publish is checked against the registry before a retry. npm's
 *     provenance signing can fail with "409 an equivalent entry already
 *     exists in the transparency log" when its client re-sends the same
 *     signed entry after a lost reply; the package is then not published,
 *     and a new attempt signs a new entry, so it is retried.
 *   - npm never accepts a second publish of a version, so a retry cannot
 *     publish twice even when a registry read is stale.
 *   - `--skip-if-package-absent` is for a private canary-only package whose
 *     npm name may not be set up yet: its first publish would be refused.
 *     The check reads the package's `latest` version document, which stays
 *     small and answers 404 for a missing package, and never its full
 *     document, which grows with every canary and can outlast a read's time
 *     limit. (A missing scoped package's dist-tags answer 401, not 404.) An
 *     unknown answer is asked again and never skips.
 *   - A package whose `@astryxdesign` dependencies or peers do not name this
 *     release's versions is never published (see published-manifests.mjs).
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  alignmentProblems,
  canaryOnlyNames,
  releaseVersions,
} from './published-manifests.mjs';
import {DEFAULT_REGISTRY, fetchVersionDocument} from './registry.mjs';

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_WAITS_MS = [20_000, 60_000];
const DEFAULT_READ_INTERVAL_MS = 5_000;
// Registry reads after a failed attempt: a version npm accepted can take a
// few seconds to appear.
const READS_AFTER_FAILURE = 4;
const PACKAGE_LOOKUPS = 3;
export const EXIT_PACKAGE_ABSENT = 3;

/**
 * Whether the registry has `name@version`: `true`, `false`, or `null` when
 * the read failed (a network error or any status but 200 and 404).
 */
export async function registryHas({
  name,
  version,
  registry = DEFAULT_REGISTRY,
  fetchImpl = fetch,
}) {
  try {
    const response = await fetchVersionDocument({
      name,
      version,
      registry,
      fetchImpl,
    });
    await response.body?.cancel();
    if (response.status === 200) return true;
    if (response.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Whether the package `name` exists on the registry, read from its `latest`
 * version document: every published package has one. `true`, `false` (404),
 * or `null` when the read failed (a network error or any other status).
 */
export function packageExists({
  name,
  registry = DEFAULT_REGISTRY,
  fetchImpl = fetch,
}) {
  return registryHas({name, version: 'latest', registry, fetchImpl});
}

/**
 * Asks `exists()` until it gives a definite answer, at most `lookups` times,
 * waiting `intervalMs`, then twice that, between tries. Returns `true`,
 * `false`, or `null` when every answer was unknown.
 */
export async function lookUpPackage({
  name,
  exists,
  lookups = PACKAGE_LOOKUPS,
  intervalMs = DEFAULT_READ_INTERVAL_MS,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = () => {},
}) {
  for (let lookup = 1; lookup <= lookups; lookup += 1) {
    const answer = await exists();
    if (answer !== null) return answer;
    if (lookup < lookups) {
      const wait = intervalMs * 2 ** (lookup - 1);
      log(
        `Could not tell whether ${name} exists on the registry (lookup ${lookup} of ${lookups}); asking again in ${Math.round(wait / 1000)} s.`,
      );
      await sleep(wait);
    }
  }
  return null;
}

/**
 * Publishes `name@version` at most once. `publish()` runs one publish and
 * returns whether its process succeeded; `isPublished()` reads the registry
 * (`true`, `false`, or `null` when unknown). Returns `{published, outcome,
 * attempts}`, where `outcome` is `already-published`, `published`,
 * `published-despite-error`, or `failed`.
 */
export async function publishOnce({
  name,
  version,
  publish,
  isPublished,
  attempts = DEFAULT_ATTEMPTS,
  retryWaitsMs = DEFAULT_RETRY_WAITS_MS,
  readIntervalMs = DEFAULT_READ_INTERVAL_MS,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = () => {},
}) {
  if ((await isPublished()) === true) {
    log(
      `${name}@${version} is already on the registry; not publishing it again.`,
    );
    return {published: true, outcome: 'already-published', attempts: 0};
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await publish()) {
      return {published: true, outcome: 'published', attempts: attempt};
    }
    for (let read = 1; read <= READS_AFTER_FAILURE; read += 1) {
      if ((await isPublished()) === true) {
        log(
          `${name}@${version} is on the registry although attempt ${attempt} reported a failure; not publishing it again.`,
        );
        return {
          published: true,
          outcome: 'published-despite-error',
          attempts: attempt,
        };
      }
      if (read < READS_AFTER_FAILURE) await sleep(readIntervalMs);
    }
    if (attempt < attempts) {
      const wait =
        retryWaitsMs[Math.min(attempt, retryWaitsMs.length) - 1] ?? 0;
      log(
        `${name}@${version} is not on the registry after attempt ${attempt} of ${attempts}; retrying in ${Math.round(wait / 1000)} s with a new signature.`,
      );
      await sleep(wait);
    }
  }
  return {published: false, outcome: 'failed', attempts};
}

const BOOLEAN_FLAGS = new Set(['skip-if-package-absent']);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (BOOLEAN_FLAGS.has(flag?.slice(2))) {
      args[flag.slice(2)] = true;
      continue;
    }
    if (!flag?.startsWith('--') || argv[i + 1] == null) {
      throw new Error(`expected --flag value pairs, got ${argv.join(' ')}`);
    }
    args[flag.slice(2)] = argv[i + 1];
    i += 1;
  }
  for (const required of ['dir', 'tag']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  return args;
}

function numberList(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const values = raw.split(',').map(Number);
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error(`expected comma-separated milliseconds, got "${raw}"`);
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const {dir, tag} = args;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
  );
  const {name, version} = manifest;
  // Run from the repository root, as both publish jobs do.
  const root = process.cwd();
  const misaligned = alignmentProblems(
    manifest,
    releaseVersions(root),
    canaryOnlyNames(root),
  );
  if (misaligned.length > 0) {
    for (const problem of misaligned) console.error(problem);
    console.error(`${name}@${version} is not published.`);
    process.exit(1);
  }
  const registry = process.env.ASTRYX_PUBLISH_REGISTRY || DEFAULT_REGISTRY;
  const attempts = Number(
    process.env.ASTRYX_PUBLISH_ATTEMPTS || DEFAULT_ATTEMPTS,
  );
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('ASTRYX_PUBLISH_ATTEMPTS must be a positive integer');
  }
  const waits = numberList(process.env.ASTRYX_PUBLISH_WAITS_MS, null);
  const readIntervalMs = waits ? waits[0] : DEFAULT_READ_INTERVAL_MS;
  if (args['skip-if-package-absent']) {
    const exists = await lookUpPackage({
      name,
      intervalMs: readIntervalMs,
      exists: () => packageExists({name, registry}),
      log: message => console.log(message),
    });
    if (exists === false) {
      console.log(`${name} does not exist on the registry; not publishing it.`);
      process.exit(EXIT_PACKAGE_ABSENT);
    }
    if (exists === null) {
      console.error(
        `Could not tell whether ${name} exists on the registry after ${PACKAGE_LOOKUPS} lookups.`,
      );
      process.exit(1);
    }
  }
  const result = await publishOnce({
    name,
    version,
    attempts,
    retryWaitsMs: waits ?? DEFAULT_RETRY_WAITS_MS,
    readIntervalMs,
    isPublished: () => registryHas({name, version, registry}),
    publish: () =>
      spawnSync(
        'pnpm',
        [
          'publish',
          dir,
          '--tag',
          tag,
          '--provenance',
          '--access',
          'public',
          '--no-git-checks',
        ],
        {stdio: 'inherit'},
      ).status === 0,
    log: message => console.log(message),
  });
  if (!result.published) {
    console.error(
      `${name}@${version} is not on the registry after ${result.attempts} attempt(s).`,
    );
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
