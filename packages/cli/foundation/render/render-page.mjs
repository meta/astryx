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
import {createRequire} from 'node:module';
import {Worker} from 'node:worker_threads';
import postcss from 'postcss';
import {assetDataUri, isAssetBytes, isAssetPath, RenderAssetError} from './assets.mjs';
import {classesIn, cutCss, layerOrderOf} from './css-cut.mjs';
import {sourceBlock} from './source-block.mjs';
import {embeddedPathProblem} from './embedded-files.mjs';

/** How long one page may take to render before it is stopped. */
export const RENDER_TIMEOUT_MS = 60_000;

export {PAGE_EXTENSIONS} from './embedded-files.mjs';

/**
 * @typedef {object} RenderWarning
 * @property {'dropped-children' | 'remote-asset' | 'missing-asset' | 'page-output' | 'page-script' | 'no-astryx-styles' | 'chart-size' | 'not-embedded'} code - What kind of problem.
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
 * @param {{warnings: RenderWarning[], carried: Set<string>, included: Set<string>, packageSheets: string[], seen?: Set<string>}} ctx
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
      try {
        target = createRequire(file).resolve(url.replace(/^~/, ''));
        fromPackage = true;
      } catch {
        target = null;
      }
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

/**
 * Run the page in a worker, stopping it after `timeoutMs`.
 * @param {string} entry
 * @param {string} root
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function runWorker(entry, root, timeoutMs) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./page-worker.mjs', import.meta.url), {
      workerData: {entry, root},
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: {maxOldGenerationSizeMb: 4096},
    });
    // The page's own writes to stdout/stderr never reach the CLI's output.
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      reject(
        new RenderError(
          'ERR_RENDER_TIMEOUT',
          `The page did not finish rendering within ${timeoutMs / 1000} seconds, so it was stopped. Look for a loop that never ends or a promise the page waits on.`,
          {seconds: timeoutMs / 1000},
        ),
      );
    }, timeoutMs);
    worker.once('message', message => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(message);
    });
    worker.once('error', (/** @type {any} */ error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out =
        /ERR_WORKER_OUT_OF_MEMORY|heap out of memory/.test(String(error?.message ?? error))
          ? new RenderError('ERR_RENDER_FAILED', 'The page ran out of memory while rendering.')
          : new RenderError('ERR_RENDER_FAILED', `The page could not be rendered: ${String(error?.message ?? error).split('\n')[0]}`);
      reject(out);
    });
    worker.once('exit', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new RenderError('ERR_RENDER_FAILED', `The page stopped rendering without an answer (exit ${code}).`));
    });
  });
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
 * @param {{title?: string, timeoutMs?: number, version?: string}} [options]
 * @returns {Promise<RenderedPage>}
 */
export async function renderPage(entry, options = {}) {
  const dir = path.dirname(entry);
  const root = projectRootOf(dir);
  const message = await runWorker(entry, root, options.timeoutMs ?? RENDER_TIMEOUT_MS);
  /** @type {RenderWarning[]} */
  const warnings = [];
  if (!message.ok) {
    throw new RenderError(message.error.code, message.error.message, message.error.detail);
  }
  /** @type {string} */
  let markup = message.markup;

  // Stylesheets: Core's reset and components, plus each official package's
  // own stylesheet the page imports from.
  const req = createRequire(entry);
  /** @type {string[]} */
  const sheets = [];
  /** @type {string[]} */
  const sheetText = [];
  /** Each stylesheet's own file, so its url()s resolve from its folder. @type {string[]} */
  const sheetFiles = [];
  /** @param {string} spec */
  const addSheet = spec => {
    try {
      const file = req.resolve(spec);
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
    try {
      const file = createRequire(from).resolve(spec);
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
      message:
        '@astryxdesign/core is not installed where the page is, so the page has no Astryx styles; install it, or render from inside the project.',
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
        const own = expandImports(file, text, {warnings, carried: carriedCss, included, packageSheets});
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
  for (const f of /** @type {string[]} */ (message.files ?? [])) {
    const src = fs.readFileSync(f, 'utf8');
    if (/\bResponsiveContainer\b/.test(src)) {
      warnings.push({
        code: 'chart-size',
        message: `${path.basename(f)} sizes a chart with ResponsiveContainer, which has no size until a browser measures it, so the chart is empty here; give the chart a fixed width and height.`,
      });
      break;
    }
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
    `<style>${SCHEME_CSS}${css}</style></head><body>${markup}` +
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
  };
}
