#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Publish one package to npm, at most once, with retries the registry
 *   decides.
 * @input `--dir <package dir> --tag <dist-tag>`; the package's own
 *   package.json supplies its name and version. `ASTRYX_PUBLISH_REGISTRY`
 *   (default https://registry.npmjs.org), `ASTRYX_PUBLISH_ATTEMPTS` (3) and
 *   `ASTRYX_PUBLISH_WAITS_MS` (seconds to wait before each retry and between
 *   registry reads, default "20000,60000" and 5000) exist so tests can run
 *   the real script quickly.
 * @output Exit 0 when the registry has `name@version` (already there, just
 *   published, or published by an attempt whose client reported a failure);
 *   exit 1 when every attempt failed and the registry still does not have it.
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
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_WAITS_MS = [20_000, 60_000];
const DEFAULT_READ_INTERVAL_MS = 5_000;
// Registry reads after a failed attempt: a version npm accepted can take a
// few seconds to appear.
const READS_AFTER_FAILURE = 4;

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
  const url = new URL(
    `${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    `${registry.replace(/\/+$/u, '')}/`,
  ).href;
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      headers: {accept: 'application/json'},
      signal: AbortSignal.timeout(30_000),
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

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag?.startsWith('--') || argv[i + 1] == null) {
      throw new Error(`expected --flag value pairs, got ${argv.join(' ')}`);
    }
    args[flag.slice(2)] = argv[i + 1];
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
  const {dir, tag} = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
  );
  const {name, version} = manifest;
  const registry = process.env.ASTRYX_PUBLISH_REGISTRY || DEFAULT_REGISTRY;
  const attempts = Number(
    process.env.ASTRYX_PUBLISH_ATTEMPTS || DEFAULT_ATTEMPTS,
  );
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('ASTRYX_PUBLISH_ATTEMPTS must be a positive integer');
  }
  const waits = numberList(process.env.ASTRYX_PUBLISH_WAITS_MS, null);
  const result = await publishOnce({
    name,
    version,
    attempts,
    retryWaitsMs: waits ?? DEFAULT_RETRY_WAITS_MS,
    readIntervalMs: waits ? waits[0] : DEFAULT_READ_INTERVAL_MS,
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
