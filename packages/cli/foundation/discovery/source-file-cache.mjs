// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file source-file-cache.mjs
 * @input A TypeScript compiler host, the project's own `typescript`, and the
 *   compiler options its programs use
 * @output `keepSourceFiles`: the host's `getSourceFile`, keeping each parsed
 *   file while its stamp (`fileStamp`) is the same, for every program in this
 *   process whose options parse and bind a file alike.
 * @position The props comparison (./prop-drift.mjs) and the doc types check
 *   (./doc-types.mjs) build a program for every check, and each parsed the
 *   same declarations again: the TypeScript library's, React's, the
 *   authoring types. A process that checks more than once (a test run, a
 *   long-running caller, a check over several roots) now parses each once.
 *   TypeScript's language service shares parsed files between programs the
 *   same way; from 5.3 a program keeps what it resolved for a file itself, not
 *   on the file, which is what makes sharing them safe across programs.
 */

import path from 'node:path';
import {fileStamp, recordContentRead} from '../fs/read-record.mjs';

/**
 * The files kept, per TypeScript and per how the options parse and bind a
 * file (`settingsKey`), the most recently used options last.
 * @type {WeakMap<object, Map<string, Map<string, {stamp: string, sourceFile: any}>>>}
 */
const kept = new WeakMap();

/** The most files kept for one key; the oldest go first. */
const MAX_FILES = 5000;

/**
 * The most keys kept per TypeScript; the least recently used go first. Each
 * holds its own parse of the TypeScript library's declarations, the largest
 * files a program reads.
 */
const MAX_KEYS = 8;

/** @type {WeakMap<object, any>} one document registry per TypeScript */
const registries = new WeakMap();

/**
 * What in `options` decides how a file parses and binds: the key TypeScript's
 * language service shares parsed files by (its document registry's), and
 * whether a script binds in strict mode, which that key reads only from an
 * explicit `alwaysStrict`. Options that only resolve or check (`paths`,
 * `types`, `lib`, the strict checks) do not change it.
 * @param {any} ts
 * @param {any} options
 * @returns {string}
 */
function settingsKey(ts, options) {
  let registry = registries.get(ts);
  if (registry == null) {
    registry = ts.createDocumentRegistry();
    registries.set(ts, registry);
  }
  const strict =
    typeof ts.getStrictOptionValue === 'function'
      ? ts.getStrictOptionValue(options, 'alwaysStrict')
      : (options.alwaysStrict ?? options.strict ?? false);
  return `${registry.getKeyForCompilationSettings(options)}|${strict ? 1 : 0}`;
}

/**
 * Whether this TypeScript keeps a program's module resolutions on the program
 * (5.3 and later) rather than on the parsed files it shares.
 * @param {any} ts
 */
function sharesSafely(ts) {
  const [major, minor] = String(ts.versionMajorMinor ?? '0.0')
    .split('.')
    .map(Number);
  return major > 5 || (major === 5 && minor >= 3);
}

/**
 * `host.getSourceFile`, keeping each file it parses while the file's stamp is
 * the same, for every program whose options parse and bind a file as
 * `options` do. A kept file still counts as read by the running operation
 * (`recordContentRead`), as a parse would. On a TypeScript older than 5.3 the
 * host's own `getSourceFile` is returned.
 * @param {any} ts the project's own `typescript`
 * @param {any} host
 * @param {any} options the compiler options of the programs that use it
 * @returns {(fileName: string, languageVersionOrOptions: any, onError?: any, shouldCreate?: boolean) => any}
 */
export function keepSourceFiles(ts, host, options) {
  const getSourceFile = host.getSourceFile.bind(host);
  if (!sharesSafely(ts)) return getSourceFile;
  let bySettings = kept.get(ts);
  if (bySettings == null) {
    bySettings = new Map();
    kept.set(ts, bySettings);
  }
  const settings = settingsKey(ts, options);
  const byFile = bySettings.get(settings) ?? new Map();
  // Most recently used last; past MAX_KEYS, the least recently used go.
  bySettings.delete(settings);
  bySettings.set(settings, byFile);
  if (bySettings.size > MAX_KEYS) {
    bySettings.delete(/** @type {string} */ (bySettings.keys().next().value));
  }
  return (fileName, languageVersionOrOptions, onError, shouldCreate) => {
    // How the file parses: its language version and, from TypeScript 5.0,
    // its module format and JSDoc parsing (the module detection the options
    // give is in `settings`).
    const parse =
      languageVersionOrOptions != null &&
      typeof languageVersionOrOptions === 'object'
        ? [
            languageVersionOrOptions.languageVersion,
            languageVersionOrOptions.impliedNodeFormat,
            languageVersionOrOptions.jsDocParsingMode,
          ]
        : [languageVersionOrOptions];
    const key = `${path.resolve(fileName)}\0${JSON.stringify(parse)}`;
    const stamp = fileStamp(fileName);
    const seen = byFile.get(key);
    if (seen != null && stamp !== '-' && seen.stamp === stamp) {
      recordContentRead(fileName);
      return seen.sourceFile;
    }
    const sourceFile = getSourceFile(
      fileName,
      languageVersionOrOptions,
      onError,
      shouldCreate,
    );
    byFile.delete(key);
    if (sourceFile != null && stamp !== '-') {
      byFile.set(key, {stamp, sourceFile});
      if (byFile.size > MAX_FILES) {
        byFile.delete(/** @type {string} */ (byFile.keys().next().value));
      }
    }
    return sourceFile;
  };
}
