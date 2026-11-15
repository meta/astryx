// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle.copy leaf — copy a component's source into the consumer project
 * for customization: what the OWNER package exports is imported from it, and
 * every internal module the component needs is copied beside it.
 *
 * Side-effecting: writes files and returns a `swizzle.copy` receipt describing
 * what it did. Shared core discovery, component listing and the module graph
 * (which modules the copy holds and how each import reads) come from
 * api/swizzle/_adapter.mjs; owner resolution, where each file lands, reuse of
 * existing helpers, StyleX detection and maintainer feedback are here. Errors
 * throw AstryxError (stable code + suggestions). All human prose /
 * package-manager prefixing lives in the CLI renderer.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkGhCli,
  planCopy,
  relativeSpecifierBetween,
  renderFile,
  resolveComponentReplacement,
  resolveCore,
} from '../_adapter.mjs';
import {assertWithin, sanitizeName, PathSafetyError} from '../../../foundation/fs/path-safety.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {findPackageRoot} from '../../../foundation/fs/paths.mjs';
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

/** A private data attribute's owner module (`architecture:public-component-api` INV23). */
const OWNER_MODULE = /^privateAttributes\/[^/]+\.stylex$/;
/** A StyleX module, with or without its file extension. */
const STYLEX_MODULE = /\.stylex(?:\.[cm]?[jt]sx?)?$/;
/** @param {string} packageDir */
function packageVersionOf(packageDir) {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8')).version ?? '0');
  } catch {
    return '0';
  }
}

/**
 * Where a component's module graph starts: its folder's index, or else every
 * source file at the top of the folder.
 * @param {string} componentDir
 * @returns {string[]}
 */
function entryFilesOf(componentDir) {
  for (const name of ['index.ts', 'index.tsx', 'index.mjs', 'index.js']) {
    const file = path.join(componentDir, name);
    if (fs.existsSync(file)) return [file];
  }
  return fs
    .readdirSync(componentDir)
    .filter(f => /\.[cm]?[jt]sx?$/.test(f) && !/\.(?:test|spec|stories|doc)\./.test(f) && !/\.d\.[cm]?ts$/.test(f))
    .map(f => path.join(componentDir, f))
    .filter(f => fs.statSync(f).isFile());
}

/**
 * A module path relative to the source root, without its extension.
 * @param {string} srcRoot
 * @param {string} file
 */
function toModulePath(srcRoot, file) {
  return toPosix(path.relative(srcRoot, file)).replace(/\.[cm]?[jt]sx?$/, '');
}

/** @param {string} file */
function toPosix(file) {
  return file.split(path.sep).join('/');
}

/**
 * @param {string} target
 * @param {string} root
 */
function isWithin(target, root) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * A helper's file name with the owner version before its extension:
 * `layerStack.ts` -> `layerStack.v0.7.9.ts`, or `layerStack.v0.7.9-2.ts`.
 * @param {string} dest
 * @param {string} version
 * @param {number} n
 */
function versionedPath(dest, version, n) {
  const ext = /(\.stylex)?\.[cm]?[jt]sx?$/.exec(dest)?.[0] ?? path.extname(dest);
  const stem = dest.slice(0, dest.length - ext.length);
  return `${stem}.v${version}${n > 1 ? `-${n}` : ''}${ext}`;
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

/**
 * Copy one component's source into the consumer project for customization,
 * with the internal modules it needs and its imports of the owner package's
 * public paths.
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

  // The copy follows the component's module graph through the whole source
  // root: `src/` when the package has one around the component, else the
  // package itself.
  const packageDir = findPackageRoot(componentDir) ?? componentDir;
  const packageSrc = path.join(packageDir, 'src');
  const inPackageSrc = componentDir.startsWith(packageSrc + path.sep);
  const graphRoot = inPackageSrc ? packageSrc : packageDir;
  // Carried modules keep their layout relative to this folder.
  const srcRoot = inPackageSrc ? packageSrc : path.dirname(componentDir);
  const plan = planCopy({
    packageDir,
    srcRoot: graphRoot,
    componentDir,
    ownerPackage: owner.ownerPackage,
    entries: entryFilesOf(componentDir),
  });
  const ownerVersion = packageVersionOf(packageDir);

  // Carried modules keep the package's layout around the component folder.
  const depth = path.relative(srcRoot, componentDir).split(path.sep).length;
  const shiftedRoot = path.resolve(outputDir, ...Array(depth).fill('..'));
  const layoutRoot = isWithin(shiftedRoot, outputBase) ? shiftedRoot : outputBase;
  /** @param {string} file */
  const isComponentFile = file => file.startsWith(componentDir + path.sep);
  // A module above that folder, such as `lib/` beside an integration's
  // `components/`, goes under the output folder by its path in the package.
  /** @param {string} file */
  const layoutDestOf = file => {
    if (isComponentFile(file)) {
      return path.join(outputDir, path.relative(componentDir, file));
    }
    if (file.startsWith(srcRoot + path.sep)) {
      return path.join(layoutRoot, path.relative(srcRoot, file));
    }
    return null;
  };
  const allFiles = [...plan.files.keys()];
  // Such a module takes a folder named after the package when its own path
  // is already a destination, so two modules never share one file.
  const takenDests = new Set(
    allFiles.map(layoutDestOf).filter(dest => dest != null),
  );
  /** @type {Map<string, string>} */
  const rootDests = new Map();
  // A module from another Astryx package goes under a folder named after that
  // package, at its path in that package's source.
  /** @param {string} file */
  const otherPackageOf = file => {
    for (const [root, name] of plan.otherPackages) {
      if (file.startsWith(root + path.sep)) return {root, folder: name.split('/').pop() ?? name};
    }
    return null;
  };
  /** @param {string} file the version of the package a helper comes from */
  const versionOf = file => {
    const other = otherPackageOf(file);
    return other
      ? packageVersionOf(findPackageRoot(other.root) ?? other.root)
      : ownerVersion;
  };
  for (const file of [...allFiles].sort()) {
    if (layoutDestOf(file) != null) continue;
    const other = otherPackageOf(file);
    const base = other ? other.folder : path.basename(packageDir);
    const packagePath = path.relative(other ? other.root : graphRoot, file);
    let dest = other
      ? path.join(outputBase, base, packagePath)
      : path.join(outputBase, packagePath);
    for (let n = 1; takenDests.has(dest); n++) {
      const folder = n === 1 && !other ? base : `${base}-${n}`;
      dest = path.join(outputBase, folder, packagePath);
    }
    takenDests.add(dest);
    rootDests.set(file, dest);
  }
  /** @param {string} file */
  const baseDestOf = file =>
    layoutDestOf(file) ?? /** @type {string} */ (rootDests.get(file));

  const componentFiles = allFiles.filter(isComponentFile);
  const helpers = allFiles.filter(f => !isComponentFile(f));
  // A private attribute owner module and the unexported style modules it
  // imports travel whole and are replaced only with --overwrite.
  const ownerGroup = new Set();
  /** @param {string} file the source root a carried module sits under */
  const rootOf = file => otherPackageOf(file)?.root ?? srcRoot;
  const ownerQueue = helpers.filter(f =>
    OWNER_MODULE.test(toModulePath(rootOf(f), f)),
  );
  while (ownerQueue.length > 0) {
    const file = /** @type {string} */ (ownerQueue.shift());
    if (ownerGroup.has(file)) continue;
    ownerGroup.add(file);
    for (const dep of plan.dependsOn.get(file) ?? []) {
      if (!isComponentFile(dep) && STYLEX_MODULE.test(toModulePath(rootOf(dep), dep))) {
        ownerQueue.push(dep);
      }
    }
  }

  /** @type {Map<string, string>} helper -> the file it is written to instead */
  const redirected = new Map();
  /** @param {string} file */
  const destOf = file => redirected.get(file) ?? baseDestOf(file);
  /** @param {string} file */
  const render = file =>
    renderFile(/** @type {any} */ (plan.files.get(file)), choice =>
      typeof choice === 'string'
        ? choice
        : relativeSpecifierBetween(destOf(choice.from), destOf(choice.to)),
    );
  /** @param {string} dest */
  const readExisting = dest => {
    if (!fs.existsSync(dest)) return null;
    try {
      return fs.readFileSync(dest, 'utf-8');
    } catch {
      return '';
    }
  };
  // A helper an earlier swizzle wrote is reused when it is the same. A
  // different file is never overwritten: this copy moves its own helper to
  // the next free version-suffixed name. A move changes the import in every
  // helper that imports it, so the check repeats until nothing moves.
  /** @type {Map<string, number>} helper -> how many names it tried */
  const attempts = new Map();
  for (let moved = true; moved; ) {
    moved = false;
    for (const file of helpers) {
      if (ownerGroup.has(file)) continue;
      const existing = readExisting(destOf(file));
      if (existing == null || existing === render(file)) continue;
      const attempt = (attempts.get(file) ?? 0) + 1;
      attempts.set(file, attempt);
      redirected.set(
        file,
        versionedPath(baseDestOf(file), versionOf(file), attempt),
      );
      moved = true;
    }
  }

  // The component's own files come first, then the helpers it carries.
  const outputs = [...componentFiles, ...helpers].map(file => {
    const dest = confineWrite(destOf(file), cwd, {
      allowAbsolute: true,
      label: 'output file',
    });
    const content = render(file);
    const existing = readExisting(dest);
    return {
      file,
      dest,
      content,
      component: isComponentFile(file),
      owner: ownerGroup.has(file),
      exists: existing != null,
      unchanged: existing === content,
    };
  });
  const existingFiles = outputs.filter(o => o.component && o.exists);
  const changedShared = outputs.filter(o => o.owner && o.exists && !o.unchanged);
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

  // The marker tells @astryxdesign/build that the output folder holds Astryx
  // source, so the copy compiles below the theme as the package does.
  const markerDest = confineWrite(path.join(outputBase, SWIZZLE_MARKER), cwd, {
    allowAbsolute: true,
    label: 'output file',
  });
  const markerExisting = readExisting(markerDest);
  const markerContent = swizzleMarkerContent(
    markerExisting,
    owner.ownerPackage,
    ownerVersion,
  );
  // Every module under the marker compiles as Astryx source, so swizzle marks
  // only a folder it owns: one the copy creates, an empty one, or one it
  // marked before. Any other folder is reported with what it holds.
  const foundInOutputBase =
    markerExisting == null &&
    fs.existsSync(outputBase) &&
    fs.statSync(outputBase).isDirectory()
      ? fs.readdirSync(outputBase).sort()
      : [];
  const marksOutputBase = foundInOutputBase.length === 0;
  const writes = marksOutputBase
    ? [
        ...outputs,
        {
          dest: markerDest,
          content: markerContent,
          marker: true,
          unchanged: markerExisting === markerContent,
        },
      ]
    : outputs;

  const outputDirExisted = fs.existsSync(outputDir);
  /** @type {string[]} folders this run created, outermost first */
  const createdDirs = [];
  /** @type {Array<{dest: string, original: Buffer|null}>} */
  const written = [];
  let copied = 0;
  for (const output of writes) {
    const counts = !('marker' in output);
    // An identical file is already in place: it is part of this copy, unwritten.
    if (output.unchanged) {
      if (counts) copied++;
      continue;
    }
    try {
      const original = fs.existsSync(output.dest) ? fs.readFileSync(output.dest) : null;
      const firstCreated = fs.mkdirSync(path.dirname(output.dest), {recursive: true});
      if (firstCreated != null) createdDirs.push(firstCreated);
      written.push({dest: output.dest, original});
      fs.writeFileSync(output.dest, output.content);
      if (counts) copied++;
    } catch (err) {
      const unrestored = undoCopy(written);
      for (const dir of [...createdDirs].reverse()) {
        fs.rmSync(dir, {recursive: true, force: true});
      }
      if (!outputDirExisted && fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, {recursive: true, force: true});
      }
      throw writeFailed(output.dest, cwd, err, unrestored);
    }
  }
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, {recursive: true});

  const relOutput = path.relative(cwd, outputDir);
  /** @type {import('../swizzle.type.mjs').SwizzleCopyResponse['data']} */
  const data = {
    component: dirName,
    package: owner.package,
    outputDir: relOutput,
    filesCopied: copied,
    files: outputs.map(o => toPosix(path.relative(outputDir, o.dest))),
    usesStyleX: outputs.some(o => o.content.includes('@stylexjs/stylex')),
    dependencies: plan.dependencies,
  };
  data.marker = marksOutputBase
    ? {path: toPosix(path.relative(cwd, markerDest)), written: true}
    : {
        path: toPosix(path.relative(cwd, markerDest)),
        written: false,
        found: foundInOutputBase.slice(0, 5),
      };
  if (feedback) data.feedback = feedback;
  return {type: 'swizzle.copy', package: data.package, data};
}

/** The file that marks a swizzle output folder as Astryx source. */
const SWIZZLE_MARKER = 'astryx-swizzle.json';

/**
 * The marker's content after a copy from `ownerPackage`: the packages the
 * folder's copies came from, each with its version. Unreadable content is
 * replaced.
 * @param {string|null} existing
 * @param {string} ownerPackage
 * @param {string} version
 * @returns {string}
 */
function swizzleMarkerContent(existing, ownerPackage, version) {
  /** @type {Record<string, string>} */
  let packages = {};
  try {
    const parsed = existing == null ? null : JSON.parse(existing);
    if (parsed?.packages && typeof parsed.packages === 'object') {
      packages = {...parsed.packages};
    }
  } catch {
    // Unreadable content is rewritten below.
  }
  packages[ownerPackage] = version;
  return `${JSON.stringify({packages}, null, 2)}\n`;
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
