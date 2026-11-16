// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A base theme whose font stylesheet ships its own `@font-face`
 * rules is read as one that loads those families in those weights, as a
 * base whose stylesheet asks a font service for them is.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {baseFontsSheet} from './_preview.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-base-fonts-'));
afterAll(() => fs.rmSync(root, {recursive: true, force: true}));

/**
 * A project with a base theme package whose fonts.css is `css`.
 * @param {string} name
 * @param {string} css
 */
function project(name, css) {
  const cwd = path.join(root, name);
  const pkg = path.join(cwd, 'node_modules/@astryxdesign/theme-b');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(path.join(cwd, 'package.json'), '{}');
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({
      name: '@astryxdesign/theme-b',
      exports: {'./fonts.css': './fonts.css'},
    }),
  );
  fs.writeFileSync(path.join(pkg, 'fonts.css'), css);
  return /** @type {any} */ ({project: {cwd}});
}

/** @param {string} family @param {string} weight @param {string} file */
const face = (family, weight, file) =>
  `@font-face {\n  font-family: '${family}';\n  font-display: swap;\n  font-weight: ${weight};\n  src: url('./fonts/${file}') format('woff2');\n}\n`;

describe("a base theme's font stylesheet", () => {
  it('that ships its faces loads their families in their weights, from no remote sheet', () => {
    const ctx = project(
      'shipped',
      face('Figtree', '400', 'a.woff2') +
        face('Figtree', '700', 'b.woff2') +
        face('Figtree', '400', 'c.woff2') +
        face('Fraunces', '100 900', 'd.woff2'),
    );
    const sheet = baseFontsSheet(
      ctx,
      /** @type {any} */ ({like: 'b', name: 't'}),
    );
    expect(sheet?.spec).toBe('@astryxdesign/theme-b/fonts.css');
    expect(sheet?.families).toEqual(['Figtree', 'Fraunces']);
    expect(sheet?.remote).toEqual([]);
    expect(sheet?.weights.get('Figtree')).toEqual([400, 700]);
    // A variable face: every weight, so none is listed.
    expect(sheet?.weights.has('Fraunces')).toBe(false);
  });

  it('that asks a font service reads the same', () => {
    const ctx = project(
      'service',
      "@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;700&display=swap');\n",
    );
    const sheet = baseFontsSheet(
      ctx,
      /** @type {any} */ ({like: 'b', name: 't'}),
    );
    expect(sheet?.families).toEqual(['Figtree']);
    expect(sheet?.remote).toHaveLength(1);
    expect(sheet?.weights.get('Figtree')).toEqual([400, 700]);
  });
});
