// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for `astryx theme build --watch` (#3375).
 *
 * Watch mode runs an initial build, then rebuilds whenever the theme file
 * changes, until interrupted. Each rebuild runs in a child process so a build
 * error (reported by the single-build path via a hard exit) is contained and
 * the watcher keeps running.
 *
 * Building `astryx theme build` requires a compiled @astryxdesign/core, so this
 * suite builds core once in beforeAll via the shared ensureCoreBuilt() helper —
 * which serializes concurrent Vitest workers behind a lock — to stay
 * self-sufficient regardless of CI job ordering.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import {execFileSync, spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {ensureCoreBuilt} from './ensure-core-built.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(__dirname, '../bin/astryx.mjs');

function runCli(args, cwd) {
  try {
    const out = execFileSync('node', [CLI_BIN, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, FORCE_COLOR: '0'},
    });
    return {code: 0, stdout: out, stderr: ''};
  } catch (e) {
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

/** Poll until `predicate()` is true or the timeout elapses. */
async function waitFor(predicate, {timeout = 8000, interval = 50} = {}) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return true;
    if (Date.now() - start > timeout) return false;
    await new Promise(r => setTimeout(r, interval));
  }
}

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-theme-watch-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build --watch', () => {
  it('advertises the flag in --help', () => {
    const result = runCli(['theme', 'build', '--help'], process.cwd());
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/--watch/);
  });

  it('rejects --watch together with --json (single-envelope contract)', () => {
    const themeFile = path.join(tmpDir, 'wt.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'wt', tokens: { '--color-bg': '#fff' } };\n`,
    );
    const result = runCli(
      ['--json', 'theme', 'build', path.relative(tmpDir, themeFile), '--watch'],
      tmpDir,
    );
    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/watch/i);
  });

  it('builds initially, rebuilds on change, and stops cleanly on SIGINT', async () => {
    const themeFile = path.join(tmpDir, 'wt.mjs');
    const cssFile = path.join(tmpDir, 'wt.css');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'wt', tokens: { '--color-bg': '#ffffff' } };\n`,
    );

    const child = spawn(
      process.execPath,
      [CLI_BIN, 'theme', 'build', 'wt.mjs', '--watch'],
      {cwd: tmpDir, env: {...process.env, FORCE_COLOR: '0'}},
    );
    let stdout = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stdout += d.toString()));

    try {
      // Initial build produces the CSS.
      const built = await waitFor(() => fs.existsSync(cssFile));
      expect(built).toBe(true);
      const firstCss = fs.readFileSync(cssFile, 'utf-8');
      expect(firstCss).toMatch(/#ffffff/);

      // Wait until the watcher is actually watching before editing, so the
      // change isn't missed. The "Watching" line is printed only after fs.watch
      // is armed, so it's a truthful "safe to edit now" signal.
      await waitFor(() => /Watching/i.test(stdout));

      // Change the theme — the token value changes so the CSS must change.
      // fs.watch event delivery is best-effort on some platforms/under load, so
      // re-touch the file until the rebuild is observed (idempotent write).
      const changed = `export default { name: 'wt', tokens: { '--color-bg': '#010203' } };\n`;
      fs.writeFileSync(themeFile, changed);

      const rebuilt = await waitFor(
        () => {
          try {
            if (fs.readFileSync(cssFile, 'utf-8').includes('#010203'))
              return true;
          } catch {
            // CSS mid-write; fall through to re-touch.
          }
          // Re-touch to recover a dropped watch event under load.
          try {
            fs.writeFileSync(themeFile, changed);
          } catch {
            // Re-touch failed (e.g. dir mid-teardown); the next poll retries.
          }
          return false;
        },
        {timeout: 20000, interval: 200},
      );
      expect(rebuilt).toBe(true);
      expect(stdout).toMatch(/rebuild/i);
    } finally {
      // SIGINT must stop the watcher and exit cleanly.
      child.kill('SIGINT');
    }

    const exited = await new Promise(resolve => {
      let done = false;
      child.on('exit', () => {
        done = true;
        resolve(true);
      });
      setTimeout(() => resolve(done), 4000);
    });
    expect(exited).toBe(true);
    expect(stdout).toMatch(/Stopped watching/);
  }, 30_000);

  it('stops at once when interrupted mid-rebuild, and drops a queued change', async () => {
    const themeFile = path.join(tmpDir, 'ws.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'ws', tokens: { '--color-bg': '#ffffff' } };\n`,
    );
    // Top-level await holds every rebuild of this version in progress for 20 s,
    // far longer than a stop may take.
    const slow =
      `await new Promise(resolve => setTimeout(resolve, 20000));\n` +
      `export default { name: 'ws', tokens: { '--color-bg': '#010203' } };\n`;

    const child = spawn(
      process.execPath,
      [CLI_BIN, 'theme', 'build', 'ws.mjs', '--watch'],
      {cwd: tmpDir, env: {...process.env, FORCE_COLOR: '0'}},
    );
    let stdout = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stdout += d.toString()));
    const exited = new Promise(resolve =>
      child.once('exit', () => resolve(Date.now())),
    );

    let stoppedAt;
    try {
      expect(await waitFor(() => /Watching/i.test(stdout))).toBe(true);
      // Start the slow rebuild, re-touching in case a watch event is dropped.
      const started = await waitFor(
        () => {
          if (/rebuilding ws\.mjs/.test(stdout)) return true;
          fs.writeFileSync(themeFile, slow);
          return false;
        },
        {timeout: 20000, interval: 200},
      );
      expect(started).toBe(true);
      // Queue a change behind the rebuild in progress (debounce is 100 ms).
      fs.writeFileSync(themeFile, `${slow}// queued\n`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      stoppedAt = Date.now();
      child.kill('SIGINT');
    }

    const exitedAt = await Promise.race([
      exited,
      new Promise(resolve => setTimeout(() => resolve(null), 15000)),
    ]);
    if (exitedAt === null) child.kill('SIGKILL');
    // Finishing the interrupted rebuild, or starting the queued one, takes 20 s.
    expect(exitedAt).not.toBeNull();
    expect(exitedAt - stoppedAt).toBeLessThan(10000);
    expect(stdout.match(/rebuilding/g)).toHaveLength(1);
    expect(stdout.trimEnd().endsWith('Stopped watching.')).toBe(true);
  }, 60_000);

  it.each([
    [[], false],
    [['--detail', 'full'], true],
  ])(
    'keeps the detail level for each build (%j)',
    async (detail, full) => {
      fs.writeFileSync(
        path.join(tmpDir, 'wd.mjs'),
        `export default { name: 'wd', tokens: { '--color-bg': '#ffffff' } };\n`,
      );
      const child = spawn(
        process.execPath,
        [CLI_BIN, ...detail, 'theme', 'build', 'wd.mjs', '--watch'],
        {cwd: tmpDir, env: {...process.env, FORCE_COLOR: '0'}},
      );
      let stdout = '';
      child.stdout.on('data', d => (stdout += d.toString()));
      child.stderr.on('data', d => (stdout += d.toString()));
      try {
        expect(await waitFor(() => /Watching/i.test(stdout))).toBe(true);
      } finally {
        child.kill('SIGINT');
      }
      await new Promise(resolve => {
        child.on('exit', resolve);
        setTimeout(resolve, 4000);
      });
      expect(stdout.includes('Install in your app')).toBe(full);
      expect(/\[ok\] wd\.css \(/.test(stdout)).toBe(!full);
    },
    30_000,
  );

  it('watches every file it was given and rebuilds only the one that changed', async () => {
    const first = path.join(tmpDir, 'w1.mjs');
    const second = path.join(tmpDir, 'w2.mjs');
    fs.writeFileSync(
      first,
      `export default { name: 'w1', tokens: { '--color-bg': '#ffffff' } };\n`,
    );
    fs.writeFileSync(
      second,
      `export default { name: 'w2', tokens: { '--color-bg': '#eeeeee' } };\n`,
    );

    const child = spawn(
      process.execPath,
      [CLI_BIN, 'theme', 'build', 'w1.mjs', 'w2.mjs', '--watch'],
      {cwd: tmpDir, env: {...process.env, FORCE_COLOR: '0'}},
    );
    let stdout = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stdout += d.toString()));

    try {
      // The watcher prints its "Watching" line once every initial build has
      // finished, and those builds run one after another, each in its own
      // child process. Wait for that line instead of polling for the files
      // under the 8 s deadline: on a loaded runner two builds can outlast it.
      // The test's own time limit still bounds the wait.
      await new Promise((resolve, reject) => {
        const check = () => {
          if (/Watching w1\.mjs, w2\.mjs/.test(stdout)) {
            stop();
            resolve(undefined);
          }
        };
        const exited = (/** @type {number | null} */ code) => {
          stop();
          reject(
            new Error(`watch exited (${code}) before watching:\n${stdout}`),
          );
        };
        const stop = () => {
          child.stdout.off('data', check);
          child.stderr.off('data', check);
          child.off('exit', exited);
        };
        child.stdout.on('data', check);
        child.stderr.on('data', check);
        child.on('exit', exited);
        check();
      });
      expect(fs.existsSync(path.join(tmpDir, 'w1.css'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'w2.css'))).toBe(true);
      const firstCssBefore = fs.readFileSync(
        path.join(tmpDir, 'w1.css'),
        'utf-8',
      );

      const changed = `export default { name: 'w2', tokens: { '--color-bg': '#010203' } };\n`;
      fs.writeFileSync(second, changed);

      const rebuilt = await waitFor(
        () => {
          try {
            if (
              fs
                .readFileSync(path.join(tmpDir, 'w2.css'), 'utf-8')
                .includes('#010203')
            ) {
              return true;
            }
          } catch {
            // CSS mid-write; fall through to re-touch.
          }
          try {
            fs.writeFileSync(second, changed);
          } catch {
            // Re-touch failed (e.g. dir mid-teardown); the next poll retries.
          }
          return false;
        },
        {timeout: 20000, interval: 200},
      );
      expect(rebuilt).toBe(true);
      expect(stdout).toMatch(/rebuilding w2\.mjs/);
      expect(stdout).not.toMatch(/rebuilding w1\.mjs/);
      expect(fs.readFileSync(path.join(tmpDir, 'w1.css'), 'utf-8')).toBe(
        firstCssBefore,
      );
    } finally {
      child.kill('SIGINT');
    }
  }, 30_000);
});
