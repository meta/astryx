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

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from 'vitest';
import {execFileSync, spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
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

/**
 * Resolves once the child's output holds `count` matches of `pattern`, and
 * rejects if the child exits first. It waits on the watcher's own output, not
 * on a clock: only the test's timeout bounds it. `onPoll`, if given, runs
 * every `interval` ms while it waits.
 */
function waitForOutput(
  child,
  read,
  pattern,
  {count = 1, onPoll, interval = 250} = {},
) {
  const matches = () => (read().match(new RegExp(pattern, 'g')) ?? []).length;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (matches() >= count) {
        cleanup();
        resolve();
      }
    };
    const exited = code => {
      cleanup();
      reject(
        new Error(
          `the watcher exited (${code}) before ${pattern} x${count}:\n${read()}`,
        ),
      );
    };
    const timer = setInterval(() => {
      onPoll?.();
      check();
    }, interval);
    const cleanup = () => {
      clearInterval(timer);
      child.stdout.off('data', check);
      child.stderr.off('data', check);
      child.off('exit', exited);
    };
    child.stdout.on('data', check);
    child.stderr.on('data', check);
    child.once('exit', exited);
    check();
  });
}

/**
 * Saves `content` to `source` once, with the watcher already armed, and
 * resolves once `file` holds `color`. Rebuilds run one at a time, each one
 * printing "rebuilding" when it starts and "Watching" when it ends. A rebuild
 * still running at the save may end without the color; the first rebuild that
 * starts after the save must not: that is a stale theme, and the wait fails by
 * name. fs.watch can drop an event under load, so the save is made again
 * every 2 s, but only while no rebuild has started since it: a rebuild that
 * starts after the save reads the new content, so a stale one is never hidden.
 * More than 2 such saves fail by name: a watcher that keeps missing saves is
 * a fault to report, not to wait out.
 * @param {import('node:child_process').ChildProcess} child
 * @param {() => string} read
 * @param {{file: string, source: string, content: string, color: string}} edit
 */
function saveAndWaitForColor(child, read, {file, source, content, color}) {
  const count = (/** @type {RegExp} */ pattern) =>
    (read().match(pattern) ?? []).length;
  // Each started rebuild ends with one more "Watching" line after the first.
  const startedBefore = count(/rebuilding /g);
  fs.writeFileSync(source, content);
  let savedAt = Date.now();
  let missed = 0;
  const built = () => {
    try {
      return fs.readFileSync(file, 'utf-8').includes(color);
    } catch {
      return false;
    }
  };
  return new Promise((resolve, reject) => {
    const check = () => {
      if (built()) {
        cleanup();
        resolve(undefined);
        return;
      }
      if (
        count(/rebuilding /g) === startedBefore &&
        Date.now() - savedAt >= 2000
      ) {
        missed += 1;
        if (missed > 2) {
          cleanup();
          reject(
            new Error(
              `the watcher missed ${missed} saves in a row: no rebuild started after saving ${source}:\n${read()}`,
            ),
          );
          return;
        }
        fs.writeFileSync(source, content);
        savedAt = Date.now();
      }
      const firstAfterSaveEnded =
        count(/rebuilding /g) > startedBefore &&
        count(/Watching /g) >= startedBefore + 2;
      if (firstAfterSaveEnded && !built()) {
        cleanup();
        reject(
          new Error(
            `a rebuild after the save produced a stale theme: ${file} does not hold ${color}:\n${read()}`,
          ),
        );
      }
    };
    const exited = (/** @type {number | null} */ code) => {
      cleanup();
      reject(
        new Error(
          `the watcher exited (${code}) before ${file} held ${color}:\n${read()}`,
        ),
      );
    };
    const timer = setInterval(check, 250);
    const cleanup = () => {
      clearInterval(timer);
      child.stdout?.off('data', check);
      child.stderr?.off('data', check);
      child.off('exit', exited);
    };
    child.stdout?.on('data', check);
    child.stderr?.on('data', check);
    child.once('exit', exited);
    check();
  });
}

/**
 * Resolves with the child's exit code once it exits and its output is read.
 * Only the test's timeout bounds the wait, and each test kills its watcher
 * when it finishes.
 */
function waitForExit(child) {
  // `close` comes after the output streams end, so the last output is read.
  if (child.stdout?.readableEnded && child.exitCode != null)
    return Promise.resolve(child.exitCode);
  return new Promise(resolve => child.once('close', code => resolve(code)));
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

describe('the wait for a saved edit', () => {
  /** A watcher stand-in whose output the case writes. */
  function fakeWatcher() {
    const child = /** @type {any} */ (new EventEmitter());
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    let out = '';
    const print = (/** @type {string} */ line) => {
      out += `${line}\n`;
      child.stdout.emit('data', Buffer.from(line));
    };
    return {child, print, read: () => out};
  }

  it('fails by name when the first rebuild after the save ends without the color', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-wait-'));
    onTestFinished(() => fs.rmSync(dir, {recursive: true, force: true}));
    const file = path.join(dir, 'a.css');
    const source = path.join(dir, 'a.mjs');
    fs.writeFileSync(file, '--color-bg: #010203');
    const w = fakeWatcher();
    w.print('Watching a.mjs for changes');
    const wait = saveAndWaitForColor(w.child, w.read, {
      file,
      source,
      content: 'x',
      color: '#040506',
    });
    w.print('Change detected — rebuilding a.mjs...');
    w.print('Watching a.mjs for changes');
    await expect(wait).rejects.toThrow(
      'a rebuild after the save produced a stale theme',
    );
  });

  it('fails by name when the watcher misses more than two saves in a row', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-wait-'));
    onTestFinished(() => fs.rmSync(dir, {recursive: true, force: true}));
    const file = path.join(dir, 'a.css');
    const source = path.join(dir, 'a.mjs');
    fs.writeFileSync(file, '--color-bg: #010203');
    const w = fakeWatcher();
    // Armed, but no rebuild ever starts.
    w.print('Watching a.mjs for changes');
    await expect(
      saveAndWaitForColor(w.child, w.read, {
        file,
        source,
        content: 'x',
        color: '#040506',
      }),
    ).rejects.toThrow('the watcher missed 3 saves in a row');
  }, 20_000);

  it('lets a rebuild running at the save end without the color, and takes the next one', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-wait-'));
    onTestFinished(() => fs.rmSync(dir, {recursive: true, force: true}));
    const file = path.join(dir, 'a.css');
    const source = path.join(dir, 'a.mjs');
    fs.writeFileSync(file, '--color-bg: #010203');
    const w = fakeWatcher();
    w.print('Watching a.mjs for changes');
    w.print('Change detected — rebuilding a.mjs...');
    const wait = saveAndWaitForColor(w.child, w.read, {
      file,
      source,
      content: 'x',
      color: '#040506',
    });
    // The rebuild that was running ends with the old color.
    w.print('Watching a.mjs for changes');
    // The rebuild of the save starts, writes the color, and ends.
    w.print('Change detected — rebuilding a.mjs...');
    fs.writeFileSync(file, '--color-bg: #040506');
    w.print('Watching a.mjs for changes');
    await expect(wait).resolves.toBeUndefined();
    expect(fs.readFileSync(source, 'utf-8')).toBe('x');
  });
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
    // Vitest runs this even when the test times out mid-wait, which skips the
    // `finally` below, so the watcher never outlives the test.
    onTestFinished(() => {
      child.kill('SIGKILL');
    });
    let stdout = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stdout += d.toString()));

    const read = () => stdout;
    try {
      // The watcher prints "Watching" once its initial build has finished and
      // fs.watch is armed, and again after each rebuild finishes.
      await waitForOutput(child, read, 'Watching');
      expect(fs.readFileSync(cssFile, 'utf-8')).toMatch(/#ffffff/);

      // Change the theme: the token value changes, so the CSS must change.
      // fs.watch can drop an event under load, so the write repeats until the
      // watcher reports the change (an idempotent write).
      const changed = `export default { name: 'wt', tokens: { '--color-bg': '#010203' } };\n`;
      fs.writeFileSync(themeFile, changed);
      await waitForOutput(child, read, 'rebuilding wt\\.mjs', {
        onPoll: () => {
          try {
            fs.writeFileSync(themeFile, changed);
          } catch {
            // The temporary folder is gone at teardown.
          }
        },
      });
      // The second "Watching" line follows the finished rebuild.
      await waitForOutput(child, read, 'Watching', {count: 2});
      expect(fs.readFileSync(cssFile, 'utf-8')).toContain('#010203');
    } finally {
      // SIGINT must stop the watcher and exit cleanly.
      child.kill('SIGINT');
    }

    await waitForExit(child);
    expect(stdout).toMatch(/Stopped watching/);
  }, 30_000);

  it('rebuilds when a local file the theme imports changes, in another folder too', async () => {
    fs.mkdirSync(path.join(tmpDir, 'parts'));
    const colors = path.join(tmpDir, 'parts', 'colors.mjs');
    fs.writeFileSync(colors, `export const BG = '#ffffff';\n`);
    fs.writeFileSync(
      path.join(tmpDir, 'wi.mjs'),
      `import {BG} from './parts/colors.mjs';\nexport default { name: 'wi', tokens: { '--color-bg': BG } };\n`,
    );
    const child = spawn(
      process.execPath,
      [CLI_BIN, 'theme', 'build', 'wi.mjs', '--watch'],
      {cwd: tmpDir, env: {...process.env, FORCE_COLOR: '0'}},
    );
    onTestFinished(() => {
      child.kill('SIGKILL');
    });
    let stdout = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stdout += d.toString()));
    const read = () => stdout;
    try {
      await waitForOutput(child, read, 'Watching');
      const changed = `export const BG = '#010203';\n`;
      await waitForOutput(child, read, 'rebuilding wi\\.mjs', {
        onPoll: () => {
          try {
            fs.writeFileSync(colors, changed);
          } catch {
            // The temporary folder is gone at teardown.
          }
        },
      });
      await waitForOutput(child, read, 'Watching', {count: 2});
      expect(fs.readFileSync(path.join(tmpDir, 'wi.css'), 'utf-8')).toContain(
        '#010203',
      );
    } finally {
      child.kill('SIGINT');
    }
    await waitForExit(child);
  }, 30_000);

  it('stops at once when interrupted mid-rebuild, and drops a queued change', async () => {
    const themeFile = path.join(tmpDir, 'ws.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'ws', tokens: { '--color-bg': '#ffffff' } };\n`,
    );
    // Top-level await holds every rebuild of this version in progress for 20 s,
    // then writes a marker. A stop that waited for the rebuild would let the
    // marker appear before the watcher exits.
    const finished = path.join(tmpDir, 'rebuild-finished');
    const slow =
      `import fs from 'node:fs';\n` +
      `await new Promise(resolve => setTimeout(resolve, 20000));\n` +
      `fs.writeFileSync(${JSON.stringify(finished)}, '');\n` +
      `export default { name: 'ws', tokens: { '--color-bg': '#010203' } };\n`;

    const child = spawn(
      process.execPath,
      [CLI_BIN, 'theme', 'build', 'ws.mjs', '--watch'],
      {cwd: tmpDir, env: {...process.env, FORCE_COLOR: '0'}},
    );
    onTestFinished(() => {
      child.kill('SIGKILL');
    });
    let stdout = '';
    const read = () => stdout;
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stdout += d.toString()));

    try {
      await waitForOutput(child, read, 'Watching');
      // Start the slow rebuild, re-touching in case a watch event is dropped.
      await waitForOutput(child, read, 'rebuilding ws\\.mjs', {
        onPoll: () => {
          try {
            fs.writeFileSync(themeFile, slow);
          } catch {
            // The temporary folder is gone at teardown.
          }
        },
      });
      // Queue a change behind the rebuild in progress (debounce is 100 ms).
      fs.writeFileSync(themeFile, `${slow}// queued\n`);
      // Let the 100 ms debounce queue the change. This is not a deadline: a slow
      // runner can only leave the change unqueued, never fail the test.
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      child.kill('SIGINT');
    }

    await waitForExit(child);
    // The stop ended the rebuild in progress instead of waiting for it, and
    // started no queued one.
    expect(fs.existsSync(finished)).toBe(false);
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
      onTestFinished(() => {
        child.kill('SIGKILL');
      });
      let stdout = '';
      child.stdout.on('data', d => (stdout += d.toString()));
      child.stderr.on('data', d => (stdout += d.toString()));
      try {
        await waitForOutput(child, () => stdout, 'Watching');
      } finally {
        child.kill('SIGINT');
      }
      await waitForExit(child);
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
    // Vitest runs this even when the test times out mid-wait, which skips the
    // `finally` below, so the watcher never outlives the test.
    onTestFinished(() => {
      child.kill('SIGKILL');
    });
    let stdout = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stdout += d.toString()));

    try {
      // The watcher prints its "Watching" line once every initial build has
      // finished, and those builds run one after another, each in its own
      // child process. Wait for that line instead of polling for the files
      // under the 8 s deadline: on a loaded runner two builds can outlast it.
      // If the line never comes, the test fails at its own time limit.
      await waitForOutput(child, () => stdout, 'Watching w1\\.mjs, w2\\.mjs');
      expect(fs.existsSync(path.join(tmpDir, 'w1.css'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'w2.css'))).toBe(true);
      const firstCssBefore = fs.readFileSync(
        path.join(tmpDir, 'w1.css'),
        'utf-8',
      );

      const changed = `export default { name: 'w2', tokens: { '--color-bg': '#010203' } };\n`;
      fs.writeFileSync(second, changed);

      // fs.watch can drop an event under load, so the write repeats until the
      // watcher reports the change; the next "Watching" line follows the
      // finished rebuild.
      await waitForOutput(child, () => stdout, 'rebuilding w2\\.mjs', {
        onPoll: () => {
          try {
            fs.writeFileSync(second, changed);
          } catch {
            // The temporary folder is gone at teardown.
          }
        },
      });
      await waitForOutput(child, () => stdout, 'Watching w1\\.mjs, w2\\.mjs', {
        count: 2,
      });
      expect(fs.readFileSync(path.join(tmpDir, 'w2.css'), 'utf-8')).toContain(
        '#010203',
      );
      expect(stdout).toMatch(/rebuilding w2\.mjs/);
      expect(stdout).not.toMatch(/rebuilding w1\.mjs/);
      expect(fs.readFileSync(path.join(tmpDir, 'w1.css'), 'utf-8')).toBe(
        firstCssBefore,
      );
    } finally {
      child.kill('SIGINT');
    }
  }, 30_000);

  it.each([
    ['', 0],
    // A second between saves gives the rebuilds of one save time to finish
    // before the next save: the race a count of "Watching" lines lost on CI.
    [', saving the next color a second after the last one landed', 1000],
  ])(
    'prints the --out editor-folder warning once per session, not on every rebuild%s',
    async (_pause, pauseMs) => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app"}\n');
      const editor = path.join(tmpDir, 'themes', 'g');
      fs.mkdirSync(editor, {recursive: true});
      fs.writeFileSync(
        path.join(editor, 'g.settings.json'),
        JSON.stringify({like: 'neutral', settings: []}),
      );
      const source = path.join(tmpDir, 'other.mjs');
      const version = (/** @type {string} */ color) =>
        `export default { name: 'other', tokens: { '--color-bg': '${color}' } };\n`;
      fs.writeFileSync(source, version('#ffffff'));

      const child = spawn(
        process.execPath,
        [
          CLI_BIN,
          'theme',
          'build',
          'other.mjs',
          '--out',
          'themes/g/a.css',
          '--watch',
        ],
        {cwd: tmpDir, env: {...process.env, FORCE_COLOR: '0'}},
      );
      onTestFinished(() => {
        child.kill('SIGKILL');
      });
      let out = '';
      let stderr = '';
      child.stdout.on('data', d => (out += d.toString()));
      child.stderr.on('data', d => {
        stderr += d.toString();
        out += d.toString();
      });

      try {
        await waitForOutput(child, () => out, 'Watching other\\.mjs');
        // Two rebuilds, each writing into the editor folder again.
        for (const color of ['#010203', '#040506']) {
          if (color !== '#010203' && pauseMs)
            await new Promise(resolve => setTimeout(resolve, pauseMs));
          await saveAndWaitForColor(child, () => out, {
            file: path.join(editor, 'a.css'),
            source,
            content: version(color),
            color,
          });
        }
        expect(fs.readFileSync(path.join(editor, 'a.css'), 'utf-8')).toContain(
          '#040506',
        );
        expect(
          out.match(/rebuilding other\.mjs/g)?.length,
        ).toBeGreaterThanOrEqual(2);
        expect(stderr.match(/theme editor made/g)).toHaveLength(1);
      } finally {
        child.kill('SIGINT');
      }
    },
    60_000,
  );

  it('prints the editor-theme warning once per session, not on every rebuild', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app"}\n');
    const editor = path.join(tmpDir, 'themes', 'g');
    fs.mkdirSync(editor, {recursive: true});
    fs.writeFileSync(
      path.join(editor, 'g.settings.json'),
      JSON.stringify({like: 'neutral', settings: []}),
    );
    const source = path.join(editor, 'g.theme.ts');
    const version = (/** @type {string} */ color) =>
      `export default { name: 'g', tokens: { '--color-bg': '${color}' } };\n`;
    fs.writeFileSync(source, version('#ffffff'));
    const child = spawn(
      process.execPath,
      [CLI_BIN, 'theme', 'build', 'themes/g/g.theme.ts', '--watch'],
      {cwd: tmpDir, env: {...process.env, FORCE_COLOR: '0'}},
    );
    onTestFinished(() => {
      child.kill('SIGKILL');
    });
    let out = '';
    let stderr = '';
    child.stdout.on('data', d => (out += d.toString()));
    child.stderr.on('data', d => {
      stderr += d.toString();
      out += d.toString();
    });
    try {
      await waitForOutput(child, () => out, 'Watching');
      for (const color of ['#010203', '#040506']) {
        await saveAndWaitForColor(child, () => out, {
          file: path.join(editor, 'g.css'),
          source,
          content: version(color),
          color,
        });
      }
      expect(stderr.match(/is a theme the theme editor made/g)).toHaveLength(1);
    } finally {
      child.kill('SIGINT');
    }
  }, 60_000);
});
