// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx doctor --built <path>`: did a finished build actually use
 * Astryx, and how well? Two checks a coding agent runs before it delivers a
 * page.
 *
 * @input A path: a project folder, a build output folder, or one file (a
 *   built `.html` page or a source file), and the package names whose
 *   components count as Astryx: every `@astryxdesign/*` package and each
 *   integration the project loads (its component catalog's providers).
 * @output `built-astryx-usage`: fails when the path holds no value import from those
 *   packages, no use of a component imported from them, and no Astryx
 *   stylesheet in built CSS or HTML. `built-astryx-styles`: warns when output
 *   that uses Astryx holds built stylesheets or pages but none carries Core's
 *   component styles, so its components render unstyled; an app that compiles
 *   Core from source is not checked. `built-astryx-purity`: warns with the
 *   findings of the source check in `astryx docs is-my-code-good` (raw
 *   elements Astryx has a component for, raw SVG and icon-library icons,
 *   inline styles, classes, StyleX declarations and imported stylesheets,
 *   except a setup stylesheet that only loads Astryx packages' CSS),
 *   each with its file and line; info, "not inspected", when the path holds
 *   no source with JSX (a bundle is build output, not source).
 * @position Pure: the doctor adapter reads the files (readBuiltPath) and the
 *   integration package names (builtIntegrationPackages); nothing here runs
 *   project code, its configuration, or a browser. Plain `astryx doctor` does not run
 *   it.
 */

import {
  BUILT_FILE_LIMIT,
  BUILT_FILE_MAX_MB,
  doctorStylesheetOnlyLoads,
  doctorThemeWiring,
  readBuiltPath,
  resolveBuiltPath,
} from './_adapter.mjs';
import {formatCliCommand} from '../../foundation/env/package-manager.mjs';
import {babelParse as parseModule} from '../../foundation/runtime/lazy-dependencies.mjs';
import {compareText} from '../../foundation/text/compare-text.mjs';
import * as path from 'node:path';

/** Source files, read for imports and JSX. */
const SOURCE_EXT = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs']);

/**
 * The lowercased extension of a relative path, with its dot.
 * @param {string} rel
 */
function extensionOf(rel) {
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** Files that hold JSX by their extension. */
const JSX_EXT = new Set(['.tsx', '.jsx']);

/** A cheap test before parsing: a tag or fragment opens somewhere. */
const HAS_JSX = /<(?:[A-Za-z]|>)/;

/**
 * Whether a `.js` or `.mjs` source file holds JSX, read from its parse, or
 * null when it does not parse (Flow, decorators and the like the parser
 * cannot read), so the file counts as not inspected.
 * @param {string} text
 * @returns {boolean | null}
 */
function hasJsx(text) {
  if (!HAS_JSX.test(text)) return false;
  /** @type {any} */
  let ast = null;
  for (const plugins of /** @type {any[][]} */ ([
    ['jsx'],
    ['jsx', 'flow', ['decorators', {decoratorsBeforeExport: true}]],
  ])) {
    try {
      ast = parseModule(text, {
        sourceType: 'unambiguous',
        plugins,
        errorRecovery: true,
        attachComment: false,
      });
      break;
    } catch {
      // try the next set of syntax plugins
    }
  }
  if (!ast) return null;
  /** @type {any[]} */
  const stack = [ast.program];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node.type !== 'string') continue;
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true;
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key.endsWith('Comments')) continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) stack.push(child);
      } else if (value && typeof value === 'object') stack.push(value);
    }
  }
  return false;
}

/** Built files, read for an Astryx stylesheet. */
const BUILT_EXT = new Set(['.css', '.html', '.htm', '.js', '.mjs']);

/** How many findings a check message names before it counts the rest. */
const SHOWN = 5;

/**
 * Marks of Astryx's stylesheets that survive a production build: the cascade
 * layers Core's and the themes' CSS declare, and Astryx's own custom
 * properties.
 */
const STYLESHEET_MARK =
  /@layer\s+[^{;]*\bastryx-(?:base|theme)\b|--astryx-[\w-]+/;

/**
 * The mark of Core's component styles (`@astryxdesign/core/astryx.css`) in a
 * built stylesheet or page: the rules of the `astryx-base` cascade layer. A
 * theme's stylesheet names that layer only in its layer order. Core's
 * scripts hold such a rule as text they write at run time, so only
 * stylesheets and pages count.
 */
const CORE_STYLES_MARK = /@layer\s+astryx-base\s*\{/;

/** Core's component styles, as a stylesheet or a module imports them. */
const CORE_STYLESHEET = '@astryxdesign/core/astryx.css';

/**
 * A page's link to Core's component styles: the package's file, from a
 * package CDN (`…/@astryxdesign/core@<version>/dist/astryx.css`) or an
 * installed copy.
 */
const CORE_STYLESHEET_HREF =
  /@astryxdesign\/core(?:@[^/"'\s]+)?\/(?:dist\/)?astryx\.css(?:[?#"'\s]|$)/u;

/**
 * Whether a page links Core's component styles: a `<link>` whose `rel` is a
 * stylesheet and whose `href` names the package's `astryx.css`. Comments
 * never count.
 * @param {string} html
 */
export function linksCoreStylesheet(html) {
  return stylesheetLinkHrefs(html).some(href =>
    CORE_STYLESHEET_HREF.test(href),
  );
}

/**
 * The `href` of every `<link>` in a page whose `rel` is a stylesheet: a
 * page file's HTML, or the JSX of a layout that writes the page head.
 * Comments never count (HTML ones, and a layout's JS block comments), and
 * a link whose `rel` only mentions a stylesheet (`preload`) is none.
 * @param {string} page
 * @returns {string[]}
 */
export function stylesheetLinkHrefs(page) {
  const text = page
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/\/\*[\s\S]*?\*\//gu, ' ');
  /** @type {string[]} */
  const out = [];
  for (const tag of text.matchAll(/<link\b[^>]*>/giu)) {
    const attributes = tag[0];
    const relMatch =
      /\brel\s*=\s*(?:\{?\s*(["'`])([^"'`]*)\1|([^\s"'`>]+))/iu.exec(
        attributes,
      );
    const rel = relMatch?.[2] ?? relMatch?.[3];
    if (!rel || !rel.split(/\s+/u).some(word => /^stylesheet$/iu.test(word)))
      continue;
    const href = /\bhref\s*=\s*\{?\s*(["'`])([^"'`]*)\1/iu.exec(
      attributes,
    )?.[2];
    if (href) out.push(href);
  }
  return out;
}

/**
 * Raw elements the rubric names a component for (`astryx docs
 * is-my-code-good`, "Common component replacements"), with that owner.
 * @type {Readonly<Record<string, string>>}
 */
const RAW_ELEMENTS = Object.freeze({
  div: '`VStack`, `HStack`, `Grid`, `Card`, `Section` or `Center`',
  span: '`Text`',
  p: '`Text`',
  h1: '`Heading`',
  h2: '`Heading`',
  h3: '`Heading`',
  h4: '`Heading`',
  h5: '`Heading`',
  h6: '`Heading`',
  button: '`Button` or `IconButton`',
  a: '`Link`',
  nav: '`LayoutPanel`',
  aside: '`LayoutPanel`',
  header: '`LayoutHeader`',
  main: '`LayoutContent`',
  ul: '`List`',
  ol: '`List`',
  li: '`ListItem`',
  input: 'the matching form control',
  textarea: 'the matching form control',
  select: 'the matching form control',
  table: '`Table`',
  tr: '`Table`',
  td: '`Table`',
  th: '`Table`',
  hr: '`Divider`',
  dialog: '`Dialog`',
  details: '`Collapsible`',
  summary: '`Collapsible`',
});

/** Raw SVG elements the rubric counts as hand-drawn icons. */
const SVG_ELEMENTS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'g',
]);

/** Icon libraries whose components the rubric counts when used directly. */
const ICON_PACKAGES = [
  'lucide-react',
  'react-icons',
  '@heroicons/react',
  '@tabler/icons-react',
  '@phosphor-icons/react',
  'react-feather',
  '@mui/icons-material',
  '@fortawesome/react-fontawesome',
  '@radix-ui/react-icons',
];

/**
 * @typedef {object} BuiltFinding
 * @property {string} category the rubric category: `Astryx components`,
 *   `Icons` or `Styling`
 * @property {string} file relative to the checked path
 * @property {number} line 1-based
 * @property {string} message
 */

/**
 * @typedef {object} BuiltScan
 * @property {number} sourceFiles
 * @property {number} jsxFiles source files whose JSX was inspected
 * @property {number} builtFiles
 * @property {number} imports imports from Astryx packages
 * @property {number} importFiles files with one
 * @property {number} componentUses JSX uses of names imported from them
 * @property {string[]} packages the Astryx packages imported, sorted
 * @property {string[]} stylesheets built files with an Astryx stylesheet
 * @property {number} styleFiles built stylesheets and pages read
 * @property {string[]} coreStyles those with Core's component styles
 * @property {string[]} coreStyleImports source files and stylesheets that
 *   import Core's component styles, which a build then carries
 * @property {string[]} coreStyleLinks pages that link Core's component styles
 * @property {BuiltFinding[]} findings
 * @property {boolean} truncated whether the file limit cut the read short
 * @property {number} unread source files over the size limit, unreadable, or
 *   not parsed
 * @property {string[]} unreadFiles those files, relative to the path
 * @property {number} missingLinks local files a built page links that are not
 *   there
 */

/**
 * Whether a package specifier names one of the Astryx packages.
 * @param {string} spec
 * @param {readonly string[]} packages
 */
function isAstryxSpecifier(spec, packages) {
  if (spec.startsWith('@astryxdesign/')) return true;
  return packages.some(name => spec === name || spec.startsWith(`${name}/`));
}

/** @param {string} spec */
function isIconSpecifier(spec) {
  return ICON_PACKAGES.some(
    name => spec === name || spec.startsWith(`${name}/`),
  );
}

/**
 * The 1-based line of an offset.
 * @param {string} text
 * @param {number} at
 */
function lineAt(text, at) {
  if (text !== lineCache.text) {
    /** @type {number[]} */
    const starts = [0];
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
      starts.push(i + 1);
    }
    lineCache = {text, starts};
  }
  const {starts} = lineCache;
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= at) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

/** The line starts of the last file lineAt read, found once per file. */
/** @type {{text: string | null, starts: number[]}} */
let lineCache = {text: null, starts: [0]};

/**
 * Text with comments blanked out, keeping every offset, so a commented-out
 * tag or import is not read. The comments are the ones `@babel/parser`
 * finds, so a `//` or `/*` in a string or in JSX text is not one; a file it
 * cannot parse falls back to a scan that skips string literals.
 * @param {string} text
 */
function withoutComments(text, ext = '', parsed = commentRanges(text, ext)) {
  return parsed ? blankRanges(text, parsed) : scanOutComments(text);
}

/**
 * Text with each range blanked, every character but a line break made a
 * space, so every offset and line stays where it was.
 * @param {string} text
 * @param {Array<[number, number]>} ranges in order, none overlapping
 */
function blankRanges(text, ranges) {
  let out = '';
  let at = 0;
  for (const [start, end] of ranges) {
    out +=
      text.slice(at, start) + text.slice(start, end).replace(/[^\n]/g, ' ');
    at = end;
  }
  return out + text.slice(at);
}

/**
 * A source file's syntax tree from `@babel/parser` (TypeScript and JSX, then
 * legacy decorators, then Flow), or null when no attempt parses it.
 * @param {string} text
 * @param {string} ext
 * @returns {any}
 */
function parseSource(text, ext) {
  const typescript = /^\.[cm]?tsx?$/.test(ext);
  const jsx = ext === '.tsx' || !typescript;
  const base = [...(typescript ? ['typescript'] : []), ...(jsx ? ['jsx'] : [])];
  for (const plugins of /** @type {any[][]} */ ([
    base,
    [...base, 'decorators-legacy'],
    ...(typescript
      ? []
      : [['jsx', 'flow', ['decorators', {decoratorsBeforeExport: true}]]]),
  ])) {
    try {
      return parseModule(text, {
        sourceType: 'unambiguous',
        plugins,
        errorRecovery: true,
        // The checks read the file's list of comments, never a node's.
        attachComment: false,
      });
    } catch {
      // try the next set of syntax plugins
    }
  }
  return null;
}

/**
 * The comment ranges `@babel/parser` finds in a source file, or null when it
 * cannot parse the file.
 * @param {string} text
 * @param {string} ext
 * @param {any} [ast]
 * @returns {Array<[number, number]> | null}
 */
function commentRanges(text, ext, ast = parseSource(text, ext)) {
  if (!ast) return null;
  return (ast.comments ?? []).map(
    (/** @type {any} */ c) =>
      /** @type {[number, number]} */ ([c.start, c.end]),
  );
}

/**
 * Whether a source can hold a `require()` or `import()` call: the word
 * `require`, `import` followed by a parenthesis or a comment, or a Unicode
 * escape, which can spell `require`. A source with none of these has no such
 * call, so its syntax tree is not walked for one.
 */
const MAY_CALL = /\brequire\b|\bimport\s*(?:\(|\/[*/]|<!--|-->)|\\u/;

/**
 * The imports a parsed source file makes, read from its syntax tree so that
 * an import written in a string, a template literal or JSX text (a code
 * sample on a page) is not one: import and export-from declarations, and
 * `require()` and `import()` of a string.
 * @param {any} ast
 * @param {string} source the file's text
 * @returns {{spec: string, names: string[], at: number}[]}
 */
function astImports(ast, source) {
  /** @type {{spec: string, names: string[], at: number}[]} */
  const found = [];
  for (const node of ast.program.body) {
    // A type-only import or re-export is erased from the built page, so it
    // is not Astryx use.
    if (node.importKind === 'type' || node.exportKind === 'type') continue;
    if (node.type === 'ImportDeclaration') {
      const values = node.specifiers.filter(
        (/** @type {any} */ each) => each.importKind !== 'type',
      );
      if (node.specifiers.length > 0 && values.length === 0) continue;
      found.push({
        spec: node.source.value,
        names: values.map((/** @type {any} */ each) => each.local.name),
        at: node.start,
      });
    } else if (
      (node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source
    ) {
      const specifiers = node.specifiers ?? [];
      if (
        specifiers.length > 0 &&
        specifiers.every(
          (/** @type {any} */ each) => each.exportKind === 'type',
        )
      ) {
        continue;
      }
      found.push({spec: node.source.value, names: [], at: node.start});
    }
  }
  /** @type {any[]} */
  const stack = MAY_CALL.test(source) ? [ast.program] : [];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node.type !== 'string') continue;
    if (
      node.type === 'CallExpression' &&
      (node.callee?.type === 'Import' ||
        (node.callee?.type === 'Identifier' &&
          node.callee.name === 'require')) &&
      node.arguments?.[0]?.type === 'StringLiteral'
    ) {
      found.push({spec: node.arguments[0].value, names: [], at: node.start});
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key.endsWith('Comments')) continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) stack.push(child);
      } else if (value && typeof value === 'object') stack.push(value);
    }
  }
  return found;
}

/**
 * Text with comments blanked by a scan that skips string literals, for a
 * file the parser cannot read.
 * @param {string} text
 */
function scanOutComments(text) {
  /** @type {Array<[number, number]>} */
  const comments = [];
  /** @type {string | null} the quote of the string being read */
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote || (char === '\n' && quote !== '`')) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char !== '/') continue;
    const next = text[i + 1];
    if (next !== '/' && next !== '*') continue;
    const end =
      next === '/'
        ? (text.indexOf('\n', i) + 1 || text.length + 1) - 1
        : (text.indexOf('*/', i + 2) + 1 || text.length - 1) + 1;
    comments.push([i, end]);
    i = end - 1;
  }
  return blankRanges(text, comments);
}

/**
 * The imports of a source file: each specifier with the local names it binds.
 * @param {string} text
 * @returns {{spec: string, names: string[], at: number}[]}
 */
function importsOf(text) {
  /** @type {{spec: string, names: string[], at: number}[]} */
  const found = [];
  const fromImport =
    /\bimport\s+(type\s+)?([^'";]*?)\s+from\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;
  /** Whether every name in a `{…}` list is marked `type`. */
  const allTypes = (/** @type {string} */ list) => {
    const parts = list
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    return parts.length > 0 && parts.every(part => /^type\s/.test(part));
  };
  for (const match of text.matchAll(fromImport)) {
    const at = /** @type {number} */ (match.index);
    if (match[4]) {
      found.push({spec: match[4], names: [], at});
      continue;
    }
    // A type-only import is erased from the build, so it is not use.
    if (match[1]) continue;
    const clause = match[2];
    const onlyBraces = /^\{([\s\S]*)\}$/.exec(clause.trim());
    if (onlyBraces && allTypes(onlyBraces[1])) continue;
    /** @type {string[]} */
    const names = [];
    const braces = /\{([\s\S]*)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const local = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
          .pop()
          ?.trim();
        if (local) names.push(local);
      }
    }
    const outside = clause.replace(/\{[\s\S]*\}/, '');
    for (const part of outside.split(',')) {
      const name = part.trim().replace(/^\*\s+as\s+/, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
    }
    found.push({spec: match[3], names, at});
  }
  // A barrel that re-exports a package reaches it as an import does; a
  // type-only re-export is erased like a type-only import.
  for (const match of text.matchAll(
    /\bexport\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s+['"]([^'"]+)['"]/g,
  )) {
    if (match[1]) continue;
    const list = /^\{([\s\S]*)\}$/.exec(match[2]);
    if (list && allTypes(list[1])) continue;
    found.push({
      spec: match[3],
      names: [],
      at: /** @type {number} */ (match.index),
    });
  }
  for (const match of text.matchAll(
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  )) {
    found.push({
      spec: match[1] ?? match[2],
      names: [],
      at: /** @type {number} */ (match.index),
    });
  }
  return found;
}

/**
 * The source findings of one JSX file.
 * @param {string} text comments blanked
 * @param {string} rel
 * @param {Set<string>} iconNames local names imported from icon libraries
 * @returns {BuiltFinding[]}
 */
function jsxFindings(text, rel, iconNames) {
  /** @type {BuiltFinding[]} */
  const findings = [];
  for (const match of text.matchAll(/<([a-z][a-z0-9]*)(?=[\s/>])([^>]*)/g)) {
    const tag = match[1];
    const at = /** @type {number} */ (match.index);
    const line = lineAt(text, at);
    if (SVG_ELEMENTS.has(tag)) {
      // A helper's SVG counts once: by its root element.
      if (tag === 'svg') {
        findings.push({
          category: 'Icons',
          file: rel,
          line,
          message:
            'raw `<svg>`: render icons through `Icon`, `IconButton` or an icon prop',
        });
      }
      continue;
    }
    const owner = RAW_ELEMENTS[tag];
    if (!owner) continue;
    // Native semantics the rubric keeps: hidden form state.
    if (tag === 'input' && /\btype\s*=\s*["']hidden["']/.test(match[2])) {
      continue;
    }
    findings.push({
      category: 'Astryx components',
      file: rel,
      line,
      message: `raw \`<${tag}>\`: use ${owner}`,
    });
  }
  for (const name of iconNames) {
    for (const match of text.matchAll(
      new RegExp(`<${name.replace(/[$]/g, '\\$')}(?=[\\s/>])`, 'g'),
    )) {
      findings.push({
        category: 'Icons',
        file: rel,
        line: lineAt(text, /** @type {number} */ (match.index)),
        message: `\`<${name}>\` from an icon library: render it through \`Icon\` or an icon prop`,
      });
    }
  }
  for (const [pattern, what] of /** @type {const} */ ([
    [/\bstyle\s*=\s*\{/g, 'an inline `style`'],
    [/\bclassName\s*=/g, 'a `className`'],
  ])) {
    for (const match of text.matchAll(pattern)) {
      findings.push({
        category: 'Styling',
        file: rel,
        line: lineAt(text, /** @type {number} */ (match.index)),
        message: `${what}: use a component prop or token first`,
      });
    }
  }
  return findings;
}

/**
 * Whether a source file's relative stylesheet import names a scanned
 * stylesheet that only loads Astryx packages' CSS: the setup stylesheet the
 * getting-started steps write (`reset.css`, `astryx.css`, a theme's CSS).
 * Importing one wires Astryx up; it never styles a page. A sheet with any
 * rule of its own, or an import from elsewhere, is not one. Each sheet is
 * read once, and only when a source file imports it.
 * @param {ReadonlyArray<{rel: string, read: () => string | null}>} files
 * @param {readonly string[]} packages
 * @returns {(spec: string, rel: string) => boolean}
 */
function astryxSetupStylesheets(files, packages) {
  const byRel = new Map(files.map(file => [file.rel, file]));
  /** @type {Map<string, boolean>} */
  const known = new Map();
  return (spec, rel) => {
    if (!spec.startsWith('.')) return false;
    const sheet = path.posix.join(path.posix.dirname(rel), spec);
    let setup = known.get(sheet);
    if (setup === undefined) {
      const raw =
        extensionOf(sheet) === '.css' ? byRel.get(sheet)?.read() : null;
      const specs = raw == null ? null : doctorStylesheetOnlyLoads(raw);
      setup =
        specs != null &&
        specs.length > 0 &&
        specs.every(each => isAstryxSpecifier(each, packages));
      known.set(sheet, setup);
    }
    return setup;
  };
}

/**
 * Read a path and gather the evidence both checks judge.
 * @param {string} target an existing file or folder
 * @param {readonly string[]} packages package names whose components count as
 *   Astryx, beside every `@astryxdesign/*` package
 * @param {{fileLimit?: number}} [options] how many files to read at most
 * @returns {BuiltScan}
 */
export function scanBuilt(target, packages, {fileLimit} = {}) {
  const {files, truncated, missing = 0} = readBuiltPath(target, {fileLimit});
  const wiring = doctorThemeWiring(target);
  const isSetupSheet = astryxSetupStylesheets(files, packages);
  /** @type {BuiltScan} */
  const scan = {
    sourceFiles: 0,
    jsxFiles: 0,
    builtFiles: 0,
    imports: 0,
    importFiles: 0,
    componentUses: 0,
    packages: [],
    stylesheets: [],
    styleFiles: 0,
    coreStyles: [],
    coreStyleImports: [],
    coreStyleLinks: [],
    findings: [],
    truncated,
    unread: 0,
    unreadFiles: [],
    missingLinks: missing,
  };
  const imported = new Set();
  for (const {rel, built, read} of files) {
    const ext = extensionOf(rel);
    // A bundler emits no .tsx or .jsx, so one inside a folder named like
    // build output is still source.
    const isSource =
      SOURCE_EXT.has(ext) &&
      !rel.endsWith('.d.ts') &&
      (!built || JSX_EXT.has(ext));
    const isBuilt = BUILT_EXT.has(ext) && (built || !isSource);
    if (!isSource && !isBuilt) continue;
    const raw = read();
    if (raw == null) {
      if (isSource) {
        scan.unread++;
        scan.unreadFiles.push(rel);
      }
      continue;
    }
    if (isBuilt) {
      scan.builtFiles++;
      // A commented-out rule or import is not Astryx styling.
      const styles =
        ext === '.css' || ext === '.html' || ext === '.htm'
          ? raw.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, ' ')
          : raw;
      if (STYLESHEET_MARK.test(styles)) scan.stylesheets.push(rel);
      if (ext === '.css' || ext === '.html' || ext === '.htm') {
        scan.styleFiles++;
        if (CORE_STYLES_MARK.test(styles)) scan.coreStyles.push(rel);
      }
      if ((ext === '.html' || ext === '.htm') && linksCoreStylesheet(raw)) {
        scan.coreStyleLinks.push(rel);
      }
      // A stylesheet that imports an Astryx package's CSS, as the
      // getting-started setup does, uses Astryx.
      if (ext === '.css') {
        for (const match of styles.matchAll(
          /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/g,
        )) {
          if (!isAstryxSpecifier(match[1], packages)) continue;
          if (match[1] === CORE_STYLESHEET) scan.coreStyleImports.push(rel);
          scan.imports++;
          scan.importFiles++;
          imported.add(
            match[1]
              .split('/')
              .slice(0, match[1].startsWith('@') ? 2 : 1)
              .join('/'),
          );
        }
      }
    }
    if (!isSource) continue;
    scan.sourceFiles++;
    const ast = parseSource(raw, ext);
    const ranges = commentRanges(raw, ext, ast);
    const text = withoutComments(raw, ext, ranges);
    const astryxNames = new Set();
    const iconNames = new Set();
    let fileImports = 0;
    for (const {spec, names, at} of ast
      ? astImports(ast, raw)
      : importsOf(text)) {
      if (isAstryxSpecifier(spec, packages)) {
        if (spec === CORE_STYLESHEET) scan.coreStyleImports.push(rel);
        fileImports++;
        imported.add(
          spec.startsWith('@')
            ? spec.split('/').slice(0, 2).join('/')
            : spec.split('/')[0],
        );
        for (const name of names) astryxNames.add(name);
      } else if (isIconSpecifier(spec)) {
        for (const name of names) iconNames.add(name);
      } else if (
        /\.(?:css|scss|sass|less)$/.test(spec) &&
        !wiring.has(spec, rel) &&
        !isSetupSheet(spec, rel)
      ) {
        scan.findings.push({
          category: 'Styling',
          file: rel,
          line: lineAt(text, at),
          message: `imports the stylesheet \`${spec}\`: use component props and tokens`,
        });
      }
    }
    for (const match of text.matchAll(/\bstylex\.create\s*\(/g)) {
      scan.findings.push({
        category: 'Styling',
        file: rel,
        line: lineAt(text, /** @type {number} */ (match.index)),
        message:
          'a `stylex.create` declaration: use a component prop or token first',
      });
    }
    scan.imports += fileImports;
    if (fileImports > 0) scan.importFiles++;
    for (const name of astryxNames) {
      if (!/^[A-Z]/.test(name)) continue;
      const uses = text.match(new RegExp(`<${name}(?=[\\s/>.])`, 'g'));
      scan.componentUses += uses?.length ?? 0;
    }
    // A file the parser cannot read is not inspected: its imports still
    // count, but no finding is read from it.
    if (ranges === null && (JSX_EXT.has(ext) || /\.[cm]?js$/u.test(ext))) {
      scan.unread++;
      scan.unreadFiles.push(rel);
      continue;
    }
    const jsx = /\.[cm]?js$/u.test(ext) ? hasJsx(text) : false;
    if (jsx === null) {
      scan.unread++;
      scan.unreadFiles.push(rel);
      continue;
    }
    if (JSX_EXT.has(ext) || jsx) {
      scan.jsxFiles++;
      for (const finding of jsxFindings(text, rel, iconNames)) {
        scan.findings.push(finding);
      }
    }
  }
  scan.packages = [...imported].sort();
  scan.findings.sort((a, b) => compareText(a.file, b.file) || a.line - b.line);
  return scan;
}

/**
 * @param {number} count
 * @param {string} word
 */
function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Whether output that uses Astryx carries Core's component styles. A page's
 * components take their styles from `@astryxdesign/core/astryx.css`; a build
 * without it passes and loads, but every component renders unstyled. It
 * warns: `--built` shipped in a stable release without this check, and a new
 * failure waits for the next minor release. An app that compiles Core's
 * styles from source needs no `astryx.css`, so output that carries none is
 * not checked there.
 * @param {BuiltScan} scan
 * @param {string} target as the caller gave it
 * @param {string} cwd
 * @param {string | null} sourceBuild how the app compiles Core from source
 * @returns {import('./doctor.type.mjs').DoctorCheck}
 */
function coreStylesCheck(scan, target, cwd, sourceBuild) {
  const label = "Built output carries Core's component styles";
  if (scan.coreStyles.length > 0) {
    return {
      id: 'built-astryx-styles',
      label,
      status: 'pass',
      message: `Core's component styles are in ${scan.coreStyles.slice(0, 3).join(', ')}${scan.coreStyles.length > 3 ? ` and ${scan.coreStyles.length - 3} more` : ''}.`,
    };
  }
  if (scan.coreStyleLinks.length > 0) {
    return {
      id: 'built-astryx-styles',
      label,
      status: 'pass',
      message: `${scan.coreStyleLinks[0]} links ${CORE_STYLESHEET}, Core's component styles.`,
    };
  }
  if (scan.coreStyleImports.length > 0) {
    return {
      id: 'built-astryx-styles',
      label,
      status: 'pass',
      message: `${scan.coreStyleImports[0]} imports ${CORE_STYLESHEET}, Core's component styles, so a build of it carries them.`,
    };
  }
  if (sourceBuild) {
    return {
      id: 'built-astryx-styles',
      label,
      status: 'info',
      message: `Not checked: this app compiles Core's styles from source (${sourceBuild}), so its build does not need ${CORE_STYLESHEET}.`,
    };
  }
  if (scan.styleFiles === 0) {
    return {
      id: 'built-astryx-styles',
      label,
      status: 'info',
      message: `${target} holds no built stylesheet or page, so doctor did not check whether Core's component styles reached the build. Run \`${formatCliCommand('doctor --built <folder>', cwd)}\` on the build output.`,
    };
  }
  return {
    id: 'built-astryx-styles',
    label,
    status: 'warn',
    message: `${scan.styleFiles === 1 ? 'The one built stylesheet or page that doctor read does not carry' : `None of the ${scan.styleFiles} built stylesheets and pages that doctor read carries`} Core's component styles (the \`astryx-base\` layer of ${CORE_STYLESHEET}). This output's Astryx components render unstyled.`,
    fix: "Import Core's stylesheets once, in the app's global stylesheet: `@import '@astryxdesign/core/reset.css';` then `@import '@astryxdesign/core/astryx.css';`. Or import both in the app's entry module, reset.css first. Then build again. Do not deliver this output.",
  };
}

/**
 * The checks for a path.
 * @param {string} target as the caller gave it
 * @param {{cwd: string, packages: readonly string[], fileLimit?: number, sourceBuild?: string | null}} options
 *   `packages`: the integration packages whose components count as Astryx.
 *   `fileLimit`: how many files to read at most (BUILT_FILE_LIMIT).
 *   `sourceBuild`: how the path's app compiles Core's styles from source,
 *   when it does (the doctor adapter reads it).
 * @returns {import('./doctor.type.mjs').DoctorCheck[]}
 */
export function checkBuilt(
  target,
  {cwd, packages, fileLimit = BUILT_FILE_LIMIT, sourceBuild = null},
) {
  const resolved = resolveBuiltPath(cwd, target);
  if (resolved == null) {
    return [
      {
        id: 'built-astryx-usage',
        label: 'Built output uses Astryx',
        status: 'fail',
        message: `${target} does not exist, so nothing was checked.`,
        fix: 'Pass the project folder, the build output folder, or the built HTML file.',
      },
    ];
  }
  const scan = scanBuilt(resolved, packages, {fileLimit});
  const used =
    scan.imports > 0 || scan.componentUses > 0 || scan.stylesheets.length > 0;
  const read = `${plural(scan.sourceFiles, 'source file')} and ${plural(scan.builtFiles, 'built file')}${scan.truncated ? ` (the first ${fileLimit} files)` : ''}`;
  const evidence = [
    scan.imports > 0
      ? `${plural(scan.imports, 'import')} from ${scan.packages.join(', ')} in ${plural(scan.importFiles, 'file')}`
      : null,
    scan.componentUses > 0
      ? `${plural(scan.componentUses, 'component use')}`
      : null,
    scan.stylesheets.length > 0
      ? `Astryx styles in ${scan.stylesheets.slice(0, 3).join(', ')}${scan.stylesheets.length > 3 ? ` and ${scan.stylesheets.length - 3} more` : ''}`
      : null,
  ].filter(Boolean);
  /** @type {import('./doctor.type.mjs').DoctorCheck} */
  const usage = used
    ? {
        id: 'built-astryx-usage',
        label: 'Built output uses Astryx',
        status: 'pass',
        message: `Read ${read}: ${evidence.join('; ')}.`,
      }
    : scan.sourceFiles === 0 &&
        scan.builtFiles === 0 &&
        scan.unread === 0 &&
        !scan.truncated
      ? {
          id: 'built-astryx-usage',
          label: 'Built output uses Astryx',
          status: 'fail',
          message: `${target} holds no source or built files, so nothing was checked.`,
          fix: 'Pass the project folder, the build output folder, or the built HTML file.',
        }
      : scan.truncated || scan.unread > 0 || scan.missingLinks > 0
        ? {
            id: 'built-astryx-usage',
            label: 'Built output uses Astryx',
            status: 'warn',
            message: `Read ${read} and found no Astryx in them, but ${[scan.truncated ? `the rest past the first ${fileLimit} files` : null, scan.unread > 0 ? `${plural(scan.unread, 'source file')} over ${BUILT_FILE_MAX_MB} MB, unreadable or unparsed` : null, scan.missingLinks > 0 ? `${plural(scan.missingLinks, 'file')} the page links but that are not there` : null].filter(Boolean).join(' and ')} went unread, so this does not show whether the output uses Astryx.`,
            fix: `Run \`${formatCliCommand('doctor --built <folder>', cwd)}\` on the folder that holds the page itself, or on its build output.`,
          }
        : {
            id: 'built-astryx-usage',
            label: 'Built output uses Astryx',
            status: 'fail',
            message: `Read ${read}: no value import from an Astryx package (a type-only import is erased from the build), no Astryx component, and no Astryx styles, so this output does not use Astryx.`,
            fix: `Rebuild the page from an Astryx template: run \`${formatCliCommand('build "<what the page is>"', cwd)}\`, scaffold the template it names, and fill it with Astryx components. Do not deliver this output.`,
          };
  const unreadNames =
    scan.unreadFiles.slice(0, SHOWN).join(', ') +
    (scan.unreadFiles.length > SHOWN
      ? ` and ${scan.unreadFiles.length - SHOWN} more`
      : '');
  const unreadNote =
    scan.unread > 0
      ? ` ${plural(scan.unread, 'source file')} went unread (over ${BUILT_FILE_MAX_MB} MB, unreadable or not parsed), so ${scan.unread === 1 ? 'it was' : 'they were'} not inspected: ${unreadNames}.`
      : '';
  /** @type {import('./doctor.type.mjs').DoctorCheck} */
  let purity;
  if (scan.jsxFiles === 0) {
    purity = {
      id: 'built-astryx-purity',
      label: 'Source uses Astryx well',
      status: 'info',
      message: `Not inspected: ${plural(scan.sourceFiles, 'source file')} under ${target} and no JSX read among them, so components, icons and styles were not checked. A bundle or other build output is not source.${unreadNote}`,
      fix: `Run \`${formatCliCommand('doctor --built <project folder>', cwd)}\` on the folder that holds the page's source.`,
    };
  } else if (
    scan.findings.length === 0 &&
    (scan.truncated || scan.unread > 0)
  ) {
    purity = {
      id: 'built-astryx-purity',
      label: 'Source uses Astryx well',
      status: 'info',
      message: `Not fully inspected: ${plural(scan.jsxFiles, 'source file')} with JSX had no finding${scan.truncated ? `, but only the first ${fileLimit} files were read` : ''}.${unreadNote}`,
      fix: `Run \`${formatCliCommand('doctor --built <folder>', cwd)}\` on the folder that holds the page's own source.`,
    };
  } else if (scan.findings.length === 0) {
    purity = {
      id: 'built-astryx-purity',
      label: 'Source uses Astryx well',
      status: 'pass',
      message: `${plural(scan.jsxFiles, 'source file')} with JSX: no raw element Astryx has a component for, no hand-drawn or library icon, and no custom styling.`,
    };
  } else {
    /** @type {Record<string, number>} */
    const byCategory = {};
    for (const finding of scan.findings) {
      byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    }
    const counts = Object.entries(byCategory)
      .map(([category, count]) => `${category} ${count}`)
      .join(', ');
    const shown = scan.findings
      .slice(0, SHOWN)
      .map(finding => `${finding.file}:${finding.line} ${finding.message}`)
      .join('; ');
    const more =
      scan.findings.length > SHOWN
        ? `; and ${scan.findings.length - SHOWN} more`
        : '';
    purity = {
      id: 'built-astryx-purity',
      label: 'Source uses Astryx well',
      status: 'warn',
      message: `${plural(scan.findings.length, 'finding')} (${counts}): ${shown}${more}.${unreadNote}${scan.truncated ? ` Only the first ${fileLimit} files were read.` : ''}`,
      fix: `Replace each with the Astryx component, icon surface, prop or token it names; \`${formatCliCommand('docs is-my-code-good', cwd)}\` has the full rubric. Keep a raw element only where its native meaning is needed.`,
    };
  }
  return used
    ? [usage, coreStylesCheck(scan, target, cwd, sourceBuild), purity]
    : [usage, purity];
}
