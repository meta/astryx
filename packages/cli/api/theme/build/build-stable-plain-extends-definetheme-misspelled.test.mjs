// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` batch L-final44: a plain base a theme extends is
 * made with defineTheme first; a misspelled field is named wherever the
 * theme object comes from; a package stylesheet the source imports is named
 * by its specifier; and a plain theme whose getter throws is a failed load.
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
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {logger} from '../../logger.mjs';
import {themeBuild} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';
import {hasModuleHooks} from '../../../test-utils/module-hooks.mjs';

vi.setConfig({testTimeout: 120_000});

const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-f44-')),
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

/**
 * A theme package of the test's own, installed in the temp project as a
 * pnpm install lays one out: its files in a store folder, linked into
 * node_modules. A defineTheme() result with tokens, and a
 * font stylesheet it exports. Self-contained: it needs only Core.
 */
const writeBasePackage = () => {
  const store = '.store/base-theme';
  write(
    `${store}/package.json`,
    JSON.stringify({
      name: '@fixture/base-theme',
      version: '1.0.0',
      type: 'module',
      exports: {'.': './index.mjs', './fonts.css': './fonts.css'},
    }),
  );
  write(
    `${store}/index.mjs`,
    `import {defineTheme} from '@astryxdesign/core/theme';\nexport const baseTheme = defineTheme({name: 'base', tokens: {'--color-accent': '#123456', '--color-bg': '#fafafa'}});\n`,
  );
  write(
    `${store}/fonts.css`,
    "@import 'https://fonts.example/fraunces.css';\n",
  );
  const link = path.join(dir, 'node_modules/@fixture/base-theme');
  fs.mkdirSync(path.dirname(link), {recursive: true});
  fs.symlinkSync(path.join(dir, store), link, 'dir');
};
const BASE = `import {baseTheme} from '@fixture/base-theme';\n`;

describe('F44-01: a plain base a theme extends', () => {
  it('is made with defineTheme first: its own base, pairs and typography are kept', async () => {
    writeBasePackage();
    write(
      'p/p.ts',
      `${BASE}const b = {name: 'b', extends: baseTheme, tokens: {'--color-text-primary': ['#111', '#eee']}, typography: {body: {family: 'Lato'}}};\nexport default {name: 'p', extends: b, tokens: {}};\n`,
    );
    const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(r.err).toBeUndefined();
    const css = fs.readFileSync(path.join(dir, 'p/p.css'), 'utf8');
    expect(css).toContain('light-dark(#111, #eee)');
    expect(css).not.toContain('#111,#eee');
    expect(css).toContain('Lato');
    // The base's own base: its accent.
    expect(css).toContain('#123456');
  });

  it('a plain base with no tokens builds', async () => {
    writeBasePackage();
    write(
      'p/q.ts',
      `${BASE}const b = {name: 'b', extends: baseTheme};\nexport default {name: 'q', extends: b};\n`,
    );
    const r = await captured(() => themeBuild('p/q.ts', {}, {cwd: dir}));
    expect(r.err).toBeUndefined();
    expect(fs.readFileSync(path.join(dir, 'p/q.css'), 'utf8')).toContain(
      '#123456',
    );
  });
});

describe('F44-06: a misspelled field the source reader cannot place', () => {
  it('is named, without a line, wherever the theme object comes from', async () => {
    for (const code of [
      `const all = {a: {name: 'p', tokenz: {'--color-accent': 'red'}}};\nexport default all.a;\n`,
      `const list = [{name: 'p', tokenz: {'--color-accent': 'red'}}];\nexport default list[0];\n`,
      `export default Object.assign({name: 'p'}, {tokenz: {'--color-accent': 'red'}});\n`,
    ]) {
      write('p/p.ts', code);
      const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(r.err, code).toBeUndefined();
      expect(r.result.data.warnings.join('\n'), code).toContain(
        'tokenz is no field defineTheme takes',
      );
    }
  });
});

describe('F44-10: a package stylesheet the theme source imports', () => {
  it.skipIf(!hasModuleHooks)(
    'is named by the specifier the source wrote, not the linked store file',
    async () => {
      writeBasePackage();
      write('p/p.ts', `import '@fixture/base-theme/fonts.css';\n${THEME}`);
      const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
      expect(r.err).toBeUndefined();
      const said = r.result.data.warnings.join('\n');
      expect(said).toContain(
        "p/p.ts imports '@fixture/base-theme/fonts.css', which the built outputs do not carry",
      );
      expect(said).not.toContain('.store');
    },
  );
});

describe('F44-11: a plain theme whose getter throws', () => {
  it('is a failed load naming the file and the field, never ERR_UNKNOWN', async () => {
    write(
      'p/p.ts',
      `export default {name: 'p', tokens: {get '--color-accent'() { throw new Error('boom'); }}};\n`,
    );
    const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(r.err?.code).toBe('ERR_THEME_LOAD');
    expect(r.err.message).toContain(
      'Failed to load theme from p/p.ts: boom (reading tokens.--color-accent)',
    );
  });
});
