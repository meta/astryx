// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `render` subject's adapter: its only access to the environment.
 * It reads the page or rendered file, runs the renderer, and writes results.
 *
 * @position api/render — adapter for api/render/render.mjs
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {freeRestoreFolder} from '../../foundation/render/restore-folder.mjs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  MODULE_EXTENSIONS,
  PAGE_EXTENSIONS,
  REACT_UNKNOWN_PROP,
  RenderError,
  pageOutputWarnings,
  renderPage,
} from '../../foundation/render/render-page.mjs';
import {
  RENDER_FORMAT,
  asParsed,
  readSourceBlock,
  recordedText,
  renderedHeadOf,
  renderedMarkupOf,
  sha256,
} from '../../foundation/render/source-block.mjs';
import {decode} from '../../foundation/render/html-reader.mjs';
import {clip, locate, textEdits, textRuns} from '../../foundation/render/markup-edits.mjs';
import {isPackageName} from '../../foundation/identity/provider-identity.mjs';
import {cliCommand} from '../../foundation/render/file-header.mjs';
import {shellArg} from '../../foundation/text/shell-arg.mjs';
import {getCliInvocation} from '../../foundation/env/package-manager.mjs';
import {isValidSemver} from '../../foundation/env/semver.mjs';
import {embeddedPathProblem, runnerPicksUp} from '../../foundation/render/embedded-files.mjs';
import {isAssetBytes, isAssetPath} from '../../foundation/render/assets.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';
import {publishNewFile} from '../../foundation/fs/publish-file.mjs';
import {reachableFiles, receivingAliases, resolutionCandidates} from '../../foundation/render/embedded-imports.mjs';
import {relativeSpecifierBetween} from '../../foundation/fs/relative-specifier.mjs';
import {pathsHomeFor} from '../../foundation/render/ts-paths.mjs';
import {isAstryxMarkup} from '../../foundation/render/html-reader.mjs';
import {rebuildPage} from '../../foundation/render/rebuild.mjs';
import {cliVersion} from '../../foundation/integrations/cli-peer-version.mjs';
import {assertWithin, PathSafetyError, tempFolders} from '../../foundation/fs/path-safety.mjs';
import {climbsOut, findCoreDir, findPackageRoot, isInside as liesInside, requireCoreDir} from '../../foundation/fs/paths.mjs';
import {judgeCoreProps, projectTypeScript, propNamesOf, readCoreDocs} from '../../foundation/discovery/unknown-core-props.mjs';
import {runChoice} from '../../foundation/release/run-context.mjs';
import {isAlive, pidSpace} from '../../foundation/release/cache.mjs';
import {isServedPackage} from '../../foundation/render/served-packages.mjs';
import {outsideRequests, roundTrip} from '../../foundation/render/share-checks.mjs';
import {hostedPagePackages, recordResolved} from '../../foundation/runtime/package-root.mjs';
import {installCommandFor} from '../../foundation/discovery/template-needs.mjs';
import {COMPONENT_BATCH_SELECTOR_LIMIT, component} from '../component/component.mjs';
import {projectAugmentations, propValueKinds, propWideningInterfaces, unacceptedKind} from '../../foundation/discovery/core-augmentation-points.mjs';

export {PAGE_EXTENSIONS, embeddedPathProblem};

/** @param {string} cwd @param {string} file */
const shown = (cwd, file) => {
  const rel = path.relative(cwd, file);
  return rel && !climbsOut(rel) && !path.isAbsolute(rel)
    ? rel.split(path.sep).join('/')
    : file;
};

/** Why a file cannot be read, in a few words, by its errno. */
const READ_FAILURES = {EACCES: 'no permission', EPERM: 'no permission', EISDIR: 'it is a folder'};

/**
 * The error for an input the file system would not give: ERR_FILE_NOT_FOUND
 * when nothing is there, ERR_READ_FAILED with the errno and its reason
 * otherwise.
 * @param {string} file absolute
 * @param {string} cwd
 * @param {unknown} e what the file system threw
 */
function inputFailure(file, cwd, e) {
  const errno = /** @type {NodeJS.ErrnoException} */ (e).code;
  if (errno === 'ENOENT' || errno === 'ENOTDIR') {
    return new AstryxError(`${shown(cwd, file)} does not exist`, [], ERROR_CODES.ERR_FILE_NOT_FOUND);
  }
  const why = READ_FAILURES[/** @type {keyof typeof READ_FAILURES} */ (errno)];
  return new AstryxError(
    `${shown(cwd, file)} cannot be read${errno ? ` (${errno}${why ? `: ${why}` : ''})` : ''}; nothing was written.`,
    [],
    ERROR_CODES.ERR_READ_FAILED,
  );
}

/**
 * Read a file the caller named. A folder, a pipe or any other entry that is
 * not a regular file is refused before it is opened, so nothing waits on it.
 * @param {string} file absolute
 * @param {string} cwd
 * @returns {Buffer}
 */
function readInput(file, cwd) {
  /** @type {fs.Stats} */
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (e) {
    throw inputFailure(file, cwd, e);
  }
  if (!stat.isFile()) {
    throw new AstryxError(
      `${shown(cwd, file)} cannot be read (${stat.isDirectory() ? 'it is a folder' : 'it is not a regular file'}); nothing was written.`,
      [],
      ERROR_CODES.ERR_READ_FAILED,
    );
  }
  try {
    return fs.readFileSync(file);
  } catch (e) {
    throw inputFailure(file, cwd, e);
  }
}

/**
 * Whether @astryxdesign/core resolves from a folder (or the nearest existing
 * folder above it).
 * @param {string} dir
 */
function resolvesCore(dir) {
  let d = dir;
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  try {
    createRequire(path.join(d, 'noop.js')).resolve('@astryxdesign/core');
    return true;
  } catch {
    return false;
  }
}

/**
 * Refuse a write outside the current folder, symlinks followed (cli-surface
 * INV10).
 * @param {string} file absolute
 * @param {string} cwd
 * @param {string} what
 * @param {string} [fix] what to do instead
 * @returns {string}
 */
function confined(file, cwd, what, fix = 'Write inside the folder you run the command from.') {
  try {
    return assertWithin(file, cwd, {allowAbsolute: true, label: what});
  } catch (e) {
    if (e instanceof PathSafetyError) {
      throw new AstryxError(
        `${what} ${shown(cwd, file)} is outside the current folder; nothing was written. ${fix}`,
        [],
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw e;
  }
}

/**
 * Whether a file is inside a folder (not the folder itself).
 * @param {string} file absolute
 * @param {string | null} folder absolute
 */
const isInside = (file, folder) => Boolean(folder) && liesInside(file, /** @type {string} */ (folder));

/**
 * Refuse, before anything is written, a write that reaches through a
 * symbolic link, and the replacement of an existing file the project
 * protects (generated, vendored, ignored, a dependency or version-control
 * metadata; spec:AST-040 FR2), even with --overwrite. A file inside the new
 * folder a restore creates replaces nothing: that folder takes its name in
 * one step, after every check.
 * @param {string[]} files absolute
 * @param {string} cwd
 * @param {string | null} [newFolder] the new folder a restore creates, if any
 */
function refuseProtected(files, cwd, newFolder = null) {
  for (const file of files) {
    let current = cwd;
    for (const part of path.relative(cwd, file).split(path.sep)) {
      current = path.join(current, part);
      let stat;
      try {
        stat = fs.lstatSync(current);
      } catch {
        break;
      }
      if (stat.isSymbolicLink()) {
        throw new AstryxError(
          `${shown(cwd, file)} is reached through a symbolic link (${shown(cwd, current)}); nothing was written.`,
          [],
          ERROR_CODES.ERR_PATH_TRAVERSAL,
        );
      }
    }
  }
  const existing = files.filter(file => !isInside(file, newFolder) && fs.existsSync(file));
  if (existing.length === 0) return;
  /** @type {ReturnType<typeof createFileProtectionResolver>} */
  let resolver;
  try {
    resolver = createFileProtectionResolver(cwd);
  } catch (e) {
    throw new AstryxError(
      `Could not read this project's file protection (${e instanceof Error ? e.message : String(e)}), so no existing file is replaced; nothing was written.`,
      [],
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }
  const blocked = existing.flatMap(file => {
    const protection = resolver.classify(file)[0];
    return protection ? [`${shown(cwd, file)} (${protection.declaration})`] : [];
  });
  if (blocked.length > 0) {
    throw new AstryxError(
      `${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} protected, so never replaced, even with --overwrite; nothing was written. Choose another --out.`,
      [],
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }
}

/**
 * The process space runs here share: this computer's name and its process-ID
 * namespace (a container or sandbox on one computer has its own), in which a
 * process id names one process.
 */
const PROCESS_SPACE = `${os.hostname()}-${/\[(\d+)\]/.exec(pidSpace() ?? '')?.[1] ?? 'x'}`;

/**
 * The start of the hidden temporary names a run in this process space gives
 * a file or folder beside its target, before the run's process id.
 * @param {string} target absolute
 */
const temporaryPrefix = target => `.${path.basename(target)}.tmp-${PROCESS_SPACE}-`;

/**
 * A hidden temporary name beside a file or folder, as the CLI's other writers
 * name theirs, with this process space and this process's id, so a later run
 * can tell when the run that made it is gone.
 * @param {string} target absolute
 */
const temporaryBeside = target => path.join(path.dirname(target), `${temporaryPrefix(target)}${process.pid}-${randomUUID()}`);

/**
 * Remove the temporaries that runs in this process space left beside a
 * target when they stopped between their write and their rename: those whose
 * process no longer runs. A temporary of a run that still runs, or of a run
 * in another process space (another computer, container or sandbox, whose
 * processes cannot be seen from here), stays.
 * @param {string} target absolute
 */
function removeStaleTemporaries(target) {
  const prefix = temporaryPrefix(target);
  let names;
  try {
    names = fs.readdirSync(path.dirname(target));
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const pid = /^(\d+)-[0-9a-f-]{36}$/.exec(name.slice(prefix.length))?.[1];
    if (pid === undefined || isAlive(Number(pid))) continue;
    fs.rmSync(path.join(path.dirname(target), name), {recursive: true, force: true});
  }
}

/**
 * The topmost folder on the way to `file` that does not exist yet, or null
 * when the file's own folder exists.
 * @param {string} file absolute
 * @returns {string | null}
 */
function newFolderOf(file) {
  /** @type {string | null} */
  let top = null;
  for (let d = path.dirname(file); !fs.existsSync(d) && path.dirname(d) !== d; d = path.dirname(d)) top = d;
  return top;
}

/**
 * Why a write failed, in terms of the target, never the hidden temporary
 * file or folder beside it: the folder that would not take the temporary,
 * or the error a file inside the temporary folder met.
 * @param {unknown} e
 * @param {string | null} temporary the temporary file or folder
 * @param {string} folder the folder that holds the target
 * @param {string} cwd
 */
function writeFailure(e, temporary, folder, cwd) {
  const err = /** @type {NodeJS.ErrnoException} */ (e);
  if (temporary && err?.path === temporary && (err.syscall === 'open' || err.syscall === 'mkdir')) {
    return `${shown(cwd, folder)} does not take a new file (${err.code ?? err.message})`;
  }
  if (temporary && err?.path?.startsWith(temporary + path.sep)) return err.code ?? err.message;
  return String(err?.message ?? e);
}

/**
 * Write one file in one step: its bytes go to a temporary file beside it,
 * which then takes its name. A reader, or another run at the same time, sees
 * the old whole file or the new one, never part of one, and a run stopped
 * part-way leaves the old file as it was; the next write to the file removes
 * the temporary that run left.
 * @param {string} file absolute
 * @param {string | Buffer} content
 * @param {string} cwd
 * @param {{replace: boolean, mode?: number}} options `replace`: an existing
 *   file may be replaced; without it, a file that appeared since the checks
 *   stays. `mode`: the permission bits the file gets
 */
function writeOutput(file, content, cwd, {replace, mode}) {
  /** @type {string | null} */
  let temporary = null;
  try {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    /** @type {fs.Stats | null} */
    let existing = null;
    try {
      existing = fs.statSync(file);
    } catch {
      // No file there yet.
    }
    if (existing?.isDirectory()) {
      throw Object.assign(new Error(`EISDIR: illegal operation on a directory, open '${file}'`), {code: 'EISDIR'});
    }
    removeStaleTemporaries(file);
    temporary = temporaryBeside(file);
    fs.writeFileSync(temporary, content, {flag: 'wx'});
    if (mode !== undefined) fs.chmodSync(temporary, mode);
    if (replace) fs.renameSync(temporary, file);
    else publishNewFile(temporary, file);
  } catch (e) {
    if (!replace && /** @type {any} */ (e)?.code === 'EEXIST') {
      throw new AstryxError(
        `${shown(cwd, file)} appeared while this ran; nothing was written. Pass --overwrite to replace it.`,
        [],
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    }
    throw new AstryxError(
      `Could not write ${shown(cwd, file)}: ${writeFailure(e, temporary, path.dirname(file), cwd)}; nothing was written.`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  } finally {
    if (temporary) fs.rmSync(temporary, {force: true});
  }
}

/**
 * Write a new folder and every file in it, all or nothing, in one step: the
 * files go into a temporary folder beside it, which then takes the folder's
 * name. A run stopped part-way leaves no folder behind, so running it again
 * works (and removes the temporary folder that run left), and of two runs
 * that pick the same name, one gets it and the other learns that it is
 * taken.
 * @param {string} folder absolute; does not exist yet
 * @param {{file: string, bytes: Buffer}[]} writes absolute targets inside `folder`
 * @param {string} cwd
 * @returns {boolean} false when the folder appeared before this run could take its name
 */
function writeFolder(folder, writes, cwd) {
  removeStaleTemporaries(folder);
  const staging = temporaryBeside(folder);
  let current = folder;
  try {
    for (const w of writes) {
      current = w.file;
      const staged = path.join(staging, path.relative(folder, w.file));
      fs.mkdirSync(path.dirname(staged), {recursive: true});
      fs.writeFileSync(staged, w.bytes, {flag: 'wx'});
    }
    current = folder;
    try {
      fs.renameSync(staging, folder);
    } catch (e) {
      if (fs.existsSync(folder)) return false;
      throw e;
    }
    return true;
  } catch (e) {
    throw new AstryxError(
      `Could not write ${shown(cwd, current)}: ${writeFailure(e, staging, path.dirname(folder), cwd)}; nothing was written.`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  } finally {
    fs.rmSync(staging, {recursive: true, force: true});
  }
}

/**
 * Write a restore's files: into the new folder that holds them all, in one
 * step, or, when the page goes into a folder that exists (the only file a
 * restore writes there), the page alone.
 * @param {{file: string, bytes: Buffer}[]} writes absolute targets, the page first
 * @param {string | null} folder the new folder that holds every file, or null
 * @param {string} cwd
 * @param {boolean} overwrite whether an existing page may be replaced
 * @returns {boolean} false when the new folder appeared before this run could take its name
 */
function writeRestore(writes, folder, cwd, overwrite) {
  if (folder) return writeFolder(folder, writes, cwd);
  writeOutput(writes[0].file, writes[0].bytes, cwd, {replace: overwrite});
  return true;
}

/**
 * @param {unknown} e
 * @param {string} pageDir the folder of the page the render read
 * @param {string} [cwd] the folder the render runs from
 */
function asAstryxError(e, pageDir, cwd = process.cwd()) {
  if (e instanceof RenderError) {
    const code = /** @type {import('../../foundation/response/error-codes.mjs').ErrorCode} */ (e.code);
    /** @type {{name: string, reason: string}[]} */
    const suggestions = [];
    let message = e.message;
    if (e.code === 'ERR_RENDER_MISSING_DEPENDENCY' && typeof e.detail?.package === 'string') {
      // The run folder's integration line first, when the page is in the run
      // folder's package; then the install command the render named; then
      // one line for every package from the page's own package.
      const packages = Array.isArray(e.detail.packages) ? e.detail.packages : [e.detail.package];
      const needs = `install ${packages.join(', ')}, which this render needs`;
      const what = packages.length === 1 ? 'install the package the page imports' : 'install the packages the page imports';
      const pageRoot = findPackageRoot(pageDir);
      const runRoot = findPackageRoot(cwd);
      const samePackage = pageRoot !== null && runRoot !== null && path.resolve(runRoot) === path.resolve(pageRoot);
      // At installCommandFor's versions: Core, the CLI and a package Astryx
      // releases with Core at the project's Core release, in the guidance
      // too; any other at the CLI's range in the command, bare in the
      // guidance; no command when the project's lockfiles disagree.
      const step = pageRoot == null ? null : installCommandFor(packages, pageDir, cwd);
      const guidance = samePackage ? step?.installGuidance : null;
      if (guidance) {
        suggestions.push({name: guidance, reason: needs});
      } else if (typeof e.detail.install === 'string') {
        suggestions.push({name: e.detail.install, reason: needs});
      } else if (pageRoot == null || step == null) {
        // In a folder no package.json holds, an install would make the folder
        // a project, so the message names the packages for the project that
        // uses the page instead, as template and build do.
        message = `${message}. Install ${packages.length === 1 ? 'it' : 'them'} in the project that uses this page.`;
      } else {
        const line = step.installGuidance ?? step.installCommand;
        if (line && samePackage) {
          suggestions.push({name: line, reason: what});
        } else if (line) {
          // Run from here, the line would add the packages to this folder's
          // package.json, not to the page's, so the message names the page's
          // package and the line to run there.
          const where = path.relative(cwd, pageRoot) || '.';
          message = `${message}. Install ${packages.length === 1 ? 'it' : 'them'} in ${where}, the package that holds this page: from there, run ${line}`;
        } else if (step.noCommandReason) {
          message = `${message}. ${step.noCommandReason}`;
        }
      }
    }
    return new AstryxError(message, suggestions, code);
  }
  const err = /** @type {any} */ (e);
  if (typeof err?.code === 'string' && err.code.startsWith('ERR_RENDER_')) {
    return new AstryxError(err.message, [], err.code);
  }
  return e;
}

/**
 * The package set the CLI runs from, for a page outside a project
 * (architecture:cli-surface INV30): the Core it carries, found by the rule of
 * every command that answers from Core outside a project. Inside a project
 * (spec AST-081: a Core or CLI the folder reads, or a package.json that
 * declares one) the project's packages serve the page alone, so this is
 * null.
 * When the carried Core cannot be had, the reason is kept for the error a
 * page that needs it gets (spec AST-081 FR3).
 * @param {string} input absolute path of the page
 * @returns {{dir: string, integrations: readonly string[]} | {unavailable: Error} | null}
 */
function servedSet(input) {
  const dir = path.dirname(input);
  if (runChoice(dir).inProject) return null;
  try {
    return {dir: requireCoreDir(dir), integrations: hostedPagePackages()};
  } catch (e) {
    const err = /** @type {any} */ (e);
    return err?.code === ERROR_CODES.ERR_VERSIONS_UNAVAILABLE ? {unavailable: err} : null;
  }
}

/** A prop type that is a closed union of string literals, as a doc writes it: `'sm' | 'md'`. */
const CLOSED_UNION = /^\s*'[^']*'(?:\s*\|\s*'[^']*')*\s*$/;

/** A documented type that is only string literals, or `string` itself. */
const STRING_TYPE = /^\s*(?:string|'[^']*'(?:\s*\|\s*'[^']*')*)\s*$/;

/**
 * Whether a prop's documented type (as `astryx component` shows it) plainly
 * takes every written kind: strings for a string union or `string`, numbers
 * for `number`, true or false for `boolean`. Only a yes skips the read of
 * Core's source; any other type is read there.
 * @param {unknown} docType
 * @param {string[]} kinds
 * @returns {boolean}
 */
function docTypeTakes(docType, kinds) {
  if (typeof docType !== 'string') return false;
  const type = docType.trim();
  return kinds.every(kind =>
    kind === 'string' ? STRING_TYPE.test(type) : kind === 'number' ? type === 'number' : kind === 'boolean' && type === 'boolean',
  );
}

/** How a warning names each kind of value. */
const KIND_WORDS = /** @type {Record<import('../../foundation/discovery/core-augmentation-points.mjs').ValueKind, string>} */ ({
  string: 'a string',
  number: 'a number',
  boolean: 'true or false',
  object: 'an object',
  array: 'an array',
  Date: 'a Date',
  function: 'a function',
});

/**
 * A warning for each value a page certainly gives a Core component's prop
 * that the prop does not take.
 * - A value of the wrong kind for the prop's declared type in the page's
 *   Core (`<TextInput status="error">`, where status takes an object): both
 *   the written value and the declared type must be certain, else the prop
 *   is not checked.
 * - A string the prop's closed union does not hold (`<Button
 *   variant="danger">`), each branch of a literal-only conditional included:
 *   the component draws no look for it, and nothing else says so. The union
 *   comes from Core's own docs for the component in the page's Core, the
 *   props `astryx component <Name> --package @astryxdesign/core` reads, so an
 *   integration that replaces the component does not change it. Where the
 *   prop's type takes the keys of an interface a theme can widen by
 *   declaration merging (`interface ButtonVariantMap`, `interface
 *   TextColorMap` for Link's `color`), the keys the page's project adds to it
 *   are values the prop has too; when the project cannot be read in full, or
 *   the prop's type cannot be followed, such a prop is not checked. A
 *   component or prop with no doc entry, and a prop whose type is not a
 *   closed union, are not checked.
 * @param {NonNullable<import('../../foundation/render/render-page.mjs').RenderedPage['propValues']>} values
 * @param {string} page the page file; its folder's Core gives the docs
 * @param {(name: string) => Promise<any[] | null>} docsOf the documented
 *   props of a Core component, read once for both prop checks
 * @returns {Promise<import('../../foundation/render/render-page.mjs').RenderWarning[]>}
 */
async function propValueWarnings(values, page, docsOf) {
  const dir = path.dirname(page);
  /** @type {import('../../foundation/render/render-page.mjs').RenderWarning[]} */
  const warnings = [];
  const seen = new Set();
  /** @param {string} key @param {string} message */
  const warn = (key, message) => {
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push({code: 'unknown-prop-value', message});
  };
  const coreDir = values.length ? findCoreDir(dir) : null;
  /** @type {ReturnType<typeof projectAugmentations> | undefined} */
  let added;
  /** @type {Map<string, ReturnType<typeof propValueKinds>>} */
  const declaredKinds = new Map();
  // The same wrong kind for one prop on several lines of a file is one
  // warning that names every line.
  /** @type {Map<string, {file: string, said: string, lines: number[], at: number}>} */
  const kindGroups = new Map();
  for (const v of values) {
    const docType = (await docsOf(v.component))?.find(p => p?.name === v.prop)?.type;
    const kindKey = `${v.component}.${v.prop}`;
    // A documented string union, `string`, `number` or `boolean` that takes
    // every written kind decides the prop without Core's source, which costs
    // a parse per component.
    if (!declaredKinds.has(kindKey) && !docTypeTakes(docType, v.kinds)) {
      declaredKinds.set(kindKey, propValueKinds(coreDir, v.component, v.prop));
    }
    const declared = declaredKinds.get(kindKey) ?? null;
    const wrong = declared ? unacceptedKind(v.kinds, declared) : null;
    if (declared && wrong) {
      const fields = declared.fields ? ` {${declared.fields.join(', ')}}` : '';
      const numbers =
        !declared.anyNumber && declared.numbers.size > 0 ? `one of ${[...declared.numbers].join(', ')}` : null;
      const expected = [...declared.kinds].map(kind =>
        kind === 'object' ? KIND_WORDS.object + fields : kind === 'number' && numbers ? numbers : KIND_WORDS[kind],
      );
      const said = `${v.component} ${v.prop} expects ${expected.join(' or ')}; got ${KIND_WORDS[wrong]}`;
      const group = kindGroups.get(`${v.file}\0${said}`) ?? {file: v.file, said, lines: [], at: warnings.length};
      if (group.lines.length === 0) {
        kindGroups.set(`${v.file}\0${said}`, group);
        warnings.push({code: 'unknown-prop-value', message: ''});
      }
      if (!group.lines.includes(v.line)) group.lines.push(v.line);
      continue;
    }
    if (!v.strings || v.strings.length === 0) continue;
    const prop = (await docsOf(v.component))?.find(p => p?.name === v.prop);
    if (typeof prop?.type !== 'string' || !CLOSED_UNION.test(prop.type)) continue;
    const allowed = [...prop.type.matchAll(/'([^']*)'/g)].map(m => m[1]);
    const unknown = v.strings.filter(value => !allowed.includes(value));
    if (unknown.length === 0) continue;
    // The project read can walk a large tree; only a value the docs lack needs it.
    const widening = await propWideningInterfaces(coreDir, v.component, v.prop);
    if (widening === null) continue;
    if (widening.size > 0) {
      added ??= projectAugmentations(findPackageRoot(dir) ?? dir, page);
      if (!added.complete) continue;
      for (const name of widening) {
        for (const key of added.keys.get(name) ?? []) if (!allowed.includes(key)) allowed.push(key);
      }
    }
    const kinds = v.prop.endsWith('s') ? `${v.prop} values` : `${v.prop}s`;
    for (const value of unknown) {
      if (allowed.includes(value)) continue;
      warn(
        `${v.file}:${v.line}:${v.component}:${v.prop}:${value}`,
        `${v.file}:${v.line}: ${v.component} has no ${v.prop} "${value}"; its ${kinds} are ${allowed.join(', ')}.`,
      );
    }
  }
  for (const {file, said, lines, at} of kindGroups.values()) {
    warnings[at].message =
      lines.length === 1 ? `${file}:${lines[0]}: ${said}.` : `${file}: ${said} on ${lines.length} lines (${lines.join(', ')}).`;
  }
  return warnings;
}

/**
 * The documented props of each Core component, read from the Core of the
 * folder `dir` with doctor's reader (`readCoreDocs`); null for a component
 * the docs do not describe. `load` reads the components it is given in
 * batches; `of` reads one component that was not loaded. Each component is
 * read once.
 * @param {string} dir
 */
function coreDocsReader(dir) {
  /** @type {Map<string, any[] | null>} */
  const docs = new Map();
  /** @param {string[]} names */
  const load = async names => {
    const missing = [...new Set(names)].filter(name => !docs.has(name));
    for (const name of missing) docs.set(name, null);
    try {
      for (const [name, props] of await readCoreDocs(component, missing, dir, COMPONENT_BATCH_SELECTOR_LIMIT)) docs.set(name, props);
    } catch {
      // A component the docs do not describe is not checked.
    }
  };
  /** @param {string} name */
  const of = async name => {
    await load([name]);
    return docs.get(name) ?? null;
  };
  return {load, of};
}

/** How many of a component's props a warning names before it counts the rest. */
const PROPS_LISTED = 12;

/**
 * A warning for each Core component element a page's file gives props it
 * does not take (`<AlertDialog onConfirm={…}>`), judged as `astryx doctor`
 * judges them (`judgeCoreProps`): the prop does nothing, and a callback the
 * page passes is never called. Each prop gets the documented prop with the
 * same words, when there is one; when a prop has none, the warning lists the
 * props the component takes. Core's types are read with the project's
 * TypeScript and React's types, as the page finds them; without them, the
 * props are not judged. Only the docs are read while every prop is
 * documented.
 * @param {Array<import('../../foundation/discovery/core-props.mjs').CorePropUse & {file: string, element: {line: number, column: number}}>} names
 *   each with the file's absolute path and where its element opens
 * @param {string} page the page file
 * @param {(name: string) => Promise<any[] | null>} docsOf
 * @returns {Promise<{warnings: import('../../foundation/render/render-page.mjs').RenderWarning[], props: Set<string>}>}
 *   the warnings, and the props they name
 */
async function propNameWarnings(names, page, docsOf) {
  if (names.length === 0) return {warnings: [], props: new Set()};
  const dir = path.dirname(page);
  const projectDir = runChoice(dir).inProject ? (findPackageRoot(dir) ?? dir) : dir;
  const shown = (/** @type {string} */ file) => path.relative(dir, file).split(path.sep).join('/');
  const {found, skipped, reason} = await judgeCoreProps({
    projectDir,
    uses: names.map(use => ({...use, file: shown(use.file), path: use.file})),
    pages: [...new Set(names.map(use => use.file))],
    readDocs: async components => {
      /** @type {Map<string, any[]>} */
      const documented = new Map();
      for (const name of components) {
        const props = await docsOf(name);
        if (props) documented.set(name, props);
      }
      return documented;
    },
    typescript: () => projectTypeScript([projectDir]),
  });
  /** @type {Map<string, {line: number, column: number}>} */
  const elementOf = new Map(names.map(use => [`${shown(use.file)}\0${use.line}\0${use.column}`, use.element]));
  /** @type {Map<string, typeof found>} */
  const byElement = new Map();
  for (const use of found) {
    const element = elementOf.get(`${use.file}\0${use.line}\0${use.column}`);
    const key = `${use.file}\0${element?.line}\0${element?.column}`;
    (byElement.get(key) ?? byElement.set(key, []).get(key))?.push(use);
  }
  /** @type {import('../../foundation/render/render-page.mjs').RenderWarning[]} */
  const warnings = [];
  for (const uses of byElement.values()) {
    const {file, line, component: name} = uses[0];
    /** @type {Map<string, string | null>} */
    const props = new Map(uses.map(use => [use.prop, use.suggestion]));
    const named = [...props].map(([prop, suggestion]) => (suggestion ? `${prop} (did you mean ${suggestion}?)` : prop));
    let message = `${file}:${line}: ${name} has no ${named.join(', ')}`;
    if ([...props.values()].some(suggestion => suggestion === null)) {
      const takes = propNamesOf((await docsOf(name)) ?? []);
      const rest = takes.length - PROPS_LISTED;
      message += `; it takes ${takes.slice(0, PROPS_LISTED).join(', ')}${rest > 0 ? `, and ${rest} more (\`${getCliInvocation(dir)} component ${name} --package @astryxdesign/core\` lists them)` : ''}`;
    }
    warnings.push({code: 'unknown-prop', message: `${message}.`});
  }
  // A check that could not run says so once, with doctor's reason and what
  // to install: silence would read as every prop being right.
  // Outside a project a step that installs into a project does not apply.
  const why = runChoice(dir).inProject ? skipped : (reason ?? skipped);
  if (why) warnings.push({code: 'props-not-checked', message: `Core prop names: ${why}`});
  return {warnings, props: new Set(found.map(use => use.prop))};
}

/**
 * Render a page module to one HTML file and write it.
 * @param {{cwd: string, input: string, output: string, title?: string, keepClassNames?: boolean, absolute?: boolean, pictures?: boolean}} args absolute paths;
 *   `absolute`: the caller named the output by an absolute path;
 *   `keepClassNames`: keep every class of the first paint as written;
 *   `pictures`: also take pictures of the written file ({@link pagePictures})
 * @returns {Promise<import('./render.type.mjs').RenderPageResponse['data']>}
 */
export async function renderToFile({cwd, input, output, title, keepClassNames = false, absolute = false, pictures = false}) {
  readInput(input, cwd);
  // An absolute --out is the caller's choice of place, also outside the
  // current folder (cli-surface DEC-16). The file there is still never one a
  // render did not write.
  const elsewhere = absolute && !isInside(output, cwd);
  if (!elsewhere) confined(output, cwd, 'The output', 'Write inside the folder you run the command from, or name an absolute path.');
  /** @type {import('../../foundation/render/render-page.mjs').RenderedPage} */
  let page;
  try {
    const set = servedSet(input);
    try {
      page = await renderPage(input, {title, version: cliVersion(), served: set && 'dir' in set ? set : null, output, cwd, cutFontFaces: true, keepClassNames});
    } catch (e) {
      // A page that needs the Core the CLI could not obtain says why.
      const detail = /** @type {any} */ (e)?.code === 'ERR_RENDER_MISSING_DEPENDENCY' ? /** @type {any} */ (e).detail : null;
      /** @type {unknown[]} */
      const missing = Array.isArray(detail?.packages) ? detail.packages : [detail?.package];
      const served = hostedPagePackages();
      if (set && 'unavailable' in set && missing.some(name => typeof name === 'string' && isServedPackage(name, served))) {
        throw new AstryxError(set.unavailable.message, [], ERROR_CODES.ERR_VERSIONS_UNAVAILABLE);
      }
      throw e;
    }
  } catch (e) {
    throw asAstryxError(e, path.dirname(input), cwd);
  }
  const docs = coreDocsReader(path.dirname(input));
  await docs.load([...(page.propValues ?? []), ...(page.propNames ?? [])].map(use => use.component));
  const docsOf = docs.of;
  /** @type {Awaited<ReturnType<typeof propNameWarnings>>} */
  let named = {warnings: [], props: new Set()};
  try {
    named = await propNameWarnings(page.propNames ?? [], input, docsOf);
  } catch {
    // The check only warns: a project whose types cannot be read still exports.
  }
  // React's own console line for a prop the warning names says less, cut
  // short, so it goes, before the page output is capped: it never hides a
  // line the page printed itself.
  const kept = (page.logs ?? []).filter(log => {
    const prop = REACT_UNKNOWN_PROP.exec(log.text);
    return !prop || !named.props.has(prop[1] ?? prop[2]);
  });
  const at = page.warnings.findIndex(warning => warning.code === 'page-output');
  page.warnings = page.warnings.filter(warning => warning.code !== 'page-output');
  page.warnings.splice(at === -1 ? page.warnings.length : at, 0, ...pageOutputWarnings(kept));
  page.warnings.push(...(await propValueWarnings(page.propValues ?? [], input, docsOf)), ...named.warnings);
  for (const {name, dir} of page.fromSet) {
    let version = null;
    try {
      version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    } catch {
      // A package without a readable version is still named.
    }
    recordResolved(name, version, dir, 'package-set');
  }
  if (!elsewhere) refuseProtected([output], cwd);
  // Elsewhere, the file named is the file written: a link there would put the
  // render wherever the link points.
  if (elsewhere && fs.lstatSync(output, {throwIfNoEntry: false})?.isSymbolicLink()) {
    throw new AstryxError(
      `${shown(cwd, output)} is a symbolic link, so it is not replaced; nothing was written. Name the file itself.`,
      [],
      ERROR_CODES.ERR_PATH_TRAVERSAL,
    );
  }
  // An existing file is replaced only when a render wrote it.
  if (
    fs.existsSync(output) &&
    fs.statSync(output).isFile() &&
    !/<meta name="generator" content="Astryx[ "]/.test(fs.readFileSync(output, 'utf8').slice(0, 4096))
  ) {
    throw new AstryxError(
      `${shown(cwd, output)} already exists and was not written by a render, so it is not replaced; nothing was written. Choose another --out.`,
      [],
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }
  // A render never replaces an HTML file this user cannot write, and the file
  // it replaces keeps its permission bits.
  const existingMode = fs.statSync(output, {throwIfNoEntry: false})?.mode;
  if (existingMode !== undefined) {
    try {
      fs.accessSync(output, fs.constants.W_OK);
    } catch (e) {
      throw new AstryxError(
        `Could not write ${shown(cwd, output)}: ${/** @type {Error} */ (e).message}; nothing was written.`,
        [],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    }
  }
  writeOutput(output, page.html, cwd, {replace: true, ...(existingMode === undefined ? {} : {mode: existingMode & 0o7777})});
  // The checks read the bytes on disk, not the string in memory: they vouch
  // for the file that will be shared.
  const written = fs.readFileSync(output, 'utf8');
  return {
    input: shown(cwd, input),
    output: shown(cwd, output),
    bytes: Buffer.byteLength(page.html),
    files: page.files,
    stylesheets: page.stylesheets,
    classes: page.classes,
    cssBytes: page.cssBytes,
    markupBytes: page.markupBytes,
    sourceBytes: page.sourceBytes,
    images: page.images,
    warnings: page.warnings,
    ...(page.notCarried ? {notCarried: page.notCarried} : {}),
    scriptBytes: page.scriptBytes ?? 0,
    scriptModules: page.scriptModules ?? 0,
    checks: {outside: outsideRequests(written), roundTrip: roundTrip(written, input, page.files)},
    ...(page.remoteImages ? {remoteImages: page.remoteImages} : {}),
    ...(pictures ? {pictures: await pagePictures(output, cwd, input)} : {}),
  };
}

/** The phone the pictures are taken on: its window in CSS pixels. */
const PHONE = Object.freeze({width: 375, height: 812, mobile: true});

/**
 * Pictures of the written file, to check how it looks, not to send: a
 * phone in light and dark, and a desktop window, taken after the page's
 * script ran, with a browser already on the machine (the project's
 * Playwright, else a Chrome or Chromium). They go into a new folder in the
 * system temp folder, never beside the file. No browser, or one that
 * fails: no pictures, the reason, and the file stands as written. The
 * picture runner loads only here, so an export without pictures loads
 * none of it.
 * @param {string} output the written file, absolute
 * @param {string} cwd
 * @param {string} input the page module, absolute: its folder finds the
 *   project's Playwright
 * @returns {Promise<import('./render.type.mjs').RenderPictures>}
 */
async function pagePictures(output, cwd, input) {
  const {takePictures} = await import('../../foundation/pictures/pictures.mjs');
  const stem = path.basename(output).replace(/\.html?$/i, '');
  // The system temp folder, as for a template's scratch copy: never a disk's
  // root or a folder that holds the home folder.
  const [temp] = tempFolders();
  if (!temp)
    return {
      skipped:
        'there is no system temp folder to write them to (a disk root or a folder holding the home folder is not one); set TMPDIR to a writable folder outside the home folder, then run the command again',
    };
  /** @type {string} */
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(temp, `astryx-pictures-${stem}-`));
  } catch (e) {
    return {skipped: `the system temp folder cannot be written (${/** @type {any} */ (e)?.code ?? e})`};
  }
  const jobs = [
    {html: output, png: path.join(dir, `${stem}-phone.png`), mode: /** @type {const} */ ('light'), window: PHONE},
    {html: output, png: path.join(dir, `${stem}-phone-dark.png`), mode: /** @type {const} */ ('dark'), window: PHONE},
    {html: output, png: path.join(dir, `${stem}-desktop.png`), mode: /** @type {const} */ ('light')},
  ];
  const taken = await takePictures({cwd, from: input}, jobs);
  const missed = taken.find(r => !r.ok);
  if (missed || taken.length < jobs.length) {
    fs.rmSync(dir, {recursive: true, force: true});
    if (missed && 'reason' in missed) return {skipped: missed.reason};
    const failed = missed && 'failed' in missed ? missed.failed : [];
    return {
      skipped: failed.length
        ? `${failed.join('; ')}; install Playwright with its browser, or Google Chrome or Chromium`
        : 'no browser was found; install Playwright with its browser, or Google Chrome or Chromium',
    };
  }
  return {phone: jobs[0].png, phoneDark: jobs[1].png, desktop: jobs[2].png};
}

/**
 * Refuse files a test, story or benchmark runner would run where they land,
 * judged from the repository root (every folder above the file up to it),
 * else the topmost folder with a package.json, else the current folder.
 * @param {string[]} files absolute
 * @param {string} cwd
 * @param {string} input
 */
function refuseRunnable(files, cwd, input) {
  /** @param {string} marker */
  const nearest = marker => {
    for (let d = cwd; ; d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, marker))) return d;
      if (path.dirname(d) === d) return null;
    }
  };
  let topPackage = null;
  for (let d = cwd; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'package.json'))) topPackage = d;
    if (path.dirname(d) === d) break;
  }
  const projectRoot = nearest('.git') ?? topPackage ?? cwd;
  const runnable = files
    .map(file => path.relative(projectRoot, file).split(path.sep))
    .filter(segments => runnerPicksUp(segments))
    .map(segments => segments.join('/'));
  if (runnable.length > 0) {
    throw new AstryxError(
      `${shown(cwd, input)} would write ${runnable.join(', ')} (from the project root), where a test, story or benchmark runner would run it; nothing was written. Restore it somewhere else with --out.`,
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
}

/**
 * The `paths` entry that lets an alias import find the file it came back
 * as, from the folder the config resolves targets from: the part of the
 * import that the file's path ends with becomes the `*`
 * (`@/components/Header` in `report-restored/components/` gives `@/*` and
 * `./report-restored/*`), else the import maps to its file.
 * @param {string} spec
 * @param {string} file absolute
 * @param {string} base absolute
 * @returns {[string, string]}
 */
function aliasEntry(spec, file, base) {
  /** @param {string} p */
  const fromBase = p => {
    const rel = path.relative(base, p).split(path.sep).join('/');
    return climbsOut(rel) ? rel : `./${rel}`;
  };
  const named = spec.split('/');
  let held = path.relative(base, file).split(path.sep).join('/').replace(/\.[^./]+$/, '').split('/');
  if (held.at(-1) === 'index' && named.at(-1) !== 'index') held = held.slice(0, -1);
  let same = 0;
  while (same < named.length - 1 && same < held.length && named[named.length - 1 - same] === held[held.length - 1 - same]) same++;
  if (same === 0) return [spec, fromBase(file)];
  const folder = fromBase(path.join(base, ...held.slice(0, held.length - same)));
  return [`${named.slice(0, named.length - same).join('/')}/*`, folder === './' ? './*' : `${folder}/*`];
}

/**
 * What a restore tells about the alias imports no alias of the receiving
 * project names: the config the `paths` belong in (the one TypeScript reads
 * for the page, else a new tsconfig.json at the project's root or the
 * current folder), the whole `paths` it needs (its current entries and the
 * new ones), and each import with its file.
 * @param {{spec: string, file: string}[]} unaliased
 * @param {string} page absolute: where the page lands
 * @param {string} cwd
 */
function aliasedResult(unaliased, page, cwd) {
  const home = pathsHomeFor(page, findPackageRoot(path.dirname(page)) ?? cwd);
  /** @param {string} p */
  const fromBase = p => {
    const rel = path.relative(home.base, p).split(path.sep).join('/');
    return climbsOut(rel) ? rel : `./${rel}`;
  };
  // The whole `paths` the config needs: the entries it has now (a `paths` of
  // its own replaces inherited ones), then every target the imports need.
  /** @type {Record<string, string[]>} */
  const paths = {};
  for (const pattern of home.current) paths[pattern.key] = pattern.targets.map(fromBase);
  const entries = unaliased.map(({spec, file}) => aliasEntry(spec, file, home.base));
  for (const [key, target] of entries) paths[key] = [...new Set([...(paths[key] ?? []), target])];
  // TypeScript tries a pattern's targets in turn, so an import through a
  // pattern with more than one target could reach another file first; each
  // such import gets an entry of its own, which TypeScript reads before any
  // pattern.
  unaliased.forEach(({spec, file}, i) => {
    const [key] = entries[i];
    if (key !== spec && paths[key].length > 1) paths[spec] = [fromBase(file)];
  });
  return {
    config: shown(cwd, home.config),
    paths,
    imports: unaliased.map(({spec, file}) => ({import: spec, file: shown(cwd, file)})),
  };
}

/**
 * The new folder a restore without --out writes into: beside the HTML file,
 * named after it (`report.html` gives `report-restored/`, then
 * `report-restored-2/` when that exists). A name already taken is never
 * written again, so a temporary folder a stopped run left for it goes.
 * @param {string} input absolute
 */
function restoreFolder(input) {
  return freeRestoreFolder(path.dirname(input), path.basename(input), removeStaleTemporaries);
}

/**
 * The version of the CLI that rendered a file: the one its embedded source
 * records, else the one its generator meta names.
 * @param {import('../../foundation/render/source-block.mjs').EmbeddedSource} source
 * @param {string} html
 * @returns {string | null}
 */
function renderedByOf(source, html) {
  const named = source.cli ?? /<meta name="generator" content="Astryx ([^"<>]+)">/.exec(html.slice(0, 4096))?.[1];
  return isValidSemver(named) ? /** @type {string} */ (named) : null;
}

/**
 * The packages a file says its page rendered with, as `name@version`, when
 * it records them.
 * @param {import('../../foundation/render/source-block.mjs').EmbeddedSource} source
 * @returns {string[] | null}
 */
function packagesOf(source) {
  const recorded = source.packages;
  if (!recorded || typeof recorded !== 'object' || Array.isArray(recorded)) return null;
  return Object.entries(recorded)
    .filter(([name, version]) => isPackageName(name) && isValidSemver(version))
    .map(([name, version]) => `${name}@${version}`);
}

/**
 * Whether someone changed the page after the render, for a file that records
 * the page as rendered: each run of text that changed (the title first), and
 * whether the styles changed. The restored source never takes these changes:
 * it is the page as rendered.
 * @param {import('../../foundation/render/source-block.mjs').EmbeddedSource} source
 * @param {string} html
 * @param {{file: string, text: string}[]} texts the restored modules and JSON files, as shown to the caller
 * @returns {{edited?: boolean, stylesEdited?: boolean, edits?: import('./render.type.mjs').RenderEdit[], moreEdits?: number}}
 */
function pageChanges(source, html, texts) {
  const recorded = source.markup;
  if (!recorded || typeof recorded.sha256 !== 'string') return {};
  // The page as a browser reads it, so a copy whose line ends changed on the
  // way is no edit.
  const markupNow = renderedMarkupOf(html);
  const now = markupNow === null ? null : asParsed(markupNow);
  const head = renderedHeadOf(html);
  const text = recordedText(recorded);
  const titleNow = head.title === null ? null : asParsed(decode(head.title));
  const titleEdited = typeof text?.title === 'string' && titleNow !== asParsed(text.title);
  const stylesEdited = typeof recorded.style === 'string' ? head.style === null || sha256(asParsed(head.style)) !== recorded.style : undefined;
  const markupEdited = now === null || sha256(now) !== recorded.sha256;
  const styles = stylesEdited === undefined ? {} : {stylesEdited};
  if (!markupEdited && !titleEdited && !stylesEdited) return {edited: false, ...styles};
  const {edits, more} = markupEdited ? textEdits(text?.runs ?? [], textRuns(now ?? '')) : {edits: [], more: 0};
  // A title that changed with the heading it comes from is one change, not two.
  const titleEdit = {was: /** @type {string} */ (text?.title), now: titleNow};
  const titleAgain = edits.some(edit => edit.was === titleEdit.was && edit.now === titleEdit.now);
  const all = [...(titleEdited && !titleAgain ? [titleEdit] : []), ...edits];
  return {
    edited: true,
    ...styles,
    // Each change is found in the source by its whole text, then cut to show.
    edits: all.map(edit => ({
      was: edit.was === null ? null : clip(edit.was),
      now: edit.now === null ? null : clip(edit.now),
      ...((edit.was && locate(edit.was, texts)) || {}),
    })),
    ...(more > 0 ? {moreEdits: more} : {}),
  };
}

/**
 * Turn a rendered HTML file back into a page module.
 * @param {{cwd: string, input: string, output: string | undefined, overwrite: boolean}} args absolute paths
 * @returns {import('./render.type.mjs').RenderReverseResponse['data']}
 */
export function reverseToFile({cwd, input, output, overwrite}) {
  const html = readInput(input, cwd).toString('utf8');
  const block = readSourceBlock(html);
  const rendered = /<meta name="generator" content="Astryx[ "]/.test(html);
  // A merge that left conflict markers in an Astryx page holds two versions
  // of it at once, the embedded source too: choosing one would choose for
  // the user.
  if ((block.found || rendered || isAstryxMarkup(html)) && /^<{7}(?: |$)/m.test(html) && /^>{7}(?: |$)/m.test(html)) {
    throw new AstryxError(
      `${shown(cwd, input)} holds unresolved merge conflict markers (<<<<<<< and >>>>>>>), so it holds two versions at once; nothing was written. Keep the whole file from one side, or render the merged page again, then run this again.`,
      [],
      ERROR_CODES.ERR_RENDER_SOURCE_DAMAGED,
    );
  }
  /** @param {string[]} files */
  const refuseExisting = files => {
    if (overwrite) return;
    const existing = files.filter(file => fs.existsSync(file));
    if (existing.length > 0) {
      throw new AstryxError(
        `${existing.map(file => shown(cwd, file)).join(', ')} already exist${existing.length === 1 ? 's' : ''}; nothing was written. Pass --overwrite to replace ${existing.length === 1 ? 'it' : 'them'}.`,
        [],
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    }
  };
  /** A page is never written as a configuration, test, spec or story file. @param {string} file */
  const refuseConfigTarget = file => {
    const rel = path.relative(cwd, file).split(path.sep).join('/');
    const where = climbsOut(rel) || path.isAbsolute(rel) ? path.basename(file) : rel;
    // Where the page lands must be a page module, and a name no tool takes
    // as its own (configuration, a runner's file): the same rules as any
    // file a restore writes.
    const problem = embeddedPathProblem(where, {page: true}) ?? embeddedPathProblem(where);
    if (problem) {
      throw new AstryxError(
        `${shown(cwd, file)} is not a page module file name a reverse writes (${problem.reason}); nothing was written.`,
        [],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  };
  if (block.found && 'newer' in block) {
    const {format, cli} = block.newer;
    const command = `${cliCommand(cli ?? 'latest')} experimental import ${shellArg(shown(cwd, input))}`;
    throw new AstryxError(
      `${shown(cwd, input)} is in render format ${format}${cli ? `, written by @astryxdesign/cli ${cli}` : ''}, which is newer than this CLI reads (render format ${RENDER_FORMAT}, @astryxdesign/cli ${cliVersion()}); nothing was written. Give it back with ${cli ? 'the CLI that wrote it' : 'the latest CLI'}: ${command}`,
      [{name: command, reason: cli ? 'give it back with the CLI version that wrote the file' : 'give it back with the latest CLI'}],
      ERROR_CODES.ERR_RENDER_NEWER_FORMAT,
    );
  }
  if (block.found && 'damaged' in block) {
    throw new AstryxError(
      `${shown(cwd, input)} carries an Astryx page source, but ${block.damaged}, so it cannot be given back exactly.`,
      [],
      ERROR_CODES.ERR_RENDER_SOURCE_DAMAGED,
    );
  }
  if (block.found) {
    const {source} = block;
    // A file someone sends is untrusted: it may carry only what a render
    // embeds (the page, and the stylesheets, JSON and images it imports).
    source.files.forEach((f, i) => {
      const problem = embeddedPathProblem(f.path, {page: i === 0});
      if (problem) {
        throw new AstryxError(
          `${shown(cwd, input)} carries ${problem.reason}, which a render never embeds; nothing was written.`,
          [],
          ERROR_CODES[problem.code],
        );
      }
    });
    // A restore without --out picks the first folder name no folder has.
    // When another run creates the new folder first, this one plans again:
    // without --out it takes the next name; with --out its files go into the
    // folder still new under it, or meet every check a restore into folders
    // that exist meets. A folder that appears exists from then on, so every
    // pass plans for a new one.
    for (;;) {
      // Without --out, the page and the files it imports come back into a new
      // folder beside the HTML file, named after it (`report.html` gives
      // `report-restored/`), with the layout they were rendered in. Nothing in
      // the received file decides where in your project anything goes.
      const folder = output ? null : restoreFolder(input);
      const requested = output ?? path.join(/** @type {string} */ (folder), ...source.files[0].path.split('/'));
      refuseConfigTarget(requested);
      const seen = new Set();
      for (const f of source.files) {
        const key = f.path.toLowerCase();
        if (seen.has(key)) {
          throw new AstryxError(
            `${shown(cwd, input)} lists ${f.path} more than once, which a render never does; nothing was written.`,
            [],
            ERROR_CODES.ERR_RENDER_SOURCE_DAMAGED,
          );
        }
        seen.add(key);
      }
      // Modules, stylesheets and JSON are written only when the page reaches
      // them through its own imports: one it never imports is not part of it,
      // whatever its name.
      const aliases = receivingAliases(requested);
      const first = reachableFiles(source.files, {aliases, recorded: source.aliases, publicDir: source.publicDir});
      const unreached = first.missing;
      let {reached} = first;
      // A file the render could not carry is missing too, also when no
      // import here names it (an alias this reverse cannot resolve). An
      // import already in missing names one recorded file, the one it
      // resolves to as the walk resolves it (the path as written, then each
      // extension in order, then its folder's index), so only that file is
      // not listed again.
      const recordedOut = (Array.isArray(source.notCarried) ? source.notCarried : []).filter(
        (/** @type {unknown} */ file) => typeof file === 'string' && file !== '',
      );
      const recordedSet = new Set(recordedOut);
      const covered = new Set(
        unreached.map(spec => resolutionCandidates(spec).find(candidate => recordedSet.has(candidate))).filter(Boolean),
      );
      const missing = [...unreached];
      const listed = new Set(missing);
      for (const file of recordedOut) {
        if (covered.has(file) || listed.has(file)) continue;
        listed.add(file);
        missing.push(file);
      }
      // A carried image, font or media file needs no import to be part of the
      // page (it may be named in markup, a stylesheet, JSON or a computed
      // path): the render's own list is the authority, so it is kept when its
      // bytes are a known image, font or media format (any, whatever the
      // extension), and goes where the layout puts it.
      /** @type {Set<string>} */
      const listedAssets = new Set();
      for (const f of source.files) {
        if (reached.has(f.path) || !isAssetPath(f.path)) continue;
        if (isAssetBytes(Buffer.from(f.base64, 'base64'))) listedAssets.add(f.path);
      }
      const keepListedAssets = (/** @type {typeof reached} */ map) => {
        for (const p of listedAssets) if (!map.has(p)) map.set(p, {relative: true, aliased: new Set(), unaliased: new Set()});
      };
      keepListedAssets(reached);
      const stray = source.files.filter(f => !reached.has(f.path)).map(f => f.path);
      if (stray.length > 0) {
        throw new AstryxError(
          `${shown(cwd, input)} carries ${stray.length === 1 ? 'a file' : 'files'} the page does not reach through its imports here, or that is not the image, font or media file its name says (${stray.join(', ')}), which a render never embeds; nothing was written. A file the page imports through a path alias comes back where this project's tsconfig.json or jsconfig.json has that alias, and anywhere when the import cannot be a package name (\`@/…\`, \`~/…\`) and the CLI that rendered the file recorded it (as this one does).`,
          [],
          ERROR_CODES.ERR_RENDER_SOURCE_DAMAGED,
        );
      }
      // Each file the page reaches by a relative import goes where that import
      // finds it from the page's new folder, so every relative import still
      // resolves wherever the page lands; a file reached through an alias goes
      // where this project's alias points. Every file but the page must land
      // in a folder this restore creates: a received file never adds a file to
      // a folder that already exists (a server hook at the project root, a
      // middleware module), so a page with neighbours comes back into a new
      // folder.
      const entryDir = path.posix.dirname(source.files[0].path);
      const anchor = path.dirname(requested);
      /** @param {string} p */
      const placeFrom = p => path.resolve(anchor, path.posix.relative(entryDir, p));
      // A file beside the page or elsewhere goes only into a folder this
      // restore creates: never into a folder that already exists.
      // The one folder every file but the page must land in: the topmost
      // folder on the page's path that this restore creates. When the page's
      // folder already exists there is none, so a page with neighbours comes
      // back only into a new folder.
      // Without --out, that is the folder this restore picked because no
      // folder had its name: another run that takes the name first makes this
      // one take the next.
      const home = folder ?? newFolderOf(requested);
      const within = (/** @type {string} */ file) => isInside(file, home);
      const target = path.join(anchor, path.basename(requested));
      const byPath = new Map(source.files.map(f => [f.path, f]));
      const carried = (/** @type {string} */ p) => Buffer.from(/** @type {{base64: string}} */ (byPath.get(p)).base64, 'base64');
      const sameFile = (/** @type {string} */ file, /** @type {Buffer} */ bytes) => fs.existsSync(file) && fs.statSync(file).isFile() && fs.readFileSync(file).equals(bytes);
      // A file an alias leads to outside the new folder is used as the
      // project has it only when it and every carried file it reaches, where
      // the project would find each one, are byte for byte the page's copies:
      // otherwise the page would build against files it was not rendered with.
      /** @type {Set<string>} */
      const reused = new Set();
      /** @type {Map<string, string[]>} */
      const changedBelow = new Map();
      for (const [p, r] of reached) {
        for (const abs of r.aliased) {
          if (abs === target || within(abs) || reused.has(abs) || changedBelow.has(abs) || !sameFile(abs, carried(p))) continue;
          const sub = reachableFiles([/** @type {{path: string, base64: string}} */ (byPath.get(p)), ...source.files.filter(f => f.path !== p)], {aliases, recorded: {}, publicDir: source.publicDir});
          /** @type {string[]} */
          const changed = [];
          for (const [q, below] of sub.reached) {
            if (q === p) continue;
            const where = [...(below.relative ? [path.resolve(path.dirname(abs), path.posix.relative(path.posix.dirname(p), q))] : []), ...below.aliased];
            for (const file of where) if (!sameFile(file, carried(q))) changed.push(file);
          }
          if (changed.length === 0) reused.add(abs);
          else changedBelow.set(abs, [...new Set(changed)].map(file => shown(cwd, file)).sort());
        }
      }
      // What the page reaches when those files are the project's: what they
      // import is the project's too, so its copies are not written.
      if (reused.size > 0) {
        reached = reachableFiles(source.files, {aliases, recorded: source.aliases, publicDir: source.publicDir, reused}).reached;
        keepListedAssets(reached);
      }
      /** @type {{file: string, bytes: Buffer}[]} */
      const writes = [];
      const placed = new Set();
      /** @type {string[]} */
      const outside = [];
      // The alias imports no alias here names: their files come back in the
      // page's own layout, and the page needs the alias to build, in the config
      // TypeScript reads for it.
      const unaliased = [...reached].flatMap(([p, r]) => [...r.unaliased].map(spec => ({spec, file: placeFrom(p)})));
      /** @type {{import: string, file: string}[]} */
      const sameAsProject = [];
      /** @typedef {{import: string, project: string, exists: boolean, file: string, changed?: string[], projectWide: true, instead: {file: string, import: string}[]}} Differs */
      /** @type {Differs[]} */
      const differs = [];
      /** @type {{entry: Differs, importers: string[], copy: string}[]} */
      const insteadFor = [];
      source.files.forEach((f, i) => {
        const reach = reached.get(f.path);
        // Reached only through a file the page uses as the project has it.
        if (!reach) return;
        const bytes = Buffer.from(f.base64, 'base64');
        const own = i === 0 ? target : placeFrom(f.path);
        /** @param {string} file */
        const place = file => {
          if (placed.has(file)) return;
          placed.add(file);
          if (file !== target && !within(file)) outside.push(file);
          writes.push({file, bytes});
        };
        if (i === 0 || reach.relative) place(own);
        for (const file of reach.aliased) {
          const names = [...(reach.via?.get(file) ?? [])];
          // Where this project's alias points inside the new folder, the copy
          // goes there. Outside it, a received file never adds or replaces a
          // file: the page uses the project's file when it is the same, and
          // otherwise its own copy comes back in its layout, with the alias
          // entry that reaches it.
          if (file === target || within(file)) {
            place(file);
            continue;
          }
          if (reused.has(file)) {
            for (const name of names) sameAsProject.push({import: name, file: shown(cwd, file)});
            continue;
          }
          const exists = fs.existsSync(file) && fs.statSync(file).isFile();
          const changed = changedBelow.get(file);
          place(own);
          for (const name of names) {
            unaliased.push({spec: name, file: own});
            // With it, an entry that leads this import to the copy changes
            // what every other importer of it in the project gets too.
            const entry = {import: name, project: shown(cwd, file), exists, file: shown(cwd, own), ...(changed ? {changed} : {}), projectWide: /** @type {const} */ (true), instead: /** @type {{file: string, import: string}[]} */ ([])};
            differs.push(entry);
            insteadFor.push({entry, importers: [...(reach.by?.get(name) ?? [])], copy: own});
          }
        }
      });
      // The narrower fix than a `paths` entry, which every file in the
      // project reads: each restored file that makes the import (the page, a
      // file it reaches by a relative import, or another restored copy)
      // imports the copy by a relative path. Known once every file is placed.
      const restoredAt = (/** @type {string} */ q) =>
        q === source.files[0].path ? [target] : [placeFrom(q), ...(reached.get(q)?.aliased ?? [])].filter(file => placed.has(file));
      for (const {entry, importers, copy} of insteadFor) {
        entry.instead = [...new Set(importers.flatMap(restoredAt))]
          .sort()
          .map(from => ({file: shown(cwd, from), import: relativeSpecifierBetween(from, copy)}));
      }
      unaliased.sort((a, b) => (a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0));
      const byImport = (/** @type {{import: string}} */ a, /** @type {{import: string}} */ b) => (a.import < b.import ? -1 : a.import > b.import ? 1 : 0);
      const aliased =
        unaliased.length === 0 && sameAsProject.length === 0
          ? null
          : {
              ...(unaliased.length === 0 ? {imports: []} : aliasedResult(unaliased, requested, cwd)),
              ...(sameAsProject.length > 0 ? {sameAsProject: sameAsProject.sort(byImport)} : {}),
              ...(differs.length > 0 ? {differs: differs.sort(byImport)} : {}),
            };
      if (outside.length > 0) {
        const top = entryDir === '.' ? '' : `${entryDir}/`;
        let fresh = 'restored';
        for (let n = 2; fs.existsSync(path.join(cwd, fresh)); n++) fresh = `restored-${n}`;
        const suggestion = `--out ${shellArg(`${fresh}/${top}${path.basename(requested)}`)}`;
        throw new AstryxError(
          `${shown(cwd, input)} would add ${outside.map(file => shown(cwd, file)).join(', ')} outside the folder the restore creates; nothing was written. A received page writes the files it imports only inside one new folder: restore it into one, such as ${suggestion}.`,
          [{name: suggestion, reason: 'restore the page and the files it imports into a new folder, keeping their layout'}],
          ERROR_CODES.ERR_PATH_TRAVERSAL,
        );
      }
      writes.forEach((w, i) => confined(w.file, cwd, i === 0 ? 'The page' : 'The embedded file'));
      refuseRunnable(writes.map(w => w.file), cwd, input);
      refuseExisting(writes.filter(w => !isInside(w.file, home)).map(w => w.file));
      refuseProtected(writes.map(w => w.file), cwd, home);
      if (!writeRestore(writes, home, cwd, overwrite)) continue;
      const renderedBy = renderedByOf(source, html);
      const packages = packagesOf(source);
      // The files whose text a page shows: its modules and the JSON data
      // they import.
      const texts = writes
        .filter(w => [...MODULE_EXTENSIONS, '.json'].includes(path.extname(w.file).toLowerCase()))
        .map(w => ({file: shown(cwd, w.file), text: w.bytes.toString('utf8')}));
      return {
        input: shown(cwd, input),
        mode: 'embedded',
        output: shown(cwd, target),
        files: writes.map(w => shown(cwd, w.file)),
        // The page is byte for byte the one rendered; an import it makes that
        // the file does not carry (a file a render never embeds) is named.
        exact: missing.length === 0,
        ...(missing.length > 0 ? {missing} : {}),
        ...(aliased ? {aliased} : {}),
        format: source.version,
        ...(renderedBy ? {renderedBy} : {}),
        ...(packages ? {packages} : {}),
        ...(typeof source.title === 'string' ? {title: source.title} : {}),
        ...pageChanges(source, html, texts),
      };
    }
  }
  // A render always ends its file with `</html>`. A file a render wrote that
  // has none lost its end on the way, the embedded source with it: the
  // markup left is only part of the page.
  if (rendered && !/<\/html>/i.test(html)) {
    throw new AstryxError(
      `${shown(cwd, input)} is cut short: it ends before its embedded source, so the page cannot be given back; nothing was written. Get the whole file again.`,
      [],
      ERROR_CODES.ERR_RENDER_SOURCE_DAMAGED,
    );
  }
  // A file a render wrote, whose source block was taken out on the way
  // (sanitizers and editors strip <script> elements), says so.
  if (!isAstryxMarkup(html) && rendered) {
    throw new AstryxError(
      `${shown(cwd, input)} was rendered by Astryx, but its embedded source was removed (a sanitizer or an editor strips <script> blocks) and it has no Astryx components to rebuild from; nothing was written. Render the page again from its source and send the new file as is.`,
      [],
      ERROR_CODES.ERR_RENDER_SOURCE_DAMAGED,
    );
  }
  if (!isAstryxMarkup(html)) {
    throw new AstryxError(
      `${shown(cwd, input)} is not an Astryx page: it has no embedded source and no Astryx components to rebuild from. To start an Astryx page like it, run astryx build "<what the page is>".`,
      [
        {
          name: 'astryx build "<what the page is>"',
          reason: 'start an Astryx page from a description of it instead',
        },
      ],
      ERROR_CODES.ERR_RENDER_NOT_ASTRYX,
    );
  }
  // As above: a folder another run creates first exists from then on.
  for (;;) {
    const folder = output ? null : restoreFolder(input);
    const target = output ?? path.join(/** @type {string} */ (folder), 'page.tsx');
    const home = folder ?? newFolderOf(target);
    refuseConfigTarget(target);
    confined(target, cwd, 'The page');
    refuseRunnable([target], cwd, input);
    refuseExisting(isInside(target, home) ? [] : [target]);
    // Components resolve from where the page will live, then from the HTML
    // file's folder, then from the current folder.
    const from =
      [path.dirname(target), path.dirname(input), cwd].find(d => resolvesCore(d)) ?? cwd;
    const rebuilt = rebuildPage(html, from);
    refuseProtected([target], cwd, home);
    if (!writeRestore([{file: target, bytes: Buffer.from(rebuilt.source)}], home, cwd, overwrite)) continue;
    return {
      input: shown(cwd, input),
      mode: 'rebuilt',
      output: shown(cwd, target),
      files: [shown(cwd, target)],
      exact: false,
      components: rebuilt.components,
      elements: rebuilt.elements,
      unknown: rebuilt.unknown,
      omitted: rebuilt.omitted,
    };
  }
}
