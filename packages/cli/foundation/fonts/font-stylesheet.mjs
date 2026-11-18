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
import {cssUnescape} from '../text/css-escape.mjs';
import {postcss} from '../runtime/lazy-dependencies.mjs';

/** @param {string} family */
export const fontKey = family =>
  // As CSS reads the name: `Gill\ Sans` is Gill Sans.
  cssUnescape(String(family).replace(/["']/g, ''))
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

/**
 * The families a font service URL requests in its `family` parameters, as
 * Google Fonts URLs do (`family=Figtree:wght@400;700`, or
 * `family=Roboto:400|Lato` in the older form), as family keys.
 * @param {string} url
 * @returns {Set<string>}
 */
export function fontServiceFamilies(url) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const m of url.matchAll(/family=([^&'")]+)/g)) {
    let value;
    try {
      value = decodeURIComponent(m[1].replace(/\+/g, ' '));
    } catch {
      continue;
    }
    for (const family of value.split('|')) {
      const name = family.split(':')[0];
      if (name.trim()) out.add(fontKey(name));
    }
  }
  return out;
}

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
  // A Fontsource package names its family: `<name> Variable` for a
  // variable one.
  const pkg = /^@fontsource(-variable)?\/([^/]+)/.exec(spec);
  if (pkg)
    out.add(
      fontKey(`${pkg[2].replace(/-/g, ' ')}${pkg[1] ? ' Variable' : ''}`),
    );
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(spec)) {
    for (const family of fontServiceFamilies(spec)) out.add(family);
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
    } else if (name === 'font-face') {
      const face = fontFaceOf(rule);
      if (face.family) out.add(fontKey(face.family));
    }
  });
  return out;
}

/**
 * @typedef {object} FontFace
 * @property {string} family the family the rule names, unquoted and unescaped
 * @property {[number, number] | null} span the weights it loads: one weight
 *   (`400`) as `[400, 400]`, a range (`100 900`, a variable face) as its ends;
 *   400 when the rule names none; null when its weight cannot be read
 * @property {string[]} remote the remote files its `src` loads
 * @property {boolean} isLocalOnly whether it loads only fonts already on the
 *   device (`local()` sources), as a metric fallback face does
 */

/**
 * One `@font-face` rule, read.
 * @param {import('postcss').AtRule} rule
 * @returns {FontFace}
 */
function fontFaceOf(rule) {
  let family = '';
  let weight = '400';
  let src = '';
  rule.walkDecls(decl => {
    const prop = decl.prop.toLowerCase();
    if (prop === 'font-family') family = decl.value;
    else if (prop === 'font-weight') weight = decl.value;
    else if (prop === 'src') src = decl.value;
  });
  const nums = weight
    .trim()
    .replace(/\bnormal\b/gi, '400')
    .replace(/\bbold\b/gi, '700')
    .split(/\s+/)
    .map(Number);
  const urls = [...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map(
    m => m[1],
  );
  return {
    family: cssUnescape(family.replace(/["']/g, '')).trim(),
    span:
      nums.length && nums.every(n => Number.isFinite(n))
        ? [nums[0], nums[1] ?? nums[0]]
        : null,
    remote: urls.filter(url => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url)),
    isLocalOnly: urls.length === 0 && /\blocal\(/i.test(src),
  };
}

/**
 * Each `@font-face` rule of a stylesheet's text, read as
 * {@link stylesheetFontFamilies} reads a file's.
 * @param {string} css
 * @returns {FontFace[]}
 */
export function fontFaceRules(css) {
  /** @type {FontFace[]} */
  const out = [];
  try {
    postcss()
      .parse(css)
      .walkAtRules(/^font-face$/i, rule => {
        out.push(fontFaceOf(rule));
      });
  } catch {
    // A stylesheet that does not parse declares no face.
  }
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

/**
 * Each rule of a stylesheet's text that names a font, a weight or a font
 * style: the values of its `font-family` and `font` declarations, of its
 * `font-weight` ones and of its `font-style` ones, in source order. What
 * one rule sets goes together (the weight or the italic a part gives the
 * family it sets).
 * @param {string} css
 * @returns {Array<{families: string[], fonts: string[], weights: string[], styles: string[]}>}
 */
export function fontRules(css) {
  /** @type {Array<{families: string[], fonts: string[], weights: string[], styles: string[]}>} */
  const out = [];
  try {
    postcss()
      .parse(css)
      .walkRules(rule => {
        /** @type {{families: string[], fonts: string[], weights: string[], styles: string[]}} */
        const one = {families: [], fonts: [], weights: [], styles: []};
        rule.each(node => {
          if (node.type !== 'decl') return;
          const prop = node.prop.toLowerCase();
          if (prop === 'font-family') one.families.push(node.value);
          else if (prop === 'font') one.fonts.push(node.value);
          else if (prop === 'font-weight') one.weights.push(node.value);
          else if (prop === 'font-style') one.styles.push(node.value);
        });
        if (
          one.families.length ||
          one.fonts.length ||
          one.weights.length ||
          one.styles.length
        )
          out.push(one);
      });
  } catch {
    // A stylesheet that does not parse names nothing known here.
  }
  return out;
}

/**
 * Every custom property a stylesheet's text sets, with each value it is
 * given (one per rule that sets it), in source order.
 * @param {string} css
 * @returns {Map<string, string[]>}
 */
export function customPropertyValues(css) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  try {
    postcss()
      .parse(css)
      .walkDecls(/^--/, decl => {
        out.set(decl.prop, [...(out.get(decl.prop) ?? []), decl.value]);
      });
  } catch {
    // A stylesheet that does not parse sets nothing known here.
  }
  return out;
}

/**
 * The custom properties a stylesheet's text sets on elements: in a rule
 * whose selector is not the document root (`:root`, `html`, `*`). An
 * element that sets one shadows the value it would inherit from the page.
 * @param {string} css
 * @returns {Set<string>}
 */
export function elementCustomProperties(css) {
  /** @type {Set<string>} */
  const out = new Set();
  const root = /(?:^|[\s,(>+~]):root\b|(?:^|[\s,(>+~])html\b|^\s*\*\s*$/;
  try {
    postcss()
      .parse(css)
      .walkDecls(/^--/, decl => {
        const rule = /** @type {any} */ (decl.parent);
        if (rule?.type !== 'rule') return;
        const selectors = String(rule.selector).split(',');
        if (selectors.some((/** @type {string} */ x) => !root.test(x)))
          out.add(decl.prop);
      });
  } catch {
    // A stylesheet that does not parse sets nothing known here.
  }
  return out;
}
