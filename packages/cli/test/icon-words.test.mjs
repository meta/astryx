// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Component docs and the icon guide use one icon vocabulary. A name such as
 * 'close' is a "built-in meaning", never a "semantic icon name". The drawings
 * a theme gives those names are its "theme icons", never an "icon registry";
 * `IconRegistry` is only the name of their type. "icon pack" is not an Astryx
 * term. Keywords and code keep any spelling a reader may search for or type.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DOC_ROOTS = ['packages/core/src', 'packages/richtext/src'];
const ICON_GUIDE = 'packages/cli/assets/docs/icons.doc.mjs';

const RETIRED = [
  {word: 'icon registry', pattern: /\bicon[- ]registr/i},
  {word: 'icon pack', pattern: /\bicon[- ]packs?\b/i},
  {
    word: 'semantic icon name',
    pattern:
      /\bsemantic\b(?:\s+[\w/]+){0,2}?\s+(?:icons?|names?|list|purpose)\b|\bsemantic or (?:namespaced|component)\b/i,
  },
];

/** @param {string} dir @returns {string[]} */
function docFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...docFiles(full));
    else if (entry.name.endsWith('.doc.mjs')) out.push(full);
  }
  return out;
}

/**
 * Prose strings of a doc module: every string value except keyword lists,
 * code blocks and code spans.
 * @param {unknown} value
 * @param {string[]} out
 */
function proseOf(value, out = []) {
  if (typeof value === 'string') {
    out.push(value.replace(/`[^`]*`/g, ''));
  } else if (Array.isArray(value)) {
    for (const each of value) proseOf(each, out);
  } else if (value && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    if (record.type === 'code') return out;
    for (const [key, each] of Object.entries(record)) {
      if (key === 'keywords' || key === 'code') continue;
      proseOf(each, out);
    }
  }
  return out;
}

/** @param {string} file */
async function load(file) {
  return import(pathToFileURL(file).href);
}

describe('icon words', () => {
  const files = [
    ...DOC_ROOTS.flatMap(root => docFiles(path.join(ROOT, root))),
    path.join(ROOT, ICON_GUIDE),
  ];

  it('component docs and the icon guide use no retired icon word in prose', async () => {
    const found = [];
    for (const file of files) {
      const prose = proseOf(await load(file));
      for (const {word, pattern} of RETIRED) {
        for (const text of prose) {
          if (pattern.test(text)) {
            found.push(`${path.relative(ROOT, file)}: "${word}" in ${text.slice(0, 80)}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('Icon and IconButton say first how to draw an icon that is not built in', async () => {
    for (const name of ['Icon', 'IconButton']) {
      const mod = await load(path.join(ROOT, `packages/core/src/${name}/${name}.doc.mjs`));
      for (const doc of [mod.docs, mod.docsDense]) {
        const first = String(doc.usage.description);
        expect(first, name).toMatch(/your icon library/);
        expect(first, name).toMatch(/TrashIcon/);
      }
    }
  });
});
