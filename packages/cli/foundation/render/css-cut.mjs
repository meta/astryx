// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Cut a stylesheet down to the rules a rendered page uses, for
 * `astryx experimental export`. A rule stays when every class in one of its
 * selectors appears in the page; rules without classes (`:root` tokens,
 * element resets) always stay. `@property`,
 * `@font-face` and the `@keyframes` a kept rule names stay too; `@layer`
 * order statements are dropped for the caller to write once, first
 * (see layerOrderOf). On a page that marks elements with the state they are
 * drawn in, each state's rules also match them (withDrawnStates). A font face
 * stays only when the page can draw text with it (cutFontFaces).
 *
 * @position foundation/render — used by render-page.mjs
 */

import postcss from 'postcss';
import {fontKey} from '../fonts/font-stylesheet.mjs';
import {cssUnescape} from '../text/css-escape.mjs';
import {desktopMatches} from './picture-window.mjs';

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
  return [...s.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)].map(m =>
    unescapeIdent(m[1]),
  );
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
    if (kept.length && options.states) {
      const real = rule.selector;
      rule.selector = withDrawnStates(real);
      // A state rule behind media queries the picture's window answers
      // true, each feature of them (`(hover: hover)`, Core's own hover wash;
      // never `(forced-colors: active)`, nor a feature it does not judge),
      // applies to an
      // element drawn in that state, whatever the browser taking the
      // picture reports about its pointer: a copy with the drawn states
      // alone follows the outermost such query, in the same place.
      const guards = mediaGuards(rule);
      if (
        guards.length &&
        guards.every(at => desktopMatches(at.params, {sure: true}))
      ) {
        const drawn = drawnStatesOnly(real);
        if (drawn) {
          const copy = rule.clone({selector: drawn});
          const outer = guards[guards.length - 1];
          /** @type {any} */ (outer.parent).insertAfter(
            outer,
            wrapIn(copy, rule, outer),
          );
        }
      }
    }
  });
  // Drop the grouping at-rules left empty, innermost first.
  let changed = true;
  while (changed) {
    changed = false;
    rootNode.walkAtRules(at => {
      if (
        /^(media|supports|container|layer|scope|starting-style)$/i.test(
          at.name,
        ) &&
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

/**
 * Drop the `@font-face` rules a page never draws text with. A browser loads a
 * face only for text in the face's family and in its `unicode-range`, but a
 * file carries every face it keeps. So a face stays when its family is named
 * outside the faces (a rule, a token, the markup or the script) and its range
 * covers a character the page can draw: one in the markup, the script or the
 * stylesheet (a `content` string). The script is bundled as ASCII, so a
 * character or a family name it holds is often written as escapes
 * (`\u039a`, `\xDCn\xEF Sans`); each escape counts as its character, and so
 * does a CSS escape (`\25b6`, `Gill\ Sans`). Family names are compared as
 * CSS reads them (fontKey). A list or counter style that draws other letters
 * (`lower-greek`, a `@counter-style`) or a `text-transform` that changes the
 * characters (`full-width`), set in the stylesheet, the markup or the script,
 * keeps every face of a named family; a character's other cases count, for
 * `uppercase` (Turkish `i` → `İ` too). Text the file cannot know is drawn
 * with the next font in the family list when no kept face covers it: text a
 * reader types, text the script builds from character codes, and text the
 * browser writes in the reader's or the page's locale (a date field's
 * placeholder, Intl-formatted dates and numbers).
 * @param {string} css the stylesheet to cut
 * @param {string} text the page's markup and script
 * @param {string} [stylesheet] the page's whole stylesheet, when `css` is one
 *   of its parts: the families its rules name and the text they draw count
 * @returns {string}
 */
export function cutFontFaces(css, text, stylesheet = css) {
  if (!/@font-face/i.test(css)) return css;
  const rootNode = postcss.parse(css);
  const outside = postcss.parse(stylesheet);
  outside.walkAtRules(/^font-face$/i, at => {
    at.remove();
  });
  const rules = cssUnescape(outside.toString());
  // One copy of the text with its escapes written out: every character the
  // text holds, written out or escaped, is in it once.
  const drawn = unescaped(text);
  const named = `${rules}\n${drawn}`.replace(/\s+/g, ' ').toLowerCase();
  /** @type {Set<number>} */
  const chars = new Set();
  // A `text-transform` draws a character in another case (`µ` as `Μ`), so
  // each character's other cases count too.
  for (const part of [drawn, rules])
    for (let i = 0; i < part.length; i++) {
      const code = /** @type {number} */ (part.codePointAt(i));
      chars.add(code);
      if (code > 0xffff) i++;
    }
  for (const code of [...chars]) {
    const ch = String.fromCodePoint(code);
    for (const cased of [
      ch.toUpperCase(),
      ch.toLowerCase(),
      ch.toLocaleUpperCase('tr'),
      ch.toLocaleLowerCase('tr'),
    ])
      for (const c of cased)
        chars.add(/** @type {number} */ (c.codePointAt(0)));
  }
  const anyRange = drawsOtherLetters(outside, drawn);
  rootNode.walkAtRules(/^font-face$/i, face => {
    /** @type {string | undefined} */
    let family;
    /** @type {string | undefined} */
    let range;
    face.walkDecls((/** @type {any} */ d) => {
      const prop = d.prop.toLowerCase();
      if (prop === 'font-family') family = d.value;
      else if (prop === 'unicode-range') range = d.value;
    });
    const name = family === undefined ? undefined : fontKey(family);
    const usedFamily = !name || wordIn(named, name);
    const usedRange =
      anyRange ||
      !range ||
      unicodeRanges(range).some(([lo, hi]) => {
        for (const c of chars) if (c >= lo && c <= hi) return true;
        return false;
      });
    if (!usedFamily || !usedRange) face.remove();
  });
  return rootNode.toString();
}

/** List and counter styles whose markers are ASCII, or shapes the browser draws. */
const ASCII_MARKERS = new Set([
  'none',
  'disc',
  'circle',
  'square',
  'disclosure-open',
  'disclosure-closed',
  'decimal',
  'decimal-leading-zero',
  'lower-roman',
  'upper-roman',
  'lower-alpha',
  'upper-alpha',
  'lower-latin',
  'upper-latin',
  'inside',
  'outside',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]);

/**
 * Whether a page draws letters that no text holds: list or counter markers
 * other than ASCII (a `@counter-style`, or a `list-style`,
 * `list-style-type`, `counter()` or `counters()` that names another style,
 * such as `lower-greek` or `hiragana`), or a `text-transform` that changes
 * the characters (`full-width`, `full-size-kana`). The style counts where
 * the stylesheet sets it, directly or in a custom property, and where the
 * markup or the script names it as a value (a `style` attribute, a quoted
 * name). A string marker is text the page holds already.
 * @param {any} rootNode the stylesheet
 * @param {string} drawn the markup and the script, escapes written out
 * @returns {boolean}
 */
function drawsOtherLetters(rootNode, drawn) {
  let other = false;
  rootNode.walkAtRules(/^counter-style$/i, () => {
    other = true;
  });
  /** @type {Set<string>} */
  const styleVars = new Set();
  rootNode.walkDecls((/** @type {any} */ d) => {
    if (!other && styleDrawsOtherLetters(d.prop, d.value)) other = true;
    if (/^(?:list-style(?:-type)?|text-transform|content)$/i.test(d.prop))
      for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g))
        styleVars.add(m[1]);
  });
  if (other) return true;
  // A custom property that a list style, a text-transform or a counter reads
  // through `var()`, or a registered one's `initial-value`, can hold the
  // style: a style name among its unquoted words counts.
  /** @param {string} value */
  const namesStyle = value =>
    (
      value
        .replace(/(["'])(?:\\.|(?!\1).)*\1/g, ' ')
        .toLowerCase()
        .match(/[a-z][a-z-]*[a-z]/g) ?? []
    ).some(w => OTHER_LETTER_STYLES.has(w));
  // (A custom property can read another: follow the chain.)
  /** @type {Map<string, string[]>} */
  const customValues = new Map();
  rootNode.walkDecls(/^--/, (/** @type {any} */ d) => {
    customValues.set(d.prop, [...(customValues.get(d.prop) ?? []), d.value]);
  });
  for (const name of styleVars)
    for (const value of customValues.get(name) ?? [])
      for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g))
        styleVars.add(m[1]);
  for (const name of styleVars)
    if (!other && (customValues.get(name) ?? []).some(namesStyle)) other = true;
  rootNode.walkAtRules(/^property$/i, (/** @type {any} */ at) => {
    if (!styleVars.has(at.params.trim())) return;
    at.walkDecls(/^initial-value$/i, (/** @type {any} */ d) => {
      if (!other && namesStyle(d.value)) other = true;
    });
  });
  if (other) return true;
  if (/@counter-style/i.test(drawn)) return true;
  // The markup and the script name a style by its value, as CSS writes it:
  // a quoted name alone (`'lower-greek'`), or the value of a list style or a
  // text-transform (`style="list-style-type:georgian"`,
  // `listStyle: 'inside georgian'`, `setProperty('list-style', 'inside
  // georgian')`). Prose and an object key (`listStyle:a`) name no style.
  for (const m of drawn.matchAll(/["'`]([a-z][a-z-]*[a-z])["'`]/g))
    if (OTHER_LETTER_STYLES.has(m[1])) return true;
  for (const m of drawn.matchAll(
    /\b(?:list-?style(?:-?type)?|text-?transform)["'`]?\s*[:=,]\s*["'`]?([^;"'`}\n]*)/gi,
  )) {
    if (
      (m[1].toLowerCase().match(/[a-z][a-z-]*[a-z]/g) ?? []).some(w =>
        OTHER_LETTER_STYLES.has(w),
      )
    )
      return true;
  }
  for (const m of drawn.matchAll(/\bcounters?\([^)]*\)/gi))
    if (styleDrawsOtherLetters('content', m[0])) return true;
  return false;
}

/**
 * The CSS-defined list and counter styles that draw letters other than ASCII,
 * and the `text-transform` values that change the characters.
 */
const OTHER_LETTER_STYLES = new Set([
  'arabic-indic',
  'armenian',
  'upper-armenian',
  'lower-armenian',
  'bengali',
  'cambodian',
  'khmer',
  'cjk-decimal',
  'devanagari',
  'georgian',
  'gujarati',
  'gurmukhi',
  'hebrew',
  'kannada',
  'lao',
  'malayalam',
  'mongolian',
  'myanmar',
  'oriya',
  'persian',
  'tamil',
  'telugu',
  'thai',
  'tibetan',
  'lower-greek',
  'hiragana',
  'hiragana-iroha',
  'katakana',
  'katakana-iroha',
  'cjk-earthly-branch',
  'cjk-heavenly-stem',
  'cjk-ideographic',
  'japanese-informal',
  'japanese-formal',
  'korean-hangul-formal',
  'korean-hanja-informal',
  'korean-hanja-formal',
  'simp-chinese-informal',
  'simp-chinese-formal',
  'trad-chinese-informal',
  'trad-chinese-formal',
  'ethiopic-numeric',
  'full-width',
  'full-size-kana',
]);

/**
 * Whether one declaration draws letters no text holds (see
 * drawsOtherLetters).
 * @param {string} property
 * @param {string} value
 * @returns {boolean}
 */
function styleDrawsOtherLetters(property, value) {
  const prop = property.toLowerCase();
  if (prop === 'text-transform')
    return /full-width|full-size-kana/i.test(value);
  /** @type {string[]} */
  const styles = [];
  if (prop === 'list-style' || prop === 'list-style-type') {
    styles.push(
      ...value
        .replace(
          /(["'])(?:\\.|(?!\1).)*\1|url\([^)]*\)|var\(\s*--[\w-]+\s*,?|\)/gi,
          ' ',
        )
        .split(/\s+/),
    );
  }
  for (const m of value.matchAll(/\bcounters?\(([^)]*)\)/gi)) {
    const args = m[1].split(',').map(x => x.trim());
    const last = args[args.length - 1];
    if (args.length > (/^counters/i.test(m[0]) ? 2 : 1) && !/^["']/.test(last))
      styles.push(last);
  }
  return styles.some(w => w !== '' && !ASCII_MARKERS.has(w.toLowerCase()));
}

/**
 * `text` with each escape it holds written out: a JavaScript `\uXXXX` (a
 * surrogate pair as its one character), `\u{X}` or `\xXX`, or an HTML
 * `&#N;` or `&#xH;` reference. The bundled script is ASCII, so it holds the
 * page's other characters, and a font family named in it, as escapes. An
 * escape that is not part of a string (a pattern's range) gives a character
 * the page may not draw, which only keeps a face.
 * @param {string} text
 * @returns {string}
 */
function unescaped(text) {
  const escape =
    /\\u\{([0-9a-fA-F]{1,6})\}|\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})|&#[xX]([0-9a-fA-F]{1,6});|&#([0-9]{1,7});/g;
  return text.replace(
    escape,
    (whole, braced, high, low, four, two, hex, dec) => {
      /** @type {number} */
      let code;
      if (high !== undefined)
        code =
          0x10000 +
          ((parseInt(high, 16) - 0xd800) << 10) +
          (parseInt(low, 16) - 0xdc00);
      else if (dec !== undefined) code = parseInt(dec, 10);
      else code = parseInt(braced ?? four ?? two ?? hex, 16);
      return code > 0x10ffff ? whole : String.fromCodePoint(code);
    },
  );
}

/**
 * Whether `text` holds `word` with no name character on either side, so the
 * family `Inter` is not found in `pointer-events`.
 * @param {string} text
 * @param {string} word
 * @returns {boolean}
 */
function wordIn(text, word) {
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
    const before = text[i - 1] ?? '';
    const after = text[i + word.length] ?? '';
    if (!/[\w-]/.test(before) && !/[\w-]/.test(after)) return true;
  }
  return false;
}

/**
 * The code point spans of a `unicode-range` value (`U+0000-00FF, U+4??`).
 * A value it cannot read covers everything.
 * @param {string} value
 * @returns {[number, number][]}
 */
function unicodeRanges(value) {
  /** @type {[number, number][]} */
  const out = [];
  for (const part of value.split(',')) {
    const m = /^\s*u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(part);
    if (!m) return [[0, 0x10ffff]];
    if (m[1].includes('?'))
      out.push([
        parseInt(m[1].replace(/\?/g, '0'), 16),
        parseInt(m[1].replace(/\?/g, 'f'), 16),
      ]);
    else out.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)]);
  }
  return out;
}

/**
 * The `@media` rules around a rule, innermost first, up to its root.
 * @param {any} rule
 * @returns {any[]}
 */
function mediaGuards(rule) {
  const out = [];
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent)
    if (p.type === 'atrule' && /^media$/i.test(p.name)) out.push(p);
  return out;
}

/**
 * A copy of `rule` inside the grouping rules between it and `outer` that are
 * not media queries (a `@supports`, a `@layer`), so the copy keeps their
 * conditions and its place in the cascade.
 * @param {any} copy
 * @param {any} rule
 * @param {any} outer
 * @returns {any}
 */
function wrapIn(copy, rule, outer) {
  let node = copy;
  for (let p = rule.parent; p && p !== outer; p = p.parent)
    if (p.type === 'atrule' && !/^media$/i.test(p.name))
      node = p.clone({nodes: []}).append(node);
  return node;
}

/**
 * A selector matching only elements a page draws in a state (never the real
 * pseudo-class), or null when it names no state.
 * @param {string} selector
 * @returns {string | null}
 */
function drawnStatesOnly(selector) {
  let named = false;
  const out = selector.replace(
    /(\\.)|:(hover|active|focus-visible|focus-within|focus)(?![\w-])/g,
    (whole, escaped, state) => {
      if (escaped) return whole;
      named = true;
      return `:is(${DRAWN_STATES[/** @type {keyof typeof DRAWN_STATES} */ (state)]})`;
    },
  );
  return named ? out : null;
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
  'focus-within':
    '[data-astryx-state~="focus"],:has([data-astryx-state~="focus"])',
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
      escaped
        ? whole
        : `:is(:${state},${DRAWN_STATES[/** @type {keyof typeof DRAWN_STATES} */ (state)]})`,
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
