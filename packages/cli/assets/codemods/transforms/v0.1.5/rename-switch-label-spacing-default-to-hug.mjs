// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: Rename Switch labelSpacing "default" to "hug"
 * @see https://github.com/meta/astryx/issues/2889
 *
 * The `labelSpacing="default"` value is renamed to `labelSpacing="hug"` so
 * the name describes the behavior (label and switch hug each other), matching
 * the behavioral register of the sibling `spread` value and the existing
 * `hug`/`fill` layout vocabulary on TabList and SegmentedControl. The old
 * `default` value keeps working as a deprecated alias, so this codemod is a
 * cleanup, not a build fix.
 *
 * Transforms (scoped to Switch):
 * - <Switch labelSpacing="default" />            → <Switch labelSpacing="hug" />
 * - <Switch labelSpacing={'default'} />          → <Switch labelSpacing={'hug'} />
 * - <Switch labelSpacing={cond ? 'default' : x}> → <Switch labelSpacing={cond ? 'hug' : x}>
 * - Storybook argTypes: labelSpacing: { options: [..., 'default', ...] }
 *     → replaces 'default' with 'hug' (files importing Switch)
 * - Object properties: { labelSpacing: 'default' } / { labelSpacing: 'default' as const }
 *     → { labelSpacing: 'hug' } (files importing Switch)
 *
 * The transform deliberately does NOT touch bare `'default'` strings that are
 * not a `labelSpacing` value (an extremely common string otherwise), so it is
 * safe to run across an entire codebase.
 */

export const meta = {
  title: 'Rename Switch labelSpacing "default" to "hug"',
  description:
    'Renames the `labelSpacing="default"` value to `labelSpacing="hug"` on ' +
    'Switch. The old value keeps working as a deprecated alias. Also updates ' +
    'Storybook labelSpacing argTypes options and object-literal `labelSpacing` ' +
    'props in files that import Switch.',
  pr: '#2889',
};

const OLD_VALUE = 'default';
const NEW_VALUE = 'hug';

/** Prop whose value is being renamed. */
const TARGET_PROP = 'labelSpacing';

/** Components whose `labelSpacing` prop accepts a SwitchLabelSpacing value. */
const TARGET_COMPONENTS = new Set(['Switch']);

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

  /** Rewrite a string-literal node when it equals the old value. */
  function renameStringLiteral(/** @type {any} */ node) {
    if (!node) return false;
    if (
      (node.type === 'StringLiteral' || node.type === 'Literal') &&
      node.value === OLD_VALUE
    ) {
      node.value = NEW_VALUE;
      if (node.raw) node.raw = `'${NEW_VALUE}'`;
      return true;
    }
    return false;
  }

  /** Recursively rewrite the old value inside ternary/logical expressions. */
  /** @returns {boolean} */
  function renameInExpression(/** @type {any} */ node) {
    if (!node) return false;
    let changed = false;
    if (node.type === 'StringLiteral' || node.type === 'Literal') {
      changed = renameStringLiteral(node) || changed;
    } else if (node.type === 'ConditionalExpression') {
      changed = renameInExpression(node.consequent) || changed;
      changed = renameInExpression(node.alternate) || changed;
    } else if (node.type === 'LogicalExpression') {
      changed = renameInExpression(node.left) || changed;
      changed = renameInExpression(node.right) || changed;
    } else if (node.type === 'TSAsExpression') {
      // `'default' as const` → rewrite the inner expression
      changed = renameInExpression(node.expression) || changed;
    }
    return changed;
  }

  // --- 1. JSX attribute: labelSpacing="default" / labelSpacing={'default'} on Switch ---
  root.find(j.JSXOpeningElement).forEach((/** @type {any} */ path) => {
    const name = path.node.name;
    const componentName = name.type === 'JSXIdentifier' ? name.name : null;
    if (!componentName || !TARGET_COMPONENTS.has(componentName)) return;

    path.node.attributes.forEach((/** @type {any} */ attr) => {
      if (attr.type !== 'JSXAttribute') return;
      if (!attr.name || attr.name.name !== TARGET_PROP) return;

      const value = attr.value;
      if (!value) return;

      if (value.type === 'StringLiteral' || value.type === 'Literal') {
        if (renameStringLiteral(value)) hasChanges = true;
      } else if (value.type === 'JSXExpressionContainer') {
        if (renameInExpression(value.expression)) hasChanges = true;
      }
    });
  });

  // Object-property / argTypes transforms only run in files that use a target
  // component — keeps unrelated `{ labelSpacing: 'default' }` strings safe.
  const importsTarget =
    root
      .find(j.ImportSpecifier)
      .filter((/** @type {any} */ p) => TARGET_COMPONENTS.has(p.node.imported?.name))
      .size() > 0;

  if (importsTarget) {
    const PropertyType = j.ObjectProperty ?? j.Property;

    // --- 2. Object property: { labelSpacing: 'default' } / 'default' as const ---
    root.find(PropertyType, {key: {name: TARGET_PROP}}).forEach((/** @type {any} */ path) => {
      if (renameInExpression(path.node.value)) hasChanges = true;
    });

    // --- 3. Storybook argTypes: labelSpacing: { options: [..., 'default', ...] } ---
    root.find(PropertyType, {key: {name: TARGET_PROP}}).forEach((/** @type {any} */ path) => {
      const value = path.node.value;
      if (!value || value.type !== 'ObjectExpression') return;

      const optionsProp = value.properties.find(
        (/** @type {any} */ p) => p.key && (p.key.name === 'options' || p.key.value === 'options'),
      );
      if (optionsProp && optionsProp.value.type === 'ArrayExpression') {
        optionsProp.value.elements.forEach((/** @type {any} */ el) => {
          if (renameStringLiteral(el)) hasChanges = true;
        });
      }
    });
  }

  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
