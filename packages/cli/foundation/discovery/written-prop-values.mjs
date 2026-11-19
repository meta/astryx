// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The values a page certainly gives a JSX prop, read from the
 *   attribute as written.
 * @input  a Babel JSX attribute node and the element's scope
 * @output the strings the prop can take, or null when a value is not
 *   certain
 * @position Read by the export's page worker
 *   (foundation/render/page-worker.mjs) for the unknown-prop-value warning.
 */

import {writtenString} from '../text/written-string.mjs';

/**
 * The strings a JSX attribute certainly gives its prop: a string literal
 * (`size="lg"`, `size={'lg'}`), or a conditional expression whose
 * every branch is one (`size={big ? 'lg' : 'sm'}`). A branch that is `null`
 * or `undefined` gives no value. Null when any branch is something else (a
 * variable, a call, a template with expressions), or the attribute has no
 * value: such a prop is not checked.
 * @param {any} attr a JSXAttribute node
 * @param {any} scope the element's Babel scope, to tell a global `undefined`
 *   from a local binding of that name
 * @returns {string[] | null}
 */
export function writtenStrings(attr, scope) {
  const value = attr.value;
  if (!value) return null;
  if (value.type !== 'JSXExpressionContainer') {
    const text = writtenString(value);
    return text === null ? null : [text];
  }
  const strings = branchStrings(value.expression, scope, 0);
  return strings && strings.length > 0 ? strings : null;
}

/**
 * @param {any} node
 * @param {any} scope
 * @param {number} depth
 * @returns {string[] | null}
 */
function branchStrings(node, scope, depth) {
  if (!node || depth > 16) return null;
  const text = writtenString(node);
  if (text !== null) return [text];
  switch (node.type) {
    case 'NullLiteral':
      return [];
    case 'Identifier':
      return node.name === 'undefined' && !scope.getBinding('undefined')
        ? []
        : null;
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return branchStrings(node.expression, scope, depth + 1);
    case 'ConditionalExpression':
      return both(
        branchStrings(node.consequent, scope, depth + 1),
        branchStrings(node.alternate, scope, depth + 1),
      );
    default:
      return null;
  }
}

/**
 * @param {string[] | null} a
 * @param {string[] | null} b
 * @returns {string[] | null}
 */
function both(a, b) {
  return a && b ? [...a, ...b] : null;
}
