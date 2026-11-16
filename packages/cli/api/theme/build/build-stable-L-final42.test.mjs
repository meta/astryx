// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` batch L-final42: a listener a theme module adds to
 * `process` goes with its load (no exit code, print after --json, or hang
 * from it), and `--out` naming a stylesheet's source map is refused while a
 * slip after `.css` is told the stylesheet name meant; and a throw from a
 * microtask a module queues while it loads refuses that load.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {logger} from '../../logger.mjs';
import {themeBuild} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';

vi.setConfig({testTimeout: 120_000});

const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const BIN = path.join(CLI_ROOT, 'clients/cli/bin/astryx.mjs');
const require = createRequire(import.meta.url);
const FIXTURE_LINKS = {
  '@astryxdesign': path.join(CLI_ROOT, 'node_modules/@astryxdesign'),
  react: path.dirname(require.resolve('react/package.json')),
};

/** @type {string} */
let dir;
beforeAll(() => ensureCoreBuilt(), 200_000);
beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-f42-')),
  );
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const [name, target] of Object.entries(FIXTURE_LINKS)) {
    const link = path.join(dir, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link, 'dir');
  }
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), text);
};
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(dir, rel));

const THEME = `export default {name: 'p', tokens: {'--color-accent': '#123456'}};\n`;

/**
 * Run the CLI as a person does, in its own process.
 * @param {string[]} args
 */
const cli = args =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
  });

/** @param {() => Promise<unknown>} run */
async function captured(run) {
  /** @type {string[]} */
  const lines = [];
  const silent = logger.silent;
  const {warn, log, error} = logger;
  logger.setSilent(false);
  logger.warn = (/** @type {string} */ l) => lines.push(l);
  logger.log = (/** @type {string} */ l) => lines.push(l);
  logger.error = (/** @type {string} */ l) => lines.push(l);
  try {
    let result;
    let err;
    try {
      result = await run();
    } catch (e) {
      err = e;
    }
    return {
      result: /** @type {any} */ (result),
      err: /** @type {any} */ (err),
      lines,
    };
  } finally {
    Object.assign(logger, {warn, log, error});
    logger.setSilent(silent);
  }
}

describe('F42-04: a listener a theme module adds to process', () => {
  it('goes with its load: no exit code, no print after --json, no hang', () => {
    for (const code of [
      `process.on('exit', () => { process.exitCode = 4; });`,
      `process.on('exit', () => console.log('bye'));`,
      `process.on('beforeExit', () => setTimeout(() => {}, 10));`,
    ]) {
      write('p/p.ts', `${code}\n${THEME}`);
      write('p/q.ts', THEME.replace("name: 'p'", "name: 'q'"));
      const r = cli(['theme', 'build', 'p/p.ts', 'p/q.ts', '--json']);
      expect(r.signal, code).toBeNull();
      expect(r.status, `${code}\n${r.stderr}`).toBe(0);
      expect(JSON.parse(r.stdout).type, code).toBe('theme.build.batch');
      expect(r.stderr, code).not.toContain('MaxListenersExceededWarning');
    }
  });
});

describe('F42-08: --out naming another kind of file of the stylesheet', () => {
  it('a source map is refused before anything is written, naming the stylesheet', async () => {
    write('p/p.ts', THEME);
    const r = await captured(() =>
      themeBuild('p/p.ts', {out: 'p/p.css.map'}, {cwd: dir}),
    );
    expect(r.err?.code).toBe('ERR_INVALID_ARGUMENT');
    expect(r.err.message).toContain(
      "--out p/p.css.map names a stylesheet's source map",
    );
    expect(r.err.message).toContain('such as p/p.css.');
    expect(fs.readdirSync(path.join(dir, 'p'))).toEqual(['p.ts']);
  });

  it('a slip after .css (p.css.bak) builds as before, and the warning names p/p.css', async () => {
    write('p/p.ts', THEME);
    const r = await captured(() =>
      themeBuild('p/p.ts', {out: 'p/x.css.bak'}, {cwd: dir}),
    );
    expect(r.err).toBeUndefined();
    const said = r.result.data.warnings.join('\n');
    expect(said).toContain('such as p/x.css.');
    expect(said).not.toContain('.css.css');
  });
});

describe('chaos N37: a theme module that throws from a microtask while it loads', () => {
  it('is a refused load naming the error, never exit 7, a stack or ERR_UNKNOWN', () => {
    write(
      'p/p.ts',
      `queueMicrotask(() => { throw new Error('micro-throw'); });\n${THEME}`,
    );
    const r = cli(['theme', 'build', 'p/p.ts', '--json']);
    expect(r.status, r.stderr).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.code).toBe('ERR_THEME_LOAD');
    expect(out.error).toContain(
      'Failed to load theme from p/p.ts: micro-throw',
    );
    expect(r.stdout + r.stderr).not.toContain('process.exit(1)');
    expect(r.stderr).not.toMatch(/^\s+at /m);
  });
});
