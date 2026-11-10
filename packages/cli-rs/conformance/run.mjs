#!/usr/bin/env node
// Runs a binary against the goldens and prints pass/total per command.
//
// Usage: node run.mjs --bin <path> [--command a,b] [--case id] [--jobs n]
//          [--show-diff] [--max-diffs n] [--report file] [--failed]
//
// --failed reruns only the cases that failed in the last report.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {ensureDirs, goldenPath, HERE_REPORT, loadCases, pool, runCase} from './lib.mjs';
import {caseFixtureHash, fixtureHashes, setup} from './setup.mjs';

const argv = process.argv.slice(2);
const opt = name => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const binArg = opt('bin');
if (!binArg) {
  console.error('usage: node run.mjs --bin <astryx binary> [--command x] [--case id] [--jobs n] [--show-diff]');
  process.exit(2);
}
const binPath = path.resolve(binArg);
// The box is shared by many lanes: keep the default small.
const jobs = Number(opt('jobs') ?? 16);
const showDiff = argv.includes('--show-diff');
const maxDiffs = Number(opt('max-diffs') ?? (showDiff ? 20 : 5));
const reportFile = path.resolve(opt('report') ?? HERE_REPORT);

/** The clone's CLI root: packages/cli of the checkout that holds the binary. */
function findCliRoot(bin) {
  if (opt('cli-root')) return path.resolve(opt('cli-root'));
  let dir = path.dirname(bin);
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'packages', 'cli');
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    dir = path.dirname(dir);
  }
  return path.resolve(bin, '../../../../cli');
}

await setup();
ensureDirs();
const all = loadCases({command: opt('command'), caseId: opt('case')});
let onlyFailed = null;
if (argv.includes('--failed') && fs.existsSync(reportFile)) {
  const prev = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  onlyFailed = new Set(prev.failures.map(f => `${f.command}/${f.id}`));
}
const hashes = fixtureHashes();
const stale = {};
const crashFile = path.join(path.dirname(goldenPath('x', 'x')), '..', 'JS_CRASHES.json');
const crashes = new Set(fs.existsSync(crashFile) ? JSON.parse(fs.readFileSync(crashFile, 'utf8')) : []);
const items = [];
let missing = 0;
let crashed = 0;
for (const [command, cases] of Object.entries(all)) {
  for (const c of cases) {
    if (onlyFailed && !onlyFailed.has(`${command}/${c.id}`)) continue;
    const g = goldenPath(command, c.id);
    if (crashes.has(`${command}/${c.id}`)) {
      crashed++;
      continue;
    }
    if (!fs.existsSync(g)) {
      missing++;
      continue;
    }
    const golden = JSON.parse(fs.readFileSync(g, 'utf8'));
    if (golden.fixtureHash !== caseFixtureHash(c, hashes)) stale[c.fixture ?? 'app'] = (stale[c.fixture ?? 'app'] ?? 0) + 1;
    items.push({command, c, golden});
  }
}
const staleTotal = Object.values(stale).reduce((a, b) => a + b, 0);
if (staleTotal) {
  console.error(`WARNING: ${staleTotal} goldens were recorded on fixtures that changed since (${Object.entries(stale).map(([k, v]) => `${k}: ${v}`).join(', ')}). Re-record them: node record.mjs --stale`);
}
const bin = {cmd: [binPath], cliRoot: findCliRoot(binPath), timeoutMs: Number(opt('timeout') ?? 20000)};
const started = Date.now();
const stats = {};
const failures = [];
let done = 0;
await pool(
  items,
  jobs,
  async ({command, c, golden}) => {
    const got = await runCase(c, bin);
    const parts = [];
    if (got.stdout !== golden.stdout) parts.push('stdout');
    if (got.stderr !== golden.stderr) parts.push('stderr');
    if (got.exit !== golden.exit) parts.push('exit');
    if (JSON.stringify(got.files) !== JSON.stringify(golden.files)) parts.push('files');
    const s = (stats[command] ??= {pass: 0, total: 0, flaky: 0});
    s.total++;
    if (golden.nondeterministic) s.flaky++;
    if (!parts.length) s.pass++;
    else failures.push({command, id: c.id, args: c.args, fixture: c.fixture ?? 'app', parts, nondeterministic: !!golden.nondeterministic, golden, got});
  },
  () => {
    done++;
    if (process.stderr.isTTY && done % 50 === 0) process.stderr.write(`\r${done}/${items.length}`);
  },
);
if (process.stderr.isTTY) process.stderr.write('\r');

// ---- report ----
const cmds = Object.keys(stats).sort();
let pass = 0;
let total = 0;
const rows = [['command', 'pass', 'total', '%']];
for (const k of cmds) {
  const s = stats[k];
  pass += s.pass;
  total += s.total;
  rows.push([k, String(s.pass), String(s.total), ((100 * s.pass) / s.total).toFixed(1)]);
}
rows.push(['TOTAL', String(pass), String(total), total ? ((100 * pass) / total).toFixed(1) : '0']);
const w = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
for (const r of rows) console.log(r.map((v, i) => (i ? v.padStart(w[i]) : v.padEnd(w[i]))).join('  '));
if (crashed) console.log(`(${crashed} cases skipped: the JS CLI itself crashed there; golden/JS_CRASHES.json)`);
if (missing) console.log(`(${missing} cases have no golden yet; run record.mjs --missing)`);

failures.sort((a, b) => (a.command + a.id < b.command + b.id ? -1 : 1));
for (const f of failures.slice(0, maxDiffs)) {
  console.log(`\n--- FAIL ${f.command}/${f.id} [${f.parts.join(',')}]${f.nondeterministic ? ' (golden is nondeterministic)' : ''}`);
  console.log(`    astryx ${f.args.map(a => (/[\s'"]/.test(a) || a === '' ? JSON.stringify(a) : a)).join(' ')}   (fixture: ${f.fixture})`);
  for (const part of f.parts) {
    if (part === 'exit') console.log(`    exit: want ${f.golden.exit}, got ${f.got.exit}`);
    else if (part === 'files') console.log(diffText(fileSummary(f.golden.files), fileSummary(f.got.files), 'files'));
    else console.log(diffText(f.golden[part], f.got[part], part));
  }
}
fs.writeFileSync(
  reportFile,
  `${JSON.stringify(
    {
      bin: binPath,
      at: new Date().toISOString(),
      seconds: (Date.now() - started) / 1000,
      pass,
      total,
      commands: stats,
      failures: failures.map(({golden, got, ...f}) => ({...f, want: golden, got: {stdout: got.stdout, stderr: got.stderr, exit: got.exit, files: got.files}})),
    },
    null,
    1,
  )}\n`,
);
console.log(`\n${pass}/${total} passed in ${((Date.now() - started) / 1000).toFixed(1)}s; report: ${reportFile}`);
process.exit(pass === total ? 0 : 1);

function fileSummary(files) {
  return files.map(f => `${f.status} ${f.path}${f.text !== undefined ? `\n${f.text}` : f.sha256 ? ` sha256:${f.sha256}` : f.base64 ? ` base64:${f.base64.length}` : f.link ? ` -> ${f.link}` : ''}`).join('\n');
}

/** A short line diff: the first differing region with a little context. */
function diffText(want, got, label) {
  const a = String(want ?? '').split('\n');
  const b = String(got ?? '').split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ja = a.length - 1;
  let jb = b.length - 1;
  while (ja >= i && jb >= i && a[ja] === b[jb]) {
    ja--;
    jb--;
  }
  const lim = showDiff ? 40 : 8;
  const out = [`    ${label}: first difference at line ${i + 1} (want ${a.length} lines, got ${b.length})`];
  for (let k = Math.max(0, i - 2); k < i; k++) out.push(`      ${a[k]}`);
  for (let k = i; k <= ja && k < i + lim; k++) out.push(`    - ${JSON.stringify(a[k]).slice(1, -1)}`);
  if (ja - i + 1 > lim) out.push(`    - ... ${ja - i + 1 - lim} more`);
  for (let k = i; k <= jb && k < i + lim; k++) out.push(`    + ${JSON.stringify(b[k]).slice(1, -1)}`);
  if (jb - i + 1 > lim) out.push(`    + ... ${jb - i + 1 - lim} more`);
  return out.join('\n');
}
