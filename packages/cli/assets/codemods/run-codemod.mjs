// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared codemod execution primitives.
 *
 * Both the core registry runner (`runner.mjs` / `upgrade.mjs`) and the
 * integration runner (`integration-runner.mjs`) execute codemods that follow
 * the unified file-based contract:
 *
 *   (file, api) => string | null | undefined
 *
 * where `file` is `{path, source}` and `api` is
 * `{jscodeshift, stats, report}`. Config codemods target the consumer's
 * astryx.config.* file; code codemods are applied to source files discovered
 * under `--path`, filtered by each codemod's `fileExtensions`.
 *
 * A codemod ENTRY is normalized to a single shape across both callers:
 *
 *   {id, type: 'code' | 'config', codemod: {title, transform, fileExtensions?,
 *    isOptional?}, package, version}
 *
 * Integration discovery emits this shape directly. The core registry stores
 * entries as `{name, transform, meta}`; `runner.mjs` normalizes those to this
 * shape at the boundary (see `runner.mjs`).
 *
 * Both kinds reuse the shared output validation from runner.mjs and surface a
 * transform throw as an error (strictness contract).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as p from './term-log.mjs';
import {findConfigPath} from '../../foundation/config/project.mjs';
import {
  fixDirectiveCorruption,
  validateOutput,
  isIgnoredDirectory,
  isIgnoredLinkedDirectory,
} from './runner.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';
import {isCodemodParseError, markingSourceParseErrors} from './parse.mjs';

export const DEFAULT_CODE_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.cjs',
];
const PARSEABLE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];

/**
 * @typedef {{file: string, codemod: string, reason: string, declaration: string, generated: boolean, command?: string}} ProtectedFile
 */

/**
 * Convert every effective protection declaration into the stable codemod result
 * shape. A file can carry more than one additive declaration.
 * @param {string} filePath
 * @param {string} name
 * @param {{root: string, classify: (file: string) => import('../../foundation/fs/file-protection.mjs').FileProtection[]}} protection
 * @returns {ProtectedFile[]}
 */
function protectedResult(filePath, name, protection) {
  return protection.classify(filePath).map(item => ({
    file: item.file,
    codemod: name,
    reason: item.reason,
    declaration: item.declaration,
    generated: item.reason === 'generated',
    ...(item.command ? {command: item.command} : {}),
  }));
}

/**
 * @typedef {{file: string, codemod: string, location?: string, reason: string}} DeclinedCandidate
 */

/**
 * Where a parse error points, as 1-based `line:column`, and its message
 * without the position Babel appends. Babel reports a 0-based column on
 * `loc`; PostCSS reports 1-based `line` and `column`.
 * @param {any} err
 * @returns {{message: string, location?: string}}
 */
function describeParseError(err) {
  if (err?.name === 'CssSyntaxError') {
    return {
      message: String(err.reason ?? err.message),
      ...(typeof err.line === 'number'
        ? {location: `${err.line}:${err.column ?? 1}`}
        : {}),
    };
  }
  const loc = err?.loc;
  return {
    message: String(err?.message ?? err).replace(/\s*\(\d+:\d+\)$/, ''),
    ...(loc && typeof loc.line === 'number'
      ? {location: `${loc.line}:${(loc.column ?? 0) + 1}`}
      : {}),
  };
}

/**
 * Decline a protected file a codemod could not parse. A codemod can prove
 * nothing in bytes it cannot parse, and the file is never written anyway, so
 * it is listed for manual review instead of failing the run. Only an error a
 * parse entry point marked (see `parse.mjs`) counts: owned source that does
 * not parse, and every other error a codemod throws, still fail.
 * @param {unknown} err
 * @param {string} filePath
 * @param {string} relativePath
 * @param {string} name
 * @param {{root: string, classify: (file: string) => import('../../foundation/fs/file-protection.mjs').FileProtection[]}} protection
 * @returns {DeclinedCandidate|null}
 */
function declineUnparseableProtected(
  err,
  filePath,
  relativePath,
  name,
  protection,
) {
  if (!isCodemodParseError(err)) return null;
  const protections = protection.classify(filePath);
  if (protections.length === 0) return null;
  const {message, location} = describeParseError(err);
  return {
    file: relativePath,
    codemod: name,
    ...(location ? {location} : {}),
    // The category, not the declaration: a declaration names its source
    // file from the project root, and `file` may be rebased elsewhere.
    reason: `unparseable protected file (${[...new Set(protections.map(item => item.reason))].join(', ')}): ${message}`,
  };
}

/**
 * Print one blocked candidate without implying that the protected bytes changed.
 * @param {import('../../authoring/codemod/type').CliLog} log
 * @param {ProtectedFile[]} protections
 */
function logProtected(log, protections) {
  const [first] = protections;
  log.warn(
    `    ! ${first.file} — protected by ${protections.map(item => item.declaration).join('; ')}`,
  );
}

/**
 * Recursively find candidate source files in a directory.
 * @param {string} dir
 * @param {string} [root] the operation's project root (default: `dir`)
 * @returns {string[]}
 */
export function findSourceFiles(dir, root = dir) {
  /** @type {string[]} */
  const results = [];
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
          if (target.isFile()) results.push(fullPath);
          else if (
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
        if (isIgnoredDirectory(dir, fullPath, entry.name)) continue;
        walk(fullPath, nextAncestors);
      } else {
        results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results.sort();
}

/**
 * No-op log surface for silent (`--json`) mode.
 * @param {boolean} silent
 * @returns {import('../../authoring/codemod/type').CliLog}
 */
export function makeLog(silent) {
  return silent
    ? {step() {}, info() {}, success() {}, warn() {}, error() {}, message() {}}
    : p.log;
}

/**
 * Apply a config codemod to the consumer's astryx.config.* file.
 *
 * @param {import('../../authoring/codemod/type').CodemodEntry} entry normalized codemod entry {id, codemod, package}
 * @param {{apply: boolean, log: import('../../authoring/codemod/type').CliLog, jscodeshift: import('../../authoring/codemod/type').JscodeshiftFactory, root?: string, protection: {root: string, classify: (file: string) => import('../../foundation/fs/file-protection.mjs').FileProtection[]}, contents?: Map<string, string>}} ctx
 * @returns {import('../../authoring/codemod/type').CodemodRunResult}
 */
export function runConfigCodemod(
  entry,
  {apply, log, jscodeshift, root = process.cwd(), protection, contents},
) {
  const {codemod, id, package: pkg} = entry;
  const name = `${pkg}:${id}`;
  const resolver = protection ?? createFileProtectionResolver(root);
  let configPath;
  try {
    configPath = findConfigPath(root);
  } catch (err) {
    const message = /** @type {any} */ (err).message;
    log.error(`    ✗ astryx.config.* — ${message}`);
    return {
      filesChanged: 0,
      changedFiles: [],
      writtenFiles: [],
      protectedFiles: [],
      errors: [{file: 'astryx.config.*', codemod: name, error: message}],
    };
  }
  if (!configPath) {
    log.info(`  ${codemod.title} — no astryx.config.* found; skipping.`);
    return {
      filesChanged: 0,
      changedFiles: [],
      writtenFiles: [],
      protectedFiles: [],
      errors: [],
    };
  }

  const relativePath = path.relative(root, configPath);
  try {
    const source =
      contents?.get(configPath) ?? fs.readFileSync(configPath, 'utf-8');
    const ext = path.extname(configPath);
    const parser = ext === '.tsx' || ext === '.ts' ? 'tsx' : 'babel';
    const j = jscodeshift.withParser(parser);
    const api = {jscodeshift: j, stats: () => {}, report: () => {}};
    let result = codemod.transform({source, path: configPath}, api);

    if (result == null || result === source) {
      return {
        filesChanged: 0,
        changedFiles: [],
        writtenFiles: [],
        protectedFiles: [],
        errors: [],
      };
    }

    result = fixDirectiveCorruption(result);
    const validation = validateOutput(result, source, j, {
      parse: PARSEABLE_EXTENSIONS.includes(ext),
    });
    if (!validation.valid) {
      log.error(`    ✗ ${relativePath} — ${validation.reason}`);
      return {
        filesChanged: 0,
        changedFiles: [],
        writtenFiles: [],
        protectedFiles: [],
        errors: [{file: relativePath, codemod: name, error: validation.reason}],
      };
    }

    const protectedFiles = protectedResult(configPath, name, resolver);
    if (protectedFiles.length > 0) {
      logProtected(log, protectedFiles);
      return {
        filesChanged: 0,
        changedFiles: [],
        writtenFiles: [],
        protectedFiles,
        errors: [],
      };
    }

    contents?.set(configPath, result);
    if (apply) {
      fs.writeFileSync(configPath, result, 'utf-8');
      log.success(`    ✓ ${relativePath}`);
    } else {
      log.warn(`    ~ ${relativePath} (would change)`);
    }
    return {
      filesChanged: 1,
      changedFiles: [configPath],
      writtenFiles: apply ? [configPath] : [],
      protectedFiles: [],
      errors: [],
    };
  } catch (err) {
    const message = /** @type {any} */ (err).message;
    log.error(`    ✗ ${relativePath} — ${message}`);
    return {
      filesChanged: 0,
      changedFiles: [],
      writtenFiles: [],
      protectedFiles: [],
      errors: [{file: relativePath, codemod: name, error: message}],
    };
  }
}

/**
 * Apply a code codemod to discovered source files.
 *
 * @param {import('../../authoring/codemod/type').CodemodEntry} entry normalized codemod entry {id, codemod, package}
 * @param {string[]} files
 * @param {{apply: boolean, log: import('../../authoring/codemod/type').CliLog, jscodeshift: import('../../authoring/codemod/type').JscodeshiftFactory, root?: string, protection: {root: string, classify: (file: string) => import('../../foundation/fs/file-protection.mjs').FileProtection[]}, contents?: Map<string, string>}} ctx
 * @returns {import('../../authoring/codemod/type').CodemodRunResult}
 */
export function runCodeCodemod(
  entry,
  files,
  {apply, log, jscodeshift, root = process.cwd(), protection, contents},
) {
  const {codemod, id, package: pkg} = entry;
  const name = `${pkg}:${id}`;
  const resolver = protection ?? createFileProtectionResolver(root);
  const extensions = new Set(codemod.fileExtensions ?? DEFAULT_CODE_EXTENSIONS);

  let filesChanged = 0;
  /** @type {string[]} */
  const changedFiles = [];
  /** @type {string[]} */
  const writtenFiles = [];
  /** @type {ProtectedFile[]} */
  const protectedFiles = [];
  /** @type {Array<{file: string, codemod: string, error: string}>} */
  const errors = [];
  /** @type {DeclinedCandidate[]} */
  const declinedCandidates = [];
  /** @type {Array<{filePath: string, relativePath: string, result: string}>} */
  const candidates = [];

  // Transform and validate every candidate before any write. This lets a
  // protection source changed by this entry govern every other staged output.
  for (const filePath of files) {
    const ext = path.extname(filePath);
    if (!extensions.has(ext)) continue;

    const relativePath = path.relative(root, filePath);
    try {
      const source =
        contents?.get(filePath) ?? fs.readFileSync(filePath, 'utf-8');
      const parser = ext === '.tsx' || ext === '.ts' ? 'tsx' : 'babel';
      const j = jscodeshift.withParser(parser);
      const api = {
        jscodeshift: markingSourceParseErrors(j, source),
        stats: () => {},
        report: () => {},
      };
      let result = codemod.transform({source, path: filePath}, api);

      if (result == null || result === source) continue;

      result = fixDirectiveCorruption(result);
      const validation = validateOutput(result, source, j, {
        parse: PARSEABLE_EXTENSIONS.includes(ext),
      });
      if (!validation.valid) {
        log.error(`    ✗ ${relativePath} — ${validation.reason}`);
        errors.push({
          file: relativePath,
          codemod: name,
          error: validation.reason,
        });
        continue;
      }
      candidates.push({filePath, relativePath, result});
    } catch (err) {
      const declined = declineUnparseableProtected(
        err,
        filePath,
        relativePath,
        name,
        resolver,
      );
      if (declined) {
        // Printed by the caller once every codemod has run: a later codemod
        // can still make this file a protected one, listed only as such.
        declinedCandidates.push(declined);
        continue;
      }
      const message = /** @type {any} */ (err).message;
      log.error(`    ✗ ${relativePath} — ${message}`);
      errors.push({file: relativePath, codemod: name, error: message});
    }
  }

  /** @type {Map<string, ProtectedFile[]>} */
  const currentProtections = new Map();
  /** @type {Map<string, string|null>} */
  const stagedContents = new Map(contents ?? []);
  for (const candidate of candidates) {
    const blocked = protectedResult(candidate.filePath, name, resolver);
    currentProtections.set(candidate.filePath, blocked);
    if (blocked.length === 0) {
      stagedContents.set(candidate.filePath, candidate.result);
    }
  }
  const stagedResolver = createFileProtectionResolver(root, {
    overrides: stagedContents,
  });

  for (const candidate of candidates) {
    const blocked = [
      ...(currentProtections.get(candidate.filePath) ?? []),
      ...protectedResult(candidate.filePath, name, stagedResolver),
    ].filter(
      (item, index, all) =>
        all.findIndex(
          candidateItem =>
            candidateItem.file === item.file &&
            candidateItem.reason === item.reason &&
            candidateItem.declaration === item.declaration,
        ) === index,
    );
    if (blocked.length > 0) {
      protectedFiles.push(...blocked);
      logProtected(log, blocked);
      continue;
    }

    filesChanged++;
    changedFiles.push(candidate.filePath);
    contents?.set(candidate.filePath, candidate.result);
    if (apply) {
      fs.writeFileSync(candidate.filePath, candidate.result, 'utf-8');
      writtenFiles.push(candidate.filePath);
      log.success(`    ✓ ${candidate.relativePath}`);
    } else {
      log.warn(`    ~ ${candidate.relativePath} (would change)`);
    }
  }

  return {
    filesChanged,
    changedFiles,
    writtenFiles,
    protectedFiles,
    declinedCandidates,
    errors,
  };
}
