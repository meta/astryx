// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Write values into the theme object of a theme source, as normal
 * lines: a token in `tokens`, a style in `components`, and a shared const
 * that several styles spread. The text around them stays as it is
 * (comments, order, quotes). A key that is there gets its new value in
 * place. A missing key, or a missing object on the way to it, is added at
 * the start of the object that holds it, or at its end when the object
 * spreads another, so the new key wins over the spread. A spread the
 * writer adds goes first, so the object's own keys win over it.
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
 * value; an object holds more keys; a key `...name` set to true spreads the
 * const `name` into the object.
 * @typedef {{[key: string]: string | [string, string] | true | ValueTree}} ValueTree
 */

/** @param {string} s */
const quoted = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A key as source text: bare when it is an identifier. @param {string} k */
const keyText = k => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : quoted(k));

/**
 * A value as source text.
 * @param {string | [string, string] | true | ValueTree} v
 * @param {string} indent the indent of the line the value starts on
 * @returns {string}
 */
function valueText(v, indent) {
  if (typeof v === 'string') return quoted(v);
  if (Array.isArray(v)) return `[${v.map(quoted).join(', ')}]`;
  if (v === true) throw new Error('a spread is written only as a key');
  const inner = `${indent}  `;
  const lines = Object.entries(v).map(([k, x]) =>
    k.startsWith('...')
      ? `${inner}${k},`
      : `${inner}${keyText(k)}: ${valueText(x, inner)},`,
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
  /** @type {string[]} */
  const spreads = [];
  const indent = `${lineIndent(text, object.start)}  `;
  const first = object.properties[0];
  const inner = first ? lineIndent(text, first.start) : indent;
  if (
    object.properties.some(
      (/** @type {any} */ p) => p.type === 'ObjectProperty' && p.computed,
    )
  )
    throw new Error(
      `${where || 'the theme object'} has a computed key, so a value written beside it could be replaced`,
    );
  const spreading = object.properties.some(
    (/** @type {any} */ p) => p.type === 'SpreadElement',
  );
  for (const [key, value] of Object.entries(tree)) {
    if (key.startsWith('...')) {
      const name = key.slice(3);
      const there = object.properties.some(
        (/** @type {any} */ p) =>
          p.type === 'SpreadElement' &&
          p.argument?.type === 'Identifier' &&
          p.argument.name === name,
      );
      if (!there) spreads.push(`${inner}${key},`);
      continue;
    }
    // The last property of a name wins in JavaScript: that one is changed.
    const prop = [...object.properties].reverse().find(p => nameOf(p) === key);
    if (!prop) {
      added.push(`${inner}${keyText(key)}: ${valueText(value, inner)},`);
      continue;
    }
    const node = unwrapExpression(prop.value);
    if (value !== true && typeof value === 'object' && !Array.isArray(value)) {
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
  const oneLine = !text.slice(object.start, object.end).includes('\n');
  const open = /** @type {number} */ (object.start) + 1;
  // A spread the writer adds goes first, so the object's own keys win.
  const atStart = [...spreads, ...(spreading ? [] : added)];
  if (atStart.length)
    edits.push({
      start: open,
      end: open,
      text: `\n${atStart.join('\n')}${oneLine && first ? `\n${inner}` : oneLine ? `\n${lineIndent(text, object.start)}` : ''}`,
    });
  // Beside a spread a new key goes last, so it wins over the spread: after
  // the last property and its comma, when it has one.
  if (spreading && added.length) {
    const last = object.properties[object.properties.length - 1];
    const after = text.slice(last.end, object.end);
    const comma = /^\s*,/.exec(after);
    const at = /** @type {number} */ (last.end) + (comma ? comma[0].length : 0);
    edits.push({
      start: at,
      end: at,
      text: `${comma ? '' : ','}\n${added.join('\n')}`,
    });
  }
}

/**
 * A theme source with values written into its theme object.
 * @param {string} source the theme source's text
 * @param {string} exportName the export the build reads
 * @param {ValueTree} tree keys under the theme object (`tokens`, `components`)
 * @param {Record<string, ValueTree>} [shared] consts the tree spreads, by name
 * @returns {string}
 * @throws {Error} when the export is not one object literal in the file, an
 *   object on the way has a computed key, or a shared const's name is taken
 *   by something other than an object
 */
export function withThemeValues(source, exportName, tree, shared = {}) {
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
  // A shared const goes before the statement that holds the theme, or is
  // written into where it is already declared.
  // (The theme object is in the file, so a top-level statement holds it.)
  const at = /** @type {number} */ (
    ast.program.body.find(
      (/** @type {any} */ n) => n.start <= object.start && object.end <= n.end,
    )?.start
  );
  for (const [name, values] of Object.entries(shared)) {
    const there = unwrapExpression(consts.get(name));
    if (there?.type === 'ObjectExpression') {
      editsFor(source, there, values, edits, name);
      continue;
    }
    if (there) throw new Error(`${name} is already declared as something else`);
    edits.push({
      start: at,
      end: at,
      text: `const ${name} = ${valueText(values, '')};\n\n`,
    });
  }
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
