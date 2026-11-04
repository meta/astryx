// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Worker for `astryx experimental render`: loads one page module from
 * the project (TypeScript, JSX and StyleX compiled in memory) and renders its
 * default export to static markup with the project's own React.
 *
 * It runs in a worker thread so a page that never finishes rendering can be
 * stopped, and so nothing the page prints reaches the CLI's own output.
 *
 * @input workerData {entry, root}
 * @output one message: {ok: true, markup, css, files, texts, logs} or
 *   {ok: false, error: {code, message, detail?}}
 * @position foundation/render — started by render-page.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {format} from 'node:util';
import {parentPort, workerData} from 'node:worker_threads';
import {transformSync} from '@babel/core';
import {createJiti} from 'jiti';
import {assetDataUri, isAssetPath} from './assets.mjs';

/** @typedef {{level: string, text: string}} PageLog */

/** @type {{entry: string, root: string}} */
const {entry, root} = workerData;
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
 * Path aliases from the project's tsconfig.json or jsconfig.json
 * (`compilerOptions.paths`), as jiti aliases: `"@/*": ["./src/*"]` becomes
 * `{"@/": "<root>/src/"}`.
 * @returns {Record<string, string>}
 */
function projectAliases() {
  /** @type {Record<string, string>} */
  const alias = {};
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    /** @type {any} */
    let config;
    try {
      // Allow the comments and trailing commas these files often carry.
      const text = fs
        .readFileSync(file, 'utf8')
        .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, str) => str ?? '')
        .replace(/,(\s*[}\]])/g, '$1');
      config = JSON.parse(text);
    } catch {
      continue;
    }
    const options = config?.compilerOptions ?? {};
    const baseDir = path.resolve(root, typeof options.baseUrl === 'string' ? options.baseUrl : '.');
    for (const [key, targets] of Object.entries(options.paths ?? {})) {
      const target = Array.isArray(targets) ? targets[0] : undefined;
      if (typeof target !== 'string') continue;
      if (key.endsWith('/*') && target.endsWith('/*')) {
        alias[key.slice(0, -1)] = `${path.resolve(baseDir, target.slice(0, -2))}/`;
      } else if (!key.includes('*') && !target.includes('*')) {
        alias[key] = path.resolve(baseDir, target);
      }
    }
    break;
  }
  return alias;
}

const ALIASES = projectAliases();

/** @param {string} spec whether a specifier goes through a project alias */
const isAliased = spec =>
  Object.keys(ALIASES).some(key => (key.endsWith('/') ? spec.startsWith(key) : spec === key));

/** @param {string} spec a specifier through a project alias, as an absolute path */
const resolveAlias = spec => {
  for (const [key, target] of Object.entries(ALIASES)) {
    if (key.endsWith('/') ? spec.startsWith(key) : spec === key) {
      return key.endsWith('/') ? target + spec.slice(key.length) : target;
    }
  }
  return spec;
};

const plain = createJiti(entry, {fsCache: false, jsx: {runtime: 'automatic'}});

const jiti = createJiti(entry, {
  fsCache: false,
  tryNative: false,
  extensions: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.json'],
  moduleCache: true,
  interopDefault: true,
  alias: ALIASES,
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
  if (missing && (isAliased(missing[1]) || /^[@~#]\/|^#/.test(missing[1]))) {
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

try {
  /** @type {any} */
  let mod;
  try {
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
    React = await jiti.import('react');
    server = await jiti.import('react-dom/server');
  } catch (e) {
    classify(e);
    throw null;
  }
  /** @type {string} */
  let markup;
  try {
    markup = server.renderToStaticMarkup(React.createElement(Page));
  } catch (e) {
    classify(e);
    throw null;
  }
  /** @type {string} */
  let css = '';
  if (stylexRules.length > 0) {
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
    assets: [...assetsInlined],
    files: localFiles,
    texts,
    fnTexts,
    logs,
  });
} catch (e) {
  if (e !== null) classify(e);
}
