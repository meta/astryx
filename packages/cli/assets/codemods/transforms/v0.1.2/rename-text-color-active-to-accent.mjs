// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: Rename Text/Heading/Link/Timestamp color "active" to "accent"
 * @see https://github.com/meta/astryx/issues/2863
 *
 * The `active` text-color value is renamed to `accent` and now maps to the
 * dedicated `--color-text-accent` token (legible accent ink) instead of
 * `--color-accent` (the interactive/base accent surface). This gives a
 * first-class, type-safe way to render accent-colored text and resolves the
 * gap reported in #2863.
 *
 * Transforms (scoped to Text, Heading, Link, and Timestamp):
 * - <Text color="active" />            → <Text color="accent" />
 * - <Heading color={'active'} />       → <Heading color={'accent'} />
 * - <Text color={cond ? 'active' : x}> → <Text color={cond ? 'accent' : x}>
 * - Storybook argTypes: color: { options: [..., 'active', ...] }
 *     → replaces 'active' with 'accent' (files importing a target component)
 * - Object properties: { color: 'active' } / { color: 'active' as const }
 *     → { color: 'accent' } (files importing a target component)
 *
 * The transform deliberately does NOT touch bare `'active'` strings that are
 * not a `color` value (e.g. status enums, ids, filter values), so it is safe
 * to run across an entire codebase.
 */

export const meta = {
  title: 'Rename Text/Heading/Link/Timestamp color "active" to "accent"',
  description:
    'Renames the `color="active"` value to `color="accent"` on Text, Heading, ' +
    'Link, and Timestamp. The `accent` value maps to `--color-text-accent` ' +
    '(the dedicated accent text ink). Also updates Storybook color argTypes ' +
    'options and object-literal `color` props in files that import a target component.',
  pr: '#2863',
};

const OLD_VALUE = 'active';
const NEW_VALUE = 'accent';

/** Components whose `color` prop accepts a TextColor value. */
const TARGET_COMPONENTS = new Set(['Text', 'Heading', 'Link', 'Timestamp']);

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
      // `'active' as const` → rewrite the inner expression
      changed = renameInExpression(node.expression) || changed;
    }
    return changed;
  }

  // --- 1. JSX attribute: color="active" / color={'active'} on target components ---
  root.find(j.JSXOpeningElement).forEach((/** @type {any} */ path) => {
    const name = path.node.name;
    const componentName = name.type === 'JSXIdentifier' ? name.name : null;
    if (!componentName || !TARGET_COMPONENTS.has(componentName)) return;

    path.node.attributes.forEach((/** @type {any} */ attr) => {
      if (attr.type !== 'JSXAttribute') return;
      if (!attr.name || attr.name.name !== 'color') return;

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
  // component — keeps unrelated `{ color: 'active' }` / `'active'` strings safe.
  const importsTarget =
    root
      .find(j.ImportSpecifier)
      .filter((/** @type {any} */ p) => TARGET_COMPONENTS.has(p.node.imported?.name))
      .size() > 0;

  if (importsTarget) {
    const PropertyType = j.ObjectProperty ?? j.Property;

    // --- 2. Object property: { color: 'active' } / { color: 'active' as const } ---
    root.find(PropertyType, {key: {name: 'color'}}).forEach((/** @type {any} */ path) => {
      if (renameInExpression(path.node.value)) hasChanges = true;
    });

    // --- 3. Storybook argTypes: color: { options: [..., 'active', ...] } ---
    root.find(PropertyType, {key: {name: 'color'}}).forEach((/** @type {any} */ path) => {
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
