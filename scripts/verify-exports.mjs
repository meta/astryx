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
 * that Node cannot resolve. So the target a Node `import` resolves for each
 * export, and the target its `require` condition resolves, are also loaded. Maintained
 * themes additionally assert that their ESM icon companion exists without an
 * unused CommonJS twin. This runs after the build, so a forward reference to
 * something a later pipeline stage produces is already satisfied.
 *
 * Scope, deliberately: importing a module only exercises the specifiers that are
 * evaluated when it loads — its static import graph. A bad specifier inside a
 * `lazy(() => import('...'))` is never reached, so this would NOT have caught
 * #4569 (`await import('@astryxdesign/core/Text')` succeeds on the unfixed bytes
 * even though the Tooltip specifier inside it is broken). Catching that needs a
 * static scan; see scripts/check-fully-specified.mjs.
 *
 * Coverage follows what npm receives (scripts/npm/published-manifests.mjs):
 * `canaryOnly` packages are published to the `@canary` dist-tag although they
 * say `private: true`, and their runtime entry is reached through `default`.
 *
 * Exit code 1 if any exports are broken.
 */

import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {compileFunction} from 'node:vm';
import {join, resolve, dirname, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {isPublished} from './npm/published-manifests.mjs';

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
function findPackageJsons(root) {
  const results = [];
  const packagesDir = join(root, 'packages');

  function walk(dir, depth = 0) {
    if (depth > 2) return;
    const entries = readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'src'
      )
        continue;
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
  const nameStart = prefix.endsWith('/')
    ? ''
    : prefix.slice(prefix.lastIndexOf('/') + 1);

  let matches = 0;
  try {
    for (const entry of readdirSync(scanDir, {withFileTypes: true})) {
      if (!entry.isFile()) continue;
      if (!entry.name.startsWith(nameStart) || !entry.name.endsWith(suffix))
        continue;
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
 * modules; the extension filter, not the condition name, keeps a stylesheet or
 * a JSON asset reached through `default` out of the probe.
 */
const LOADABLE = /\.(?:cjs|js|mjs)$/;

/**
 * The conditions Node matches for each loader, besides `default`, which always
 * matches. Node takes the first matching condition in declaration order, so
 * `{default: './a.js', import: './b.mjs'}` resolves to `./a.js` for an import.
 */
const LOADER_CONDITIONS = {
  import: new Set(['import', 'node', 'module-sync', 'default']),
  require: new Set(['require', 'node', 'module-sync', 'default']),
};

/**
 * The target Node resolves for an exports value under `loader`, with the
 * condition path that led to it, or null when no condition matches.
 */
export function resolveExportTarget(value, loader, conditions = []) {
  if (typeof value === 'string') return {value, conditions};
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = resolveExportTarget(item, loader, conditions);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [condition, conditionValue] of Object.entries(value)) {
      if (!LOADER_CONDITIONS[loader].has(condition)) continue;
      const found = resolveExportTarget(conditionValue, loader, [
        ...conditions,
        condition,
      ]);
      if (found) return found;
    }
  }
  return null;
}

const labelFor = (exportKey, conditions) =>
  conditions.length > 0
    ? `exports["${exportKey}"].${conditions.join('.')}`
    : `exports["${exportKey}"]`;

/**
 * Walk one package's exports map. Reports targets that do not exist, and
 * collects, for each export, the targets a Node `import` and `require`
 * resolve to.
 */
export function checkPackageExports(pkgDir, pkgName, exportsMap) {
  const errors = [];
  const targets = [];

  function exists(exportKey, value, conditions) {
    if (typeof value === 'string') {
      const isWildcard =
        exportKey.split('*').length === 2 && value.split('*').length === 2;
      const ok = isWildcard
        ? checkWildcard(pkgDir, value)
        : checkFile(pkgDir, value);
      if (!ok) {
        errors.push(
          `  ✗ ${labelFor(exportKey, conditions)} → ${value} (${isWildcard ? 'no files match pattern' : 'file not found'})`,
        );
      }
      return ok;
    }
    let ok = true;
    if (typeof value === 'object' && value !== null) {
      for (const [condition, conditionValue] of Object.entries(value)) {
        if (SKIP_CONDITIONS.has(condition)) continue;
        if (!exists(exportKey, conditionValue, [...conditions, condition]))
          ok = false;
      }
    }
    return ok;
  }

  for (const [exportKey, value] of Object.entries(exportsMap)) {
    exists(exportKey, value, []);
    if (exportKey.includes('*')) continue;
    for (const loader of ['import', 'require']) {
      const found = resolveExportTarget(value, loader);
      if (!found || !LOADABLE.test(found.value)) continue;
      // A require is probed only where the export names one: a package that
      // offers no `require` makes no CommonJS promise to check.
      if (loader === 'require' && !found.conditions.includes('require'))
        continue;
      if (!checkFile(pkgDir, found.value)) continue;
      // A `require` that resolves to the same file as the import adds nothing.
      if (
        loader === 'require' &&
        targets.some(t => t.exportKey === exportKey && t.value === found.value)
      ) {
        continue;
      }
      targets.push({
        pkgName,
        exportKey,
        label: labelFor(exportKey, found.conditions),
        value: found.value,
        abs: resolve(pkgDir, found.value),
        loader,
      });
    }
  }

  return {errors, targets};
}

/**
 * Run the existence pass over every published package under `root`/packages.
 * Returns one result per checked package and the load targets collected from
 * all of them. Reports nothing — the caller prints.
 */
export function verifyExports(root) {
  const results = [];
  const targets = [];

  for (const pkgJsonPath of findPackageJsons(root)) {
    const pkgDir = dirname(pkgJsonPath);
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

    // The packages npm receives, the list the canary loops publish.
    if (!isPublished(pkg)) continue;

    const errors = [];

    // Check top-level fields (main, module, types)
    for (const field of TOP_LEVEL_FIELDS) {
      if (pkg[field] && !checkFile(pkgDir, pkg[field])) {
        errors.push(`  ✗ ${field} → ${pkg[field]} (file not found)`);
      }
    }

    // Check exports map
    if (pkg.exports && typeof pkg.exports === 'object') {
      const exports = checkPackageExports(pkgDir, pkg.name, pkg.exports);
      errors.push(...exports.errors);
      targets.push(...exports.targets);
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

    results.push({name: pkg.name, path: pkgJsonPath, errors});
  }

  return {results, targets};
}

// Second pass: actually load each resolved Node runtime target. A target can exist and
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

/** The `type` of the package.json nearest to `file`, or null. */
function packageTypeOf(file) {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      return JSON.parse(readFileSync(manifest, 'utf-8')).type ?? null;
    }
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Whether `file` is a `.js` file with module syntax in a package that does
 * not say `"type": "module"`. Node 22.7 and later load such a file by its URL
 * through syntax detection, so an import probe passes, but a bundler or a
 * resolver that follows the package's `type` reads it as CommonJS and fails.
 * The file must fail to compile the way Node wraps a CommonJS module and
 * compile as an ES module; a file that is invalid either way has some other
 * defect, which the import probe reports.
 */
export function hasUndeclaredModuleSyntax(file) {
  if (!file.endsWith('.js') || packageTypeOf(file) === 'module') return false;
  const source = readFileSync(file, 'utf-8');
  try {
    compileFunction(
      source,
      ['exports', 'require', 'module', '__filename', '__dirname'],
      {filename: file},
    );
    return false;
  } catch (error) {
    if (!(error instanceof SyntaxError)) return false;
  }
  const asModule = spawnSync(
    process.execPath,
    ['--input-type=module', '--check'],
    {input: source, encoding: 'utf-8'},
  );
  return asModule.status === 0;
}

/**
 * Load each target in a child process with its loader. Returns the ones that
 * failed for a module-resolution reason, as `{...target, code}`.
 */
export function probeLoadTargets(targets) {
  const failures = [];

  for (const target of targets) {
    if (target.loader === 'import' && hasUndeclaredModuleSyntax(target.abs)) {
      failures.push({...target, code: 'ERR_MISSING_TYPE_MODULE'});
      continue;
    }
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

    failures.push({...target, code});
  }

  return failures;
}

function main() {
  const {results, targets} = verifyExports(rootDir);
  let totalErrors = 0;

  for (const {name, path: pkgJsonPath, errors} of results) {
    if (errors.length > 0) {
      console.error(`\n❌ ${name} (${pkgJsonPath})`);
      for (const error of errors) {
        console.error(error);
      }
      totalErrors += errors.length;
    } else {
      console.log(`✓ ${name}`);
    }
  }

  console.log(`\n${results.length} packages checked.`);

  const failures = probeLoadTargets(targets);
  if (failures.length > 0) {
    console.error('\n❌ Export targets that exist but cannot be loaded:\n');
    for (const failure of failures) {
      console.error(
        `  ✗ ${failure.pkgName} ${failure.label} → ${failure.value} (${failure.loader})`,
      );
      console.error(
        failure.code === 'ERR_MISSING_TYPE_MODULE'
          ? '      ES module syntax in a .js file whose package does not declare "type": "module"'
          : `      ${failure.code}`,
      );
    }
  } else if (targets.length > 0) {
    const imports = targets.filter(target => target.loader === 'import').length;
    const requires = targets.length - imports;
    console.log(
      `${imports} import and ${requires} require export target(s) loaded cleanly.`,
    );
  }

  const missingType = failures.filter(
    failure => failure.code === 'ERR_MISSING_TYPE_MODULE',
  ).length;
  const loadFailures = failures.length - missingType;
  if (totalErrors + loadFailures + missingType > 0) {
    if (totalErrors > 0) {
      console.error(
        `\n${totalErrors} package artifact or export error(s) found. Fix the paths above.`,
      );
    }
    if (loadFailures > 0) {
      console.error(
        `\n${loadFailures} export target(s) exist but fail to load. A Node consumer ` +
          `using the advertised condition gets the same error.`,
      );
    }
    if (missingType > 0) {
      console.error(
        `\n${missingType} export target(s) use ES module syntax in a .js file whose ` +
          `package does not declare "type": "module". Node may still load them through ` +
          `syntax detection, but a bundler or resolver that follows the package's ` +
          `"type" reads them as CommonJS.`,
      );
    }
    process.exit(1);
  } else {
    console.log(
      'All package artifacts and exports are valid; probed Node targets load cleanly.',
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
