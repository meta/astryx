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

/** @param {unknown} value @returns {value is Record<string, any>} */
const isBlock = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * @typedef {{path: string[], why: string}} WrittenValueProblem
 */

/**
 * Why a value no browser reads as one, as Core writes it, or null.
 * @param {string} key
 * @param {unknown} value
 */
function nonText(key, value) {
  if (typeof value === 'boolean')
    return `${key} holds ${value}, which the build writes as it is (${key}: ${value}), a value no browser reads: give it a CSS value in quotes`;
  if (typeof value === 'number' && !Number.isFinite(value))
    return `${key} holds ${value}, a number no CSS value holds (a computed value gone wrong, such as a division by zero), which the build writes as it is: give it a CSS value in quotes`;
  if (isBlock(value))
    return `${key} holds an object, which the build writes as [object Object], a value no browser reads: give it a CSS value in quotes${'light' in value || 'dark' in value ? ", or a [light, dark] pair such as ['#fff', '#000']" : ''}`;
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
    const half = value.find(
      h => typeof h !== 'string' && typeof h !== 'number',
    );
    return half === undefined
      ? null
      : `${key} holds a half that is no text (${typeof half}), so the build writes ${shown}, which the browser drops: give each half a CSS value in quotes`;
  }
  const bad = nonText(key, value);
  if (bad) return bad;
  if (typeof value !== 'string') return null;
  for (const [, name, comma] of value.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
    if (comma) continue;
    if (name === key)
      return `${key} reads var(${key}), itself, so it has no value at all and the browser drops what reads it: give it a value, or read another token`;
    if (reads && !reads(name))
      return `${key} reads var(${name}), which no token sets, so it has no value and the browser drops what reads it: read a token, or give a fallback (var(${name}, <value>))`;
  }
  return null;
}

/**
 * Every value in a theme that Core writes as it is but no browser reads: in
 * its tokens and local tokens, and in its parts' properties, on the page,
 * its surfaces (onDark, onLight) and the adaptation rules' values.
 * @param {Record<string, any>} theme
 * @param {{reads?: (name: string) => boolean}} [options] `reads`: whether a
 *   var() of a name reads a value (left out, var() targets are not judged)
 * @returns {WrittenValueProblem[]}
 */
export function writtenValueProblems(theme, {reads} = {}) {
  /** @type {WrittenValueProblem[]} */
  const out = [];
  /** @param {any} node @param {string[]} at @param {number} depth */
  const part = (node, at, depth) => {
    if (!isBlock(node) || depth > 12) return;
    for (const [k, v] of Object.entries(node)) {
      if (isBlock(v)) {
        part(v, [...at, k], depth + 1);
        continue;
      }
      const why = Array.isArray(v)
        ? `${k} holds an array, which the build writes as JSON text (${JSON.stringify(v)}), a value no browser reads: give it a CSS value in quotes`
        : nonText(k, v);
      if (why) out.push({path: [...at, k], why});
    }
  };
  /** @param {any} surface @param {string[]} at */
  const visit = (surface, at) => {
    if (!isBlock(surface) || '__built' in surface) return;
    for (const map of ['tokens', 'localTokens']) {
      // A defined theme's tokens are resolved (a pair is already its
      // light-dark() text); the ones its author wrote are `__inputTokens`.
      const values =
        map === 'tokens' && '__inputTokens' in surface
          ? surface.__inputTokens
          : surface[map];
      if (isBlock(values))
        for (const [k, v] of Object.entries(values)) {
          const why = tokenValueProblem(k, v, reads);
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
  visit(theme.onDark ?? theme.__onDark, ['onDark']);
  visit(theme.onLight ?? theme.__onLight, ['onLight']);
  const rules = theme.adaptations?.rules ?? theme.__adaptations?.rules;
  if (Array.isArray(rules))
    rules.forEach((rule, i) =>
      visit(rule?.value, ['adaptations', 'rules', String(i), 'value']),
    );
  return out;
}
