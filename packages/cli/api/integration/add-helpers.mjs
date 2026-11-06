// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared helpers for integration contribution writers.
 *
 * Hosts the atomic staged-write transaction, package.json files-array
 * maintenance, package-dir resolution, project-path normalization, and the
 * package and manifest plumbing (resolve the package, load its manifest, the
 * receipt shape, name grammar) that every `integration add <kind>` command
 * and the icon authoring writes (`experimental icon new-set`,
 * `new-definition`) need. `theme add` and `theme build` write through the
 * same transaction. Side-effect-free outside of {@link applyWrites}.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AstryxError} from '../error.mjs';
import {publishNewFile} from '../../foundation/fs/publish-file.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {findLocalIntegrationManifestOrNull} from '../../foundation/integrations/manifest-writer.mjs';
import {loadManifestObject} from '../../foundation/integrations/integrations.mjs';

/** @param {string} value */
export function projectPath(value) {
  return value.split(path.sep).join('/');
}

/** @param {string} startDir */
export function findPackageDir(startDir) {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 50; depth++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new AstryxError(
    'No package.json found. Run this command inside an integration package.',
    undefined,
    ERROR_CODES.ERR_FILE_NOT_FOUND,
  );
}

/**
 * @typedef {object} WritePlan
 * @property {string} path
 * @property {string | Buffer} contents a Buffer is written byte for byte
 * @property {boolean} createOnly
 * @property {Buffer} [expectedOriginal] bytes captured before validation;
 *   a different current file is a concurrent edit and must never be overwritten
 */

/**
 * @typedef {object} PackageJsonUpdate
 * @property {string} contents
 * @property {Buffer} expectedOriginal
 */

/**
 * @typedef {object} PackageExportEntry
 * @property {string} subpath package export key, e.g. `./components/Card.tsx`
 * @property {string} target package-relative target, e.g. `./components/Card.tsx`
 */

/**
 * @typedef {object} PackageJsonUpdateOptions
 * @property {boolean} [createExports] create a subpath map when the package has
 *   no exports field
 * @property {string[]} [sideEffects] side-effect glob patterns to preserve when
 *   package.json currently declares `sideEffects: false` or a pattern array
 */

/**
 * Compute one package.json update for an existing `files` allowlist and an
 * optional exports map. An exports map is created only when `createExports` is
 * explicit because doing so makes every unlisted deep import private.
 *
 * @param {string} packageFile
 * @param {string[]} entries project-relative files or directories
 * @param {PackageExportEntry[]} [publicExports]
 * @param {PackageJsonUpdateOptions} [options]
 * @returns {PackageJsonUpdate|null}
 */
export function packageJsonFilesUpdate(
  packageFile,
  entries,
  publicExports = [],
  {createExports = false, sideEffects = []} = {},
) {
  const expectedOriginal = fs.readFileSync(packageFile);
  const original = expectedOriginal.toString('utf-8');
  /** @type {any} */
  let pkg;
  try {
    pkg = JSON.parse(original);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AstryxError(
      `Cannot update package.json: ${message}`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  const normalize = (/** @type {string} */ value) =>
    projectPath(value).replace(/^\.\//u, '').replace(/\/$/u, '');
  let changed = false;

  if (pkg.files !== undefined) {
    if (
      !Array.isArray(pkg.files) ||
      pkg.files.some((/** @type {unknown} */ item) => typeof item !== 'string')
    ) {
      throw new AstryxError(
        'package.json files must be an array of strings before Astryx can add the contribution root.',
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    for (const item of entries.map(normalize)) {
      if (
        pkg.files.some(
          (/** @type {string} */ value) => normalize(value) === item,
        )
      ) {
        continue;
      }
      pkg.files.push(item);
      changed = true;
    }
  }

  if ((pkg.exports !== undefined || createExports) && publicExports.length > 0) {
    const authored = pkg.exports;
    /** @type {Record<string, unknown>} */
    let exportsMap;
    if (authored === undefined) {
      exportsMap = {};
    } else if (
      authored == null ||
      typeof authored !== 'object' ||
      Array.isArray(authored)
    ) {
      exportsMap = {'.': authored};
    } else {
      const keys = Object.keys(authored);
      const hasSubpaths = keys.some(key => key.startsWith('.'));
      const hasConditions = keys.some(key => !key.startsWith('.'));
      if (hasSubpaths && hasConditions) {
        throw new AstryxError(
          'package.json exports mixes subpaths and conditions, so Astryx cannot add a contribution export safely.',
          undefined,
          ERROR_CODES.ERR_INTEGRATION_EXPORT_CONFLICT,
        );
      }
      exportsMap = hasConditions ? {'.': authored} : {...authored};
    }

    for (const {subpath, target} of publicExports) {
      const key = `./${normalize(subpath)}`;
      const value = `./${normalize(target)}`;
      if (Object.prototype.hasOwnProperty.call(exportsMap, key)) {
        if (exportsMap[key] !== value) {
          throw new AstryxError(
            `package.json exports already maps "${key}" to a different target; refusing to replace it with "${value}".`,
            undefined,
            ERROR_CODES.ERR_INTEGRATION_EXPORT_CONFLICT,
          );
        }
        continue;
      }
      exportsMap[key] = value;
      changed = true;
    }
    if (changed || exportsMap !== authored) pkg.exports = exportsMap;
  }

  if (sideEffects.length > 0 && pkg.sideEffects !== undefined) {
    if (pkg.sideEffects === false) {
      pkg.sideEffects = [...sideEffects];
      changed = true;
    } else if (Array.isArray(pkg.sideEffects)) {
      if (
        pkg.sideEffects.some(
          (/** @type {unknown} */ item) => typeof item !== 'string',
        )
      ) {
        throw new AstryxError(
          'package.json sideEffects must be a boolean or an array of strings before Astryx can add theme CSS.',
          undefined,
          ERROR_CODES.ERR_INVALID_ARGUMENT,
        );
      }
      for (const pattern of sideEffects) {
        if (pkg.sideEffects.includes(pattern)) continue;
        pkg.sideEffects.push(pattern);
        changed = true;
      }
    } else if (pkg.sideEffects !== true) {
      throw new AstryxError(
        'package.json sideEffects must be a boolean or an array of strings before Astryx can add theme CSS.',
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  }

  if (!changed) return null;
  const indent = original.match(/\n([ \t]+)"/u)?.[1] ?? '  ';
  return {
    contents:
      JSON.stringify(pkg, null, indent) + (original.endsWith('\n') ? '\n' : ''),
    expectedOriginal,
  };
}

/**
 * Include one contribution root, the manifest, and any public source entries in
 * existing package allowlists.
 * @param {string} packageFile
 * @param {string} rootPath
 * @param {string} manifestName
 * @param {PackageExportEntry[]} [publicExports]
 * @param {PackageJsonUpdateOptions} [options]
 * @returns {PackageJsonUpdate|null}
 */
export function packageJsonUpdate(
  packageFile,
  rootPath,
  manifestName,
  publicExports = [],
  options = {},
) {
  return packageJsonFilesUpdate(
    packageFile,
    [rootPath, manifestName],
    publicExports,
    options,
  );
}

// ── Atomic staged-write transaction ─────────────────────────────────

/**
 * @param {string} file
 * @returns {boolean} false when the file is still there
 */
function removeTemporary(file) {
  try {
    fs.rmSync(file, {force: true});
    return true;
  } catch {
    // Best effort. The transaction error remains the actionable failure.
    return false;
  }
}

/**
 * Restore writes that already published.  Best-effort so callers preserve
 * the original actionable error; returns every path it could not put back.
 * @param {Array<WritePlan & {temporary: string, original: Buffer|null, mode: number}>} published
 * @returns {string[]}
 */
function rollbackWrites(published) {
  /** @type {string[]} */
  const unrestored = [];
  for (const plan of [...published].reverse()) {
    let restore = null;
    try {
      const stat = fs.lstatSync(plan.path);
      if (stat.isSymbolicLink()) continue;
      const current = fs.readFileSync(plan.path);
      if (!current.equals(Buffer.from(plan.contents))) continue;
      if (plan.original == null) {
        fs.rmSync(plan.path, {force: true});
      } else {
        restore = path.join(
          path.dirname(plan.path),
          `.${path.basename(plan.path)}.restore-${randomUUID()}`,
        );
        fs.writeFileSync(restore, plan.original, {mode: plan.mode});
        fs.renameSync(restore, plan.path);
        restore = null;
      }
    } catch (error) {
      // A created file that is already gone needs nothing. Any other failure
      // leaves this call's bytes, or no bytes, where the original was.
      const gone =
        error instanceof Error &&
        /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT';
      if (!(gone && plan.original == null)) unrestored.push(plan.path);
    } finally {
      if (restore != null) removeTemporary(restore);
    }
  }
  return unrestored;
}

/** @param {string} file */
function assertNotSymlink(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (
      error instanceof Error &&
      /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
    ) {
      return;
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new AstryxError(
      `Refusing to replace symlinked file ${file}.`,
      undefined,
      ERROR_CODES.ERR_PATH_TRAVERSAL,
    );
  }
}

/**
 * Apply several writes as one operation.  New files publish with an atomic
 * hard link so a racing creator is never overwritten; replacements are
 * rejected if their bytes changed after preflight or if the path is a symlink.
 * Returns a rollback function for a later step in the same transaction.
 *
 * @param {WritePlan[]} plans
 * @returns {() => void}
 */
export function applyWrites(plans) {
  /** @type {Array<WritePlan & {temporary: string, original: Buffer|null, mode: number}>} */
  const staged = [];
  /** @type {typeof staged} */
  const published = [];
  try {
    for (const plan of plans) {
      fs.mkdirSync(path.dirname(plan.path), {recursive: true});
      assertNotSymlink(plan.path);
      const exists = fs.existsSync(plan.path);
      if (plan.createOnly && exists) {
        throw new AstryxError(
          `Refusing to overwrite existing file ${plan.path}.`,
          undefined,
          ERROR_CODES.ERR_FILE_EXISTS,
        );
      }
      const original = exists ? fs.readFileSync(plan.path) : null;
      if (
        plan.expectedOriginal != null &&
        (original == null || !original.equals(plan.expectedOriginal))
      ) {
        throw new Error(`File changed while preparing: ${plan.path}`);
      }
      const mode = exists ? fs.statSync(plan.path).mode : 0o666;
      const temporary = path.join(
        path.dirname(plan.path),
        `.${path.basename(plan.path)}.tmp-${randomUUID()}`,
      );
      let descriptor;
      try {
        descriptor = fs.openSync(temporary, 'wx', mode);
        try {
          fs.writeFileSync(descriptor, plan.contents, 'utf-8');
        } finally {
          fs.closeSync(descriptor);
        }
      } catch (error) {
        removeTemporary(temporary);
        throw error;
      }
      staged.push({...plan, temporary, original, mode});
    }

    for (const plan of staged) {
      if (plan.original == null) {
        publishNewFile(plan.temporary, plan.path);
        published.push(plan);
        removeTemporary(plan.temporary);
        continue;
      } else {
        assertNotSymlink(plan.path);
        const current = fs.readFileSync(plan.path);
        if (!current.equals(plan.original)) {
          throw new Error(`File changed while writing: ${plan.path}`);
        }
        fs.renameSync(plan.temporary, plan.path);
      }
      published.push(plan);
    }
    return () => {
      rollbackWrites(published);
    };
  } catch (error) {
    const leftovers = staged
      .filter(plan => !removeTemporary(plan.temporary))
      .map(plan => plan.temporary);
    const unrestored = rollbackWrites(published);
    if (error instanceof Error) {
      if (unrestored.length > 0) {
        error.message += ` Could not restore: ${unrestored.join(', ')}.`;
      }
      if (leftovers.length > 0) {
        error.message += ` Could not remove temporary files: ${leftovers.join(', ')}.`;
      }
    }
    throw error;
  }
}

// ── Shared by every contribution writer (integration add, icon authoring) ──

/** A lower-kebab name: an item id, a set name. */
export const KEBAB_NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/**
 * Read package identity + resolve the manifest path.
 * @param {string} cwd
 */
export function resolvePackage(cwd) {
  const packageDir = findPackageDir(cwd);
  const packageFile = path.join(packageDir, 'package.json');
  /** @type {any} */
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AstryxError(
      `Cannot read package.json: ${message}`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const owner = typeof pkg.name === 'string' ? pkg.name : '(local integration)';
  const existingManifest = findLocalIntegrationManifestOrNull(packageDir);
  // The nearest package.json above the cwd may belong to another package (an
  // app that contains the folder). Only a package that is already an
  // integration is found from a subfolder; the first add runs in the package.
  const here = path.resolve(cwd ?? process.cwd());
  if (existingManifest == null && path.resolve(packageDir) !== here) {
    throw new AstryxError(
      `${here} has no package.json. The nearest is ${packageFile} (${owner}), which is not an Astryx integration yet. Run this in your integration package's own directory, next to its package.json.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const manifestFile =
    existingManifest ?? path.join(packageDir, 'astryx.integration.mjs');
  return {
    packageDir,
    packageFile,
    pkg,
    owner,
    manifestFile,
    manifestExists: existingManifest != null,
  };
}

/**
 * Load the current manifest's parsed object (or an empty object when no
 * manifest exists yet).
 * @param {string} manifestFile
 * @param {boolean} manifestExists
 * @returns {Promise<import('../../authoring/integration/type').AstryxIntegration>}
 */
export async function loadCurrentManifest(manifestFile, manifestExists) {
  if (!manifestExists) return {};
  return loadManifestObject(
    manifestFile,
    `Integration manifest ${path.basename(manifestFile)}`,
    {fresh: true},
  );
}

/**
 * Build and return the common receipt shape.
 * @template {import('./integration-authoring.type.mjs').IntegrationAddData['kind'] | import('../icon/icon.type.mjs').IconNewData['kind']} K
 * @param {K} kind
 * @param {string} name
 * @param {{path: string, created: boolean}|null} root
 * @param {string} manifestPath
 * @param {string[]} files
 * @param {boolean} dryRun
 * @returns {{type: 'integration.add', data: Omit<import('./integration-authoring.type.mjs').IntegrationAddData, 'kind'> & {kind: K, icons?: number, refreshed?: boolean, renamed?: Array<{from: string, to: string}>, mapped?: Array<{definition: string, icon: string}>, suggestions?: Array<{definition: string, icon: string, word: string}>, notes?: string[]}}}
 */
export function receipt(kind, name, root, manifestPath, files, dryRun) {
  return {
    type: 'integration.add',
    data: {
      kind,
      name,
      root,
      manifest: manifestPath,
      files,
      written: !dryRun,
      dryRun,
    },
  };
}

/** @param {string} slug */
export function kebabToTitle(slug) {
  const words = slug.split(/[-_]+/u).filter(Boolean);
  if (words.length === 0) return slug;
  return words.map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}
