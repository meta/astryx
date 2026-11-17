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
 * @typedef {{name: string, label: string, tree: unknown, group?: string, open?: boolean, mounted?: boolean, openable?: boolean, onlyOpen?: boolean, openTree?: unknown, strip?: boolean, anchored?: boolean, states?: boolean}} CatalogItem
 *   `open`: drawn open in a document after the server render (a popover,
 *   tooltip or menu, which Core places only once mounted: layers.mjs);
 *   `mounted`: drawn as the browser shows it once it runs, nothing opened
 *   (a part Core finishes as it mounts: a table's selected row);
 *   `openable`: also shown open in the overlays section when it holds an
 *   overlay a press opens (a dropdown's menu, a selector's list);
 *   `onlyOpen`: in the page for that open look alone; `openTree`: the part
 *   as shown open, when a prop its doc names opens it (a dropdown's
 *   `isMenuOpen`); `strip`: on the sample page, drawn open in the strip of
 *   overlays below it; `anchored`: an overlay placed beside its trigger (it
 *   takes a placement), small, shown before the panels over the page;
 *   `states`: drawn at rest, hovered, focused from the keyboard and pressed
 *   (a control of the sample page), when it holds a control to focus
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
      // A link in running text, as an app writes one: its color is read on
      // the page.
      h(
        'Text',
        {type: 'supporting'},
        'Everything your team is working on, in one place. ',
        h('Link', {href: '#'}, 'See the plan'),
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
          // A link in a card's text: its color is read on the card.
          h(
            'Text',
            {type: 'body'},
            'Shared with your team. ',
            h('Link', {href: '#'}, 'Change who sees it'),
          ),
          h('TextInput', {label: 'Title', value: 'Prepare launch notes'}),
          h('Switch', {label: 'Notify my team', value: true}),
          h('CheckboxInput', {label: 'Add to calendar', value: true}),
          h('ProgressBar', {label: 'Progress', value: 60, hasValueLabel: true}),
          // The buttons wrap to a second row when a theme's buttons are
          // wider than the card (a roomier padding, a larger text): a
          // label is never cut short by the sample's own width.
          h(
            'HStack',
            {gap: 2, wrap: 'wrap'},
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
          // Striped, so a theme's stripes (either parity) show on the page.
          h('Table', {
            data: ROWS,
            idKey: 'id',
            isStriped: true,
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
 * Overlays the overlays section draws open in a deeper state than their docs
 * show: a menu with its submenu open, a popover that holds a form, a date and
 * time field with its time list, a table with a row selected and a column
 * sorted, and the navigation drawer of a narrow screen. Each is drawn as the
 * other overlays are: open as it mounts, or opened by the drawing's presses
 * (`openable`). A part a hook configures (a table's plugins) names the hook
 * and its state as data (`{__plugin, ...}`), and the page calls the hook.
 * @type {ReadonlyArray<import('./_catalog.mjs').CatalogItem>}
 */
export const OPEN_SCENES = Object.freeze([
  {
    name: 'DropdownMenu',
    label: 'submenu',
    openable: true,
    tree: h('DropdownMenu', {
      button: {label: 'Move'},
      items: [
        {label: 'Rename'},
        {
          label: 'Move to',
          items: [{label: 'Inbox'}, {label: 'Archive'}, {label: 'Trash'}],
        },
        {label: 'Delete'},
      ],
    }),
  },
  {
    name: 'Popover',
    label: 'form',
    open: true,
    anchored: true,
    tree: h('Popover', {
      isOpen: true,
      label: 'Filter tasks',
      hasAutoFocus: false,
      content: h(
        'VStack',
        {gap: 3},
        h('TextInput', {label: 'Owner', value: 'Alex'}),
        h('CheckboxInput', {label: 'Only open items', value: true}),
        h(
          'HStack',
          {gap: 2},
          h('Button', {label: 'Apply', variant: 'primary'}),
          h('Button', {label: 'Reset', variant: 'ghost'}),
        ),
      ),
      children: h('Button', {label: 'Filter', variant: 'secondary'}),
    }),
  },
  {
    name: 'DateTimeInput',
    label: 'time list',
    openable: true,
    tree: h('DateTimeInput', {
      label: 'Starts',
      value: '2026-11-16T09:30',
      timeOptionInterval: 30,
    }),
  },
  {
    // Core marks a selected row and a sorted column as the browser runs
    // (the row's selected state, the column's sort glyph), so the table is
    // drawn as it mounts, with its plugins in that state.
    name: 'Table',
    label: 'selected and sorted',
    mounted: true,
    tree: h('Table', {
      idKey: 'id',
      data: [
        {id: '1', name: 'Alice', role: 'Engineer', status: 'Active'},
        {id: '2', name: 'Bob', role: 'Designer', status: 'Away'},
        {id: '3', name: 'Charlie', role: 'Manager', status: 'Active'},
      ],
      columns: [
        {key: 'name', header: 'Name', sortable: true},
        {key: 'role', header: 'Role', sortable: true},
        {key: 'status', header: 'Status'},
      ],
      plugins: {
        selection: {__plugin: 'useTableSelection', selected: ['2']},
        sortable: {
          __plugin: 'useTableSortable',
          sort: [{sortKey: 'name', direction: 'ascending'}],
        },
      },
    }),
  },
  {
    name: 'CommandPalette',
    label: 'highlighted',
    // Its picker highlights the chosen item once its first results come,
    // so it is drawn as the browser shows it after mounting.
    mounted: true,
    tree: h('CommandPalette', {
      isOpen: true,
      isInline: true,
      searchSource: SAMPLE_SOURCE,
      value: SAMPLE_SEARCH_ITEMS[1].id,
    }),
  },
  {
    name: 'MobileNav',
    label: 'open',
    open: true,
    tree: h(
      'MobileNav',
      {isOpen: true, header: 'Navigation'},
      h(
        'SideNavSection',
        {title: 'Main'},
        h('SideNavItem', {label: 'Inbox', href: '#', isSelected: true}),
        h('SideNavItem', {label: 'Projects', href: '#'}),
        h('SideNavItem', {label: 'Reports', href: '#'}),
      ),
    ),
  },
]);

/**
 * Each control of the sample page once (a button of each variant, a field,
 * a switch, a tab, a nav item), for the states section. A part of a parent
 * (a tab) stays inside the parent the page puts it in, alone there.
 * @returns {Array<{tree: Tree, label: string}>}
 */
export function sampleControls() {
  /** @type {Map<string, {tree: Tree, label: string}>} */
  const out = new Map();
  /** @param {unknown} v @param {Tree | null} parent */
  const walk = (v, parent) => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x, parent);
      return;
    }
    if (!v || typeof v !== 'object') return;
    const e = /** @type {Tree} */ (v);
    if (typeof e.__element !== 'string') return;
    const inner = [...Object.values(e.props ?? {}), e.children];
    if (elementNames(inner).size) {
      for (const x of inner) walk(x, e);
      return;
    }
    const props = e.props ?? {};
    const siblings = /** @type {unknown[]} */ ([]).concat(
      parent?.children ?? [],
    );
    const inParent = parent != null && siblings.includes(e);
    // A part its parent holds selected by value (a tab), or that says so.
    const selected =
      props.isSelected === true ||
      (inParent && props.value != null && parent?.props?.value === props.value);
    // One of each look: a variant at a size, selected or not.
    const label = [props.variant, props.size, selected ? 'selected' : '']
      .filter(x => typeof x === 'string' && x)
      .join(' ');
    const key = `${e.__element} ${label}`;
    if (out.has(key)) return;
    out.set(key, {
      tree: inParent && parent ? {...parent, children: [e]} : e,
      label,
    });
  };
  walk(SAMPLE_PAGE, null);
  return [...out.values()];
}

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
 * Every component name an element tree uses, and every hook its plugins
 * name.
 * @param {unknown} v
 * @param {Set<string>} [out]
 * @returns {Set<string>}
 */
export function elementNames(v, out = new Set()) {
  if (Array.isArray(v)) for (const x of v) elementNames(x, out);
  else if (v && typeof v === 'object') {
    const el = /** @type {any} */ (v).__element;
    if (typeof el === 'string') out.add(el);
    // A hook a part's plugin names is imported as a part is.
    const hook = /** @type {any} */ (v).__plugin;
    if (typeof hook === 'string') out.add(hook);
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
    'function el(v) { if (Array.isArray(v)) return v.map(el); if (v && typeof v === "object" && v.__element) { const T = C[v.__element] ?? (/^[a-z][a-z0-9]*$/.test(v.__element) ? v.__element : null); if (!T) return null; const props = fix(v.props ?? {}); if (props.plugins && Object.values(props.plugins).some(isPlugin)) return React.createElement(Plugged, {T, props}); return React.createElement(T, props, ...[].concat(v.children ?? []).map(el)); } return v; }',
  );
  // A plugin named as data ({__plugin: hook, ...state}) is the hook's
  // return, called in a component of the page's own, with the state the data
  // gives it: a table's selected rows, its sorted columns.
  lines.push(
    'const isPlugin = v => Boolean(v && typeof v === "object" && typeof v.__plugin === "string");',
  );
  lines.push(
    'const PLUGIN_CONFIG = {useTableSelection: (spec, props) => ({getIsItemSelected: item => (spec.selected ?? []).includes(String(item[props.idKey ?? "id"])), onSelectItem: noop, onSelectAll: noop, getIsAllSelected: () => false, getIsIndeterminate: () => (spec.selected ?? []).length > 0}), useTableSortable: spec => ({sort: spec.sort ?? [], onSortChange: noop})};',
  );
  lines.push(
    'function Plugged({T, props}) { const plugins = {}; for (const [k, spec] of Object.entries(props.plugins)) plugins[k] = isPlugin(spec) && C[spec.__plugin] && PLUGIN_CONFIG[spec.__plugin] ? C[spec.__plugin](PLUGIN_CONFIG[spec.__plugin](spec, props)) : spec; return React.createElement(T, {...props, plugins}); }',
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
    // nothing opens. Content Core keeps inert in its server render waits for
    // what only the browser knows (a calendar's month waits for today's
    // date), so a part that holds it is drawn as the browser mounts it; so
    // is an overlay shown open with no layer, which loads what it lists once
    // mounted (a command palette's items).
    `function html(tree, mode = MODE, open = false) { try { const node = el(tree); const whole = theme ? React.createElement(Theme, {theme, mode}, node) : node; const markup = renderToStaticMarkup(whole); const layered = markup.includes('<template></template>'); if (open === 'ifOpen' && !layered) return null; const mounted = open === 'mounted' || open === true && !layered || !open && markup.includes(' inert=""'); const draw = (open && layered) || mounted ? globalThis[${JSON.stringify(LAYER_GLOBAL)}] : null; return draw ? draw(whole, mounted ? 'mounted' : open === 'ifOpen') : markup; } catch { return null; } }`,
  );
  // A theme with both modes: each part is rendered in light and in dark, as
  // the app renders it in each (a part that picks its look from the mode as
  // it renders, such as a Toast's text on its inverted surface, differs);
  // a part whose two renders are the same is written once.
  lines.push(
    'function modes(tree, open) { if (!theme || MODE !== "system") { const one = html(tree, MODE, open); return one == null ? null : {one}; } const light = html(tree, "light", open); const dark = html(tree, "dark", open); if (light == null && dark == null) return null; return light === dark ? {one: light} : {light: light ?? "", dark: dark ?? ""}; }',
  );
  lines.push(`const LAYOUT = ${JSON.stringify(layout)};`);
  // How the sheet groups the parts drawn into its sections, written into
  // the page from the functions below (what reads the sheet's sections
  // reads the same).
  lines.push(
    String(openGroupOf),
    String(sheetGroups),
    String(sheetSectionClass),
  );
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
  const rendered = ITEMS.map(it => ({...it, markup: modes(it.tree, it.mounted ? 'mounted' : it.open)})).filter(it => it.markup != null);
  // A part only in this page for its open look (the overlays section alone)
  // is not shown closed.
  const done = rendered.filter(it => !it.onlyOpen);
  // A part with a closed control that opens a popup (a dropdown's menu
  // button, a selector's field: the controls the drawing presses), or with
  // a layer's marker and no such control (a context menu's area, which a
  // right click opens), is shown open too, with the overlays, so a look's
  // menus and lists show in the pictures.
  // On one family's own page its parts drawn open follow the family, named
  // for it; on the whole sheet they join the overlays.
  const OPEN_GROUP = openGroupOf(SECTION);
  const opensPopup = html => html.includes('<template></template>') || (html.match(/<[^>]*\\baria-expanded="false"[^>]*>/g) ?? []).some(tag => /\\baria-haspopup=|\\brole="combobox"/.test(tag));
  for (const it of rendered) {
    const m = it.markup;
    if (!it.openable || !opensPopup(m.one ?? m.light)) continue;
    const open = modes(it.openTree ?? it.tree, 'ifOpen');
    if (open) done.push({...it, group: OPEN_GROUP, label: it.label || 'open', markup: open, opened: true});
  }
  // A control of the sample page drawn in each state a person puts it in:
  // the render's stylesheet applies a state's rules to what is marked with
  // it (render-page.mjs), so a picture shows hover, keyboard focus and a
  // press with no pointer or keyboard. Hover and press reach the control
  // and all it holds, as a pointer over it does; focus reaches the first
  // element that takes it, as a Tab does.
  const FOCUSABLE = /<(?:button|input|select|textarea)\\b|<a\\b(?=[^>]*\\shref=)|<[a-z][\\w-]*\\b(?=[^>]*\\stabindex="0")/;
  const inState = (html, state) => {
    if (state === 'focus') { const m = FOCUSABLE.exec(html); return m ? html.slice(0, m.index) + m[0] + ' data-astryx-state="focus"' + html.slice(m.index + m[0].length) : html; }
    return '<div data-astryx-state="' + state + '">' + html + '</div>';
  };
  const STATES = [['rest', null], ['hover', 'hover'], ['focus-visible', 'focus'], ['pressed', 'hover active']];
  const stated = [];
  for (const it of done.filter(x => x.states)) {
    const m = it.markup;
    if (!FOCUSABLE.test(m.one ?? m.light)) continue;
    const each = f => m.one != null ? {one: f(m.one)} : {light: f(m.light), dark: f(m.dark)};
    stated.push({...it, rows: STATES.map(([label, s]) => ({label, markup: s ? each(html => inState(html, s)) : m}))});
  }
  const drawn = done.filter(x => !x.states);
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
    const strip = drawn.filter(it => it.strip || it.opened);
    body = [
      ...drawn.filter(it => !it.strip && !it.opened).map((it, i) => part(it.markup, i)),
      strip.length
        ? h('section', {key: 'strip', className: 'cs-strip'},
            h('div', {className: 'cs-strip-name'}, 'open overlays'),
            h('div', {className: 'cs-strip-row'}, strip.map((it, i) => h('div', {key: i, className: 'cs-strip-item'},
              h('div', {className: 'cs-label'}, it.name),
              part(it.markup)))))
        : null,
    ];
  } else {
    const groups = sheetGroups(drawn, OPEN_GROUP);
    body = groups.map(g => h('section', {key: g.name, className: sheetSectionClass(g.name, OPEN_GROUP)},
      g.name ? h('h2', {className: 'cs-group-name'}, g.name) : null,
      h('div', {className: g.name === 'pages' ? 'cs-pages' : 'cs-sheet'}, g.cells.map(c => h('div', {key: c.name, className: 'cs-cell', style: {'--cs-examples': c.list.length}},
        h('div', {className: 'cs-name'}, c.name),
        h('div', {className: 'cs-row'}, c.list.map((x, j) => h('div', {key: j, className: 'cs-item'},
          x.label ? h('div', {className: 'cs-label'}, x.label) : null,
          x.opened ? h('div', {className: 'cs-open'}, part(x.markup)) : part(x.markup)))))))));
    // On the overlays section's own page the states come first, so its
    // picture shows them in its first screen.
    if (stated.length)
      body[SECTION === 'overlays' ? 'unshift' : 'push'](h('section', {key: 'states', className: 'cs-group cs-states cs-family-states'},
        h('h2', {className: 'cs-group-name'}, 'states'),
        h('div', {className: 'cs-states-grid'},
          h('div', {className: 'cs-states-row cs-states-head'}, h('div', null), STATES.map(([label]) => h('div', {key: label, className: 'cs-label'}, label))),
          stated.map((it, i) => h('div', {key: i, className: 'cs-states-row'},
            h('div', {className: 'cs-name'}, it.name + (it.label ? ' ' + it.label : '')),
            it.rows.map((r, j) => h('div', {key: j, className: 'cs-states-cell'}, part(r.markup))))))));
  }
  const page = h('div', {className: SECTION ? 'cs-page cs-section-' + SECTION : 'cs-page', style: {background: 'var(--color-background-body)', color: 'var(--color-text-primary)', minHeight: '100vh'}}, bar, body);
  return h('main', null, h('style', {dangerouslySetInnerHTML: {__html: SHEET_CSS}}), theme ? h(Theme, {theme, mode: MODE}, page) : page);
}`);
  return `${lines.join('\n')}\n`;
}

/**
 * The section a sheet puts the parts it draws open in: on one family's own
 * page, that family's open section; on the whole sheet, the overlays.
 * Written into the page as well (pageSource).
 * @param {string} section the family the page is of, or ''
 */
export function openGroupOf(section) {
  return section && section !== 'overlays' ? section + ', open' : 'overlays';
}

/**
 * The sections of a sheet, in order, with their cells, from the parts it
 * draws: by each part's group, in the order of the parts. In the overlays
 * section the small overlays drawn open beside their triggers (a tooltip,
 * a menu, a list) come first, a panel over the whole page (a dialog, a
 * drawer) after them; on a family's page its parts drawn open follow it.
 * Written into the page as well (pageSource).
 * @param {Array<{name: string, group?: string, label?: string, opened?: boolean, open?: unknown, anchored?: boolean}>} drawn
 * @param {string} openGroup the section of the parts drawn open
 * @returns {Array<{name: string, cells: Array<{name: string, list: any[]}>}>}
 */
export function sheetGroups(drawn, openGroup) {
  /** @type {Array<{name: string, cells: Array<{name: string, list: any[]}>}>} */
  const groups = [];
  const small = (/** @type {any} */ it) =>
    it.opened || (it.open && it.anchored);
  const ordered =
    openGroup === 'overlays'
      ? [...drawn.filter(small), ...drawn.filter(it => !small(it))]
      : [...drawn.filter(it => !it.opened), ...drawn.filter(it => it.opened)];
  for (const it of ordered) {
    let g = groups.find((/** @type {any} */ x) => x.name === (it.group ?? ''));
    if (!g) {
      g = {name: it.group ?? '', cells: []};
      groups.push(g);
    }
    let c = g.cells.find((/** @type {any} */ x) => x.name === it.name);
    if (!c) {
      c = {name: it.name, list: []};
      g.cells.push(c);
    }
    if (!c.list.some((/** @type {any} */ x) => x.label === it.label))
      c.list.push(it);
  }
  return groups;
}

/**
 * A sheet section's class: its family's, by which the full sheet is cut
 * into a page for each family (familyPages). Written into the page as well
 * (pageSource).
 * @param {string} name
 * @param {string} openGroup
 */
export function sheetSectionClass(name, openGroup) {
  return (
    (name === openGroup ? 'cs-group cs-open-group' : 'cs-group') +
    ' cs-family-' +
    name.replace(/[^a-z0-9]+/g, '-')
  );
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
  // Cells wrap, about three to a row; a cell is never narrower than what it
  // holds (a calendar, a stepper, a toolbar), so nothing is cut at its edge:
  // a wide part takes a row of its own.
  '.cs-sheet{display:flex;flex-wrap:wrap;align-items:flex-start;gap:14px;padding:14px}',
  '.cs-sheet>.cs-cell{flex:1 1 360px;min-width:min-content;max-width:100%;box-sizing:border-box}',
  '.cs-pages{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:14px}',
  // A cell is as tall as what it holds, so every variant is drawn whole.
  // A focus ring drawn outside a part at the cell's edge shows whole: the
  // cell clips only past a ring's reach.
  '.cs-cell{border:1px dashed #8885;padding:10px;overflow:clip;overflow-clip-margin:8px}',
  '.cs-pages .cs-cell{max-height:none}',
  // A panel that fills the window (a drawer, a bottom sheet, a lightbox)
  // takes an equal share of that height for each of its examples, so every
  // example is drawn, never one panel filling the cell.
  '.cs-open-group .cs-cell dialog{max-height:calc((860px - (var(--cs-examples, 1) - 1) * 34px) / var(--cs-examples, 1))!important}',
  '.cs-name{font:600 12px ui-monospace,monospace;opacity:.6;margin-bottom:8px}',
  '.cs-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}',
  '.cs-label{font:10px ui-monospace,monospace;opacity:.5}',
  // An item takes a share of its row, so a part as wide as its container
  // (a divider, a form layout) is drawn at a width, never at none.
  '.cs-item{max-width:100%;position:relative;flex:1 1 200px;min-width:min-content}',
  // A part that needs a row's width (a table, code, an app shell) takes the
  // whole row of the grid, so its text is never cut or wrapped mid-word.
  '.cs-sheet>.cs-cell:has(table,pre,.astryx-app-shell){flex-basis:100%}',
  // A part that needs a row's width draws each variant on a row of its own,
  // and an app shell on the sheet at a height that shows its frame, not a
  // window's (the pages section draws the sample app whole).
  '.cs-sheet>.cs-cell:has(table,pre,.astryx-app-shell)>.cs-row>.cs-item{flex-basis:100%}',
  '.cs-sheet .cs-item .astryx-app-shell{height:360px!important;min-height:0!important}',
  // A frame that draws nothing of its own (an aspect ratio) shows its box.
  '.cs-item .astryx-aspect-ratio{outline:1px dashed #8888}',
  // A part as tall as its container (a vertical divider) is drawn at a
  // height, never at none.
  '.cs-item:has([role="separator"][aria-orientation="vertical"]) [data-astryx-theme]{display:flex;height:64px}',
  // Overlays shown open in place: a layer the page would open with script
  // (its root alone: a hidden helper popover inside it stays hidden), and a
  // panel over the page (a drawer, a bottom sheet, a lightbox) at the size
  // of its cell.
  '.cs-strip{padding:16px 14px;border-top:1px dashed #8885}',
  '.cs-strip-name{font:600 12px ui-monospace,monospace;opacity:.6;margin-bottom:8px}',
  '.cs-strip-row{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}',
  '.cs-strip-item{max-width:300px;position:relative}',
  '.cs-strip [popover][data-astryx-layer-root]{display:block!important;position:relative!important;inset:auto!important;margin:8px 0 0!important;translate:none!important;transform:none!important}',
  // An overlay shown in place keeps its own width (a popover that holds a
  // form, a date input's calendar): its cell grows to hold it.
  '.cs-cell [popover][data-astryx-layer-root]{display:block!important;position:relative!important;inset:auto!important;margin:8px 0 0!important;translate:none!important;transform:none!important;box-sizing:border-box!important}',
  // A layer opened from inside another (a submenu's flyout) sits beside it.
  '.cs-cell [data-astryx-layer-nest]{display:flex;align-items:flex-start;gap:4px}',
  '.cs-cell [data-astryx-layer-nest] > [data-astryx-layer-root]{margin-top:8px!important}',
  // A part shown for its open look that opened nothing has no cell.
  '.cs-cell:has(.cs-open):not(:has(.cs-open [data-astryx-layer-root])){display:none}',
  // The overlays section's own page (sheet-overlays.png): five to a row,
  // a panel over the page cropped to its top at 260px, the small overlays
  // first.
  '.cs-section-overlays .cs-open-group .cs-sheet>.cs-cell{flex-basis:200px}',
  '.cs-section-overlays .cs-open-group .cs-cell dialog{max-height:260px!important}',
  // The states section: one row per control, one column per state.
  '.cs-states-grid{display:grid;gap:10px;padding:14px}',
  '.cs-states-row{display:grid;grid-template-columns:160px repeat(4,minmax(0,1fr));gap:14px;align-items:center}',
  '.cs-states-cell{min-width:0;overflow:clip;overflow-clip-margin:8px;padding:6px}',
  // A panel wider than its cell (a narrow screen's navigation drawer) is
  // drawn from its start, never cut at the start.
  // A dialog drawn in place holds its panel in place too: a panel placed
  // over the window (a navigation drawer at the window's edge) would leave
  // the dialog with no height, and the cell empty.
  '.cs-cell dialog > *{max-width:100%!important;position:relative!important;inset:auto!important}',
  '.cs-cell dialog{display:block!important;position:relative!important;inset:auto!important;margin:0!important;max-width:100%!important;max-height:300px!important;translate:none!important;transform:none!important}',
].join('');
