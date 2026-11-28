// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether an app loads its fonts with Next.js `next/font`.
 * @input a folder in the project
 * @output true when the project's root layout or custom App loads next/font, directly, through the geist package, or through a module it imports
 * @position shared by `doctor`'s theme-fonts check and `theme build`'s font notes, so their fix names the recipe a next/font app needs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findThemeProject} from '../config/theme-state.mjs';
import {
  APP_MODULE_EXTENSIONS,
  APP_ROOT_LAYOUT_FILES,
  PAGES_APP_FILES,
  parseAppModule,
} from '../discovery/app-layout.mjs';

/** The modules that load a font through next/font. */
const NEXT_FONT_MODULES = new Set(['next/font/google', 'next/font/local']);

/**
 * Whether an import loads its font through next/font: next/font itself, or an
 * entry of the `geist` package, each of which wraps `next/font/local`.
 * @param {string} specifier
 */
function isNextFontImport(specifier) {
  return (
    NEXT_FONT_MODULES.has(specifier) ||
    specifier === 'geist/font' ||
    specifier.startsWith('geist/font/')
  );
}

/**
 * The project folder for `dir`: the nearest folder at or above it with a
 * package.json, as `doctor` finds it, else `dir` itself.
 * @param {string} dir
 */
function projectOf(dir) {
  try {
    return findThemeProject(dir).projectDir;
  } catch {
    return dir;
  }
}

/**
 * The import specifiers of a module file, read from its syntax tree, or null
 * when the file is missing or does not parse.
 * @param {string} file
 * @returns {string[] | null}
 */
function moduleImports(file) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    return parseAppModule(source)
      .program.body.filter(node => node.type === 'ImportDeclaration')
      .map(node => node.source.value);
  } catch {
    return null;
  }
}

/**
 * The file a relative import names, as Next.js resolves it: the path as
 * written, with an app module extension, or as a folder's index.
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {string | null}
 */
function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...APP_MODULE_EXTENSIONS.map(ext => `${base}${ext}`),
    ...APP_MODULE_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ];
  return (
    candidates.find(file =>
      fs.statSync(file, {throwIfNoEntry: false})?.isFile(),
    ) ?? null
  );
}

/**
 * Whether a module loads next/font itself, or through a relative module it
 * imports (one level, as a layout imports its fonts from `./fonts`).
 * @param {string} file
 * @param {string[]} imports
 */
function loadsNextFont(file, imports) {
  if (imports.some(isNextFontImport)) return true;
  return imports
    .filter(
      specifier => specifier.startsWith('./') || specifier.startsWith('../'),
    )
    .some(specifier => {
      const target = resolveRelative(file, specifier);
      const nested = target == null ? null : moduleImports(target);
      return nested != null && nested.some(isNextFontImport);
    });
}

/**
 * Whether the project loads its fonts with next/font: its App Router root
 * layout or its Pages Router custom App imports `next/font/google`,
 * `next/font/local` or a `geist/font` entry, itself or through a relative
 * module it imports (such as `./fonts`). next/font loads each family under a
 * name of its own and exposes a CSS variable, so a theme that names the
 * family itself does not use the loaded font. Imports are read from the
 * syntax tree, so a mention in a comment or a string does not count. A file
 * that does not parse counts as no import. An aliased import (`@/fonts`) is
 * not followed.
 * @param {string} dir a folder in the project
 * @returns {boolean}
 */
export function rootLayoutImportsNextFont(dir) {
  const projectDir = projectOf(dir);
  for (const files of [APP_ROOT_LAYOUT_FILES, PAGES_APP_FILES]) {
    for (const name of files) {
      const file = path.join(projectDir, name);
      const imports = moduleImports(file);
      if (imports == null) continue;
      if (loadsNextFont(file, imports)) return true;
      break;
    }
  }
  return false;
}

/**
 * The fix for a family a next/font app's own theme names but does not load:
 * point the theme's family at the font's CSS variable.
 * @param {string} recipe the command that prints the next/font recipe
 * @returns {string}
 */
export function nextFontFix(recipe) {
  return `This app loads fonts with next/font, which loads each family under a name of its own: set the theme's font family to the font's CSS variable, for example family: 'var(--font-geist-sans)' (recipe: ${recipe})`;
}
