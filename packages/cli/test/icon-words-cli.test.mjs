// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The icon commands' docs say "icon meaning" for an entry of Astryx's shared
 * list of what icons are for, "variant" for a set's looks, and never "icon
 * pack" or "icon registry". Flags, code, JSON keys, ids, file paths and
 * keywords keep their spellings.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {describe, expect, it} from 'vitest';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DOC_FILES = fs
  .readdirSync(path.join(CLI, 'clients/cli/commands'))
  .filter(name => /^experimental-icon.*\.doc\.mjs$/.test(name))
  .map(name => path.join(CLI, 'clients/cli/commands', name));

const RETIRED = [
  {word: 'definition', pattern: /\bdefinitions?\b/i},
  {word: 'look (say variant)', pattern: /\blooks?\b/i},
  {word: 'register', pattern: /\bregist(?:er|ers|ered|ering|ry|ries)\b/i},
  {word: 'icon pack', pattern: /\b(?:icon[- ])?packs?\b/i},
];

/**
 * The one sentence that says what a variant is, and "look words": the
 * style, size and weight words in a library's export names, which are not
 * a set's variants.
 */
const ALLOWED_LOOKS = /\bA variant is a look\b|\blook words?\b/g;

/** Keys whose values are code, names or search words, not prose. */
const NOT_PROSE = new Set([
  'keywords',
  'code',
  'cli',
  'flag',
  'param',
  'fn',
  'name',
  'command',
  'signature',
  'subcommands',
  'related',
  'type',
  'importPath',
  'displayName',
]);

/**
 * @param {unknown} value
 * @param {string[]} out
 */
function proseOf(value, out = []) {
  if (typeof value === 'string') {
    out.push(
      value
        .replace(/`[^`]*`/g, '')
        .replace(/--[\w-]+/g, '')
        // A command name is typed, not read.
        .replace(/\bicon new-definition\b/g, '')
        .replace(/<[\w-]+>/g, '')
        .replace(/\S*\/\S*/g, '')
        .replace(/\b(?:options|data)\.\w+/g, ''),
    );
  } else if (Array.isArray(value)) {
    for (const each of value) proseOf(each, out);
  } else if (value && typeof value === 'object') {
    for (const [key, each] of Object.entries(value)) {
      if (!NOT_PROSE.has(key)) proseOf(each, out);
    }
  }
  return out;
}

describe('icon words in the icon commands', () => {
  it('use no retired icon word in prose', async () => {
    const found = [];
    for (const file of DOC_FILES) {
      const {doc} = await import(pathToFileURL(file).href);
      for (const text of proseOf(doc)) {
        const rest = text.replace(ALLOWED_LOOKS, '');
        for (const {word, pattern} of RETIRED) {
          if (pattern.test(rest)) {
            found.push(
              `${path.basename(file)}: "${word}" in ${rest.slice(0, 100)}`,
            );
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
