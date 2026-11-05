// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Subprocess no-hang tests: the CLI never waits on stdin (INV1).
 *
 * Every run gets a stdin pipe that stays open and silent, the way an agent's
 * harness holds it. A prompt or a stdin read for control flow then blocks until
 * the deadline, and the run ends with signal SIGTERM and status null. With stdin
 * ignored or closed, the same read would see EOF at once and pass.
 *
 * Every command and group in the manifest runs once, with a placeholder for
 * each required argument so its action is reached, plus the bare `astryx`.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {spawn, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', 'bin', 'astryx.mjs');
const DEADLINE_MS = 20_000;
// Keeps every run offline: `blog` fetches its feed when run bare.
const OFFLINE = `data:text/javascript,${encodeURIComponent(
  "globalThis.fetch = () => Promise.reject(new TypeError('fetch failed'));",
)}`;

/**
 * Run `node <argv>` with a stdin pipe that is never written or ended.
 * @param {string[]} argv
 * @param {string} cwd
 * @param {number} [deadline]
 * @returns {Promise<{status: number | null, signal: NodeJS.Signals | null, output: string}>}
 */
function runHeld(argv, cwd, deadline = DEADLINE_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {...process.env, FORCE_COLOR: '0', CI: ''},
    });
    // Never written or ended; a late EPIPE after exit is not a result.
    child.stdin.on('error', () => {});
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => (output += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (output += chunk));
    const timer = setTimeout(() => child.kill('SIGTERM'), deadline);
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({status, signal, output});
    });
  });
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function runCli(args, cwd) {
  return runHeld(['--import', OFFLINE, CLI, ...args], cwd);
}

/** @returns {Array<[string, string[]]>} */
function manifestInvocations() {
  const manifest = spawnSync(process.execPath, [CLI, 'manifest', '--json'], {
    encoding: 'utf8',
  });
  /** @type {string[][]} */
  const invocations = [[]];
  /** @param {any[]} commands */
  const walk = commands => {
    for (const command of commands) {
      invocations.push([
        ...command.name.split(' '),
        ...command.arguments.filter((/** @type {any} */ a) => a.required).map(() => 'x'),
      ]);
      walk(command.subcommands ?? []);
    }
  };
  walk(JSON.parse(manifest.stdout).data.commands);
  return invocations.map(args => [['astryx', ...args].join(' '), args]);
}

describe('the harness holds stdin open', () => {
  it('so a stdin read is reported as a hang', async () => {
    const r = await runHeld(['-e', 'process.stdin.resume()'], os.tmpdir(), 1_000);
    expect(r.signal).toBe('SIGTERM');
    expect(r.status).toBeNull();
  });
});

describe('every command exits without waiting on stdin', () => {
  it.concurrent.for(manifestInvocations())('%s', async ([label, args], {expect}) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-interactive-guard-'));
    try {
      const r = await runCli(args, cwd);
      expect(r.signal, `${label} waited on stdin:\n${r.output.slice(-500)}`).toBeNull();
    } finally {
      fs.rmSync(cwd, {recursive: true, force: true});
    }
  });
});

describe('init is non-interactive by default (no TTY needed)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-interactive-guard-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it('runs cleanly (exit 0, no hang) and writes agent docs', async () => {
    const r = await runCli(['init'], tmpDir);
    expect(r.signal).toBeNull(); // did not hang
    expect(r.status).toBe(0); // succeeded without a TTY
    expect(fs.readdirSync(tmpDir).length).toBeGreaterThan(0); // wrote the cheat sheet
  });

  it('writes an agent-doc file containing the ASTRYX cheat-sheet marker', async () => {
    await runCli(['init'], tmpDir);
    // init injects into existing agent-doc files if present, else creates AGENTS.md
    const candidates = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', path.join('.claude', 'CLAUDE.md')];
    const doc = candidates.find(f => fs.existsSync(path.join(tmpDir, f)));
    expect(doc).toBeTruthy();
    expect(fs.readFileSync(path.join(tmpDir, doc), 'utf8')).toMatch(/ASTRYX:START/);
  });

  it('still runs --features agents non-interactively', async () => {
    const r = await runCli(['init', '--features', 'agents'], tmpDir);
    expect(r.signal).toBeNull();
    expect(r.status).toBe(0);
    expect(fs.readdirSync(tmpDir).length).toBeGreaterThan(0);
  });
});
