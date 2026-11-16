// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Worker for `astryx experimental render`: loads one page module from
 * the project (TypeScript, JSX and StyleX compiled in memory) and renders its
 * default export to static markup with the project's own React.
 *
 * It runs in a worker thread of a small host process (page-host.mjs), so a
 * page that never finishes rendering can be stopped, nothing the page prints
 * reaches the CLI's own output, and a crash of Node itself ends only the host,
 * never the CLI.
 *
 * Outside a project, the Astryx packages the page's folder lacks resolve
 * from the package set the CLI runs from (served-packages.mjs), and React and
 * StyleX always come from that set, so the page loads one copy of each.
 *
 * Charts the page imports from recharts draw only after their effects run,
 * so the server render sets them aside and draws them after it with React
 * DOM in a small document (charts.mjs).
 *
 * Overlays (a tooltip, a menu) render on the server as markers alone; with
 * `openLayers`, the page is drawn again the same way (or the elements its
 * `openLayerElements()` export gives, for a page that holds only their
 * markup) and each overlay they show or open is added after the markup
 * (layers.mjs). A part the page asks to be drawn open in its own place
 * (through the global layers.mjs names) is drawn the same way and put where
 * its marker is, with each overlay it opened after it.
 *
 * With `buildScript`, the page's modules and the modules they use are also
 * bundled for the browser by esbuild (client-bundle.mjs) into one script,
 * which draws the page over its markup in the browser.
 *
 * @input workerData {entry, root, scope, served, withoutSegmenter, openLayers, buildScript, esbuild}
 * @output one message: {ok: true, markup, css, files, texts, logs, script} or
 *   {ok: false, error: {code, message, detail?}}
 * @position foundation/render — started by page-host.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import Module, {builtinModules, createRequire, register} from 'node:module';
import {pathToFileURL} from 'node:url';
import {format, stripVTControlCharacters} from 'node:util';
import {parentPort, workerData} from 'node:worker_threads';
import {transformSync} from '@babel/core';
import {LOAD_EXTENSIONS, existingFile, matchPath, pathsFor, resolvePath} from './ts-paths.mjs';
import {createJiti} from 'jiti';
import {assetDataUri, isAssetPath} from './assets.mjs';
import {SINGLE_COPY, isServedPackage, packageOf, resolveServed} from './served-packages.mjs';
import {findNodeModulesPackage} from '../fs/paths.mjs';
import {importSpecifiers, moduleImports} from './embedded-imports.mjs';
import {sha256} from './source-block.mjs';
import {BundleError, CARRIED_MODULE, bundleForBrowser} from './client-bundle.mjs';
import {droppedImports} from './value-uses.mjs';
import {CHART_GLOBAL, CHART_ROOTS, FOLLOWS_WIDTH, boxHeights, chartDocument, chartDrawings, foldLegends, roundCoordinates, separateIds} from './charts.mjs';
import {LAYER_GLOBAL, LAYER_PLACEHOLDER, countQueuedImmediates, layerDocument, layerPlaceholder, openLayerMarkup, settled} from './layers.mjs';

/** @typedef {{level: string, text: string}} PageLog */

/** @type {{entry: string, root: string, scope: string, served: {dir: string, integrations: string[]} | null, withoutSegmenter?: boolean}} */
const {entry, root, scope} = workerData;

// Before React loads: a read of the overlays waits for React's queued tasks.
countQueuedImmediates();

// Some Node builds crash in Intl.Segmenter. Without it, Core splits text by
// code points, so a joined emoji can count as several characters.
if (workerData.withoutSegmenter) delete (/** @type {any} */ (Intl)).Segmenter;

/** The package set, for a page outside a project whose folder has no Core of its own. */
const served = workerData.served && findNodeModulesPackage(path.dirname(entry), '@astryxdesign/core') === null ? workerData.served : null;
/** The folder whose modules the page carries (see render-page.mjs `carryScopeOf`). */
const SCOPE_PREFIX = scope.endsWith(path.sep) ? scope : scope + path.sep;

/** @type {PageLog[]} */
const logs = [];
for (const level of /** @type {const} */ (['log', 'info', 'warn', 'error', 'debug'])) {
  console[level] = (/** @type {unknown[]} */ ...args) => {
    const text = format(...args);
    // The compiler's own notes are not the page's output.
    if (text.startsWith('[BABEL]')) return;
    logs.push({level, text});
  };
}

const requireFromCli = createRequire(import.meta.url);
const stylexPlugin = /** @type {any} */ (requireFromCli('@stylexjs/babel-plugin'));

/** StyleX rules collected from every local module the page loads. */
/** @type {unknown[]} */
const stylexRules = [];
/** CSS text of local stylesheets the page imports, in load order. */
/** @type {{file: string, css: string}[]} */
const importedCss = [];
/** Every local (non-package) module the page loaded, page first. */
/** @type {string[]} */
const localFiles = [];
/** Package stylesheets the page imports, by specifier and importing file. */
/** @type {{spec: string, from: string}[]} */
const packageCss = [];
/** Sass and Less stylesheets the page imports, which a render cannot compile. @type {string[]} */
const skippedCss = [];
/** Local files inlined from asset imports. */
/** @type {Set<string>} */
const assetsInlined = new Set();
/** Packages the page's own modules import from. */
/** @type {Set<string>} */
const packages = new Set();
/** Static JSX text per element, for the dropped-children warning. */
/** @type {{file: string, component: string, text: string, hidden: boolean, fn: string, line: number}[]} */
const texts = [];
/** Every static JSX text, by the function it is in. */
/** @type {Record<string, string[]>} */
const fnTexts = {};
/** Each media query the page's own code asks in JavaScript, for the screen-query warning. */
/** @type {{call: string, file: string, line: number}[]} */
const screenQueries = [];

/** Core's media query hook, and the entries that export it. */
const MEDIA_QUERY_HOOK = {sources: new Set(['@astryxdesign/core', '@astryxdesign/core/hooks']), name: 'useMediaQuery'};

/**
 * The call a page makes to ask a media query in JavaScript, as the warning
 * names it: Core's `useMediaQuery`, or `matchMedia` (bare or on an object such
 * as `window`, optional calls included), with its query.
 * @param {any} p a call expression
 * @returns {string | null}
 */
function screenQuery(p) {
  const callee = p.node.callee;
  /** @param {any} spec the binding's path @param {boolean} namespace */
  const fromCore = (spec, namespace) =>
    (namespace ? spec?.isImportNamespaceSpecifier() : spec?.isImportSpecifier()) &&
    MEDIA_QUERY_HOOK.sources.has(spec.parentPath.node.source.value);
  let name = null;
  if (callee.type === 'Identifier') {
    const binding = p.scope.getBinding(callee.name);
    const spec = binding?.path;
    if (!binding && callee.name === 'matchMedia') name = 'matchMedia';
    else if (fromCore(spec, false) && (spec.node.imported.name ?? spec.node.imported.value) === MEDIA_QUERY_HOOK.name) {
      name = MEDIA_QUERY_HOOK.name;
    }
  } else if ((callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && !callee.computed) {
    if (callee.property.name === 'matchMedia') name = 'matchMedia';
    // `core.useMediaQuery(…)` through `import * as core from '@astryxdesign/core'`.
    else if (
      callee.property.name === MEDIA_QUERY_HOOK.name &&
      callee.object.type === 'Identifier' &&
      fromCore(p.scope.getBinding(callee.object.name)?.path, true)
    ) {
      name = MEDIA_QUERY_HOOK.name;
    }
  }
  if (!name) return null;
  const arg = p.node.arguments[0];
  const query = !arg
    ? ''
    : arg.type === 'StringLiteral'
      ? JSON.stringify(arg.value).replace(/^"|"$/g, "'")
      : arg.type === 'TemplateLiteral' && arg.expressions.length === 0
        ? `'${arg.quasis[0].value.cooked}'`
        : (p.get('arguments.0')?.getSource?.() ?? '');
  return `${name}(${query})`;
}

/** Components that show their content only on demand. */
const HIDING =
  /Dialog|Modal|Popover|Tooltip|Menu|Drawer|Sheet|Tab|Collapsible|Accordion|Disclosure|Overlay|Layer|Toast|Hover|Select|Combobox|Typeahead|Portal|Suspense|Lazy/;

/** @param {any} el whether a JSX element has an open/show-style prop */
const hasShowAttr = el =>
  el.openingElement.attributes.some(
    (/** @type {any} */ a) =>
      a.type === 'JSXAttribute' &&
      /^(open|isOpen|defaultOpen|show|isShown|visible|isVisible|hidden|expanded|isExpanded|defaultExpanded|collapsed|isCollapsed|defaultCollapsed|collapsible|when|if|max[A-Z]\w*|limit)$/.test(
        a.name?.name,
      ),
  );

/** @param {any} node a JSX element's name, as written */
const jsxName = node => {
  const n = node.openingElement.name;
  return n.type === 'JSXIdentifier'
    ? n.name
    : n.type === 'JSXMemberExpression'
      ? `${n.object.name}.${n.property.name}`
      : '';
};

/** @type {Record<string, string>} */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', middot: '\u00b7',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122', times: '\u00d7', rarr: '\u2192', larr: '\u2190',
};

/** @param {any} node static JSX text as it renders, whitespace collapsed */
const cleanText = node =>
  node.type === 'JSXText'
    ? String(node.extra?.raw ?? node.value)
        .replace(/&#x([0-9a-f]+);/gi, (/** @type {string} */ _, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (/** @type {string} */ _, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (/** @type {string} */ whole, e) => ENTITIES[e] ?? whole)
        .replace(/\s+/g, ' ')
        .trim()
    : '';

/** @param {any} p the function a JSX node is in, as a key */
const fnKey = p => {
  const fn = p.getFunctionParent();
  return `${p.hub?.file?.opts?.filename ?? ''}:${fn ? fn.node.start : 'module'}`;
};

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

/** A module of the page's own: inside the folder whose modules it carries, not a package.
 * @param {string} file */
const isLocal = file =>
  !file.includes(NODE_MODULES) && (file === entry || file.startsWith(SCOPE_PREFIX));

/** Charts the server render set aside, drawn after it. @type {any[]} */
const charts = [];
/** The props each chart was last drawn with in the page-wide draw. @type {any[]} */
const pageCharts = [];
/**
 * Whether a chart rendered again after the page-wide draw first committed. A
 * chart renders again only when the component that made it renders again:
 * its effects changed its state, which a closure in the chart may read, so
 * the props alone cannot say the chart is the same. React's development
 * double render under StrictMode runs before the commit, so it does not
 * count.
 */
let renderedAfterCommit = false;

/**
 * A chart's props as a string that two renders of the same chart share:
 * data by value, functions by name, elements by type and props.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {string}
 */
function sameKey(value, depth = 0) {
  if (depth > 8) return '…';
  if (typeof value === 'function') return `fn:${value.name}`;
  if (typeof value === 'symbol') return String(value);
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(v => sameKey(v, depth + 1)).join(',')}]`;
  const record = /** @type {Record<string, unknown>} */ (value);
  if ('$$typeof' in record && 'props' in record) {
    const type = /** @type {any} */ (record.type);
    return `<${typeof type === 'string' ? type : (type?.displayName ?? type?.name ?? '?')} ${sameKey(record.props, depth + 1)}>`;
  }
  return `{${Object.keys(record)
    .filter(key => !key.startsWith('_'))
    .sort()
    .map(key => `${key}:${sameKey(record[key], depth + 1)}`)
    .join(',')}}`;
}
/** React's createElement, once the page's React has loaded. @type {any} */
let createElement = null;
/** React's useContext and useRef. @type {any} */
let useContext = null;
/** @type {any} */
let useRef = null;
/** @type {any} */
let useLayoutEffect = null;
/** Set inside a drawn chart, so a chart inside it is not wrapped again. @type {any} */
let InChart = null;
/**
 * `aside` while the server render sets charts aside; `page` while the whole
 * page is drawn again, so each chart sees the context it was rendered in;
 * `alone` while each chart is drawn by itself, when the page cannot be.
 * @type {'aside' | 'page' | 'alone'}
 */
let mode = 'aside';
/** The height each chart's box states, by the chart's place. @type {(number | null)[]} */
let boxes = [];
/** The place of the chart drawn by itself. */
let alonePlace = 0;

/**
 * Wrap a recharts chart, or a ResponsiveContainer, so the server render sets
 * it aside and the drawing pass draws it: a container at each size
 * chartDrawings gives it, in the box a browser gives it.
 * @param {any} Chart
 * @param {boolean} container
 */
/** @type {any} */ (globalThis).__astryxRenderChart = (/** @type {any} */ Chart, /** @type {boolean} */ container) => {
  function RenderedChart(/** @type {any} */ props) {
    if (mode === 'aside') {
      charts.push(createElement(RenderedChart, props));
      return createElement('astryx-chart', {'data-chart': charts.length - 1});
    }
    const inside = useContext(InChart);
    // Each chart drawn in the page notes the props it was last drawn with,
    // by its place in the page, to compare with the first render's.
    const place = useRef(/** @type {number | null} */ (null));
    const committed = useRef(false);
    useLayoutEffect(() => {
      committed.current = true;
    });
    if (mode === 'page' && !inside) {
      place.current ??= pageCharts.length;
      pageCharts[place.current] = props;
      if (committed.current) renderedAfterCommit = true;
    }
    let drawn = createElement(Chart, props);
    if (container) {
      const at = mode === 'alone' ? alonePlace : inside ? null : place.current;
      const {sizes, style, follows} = chartDrawings(props, at === null ? null : boxes[at]);
      drawn = createElement(
        'div',
        {className: 'recharts-responsive-container', style, [FOLLOWS_WIDTH]: follows ? '' : undefined},
        ...sizes.map((size, k) => createElement(Chart, {...props, ...size, key: k})),
      );
    }
    if (mode === 'alone' || inside) return drawn;
    return createElement('astryx-chart', null, createElement(InChart.Provider, {value: true}, drawn));
  }
  return RenderedChart;
};

/**
 * Point the page's recharts charts, and its ResponsiveContainer, at the
 * wrapper the worker installs.
 * @param {any} p the import of 'recharts'
 * @param {any} t Babel's types
 */
function setChartsAside(p, t) {
  for (const s of p.node.specifiers) {
    if (s.type !== 'ImportSpecifier') continue;
    const name = s.imported.name ?? s.imported.value;
    const container = name === 'ResponsiveContainer';
    if (!container && !CHART_ROOTS.has(name)) continue;
    const original = p.scope.generateUidIdentifier(name);
    const local = s.local.name;
    s.local = original;
    p.insertAfter(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(local),
          t.callExpression(t.memberExpression(t.identifier('globalThis'), t.identifier(CHART_GLOBAL)), [
            original,
            t.booleanLiteral(container),
          ]),
        ),
      ]),
    );
  }
}

/**
 * Draw the charts the server render set aside, and put each drawing where
 * its placeholder is.
 *
 * Draw the whole page first. A chart's own parts then see the React context
 * the page gives them. If that draw throws, or the page's effects change a
 * chart (its props, or which charts there are), draw each chart alone, from
 * the props of the first render. A chart that fails stays empty and is
 * counted.
 * @param {string} markup
 * @param {any} Page
 * @returns {Promise<{markup: string, failed: number, alone: false | 'error' | 'changed' | 'rerendered'}>}
 */
async function drawCharts(markup, Page) {
  const placeholder = /<astryx-chart data-chart="(\d+)"><\/astryx-chart>/g;
  /** @type {any} */
  let client;
  /** @type {any} */
  let flushSync;
  try {
    await chartDocument();
    client = await jiti.import('react-dom/client');
    ({flushSync} = /** @type {any} */ (await jiti.import('react-dom')));
    // recharts decided it runs on a server when it loaded for the server
    // render. Now there is a document, so it measures text and lays out
    // axis labels as in a browser.
    const recharts = /** @type {any} */ (await jiti.import('recharts'));
    if (recharts?.Global) recharts.Global.isSsr = false;
  } catch {
    // Without a document to draw in, every chart stays empty and is counted.
    return {markup: markup.replace(placeholder, ''), failed: charts.length, alone: /** @type {false} */ (false)};
  }
  /**
   * Render one element in its own root and hand its host to `read`.
   * @param {unknown} element
   * @param {(host: any) => string[]} read
   * @returns {string[] | null} null when the render failed
   */
  const drawIn = (element, read) => {
    /** @type {unknown} */
    let error = null;
    const host = /** @type {any} */ (globalThis).document.createElement('div');
    const root = client.createRoot(host, {
      onUncaughtError: (/** @type {unknown} */ e) => {
        error = e;
      },
      onRecoverableError: () => {},
    });
    try {
      flushSync(() => root.render(element));
    } catch (e) {
      error = e;
    }
    if (!error) {
      foldLegends(host);
      // Drawn by itself, a chart's place in the page is its own place.
      separateIds(host, mode === 'alone' ? alonePlace : 0);
      roundCoordinates(host);
    }
    const out = error ? null : read(host);
    root.unmount();
    return out;
  };
  boxes = await boxHeights(markup);
  mode = 'page';
  let drawn = drawIn(createElement(Page), host => [...host.querySelectorAll('astryx-chart')].map(el => el.innerHTML));
  /** @type {false | 'error' | 'changed' | 'rerendered'} */
  let alone = false;
  if (!drawn) alone = 'error';
  // The page's effects changed a chart: its props, which charts there are,
  // or the state of the component that made it, which a closure or context
  // in the chart may read.
  else if (
    drawn.length !== charts.length ||
    pageCharts.length !== charts.length ||
    charts.some((chart, i) => sameKey(chart.props) !== sameKey(pageCharts[i]))
  ) {
    alone = 'changed';
  } else if (renderedAfterCommit) {
    alone = 'rerendered';
  }
  if (alone) {
    mode = 'alone';
    drawn = charts.map((chart, i) => {
      alonePlace = i;
      return drawIn(chart, host => [host.innerHTML])?.[0] ?? '';
    });
  }
  let failed = 0;
  // A chart that drew no picture counts as failed, once.
  const pictures = /** @type {string[]} */ (drawn).map(html => {
    if (html.includes('<svg')) return html;
    failed += 1;
    return '';
  });
  return {
    markup: markup.replace(placeholder, (_, i) => pictures[Number(i)] ?? ''),
    failed,
    alone,
  };
}

/**
 * The markup of a part's open layers. A layer opened from inside another
 * (its opener, the control naming it in aria-controls, sits in that layer:
 * a submenu's flyout) is drawn once, beside the layer it opens from, in a
 * row with it, as a browser places it; never again inside that layer, where
 * the document holds it too.
 * @param {any[]} open the open layers, in the order they opened
 * @returns {string}
 */
function nestedLayers(open) {
  /** @param {any} layer */
  const parentOf = layer => {
    const ids = new Set(
      [layer, ...layer.querySelectorAll('[id]')].map(e => e.id).filter(Boolean),
    );
    return (
      open.find(
        other =>
          other !== layer &&
          !layer.contains(other) &&
          [...other.querySelectorAll('[aria-controls]')].some(c =>
            ids.has(c.getAttribute('aria-controls')),
          ),
      ) ?? null
    );
  };
  const parents = new Map(open.map(layer => [layer, parentOf(layer)]));
  /** @param {any} layer @returns {string} */
  const draw = layer => {
    const kids = open.filter(o => parents.get(o) === layer);
    if (!kids.length) return layer.outerHTML;
    const own = layer.cloneNode(true);
    for (const inner of own.querySelectorAll('[data-astryx-layer-root]'))
      inner.remove();
    return `<div data-astryx-layer-nest="">${own.outerHTML}${kids.map(draw).join('')}</div>`;
  };
  return open
    .filter(layer => !parents.get(layer))
    .map(draw)
    .join('');
}


/**
 * Parts the page asked to be drawn, in the order asked: open (`ifOpen`: drawn
 * as nothing when nothing opens), or `mounted`, as the browser shows the part
 * once it runs, nothing opened.
 * @type {Array<{element: unknown, ifOpen: boolean, mounted: boolean}>}
 */
const layers = [];
/** @type {any} */ (globalThis)[LAYER_GLOBAL] = (/** @type {unknown} */ element, /** @type {boolean | 'mounted'} */ how = false) =>
  layerPlaceholder(layers.push({element, ifOpen: how === true, mounted: how === 'mounted'}) - 1);

/**
 * Run `fn` with a document in place, as a browser page has one, then put
 * the globals back as they were (none, for a server render). The document
 * carries the handler property a browser's document has for input events
 * (`oninput`), which React reads to tell whether fields fire them.
 * @param {() => Promise<unknown>} fn
 */
async function withLoadDocument(fn) {
  const g = /** @type {any} */ (globalThis);
  const had = {window: Object.getOwnPropertyDescriptor(g, 'window'), document: Object.getOwnPropertyDescriptor(g, 'document')};
  try {
    const {parseHTML} = await import('linkedom');
    const {window} = parseHTML('<!doctype html><html><head></head><body></body></html>');
    if (!('oninput' in window.document)) /** @type {any} */ (window.document).oninput = null;
    g.window = window;
    g.document = window.document;
    await fn();
  } catch {
    // No client to load (no react-dom): nothing is drawn with it either.
  } finally {
    if (had.window) Object.defineProperty(g, 'window', had.window);
    else delete g.window;
    if (had.document) Object.defineProperty(g, 'document', had.document);
    else delete g.document;
  }
}

/**
 * Draw each part the page asked to be drawn open, in the layer document
 * (layers.mjs), and put each where its marker is: the part as drawn, then
 * each overlay it shows or a press opens (openLayerMarkup), in place after
 * it. A part that fails to draw, or has none open, is its server render, or
 * nothing when the page asked for it only open.
 * @param {string} markup
 * @param {any} server react-dom/server
 * @returns {Promise<string>}
 */
async function drawLayers(markup, server) {
  /** @type {any} */
  let client;
  /** @type {any} */
  let flushSync;
  try {
    await layerDocument();
    client = await jiti.import('react-dom/client');
    ({flushSync} = /** @type {any} */ (await jiti.import('react-dom')));
  } catch {
    client = null;
  }
  const g = /** @type {any} */ (globalThis);
  /** @type {string[]} */
  const drawings = [];
  for (const {element, ifOpen, mounted} of layers) {
    /** @type {string | null} */
    let out = null;
    if (client) {
      const host = g.document.createElement('div');
      g.document.body.appendChild(host);
      const root = client.createRoot(host, {onUncaughtError: () => {}, onRecoverableError: () => {}});
      try {
        flushSync(() => root.render(element));
        if (mounted) {
          await settled();
          // A part that draws nothing in this window (a narrow screen's
          // navigation, in a desktop's) is its server render.
          out = host.innerHTML.replace(/<template><\/template>/g, '') || null;
        } else {
          // Its overlays shown open mount, and each popup a press opens opens.
          await openLayerMarkup(host, flushSync);
          const open = [...g.document.querySelectorAll('[data-astryx-layer-root]')].filter(
            (/** @type {any} */ layer) => layer.__astryxPopoverOpen === true,
          );
          if (open.length) {
            // The part as drawn, then each overlay open now, after it; never a
            // closed one, nor the markers that place them. A layer opened from
            // inside another (a submenu's flyout) is drawn beside the layer it
            // opens from, as a browser places it.
            const part = host.cloneNode(true);
            for (const layer of part.querySelectorAll('[data-astryx-layer-root]')) layer.remove();
            out = part.innerHTML.replace(/<template><\/template>/g, '') + nestedLayers(open);
          }
        }
      } catch {
        out = null;
      }
      try {
        root.unmount();
      } catch {
        // A part that failed to draw unmounts as nothing.
      }
      host.remove();
    }
    if (out == null && ifOpen) out = '';
    if (out == null)
      try {
        out = server.renderToStaticMarkup(element);
      } catch {
        out = '';
      }
    drawings.push(/** @type {string} */ (out));
  }
  return markup.replace(LAYER_PLACEHOLDER, (_, i) => drawings[Number(i)] ?? '');
}

/**
 * The overlays the elements show open, and those their controls open, drawn
 * in the layer document (layers.mjs), for after the page's markup in one
 * element of their own; nothing when they cannot be drawn there. Each
 * element draws on its own: one that throws leaves the others drawn.
 * @param {unknown[]} elements
 * @param {any} React
 * @returns {Promise<string>}
 */
async function drawOpenLayers(elements, React) {
  /** @type {any} */
  let client;
  /** @type {any} */
  let flushSync;
  try {
    await layerDocument();
    client = await jiti.import('react-dom/client');
    ({flushSync} = /** @type {any} */ (await jiti.import('react-dom')));
  } catch {
    return '';
  }
  const g = /** @type {any} */ (globalThis);
  class Alone extends React.Component {
    state = {failed: false};
    static getDerivedStateFromError() {
      return {failed: true};
    }
    render() {
      return this.state.failed ? null : this.props.children;
    }
  }
  // Each part is drawn on its own, then taken down before the next: the
  // listeners a drawn part puts on the document (a typeahead's or a menu's
  // outside press) then hear only the presses on its own controls, never
  // every other part's, as in a window that shows that part alone.
  /** @type {string[]} */
  const layers = [];
  for (const element of elements) {
    const host = g.document.createElement('div');
    g.document.body.appendChild(host);
    const root = client.createRoot(host, {onUncaughtError: () => {}, onRecoverableError: () => {}});
    try {
      flushSync(() => root.render(createElement(Alone, null, element)));
      // (A part that opens nothing on a press and holds a layer, a context
      // menu's area, is right-clicked, as one drawn in its own place is.)
      // A layer opened from inside another is drawn beside it (nestedLayers).
      const box = g.document.createElement('div');
      box.innerHTML = (await openLayerMarkup(host, flushSync)).join('');
      const drawn = nestedLayers([...box.children]);
      if (drawn) layers.push(drawn);
    } catch {
      // A part that cannot be drawn there adds no overlays.
    }
    try {
      root.unmount();
    } catch {
      // Unmounting a part that failed to draw changes nothing.
    }
    host.remove();
  }
  return layers.length ? `<div data-astryx-open-layers="">${layers.join('')}</div>` : '';
}

/**
 * Babel plugin: a bare import that a path alias places loads from that file,
 * as in TypeScript, before any installed copy. An import the aliases do not
 * place is left alone, so an installed package loads. It runs on the page's
 * own files, before {@link pagePlugin}, and on every module the page loads
 * from outside them and outside `node_modules` (a sibling package's source,
 * say).
 */
function aliasPlugin() {
  return () => {
    /** @param {any} node a string literal to point at the file an alias places */
    const point = node => {
      if (node?.type !== 'StringLiteral') return;
      const file = resolvePath(PATHS, node.value);
      if (file) node.value = file;
    };
    return {
      visitor: {
        'ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration'(/** @type {any} */ p) {
          point(p.node.source);
        },
        CallExpression(/** @type {any} */ p) {
          const callee = p.node.callee;
          if (callee?.type === 'Import' || (callee?.type === 'Identifier' && callee.name === 'require')) point(p.node.arguments?.[0]);
        },
        ImportExpression(/** @type {any} */ p) {
          point(p.node.source);
        },
      },
    };
  };
}

/**
 * The name a browser module calls `carried` by, imported once at its top.
 * @param {any} p an import declaration's path
 * @param {any} t Babel's types
 */
function carriedName(p, t) {
  const program = p.scope.getProgramParent();
  const name = '__astryxCarried';
  if (!program.hasBinding(name)) {
    program.path.unshiftContainer(
      'body',
      t.importDeclaration(
        [t.importSpecifier(t.identifier(name), t.identifier('carried'))],
        t.stringLiteral(CARRIED_MODULE),
      ),
    );
    program.crawl();
  }
  return t.identifier(name);
}

/**
 * Babel plugin: replace asset imports with data: URIs and stylesheet imports
 * with nothing (their CSS is inlined into the page), and record static text
 * children of capitalized JSX elements.
 *
 * For the browser (`browser`), the same imports load the same way, but the
 * page keeps its real charts and nothing is recorded: the server render
 * recorded it already.
 * @param {string} filename
 * @param {boolean} [browser]
 */
function pagePlugin(filename, browser = false) {
  const dir = path.dirname(filename);
  return (/** @type {any} */ {types: t}) => ({
    visitor: {
      ImportDeclaration(/** @type {any} */ p) {
        const spec = /** @type {string} */ (p.node.source.value);
        if (spec === 'recharts' && !browser) setChartsAside(p, t);
        const raw = spec.split('?')[0];
        // A stylesheet, image or JSON file imported through a project alias
        // (`@/styles/site.css`) resolves the way modules do.
        const bare =
          isAliased(raw) && (/\.(css|scss|sass|less|json)$/i.test(raw) || isAssetPath(raw)) ? resolveAlias(raw) : raw;
        const query = spec.includes('?') ? spec.slice(spec.indexOf('?') + 1) : '';
        const target = isAliased(raw) ? resolveAlias(raw) : raw;
        if (query && (target.startsWith('.') || path.isAbsolute(target))) {
          // `?raw` gives the file's text and `?inline` a stylesheet's text (not
          // added to the page), as Vite does by itself. Any other query loads
          // the file as it loads without one: an image, font or media file as
          // its address (`?url`, `?inline`, `?w=400`), a module as itself.
          const file = path.resolve(dir, target);
          if (query === 'raw' || (query === 'inline' && /\.css$/i.test(target))) {
            if (!fs.existsSync(file)) {
              const err = new Error(`${path.basename(filename)} imports ${spec}, which does not exist.`);
              /** @type {any} */ (err).renderCode = 'ERR_FILE_NOT_FOUND';
              throw err;
            }
            if (!localFiles.includes(file)) localFiles.push(file);
            // The text is the module's default export, as Vite gives it, to
            // every way of importing it.
            const text = t.stringLiteral(fs.readFileSync(file, 'utf8'));
            const declarators = p.node.specifiers.map((/** @type {any} */ s) =>
              t.variableDeclarator(
                t.identifier(s.local.name),
                s.type === 'ImportNamespaceSpecifier'
                  ? t.objectExpression([t.objectProperty(t.identifier('default'), text)])
                  : s.type === 'ImportDefaultSpecifier' || (s.imported.name ?? s.imported.value) === 'default'
                    ? text
                    : t.identifier('undefined'),
              ),
            );
            if (declarators.length > 0) p.replaceWith(t.variableDeclaration('const', declarators));
            else p.remove();
            return;
          }
        }
        if (!bare.startsWith('.') && !path.isAbsolute(bare) && !isAliased(bare)) {
          packages.add(
            bare.startsWith('@')
              ? bare.split('/').slice(0, 2).join('/')
              : bare.split('/')[0],
          );
        }
        if (/\.json$/i.test(bare) && (bare.startsWith('.') || path.isAbsolute(bare))) {
          const file = path.resolve(dir, bare);
          if (fs.existsSync(file) && !localFiles.includes(file)) localFiles.push(file);
        }
        if (/\.(css|scss|sass|less)$/i.test(bare) && (/\.module\.[a-z]+$/i.test(bare) || p.node.specifiers.length > 0)) {
          // CSS Modules (any stylesheet imported as a value) give class names
          // at build time; a render has none.
          const err = new Error(
            `${path.basename(filename)} imports ${bare} as a value (CSS Modules), which a render does not support: use StyleX or a plain stylesheet imported for its side effect.`,
          );
          /** @type {any} */ (err).renderCode = 'ERR_RENDER_FAILED';
          throw err;
        }
        if (/\.(scss|sass|less)$/i.test(bare)) {
          // Sass and Less need their compiler: say so rather than drop them.
          if (!browser) skippedCss.push(bare);
          p.remove();
          return;
        }
        if (/\.css$/i.test(bare) && bare === raw && namesAlias(raw)) {
          // An aliased stylesheet with no target falls back to a package, as in
          // TypeScript; when there is none either, the alias is wrong.
          let found = true;
          try {
            createRequire(filename).resolve(raw);
          } catch {
            found = false;
          }
          if (!found) {
            const err = new Error(
              `${path.basename(filename)} imports ${spec} through a path alias that does not lead to a file.`,
            );
            /** @type {any} */ (err).renderCode = 'ERR_FILE_NOT_FOUND';
            throw err;
          }
        }
        if (/\.css$/i.test(bare)) {
          if (bare.startsWith('.') || path.isAbsolute(bare)) {
            const file = path.resolve(dir, bare);
            // A stylesheet two modules import is inlined once, where it was
            // first imported, as bundlers do.
            if (!fs.existsSync(file)) {
              const err = new Error(`${path.basename(filename)} imports ${spec}, which does not exist.`);
              /** @type {any} */ (err).renderCode = 'ERR_FILE_NOT_FOUND';
              throw err;
            }
            if (/\.css$/i.test(bare) && fs.existsSync(file) && !importedCss.some(c => c.file === file)) {
              importedCss.push({file, css: fs.readFileSync(file, 'utf8')});
              if (!localFiles.includes(file)) localFiles.push(file);
            }
          } else {
            // A package stylesheet (a theme's, say): the caller resolves it
            // from this file and inlines the rules the page uses.
            if (!browser) packageCss.push({spec: bare, from: filename});
          }
          p.remove();
          return;
        }
        if (isAssetPath(bare) && (bare.startsWith('.') || path.isAbsolute(bare))) {
          const file = path.resolve(dir, bare);
          const uri = assetDataUri(file);
          assetsInlined.add(file);
          if (!localFiles.includes(file)) localFiles.push(file);
          const local = p.node.specifiers.find(
            (/** @type {any} */ s) => s.type === 'ImportDefaultSpecifier',
          );
          if (!local) {
            p.remove();
            return;
          }
          // In the browser the image comes from the embedded source, which
          // carries it; the render inlines one the source leaves out.
          const base64 = browser ? /^(data:[^,]*;base64),/.exec(uri) : null;
          p.replaceWith(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier(local.local.name),
                base64
                  ? t.callExpression(carriedName(p, t), [
                      t.stringLiteral(sha256(fs.readFileSync(file))),
                      t.stringLiteral(base64[1]),
                    ])
                  : t.stringLiteral(uri),
              ),
            ]),
          );
        }
      },
      'CallExpression|OptionalCallExpression'(/** @type {any} */ p) {
        if (browser) return;
        const call = screenQuery(p);
        if (call) screenQueries.push({call, file: filename, line: p.node.loc?.start.line ?? 0});
      },
      JSXText(/** @type {any} */ p) {
        if (browser) return;
        const v = cleanText(p.node);
        if (v.length >= 2) (fnTexts[fnKey(p)] ??= []).push(v);
      },
      JSXElement(/** @type {any} */ p) {
        if (browser) return;
        const component = jsxName(p.node);
        if (!/^[A-Z]/.test(component)) return;
        // Only children that are all static text: the whole text must show.
        if (p.node.children.some((/** @type {any} */ c) => c.type !== 'JSXText')) return;
        const own = p.node.children.map(cleanText).filter(Boolean).join(' ');
        if (!own) return;
        // Content inside something that shows it only on demand (a closed
        // dialog, an inactive tab) is not expected in a static render.
        let hidden = HIDING.test(component) || hasShowAttr(p.node);
        for (let up = p.parentPath; up && !hidden; up = up.parentPath) {
          if (!up.isJSXElement()) continue;
          hidden = HIDING.test(jsxName(up.node)) || hasShowAttr(up.node);
        }
        // Content shown only under a condition, or passed as a prop.
        let conditional = false;
        for (let up = p.parentPath; up && !up.isFunction() && !up.isProgram(); up = up.parentPath) {
          if (
            up.isConditionalExpression() ||
            up.isLogicalExpression() ||
            up.isIfStatement() ||
            up.isSwitchCase() ||
            up.isJSXAttribute()
          ) {
            conditional = true;
            break;
          }
        }
        // JSX kept in a variable, object or list shows only where it is used.
        if (!conditional) {
          let top = p;
          while (top.parentPath && (top.parentPath.isJSXElement() || top.parentPath.isJSXFragment() || top.parentPath.isJSXExpressionContainer() || top.parentPath.isParenthesizedExpression?.())) {
            top = top.parentPath;
          }
          const holder = top.parentPath;
          conditional = Boolean(
            holder &&
              !holder.isReturnStatement() &&
              !(holder.isArrowFunctionExpression() && holder.node.body === top.node),
          );
        }
        // Content after an early return runs only when that return did not.
        if (!conditional) {
          const fn = p.getFunctionParent();
          const stmt = fn
            ? p.findParent((/** @type {any} */ x) => x.parentPath?.node === fn.node.body)
            : null;
          for (const sib of stmt?.getAllPrevSiblings?.() ?? []) {
            let returns = sib.isReturnStatement();
            if (!returns && (sib.isIfStatement() || sib.isSwitchStatement() || sib.isTryStatement())) {
              sib.traverse({
                ReturnStatement() {
                  returns = true;
                },
                Function(/** @type {any} */ q) {
                  q.skip();
                },
              });
            }
            if (returns) {
              conditional = true;
              break;
            }
          }
        }
        texts.push({
          file: filename,
          component,
          text: own,
          hidden: hidden || conditional,
          fn: fnKey(p),
          line: p.node.loc?.start.line ?? 0,
        });
      },
    },
  });
}

/**
 * The page's path aliases (`compilerOptions.paths` in the tsconfig.json or
 * jsconfig.json that TypeScript reads for the page), matched by TypeScript's
 * rules (see ts-paths.mjs).
 */
const PATHS = pathsFor(path.resolve(entry));

/** @param {string} spec whether a specifier goes through a project alias */
const isAliased = spec => resolvePath(PATHS, spec) !== null;

/**
 * Whether a specifier that resolves to no file was meant for an alias: it
 * matches a key with a literal prefix. A catch-all key (`"*"`) matches every
 * package name too, so an import it cannot place is a package that is not
 * installed.
 * @param {string} spec
 */
const namesAlias = spec => {
  const match = matchPath(PATHS, spec);
  return match !== null && match.pattern.prefix !== '';
};

/**
 * A specifier through a project alias, as the absolute path of the first
 * target that exists; the specifier itself when none does, so it resolves as
 * a package.
 * @param {string} spec
 */
const resolveAlias = spec => resolvePath(PATHS, spec) ?? spec;

/**
 * The file a relative or aliased import names, found the way the render
 * loads it, or null for a package import or a file that does not exist.
 * @param {string} spec
 * @param {string} from the importing file
 * @returns {string | null}
 */
function importedFile(spec, from) {
  const raw = spec.split('?')[0];
  if (raw.startsWith('.')) return existingFile(path.resolve(path.dirname(from), raw), LOAD_EXTENSIONS);
  // An alias resolves by TypeScript's rules, as the import rewrite loads it.
  return isAliased(raw) ? resolveAlias(raw) : null;
}

/** Packages the page took from the package set, by name: their folders. */
/** @type {Map<string, string>} */
const fromSet = new Map();

/**
 * The folder of the package that holds `file`.
 * @param {string} file
 * @param {string} name
 * @returns {string}
 */
function packageDirOf(file, name) {
  for (let d = path.dirname(file); path.dirname(d) !== d; d = path.dirname(d)) {
    try {
      if (JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).name === name) return d;
    } catch {
      // No package.json here, or one that does not parse: look further up.
    }
  }
  return path.dirname(file);
}

const moduleApi = /** @type {any} */ (Module);


/** A module at the served Core's folder: what resolves as the Core would. */
const servedParent = served ? new moduleApi(path.join(served.dir, 'package.json')) : null;
if (servedParent && served) {
  servedParent.filename = servedParent.id;
  servedParent.paths = moduleApi._nodeModulePaths(served.dir);
}

/**
 * When the page's folder has no copy of a served package, take the one the
 * package set holds. Node's resolver keeps each package's `exports`.
 */
function serveFromSet() {
  if (!served || !servedParent) return;
  const resolveFilename = moduleApi._resolveFilename;
  moduleApi._resolveFilename = function (/** @type {string} */ request, /** @type {any[]} */ ...rest) {
    // React, React DOM and StyleX come from the set for every module, a
    // library in the page's folder included, so the page runs on one copy.
    if (!request.startsWith('.') && !path.isAbsolute(request) && packageOf(request) in SINGLE_COPY_ALIASES) {
      try {
        return resolveFilename.call(this, request, servedParent, false);
      } catch {
        // The set has no such file: the importer's own copy serves.
      }
    }
    try {
      return resolveFilename.call(this, request, ...rest);
    } catch (e) {
      const name = /** @type {any} */ (e)?.code === 'MODULE_NOT_FOUND' && !request.startsWith('.') && !path.isAbsolute(request)
        ? packageOf(request)
        : null;
      if (!name || !isServedPackage(name, served.integrations)) throw e;
      const file = resolveFilename.call(this, request, servedParent, false);
      if (!fromSet.has(name)) fromSet.set(name, packageDirOf(file, name));
      return file;
    }
  };
}

/**
 * React and StyleX keep state per copy, and the packages from the set load
 * the set's copy. So outside a project the page's own modules load that copy
 * too, even when its folder holds another one.
 * @returns {Record<string, string>}
 */
function singleCopyAliases() {
  /** @type {Record<string, string>} */
  const alias = {};
  if (!servedParent) return alias;
  for (const name of SINGLE_COPY) {
    try {
      alias[name] = path.dirname(moduleApi._resolveFilename(`${name}/package.json`, servedParent, false));
    } catch {
      // The set has no copy: the page's own copy, if any, serves.
    }
  }
  return alias;
}
const SINGLE_COPY_ALIASES = singleCopyAliases();
serveFromSet();
// ES modules follow the same rule through resolve hooks (CommonJS goes
// through serveFromSet).
if (servedParent && Object.keys(SINGLE_COPY_ALIASES).length > 0) {
  register(new URL('./single-copy-hooks.mjs', import.meta.url), {
    data: {parent: pathToFileURL(servedParent.filename).href, names: Object.keys(SINGLE_COPY_ALIASES)},
  });
}

/** What the StyleX compiler reads as a theme or constants file, by name. */
const STYLEX_THEME_FILE = /\.(?:stylex(?:\.const)?|transformed)(?:\.(?:js|ts|tsx|jsx|mjs|cjs))?$/;

/**
 * Outside a project, the file the page loads for each StyleX theme file a
 * module imports from a package, for the StyleX compiler. The compiler finds
 * a theme import from the folder of the file that imports it, which outside
 * a project holds no copy of the packages the set serves, so it is given the
 * file the page loads. Its own rules still name that file for the variables'
 * names, so they match the package's stylesheet.
 * @param {string} source
 * @param {string} filename
 * @returns {Record<string, string[]> | null}
 */
function servedThemeFiles(source, filename) {
  if (!served) return null;
  /** @type {Record<string, string[]>} */
  const files = {};
  for (const spec of importSpecifiers(source, filename)) {
    if (spec.startsWith('.') || path.isAbsolute(spec) || !STYLEX_THEME_FILE.test(spec)) continue;
    const file = resolveServed(spec, filename, served);
    if (file) files[spec] = [file];
  }
  return Object.keys(files).length > 0 ? files : null;
}

const plain = createJiti(entry, {fsCache: false, jsx: {runtime: 'automatic'}});

const jiti = createJiti(entry, {
  fsCache: false,
  tryNative: false,
  extensions: [...LOAD_EXTENSIONS],
  moduleCache: true,
  interopDefault: true,
  alias: SINGLE_COPY_ALIASES,
  jsx: {runtime: 'automatic'},
  transform: opts => transformModule(opts),
});

/**
 * One of the page's own files, or a file outside them and outside
 * `node_modules` that a path alias may reach, compiled as the server
 * compiles it: the page's files with its plugins and StyleX, the other with
 * its path aliases. The code stays an ES module with its JSX and types. For
 * the browser (`browser`), the page's files keep their real charts and
 * record nothing. Null for any other file.
 * @param {string} source
 * @param {string} filename
 * @param {boolean} [browser]
 * @returns {string | null}
 */
function compilePageModule(source, filename, browser = false) {
  if (isLocal(filename) && /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(filename)) {
    if (!localFiles.includes(filename)) localFiles.push(filename);
    const ts = /\.(tsx?|mts|cts)$/.test(filename);
    const themeFiles = source.includes('stylex') ? servedThemeFiles(source, filename) : null;
    const result = transformSync(source, {
      filename,
      babelrc: false,
      configFile: false,
      sourceType: 'module',
      parserOpts: {plugins: ts ? ['jsx', 'typescript'] : ['jsx']},
      generatorOpts: {retainLines: true},
      compact: false,
      plugins: [
        aliasPlugin(),
        pagePlugin(filename, browser),
        ...(source.includes('stylex')
          ? [
              [
                stylexPlugin,
                {
                  dev: false,
                  runtimeInjection: false,
                  treeshakeCompensation: true,
                  unstable_moduleResolution: {type: 'commonJS', rootDir: root},
                  ...(themeFiles ? {aliases: themeFiles} : {}),
                },
              ],
            ]
          : []),
      ],
    });
    const rules = /** @type {any} */ (result?.metadata)?.stylex;
    if (Array.isArray(rules)) stylexRules.push(...rules);
    return result?.code ?? source;
  }
  if (PATHS.length > 0 && !filename.includes(NODE_MODULES) && /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(filename)) {
    const ts = /\.(tsx?|mts|cts)$/.test(filename);
    const result = transformSync(source, {
      filename,
      babelrc: false,
      configFile: false,
      sourceType: 'unambiguous',
      // The options jiti compiles these files with: JSX only in .jsx and
      // .tsx files (so `<string>value` stays a type assertion), and legacy
      // decorators.
      parserOpts: {
        plugins: /** @type {import('@babel/core').ParserOptions['plugins']} */ (
          ts ? [...(/\.[cm]?tsx$/.test(filename) ? ['jsx'] : []), 'typescript', 'decorators-legacy'] : ['jsx']
        ),
      },
      generatorOpts: {retainLines: true},
      compact: false,
      plugins: [aliasPlugin()],
    });
    return result?.code ?? source;
  }
  return null;
}

/**
 * One module as CommonJS, for the server render: {@link compilePageModule}
 * for the page's files and the files its aliases reach, then jiti.
 * @param {import('jiti').TransformOptions} opts
 * @returns {{code: string}}
 */
function transformModule(opts) {
  // jiti names the file with forward slashes on Windows (`C:/...`), while
  // `entry`, `root` and the node_modules test use the platform separator.
  // Without this, no file reads as local there and none is transformed.
  const filename = opts.filename ? path.normalize(opts.filename) : '';
  let source = opts.source;
  if (filename && isLocal(filename) && /\.json$/i.test(filename) && !localFiles.includes(filename)) {
    localFiles.push(filename);
  }
  const compiled = filename ? compilePageModule(source, filename) : null;
  if (compiled !== null) source = compiled;
  return {code: plain.transform({...opts, source, babel: {...opts.babel, compact: false}})};
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [detail]
 */
function fail(code, message, detail) {
  parentPort?.postMessage({ok: false, error: {code, message, detail}, logs});
}

/**
 * A compile error's text without colour codes (Babel colours its code frame
 * where a terminal or CI asks for colour), and the absolute path Babel puts
 * before the message, when it names one.
 * @param {any} err
 * @returns {{text: string, named?: string}}
 */
function compileText(err) {
  const text = stripVTControlCharacters(String(err?.message ?? err));
  const lead = /^(.*?): /.exec(text)?.[1];
  return lead && path.isAbsolute(lead) ? {text: text.slice(lead.length + 2), named: lead} : {text};
}

/**
 * Where a compile error points: the file, as a path from the project, and the
 * line its location or code frame marks (`> 3 |   gap,`), with the token the
 * carets under that line mark.
 * @param {any} err
 * @returns {{file?: string, line?: number, column?: number, token?: string, source?: string}}
 */
function compileSite(err) {
  const {text, named} = compileText(err);
  const fromRoot = named ? path.relative(root, named) : '';
  const file = named
    ? (fromRoot.startsWith('..') || path.isAbsolute(fromRoot) ? path.basename(named) : fromRoot).split(path.sep).join('/')
    : undefined;
  const frame = /^>\s*(\d+)\s*\|(.*)\n\s*\|(\s*)(\^+)/m.exec(text);
  const line = err?.loc?.line ?? (frame ? Number(frame[1]) : undefined);
  const column = err?.loc ? err.loc.column + 1 : frame ? frame[3].length : undefined;
  // An aliased import (`gap as space`) is read by its local name.
  const token = frame
    ? frame[2].slice(frame[3].length, frame[3].length + frame[4].length).split(/\s+as\s+/).pop()
    : undefined;
  return {
    ...(file ? {file} : {}),
    ...(line ? {line} : {}),
    ...(column ? {column} : {}),
    ...(token ? {token} : {}),
    ...(named ? {source: named} : {}),
  };
}

/**
 * The module an import declaration names, read from the line of one of its
 * names onward (an import can span lines).
 * @param {string} file
 * @param {number} line
 * @returns {string | undefined}
 */
function importedFrom(file, line) {
  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').slice(line - 1, line + 40);
  } catch {
    return undefined;
  }
  for (const text of lines) {
    const from = /\bfrom\s*(['"])([^'"]+)\1/.exec(text);
    if (from) return from[2];
  }
  return undefined;
}

/** @param {unknown} e */
function classify(e) {
  const err = /** @type {any} */ (e);
  if (err?.renderCode) return fail(err.renderCode, compileText(err).text);
  // Babel prefixes errors raised while compiling with the file's path.
  const message = compileText(err).text;
  if (/suspended while responding to synchronous input|A component suspended/.test(message)) {
    return fail(
      'ERR_RENDER_FAILED',
      'The page waits for data while rendering (a component suspended), and a static render cannot wait. Load the data first, or render a version of the page that has it.',
    );
  }
  const missing =
    /Cannot find (?:module|package) ['"]([^'"]+)['"]/.exec(message) ??
    /Failed to resolve import ['"]([^'"]+)['"]/.exec(message);
  if (missing && (namesAlias(missing[1]) || /^[@~#]\/|^#/.test(missing[1]))) {
    return fail(
      'ERR_FILE_NOT_FOUND',
      `The page imports ${missing[1]} through a path alias that does not lead to a file. Check \`compilerOptions.paths\` in the project's tsconfig.json, or import it by a relative path.`,
      {module: missing[1]},
    );
  }
  if (missing && !missing[1].startsWith('.') && !path.isAbsolute(missing[1])) {
    const spec = missing[1];
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    return fail('ERR_RENDER_MISSING_DEPENDENCY', `The page imports ${pkg}, which is not installed`, {package: pkg});
  }
  if (missing) {
    return fail('ERR_FILE_NOT_FOUND', `The page imports ${missing[1]}, which does not exist`, {module: missing[1]});
  }
  if (err?.code === 'BABEL_PARSE_ERROR' || err?.reasonCode || /SyntaxError|Unexpected token/.test(`${err?.name} ${message}`)) {
    const site = compileSite(err);
    const where = [site.file, site.line ? `line ${site.line}` : ''].filter(Boolean).join(', ');
    let reason = message.split('\n')[0];
    // StyleX reads at build time each value a style uses; an imported value
    // only from a file it can read, which it says without naming the import.
    if (reason.startsWith('Could not resolve the path to the imported file')) {
      const spec = site.source && site.line ? importedFrom(site.source, site.line) : undefined;
      const value = site.token ? `\`${site.token}\`` : 'an imported value';
      reason =
        spec && /\.stylex(?:\.[cm]?[jt]sx?)?$/.test(spec)
          ? `StyleX could not find ${spec}, which ${value} comes from, at build time. Check that the file exists, or that its package is installed where the page is.`
          : `StyleX could not read ${value}${spec ? ` from ${spec}` : ''} at build time. A value a style uses must be written in the style, or come from a .stylex.ts or .stylex.js file that defines it with stylex.defineVars or stylex.defineConsts.`;
    }
    return fail('ERR_RENDER_COMPILE', `The page does not compile${where ? ` (${where})` : ''}: ${reason}`, {
      ...(site.file ? {file: site.file} : {}),
      ...(site.line ? {line: site.line} : {}),
      ...(site.column ? {column: site.column} : {}),
    });
  }
  const browser = /\b(window|document|localStorage|sessionStorage|navigator|location|matchMedia|requestAnimationFrame|IntersectionObserver|ResizeObserver|HTMLElement|customElements) is not defined/.exec(message);
  if (browser) {
    return fail(
      'ERR_RENDER_BROWSER_API',
      `The page uses \`${browser[1]}\` while rendering, and a rendered page has no browser yet. Read it inside useEffect, or guard it with typeof ${browser[1]} !== 'undefined'.`,
      {api: browser[1]},
    );
  }
  if (err?.code === 'ERR_RENDER_ASSET_TOO_LARGE' || err?.code === 'ERR_FILE_NOT_FOUND') {
    return fail(err.code, message, err.detail);
  }
  return fail('ERR_RENDER_FAILED', `The page threw while rendering: ${message.split('\n')[0]}`);
}

/**
 * One of the page's files for esbuild (client-bundle.mjs), compiled as the
 * server compiled it; null for a file esbuild loads itself.
 * @param {string} file
 * @returns {{contents: string, loader: 'tsx' | 'ts' | 'jsx'} | null}
 */
function browserSource(file) {
  const filename = path.normalize(file);
  const compiled = compilePageModule(fs.readFileSync(filename, 'utf8'), filename, true);
  if (compiled === null) return null;
  const loader = /\.[cm]?tsx$/.test(filename) ? 'tsx' : /\.[cm]?ts$/.test(filename) ? 'ts' : 'jsx';
  return {contents: compiled, loader};
}

/**
 * The folder a package import resolves from in the browser bundle when it
 * must be the copy the server loaded: React, React DOM and StyleX from the
 * package set outside a project (one copy for every module), and a served
 * package the importer has no copy of. Null when the importer's own copy
 * serves.
 * @param {string} name
 * @param {string} importerDir
 * @returns {string | null}
 */
function browserPackageDir(name, importerDir) {
  if (!served) return null;
  const pkg = packageOf(name);
  if (pkg in SINGLE_COPY_ALIASES) return served.dir;
  if (!findNodeModulesPackage(importerDir, pkg) && isServedPackage(pkg, served.integrations)) return served.dir;
  return null;
}

/**
 * Whether a package import resolves for the module that makes it: installed
 * where the module is, served from the package set, or found by Node.
 * @param {string} spec the import as written, without a query
 * @param {string} file the importing module
 */
function packageResolves(spec, file) {
  const pkg = packageOf(spec);
  if (findNodeModulesPackage(path.dirname(file), pkg)) return true;
  // A package the set serves counts only when the set holds it.
  if (served && pkg in SINGLE_COPY_ALIASES) return true;
  if (served && isServedPackage(pkg, served.integrations) && resolveServed(spec, file, served)) return true;
  const require = createRequire(file);
  for (const request of [spec, `${pkg}/package.json`]) {
    try {
      require.resolve(request);
      return true;
    } catch {
      // Not found by this request: try the next one.
    }
  }
  return false;
}

/**
 * One of the page's modules as Babel parses it: TypeScript in a TypeScript
 * file, JSX in a `.jsx` or `.tsx` file and in JavaScript.
 * @param {string} source
 * @param {string} file
 */
function parseModule(source, file) {
  const typed = /\.[cm]?tsx?$/.test(file);
  return requireFromCli('@babel/parser').parse(source, {
    sourceType: 'module',
    plugins: typed ? (/x$/.test(file) ? ['typescript', 'jsx'] : ['typescript']) : ['jsx'],
  });
}

/**
 * Every package the page's own modules import that does not resolve, found
 * before the page loads, so one refusal names them all.
 * @returns {string[]} package names, sorted
 */
function missingPackages() {
  /** @type {Set<string>} */
  const missing = new Set();
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    // TypeScript drops a static import that the module uses only as a type,
    // or not at all; JavaScript loads every import.
    /** @type {Set<string>} */
    let dropped = new Set();
    if (/\.[cm]?tsx?$/.test(file)) {
      try {
        dropped = droppedImports(parseModule(source, file));
      } catch {
        // A module that does not parse is reported where it is compiled.
      }
    }
    for (const {specifier, typeOnly, declaration} of moduleImports(source, file) ?? []) {
      if (typeOnly || (declaration && dropped.has(specifier))) continue;
      const raw = specifier.split('?')[0];
      const target = importedFile(raw, file);
      if (target && path.isAbsolute(target)) {
        if (isLocal(target) && !seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
        continue;
      }
      if (raw.startsWith('.') || path.isAbsolute(raw) || namesAlias(raw) || /^[@~#]\/|^#/.test(raw)) continue;
      if (raw.startsWith('node:') || builtinModules.includes(raw.split('/')[0])) continue;
      // A package's stylesheet the page imports is a missing-asset warning
      // when absent, as the render reports it today, not a refusal.
      if (/\.(css|scss|sass|less|styl)$/i.test(raw)) continue;
      if (!packageResolves(raw, file)) missing.add(packageOf(raw));
    }
  }
  return [...missing].sort();
}

/**
 * The refusal for packages the page imports that are not installed.
 * @param {string[]} packages sorted, at least one
 */
function failMissing(packages) {
  const names =
    packages.length === 1 ? packages[0] : `${packages.slice(0, -1).join(', ')} and ${packages[packages.length - 1]}`;
  fail(
    'ERR_RENDER_MISSING_DEPENDENCY',
    `The page imports ${names}, which ${packages.length === 1 ? 'is' : 'are'} not installed`,
    {package: packages[0], packages},
  );
}

/**
 * A file named for a message: a path from the page's folder for the page's
 * own files, else the package that holds it.
 * @param {string} file
 */
function describeFile(file) {
  const at = file.lastIndexOf(NODE_MODULES);
  if (at < 0) return path.relative(path.dirname(entry), file).split(path.sep).join('/');
  const parts = file.slice(at + NODE_MODULES.length).split(path.sep);
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * Tell the host what the page is doing, so an end without an answer can say
 * where it ended.
 * @param {string} name
 */
function reach(name) {
  parentPort?.postMessage({stage: name});
}

try {
  /** @type {any} */
  let mod;
  // React DOM's client reads what the document supports as it loads (input
  // events among them). A component that loads it with the page (a toast's
  // root) would load it with no document, and the drawing could never type
  // into a field: a typeahead's search would reach no change handler. It is
  // loaded first, with a document that fires input events as a browser's
  // does; the page then renders on the server with no document.
  await withLoadDocument(() => jiti.import('react-dom/client'));
  try {
    reach('importing the page');
    const notInstalled = missingPackages();
    if (notInstalled.length > 0) {
      failMissing(notInstalled);
      throw null;
    }
    mod = await jiti.import(entry);
  } catch (e) {
    if (e === null) throw null;
    classify(e);
    throw null;
  }
  const Page = mod?.default ?? (typeof mod === 'function' ? mod : undefined);
  if (typeof Page !== 'function' && typeof Page?.$$typeof !== 'symbol') {
    fail(
      'ERR_RENDER_NO_DEFAULT_EXPORT',
      'The page has no default export to render. Export the page component: export default function Page() { … }',
    );
    throw null;
  }
  /** @type {any} */
  let React;
  /** @type {any} */
  let server;
  try {
    reach('loading React');
    React = await jiti.import('react');
    createElement = React.createElement;
    useContext = React.useContext;
    useRef = React.useRef;
    useLayoutEffect = React.useLayoutEffect;
    InChart = React.createContext(false);
    server = await jiti.import('react-dom/server');
  } catch (e) {
    classify(e);
    throw null;
  }
  /** @type {string} */
  let markup;
  let chartsFailed = 0;
  /** @type {false | 'error' | 'changed' | 'rerendered'} */
  let chartsAlone = false;
  try {
    reach('rendering on the server');
    markup = server.renderToStaticMarkup(React.createElement(Page));
    if (charts.length > 0) {
      // Drawing the page again re-runs its code: what it prints then was
      // already reported by the server render.
      const printed = logs.length;
      reach('drawing charts');
      ({markup, failed: chartsFailed, alone: chartsAlone} = await drawCharts(markup, Page));
      logs.length = printed;
    }
    if (workerData.openLayers) {
      const printed = logs.length;
      reach('drawing open overlays');
      markup += await drawOpenLayers(
        typeof mod.openLayerElements === 'function' ? mod.openLayerElements() : [React.createElement(Page)],
        React,
      );
      logs.length = printed;
    }
    if (layers.length > 0) {
      // What the parts print as they open was printed by the server render
      // of the page, or is about the drawing itself.
      const printed = logs.length;
      reach('drawing open overlays in place');
      markup = await drawLayers(markup, server);
      logs.length = printed;
    }
  } catch (e) {
    classify(e);
    throw null;
  }
  // The render always runs on React; StyleX only when the page uses it.
  for (const [name, dir] of Object.entries(SINGLE_COPY_ALIASES)) {
    if (name !== '@stylexjs/stylex' || packages.has(name)) fromSet.set(name, dir);
  }
  // The page's script is built first: it compiles every module the page
  // can load, a lazily imported one included, and their styles join the
  // stylesheet below.
  /** @type {{code: string, modules: number} | null} */
  let script = null;
  if (workerData.buildScript) {
    reach("building the page's script");
    try {
      const loaded = await import(pathToFileURL(workerData.esbuild).href);
      script = await bundleForBrowser({
        esbuild: loaded.default ?? loaded,
        entry,
        source: browserSource,
        // The files compilePageModule compiles: the page's own, and, when
        // the project has path aliases, every module outside node_modules.
        isPageFile: file => {
          const filename = path.normalize(file);
          return (
            isLocal(filename) ||
            (PATHS.length > 0 && !filename.includes(NODE_MODULES) && /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(filename))
          );
        },
        resolveFile: (name, dir) => existingFile(path.resolve(dir, name), LOAD_EXTENSIONS),
        packageDir: browserPackageDir,
        builtin: name => name.startsWith('node:') || builtinModules.includes(packageOf(name)),
        describe: describeFile,
        oneCopy: served ? Object.keys(SINGLE_COPY_ALIASES) : [],
      });
    } catch (e) {
      if (e instanceof BundleError && e.compile !== undefined) {
        classify(e.compile);
      } else if (e instanceof BundleError) {
        fail('ERR_RENDER_SCRIPT', e.message, e.detail);
      } else {
        const message = e instanceof Error ? e.message : String(e);
        fail('ERR_RENDER_SCRIPT', `The page's script cannot be built for the browser: ${message.split('\n')[0]}`);
      }
      throw null;
    }
  }
  /** @type {string} */
  let css = '';
  if (stylexRules.length > 0) {
    reach('compiling styles');
    // A module compiled for the server and again for the browser gives its
    // rules twice; each rule is written once.
    const seen = new Set();
    const rules = stylexRules.filter(rule => {
      const key = JSON.stringify(rule);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    css = stylexPlugin.processStylexRules(rules, {useLayers: false});
  }
  // Node loads some local modules itself (jiti hands it a plain ES module,
  // such as a built theme), so they never pass the transform that records
  // local files. Follow the imports of every local module instead, so the
  // file carries each module the page reaches, as --reverse expects.
  /** Every path-alias import a local module makes, with the file it names. @type {{spec: string, file: string}[]} */
  const aliasImports = [];
  for (let i = 0; i < localFiles.length; i++) {
    const file = localFiles[i];
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const spec of importSpecifiers(source, file)) {
      const target = importedFile(spec, file);
      const raw = spec.split('?')[0];
      if (target && !raw.startsWith('.')) aliasImports.push({spec: raw, file: target});
      // Modules and JSON only: the transform already carries the stylesheets
      // and images a module imports, and a Sass file is never carried.
      if (target && /\.([cm]?[jt]sx?|json)$/i.test(target) && isLocal(target) && !localFiles.includes(target)) {
        localFiles.push(target);
      }
    }
  }
  parentPort?.postMessage({
    ok: true,
    markup,
    css,
    importedCss,
    packages: [...packages],
    packageCss,
    skippedCss,
    fromSet: [...fromSet].map(([name, dir]) => ({name, dir})),
    chartsFailed,
    chartsAlone,
    assets: [...assetsInlined],
    files: localFiles,
    aliasImports,
    texts,
    fnTexts,
    screenQueries,
    logs,
    script: script?.code ?? null,
    scriptModules: script?.modules ?? 0,
  });
} catch (e) {
  if (e !== null) classify(e);
}
