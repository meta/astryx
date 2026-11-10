#!/usr/bin/env node
// Records goldens from the JS CLI: golden/<command>/<id>.json.
//
// Each case runs twice. A case whose two runs differ runs three more times;
// the most complete output is kept, written with "nondeterministic": true and
// listed in golden/NONDETERMINISTIC.json.
//
// Usage: node record.mjs [--command a,b] [--case id] [--jobs n] [--missing] [--once] [--prune]
//
// --prune drops goldens whose case is gone (always on for an unfiltered run).

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import {REPO} from './setup.mjs';
import {comparable, ensureDirs, GOLDEN_DIR, goldenPath, jsBin, loadCases, pool, runCase, sameResult} from './lib.mjs';
import {setup} from './setup.mjs';

const argv = process.argv.slice(2);
const opt = name => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
// The box is shared by many lanes: keep the default small.
const jobs = Number(opt('jobs') ?? 16);
const missingOnly = argv.includes('--missing');
const once = argv.includes('--once');

await setup();
ensureDirs();
const all = loadCases({command: opt('command'), caseId: opt('case')});
// Cases where the JS CLI's own process crashed (killed by a signal, e.g. a
// Node segfault): there is no behavior to match, so they get no golden.
const crashFile = path.join(GOLDEN_DIR, 'JS_CRASHES.json');
const crashes = new Set(fs.existsSync(crashFile) ? JSON.parse(fs.readFileSync(crashFile, 'utf8')) : []);
const items = [];
for (const [command, cases] of Object.entries(all)) {
  for (const c of cases) {
    if (missingOnly && (fs.existsSync(goldenPath(command, c.id)) || crashes.has(`${command}/${c.id}`))) continue;
    items.push({command, c});
  }
}
// A generous timeout: the box is shared, and a timeout is never a golden.
const bin = {...jsBin(), timeoutMs: 120000};
async function runOk(c) {
  let r;
  for (let i = 0; i < 3; i++) {
    r = await runCase(c, bin);
    if (r.exit !== 'timeout') return r;
  }
  return r;
}
let done = 0;
const started = Date.now();
const flaky = [];
await pool(
  items,
  jobs,
  async ({command, c}) => {
    let a = await runOk(c);
    let nondeterministic = false;
    if (!once) {
      const b = await runOk(c);
      if (!sameResult(a, b)) {
        nondeterministic = true;
        flaky.push(`${command}/${c.id}`);
        // The JS CLI sometimes cuts its output short when it exits with a
        // write still pending. Keep the most complete of five runs.
        const runs = [a, b];
        for (let i = 0; i < 3; i++) runs.push(await runOk(c));
        const size = r => r.stdout.length + r.stderr.length;
        const done = runs.filter(r => r.exit !== 'timeout');
        a = (done.length ? done : runs).reduce((x, y) => (size(y) > size(x) ? y : x));
        if (done.length === runs.length && done.every(r => sameResult(r, done[0]))) {
          // Only timeouts differed: the case is deterministic.
          nondeterministic = false;
          flaky.pop();
        }
      }
    }
    const file = goldenPath(command, c.id);
    if (typeof a.exit === 'string' && a.exit.startsWith('signal:')) {
      crashes.add(`${command}/${c.id}`);
      fs.rmSync(file, {force: true});
      return;
    }
    crashes.delete(`${command}/${c.id}`);
    const golden = {id: c.id, args: c.args, fixture: c.fixture ?? 'app', ...comparable(a)};
    if (nondeterministic) golden.nondeterministic = true;
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, `${JSON.stringify(golden, null, 1)}\n`);
  },
  () => {
    done++;
    if (done % 200 === 0 || done === items.length) process.stderr.write(`recorded ${done}/${items.length} (${((Date.now() - started) / 1000).toFixed(0)}s)\n`);
  },
);

// Drop goldens whose case no longer exists (only on a full, unfiltered record).
if ((!opt('command') && !opt('case')) || argv.includes('--prune')) {
  for (const command of fs.readdirSync(GOLDEN_DIR)) {
    const dir = path.join(GOLDEN_DIR, command);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (opt('command') && !opt('command').split(',').includes(command)) continue;
    const ids = new Set((loadCases({command})[command] ?? []).map(c => `${c.id}.json`));
    for (const f of fs.readdirSync(dir)) if (!ids.has(f)) fs.rmSync(path.join(dir, f));
  }
}
{
  const live = new Set();
  const every = loadCases();
  for (const [command, cases] of Object.entries(every)) for (const c of cases) live.add(`${command}/${c.id}`);
  for (const k of [...crashes]) if (!live.has(k)) crashes.delete(k);
}
fs.writeFileSync(crashFile, `${JSON.stringify([...crashes].sort(), null, 1)}\n`);
if (crashes.size) console.log(`JS CLI crashed (no golden): ${[...crashes].sort().join(', ')}`);
// What the goldens were recorded from.
let head = 'unknown';
try {
  head = execFileSync('git', ['-C', REPO, 'log', '-1', '--format=%H', '--', 'packages/cli'], {encoding: 'utf8'}).trim();
} catch {}
fs.writeFileSync(path.join(GOLDEN_DIR, 'META.json'), `${JSON.stringify({jsCliLastCommit: head, node: process.version}, null, 1)}\n`);
// The list is derived from the goldens' own flags, so it never goes stale.
const listFile = path.join(GOLDEN_DIR, 'NONDETERMINISTIC.json');
const list = [];
for (const command of fs.readdirSync(GOLDEN_DIR).sort()) {
  const dir = path.join(GOLDEN_DIR, command);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).sort()) {
    if (fs.readFileSync(path.join(dir, f), 'utf8').includes('"nondeterministic": true')) list.push(`${command}/${f.slice(0, -5)}`);
  }
}
fs.writeFileSync(listFile, `${JSON.stringify(list, null, 1)}\n`);
console.log(`recorded ${items.length} cases in ${((Date.now() - started) / 1000).toFixed(0)}s; nondeterministic: ${flaky.length}`);
for (const k of flaky) console.log(`  nondeterministic ${k}`);
