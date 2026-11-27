// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether an app loads its fonts with Next.js `next/font`.
 * @input a project directory
 * @output true when its App Router root layout imports `next/font/google` or `next/font/local`
 * @position shared by `doctor`'s theme-fonts check and `theme build`'s font note, so their fix names the recipe a next/font app needs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {babelParse as parse} from '../runtime/lazy-dependencies.mjs';

/** The modules that load a font through next/font. */
const NEXT_FONT_MODULES = new Set(['next/font/google', 'next/font/local']);

/** The App Router root layout files: under the project, or under `src/`. */
const ROOT_LAYOUT_FILES = ['app/layout', 'src/app/layout'].flatMap(file =>
  ['.tsx', '.jsx', '.js', '.mjs', '.ts'].map(ext => `${file}${ext}`),
);

/**
 * Whether the project's root layout imports `next/font/google` or
 * `next/font/local`. next/font loads each family under a name of its own
 * and exposes a CSS variable, so a theme that names the family itself does
 * not use the loaded font. The import is read from the syntax tree, so a
 * mention in a comment or a string does not count. A layout that does not
 * parse counts as no import.
 * @param {string} projectDir
 * @returns {boolean}
 */
export function rootLayoutImportsNextFont(projectDir) {
  for (const name of ROOT_LAYOUT_FILES) {
    let source;
    try {
      source = fs.readFileSync(path.join(projectDir, name), 'utf8');
    } catch {
      continue;
    }
    let ast;
    try {
      ast = parse(source, {
        sourceType: 'unambiguous',
        plugins: ['typescript', 'jsx', 'decorators-legacy', 'importAttributes'],
      });
    } catch {
      return false;
    }
    return ast.program.body.some(
      node =>
        node.type === 'ImportDeclaration' &&
        NEXT_FONT_MODULES.has(node.source.value),
    );
  }
  return false;
}

/**
 * The fix for a family a next/font app names but does not load: point the
 * theme's family at the font's CSS variable.
 * @param {string} recipe the command that prints the next/font recipe
 * @returns {string}
 */
export function nextFontFix(recipe) {
  return `This app loads fonts with next/font, which loads each family under a name of its own: set the theme's font family to the font's CSS variable, for example family: 'var(--font-geist-sans)' (recipe: ${recipe})`;
}
