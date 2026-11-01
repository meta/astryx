// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: Migrate Table tableProps to direct root props
 * @see https://github.com/meta/astryx/issues/3679
 *
 * `tableProps` (typed HTMLAttributes<HTMLTableElement>, nesting HTML
 * attributes one level deep) is deprecated. As of v0.1.7, <Table> honors
 * className/style/xstyle directly and spreads all other BaseProps
 * (id, aria-*, data-*, event handlers, ...) onto the root <table>, with
 * direct props taking precedence over tableProps.
 *
 * This codemod lifts object-literal `tableProps` keys into sibling JSX
 * props:
 *
 * - tableProps={{className: 'x', style: s}} → className="x" style={s}
 * - String-literal keys ('aria-label', 'data-testid') become hyphenated
 *   JSX attributes.
 * - Keys that collide with an existing sibling attribute (or fail the
 *   attribute-name guard) are kept inside a shrunken tableProps with a
 *   trailing TODO comment for manual migration.
 * - Dynamic values (tableProps={props}, tableProps={fn()}, objects with
 *   spreads/computed keys/methods) are left untouched with a TODO comment.
 *
 * Only elements whose name resolves to a `Table` import (alias-aware)
 * from an Astryx core source are rewritten. No import changes are needed.
 */

export const meta = {
  title: 'Migrate Table tableProps to direct root props',
  description:
    'Lifts object-literal `tableProps` keys on <Table> into sibling JSX props ' +
    '(className, style, id, aria-*, data-*, event handlers). Dynamic or ' +
    'colliding entries are kept and annotated with a TODO comment.',
  pr: '#3679',
};

/** Import sources that provide the Astryx Table component. */
const TABLE_IMPORT_SOURCES = new Set([
  '@astryxdesign/core',
  '@astryxdesign/core/Table',
  '@xds/core',
  '@xds/core/Table',
]);

/** Keys must be valid JSX attribute names to be lifted. */
const LIFTABLE_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

const TODO_COMMENT =
  ' TODO(astryx): tableProps is deprecated — merge these into direct props manually ';

/**
 * Extract the static key name from an object property, or null when the
 * property is not a simple liftable entry (spread, computed key, method,
 * getter/setter, non-string literal key).
 */
function getPropertyKeyName(/** @type {any} */ prop) {
  if (prop.type !== 'ObjectProperty' && prop.type !== 'Property') return null;
  // espree-style Property nodes: skip methods and accessors
  if (prop.method || (prop.kind != null && prop.kind !== 'init')) return null;
  if (prop.computed) return null;
  const key = prop.key;
  if (key.type === 'Identifier') return key.name;
  if (
    (key.type === 'StringLiteral' || key.type === 'Literal') &&
    typeof key.value === 'string'
  ) {
    return key.value;
  }
  return null;
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

  // --- 1. Track local names for the Table import (alias-aware) ---
  const tableLocals = new Set();
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
    if (!TABLE_IMPORT_SOURCES.has(path.node.source.value)) return;
    for (const spec of path.node.specifiers ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported.name === 'Table') {
        tableLocals.add(spec.local.name);
      }
    }
  });

  if (tableLocals.size === 0) return undefined;

  function attachTodo(/** @type {any} */ attr) {
    if (!attr.comments) attr.comments = [];
    if (attr.comments.some((/** @type {any} */ c) => c.value === TODO_COMMENT)) return;
    attr.comments.push(j.commentBlock(TODO_COMMENT, false, true));
    hasChanges = true;
  }

  function buildAttributeValue(/** @type {any} */ valueNode) {
    if (
      valueNode.type === 'StringLiteral' ||
      (valueNode.type === 'Literal' && typeof valueNode.value === 'string')
    ) {
      return j.stringLiteral(valueNode.value);
    }
    return j.jsxExpressionContainer(valueNode);
  }

  // --- 2. Rewrite tableProps on tracked <Table> elements ---
  root.find(j.JSXOpeningElement).forEach((/** @type {any} */ path) => {
    const name = path.node.name;
    const componentName = name.type === 'JSXIdentifier' ? name.name : null;
    if (!componentName || !tableLocals.has(componentName)) return;

    const attrs = path.node.attributes;
    const tablePropsAttr = attrs.find(
      (/** @type {any} */ a) => a.type === 'JSXAttribute' && a.name?.name === 'tableProps',
    );
    if (!tablePropsAttr) return;

    const value = tablePropsAttr.value;
    const isObjectLiteral =
      value?.type === 'JSXExpressionContainer' &&
      value.expression.type === 'ObjectExpression';

    // Dynamic case: tableProps={identifier}, tableProps={fn()}, ... —
    // leave the attribute untouched and warn via a trailing comment
    // (api.report is a stub; comments are the only warning channel).
    if (!isObjectLiteral) {
      attachTodo(tablePropsAttr);
      return;
    }

    const obj = value.expression;

    // Objects containing spreads, computed keys, or methods are treated
    // as dynamic: no partial lift, just the TODO comment.
    const allSimple = obj.properties.every(
      (/** @type {any} */ prop) => getPropertyKeyName(prop) !== null,
    );
    if (!allSimple) {
      attachTodo(tablePropsAttr);
      return;
    }

    /** @type {any[]} */
    const lifted = [];
    /** @type {any[]} */
    const kept = [];
    for (const prop of obj.properties) {
      const keyName = getPropertyKeyName(prop);
      const collidesWithSibling = attrs.some(
        (/** @type {any} */ a) => a.type === 'JSXAttribute' && a.name?.name === keyName,
      );
      const collidesWithLifted = lifted.some(
        (/** @type {any} */ a) => a.name.name === keyName,
      );
      if (
        !LIFTABLE_KEY_RE.test(keyName) ||
        collidesWithSibling ||
        collidesWithLifted
      ) {
        kept.push(prop);
        continue;
      }
      lifted.push(
        j.jsxAttribute(
          j.jsxIdentifier(keyName),
          buildAttributeValue(prop.value),
        ),
      );
    }

    const tablePropsIdx = attrs.indexOf(tablePropsAttr);
    if (kept.length === 0) {
      // All keys lifted — replace tableProps with the sibling attributes.
      attrs.splice(tablePropsIdx, 1, ...lifted);
      hasChanges = true;
    } else {
      // Some keys collide or fail the name guard — keep only those in a
      // shrunken tableProps and flag it for manual migration.
      attrs.splice(tablePropsIdx, 0, ...lifted);
      obj.properties = kept;
      attachTodo(tablePropsAttr);
      if (lifted.length > 0) hasChanges = true;
    }
  });

  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
