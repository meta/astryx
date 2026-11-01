// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module, require */

/**
 * One shared path contract for component knowledge records. Every component
 * record, for every package and platform, lives under
 * `docs/specs/components/<ComponentRoot>/`, mirroring the component's source
 * tree: a component root's records sit directly in its folder, and module
 * records keep the subdirectories their code has. Validation, change
 * classification, and the spec-owner gate all read paths through this file, so
 * they cannot disagree about the layout. Classification reads the path alone;
 * `resolveComponentPackage` reads the working tree to find the package that
 * owns a component root.
 */

const fs = require('node:fs');
const path = require('node:path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  COMPONENT_PACKAGES,
  COMPONENT_PACKAGE_NAMES,
} = require('../../scripts/component-packages.cjs');

const COMPONENT_SPEC_ROOT = 'docs/specs/components';

/**
 * Platform implementation languages whose component records sit beside the
 * core record as `<PublicName>.<language>.spec.md`.
 */
const PLATFORM_SPEC_LANGUAGES = Object.freeze(['swift']);

/**
 * Where each platform language keeps its component code, as
 * `<root>/<Module>/<ComponentRoot>/…`.
 */
const PLATFORM_SOURCE_ROOTS = Object.freeze({
  swift: 'packages/native/apple/Sources',
});

const IGNORED_COMPONENT_KNOWLEDGE_SEGMENTS = new Set([
  '__fixtures__',
  '__generated__',
  '__snapshots__',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'fixtures',
  'generated',
  'node_modules',
  'test',
  'test-utils',
  'tests',
]);

function normalizePath(filePath) {
  return String(filePath).replaceAll('\\', '/').replace(/^\.\//, '');
}

function isIgnoredComponentKnowledgeSegment(segment) {
  return (
    segment.startsWith('.') || IGNORED_COMPONENT_KNOWLEDGE_SEGMENTS.has(segment)
  );
}

/**
 * The segments of a candidate below `docs/specs/components/`, or null when the
 * path is outside that root, sits directly in it, or crosses an ignored segment.
 */
function componentSpecSegments(filePath) {
  const normalized = normalizePath(filePath);
  const prefix = `${COMPONENT_SPEC_ROOT}/`;
  if (!normalized.startsWith(prefix) || !normalized.endsWith('.spec.md')) {
    return null;
  }
  const segments = normalized.slice(prefix.length).split('/');
  if (segments.length < 2) return null;
  if (segments.some(isIgnoredComponentKnowledgeSegment)) return null;
  if (segments.at(-1).endsWith('.generated.spec.md')) return null;
  return segments;
}

/**
 * Classify a canonical component knowledge candidate by path alone. A record
 * directly in `docs/specs/components/<ComponentRoot>/` is a component record;
 * one nested deeper is a module record. Semantic kind, filename/id agreement,
 * the owning package, and parent ownership are validated after parsing.
 */
function classifyComponentKnowledgePath(filePath) {
  const segments = componentSpecSegments(filePath);
  if (!segments) return null;
  const fileName = segments.at(-1);
  const publicName = fileName.slice(0, -'.spec.md'.length);
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(publicName)) return null;
  return {
    componentRoot: segments[0],
    fileName,
    kind: segments.length === 2 ? 'component' : 'module',
    publicName,
    relativePath: segments.slice(1).join('/'),
  };
}

/**
 * Classify a platform implementation's component record,
 * `docs/specs/components/<ComponentRoot>/<PublicName>.<language>.spec.md`.
 */
function classifyPlatformComponentSpecPath(filePath) {
  const segments = componentSpecSegments(filePath);
  if (!segments || segments.length !== 2) return null;
  const match = /^([A-Za-z][A-Za-z0-9]*)\.([a-z][a-z0-9-]*)\.spec\.md$/.exec(
    segments[1],
  );
  if (!match || !PLATFORM_SPEC_LANGUAGES.includes(match[2])) return null;
  return {
    componentRoot: segments[0],
    fileName: segments[1],
    language: match[2],
    publicName: match[1],
  };
}

/**
 * A spec file at a location component records used before they moved to
 * `docs/specs/components/`: inside a registered component package's `src`, or
 * beside a Swift view under `packages/native/apple/Sources/`. Such a file is
 * not a record, but change classification treats it as knowledge so the owner
 * gate fails closed for a branch that still edits one: on merge, rename
 * detection carries that edit into the record's new location.
 */
function isLegacyComponentSpecPath(filePath) {
  const normalized = normalizePath(filePath);
  if (!normalized.endsWith('.spec.md')) return false;
  if (normalized.endsWith('.generated.spec.md')) return false;
  const nativeMatch = /^packages\/native\/apple\/Sources\/(.+)$/.exec(
    normalized,
  );
  const sourceMatch = /^packages\/([^/]+)\/src\/(.+)$/.exec(normalized);
  let segments;
  if (nativeMatch) {
    segments = nativeMatch[1].split('/');
  } else if (sourceMatch && COMPONENT_PACKAGE_NAMES.includes(sourceMatch[1])) {
    segments = sourceMatch[2].split('/');
  } else {
    return false;
  }
  if (segments.some(isIgnoredComponentKnowledgeSegment)) return false;
  return /^[A-Za-z][A-Za-z0-9]*\.spec\.md$/.test(segments.at(-1));
}

function isComponentSpecRecordPath(filePath) {
  return classifyComponentKnowledgePath(filePath) !== null;
}

function isPlatformComponentSpecPath(filePath) {
  return classifyPlatformComponentSpecPath(filePath) !== null;
}

/**
 * A platform language's component code file:
 * `<source root>/<Module>/<ComponentRoot>/…/<file>`. Returns the language,
 * component root, and file stem; null for any other path, a spec file, or a
 * file in an ignored directory.
 */
function locatePlatformComponentSource(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized.endsWith('.md')) return null;
  for (const [language, sourceRoot] of Object.entries(PLATFORM_SOURCE_ROOTS)) {
    if (!normalized.startsWith(`${sourceRoot}/`)) continue;
    const segments = normalized.slice(sourceRoot.length + 1).split('/');
    if (segments.length < 3) return null;
    if (segments.some(isIgnoredComponentKnowledgeSegment)) return null;
    return {
      language,
      componentRoot: segments[1],
      stem: segments.at(-1).split('.')[0],
    };
  }
  return null;
}

/**
 * Exact-case directory entries, so a case-insensitive file system agrees with
 * CI. Read fresh on every call: callers resolve a few hundred records at most,
 * and a cache would go stale when a caller writes files between lookups.
 */
function directoryEntries(directory) {
  try {
    return new Map(
      fs
        .readdirSync(directory, {withFileTypes: true})
        .map(entry => [entry.name, entry.isDirectory() ? 'dir' : 'file']),
    );
  } catch {
    return new Map();
  }
}

function hasEntry(directory, name, type) {
  return directoryEntries(directory).get(name) === type;
}

/** True when `relativeDirectory` (posix, may be '.') exists below `base`, exact case. */
function hasDirectoryPath(base, relativeDirectory) {
  let current = base;
  for (const segment of relativeDirectory.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (!hasEntry(current, segment, 'dir')) return false;
    current = path.join(current, segment);
  }
  return true;
}

/**
 * The registered package that owns a classified component record. A package
 * can own the record's component root when it has `src/<ComponentRoot>/`, or,
 * for a flat package, a `src/<ComponentRoot>` module. When more than one
 * package has that root (Core and Lab both keep a `Chat/`), the owner is the
 * one that holds the record's code: the same-stem `<PublicName>.doc.mjs` of a
 * component record, or the mirrored directory of a module record. Null when no
 * package, or more than one, owns it.
 */
function resolveComponentPackage(root, classified) {
  const {componentRoot, kind, publicName, relativePath} = classified;
  const candidates = COMPONENT_PACKAGES.filter(pkg => {
    const source = path.join(root, pkg.src);
    if (hasEntry(source, componentRoot, 'dir')) return true;
    return (
      pkg.layout === 'flat' &&
      ['.tsx', '.ts'].some(extension =>
        hasEntry(source, `${componentRoot}${extension}`, 'file'),
      )
    );
  });
  if (candidates.length <= 1) return candidates[0] ?? null;
  const pick = test => {
    const owners = candidates.filter(test);
    return owners.length === 1 ? owners[0] : null;
  };
  if (kind === 'module') {
    // A module record mirrors its code's directory when it has one. One kept
    // in `modules/` belongs to the package holding a same-stem source or doc
    // file (under the component root, or anywhere in a flat package's src),
    // and otherwise to its parent component record's package.
    return (
      pick(pkg =>
        hasDirectoryPath(
          path.join(root, pkg.src, componentRoot),
          path.posix.dirname(relativePath),
        ),
      ) ??
      pick(pkg =>
        hasStemBelow(
          pkg.layout === 'flat'
            ? path.join(root, pkg.src)
            : path.join(root, pkg.src, componentRoot),
          publicName,
        ),
      ) ??
      resolveComponentPackage(root, {
        componentRoot,
        kind: 'component',
        publicName: componentRoot,
        relativePath: `${componentRoot}.spec.md`,
      })
    );
  }
  return pick(pkg => {
    const source = path.join(root, pkg.src);
    const docDirectory =
      pkg.layout === 'flat' && publicName === componentRoot
        ? source
        : path.join(source, componentRoot);
    return hasEntry(docDirectory, `${publicName}.doc.mjs`, 'file');
  });
}

/** True when a file named `<stem>.<ext>` sits anywhere below `directory`. */
function hasStemBelow(directory, stem) {
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const [name, type] of directoryEntries(current)) {
      if (type === 'dir') {
        if (!isIgnoredComponentKnowledgeSegment(name)) {
          pending.push(path.join(current, name));
        }
      } else if (name.split('.')[0] === stem && !name.endsWith('.spec.md')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Classify a component record path and resolve where its code lives:
 * `packageName`, `layout`, `componentSource` (the component root directory, or
 * a flat package's `src`), and `codeDirectory` (the directory the record
 * mirrors). Null when the path is not a record or no package owns its root.
 */
function locateComponentKnowledgePath(root, filePath) {
  const classified = classifyComponentKnowledgePath(filePath);
  if (!classified) return null;
  const pkg = resolveComponentPackage(root, classified);
  if (!pkg) return null;
  const rootDirectory = path.posix.join(pkg.src, classified.componentRoot);
  const nested = path.posix.dirname(classified.relativePath);
  return {
    ...classified,
    packageName: pkg.name,
    layout: pkg.layout,
    componentRootDirectory: rootDirectory,
    componentSourceDirectory: pkg.layout === 'flat' ? pkg.src : rootDirectory,
    codeDirectory:
      classified.kind === 'component' && pkg.layout === 'flat'
        ? pkg.src
        : nested === '.'
          ? rootDirectory
          : path.posix.join(rootDirectory, nested),
  };
}

/**
 * Where a component record for `relativePath` under a package's `src` belongs:
 * `docs/specs/components/<relativePath>` for a directory-layout package, and
 * `docs/specs/components/<Name>/<Name>.spec.md` for a flat package's top-level
 * record.
 */
function componentSpecPathForSource(packageName, relativePath) {
  const pkg = COMPONENT_PACKAGES.find(
    candidate => candidate.name === packageName,
  );
  if (!pkg) return null;
  const segments = normalizePath(relativePath).split('/');
  if (pkg.layout === 'flat' && segments.length === 1) {
    const name = segments[0].replace(/\.spec\.md$/, '');
    return `${COMPONENT_SPEC_ROOT}/${name}/${segments[0]}`;
  }
  return `${COMPONENT_SPEC_ROOT}/${segments.join('/')}`;
}

module.exports = {
  COMPONENT_PACKAGE_NAMES,
  COMPONENT_SPEC_ROOT,
  IGNORED_COMPONENT_KNOWLEDGE_SEGMENTS,
  PLATFORM_SOURCE_ROOTS,
  PLATFORM_SPEC_LANGUAGES,
  classifyComponentKnowledgePath,
  classifyPlatformComponentSpecPath,
  componentSpecPathForSource,
  isComponentSpecRecordPath,
  isIgnoredComponentKnowledgeSegment,
  isLegacyComponentSpecPath,
  isPlatformComponentSpecPath,
  locateComponentKnowledgePath,
  locatePlatformComponentSource,
  resolveComponentPackage,
};
