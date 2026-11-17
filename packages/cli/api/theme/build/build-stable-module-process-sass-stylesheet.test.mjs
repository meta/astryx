// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` batch, the theme module read in the
 * CLI's own process: a Sass or Less stylesheet it imports loads as an empty
 * module; a path alias the project's tsconfig maps is named as one, never
 * offered as a package to install; the module's comment names the
 * stylesheet --out writes; a multi-file build that stops says what it wrote
 * before; a default export holding themes is named so; an exit the module
 * calls refuses its load; a value it throws is told as it is; what it
 * prints never reaches the JSON on stdout; and a timer it leaves running
 * never keeps the command from exiting.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {logger} from '../../logger.mjs';
import {themeBuild} from './build.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

vi.setConfig({testTimeout: 120_000});

const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const BIN = path.join(CLI_ROOT, 'clients/cli/bin/astryx.mjs');

/** @type {string} */
let dir;
beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-h213-')),
  );
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}\n');
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
const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');

const THEME = `export default {name: 'p', tokens: {'--color-accent': '#123456'}};\n`;

/**
 * Run `run` with logger lines captured.
 * @param {() => Promise<unknown>} run
 */
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

describe('N2: a Sass, Less or Stylus stylesheet a theme module imports', () => {
  it('loads as an empty module, as a .css import does', async () => {
    for (const ext of ['scss', 'sass', 'less', 'styl']) {
      write(`p/s.${ext}`, '$x: 1;\n');
      write('p/p.ts', `import './s.${ext}';\n${THEME}`);
      const {err} = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(err, ext).toBeUndefined();
      expect(read('p/p.css')).toContain('#123456');
    }
  });
});

describe('N5: a path alias the project’s tsconfig maps', () => {
  it('is named an alias, never offered as a package to install', async () => {
    write(
      'tsconfig.json',
      `{\n  // the app's aliases\n  "compilerOptions": {"baseUrl": ".", "paths": {"@app/*": ["./lib/*"]},},\n}\n`,
    );
    write('lib/c.ts', `export const accent = '#123456';\n`);
    for (const spec of ['@app/c', 'lib/c']) {
      write(
        'p/p.ts',
        `import {accent} from '${spec}';\nexport default {name: 'p', tokens: {'--color-accent': accent}};\n`,
      );
      const {err} = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(err?.code, spec).toBe('ERR_THEME_LOAD');
      expect(err.message).toContain(
        `The theme imports ${spec}, which names no package: a path alias`,
      );
      expect(err.message).not.toContain('not installed');
      const offered = (err.suggestions ?? []).map(
        (/** @type {any} */ s) => s.name,
      );
      expect(offered.join('\n')).not.toMatch(/install|add /);
    }
    // A package the project does not alias is still offered its install.
    write(
      'p/p.ts',
      `import {accent} from 'some-missing-pkg';\nexport default {name: 'p', tokens: {'--color-accent': accent}};\n`,
    );
    const missing = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(missing.err.message).toContain('which is not installed');
  });
});

describe('N4: --out naming another stylesheet', () => {
  it('the built module’s comment names the stylesheet written', async () => {
    write('p/p.ts', THEME);
    const {err} = await captured(() =>
      themeBuild('p/p.ts', {out: 'o/brand.css'}, {cwd: dir}),
    );
    expect(err).toBeUndefined();
    expect(fs.existsSync(path.join(dir, 'o/brand.css'))).toBe(true);
    const js = read('o/p.js');
    expect(js).toContain("import './brand.css';");
    expect(js).not.toContain("import './p.css';");
  });
});

describe('N11: a multi-file build that stops at a failure', () => {
  it('says in --json what it wrote before, and "nothing was written" only of the failing file', async () => {
    write(
      'p/a.ts',
      `export default {name: 'a', tokens: {'--color-accent': '#123456'}};\n`,
    );
    write(
      'p/b.ts',
      `export default {name: 'b',\ncomponents: {card: {base: null}}};\n`,
    );
    const r = await runCli(
      ['theme', 'build', 'p/a.ts', 'p/b.ts', '--json'],
      dir,
    );
    expect(r.status).toBe(1);
    const error = JSON.parse(r.stdout).error;
    expect(error).toContain('Nothing was written for p/b.ts.');
    expect(error).toContain(
      'The themes before it were built and written: p/a.css, p/a.css.d.ts, p/a.js, p/a.d.ts.',
    );
    expect(fs.existsSync(path.join(dir, 'p/a.css'))).toBe(true);
    // Failing first, nothing is written, and the message says only that.
    fs.rmSync(path.join(dir, 'p/a.css'));
    const first = await runCli(
      ['theme', 'build', 'p/b.ts', 'p/a.ts', '--json'],
      dir,
    );
    expect(JSON.parse(first.stdout).error).not.toContain('built and written');
  });
});

describe('N13: a default export that holds themes', () => {
  it('is named so, with themes by name beside it and without', async () => {
    write(
      'p/p.ts',
      `export const light = {name: 'brand-light', tokens: {'--color-accent': '#111111'}};\nexport const dark = {name: 'brand-dark', tokens: {'--color-accent': '#eeeeee'}};\nexport default {light, dark};\n`,
    );
    const both = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(both.err).toBeUndefined();
    expect(both.lines.join('\n')).toContain(
      'has a default export that holds themes (light, dark), not a theme, and exports 2 themes by name (dark, light), and this build builds dark only',
    );
    expect(both.lines.join('\n')).not.toContain('no default');
    write(
      'p/q.ts',
      `const light = {name: 'brand-light', tokens: {'--color-accent': '#111111'}};\nconst dark = {name: 'brand-dark', tokens: {'--color-accent': '#eeeeee'}};\nexport default {light, dark};\n`,
    );
    const only = await captured(() => themeBuild('p/q.ts', {}, {cwd: dir}));
    expect(only.err?.code).toBe('ERR_THEME_LOAD');
    expect(only.err.message).toContain(
      'The default export is an object holding themes (light, dark), not a theme: export default the theme to build, or give each theme its own file.',
    );
    expect(only.err.message).not.toContain('name property');
  });
});

describe('N14: a theme module that calls process.exit while it loads', () => {
  it('refuses the load, and --check never passes without its verdict', async () => {
    write('p/p.ts', THEME);
    await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    write(
      'p/p.ts',
      `if (process.env.ASTRYX_H213_FLAG !== 'on') process.exit(0);\nexport default {name: 'p', tokens: {'--color-accent': '#00ff00'}};\n`,
    );
    const check = await captured(() =>
      themeBuild('p/p.ts', {check: true}, {cwd: dir}),
    );
    expect(check.err?.code).toBe('ERR_THEME_LOAD');
    expect(check.err.message).toContain(
      'the module called process.exit(0) while it loaded',
    );
    // The CLI's own exit is untouched once the load is done.
    expect(typeof process.exit).toBe('function');
    const r = spawnSync(
      process.execPath,
      [BIN, 'theme', 'build', 'p/p.ts', '--check', '--json'],
      {cwd: dir, encoding: 'utf8', timeout: 60_000},
    );
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).code).toBe('ERR_THEME_LOAD');
  });
});

describe('N15: a theme module that throws a value that is not an Error', () => {
  it('tells what it threw, with the file', async () => {
    for (const [thrown, said] of [
      ["'accent missing'", 'it threw "accent missing"'],
      ['null', 'it threw null'],
      ['{code: 42}', 'it threw {"code":42}'],
    ]) {
      write('p/p.ts', `throw ${thrown};\n`);
      const {err} = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(err?.code).toBe('ERR_THEME_LOAD');
      expect(err.message).toContain(
        `Failed to load theme from p/p.ts: ${said}`,
      );
    }
  });
});

describe('N16: a theme module that prints', () => {
  it('never reaches the JSON on stdout: it goes to stderr', () => {
    write('p/p.ts', `console.log('debug: loading the theme');\n${THEME}`);
    // The CLI as a person runs it: stdout is the JSON alone.
    const r = spawnSync(
      process.execPath,
      [BIN, 'theme', 'build', 'p/p.ts', '--json'],
      {cwd: dir, encoding: 'utf8', timeout: 60_000},
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).type).toBe('theme.build');
    expect(r.stderr).toContain('debug: loading the theme');
  });
});

describe('N17: a timer a theme module waits on while it loads', () => {
  it('keeps its promise form: promisify(setTimeout) resolves, and the build reads the theme', async () => {
    write(
      'p/p.mjs',
      `import {promisify} from 'node:util';\nawait promisify(setTimeout)(5);\nawait new Promise(resolve => setTimeout(resolve, 5));\n${THEME}`,
    );
    const {err} = await captured(() => themeBuild('p/p.mjs', {}, {cwd: dir}));
    expect(err).toBeUndefined();
    expect(read('p/p.css')).toContain('#123456');
    // Outside a theme load the timers are Node's own, promise form included.
    const {promisify} = await import('node:util');
    await expect(promisify(setTimeout)(1, 'v')).resolves.toBe('v');
  });
});

describe('N17: a theme module that leaves a timer running', () => {
  it('never keeps build or --check from exiting', () => {
    write('p/p.ts', `setInterval(() => {}, 1000);\n${THEME}`);
    for (const args of [[], ['--check']]) {
      const r = spawnSync(
        process.execPath,
        [BIN, 'theme', 'build', 'p/p.ts', ...args],
        {cwd: dir, encoding: 'utf8', timeout: 60_000},
      );
      expect(r.signal, args.join(' ')).toBeNull();
      expect(r.status).toBe(0);
    }
  });
});
