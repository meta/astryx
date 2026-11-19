// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` never replaces a file it did not write. Beside the
 * source or at a path --out names, a file of the user's own of an output's
 * name is kept and the build fails naming it; an output of this or an older
 * release of the build is replaced.
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
import {themeBuild, themeBuildFamily} from './build.mjs';
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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-keeps-')),
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
// A custom variant, so the build writes brand.variants.d.ts too.
const THEME = `export default {name: 'brand', tokens: {'--color-accent': '#123456'}, components: {button: {'variant:brand': {color: 'red'}}}};\n`;
const read = (/** @type {string} */ rel) =>
  fs.readFileSync(path.join(dir, rel), 'utf8');

describe('a file of your own at an output path', () => {
  it.each([
    ['stylesheet', 'brand.css', '.hero { color: red } /* mine */\n'],
    ['module', 'brand.js', 'export const helper = () => 1;\n'],
  ])(
    'a hand-written %s beside the source is kept, and the build names it',
    async (_kind, file, text) => {
      write('brand.ts', THEME);
      write(file, text);
      const r = await captured(() => themeBuild('brand.ts', {}, {cwd: dir}));
      expect(r.err?.code).toBe('ERR_FILE_EXISTS');
      expect(r.err.message).toContain(
        `${file} is a file this build did not write`,
      );
      expect(r.err.message).toContain('Build to another place with --out');
      expect(r.err.message).toContain(`or move or rename ${file}`);
      expect(read(file)).toBe(text);
      // Nothing is written, and no suggestion builds to the same paths.
      for (const out of ['brand.css', 'brand.js', 'brand.d.ts'].filter(
        f => f !== file,
      ))
        expect(exists(out)).toBe(false);
      for (const suggestion of r.err.suggestions ?? [])
        expect(suggestion.name).toContain('--out');
    },
  );

  it('the --out refusal offers only a free path, never the build beside the source', async () => {
    write('d2/brand.ts', THEME);
    write('d2/brand.js', 'export const helper = () => 1;\n');
    const r = await captured(() =>
      themeBuild('d2/brand.ts', {out: 'd2/brand.css'}, {cwd: dir}),
    );
    expect(r.err?.code).toBe('ERR_FILE_EXISTS');
    const names = (r.err.suggestions ?? []).map(
      (/** @type {any} */ s) => s.name,
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toContain('--out');
    // Following the suggestion builds, and the file of your own is kept.
    const out = /--out (\S+)/.exec(names[0])?.[1]?.replace(/^['"]|['"]$/g, '');
    const followed = await captured(() =>
      themeBuild('d2/brand.ts', {out}, {cwd: dir}),
    );
    expect(followed.err).toBeUndefined();
    expect(read('d2/brand.js')).toBe('export const helper = () => 1;\n');
  });
});

describe('declarations of your own at an --out path', () => {
  it('a .d.ts of only declarations, without the declaration import a release wrote, is kept', async () => {
    write('brand.ts', THEME);
    const mine = 'export declare const brandTheme: MyTheme;\n';
    write('out/brand.d.ts', mine);
    const r = await captured(() =>
      themeBuild('brand.ts', {out: 'out/brand.css'}, {cwd: dir}),
    );
    expect(r.err?.code).toBe('ERR_FILE_EXISTS');
    expect(r.err.message).toContain(
      'out/brand.d.ts is a file this build did not write',
    );
    expect(read('out/brand.d.ts')).toBe(mine);
  });
});

describe('a family build', () => {
  it("replaces a file with the earlier CLI name's mark at its paths with a warning naming it, as released", async () => {
    write(
      'fam/ocean.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {}});\n`,
    );
    write(
      'fam/ocean-calm.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean.mjs';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', tokens: {}});\n`,
    );
    write(
      'fam/k.css',
      '/*\n * @generated by `xds theme build` — do not edit manually.\n */\n:root {}\n',
    );
    const r = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.mjs', 'fam/ocean-calm.mjs'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(r.err).toBeUndefined();
    expect(r.result.data.warnings.join('\n')).toContain(
      'fam/k.css has no build header (an output of an earlier build, or a file of your own or another tool',
    );
    expect(read('fam/k.css')).toContain('@generated by `astryx theme build`');
  });
});

describe('an output of the build', () => {
  it('its own earlier output is replaced', async () => {
    write('brand.ts', THEME);
    expect(
      (await captured(() => themeBuild('brand.ts', {}, {cwd: dir}))).err,
    ).toBeUndefined();
    write('brand.ts', THEME.replace('#123456', '#654321'));
    const again = await captured(() => themeBuild('brand.ts', {}, {cwd: dir}));
    expect(again.err).toBeUndefined();
    expect(read('brand.css')).toContain('#654321');
  });

  it.each([
    [
      'with the header of an older release',
      {
        'brand.css':
          '/*\n * @generated by `astryx theme build` — do not edit manually.\n * Source: brand.ts\n * CLI: @astryxdesign/cli@0.4.0\n */\n\n:root { --color-accent: red; }\n',
        'brand.js':
          "/**\n * @generated by `astryx theme build` — do not edit manually.\n * Source: brand.ts\n */\n\nexport const brandTheme = {name: 'brand'};\n",
      },
    ],
    [
      'with the header of the CLI before it was named Astryx',
      {
        'brand.css':
          '/*\n * @generated by `xds theme build` — do not edit manually.\n * Source: brand.ts\n */\n\n:root {}\n',
      },
    ],
    [
      'from a release that wrote no header',
      {
        'brand.css':
          '@layer xds-theme {\n@scope ([data-xds-theme="brand"]) to ([data-xds-theme]) {\n  :scope {\n    --color-accent: red;\n  }\n}\n}\n',
        'brand.js':
          "/**\n * brand theme — built by `npx xds theme build`\n * Import the CSS file alongside this module:\n */\nexport const brandTheme = {\n  name: 'brand',\n  __built: true,\n};\n",
        'brand.d.ts':
          "import type { XDSDefinedTheme } from '@xds/core/theme';\nexport declare const brandTheme: XDSDefinedTheme;\n",
        'brand.variants.d.ts':
          "// Generated by xds theme build\nexport {};\n\ndeclare module '@xds/core/Button' {\n  interface ButtonVariantMap {\n    'brand': true;\n  }\n}\n",
      },
    ],
    [
      'from the first release, which wrote no header',
      {
        'brand.css':
          '@layer xds.theme {\n@scope ([data-xds-theme="brand"]) to ([data-xds-theme]) {\n  :scope {}\n}\n}\n',
        'brand.js':
          "/**\n * brand theme — built by `npx xds build-theme`\n */\nexport const brandTheme = {\n  name: 'brand',\n  __built: true,\n};\n",
      },
    ],
    [
      'from a release that put the reset layer first',
      {
        'brand.css':
          '@layer reset {\n@scope ([data-xds-theme="brand"]) to ([data-xds-theme]) {\n  p {}\n}\n}\n@layer xds-theme {\n}\n',
      },
    ],
  ])('an output %s is replaced', async (_label, files) => {
    write('brand.ts', THEME);
    for (const [file, text] of Object.entries(files)) write(file, text);
    const r = await captured(() => themeBuild('brand.ts', {}, {cwd: dir}));
    expect(r.err).toBeUndefined();
    expect(read('brand.css')).toContain('#123456');
    for (const file of Object.keys(files))
      expect(read(file)).toContain('@generated by `astryx theme build`');
  });
});

describe('an --out path keeps its released rule', () => {
  it.each([
    [
      "the earlier CLI name's header",
      '/*\n * @generated by `xds theme build` — do not edit manually.\n */\n:root {}\n',
    ],
    [
      'the shape of a release without a header',
      '@layer xds-theme {\n@scope ([data-xds-theme="brand"]) to ([data-xds-theme]) {}\n}\n',
    ],
  ])('a file with %s there is refused and kept', async (_label, text) => {
    write('brand.ts', THEME);
    write('out/brand.css', text);
    const r = await captured(() =>
      themeBuild('brand.ts', {out: 'out/brand.css'}, {cwd: dir}),
    );
    expect(r.err?.code).toBe('ERR_FILE_EXISTS');
    expect(read('out/brand.css')).toBe(text);
  });
});
