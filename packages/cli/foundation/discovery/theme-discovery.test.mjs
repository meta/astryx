// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BUNDLED_THEME_PACKAGE,
  discoverBundledThemes,
  discoverIntegrationThemes,
  discoverThemeDirectory,
} from './theme-discovery.mjs';

let tmpDir;

/** @param {Record<string, unknown>} doc */
function descriptorSource(doc) {
  return `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default ${JSON.stringify(doc, null, 2)};\n`;
}

/**
 * @param {{slug?: string, stem?: string, extension?: string, source?: string,
 *   doc?: Record<string, unknown>, files?: Record<string, string>}} [options]
 */
function writeTheme({
  slug = 'ocean',
  stem = 'oceanTheme',
  extension = '.ts',
  source = `export const ${stem} = {};\n`,
  doc = {},
  files = {},
} = {}) {
  const themeDir = path.join(tmpDir, slug);
  fs.mkdirSync(themeDir, {recursive: true});
  fs.writeFileSync(path.join(themeDir, `${stem}${extension}`), source);
  fs.writeFileSync(
    path.join(themeDir, `${stem}.doc.mjs`),
    descriptorSource({
      type: 'theme',
      name: slug,
      displayName: 'Ocean',
      description: 'Blue and calm.',
      maintained: true,
      ...doc,
    }),
  );
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(themeDir, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, contents);
  }
  return themeDir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-descriptor-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme descriptor discovery', () => {
  it('keeps the released selector package and records the import package', () => {
    const themes = discoverBundledThemes();
    expect(themes.length).toBeGreaterThan(0);
    expect(themes.every(theme => theme.package === BUNDLED_THEME_PACKAGE)).toBe(
      true,
    );
    expect(
      themes.every(
        theme => theme.importPackage === `@astryxdesign/theme-${theme.slug}`,
      ),
    ).toBe(true);
    expect(themes.every(theme => theme.bundled)).toBe(true);
    expect(
      themes.filter(theme => theme.maintained).map(theme => theme.slug),
    ).toEqual(['neutral']);
    expect(themes.every(theme => theme.docPath.endsWith('.doc.mjs'))).toBe(
      true,
    );
  });

  it('derives source entry and runtime export from the shared stem', () => {
    writeTheme();
    expect(discoverThemeDirectory(tmpDir, '@acme/themes')).toEqual([
      expect.objectContaining({
        slug: 'ocean',
        displayName: 'Ocean',
        description: 'Blue and calm.',
        maintained: true,
        entry: 'oceanTheme.ts',
        exportName: 'oceanTheme',
        files: ['oceanTheme.ts', 'oceanTheme.doc.mjs'],
        package: '@acme/themes',
        sourceDir: path.join(tmpDir, 'ocean'),
        docPath: path.join(tmpDir, 'ocean', 'oceanTheme.doc.mjs'),
        bundled: false,
      }),
    ]);
  });

  it('parses source without executing it', async () => {
    writeTheme({
      source:
        "throw new Error('theme source executed');\nexport const oceanTheme = {};\n",
    });
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).resolves.toEqual([
      expect.objectContaining({slug: 'ocean', exportName: 'oceanTheme'}),
    ]);
  });

  it('rejects an untyped descriptor', () => {
    const themeDir = writeTheme();
    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.doc.mjs'),
      "export default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: '', maintained: true};\n",
    );
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /must declare its public ThemeDoc type/u,
    );
  });

  it('rejects a descriptor module with executable statements', () => {
    const themeDir = writeTheme();
    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.doc.mjs'),
      `throw new Error('descriptor executed');\n${descriptorSource({
        type: 'theme',
        name: 'ocean',
        displayName: 'Ocean',
        description: 'Blue and calm.',
        maintained: true,
      })}`,
    );
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /only its static default-exported ThemeDoc object/u,
    );
  });

  it('rejects an entry that does not export its inferred runtime name', async () => {
    writeTheme({source: 'export const anotherTheme = {};\n'});
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).rejects.toThrow(/does not export "oceanTheme"/u);
  });

  it('rejects a type-only export of its inferred runtime name', async () => {
    writeTheme({source: 'export type oceanTheme = {};\n'});
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).rejects.toThrow(/does not export "oceanTheme"/u);
  });

  it('rejects an unbound source-less export specifier', async () => {
    writeTheme({source: 'export {oceanTheme};\n'});
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).rejects.toThrow(
      /could not be parsed: Export 'oceanTheme' is not defined/u,
    );
  });

  it('accepts a source-less export backed by a local runtime declaration', async () => {
    writeTheme({source: 'const oceanTheme = {};\nexport {oceanTheme};\n'});
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).resolves.toHaveLength(1);
  });

  it('follows imported aliases and local re-exports without execution', async () => {
    writeTheme({
      source:
        "import {theme as oceanTheme} from './tokens/theme';\nexport {oceanTheme};\n",
      files: {
        'tokens/theme.ts':
          "throw new Error('nested source executed');\nexport const theme = {};\n",
      },
    });
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).resolves.toEqual([
      expect.objectContaining({
        files: ['oceanTheme.ts', 'oceanTheme.doc.mjs', 'tokens/theme.ts'],
      }),
    ]);
  });

  it('follows a default re-export', async () => {
    writeTheme({
      source: "export {default as oceanTheme} from './theme';\n",
      files: {'theme.ts': 'export default {};\n'},
    });
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).resolves.toHaveLength(1);
  });

  it('follows an export-all barrel', async () => {
    writeTheme({
      source: "export * from './theme';\n",
      files: {'theme.ts': 'export const oceanTheme = {};\n'},
    });
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).resolves.toHaveLength(1);
  });

  it('accepts a runtime binding imported from a package', async () => {
    writeTheme({
      source:
        "import {defineTheme as oceanTheme} from '@astryxdesign/core/theme';\nexport {oceanTheme};\n",
    });
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).resolves.toHaveLength(1);
  });

  it('copies unreferenced nested authoring artifacts as part of the directory', () => {
    writeTheme({
      files: {
        'tokens/ocean.palette.ts': 'export const palette = {};\n',
        'receipts/palette.json': '{"version":1}\n',
      },
    });
    expect(discoverThemeDirectory(tmpDir, '@acme/themes')[0].files).toEqual([
      'oceanTheme.ts',
      'oceanTheme.doc.mjs',
      'receipts/palette.json',
      'tokens/ocean.palette.ts',
    ]);
  });

  it('rejects a theme source that imports its descriptor', async () => {
    writeTheme({
      source:
        "import metadata from './oceanTheme.doc.mjs';\nvoid metadata;\nexport const oceanTheme = {};\n",
    });
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).rejects.toThrow(/must not import its descriptor "oceanTheme\.doc\.mjs"/u);
  });

  it('rejects a local import outside the theme directory', async () => {
    writeTheme({
      source:
        "import {palette} from '../outside';\nexport const oceanTheme = {palette};\n",
    });
    fs.writeFileSync(
      path.join(tmpDir, 'outside.ts'),
      'export const palette = {};\n',
    );
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).rejects.toThrow(/must resolve to a file inside the theme directory/u);
  });

  it('rejects a literal dynamic import outside the theme directory', async () => {
    writeTheme({
      extension: '.mjs',
      source: "void import('../extra.mjs');\nexport const oceanTheme = {};\n",
    });
    fs.writeFileSync(
      path.join(tmpDir, 'extra.mjs'),
      'export const extra = {};\n',
    );
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).rejects.toThrow(/must resolve to a file inside the theme directory/u);
  });

  it('rejects a local re-export outside the theme directory', async () => {
    writeTheme({source: "export * from '../outside';\n"});
    fs.writeFileSync(
      path.join(tmpDir, 'outside.ts'),
      'export const oceanTheme = {};\n',
    );
    await expect(
      discoverIntegrationThemes({name: '@acme/themes', themes: tmpDir}),
    ).rejects.toThrow(/must resolve to a file inside the theme directory/u);
  });

  it('rejects the obsolete central manifest even when descriptors exist', () => {
    writeTheme();
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{"version":1}\n');
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /the theme catalog Astryx 0\.6 wrote.*astryx upgrade --from 0\.6\.3 --path \. --apply/u,
    );
  });

  it('rejects a descriptor placed at the themes root', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'oceanTheme.doc.mjs'),
      descriptorSource({
        type: 'theme',
        name: 'ocean',
        displayName: 'Ocean',
        description: '',
        maintained: true,
      }),
    );
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /must be inside a lower-kebab theme directory/u,
    );
  });

  it('rejects a missing descriptor', () => {
    const dir = path.join(tmpDir, 'ocean');
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, 'oceanTheme.ts'),
      'export const oceanTheme = {};\n',
    );
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      'Theme "ocean" for @acme/themes must contain exactly one same-stem .doc.mjs descriptor; found 0 beside "oceanTheme.ts".',
    );
  });

  it('rejects more than one descriptor', () => {
    const dir = writeTheme();
    fs.writeFileSync(
      path.join(dir, 'other.doc.mjs'),
      descriptorSource({
        type: 'theme',
        name: 'ocean',
        displayName: 'Other',
        description: '',
        maintained: false,
      }),
    );
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      'Theme "ocean" for @acme/themes must contain exactly one same-stem .doc.mjs descriptor; found 2: "oceanTheme.doc.mjs", "other.doc.mjs".',
    );
  });

  it('rejects missing and ambiguous same-stem source files', () => {
    const dir = writeTheme();
    fs.rmSync(path.join(dir, 'oceanTheme.ts'));
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /exactly one same-stem source.*found 0/u,
    );

    fs.writeFileSync(
      path.join(dir, 'oceanTheme.ts'),
      'export const oceanTheme = {};\n',
    );
    fs.writeFileSync(
      path.join(dir, 'oceanTheme.mjs'),
      'export const oceanTheme = {};\n',
    );
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /exactly one same-stem source.*found 2/u,
    );
  });

  it('rejects descriptor identity that differs from its directory', () => {
    writeTheme({doc: {name: 'sea'}});
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      'Theme descriptor oceanTheme.doc.mjs for @acme/themes names "sea" but its directory is "ocean".',
    );
  });

  it('rejects malformed descriptor fields and unknown catalog-era fields', () => {
    writeTheme({doc: {maintained: 'yes'}});
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /maintained/u,
    );

    fs.rmSync(path.join(tmpDir, 'ocean'), {recursive: true});
    writeTheme({doc: {entry: 'oceanTheme.ts'}});
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /unrecognized key|entry/iu,
    );
  });

  it('rejects invalid theme directory and source stem names', () => {
    writeTheme({slug: 'Ocean'});
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /invalid directory/u,
    );

    fs.rmSync(path.join(tmpDir, 'Ocean'), {recursive: true});
    writeTheme({stem: 'ocean-theme'});
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /not a valid runtime export name/u,
    );
  });

  it('rejects symlinks inside the copy boundary', () => {
    const dir = writeTheme();
    const outside = path.join(tmpDir, 'outside.json');
    fs.writeFileSync(outside, '{}\n');
    fs.symlinkSync(outside, path.join(dir, 'outside.json'));
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      'Theme "ocean" for @acme/themes contains symlink "outside.json"; theme files must be regular files inside the theme directory.',
    );
  });
});

const TYPE = "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */";
const BODY =
  "{type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Blue and calm.', maintained: true}";

/** @param {string} source the whole descriptor file */
function writeDescriptor(source) {
  const dir = writeTheme();
  fs.writeFileSync(path.join(dir, 'oceanTheme.doc.mjs'), source);
}

describe('theme descriptor type annotation', () => {
  it.each([
    ['the annotation on the export', `${TYPE}\nexport default ${BODY};\n`],
    [
      'a header comment above the annotation',
      `// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n${TYPE}\nexport default ${BODY};\n`,
    ],
    [
      'a multi-line JSDoc block',
      `/**\n * Ocean.\n *\n * @type {import("@astryxdesign/cli/authoring").ThemeDoc}\n */\nexport default ${BODY};\n`,
    ],
    [
      'a typedef alias',
      `/** @typedef {import('@astryxdesign/cli/authoring').ThemeDoc} ThemeDoc */\n\n/** @type {ThemeDoc} */\nexport default ${BODY};\n`,
    ],
    [
      'a typedef alias declared after the export',
      `/** @type {Doc} */\nexport default ${BODY};\n/** @typedef {import('@astryxdesign/cli/authoring').ThemeDoc} Doc */\n`,
    ],
    [
      'an @import of the type',
      `/** @import {ThemeDoc} from '@astryxdesign/cli/authoring' */\n/** @type {ThemeDoc} */\nexport default ${BODY};\n`,
    ],
    [
      'a renamed @import',
      `/** @import {ComponentDoc, ThemeDoc as Doc} from '@astryxdesign/cli/authoring' */\n/** @type {Doc} */\nexport default ${BODY};\n`,
    ],
    [
      'a namespace @import',
      `/** @import * as authoring from '@astryxdesign/cli/authoring' */\n/** @type {authoring.ThemeDoc} */\nexport default ${BODY};\n`,
    ],
    ['a JSDoc cast of the object', `export default ${TYPE} (${BODY});\n`],
    [
      'a JSDoc cast inside outer parentheses',
      `export default (${TYPE} (${BODY}));\n`,
    ],
    [
      'a @satisfies cast',
      `export default ${TYPE.replace('@type', '@satisfies')} (${BODY});\n`,
    ],
    ...['!T', '?T', 'T=', '(T)', 'T | null', 'undefined | T', 'T & {}'].map(
      form => [
        `the type written {${form}}`,
        `/** @type {${form.replace('T', "import('@astryxdesign/cli/authoring').ThemeDoc")}} */\nexport default ${BODY};\n`,
      ],
    ),
    [
      'an @import with a type modifier',
      `/** @import {type ThemeDoc} from '@astryxdesign/cli/authoring' */\n/** @type {ThemeDoc} */\nexport default ${BODY};\n`,
    ],
    [
      'a chain of typedef aliases',
      `/** @typedef {import('@astryxdesign/cli/authoring').ThemeDoc} A */\n/** @typedef {A} B */\n/** @type {B} */\nexport default ${BODY};\n`,
    ],
  ])('accepts %s', (_, source) => {
    writeDescriptor(source);
    expect(discoverThemeDirectory(tmpDir, '@acme/themes')).toHaveLength(1);
  });

  it.each([
    ['a line comment', `// ${TYPE.slice(4, -3)}\nexport default ${BODY};\n`],
    [
      'a block comment that is not JSDoc',
      `/* ${TYPE.slice(4, -3)} */\nexport default ${BODY};\n`,
    ],
    ['an annotation after the export', `export default ${BODY};\n${TYPE}\n`],
    [
      'an annotation inside a string value',
      `export default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: "${TYPE.slice(4, -3)}", maintained: true};\n`,
    ],
    [
      'an annotation on a property',
      `export default {\n  ${TYPE}\n  type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Blue.', maintained: true};\n`,
    ],
    [
      'an unparenthesized inline annotation',
      `export default ${TYPE} ${BODY};\n`,
    ],
    [
      'an annotation inside the parentheses',
      `export default (${TYPE} ${BODY});\n`,
    ],
    [
      'a later JSDoc between the annotation and the export',
      `${TYPE}\n/** Ocean. */\nexport default ${BODY};\n`,
    ],
    [
      'a typedef written as a line comment',
      `// @typedef {import('@astryxdesign/cli/authoring').ThemeDoc} ThemeDoc\n/** @type {ThemeDoc} */\nexport default ${BODY};\n`,
    ],
    [
      'an alias of another public type',
      `/** @typedef {import('@astryxdesign/cli/authoring').ComponentDoc} ThemeDoc */\n/** @type {ThemeDoc} */\nexport default ${BODY};\n`,
    ],
    [
      'a ThemeDoc from another module',
      `/** @type {import('@astryxdesign/core').ThemeDoc} */\nexport default ${BODY};\n`,
    ],
    [
      'a type in a code span before the real @type {object}',
      `/** Not \`${TYPE.slice(4, -3)}\` here. @type {object} */\nexport default ${BODY};\n`,
    ],
    [
      'a typedef in a code span',
      `/** Declare \`@typedef {import('@astryxdesign/cli/authoring').ThemeDoc} TD\` first. */\n/** @type {TD} */\nexport default ${BODY};\n`,
    ],
    [
      'a type in a code span of a tag',
      `/**\n * @see \` ${TYPE.slice(4, -3)}\` here\n */\nexport default ${BODY};\n`,
    ],
    [
      '@import type {...}, which is not @import syntax',
      `/** @import type {ThemeDoc} from '@astryxdesign/cli/authoring' */\n/** @type {ThemeDoc} */\nexport default ${BODY};\n`,
    ],
    [
      '@satisfies on the export statement',
      `${TYPE.replace('@type', '@satisfies')}\nexport default ${BODY};\n`,
    ],
    [
      'an annotation before default, not before the parenthesis',
      `export ${TYPE} default (${BODY});\n`,
    ],
    [
      'a union with another type',
      `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc | string} */\nexport default ${BODY};\n`,
    ],
  ])('rejects %s', (_, source) => {
    writeDescriptor(source);
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      'Theme descriptor oceanTheme.doc.mjs for @acme/themes must declare its public ThemeDoc type from @astryxdesign/cli/authoring.',
    );
  });
});

describe('theme descriptor values', () => {
  it.each([
    ['displayName', {displayName: '   '}],
    ['name', {name: ' '}],
  ])('rejects a blank %s', (field, doc) => {
    writeTheme({doc});
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      `Theme descriptor oceanTheme.doc.mjs for @acme/themes is invalid: ${field}: ${field} must not be blank`,
    );
  });

  it.each(['', '   '])('accepts a blank description (%j)', description => {
    writeTheme({doc: {description}});
    expect(discoverThemeDirectory(tmpDir, '@acme/themes')[0].description).toBe(
      description,
    );
  });

  it.each(['__proto__', "'__proto__'", 'extra'])(
    'rejects the unknown key %s',
    key => {
      writeDescriptor(
        `${TYPE}\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Blue.', maintained: true, ${key}: 'x'};\n`,
      );
      expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
        `Theme descriptor oceanTheme.doc.mjs for @acme/themes is invalid: (root): Unrecognized key: "${key.replaceAll("'", '')}"`,
      );
    },
  );

  it('rejects a BigInt where a string belongs', () => {
    writeDescriptor(
      `${TYPE}\nexport default {type: 'theme', name: 'ocean', displayName: 10n, description: 'Blue.', maintained: true};\n`,
    );
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      /must use static string and boolean values/u,
    );
  });

  it('reuses a read while the file keeps its size and mtime', () => {
    const dir = writeTheme();
    const file = path.join(dir, 'oceanTheme.doc.mjs');
    const pinned = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(file, pinned, pinned);
    expect(discoverThemeDirectory(tmpDir, '@acme/themes')[0].displayName).toBe(
      'Ocean',
    );

    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf-8').replace('"Ocean"', '"Coral"'),
    );
    fs.utimesSync(file, pinned, pinned);
    expect(discoverThemeDirectory(tmpDir, '@acme/themes')[0].displayName).toBe(
      'Ocean',
    );

    const later = new Date('2020-01-01T00:00:01Z');
    fs.utimesSync(file, later, later);
    expect(discoverThemeDirectory(tmpDir, '@acme/themes')[0].displayName).toBe(
      'Coral',
    );
  });
});

describe('theme folder messages', () => {
  it('names the package and file of a symlinked descriptor', () => {
    const dir = path.join(tmpDir, 'ocean');
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, 'oceanTheme.ts'),
      'export const oceanTheme = {};\n',
    );
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-linked-'));
    try {
      const target = path.join(elsewhere, 'oceanTheme.doc.mjs');
      fs.writeFileSync(target, `${TYPE}\nexport default ${BODY};\n`);
      fs.symlinkSync(target, path.join(dir, 'oceanTheme.doc.mjs'));
      expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
        'Theme "ocean" for @acme/themes contains symlink "oceanTheme.doc.mjs"; theme files must be regular files inside the theme directory.',
      );
    } finally {
      fs.rmSync(elsewhere, {recursive: true, force: true});
    }
  });

  it('names the package and both files of a nested second descriptor', () => {
    writeTheme({
      files: {'extra/otherTheme.doc.mjs': `${TYPE}\nexport default ${BODY};\n`},
    });
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      'Theme "ocean" for @acme/themes contains more than one .doc.mjs descriptor: "oceanTheme.doc.mjs" and "extra/otherTheme.doc.mjs".',
    );
  });
});

const UNPUBLISHED = [
  '.DS_Store',
  '._oceanTheme.ts',
  '.gitignore',
  '.npmignore',
  '.npmrc',
  'oceanTheme.ts.orig',
  'npm-debug.log',
  'palette/.DS_Store',
  'palette/npm-debug.log',
  '.git/HEAD',
  'CVS/Entries',
  'node_modules/dep/index.js',
];

describe('files a theme leaves out', () => {
  it('leaves out dot entries and files npm never publishes, at any depth', () => {
    const dir = writeTheme({files: {'palette/tokens.ts': 'export {};\n'}});
    for (const file of UNPUBLISHED) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
      fs.writeFileSync(path.join(dir, file), 'x\n');
    }
    fs.symlinkSync(path.join(dir, 'palette'), path.join(dir, '.linked'));
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'dep'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'npm-debug.log'), 'x\n');
    expect(discoverThemeDirectory(tmpDir, '@acme/themes')[0].files).toEqual([
      'oceanTheme.ts',
      'oceanTheme.doc.mjs',
      'palette/tokens.ts',
    ]);
  });
});

describe('folders under a theme root that are not themes', () => {
  it('skips dot-folders and folders with neither a descriptor nor a theme source', () => {
    writeTheme();
    const stray = {
      'shared/palette.ts': 'export const blue = "#00f";\n',
      '.cache/state.json': '{}\n',
      '.cache/stateTheme.ts': 'export const stateTheme = {};\n',
      '__tests__/oceanTheme.test.ts': 'export {};\n',
      'Shared_Helpers/colors.ts': 'export const red = "#f00";\n',
    };
    for (const [file, contents] of Object.entries(stray)) {
      fs.mkdirSync(path.dirname(path.join(tmpDir, file)), {recursive: true});
      fs.writeFileSync(path.join(tmpDir, file), contents);
    }
    fs.mkdirSync(path.join(tmpDir, 'empty'));
    fs.symlinkSync(path.join(tmpDir, 'shared'), path.join(tmpDir, '.linked'));
    expect(
      discoverThemeDirectory(tmpDir, '@acme/themes').map(theme => theme.slug),
    ).toEqual(['ocean']);
  });

  it('still fails a folder with a theme source and no descriptor', () => {
    writeTheme();
    fs.mkdirSync(path.join(tmpDir, 'sand'));
    fs.writeFileSync(
      path.join(tmpDir, 'sand', 'sandTheme.ts'),
      'export const sandTheme = {};\n',
    );
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      'Theme "sand" for @acme/themes must contain exactly one same-stem .doc.mjs descriptor; found 0 beside "sandTheme.ts".',
    );
  });

  it('still fails a folder whose descriptor sits in a subfolder', () => {
    writeTheme({slug: 'reef', stem: 'reefTheme', doc: {name: 'reef'}});
    fs.mkdirSync(path.join(tmpDir, 'reef', 'src'));
    for (const file of ['reefTheme.ts', 'reefTheme.doc.mjs']) {
      fs.renameSync(
        path.join(tmpDir, 'reef', file),
        path.join(tmpDir, 'reef', 'src', file),
      );
    }
    expect(() => discoverThemeDirectory(tmpDir, '@acme/themes')).toThrow(
      'Theme "reef" for @acme/themes must contain exactly one same-stem .doc.mjs descriptor; found 0; "src/reefTheme.doc.mjs" is in a subfolder.',
    );
  });
});

describe('bundled theme files', () => {
  it('keeps entry first and includes the descriptor needed by theme eject', () => {
    const themes = discoverBundledThemes();
    expect(themes.find(theme => theme.slug === 'neutral')?.files).toEqual([
      'neutralTheme.ts',
      'neutralTheme.doc.mjs',
      'icons.tsx',
      'neutralPalettes.ts',
      'neutralPalettes.generated.ts',
      'neutralPaletteRefs.generated.ts',
      'neutralPalettes.generated.receipt.json',
      'palette.config.json',
    ]);
    for (const theme of themes) {
      expect(theme.files[0]).toBe(theme.entry);
      expect(theme.files).toContain(path.basename(theme.docPath));
    }
  });

  it('passes the full source check it skips at runtime', () => {
    const bundled = discoverBundledThemes();
    const checked = discoverThemeDirectory(
      path.dirname(bundled[0].sourceDir),
      BUNDLED_THEME_PACKAGE,
    );
    expect(checked.map(theme => theme.slug)).toEqual(
      bundled.map(theme => theme.slug),
    );
  });

  it('loads no parser on import and only the descriptor parser for bundled themes', () => {
    const script = `
      import {createRequire} from 'node:module';
      const cache = createRequire(import.meta.url).cache;
      const loaded = name => Object.keys(cache).some(file => file.includes('/node_modules/' + name + '/'));
      const state = () => ({babel: loaded('@babel/parser'), jscodeshift: loaded('jscodeshift')});
      const discovery = await import(${JSON.stringify(new URL('./theme-discovery.mjs', import.meta.url).href)});
      const imported = state();
      discovery.discoverBundledThemes();
      console.log(JSON.stringify({imported, bundled: state()}));
    `;
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {encoding: 'utf-8'},
    );
    expect(JSON.parse(output)).toEqual({
      imported: {babel: false, jscodeshift: false},
      bundled: {babel: true, jscodeshift: false},
    });
  });
});
