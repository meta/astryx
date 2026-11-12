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
      // Each math function is matched as a plain value of its type, so
      // math css-tree's grammar does not know (pow(), sqrt()) is read too.
      const plain = mathAsValues(ast);
      return plain?.every(
        x => !match(lexer, parse(x, {context: 'value'})).error,
      )
        ? ast
        : null;
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
  'pow',
  'sqrt',
  'hypot',
  'log',
  'exp',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
]);

/** The CSS type of each unit a math function may hold. */
const UNIT_TYPES = /** @type {Record<string, string>} */ (
  Object.fromEntries(
    Object.entries({
      length: [
        'px',
        'em',
        'rem',
        'ex',
        'rex',
        'ch',
        'rch',
        'cap',
        'rcap',
        'ic',
        'ric',
        'lh',
        'rlh',
        'vw',
        'vh',
        'vi',
        'vb',
        'vmin',
        'vmax',
        'svw',
        'svh',
        'svi',
        'svb',
        'svmin',
        'svmax',
        'lvw',
        'lvh',
        'lvi',
        'lvb',
        'lvmin',
        'lvmax',
        'dvw',
        'dvh',
        'dvi',
        'dvb',
        'dvmin',
        'dvmax',
        'cqw',
        'cqh',
        'cqi',
        'cqb',
        'cqmin',
        'cqmax',
        'cm',
        'mm',
        'q',
        'in',
        'pt',
        'pc',
      ],
      time: ['s', 'ms'],
      angle: ['deg', 'grad', 'rad', 'turn'],
      frequency: ['hz', 'khz'],
      resolution: ['dpi', 'dpcm', 'dppx', 'x'],
    }).flatMap(([type, units]) => units.map(u => [u, type])),
  )
);
/** A value of each type, to match where a math function stands. */
const TYPE_SAMPLES = /** @type {Record<string, string>} */ ({
  number: '1',
  percent: '1%',
  length: '1px',
  time: '1s',
  angle: '1deg',
  frequency: '1hz',
  resolution: '1dppx',
});

/**
 * The type of a sum (or of the arguments of min(), max(), clamp()):
 * both sides of one type, a percentage beside a length or another type
 * (`length%`: it resolves against that type), or null when they do not mix.
 * `any` is a var() or env(), which can be anything.
 * @param {string | null} a
 * @param {string | null} b
 */
function addTypes(a, b) {
  if (a == null || b == null) return null;
  if (a === 'any') return b;
  if (b === 'any') return a;
  if (a === b) return a;
  const bare = (/** @type {string} */ t) => t.replace(/%$/, '');
  if (a === 'number' || b === 'number') return null;
  if (a === 'percent') return `${bare(b)}%`;
  if (b === 'percent') return `${bare(a)}%`;
  return bare(a) === bare(b) ? `${bare(a)}%` : null;
}

/**
 * The CSS type of a math function (`calc(4px + 2)` has none): a sum needs
 * one type on both sides; a product needs a number on one side; a quotient
 * needs a number on the right. null when the math is unsound.
 * @param {any} fn a Function node
 * @returns {string | null}
 */
function mathType(fn) {
  /** @param {any} node @returns {string | null} */
  const leaf = node => {
    if (node.type === 'Number') return 'number';
    if (node.type === 'Percentage') return 'percent';
    if (node.type === 'Dimension')
      return UNIT_TYPES[node.unit.toLowerCase()] ?? null;
    if (node.type === 'Identifier') {
      const w = node.name.toLowerCase();
      if (['e', 'pi', 'infinity', '-infinity', 'nan'].includes(w))
        return 'number';
      // clamp() takes none for a bound it does not set.
      if (w === 'none' && fn.name.toLowerCase() === 'clamp') return 'any';
      return null;
    }
    if (node.type === 'Function') {
      const name = node.name.toLowerCase();
      if (name === 'var' || name === 'env') return 'any';
      return MATH.has(name) ? mathType(node) : null;
    }
    if (node.type === 'Parentheses') return expression(node.children.toArray());
    return null;
  };
  /** @param {any[]} nodes @returns {string | null} */
  const expression = nodes => {
    const items = nodes.filter(n => n.type !== 'WhiteSpace');
    if (!items.length) return null;
    // Products first, then sums.
    /** @type {Array<string | null>} */
    const terms = [];
    let current = /** @type {string | null | undefined} */ (undefined);
    let op = '';
    for (const node of items) {
      if (node.type === 'Operator') {
        const o = String(node.value).trim();
        if (current === undefined) return null;
        if (o === '+' || o === '-') {
          terms.push(current);
          current = undefined;
        } else op = o;
        continue;
      }
      const t = leaf(node);
      if (current === undefined) current = t;
      else if (op === '*')
        current =
          current === 'number'
            ? t
            : t === 'number'
              ? current
              : current === 'any' || t === 'any'
                ? 'any'
                : null;
      else if (op === '/')
        current = t === 'number' || t === 'any' ? current : null;
      else return null;
      op = '';
      if (current == null) return null;
    }
    if (current === undefined || op) return null;
    terms.push(current);
    return terms.reduce((a, b) => addTypes(a, b));
  };
  const children = fn.children.toArray();
  const name = fn.name.toLowerCase();
  // Arguments split at commas; round() may open with a strategy word.
  /** @type {any[][]} */
  const args = [[]];
  for (const n of children)
    if (n.type === 'Operator' && String(n.value).trim() === ',') args.push([]);
    else args[args.length - 1].push(n);
  if (
    name === 'round' &&
    args.length > 1 &&
    args[0].filter(n => n.type !== 'WhiteSpace').length === 1 &&
    ['nearest', 'up', 'down', 'to-zero'].includes(
      String(args[0].find(n => n.type === 'Identifier')?.name).toLowerCase(),
    )
  )
    args.shift();
  const types = args.map(expression);
  if (types.some(t => t == null)) return null;
  /** @param {string | null} t */
  const isNumber = t => t === 'number' || t === 'any';
  // What each function takes and gives, as CSS Values 4 types them.
  switch (name) {
    case 'pow':
      return types.length === 2 && types.every(isNumber) ? 'number' : null;
    case 'sqrt':
    case 'exp':
      return types.length === 1 && isNumber(types[0]) ? 'number' : null;
    case 'log':
      return types.length <= 2 && types.every(isNumber) ? 'number' : null;
    case 'sin':
    case 'cos':
    case 'tan':
      return types.length === 1 && (isNumber(types[0]) || types[0] === 'angle')
        ? 'number'
        : null;
    case 'asin':
    case 'acos':
    case 'atan':
      return types.length === 1 && isNumber(types[0]) ? 'angle' : null;
    case 'atan2':
      return types.length === 2 && addTypes(types[0], types[1])
        ? 'angle'
        : null;
    case 'sign':
      return types.length === 1 ? 'number' : null;
    case 'abs':
    case 'calc':
      return types.length === 1 ? types[0] : null;
    case 'mod':
    case 'rem':
      return types.length === 2 ? addTypes(types[0], types[1]) : null;
    case 'round':
      return types.length <= 2 ? types.reduce((a, b) => addTypes(a, b)) : null;
    default:
      // min(), max(), clamp() and hypot(): arguments of one type.
      if (name === 'clamp' && types.length !== 3) return null;
      return types.reduce((a, b) => addTypes(a, b));
  }
}

/**
 * The value with each outermost math function put as plain values of its
 * type (`calc(1px + 2px)` as `1px`), so the property's grammar decides
 * whether that type may stand there; a percentage beside a length is tried
 * as both. Null when a math function is unsound. A value with no math
 * function gives itself.
 * @param {any} ast
 * @returns {string[] | null}
 */
function mathAsValues(ast) {
  const t = csstree();
  /** @type {Array<{text: string, samples: string[]}>} */
  const found = [];
  let sound = true;
  t.walk(ast, {
    enter(/** @type {any} */ node) {
      if (node.type !== 'Function' || !MATH.has(node.name.toLowerCase()))
        return undefined;
      const type = mathType(node);
      if (type == null) sound = false;
      else if (type !== 'any')
        found.push({
          text: t.generate(node),
          samples: type.endsWith('%')
            ? [TYPE_SAMPLES[type.slice(0, -1)], '1%']
            : [TYPE_SAMPLES[type] ?? ''],
        });
      return t.walk.skip;
    },
  });
  if (!sound || found.some(f => f.samples.some(x => !x))) return null;
  /** @type {string[]} */
  let out = [t.generate(ast)];
  // Spaced, so a value that follows with no space stays its own token.
  for (const f of found)
    out = out.flatMap(v => f.samples.map(x => v.replace(f.text, ` ${x} `)));
  return out.slice(0, 16);
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
      } else if (n.type === 'Property' && !seen.has(`'${n.name}'`)) {
        // A shorthand's longhands (<'text-decoration-line'>) hold its words.
        seen.add(`'${n.name}'`);
        walk(t.lexer.getProperty(n.name)?.syntax);
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
  // MDN writes a note, not a value, where the initial value varies
  // (dependsOnUserAgent): one camelCase word, never a CSS value.
  return typeof initial === 'string' &&
    !/^[a-z]+[A-Z]\w*$/.test(initial) &&
    matchValue(prop, initial)
    ? initial
    : null;
}

/** The longhand each type of the `font` grammar sets, where css-tree names a type, not a property. */
const FONT_TYPE_LONGHAND = /** @type {Record<string, string>} */ ({
  'font-variant-css2': 'font-variant-caps',
  'font-width-css3': 'font-stretch',
  'font-stretch-absolute': 'font-stretch',
  'system-family-name': 'system',
});

/**
 * The parts of a CSS `font` value, by the longhand each sets, as written:
 * `italic small-caps 700 1rem/1 Arial` gives font-style, font-variant-caps,
 * font-weight, font-size, line-height and font-family. A system font
 * keyword (`caption`) is `system`. A single keyword of one longhand
 * (`bold`) is that longhand. Null for anything else.
 * @param {string} value
 * @returns {Record<string, string> | null}
 */
export function fontShorthandParts(value) {
  const {lexer, parse, generate} = csstree();
  const word = value.trim().toLowerCase();
  if (/^[a-z-]+$/.test(word))
    for (const prop of [
      'font-weight',
      'font-style',
      'font-variant-caps',
      'font-stretch',
    ])
      if (keywordsOf(prop).includes(word)) return {[prop]: word};
  /** @type {any} */
  let ast;
  try {
    ast = parse(value, {context: 'value', positions: true});
  } catch {
    return null;
  }
  const r = lexer.matchProperty('font', ast);
  if (r.error || !r.matched) return null;
  /** @type {Record<string, any[]>} */
  const parts = {};
  /** @param {any} m @param {string | null} under */
  const visit = (m, under) => {
    const syntax = m.syntax;
    const name =
      under === 'font-family'
        ? under
        : syntax?.type === 'Property' && syntax.name !== 'font'
          ? String(syntax.name)
          : syntax?.type === 'Type' && FONT_TYPE_LONGHAND[syntax.name]
            ? FONT_TYPE_LONGHAND[syntax.name]
            : syntax?.type === 'Type' && /family/.test(syntax.name)
              ? 'font-family'
              : under;
    if (m.node && name) (parts[name] ??= []).push(m.node);
    for (const c of m.match ?? []) visit(c, name);
  };
  visit(r.matched, null);
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, nodes] of Object.entries(parts)) {
    // The family list is the rest of the value, as written.
    out[k] =
      k === 'font-family'
        ? value.slice(nodes[0].loc?.start.offset ?? 0).trim()
        : nodes.map(n => generate(n)).join(' ');
  }
  return Object.keys(out).length ? out : null;
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

/** The math functions, by name, for a check of whether a value holds one. */
export const MATH_FUNCTION = new RegExp(`\\b(${[...MATH].join('|')})\\(`, 'i');

/** @type {Map<string, boolean>} */
const percentCache = new Map();
/**
 * Whether a property's grammar takes a percentage anywhere, through the
 * types it names (padding does; border-width and outline-offset do not).
 * @param {string} prop
 */
export function takesPercentage(prop) {
  const known = percentCache.get(prop);
  if (known != null) return known;
  const t = csstree();
  const seen = new Set();
  let found = false;
  /** @param {any} syntax */
  const walk = syntax => {
    if (!syntax || found) return;
    t.definitionSyntax.walk(syntax, (/** @type {any} */ n) => {
      if (found) return;
      if (n.type === 'Type') {
        if (/percentage/.test(n.name)) found = true;
        else if (!seen.has(n.name)) {
          seen.add(n.name);
          walk(t.lexer.types[n.name]?.syntax);
        }
      } else if (n.type === 'Property' && !seen.has(`'${n.name}'`)) {
        seen.add(`'${n.name}'`);
        walk(t.lexer.properties[n.name]?.syntax);
      }
    });
  };
  walk(propertyGrammar(prop));
  percentCache.set(prop, found);
  return found;
}
