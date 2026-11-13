// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental render`, forward: one page module to ONE
 * self-contained static HTML file. The page renders on the server with the
 * project's own React and Astryx components; its own StyleX compiles in
 * memory; Core's stylesheets are cut to the rules the markup uses; local
 * images become data: URIs; and the page's source rides along so
 * `--reverse` can give it back exactly.
 *
 * The file needs no network and runs no script, so it works inside a
 * sandboxed frame with a strict content security policy. Its colors follow
 * `color-scheme` (and a `data-theme` of `light` or `dark` on the root), since
 * Astryx tokens use light-dark().
 *
 * @position foundation/render — called by the render subject's adapter
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fork, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {assetDataUri, isAssetBytes, isAssetPath, RenderAssetError} from './assets.mjs';
import {classesIn, cutCss, layerOrderOf} from './css-cut.mjs';
import {sourceBlock} from './source-block.mjs';
import {embeddedPathProblem} from './embedded-files.mjs';
import {resolveServed} from './served-packages.mjs';
import {CHART_CSS} from './charts.mjs';
import {HOST_EXIT} from './host-exit.mjs';

/** How long one page may take to render before it is stopped. */
export const RENDER_TIMEOUT_MS = 60_000;

export {PAGE_EXTENSIONS} from './embedded-files.mjs';

/**
 * @typedef {object} RenderWarning
 * @property {'dropped-children' | 'remote-asset' | 'missing-asset' | 'page-output' | 'page-script' | 'no-astryx-styles' | 'chart-size' | 'not-embedded' | 'node-crash'} code - What kind of problem.
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
 * @property {number} images - Local files inlined as data: URIs.
 * @property {RenderWarning[]} warnings
 * @property {{name: string, dir: string}[]} fromSet - Packages that came from the package set the CLI runs from, not the page's folder.
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
 * The nearest folder at or above `dir` with a package.json, else `dir`.
 * @param {string} dir
 */
function projectRootOf(dir) {
  let d = dir;
  for (;;) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    const up = path.dirname(d);
    if (up === d) return dir;
    d = up;
  }
}

/** @param {string} s */
const escapeHtml = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
function importParams(params) {
  const m = /^\s*(?:url\(\s*(['"]?)([\s\S]*?)\1\s*\)|(['"])([\s\S]*?)\3)\s*([\s\S]*)$/.exec(params);
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
  const sup = /^supports\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)\s*/i.exec(rest);
  if (sup) {
    supports = sup[1];
    rest = rest.slice(sup[0].length);
  }
  return {url: m[2] ?? m[4] ?? '', layer, supports, media: rest.trim()};
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
 * @param {{warnings: RenderWarning[], carried: Set<string>, included: Set<string>, packageSheets: string[], served: ServedSet | null, seen?: Set<string>}} ctx
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
    if (/^([a-z]+:)?\/\//i.test(url)) {
      ctx.warnings.push({
        code: 'remote-asset',
        message: `${path.basename(file)} imports ${url}, which a sandboxed page cannot load, so it is left out; save it beside the stylesheet and import it instead.`,
      });
      rule.remove();
      return;
    }
    if (/\.(scss|sass|less)$/i.test(url)) {
      ctx.warnings.push({
        code: 'missing-asset',
        message: `${path.basename(file)} imports ${url}, a Sass or Less stylesheet, which a render does not compile, so its styles are missing.`,
      });
      rule.remove();
      return;
    }
    const relative = path.resolve(path.dirname(file), url);
    /** @type {string | null} */
    let target;
    let fromPackage = false;
    if (/^\.{1,2}\//.test(url) || fs.existsSync(relative)) {
      target = fs.existsSync(relative) ? relative : null;
    } else {
      target = resolveServed(url.replace(/^~/, ''), file, ctx.served);
      fromPackage = target !== null;
    }
    if (!target) {
      ctx.warnings.push({
        code: 'missing-asset',
        message: `${path.basename(file)} imports ${url}, which was not found, so its styles are missing.`,
      });
      rule.remove();
      return;
    }
    if (seen.has(target) || ctx.included.has(target)) {
      rule.remove();
      return;
    }
    seen.add(target);
    ctx.included.add(target);
    if (fromPackage) ctx.packageSheets.push(url.replace(/^~/, ''));
    else ctx.carried.add(target);
    const from = target;
    let inner = expandImports(from, fs.readFileSync(from, 'utf8'), {...ctx, seen});
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
    if (parsed.supports) inner = `@supports (${parsed.supports.replace(/^\((.*)\)$/s, '$1')}){${inner}}`;
    if (parsed.media) inner = `@media ${parsed.media}{${inner}}`;
    if (parsed.layer !== null) inner = `@layer${parsed.layer ? ` ${parsed.layer}` : ''}{${inner}}`;
    try {
      rule.replaceWith(postcss.parse(inner, {from}).nodes);
    } catch (e) {
      const reason = /** @type {any} */ (e)?.reason ?? (e instanceof Error ? e.message : String(e));
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
const CRASH_SIGNALS = new Set(['SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGFPE', 'SIGABRT', 'SIGTRAP']);

/**
 * How a native crash ended a process, or null when it was not one. On
 * Windows a crash arrives as an exit status of 0xC0000000 and above (such as
 * 0xC0000005, an access violation), not as a signal.
 * @param {number | null} code
 * @param {NodeJS.Signals | null} signal
 */
function crashOf(code, signal) {
  if (signal) return CRASH_SIGNALS.has(signal) ? signal : null;
  if (code !== null && code >>> 0 >= 0xc0000000) return `0x${(code >>> 0).toString(16).toUpperCase()}`;
  return null;
}

/**
 * Whether this Node crashes when it splits text with Intl.Segmenter. Some
 * Node builds do, and Astryx components such as Avatar split text with it.
 */
function segmenterCrashes() {
  const probe = spawnSync(
    process.execPath,
    ['-e', "[...new Intl.Segmenter('en', {granularity: 'grapheme'}).segment('a b')]"],
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
  const detail = {signal: how, node: process.version, nodePath: process.execPath};
  if (!crashed) {
    const memory = how === 'SIGKILL' ? ' The system stops a process this way when the machine runs out of memory.' : '';
    return new RenderError('ERR_RENDER_FAILED', `${node} was stopped by a signal (${how}) while it rendered the page.${memory}`, detail);
  }
  const cause = withoutSegmenter ? ' It crashed again with Intl.Segmenter removed, so the fault is elsewhere in this Node or in a native module.' : '';
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
function noAnswerError({hostExit, reason, stage, elapsedMs, rssMb, freeMb, stderrTail}) {
  const detail = {reason, exit: hostExit, stage, elapsedMs, rssMb, freeMb, ...(stderrTail ? {stderrTail} : {})};
  const where = stage ? ` while ${stage}` : '';
  const seconds = Math.round((elapsedMs ?? 0) / 1000);
  if (reason === 'host-timeout') {
    return new RenderError('ERR_RENDER_TIMEOUT', `The page's process stopped at its own time limit${where}, after ${seconds} seconds, before this process read an answer.`, detail);
  }
  const last = stderrTail ? ` Its last output: ${String(stderrTail).split('\n').at(-1)}` : '';
  return new RenderError(
    'ERR_RENDER_FAILED',
    `The page stopped rendering without an answer (exit ${hostExit})${where}, after ${seconds} seconds, with ${freeMb} MB of memory free.${last}`,
    detail,
  );
}

/** The error for a host process that ended, without a signal, before it answered. */
function hostEndError(/** @type {number | null} */ code) {
  if (code === HOST_EXIT.disconnected) {
    return new RenderError('ERR_RENDER_FAILED', "The page's process lost its channel to this process and stopped without an answer.", {reason: 'disconnected', exit: code});
  }
  if (code === HOST_EXIT.noChannel) {
    return new RenderError('ERR_RENDER_FAILED', "The page's process had no channel left to send its answer on.", {reason: 'no-channel', exit: code});
  }
  if (code === HOST_EXIT.timeout) {
    return new RenderError('ERR_RENDER_TIMEOUT', "The page's process stopped at its own time limit before this process read an answer.", {reason: 'host-timeout', exit: code});
  }
  return new RenderError('ERR_RENDER_FAILED', `The page's process ended without an answer (exit ${code}).`, {reason: 'host-ended', exit: code});
}

/**
 * Run the page in a host process (page-host.mjs), stopping it after
 * `timeoutMs`. The host runs the page in a worker thread, and it exits when
 * this process goes away.
 * @param {{entry: string, root: string, served: ServedSet | null, withoutSegmenter: boolean}} input
 * @param {number} timeoutMs
 * @returns {Promise<any>} the page's answer, or `{crashed: how}` when a
 *   native crash ended the host
 */
function runWorker(input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = {
      ...input,
      served: input.served ? {dir: input.served.dir, integrations: [...input.served.integrations]} : null,
      timeoutMs,
    };
    const host = fork(fileURLToPath(new URL('./page-host.mjs', import.meta.url)), [JSON.stringify(data)], {
      // Never the CLI's own flags (such as --input-type).
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
    });
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
              ? new RenderError('ERR_RENDER_FAILED', 'The page ran out of memory while rendering.')
              : new RenderError('ERR_RENDER_FAILED', `The page could not be rendered: ${text.split('\n')[0]}`),
          );
        } else if (message?.hostExit !== undefined) {
          reject(noAnswerError(message));
        } else {
          resolve(message);
        }
      });
    });
    host.once('error', error => {
      finish(() => reject(new RenderError('ERR_RENDER_FAILED', `The page could not be rendered: ${String(error?.message ?? error).split('\n')[0]}`)));
    });
    host.once('exit', (code, signal) => {
      finish(() => {
        const crash = crashOf(code, signal);
        if (crash) resolve({crashed: crash});
        else if (signal) reject(crashError(signal, {crashed: false, withoutSegmenter: input.withoutSegmenter}));
        else reject(hostEndError(code));
      });
    });
  });
}

/**
 * Run the page. When this Node crashes in Intl.Segmenter, run it once more
 * without Intl.Segmenter and say so in a warning.
 * @param {{entry: string, root: string, served: ServedSet | null}} input
 * @param {number} timeoutMs
 * @param {RenderWarning[]} warnings
 */
async function runPage(input, timeoutMs, warnings) {
  const started = Date.now();
  const first = await runWorker({...input, withoutSegmenter: false}, timeoutMs);
  if (!first.crashed) return first;
  if (!segmenterCrashes()) throw crashError(first.crashed, {crashed: true, withoutSegmenter: false});
  const again = await runWorker({...input, withoutSegmenter: true}, Math.max(1000, timeoutMs - (Date.now() - started)));
  if (again.crashed) throw crashError(again.crashed, {crashed: true, withoutSegmenter: true});
  warnings.push(segmenterWarning());
  return again;
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
 * Inline local images (src, srcset, poster and CSS url()) as data: URIs. A
 * link (`href`) loads nothing, so it is left alone.
 * @param {string} text markup or CSS
 * @param {'html' | 'css'} kind
 * @param {{dir: string, root: string, warnings: RenderWarning[], counted: Set<string>, localAssets: Set<string>}} ctx
 */
function inlineAssets(text, kind, ctx) {
  /** @param {string} ref */
  const resolveRef = ref => {
    const clean = decodeAttr(ref).trim().split(/[?#]/)[0];
    if (!clean) return null;
    if (/^(data:|blob:|#|about:|mailto:|tel:|javascript:)/i.test(clean)) return null;
    if (/^(https?:)?\/\//i.test(clean)) {
      const key = `remote:${clean}`;
      if (!ctx.counted.has(key)) {
        ctx.counted.add(key);
        ctx.warnings.push({
          code: 'remote-asset',
          message: `${clean} is loaded from the network, which a sandboxed page cannot reach; save it beside the page and import it instead.`,
        });
      }
      return null;
    }
    if (!isAssetPath(clean)) return null;
    const candidates = clean.startsWith('/')
      ? [path.join(ctx.root, 'public', clean), path.join(ctx.root, clean)]
      : [path.resolve(ctx.dir, clean)];
    const found = candidates.find(c => fs.existsSync(c));
    if (!found) {
      const key = `missing:${clean}`;
      if (!ctx.counted.has(key)) {
        ctx.counted.add(key);
        ctx.warnings.push({
          code: 'missing-asset',
          message: `${clean} was not found next to the page, so it is left as is and will not show.`,
        });
      }
      return null;
    }
    ctx.counted.add(`file:${found}`);
    // A relative path names a file that is part of the page: carry it.
    if (!clean.startsWith('/')) ctx.localAssets.add(found);
    return assetDataUri(found);
  };
  /** @param {string} value */
  const urls = value =>
    value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, q, ref) => {
      const uri = resolveRef(ref);
      return uri ? `url("${uri}")` : whole;
    });
  if (kind === 'css') return urls(text);
  return text
    .replace(/\s(src|poster)="([^"]*)"/g, (whole, attr, ref) => {
      const uri = resolveRef(ref);
      return uri ? ` ${attr}="${uri}"` : whole;
    })
    .replace(/\ssrcset="([^"]*)"/g, (whole, set) => {
      const parts = decodeAttr(set)
        .split(',')
        .map(part => {
          const [ref, ...rest] = part.trim().split(/\s+/);
          const uri = ref ? resolveRef(ref) : null;
          return [uri ?? ref, ...rest].join(' ');
        });
      return ` srcset="${parts.join(', ').replace(/"/g, '&quot;')}"`;
    })
    .replace(/\sstyle="([^"]*)"/g, (whole, style) => {
      // The attribute holds escaped text: rewrite the CSS it means, then
      // escape it again, so a data: URI's quotes cannot end the attribute.
      const css = urls(decodeAttr(style));
      return ` style="${css.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
    });
}

/** The light and dark switch every rendered page carries. */
const SCHEME_CSS =
  ':root{color-scheme:light dark}:root[data-theme="light"]{color-scheme:light}:root[data-theme="dark"]{color-scheme:dark}';

/**
 * Render a page module to one self-contained HTML file.
 * @param {string} entry absolute path of the page module
 * @param {{title?: string, timeoutMs?: number, version?: string, served?: ServedSet | null}} [options]
 *   `served`: the Core of the package set the CLI runs from, for the packages
 *   the page's folder has no copy of
 * @returns {Promise<RenderedPage>}
 */
export async function renderPage(entry, options = {}) {
  const dir = path.dirname(entry);
  const root = projectRootOf(dir);
  const served = options.served ?? null;
  /** @type {RenderWarning[]} */
  const warnings = [];
  const message = await runPage({entry, root, served}, options.timeoutMs ?? RENDER_TIMEOUT_MS, warnings);
  if (!message.ok) {
    throw new RenderError(message.error.code, message.error.message, message.error.detail);
  }
  /** @type {string} */
  let markup = message.markup;

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
  // Package stylesheets the page imports itself, such as a theme's.
  for (const {spec, from} of /** @type {{spec: string, from: string}[]} */ (message.packageCss ?? [])) {
    if (sheets.includes(spec)) continue;
    const file = resolveServed(spec, from, served);
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

  const ctx = {dir, root, warnings, counted: new Set(), localAssets: /** @type {Set<string>} */ (new Set())};
  /** Stylesheets pulled in by another's `@import`. @type {Set<string>} */
  const carriedCss = new Set();
  try {
    markup = inlineAssets(markup, 'html', ctx);
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
    for (const m of markup.matchAll(/<(link|iframe|object|embed)\b[^>]*?\s(?:href|src|data)="([^"]*)"/gi)) {
      if (/^(data:|#)/i.test(m[2])) continue;
      warnings.push({
        code: 'remote-asset',
        message: `The page renders a <${m[1].toLowerCase()}> that loads ${m[2]}, which a sandboxed page cannot reach and which loads from the network anywhere else; remove it from the page.`,
      });
    }
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err instanceof RenderAssetError) throw new RenderError(err.code, err.message, err.detail);
    throw e;
  }
  const used = classesIn(markup);
  const layerOrder = sheetText.map(layerOrderOf).find(Boolean) ?? '';
  let css = layerOrder;
  try {
    // A stylesheet's url()s are relative to the stylesheet, not the page: a
    // theme's font, or an image beside an imported stylesheet.
    const included = new Set(sheetFiles);
    /** @type {string[]} */
    const packageSheets = [];
    /** A stylesheet's rules cut to the page, with its own imports inlined. @param {string} file @param {string} text */
    const sheet = (file, text) => {
      try {
        const own = expandImports(file, text, {warnings, carried: carriedCss, included, packageSheets, served});
        return inlineAssets(cutCss(own, used), 'css', {...ctx, dir: path.dirname(file)});
      } catch (e) {
        if (e instanceof RenderAssetError || e instanceof RenderError) throw e;
        const reason = /** @type {any} */ (e)?.reason ?? (e instanceof Error ? e.message : String(e));
        throw new RenderError(
          'ERR_RENDER_COMPILE',
          `${path.relative(dir, file).split(path.sep).join('/')} is not valid CSS: ${reason}`,
        );
      }
    };
    sheetText.forEach((text, i) => {
      css += sheet(sheetFiles[i], text);
    });
    for (const {file, css: text} of /** @type {{file: string, css: string}[]} */ (message.importedCss ?? [])) {
      css += sheet(file, text);
    }
    for (const spec of packageSheets) if (!sheets.includes(spec)) sheets.push(spec);
    if (message.css) css += inlineAssets(message.css, 'css', ctx);
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err instanceof RenderAssetError) throw new RenderError(err.code, err.message, err.detail);
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
  for (const t of /** @type {any[]} */ (message.texts ?? [])) {
    if (t.hidden || t.text.length < 2 || plainText.includes(t.text)) continue;
    // The code around it ran: other text from the same function rendered.
    const around = /** @type {string[]} */ (message.fnTexts?.[t.fn] ?? []).filter(o => o !== t.text);
    if (!around.some(o => plainText.includes(o))) continue;
    warnings.push({
      code: 'dropped-children',
      message: `<${t.component}> on line ${t.line} did not render the text "${t.text.length > 60 ? `${t.text.slice(0, 57)}...` : t.text}" it was given; it takes that text through a prop (often label=), so check its props.`,
    });
  }
  // A chart the render did not draw is an empty box: a ResponsiveContainer
  // holds only its sizing box, and a chart of fixed size an empty wrapper.
  const blankCharts =
    (markup.match(/<div class="recharts-responsive-container[" ][^>]*><div[^>]*><\/div><\/div>/g) ?? []).length +
    (markup.match(/<div\b[^>]*\bclass="recharts-wrapper"[^>]*><\/div>/g) ?? []).length +
    (message.chartsFailed ?? 0);
  if (blankCharts > 0) {
    warnings.push({
      code: 'chart-size',
      message: `${blankCharts === 1 ? 'A chart' : `${blankCharts} charts`} could not be drawn without a browser, so ${blankCharts === 1 ? 'it is' : 'they are'} empty here: the render draws a chart only when a module of the page (not an installed package) imports the chart, and its ResponsiveContainer, from recharts by name (\`import {LineChart} from 'recharts'\`).`,
    });
  }
  if (message.chartsAlone) {
    /** @type {Record<string, string>} */
    const causes = {
      changed: 'The page changed its charts once its effects ran (their data or props, or which charts it shows)',
      rerendered: 'A component that makes a chart rendered again once the page\'s effects ran',
      error: 'The page could not be drawn again without a browser',
    };
    const why = causes[message.chartsAlone] ?? causes.error;
    warnings.push({
      code: 'chart-size',
      message: `${why}, so each chart was drawn by itself, as the first render gave it: a custom tick, label or shape in a chart sees React context defaults, not the values the page provides.`,
    });
  }
  for (const sheet of /** @type {string[]} */ (message.skippedCss ?? [])) {
    warnings.push({
      code: 'missing-asset',
      message: `The page imports ${sheet}, a Sass or Less stylesheet, which a render does not compile, so its styles are missing.`,
    });
  }
  for (const log of /** @type {{level: string, text: string}[]} */ (message.logs ?? []).slice(0, 5)) {
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
  for (const sheet of carriedCss) {
    const rel = path.relative(root, sheet);
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).includes('node_modules')) continue;
    if (!files.includes(sheet)) files.push(sheet);
  }
  for (const asset of ctx.localAssets) {
    const rel = path.relative(root, asset);
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).includes('node_modules')) continue;
    if (files.includes(asset)) continue;
    // Carried only when its bytes are a known image, font or media format,
    // the same test --reverse applies, so the file always comes back.
    if (!isAssetBytes(fs.readFileSync(asset))) {
      warnings.push({
        code: 'not-embedded',
        message: `${path.relative(dir, asset).split(path.sep).join('/')} is shown inline but not carried in the file: its bytes are not a known image, font or media format, so --reverse cannot give it back.`,
      });
      continue;
    }
    files.push(asset);
  }
  // Paths are kept relative to the folder that holds every file: the page's
  // folder, or an ancestor when the page imports from above it.
  let base = dir;
  for (const f of files) {
    while (path.relative(base, f).startsWith('..')) base = path.dirname(base);
  }
  // Page first, so the reader knows which file is the page. Only files a
  // rendered page may carry are embedded (see embedded-files.mjs).
  const ordered = [entry, ...files.filter(f => f !== entry)];
  /** @type {{path: string, bytes: Buffer}[]} */
  const embedded = [];
  for (const f of ordered) {
    const rel = path.relative(base, f).split(path.sep).join('/');
    if (f !== entry && embeddedPathProblem(rel)) {
      warnings.push({
        code: 'not-embedded',
        message: `${rel} is not carried in the file (a rendered page carries the page and the local modules, stylesheets, JSON files and images it imports, but never project or tool configuration, or a file a test, story or benchmark runner would run), so --reverse cannot give it back.`,
      });
      continue;
    }
    embedded.push({path: rel, bytes: fs.readFileSync(f)});
  }
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(markup)?.[1]?.replace(/<[^>]*>/g, '').trim();
  const title = options.title ?? (heading ? decodeAttr(heading) : path.basename(entry).replace(/\.[^.]+$/, ''));
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light dark">' +
    `<meta name="generator" content="Astryx${options.version ? ` ${escapeHtml(options.version)}` : ''}">` +
    `<title>${escapeHtml(title)}</title>` +
    `<style>${SCHEME_CSS}${markup.includes('class="recharts-responsive-container"') ? CHART_CSS : ''}${css}</style></head><body>${markup}` +
    `${sourceBlock(path.basename(entry), embedded)}</body></html>\n`;
  return {
    html,
    files: embedded.map(f => f.path),
    stylesheets: sheets,
    classes: used.size,
    cssBytes: Buffer.byteLength(css),
    markupBytes: Buffer.byteLength(markup),
    images: new Set([
      ...[...ctx.counted].filter(k => k.startsWith('file:')).map(k => k.slice(5)),
      ...(message.assets ?? []),
    ]).size,
    warnings,
    fromSet: message.fromSet ?? [],
  };
}
