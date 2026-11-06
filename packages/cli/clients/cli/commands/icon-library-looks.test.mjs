// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A library that draws each icon in several looks, named in its
 * exports (`XOutline24WGHT400Icon`): one root barrel of default re-exports
 * and a file per export, as large vector libraries ship. `new-set`, `add`
 * and a refresh wrap each glyph once, by its glyph id, in the look the set
 * prefers (AST-084 FR13).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
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
    expect(added.body.data.missing).toEqual([]);
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
      'astryx experimental icon new-set brand --variants <default>,filled',
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
    expect(refresh.stderr).toContain('Found 1020 icons in @acme/vector-icons.');
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
      'astryx experimental icon new-set brand --from <module> --variants outline,filled --default-variant outline',
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
    const refreshed = await json(
      refresh.replace('<module>', '@acme/vector-icons').split(' ').slice(1),
    );
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
      'outline,filled',
      '--default-variant',
      'filled',
    ]);
    const declare =
      'astryx experimental icon new-set brand --variants outline,filled,bold --default-variant filled';
    const one = await json([
      'experimental',
      'icon',
      'add',
      'StarOutline24WGHT300Icon',
      '--from',
      '@acme/vector-icons',
      '--id',
      'star',
      '--variant',
      'bold',
    ]);
    expect(one.code).not.toBe(0);
    expect(one.body.suggestions[0].name).toBe(declare);
    const all = await json([
      'experimental',
      'icon',
      'add',
      '--variant',
      'bold',
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
      'astryx experimental icon add XFilled24WGHT500Icon --from @acme/vector-icons --id x --variant filled',
    );
    const close = listed.body.data.matches.find(
      (/** @type {{name: string}} */ each) => each.name === 'close',
    );
    expect(close.command).toBe(
      'astryx experimental icon add XFilled24WGHT500Icon --from @acme/vector-icons --definition close',
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
      'astryx experimental icon add XFilled24WGHT500Icon --from @acme/vector-icons --id x --variant filled',
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
    expect(refused.body.error).toContain('draw "outline"');
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
