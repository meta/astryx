// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import manifest from '../index.mjs';
import migrate from '../migrate-copied-themes-to-descriptors.mjs';
import {runCodemods} from '../../../runner.mjs';
import {discoverLocalThemes} from '../../../../../foundation/discovery/theme-discovery.mjs';

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-copied-theme-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    '{"name":"app","version":"1.0.0"}\n',
  );
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

/** @param {string} slug */
function writeCopy(slug) {
  const stem = `${slug.replace(/-([a-z0-9])/gu, (_, character) => character.toUpperCase())}Theme`;
  const directory = path.join(root, 'src', 'themes', slug);
  fs.mkdirSync(directory, {recursive: true});
  const source = `export const ${stem} = {name: '${slug}'};\n`;
  fs.writeFileSync(path.join(directory, `${stem}.ts`), source);
  fs.writeFileSync(path.join(directory, 'icons.tsx'), 'export const icons = {};\n');
  return {directory, stem, source};
}

/** @param {boolean} apply */
const run = apply =>
  runCodemods([{version: 'next', transforms: manifest}], {
    apply,
    path: root,
    codemod: undefined,
    silent: true,
    root,
  });

describe('migrate-copied-themes-to-descriptors', () => {
  it('is staged for the next release as a project codemod', () => {
    expect(manifest.map(entry => [entry.name, entry.meta.codemodType])).toEqual([
      ['migrate-copied-themes-to-descriptors', 'project'],
    ]);
  });

  it('writes only the missing descriptor and makes the copy a local theme', async () => {
    const {directory, stem, source} = writeCopy('deep-sea');
    const icons = fs.readFileSync(path.join(directory, 'icons.tsx'), 'utf-8');

    const result = await run(true);

    expect(result).toMatchObject({errors: [], totalFilesChanged: 1});
    expect(fs.readFileSync(path.join(directory, `${stem}.ts`), 'utf-8')).toBe(
      source,
    );
    expect(fs.readFileSync(path.join(directory, 'icons.tsx'), 'utf-8')).toBe(
      icons,
    );
    expect(
      fs.readFileSync(path.join(directory, `${stem}.doc.mjs`), 'utf-8'),
    ).toBe(
      "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {\n  type: 'theme',\n  name: 'deep-sea',\n  displayName: 'Deep Sea',\n  description: 'Deep Sea theme copied into this app.',\n  maintained: false,\n};\n",
    );
    expect(discoverLocalThemes(root).map(theme => theme.slug)).toEqual([
      'deep-sea',
    ]);
  });

  it('leaves non-copies and an already described theme alone', async () => {
    const described = writeCopy('ocean');
    fs.writeFileSync(
      path.join(described.directory, `${described.stem}.doc.mjs`),
      "export default {type: 'theme', name: 'ocean', displayName: 'Mine', description: '', maintained: false};\n",
    );
    fs.mkdirSync(path.join(root, 'src/themes/not-a-theme'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'src/themes/not-a-theme/helper.ts'),
      'export const helper = true;\n',
    );
    fs.mkdirSync(path.join(root, 'src/themes/nested/source'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'src/themes/nested/source/nestedTheme.ts'),
      'export const nestedTheme = {};\n',
    );
    fs.mkdirSync(path.join(root, 'src/themes/ambiguous'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'src/themes/ambiguous/firstTheme.ts'),
      'export const firstTheme = {};\n',
    );
    fs.writeFileSync(
      path.join(root, 'src/themes/ambiguous/secondTheme.ts'),
      'export const secondTheme = {};\n',
    );

    await expect(migrate(root)).resolves.toEqual({
      writes: [],
      deletes: [],
      problems: [],
    });
  });

  it('is a fixed point on the second run', async () => {
    const {directory, stem, source} = writeCopy('ocean');

    const first = await run(true);
    const descriptor = fs.readFileSync(
      path.join(directory, `${stem}.doc.mjs`),
      'utf-8',
    );
    const second = await run(true);

    expect(first).toMatchObject({errors: [], totalFilesChanged: 1});
    expect(second).toMatchObject({errors: [], totalFilesChanged: 0});
    expect(
      fs.readFileSync(path.join(directory, `${stem}.doc.mjs`), 'utf-8'),
    ).toBe(descriptor);
    expect(fs.readFileSync(path.join(directory, `${stem}.ts`), 'utf-8')).toBe(
      source,
    );
  });
});
