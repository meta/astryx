// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-nullish-jsx-guard.js
 * @description Disallow bare nullish checks (`!= null`, `!== null`,
 * `!== undefined`) as JSX conditional-rendering guards for a rendered value.
 *
 * A common pattern for optionally rendering a slot is:
 *
 *   {sideNav != null && <aside>{sideNav}</aside>}
 *   {label != null ? <span>{label}</span> : null}
 *
 * `!= null` only rejects `null` and `undefined`. But React treats `false`,
 * `true`, and `''` as "renders nothing" too, and every one of them passes a
 * `!= null` guard:
 *
 *   false != null // → true  (guard passes, wrapper renders empty)
 *   true  != null // → true  (guard passes, wrapper renders empty)
 *   ''    != null // → true  (guard passes, wrapper renders empty)
 *
 * So a `false`/`true`/`''` slot value slips past the guard and renders an empty
 * (or otherwise meaningless) wrapper element. `isRenderable(value)` from
 * `@astryxdesign/core/utils` is the shipped fix: it returns `false` for
 * `null`, `undefined`, `false`, `true`, and `''`. (Note: `0` is intentionally
 * treated as renderable by `isRenderable` — it produces the visible text "0" —
 * so this rule does NOT try to flag `0`.)
 *
 * @see packages/core/src/utils/isRenderable.ts
 * @see https://github.com/meta/astryx/issues/2538
 *
 * Scope (deliberately conservative to avoid false positives):
 *   Only flags a nullish comparison when BOTH hold —
 *     1. it guards a branch that renders JSX (the `&&` right-hand side, a
 *        ternary consequent for `!=`/`!==`, or a ternary alternate for
 *        `==`/`===`), and
 *     2. the guarded value itself is rendered as a JSX *child* of that branch
 *        (e.g. `{value}` inside the element) — not merely passed as a prop.
 *   This targets `ReactNode` slot values (the real leak) and ignores data
 *   objects used only to gate a render, e.g.
 *     {user != null && <Profile user={user} />}   // NOT flagged — `user` is a
 *                                                  // data object, only a prop
 *
 * Known limitations (intentional, to keep precision high):
 *   - Bare assignments like `const hasFoo = foo != null` are not flagged;
 *     distinguishing a `ReactNode` slot from any other nullable value needs
 *     type information this syntax-only rule does not have.
 *   - Direct value renders such as `{foo != null && foo}` (no wrapper element)
 *     are not flagged — the guarded branch is not a JSX element.
 */

// `!= null` / `!== null` / `!== undefined` — the "render when present" polarity.
const NOT_EQUAL_OPERATORS = new Set(['!=', '!==']);
// `== null` / `=== null` / `=== undefined` — the "render in the else branch"
// polarity (used by ternaries like `x == null ? fallback : <JSX>`).
const EQUAL_OPERATORS = new Set(['==', '===']);

/** Is this node the `null` literal? */
function isNullLiteral(node) {
  return node?.type === 'Literal' && node.value === null;
}

/** Is this node the `undefined` identifier? */
function isUndefinedIdentifier(node) {
  return node?.type === 'Identifier' && node.name === 'undefined';
}

function isNullish(node) {
  return isNullLiteral(node) || isUndefinedIdentifier(node);
}

/** Is this node a JSX element or fragment (i.e. it renders markup)? */
function isJSX(node) {
  return node?.type === 'JSXElement' || node?.type === 'JSXFragment';
}

/**
 * If `node` is a nullish comparison (`value <op> null|undefined`), return
 * `{value, equal}` where `value` is the non-nullish operand and `equal` marks
 * `==`/`===` (vs `!=`/`!==`). Otherwise return null.
 */
function parseNullishComparison(node) {
  if (node?.type !== 'BinaryExpression') {
    return null;
  }
  const isNotEqual = NOT_EQUAL_OPERATORS.has(node.operator);
  const isEqual = EQUAL_OPERATORS.has(node.operator);
  if (!isNotEqual && !isEqual) {
    return null;
  }
  let value = null;
  if (isNullish(node.left) && !isNullish(node.right)) {
    value = node.right;
  } else if (isNullish(node.right) && !isNullish(node.left)) {
    value = node.left;
  }
  if (value == null) {
    return null;
  }
  return {value, equal: isEqual};
}

/** Root identifier name of an expression (`a` for `a`, `a.b.c`, `a()`). */
function rootIdentifierName(node) {
  let current = node;
  while (current) {
    switch (current.type) {
      case 'Identifier':
        return current.name;
      case 'MemberExpression':
        current = current.object;
        break;
      case 'ChainExpression':
        current = current.expression;
        break;
      case 'CallExpression':
        current = current.callee;
        break;
      case 'TSNonNullExpression':
        current = current.expression;
        break;
      default:
        return null;
    }
  }
  return null;
}

/**
 * Generic AST walk that invokes `cb(node, parent)` for every child node.
 * Skips the `parent` back-reference to avoid cycles.
 */
function walk(node, parent, cb) {
  if (node == null || typeof node.type !== 'string') {
    return;
  }
  cb(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === 'string') {
          walk(item, node, cb);
        }
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, node, cb);
    }
  }
}

/**
 * Does `rootName` appear inside a JSX *child* expression container of the
 * rendered branch? A child container's parent is a JSXElement/JSXFragment;
 * an attribute value's container has a JSXAttribute parent, so props are
 * excluded.
 */
function isRenderedAsChild(branch, rootName) {
  let found = false;
  walk(branch, null, (node, parent) => {
    if (found) {
      return;
    }
    if (
      node.type === 'JSXExpressionContainer' &&
      (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment')
    ) {
      walk(node.expression, node, (inner, innerParent) => {
        if (found || inner.type !== 'Identifier' || inner.name !== rootName) {
          return;
        }
        // Ignore the `b` in `a.b` (non-computed member property).
        if (
          innerParent?.type === 'MemberExpression' &&
          innerParent.property === inner &&
          !innerParent.computed
        ) {
          return;
        }
        // Ignore the key in `{b: ...}` (non-computed object-property key).
        if (
          innerParent?.type === 'Property' &&
          innerParent.key === inner &&
          !innerParent.computed
        ) {
          return;
        }
        found = true;
      });
    }
  });
  return found;
}

/** Flatten a left-nested `&&` chain into its leaf operands. */
function flattenAnd(node) {
  if (node?.type === 'LogicalExpression' && node.operator === '&&') {
    return [...flattenAnd(node.left), ...flattenAnd(node.right)];
  }
  return [node];
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow bare nullish checks (!= null) as JSX render guards for a rendered value — use isRenderable() so false/true/empty-string slots do not leak an empty element',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/meta/astryx/issues/2538',
    },
    hasSuggestions: true,
    messages: {
      nullishGuard:
        '`{{code}}` guards rendered JSX with a bare nullish check, but `false`, ' +
        '`true`, and `""` all pass `!= null` — leaking an empty wrapper into the ' +
        'DOM. Use `isRenderable({{value}})` from `@astryxdesign/core/utils`, which ' +
        'also excludes boolean and empty-string values (0 stays renderable).',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    // Test/story fixtures intentionally exercise raw patterns.
    if (filename.includes('.test.') || filename.includes('.stories.')) {
      return {};
    }
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function report(comparison, value, negate) {
      const valueText = sourceCode.getText(value);
      const replacement = `${negate ? '!' : ''}isRenderable(${valueText})`;
      context.report({
        node: comparison,
        messageId: 'nullishGuard',
        data: {
          code: sourceCode.getText(comparison),
          value: valueText,
        },
        suggest: [
          {
            desc: `Replace with ${replacement}`,
            fix(fixer) {
              return fixer.replaceText(comparison, replacement);
            },
          },
        ],
      });
    }

    return {
      // `{value != null && <El>{value}</El>}`
      LogicalExpression(node) {
        if (node.operator !== '&&' || !isJSX(node.right)) {
          return;
        }
        const guards = flattenAnd(node.left);
        for (const guard of guards) {
          const parsed = parseNullishComparison(guard);
          // `&&` only renders when the guard is truthy, so only the
          // "render when present" (`!=`/`!==`) polarity is a leak here.
          if (!parsed || parsed.equal) {
            continue;
          }
          const rootName = rootIdentifierName(parsed.value);
          if (rootName && isRenderedAsChild(node.right, rootName)) {
            report(guard, parsed.value, false);
            break;
          }
        }
      },

      // `{value != null ? <El>{value}</El> : null}`
      // `{value == null ? null : <El>{value}</El>}`
      ConditionalExpression(node) {
        const parsed = parseNullishComparison(node.test);
        if (!parsed) {
          return;
        }
        // `!=`/`!==` renders in the consequent; `==`/`===` renders in the
        // alternate. Only flag when the guarded value is rendered as a child
        // of the branch the guard actually renders.
        const branch = parsed.equal ? node.alternate : node.consequent;
        if (!isJSX(branch)) {
          return;
        }
        const rootName = rootIdentifierName(parsed.value);
        if (rootName && isRenderedAsChild(branch, rootName)) {
          report(node.test, parsed.value, parsed.equal);
        }
      },
    };
  },
};

export default rule;
