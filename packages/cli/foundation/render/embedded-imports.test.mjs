// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shared import scanner reads a module as its file type writes it:
 * a `.ts` file without JSX (`<T>value` is a type assertion), a `.tsx` file
 * with it. A restore expects back each file a path from the site root names.
 */

import {describe, expect, it} from 'vitest';
import {importSpecifiers, moduleImports, reachableFiles} from './embedded-imports.mjs';

const specifiers = (/** @type {string} */ source, /** @type {string} */ file) =>
  (moduleImports(source, file) ?? []).map(each => each.specifier);

describe('moduleImports', () => {
  it('reads a .ts type assertion as one, so the imports after it are found', () => {
    const source = `const size = <number>16;\nimport {a} from './a';\nexport {b} from './b';\n`;
    expect(specifiers(source, 'icons.ts')).toEqual(['./a', './b']);
    expect(specifiers(source, 'icons.mts')).toEqual(['./a', './b']);
  });

  it('reads JSX in a .tsx file', () => {
    const source = `import {a} from './a';\nexport const icon = <svg width={16} />;\nimport {b} from './b';\n`;
    expect(specifiers(source, 'icons.tsx')).toEqual(['./a', './b']);
  });

  it('marks a type-only import', () => {
    const records = moduleImports(
      `import type {T} from './types';\nimport {a} from './a';\n`,
      'icons.ts',
    );
    expect(records?.map(each => [each.specifier, each.typeOnly])).toEqual([
      ['./types', true],
      ['./a', false],
    ]);
  });
});

describe('importSpecifiers', () => {
  it('reads a template literal with nothing put in it as the string it holds', () => {
    expect(
      importSpecifiers(
        'await import(`../shared.ts`);\nrequire(`./a.css`);\nawait import(`./${x}.ts`);',
        'theme.ts',
      ),
    ).toEqual(['../shared.ts', './a.css']);
  });
});

describe('reachableFiles: paths from the site root', () => {
  /** @param {string} p @param {string} text */
  const file = (p, text = '') => ({path: p, base64: Buffer.from(text).toString('base64')});
  const page = "export default () => <img src=\"/pics/a.png\" alt=\"\" />;\n";

  it('expects the file back under the nearest public/ above the page', () => {
    const {reached, missing} = reachableFiles([file('src/page.tsx', page), file('public/pics/a.png')]);
    expect(reached.has('public/pics/a.png')).toBe(true);
    expect(missing).toEqual([]);
  });

  it('names the file as missing when the tree holds that public/ without it', () => {
    const {missing} = reachableFiles([file('src/page.tsx', page), file('public/pics/b.png')]);
    expect(missing).toEqual(['public/pics/a.png']);
  });

  it('expects nothing when the tree holds no public/, or when the path leaves it', () => {
    expect(reachableFiles([file('src/page.tsx', page)]).missing).toEqual([]);
    const climbs = "export default () => <img src=\"/../x.png\" alt=\"\" />;\n";
    expect(reachableFiles([file('src/page.tsx', climbs), file('public/pics/a.png')]).missing).toEqual([]);
  });
});

describe('reachableFiles: the public/ folder the render read', () => {
  /** @param {string} p @param {string} text */
  const file = (p, text = '') => ({path: p, base64: Buffer.from(text).toString('base64')});
  const tree = [
    file('src/pages/p/page.tsx', 'export default () => <img src="/pics/a.png" alt="" />;\n'),
    file('src/public/other.png'),
    file('public/pics/a.png'),
  ];

  it('expects the file in the public/ the render recorded, not a nearer one', () => {
    expect(reachableFiles(tree, {publicDir: 'public'}).missing).toEqual([]);
  });

  it('falls back to the nearest public/ for a file with no record, or a record that is not a plain tree path', () => {
    expect(reachableFiles(tree).missing).toEqual(['src/public/pics/a.png']);
    for (const publicDir of ['../public', '/public', 'public/../src/public', 'nowhere', 7]) {
      expect(reachableFiles(tree, {publicDir}).missing).toEqual(['src/public/pics/a.png']);
    }
  });
});
