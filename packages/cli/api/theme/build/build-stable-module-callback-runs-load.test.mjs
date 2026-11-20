// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` batch: a theme module's callback that
 * runs after its load (exit, exitCode, a throw) leaves the command its own
 * verdict; a family root may import the family's stylesheet and a source
 * its own stylesheet with a query; a project in a folder with `#` in its
 * name builds a theme importing a stylesheet; and `--out` naming a
 * declaration file is refused; and what a module changes for the whole process
 * (the working folder, a built-in object) is put back after its load.
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
import {themeBuild, themeBuildFamily} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';
import {hasModuleHooks} from '../../../test-utils/module-hooks.mjs';

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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-h241#')),
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

/** A second theme whose load takes a while, so a first theme's timer fires during it. */
const SLOW = `await new Promise(resolve => setTimeout(resolve, 300));\nexport default {name: 'slow', tokens: {'--color-accent': '#654321'}};\n`;

describe("#1: a theme module's callback after its load", () => {
  it('calling process.exit is ignored with a warning, and the command keeps its verdict', () => {
    write('p/p.ts', `setTimeout(() => process.exit(7), 20);\n${THEME}`);
    write('p/slow.ts', SLOW);
    const r = cli(['theme', 'build', 'p/p.ts', 'p/slow.ts', '--json']);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).type).toBe('theme.build.batch');
    expect(exists('p/slow.css')).toBe(true);
    expect(r.stderr).toContain(
      'Warning: a theme module called process.exit(7) after it loaded',
    );
  });

  it("setting process.exitCode does not set the command's", () => {
    write(
      'p/p.ts',
      `setTimeout(() => { process.exitCode = 3; }, 20);\n${THEME}`,
    );
    write('p/slow.ts', SLOW);
    const r = cli(['theme', 'build', 'p/p.ts', 'p/slow.ts']);
    expect(r.status, r.stderr).toBe(0);
  });
});

describe("#2: a theme module's callback that throws after its load", () => {
  it('is a warning, never ERR_UNKNOWN, and the command keeps its verdict', () => {
    write(
      'p/p.ts',
      `setTimeout(() => { throw new Error('late boom'); }, 20);\n${THEME}`,
    );
    write('p/slow.ts', SLOW);
    const r = cli(['theme', 'build', 'p/p.ts', 'p/slow.ts', '--json']);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).type).toBe('theme.build.batch');
    expect(r.stderr).toContain(
      "Warning: a theme module's callback threw after it loaded (late boom)",
    );
    expect(r.stdout + r.stderr).not.toContain('ERR_UNKNOWN');
  });
});

describe('#4: a source importing the stylesheet its own build writes', () => {
  it.skipIf(!hasModuleHooks)(
    'a family root importing the family stylesheet builds from a clean checkout',
    async () => {
      write(
        'fam/ocean.ts',
        `import {defineTheme} from '@astryxdesign/core/theme';\nimport './k.css';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': '#0066cc'}});\n`,
      );
      write(
        'fam/ocean-calm.ts',
        `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean.ts';\nexport default defineTheme({extends: ocean, name: 'ocean-calm'});\n`,
      );
      const check = await captured(() =>
        themeBuildFamily(
          ['fam/ocean.ts', 'fam/ocean-calm.ts'],
          {familyKey: 'k', check: true},
          {cwd: dir},
        ),
      );
      expect(check.err).toBeUndefined();
      expect(check.result.data.upToDate).toBe(false);
      const built = await captured(() =>
        themeBuildFamily(
          ['fam/ocean.ts', 'fam/ocean-calm.ts'],
          {familyKey: 'k'},
          {cwd: dir},
        ),
      );
      expect(built.err).toBeUndefined();
      expect(exists('fam/k.css')).toBe(true);
    },
  );

  it.skipIf(!hasModuleHooks)(
    'an import of its own stylesheet with a query (?inline) builds from a clean checkout',
    async () => {
      write('p/p.ts', `import './p.css?inline';\n${THEME}`);
      const built = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(built.err).toBeUndefined();
      expect(exists('p/p.css')).toBe(true);
    },
  );
});

describe('#8: a project in a folder with # in its name', () => {
  it.skipIf(!hasModuleHooks)(
    'builds a theme importing a stylesheet that is there',
    async () => {
      expect(dir).toContain('#');
      write('p/s.css', '.x { color: red; }\n');
      write('p/p.ts', `import './s.css';\n${THEME}`);
      const built = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(built.err).toBeUndefined();
      expect(exists('p/p.css')).toBe(true);
    },
  );
});

describe('#9: --out naming a declaration file', () => {
  it('is refused before anything is written, naming the stylesheet to give', async () => {
    write('p/p.ts', THEME);
    for (const [out, fixed] of [
      ['p/p.css.d.ts', 'p/p.css'],
      ['p/x.css.d.ts', 'p/x.css'],
    ]) {
      const r = await captured(() => themeBuild('p/p.ts', {out}, {cwd: dir}));
      expect(r.err?.code, out).toBe('ERR_INVALID_ARGUMENT');
      expect(r.err.message).toContain(
        `--out ${out} names a TypeScript declaration file`,
      );
      expect(r.err.message).toContain(`such as ${fixed}.`);
      expect(r.err.message).not.toContain('.css.css');
    }
    expect(fs.readdirSync(path.join(dir, 'p'))).toEqual(['p.ts']);
  });
});

describe('what a theme module changes for the whole process', () => {
  it('is put back when its load ends: the working folder, JSON, Object.prototype', () => {
    for (const code of [
      `process.chdir('/');`,
      `JSON.stringify = () => 'X';`,
      `Object.prototype.polluted = 'x';`,
    ]) {
      write('p/p.ts', `${code}\n${THEME}`);
      write('p/q.ts', THEME.replace("name: 'p'", "name: 'q'"));
      const r = cli(['theme', 'build', 'p/p.ts', 'p/q.ts', '--json']);
      expect(r.status, `${code}\n${r.stderr}`).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.type, code).toBe('theme.build.batch');
      expect(exists('p/p.css'), code).toBe(true);
      expect(exists('p/q.css'), code).toBe(true);
      expect(r.stdout, code).not.toContain('polluted');
    }
  });
});
