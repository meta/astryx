// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `render` subject's adapter: its only access to the environment.
 * It reads the page or rendered file, runs the renderer, and writes results.
 *
 * @position api/render — adapter for api/render/render.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  PAGE_EXTENSIONS,
  RenderError,
  renderPage,
} from '../../foundation/render/render-page.mjs';
import {readSourceBlock} from '../../foundation/render/source-block.mjs';
import {embeddedPathProblem, runnerPicksUp} from '../../foundation/render/embedded-files.mjs';
import {isAssetBytes, isAssetPath} from '../../foundation/render/assets.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';
import {reachableFiles, receivingAliases} from '../../foundation/render/embedded-imports.mjs';
import {isAstryxMarkup} from '../../foundation/render/html-reader.mjs';
import {rebuildPage} from '../../foundation/render/rebuild.mjs';
import {cliVersion} from '../../foundation/integrations/cli-peer-version.mjs';
import {assertWithin, PathSafetyError} from '../../foundation/fs/path-safety.mjs';

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
 * Refuse, before anything is written, a write that reaches through a
 * symbolic link, and the replacement of an existing file the project
 * protects (generated, vendored, ignored, a dependency or version-control
 * metadata; spec:AST-040 FR2), even with --overwrite.
 * @param {string[]} files absolute
 * @param {string} cwd
 */
function refuseProtected(files, cwd) {
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
  const existing = files.filter(file => fs.existsSync(file));
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
 * Write several files all or nothing: each goes to a temporary file beside
 * its target first, and only when every one is written are they moved into
 * place. On a failure, the temporary files and the folders this made are
 * removed, so nothing is left behind.
 * @param {{file: string, bytes: Buffer}[]} writes absolute targets
 * @param {string} cwd
 */
function writeAll(writes, cwd) {
  /** @type {string[]} */
  const madeDirs = [];
  /** @type {{temp: string, file: string}[]} */
  const staged = [];
  const undo = () => {
    for (const {temp} of staged) fs.rmSync(temp, {force: true});
    for (const dir of madeDirs.reverse()) {
      try {
        fs.rmdirSync(dir);
      } catch {
        // Not empty or already gone: leave it.
      }
    }
  };
  let current = '';
  try {
    for (const w of writes) {
      current = w.file;
      /** @type {string[]} */
      const missing = [];
      for (let d = path.dirname(w.file); !fs.existsSync(d); d = path.dirname(d)) missing.unshift(d);
      for (const d of missing) {
        fs.mkdirSync(d);
        madeDirs.push(d);
      }
      const temp = `${w.file}.astryx-${process.pid}.tmp`;
      fs.writeFileSync(temp, w.bytes, {flag: 'wx'});
      staged.push({temp, file: w.file});
    }
    for (const {temp, file} of staged) {
      current = file;
      fs.renameSync(temp, file);
    }
  } catch (e) {
    undo();
    throw new AstryxError(
      `Could not write ${shown(cwd, current)}: ${/** @type {Error} */ (e).message}; nothing was written.`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
}

/**
 * Write one file, creating its folder.
 * @param {string} file absolute
 * @param {string | Buffer} content
 * @param {string} cwd
 */
function writeOutput(file, content, cwd) {
  try {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
  } catch (e) {
    throw new AstryxError(
      `Could not write ${shown(cwd, file)}: ${/** @type {Error} */ (e).message}`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
}

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
    page = await renderPage(input, {title, version: cliVersion()});
  } catch (e) {
    throw asAstryxError(e);
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
  writeOutput(output, page.html, cwd);
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
    // Without --out, the page and the files it imports come back into a new
    // folder beside the HTML file, named after it (`report.html` gives
    // `report-restored/`), with the layout they were rendered in. Nothing in
    // the received file decides where in your project anything goes.
    const requested = output ?? path.join(restoreFolder(input), ...source.files[0].path.split('/'));
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
    /** @type {string | null} */
    let home = null;
    for (let d = anchor; !fs.existsSync(d) && path.dirname(d) !== d; d = path.dirname(d)) home = d;
    const within = (/** @type {string} */ file) => {
      if (!home) return false;
      const rel = path.relative(home, file);
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    };
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
        if (i > 0 && !within(file)) (aliased ? aliasedOutside : outside).push(file);
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
      const suggestion = `--out ${fresh}/${top}${path.basename(requested)}`;
      throw new AstryxError(
        `${shown(cwd, input)} would add ${outside.map(file => shown(cwd, file)).join(', ')} outside the folder the restore creates; nothing was written. A received page writes the files it imports only inside one new folder: restore it into one, such as ${suggestion}.`,
        [{name: suggestion, reason: 'restore the page and the files it imports into a new folder, keeping their layout'}],
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    writes.forEach((w, i) => confined(w.file, cwd, i === 0 ? 'The page' : 'The embedded file'));
    refuseRunnable(writes.map(w => w.file), cwd, input);
    refuseExisting(writes.map(w => w.file));
    refuseProtected(writes.map(w => w.file), cwd);
    writeAll(writes, cwd);
    return {
      input: shown(cwd, input),
      mode: 'embedded',
      output: shown(cwd, target),
      files: writes.map(w => shown(cwd, w.file)),
      // The page is byte for byte the one rendered; an import it makes that
      // the file does not carry (a file a render never embeds) is named.
      exact: missing.length === 0,
      ...(missing.length > 0 ? {missing} : {}),
    };
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
  const target = output ?? path.join(restoreFolder(input), 'page.tsx');
  refuseConfigTarget(target);
  confined(target, cwd, 'The page');
  refuseRunnable([target], cwd, input);
  refuseExisting([target]);
  // Components resolve from where the page will live, then from the HTML
  // file's folder, then from the current folder.
  const from =
    [path.dirname(target), path.dirname(input), cwd].find(d => resolvesCore(d)) ?? cwd;
  const rebuilt = rebuildPage(html, from);
  refuseProtected([target], cwd);
  writeOutput(target, rebuilt.source, cwd);
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
