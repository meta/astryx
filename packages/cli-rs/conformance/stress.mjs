#!/usr/bin/env node
// Runs suite cases many times in parallel, in the suite sandbox, to catch
// hangs and flaky output that show up only under load. A run that times out
// gets the stacks of every process still alive in its sandbox (eu-stack)
// before it is killed.
//
// Usage: node stress.mjs --bin <astryx> --command <file> --case <id>[,<id>]
//          [--runs 300] [--jobs 64] [--timeout 20000] [--out stress-report.txt]
//
// Exit 0 only when every run matched its golden.

import {spawn, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {caseEnv, ensureDirs, goldenPath, loadCases, pool, SCRATCH, WORK} from './lib.mjs';
import {FIXTURES, setup} from './setup.mjs';

const argv = process.argv.slice(2);
const opt = name => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const bin = opt('bin') && path.resolve(opt('bin'));
if (!bin || !opt('command')) {
  console.error('usage: node stress.mjs --bin <astryx> --command <file> [--case ids] [--runs n] [--jobs n] [--timeout ms]');
  process.exit(2);
}
const RUNS = Number(opt('runs') ?? 300);
const JOBS = Number(opt('jobs') ?? 64);
const TIMEOUT = Number(opt('timeout') ?? 20000);
const OUT = path.resolve(opt('out') ?? path.join(SCRATCH, `stress-${process.pid}.txt`));

/** Every live descendant of pid (depth first). */
function descendants(pid) {
  const out = [];
  const r = spawnSync('pgrep', ['-P', String(pid)], {encoding: 'utf8'});
  for (const c of r.stdout.split('\n').filter(Boolean)) {
    out.push(Number(c), ...descendants(Number(c)));
  }
  return out;
}

function stacksOf(pid) {
  const parts = [];
  for (const p of descendants(pid)) {
    const comm = fs.readFileSync(`/proc/${p}/comm`, 'utf8').trim();
    if (!comm.includes('astryx')) continue;
    const r = spawnSync('eu-stack', ['-p', String(p), '-n', '60'], {encoding: 'utf8', timeout: 20000});
    parts.push(`--- pid ${p} (${comm})\n${(r.stdout || '').replace(/::h[0-9a-f]{16}/g, '')}${r.stderr ? `\n${r.stderr}` : ''}`);
  }
  return parts.join('\n');
}

let seq = 0;
async function runOnce(c) {
  const scratch = path.join(SCRATCH, `stress-${process.pid}-${++seq}`);
  fs.mkdirSync(path.join(scratch, 'u', 'home'), {recursive: true});
  fs.mkdirSync(path.join(scratch, 'u', 'tmp'), {recursive: true});
  fs.mkdirSync(path.join(scratch, 'w'), {recursive: true});
  const cwd = path.join(WORK, c.cwd ?? c.fixture ?? 'app');
  const script = `mount -t overlay overlay -o "lowerdir=${FIXTURES},upperdir=$1/u,workdir=$1/w,userxattr" "$2" && cd "$3" && shift 3 && exec unshare -U --map-user=${process.getuid()} --map-group=${process.getgid()} "$@"`;
  const full = ['-rmn', 'sh', '-c', script, 'sh', scratch, WORK, cwd, bin, ...c.args];
  const started = Date.now();
  const res = await new Promise(resolve => {
    const child = spawn('/usr/bin/unshare', full, {env: caseEnv(c), stdio: ['pipe', 'pipe', 'pipe']});
    const out = [];
    const err = [];
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => err.push(d));
    let stacks = null;
    const timer = setTimeout(() => {
      stacks = stacksOf(child.pid);
      child.kill('SIGKILL');
      for (const p of descendants(child.pid)) {
        try {
          process.kill(p, 'SIGKILL');
        } catch {}
      }
    }, c.timeoutMs ?? TIMEOUT);
    child.stdin.on('error', () => {});
    child.stdin.end(c.stdin ?? undefined);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({code, stacks, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString()});
    });
  });
  await fs.promises.rm(scratch, {recursive: true, force: true}).catch(() => {});
  return {...res, ms: Date.now() - started};
}

await setup();
ensureDirs();
const cases = Object.values(loadCases({command: opt('command'), caseId: opt('case')})).flat().filter(c => !c.tty && !c.pre);
if (!cases.length) {
  console.error('no cases selected');
  process.exit(2);
}
const goldens = new Map(cases.map(c => [c.id, JSON.parse(fs.readFileSync(goldenPath(opt('command'), c.id), 'utf8'))]));
const items = Array.from({length: RUNS}, (_, i) => cases[i % cases.length]);
const report = [];
let hangs = 0;
let diffs = 0;
const times = [];
await pool(items, JOBS, async c => {
  const r = await runOnce(c);
  times.push(r.ms);
  const g = goldens.get(c.id);
  const cli = path.resolve(bin, '../../../packages/cli');
  const norm = s => s.split(cli).join('<cli>').split(fs.realpathSync(cli)).join('<cli>');
  if (r.stacks !== null) {
    hangs++;
    report.push(`=== HANG ${c.id} after ${r.ms} ms (stdout ${r.stdout.length} B, stderr ${r.stderr.length} B)\n${r.stacks}`);
  } else if (norm(r.stdout) !== g.stdout || norm(r.stderr) !== g.stderr || r.code !== g.exit) {
    diffs++;
    report.push(`=== DIFF ${c.id} exit ${r.code} (want ${g.exit})\nstdout:\n${r.stdout.slice(0, 2000)}\nstderr:\n${r.stderr.slice(0, 2000)}`);
  }
});
times.sort((a, b) => a - b);
fs.writeFileSync(OUT, report.join('\n\n'));
console.log(`${RUNS} runs of ${cases.length} case(s) at --jobs ${JOBS}: ${hangs} hung, ${diffs} differed; median ${times[times.length >> 1]} ms, max ${times[times.length - 1]} ms`);
if (report.length) console.log(`details: ${OUT}`);
process.exit(hangs || diffs ? 1 : 0);
