// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What each themeable part reads, derived from the installed Core
 * itself: render a catalog of every component on the server with the
 * project's own React (the machinery of `astryx experimental render`), then
 * join each element's classes to the rules in Core's shipped stylesheet.
 * The result names, for every part, the CSS properties it sets and the
 * public tokens that feed each one (under which variant or state), the parts
 * inside it, the variant values seen, and the real text-on-background pairs.
 *
 * It needs no browser. It is cached per Core version (and stylesheet) under
 * node_modules/.cache/astryx-theme/, so it is built once per install.
 *
 * @position api/theme-edit — part data for the checks, `how`, and `explain`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {importPathOf} from './_project.mjs';
import {renderPage, RenderError} from '../../foundation/render/render-page.mjs';
import {
  EXTRA,
  OPEN_OVERLAYS,
  SAMPLE_PAGE,
  elementNames,
  pageSource,
} from './_catalog.mjs';

/** Bump when the shape of the cached part data changes. */
const PART_DATA_VERSION = 3;

/**
 * @typedef {object} PartRecord
 * @property {Record<string, {tokens: Record<string, string[]>, values: string[]}>} own - property -> tokens (with conditions) and raw values
 * @property {Record<string, string[]>} inside - tokens read by unnamed elements inside the part -> properties
 * @property {Record<string, string[]>} attrs - data attributes seen on the part
 * @property {string[]} contains - parts rendered inside it
 */

/**
 * @typedef {{target: string | null, tokens: string[], raw: string | null}} PaintSide
 * @typedef {{text: string, fg: PaintSide, bg: PaintSide, sample: string}} TextPair
 * @typedef {{version: number, coreKey: string, map: Record<string, PartRecord>, pairs: TextPair[], rendered: number, items: number}} PartData
 */

/**
 * The catalog: each component with playground defaults once per visual
 * variant value, the hand-made extras, and the sample page.
 * @param {import('./_project.mjs').ThemeProject} project
 * @returns {{items: import('./_catalog.mjs').CatalogItem[], imports: Record<string, string>}}
 */
export function catalogItems(project) {
  /** @type {import('./_catalog.mjs').CatalogItem[]} */
  const items = [];
  for (const [name, info] of Object.entries(project.components)) {
    const defaults = /** @type {any} */ (info.defaults);
    if (!defaults || typeof defaults !== 'object') continue;
    const values = info.targets[0]?.values ?? {};
    /** @type {Array<Record<string, string>>} */
    const variants = [{}];
    for (const p of ['variant', 'status', 'color'])
      for (const v of values[p] ?? []) variants.push({[p]: v});
    for (const v of variants.slice(0, 16)) {
      const label = Object.values(v).join(' ');
      items.push({
        name,
        label,
        tree: {__element: name, props: {...defaults, ...v}},
      });
    }
  }
  for (const [name, list] of [...EXTRA, ...OPEN_OVERLAYS])
    for (const [label, tree] of list) items.push({name, label, tree});
  /** @type {Record<string, string>} */
  const imports = {};
  for (const n of elementNames([items.map(i => i.tree), SAMPLE_PAGE])) {
    const spec = importPathOf(project, n);
    if (spec) imports[n] = spec;
  }
  return {items, imports};
}

/**
 * The folder generated pages render from: inside the project but outside
 * node_modules, so the render compiles them and their stylesheet imports as
 * the project's own. It is removed after each render.
 * @param {import('./_project.mjs').ThemeProject} project
 */
export const renderDir = project =>
  path.join(project.cwd, 'themes', '.astryx-render');

/**
 * Render a generated page module and give its HTML and markup (the body,
 * without the embedded source block).
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} file name inside the render folder
 * @param {string} source
 * @param {Array<{name: string, from: string}>} [extra] files copied beside it
 * @returns {Promise<{html: string, markup: string}>}
 */
export async function renderGenerated(project, file, source, extra = []) {
  const dir = renderDir(project);
  fs.mkdirSync(dir, {recursive: true});
  const entry = path.join(dir, file);
  fs.writeFileSync(entry, source);
  for (const x of extra) {
    fs.mkdirSync(path.dirname(path.join(dir, x.name)), {recursive: true});
    fs.copyFileSync(x.from, path.join(dir, x.name));
  }
  try {
    const page = await renderPage(entry, {title: file.replace(/\.[^.]+$/, '')});
    const body = page.html.slice(page.html.indexOf('<body>') + 6);
    const end = body.indexOf('<script type=');
    return {html: page.html, markup: end >= 0 ? body.slice(0, end) : body};
  } catch (e) {
    if (e instanceof RenderError) {
      const missing = e.code === 'ERR_RENDER_MISSING_DEPENDENCY';
      throw new AstryxError(
        `Could not render the components with this project's React: ${e.message}${missing ? ' The theme command renders components on the server, so react and react-dom must be installed.' : ''}`,
        [],
        missing
          ? ERROR_CODES.ERR_RENDER_MISSING_DEPENDENCY
          : ERROR_CODES.ERR_RENDER_FAILED,
      );
    }
    throw e;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

/**
 * The part data for the installed Core, from the cache or built now.
 * @param {import('./_project.mjs').ThemeProject} project
 * @returns {Promise<PartData>}
 */
export async function partData(project) {
  const file = path.join(project.cacheDir, 'parts.json');
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      cached.version === PART_DATA_VERSION &&
      cached.coreKey === project.coreKey
    )
      return cached;
  } catch {
    // Not built yet, or unreadable: build it.
  }
  const data = await buildPartData(project);
  try {
    fs.mkdirSync(project.cacheDir, {recursive: true});
    fs.writeFileSync(file, JSON.stringify(data));
  } catch {
    // A read-only node_modules: build it again next time.
  }
  return data;
}

/**
 * Build the part data: render the catalog, then walk its markup.
 * @param {import('./_project.mjs').ThemeProject} project
 * @returns {Promise<PartData>}
 */
async function buildPartData(project) {
  const {items, imports} = catalogItems(project);
  const all = [...items, {name: 'sample-page', label: '', tree: SAMPLE_PAGE}];
  const {markup} = await renderGenerated(
    project,
    'catalog.mjs',
    pageSource({items: all, imports, theme: null, layout: 'catalog'}),
  );
  let css = '';
  try {
    css = fs.readFileSync(
      project.req.resolve('@astryxdesign/core/astryx.css'),
      'utf8',
    );
  } catch {
    // No stylesheet: every part reads nothing.
  }
  const tokens = new Set(Object.keys(project.core.tokenDefaults ?? {}));
  const result = walkMarkup(markup, declarations(css), tokens);
  return {
    version: PART_DATA_VERSION,
    coreKey: project.coreKey,
    ...result,
    rendered: (markup.match(/<section data-cat=/g) ?? []).length,
    items: all.length,
  };
}

/**
 * Atomic class -> its declarations, with the condition (pseudo-class,
 * attribute) each one applies under.
 * @param {string} css
 * @returns {Map<string, Array<{prop: string, value: string, cond: string}>>}
 */
export function declarations(css) {
  /** @type {Map<string, Array<{prop: string, value: string, cond: string}>>} */
  const decls = new Map();
  for (const m of css.matchAll(
    /\.(x[a-z0-9]+)((?:\.x[a-z0-9]+|[:[][^{]*)?)\{([^{}]*)\}/g,
  )) {
    const [, cls, rest, body] = m;
    const cond = rest
      .replace(/\.x[a-z0-9]+/g, '')
      .replace(/:not\(#\\#\)/g, '')
      .replace(/:where\([^)]*\)\)?/g, '')
      .trim();
    for (const d of body.split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const prop = d.slice(0, i).trim();
      const value = d.slice(i + 1).trim();
      if (!prop) continue;
      const list = decls.get(cls) ?? [];
      list.push({prop, value, cond});
      decls.set(cls, list);
    }
  }
  return decls;
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** @param {string} v */
const refs = v => [...v.matchAll(/var\((--[a-zA-Z0-9_-]+)/g)].map(m => m[1]);

/**
 * The public tokens a value reads, following private variables set on the
 * element or its ancestors.
 * @param {string} v
 * @param {Record<string, string>} env
 * @param {Set<string>} tokens
 * @param {Set<string>} [seen]
 * @param {number} [depth]
 * @returns {Set<string>}
 */
function expand(v, env, tokens, seen = new Set(), depth = 0) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const r of refs(v)) {
    if (tokens.has(r)) out.add(r);
    else if (env[r] && !seen.has(r) && depth < 8) {
      seen.add(r);
      for (const t of expand(env[r], env, tokens, seen, depth + 1)) out.add(t);
    }
  }
  return out;
}

/**
 * Walk server-rendered markup: for each element, its classes' declarations
 * become what its part reads; text records the color pair it sits on.
 * @param {string} html
 * @param {ReturnType<typeof declarations>} decls
 * @param {Set<string>} tokens
 * @returns {{map: Record<string, PartRecord>, pairs: TextPair[]}}
 */
export function walkMarkup(html, decls, tokens) {
  /** @type {Record<string, {own: Record<string, {tokens: Record<string, Set<string>>, values: Set<string>}>, inside: Record<string, Set<string>>, attrs: Record<string, Set<string>>, contains: Set<string>}>} */
  const map = {};
  /** @type {Array<{env: Record<string, string>, target: string | null, fg: PaintSide | null, bg: PaintSide | null}>} */
  const stack = [{env: {}, target: null, fg: null, bg: null}];
  /** @type {Map<string, TextPair>} */
  const pairs = new Map();
  let inSample = false;
  for (const m of html.matchAll(
    /([^<]+)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g,
  )) {
    const [, text, close, tag, attrs, selfClose] = m;
    if (text !== undefined) {
      const top = stack[stack.length - 1];
      const t = text.trim();
      if (t && top.target && top.fg && top.bg && !/^skip to/i.test(t)) {
        const k = `${top.target}|${top.fg.target}:${top.fg.tokens.join('+') || top.fg.raw}|${top.bg.target}:${top.bg.tokens.join('+') || top.bg.raw}`;
        pairs.set(k, {
          text: top.target,
          fg: top.fg,
          bg: top.bg,
          sample: t.slice(0, 30),
        });
      }
      continue;
    }
    if (!close && tag === 'section')
      inSample = /data-cat="sample-page"/.test(attrs);
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    void inSample;
    const cls = (/class="([^"]*)"/.exec(attrs)?.[1] ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const dataAttrs = Object.fromEntries(
      [
        ...attrs.matchAll(
          /data-(variant|status|size|selected|state|elevation|tone|color|level|weight)="([^"]*)"/g,
        ),
      ].map(x => [x[1], x[2]]),
    );
    const parent = stack[stack.length - 1];
    const env = {...parent.env};
    const own = cls.flatMap(c => decls.get(c) ?? []);
    for (const d of own)
      if (d.prop.startsWith('--') && !d.cond) env[d.prop] = d.value;
    const named = cls.filter(
      c => c.startsWith('astryx-') && !c.startsWith('astryx-theme'),
    );
    const target = named[0]?.slice(7) ?? parent.target;
    const ownsTarget = named.length > 0;
    if (target) {
      const T = (map[target] ??= {
        own: {},
        inside: {},
        attrs: {},
        contains: new Set(),
      });
      if (ownsTarget)
        for (const [k, v] of Object.entries(dataAttrs))
          (T.attrs[k] ??= new Set()).add(v);
      const cond0 = Object.entries(dataAttrs)
        .map(([k, v]) => `${k}=${v}`)
        .join(',');
      for (const d of own) {
        if (d.prop.startsWith('--')) continue;
        const toks = expand(d.value, env, tokens);
        const cond = [cond0, d.cond].filter(Boolean).join(' ');
        if (ownsTarget) {
          const P = (T.own[d.prop] ??= {tokens: {}, values: new Set()});
          P.values.add(
            d.value.length > 80 ? `${d.value.slice(0, 80)}...` : d.value,
          );
          for (const t of toks)
            (P.tokens[t] ??= new Set()).add(cond || 'always');
        } else for (const t of toks) (T.inside[t] ??= new Set()).add(d.prop);
      }
    }
    let fg = parent.fg;
    let bg = parent.bg;
    for (const d of own) {
      if (d.cond) continue;
      if (
        d.prop === 'color' &&
        !/^(inherit|currentcolor|unset|initial)$/i.test(d.value)
      ) {
        const t = [...expand(d.value, env, tokens)];
        fg = {target, tokens: t, raw: t.length ? null : d.value};
      }
      if (d.prop === 'background-color') {
        const t = [...expand(d.value, env, tokens)];
        if (t.length || !/transparent/.test(d.value))
          bg = {target, tokens: t, raw: t.length ? null : d.value};
      }
    }
    if (ownsTarget && target)
      for (const anc of stack)
        if (anc.target && anc.target !== target)
          map[anc.target].contains.add(target);
    if (!selfClose && !VOID.has(tag.toLowerCase()))
      stack.push({env, target, fg, bg});
  }
  /** @type {Record<string, PartRecord>} */
  const out = {};
  for (const [t, v] of Object.entries(map)) {
    out[t] = {
      own: Object.fromEntries(
        Object.entries(v.own).map(([p, x]) => [
          p,
          {
            tokens: Object.fromEntries(
              Object.entries(x.tokens).map(([k, s]) => [
                k,
                [...s].slice(0, 12),
              ]),
            ),
            values: [...x.values].slice(0, 6),
          },
        ]),
      ),
      inside: Object.fromEntries(
        Object.entries(v.inside).map(([k, s]) => [k, [...s]]),
      ),
      attrs: Object.fromEntries(
        Object.entries(v.attrs).map(([k, s]) => [k, [...s]]),
      ),
      contains: [...v.contains],
    };
  }
  return {map: out, pairs: [...pairs.values()]};
}
