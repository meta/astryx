// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod runner
 *
 * Orchestrates running jscodeshift transforms against source files.
 * Handles dry-run previews, file writing, summary reporting, and
 * output validation to prevent corrupted transforms from reaching disk.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as p from './term-log.mjs';
import {humanLog} from '../../foundation/response/json.mjs';
import {runCodeCodemod, runConfigCodemod} from './run-codemod.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';

// Known corruption patterns that indicate a broken transform.
// Each entry: [regex, human-readable description]
const CORRUPTION_PATTERNS = [
  [
    /\[native code\]/g,
    '[native code] injection (prototype pollution in identifier map)',
  ],
  [
    /function \w+\(\) \{ \[native code\] \}/g,
    'native function toString() leak',
  ],
];

/**
 * Fix jscodeshift directive corruption.
 *
 * jscodeshift has a known bug where toSource() double-prints the semicolon
 * on directive prologues ('use client';, 'use server';, 'use strict';)
 * when the AST has been modified with new nodes nearby. The parser treats
 * the directive as an ExpressionStatement with a StringLiteral, and the
 * printer emits both the original semicolon and a new one for the statement.
 *
 * This is applied in the runner so every codemod gets the fix automatically.
 *
 * @param {string} code
 * @returns {string}
 */
export function fixDirectiveCorruption(code) {
  return code.replace(/^(['"]use (client|server|strict)['"]);\s*;/gm, '$1;');
}

/**
 * Directories a source scan must never descend into. Generated-looking names
 * are intentionally absent: protection comes from checkout declarations, not a
 * directory-name heuristic.
 */
const IGNORED_DIRS = new Set([
  'node_modules',
  'bower_components',
  'jspm_packages',
  '.git',
  '.hg',
  '.sl',
]);
export {IGNORED_DIRS};

/** Yarn's install and cache folders, a hard boundary under `.yarn`. */
const YARN_STORE_DIRS = new Set(['__virtual__', 'cache', 'sdks', 'unplugged']);

/**
 * The number of path segments a hard boundary starting at `parts[index]`
 * spans: 1 for a name in {@link IGNORED_DIRS}, 2 for `.yarn` followed by one
 * of its store folders, 0 when none starts there.
 * @param {string[]} parts
 * @param {number} index
 */
function boundaryLength(parts, index) {
  if (IGNORED_DIRS.has(parts[index])) return 1;
  if (parts[index] === '.yarn' && YARN_STORE_DIRS.has(parts[index + 1])) {
    return 2;
  }
  return 0;
}

/** @param {string} root @param {string} fullPath @param {string} name */
export function isIgnoredDirectory(root, fullPath, name) {
  if (IGNORED_DIRS.has(name)) return true;
  const parts = path.relative(root, fullPath).split(path.sep);
  return boundaryLength(parts, 0) === 2;
}

/**
 * Whether a symbolic link to a directory leads into a tree the scan never
 * descends. The link is checked like a directory by {@link isIgnoredDirectory},
 * and its resolved target's absolute path is searched for the same hard
 * boundaries, wherever the target lives: a symlinked `node_modules`, or a link
 * into a dependency, package-store or version-control tree such as another
 * project's `.yarn/cache`, is not walked. Only a target that stays inside the
 * operation root may sit below a boundary that also contains that root, so a
 * project that itself lives below a `node_modules` folder is still scanned; a
 * link from it to a sibling package under that same folder is not.
 * @param {string} root scan root
 * @param {string} fullPath the link's path
 * @param {string} name the link's name
 * @param {string} realTarget the link's resolved real path
 * @param {string} [operationRoot] the project root of the operation (default: the scan root)
 * @returns {boolean}
 */
export function isIgnoredLinkedDirectory(
  root,
  fullPath,
  name,
  realTarget,
  operationRoot = root,
) {
  if (isIgnoredDirectory(root, fullPath, name)) return true;
  let realRoot = operationRoot;
  try {
    realRoot = fs.realpathSync(operationRoot);
  } catch {
    // An unreadable root has no descendants to compare against.
  }
  const relative = path.relative(realRoot, realTarget);
  const inside =
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative));
  // Inside the root, only a boundary that ends below the root counts.
  const floor = inside ? realRoot.split(path.sep).length : 0;
  const targetParts = realTarget.split(path.sep);
  for (let index = 0; index < targetParts.length; index++) {
    const length = boundaryLength(targetParts, index);
    if (length > 0 && index + length > floor) return true;
  }
  return false;
}

/**
 * Recursively find all source files in a directory.
 * @param {string} dir
 * @param {string} [root] the operation's project root (default: `dir`)
 * @returns {string[]}
 */
function findSourceFiles(dir, root = dir) {
  /** @type {string[]} */
  const results = [];
  const extensions = new Set([
    '.tsx',
    '.ts',
    '.jsx',
    '.js',
    '.mjs',
    '.cjs',
    '.css',
    '.scss',
    '.sass',
    '.less',
  ]);

  /** @param {string} currentDir @param {Set<string>} [ancestors] */
  function walk(currentDir, ancestors = new Set()) {
    let realDirectory;
    try {
      realDirectory = fs.realpathSync(currentDir);
    } catch {
      return;
    }
    if (ancestors.has(realDirectory)) return;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(realDirectory);
    let entries;
    try {
      entries = fs.readdirSync(currentDir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      // Symlinked files and descendants remain read-only candidates so a
      // required change can be reported. Real-path ancestors prevent cycles,
      // and a link into a dependency or VCS tree is not descended.
      if (entry.isSymbolicLink()) {
        try {
          const target = fs.statSync(fullPath);
          if (target.isFile() && extensions.has(path.extname(entry.name))) {
            results.push(fullPath);
          } else if (
            target.isDirectory() &&
            !isIgnoredLinkedDirectory(
              dir,
              fullPath,
              entry.name,
              fs.realpathSync(fullPath),
              root,
            )
          ) {
            walk(fullPath, nextAncestors);
          }
        } catch {
          // Broken links have no source bytes to evaluate.
        }
        continue;
      }
      if (entry.isDirectory()) {
        // Only hard boundaries are skipped by name. Generated and vendored
        // content is discovered, transformed in memory, and classified by the
        // shared protection resolver so required changes can be reported.
        if (isIgnoredDirectory(dir, fullPath, entry.name)) continue;
        walk(fullPath, nextAncestors);
      } else if (extensions.has(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort();
}

/**
 * The declined candidates that are not also protected files the run reports.
 * A file another codemod still requires a change to is listed once, under
 * `protectedFiles`, which already makes the run incomplete.
 * @template {{file: string}} T
 * @param {T[]} declined
 * @param {Array<{file: string}>} protectedRows
 * @returns {T[]}
 */
export function withoutProtected(declined, protectedRows) {
  /** @param {string} file */
  const key = file => file.split(path.sep).join('/');
  const blocked = new Set(protectedRows.map(item => key(item.file)));
  return declined.filter(item => !blocked.has(key(item.file)));
}

/**
 * Validate transform output before writing to disk.
 *
 * Checks:
 * 1. The output can be re-parsed by jscodeshift (no syntax corruption)
 * 2. No known corruption patterns are present that weren't in the original
 *
 * @param {string} result - The transformed source code
 * @param {string} source - The original source code
 * @param {import('../../authoring/codemod/type').JscodeshiftFactory} j - jscodeshift instance (with parser configured)
 * @param {{parse?: boolean}} [options]
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export function validateOutput(result, source, j, {parse = true} = {}) {
  // Check 1: Re-parse the output — catches syntax-breaking corruption
  if (parse) {
    try {
      j(result);
    } catch (parseError) {
      const message = /** @type {any} */ (parseError).message;
      return {
        valid: false,
        reason: `transform produced unparseable output: ${message}`,
      };
    }
  }

  // Check 2: Known corruption patterns (only flag new ones, not pre-existing)
  for (const [pattern, description] of CORRUPTION_PATTERNS) {
    const resultMatches = result.match(pattern);
    const sourceMatches = source.match(pattern);
    const resultCount = resultMatches ? resultMatches.length : 0;
    const sourceCount = sourceMatches ? sourceMatches.length : 0;
    if (resultCount > sourceCount) {
      return {
        valid: false,
        reason: `detected corruption: ${description} (${resultCount - sourceCount} new occurrence${resultCount - sourceCount > 1 ? 's' : ''})`,
      };
    }
  }

  return {valid: true};
}

/**
 * Normalize a core registry transform entry to the unified codemod entry shape
 * consumed by the shared runner (`run-codemod.mjs`).
 *
 * Core registry entries are stored as `{name, transform, meta, optional}`.
 * The shared runner — the same one integration codemods use — operates on
 * `{id, type, codemod: {title, transform, fileExtensions?, isOptional?},
 * package, version}`.
 *
 * CONVENTION — how a core registry entry signals it is a CONFIG codemod:
 * set `meta.codemodType === 'config'` on the entry (the default is a 'code'
 * codemod). A config codemod runs against the consumer's astryx.config.* file
 * via the unified `(file, api)`/jscodeshift contract; a code codemod runs
 * against discovered source files. Any future core config codemod (e.g. a
 * v0.1.3 one) must set `meta.codemodType = 'config'` and author its transform
 * with the same `(file, api) => string | null | undefined` contract used by a
 * `type: 'config'` codemod.
 *
 * @param {{name: string, transform: import('../../authoring/codemod/type').CodemodTransform, meta: {title: string, description?: string, fileExtensions?: string[], codemodType?: string}, optional?: boolean}} transformEntry
 * @param {string} version
 * @returns {import('../../authoring/codemod/type').CodemodEntry}
 */
function toUnifiedEntry(transformEntry, version) {
  const {name, transform, meta, optional} = transformEntry;
  const type = meta?.codemodType === 'config' ? 'config' : 'code';
  return {
    id: name,
    type,
    codemod: {
      title: meta.title,
      transform,
      fileExtensions: meta.fileExtensions,
      isOptional: !!optional,
    },
    package: 'core',
    version,
  };
}

/**
 * What a core PROJECT codemod plans: whole files to write and delete under the
 * project root, or the problems that stop it. Paths in `writes` and `deletes`
 * are absolute; `problems` name package-relative files.
 *
 * @typedef {object} ProjectCodemodPlan
 * @property {Array<{path: string, contents: string}>} writes
 * @property {string[]} deletes
 * @property {Array<{file: string, message: string}>} problems
 */

/**
 * Run one core PROJECT codemod (`meta.codemodType === 'project'`): instead of
 * rewriting the files it is handed, it reads the project and plans whole-file
 * writes and deletions, which this applies (or previews) as one unit. A plan
 * that names a problem changes nothing. Core-only: integration codemods keep
 * the file contract.
 *
 * @param {{name: string, transform: unknown}} transformEntry
 * @param {{apply: boolean, root: string, protection: {root: string, classify: (file: string) => import('../../foundation/fs/file-protection.mjs').FileProtection[]}, log: {success: (m: string) => void, warn: (m: string) => void, error: (m: string) => void}}} options
 * @returns {Promise<import('../../authoring/codemod/type').CodemodRunResult & {stagedOverrides?: Map<string, string|null>}>}
 */
async function runProjectCodemod(
  {name, transform},
  {apply, root, protection, log},
) {
  /** @param {string} file */
  const rel = file => path.relative(root, file).split(path.sep).join('/');
  /** @type {ProjectCodemodPlan} */
  let plan;
  try {
    plan = await /** @type {(root: string) => Promise<ProjectCodemodPlan>} */ (
      transform
    )(root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`    ✗ ${message}`);
    return {
      filesChanged: 0,
      changedFiles: [],
      writtenFiles: [],
      protectedFiles: [],
      errors: [{file: '.', codemod: name, error: message}],
    };
  }
  if (plan.problems.length > 0) {
    for (const {file, message} of plan.problems) {
      log.error(`    ✗ ${file} — ${message}`);
    }
    return {
      filesChanged: 0,
      changedFiles: [],
      writtenFiles: [],
      protectedFiles: [],
      errors: plan.problems.map(({file, message}) => ({
        file,
        codemod: name,
        error: message,
      })),
    };
  }

  const candidates = [
    ...plan.writes.map(write => ({
      file: write.path,
      existing: fs.existsSync(write.path),
    })),
    ...plan.deletes.map(file => ({file, existing: true})),
  ];
  /** @param {{file: string, existing: boolean}} candidate */
  const currentDeclarations = candidate =>
    protection
      .classify(candidate.file)
      .filter(
        item =>
          candidate.existing ||
          ['outside-root', 'dependency', 'vcs', 'symlink'].includes(
            item.reason,
          ),
      );
  const currentlyBlocked = new Set(
    candidates
      .filter(candidate => currentDeclarations(candidate).length > 0)
      .map(candidate => candidate.file),
  );
  /** @type {Map<string, string|null>} */
  const stagedOverrides = new Map();
  for (const write of plan.writes) {
    if (!currentlyBlocked.has(write.path)) {
      stagedOverrides.set(write.path, write.contents);
    }
  }
  for (const file of plan.deletes) {
    if (!currentlyBlocked.has(file)) stagedOverrides.set(file, null);
  }
  // A plan cannot introduce a protection declaration and then overwrite the
  // file it protects in the same transaction. Only declarations whose own
  // writes are allowed participate in the staged view.
  const stagedProtection = createFileProtectionResolver(root, {
    overrides: stagedOverrides,
  });
  /** @type {import('../../authoring/codemod/type').CodemodRunResult['protectedFiles']} */
  const protectedFiles = [];
  const blocked = new Set();
  for (const candidate of candidates) {
    const file = candidate.file;
    const declarations = [
      ...currentDeclarations(candidate),
      ...stagedProtection.classify(file),
    ]
      .filter(
        item =>
          candidate.existing ||
          ['outside-root', 'dependency', 'vcs', 'symlink'].includes(
            item.reason,
          ),
      )
      .filter(
        (item, index, all) =>
          all.findIndex(
            candidate =>
              candidate.file === item.file &&
              candidate.reason === item.reason &&
              candidate.declaration === item.declaration,
          ) === index,
      );
    if (declarations.length === 0) continue;
    blocked.add(file);
    const rows = declarations.map(item => ({
      file: item.file,
      codemod: name,
      reason: item.reason,
      declaration: item.declaration,
      generated: item.reason === 'generated',
      ...(item.command ? {command: item.command} : {}),
    }));
    protectedFiles.push(...rows);
    log.warn(
      `    ! ${rel(file)} — protected by ${rows.map(item => item.declaration).join('; ')}`,
    );
  }

  const writes = plan.writes.filter(write => !blocked.has(write.path));
  const deletes = plan.deletes.filter(file => !blocked.has(file));
  const changedFiles = [...writes.map(write => write.path), ...deletes];
  /** @type {string[]} */
  const writtenFiles = [];
  for (const write of writes) {
    if (apply) {
      fs.mkdirSync(path.dirname(write.path), {recursive: true});
      fs.writeFileSync(write.path, write.contents, 'utf-8');
      writtenFiles.push(write.path);
      log.success(`    ✓ ${rel(write.path)}`);
    } else {
      log.warn(`    ~ ${rel(write.path)} (would write)`);
    }
  }
  // Deletions go last, so a failed write leaves a state a rerun completes.
  for (const file of deletes) {
    if (apply) {
      fs.rmSync(file);
      writtenFiles.push(file);
      log.success(`    ✓ ${rel(file)} (removed)`);
    } else {
      log.warn(`    ~ ${rel(file)} (would remove)`);
    }
  }
  /** @type {Map<string, string|null>} */
  const appliedOverrides = new Map();
  for (const write of writes) appliedOverrides.set(write.path, write.contents);
  for (const file of deletes) appliedOverrides.set(file, null);
  return {
    filesChanged: changedFiles.length,
    changedFiles,
    writtenFiles,
    protectedFiles,
    stagedOverrides: appliedOverrides,
    errors: [],
  };
}

/**
 * Run codemods against source files.
 *
 * @param {Array<{version: string, transforms: Array<{name: string, transform: import('../../authoring/codemod/type').CodemodTransform, meta: {title: string, description?: string, fileExtensions?: string[], codemodType?: string}, optional?: boolean}>}>} versionManifests
 * @param {object} options
 * @param {boolean} options.apply - Write changes to disk
 * @param {string} options.path - Source directory to scan
 * @param {string|undefined} options.codemod - Run only this specific transform
 * @param {Set<string>} [options.skipCodemods] - Transform names to exclude
 * @param {boolean} [options.silent] - Suppress all human-facing output (for --json)
 * @param {string} [options.root] - Project root a project codemod reads (default: the process cwd)
 * @param {{root: string, classify: (file: string) => import('../../foundation/fs/file-protection.mjs').FileProtection[]}} [options.protection] - Preloaded protection resolver
 * @param {boolean} [options.coversTarget] - False when these codemods stop before the installed target (the CLI is older than Core), so a run with no changes does not say the code is up to date. Default true.
 * @returns {Promise<{totalFilesChanged: number, totalTransformsApplied: number, totalValidationBlocked: number, changedFiles: string[], writtenFiles: string[], stagedContents: Map<string, string>, protectedFiles: import('../../authoring/codemod/type').CodemodRunResult['protectedFiles'], declinedCandidates: NonNullable<import('../../authoring/codemod/type').CodemodRunResult['declinedCandidates']>, errors: Array<{file: string, codemod: string, error: string}>, skippedOptional: Array<{name: string, meta: {title: string, description?: string, fileExtensions?: string[], codemodType?: string}, version: string}>} | {ok: false, reason: string, resolvedPath: string}>}
 */
export async function runCodemods(
  versionManifests,
  {
    apply,
    path: srcPath,
    codemod,
    skipCodemods,
    silent = false,
    root = process.cwd(),
    protection: providedProtection,
    coversTarget = true,
  },
) {
  // No-op stub object so silent mode skips log output entirely without
  // littering the body with `if (!silent)` guards.
  const log = silent
    ? {step() {}, info() {}, success() {}, warn() {}, error() {}, message() {}}
    : p.log;
  const writeBlank = () => {
    if (!silent) humanLog('');
  };

  const resolvedPath = path.resolve(srcPath);
  // Eager construction is the fail-closed barrier: every working-tree
  // declaration is read and parsed before the first codemod can write.
  let protection =
    providedProtection ?? createFileProtectionResolver(path.resolve(root));
  /** @type {Map<string, string|null>} */
  const protectionOverrides = new Map();
  let protectionWriteCount = 0;

  // Config and project codemods never read the files under --path, so a
  // missing --path should not block them. Only hard-fail on a missing source
  // path when there is at least one CODE codemod to run.
  const hasCodeCodemod = versionManifests.some(({transforms}) =>
    transforms.some(
      t =>
        t.meta?.codemodType !== 'config' && t.meta?.codemodType !== 'project',
    ),
  );
  const sourcePathExists = fs.existsSync(resolvedPath);

  if (!sourcePathExists && hasCodeCodemod) {
    log.error(`Source path not found: ${resolvedPath}`);
    return {ok: false, reason: 'source_path_missing', resolvedPath};
  }

  /** @type {string[]} */
  let files = [];
  if (sourcePathExists) {
    log.step(`Scanning ${resolvedPath} for source files...`);
    files = findSourceFiles(resolvedPath, path.resolve(root));
    if (files.length === 0) {
      log.warn('No source files found.');
    } else {
      log.info(
        `Found ${files.length} source file${files.length === 1 ? '' : 's'}`,
      );
    }
  }

  // Dynamically import jscodeshift
  const jscodeshift =
    /** @type {import('../../authoring/codemod/type').JscodeshiftFactory} */ (
      (await import('jscodeshift')).default
    );

  let totalTransformsApplied = 0;
  let totalValidationBlocked = 0;
  /** @type {Array<{file: string, codemod: string, error: string}>} */
  const errors = [];
  /** In-memory pipeline state keeps ordered dry-runs equivalent to apply. */
  const virtualContents = new Map();
  /** @type {string[]} */
  const changedFiles = [];
  /** @type {string[]} */
  const writtenFiles = [];
  /** @type {import('../../authoring/codemod/type').CodemodRunResult['protectedFiles']} */
  const protectedFiles = [];
  /** @type {NonNullable<import('../../authoring/codemod/type').CodemodRunResult['declinedCandidates']>} */
  const declinedCandidates = [];
  /** @type {Array<{name: string, meta: {title: string, description?: string, fileExtensions?: string[], codemodType?: string}, version: string}>} */
  const skippedOptional = [];
  for (const {version, transforms} of versionManifests) {
    log.step(`Applying v${version} codemods...`);

    for (const transformEntry of transforms) {
      // Filter by codemod name if specified
      if (codemod && transformEntry.name !== codemod) continue;
      // Exclude explicitly skipped codemods (by transform name).
      if (skipCodemods?.has(transformEntry.name)) continue;

      const {name, meta, optional} = transformEntry;

      // Skip optional codemods unless explicitly requested via --codemod
      if (optional && !codemod) {
        skippedOptional.push({name, meta, version});
        continue;
      }

      if (apply && writtenFiles.length !== protectionWriteCount) {
        protection = createFileProtectionResolver(path.resolve(root), {
          overrides: protectionOverrides,
        });
        protectionWriteCount = writtenFiles.length;
      }

      log.info(`  ${meta.title}`);

      // Config codemods are routed through the SAME shared runner that
      // integration config codemods use: the transform follows the unified
      // `(file, api)` contract and targets the consumer's astryx.config.*.
      // A core entry signals "config" via `meta.codemodType === 'config'`
      // (see toUnifiedEntry).
      if (meta?.codemodType === 'project') {
        const result = await runProjectCodemod(transformEntry, {
          apply,
          root,
          protection,
          log,
        });
        errors.push(...result.errors);
        protectedFiles.push(...result.protectedFiles);
        changedFiles.push(...result.changedFiles);
        writtenFiles.push(...result.writtenFiles);
        if (result.stagedOverrides) {
          for (const [file, contents] of result.stagedOverrides) {
            protectionOverrides.set(file, contents);
            if (contents !== null) virtualContents.set(file, contents);
          }
          protection = createFileProtectionResolver(path.resolve(root), {
            overrides: protectionOverrides,
          });
          protectionWriteCount = writtenFiles.length;
        }
        if (result.filesChanged > 0) {
          totalTransformsApplied += 1;
        }
        continue;
      }

      if (meta?.codemodType === 'config') {
        const result = runConfigCodemod(
          toUnifiedEntry(transformEntry, version),
          {
            apply,
            log,
            jscodeshift,
            root,
            protection,
            contents: virtualContents,
          },
        );
        errors.push(...result.errors);
        protectedFiles.push(...result.protectedFiles);
        changedFiles.push(...result.changedFiles);
        writtenFiles.push(...result.writtenFiles);
        if (result.filesChanged > 0) {
          totalTransformsApplied += result.filesChanged;
        }
        continue;
      }

      const result = runCodeCodemod(
        toUnifiedEntry(transformEntry, version),
        files,
        {apply, log, jscodeshift, root, protection, contents: virtualContents},
      );
      errors.push(...result.errors);
      protectedFiles.push(...result.protectedFiles);
      declinedCandidates.push(...(result.declinedCandidates ?? []));
      changedFiles.push(...result.changedFiles);
      writtenFiles.push(...result.writtenFiles);
      totalTransformsApplied += result.filesChanged;
      totalValidationBlocked += result.errors.filter(
        error =>
          error.error.startsWith('transform produced unparseable output') ||
          error.error.startsWith('detected corruption:'),
      ).length;

      if (result.filesChanged > 0) {
        const verb = apply ? 'Updated' : 'Would update';
        log.info(
          `  ${verb} ${result.filesChanged} file${result.filesChanged === 1 ? '' : 's'}`,
        );
      }
    }
  }

  // Summary
  writeBlank();

  if (errors.length > 0) {
    log.error(
      `${errors.length} error${errors.length === 1 ? '' : 's'} during codemods:`,
    );
    for (const {file, codemod: cm, error} of errors) {
      log.error(`  ${cm} → ${file}: ${error}`);
    }
  }

  if (totalValidationBlocked > 0) {
    log.warn(
      `${totalValidationBlocked} file${totalValidationBlocked === 1 ? ' was' : 's were'} blocked by validation — no changes written to ${totalValidationBlocked === 1 ? 'that file' : 'those files'}.`,
    );
    log.info(
      'This means a codemod produced invalid output. Please report this as a bug.',
    );
  }

  // A file several codemods changed is one file. `totalTransformsApplied` is
  // unchanged: a code or config codemod counts each file it changed, and a
  // project codemod counts once. The two answer different questions.
  const totalFilesChanged = new Set(changedFiles).size;

  if (protectedFiles.length > 0) {
    const files = [...new Set(protectedFiles.map(item => item.file))];
    log.warn(
      `${files.length} protected file${files.length === 1 ? '' : 's'} require${files.length === 1 ? 's' : ''} regeneration or manual review.`,
    );
  }

  // A later codemod can block a file an earlier one declined. The caller
  // prints declined files once it has reconciled every runner's results.
  const reportedDeclined = withoutProtected(declinedCandidates, protectedFiles);

  if (
    totalFilesChanged === 0 &&
    errors.length === 0 &&
    protectedFiles.length === 0 &&
    reportedDeclined.length === 0
  ) {
    // Codemods that stop before the installed target cannot vouch for the
    // code; the caller says what is missing.
    if (coversTarget) {
      log.success('No changes needed — your code is already up to date!');
    }
  } else if (apply && protectedFiles.length > 0) {
    log.warn(
      `Applied ${totalTransformsApplied} owned change${totalTransformsApplied === 1 ? '' : 's'} across ${totalFilesChanged} file${totalFilesChanged === 1 ? '' : 's'}; protected changes remain.`,
    );
  } else if (apply) {
    log.success(
      `Done! Applied ${totalTransformsApplied} change${totalTransformsApplied === 1 ? '' : 's'} across ${totalFilesChanged} file${totalFilesChanged === 1 ? '' : 's'}.`,
    );
    if (errors.length > 0) {
      log.warn('Some files had errors — review them manually.');
    }
    log.info('Run your type checker and tests to verify the changes.');
  } else {
    log.warn(
      `Found ${totalTransformsApplied} change${totalTransformsApplied === 1 ? '' : 's'} across ${totalFilesChanged} file${totalFilesChanged === 1 ? '' : 's'}.`,
    );
    log.info('Run with --apply to write changes to disk.');
  }

  // Report skipped optional codemods so the user knows they exist
  if (skippedOptional.length > 0) {
    writeBlank();
    log.message(
      `${skippedOptional.length} optional codemod${skippedOptional.length === 1 ? '' : 's'} available:`,
    );
    for (const {name, meta} of skippedOptional) {
      log.info(`  ${name} — ${meta.title}`);
      if (meta.description) {
        log.info(`    ${meta.description}`);
      }
      log.info(
        `    Run: astryx upgrade --codemod ${name} --path <dir> --apply`,
      );
    }
  }

  return {
    totalFilesChanged,
    totalTransformsApplied,
    totalValidationBlocked,
    changedFiles,
    writtenFiles,
    protectedFiles,
    declinedCandidates: reportedDeclined,
    stagedContents: virtualContents,
    errors,
    skippedOptional,
  };
}
