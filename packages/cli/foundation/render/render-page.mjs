// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental export`, forward: one page module to ONE
 * self-contained static HTML file. The page renders on the server with the
 * project's own React and Astryx components; its own StyleX compiles in
 * memory; Core's stylesheets are cut to the rules the markup uses; local
 * images become data: URIs, and so do the https images the page names,
 * fetched once while it renders (remote-images.mjs); and the page's source
 * rides along so `--reverse` can give it back exactly.
 *
 * The file needs no network, and it carries the page's script, which draws
 * the live page over the markup, so it works inside a sandboxed frame that
 * allows scripts under a strict content security policy. Its colors follow
 * `color-scheme` (and a `data-theme` of `light` or `dark` on the root), since
 * Astryx tokens use light-dark().
 *
 * @position foundation/render — called by the render subject's adapter
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fork, spawnSync} from 'node:child_process';
import {builtinModules} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {NOT_AN_IMAGE, showsImage} from './image-attributes.mjs';
import {formatSrcset, parseSrcset} from './srcset.mjs';
import postcss from 'postcss';
import {importUrl} from '../fs/import-url.mjs';
import {
  assetDataUri,
  isAssetBytes,
  isAssetPath,
  MAX_ASSET_BYTES,
  RenderAssetError,
} from './assets.mjs';
import {classesIn, cutCss, cutFontFaces, layerOrderOf} from './css-cut.mjs';
import {asParsed, formatFor, sha256, sourceBlock} from './source-block.mjs';
import {LINK_OUT, ROOT_ID, imageSinks} from './client-bundle.mjs';
import {remoteImages} from './remote-images.mjs';
import {ESBUILD_MISSING, findEsbuild} from './esbuild-dependency.mjs';
import {carriedNameFor, embeddedPathProblem} from './embedded-files.mjs';
import {scanHtml} from './html-reader.mjs';
import {removeOnStop} from '../fs/stop-cleanup.mjs';
import {aliasOnly, assetRefsOf, fileNamed} from './embedded-imports.mjs';
import {isServedPackage, resolveServed} from './served-packages.mjs';
import {CHART_CSS, smallSvgText} from './charts.mjs';
import {HOST_EXIT} from './host-exit.mjs';
import {endNote, headerNote} from './file-header.mjs';
import {textRuns} from './markup-edits.mjs';
import {childrenReader, dropperOf} from './dropped-text.mjs';
import {findNodeModulesPackage, isInside} from '../fs/paths.mjs';
import {packageOf} from '../doc-compiler/source.mjs';

/** How long one page may take to render before it is stopped. */
export const RENDER_TIMEOUT_MS = 60_000;

export {MODULE_EXTENSIONS, PAGE_EXTENSIONS} from './embedded-files.mjs';

/**
 * @typedef {object} RenderWarning
 * @property {'dropped-children' | 'unknown-prop-value' | 'remote-asset' | 'missing-asset' | 'page-output' | 'page-script' | 'no-astryx-styles' | 'chart-size' | 'screen-query' | 'not-embedded' | 'not-carried' | 'node-crash'} code - What kind of problem.
 * @property {string} message - What happened and what to do, in one sentence.
 */

/**
 * @typedef {object} RenderedPage
 * @property {string} html - The whole file.
 * @property {string[]} files - Local files the page loaded, relative to the folder that holds them all (the page's folder unless it imports from above it); the page first. Each is embedded.
 * @property {string[]} stylesheets - The packages' stylesheets that were cut and inlined.
 * @property {number} classes - Distinct class names in the markup.
 * @property {number} cssBytes - Bytes of inlined CSS.
 * @property {number} markupBytes - Bytes of rendered markup.
 * @property {number} sourceBytes - Bytes of the embedded source block.
 * @property {number} images - Local files inlined as data: URIs.
 * @property {RenderWarning[]} warnings
 * @property {string[]} [notCarried] - Files the page uses that the file does not carry, so experimental import cannot give them back (each also has a warning); present only when there are some.
 * @property {{component: string, prop: string, value: string, file: string, line: number}[]} [propValues] - Each string the page's own files give a Core component's prop, for the caller to check against the component's docs.
 * @property {{name: string, dir: string}[]} fromSet - Packages that came from the package set the CLI runs from, not the page's folder.
 * @property {number} [scriptBytes] - Bytes of the page's script; none in a markup-only render.
 * @property {number} [scriptModules] - The modules the page's script holds; none in a markup-only render.
 * @property {{fetched: string[], failed: {url: string, reason: string}[]}} [remoteImages] - The https images the page names: each address fetched into the file, and each one left as the page wrote it, with why. Present when the page names a remote image and the render writes a file.
 */

/** An error carrying a render error code. */
export class RenderError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [detail]
   */
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

/**
 * The nearest folder at or above `dir` with a package.json, or null outside
 * a project.
 * @param {string} dir
 * @returns {string | null}
 */
function projectOf(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/**
 * Whether a path names a file. A name the system cannot look up (a segment
 * too long, a folder it may not read) names none.
 * @param {string} file
 */
function isFileAt(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * The first bytes of a file, enough to tell its format.
 * @param {string} file
 */
function headOf(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(4096);
    return head.subarray(0, fs.readSync(fd, head, 0, head.length, 0));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The folder whose modules the page carries: its project's. Outside a
 * project, the current folder when it holds the page, so a page with
 * neighbours above its own folder (as a restore lays them out) carries them;
 * else the page's folder.
 * @param {string} dir
 * @param {string} [cwd]
 */
function carryScopeOf(dir, cwd) {
  const project = projectOf(dir);
  if (project) return project;
  return cwd && (dir === cwd || isInside(dir, cwd)) ? cwd : dir;
}

/**
 * The folder whose `public/` holds the files a `/` path names: the page's
 * project, when it holds `public/`. Else the nearest folder at or above the
 * page's that holds `public/`, inside the folder whose files the page
 * carries (a site that shares its project with others). Else the project's
 * folder, else the page's.
 * @param {string} dir the page's folder
 * @param {string} scope the folder whose files the page carries
 */
function siteRootOf(dir, scope) {
  /** @param {string} d */
  const holdsPublic = d =>
    fs.statSync(path.join(d, 'public'), {throwIfNoEntry: false})?.isDirectory() === true;
  const project = projectOf(dir);
  if (project && holdsPublic(project)) return project;
  for (let d = dir; d === scope || isInside(d, scope); d = path.dirname(d)) {
    if (holdsPublic(d)) return d;
    // The walk ends at the scope; at the filesystem root, dirname is the root.
    if (d === scope || path.dirname(d) === d) break;
  }
  return project ?? dir;
}

/** @param {string} s */
const escapeHtml = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The attributes a page's root Theme puts on `<html>` in a browser, for the
 * static page: Core's root provider sets `data-astryx-theme` (and
 * `data-theme` for a one-mode page) on the document element once it runs,
 * so root-scoped tokens (the focus ring's color) resolve against the theme.
 * A page runs no script, so they are written here: from the outermost
 * element the theme marks, the root Theme's own.
 * @param {string} markup
 */
function rootThemeAttrs(markup) {
  for (const t of scanHtml(markup)) {
    if (t.kind !== 'start') continue;
    const attrs = new Map(t.attrs.map(([name, value]) => /** @type {[string, string]} */ ([name, value])));
    if (!attrs.has('data-astryx-theme')) continue;
    return ['data-astryx-theme', 'data-theme']
      .filter(a => attrs.has(a))
      .map(
        a =>
          ` ${a}="${escapeHtml(String(attrs.get(a))).replace(/"/g, '&quot;')}"`,
      )
      .join('');
  }
  return '';
}

/** @param {string} s */
const decodeAttr = s =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * An `@import` rule's parts: what it loads, and the layer, supports() and
 * media conditions that scope it.
 * @param {string} params
 * @returns {{url: string, layer: string | null, supports: string | null, media: string} | null}
 */
export function importParams(params) {
  const m =
    /^\s*(?:url\(\s*(['"]?)([\s\S]*?)\1\s*\)|(['"])([\s\S]*?)\3)\s*([\s\S]*)$/.exec(
      params,
    );
  if (!m) return null;
  let rest = m[5];
  /** @type {string | null} */
  let layer = null;
  const lay = /^layer(?:\(\s*([^)]*?)\s*\))?(?=\s|$)\s*/i.exec(rest);
  if (lay) {
    layer = lay[1] ?? '';
    rest = rest.slice(lay[0].length);
  }
  /** @type {string | null} */
  let supports = null;
  const sup = /^supports\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)\s*/i.exec(
    rest,
  );
  if (sup) {
    supports = sup[1];
    rest = rest.slice(sup[0].length);
  }
  return {url: m[2] ?? m[4] ?? '', layer, supports, media: rest.trim()};
}

/**
 * Where a stylesheet's `@import` of `url` leads, read the way a render inlines
 * it: a relative one from the importing sheet's folder, a package one
 * (`@scope/pkg/x.css`) by Node resolution from the importing sheet.
 * @param {string} url the import's address, as written
 * @param {string} file the importing stylesheet's path
 * @param {ServedSet | null} served
 * @returns {{kind: 'remote'} | {kind: 'preprocessed'} | {kind: 'missing'} | {kind: 'sheet', target: string, fromPackage: boolean}}
 */
function resolveImport(url, file, served) {
  if (/^([a-z]+:)?\/\//i.test(url)) return {kind: 'remote'};
  if (/\.(scss|sass|less)$/i.test(url)) return {kind: 'preprocessed'};
  const relative = path.resolve(path.dirname(file), url);
  if (/^\.{1,2}\//.test(url) || fs.existsSync(relative)) {
    return fs.existsSync(relative)
      ? {kind: 'sheet', target: relative, fromPackage: false}
      : {kind: 'missing'};
  }
  const target = resolveServed(url.replace(/^~/, ''), file, served);
  return target ? {kind: 'sheet', target, fromPackage: true} : {kind: 'missing'};
}

/**
 * Whether one of the stylesheets a page brings in is an Astryx package's, or
 * reaches one through its `@import`s, followed as {@link expandImports}
 * follows them. A stylesheet counts by the package that holds its file, as a
 * module counts in the page's script; an import that resolves to no file
 * counts by the package it names.
 * @param {string[]} files the page's own stylesheets and the package
 *   stylesheets its script imports
 * @param {ServedSet | null} served
 * @returns {boolean}
 */
function reachesAstryxSheet(files, served) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} file @returns {boolean} */
  const visit = file => {
    if (seen.has(file)) return false;
    seen.add(file);
    if (packageOf(file).startsWith('@astryxdesign/')) return true;
    /** @type {import('postcss').Root} */
    let root;
    try {
      const css = fs.readFileSync(file, 'utf8');
      if (!/@import/i.test(css)) return false;
      root = postcss.parse(css, {from: file});
    } catch {
      return false;
    }
    let found = false;
    root.walkAtRules(/^import$/i, rule => {
      const url = importParams(rule.params)?.url;
      if (found || !url) return;
      const to = resolveImport(url, file, served);
      if (to.kind === 'sheet') found = visit(to.target);
      else if (to.kind === 'missing') found = /^@astryxdesign\//.test(url.replace(/^~/, ''));
    });
    return found;
  };
  return files.some(visit);
}

/**
 * Inline a stylesheet's own `@import`s, so a stylesheet pulled in that way is
 * part of the file: a relative one from the importing sheet's folder
 * (carried when it is the project's own), a package one (`@scope/pkg/x.css`)
 * by Node resolution from the importing sheet. Each keeps its `layer()`,
 * `supports()` and media conditions, and relative url()s in it are rewritten
 * to stay right. A remote import is dropped with a warning (a sandboxed page
 * cannot load it), a Sass or Less one is named in a warning, and cycles are
 * cut.
 * @param {string} file the stylesheet's own path
 * @param {string} css its text
 * @param {{warnings: RenderWarning[], carried: Set<string>, importers: Map<string, Set<string>>, included: Set<string>, packageSheets: string[], served: ServedSet | null, seen?: Set<string>}} ctx
 *   `importers`: each project stylesheet an `@import` names, with every
 *   sheet that imports it
 *   `included`: stylesheet files already in the page (Core's, say), never
 *   inlined twice; `packageSheets`: package stylesheets this pulled in
 * @returns {string}
 */
function expandImports(file, css, ctx) {
  if (!/@import/i.test(css)) return css;
  const seen = ctx.seen ?? new Set([file]);
  /** @type {import('postcss').Root} */
  let root;
  try {
    root = postcss.parse(css, {from: file});
  } catch {
    return css;
  }
  root.walkAtRules(/^import$/i, rule => {
    const parsed = importParams(rule.params);
    if (!parsed || !parsed.url) return;
    const {url} = parsed;
    const to = resolveImport(url, file, ctx.served);
    if (to.kind === 'remote') {
      ctx.warnings.push({
        code: 'remote-asset',
        message: `${path.basename(file)} imports ${url}, which a sandboxed page cannot load, so it is left out; save it beside the stylesheet and import it instead.`,
      });
      rule.remove();
      return;
    }
    if (to.kind === 'preprocessed') {
      ctx.warnings.push({
        code: 'missing-asset',
        message: `${path.basename(file)} imports ${url}, a Sass or Less stylesheet, which a render does not compile, so its styles are missing.`,
      });
      rule.remove();
      return;
    }
    if (to.kind === 'missing') {
      ctx.warnings.push({
        code: 'missing-asset',
        message: `${path.basename(file)} imports ${url}, which was not found, so its styles are missing.`,
      });
      rule.remove();
      return;
    }
    const {target, fromPackage} = to;
    if (!fromPackage) ctx.importers.set(target, (ctx.importers.get(target) ?? new Set()).add(file));
    if (seen.has(target) || ctx.included.has(target)) {
      rule.remove();
      return;
    }
    seen.add(target);
    ctx.included.add(target);
    if (fromPackage) ctx.packageSheets.push(url.replace(/^~/, ''));
    else ctx.carried.add(target);
    const from = target;
    let inner = expandImports(from, fs.readFileSync(from, 'utf8'), {
      ...ctx,
      seen,
    });
    // Keep the imported sheet's relative url()s pointing at the same files.
    inner = inner.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (u, q, r) => {
      if (/^(data:|blob:|#|\/|[a-z]+:)/i.test(r)) return u;
      const rebased = path
        .relative(path.dirname(file), path.resolve(path.dirname(from), r))
        .split(path.sep)
        .join('/');
      return `url(${q}${rebased.startsWith('.') ? rebased : `./${rebased}`}${q})`;
    });
    // The import's conditions still scope what it brings in.
    if (parsed.supports)
      inner = `@supports (${parsed.supports.replace(/^\((.*)\)$/s, '$1')}){${inner}}`;
    if (parsed.media) inner = `@media ${parsed.media}{${inner}}`;
    if (parsed.layer !== null)
      inner = `@layer${parsed.layer ? ` ${parsed.layer}` : ''}{${inner}}`;
    try {
      rule.replaceWith(postcss.parse(inner, {from}).nodes);
    } catch (e) {
      const reason =
        /** @type {any} */ (e)?.reason ??
        (e instanceof Error ? e.message : String(e));
      throw new RenderError(
        'ERR_RENDER_COMPILE',
        `${path.basename(from)}, imported by ${path.basename(file)}, is not valid CSS: ${reason}`,
      );
    }
  });
  return root.toString();
}

/** @typedef {{dir: string, integrations: readonly string[]}} ServedSet */

/** Signals that Node itself or a native module raises when it fails. */
const CRASH_SIGNALS = new Set([
  'SIGSEGV',
  'SIGBUS',
  'SIGILL',
  'SIGFPE',
  'SIGABRT',
  'SIGTRAP',
]);

/**
 * How a native crash ended a process, or null when it was not one. On
 * Windows a crash arrives as an exit status of 0xC0000000 and above (such as
 * 0xC0000005, an access violation), not as a signal.
 * @param {number | null} code
 * @param {NodeJS.Signals | null} signal
 */
function crashOf(code, signal) {
  if (signal) return CRASH_SIGNALS.has(signal) ? signal : null;
  if (code !== null && code >>> 0 >= 0xc0000000)
    return `0x${(code >>> 0).toString(16).toUpperCase()}`;
  return null;
}

/**
 * Whether this Node crashes when it splits text with Intl.Segmenter. Some
 * Node builds do, and Astryx components such as Avatar split text with it.
 */
function segmenterCrashes() {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      "[...new Intl.Segmenter('en', {granularity: 'grapheme'}).segment('a b')]",
    ],
    {stdio: 'ignore', timeout: 10_000},
  );
  return crashOf(probe.status, probe.signal) !== null;
}

/**
 * The error for a page process that a crash or a signal ended. A crash comes
 * from Node itself or a native module, never from the page's JavaScript.
 * Every message names this Node.
 * @param {string} how the crash (a signal name or a Windows status) or the stopping signal
 * @param {{crashed: boolean, withoutSegmenter: boolean}} state
 */
function crashError(how, {crashed, withoutSegmenter}) {
  const node = `Node ${process.version} (${process.execPath})`;
  const detail = {
    signal: how,
    node: process.version,
    nodePath: process.execPath,
  };
  if (!crashed) {
    const memory =
      how === 'SIGKILL'
        ? ' The system stops a process this way when the machine runs out of memory.'
        : '';
    return new RenderError(
      'ERR_RENDER_FAILED',
      `${node} was stopped by a signal (${how}) while it rendered the page.${memory}`,
      detail,
    );
  }
  const cause = withoutSegmenter
    ? ' It crashed again with Intl.Segmenter removed, so the fault is elsewhere in this Node or in a native module.'
    : '';
  return new RenderError(
    'ERR_RENDER_FAILED',
    `${node} crashed (${how}) while it rendered the page. A fault in Node or in a native module causes this, not the page's code.${cause} Render with an official Node.js build of another version.`,
    detail,
  );
}

/**
 * The error for a page that ended without an answer, with why: the stage it
 * reported last, how long it ran, the memory left, and its last stderr line.
 * @param {any} message the host's {hostExit, reason, stage, elapsedMs, rssMb, freeMb, stderrTail}
 */
function noAnswerError({
  hostExit,
  reason,
  stage,
  elapsedMs,
  rssMb,
  freeMb,
  stderrTail,
}) {
  const detail = {
    reason,
    exit: hostExit,
    stage,
    elapsedMs,
    rssMb,
    freeMb,
    ...(stderrTail ? {stderrTail} : {}),
  };
  const where = stage ? ` while ${stage}` : '';
  const seconds = Math.round((elapsedMs ?? 0) / 1000);
  if (reason === 'host-timeout') {
    return new RenderError(
      'ERR_RENDER_TIMEOUT',
      `The page's process stopped at its own time limit${where}, after ${seconds} seconds, before this process read an answer.`,
      detail,
    );
  }
  const last = stderrTail
    ? ` Its last output: ${String(stderrTail).split('\n').at(-1)}`
    : '';
  return new RenderError(
    'ERR_RENDER_FAILED',
    `The page stopped rendering without an answer (exit ${hostExit})${where}, after ${seconds} seconds, with ${freeMb} MB of memory free.${last}`,
    detail,
  );
}

/** The error for a host process that ended, without a signal, before it answered. */
function hostEndError(/** @type {number | null} */ code) {
  if (code === HOST_EXIT.disconnected) {
    return new RenderError(
      'ERR_RENDER_FAILED',
      "The page's process lost its channel to this process and stopped without an answer.",
      {reason: 'disconnected', exit: code},
    );
  }
  if (code === HOST_EXIT.noChannel) {
    return new RenderError(
      'ERR_RENDER_FAILED',
      "The page's process had no channel left to send its answer on.",
      {reason: 'no-channel', exit: code},
    );
  }
  if (code === HOST_EXIT.timeout) {
    return new RenderError(
      'ERR_RENDER_TIMEOUT',
      "The page's process stopped at its own time limit before this process read an answer.",
      {reason: 'host-timeout', exit: code},
    );
  }
  if (code === HOST_EXIT.sendFailed) {
    return new RenderError(
      'ERR_RENDER_FAILED',
      "The page's process could not send its answer to this process.",
      {reason: 'send-failed', exit: code},
    );
  }
  return new RenderError(
    'ERR_RENDER_FAILED',
    `The page's process ended without an answer (exit ${code}).`,
    {reason: 'host-ended', exit: code},
  );
}

/**
 * The error for a host that ended with no answer reaching this process, from
 * the state it left in its per-run file: an answer it sent that never
 * arrived, or the stage it ended in.
 * @param {number | null} code
 * @param {string | undefined} stateFile
 */
function noMessageError(code, stateFile) {
  if (code !== 0 && code !== null && Object.values(HOST_EXIT).includes(code))
    return hostEndError(code);
  /** @type {any} */
  let saved = null;
  try {
    saved = stateFile ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
  } catch {
    // No readable state: fall back to the bare message below.
  }
  if (!saved) return hostEndError(code);
  const detail = {
    exit: code,
    stage: saved.stage,
    elapsedMs: saved.elapsedMs,
    rssMb: saved.rssMb,
    freeMb: saved.freeMb,
    ...(saved.stderrTail ? {stderrTail: saved.stderrTail} : {}),
  };
  if (saved.answered === 'sent') {
    return new RenderError(
      'ERR_RENDER_FAILED',
      `The page's process sent its answer, but this process did not receive it (exit ${code}).`,
      {reason: 'answer-lost', ...detail},
    );
  }
  if (saved.answered === 'sending') {
    return new RenderError(
      'ERR_RENDER_FAILED',
      `The page's process ended while it sent its answer (exit ${code}).`,
      {reason: 'ended-while-sending', ...detail},
    );
  }
  const seconds = Math.round((saved.elapsedMs ?? 0) / 1000);
  const last = saved.stderrTail
    ? ` Its last output: ${String(saved.stderrTail).split('\n').at(-1)}`
    : '';
  return new RenderError(
    'ERR_RENDER_FAILED',
    `The page's process ended without an answer (exit ${code}) while ${saved.stage}, after ${seconds} seconds, with ${saved.freeMb} MB of memory free.${last}`,
    {reason: 'host-ended', ...detail},
  );
}

/**
 * Run the page in a host process (page-host.mjs), stopping it after
 * `timeoutMs`. The host runs the page in a worker thread, and it exits when
 * this process goes away.
 * @param {{entry: string, root: string, scope: string, served: ServedSet | null, withoutSegmenter: boolean}} input
 * @param {number} timeoutMs
 * @returns {Promise<any>} the page's answer, or `{crashed: how}` when a
 *   native crash ended the host
 */
function runWorker(input, timeoutMs) {
  return withHostStateFile(stateFile => {
    const data = {
      ...input,
      served: input.served
        ? {dir: input.served.dir, integrations: [...input.served.integrations]}
        : null,
      timeoutMs,
      stateFile,
    };
    const host = fork(
      fileURLToPath(new URL('./page-host.mjs', import.meta.url)),
      [JSON.stringify(data)],
      {
        // Never the CLI's own flags (such as --input-type).
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        serialization: 'advanced',
      },
    );
    return awaitHost(host, {
      timeoutMs,
      withoutSegmenter: input.withoutSegmenter,
      stateFile,
    });
  });
}

/**
 * Run `use` with a state file for one host in a new folder under the system's
 * temporary folder, never in the project, and remove the folder after. The
 * state file only explains a failure: without a temporary folder, `use` gets
 * none and the render runs without it.
 * @template T
 * @param {(stateFile: string | undefined) => Promise<T>} use
 * @param {{makeTempDir?: (prefix: string) => string}} [options]
 * @returns {Promise<T>}
 */
export async function withHostStateFile(
  use,
  {makeTempDir = prefix => fs.mkdtempSync(prefix)} = {},
) {
  /** @type {string} */
  let dir;
  try {
    dir = makeTempDir(path.join(os.tmpdir(), 'astryx-render-'));
  } catch {
    // No temporary folder (missing or read-only): render without the state file.
    return use(undefined);
  }
  // A stop while the page renders removes the folder too.
  const untrack = removeOnStop(dir);
  try {
    return await use(path.join(dir, 'host-state.json'));
  } finally {
    untrack();
    try {
      fs.rmSync(dir, {recursive: true, force: true, maxRetries: 3});
    } catch {
      // Best effort: a removal that fails (a file still held open) never
      // replaces the render's own result.
    }
  }
}

/**
 * The page's answer from its host process, or the reason it has none.
 * @param {import('node:child_process').ChildProcess} host
 * @param {{timeoutMs: number, withoutSegmenter: boolean, stateFile?: string}} options
 * @returns {Promise<any>}
 */
export function awaitHost(host, {timeoutMs, withoutSegmenter, stateFile}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    /** @param {() => void} settle */
    const finish = settle => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      host.kill('SIGKILL');
      settle();
    };
    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new RenderError(
            'ERR_RENDER_TIMEOUT',
            `The page did not finish rendering within ${timeoutMs / 1000} seconds, so it was stopped. Look for a loop that never ends or a promise the page waits on.`,
            {seconds: timeoutMs / 1000},
          ),
        ),
      );
    }, timeoutMs);
    host.once('message', (/** @type {any} */ message) => {
      finish(() => {
        if (message?.hostError !== undefined) {
          const text = String(message.hostError);
          reject(
            /ERR_WORKER_OUT_OF_MEMORY|heap out of memory/.test(text)
              ? new RenderError(
                  'ERR_RENDER_FAILED',
                  'The page ran out of memory while rendering.',
                )
              : new RenderError(
                  'ERR_RENDER_FAILED',
                  `The page could not be rendered: ${text.split('\n')[0]}`,
                ),
          );
        } else if (message?.hostExit !== undefined) {
          reject(noAnswerError(message));
        } else {
          resolve(message);
        }
      });
    });
    host.once('error', error => {
      finish(() =>
        reject(
          new RenderError(
            'ERR_RENDER_FAILED',
            `The page could not be rendered: ${String(error?.message ?? error).split('\n')[0]}`,
          ),
        ),
      );
    });
    // 'close' comes after the IPC channel drains, so an answer the host sent
    // just before it exited still wins; 'exit' can come first under load.
    host.once('close', (code, signal) => {
      finish(() => {
        const crash = crashOf(code, signal);
        if (crash) resolve({crashed: crash});
        else if (signal)
          reject(crashError(signal, {crashed: false, withoutSegmenter}));
        else reject(noMessageError(code, stateFile));
      });
    });
  });
}

/**
 * Run the page. When this Node crashes in Intl.Segmenter, run it once more
 * without Intl.Segmenter and say so in a warning.
 * @param {{entry: string, root: string, scope: string, served: ServedSet | null, openLayers?: boolean, buildScript?: boolean, esbuild?: string}} input
 * @param {number} timeoutMs
 * @param {RenderWarning[]} warnings
 */
async function runPage(input, timeoutMs, warnings) {
  const started = Date.now();
  const first = await runWorker({...input, withoutSegmenter: false}, timeoutMs);
  if (!first.crashed) return first;
  if (!segmenterCrashes())
    throw crashError(first.crashed, {crashed: true, withoutSegmenter: false});
  const again = await runWorker(
    {...input, withoutSegmenter: true},
    Math.max(1000, timeoutMs - (Date.now() - started)),
  );
  if (again.crashed)
    throw crashError(again.crashed, {crashed: true, withoutSegmenter: true});
  warnings.push(segmenterWarning());
  return again;
}

/**
 * The markup with each link out of the file opening in a new tab, as the
 * file's script opens it once it runs (client-bundle.mjs): a viewer's frame
 * cannot follow a link out. A link that names its own target keeps it.
 * @param {string} markup the page's server markup
 * @returns {string}
 */
export function linksOpenNewTabs(markup) {
  return markup.replace(/<a\b([^>]*)>/g, (tag, /** @type {string} */ attrs) => {
    const href = /\shref="([^"]*)"/.exec(attrs)?.[1];
    if (href === undefined || /\starget="/.test(attrs) || !LINK_OUT.test(href.trim())) return tag;
    const rel = /\srel="([^"]*)"/.exec(attrs);
    const rels = new Set([...(rel ? rel[1].split(/\s+/).filter(Boolean) : []), 'noopener', 'noreferrer']);
    return `<a${rel ? attrs.replace(rel[0], '') : attrs} target="_blank" rel="${[...rels].join(' ')}">`;
  });
}

/**
 * The markup without `autofocus`. The file's script owns focus once it draws
 * the page, as the app does. A viewer's cross-origin frame blocks focus that
 * markup asks for, and logs an error.
 * @param {string} markup the page's server markup
 * @returns {string}
 */
export function withoutAutofocus(markup) {
  let out = '';
  let at = 0;
  for (const token of scanHtml(markup)) {
    if (token.kind !== 'start') continue;
    for (const [name, , start, end] of token.attrs) {
      if (name !== 'autofocus') continue;
      // The attribute goes with the spaces before it; the reader names
      // where its text starts and ends, so every other attribute stays as
      // written.
      // Not when a `/` follows: `<input title=x/>` would read as title="x/".
      let from = start;
      if (markup[end] !== '/') {
        while (from > token.start && /[\t\n\f\r ]/.test(markup[from - 1])) from--;
      }
      out += markup.slice(at, from);
      at = end;
    }
  }
  return at === 0 ? markup : out + markup.slice(at);
}

/**
 * The page's script with each string the markup's rewrite replaced (an
 * image's `src`, `poster` or `srcset`, as the page wrote it) written as the
 * same carried data, so the page the script draws shows what the first paint
 * showed. Only a quoted string that is exactly that value changes, never a
 * longer string that holds it.
 * @param {string} script
 * @param {Map<string, string>} rewrites
 * @returns {string}
 */
export function withCarriedPaths(script, rewrites) {
  let out = script;
  for (const [was, now] of rewrites) {
    if (/["'`\\\n<]/.test(now) || /["'`\\\n]/.test(was)) continue;
    for (const quote of ['"', "'", '`']) {
      const literal = `${quote}${was}${quote}`;
      // Text the page shows (`children: "./photo.png"`) stays as written.
      out = out
        .split(literal)
        .map((part, i, parts) =>
          i === parts.length - 1 ? part : /\bchildren:\s*$/.test(part) ? `${part}${literal}` : `${part}${quote}${now}${quote}`,
        )
        .join('');
    }
    // A CSS url() in a style the script sets (`backgroundImage:
    // "url(./bg.png)"`) names the same file. A data: URI with no space,
    // quote or parenthesis needs no quotes in url().
    if (/[\s()]/.test(now)) continue;
    for (const form of [`url(${was})`, `url("${was}")`, `url('${was}')`]) {
      out = out.split(form).join(`url(${now})`);
    }
  }
  return out;
}

/**
 * A call of the script's `carried(sha256, prefix)`, which reads an image from
 * the embedded source. It starts only where a name starts, so a long run of
 * name characters (a large string in the page) is read once, not once per
 * character.
 */
const CARRIED_CALL = /(?<![\w$])[A-Za-z_$][\w$]*\((["'])([0-9a-f]{64})\1,\s*(["'])(data:[^"']*;base64)\3\)/g;

/**
 * The script with each image the embedded source does not carry written in
 * as its data: URI (`uriOf` gives it), so the image still shows once the
 * script draws the page.
 * @param {string} script
 * @param {Set<string>} carried the SHA-256 of each file the source carries
 * @param {(sha256: string, prefix: string) => string | null} uriOf
 */
export function withUncarriedImages(script, carried, uriOf) {
  return script.replace(CARRIED_CALL, (call, _q, sha, _p, prefix) => {
    if (carried.has(sha)) return call;
    const uri = uriOf(sha, prefix);
    return uri === null ? call : JSON.stringify(uri);
  });
}

/**
 * The warning for a page rendered without Intl.Segmenter.
 * @returns {RenderWarning}
 */
export function segmenterWarning() {
  return {
    code: 'node-crash',
    message: `This Node build (${process.version} at ${process.execPath}) crashes in Intl.Segmenter, so the page rendered without it, and the output may differ slightly: initials and character counts (such as Avatar initials) can split a joined emoji, a flag, or a letter written with a separate accent mark. Render with an official Node.js build to remove the difference.`,
  };
}

/**
 * A CSS `url()` as CSS reads it: a quoted reference may hold parentheses
 * and the other quote (`url("./a(1).png")`); an unquoted one holds neither.
 * Read its reference with {@link cssUrlRef}.
 */
export const CSS_URL =
  /url\(\s*(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)'|(?<bare>[^'"()\s]+))\s*\)/;

/**
 * The reference a {@link CSS_URL} match names.
 * @param {RegExpMatchArray} m
 * @returns {string}
 */
export function cssUrlRef(m) {
  return m.groups?.dq ?? m.groups?.sq ?? m.groups?.bare ?? '';
}

/** The rel values of a `<link>` the browser fetches its href for. */
const FETCHING_RELS = new Set([
  'stylesheet',
  'icon',
  'apple-touch-icon',
  'mask-icon',
  'manifest',
  'preload',
  'modulepreload',
  'prefetch',
]);

/**
 * A reference that loads nothing when the file opens: inline data, a
 * fragment, or a scheme that names no file (about:, mailto:, tel:,
 * javascript:).
 */
const NOT_A_LOAD = /^(data:|blob:|#|about:|mailto:|tel:|javascript:)/i;

/**
 * Whether a reference, as written, makes the browser load something.
 * @param {string} ref
 */
export const isLoad = ref => ref.trim() !== '' && !NOT_A_LOAD.test(ref.trim());

/**
 * What a local file reference of a page or stylesheet names: nothing to
 * inline (inline data, a fragment, a non-asset path), a remote file, a file
 * that is not there, one that is not a regular file (a pipe, a device or a
 * folder: never read), or the file to inline. One reader for the renderer
 * and for callers that say what a page will not show.
 * @param {string} ref as written in src, poster or url()
 * @param {{dir: string, root: string}} at the folder it is relative to,
 *   and the site's root, whose `public/` holds the files `/` paths name
 * A reference is URL text: it names the file its percent-escapes decode to
 * (`a%20b.png` is "a b.png"), as a browser and the app's bundler read it.
 * A file that cannot be read (no permission) is `unreadable`.
 * A remote file's `url` is the whole address the page wrote, its query too.
 * @returns {null | {kind: 'remote', ref: string, url: string} | {kind: 'missing', ref: string} | {kind: 'not-file' | 'unreadable' | 'file', ref: string, file: string}}
 */
export function assetRef(ref, at) {
  const clean = decodeAttr(ref).trim().split(/[?#]/)[0];
  if (!clean) return null;
  if (NOT_A_LOAD.test(clean)) return null;
  if (/^(https?:)?\/\//i.test(clean)) return {kind: 'remote', ref: clean, url: decodeAttr(ref).trim()};
  const named = fileNamed(clean);
  if (!isAssetPath(named)) return null;
  const publicDir = path.join(at.root, 'public');
  const found = named.startsWith('/')
    ? path.join(publicDir, named)
    : path.resolve(at.dir, named);
  // A `/` path is served from public/ only; one that climbs out of it names
  // no file of the site.
  if (named.startsWith('/') && !isInside(found, publicDir))
    return {kind: 'missing', ref: clean};
  if (!fs.existsSync(found)) return {kind: 'missing', ref: clean};
  /** @type {fs.Stats | undefined} */
  let st;
  try {
    st = fs.statSync(found);
  } catch {
    return {kind: 'missing', ref: clean};
  }
  if (!st.isFile()) return {kind: 'not-file', ref: clean, file: found};
  try {
    fs.accessSync(found, fs.constants.R_OK);
  } catch {
    return {kind: 'unreadable', ref: clean, file: found};
  }
  return {kind: 'file', ref: clean, file: found};
}

/**
 * The public/ folder a `/` path is read from, as a path from the page's
 * folder (`public/`, `../../public/`), whichever file names it: the page or
 * a stylesheet in another folder.
 * @param {{dir: string, root: string, pageDir?: string}} at
 */
function publicFolderOf(at) {
  const rel = path.relative(at.pageDir ?? at.dir, path.join(at.root, 'public')).split(path.sep).join('/');
  return `${rel}/`;
}

/**
 * Inline local images (src, srcset, poster and CSS url()) as data: URIs. A
 * link (`href`) loads nothing, so it is left alone.
 * @param {string} text markup or CSS
 * @param {'html' | 'css'} kind
 * @param {{dir: string, pageDir?: string, root: string, warnings: RenderWarning[], counted: Set<string>, localAssets: Set<string>, leaveLargeStyleAssets?: boolean, rewrites?: Map<string, string>, remote?: Map<string, import('./remote-images.mjs').RemoteImage>}} ctx
 *   `leaveLargeStyleAssets`: a stylesheet's file too large to inline is left
 *   as it is and named, as a missing one is, rather than refused;
 *   `rewrites`: each attribute value the markup's rewrite replaced, as the
 *   page wrote it, with what it became; `remote`: the remote images fetched
 *   for this render, by the address the page wrote
 */
function inlineAssets(text, kind, ctx) {
  /** @param {string} ref @param {AssetPlace} [place] */
  const resolveRef = (ref, place) => {
    const named = assetRef(ref, ctx);
    if (!named) return null;
    const clean = named.ref;
    if (named.kind === 'remote') {
      // The fetched images go only where an element shows an image, or in a
      // CSS `url()`: a frame's or a video's `src` keeps its address.
      const shows = !place || showsImage(place.tag, place.attr);
      const fetched = shows ? ctx.remote?.get(named.url) : undefined;
      if (fetched && 'uri' in fetched) return fetched.uri;
      // Keyed by the whole address, as the later-drawn pass keys it, so one
      // image gets one warning.
      const key = `remote:${named.url}`;
      if (!ctx.counted.has(key)) {
        ctx.counted.add(key);
        ctx.warnings.push({
          code: 'remote-asset',
          message: `${named.url} is loaded from the network, which a sandboxed page cannot reach; save it beside the page and import it instead.${fetched ? ` The render could not fetch it: ${fetched.reason}.` : ''}`,
        });
      }
      return null;
    }
    if (named.kind !== 'file') {
      const key = `missing:${clean}`;
      if (!ctx.counted.has(key)) {
        ctx.counted.add(key);
        ctx.warnings.push({
          code: 'missing-asset',
          message:
            named.kind === 'missing'
              ? clean.startsWith('/')
                ? `${clean} was not found in ${publicFolderOf(ctx)}, where a path from the site's root is read, so it is left as is and will not show.`
                : `${clean} was not found next to the page, so it is left as is and will not show.`
              : named.kind === 'unreadable'
                ? `${clean} cannot be read (no permission), so it is left as is and will not show.`
                : `${clean} is not a regular file (a pipe, a device or a folder), so it is not read and will not show.`,
        });
      }
      return null;
    }
    const found = named.file;
    // A stylesheet's file too large to carry, where the caller names such
    // files itself (the theme editor's own pages): left as it is, as a
    // missing one is.
    if (
      kind === 'css' &&
      ctx.leaveLargeStyleAssets &&
      (fs.statSync(found, {throwIfNoEntry: false})?.size ?? 0) > MAX_ASSET_BYTES
    ) {
      const key = `large:${clean}`;
      if (!ctx.counted.has(key)) {
        ctx.counted.add(key);
        ctx.warnings.push({
          code: 'missing-asset',
          message: `${clean} is larger than ${MAX_ASSET_BYTES / 1048576} MB, the most a rendered page carries of one file, so it is left as is and will not show.`,
        });
      }
      return null;
    }
    ctx.counted.add(`file:${found}`);
    ctx.localAssets.add(found);
    return assetDataUri(found);
  };
  return rewriteRefs(text, kind, resolveRef, ctx.rewrites);
}

/**
 * Where markup names a file: an element's name and the attribute's, in lower
 * case. A CSS `url()` has none.
 * @typedef {{tag: string, attr: string}} AssetPlace
 */

/**
 * Each reference a page's markup or stylesheet loads, read once for every
 * caller: the render inlines them, and the checks on a written file name
 * every one it left. In markup: src, poster and srcset attributes, and url() in
 * style attributes, each read within its own element; in a stylesheet: url().
 * `resolve` gets each reference as written, with the element and attribute
 * that hold it in markup, and returns what replaces it, or null to keep it.
 * @param {string} text markup or CSS
 * @param {'html' | 'css'} kind
 * @param {(ref: string, place?: AssetPlace) => string | null} resolve
 * @param {Map<string, string>} [rewrites] gets each attribute value replaced,
 *   as the page wrote it, with what it became
 * @returns {string} the text with the replacements made
 */
export function rewriteRefs(text, kind, resolve, rewrites) {
  /**
   * @param {string} value
   * @param {boolean} [record] keep each rewrite, for a style the script sets
   */
  const urls = (value, record = false) =>
    value.replace(new RegExp(CSS_URL.source, 'g'), (whole, ...rest) => {
      const ref = cssUrlRef(/** @type {any} */ ({groups: rest.at(-1)}));
      const uri = resolve(ref);
      if (uri && record && ref) rewrites?.set(ref, uri);
      return uri ? `url("${uri}")` : whole;
    });
  if (kind === 'css') return urls(text);
  /**
   * @param {string} attrs one element's attributes
   * @param {string} tag the element's name, in lower case
   */
  const mapAttributes = (attrs, tag) =>
    attrs
      // React writes `srcSet` as it is spelled in JSX; HTML reads attribute
      // names in any case.
      .replace(/\s(src|poster)="([^"]*)"/gi, (whole, attr, ref) => {
        const uri = resolve(ref, {tag, attr: attr.toLowerCase()});
        if (uri) rewrites?.set(decodeAttr(ref), uri);
        return uri ? ` ${attr}="${uri}"` : whole;
      })
      .replace(/\s(srcset)="([^"]*)"/gi, (whole, attr, set) => {
        const written = decodeAttr(set);
        let carried = false;
        const candidates = parseSrcset(written).map(({url, descriptor}) => {
          const uri = resolve(url, {tag, attr: 'srcset'});
          if (uri) carried = true;
          return {url: uri ?? url, descriptor};
        });
        if (!carried) return whole;
        const rewritten = formatSrcset(candidates);
        rewrites?.set(written, rewritten);
        return ` ${attr}="${rewritten.replace(/"/g, '&quot;')}"`;
      })
      .replace(/\sstyle="([^"]*)"/g, (whole, style) => {
        // The attribute holds escaped text: rewrite the CSS it means, then
        // escape it again, so a data: URI's quotes cannot end the attribute.
        const css = urls(decodeAttr(style), true);
        return ` style="${css.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
      });
  // Each element by itself, so a reference knows the element it is in. A
  // quoted value may hold a `>`, which does not end the tag.
  return text.replace(/<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (tagText, name, attrs) => {
    const mapped = mapAttributes(attrs, name.toLowerCase());
    return mapped === attrs ? tagText : `<${name}${mapped}>`;
  });
}

/**
 * The remote addresses markup or CSS names where an image goes, as the page
 * wrote them: where an element shows an image (showsImage), and `url()` in a
 * `style` attribute or a stylesheet, except an address that names a font,
 * media or a document.
 * @param {string} text
 * @param {'html' | 'css'} kind
 * @param {{dir: string, root: string}} at
 * @returns {Set<string>}
 */
function remoteRefsIn(text, kind, at) {
  /** @type {Set<string>} */
  const found = new Set();
  /** @param {string} ref @param {AssetPlace} [place] */
  const take = (ref, place) => {
    if (place && !showsImage(place.tag, place.attr)) return null;
    const named = assetRef(ref, at);
    if (named?.kind === 'remote' && !NOT_AN_IMAGE.test(named.ref)) found.add(named.url);
    return null;
  };
  rewriteRefs(text, kind, take);
  return found;
}

/**
 * The function Core's naming module builds a part's class with, from the Core
 * the page uses, so the namespace comes from Core and not from the CLI. Null
 * when the page has no Core, or its Core has no naming module that loads.
 * @param {string} entry
 * @param {ServedSet | null} served
 * @returns {Promise<((part: string) => string) | null>}
 */
async function coreClassNamer(entry, served) {
  const file = resolveServed('@astryxdesign/core/naming', entry, served);
  if (!file) return null;
  try {
    const {stableClassName} = await importUrl(pathToFileURL(file).href);
    return typeof stableClassName === 'function' ? stableClassName : null;
  } catch {
    // A Core whose naming module does not load keeps the cut as before.
    return null;
  }
}

/**
 * What a page's markup loads that the render does not carry, each once
 * (a reference that loads nothing, NOT_A_LOAD, aside): the href of a link
 * with a rel the browser fetches (FETCHING_RELS), the src or data of
 * iframe, object and embed elements, the href or xlink:href of SVG image,
 * use and feImage elements,
 * the url(), CSS import rules and image-set() strings of style elements, and
 * the image-set() strings of style attributes. The render warns about each,
 * and the checks on a written file name every one of them.
 * @param {string} markup
 * @returns {Array<{tag: string, ref: string}>}
 */
export function embeddedLoads(markup) {
  /** @type {Array<{tag: string, ref: string}>} */
  const loads = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} tag @param {string} ref */
  const add = (tag, ref) => {
    const key = `${tag} ${ref}`;
    if (!ref || NOT_A_LOAD.test(ref.trim()) || seen.has(key)) return;
    seen.add(key);
    loads.push({tag, ref});
  };
  /** The strings an image-set() names, which url() does not cover. @param {string} tag @param {string} css */
  const imageSets = (tag, css) => {
    for (const [, inner] of css.matchAll(/(?:-webkit-)?image-set\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi)) {
      for (const m of inner.matchAll(/(?<![\w(])(["'])([^"']*)\1/g)) add(tag, m[2]);
    }
  };
  /** @param {string} css */
  const styleSheet = css => {
    for (const m of css.matchAll(/@import\s+([^;]+);?/gi)) add('style', importParams(m[1])?.url ?? '');
    for (const m of css.matchAll(new RegExp(CSS_URL.source, 'g'))) add('style', cssUrlRef(m));
    imageSets('style', css);
  };
  let inStyle = false;
  // Tags and attributes are read as a browser reads them (scanHtml): an
  // attribute's place in the tag does not matter.
  for (const token of scanHtml(markup)) {
    if (token.kind === 'raw') {
      if (inStyle) styleSheet(markup.slice(token.start, token.end));
      continue;
    }
    if (token.kind !== 'start') continue;
    inStyle = token.tag === 'style';
    const attrs = new Map(token.attrs.map(([name, value]) => [name, decodeAttr(value)]));
    const style = attrs.get('style');
    if (style) imageSets(token.tag, style);
    if (token.tag === 'link') {
      // A link loads only for a rel the browser fetches; a canonical or
      // author link names a page and loads nothing.
      const rels = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
      if (rels.some(r => FETCHING_RELS.has(r))) add('link', attrs.get('href') ?? '');
    } else if (token.tag === 'iframe' || token.tag === 'embed') {
      add(token.tag, attrs.get('src') ?? '');
    } else if (token.tag === 'object') {
      add(token.tag, attrs.get('data') ?? '');
    } else if (token.tag === 'image' || token.tag === 'use' || token.tag === 'feimage') {
      add(token.tag, attrs.get('href') ?? attrs.get('xlink:href') ?? '');
    }
  }
  return loads;
}

/**
 * The version of a package the page rendered with: the package set's copy
 * when the page took it from there, else the copy Node's resolver finds from
 * the page's folder.
 * @param {string} name
 * @param {string} dir the page's folder
 * @param {Map<string, string>} setDirs the packages the page took from the package set: their folders
 * @returns {string | null}
 */
function installedVersion(name, dir, setDirs) {
  const packageDir =
    setDirs.get(name) ?? findNodeModulesPackage(dir, name)?.packageDir;
  if (!packageDir) return null;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
    return pkg?.name === name && typeof pkg.version === 'string'
      ? pkg.version
      : null;
  } catch {
    return null;
  }
}

/** The light and dark switch every rendered page carries. */
const SCHEME_CSS =
  ':root{color-scheme:light dark}:root[data-theme="light"]{color-scheme:light}:root[data-theme="dark"]{color-scheme:dark}';

/**
 * Render a page module to one self-contained HTML file.
 * @param {string} entry absolute path of the page module
 * @param {{title?: string, timeoutMs?: number, version?: string, served?: ServedSet | null, output?: string, cwd?: string, openLayers?: boolean, leaveLargeStyleAssets?: boolean, markupOnly?: boolean, esbuildFrom?: string, remoteImages?: Parameters<typeof remoteImages>[0], cutFontFaces?: boolean}} [options]
 *   `served`: the Core of the package set the CLI runs from, for the packages
 *   the page's folder has no copy of; `output`: the file the HTML goes to;
 *   `cwd`: the current folder, whose files are the page's own outside a
 *   project; `openLayers`: the overlays the page shows or opens are drawn
 *   and added after its markup (layers.mjs), for reading what they paint;
 *   `leaveLargeStyleAssets`: a stylesheet's file too large to inline is
 *   left out and named in the warnings, not refused (for a caller that
 *   names such files itself). With `output`, the file describes itself: notes at its top and end name
 *   what made it and the commands that give the page back and render it
 *   again, and its embedded source records the CLI version, the packages
 *   the page rendered with, and the markup as rendered. The file also
 *   carries the page's script (client-bundle.mjs): it draws the page over
 *   its markup in the browser, so the page's controls work. The markup sits
 *   in one element the script draws into, and the stylesheet keeps the rules
 *   any of the page's modules can use, not only the markup's. esbuild, a
 *   dependency of the CLI, builds the script (`esbuildFrom`: the folder it
 *   resolves from); a page whose script cannot be built fails the render.
 *   `markupOnly` renders the markup and its styles without the script, for a
 *   caller that shows the markup itself (the theme editor); it writes no file
 *   and reaches no network. The render fetches each https image the page
 *   names, once, so the file carries it (remote-images.mjs; `remoteImages`:
 *   the fetch and its time limits, for tests).
 *   `cutFontFaces` drops each font face that no character in the page, its
 *   stylesheet or its script reaches (css-cut.mjs), for a file whose text is
 *   known (export); a page a person types into keeps every face.
 * @returns {Promise<RenderedPage>}
 */
export async function renderPage(entry, options = {}) {
  const dir = path.dirname(entry);
  // The project's folder, else the page's: where its tsconfig.json is read
  // and paths in messages start.
  const root = projectOf(dir) ?? dir;
  const scope = carryScopeOf(dir, options.cwd);
  // Where a `/` path's public/ folder is.
  const site = siteRootOf(dir, scope);
  const served = options.served ?? null;
  /** @type {RenderWarning[]} */
  const warnings = [];
  /** @type {string | undefined} */
  let esbuild;
  if (!options.markupOnly) {
    esbuild = findEsbuild(options.esbuildFrom) ?? undefined;
    if (!esbuild) {
      throw new RenderError(
        'ERR_RENDER_MISSING_DEPENDENCY',
        `The render builds the page's script, but ${ESBUILD_MISSING}; nothing was written.`,
      );
    }
  }
  const message = await runPage(
    {entry, root, scope, served, openLayers: options.openLayers === true, buildScript: esbuild !== undefined, esbuild},
    options.timeoutMs ?? RENDER_TIMEOUT_MS,
    warnings,
  );
  if (!message.ok) {
    throw new RenderError(
      message.error.code,
      message.error.message,
      message.error.detail,
    );
  }
  /** @type {string} */
  let markup = withoutAutofocus(linksOpenNewTabs(message.markup));

  // Stylesheets: Core's reset and components, plus each official package's
  // own stylesheet the page imports from.
  /** @type {string[]} */
  const sheets = [];
  /** @type {string[]} */
  const sheetText = [];
  /** Each stylesheet's own file, so its url()s resolve from its folder. @type {string[]} */
  const sheetFiles = [];
  /** @param {string} spec */
  const addSheet = spec => {
    try {
      const file = resolveServed(spec, entry, served);
      if (!file) return false;
      sheets.push(spec);
      sheetText.push(fs.readFileSync(file, 'utf8'));
      sheetFiles.push(file);
      return true;
    } catch {
      return false;
    }
  };
  const hasCore = addSheet('@astryxdesign/core/reset.css');
  if (hasCore) addSheet('@astryxdesign/core/astryx.css');
  /** The package stylesheets the page's modules import. @type {string[]} */
  const scriptSheets = [];
  let scriptNamesAstryx = false;
  // Package stylesheets the page imports itself, such as a theme's.
  for (const {spec, from} of /** @type {{spec: string, from: string}[]} */ (
    message.packageCss ?? []
  )) {
    const file = resolveServed(spec, from, served);
    if (file) scriptSheets.push(file);
    else if (spec.startsWith('@astryxdesign/')) scriptNamesAstryx = true;
    if (sheets.includes(spec)) continue;
    try {
      if (!file) throw new Error('not found');
      sheets.push(spec);
      sheetText.push(fs.readFileSync(file, 'utf8'));
      sheetFiles.push(file);
    } catch {
      warnings.push({
        code: 'missing-asset',
        message: `The page imports the stylesheet ${spec}, which could not be found, so its styles are missing.`,
      });
    }
  }
  for (const pkg of /** @type {string[]} */ (message.packages ?? [])) {
    const m = /^@astryxdesign\/([a-z0-9-]+)$/.exec(pkg);
    if (!m || m[1] === 'core') continue;
    addSheet(`${pkg}/${m[1]}.css`);
  }
  if (!hasCore) {
    warnings.push({
      code: 'no-astryx-styles',
      // Outside a project the page would have taken the CLI's own Core.
      message: served
        ? '@astryxdesign/core is not installed where the page is, and the CLI runs without one, so the page has no Astryx styles; install it, or render from inside the project.'
        : '@astryxdesign/core is not installed where the page is, so the page has no Astryx styles; install it, or render from inside the project.',
    });
  }

  // A page that uses nothing from Astryx is not what the command makes: its
  // own app's build shares it. Its script's module graph (local components,
  // re-exports and lazy imports included) and the stylesheets it brings in
  // decide, before any stylesheet is expanded, any asset inlined, any image
  // fetched or anything written. A markup-only render builds no script and
  // is not checked.
  const ownSheets = /** @type {{file: string}[]} */ (message.importedCss ?? []).map(({file}) => file);
  if (
    message.astryx === false &&
    !scriptNamesAstryx &&
    !reachesAstryxSheet([...ownSheets, ...scriptSheets], served)
  ) {
    throw new RenderError(
      'ERR_RENDER_NOT_ASTRYX',
      `${path.basename(entry)} uses no Astryx components or styles; \`astryx experimental export\` only writes pages built with Astryx. Don't add Astryx to this app to export it: share the page with the app's own build instead (for a Vite app, a single-file build); nothing was written.`,
    );
  }

  // The https images the page names, fetched once so the file carries them.
  // A markup-only render reaches no network.
  const remote = options.markupOnly ? null : remoteImages(options.remoteImages);
  const ctx = {
    dir,
    // A stylesheet's own folder replaces `dir` for its url()s; a warning
    // still names folders from the page's.
    pageDir: dir,
    root: site,
    warnings,
    counted: new Set(),
    localAssets: /** @type {Set<string>} */ (new Set()),
    leaveLargeStyleAssets: options.leaveLargeStyleAssets === true,
    rewrites: /** @type {Map<string, string>} */ (new Map()),
    remote: remote?.results,
  };
  /**
   * Inline what `text` names, after fetching the remote images it names that
   * no earlier text named.
   * @param {string} text
   * @param {'html' | 'css'} kind
   * @param {typeof ctx} at
   */
  const inlineWithRemote = async (text, kind, at) => {
    if (remote) await remote.get(remoteRefsIn(text, kind, at));
    return inlineAssets(text, kind, at);
  };
  /** Stylesheets pulled in by another's `@import`. @type {Set<string>} */
  const carriedCss = new Set();
  /** Each project stylesheet an `@import` names, with every sheet that imports it. @type {Map<string, Set<string>>} */
  const cssImporters = new Map();
  // The images the markup, the page's own CSS and its literals name are
  // asked for together, so a machine with no network waits for one answer
  // window, not one per text.
  if (remote) {
    await remote.get([
      ...remoteRefsIn(markup, 'html', ctx),
      ...(message.css ? remoteRefsIn(message.css, 'css', ctx) : []),
      ...(typeof message.script === 'string' ? /** @type {string[]} */ (message.remoteLiterals ?? []) : []),
    ]);
  }
  try {
    markup = await inlineWithRemote(markup, 'html', ctx);
    // React adds `<link rel="preload">` hints for images it renders; in one
    // static file they only fetch from the network, so they go.
    markup = markup.replace(/<link rel="preload"[^>]*\/?>/g, '');
    // What the page itself renders that would run or load something: the
    // file promises neither, so say so.
    if (/<script\b/i.test(markup)) {
      warnings.push({
        code: 'page-script',
        message:
          'The page renders a <script> element. A sandboxed viewer blocks it, and anywhere else it runs when the file is opened; remove it from the page.',
      });
    }
    for (const {tag, ref} of embeddedLoads(markup)) {
      warnings.push({
        code: 'remote-asset',
        message: `The page renders a <${tag}> that loads ${ref}, which a sandboxed page cannot reach and which loads from outside the file; remove it from the page.`,
      });
    }
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err instanceof RenderAssetError)
      throw new RenderError(err.code, err.message, err.detail);
    throw e;
  }
  const used = classesIn(markup);
  /** The page's script; none in a markup-only render. @type {string | null} */
  const script = typeof message.script === 'string' ? message.script : null;
  // https images the page's files name as literals that the first paint may
  // not show (the next view, a feed after a click): fetched the same way, so
  // the script draws them from the same carried data.
  if (remote && script !== null) {
    const literals = /** @type {string[]} */ (message.remoteLiterals ?? []);
    const namedOnly = new Set(/** @type {string[]} */ (message.remoteNamedOnly ?? []));
    await remote.get(literals);
    for (const url of literals) {
      const fetched = remote.results.get(url);
      if (!fetched || 'uri' in fetched) continue;
      // An address that counts only by a name (`imageUploadUrl`, an object's
      // `src`) can be an API's or a player's: when its server answers with
      // another type (JSON, a page), the result lists it, with no warning.
      // Any other later-drawn address warns, as in the first paint.
      if (fetched.answered && namedOnly.has(url)) continue;
      const key = `remote:${url}`;
      if (ctx.counted.has(key)) continue;
      ctx.counted.add(key);
      warnings.push({
        code: 'remote-asset',
        message: `${url}, which the page's code names as an image, is loaded from the network when the script draws it, which a sandboxed page cannot reach; save it beside the page and import it instead. The render could not fetch it: ${fetched.reason}.`,
      });
    }
  }
  /** Built addresses named in a warning already. @type {Set<string>} */
  const builtNamed = new Set();
  for (const built of /** @type {{text: string, file: string, line: number}[]} */ (message.builtRemote ?? [])) {
    const where = `${path.relative(dir, built.file).split(path.sep).join('/')}:${built.line}`;
    if (builtNamed.has(`${where} ${built.text}`)) continue;
    builtNamed.add(`${where} ${built.text}`);
    warnings.push({
      code: 'remote-asset',
      message: `${built.text} (${where}) builds an image address in code, so the render cannot carry it: the file asks the network for it when the script draws it. Write the address whole, or save the image beside the page and import it.`,
    });
  }
  // The script draws what the markup does not show yet (a menu as it opens,
  // the next tab), so the rules every class name it holds needs stay too.
  // Core builds a part's class at run time from the part's name
  // (`banner-icon` -> `astryx-banner-icon`), so each name also keeps the
  // class Core's naming module makes from it.
  const tokens = script?.match(/[A-Za-z_][\w-]*/g) ?? [];
  const coreClass = script ? await coreClassNamer(entry, served) : null;
  const kept = script
    ? new Set([...used, ...tokens, ...(coreClass ? tokens.map(coreClass) : [])])
    : used;
  // A page that draws elements in a state (hovered, focused, pressed) marks
  // them; its stylesheet then applies those states' rules to them too.
  const states = markup.includes(' data-astryx-state="');
  const layerOrder = sheetText.map(layerOrderOf).find(Boolean) ?? '';
  let css = layerOrder;
  try {
    // A stylesheet's url()s are relative to the stylesheet, not the page: a
    // theme's font, or an image beside an imported stylesheet.
    const included = new Set(sheetFiles);
    /** @type {string[]} */
    const packageSheets = [];
    /**
     * A stylesheet's rules cut to the page, with its own imports expanded,
     * and the warnings that expanding them gave.
     * @param {string} file @param {string} text
     * @returns {{file: string, cut: string, expandWarnings: RenderWarning[]}}
     */
    const sheet = (file, text) => {
      /** @type {RenderWarning[]} */
      const expandWarnings = [];
      try {
        const own = expandImports(file, text, {
          warnings: expandWarnings,
          carried: carriedCss,
          importers: cssImporters,
          included,
          packageSheets,
          served,
        });
        return {file, cut: cutCss(own, kept, {states}), expandWarnings};
      } catch (e) {
        warnings.push(...expandWarnings);
        throw invalidSheet(e, file);
      }
    };
    /** @param {unknown} e @param {string} file */
    const invalidSheet = (e, file) => {
      if (e instanceof RenderAssetError || e instanceof RenderError) return e;
      const reason =
        /** @type {any} */ (e)?.reason ??
        (e instanceof Error ? e.message : String(e));
      return new RenderError(
        'ERR_RENDER_COMPILE',
        `${path.relative(dir, file).split(path.sep).join('/')} is not valid CSS: ${reason}`,
      );
    };
    const parts = sheetText.map((text, i) => sheet(sheetFiles[i], text));
    for (const {
      file,
      css: text,
    } of /** @type {{file: string, css: string}[]} */ (
      message.importedCss ?? []
    )) {
      parts.push(sheet(file, text));
    }
    // The font faces the page draws with are known from the whole
    // stylesheet, the markup and the script; the cut runs before the files
    // are read, so a face it drops is never read, counted or warned about.
    const stylesheet = [...parts.map(part => part.cut), message.css ?? ''].join(
      '\n',
    );
    const drawn = markup + (script ?? '');
    for (const {file, cut, expandWarnings} of parts) {
      warnings.push(...expandWarnings);
      try {
        css += await inlineWithRemote(
          options.cutFontFaces ? cutFontFaces(cut, drawn, stylesheet) : cut,
          'css',
          {...ctx, dir: path.dirname(file)},
        );
      } catch (e) {
        throw invalidSheet(e, file);
      }
    }
    for (const spec of packageSheets)
      if (!sheets.includes(spec)) sheets.push(spec);
    if (message.css) css += await inlineWithRemote(message.css, 'css', ctx);
    remote?.done();
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err instanceof RenderAssetError)
      throw new RenderError(err.code, err.message, err.detail);
    throw e;
  }
  // Keep inlined CSS from ending its own <style> element.
  css = css.replace(/<\/style/gi, '<\\/style');

  // A component that dropped the text it was given: its text is missing while
  // text next to it rendered.
  const plainText = markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  // The components' own docs say which one drops a missing text; they are
  // read only when a text is missing.
  /** @type {((entry: import('./dropped-text.mjs').ChainEntry) => Promise<boolean | null>) | null} */
  let takesChildren = null;
  for (const t of /** @type {any[]} */ (message.texts ?? [])) {
    if (t.hidden || t.text.length < 2 || plainText.includes(t.text)) continue;
    // The code around it ran: other text from the same function rendered.
    const around = /** @type {string[]} */ (
      message.fnTexts?.[t.fn] ?? []
    ).filter(o => o !== t.text);
    if (!around.some(o => plainText.includes(o))) continue;
    takesChildren ??= childrenReader(
      /** @type {{name: string, dir: string}[]} */ (message.fromSet ?? []).find(
        p => p.name === '@astryxdesign/core',
      )?.dir ??
        findNodeModulesPackage(dir, '@astryxdesign/core')?.packageDir ??
        null,
    );
    const dropper = await dropperOf(t.chain ?? [], takesChildren);
    // Its own component takes children: a later paint shows the text.
    if (dropper === null) continue;
    const shown = t.text.length > 60 ? `${t.text.slice(0, 57)}...` : t.text;
    const where =
      t.file && t.file !== entry
        ? ` of ${path.relative(dir, t.file).split(path.sep).join('/')}`
        : '';
    warnings.push({
      code: 'dropped-children',
      message: dropper
        ? `<${dropper.component}> on line ${dropper.line}${where} did not render the text "${shown}" it was given; ${dropper.name} takes no children, so pass the text through one of its props (astryx component ${dropper.name}).`
        : `<${t.component}> on line ${t.line}${where} did not render the text "${shown}" it was given; it takes that text through a prop (often label=), so check its props.`,
    });
  }
  // A media query the page asks in JavaScript gets its server answer in the
  // markup. The file paints that answer first and asks again when its script
  // runs; a viewer that blocks scripts keeps the server answer, and so does
  // a markup-only render.
  const screenQueries = [
    ...new Set(
      /** @type {{call: string}[]} */ (message.screenQueries ?? []).map(
        q => q.call,
      ),
    ),
  ];
  if (screenQueries.length > 0) {
    warnings.push({
      code: 'screen-query',
      message: script
        ? `The page asks ${screenQueries.join(', ')} in JavaScript: this file paints the server answer first and asks again when its script runs, and a viewer that blocks scripts keeps the server answer. To fit every screen from the first paint, fold the layout with CSS: Grid columns={{minWidth}}, or a StyleX @media or @container style.`
        : `The page asks ${screenQueries.join(', ')} in JavaScript, which this file never runs: readers on every screen get its server answer, so fold the layout with CSS: Grid columns={{minWidth}}, or a StyleX @media or @container style.`,
    });
  }
  // A chart the render did not draw is an empty box: a ResponsiveContainer
  // holds only its sizing box, and a chart of fixed size an empty wrapper. The
  // file's script draws it when it runs.
  const blankCharts =
    (
      markup.match(
        /<div class="recharts-responsive-container[" ][^>]*><div[^>]*><\/div><\/div>/g,
      ) ?? []
    ).length +
    (markup.match(/<div\b[^>]*\bclass="recharts-wrapper"[^>]*><\/div>/g) ?? [])
      .length +
    (message.chartsFailed ?? 0);
  if (blankCharts > 0) {
    warnings.push({
      code: 'chart-size',
      message: script
        ? `${blankCharts === 1 ? 'A chart' : `${blankCharts} charts`} could not be drawn without a browser, so the file paints ${blankCharts === 1 ? 'it' : 'them'} empty and its script draws ${blankCharts === 1 ? 'it' : 'them'} when it runs; a viewer that blocks scripts keeps ${blankCharts === 1 ? 'it' : 'them'} empty. The render draws a chart into the markup only when a module of the page (not an installed package) imports the chart, and its ResponsiveContainer, from recharts by name (\`import {LineChart} from 'recharts'\`).`
        : `${blankCharts === 1 ? 'A chart' : `${blankCharts} charts`} could not be drawn without a browser, so ${blankCharts === 1 ? 'it is' : 'they are'} empty here: the render draws a chart only when a module of the page (not an installed package) imports the chart, and its ResponsiveContainer, from recharts by name (\`import {LineChart} from 'recharts'\`).`,
    });
  }
  // Text inside a drawing that scales to its box shrinks with it on a phone.
  const smallText = smallSvgText(markup);
  if (smallText) {
    warnings.push({
      code: 'chart-size',
      message: `${smallText.count === 1 ? 'An SVG drawing scales' : `${smallText.count} SVG drawings scale`} to fit ${smallText.count === 1 ? 'its' : 'their'} box with text inside, so on a 375 px phone that text shows at about ${smallText.px} px. Put the labels in HTML beside the drawing, or draw the chart with recharts in a ResponsiveContainer, which keeps its text size.`,
    });
  }
  if (message.chartsAlone) {
    /** @type {Record<string, string>} */
    const causes = {
      changed:
        'The page changed its charts once its effects ran (their data or props, or which charts it shows)',
      rerendered:
        "A component that makes a chart rendered again once the page's effects ran",
      error: 'The page could not be drawn again without a browser',
    };
    const why = causes[message.chartsAlone] ?? causes.error;
    warnings.push({
      code: 'chart-size',
      message: script
        ? `${why}, so each chart was drawn by itself for the first paint, as the first render gave it: until the file's script draws the page again, a custom tick, label or shape in a chart sees React context defaults, not the values the page provides.`
        : `${why}, so each chart was drawn by itself, as the first render gave it: a custom tick, label or shape in a chart sees React context defaults, not the values the page provides.`,
    });
  }
  for (const sheet of /** @type {string[]} */ (message.skippedCss ?? [])) {
    warnings.push({
      code: 'missing-asset',
      message: `The page imports ${sheet}, a Sass or Less stylesheet, which a render does not compile, so its styles are missing.`,
    });
  }
  for (const log of /** @type {{level: string, text: string}[]} */ (
    message.logs ?? []
  ).slice(0, 5)) {
    warnings.push({
      code: 'page-output',
      message: `The page printed while rendering (${log.level}): ${log.text.split('\n')[0].slice(0, 200)}`,
    });
  }

  const files = /** @type {string[]} */ (message.files ?? [entry]);
  if (!files.includes(entry)) files.unshift(entry);
  // Images and fonts the page or a stylesheet names by a relative path
  // (`<img src="./logo.png">`, `url(./bg.png)`) are carried too, so the page
  // comes back with them; a package's own files are not.
  /**
   * Local files the page uses that the file cannot carry: a module, a
   * stylesheet or an image from outside the folder it carries from, which no
   * reverse writes, and a Sass or Less stylesheet. A package's own files
   * are not the page's.
   * @type {string[]}
   */
  const uncarried = [...(/** @type {string[]} */ (message.uncarried ?? []))];
  // With a package that node_modules links into the carried folder, a sheet
  // another pulls in is carried only when a carried sheet imports it: the
  // linked package's own stylesheets are the package's (the worker carries
  // only the files the page reaches by a path).
  const linkedRoots = /** @type {string[]} */ (message.linkedRoots ?? []);
  /** @type {Set<string>} */
  const importedByCarried = new Set();
  if (linkedRoots.length > 0) {
    for (let grew = true; grew; ) {
      grew = false;
      for (const [sheet, from] of cssImporters) {
        if (importedByCarried.has(sheet)) continue;
        if ([...from].some(f => files.includes(f) || importedByCarried.has(f))) {
          importedByCarried.add(sheet);
          grew = true;
        }
      }
    }
  }
  for (const sheet of carriedCss) {
    if (path.relative(scope, sheet).split(path.sep).includes('node_modules'))
      continue;
    if (linkedRoots.length > 0 && !importedByCarried.has(sheet)) continue;
    if (!isInside(sheet, scope)) {
      if (!uncarried.includes(sheet)) uncarried.push(sheet);
      continue;
    }
    if (!files.includes(sheet)) files.push(sheet);
  }
  /** Assets named in a warning already, so each is named once. @type {Set<string>} */
  const notCarried = new Set();
  /**
   * Carry an image, font or media file of the project's own. It is carried
   * only when its bytes are a known image, font or media format, the same
   * test --reverse applies, so the file always comes back.
   * @param {string} asset absolute
   * @param {string} how how the page uses it, for the warning
   */
  const carryAsset = (asset, how) => {
    if (path.relative(scope, asset).split(path.sep).includes('node_modules'))
      return;
    if (!isInside(asset, scope)) {
      if (isFileAt(asset) && !uncarried.includes(asset)) uncarried.push(asset);
      return;
    }
    if (files.includes(asset) || notCarried.has(asset)) return;
    /** @param {string} why */
    const leaveOut = why => {
      notCarried.add(asset);
      warnings.push({
        code: 'not-embedded',
        message: `${path.relative(dir, asset).split(path.sep).join('/')} is ${how} but not carried in the file: ${why}, so experimental import cannot give it back.`,
      });
    };
    /** @type {Buffer} */
    let head;
    try {
      // The same limit as a file the page shows, which a render inlines.
      if (fs.statSync(asset).size > MAX_ASSET_BYTES) {
        leaveOut(
          `it is larger than ${MAX_ASSET_BYTES / 1048576} MB, the most a rendered page carries of one file`,
        );
        return;
      }
      head = headOf(asset);
    } catch (e) {
      leaveOut(
        `it cannot be read (${/** @type {NodeJS.ErrnoException} */ (e).code ?? 'an error from the file system'})`,
      );
      return;
    }
    if (!isAssetBytes(head)) {
      leaveOut('its bytes are not a known image, font or media format');
      return;
    }
    files.push(asset);
  };
  for (const asset of ctx.localAssets) carryAsset(asset, 'shown inline');
  // A carried module or stylesheet can name an image, font or media file by
  // a relative path. --reverse expects each such file back, also when this
  // render does not show it, when it lies inside the folder that holds the
  // carried files (a name that climbs out of it is not the page's file).
  let named = dir;
  for (const f of files) {
    while (!isInside(f, named)) named = path.dirname(named);
  }
  const carriedText = files.filter(
    f =>
      /\.(?:[cm]?[jt]sx?|css)$/i.test(f) &&
      (f === entry ||
        !embeddedPathProblem(
          path.relative(named, f).split(path.sep).join('/'),
        )),
  );
  // A linked package's modules the file does not carry may still name images
  // the script draws later: those images are carried and shown the same way.
  carriedText.push(...(/** @type {string[]} */ (message.linkedModules ?? [])));
  for (const file of carriedText) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const {written: ref, file: name} of assetRefsOf(text, file)) {
      const how = `named in ${path.relative(dir, file).split(path.sep).join('/')}`;
      /** @param {string} f */
      const local = f => isInside(f, named) && isFileAt(f);
      /** The file the string names in the browser: a path from the site's root, or, for a relative string, from the page's folder (the file's address), not the module's. @type {string | null} */
      let shown;
      if (ref.startsWith('/')) {
        const found = assetRef(ref, {dir, root: site});
        shown = found?.kind === 'file' ? found.file : null;
      } else {
        // The file the module names beside it, which a restore lays out
        // where the module's own folder finds it.
        const beside = path.resolve(path.dirname(file), name);
        if (local(beside)) carryAsset(beside, how);
        // A stylesheet's url() is its own folder's file, which its inlined
        // rules already carry; only a module's string reaches the script.
        if (/\.css$/i.test(file)) continue;
        shown = path.resolve(dir, name);
        if (!local(shown)) shown = null;
      }
      if (!shown) continue;
      carryAsset(shown, how);
      // An image the page draws only later (the next view, a row below the
      // fold) shows from that file's carried data once the script draws it,
      // as the first paint shows the images it draws. The same string in two
      // folders names one file in the browser, so it gets one file's data.
      if (files.includes(shown) && !ctx.rewrites.has(ref)) {
        ctx.rewrites.set(ref, assetDataUri(shown));
      }
    }
  }
  // The script draws the page again with the paths the page wrote, so each
  // carried image keeps showing, the first paint's and the ones drawn later.
  // A local path becomes its data in the script. An https address stays as
  // the page wrote it: the file's script gives the carried data where the
  // browser takes an image's address (imageSinks), so a link, a text or the
  // URL API still reads the page's own address.
  // A remote address is one the render fetches: https, or one with no
  // scheme (`//cdn.example.com/a.png`).
  const remoteAddress = (/** @type {string} */ url) => /^(https?:)?\/\//i.test(url.trim());
  /** @type {Map<string, string>} */
  const localRewrites = new Map();
  for (const [was, now] of ctx.rewrites) {
    // A value is read as a `srcset` only when it lists a remote candidate:
    // a local name may hold a comma and a space (`./Logo, dark.png`).
    const written = /\s/.test(was.trim()) ? parseSrcset(was) : null;
    if (!written?.some(candidate => remoteAddress(candidate.url))) {
      if (!remoteAddress(was)) localRewrites.set(was, now);
      continue;
    }
    // A `srcset` keeps its remote candidates as written.
    const carried = parseSrcset(now);
    if (written.length !== carried.length) continue;
    const mixed = written.map((candidate, i) => (remoteAddress(candidate.url) ? candidate : carried[i]));
    if (mixed.some((candidate, i) => candidate !== written[i])) localRewrites.set(was, formatSrcset(mixed));
  }
  /** @type {[string, string][]} */
  const sinks = [];
  for (const [url, fetched] of remote?.results ?? []) if ('uri' in fetched) sinks.push([url, fetched.uri]);
  const drawn =
    script === null ? null : (sinks.length > 0 ? imageSinks(sinks) : '') + withCarriedPaths(script, localRewrites);
  // Paths are kept relative to the folder that holds every file: the page's
  // folder, or an ancestor when the page imports from above it, but never one
  // from which the page's own path holds a name a reverse refuses (a
  // dot-folder): a file above that stays out of the file, and is named.
  let base = dir;
  for (const f of files) {
    while (!isInside(f, base)) {
      const up = path.dirname(base);
      if (
        up === base ||
        embeddedPathProblem(
          path.relative(up, entry).split(path.sep).join('/'),
          {page: true},
        )
      )
        break;
      base = up;
    }
  }
  // Page first, so the reader knows which file is the page. Only files a
  // rendered page may carry are embedded (see embedded-files.mjs).
  const ordered = [entry, ...files.filter(f => f !== entry)];
  /** @type {{path: string, bytes: Buffer}[]} */
  const embedded = [];
  /**
   * Files the page uses that the file does not carry, so --reverse cannot
   * give them back: the note and the result name each one.
   * @type {string[]}
   */
  const leftOut = [];
  for (const f of ordered) {
    const rel = path.relative(base, f).split(path.sep).join('/');
    const problem = f === entry ? null : embeddedPathProblem(rel);
    if (problem) leftOut.push(rel);
    if (problem?.toolConfig) {
      const fix = carriedNameFor(rel);
      warnings.push({
        code: 'not-carried',
        message:
          fix.action === 'rename'
            ? `${rel} is not carried: its name reads as a tool's configuration, which experimental import never writes. The page shows it, but experimental import cannot give it back. If it holds the page's data, rename it, such as ${fix.name}, to carry it. If a tool reads it, move the values the page reads into a file of its own, such as page-data.json.`
            : `${rel} is not carried: it is a tool's configuration, which experimental import never writes. The page shows what it reads from it, but experimental import cannot give it back. Move the values the page reads into a file of its own, such as ${fix.name}, to carry them.`,
      });
      continue;
    }
    if (problem) {
      warnings.push({
        code: 'not-embedded',
        message: `${rel} is not carried in the file (a rendered page carries the page and the local modules, stylesheets, JSON files and images it imports, but never project or tool configuration, or a file a test, story or benchmark runner would run), so experimental import cannot give it back.`,
      });
      continue;
    }
    embedded.push({path: rel, bytes: fs.readFileSync(f)});
  }
  for (const asset of notCarried) {
    leftOut.push(path.relative(base, asset).split(path.sep).join('/'));
  }
  // In a project, a render carries from the project's folder wherever it
  // runs, so only moving the file inside it carries it.
  const inProject = projectOf(dir) !== null;
  for (const f of uncarried) {
    // A file the render carries (a JSON file, stylesheet or image from above
    // the page's folder widens the folder it carries from) is not left out.
    if (files.includes(f)) continue;
    const rel = path.relative(base, f).split(path.sep).join('/');
    if (leftOut.includes(rel)) continue;
    leftOut.push(rel);
    // A Sass or Less stylesheet already has its missing-asset warning.
    if (/\.(scss|sass|less)$/i.test(f)) continue;
    warnings.push({
      code: 'not-embedded',
      message: inProject
        ? `${rel} is not carried: it is outside the project's folder, which a render carries from, and experimental import writes nothing outside it. The page shows it, but experimental import cannot give it back. Move it inside the project's folder.`
        : `${rel} is not carried: it is outside the folder the render carries from, and experimental import writes nothing outside it. The page shows it, but experimental import cannot give it back. Render from a folder that holds it, or move it into the page's folder.`,
    });
  }
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
    .exec(markup)?.[1]
    ?.replace(/<[^>]*>/g, '')
    .trim();
  const title =
    options.title ??
    (heading
      ? decodeAttr(heading)
      : path.basename(entry).replace(/\.[^.]+$/, ''));
  const generator = `<meta name="generator" content="Astryx${options.version ? ` ${escapeHtml(options.version)}` : ''}">`;
  const style = `<style>${SCHEME_CSS}${script ? `#${ROOT_ID}{display:contents}` : ''}${markup.includes('class="recharts-responsive-container"') ? CHART_CSS : ''}${css}</style>`;
  // With a script, the markup sits in the one element the script draws into,
  // which takes no box of its own.
  const body = script ? `<div id="${ROOT_ID}">${markup}</div>` : markup;
  // An image the embedded source leaves out (under a dot-folder, say) keeps
  // its own data: URI in the script.
  const carriedSha = new Set(embedded.map(e => sha256(e.bytes)));
  /** @type {Map<string, Buffer>} */
  const imageBytes = new Map();
  for (const f of files) {
    if (!isAssetPath(f)) continue;
    try {
      const bytes = fs.readFileSync(f);
      imageBytes.set(sha256(bytes), bytes);
    } catch {
      // A file that went away since the page imported it stays as written.
    }
  }
  const pageScript =
    drawn === null
      ? null
      : withUncarriedImages(drawn, carriedSha, (sha, prefix) => {
          const bytes = imageBytes.get(sha);
          return bytes ? `${prefix},${bytes.toString('base64')}` : null;
        });
  const scriptTag = pageScript ? `<script>${pageScript}</script>\n` : '';
  let html;
  let block;
  if (options.output) {
    // The charset and generator metas come first: a browser reads the
    // charset only from the first 1024 bytes, and a CLI decides whether a
    // render wrote a file from its first 4096.
    const setDirs = new Map(
      /** @type {{name: string, dir: string}[]} */ (message.fromSet ?? []).map(
        p => [p.name, p.dir],
      ),
    );
    const names = new Set([
      ...(message.packages ?? []),
      ...setDirs.keys(),
      'react',
      'react-dom',
    ]);
    if (hasCore) names.add('@astryxdesign/core');
    /** @type {Record<string, string>} */
    const packages = {};
    for (const name of [...names].sort()) {
      if (name.startsWith('node:') || builtinModules.includes(name)) continue;
      const version = installedVersion(name, dir, setDirs);
      if (version) packages[name] = version;
    }
    const file = path.basename(options.output);
    const facts = {
      cli: options.version ?? null,
      format: formatFor(embedded),
      file,
      page: projectOf(dir)
        ? path.relative(root, entry).split(path.sep).join('/')
        : embedded[0].path,
      restored: `${file.replace(/\.[^.]+$/, '')}-restored/${embedded[0].path}`,
      files: embedded.map(f => f.path),
      notCarried: leftOut,
      packages,
      install: Object.entries(packages)
        .filter(([name]) => !isServedPackage(name, []))
        .map(([name, version]) => `${name}@${version}`),
      ...(options.title === undefined ? {} : {title: options.title}),
    };
    // The file each alias import named, for the files the page carries, so a
    // reverse where no alias names it still finds the file.
    const carried = new Map(
      embedded.map(f => [path.resolve(base, f.path), f.path]),
    );
    /** @type {Record<string, string>} */
    const aliases = {};
    for (const {
      spec,
      file: named,
    } of /** @type {{spec: string, file: string}[]} */ (
      message.aliasImports ?? []
    ).sort((a, b) => (a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0))) {
      const rel = carried.get(path.resolve(named));
      if (rel && aliasOnly(spec)) aliases[spec] = rel;
    }
    // The public/ folder the render read `/` paths from, when the file
    // carries files from it, so a reverse expects them there and not in
    // another public/ the tree holds.
    const publicRel = path.relative(base, path.join(site, 'public')).split(path.sep).join('/');
    const publicDir =
      publicRel && !publicRel.startsWith('..') && !path.isAbsolute(publicRel) &&
      embedded.some(f => f.path.startsWith(`${publicRel}/`))
        ? publicRel
        : null;
    const record = {
      ...(facts.cli ? {cli: facts.cli} : {}),
      page: facts.page,
      ...(options.title === undefined ? {} : {title: options.title}),
      packages,
      ...(Object.keys(aliases).length > 0 ? {aliases} : {}),
      ...(leftOut.length > 0 ? {notCarried: leftOut} : {}),
      ...(publicDir ? {publicDir} : {}),
      markup: {
        sha256: sha256(asParsed(body)),
        style: sha256(asParsed(style)),
        text: Buffer.from(
          JSON.stringify({title, runs: textRuns(body)}),
        ).toString('base64'),
      },
    };
    block = sourceBlock(path.basename(entry), embedded, record);
    html =
      `<!doctype html><html lang="en"${rootThemeAttrs(markup)}><head><meta charset="utf-8">${generator}\n${headerNote(facts)}\n` +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="color-scheme" content="light dark">' +
      `<title>${escapeHtml(title)}</title>${style}</head><body>${body}` +
      `${block}\n${endNote(facts)}\n${scriptTag}</body></html>\n`;
  } else {
    block = sourceBlock(path.basename(entry), embedded);
    html =
      `<!doctype html><html lang="en"${rootThemeAttrs(markup)}><head><meta charset="utf-8">` +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="color-scheme" content="light dark">' +
      `${generator}<title>${escapeHtml(title)}</title>${style}</head><body>${body}` +
      `${block}${scriptTag}</body></html>\n`;
  }
  const remoteSummary = remote?.summary();
  return {
    html,
    files: embedded.map(f => f.path),
    stylesheets: sheets,
    classes: used.size,
    cssBytes: Buffer.byteLength(css),
    markupBytes: Buffer.byteLength(markup),
    sourceBytes: Buffer.byteLength(block),
    images: new Set([
      ...[...ctx.counted]
        .filter(k => k.startsWith('file:'))
        .map(k => k.slice(5)),
      ...(message.assets ?? []),
    ]).size,
    warnings,
    ...(leftOut.length > 0 ? {notCarried: leftOut} : {}),
    propValues: message.propValues ?? [],
    fromSet: message.fromSet ?? [],
    ...(pageScript ? {scriptBytes: Buffer.byteLength(pageScript), scriptModules: message.scriptModules ?? 0} : {}),
    ...(remoteSummary && remoteSummary.fetched.length + remoteSummary.failed.length > 0 ? {remoteImages: remoteSummary} : {}),
  };
}
