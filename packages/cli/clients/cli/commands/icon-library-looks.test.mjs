// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A library that draws each icon in several looks, named in its
 * exports (`XOutline24WGHT400Icon`): one root barrel of default re-exports
 * and a file per export, as large vector libraries ship. `new-set`, `add`
 * and a refresh wrap each glyph once, by its glyph id, in the look the set
 * prefers.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {doc as newSetDoc} from '../../../api/icon/iconNewSet.doc.mjs';
import {
  libraryIcons,
  lookPositions,
} from '../../../foundation/discovery/icon-set-writer.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let pkg;

const STYLES = ['Filled', 'Outline'];
const WEIGHTS = [300, 400, 500];

/**
 * Write `@acme/vector-icons`: each glyph in every style and weight, and
 * `Heart` filled only.
 * @param {string[]} glyphs
 */
function writeVectorLibrary(glyphs) {
  const lib = path.join(pkg, 'node_modules', '@acme', 'vector-icons');
  fs.mkdirSync(path.join(lib, 'icons'), {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name: '@acme/vector-icons',
      version: '0.2.6',
      type: 'module',
      exports: {'.': './index.js', './*Icon': './icons/*Icon.js'},
    }),
  );
  /** @type {string[]} */
  const names = [];
  for (const glyph of glyphs) {
    for (const style of glyph === 'Heart' ? ['Filled'] : STYLES) {
      for (const weight of WEIGHTS) {
        names.push(`${glyph}${style}24WGHT${weight}Icon`);
      }
    }
  }
  for (const name of names) {
    fs.writeFileSync(
      path.join(lib, 'icons', `${name}.js`),
      'export default function h(props) { return null; }\n',
    );
  }
  fs.writeFileSync(
    path.join(lib, 'index.js'),
    [
      "export {renderIcon} from './types.js';",
      ...names.map(
        name => `export {default as ${name}} from './icons/${name}.js';`,
      ),
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(lib, 'types.js'),
    'export function renderIcon(Icon, props) { return null; }\n',
  );
  return path.join(lib, 'index.js');
}

const GLYPHS = ['X', 'Star', 'ArrowDown', 'Search', 'Trash', 'Heart'];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-looks-'));
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
        dependencies: {'@acme/vector-icons': '^0.2.6'},
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(pkg, 'index.js'), 'export {};\n');
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args */
async function json(args) {
  const res = await runCli([...args, '--json'], pkg);
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

/** @param {string} set */
const generatedOf = set =>
  fs.readFileSync(
    path.join(pkg, 'icon-sets', set, `${set}.generated.js`),
    'utf-8',
  );

const NEW_SET = [
  'experimental',
  'icon',
  'new-set',
  'brand',
  '--from',
  '@acme/vector-icons',
];

describe('the looks a library names its exports by', () => {
  it('finds the trailing style, size and weight words, and none in a library of glyph names', () => {
    const file = writeVectorLibrary(GLYPHS);
    const icons = libraryIcons(file);
    expect(icons.map(icon => icon.id)).toEqual([
      'arrow-down',
      'heart',
      'search',
      'star',
      'trash',
      'x',
    ]);
    const x = icons.find(icon => icon.id === 'x');
    // The outline look, the middle weight.
    expect(x).toMatchObject({export: 'XOutline24WGHT400Icon', name: 'XIcon'});
    expect(x?.looks).toHaveLength(6);
    // A glyph drawn only filled comes in filled.
    expect(icons.find(icon => icon.id === 'heart')?.export).toBe(
      'HeartFilled24WGHT400Icon',
    );
    expect(
      libraryIcons(file, {prefer: ['filled']}).find(icon => icon.id === 'x')
        ?.export,
    ).toBe('XFilled24WGHT400Icon');
    // Glyph names with numbers are not looks.
    expect(
      lookPositions(
        Array.from({length: 40}, (_, index) =>
          index % 2 ? `clock-${index}` : `arrow-${index}`,
        ),
      ),
    ).toEqual([]);
  });
});

describe('a library whose names end in directions', () => {
  it('groups no looks, and maps each arrow and chevron definition by its exact name', async () => {
    const lib = path.join(pkg, 'node_modules', '@acme', 'arrow-icons');
    fs.mkdirSync(lib, {recursive: true});
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        name: '@acme/arrow-icons',
        version: '1.0.0',
        type: 'module',
        exports: {'.': './index.js'},
      }),
    );
    const names = ['Arrow', 'Chevron', 'Caret', 'Triangle', 'Hand', 'Pointer']
      .flatMap(glyph =>
        ['Up', 'Down', 'Left', 'Right'].map(way => `${glyph}${way}Icon`),
      )
      .sort();
    fs.writeFileSync(
      path.join(lib, 'index.js'),
      names
        .map(name => `export function ${name}(props) { return null; }`)
        .join('\n') + '\n',
    );
    expect(libraryIcons(path.join(lib, 'index.js'))).toHaveLength(24);
    expect(
      lookPositions(
        names.map(name =>
          name
            .replace(/Icon$/u, '')
            .replace(/([a-z])([A-Z])/gu, '$1-$2')
            .toLowerCase(),
        ),
      ),
    ).toEqual([]);
    const {code, body} = await json([
      'experimental',
      'icon',
      'new-set',
      'arrows',
      '--from',
      '@acme/arrow-icons',
    ]);
    expect(code, JSON.stringify(body)).toBe(0);
    const data = dataOf('arrows');
    expect(data.icons).toHaveLength(24);
    expect(data.map).toMatchObject({
      arrowUp: 'arrow-up',
      arrowDown: 'arrow-down',
      arrowLeft: 'arrow-left',
      arrowRight: 'arrow-right',
      chevronUp: 'chevron-up',
      chevronDown: 'chevron-down',
      chevronLeft: 'chevron-left',
      chevronRight: 'chevron-right',
    });
    expect(generatedOf('arrows')).toContain(
      "export {ArrowUpIcon} from '@acme/arrow-icons';",
    );
  });
});

describe('new-set --from a library of looks', () => {
  it('wraps each glyph once by its glyph id, says what it found, and suggests only the default look', async () => {
    writeVectorLibrary(GLYPHS);
    const {code, body} = await json(NEW_SET);
    expect(code, JSON.stringify(body)).toBe(0);
    const data = dataOf('brand');
    expect(
      data.icons.map((/** @type {{id: string}} */ icon) => icon.id),
    ).toEqual(['arrow-down', 'heart', 'search', 'star', 'trash', 'x']);
    expect(generatedOf('brand')).toContain(
      "export {XOutline24WGHT400Icon as XIcon} from '@acme/vector-icons';",
    );
    expect(data.map).toMatchObject({arrowDown: 'arrow-down', star: 'star'});
    const notes = body.data.notes.join('\n');
    expect(notes).toContain(
      'Found 6 icons in @acme/vector-icons, each drawn in several looks (filled or outline; 24; wght300, wght400, wght500) by 33 exports.',
    );
    expect(notes).toContain('in the outline 24 wght400 look');
    expect(body.data.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({definition: 'close', icon: 'x'}),
      ]),
    );
    expect(JSON.stringify(body.data.suggestions)).not.toMatch(
      /filled|wght|outline/u,
    );
  });

  it('takes the look the set’s default variant names', async () => {
    writeVectorLibrary(GLYPHS);
    const {code} = await json([
      ...NEW_SET,
      '--variants',
      'outline,filled',
      '--default-variant',
      'filled',
    ]);
    expect(code).toBe(0);
    expect(generatedOf('brand')).toContain(
      "export {XFilled24WGHT400Icon as XIcon} from '@acme/vector-icons';",
    );
  });

  it('adds another look as a variant of every glyph, and lists a glyph drawn in no such look as missing', async () => {
    writeVectorLibrary(GLYPHS);
    await json([...NEW_SET, '--variants', 'outline,filled']);
    const added = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'filled',
      '--from',
      '@acme/vector-icons',
      '--all',
    ]);
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    // Heart's own export is its only look, filled: no second export of it.
    expect(added.body.data.missing).toEqual(['heart']);
    expect(generatedOf('brand')).not.toContain('HeartFilledIcon');
    expect(generatedOf('brand')).toContain(
      "export {XFilled24WGHT400Icon as XFilledIcon} from '@acme/vector-icons';",
    );
    const outlineOnly = await json([
      ...NEW_SET.slice(0, 3),
      'outline-set',
      '--from',
      '@acme/vector-icons',
      '--variants',
      'filled,outline',
      '--default-variant',
      'filled',
    ]);
    expect(outlineOnly.code).toBe(0);
    const outline = await json([
      'experimental',
      'icon',
      'add',
      '--set',
      'outline-set',
      '--variant',
      'outline',
      '--from',
      '@acme/vector-icons',
      '--all',
    ]);
    expect(outline.body.data.missing).toEqual(['heart']);
  });
});

describe('add <Export> --from a library of looks', () => {
  it('names the icon by its glyph and lists the definitions that fit it', async () => {
    writeVectorLibrary(GLYPHS);
    await json(['experimental', 'icon', 'new-set', 'brand']);
    const listed = await json([
      'experimental',
      'icon',
      'add',
      'XOutline24WGHT500Icon',
      '--from',
      '@acme/vector-icons',
    ]);
    expect(listed.code, JSON.stringify(listed.body)).toBe(0);
    expect(listed.body.data.id).toBe('x');
    expect(listed.body.data.matches[0].name).toBe('close');
    const added = await json([
      'experimental',
      'icon',
      'add',
      'XOutline24WGHT500Icon',
      '--from',
      '@acme/vector-icons',
      '--definition',
      'close',
    ]);
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(dataOf('brand').map).toMatchObject({close: 'x'});
    expect(generatedOf('brand')).toContain(
      "export {XOutline24WGHT500Icon as XIcon} from '@acme/vector-icons';",
    );
  });
});

describe('a refresh of a set an earlier release wrapped one look at a time', () => {
  it('keeps every icon and id it has, removes none, and brings a new glyph in once', async () => {
    // Too few exports to show looks: each export is its own icon, as an
    // earlier release wrapped every library.
    writeVectorLibrary(['X', 'Star', 'ArrowDown']);
    expect((await json(NEW_SET)).code).toBe(0);
    await json([
      'experimental',
      'icon',
      'map',
      'close',
      'x-outline-24-wght400',
    ]);
    const before = dataOf('brand');
    expect(before.icons).toHaveLength(18);
    writeVectorLibrary(GLYPHS);
    const refreshed = await json(NEW_SET);
    expect(refreshed.code, JSON.stringify(refreshed.body)).toBe(0);
    const after = dataOf('brand');
    const ids = after.icons.map((/** @type {{id: string}} */ icon) => icon.id);
    for (const icon of before.icons) expect(ids).toContain(icon.id);
    expect(ids).toEqual(expect.arrayContaining(['search', 'trash', 'heart']));
    expect(ids).not.toContain('search-outline-24-wght400');
    expect(after.map.close).toBe('x-outline-24-wght400');
    const notes = refreshed.body.data.notes.join('\n');
    expect(notes).not.toMatch(/no longer exports|new id/u);
  });
});

describe('commands add prints run as printed', () => {
  it('repeats --default, --set and --id in each listed command', async () => {
    writeVectorLibrary(GLYPHS);
    await json(['experimental', 'icon', 'new-set', 'brand']);
    const from = '@acme/vector-icons/XOutline24WGHT500Icon';
    const listed = await json([
      'experimental',
      'icon',
      'add',
      'XIcon',
      '--from',
      from,
      '--default',
      '--set',
      'brand',
    ]);
    expect(listed.code, JSON.stringify(listed.body)).toBe(0);
    const [first] = listed.body.data.matches;
    expect(first.name).toBe('close');
    expect(first.command).toBe(
      `astryx experimental icon add XIcon --from ${from} --set brand --default --definition close`,
    );
    // The printed command runs.
    const args = first.command.split(' ').slice(1);
    const ran = await json(args);
    expect(ran.code, JSON.stringify(ran.body)).toBe(0);
    expect(dataOf('brand').map).toMatchObject({close: 'x'});
  });
});

describe('a new definition named in kebab-case', () => {
  it('is the camelCase definition, from add and from new-definition', async () => {
    writeVectorLibrary(GLYPHS);
    await json(['experimental', 'icon', 'new-set', 'brand']);
    const added = await json([
      'experimental',
      'icon',
      'add',
      'HeartFilled24WGHT500Icon',
      '--from',
      '@acme/vector-icons',
      '--new-definition',
      'ai-helper',
      '--description',
      'The AI helper.',
      '--words',
      'assistant,ai',
    ]);
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(dataOf('brand').map).toMatchObject({aiHelper: 'heart'});
    expect(
      fs.existsSync(
        path.join(pkg, 'icon-sets', 'brand', 'definitions', 'aiHelper.doc.mjs'),
      ),
    ).toBe(true);
    const made = await json([
      'experimental',
      'icon',
      'new-definition',
      'company-logo',
      '--description',
      'The company logo.',
      '--words',
      'logo,brand',
    ]);
    expect(made.code, JSON.stringify(made.body)).toBe(0);
    expect(
      fs.existsSync(
        path.join(
          pkg,
          'icon-sets',
          'brand',
          'definitions',
          'companyLogo.doc.mjs',
        ),
      ),
    ).toBe(true);
  });

  it('is what an unknown --definition suggests, and the suggestion runs', async () => {
    writeVectorLibrary(GLYPHS);
    await json(['experimental', 'icon', 'new-set', 'brand']);
    const base = [
      'experimental',
      'icon',
      'add',
      'StarOutline24WGHT400Icon',
      '--from',
      '@acme/vector-icons',
    ];
    const refused = await json([...base, '--definition', 'brand-mark']);
    expect(refused.code).not.toBe(0);
    const suggestion = refused.body.suggestions.find(
      (/** @type {{name: string}} */ each) =>
        each.name.startsWith('--new-definition'),
    );
    expect(suggestion.name).toMatch(/^--new-definition brandMark /u);
    const ran = await json([
      ...base,
      '--new-definition',
      'brandMark',
      '--description',
      'The brand mark.',
      '--words',
      'brand',
    ]);
    expect(ran.code, JSON.stringify(ran.body)).toBe(0);
  });
});

describe('new-set without --from over an existing set', () => {
  it('declares a variant in place, so add can give icons that look', async () => {
    writeVectorLibrary(GLYPHS);
    await json(NEW_SET);
    const before = generatedOf('brand');
    const refused = await json([
      'experimental',
      'icon',
      'add',
      'StarFilled24WGHT400Icon',
      '--from',
      '@acme/vector-icons',
      '--id',
      'star',
      '--variant',
      'filled',
    ]);
    expect(refused.code).not.toBe(0);
    expect(refused.body.error).toBe(
      'Icon set "brand" declares no variant "filled". Declare it first.',
    );
    expect(refused.body.suggestions[0].name).toBe(
      'astryx experimental icon new-set brand --variants outline,filled --default-variant outline',
    );
    const declared = await json([
      'experimental',
      'icon',
      'new-set',
      'brand',
      '--variants',
      'outline,filled',
      '--description',
      'Brand icons, every glyph.',
    ]);
    expect(declared.code, JSON.stringify(declared.body)).toBe(0);
    expect(dataOf('brand')).toMatchObject({
      variants: ['outline', 'filled'],
      default: {variant: 'outline'},
    });
    expect(generatedOf('brand')).toBe(before);
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'brand', 'brand.doc.mjs'),
        'utf-8',
      ),
    ).toContain("description: 'Brand icons, every glyph.',");
    const added = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'filled',
      '--from',
      '@acme/vector-icons',
      '--all',
    ]);
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(generatedOf('brand')).toContain(
      "export {StarFilled24WGHT400Icon as StarFilledIcon} from '@acme/vector-icons';",
    );
    // A variant an icon has stays declared.
    const dropping = await json([
      'experimental',
      'icon',
      'new-set',
      'brand',
      '--variants',
      'outline,bold',
    ]);
    expect(dropping.code).not.toBe(0);
    expect(dropping.body.error).toMatch(
      /^These icons still have a variant --variants leaves out: arrow-down \(filled\)/u,
    );
  });

  it('still refuses to overwrite a set when nothing is asked of it', async () => {
    writeVectorLibrary(GLYPHS);
    await json(NEW_SET);
    const again = await json(['experimental', 'icon', 'new-set', 'brand']);
    expect(again.code).not.toBe(0);
    expect(again.body.error).toMatch(/^Refusing to overwrite existing file/u);
  });
});

describe('generated files a formatter rewrote', () => {
  it.each([
    [
      'a house style',
      {singleQuote: true, bracketSpacing: false, trailingComma: 'all'},
    ],
    ['Prettier defaults', {}],
    ['no semicolons', {semi: false}],
    [
      'a house style without semicolons',
      {semi: false, singleQuote: true, bracketSpacing: false},
    ],
  ])(
    'pass integration check and take the next command (%s)',
    async (_, options) => {
      const prettier = await import('prettier');
      writeVectorLibrary(GLYPHS);
      await json(NEW_SET);
      await json(['experimental', 'icon', 'map', 'close', 'x']);
      const dir = path.join(pkg, 'icon-sets', 'brand');
      for (const [file, parser] of [
        ['brand.generated.js', 'babel'],
        ['brand.generated.d.ts', 'typescript'],
      ]) {
        const full = path.join(dir, file);
        const formatted = await prettier.format(
          fs.readFileSync(full, 'utf-8'),
          {parser, printWidth: 60, ...options},
        );
        expect(formatted).not.toBe(fs.readFileSync(full, 'utf-8'));
        fs.writeFileSync(full, formatted);
      }
      const check = await runCli(['integration', 'check', '--json'], pkg);
      const codes = JSON.stringify(JSON.parse(check.stdout));
      for (const code of [
        'icon_module_invalid',
        'icon_generated_types_mismatch',
        'icon_theme_map_mismatch',
      ]) {
        expect(codes, code).not.toContain(code);
      }
      // The writer reads the formatted module and writes the next entry.
      const mapped = await json([
        'experimental',
        'icon',
        'map',
        'close',
        'trash',
      ]);
      expect(mapped.code, JSON.stringify(mapped.body)).toBe(0);
      expect(generatedOf('brand')).toContain('close: createElement(TrashIcon');
      const added = await json([
        'experimental',
        'icon',
        'add',
        'HeartFilled24WGHT400Icon',
        '--from',
        '@acme/vector-icons',
        '--definition',
        'warning',
      ]);
      expect(added.code, JSON.stringify(added.body)).toBe(0);
      // React is imported once, and the module reads back as it was written.
      expect(
        generatedOf('brand').match(/import \{\s*createElement\s*\} from/gu),
      ).toHaveLength(1);
      const again = await runCli(['integration', 'check', '--json'], pkg);
      expect(JSON.stringify(JSON.parse(again.stdout))).not.toContain(
        'icon_generated_types_mismatch',
      );
      const remapped = await json([
        'experimental',
        'icon',
        'map',
        'close',
        'x',
      ]);
      expect(remapped.code, JSON.stringify(remapped.body)).toBe(0);
    },
  );

  it('fails a declaration file that no longer matches, without semicolons too', async () => {
    const prettier = await import('prettier');
    writeVectorLibrary(GLYPHS);
    await json(NEW_SET);
    await json(['experimental', 'icon', 'map', 'close', 'x']);
    const types = path.join(pkg, 'icon-sets', 'brand', 'brand.generated.d.ts');
    const formatted = await prettier.format(
      fs
        .readFileSync(types, 'utf-8')
        .replace('readonly close', 'readonly shut'),
      {parser: 'typescript', semi: false},
    );
    fs.writeFileSync(types, formatted);
    const check = await runCli(['integration', 'check', '--json'], pkg);
    expect(JSON.stringify(JSON.parse(check.stdout))).toContain(
      'icon_generated_types_mismatch',
    );
  });
});

describe('themeIcons with a component that writes its own size', () => {
  it('sizes each entry with CSS, which overrides the 24px attributes it writes', async () => {
    writeVectorLibrary(GLYPHS);
    // Like a large vector library: `size` (24) wins over width and height.
    const lib = path.join(pkg, 'node_modules', '@acme', 'vector-icons');
    fs.writeFileSync(
      path.join(lib, 'icons', 'XOutline24WGHT400Icon.js'),
      [
        "import {createElement} from 'react';",
        'export default function X({size = 24, ...rest}) {',
        "  return createElement('svg', {...rest, width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor'});",
        '}',
        '',
      ].join('\n'),
    );
    const require = createRequire(import.meta.url);
    fs.symlinkSync(
      path.dirname(require.resolve('react/package.json')),
      path.join(pkg, 'node_modules', 'react'),
      'dir',
    );
    await json(NEW_SET);
    await json(['experimental', 'icon', 'map', 'close', 'x']);
    const {themeIcons} = await import(
      pathToFileURL(path.join(pkg, 'icon-sets', 'brand', 'brand.generated.js'))
        .href
    );
    const {renderToStaticMarkup} = await import('react-dom/server');
    const html = renderToStaticMarkup(themeIcons.close);
    expect(html).toContain('width="24"');
    expect(html).toContain('style="width:1em;height:1em"');
  });
});

describe('reading a large library', () => {
  it('says so on stderr in text mode, with what it found, and keeps JSON one document', async () => {
    // 170 glyphs, each its own last word (`GlyphAa`, `GlyphAb`, …).
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    writeVectorLibrary(
      Array.from(
        {length: 170},
        (_, index) =>
          `Glyph${letters[Math.floor(index / 26)].toUpperCase()}${letters[index % 26]}`,
      ),
    );
    const text = await runCli([...NEW_SET, '--dry-run'], pkg);
    expect(text.code).toBe(0);
    expect(text.stderr).toContain(
      'Reading 1021 exports of @acme/vector-icons...',
    );
    expect(text.stderr).toContain(
      'Found 170 icons in @acme/vector-icons, drawn by 1020 exports in their looks.',
    );
    const asJson = await runCli([...NEW_SET, '--dry-run', '--json'], pkg);
    expect(asJson.stderr).not.toContain('Reading');
    expect(JSON.parse(asJson.stdout).data.icons).toBe(170);
  });
});

describe('reading a large library again', () => {
  /** 170 glyphs in every look: 1,021 exports. */
  const manyGlyphs = () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from(
      {length: 170},
      (_, index) =>
        `Glyph${letters[Math.floor(index / 26)].toUpperCase()}${letters[index % 26]}`,
    );
  };

  it('reports progress on a refresh, on an add listing, and names the module as given on add --all', async () => {
    writeVectorLibrary(manyGlyphs());
    await json([...NEW_SET, '--variants', 'outline,filled']);
    const refresh = await runCli([...NEW_SET, '--dry-run'], pkg);
    expect(refresh.code, refresh.stdout).toBe(0);
    expect(refresh.stderr).toContain(
      'Reading 1021 exports of @acme/vector-icons...',
    );
    expect(refresh.stderr).toContain(
      'Found 1020 exports in @acme/vector-icons.',
    );
    const listing = await runCli(
      [
        'experimental',
        'icon',
        'add',
        'GlyphAaOutline24WGHT400Icon',
        '--from',
        '@acme/vector-icons',
      ],
      pkg,
    );
    expect(listing.code, listing.stdout).toBe(0);
    expect(listing.stderr).toContain(
      'Reading 1021 exports of @acme/vector-icons...',
    );
    const all = await runCli(
      [
        'experimental',
        'icon',
        'add',
        '--variant',
        'filled',
        '--from',
        '@acme/vector-icons',
        '--all',
      ],
      pkg,
    );
    expect(all.code, all.stdout).toBe(0);
    expect(all.stderr).toContain(
      'Reading 1021 exports of @acme/vector-icons...',
    );
    expect(all.stderr).not.toContain('index.js');
  });
});

describe('the default variant over an existing set', () => {
  it('stays when --variants adds a variant in place without --default-variant', async () => {
    writeVectorLibrary(GLYPHS);
    await json([
      ...NEW_SET,
      '--variants',
      'outline,filled',
      '--default-variant',
      'filled',
    ]);
    const updated = await json([
      'experimental',
      'icon',
      'new-set',
      'brand',
      '--variants',
      'outline,filled,bold',
    ]);
    expect(updated.code, JSON.stringify(updated.body)).toBe(0);
    // The next command it prints names the set, so it runs in a package of
    // several sets too.
    expect(updated.body.data.notes.join(' ')).toContain(
      '`astryx experimental icon add --variant bold --from <module> --all --set brand`',
    );
    expect(dataOf('brand')).toMatchObject({
      variants: ['outline', 'filled', 'bold'],
      default: {variant: 'filled'},
    });
    // A refresh with --variants keeps it too.
    const refreshed = await json([
      ...NEW_SET,
      '--variants',
      'outline,filled,bold',
    ]);
    expect(refreshed.code, JSON.stringify(refreshed.body)).toBe(0);
    expect(dataOf('brand').default).toEqual({variant: 'filled'});
  });

  it('moves in place only on a set with no icons; a set with icons names the refresh that moves it', async () => {
    writeVectorLibrary(GLYPHS);
    await json([
      ...NEW_SET,
      '--variants',
      'outline,filled',
      '--default-variant',
      'filled',
    ]);
    const before = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'brand', 'brand.icons.json'),
      'utf-8',
    );
    const move = [
      'experimental',
      'icon',
      'new-set',
      'brand',
      '--variants',
      'outline,filled',
      '--default-variant',
      'outline',
    ];
    const refused = await json(move);
    expect(refused.code).not.toBe(0);
    expect(refused.body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(refused.body.error).toContain(
      'each of its 6 icons still draws "filled"',
    );
    const refresh = refused.body.suggestions[0].name;
    expect(refresh).toBe(
      'astryx experimental icon new-set brand --from @acme/vector-icons --variants outline,filled --default-variant outline',
    );
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'brand', 'brand.icons.json'),
        'utf-8',
      ),
    ).toBe(before);
    expect(generatedOf('brand')).toContain(
      "export {XFilled24WGHT400Icon as XIcon} from '@acme/vector-icons';",
    );
    const refreshed = await json(refresh.split(' ').slice(1));
    expect(refreshed.code, JSON.stringify(refreshed.body)).toBe(0);
    expect(dataOf('brand').default).toEqual({variant: 'outline'});
    expect(generatedOf('brand')).toContain(
      "export {XOutline24WGHT400Icon as XIcon} from '@acme/vector-icons';",
    );

    await json([
      'experimental',
      'icon',
      'new-set',
      'empty',
      '--variants',
      'outline,filled',
    ]);
    const emptyMoved = await json([
      'experimental',
      'icon',
      'new-set',
      'empty',
      '--variants',
      'outline,filled',
      '--default-variant',
      'filled',
    ]);
    expect(emptyMoved.code, JSON.stringify(emptyMoved.body)).toBe(0);
    expect(dataOf('empty').default).toEqual({variant: 'filled'});
  });

  it('heads an in-place update "Icon set updated", and its plan "Icon set update plan"', async () => {
    writeVectorLibrary(GLYPHS);
    await json([...NEW_SET, '--variants', 'outline,filled']);
    const declare = [
      'experimental',
      'icon',
      'new-set',
      'brand',
      '--variants',
      'outline,filled,bold',
    ];
    const plan = await runCli([...declare, '--dry-run'], pkg);
    expect(plan.code, plan.stdout).toBe(0);
    expect(plan.stdout).toContain('Icon set update plan');
    expect(plan.stdout).not.toContain('New icon set');
    const updated = await runCli(declare, pkg);
    expect(updated.code, updated.stdout).toBe(0);
    expect(updated.stdout).toContain('Icon set updated');
    expect(updated.stdout).not.toContain('New icon set');
    const again = await json(declare);
    expect(again.body.data.updated).toBe(true);
    const unchanged = await runCli(declare, pkg);
    expect(unchanged.stdout).toContain('Icon set unchanged');
  });

  it('is named in the command add prints to declare a variant, so it runs as printed', async () => {
    writeVectorLibrary(GLYPHS);
    await json([
      ...NEW_SET,
      '--variants',
      'filled',
      '--default-variant',
      'filled',
    ]);
    const declare =
      'astryx experimental icon new-set brand --variants filled,outline --default-variant filled';
    const one = await json([
      'experimental',
      'icon',
      'add',
      'StarOutline24WGHT400Icon',
      '--from',
      '@acme/vector-icons',
      '--id',
      'star',
      '--variant',
      'outline',
    ]);
    expect(one.code).not.toBe(0);
    expect(one.body.suggestions[0].name).toBe(declare);
    const all = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'outline',
      '--from',
      '@acme/vector-icons',
      '--all',
    ]);
    expect(all.code).not.toBe(0);
    expect(all.body.suggestions[0].name).toBe(declare);
    const ran = await json(declare.split(' ').slice(1));
    expect(ran.code, JSON.stringify(ran.body)).toBe(0);
    expect(dataOf('brand').default).toEqual({variant: 'filled'});
  });
});

describe('add <Export> for a glyph the set already wraps in another look', () => {
  it('lists commands that run as printed: a definition under the look-kept name, or a variant of the glyph', async () => {
    writeVectorLibrary(GLYPHS);
    await json([...NEW_SET, '--variants', 'outline,filled']);
    expect(generatedOf('brand')).toContain(
      "export {XOutline24WGHT400Icon as XIcon} from '@acme/vector-icons';",
    );
    const base = [
      'experimental',
      'icon',
      'add',
      'XFilled24WGHT500Icon',
      '--from',
      '@acme/vector-icons',
    ];
    const listed = await json(base);
    expect(listed.code, JSON.stringify(listed.body)).toBe(0);
    expect(listed.body.data.variant).toBe(
      'astryx experimental icon add XFilled24WGHT500Icon --from @acme/vector-icons --set brand --id x --variant filled',
    );
    const close = listed.body.data.matches.find(
      (/** @type {{name: string}} */ each) => each.name === 'close',
    );
    expect(close.command).toBe(
      'astryx experimental icon add XFilled24WGHT500Icon --from @acme/vector-icons --set brand --definition close',
    );
    const text = await runCli(base, pkg);
    expect(text.stdout).toContain('Add this one as its variant');
    const asDefinition = await json(close.command.split(' ').slice(1));
    expect(asDefinition.code, JSON.stringify(asDefinition.body)).toBe(0);
    expect(asDefinition.body.data.icon.export).toBe('XFilled24WGHT500Icon');
    const asVariant = await json(listed.body.data.variant.split(' ').slice(1));
    expect(asVariant.code, JSON.stringify(asVariant.body)).toBe(0);
    expect(generatedOf('brand')).toContain(
      "export {XFilled24WGHT500Icon as XFilledIcon} from '@acme/vector-icons';",
    );
  });

  it('lists a variant command only for a declared look other than the default, and every listed command runs as printed', async () => {
    writeVectorLibrary(GLYPHS);
    await json([...NEW_SET, '--variants', 'outline,filled']);
    expect(dataOf('brand').default).toEqual({variant: 'outline'});
    const snapshot = path.join(tmp, 'snapshot');
    fs.cpSync(pkg, snapshot, {recursive: true});
    const restore = () => {
      fs.rmSync(pkg, {recursive: true, force: true});
      fs.cpSync(snapshot, pkg, {recursive: true});
    };
    /** @param {string} exportName */
    const listedCommands = async exportName => {
      const listed = await json([
        'experimental',
        'icon',
        'add',
        exportName,
        '--from',
        '@acme/vector-icons',
      ]);
      expect(listed.code, JSON.stringify(listed.body)).toBe(0);
      const {data} = listed.body;
      return {
        variant: data.variant ?? null,
        commands: [
          ...data.matches.map(
            (/** @type {{command: string}} */ m) => m.command,
          ),
          ...(data.newDefinition ? [data.newDefinition] : []),
          ...(data.variant ? [data.variant] : []),
        ].filter(command => !command.includes('<')),
      };
    };
    // Same style as the wrapped export, another weight: the weight word is
    // no declared variant, so no variant command is listed.
    const sameStyle = await listedCommands('XOutline24WGHT500Icon');
    expect(sameStyle.variant).toBeNull();
    // Another style: the style word is a declared variant, not the default.
    const otherStyle = await listedCommands('XFilled24WGHT500Icon');
    expect(otherStyle.variant).toBe(
      'astryx experimental icon add XFilled24WGHT500Icon --from @acme/vector-icons --set brand --id x --variant filled',
    );
    for (const command of [...sameStyle.commands, ...otherStyle.commands]) {
      restore();
      const ran = await json(command.split(' ').slice(1));
      expect(ran.code, `${command}\n${JSON.stringify(ran.body)}`).toBe(0);
    }
    expect(sameStyle.commands.length).toBeGreaterThan(0);
  });

  it('names the export from --id', async () => {
    writeVectorLibrary(GLYPHS);
    await json(NEW_SET);
    const added = await json([
      'experimental',
      'icon',
      'add',
      'XFilled24WGHT500Icon',
      '--from',
      '@acme/vector-icons',
      '--id',
      'x-filled',
      '--definition',
      'close',
    ]);
    expect(added.code, JSON.stringify(added.body)).toBe(0);
    expect(added.body.data.icon).toMatchObject({
      id: 'x-filled',
      export: 'XFilledIcon',
    });
    expect(generatedOf('brand')).toContain(
      "export {XFilled24WGHT500Icon as XFilledIcon} from '@acme/vector-icons';",
    );
  });
});

describe('progress lines', () => {
  it('reach stderr through the CLI’s text-mode output only', async () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    writeVectorLibrary(
      Array.from(
        {length: 170},
        (_, index) =>
          `Glyph${letters[Math.floor(index / 26)].toUpperCase()}${letters[index % 26]}`,
      ),
    );
    await json(NEW_SET);
    const listing = [
      'experimental',
      'icon',
      'add',
      'GlyphAaOutline24WGHT400Icon',
      '--from',
      '@acme/vector-icons',
    ];
    const text = await runCli(listing, pkg);
    expect(text.stderr).toContain('Reading 1021 exports');
    const asJson = await runCli([...listing, '--json'], pkg);
    expect(asJson.stderr).not.toContain('Reading');
    JSON.parse(asJson.stdout);
    // The command writes no chatter of its own: the logger is the one path.
    const source = fs.readFileSync(
      new URL('./experimental/icon.mjs', import.meta.url),
      'utf-8',
    );
    expect(source).not.toMatch(/console\.(?:error|warn|log)/u);
  });
});

describe('a refresh to a default the library names no look by', () => {
  it('refuses, writes nothing, and names the look words it found', async () => {
    writeVectorLibrary(GLYPHS);
    await json([
      ...NEW_SET,
      '--variants',
      'filled,outline',
      '--default-variant',
      'filled',
    ]);
    const dir = path.join(pkg, 'icon-sets', 'brand');
    const snapshot = () =>
      Object.fromEntries(
        fs
          .readdirSync(dir)
          .sort()
          .map(file => [file, fs.readFileSync(path.join(dir, file), 'utf-8')]),
      );
    const before = snapshot();
    const refused = await json([
      ...NEW_SET,
      '--variants',
      'solid,outline',
      '--default-variant',
      'solid',
    ]);
    expect(refused.code).not.toBe(0);
    expect(refused.body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(refused.body.error).toContain('"solid"');
    expect(refused.body.error).toContain('filled or outline');
    expect(
      refused.body.suggestions.map((/** @type {any} */ each) => each.name),
    ).toEqual(['--default-variant filled', '--default-variant outline']);
    expect(snapshot()).toEqual(before);
    expect(generatedOf('brand')).toContain(
      "export {XFilled24WGHT400Icon as XIcon} from '@acme/vector-icons';",
    );
  });
});

describe('--variants over a set with icons and no declared default', () => {
  it('takes the look the icons draw as the default, so add gives no second export of it', async () => {
    writeVectorLibrary(GLYPHS);
    await json(NEW_SET);
    expect(generatedOf('brand')).toContain(
      "export {XOutline24WGHT400Icon as XIcon} from '@acme/vector-icons';",
    );
    const declared = await json([
      'experimental',
      'icon',
      'new-set',
      'brand',
      '--variants',
      'filled,outline',
    ]);
    expect(declared.code, JSON.stringify(declared.body)).toBe(0);
    expect(dataOf('brand')).toMatchObject({
      variants: ['filled', 'outline'],
      default: {variant: 'outline'},
    });
    await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'outline',
      '--from',
      '@acme/vector-icons',
      '--all',
    ]);
    const generated = generatedOf('brand');
    expect(generated.match(/XOutline24WGHT400Icon/gu)).toHaveLength(1);
    expect(generated).not.toContain('XOutlineIcon');
    expect(dataOf('brand').default).toEqual({variant: 'outline'});
  });

  it('refuses a --default-variant other than the look the icons draw', async () => {
    writeVectorLibrary(GLYPHS);
    await json(NEW_SET);
    const before = fs.readFileSync(
      path.join(pkg, 'icon-sets', 'brand', 'brand.icons.json'),
      'utf-8',
    );
    const refused = await json([
      'experimental',
      'icon',
      'new-set',
      'brand',
      '--variants',
      'filled,outline',
      '--default-variant',
      'filled',
    ]);
    expect(refused.code).not.toBe(0);
    expect(refused.body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(refused.body.error).toContain('still draws "outline"');
    expect(
      fs.readFileSync(
        path.join(pkg, 'icon-sets', 'brand', 'brand.icons.json'),
        'utf-8',
      ),
    ).toBe(before);
  });
});

describe('progress through the logger', () => {
  const manyGlyphs = () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from(
      {length: 170},
      (_, index) =>
        `Glyph${letters[Math.floor(index / 26)].toUpperCase()}${letters[index % 26]}`,
    );
  };

  /** @param {() => Promise<unknown>} fn */
  async function stderrOf(fn) {
    /** @type {string[]} */
    const lines = [];
    const original = console.error;
    console.error = (/** @type {unknown[]} */ ...args) => {
      lines.push(args.join(' '));
    };
    try {
      await fn();
    } finally {
      console.error = original;
    }
    return lines;
  }

  it('reaches stderr from a direct API call once the logger is on, and stays quiet while it is silent', async () => {
    writeVectorLibrary(manyGlyphs());
    const {iconNewSet} = await import('../../../api/icon/new-set/new-set.mjs');
    const {logger} = await import('../../../api/logger.mjs');
    const call = () =>
      iconNewSet('brand', {
        cwd: pkg,
        from: '@acme/vector-icons',
        dryRun: true,
      });
    try {
      logger.setSilent(true);
      expect(await stderrOf(call)).toEqual([]);
      logger.setSilent(false);
      const heard = await stderrOf(call);
      expect(heard).toContain('Reading 1021 exports of @acme/vector-icons...');
    } finally {
      logger.setSilent(true);
    }
  });

  it('is no option of the API calls', async () => {
    writeVectorLibrary(GLYPHS);
    const {iconNewSet} = await import('../../../api/icon/new-set/new-set.mjs');
    await expect(
      iconNewSet('brand', {
        cwd: pkg,
        from: '@acme/vector-icons',
        dryRun: true,
        // @ts-expect-error the option is gone
        progress: () => {},
      }),
    ).rejects.toThrow('Option "progress" does not apply');
  });
});

describe('the default variant on every path', () => {
  const PLAIN = '@acme/plain-icons';
  const PLAIN_SOLID = '@acme/plain-icons/solid';

  /**
   * Write `@acme/plain-icons`, whose export names name no looks: its root
   * module draws each glyph in outline, and `/solid` draws the same names
   * solid.
   * @param {string[]} glyphs
   */
  function writePlainLibrary(glyphs) {
    const lib = path.join(pkg, 'node_modules', '@acme', 'plain-icons');
    fs.mkdirSync(path.join(lib, 'solid'), {recursive: true});
    fs.writeFileSync(
      path.join(lib, 'package.json'),
      JSON.stringify({
        name: PLAIN,
        version: '1.0.0',
        type: 'module',
        exports: {'.': './index.js', './solid': './solid/index.js'},
      }),
    );
    const source = glyphs
      .map(glyph => `export function ${glyph}Icon(props) { return null; }\n`)
      .join('');
    fs.writeFileSync(path.join(lib, 'index.js'), source);
    fs.writeFileSync(path.join(lib, 'solid', 'index.js'), source);
    const manifest = path.join(pkg, 'package.json');
    const data = JSON.parse(fs.readFileSync(manifest, 'utf-8'));
    data.dependencies[PLAIN] = '^1.0.0';
    fs.writeFileSync(manifest, `${JSON.stringify(data, null, 2)}\n`);
  }

  /**
   * @typedef {object} Library
   * @property {string} module the module a set wraps
   * @property {() => void} write
   * @property {(look: string) => string} moduleOf the module that draws a look
   * @property {(glyph: string, look: string) => string} exportOf the
   *   export that draws a glyph in a look
   * @property {(source: string, module: string) => string | null} lookOf the
   *   look a library export draws
   * @property {(glyph: string, look: string) => boolean} glyphHas
   * @property {{drawn: string, other: string}} usual the look a set wraps
   *   without a default, and another
   * @property {{drawn: string, other: string}} declared the default a set
   *   declares, and another
   */

  /** @param {string} word */
  const capital = word => word[0].toUpperCase() + word.slice(1);

  /** @type {Record<string, Library>} */
  const LIBRARIES = {
    'looks in names': {
      module: '@acme/vector-icons',
      write: () => writeVectorLibrary(GLYPHS),
      moduleOf: () => '@acme/vector-icons',
      exportOf: (glyph, look) => `${glyph}${capital(look)}24WGHT400Icon`,
      lookOf: source =>
        /Filled/u.test(source)
          ? 'filled'
          : /Outline/u.test(source)
            ? 'outline'
            : null,
      glyphHas: (glyph, look) => glyph !== 'heart' || look === 'filled',
      usual: {drawn: 'outline', other: 'filled'},
      declared: {drawn: 'filled', other: 'outline'},
    },
    'no looks in names': {
      module: PLAIN,
      write: () => writePlainLibrary(GLYPHS),
      moduleOf: look => (look === 'solid' ? PLAIN_SOLID : PLAIN),
      exportOf: glyph => `${glyph}Icon`,
      lookOf: (_source, module) =>
        module === PLAIN_SOLID ? 'solid' : module === PLAIN ? 'outline' : null,
      glyphHas: () => true,
      usual: {drawn: 'outline', other: 'solid'},
      declared: {drawn: 'outline', other: 'solid'},
    },
  };

  /**
   * Every file of the package but its libraries, for a byte-for-byte
   * comparison.
   * @param {string} dir
   * @returns {Record<string, string>}
   */
  function snapshot(dir = pkg) {
    /** @type {Record<string, string>} */
    const files = {};
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) Object.assign(files, snapshot(full));
      else files[path.relative(pkg, full)] = fs.readFileSync(full, 'utf-8');
    }
    return files;
  }

  /**
   * The set as written: each icon's own export draws the default variant
   * (where the library draws the glyph in it), each variant draws its own
   * look and never the icon's, and no library export is exported twice.
   * A default the author named for a library whose names name no looks is
   * the author's word: the command can't read what its icons draw, so only
   * the variants are checked.
   * @param {Library} lib
   * @param {string | null} expected the default variant the set must record
   * @param {{authored?: boolean}} [options]
   */
  function expectEveryIconDrawsDefault(lib, expected, options = {}) {
    const data = dataOf('brand');
    expect(data.default?.variant ?? null).toBe(expected);
    /** @type {Map<string, {source: string, module: string}>} */
    const originOf = new Map();
    /** @type {string[]} */
    const origins = [];
    for (const [, source, name, module] of generatedOf('brand').matchAll(
      /export \{(\w+)(?: as (\w+))?\} from '([^']+)';/gu,
    )) {
      if (!module.startsWith('@acme/')) continue;
      originOf.set(name ?? source, {source, module});
      origins.push(`${module} ${source}`);
    }
    expect(origins.length, 'no library export is exported twice').toBe(
      new Set(origins).size,
    );
    /** @param {string} name */
    const lookOfExport = name => {
      const origin = originOf.get(name);
      return origin ? lib.lookOf(origin.source, origin.module) : null;
    };
    for (const icon of data.icons) {
      const own = lookOfExport(icon.export);
      if (
        expected != null &&
        !options.authored &&
        lib.glyphHas(icon.id, expected)
      ) {
        expect(own, `${icon.id} draws the default`).toBe(expected);
      }
      for (const variant of icon.variants ?? []) {
        const drawn = lookOfExport(variant.export);
        expect(drawn, `${icon.id} ${variant.variant}`).toBe(variant.variant);
        expect(drawn, `${icon.id} ${variant.variant} is another look`).not.toBe(
          own,
        );
      }
    }
  }

  /** @param {string} command a printed command, `astryx …` */
  async function runPrinted(command) {
    const ran = await json(command.split(' ').slice(1));
    expect(ran.code, `${command}: ${JSON.stringify(ran.body)}`).toBe(0);
    return ran;
  }

  /**
   * The commands a result prints: its suggestions, and each command quoted
   * in its notes.
   * @param {any} body
   * @returns {string[]}
   */
  function printedCommands(body) {
    return [
      ...(body.suggestions ?? []).map((/** @type {any} */ each) => each.name),
      ...(body.data?.notes ?? []).flatMap((/** @type {string} */ note) =>
        [...note.matchAll(/`(astryx [^`]+)`/gu)].map(match => match[1]),
      ),
    ].filter(command => command.startsWith('astryx experimental icon '));
  }

  /**
   * Each printed command names the set it acts on: `new-set brand`, or
   * `--set brand` on a command that takes one.
   * @param {any} body
   */
  function expectEveryCommandNamesTheSet(body) {
    for (const command of printedCommands(body)) {
      if (/^astryx experimental icon new-set /u.test(command)) {
        expect(command).toMatch(
          /^astryx experimental icon new-set brand(?: |$)/u,
        );
      } else {
        expect(command, command).toMatch(/ --set brand(?: |$)/u);
      }
    }
  }

  /**
   * A printed command with its named placeholders filled: the module that
   * draws the look it adds, a look other than the set's default, the look
   * the icons draw, and an icon and definition of the receipt.
   * @param {string} command
   * @param {Library} lib
   * @param {{drawn: string, other: string}} looks
   * @param {any} body
   */
  function filled(command, lib, looks, body) {
    const another =
      dataOf('brand').default?.variant === looks.other
        ? looks.drawn
        : looks.other;
    const withLook = command
      .replaceAll('<look>', another)
      .replaceAll('<name>', another)
      .replaceAll('<default>', looks.drawn);
    const variant = /--variant (\S+)/u.exec(withLook)?.[1] ?? looks.other;
    const pair = body.data?.suggestions?.[0] ?? body.data?.mapped?.[0];
    return withLook
      .replaceAll('<module>', lib.moduleOf(variant))
      .replaceAll('<Export>', lib.exportOf('Search', variant))
      .replaceAll('<icon>', pair?.icon ?? 'search')
      .replaceAll('<definition>', pair?.definition ?? 'search');
  }

  /**
   * Run every command a receipt's notes print, its named placeholders
   * filled.
   * @param {any} body
   * @param {Library} lib
   * @param {{drawn: string, other: string}} looks
   * @param {() => void} check
   */
  async function runPrintedNotes(body, lib, looks, check) {
    const commands = printedCommands({data: body.data});
    for (const command of commands) {
      await runPrinted(filled(command, lib, looks, body));
      check();
    }
  }

  /** @type {Record<string, {declaresDefault: boolean, setup: (lib: Library, looks: {drawn: string, other: string}) => Promise<void>}>} */
  const STATES = {
    'no set': {declaresDefault: false, setup: async () => {}},
    'wrapped with no variants': {
      declaresDefault: false,
      setup: async lib => {
        await json([
          'experimental',
          'icon',
          'new-set',
          'brand',
          '--from',
          lib.module,
        ]);
      },
    },
    'with variants, default declared': {
      declaresDefault: true,
      setup: async (lib, looks) => {
        await json([
          'experimental',
          'icon',
          'new-set',
          'brand',
          '--from',
          lib.module,
          '--variants',
          `${looks.drawn},${looks.other}`,
          '--default-variant',
          looks.drawn,
        ]);
      },
    },
    'with variants, default undeclared': {
      declaresDefault: false,
      setup: async (lib, looks) => {
        await json([
          'experimental',
          'icon',
          'new-set',
          'brand',
          '--from',
          lib.module,
        ]);
        const file = path.join(pkg, 'icon-sets', 'brand', 'brand.icons.json');
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        fs.writeFileSync(
          file,
          `${JSON.stringify({...data, variants: [looks.drawn, looks.other].sort()}, null, 2)}\n`,
        );
      },
    },
  };

  const CHOICES = {
    drawn: 'named default is the drawn look',
    other: 'named default is another existing look',
    unknown: 'named default is an unknown word',
    none: 'no default named',
    drop: 'no default named, --variants leave out the drawn look',
  };

  /**
   * @typedef {{write: string | null, authored?: boolean} | {refuse: 'looks' | 'refresh' | 'drawn' | 'declare' | 'keep' | 'name' | 'own' | 'drop'}} Expected
   * What a path must do: write the set with this default, or refuse naming
   * the look words (`looks`), the refresh (`refresh`), the look already
   * drawn (`drawn`), the declaration to run first (`declare`), the variant
   * to add in place of a moved default (`keep`), the default to name
   * (`name`), the icon's own export (`own`), or the `--variants` that keep
   * the drawn look as the default (`drop`).
   */

  /**
   * The command for a path, and what it must do.
   * @param {string} libName
   * @param {string} route
   * @param {{declaresDefault: boolean}} state
   * @param {{drawn: string, other: string}} looks
   * @param {keyof typeof CHOICES} choice
   * @param {string[]} named `--set brand` when the package has two sets
   * @returns {{args: string[], expect: Expected}}
   */
  function plan(libName, route, state, looks, choice, named) {
    const lib = LIBRARIES[libName];
    const encoded = libName === 'looks in names';
    const word = {drawn: looks.drawn, other: looks.other, unknown: 'solid'}[
      /** @type {'drawn'} */ (choice)
    ];
    const declare = {
      drawn: [
        '--variants',
        `${looks.drawn},${looks.other}`,
        '--default-variant',
        looks.drawn,
      ],
      other: ['--variants', looks.other, '--default-variant', looks.other],
      unknown: [
        '--variants',
        `solid,${looks.drawn}`,
        '--default-variant',
        'solid',
      ],
      none: ['--variants', `${looks.other},${looks.drawn}`],
      drop: ['--variants', looks.other],
    }[choice];
    const newSet = ['experimental', 'icon', 'new-set', 'brand'];
    if (route !== 'add --variant' && route !== 'add --variant --all') {
      const args = [
        ...newSet,
        ...(route === 'in place' ? [] : ['--from', lib.module]),
        ...declare,
      ];
      if (encoded) {
        return {
          args,
          expect:
            choice === 'drop'
              ? {refuse: 'drop'}
              : choice === 'unknown'
                ? {refuse: 'looks'}
                : choice === 'other'
                  ? route === 'in place'
                    ? {refuse: 'refresh'}
                    : {write: looks.other}
                  : {write: looks.drawn},
        };
      }
      // The command can't read the look a module draws: a set that
      // declares its default keeps it, and one that declares none takes
      // the default the command names.
      if (route === 'create --from') {
        return {
          args,
          expect:
            choice === 'drawn'
              ? {write: looks.drawn}
              : {write: looks.other, authored: true},
        };
      }
      return {
        args,
        expect:
          choice === 'drawn'
            ? {write: looks.drawn}
            : choice === 'other'
              ? state.declaresDefault
                ? {refuse: 'keep'}
                : {write: looks.other, authored: true}
              : state.declaresDefault
                ? choice === 'drop'
                  ? {refuse: 'drop'}
                  : {write: looks.drawn}
                : {refuse: 'name'},
      };
    }
    const look = choice === 'unknown' ? looks.drawn : word;
    const module = lib.moduleOf(look);
    const args =
      route === 'add --variant'
        ? [
            'experimental',
            'icon',
            'add',
            lib.exportOf('Star', look),
            '--from',
            module,
            '--id',
            'star',
            '--variant',
            word,
            ...named,
          ]
        : [
            'experimental',
            'icon',
            'add',
            '--variant',
            word,
            '--from',
            module,
            '--all',
            ...named,
          ];
    const declared = dataOf('brand').variants ?? [];
    const kept = dataOf('brand').default?.variant ?? null;
    if (choice === 'unknown') return {args, expect: {refuse: 'looks'}};
    if (choice === 'drawn') {
      return {
        args,
        expect:
          encoded || state.declaresDefault
            ? {refuse: 'drawn'}
            : declared.includes(word)
              ? {refuse: 'own'}
              : {refuse: 'declare'},
      };
    }
    return {
      args,
      expect: declared.includes(word) ? {write: kept} : {refuse: 'declare'},
    };
  }

  const ROUTES = [
    'in place',
    'refresh',
    'add --variant',
    'add --variant --all',
  ];
  // A second set wraps the same library, so a printed command that names
  // no set fails as printed.
  const SETS = ['one set', 'two sets'];
  const CASES = Object.keys(LIBRARIES)
    .flatMap(libName => {
      // A library whose names name no looks has no look words, so no word
      // is unknown to it.
      const choices = Object.keys(CHOICES).filter(
        choice => libName === 'looks in names' || choice !== 'unknown',
      );
      return [
        ...choices.map(choice => ({
          libName,
          route: 'create --from',
          state: 'no set',
          choice,
        })),
        ...ROUTES.flatMap(route =>
          Object.keys(STATES)
            .filter(state => state !== 'no set')
            .flatMap(state =>
              choices
                .filter(
                  choice =>
                    !route.startsWith('add') ||
                    (choice !== 'none' && choice !== 'drop'),
                )
                .map(choice => ({libName, route, state, choice})),
            ),
        ),
      ];
    })
    .flatMap(each => SETS.map(sets => ({...each, sets})))
    .map(each => ({
      ...each,
      title: `${each.libName} · ${each.sets} · ${each.route} · ${each.state} · ${
        each.route.startsWith('add')
          ? CHOICES[/** @type {keyof typeof CHOICES} */ (each.choice)].replace(
              'named default',
              'variant',
            )
          : CHOICES[/** @type {keyof typeof CHOICES} */ (each.choice)]
      }`,
    }));

  it('covers every library, path, set and choice', () => {
    expect(
      CASES.filter(each => each.libName === 'looks in names'),
    ).toHaveLength(2 * 53);
    expect(
      CASES.filter(each => each.libName === 'no looks in names'),
    ).toHaveLength(2 * 40);
  });

  for (const {title, libName, sets, route, state: stateName, choice} of CASES)
    it(title, async () => {
      const lib = LIBRARIES[libName];
      lib.write();
      const two = sets === 'two sets';
      if (two) {
        const spare = await json([
          'experimental',
          'icon',
          'new-set',
          'spare',
          '--from',
          lib.module,
        ]);
        expect(spare.code, JSON.stringify(spare.body)).toBe(0);
      }
      /** @returns {Record<string, string>} */
      const spareFiles = () =>
        Object.fromEntries(
          Object.entries(snapshot()).filter(([file]) =>
            file.startsWith(path.join('icon-sets', 'spare')),
          ),
        );
      const state = STATES[stateName];
      const looks = state.declaresDefault ? lib.declared : lib.usual;
      await state.setup(lib, looks);
      const spareBefore = spareFiles();
      const step = plan(
        libName,
        route,
        state,
        looks,
        /** @type {keyof typeof CHOICES} */ (choice),
        two ? ['--set', 'brand'] : [],
      );
      const before = snapshot();
      const res = await json(step.args);
      expectEveryCommandNamesTheSet(res.body);
      await checkRefusalOrWrite({lib, route, choice, step, looks, res, before});
      expect(spareFiles(), 'every printed command acts on its own set').toEqual(
        spareBefore,
      );
    });

  /**
   * The code each new-set refusal raises, and the words its reference doc
   * lists that refusal by under that code.
   */
  const NEW_SET_REFUSALS = /** @type {const} */ ({
    looks: [
      'ERR_INVALID_ARGUMENT',
      'no look word of a library whose export names encode looks',
    ],
    refresh: ['ERR_INVALID_ARGUMENT', 'without `from`'],
    keep: [
      'ERR_INVALID_ARGUMENT',
      'when the export names of its icons name no looks',
    ],
    drop: ['ERR_INVALID_OPTION', '`variants` leave out the default variant'],
    name: ['ERR_INVALID_OPTION', 'declares no default'],
  });

  /**
   * Check that a path wrote the set it must, or refused as it must, and run
   * the commands it printed.
   * @param {object} args
   * @param {Library} args.lib
   * @param {string} args.route
   * @param {string} args.choice
   * @param {{args: string[], expect: Expected}} args.step
   * @param {{drawn: string, other: string}} args.looks
   * @param {{code: number, body: any}} args.res
   * @param {Record<string, string>} args.before
   */
  async function checkRefusalOrWrite({
    lib,
    route,
    choice,
    step,
    looks,
    res,
    before,
  }) {
    if ('write' in step.expect) {
      const expected = step.expect.write;
      const options = {authored: step.expect.authored};
      expect(res.code, JSON.stringify(res.body)).toBe(0);
      expectEveryIconDrawsDefault(lib, expected, options);
      await runPrintedNotes(res.body, lib, looks, () =>
        expectEveryIconDrawsDefault(lib, expected, options),
      );
      return;
    }
    expect(res.code, JSON.stringify(res.body)).not.toBe(0);
    expect(snapshot()).toEqual(before);
    if (!route.startsWith('add')) {
      const kind = /** @type {keyof typeof NEW_SET_REFUSALS} */ (
        step.expect.refuse
      );
      const [code, phrase] = NEW_SET_REFUSALS[kind];
      expect(res.body.code, JSON.stringify(res.body)).toBe(code);
      const listed = newSetDoc.throws?.find(each => each.code === code);
      expect(listed?.when).toContain(phrase);
    }
    /** @type {string[]} */
    const suggestions = (res.body.suggestions ?? []).map(
      (/** @type {any} */ each) => each.name,
    );
    switch (step.expect.refuse) {
      case 'looks':
        expect(res.body.error).toContain('filled or outline');
        break;
      case 'drawn':
        expect(res.body.error).toContain('already draws');
        break;
      case 'own': {
        if (route === 'add --variant') {
          expect(res.body.error).toContain('own export');
          break;
        }
        // Every icon's own export comes from this module: the variant is
        // the look they draw now, the default the set must declare.
        expect(res.body.error).toBe(
          `"${lib.moduleOf(looks.drawn)}" is the module the ${GLYPHS.length} icons of "brand" come from: its exports are those icons in the look they draw now, so "${looks.drawn}" is that look and can't be a variant of them. "brand" declares no default variant; declare "${looks.drawn}" as the default first.`,
        );
        expect(suggestions).toEqual([
          `astryx experimental icon new-set brand --variants ${looks.drawn},${looks.other} --default-variant ${looks.drawn}`,
        ]);
        await runPrinted(suggestions[0]);
        expectEveryIconDrawsDefault(lib, looks.drawn);
        const again = await json(step.args);
        expect(again.code, JSON.stringify(again.body)).not.toBe(0);
        expect(again.body.error).toContain('already draws');
        break;
      }
      case 'refresh': {
        const refresh = `astryx experimental icon new-set brand --from ${lib.module}`;
        expect(suggestions[0]).toMatch(new RegExp(`^${refresh} `, 'u'));
        await runPrinted(suggestions[0]);
        expectEveryIconDrawsDefault(lib, looks.other);
        break;
      }
      case 'keep': {
        // No run moves the default; each printed command runs, the
        // module placeholder filled with the module that draws the look.
        expect(res.body.error).toContain('export names name no looks');
        expect(suggestions.length).toBeGreaterThan(0);
        for (const command of suggestions) {
          expect(command).not.toMatch(/new-set brand --from /u);
          await runPrinted(
            command.replace('<module>', lib.moduleOf(looks.other)),
          );
        }
        expectEveryIconDrawsDefault(lib, looks.drawn);
        expect(
          dataOf('brand').icons.every((/** @type {any} */ icon) =>
            (icon.variants ?? []).some(
              (/** @type {any} */ each) => each.variant === looks.other,
            ),
          ),
        ).toBe(true);
        break;
      }
      case 'name': {
        if (choice === 'drop') {
          // The command names only the variants it was given: the
          // default it writes is the author's word.
          expect(suggestions).toEqual([
            `astryx experimental icon new-set brand${route === 'refresh' ? ` --from ${lib.module}` : ''} --variants ${looks.other} --default-variant ${looks.other}`,
          ]);
          await runPrinted(suggestions[0]);
          expectEveryIconDrawsDefault(lib, looks.other, {authored: true});
          break;
        }
        const named = suggestions.find(command =>
          command.endsWith(` --default-variant ${looks.drawn}`),
        );
        expect(named, suggestions.join('\n')).toBeDefined();
        await runPrinted(/** @type {string} */ (named));
        expectEveryIconDrawsDefault(lib, looks.drawn);
        break;
      }
      case 'declare': {
        expect(suggestions[0]).toMatch(
          /^astryx experimental icon new-set brand --variants /u,
        );
        // A placeholder is filled with the look the message names: the
        // look the icons draw now.
        await runPrinted(suggestions[0].replaceAll('<default>', looks.drawn));
        const kept = dataOf('brand').default?.variant ?? null;
        expect(kept).toBe(looks.drawn);
        const again = await json(step.args);
        if (choice === 'drawn') {
          expect(again.code, JSON.stringify(again.body)).not.toBe(0);
          expect(again.body.error).toContain('already draws');
          break;
        }
        expect(again.code, JSON.stringify(again.body)).toBe(0);
        expectEveryIconDrawsDefault(lib, kept);
        break;
      }
      case 'drop': {
        // The set keeps the look its icons draw: each printed command
        // runs, the module placeholder filled with the module that draws
        // the other look.
        expect(res.body.error).toContain(`"${looks.drawn}"`);
        expect(suggestions[0]).toMatch(
          new RegExp(
            `^astryx experimental icon new-set brand(?: --from \\S+)? --variants ${looks.drawn},${looks.other}$`,
            'u',
          ),
        );
        for (const command of suggestions) {
          await runPrinted(
            command.replace('<module>', lib.moduleOf(looks.other)),
          );
        }
        expectEveryIconDrawsDefault(lib, looks.drawn);
        break;
      }
    }
  }
});
