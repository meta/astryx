// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Write values into the theme object of a theme source, as normal
 * lines: a token in `tokens`, a style in `components`. The text around
 * them stays as it is (comments, order, quotes). A key that is there gets
 * its new value in place; a missing key, or a missing object on the way to
 * it, is added at the start of the object that holds it.
 *
 * @input a theme source's text, the export the build reads, and the values
 * @output the new text
 * @position api/theme-edit — pure; used by the adapter's theme check
 */

import {parse as parseModule} from '@babel/parser';
import {
  moduleBindings,
  themeObjectOf,
  unwrapExpression,
} from '../theme/build/theme-object.mjs';

/**
 * A nested map of values to write: a string or a [light, dark] pair is a
 * value; an object holds more keys.
 * @typedef {{[key: string]: string | [string, string] | ValueTree}} ValueTree
 */

/** @param {string} s */
const quoted = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A key as source text: bare when it is an identifier. @param {string} k */
const keyText = k => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : quoted(k));

/**
 * A value as source text.
 * @param {string | [string, string] | ValueTree} v
 * @param {string} indent the indent of the line the value starts on
 * @returns {string}
 */
function valueText(v, indent) {
  if (typeof v === 'string') return quoted(v);
  if (Array.isArray(v)) return `[${v.map(quoted).join(', ')}]`;
  const inner = `${indent}  `;
  const lines = Object.entries(v).map(
    ([k, x]) => `${inner}${keyText(k)}: ${valueText(x, inner)},`,
  );
  return `{\n${lines.join('\n')}\n${indent}}`;
}

/**
 * The name a property is written under, or null for a computed key or a
 * spread.
 * @param {any} p
 * @returns {string | null}
 */
function nameOf(p) {
  if (p.type !== 'ObjectProperty' || p.computed) return null;
  return p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
}

/**
 * The indent of the line a position is on.
 * @param {string} text @param {number} at
 */
function lineIndent(text, at) {
  const start = text.lastIndexOf('\n', at - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start))?.[0] ?? '';
}

/**
 * The edits that write a tree into an object literal.
 * @param {string} text
 * @param {any} object an ObjectExpression
 * @param {ValueTree} tree
 * @param {Array<{start: number, end: number, text: string}>} edits
 * @param {string} where the path so far, for an error
 */
function editsFor(text, object, tree, edits, where) {
  /** @type {string[]} */
  const added = [];
  const indent = `${lineIndent(text, object.start)}  `;
  const first = object.properties[0];
  const inner = first ? lineIndent(text, first.start) : indent;
  for (const [key, value] of Object.entries(tree)) {
    // The last property of a name wins in JavaScript: that one is changed.
    const prop = [...object.properties].reverse().find(p => nameOf(p) === key);
    if (object.properties.some((/** @type {any} */ p) => !nameOf(p)))
      throw new Error(
        `${where || 'the theme object'} has a spread or a computed key, so a value written beside it could be replaced`,
      );
    if (!prop) {
      added.push(`${inner}${keyText(key)}: ${valueText(value, inner)},`);
      continue;
    }
    const node = unwrapExpression(prop.value);
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (node?.type !== 'ObjectExpression')
        throw new Error(
          `${where ? `${where}.` : ''}${key} is not written as an object`,
        );
      editsFor(text, node, value, edits, where ? `${where}.${key}` : key);
      continue;
    }
    edits.push({
      start: prop.value.start,
      end: prop.value.end,
      text: valueText(value, lineIndent(text, prop.start)),
    });
  }
  if (!added.length) return;
  // New keys go first in the object, one per line.
  const open = /** @type {number} */ (object.start) + 1;
  const oneLine = !text.slice(object.start, object.end).includes('\n');
  edits.push({
    start: open,
    end: open,
    text: `\n${added.join('\n')}${oneLine && first ? `\n${inner}` : oneLine ? `\n${lineIndent(text, object.start)}` : ''}`,
  });
}

/**
 * A theme source with values written into its theme object.
 * @param {string} source the theme source's text
 * @param {string} exportName the export the build reads
 * @param {ValueTree} tree keys under the theme object (`tokens`, `components`)
 * @returns {string}
 * @throws {Error} when the export is not one object literal in the file, or
 *   an object on the way has a spread or a computed key
 */
export function withThemeValues(source, exportName, tree) {
  const ast = parseModule(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  const {consts, exported} = moduleBindings(ast);
  const object = themeObjectOf(exported.get(exportName), consts);
  if (!object)
    throw new Error(
      `the theme (${exportName === 'default' ? 'the default export' : exportName}) is not one object literal in the file`,
    );
  /** @type {Array<{start: number, end: number, text: string}>} */
  const edits = [];
  editsFor(source, object, tree, edits, '');
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
