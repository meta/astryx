// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration codemod discovery.
 *
 * Integrations may declare a `codemods` directory in their manifest. The
 * directory layout is version-folder-first:
 *
 *   <codemodsRoot>/<version>/<id>.<ext>
 *
 * where `<version>` is the immediate folder name (e.g. "0.2.0") and `<id>` is
 * the codemod module's relative path under that version folder WITHOUT its
 * extension (kebab-case; may include nested segments like "config/rename").
 * Each module DEFAULT-EXPORTS a codemod envelope — a plain object stamped with
 * a `type` of `'code'` or `'config'`. Validation happens here at the load
 * boundary via `loadModuleWithParser` + `parseCodemod`.
 *
 * Version selection mirrors the core registry's getTransformsBetween(from,to):
 * a codemod under folder X runs when upgrading to include X.
 *
 * Strictness: a module whose default export is a stamped codemod envelope is
 * validated at the load boundary — a bad field, schema violation, or duplicate
 * id is a hard error so the upgrade fails loudly rather than silently skipping
 * migrations. Modules that are NOT codemods — co-located helpers with no
 * codemod default export, and test/spec files — are skipped, so an integration
 * can keep tests and shared transform helpers next to its codemods.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {importUserModule} from '../../foundation/fs/module-loader.mjs';
import {parseCodemod} from '../../authoring/codemod/parse.mjs';
import {semverCompare} from '../../foundation/env/semver.mjs';

/** File extensions recognized as codemod modules. */
const CODEMOD_EXTENSIONS = ['.ts', '.mjs', '.js'];

/**
 * Whether a module looks like a codemod at all: it must DEFAULT-EXPORT an
 * object. A module with no default export — or a non-object default, e.g. a
 * named-export-only helper or one that default-exports a function — is a
 * co-located helper, not a codemod, and is skipped. A module that does
 * default-export an object IS treated as a codemod and validated at the load
 * boundary, so a genuinely broken codemod (bad/missing field, no `type`) still
 * fails loudly rather than being silently skipped.
 * @param {unknown} value
 * @returns {boolean}
 */
function hasCodemodDefault(value) {
  return value != null && typeof value === 'object';
}

/**
 * Directories never walked for codemods: a test directory beside a transform is
 * the natural place to put its test, and every file found here is loaded and
 * validated as a codemod.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '__tests__',
  '__fixtures__',
]);

/**
 * Whether a file name is a test or fixture rather than a codemod.
 *
 * The trap this closes: EVERY `.ts`/`.mjs`/`.js` under a version folder used to
 * be loaded as a codemod, so a test file colocated with its transform failed
 * validation and — because a definition error is a hard error — took every
 * codemod in that package's version with it. `astryx upgrade` then applied no
 * transforms and reported success, which is the worst shape a failure can take.
 *
 * Core's own codemods never hit this: they are enumerated in a registry, and
 * their colocated tests are simply not in it. Only integrations are discovered
 * by walking a directory, so only integrations carry the landmine — which is why
 * this is a loader fix and not a documentation one. It protects the integrations
 * that already exist, which no authoring tool can reach.
 *
 * @param {string} name a file's base name
 * @returns {boolean}
 */
function isTestFile(name) {
  return /\.(test|spec)\.[^.]+$/.test(name) || /\.fixture\.[^.]+$/.test(name);
}

/**
 * Recursively collect codemod module files under a version folder. Returns
 * entries of {id, file} where id is the extension-less relative path
 * (POSIX-style) under `versionDir`.
 * @param {string} versionDir
 * @returns {Array<{id: string, file: string}>}
 */
function collectCodemodFiles(versionDir) {
  /** @type {Array<{id: string, file: string}>} */
  const out = [];

  /** @param {string} dir */
  function walk(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      const ext = path.extname(entry.name);
      if (!CODEMOD_EXTENSIONS.includes(ext)) continue;
      if (isTestFile(entry.name)) continue;
      const rel = path.relative(versionDir, full);
      const id = rel
        .slice(0, rel.length - ext.length)
        .split(path.sep)
        .join('/');
      out.push({id, file: full});
    }
  }

  walk(versionDir);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Discover file-based codemods contributed by configured integrations.
 *
 * @param {Array<{name?: string, codemods?: string, __spec?: string}>} loadedIntegrations
 * @returns {Promise<Map<string, Array<{id: string, type: 'code'|'config', codemod: object, package: string}>>>}
 *   Map keyed by version string; each value is the list of discovered codemods
 *   for that version (across all integrations).
 */
export async function discoverIntegrationCodemods(loadedIntegrations = []) {
  /** @type {Map<string, Array<{id: string, type: 'code'|'config', codemod: object, package: string}>>} */
  const byVersion = new Map();

  for (const integration of loadedIntegrations ?? []) {
    const root = integration?.codemods;
    if (!root) continue;

    const pkgLabel = integration.name ?? integration.__spec ?? 'integration';

    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new Error(
        `Integration "${pkgLabel}" declares a codemods directory that does not exist: ${root}`,
      );
    }

    const versionFolders = fs
      .readdirSync(root, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    // Track ids seen ACROSS versions within this package — duplicate id across
    // versions within a package is a hard error (locked decision).
    /** @type {Map<string, string>} id -> version */
    const idToVersion = new Map();

    for (const version of versionFolders) {
      const versionDir = path.join(root, version);
      const files = collectCodemodFiles(versionDir);

      // Track ids within this package+version to catch same-version dupes.
      const seenInVersion = new Set();

      for (const {id, file} of files) {
        const label = `Integration "${pkgLabel}" codemod ${version}/${id} (${file})`;

        // Identify codemods by shape, not by "every module in the tree": a
        // codemod DEFAULT-EXPORTS an object. A co-located helper (named exports
        // only, or a default-exported function) is skipped rather than failing
        // the whole integration's discovery. A module that does default-export
        // an object is still validated below and fails loudly if it is not a
        // valid codemod envelope.
        const mod = await importUserModule(file);
        if (!hasCodemodDefault(mod?.default)) continue;

        if (seenInVersion.has(id)) {
          throw new Error(
            `Integration "${pkgLabel}" has a duplicate codemod id "${id}" within version ${version}.`,
          );
        }
        seenInVersion.add(id);

        const priorVersion = idToVersion.get(id);
        if (priorVersion != null && priorVersion !== version) {
          throw new Error(
            `Integration "${pkgLabel}" reuses codemod id "${id}" across versions ${priorVersion} and ${version}. Codemod ids must be unique within a package.`,
          );
        }
        idToVersion.set(id, version);

        // Stamped as a codemod but otherwise invalid is a genuinely broken
        // codemod: parseCodemod throws loudly here.
        const codemod = parseCodemod(mod.default, label);

        const entry = {
          id,
          type: codemod.type,
          codemod,
          package: pkgLabel,
        };
        const list = byVersion.get(version);
        if (list) {
          list.push(entry);
        } else {
          byVersion.set(version, [entry]);
        }
      }
    }
  }

  return byVersion;
}

/**
 * Select discovered integration codemods that apply when upgrading from
 * `from` (exclusive) to `to` (inclusive), ordered ascending by version.
 *
 * @param {Map<string, Array<object>>} byVersion
 * @param {string} from
 * @param {string} to
 * @returns {Array<{version: string, codemods: Array<object>}>}
 */
export function selectIntegrationCodemods(byVersion, from, to) {
  const versions = [...byVersion.keys()].sort(semverCompare);
  /** @type {Array<{version: string, codemods: Array<object>}>} */
  const results = [];
  for (const version of versions) {
    if (semverCompare(version, from) > 0 && semverCompare(version, to) <= 0) {
      const codemods = byVersion.get(version);
      if (codemods) results.push({version, codemods});
    }
  }
  return results;
}
