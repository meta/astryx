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
 * @input workerData {entry, root, served, withoutSegmenter}
 * @output one message: {ok: true, markup, css, files, texts, logs} or
 *   {ok: false, error: {code, message, detail?}}
 * @position foundation/render — started by page-host.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import Module, {createRequire, register} from 'node:module';
import {pathToFileURL} from 'node:url';
import {format} from 'node:util';
import {parentPort, workerData} from 'node:worker_threads';
import {transformSync} from '@babel/core';
import {matchPath, readPathsIn, resolvePath} from './ts-paths.mjs';
import {createJiti} from 'jiti';
import {assetDataUri, isAssetPath} from './assets.mjs';
import {SINGLE_COPY, isServedPackage, packageOf} from './served-packages.mjs';
import {findNodeModulesPackage} from '../fs/paths.mjs';
import {CHART_GLOBAL, CHART_ROOTS, chartDocument, chartSize, markLegends} from './charts.mjs';

/** @typedef {{level: string, text: string}} PageLog */

/** @type {{entry: string, root: string, served: {dir: string, integrations: string[]} | null, withoutSegmenter?: boolean}} */
const {entry, root} = workerData;

// Some Node builds crash in Intl.Segmenter. Without it, Core splits text by
// code points, so a joined emoji can count as several characters.
if (workerData.withoutSegmenter) delete (/** @type {any} */ (Intl)).Segmenter;

/** The package set, for a page outside a project whose folder has no Core of its own. */
const served = workerData.served && findNodeModulesPackage(path.dirname(entry), '@astryxdesign/core') === null ? workerData.served : null;
const ROOT_PREFIX = root.endsWith(path.sep) ? root : root + path.sep;

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

/** A module of the project itself: inside its folder, not a package.
 * @param {string} file */
const isLocal = file =>
  !file.includes(NODE_MODULES) && (file === entry || file.startsWith(ROOT_PREFIX));

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

/**
 * Wrap a recharts chart, or a ResponsiveContainer, so the server render sets
 * it aside and the drawing pass draws it: a container at the size it starts
 * at, in a box that lets the drawing fit the page's width.
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
    const drawn = container
      ? createElement('div', {className: 'recharts-responsive-container'}, createElement(Chart, {...props, ...chartSize(props)}))
      : createElement(Chart, props);
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
    if (!error) markLegends(host);
    const out = error ? null : read(host);
    root.unmount();
    return out;
  };
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
    drawn = charts.map(chart => drawIn(chart, host => [host.innerHTML])?.[0] ?? '');
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
 * Babel plugin: replace asset imports with data: URIs and stylesheet imports
 * with nothing (their CSS is inlined into the page), and record static text
 * children of capitalized JSX elements.
 * @param {string} filename
 */
function pagePlugin(filename) {
  const dir = path.dirname(filename);
  return (/** @type {any} */ {types: t}) => ({
    visitor: {
      ImportDeclaration(/** @type {any} */ p) {
        const spec = /** @type {string} */ (p.node.source.value);
        if (spec === 'recharts') setChartsAside(p, t);
        const raw = spec.split('?')[0];
        // A stylesheet, image or JSON file imported through a project alias
        // (`@/styles/site.css`) resolves the way modules do.
        const bare =
          isAliased(raw) && (/\.(css|scss|sass|less|json)$/i.test(raw) || isAssetPath(raw)) ? resolveAlias(raw) : raw;
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
          skippedCss.push(bare);
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
            packageCss.push({spec: bare, from: filename});
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
          p.replaceWith(
            t.variableDeclaration('const', [
              t.variableDeclarator(t.identifier(local.local.name), t.stringLiteral(uri)),
            ]),
          );
        }
      },
      JSXText(/** @type {any} */ p) {
        const v = cleanText(p.node);
        if (v.length >= 2) (fnTexts[fnKey(p)] ??= []).push(v);
      },
      JSXElement(/** @type {any} */ p) {
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
 * The project's path aliases (`compilerOptions.paths` in tsconfig.json or
 * jsconfig.json), matched by TypeScript's rules (see ts-paths.mjs).
 */
const PATHS = readPathsIn(root) ?? [];

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

const plain = createJiti(entry, {fsCache: false, jsx: {runtime: 'automatic'}});

const jiti = createJiti(entry, {
  fsCache: false,
  tryNative: false,
  extensions: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.json'],
  moduleCache: true,
  interopDefault: true,
  alias: SINGLE_COPY_ALIASES,
  jsx: {runtime: 'automatic'},
  transform(opts) {
    const filename = opts.filename ?? '';
    let source = opts.source;
    if (filename && isLocal(filename) && /\.json$/i.test(filename) && !localFiles.includes(filename)) {
      localFiles.push(filename);
    }
    if (filename && isLocal(filename) && /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(filename)) {
      if (!localFiles.includes(filename)) localFiles.push(filename);
      const ts = /\.(tsx?|mts|cts)$/.test(filename);
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
          pagePlugin(filename),
          ...(source.includes('stylex')
            ? [
                [
                  stylexPlugin,
                  {
                    dev: false,
                    runtimeInjection: false,
                    treeshakeCompensation: true,
                    unstable_moduleResolution: {type: 'commonJS', rootDir: root},
                  },
                ],
              ]
            : []),
        ],
      });
      const rules = /** @type {any} */ (result?.metadata)?.stylex;
      if (Array.isArray(rules)) stylexRules.push(...rules);
      source = result?.code ?? source;
    } else if (
      PATHS.length > 0 &&
      filename &&
      !filename.includes(NODE_MODULES) &&
      /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(filename)
    ) {
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
      source = result?.code ?? source;
    }
    return {code: plain.transform({...opts, source, babel: {...opts.babel, compact: false}})};
  },
});

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [detail]
 */
function fail(code, message, detail) {
  parentPort?.postMessage({ok: false, error: {code, message, detail}, logs});
}

/** @param {unknown} e */
function classify(e) {
  const err = /** @type {any} */ (e);
  if (err?.renderCode) return fail(err.renderCode, String(err.message).replace(/^\/[^:\n]*: /, ''));
  // Babel prefixes errors raised while compiling with the file's path.
  const message = String(err?.message ?? err).replace(/^\/[^:\n]*: /, '');
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
    const loc = err?.loc ? `:${err.loc.line}:${err.loc.column + 1}` : '';
    return fail('ERR_RENDER_COMPILE', `The page does not compile${loc ? ` (line ${err.loc.line})` : ''}: ${message.split('\n')[0]}`, {
      ...(err?.loc ? {line: err.loc.line, column: err.loc.column + 1} : {}),
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
  try {
    reach('importing the page');
    mod = await jiti.import(entry);
  } catch (e) {
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
  } catch (e) {
    classify(e);
    throw null;
  }
  // The render always runs on React; StyleX only when the page uses it.
  for (const [name, dir] of Object.entries(SINGLE_COPY_ALIASES)) {
    if (name !== '@stylexjs/stylex' || packages.has(name)) fromSet.set(name, dir);
  }
  /** @type {string} */
  let css = '';
  if (stylexRules.length > 0) {
    reach('compiling styles');
    css = stylexPlugin.processStylexRules(stylexRules, {useLayers: false});
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
    texts,
    fnTexts,
    logs,
  });
} catch (e) {
  if (e !== null) classify(e);
}
