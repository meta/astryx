// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where the exports of the doc files Astryx ships are stored, how a
 *   source file's text is keyed in a store written at publish, and how such a
 *   store is read. ./import.mjs reads the stored exports and
 *   foundation/discovery/template-adapter.mjs the stored template component
 *   lists; scripts/generate-stored-docs.mjs and
 *   scripts/generate-template-components.mjs write them.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';

/**
 * Where the exports of the doc files Astryx ships are stored: each doc that
 * imports nothing, runs nothing as it loads and exports only plain data, by a
 * hash of its text. A stored doc then needs no import; an edited or unknown
 * file is imported as before.
 */
export const STORED_DOCS_FILE = path.join(
  CLI_ROOT,
  'assets',
  'docs.generated.json',
);

/** The folder of the files Astryx ships; only its doc files are stored. */
export const SHIPPED_ASSETS = path.join(CLI_ROOT, 'assets') + path.sep;

/**
 * The key of a source file's text in a store written at publish (the stored
 * docs, the stored template component lists): a hash of the text, so an
 * edited or unknown file is never answered from a store.
 * @param {string} text
 * @returns {string}
 */
export function storedKey(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

/** @type {Map<string, Map<string, any>>} */
const stores = new Map();

/**
 * A store written at publish, by key, read once per process. A missing or
 * unreadable file reads as empty, so every source is worked out as before.
 * @param {string} file
 * @returns {Map<string, any>}
 */
export function readStore(file) {
  let store = stores.get(file);
  if (!store) {
    try {
      store = new Map(
        Object.entries(JSON.parse(fs.readFileSync(file, 'utf-8'))),
      );
    } catch {
      store = new Map();
    }
    stores.set(file, store);
  }
  return store;
}
