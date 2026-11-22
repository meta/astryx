// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Prop and parameter text in component and hook docs, and the icon-set and
 * theme guides, use one icon vocabulary. A name such as 'close' is a
 * "built-in meaning", never a "semantic icon name". The drawings a theme gives
 * those names are its "theme icons", never an "icon registry"; `IconRegistry`
 * is only the name of their type. "icon pack" is not an Astryx term. The
 * Chinese copies use the same words (内置含义, 主题图标). The icon-set guides
 * also call an entry an "icon meaning", never a "definition", and a set's
 * looks its "variants". Code, file paths and quoted CLI output keep any
 * spelling a reader may type.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const DOC_ROOTS = ['packages/core/src', 'packages/richtext/src'];

// Guides read whole: [path under packages/cli/assets/docs, export, icon-set guide?].
const GUIDES = [
  ['tree/icon-sets.doc.mjs', 'docs', true],
  ['tree/icon-definitions.doc.mjs', 'docs', true],
  ['tree/icon-set-files.doc.mjs', 'docs', true],
  ['theme.doc.mjs', 'docs', false],
  ['theme.doc.dense.mjs', 'docsDense', false],
  ['theme.doc.zh.mjs', 'docsZh', false],
];

const RETIRED = [
  {word: 'icon registry', pattern: /\bicon[- ]registr/i},
  {word: 'icon pack', pattern: /\bicon[- ]packs?\b/i},
  {
    word: 'semantic icon name',
    pattern:
      /\bsemantic\b(?!\s+(?:icon\s+)?colou?r)(?:\s+[\w/]+){0,2}?\s+(?:icons?|names?|list|purpose)\b|\bsemantic or (?:namespaced|component)\b/i,
  },
  {word: '图标注册表 (icon registry)', pattern: /图标注册表/},
  {word: '语义图标名称 (semantic icon name)', pattern: /语义图标|语义名称/},
];

// Retired in the icon-set guides only.
const RETIRED_IN_ICON_SET_GUIDES = [
  {
    word: 'definition (say icon meaning)',
    pattern: /\bdefinitions?\b/i,
    // These keep the word: the sentence that introduces the term, and the
    // `definitions` folder name.
    allow: [
      /\bone icon definition per meaning\b/,
      /\bicon definitions folder\b/,
      /\bdefinitions folder\b/,
    ],
  },
  {
    word: 'look (say variant)',
    pattern: /\blooks?\b/i,
    // The two sentences that say what a variant is.
    allow: [/\bA variant is a named look\b/, /\bseveral looks, its variants\b/],
  },
];

// Guide keys that hold names, not prose.
const GUIDE_NAME_KEYS = ['id', 'name', 'group', 'into', 'kinds'];

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
 * code blocks and code spans. For a guide, also leave out name keys, file
 * paths, the doc kind name and the quoted "(optional)" heading.
 * @param {unknown} value
 * @param {string[]} out
 * @param {{guide?: boolean}} [opts]
 */
function proseOf(value, out = [], opts = {}) {
  if (typeof value === 'string') {
    let text = value.replace(/`[^`]*`/g, '');
    if (opts.guide)
      text = text
        .replace(/\S*\/\S*/g, '')
        .replace(/'icon-definition'/g, '')
        .replace(/"[^"]*\(optional\)"/g, '');
    out.push(text);
  } else if (Array.isArray(value)) {
    for (const each of value) proseOf(each, out, opts);
  } else if (value && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    if (record.type === 'code') return out;
    for (const [key, each] of Object.entries(record)) {
      if (key === 'keywords' || key === 'code') continue;
      if (opts.guide && GUIDE_NAME_KEYS.includes(key)) continue;
      proseOf(each, out, opts);
    }
  }
  return out;
}

/** @param {string} file */
async function load(file) {
  return import(pathToFileURL(file).href);
}

/**
 * Prop and parameter text of every copy of a doc (full, Chinese, dense).
 * @param {Record<string, any>} mod
 */
function propText(mod) {
  const out = [];
  for (const doc of [mod.docs, mod.docsZh, mod.docsDense]) {
    if (!doc) continue;
    for (const key of [
      'props',
      'propDescriptions',
      'params',
      'returns',
      'paramDescriptions',
      'returnDescriptions',
    ])
      proseOf(doc[key], out);
  }
  return out;
}

describe('icon words', () => {
  const files = DOC_ROOTS.flatMap(root => docFiles(path.join(ROOT, root)));

  it('prop and parameter text uses no retired icon word', async () => {
    const found = [];
    for (const file of files) {
      const prose = propText(await load(file));
      for (const {word, pattern} of RETIRED) {
        for (const text of prose) {
          if (pattern.test(text)) {
            found.push(
              `${path.relative(ROOT, file)}: "${word}" in ${text.slice(0, 80)}`,
            );
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('the icon-set and theme guides use no retired icon word', async () => {
    const found = [];
    for (const [file, exportName, iconSetGuide] of GUIDES) {
      const doc = (
        await load(path.join(ROOT, 'packages/cli/assets/docs', file))
      )[exportName];
      expect(doc, `${file} exports ${exportName}`).toBeTruthy();
      const prose = proseOf(doc, [], {guide: true});
      expect(prose.length, `${file} has prose`).toBeGreaterThan(0);
      const rules = iconSetGuide
        ? [...RETIRED, ...RETIRED_IN_ICON_SET_GUIDES]
        : RETIRED;
      for (const {word, pattern, allow = []} of rules) {
        for (const text of prose) {
          const rest = allow.reduce((each, ok) => each.replace(ok, ''), text);
          if (pattern.test(rest))
            found.push(`${file}: "${word}" in ${rest.slice(0, 80)}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("the icon prop's first sentence says how to draw an icon that is not built in", async () => {
    for (const name of ['Icon', 'IconButton']) {
      const mod = await load(
        path.join(ROOT, `packages/core/src/${name}/${name}.doc.mjs`),
      );
      const full = mod.docs.props.find(prop => prop.name === 'icon');
      const dense = mod.docsDense.propDescriptions.icon;
      for (const text of [full.description, dense]) {
        const first = String(text).split(/\.\s/)[0];
        expect(first, name).toMatch(/TrashIcon/);
        expect(first, name).toMatch(/your icon library/);
      }
    }
  });
});
