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
 * @typedef {{name: string, label: string, tree: unknown, group?: string, open?: boolean, openable?: boolean, onlyOpen?: boolean, openTree?: unknown, strip?: boolean, anchored?: boolean}} CatalogItem
 *   `open`: drawn open in a document after the server render (a popover,
 *   tooltip or menu, which Core places only once mounted: layers.mjs);
 *   `openable`: also shown open in the overlays section when it holds an
 *   overlay a press opens (a dropdown's menu, a selector's list);
 *   `onlyOpen`: in the page for that open look alone; `openTree`: the part
 *   as shown open, when a prop its doc names opens it (a dropdown's
 *   `isMenuOpen`); `strip`: on the sample page, drawn open in the strip of
 *   overlays below it; `anchored`: an overlay placed beside its trigger (it
 *   takes a placement), small, shown before the panels over the page
 */

import {LAYER_GLOBAL} from '../../foundation/render/layers.mjs';

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

/**
 * The Core components the in-app preview's top bar draws (its title and
 * its light/dark/system switch). The route imports these, and the contrast
 * check measures each one's text over the header, as the app shows it.
 */
export const TOP_BAR_COMPONENTS = Object.freeze([
  'TopNav',
  'TopNavHeading',
  'SegmentedControl',
  'SegmentedControlItem',
]);

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
 * Where an element of a page comes from: a module specifier, bound to the
 * export named like the element, or a module and the export it is (a
 * template page is its file's `default`).
 * @typedef {string | {from: string, export: string}} Binding
 */

/** The module a binding imports. @param {Binding} b */
export const bindingFrom = b => (typeof b === 'string' ? b : b.from);

/**
 * The few fixed items of the sample search source a page hands a part that
 * requires one (a typeahead): the editor's pages and the catalog the part
 * data is read from use these same items.
 */
export const SAMPLE_SEARCH_ITEMS = Object.freeze([
  {id: 'design', label: 'Design'},
  {id: 'engineering', label: 'Engineering'},
  {id: 'research', label: 'Research'},
  {id: 'marketing', label: 'Marketing'},
]);

/** The prop value that stands for the page's sample search source. */
export const SAMPLE_SOURCE = Object.freeze({__code: 'SAMPLE_SOURCE'});

/**
 * The page module source for a list of items. Each item renders on its own,
 * so one component that throws leaves the rest of the page. With a theme,
 * each item renders inside `<Theme>`; a theme with both modes follows the
 * viewer's scheme, and a bar of three CSS-only switches (auto, light, dark)
 * flips it, since the file runs no script.
 * @param {object} spec
 * @param {CatalogItem[]} spec.items
 * @param {Record<string, Binding>} spec.imports element name -> the module
 *   it comes from (bound to the export of the same name), or the module and
 *   the export it is
 * @param {{module: string, css: string[], mode: 'system' | 'light' | 'dark'} | null} spec.theme
 *   module and css are import specifiers relative to the page
 * @param {'catalog' | 'sheet' | 'page'} spec.layout
 * @param {string} [spec.title]
 * @param {string} [spec.section] the section a sheet shows alone, as a class on its page
 * @returns {string}
 */
export function pageSource({
  items,
  imports,
  theme,
  layout,
  title = '',
  section = '',
}) {
  /** @type {Map<string, Array<[string, string]>>} element and export, per module */
  const byModule = new Map();
  for (const [name, b] of Object.entries(imports)) {
    const spec = bindingFrom(b);
    const list = byModule.get(spec) ?? [];
    list.push([name, typeof b === 'string' ? name : b.export]);
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
    for (const [n, exp] of names)
      entries.push(`${JSON.stringify(n)}: M${i}[${JSON.stringify(exp)}]`);
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
  // The sample search source a part that requires one gets (a typeahead):
  // the prop names it, the page defines it.
  lines.push(`const SAMPLE_ITEMS = ${JSON.stringify(SAMPLE_SEARCH_ITEMS)};`);
  lines.push(
    'const SAMPLE_SOURCE = {search: q => SAMPLE_ITEMS.filter(i => i.label.toLowerCase().includes(String(q).toLowerCase())), bootstrap: () => SAMPLE_ITEMS, cancel: () => {}};',
  );
  lines.push(
    'function fix(p) { const o = {}; for (const [k, v] of Object.entries(p)) o[k] = v && typeof v === "object" && v.__code === "SAMPLE_SOURCE" ? SAMPLE_SOURCE : isEl(v) || (Array.isArray(v) && v.some(isEl)) ? el(v) : v; for (const k of HANDLERS) if (!(k in o)) o[k] = noop; return o; }',
  );
  lines.push(`const ITEMS = ${JSON.stringify(items)};`);
  lines.push(
    theme
      ? 'const theme = Object.values(ThemeModule).find(v => v && typeof v === "object" && typeof v.name === "string");'
      : 'const theme = null;',
  );
  lines.push(`const MODE = ${JSON.stringify(theme?.mode ?? 'light')};`);
  lines.push(
    // A part shown open whose server render leaves only a layer's marker
    // (Core places a popover, tooltip or menu once mounted) goes to the
    // render's drawing of open layers, which puts it in place after the
    // server render. Any other part is its server render. `open` is
    // 'ifOpen' for a part shown only for its open look: drawn as nothing when
    // nothing opens.
    `function html(tree, mode = MODE, open = false) { try { const node = el(tree); const whole = theme ? React.createElement(Theme, {theme, mode}, node) : node; const markup = renderToStaticMarkup(whole); const layered = markup.includes('<template></template>'); if (open === 'ifOpen' && !layered) return null; const draw = open && layered ? globalThis[${JSON.stringify(LAYER_GLOBAL)}] : null; return draw ? draw(whole, open === 'ifOpen') : markup; } catch { return null; } }`,
  );
  // A theme with both modes: each part is rendered in light and in dark, as
  // the app renders it in each (a part that picks its look from the mode as
  // it renders, such as a Toast's text on its inverted surface, differs);
  // a part whose two renders are the same is written once.
  lines.push(
    'function modes(tree, open) { if (!theme || MODE !== "system") { const one = html(tree, MODE, open); return one == null ? null : {one}; } const light = html(tree, "light", open); const dark = html(tree, "dark", open); if (light == null && dark == null) return null; return light === dark ? {one: light} : {light: light ?? "", dark: dark ?? ""}; }',
  );
  lines.push(`const LAYOUT = ${JSON.stringify(layout)};`);
  lines.push(`const SECTION = ${JSON.stringify(section ?? '')};`);
  lines.push(`const TITLE = ${JSON.stringify(title)};`);
  lines.push(`const SHEET_CSS = ${JSON.stringify(SHEET_CSS)};`);
  // The parts as live elements, for drawing the overlays they show or open
  // (render-page's openLayers): the page itself holds only their markup.
  lines.push(`const h = React.createElement;
export function openLayerElements() {
  return ITEMS.map(it => { const node = el(it.tree); return theme ? h(Theme, {theme, mode: MODE === 'system' ? 'light' : MODE}, node) : node; });
}
export default function Page() {
  if (LAYOUT === 'catalog') {
    return h('div', null, ITEMS.map((it, i) => {
      const markup = html(it.tree);
      return markup == null ? null : h('section', {key: i, 'data-cat': it.name, dangerouslySetInnerHTML: {__html: markup}});
    }));
  }
  const rendered = ITEMS.map(it => ({...it, markup: modes(it.tree, it.open)})).filter(it => it.markup != null);
  // A part only in this page for its open look (the overlays section alone)
  // is not shown closed.
  const done = rendered.filter(it => !it.onlyOpen);
  // A part with a closed control that opens a popup (a dropdown's menu
  // button, a selector's field: the controls the drawing presses) is shown
  // open too, with the overlays, so a look's menus and lists show in the
  // pictures.
  const opensPopup = html => (html.match(/<[^>]*\\baria-expanded="false"[^>]*>/g) ?? []).some(tag => /\\baria-haspopup=|\\brole="combobox"/.test(tag));
  for (const it of rendered) {
    const m = it.markup;
    if (!it.openable || !opensPopup(m.one ?? m.light)) continue;
    const open = modes(it.openTree ?? it.tree, 'ifOpen');
    if (open) done.push({...it, group: 'overlays', label: 'open', markup: open, opened: true});
  }
  const part = (m, key) => m.one != null
    ? h('div', {key, dangerouslySetInnerHTML: {__html: m.one}})
    : h(React.Fragment, {key}, h('div', {className: 'cs-light', dangerouslySetInnerHTML: {__html: m.light}}), h('div', {className: 'cs-dark', dangerouslySetInnerHTML: {__html: m.dark}}));
  const bar = MODE === 'system'
    ? h('div', {className: 'cs-bar'}, h('strong', null, TITLE),
        ['auto', 'light', 'dark'].map(m => h('label', {key: m}, h('input', {type: 'radio', name: 'cs-mode', id: 'cs-' + m, defaultChecked: m === 'auto'}), ' ' + m)))
    : h('div', {className: 'cs-bar'}, h('strong', null, TITLE), h('span', null, MODE + ' only'));
  let body;
  if (LAYOUT === 'page') {
    // The page, then the overlays drawn open in a strip below it.
    const strip = done.filter(it => it.strip || it.opened);
    body = [
      ...done.filter(it => !it.strip && !it.opened).map((it, i) => part(it.markup, i)),
      strip.length
        ? h('section', {key: 'strip', className: 'cs-strip'},
            h('div', {className: 'cs-strip-name'}, 'open overlays'),
            h('div', {className: 'cs-strip-row'}, strip.map((it, i) => h('div', {key: i, className: 'cs-strip-item'},
              h('div', {className: 'cs-label'}, it.name),
              part(it.markup)))))
        : null,
    ];
  } else {
    const groups = [];
    // In the overlays section the small overlays drawn open beside their
    // triggers (a tooltip, a menu, a list) come first; a panel over the
    // whole page (a dialog, a drawer) after them.
    const small = it => it.opened || (it.open && it.anchored);
    const ordered = [...done.filter(small), ...done.filter(it => !small(it))];
    for (const it of ordered) {
      let g = groups.find(x => x.name === (it.group ?? ''));
      if (!g) { g = {name: it.group ?? '', cells: []}; groups.push(g); }
      let c = g.cells.find(x => x.name === it.name);
      if (!c) { c = {name: it.name, list: []}; g.cells.push(c); }
      if (!c.list.some(x => x.label === it.label)) c.list.push(it);
    }
    body = groups.map(g => h('section', {key: g.name, className: g.name === 'overlays' ? 'cs-group cs-open-group' : 'cs-group'},
      g.name ? h('h2', {className: 'cs-group-name'}, g.name) : null,
      h('div', {className: g.name === 'pages' ? 'cs-pages' : 'cs-sheet'}, g.cells.map(c => h('div', {key: c.name, className: 'cs-cell', style: {'--cs-examples': c.list.length}},
        h('div', {className: 'cs-name'}, c.name),
        h('div', {className: 'cs-row'}, c.list.map((x, j) => h('div', {key: j, className: 'cs-item'},
          x.label ? h('div', {className: 'cs-label'}, x.label) : null,
          x.opened ? h('div', {className: 'cs-open'}, part(x.markup)) : part(x.markup)))))))));
  }
  const page = h('div', {className: SECTION ? 'cs-page cs-section-' + SECTION : 'cs-page', style: {background: 'var(--color-background-body)', color: 'var(--color-text-primary)', minHeight: '100vh'}}, bar, body);
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
  // A part rendered in each mode: the render of the mode the page shows.
  '.cs-dark{display:none}',
  '@media (prefers-color-scheme:dark){.cs-light{display:none}.cs-dark{display:block}}',
  'body:has(#cs-light:checked) .cs-light,body:has(#cs-dark:checked) .cs-dark{display:block!important}',
  'body:has(#cs-light:checked) .cs-dark,body:has(#cs-dark:checked) .cs-light{display:none!important}',
  '.cs-group-name{font:600 14px ui-monospace,monospace;margin:16px 14px 0;opacity:.75}',
  '.cs-sheet{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:14px}',
  '.cs-pages{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:14px}',
  '.cs-cell{border:1px dashed #8885;padding:10px;overflow:hidden;max-height:340px}',
  '.cs-pages .cs-cell{max-height:none}',
  // An overlay drawn open is shown at the height of what it holds (a date
  // range's calendar, a command palette), up to the height of the window a
  // picture is taken in (900px), as a person sees it on a screen.
  '.cs-open-group .cs-cell{max-height:900px}',
  // A panel that fills the window (a drawer, a bottom sheet, a lightbox)
  // takes an equal share of that height for each of its examples, so every
  // example is drawn, never one panel filling the cell.
  '.cs-open-group .cs-cell dialog{max-height:calc((860px - (var(--cs-examples, 1) - 1) * 34px) / var(--cs-examples, 1))!important}',
  '.cs-name{font:600 12px ui-monospace,monospace;opacity:.6;margin-bottom:8px}',
  '.cs-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}',
  '.cs-label{font:10px ui-monospace,monospace;opacity:.5}',
  '.cs-item{max-width:100%;position:relative}',
  // Overlays shown open in place: a layer the page would open with script
  // (its root alone: a hidden helper popover inside it stays hidden), and a
  // panel over the page (a drawer, a bottom sheet, a lightbox) at the size
  // of its cell.
  '.cs-strip{padding:16px 14px;border-top:1px dashed #8885}',
  '.cs-strip-name{font:600 12px ui-monospace,monospace;opacity:.6;margin-bottom:8px}',
  '.cs-strip-row{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}',
  '.cs-strip-item{max-width:300px;position:relative}',
  '.cs-strip [popover][data-astryx-layer-root]{display:block!important;position:relative!important;inset:auto!important;margin:8px 0 0!important;translate:none!important;transform:none!important}',
  '.cs-cell [popover][data-astryx-layer-root]{display:block!important;position:relative!important;inset:auto!important;margin:8px 0 0!important;translate:none!important;transform:none!important}',
  // A part shown for its open look that opened nothing has no cell.
  '.cs-cell:has(.cs-open):not(:has(.cs-open [data-astryx-layer-root])){display:none}',
  // The overlays section's own page (sheet-overlays.png): five to a row,
  // each cell at most 300px tall (a panel over the page cropped to its
  // top), so its picture stays under about 1600px, the small overlays
  // first. The full sheet keeps each at a window's height.
  '.cs-section-overlays .cs-open-group .cs-sheet{grid-template-columns:repeat(5,minmax(0,1fr))}',
  '.cs-section-overlays .cs-open-group .cs-cell{max-height:300px}',
  '.cs-section-overlays .cs-open-group .cs-cell dialog{max-height:260px!important}',
  '.cs-cell dialog{display:block!important;position:relative!important;inset:auto!important;margin:0!important;max-width:100%!important;max-height:300px!important;translate:none!important;transform:none!important}',
].join('');
