// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every doc token in Astryx's shipped docs compiles: rendering a doc leaves no
 * `{@command}`, `{@pm}` or `{@pm-only}` token behind except the ones a `{@@…}`
 * escape writes on purpose, and doctor finds no token fault in them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {renderCommandTokens} from '../foundation/doc-compiler/doc-syntax.mjs';
import {findDocCommands} from '../foundation/discovery/runner-commands.mjs';

const CLI = path.resolve(import.meta.dirname, '..');
const ROOTS = ['assets/docs', 'clients/cli/commands', 'api'];
const TOKEN_LEFT = /\{@(?:command|pm-only|pm)\b/g;
const ESCAPE = /\{@@(?:command|pm-only|pm)\b/g;

/** @param {string} dir @returns {string[]} */
function docFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : docFiles(full);
    }
    return entry.name.endsWith('.doc.mjs') ? [full] : [];
  });
}

/**
 * Each string in a doc, with the code block language it sits in.
 * @param {unknown} value
 * @param {string | null} lang
 * @returns {Array<{text: string, lang: string | null}>}
 */
function stringsOf(value, lang = null) {
  if (typeof value === 'string') return [{text: value, lang}];
  if (Array.isArray(value)) return value.flatMap(each => stringsOf(each, lang));
  if (value && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    const blockLang = record.type === 'code' ? String(record.lang ?? '') : lang;
    return Object.entries(record).flatMap(([key, each]) =>
      stringsOf(each, key === 'code' ? blockLang : lang),
    );
  }
  return [];
}

const files = ROOTS.flatMap(root => docFiles(path.join(CLI, root)));

describe("Astryx's shipped docs", () => {
  it('render with no token left but the escaped examples', async () => {
    /** @type {string[]} */
    const left = [];
    for (const file of files) {
      const module = await import(file);
      for (const {text, lang} of stringsOf(Object.values(module))) {
        const rendered = renderCommandTokens(
          text,
          {stem: 'astryx', pm: 'npm'},
          lang,
        );
        const remaining = (rendered.match(TOKEN_LEFT) ?? []).length;
        const escaped = (text.match(ESCAPE) ?? []).length;
        if (remaining !== escaped) {
          left.push(`${path.relative(CLI, file)}: ${text.slice(0, 120)}`);
        }
      }
    }
    expect(left).toEqual([]);
  }, 120_000);

  it('hold no doc token doctor would report', async () => {
    const found = await findDocCommands({
      records: files.map(file => ({
        name: path.basename(file, '.doc.mjs'),
        path: file,
      })),
    });
    expect(
      found.filter(each => each.code === 'doc_token').map(each => each.message),
    ).toEqual([]);
  }, 120_000);
});
