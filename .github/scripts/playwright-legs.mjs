#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright-legs.mjs
 * @description Splits the spec files of one Playwright suite into legs of
 *   about equal running time, from the per-file times a CI run recorded
 *   (spec:AST-030 FR13).
 * @input `select`: the listed spec files, the changed files, the shared-code
 *   pattern and the suite's own path filters. `select-chromium`: the listed
 *   files, the changed files, the lane's scope, the classifier's full-suite
 *   decision, a source tree for the import graph and the selection file. `legs`: the suite's times key,
 *   its path filters, the changed files, a leg's setup time and time limit. `plan`: the suite's times key, its
 *   config and project, this leg and the leg count, and any Playwright path
 *   filters; `.github/playwright-leg-durations.json`. `record`: CI job logs
 *   of the list reporter.
 * @output `select`: the path filters and spec files a WebKit run covers, one
 *   per line. `select-chromium`: the Chromium run's selection as JSON, and its
 *   summary. `legs`: `count=<legs>`, `runs=<true|false>` and the `leg=<i>` this
 *   leg plans, for `$GITHUB_OUTPUT`.
 *   `plan`: this leg's spec files, one per line, for Playwright's
 *   `--test-list`, and `files=<count>` for `$GITHUB_OUTPUT`. `record`: the
 *   durations file, rewritten for the suite.
 * @position The pr-interaction, pr-interaction-webkit and docsite-browser
 *   legs in ci.yml.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  costOf,
  medianOf,
  splitByDuration,
} from '../../scripts/lib/duration-split.mjs';
import {
  componentFolderOf,
  importerGraph,
  isComponentPath,
  listedFiles,
  proofImporters,
  renderingFolders,
  specOwners,
} from './a11y-pr-contracts.mjs';

// CI may run this file from the workflow's own commit, outside the checkout,
// in the checkout's root.
const ROOT = process.cwd();
export const DURATIONS = path.join(
  ROOT,
  '.github/playwright-leg-durations.json',
);

/**
 * Splits `files` into `legs` lists of about equal estimated time, with the
 * shared duration splitter: slowest first, each onto the leg with the least
 * time so far. A file with no recorded time counts the median recorded time.
 * Every file lands in exactly one leg.
 */
export function planLegs(files, durations, legs) {
  if (!Number.isInteger(legs) || legs < 1)
    throw new Error(`legs must be a positive integer, got ${legs}`);
  const unique = [...new Set(files)];
  const cost = costOf(unique, durations ?? {});
  return splitByDuration(unique, legs, cost).map(leg => ({
    files: leg,
    seconds: leg.reduce((sum, file) => sum + cost(file), 0),
  }));
}

/**
 * A note that the proofs need the last leg the matrix allows, with the room
 * left before it is full; null while a whole leg of room remains, and null
 * past the ceiling, which `legsFitMessage` reports.
 */
export function nearCeilingMessage({
  seconds,
  setupSeconds,
  maxSeconds,
  maxLegs,
}) {
  const needed = legsNeeded({seconds, setupSeconds, maxSeconds});
  if (needed !== maxLegs) return null;
  const room = Math.round(maxLegs * (maxSeconds - setupSeconds) - seconds);
  return `${Math.round(seconds)} s of proofs need ${needed} of the ${maxLegs} legs; ${room} s of room is left before the ceiling`;
}

/**
 * Why a suite's proofs do not fit its matrix, or null when they do: the leg
 * count the planner takes for `seconds` must be no more than `maxLegs`, and
 * every leg it plans, with its setup, within `maxSeconds` plus `slackSeconds`
 * (one spec cannot be split across legs). The message names the heaviest
 * specs, which are where the time goes.
 */
export function legsFitMessage({
  seconds,
  files,
  costs,
  setupSeconds,
  maxSeconds,
  maxLegs,
  slackSeconds = 60,
}) {
  const needed = legsNeeded({seconds, setupSeconds, maxSeconds});
  const legs = legCount({seconds, setupSeconds, maxSeconds, maxLegs});
  const planned = planLegs(files, costs, legs);
  const longest = Math.max(0, ...planned.map(leg => leg.seconds));
  if (needed <= maxLegs && longest + setupSeconds <= maxSeconds + slackSeconds)
    return null;
  const heaviest = [...new Set(files)]
    .map(file => [file, costs[file] ?? 0])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 5)
    .map(([file, cost]) => `${file} (${Math.round(cost)} s)`)
    .join(', ');
  return (
    `${Math.round(seconds)} s of proofs need ${needed} legs of ${Math.round(maxSeconds - setupSeconds)} s; ` +
    `the matrix has ${maxLegs}, and its longest leg takes ${Math.round(longest + setupSeconds)} s with setup. ` +
    `Heaviest specs: ${heaviest}`
  );
}

/**
 * The seconds a suite's proofs take: each listed spec file a filter selects
 * (every listed spec with no filter), and each changed spec, at its recorded
 * time. A spec with no time of its own counts its time in `fallback`
 * (another browser's); else its test count (`testsOf`) times the suite's mean
 * time a test (`perTest`); else the median time a file.
 */
export function estimateSeconds(
  times,
  filters,
  {listed = [], changed = [], fallback = {}, testsOf = () => 0, perTest} = {},
) {
  // No filter: the suite plans every listed spec.
  const files = new Set(
    filters.length === 0
      ? listed
      : listed.filter(file => filters.some(filter => file.includes(filter))),
  );
  // A changed spec the merge commit no longer holds (deleted, or renamed
  // from) runs nowhere and costs nothing.
  const present = new Set(listed);
  for (const file of changed) if (present.has(file)) files.add(file);
  const median = medianOf(Object.values(times));
  let seconds = 0;
  for (const file of files) {
    const tests =
      times[file] == null && fallback[file] == null && perTest > 0
        ? testsOf(file)
        : 0;
    seconds +=
      times[file] ?? fallback[file] ?? (tests > 0 ? tests * perTest : median);
  }
  return seconds;
}

/**
 * Reads a spec's test count from the repository at `source`'s HEAD. A spec
 * that cannot be read stops the leg: one leg guessing while another reads
 * would count different legs and leave a share of the proofs to no leg.
 */
export function testsReader(source) {
  return file => {
    if (!source) return 0;
    let text;
    try {
      text = execFileSync('git', ['-C', source, 'show', `HEAD:${file}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error(
        `cannot read ${file} from ${source} to count its tests: ${String(error.stderr ?? error.message).trim()}`,
      );
    }
    return countTests(text);
  };
}

/**
 * The test counts the leg count read, from the file it wrote. A spec it did
 * not count has none.
 */
function testsFrom(file) {
  const counts =
    file && fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : {};
  return spec => counts[spec] ?? 0;
}

/**
 * Each file's seconds for the split: its recorded time, else its time in
 * `fallback`, else its test count times `perTest`. A file with none of them
 * is left out, so the splitter counts it at the median.
 */
export function costsFor(
  files,
  times,
  {fallback = {}, testsOf = () => 0, perTest} = {},
) {
  const costs = {};
  for (const file of files) {
    const tests =
      times[file] == null && fallback[file] == null && perTest > 0
        ? testsOf(file)
        : 0;
    const cost =
      times[file] ??
      fallback[file] ??
      (tests > 0 ? tests * perTest : undefined);
    if (cost != null) costs[file] = cost;
  }
  return costs;
}

// A test declaration at the start of a line: test(), test.only() and the
// like, not test.describe() or test.use().
const TEST_CALL = /^\s*(?:test|it)(?:\.(?:only|skip|fixme|fail|slow))?\s*\(/gm;

/** How many tests a spec file declares; a test inside a loop counts once. */
export function countTests(source) {
  return (source.match(TEST_CALL) ?? []).length;
}

/** The mean seconds a test, over every test of every log. */
function meanTestSeconds(texts, project, strip) {
  let seconds = 0;
  let tests = 0;
  for (const text of texts)
    for (const each of Object.values(recordLog(text, project, strip, true))) {
      seconds += each.seconds;
      tests += each.tests;
    }
  return tests > 0 ? Math.round((seconds / tests) * 100) / 100 : undefined;
}

/**
 * The legs whose share of the proofs, each beside its setup, fits
 * `maxSeconds`, with no ceiling.
 */
export function legsNeeded({seconds, setupSeconds, maxSeconds}) {
  return Math.ceil(seconds / (maxSeconds - setupSeconds));
}

/**
 * The fewest legs, at most `maxLegs`, in which each leg's setup and share of
 * the proofs fits `maxSeconds`. One leg while the whole estimate fits.
 */
export function legCount({seconds, setupSeconds, maxSeconds, maxLegs}) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error(`the proofs' estimate is not a time: ${seconds}`);
  if (!(maxSeconds > setupSeconds) || !(maxLegs >= 1))
    throw new Error(
      'a leg needs more time than its setup, and one leg at least',
    );
  const needed = legsNeeded({seconds, setupSeconds, maxSeconds});
  return Math.min(maxLegs, Math.max(1, needed));
}

/**
 * Whether a file is an interaction proof spec, as playwright.interaction
 * .config.ts matches them: any `*.interaction.browser.spec.ts`, and the
 * gesture system's own `*.browser.spec.ts` proofs.
 */
export function isInteractionSpec(file) {
  return (
    file.endsWith('.interaction.browser.spec.ts') ||
    /^packages\/core\/src\/gestures\/__tests__\/browser\/[^/]+\.browser\.spec\.ts$/.test(
      file,
    )
  );
}

// The component folder a path is in: `packages/<package>/src/<Component>`.
// Shared folders (`motion`, `hooks`, `utils`) are not component folders: the
// lane's shared-code pattern decides what their changes run.
// Files that put no code on a proof's page: tests, stories, docs, notes.
const NOT_RENDERED = /(?:^|\/)__tests__\/|\.(?:test|stories|doc)\.[^/]+$|\.md$/;

/**
 * The interaction specs in each component folder whose code a change
 * reaches: a changed file in `packages/<package>/src/<Component>/` that puts
 * code on a page selects every listed interaction spec under that folder.
 * @param {string[]} listed every file of the tree
 * @param {string[]} changed the changed files
 */
export function folderSpecs(listed, changed) {
  // A component folder as the accessibility contracts read it.
  const folderOf = file => specOwners(file).prefixes;
  const folders = new Set(
    changed
      .filter(
        file =>
          isComponentPath(file) &&
          !NOT_RENDERED.test(file) &&
          !isInteractionSpec(file),
      )
      .flatMap(folderOf),
  );
  return listed
    .filter(
      file =>
        isInteractionSpec(file) &&
        folderOf(file).some(folder => folders.has(folder)),
    )
    .sort();
}

/**
 * What a WebKit run covers for a change. The suite's own path filters run
 * when the change touches shared code (`shared`); every interaction spec the
 * change edits runs; and so does every spec in a folder whose code it changes.
 * An unknown change (no file list) runs the suite's own filters only.
 * @param {{listed: string[], changed: string[] | null, shared: RegExp, filters: string[]}} options
 */
export function selectProofs({listed, changed, shared, filters}) {
  if (changed == null) return [...filters];
  const out = new Set();
  if (changed.some(file => shared.test(file)))
    for (const filter of filters) out.add(filter);
  for (const file of changed) if (isInteractionSpec(file)) out.add(file);
  for (const file of folderSpecs(listed, changed)) out.add(file);
  return [...out];
}

/** What a proof's page loads: the specs, the stories they open, the preview. */
export const isProofPage = file =>
  isInteractionSpec(file) ||
  /\.stories\.[cm]?[jt]sx?$/.test(file) ||
  file === 'apps/storybook/.storybook/preview.tsx';

/**
 * What a Chromium interaction run covers for a pull request (spec:AST-030
 * FR31): `{full: true, reason}` for the whole suite, or `{full: false, specs,
 * touched, dependents}`. It runs every interaction spec the change adds or
 * edits, every spec that loads a changed file through its own imports, and
 * every spec in the component folders the change touches and in the folders
 * that render them through value imports. A story maps to no component, so a
 * changed story runs the whole suite. The lane's scope leaves out a
 * component folder's unit tests, docs, records and accessibility specs, and
 * `ci-interaction-scope.test.mjs` keeps every proof page from loading one. It
 * fails closed: an unknown change, a
 * missing import graph or proof import map, a full-suite classification, a
 * shared path, a listed shared primitive, or a changed path that maps to no
 * one component runs the whole suite.
 * @param {object} options
 * @param {string[]} options.listed every file of the tree
 * @param {string[] | null} options.changed the changed files
 * @param {RegExp} options.scope the lane's paths; other changes add nothing
 * @param {boolean} options.fullSuite the classifier found shared
 *   infrastructure or could not decide
 * @param {boolean} [options.everySpec] the release interaction check
 * @param {Map<string, Set<string>> | null} options.importers the import graph
 * @param {Map<string, Set<string>> | null} options.proofs each file a proof
 *   loads, to the proofs that load it (`proofImporters`)
 * @param {{shared: string[], edges: {from: string, specs: string[]}[]}} options.selection
 * @param {string[]} options.primitives shared primitives, as `<pkg>/<Folder>`
 */
export function chromiumSelection({
  listed,
  changed,
  scope,
  fullSuite,
  everySpec = false,
  importers,
  proofs,
  selection,
  primitives,
}) {
  const full = reason => ({full: true, reason});
  if (everySpec) return full('the release interaction check runs every spec');
  if (fullSuite)
    return full('the change touches shared infrastructure or is undecided');
  if (changed == null) return full('the changed files are unknown');
  if (importers == null) return full('the import graph could not be computed');
  if (proofs == null) return full("the proofs' imports could not be followed");
  const present = new Set(listed);
  const specs = new Set();
  const touched = new Set();
  const relevant = changed.filter(file => scope.test(file));
  for (const file of relevant) {
    const loaders = [...(proofs.get(file) ?? [])];
    for (const loader of loaders)
      if (isInteractionSpec(loader)) specs.add(loader);
    if (isInteractionSpec(file)) {
      if (present.has(file)) specs.add(file);
      continue;
    }
    if (selection.shared.some(prefix => file.startsWith(prefix)))
      return full(`${file} is shared code`);
    const folder = componentFolderOf(file);
    if (folder == null) return full(`${file} maps to no component`);
    if (primitives.includes(folder))
      return full(`${file} is in the shared primitive ${folder}`);
    touched.add(folder);
  }
  const dependents = renderingFolders(importers, [...touched]).map(
    ({folder}) => folder,
  );
  const folders = new Set([...touched, ...dependents]);
  for (const file of listed)
    if (isInteractionSpec(file) && folders.has(componentFolderOf(file)))
      specs.add(file);
  // An escape's missed edge: a change under `from` runs `specs` too.
  for (const edge of selection.edges)
    if (relevant.some(file => file.startsWith(edge.from)))
      for (const spec of edge.specs) if (present.has(spec)) specs.add(spec);
  return {
    full: false,
    specs: [...specs].sort(),
    touched: [...touched].sort(),
    dependents,
  };
}

// A suite with one unnamed project prints no `[project]`.
const TEST_LINE =
  /^(\S+Z)\s+\S+\s+\d+\s+(?:\[([\w-]+)\] › )?([^:\s]+):\d+:\d+ › /;
const RUNNING = /Running \d+ tests? using/;

/** Milliseconds of a log line's timestamp; GitHub writes seven fraction digits. */
function stamp(line) {
  return Date.parse(line.split(/\s/, 1)[0].replace(/(\.\d{3})\d*Z$/, '$1Z'));
}

/**
 * Seconds per spec file from a CI job log of the list reporter: each test's
 * time is the gap from the line before it, so a file's time includes its setup.
 * `project` picks one project's lines (none for an unnamed project), and
 * `strip` turns the printed path into the one Playwright lists (relative to
 * the config's test directory).
 */
export function recordLog(text, project, strip = '', counts = false) {
  const seconds = {};
  const tests = {};
  let previous = null;
  for (const line of text.split('\n')) {
    const at = stamp(line);
    if (previous == null && RUNNING.test(line) && Number.isFinite(at)) {
      previous = at;
      continue;
    }
    const match = TEST_LINE.exec(line);
    if (!match || previous == null || match[2] !== (project ?? undefined))
      continue;
    const time = stamp(match[1]);
    const file = match[3].startsWith(strip)
      ? match[3].slice(strip.length)
      : match[3];
    seconds[file] = (seconds[file] ?? 0) + (time - previous) / 1000;
    tests[file] = (tests[file] ?? 0) + 1;
    previous = time;
  }
  return counts
    ? Object.fromEntries(
        Object.entries(seconds).map(([file, value]) => [
          file,
          {seconds: value, tests: tests[file]},
        ]),
      )
    : seconds;
}

function readDurations(file = DURATIONS) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** The spec files Playwright lists for a suite with these extra arguments. */
function list({config, project}, out, extra) {
  // The report goes to a file: a spec's own logging can share stdout.
  const reportFile = `${out}.list.json`;
  execFileSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '--config',
      config,
      ...(project ? ['--project', project] : []),
      '--list',
      '--reporter=json',
      // Playwright exits 1 when nothing matches; `plan` explains that case.
      '--pass-with-no-tests',
      ...extra,
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: path.resolve(reportFile),
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  fs.rmSync(reportFile, {force: true});
  return listedFiles(report);
}

function plan(args) {
  const split = args.indexOf('--');
  const own = split === -1 ? args : args.slice(0, split);
  const filters = split === -1 ? [] : args.slice(split + 1);
  const key = option(own, '--key');
  const suite = {
    config: option(own, '--config'),
    project: option(own, '--project'),
  };
  const leg = Number(option(own, '--leg'));
  const legs = Number(option(own, '--of'));
  const out = option(own, '--out');
  const durations = option(own, '--durations') ?? DURATIONS;
  if (
    !key ||
    !suite.config ||
    !out ||
    !Number.isInteger(leg) ||
    leg < 1 ||
    leg > legs
  ) {
    throw new Error(
      'usage: plan --key <times key> [--fallback-key <times key>] [--tests <file>] --config <file> [--project <name>] --leg <i> --of <n> --out <file> [--durations <file>] [-- <filters...>]',
    );
  }
  const files = list(suite, out, filters);
  if (files.length === 0)
    throw new Error(
      filters.length > 0
        ? `Playwright listed none of the ${key} spec files the selection names at this pull request's head: they were added on main after the branch point. Update the branch to run them.`
        : `Playwright listed no ${key} spec files`,
    );
  const recorded = readDurations(durations);
  // The same costs the leg count used, so the split matches its estimate.
  const legsPlan = planLegs(
    files,
    costsFor(files, recorded[key] ?? {}, {
      fallback: recorded[option(own, '--fallback-key')] ?? {},
      testsOf: testsFrom(option(own, '--tests')),
      perTest: recorded['seconds-per-test']?.[key],
    }),
    legs,
  );
  const mine = legsPlan[leg - 1];
  fs.writeFileSync(out, mine.files.map(file => `${file}\n`).join(''));
  // Playwright runs nothing, and passes, for a test list that matches no
  // spec, so the leg checks that its list selects exactly its files.
  if (mine.files.length > 0) {
    const selected = list(suite, out, ['--test-list', out]);
    if (selected.join('\n') !== mine.files.join('\n'))
      throw new Error(
        `The ${key} leg's test list selects ${selected.length} spec files, not its ${mine.files.length}`,
      );
  }
  console.log(
    `${key} leg ${leg}/${legs}: ${mine.files.length} of ${files.length} spec files, about ${Math.round(mine.seconds)} s`,
  );
  for (const [i, each] of legsPlan.entries())
    console.log(
      `  leg ${i + 1}: about ${Math.round(each.seconds)} s, ${each.files.length} files`,
    );
  for (const file of mine.files) console.log(`  ${file}`);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `files=${mine.files.length}\n`,
    );
}

function legs(args) {
  const split = args.indexOf('--');
  const own = split === -1 ? args : args.slice(0, split);
  const filters = split === -1 ? [] : args.slice(split + 1);
  const key = option(own, '--key');
  const leg = Number(option(own, '--leg'));
  const limits = {
    setupSeconds: Number(option(own, '--setup-seconds')),
    maxSeconds: Number(option(own, '--max-seconds')),
    maxLegs: Number(option(own, '--max-legs')),
  };
  if (!key || !Number.isInteger(leg) || leg < 1)
    throw new Error(
      'usage: legs --key <times key> --leg <i> --listed <file> [--source <git dir>] [--tests-out <file>] --setup-seconds <s> --max-seconds <s> --max-legs <n> [--fallback-key <times key>] [--durations <file>] [--changed <file>] [-- <filters...>]',
    );
  const specs = file =>
    fs.readFileSync(file, 'utf8').split('\n').filter(isInteractionSpec);
  const listedFile = option(own, '--listed');
  const listed =
    listedFile && fs.existsSync(listedFile) ? specs(listedFile) : [];
  if (listed.length === 0)
    throw new Error(`--listed names no ${key} spec files to count`);
  const changedFile = option(own, '--changed');
  // Each leg counts on its own. A leg without the changed files could count
  // fewer legs than the others and leave a share of the proofs to no leg, so
  // it plans itself as the only leg and runs every proof instead.
  if (
    own.includes('--changed') &&
    !(changedFile && fs.existsSync(changedFile))
  ) {
    console.log(
      `::warning title=Leg count without the changed files::The scope step could not list the changed files, so ${key} leg ${leg} runs every planned proof as a leg of its own.`,
    );
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        'count=1\nruns=true\nleg=1\n',
      );
    return;
  }
  const durations = readDurations(option(own, '--durations') ?? DURATIONS);
  // A spec with no recorded time counts its tests, read from the merge
  // commit (the scope checkout) without a checkout of its own.
  const source = option(own, '--source');
  const read = testsReader(source);
  const counted = {};
  const testsOf = file => (counted[file] = read(file));
  const seconds = estimateSeconds(durations[key] ?? {}, filters, {
    listed,
    changed: changedFile ? specs(changedFile) : [],
    fallback: durations[option(own, '--fallback-key')] ?? {},
    testsOf,
    perTest: durations['seconds-per-test']?.[key],
  });
  // The plan step runs after the head checkout has replaced the scope
  // checkout, so it reads the counts from here.
  const testsOut = option(own, '--tests-out');
  if (testsOut) fs.writeFileSync(testsOut, `${JSON.stringify(counted)}\n`);
  const count = legCount({seconds, ...limits});
  const runs = leg <= count;
  console.log(
    `${key}: about ${Math.round(seconds)} s of proofs and ${limits.setupSeconds} s of setup a leg, so ${count} leg${count === 1 ? '' : 's'} within ${limits.maxSeconds} s; leg ${leg} ${runs ? 'runs' : 'has no share'}`,
  );
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `count=${count}\nruns=${runs}\nleg=${leg}\n`,
    );
}

function select(args) {
  const split = args.indexOf('--');
  const own = split === -1 ? args : args.slice(0, split);
  const filters = split === -1 ? [] : args.slice(split + 1);
  const listedFile = option(own, '--listed');
  const pattern = option(own, '--shared');
  if (!listedFile || !pattern || filters.length === 0)
    throw new Error(
      'usage: select --listed <file> --shared <pattern> [--changed <file>] -- <filters...>',
    );
  const lines = file =>
    fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const changedFile = option(own, '--changed');
  const changed =
    changedFile && fs.existsSync(changedFile) ? lines(changedFile) : null;
  // Without `--changed` every listed path is planned on purpose (the release
  // interaction check); only a list that was meant to be there and is not
  // gets a warning.
  if (own.includes('--changed') && changed == null)
    console.error(
      "::warning title=Changed specs not planned::The scope step could not list the changed files, so only this lane's own paths run here.",
    );
  const selected = selectProofs({
    listed: lines(listedFile),
    changed,
    shared: new RegExp(pattern),
    filters,
  });
  for (const line of selected) console.log(line);
}

/**
 * Reads a file from a checkout, or from its commit when a sparse checkout
 * leaves the file out.
 * @param {string} root
 */
export function checkoutReader(root) {
  return file =>
    fs.existsSync(path.join(root, file))
      ? fs.readFileSync(path.join(root, file), 'utf8')
      : execFileSync('git', ['-C', root, 'show', `HEAD:${file}`], {
          encoding: 'utf8',
          maxBuffer: 1 << 26,
        });
}

function selectChromium(args) {
  const listedFile = option(args, '--listed');
  const scope = option(args, '--scope');
  const selectionFile = option(args, '--selection');
  const primitivesFile = option(args, '--primitives');
  const out = option(args, '--out');
  if (!listedFile || !scope || !selectionFile || !primitivesFile || !out)
    throw new Error(
      'usage: select-chromium --listed <file> --scope <pattern> --selection <file> --primitives <file> --out <file> [--changed <file>] [--root <dir>] [--full-suite true|false] [--every-spec true|false]',
    );
  const lines = file =>
    fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const changedFile = option(args, '--changed');
  const root = option(args, '--root');
  const listed = lines(listedFile);
  let importers = null;
  let proofs = null;
  try {
    if (root) importers = importerGraph(root);
  } catch (error) {
    console.error(`The import graph could not be computed: ${error.message}`);
  }
  if (importers != null && importers.size === 0) importers = null;
  try {
    if (root)
      proofs = proofImporters({
        root,
        listed,
        isProof: isProofPage,
        read: checkoutReader(root),
      });
  } catch (error) {
    console.error(
      `The proofs' imports could not be followed: ${error.message}`,
    );
  }
  const result = chromiumSelection({
    listed,
    changed:
      changedFile && fs.existsSync(changedFile) ? lines(changedFile) : null,
    scope: new RegExp(scope),
    fullSuite: option(args, '--full-suite') !== 'false',
    everySpec: option(args, '--every-spec') === 'true',
    importers,
    proofs,
    selection: JSON.parse(fs.readFileSync(selectionFile, 'utf8')),
    primitives: JSON.parse(fs.readFileSync(primitivesFile, 'utf8')).primitives,
  });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  if (result.full)
    console.log(`Chromium selection: the full suite (${result.reason}).`);
  else {
    console.log(
      `Chromium selection: ${result.specs.length} spec file(s) for ${result.touched.length} touched and ${result.dependents.length} dependent component folder(s).`,
    );
    for (const spec of result.specs) console.log(`  ${spec}`);
  }
}

function record(args) {
  const key = option(args, '--key');
  const project = option(args, '--project');
  const strip = option(args, '--strip') ?? '';
  const valued = new Set(['--key', '--project', '--strip']);
  const logs = args.filter(
    (arg, i) => !arg.startsWith('--') && !valued.has(args[i - 1]),
  );
  if (!key || logs.length === 0)
    throw new Error(
      'usage: record --key <times key> [--project <name>] [--strip <path prefix>] <job log...>',
    );
  const seconds = {};
  const texts = logs.map(log => fs.readFileSync(log, 'utf8'));
  for (const text of texts) {
    for (const [file, value] of Object.entries(
      recordLog(text, project, strip),
    )) {
      seconds[file] = (seconds[file] ?? 0) + value;
    }
  }
  if (Object.keys(seconds).length === 0)
    throw new Error(`no ${key} test lines in the logs`);
  const durations = readDurations();
  // The mean time a test, for a spec that has no recorded time yet.
  durations['seconds-per-test'] = {
    ...durations['seconds-per-test'],
    [key]: meanTestSeconds(texts, project, strip),
  };
  durations[key] = Object.fromEntries(
    Object.entries(seconds)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([file, value]) => [file, Math.round(value * 10) / 10]),
  );
  fs.writeFileSync(DURATIONS, `${JSON.stringify(durations, null, 2)}\n`);
  console.log(
    `${key}: ${Object.keys(seconds).length} spec files recorded into ${path.relative(ROOT, DURATIONS)}`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'select') select(args);
    else if (command === 'select-chromium') selectChromium(args);
    else if (command === 'legs') legs(args);
    else if (command === 'plan') plan(args);
    else if (command === 'record') record(args);
    else
      throw new Error(
        'usage: playwright-legs.mjs select|select-chromium|legs|plan|record ...',
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
