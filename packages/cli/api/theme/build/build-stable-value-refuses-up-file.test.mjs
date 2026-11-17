// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` batch, a theme module read in the CLI's
 * own process: a family build over a file at its key warns in --json as in
 * text; a `process.exitCode` the module sets is not the command's; a
 * PostCSS, Stylus or SugarSS import loads as an empty module; what the
 * module prints later still goes to stderr; a top-level await that never
 * settles is a refused load; the stylesheet the build writes may be
 * imported by its own source; every handle the module opens (a timer from
 * node:timers, a watcher, a server) is let go; and a promise it leaves
 * rejecting is a warning, never the command's crash.
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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-h236-')),
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

describe('N1: a family build over a file at its key', () => {
  it('replaces it as released, and the result’s warnings say so as the text does', async () => {
    write(
      'fam/ocean.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': '#0066cc'}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean';\nexport default defineTheme({extends: ocean, name: 'ocean-calm'});\n`,
    );
    write('fam/index.js', '// my barrel\n');
    const {result, err, lines} = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'index'},
        {cwd: dir},
      ),
    );
    expect(err).toBeUndefined();
    const said =
      "fam/index.js has no build header (an output of an earlier build, or a file of your own or another tool's), and this build of fam/ocean.ts replaces it";
    expect(lines.join('\n')).toContain(said);
    expect(result.data.warnings.join('\n')).toContain(said);
  });
});

describe('N2: a theme module that sets process.exitCode', () => {
  it('does not set the command’s exit code', () => {
    write('p/p.ts', `process.exitCode = 2;\n${THEME}`);
    const built = cli(['theme', 'build', 'p/p.ts']);
    expect(built.status).toBe(0);
    const checked = cli(['theme', 'build', 'p/p.ts', '--check', '--json']);
    expect(checked.status).toBe(0);
    expect(JSON.parse(checked.stdout).data.upToDate).toBe(true);
  });
});

describe('N4: a PostCSS, Stylus or SugarSS stylesheet a theme module imports', () => {
  it('loads as an empty module', async () => {
    for (const ext of ['postcss', 'stylus', 'sss']) {
      write(`p/s.${ext}`, 'a\n  color: red\n');
      write('p/p.ts', `import './s.${ext}';\n${THEME}`);
      const {err} = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(err, ext).toBeUndefined();
    }
  });
});

describe('N6: a theme module that prints after it loaded', () => {
  it('prints to stderr, and --json stays valid', () => {
    write(
      'p/p.ts',
      `setTimeout(() => console.log('LATE'), 0);\nsetTimeout(() => process.stdout.write('LATER\\n'), 50);\n${THEME}`,
    );
    const r = cli(['theme', 'build', 'p/p.ts', '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).type).toBe('theme.build');
    expect(r.stdout).not.toContain('LATE');
  });
});

describe('N7: a theme module whose top-level await never settles', () => {
  it('is a refused load, never Node’s exit 13', () => {
    write('p/p.ts', `await new Promise(() => {});\n${THEME}`);
    const r = cli(['theme', 'build', 'p/p.ts', '--json']);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.code).toBe('ERR_THEME_LOAD');
    expect(out.error).toContain(
      'Failed to load theme from p/p.ts: its top-level await never settled',
    );
    expect(r.stderr).not.toContain('unsettled top-level await');
  });
});

describe('N10: a theme source that imports its own built stylesheet', () => {
  it('builds from a clean checkout; a missing stylesheet it does not write is refused', async () => {
    write('p/p.ts', `import './p.css';\n${THEME}`);
    const built = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(built.err).toBeUndefined();
    expect(exists('p/p.css')).toBe(true);
    write('p/p.ts', `import './other.css';\n${THEME}`);
    fs.rmSync(path.join(dir, 'p/p.css'));
    const refused = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(refused.err?.code).toBe('ERR_THEME_LOAD');
    expect(refused.err.message).toContain(
      'it imports p/other.css, which is not there and is not the stylesheet this build writes (p/p.css)',
    );
    expect(exists('p/p.css')).toBe(false);
  });
});

describe('N17: handles a theme module opens', () => {
  it('never keep the command from exiting: node:timers, timers/promises, a watcher, a server', () => {
    for (const code of [
      `import {setInterval} from 'node:timers'; setInterval(() => {}, 1000);`,
      `import {setInterval as si} from 'node:timers/promises'; (async () => { for await (const _ of si(1000)) {} })();`,
      `import {watch} from 'node:fs'; watch('.', () => {});`,
      `import {createServer} from 'node:net'; createServer().listen(0);`,
    ]) {
      write('p/p.ts', `${code}\n${THEME}`);
      const r = cli(['theme', 'build', 'p/p.ts', '--json']);
      expect(r.signal, code).toBeNull();
      expect(r.status, code).toBe(0);
      expect(JSON.parse(r.stdout).type).toBe('theme.build');
    }
  });
});

describe('N29: a promise a theme module leaves rejecting', () => {
  it('is a warning on stderr after the result, never the command’s crash', () => {
    write('p/p.ts', `Promise.reject(new Error('rej'));\n${THEME}`);
    const r = cli(['theme', 'build', 'p/p.ts', '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).type).toBe('theme.build');
    expect(r.stderr).toContain(
      'Warning: a theme module left a promise that rejected and was never handled (rej)',
    );
    // A rejection of the CLI's own still fails as before.
    expect(r.stderr).not.toContain('ERR_UNKNOWN');
  });
});
