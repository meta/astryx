// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle.copy leaf — copy a component's source into the consumer project
 * for customization, rewriting escaping relative imports to the OWNER package's
 * subpaths.
 *
 * A Core component is copied with its nested folders (Table's `plugins/`),
 * test-only folders and harness files left out; an integration component's
 * folder is copied flat. Every destination is checked before anything is
 * written: it stays inside the project, through any symlink, and nothing of
 * the wrong kind is in its place.
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
import {
  checkGhCli,
  resolveComponentReplacement,
  resolveCore,
} from '../_adapter.mjs';
import {assertWithin, sanitizeName, PathSafetyError} from '../../../foundation/fs/path-safety.mjs';
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
 * the OWNER package's subpaths. Imports within the copied directory (./x) are
 * left untouched.
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
 * @param {(importPath: string) => boolean} [keep] Imports to leave relative:
 *   the modules the copy carries in the same layout (see `sharedModulesOf`).
 */
export function rewriteImports(content, ownerPackage = CORE_PACKAGE, keep = () => false) {
  /** @param {string} importPath */
  const mapTarget = importPath => {
    // A module the copy carries beside the component keeps its relative path.
    if (keep(importPath)) {
      return importPath;
    }
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
  return content
    .replace(
      /(from\s+['"])(\.\.\/[^'"]+)(['"])/g,
      (_m, prefix, importPath, suffix) =>
        `${prefix}${mapTarget(importPath)}${suffix}`,
    )
    .replace(
      /(import\(\s*['"])(\.\.\/[^'"]+)(['"])/g,
      (_m, prefix, importPath, suffix) =>
        `${prefix}${mapTarget(importPath)}${suffix}`,
    );
}

/** A private data attribute's owner module (`architecture:public-component-api` INV23). */
const OWNER_MODULE = /^privateAttributes\/[^/]+\.stylex$/;
/** A StyleX module, with or without its file extension. */
const STYLEX_MODULE = /\.stylex(?:\.[cm]?[jt]sx?)?$/;
/** The extensions an extensionless import may name, in resolution order. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

/**
 * The relative import specifiers in a module's source.
 * @param {string} content
 * @returns {string[]}
 */
function relativeImportsOf(content) {
  const found = [];
  for (const re of [
    /from\s+['"](\.\.?\/[^'"]+)['"]/g,
    /import\(\s*['"](\.\.?\/[^'"]+)['"]/g,
  ]) {
    for (const m of content.matchAll(re)) found.push(m[1]);
  }
  return found;
}

/**
 * The source file an import resolves to under `srcRoot`, as a path relative to
 * `srcRoot` without its extension (`privateAttributes/press.stylex`), and the
 * file's own relative path; null when it resolves outside `srcRoot` or to no
 * file.
 * @param {string} srcRoot
 * @param {string} fromDir directory of the importing file, relative to srcRoot
 * @param {string} importPath
 * @returns {{module: string, file: string} | null}
 */
function resolveSourceModule(srcRoot, fromDir, importPath) {
  const module = path.posix.normalize(path.posix.join(fromDir, importPath));
  if (module.startsWith('..') || path.posix.isAbsolute(module)) return null;
  for (const ext of ['', ...SOURCE_EXTENSIONS]) {
    const file = module + ext;
    const abs = path.join(srcRoot, file);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return {
        module: ext ? module : module.replace(/\.[cm]?[jt]sx?$/, ''),
        file,
      };
    }
  }
  return null;
}

/**
 * The subpaths the owner package exports (`./theme/tokens.stylex`), read from
 * the nearest package.json above its source root.
 * @param {string} srcRoot
 * @returns {Set<string>}
 */
function exportedSubpathsOf(srcRoot) {
  let dir = srcRoot;
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        const {exports} = JSON.parse(fs.readFileSync(manifest, 'utf-8'));
        return new Set(
          exports && typeof exports === 'object' ? Object.keys(exports) : [],
        );
      } catch {
        return new Set();
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return new Set();
    dir = parent;
  }
}

/**
 * The modules a copy carries beside the component, in the package's own
 * layout under the output directory (`spec:AST-110` FR4): each private
 * attribute owner module the component imports, and every unexported StyleX
 * module such a carried module imports, transitively. The component's own
 * imports of them, and theirs of each other, stay relative.
 *
 * @param {string} srcRoot the owner package's source root
 * @param {string} componentDir
 * @param {string[]} componentFiles files of the component that are copied,
 *   relative to `componentDir` with `/` separators
 * @returns {Map<string, string>} module path (relative to srcRoot, no
 *   extension) -> its file path relative to srcRoot
 */
export function sharedModulesOf(srcRoot, componentDir, componentFiles) {
  const exported = exportedSubpathsOf(srcRoot);
  const componentRel = path
    .relative(srcRoot, componentDir)
    .split(path.sep)
    .join('/');
  /** @type {Map<string, string>} */
  const carried = new Map();
  /** @type {Array<{fromDir: string, content: string, owner: boolean}>} */
  const queue = componentFiles
    .filter(f => /\.[cm]?[jt]sx?$/.test(f))
    .map(f => ({
      fromDir: path.posix.join(componentRel, path.posix.dirname(f)),
      content: fs.readFileSync(path.join(componentDir, f), 'utf-8'),
      owner: false,
    }));
  while (queue.length > 0) {
    const {fromDir, content, owner} = /** @type {typeof queue[number]} */ (
      queue.shift()
    );
    for (const importPath of relativeImportsOf(content)) {
      const target = resolveSourceModule(srcRoot, fromDir, importPath);
      if (target == null || carried.has(target.module)) continue;
      if (target.module.startsWith(componentRel + '/')) continue;
      const isOwner = OWNER_MODULE.test(target.module);
      // A carried module's unexported StyleX dependency travels with it; a
      // component's own imports of other modules are rewritten as before.
      const isPrivateStyle =
        owner &&
        STYLEX_MODULE.test(target.module) &&
        !exported.has(`./${target.module}`);
      if (!isOwner && !isPrivateStyle) continue;
      carried.set(target.module, target.file);
      queue.push({
        fromDir: path.posix.dirname(target.module),
        content: fs.readFileSync(path.join(srcRoot, target.file), 'utf-8'),
        owner: true,
      });
    }
  }
  return carried;
}

/**
 * A `keep` predicate for `rewriteImports`: true for an import that names one
 * of the carried modules from a file in `fromDir`, or, with `componentRel`, a
 * file of the copied component itself (`../types` from `Table/plugins/`).
 * @param {Map<string, string>} carried
 * @param {string} fromDir relative to the source root
 * @param {string} [componentRel] the component's folder, relative to the
 *   source root
 * @returns {(importPath: string) => boolean}
 */
function keepCarried(carried, fromDir, componentRel) {
  return importPath => {
    const target = path.posix.normalize(path.posix.join(fromDir, importPath));
    if (componentRel != null && target.startsWith(componentRel + '/')) {
      return true;
    }
    return carried.has(target.replace(/\.[cm]?[jt]sx?$/, ''));
  };
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
    file.includes('.test.') ||
    file.includes('.doc.') ||
    file === 'README.md' ||
    // Browser test harnesses import dev-only packages a consumer cannot resolve.
    /\.spec\.[cm]?[jt]sx?$/.test(file)
  );
}

/** Test-only folders a copy never enters, at any depth. */
const TEST_ONLY_DIRS = new Set(['__tests__', '__snapshots__']);

/**
 * A component's copyable files, relative to `dir` with `/` separators and
 * sorted. With `nested`, folders are walked too (Table's
 * `plugins/selection/index.ts`), except test-only ones: their files are not
 * all named `.test.` and import dev-only packages.
 * @param {string} dir
 * @param {boolean} nested
 * @param {string} [prefix] the path of `dir` below the component folder
 * @returns {string[]}
 */
function componentFilesOf(dir, nested, prefix = '') {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      if (nested && !TEST_ONLY_DIRS.has(entry.name)) {
        files.push(...componentFilesOf(abs, nested, rel));
      }
    } else if (stat.isFile() && !isExcludedFromCopy(entry.name)) {
      files.push(rel);
    }
  }
  return files.sort();
}

/**
 * Refuse, before anything is written and whatever `overwrite` says, a
 * destination that something of the wrong kind already holds: a file where a
 * folder must go, or a folder where a file must go. Symlinks are followed;
 * `confineWrite` has already kept every destination inside the project, so a
 * folder linked elsewhere in the project is written through (`spec:AST-017`
 * FR1, FR5). Parents are checked before children, so no check below a file
 * raises a raw ENOTDIR.
 * @param {string} cwd
 * @param {string[]} dirs folders the copy writes into
 * @param {string[]} files files the copy writes
 */
function checkDestinationKinds(cwd, dirs, files) {
  const root = path.resolve(cwd);
  /** @type {Set<string>} */
  const checked = new Set();
  /** @param {string} message */
  const refuse = message =>
    new AstryxError(
      `${message} Nothing was written.`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  /** @type {Array<[string, boolean]>} */
  const targets = [
    ...dirs.map(dir => /** @type {[string, boolean]} */ ([dir, false])),
    ...files.map(file => /** @type {[string, boolean]} */ ([file, true])),
  ];
  for (const [target, isFile] of targets) {
    const parts = path.relative(root, target).split(path.sep);
    let segment = root;
    for (const [i, part] of parts.entries()) {
      segment = path.join(segment, part);
      const last = i === parts.length - 1;
      const key = `${segment}\0${isFile && last}`;
      if (checked.has(key)) continue;
      checked.add(key);
      const rel = path.relative(root, segment);
      let stat;
      try {
        stat = fs.statSync(segment, {throwIfNoEntry: false});
      } catch (err) {
        const errno = /** @type {NodeJS.ErrnoException} */ (err).code;
        if (typeof errno !== 'string') throw err;
        throw refuse(`Could not write ${rel}: ${errno}.`);
      }
      // Nothing is here yet, so nothing deeper can be either.
      if (!stat) break;
      if (isFile && last) {
        if (!stat.isFile()) {
          throw refuse(
            `Could not write ${rel}: it exists and is ${stat.isDirectory() ? 'a folder' : 'not a regular file'}.`,
          );
        }
      } else if (!stat.isDirectory()) {
        throw refuse(
          `Could not write into ${rel}: it exists and is not a folder.`,
        );
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

  // The receipt's feedback first: a swizzle that fails must fail before it
  // writes anything.
  const feedback = buildFeedback(dirName, owner.issuesUrl);

  // Pre-flight path and overwrite checks before any mkdir/writeFile. A Core
  // component brings its nested folders; an integration's folder may hold
  // other components' source, so only its top level is copied.
  const sourceFiles = componentFilesOf(
    componentDir,
    owner.package === CORE_PACKAGE,
  );
  for (const file of sourceFiles) {
    confineWrite(path.join(outputDir, file), cwd, {
      allowAbsolute: true,
      label: 'output file',
    });
  }
  // The owner modules the component imports, and their unexported StyleX
  // dependencies, travel with it in the package's layout (spec:AST-110 FR4).
  const srcRoot = path.dirname(componentDir);
  const componentRel = path
    .relative(srcRoot, componentDir)
    .split(path.sep)
    .join('/');
  const carried = sharedModulesOf(srcRoot, componentDir, sourceFiles);
  const shared = [...carried.values()].map(file => {
    const content = rewriteImports(
      fs.readFileSync(path.join(srcRoot, file), 'utf-8'),
      owner.ownerPackage,
      keepCarried(carried, path.posix.dirname(file)),
    );
    const dest = confineWrite(path.join(outputBase, file), cwd, {
      allowAbsolute: true,
      label: 'output file',
    });
    // Something that is not a readable file in its place counts as changed.
    let existing = null;
    if (fs.existsSync(dest)) {
      try {
        existing = fs.readFileSync(dest, 'utf-8');
      } catch {
        existing = '';
      }
    }
    // A copy another component's swizzle already wrote is reused when it is
    // the same; a changed one is a file this run would overwrite.
    return {
      file,
      dest,
      content,
      unchanged: existing === content,
      exists: existing != null,
    };
  });
  checkDestinationKinds(
    cwd,
    [outputDir],
    [
      ...sourceFiles.map(f => path.join(outputDir, f)),
      ...shared.map(s => s.dest),
    ],
  );
  const existingFiles = sourceFiles.filter(f =>
    fs.existsSync(path.join(outputDir, f)),
  );
  const changedShared = shared.filter(s => s.exists && !s.unchanged);
  if ((existingFiles.length > 0 || changedShared.length > 0) && !overwrite) {
    const relOutputForMsg = path.relative(cwd, outputDir) || '.';
    const sharedNote =
      changedShared.length > 0
        ? ` and ${changedShared.length} changed shared module(s) (${changedShared
            .map(s => path.relative(cwd, s.dest))
            .join(', ')})`
        : '';
    throw new AstryxError(
      `Refusing to overwrite ${existingFiles.length} existing file(s) in ${relOutputForMsg}/${sharedNote}. ` +
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

  let copied = 0;
  let usesStyleX = false;
  // A copy that fails part-way undoes what it already wrote, so the report is
  // true and a retry does not trip over half a component. Each entry keeps
  // the bytes the file had before this run (null when the copy created it).
  /** @type {Array<{dest: string, original: Buffer|null}>} */
  const written = [];
  /** @type {string[]} folders this run created, outermost first */
  const createdDirs = [];
  for (const file of sourceFiles) {
    const srcPath = path.join(componentDir, file);
    let content = fs.readFileSync(srcPath, 'utf-8');
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      content = rewriteImports(
        content,
        owner.ownerPackage,
        keepCarried(
          carried,
          path.posix.join(componentRel, path.posix.dirname(file)),
          componentRel,
        ),
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
      // The snapshot read is guarded too: a destination that cannot be read
      // back (no permission, or a directory with this name) must still undo
      // the earlier writes and report ERR_WRITE_FAILED.
      const original = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
      const firstCreated = fs.mkdirSync(path.dirname(dest), {recursive: true});
      if (firstCreated != null) createdDirs.push(firstCreated);
      written.push({dest, original});
      fs.writeFileSync(dest, content);
    } catch (err) {
      const unrestored = undoCopy(written);
      for (const dir of [...createdDirs].reverse()) {
        fs.rmSync(dir, {recursive: true, force: true});
      }
      if (!outputDirExisted) {
        try {
          fs.rmdirSync(outputDir);
        } catch {
          // Not empty (something could not be undone), or already gone.
        }
      }
      throw writeFailed(dest, cwd, err, unrestored);
    }
    copied++;
  }

  for (const module of shared) {
    // An identical copy is already in place: it is part of this copy, unwritten.
    if (module.unchanged) {
      copied++;
      continue;
    }
    try {
      const original = fs.existsSync(module.dest)
        ? fs.readFileSync(module.dest)
        : null;
      const firstCreated = fs.mkdirSync(path.dirname(module.dest), {recursive: true});
      if (firstCreated != null) createdDirs.push(firstCreated);
      written.push({dest: module.dest, original});
      fs.writeFileSync(module.dest, module.content);
      copied++;
    } catch (err) {
      const unrestored = undoCopy(written);
      // Remove the folders this run created, as a failed component-file write
      // does, so a retry finds the output as it was.
      for (const dir of [...createdDirs].reverse()) {
        fs.rmSync(dir, {recursive: true, force: true});
      }
      if (!outputDirExisted) {
        fs.rmSync(outputDir, {recursive: true, force: true});
      }
      throw writeFailed(module.dest, cwd, err, unrestored);
    }
  }
  if (shared.length > 0) usesStyleX = true;

  const relOutput = path.relative(cwd, outputDir);
  /** @type {import('../swizzle.type.mjs').SwizzleCopyResponse['data']} */
  const data = {
    component: dirName,
    package: owner.package,
    outputDir: relOutput,
    filesCopied: copied,
    // The owner modules and their unexported style dependencies the copy
    // carries beside the component (spec:AST-110 FR4) are its files too.
    files: [
      ...sourceFiles,
      ...shared.map(m => path.relative(outputDir, m.dest).split(path.sep).join('/')),
    ],
    usesStyleX,
  };
  if (feedback) data.feedback = feedback;
  return {type: 'swizzle.copy', package: data.package, data};
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
