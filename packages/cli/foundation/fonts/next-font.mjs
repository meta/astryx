// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether an app loads its fonts with Next.js `next/font`.
 * @input a folder in the project
 * @output true when the project's root layout or custom App loads next/font, directly, through the geist package, or through a module of the app's own it imports
 * @position shared by `doctor`'s theme-fonts check and `theme build`'s font notes, so their fix names the recipe a next/font app needs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findThemeProject} from '../config/theme-state.mjs';
import {
  APP_ROOT_LAYOUT_FILES,
  PAGES_APP_FILES,
  parseAppModule,
} from '../discovery/app-layout.mjs';
import {resolveLocalModule} from '../discovery/module-exports.mjs';
import {pathsFor, resolvePath} from '../render/ts-paths.mjs';

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
 * The file an import of the app's own code names: a relative import as the
 * app's bundler resolves it, or a path alias through the tsconfig paths the
 * importing file reads. A package import gives null.
 * @param {string} specifier
 * @param {string} fromFile
 * @returns {string | null}
 */
function resolveAppImport(specifier, fromFile) {
  if (specifier.startsWith('.')) {
    return resolveLocalModule(specifier, fromFile, {bundler: true});
  }
  return resolvePath(pathsFor(fromFile), specifier);
}

/**
 * Whether a module loads next/font itself, or through a module of the app's
 * own that it imports (one level, as a layout imports its fonts from
 * `./fonts` or `@/app/fonts`).
 * @param {string} file
 * @param {string[]} imports
 */
function loadsNextFont(file, imports) {
  if (imports.some(isNextFontImport)) return true;
  return imports.some(specifier => {
    const target = resolveAppImport(specifier, file);
    const nested = target == null ? null : moduleImports(target);
    return nested != null && nested.some(isNextFontImport);
  });
}

/**
 * Whether the project loads its fonts with next/font: its App Router root
 * layout or its Pages Router custom App imports `next/font/google`,
 * `next/font/local` or a `geist/font` entry, itself or through a module of
 * the app's own it imports (such as `./fonts`, or `@/app/fonts` through the
 * app's tsconfig paths). next/font loads each family under a name of its own
 * and exposes a CSS variable, so a theme that names the family itself does
 * not use the loaded font. Imports are read from the syntax tree, so a
 * mention in a comment or a string does not count. A file that does not
 * parse counts as no import.
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
