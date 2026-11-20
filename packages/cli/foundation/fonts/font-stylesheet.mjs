// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The font families, and the faces, a font stylesheet loads.
 * @input a stylesheet: a file, its text, or an `@import` specifier and where it is read from
 * @output lowercase family keys; each `@font-face` rule's family and weights
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
 * The family and weights of one `@font-face` rule: the family as it is
 * written (unquoted, unescaped) and as a family key, and the weights as a
 * [from, to] span: one weight (`400`, `bold`) or a range (`100 900`, a
 * variable face, every weight in it). A rule with no font-weight is weight
 * 400; a weight that is not a number or keyword gives null weights.
 * @param {import('postcss').AtRule} rule
 * @returns {{family: string, key: string, weights: [number, number] | null} | null}
 */
function faceOf(rule) {
  /** @type {string | null} */
  let family = null;
  let weight = '400';
  rule.walkDecls(decl => {
    const prop = decl.prop.toLowerCase();
    if (prop === 'font-family') family = decl.value;
    else if (prop === 'font-weight') weight = decl.value;
  });
  if (family == null) return null;
  const nums = String(weight)
    .trim()
    .replace(/\bnormal\b/gi, '400')
    .replace(/\bbold\b/gi, '700')
    .split(/\s+/)
    .map(Number);
  const known = nums.length > 0 && nums.every(n => Number.isFinite(n));
  return {
    family: cssUnescape(String(family).replace(/["']/g, '')).trim(),
    key: fontKey(family),
    weights: known ? [nums[0], nums[1] ?? nums[0]] : null,
  };
}

/**
 * Each `@font-face` rule of a stylesheet's text, in source order: its
 * family and weights, as {@link faceOf} reads them.
 * @param {string} css
 * @returns {Array<{family: string, key: string, weights: [number, number] | null}>}
 */
export function fontFaces(css) {
  /** @type {Array<{family: string, key: string, weights: [number, number] | null}>} */
  const out = [];
  try {
    postcss()
      .parse(css)
      .walkAtRules(/^font-face$/i, rule => {
        const face = faceOf(rule);
        if (face) out.push(face);
      });
  } catch {
    // A stylesheet that does not parse loads no face known here.
  }
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
      const face = faceOf(rule);
      if (face) out.add(face.key);
    }
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
