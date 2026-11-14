// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `render` subject's adapter: its only access to the environment.
 * It reads the page or rendered file, runs the renderer, and writes results.
 *
 * @position api/render — adapter for api/render/render.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  PAGE_EXTENSIONS,
  RenderError,
  renderPage,
} from '../../foundation/render/render-page.mjs';
import {
  RENDER_FORMAT,
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
import {isValidSemver} from '../../foundation/env/semver.mjs';
import {embeddedPathProblem, runnerPicksUp} from '../../foundation/render/embedded-files.mjs';
import {isAssetBytes, isAssetPath} from '../../foundation/render/assets.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';
import {publishNewFile} from '../../foundation/fs/publish-file.mjs';
import {reachableFiles, receivingAliases} from '../../foundation/render/embedded-imports.mjs';
import {isAstryxMarkup} from '../../foundation/render/html-reader.mjs';
import {rebuildPage} from '../../foundation/render/rebuild.mjs';
import {cliVersion} from '../../foundation/integrations/cli-peer-version.mjs';
import {assertWithin, PathSafetyError} from '../../foundation/fs/path-safety.mjs';
import {requireCoreDir} from '../../foundation/fs/paths.mjs';
import {runChoice} from '../../foundation/release/run-context.mjs';
import {isServedPackage} from '../../foundation/render/served-packages.mjs';
import {hostedRun, recordResolved} from '../../foundation/runtime/package-root.mjs';

export {PAGE_EXTENSIONS, embeddedPathProblem};

/** @param {string} cwd @param {string} file */
const shown = (cwd, file) => {
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel)
    ? rel.split(path.sep).join('/')
    : file;
};

/**
 * Read a file the caller named, or throw ERR_FILE_NOT_FOUND.
 * @param {string} file absolute
 * @param {string} cwd
 * @returns {Buffer}
 */
function readInput(file, cwd) {
  try {
    if (!fs.statSync(file).isFile()) throw new Error('not a file');
    return fs.readFileSync(file);
  } catch {
    throw new AstryxError(
      `${shown(cwd, file)} does not exist`,
      [],
      ERROR_CODES.ERR_FILE_NOT_FOUND,
    );
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
 * @returns {string}
 */
function confined(file, cwd, what) {
  try {
    return assertWithin(file, cwd, {allowAbsolute: true, label: what});
  } catch (e) {
    if (e instanceof PathSafetyError) {
      throw new AstryxError(
        `${what} ${shown(cwd, file)} is outside the current folder; nothing was written. Write inside the folder you run the command from.`,
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
const isInside = (file, folder) => {
  if (!folder) return false;
  const rel = path.relative(folder, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

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
 * A hidden temporary name beside a file or folder, as the CLI's other writers
 * name theirs.
 * @param {string} file absolute
 */
const temporaryBeside = file => path.join(path.dirname(file), `.${path.basename(file)}.tmp-${randomUUID()}`);

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
  if (temporary && err?.path === temporary) return `${shown(cwd, folder)} does not take a new file (${err.code ?? err.message})`;
  if (temporary && err?.path?.startsWith(temporary + path.sep)) return err.code ?? err.message;
  return String(err?.message ?? e);
}

/**
 * Write one file in one step: its bytes go to a temporary file beside it,
 * which then takes its name. A reader, or another run at the same time, sees
 * the old whole file or the new one, never part of one, and a run stopped
 * part-way leaves the old file as it was. A file this user cannot write is
 * not replaced, and a replaced file keeps its permission bits.
 * @param {string} file absolute
 * @param {string | Buffer} content
 * @param {string} cwd
 * @param {{replace: boolean}} options `replace`: an existing file may be
 *   replaced; without it, a file that appeared since the checks stays
 */
function writeOutput(file, content, cwd, {replace}) {
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
    if (existing) fs.accessSync(file, fs.constants.W_OK);
    temporary = temporaryBeside(file);
    fs.writeFileSync(temporary, content, {flag: 'wx'});
    if (existing) fs.chmodSync(temporary, existing.mode & 0o7777);
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
 * works, and of two runs that pick the same name, one gets it and the other
 * learns that it is taken.
 * @param {string} folder absolute; does not exist yet
 * @param {{file: string, bytes: Buffer}[]} writes absolute targets inside `folder`
 * @param {string} cwd
 * @returns {boolean} false when the folder appeared before this run could take its name
 */
function writeFolder(folder, writes, cwd) {
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
 * The refusal for a restore whose new folder another run created first.
 * @param {string} folder
 * @param {string} cwd
 */
const folderTaken = (folder, cwd) =>
  new AstryxError(
    `${shown(cwd, folder)} appeared while this restore ran; nothing was written. Restore into another folder with --out.`,
    [],
    ERROR_CODES.ERR_FILE_EXISTS,
  );

/** @param {unknown} e */
function asAstryxError(e) {
  if (e instanceof RenderError) {
    const code = /** @type {import('../../foundation/response/error-codes.mjs').ErrorCode} */ (e.code);
    /** @type {{name: string, reason: string}[]} */
    const suggestions = [];
    if (e.code === 'ERR_RENDER_MISSING_DEPENDENCY' && typeof e.detail?.package === 'string') {
      suggestions.push({name: `npm install ${e.detail.package}`, reason: 'install the package the page imports'});
    }
    return new AstryxError(e.message, suggestions, code);
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
    return {dir: requireCoreDir(dir), integrations: hostedRun()?.integrations ?? []};
  } catch (e) {
    const err = /** @type {any} */ (e);
    return err?.code === ERROR_CODES.ERR_VERSIONS_UNAVAILABLE ? {unavailable: err} : null;
  }
}

/**
 * Render a page module to one HTML file and write it.
 * @param {{cwd: string, input: string, output: string, title?: string}} args absolute paths
 * @returns {Promise<import('./render.type.mjs').RenderPageResponse['data']>}
 */
export async function renderToFile({cwd, input, output, title}) {
  readInput(input, cwd);
  confined(output, cwd, 'The output');
  /** @type {import('../../foundation/render/render-page.mjs').RenderedPage} */
  let page;
  try {
    const set = servedSet(input);
    try {
      page = await renderPage(input, {title, version: cliVersion(), served: set && 'dir' in set ? set : null, output});
    } catch (e) {
      // A page that needs the Core the CLI could not obtain says why.
      const missing = /** @type {any} */ (e)?.code === 'ERR_RENDER_MISSING_DEPENDENCY' ? /** @type {any} */ (e).detail?.package : null;
      if (set && 'unavailable' in set && typeof missing === 'string' && isServedPackage(missing, hostedRun()?.integrations ?? [])) {
        throw new AstryxError(set.unavailable.message, [], ERROR_CODES.ERR_VERSIONS_UNAVAILABLE);
      }
      throw e;
    }
  } catch (e) {
    throw asAstryxError(e);
  }
  for (const {name, dir} of page.fromSet) {
    let version = null;
    try {
      version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    } catch {
      // A package without a readable version is still named.
    }
    recordResolved(name, version, dir, 'package-set');
  }
  refuseProtected([output], cwd);
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
  writeOutput(output, page.html, cwd, {replace: true});
  return {
    input: shown(cwd, input),
    output: shown(cwd, output),
    bytes: Buffer.byteLength(page.html),
    files: page.files,
    stylesheets: page.stylesheets,
    classes: page.classes,
    cssBytes: page.cssBytes,
    images: page.images,
    warnings: page.warnings,
  };
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
 * The new folder a restore without --out writes into: beside the HTML file,
 * named after it (`report.html` gives `report-restored/`, then
 * `report-restored-2/` when that exists).
 * @param {string} input absolute
 */
function restoreFolder(input) {
  const stem = path.basename(input).replace(/\.[^.]+$/, '');
  let folder = path.join(path.dirname(input), `${stem}-restored`);
  for (let n = 2; fs.existsSync(folder); n++) folder = path.join(path.dirname(input), `${stem}-restored-${n}`);
  return folder;
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
 * @param {{file: string, text: string}[]} modules the restored modules, as shown to the caller
 * @returns {{edited?: boolean, stylesEdited?: boolean, edits?: import('./render.type.mjs').RenderEdit[], moreEdits?: number}}
 */
function pageChanges(source, html, modules) {
  const recorded = source.markup;
  if (!recorded || typeof recorded.sha256 !== 'string') return {};
  const now = renderedMarkupOf(html);
  const head = renderedHeadOf(html);
  const text = recordedText(recorded);
  const titleNow = head.title === null ? null : decode(head.title);
  const titleEdited = typeof text?.title === 'string' && titleNow !== text.title;
  const stylesEdited = typeof recorded.style === 'string' ? head.style === null || sha256(head.style) !== recorded.style : undefined;
  const markupEdited = now === null || sha256(now) !== recorded.sha256;
  const styles = stylesEdited === undefined ? {} : {stylesEdited};
  if (!markupEdited && !titleEdited && !stylesEdited) return {edited: false, ...styles};
  const {edits, more} = markupEdited ? textEdits(text?.runs ?? [], textRuns(now ?? '')) : {edits: [], more: 0};
  // A title that changed with the heading it comes from is one change, not two.
  const titleEdit = {was: clip(/** @type {string} */ (text?.title)), now: titleNow === null ? null : clip(titleNow)};
  const titleAgain = edits.some(edit => edit.was === titleEdit.was && edit.now === titleEdit.now);
  const all = [...(titleEdited && !titleAgain ? [titleEdit] : []), ...edits];
  return {
    edited: true,
    ...styles,
    edits: all.map(edit => ({...edit, ...((edit.was && locate(edit.was, modules)) || {})})),
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
    const where = rel.startsWith('..') || path.isAbsolute(rel) ? path.basename(file) : rel;
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
    const command = `${cliCommand(cli ?? 'latest')} experimental render --reverse ${shellArg(shown(cwd, input))}`;
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
    // When another run takes that name first, this one takes the next: each
    // name it loses exists from then on, so every pass picks a new one.
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
      const {reached, missing} = reachableFiles(source.files, {aliases: receivingAliases(path.dirname(requested))});
      // A carried image, font or media file needs no import to be part of the
      // page (it may be named in markup, a stylesheet, JSON or a computed
      // path): the render's own list is the authority, so it is kept when its
      // bytes are a known image, font or media format (any, whatever the
      // extension), and goes where the layout puts it.
      for (const f of source.files) {
        if (reached.has(f.path) || !isAssetPath(f.path)) continue;
        if (isAssetBytes(Buffer.from(f.base64, 'base64'))) reached.set(f.path, {relative: true, aliased: new Set()});
      }
      const stray = source.files.filter(f => !reached.has(f.path)).map(f => f.path);
      if (stray.length > 0) {
        throw new AstryxError(
          `${shown(cwd, input)} carries ${stray.length === 1 ? 'a file' : 'files'} the page does not import, or that is not the image, font or media file its name says (${stray.join(', ')}), which a render never embeds; nothing was written. A file reached through a path alias needs the same alias in this project's tsconfig.json or jsconfig.json.`,
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
      /** @type {{file: string, bytes: Buffer}[]} */
      const writes = [];
      const placed = new Set();
      /** @type {string[]} */
      const outside = [];
      /** @type {string[]} */
      const aliasedOutside = [];
      source.files.forEach((f, i) => {
        const reach = /** @type {import('../../foundation/render/embedded-imports.mjs').Reach} */ (reached.get(f.path));
        const relative = i === 0 ? [target] : reach.relative ? [placeFrom(f.path)] : [];
        for (const [file, aliased] of [...relative.map(x => /** @type {[string, boolean]} */ ([x, false])), ...[...reach.aliased].map(x => /** @type {[string, boolean]} */ ([x, true]))]) {
          if (placed.has(file)) continue;
          placed.add(file);
          // Every copy but the page at its target, the page's own copy that an
          // alias places included, lands in the one new folder.
          if (file !== target && !within(file)) (aliased ? aliasedOutside : outside).push(file);
          writes.push({file, bytes: Buffer.from(f.base64, 'base64')});
        }
      });
      if (aliasedOutside.length > 0) {
        throw new AstryxError(
          `${shown(cwd, input)} imports ${aliasedOutside.map(file => shown(cwd, file)).join(', ')} through a path alias that points outside the folder the restore creates; nothing was written. A received page never adds files to your existing folders: change those imports to relative ones before rendering, or restore it in a project whose alias points somewhere new.`,
          [],
          ERROR_CODES.ERR_PATH_TRAVERSAL,
        );
      }
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
      if (!writeRestore(writes, home, cwd, overwrite)) {
        // Another run took the folder's name first: a restore without --out
        // takes the next one.
        if (output) throw folderTaken(/** @type {string} */ (home), cwd);
        continue;
      }
      const renderedBy = renderedByOf(source, html);
      const packages = packagesOf(source);
      const modules = writes
        .filter(w => PAGE_EXTENSIONS.includes(path.extname(w.file).toLowerCase()))
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
        format: source.version,
        ...(renderedBy ? {renderedBy} : {}),
        ...(packages ? {packages} : {}),
        ...(typeof source.title === 'string' ? {title: source.title} : {}),
        ...pageChanges(source, html, modules),
      };
    }
  }
  // A file a render wrote, whose source block was taken out on the way
  // (sanitizers and editors strip <script> elements), says so.
  if (!isAstryxMarkup(html) && /<meta name="generator" content="Astryx[ "]/.test(html)) {
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
  // As above: a name another run takes first exists from then on.
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
    if (!writeRestore([{file: target, bytes: Buffer.from(rebuilt.source)}], home, cwd, overwrite)) {
      if (output) throw folderTaken(/** @type {string} */ (home), cwd);
      continue;
    }
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
