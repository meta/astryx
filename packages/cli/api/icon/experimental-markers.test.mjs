// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every public icon-set export is marked `@experimental` (spec:AST-084
 * FR0): each icon function the API entry exports, each type the icon-set and
 * icon-definition declarations export, and each icon parser the authoring
 * entry exports. A new export fails here until its JSDoc carries the marker.
 *
 * @input the API entry, the authoring entries, and the doc-type declarations
 * @output assertions only
 * @position api/icon — beside the functions it reads
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
/** @param {string} file */
const read = file => fs.readFileSync(path.join(CLI, file), 'utf8');

/**
 * The JSDoc block that ends right before `index` in `text`, or ''.
 * @param {string} text
 * @param {number} index
 */
function docBefore(text, index) {
  const head = text.slice(0, index).trimEnd();
  if (!head.endsWith('*/')) return '';
  return head.slice(head.lastIndexOf('/**'));
}

describe('icon-set exports carry @experimental', () => {
  it('every icon function the API entry exports', () => {
    const entry = read('api/index.mjs');
    const exports = [
      ...entry.matchAll(/^export \{(icon\w*)\} from '(\.\/icon\/[^']+)';/gmu),
    ];
    expect(exports.map(([, name]) => name).sort()).toEqual([
      'icon',
      'iconAdd',
      'iconMap',
      'iconNewDefinition',
      'iconNewSet',
      'iconUse',
    ]);
    for (const [, name, from] of exports) {
      const source = read(path.join('api', from));
      const at = source.search(
        new RegExp(`^export (?:async )?function ${name}\\b`, 'mu'),
      );
      expect(at, `${name} in ${from}`).toBeGreaterThan(0);
      expect(docBefore(source, at), name).toMatch(/@experimental\b/u);
    }
  });

  it.each([
    'authoring/doctypes/icon-set/type.ts',
    'authoring/doctypes/icon-definition/type.ts',
  ])('every type %s exports', file => {
    const source = read(file);
    const found = [...source.matchAll(/^export (?:interface|type) (\w+)/gmu)];
    expect(found.length).toBeGreaterThan(0);
    for (const match of found) {
      expect(
        docBefore(source, /** @type {number} */ (match.index)),
        match[1],
      ).toMatch(/@experimental\b/u);
    }
  });

  it.each(['authoring/index.mjs', 'authoring/index.d.ts'])(
    'every icon parser %s exports',
    file => {
      const source = read(file);
      const found = [
        ...source.matchAll(/^export \{([^}]*\bparseIcon\w*[^}]*)\} from/gmu),
      ];
      expect(found.length).toBe(2);
      for (const match of found) {
        expect(
          docBefore(source, /** @type {number} */ (match.index)),
          match[1],
        ).toMatch(/@experimental\b/u);
      }
    },
  );
});
