#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * CLI smoke test — auto-discovers every command and checks for output + clean exit.
 *
 * Nothing is hardcoded. Components are discovered from `astryx component --list`,
 * doc topics from `astryx docs`, and detail levels from `astryx --help`.
 *
 * Catches regressions like:
 *   - astryx component <name> crashing on bad imports
 *   - astryx docs returning empty content
 *   - any command exiting non-zero
 *
 * The several hundred component and doc commands run in a pool, one per CPU,
 * and report in order: run one at a time they took ten minutes on CI.
 *
 * Usage:
 *   node .github/scripts/cli-smoke-test.mjs
 *
 * Exit code 0 = all commands passed
 * Exit code 1 = one or more commands failed
 */

import {spawn, spawnSync} from 'node:child_process';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'packages/cli/clients/cli/bin/astryx.mjs');

let passed = 0;
let failed = 0;
const failures = [];

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
    timedOut: result.signal === 'SIGTERM',
  };
}

/** One CLI command, asynchronously, with the same timeout as `run`. */
function runAsync(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [CLI, ...args], {cwd: ROOT});
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, 30_000);
    child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk));
    child.on('close', status => {
      clearTimeout(timer);
      resolve({stdout, stderr, status: status ?? 1, timedOut});
    });
  });
}

// Checks queue in order; `flush` runs them in a pool and reports in order.
const queue = [];
function check(label, args, options = {}) {
  queue.push({label, args, options});
}
function section(title) {
  queue.push({title});
}

async function flush() {
  const results = new Array(queue.length);
  let next = 0;
  const workers = Array.from({length: Math.max(1, os.availableParallelism())}, async () => {
    while (next < queue.length) {
      const index = next++;
      const item = queue[index];
      results[index] = item.title ? null : await runAsync(item.args);
    }
  });
  await Promise.all(workers);
  queue.forEach((item, index) => {
    if (item.title) console.log(item.title);
    else report(item.label, results[index], item.options);
  });
  queue.length = 0;
}

function report(label, result, {minLength = 10} = {}) {
  const {stdout, stderr, status, timedOut} = result;
  const output = (stdout + stderr).trim();

  let reason = null;
  if (timedOut) reason = 'timed out';
  else if (status !== 0) {
    if (output.includes('needs a typed doc file')) {
      console.log(`  skip  ${label}  (no .doc.mjs — undocumented component)`);
      passed++;
      return;
    }
    reason = `exit ${status}`;
  }
  else if (output.length < minLength) reason = `output too short (${output.length} chars, need ${minLength})`;

  if (reason) {
    console.log(`  FAIL  ${label}  (${reason})`);
    if (stderr.trim()) {
      console.log(`        ${stderr.trim().split('\n')[0]}`);
    }
    failures.push({label, reason});
    failed++;
  } else {
    console.log(`  ok    ${label}`);
    passed++;
  }
}

// ---------------------------------------------------------------------------
// 1. Discover detail levels from --help
// ---------------------------------------------------------------------------
const helpOutput = run(['--help']).stdout;
const detailMatch = helpOutput.match(/full, compact, brief|full\|compact\|brief/);
const DETAIL_LEVELS = detailMatch
  ? detailMatch[0].split(/[,|]\s*/).map(s => s.trim())
  : ['brief', 'compact', 'full'];

console.log(`detail levels: ${DETAIL_LEVELS.join(', ')}`);

// Parse a command's --json envelope. The JSON output is the CLI's source of
// truth; the human text is a projection, so discovery must not scrape it.
function runJson(args) {
  const {stdout} = run(args);
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Discover components from astryx component --list --json
// ---------------------------------------------------------------------------
section('\ncomponent listing');
check('astryx component --list', ['component', '--list']);
// Run before discovery, so a CLI that cannot start shows its error first.
await flush();

// data.components is a map of category/group key -> [{name, package}, ...].
const listData = runJson(['component', '--list', '--json'])?.data;
const componentGroups =
  /** @type {Record<string, Array<{name: string}>>} */ (listData?.components ?? {});
const componentNames = Object.values(componentGroups)
  .flat()
  .map(entry => entry.name);

console.log(`discovered ${componentNames.length} components`);

if (componentNames.length === 0) {
  console.log('\nFATAL: no components discovered from --list --json output. Aborting.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Categories are the group keys of the component map (valid --category args)
// ---------------------------------------------------------------------------
const categories = Object.keys(componentGroups);

console.log(`discovered ${categories.length} categories: ${categories.join(', ')}`);

// ---------------------------------------------------------------------------
// 4. Discover doc topics from astryx docs --json
// ---------------------------------------------------------------------------
const docsData = runJson(['docs', '--json'])?.data;
const docTopics =
  /** @type {Array<{topic: string}>} */ (Array.isArray(docsData) ? docsData : [])
    .map(entry => entry.topic);

console.log(`discovered ${docTopics.length} doc topics: ${docTopics.join(', ')}`);

// ---------------------------------------------------------------------------
// 5. Run all checks
// ---------------------------------------------------------------------------

// component --list with each detail level
for (const detail of DETAIL_LEVELS) {
  check(`astryx component --list --detail ${detail}`, ['component', '--list', '--detail', detail]);
}

// component --category for each category
section(`\ncomponent --category (${categories.length} categories)`);
for (const cat of categories) {
  check(`astryx component --category ${cat}`, ['component', '--category', cat]);
}

// component docs: every component x every detail level
section(`\ncomponent docs (${componentNames.length} components x ${DETAIL_LEVELS.length} detail levels)`);
for (const name of componentNames) {
  for (const detail of DETAIL_LEVELS) {
    check(`astryx component ${name} --detail ${detail}`, ['component', name, '--detail', detail]);
  }
}

// component --props for every component
section(`\ncomponent --props (${componentNames.length} components)`);
for (const name of componentNames) {
  check(`astryx component ${name} --props`, ['component', name, '--props']);
}

// docs for each topic
section('\ndocs');
check('astryx docs (no args)', ['docs']);
for (const topic of docTopics) {
  check(`astryx docs ${topic}`, ['docs', topic]);
}

// ---------------------------------------------------------------------------
// 6. Summary
// ---------------------------------------------------------------------------
await flush();

console.log(`\n${passed + failed} checks total: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\nFailed commands:');
  for (const f of failures) {
    console.log(`  - ${f.label}: ${f.reason}`);
  }
  process.exit(1);
}
