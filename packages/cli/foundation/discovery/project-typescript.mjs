// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Find the project's own TypeScript compiler.
 *
 * @input Directories to resolve `typescript` from, in order.
 * @output The compiler module and its version; or, when the only TypeScript
 *   installed has no JavaScript compiler API to read types with, its version
 *   alone; or null when none is installed.
 * @position Shared by the author checks that read source with the project's
 *   compiler, so each finds it, and says why it cannot use it, the same way.
 */

import * as path from 'node:path';
import {createRequire} from 'node:module';

/**
 * The package TypeScript publishes beside TypeScript 7 for tools that need a
 * JavaScript compiler API: TypeScript 6's. Kept in a constant so the type
 * check does not treat the load as a static import of an uninstalled package.
 */
const TYPESCRIPT_6_API = '@typescript/typescript6';

/**
 * Resolve the project's own `typescript`, trying each directory in order;
 * where it has no JavaScript compiler API (TypeScript 7), the TypeScript 6
 * API package installed beside it.
 * @param {Array<string | null | undefined>} dirs
 * @returns {{ts: any, version: string} | {ts: null, version: string} | null}
 *   `ts: null` when a TypeScript is installed but has no `createProgram`
 */
export function resolveProjectTypeScript(dirs) {
  /** @type {string | null} */
  let unusable = null;
  for (const dir of dirs) {
    if (!dir) continue;
    const require = createRequire(path.join(path.resolve(dir), 'package.json'));
    /** The version of the `typescript` package installed here, or null. */
    const installed = () => {
      try {
        const {version} = require('typescript/package.json');
        return typeof version === 'string' && version !== '' ? version : null;
      } catch {
        return null;
      }
    };
    try {
      const ts = require('typescript');
      if (ts && typeof ts.createProgram === 'function') {
        return {ts, version: String(ts.version)};
      }
      unusable ??= installed();
    } catch {
      // Not installed from here, or installed without an entry this CLI can
      // load.
      unusable ??= installed();
    }
    // TypeScript 7 has no JavaScript compiler API; the package TypeScript
    // ships beside it for tools that need one carries TypeScript 6's.
    try {
      const ts = require(TYPESCRIPT_6_API);
      if (ts && typeof ts.createProgram === 'function') {
        return {ts, version: String(ts.version)};
      }
    } catch {
      // Not installed from here; try the next directory.
    }
  }
  return unusable ? {ts: null, version: unusable} : null;
}

/**
 * What to do when the project's TypeScript is missing or cannot be used:
 * beside TypeScript 7, the TypeScript 6 API package it ships for tools;
 * otherwise a version every check here reads, 5.0 (the oldest that checks a
 * JavaScript doc) through 6.
 */
export const TYPESCRIPT_FIX =
  'On TypeScript 7, add its TypeScript 6 API package (`npm install -D @typescript/typescript6`); otherwise install TypeScript 5.0 through 6 (`npm install -D typescript@6`). Then run this check again.';

/**
 * Why a check that needs the compiler did not run, when the TypeScript
 * installed has no JavaScript compiler API, and what to do.
 * @param {string} version
 * @param {string} outcome what was not done, such as `docs were not checked`
 */
export function unusableTypeScriptReason(version, outcome) {
  return `TypeScript ${version} is installed in this project, but it has no JavaScript compiler API (\`createProgram\`) to read types with (TypeScript 7 ships none), so ${outcome}. ${TYPESCRIPT_FIX}`;
}
