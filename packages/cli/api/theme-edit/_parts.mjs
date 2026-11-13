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
 * @position api/theme-edit — part data for the checks, and `how`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {importPathOf, installLine, literals} from './_project.mjs';
import {removeEmptyFolder} from './_palette.mjs';
import {VOID} from '../../foundation/render/html-reader.mjs';
import {
  RENDER_TIMEOUT_MS,
  renderPage,
  RenderError,
} from '../../foundation/render/render-page.mjs';
import {SAMPLE_PAGE, elementNames, pageSource} from './_catalog.mjs';

/** Bump when the shape of the cached part data changes. */
const PART_DATA_VERSION = 4;

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
 * A sample value for a required prop the doc declares, from its type: the
 * component's name for text, false for a flag, the first value of a union.
 * Undefined for a type with no plain sample, such as a function.
 * @param {string} name
 * @param {string} type
 * @returns {unknown}
 */
function sampleOf(name, type) {
  if (type.includes('=>')) return undefined;
  // Null and undefined are the absence of a value, never a sample.
  const t = type
    .split('|')
    .map(x => x.trim())
    .filter(x => x !== 'null' && x !== 'undefined')
    .join(' | ');
  if (t === 'string' || /ReactNode$/.test(t)) return name;
  if (t === 'boolean') return false;
  if (t === 'number') return 1;
  const words = literals(t);
  if (words.length) return words[0];
  if (/^\d+(\s*\|\s*\d+)*$/.test(t)) return Number(t.split('|')[0]);
  return undefined;
}

/**
 * Three items made from the element the doc suggests for a group's
 * children, each with its own label and value; the first takes the group's
 * value, so it shows selected.
 * @param {{__element: string, props?: Record<string, unknown>, children?: unknown}} slot
 * @param {unknown} selected
 */
function slotItems(slot, selected) {
  return [1, 2, 3].map(i => {
    const props = {...(slot.props ?? {})};
    if (typeof props.label === 'string') props.label = `${props.label} ${i}`;
    if ('value' in props || typeof selected === 'string')
      props.value =
        i === 1 && typeof selected === 'string'
          ? selected
          : `${String(props.value ?? 'item')}-${i}`;
    return {...slot, props};
  });
}

/**
 * The props a component renders with: its doc's playground defaults, or,
 * for a doc with none (an older Core), a sample for each required prop.
 * A group with no children gets three of the items its doc suggests. Null
 * for a doc with no defaults that has no theming targets (a hook or a
 * helper), or that is a part its parent lists as an item: it works only
 * inside the parent, whose own entry shows it.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} name
 * @returns {Record<string, unknown> | null}
 */
export function demoProps(project, name) {
  const info = project.components[name];
  const given =
    info.defaults && typeof info.defaults === 'object'
      ? /** @type {Record<string, unknown>} */ ({...info.defaults})
      : null;
  if (
    !given &&
    // Only a component a theme styles: hooks, providers and helpers have
    // docs too, and render nothing.
    (!/^[A-Z]/.test(name) ||
      !info.targets.length ||
      // A doc that declares no props of its own name is a family page,
      // not a component the Core exports.
      !Object.keys(info.props ?? {}).length ||
      needsParent(project, name))
  )
    return null;
  const props = given ?? {};
  if (!given)
    for (const [p, d] of Object.entries(info.props ?? {})) {
      if (!d.required || /^on[A-Z]/.test(p)) continue;
      if (p === 'children' && d.slots.length) continue;
      const v = sampleOf(name, d.type);
      // A required prop with no plain sample, such as a render function:
      // the component cannot be shown from its doc alone.
      if (v === undefined) return null;
      props[p] = v;
    }
  const kids = info.props?.children;
  const slot = kids?.slots?.[0];
  if (!('children' in props) && kids) {
    if (slot?.__element && (kids.required || slot.__element.startsWith(name))) {
      if (info.props.value && !('value' in props) && slot.props?.value != null)
        props.value = `${String(slot.props.value)}-1`;
      props.children = slotItems(slot, props.value);
    }
  }
  return props;
}

/**
 * Whether a part works only inside its parent: its parent lists it as an
 * item, or it is a piece of its parent by name (TableBody of Table) and
 * its doc gives no playground of its own.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} name
 */
export function needsParent(project, name) {
  const info = project.components[name];
  const parent = info?.subComponentOf;
  if (!parent) return false;
  if (isItemOf(project, name)) return true;
  const own = info.defaults && typeof info.defaults === 'object';
  return !own && name.startsWith(parent) && name !== parent;
}

/**
 * Whether a part's parent lists it as an item of its children.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} name
 */
export function isItemOf(project, name) {
  const parent = project.components[name]?.subComponentOf;
  const slots = parent
    ? (project.components[parent]?.props?.children?.slots ?? [])
    : [];
  return slots.some(s => s?.__element === name);
}

/**
 * A component's catalog entries, all from its doc: its demo props
 * ({@link demoProps}), then once per value of each visual prop with a
 * closed set of values (`variant`, `status`, `color`, and a number union
 * such as a heading's level), and its checked and disabled states. An
 * overlay the playground shows in place renders open; on a page people
 * see, once, as some of its variants size the window, not the card.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} name
 * @param {number} cap at most this many
 * @param {{shown?: boolean}} [opts] `shown`: for a page people see
 * @returns {Array<{label: string, props: Record<string, unknown>}>}
 */
export function catalogVariants(project, name, cap, opts = {}) {
  const info = project.components[name];
  const demo = demoProps(project, name);
  if (!demo) return [];
  // An overlay shown open never takes focus: on a page of many, each would
  // pull the page to itself as it opens.
  /** @param {Record<string, unknown>} d @returns {Record<string, unknown>} */
  const opened = d => ({
    ...d,
    ...('isOpen' in d ? {} : {isOpen: true}),
    ...(info.props?.hasAutoFocus ? {hasAutoFocus: false} : {}),
  });
  if (info.opens && opts.shown) return [{label: '', props: opened(demo)}];
  const base = info.opens ? opened(demo) : demo;
  const values = info.targets[0]?.values ?? {};
  const variants = [{label: '', props: base}];
  for (const p of ['variant', 'status', 'color'])
    for (const v of values[p] ?? [])
      variants.push({
        label: v,
        // A status like `{type: 'error', message?: string}` takes the
        // value as its `type`; the bare string breaks the component.
        props: {
          ...base,
          [p]: info.props?.[p]?.type.startsWith('{') ? {type: v} : v,
        },
      });
  // The states the doc names that a prop sets: checked (a boolean value)
  // and disabled. The label says the state shown.
  const states = new Set(info.targets.flatMap(t => t.states ?? []));
  if (states.has('checked') && info.props?.value?.type.startsWith('boolean')) {
    const on = base.value !== true;
    variants.push({
      label: on ? 'on' : 'off',
      props: {
        ...base,
        value: on,
        ...(typeof base.label === 'string' ? {label: on ? 'On' : 'Off'} : {}),
      },
    });
  }
  if (states.has('disabled') && info.props?.isDisabled)
    variants.push({label: 'disabled', props: {...base, isDisabled: true}});
  for (const p of Object.keys(values)) {
    const type = info.props?.[p]?.type ?? '';
    if (!/^\s*\d+(\s*\|\s*\d+)*\s*$/.test(type)) continue;
    for (const n of type.split('|').map(Number))
      if (n !== base[p])
        variants.push({label: `${p} ${n}`, props: {...base, [p]: n}});
  }
  return variants.slice(0, cap);
}

/**
 * The catalog: each component with playground defaults, once per visual
 * variant value ({@link catalogVariants}), and the sample page.
 * @param {import('./_project.mjs').ThemeProject} project
 * @returns {{items: import('./_catalog.mjs').CatalogItem[], imports: Record<string, string>}}
 */
export function catalogItems(project) {
  /** @type {import('./_catalog.mjs').CatalogItem[]} */
  const items = [];
  for (const name of Object.keys(project.components))
    for (const v of catalogVariants(project, name, 16))
      items.push({
        name,
        label: v.label,
        tree: {__element: name, props: v.props},
      });
  /** @type {Record<string, string>} */
  const imports = {};
  for (const n of elementNames([items.map(i => i.tree), SAMPLE_PAGE])) {
    const spec = importPathOf(project, n);
    if (spec) imports[n] = spec;
  }
  return {items, imports};
}

/**
 * What of React the project cannot resolve (react, react-dom/server), to
 * render the editor's pages; empty when both resolve.
 * @param {string} cwd
 * @returns {string[]}
 */
export function reactMissing(cwd) {
  const req = createRequire(path.join(cwd, 'package.json'));
  return ['react', 'react-dom/server'].filter(m => {
    try {
      req.resolve(m);
      return false;
    } catch {
      return true;
    }
  });
}

/** How long the editor's own pages may take to render. */
const EDITOR_RENDER_MS = 3 * RENDER_TIMEOUT_MS;

/** One name per process, so two commands at once never share a folder. */
const RUN = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The folder generated pages render from: inside the project but outside
 * node_modules, so the render compiles them and their stylesheet imports as
 * the project's own. Its name is this process's own, and it is removed
 * after each render.
 * @param {import('./_project.mjs').ThemeProject} project
 */
export const renderDir = project =>
  path.join(project.cwd, 'themes', `.astryx-render-${RUN}`);

/**
 * Remove render folders a stopped command left (killed, out of memory):
 * only `.astryx-render-<pid>-<random>` folders more than ten minutes old.
 * Links are never followed.
 * @param {string} themes
 */
function sweepRenders(themes) {
  let names;
  try {
    names = fs.readdirSync(themes);
  } catch {
    return;
  }
  for (const n of names) {
    const m = /^\.astryx-render-(\d+)-[a-z0-9]+$/.exec(n);
    if (!m || Number(m[1]) === process.pid) continue;
    const p = path.join(themes, n);
    // A process id from another process space may look gone or alive here,
    // so age decides: a render takes at most three minutes, and a folder
    // older than ten is a leftover.
    /** @type {number} */
    let age;
    try {
      age = Date.now() - fs.lstatSync(p).mtimeMs;
    } catch {
      continue;
    }
    if (age < 10 * 60_000) continue;
    try {
      if (fs.lstatSync(p).isDirectory())
        fs.rmSync(p, {recursive: true, force: true});
    } catch {
      // Gone already.
    }
  }
}

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
  // A lookup in an app with no themes must not leave a themes/ folder.
  const themes = path.dirname(dir);
  // A themes/ folder that holds only other renders was made by another
  // lookup running beside this one, so it is ours to remove too.
  sweepRenders(themes);
  const madeThemes =
    !fs.existsSync(themes) ||
    (() => {
      const names = fs.readdirSync(themes);
      return (
        names.length > 0 && names.every(n => n.startsWith('.astryx-render-'))
      );
    })();
  fs.mkdirSync(dir, {recursive: true});
  // Stopped by a signal, the render folder still goes.
  const cleanup = () => fs.rmSync(dir, {recursive: true, force: true});
  const onSignal = (/** @type {NodeJS.Signals} */ sig) => {
    cleanup();
    process.kill(process.pid, sig);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const entry = path.join(dir, file);
  // Demo images point at the docs site's own folder (`/template-assets/…`),
  // which a page opened from disk cannot reach: the inline placeholder
  // takes their place, as when a template is scaffolded.
  const {stripTemplateAssetRefs} =
    await import('../../foundation/discovery/template-adapter.mjs');
  fs.writeFileSync(entry, stripTemplateAssetRefs(source));
  for (const x of extra) {
    fs.mkdirSync(path.dirname(path.join(dir, x.name)), {recursive: true});
    fs.copyFileSync(x.from, path.join(dir, x.name));
  }
  try {
    // The editor's pages render every component, and a busy machine slows
    // them down: they get three times the page limit.
    const page = await renderPage(entry, {
      title: file.replace(/\.[^.]+$/, ''),
      timeoutMs: EDITOR_RENDER_MS,
    });
    // The page is the same whichever command rendered it: the folder's
    // per-process name never reaches the file.
    const html = page.html.split(path.basename(dir)).join('.astryx-render');
    const body = html.slice(html.indexOf('<body>') + 6);
    const end = body.indexOf('<script type=');
    return {html, markup: end >= 0 ? body.slice(0, end) : body};
  } catch (e) {
    if (e instanceof RenderError) {
      const missing = e.code === 'ERR_RENDER_MISSING_DEPENDENCY';
      // A render stopped by its time limit on the editor's own page is the
      // machine being busy, not a loop in the page.
      const slow = e.code === 'ERR_RENDER_TIMEOUT';
      throw new AstryxError(
        slow
          ? `The components did not finish rendering within ${EDITOR_RENDER_MS / 1000} seconds, so the render was stopped. The theme files are written; only its pages were not rendered. The machine may be busy: run show again when it is less loaded.`
          : `Could not render the components with this project's React: ${e.message}${missing ? ' The theme command renders components on the server, so react and react-dom must be installed.' : ''}`,
        missing
          ? [
              {
                name: installLine(project.cwd, ['react', 'react-dom']),
                reason: 'install them',
              },
            ]
          : [],
        missing
          ? ERROR_CODES.ERR_RENDER_MISSING_DEPENDENCY
          : ERROR_CODES.ERR_RENDER_FAILED,
      );
    }
    throw e;
  } finally {
    // Only this render's files go; the folder goes when nothing else is in
    // it, so a render running beside this one keeps its own.
    for (const f of [entry, ...extra.map(x => path.join(dir, x.name))])
      fs.rmSync(f, {force: true});
    // Another render may still use it: a folder with a file in it stays.
    removeEmptyFolder(madeThemes ? themes : dir, {deep: true});
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = v => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The part data for the installed Core, from the cache or built now.
 * @param {import('./_project.mjs').ThemeProject} project
 * @returns {Promise<PartData>}
 */
export async function partData(project) {
  const file = path.join(project.cacheDir, 'parts.json');
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A file that parses but has the wrong shape (a hand edit, a cut-off
    // write) is built again, as a file that does not parse is.
    if (
      cached.version === PART_DATA_VERSION &&
      cached.coreKey === project.coreKey &&
      isRecord(cached.map) &&
      Object.values(cached.map).every(isRecord) &&
      Array.isArray(cached.pairs)
    )
      return cached;
  } catch {
    // Not built yet, or unreadable: build it.
  }
  const data = await buildPartData(project);
  try {
    fs.mkdirSync(project.cacheDir, {recursive: true});
    // Write beside it and rename, so a reader never sees half a file.
    const part = `${file}.${RUN}`;
    fs.writeFileSync(part, JSON.stringify(data));
    fs.renameSync(part, file);
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

/** @type {Map<string, Set<string>>} */
const multipliedCache = new Map();

/**
 * The tokens Core's stylesheet multiplies by another value inside calc()
 * (`var(--text-body-size) * var(--text-body-leading)`): a unit there makes
 * the declaration invalid. Empty with no stylesheet.
 * @param {any} project
 * @returns {Set<string>}
 */
export function multipliedTokens(project) {
  /** @type {string} */
  let file;
  try {
    file = project.req.resolve('@astryxdesign/core/astryx.css');
  } catch {
    return new Set();
  }
  const cached = multipliedCache.get(file);
  if (cached) return cached;
  const css = fs.readFileSync(file, 'utf8');
  /** @type {Set<string>} */
  const out = new Set();
  // Each side of a `*` on its own, so `a * b * c` names all three.
  for (const m of css.matchAll(/var\((--[a-z0-9-]+)\)(?=\s*\*)/gi))
    out.add(m[1].toLowerCase());
  for (const m of css.matchAll(/\*\s*var\((--[a-z0-9-]+)\)/gi))
    out.add(m[1].toLowerCase());
  multipliedCache.set(file, out);
  return out;
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
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
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
