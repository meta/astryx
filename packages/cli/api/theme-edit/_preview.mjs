// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Previews for `astryx experimental theme`: the sample app page and
 * the theme-building page (every component grouped, overlays open, and real
 * template pages), rendered with the theme to self-contained HTML by the
 * render machinery, or written into the app as a page module. PNG pictures
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
import {fontPackages, modesOf, themeFiles, shown} from './_settings.mjs';
import {importPathOf, installLine} from './_project.mjs';

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

/** What each group holds, for help and `--group`. */
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
    const values = info.targets[0]?.values ?? {};
    /** @type {Array<Record<string, string>>} */
    const variants = [{}];
    for (const p of ['variant', 'status', 'color'])
      for (const v of values[p] ?? []) variants.push({[p]: v});
    for (const v of variants.slice(0, 12))
      items.push({
        group: g,
        name,
        label: Object.values(v).join(' '),
        tree: {__element: name, props: {...defaults, ...v}},
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
function themeImports(ctx, slug, data, fromDir) {
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

/** @param {unknown} v @param {number} depth @returns {string} */
function jsxValue(v, depth) {
  if (
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    /** @type {any} */ (v).__element
  )
    return jsx(/** @type {any} */ (v), depth);
  return JSON.stringify(v);
}

/**
 * JSX source for an element tree.
 * @param {import('./_catalog.mjs').Tree} tree
 * @param {number} depth
 * @returns {string}
 */
function jsx(tree, depth) {
  const pad = '  '.repeat(depth);
  const props = Object.entries(tree.props ?? {}).map(([k, v]) =>
    typeof v === 'string' && !/[{}"\n]/.test(v)
      ? `${k}="${v}"`
      : v === true
        ? k
        : `${k}={${jsxValue(v, depth + 1)}}`,
  );
  const kids = /** @type {unknown[]} */ (
    [].concat(/** @type {any} */ (tree.children ?? []))
  );
  const open = `<${tree.__element}${props.length ? ` ${props.join(' ')}` : ''}`;
  if (!kids.length) return `${open} />`;
  const inner = kids
    .map(k =>
      k && typeof k === 'object'
        ? `${pad}  ${jsx(/** @type {any} */ (k), depth + 1)}`
        : `${pad}  {${JSON.stringify(k)}}`,
    )
    .join('\n');
  return `${open}>\n${inner}\n${pad}</${tree.__element}>`;
}

/**
 * Write the theme-building page into the app: a page module that uses the
 * app's own Astryx, with a light and dark switch, plus the template pages
 * it shows, beside it.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} dir absolute folder to write into
 * @param {string | undefined} group
 * @returns {{files: string[], components: number, skipped: string[]}}
 */
export function writeShowcase(ctx, slug, data, dir, group) {
  const {project} = ctx;
  const {items, imports, skipped} = showcaseItems(project, group);
  const ti = themeImports(ctx, slug, data, dir);
  /** @type {Map<string, string[]>} */
  const byModule = new Map();
  /** @type {string[]} */
  const files = [];
  for (const [name, spec] of Object.entries(imports)) {
    const m = /^\.\/templates\/([a-z0-9-]+)\.tsx$/.exec(spec);
    if (m) {
      const file = path.join(dir, `theme-preview-${m[1]}.tsx`);
      fs.mkdirSync(dir, {recursive: true});
      fs.copyFileSync(path.join(TEMPLATES_DIR, m[1], 'page.tsx'), file);
      files.push(shown(project.cwd, file));
      byModule.set(`./theme-preview-${m[1]}`, [`default as ${name}`]);
      continue;
    }
    const list = byModule.get(spec) ?? [];
    list.push(name);
    byModule.set(spec, list);
  }
  const modeOnly = ti.mode === 'system' ? null : ti.mode;
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
                `          <div className="tp-item">${it.label ? `\n            <div className="tp-label">${it.label}</div>` : ''}\n            <Safe>\n              ${jsx(/** @type {any} */ (it.tree), 7)}\n            </Safe>\n          </div>`,
            )
            .join('\n');
          return `        <div className="tp-cell">\n          <div className="tp-name">${name}</div>\n          <div className="tp-row">\n${body}\n          </div>\n        </div>`;
        })
        .join('\n');
      return `      <section>\n        <h2 className="tp-group">${g}</h2>\n        <div className="${g === 'pages' ? 'tp-pages' : 'tp-grid'}">\n${cells}\n        </div>\n      </section>`;
    })
    .join('\n');
  const css = `.tp-bar{position:sticky;top:0;z-index:100;display:flex;gap:14px;align-items:center;padding:8px 14px;font:12px ui-monospace,monospace;border-bottom:1px solid #8884;background:var(--color-background-body)}.tp-group{font:600 14px ui-monospace,monospace;margin:16px 14px 0;opacity:.75}.tp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:14px}.tp-pages{display:grid;gap:14px;padding:14px}.tp-cell{border:1px dashed #8885;padding:10px;overflow:hidden}.tp-name{font:600 12px ui-monospace,monospace;opacity:.6;margin-bottom:8px}.tp-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}.tp-label{font:10px ui-monospace,monospace;opacity:.5}`;
  const source = [
    `// Written by \`astryx experimental theme preview ${slug}\`: a page for building the ${slug} theme.`,
    '// Every component grouped, each variant side by side, overlays open, and full template pages.',
    "'use client';",
    '',
    "import * as React from 'react';",
    "import {Theme} from '@astryxdesign/core/theme';",
    `import {${slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Theme as theme} from ${JSON.stringify(ti.module.replace(/\.js$/, ''))};`,
    ...ti.css.map(c => `import ${JSON.stringify(c)};`),
    ...[...byModule].map(
      ([spec, names]) =>
        `import {${names.join(', ')}} from ${JSON.stringify(spec)};`,
    ),
    '',
    'const noop = () => {};',
    '',
    '/** Shows nothing for a component that throws, so the rest of the page renders. */',
    'class Safe extends React.Component<{children: React.ReactNode}, {failed: boolean}> {',
    '  state = {failed: false};',
    '  static getDerivedStateFromError() {',
    '    return {failed: true};',
    '  }',
    '  render() {',
    '    return this.state.failed ? null : this.props.children;',
    '  }',
    '}',
    '',
    'export default function ThemePreviewPage() {',
    `  const [mode, setMode] = React.useState<'light' | 'dark'>(${JSON.stringify(modeOnly ?? 'light')});`,
    '  return (',
    '    <Theme theme={theme} mode={mode}>',
    `      <style>{${JSON.stringify(css)}}</style>`,
    "      <div style={{background: 'var(--color-background-body)', color: 'var(--color-text-primary)', minHeight: '100vh'}}>",
    '        <div className="tp-bar">',
    `          <strong>${slug}</strong>`,
    modeOnly
      ? `          <span>${modeOnly} only</span>`
      : "          {(['light', 'dark'] as const).map(m => (\n            <label key={m}>\n              <input type=\"radio\" checked={mode === m} onChange={() => setMode(m)} /> {m}\n            </label>\n          ))}",
    '        </div>',
    sections,
    '      </div>',
    '    </Theme>',
    '  );',
    '}',
    '',
  ].join('\n');
  fs.mkdirSync(dir, {recursive: true});
  const main = path.join(dir, 'theme-preview.tsx');
  fs.writeFileSync(
    main,
    source.replace(/onChange=\{noop\}/g, 'onChange={noop}'),
  );
  void SHOWCASE_GROUP_HELP;
  return {
    files: [shown(project.cwd, main), ...files],
    components: new Set(items.map(i => i.name)).size,
    skipped,
  };
}

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
