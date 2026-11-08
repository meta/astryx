// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component and hook doc loader.
 *
 * @input A component or hook `.doc.{ts,mjs,js}` path and the reading language
 *   (`lang`, or the legacy `zh`/`dense` flags).
 * @output The module's own doc, with its translation laid over it for `lang`.
 * @position The loaders every component and hook reader calls. Both read
 *   through the doc compiler (foundation/doc-compiler/read.mjs), which lowers
 *   the doc on every read. The two differ only in how strict they are:
 *   {@link loadComponentDoc} reports a doc that fails its kind's parser, and
 *   {@link loadDocs}, which has never checked docs, still reads one.
 */

import {readDocView} from '../doc-compiler/read.mjs';

export {mergeTranslation} from '../doc-compiler/overlays.mjs';

/**
 * @typedef {object} LoadDocOptions
 * @property {boolean} [zh] legacy flag for `lang: 'zh'`
 * @property {boolean} [dense] legacy flag for `lang: 'dense'`
 * @property {string | null} [lang] wins over the legacy flags
 * @property {'components' | 'hooks'} [root] which root reads the doc
 *   (default: components)
 */

/**
 * The overlay a read applies: `lang`, else the legacy flags.
 * @param {LoadDocOptions} opts
 * @returns {string | null}
 */
function localeOf({zh = false, dense = false, lang} = {}) {
  return lang || (dense ? 'dense' : zh ? 'zh' : null);
}

/**
 * Load a component or hook doc and check it against its kind's parser.
 *
 * Reads `.doc.ts` through jiti and `.doc.mjs`/`.doc.js` natively. Both formats
 * load: a stamped default export (`export default {type: 'component', ...}`)
 * checked against its kind, and the legacy `export const docs = {...}` checked
 * against the permissive legacy union. The default export wins when both are
 * present. Throws the parser's readable message when the doc fails.
 *
 * @param {string} docPath absolute path to a `.doc.{ts,mjs,js}` file
 * @param {LoadDocOptions} [opts]
 * @returns {Promise<any>} the checked (and optionally translated) doc
 */
export async function loadComponentDoc(docPath, opts = {}) {
  return readDocView(docPath, {
    root: opts.root ?? 'components',
    lang: localeOf(opts),
    label: docPath,
    strict: true,
  });
}

/**
 * Load a component or hook doc without checking it. Supports `lang` ('zh' for
 * Chinese, 'dense' for compressed) and the legacy `zh`/`dense` flags; the
 * translation is laid over the doc, keeping its structure. A file that exports
 * no doc reads as `undefined`.
 * @param {string} readmePath
 * @param {LoadDocOptions} [opts]
 * @returns {Promise<any>}
 */
export async function loadDocs(readmePath, opts = {}) {
  return readDocView(readmePath, {
    root: opts.root ?? 'components',
    lang: localeOf(opts),
    label: readmePath,
    loader: 'native',
  });
}
