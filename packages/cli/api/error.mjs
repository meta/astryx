// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file API error class — carries structured error info matching CLIError shape.
 *
 * `AstryxError` is what the API layer throws. Alongside the human-readable
 * message and optional `suggestions`, it carries a stable machine-readable
 * `code` (see ../foundation/response/error-codes.mjs). When the CLI catches an AstryxError and
 * routes it through `cliError`, it propagates `e.code` so the JSON error
 * envelope's `code` field matches the API contract exactly. The code defaults
 * to `ERR_UNKNOWN` so older throw sites still produce a valid envelope.
 */

import {ERROR_CODES} from '../foundation/response/error-codes.mjs';
import {
  explainPackageManager,
  installDependenciesCommand,
} from '../foundation/env/package-manager.mjs';
import {relativeWithin, samePath} from '../foundation/fs/path-compare.mjs';
import {
  CLI_ROOT,
  findNodeModulesPackage,
  realDir,
} from '../foundation/fs/paths.mjs';
import {installPlaceOf, isGlobalCopy} from '../foundation/release/choose.mjs';
import {isInReleaseCache} from '../foundation/release/cache.mjs';
import {brokenInstall} from '../foundation/integrations/missing-dependency.mjs';
import * as path from 'node:path';

export class AstryxError extends Error {
  /** @type {import('../foundation/response/base').Suggestion[] | undefined} */
  suggestions;

  /**
   * Stable, machine-readable error code (error-codes.mjs). Consumers branch
   * on this, never on the message text.
   * @type {string}
   */
  code;

  /**
   * @param {string} message
   * @param {import('../foundation/response/base').Suggestion[]} [suggestions]
   * @param {string} [code] - Stable error code. Defaults to ERR_UNKNOWN.
   */
  constructor(message, suggestions, code) {
    super(message);
    this.name = 'AstryxError';
    this.code = code || ERROR_CODES.ERR_UNKNOWN;
    if (Array.isArray(suggestions) && suggestions.length) this.suggestions = suggestions;
  }
}

/**
 * The error for a write that failed on the filesystem: no permission, a
 * read-only mount, a full disk, a path component that is not a directory.
 *
 * A raw Node errno error reached the envelope as
 * `{"error": "EACCES: permission denied, open '/home/you/p/readonly/x.tsx'",
 * "code": "ERR_UNKNOWN"}` — the wrong code (ERR_WRITE_FAILED is in the frozen
 * registry for exactly this) and an absolute host path in the message. This
 * keeps the errno, which is the part that tells you what to fix, and reports
 * the target the way every other Astryx message does: relative to the project.
 *
 * A caller that wrote files before the failure must undo them first and pass
 * the ones it could not restore as `unrestored`, so the message never says
 * nothing was written when something was.
 *
 * A caller outside a project names the target its own way (`shown`, such
 * as a home-relative path), says what the write was (`what`), what had
 * already changed when it stopped (`outcome`), and the step that fixes the
 * cause (`next`).
 *
 * @param {string} target absolute path the write was aimed at
 * @param {string} cwd project root, for the relative form
 * @param {unknown} cause the error the filesystem call threw
 * @param {string[]} [unrestored] absolute paths an undo could not put back
 * @param {{shown?: string, what?: string, outcome?: string, next?: string}} [say]
 * @returns {AstryxError}
 */
export function writeFailed(target, cwd, cause, unrestored = [], say = {}) {
  const rel = say.shown ?? (path.relative(cwd, target) || target);
  const errno =
    typeof (/** @type {any} */ (cause)?.code) === 'string'
      ? /** @type {any} */ (cause).code
      : null;
  const why =
    errno === 'EACCES' || errno === 'EPERM'
      ? ' (no permission)'
      : errno === 'EROFS'
        ? ' (read-only file system)'
        : '';
  const outcome =
    say.outcome ??
    (unrestored.length === 0
      ? 'Nothing was written.'
      : `Earlier writes could not all be undone: ${unrestored
          .map(file => path.relative(cwd, file) || file)
          .join(', ')}.`);
  return new AstryxError(
    `Could not ${say.what ?? 'write'} ${rel}${errno ? `: ${errno}` : ''}${why}. ${outcome}${say.next ? ` ${say.next}` : ''}`,
    undefined,
    ERROR_CODES.ERR_WRITE_FAILED,
  );
}

/**
 * The refusal for a failure that is a broken install: an installed package
 * (one in a node_modules folder, such as a package the CLI uses) needs a
 * package it declares, and that package is not installed. The command's own
 * subject (a theme, a page) is not at fault, so the refusal names both
 * packages and how to install them again. When the run uses a CLI copy of
 * its own (global, a package runner's or the release cache's) and the app's
 * install does not hold the package that needs the missing one, the package
 * is that copy's: installing the copy again repairs it and the app's install
 * does not, so the refusal names the copy (a release-cache copy is installed
 * again once its folder is gone). Otherwise the refusal names the app's
 * install command. A missing import in the app's own files is not a broken
 * install: it stays the caller's failure.
 *
 * @param {unknown} cause the error the load threw
 * @param {string} cwd project root, for its install and package manager
 * @param {string} [outcome] what the command left as it was
 * @param {string} [cliRoot] the running CLI package's folder
 * @returns {AstryxError | null} null when the cause is not a broken install
 */
export function brokenInstallError(cause, cwd, outcome, cliRoot = CLI_ROOT) {
  const found = brokenInstall(
    cause instanceof Error ? cause.message : String(cause),
  );
  if (!found || !found.importer.split(/[\\/]/).includes('node_modules'))
    return null;
  const done = outcome ? ` ${outcome}` : '';
  const what = `${found.requiredBy} needs ${found.name}, which is missing or incomplete`;
  const cli = realDir(cliRoot);
  const cached = isInReleaseCache(cli);
  const place = installPlaceOf(cli);
  if (
    (cached || place.runner || isGlobalCopy(cli)) &&
    !appLinks(cwd, found.requiredBy, found.importer)
  )
    return new AstryxError(
      cached
        ? `The CLI release this run uses is not fully installed: ${what}. Remove ${place.owner ?? cli} so the next run installs that release again, then run the command again.${done}`
        : `The CLI copy this run uses (${cli}) is not fully installed: ${what}. The app's install does not hold ${found.requiredBy}, so install that copy of the CLI again, then run the command again.${done}`,
      undefined,
      ERROR_CODES.ERR_DEP_MISSING,
    );
  const install = installDependenciesCommand(cwd);
  return new AstryxError(
    `The app's packages are not fully installed: ${what} in node_modules. Run ${install} to install them again, then run the command again.${done}`,
    [
      {
        name: install,
        reason: `install the app's packages again: ${found.requiredBy} needs ${found.name}`,
      },
    ],
    ERROR_CODES.ERR_DEP_MISSING,
  );
}

/**
 * Whether the app's own install holds the package `name` that `importer` is
 * in: the importer is in the app's folder, or the app resolves `name` to
 * that same folder, wherever its package manager keeps it.
 * @param {string} cwd
 * @param {string} name
 * @param {string} importer
 * @returns {boolean}
 */
function appLinks(cwd, name, importer) {
  const app = explainPackageManager(cwd).dir ?? cwd;
  const at = realDir(path.dirname(importer));
  if (relativeWithin(realDir(app), at) !== null) return true;
  // Found in node_modules only, never through NODE_PATH or Node's global
  // folders, which can hold the CLI copy itself.
  const folder = findNodeModulesPackage(app, name)?.packageDir;
  if (!folder) return false;
  const linked = realDir(folder);
  return samePath(linked, at) || relativeWithin(linked, at) !== null;
}

/**
 * Locate the Core a command answers from (`requireCoreDir` in
 * foundation/fs/paths.mjs), raising its coded failure as an AstryxError:
 * ERR_CORE_NOT_FOUND with no Core to answer from, ERR_VERSIONS_UNAVAILABLE
 * when the carried Core is needed and cannot be installed.
 * @template {string | null} T
 * @param {(cwd: string) => T} lookup the foundation lookup
 * @param {string} cwd
 * @returns {T}
 */
export function coreDirOrThrow(lookup, cwd) {
  try {
    return lookup(cwd);
  } catch (error) {
    const code = /** @type {any} */ (error)?.code;
    if (typeof code === 'string' && code.startsWith('ERR_')) {
      throw new AstryxError(
        error instanceof Error ? error.message : String(error),
        undefined,
        code,
      );
    }
    throw error;
  }
}
