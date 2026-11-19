// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The values a page certainly gives a JSX prop, read from the
 *   attribute as written.
 * @input  a Babel JSX attribute node and the element's scope
 * @output the kinds of value the prop gets and the strings among them, or
 *   null when a value is not certain
 * @position Read by the export's page worker
 *   (foundation/render/page-worker.mjs) for the unknown-prop-value warning.
 */

import {writtenString} from '../text/written-string.mjs';

/**
 * @typedef {import('./core-augmentation-points.mjs').ValueKind} ValueKind
 * @typedef {{kinds: ValueKind[], strings: string[] | null}} WrittenValue
 */

/**
 * What a JSX attribute certainly gives its prop. Every branch of the value
 * must be certain: a literal (a string, a template, a number, a boolean, an
 * object or array literal, `new Date(…)`, a function), a conditional or
 * logical expression of certain branches, a `const` bound to one, or the
 * first value of `useState(<certain value>)`, which is what the first paint
 * gets. A bare attribute (`<Button isDisabled>`) is `true`. A branch that is
 * `null` or `undefined` gives no value. `strings` lists the string values
 * when every string branch is a literal, else null. Null when any branch is
 * not certain: such a prop is not checked.
 * @param {any} attr a JSXAttribute node
 * @param {any} scope the element's Babel scope
 * @returns {WrittenValue | null}
 */
export function writtenValue(attr, scope) {
  const value = attr.value;
  /** @type {Leaf[] | null} */
  let leaves;
  if (!value) leaves = [{kind: 'boolean'}];
  else if (value.type === 'JSXExpressionContainer')
    leaves = branches(value.expression, scope, 0, new Set());
  else leaves = branches(value, scope, 0, new Set());
  const values = leaves?.filter(leaf => leaf.kind !== 'nullish');
  if (!values || values.length === 0) return null;
  const strings = values.filter(leaf => leaf.kind === 'string');
  return {
    kinds: /** @type {ValueKind[]} */ ([
      ...new Set(values.map(leaf => leaf.kind)),
    ]),
    strings: strings.every(leaf => leaf.text !== undefined)
      ? strings.map(leaf => /** @type {string} */ (leaf.text))
      : null,
  };
}

/**
 * One value a branch can give. `nullish` is `null` or `undefined`, which
 * gives the prop no value.
 * @typedef {{kind: ValueKind | 'nullish', text?: string}} Leaf
 */

/**
 * @param {any} node
 * @param {any} scope
 * @param {number} depth
 * @param {Set<any>} seen bindings already followed, so a cycle ends
 * @returns {Leaf[] | null}
 */
function branches(node, scope, depth, seen) {
  if (!node || depth > 16) return null;
  /** @param {any} next */
  const deeper = next => branches(next, scope, depth + 1, seen);
  const text = writtenString(node);
  if (text !== null) return [{kind: 'string', text}];
  switch (node.type) {
    case 'TemplateLiteral':
      return [{kind: 'string'}];
    case 'NumericLiteral':
      return [{kind: 'number'}];
    case 'UnaryExpression':
      return node.operator === '-' && node.argument.type === 'NumericLiteral'
        ? [{kind: 'number'}]
        : null;
    case 'BooleanLiteral':
      return [{kind: 'boolean'}];
    case 'ObjectExpression':
      return [{kind: 'object'}];
    case 'ArrayExpression':
      return [{kind: 'array'}];
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return [{kind: 'function'}];
    case 'NewExpression':
      return node.callee.type === 'Identifier' &&
        node.callee.name === 'Date' &&
        !scope.getBinding('Date')
        ? [{kind: 'Date'}]
        : null;
    case 'NullLiteral':
      return [{kind: 'nullish'}];
    case 'TSAsExpression':
      // A cast to `never`, `any` or `unknown` says the author knows the
      // value does not fit the prop's type: it is not checked.
      return ['TSNeverKeyword', 'TSAnyKeyword', 'TSUnknownKeyword'].includes(
        node.typeAnnotation.type,
      )
        ? null
        : deeper(node.expression);
    case 'ParenthesizedExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return deeper(node.expression);
    case 'ConditionalExpression':
      return both(deeper(node.consequent), deeper(node.alternate));
    case 'LogicalExpression':
      return logical(node.operator, deeper(node.left), () =>
        deeper(node.right),
      );
    case 'Identifier': {
      if (node.name === 'undefined' && !scope.getBinding('undefined'))
        return [{kind: 'nullish'}];
      const binding = scope.getBinding(node.name);
      if (!binding || seen.has(binding)) return null;
      const init = boundValue(binding);
      // Each branch follows its own path, so a const used in two branches
      // is read in both.
      return init
        ? branches(
            init,
            binding.path.scope,
            depth + 1,
            new Set([...seen, binding]),
          )
        : null;
    }
    default:
      return null;
  }
}

/**
 * The expression a binding certainly holds on first paint: the initial value
 * of a `const` that is never reassigned, or the argument of React's
 * `useState(…)` for the first name of `const [value, setValue] = useState(…)`.
 * @param {any} binding
 * @returns {any} the expression, or null
 */
function boundValue(binding) {
  const declarator = binding.path;
  if (
    binding.kind !== 'const' ||
    !declarator.isVariableDeclarator() ||
    binding.constantViolations.length > 0
  )
    return null;
  const {id, init} = declarator.node;
  if (id.type === 'Identifier') return init;
  if (
    id.type !== 'ArrayPattern' ||
    id.elements[0]?.type !== 'Identifier' ||
    id.elements[0].name !== binding.identifier.name
  )
    return null;
  if (
    init?.type !== 'CallExpression' ||
    !isReactUseState(init.callee, declarator.scope)
  )
    return null;
  const [initial] = init.arguments;
  // A function given to useState is called for the value: what it returns is
  // not read here.
  if (
    init.arguments.length !== 1 ||
    initial.type === 'ArrowFunctionExpression' ||
    initial.type === 'FunctionExpression'
  )
    return null;
  return initial;
}

/**
 * Whether a callee is React's `useState`: imported from `react` by name, or
 * a member of React's default or namespace import.
 * @param {any} callee
 * @param {any} scope
 * @returns {boolean}
 */
function isReactUseState(callee, scope) {
  /** @param {string} name */
  const reactImport = name => {
    const spec = scope.getBinding(name)?.path;
    return spec?.parent?.type === 'ImportDeclaration' &&
      spec.parent.source.value === 'react'
      ? spec
      : null;
  };
  if (callee.type === 'Identifier') {
    const spec = reactImport(callee.name);
    return Boolean(
      spec?.isImportSpecifier() &&
      (spec.node.imported.name ?? spec.node.imported.value) === 'useState',
    );
  }
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.object.type !== 'Identifier'
  )
    return false;
  const spec = reactImport(callee.object.name);
  return Boolean(
    spec && !spec.isImportSpecifier() && callee.property.name === 'useState',
  );
}

/**
 * The values a logical expression gives, as JavaScript picks them: `a || b`
 * gives each truthy value of `a`, and `b` when `a` can be falsy; `a && b`
 * gives each falsy value of `a`, and `b` when `a` can be truthy; `a ?? b`
 * gives each value of `a` that is not `null` or `undefined`, and `b` when
 * it can be. Null unless the truthiness of every value of `a` is known (a
 * string literal, `null` or `undefined`).
 * @param {string} operator
 * @param {Leaf[] | null} left
 * @param {() => Leaf[] | null} right read only when the left can give way
 * @returns {Leaf[] | null}
 */
function logical(operator, left, right) {
  if (!left) return null;
  /** @param {Leaf} leaf */
  const truthy = leaf =>
    leaf.kind === 'nullish'
      ? false
      : leaf.kind === 'string' && leaf.text !== undefined
        ? leaf.text !== ''
        : null;
  if (operator === '??') {
    const kept = left.filter(leaf => leaf.kind !== 'nullish');
    return kept.length === left.length ? kept : both(kept, right());
  }
  const known = left.map(truthy);
  if (known.includes(null)) return null;
  const stays =
    operator === '||'
      ? left.filter((_, i) => known[i])
      : left.filter((_, i) => !known[i]);
  const givesWay =
    operator === '||' ? known.includes(false) : known.includes(true);
  return givesWay ? both(stays, right()) : stays;
}

/**
 * @param {Leaf[] | null} a
 * @param {Leaf[] | null} b
 * @returns {Leaf[] | null}
 */
function both(a, b) {
  return a && b ? [...a, ...b] : null;
}
