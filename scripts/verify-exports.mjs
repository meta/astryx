#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.


/**
 * verify-exports.mjs
 *
 * Verifies that all package.json export fields (main, module, types, exports)
 * resolve to files that actually exist on disk. Designed to run AFTER `pnpm build`
 * to catch cases where packages point to dist files that weren't produced.
 *
 * Existence is necessary but not sufficient: an entry file can exist and still be
 * unloadable, because an existence check never opens it. That is how #4620 shipped — every
 * theme's `./built` entry existed while carrying an extensionless relative import
 * that Node cannot resolve. So explicit `import` and `require` targets, plus
 * unconditional runtime targets, are also loaded. Maintained themes additionally
 * assert that their ESM icon companion exists without an unused CommonJS twin.
 * This runs after the build, so a forward reference to something a later pipeline
 * stage produces is already satisfied.
 *
 * Scope, deliberately: importing a module only exercises the specifiers that are
 * evaluated when it loads — its static import graph. A bad specifier inside a
 * `lazy(() => import('...'))` is never reached, so this would NOT have caught
 * #4569 (`await import('@astryxdesign/core/Text')` succeeds on the unfixed bytes
 * even though the Tooltip specifier inside it is broken). Catching that needs a
 * static scan; see scripts/check-fully-specified.mjs.
 *
 * Exit code 1 if any exports are broken.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

/** Fields in package.json that should point to real files */
const TOP_LEVEL_FIELDS = ['main', 'module', 'types'];

/**
 * Export map conditions that reference source files (not built output).
 * These are used by bundlers that compile from source — skip them.
 */
const SKIP_CONDITIONS = new Set(['source']);

/**
 * Find all package.json files in packages/ (including nested workspaces like packages/themes/*)
 */
function findPackageJsons() {
  const results = [];
  const packagesDir = join(rootDir, 'packages');

  function walk(dir, depth = 0) {
    if (depth > 2) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'src') continue;
      const pkgJson = join(dir, entry.name, 'package.json');
      if (existsSync(pkgJson)) {
        results.push(pkgJson);
      }
      // Recurse for nested workspaces (e.g., packages/themes/*)
      walk(join(dir, entry.name), depth + 1);
    }
  }

  walk(packagesDir);
  return results;
}

/**
 * Check if a path resolves to an existing file, relative to the package directory.
 */
function checkFile(pkgDir, filePath) {
  const resolved = resolve(pkgDir, filePath);
  return existsSync(resolved);
}

/**
 * Node exports subpath wildcard (one `*` in both key and value). We list the
 * value's directory and require at least one file matches prefix+suffix.
 * Any match that resolves outside pkgDir (via `..`) is rejected.
 */
function checkWildcard(pkgDir, exportValue) {
  const i = exportValue.indexOf('*');
  const prefix = exportValue.slice(0, i);
  const suffix = exportValue.slice(i + 1);
  const scanDir = prefix.endsWith('/')
    ? resolve(pkgDir, prefix)
    : dirname(resolve(pkgDir, prefix));
  const nameStart = prefix.endsWith('/') ? '' : prefix.slice(prefix.lastIndexOf('/') + 1);

  let matches = 0;
  try {
    for (const entry of readdirSync(scanDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.startsWith(nameStart) || !entry.name.endsWith(suffix)) continue;
      if (entry.name.length <= nameStart.length + suffix.length) continue; // empty capture
      const abs = resolve(scanDir, entry.name);
      if (relative(pkgDir, abs).startsWith('..')) continue; // must stay inside pkg
      matches++;
    }
  } catch {
    return false;
  }
  return matches > 0;
}

/**
 * Runtime targets worth actually loading. Type declarations and assets are not
 * modules. `default` targets are deliberately outside this probe:
 * many are browser-focused, and evaluating every default entry would broaden
 * this packaging check beyond the explicit Node surfaces it protects.
 */
const LOADABLE = /\.(?:cjs|js|mjs)$/;
const NON_PROBED_CONDITIONS = new Set(['types', 'default']);

/** Targets collected during the existence pass, loaded afterwards. */
const loadTargets = [];

/**
 * Recursively check an exports map value.
 * Handles string paths, conditional objects, and nested structures.
 */
function checkExportsValue(pkgDir, pkgName, exportKey, value, parentCondition) {
  const errors = [];

  if (typeof value === 'string') {
    const isWildcard =
      exportKey.split('*').length === 2 && value.split('*').length === 2;
    const ok = isWildcard ? checkWildcard(pkgDir, value) : checkFile(pkgDir, value);
    if (!ok) {
      const label = parentCondition
        ? `exports["${exportKey}"].${parentCondition}`
        : `exports["${exportKey}"]`;
      errors.push(`  ✗ ${label} → ${value} (${isWildcard ? 'no files match pattern' : 'file not found'})`);
    } else if (
      !isWildcard &&
      LOADABLE.test(value) &&
      !NON_PROBED_CONDITIONS.has(parentCondition)
    ) {
      loadTargets.push({
        pkgName,
        label: parentCondition
          ? `exports["${exportKey}"].${parentCondition}`
          : `exports["${exportKey}"]`,
        value,
        abs: resolve(pkgDir, value),
        loader: parentCondition === 'require' ? 'require' : 'import',
      });
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [condition, conditionValue] of Object.entries(value)) {
      if (SKIP_CONDITIONS.has(condition)) continue;
      errors.push(
        ...checkExportsValue(pkgDir, pkgName, exportKey, conditionValue, condition),
      );
    }
  }

  return errors;
}

// --- Main ---

const packageJsons = findPackageJsons();
let totalErrors = 0;
let packagesChecked = 0;

for (const pkgJsonPath of packageJsons) {
  const pkgDir = dirname(pkgJsonPath);
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

  // Skip private packages
  if (pkg.private) continue;

  const errors = [];

  // Check top-level fields (main, module, types)
  for (const field of TOP_LEVEL_FIELDS) {
    if (pkg[field] && !checkFile(pkgDir, pkg[field])) {
      errors.push(`  ✗ ${field} → ${pkg[field]} (file not found)`);
    }
  }

  // Check exports map
  if (pkg.exports && typeof pkg.exports === 'object') {
    for (const [exportKey, exportValue] of Object.entries(pkg.exports)) {
      errors.push(...checkExportsValue(pkgDir, pkg.name, exportKey, exportValue));
    }
  }

  if (pkg.name?.startsWith('@astryxdesign/theme-')) {
    const esmIcons = join(pkgDir, 'dist', 'icons.mjs');
    const cjsIcons = join(pkgDir, 'dist', 'icons.js');
    if (!existsSync(esmIcons)) {
      errors.push('  ✗ dist/icons.mjs (ESM icon companion not found)');
    }
    if (existsSync(cjsIcons)) {
      errors.push(
        '  ✗ dist/icons.js (unused CommonJS icon artifact was emitted)',
      );
    }
  }

  packagesChecked++;

  if (errors.length > 0) {
    console.error(`\n❌ ${pkg.name} (${pkgJsonPath})`);
    for (const error of errors) {
      console.error(error);
    }
    totalErrors += errors.length;
  } else {
    console.log(`✓ ${pkg.name}`);
  }
}

console.log(`\n${packagesChecked} packages checked.`);

// Second pass: actually load each explicit Node runtime target. A target can exist and
// still be unresolvable — see #4620, where every theme's `./built` entry was
// present but imported an extensionless `./icons` that Node rejects.
//
// Each import runs in a child process. Importing a module evaluates it, and some
// export targets are executables — `@astryxdesign/cli` maps "." to its bin, so an
// in-process import runs the CLI and prints its help. A child keeps side effects,
// stdout and any process.exit() out of this run, and the timeout contains a hang.
const RESOLUTION_CODES = new Set([
  'ERR_MODULE_NOT_FOUND',
  'ERR_UNSUPPORTED_DIR_IMPORT',
  'ERR_UNKNOWN_FILE_EXTENSION',
  'ERR_REQUIRE_ESM',
  'SyntaxError',
]);

/** Sentinel exit code, distinct from anything an executable entry might use. */
const LOAD_FAILED = 9;

let loadFailures = 0;

for (const target of loadTargets) {
  const failureHandler =
    `e => { process.stderr.write(String((e && e.code) || (e && e.name) || e)); ` +
    `process.exit(${LOAD_FAILED}); }`;
  const probe =
    target.loader === 'require'
      ? `try { require(${JSON.stringify(target.abs)}); process.exit(0); } catch (e) { (${failureHandler})(e); }`
      : `import(${JSON.stringify(pathToFileURL(target.abs).href)})` +
        `.then(() => process.exit(0))` +
        `.catch(${failureHandler})`;

  const args =
    target.loader === 'require'
      ? ['-e', probe]
      : ['--input-type=module', '-e', probe];
  const run = spawnSync(process.execPath, args, {
    encoding: 'utf-8',
    timeout: 20_000,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  // Anything other than our sentinel is the module's own business: an
  // executable entry that printed help and exited 0, or one that failed for a
  // reason unrelated to packaging. Only resolution defects concern us here.
  if (run.status !== LOAD_FAILED) continue;

  const code = (run.stderr || '').trim().split('\n')[0];
  if (!RESOLUTION_CODES.has(code)) continue;

  if (loadFailures === 0) {
    console.error('\n❌ Export targets that exist but cannot be loaded:\n');
  }
  console.error(`  ✗ ${target.pkgName} ${target.label} → ${target.value}`);
  console.error(`      ${code}`);
  loadFailures++;
}

if (loadFailures === 0 && loadTargets.length > 0) {
  const imports = loadTargets.filter(
    target => target.loader === 'import',
  ).length;
  const requires = loadTargets.length - imports;
  console.log(
    `${imports} import and ${requires} require export target(s) loaded cleanly.`,
  );
}

const failures = totalErrors + loadFailures;

if (failures > 0) {
  if (totalErrors > 0) {
    console.error(`\n${totalErrors} package artifact or export error(s) found. Fix the paths above.`);
  }
  if (loadFailures > 0) {
    console.error(
      `\n${loadFailures} export target(s) exist but fail to load. A Node consumer ` +
        `using the advertised condition gets the same error.`,
    );
  }
  process.exit(1);
} else {
  console.log('All package artifacts and exports are valid; probed Node targets load cleanly.');
}
