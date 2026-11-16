// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` batch L-final43: a theme module's changes to
 * `console`, a global or the file mode mask are put back after its load; a
 * plain-object theme is resolved by defineTheme (pairs, media surfaces),
 * with or without tokens and with `extends`; a spread of a package theme is
 * refused naming the form that builds; and a stylesheet the source imports
 * is named as one the outputs do not carry.
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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-f43-')),
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

/**
 * A theme package of the test's own, installed in the temp project: a
 * defineTheme() result with tokens and an icon registry, as a published base
 * theme ships one. Self-contained: it needs only Core.
 */
const writeBasePackage = () => {
  write(
    'node_modules/@fixture/base-theme/package.json',
    JSON.stringify({
      name: '@fixture/base-theme',
      version: '1.0.0',
      type: 'module',
      exports: {'.': './index.mjs'},
    }),
  );
  write(
    'node_modules/@fixture/base-theme/index.mjs',
    `import {defineTheme} from '@astryxdesign/core/theme';\nexport const baseTheme = defineTheme({name: 'base', tokens: {'--color-accent': '#123456', '--color-bg': '#fafafa'}, icons: {close: 'x'}});\n`,
  );
};
const BASE = `import {baseTheme} from '@fixture/base-theme';\n`;

describe('F43-07: what a theme module changes for the whole process', () => {
  it('console, a global and the file mode mask are put back after its load', () => {
    for (const code of [
      `console.log = () => {};`,
      `globalThis.Buffer = undefined;`,
      `process.umask(0o777);`,
    ]) {
      write('p/p.ts', `${code}\n${THEME}`);
      write('p/q.ts', THEME.replace("name: 'p'", "name: 'q'"));
      const r = cli(['theme', 'build', 'p/p.ts', 'p/q.ts', '--json']);
      expect(r.status, `${code}\n${r.stderr}`).toBe(0);
      expect(JSON.parse(r.stdout).type, code).toBe('theme.build.batch');
      for (const file of ['p/p.css', 'p/q.css'])
        expect(
          fs.statSync(path.join(dir, file)).mode & 0o400,
          `${code} ${file}`,
        ).toBe(0o400);
    }
  });
});

describe('F43-11: a plain-object theme is resolved as defineTheme input', () => {
  it('a [light, dark] pair is written as light-dark(), and the media-surface rules are written', async () => {
    write(
      'p/p.ts',
      `export default {name: 'p', tokens: {'--color-accent': ['#fff', '#000']}};\n`,
    );
    const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(r.err).toBeUndefined();
    const css = fs.readFileSync(path.join(dir, 'p/p.css'), 'utf8');
    expect(css).toContain('light-dark(#fff, #000)');
    expect(css).not.toContain('#fff,#000');
    write('p/e.ts', `export default {name: 'e', tokens: {}};\n`);
    await captured(() => themeBuild('p/e.ts', {}, {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'p/e.css'), 'utf8')).toContain(
      '[data-astryx-media',
    );
  });
});

describe('F43-08: a plain-object theme with extends and no tokens', () => {
  it('builds as the empty theme over its base', async () => {
    writeBasePackage();
    write('p/p.ts', `${BASE}export default {name: 'p', extends: baseTheme};\n`);
    const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(r.err).toBeUndefined();
    expect(r.result.data.tokenCount).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(dir, 'p/p.css'), 'utf8')).toContain(
      '#123456',
    );
    write(
      'p/n.ts',
      `${BASE}export const n = {name: 'n', extends: baseTheme};\n`,
    );
    const named = await captured(() => themeBuild('p/n.ts', {}, {cwd: dir}));
    expect(named.err).toBeUndefined();
    expect(named.result.data.tokenCount).toBeGreaterThan(0);
  });
});

describe('F43-09: a spread of a package theme', () => {
  it('is refused naming the spread and the extends form that builds', async () => {
    writeBasePackage();
    write('p/p.ts', `${BASE}export default {...baseTheme, name: 'p'};\n`);
    const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(r.err?.code).toBe('ERR_THEME_INVALID');
    expect(r.err.message).toContain('The theme spreads baseTheme');
    expect(r.err.message).toContain('extends: baseTheme');
    expect(r.err.message).not.toContain('icons: baseTheme');
  });
});

describe('F43-10: a stylesheet the theme source imports', () => {
  it('is named as one the built outputs do not carry', async () => {
    write('p/brand.css', '.brand { color: red; }\n');
    write('p/p.ts', `import './brand.css';\n${THEME}`);
    const r = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(r.err).toBeUndefined();
    expect(r.result.data.warnings.join('\n')).toContain(
      'p/p.ts imports p/brand.css, which the built outputs do not carry',
    );
  });
});
