// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What an app does with one theme, for `experimental theme check`:
 * the `<Theme>` elements that wear it and the mode each pins, whether the
 * app's own CSS paints the page, and the file that loads Core's
 * stylesheet. It also writes the two app repairs: a mode on those `<Theme>`
 * elements and a page rule. Each existing file is classified first, as
 * every consumer-file writer classifies it, and a protected file is left
 * alone and named. Read from syntax trees, never by running the app.
 *
 * @position api/theme-edit — imported only by the adapter
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parse as parseModule} from '@babel/parser';
import {
  CORE_THEME_SOURCES,
  themeModuleDefault,
} from '../../foundation/config/theme-state.mjs';
import {renderedElements} from '../../foundation/discovery/module-exports.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';
import {listProjectSourceFiles} from '../../foundation/fs/project-source-files.mjs';
import {postcss} from '../../foundation/runtime/lazy-dependencies.mjs';
import {
  fontKey,
  fontServiceFamilies,
  importedFontFamilies,
} from '../../foundation/fonts/font-stylesheet.mjs';

/** Core's stylesheet, the one an app's entry loads. */
const CORE_CSS = '@astryxdesign/core/astryx.css';

/** The stylesheet the check writes beside a script entry to paint the page. */
export const PAGE_CSS = 'astryx-page.css';

/** The page rule the check writes. */
const PAGE_RULE =
  'html,\nbody {\n  background: var(--color-background-body);\n  color: var(--color-text-primary);\n}\n';

/**
 * @typedef {object} AppThemeUse
 * @property {Array<{file: string, nameEnd: number, mode: string | null | undefined, shared?: string}>} elements
 *   each `<Theme>` that wears the theme: `mode` is the mode it pins, null
 *   when written as an expression, undefined when it pins none; `shared`
 *   names a map of several themes the element picks from
 * @property {'light' | 'dark' | null} pinned the mode every one of them pins, or null
 * @property {boolean} modeByExpression whether one of them sets its mode by an expression the check cannot read
 * @property {boolean} painted whether a stylesheet of the app paints the page with the theme
 * @property {string | null} entry the file that loads Core's stylesheet
 * @property {Set<string> | null} fonts the font families the app loads, as family keys
 * @property {Array<{file: string, value: string}>} pageImage the page backgrounds the app's stylesheets set that may paint an image, each with its stylesheet
 */

/**
 * Whether a stylesheet paints the page with the theme: an `html`, `body` or
 * `:root` rule whose background reads --color-background-body.
 * @param {string} css
 */
function paintsPage(css) {
  let found = false;
  try {
    postcss()
      .parse(css)
      .walkRules(rule => {
        if (!rule.selectors.some(s => /^(html|body|:root)$/.test(s.trim())))
          return;
        rule.walkDecls(/^background(-color)?$/, decl => {
          if (decl.value.includes('var(--color-background-body')) found = true;
        });
      });
  } catch {
    // A stylesheet that does not parse paints nothing the check can see.
  }
  return found;
}

/**
 * The page backgrounds a stylesheet sets on `html`, `body` or `:root` that
 * may paint an image: each one with a `url()`, a gradient or a `var()`
 * (which the check reads from the theme's tokens).
 * @param {string} css
 * @returns {string[]}
 */
function pageImageOf(css) {
  /** @type {string[]} */
  const found = [];
  try {
    postcss()
      .parse(css)
      .walkRules(rule => {
        if (!rule.selectors.some(s => /^(html|body|:root)$/.test(s.trim())))
          return;
        rule.walkDecls(/^background(-image)?$/, decl => {
          if (/url\(|gradient\(|var\(--/.test(decl.value))
            found.push(decl.value.trim());
        });
      });
  } catch {
    // A stylesheet that does not parse paints nothing the check can see.
  }
  return found;
}

/**
 * The end of a script's import of a module, or -1.
 * @param {string} source
 * @param {string} [specifier]
 */
function importEnd(source, specifier = CORE_CSS) {
  try {
    const ast = parseModule(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    const node = ast.program.body.find(
      (/** @type {any} */ n) =>
        n.type === 'ImportDeclaration' && n.source?.value === specifier,
    );
    return node ? /** @type {number} */ (node.end) : -1;
  } catch {
    return -1;
  }
}

/**
 * Whether the map of themes an app picks from wears one of some files: for
 * the generated theme module, its default theme (with the mode it pins);
 * for any other map, whether it imports one. False when it does not.
 * @param {string} file @param {Set<string>} files absolute paths
 * @returns {{mode: 'light' | 'dark' | null} | null | false}
 */
function mapDefault(file, files) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  const picked = themeModuleDefault(source);
  if (!picked) return importsOneOf(file, files) ? null : false;
  const stem = (/** @type {string} */ f) => f.replace(/\.(m?[jt]sx?)$/, '');
  const stems = new Set([...files].map(stem));
  return picked.module.startsWith('.') &&
    stems.has(stem(path.resolve(path.dirname(file), picked.module)))
    ? {mode: picked.mode}
    : false;
}

/**
 * Whether a module imports one of some files: a map of themes the app picks
 * from (`themes[slug]`) wears each theme it imports.
 * @param {string} file @param {Set<string>} files absolute paths
 */
function importsOneOf(file, files) {
  let ast;
  try {
    ast = parseModule(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
  } catch {
    return false;
  }
  const dir = path.dirname(file);
  const stems = new Set([...files].map(f => f.replace(/\.(m?[jt]sx?)$/, '')));
  return ast.program.body.some(
    (/** @type {any} */ n) =>
      n.type === 'ImportDeclaration' &&
      typeof n.source?.value === 'string' &&
      n.source.value.startsWith('.') &&
      stems.has(
        path.resolve(dir, n.source.value).replace(/\.(m?[jt]sx?)$/, ''),
      ),
  );
}

/** A file's text, or '' when it is not there. @param {string} file */
const readIfThere = file => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

/** Whether a file is inside a folder. @param {string} dir @param {string} file */
const isWithin = (dir, file) => {
  const rel = path.relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * The folder of the package a file belongs to, at or below the project
 * root: the nearest folder above it with a package.json.
 * @param {string} root @param {string} file
 */
function packageAround(root, file) {
  for (
    let dir = path.dirname(file);
    isWithin(root, dir) || dir === root;
    dir = path.dirname(dir)
  )
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  return root;
}

/** @param {string} source @param {string} specifier */
const importsModule = (source, specifier) => importEnd(source, specifier) >= 0;

/**
 * What the app does with a theme, or null with no app source.
 * @param {string} root the project root
 * @param {string[]} themeFiles the theme's source and built module
 * @returns {Promise<AppThemeUse | null>}
 */
export async function appThemeUse(root, themeFiles) {
  const files = listProjectSourceFiles(root, '', {stylesheets: true});
  if (!files.length) return null;
  // Doctor's own search for the file that loads Core's stylesheet, loaded
  // only when a check runs.
  const {coreStylesheetLoad} = await import('../doctor/doctor.mjs');
  const wears = new Set(themeFiles.map(f => path.resolve(f)));
  /** @type {AppThemeUse['elements']} */
  const elements = [];
  for (const file of files) {
    if (file.endsWith('.css')) continue;
    for (const el of renderedElements(file, {
      sources: CORE_THEME_SOURCES,
      name: 'Theme',
      prop: 'theme',
    })) {
      if (el.origin && wears.has(path.resolve(el.origin.file))) {
        elements.push({file, nameEnd: el.nameEnd, mode: el.attributes.mode});
        continue;
      }
      if (!el.memberOf) continue;
      // The generated theme module (`themes[defaultThemeSlug]`): the app
      // wears its default theme, in the mode its `themeModes` gives.
      const picked = mapDefault(el.memberOf.file, wears);
      if (picked === false) continue;
      elements.push({
        file,
        nameEnd: el.nameEnd,
        // (A mode written as an expression that themeModes does not answer
        // stays an expression: check cannot tell what it pins.)
        mode:
          picked && el.attributes.mode === null
            ? (picked.mode ?? null)
            : el.attributes.mode,
        // A map that is not the generated module may hold other themes:
        // the element serves them all.
        ...(picked ? {} : {shared: el.memberOf.file}),
      });
    }
  }
  const modes = new Set(elements.map(e => e.mode));
  const one = modes.size === 1 ? [...modes][0] : null;
  // The page and the stylesheet entry are the app's that renders the
  // theme: the package around its <Theme>, not a sibling app.
  const app = elements.length ? packageAround(root, elements[0].file) : null;
  const painted = app
    ? files.some(
        f =>
          f.endsWith('.css') &&
          isWithin(app, f) &&
          paintsPage(fs.readFileSync(f, 'utf8')),
      )
    : false;
  // An image the app paints its page with: text on it is not measured.
  /** @type {Array<{file: string, value: string}>} */
  const pageImage = [];
  if (app)
    for (const f of files) {
      if (!f.endsWith('.css') || !isWithin(app, f)) continue;
      for (const value of pageImageOf(fs.readFileSync(f, 'utf8')))
        pageImage.push({file: path.relative(root, f), value});
    }
  return {
    elements,
    pageImage,
    pinned: one === 'light' || one === 'dark' ? one : null,
    modeByExpression: elements.some(e => e.mode === null),
    painted,
    entry: app ? coreStylesheetLoad(app).file : null,
    fonts: app ? await appLoadedFonts(app, files) : null,
  };
}

/**
 * The font families an app loads, as family keys: what its stylesheets
 * load with `@font-face` or import, what its modules import (a Fontsource
 * package, a stylesheet, a `next/font/google` font), and what its page
 * head links from a font service; null when a stylesheet from elsewhere
 * that names no family may load any.
 * @param {string} app the app's folder
 * @param {string[]} files the project's source files
 * @returns {Promise<Set<string> | null>}
 */
async function appLoadedFonts(app, files) {
  const {pageFontLinks} = await import('../doctor/theme-checks.mjs');
  /** @type {Set<string>} */
  const loaded = new Set(pageFontLinks(app).families);
  // A stylesheet from elsewhere that names no family (a font kit's link)
  // may load any font: then what the app loads is not known. Only links
  // and imports of stylesheets count.
  const {stylesheetLinkHrefs} = await import('../doctor/built-checks.mjs');
  /** @param {string} url */
  const unread = url =>
    /^(?:https?:)?\/\//.test(url) && !fontServiceFamilies(url).size;
  for (const name of ['index.html', 'public/index.html'])
    if (stylesheetLinkHrefs(readIfThere(path.join(app, name))).some(unread))
      return null;
  /** @param {string} css */
  const importsUnread = css =>
    [...css.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)/g)].some(
      ([, url]) => unread(url),
    );
  for (const file of files) {
    if (!isWithin(app, file)) continue;
    const dir = path.dirname(file);
    /** @param {string} spec */
    const add = spec => {
      for (const f of importedFontFamilies(spec, dir)) loaded.add(f);
    };
    if (file.endsWith('.css')) {
      if (importsUnread(fs.readFileSync(file, 'utf8'))) return null;
      add(`./${path.basename(file)}`);
      continue;
    }
    const source = fs.readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(
      /\bimport\s+(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
    ))
      if (/^@fontsource(-variable)?\/|\.css$/.test(spec)) add(spec);
    for (const [, names] of source.matchAll(
      /\bimport\s*\{([^}]*)\}\s*from\s*['"]next\/font\/google['"]/g,
    ))
      for (const name of names.split(','))
        if (name.trim())
          loaded.add(
            fontKey(
              name
                .trim()
                .split(/\s+as\s+/)[0]
                .replace(/_/g, ' '),
            ),
          );
  }
  return loaded;
}

/**
 * What an app repair did: the files it wrote, what it did not do and why,
 * and the protected files that kept it from a change.
 * @typedef {{files: string[], declined: string[], protectedFiles: Array<{file: string, declaration: string}>}} AppRepair
 */

/**
 * Why a file may not be changed, or null: what protects it.
 * @param {string} root @param {string} file
 */
export function protectedBy(root, file) {
  const found = createFileProtectionResolver(root).classify(file);
  return found.length ? found.map(p => p.declaration).join('; ') : null;
}

/**
 * Pin each `<Theme>` that wears the theme to a mode.
 * @param {string} root
 * @param {AppThemeUse} use
 * @param {'light' | 'dark'} mode
 * @returns {AppRepair}
 */
export function pinAppMode(root, use, mode) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const declined = [];
  /** @type {AppRepair['protectedFiles']} */
  const protectedFiles = [];
  /** @type {Map<string, number[]>} */
  const at = new Map();
  for (const el of use.elements) {
    const shown = path.relative(root, el.file);
    if (el.shared)
      declined.push(
        `${shown}: its <Theme> serves every theme in ${path.relative(root, el.shared)}; set mode="${mode}" for this one there yourself`,
      );
    else if (el.mode === null)
      declined.push(
        `${shown}: its <Theme> sets mode with an expression; set it to "${mode}" yourself`,
      );
    else if (el.mode === undefined)
      at.set(el.file, [...(at.get(el.file) ?? []), el.nameEnd]);
  }
  for (const [file, ends] of at) {
    const shown = path.relative(root, file);
    const why = protectedBy(root, file);
    if (why) {
      protectedFiles.push({file: shown, declaration: why});
      declined.push(
        `${shown} is protected (${why}); add mode="${mode}" to its <Theme> yourself`,
      );
      continue;
    }
    let text = fs.readFileSync(file, 'utf8');
    for (const end of ends.sort((a, b) => b - a))
      text = `${text.slice(0, end)} mode="${mode}"${text.slice(end)}`;
    fs.writeFileSync(file, text);
    files.push(file);
  }
  return {files, declined, protectedFiles};
}

/**
 * Paint the app's page with the theme. A stylesheet entry gets the page
 * rule after its imports; a script entry gets a stylesheet of its own
 * beside it, imported after Core's.
 * @param {string} root
 * @param {AppThemeUse} use
 * @returns {AppRepair}
 */
export function paintAppPage(root, use) {
  const entry = use.entry;
  if (!entry)
    return {
      files: [],
      declined: [
        `no file of the app loads ${CORE_CSS}; add the page rule (html, body { background: var(--color-background-body) }) to the app's global stylesheet yourself`,
      ],
      protectedFiles: [],
    };
  const shown = path.relative(root, entry);
  const why = protectedBy(root, entry);
  if (why)
    return {
      files: [],
      declined: [`${shown} is protected (${why}); paint the page yourself`],
      protectedFiles: [{file: shown, declaration: why}],
    };
  const text = fs.readFileSync(entry, 'utf8');
  if (entry.endsWith('.css')) {
    fs.writeFileSync(
      entry,
      `${text.replace(/\s*$/, '')}\n\n/* The page outside an AppShell, in the theme. */\n${PAGE_RULE}`,
    );
    return {files: [entry], declined: [], protectedFiles: []};
  }
  const end = importEnd(text);
  if (end < 0)
    return {
      files: [],
      declined: [
        `${shown} loads ${CORE_CSS} in a way check does not write beside; add the page rule (html, body { background: var(--color-background-body) }) to the app's global stylesheet yourself`,
      ],
      protectedFiles: [],
    };
  const css = path.join(path.dirname(entry), PAGE_CSS);
  const sheet = `/* The page outside an AppShell, in the theme. */\n${PAGE_RULE}`;
  if (fs.existsSync(css) && fs.readFileSync(css, 'utf8') !== sheet)
    return {
      files: [],
      declined: [
        `${path.relative(root, css)} is a file of yours; paint the page yourself`,
      ],
      protectedFiles: [],
    };
  // The new stylesheet is classified as an existing file is: a protected
  // path, or a link in its place, is not written.
  const cssWhy = fs.lstatSync(css, {throwIfNoEntry: false})?.isSymbolicLink()
    ? 'a link in its place'
    : protectedBy(root, css);
  if (cssWhy) {
    const rel = path.relative(root, css);
    return {
      files: [],
      declined: [`${rel} is protected (${cssWhy}); paint the page yourself`],
      protectedFiles: [{file: rel, declaration: cssWhy}],
    };
  }
  fs.writeFileSync(css, sheet);
  if (!importsModule(text, `./${PAGE_CSS}`))
    fs.writeFileSync(
      entry,
      `${text.slice(0, end)}\nimport './${PAGE_CSS}';${text.slice(end)}`,
    );
  return {files: [css, entry], declined: [], protectedFiles: []};
}
