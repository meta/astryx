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
import * as os from 'node:os';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
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
import {
  SAMPLE_PAGE,
  SAMPLE_SOURCE,
  elementNames,
  pageSource,
} from './_catalog.mjs';
import {removeOnStop} from '../../foundation/fs/stop-cleanup.mjs';

/**
 * A fingerprint of a module and every file it imports by a relative path,
 * read once: what a cache built by that code is keyed by, so any change to
 * the code builds it again, with no number to bump by hand (the installed
 * Core is the cache folder's own key).
 * @param {string} url the module's own `import.meta.url`
 */
export function codeFingerprint(url) {
  const hash = createHash('sha256');
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} file */
  const walk = file => {
    if (seen.has(file)) return;
    seen.add(file);
    /** @type {string} */
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch {
      return;
    }
    hash.update(`${path.basename(file)}\0${src}\0`);
    for (const m of src.matchAll(
      /(?:\bfrom|\bimport\s*\(?)\s*['"](\.{1,2}\/[^'"]+)['"]/g,
    ))
      walk(path.resolve(path.dirname(file), m[1]));
  };
  walk(fileURLToPath(url));
  return hash.digest('hex').slice(0, 16);
}

/** What the cached part data is built by ({@link codeFingerprint}). */
const CENSUS_KEY = codeFingerprint(import.meta.url);

/**
 * Flags that change what a component does or whether it shows, not how it
 * looks: the catalog never turns them on (disabled has its own entry).
 */
const LIFECYCLE_FLAGS = new Set([
  'isDisabled',
  'isOpen',
  'isDefaultOpen',
  'hasAutoFocus',
  'isHidden',
]);

/**
 * @typedef {object} PartRecord
 * @property {Record<string, {tokens: Record<string, string[]>, values: string[]}>} own - property -> tokens (with conditions) and raw values
 * @property {Record<string, Record<string, string>>} [at] - property -> the value under each condition, private variables resolved
 * @property {Record<string, string[]>} inside - tokens read by unnamed elements inside the part -> properties
 * @property {Record<string, string[]>} attrs - data attributes seen on the part
 * @property {string[]} contains - parts rendered inside it
 * @property {Record<string, string[]>} [holdsVariants] - for a part rendered inside it, the variants it is drawn in there (a toast's close button: ghost)
 * @property {string[]} [tags] - the elements it is rendered as (`tr` for a table row)
 * @property {string} [underInput] - drawn under an invisible native input
 *   laid over it (a checkbox's box), which takes its pointer and focus: the
 *   part that holds that input (empty when none is themed)
 * @property {string[]} [innerCorners] - the radius tokens of the corners Core draws by place on the parts directly inside it (a button group's end buttons)
 * @property {Record<string, string[]>} [held] - the tokens the parts inside it draw with there, at rest, and the properties they set with each
 * @property {string[]} [line] - the properties a line inside it with no target of its own draws (a divider's line), recorded as the part's: a setting on the part's own element does not reach them
 * @property {boolean} [media] - Core's media surface sits inside it (a toast's inverted surface), setting the text tokens of what it holds from --color-on-dark and --color-on-light
 * @property {string[]} [mediaSides] - the sides that media surface took where the census drew it (`dark`, `light`)
 * @property {Record<string, Record<string, string>>} [inline] - state ('' for always) -> property -> the token Core paints it with as an inline style, which no theme rule can replace
 */

/**
 * @typedef {{target: string | null, tokens: string[], raw: string | null}} PaintSide
 * @typedef {{text: string, fg: PaintSide, bg: PaintSide, sample: string, over?: PaintSide, within?: string[]}} TextPair
 *   `over`: the region the part sits in (a header), whose background shows
 *   through a see-through background of the part's own, else the page
 * @typedef {{censusKey: string, coreKey: string, map: Record<string, PartRecord>, pairs: TextPair[], rendered: number, items: number}} PartData
 */

/** The days a sample date and range of days stand on. */
const SAMPLE_DAYS = {start: '2026-01-12', end: '2026-01-16'};

/**
 * A sample value for a required prop the doc declares, from its type: the
 * component's name for text, false for a flag, the first value of a union,
 * else null where the type allows it.
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
  // A search source: the page's sample one, a few fixed items.
  if (/^SearchSource\b/.test(t)) return SAMPLE_SOURCE;
  const words = literals(t);
  if (words.length) return words[0];
  if (/^\d+(\s*\|\s*\d+)*$/.test(t)) return Number(t.split('|')[0]);
  // A date, and a range of days (a calendar's in range): fixed days, so
  // the part data reads the same whatever day it is drawn on.
  if (t === 'ISODateString') return SAMPLE_DAYS.start;
  if (t === 'DateRange') return {...SAMPLE_DAYS};
  // A value the type lets be null (a file input's chosen file): none
  // chosen, when nothing plainer stands for it.
  if (/(^|\|)\s*null\s*(\||$)/.test(type)) return null;
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
  // (A group of many values, a checkbox list's, selects by a list.)
  if (Array.isArray(selected)) selected = selected[0];
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
  // A required prop its defaults leave out (a status dot's variant, a
  // command palette's search source) takes its sample, as for a doc with no
  // defaults: without it the part draws nothing (no color, no list).
  if (given)
    for (const [p, d] of Object.entries(info.props ?? {})) {
      if (p in props || /^on[A-Z]/.test(p) || p === 'children') continue;
      if (!d.required && !/^SearchSource\b/.test(d.type)) continue;
      const v = d.slots?.[0] ?? sampleOf(name, d.type);
      if (v !== undefined) props[p] = v;
    }
  if (!given)
    for (const [p, d] of Object.entries(info.props ?? {})) {
      if (!d.required || /^on[A-Z]/.test(p)) continue;
      if (p === 'children' && d.slots.length) continue;
      // A value the type allows to be null (`T | null`, nothing chosen yet)
      // with no plain sample is null.
      // A prop the doc suggests elements for (a nav icon's icon) takes the
      // first of them: a plain sample would draw its own text in their place.
      const v =
        d.slots?.[0] ??
        sampleOf(name, d.type) ??
        (/(^|\|)\s*null\s*($|\|)/.test(d.type) ? null : undefined);
      // A required prop with no plain sample, such as a render function:
      // the component cannot be shown from its doc alone.
      if (v === undefined) return null;
      props[p] = v;
    }
  const kids = info.props?.children;
  // A part whose children are required and whose doc suggests none (a
  // dropdown menu's submenu, whose children are its flyout's rows) gets
  // three of its parent's item part (DropdownMenuItem), as a group gets its
  // slot's: drawn open, an empty flyout shows nothing of the theme.
  const parentItem =
    kids?.required && !kids.slots?.length && info.subComponentOf
      ? `${info.subComponentOf}Item`
      : null;
  const slot =
    kids?.slots?.[0] ??
    (parentItem && project.components[parentItem]?.props?.label
      ? {__element: parentItem, props: {label: 'Item'}}
      : undefined);
  if (!('children' in props) && kids) {
    if (slot?.__element && (kids.required || slot.__element.startsWith(name))) {
      if (
        info.props.value &&
        !('value' in props) &&
        slot.props?.value != null
      ) {
        // A group that holds many values (a checkbox list's `string[]`)
        // takes them as a list.
        const first = `${String(slot.props.value)}-1`;
        props.value = /\[\]\s*$/.test(String(info.props.value.type ?? ''))
          ? [first]
          : first;
      }
      props.children = slotItems(slot, props.value);
      // The first item shows the icon its doc lets it take (a menu row's
      // leading icon), so the paint Core gives an item's icon is read.
      const iconProp = Object.entries(
        project.components[slot.__element]?.props ?? {},
      ).find(
        ([p, d]) =>
          /^(icon|startIcon|leadingIcon)$/.test(p) &&
          /IconType|IconName/.test(String(/** @type {any} */ (d)?.type ?? '')),
      )?.[0];
      const first = /** @type {any} */ (props.children)[0];
      if (iconProp && first && first.props?.[iconProp] == null)
        first.props = {...first.props, [iconProp]: 'check'};
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
 * such as a heading's level), its checked and disabled states, and each look
 * flag (`isStriped`) turned on. An
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
  const own = demoProps(project, name);
  if (!own) return [];
  // No demo takes focus as it mounts: on a page of many, each would pull
  // the page to itself.
  /** @type {Record<string, unknown>} */
  const demo = {
    ...own,
    ...(info.props?.hasAutoFocus ? {hasAutoFocus: false} : {}),
    ...(info.props?.autoFocus && own.autoFocus ? {autoFocus: false} : {}),
  };
  // An overlay shown open, named, as a dialog must be.
  /** @param {Record<string, unknown>} d @returns {Record<string, unknown>} */
  const opened = d => ({
    ...d,
    ...('isOpen' in d ? {} : {isOpen: true}),
    ...(info.props?.label && d.label == null ? {label: `${name} example`} : {}),
  });
  if (info.opens && opts.shown) return [{label: '', props: opened(demo)}];
  const base = info.opens ? opened(demo) : demo;
  const values = info.targets[0]?.values ?? {};
  const variants = [{label: '', props: base}];
  // Every prop that changes the look, one sample per value (a variant, a
  // status, a toast's type, an avatar's shape); a size is read at the one
  // size drawn.
  // (A number scale, a heading's level, is drawn below.)
  for (const p of Object.keys(values).filter(
    k =>
      !/^(size|density|elevation)$/.test(k) &&
      info.props?.[k] &&
      !/^\s*\d+(\s*\|\s*\d+)*\s*$/.test(info.props[k].type ?? ''),
  ))
    for (const v of values[p] ?? []) {
      // A value kind the look names (a calendar's `range` mode, whose value
      // is a DateRange): a sample of that kind, so what Core draws for it
      // (the days in the range) is read too.
      const kind = String(info.props?.value?.type ?? '')
        .split('|')
        .map(x => x.trim())
        .find(x =>
          new RegExp(`${v[0]?.toUpperCase() ?? ''}${v.slice(1)}$`).test(x),
        );
      const sample = kind ? sampleOf(name, kind) : undefined;
      variants.push({
        label: v,
        // A status like `{type: 'error', message?: string}` takes the
        // value as its `type`; the bare string breaks the component.
        props: {
          ...base,
          [p]: info.props?.[p]?.type.startsWith('{') ? {type: v} : v,
          ...(sample != null && /^[a-z]/.test(v) ? {value: sample} : {}),
        },
      });
    }
  // The states the doc names that a prop sets: checked (a boolean value)
  // and disabled. The label says the state shown.
  const states = new Set(info.targets.flatMap(t => t.states ?? []));
  // A value the doc lists beside true and false (a checkbox's
  // 'indeterminate'): rendered too, so the look Core gives it is read.
  if (states.has('checked'))
    for (const word of literals(info.props?.value?.type ?? ''))
      if (word !== 'true' && word !== 'false')
        variants.push({label: word, props: {...base, value: word}});
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
  // Each look flag the doc names (`isStriped`, `hasHover`), turned on, so
  // the styles Core gives only under it are read too: a table row's hover
  // and stripes come from its table's flags.
  for (const [p, doc] of Object.entries(info.props ?? {}))
    if (
      /^(is|has)[A-Z]/.test(p) &&
      !LIFECYCLE_FLAGS.has(p) &&
      String(/** @type {any} */ (doc)?.type ?? '').trim() === 'boolean' &&
      base[p] !== true
    )
      variants.push({
        label: p,
        props: {...base, [p]: true, ...flagNeeds(info, p, base)},
      });
  return variants.slice(0, cap);
}

/**
 * What a look flag needs to show its look: the prop its name starts with
 * (`isIconOnly` reads `icon`), given the first element its doc suggests when
 * the sample leaves it empty. Without it an icon-only button is an empty
 * square.
 * @param {any} info
 * @param {string} flag
 * @param {Record<string, unknown>} base
 * @returns {Record<string, unknown>}
 */
function flagNeeds(info, flag, base) {
  const word = /^(?:is|has)([A-Z][a-z0-9]*)/.exec(flag)?.[1];
  const prop = word ? word[0].toLowerCase() + word.slice(1) : '';
  const slot = info.props?.[prop]?.slots?.[0];
  return prop && prop !== flag && slot && base[prop] == null
    ? {[prop]: slot}
    : {};
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
    for (const v of catalogVariants(project, name, 24))
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

/** The file in a render folder that names the process that made it. */
const RENDER_OWNER = '.astryx-render-owner.json';
/** The renders of this process running now, which share its render folder. */
let rendersInFlight = 0;

/**
 * The process space this process runs in: its host and, on Linux, its pid
 * namespace, so a process id read from a render folder's owner file is
 * known to be this machine's own (a container that shares the project
 * folder has another).
 */
const processSpace = () => {
  let namespace = '';
  try {
    namespace = fs.readlinkSync('/proc/self/ns/pid');
  } catch {
    // No pid namespaces here.
  }
  return `${os.hostname()}\0${namespace}`;
};

/**
 * Whether the process that made a render folder is known to be gone: its
 * owner file names this process space, and no process has its id.
 * @param {string} dir
 * @param {number} pid
 */
function renderOwnerGone(dir, pid) {
  /** @type {any} */
  let owner;
  try {
    owner = JSON.parse(fs.readFileSync(path.join(dir, RENDER_OWNER), 'utf8'));
  } catch {
    return false;
  }
  if (owner?.space !== processSpace() || owner?.pid !== pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return /** @type {any} */ (error)?.code === 'ESRCH';
  }
}

/**
 * Remove render folders a stopped command left (killed, out of memory):
 * `.astryx-render-<pid>-<random>` folders whose maker is known to be gone
 * (its owner file names this process space, and no process has its id),
 * else only those more than ten minutes old. Links are never followed.
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
    // A folder whose maker is known gone is a leftover at once. A process id
    // from another process space may look gone or alive here, so there age
    // decides: a render takes at most three minutes, and a folder older than
    // ten is a leftover.
    /** @type {import('node:fs').Stats} */
    let stat;
    try {
      stat = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (
      !renderOwnerGone(p, Number(m[1])) &&
      Date.now() - stat.mtimeMs < 10 * 60_000
    )
      continue;
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
 * @param {{openLayers?: boolean}} [opts] `openLayers`: the overlays it shows
 *   or opens are drawn and added after its markup
 * @returns {Promise<{html: string, markup: string}>}
 */
export async function renderGenerated(
  project,
  file,
  source,
  extra = [],
  opts = {},
) {
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
  // Stopped by a signal (the terminal closing too), the render folder
  // still goes.
  const untrack = removeOnStop(dir);
  const entry = path.join(dir, file);
  rendersInFlight++;
  try {
    // Who made it, so a later render can tell it is left over once this
    // process is gone (killed outright, which no handler sees).
    fs.writeFileSync(
      path.join(dir, RENDER_OWNER),
      `${JSON.stringify({pid: process.pid, space: processSpace()})}\n`,
    );
    // Demo images point at the docs site's own folder
    // (`/template-assets/…`), which a page opened from disk cannot reach:
    // the inline placeholder takes their place, as when a template is
    // scaffolded.
    const {stripTemplateAssetRefs} =
      await import('../../foundation/discovery/template-adapter.mjs');
    fs.writeFileSync(entry, stripTemplateAssetRefs(source));
    for (const x of extra) {
      fs.mkdirSync(path.dirname(path.join(dir, x.name)), {recursive: true});
      fs.copyFileSync(x.from, path.join(dir, x.name));
    }
    // The editor's pages render every component, and a busy machine slows
    // them down: they get three times the page limit.
    const page = await renderPage(entry, {
      title: file.replace(/\.[^.]+$/, ''),
      timeoutMs: EDITOR_RENDER_MS,
      // The editor shows the markup itself and writes no file, so it needs
      // no script.
      markupOnly: true,
      // A theme's image too large for a page is named by the editor (show's
      // notes); the page goes on without it.
      leaveLargeStyleAssets: true,
      ...(opts.openLayers ? {openLayers: true} : {}),
    });
    // The page is the same whichever command rendered it: the folder's
    // per-process name never reaches the file.
    const html = page.html.split(path.basename(dir)).join('.astryx-render');
    const body = html.slice(html.indexOf('<body>') + 6);
    const end = body.indexOf('<script type=');
    return {html, markup: end >= 0 ? body.slice(0, end) : body};
  } catch (e) {
    // A theme file too large for a page to carry is the file's size, not
    // React: it is named with its size and where it is.
    if (e instanceof RenderError && e.code === 'ERR_RENDER_ASSET_TOO_LARGE') {
      const d = /** @type {{file?: string, bytes?: number, limit?: number}} */ (
        e.detail ?? {}
      );
      throw new AstryxError(
        d.file && d.bytes && d.limit
          ? `${path.relative(project.cwd, d.file).split(path.sep).join('/')} is ${(d.bytes / 1048576).toFixed(1)} MB, more than the ${d.limit / 1048576} MB a preview page carries per file: use a smaller copy of it (the app itself can keep the large one).`
          : e.message,
        [],
        ERROR_CODES.ERR_RENDER_ASSET_TOO_LARGE,
      );
    }
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
    // The owner file goes with this process's last render: then the folder
    // holds nothing of a render still running.
    if (--rendersInFlight === 0)
      fs.rmSync(path.join(dir, RENDER_OWNER), {force: true});
    // Another render may still use it: a folder with a file in it stays.
    removeEmptyFolder(madeThemes ? themes : dir, {deep: true});
    untrack();
  }
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = v => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Part data read from a cache file, by file, with the file's identity, size
 * and time when it was read. Shared by every command in the process, so it
 * is frozen.
 * @type {Map<string, {stamp: string, data: PartData}>}
 */
const readParts = new Map();

/**
 * Freeze a parsed value and everything in it.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * The runtime states the census finds a part's own element marked with
 * that its doc does not list (a list item rides an Item, whose
 * `data-selected` marks it selected): each `name=name` condition the part
 * reads under, less its visual props. Added to the part's states, so set
 * names them and the build writes them as the data attribute Core marks.
 * @param {{target: Map<string, {props: string[], states: string[]}>}} project
 * @param {PartData} parts
 */
export function addCensusStates(project, parts) {
  for (const [part, rec] of Object.entries(parts.map)) {
    const t = project.target.get(part);
    if (!t) continue;
    const props = new Set(t.props);
    /** @type {Set<string>} */
    const found = new Set();
    for (const byCond of Object.values(rec.at ?? {}))
      for (const cond of Object.keys(byCond ?? {}))
        for (const pair of cond.split(/\s/)[0].split(','))
          if (/^([a-z][\w-]*)=\1$/.test(pair)) {
            const name = pair.slice(0, pair.indexOf('='));
            if (!props.has(name)) found.add(name);
          }
    for (const name of found) if (!t.states.includes(name)) t.states.push(name);
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
    // The file is read again only when it changed: every command reads it,
    // and parsing it costs more than the rest of a small command.
    const st = fs.statSync(file);
    const stamp = `${st.ino}:${st.size}:${st.mtimeMs}`;
    const kept = readParts.get(file);
    const cached =
      kept?.stamp === stamp
        ? kept.data
        : deepFreeze(JSON.parse(fs.readFileSync(file, 'utf8')));
    // A file that parses but has the wrong shape (a hand edit, a cut-off
    // write) is built again, as a file that does not parse is.
    if (
      cached.censusKey === CENSUS_KEY &&
      cached.coreKey === project.coreKey &&
      isRecord(cached.map) &&
      Object.values(cached.map).every(isRecord) &&
      Array.isArray(cached.pairs)
    ) {
      readParts.set(file, {stamp, data: cached});
      return cached;
    }
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

/** The tokens Core's indicator focus ring is drawn from, per property. */
const RING_TOKENS = {
  'outline-width': '--focus-outline-width',
  'outline-style': '--focus-outline-style',
  'outline-color': '--focus-outline-color',
};

/**
 * Add the focus ring a control draws on its indicator at focus time (Core's
 * `useIndicatorFocusRing`, used by a control whose input is visually
 * hidden): an inline style the server render never shows, read from the
 * focus outline tokens. The tokens are read by the indicator always (it
 * never takes focus itself, so no state reaches the ring), and the outline
 * properties are painted inline, which no theme rule can replace. The
 * indicator is the control's own `-indicator` target, or for a part of
 * another component (a radio list's item), that component's.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {Record<string, PartRecord>} map
 */
function addIndicatorRings(project, map) {
  for (const [name, info] of Object.entries(project.components)) {
    const at = info.importPath?.split('/').pop();
    let source;
    try {
      source = at
        ? fs.readFileSync(
            path.join(project.coreDir, 'dist', at, `${name}.js`),
            'utf8',
          )
        : '';
    } catch {
      continue;
    }
    if (!source.includes('useIndicatorFocusRing')) continue;
    /** @param {import('./_project.mjs').ComponentInfo | undefined} c */
    const indicators = c =>
      (c?.targets ?? [])
        .map(t => t.className.replace(/^astryx-/, ''))
        .filter(k => k.endsWith('-indicator'));
    const own = indicators(info);
    const keys = own.length
      ? own
      : indicators(
          info.subComponentOf
            ? project.components[info.subComponentOf]
            : undefined,
        );
    for (const key of keys) {
      const rec = (map[key] ??= {
        own: {},
        inside: {},
        attrs: {},
        contains: [],
      });
      for (const [prop, token] of Object.entries(RING_TOKENS)) {
        rec.inside[token] = [...new Set([...(rec.inside[token] ?? []), prop])];
        (rec.inline ??= {})[''] = {...rec.inline?.[''], [prop]: token};
      }
    }
  }
}

/**
 * Add the paint Core writes as an inline style when it sets a theme state
 * at run time (a table row's selection wash, set by the selection plugin
 * beside the row's `selected` state): something the server render never
 * shows. A built module under a component's folder that writes a state's
 * attribute (`themeDataAttributes({selected: 'selected'})`) and an inline
 * property from a color token (`el.style.backgroundColor = …` with
 * `colorVars['--color-accent-muted']`) paints that state with it, on each
 * of the component's targets that lists the state.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {Record<string, PartRecord>} map
 */
function addInlineStatePaint(project, map) {
  const dist = path.join(project.coreDir, 'dist');
  /** @param {string} dir @returns {string[]} */
  const modules = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      return [];
    }
    return entries.flatMap(e =>
      e.isDirectory()
        ? modules(path.join(dir, e.name))
        : e.name.endsWith('.js')
          ? [path.join(dir, e.name)]
          : [],
    );
  };
  for (const [name, info] of Object.entries(project.components)) {
    const folder = info.importPath?.split('/').pop();
    if (!folder || folder !== name) continue;
    const withStates = info.targets.filter(t => t.states.length);
    if (!withStates.length) continue;
    for (const file of modules(path.join(dist, folder))) {
      const source = fs.readFileSync(file, 'utf8');
      const states = [
        ...source.matchAll(
          /themeDataAttributes\(\{\s*([\w-]+):\s*'\1'\s*\}\)/g,
        ),
      ].map(m => m[1]);
      if (!states.length) continue;
      const props = [
        ...source.matchAll(/\.style\.([a-z][A-Za-z]*)\s*=(?!=)/g),
      ].map(m => m[1].replace(/[A-Z]/g, c => `-${c.toLowerCase()}`));
      const colorTokens = [
        ...source.matchAll(/colorVars\[['"](--color-[\w-]+)['"]\]/g),
      ].map(m => m[1]);
      if (!props.length || colorTokens.length !== 1) continue;
      for (const t of withStates) {
        const key = t.className.replace(/^astryx-/, '');
        const rec = map[key];
        if (!rec) continue;
        for (const state of states.filter(st => t.states.includes(st)))
          for (const prop of props) {
            (rec.inline ??= {})[state] = {
              ...rec.inline?.[state],
              [prop]: colorTokens[0],
            };
            const own = (rec.own[prop] ??= {tokens: {}, values: []});
            own.tokens[colorTokens[0]] = [
              ...new Set([
                ...(own.tokens[colorTokens[0]] ?? []),
                `${state}=${state}`,
              ]),
            ];
          }
      }
    }
  }
}

/**
 * Build the part data: render the catalog, then walk its markup.
 * @param {import('./_project.mjs').ThemeProject} project
 * @returns {Promise<PartData>}
 */
async function buildPartData(project) {
  const {items, imports} = catalogItems(project);
  const all = [...items, {name: 'sample-page', label: '', tree: SAMPLE_PAGE}];
  // Overlays (a tooltip, a menu's list) are drawn open too: the server
  // markup holds none of them.
  const {markup} = await renderGenerated(
    project,
    'catalog.mjs',
    pageSource({items: all, imports, theme: null, layout: 'catalog'}),
    [],
    {openLayers: true},
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
  // The overlays drawn open add the parts the server markup cannot hold (a
  // tooltip, a menu's items); a part the page shows already keeps what it
  // reads there, never a look another component gives it inside an overlay
  // (a dialog's round close button).
  const at = markup.indexOf('<div data-astryx-open-layers=');
  const decls = declarations(css);
  const result = walkMarkup(
    at < 0 ? markup : markup.slice(0, at),
    decls,
    tokens,
    project.target,
  );
  if (at >= 0) {
    const layers = walkMarkup(markup.slice(at), decls, tokens, project.target);
    const added = Object.keys(layers.map).filter(k => !(k in result.map));
    for (const k of added) result.map[k] = layers.map[k];
    // A part the page draws too keeps its page record, and takes from the
    // opened overlays only the open state the page never shows (a menu's
    // submenu row, open while its flyout is): its conditions under the open
    // attribute.
    for (const [k, rec] of Object.entries(layers.map)) {
      if (added.includes(k)) continue;
      const page = result.map[k];
      if (!page) continue;
      for (const [prop, byCond] of Object.entries(rec.at ?? {}))
        for (const [cond, v] of Object.entries(byCond ?? {}))
          if (/(?:^|,)aria-expanded=true\b/.test(cond.split(' ')[0]))
            ((page.at ??= {})[prop] ??= {})[cond] ??= v;
    }
    const seen = new Set(result.pairs.map(x => JSON.stringify(x)));
    for (const x of layers.pairs)
      if (
        [x.text, x.fg.target, x.bg.target].some(t =>
          added.includes(String(t)),
        ) &&
        !seen.has(JSON.stringify(x))
      )
        result.pairs.push(x);
  }
  addInlineStatePaint(project, result.map);
  addIndicatorRings(project, result.map);
  return {
    censusKey: CENSUS_KEY,
    coreKey: project.coreKey,
    ...result,
    rendered: (markup.match(/<section data-cat=/g) ?? []).length,
    items: all.length,
  };
}

/**
 * The value Core falls back to where its stylesheet reads a variable
 * (`var(--astryx-card-padding, var(--spacing-4))` gives `var(--spacing-4)`),
 * or null when it gives none.
 * @param {any} project
 * @param {string} name
 * @returns {string | null}
 */
export function coreFallback(project, name) {
  /** @type {string} */
  let css;
  try {
    css = fs.readFileSync(
      project.req.resolve('@astryxdesign/core/astryx.css'),
      'utf8',
    );
  } catch {
    return null;
  }
  const at = css.indexOf(`var(${name},`);
  if (at < 0) return null;
  let depth = 0;
  const from = at + `var(${name},`.length;
  for (let j = from; j < css.length; j++) {
    if (css[j] === '(') depth++;
    else if (css[j] === ')') {
      if (depth === 0) return css.slice(from, j).trim();
      depth--;
    }
  }
  return null;
}

/** @type {Map<string, string>} */
const coreCssCache = new Map();

/**
 * Core's stylesheet text, read once; empty with no stylesheet.
 * @param {any} project
 * @returns {string}
 */
function coreCss(project) {
  /** @type {string} */
  let file;
  try {
    file = project.req.resolve('@astryxdesign/core/astryx.css');
  } catch {
    return '';
  }
  let css = coreCssCache.get(file);
  if (css == null) {
    try {
      css = fs.readFileSync(file, 'utf8');
    } catch {
      css = '';
    }
    coreCssCache.set(file, css);
  }
  return css;
}

/**
 * The properties a keyframes rule of Core's animates (a tooltip's entrance
 * animates opacity and transform), and the transform functions it uses.
 * Empty when Core has no such rule.
 * @param {any} project
 * @param {string} name
 * @returns {{props: string[], transforms: string[]}}
 */
export function coreKeyframes(project, name) {
  const css = coreCss(project);
  const at = css.indexOf(`@keyframes ${name}{`);
  if (at < 0) return {props: [], transforms: []};
  let depth = 0;
  let end = at;
  for (let j = css.indexOf('{', at); j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) {
      end = j;
      break;
    }
  }
  const body = css.slice(at, end);
  return {
    props: [
      ...new Set([...body.matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map(m => m[1])),
    ].filter(p => p !== 'animation-timing-function'),
    transforms: [
      ...new Set([...body.matchAll(/\b([a-z]+[XYZ3d]*)\(/g)].map(m => m[1])),
    ].filter(f => /^(?:translate|scale|rotate|skew)/.test(f)),
  };
}

/**
 * Every value Core's stylesheet gives a variable of its own (a card's
 * `--_card-elevation` is a shared shadow at each elevation; its
 * `--_card-ring` is a colored ring), deduplicated. Empty with no
 * stylesheet.
 * @param {any} project
 * @param {string} name
 * @returns {string[]}
 */
export function coreVarValues(project, name) {
  const css = coreCss(project);
  if (!css) return [];
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    ...new Set(
      [...css.matchAll(new RegExp(`${esc}\\s*:\\s*([^;}]+)`, 'g'))].map(m =>
        m[1].trim(),
      ),
    ),
  ];
}

/** @type {Map<string, Set<string>>} */
const calcCache = new Map();

/**
 * The variables Core's stylesheet reads inside a calc() (a composer's
 * padding in its send button's radius): only one length works there.
 * Empty with no stylesheet.
 * @param {any} project
 * @returns {Set<string>}
 */
export function calcVars(project) {
  /** @type {string} */
  let file;
  try {
    file = project.req.resolve('@astryxdesign/core/astryx.css');
  } catch {
    return new Set();
  }
  const cached = calcCache.get(file);
  if (cached) return cached;
  const css = fs.readFileSync(file, 'utf8');
  /** @type {Set<string>} */
  const out = new Set();
  for (let i = css.indexOf('calc('); i >= 0; i = css.indexOf('calc(', i + 5)) {
    let depth = 0;
    let j = i + 4;
    for (; j < css.length; j++) {
      if (css[j] === '(') depth++;
      else if (css[j] === ')' && --depth === 0) break;
    }
    for (const m of css.slice(i, j).matchAll(/var\((--[a-z0-9_-]+)/gi))
      out.add(m[1].toLowerCase());
  }
  calcCache.set(file, out);
  return out;
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
 * The stylesheet without its forced-colors blocks: what Core draws for a
 * high-contrast system mode (a button's 1px ButtonText border) is no look
 * a theme gives, so the part data never reads it as the part's.
 * @param {string} css
 */
function withoutForcedColors(css) {
  let out = '';
  let i = 0;
  const re = /@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    out += css.slice(i, m.index);
    let depth = 1;
    let j = m.index + m[0].length;
    for (; j < css.length && depth; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
    }
    i = j;
    re.lastIndex = j;
  }
  return out + css.slice(i);
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
  for (const m of withoutForcedColors(css).matchAll(
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
 * A value with the private variables set on the element or its ancestors
 * put in (a variable with no fallback only), so it reads public tokens and
 * literal values alone where it can.
 * @param {string} v
 * @param {Record<string, string>} env
 * @param {Set<string>} tokens
 * @param {number} [depth]
 * @returns {string}
 */
function resolvePrivate(v, env, tokens, depth = 0) {
  if (depth > 8) return v;
  const out = v.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (m, name) =>
    !tokens.has(name) && env[name] != null ? env[name] : m,
  );
  return out === v ? v : resolvePrivate(out, env, tokens, depth + 1);
}

/**
 * Walk server-rendered markup: for each element, its classes' declarations
 * become what its part reads; text records the color pair it sits on.
 * @param {string} html
 * @param {ReturnType<typeof declarations>} decls
 * @param {Set<string>} tokens
 * @param {Map<string, {props: string[], states: string[]}>} [targets] the theming targets by key: the visual props and runtime states each declares are the data attributes read as its conditions
 * @returns {{map: Record<string, PartRecord>, pairs: TextPair[]}}
 */
export function walkMarkup(html, decls, tokens, targets = new Map()) {
  /** @type {Record<string, {own: Record<string, {tokens: Record<string, Set<string>>, values: Set<string>}>, at: Record<string, Record<string, string>>, inside: Record<string, Set<string>>, attrs: Record<string, Set<string>>, contains: Set<string>, holdsVariants?: Record<string, Set<string>>, tags: Set<string>, innerCorners: Set<string>, media: boolean, mediaSides?: Set<string>, line?: Set<string>, lineAdded?: Array<[string, string, Set<string>, boolean?]>, held?: Record<string, Set<string>>, underInput?: string}>} */
  const map = {};
  /** @type {Array<{env: Record<string, string>, target: string | null, all?: string[], fg: PaintSide | null, bg: PaintSide | null, cond: string, kids?: string[], input?: boolean, owns?: boolean}>} */
  const stack = [{env: {}, target: null, fg: null, bg: null, cond: ''}];
  /** @type {Map<string, TextPair>} */
  const pairs = new Map();
  /**
   * Text drawn by a part with its paint: one pair per part, text and
   * ground.
   * @param {string} target @param {PaintSide} fg @param {PaintSide} bg @param {string} sample
   */
  const addPair = (target, fg, bg, sample) => {
    const k = `${target}|${fg.target}:${fg.tokens.join('+') || fg.raw}|${bg.target}:${bg.tokens.join('+') || bg.raw}`;
    // (The parts the text sits inside where the census drew it, between
    // it and its ground and beyond: a side nav's item inside the side nav.)
    const within = new Set(pairs.get(k)?.within ?? []);
    for (const anc of stack)
      for (const at of anc.all ?? (anc.target ? [anc.target] : []))
        if (at !== target) within.add(at);
    pairs.set(k, {
      text: target,
      fg,
      bg,
      sample: sample.slice(0, 30),
      within: [...within],
    });
  };
  /** The parts whose paint is a line inside them. @type {Set<string>} */
  const lined = new Set();
  for (const m of html.matchAll(
    /([^<]+)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g,
  )) {
    const [, text, close, tag, attrs, selfClose] = m;
    if (text !== undefined) {
      const top = stack[stack.length - 1];
      const t = text.trim();
      if (t && top.target && top.fg && top.bg && !/^skip to/i.test(t))
        addPair(top.target, top.fg, top.bg, t);
      continue;
    }
    if (close) {
      if (stack.length > 1) {
        const done = /** @type {typeof stack[number]} */ (stack.pop());
        // (A native input laid over its siblings, invisible, takes the
        // pointer and the focus for them: a checkbox's box draws under
        // it, so its own :hover or :focus never applies. The part that
        // holds the input is where those states land.)
        if (done.input)
          for (const k of done.kids ?? [])
            map[k].underInput ??= done.target ?? stack.at(-1)?.target ?? '';
      }
      continue;
    }
    const cls = (/class="([^"]*)"/.exec(attrs)?.[1] ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const parent = stack[stack.length - 1];
    // The theming targets the element carries (else the one it sits in).
    const keys = cls
      .filter(c => c.startsWith('astryx-') && !c.startsWith('astryx-theme'))
      .map(c => c.slice(7));
    const declaredBy = (keys.length ? keys : [parent.target])
      .map(k => (k ? targets.get(k) : undefined))
      .filter(t => t != null);
    const props = new Set(declaredBy.flatMap(t => t.props));
    const states = new Set(declaredBy.flatMap(t => t.states));
    // A data attribute the element's target declares (a visual prop or a
    // runtime state, written by `themeProps` as `data-<name>`) is a
    // condition of what the part reads.
    const dataAttrs = Object.fromEntries(
      [...attrs.matchAll(/\bdata-([a-z][\w-]*)="([^"]*)"/g)]
        .filter(x => props.has(x[1]) || states.has(x[1]))
        .map(x => [x[1], x[2]]),
    );
    // The place another component puts a part in (the current page's
    // button in a pagination, a pressed toggle) is a condition of what that
    // component styles it with there, never the part's look at rest. A part
    // that marks the place with a runtime state of its own (a selected tab)
    // is conditioned by that state already.
    const ownState = Object.keys(dataAttrs).some(k => states.has(k));
    // (Open is the part's own state, never a place another component puts
    // it: a submenu's row is highlighted while its flyout is open, and open
    // too.)
    const context = [
      ...attrs.matchAll(
        ownState
          ? /\b(aria-expanded)="([^"]*)"/g
          : /\b(aria-(?:current|pressed|expanded))="([^"]*)"/g,
      ),
    ]
      .filter(x => x[2] !== 'false')
      .map(x => `${x[1]}=${x[2]}`);
    const env = {...parent.env};
    const own = cls.flatMap(c => decls.get(c) ?? []);
    for (const d of own)
      if (d.prop.startsWith('--') && !d.cond) env[d.prop] = d.value;
    const named = cls.filter(
      c => c.startsWith('astryx-') && !c.startsWith('astryx-theme'),
    );
    const target = named[0]?.slice(7) ?? parent.target;
    const ownsTarget = named.length > 0;
    // An empty element with no target of its own inside a part that paints
    // nothing at rest (a divider's line): what it paints is the part's own
    // paint, under the part's conditions, so the readers find it as the
    // part's (its fill, its line color and its thickness).
    const empty =
      Boolean(selfClose) ||
      VOID.has(tag.toLowerCase()) ||
      html.startsWith(`</${tag}>`, (m.index ?? 0) + m[0].length);
    const paints = (
      /** @type {{prop: string, value: string, cond: string}} */ d,
    ) =>
      !d.cond &&
      /^(background(-color)?|border(-[a-z-]+)?-color)$/.test(d.prop) &&
      expand(d.value, env, tokens).size > 0;
    // (Every part the parent element carries: a menu's separator is a
    // divider too.)
    const lineOf =
      !ownsTarget &&
      empty &&
      parent.target != null &&
      own.some(paints) &&
      (lined.has(parent.target) ||
        !Object.keys(map[parent.target]?.own ?? {}).some(p =>
          /^background(-color)?$/.test(p),
        ))
        ? parent.target
        : null;
    if (lineOf) lined.add(lineOf);
    const lineParts = lineOf ? (parent.all ?? [lineOf]) : [];
    // An element can carry several targets (a shell's side nav region is a
    // layout panel too): its declarations are each one's own. What an
    // element without one draws is each of its parent's.
    for (const t of ownsTarget
      ? named.map(c => c.slice(7))
      : (parent.all ?? [target])) {
      if (!t) continue;
      const asOwn = ownsTarget || lineParts.includes(t);
      const T = (map[t] ??= {
        own: {},
        at: {},
        inside: {},
        attrs: {},
        contains: new Set(),
        tags: new Set(),
        innerCorners: new Set(),
        media: false,
      });
      if (ownsTarget)
        for (const [k, v] of Object.entries(dataAttrs))
          (T.attrs[k] ??= new Set()).add(v);
      // Core's media surface inside the part (a toast's inverted surface):
      // it sets the text tokens of what it holds from the on-dark color
      // where it is dark and the on-light color where it is light (Core's
      // onMediaTokens), so the part's text reads one of them in each mode.
      else if (/\bdata-astryx-media="/.test(attrs)) {
        T.media = true;
        const side = /\bdata-astryx-media="(dark|light)"/.exec(attrs)?.[1];
        if (side) (T.mediaSides ??= new Set()).add(side);
        for (const t of ['--color-on-dark', '--color-on-light'])
          if (tokens.has(t)) (T.inside[t] ??= new Set()).add('color');
      }
      const cond0 = ownsTarget
        ? [
            ...Object.entries(dataAttrs).map(([k, v]) => `${k}=${v}`),
            ...context,
          ].join(',')
        : parent.cond;
      for (const d of own) {
        if (d.prop.startsWith('--')) continue;
        // (An inherited background paints nothing of its own: it reads no
        // token, and what shows is its parent's.)
        const toks = expand(d.value, env, tokens);
        const cond = [cond0, d.cond].filter(Boolean).join(' ');
        // A line's paint and its thickness (a size read from the border
        // width) are the part's; its layout is not.
        const lineProp =
          lineParts.includes(t) &&
          (paints(d) ||
            /^border(-[a-z-]+)?-(width|style)$/.test(d.prop) ||
            (/^(height|width|block-size|inline-size)$/.test(d.prop) &&
              toks.has('--border-width')));
        if (!ownsTarget)
          for (const k of toks) (T.inside[k] ??= new Set()).add(d.prop);
        if (asOwn && (ownsTarget || lineProp)) {
          // (Drawn by the line inside the part, not the part's own element:
          // a setting on the part does not reach it.)
          if (lineProp && !ownsTarget) {
            (T.line ??= new Set()).add(d.prop);
            // (Undone at the end for a part that holds other parts: its
            // own element is no bare line.)
            if (!T.own[d.prop])
              (T.lineAdded ??= []).push([d.prop, cond || 'always', toks]);
            else if (!(T.at[d.prop] ?? {})[cond || 'always'])
              (T.lineAdded ??= []).push([d.prop, cond || 'always', toks, true]);
          }
          const P = (T.own[d.prop] ??= {tokens: {}, values: new Set()});
          (T.at[d.prop] ??= {})[cond || 'always'] ??= resolvePrivate(
            d.value,
            env,
            tokens,
          );
          P.values.add(
            d.value.length > 80 ? `${d.value.slice(0, 80)}...` : d.value,
          );
          for (const t of toks)
            (P.tokens[t] ??= new Set()).add(cond || 'always');
        }
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
        if (t.length || !/transparent|^\s*inherit\s*$/i.test(d.value))
          bg = {target, tokens: t, raw: t.length ? null : d.value};
      }
    }
    // An input's text is its value, and its placeholder where it has none:
    // attributes, not text nodes, drawn in the input's text color (the
    // placeholder in its own ::placeholder color) on the ground it sits on.
    if (tag.toLowerCase() === 'input' && target && fg && bg) {
      const attr = (/** @type {string} */ n) =>
        new RegExp(`\\b${n}="([^"]*)"`).exec(attrs)?.[1]?.trim() ?? '';
      const type = attr('type') || 'text';
      if (
        !/^(checkbox|radio|hidden|range|color|file|submit|button|reset|image)$/.test(
          type,
        )
      ) {
        if (attr('value')) addPair(target, fg, bg, attr('value'));
        const ph = own.find(
          d => d.prop === 'color' && /placeholder/.test(d.cond ?? ''),
        );
        if (attr('placeholder') && ph) {
          const t = [...expand(ph.value, env, tokens)];
          addPair(
            target,
            {target, tokens: t, raw: t.length ? null : ph.value},
            bg,
            attr('placeholder'),
          );
        } else if (attr('placeholder') && !attr('value'))
          addPair(target, fg, bg, attr('placeholder'));
      }
    }
    // (Each part an element carries holds what is inside it: a checkbox
    // list's root is a field too.)
    for (const t of ownsTarget ? named.map(c => c.slice(7)) : [])
      for (const anc of stack)
        for (const at of anc.all ?? (anc.target ? [anc.target] : []))
          if (at !== t) {
            map[at].contains.add(t);
            // (The variant each holds there: a toast's close button is a
            // ghost button.)
            if (dataAttrs.variant)
              ((map[at].holdsVariants ??= {})[t] ??= new Set()).add(
                dataAttrs.variant,
              );
            // What the parts inside it draw with there, at rest (a table
            // row's cells' border color; a toast's ghost button declares
            // none).
            const A = map[at];
            for (const d of own)
              if (!d.cond && !d.prop.startsWith('--'))
                for (const tk of expand(d.value, env, tokens))
                  ((A.held ??= {})[tk] ??= new Set()).add(d.prop);
          }
    if (ownsTarget) {
      for (const t of named) map[t.slice(7)].tags.add(tag.toLowerCase());
      // Corners Core draws on a part by its place among its siblings (a
      // button group's first and last buttons): the radius token they read
      // is the enclosing part's corners.
      if (parent.target && !named.includes(`astryx-${parent.target}`))
        for (const d of own)
          if (/^border-(start|end)-(start|end)-radius$/.test(d.prop))
            for (const tok of expand(d.value, env, tokens))
              if (/^--radius-/.test(tok))
                map[parent.target].innerCorners.add(tok);
    }
    // (The conditions a part's own element is drawn under go to what it
    // holds.)
    const condHere = ownsTarget
      ? [
          ...Object.entries(dataAttrs).map(([k, v]) => `${k}=${v}`),
          ...context,
        ].join(',')
      : parent.cond;
    if (
      tag.toLowerCase() === 'input' &&
      own.some(
        d =>
          (d.prop === 'opacity' && /^0(?:\.0+)?$/.test(d.value.trim())) ||
          (d.prop === 'position' && d.value.trim() === 'absolute'),
      )
    )
      parent.input = true;
    else if (ownsTarget)
      // (Into each element it sits in, up to the nearest themed one: the
      // box inside a wrapper with no box of its own, beside the input.)
      for (let i = stack.length - 1; i >= 1; i--) {
        (stack[i].kids ??= []).push(...named.map(c => c.slice(7)));
        if (stack[i].owns) break;
      }
    if (!selfClose && !VOID.has(tag.toLowerCase()))
      stack.push({
        env,
        target,
        all: ownsTarget ? named.map(c => c.slice(7)) : parent.all,
        fg,
        bg,
        cond: condHere,
        owns: ownsTarget,
      });
  }
  // A part that holds other parts (a layout, an outline, a slider's
  // control) is no bare line: what an empty element inside it painted
  // stays what that element draws.
  for (const v of Object.values(map))
    if (v.contains.size && v.lineAdded) {
      for (const [prop, cond, toks, kept] of v.lineAdded) {
        if (!kept) {
          delete v.own[prop];
          delete v.at[prop];
          continue;
        }
        delete v.at[prop]?.[cond];
        for (const tk of toks) v.own[prop]?.tokens[tk]?.delete(cond);
      }
      v.line = undefined;
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
      at: v.at,
      inside: Object.fromEntries(
        Object.entries(v.inside).map(([k, s]) => [k, [...s]]),
      ),
      attrs: Object.fromEntries(
        Object.entries(v.attrs).map(([k, s]) => [k, [...s]]),
      ),
      contains: [...v.contains],
      ...(v.holdsVariants
        ? {
            holdsVariants: Object.fromEntries(
              Object.entries(v.holdsVariants).map(([k, s]) => [k, [...s]]),
            ),
          }
        : {}),
      tags: [...v.tags],
      ...(v.underInput != null ? {underInput: v.underInput} : {}),
      innerCorners: [...v.innerCorners],
      ...(v.media ? {media: true} : {}),
      ...(v.mediaSides?.size ? {mediaSides: [...v.mediaSides].sort()} : {}),
      ...(v.line?.size ? {line: [...v.line]} : {}),
      ...(v.held
        ? {
            held: Object.fromEntries(
              Object.entries(v.held).map(([k, s]) => [k, [...s]]),
            ),
          }
        : {}),
    };
  }
  return {map: out, pairs: [...pairs.values()]};
}

/**
 * The family roles the census shows, each read from the parts' own
 * structure (their tags, states, resting fills, press overlays and their
 * component's doc category), never from their names: a look set on one
 * member of a role reaches the others.
 * - `button-like`: drawn as a <button> with a press overlay and a box of
 *   its own (a fill at rest in some variant, or a pressed state), never a
 *   selectable item;
 * - `overlays`: an Overlay component's own surface, filled with the
 *   surface or popover color;
 * - `option-rows`: a row (a <div> or <li>) clear at rest that is
 *   highlighted as you move through a list, or pressed without being
 *   selectable;
 * - `selected-items`: a part with a selected (or active) state whose
 *   selected look fills it;
 * - `accent-fills`: a part filled with the accent at rest;
 * - `inset-fields`: the inputs and the parts filled with the track color;
 * - `status-surfaces`: a part holding a message with a control of its own
 *   whose fill follows a prop whose values name the theme's status roles
 *   (info, success, warning, error);
 * - `overlay-headers`: an Overlay component's part, not its surface, that
 *   holds a heading and a control (its title and its close button).
 * @param {{MAP: Record<string, any>}} C
 * @param {{target: Map<string, any>, components: Record<string, any>}} project
 * @param {string[]} inputs the inputs group's members
 * @param {string[]} statusWords the theme's status role words
 * @returns {Record<'button-like' | 'overlays' | 'option-rows' | 'selected-items' | 'accent-fills' | 'inset-fields' | 'status-surfaces' | 'overlay-headers', string[]>}
 */
export function familyRoles(
  C,
  project,
  inputs = [],
  statusWords = ['info', 'success', 'warning', 'error'],
) {
  /** @type {Record<string, string[]>} */
  const out = {
    'button-like': [],
    overlays: [],
    'option-rows': [],
    'selected-items': [],
    'accent-fills': [],
    'inset-fields': [],
    'status-surfaces': [],
    'overlay-headers': [],
  };
  /** @param {string} key @param {string} prop @param {(cond: string) => boolean} keep */
  const values = (key, prop, keep) =>
    Object.entries(C.MAP?.[key]?.at?.[prop] ?? {})
      .filter(([cond]) => keep(cond))
      .map(([, v]) => String(v).trim());
  const CLEAR = /^(?:transparent|none|rgba\(0, ?0, ?0, ?0\))$/;
  for (const [key, tg] of project.target) {
    const rec = C.MAP?.[key];
    if (!rec) continue;
    const tags = [...(rec.tags ?? [])];
    const states = [...(tg.states ?? []), ...Object.keys(rec.attrs ?? {})].map(
      String,
    );
    const selectable = states.some(st => /^(?:selected|active)$/.test(st));
    const highlighted = states.includes('highlighted');
    const pressed = JSON.stringify(rec.at ?? {}).includes('data-astryx-press');
    // (At rest: a condition of visual props only, no state (a state the
    // docs name, an ARIA state, or a boolean attribute Core writes as its
    // own name, selected="selected"), pseudo-class or inner element.)
    const docStates = new Set((tg.states ?? []).map(String));
    const rest = values(
      key,
      'background-color',
      cond =>
        !/[\s:[]/.test(cond) &&
        (cond === 'always' ||
          cond.split(',').every(kv => {
            const [k, v] = kv.split('=');
            return k !== v && !docStates.has(k) && !k.startsWith('aria-');
          })),
    );
    const comp = project.components?.[tg.component];
    const own = comp?.targets?.[0]?.className === `astryx-${key}`;
    if (
      tags.length &&
      tags.every(t => t === 'button') &&
      pressed &&
      !selectable &&
      !highlighted &&
      (rest.some(v => !CLEAR.test(v)) || states.some(st => /pressed/i.test(st)))
    )
      out['button-like'].push(key);
    if (
      comp?.category === 'Overlay' &&
      own &&
      values(key, 'background-color', cond => !/[\s:[]/.test(cond)).some(v =>
        /--color-background-(?:surface|popover)\b/.test(v),
      )
    )
      out.overlays.push(key);
    if (
      tags.length &&
      tags.every(t => t === 'div' || t === 'li') &&
      rest.length > 0 &&
      rest.every(v => CLEAR.test(v)) &&
      (highlighted || (pressed && !selectable))
    )
      out['option-rows'].push(key);
    if (
      selectable &&
      values(
        key,
        'background-color',
        cond =>
          /(?:^|,)(?:selected=selected|active=active)(?:,|$)/.test(cond) &&
          !/[\s:[]/.test(cond),
      ).some(v => !CLEAR.test(v))
    )
      out['selected-items'].push(key);
    if (rest.some(v => /^var\(--color-accent\)$/.test(v)))
      out['accent-fills'].push(key);
    if (
      inputs.includes(key) ||
      rest.some(v => /^var\(--color-track\)$/.test(v))
    )
      out['inset-fields'].push(key);
    // (A status prop: one whose values are the theme's status words; the
    // fill follows it when it differs between them or reads a status
    // token.)
    const statusProps = Object.entries(rec.attrs ?? {})
      .filter(
        ([, vals]) =>
          Array.isArray(vals) &&
          vals.some(v => statusWords.includes(String(v))),
      )
      .map(([k]) => k);
    if (statusProps.length) {
      const fills = Object.entries(rec.at?.['background-color'] ?? {}).filter(
        ([cond]) => !/[\s:[]/.test(cond),
      );
      const statusFill = new RegExp(
        `--color-(?:background-)?(?:${statusWords.join('|')})\\b`,
      );
      const byStatus = fills.filter(([cond]) =>
        statusProps.some(k => new RegExp(`(?:^|,)${k}=`).test(cond)),
      );
      // (A surface: it holds a message with a control of its own, a dismiss
      // or an action; a badge or a dot is a mark, not a surface.)
      if (
        (rec.contains ?? []).includes('button') &&
        (byStatus.some(([, v]) => statusFill.test(String(v))) ||
          new Set(fills.map(([, v]) => String(v))).size > 1)
      )
        out['status-surfaces'].push(key);
    }
    if (
      comp?.category === 'Overlay' &&
      !own &&
      (rec.contains ?? []).includes('heading') &&
      (rec.contains ?? []).includes('button')
    )
      out['overlay-headers'].push(key);
  }
  return /** @type {any} */ (out);
}
