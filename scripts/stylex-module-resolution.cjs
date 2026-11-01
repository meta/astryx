// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @file stylex-module-resolution.cjs
 * @input An import specifier in a file StyleX compiles, and the importing file
 * @output StyleX's `unstable_moduleResolution` for this workspace: a `custom`
 *   resolution whose `filePathResolver` maps a workspace package specifier to
 *   that package's `exports` `source` target, and whose `getCanonicalFilePath`
 *   is StyleX's own (`<package name>:<path inside the package>`).
 * @position Shared by every StyleX config that compiles source importing a
 *   workspace package's `.stylex` files (the package builds, Vitest, Storybook,
 *   Sandbox, the docsite, the vibe-test apps).
 *
 * StyleX names a `defineMarker`, `defineConsts` or hashed `defineVars` export
 * after the file that defines it, and an import site resolves its specifier to
 * compute the same name. Its built-in `commonJS` resolution tries a bare
 * specifier through Node resolution before any alias, so once core is built,
 * `@astryxdesign/core/Indicator/indicator.markers.stylex` resolves through
 * core's `exports` "default" to `dist/…stylex.js`, while core names the marker
 * after `src/…stylex.ts`. The two names differ, and a compile-time
 * `stylex.when.ancestor()` on a core marker never matches. Resolving workspace
 * specifiers to their `source` export names every export after the file the
 * package's own build compiles.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOTS = ['packages', 'packages/themes', 'internal'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const isFile = file => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};
// As StyleX's own resolution: the path itself, then its base (without a code
// extension, which a build may have added: `tokens.stylex.js`) with each one.
const firstFile = file => {
  const extension = path.extname(file);
  const base = EXTENSIONS.includes(extension)
    ? file.slice(0, -extension.length)
    : file;
  return [file, ...EXTENSIONS.map(ext => base + ext)].find(isFile);
};

/** Workspace packages by name: their directory and `exports`. */
function readWorkspacePackages(root, workspaceRoots) {
  const packages = new Map();
  for (const workspaceRoot of workspaceRoots) {
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(root, workspaceRoot), {
        withFileTypes: true,
      });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, workspaceRoot, entry.name);
      try {
        const json = JSON.parse(
          fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
        );
        if (json.name) packages.set(json.name, {dir, exports: json.exports});
      } catch {
        // Not a package.
      }
    }
  }
  return packages;
}

/** A workspace specifier's `source` export (or `src/<subpath>`), if any. */
function workspaceSource(packages, specifier) {
  const match = /^(@[^/]+\/[^/]+|[^./][^/]*)(?:\/(.+))?$/.exec(specifier);
  const pkg = match && packages.get(match[1]);
  if (!pkg) return undefined;
  const target = pkg.exports?.[match[2] ? `./${match[2]}` : '.'];
  if (
    target != null &&
    typeof target === 'object' &&
    typeof target.source === 'string'
  ) {
    return firstFile(path.join(pkg.dir, target.source));
  }
  return match[2] ? firstFile(path.join(pkg.dir, 'src', match[2])) : undefined;
}

/** Candidate paths for `specifier` from StyleX `aliases` (absolute targets). */
function aliasTargets(specifier, aliases) {
  const targets = [];
  for (const [alias, values] of Object.entries(aliases ?? {})) {
    const [before, after = ''] = alias.split('*');
    const matches = alias.includes('*')
      ? specifier.startsWith(before) && specifier.endsWith(after)
      : specifier === alias;
    if (!matches) continue;
    const rest = alias.includes('*')
      ? specifier.slice(before.length, specifier.length - after.length)
      : '';
    for (const value of values) {
      const target = value.split('*').join(rest);
      if (path.isAbsolute(target)) targets.push(target);
    }
  }
  return targets;
}

/** StyleX's `filePathResolver`: the file an import of a `.stylex` file names. */
function resolveFilePath(packages, importPath, sourceFilePath, aliases) {
  if (importPath.startsWith('.')) {
    return firstFile(path.resolve(path.dirname(sourceFilePath), importPath));
  }
  const source = workspaceSource(packages, importPath);
  if (source) return source;
  for (const target of aliasTargets(importPath, aliases)) {
    const file = firstFile(target);
    if (file) return file;
  }
  for (const candidate of [
    importPath,
    ...EXTENSIONS.map(ext => importPath + ext),
  ]) {
    try {
      return require.resolve(candidate, {
        paths: [path.dirname(sourceFilePath)],
      });
    } catch {
      // Try the next extension.
    }
  }
  return undefined;
}

/**
 * StyleX's own canonical name for a file: `<package name>:<path inside the
 * package>` from the nearest package.json (the name a package's own build gives
 * its exports), or the path from the repository root outside any package.
 */
function canonicalFilePath(root, filePath) {
  let dir = path.dirname(filePath);
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      const {name} = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      return `${name}:${path.relative(dir, filePath)}`;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return path.relative(root, filePath);
    dir = parent;
  }
}

/**
 * The resolution for a workspace at `root` whose packages sit one level below
 * `workspaceRoots` (this repository's by default; a test passes a fixture).
 */
function createStylexModuleResolution({
  root = ROOT,
  workspaceRoots = WORKSPACE_ROOTS,
} = {}) {
  let packages = null;
  const workspace = () =>
    (packages ??= readWorkspacePackages(root, workspaceRoots));
  return {
    type: 'custom',
    filePathResolver: (importPath, sourceFilePath, aliases) =>
      resolveFilePath(workspace(), importPath, sourceFilePath, aliases),
    getCanonicalFilePath: filePath => canonicalFilePath(root, filePath),
  };
}

const stylexModuleResolution = createStylexModuleResolution();

module.exports = {stylexModuleResolution, createStylexModuleResolution};
