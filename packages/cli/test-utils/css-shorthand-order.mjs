// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Built theme CSS read for one ordering mistake: within one selector
 * (in one at-rule context), a shorthand written after a longhand it covers
 * resets that longhand, so the longhand set first never shows (a `border`
 * after the rule's own `border-color`, a `background` after its own
 * `background-repeat`).
 *
 * @position Test support. Any built CSS: an editor theme's, an official
 * theme's.
 */

import {coversProperty} from '../api/theme-edit/_css.mjs';

/**
 * Each rule of a stylesheet in order, with the at-rules around it.
 * @param {string} css
 * @returns {Array<{context: string, selector: string, decls: Array<[string, string]>}>}
 */
function rulesOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /** @type {Array<{context: string, selector: string, decls: Array<[string, string]>}>} */
  const out = [];
  /** @type {string[]} */
  const stack = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth) continue;
    if (ch === '{') {
      stack.push(text.slice(start, i).trim());
      start = i + 1;
    } else if (ch === '}') {
      const prelude = stack.pop() ?? '';
      const body = text.slice(start, i);
      if (!prelude.startsWith('@') && !body.includes('{')) {
        /** @type {Array<[string, string]>} */
        const decls = [];
        for (const d of body.split(/;(?![^(]*\))/)) {
          const at = d.indexOf(':');
          if (at > 0)
            decls.push([d.slice(0, at).trim().toLowerCase(), d.slice(at + 1).trim()]);
        }
        out.push({context: stack.join(' > '), selector: prelude, decls});
      }
      start = i + 1;
    } else if (ch === ';' && !stack.length) start = i + 1;
  }
  return out;
}

/**
 * Every place a shorthand comes after a longhand it covers, set earlier for
 * the same selector in the same at-rule context: that longhand never shows.
 * @param {string} css
 * @returns {Array<{selector: string, context: string, longhand: string, shorthand: string}>}
 */
export function shorthandsAfterOwnLonghands(css) {
  /** @type {Map<string, Set<string>>} */
  const seen = new Map();
  /** @type {Array<{selector: string, context: string, longhand: string, shorthand: string}>} */
  const out = [];
  for (const r of rulesOf(css)) {
    const key = `${r.context}\n${r.selector}`;
    const props = seen.get(key) ?? new Set();
    seen.set(key, props);
    for (const [prop] of r.decls) {
      if (prop.startsWith('--')) continue;
      for (const before of props)
        if (coversProperty(prop, before))
          out.push({
            selector: r.selector,
            context: r.context,
            longhand: before,
            shorthand: prop,
          });
      props.add(prop);
    }
  }
  return out;
}
