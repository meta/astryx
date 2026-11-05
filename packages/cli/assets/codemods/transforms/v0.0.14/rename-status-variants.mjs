// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: Rename status variants positive/negative → success/error
 * @see https://github.com/facebookexperimental/xds/issues/996
 *
 * This transform is deliberately limited to static literals written directly
 * in affected props on imported JSX components. It does not infer through
 * variables, helpers, objects, types, or wrappers: missing an indirect
 * migration is safer than rewriting an unrelated domain using the same words.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: 'Rename status variants positive/negative → success/error',
  description:
    'Renames static status values written directly on imported StatusDot, ' +
    'AvatarStatusDot, Icon, SVGIcon, ProgressBar, and Badge JSX elements. ' +
    'Indirect values are left unchanged for manual migration.',
  pr: '#996',
};

const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;

const COMPONENT_PROPS = new Map([
  ['StatusDot', new Set(['variant'])],
  ['AvatarStatusDot', new Set(['variant'])],
  ['Icon', new Set(['color'])],
  ['SVGIcon', new Set(['color'])],
  ['ProgressBar', new Set(['variant'])],
  ['Badge', new Set(['variant'])],
]);

const STATUS_RENAMES = new Map([
  ['positive', 'success'],
  ['negative', 'error'],
  ['info', 'accent'],
]);

const BADGE_RENAMES = new Map([
  ['positive', 'success'],
  ['negative', 'error'],
]);

/** @param {string} name */
function canonicalComponentName(name) {
  return name.startsWith('XDS') ? name.slice(3) : name;
}

/**
 * @param {any} node
 * @param {ReadonlyMap<string, string>} renames
 * @returns {boolean}
 */
function renameStaticValue(node, renames) {
  if (!node) return false;
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TypeCastExpression' ||
    node.type === 'ParenthesizedExpression'
  ) {
    return renameStaticValue(node.expression, renames);
  }
  if (node.type === 'ConditionalExpression') {
    const consequentChanged = renameStaticValue(node.consequent, renames);
    const alternateChanged = renameStaticValue(node.alternate, renames);
    return consequentChanged || alternateChanged;
  }
  if (
    (node.type !== 'StringLiteral' && node.type !== 'Literal') ||
    typeof node.value !== 'string'
  ) {
    return false;
  }
  const replacement = renames.get(node.value);
  if (!replacement) return false;
  node.value = replacement;
  if (node.raw) node.raw = undefined;
  return true;
}

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

  transformProp(
    root,
    j,
    {
      matchesImport: source => CORE_IMPORT_RE.test(source),
      components: COMPONENT_PROPS,
      normalizeComponentName: canonicalComponentName,
    },
    (propPath, {component}) => {
      const prop = propPath.node;
      const value =
        prop.value?.type === 'JSXExpressionContainer'
          ? prop.value.expression
          : prop.value;
      const renames = component === 'Badge' ? BADGE_RENAMES : STATUS_RENAMES;
      if (renameStaticValue(value, renames)) hasChanges = true;
    },
  );

  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
