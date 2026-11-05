// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate nativePicker to presentation on date/time inputs
 *
 * `spec:AST-043` FR3 mapping, applied only to static literals written
 * directly on imported `DateInput`, `DateTimeInput`, and `TimeInput`
 * elements: the prop is renamed to `presentation` and its value mapped.
 * When the element already sets `presentation`, the deprecated prop is
 * removed (presentation wins, FR4). Dynamic values are left unchanged —
 * the deprecated prop keeps working, so an unmigrated callsite is still
 * correct, and guessing at an expression's values would not be.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate nativePicker to presentation',
  description:
    'Renames `nativePicker` to `presentation` on DateInput, DateTimeInput, ' +
    'and TimeInput, mapping touch→adaptive-native, always→native, and ' +
    'never→adaptive-bottom-sheet (text-input for TimeInput). Dynamic ' +
    'values are left for manual migration; the deprecated prop still works.',
};

const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;

const COMPONENT_PROPS = new Map([
  ['DateInput', new Set(['nativePicker'])],
  ['DateTimeInput', new Set(['nativePicker'])],
  ['TimeInput', new Set(['nativePicker'])],
]);

/** @param {string} component @param {string} value */
function mapValue(component, value) {
  switch (value) {
    case 'touch':
      return 'adaptive-native';
    case 'always':
      return 'native';
    case 'never':
      return component === 'TimeInput' ? 'text-input' : 'adaptive-bottom-sheet';
    default:
      return undefined;
  }
}

/**
 * Collect the string-literal leaves of a value expression without mutating
 * anything. Returns false for any dynamic or non-string node.
 * @param {any} node
 * @param {any[]} leaves
 * @returns {boolean}
 */
function collectStaticLeaves(node, leaves) {
  if (!node) return false;
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TypeCastExpression' ||
    node.type === 'ParenthesizedExpression'
  ) {
    return collectStaticLeaves(node.expression, leaves);
  }
  if (node.type === 'ConditionalExpression') {
    return (
      collectStaticLeaves(node.consequent, leaves) &&
      collectStaticLeaves(node.alternate, leaves)
    );
  }
  if (
    (node.type !== 'StringLiteral' && node.type !== 'Literal') ||
    typeof node.value !== 'string'
  ) {
    return false;
  }
  leaves.push(node);
  return true;
}

/**
 * Map every leaf, or none of them: a mixed static/dynamic conditional must
 * stay byte-identical, never half-migrated.
 * @param {any} node
 * @param {string} component
 */
function mapStaticValue(node, component) {
  /** @type {any[]} */
  const leaves = [];
  if (!collectStaticLeaves(node, leaves)) return false;
  if (leaves.some(leaf => mapValue(component, leaf.value) === undefined)) {
    return false;
  }
  for (const leaf of leaves) {
    leaf.value = mapValue(component, leaf.value);
    if (leaf.raw) leaf.raw = undefined;
  }
  return true;
}

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  if (!file.source.includes('nativePicker')) return undefined;
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

  transformProp(
    root,
    j,
    {
      matchesImport: source => CORE_IMPORT_RE.test(source),
      components: COMPONENT_PROPS,
    },
    (propPath, {component}) => {
      const opening = propPath.parent?.node;
      const attributes = opening?.attributes ?? [];
      const hasPresentation = attributes.some(
        (/** @type {any} */ attribute) =>
          attribute.type === 'JSXAttribute' &&
          attribute.name?.name === 'presentation',
      );
      const prop = propPath.node;
      if (hasPresentation) {
        // FR4: presentation wins; drop the deprecated prop.
        opening.attributes = attributes.filter(
          (/** @type {any} */ attribute) => attribute !== prop,
        );
        hasChanges = true;
        return;
      }
      const value =
        prop.value?.type === 'JSXExpressionContainer'
          ? prop.value.expression
          : prop.value;
      if (!mapStaticValue(value, component)) return;
      prop.name.name = 'presentation';
      hasChanges = true;
    },
  );

  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
