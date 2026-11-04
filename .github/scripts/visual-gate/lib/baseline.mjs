// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The baseline store, and the one operation that changes it.
 *
 * @input  a baseline directory (manifest + shots), a capture, and its verdict
 * @output an updated baseline, with every promotion recorded; browser refreshes
 *         require a complete capture whose only failure is the browser mismatch
 *
 * "The after is correct" is a decision, not a retry. Promoting a shot writes
 * a line into the manifest's decision log saying which shots moved, who moved
 * them, against which run, and why — so a baseline can always be read back to
 * the change that justified it. Nothing else in the gate writes to the
 * baseline: a capture never quietly becomes the new truth.
 *
 * Baselines are per-platform. A shot captured on macOS and a shot captured on
 * an Ubuntu runner differ in font rasterisation everywhere at once, which
 * reads as "everything changed" and teaches everyone to accept blindly. The
 * gate refuses the comparison instead.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const EMPTY_MANIFEST = {version: 1, shots: {}, decisions: []};

/** Verdict statuses that need no browser-refresh recovery validation. */
export const PROMOTABLE_VERDICT_STATUSES = ['pass', 'changed'];

/** A browser bump is recoverable only when it is the sole comparison failure. */
function isBrowserRefresh(verdict, baseline = {}, current = {}) {
  return (
    typeof baseline.platform === 'string' &&
    baseline.platform.length > 0 &&
    baseline.platform === current.platform &&
    typeof baseline.browser === 'string' &&
    baseline.browser.length > 0 &&
    typeof current.browser === 'string' &&
    current.browser.length > 0 &&
    baseline.browser !== current.browser &&
    ['width', 'height'].every(
      axis =>
        Number.isSafeInteger(baseline.viewport?.[axis]) &&
        baseline.viewport[axis] > 0 &&
        baseline.viewport[axis] === current.viewport?.[axis],
    ) &&
    Array.isArray(verdict.failures) &&
    verdict.failures.length === 1 &&
    verdict.failures[0]?.key === 'baseline' &&
    verdict.failures[0].error === incomparable(baseline, current) &&
    verdict.counts?.failed === 1 &&
    Array.isArray(verdict.removed) &&
    verdict.removed.length === 0
  );
}

/**
 * The promotion boundary. Completed runs may still carry failed captures.
 * Pass/changed verdicts are eligible; a failed verdict needs the exact browser
 * mismatch against both manifests. accept() also requires a complete refresh
 * before it writes. Missing, unreadable, skipped, and unknown verdicts fail closed.
 *
 * @param {unknown} verdict - parsed verdict.json, or null when it is missing
 * @param {object} [options]
 * @param {object} [options.baselineManifest]
 * @param {object} [options.currentManifest]
 * @throws {Error} when the capture must not be promoted
 */
export function assertPromotableVerdict(
  verdict,
  {baselineManifest, currentManifest} = {},
) {
  if (verdict == null) {
    throw new Error(
      'Refusing to promote a capture with no verdict.json — promote from a check or release run whose verdict is pass or changed.',
    );
  }
  const status =
    typeof verdict === 'object' && typeof verdict.status === 'string'
      ? verdict.status
      : null;
  if (PROMOTABLE_VERDICT_STATUSES.includes(status)) return;
  if (
    status === 'failed' &&
    isBrowserRefresh(verdict, baselineManifest, currentManifest)
  )
    return;
  const shown = status == null ? 'unreadable' : JSON.stringify(status);
  throw new Error(
    `Refusing to promote from a gate run whose verdict status is ${shown} — requires pass, changed, or a complete browser-only refresh.`,
  );
}

/**
 * @param {string} baselineDir
 * @returns {{manifest: object, exists: boolean}}
 */
export function readBaseline(baselineDir) {
  const manifestPath = path.join(baselineDir, 'manifest.json');
  // A deep copy: a shallow spread shared EMPTY_MANIFEST's shots and decisions
  // objects between every fresh baseline in the same process.
  if (!fs.existsSync(manifestPath))
    return {manifest: structuredClone(EMPTY_MANIFEST), exists: false};
  return {
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    exists: true,
  };
}

const BASELINE_SHOT_FIELDS = [
  'sha256',
  'storyId',
  'theme',
  'mode',
  // These two preserve ownership when a story or theme leaves the current build.
  'packageName',
  'themePackageName',
];

/** Keep the baseline index reviewable; all other shot facts are derived per run. */
export function compactBaselineManifest(manifest) {
  const shots = Object.fromEntries(
    Object.entries(manifest.shots ?? {}).map(([key, shot]) => [
      key,
      Object.fromEntries(
        BASELINE_SHOT_FIELDS.flatMap(field =>
          shot[field] === undefined ? [] : [[field, shot[field]]],
        ),
      ),
    ]),
  );
  return {
    version: manifest.version ?? 1,
    shots,
    decisions: manifest.decisions ?? [],
    ...(manifest.platform ? {platform: manifest.platform} : {}),
    ...(manifest.browser ? {browser: manifest.browser} : {}),
    ...(manifest.viewport ? {viewport: manifest.viewport} : {}),
    ...(manifest.capturedAt ? {capturedAt: manifest.capturedAt} : {}),
    ...(manifest.context ? {context: manifest.context} : {}),
  };
}

/**
 * @param {string} baselineDir
 * @param {object} manifest
 */
export function writeBaseline(baselineDir, manifest) {
  fs.mkdirSync(path.join(baselineDir, 'shots'), {recursive: true});
  fs.writeFileSync(
    path.join(baselineDir, 'manifest.json'),
    `${JSON.stringify(compactBaselineManifest(manifest))}\n`,
  );
}

/**
 * Refuse a comparison the numbers cannot support.
 * @param {object} baselineManifest
 * @param {object} currentManifest
 * @returns {string | null} the reason the comparison is invalid, or null
 */
export function incomparable(baselineManifest, currentManifest) {
  if (!baselineManifest.platform) return null;
  if (baselineManifest.platform !== currentManifest.platform) {
    return `baseline was captured on ${baselineManifest.platform}, this run on ${currentManifest.platform} — rendering differs by platform, so the diff would be noise. Recapture the baseline on ${currentManifest.platform}.`;
  }
  if (
    baselineManifest.browser &&
    currentManifest.browser &&
    baselineManifest.browser !== currentManifest.browser
  ) {
    // A browser bump moves antialiasing and font metrics everywhere at once.
    // Saying so is far more useful than a report claiming 400 regressions.
    return `baseline was captured with ${baselineManifest.browser}, this run with ${currentManifest.browser} — refresh the baseline (gate.mjs accept --keys all --reason "browser bump").`;
  }
  const a = baselineManifest.viewport;
  const b = currentManifest.viewport;
  if (a && b && (a.width !== b.width || a.height !== b.height)) {
    return `baseline viewport ${a.width}x${a.height} does not match this run's ${b.width}x${b.height}.`;
  }
  return null;
}

/**
 * Promote captured shots into the baseline. Nothing is written unless the
 * capture's verdict is one the gate stood behind (see assertPromotableVerdict).
 *
 * @param {object} options
 * @param {string} options.baselineDir
 * @param {string} options.captureDir - directory holding the capture's shots/
 * @param {object} options.currentManifest
 * @param {unknown} options.verdict - the capture's parsed verdict.json (null when missing)
 * @param {string[]} options.keys - shot keys to promote
 * @param {string} options.reason - why the new rendering is the correct one
 * @param {string} options.actor
 * @param {string | null} [options.runId]
 * @param {string[]} [options.prune] - shot keys to drop (stories that no longer exist)
 * @returns {{promoted: string[], pruned: string[], manifest: object}}
 */
export function accept({
  baselineDir,
  captureDir,
  currentManifest,
  verdict,
  keys,
  reason,
  actor,
  runId = null,
  prune = [],
}) {
  const {manifest} = readBaseline(baselineDir);
  assertPromotableVerdict(verdict, {
    baselineManifest: manifest,
    currentManifest,
  });
  if (!reason?.trim())
    throw new Error(
      'accept requires a reason — it is the record of the decision',
    );
  // Shot keys name files inside shots/. A real key is shotKey() output
  // ([a-zA-Z0-9._-] only, see plan.mjs), never a path — reject anything else
  // before it is joined into one, whichever manifest or flag it came from.
  const SHOT_KEY = /^(?!\.+$)[a-zA-Z0-9._-]+$/;
  const badKey = [...keys, ...prune].find(key => !SHOT_KEY.test(String(key)));
  if (badKey != null) {
    throw new Error(`Invalid shot key: ${JSON.stringify(badKey)}`);
  }
  if (verdict.status === 'failed') {
    // Browser identity is manifest-wide: a partial refresh would label old
    // pixels as captured by the new browser. Validate every file before copying.
    const captured = Object.keys(currentManifest.shots ?? {});
    const selected = new Set(keys);
    if (
      captured.length === 0 ||
      verdict.counts?.total !== captured.length ||
      selected.size !== captured.length ||
      keys.length !== captured.length ||
      captured.some(key => !selected.has(key)) ||
      Object.keys(manifest.shots).some(key => !selected.has(key)) ||
      prune.length > 0
    ) {
      throw new Error(
        'Refusing to promote a browser refresh unless every baseline and captured shot is refreshed without pruning.',
      );
    }
    for (const key of keys) {
      const source = path.join(captureDir, 'shots', `${key}.png`);
      if (
        !fs.existsSync(source) ||
        createHash('sha256').update(fs.readFileSync(source)).digest('hex') !==
          currentManifest.shots[key].sha256
      ) {
        throw new Error(
          `Refusing to promote a browser refresh with a missing or changed capture: ${key}`,
        );
      }
    }
  }
  const shotsDir = path.join(baselineDir, 'shots');
  fs.mkdirSync(shotsDir, {recursive: true});

  const promoted = [];
  for (const key of keys) {
    const source = path.join(captureDir, 'shots', `${key}.png`);
    if (!fs.existsSync(source)) continue;
    fs.copyFileSync(source, path.join(shotsDir, `${key}.png`));
    manifest.shots[key] = currentManifest.shots[key];
    promoted.push(key);
  }

  const pruned = [];
  for (const key of prune) {
    const target = path.join(shotsDir, `${key}.png`);
    if (fs.existsSync(target)) fs.rmSync(target);
    if (manifest.shots[key]) {
      delete manifest.shots[key];
      pruned.push(key);
    }
  }

  manifest.version = 1;
  manifest.platform = currentManifest.platform;
  manifest.browser = currentManifest.browser;
  manifest.viewport = currentManifest.viewport;
  manifest.capturedAt = currentManifest.capturedAt;
  manifest.context = currentManifest.context ?? null;
  manifest.decisions = [
    ...(manifest.decisions ?? []),
    {
      at: new Date().toISOString(),
      actor,
      runId,
      reason: reason.trim(),
      promoted,
      pruned,
    },
    // A decision log that grows without bound is a decision log nobody reads.
  ].slice(-200);

  writeBaseline(baselineDir, manifest);
  return {promoted, pruned, manifest};
}
