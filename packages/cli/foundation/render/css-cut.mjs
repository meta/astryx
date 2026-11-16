// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Cut a stylesheet down to the rules a rendered page uses, for
 * `astryx experimental render`. A rule stays when every class in one of its
 * selectors appears in the page; rules without classes (`:root` tokens,
 * element resets) always stay. `@property`,
 * `@font-face` and the `@keyframes` a kept rule names stay too; `@layer`
 * order statements are dropped for the caller to write once, first
 * (see layerOrderOf). On a page that marks elements with the state they are
 * drawn in, each state's rules also match them (withDrawnStates).
 *
 * @position foundation/render — used by render-page.mjs
 */

import postcss from 'postcss';

/**
 * Every class name in a page's markup.
 * @param {string} markup
 * @returns {Set<string>}
 */
export function classesIn(markup) {
  /** @type {Set<string>} */
  const used = new Set();
  for (const m of markup.matchAll(/\sclass="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) used.add(c);
  }
  return used;
}

/** Unescape a CSS identifier as written in a selector. @param {string} s */
const unescapeIdent = s =>
  s
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/\\(.)/g, '$1');

/**
 * The classes a selector needs, ignoring any inside `:not()`, `:is()`,
 * `:where()` or `:has()`.
 * @param {string} selector
 * @returns {string[]}
 */
export function requiredClasses(selector) {
  let s = selector;
  // Drop :not(), :is(), :where() and :has() groups (they can nest one level
  // in practice): what is inside need not all appear, so a rule is never cut
  // for classes in them.
  for (let i = 0; i < 3 && /:(not|is|where|has)\(/.test(s); i++) {
    s = s.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '');
  }
  return [...s.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)].map(m => unescapeIdent(m[1]));
}

/**
 * Split a selector list on top-level commas.
 * @param {string} list
 * @returns {string[]}
 */
function splitSelectors(list) {
  /** @type {string[]} */
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map(s => s.trim()).filter(Boolean);
}

/**
 * Cut a stylesheet to the rules the page uses.
 * @param {string} css
 * @param {Set<string>} used class names in the page
 * @param {{states?: boolean}} [options] `states`: the page marks elements
 *   with the states they are drawn in ({@link withDrawnStates})
 * @returns {string}
 */
export function cutCss(css, used, options = {}) {
  const rootNode = postcss.parse(css);
  rootNode.walkComments(c => {
    c.remove();
  });
  // Layer order statements are written once, first, by the caller.
  rootNode.walkAtRules('layer', at => {
    if (!at.nodes) at.remove();
  });
  rootNode.walkRules(rule => {
    const parent = /** @type {any} */ (rule.parent);
    if (parent?.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
    const kept = splitSelectors(rule.selector).filter(sel =>
      requiredClasses(sel).every(c => used.has(c)),
    );
    if (kept.length === 0) rule.remove();
    else if (kept.length !== splitSelectors(rule.selector).length) {
      rule.selector = kept.join(',');
    }
    if (kept.length && options.states)
      rule.selector = withDrawnStates(rule.selector);
  });
  // Drop the grouping at-rules left empty, innermost first.
  let changed = true;
  while (changed) {
    changed = false;
    rootNode.walkAtRules(at => {
      if (
        /^(media|supports|container|layer|scope|starting-style)$/i.test(at.name) &&
        at.nodes &&
        at.nodes.length === 0
      ) {
        at.remove();
        changed = true;
      }
    });
  }
  // Keep only the keyframes a remaining rule names.
  /** @type {Set<string>} */
  const named = new Set();
  rootNode.walkDecls(/^(animation|animation-name)$/i, d => {
    for (const w of d.value.split(/[\s,]+/)) named.add(w);
  });
  rootNode.walkAtRules(/keyframes$/i, at => {
    if (!named.has(at.params.trim())) at.remove();
  });
  return rootNode.toString().replace(/\n\s*\n/g, '\n');
}

/** What each state a page draws matches, beside the browser's own pseudo-class. */
const DRAWN_STATES = Object.freeze({
  // A pointer over an element hovers it and every element around it; a
  // press is active the same way.
  hover: '[data-astryx-state~="hover"],[data-astryx-state~="hover"] *',
  active: '[data-astryx-state~="active"],[data-astryx-state~="active"] *',
  // Keyboard focus is on one element; `:focus-within` reaches those around it.
  'focus-visible': '[data-astryx-state~="focus"]',
  focus: '[data-astryx-state~="focus"]',
  'focus-within': '[data-astryx-state~="focus"],:has([data-astryx-state~="focus"])',
});

/**
 * A selector that also matches an element a page marks with the state it is
 * drawn in (`data-astryx-state="hover"`, `"focus"`, `"hover active"`), so a
 * picture taken with no pointer or keyboard shows hover, keyboard focus and a
 * press. Each pseudo-class keeps its own match, so a real state still applies.
 * @param {string} selector
 * @returns {string}
 */
export function withDrawnStates(selector) {
  return selector.replace(
    /(\\.)|:(hover|active|focus-visible|focus-within|focus)(?![\w-])/g,
    (whole, escaped, state) =>
      escaped ? whole : `:is(:${state},${DRAWN_STATES[/** @type {keyof typeof DRAWN_STATES} */ (state)]})`,
  );
}

/**
 * The first `@layer a, b, c;` order statement in a stylesheet, if any.
 * @param {string} css
 * @returns {string}
 */
export function layerOrderOf(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return /@layer\s+[\w-]+(?:\s*,\s*[\w-]+)*\s*;/.exec(bare)?.[0] ?? '';
}
