// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input The canonical CI visual-pr-report artifact and trusted run identity.
 * @output Escaped HTML, bounded verdict JSON, and re-encoded report PNGs.
 * @position Publication only: never captures, compares, accepts, or promotes.
 *
 * PR artifacts are report data, not trusted code or baseline-write authority.
 * Rebuild HTML with the default-branch renderer; never copy artifact HTML.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {canonicalizePng} from './lib/canonical-png.mjs';
import {renderReport} from './lib/report.mjs';

const KEY = /^(?!\.+$)[A-Za-z0-9._-]{1,240}$/;
const SHA = /^[0-9a-f]{40}$/;
const LIMIT = 10_000;

function refuse(message) {
  throw new Error(`visual report rejected: ${message}`);
}

// Rerunning only the failed jobs keeps the artifacts of the jobs that passed,
// so the report can come from an earlier attempt of the same run, never a
// later one.
function attemptBelongsToRun(artifactAttempt, reportedAttempt) {
  const artifact = Number(artifactAttempt);
  return (
    Number.isSafeInteger(artifact) &&
    artifact > 0 &&
    artifact <= Number(reportedAttempt)
  );
}

function text(value = '') {
  if (typeof value !== 'string' || value.length > 4000)
    refuse('invalid report text');
  return value;
}

function number(value, max = LIMIT) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  ) {
    refuse('invalid report number');
  }
  return value;
}

function list(value = []) {
  if (!Array.isArray(value) || value.length > LIMIT)
    refuse('invalid report list');
  return value;
}

function key(value) {
  if (typeof value !== 'string' || !KEY.test(value)) refuse('invalid shot key');
  return value;
}

function artifactFile(input, relative, maxBytes) {
  const file = path.join(input, relative);
  const stat = fs.lstatSync(file);
  const resolved = fs.realpathSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !resolved.startsWith(`${fs.realpathSync(input)}${path.sep}`) ||
    stat.size === 0 ||
    stat.size > maxBytes
  ) {
    refuse(`invalid artifact file: ${relative}`);
  }
  return fs.readFileSync(file);
}

function copyPng(input, output, kind, shotKey) {
  const bytes = artifactFile(
    input,
    `report/${kind}/${shotKey}.png`,
    12 * 1024 * 1024,
  );
  // Bound dimensions before decoding an untrusted PNG into memory.
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(signature) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    refuse('invalid PNG header');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (
    !width ||
    !height ||
    width > 5000 ||
    height > 10000 ||
    width * height > 25_000_000
  ) {
    refuse('invalid PNG dimensions');
  }
  const image = canonicalizePng(bytes);
  fs.mkdirSync(path.join(output, kind), {recursive: true});
  fs.writeFileSync(path.join(output, kind, `${shotKey}.png`), image.bytes);
}

export function publishPrReport({
  input,
  output,
  headSha,
  baseSha,
  runId,
  runAttempt,
}) {
  if (
    !SHA.test(headSha) ||
    (baseSha && !SHA.test(baseSha)) ||
    !/^[1-9]\d*$/.test(String(runId)) ||
    !/^[1-9]\d*$/.test(String(runAttempt))
  ) {
    refuse('invalid trusted run identity');
  }
  const raw = JSON.parse(artifactFile(input, 'verdict.json', 2 * 1024 * 1024));
  if (
    raw.version !== 1 ||
    !['pass', 'changed', 'failed', 'skipped'].includes(raw.status)
  ) {
    refuse('invalid verdict');
  }
  if (
    raw.context?.headSha !== headSha ||
    !SHA.test(raw.context?.baseSha) ||
    (baseSha && raw.context.baseSha !== baseSha) ||
    String(raw.context?.runId) !== String(runId) ||
    !attemptBelongsToRun(raw.context?.runAttempt, runAttempt) ||
    !SHA.test(raw.context?.sha)
  ) {
    refuse('artifact does not match the exact CI head/base/run/attempt');
  }
  const counts = Object.fromEntries(
    ['total', 'unchanged', 'changed', 'added', 'removed', 'failed'].map(
      name => [name, number(raw.counts?.[name])],
    ),
  );
  const changes = list(raw.changes).map(change => ({
    key: key(change.key),
    ...Object.fromEntries(
      ['component', 'title', 'name', 'theme', 'mode'].map(name => [
        name,
        text(change[name]),
      ]),
    ),
    diffPixels: number(change.diffPixels, 25_000_000),
    diffRatio: number(change.diffRatio, 1),
    sizeChanged: change.sizeChanged === true,
    reasons: list(change.reasons).map(text),
  }));
  const verdict = {
    version: 1,
    status: raw.status,
    generatedAt: text(raw.generatedAt),
    platform: text(raw.platform),
    reason: text(raw.reason),
    context: {
      sha: raw.context.sha,
      headSha,
      // Without a caller-supplied base, this is the base the CI run recorded.
      // It is report data, never acceptance or baseline-write authority.
      baseSha: baseSha || raw.context.baseSha,
      runId: String(runId),
      // The attempt that produced this evidence, which can precede the
      // reported attempt after a rerun of only the failed jobs.
      runAttempt: String(raw.context.runAttempt),
    },
    baseline: {sha: text(raw.baseline?.sha ?? '')},
    counts,
    changes,
    added: list(raw.added).map(key),
    removed: list(raw.removed).map(key),
    failures: list(raw.failures).map(failure => ({
      key: text(failure.key),
      error: text(failure.error),
    })),
    targeting: {
      unexercisedOverrides: list(raw.targeting?.unexercisedOverrides).map(
        item => ({
          theme: text(item.theme),
          key: text(item.key),
          selector: text(item.selector),
        }),
      ),
      uncoveredTargets: list(raw.targeting?.uncoveredTargets).map(text),
      undeclaredTargets: list(raw.targeting?.undeclaredTargets).map(text),
    },
  };
  if (
    counts.changed !== changes.length ||
    counts.added !== verdict.added.length ||
    counts.removed !== verdict.removed.length ||
    counts.failed !== verdict.failures.length
  ) {
    refuse('verdict counts do not match its report entries');
  }
  const images = [
    ...changes.flatMap(change =>
      ['before', 'after', 'diff'].map(kind => [kind, change.key]),
    ),
    ...verdict.added.map(shotKey => ['after', shotKey]),
    ...verdict.removed.map(shotKey => ['before', shotKey]),
  ];
  if (images.length > LIMIT) refuse('too many report images');
  fs.rmSync(output, {recursive: true, force: true});
  fs.mkdirSync(output, {recursive: true});
  for (const [kind, shotKey] of images) copyPng(input, output, kind, shotKey);
  fs.writeFileSync(
    path.join(output, 'verdict.json'),
    `${JSON.stringify(verdict, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(output, 'index.html'),
    renderReport(verdict, {
      acceptHint:
        'Record the visual review on the pull request. Baseline maintenance is an explicit CI dispatch, not a release gate.',
      oneSidedEvidence: true,
    }),
  );
  return verdict;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = name => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
  };
  publishPrReport({
    input: path.resolve(flag('input')),
    output: path.resolve(flag('output')),
    headSha: flag('head-sha'),
    baseSha: flag('base-sha'),
    runId: flag('run-id'),
    runAttempt: flag('run-attempt'),
  });
}
