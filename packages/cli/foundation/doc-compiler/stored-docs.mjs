// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where the exports of the doc files Astryx ships are stored, and how a
 *   doc file's text is keyed there. ./import.mjs reads the stored exports;
 *   scripts/generate-stored-docs.mjs writes them.
 */

import {createHash} from 'node:crypto';
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
 * The key of a doc file's text in STORED_DOCS_FILE.
 * @param {string} text
 * @returns {string}
 */
export function docSourceKey(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}
