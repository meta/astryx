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
 * Where the exports of the doc files Astryx ships (the CLI's and Core's) are
 * stored: each doc that imports nothing, reads nothing of where it sits, and
 * exports only plain data, by a hash of its text. Such a doc's exports depend
 * on its text alone, so any file with that exact text reads them; an edited
 * or unknown file is imported as before. The first line maps each key to the
 * byte range of its exports, as JSON, in the rest of the file, so a read
 * parses only the docs it needs.
 */
export const STORED_DOCS_FILE = path.join(
  CLI_ROOT,
  'assets',
  'docs.generated.json',
);

/**
 * The key of a source file's text in a store written at publish (the stored
 * docs, the stored template component lists): a hash of the text, so an
 * edited or unknown file is never answered from a store.
 * @param {string | Buffer} text
 * @returns {string}
 */
export function storedKey(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

/** @type {Map<string, {get: (key: string) => any}>} */
const stores = new Map();

/**
 * A store written at publish, by key, read once per process. A store is
 * either one JSON object of key to value, or (the stored docs) a first line
 * mapping each key to its byte range, then the values: a lookup parses only
 * the value it reads. A missing or unreadable file reads as empty, so every
 * source is worked out as before.
 * @param {string} file
 * @returns {{get: (key: string) => any}}
 */
export function readStore(file) {
  let store = stores.get(file);
  if (!store) {
    store = openStore(file);
    stores.set(file, store);
  }
  return store;
}

/**
 * @param {string} file
 * @returns {{get: (key: string) => any}}
 */
function openStore(file) {
  /** @type {Buffer} */
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return new Map();
  }
  const end = bytes.indexOf(0x0a);
  try {
    if (end !== -1 && end < bytes.length - 1) {
      /** @type {Map<string, [number, number]>} */
      const ranges = new Map(
        Object.entries(JSON.parse(bytes.toString('utf-8', 0, end))),
      );
      const data = bytes.subarray(end + 1);
      return {
        get(key) {
          const range = ranges.get(key);
          if (!range) return undefined;
          return JSON.parse(
            data.toString('utf-8', range[0], range[0] + range[1]),
          );
        },
      };
    }
    return new Map(Object.entries(JSON.parse(bytes.toString('utf-8'))));
  } catch {
    return new Map();
  }
}
