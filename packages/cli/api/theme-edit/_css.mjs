// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CSS knowledge for `astryx experimental theme`, read from css-tree
 * and the MDN data it ships: the property names a theme may set on a part,
 * and whether a value matches a property's grammar. css-tree loads on the
 * first check, so commands that never check CSS do not pay for it.
 * @position api/theme-edit — pure helpers
 */

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Properties browsers ship that MDN does not list yet (Chrome experiments).
 * A name here is a property a theme may set; it has no grammar to match.
 */
const NOT_IN_MDN_YET = [
  'border-shape',
  'flex-line-count',
  'frame-sizing',
  'link-parameters',
  'path-length',
  'scroll-axis-lock',
  'text-fit',
  'timeline-trigger-activation-range',
  'timeline-trigger-activation-range-end',
  'timeline-trigger-activation-range-start',
  'timeline-trigger-active-range',
  'timeline-trigger-active-range-end',
  'timeline-trigger-active-range-start',
  'view-transition-scope',
  'window-drag',
];

/** @type {any} */
let tree = null;
/** css-tree, loaded once. */
const csstree = () => (tree ??= require('css-tree'));

/** The MDN property data css-tree reads, at the version css-tree pins. */
const mdnProperties = () =>
  /** @type {Record<string, {status?: string, initial?: string | string[]}>} */ (
    createRequire(require.resolve('css-tree/package.json'))(
      'mdn-data/css/properties.json',
    )
  );

/** @type {ReadonlySet<string> | null} */
let names = null;
/**
 * The standard CSS property names: every property css-tree's MDN data
 * lists that is not vendor-prefixed or obsolete, plus NOT_IN_MDN_YET. A
 * name outside it is not a CSS property, so the command refuses it.
 * @returns {ReadonlySet<string>}
 */
export function cssProperties() {
  if (names) return names;
  const mdn = mdnProperties();
  names = new Set([
    ...Object.keys(csstree().lexer.properties).filter(
      k => !k.startsWith('-') && mdn[k] && mdn[k].status !== 'obsolete',
    ),
    ...NOT_IN_MDN_YET,
  ]);
  return names;
}

/** What a var() or env() may stand for while the rest of a value is matched. */
const VAR_STANDS_FOR = ['0', '1px', '1ms', 'red', 'ease', 'serif', '0 0 red'];

/**
 * Whether a value matches a property's grammar, as css-tree reads it. A
 * var() or env() can hold anything, so the value matches when some
 * ordinary value in its place does. Returns the parsed value on a match, for range checks the
 * grammar does not make.
 * @param {string} property
 * @param {string} value
 * @returns {any | null}
 */
export function matchValue(property, value) {
  const standard = standardSyntax(property);
  return matchWith(value, (lexer, ast) =>
    standard ? lexer.match(standard, ast) : lexer.matchProperty(property, ast),
  );
}

/** @type {Map<string, string | null>} */
const standardCache = new Map();
/**
 * A property's grammar without its legacy Internet Explorer alternatives
 * (`filter`'s `<-ms-filter-function-list>` takes any word), or null when it
 * has none.
 * @param {string} property
 * @returns {string | null}
 */
function standardSyntax(property) {
  if (standardCache.has(property))
    return /** @type {string | null} */ (standardCache.get(property));
  const {definitionSyntax} = csstree();
  const syntax = propertyGrammar(property);
  /** @type {string | null} */
  let out = null;
  if (syntax?.type === 'Group' && syntax.combinator === '|') {
    const kept = syntax.terms.filter(
      (/** @type {any} */ t) => !(t.type === 'Type' && /^-ms-/.test(t.name)),
    );
    if (kept.length && kept.length < syntax.terms.length)
      out = kept
        .map((/** @type {any} */ t) => definitionSyntax.generate(t))
        .join(' | ');
  }
  standardCache.set(property, out);
  return out;
}

/**
 * Whether a value is one value of a CSS type (`time`, `easing-function`,
 * `length-percentage`), never a list. Returns the parsed value on a match.
 * @param {string} type
 * @param {string} value
 * @returns {any | null}
 */
export function matchType(type, value) {
  return matchWith(value, (lexer, ast) => lexer.matchType(type, ast));
}

/**
 * A value matched by `match`, with each var() tried as an ordinary value.
 * @param {string} value
 * @param {(lexer: any, ast: any) => {error: unknown}} match
 * @returns {any | null}
 */
function matchWith(value, match) {
  const {lexer, parse} = csstree();
  const vars =
    value.match(/(?:var|env)\([^()]*(?:\([^()]*\)[^()]*)*\)/gi) ?? [];
  /** @param {string} v */
  const tryOne = v => {
    try {
      const ast = parse(v, {context: 'value'});
      return match(lexer, ast).error || !mathIsSound(ast) ? null : ast;
    } catch {
      return null;
    }
  };
  if (!vars.length) return tryOne(value);
  // A value that is only a variable can stand for any value, also on a
  // property that takes only keywords (display, font-weight).
  if (vars.length === 1 && value.trim() === vars[0]) {
    try {
      return parse(value, {context: 'value'});
    } catch {
      return null;
    }
  }
  if (vars.length > 3) return null;
  /** @param {string} v @param {number} i @returns {any | null} */
  const fill = (v, i) => {
    if (i === vars.length) return tryOne(v);
    for (const stand of VAR_STANDS_FOR) {
      const ast = fill(v.replace(vars[i], stand), i + 1);
      if (ast) return ast;
    }
    return null;
  };
  return fill(value, 0);
}

/**
 * Whether a value that matches a property's grammar is still below a range
 * the specs set and css-tree's data does not carry: a `<line-width>` (a
 * border or outline width) and a duration are never negative.
 * @param {string} property
 * @param {string} value
 */
export function belowRange(property, value) {
  const {lexer, parse} = csstree();
  /** @type {any} */
  let ast;
  try {
    ast = parse(value, {context: 'value'});
  } catch {
    return false;
  }
  const r = lexer.matchProperty(property, ast);
  if (r.error || !r.matched) return false;
  let below = false;
  /** @param {any} m @param {boolean} inWidth */
  const visit = (m, inWidth) => {
    const here =
      inWidth || (m.syntax?.type === 'Type' && m.syntax.name === 'line-width');
    if (here && typeof m.token === 'string' && m.token.startsWith('-'))
      below = true;
    for (const c of m.match ?? []) visit(c, here);
  };
  visit(r.matched, false);
  if (
    /-duration$/.test(property) &&
    numbersIn(ast).some(n => n.value < 0 && ['s', 'ms'].includes(n.unit))
  )
    below = true;
  return below;
}

/** CSS math functions, whose insides css-tree's grammar does not check. */
const MATH = new Set([
  'calc',
  'min',
  'max',
  'clamp',
  'round',
  'mod',
  'rem',
  'abs',
  'sign',
]);
/** Words a math function may hold: constants and rounding strategies. */
const MATH_WORDS = new Set([
  'e',
  'pi',
  'infinity',
  '-infinity',
  'nan',
  'nearest',
  'up',
  'down',
  'to-zero',
]);

/**
 * Whether every math function in a value holds a sound expression: numbers,
 * lengths and percentages joined by operators, nested math, var() or env(),
 * never a stray word (`calc(1px banana)`) or two values with no operator
 * between them. css-tree accepts any insides.
 * @param {any} ast
 */
function mathIsSound(ast) {
  let sound = true;
  csstree().walk(ast, {
    visit: 'Function',
    enter(/** @type {any} */ fn) {
      if (!MATH.has(fn.name.toLowerCase())) return;
      /** @param {any} list */
      const expression = list => {
        let lastWasValue = false;
        for (const node of list) {
          if (node.type === 'WhiteSpace') continue;
          if (node.type === 'Operator') {
            if (node.value === ',') {
              lastWasValue = false;
              continue;
            }
            if (!lastWasValue) return false;
            lastWasValue = false;
            continue;
          }
          const value =
            ['Number', 'Dimension', 'Percentage'].includes(node.type) ||
            (node.type === 'Identifier' &&
              MATH_WORDS.has(node.name.toLowerCase())) ||
            (node.type === 'Function' &&
              (MATH.has(node.name.toLowerCase()) ||
                ['var', 'env'].includes(node.name.toLowerCase()))) ||
            (node.type === 'Parentheses' && expression(node.children));
          if (!value || lastWasValue) return false;
          lastWasValue = true;
        }
        return lastWasValue;
      };
      if (!expression(fn.children)) sound = false;
    },
  });
  return sound;
}

/**
 * Each number a matched value holds, with its unit (`''` for a plain
 * number) and the function it sits in, in order.
 * @param {any} ast
 * @returns {Array<{value: number, unit: string, fn: string | null}>}
 */
export function numbersIn(ast) {
  /** @type {Array<{value: number, unit: string, fn: string | null}>} */
  const out = [];
  /** @type {string[]} */
  const fns = [];
  csstree().walk(ast, {
    enter(/** @type {any} */ node) {
      if (node.type === 'Function') fns.push(node.name.toLowerCase());
      if (node.type === 'Dimension' || node.type === 'Number')
        out.push({
          value: Number(node.value),
          unit: (node.unit ?? '').toLowerCase(),
          fn: fns.at(-1) ?? null,
        });
    },
    leave(/** @type {any} */ node) {
      if (node.type === 'Function') fns.pop();
    },
  });
  return out;
}

/**
 * A property's grammar as css-tree holds it, or null when it has none.
 * @param {string} prop
 * @returns {any | null}
 */
export const propertyGrammar = prop =>
  csstree().lexer.properties[prop]?.syntax ?? null;

/**
 * The keywords a property's grammar takes, through the types it names.
 * @param {string} prop
 * @returns {string[]}
 */
export function keywordsOf(prop) {
  const t = csstree();
  const seen = new Set();
  /** @type {Set<string>} */
  const words = new Set();
  /** @param {any} syntax */
  const walk = syntax => {
    if (!syntax) return;
    t.definitionSyntax.walk(syntax, (/** @type {any} */ n) => {
      if (n.type === 'Keyword') {
        if (!n.name.startsWith('-')) words.add(n.name);
      } else if (n.type === 'Type' && !seen.has(n.name)) {
        seen.add(n.name);
        walk(t.lexer.types[n.name]?.syntax);
      }
    });
  };
  walk(propertyGrammar(prop));
  return [...words];
}

/**
 * A value the property takes, to put in a suggestion: its initial value
 * from MDN's data (a shorthand's first longhand's).
 * @param {string} prop
 * @returns {string | null}
 */
export function initialOf(prop) {
  const initial = mdnProperties()[prop]?.initial;
  if (Array.isArray(initial)) return initial[0] ? initialOf(initial[0]) : null;
  return typeof initial === 'string' && matchValue(prop, initial)
    ? initial
    : null;
}

/**
 * A grammar as text, cut at a whole term when it is long.
 * @param {any} syntax
 */
export function grammarText(syntax) {
  const text = csstree().definitionSyntax.generate(syntax);
  if (text.length <= 120) return text;
  return `${text.slice(0, 120).replace(/\s*\|[^|]*$/, '')} | …`;
}
