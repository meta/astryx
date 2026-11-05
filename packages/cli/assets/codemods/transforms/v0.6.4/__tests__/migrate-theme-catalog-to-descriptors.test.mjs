// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import manifest from '../index.mjs';
import migrate from '../migrate-theme-catalog-to-descriptors.mjs';
import {runCodemods} from '../../../runner.mjs';
import {discoverThemeDirectory} from '../../../../../foundation/discovery/theme-discovery.mjs';

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-catalog-'));
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

/** A catalog entry exactly as `astryx integration add theme <slug>` wrote it in 0.6. */
function entry(slug, overrides = {}) {
  const identifier = slug.replace(/-([a-z0-9])/gu, (_, c) => c.toUpperCase());
  const displayName = slug
    .split('-')
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ');
  return {
    slug,
    displayName,
    description: `${displayName} theme.`,
    maintained: true,
    entry: `${identifier}Theme.ts`,
    exportName: `${identifier}Theme`,
    files: [`${identifier}Theme.ts`],
    ...overrides,
  };
}

/** @param {ReturnType<typeof entry>[]} themes */
function writeKit(themes, {sources = true} = {}) {
  fs.writeFileSync(
    path.join(root, 'package.json'),
    '{"name":"@acme/kit","version":"1.0.0"}\n',
  );
  fs.writeFileSync(
    path.join(root, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  for (const theme of themes) {
    const source = path.join(root, 'themes', theme.slug, theme.entry);
    fs.mkdirSync(path.dirname(source), {recursive: true});
    if (sources) {
      fs.writeFileSync(
        source,
        `import {defineTheme} from '@astryxdesign/core/theme';\n\nexport const ${theme.exportName} = defineTheme({\n  name: '${theme.slug}',\n});\n`,
      );
    }
  }
  fs.mkdirSync(path.join(root, 'themes'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'themes', 'manifest.json'),
    `${JSON.stringify({version: 1, themes}, null, 2)}\n`,
  );
}

const catalog = () => path.join(root, 'themes', 'manifest.json');

/** @param {boolean} apply @param {string} [srcPath] */
const run = (apply, srcPath = root) =>
  runCodemods([{version: 'next', transforms: manifest}], {
    apply,
    path: srcPath,
    codemod: undefined,
    silent: true,
    root,
  });

describe('migrate-theme-catalog-to-descriptors', () => {
  it('is staged for the next release as a project codemod', () => {
    expect(manifest.map(t => [t.name, t.meta.codemodType])).toEqual([
      ['migrate-theme-catalog-to-descriptors', 'project'],
      ['migrate-native-picker-to-presentation', undefined],
    ]);
  });

  it('writes one typed descriptor per catalog theme and removes the catalog', async () => {
    writeKit([
      entry('ocean'),
      entry('deep-sea', {
        displayName: "Deep 'Sea'",
        description: 'Line one\nline two \\ done.',
        maintained: false,
      }),
    ]);

    const result = await run(true);

    expect(result).toMatchObject({errors: [], totalFilesChanged: 3});
    expect(fs.existsSync(catalog())).toBe(false);
    expect(
      fs.readFileSync(
        path.join(root, 'themes/ocean/oceanTheme.doc.mjs'),
        'utf-8',
      ),
    ).toBe(
      "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {\n  type: 'theme',\n  name: 'ocean',\n  displayName: 'Ocean',\n  description: 'Ocean theme.',\n  maintained: true,\n};\n",
    );
    const themes = discoverThemeDirectory(
      path.join(root, 'themes'),
      '@acme/kit',
    );
    expect(
      themes.map(({slug, displayName, description, maintained}) => ({
        slug,
        displayName,
        description,
        maintained,
      })),
    ).toEqual([
      {
        slug: 'deep-sea',
        displayName: "Deep 'Sea'",
        description: 'Line one\nline two \\ done.',
        maintained: false,
      },
      {
        slug: 'ocean',
        displayName: 'Ocean',
        description: 'Ocean theme.',
        maintained: true,
      },
    ]);
  });

  it('previews without writing, even with no source folder', async () => {
    writeKit([entry('ocean')]);
    // A staged code codemod (migrate-native-picker-to-presentation) requires
    // the source folder to exist; an empty one exercises the same preview.
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});

    const result = await run(false, path.join(root, 'src'));

    expect(result).toMatchObject({
      errors: [],
      totalFilesChanged: 2,
      writtenFiles: [],
    });
    expect(fs.existsSync(catalog())).toBe(true);
    expect(
      fs.existsSync(path.join(root, 'themes/ocean/oceanTheme.doc.mjs')),
    ).toBe(false);
  });

  it('keeps a descriptor that already exists and still removes the catalog', async () => {
    writeKit([entry('ocean'), entry('reef')]);
    const kept = path.join(root, 'themes/ocean/oceanTheme.doc.mjs');
    fs.writeFileSync(
      kept,
      "export default {type: 'theme', name: 'ocean', displayName: 'Mine', description: '', maintained: true};\n",
    );

    const result = await run(true);

    expect(result.errors).toEqual([]);
    expect(fs.readFileSync(kept, 'utf-8')).toContain("displayName: 'Mine'");
    expect(
      fs.existsSync(path.join(root, 'themes/reef/reefTheme.doc.mjs')),
    ).toBe(true);
    expect(fs.existsSync(catalog())).toBe(false);
  });

  it('changes nothing and names each entry that cannot convert', async () => {
    writeKit([
      entry('ocean'),
      entry('sea', {exportName: 'oceanBlue'}),
      entry('nested', {
        entry: 'src/nestedTheme.ts',
        files: ['src/nestedTheme.ts'],
      }),
    ]);
    fs.rmSync(path.join(root, 'themes/ocean/oceanTheme.ts'));
    const before = fs.readFileSync(catalog(), 'utf-8');

    const result = await run(true);

    expect(result.errors.map(e => [e.file, e.error])).toEqual([
      ['themes/ocean', 'holds no oceanTheme.ts for theme "ocean".'],
      [
        'themes/manifest.json',
        'theme "sea" exports "oceanBlue" from seaTheme.ts; a descriptor takes the export name from the file name, so rename the export or the file to match.',
      ],
      [
        'themes/manifest.json',
        'theme "nested" has entry "src/nestedTheme.ts"; a descriptor sits beside a .ts, .tsx, .mjs, or .js source directly in themes/nested/.',
      ],
    ]);
    expect(fs.readFileSync(catalog(), 'utf-8')).toBe(before);
    expect(fs.existsSync(path.join(root, 'themes/sea/seaTheme.doc.mjs'))).toBe(
      false,
    );
  });

  it('leaves a package with no catalog to convert alone', async () => {
    const empty = {writes: [], deletes: [], problems: []};
    await expect(migrate(root)).resolves.toEqual(empty);
    fs.writeFileSync(
      path.join(root, 'astryx.integration.mjs'),
      'export default {};\n',
    );
    await expect(migrate(root)).resolves.toEqual(empty);
    fs.writeFileSync(
      path.join(root, 'astryx.integration.mjs'),
      "export default {themes: './themes'};\n",
    );
    fs.mkdirSync(path.join(root, 'themes'));
    await expect(migrate(root)).resolves.toEqual(empty);
  });
});
