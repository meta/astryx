// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The pages `astryx experimental theme` renders: a catalog of every
 * component (to learn what each part reads, and for the contact sheet) and a
 * sample app page (the preview). Each page is written as a page module and
 * rendered by the same machinery as `astryx experimental render`, with the
 * project's own React and Core.
 *
 * Pages are element trees (`{__element, props, children}`), the shape of a
 * component doc's playground defaults, so a component the installed Core
 * does not have renders as nothing instead of breaking the page.
 *
 * @position api/theme-edit — page sources for the part data and previews
 */

/**
 * @typedef {{__element: string, props?: Record<string, unknown>, children?: unknown}} Tree
 * @typedef {{name: string, label: string, tree: unknown, group?: string}} CatalogItem
 */

/** @param {string} name @param {Record<string, unknown>} [props] @param {...unknown} children @returns {Tree} */
export const h = (name, props = {}, ...children) => ({
  __element: name,
  props,
  ...(children.length ? {children} : {}),
});

const ROWS = [
  {id: 1, task: 'Review Q4 roadmap', owner: 'Alex', status: 'In progress'},
  {id: 2, task: 'Ship onboarding flow', owner: 'Sam', status: 'Done'},
  {id: 3, task: 'Fix login timeout', owner: 'Riley', status: 'Blocked'},
];

/** The sample app page every preview shows. */
export const SAMPLE_PAGE = h(
  'AppShell',
  {
    height: 'auto',
    contentPadding: 4,
    topNav: h('TopNav', {
      label: 'Main',
      heading: h('Text', {weight: 'bold'}, 'Open Items'),
      startContent: h(
        'HStack',
        {gap: 1},
        h('TopNavItem', {label: 'Inbox', href: '#', isSelected: true}),
        h('TopNavItem', {label: 'Projects', href: '#'}),
        h('TopNavItem', {label: 'Reports', href: '#'}),
      ),
      endContent: h('Button', {
        label: 'New item',
        variant: 'primary',
        size: 'sm',
      }),
    }),
    sideNav: h(
      'SideNav',
      {label: 'Sections'},
      h('SideNavItem', {label: 'My tasks', href: '#', isSelected: true}),
      h('SideNavItem', {label: 'Team', href: '#'}),
      h('SideNavItem', {label: 'Archive', href: '#'}),
    ),
  },
  h(
    'VStack',
    {gap: 4},
    h(
      'VStack',
      {gap: 1},
      h('Heading', {level: 1, type: 'display-2'}, 'Plan the week ahead'),
      h(
        'Text',
        {type: 'supporting'},
        'Everything your team is working on, in one place.',
      ),
    ),
    h('Heading', {level: 2}, 'My tasks'),
    h('Banner', {
      status: 'info',
      title: 'Weekly sync moved to Thursday',
      description: 'The agenda doc is updated.',
      collapsible: false,
    }),
    h(
      'TabList',
      {value: 'open'},
      h('Tab', {value: 'open', label: 'Open'}),
      h('Tab', {value: 'done', label: 'Done'}),
      h('Tab', {value: 'all', label: 'All'}),
    ),
    h(
      'HStack',
      {gap: 4, align: 'start'},
      h(
        'Card',
        {width: 340},
        h(
          'VStack',
          {gap: 3},
          h(
            'HStack',
            {gap: 2, align: 'center'},
            h('Heading', {level: 3}, 'New task'),
            h('Badge', {variant: 'info', label: 'Draft'}),
            h('Badge', {variant: 'neutral', label: 'Personal'}),
          ),
          h('TextInput', {label: 'Title', value: 'Prepare launch notes'}),
          h('Switch', {label: 'Notify my team', value: true}),
          h('CheckboxInput', {label: 'Add to calendar', value: true}),
          h('ProgressBar', {label: 'Progress', value: 60, hasValueLabel: true}),
          h(
            'HStack',
            {gap: 2},
            h('Button', {label: 'Save', variant: 'primary'}),
            h('Button', {label: 'Preview', variant: 'secondary'}),
            h('Button', {label: 'Cancel', variant: 'ghost'}),
            h('Button', {label: 'Delete', variant: 'destructive'}),
          ),
        ),
      ),
      h(
        'Card',
        {width: 400},
        h(
          'VStack',
          {gap: 3},
          h('Heading', {level: 3}, 'This week'),
          h('Table', {
            data: ROWS,
            idKey: 'id',
            columns: [
              {key: 'task', header: 'Task'},
              {key: 'owner', header: 'Owner'},
              {key: 'status', header: 'Status'},
            ],
          }),
          h(
            'HStack',
            {gap: 2, align: 'center'},
            h('StatusDot', {variant: 'success', label: 'ok'}),
            h('Badge', {variant: 'success', label: '2 done'}),
            h('StatusDot', {variant: 'warning', label: 'risk'}),
            h('Badge', {variant: 'warning', label: '1 at risk'}),
            h('StatusDot', {variant: 'error', label: 'blocked'}),
            h('Badge', {variant: 'error', label: '1 blocked'}),
          ),
        ),
      ),
    ),
  ),
);

/** Components first on the contact sheet, in this order. */
export const SHEET_ORDER = [
  'Heading',
  'Text',
  'Button',
  'Badge',
  'Banner',
  'Card',
  'TextInput',
  'TextArea',
  'NumberInput',
  'Selector',
  'CheckboxInput',
  'Switch',
  'ProgressBar',
  'TabList',
  'SegmentedControl',
  'TopNav',
  'SideNav',
  'Table',
  'StatusDot',
];

/**
 * Every component name an element tree uses.
 * @param {unknown} v
 * @param {Set<string>} [out]
 * @returns {Set<string>}
 */
export function elementNames(v, out = new Set()) {
  if (Array.isArray(v)) for (const x of v) elementNames(x, out);
  else if (v && typeof v === 'object') {
    const el = /** @type {any} */ (v).__element;
    if (typeof el === 'string') out.add(el);
    for (const x of Object.values(v)) elementNames(x, out);
  }
  return out;
}

/**
 * The page module source for a list of items. Each item renders on its own,
 * so one component that throws leaves the rest of the page. With a theme,
 * each item renders inside `<Theme>`; a theme with both modes follows the
 * viewer's scheme, and a bar of three CSS-only switches (auto, light, dark)
 * flips it, since the file runs no script.
 * @param {object} spec
 * @param {CatalogItem[]} spec.items
 * @param {Record<string, string>} spec.imports component name -> module specifier
 * @param {{module: string, css: string[], mode: 'system' | 'light' | 'dark'} | null} spec.theme
 *   module and css are import specifiers relative to the page
 * @param {'catalog' | 'sheet' | 'page'} spec.layout
 * @param {string} [spec.title]
 * @returns {string}
 */
export function pageSource({items, imports, theme, layout, title = ''}) {
  /** @type {Map<string, string[]>} */
  const byModule = new Map();
  for (const [name, spec] of Object.entries(imports)) {
    const list = byModule.get(spec) ?? [];
    list.push(name);
    byModule.set(spec, list);
  }
  const lines = [
    '// Generated by astryx experimental theme. It is rebuilt on every run.',
    "import * as React from 'react';",
    "import {renderToStaticMarkup} from 'react-dom/server';",
  ];
  if (theme) {
    lines.push("import {Theme} from '@astryxdesign/core/theme';");
    lines.push(`import * as ThemeModule from ${JSON.stringify(theme.module)};`);
    for (const c of theme.css) lines.push(`import ${JSON.stringify(c)};`);
  }
  const entries = [];
  let i = 0;
  for (const [spec, names] of byModule) {
    lines.push(`import * as M${i} from ${JSON.stringify(spec)};`);
    for (const n of names)
      entries.push(`${JSON.stringify(n)}: M${i}[${JSON.stringify(n)}]`);
    i++;
  }
  lines.push(`const C = {${entries.join(', ')}};`);
  lines.push('const noop = () => {};');
  lines.push(
    'const HANDLERS = ["onChange", "onClick", "onDismiss", "onOpenChange", "onSelect", "onValueChange"];',
  );
  lines.push(
    'const isEl = v => Boolean(v && typeof v === "object" && !Array.isArray(v) && v.__element);',
  );
  lines.push(
    'function el(v) { if (Array.isArray(v)) return v.map(el); if (v && typeof v === "object" && v.__element) { const T = C[v.__element]; if (!T) return null; return React.createElement(T, fix(v.props ?? {}), ...[].concat(v.children ?? []).map(el)); } return v; }',
  );
  lines.push(
    'function fix(p) { const o = {}; for (const [k, v] of Object.entries(p)) o[k] = isEl(v) || (Array.isArray(v) && v.some(isEl)) ? el(v) : v; for (const k of HANDLERS) if (!(k in o)) o[k] = noop; return o; }',
  );
  lines.push(`const ITEMS = ${JSON.stringify(items)};`);
  lines.push(
    theme
      ? 'const theme = Object.values(ThemeModule).find(v => v && typeof v === "object" && typeof v.name === "string");'
      : 'const theme = null;',
  );
  lines.push(`const MODE = ${JSON.stringify(theme?.mode ?? 'light')};`);
  lines.push(
    'function html(tree) { try { const node = el(tree); return renderToStaticMarkup(theme ? React.createElement(Theme, {theme, mode: MODE}, node) : node); } catch { return null; } }',
  );
  lines.push(`const LAYOUT = ${JSON.stringify(layout)};`);
  lines.push(`const TITLE = ${JSON.stringify(title)};`);
  lines.push(`const SHEET_CSS = ${JSON.stringify(SHEET_CSS)};`);
  lines.push(`const h = React.createElement;
export default function Page() {
  if (LAYOUT === 'catalog') {
    return h('div', null, ITEMS.map((it, i) => {
      const markup = html(it.tree);
      return markup == null ? null : h('section', {key: i, 'data-cat': it.name, dangerouslySetInnerHTML: {__html: markup}});
    }));
  }
  const done = ITEMS.map(it => ({...it, markup: html(it.tree)})).filter(it => it.markup != null);
  const bar = MODE === 'system'
    ? h('div', {className: 'cs-bar'}, h('strong', null, TITLE),
        ['auto', 'light', 'dark'].map(m => h('label', {key: m}, h('input', {type: 'radio', name: 'cs-mode', id: 'cs-' + m, defaultChecked: m === 'auto'}), ' ' + m)))
    : h('div', {className: 'cs-bar'}, h('strong', null, TITLE), h('span', null, MODE + ' only'));
  let body;
  if (LAYOUT === 'page') {
    body = done.map((it, i) => h('div', {key: i, dangerouslySetInnerHTML: {__html: it.markup}}));
  } else {
    const groups = [];
    for (const it of done) {
      let g = groups.find(x => x.name === (it.group ?? ''));
      if (!g) { g = {name: it.group ?? '', cells: []}; groups.push(g); }
      let c = g.cells.find(x => x.name === it.name);
      if (!c) { c = {name: it.name, list: []}; g.cells.push(c); }
      if (!c.list.some(x => x.label === it.label)) c.list.push(it);
    }
    body = groups.map(g => h('section', {key: g.name, className: 'cs-group'},
      g.name ? h('h2', {className: 'cs-group-name'}, g.name) : null,
      h('div', {className: g.name === 'pages' ? 'cs-pages' : 'cs-sheet'}, g.cells.map(c => h('div', {key: c.name, className: 'cs-cell'},
        h('div', {className: 'cs-name'}, c.name),
        h('div', {className: 'cs-row'}, c.list.map((x, j) => h('div', {key: j, className: 'cs-item'},
          x.label ? h('div', {className: 'cs-label'}, x.label) : null,
          h('div', {dangerouslySetInnerHTML: {__html: x.markup}})))))))));
  }
  const page = h('div', {className: 'cs-page', style: {background: 'var(--color-background-body)', color: 'var(--color-text-primary)', minHeight: '100vh'}}, bar, body);
  return h('main', null, h('style', {dangerouslySetInnerHTML: {__html: SHEET_CSS}}), theme ? h(Theme, {theme, mode: MODE}, page) : page);
}`);
  return `${lines.join('\n')}\n`;
}

/** The light and dark switches, and the contact sheet grid. */
export const SHEET_CSS = [
  'body{margin:0}',
  '.cs-bar{position:sticky;top:0;z-index:100;display:flex;gap:14px;align-items:center;padding:8px 14px;font:12px ui-monospace,monospace;background:Canvas;color:CanvasText;border-bottom:1px solid #8884}',
  'body:has(#cs-light:checked),body:has(#cs-light:checked) [data-astryx-theme]{color-scheme:light!important}',
  'body:has(#cs-dark:checked),body:has(#cs-dark:checked) [data-astryx-theme]{color-scheme:dark!important}',
  '.cs-group-name{font:600 14px ui-monospace,monospace;margin:16px 14px 0;opacity:.75}',
  '.cs-sheet{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:14px}',
  '.cs-pages{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:14px}',
  '.cs-cell{border:1px dashed #8885;padding:10px;overflow:hidden;max-height:340px}',
  '.cs-pages .cs-cell{max-height:none}',
  '.cs-name{font:600 12px ui-monospace,monospace;opacity:.6;margin-bottom:8px}',
  '.cs-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}',
  '.cs-label{font:10px ui-monospace,monospace;opacity:.5}',
  '.cs-item{max-width:100%;position:relative}',
  // Overlays shown open in place: a layer the page would open with script.
  '.cs-cell [popover]{display:block!important;position:relative!important;inset:auto!important;margin:8px 0 0!important;translate:none!important;transform:none!important}',
].join('');
