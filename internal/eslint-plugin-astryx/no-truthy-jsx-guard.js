// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-truthy-jsx-guard.js
 * @description Disallow a bare truthiness guard on a ReactNode value in
 * front of rendered JSX.
 *
 *   {startIcon && <Slot>{startIcon}</Slot>}
 *   {label ? <span>{label}</span> : null}
 *
 * A ReactNode can be `0`. `0 && <Slot />` evaluates to `0`, so React renders
 * a stray "0" where the slot should be. The ternary form renders no stray
 * text, but it drops the slot for `0`, which is content that renders.
 * `isRenderable(value)` from `@astryxdesign/core/utils` is the one presence
 * check for a slot: it is false only for null, undefined, true, false and ''.
 *
 * Scope:
 *   - The guard is a bare value reference (`icon`, `item.icon`, `props.icon`)
 *     in an `&&` chain whose right side is JSX, or the test of a ternary that
 *     renders JSX or `null`/`undefined`.
 *   - The value's type can be a number and can be an object, as `ReactNode`
 *     and `ReactNode | IconType` can. A boolean, a string, a plain number or a
 *     data object is not a slot value and is not flagged.
 *
 * The rule reads types, so the file must be parsed with type information
 * (`parserOptions.projectService`). Without it the rule stops with an error,
 * so a config that loses type information cannot pass silently.
 *
 * Options: `{baseline: {[repoRelativeFile]: string[]}, root: string}`. The
 * baseline lists, per file, each guarded value once per guard that predates
 * enforcement. That many guards of the value stay allowed until migrated;
 * one more is reported.
 *
 * Known limitations:
 *   - A guard that converts the value first (`!!icon`, `Boolean(icon)`, a
 *     `hasIcon` local) is not flagged. It renders no stray "0", and the type of
 *     the derived boolean does not show where it came from.
 *   - A value typed `any` is not flagged.
 */

import ts from 'typescript';
import {baselineAllowance} from './rule-baseline.mjs';

/**
 * Where the repository config enforces the rule. Core only: another package
 * reads Core's types from Core's build output. Before a build they are `any`,
 * after it they are real, so the result there would change with build state.
 */
export const scope = {
  files: ['packages/core/src/**/*.{ts,tsx}'],
  ignores: [
    'packages/core/src/theme/**',
    '**/*.test.{ts,tsx}',
    '**/*.stories.{ts,tsx}',
  ],
};

const NUMBER_FLAGS = ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike;
const OBJECT_FLAGS =
  ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive | ts.TypeFlags.Intersection;
const UNKNOWN_FLAGS = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function isJSX(node) {
  return node?.type === 'JSXElement' || node?.type === 'JSXFragment';
}

function isNullish(node) {
  return (
    (node?.type === 'Literal' && node.value === null) ||
    (node?.type === 'Identifier' && node.name === 'undefined')
  );
}

/** `icon`, `item.icon`, `item?.icon`, `item.icon!`; not a call or a test. */
function isValueReference(node) {
  switch (node?.type) {
    case 'Identifier':
      return node.name !== 'undefined';
    case 'MemberExpression':
      return true;
    case 'ChainExpression':
      return node.expression.type === 'MemberExpression';
    case 'TSNonNullExpression':
      return isValueReference(node.expression);
    default:
      return false;
  }
}

/** Flatten a left-nested `&&` chain into its operands. */
function flattenAnd(node) {
  if (node?.type === 'LogicalExpression' && node.operator === '&&') {
    return [...flattenAnd(node.left), ...flattenAnd(node.right)];
  }
  return [node];
}

/**
 * Can a value of this type be both a number and an object? `ReactNode` can
 * (`0`, an element), so can a union that adds a component type to it. A type
 * parameter is read through its constraint.
 */
function isNodeType(type, checker) {
  const resolved = checker.getBaseConstraintOfType(type) ?? type;
  const parts = resolved.isUnion() ? resolved.types : [resolved];
  let canBeNumber = false;
  let canBeObject = false;
  for (const part of parts) {
    if (part.flags & UNKNOWN_FLAGS) {
      return false;
    }
    if (part.flags & NUMBER_FLAGS) {
      canBeNumber = true;
    } else if (part.flags & OBJECT_FLAGS) {
      canBeObject = true;
    }
  }
  return canBeNumber && canBeObject;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a truthiness guard on a ReactNode value in front of rendered JSX — use isRenderable() so a 0 slot renders as content, never as stray text',
      category: 'Best Practices',
      recommended: false,
      requiresTypeChecking: true,
    },
    hasSuggestions: true,
    messages: {
      andGuard:
        '`{{value}}` is a ReactNode and can be `0`. Then `{{value}} && <…>` ' +
        'renders a stray "0" in place of the slot. Use ' +
        '`isRenderable({{value}})` from `@astryxdesign/core/utils`; it is ' +
        'false only for null, undefined, true, false and "".',
      ternaryGuard:
        '`{{value}}` is a ReactNode and can be `0`, which renders as ' +
        'content, but this truthiness test drops the slot for it. Use ' +
        '`isRenderable({{value}})` from `@astryxdesign/core/utils`; it is ' +
        'false only for null, undefined, true, false and "".',
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseline: {
            type: 'object',
            additionalProperties: {type: 'array', items: {type: 'string'}},
          },
          root: {type: 'string'},
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const services = sourceCode.parserServices;
    if (services?.program == null || services.esTreeNodeToTSNodeMap == null) {
      throw new Error(
        '@astryx/no-truthy-jsx-guard reads types. Parse the file with ' +
          'typescript-eslint and parserOptions.projectService.',
      );
    }
    const checker = services.program.getTypeChecker();
    const isAllowed = baselineAllowance(context);

    function isNodeValue(node) {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      return isNodeType(checker.getTypeAtLocation(tsNode), checker);
    }

    function checkGuards(test, messageId) {
      for (const guard of flattenAnd(test)) {
        if (!isValueReference(guard) || !isNodeValue(guard)) {
          continue;
        }
        const value = sourceCode.getText(guard);
        if (isAllowed(value)) {
          continue;
        }
        context.report({
          node: guard,
          messageId,
          data: {value},
          suggest: [
            {
              desc: `Replace with isRenderable(${value})`,
              fix: fixer => fixer.replaceText(guard, `isRenderable(${value})`),
            },
          ],
        });
      }
    }

    return {
      // `{icon && <Slot>{icon}</Slot>}`
      LogicalExpression(node) {
        if (node.operator === '&&' && isJSX(node.right)) {
          checkGuards(node.left, 'andGuard');
        }
      },
      // `{icon ? <Slot>{icon}</Slot> : null}`
      ConditionalExpression(node) {
        if (isJSX(node.consequent) && isNullish(node.alternate)) {
          checkGuards(node.test, 'ternaryGuard');
        }
      },
    };
  },
};

export default rule;
