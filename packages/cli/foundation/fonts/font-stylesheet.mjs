// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The font families a font stylesheet loads.
 * @input a stylesheet: a file, or an `@import` specifier and where it is read from
 * @output lowercase family keys
 * @position shared by the theme build's font note and the editor's app copy
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';

/**
 * postcss, loaded the first time a stylesheet is read: most commands read
 * none, and start without it.
 * @returns {typeof import('postcss').default}
 */
const postcss = () => createRequire(import.meta.url)('postcss');

/** @param {string} family */
export const fontKey = family =>
  String(family).replace(/["']/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The families a stylesheet `@import` specifier loads, read from `fromDir`:
 * an `@fontsource` package by its name, a font service URL by the
 * `family=` it requests, a local stylesheet by its `@font-face` rules and
 * its own imports.
 * @param {string} spec
 * @param {string} fromDir
 * @param {Set<string>} [seen]
 * @returns {Set<string>}
 */
export function importedFontFamilies(spec, fromDir, seen = new Set()) {
  /** @type {Set<string>} */
  const out = new Set();
  const pkg = /^@fontsource(?:-variable)?\/([^/]+)/.exec(spec);
  if (pkg) out.add(fontKey(pkg[1].replace(/-/g, ' ')));
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(spec)) {
    for (const m of spec.matchAll(/family=([^:&'")]+)/g))
      out.add(fontKey(decodeURIComponent(m[1].replace(/\+/g, ' '))));
    return out;
  }
  /** @type {string | null} */
  let file = null;
  const beside = path.resolve(fromDir, spec);
  if (fs.existsSync(beside)) file = beside;
  else if (!/^\.{1,2}\//.test(spec))
    try {
      file = createRequire(path.join(fromDir, 'noop.js')).resolve(spec);
    } catch {
      file = null;
    }
  if (file) for (const f of stylesheetFontFamilies(file, seen)) out.add(f);
  return out;
}

/**
 * The families a stylesheet file loads: its `@font-face` rules, and what
 * each of its `@import`s loads.
 * @param {string} file
 * @param {Set<string>} [seen]
 * @returns {Set<string>}
 */
export function stylesheetFontFamilies(file, seen = new Set()) {
  /** @type {Set<string>} */
  const out = new Set();
  if (seen.has(file)) return out;
  seen.add(file);
  /** @type {import('postcss').Root} */
  let root;
  try {
    root = postcss().parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return out;
  }
  root.walkAtRules(rule => {
    const name = rule.name.toLowerCase();
    if (name === 'import') {
      const spec = /^(?:url\(\s*)?["']?([^"')\s]+)/.exec(
        rule.params.trim(),
      )?.[1];
      if (spec)
        for (const f of importedFontFamilies(spec, path.dirname(file), seen))
          out.add(f);
    } else if (name === 'font-face')
      rule.walkDecls(/^font-family$/i, decl => {
        out.add(fontKey(decl.value));
      });
  });
  return out;
}

/**
 * The values of the declarations in a stylesheet's text whose property
 * matches `property` (custom properties included), in source order.
 * @param {string} css
 * @param {RegExp} property
 * @returns {string[]}
 */
export function declarationValues(css, property) {
  /** @type {string[]} */
  const out = [];
  try {
    postcss()
      .parse(css)
      .walkDecls(property, decl => {
        out.push(decl.value);
      });
  } catch {
    // A stylesheet that does not parse declares nothing known here.
  }
  return out;
}
