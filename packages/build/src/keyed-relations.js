// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @file keyed-relations.js
 * @input StyleX rules as `@stylexjs/babel-plugin` collects them:
 *   `[className, {ltr, rtl}, priority]`
 * @output keyRelations, the rules with each relation whose last compound is a
 *   bare `*` keyed to the rule's own class; keySelectors, the same for the
 *   text of one rule
 * @position The builds that print a package's rules run it before StyleX
 *   prints them: the prebuilt stylesheets and the Turbopack source build
 *   (source-stylesheet.js), the PostCSS integration (index.js) and the Vite
 *   integration (vite.ts). So each of them prints the same selectors.
 */

// Chromium keeps one invalidation set for each pseudo-class and attribute,
// for the whole document. `stylex.when.ancestor(':hover')` prints
// `.c.c:where(.m:hover *)`. Its relation ends in a bare `*`, so the `:hover`
// set restyles the whole subtree of an element whose hover changes, for every
// rule in the document that tests an ancestor's hover. With the `*` keyed to
// the rule's class, `:where(.m:hover :where(.c))`, the set restyles only the
// elements with that class. The rule matches the same elements, because its
// own compound already requires the class. `:where()` adds no specificity,
// also inside `:is()`.

/** The characters that separate two compounds at the top level. */
const COMBINATORS = new Set([' ', '\t', '\n', '\r', '\f', '>', '+', '~']);

/**
 * Calls `visit` with the index and the character of each character of
 * `text[from, to)` outside brackets, strings and escapes. It stops at the
 * first character `visit` accepts and returns its index, or -1.
 */
function findTopLevel(text, from, to, visit) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < to; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
    } else if (quote != null) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (depth === 0 && visit(i, ch)) {
      return i;
    }
  }
  return -1;
}

/** The index of the bracket that closes the one at `open`, or -1. */
function closingBracket(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
    } else if (quote != null) {
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** `text[from, to)` split at its top-level commas, as index ranges. */
function topLevelParts(text, from, to) {
  const parts = [];
  let start = from;
  findTopLevel(text, from, to, (i, ch) => {
    if (ch === ',') {
      parts.push([start, i]);
      start = i + 1;
    }
    return false;
  });
  parts.push([start, to]);
  return parts;
}

/** `[from, to)` without the white space at either end. */
function trimmed(text, from, to) {
  while (from < to && /\s/.test(text[from])) {
    from++;
  }
  while (to > from && /\s/.test(text[to - 1])) {
    to--;
  }
  return [from, to];
}

/**
 * Where the last compound of the complex selector `text[from, to)` starts,
 * and whether a compound comes before it.
 */
function lastCompound(text, from, to) {
  const [start, end] = trimmed(text, from, to);
  let last = -1;
  findTopLevel(text, start, end, (i, ch) => {
    if (COMBINATORS.has(ch)) {
      last = i;
    }
    return false;
  });
  return {start: last === -1 ? start : last + 1, end, isRelation: last !== -1};
}

function isIdentifierChar(ch) {
  return (
    ch != null && (/[\w-]/.test(ch) || ch === '\\' || ch.charCodeAt(0) >= 0x80)
  );
}

/** Whether the compound `text[from, to)` has the class `className`. */
function hasClass(text, from, to, className) {
  return (
    findTopLevel(
      text,
      from,
      to,
      (i, ch) =>
        ch === '.' &&
        text.startsWith(className, i + 1) &&
        !(
          i + 1 + className.length < to &&
          isIdentifierChar(text[i + 1 + className.length])
        ),
    ) !== -1
  );
}

/**
 * The edits that key one complex selector, `text[from, to)`: each `*` that
 * ends a relation in a `:where()` or `:is()` of its subject compound, when
 * that compound has the class `className`.
 */
function selectorEdits(text, from, to, className) {
  const subject = lastCompound(text, from, to);
  if (!hasClass(text, subject.start, subject.end, className)) {
    return [];
  }
  const edits = [];
  findTopLevel(text, subject.start, subject.end, (i, ch) => {
    if (ch !== ':' || text[i + 1] === ':') {
      return false;
    }
    const name = /^:(where|is)\(/i.exec(text.slice(i, i + 7));
    if (name == null) {
      return false;
    }
    const open = i + name[0].length - 1;
    const close = closingBracket(text, open);
    if (close === -1) {
      return false;
    }
    for (const [start, end] of topLevelParts(text, open + 1, close)) {
      const last = lastCompound(text, start, end);
      if (last.isRelation && text.slice(last.start, last.end) === '*') {
        edits.push(last.start);
      }
    }
    return false;
  });
  return edits;
}

/**
 * `css`, the text of one StyleX rule, with each relation that ends in a bare
 * `*` keyed to `className`. The rule may sit in at-rules, and its selector may
 * be a list. Any other text comes back unchanged.
 */
function keySelectors(css, className) {
  if (!css.includes('*') || !/:(where|is)\(/i.test(css)) {
    return css;
  }
  // Skip the preludes of the at-rules the style rule sits in.
  let start = 0;
  for (;;) {
    [start] = trimmed(css, start, css.length);
    if (css[start] !== '@') {
      break;
    }
    const open = findTopLevel(css, start, css.length, (_, ch) => ch === '{');
    if (open === -1) {
      return css;
    }
    start = open + 1;
  }
  const end = findTopLevel(css, start, css.length, (_, ch) => ch === '{');
  if (end === -1) {
    return css;
  }
  const edits = topLevelParts(css, start, end).flatMap(([from, to]) =>
    selectorEdits(css, from, to, className),
  );
  let keyed = css;
  for (const at of edits.sort((a, b) => b - a)) {
    keyed = `${keyed.slice(0, at)}:where(.${className})${keyed.slice(at + 1)}`;
  }
  return keyed;
}

/**
 * StyleX rules with each relation that ends in a bare `*` keyed to the rule's
 * own class. A rule without one comes back as it is.
 *
 * @example
 * ```
 * stylexBabelPlugin.processStylexRules(keyRelations(rules), {useLayers: true});
 * ```
 */
function keyRelations(rules) {
  return rules.map(rule => {
    if (!Array.isArray(rule) || typeof rule[0] !== 'string') {
      return rule;
    }
    const [className, css] = rule;
    if (css == null || typeof css !== 'object') {
      return rule;
    }
    let keyed = null;
    for (const direction of ['ltr', 'rtl']) {
      const text = css[direction];
      if (typeof text === 'string') {
        const next = keySelectors(text, className);
        if (next !== text) {
          keyed ??= {...css};
          keyed[direction] = next;
        }
      }
    }
    return keyed == null ? rule : [className, keyed, ...rule.slice(2)];
  });
}

module.exports = {keyRelations, keySelectors};
