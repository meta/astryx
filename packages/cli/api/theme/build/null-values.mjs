// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The places a theme gives null where the build reads a block or a
 * value, each with the line of the theme source that writes it.
 *
 * @input  a theme as the build holds it (raw defineTheme input or a resolved
 *         theme) and the theme module's source text
 * @output one line per null, with its key path and source line, and whether
 *         Core can build it at all
 * @position Sits beside build.mjs (api/theme/build/). A null part or style
 *           key makes Core throw a raw TypeError, so the build refuses it
 *           before Core sees it. A null value keeps its meaning (Core
 *           writes it as it is), so the build only warns.
 */

import {sourcePlugins} from './source-syntax.mjs';
import {babelParse as parse} from '../../../foundation/runtime/lazy-dependencies.mjs';

const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
]);

/** @param {unknown} value @returns {value is Record<string, any>} */
const isBlock = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * A key inside a part's block that holds a block of its own: a pseudo-class
 * or pseudo-element, an at-rule (`@media`, `@dark`) or a nesting selector.
 * @param {string} key
 */
const holdsBlock = key => /^[:@&[]/.test(key);

/**
 * @typedef {{path: string[], why: string, unbuildable: boolean}} NullValue
 */

/**
 * What a null property builds, and the fix. Null has a meaning, unlike a
 * boolean or NaN: it leaves the property unset, so it is warned, never
 * refused. The browser drops the declaration, so the base theme's value
 * stays.
 * @param {string} key
 */
const written = key =>
  `${key} holds null; null leaves it unset: the build writes it as it is (${key}: null), which no browser reads, so the base theme's value stays; to set it, give it a CSS value, or leave it undefined to write nothing`;

/**
 * What a null token builds, and the fix. A custom property takes any text,
 * so a browser keeps `--token: null` as the token's value, not the base
 * theme's. A property reading it gets the word `null`: one that takes a
 * name (font-family reads it as a font no system has) falls back as it
 * would for any missing name; any other is invalid there and acts as if
 * unset.
 * @param {string} key
 */
const writtenToken = key =>
  `${key} holds null; the build writes it as it is (${key}: null), and a browser keeps that as the token's value, not the base theme's, so a property that reads ${key} gets the word null: most act as if they were not set (an inherited one, such as a text color, takes the surrounding value; another takes its initial one: a background goes transparent, a border takes the text color), and a font family reads it as a font no system has, so its text shows in the browser's default font: to keep the base theme's value, leave it undefined; to set it, give it a CSS value`;

/**
 * Every place a theme gives null where the build reads a part, a style key's
 * block, a property or a token value: the surfaces (onDark, onLight), the
 * adaptation rules' values, and the page itself. An undefined value is not
 * set, so it is not one of them.
 * @param {Record<string, any>} theme
 * @returns {NullValue[]}
 */
export function nullThemeValues(theme) {
  /** @type {NullValue[]} */
  const out = [];
  /** @param {any} block @param {string[]} at */
  const surface = (block, at) => {
    if (!isBlock(block)) return;
    for (const map of ['tokens', 'localTokens'])
      if (isBlock(block[map]))
        for (const [k, v] of Object.entries(block[map]))
          if (v === null)
            out.push({
              path: [...at, map, k],
              why: writtenToken(k),
              unbuildable: false,
            });
    if (!isBlock(block.components)) return;
    for (const [name, styles] of Object.entries(block.components)) {
      const here = [...at, 'components', name];
      if (styles === null) {
        out.push({
          path: here,
          why: `${name} holds null, which the build cannot read as a part's style keys: give it style keys, such as ${name}: {base: {…}}, or remove it`,
          unbuildable: true,
        });
        continue;
      }
      if (!isBlock(styles)) continue;
      for (const [key, rules] of Object.entries(styles)) {
        if (rules === null) {
          out.push({
            path: [...here, key],
            why: `${key} holds null, which the build cannot read as a block of properties: give it properties, such as ${key}: {color: …}, or remove it`,
            unbuildable: true,
          });
          continue;
        }
        part(rules, [...here, key], 0);
      }
    }
  };
  /** @param {any} node @param {string[]} at @param {number} depth */
  const part = (node, at, depth) => {
    if (!isBlock(node) || depth > 12) return;
    for (const [k, v] of Object.entries(node)) {
      if (v === null)
        out.push({
          path: [...at, k],
          why: holdsBlock(k)
            ? `${k} holds null, so the build writes no block for it: give it properties, or remove it`
            : k.startsWith('--')
              ? writtenToken(k)
              : written(k),
          unbuildable: false,
        });
      else part(v, [...at, k], depth + 1);
    }
  };
  surface(theme, []);
  surface(theme.onDark ?? theme.__onDark, ['onDark']);
  surface(theme.onLight ?? theme.__onLight, ['onLight']);
  const rules = theme.adaptations?.rules ?? theme.__adaptations?.rules;
  if (Array.isArray(rules))
    rules.forEach((rule, i) =>
      surface(rule?.value, ['adaptations', 'rules', String(i), 'value']),
    );
  return out;
}

/**
 * The line of a module's source that writes the key at the end of a key
 * path (`components.button.base`): the first object property whose own key
 * and the keys of the properties and array items around it end with that
 * path. Null when the source does not write it as one literal (a spread,
 * an import, a computed key).
 * @param {string} source
 * @param {string[]} keyPath
 * @param {string} [file] the source's file name, which says whether it is
 *   read with JSX (a `.ts` file is not)
 * @returns {number | null}
 */
export function keyPathLine(source, keyPath, file) {
  /** @type {any} */
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'unambiguous',
      plugins: sourcePlugins(file),
    });
  } catch {
    return null;
  }
  /** @param {any} node @returns {string | null} */
  const keyOf = node =>
    node?.type === 'Identifier'
      ? node.name
      : node?.type === 'StringLiteral'
        ? node.value
        : node?.type === 'NumericLiteral'
          ? String(node.value)
          : null;
  /** @param {string[]} stack */
  const ends = stack =>
    stack.length >= keyPath.length &&
    keyPath.every((k, i) => stack[stack.length - keyPath.length + i] === k);
  /** @type {number | null} */
  let found = null;
  /** @param {any} node @param {string[]} stack */
  const visit = (node, stack) => {
    if (found != null || !node || typeof node !== 'object') return;
    if (node.type === 'ObjectExpression') {
      for (const p of node.properties) {
        if (p.type !== 'ObjectProperty') continue;
        const k = p.computed ? null : keyOf(p.key);
        if (k == null) continue;
        const next = [...stack, k];
        if (ends(next)) {
          found = p.loc?.start?.line ?? null;
          return;
        }
        visit(p.value, next);
      }
      return;
    }
    if (node.type === 'ArrayExpression') {
      node.elements.forEach((/** @type {any} */ e, /** @type {number} */ i) =>
        visit(e, [...stack, String(i)]),
      );
      return;
    }
    // A type assertion or parentheses keep the key the value sits under.
    const inner = WRAPPERS.has(node.type) ? stack : [];
    for (const [k, v] of Object.entries(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      if (Array.isArray(v)) v.forEach(c => visit(c, inner));
      else if (v && typeof v === 'object' && v.type) visit(v, inner);
    }
  };
  visit(ast.program, []);
  return found;
}

/**
 * The line of the first property named `key` whose value is the literal
 * `value` as written (text, or a number written as itself), anywhere in a
 * source: the place a value given through a const, a shorthand or a spread
 * is written, where no whole key path reaches it. Null when none is.
 * @param {string} source
 * @param {string} key
 * @param {unknown} value
 * @param {string} [file]
 * @returns {number | null}
 */
export function keyValueLine(source, key, value, file) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  /** @type {any} */
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'unambiguous',
      plugins: sourcePlugins(file),
    });
  } catch {
    return null;
  }
  /** @param {any} node @returns {any} */
  const unwrapped = node => {
    let n = node;
    while (n && WRAPPERS.has(n.type)) n = n.expression;
    return n;
  };
  /** @type {number | null} */
  let found = null;
  /** @param {any} node */
  const visit = node => {
    if (found != null || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === 'ObjectProperty' && !node.computed) {
      const k =
        node.key?.type === 'Identifier'
          ? node.key.name
          : node.key?.type === 'StringLiteral'
            ? node.key.value
            : node.key?.type === 'NumericLiteral'
              ? String(node.key.value)
              : null;
      const v = unwrapped(node.value);
      if (
        k === key &&
        (v?.type === 'StringLiteral' || v?.type === 'NumericLiteral') &&
        v.value === value
      ) {
        found = node.loc?.start?.line ?? null;
        return;
      }
    }
    for (const [k, v] of Object.entries(node))
      if (
        k !== 'loc' &&
        k !== 'start' &&
        k !== 'end' &&
        v &&
        typeof v === 'object'
      )
        visit(v);
  };
  visit(ast.program);
  return found;
}
