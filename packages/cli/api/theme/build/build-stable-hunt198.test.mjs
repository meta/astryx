// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` batch hunt198: a family key replaces a
 * header-less file as released, with a warning naming it, and warns over
 * another theme's outputs, as --out does; a family member's registry imported without its extension
 * resolves as the single build's does; an icon registry that imports an
 * asset (.svg, .png) builds; a single build with --out in another folder
 * keeps the registry import as written and says when nothing answers to it
 * there; a file of two named themes and no default names the one it leaves
 * out; and an empty --icons-specifier is warned by the stable build (which
 * writes as before, as it does an empty --out) and refused by the editor's
 * compile.
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
import {pathToFileURL} from 'node:url';
import {logger} from '../../logger.mjs';
import {themeBuild, themeBuildFamily} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';
import {editorCompileProblem} from '../../theme-edit/_adapter.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

vi.setConfig({testTimeout: 120_000});

const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
// Links give the fixture's imports the packages that the CLI resolves.
const FIXTURE_LINKS = {
  '@astryxdesign': path.join(CLI_ROOT, 'node_modules/@astryxdesign'),
  react: path.dirname(require.resolve('react/package.json')),
};

/** @type {string} */
let dir;
beforeAll(() => ensureCoreBuilt(), 200_000);
beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-h198-')),
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
const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(dir, rel));

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

const OCEAN = `import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': '#0066cc'}});\n`;
const CALM = `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean';\nexport default defineTheme({extends: ocean, name: 'ocean-calm'});\n`;

describe('N4: a family key over a file the build did not write', () => {
  it('replaces a header-less file as released, with a warning naming it, and warns over another theme’s outputs', async () => {
    write('fam/ocean.ts', OCEAN);
    write('fam/ocean-calm.ts', CALM);
    write('fam/index.js', '// my barrel\nexport * from "./ocean";\n');
    const files = ['fam/ocean.ts', 'fam/ocean-calm.ts'];
    const {err, lines} = await captured(() =>
      themeBuildFamily(files, {familyKey: 'index'}, {cwd: dir}),
    );
    expect(err).toBeUndefined();
    expect(lines.join('\n')).toContain(
      'fam/index.js has no build header (an output from a CLI before 0.6.7, or a file of your own or another tool’s), and this build of fam/ocean.ts replaces it; to keep a file of your own there, build with another --family-key.'.replace(
        '’',
        "'",
      ),
    );
    expect(read('fam/index.js')).toContain('@generated');
    // Built again under its own key: its own outputs, no warning.
    const again = await captured(() =>
      themeBuildFamily(files, {familyKey: 'index'}, {cwd: dir}),
    );
    expect(again.err).toBeUndefined();
    expect(again.lines.join('\n')).not.toContain('no build header');
    // Another theme's outputs at the key: replaced, with a warning naming it.
    write(
      'fam/loner.ts',
      `export default {name: 'loner', tokens: {'--color-accent': '#aa0000'}};\n`,
    );
    await captured(() => themeBuild('fam/loner.ts', {}, {cwd: dir}));
    const over = await captured(() =>
      themeBuildFamily(files, {familyKey: 'loner'}, {cwd: dir}),
    );
    expect(over.err).toBeUndefined();
    expect(over.lines.join('\n')).toContain(
      'fam/loner.css was built from fam/loner.ts; this build of fam/ocean.ts replaces it.',
    );
  });
});

describe('N11: a family member’s registry imported without its extension', () => {
  it('resolves ./icons to icons.ts as the single build does, and builds', async () => {
    write('fam/icons.ts', `export const icons = {close: 'x'};\n`);
    write(
      'fam/ocean.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': '#0066cc'}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean';\nimport {icons} from './icons';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', icons});\n`,
    );
    const {err} = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'ocean-family'},
        {cwd: dir},
      ),
    );
    expect(err).toBeUndefined();
    // The family module imports the registry compiled from icons.ts.
    expect(read('fam/ocean-family.js')).toContain(
      './ocean-family.modules/icons.ts.js',
    );
    expect(read('fam/ocean-family.modules/icons.ts.js')).toContain(
      "close: 'x'",
    );
  });
});

describe('N10: an icon registry that imports an asset', () => {
  it('builds, with and without --icons-specifier', async () => {
    write('p/check.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    write('p/mark.png', 'png');
    write(
      'p/icons.mjs',
      `import check from './check.svg';\nimport mark from './mark.png';\nexport const icons = {check: String(check), mark: String(mark)};\n`,
    );
    write(
      'p/p.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {icons} from './icons.mjs';\nexport default defineTheme({name: 'p', icons});\n`,
    );
    const plain = await captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
    expect(plain.err).toBeUndefined();
    expect(read('p/p.js')).toContain("from './icons.mjs'");
    const named = await captured(() =>
      themeBuild('p/p.ts', {iconsSpecifier: './icons.mjs'}, {cwd: dir}),
    );
    expect(named.err).toBeUndefined();
  });
});

describe('N12: a single build with --out in another folder', () => {
  it('keeps the registry import as the source writes it, warns when nothing answers to it there, and the import it names loads', async () => {
    write('p/icons.js', `export const icons = {check: 'v'};\n`);
    write(
      'p/p.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {icons} from './icons.js';\nexport default defineTheme({name: 'p', icons});\n`,
    );
    const {result, err, lines} = await captured(() =>
      themeBuild('p/p.ts', {out: 'out/p.css'}, {cwd: dir}),
    );
    expect(err).toBeUndefined();
    expect(read('out/p.js')).toContain("from './icons.js'");
    const warning =
      "out/p.js imports './icons.js' as the theme source writes it, and nothing answers to it from out/, so the built module does not load there: give --icons-specifier '../p/icons.js' (the registry, from there), or put the compiled module there";
    expect(lines.join('\n')).toContain(warning);
    expect(JSON.stringify(result)).toContain(warning);
    // Followed: the registry from there, and the module loads.
    const followed = await captured(() =>
      themeBuild(
        'p/p.ts',
        {out: 'out/p.css', iconsSpecifier: '../p/icons.js'},
        {cwd: dir},
      ),
    );
    expect(followed.err).toBeUndefined();
    expect(followed.lines.join('\n')).not.toContain('nothing answers to it');
    const mod = await import(
      `${pathToFileURL(path.join(dir, 'out/p.js')).href}?followed`
    );
    expect(mod.icons.check).toBe('v');
    // A compiled registry beside the outputs answers: no warning.
    write('out/icons.js', `export const icons = {check: 'w'};\n`);
    const beside = await captured(() =>
      themeBuild('p/p.ts', {out: 'out/p.css'}, {cwd: dir}),
    );
    expect(beside.lines.join('\n')).not.toContain('nothing answers to it');
  });
});

describe('N9: a file of two named themes and no default', () => {
  it('builds one and names the one it leaves out, with the way to build it', async () => {
    write(
      'p/brand.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const brandLight = defineTheme({name: 'brand-light'});\nexport const brandDark = defineTheme({name: 'brand-dark', tokens: {'--color-accent': '#123456'}});\n`,
    );
    const {result, err, lines} = await captured(() =>
      themeBuild('p/brand.ts', {}, {cwd: dir}),
    );
    expect(err).toBeUndefined();
    const warning =
      'exports 2 themes and no default (brandDark, brandLight), and this build builds brandDark only: export default the theme to build, or give each theme its own file';
    expect(lines.join('\n')).toContain(warning);
    expect(JSON.stringify(result)).toContain(warning);
    // The way out it names: export default the theme to build.
    write(
      'p/brand.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const brandDark = defineTheme({name: 'brand-dark'});\nexport default defineTheme({name: 'brand-light'});\n`,
    );
    const again = await captured(() =>
      themeBuild('p/brand.ts', {}, {cwd: dir}),
    );
    expect(again.err).toBeUndefined();
    expect(again.lines.join('\n')).not.toContain('and no default');
    expect(exists('p/brand-light.css')).toBe(true);
  });
});

describe('N18: an empty or blank --icons-specifier, and an empty --out', () => {
  it('stable theme build writes as before and warns; the editor’s compile refuses, with a compile that runs', async () => {
    write('p/icons.js', `export const icons = {check: 'v'};\n`);
    write(
      'p/p.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {icons} from './icons.js';\nexport default defineTheme({name: 'p', icons});\n`,
    );
    for (const value of ['', ' ']) {
      const {err, lines} = await captured(() =>
        themeBuild('p/p.ts', {iconsSpecifier: value}, {cwd: dir}),
      );
      expect(err).toBeUndefined();
      expect(lines.join('\n')).toContain(
        `--icons-specifier is ${value ? 'blank' : 'empty'}, so the built module imports its icon registry from ${JSON.stringify(value)}, which nothing loads`,
      );
    }
    // The editor's compile refuses both before it builds, offering the
    // compile without the option.
    for (const [flag, opts] of /** @type {const} */ ([
      ['--icons-specifier', {iconsSpecifier: ''}],
      ['--out', {out: ' '}],
    ])) {
      const refused = await editorCompileProblem(['p/p.ts'], {
        cwd: dir,
        ...opts,
      });
      expect(refused?.code).toBe('ERR_INVALID_ARGUMENT');
      expect(refused?.message).toContain(`${flag} is `);
      const line = /** @type {any} */ (refused).suggestions[0].name;
      expect(line).toMatch(/experimental theme compile p\/p\.ts$/);
    }
  });

  it("stable theme build --out '' still writes beside the source, as before", async () => {
    write(
      'p/p.ts',
      `export default {name: 'p', tokens: {'--color-accent': '#123456'}};\n`,
    );
    const r = await runCli(['theme', 'build', 'p/p.ts', '--out', ''], dir);
    expect(r.status).toBe(0);
    expect(read('p/p.css')).toContain('#123456');
    // A blank one still names no file, and is refused as before.
    const blank = await captured(() =>
      themeBuild('p/p.ts', {out: ' '}, {cwd: dir}),
    );
    expect(blank.err?.code).toBe('ERR_INVALID_ARGUMENT');
  });
});
