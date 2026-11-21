// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` refusals that lead somewhere: a `.js` theme source
 * named after its theme is offered a free folder for its outputs, and a base
 * imported as a package's default export (or the package as one object) is
 * told the named import that works.
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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-leads-')),
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
const read = (/** @type {string} */ rel) =>
  fs.readFileSync(path.join(dir, rel), 'utf8');

describe('a .js theme source named after its theme', () => {
  it('is offered a free folder, and following it builds with the source kept', async () => {
    const source = `export default {name: 'brand', tokens: {'--color-accent': '#123456'}};\n`;
    write('design/brand.js', source);
    const r = await captured(() =>
      themeBuild('design/brand.js', {}, {cwd: dir}),
    );
    expect(r.err?.code).toBe('ERR_THEME_INVALID');
    expect(r.err.message).toContain(
      'The output design/brand.js is the theme source itself, so the build does not write it. Build the outputs into another folder with --out, such as --out design/brand-2/brand.css.',
    );
    const names = (r.err.suggestions ?? []).map(
      (/** @type {any} */ s) => s.name,
    );
    expect(names).toEqual([
      expect.stringMatching(
        / theme build design\/brand\.js --out design\/brand-2\/brand\.css$/,
      ),
    ]);
    const followed = await captured(() =>
      themeBuild(
        'design/brand.js',
        {out: 'design/brand-2/brand.css'},
        {cwd: dir},
      ),
    );
    expect(followed.err).toBeUndefined();
    expect(exists('design/brand-2/brand.js')).toBe(true);
    expect(read('design/brand.js')).toBe(source);
  });
});

describe('a base imported as a package as a whole', () => {
  const writeBase = () => {
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
      "import {defineTheme} from '@astryxdesign/core/theme';\nexport const baseTheme = defineTheme({name: 'base', tokens: {'--color-accent': '#123456'}});\nexport const basePalette = {};\n",
    );
  };
  it.each([
    [
      'its default export',
      "import base from '@fixture/base-theme';",
      'the default export of @fixture/base-theme',
    ],
    [
      'all of it as one object',
      "import * as base from '@fixture/base-theme';",
      'all of @fixture/base-theme as one object',
    ],
  ])('%s is told the named import that works', async (_label, line, how) => {
    writeBase();
    write(
      'acme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\n${line}\nexport default defineTheme({name: 'acme', extends: base, tokens: {}});\n`,
    );
    const r = await captured(() => themeBuild('acme.ts', {}, {cwd: dir}));
    expect(r.err?.code).toBe('ERR_THEME_LOAD');
    expect(r.err.message).toContain(
      `The theme extends ${how}, which is not a theme: a theme package exports its theme by name (baseTheme). Import it so: import {baseTheme} from '@fixture/base-theme', and extend baseTheme.`,
    );
    // Following it builds.
    write(
      'acme.ts',
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {baseTheme} from '@fixture/base-theme';\nexport default defineTheme({name: 'acme', extends: baseTheme, tokens: {}});\n",
    );
    expect(
      (await captured(() => themeBuild('acme.ts', {}, {cwd: dir}))).err,
    ).toBeUndefined();
  });
});
