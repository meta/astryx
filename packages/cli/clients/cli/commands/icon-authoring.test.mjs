// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set authoring commands end to end (AST-084): `experimental icon
 * new-set --from`, `experimental icon new-definition`, `experimental icon add`, `icon
 * map`, and `experimental icon use`, driving the real program over an icon-set package
 * that wraps a small component library and an app that installs it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {writeIconSetProject} from '../../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let pkg;

/**
 * A component library under node_modules: two components (one also exported
 * under an `…Icon` alias), a data export, and a default-export file.
 * @param {string} dir
 */
function writeLibrary(dir) {
  const lib = path.join(dir, 'node_modules', '@acme', 'glyph-library');
  fs.mkdirSync(path.join(lib, 'icons'), {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name: '@acme/glyph-library',
      version: '2.0.0',
      type: 'module',
      exports: {'.': './index.js', './rocket': './icons/rocket.js'},
    }),
  );
  fs.writeFileSync(
    path.join(lib, 'index.js'),
    [
      "export {Bin, Bin as BinIcon} from './icons/bin.js';",
      "export {Cross} from './icons/cross.js';",
      "export const glyphData = {path: 'M0 0'};",
      "export const version = '2.0.0';",
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(lib, 'icons', 'bin.js'),
    'export function Bin(props) { return null; }\n',
  );
  fs.writeFileSync(
    path.join(lib, 'icons', 'cross.js'),
    'export const Cross = props => null;\n',
  );
  fs.writeFileSync(
    path.join(lib, 'icons', 'rocket.js'),
    'export default function Rocket(props) { return null; }\n',
  );
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-authoring-'));
  pkg = path.join(tmp, 'icons');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify(
      {
        name: '@acme/icons',
        version: '1.0.0',
        license: 'MIT',
        type: 'module',
        exports: {'.': './index.js'},
        dependencies: {'@acme/glyph-library': '^2.0.0'},
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(pkg, 'index.js'), 'export {};\n');
  writeLibrary(pkg);
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args @param {string} [cwd] */
async function json(args, cwd = pkg) {
  const res = await runCli([...args, '--json'], cwd);
  return {code: res.code, body: JSON.parse(res.stdout)};
}

/** @param {string} set */
const dataOf = set =>
  JSON.parse(
    fs.readFileSync(
      path.join(pkg, 'icon-sets', set, `${set}.icons.json`),
      'utf-8',
    ),
  );

describe('experimental icon new-set --from', () => {
  it('wraps every component of a library once, names each <Name>Icon, pre-fills exact map hits, and says what to export', async () => {
    const {code, body} = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(code).toBe(0);
    expect(body.data).toMatchObject({kind: 'icon-set', icons: 2});
    // The package's entry is the author's: the receipt names the exact line
    // and the entry stays as it was (architecture:cli-surface INV16).
    expect(body.data.files).not.toContain('index.js');
    expect(fs.readFileSync(path.join(pkg, 'index.js'), 'utf-8')).toBe(
      'export {};\n',
    );
    expect(body.data.notes).toContain(
      "Add `export * from './icon-sets/outline/outline.generated.js';` to index.js, so the icons import from @acme/icons.",
    );
    const data = dataOf('outline');
    expect(data.generated).toBe('./icon-sets/outline/outline.generated.js');
    expect(data.icons).toEqual([
      {id: 'bin', export: 'BinIcon', words: ['bin']},
      {id: 'cross', export: 'CrossIcon', words: ['cross']},
    ]);
    // `delete` has the word bin, but a word alone is only a suggestion: a
    // library's bin may not mean delete. Nothing is written for it.
    expect(data.map).toEqual({});
    expect(body.data.suggestions).toContainEqual({
      definition: 'delete',
      icon: 'bin',
      word: 'bin',
    });
    // The installed library and version are the set's source.
    expect(data.source).toEqual({
      package: '@acme/glyph-library',
      version: '2.0.0',
    });
    const generated = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'outline', 'outline.generated.js'),
      'utf-8',
    );
    expect(generated).toContain("export {BinIcon} from '@acme/glyph-library';");
    expect(generated).toContain(
      "export {Cross as CrossIcon} from '@acme/glyph-library';",
    );
    expect(generated).not.toContain('glyphData');

    // Running it again refreshes in place and keeps the map.
    const again = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(again.code).toBe(0);
    expect(dataOf('outline').map).toEqual({});
    expect(again.body.data.suggestions).toContainEqual({
      definition: 'delete',
      icon: 'bin',
      word: 'bin',
    });
  });

  it('maps a definition only by its exact name, and prints the rest as suggestions', async () => {
    // A library icon named after a definition (`close`) maps; a word (`bin`)
    // does not.
    fs.writeFileSync(
      path.join(
        pkg,
        'node_modules',
        '@acme',
        'glyph-library',
        'icons',
        'close.js',
      ),
      'export const Close = props => null;\n',
    );
    fs.appendFileSync(
      path.join(pkg, 'node_modules', '@acme', 'glyph-library', 'index.js'),
      "export {Close} from './icons/close.js';\n",
    );
    const res = await runCli(
      [
        'experimental',
        'icon',
        'new-set',
        'outline',
        '--from',
        '@acme/glyph-library',
      ],
      pkg,
    );
    expect(res.code).toBe(0);
    expect(dataOf('outline').map).toEqual({close: 'close'});
    expect(res.stdout).toContain('Suggestions');
    expect(res.stdout).toContain('experimental icon map delete bin');
  });

  it('--variants and --default-variant declare the variants; the library license notice is copied', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(path.join(lib, 'LICENSE'), 'MIT License\n');
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(lib, 'package.json'), 'utf-8'),
    );
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({...pkgJson, license: 'ISC'}),
    );
    const {code, body} = await json([
      'experimental',
      'icon',
      'new-set',
      'glyphs',
      '--from',
      '@acme/glyph-library',
      '--variants',
      'outline,solid',
      '--default-variant',
      'outline',
    ]);
    expect(code).toBe(0);
    const data = dataOf('glyphs');
    expect(data.variants).toEqual(['outline', 'solid']);
    expect(data.default).toEqual({variant: 'outline'});
    expect(body.data.files).toContain('icon-sets/glyphs/LICENSE');
    // No TypeScript here: the receipt says the strict check needs one.
    expect(body.data.notes.join(' ')).toContain('npm install -D typescript@6');
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'glyphs', 'LICENSE'),
        'utf-8',
      ),
    ).toBe('MIT License\n');
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'glyphs', 'glyphs.doc.mjs'),
        'utf-8',
      ),
    ).toContain("license: 'ISC'");
    const check = JSON.stringify(
      JSON.parse(
        (await runCli(['integration', 'check', '--json'], pkg)).stdout,
      ),
    );
    expect(check).not.toContain('icon_license_notice_missing');
  });

  it('refuses a --default-variant that is not a variant, and --default-variant without --variants', async () => {
    const bad = await json([
      'experimental',
      'icon',
      'new-set',
      'glyphs',
      '--variants',
      'outline,solid',
      '--default-variant',
      'mini',
    ]);
    expect(bad.code).toBe(1);
    expect(bad.body.error).toContain('not one of --variants');
    const lone = await json([
      'experimental',
      'icon',
      'new-set',
      'glyphs',
      '--default-variant',
      'outline',
    ]);
    expect(lone.code).toBe(1);
    expect(lone.body.error).toContain('needs --variants');
  });

  it('the theme map reads each re-exported icon through an import, so the generated module loads', async () => {
    await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    // `close` is built in, so it lands in the theme map.
    expect(
      (await json(['experimental', 'icon', 'map', 'close', 'cross'])).code,
    ).toBe(0);
    const file = path.join(pkg, 'icon-sets', 'outline', 'outline.generated.js');
    const text = fs.readFileSync(file, 'utf-8');
    // A re-export binds no local name: the theme map's import does.
    expect(text).toContain(
      "import {Cross as CrossIcon} from '@acme/glyph-library';",
    );
    expect(text).toContain(
      "export {Cross as CrossIcon} from '@acme/glyph-library';",
    );
    expect(text).toContain('close: createElement(CrossIcon,');
    const check = JSON.stringify(
      JSON.parse(
        (await runCli(['integration', 'check', '--json'], pkg)).stdout,
      ),
    );
    expect(check).not.toContain('icon_theme_map_mismatch');
    expect(check).not.toContain('icon_module_invalid');

    // The module loads and the theme map draws the exported component.
    const react = path.dirname(
      createRequire(import.meta.url).resolve('react/package.json'),
    );
    fs.symlinkSync(react, path.join(pkg, 'node_modules', 'react'), 'dir');
    const mod = await import(pathToFileURL(file).href);
    expect(mod.themeIcons.close.type).toBe(mod.CrossIcon);

    // Remapping drops the import the theme map no longer reads.
    await json(['experimental', 'icon', 'map', 'close', 'bin']);
    const remapped = fs.readFileSync(file, 'utf-8');
    expect(remapped).not.toContain('import {Cross as CrossIcon}');
    expect(remapped).toContain("import {BinIcon} from '@acme/glyph-library';");
  }, 60_000);
});

describe('icon add', () => {
  beforeEach(async () => {
    await runCli(['experimental', 'icon', 'new-set', 'outline'], pkg);
  });

  it('lists the definitions that fit an export, and writes nothing', async () => {
    const {code, body} = await json([
      'experimental',
      'icon',
      'add',
      'Bin',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(code).toBe(0);
    expect(body.type).toBe('icon.definitionMatches');
    expect(body.data.matches[0]).toMatchObject({
      name: 'delete',
      source: 'astryx',
      command:
        'astryx experimental icon add Bin --from @acme/glyph-library --definition delete',
    });
    expect(dataOf('outline').icons).toEqual([]);
  });

  it('adds the icon as <Name>Icon through the generated module, maps it, and is idempotent', async () => {
    const args = [
      'experimental',
      'icon',
      'add',
      'Bin',
      '--from',
      '@acme/glyph-library',
      '--definition',
      'delete',
    ];
    const first = await json(args);
    expect(first.code).toBe(0);
    expect(first.body.data).toMatchObject({
      icon: {id: 'bin', export: 'BinIcon', module: '@acme/icons'},
      definition: 'delete',
      changed: true,
    });
    // The entry is not wired yet: the note names the line, and the entry
    // stays the author's.
    expect(first.body.data.note).toBe(
      "Add `export * from './icon-sets/outline/outline.generated.js';` to index.js, so the icons import from @acme/icons.",
    );
    expect(fs.readFileSync(path.join(pkg, 'index.js'), 'utf-8')).toBe(
      'export {};\n',
    );
    const data = dataOf('outline');
    expect(data.map).toEqual({delete: 'bin'});
    expect(data.icons[0]).toMatchObject({id: 'bin', export: 'BinIcon'});
    // Only its own words: the definition's words are matched, not copied.
    expect(data.icons[0].words).toEqual(['bin']);
    expect(data.icons[0]).not.toHaveProperty('module');
    const again = await json(args);
    expect(again.body.data.changed).toBe(false);
  });

  it('adds a declared variant of an existing icon with --variant, refusing one the set does not declare', async () => {
    await json([
      'experimental',
      'icon',
      'add',
      'Bin',
      '--from',
      '@acme/glyph-library',
      '--definition',
      'delete',
    ]);
    const args = [
      'experimental',
      'icon',
      'add',
      'Cross',
      '--from',
      '@acme/glyph-library',
      '--id',
      'bin',
      '--variant',
      'solid',
    ];
    const before = dataOf('outline');
    const refused = await json(args);
    expect(refused.code).toBe(1);
    expect(refused.body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(refused.body.error).toContain('variant "solid" is not in variants');
    expect(refused.body.error).toContain('Declare it in "variants"');
    expect(dataOf('outline')).toEqual(before);

    const dataPath = path.join(
      pkg,
      'icon-sets',
      'outline',
      'outline.icons.json',
    );
    fs.writeFileSync(
      dataPath,
      JSON.stringify({
        ...before,
        variants: ['outline', 'solid'],
        default: {variant: 'outline'},
      }),
    );
    const added = await json(args);
    expect(added.code).toBe(0);
    expect(added.body.data).toMatchObject({
      icon: {id: 'bin', export: 'BinSolidIcon'},
      variant: 'solid',
      changed: true,
    });
    const data = dataOf('outline');
    expect(Object.keys(data)).toContain('variants');
    expect(data.icons[0].variants).toEqual([
      {variant: 'solid', export: 'BinSolidIcon'},
    ]);
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'outline', 'outline.generated.js'),
        'utf-8',
      ),
    ).toContain("export {Cross as BinSolidIcon} from '@acme/glyph-library';");
  });

  it("adds the set's own definition with --new-definition, refusing one Astryx has", async () => {
    const added = await json([
      'experimental',
      'icon',
      'add',
      'Cross',
      '--from',
      '@acme/glyph-library',
      '--new-definition',
      'crossOut',
      '--description',
      'Cross something out.',
      '--words',
      'strike,cross',
    ]);
    expect(added.code).toBe(0);
    expect(
      fs.existsSync(
        path.join(
          pkg,
          'icon-sets',
          'outline',
          'definitions',
          'crossOut.doc.mjs',
        ),
      ),
    ).toBe(true);
    expect(dataOf('outline').map).toEqual({crossOut: 'cross'});
    expect(
      fs.readFileSync(
        path.join(
          pkg,
          'icon-sets',
          'outline',
          'definitions',
          'crossOut.doc.mjs',
        ),
        'utf-8',
      ),
    ).toContain("words: ['strike', 'cross']");
    const refused = await json([
      'experimental',
      'icon',
      'add',
      'Cross',
      '--from',
      '@acme/glyph-library',
      '--new-definition',
      'close',
      '--description',
      'x',
      '--words',
      'x',
    ]);
    expect(refused.code).toBe(1);
    expect(refused.body.suggestions).toContainEqual(
      expect.objectContaining({name: '--definition close'}),
    );
  });

  it('--new-definition that cannot write its definition leaves the generated module, its types, and the set data unchanged', async () => {
    const set = path.join(pkg, 'icon-sets', 'outline');
    const first = await json([
      'experimental',
      'icon',
      'add',
      'Bin',
      '--from',
      '@acme/glyph-library',
      '--definition',
      'delete',
    ]);
    expect(first.code).toBe(0);
    const files = ['outline.generated.js', 'outline.generated.d.ts'].map(name =>
      path.join(set, name),
    );
    files.push(path.join(set, 'outline.icons.json'));
    const before = files.map(file => fs.readFileSync(file, 'utf-8'));
    // A file where the definitions folder belongs: the definition write fails.
    fs.rmSync(path.join(set, 'definitions'), {recursive: true, force: true});
    fs.writeFileSync(path.join(set, 'definitions'), 'not a folder\n');
    const failed = await json([
      'experimental',
      'icon',
      'add',
      'Cross',
      '--from',
      '@acme/glyph-library',
      '--new-definition',
      'crossOut',
      '--description',
      'Cross something out.',
      '--words',
      'strike,cross',
    ]);
    expect(failed.code).toBe(1);
    expect(files.map(file => fs.readFileSync(file, 'utf-8'))).toEqual(before);
    expect(fs.readFileSync(path.join(set, 'definitions'), 'utf-8')).toBe(
      'not a folder\n',
    );
  });

  it('refuses an export the module lacks, with close names, and an unknown definition', async () => {
    const missing = await json([
      'experimental',
      'icon',
      'add',
      'Bim',
      '--from',
      '@acme/glyph-library',
      '--definition',
      'delete',
    ]);
    expect(missing.code).toBe(1);
    expect(
      missing.body.suggestions.map((/** @type {any} */ s) => s.name),
    ).toContain('Bin');
    const unknown = await json([
      'experimental',
      'icon',
      'add',
      'Bin',
      '--from',
      '@acme/glyph-library',
      '--definition',
      'trashCan',
    ]);
    expect(unknown.code).toBe(1);
  });

  it('a default export, or a value through the declared adapter', async () => {
    const rocket = await json([
      'experimental',
      'icon',
      'add',
      'Rocket',
      '--from',
      '@acme/glyph-library/rocket',
      '--default',
      '--definition',
      'rocket',
    ]);
    expect(rocket.code).toBe(0);
    const refused = await json([
      'experimental',
      'icon',
      'add',
      'glyphData',
      '--from',
      '@acme/glyph-library',
      '--definition',
      'activity',
    ]);
    expect(refused.code).toBe(1);
    expect(refused.body.error).toContain('adapter');

    const dataFile = path.join(
      pkg,
      'icon-sets',
      'outline',
      'outline.icons.json',
    );
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    data.adapter = {module: './src/adapt.js', export: 'adapt'};
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    fs.mkdirSync(path.join(pkg, 'src'));
    fs.writeFileSync(
      path.join(pkg, 'src', 'adapt.js'),
      'export function adapt(data) { return () => null; }\n',
    );
    const adapted = await json([
      'experimental',
      'icon',
      'add',
      'glyphData',
      '--from',
      '@acme/glyph-library',
      '--definition',
      'activity',
    ]);
    expect(adapted.code).toBe(0);
    expect(adapted.body.data.icon.export).toBe('GlyphDataIcon');
    const generated = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'outline', 'outline.generated.js'),
      'utf-8',
    );
    expect(generated).toContain(
      "import {adapt as adaptIcon} from '../../src/adapt.js';",
    );
    expect(generated).toContain(
      'export const GlyphDataIcon = adaptIcon(GlyphDataIconSource);',
    );
    expect(generated).toContain(
      "export {default as RocketIcon} from '@acme/glyph-library/rocket';",
    );
  });
});

describe('experimental icon map and new-definition', () => {
  beforeEach(async () => {
    await runCli(
      [
        'experimental',
        'icon',
        'new-set',
        'outline',
        '--from',
        '@acme/glyph-library',
      ],
      pkg,
    );
  });

  it('maps, remaps, and removes an entry; refuses an unknown definition or icon', async () => {
    const mapped = await json([
      'experimental',
      'icon',
      'map',
      'close',
      'cross',
    ]);
    expect(mapped.body.data).toMatchObject({
      definition: 'close',
      icon: 'cross',
      changed: true,
    });
    expect(dataOf('outline').map.close).toBe('cross');
    const removed = await json([
      'experimental',
      'icon',
      'map',
      'close',
      '--remove',
    ]);
    expect(removed.body.data).toMatchObject({icon: null, previous: 'cross'});
    expect(dataOf('outline').map).not.toHaveProperty('close');
    const unknown = await json([
      'experimental',
      'icon',
      'map',
      'orbit',
      'cross',
    ]);
    expect(unknown.code).toBe(1);
    expect(unknown.body.suggestions).toContainEqual(
      expect.objectContaining({
        name: 'astryx experimental icon new-definition orbit --set outline',
      }),
    );
    const noIcon = await json([
      'experimental',
      'icon',
      'map',
      'close',
      'crosss',
    ]);
    expect(noIcon.code).toBe(1);
    expect(noIcon.body.suggestions).toContainEqual(
      expect.objectContaining({name: 'cross'}),
    );
  });

  it("adds the set's own definition, mapped with --icon", async () => {
    const {code, body} = await json([
      'experimental',
      'icon',
      'new-definition',
      'crossOut',
      '--description',
      'Cross something out.',
      '--words',
      'strike,cross',
      '--icon',
      'cross',
    ]);
    expect(code).toBe(0);
    expect(body.data).toMatchObject({
      kind: 'icon-definition',
      name: 'crossOut',
    });
    expect(dataOf('outline').map.crossOut).toBe('cross');
    const again = await json([
      'experimental',
      'icon',
      'new-definition',
      'crossOut',
      '--description',
      'x',
      '--words',
      'x',
    ]);
    expect(again.code).toBe(1);
    expect(again.body.code).toBe('ERR_FILE_EXISTS');
  });
});

describe('experimental icon use', () => {
  it("writes the project's experimental.iconSet, creating astryx.config.mjs, and refuses a set that is not installed", async () => {
    const app = writeIconSetProject(tmp);
    const used = await json(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(used.code).toBe(0);
    expect(used.body.data).toMatchObject({
      iconSet: 'glyphs',
      set: '@acme/glyphs/glyphs',
      created: true,
      changed: true,
    });
    expect(
      fs.readFileSync(path.join(app, 'astryx.config.mjs'), 'utf-8'),
    ).toMatch(/experimental: \{\s*iconSet: 'glyphs',?\s*\}/);
    const again = await json(
      ['experimental', 'icon', 'use', '@acme/glyphs/glyphs'],
      app,
    );
    expect(again.body.data).toMatchObject({
      previous: 'glyphs',
      changed: true,
      created: false,
    });
    const missing = await json(['experimental', 'icon', 'use', 'glyps'], app);
    expect(missing.code).toBe(1);
    expect(missing.body.suggestions).toContainEqual(
      expect.objectContaining({name: 'glyphs'}),
    );
  });

  it('warns in the receipt when the project may run a CLI that refuses experimental.iconSet', async () => {
    const app = writeIconSetProject(tmp);
    const pkgFile = path.join(app, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
    // No CLI range declared: nothing says which CLI it runs.
    const none = await json(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(none.body.data).not.toHaveProperty('warning');
    pkgJson.devDependencies = {'@astryxdesign/cli': '^0.7.0'};
    fs.writeFileSync(pkgFile, JSON.stringify(pkgJson));
    const old = await json(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(old.code).toBe(0);
    expect(old.body.data.warning).toContain(
      'range "^0.7.0" (devDependencies) admits a release before 0.7.4',
    );
    expect(old.body.data.warning).toContain('"Unrecognized key"');
    expect(old.body.data.warning).toContain(
      'commands that load the project configuration, such as `doctor` and `discover`, fail there',
    );
    expect(old.body.data.warning).not.toContain('every command');
    const text = await runCli(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(text.stdout).toContain(
      "[warn] The project's @astryxdesign/cli range",
    );
    // Published 0.7.3 still refuses the key.
    pkgJson.devDependencies = {'@astryxdesign/cli': '^0.7.3'};
    fs.writeFileSync(pkgFile, JSON.stringify(pkgJson));
    const previous = await json(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(previous.body.data.warning).toContain(
      'range "^0.7.3" (devDependencies) admits a release before 0.7.4',
    );
    pkgJson.devDependencies = {'@astryxdesign/cli': '^0.7.4'};
    fs.writeFileSync(pkgFile, JSON.stringify(pkgJson));
    const current = await json(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(current.body.data).not.toHaveProperty('warning');
  });

  it('writes a plain existing config, keeping its other fields', async () => {
    const app = writeIconSetProject(tmp);
    const config = path.join(app, 'astryx.config.mjs');
    fs.writeFileSync(config, 'export default {\n  integrations: [],\n};\n');
    const used = await json(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(used.code).toBe(0);
    expect(used.body.data).toMatchObject({created: false, changed: true});
    const written = fs.readFileSync(config, 'utf-8');
    expect(written).toContain('integrations: []');
    expect(written).toMatch(/iconSet: 'glyphs'/);
  });

  it('refuses a config reached through a symbolic link, leaving its target untouched', async () => {
    const app = writeIconSetProject(tmp);
    const target = path.join(tmp, 'shared.config.mjs');
    const before = 'export default {\n  integrations: [],\n};\n';
    fs.writeFileSync(target, before);
    fs.symlinkSync(target, path.join(app, 'astryx.config.mjs'));
    const refused = await json(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(refused.code).toBe(1);
    expect(refused.body.code).toBe('ERR_CODEMOD_PROTECTED');
    expect(refused.body.error).toContain('symbolic link at astryx.config.mjs');
    expect(fs.readFileSync(target, 'utf-8')).toBe(before);
    expect(
      fs.lstatSync(path.join(app, 'astryx.config.mjs')).isSymbolicLink(),
    ).toBe(true);
  });

  it('refuses a generated config, naming the marker that protects it', async () => {
    const app = writeIconSetProject(tmp);
    const config = path.join(app, 'astryx.config.mjs');
    const before = '// @generated\nexport default {\n  integrations: [],\n};\n';
    fs.writeFileSync(config, before);
    const refused = await json(['experimental', 'icon', 'use', 'glyphs'], app);
    expect(refused.code).toBe(1);
    expect(refused.body.code).toBe('ERR_CODEMOD_PROTECTED');
    expect(refused.body.error).toContain(
      '@generated in the leading comment block',
    );
    expect(fs.readFileSync(config, 'utf-8')).toBe(before);
  });
});

describe('a library of icon data, through the adapter', () => {
  beforeEach(() => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-data');
    fs.mkdirSync(lib, {recursive: true});
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        name: '@acme/glyph-data',
        version: '1.0.0',
        type: 'module',
        exports: {'.': './index.js'},
      }),
    );
    fs.writeFileSync(
      path.join(lib, 'index.js'),
      [
        "export const glyphEye = {path: 'M1 1'};",
        "export const glyphEyeOff = {path: 'M1 2'};",
        "export const glyphTrash = {path: 'M2 2'};",
        "export const glyphX = {path: 'M3 3'};",
        '',
      ].join('\n'),
    );
    fs.mkdirSync(path.join(pkg, 'src'));
    fs.writeFileSync(
      path.join(pkg, 'src', 'adapt.js'),
      'export function adapt(data) { return () => null; }\n',
    );
    fs.writeFileSync(
      path.join(pkg, 'index.js'),
      "export * from './icon-sets/outline/outline.generated.js';\n",
    );
  });

  /** Declare the adapter in the set's data file. */
  const declareAdapter = () => {
    const file = path.join(pkg, 'icon-sets', 'outline', 'outline.icons.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    data.adapter = {module: './src/adapt.js', export: 'adapt'};
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  };
  const generated = () =>
    fs.readFileSync(
      path.join(pkg, 'icon-sets', 'outline', 'outline.generated.js'),
      'utf-8',
    );

  it('the bulk wrap finds nothing until the adapter is declared, then wraps every data export without the shared prefix', async () => {
    const before = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-data',
    ]);
    expect(before.code).toBe(1);
    expect(before.body.error).toContain('adapter');
    await runCli(['experimental', 'icon', 'new-set', 'outline'], pkg);
    declareAdapter();
    const wrapped = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-data',
    ]);
    expect(wrapped.code).toBe(0);
    expect(
      dataOf('outline').icons.map((/** @type {any} */ i) => [i.id, i.export]),
    ).toEqual([
      ['eye', 'EyeIcon'],
      ['eye-off', 'EyeOffIcon'],
      ['trash', 'TrashIcon'],
      ['x', 'XIcon'],
    ]);
    expect(generated()).toContain(
      'export const EyeIcon = adaptIcon(EyeIconSource);',
    );
    expect(generated()).toContain(
      "import {glyphEye as EyeIconSource} from '@acme/glyph-data';",
    );
  });

  it('icon add appended twice writes the adapter import once, and the module still parses', async () => {
    await runCli(['experimental', 'icon', 'new-set', 'outline'], pkg);
    declareAdapter();
    for (const [name, definition] of [
      ['glyphTrash', 'delete'],
      ['glyphEye', 'view'],
      ['glyphX', 'close'],
    ]) {
      const added = await json([
        'experimental',
        'icon',
        'add',
        name,
        '--from',
        '@acme/glyph-data',
        ...(definition === 'view'
          ? [
              '--new-definition',
              'peek',
              '--description',
              'Peek.',
              '--words',
              'peek',
            ]
          : ['--definition', definition]),
      ]);
      expect(added.code, name).toBe(0);
    }
    const text = generated();
    expect(text.match(/as adaptIcon/gu)).toHaveLength(1);
    // The library prefix is left out of the id and the export name.
    expect(dataOf('outline').map).toMatchObject({delete: 'trash', close: 'x'});
    expect(text).toContain(
      'export const TrashIcon = adaptIcon(TrashIconSource);',
    );
    // A built-in mapping lands in the theme map, and the types follow.
    expect(text).toContain(
      "close: createElement(XIcon, {'aria-hidden': true, 'width': '1em', 'height': '1em'}),",
    );
    const types = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'outline', 'outline.generated.d.ts'),
      'utf-8',
    );
    expect(types).toContain(
      'export declare const TrashIcon: ComponentType<SVGProps<SVGSVGElement>>;',
    );
    expect(types).toContain(
      'export declare const themeIcons: {readonly close: ReactElement};',
    );
    // icon map rewrites the theme map.
    await json(['experimental', 'icon', 'map', 'close', 'trash']);
    expect(generated()).toContain('close: createElement(TrashIcon,');
    // Integration check reads it all: no parse error, no missing export, no
    // theme-map or types mismatch.
    const check = await runCli(['integration', 'check', '--json'], pkg);
    const codes = JSON.stringify(JSON.parse(check.stdout));
    for (const code of [
      'icon_module_invalid',
      'icon_export_missing',
      'icon_theme_map_mismatch',
      'icon_generated_types_mismatch',
    ]) {
      expect(codes, code).not.toContain(code);
    }
    // The optional definitions left unmapped are listed, never issues.
    expect(codes).not.toContain('"severity":"info"');
    const printed = await runCli(['integration', 'check'], pkg);
    expect(printed.stdout).toContain('Unmapped icon definitions (optional)');
    expect(printed.stdout).toContain(
      'Mapping these is optional and never fails',
    );
  }, 60_000);
});

describe('the library prefix ignores constants', () => {
  beforeEach(() => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-data');
    fs.mkdirSync(lib, {recursive: true});
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        name: '@acme/glyph-data',
        version: '1.0.0',
        type: 'module',
        exports: {'.': './index.js'},
      }),
    );
    fs.writeFileSync(
      path.join(lib, 'index.js'),
      [
        "export const glyphEye = {path: 'M1 1'};",
        "export const glyphTrash = {path: 'M2 2'};",
        "export const glyphX = {path: 'M3 3'};",
        "export const README = 'See the docs.';",
        "export const notes = 'Some notes.';",
        'export const count = 5;',
        "export const meta = {kind: 'meta'};",
        '',
      ].join('\n'),
    );
    fs.mkdirSync(path.join(pkg, 'src'));
    fs.writeFileSync(
      path.join(pkg, 'src', 'adapt.js'),
      'export function adapt(data) { return () => null; }\n',
    );
  });

  /** Create the set with an adapter. */
  const setUp = async () => {
    await runCli(['experimental', 'icon', 'new-set', 'outline'], pkg);
    const file = path.join(pkg, 'icon-sets', 'outline', 'outline.icons.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    data.adapter = {module: './src/adapt.js', export: 'adapt'};
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  };
  const exportsOf = () =>
    dataOf('outline').icons.map((/** @type {any} */ i) => i.export);
  const wrap = (/** @type {string[]} */ extra = []) =>
    json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-data',
      ...extra,
    ]);

  it('skips SCREAMING_CASE names, numbers, and stray strings; --exclude drops a non-icon object, and the refresh prunes the old exports', async () => {
    await setUp();
    // meta is shaped like an icon, so it keeps the prefix off.
    expect((await wrap()).code).toBe(0);
    expect(exportsOf()).toEqual([
      'GlyphEyeIcon',
      'GlyphTrashIcon',
      'GlyphXIcon',
      'MetaIcon',
    ]);
    // Excluding meta lets the prefix come off the new ids; each existing icon
    // is the same icon (the same library export), so it keeps its public
    // export, and only meta leaves the module.
    const excluded = await wrap(['--exclude', 'meta']);
    expect(excluded.code).toBe(0);
    expect(exportsOf()).toEqual([
      'GlyphEyeIcon',
      'GlyphTrashIcon',
      'GlyphXIcon',
    ]);
    expect(dataOf('outline').icons.map((/** @type {any} */ i) => i.id)).toEqual(
      ['eye', 'trash', 'x'],
    );
    expect(excluded.body.data.renamed).toEqual([
      {from: 'glyph-eye', to: 'eye'},
      {from: 'glyph-trash', to: 'trash'},
      {from: 'glyph-x', to: 'x'},
    ]);
    const generated = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'outline', 'outline.generated.js'),
      'utf-8',
    );
    expect(generated).not.toContain('MetaIcon');
    expect(generated).not.toContain('README');
    expect(generated).not.toContain('notes');
    // icon add reuses the icon the wrap already made for an export, even
    // though meta keeps its own prefix off.
    const added = await json([
      'experimental',
      'icon',
      'add',
      'glyphTrash',
      '--from',
      '@acme/glyph-data',
      '--definition',
      'delete',
    ]);
    expect(added.code).toBe(0);
    expect(added.body.data.icon).toMatchObject({
      id: 'trash',
      export: 'GlyphTrashIcon',
    });
    expect(exportsOf()).toEqual([
      'GlyphEyeIcon',
      'GlyphTrashIcon',
      'GlyphXIcon',
    ]);
  });

  it('--exclude needs --from', async () => {
    const res = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--exclude',
      'README',
    ]);
    expect(res.code).toBe(1);
    expect(res.body.error).toContain('--from');
  });

  it('a library of SVG strings keeps its strings as icons', async () => {
    fs.writeFileSync(
      path.join(pkg, 'node_modules', '@acme', 'glyph-data', 'index.js'),
      [
        "export const glyphEye = '<svg/>';",
        "export const glyphSun = '<svg/>';",
        "export const VERSION = '1.0.0';",
        '',
      ].join('\n'),
    );
    await setUp();
    expect((await wrap()).code).toBe(0);
    expect(exportsOf()).toEqual(['EyeIcon', 'SunIcon']);
  });
});

describe('module resolution', () => {
  it('resolves the library from a set package nested deeper than six folders below node_modules', async () => {
    const deep = path.join(tmp, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'icons');
    fs.mkdirSync(path.dirname(deep), {recursive: true});
    fs.renameSync(pkg, deep);
    // The library is installed at the top, as a hoisting package manager does.
    fs.mkdirSync(path.join(tmp, 'node_modules', '@acme'), {recursive: true});
    fs.renameSync(
      path.join(deep, 'node_modules', '@acme', 'glyph-library'),
      path.join(tmp, 'node_modules', '@acme', 'glyph-library'),
    );
    pkg = deep;
    await runCli(['experimental', 'icon', 'new-set', 'outline'], pkg);
    const added = await json([
      'experimental',
      'icon',
      'add',
      'Bin',
      '--from',
      '@acme/glyph-library',
      '--definition',
      'delete',
    ]);
    expect(added.code).toBe(0);
    fs.writeFileSync(
      path.join(pkg, 'index.js'),
      "export * from './icon-sets/outline/outline.generated.js';\n",
    );
    const check = await runCli(['integration', 'check', '--json'], pkg);
    expect(check.stdout).not.toContain('icon_export_missing');
  }, 60_000);
});

describe('experimental icon add --variant --all', () => {
  beforeEach(() => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(lib, 'package.json'), 'utf-8'),
    );
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        ...pkgJson,
        exports: {...pkgJson.exports, './solid': './solid.js'},
      }),
    );
    // The solid module exports the same names; it has no Cross.
    fs.writeFileSync(
      path.join(lib, 'solid.js'),
      'export function BinIcon(props) { return null; }\n',
    );
  });

  it('adds the variant for every icon the module exports by the same id, in one run', async () => {
    expect(
      (
        await json([
          'experimental',
          'icon',
          'new-set',
          'glyphs',
          '--from',
          '@acme/glyph-library',
          '--variants',
          'outline,solid',
        ])
      ).code,
    ).toBe(0);
    const {code, body} = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'solid',
      '--from',
      '@acme/glyph-library/solid',
      '--all',
    ]);
    expect(code).toBe(0);
    expect(body.type).toBe('icon.addVariants');
    expect(body.data).toMatchObject({added: 1, already: 0, missing: ['cross']});
    const bin = dataOf('glyphs').icons.find(
      (/** @type {{id: string}} */ each) => each.id === 'bin',
    );
    expect(bin.variants).toEqual([{variant: 'solid', export: 'BinSolidIcon'}]);
    const generated = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'glyphs', 'glyphs.generated.js'),
      'utf-8',
    );
    expect(generated).toContain(
      "export {BinIcon as BinSolidIcon} from '@acme/glyph-library/solid';",
    );
    // Again: nothing changes.
    const again = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'solid',
      '--from',
      '@acme/glyph-library/solid',
      '--all',
    ]);
    expect(again.body.data).toMatchObject({
      added: 0,
      already: 1,
      changed: false,
    });
  });

  it('refuses an undeclared variant, and an export name with --all', async () => {
    await json([
      'experimental',
      'icon',
      'new-set',
      'glyphs',
      '--from',
      '@acme/glyph-library',
    ]);
    const undeclared = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'solid',
      '--from',
      '@acme/glyph-library/solid',
      '--all',
    ]);
    expect(undeclared.code).toBe(1);
    expect(undeclared.body.error).toContain('declares no variant "solid"');
    const named = await json([
      'experimental',
      'icon',
      'add',
      'BinIcon',
      '--variant',
      'solid',
      '--from',
      '@acme/glyph-library/solid',
      '--all',
    ]);
    expect(named.code).toBe(1);
    expect(named.body.error).toBe(
      '--all and an export name cannot be used together',
    );
    expect(named.body.code).toBe('ERR_INVALID_OPTION');
  });
});

describe('experimental icon map --pairs', () => {
  it('writes many entries in one write, all or none', async () => {
    await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    const bad = await json([
      'experimental',
      'icon',
      'map',
      '--pairs',
      'close=cross,delete=nope',
    ]);
    expect(bad.code).toBe(1);
    expect(bad.body.error).toContain('no icon "nope"');
    expect(dataOf('outline').map).toEqual({});
    const {code, body} = await json([
      'experimental',
      'icon',
      'map',
      '--pairs',
      'close=cross,delete=bin',
    ]);
    expect(code).toBe(0);
    expect(body.type).toBe('icon.mapMany');
    expect(body.data.entries).toEqual([
      {definition: 'close', icon: 'cross', previous: null, changed: true},
      {definition: 'delete', icon: 'bin', previous: null, changed: true},
    ]);
    expect(dataOf('outline').map).toEqual({close: 'cross', delete: 'bin'});
    // The theme map follows: close is built in.
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'outline', 'outline.generated.js'),
        'utf-8',
      ),
    ).toContain('close: createElement(CrossIcon,');
  });
});

describe('experimental icon new-set receipt', () => {
  it('takes --display-name and --description, and suggests icons by name words, never one map already names', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'video.js'),
      'export const VideoCamera = props => null;\nexport const Camera = props => null;\nexport const Clipboard = props => null;\n',
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {VideoCamera, Camera, Clipboard} from './icons/video.js';\n",
    );
    const {code, body} = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
      '--display-name',
      'Acme Outline',
      '--description',
      'Outline icons from the Acme glyph library.',
    ]);
    expect(code).toBe(0);
    const doc = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'outline', 'outline.doc.mjs'),
      'utf-8',
    );
    expect(doc).toContain("displayName: 'Acme Outline'");
    expect(doc).toContain(
      "description: 'Outline icons from the Acme glyph library.'",
    );
    // `video` gets video-camera (its name's words) before camera (a word);
    // clipboard is mapped to the clipboard definition, so copy never gets it.
    const video = body.data.suggestions.filter(
      (/** @type {{definition: string}} */ each) => each.definition === 'video',
    );
    expect(
      video.map((/** @type {{icon: string}} */ each) => each.icon),
    ).toEqual(['video-camera', 'camera']);
    expect(dataOf('outline').map).toMatchObject({clipboard: 'clipboard'});
    expect(
      body.data.suggestions.some(
        (/** @type {{icon: string}} */ each) => each.icon === 'clipboard',
      ),
    ).toBe(false);
  });
});

describe('experimental icon new-set: aliases, providers, exclude, peers', () => {
  beforeEach(() => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'extra.js'),
      [
        'export const Trash = props => null;',
        'export const PanelLeftClose = props => null;',
        'export function GlyphProvider(props) { return props.children; }',
        'export const Meta = props => null;',
        '',
      ].join('\n'),
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {Trash, Trash as Trash2, PanelLeftClose, GlyphProvider, Meta} from './icons/extra.js';\n",
    );
  });

  it('records other names as words, skips providers, keeps --exclude, and declares peers', async () => {
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf-8')),
        dependencies: {'@acme/glyph-library': '^2.0.0', react: '^19.0.0'},
      }),
    );
    const first = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
      '--exclude',
      'Meta',
    ]);
    expect(first.code).toBe(0);
    let data = dataOf('outline');
    const ids = data.icons.map((/** @type {{id: string}} */ each) => each.id);
    expect(ids).toContain('trash');
    expect(ids).not.toContain('trash-2');
    expect(ids).not.toContain('glyph-provider');
    expect(ids).not.toContain('meta');
    expect(data.exclude).toEqual(['Meta']);
    // The receipt names the exports it left out.
    expect(first.body.data.notes.join(' ')).toMatch(
      /Left out \d+ exports that are not icons: .*GlyphProvider/u,
    );
    expect(
      data.icons.find((/** @type {{id: string}} */ each) => each.id === 'trash')
        .words,
    ).toContain('trash-2');
    // close is never suggested panel-left-close: a suggestion starts with
    // the definition's name.
    expect(
      first.body.data.suggestions.some(
        (/** @type {{definition: string, icon: string}} */ each) =>
          each.definition === 'close' && each.icon === 'panel-left-close',
      ),
    ).toBe(false);
    // Peers: the receipt names the exact JSON to add; package.json keeps its
    // dependencies as they were (architecture:cli-surface INV16).
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pkg, 'package.json'), 'utf-8'),
    );
    expect(manifest).not.toHaveProperty('peerDependencies');
    expect(manifest.dependencies).toEqual({
      '@acme/glyph-library': '^2.0.0',
      react: '^19.0.0',
    });
    expect(first.body.data.notes).toContainEqual(
      expect.stringMatching(
        /^Declare the peers your set needs; add to package\.json "peerDependencies": `\{"react": ">=18", "@types\/react": ">=18", "@astryxdesign\/cli": ">=[^"]+"\}` and to "peerDependenciesMeta": `\{"@types\/react": \{"optional": true\}, "@astryxdesign\/cli": \{"optional": true\}\}`\.$/u,
      ),
    );

    // A refresh without --exclude still leaves Meta out, and says it refreshed.
    const again = await runCli(
      [
        'experimental',
        'icon',
        'new-set',
        'outline',
        '--from',
        '@acme/glyph-library',
      ],
      pkg,
    );
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('Icon set refreshed');
    expect(again.stdout).not.toContain('New icon set added');
    data = dataOf('outline');
    expect(
      data.icons.some((/** @type {{id: string}} */ each) => each.id === 'meta'),
    ).toBe(false);

    // map takes the kebab id of a definition and another name of an icon.
    const mapped = await json([
      'experimental',
      'icon',
      'map',
      'eye-slash',
      'cross',
    ]);
    expect(mapped.code).toBe(0);
    expect(mapped.body.data).toMatchObject({
      definition: 'eyeSlash',
      icon: 'cross',
    });
    const alias = await json([
      'experimental',
      'icon',
      'map',
      'delete',
      'trash-2',
    ]);
    expect(alias.code).toBe(0);
    expect(alias.body.data.icon).toBe('trash');
    // The same other name as the library exports it.
    const libraryName = await json([
      'experimental',
      'icon',
      'map',
      'delete',
      'Trash2',
    ]);
    expect(libraryName.code, JSON.stringify(libraryName.body)).toBe(0);
    expect(libraryName.body.data.icon).toBe('trash');
    const pairs = await json([
      'experimental',
      'icon',
      'map',
      '--pairs',
      'more-horizontal=bin,delete=trash-2',
    ]);
    expect(pairs.code).toBe(0);
    expect(dataOf('outline').map).toMatchObject({
      moreHorizontal: 'bin',
      delete: 'trash',
    });
  });
});

describe('blind run 3 fixes', () => {
  it('refreshes a set whose icons have variants', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(lib, 'package.json'), 'utf-8'),
    );
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        ...pkgJson,
        exports: {...pkgJson.exports, './solid': './solid.js'},
      }),
    );
    fs.writeFileSync(
      path.join(lib, 'solid.js'),
      'export function BinIcon(props) { return null; }\n',
    );
    const create = [
      'experimental',
      'icon',
      'new-set',
      'glyphs',
      '--from',
      '@acme/glyph-library',
      '--variants',
      'outline,solid',
    ];
    expect((await json(create)).code).toBe(0);
    expect(
      (
        await json([
          'experimental',
          'icon',
          'add',
          '--variant',
          'solid',
          '--from',
          '@acme/glyph-library/solid',
          '--all',
        ])
      ).code,
    ).toBe(0);
    const again = await json(create);
    expect(again.code).toBe(0);
    expect(again.body.data.refreshed).toBe(true);
    const bin = dataOf('glyphs').icons.find(
      (/** @type {{id: string}} */ each) => each.id === 'bin',
    );
    expect(bin.variants).toEqual([{variant: 'solid', export: 'BinSolidIcon'}]);
  });

  it('suggests the export with its Icon suffix, lists a set by id, and says what new-set did', async () => {
    const created = await runCli(
      [
        'experimental',
        'icon',
        'new-set',
        'outline',
        '--from',
        '@acme/glyph-library',
      ],
      pkg,
    );
    expect(created.stdout).toContain(
      'Declared the experimental.iconSets root ./icon-sets in astryx.integration.mjs.',
    );
    expect(created.stdout).toContain(
      "Add `export * from './icon-sets/outline/outline.generated.js';` to index.js, so the icons import from @acme/icons.",
    );
    const missing = await json([
      'experimental',
      'icon',
      'add',
      'Rocket',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(missing.code).toBe(1);
    const bin = await json([
      'experimental',
      'icon',
      'add',
      'Bi',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(bin.code).toBe(1);
    fs.appendFileSync(
      path.join(pkg, 'node_modules', '@acme', 'glyph-library', 'index.js'),
      "export {Bin as XMarkIcon} from './icons/bin.js';\n",
    );
    const suffix = await json([
      'experimental',
      'icon',
      'add',
      'XMark',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(suffix.code).toBe(1);
    expect(suffix.body.suggestions[0]).toMatchObject({name: 'XMarkIcon'});
    const listed = await json([
      'experimental',
      'icon',
      '--set',
      'outline',
      '--all-icons',
    ]);
    expect(listed.code).toBe(0);
    expect(listed.body.type).toBe('icon.setIcons');
    expect(
      listed.body.data.icons.map((/** @type {{id: string}} */ each) => each.id),
    ).toEqual(['bin', 'cross']);
    const text = await runCli(
      ['experimental', 'icon', '--set', 'outline', '--all-icons'],
      pkg,
    );
    expect(text.stdout).toContain('Icons in outline (2)');
    expect(text.stdout).toMatch(/^- bin: bin$/mu);
  });
});

describe('blind run 4 fixes', () => {
  it('names a ./ file icon as written', async () => {
    await json(['experimental', 'icon', 'new-set', 'outline']);
    fs.mkdirSync(path.join(pkg, 'src', 'icons'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'src', 'icons', 'check-double.js'),
      'export const CheckDouble = props => null;\nexport const CheckDoubleSolid = props => null;\n',
    );
    const added = await json([
      'experimental',
      'icon',
      'add',
      'CheckDouble',
      '--from',
      './src/icons/check-double.js',
      '--definition',
      'checkDouble',
    ]);
    expect(added.code).toBe(0);
    expect(added.body.data.icon).toMatchObject({
      id: 'check-double',
      export: 'CheckDoubleIcon',
    });
  });

  it('--definitions lists every definition, marking built-ins', async () => {
    const {code, body} = await json(['experimental', 'icon', '--definitions']);
    expect(code).toBe(0);
    expect(body.type).toBe('icon.definitions');
    const close = body.data.definitions.find(
      (/** @type {{name: string}} */ each) => each.name === 'close',
    );
    expect(close).toMatchObject({builtIn: true});
    expect(close.words).toContain('x');
    const text = await runCli(['experimental', 'icon', '--definitions'], pkg);
    expect(text.stdout).toMatch(/^- close \[built-in\]: /mu);
  });

  it('suggests an icon by another name its library gives it, and new-set names the typecheck script and a description note', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'face.js'),
      'export const FaceSlightlySmiling = props => null;\n',
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {FaceSlightlySmiling, FaceSlightlySmiling as Smile} from './icons/face.js';\n",
    );
    const {code, body} = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(code).toBe(0);
    expect(body.data.suggestions).toContainEqual({
      definition: 'emoji',
      icon: 'face-slightly-smiling',
      word: 'smile',
    });
    expect(body.data.notes.join(' ')).toContain('description is a placeholder');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pkg, 'package.json'), 'utf-8'),
    );
    // The script is the author's to add: the receipt names the exact line.
    expect(manifest).not.toHaveProperty('scripts');
    expect(body.data.notes).toContain(
      'Run `integration check --strict` in your build; add to package.json "scripts": `"typecheck": "astryx integration check --strict"`.',
    );
  });
});

describe('blind run 5 fixes', () => {
  it('names the ./ source folder files needs, maps by export name, and suggests by spelling and stem', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'more.js'),
      [
        'export const LightBulb = props => null;',
        'export const TrendingUp = props => null;',
        'export const LockOpen = props => null;',
        '',
      ].join('\n'),
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {LightBulb, TrendingUp, LockOpen, LockOpen as Unlock} from './icons/more.js';\n",
    );
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf-8')),
        files: ['index.js', 'icon-sets', 'astryx.integration.mjs'],
      }),
    );
    const {body} = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    const pairs = body.data.suggestions.map(
      (/** @type {{definition: string, icon: string}} */ each) =>
        `${each.definition}>${each.icon}`,
    );
    expect(pairs).toContain('lightbulb>light-bulb');
    expect(pairs).toContain('trendUp>trending-up');
    expect(pairs).toContain('unlock>lock-open');
    // map takes the export name, in any case.
    const byExport = await json([
      'experimental',
      'icon',
      'map',
      'close',
      'CrossIcon',
    ]);
    expect(byExport.body.data).toMatchObject({
      definition: 'close',
      icon: 'cross',
    });
    // A ./ file's folder is named for files, so the icon ships; files stays
    // the author's (architecture:cli-surface INV16).
    fs.mkdirSync(path.join(pkg, 'art'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'art', 'check-double.js'),
      'export const CheckDouble = props => null;\n',
    );
    const added = await json([
      'experimental',
      'icon',
      'add',
      'CheckDouble',
      '--from',
      './art/check-double.js',
      '--definition',
      'checkDouble',
    ]);
    expect(added.code).toBe(0);
    expect(added.body.data.files).not.toContain('package.json');
    expect(
      JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf-8'))
        .files,
    ).toEqual(['index.js', 'icon-sets', 'astryx.integration.mjs']);
    expect(added.body.data.note).toContain(
      './art/check-double.js is not in package.json "files", so it would not be published; set "files" to `["index.js","icon-sets","astryx.integration.mjs","art"]`.',
    );
    const text = await runCli(['experimental', 'icon', '--definitions'], pkg);
    expect(text.stdout).toMatch(/^- activity \[optional\]: /mu);
  });
});

describe('blind run 6 fixes', () => {
  it('never suggests the opposite direction, and names only a ./ file folder for files', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'dots.js'),
      'export const EllipsisHorizontal = props => null;\nexport const EllipsisVertical = props => null;\n',
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {EllipsisHorizontal, EllipsisVertical} from './icons/dots.js';\n",
    );
    const {body} = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    const more = body.data.suggestions
      .filter(
        (/** @type {{definition: string}} */ each) =>
          each.definition === 'moreHorizontal',
      )
      .map((/** @type {{icon: string}} */ each) => each.icon);
    expect(more).toEqual(['ellipsis-horizontal']);
    const manifestFile = path.join(pkg, 'package.json');
    fs.writeFileSync(
      manifestFile,
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(manifestFile, 'utf-8')),
        files: ['index.js', 'icon-sets'],
      }),
    );
    fs.mkdirSync(path.join(pkg, 'src', 'icons'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'src', 'icons', 'check-double.js'),
      'export const CheckDouble = props => null;\n',
    );
    const added = await json([
      'experimental',
      'icon',
      'add',
      'CheckDouble',
      '--from',
      './src/icons/check-double.js',
      '--definition',
      'checkDouble',
    ]);
    expect(added.body.data.note).toContain(
      'set "files" to `["index.js","icon-sets","src/icons"]`.',
    );
  });
});

describe('blind run 7 fixes', () => {
  it('a refresh rewrites the description, lists only files it changes, and words leave out bare numbers', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'volume.js'),
      'export const Volume2 = props => null;\n',
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {Volume2} from './icons/volume.js';\n",
    );
    const args = [
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ];
    await json(args);
    const volume = dataOf('outline').icons.find(
      (/** @type {{id: string}} */ each) => each.id === 'volume-2',
    );
    expect(volume.words).toEqual(['volume']);
    const dry = await json([...args, '--dry-run']);
    expect(dry.body.data.files).toEqual([]);
    const described = await json([
      ...args,
      '--description',
      "Acme's outline icons.",
    ]);
    expect(described.body.data.files).toEqual([
      'icon-sets/outline/outline.doc.mjs',
    ]);
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'outline', 'outline.doc.mjs'),
        'utf-8',
      ),
    ).toContain("description: 'Acme\\'s outline icons.',");
  });
});

describe('blind run 8 fixes', () => {
  it('a refresh lists every exact-name entry for review again', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'close.js'),
      'export const Close = props => null;\n',
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {Close} from './icons/close.js';\n",
    );
    const args = [
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ];
    expect((await json(args)).body.data.mapped).toEqual([
      {definition: 'close', icon: 'close'},
    ]);
    const again = await json([...args, '--dry-run']);
    expect(again.body.data.mapped).toEqual([
      {definition: 'close', icon: 'close'},
    ]);
  });
});

describe('package wiring stays the author’s', () => {
  /**
   * Every issue the check reports, by code and message.
   * @returns {Promise<Array<{code: string, message: string}>>}
   */
  async function checkIssues() {
    const body = JSON.parse(
      (await runCli(['integration', 'check', '--json'], pkg)).stdout,
    );
    /** @type {Array<{code: string, message: string}>} */
    const found = [];
    /** @param {unknown} node */
    const walk = node => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') {
        const each = /** @type {Record<string, unknown>} */ (node);
        if (typeof each.code === 'string' && typeof each.message === 'string') {
          found.push({code: each.code, message: each.message});
        }
        Object.values(each).forEach(walk);
      }
    };
    walk(body.data);
    return found;
  }

  it('integration check names the same entry change as the new-set receipt, once, until the author makes it', async () => {
    const {body} = await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    const note =
      "Add `export * from './icon-sets/outline/outline.generated.js';` to index.js, so the icons import from @acme/icons.";
    expect(body.data.notes).toContain(note);
    const missing = (await checkIssues()).filter(
      each => each.code === 'icon_export_missing',
    );
    expect([...new Set(missing.map(each => each.message))]).toEqual([
      `Icon set "outline": its icons are not exported from "@acme/icons" yet. ${note}`,
    ]);
    // The author adds the line; the finding is gone.
    fs.appendFileSync(
      path.join(pkg, 'index.js'),
      "export * from './icon-sets/outline/outline.generated.js';\n",
    );
    expect(
      (await checkIssues()).filter(each => each.code === 'icon_export_missing'),
    ).toEqual([]);
  });

  it('integration check never fails a built or CommonJS entry over the wiring it cannot read', async () => {
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf-8')),
        exports: {'.': './dist/index.cjs'},
      }),
    );
    fs.mkdirSync(path.join(pkg, 'dist'));
    fs.writeFileSync(
      path.join(pkg, 'dist', 'index.cjs'),
      'module.exports = {};\n',
    );
    await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(fs.readFileSync(path.join(pkg, 'dist', 'index.cjs'), 'utf-8')).toBe(
      'module.exports = {};\n',
    );
    expect(
      (await checkIssues()).filter(each =>
        each.message.includes('are not exported from'),
      ),
    ).toEqual([]);
  });
});

describe('a refresh that first records the source', () => {
  it('copies the library notices and takes its license, as new-set --from does', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(path.join(lib, 'LICENSE'), 'ISC License\n');
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(path.join(lib, 'package.json'), 'utf-8')),
        license: 'ISC',
      }),
    );
    expect(
      (await json(['experimental', 'icon', 'new-set', 'glyphs'])).code,
    ).toBe(0);
    const doc = path.join(pkg, 'icon-sets', 'glyphs', 'glyphs.doc.mjs');
    expect(fs.readFileSync(doc, 'utf-8')).toContain("license: 'MIT'");
    const pkgBefore = fs.readFileSync(path.join(pkg, 'package.json'), 'utf-8');

    const refreshed = await json([
      'experimental',
      'icon',
      'new-set',
      'glyphs',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(refreshed.code).toBe(0);
    expect(refreshed.body.data.refreshed).toBe(true);
    expect(refreshed.body.data.files).toEqual(
      expect.arrayContaining([
        'icon-sets/glyphs/glyphs.doc.mjs',
        'icon-sets/glyphs/LICENSE',
      ]),
    );
    expect(dataOf('glyphs').source).toEqual({
      package: '@acme/glyph-library',
      version: '2.0.0',
    });
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'glyphs', 'LICENSE'),
        'utf-8',
      ),
    ).toBe('ISC License\n');
    expect(fs.readFileSync(doc, 'utf-8')).toContain("license: 'ISC'");
    expect(refreshed.body.data.notes).toContain(
      'The set\'s license in icon-sets/glyphs/glyphs.doc.mjs changed from "MIT" to "ISC", the license of @acme/glyph-library, whose artwork it now wraps. Edit it if the artwork\'s license differs.',
    );
    // The package's own license is the author's (INV16).
    expect(fs.readFileSync(path.join(pkg, 'package.json'), 'utf-8')).toBe(
      pkgBefore,
    );
    const strict = await runCli(
      ['integration', 'check', '--strict', '--json'],
      pkg,
    );
    expect(strict.stdout).not.toContain('icon_license_notice_missing');

    // A later refresh keeps the author's license.
    fs.writeFileSync(
      doc,
      fs
        .readFileSync(doc, 'utf-8')
        .replace("license: 'ISC'", "license: 'ISC AND CC-BY-4.0'"),
    );
    await json([
      'experimental',
      'icon',
      'new-set',
      'glyphs',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(fs.readFileSync(doc, 'utf-8')).toContain(
      "license: 'ISC AND CC-BY-4.0'",
    );
  });
});

describe('a first-source refresh over a license the author chose', () => {
  it('keeps it, and the receipt names both licenses', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(path.join(lib, 'package.json'), 'utf-8')),
        license: 'ISC',
      }),
    );
    await json(['experimental', 'icon', 'new-set', 'glyphs']);
    const doc = path.join(pkg, 'icon-sets', 'glyphs', 'glyphs.doc.mjs');
    fs.writeFileSync(
      doc,
      fs
        .readFileSync(doc, 'utf-8')
        .replace("license: 'MIT'", "license: 'CC-BY-4.0'"),
    );
    const refreshed = await json([
      'experimental',
      'icon',
      'new-set',
      'glyphs',
      '--from',
      '@acme/glyph-library',
    ]);
    expect(refreshed.code).toBe(0);
    expect(fs.readFileSync(doc, 'utf-8')).toContain("license: 'CC-BY-4.0'");
    expect(refreshed.body.data.notes).toContain(
      'The set\'s license in icon-sets/glyphs/glyphs.doc.mjs stays "CC-BY-4.0", which you set; @acme/glyph-library is licensed "ISC". Change it if the artwork is the library\'s.',
    );
  });
});

describe('map names an icon only by its id, export name, or another library name', () => {
  beforeEach(() => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'glass.js'),
      'export const MagnifyingGlass = props => null;\n',
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {MagnifyingGlass, MagnifyingGlass as Search} from './icons/glass.js';\n",
    );
  });

  it('refuses a word an icon carries, with the icons that carry it, and writes nothing', async () => {
    await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ]);
    const dataFile = path.join(
      pkg,
      'icon-sets',
      'outline',
      'outline.icons.json',
    );
    const before = fs.readFileSync(dataFile, 'utf-8');

    const word = await json([
      'experimental',
      'icon',
      'map',
      'moreHorizontal',
      'glass',
    ]);
    expect(word.code).toBe(1);
    expect(word.body.error).toContain('has no icon "glass"');
    expect(word.body.error).toContain('a word it carries is not its name');
    expect(
      word.body.suggestions.map(
        (/** @type {{name: string}} */ each) => each.name,
      ),
    ).toContain('magnifying-glass');

    const pairs = await json([
      'experimental',
      'icon',
      'map',
      '--pairs',
      'close=cross,moreHorizontal=glass',
    ]);
    expect(pairs.code).toBe(1);
    expect(pairs.body.error).toContain('Nothing was written');
    expect(fs.readFileSync(dataFile, 'utf-8')).toBe(before);

    // The id, the export name in any case, and another library name map.
    for (const [given, id] of [
      ['magnifying-glass', 'magnifying-glass'],
      ['magnifyingglassicon', 'magnifying-glass'],
      ['MagnifyingGlass', 'magnifying-glass'],
      ['search', 'magnifying-glass'],
      ['Search', 'magnifying-glass'],
    ]) {
      const ok = await json(['experimental', 'icon', 'map', 'search', given]);
      expect(ok.code, given).toBe(0);
      expect(ok.body.data.icon, given).toBe(id);
    }
  });
});

describe('a refresh after the id rule changes', () => {
  it('carries a renamed icon’s map entries, variants, and words, matched by its export, and reports the rename', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'icons', 'squares.js'),
      'export const Squares2X2Icon = props => null;\n',
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {Squares2X2Icon} from './icons/squares.js';\n",
    );
    const args = [
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
      '--variants',
      'outline,solid',
    ];
    expect((await json(args)).code).toBe(0);
    // Rewrite the data file as the old id rule wrote it: `squares-2-x2`,
    // with that rule's words, a word the author added, a variant, and a map
    // entry.
    const dataFile = path.join(
      pkg,
      'icon-sets',
      'outline',
      'outline.icons.json',
    );
    const data = dataOf('outline');
    const icon = data.icons.find(
      (/** @type {{export: string}} */ each) =>
        each.export === 'Squares2X2Icon',
    );
    Object.assign(icon, {
      id: 'squares-2-x2',
      words: ['squares', 'x2', 'tiles'],
      variants: [{variant: 'solid', export: 'Squares2X2SolidIcon'}],
    });
    data.map = {...data.map, moreHorizontal: 'squares-2-x2'};
    fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);

    const refreshed = await json(args);
    expect(refreshed.code).toBe(0);
    expect(refreshed.body.data.renamed).toEqual([
      {from: 'squares-2-x2', to: 'squares-2x2'},
    ]);
    const notes = refreshed.body.data.notes.join(' ');
    expect(notes).toContain('squares-2-x2 -> squares-2x2');
    expect(notes).not.toContain('no longer exports');
    const after = dataOf('outline');
    expect(after.map.moreHorizontal).toBe('squares-2x2');
    const renamed = after.icons.find(
      (/** @type {{export: string}} */ each) =>
        each.export === 'Squares2X2Icon',
    );
    expect(renamed).toMatchObject({
      id: 'squares-2x2',
      variants: [{variant: 'solid', export: 'Squares2X2SolidIcon'}],
    });
    expect(renamed.words).toContain('tiles');
    expect(renamed.words).not.toContain('x2');
    expect(
      after.icons.some(
        (/** @type {{id: string}} */ each) => each.id === 'squares-2-x2',
      ),
    ).toBe(false);
    // The export stays in the generated module.
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'outline', 'outline.generated.js'),
        'utf-8',
      ),
    ).toContain('Squares2X2Icon');
  });
});

describe('add --variant --all after the id rule changes', () => {
  it('meets an icon whose id an older rule wrote by its export name', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(path.join(lib, 'package.json'), 'utf-8')),
        exports: {'.': './index.js', './solid': './solid.js'},
      }),
    );
    fs.writeFileSync(
      path.join(lib, 'icons', 'squares.js'),
      'export const Squares2X2Icon = props => null;\n',
    );
    fs.appendFileSync(
      path.join(lib, 'index.js'),
      "export {Squares2X2Icon} from './icons/squares.js';\n",
    );
    fs.writeFileSync(
      path.join(lib, 'solid.js'),
      'export const Squares2X2Icon = props => null;\n',
    );
    await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
      '--variants',
      'outline,solid',
    ]);
    const dataFile = path.join(
      pkg,
      'icon-sets',
      'outline',
      'outline.icons.json',
    );
    const data = dataOf('outline');
    data.icons.find(
      (/** @type {{export: string}} */ each) =>
        each.export === 'Squares2X2Icon',
    ).id = 'squares-2-x2';
    fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);
    const added = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'solid',
      '--from',
      '@acme/glyph-library/solid',
      '--all',
    ]);
    expect(added.code).toBe(0);
    expect(added.body.data.missing).not.toContain('squares-2-x2');
    expect(
      dataOf('outline').icons.find(
        (/** @type {{id: string}} */ each) => each.id === 'squares-2-x2',
      ).variants,
    ).toEqual([{variant: 'solid', export: 'Squares2X2SolidIcon'}]);
  });
});

describe('--set through the CLI selects the set add, map, and new-definition edit', () => {
  beforeEach(async () => {
    for (const set of ['one', 'two']) {
      await json([
        'experimental',
        'icon',
        'new-set',
        set,
        '--from',
        '@acme/glyph-library',
      ]);
    }
    // A third set that is withdrawn: its data file is not JSON.
    const broken = path.join(pkg, 'icon-sets', 'lines');
    fs.mkdirSync(broken, {recursive: true});
    fs.writeFileSync(
      path.join(broken, 'lines.doc.mjs'),
      fs
        .readFileSync(path.join(pkg, 'icon-sets', 'one', 'one.doc.mjs'), 'utf8')
        .replace("name: 'one'", "name: 'lines'"),
    );
    fs.writeFileSync(path.join(broken, 'lines.icons.json'), '{nope');
  });

  /** @type {Array<[string, (set: string) => string[], string]>} the command, its words, the icon it maps */
  const COMMANDS = [
    [
      'map',
      set => ['experimental', 'icon', 'map', 'delete', 'bin', '--set', set],
      'bin',
    ],
    [
      'add',
      set => [
        'experimental',
        'icon',
        'add',
        'Rocket',
        '--from',
        '@acme/glyph-library/rocket',
        '--default',
        '--definition',
        'delete',
        '--set',
        set,
      ],
      'rocket',
    ],
    [
      'new-definition',
      set => [
        'experimental',
        'icon',
        'new-definition',
        'binIt',
        '--description',
        'Put something in the bin.',
        '--words',
        'bin',
        '--icon',
        'bin',
        '--set',
        set,
      ],
      'bin',
    ],
  ];

  it.each(COMMANDS)(
    '%s --set edits that set and leaves the other',
    async (_name, args, id) => {
      const before = fs.readFileSync(
        path.join(pkg, 'icon-sets', 'one', 'one.icons.json'),
        'utf-8',
      );
      const res = await json(args('two'));
      expect(res.code, JSON.stringify(res.body)).toBe(0);
      expect(
        fs.readFileSync(
          path.join(pkg, 'icon-sets', 'one', 'one.icons.json'),
          'utf-8',
        ),
      ).toBe(before);
      expect(Object.values(dataOf('two').map)).toContain(id);
    },
  );

  it.each(COMMANDS)('%s --set with a missing set', async (_name, args) => {
    const res = await json(args('nope'));
    expect(res.code).toBe(1);
    expect(res.body).toMatchObject({
      code: 'ERR_NOT_FOUND',
      error: 'No icon set named "nope" in this package',
    });
  });

  it.each(COMMANDS)('%s --set with a withdrawn set', async (_name, args) => {
    const res = await json(args('lines'));
    expect(res.code).toBe(1);
    expect(res.body.code).toBe('ERR_NOT_FOUND');
    expect(res.body.error).toMatch(
      /^Icon set "lines" is in this package but withdrawn: .*not valid JSON/u,
    );
  });
});

describe('a refresh of a set wrapped from a prefixed library by an older id rule', () => {
  it('matches each icon by the library export it re-exports, and keeps its public export byte for byte', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'hero');
    fs.mkdirSync(lib, {recursive: true});
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        name: '@acme/hero',
        version: '1.0.0',
        type: 'module',
        exports: {'.': './index.js'},
      }),
    );
    fs.writeFileSync(
      path.join(lib, 'index.js'),
      [
        'export const HiSquares2X2Icon = props => null;',
        'export const HiTrashIcon = props => null;',
        'export const HiXMarkIcon = props => null;',
        '',
      ].join('\n'),
    );
    const args = [
      'experimental',
      'icon',
      'new-set',
      'hero',
      '--from',
      '@acme/hero',
    ];
    expect((await json(args)).code).toBe(0);
    const setDir = path.join(pkg, 'icon-sets', 'hero');
    const generatedFile = path.join(setDir, 'hero.generated.js');
    const typesFile = path.join(setDir, 'hero.generated.d.ts');
    // Rewrite the set as an older id rule wrote it: id `squares-2-x2`,
    // public export `Squares2X2Icon`, re-exporting `HiSquares2X2Icon`, with
    // a map entry and an author's word.
    const data = dataOf('hero');
    const squares = data.icons.find(
      (/** @type {{id: string}} */ each) => each.id === 'squares-2x2',
    );
    const newName = squares.export;
    Object.assign(squares, {
      id: 'squares-2-x2',
      export: 'Squares2X2Icon',
      words: ['squares', 'x2', 'grid-view'],
    });
    data.map = {...data.map, moreHorizontal: 'squares-2-x2'};
    fs.writeFileSync(
      path.join(setDir, 'hero.icons.json'),
      `${JSON.stringify(data, null, 2)}\n`,
    );
    for (const file of [generatedFile, typesFile]) {
      fs.writeFileSync(
        file,
        fs.readFileSync(file, 'utf-8').replaceAll(newName, 'Squares2X2Icon'),
      );
    }
    expect(fs.readFileSync(generatedFile, 'utf-8')).toContain(
      "export {HiSquares2X2Icon as Squares2X2Icon} from '@acme/hero';",
    );

    const refreshed = await json(args);
    expect(refreshed.code).toBe(0);
    expect(refreshed.body.data.renamed).toEqual([
      {from: 'squares-2-x2', to: 'squares-2x2'},
    ]);
    expect(refreshed.body.data.notes.join(' ')).not.toContain(
      'no longer exports',
    );
    const after = dataOf('hero');
    expect(after.map.moreHorizontal).toBe('squares-2x2');
    const kept = after.icons.find(
      (/** @type {{id: string}} */ each) => each.id === 'squares-2x2',
    );
    expect(kept.export).toBe('Squares2X2Icon');
    expect(kept.words).toContain('grid-view');
    const generated = fs.readFileSync(generatedFile, 'utf-8');
    expect(generated).toContain(
      "export {HiSquares2X2Icon as Squares2X2Icon} from '@acme/hero';",
    );
    expect(generated).not.toContain(
      newName === 'Squares2X2Icon' ? '\0' : newName,
    );
    // The set still checks: its types match its module, and, once the entry
    // re-exports it, every icon export resolves.
    fs.appendFileSync(
      path.join(pkg, 'index.js'),
      "export * from './icon-sets/hero/hero.generated.js';\n",
    );
    const check = await runCli(['integration', 'check', '--json'], pkg);
    expect(check.stdout).not.toContain('icon_generated_types_mismatch');
    expect(check.stdout).not.toContain('icon_export_missing');
  });
});

describe('add --variant --all on a set an older id rule wrote from a prefixed library', () => {
  it('meets each icon by the library export it re-exports', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'hero');
    fs.mkdirSync(lib, {recursive: true});
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        name: '@acme/hero',
        version: '1.0.0',
        type: 'module',
        exports: {'.': './index.js', './solid': './solid.js'},
      }),
    );
    const source =
      'export const HiSquares2X2Icon = props => null;\nexport const HiTrashIcon = props => null;\n';
    fs.writeFileSync(path.join(lib, 'index.js'), source);
    fs.writeFileSync(path.join(lib, 'solid.js'), source);
    await json([
      'experimental',
      'icon',
      'new-set',
      'hero',
      '--from',
      '@acme/hero',
      '--variants',
      'outline,solid',
    ]);
    const setDir = path.join(pkg, 'icon-sets', 'hero');
    const data = dataOf('hero');
    const squares = data.icons.find(
      (/** @type {{id: string}} */ each) => each.id === 'squares-2x2',
    );
    const newName = squares.export;
    Object.assign(squares, {id: 'squares-2-x2', export: 'Squares2X2Icon'});
    fs.writeFileSync(
      path.join(setDir, 'hero.icons.json'),
      `${JSON.stringify(data, null, 2)}\n`,
    );
    for (const file of ['hero.generated.js', 'hero.generated.d.ts']) {
      const full = path.join(setDir, file);
      fs.writeFileSync(
        full,
        fs.readFileSync(full, 'utf-8').replaceAll(newName, 'Squares2X2Icon'),
      );
    }
    const added = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'solid',
      '--from',
      '@acme/hero/solid',
      '--all',
    ]);
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(added.body.data.missing).toEqual([]);
    expect(
      dataOf('hero').icons.find(
        (/** @type {{id: string}} */ each) => each.id === 'squares-2-x2',
      ).variants,
    ).toEqual([{variant: 'solid', export: 'Squares2X2SolidIcon'}]);
  });
});

describe('a refresh after the library drops an icon', () => {
  it('names the icon it removed and the map entry that lost it', async () => {
    const args = [
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ];
    await json(args);
    await json(['experimental', 'icon', 'map', 'close', 'cross']);
    const index = path.join(
      pkg,
      'node_modules',
      '@acme',
      'glyph-library',
      'index.js',
    );
    fs.writeFileSync(
      index,
      fs
        .readFileSync(index, 'utf-8')
        .replace("export {Cross} from './icons/cross.js';\n", ''),
    );
    const refreshed = await json(args);
    expect(refreshed.code).toBe(0);
    expect(refreshed.body.data.notes).toEqual(
      expect.arrayContaining([
        'These map entries named those icons and were removed: close -> "cross".',
        '1 icons the library no longer exports were removed from the set: cross.',
      ]),
    );
  });
});

describe('a refresh changes only the icons the refreshed module supplies', () => {
  beforeEach(() => {
    // A second library, and your own artwork.
    const other = path.join(pkg, 'node_modules', '@acme', 'other-library');
    fs.mkdirSync(other, {recursive: true});
    fs.writeFileSync(
      path.join(other, 'package.json'),
      JSON.stringify({
        name: '@acme/other-library',
        version: '1.0.0',
        type: 'module',
        exports: {'.': './index.js'},
      }),
    );
    fs.writeFileSync(
      path.join(other, 'index.js'),
      'export const Rocket = props => null;\n',
    );
    fs.mkdirSync(path.join(pkg, 'art'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'art', 'spark.js'),
      'export const Spark = props => null;\n',
    );
    fs.writeFileSync(
      path.join(pkg, 'art', 'spark.d.ts'),
      'export declare const Spark: (props: object) => null;\n',
    );
  });

  it('keeps your ./ artwork and another library’s icon, with their map entries and module lines, and still removes a library icon that went away', async () => {
    const args = [
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ];
    expect((await json(args)).code).toBe(0);
    for (const add of [
      ['Spark', '--from', './art/spark.js', '--definition', 'sparkles'],
      ['Rocket', '--from', '@acme/other-library', '--definition', 'rocket'],
    ]) {
      const added = await json(['experimental', 'icon', 'add', ...add]);
      expect(added.code, JSON.stringify(added.body)).toBe(0);
    }
    await json(['experimental', 'icon', 'map', 'close', 'cross']);
    const generatedFile = path.join(
      pkg,
      'icon-sets',
      'outline',
      'outline.generated.js',
    );
    const before = fs.readFileSync(generatedFile, 'utf-8');
    const sparkLine = before
      .split('\n')
      .find(line => line.includes('SparkIcon') && line.includes('art/spark'));
    const rocketLine = before
      .split('\n')
      .find(
        line => line.includes('RocketIcon') && line.includes('other-library'),
      );
    expect(sparkLine).toBeTruthy();
    expect(rocketLine).toBeTruthy();
    // The library drops Cross.
    const index = path.join(
      pkg,
      'node_modules',
      '@acme',
      'glyph-library',
      'index.js',
    );
    fs.writeFileSync(
      index,
      fs
        .readFileSync(index, 'utf-8')
        .replace("export {Cross} from './icons/cross.js';\n", ''),
    );

    const refreshed = await json(args);
    expect(refreshed.code).toBe(0);
    const data = dataOf('outline');
    const ids = data.icons.map((/** @type {{id: string}} */ each) => each.id);
    expect(ids).toEqual(expect.arrayContaining(['bin', 'spark', 'rocket']));
    expect(ids).not.toContain('cross');
    expect(data.map).toMatchObject({sparkles: 'spark', rocket: 'rocket'});
    expect(data.map).not.toHaveProperty('close');
    const after = fs.readFileSync(generatedFile, 'utf-8');
    expect(after).toContain(/** @type {string} */ (sparkLine));
    expect(after).toContain(/** @type {string} */ (rocketLine));
    const notes = refreshed.body.data.notes.join('\n');
    expect(notes).toContain(
      '1 icons the library no longer exports were removed from the set: cross.',
    );
    expect(notes).toContain('close -> "cross"');
    expect(notes).not.toMatch(/spark|rocket/u);
  });

  it('add --variant --all leaves icons from other modules alone and never lists them as missing', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'glyph-library');
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(path.join(lib, 'package.json'), 'utf-8')),
        exports: {'.': './index.js', './solid': './solid.js'},
      }),
    );
    // The solid module also exports a Spark: it is not your Spark.
    fs.writeFileSync(
      path.join(lib, 'solid.js'),
      'export const Bin = props => null;\nexport const Spark = props => null;\n',
    );
    await json([
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
      '--variants',
      'outline,solid',
    ]);
    await json([
      'experimental',
      'icon',
      'add',
      'Spark',
      '--from',
      './art/spark.js',
      '--definition',
      'sparkles',
    ]);
    const added = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'solid',
      '--from',
      '@acme/glyph-library/solid',
      '--all',
    ]);
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(added.body.data.missing).toEqual(['cross']);
    const spark = dataOf('outline').icons.find(
      (/** @type {{id: string}} */ each) => each.id === 'spark',
    );
    expect(spark.variants).toBeUndefined();
  });
});

describe('a refresh with --exclude', () => {
  it('names the icons --exclude left out, never as ones the library no longer exports', async () => {
    const args = [
      'experimental',
      'icon',
      'new-set',
      'outline',
      '--from',
      '@acme/glyph-library',
    ];
    await json(args);
    await json(['experimental', 'icon', 'map', 'close', 'cross']);
    const refreshed = await json([...args, '--exclude', 'Cross']);
    expect(refreshed.code).toBe(0);
    const notes = refreshed.body.data.notes;
    expect(notes).toEqual(
      expect.arrayContaining([
        'Left out by --exclude, and removed from the set: cross.',
        'These map entries named icons --exclude left out and were removed: close -> "cross".',
      ]),
    );
    expect(notes.join('\n')).not.toContain('no longer exports');
    expect(dataOf('outline').exclude).toEqual(['Cross']);
  });
});
