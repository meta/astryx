// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The in-app theme preview behind `astryx experimental theme preview`:
 * where the route lives, its data file, the pages it shows, and the starter
 * app `preview app` writes. Only files the preview wrote are replaced or
 * deleted, only inside its folder, and every check runs before the first
 * write.
 *
 * @position api/theme-edit — imported only by _adapter.mjs
 */

import {parse as parseModule} from '@babel/parser';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../foundation/fs/path-safety.mjs';
import {baseResolved, installLine, openProject} from './_project.mjs';
import {P, wordTable} from './_tables.mjs';
import {
  buildTheme,
  editedThemes,
  fontPackages,
  loadTheme,
  modesOf,
  nearest,
  refuse,
  shown,
  staleBuild,
  themeFiles,
  usableNewName,
  windowsReserved,
} from './_settings.mjs';
import {
  baseFontsCss,
  colorsPageSource,
  componentsPageSource,
  overviewPageSource,
  previewRouteSource,
  themeImports,
} from './_preview.mjs';
import {
  isEditorTemp,
  PALETTE_STAND_IN,
  paletteFiles,
  paletteMapping,
  tempFor,
  writeWhole,
  refuseIfLockLost,
} from './_palette.mjs';
import {build} from '../build/build.mjs';
import {search} from '../search/search.mjs';
import {template} from '../template/template.mjs';
import {
  analyzeTemplateNeeds,
  extractImportedPackages,
} from '../../foundation/discovery/template-needs.mjs';
import {detectStylingSystem} from '../../foundation/agent-docs/agent-docs.mjs';
import {requireProject, context} from './_context.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {sha256} from '../../foundation/render/source-block.mjs';
import {findNodeModulesPackage} from '../../foundation/fs/paths.mjs';

const E = ERROR_CODES;

/** The preview's data file: the pages it shows and the files it wrote. */
const PREVIEW_DATA = 'theme-preview.json';
const PREVIEW = 'astryx experimental theme preview';
const EDITOR = 'astryx experimental theme editor';
/**
 * The folder of the preview pages, beside the route. Next never routes a
 * folder whose name starts with `_`; a `pages/` folder at the project root or
 * in `src/` is Next's Pages Router.
 */
const PAGES_DIR = '_pages';
/** Where older releases put the pages; a preview found there is moved. */
const LEGACY_PAGES_DIR = 'pages';
const PAGE_ID = /^[a-z0-9][a-z0-9-]*$/;
/** At most this many words of a description go to the ranking. */
const MAX_WORDS = 40;

/**
 * @typedef {{id: string, label: string, file: string}} PreviewPage
 * @typedef {{version: 1, theme: string | null, pages: PreviewPage[], files: string[], hashes?: Record<string, string>, parents?: number}} PreviewData
 * `parents`: how many folders over the preview folder its first add made,
 * which remove takes away again when they are empty.
 *   `hashes`: a short hash of each file as the preview wrote it, so a file
 *   changed by hand is never replaced or deleted
 * @typedef {(path: string | null) => string} Retry the command again, with
 *   this --path (null: none)
 */

/** A project-relative folder for messages: `.` for the project root. */
const shownDir = (/** @type {string} */ cwd, /** @type {string} */ dir) =>
  shown(cwd, dir) || '.';

/**
 * Refuse a folder name that this platform would take literally in a way the
 * caller did not mean: Windows separators or a drive letter on POSIX, a `~`
 * the shell did not expand, white space at either end, or a name too long
 * for the file system.
 * @param {string} where
 * @param {string} what the flag or argument, for the message
 * @param {Retry} retry
 */
function checkFolderName(where, what, retry) {
  const posix = path.sep === '/';
  if (posix && (where.includes('\\') || /^[A-Za-z]:/.test(where))) {
    const fixed = where.replace(/\\/g, '/');
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${what} ${where} uses Windows path syntax; folders here are separated by "/".`,
      {run: [retry(/^[A-Za-z]:/.test(where) ? null : fixed)]},
    );
  }
  if (where.startsWith('~'))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${what} ${where} starts with "~", which is not your home folder here; name the folder from the project.`,
      {run: [retry(null)]},
    );
  if (where !== where.trim())
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${what} "${where}" starts or ends with white space.`,
      {run: [retry(where.trim() || null)]},
    );
  if (where.split(/[\\/]/).some(seg => Buffer.byteLength(seg) > 255))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${what} has a folder name longer than 255 bytes, which the file system does not allow.`,
      {run: [retry(null)]},
    );
}

/**
 * Whether a stylesheet comes in through the files the root layout imports,
 * followed through relative and `@/` imports (a root `styles/globals.css`,
 * as create-next-app writes it), a few levels deep.
 * @param {string} cwd
 * @param {string} app the routes folder
 * @param {RegExp} sheet
 */
function layoutImportsSheet(cwd, app, sheet, dir = app) {
  // Every layout over the preview: the routes folder's, and one in a route
  // group or [param] folder on the way.
  /** @type {string[]} */
  const starts = [];
  for (let at = dir; ; at = path.dirname(at)) {
    for (const x of ['tsx', 'ts', 'jsx', 'js'])
      if (fs.existsSync(path.join(at, `layout.${x}`)))
        starts.push(path.join(at, `layout.${x}`));
    if (at === app || !at.startsWith(app + path.sep)) break;
  }
  if (!starts.length) return false;
  const aliases = tsconfigAliases(cwd);
  const seen = new Set();
  /** @param {string} file @param {number} depth @returns {boolean} */
  const reads = (file, depth) => {
    if (seen.has(file) || depth > 4) return false;
    seen.add(file);
    /** @type {string} */
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return false;
    }
    if (sheet.test(text)) return true;
    for (const m of text.matchAll(
      /(?:import|@import)\s*(?:[^'"]*from\s*)?(?:url\()?['"]([^'"]+)['"]/g,
    )) {
      const spec = m[1];
      // An alias the tsconfig sets; else `@/` is the src folder or the
      // project root.
      const alias = aliases.find(a => spec.startsWith(a.prefix));
      const bases = alias
        ? alias.to.map(t => path.join(t, spec.slice(alias.prefix.length)))
        : spec.startsWith('@/')
          ? [
              path.join(cwd, 'src', spec.slice(2)),
              path.join(cwd, spec.slice(2)),
            ]
          : spec.startsWith('.')
            ? [path.resolve(path.dirname(file), spec)]
            : [];
      const hit = bases
        .flatMap(b =>
          ['', '.css', '.scss', '.ts', '.tsx', '.js', '.jsx'].map(x => b + x),
        )
        .find(f => fs.existsSync(f) && fs.statSync(f).isFile());
      if (hit && reads(hit, depth + 1)) return true;
    }
    return false;
  };
  return starts.some(start => reads(start, 0));
}

/**
 * The import aliases the app's tsconfig `paths` set (`~/*`, `#app/*`), each
 * with the folders it stands for.
 * @param {string} cwd
 * @returns {Array<{prefix: string, to: string[]}>}
 */
function tsconfigAliases(cwd) {
  const o = appCompilerOptions(cwd);
  const paths = o && typeof o.paths === 'object' && o.paths ? o.paths : {};
  const baseUrl = path.resolve(
    cwd,
    typeof o?.baseUrl === 'string' ? o.baseUrl : '.',
  );
  return Object.entries(/** @type {Record<string, unknown>} */ (paths)).flatMap(
    ([key, targets]) =>
      key.endsWith('/*') && Array.isArray(targets)
        ? [
            {
              prefix: key.slice(0, -1),
              to: targets
                .filter(t => typeof t === 'string' && t.endsWith('/*'))
                .map(t => path.resolve(baseUrl, String(t).slice(0, -2))),
            },
          ]
        : [],
  );
}

/**
 * A note when the app never imports Core's stylesheet, or null: without
 * it, components render unstyled, and some show nothing. Read from the
 * files of the routes folder and src/ (best effort).
 * @param {string} cwd
 * @param {{dir: string, app: string | null}} at
 * @returns {string | null}
 */
function coreStylesheetMissing(cwd, at) {
  if (!at.app) return null;
  const SHEET = /@astryxdesign\/core\/astryx\.css/;
  let seen = 0;
  /** @param {string} folder @returns {boolean} */
  const imports = folder => {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(folder, {withFileTypes: true});
    } catch {
      return false;
    }
    for (const e of entries) {
      const full = path.join(folder, e.name);
      if (e.isDirectory()) {
        if (
          e.name === 'node_modules' ||
          e.name.startsWith('.') ||
          full === at.dir
        )
          continue;
        if (imports(full)) return true;
      } else if (
        /\.(tsx|ts|jsx|js|mjs|css|scss)$/.test(e.name) &&
        ++seen < 2000
      )
        try {
          if (SHEET.test(fs.readFileSync(full, 'utf8'))) return true;
        } catch {
          // Unreadable: skip it.
        }
    }
    return false;
  };
  const src = path.join(cwd, 'src');
  if (
    imports(at.app) ||
    (at.app.startsWith(src + path.sep) ? false : imports(src)) ||
    layoutImportsSheet(cwd, at.app, SHEET, at.dir)
  )
    return null;
  const layout = ['tsx', 'ts', 'jsx', 'js']
    .map(x => path.join(at.app ?? '', `layout.${x}`))
    .find(f => fs.existsSync(f));
  return `the app does not import Core's stylesheet, so the preview's components render unstyled and some show nothing; add import '@astryxdesign/core/astryx.css'; to ${layout ? shown(cwd, layout) : "the app's root layout"}`;
}

/**
 * What next.config sets, read from its syntax tree: `pageExtensions`,
 * `basePath` and `distDir`, each a literal value, `undefined` when it is
 * not set, or `null` when it is set in a way only running the config tells
 * (a spread, a function config, a value from code). Comments say nothing.
 * @param {string} cwd
 * @returns {{file: string | null, pageExtensions: string[] | null | undefined, basePath: string | null | undefined, distDir: string | null | undefined}}
 */
function readNextConfig(cwd) {
  const none = {
    file: null,
    pageExtensions: undefined,
    basePath: undefined,
    distDir: undefined,
  };
  // The order Next loads them in; it refuses next.config.cjs.
  for (const name of [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.mts',
  ]) {
    /** @type {string} */
    let text;
    try {
      text = fs.readFileSync(path.join(cwd, name), 'utf8');
    } catch {
      continue;
    }
    const unknown = {
      file: name,
      pageExtensions: null,
      basePath: null,
      distDir: null,
    };
    /** @type {any} */
    let file;
    try {
      file = parseModule(text, {
        sourceType: 'unambiguous',
        plugins: ['typescript'],
        errorRecovery: true,
      });
    } catch {
      return unknown;
    }
    const body = /** @type {any[]} */ (file.program.body);
    /** Top-level constants, by name. @type {Map<string, any>} */
    const consts = new Map();
    for (const st of body)
      if (st.type === 'VariableDeclaration' && st.kind === 'const')
        for (const d of st.declarations)
          if (d.id?.type === 'Identifier' && d.init)
            consts.set(d.id.name, d.init);
    /** @param {any} n @param {number} depth @returns {any} */
    const resolve = (n, depth = 0) => {
      while (
        n &&
        /^TS(As|Satisfies|NonNull)Expression$|^ParenthesizedExpression$/.test(
          n.type,
        )
      )
        n = n.expression;
      if (n?.type === 'Identifier' && depth < 4 && consts.has(n.name))
        return resolve(consts.get(n.name), depth + 1);
      return n;
    };
    /** The config object: exported, or passed to a wrapper such as withX(config). @param {any} n @returns {any} */
    const configOf = n => {
      n = resolve(n);
      if (n?.type === 'ObjectExpression') return n;
      if (n?.type === 'CallExpression')
        for (const a of n.arguments) {
          const o = configOf(a);
          if (o) return o;
        }
      return null;
    };
    /** @type {any} */
    let exported = null;
    for (const st of body) {
      if (st.type === 'ExportDefaultDeclaration') exported = st.declaration;
      // export {config as default}
      if (st.type === 'ExportNamedDeclaration' && !st.source)
        for (const sp of st.specifiers ?? [])
          if ((sp.exported?.name ?? sp.exported?.value) === 'default')
            exported = sp.local;
      if (
        st.type === 'ExpressionStatement' &&
        st.expression.type === 'AssignmentExpression' &&
        st.expression.left.type === 'MemberExpression' &&
        st.expression.left.object?.name === 'module' &&
        st.expression.left.property?.name === 'exports'
      )
        exported = st.expression.right;
    }
    const config = exported && configOf(exported);
    if (!config) return exported ? unknown : none;
    const wrapped = resolve(exported)?.type === 'CallExpression';
    // Changes to the config after it is made: `config.key = value` sets a
    // key (the last one counts), and anything else (Object.assign, a
    // computed key) makes every key unknown.
    const names = new Set(
      [...consts]
        .filter(([, init]) => resolve(init) === config)
        .map(([n]) => n),
    );
    /** @type {Map<string, any>} */
    const later = new Map();
    let changed = false;
    // Only a statement at the top of the file surely runs: a key set inside
    // an `if` or a function, or deleted, is known only by running it.
    const UNSURE = Symbol('unsure');
    const topLevel = new Set(
      body
        .filter(st => st.type === 'ExpressionStatement')
        .map(st => st.expression),
    );
    /** @param {any} n */
    const visit = n => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(visit);
      if (
        n.type === 'AssignmentExpression' &&
        n.left?.type === 'MemberExpression' &&
        names.has(n.left.object?.name)
      ) {
        if (n.left.computed) changed = true;
        else
          later.set(
            n.left.property.name,
            topLevel.has(n) && n.operator === '=' ? n.right : UNSURE,
          );
      }
      if (
        n.type === 'UnaryExpression' &&
        n.operator === 'delete' &&
        n.argument?.type === 'MemberExpression' &&
        names.has(n.argument.object?.name)
      ) {
        if (n.argument.computed) changed = true;
        else later.set(n.argument.property.name, UNSURE);
      }
      if (
        n.type === 'CallExpression' &&
        n.arguments?.some(
          (/** @type {any} */ a) =>
            a.type === 'Identifier' && names.has(a.name),
        ) &&
        n.callee?.type === 'MemberExpression' &&
        n.callee.object?.name === 'Object'
      )
        changed = true;
      for (const [k, v] of Object.entries(n))
        if (k !== 'loc' && k !== 'start' && k !== 'end') visit(v);
    };
    visit(body);
    if (changed) return unknown;
    // The config's keys in order, with a spread of a constant object read
    // in place; a spread of anything else may set any key (`null`).
    /** @type {Array<{key: string, value: any} | null>} */
    const entries = [];
    /** @param {any} obj @param {number} depth */
    const flatten = (obj, depth) => {
      for (const x of obj.properties) {
        if (x.type === 'SpreadElement') {
          const inner = resolve(x.argument);
          if (inner?.type === 'ObjectExpression' && depth < 4)
            flatten(inner, depth + 1);
          else entries.push(null);
        } else if (
          (x.type === 'ObjectProperty' || x.type === 'ObjectMethod') &&
          !x.computed
        )
          entries.push({key: x.key.name ?? x.key.value, value: x.value});
        else entries.push(null);
      }
    };
    flatten(config, 0);
    /** The entry that sets a key last: a later assignment, else the last key; null when an unreadable spread may; undefined when nothing does. @param {string} key */
    const prop = key => {
      if (later.has(key))
        return later.get(key) === UNSURE ? null : {key, value: later.get(key)};
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e === null) return null;
        if (e.key === key) return e;
      }
      return undefined;
    };
    /** @param {any} n @returns {string | null} */
    const str = n => {
      n = resolve(n);
      if (n?.type === 'StringLiteral') return n.value;
      if (n?.type === 'TemplateLiteral' && !n.expressions.length)
        return n.quasis[0].value.cooked;
      return null;
    };
    /** @param {string} key @param {(n: any) => any} read */
    const value = (key, read) => {
      const p = prop(key);
      return p ? read(p.value) : p;
    };
    return {
      file: name,
      pageExtensions: value('pageExtensions', n => {
        n = resolve(n);
        if (n?.type !== 'ArrayExpression') return null;
        const out = n.elements.map((/** @type {any} */ e) => str(e));
        return out.every((/** @type {any} */ e) => e != null) ? out : null;
      }),
      // A wrapper such as withX(config) may add a basePath of its own.
      basePath: wrapped
        ? null
        : value('basePath', n => {
            const v = str(n);
            return v == null ? null : v.replace(/\/+$/, '');
          }),
      distDir: value('distDir', n => {
        const v = str(n);
        return v == null
          ? null
          : (v.replace(/^\.?\//, '').split('/')[0] ?? null);
      }),
    };
  }
  return none;
}

/**
 * The `basePath` next.config sets: '' when it sets none, null when only
 * running the config tells. Every URL of the app starts with it.
 * @param {string} cwd
 * @returns {string | null}
 */
function nextBasePath(cwd) {
  const v = readNextConfig(cwd).basePath;
  return v === undefined ? '' : v;
}

/**
 * Notes on next.config values the preview depends on that only running
 * the config tells: the page extensions (the route is page.tsx) and the
 * base path of its URL.
 * @param {string} cwd
 * @returns {string[]}
 */
function nextConfigNotes(cwd) {
  const c = readNextConfig(cwd);
  /** @type {string[]} */
  const notes = [];
  if (c.pageExtensions === null)
    notes.push(
      `${c.file} sets pageExtensions in a way only running it tells; the preview's route is page.tsx, so "tsx" must be in it`,
    );
  return notes;
}

/**
 * Why a folder is no place for files this command writes, or null: themes
 * live in themes/ (and a preview app's whole tree would ship with the
 * theme), packages in node_modules/, Next empties its build folder
 * (`.next/`, `out/` or the `distDir` next.config names) on every build,
 * and Next serves every file under a Pages Router folder (`pages/` or
 * `src/pages/`) as a page.
 * @param {string} cwd
 * @param {string} dir
 */
function reservedFolder(cwd, dir) {
  const segs = shown(cwd, dir).split('/').filter(Boolean);
  if (segs[0] === 'themes')
    return 'themes/ holds the themes, and everything in a theme folder is copied with the theme';
  if (segs.includes('node_modules'))
    return 'node_modules/ belongs to the package manager, which replaces it';
  if (segs[0] === 'public')
    return 'Next serves every file in public/ as it is, at the site root, so anyone could download it';
  const built = [
    ...new Set(['.next', 'out', readNextConfig(cwd).distDir]),
  ].find(d => d && segs[0] === d);
  if (built)
    return `${built}/ is where Next writes its build, and the next build empties it`;
  const odd = segs.find(seg => windowsReserved(seg) || /^\.+$/.test(seg));
  if (odd)
    return `${odd} is a name Windows does not allow for a folder, so the project could not be checked out there`;
  if (segs[0] === 'pages' || (segs[0] === 'src' && segs[1] === 'pages'))
    return 'Next serves every file under the Pages Router folder (pages/ or src/pages/) as a public page; this preview needs the App Router (app/ or src/app/)';
  return null;
}

/**
 * The app's tsconfig.json compiler options (comments and trailing commas
 * allowed), or null when there is none.
 * @param {string} cwd
 * @returns {Record<string, unknown> | null}
 */
function appCompilerOptions(cwd) {
  /** @type {string} */
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, 'tsconfig.json'), 'utf8');
  } catch {
    return null;
  }
  try {
    const json = text
      .replace(
        /("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        (m, str) => str ?? '',
      )
      .replace(/,(\s*[}\]])/g, '$1');
    const o = JSON.parse(json)?.compilerOptions;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/**
 * Notes on what the preview's TypeScript files need from the app: an app
 * with no TypeScript gets the install line (Next sets it up on the next
 * build otherwise), and an app whose tsconfig turns on
 * `noUncheckedIndexedAccess` is told which template pages were written as
 * their template ships them, which may not pass it.
 * @param {string} cwd
 * @param {string} dir
 * @param {string[]} added page ids added by this command
 * @returns {string[]}
 */
function typeScriptNotes(cwd, dir, added) {
  const options = appCompilerOptions(cwd);
  if (!options) {
    const hasTs = (() => {
      try {
        return Boolean(
          createRequire(path.join(cwd, 'package.json')).resolve('typescript'),
        );
      } catch {
        return false;
      }
    })();
    return hasTs
      ? []
      : [
          `the app has no TypeScript, and the preview's files are .tsx, so the next build sets it up; to do it now: ${installLine(cwd, ['typescript', '@types/react', '@types/node']).replace(/ (add|install) /, ' $1 -D ')}`,
        ];
  }
  const templates = added.filter(
    id => !['overview', 'components', COLORS_PAGE.id].includes(id),
  );
  if (options.noUncheckedIndexedAccess !== true || !templates.length) return [];
  const files = templates.map(id =>
    shown(cwd, path.join(dir, PAGES_DIR, `${id}.tsx`)),
  );
  return [
    `the app's tsconfig.json turns on noUncheckedIndexedAccess, and ${files.join(', ')} ${files.length > 1 ? 'are' : 'is'} written as the page template ships, which may not pass it; if the build stops there, fix the reported lines or remove the page with ${PREVIEW} remove ${templates[0]}`,
  ];
}

/**
 * Why a file cannot be read (its error code), or null when it can.
 * @param {string} file
 * @returns {string | null}
 */
function unreadable(file) {
  try {
    fs.closeSync(fs.openSync(file, 'r'));
    return null;
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    return code === 'ENOENT' ? null : (code ?? 'error');
  }
}

/**
 * Whether a folder beside `dir` has its name in another case.
 * @param {string} dir
 */
function twinBeside(dir) {
  const name = path.basename(dir);
  try {
    return fs
      .readdirSync(path.dirname(dir))
      .some(n => n !== name && n.toLowerCase() === name.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * A folder beside `dir`, or beside one of its parents, whose name differs
 * only in case, or null.
 * @param {string} dir
 * @returns {string | null}
 */
function sameCaseSibling(dir) {
  for (let at = dir; path.dirname(at) !== at; at = path.dirname(at)) {
    const parent = path.dirname(at);
    const name = path.basename(at);
    /** @type {string[]} */
    let names;
    try {
      names = fs.readdirSync(parent);
    } catch {
      continue;
    }
    const twin = names.find(
      n => n !== name && n.toLowerCase() === name.toLowerCase(),
    );
    if (twin) return path.join(parent, twin);
    if (fs.existsSync(path.join(parent, 'package.json'))) break;
  }
  return null;
}

/** An intercepting route folder: `(.)x`, `(..)x`, `(..)(..)x`, `(...)x`. */
const INTERCEPT = /^\((\.{1,3})\)/;

/**
 * Why Next does not serve a folder inside the routes folder at its own
 * URL, or null: a `_private` folder is never routed, an `@slot` folder is a
 * parallel route slot, and a `[param]` folder is a dynamic segment.
 * @param {string} app the routes folder
 * @param {string} dir
 */
function unroutedSegment(app, dir) {
  const seg = path
    .relative(app, dir)
    .split(path.sep)
    .find(x => /^[_@[]/.test(x) || INTERCEPT.test(x));
  if (seg && INTERCEPT.test(seg))
    return `Next reads the folder ${seg} as an intercepting route ((.), (..) and (...) folders show another route's page), not a URL of its own, and a page there breaks the app`;
  return seg
    ? `Next does not serve the folder ${seg} at a URL of its own (_private folders are never routed, @slot and [param] folders are not plain URL segments)`
    : null;
}

/**
 * The URL a folder of the routes folder is served at, with route groups
 * dropped, as path segments.
 * @param {string} app
 * @param {string} dir
 */
const urlSegments = (app, dir) =>
  path
    .relative(app, dir)
    .split(path.sep)
    .filter(seg => seg && !/^\(.*\)$/.test(seg));

/** An optional catch-all route folder, `[[...slug]]`: it also serves its parent folder's URL (a required `[...slug]` does not). */
const CATCH_ALL = /^\[\[\.\.\.[^\]]+\]\]$/;

/** A file Next serves a URL from: a page or a route handler. */
const ROUTE_FILE = /^(page\.(tsx|ts|jsx|js|mdx)|route\.(tsx|ts|jsx|js))$/;

/**
 * A page or route handler of the app that Next serves at the same URL as
 * `dir`, or null: beside the preview, Next refuses to build (a route and a
 * page), or the preview takes that URL from it.
 * @param {string} cwd
 * @param {string} app the routes folder
 * @param {string} dir
 */
function sameUrlPage(cwd, app, dir) {
  const url = urlSegments(app, dir).join('/');
  /** @param {string} folder @returns {string | null} */
  const walk = folder => {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(folder, {withFileTypes: true});
    } catch {
      return null;
    }
    for (const e of entries) {
      const full = path.join(folder, e.name);
      if (e.isDirectory()) {
        if (/^[_@]/.test(e.name) || e.name === 'node_modules' || full === dir)
          continue;
        const hit = walk(full);
        if (hit) return hit;
      } else if (ROUTE_FILE.test(e.name) && servesUrl(folder)) return full;
    }
    return null;
  };
  /** A folder served at the URL, or at the URLs under it through a catch-all. @param {string} folder */
  const servesUrl = folder => {
    const segs = urlSegments(app, folder);
    return (
      segs.join('/') === url ||
      (CATCH_ALL.test(segs.at(-1) ?? '') && segs.slice(0, -1).join('/') === url)
    );
  };
  // The preview's own folder: a route handler, a page other than the
  // page.tsx the preview writes, or a catch-all route in it.
  try {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (!e.isDirectory()) {
        if (ROUTE_FILE.test(e.name) && e.name !== 'page.tsx')
          return path.join(dir, e.name);
      } else if (CATCH_ALL.test(e.name))
        for (const name of fs.readdirSync(path.join(dir, e.name)))
          if (ROUTE_FILE.test(name)) return path.join(dir, e.name, name);
    }
  } catch {
    // No folder yet.
  }
  const inApp = walk(app);
  if (inApp) return inApp;
  for (const pages of [path.join(cwd, 'pages'), path.join(cwd, 'src', 'pages')])
    for (const ext of ['tsx', 'ts', 'jsx', 'js']) {
      for (const f of [`${url}.${ext}`, `${url}/index.${ext}`]) {
        const full = path.join(pages, f);
        if (url && fs.existsSync(full)) return full;
      }
    }
  return null;
}

/**
 * The folders that hold a root layout when the routes folder has none of
 * its own: each route group with a layout (`(shop)/`, `(marketing)/`), or
 * a `[locale]/` in an app with the locale in every URL. Empty when the
 * routes folder has its own root layout.
 * @param {string} app
 * @returns {string[]}
 */
function nestedRootLayouts(app) {
  const LAYOUT = /^layout\.(tsx|ts|jsx|js)$/;
  if (fs.readdirSync(app).some(f => LAYOUT.test(f))) return [];
  /** @type {string[]} */
  const out = [];
  /** A folder with a layout counts; a route group without one is looked into. @param {string} dir @param {boolean} top */
  const look = (dir, top) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (!e.isDirectory()) continue;
      const sub = path.join(dir, e.name);
      const group = /^\(.+\)$/.test(e.name);
      if (!top && !group) continue;
      if (fs.readdirSync(sub).some(f => LAYOUT.test(f))) out.push(sub);
      else if (group) look(sub, false);
    }
  };
  look(app, true);
  return out.sort();
}

/**
 * Refuse a folder where the preview would not be served as reported, or
 * would break the app: one that holds the app itself, a reserved or
 * unrouted folder, src/app/ while app/ is what Next serves, an app whose
 * next.config names other page extensions, a folder outside the folder of
 * the app's root layout, and a URL another page already has.
 * @param {string} cwd
 * @param {string} dir
 * @param {string} where how the folder was given, for messages
 * @param {Retry} retry
 */
function checkPlacement(cwd, dir, where, retry) {
  const served = [path.join(cwd, 'app'), path.join(cwd, 'src', 'app')].find(
    r => fs.existsSync(r) && fs.statSync(r).isDirectory(),
  );
  const fallback = retry(
    served
      ? shown(cwd, path.join(served, 'theme-preview'))
      : 'app/theme-preview',
  );
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory())
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} is a file; the preview goes in a folder of its own.`,
      {run: [retry(null)]},
    );
  if (holdsApp(cwd, dir)) {
    const record = path.join(dir, PREVIEW_DATA);
    /** @type {string | null} */
    let damaged = null;
    if (fs.existsSync(record))
      try {
        readPreview(cwd, dir);
      } catch {
        damaged = shown(cwd, record);
      }
    refuse(
      E.ERR_INVALID_ARGUMENT,
      damaged
        ? `${where} holds the app itself, and an older, damaged ${PREVIEW_DATA}.`
        : fs.existsSync(record)
          ? `${where} holds an older theme preview, in a folder that holds the app itself; move its files into a folder of their own, then add the preview there.`
          : `${where} is no place for the preview: the folder holds the app itself (its root, src/, a routes folder or a package.json), and the app does not serve a preview there.`,
      damaged
        ? {
            fix: `give ${damaged} another name (for example ${PREVIEW_DATA}.broken), then run ${PREVIEW} add`,
          }
        : {
            run: fs.existsSync(record)
              ? [
                  `${PREVIEW} remove --path ${quoteCommandArgument(shownDir(cwd, dir))}`,
                ]
              : [fallback],
          },
    );
  }
  const app = [path.join(cwd, 'app'), path.join(cwd, 'src', 'app')].find(r =>
    dir.startsWith(r + path.sep),
  );
  const rootLayouts = served ? nestedRootLayouts(served) : [];
  // The root layout above the folder, when the app has several (one per
  // route group) or one in [locale]/.
  const rootLayout =
    rootLayouts.find(r => dir.startsWith(r + path.sep)) ?? null;
  // A [param] folder that holds the root layout (an app with the locale in
  // every URL) is where its pages go.
  const unrouted =
    app &&
    unroutedSegment(
      app,
      rootLayout && dir.startsWith(rootLayout + path.sep)
        ? path.join(app, path.relative(rootLayout, dir))
        : dir,
    );
  const why = reservedFolder(cwd, dir) ?? unrouted;
  if (why)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} is no place for the preview: ${why}.`,
      {run: [fallback]},
    );
  // A folder name that is not a plain URL segment (a space, an accent,
  // ?, #, %) is not served at the URL it seems to have. The characters a
  // URL path takes as they are (RFC 3986 unreserved and sub-delims, @, ~)
  // are served.
  const PLAIN = /^[A-Za-z0-9._~!$&'()+,;=@-]+$/;
  const segs = app ? path.relative(app, dir).split(path.sep) : [];
  const odd = segs.filter(
    seg => seg && !/^\(.+\)$|^\[.+\]$/.test(seg) && !PLAIN.test(seg),
  );
  if (app && odd.length) {
    const slug = (/** @type {string} */ seg) =>
      seg
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'theme-preview';
    // Every odd segment slugged, then the first free folder from it.
    const base = path.join(
      app,
      ...segs.map(seg => (odd.includes(seg) ? slug(seg) : seg)),
    );
    let fixed = base;
    for (
      let n = 2;
      fs.existsSync(fixed) || twinBeside(fixed) || sameUrlPage(cwd, app, fixed);
      n++
    )
      fixed = `${base}-${n}`;
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} is no place for the preview: Next does not serve the folder "${odd[0]}" at the URL its name seems to give (a space, a letter outside A-Z, %, # or ? are no plain URL segment).`,
      {run: [retry(shown(cwd, fixed))]},
    );
  }
  // A folder whose name differs from a folder beside it only in case is the
  // same folder on macOS and Windows: one of them is lost in a checkout.
  const twin = sameCaseSibling(dir);
  if (twin) {
    // A twin of a folder on the way: the same path through the folder that
    // is there. A twin of the folder itself: the first free name beside it.
    const base = path.dirname(twin);
    const rel = path.relative(base, dir).split(path.sep);
    // Both spellings are folders already: no path through either is free,
    // so the way on is a new folder beside them.
    const bothThere = rel.length > 1 && fs.existsSync(path.join(base, rel[0]));
    let free = path.join(twin, ...rel.slice(1));
    if (rel.length === 1 || bothThere) {
      const start = rel.length === 1 ? dir : path.join(base, 'theme-preview');
      free = start;
      for (let n = 2; fs.existsSync(free) || twinBeside(free); n++)
        free = `${start}-${n}`;
    }
    const existing = fs.existsSync(path.join(dir, PREVIEW_DATA));
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} is no place for the preview: ${shownDir(cwd, twin)}/ differs from it only in case, and on macOS and Windows they are one folder, so the project could not be checked out there.${existing ? ` The preview already there can still be removed.` : ''}`,
      {
        run: [
          retry(shown(cwd, free)),
          ...(existing
            ? [
                `${PREVIEW} remove --path ${quoteCommandArgument(shownDir(cwd, dir))}`,
              ]
            : []),
        ],
      },
    );
  }
  if (!app) return;
  if (served && app !== served)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} is in ${shown(cwd, app)}/, and Next serves ${shown(cwd, served)}/ instead when both are there.`,
      {
        run: fs.existsSync(path.join(dir, PREVIEW_DATA))
          ? [
              `${PREVIEW} remove --path ${quoteCommandArgument(shownDir(cwd, dir))}`,
            ]
          : [fallback],
      },
    );
  const exts = readNextConfig(cwd).pageExtensions;
  if (exts && !exts.includes('tsx')) {
    let free = 'theme-app';
    for (let n = 2; fs.existsSync(path.join(cwd, free)); n++)
      free = `theme-app-${n}`;
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `next.config sets pageExtensions to ${exts.join(', ')}, so Next does not serve page.tsx, the route file the preview writes.`,
      {
        fix: 'add "tsx" to pageExtensions to use the preview in this app',
        run: [
          `${retry(shown(cwd, dir))}  # once "tsx" is in pageExtensions`,
          `${PREVIEW} app ${free}  # or a new app of its own, with the preview`,
        ],
      },
    );
  }
  if (
    (app && !served) ||
    (served &&
      !rootLayouts.length &&
      !fs.readdirSync(served).some(f => /^layout\.(tsx|ts|jsx|js)$/.test(f)))
  ) {
    let free = 'theme-app';
    for (let n = 2; fs.existsSync(path.join(cwd, free)); n++)
      free = `theme-app-${n}`;
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${shown(cwd, served ?? app)}/ has no root layout (no layout.tsx in it or in a route group)${served ? '' : ' and is not there yet'}, so Next cannot build a page in ${where}.`,
      {
        fix: `add a root layout to ${shown(cwd, served ?? app)}/ to use the preview in this app`,
        run: [
          `${PREVIEW} app ${free}  # a new app with its own root layout and the preview`,
        ],
      },
    );
  }
  if (rootLayouts.length && !rootLayout)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} has no root layout above it: the app's root ${rootLayouts.length > 1 ? 'layouts are' : 'layout is'} in ${rootLayouts.map(r => `${shown(cwd, r)}/`).join(', ')}, so a page there would have no html, global CSS or providers.`,
      {
        run: rootLayouts.map(r =>
          retry(shown(cwd, path.join(r, 'theme-preview'))),
        ),
      },
    );
  const clash = sameUrlPage(cwd, app, dir);
  if (clash) {
    // The first free name from the base name, whose URL no other page
    // serves either.
    const base = dir.replace(/-\d+$/, '');
    let free = `${base}-2`;
    for (let n = 3; fs.existsSync(free) || sameUrlPage(cwd, app, free); n++)
      free = `${base}-${n}`;
    refuse(
      E.ERR_FILE_EXISTS,
      `${shown(cwd, clash)} already serves /${urlSegments(app, dir).join('/')} or the URLs under it, so a preview in ${where} would stop the app from building, or take that URL from it.`,
      {run: [retry(shown(cwd, free))]},
    );
  }
}

/**
 * Where the preview route lives. `--path` names it (inside the project);
 * else an existing preview in the app's routes folder; else the one preview
 * a theme recorded elsewhere (`retry` given); else the routes folder Next
 * serves (`app/`, else `src/app/`).
 * @param {string} cwd
 * @param {string | undefined} where
 * @param {{optional?: boolean, write?: boolean, retry?: Retry}} [opts]
 *   `optional`: null instead of a refusal when there is no routes folder;
 *   `write`: the folder is checked as a place to write; `retry`: the
 *   command again with another --path, for refusals
 * @returns {{dir: string, app: string | null}} `app`: the routes folder, when the route is in one
 */
function previewDir(cwd, where, opts = {}) {
  const retry =
    opts.retry ??
    (p =>
      `${PREVIEW} list${p == null ? '' : ` --path ${quoteCommandArgument(p)}`}`);
  const routes = ['app', path.join('src', 'app')]
    .map(r => path.join(cwd, r))
    .filter(r => fs.existsSync(r) && fs.statSync(r).isDirectory());
  const appOf = (/** @type {string} */ dir) =>
    routes.find(r => dir.startsWith(r + path.sep)) ?? null;
  if (where != null) {
    checkFolderName(where, '--path', retry);
    /** @type {string} */
    let dir;
    try {
      dir = assertWithin(path.resolve(cwd, where), cwd, {
        allowAbsolute: true,
        label: '--path',
      });
    } catch (e) {
      if (e instanceof PathSafetyError)
        refuse(
          E.ERR_PATH_TRAVERSAL,
          `--path ${where} is outside the project; put the preview inside the folder you run the command from.`,
          {run: [retry(null)]},
        );
      throw e;
    }
    // A file on the way, or a path longer than the system takes, would
    // fail every command on it with a system error.
    const blocker = (() => {
      for (
        let at = path.dirname(dir);
        at.startsWith(cwd + path.sep);
        at = path.dirname(at)
      )
        try {
          if (!fs.statSync(at).isDirectory()) return at;
        } catch {
          // Not there yet: made with the folder.
        }
      return null;
    })();
    if (blocker)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `--path ${where} goes through ${shown(cwd, blocker)}, which is a file, so no folder can be made there.`,
        {
          run: [
            retry(
              shown(cwd, path.join(path.dirname(blocker), 'theme-preview')),
            ),
          ],
        },
      );
    // A folder name is at most 255 bytes on every common file system; the
    // whole path, with the preview's own files below it, is kept under
    // 3,500 bytes.
    const longName = path
      .relative(cwd, dir)
      .split(path.sep)
      .find(seg => Buffer.byteLength(seg) > 255);
    if (longName)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `--path ${where} has a folder name longer than 255 bytes, the most a file system takes for one name.`,
        {run: [retry(null)]},
      );
    if (Buffer.byteLength(dir) > 3500)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `--path ${where} is longer than 3,500 bytes, with the preview's files in it.`,
        {run: [retry(null)]},
      );
    if (opts.write) checkPlacement(cwd, dir, `--path ${where}`, retry);
    return {dir, app: appOf(dir)};
  }
  const candidates = routes.map(r => path.join(r, 'theme-preview'));
  const known = candidates.find(d => fs.existsSync(path.join(d, PREVIEW_DATA)));
  if (!known && opts.retry) {
    // A preview added with --path is recorded with its theme, so a later
    // command finds it without the flag instead of starting a second one.
    const recorded = [
      ...new Set(editedThemes(cwd).flatMap(t => recordedPreviews(cwd, t))),
    ].filter(d => fs.existsSync(path.join(d, PREVIEW_DATA)));
    if (recorded.length === 1) {
      inProjectOrRefuse(cwd, recorded[0], retry);
      if (opts.write)
        checkPlacement(cwd, recorded[0], shownDir(cwd, recorded[0]), retry);
      return {dir: recorded[0], app: appOf(recorded[0])};
    }
    if (recorded.length > 1)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `There are ${recorded.length} theme previews here (${recorded.map(d => `${shownDir(cwd, d)}/`).join(', ')}) and none in the default place; name one with --path.`,
        {run: recorded.map(d => retry(shownDir(cwd, d)))},
      );
    // An older release could put a preview at the project root or in src/,
    // where its pages/ folder is the Pages Router: every page is public.
    const older = [cwd, path.join(cwd, 'src')].find(d =>
      fs.existsSync(path.join(d, PREVIEW_DATA)),
    );
    if (older) {
      if (opts.write) checkPlacement(cwd, older, shownDir(cwd, older), retry);
      return {dir: older, app: null};
    }
  }
  // The routes folder Next serves: app/ when both app/ and src/app/ are there.
  const served = routes[0];
  const nested =
    served && !known ? (nestedRootLayouts(served)[0] ?? null) : null;
  const dir = known ?? (served && path.join(nested ?? served, 'theme-preview'));
  if (!dir && opts.optional) return /** @type {any} */ (null);
  if (!dir) {
    // A workspace root: the Next apps below it, each with a --path into
    // its routes folder.
    const apps = nextAppsUnder(cwd);
    refuse(
      E.ERR_NOT_FOUND,
      apps.length
        ? `No app routes folder here (app/ or src/app/); the Next ${apps.length > 1 ? 'apps' : 'app'} below ${apps.length > 1 ? 'are' : 'is'} ${apps.map(a => `${shown(cwd, a.root)}/`).join(', ')}.`
        : 'No app routes folder here (app/ or src/app/), so there is no app to put the preview in.',
      {
        run: [
          ...apps
            .slice(0, 3)
            .map(
              a =>
                `${PREVIEW} add --path ${quoteCommandArgument(shown(cwd, path.join(a.routes, 'theme-preview')))}`,
            ),
          `${PREVIEW} app theme-app  # a new starter app with the preview in it`,
        ],
      },
    );
  }
  inProjectOrRefuse(cwd, dir, retry);
  if (opts.write) checkPlacement(cwd, dir, `${shownDir(cwd, dir)}/`, retry);
  return {dir, app: appOf(dir)};
}

/**
 * The Next apps in folders below `cwd` (a few levels, node_modules left
 * out): each folder with a package.json that depends on `next` and a routes
 * folder with a root layout.
 * @param {string} cwd
 * @returns {Array<{root: string, routes: string}>}
 */
function nextAppsUnder(cwd) {
  /** @type {Array<{root: string, routes: string}>} */
  const out = [];
  /** @param {string} dir @param {number} depth */
  const walk = (dir, depth) => {
    if (depth > 3 || out.length >= 10) return;
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const e of entries) {
      if (
        !e.isDirectory() ||
        e.name === 'node_modules' ||
        e.name.startsWith('.')
      )
        continue;
      const sub = path.join(dir, e.name);
      const routes = nextRoutesOf(sub);
      if (routes) out.push({root: sub, routes});
      else walk(sub, depth + 1);
    }
  };
  walk(cwd, 1);
  return out.sort((a, b) => a.root.localeCompare(b.root));
}

/**
 * The routes folder of a Next app in `dir` (app/, else src/app/, with a
 * root layout), when its package.json depends on `next`; else null.
 * @param {string} dir
 * @returns {string | null}
 */
function nextRoutesOf(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    if (!['dependencies', 'devDependencies'].some(k => pkg?.[k]?.next))
      return null;
  } catch {
    return null;
  }
  return (
    [path.join(dir, 'app'), path.join(dir, 'src', 'app')].find(
      r =>
        fs.existsSync(r) &&
        fs.readdirSync(r).some(f => /^layout\.(tsx|ts|jsx|js)$/.test(f)),
    ) ?? null
  );
}

/**
 * Refuse a preview folder that reaches outside the project through a link,
 * as `--path` refuses one: every file the preview writes would land there.
 * @param {string} cwd
 * @param {string} dir
 * @param {Retry} retry
 */
function inProjectOrRefuse(cwd, dir, retry) {
  /** @param {string} d */
  const within = d => {
    try {
      assertWithin(d, cwd, {allowAbsolute: true, label: 'the preview folder'});
      return true;
    } catch (e) {
      if (e instanceof PathSafetyError) return false;
      throw e;
    }
  };
  if (within(dir)) return;
  let free = `${dir}-2`;
  for (let n = 3; fs.existsSync(free); n++) free = `${dir}-${n}`;
  refuse(
    E.ERR_PATH_TRAVERSAL,
    `${shownDir(cwd, dir)}/ leads outside the project through a link; the preview stays inside the folder you run the command from.`,
    {
      run: [
        within(path.dirname(dir))
          ? retry(shown(cwd, free))
          : `${PREVIEW} app theme-app  # a new app of its own, inside this folder`,
      ],
    },
  );
}

const CLI_PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const STARTER = path.join(CLI_PACKAGE, 'assets', 'preview-app');

/**
 * `file` when it is inside `root`, also through links; else a refusal.
 * @param {string} file absolute
 * @param {string} root absolute
 * @param {string} what what the path is, for the refusal
 * @param {{cwd?: string, pf?: string}} [opts] `cwd`: paths in the refusal
 *   are shown from it; `pf`: the caller's --path flag, for the suggestion
 * @returns {string}
 */
function confined(file, root, what, opts = {}) {
  try {
    return assertWithin(file, root, {allowAbsolute: true, label: what});
  } catch (e) {
    if (e instanceof PathSafetyError) {
      // The link that leads out: the file itself, or a folder on its way.
      /** @type {{at: string, to: string} | null} */
      let link = null;
      for (
        let at = file;
        at.startsWith(root + path.sep) && !link;
        at = path.dirname(at)
      )
        try {
          if (fs.lstatSync(at).isSymbolicLink())
            link = {at, to: fs.readlinkSync(at)};
        } catch {
          // Not there: look at its folder.
        }
      const at = (/** @type {string} */ f) =>
        opts.cwd ? shown(opts.cwd, f) || '.' : f;
      refuse(
        E.ERR_PATH_TRAVERSAL,
        link == null
          ? `${what} names ${at(file)}, which is outside ${at(root)}.`
          : `${at(link.at)} is a link to ${link.to}, outside ${at(root)}; the preview never writes through a link.`,
        {run: [`${PREVIEW} list${opts.pf ?? ''}`]},
      );
    }
    throw e;
  }
}

/** Files a fresh folder may hold and still count as empty. */
const IGNORABLE = new Set(['.git', '.DS_Store', 'Thumbs.db']);

/**
 * The home page of a new starter app: it points to the preview.
 * The starter's own home page is the repository example's.
 */
const STARTER_HOME = `'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';

export default function Home() {
  return (
    <main style={{display: 'flex', justifyContent: 'center', padding: '4rem 2rem'}}>
      <VStack gap={3}>
        <Heading level={1}>Theme preview app</Heading>
        <Text type="body" color="secondary">
          Made by astryx experimental theme preview app. The preview pages wear the theme.
        </Text>
        <Link href="/theme-preview">Open the theme preview</Link>
      </VStack>
    </main>
  );
}
`;

/**
 * The files a new starter app (Next.js app router, Core and the neutral
 * theme) writes into `where`, with `extra` files beside them, checked before
 * anything is written: the folder is new or empty, it is not inside the
 * project's routes, themes or packages, and every file stays inside it,
 * also through links.
 * @param {string} cwd
 * @param {string} where
 * @param {(root: string) => Array<{rel: string, text: string | Buffer}>} extra files relative to the app folder
 * @param {Record<string, string>} dependencies added to the starter's package.json
 * @param {string | null} [slug] the theme, repeated in suggestions
 * @returns {{root: string, writes: Array<{file: string, text: string | Buffer}>}}
 */
function planStarterApp(cwd, where, extra, dependencies, slug = null) {
  const again = (/** @type {string | null} */ p) =>
    `${PREVIEW} app ${quoteCommandArgument(p ?? 'theme-app')}${slug == null ? '' : ` --theme ${quoteCommandArgument(slug)}`}`;
  checkFolderName(where, 'The app folder', again);
  /** @type {string} */
  let root;
  try {
    root = assertWithin(path.resolve(cwd, where), cwd, {
      allowAbsolute: true,
      label: 'the app folder',
    });
  } catch (e) {
    if (e instanceof PathSafetyError)
      refuse(
        E.ERR_PATH_TRAVERSAL,
        `${where} is outside the current folder; make the app inside the folder you run the command from.`,
        {run: [again(null)]},
      );
    throw e;
  }
  /** A free folder name inside the current folder, near `dir`. @param {string} dir */
  const freeNear = dir => {
    const parent = dir === cwd ? cwd : path.dirname(dir);
    const base = dir === cwd ? 'theme-app' : `${path.basename(dir)}-preview`;
    let free = base;
    for (let n = 2; fs.existsSync(path.join(parent, free)); n++)
      free = `${base}-${n}`;
    return shown(cwd, path.join(parent, free));
  };
  const name = shownDir(cwd, root);
  const routes = ['app', path.join('src', 'app')]
    .map(r => path.join(cwd, r))
    .filter(r => fs.existsSync(r) && fs.statSync(r).isDirectory());
  const why =
    reservedFolder(cwd, root) ??
    (routes.some(r => root === r || root.startsWith(r + path.sep))
      ? "it is inside this app's routes folder, where Next would serve the new app's files as pages of this one"
      : null) ??
    (t =>
      t
        ? `${shownDir(cwd, t)}/ differs from it only in case, and on macOS and Windows they are one folder`
        : null)(sameCaseSibling(root));
  if (why) {
    let free = 'theme-app';
    for (let n = 2; fs.existsSync(path.join(cwd, free)); n++)
      free = `theme-app-${n}`;
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${name} is no place for a new app: ${why}.`,
      {
        run: [
          again(free),
          `${PREVIEW} add  # the preview inside this app instead`,
        ],
      },
    );
  }
  /** @type {fs.Stats | null} */
  let st = null;
  try {
    st = fs.lstatSync(root);
  } catch {
    // A new folder.
  }
  if (st?.isSymbolicLink() && !fs.existsSync(root))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} is a link to ${fs.readlinkSync(root)}, which does not exist.`,
      {run: [again(freeNear(root))]},
    );
  if (st && fs.existsSync(root) && !fs.statSync(root).isDirectory())
    refuse(E.ERR_FILE_EXISTS, `${name} is a file; the app goes in a folder.`, {
      run: [again(freeNear(root))],
    });
  if (
    fs.existsSync(root) &&
    fs.readdirSync(root).some(entry => !IGNORABLE.has(entry))
  )
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} exists and is not empty; a starter app goes only into a new or empty folder. Choose another name, or empty the folder.`,
      {run: [again(freeNear(root))]},
    );
  /** @type {Array<{file: string, text: string | Buffer}>} */
  const writes = [];
  /** @param {string} from */
  const walk = from => {
    for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
      const src = path.join(from, entry.name);
      if (entry.isDirectory()) walk(src);
      else if (entry.name !== 'README.md') {
        const rel = path.relative(STARTER, src);
        const target = rel === 'gitignore' ? '.gitignore' : rel;
        const file = confined(
          path.join(root, target),
          root,
          'a starter app file',
        );
        const text = fs.readFileSync(src, 'utf8');
        const key = rel.split(path.sep).join('/');
        writes.push({
          file,
          text:
            key === 'package.json'
              ? starterPackageJson(text, dependencies)
              : key === 'src/app/page.tsx'
                ? STARTER_HOME
                : key === 'src/app/layout.tsx'
                  ? starterLayout(text)
                  : text,
        });
      }
    }
  };
  walk(STARTER);
  for (const x of extra(root))
    writes.push({
      file: confined(path.join(root, x.rel), root, 'an app file'),
      text: x.text,
    });
  return {root, writes};
}

/**
 * The starter's root layout, with a title and description of its own.
 * @param {string} text
 */
function starterLayout(text) {
  return text
    .replace(/title: '[^']*'/, "title: 'Theme preview'")
    .replace(
      /description:\s*'[^']*'/,
      "description: 'An Astryx app made to preview a theme'",
    );
}

/**
 * The starter's package.json with the Astryx packages pinned to this CLI's
 * release, and `dependencies` added.
 * @param {string} text
 * @param {Record<string, string>} dependencies
 */
function starterPackageJson(text, dependencies) {
  const pinned = text.replaceAll('{{astryxVersion}}', cliVersion());
  if (!Object.keys(dependencies).length) return pinned;
  const pkg = JSON.parse(pinned);
  pkg.dependencies = Object.fromEntries(
    Object.entries({...pkg.dependencies, ...dependencies}).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Write a planned starter app: into a temp folder beside it first, then
 * renamed into place (or moved into the empty folder), so a failure leaves
 * nothing behind. No install runs here.
 * @param {string} cwd
 * @param {{root: string, writes: Array<{file: string, text: string | Buffer}>}} plan
 * @param {(dir: string) => string} again the command with this folder
 * @returns {string[]} the files written
 */
function writeStarterApp(cwd, plan, again) {
  const {root} = plan;
  const parent = path.dirname(root);
  /** The folders on the way to the app that this call makes. @type {string[]} */
  const made = [];
  for (let d = parent; !fs.existsSync(d); d = path.dirname(d)) made.push(d);
  /** @type {string | null} */
  let tmp = null;
  /** @type {string[]} */
  const movedIn = [];
  try {
    fs.mkdirSync(parent, {recursive: true});
    tmp = fs.mkdtempSync(path.join(parent, '.astryx-app-'));
    for (const w of plan.writes) {
      const file = path.join(tmp, path.relative(root, w.file));
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, w.text);
    }
    if (!fs.existsSync(root)) {
      fs.renameSync(tmp, root);
      tmp = null;
    } else {
      for (const entry of fs.readdirSync(tmp)) {
        const to = path.join(root, entry);
        if (fs.existsSync(to))
          throw Object.assign(new Error(`${to} exists`), {code: 'EEXIST'});
        fs.renameSync(path.join(tmp, entry), to);
        movedIn.push(to);
      }
      fs.rmdirSync(tmp);
      tmp = null;
    }
  } catch (e) {
    for (const m of movedIn) fs.rmSync(m, {recursive: true, force: true});
    if (tmp) fs.rmSync(tmp, {recursive: true, force: true});
    for (const d of made)
      try {
        fs.rmdirSync(d);
      } catch {
        // Not empty: something else is in it now.
      }
    const code = /** @type {any} */ (e)?.code;
    if (code === undefined) throw e;
    if (code === 'EEXIST' || code === 'ENOTEMPTY')
      refuse(
        E.ERR_FILE_EXISTS,
        `${shownDir(cwd, root)} was filled by something else while the app was written, so the app was not put there.`,
        {run: [again(`${shownDir(cwd, root)}-2`)]},
      );
    refuse(
      E.ERR_WRITE_FAILED,
      `The app could not be written (${code}); nothing of it was left in ${shownDir(cwd, root)}.`,
      {run: [`${again(shownDir(cwd, root))}  # once the cause is fixed`]},
    );
  }
  return plan.writes.map(w => shown(cwd, w.file)).sort();
}

/**
 * Why a theme-preview.json is not the preview's data, or null. It is a file
 * anyone can edit, so its shape is checked before it decides any write or
 * delete. A path that leads out of the folder is refused later, by
 * {@link confined}.
 * @param {any} d
 * @returns {string | null}
 */
function previewProblem(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d))
    return 'it is not a JSON object';
  if (d.version !== 1)
    return `"version" is ${JSON.stringify(d.version)}, not 1`;
  if (d.theme != null && typeof d.theme !== 'string')
    return '"theme" is not a theme name or null';
  if (!Array.isArray(d.pages)) return '"pages" is not a list';
  if (!Array.isArray(d.files)) return '"files" is not a list';
  if (
    d.parents !== undefined &&
    !(Number.isInteger(d.parents) && d.parents >= 0 && d.parents <= 20)
  )
    return '"parents" is not a small whole number';
  const ids = new Set();
  for (const p of d.pages) {
    if (!p || typeof p !== 'object' || Array.isArray(p))
      return '"pages" holds an entry that is not an object';
    if (typeof p.id !== 'string' || !PAGE_ID.test(p.id))
      return `the page id ${JSON.stringify(p.id)} is not lowercase letters, digits and dashes`;
    if (typeof p.label !== 'string')
      return `the page ${p.id} has no text label`;
    if (
      p.file !== `${PAGES_DIR}/${p.id}` &&
      p.file !== `${LEGACY_PAGES_DIR}/${p.id}`
    )
      return `the page ${p.id} names the file ${JSON.stringify(p.file)}, not ${PAGES_DIR}/${p.id}`;
    if (ids.has(p.id)) return `the page ${p.id} is listed twice`;
    ids.add(p.id);
  }
  for (const f of d.files)
    if (
      typeof f !== 'string' ||
      !f ||
      f.includes('\\') ||
      path.posix.isAbsolute(f) ||
      /^[A-Za-z]:/.test(f) ||
      f.split('/').some(x => x === '' || x === '.')
    )
      return `"files" holds ${JSON.stringify(f)}, which is not a file path relative to the folder`;
    else if (f.split('/').includes('..'))
      return `"files" holds ${JSON.stringify(f)}, which leads outside the folder (${OUTSIDE_FIX})`;
  if (
    d.hashes != null &&
    (typeof d.hashes !== 'object' ||
      Array.isArray(d.hashes) ||
      Object.values(d.hashes).some(h => typeof h !== 'string'))
  )
    return '"hashes" is not a map of file to hash';
  return null;
}

/**
 * Refuse a damaged theme-preview.json: it decides which files the preview
 * may replace or delete, so no preview command changes the folder until it
 * is fixed.
 * @param {string} cwd
 * @param {string} dir
 * @param {string} why
 * @param {string} pf the caller's --path flag, for the suggestion
 * @returns {never}
 */
function damagedPreview(cwd, dir, why, pf) {
  const folder = shownDir(cwd, dir);
  const record = `${folder}/${PREVIEW_DATA}`;
  refuse(
    E.ERR_THEME_INVALID,
    `${record} is damaged: ${why}. It lists the preview's pages and the files it wrote, so the preview commands leave the folder alone until it is fixed.`,
    {
      fix: holdsApp(cwd, dir)
        ? `fix ${record} by hand, or give it another name (for example ${PREVIEW_DATA}.broken): the folder holds your app, so keep the folder as it is; then add the preview in its own folder with ${PREVIEW} add`
        : `fix ${record} by hand; or give the folder a new name that starts with _ (Next does not serve such a folder, and nothing in it is lost), then run ${PREVIEW} add${pf} again`,
    },
  );
}

/**
 * Whether a folder holds the app itself: the project root, src/, a routes
 * folder (app/ or src/app/), or any folder with a package.json. Nothing
 * the preview writes goes there, and nothing there is deleted on a record's
 * word alone.
 * @param {string} cwd
 * @param {string} dir
 */
function holdsApp(cwd, dir) {
  return (
    dir === cwd ||
    dir === path.join(cwd, 'src') ||
    dir === path.join(cwd, 'app') ||
    dir === path.join(cwd, 'src', 'app') ||
    fs.existsSync(path.join(dir, 'package.json'))
  );
}

/** What a record entry that leads outside the folder takes. */
const OUTSIDE_FIX = `${PREVIEW} remove drops it and deletes nothing outside`;

/**
 * The preview's data, null when the folder has none; a refusal when the
 * file is there but unreadable or of the wrong shape.
 * @param {string} cwd
 * @param {string} dir
 * @param {string} [pf] the caller's --path flag, for the refusal
 * @param {{dropped?: string[]}} [opts] `dropped`: entries of "files" that
 *   lead outside the folder are taken out and collected here, as `remove`
 *   does
 * @returns {PreviewData | null}
 */
function readPreview(cwd, dir, pf = '', opts = {}) {
  /** @type {string} */
  let text;
  try {
    // A byte-order mark (Notepad, PowerShell) is not part of the JSON.
    text = fs
      .readFileSync(path.join(dir, PREVIEW_DATA), 'utf8')
      .replace(/^\uFEFF/, '');
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    damagedPreview(cwd, dir, `it cannot be read (${code})`, pf);
  }
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    damagedPreview(
      cwd,
      dir,
      `it is not valid JSON (${/** @type {Error} */ (e).message})`,
      pf,
    );
  }
  // `remove` drops an entry that leads outside the folder, and deletes
  // nothing there.
  if (opts.dropped && data && Array.isArray(data.files)) {
    const outside = (/** @type {unknown} */ f) =>
      typeof f === 'string' && f.split('/').includes('..');
    for (const f of data.files) if (outside(f)) opts.dropped.push(f);
    data.files = data.files.filter((/** @type {unknown} */ f) => !outside(f));
  }
  const problem = previewProblem(data);
  if (problem) damagedPreview(cwd, dir, problem, pf);
  data.files = [...new Set(data.files)];
  return data;
}

/** A short hash of a file's text. @param {string | Buffer} text */
const digest = text => sha256(Buffer.from(text)).slice(0, 16);

/**
 * A file's text as a formatter could have left it: white space outside
 * strings collapsed (and dropped next to punctuation), statement
 * semicolons and trailing commas dropped, and every string written with one
 * quote kind. The text inside strings, comments, template literals and
 * JSX text is kept, so a hand edit there always shows.
 * @param {string} text
 */
function formatterNeutral(text) {
  const PUNCT = /[{}()[\],;:<>=/.?!&|+*%^~-]/;
  // A quote starts a string after an operator, an opening bracket or one
  // of these words; elsewhere (JSX text such as "don't") it is plain text.
  const STRING_AFTER =
    /(?:^|[=({[,:;!&|?+<]|\b(?:from|import|return|case|in|of|typeof|export|default))$/;
  let out = '';
  let space = false;
  /** @param {string} t */
  const put = t => {
    if (space && out && !PUNCT.test(out.at(-1) ?? '') && !PUNCT.test(t[0]))
      out += ' ';
    space = false;
    out += t;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      space = true;
      i++;
      continue;
    }
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const end =
        text[i + 1] === '/'
          ? text.indexOf('\n', i) === -1
            ? text.length
            : text.indexOf('\n', i)
          : text.indexOf('*/', i + 2) === -1
            ? text.length
            : text.indexOf('*/', i + 2) + 2;
      put(text.slice(i, end).replace(/\s+/g, ' ').trim());
      space = true;
      i = end;
      continue;
    }
    if ((c === '"' || c === "'") && STRING_AFTER.test(out.trimEnd())) {
      let j = i + 1;
      let body = '';
      while (j < text.length && text[j] !== c && text[j] !== '\n') {
        if (text[j] === '\\' && j + 1 < text.length) {
          const n = text[j + 1];
          body += n === '"' || n === "'" ? n : text.slice(j, j + 2);
          j += 2;
        } else body += text[j++];
      }
      if (text[j] === c) {
        put(`'${body.replace(/'/g, "\\'")}'`);
        i = j + 1;
        continue;
      }
    }
    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < text.length && !(text[j] === '`' && depth === 0)) {
        if (text[j] === '\\') j++;
        else if (text[j] === '$' && text[j + 1] === '{') depth++;
        else if (text[j] === '}' && depth > 0) depth--;
        j++;
      }
      put(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === ';') {
      space = true;
      i++;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (/[}\])]/.test(text[j] ?? '')) {
        i++;
        continue;
      }
    }
    put(c);
    i++;
  }
  return out;
}

/**
 * The hash recorded for a file the preview writes, of its formatter-neutral
 * text, so a formatter run (prettier, eslint --fix) does not count as a
 * change by hand while an edit inside a string does.
 * @param {string | Buffer} text
 */
const formatterHash = text => `v2:${digest(formatterNeutral(String(text)))}`;

/** Fields of a syntax tree node that say where or how it was written. */
const LAYOUT = new Set([
  'start',
  'end',
  'loc',
  'range',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'comments',
  'tokens',
  'errors',
]);

/**
 * The text a run of JSX text renders, as JSX reads it: lines trimmed where
 * they meet a line break, blank lines dropped, the rest joined by a space.
 * @param {string} value
 */
function jsxText(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let last = 0;
  lines.forEach((l, i) => {
    if (/[^ \t]/.test(l)) last = i;
  });
  let out = '';
  lines.forEach((line, i) => {
    let t = line.replace(/\t/g, ' ');
    if (i !== 0) t = t.replace(/^ +/, '');
    if (i !== lines.length - 1) t = t.replace(/ +$/, '');
    if (t) out += i === last ? t : `${t} `;
  });
  return out;
}

/**
 * JSX children as they render: text and string expressions (`{" "}`) are
 * one run of text, and runs that render nothing are dropped, so a
 * formatter's line breaks and `{" "}` change nothing.
 * @param {any[]} children
 * @param {(node: any) => any} walk
 */
function jsxChildren(children, walk) {
  /** @type {any[]} */
  const out = [];
  for (const c of children ?? []) {
    const text =
      c.type === 'JSXText'
        ? jsxText(c.value)
        : c.type === 'JSXExpressionContainer' &&
            c.expression?.type === 'StringLiteral'
          ? c.expression.value
          : null;
    if (text == null) out.push(walk(c));
    else if (out.at(-1)?.type === 'Text') out.at(-1).value += text;
    else out.push({type: 'Text', value: text});
  }
  return out.filter(c => !(c.type === 'Text' && c.value === ''));
}

/**
 * A file's code in a form no formatter changes: its syntax tree, without
 * positions, parentheses, quote kinds, trailing commas or semicolons, with
 * object keys written the same quoted or bare, white space in JSX text
 * collapsed, and its comments by text. Null when it does not parse.
 * @param {string} text
 * @returns {string | null}
 */
function canonicalCode(text) {
  /** @type {any} */
  let file;
  try {
    file = parseModule(text, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: false,
    });
  } catch {
    return null;
  }
  /** @param {any} node @returns {any} */
  const walk = node => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (LAYOUT.has(k)) continue;
      out[k] = walk(v);
    }
    // A key written "a" or a is the same key.
    if (
      (node.type === 'ObjectProperty' ||
        node.type === 'ObjectMethod' ||
        node.type === 'TSPropertySignature' ||
        node.type === 'ClassProperty') &&
      !node.computed &&
      node.key?.type === 'StringLiteral' &&
      /^[A-Za-z_$][\w$]*$/.test(node.key.value)
    )
      out.key = {type: 'Identifier', name: node.key.value};
    if (node.type === 'JSXElement' || node.type === 'JSXFragment')
      out.children = jsxChildren(node.children, walk);
    return out;
  };
  const comments = (file.comments ?? []).map((/** @type {any} */ c) =>
    c.value.replace(/\s+/g, ' ').trim(),
  );
  return JSON.stringify([walk(file.program), comments]);
}

/**
 * The hash recorded for a file the preview writes, of its code in a form no
 * formatter changes ({@link canonicalCode}), so prettier or eslint --fix
 * with any options does not count as a change by hand, while an edit to
 * code, a string or a comment does. A file that does not parse falls back
 * to the text form ({@link formatterNeutral}).
 * @param {string | Buffer} text
 */
const contentHash = text => {
  const code = canonicalCode(String(text));
  return code == null ? formatterHash(text) : `v3:${digest(code)}`;
};

/**
 * Whether a file's text matches a recorded hash of any kind a release
 * wrote: v3 (syntax tree), v2 (text outside strings), or older.
 * @param {string | Buffer} text
 * @param {string} h
 */
const sameAsRecorded = (text, h) =>
  h.startsWith('v3:')
    ? contentHash(text) === h
    : h.startsWith('v2:')
      ? formatterHash(text) === h
      : oldContentHash(text) === h || digest(text) === h;

/**
 * The normalized hash of an earlier release (white space, semicolons,
 * commas and quote kinds dropped everywhere). Read only for records that
 * hold it; the next write records {@link contentHash}.
 * @param {string | Buffer} text
 */
const oldContentHash = text =>
  digest(
    String(text)
      .replace(/["'`]/g, "'")
      .replace(/[\s;,]+/g, ''),
  );

/**
 * Whether a file the preview wrote was changed since, by its recorded hash.
 * A file with no hash counts as unchanged here; {@link ownedUnchanged}
 * decides deletes, and never deletes a file with no hash.
 * @param {string} dir
 * @param {PreviewData} data
 * @param {string} rel
 */
function editedByHand(dir, data, rel) {
  const was = data.hashes?.[rel];
  if (!was) return false;
  try {
    const text = fs.readFileSync(path.join(dir, rel));
    if (was.startsWith('v2:') || was.startsWith('v3:'))
      return !sameAsRecorded(text, was);
    // Older records hold the exact or the earlier normalized hash.
    return oldContentHash(text) !== was && digest(text) !== was;
  } catch {
    return false;
  }
}

/**
 * Whether the preview may delete a file its record lists: only its own
 * route file, its record, and the page file of a recorded page (in
 * _pages/, or pages/ for an older release), and only when a recorded hash
 * shows the file is as the preview wrote it. Anything else the record names
 * is kept: a record can be copied, merged or edited by hand.
 * @param {string} dir
 * @param {PreviewData} data
 * @param {string} rel
 * @param {Set<string>} ids the recorded page ids
 * @returns {'delete' | 'not-preview' | 'no-hash' | 'edited'}
 */
function ownedUnchanged(dir, data, rel, ids) {
  if (rel === PREVIEW_DATA) return 'delete';
  const page = /^(?:_pages|pages)\/([a-z0-9][a-z0-9-]*)\.tsx$/.exec(rel);
  if (rel !== 'page.tsx' && !(page && ids.has(page[1]))) return 'not-preview';
  if (!data.hashes?.[rel]) return 'no-hash';
  return editedByHand(dir, data, rel) ? 'edited' : 'delete';
}

/**
 * Why a file the preview listed is kept, for the result notes.
 * @param {string} name
 * @param {'not-preview' | 'no-hash' | 'edited'} why
 */
const keptNote = (name, why) =>
  why === 'not-preview'
    ? `${name} is kept: theme-preview.json lists it, but the preview only writes page.tsx and page files in ${PAGES_DIR}/`
    : why === 'no-hash'
      ? `${name} is kept: theme-preview.json has no record of how the preview wrote it, so it may hold your changes; it stays until you remove it yourself`
      : `${name} was changed by hand after the preview wrote it, so it is kept`;

/**
 * Check one planned write before anything is written. A file the preview
 * did not write is never replaced, unless it already holds exactly the
 * planned text (a page an interrupted run left behind is adopted). A file
 * the preview wrote and someone changed since is not replaced either.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {{rel: string, text: string}} w
 * @param {string} elsewhere a command that puts the preview in a free folder
 * @returns {'new' | 'same' | 'replace'}
 */
function checkWrite(cwd, dir, data, w, elsewhere) {
  const file = confined(path.join(dir, w.rel), dir, 'a preview file');
  /** @type {fs.Stats} */
  let st;
  try {
    st = fs.lstatSync(file);
  } catch {
    return 'new';
  }
  const name = shown(cwd, file);
  if (!st.isFile())
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} is ${st.isDirectory() ? 'a folder' : 'not a plain file'}, where the preview writes a file; it is never replaced.`,
      {run: [elsewhere]},
    );
  if (fs.readFileSync(file, 'utf8') === w.text) return 'same';
  const page = /^_?pages\/([^/]+)\.tsx$/.exec(w.rel)?.[1];
  if (!data.files.includes(w.rel))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} exists and the preview did not write it; it is never replaced.`,
      page
        ? {
            fix: `give ${name} another name if you want to keep it, then run the command again; or add another page`,
            run: ['astryx template --list --type page'],
          }
        : {
            fix: `move ${name} out of the folder, then run the command again; or put the preview in another folder`,
            run: [elsewhere],
          },
    );
  // A file another command wrote while this one was stopped is not a hand
  // edit: say the lock was taken.
  refuseIfLockLost();
  if (editedByHand(dir, data, w.rel))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} was changed by hand after the preview wrote it, so it is not replaced.`,
      {
        fix: `copy your changes out of ${name}, then give it another name, and run the command again`,
      },
    );
  return 'replace';
}

/**
 * Apply a checked plan to the preview folder: every write goes to a temp
 * file first, then all are renamed into place, then the deletes run, then
 * theme-preview.json is written with the new hashes. When any step fails,
 * every file is put back as it was, and the refusal says so.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {Array<{rel: string, text: string, keepHash?: boolean}>} writes
 *   `keepHash`: a file moved as it is keeps its recorded hash
 * @param {string[]} deletes relative to dir
 * @param {string} again the command, to run again once the cause is fixed
 */
function commitPreview(cwd, dir, data, writes, deletes, again) {
  /** The temp file of each target. @type {Map<string, string>} */
  const temps = new Map();
  const tmp = (/** @type {string} */ file) => {
    if (!temps.has(file)) temps.set(file, tempFor(file));
    return /** @type {string} */ (temps.get(file));
  };
  /** @type {string[]} */
  const staged = [];
  /** Folders this call made. @type {string[]} */
  const made = [];
  /** @type {Array<{file: string, before: Buffer | null}>} */
  const touched = [];
  const before = (/** @type {string} */ file) => {
    try {
      return fs.readFileSync(file);
    } catch {
      return null;
    }
  };
  /** @param {string} folder */
  const mkdir = folder => {
    /** @type {string[]} */
    const missing = [];
    for (let d = folder; !fs.existsSync(d); d = path.dirname(d))
      missing.unshift(d);
    fs.mkdirSync(folder, {recursive: true});
    made.push(...missing);
  };
  /** @param {string} file @param {string} text */
  const stage = (file, text) => {
    // Recorded before the write, so a write that fails halfway (a full
    // disk) leaves no temp file behind.
    staged.push(tmp(file));
    fs.writeFileSync(tmp(file), text);
    try {
      // A file someone made read-only keeps its mode.
      fs.chmodSync(tmp(file), fs.statSync(file).mode & 0o777);
    } catch {
      // A new file.
    }
  };
  let current = dir;
  let step = 'written';
  const pendingFile = path.join(dir, PENDING);
  /** The record as it is before this call. @type {any} */
  let old;
  try {
    old = JSON.parse(String(before(path.join(dir, PREVIEW_DATA)) ?? 'null'));
  } catch {
    old = null;
  }
  try {
    const hashes = {...data.hashes};
    for (const w of writes)
      if (!w.keepHash || !hashes[w.rel]) hashes[w.rel] = contentHash(w.text);
    for (const rel of deletes) delete hashes[rel];
    for (const rel of Object.keys(hashes))
      if (!data.files.includes(rel)) delete hashes[rel];
    data.hashes = hashes;
    if (!data.files.includes(PREVIEW_DATA)) data.files.push(PREVIEW_DATA);
    for (const w of writes) {
      current = confined(path.join(dir, w.rel), dir, 'a preview file');
      mkdir(path.dirname(current));
      stage(current, w.text);
    }
    // The record this call ends with, the one it starts from and the temp
    // files and deletes between them, written before the first rename: a
    // command stopped part way (a kill) leaves it, and the next preview
    // command finishes the step from it ({@link recoverPreview}).
    current = pendingFile;
    writeWhole(
      pendingFile,
      `${JSON.stringify(
        {
          version: 1,
          record: data,
          old,
          temps: [...temps.values()].map(t => path.relative(dir, t)),
          deletes,
          // What each file to delete holds now: after a stop, it goes only
          // when it still holds that.
          deleteHashes: Object.fromEntries(
            deletes.flatMap(rel => {
              const text = before(
                confined(path.join(dir, rel), dir, 'a preview file'),
              );
              return text ? [[rel, contentHash(text)]] : [];
            }),
          ),
        },
        null,
        2,
      )}\n`,
    );
    commitStep('pending');
    for (const w of writes) {
      current = path.join(dir, w.rel);
      touched.push({file: current, before: before(current)});
      fs.renameSync(tmp(current), current);
      commitStep('rename');
    }
    staged.length = 0;
    step = 'removed';
    for (const rel of deletes) {
      current = confined(path.join(dir, rel), dir, 'a preview file');
      const was = before(current);
      if (was == null) continue;
      touched.push({file: current, before: was});
      fs.rmSync(current);
      commitStep('delete');
    }
    step = 'written';
    current = path.join(dir, PREVIEW_DATA);
    touched.push({file: current, before: before(current)});
    stage(current, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmp(current), current);
    fs.rmSync(pendingFile, {force: true});
  } catch (e) {
    // A stop injected by a test stands for a kill: nothing is put back.
    if (e === STOPPED) throw e;
    fs.rmSync(pendingFile, {force: true});
    for (const t of staged) fs.rmSync(t, {force: true});
    for (const t of touched.reverse())
      try {
        if (t.before == null) fs.rmSync(t.file, {force: true});
        else fs.writeFileSync(t.file, t.before);
      } catch {
        // Best effort: the refusal below names the file.
      }
    for (const d of made.reverse())
      try {
        fs.rmdirSync(d);
      } catch {
        // Not empty: something else is in it now.
      }
    if (/** @type {any} */ (e)?.code === undefined) throw e;
    refuse(
      E.ERR_WRITE_FAILED,
      `${shown(cwd, current)} could not be ${step} (${/** @type {any} */ (e).code}), so every file of the preview was put back as it was.`,
      {run: [`${again}  # once the cause is fixed`]},
    );
  }
}

/** The step record a preview change leaves while it runs. */
const PENDING = '.theme-preview.pending.json';

/** What a test throws to stop a change part way, as a kill would. */
const STOPPED = Symbol('stopped');

/** @type {((step: string) => boolean) | null} */
let stopAt = null;

/**
 * For tests: stop the next preview changes at the step where `when`
 * returns true, as a kill would, with nothing put back. Null clears it.
 * @param {((step: string) => boolean) | null} when
 */
export function stopPreviewCommitAt(when) {
  stopAt = when;
}

/** Whether a process is running here. @param {number} pid */
function alive(pid) {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return /** @type {any} */ (e)?.code === 'EPERM';
  }
}

/** @param {string} step */
function commitStep(step) {
  if (stopAt?.(step)) throw STOPPED;
}

/**
 * Page files in the preview folder that theme-preview.json does not list:
 * a stopped change can leave one behind when its step record is damaged.
 * @param {string} dir
 * @returns {string[]} paths relative to the preview folder
 */
function unrecordedPages(dir) {
  /** @type {string[]} */
  let listed = [];
  try {
    const files = JSON.parse(
      fs.readFileSync(path.join(dir, PREVIEW_DATA), 'utf8'),
    )?.files;
    if (Array.isArray(files)) listed = files.map(String);
  } catch {
    // No record, or a damaged one: every page file is unrecorded.
  }
  /** @type {string[]} */
  const out = [];
  for (const sub of [PAGES_DIR, LEGACY_PAGES_DIR]) {
    /** @type {string[]} */
    let names;
    try {
      names = fs.readdirSync(path.join(dir, sub));
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      const rel = `${sub}/${name}`;
      if (name.endsWith('.tsx') && !listed.includes(rel)) out.push(rel);
    }
  }
  return out;
}

/**
 * Whether a step record names a path that leads out of the preview folder
 * (a hand edit, a damaged file): such a record is not followed.
 * @param {string} dir
 * @param {any} p
 */
function pendingEscapes(dir, p) {
  const rels = [
    ...(Array.isArray(p?.temps) ? p.temps : []),
    ...(Array.isArray(p?.record?.files) ? p.record.files : []),
    ...(Array.isArray(p?.old?.files) ? p.old.files : []),
  ].filter(x => typeof x === 'string');
  return rels.some(rel => {
    try {
      assertWithin(path.join(dir, rel), dir, {allowAbsolute: true});
      return false;
    } catch {
      return true;
    }
  });
}

/**
 * Finish a preview change that was stopped part way (a kill), from the
 * step record it left: its leftover temp files go; each file it was writing
 * keeps the hash of what is on disk when that is the new or the old text,
 * and no hash otherwise (so it is never deleted on the record's word); a
 * page whose new file never landed keeps its old file; an old file it was
 * removing goes only when the preview wrote it and its new file is there.
 * The record is then written and the step record removed. Nothing happens
 * when there is no step record.
 * @param {string} cwd
 * @param {string} dir
 * @returns {string | null} a note for the result, when a change was finished
 */
function recoverPreview(cwd, dir) {
  const pendingFile = path.join(dir, PENDING);
  /** @type {any} */
  let p;
  // Unreadable, or naming a path outside the folder: the change is
  // treated as never started.
  const abandon = () => {
    // Its temp files are found by the names only the editor makes, when
    // their process is gone.
    for (const sub of ['', PAGES_DIR, LEGACY_PAGES_DIR]) {
      /** @type {string[]} */
      let names;
      try {
        names = fs.readdirSync(path.join(dir, sub));
      } catch {
        continue;
      }
      for (const name of names) {
        const m = /^\..+\.astryx-(\d+)-[a-z0-9]+\.tmp$/.exec(name);
        if (m && !alive(Number(m[1])))
          fs.rmSync(path.join(dir, sub, name), {force: true});
      }
    }
    fs.rmSync(pendingFile, {force: true});
    const strays = unrecordedPages(dir).map(rel =>
      shown(cwd, path.join(dir, rel)),
    );
    return `removed ${shown(cwd, pendingFile)}, a damaged step record of a preview change that was stopped${strays.length ? `; ${strays.join(', ')} ${strays.length > 1 ? 'are' : 'is'} in no preview record and may be from that change, so ${strays.length > 1 ? 'they stay' : 'it stays'} until you remove ${strays.length > 1 ? 'them' : 'it'}` : ''}`;
  };
  try {
    p = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'ENOENT') return null;
    return abandon();
  }
  if (pendingEscapes(dir, p)) return abandon();
  const inside = (/** @type {string} */ rel) =>
    confined(path.join(dir, rel), dir, PENDING);
  for (const t of Array.isArray(p?.temps) ? p.temps : [])
    if (typeof t === 'string' && /\.astryx-[^/]*\.tmp$/.test(t))
      fs.rmSync(inside(t), {force: true});
  const record = p?.record;
  if (previewProblem(record)) {
    fs.rmSync(pendingFile, {force: true});
    return null;
  }
  const old = p.old && !previewProblem(p.old) ? p.old : null;
  // The route decides which way the change goes: a page.tsx that is not
  // the new one means the route never changed, so the change is undone and
  // the record stays as it was; else it is finished.
  const route = (() => {
    try {
      return fs.readFileSync(inside('page.tsx'));
    } catch {
      return null;
    }
  })();
  const newRoute = record.hashes?.['page.tsx'];
  if (newRoute && !(route && hashMatches(route, newRoute)))
    return undoStopped(cwd, dir, record, old);
  /** @param {string} rel */
  const onDisk = rel => {
    try {
      return fs.readFileSync(inside(rel));
    } catch {
      return null;
    }
  };
  const matches = hashMatches;
  const hashes = {...record.hashes};
  for (const rel of Object.keys(hashes)) {
    const text = onDisk(rel);
    if (!text) continue;
    if (matches(text, hashes[rel])) continue;
    if (old?.hashes?.[rel] && matches(text, old.hashes[rel]))
      hashes[rel] = old.hashes[rel];
    else delete hashes[rel];
  }
  // A page whose new file never landed keeps its old file, or else leaves
  // the record, so the record never lists a page the route cannot show.
  for (const page of [...record.pages]) {
    const rel = `${page.file}.tsx`;
    if (onDisk(rel)) continue;
    const was = old?.pages.find((/** @type {any} */ x) => x.id === page.id);
    const oldRel = was && `${was.file}.tsx`;
    if (oldRel && oldRel !== rel && onDisk(oldRel)) {
      page.file = was.file;
      record.files = record.files.map((/** @type {string} */ f) =>
        f === rel ? oldRel : f,
      );
      delete hashes[rel];
      if (old.hashes?.[oldRel]) hashes[oldRel] = old.hashes[oldRel];
    } else {
      record.pages = record.pages.filter((/** @type {any} */ x) => x !== page);
      record.files = record.files.filter(
        (/** @type {string} */ f) => f !== rel,
      );
      delete hashes[rel];
    }
  }
  // An old file the change was removing goes when it still holds what it
  // held when the change planned it, and no page of the record uses it now;
  // one that changed since is kept and named.
  /** @type {string[]} */
  const left = [];
  for (const rel of Array.isArray(p.deletes) ? p.deletes : []) {
    if (typeof rel !== 'string' || record.files.includes(rel)) continue;
    const text = onDisk(rel);
    if (!text) continue;
    // A page moved from pages/ to _pages/: the old copy goes once the new
    // one holds the same text.
    const moved = /^pages\/([a-z0-9][a-z0-9-]*)\.tsx$/.exec(rel);
    const copy = moved && onDisk(`${PAGES_DIR}/${moved[1]}.tsx`);
    if (
      matches(text, p.deleteHashes?.[rel]) ||
      matches(text, old?.hashes?.[rel]) ||
      (copy && copy.equals(text))
    )
      fs.rmSync(inside(rel));
    else left.push(shown(cwd, inside(rel)));
  }
  record.hashes = hashes;
  writeWhole(
    path.join(dir, PREVIEW_DATA),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  fs.rmSync(pendingFile, {force: true});
  tidyPageFolders(dir);
  return `finished a preview change that was stopped part way (${shown(cwd, dir) || '.'}/${PENDING})${left.length ? `; kept ${left.join(', ')}: ${left.length > 1 ? 'they' : 'it'} changed after the change began, so ${left.length > 1 ? 'they' : 'it'} may hold your changes and ${left.length > 1 ? 'stay' : 'stays'} until you remove ${left.length > 1 ? 'them' : 'it'}` : ''}`;
}

/**
 * Whether a file's text matches a recorded hash, of any kind a release
 * wrote.
 * @param {Buffer} text
 * @param {string | undefined} h
 */
function hashMatches(text, h) {
  return !!h && sameAsRecorded(text, h);
}

/**
 * Undo a preview change stopped before its route landed: the record stays
 * as it was, each new file of the change that landed and the old record
 * does not list goes (only when it is as the change wrote it), and a file
 * both records list that now holds the change's text keeps that text's
 * hash, so it is not taken for a hand edit.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} record the record the change was writing
 * @param {PreviewData | null} old the record before it
 * @returns {string}
 */
function undoStopped(cwd, dir, record, old) {
  const inside = (/** @type {string} */ rel) =>
    confined(path.join(dir, rel), dir, PENDING);
  /** @param {string} rel */
  const onDisk = rel => {
    try {
      return fs.readFileSync(inside(rel));
    } catch {
      return null;
    }
  };
  const keep = new Set(old?.files ?? []);
  const hashes = {...old?.hashes};
  for (const [rel, h] of Object.entries(record.hashes ?? {})) {
    const text = onDisk(rel);
    if (!text || !hashMatches(text, h)) continue;
    if (keep.has(rel)) hashes[rel] = h;
    else if (rel !== PREVIEW_DATA) fs.rmSync(inside(rel));
  }
  if (old) {
    old.hashes = hashes;
    writeWhole(
      path.join(dir, PREVIEW_DATA),
      `${JSON.stringify(old, null, 2)}\n`,
    );
  }
  fs.rmSync(path.join(dir, PENDING), {force: true});
  tidyPageFolders(dir);
  return `undid a preview change that was stopped before its route was written (${shown(cwd, dir) || '.'}/${PENDING})`;
}

/**
 * Move the pages an older release wrote into pages/ to {@link PAGES_DIR}/,
 * in the plan and in `data`: a pages/ folder at the project root or in
 * src/ is Next's Pages Router. A page the preview did not write keeps its
 * place.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @returns {{writes: Array<{rel: string, text: string, keepHash: boolean}>, deletes: string[], moved: string[]}}
 */
function movedPages(cwd, dir, data) {
  /** @type {Array<{rel: string, text: string, keepHash: boolean}>} */
  const writes = [];
  /** @type {string[]} */
  const deletes = [];
  /** @type {string[]} */
  const moved = [];
  for (const p of data.pages) {
    const from = `${p.file}.tsx`;
    if (
      !p.file.startsWith(`${LEGACY_PAGES_DIR}/`) ||
      !data.files.includes(from)
    )
      continue;
    const to = `${PAGES_DIR}/${p.id}.tsx`;
    const target = confined(path.join(dir, to), dir, 'a preview file');
    /** @type {string | null} */
    let text = null;
    try {
      text = fs.readFileSync(
        confined(path.join(dir, from), dir, 'a preview file'),
        'utf8',
      );
    } catch {
      // Gone already: only the record moves.
    }
    if (
      fs.existsSync(target) &&
      (text == null || fs.readFileSync(target, 'utf8') !== text)
    )
      refuse(
        E.ERR_FILE_EXISTS,
        `${shown(cwd, target)} exists and the preview did not write it; the preview moves its pages there.`,
        {
          fix: `give ${shown(cwd, target)} another name if you want to keep it, then run the command again`,
        },
      );
    p.file = `${PAGES_DIR}/${p.id}`;
    data.files = data.files.map(f => (f === from ? to : f));
    if (data.hashes?.[from]) {
      data.hashes[to] = data.hashes[from];
      delete data.hashes[from];
    }
    if (text == null) continue;
    writes.push({rel: to, text, keepHash: true});
    deletes.push(from);
    moved.push(p.id);
  }
  return {writes, deletes, moved};
}

/** Remove the page folders when nothing is left in them. @param {string} dir */
function tidyPageFolders(dir) {
  for (const sub of [PAGES_DIR, LEGACY_PAGES_DIR])
    try {
      fs.rmdirSync(path.join(dir, sub));
    } catch {
      // Not there, or not empty: something there is not the preview's.
    }
}

/**
 * The theme the route imports; null for the app's own theme. A theme that
 * does not load is refused here, before the route or any page is written.
 * With `build`, a theme with no build yet is built now; without it,
 * `unbuilt` says so and the caller builds it once every check has passed
 * ({@link buildWorn}).
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {{build?: boolean}} [opts]
 * @returns {Promise<{name: string, module: string, css: string[], mode: 'system' | 'light' | 'dark', unbuilt?: boolean} | null>}
 */
async function routeTheme(cwd, dir, data, opts = {}) {
  if (!data.theme) return null;
  const t = loadTheme(cwd, data.theme);
  const ctx = await context(cwd);
  const unbuilt = !fs.existsSync(themeFiles(cwd, data.theme).js);
  if (unbuilt && opts.build !== false) await buildTheme(ctx, data.theme, t);
  const ti = themeImports(ctx, data.theme, t, dir);
  return {
    name: data.theme,
    module: ti.module,
    css: ti.css,
    mode: ti.mode,
    ...(unbuilt && opts.build === false ? {unbuilt: true} : {}),
  };
}

/**
 * Run `fn` under a theme's lock when the command was given one (the
 * adapter's `lockTheme`), else as it is.
 * @param {any} options
 * @param {string} slug
 * @param {() => unknown} fn
 */
async function themeLocked(options, slug, fn) {
  if (typeof options?.lockTheme === 'function')
    await options.lockTheme(slug, async () => fn());
  else fn();
}

/**
 * Build the theme a preview wears when it has no build yet, holding that
 * theme's lock (an `editor set` on it waits), with a note: a preview
 * command writes the theme's build only once every check has passed.
 * @param {string} cwd
 * @param {{name: string, unbuilt?: boolean} | null} theme from {@link routeTheme}
 * @param {any} options the command's options, with `lockTheme` from the adapter
 * @param {string[]} notes
 */
async function buildWorn(cwd, theme, options, notes) {
  if (!theme?.unbuilt) return;
  const slug = theme.name;
  const build = async () => {
    if (fs.existsSync(themeFiles(cwd, slug).js)) return;
    await buildTheme(await context(cwd), slug, loadTheme(cwd, slug));
  };
  await (typeof options?.lockTheme === 'function'
    ? options.lockTheme(slug, build)
    : build());
  notes.push(
    `built ${shown(cwd, themeFiles(cwd, slug).dir)}/ first: its build was missing`,
  );
}

/** The Colors page: its id and file, relative to the route folder. */
const COLORS_PAGE = wordTable({
  id: 'colors',
  label: 'Colors',
  file: `${PAGES_DIR}/colors`,
});

/**
 * The Colors page source of a theme, and whether the theme has generated
 * colors. The page imports the generated color module, so it follows every
 * change; the tokens that use each shade are written into it.
 * @param {string} cwd
 * @param {string} dir the route folder
 * @param {string} slug
 * @returns {Promise<{source: string, colors: boolean}>}
 */
async function colorsPage(cwd, dir, slug) {
  const data = loadTheme(cwd, slug);
  const ctx = await context(cwd);
  const pal = paletteMapping(
    cwd,
    slug,
    data,
    await baseResolved(ctx.project, data.like),
    ctx.project.core.tokenDefaults,
  );
  const file = path.join(cwd, paletteFiles(slug).palette);
  if (!pal || !fs.existsSync(file))
    return {
      source: colorsPageSource({slug, module: null, seeds: {}, uses: {}}),
      colors: false,
    };
  /** Whether the theme sets a token exactly, as a whole-theme value, in a mode. @param {string} token @param {'light' | 'dark'} m */
  const exact = (token, m) =>
    data.settings.some(
      s =>
        s.source === 'token' &&
        s.thing === token &&
        !s.on &&
        !s.when &&
        !s.state &&
        (!s.mode || s.mode === m),
    );
  /** @type {Record<string, Record<'light' | 'dark', Record<string, string[]>>>} */
  const uses = {};
  // Only the theme's own modes have shades; text on a fill is marked on
  // the neutral shade it uses, and pure black or white on no shade.
  const modes = modesOf(data);
  for (const [token, v] of Object.entries(pal.tokens)) {
    for (const m of modes) {
      if (exact(token, m)) continue;
      const r = v[m];
      if (r.family === 'black' || r.family === 'white') continue;
      const byMode = (uses[r.family ?? v.family] ??= {light: {}, dark: {}});
      (byMode[m][r.stop] ??= []).push(
        `${token}${r.alpha ? ` (opacity ${r.alpha})` : ''}`,
      );
    }
  }
  const pageDir = path.join(dir, path.dirname(COLORS_PAGE.file));
  const rel = path
    .relative(pageDir, file.replace(/\.ts$/, ''))
    .split(path.sep)
    .join('/');
  return {
    source: colorsPageSource({
      slug,
      module: rel.startsWith('.') ? rel : `./${rel}`,
      seeds: Object.fromEntries(pal.families.map(f => [f.id, f.seed])),
      uses,
    }),
    colors: true,
  };
}

/**
 * The route file and, when the preview has one, the Colors page as the
 * page list and the theme say now. With `gone`, the theme the preview wore
 * was deleted: its Colors page says the preview has no theme colors.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {{name: string, module: string, css: string[], mode?: 'system' | 'light' | 'dark'} | null} theme from {@link routeTheme}
 * @param {{gone?: string | null, by?: string}} [opts] `by`: the command named in the route's header
 * @returns {Promise<Array<{rel: string, text: string}>>}
 */
async function routeWrites(cwd, dir, data, theme, opts = {}) {
  /** @type {Array<{rel: string, text: string}>} */
  const out = [];
  const colors = data.pages.find(p => p.id === COLORS_PAGE.id);
  const rel = colors && `${colors.file}.tsx`;
  if (rel && data.files.includes(rel)) {
    if (data.theme)
      out.push({rel, text: (await colorsPage(cwd, dir, data.theme)).source});
    else if (opts.gone)
      out.push({
        rel,
        text: colorsPageSource({
          slug: opts.gone,
          module: null,
          seeds: {},
          uses: {},
        }),
      });
  }
  out.push({
    rel: 'page.tsx',
    text: previewRouteSource({pages: data.pages, theme, by: opts.by}),
  });
  return out;
}

/**
 * The theme's palette module, written as an empty stand-in when the theme
 * has no generated colors left and a kept Colors page still imports it.
 * Null when the module is there.
 * @param {string} cwd
 * @param {string} slug
 * @returns {string | null} the module, as shown
 */
function paletteStandIn(cwd, slug) {
  const file = path.join(cwd, paletteFiles(slug).palette);
  if (fs.existsSync(file)) return null;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  writeWhole(
    file,
    `${PALETTE_STAND_IN}\nexport const palette = {} as const;\n`,
  );
  return shown(cwd, file);
}

/**
 * The --path a preview command needs for a preview folder: none for the
 * default one.
 * @param {string} cwd
 * @param {string} dir
 */
function dirFlag(cwd, dir) {
  const fallback = previewDir(cwd, undefined, {optional: true})?.dir;
  return fallback === dir
    ? ''
    : ` --path ${quoteCommandArgument(shownDir(cwd, dir))}`;
}

/**
 * Rewrite the in-app preview routes of a theme when their imports changed, so
 * a font package installed after `set` loads on the next change or `show`,
 * and its Colors page, so it names the shades the tokens use now.
 * The preview in the usual place (app/ or src/app/theme-preview) and every
 * preview added with --path for the theme are kept this way. A damaged
 * preview, and a file changed by hand, are left as they are.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Promise<{changed: boolean, stale: string[]}>} `changed`: the
 *   route or the Colors page was rewritten; `stale`: preview files changed by
 *   hand, which keep showing the theme as it was
 */
export async function refreshPreviewRoute(cwd, slug) {
  const at = previewDir(cwd, undefined, {optional: true});
  const dirs = [
    ...new Set([...(at ? [at.dir] : []), ...recordedPreviews(cwd, slug)]),
  ];
  let changed = false;
  /** @type {string[]} */
  const stale = [];
  for (const dir of dirs) {
    /** @type {PreviewData | null} */
    let data;
    try {
      data = readPreview(cwd, dir);
    } catch {
      continue;
    }
    if (!data || data.theme !== slug || !data.files.includes('page.tsx'))
      continue;
    // A change stopped part way is finished by the next preview command;
    // until then the preview is left as it is, and the result says so.
    if (fs.existsSync(path.join(dir, PENDING))) {
      stale.push(
        `${shownDir(cwd, dir)}/ (a preview change was stopped part way; ${PREVIEW} add finishes it and brings the preview up to date)`,
      );
      continue;
    }
    const writes = (
      await routeWrites(cwd, dir, data, await routeTheme(cwd, dir, data))
    ).filter(w => {
      const file = confined(path.join(dir, w.rel), dir, 'a preview file');
      if (!data.files.includes(w.rel)) return false;
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === w.text)
        return false;
      if (editedByHand(dir, data, w.rel)) {
        const standIn =
          w.rel === `${COLORS_PAGE.file}.tsx` &&
          fs.readFileSync(file, 'utf8').includes(`${slug}.palette`) &&
          paletteStandIn(cwd, slug);
        stale.push(
          standIn
            ? `${shown(cwd, file)} (changed by hand, so it is kept; the theme has no generated colors now, so ${standIn}, which the page imports, holds an empty stand-in that keeps the app building. Give the page another name if you want to keep your changes, then run ${PREVIEW} add)`
            : shown(cwd, file),
        );
        return false;
      }
      return true;
    });
    // A theme that has generated colors now, under a preview with no
    // Colors page: the next add adds it.
    if (
      !data.pages.some(p => p.id === COLORS_PAGE.id) &&
      (await colorsPage(cwd, dir, slug)).colors
    )
      stale.push(
        `${shownDir(cwd, dir)}/ (${slug} has generated colors now; ${PREVIEW} add${dirFlag(cwd, dir)} adds its Colors page)`,
      );
    if (!writes.length) continue;
    commitPreview(cwd, dir, data, writes, [], `${EDITOR} show ${slug}`);
    changed = true;
  }
  return {changed, stale};
}

/**
 * Where a theme's previews are, so a preview added with --path is kept in
 * step too: themes/<theme>/previews.json, project-relative folders.
 * @param {string} cwd
 * @param {string} slug
 */
const previewsFile = (cwd, slug) =>
  path.join(themeFiles(cwd, slug).dir, 'previews.json');

/**
 * The preview folders recorded for a theme that are still inside the
 * project.
 * @param {string} cwd
 * @param {string} slug
 * @returns {string[]}
 */
function recordedPreviews(cwd, slug) {
  try {
    const list = JSON.parse(fs.readFileSync(previewsFile(cwd, slug), 'utf8'));
    return (Array.isArray(list) ? list : [])
      .map(rel => path.resolve(cwd, String(rel)))
      .filter(dir => !path.relative(cwd, dir).startsWith('..'));
  } catch {
    return [];
  }
}

/**
 * Record a preview folder for a theme, or with `keep` false forget it.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} dir
 * @param {boolean} [keep]
 */
function recordPreview(cwd, slug, dir, keep = true) {
  if (!fs.existsSync(themeFiles(cwd, slug).dir)) return;
  const rel = path.relative(cwd, dir).split(path.sep).join('/');
  const list = recordedPreviews(cwd, slug)
    .map(d => path.relative(cwd, d).split(path.sep).join('/'))
    .filter(x => x !== rel);
  if (keep) list.push(rel);
  const file = previewsFile(cwd, slug);
  if (list.length) writeWhole(file, `${JSON.stringify(list, null, 2)}\n`);
  else fs.rmSync(file, {force: true});
}

/**
 * How to open the preview, from where it is.
 * @param {string} cwd
 * @param {{dir: string, app: string | null}} at
 */
function openLine(cwd, at) {
  // The routes folder by place, also one this command has just made.
  const app =
    at.app ??
    [path.join(cwd, 'app'), path.join(cwd, 'src', 'app')].find(r =>
      at.dir.startsWith(r + path.sep),
    );
  if (app) {
    // A (group) folder is not part of the URL; a [param] folder is a value
    // the person picks; each other folder is one URL segment, encoded.
    const segs = urlSegments(app, at.dir);
    const params = segs.filter(seg => /^\[.+\]$/.test(seg));
    const url = segs
      .map(seg =>
        /^\[.+\]$/.test(seg)
          ? `<${seg.replace(/^\[+\.*|\]+$/g, '')}>`
          : encodeURIComponent(seg),
      )
      .join('/');
    const base = nextBasePath(cwd);
    return `open ${base ?? ''}/${url} in the running app${params.length ? `, with a value for ${params.join(', ')}` : ''}${base == null ? ', after the basePath next.config sets from code (it goes in front)' : ''}`;
  }
  const routes = ['app', path.join('src', 'app')].filter(r =>
    fs.existsSync(path.join(cwd, r)),
  );
  if (routes.length)
    return `the preview is in ${shownDir(cwd, at.dir)}/, outside the app's routes folder (${routes[0].split(path.sep).join('/')}/), so the app does not serve it: put it there with --path ${routes[0].split(path.sep).join('/')}/theme-preview`;
  return `no app routes folder (app/ or src/app/) was found, so the preview is in ${shownDir(cwd, at.dir)}/; serve page.tsx from a route of your app, or make a starter app around a preview with ${PREVIEW} app <dir>`;
}

/**
 * Why a template page was skipped.
 * @param {{missingPackages: string[], notInstalled: string[], stylexCompiler: boolean}} s
 */
function skipReason(s) {
  return [
    ...(s.missingPackages.length
      ? [`needs ${s.missingPackages.join(', ')}`]
      : []),
    ...(s.notInstalled.length
      ? [
          `needs ${s.notInstalled.join(', ')}, which the app's package.json names but is not installed`,
        ]
      : []),
    ...(s.stylexCompiler
      ? [
          'uses StyleX, and this app has no StyleX compiler (astryx docs styling-overview)',
        ]
      : []),
  ].join(' and ');
}

/**
 * The page templates for a description, best first, each with why: the
 * build ranking's picks, then the template search's, so a page the app
 * cannot show has a next match. App frames (the Shell templates) are left
 * out: the preview is an app shell already, and `--template` can still name
 * one. The closest page is added even when it is not exactly the page asked
 * for, with a note; only a description no page relates to is refused, with
 * the closest pages to name instead, and nothing is written.
 * @param {string} words
 * @param {string} cwd
 * @param {string[]} notes notes for the result
 * @param {string} flags the caller's other flags, for the suggestions
 * @returns {Promise<Array<{name: string, displayName: string, why: string}>>}
 */
async function rankedPages(words, cwd, notes, flags) {
  const kit =
    /** @type {import('../build/build.type.mjs').BuildKitResponse} */ (
      await build(words, {cwd})
    );
  const start = kit.data.start;
  const listed = await pageTemplates(cwd);
  const frames = new Set(
    listed.filter(t => /^Shell\b/.test(t.category ?? '')).map(t => t.id),
  );
  const found = /** @type {any} */ (
    await search(words, {cwd, type: 'template', limit: 20})
  ).data.results.filter((/** @type {any} */ r) => r.kind === 'page');
  /** @type {Map<string, string>} */
  const matchedWords = new Map(
    found.map((/** @type {any} */ r) => [
      r.name,
      String(r.reason ?? '').replace(/^matches \d+\/\d+ terms: /, ''),
    ]),
  );
  // A description that is a template's id or display name names it.
  const plain = (/** @type {string} */ x) =>
    x
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const exact = listed.find(
    t => plain(t.id) === plain(words) || plain(t.name ?? '') === plain(words),
  )?.id;
  if (exact && frames.has(exact))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${exact} is an app frame, not a page, so a description does not add it; name it with --template to add it as a page anyway.`,
      {run: [`${PREVIEW} add --template ${exact}${flags}`]},
    );
  // Build's page ranking, when build picked no page itself (it fell back to
  // a frame): its pages the description names (by name, keyword or docs,
  // or a word of it in the page's id), best score first; on a tie, a page whose id holds a word of the
  // description goes first.
  const said = plain(words)
    .split(' ')
    .filter(w => w.length > 2);
  const byId = (/** @type {string} */ id) =>
    said.some(w => id.split('-').includes(w)) ? 1 : 0;
  const fellBack =
    !start || (start.basis === 'fallback' && frames.has(start.name));
  const ranked = (fellBack ? [...(kit.data.pages ?? [])] : [])
    .map((r, i) => ({
      name: r.name,
      score: Number(r.score) || 0,
      reason: String(r.reason ?? ''),
      i,
    }))
    .filter(
      r =>
        listed.some(t => t.id === r.name) &&
        (/^(exact name|name|keyword|docs mention|description mentions)\b/.test(
          r.reason,
        ) ||
          r.score >= 100 ||
          byId(r.name)),
    )
    .sort(
      (a, b) => b.score - a.score || byId(b.name) - byId(a.name) || a.i - b.i,
    )
    .map(r => r.name);
  for (const r of kit.data.pages ?? [])
    if (!matchedWords.has(r.name))
      matchedWords.set(
        r.name,
        String(r.reason ?? '').replace(/^matches \d+\/\d+ terms: /, ''),
      );
  const names = [
    ...(exact ? [exact] : []),
    ...ranked,
    ...(start ? [start.name, ...start.alternatives.map(a => a.name)] : []),
    ...found.map((/** @type {any} */ r) => r.name),
  ].filter((n, i, a) => a.indexOf(n) === i);
  const skippedFrames = names.filter(n => frames.has(n));
  const pages = names.filter(n => !frames.has(n));
  /** @param {string} name */
  const label = name => listed.find(t => t.id === name)?.name ?? name;
  const suggest = (/** @type {string[]} */ list) =>
    list.slice(0, 3).map(n => `${PREVIEW} add --template ${n}${flags}`);
  // With no page close, a few pages that need nothing more, and the list.
  const fallback = [
    ...suggest(
      ['dashboard', 'settings', 'login'].filter(id =>
        listed.some(t => t.id === id),
      ),
    ),
    'astryx template --list --type page',
  ];
  // No page relates when the ranking fell back to a frame with no direct
  // match, and no page the search found matches three words of the request
  // or two fifths of them.
  const termsMatched = (/** @type {any} */ r) => {
    const m = /^matches (\d+)\/(\d+)/.exec(String(r.reason ?? ''));
    if (!m) return 0;
    const [hit, of] = [Number(m[1]), Number(m[2])];
    return hit >= 3 || hit / of >= 0.4 ? hit : 0;
  };
  // A page the description names in a phrase (a blog post, an issue
  // tracker) always relates.
  const named = APP_PAGES.some(([re]) => re.test(words.toLowerCase()));
  const unrelated =
    !named &&
    !exact &&
    !ranked.some(n => !frames.has(n)) &&
    (!pages.length ||
      (start &&
        start.basis === 'fallback' &&
        frames.has(start.name) &&
        !kit.data.directMatch &&
        !found.some(
          (/** @type {any} */ r) => !frames.has(r.name) && termsMatched(r) >= 2,
        )));
  if (unrelated)
    refuse(
      E.ERR_NOT_FOUND,
      `No page template relates to "${words}". Name a page to add it anyway.`,
      {
        run: pages.length
          ? [...suggest(pages), 'astryx template --list --type page']
          : fallback,
      },
    );
  if (skippedFrames.length)
    notes.push(
      `left out ${skippedFrames.join(', ')}: app frames, not pages (add one with --template <id>)`,
    );
  const closest = start && start.basis === 'closest';
  const text = words.toLowerCase();
  // An app the description names (an app screenshot, an issue tracker, a
  // board) shows its theme better than a hero, so a page for it goes first.
  const exists = (/** @type {string} */ id) =>
    listed.some(t => t.id === id) && !frames.has(id);
  const app = APP_PAGES.find(([re, ids]) => re.test(text) && ids.some(exists));
  // A hero described as left-aligned or split takes the side layout.
  const side =
    /\bleft[- ]aligned\b|\bsplit\b|\bside[- ]by[- ]side\b|\basymmetric/.test(
      text,
    ) &&
    pages[0] !== 'side-gallery' &&
    /hero|landing/.test(text);
  /** @type {Map<string, string>} */
  const reasons = new Map();
  if (app) {
    // The ranked page stays first when it already serves the app named;
    // the app's pages come next, in order, so the next one is taken when
    // one cannot be shown here.
    const named = /** @type {RegExpExecArray} */ (app[0].exec(text))[0];
    const keep = app[1].includes(pages[0]) ? pages[0] : null;
    const ids = app[1].filter(id => exists(id) && id !== keep);
    for (const id of [...ids].reverse()) {
      if (pages.includes(id)) pages.splice(pages.indexOf(id), 1);
      pages.splice(keep ? 1 : 0, 0, id);
    }
    if (keep)
      reasons.set(
        keep,
        `the description names ${named}, and this page is that app`,
      );
    ids.forEach((id, k) =>
      reasons.set(
        id,
        k === 0 && !keep
          ? `the description names ${named}, and this page is made for that`
          : `the next page for ${named}`,
      ),
    );
  } else if (side && listed.some(t => t.id === 'side-gallery')) {
    if (pages.includes('side-gallery'))
      pages.splice(pages.indexOf('side-gallery'), 1);
    pages.unshift('side-gallery');
    reasons.set(
      'side-gallery',
      'the description asks for a left-aligned or split hero, and this hero puts the copy beside the picture',
    );
  }
  if (/\btop[- ]?nav|\bnav ?bar|\bnavigation bar|\bheader nav/.test(text))
    notes.push(
      'no page has a top nav of its own: the preview frame has one, and your app keeps its own',
    );
  return pages.map((name, i) => {
    const words = matchedWords.get(name);
    const doc = listed.find(t => t.id === name)?.description ?? '';
    const shape = doc.split(/(?<=\.)\s/)[0];
    const reason = reasons.get(name);
    return {
      name,
      displayName: label(name),
      why: reason
        ? `${reason}${words ? `; it covers ${words}` : ''}. ${shape}`
        : i === 0 && closest && name !== exact
          ? `the closest page, not exactly the one described${words ? `: it covers ${words}` : ''}; the rest of the description is not on it. ${shape}`
          : `${i === 0 ? 'the best match' : 'the next match'}${words ? `: it covers ${words}` : ''}. ${shape}`,
    };
  });
}

/**
 * App pages for the apps a description names, best first. Each is matched
 * by a phrase, never one loose word, so "buy tickets" is not an issue
 * tracker and "an AI tool" is not a chat. A detail view comes before its
 * list.
 * @type {Array<[RegExp, string[]]>}
 */
const APP_PAGES = [
  [
    /\b(issue|ticket|bug|task|work[- ]item) (detail|details|view|page)\b/,
    ['work-item-detail', 'detail-page'],
  ],
  [
    /\b(issue[- ]?tracker|bug[- ]tracker|issue (list|table|queue|board)|ticket(ing)? (system|queue|tracker)|backlog)\b/,
    ['table-grouped', 'table'],
  ],
  [/\b(kanban|task board|project board)\b/, ['kanban-board']],
  [/\b(analytics )?dashboard\b|\banalytics (app|page|view)\b/, ['dashboard']],
  [
    /\b(email|mail) (inbox|client|app)\b|\binbox (app|view|page)\b/,
    ['table-inbox'],
  ],
  [
    /\b(chat (app|interface|ui|window|screen|view)|chatbot|ai (chat|assistant) (app|interface|ui))\b/,
    ['ai-chat'],
  ],
  [/\b(settings|preferences) (page|screen|panel|view)\b/, ['settings']],
  [/\b(docs|documentation) (site|page|portal)\b/, ['documentation']],
  [/\b(data ?table|spreadsheet|data grid)\b/, ['table']],
  [
    /\b(blog( post)?|article|news (story|article|page)|essay|long[- ]read)\b/,
    ['documentation-design', 'course-detail'],
  ],
  [
    /\b(app|product) (screenshot|window|preview|ui)\b/,
    ['table-grouped', 'dashboard', 'table'],
  ],
];

/**
 * The page templates this project has, with their display names.
 * @param {string} cwd
 * @returns {Promise<Array<{id: string, name: string, category?: string, description?: string}>>}
 */
async function pageTemplates(cwd) {
  return /** @type {any} */ (
    (await template(undefined, {list: true, type: 'page', cwd})).data
  );
}

/**
 * Whether a package is installed for the project: its folder is in a
 * node_modules/ of the project or above it. A package the package.json
 * names but nobody installed does not count.
 * @param {string} cwd
 * @param {string} pkg
 */
function installed(cwd, pkg) {
  return findNodeModulesPackage(cwd, pkg) != null;
}

/**
 * The folder of the nearest package.json over `dir`, up to `cwd`.
 * @param {string} cwd
 * @param {string} dir
 */
function appRootOf(cwd, dir) {
  for (let at = dir; at.startsWith(cwd + path.sep); at = path.dirname(at))
    if (fs.existsSync(path.join(at, 'package.json'))) return at;
  return cwd;
}

/**
 * What a template page needs that the app lacks, from its real imports:
 * packages the app's package.json does not name (with the command that
 * adds them), packages it names that are not installed (with the install
 * command), and a StyleX compiler.
 * @param {string} cwd
 * @param {string} source
 */
function pageNeeds(cwd, source) {
  const pkgs = [...extractImportedPackages(source)];
  const needs = analyzeTemplateNeeds(source, cwd);
  /** @type {Record<string, string>} */
  let declared = {};
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
    );
    declared = {
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
  } catch {
    // No readable package.json: nothing is declared.
  }
  const absent = pkgs.filter(
    p =>
      !needs.missingPackages.includes(p) &&
      !/^(react|react-dom|next)$/.test(p) &&
      !p.startsWith('@astryxdesign/') &&
      !installed(cwd, p),
  );
  const notInstalled = absent.filter(p => p in declared);
  const undeclared = absent.filter(p => !(p in declared));
  const missingPackages = [...needs.missingPackages, ...undeclared];
  const commands = [
    ...(needs.installCommand
      ? [[needs.installCommand, ...undeclared].join(' ')]
      : undeclared.length
        ? [installLine(cwd, undeclared)]
        : []),
    ...(notInstalled.length ? [installCommandOf(cwd)] : []),
  ];
  return {
    missingPackages,
    notInstalled,
    installCommand: commands.length ? commands.join(' && ') : null,
    noCommand: needs.missingPackages.length > 0 && !needs.installCommand,
    stylexCompiler:
      pkgs.includes('@stylexjs/stylex') &&
      detectStylingSystem(cwd) !== 'stylex',
  };
}

/** The command that installs what the package.json names. @param {string} cwd */
function installCommandOf(cwd) {
  // The package manager `installLine` names, with its install verb.
  return installLine(cwd, []).trim().replace(/ add$/, ' install');
}

/**
 * The settings of the theme a preview wears, or a refusal that names the
 * themes there are: the closest editor theme by name, or for a package
 * theme (the base themes) what to do instead.
 * @param {string} cwd
 * @param {string} slug
 * @param {(theme: string | null) => string} again the command with this --theme (null: none)
 * @param {string} without what leaving --theme out does
 */
function wornTheme(cwd, slug, again, without) {
  try {
    return loadTheme(cwd, slug);
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    // A theme that is there but does not load is its own refusal.
    if (code === E.ERR_THEME_INVALID || code === E.ERR_THEME_LOAD) throw e;
    const name = String(slug)
      .trim()
      .toLowerCase()
      .replace(/^@astryxdesign\/theme-/, '')
      .replace(/^\.?\/?themes\//, '')
      .replace(/\/+$/, '');
    const themes = editedThemes(cwd);
    if (!themes.includes(name) && isPackageTheme(cwd, name)) {
      const missing =
        name !== 'neutral' && !installed(cwd, `@astryxdesign/theme-${name}`);
      refuse(
        E.ERR_UNKNOWN_THEME,
        `${slug} is a package theme, not a theme made by ${EDITOR}; ${without}.`,
        {
          run: [
            again(null),
            ...(missing
              ? [
                  `${installLine(cwd, [`@astryxdesign/theme-${name}`])}  # then a theme of your own can start from it`,
                ]
              : []),
            `${EDITOR} new ${usableNewName(cwd, `my-${name}`)} --like ${name}  # a theme of your own that starts from it`,
          ],
        },
      );
    }
    const near = themes.includes(name) ? [name] : nearest(name, themes);
    if (near.length)
      refuse(
        E.ERR_UNKNOWN_THEME,
        `There is no theme "${slug}" under themes/.`,
        {run: near.map(n => again(n))},
      );
    throw e;
  }
}

/**
 * Whether a name is a theme package: the neutral base, or an installed
 * `@astryxdesign/theme-<name>`.
 * @param {string} cwd
 * @param {string} name
 */
function isPackageTheme(cwd, name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return false;
  // The base themes ship with the CLI, installed or not.
  const bases = fs.existsSync(BASE_THEMES)
    ? fs.readdirSync(BASE_THEMES)
    : ['neutral'];
  return bases.includes(name) || installed(cwd, `@astryxdesign/theme-${name}`);
}

/** The base themes this CLI knows, one folder each. */
const BASE_THEMES = path.join(CLI_PACKAGE, 'assets', 'templates', 'themes');

/**
 * The page template `--template` names, or a refusal: a block or component
 * example is not a page, and the suggestions are page templates only, as
 * commands.
 * @param {string} cwd
 * @param {string} id
 * @param {string} flags the caller's other flags
 * @returns {Promise<{name: string, displayName: string, why: string}>}
 */
async function namedTemplate(cwd, id, flags) {
  const pages = await pageTemplates(cwd);
  // Page ids are lowercase: LOGIN names login.
  const hit =
    pages.find(t => t.id === id) ?? pages.find(t => t.id === id.toLowerCase());
  if (hit)
    return {
      name: hit.id,
      displayName: hit.name ?? hit.id,
      why: 'named with --template',
    };
  try {
    const shownTemplate =
      /** @type {import('../template/template.type.mjs').TemplateShowResponse} */ (
        await template(id, {cwd, type: 'page'})
      );
    const name = shownTemplate.data.template;
    return {
      name,
      displayName: pages.find(t => t.id === name)?.name ?? name,
      why: 'named with --template',
    };
  } catch (e) {
    if (/** @type {any} */ (e)?.code !== E.ERR_UNKNOWN_TEMPLATE) throw e;
  }
  const all = /** @type {Array<{id: string, type: string}>} */ (
    /** @type {any} */ (await template(undefined, {list: true, cwd})).data
  );
  const other = all.find(t => t.id === id);
  const near = nearest(
    id.toLowerCase(),
    pages.map(t => t.id),
    5,
  );
  refuse(
    E.ERR_UNKNOWN_TEMPLATE,
    other
      ? `${id} is a ${other.type} template, not a page; preview add takes page templates.`
      : `There is no page template "${id}".`,
    {
      run: [
        ...near.map(n => `${PREVIEW} add --template ${n}${flags}`),
        'astryx template --list --type page',
      ],
    },
  );
}

/**
 * The text of a recorded page written again: a default page, or the page
 * template its id names when the app can show it; else null.
 * @param {string} cwd
 * @param {string} id
 * @param {(id: string) => Promise<{text: string}>} defaultPage
 * @returns {Promise<string | null>}
 */
async function pageAgain(cwd, id, defaultPage) {
  if (id === 'overview' || id === 'components')
    return (await defaultPage(id)).text;
  try {
    const shownTemplate =
      /** @type {import('../template/template.type.mjs').TemplateShowResponse} */ (
        await template(id, {cwd, type: 'page'})
      );
    const source = shownTemplate.data.source;
    const needs = pageNeeds(cwd, source);
    if (
      needs.missingPackages.length ||
      needs.notInstalled.length ||
      needs.stylexCompiler
    )
      return null;
    return source;
  } catch {
    return null;
  }
}

/**
 * Add pages to the in-app theme preview, and write the preview route the
 * first time. With a description, the build ranking picks the template
 * pages that fit it best (`top` of them); `template` names one instead.
 * With neither, the default pages: the sample app page, every component,
 * and the theme's generated colors when it has any.
 * Every check runs before the first write, so a refusal changes nothing;
 * the files are staged and renamed into place together.
 * @experimental
 * @param {string} [description]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAddOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAddResponse>}
 */
export async function themeEditPreviewAdd(description, options = {}) {
  return reportingRecovery(box => addPreview(description, options, box));
}

/**
 * Run a preview command that may first finish a change stopped part way:
 * a refusal after that says what the recovery wrote, in place of "Nothing
 * was changed".
 * @template T
 * @param {(box: {note: string | null}) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function reportingRecovery(fn) {
  /** @type {{note: string | null}} */
  const box = {note: null};
  try {
    return await fn(box);
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (box.note && typeof err?.message === 'string' && err.code)
      err.message = err.message.replace(
        /Nothing was changed\.$/,
        `Before that, it ${box.note}; nothing else was changed.`,
      );
    throw e;
  }
}

/**
 * {@link themeEditPreviewAdd}, with the note of a recovery in `box`.
 * @param {string | undefined} description
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAddOptions} options
 * @param {{note: string | null}} box
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAddResponse>}
 */
async function addPreview(description, options, box) {
  const {cwd = process.cwd()} = options;
  if (isOutsideProject(cwd))
    refuse(
      E.ERR_PROJECT_REQUIRED,
      'No package.json here, so there is no app to put the preview in.',
      {
        run: [
          `${PREVIEW} add  # run in your app`,
          `${PREVIEW} app <dir>  # a new starter app with the preview in it`,
        ],
      },
    );
  const pf =
    options.path != null ? ` --path ${quoteCommandArgument(options.path)}` : '';
  const tf =
    options.theme != null
      ? ` --theme ${quoteCommandArgument(options.theme)}`
      : '';
  // A default page's id (overview, components, colors), as `remove` takes
  // it, asks for the default pages back: the same as a bare add.
  const DEFAULT_IDS = ['overview', 'components', COLORS_PAGE.id];
  const isDefault = (/** @type {unknown} */ v) =>
    typeof v === 'string' && DEFAULT_IDS.includes(v.trim().toLowerCase());
  // Beside another page asked for, it is refused below (drop one).
  const blank = (/** @type {unknown} */ v) => v == null || !String(v).trim();
  const askedId = [description, options.template]
    .find(isDefault)
    ?.trim()
    .toLowerCase();
  const again =
    askedId != null &&
    (blank(description) || isDefault(description)) &&
    (blank(options.template) || isDefault(options.template));
  if (again) {
    description = undefined;
    options = {...options, template: undefined};
  }
  const said = (description ?? '').trim();
  const named =
    options.template == null ? null : String(options.template).trim();
  if (named === '')
    refuse(E.ERR_INVALID_ARGUMENT, '--template needs a page template id.', {
      run: [
        `${PREVIEW} add --template dashboard${tf}${pf}`,
        'astryx template --list --type page',
      ],
    });
  if (said && named != null)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      '--template names the page; a description asks the ranking to pick one, so drop one of them.',
      {
        run: [
          `${PREVIEW} add --template ${quoteCommandArgument(named)}${tf}${pf}`,
          `${PREVIEW} add ${quoteCommandArgument(said)}${tf}${pf}`,
        ],
      },
    );
  const top = options.top == null ? 1 : Number(String(options.top));
  if (options.top != null && !/^[1-3]$/.test(String(options.top)))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--top takes 1, 2 or 3, not "${String(options.top)}".`,
      {
        run: [
          `${PREVIEW} add ${quoteCommandArgument(said || 'a sales dashboard')} --top 2${tf}${pf}`,
        ],
      },
    );
  if (options.top != null && !said)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      named != null
        ? '--top says how many ranked pages to add; --template names one page, so drop --top.'
        : '--top says how many pages to add for a description, and there is none.',
      {
        run: [
          named != null
            ? `${PREVIEW} add --template ${quoteCommandArgument(named)}${tf}${pf}`
            : `${PREVIEW} add 'a sales dashboard' --top ${String(options.top)}${tf}${pf}`,
        ],
      },
    );
  /** @type {string[]} */
  const notes = [];
  let words = said;
  const allWords = said ? said.split(/\s+/) : [];
  if (allWords.length > MAX_WORDS) {
    const seen = new Set();
    words = allWords
      .filter(w => {
        const k = w.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, MAX_WORDS)
      .join(' ');
    notes.push(
      `the description has ${allWords.length} words; the first ${MAX_WORDS} different ones picked the page`,
    );
  }
  const retry = (/** @type {string | null} */ p) =>
    `${PREVIEW} add${said ? ` ${quoteCommandArgument(said)}` : ''}${named != null ? ` --template ${quoteCommandArgument(named)}` : ''}${tf}${p == null ? '' : ` --path ${quoteCommandArgument(p)}`}`;
  const at = previewDir(cwd, options.path, {write: true, retry});
  const recovered = recoverPreview(cwd, at.dir);
  if (recovered) notes.push(recovered);
  const unstyled = coreStylesheetMissing(cwd, at);
  if (unstyled) notes.push(unstyled);
  notes.push(...nextConfigNotes(cwd));
  box.note = recovered;
  const existing = readPreview(cwd, at.dir, pf);
  /** @type {PreviewData} */
  const data = existing ?? {version: 1, theme: null, pages: [], files: []};
  // The folders over a new preview folder that are not there yet: the first
  // add makes them, and remove takes them away again when they are empty.
  if (!existing) {
    let made = 0;
    for (
      let up = path.dirname(at.dir);
      up.startsWith((at.app ?? cwd) + path.sep) && !fs.existsSync(up);
      up = path.dirname(up)
    )
      made++;
    if (made) data.parents = made;
  }
  const wore = data.theme;
  const againWith = (/** @type {string | null} */ t) =>
    `${PREVIEW} add${said ? ` ${quoteCommandArgument(said)}` : ''}${named != null ? ` --template ${quoteCommandArgument(named)}` : ''}${t == null ? '' : ` --theme ${t}`}${pf}`;
  const without = "leave out --theme and the pages wear the app's own theme";
  if (options.theme != null) {
    wornTheme(cwd, options.theme, againWith, without);
    data.theme = options.theme;
  } else if (data.theme && !fs.existsSync(themeFiles(cwd, data.theme).dir)) {
    const themes = editedThemes(cwd);
    data.theme = themes.length === 1 ? themes[0] : null;
    notes.push(
      `the preview wore ${wore}, which is gone; it now wears ${data.theme ?? "the app's own theme"}`,
    );
  } else if (!data.theme) {
    const themes = editedThemes(cwd);
    data.theme = themes.length === 1 ? themes[0] : null;
    if (themes.length > 1)
      notes.push(
        `${themes.length} themes under themes/ (${themes.join(', ')}): the pages wear the app's own theme; pass --theme ${themes[0]} to wear one`,
      );
  }
  if (data.theme) wornTheme(cwd, data.theme, againWith, without);
  const switched = existing != null && wore !== data.theme;
  const gone =
    wore && !data.theme && !fs.existsSync(themeFiles(cwd, wore).dir)
      ? wore
      : null;
  if (switched && !gone)
    notes.push(
      `the preview now wears ${data.theme ?? "the app's own theme"} (was ${wore ?? "the app's own theme"}), so its pages are written again`,
    );
  const project = await openProject(cwd);
  // Whether the preview has, or gets with a bare add, a Colors page.
  const hasColors = async () =>
    data.pages.some(p => p.id === COLORS_PAGE.id) ||
    (data.theme != null &&
      fs.existsSync(themeFiles(cwd, data.theme).dir) &&
      (await colorsPage(cwd, at.dir, data.theme)).colors);
  /** @param {string} id */
  const defaultPage = async id =>
    id === 'overview'
      ? {
          id,
          label: 'Overview',
          text: overviewPageSource(project, {
            theme: data.theme,
            colors: await hasColors(),
          }),
        }
      : {
          id,
          label: 'Components',
          text: componentsPageSource(project, {
            theme: data.theme,
            C: (await context(cwd)).C,
          }).source,
        };
  /** @type {Array<{id: string, label: string, text: string}>} */
  const add = [];
  /** @type {Array<{page: string, reason: string, installCommand: string | null}>} */
  const skipped = [];
  /** @type {Array<{page: string, why: string}>} */
  const matched = [];
  /** @type {string[]} */
  const runs = [];
  let stylexSkipped = false;
  let firstSkipped = false;
  const explicit = named != null;
  if (!words && !explicit) {
    add.push(await defaultPage('overview'), await defaultPage('components'));
    if (data.theme) {
      const colors = await colorsPage(cwd, at.dir, data.theme);
      if (colors.colors)
        add.push({
          id: COLORS_PAGE.id,
          label: COLORS_PAGE.label,
          text: colors.source,
        });
    }
  } else {
    const flags = `${tf}${pf}`;
    const picks = explicit
      ? [await namedTemplate(cwd, /** @type {string} */ (named), flags)]
      : await rankedPages(words, cwd, notes, flags);
    for (const [i, pick] of picks.entries()) {
      if (add.length >= (explicit ? 1 : top)) break;
      const shownTemplate =
        /** @type {import('../template/template.type.mjs').TemplateShowResponse} */ (
          await template(pick.name, {cwd, type: 'page'})
        );
      const source = shownTemplate.data.source;
      // Packages are the app's: the nearest package.json over the preview
      // (in a workspace, the app's own, not the root's).
      const needs = pageNeeds(appRootOf(cwd, at.dir), source);
      // A StyleX page calls stylex.create when its module loads, so without
      // a StyleX compiler it breaks the whole route.
      const needsCompiler = needs.stylexCompiler;
      if (
        needs.missingPackages.length ||
        needs.notInstalled.length ||
        needsCompiler
      ) {
        const installCommand = needs.installCommand;
        skipped.push({
          page: pick.name,
          reason: `${skipReason({
            missingPackages: needs.missingPackages,
            notInstalled: needs.notInstalled,
            stylexCompiler: needsCompiler,
          })}${needs.noCommand ? ' (the app has more than one lockfile, so install it with the package manager you use)' : ''}`,
          installCommand,
        });
        if (installCommand) runs.push(installCommand);
        if (needsCompiler) stylexSkipped = true;
        if (i === 0) firstSkipped = true;
        continue;
      }
      add.push({id: pick.name, label: pick.displayName, text: source});
      matched.push({page: pick.name, why: pick.why});
    }
  }
  for (const s of skipped)
    notes.push(
      `the ${s.page} page was not added: it ${s.reason}${s.installCommand ? `; ${s.installCommand}, then add it again` : ''}`,
    );
  if (firstSkipped && add.length && !explicit)
    notes.push(`added ${add.map(a => a.id).join(', ')} in its place`);
  if (!add.length)
    refuse(
      E.ERR_DEP_MISSING,
      `No page was added: ${skipped.map(s => `the ${s.page} page ${s.reason}`).join('; ')}.`,
      {
        run: [
          ...new Set(runs),
          ...(stylexSkipped
            ? ['astryx docs styling-overview  # how to add a StyleX compiler']
            : []),
          `${PREVIEW} add${tf}${pf}  # the default pages, which need nothing more`,
        ],
      },
    );
  if (switched)
    for (const id of ['overview', 'components'])
      if (data.pages.some(p => p.id === id) && !add.some(a => a.id === id))
        add.push(await defaultPage(id));

  // The plan: every check below runs before the first write.
  const free = (() => {
    const base = path.basename(at.dir) || 'theme-preview';
    let n = 2;
    while (fs.existsSync(path.join(path.dirname(at.dir), `${base}-${n}`))) n++;
    return shown(cwd, path.join(path.dirname(at.dir), `${base}-${n}`));
  })();
  const elsewhere = retry(free);
  const move = movedPages(cwd, at.dir, data);
  /** @type {Map<string, {rel: string, text: string, keepHash?: boolean}>} */
  const writes = new Map(move.writes.map(w => [w.rel, w]));
  /** @type {string[]} */
  const added = [];
  /** Pages that were there already and are written again. @type {string[]} */
  const refreshed = [];
  for (const page of add) {
    const rel = `${PAGES_DIR}/${page.id}.tsx`;
    const w = {rel, text: page.text};
    if (!move.moved.includes(page.id))
      checkWrite(cwd, at.dir, data, w, elsewhere);
    writes.set(rel, w);
    if (!data.files.includes(rel)) data.files.push(rel);
    const had = data.pages.find(x => x.id === page.id);
    // A recorded page whose file is gone is added back, not refreshed.
    if (!had || !fs.existsSync(path.join(at.dir, rel))) {
      if (had) {
        had.label = page.label;
        added.push(page.id);
        continue;
      }
      data.pages.push({
        id: page.id,
        label: page.label,
        file: `${PAGES_DIR}/${page.id}`,
      });
      added.push(page.id);
    } else {
      had.label = page.label;
      refreshed.push(page.id);
    }
  }
  // A recorded page whose file is gone is written again (a default page,
  // or the template its id names), or else left out of the nav, so the
  // route never imports a missing file.
  /** @type {string[]} */
  const rewrote = [];
  /** @type {string[]} */
  const dropped = [];
  for (const p of [...data.pages]) {
    const rel = `${p.file}.tsx`;
    if (writes.has(rel) || fs.existsSync(path.join(at.dir, rel))) continue;
    if (
      p.id === COLORS_PAGE.id &&
      data.files.includes(rel) &&
      (data.theme || gone)
    )
      continue;
    const text = data.files.includes(rel)
      ? await pageAgain(cwd, p.id, defaultPage)
      : null;
    if (text != null) {
      const to = `${PAGES_DIR}/${p.id}.tsx`;
      const w = {rel: to, text};
      checkWrite(cwd, at.dir, data, w, elsewhere);
      writes.set(to, w);
      data.files = data.files.filter(f => f !== rel);
      if (!data.files.includes(to)) data.files.push(to);
      p.file = `${PAGES_DIR}/${p.id}`;
      rewrote.push(p.id);
    } else {
      data.pages = data.pages.filter(x => x !== p);
      data.files = data.files.filter(f => f !== rel);
      dropped.push(p.id);
    }
  }
  if (rewrote.length)
    notes.push(
      `wrote ${rewrote.join(', ')} again: ${rewrote.length > 1 ? 'their files were' : 'its file was'} gone`,
    );
  if (dropped.length)
    notes.push(
      `left ${dropped.join(', ')} out of the nav: ${dropped.length > 1 ? 'their files were' : 'its file was'} gone, and the preview cannot write ${dropped.length > 1 ? 'them' : 'it'} again`,
    );
  if (!data.files.includes('page.tsx'))
    checkWrite(cwd, at.dir, data, {rel: 'page.tsx', text: '\0'}, elsewhere);
  const theme = await routeTheme(cwd, at.dir, data, {build: false});
  for (const w of await routeWrites(cwd, at.dir, data, theme, {gone})) {
    if (!writes.has(w.rel)) checkWrite(cwd, at.dir, data, w, elsewhere);
    writes.set(w.rel, w);
    if (!data.files.includes(w.rel)) data.files.push(w.rel);
  }
  // Every recorded page this command writes again is named, the Colors page
  // the route writes included.
  for (const p of data.pages)
    if (
      writes.has(`${p.file}.tsx`) &&
      !added.includes(p.id) &&
      !refreshed.includes(p.id) &&
      !rewrote.includes(p.id) &&
      fs.existsSync(path.join(at.dir, `${p.file}.tsx`)) &&
      fs.readFileSync(path.join(at.dir, `${p.file}.tsx`), 'utf8') !==
        writes.get(`${p.file}.tsx`)?.text
    )
      refreshed.push(p.id);
  await buildWorn(cwd, theme, options, notes);
  commitPreview(
    cwd,
    at.dir,
    data,
    [...writes.values()],
    move.deletes,
    retry(options.path ?? null),
  );
  tidyPageFolders(at.dir);
  if (move.moved.length)
    notes.push(
      `moved ${move.moved.join(', ')} from ${LEGACY_PAGES_DIR}/ to ${PAGES_DIR}/, a folder Next never serves as a route`,
    );
  // previews.json is a theme file: written under that theme's lock, so a
  // change running on the theme never takes it back.
  if (wore && wore !== data.theme)
    await themeLocked(options, wore, () =>
      recordPreview(cwd, wore, at.dir, false),
    );
  const worn = data.theme;
  if (worn)
    await themeLocked(options, worn, () => recordPreview(cwd, worn, at.dir));
  // A font the theme names whose package the app lacks shows as the next
  // font in the stack.
  if (data.theme && fs.existsSync(themeFiles(cwd, data.theme).dir))
    try {
      const ctx = await context(cwd);
      for (const f of fontPackages(ctx, loadTheme(cwd, data.theme)))
        if (!f.installed)
          notes.push(
            `${f.family} is not installed, so the preview shows the next font in the stack in its place; install it: ${installLine(cwd, [f.pkg])}`,
          );
    } catch {
      // A theme that does not load is reported where it is used.
    }
  if (again)
    notes.push(
      `a default page's id brings back the default pages that are missing, as ${PREVIEW} add does`,
    );
  notes.push(...typeScriptNotes(cwd, at.dir, added));
  if (
    askedId === COLORS_PAGE.id &&
    !data.pages.some(p => p.id === COLORS_PAGE.id)
  )
    notes.push(
      data.theme
        ? `the Colors page shows a theme's generated colors, and ${data.theme} has none yet; it appears once it does: ${EDITOR} set ${data.theme} accent <color>`
        : `the Colors page shows a theme's generated colors, and the preview wears the app's own theme; it appears with an editor theme that has colors: ${PREVIEW} add --theme <theme>`,
    );
  return {
    type: 'themeEdit.previewAdd',
    data: {
      folder: shownDir(cwd, at.dir),
      theme: data.theme,
      added,
      refreshed,
      matched,
      skipped,
      notes,
      pages: data.pages.map(x => x.id),
      files: data.files.map(f => shown(cwd, path.join(at.dir, f))),
      open: openLine(cwd, at),
    },
  };
}

/**
 * Make a new starter app (Next.js app router, Core and the neutral theme,
 * with the Astryx packages pinned to this CLI's release) in `dir`, with the
 * theme preview route and its default pages inside. With `theme`, the theme
 * folder is copied into the app and the pages wear it. No install runs.
 * Every check runs before the first write, so a refusal changes nothing.
 * @experimental
 * @param {string} dir
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAppOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAppResponse>}
 */
export async function themeEditPreviewApp(dir, options = {}) {
  const {cwd = process.cwd()} = options;
  if (typeof dir !== 'string' || !dir.trim())
    refuse(
      E.ERR_INVALID_ARGUMENT,
      'Name the folder for the new app: a new or empty folder inside the current one.',
      {run: [`${PREVIEW} app theme-app`]},
    );
  const slug = options.theme ?? null;
  const theme =
    slug == null
      ? null
      : wornTheme(
          cwd,
          slug,
          t =>
            `${PREVIEW} app ${quoteCommandArgument(dir)}${t == null ? '' : ` --theme ${t}`}`,
          'leave out --theme and the app wears the neutral theme',
        );
  // A new app has no Core installed yet: its pages come from this CLI's own
  // Core when the current folder has none.
  const project = await openProject(cwd).catch(() => openProject(CLI_PACKAGE));
  /** @type {Record<string, string>} */
  const dependencies = {};
  /** @type {Array<{rel: string, text: string | Buffer}>} */
  const themeCopy = [];
  /** @type {{name: string, module: string, css: string[], mode: 'system' | 'light' | 'dark'} | null} */
  let routeTheme = null;
  /** @type {string[]} */
  const notes = [];
  const routeDir = path.join('src', 'app', 'theme-preview');
  // The folder checks come before the theme build, so a refusal writes nothing.
  planStarterApp(cwd, dir, () => [], {}, slug);
  /** @type {string | null} */
  let colorsSource = null;
  if (slug != null && theme) {
    const from = themeFiles(cwd, slug);
    const ctx = await context(cwd);
    // The build is judged by its content (staleBuild), never by file
    // times. Without the theme's lock (it cannot be taken), a change may be
    // in progress: nothing is built, and only a build that matches its
    // settings is copied.
    const why = staleBuild(cwd, slug, theme);
    if (/** @type {any} */ (options).readOnly) {
      if (why)
        refuse(
          E.ERR_THEME_BUSY,
          `The lock for ${slug} could not be taken, and its build is not current (${why}), so it is not copied. Nothing was changed.`,
          {run: [`${P} show ${slug}`]},
        );
    } else if (why) {
      await buildTheme(ctx, slug, theme);
      notes.push(
        `built ${shown(cwd, from.dir)}/ first: its build was not current (${why}), and the app gets a current copy`,
      );
    }
    const to = themeFiles('', slug);
    // The theme and its build, with the type declarations the build writes;
    // not its history, preview pages or pictures.
    const skip = new Set(
      [
        from.history,
        previewsFile(cwd, slug),
        from.preview,
        from.sheet,
        from.previewPng,
        from.sheetPng,
      ].map(f => path.basename(f)),
    );
    // The whole folder, tokens/ included, as bytes: a font or a picture
    // there must arrive as it is.
    /** @param {string} rel */
    const copyDir = rel => {
      for (const entry of fs.readdirSync(path.join(from.dir, rel), {
        withFileTypes: true,
      })) {
        const sub = path.join(rel, entry.name);
        if (entry.isDirectory()) copyDir(sub);
        else if (
          entry.isFile() &&
          !(rel === '' && skip.has(entry.name)) &&
          // A temp file a stopped command left is no part of the theme.
          !isEditorTemp(entry.name)
        )
          themeCopy.push({
            rel: path.join(to.dir, sub),
            text: fs.readFileSync(path.join(from.dir, sub)),
          });
      }
    };
    copyDir('');
    if (theme.like && theme.like !== 'neutral')
      dependencies[`@astryxdesign/theme-${theme.like}`] = cliVersion();
    /** @param {string} rel */
    const fromRoute = rel => {
      const r = path.relative(routeDir, rel).split(path.sep).join('/');
      return r.startsWith('.') ? r : `./${r}`;
    };
    // The new app installs its own packages, so every open font the theme
    // names is added, at the version this project has, else a known one.
    const fonts = fontPackages(ctx, theme);
    for (const font of fonts)
      dependencies[font.pkg] =
        readVersion(project, font.pkg) ?? OPEN_FONT_RANGE;
    routeTheme = {
      name: slug,
      module: fromRoute(to.js),
      css: [
        fromRoute(to.css),
        ...baseFontsCss(ctx, theme),
        ...fonts.map(x => `${x.pkg}/index.css`),
      ],
      mode: themeImports(ctx, slug, theme, path.join(cwd, routeDir)).mode,
    };
    // The app's theme folder sits where this project's does, so the Colors
    // page imports the copied colors by the same relative path.
    const colors = await colorsPage(cwd, path.join(cwd, routeDir), slug);
    if (colors.colors) colorsSource = colors.source;
  }
  /** @type {PreviewData} */
  const data = {version: 1, theme: slug, pages: [], files: [], hashes: {}};
  /** @type {Array<{rel: string, text: string}>} */
  const preview = [];
  /** @type {Array<[string, string, string]>} */
  const pages = [
    [
      'overview',
      'Overview',
      overviewPageSource(project, {
        theme: slug,
        colors: colorsSource != null,
      }),
    ],
    [
      'components',
      'Components',
      componentsPageSource(project, {theme: slug}).source,
    ],
    ...(colorsSource == null
      ? []
      : [
          /** @type {[string, string, string]} */ ([
            COLORS_PAGE.id,
            COLORS_PAGE.label,
            colorsSource,
          ]),
        ]),
  ];
  for (const [id, label, source] of pages) {
    data.pages.push({id, label, file: `${PAGES_DIR}/${id}`});
    preview.push({rel: `${PAGES_DIR}/${id}.tsx`, text: source});
  }
  preview.push({
    rel: 'page.tsx',
    text: previewRouteSource({
      pages: data.pages,
      theme: routeTheme,
      by: `${PREVIEW} app`,
    }),
  });
  data.files = [...preview.map(x => x.rel), PREVIEW_DATA];
  data.hashes = Object.fromEntries(preview.map(x => [x.rel, digest(x.text)]));
  const plan = planStarterApp(
    cwd,
    dir,
    () => [
      ...themeCopy,
      ...preview.map(x => ({rel: path.join(routeDir, x.rel), text: x.text})),
      {
        rel: path.join(routeDir, PREVIEW_DATA),
        text: `${JSON.stringify(data, null, 2)}\n`,
      },
    ],
    dependencies,
    slug,
  );
  const files = writeStarterApp(
    cwd,
    plan,
    d =>
      `${PREVIEW} app ${quoteCommandArgument(d)}${slug == null ? '' : ` --theme ${quoteCommandArgument(slug)}`}`,
  );
  const folder = shownDir(cwd, plan.root);
  if (
    plan.root !== cwd &&
    !isOutsideProject(cwd) &&
    fs.existsSync(path.join(cwd, 'tsconfig.json'))
  )
    notes.push(
      `add "${folder}" to "exclude" in this project's tsconfig.json, so its own type check leaves the new app out`,
    );
  return {
    type: 'themeEdit.previewApp',
    data: {
      folder,
      theme: slug,
      pages: data.pages.map(x => x.id),
      files,
      notes,
      // A folder named like a flag (`-`, `-k`) is a path to cd only with ./.
      open: `cd ${quoteCommandArgument(folder.startsWith('-') ? `./${folder}` : folder)} && npm install && npm run dev, then open /theme-preview`,
    },
  };
}

/** The version range of an open font package the host project lacks. */
const OPEN_FONT_RANGE = '^5.0.0';

/**
 * The installed version of a package, as the project resolves it.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} pkg
 * @returns {string | null}
 */
function readVersion(project, pkg) {
  try {
    return JSON.parse(
      fs.readFileSync(project.req.resolve(`${pkg}/package.json`), 'utf8'),
    ).version;
  } catch {
    return null;
  }
}

/**
 * Why the in-app preview's record is damaged, with how to fix it, or null
 * (no preview, or a sound one). For answers that would suggest a preview
 * command, which the damage refuses.
 * @param {string} cwd
 * @returns {string | null}
 */
export function previewRecordProblem(cwd) {
  try {
    const at = previewDir(cwd, undefined, {
      optional: true,
      retry: () => `${PREVIEW} add`,
    });
    if (at) readPreview(cwd, at.dir);
    return null;
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err?.code !== E.ERR_THEME_INVALID) return null;
    const fix = err.fix;
    return `${String(err.message).replace(/ Nothing was changed\.$/, '')}${fix ? ` To fix it: ${fix}.` : ''}`;
  }
}

/**
 * The pages of the in-app theme preview. With no preview, and with no
 * routes folder for one, the list is empty; a damaged theme-preview.json is
 * refused, naming the file.
 * @experimental
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewListResponse>}
 */
export async function themeEditPreviewList(options = {}) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  const pf =
    options.path != null ? ` --path ${quoteCommandArgument(options.path)}` : '';
  const at = previewDir(cwd, options.path, {
    optional: true,
    retry: p =>
      `${PREVIEW} list${p == null ? '' : ` --path ${quoteCommandArgument(p)}`}`,
  });
  const data = at && readPreview(cwd, at.dir, pf);
  /** @type {string[]} */
  const notes = [];
  const themeMissing = Boolean(
    data?.theme && !fs.existsSync(themeFiles(cwd, data.theme).dir),
  );
  if (at && fs.existsSync(path.join(at.dir, PENDING)))
    notes.push(
      `a preview change was stopped part way, so this list may be out of date; ${PREVIEW} add${pf} finishes it`,
    );
  // A page whose file is gone breaks the route, which still imports it.
  const missing = new Set(
    (data?.pages ?? [])
      .filter(p => at && !fs.existsSync(path.join(at.dir, `${p.file}.tsx`)))
      .map(p => p.id),
  );
  if (at && missing.size)
    notes.push(
      `${[...missing].join(', ')} ${missing.size > 1 ? 'are' : 'is'} listed, but ${missing.size > 1 ? 'their files are' : 'its file is'} gone, so the route does not build; ${PREVIEW} add${pf} writes ${missing.size > 1 ? 'them' : 'it'} again`,
    );
  if (data?.theme && themeMissing) {
    const themes = editedThemes(cwd);
    notes.push(
      `the preview wears ${data.theme}, which is gone, so its route does not build; ${PREVIEW} add${pf} switches it to ${themes.length === 1 ? themes[0] : "the app's own theme"}`,
    );
  }
  return {
    type: 'themeEdit.previewList',
    data: {
      folder: at && data ? shownDir(cwd, at.dir) : null,
      theme: data?.theme ?? null,
      themeMissing,
      pages: (data?.pages ?? []).map(x => ({
        id: x.id,
        label: x.label,
        ...(missing.has(x.id) ? {missing: true} : {}),
      })),
      notes,
    },
  };
}

/**
 * Remove one page from the in-app theme preview, or with no page the whole
 * preview. Only files the preview wrote are deleted, only inside the route
 * folder, and never one changed by hand since: those are kept and named.
 * Every check, the theme included, runs before the first delete.
 * @experimental
 * @param {string} [page]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewRemoveResponse>}
 */
export async function themeEditPreviewRemove(page, options = {}) {
  return reportingRecovery(box => removePreview(page, options, box));
}

/**
 * {@link themeEditPreviewRemove}, with the note of a recovery in `box`.
 * @param {string | undefined} page
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} options
 * @param {{note: string | null}} box
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewRemoveResponse>}
 */
async function removePreview(page, options, box) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  const pf =
    options.path != null ? ` --path ${quoteCommandArgument(options.path)}` : '';
  const retry = (/** @type {string | null} */ p) =>
    `${PREVIEW} remove${page != null ? ` ${quoteCommandArgument(page)}` : ''}${p == null ? '' : ` --path ${quoteCommandArgument(p)}`}`;
  const at = previewDir(cwd, options.path, {retry});
  // The pages a stopped change was removing, read before it is finished.
  /** @type {string[]} */
  let removing = [];
  try {
    const pend = JSON.parse(
      fs.readFileSync(path.join(at.dir, PENDING), 'utf8'),
    );
    const ids = (/** @type {any} */ r) =>
      Array.isArray(r?.pages)
        ? r.pages.map((/** @type {any} */ x) => String(x?.id))
        : [];
    const after = ids(pend?.record);
    removing = ids(pend?.old).filter(
      (/** @type {string} */ id) => !after.includes(id),
    );
  } catch {
    // No stopped change, or a damaged one.
  }
  const recovered = recoverPreview(cwd, at.dir);
  box.note = recovered;
  /** @type {string[]} */
  const dropped = [];
  const data = readPreview(cwd, at.dir, pf, {dropped});
  if (!data) {
    // A folder that holds the app takes no preview: the way on is the
    // preview elsewhere, or a new one in its own folder.
    /** @type {string | null} */
    let other = null;
    if (holdsApp(cwd, at.dir))
      try {
        const d = previewDir(cwd, undefined, {optional: true, retry})?.dir;
        if (d && d !== at.dir && fs.existsSync(path.join(d, PREVIEW_DATA)))
          other = d;
      } catch {
        // Several previews, or none: add is the way on.
      }
    refuse(
      E.ERR_NOT_FOUND,
      `There is no theme preview in ${shownDir(cwd, at.dir)}/ (no ${PREVIEW_DATA}).`,
      {
        run: [
          holdsApp(cwd, at.dir)
            ? other
              ? `${PREVIEW} remove${page != null ? ` ${quoteCommandArgument(page)}` : ''}  # the preview in ${shownDir(cwd, other)}/`
              : `${PREVIEW} add`
            : `${PREVIEW} add${pf}`,
        ],
      },
    );
  }
  const folder = shownDir(cwd, at.dir);
  // theme-preview.json is a file anyone can edit: every path in it must
  // stay in the route folder before anything is removed.
  const inside = (/** @type {string} */ rel) =>
    confined(path.join(at.dir, rel), at.dir, PREVIEW_DATA, {cwd, pf});
  for (const rel of data.files) inside(rel);
  for (const p of data.pages) inside(`${p.file}.tsx`);
  /** @type {string[]} */
  const notes = recovered ? [recovered] : [];
  if (dropped.length)
    notes.push(
      `dropped ${dropped.map(f => JSON.stringify(f)).join(', ')} from ${PREVIEW_DATA}: ${dropped.length > 1 ? 'they lead' : 'it leads'} outside the folder, so nothing there was deleted`,
    );
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const missing = [];

  /** @type {PreviewPage | undefined} */
  let one;
  if (page != null) {
    const key = String(page).trim();
    one =
      data.pages.find(x => x.id === key) ??
      data.pages.find(x => x.id.toLowerCase() === key.toLowerCase());
    // The same remove run again after it was stopped: the change just
    // finished removed the page.
    if (
      !one &&
      recovered &&
      removing.some(id => id.toLowerCase() === key.toLowerCase())
    )
      return {
        type: 'themeEdit.previewRemove',
        data: {
          folder,
          removed: [],
          kept: [],
          missing: [],
          rewritten: [],
          notes: [
            ...notes,
            `${key} is no longer in the preview: the change that was stopped removed it`,
          ],
          pages: data.pages.map(x => x.id),
        },
      };
    if (!one)
      refuse(E.ERR_NOT_FOUND, `The preview has no page "${page}".`, {
        didYouMean: nearest(
          key.toLowerCase(),
          data.pages.map(x => x.id),
        ),
        run: [`${PREVIEW} list${pf}`],
      });
  }

  if (one && data.pages.length > 1) {
    const target = one;
    const rel = `${target.file}.tsx`;
    const name = shown(cwd, inside(rel));
    /** @type {string[]} */
    const deletes = [];
    const ids = new Set(data.pages.map(p => p.id));
    const verdict = ownedUnchanged(at.dir, data, rel, ids);
    if (!data.files.includes(rel)) {
      kept.push(name);
      notes.push(
        `${name} was not written by the preview, so it is kept; only its nav item is gone`,
      );
    } else if (!fs.existsSync(inside(rel))) missing.push(name);
    else if (unreadable(inside(rel))) {
      kept.push(name);
      notes.push(
        `${name} could not be read (${unreadable(inside(rel))}), so it is left in place and stays in ${PREVIEW_DATA}; fix its permissions, then run ${PREVIEW} remove${pf} again`,
      );
    } else if (verdict !== 'delete') {
      kept.push(name);
      notes.push(keptNote(name, verdict));
    } else deletes.push(rel);
    data.pages = data.pages.filter(x => x !== target);
    // A file left in place because it could not be read stays recorded.
    if (!unreadable(inside(rel)))
      data.files = data.files.filter(f => f !== rel);
    const wore = data.theme;
    /** @type {string | null} */
    let gone = null;
    if (wore && !fs.existsSync(themeFiles(cwd, wore).dir)) {
      gone = wore;
      data.theme = null;
      notes.push(
        `the preview wore ${wore}, which is gone; it now wears the app's own theme`,
      );
    }
    const move = movedPages(cwd, at.dir, data);
    // A page whose file is gone leaves the nav, so the route never imports
    // a missing file.
    const moving = new Set(move.writes.map(w => w.rel));
    const lost = data.pages.filter(p => {
      const rel = `${p.file}.tsx`;
      if (moving.has(rel) || fs.existsSync(path.join(at.dir, rel)))
        return false;
      return !(
        p.id === COLORS_PAGE.id &&
        data.files.includes(rel) &&
        (data.theme || gone)
      );
    });
    if (lost.length) {
      data.pages = data.pages.filter(p => !lost.includes(p));
      data.files = data.files.filter(
        f => !lost.some(p => f === `${p.file}.tsx`),
      );
      notes.push(
        `left ${lost.map(p => p.id).join(', ')} out of the nav: ${lost.length > 1 ? 'their files were' : 'its file was'} gone`,
      );
    }
    /** @type {Array<{rel: string, text: string}>} */
    let planned;
    /** @type {Awaited<ReturnType<typeof routeTheme>>} */
    let theme;
    try {
      theme = await routeTheme(cwd, at.dir, data, {build: false});
      planned = await routeWrites(cwd, at.dir, data, theme, {gone});
    } catch (e) {
      const err = /** @type {any} */ (e);
      if (
        [E.ERR_THEME_INVALID, E.ERR_UNKNOWN_THEME, E.ERR_THEME_LOAD].includes(
          err?.code,
        )
      )
        err.suggestions = [
          {
            name: `${PREVIEW} remove${pf}`,
            reason:
              'do this instead: removes the whole preview, which needs no theme',
          },
          ...(err.suggestions ?? []),
        ];
      throw e;
    }
    const elsewhere = `${PREVIEW} remove${pf}`;
    /** @type {Map<string, {rel: string, text: string, keepHash?: boolean}>} */
    const writes = new Map(move.writes.map(w => [w.rel, w]));
    /** @type {string[]} */
    const rewritten = [];
    for (const w of planned) {
      const was = checkWrite(cwd, at.dir, data, w, elsewhere);
      writes.set(w.rel, w);
      if (!data.files.includes(w.rel)) data.files.push(w.rel);
      if (was !== 'same') rewritten.push(shown(cwd, path.join(at.dir, w.rel)));
    }
    await buildWorn(cwd, theme, options, notes);
    commitPreview(
      cwd,
      at.dir,
      data,
      [...writes.values()],
      [...deletes, ...move.deletes],
      retry(options.path ?? null),
    );
    tidyPageFolders(at.dir);
    if (gone)
      await themeLocked(options, gone, () =>
        recordPreview(cwd, gone, at.dir, false),
      );
    return {
      type: 'themeEdit.previewRemove',
      data: {
        folder,
        removed: deletes.map(r => shown(cwd, path.join(at.dir, r))),
        kept,
        missing,
        rewritten,
        notes,
        pages: data.pages.map(x => x.id),
      },
    };
  }

  // The whole preview: every entry is checked before the first delete. A
  // route changed by hand would be kept and still import the pages, so it
  // stops the remove instead.
  refuseIfLockLost();
  if (data.files.includes('page.tsx') && editedByHand(at.dir, data, 'page.tsx'))
    refuse(
      E.ERR_FILE_EXISTS,
      `${shown(cwd, path.join(at.dir, 'page.tsx'))} was changed by hand after the preview wrote it. It imports the preview pages, so removing them would leave a route that does not build.`,
      {
        fix: `copy your changes out of ${shown(cwd, path.join(at.dir, 'page.tsx'))}, give it another name, then run ${PREVIEW} remove${pf} again`,
      },
    );
  const ids = new Set(data.pages.map(p => p.id));
  // A route the preview keeps still imports its pages, so they stay too.
  const routeKept =
    fs.existsSync(path.join(at.dir, 'page.tsx')) &&
    (!data.files.includes('page.tsx') ||
      ownedUnchanged(at.dir, data, 'page.tsx', ids) !== 'delete');
  /** @type {Array<{file: string, before: Buffer}>} */
  const plan = [];
  for (const rel of data.files) {
    const file = inside(rel);
    /** @type {fs.Stats} */
    let st;
    try {
      st = fs.lstatSync(file);
    } catch {
      missing.push(shown(cwd, file));
      continue;
    }
    if (st.isDirectory())
      damagedPreview(
        cwd,
        at.dir,
        `"files" holds ${rel}, which is a folder; the preview writes only files`,
        pf,
      );
    const verdict = ownedUnchanged(at.dir, data, rel, ids);
    if (verdict !== 'delete') {
      kept.push(shown(cwd, file));
      notes.push(keptNote(shown(cwd, file), verdict));
      continue;
    }
    if (routeKept && rel !== PREVIEW_DATA) {
      kept.push(shown(cwd, file));
      notes.push(
        `${shown(cwd, file)} is kept: page.tsx stays, and it imports the pages`,
      );
      continue;
    }
    const cannot = unreadable(file);
    if (cannot) {
      kept.push(shown(cwd, file));
      notes.push(
        `${shown(cwd, file)} could not be read (${cannot}), so it is left in place; fix its permissions, then run ${PREVIEW} remove${pf} again`,
      );
      continue;
    }
    plan.push({file, before: fs.readFileSync(file)});
  }
  // theme-preview.json goes last, so an interrupted remove can run again.
  plan.sort(
    (a, b) =>
      Number(path.basename(a.file) === PREVIEW_DATA) -
      Number(path.basename(b.file) === PREVIEW_DATA),
  );
  /** @type {string[]} */
  const removed = [];
  for (const [i, p] of plan.entries())
    try {
      fs.rmSync(p.file);
      removed.push(shown(cwd, p.file));
    } catch (e) {
      for (const back of plan.slice(0, i))
        try {
          fs.writeFileSync(back.file, back.before);
        } catch {
          // Best effort: the refusal below names the file.
        }
      refuse(
        E.ERR_WRITE_FAILED,
        `${shown(cwd, p.file)} could not be removed (${/** @type {any} */ (e)?.code ?? 'error'}), so the preview's files were put back.`,
        {run: [`${retry(options.path ?? null)}  # once the cause is fixed`]},
      );
    }
  tidyPageFolders(at.dir);
  // Files the record does not list stay: the preview never deletes what it
  // has no record of writing. Each is named, so the folder left is no
  // surprise.
  for (const rel of unrecordedPages(at.dir)) {
    const name = shown(cwd, path.join(at.dir, rel));
    if (kept.includes(name)) continue;
    kept.push(name);
    notes.push(
      `${name} is kept: the preview has no record of writing it, so it may hold your work`,
    );
  }
  try {
    fs.rmdirSync(at.dir);
    // The folders the first add made over it, and route group folders,
    // such as (tools)/, that only held the preview; never one with
    // anything else in it.
    let made = data.parents ?? 0;
    for (
      let up = path.dirname(at.dir);
      (made > 0 || /^\(.+\)$/.test(path.basename(up))) &&
      at.app &&
      up.startsWith(at.app + path.sep);
      up = path.dirname(up), made--
    )
      fs.rmdirSync(up);
  } catch {
    // Not empty: something there is not the preview's.
  }
  const worn = data.theme;
  if (worn)
    await themeLocked(options, worn, () =>
      recordPreview(cwd, worn, at.dir, false),
    );
  return {
    type: 'themeEdit.previewRemove',
    data: {folder, removed, kept, missing, rewritten: [], notes, pages: []},
  };
}
