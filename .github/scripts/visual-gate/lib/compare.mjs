// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compare a capture against a baseline, and read the theming evidence.
 *
 * @input  two capture directories and their manifests
 * @output a verdict — the machine-readable answer the release cron acts on —
 *         plus a diff PNG per changed shot
 *
 * The verdict is deliberately three-valued. `pass` and `failed` are the
 * obvious ones; `changed` is NOT a failure, because a visual change is only a
 * regression if nobody meant it. Every changed shot therefore carries its
 * before, its after, and its diff, and the answer "the after is correct" is a
 * first-class outcome that gets recorded (see baseline.mjs `accept`) rather
 * than a red run someone re-runs until it goes away.
 *
 * A new shot has no before, so it cannot regress: it is reported as `added`
 * and adopted the first time it is seen. Ordinary comparisons never infer removals. Only a capture carrying a validated
 * canonical stable-release plan may report baseline keys it did not capture.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import {Worker} from 'node:worker_threads';

const RELEASE_LANE = 'stable-release';

export function validateReleasePlan(plan, currentManifest, failures = []) {
  const keys = plan?.keys;
  if (
    plan?.version !== 1 ||
    plan?.lane !== RELEASE_LANE ||
    plan?.authority !== 'report-removals' ||
    !Array.isArray(keys)
  ) {
    throw new Error('Capture has no canonical stable-release plan.');
  }
  const sorted = [...keys].sort();
  if (new Set(sorted).size !== sorted.length || sorted.some((key, index) => key !== keys[index])) {
    throw new Error('Canonical stable-release keys must be sorted and unique.');
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(keys)).digest('hex');
  if (digest !== plan.digest) throw new Error('Canonical stable-release plan digest does not match its keys.');
  const captured = Object.keys(currentManifest.shots ?? {}).sort();
  if (captured.length !== keys.length || captured.some((key, index) => key !== keys[index])) {
    throw new Error('Capture does not exactly cover the canonical stable-release plan.');
  }
  if (failures.length > 0) throw new Error(`Stable release capture has ${failures.length} failure(s).`);
  if (captured.some(key => {
    const shot = currentManifest.shots[key];
    return shot.stableVisual !== true || shot.stableThemeVisual !== true;
  })) {
    throw new Error('Stable release capture contains an ineligible story or theme.');
  }
  return plan;
}

/**
 * @typedef {object} Change
 * @property {string} key
 * @property {number} diffPixels
 * @property {number} diffRatio
 * @property {boolean} sizeChanged
 */

export function partitionComparisonKeys(keys, concurrency) {
  if (keys.length === 0) return [];
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), keys.length));
  const partitions = Array.from({length: workerCount}, () => []);
  keys.forEach((key, index) => partitions[index % workerCount].push(key));
  return partitions;
}

function comparePartition(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./compare-worker.mjs', import.meta.url), {
      workerData,
      execArgv: [],
    });
    let settled = false;
    worker.once('message', value => {
      settled = true;
      resolve(value);
    });
    worker.once('error', error => {
      settled = true;
      reject(error);
    });
    worker.once('exit', code => {
      if (!settled) reject(new Error(`Visual comparison worker exited ${code} without a result.`));
    });
  });
}

/**
 * @param {object} options
 * @param {string} options.baselineDir - directory of baseline PNGs
 * @param {string} options.currentDir - directory of freshly captured PNGs
 * @param {object} options.baselineManifest
 * @param {object} options.currentManifest
 * @param {string} options.diffDir - where diff PNGs are written
 * @param {number} options.threshold - pixelmatch per-pixel colour threshold
 * @param {number} options.maxDiffPixels - pixels allowed to differ before a shot counts as changed
 * @param {number} [options.concurrency] - bounded CPU workers for PNG decoding and pixel comparison
 * @returns {Promise<{changes: Change[], added: string[], removed: string[], unchanged: string[]}>}
 */
export async function compareCaptures({
  baselineDir,
  currentDir,
  baselineManifest,
  currentManifest,
  diffDir,
  threshold,
  maxDiffPixels,
  concurrency = 2,
}) {
  const baselineKeys = new Set(Object.keys(baselineManifest.shots ?? {}));
  const currentKeys = Object.keys(currentManifest.shots ?? {});
  const positions = new Map(currentKeys.map((key, index) => [key, index]));
  const added = [];
  const unchanged = [];
  const pixelKeys = [];

  fs.mkdirSync(diffDir, {recursive: true});
  for (const key of currentKeys) {
    if (!baselineKeys.has(key)) {
      added.push(key);
      continue;
    }
    const current = currentManifest.shots[key];
    const baseline = baselineManifest.shots[key];
    if (current.sha256 === baseline.sha256) unchanged.push(key);
    else pixelKeys.push(key);
  }

  const workerResults = (
    await Promise.all(
      partitionComparisonKeys(pixelKeys, concurrency).map(keys =>
        comparePartition({
          keys,
          baselineDir,
          currentDir,
          diffDir,
          threshold,
          maxDiffPixels,
        }),
      ),
    )
  ).flat();
  const changes = [];
  for (const result of workerResults) {
    if (result.unchanged) unchanged.push(result.key);
    else changes.push(result.change);
  }

  unchanged.sort((a, b) => positions.get(a) - positions.get(b));
  changes.sort(
    (a, b) => b.diffPixels - a.diffPixels || positions.get(a.key) - positions.get(b.key),
  );
  return {changes, added, removed: [], unchanged};
}

export async function compareReleaseCaptures(options) {
  if (options.failures?.length) {
    return compareCaptures(options);
  }
  validateReleasePlan(
    options.currentManifest.context?.releasePlan,
    options.currentManifest,
    options.failures,
  );
  const comparison = await compareCaptures(options);
  const current = new Set(Object.keys(options.currentManifest.shots ?? {}));
  return {
    ...comparison,
    removed: Object.keys(options.baselineManifest.shots ?? {}).filter(key => !current.has(key)),
  };
}

/**
 * What the DOM said about theming, against what the themes and the components
 * claim. These are the findings a pixel diff cannot give you: an override that
 * binds to nothing is invisible in a screenshot precisely because it does
 * nothing.
 *
 * @param {object} options
 * @param {Record<string, string[]>} options.observedTargets - key → props/states seen in the DOM
 * @param {Array<{key: string, component: string, props: string[], states: string[]}>} options.targets
 * @param {Record<string, Record<string, string[]>>} options.themeOverrides - theme → key → override selectors
 * @returns {{unexercisedOverrides: Array<{theme: string, key: string, selector?: string}>, undeclaredTargets: string[], uncoveredTargets: string[]}}
 */
export function analyzeTargeting({observedTargets, targets, themeOverrides}) {
  const declared = new Set(targets.map(target => target.key));
  const seen = new Set(Object.keys(observedTargets));

  /** @type {Array<{theme: string, key: string, selector?: string}>} */
  const unexercisedOverrides = [];
  for (const [theme, keys] of Object.entries(themeOverrides)) {
    for (const [key, selectors] of Object.entries(keys)) {
      if (!seen.has(key)) {
        unexercisedOverrides.push({theme, key});
        continue;
      }
      const observedData = new Set(observedTargets[key] ?? []);
      for (const selector of selectors) {
        // `base` and pseudo-class selectors are not reflected as data; only
        // variant and state keys can be checked against the DOM.
        if (selector === 'base' || selector.startsWith(':')) continue;
        if (!observedData.has(selector)) unexercisedOverrides.push({theme, key, selector});
      }
    }
  }

  return {
    unexercisedOverrides,
    undeclaredTargets: [...seen].filter(key => !declared.has(key)).sort(),
    uncoveredTargets: [...declared].filter(key => !seen.has(key)).sort(),
  };
}

/**
 * The verdict document. The release cron reads `status` and, when it is
 * `changed`, walks `changes` with the report open.
 *
 * @param {object} input
 * @returns {object}
 */
export function buildVerdict({
  comparison,
  currentManifest,
  baselineManifest,
  targeting,
  failures,
  context,
}) {
  const changes = comparison.changes.map(change => ({
    ...change,
    ...pick(currentManifest.shots[change.key], [
      'storyId',
      'title',
      'name',
      'component',
      'theme',
      'mode',
      'reasons',
    ]),
  }));

  // Added and removed stable shots are decisions too. A new story has no
  // before image, but allowing it to pass silently creates baseline debt that
  // the next run cannot resolve; a removed story can delete the only coverage
  // for a target. Both need the same explicit acceptance as changed pixels.
  const status =
    failures.length > 0
      ? 'failed'
      : changes.length > 0 || comparison.added.length > 0 || comparison.removed.length > 0
        ? 'changed'
        : 'pass';

  return {
    version: 1,
    status,
    generatedAt: new Date().toISOString(),
    context,
    platform: currentManifest.platform,
    baseline: {
      capturedAt: baselineManifest.capturedAt ?? null,
      sha: baselineManifest.context?.sha ?? null,
      platform: baselineManifest.platform ?? null,
    },
    counts: {
      total: Object.keys(currentManifest.shots).length,
      unchanged: comparison.unchanged.length,
      changed: changes.length,
      added: comparison.added.length,
      removed: comparison.removed.length,
      failed: failures.length,
    },
    changes,
    added: comparison.added,
    removed: comparison.removed,
    failures,
    targeting,
  };
}

/**
 * @param {Record<string, unknown>} source
 * @param {string[]} keys
 */
function pick(source, keys) {
  return Object.fromEntries(keys.map(key => [key, source?.[key]]));
}
