// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The files an app's bundler handles that Node cannot load, by name:
 * stylesheets (CSS, and Sass, Less, Stylus or PostCSS source) and assets it
 * gives a URL for (pictures, fonts). A theme module may import one.
 *
 * @input A file name or an import specifier.
 * @output Whether it names such a stylesheet or asset, and whether a
 *   stylesheet is in a language other than CSS.
 * @position foundation/fs — read by the module loader and the starter copy
 */

/**
 * A stylesheet an app's bundler compiles (CSS, or Sass, Less, Stylus or
 * PostCSS source): Node cannot load one, and a theme module may import it.
 */
export const STYLESHEET_FILE =
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss|sss)$/i;

/**
 * Files an app's bundler emits and gives a module its URL for (an icon's
 * .svg, a picture, a font): a theme module may import one, and Node cannot
 * load it.
 */
export const ASSET_FILE =
  /\.(?:svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot)$/i;

/**
 * Whether an import names a file only a bundler loads (a stylesheet or an
 * asset), a query or hash after it left out.
 * @param {string} specifier
 */
export function isBundlerFile(specifier) {
  const file = specifier.replace(/[?#].*$/, '');
  return STYLESHEET_FILE.test(file) || ASSET_FILE.test(file);
}

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
