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
import {CORE_THEME_SOURCES} from '../../foundation/config/theme-state.mjs';
import {renderedElements} from '../../foundation/discovery/module-exports.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';
import {listProjectSourceFiles} from '../../foundation/fs/project-source-files.mjs';
import {postcss} from '../../foundation/runtime/lazy-dependencies.mjs';

/** Core's stylesheet, the one an app's entry loads. */
const CORE_CSS = '@astryxdesign/core/astryx.css';

/** The stylesheet the check writes beside a script entry to paint the page. */
export const PAGE_CSS = 'astryx-page.css';

/** The page rule the check writes. */
const PAGE_RULE =
  'html,\nbody {\n  background: var(--color-background-body);\n  color: var(--color-text-primary);\n}\n';

/**
 * @typedef {object} AppThemeUse
 * @property {Array<{file: string, nameEnd: number, mode: string | null | undefined}>} elements
 *   each `<Theme>` that wears the theme: `mode` is the mode it pins, null
 *   when written as an expression, undefined when it pins none
 * @property {'light' | 'dark' | null} pinned the mode every one of them pins, or null
 * @property {boolean} painted whether a stylesheet of the app paints the page with the theme
 * @property {string | null} entry the file that loads Core's stylesheet
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
  let painted = false;
  for (const file of files) {
    if (file.endsWith('.css')) {
      painted ||= paintsPage(fs.readFileSync(file, 'utf8'));
      continue;
    }
    for (const el of renderedElements(file, {
      sources: CORE_THEME_SOURCES,
      name: 'Theme',
      prop: 'theme',
    }))
      if (el.origin && wears.has(path.resolve(el.origin.file)))
        elements.push({file, nameEnd: el.nameEnd, mode: el.attributes.mode});
  }
  const modes = new Set(elements.map(e => e.mode));
  const one = modes.size === 1 ? [...modes][0] : null;
  return {
    elements,
    pinned: one === 'light' || one === 'dark' ? one : null,
    painted,
    entry: coreStylesheetLoad(root).file,
  };
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
    if (el.mode === null)
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
  fs.writeFileSync(css, sheet);
  if (!importsModule(text, `./${PAGE_CSS}`))
    fs.writeFileSync(
      entry,
      `${text.slice(0, end)}\nimport './${PAGE_CSS}';${text.slice(end)}`,
    );
  return {files: [css, entry], declined: [], protectedFiles: []};
}
