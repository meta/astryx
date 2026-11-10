#!/usr/bin/env node
// Times the JS CLI and the Rust clone on a representative set of cases, in the
// same sandbox run.mjs uses (overlay over the fixtures, no network, pinned env).
// Only the CLI process is timed (shim/benchtime.c, monotonic clock), not the
// sandbox set-up. Writes the table to bench.md.
//
// Usage: node bench.mjs --bin <astryx binary> [--runs 5] [--jobs 8] [--only <substring>]
//        node bench.mjs --bin <astryx binary> --sweep [--command a,b] [--jobs 32]
//
// --sweep times every suite case once with the Rust binary and lists cases over
// 200 ms or timed out (no table is written).

import {spawn, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {BIN_DIR, caseEnv, ensureDirs, jsBin, loadCases, pool, SCRATCH, WORK} from './lib.mjs';
import {FIXTURES, HERE, setup} from './setup.mjs';

const argv = process.argv.slice(2);
const opt = name => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const binArg = opt('bin');
if (!binArg) {
  console.error('usage: node bench.mjs --bin <astryx binary> [--runs 5] [--jobs 8] [--sweep]');
  process.exit(2);
}
const RUST = path.resolve(binArg);
const RUNS = Number(opt('runs') ?? 7);
const TIMER = path.join(BIN_DIR, 'benchtime');

// [fixture, args]: every command, start-up, the app, large and empty fixtures.
const CASES = [
  ['empty', ['--version']],
  ['empty', ['--help']],
  ['app', ['--help']],
  ['app', ['help', 'search']],
  ['app', ['manifest', '--json']],
  ['app', ['search', 'button']],
  ['app', ['search', 'date picker', '--json']],
  ['large', ['search', 'chart']],
  ['empty', ['search', 'button']],
  ['app', ['component', '--list']],
  ['app', ['component', 'Button']],
  ['app', ['component', 'Button', '--dense']],
  ['large', ['component', '--list']],
  ['large', ['component', 'card']],
  ['large', ['component', 'BottomSheet', '--detail', 'brief']],
  ['app', ['hook', '--list']],
  ['app', ['hook', 'useTooltip']],
  ['app', ['docs']],
  ['app', ['docs', 'principles', '--dense']],
  ['app', ['docs', 'tokens', '--dense']],
  ['app', ['docs', 'cli', '--depth', 'all']],
  ['large', ['docs']],
  ['large', ['docs', 'theme']],
  ['large', ['docs', 'spacing', '--json']],
  ['large', ['docs', 'theme', 'quick-start']],
  ['large', ['docs', 'color', 'Overview']],
  ['empty', ['docs']],
  ['app', ['template', '--list']],
  ['app', ['template', 'library']],
  ['large', ['template', '--list']],
  ['large', ['template', 'AppShellWithBanner']],
  ['large', ['template', 'BadgeStatusLabels', '--skeleton']],
  ['app', ['theme', 'list']],
  ['large', ['theme', 'list']],
  ['large', ['theme', 'list', '--json']],
  ['app', ['theme', 'add', '--list']],
  ['app', ['theme', 'eject', 'ocean', '--json']],
  ['app', ['theme', 'palette', 'generate', '../inputs/palette.config.json', '--json']],
  ['app', ['doctor']],
  ['app', ['doctor', '--json']],
  ['large', ['doctor']],
  ['empty', ['doctor']],
  ['integration', ['doctor', 'integration', 'docs', '@acme/kit']],
  ['large', ['doctor', 'integration', 'validate']],
  ['app', ['discover', 'calendar', '--json']],
  ['app', ['discover', 'SelectableCard']],
  ['large', ['discover', 'chart']],
  ['app', ['build', 'form validation', '--json']],
  ['app', ['build', 'Budget allocation']],
  ['large', ['build', 'dashboard with charts']],
  ['app', ['swizzle', 'Pagination']],
  ['app', ['init', '--json']],
  ['app', ['upgrade', '--from=0.1.0']],
  ['app', ['upgrade', '--codemod', 'remove-size-props', '--apply']],
  ['author', ['integration', 'pack']],
  ['app', ['integration', 'add', 'component', 'useClipboard', '--type', 'block', '--json']],
  ['app', ['gap-report', '--category', 'Inputs', '--json']],
  ['app', ['blog']],
  ['app', ['experimental', 'icon', 'map', '--json']],
  ['app', ['bogus']],
];

function ensureTimer() {
  const src = path.join(HERE, 'shim', 'benchtime.c');
  const tag = `${TIMER}.src`;
  const text = fs.readFileSync(src, 'utf8');
  if (fs.existsSync(TIMER) && fs.existsSync(tag) && fs.readFileSync(tag, 'utf8') === text) return;
  const tmp = `${TIMER}.${process.pid}`;
  const r = spawnSync('gcc', ['-O2', '-o', tmp, src], {stdio: 'inherit'});
  if (r.status !== 0) throw new Error('could not build the bench timer');
  fs.renameSync(tmp, TIMER);
  fs.writeFileSync(tag, text);
}

let seq = 0;
/** Run one case in the sandbox; returns {ms, stdout, stderr, exit}. */
async function timeCase(c, cmd, timeoutMs = 60000) {
  const scratch = path.join(SCRATCH, `bench-${process.pid}-${++seq}`);
  fs.mkdirSync(path.join(scratch, 'u', 'home'), {recursive: true});
  fs.mkdirSync(path.join(scratch, 'u', 'tmp'), {recursive: true});
  fs.mkdirSync(path.join(scratch, 'w'), {recursive: true});
  const cwd = path.join(WORK, c.cwd ?? c.fixture ?? 'app');
  const uid = process.getuid();
  const gid = process.getgid();
  const script = `mount -t overlay overlay -o "lowerdir=${FIXTURES},upperdir=$1/u,workdir=$1/w,userxattr" "$2" && cd "$3" && shift 3 && exec unshare -U --map-user=${uid} --map-group=${gid} "$@"`;
  const full = ['-rmn', 'sh', '-c', script, 'sh', scratch, WORK, cwd, TIMER, ...cmd, ...c.args];
  const res = await new Promise(resolve => {
    const child = spawn('/usr/bin/unshare', full, {env: caseEnv(c), stdio: ['pipe', 'pipe', 'pipe', 'pipe']});
    const out = [];
    const err = [];
    const t = [];
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => err.push(d));
    child.stdio[3].on('data', d => t.push(d));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdin.on('error', () => {});
    child.stdin.end(c.stdin ?? undefined);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({timedOut, code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), ns: Buffer.concat(t).toString().trim()});
    });
  });
  await fs.promises.rm(scratch, {recursive: true, force: true}).catch(() => {});
  return {
    ms: res.timedOut ? Infinity : Number(res.ns) / 1e6,
    exit: res.timedOut ? 'timeout' : res.code,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

const fmt = ms => (ms === Infinity ? 'timeout' : ms < 10 ? ms.toFixed(1) : String(Math.round(ms)));
const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

await setup();
ensureDirs();
ensureTimer();

if (argv.includes('--sweep')) {
  const all = loadCases({command: opt('command')});
  const items = [];
  for (const [command, cases] of Object.entries(all)) for (const c of cases) if (!c.tty && !c.pre) items.push({command, c});
  const jobs = Number(opt('jobs') ?? 32);
  const results = await pool(items, jobs, async ({c}) => timeCase(c, [RUST], Number(opt('timeout') ?? 30000)));
  const slow = items.map((it, i) => ({...it, ms: results[i].ms})).filter(x => x.ms > 200).sort((a, b) => b.ms - a.ms);
  const per = {};
  items.forEach((it, i) => {
    const p = (per[it.command] ??= {n: 0, max: 0, sum: 0});
    p.n++;
    p.sum += Math.min(results[i].ms, 60000);
    p.max = Math.max(p.max, results[i].ms);
  });
  for (const [k, p] of Object.entries(per)) console.log(`${k.padEnd(14)} n=${p.n} mean=${fmt(p.sum / p.n)} max=${fmt(p.max)}`);
  console.log(`\n${slow.length} cases over 200 ms (of ${items.length}; parallel ${jobs}, so times include contention):`);
  for (const s of slow.slice(0, Number(opt('top') ?? 60))) console.log(`${fmt(s.ms).padStart(8)}  ${s.command}/${s.c.id}  (${s.c.fixture ?? 'app'})`);
  process.exit(0);
}

const js = jsBin().cmd;
const CLI_ROOTS = [jsBin().cliRoot, path.resolve(RUST, '../../../packages/cli')]
  .flatMap(r => [r, fs.realpathSync(r)])
  .sort((a, b) => b.length - a.length);
const only = opt('only');
const list = CASES.filter(([, args]) => !only || args.join(' ').includes(only)).map(([fixture, args]) => ({fixture, args}));
const jobs = Number(opt('jobs') ?? 8);
const rows = await pool(list, jobs, async c => {
  const j = [];
  const r = [];
  let same = true;
  let jr;
  let rr;
  // Interleave the two binaries so load changes hit both alike.
  for (let k = 0; k < RUNS; k++) {
    jr = await timeCase(c, js);
    rr = await timeCase(c, [RUST]);
    j.push(jr.ms);
    r.push(rr.ms);
    if (rr.ms === Infinity) break;
  }
  const norm = s => {
    for (const root of CLI_ROOTS) s = s.split(root).join('<cli>');
    return s;
  };
  same = jr.exit === rr.exit && norm(jr.stdout) === norm(rr.stdout) && norm(jr.stderr) === norm(rr.stderr);
  const row = {c, jsBest: Math.min(...j), jsMed: median(j), rsBest: Math.min(...r), rsMed: median(r), same};
  process.stderr.write(`${c.fixture}: astryx ${c.args.join(' ')}  JS ${fmt(row.jsBest)}  Rust ${fmt(row.rsBest)}\n`);
  return row;
});

const load = fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
const cores = (await import('node:os')).cpus().length;
const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: HERE, encoding: 'utf8'}).stdout.trim();
const quote = a => (/[\s'"]/.test(a) || a === '' ? JSON.stringify(a) : a);
const lines = [
  '# Bench: JS CLI vs Rust clone',
  '',
  `Generated by \`node bench.mjs --bin <astryx>\` at commit ${sha}. Each case runs ${RUNS} times per binary,`,
  'interleaved, in the conformance sandbox (pinned env, overlay over the fixtures, no network). Only the',
  'CLI process is timed. Times are milliseconds: best of the runs, then the median. "Same" says whether',
  'stdout, stderr and exit code were equal in the last run (the suite is the real output check).',
  '',
  `Load average at the end of the run: ${load} on ${cores} cores${Number(load.split(' ')[0]) > cores / 4 ? ' (**box under load**: absolute times are inflated; the A/B interleaving keeps the speedup ratios fair)' : ''}.`,
  '',
  '| command | case (fixture: args) | JS best | JS median | Rust best | Rust median | speedup (best) | same |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | :---: |',
];
for (const r of rows) {
  const cmd = r.c.args[0]?.startsWith('-') || !r.c.args.length ? '(root)' : r.c.args[0];
  const sp = r.rsBest === Infinity ? '—' : `${(r.jsBest / r.rsBest).toFixed(1)}×`;
  lines.push(`| ${cmd} | ${r.c.fixture}: \`${r.c.args.map(quote).join(' ')}\` | ${fmt(r.jsBest)} | ${fmt(r.jsMed)} | ${fmt(r.rsBest)} | ${fmt(r.rsMed)} | ${sp} | ${r.same ? 'yes' : 'no'} |`);
}
const slower = rows.filter(r => r.rsBest >= r.jsBest);
const slow = rows.filter(r => r.rsBest > 200);
lines.push('', `Rust slower than JS: ${slower.length ? slower.map(r => `\`${r.c.args.join(' ')}\` (${r.c.fixture})`).join(', ') : 'none'}.`);
lines.push(`Rust over 200 ms: ${slow.length ? slow.map(r => `\`${r.c.args.join(' ')}\` (${r.c.fixture})`).join(', ') : 'none'}.`, '');
if (!only) fs.writeFileSync(path.join(HERE, 'bench.md'), lines.join('\n'));
console.log(lines.join('\n'));
