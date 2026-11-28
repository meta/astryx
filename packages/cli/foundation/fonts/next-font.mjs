// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether an app loads its fonts with Next.js `next/font`.
 * @input a folder in the project
 * @output true when the project's App Router root layout imports next/font, directly or through the geist package
 * @position shared by `doctor`'s theme-fonts check and `theme build`'s font notes, so their fix names the recipe a next/font app needs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findThemeProject} from '../config/theme-state.mjs';
import {
  APP_ROOT_LAYOUT_FILES,
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
 * Whether the project's root layout imports `next/font/google`,
 * `next/font/local`, or a `geist/font` entry. next/font loads each family
 * under a name of its own and exposes a CSS variable, so a theme that names
 * the family itself does not use the loaded font. The import is read from the
 * syntax tree, so a mention in a comment or a string does not count. A layout
 * that does not parse counts as no import.
 * @param {string} dir a folder in the project
 * @returns {boolean}
 */
export function rootLayoutImportsNextFont(dir) {
  const projectDir = projectOf(dir);
  for (const name of APP_ROOT_LAYOUT_FILES) {
    let source;
    try {
      source = fs.readFileSync(path.join(projectDir, name), 'utf8');
    } catch {
      continue;
    }
    let ast;
    try {
      ast = parseAppModule(source);
    } catch {
      return false;
    }
    return ast.program.body.some(
      node =>
        node.type === 'ImportDeclaration' &&
        isNextFontImport(node.source.value),
    );
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
