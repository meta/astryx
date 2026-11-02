// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle.copy leaf — copy a component's source into the consumer project
 * for customization, rewriting escaping relative imports to the OWNER package's
 * subpaths. The copy walks core component directories recursively, so nested
 * source subdirectories (e.g. Table/plugins/*) are preserved in the output,
 * while test-only `__tests__/` and `__snapshots__/` directories are skipped;
 * the overwrite pre-flight and the reported file list share the same
 * recursive file set. Every destination segment is checked before any
 * directory or file is written, even when overwrite is enabled: no symlinks,
 * existing directory segments must be directories, and existing file targets
 * must be regular files. Integration source directories retain their existing
 * flat copy behavior (sorted, like the core walk): their discovery contract
 * identifies an entry file, not an exclusively owned directory tree.
 *
 * Side-effecting: writes files and returns a `swizzle.copy` receipt describing
 * what it did. Shared core discovery + component listing come from
 * api/swizzle/_adapter.mjs; everything here (owner resolution, the copy, import
 * rewriting, StyleX detection, maintainer feedback) is copy-specific. Errors
 * throw AstryxError (stable code + suggestions). All human prose /
 * package-manager prefixing lives in the CLI renderer.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {resolveComponentReplacement, resolveCore} from '../_adapter.mjs';
import {assertWithin, sanitizeName, PathSafetyError} from '../../../foundation/fs/path-safety.mjs';
import {checkGhCli} from '../_github.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {
  CORE_PACKAGE,
  docStem,
  findComponentReadme,
  findIntegrationComponent,
  unscopedComponentOwners,
} from '../../../foundation/discovery/component-discovery.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {AstryxError, writeFailed} from '../../error.mjs';

/** Default issue tracker for maintainer feedback after swizzling. */
const DEFAULT_ISSUES_URL = 'https://github.com/meta/astryx/issues/new';

/**
 * Rewrite relative imports that point outside the component directory to use
 * the OWNER package's subpaths. Imports within the copied directory are left
 * untouched: `./x` always stays, and for a file `depth` levels below the
 * component root an `../` chain only escapes once it has MORE than `depth`
 * leading `../` segments. E.g. in `Table/plugins/selection/x.tsx` (depth 2),
 * `../../types` still resolves inside the copied tree and stays as-is, while
 * `../../../Icon` escapes and is rewritten to `<pkg>/Icon`.
 *
 * e.g. with ownerPackage '@astryxdesign/core':
 *      '../theme/tokens.stylex' -> '@astryxdesign/core/theme/tokens.stylex'
 *      '../utils/mergeProps'     -> '@astryxdesign/core/utils'
 *      '../../locales/en.json'   -> '@astryxdesign/core/locales/en.json'
 *      import('../Tooltip/Tooltip') -> import('@astryxdesign/core/Tooltip')
 *
 * Most sibling dirs are barrels, so the top-dir collapse (`../utils/x` ->
 * `<pkg>/utils`) resolves. Two shapes must NOT be collapsed to the top dir:
 *   - Asset files (`.json`, `.css`): exported by full subpath (e.g.
 *     `./locales/*.json`, `./reset.css`), and collapsing a two-levels-up
 *     `../../locales/x.json` would emit the invalid `<pkg>/..`.
 *   - StyleX modules (`*.stylex`): the StyleX compiler needs the real module
 *     path so it can resolve the styles at compile time. The barrel re-export
 *     loses the module identity. Core exports every `.stylex` file by its
 *     deep subpath (e.g. `./utils/focusOutline.stylex`,
 *     `./theme/tokens.stylex`).
 *
 * @param {string} content
 * @param {string} [ownerPackage]
 * @param {number} [depth] Directory levels the file sits below the component
 *   root (0 for a top-level file like `Table/index.ts`, 2 for
 *   `Table/plugins/selection/index.ts`).
 */
export function rewriteImports(content, ownerPackage = CORE_PACKAGE, depth = 0) {
  /** @param {string} importPath */
  const mapTarget = importPath => {
    // Strip ALL leading `../` so a two-levels-up path never yields `<pkg>/..`.
    const rest = importPath.replace(/^(?:\.\.\/)+/, '');
    const parts = rest.split('/');
    const last = parts[parts.length - 1];
    // Asset files are resolved by exact export / wildcard, never a barrel.
    if (/\.(?:json|css)$/.test(last)) {
      return `${ownerPackage}/${rest}`;
    }
    // StyleX modules need the deep path so the compiler can resolve them.
    if (/\.stylex(?:\.[cm]?[jt]sx?)?$/.test(last)) {
      return `${ownerPackage}/${rest}`;
    }
    return `${ownerPackage}/${parts[0]}`;
  };
  /**
   * Rewrite only when the `../` chain climbs past the file's own depth below
   * the component root; shallower chains resolve inside the copied tree.
   * @param {string} _m
   * @param {string} prefix
   * @param {string} importPath
   * @param {string} suffix
   */
  const rewriteEscaping = (_m, prefix, importPath, suffix) => {
    const up = (importPath.match(/^(?:\.\.\/)+/)?.[0].length ?? 0) / '../'.length;
    if (up <= depth) return `${prefix}${importPath}${suffix}`;
    return `${prefix}${mapTarget(importPath)}${suffix}`;
  };
  return content
    .replace(/(from\s+['"])(\.\.\/[^'"]+)(['"])/g, rewriteEscaping)
    .replace(/(import\(\s*['"])(\.\.\/[^'"]+)(['"])/g, rewriteEscaping);
}

/**
 * Build the maintainer feedback note for a swizzled component.
 * @param {string} component
 * @param {string|undefined} issuesUrl
 * @returns {{issuesUrl: string, ghCommand?: string} | null}
 */
function buildFeedback(component, issuesUrl) {
  if (!issuesUrl) return null;
  /** @type {{issuesUrl: string, ghCommand?: string}} */
  const feedback = {issuesUrl};
  const match = issuesUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues(?:\/new)?\/?$/,
  );
  if (match && checkGhCli()) {
    const [, owner, repo] = match;
    feedback.ghCommand = `gh issue create --repo ${owner}/${repo} --title "[${component}] Swizzle feedback"`;
  }
  return feedback;
}

/**
 * Load the configured integrations + core issues URL for `cwd`, swallowing any
 * config errors so swizzle never hard-fails on a malformed/absent config.
 * @param {string} cwd
 * @returns {Promise<{loadedIntegrations: import('../../../foundation/integrations/integrations.mjs').LoadedIntegration[], issuesUrl: string|undefined, project: Project|null}>}
 */
async function loadConfigSafely(cwd) {
  try {
    const project = await Project.load(cwd, {core: 'project'});
    return {
      loadedIntegrations: project.loadedIntegrations,
      issuesUrl: project.config.issuesUrl,
      project,
    };
  } catch {
    return {loadedIntegrations: [], issuesUrl: undefined, project: null};
  }
}

/**
 * Build the set of OWNER packages that provide a component named `name` across
 * core + every loaded integration. Core holds every name it documents, but has
 * source to copy (`sourceDir`) only for a name with its own folder.
 * @param {string} coreDir
 * @param {Array<{name: string, components?: string, issuesUrl?: string}>} loadedIntegrations
 * @param {string} name
 * @param {string|undefined} coreIssuesUrl
 * @returns {Array<{package: string, sourceDir: string|null, docPath: string|null, ownerPackage: string, issuesUrl: string|undefined, hold: string}>}
 */
function resolveOwners(coreDir, loadedIntegrations, name, coreIssuesUrl) {
  const owners = [];
  const coreComponentDir = path.join(coreDir, 'src', name);
  const coreFolder = fs.existsSync(coreComponentDir);
  if (coreFolder || findComponentReadme(coreDir, name)) {
    owners.push({
      package: CORE_PACKAGE,
      sourceDir: coreFolder ? coreComponentDir : null,
      docPath: null,
      ownerPackage: CORE_PACKAGE,
      issuesUrl: coreIssuesUrl || DEFAULT_ISSUES_URL,
      hold: 'core',
    });
  }
  for (const integration of loadedIntegrations) {
    const found = findIntegrationComponent(integration, name);
    if (!found) continue;
    owners.push({
      package: integration.name,
      sourceDir: found.sourcePath ? path.dirname(found.sourcePath) : null,
      docPath: found.docPath,
      ownerPackage: integration.name,
      issuesUrl: integration.issuesUrl,
      hold: found.hold,
    });
  }
  return owners;
}

/**
 * `assertWithin`, with an escape reported as ERR_PATH_TRAVERSAL.
 * @param {string} target
 * @param {string} cwd
 * @param {{allowAbsolute?: boolean, label: string}} options
 * @returns {string}
 */
function confineWrite(target, cwd, options) {
  try {
    return assertWithin(target, cwd, options);
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new AstryxError(err.message, [], ERROR_CODES.ERR_PATH_TRAVERSAL);
    }
    throw err;
  }
}

/** @param {string} file */
function isExcludedFromCopy(file) {
  return (
    file.includes('.test.') || file.includes('.doc.') || file === 'README.md'
  );
}

/**
 * Test-only directories the recursive walk never enters, at any depth.
 * @type {ReadonlySet<string>}
 */
const TEST_ONLY_DIRS = new Set(['__tests__', '__snapshots__']);

/**
 * Recursively collect a component's copyable source files as POSIX-style paths
 * relative to `dir`, preserving nested directory structure (e.g. Table's
 * `plugins/selection/index.ts`). Test-only directories (TEST_ONLY_DIRS) are
 * skipped whole: their files are not all named `.test.` (e.g.
 * `__tests__/Button.a11y.harnesses.tsx`, `*.a11y.chromium.spec.ts`) and import
 * dev-only packages such as the unpublished `@astryxdesign/a11y-spec`, so the
 * basename filter alone would copy files a consumer cannot resolve. Every
 * other directory is descended into, and files are filtered by basename
 * (isExcludedFromCopy). The copy loop creates directories on demand per file,
 * so a directory with no copyable files never appears in the output.
 * @param {string} dir Absolute directory to walk.
 * @param {string} [prefix] Relative path of `dir` below the component root.
 * @returns {string[]} Sorted relative file paths.
 */
function collectSourceFiles(dir, prefix = '') {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (TEST_ONLY_DIRS.has(entry.name)) continue;
      files.push(...collectSourceFiles(path.join(dir, entry.name), rel));
    } else if (entry.isFile() && !isExcludedFromCopy(entry.name)) {
      files.push(rel);
    }
  }
  return files.sort();
}

/**
 * Validate every destination segment below cwd before any directory or file is
 * written, regardless of overwrite, so a bad path late in the sorted plan
 * cannot leave earlier files already replaced. No segment may be a symlink
 * (ERR_PATH_TRAVERSAL); lstat also sees dangling links, which existsSync would
 * miss. An existing directory segment (outputDir, its ancestors, a nested
 * source directory) must be a directory, and an existing file target must be
 * a regular file (ERR_WRITE_FAILED). Parents are checked before children, so a
 * lstat below a non-directory never raises a raw ENOTDIR. Messages name paths
 * relative to cwd. The caller has already confined outputDir to cwd; with no
 * symlink below cwd, no planned file can resolve outside it either, so this
 * also covers the per-file confinement.
 * @param {string} cwd
 * @param {string} outputDir
 * @param {string[]} files Paths relative to outputDir.
 */
function checkDestinationPaths(cwd, outputDir, files) {
  const root = path.resolve(cwd);
  /** @type {Set<string>} */
  const checked = new Set();
  /** @param {string} message */
  const refuseWrite = message =>
    new AstryxError(`${message} Nothing was written.`, [], ERROR_CODES.ERR_WRITE_FAILED);
  /** @type {Array<[string, boolean]>} */
  const targets = [
    [outputDir, false],
    ...files.map(file => /** @type {[string, boolean]} */ ([path.join(outputDir, file), true])),
  ];
  for (const [target, isFile] of targets) {
    const parts = path.relative(root, target).split(path.sep);
    let segment = root;
    for (const [i, part] of parts.entries()) {
      segment = path.join(segment, part);
      if (checked.has(segment)) continue;
      checked.add(segment);
      const rel = path.relative(root, segment);
      let stat;
      try {
        stat = fs.lstatSync(segment, {throwIfNoEntry: false});
      } catch (err) {
        const errno = /** @type {NodeJS.ErrnoException} */ (err).code;
        if (typeof errno !== 'string') throw err;
        throw refuseWrite(`Could not write ${rel}: ${errno}.`);
      }
      // Nothing exists here yet, so nothing deeper can exist either.
      if (!stat) break;
      if (stat.isSymbolicLink()) {
        throw new AstryxError(
          `Refusing to write through destination symlink "${rel}".`,
          [],
          ERROR_CODES.ERR_PATH_TRAVERSAL,
        );
      }
      if (isFile && i === parts.length - 1) {
        if (!stat.isFile()) {
          throw refuseWrite(
            `Could not write ${rel}: it exists and is ${stat.isDirectory() ? 'a directory' : 'not a regular file'}.`,
          );
        }
      } else if (!stat.isDirectory()) {
        throw refuseWrite(`Could not write into ${rel}: it exists and is not a directory.`);
      }
    }
  }
}

/**
 * Copy one component's source into the consumer project for customization,
 * rewriting escaping relative imports to the owner package's subpaths.
 *
 * @param {string} component bare or XDS-prefixed component name
 * @param {{cwd?: string, output?: string, package?: string, overwrite?: boolean}} [options]
 * @returns {Promise<import('../swizzle.type.mjs').SwizzleCopyResponse>}
 */
export async function swizzleCopy(component, options = {}) {
  const {
    cwd = process.cwd(),
    output = './components/astryx',
    package: pkg,
    overwrite = false,
  } = options;

  const {coreDir, components} = resolveCore(cwd);

  const dirName = component.replace(/^XDS/, '');

  // The component name becomes a path segment in the output dir
  // (path.join(outputBase, dirName)), so a name containing `..` or a separator
  // would escape the assertWithin(output) guard. Reject it up front — a real
  // component name is a bare identifier.
  try {
    sanitizeName(dirName, {label: 'component name'});
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new AstryxError(err.message, [], ERROR_CODES.ERR_PATH_TRAVERSAL);
    }
    throw err;
  }

  const {loadedIntegrations, project} = await loadConfigSafely(cwd);
  const coreIssuesUrl = project
    ? project.issuesUrl({package: CORE_PACKAGE})
    : undefined;
  // An active integration replacement answers to the Core name it replaces,
  // bare or qualified by its own package (spec:AST-035 FR11): copy it under its
  // doc's file name, the folder it has always gone to. `--package
  // @astryxdesign/core` still copies the Core original.
  if (pkg !== CORE_PACKAGE) {
    const replacement = await resolveComponentReplacement(
      coreDir,
      loadedIntegrations,
      dirName,
    );
    const copyName = replacement ? docStem(replacement.docPath) : null;
    if (
      replacement &&
      copyName &&
      (!pkg || (pkg === replacement.package && copyName !== dirName))
    ) {
      return swizzleCopy(copyName, {
        ...options,
        package: replacement.package,
      });
    }
  }

  const found = resolveOwners(coreDir, loadedIntegrations, dirName, coreIssuesUrl);
  // The owner rule, then a Core name without its own folder drops out.
  const allOwners = (pkg ? found : unscopedComponentOwners(found)).filter(
    owner => owner.package !== CORE_PACKAGE || owner.sourceDir != null,
  );

  if (allOwners.length === 0) {
    throw new AstryxError(
      `Component "${component}" not found.`,
      components.slice(0, 10).map(n => ({name: n})),
      ERROR_CODES.ERR_UNKNOWN_COMPONENT,
    );
  }

  let owner;
  if (pkg) {
    owner = allOwners.find(o => o.package === pkg);
    if (!owner) {
      throw new AstryxError(
        `Component "${dirName}" is not provided by package "${pkg}".`,
        allOwners.map(o => ({name: o.package, reason: 'provides this component'})),
        ERROR_CODES.ERR_UNKNOWN_COMPONENT,
      );
    }
  } else if (allOwners.length > 1) {
    throw new AstryxError(
      `Component "${dirName}" is provided by multiple packages. Re-run with --package <pkg> to choose one.`,
      allOwners.map(o => ({name: o.package, reason: 'provides this component'})),
      ERROR_CODES.ERR_AMBIGUOUS_COMPONENT,
    );
  } else {
    owner = allOwners[0];
  }

  if (!owner.sourceDir || !fs.existsSync(owner.sourceDir)) {
    throw new AstryxError(
      `No source found for "${dirName}" in package "${owner.package}".`,
      [],
      ERROR_CODES.ERR_NO_SOURCE,
    );
  }

  const componentDir = owner.sourceDir;

  // Path-safety: every write target resolves inside cwd, not just --output. An
  // existing component directory or file may be a symlink out of cwd.
  const outputBase = confineWrite(output, cwd, {label: 'output directory'});
  const outputDir = path.join(outputBase, dirName);

  // Pre-flight path and overwrite checks before any mkdir/writeFile. The same
  // sorted file set drives these checks, the copy loop, and the reported
  // files, so nested core source (e.g. Table/plugins/*) is visible to all of
  // them and the receipt order does not depend on readdir order.
  const sourceFiles = owner.package === CORE_PACKAGE
    ? collectSourceFiles(componentDir)
    : fs.readdirSync(componentDir).filter(file =>
      !isExcludedFromCopy(file) && fs.statSync(path.join(componentDir, file)).isFile(),
    ).sort();
  checkDestinationPaths(cwd, outputDir, sourceFiles);
  const existingFiles = sourceFiles.filter(f =>
    fs.existsSync(path.join(outputDir, f)),
  );
  if (existingFiles.length > 0 && !overwrite) {
    const relOutputForMsg = path.relative(cwd, outputDir) || '.';
    throw new AstryxError(
      `Refusing to overwrite ${existingFiles.length} existing file(s) in ${relOutputForMsg}/. ` +
        `Re-run with --overwrite (or -f) to replace them.`,
      [],
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }

  const outputDirExisted = fs.existsSync(outputDir);
  try {
    fs.mkdirSync(outputDir, {recursive: true});
  } catch (err) {
    throw writeFailed(outputDir, cwd, err);
  }

  let usesStyleX = false;
  // A copy that fails part-way undoes what it already wrote, so the report is
  // true and a retry does not trip over half a component. Each entry keeps
  // the bytes the file had before this run (null when the copy created it).
  /** @type {Array<{dest: string, original: Buffer|null}>} */
  const written = [];
  // Directories this run created (parents first): the output directory when
  // it was new, and nested source directories such as `plugins/selection`.
  /** @type {string[]} */
  const createdDirs = outputDirExisted ? [] : [outputDir];
  for (const file of sourceFiles) {
    const srcPath = path.join(componentDir, file);
    let content = fs.readFileSync(srcPath, 'utf-8');
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // The file's depth below the component root decides which `../` chains
      // escape the copied tree and need rewriting to the owner package.
      content = rewriteImports(
        content,
        owner.ownerPackage,
        file.split('/').length - 1,
      );
    }
    if (
      (file.endsWith('.ts') || file.endsWith('.tsx')) &&
      content.includes('@stylexjs/stylex')
    ) {
      usesStyleX = true;
    }
    const dest = path.join(outputDir, file);
    try {
      makeDirs(path.dirname(dest), createdDirs);
      // The snapshot read is guarded too: a destination that cannot be read
      // back (no permission, or a directory with this name) must still undo
      // the earlier writes and report ERR_WRITE_FAILED.
      const original = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
      written.push({dest, original});
      fs.writeFileSync(dest, content);
    } catch (err) {
      const unrestored = undoCopy(written);
      for (const dir of [...createdDirs].reverse()) {
        try {
          fs.rmdirSync(dir);
        } catch {
          // Not empty (something could not be undone), or already gone.
        }
      }
      throw writeFailed(dest, cwd, err, unrestored);
    }
  }

  const relOutput = path.relative(cwd, outputDir);
  const feedback = buildFeedback(dirName, owner.issuesUrl);

  /** @type {import('../swizzle.type.mjs').SwizzleCopyResponse['data']} */
  const data = {
    component: dirName,
    package: owner.package,
    outputDir: relOutput,
    filesCopied: sourceFiles.length,
    files: sourceFiles,
    usesStyleX,
  };
  if (feedback) data.feedback = feedback;
  return {type: 'swizzle.copy', package: data.package, data};
}

/**
 * Create `dir` and any missing parents, recording each directory it creates
 * (parents first) in `created` so a failed copy can remove them again. The
 * output directory already exists, so the walk stops there.
 *
 * @param {string} dir
 * @param {string[]} created
 */
function makeDirs(dir, created) {
  if (fs.existsSync(dir)) return;
  makeDirs(path.dirname(dir), created);
  fs.mkdirSync(dir);
  created.push(dir);
}

/**
 * Undo the writes of a copy that failed part-way, newest first: delete the
 * files the copy created and put back the bytes of the files it replaced. A
 * file whose bytes are already the original ones is left alone, so a write
 * that failed before changing anything is not reported as unrestored.
 *
 * @param {Array<{dest: string, original: Buffer|null}>} written
 * @returns {string[]} the files it could not restore
 */
function undoCopy(written) {
  /** @type {string[]} */
  const unrestored = [];
  for (const {dest, original} of [...written].reverse()) {
    try {
      if (original == null) {
        fs.rmSync(dest, {force: true});
        continue;
      }
      /** @type {Buffer|null} */
      let current = null;
      try {
        current = fs.readFileSync(dest);
      } catch {
        current = null;
      }
      if (current == null || !current.equals(original)) {
        fs.writeFileSync(dest, original);
      }
    } catch {
      unrestored.push(dest);
    }
  }
  return unrestored;
}
