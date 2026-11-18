// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate Item and ListItem swipe actions to createSwipe
 *
 * `swipeActions={X}` on `Item` and `ListItem` becomes `swipe={createSwipe(X)}`
 * when `X` is an object literal whose `leading` and `trailing` are array
 * literals of object literals. Each entry with no `id` takes one from its side
 * and place, `'trailing-0'`, `'trailing-1'` and so on (entryIds). `createSwipe`
 * needs an `id` on every action, and a handler that takes nothing stays valid.
 * A `swipeBehavior={B}` beside it joins the options as `swipeBehavior`, merged
 * into the object in place. A static `'reveal'`, the default, is dropped. On a
 * row that already sets `swipe`, the deprecated props are ignored at run time,
 * so they are removed. A lone `swipeBehavior` with no `swipeActions` does
 * nothing, so it is removed too. `createSwipe` is imported from
 * `@astryxdesign/core/Swipe`, under a free alias when the file already binds
 * the name to something else. The `ItemSwipe*` types stay as they are:
 * `ItemSwipeAction` and `ItemSwipeActions` are deprecated with the props, and
 * `ItemSwipeActionVariant` and `ItemSwipeBehavior` stay supported.
 *
 * Built on the shared import resolver, so it does not follow variables,
 * helpers, wrappers, or types. Where it cannot see every entry, it keeps the
 * old props and leaves a TODO instead of guessing, so its output compiles.
 * That covers a name, a property, a computed value, and an object with a
 * spread or an entry that is not an object literal. It also covers any row
 * that spreads props, which may carry the deprecated props. The deprecated
 * props keep working there. Comments are the codemod's only report channel.
 * Each is added once, so a second run changes nothing.
 */

import {
  importedComponents,
  resolveImportedComponent,
} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate Item and ListItem swipe actions to createSwipe',
  description:
    'Replaces `swipeActions={X}` and `swipeBehavior` on Item and ListItem with ' +
    '`swipe={createSwipe({...X, swipeBehavior})}`, giving each entry an id ' +
    'from its side and place. Keeps the old props with a TODO where it cannot ' +
    'see every entry and where the row also spreads props; the deprecated ' +
    'props still work there.',
};

const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;
const SWIPE_SOURCE = '@astryxdesign/core/Swipe';
const OLD_PROPS = new Set(['swipeActions', 'swipeBehavior']);
const COMPONENTS = new Map([
  ['Item', OLD_PROPS],
  ['ListItem', OLD_PROPS],
]);
const VALUE_COMMENT =
  ' TODO(astryx upgrade): swipeActions and swipeBehavior are deprecated ' +
  '(DEP-0017). Pass swipe={createSwipe({leading, trailing, ' +
  'swipeBehavior})} instead, with an id on each action; this swipeActions ' +
  'value does not show every entry as an object literal, so it was left ' +
  'unchanged. ';
const SPREAD_COMMENT =
  ' TODO(astryx upgrade): swipeActions and swipeBehavior are deprecated ' +
  '(DEP-0017), and this row spreads props that may carry them, so it was ' +
  'left unchanged. Pass swipe={createSwipe({leading, trailing, ' +
  'swipeBehavior})} by hand. ';

const TYPE_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TypeCastExpression',
  'ParenthesizedExpression',
]);

/** @param {any} node */
function unwrap(node) {
  let current = node;
  while (current && TYPE_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}

/** @param {any} attribute */
function attributeValue(attribute) {
  return attribute.value?.type === 'JSXExpressionContainer'
    ? attribute.value.expression
    : attribute.value;
}

/** The static string of a node, or null. @param {any} node */
function staticString(node) {
  const value = unwrap(node);
  if (
    value != null &&
    (value.type === 'StringLiteral' || value.type === 'Literal') &&
    typeof value.value === 'string'
  ) {
    return value.value;
  }
  if (
    value?.type === 'TemplateLiteral' &&
    value.expressions.length === 0 &&
    value.quasis.length === 1
  ) {
    return value.quasis[0].value.cooked;
  }
  return null;
}

/** @param {any} j @param {any} node @param {string} text */
function addComment(j, node, text) {
  node.comments ??= [];
  if (node.comments.some((/** @type {any} */ c) => c.value === text)) {
    return false;
  }
  node.comments.push(j.commentBlock(text, true, false));
  return true;
}

/**
 * `preferred`, or `preferred` with a numeric suffix, whichever no binding or
 * reference in the file already uses.
 * @param {any} j @param {any} root @param {string} preferred
 */
function freeName(j, root, preferred) {
  const used = new Set();
  root.find(j.Identifier).forEach((/** @type {any} */ p) => {
    used.add(p.node.name);
  });
  if (!used.has(preferred)) {
    return preferred;
  }
  let n = 2;
  while (used.has(`${preferred}${n}`)) {
    n++;
  }
  return `${preferred}${n}`;
}

/**
 * The value import declaration of `@astryxdesign/core/Swipe` a named
 * specifier can join, adding one after the last import when there is none.
 * @param {any} j @param {any} root
 */
function swipeImport(j, root) {
  const existing = root
    .find(j.ImportDeclaration)
    .filter(
      (/** @type {any} */ p) =>
        p.node.source.value === SWIPE_SOURCE &&
        p.node.importKind !== 'type' &&
        !(p.node.specifiers ?? []).some(
          (/** @type {any} */ s) => s.type === 'ImportNamespaceSpecifier',
        ),
    );
  if (existing.size() > 0) {
    return existing.get().node;
  }
  const declaration = j.importDeclaration([], j.stringLiteral(SWIPE_SOURCE));
  const imports = root.find(j.ImportDeclaration);
  if (imports.size() > 0) {
    imports.at(imports.size() - 1).insertAfter(declaration);
  } else {
    root.get().node.program.body.unshift(declaration);
  }
  return declaration;
}

/**
 * The local name `createSwipe` is imported under, adding the import
 * when the file has none.
 * @param {any} j @param {any} root
 */
function ensureCreateImport(j, root) {
  let local = null;
  root
    .find(j.ImportDeclaration)
    .filter(
      (/** @type {any} */ p) =>
        CORE_IMPORT_RE.test(p.node.source.value) &&
        p.node.importKind !== 'type',
    )
    .forEach((/** @type {any} */ p) => {
      for (const specifier of p.node.specifiers ?? []) {
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.importKind !== 'type' &&
          specifier.imported.name === 'createSwipe'
        ) {
          local = specifier.local?.name ?? 'createSwipe';
        }
      }
    });
  if (local != null) {
    return local;
  }
  const name = freeName(j, root, 'createSwipe');
  swipeImport(j, root).specifiers.push(
    name === 'createSwipe'
      ? j.importSpecifier(j.identifier('createSwipe'))
      : j.importSpecifier(j.identifier('createSwipe'), j.identifier(name)),
  );
  return name;
}

/**
 * The options `swipeActions={value}` and `swipeBehavior` give: the value
 * itself, or an object with the behavior merged in.
 * @param {any} j @param {any} value @param {any} behavior
 */
function optionsOf(j, value, behavior) {
  if (behavior == null) {
    return value;
  }
  const property = j.objectProperty(j.identifier('swipeBehavior'), behavior);
  const object = unwrap(value);
  object.properties = object.properties.filter(
    (/** @type {any} */ p) =>
      !(
        (p.type === 'ObjectProperty' || p.type === 'Property') &&
        !p.computed &&
        (p.key?.name ?? p.key?.value) === 'swipeBehavior'
      ),
  );
  object.properties.push(property);
  return object;
}

/** A property's own name, or null for a computed key or a spread. */
function keyOf(/** @type {any} */ property) {
  if (
    (property.type !== 'ObjectProperty' && property.type !== 'Property') ||
    property.computed
  ) {
    return null;
  }
  return property.key?.name ?? property.key?.value ?? null;
}

/**
 * The entries of an inline swipeActions object, by side. Null when it hides
 * one: a spread, a side that is no array literal, or an entry that is no
 * object literal.
 * @param {any} object
 */
function visibleEntries(object) {
  /** @type {Array<[string, any[]]>} */
  const sides = [];
  for (const property of object.properties) {
    const key = keyOf(property);
    if (key == null) {
      return null;
    }
    if (key !== 'leading' && key !== 'trailing') {
      continue;
    }
    const array = unwrap(property.value);
    if (
      array?.type !== 'ArrayExpression' ||
      array.elements.some(
        (/** @type {any} */ e) => unwrap(e)?.type !== 'ObjectExpression',
      )
    ) {
      return null;
    }
    sides.push([key, array.elements.map(unwrap)]);
  }
  return sides;
}

/**
 * Gives each entry with no `id` one from its side and place: `createSwipe`
 * needs an `id` on every action.
 * @param {any} j @param {Array<[string, any[]]>} sides
 */
function entryIds(j, sides) {
  for (const [side, entries] of sides) {
    entries.forEach((entry, index) => {
      if (!entry.properties.some((/** @type {any} */ p) => keyOf(p) === 'id')) {
        entry.properties.unshift(
          j.objectProperty(
            j.identifier('id'),
            j.stringLiteral(`${side}-${index}`),
          ),
        );
      }
    });
  }
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
  /** @type {Array<() => void>} */
  const rewrites = [];

  const imports = importedComponents(root, j, {
    matchesImport: source => CORE_IMPORT_RE.test(source),
    components: COMPONENTS,
  });
  if (imports.direct.size > 0 || imports.namespaces.size > 0) {
    root.find(j.JSXOpeningElement).forEach((/** @type {any} */ jsxPath) => {
      if (!resolveImportedComponent(jsxPath.node.name, jsxPath, imports)) {
        return;
      }
      const opening = jsxPath.node;
      const attributes = opening.attributes ?? [];
      const named = (/** @type {string} */ name) =>
        attributes.find(
          (/** @type {any} */ a) =>
            a.type === 'JSXAttribute' && a.name?.name === name,
        );
      const actions = named('swipeActions');
      const behavior = named('swipeBehavior');
      const swipe = named('swipe');
      const spread = attributes.find(
        (/** @type {any} */ a) => a.type === 'JSXSpreadAttribute',
      );
      if (swipe != null) {
        // `swipe` wins at run time: the deprecated props do nothing here.
        if (actions != null || behavior != null) {
          rewrites.push(() => {
            opening.attributes = opening.attributes.filter(
              (/** @type {any} */ a) => a !== actions && a !== behavior,
            );
          });
        }
        return;
      }
      if (spread != null) {
        hasChanges =
          addComment(j, actions ?? behavior ?? spread, SPREAD_COMMENT) ||
          hasChanges;
        return;
      }
      if (actions == null) {
        // A lone swipeBehavior does nothing without swipe actions.
        if (behavior != null) {
          rewrites.push(() => {
            opening.attributes = opening.attributes.filter(
              (/** @type {any} */ a) => a !== behavior,
            );
          });
        }
        return;
      }
      const value = attributeValue(actions);
      const valueNode = unwrap(value);
      const sides =
        valueNode?.type === 'ObjectExpression'
          ? visibleEntries(valueNode)
          : null;
      if (sides == null) {
        hasChanges = addComment(j, actions, VALUE_COMMENT) || hasChanges;
        return;
      }
      const behaviorValue = behavior == null ? null : attributeValue(behavior);
      const isDefault =
        behaviorValue != null && staticString(behaviorValue) === 'reveal';
      rewrites.push(() => {
        entryIds(j, sides);
        const create = ensureCreateImport(j, root);
        const options = optionsOf(
          j,
          value,
          behaviorValue == null || isDefault
            ? null
            : staticString(behaviorValue) != null
              ? j.stringLiteral(staticString(behaviorValue))
              : behaviorValue,
        );
        const call = j.callExpression(j.identifier(create), [options]);
        actions.name = j.jsxIdentifier('swipe');
        actions.value = j.jsxExpressionContainer(call);
        opening.attributes = opening.attributes.filter(
          (/** @type {any} */ a) => a !== behavior,
        );
      });
    });
  }

  for (const rewrite of rewrites) {
    rewrite();
    hasChanges = true;
  }
  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
