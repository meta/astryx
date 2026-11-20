// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where the exports of the doc files Astryx ships are stored, how a
 *   source file's text is keyed in a store written at publish, and how such a
 *   store is read. A stored doc's parse that the store does not hold is kept
 *   for the user, by the doc's text and the zod release the doc parsers load
 *   (keptParse). ./import.mjs reads the
 *   stored exports and foundation/discovery/template-adapter.mjs the stored
 *   template component lists; scripts/generate-stored-docs.mjs and
 *   scripts/generate-template-components.mjs write them. Also where the
 *   CLI's docs routes are stored (scripts/generate-docs-routes.mjs).
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';
import {persistedValue} from '../fs/gather-cache.mjs';
import {withoutRecording} from '../fs/read-record.mjs';

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
 * Where every route of the CLI's own docs tree is stored, with the state of
 * every file and folder the tree read (scripts/generate-docs-routes.mjs), so
 * the lookup commands' not-found hint names a route without building the
 * tree (api/docs/_entry-names.mjs).
 */
export const DOCS_ROUTES_FILE = path.join(
  CLI_ROOT,
  'assets',
  'docs-routes.generated.json',
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

/**
 * Each export value of a stored doc's module (./import.mjs), with the doc's
 * key and the export's name, so its parse can be answered from the store
 * ({@link storedParse}).
 * @type {WeakMap<object, {key: string, name: string}>}
 */
const storedExports = new WeakMap();

/**
 * Note that `value` is the `name` export of the stored doc `key`.
 * @param {unknown} value
 * @param {string} key
 * @param {string} name
 */
export function noteStoredExport(value, key, name) {
  if (value && typeof value === 'object') storedExports.set(value, {key, name});
}

/**
 * Where a stored doc's export, as the readers parse it, is stored at publish.
 * The key names the zod release that made the parse: an install that loads
 * another zod release finds no stored parse and parses the doc.
 * @param {string} key the doc's key
 * @param {string} name the export's name
 * @param {string} zod the version of the zod copy the doc parsers load
 * @returns {string}
 */
export function storedParseKey(key, name, zod) {
  return `parsed:${name}:${key}:${zod}`;
}

/**
 * The parse of `value`, read from the store, when `value` is a stored doc's
 * export whose parse was stored at publish with the zod release the doc
 * parsers load now: a fresh value, as a parse gives. Undefined otherwise, or
 * when the store or the zod release cannot be read.
 * @param {unknown} value
 * @returns {any}
 */
export function storedParse(value) {
  if (!value || typeof value !== 'object') return undefined;
  const at = storedExports.get(value);
  if (!at) return undefined;
  const zod = docParserZodVersion();
  if (zod == null) return undefined;
  try {
    const parsed = readStore(STORED_DOCS_FILE).get(
      storedParseKey(at.key, at.name, zod),
    );
    return parsed != null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * How a doc's parse is kept: as its JSON text, only when that text reads back
 * as a value equal to the parse, the rule the stored parses above follow.
 * The text keeps the parse's own key order, so a kept parse prints as the
 * fresh one does.
 */
const KEPT_PARSE_CODEC = {
  encode: (/** @type {unknown} */ value) => value,
  decode: (/** @type {unknown} */ stored) => stored,
  valid: (/** @type {unknown} */ value) =>
    value != null && typeof value === 'object',
};

/** @type {string | null | undefined} */
let parserZodVersion;

/**
 * The version of the zod copy the doc parsers load, read once per run. The
 * build id names the CLI's own code, not the packages it depends on, and a
 * reinstall can put another zod beside the same build.
 * @returns {string | null} null when it cannot be read
 */
export function docParserZodVersion() {
  if (parserZodVersion === undefined) {
    parserZodVersion = withoutRecording(() => {
      try {
        const require = createRequire(
          new URL('../../authoring/doctypes/_schema.mjs', import.meta.url),
        );
        const {version} = JSON.parse(
          fs.readFileSync(require.resolve('zod/package.json'), 'utf8'),
        );
        return typeof version === 'string' ? version : null;
      } catch {
        return null;
      }
    });
  }
  return parserZodVersion;
}

/**
 * The parse of `value` by `parse`. When `value` is a stored doc's export
 * (./import.mjs), the parse is a function of the doc's text, the CLI build
 * and the zod release the parsers load, so it is kept for the user by those
 * (gather-cache's `persistedValue`): a later read of the same text, by the
 * same build with the same zod, gets the kept parse and does not parse. Any
 * other value is parsed as before, and so is every value when the zod
 * release cannot be read.
 * @param {unknown} value
 * @param {() => any} parse
 * @returns {any}
 */
export function keptParse(value, parse) {
  if (!value || typeof value !== 'object') return parse();
  const at = storedExports.get(value);
  if (!at) return parse();
  const zod = docParserZodVersion();
  if (zod == null) return parse();
  return persistedValue(
    ['doc-parse', at.key, at.name, zod],
    parse,
    KEPT_PARSE_CODEC,
  );
}
