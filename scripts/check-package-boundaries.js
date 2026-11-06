#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Package Boundary Check
 *
 * Keeps package-specific APIs out of the core package. Core should expose
 * primitive XDS building blocks; shell/common wrappers belong in their owning
 * package so consumers do not get parallel implementations.
 *
 * Also keeps core and the experimental native package apart (AST-082 FR14,
 * FR16): core never imports @astryxdesign/native, and no file anywhere in
 * packages/native/ imports core outside the portable entry. Until core ships
 * that entry, NATIVE_CORE_EXCEPTIONS names each build-time read of core that
 * is allowed (AST-082 FR16): two theme entries imported by build scripts,
 * core's locale catalogs imported by the Swift strings generator, and core's
 * component documentation and built-in icon names read as data by one loader.
 * Any other import of core fails, as does any other path to core's package
 * that CORE_PACKAGE_PATH recognizes. The check reads source text; it does not
 * follow paths computed in other ways.
 */

const fs = require('node:fs');
const path = require('node:path');

// Static and dynamic imports, require, require.resolve, and
// import.meta.resolve.
const IMPORT_SPECIFIER =
  /\b(?:from|import|require|require\.resolve|import\.meta\.resolve)\s*\(?\s*['"]([^'"]+)['"]/g;
const CORE_SOURCE = /\.(ts|tsx)$/;
const NATIVE_SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
// Installed dependencies, build output, and Swift build state hold no native
// source of their own.
const NATIVE_SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.build',
  '.swiftpm',
]);
// A path built to core's package, as adjacent string segments or inside one
// string: its installed copy ('@astryxdesign', 'core'; 'node_modules',
// '@astryxdesign/core'; or node_modules/@astryxdesign/core) or its workspace
// source ('packages', 'core'; or packages/core).
const CORE_PACKAGE_PATH =
  /['"](?:@astryxdesign|packages)['"]\s*,\s*['"]core['"]|['"]node_modules['"]\s*,\s*['"]@astryxdesign\/core\b|['"`][^'"`]*(?:node_modules\/@astryxdesign|\bpackages)\/core\b/g;

/**
 * The interim exceptions to AST-082 FR16: build-time reads of core that
 * native makes before core's portable entry exists. Each one ends when the
 * portable entry ships. Adding one is a reviewed change to this list.
 */
const NATIVE_CORE_EXCEPTIONS = Object.freeze({
  // Imports of core by build scripts, each scoped to a folder or one file.
  imports: Object.freeze([
    // The Swift theme generator resolves a theme's tokens through core's theme
    // entries (native theme generator spec, G2).
    Object.freeze({
      name: 'theme entries',
      directory: 'packages/native/scripts',
      specifiers: Object.freeze([
        '@astryxdesign/core/theme',
        '@astryxdesign/core/theme/tokens',
      ]),
    }),
    // The Swift strings generator reads core's locale catalogs, through core's
    // public ./locales/*.json export.
    Object.freeze({
      name: "core's locale catalogs",
      file: 'packages/native/scripts/swift-ios-strings.mjs',
      specifiers: Object.freeze([
        /^@astryxdesign\/core\/locales\/[\w-]+\.json$/,
      ]),
    }),
  ]),
  // Core's files that native reads as data, each by name, through one loader
  // that roots every read at its CORE_ROOT.
  data: Object.freeze({
    reader: 'packages/native/scripts/core-docs.mjs',
    reads: Object.freeze([
      // A component's documentation, the source of the native contracts.
      Object.freeze({
        name: 'component documentation',
        path: /^'src', `\$\{\w+\}\.doc\.mjs`$/,
      }),
      // Core's built-in icon names, for the native icon coverage test (FR17).
      Object.freeze({
        name: 'built-in icon names',
        path: /^'src', 'Icon', 'globalIconRegistry\.tsx'$/,
      }),
    ]),
  }),
});
// A path the data reader builds from its CORE_ROOT; the group is everything
// after CORE_ROOT, with whitespace collapsed before matching.
const CORE_ROOT_READ =
  /\bpath\.(?:join|resolve)\(\s*CORE_ROOT\s*,\s*([^)]*?)\s*,?\s*\)/g;

function corePackagePaths(content) {
  return (content.match(CORE_PACKAGE_PATH) ?? []).length;
}

function walk(dir, extensions, skipped, visit) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipped.has(entry.name)) walk(fullPath, extensions, skipped, visit);
      continue;
    }
    if (extensions.test(entry.name)) visit(fullPath);
  }
}

function importsOf(content) {
  return [...content.matchAll(IMPORT_SPECIFIER)].map(match => match[1]);
}

function matchesPackage(resolved, prefixes) {
  return prefixes.some(
    prefix => resolved === prefix || resolved.startsWith(`${prefix}/`),
  );
}

function resolveSpecifier(root, filePath, specifier) {
  return specifier.startsWith('.')
    ? path
        .relative(root, path.resolve(path.dirname(filePath), specifier))
        .split(path.sep)
        .join('/')
    : specifier;
}

function isAllowedNativeImport(relPath, specifier) {
  return NATIVE_CORE_EXCEPTIONS.imports.some(
    exception =>
      (exception.file
        ? relPath === exception.file
        : relPath.startsWith(`${exception.directory}/`)) &&
      exception.specifiers.some(allowed =>
        typeof allowed === 'string'
          ? allowed === specifier
          : allowed.test(specifier),
      ),
  );
}

function checkCoreFile(root, filePath, violations) {
  const relPath = path.relative(root, filePath);
  const basename = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  if (/^XDSCommon[A-Z]/.test(basename)) {
    violations.push({
      file: relPath,
      message:
        'XDSCommon* files belong in the common package, not @astryxdesign/core.',
    });
  }

  content.split('\n').forEach((line, index) => {
    if (
      /^\s*export\s+(?:declare\s+)?(?:class|const|function|interface|type)\s+XDSCommon[A-Z]/.test(
        line,
      )
    ) {
      violations.push({
        file: `${relPath}:${index + 1}`,
        message:
          'Exported XDSCommon* APIs belong in the common package, not @astryxdesign/core.',
      });
    }
  });

  for (const specifier of importsOf(content)) {
    const resolved = resolveSpecifier(root, filePath, specifier);
    if (matchesPackage(resolved, ['@astryxdesign/native', 'packages/native'])) {
      violations.push({
        file: relPath,
        message: `@astryxdesign/core must never import @astryxdesign/native. (imports "${specifier}")`,
      });
    }
  }
}

function checkNativeFile(root, filePath, violations) {
  const relPath = path.relative(root, filePath).split(path.sep).join('/');
  const content = fs.readFileSync(filePath, 'utf8');

  for (const specifier of importsOf(content)) {
    const resolved = resolveSpecifier(root, filePath, specifier);
    if (
      matchesPackage(resolved, ['@astryxdesign/core', 'packages/core']) &&
      !isAllowedNativeImport(relPath, specifier)
    ) {
      violations.push({
        file: relPath,
        message: `@astryxdesign/native must not import core outside the portable entry or a listed build-time exception. (imports "${specifier}")`,
      });
    }
  }

  // A declaration file runs nothing, so it reads nothing.
  if (/\.d\.[cm]?ts$/.test(relPath)) return;

  const {data} = NATIVE_CORE_EXCEPTIONS;
  if (relPath !== data.reader) {
    if (corePackagePaths(content) > 0 || /\bCORE_ROOT\b/.test(content)) {
      violations.push({
        file: relPath,
        message: `@astryxdesign/native reads core's package as data only through ${data.reader}.`,
      });
    }
    return;
  }

  // The reader roots core at one place, its CORE_ROOT definition, so a second
  // root cannot read around the listed reads.
  if (corePackagePaths(content) > 1) {
    violations.push({
      file: relPath,
      message:
        'The data reader may build one path to core, its CORE_ROOT; every read must go through CORE_ROOT.',
    });
  }

  // Every use of CORE_ROOT beyond its definition must be one of the listed
  // reads.
  let reads = 0;
  for (const match of content.matchAll(CORE_ROOT_READ)) {
    const read = match[1].replace(/\s+/g, ' ');
    reads++;
    if (!data.reads.some(listed => listed.path.test(read))) {
      violations.push({
        file: relPath,
        message: `@astryxdesign/native reads an unlisted file of core (CORE_ROOT, ${read}); listed reads: ${data.reads.map(listed => listed.name).join(', ')}.`,
      });
    }
  }
  const uses = (content.match(/\bCORE_ROOT\b/g) ?? []).length;
  if (uses - 1 > reads) {
    violations.push({
      file: relPath,
      message:
        'CORE_ROOT is used outside path.join(CORE_ROOT, ...); every read of core must be a listed read.',
    });
  }
}

/** Every package-boundary violation under `root`, a repository checkout. */
function findViolations(root) {
  const violations = [];
  const coreSrc = path.join(root, 'packages/core/src');
  const nativeRoot = path.join(root, 'packages/native');

  if (fs.existsSync(coreSrc)) {
    walk(coreSrc, CORE_SOURCE, new Set(), filePath =>
      checkCoreFile(root, filePath, violations),
    );
  }
  if (fs.existsSync(nativeRoot)) {
    walk(nativeRoot, NATIVE_SOURCE, NATIVE_SKIPPED_DIRECTORIES, filePath =>
      checkNativeFile(root, filePath, violations),
    );
  }
  return violations;
}

module.exports = {findViolations, NATIVE_CORE_EXCEPTIONS};

if (require.main === module) {
  const violations = findViolations(path.resolve(__dirname, '..'));
  if (violations.length === 0) {
    console.log('Package boundaries are clean.');
    process.exit(0);
  }

  console.log(`Found ${violations.length} package boundary violation(s):\n`);
  for (const violation of violations) {
    console.log(`  ${violation.file}: ${violation.message}`);
  }
  console.log(
    '\nMove common shell integrations to their owning package or update the existing wrapper there.',
  );
  process.exit(1);
}
