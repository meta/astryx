// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Previews for `astryx experimental theme editor` and `theme preview`: the sample app page and
 * the theme-building page (every component grouped, overlays open, and real
 * template pages), rendered with the theme to self-contained HTML by the
 * render machinery; and the sources of the in-app preview route and its
 * pages. PNG pictures
 * are made only on request, with a Playwright or Chrome installed on the
 * machine.
 *
 * @position api/theme-edit — previews and pictures
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  EXTRA,
  OPEN_OVERLAYS,
  SAMPLE_PAGE,
  SHEET_ORDER,
  elementNames,
  pageSource,
} from './_catalog.mjs';
import {renderDir, renderGenerated} from './_parts.mjs';
import {OVERVIEW_SECTIONS} from './_overview.mjs';
import {fontPackages, modesOf, themeFiles, shown} from './_settings.mjs';
import {importPathOf, installLine} from './_project.mjs';
import {DIRECT} from './_tables.mjs';

const TEMPLATES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates/pages',
);

/** The groups of the theme-building page, in order. */
export const SHOWCASE_GROUPS = [
  'actions',
  'inputs',
  'selection',
  'navigation',
  'feedback',
  'data',
  'containers',
  'overlays',
  'pages',
];

/** What each section of the sheet holds, for help and `show --section`. */
export const SHOWCASE_GROUP_HELP = {
  actions: 'buttons and links',
  inputs: 'text, number, date and time fields, forms',
  selection: 'selectors, checkboxes, radios, switches, segmented controls',
  navigation: 'top and side navigation, tabs, breadcrumbs, pagination',
  feedback: 'banners, badges, progress, status dots, toasts',
  data: 'text, headings, tables, lists, code, content',
  containers: 'cards and layout',
  overlays: 'dialogs, popovers, menus and tooltips, shown open',
  pages:
    'the sample app page and real template pages (dashboard, form, settings)',
};

/** Real template pages the theme-building page shows in full. */
const PAGE_TEMPLATES = ['dashboard', 'contact-form', 'settings'];

const SELECTION =
  /Select|Checkbox|Radio|Switch|Segmented|Toggle|Slider|Typeahead|Tokenizer/;

/**
 * The group a component belongs to on the theme-building page.
 * @param {string} name
 * @param {string} category
 * @returns {string | null}
 */
function groupOf(name, category) {
  if (SELECTION.test(name)) return 'selection';
  const c = category.toLowerCase();
  if (c === 'action') return 'actions';
  if (c === 'form controls') return 'inputs';
  if (c === 'navigation') return 'navigation';
  if (c === 'feedback & status') return 'feedback';
  if (c === 'content' || c === 'table & list' || c === 'text' || c === 'media')
    return 'data';
  if (c === 'container' || c === 'layout') return 'containers';
  if (c === 'overlay') return 'overlays';
  return null;
}

/**
 * Items of the theme-building page: each component once per variant, the
 * hand-made extras, overlays open, the sample page, and template pages
 * whose packages the project has.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string | undefined} group only this group
 * @returns {{items: import('./_catalog.mjs').CatalogItem[], imports: Record<string, string>, skipped: string[]}}
 */
export function showcaseItems(project, group) {
  /** @type {import('./_catalog.mjs').CatalogItem[]} */
  const items = [];
  /** @param {string} name */
  const groupFor = name =>
    groupOf(name, project.components[name]?.category ?? '');
  const extraNames = new Set([...EXTRA, ...OPEN_OVERLAYS].map(([n]) => n));
  for (const [name, list] of [...EXTRA, ...OPEN_OVERLAYS]) {
    const g = groupFor(name);
    if (g)
      for (const [label, tree] of list)
        items.push({group: g, name, label, tree});
  }
  for (const [name, info] of Object.entries(project.components)) {
    const defaults = /** @type {any} */ (info.defaults);
    const g = groupFor(name);
    if (!g || !defaults || typeof defaults !== 'object' || extraNames.has(name))
      continue;
    const inParent = inParentOf(project, name);
    if (inParent === null) continue;
    const values = info.targets[0]?.values ?? {};
    /** @type {Array<{label: string, props: Record<string, unknown>}>} */
    const variants = [{label: '', props: {}}];
    for (const p of ['variant', 'status', 'color'])
      for (const v of values[p] ?? [])
        variants.push({
          label: v,
          // A status like `{type: 'error', message?: string}` takes the
          // value as its `type`; the bare string breaks the component.
          props: {[p]: info.props?.[p]?.type.startsWith('{') ? {type: v} : v},
        });
    for (const v of variants.slice(0, 12))
      items.push({
        group: g,
        name,
        label: v.label,
        tree: inParent({__element: name, props: {...defaults, ...v.props}}),
      });
  }
  items.push({
    group: 'pages',
    name: 'Sample app',
    label: '',
    tree: SAMPLE_PAGE,
  });
  /** @type {string[]} */
  const skipped = [];
  /** @type {Record<string, string>} */
  const templateImports = {};
  for (const t of PAGE_TEMPLATES) {
    const file = path.join(TEMPLATES_DIR, t, 'page.tsx');
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const missing = [
      ...src.matchAll(/^\s*(?:import|\})[^'"\n]*from\s+['"]([^'"]+)['"]/gm),
    ]
      .map(m => m[1])
      .filter(spec => !spec.startsWith('.') && !resolves(project, spec));
    if (missing.length) {
      const pkgs = [
        ...new Set(
          missing.map(s =>
            s.startsWith('@')
              ? s.split('/').slice(0, 2).join('/')
              : s.split('/')[0],
          ),
        ),
      ];
      skipped.push(
        `the ${t} page needs ${pkgs.join(', ')} (${installLine(project.cwd, pkgs)})`,
      );
      continue;
    }
    const local = `Template_${t.replace(/-/g, '_')}`;
    templateImports[local] = `./templates/${t}.tsx`;
    items.push({
      group: 'pages',
      name: `${t} template`,
      label: '',
      tree: {__element: local, props: {}},
    });
  }
  const order = (/** @type {import('./_catalog.mjs').CatalogItem} */ it) => {
    const i = SHEET_ORDER.indexOf(it.name);
    return SHOWCASE_GROUPS.indexOf(it.group ?? '') * 1000 + (i < 0 ? 500 : i);
  };
  const chosen = items
    .filter(it => !group || it.group === group)
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  /** @type {Record<string, string>} */
  const imports = {};
  for (const n of elementNames(chosen.map(i => i.tree))) {
    if (templateImports[n]) {
      imports[n] = templateImports[n];
      continue;
    }
    const spec = importPathOf(project, n);
    if (spec) imports[n] = spec;
  }
  return {
    items: chosen,
    imports,
    skipped: !group || group === 'pages' ? skipped : [],
  };
}

/** Wrapper props that open a layer. A part shown on the page stays closed. */
const OPEN_PROPS = ['isOpen', 'isMenuOpen', 'defaultOpen', 'defaultIsOpen'];

/**
 * How a component renders on its own: unchanged for a whole component; for
 * a part of another, inside the parent its playground names. Null for a part
 * with no such parent, or whose parent needs a parent of its own: the part
 * only works inside its parent, and the parent's own item shows it.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} name
 * @returns {((tree: import('./_catalog.mjs').Tree) => import('./_catalog.mjs').Tree) | null}
 */
function inParentOf(project, name) {
  const info = project.components[name];
  if (!info?.subComponentOf) return tree => tree;
  const wrapper = info.wrapper;
  if (!wrapper || project.components[wrapper.component]?.wrapper) return null;
  const props = Object.fromEntries(
    Object.entries(wrapper.props).filter(([k]) => !OPEN_PROPS.includes(k)),
  );
  return tree => ({__element: wrapper.component, props, children: [tree]});
}

/** @param {import('./_project.mjs').ThemeProject} project @param {string} spec */
function resolves(project, spec) {
  try {
    project.req.resolve(spec);
    return true;
  } catch {
    return false;
  }
}

/**
 * Template page modules the theme-building page imports, copied beside it.
 * @param {Record<string, string>} imports
 * @returns {Array<{name: string, from: string}>}
 */
function templateFiles(imports) {
  return Object.values(imports).flatMap(spec => {
    const m = /^\.\/templates\/([a-z0-9-]+)\.tsx$/.exec(spec);
    return m
      ? [
          {
            name: `templates/${m[1]}.tsx`,
            from: path.join(TEMPLATES_DIR, m[1], 'page.tsx'),
          },
        ]
      : [];
  });
}

/**
 * How a generated page imports the theme: its built module, its stylesheet,
 * and the stylesheets of open fonts the project has installed.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} fromDir the folder of the page
 */
export function themeImports(ctx, slug, data, fromDir) {
  const f = themeFiles(ctx.project.cwd, slug);
  /** @param {string} file */
  const rel = file => {
    const r = path.relative(fromDir, file).split(path.sep).join('/');
    return r.startsWith('.') ? r : `./${r}`;
  };
  const modes = modesOf(data);
  const fonts = fontPackages(ctx, data)
    .filter(x => x.installed)
    .map(x => `${x.pkg}/index.css`);
  return {
    module: rel(f.js),
    css: [rel(f.css), ...fonts],
    mode: /** @type {'system' | 'light' | 'dark'} */ (
      modes.length > 1 ? 'system' : modes[0]
    ),
  };
}

/**
 * Render the sample app page with the theme to themes/<slug>/preview.html.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {Promise<string>} the file written, as shown
 */
export async function renderPreview(ctx, slug, data) {
  const {project} = ctx;
  const imports = /** @type {Record<string, string>} */ ({});
  for (const n of elementNames(SAMPLE_PAGE)) {
    const spec = importPathOf(project, n);
    if (spec) imports[n] = spec;
  }
  const source = pageSource({
    items: [{name: 'page', label: '', tree: SAMPLE_PAGE}],
    imports,
    theme: themeImports(ctx, slug, data, renderDir(project)),
    layout: 'page',
    title: `${slug}: sample page`,
  });
  const {html} = await renderGenerated(project, `preview-${slug}.mjs`, source);
  const out = themeFiles(project.cwd, slug).preview;
  fs.writeFileSync(out, html);
  return shown(project.cwd, out);
}

/**
 * Render the theme-building page with the theme to one HTML file.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {{group?: string, out?: string}} [options]
 * @returns {Promise<{file: string, components: number, skipped: string[]}>}
 */
export async function renderSheet(ctx, slug, data, options = {}) {
  const {project} = ctx;
  const {items, imports, skipped} = showcaseItems(project, options.group);
  const source = pageSource({
    items,
    imports,
    theme: themeImports(ctx, slug, data, renderDir(project)),
    layout: 'sheet',
    title: `${slug}: every component${options.group ? ` (${options.group})` : ''}`,
  });
  const {html} = await renderGenerated(
    project,
    `sheet-${slug}.mjs`,
    source,
    templateFiles(imports),
  );
  const out = options.out ?? themeFiles(project.cwd, slug).sheet;
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, html);
  return {
    file: shown(project.cwd, out),
    components: new Set(items.map(i => i.name)).size,
    skipped,
  };
}

/** @param {unknown} v @returns {v is import('./_catalog.mjs').Tree} */
const isElement = v =>
  Boolean(
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof (/** @type {any} */ (v).__element) === 'string',
  );

/**
 * The Core name an element stands for, or null when Core has no module for
 * it. Some playground samples still use the old `XDS` prefix (`XDSVStack`).
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} name
 * @returns {string | null}
 */
function coreName(project, name) {
  if (importPathOf(project, name)) return name;
  const bare = name.replace(/^XDS(?=[A-Z])/, '');
  return bare !== name && importPathOf(project, bare) ? bare : null;
}

/**
 * A copy of an element tree with Core names only. An element Core has no
 * module for is left out.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {unknown} v
 * @returns {unknown}
 */
function withCoreNames(project, v) {
  if (Array.isArray(v))
    return v.map(x => withCoreNames(project, x)).filter(x => x !== undefined);
  if (isElement(v)) {
    const name = coreName(project, v.__element);
    if (!name) return undefined;
    const props = Object.fromEntries(
      Object.entries(v.props ?? {})
        .map(([k, x]) => [k, withCoreNames(project, x)])
        .filter(([, x]) => x !== undefined),
    );
    return {
      __element: name,
      props,
      ...(v.children === undefined
        ? {}
        : {children: withCoreNames(project, v.children)}),
    };
  }
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, withCoreNames(project, x)]),
    );
  return v;
}

/** @param {unknown} v @returns {boolean} */
const holdsElement = v =>
  isElement(v) || (Array.isArray(v) && v.some(holdsElement));

/**
 * A prop value that is source code, such as the name of a constant the page
 * defines. @param {unknown} v @returns {v is {__code: string}}
 */
const isCode = v =>
  Boolean(
    v &&
    typeof v === 'object' &&
    typeof (/** @type {any} */ (v).__code) === 'string',
  );

/** @param {unknown} v @param {number} depth @returns {string} */
function jsxValue(v, depth) {
  if (isElement(v)) return jsx(v, depth);
  if (isCode(v)) return v.__code;
  if (Array.isArray(v) && v.some(holdsElement))
    return `[${v
      .map((x, i) =>
        isElement(x)
          ? jsx({...x, props: {key: String(i), ...x.props}}, depth)
          : jsxValue(x, depth),
      )
      .join(', ')}]`;
  return JSON.stringify(v);
}

/**
 * JSX source for an element tree whose names are Core names. Each element
 * renders through `C`, the page's table of Core components.
 * @param {import('./_catalog.mjs').Tree} tree
 * @param {number} depth
 * @returns {string}
 */
function jsx(tree, depth) {
  const pad = '  '.repeat(depth);
  const {children: childProp, ...rest} = tree.props ?? {};
  const props = Object.entries(rest).map(([k, v]) =>
    typeof v === 'string' && !/[{}"<>&\n]/.test(v)
      ? `${k}="${v}"`
      : v === true
        ? k
        : `${k}={${jsxValue(v, depth + 1)}}`,
  );
  const kids = /** @type {unknown[]} */ (
    [].concat(/** @type {any} */ (tree.children ?? childProp ?? []))
  );
  const tag = `C.${tree.__element}`;
  const open = `<${tag}${props.length ? ` ${props.join(' ')}` : ''}`;
  if (!kids.length) return `${open} />`;
  const inner = kids
    .map(k =>
      isElement(k)
        ? `${pad}  ${jsx(k, depth + 1)}`
        : `${pad}  {${jsxValue(k, depth + 1)}}`,
    )
    .join('\n');
  return `${open}>\n${inner}\n${pad}</${tag}>`;
}

/**
 * The imports of a page and its table of components, `C`. Playground samples
 * are not full prop sets (a controlled part has no handler), so `C` takes
 * any props for each part; children must still be React nodes, and every
 * name must be imported from Core.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {unknown} trees element trees with Core names
 * @returns {string[]}
 */
function componentTable(project, trees) {
  /** @type {Map<string, string[]>} */
  const byModule = new Map();
  for (const name of [...elementNames(trees)].sort()) {
    const spec = /** @type {string} */ (importPathOf(project, name));
    byModule.set(spec, [...(byModule.get(spec) ?? []), name]);
  }
  const names = [...byModule.values()].flat();
  return [
    ...[...byModule].map(
      ([spec, list]) =>
        `import {${list.join(', ')}} from ${JSON.stringify(spec)};`,
    ),
    '',
    'type Part = React.ComponentType<{children?: React.ReactNode} & Record<string, unknown>>;',
    `const C = {${names.map(n => `${n}: ${n} as unknown as Part`).join(', ')}};`,
  ];
}

const SAFE = [
  '/** Shows a short note for a component that throws, so the rest of the page renders. */',
  'class Safe extends React.Component<{name: string, children: React.ReactNode}, {failed: boolean}> {',
  '  state = {failed: false};',
  '  static getDerivedStateFromError() {',
  '    return {failed: true};',
  '  }',
  '  render() {',
  '    return this.state.failed ? <div className="tp-note">{this.props.name} could not render here</div> : this.props.children;',
  '  }',
  '}',
];

/** The search source the page hands a part that needs one: a few fixed items. */
const SAMPLE_SOURCE = [
  'const SAMPLE_ITEMS = [',
  "  {id: 'design', label: 'Design'},",
  "  {id: 'engineering', label: 'Engineering'},",
  "  {id: 'research', label: 'Research'},",
  "  {id: 'marketing', label: 'Marketing'},",
  '];',
  'const SAMPLE_SOURCE = {',
  '  search: (query: string) => SAMPLE_ITEMS.filter(item => item.label.toLowerCase().includes(query.toLowerCase())),',
  '  bootstrap: () => SAMPLE_ITEMS,',
  '  cancel: () => {},',
  '};',
];

/**
 * A copy of an element tree in which every part that requires a search
 * source and has none gets the page's sample source. A typeahead without a
 * source throws when it unmounts, and that error leaves the boundary around
 * it, so leaving the page would crash the whole route.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {unknown} v
 * @returns {unknown}
 */
function withSources(project, v) {
  if (Array.isArray(v)) return v.map(x => withSources(project, x));
  if (isElement(v)) {
    const props = Object.fromEntries(
      Object.entries(v.props ?? {}).map(([k, x]) => [
        k,
        withSources(project, x),
      ]),
    );
    for (const [k, p] of Object.entries(
      project.components[v.__element]?.props ?? {},
    ))
      if (p.required && p.type.startsWith('SearchSource') && !(k in props))
        props[k] = {__code: 'SAMPLE_SOURCE'};
    return {
      ...v,
      props,
      ...(v.children === undefined
        ? {}
        : {children: withSources(project, v.children)}),
    };
  }
  return v;
}

/**
 * Whether an element tree uses the page's sample search source.
 * @param {unknown} v
 * @returns {boolean}
 */
const usesSource = v =>
  isCode(v)
    ? v.__code === 'SAMPLE_SOURCE'
    : Boolean(v && typeof v === 'object') &&
      Object.values(/** @type {object} */ (v)).some(usesSource);

/** The heading of each group on the components page. */
const GROUP_TITLES = /** @type {Record<string, string>} */ ({
  data: 'data display',
  overlays: 'overlays (shown open)',
});

/**
 * A cell with the component's name. A cell whose parts show nothing on
 * their own (no size and no text) says so, so no cell is blank.
 */
const CELL = [
  'function Cell({name, children}: {name: string, children: React.ReactNode}) {',
  '  const ref = React.useRef<HTMLDivElement>(null);',
  '  const [empty, setEmpty] = React.useState(false);',
  '  React.useEffect(() => {',
  "    const row = ref.current?.querySelector('.tp-row');",
  '    if (!row) return;',
  "    const shown = Array.from(row.querySelectorAll('.tp-item > :not(.tp-label)')).some(el => {",
  '      const box = el.getBoundingClientRect();',
  "      return (box.width > 2 && box.height > 2) || (el.textContent ?? '').trim() !== '';",
  '    });',
  '    setEmpty(!shown);',
  '  }, []);',
  '  return (',
  '    <div ref={ref} className="tp-cell">',
  '      <div className="tp-name">{name}</div>',
  '      {children}',
  '      {empty ? <div className="tp-note">{name} shows nothing on its own here: it needs content or a trigger</div> : null}',
  '    </div>',
  '  );',
  '}',
];

/**
 * The command that changes a component most, from what its main part reads:
 * its background, else its border, else its text color, else its corners;
 * `how <part>` when it reads none of them.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {import('./_compiler.mjs').Compiler} C
 * @param {string} name
 * @param {string | null} theme
 * @returns {string | null}
 */
function changeLine(project, C, name, theme) {
  const keys = project.targets
    .filter(t => t.component === name)
    .map(t => t.key);
  const kebabName = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const part = keys.includes(kebabName) ? kebabName : keys[0];
  if (!part) return null;
  const P = 'astryx experimental theme editor';
  const t = theme ?? '<theme>';
  for (const [aspect, value] of /** @type {const} */ ([
    ['background', '"<color>"'],
    ['border', '"1px solid <color>"'],
    ['text', '"<color>"'],
  ]))
    if (C.partReads(part, aspect).length)
      return `${P} set ${t} ${DIRECT[aspect]} ${value} --on ${part}`;
  if (C.showsCorners(part)) return `${P} set ${t} corners round --on ${part}`;
  return `${P} how ${part}`;
}

/** Layers that stay closed until a person opens them, and a frame with no content: on the page they show nothing. */
const PAGE_SKIP = new Set([
  'AspectRatio',
  'BottomSheet',
  'BottomSheetSwitcher',
  'Drawer',
  'Lightbox',
]);

/**
 * The source of the preview's components page: every component grouped,
 * each variant side by side, overlays open. Template pages are pages of
 * their own (`preview add --template`), so they are not on it.
 * Under each cell, one line: the command that changes the component most,
 * from what its part reads (`how <part>`).
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {{theme?: string | null, C?: import('./_compiler.mjs').Compiler}} [options]
 * @returns {{source: string, components: number}}
 */
export function componentsPageSource(project, {theme = null, C} = {}) {
  const items = showcaseItems(project, undefined)
    .items.filter(it => it.group !== 'pages' && !PAGE_SKIP.has(it.name))
    .map(it => ({
      ...it,
      tree: withSources(project, withCoreNames(project, it.tree)),
    }))
    .filter(it => it.tree !== undefined);
  /** @type {Map<string, Map<string, import('./_catalog.mjs').CatalogItem[]>>} */
  const groups = new Map();
  for (const it of items) {
    const g = groups.get(it.group ?? '') ?? new Map();
    const list = /** @type {import('./_catalog.mjs').CatalogItem[]} */ (
      g.get(it.name) ?? []
    );
    if (!list.some(x => x.label === it.label)) list.push(it);
    g.set(it.name, list);
    groups.set(it.group ?? '', g);
  }
  const sections = [...groups]
    .map(([g, comps]) => {
      const cells = [...comps]
        .map(([name, list]) => {
          const body = list
            .map(
              it =>
                `          <div className="tp-item">${it.label ? `\n            <div className="tp-label">${it.label}</div>` : ''}\n            <Safe name=${JSON.stringify(name)}>\n              ${jsx(/** @type {any} */ (it.tree), 7)}\n            </Safe>\n          </div>`,
            )
            .join('\n');
          const line = C ? changeLine(project, C, name, theme) : null;
          return `        <Cell name=${JSON.stringify(name)}>\n          <div className="tp-row">\n${body}\n          </div>${line ? `\n          <code className="tp-cmd">{${JSON.stringify(line)}}</code>` : ''}\n        </Cell>`;
        })
        .join('\n');
      return `      <section>\n        <h2 className="tp-group">${GROUP_TITLES[g] ?? g}</h2>\n        <div className="tp-grid">\n${cells}\n        </div>\n      </section>`;
    })
    .join('\n');
  const css = `.tp-group{font:600 14px ui-monospace,monospace;margin:16px 14px 0;opacity:.75}.tp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:14px}.tp-cell{border:1px dashed #8885;padding:10px;overflow:hidden}.tp-name{font:600 12px ui-monospace,monospace;opacity:.6;margin-bottom:8px}.tp-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}.tp-label{font:10px ui-monospace,monospace;opacity:.5}.tp-cmd{display:block;margin-top:10px;font:10px ui-monospace,monospace;opacity:.75;overflow-wrap:break-word}.tp-note{font:11px ui-monospace,monospace;opacity:.6;padding:6px 8px;border:1px dashed #8886}`;
  const source = [
    '// Written by `astryx experimental theme preview add`: every component grouped, each variant side by side, overlays open.',
    "'use client';",
    '',
    "import * as React from 'react';",
    ...componentTable(
      project,
      items.map(it => it.tree),
    ),
    '',
    ...SAFE,
    '',
    ...CELL,
    '',
    ...(usesSource(items) ? [...SAMPLE_SOURCE, ''] : []),
    'export default function ComponentsPage() {',
    '  return (',
    '    <div>',
    `      <style>{${JSON.stringify(css)}}</style>`,
    sections,
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
  return {source, components: new Set(items.map(i => i.name)).size};
}

/**
 * The source of the preview's Overview page: the theme at a glance, built
 * to show what themes most often break (see _overview.mjs). A header names
 * the theme, its fonts and its main colors; each section renders inside a
 * boundary, so one part that throws never blanks the page. The preview
 * route is the app shell, so the page has no shell of its own.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {{theme?: string | null}} [options]
 * @returns {string}
 */
export function overviewPageSource(project, {theme = null} = {}) {
  const sections = OVERVIEW_SECTIONS.map(x => ({
    title: x.title,
    tree: /** @type {import('./_catalog.mjs').Tree | undefined} */ (
      withCoreNames(project, x.tree)
    ),
  })).filter(x => x.tree !== undefined);
  const body = sections
    .map(
      x =>
        `      <section className="tp-section">\n        <h2 className="tp-group">${x.title}</h2>\n        <Safe name=${JSON.stringify(x.title)}>\n          ${jsx(/** @type {any} */ (x.tree), 5)}\n        </Safe>\n      </section>`,
    )
    .join('\n');
  const css =
    '.tp-page{display:grid;gap:20px;padding:24px 24px 160px;color:var(--color-text-primary)}' +
    '.tp-group{font:600 13px ui-monospace,monospace;margin:0 0 10px;opacity:.7;text-transform:uppercase;letter-spacing:.04em}' +
    '.tp-head{display:flex;flex-wrap:wrap;gap:16px;align-items:end;justify-content:space-between}' +
    '.tp-swatches{display:flex;flex-wrap:wrap;gap:8px}' +
    '.tp-swatch{display:grid;gap:4px;font:11px ui-monospace,monospace;color:var(--color-text-secondary)}' +
    '.tp-chip{width:56px;height:36px;border-radius:var(--radius-element);border:1px solid var(--color-border)}' +
    '.tp-note{font:11px ui-monospace,monospace;opacity:.6;padding:6px 8px;border:1px dashed #8886}';
  return [
    '// Written by `astryx experimental theme preview add`: the theme at a glance, built to show what themes most often break.',
    "'use client';",
    '',
    "import * as React from 'react';",
    ...componentTable(
      project,
      sections.map(x => x.tree),
    ),
    '',
    ...SAFE,
    '',
    '/** The main colors, as the theme resolves them. */',
    'const SWATCHES = [',
    ...[
      ['accent', '--color-accent'],
      ['neutral', '--color-background-surface'],
      ['text', '--color-text-primary'],
      ['info', '--color-info'],
      ['success', '--color-success'],
      ['warning', '--color-warning'],
      ['danger', '--color-error'],
    ].map(
      ([n, t]) =>
        `  {name: ${JSON.stringify(n)}, token: ${JSON.stringify(t)}},`,
    ),
    '];',
    '',
    '/** The first family of the body and heading fonts, read from the theme. */',
    'function FontNames() {',
    '  const ref = React.useRef<HTMLDivElement>(null);',
    "  const [fonts, setFonts] = React.useState('');",
    '  React.useEffect(() => {',
    '    if (!ref.current) return;',
    '    const style = getComputedStyle(ref.current);',
    "    const first = (token: string) => style.getPropertyValue(token).split(',')[0].replace(/[\"']/g, '').trim() || 'default';",
    "    setFonts(`Body: ${first('--font-family-body')}. Headings: ${first('--font-family-heading')}.`);",
    '  }, []);',
    '  return (',
    "    <div ref={ref} style={{color: 'var(--color-text-secondary)', fontSize: 13}}>",
    '      {fonts}',
    '    </div>',
    '  );',
    '}',
    '',
    'export default function OverviewPage() {',
    '  return (',
    '    <div className="tp-page">',
    `      <style>{${JSON.stringify(css)}}</style>`,
    '      <header className="tp-head">',
    '        <div>',
    `          <h1 style={{margin: 0, fontSize: 28}}>{${JSON.stringify(theme ? `${theme} at a glance` : 'The theme at a glance')}}</h1>`,
    '          <FontNames />',
    '        </div>',
    '        <div className="tp-swatches">',
    '          {SWATCHES.map(s => (',
    '            <div key={s.name} className="tp-swatch" title={s.token}>',
    '              <div className="tp-chip" style={{background: `var(${s.token})`}} />',
    '              {s.name}',
    '            </div>',
    '          ))}',
    '          <div className="tp-swatch" style={{alignSelf: \'center\'}}>Every shade: the Colors page</div>',
    '        </div>',
    '      </header>',
    body,
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/**
 * The source of the preview's Colors page: each generated color's shades in
 * light and dark, with the shade number, the hex, and the tokens that use
 * it. The shades come from the theme's generated color module, so the page
 * follows every change; `uses` and `seeds` are written in by the editor.
 * With no generated colors, the page says how to set one.
 * @param {{slug: string, module: string | null, seeds: Record<string, string>, uses: Record<string, Record<'light' | 'dark', Record<string, string[]>>>}} colors
 *   `module`: the import of the generated colors from the page, or null.
 * @returns {string}
 */
export function colorsPageSource({slug, module, seeds, uses}) {
  const head = [
    "// Written by `astryx experimental theme preview add`: the theme's generated colors.",
    '// `astryx experimental theme editor set` rewrites it with every change.',
    "'use client';",
    '',
    "import * as React from 'react';",
  ];
  const text = {color: 'var(--color-text-primary)'};
  const page = {
    padding: 32,
    display: 'grid',
    gap: 32,
    fontFamily: 'var(--font-family-body)',
    ...text,
  };
  if (!module)
    return [
      ...head,
      '',
      'export default function ColorsPage() {',
      '  return (',
      `    <div style={${JSON.stringify(page)}}>`,
      '      <p style={{margin: 0}}>',
      `        {${JSON.stringify(`This theme sets no color yet. Set one, and its shades show here: astryx experimental theme editor set ${slug} accent "#7c3aed"`)}}`,
      '      </p>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n');
  return [
    ...head,
    `import {palette} from ${JSON.stringify(module)};`,
    '',
    "type Mode = 'light' | 'dark';",
    'type Ramp = Readonly<Record<string, string>>;',
    '',
    `const SEEDS: Record<string, string> = ${JSON.stringify(seeds)};`,
    '// The tokens that use each shade, by color, mode and shade.',
    `const USES: Record<string, Partial<Record<Mode, Record<string, string[]>>>> = ${JSON.stringify(uses)};`,
    'const COLORS = Object.entries(palette) as Array<[string, Readonly<Record<Mode, Ramp>>]>;',
    "const MODES: Mode[] = ['light', 'dark'];",
    '',
    'export default function ColorsPage() {',
    '  return (',
    `    <div style={${JSON.stringify(page)}}>`,
    '      <div>',
    '        <h1 style={{margin: 0, fontSize: 28}}>Colors</h1>',
    "        <p style={{margin: '8px 0 0', color: 'var(--color-text-secondary)'}}>",
    `          {${JSON.stringify(`Each color is generated from one seed, light and dark. An outlined shade is one a token uses. Change one with: astryx experimental theme editor set ${slug} accent <color>`)}}`,
    '        </p>',
    '      </div>',
    '      {COLORS.map(([name, ramps]) => (',
    "        <section key={name} style={{display: 'grid', gap: 12}}>",
    "          <h2 style={{margin: 0, fontSize: 20, textTransform: 'capitalize'}}>",
    '            {name}',
    '            {SEEDS[name] ? (',
    "              <span style={{marginLeft: 8, fontSize: 14, fontWeight: 400, color: 'var(--color-text-secondary)'}}>",
    '                from {SEEDS[name]}',
    '              </span>',
    '            ) : null}',
    '          </h2>',
    '          {MODES.map(mode => (',
    "            <div key={mode} style={{display: 'grid', gap: 6}}>",
    "              <div style={{fontSize: 13, fontWeight: 600, textTransform: 'capitalize'}}>{mode}</div>",
    "              <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8}}>",
    '                {Object.entries(ramps[mode]).map(([shade, hex]) => {',
    '                  const tokens = USES[name]?.[mode]?.[shade] ?? [];',
    '                  return (',
    '                    <div',
    '                      key={shade}',
    "                      title={tokens.join(', ')}",
    '                      style={{',
    "                        border: tokens.length ? '2px solid var(--color-text-primary)' : '1px solid var(--color-border)',",
    '                        borderRadius: 8,',
    "                        overflow: 'hidden',",
    "                        background: 'var(--color-background-card)',",
    '                      }}>',
    '                      <div style={{background: hex, height: 48}} />',
    "                      <div style={{padding: 6, fontSize: 11, lineHeight: 1.4, fontFamily: 'ui-monospace, monospace'}}>",
    '                        <div>',
    '                          <strong>{shade}</strong> {hex}',
    '                        </div>',
    '                        {tokens.map(t => (',
    "                          <div key={t} style={{color: 'var(--color-text-secondary)', overflowWrap: 'anywhere'}}>",
    '                            {t}',
    '                          </div>',
    '                        ))}',
    '                      </div>',
    '                    </div>',
    '                  );',
    '                })}',
    '              </div>',
    '            </div>',
    '          ))}',
    '        </section>',
    '      ))}',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/**
 * The source of the preview route: an app shell with a side nav item per
 * preview page, a top bar with the theme name and, with a theme, a
 * light/dark/system switch, and the selected page in the content area. It is a normal page of
 * the app, so it keeps the app's layout, global CSS and providers.
 * @param {{pages: Array<{id: string, label: string, file: string}>, theme: {name: string, module: string, css: string[]} | null}} spec
 *   `file` relative to the route folder, without extension; no theme: the app's own theme
 * @returns {string}
 */
export function previewRouteSource({pages, theme}) {
  const name = theme?.name ?? 'app theme';
  const mode = theme
    ? [
        '          <SegmentedControl label="Color mode" size="sm" value={mode} onChange={v => setMode(v as Mode)}>',
        '            <SegmentedControlItem value="light" label="Light" />',
        '            <SegmentedControlItem value="dark" label="Dark" />',
        '            <SegmentedControlItem value="system" label="System" />',
        '          </SegmentedControl>',
      ]
    : [];
  // The frame fills the viewport with the theme's own page background, so
  // no root-layout background shows at the edges or on overscroll.
  const shell = [
    '      <div style={FRAME}>',
    '      <AppShell',
    '        height="fill"',
    '        topNav={',
    `          <TopNav label="Theme preview" heading={<strong>{${JSON.stringify(name)}}</strong>} endContent={`,
    ...(mode.length ? mode : ['          null']),
    '          } />',
    '        }',
    '        sideNav={',
    '          <SideNav>',
    '            {PAGES.map(p => (',
    '              <SideNavItem key={p.id} label={p.label} isSelected={p.id === current.id} onClick={() => setPage(p.id)} />',
    '            ))}',
    '          </SideNav>',
    '        }>',
    '        <current.Page />',
    '      </AppShell>',
    '      </div>',
  ];
  return [
    '// Written by `astryx experimental theme preview add`. `preview add`, `preview remove` and',
    '// theme-preview.json keep it: edit the list with those commands, not by hand.',
    "'use client';",
    '',
    "import * as React from 'react';",
    "import {AppShell} from '@astryxdesign/core/AppShell';",
    "import {SideNav, SideNavItem} from '@astryxdesign/core/SideNav';",
    "import {TopNav} from '@astryxdesign/core/TopNav';",
    ...(theme
      ? [
          "import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';",
          "import {Theme} from '@astryxdesign/core/theme';",
          `import {${camelName(theme.name)}Theme as theme} from ${JSON.stringify(theme.module.replace(/\.js$/, ''))};`,
          ...theme.css.map(c => `import ${JSON.stringify(c)};`),
        ]
      : []),
    ...pages.map(
      (p, i) => `import Page${i} from ${JSON.stringify(`./${p.file}`)};`,
    ),
    '',
    ...(theme ? ["type Mode = 'light' | 'dark' | 'system';", ''] : []),
    'const FRAME: React.CSSProperties = {',
    "  position: 'fixed',",
    '  inset: 0,',
    "  overflow: 'auto',",
    "  overscrollBehavior: 'none',",
    "  background: 'var(--color-background-body)',",
    "  color: 'var(--color-text-primary)',",
    '};',
    '',
    'const PAGES = [',
    ...pages.map(
      (p, i) =>
        `  {id: ${JSON.stringify(p.id)}, label: ${JSON.stringify(p.label)}, Page: Page${i}},`,
    ),
    '];',
    '',
    'export default function ThemePreviewPage() {',
    '  const [page, setPage] = React.useState(PAGES[0]?.id);',
    ...(theme
      ? ["  const [mode, setMode] = React.useState<Mode>('system');"]
      : []),
    '  const current = PAGES.find(p => p.id === page) ?? PAGES[0];',
    '  return (',
    ...(theme
      ? ['    <Theme theme={theme} mode={mode}>', ...shell, '    </Theme>']
      : ['    <>', ...shell, '    </>']),
    '  );',
    '}',
    '',
  ].join('\n');
}

/** @param {string} slug */
const camelName = slug => slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * A PNG of an HTML file, with a Playwright the project has installed, else
 * a Chrome or Chromium found on the machine. Null with a reason when neither
 * is there.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} html absolute
 * @param {string} png absolute
 * @param {'light' | 'dark'} mode
 * @returns {Promise<{ok: true, file: string} | {ok: false, reason: string}>}
 */
export async function screenshot(project, html, png, mode) {
  for (const pkg of ['playwright', 'playwright-core']) {
    /** @type {string} */
    let entry;
    try {
      entry = project.req.resolve(pkg);
    } catch {
      continue;
    }
    try {
      const pw = await import(pathToFileURL(entry).href);
      const chromium = pw.chromium ?? pw.default?.chromium;
      const browser = await chromium.launch(
        chromeBinary() ? {executablePath: chromeBinary()} : {},
      );
      try {
        const page = await browser.newPage({
          viewport: {width: 1280, height: 900},
          colorScheme: mode,
        });
        await page.goto(pathToFileURL(html).href, {waitUntil: 'load'});
        await page.screenshot({path: png, fullPage: true});
      } finally {
        await browser.close();
      }
      return {ok: true, file: shown(project.cwd, png)};
    } catch {
      // This Playwright has no browser to launch: try Chrome directly.
    }
  }
  const chrome = chromeBinary();
  if (chrome) {
    const r = spawnSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        `--screenshot=${png}`,
        '--window-size=1280,2400',
        ...(mode === 'dark' ? ['--force-dark-mode'] : []),
        pathToFileURL(html).href,
      ],
      {encoding: 'utf8', timeout: 60_000},
    );
    if (r.status === 0 && fs.existsSync(png))
      return {ok: true, file: shown(project.cwd, png)};
  }
  return {
    ok: false,
    reason: `No browser was found to take the picture. Install Playwright with its browser (${installLine(project.cwd, ['playwright'])}, then npx playwright install chromium), or install Google Chrome or Chromium. The HTML preview needs neither.`,
  };
}

/** A Chrome or Chromium on this machine, at a usual place or on PATH. */
function chromeBinary() {
  const names = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
  ];
  const fixed = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const f of fixed) if (fs.existsSync(f)) return f;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const n of names) {
      const f = path.join(dir, n);
      if (dir && fs.existsSync(f)) return f;
    }
  }
  return null;
}
