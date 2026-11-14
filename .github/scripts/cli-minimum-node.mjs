// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's declared minimum Node, and the one issue that reports a run
 *   on it.
 * @input `minimum --package <package.json>` prints the lowest Node version its
 *   `engines.node` range allows. `reportIssue` takes actions/github-script's
 *   `github` and `context`, whether the run passed, the version and the run
 *   link.
 * @output The version on stdout (exit 1 when the range has no lower bound this
 *   reads); an issue opened, commented on or closed.
 * @position .github/workflows/cli-minimum-node.yml: the daily main-only run of
 *   the CLI's tests and global-mode smoke on that version. The version comes
 *   from the CLI's own `engines.node`, not from .nvmrc, which names the
 *   version the rest of CI uses.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ISSUE_TITLE = 'CLI fails on its minimum Node';
const BOT = 'github-actions[bot]';

function parseVersion(text) {
  const match = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(text);
  if (!match) return null;
  const part = value =>
    value == null || value === 'x' || value === '*' ? 0 : Number(value);
  return [Number(match[1]), part(match[2]), part(match[3])];
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The lowest version a semver range allows: the least lower bound across its
 * `||` alternatives. A bound is `>=X`, `^X`, `~X`, `=X`, `X` or `X - Y`. A range
 * with an alternative that has no such bound throws, so the job fails rather
 * than testing a guessed version.
 */
export function minimumVersion(range) {
  if (typeof range !== 'string' || range.trim() === '') {
    throw new Error('engines.node is missing');
  }
  let lowest = null;
  for (const raw of range.split('||')) {
    const alternative = raw.trim();
    let bound = null;
    const hyphen = /^(\S+)\s+-\s+\S+$/.exec(alternative);
    const lowerBounds = hyphen
      ? [hyphen[1]]
      : alternative
          .split(/\s+/)
          .filter(token => token !== '' && !token.startsWith('<'))
          .map(token => {
            if (token.startsWith('>') && !token.startsWith('>=')) {
              throw new Error(
                `engines.node "${range}": an exclusive bound (${token}) has no lowest version`,
              );
            }
            return token.replace(/^(>=|\^|~|=)/, '');
          });
    for (const text of lowerBounds) {
      const version = parseVersion(text);
      if (version == null) {
        throw new Error(`engines.node "${range}": cannot read "${text}"`);
      }
      // Within one alternative every bound holds, so the highest one is its floor.
      if (bound == null || compare(version, bound) > 0) bound = version;
    }
    if (bound == null) {
      throw new Error(
        `engines.node "${range}" has an alternative with no lower bound: "${alternative}"`,
      );
    }
    if (lowest == null || compare(bound, lowest) < 0) lowest = bound;
  }
  return lowest.join('.');
}

async function findOpenIssue(github, context) {
  const {data} = await github.rest.search.issuesAndPullRequests({
    q: `repo:${context.repo.owner}/${context.repo.repo} is:issue is:open in:title "${ISSUE_TITLE}"`,
  });
  return (
    data.items.find(
      item => item.title === ISSUE_TITLE && item.user?.login === BOT,
    ) ?? null
  );
}

/**
 * A failed run opens the issue, or comments on the open one; a passing run
 * closes an open issue this job opened. Returns what it did.
 */
/**
 * Each leg's verdict from the files the CLI test legs upload
 * (`{"shard": <n>, "verdict": "pass" | "fail" | "none"}`): "none" for a leg
 * with no file, which the job limit cancelled before it could write one.
 * @param {string} dir
 * @param {number} count legs
 * @returns {Array<'pass' | 'fail' | 'none'>}
 */
export function readLegVerdicts(dir, count) {
  const verdicts = Array.from({length: count}, () => 'none');
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    // No verdict was uploaded at all.
  }
  for (const name of names) {
    try {
      const {shard, verdict} = JSON.parse(
        fs.readFileSync(path.join(dir, name), 'utf8'),
      );
      if (
        Number.isInteger(shard) &&
        shard >= 1 &&
        shard <= count &&
        ['pass', 'fail', 'none'].includes(verdict)
      )
        verdicts[shard - 1] = verdict;
    } catch {
      // An unreadable file leaves that leg without a verdict.
    }
  }
  return verdicts;
}

/** How far past its minimum-Node record a file may run before it is named. */
export const SLOW_RATIO = 1.5;
/** Seconds past its record a file must also run before it is named. */
export const SLOW_MARGIN_S = 10;

/**
 * The files that ran past their minimum-Node record: more than SLOW_RATIO
 * times it and more than SLOW_MARGIN_S over it, slowest past it first. A
 * file the record lacks is not judged.
 * @param {Record<string, number>} times seconds per test file, this run
 * @param {Record<string, number>} recorded seconds per test file, the record
 * @returns {{file: string, recorded: number, measured: number}[]}
 */
export function slowFiles(times, recorded) {
  return Object.entries(times)
    .filter(([file, seconds]) => {
      const before = recorded[file];
      return (
        typeof before === 'number' &&
        seconds > before * SLOW_RATIO &&
        seconds - before > SLOW_MARGIN_S
      );
    })
    .map(([file, measured]) => ({file, recorded: recorded[file], measured}))
    .sort((a, b) => b.measured - b.recorded - (a.measured - a.recorded));
}

/**
 * The record with this run's times in it: each measured file takes its new
 * time, and every other file keeps its own.
 * @param {{seconds?: Record<string, number>}} record
 * @param {Record<string, number>} times
 */
export function refreshRecord(record, times) {
  const seconds = {...record.seconds, ...times};
  return {
    ...record,
    seconds: Object.fromEntries(
      Object.entries(seconds).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

/**
 * Every leg's per-file times, as one map, from the files the legs upload:
 * each artifact downloads into its own folder under `dir`.
 * @param {string} dir
 * @returns {Record<string, number>}
 */
export function readLegTimes(dir) {
  const times = {};
  let files = [];
  try {
    files = fs
      .readdirSync(dir, {recursive: true, withFileTypes: true})
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => path.join(entry.parentPath ?? entry.path, entry.name));
  } catch {
    // No leg uploaded its times.
  }
  for (const file of files) {
    try {
      Object.assign(times, JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      // An unreadable file adds no times.
    }
  }
  return times;
}

/** A job's result as a verdict: only success passes and only failure fails. */
const jobVerdict = result =>
  result === 'success' ? 'pass' : result === 'failure' ? 'fail' : 'none';

/**
 * The run's verdict: "fail" when any part failed a check, else "none" when
 * any part judged nothing (stopped, cancelled or skipped), else "pass".
 * @param {{version: string, legs: Array<'pass' | 'fail' | 'none'>, pack: string, smoke: string}} parts
 * @returns {'pass' | 'fail' | 'none'}
 */
export function runVerdict({version, legs, pack, smoke}) {
  if (version !== 'success') return 'none';
  const all = [...legs, jobVerdict(pack), jobVerdict(smoke)];
  if (all.includes('fail')) return 'fail';
  return all.includes('none') ? 'none' : 'pass';
}

export async function reportIssue({github, context, verdict, version, runUrl}) {
  const issue = await findOpenIssue(github, context);
  // No verdict neither closes the issue nor says the CLI failed.
  if (verdict === 'none') {
    if (!issue) return 'none';
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: issue.number,
      body: `No verdict on Node ${version}: part of the run stopped or was cancelled at its time limit before it judged anything ([run](${runUrl})). This issue stays as it is.`,
    });
    return 'no verdict noted';
  }
  if (verdict === 'pass') {
    if (!issue) return 'none';
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: issue.number,
      body: `The CLI's tests and global-mode smoke pass on Node ${version} again: [run](${runUrl}).`,
    });
    await github.rest.issues.update({
      ...context.repo,
      issue_number: issue.number,
      state: 'closed',
      state_reason: 'completed',
    });
    return 'closed';
  }
  const note = `The CLI's tests or global-mode smoke failed on Node ${version}, the minimum its \`engines.node\` declares: [run](${runUrl}).`;
  if (issue) {
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: issue.number,
      body: note,
    });
    return 'commented';
  }
  await github.rest.issues.create({
    ...context.repo,
    title: ISSUE_TITLE,
    body: `${note}\n\nThis issue closes once a daily run passes on that version again.`,
  });
  return 'created';
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [, , command, flag, file, recordFlag, recordFile] = process.argv;
  if (command === 'slow' && flag === '--times' && recordFlag === '--record') {
    // One leg's files past their minimum-Node record: a warning each, and a
    // line in the step summary. Never a failure.
    let times = {};
    try {
      times = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      console.log(`No per-file times at ${file}.`);
      process.exit(0);
    }
    const recorded =
      JSON.parse(fs.readFileSync(recordFile, 'utf8')).seconds ?? {};
    const slow = slowFiles(times, recorded);
    for (const {file: test, recorded: before, measured} of slow)
      console.log(
        `::warning file=${test},title=Past its minimum-Node time::${test} ran ${measured} s; ${recordFile} records ${before} s.`,
      );
    if (slow.length && process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### Files past their minimum-Node time\n\n${slow.map(({file: test, recorded: before, measured}) => `- \`${test}\`: ${measured} s (recorded ${before} s)`).join('\n')}\n`,
      );
    if (!slow.length)
      console.log('Every file ran within its minimum-Node time.');
    process.exit(0);
  }
  if (command !== 'minimum' || flag !== '--package' || !file) {
    console.error(
      'usage: cli-minimum-node.mjs minimum --package <package.json>\n       cli-minimum-node.mjs slow --times <file> --record <file>',
    );
    process.exit(2);
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(minimumVersion(pkg.engines?.node));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
