// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The values a theme gives that Core writes as they are but no browser
 * reads: a token or part value that is no text (an object, a boolean, a
 * number no CSS value holds, an array in a part), a [light, dark] pair with
 * a missing half or another count, a token that reads itself, and a token's
 * var() that reads nothing.
 *
 * @input  a theme as the build holds it (raw defineTheme input or a resolved
 *         theme), and the names a var() reads a value from
 * @output one entry per such value, with its key path and why
 * @position Sits beside build.mjs, null-values.mjs and style-keys.mjs
 *           (api/theme/build/). A theme that built before still builds the
 *           same, so the build warns each at its line; the editor refuses
 *           the same values.
 */

import {
  cssTree,
  keptCssTreeAnswer,
} from '../../../foundation/runtime/css-tree.mjs';

/** @param {unknown} value @returns {value is Record<string, any>} */
const isBlock = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * A block of keys, as a theme writes one: a plain object. An instance of a
 * class (a Date) is a value, which the build writes as its text.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
const isPlainBlock = value =>
  isBlock(value) && Object.prototype.toString.call(value) === '[object Object]';

/**
 * A primitive's boxed form (`new String('4px')`, `Object(4)`), or false.
 * Core writes a token's value as text, which unboxes it.
 * @param {unknown} value
 */
const boxed = value =>
  isBlock(value) &&
  /^\[object (?:String|Number|Boolean)\]$/.test(
    Object.prototype.toString.call(value),
  );

/**
 * A JSON replacer that writes a BigInt as its digits, the text Core writes
 * into the stylesheet for it: JSON itself has no BigInt.
 * @param {string} _key
 * @param {unknown} value
 */
export const bigIntAsText = (_key, value) =>
  typeof value === 'bigint' ? String(value) : value;

/**
 * A value as the build hands it to Core: each BigInt in it, in plain
 * objects and arrays at any depth, replaced by its digits, and each boxed
 * primitive (`new String('4px')`) by its primitive. The same object where
 * it holds none, so a theme without one is handed on as it is. The value
 * judge reads values by the same rules, so what is warned is what is
 * written.
 * @template T
 * @param {T} value
 * @param {Map<any, any>} [done] each object already replaced, for one that holds itself
 * @returns {T}
 */
export function writtenPrimitives(value, done = new Map()) {
  if (typeof value === 'bigint') return /** @type {any} */ (String(value));
  if (boxed(value)) return /** @type {any} */ (value).valueOf();
  if (!Array.isArray(value) && !isPlainBlock(value)) return value;
  if (done.has(value)) return done.get(value);
  done.set(value, value);
  /** @type {any} */
  let copy = null;
  for (const [k, v] of Object.entries(value)) {
    const next = writtenPrimitives(v, done);
    if (next === v) continue;
    copy ??= Array.isArray(value) ? [...value] : {...value};
    copy[k] = next;
  }
  if (copy) done.set(value, copy);
  return copy ?? value;
}

/**
 * The JSON text Core writes for an object a part holds as a value, where it
 * writes a BigInt as its digits (the build hands Core its digits); null for
 * an object that holds itself, which has no JSON text.
 * @param {unknown} value
 * @returns {string | null}
 */
export function partJsonText(value) {
  try {
    return JSON.stringify(value, bigIntAsText);
  } catch {
    return null;
  }
}

/** What the build writes for a value, as Core writes it (as text). @param {unknown} value */
const writtenAs = value => {
  try {
    return String(value);
  } catch {
    return null;
  }
};

/**
 * @typedef {{path: string[], why: string, unbuildable?: boolean}} WrittenValueProblem
 *   `unbuildable`: a value Core cannot write at all, so the build stops
 */

/**
 * Why a value no browser reads as one, as Core writes it, or null.
 * @param {string} key
 * @param {unknown} value
 */
function nonText(key, value) {
  if (boxed(value)) return nonText(key, /** @type {any} */ (value).valueOf());
  if (typeof value === 'boolean')
    return `${key} holds ${value}, which the build writes as it is (${key}: ${value}), a value no browser reads: give it a CSS value in quotes`;
  if (typeof value === 'number' && !Number.isFinite(value))
    return `${key} holds ${value}, a number no CSS value holds (a computed value gone wrong, such as a division by zero), which the build writes as it is: give it a CSS value in quotes`;
  if (typeof value === 'bigint')
    return `${key} holds ${value}n, a BigInt, which the build writes as ${value}: give it a CSS value in quotes`;
  if (typeof value === 'function')
    return `${key} holds a function, which the build writes as its source text (${writtenAs(value)?.replace(/\s+/g, ' ').slice(0, 60)}), a value no browser reads: call it, or give it a CSS value in quotes`;
  if (typeof value === 'symbol')
    return `${key} holds a symbol, which the build cannot write as text: give it a CSS value in quotes`;
  if (isBlock(value))
    return `${key} holds an object, which the build writes as ${writtenAs(value) ?? 'no text'}, a value no browser reads: give it a CSS value in quotes${isPlainBlock(value) && ('light' in value || 'dark' in value) ? ", or a [light, dark] pair such as ['#fff', '#000']" : ''}`;
  return null;
}

/**
 * Why a token value is written as no value a browser reads, or null.
 * @param {string} key
 * @param {unknown} value
 * @param {(name: string) => boolean} [reads] whether a var() of a name reads
 *   a value
 */
function tokenValueProblem(key, value, reads) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const shown = `light-dark(${value.map(String).join(', ')})`;
    if (value.length !== 2)
      return `${key} holds ${value.length} values, but a [light, dark] pair holds two, so the build writes ${value.length === 0 ? 'light-dark(undefined, undefined)' : `light-dark() from the first two`}, which the browser drops: give it ['<light>', '<dark>']`;
    const missing = value.findIndex(h => h === null || h === undefined);
    if (missing !== -1)
      return `${key} gives no ${missing === 0 ? 'light' : 'dark'} half, so the build writes ${shown}, and the browser drops the whole value, in both modes: give both halves, or one value for both modes`;
    const halves = value.map(h => (boxed(h) ? h.valueOf() : h));
    const half = halves.find(
      h => typeof h !== 'string' && typeof h !== 'number',
    );
    if (half !== undefined)
      return `${key} holds a half that is no text (${typeof half}), so the build writes ${shown}, which the browser drops: give each half a CSS value in quotes`;
    // light-dark() takes two colors: an empty half or a number is none.
    const empty = halves.findIndex(
      h => typeof h === 'string' && h.trim() === '',
    );
    if (empty !== -1)
      return `${key} gives an empty ${empty === 0 ? 'light' : 'dark'} half, so the build writes ${shown}, and the browser drops the whole value, in both modes: give both halves a color, or one value for both modes`;
    const number = halves.findIndex(h => typeof h === 'number');
    if (number !== -1)
      return `${key} gives the number ${halves[number]} as its ${number === 0 ? 'light' : 'dark'} half, so the build writes ${shown}, and light-dark() takes colors only, so the browser drops the whole value, in both modes: give both halves a color, or one value for both modes`;
    return null;
  }
  const bad = nonText(key, value);
  if (bad) return bad;
  if (boxed(value)) value = /** @type {any} */ (value).valueOf();
  if (typeof value !== 'string') return null;
  for (const [, name, comma] of value.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/gi)) {
    if (comma || name === key) continue;
    if (reads && !reads(name))
      return `${key} reads var(${name}), which no token sets, so it has no value and the browser drops what reads it: read a token, or give a fallback (var(${name}, <value>))`;
  }
  return null;
}

/**
 * Why a token's name or empty value sets no token, or null: a name that does
 * not start with exactly two dashes (`-color-accent`, `---color-border`),
 * or an empty value.
 * @param {string} key @param {unknown} value
 * @param {(name: string) => boolean} isProperty whether a name is a CSS
 *   property's
 */
function tokenNameProblem(key, value, isProperty) {
  if (value === undefined) return null;
  // A CSS property set on the theme's root (Core sets color-scheme on a
  // surface) styles it; any other name is no declaration a browser reads.
  if (!key.startsWith('--') && isProperty(key)) return null;
  if (!key.startsWith('--'))
    return `${key} is no token name: the build writes it as a declaration on the theme's root, which no browser reads as a token; a token name starts with two dashes, such as --${key.replace(/^-+/, '')}`;
  if (key.startsWith('---'))
    return `${key} starts with three dashes, so it sets a custom property no token or part reads: a token name starts with two, such as --${key.replace(/^-+/, '')}`;
  if (typeof value === 'string' && value.trim() === '')
    return `${key} holds an empty value, so the build writes ${key}: ; and what reads it gets nothing: give it a value, or leave it out`;
  return null;
}

/** @param {unknown} value @returns {string[]} the custom properties a value's var()s read */
const varNames = value =>
  (Array.isArray(value) ? value : [value]).flatMap(part =>
    typeof part === 'string'
      ? [...part.matchAll(/var\(\s*(--[\w-]+)/gi)].map(m => m[1])
      : [],
  );

/**
 * The custom properties set on one element that `name` reads back to
 * itself through, `name` first and last (`--a`, `--b`, `--a`), or null. CSS
 * gives each custom property in such a cycle no value, a var() fallback
 * included.
 * @param {string} name
 * @param {Record<string, unknown>} values the custom properties set on that element
 * @returns {string[] | null}
 */
export function customPropertyCycle(name, values) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} at @param {string[]} trail @returns {string[] | null} */
  const walk = (at, trail) => {
    for (const next of varNames(values[at])) {
      if (next === name) return [...trail, next];
      if (seen.has(next) || !(next in values) || trail.length > 32) continue;
      seen.add(next);
      const found = walk(next, [...trail, next]);
      if (found) return found;
    }
    return null;
  };
  return walk(name, [name]);
}

/**
 * Why a custom property reads itself back, as `customPropertyCycle` finds
 * it, or null.
 * @param {string} name @param {Record<string, unknown>} values
 */
export function cycleProblem(name, values) {
  const cycle = customPropertyCycle(name, values);
  if (!cycle) return null;
  return cycle.length === 2
    ? `${name} reads var(${name}), itself, so it has no value at all (a var() fallback does not count) and the browser drops what reads it: give it a value, or read another token`
    : `${name} reads ${cycle
        .slice(1)
        .map(n => `var(${n})`)
        .join(
          ', which reads ',
        )}: they read each other, so none has a value (a var() fallback does not count) and the browser drops what reads them: give one of them a value`;
}

/**
 * Every value in a theme that Core writes as it is but no browser reads: in
 * its tokens and local tokens, and in its parts' properties, on the page,
 * its surfaces (onDark, onLight) and the adaptation rules' values.
 * @param {Record<string, any>} theme
 * @param {{reads?: (name: string) => boolean, rootTokens?: Record<string, unknown>, surfaceDefaults?: {onDark?: Record<string, unknown>, onLight?: Record<string, unknown>}}} [options]
 *   `reads`: whether a var() of a name reads a value (left out, var()
 *   targets are not judged); `rootTokens`: the token definitions Core's
 *   stylesheet sets on the theme's root too, which a loop of the page's
 *   tokens can run through; `surfaceDefaults`: the tokens Core itself sets
 *   on each media surface, which a resolved surface carries: a loop runs
 *   through them, but they are Core's, not the theme's, so none is named
 * @returns {WrittenValueProblem[]}
 */
export function writtenValueProblems(theme, options = {}) {
  // A token name that is no custom property's is a CSS property's or no
  // token's, and only css-tree tells them apart. The names the check asks
  // about are found first, and css-tree's answer for them is kept between
  // runs (keptCssTreeAnswer).
  /** @type {Set<string>} */
  const asked = new Set();
  const first = valueProblems(theme, options, name => {
    asked.add(name);
    return false;
  });
  if (asked.size === 0) return first;
  const properties = new Set(
    keptCssTreeAnswer('css-property-names', [...asked].sort(), names =>
      names.filter(name => name in cssTree().lexer.properties),
    ),
  );
  return valueProblems(theme, options, name => properties.has(name));
}

/**
 * {@link writtenValueProblems}, with whether a token name is a CSS
 * property's from `isProperty`.
 * @param {Record<string, any>} theme
 * @param {NonNullable<Parameters<typeof writtenValueProblems>[1]>} options
 * @param {(name: string) => boolean} isProperty
 * @returns {WrittenValueProblem[]}
 */
function valueProblems(
  theme,
  {reads, rootTokens, surfaceDefaults},
  isProperty,
) {
  /** @type {WrittenValueProblem[]} */
  const out = [];
  /** @param {any} node @param {string[]} at @param {number} depth */
  const part = (node, at, depth) => {
    if (!isBlock(node) || depth > 12) return;
    for (const [k, v] of Object.entries(node)) {
      if (isPlainBlock(v)) {
        part(v, [...at, k], depth + 1);
        continue;
      }
      if (typeof v === 'symbol') {
        out.push({
          path: [...at, k],
          why: `${k} holds a symbol, which has no text the build can write: give it a CSS value in quotes`,
          unbuildable: true,
        });
        continue;
      }
      // A boxed primitive is handed to Core as its primitive, so it is
      // judged as that.
      if (boxed(v)) {
        const why = nonText(k, /** @type {any} */ (v).valueOf());
        if (why) out.push({path: [...at, k], why});
        continue;
      }
      // Core writes an object a part holds as a value (an array, a Date) as
      // its JSON text.
      if (Array.isArray(v) || isBlock(v)) {
        const text = partJsonText(v);
        const what = Array.isArray(v) ? 'an array' : 'an object';
        out.push(
          text == null
            ? {
                path: [...at, k],
                why: `${k} holds ${what} that holds itself, which has no text the build can write: give it a CSS value in quotes`,
                unbuildable: true,
              }
            : {
                path: [...at, k],
                why: `${k} holds ${what}, which the build writes as JSON text (${text}), a value no browser reads: give it a CSS value in quotes`,
              },
        );
        continue;
      }
      const why =
        nonText(k, v) ??
        (k.startsWith('--') ? cycleProblem(k, ownCustom(node)) : null);
      if (why) out.push({path: [...at, k], why});
    }
  };
  /** @param {Record<string, unknown>} node the custom properties a block sets on its element */
  const ownCustom = node =>
    Object.fromEntries(
      Object.entries(node).filter(([k]) => k.startsWith('--')),
    );
  /**
   * @param {any} surface @param {string[]} at
   * @param {Record<string, unknown>} [defaults] the tokens Core sets there
   */
  const visit = (surface, at, defaults = {}) => {
    if (!isBlock(surface) || '__built' in surface) return;
    // A defined theme's tokens are resolved (a pair is already its
    // light-dark() text); the ones its author wrote are `__inputTokens`.
    /** @param {string} map */
    const valuesOf = map =>
      map === 'tokens' && '__inputTokens' in surface
        ? surface.__inputTokens
        : surface[map];
    // Tokens and local tokens are set on the same element; on the page's
    // root, so are Core's token definitions and the tokens the theme takes
    // from the theme it extends (the resolved tokens), under the theme's own.
    const page = at.length === 0;
    const onElement = {
      ...(page ? (rootTokens ?? {}) : {}),
      ...(page && '__inputTokens' in surface && isBlock(surface.tokens)
        ? surface.tokens
        : {}),
      ...(isBlock(valuesOf('localTokens')) ? valuesOf('localTokens') : {}),
      ...(isBlock(valuesOf('tokens')) ? valuesOf('tokens') : {}),
    };
    for (const map of ['tokens', 'localTokens']) {
      const values = valuesOf(map);
      if (isBlock(values))
        for (const [k, v] of Object.entries(values)) {
          if (
            map === 'tokens' &&
            Object.hasOwn(defaults, k) &&
            defaults[k] === v
          )
            continue;
          // Core writes a token's value as text: a symbol has none, and an
          // object that holds itself cannot be read for one.
          if (
            typeof v === 'symbol' ||
            (isBlock(v) && !boxed(v) && partJsonText(v) == null)
          ) {
            out.push({
              path: [...at, map, k],
              why: `${k} holds ${typeof v === 'symbol' ? 'a symbol' : 'an object that holds itself'}, which has no text the build can write: give it a CSS value in quotes`,
              unbuildable: true,
            });
            continue;
          }
          const why =
            tokenNameProblem(k, v, isProperty) ??
            tokenValueProblem(k, v, reads) ??
            cycleProblem(k, onElement);
          if (why) out.push({path: [...at, map, k], why});
        }
    }
    if (isBlock(surface.components))
      for (const [name, styles] of Object.entries(surface.components))
        if (isBlock(styles))
          for (const [key, rules] of Object.entries(styles))
            part(rules, [...at, 'components', name, key], 0);
  };
  visit(theme, []);
  visit(theme.onDark ?? theme.__onDark, ['onDark'], surfaceDefaults?.onDark);
  visit(
    theme.onLight ?? theme.__onLight,
    ['onLight'],
    surfaceDefaults?.onLight,
  );
  const rules = theme.adaptations?.rules ?? theme.__adaptations?.rules;
  if (Array.isArray(rules))
    rules.forEach((rule, i) =>
      visit(rule?.value, ['adaptations', 'rules', String(i), 'value']),
    );
  return out;
}
