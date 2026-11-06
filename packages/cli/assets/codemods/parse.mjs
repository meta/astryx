// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Parse entry points that mark their own failures.
 *
 * @input Source text a codemod reads: a file's JavaScript or TypeScript, a
 *   stylesheet, or one CSS selector.
 * @output The parsed tree; a parse failure is rethrown with
 *   `code: 'ERR_CODEMOD_PARSE'`.
 * @position Shared by the codemod runner and the core CSS codemods. The runner
 *   skips a protected file only when its error carries this code, so any other
 *   error a codemod throws still fails the run.
 */

import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

export const CODEMOD_PARSE_ERROR = 'ERR_CODEMOD_PARSE';

/**
 * Mark an error as a parse failure and return it.
 * @template T
 * @param {T} err
 * @returns {T}
 */
export function markParseError(err) {
  if (err && typeof err === 'object') {
    /** @type {any} */ (err).code = CODEMOD_PARSE_ERROR;
  }
  return err;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isCodemodParseError(err) {
  return /** @type {any} */ (err)?.code === CODEMOD_PARSE_ERROR;
}

/**
 * `postcss.parse`, with a failure marked as a parse error.
 * @param {string} source
 * @param {import('postcss').ProcessOptions} [options]
 */
export function parseCss(source, options) {
  try {
    return postcss.parse(source, options);
  } catch (err) {
    throw markParseError(err);
  }
}

/**
 * Parse one selector, hand its tree to `callback`, and return the tree as
 * text, like `selectorParser(callback).processSync(selector, {lossless:
 * true})`. Pass the PostCSS rule rather than its selector text when there is
 * one: a failure then reports its line and column in the stylesheet. Only a
 * failure to parse is marked; an error `callback` throws is passed through
 * unchanged.
 * @param {string | import('postcss').Rule} selector selector text, or the rule that holds it
 * @param {(root: import('postcss-selector-parser').Root) => void} callback
 * @returns {string}
 */
export function processSelector(selector, callback) {
  let root;
  try {
    root = selectorParser().astSync(selector, {lossless: true});
  } catch (err) {
    throw markParseError(err);
  }
  callback(root);
  return root.toString();
}

/**
 * The jscodeshift a code codemod receives for one file. Parsing that file's
 * own source (`j(file.source)`) marks a failure as a parse error; every other
 * call and property behaves as jscodeshift does.
 * @param {any} j jscodeshift bound to the file's parser
 * @param {string} source the file's source
 * @returns {any}
 */
export function markingSourceParseErrors(j, source) {
  return new Proxy(j, {
    apply(target, thisArg, args) {
      try {
        return Reflect.apply(target, thisArg, args);
      } catch (err) {
        throw args[0] === source ? markParseError(err) : err;
      }
    },
  });
}
