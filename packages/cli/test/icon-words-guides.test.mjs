// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Core's guides use one icon vocabulary. An icon set maps a library's icons
 * to icon meanings; prose never calls a meaning a "definition" (the data
 * file's `definitions` folder and JSON keys keep that word). A set's looks
 * are its variants, as `--variant` and `experimental.iconVariant` say. No
 * guide calls a set an "icon pack" or the drawings a theme gives Core's
 * names an "icon registry". Keywords, code, file paths, section ids and
 * quoted CLI output keep any spelling a reader may search for or type.
 */

import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  builtinGuideFiles,
  loadTopicModule,
} from '../foundation/discovery/docs-discovery.mjs';

const ICON_GUIDES = new Set([
  'icon-sets.doc.mjs',
  'icon-definitions.doc.mjs',
  'icon-set-files.doc.mjs',
  'template-icons.doc.mjs',
]);

const RETIRED_EVERYWHERE = [
  {word: 'icon registry', pattern: /\bicon[- ]registr/i},
  {word: 'icon pack', pattern: /\bicon[- ]packs?\b/i},
  {word: 'semantic icon', pattern: /\bsemantic icons?\b(?!\s+colou?r)/i},
];

const RETIRED_IN_ICON_GUIDES = [
  {
    word: 'semantic name',
    pattern:
      /\bsemantic\b(?!\s+(?:icon\s+)?colou?r)(?:\s+[\w/]+){0,2}?\s+(?:icons?|names?|list|purpose)\b/i,
  },
  {word: 'definition', pattern: /\bdefinitions?\b/i},
  {
    word: 'look (say variant)',
    pattern: /\blooks?\b/i,
    // The one sentence that says what a variant is.
    allow: [/\bA variant is a named look\b/, /\bseveral looks, its variants\b/],
  },
];

/**
 * Prose strings of a guide: every string value except keyword lists, code
 * blocks, ids and code spans.
 * @param {unknown} value
 * @param {string[]} out
 */
function proseOf(value, out = []) {
  if (typeof value === 'string') {
    // Code spans, file paths and the doc kind name keep their spellings.
    out.push(
      value
        .replace(/`[^`]*`/g, '')
        .replace(/\S*\/\S*/g, '')
        .replace(/'icon-definition'/g, '')
        .replace(/"[^"]*\(optional\)"/g, ''),
    );
  } else if (Array.isArray(value)) {
    for (const each of value) proseOf(each, out);
  } else if (value && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    if (record.type === 'code') return out;
    for (const [key, each] of Object.entries(record)) {
      if (
        ['keywords', 'code', 'id', 'name', 'group', 'into', 'kinds'].includes(
          key,
        )
      )
        continue;
      proseOf(each, out);
    }
  }
  return out;
}

describe('icon words in guides', () => {
  it('use no retired icon word in prose', async () => {
    const found = [];
    for (const file of builtinGuideFiles()) {
      const base = path.basename(file);
      const rules = ICON_GUIDES.has(base)
        ? [...RETIRED_EVERYWHERE, ...RETIRED_IN_ICON_GUIDES]
        : RETIRED_EVERYWHERE;
      const prose = proseOf(await loadTopicModule(file));
      for (const {word, pattern, allow = []} of rules) {
        for (const text of prose) {
          const rest = allow.reduce((each, ok) => each.replace(ok, ''), text);
          if (pattern.test(rest))
            found.push(`${base}: "${word}" in ${rest.slice(0, 80)}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
