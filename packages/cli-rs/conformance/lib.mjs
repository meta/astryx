// Shared case runner for record.mjs and run.mjs.
//
// Every case runs in a private mount namespace: a fresh reflink copy of its
// fixture is bind-mounted at WORK, so every case sees the same absolute paths
// (WORK/<fixture>, WORK/home) and many cases and lanes can run at once.

import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {FIXTURES, HERE, JS_CLI, REPO, ROOT} from './setup.mjs';

export const WORK = path.join(ROOT, 'work');
export const SCRATCH = path.join(ROOT, 'scratch');
export const BIN_DIR = path.join(ROOT, 'bin');
export const CASES_DIR = path.join(HERE, 'cases');
export const GOLDEN_DIR = path.join(HERE, 'golden');
export const HERE_REPORT = path.join(HERE, 'report.json');
export const JS_CLI_ROOT = path.join(REPO, 'packages/cli');
const UID = process.getuid();
const GID = process.getgid();
const INLINE_LIMIT = 256 * 1024;
// Folders whose contents are scratch, never part of a case's result: $TMPDIR,
// and npm's own cache and logs (npm pack runs under some commands).
const IGNORED = new Set(['tmp', 'home/.npm']);
// jiti's transpile cache, which the JS CLI writes when it loads TS/ESM modules
// through jiti: an artifact of the JS implementation, at any depth.
const IGNORED_SUFFIX = 'node_modules/.cache/jiti';

export const SHIM = path.join(BIN_DIR, 'fixedtime.so');

/** Build the wall-clock shim (shim/fixedtime.c) when it is missing or stale. */
function ensureShim() {
  const src = path.join(HERE, 'shim', 'fixedtime.c');
  const text = fs.readFileSync(src, 'utf8');
  const tag = `${SHIM}.src`;
  if (fs.existsSync(SHIM) && fs.existsSync(tag) && fs.readFileSync(tag, 'utf8') === text) return;
  const tmp = `${SHIM}.${process.pid}`;
  const r = spawnSync('gcc', ['-shared', '-fPIC', '-O2', '-o', tmp, src, '-ldl'], {stdio: 'inherit'});
  if (r.status !== 0) throw new Error('could not build the fixed-time shim');
  fs.renameSync(tmp, SHIM);
  fs.writeFileSync(tag, text);
}

export function ensureDirs() {
  fs.mkdirSync(WORK, {recursive: true});
  fs.mkdirSync(SCRATCH, {recursive: true});
  fs.mkdirSync(BIN_DIR, {recursive: true});
  const node = path.join(BIN_DIR, 'node');
  try {
    if (fs.readlinkSync(node) !== process.execPath) throw new Error('stale');
  } catch {
    fs.rmSync(node, {force: true});
    try {
      fs.symlinkSync(process.execPath, node);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  ensureShim();
  // Scratch folders of runs that died (named <pid>-<n>).
  for (const name of fs.readdirSync(SCRATCH)) {
    const pid = Number(name.split('-')[0]);
    if (!pid || pid === process.pid) continue;
    try {
      process.kill(pid, 0);
    } catch {
      removeScratchSync(path.join(SCRATCH, name));
    }
  }
}

/**
 * Load cases: {command: [case...]}. `cases/<command>.json` holds the generated
 * cases; `cases/<command>.<anything>.json` holds hand-written ones (one file
 * per lane avoids merge conflicts). Ids are unique per command.
 */
export function loadCases({command, caseId} = {}) {
  const out = {};
  const seen = new Map();
  for (const file of fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json')).sort()) {
    const name = file.split('.')[0];
    if (command && !command.split(',').includes(name)) continue;
    let cases = JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), 'utf8'));
    for (const c of cases) {
      const key = `${name}/${c.id}`;
      if (seen.has(key)) throw new Error(`case id ${key} is in both ${seen.get(key)} and ${file}`);
      seen.set(key, file);
    }
    if (caseId) cases = cases.filter(c => caseId.split(',').includes(c.id));
    if (cases.length) (out[name] ??= []).push(...cases);
  }
  return out;
}

/** The pinned environment every case runs with. */
export function caseEnv(c) {
  const env = {
    PATH: `${BIN_DIR}:/usr/bin:/bin`,
    HOME: path.join(WORK, 'home'),
    TMPDIR: path.join(WORK, 'tmp'),
    USER: 'astryx',
    LANG: 'C.UTF-8',
    TERM: 'dumb',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    COLUMNS: '100',
    TZ: 'UTC',
    // The CLI's own switch for its latest-version check and update notices.
    NO_UPDATE_NOTIFIER: '1',
    // Every wall-clock read returns 2026-11-10T00:00:00Z (shim/fixedtime.c).
    LD_PRELOAD: SHIM,
    ...(c.env ?? {}),
  };
  // A null value in a case's env unsets the variable.
  for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
  return env;
}

function fileRecord(abs, replace) {
  const buf = fs.readFileSync(abs);
  const sha = createHash('sha256').update(buf).digest('hex');
  const text = buf.toString('utf8');
  if (Buffer.from(text, 'utf8').equals(buf)) {
    const norm = replace(text);
    if (norm.length <= INLINE_LIMIT) return {text: norm};
    return {sha256: createHash('sha256').update(norm).digest('hex'), size: buf.length};
  }
  if (buf.length <= INLINE_LIMIT) return {base64: buf.toString('base64')};
  return {sha256: sha, size: buf.length};
}

/** Every file under dir (relative paths), for a deleted folder's contents. */
function listFiles(root, rel, out) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, rel), {withFileTypes: true});
  } catch {
    return out;
  }
  for (const e of entries) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) listFiles(root, r, out);
    else out.push(r);
  }
  return out;
}

/**
 * Created, changed and deleted files, read from the overlay's upper folder:
 * it holds exactly what the run wrote. A whiteout (a 0:0 character device)
 * marks a deleted path.
 */
function diffUpper(upper, replace, rel = '', files = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(upper, rel), {withFileTypes: true});
  } catch {
    return files;
  }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (IGNORED.has(r) || r === IGNORED_SUFFIX || r.endsWith(`/${IGNORED_SUFFIX}`)) continue;
    const abs = path.join(upper, r);
    const lower = path.join(FIXTURES, r);
    if (e.isCharacterDevice()) {
      let st = null;
      try {
        st = fs.lstatSync(lower);
      } catch {}
      if (st?.isDirectory()) for (const f of listFiles(FIXTURES, r, [])) files.push({path: f, status: 'deleted'});
      else if (st) files.push({path: r, status: 'deleted'});
    } else if (e.isDirectory()) {
      diffUpper(upper, replace, r, files);
    } else if (e.isSymbolicLink()) {
      const link = fs.readlinkSync(abs);
      let old = null;
      try {
        old = fs.readlinkSync(lower);
      } catch {}
      if (old !== link) files.push({path: r, status: old === null && !fs.existsSync(lower) ? 'created' : 'changed', link: replace(link)});
    } else if (e.isFile()) {
      let old = null;
      try {
        old = fs.readFileSync(lower);
      } catch {}
      if (old === null) files.push({path: r, status: 'created', ...fileRecord(abs, replace)});
      else if (!old.equals(fs.readFileSync(abs))) files.push({path: r, status: 'changed', ...fileRecord(abs, replace)});
    }
  }
  if (!rel) files.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  return files;
}

function makeReplacer(cliRoots) {
  const roots = [];
  for (const r of cliRoots) {
    roots.push(r);
    try {
      roots.push(fs.realpathSync(r));
    } catch {}
  }
  const uniq = [...new Set(roots)].sort((a, b) => b.length - a.length);
  return text => {
    for (const r of uniq) text = text.split(r).join('<cli>');
    return text;
  };
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

let seq = 0;
/**
 * Run one case.
 * @param {object} c the case
 * @param {{cmd: string[], cliRoot: string, timeoutMs?: number}} bin
 */
export async function runCase(c, bin) {
  const fixture = c.fixture ?? 'app';
  const scratch = path.join(SCRATCH, `${process.pid}-${++seq}`);
  const upper = path.join(scratch, 'u');
  fs.mkdirSync(path.join(upper, 'home'), {recursive: true});
  fs.mkdirSync(path.join(upper, 'tmp'), {recursive: true});
  fs.mkdirSync(path.join(scratch, 'w'), {recursive: true});
  const cwd = path.join(WORK, c.cwd ?? fixture);
  const argv = [...bin.cmd, ...c.args];
  const cmdline = argv.map(shQuote).join(' ');
  // Steps run first with the same binary, in the same work tree; their output
  // and exit codes are discarded.
  const pre = (c.pre ?? []).map(args => `${[...bin.cmd, ...args].map(shQuote).join(' ')} >/dev/null 2>&1 </dev/null; `).join('');
  let inner;
  if (c.tty) {
    // A pseudo-terminal: stdout and stderr arrive merged, as a terminal shows them.
    inner = ['/usr/bin/script', '-qefc', `${pre}stty cols ${caseEnv(c).COLUMNS} rows 40 2>/dev/null; exec ${cmdline}`, '/dev/null'];
  } else if (pre) {
    inner = ['/bin/sh', '-c', `${pre}exec ${cmdline}`];
  } else inner = argv;
  // WORK = the fixtures (read-only lower layer) + this case's writes (upper).
  // volatile: no sync of the upper layer at unmount (each case's writes are
  // read right away and then thrown away); a synced unmount cost ~300 ms.
  const script = `mount -t overlay overlay -o "lowerdir=${FIXTURES},upperdir=$1/u,workdir=$1/w,userxattr,volatile" "$2" && cd "$3" && shift 3 && exec unshare -U --map-user=${UID} --map-group=${GID} "$@"`;
  // -n: no network, so nothing a case runs can reach the outside world.
  const full = ['-rmn', 'sh', '-c', script, 'sh', scratch, WORK, cwd, ...inner];
  const started = Date.now();
  // stdout and stderr go to files, not pipes: Node writes to a pipe
  // asynchronously and can exit with output still pending, which cut long
  // outputs short at random. Files, like terminals, are written synchronously.
  const outFile = path.join(scratch, 'stdout');
  const errFile = path.join(scratch, 'stderr');
  const outFd = fs.openSync(outFile, 'w');
  const errFd = fs.openSync(errFile, 'w');
  const res = await new Promise(resolve => {
    const child = spawn('/usr/bin/unshare', full, {env: caseEnv(c), stdio: ['pipe', outFd, errFd]});
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, c.timeoutMs ?? bin.timeoutMs ?? 30000);
    child.stdin.on('error', () => {});
    if (c.stdin != null) child.stdin.end(c.stdin);
    else child.stdin.end();
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({code, signal, timedOut});
    });
  });
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  res.stdout = fs.readFileSync(outFile, 'utf8');
  res.stderr = fs.readFileSync(errFile, 'utf8');
  const replace = makeReplacer([bin.cliRoot]);
  const result = {
    stdout: replace(res.stdout),
    stderr: replace(res.stderr),
    exit: res.timedOut ? 'timeout' : res.code ?? `signal:${res.signal}`,
    files: diffUpper(upper, replace),
    ms: Date.now() - started,
  };
  await rmrf(scratch);
  return result;
}

// overlayfs leaves folders under its workdir with mode 000 (work/, and
// work/incompat/volatile/ for a volatile mount); open them before removing.
function openWorkdir(dir) {
  const open = d => {
    try {
      fs.chmodSync(d, 0o700);
      for (const e of fs.readdirSync(d, {withFileTypes: true})) if (e.isDirectory()) open(path.join(d, e.name));
    } catch {}
  };
  open(path.join(dir, 'w'));
}

function removeScratchSync(dir) {
  openWorkdir(dir);
  try {
    fs.rmSync(dir, {recursive: true, force: true});
  } catch {}
}

function rmrf(dir) {
  openWorkdir(dir);
  return fs.promises.rm(dir, {recursive: true, force: true}).catch(() => {});
}

export function jsBin() {
  return {cmd: [process.execPath, JS_CLI], cliRoot: JS_CLI_ROOT};
}

/** Run tasks with a concurrency limit; onDone(i, result) after each. */
export async function pool(items, jobs, fn, onDone) {
  let next = 0;
  const results = new Array(items.length);
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      onDone?.(i, results[i]);
    }
  }
  await Promise.all(Array.from({length: Math.min(jobs, items.length)}, worker));
  return results;
}

export function goldenPath(command, id) {
  return path.join(GOLDEN_DIR, command, `${id}.json`);
}

/** The four compared parts of a result, as stored in a golden. */
export function comparable(r) {
  return {stdout: r.stdout, stderr: r.stderr, exit: r.exit, files: r.files};
}

export function sameResult(a, b) {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}
