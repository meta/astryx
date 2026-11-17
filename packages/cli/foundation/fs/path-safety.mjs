// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path safety helpers.
 *
 * Centralizes path-traversal defenses, name sanitization, and
 * file-vs-directory detection used by CLI commands that write to
 * user-controlled output paths.
 *
 * Commands should use these helpers instead of constructing paths
 * directly with `path.resolve` / `path.join`, which silently re-root
 * absolute paths or allow traversal via `..`.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {ERROR_CODES} from '../response/error-codes.mjs';

/**
 * Error thrown by path-safety guards. Carries a stable `code`
 * so callers (CLI handlers) can render a friendly message and
 * exit cleanly without leaking stack traces.
 */
export class PathSafetyError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {{viaSymlink?: boolean}} [details]
   */
  constructor(message, code = 'PATH_UNSAFE', {viaSymlink = false} = {}) {
    super(message);
    this.name = 'PathSafetyError';
    this.code = code;
    /** True when the path is inside the root but a symlink in it leads out. */
    this.viaSymlink = viaSymlink;
  }
}

/**
 * Resolve `targetPath` (relative to `rootDir`) and assert that the
 * result stays inside `rootDir`. Rejects:
 *
 *   - Absolute paths (e.g. `/tmp/x`) — re-rooted by `path.join` is silent;
 *     better to fail loudly. Pass `{allowAbsolute: true}` to opt in.
 *   - Paths that escape via `..` segments or a symlink, dangling or not.
 *
 * With `allowAbsolute`, an absolute path is read as the place it names inside
 * `rootDir`, also when it reaches that place through a symlink on either side
 * (a symlinked project folder), and is then checked as that relative form.
 *
 * Returns the resolved absolute path on success, spelled from `rootDir`.
 *
 * @param {string} targetPath - User-provided path (relative or absolute).
 * @param {string} rootDir - Absolute path of the directory to constrain into.
 * @param {object} [options]
 * @param {boolean} [options.allowAbsolute=false] - If true, absolute paths
 *   are accepted *as long as* they resolve inside `rootDir`.
 * @param {string} [options.label='path'] - Human-readable name of the arg
 *   being checked (used in error messages, e.g. 'output directory').
 * @returns {string} Absolute resolved path inside `rootDir`.
 * @throws {PathSafetyError} An escape carries the registered
 *   `ERR_PATH_TRAVERSAL`, so it reaches an envelope correctly even uncaught.
 */
export function assertWithin(targetPath, rootDir, options = {}) {
  const {allowAbsolute = false, label = 'path'} = options;

  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    throw new PathSafetyError(
      `Invalid ${label}: must be a non-empty string`,
      'PATH_INVALID',
    );
  }

  // A NUL byte can't be a real path; reject it up front rather than letting it
  // reach the fs layer (defense in depth, matches sanitizeName).
  if (targetPath.includes('\0')) {
    throw new PathSafetyError(
      `Invalid ${label}: contains a NUL byte`,
      'PATH_INVALID',
    );
  }

  const absRoot = path.resolve(rootDir);
  let relativeTarget = targetPath;
  if (path.isAbsolute(targetPath)) {
    if (!allowAbsolute) {
      throw new PathSafetyError(
        `Invalid ${label} "${targetPath}": absolute paths are not allowed. ` +
          `Use a path relative to the project root.`,
        'PATH_ABSOLUTE',
      );
    }
    // Outside the root, the lexical check below refuses the absolute path.
    relativeTarget =
      relativeInsideRoot(path.resolve(targetPath), absRoot) ?? targetPath;
  }
  const resolved = path.resolve(absRoot, relativeTarget);

  // Canonicalize for the "is inside" comparison. Use normalized paths
  // with a trailing separator so /root/foo doesn't match /rootbar.
  const rootWithSep = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
  if (resolved !== absRoot && !resolved.startsWith(rootWithSep)) {
    throw new PathSafetyError(
      `Invalid ${label} "${targetPath}": resolves outside the project root ` +
        `(${absRoot}). Path traversal is not allowed.`,
      ERROR_CODES.ERR_PATH_TRAVERSAL,
    );
  }

  // path.resolve is purely lexical — it does NOT follow symlinks, so a symlink
  // INSIDE the root that points outside would pass the check above while the
  // real write lands outside root. Canonicalize both paths through every
  // symlink, dangling ones included (a write through a dangling link creates
  // its target), and re-check.
  try {
    const realRoot = canonicalPath(absRoot);
    const realTarget = canonicalPath(resolved);
    const realRootWithSep = realRoot.endsWith(path.sep)
      ? realRoot
      : realRoot + path.sep;
    if (realTarget !== realRoot && !realTarget.startsWith(realRootWithSep)) {
      throw new PathSafetyError(
        `Invalid ${label} "${targetPath}": resolves outside the project root ` +
          `(${absRoot}) via a symlink. Path traversal is not allowed.`,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
        {viaSymlink: true},
      );
    }
  } catch (err) {
    if (err instanceof PathSafetyError) throw err;
    // A symlink loop, a permission error, or a race; fall back to the lexical
    // result already validated above rather than crash.
  }

  return resolved;
}

/**
 * The system temp folders a scratch copy may go to: the folder `os.tmpdir()`
 * names, and `/tmp` on a POSIX system, each as written. A folder that is a
 * disk's root or holds the home folder is left out, so a misset `TMPDIR`
 * cannot open the whole disk or the home folder to scratch copies. Both are
 * compared as written and by their real locations, because a write follows
 * links: a temp folder that links to `/`, or a home folder reached through a
 * link, cannot get around the check. A folder whose real location cannot be
 * read is left out.
 *
 * @returns {string[]}
 */
export function tempFolders() {
  /** @param {string} at @returns {string[] | null} as written, then its real location */
  const spellings = at => {
    const written = path.resolve(at);
    try {
      return [written, canonicalPath(written)];
    } catch {
      return null;
    }
  };
  const homes = spellings(os.homedir()) ?? [path.resolve(os.homedir())];
  /** @type {Map<string, string>} each real location, with its first folder as written */
  const kept = new Map();
  for (const folder of [
    os.tmpdir(),
    ...(process.platform === 'win32' ? [] : ['/tmp']),
  ]) {
    const forms = spellings(folder);
    if (
      !forms ||
      forms.some(
        form =>
          form === path.parse(form).root ||
          homes.some(home => relativeInside(form, home) !== null),
      )
    )
      continue;
    if (!kept.has(forms[1])) kept.set(forms[1], forms[0]);
  }
  return [...kept.values()];
}

/**
 * The temp folder of {@link tempFolders} that holds the absolute path
 * `target`, or null. The path is read as written and through the temp
 * folder's own links, as `assertWithin` reads a project folder (macOS keeps
 * `/tmp` at `/private/tmp`).
 *
 * @param {string} target absolute
 * @returns {string | null}
 */
export function tempFolderOf(target) {
  return (
    tempFolders().find(
      folder => relativeInsideRoot(path.resolve(target), folder) !== null,
    ) ?? null
  );
}

/**
 * Where the absolute path `target` sits inside `root`, relative to `root`, or
 * null when it is outside. The path is first compared as written. Then each
 * ancestor, deepest first, is compared by its real location, so a path that
 * reaches the root through a symlink is inside, and the rest of the path is
 * kept as written: a symlink below that point is the caller's escape check.
 *
 * @param {string} target absolute, normalized
 * @param {string} root absolute, normalized
 * @returns {string | null}
 */
function relativeInsideRoot(target, root) {
  const lexical = relativeInside(root, target);
  if (lexical !== null) return lexical;
  let realRoot;
  try {
    realRoot = canonicalPath(root);
  } catch {
    return null;
  }
  /** @type {string[]} */
  const rest = [];
  for (let at = target; ; at = path.dirname(at)) {
    try {
      const inside = relativeInside(realRoot, canonicalPath(at));
      if (inside !== null) return path.join(inside, ...rest);
    } catch {
      // A symlink loop or a permission error: this ancestor is not known to
      // be inside the root; try the next one up.
    }
    if (path.dirname(at) === at) return null;
    rest.unshift(path.basename(at));
  }
}

/**
 * @param {string} root absolute
 * @param {string} target absolute
 * @returns {string | null} `target` relative to `root`, or null when outside
 */
function relativeInside(root, target) {
  const relative = path.relative(root, target);
  const escapes =
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);
  return escapes ? null : relative;
}

/** Linux's MAXSYMLINKS; a longer chain is treated as a loop. */
const MAX_SYMLINK_HOPS = 40;

/**
 * `target` with every symlink resolved, including a dangling one, which
 * `fs.realpathSync` refuses. Components below the deepest existing entry are
 * appended as given.
 *
 * @param {string} target absolute path
 * @param {number} [hops] symlinks followed so far
 * @returns {string}
 * @throws when the chain exceeds {@link MAX_SYMLINK_HOPS} or `lstat` fails
 *   for a reason other than a missing entry
 */
function canonicalPath(target, hops = 0) {
  if (hops > MAX_SYMLINK_HOPS) throw new Error(`Too many symlinks: ${target}`);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') throw err;
    const parent = path.dirname(target);
    if (parent === target) return target;
    return path.join(canonicalPath(parent, hops), path.basename(target));
  }
  try {
    // The native form spells a path as the disk does (its own case on a
    // case-insensitive disk), so two spellings of one place compare equal.
    return fs.realpathSync.native(target);
  } catch (err) {
    if (!stat.isSymbolicLink()) throw err;
  }
  const link = fs.readlinkSync(target);
  return canonicalPath(
    path.resolve(fs.realpathSync.native(path.dirname(target)), link),
    hops + 1,
  );
}

/**
 * Validate a "name" argument (e.g. theme name, component name) that will
 * be embedded in a generated filename. Rejects names containing path
 * separators, parent-segment markers, NUL bytes, leading dots, or any
 * character outside a conservative allow-list.
 *
 * Use this at the entry point of any command whose name arg flows into
 * `path.join(outDir, name + '.css')` etc.
 *
 * @param {string} name
 * @param {object} [options]
 * @param {string} [options.label='name']
 * @returns {string} The name (unchanged on success).
 * @throws {PathSafetyError}
 */
export function sanitizeName(name, options = {}) {
  const {label = 'name'} = options;

  if (typeof name !== 'string' || name.length === 0) {
    throw new PathSafetyError(
      `Invalid ${label}: must be a non-empty string`,
      'NAME_INVALID',
    );
  }

  if (name.includes('\0')) {
    throw new PathSafetyError(
      `Invalid ${label}: contains a NUL byte`,
      'NAME_INVALID',
    );
  }

  // Reject any path-segment characters. We don't try to rewrite — silent
  // sanitization hides intent. Fail loudly with a clear hint instead.
  if (/[\\/]/.test(name)) {
    throw new PathSafetyError(
      `Invalid ${label} "${name}": must not contain path separators ('/' or '\\\\').`,
      'NAME_HAS_SEPARATOR',
    );
  }

  if (name === '.' || name === '..' || name.startsWith('.')) {
    throw new PathSafetyError(
      `Invalid ${label} "${name}": must not start with '.'.`,
      'NAME_TRAVERSAL',
    );
  }

  // Conservative allow-list: alphanumerics, dot, underscore, hyphen.
  // Theme/component names in this codebase already conform to this.
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new PathSafetyError(
      `Invalid ${label} "${name}": only letters, digits, '.', '_', and '-' are allowed.`,
      'NAME_BAD_CHARS',
    );
  }

  return name;
}

const FILE_EXTENSIONS = new Set([
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.json',
  '.md',
  '.html',
]);

/**
 * Heuristic: does this CLI argument look like a file path (vs a directory)?
 *
 * Used by `astryx template <name> <path>` so that
 *   `astryx template blank ./foo.tsx`
 * writes to `./foo.tsx` as a file, not `./foo.tsx/page.tsx` (the old bug).
 *
 * Returns true when the basename has a known source/asset extension.
 * Conservative on purpose — unknown extensions still fall through to the
 * directory branch, matching pre-existing behavior for things like
 * `./out` or `./src/pages`.
 *
 * @param {string} pathArg
 * @returns {boolean}
 */
export function isFilePathArg(pathArg) {
  if (typeof pathArg !== 'string' || pathArg.length === 0) return false;
  // Trailing slash → explicit directory.
  if (/[\\/]$/.test(pathArg)) return false;
  const base = path.basename(pathArg);
  const ext = path.extname(base).toLowerCase();
  return ext.length > 0 && FILE_EXTENSIONS.has(ext);
}
