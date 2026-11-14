// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's check that each component example runs on its own unless it
 *   is `kind: 'setup'`, judged by the rule a live preview uses.
 * @input A loaded integration: its components root, package directory and
 *   package.json, and the Core and React installed beside it.
 * @output A note for each example `previewableExample` refuses, with its
 *   fix, and the examples whose names could not be judged.
 * @position foundation/integrations, beside the other contribution
 *   validators; run by `astryx doctor integration validate` (and so by
 *   `integration check`) through api/integration/validate-integration.mjs,
 *   which marks the notes `next`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {previewableExample} from '../../authoring/example/preview.mjs';
import {findProjectCoreDir} from '../fs/paths.mjs';
import {
  CORE_PACKAGE,
  discoverComponents,
  discoverIntegrationComponents,
  resolveIntegrationImportPath,
} from '../discovery/component-discovery.mjs';
import {discoverHooks} from '../discovery/hook-discovery.mjs';
import {loadComponentDoc} from '../discovery/component-loader.mjs';
import {
  declaredTargets,
  readImports,
  splitSpecifier,
} from './public-imports.mjs';
import {isRecord, subpathDeclaration} from './exports-subpaths.mjs';

/**
 * @typedef {{code: string, message: string}} ExampleCodeNote
 * @typedef {{file: string, example: string, reason: string}} ExampleCodeUnchecked
 * @typedef {import('../../authoring/example/type.ts').ExampleScope} ExampleScope
 */

/** @param {string} from @param {string} to */
function rel(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

/**
 * @param {string} packageDir
 * @returns {Record<string, unknown> | null}
 */
function readManifest(packageDir) {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The packages a manifest declares an app installs with it.
 * @param {Record<string, unknown>} manifest
 * @returns {string[]}
 */
function declaredPackages(manifest) {
  return ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap(
    field => (isRecord(manifest[field]) ? Object.keys(manifest[field]) : []),
  );
}

/**
 * React's named exports, as the package resolves React.
 * @param {string} packageDir
 * @returns {string[] | null} null when React cannot be loaded
 */
function reactExports(packageDir) {
  try {
    const require = createRequire(path.join(packageDir, 'package.json'));
    return Object.keys(require('react'));
  } catch {
    return null;
  }
}

/**
 * Each component and hook Core documents, from the Core installed beside the
 * package.
 * @param {string} packageDir
 * @returns {Array<{name: string, import: string}> | null} null when no Core
 *   is installed, or its docs cannot be read
 */
function coreNames(packageDir) {
  const coreDir = findProjectCoreDir(packageDir);
  if (!coreDir) return null;
  try {
    const names = [
      ...Object.values(discoverComponents(coreDir)).flat(),
      ...Object.values(discoverHooks(coreDir)).flat(),
    ];
    return [...new Set(names)].map(name => ({name, import: CORE_PACKAGE}));
  } catch {
    return null;
  }
}

/**
 * Whether an import of the package's own name loads a module that imports
 * `server-only`, the marker of code that runs only on a server.
 * @param {string} packageDir
 * @param {string} packageName
 * @param {unknown} exportsField
 * @returns {(specifier: string) => boolean}
 */
function ownServerModules(packageDir, packageName, exportsField) {
  /** @type {Map<string, boolean>} */
  const known = new Map();
  return specifier => {
    const parts = splitSpecifier(specifier);
    if (!parts || parts.pkg !== packageName) return false;
    const cached = known.get(parts.subpath);
    if (cached !== undefined) return cached;
    const {files} = declaredTargets(
      packageDir,
      subpathDeclaration(exportsField, parts.subpath),
    );
    const serverOnly = files.some(file => {
      try {
        return readImports(fs.readFileSync(file, 'utf8')).some(
          statement =>
            statement.source === 'server-only' && !statement.typeOnly,
        );
      } catch {
        return false;
      }
    });
    known.set(parts.subpath, serverOnly);
    return serverOnly;
  };
}

/**
 * Check every example of every component doc the package ships.
 * @param {any} integration a loaded integration
 * @returns {Promise<{notes: ExampleCodeNote[], unchecked: ExampleCodeUnchecked[]}>}
 */
export async function exampleCodeCheck(integration) {
  /** @type {ExampleCodeNote[]} */
  const notes = [];
  /** @type {ExampleCodeUnchecked[]} */
  const unchecked = [];
  const packageDir = integration?.__packageDir;
  const manifest = packageDir ? readManifest(packageDir) : null;
  const packageName = typeof manifest?.name === 'string' ? manifest.name : null;
  if (!packageDir || !manifest || !packageName) return {notes, unchecked};
  /** @type {ReturnType<typeof discoverIntegrationComponents>} */
  let records;
  try {
    records = discoverIntegrationComponents(integration);
  } catch {
    return {notes, unchecked}; // an unreadable root is reported elsewhere
  }
  /** @type {Map<string, any>} */
  const docs = new Map();
  for (const record of records) {
    if (docs.has(record.docPath)) continue;
    try {
      const doc = await loadComponentDoc(record.docPath);
      if (isRecord(doc)) docs.set(record.docPath, doc);
    } catch {
      // A doc that does not load is reported by the doc validators.
    }
  }
  const exportsField = manifest.exports ?? null;
  const react = reactExports(packageDir);
  const core = coreNames(packageDir);
  /** @type {ExampleScope} */
  const scope = {
    packageName,
    packageNames: records.map(record => ({
      name: record.name,
      import: resolveIntegrationImportPath(
        {
          exportsMap: /** @type {any} */ (exportsField),
          packageDir,
          docPath: record.docPath,
          packageName,
        },
        record.name,
        typeof docs.get(record.docPath)?.import === 'string'
          ? docs.get(record.docPath).import
          : null,
      ),
    })),
    coreNames: core ?? [],
    reactNames: react ?? [],
    dependencies: declaredPackages(manifest),
    isServerOnly: ownServerModules(packageDir, packageName, exportsField),
  };
  // Without Core or React, a name either provides cannot be told from an
  // undefined one.
  const missing =
    core == null
      ? "Core's docs cannot be read beside the package"
      : react == null
        ? 'React cannot be loaded from the package'
        : null;
  for (const [docPath, doc] of docs) {
    const shownDoc = rel(packageDir, docPath);
    const entries = [
      doc,
      ...(Array.isArray(doc.components) ? doc.components : []),
    ].filter(isRecord);
    for (const entry of entries) {
      const examples = Array.isArray(entry.examples) ? entry.examples : [];
      for (const [index, example] of examples.entries()) {
        if (!isRecord(example) || typeof example.code !== 'string') continue;
        const label =
          typeof example.label === 'string'
            ? `"${example.label}"`
            : `#${index + 1}`;
        const shown =
          entry === doc || typeof entry.name !== 'string'
            ? `example ${label}`
            : `${entry.name} example ${label}`;
        /** @type {import('../../authoring/example/type.ts').PreviewableExample} */
        let read;
        try {
          read = previewableExample(
            {code: example.code, kind: example.kind},
            scope,
          );
        } catch (error) {
          unchecked.push({
            file: shownDoc,
            example: label,
            reason: `it could not be read: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }
        if (read.previewable || read.setup) continue;
        for (const problem of read.problems) {
          if (problem.code === 'example_undefined_name' && missing) {
            unchecked.push({
              file: shownDoc,
              example: label,
              reason: `${missing}, so its names ${(problem.names ?? []).join(', ')} cannot be judged`,
            });
            continue;
          }
          notes.push({
            code: problem.code,
            message: `Component doc "${shownDoc}" ${shown} ${problem.message}. Fix: ${problem.fix}`,
          });
        }
      }
    }
  }
  return {notes, unchecked};
}
