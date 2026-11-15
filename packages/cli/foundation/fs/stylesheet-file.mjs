// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The stylesheet files an app's bundler compiles, by name: CSS, and
 * Sass, Less, Stylus or PostCSS source. Node cannot load one, and a theme
 * module may import one.
 *
 * @input A file name or an import specifier.
 * @output Whether it names such a stylesheet, and whether in a language
 *   other than CSS.
 * @position foundation/fs — read by the module loader and the starter copy
 */

/**
 * A stylesheet an app's bundler compiles (CSS, or Sass, Less, Stylus or
 * PostCSS source): Node cannot load one, and a theme module may import it.
 */
export const STYLESHEET_FILE =
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss|sss)$/i;

/**
 * Whether an import names a stylesheet in a language other than CSS (Sass,
 * Less, Stylus or PostCSS source), a query or hash after it left out: the
 * one list the theme build loads as stylesheets.
 * @param {string} specifier
 */
export function isOtherLanguageStylesheet(specifier) {
  const file = specifier.replace(/[?#].*$/, '');
  return STYLESHEET_FILE.test(file) && !/\.css$/i.test(file);
}
