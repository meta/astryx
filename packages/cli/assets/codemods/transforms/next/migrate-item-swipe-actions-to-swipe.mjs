// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate Item and ListItem swipe actions to createSwipe
 *
 * `swipeActions={X}` on `Item` and `ListItem` becomes
 * `swipe={createSwipe(X)}` (`spec:AST-057` DEP-0017). A
 * `swipeBehavior={B}` beside it joins the options as `swipeBehavior`: merged
 * into an inline object literal in place, or after a spread of a name, except
 * a static `'reveal'`, the default, which is dropped. A name or call-free
 * property may be undefined at run time, so it is guarded:
 * `X ? createSwipe(X) : undefined` keeps the row without swipe actions
 * it drew without one. On a row that already sets `swipe`, the deprecated props
 * are ignored at run time, so they are removed; a lone `swipeBehavior` with no
 * `swipeActions` does nothing, so it is removed too. `createSwipe` is
 * imported from `@astryxdesign/core/Swipe`, under a free alias when the
 * file already binds the name to something else. The four `ItemSwipe*` types
 * imported from Core become `SwipeAction`, `CreateSwipeOptions`,
 * `SwipeActionVariant` and `SwipeBehavior`, imported from
 * `@astryxdesign/core/Swipe` when the old ones came from a subpath that
 * does not export the new ones; a statement that mutates the `leading` or
 * `trailing` array of a value it retypes as `CreateSwipeOptions`, whose
 * arrays are readonly, is reported.
 *
 * Built on the shared import resolver, so it does not follow variables,
 * helpers, wrappers, or types. Where it cannot prove the result it keeps the
 * old props and leaves a TODO instead of guessing: a `swipeActions` value that
 * is neither an object literal nor a name or call-free property, and any row
 * that spreads props, which may carry the deprecated props (`spec:AST-017`
 * FR29c, FR29d). The deprecated props keep working there. Comments are the
 * codemod's only report channel, and each is added once, so a second run
 * changes nothing.
 */

import {
  importedComponents,
  resolveImportedComponent,
} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate Item and ListItem swipe actions to createSwipe',
  description:
    'Replaces `swipeActions={X}` and `swipeBehavior` on Item and ListItem with ' +
    '`swipe={createSwipe({...X, swipeBehavior})}` and renames the ' +
    '`ItemSwipe*` types. Keeps the old props with a TODO where the value is ' +
    'computed and where the row also spreads props; the deprecated props still ' +
    'work there.',
};

const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;
const CORE_ROOT_RE = /^@(astryxdesign|xds)\/core$/;
const SWIPE_SOURCE = '@astryxdesign/core/Swipe';
const OLD_PROPS = new Set(['swipeActions', 'swipeBehavior']);
const COMPONENTS = new Map([
  ['Item', OLD_PROPS],
  ['ListItem', OLD_PROPS],
]);
const TYPE_RENAMES = new Map([
  ['ItemSwipeAction', 'SwipeAction'],
  ['ItemSwipeActions', 'CreateSwipeOptions'],
  ['ItemSwipeActionVariant', 'SwipeActionVariant'],
  ['ItemSwipeBehavior', 'SwipeBehavior'],
]);

const VALUE_COMMENT =
  ' TODO(astryx upgrade): swipeActions and swipeBehavior are deprecated ' +
  '(DEP-0017). Pass swipe={createSwipe({leading, trailing, ' +
  'swipeBehavior})} instead; this swipeActions value is computed (not an ' +
  'object, a name, or a call-free property), so it was left unchanged. ';
const READONLY_COMMENT =
  " TODO(astryx upgrade): CreateSwipeOptions' leading and trailing are " +
  'readonly SwipeAction[]; this mutates one. Build a new array instead, ' +
  'such as [...options.trailing, entry]. ';
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

/**
 * A name, or a property chain on one with no call and no computed key other
 * than a literal: safe to read twice, and narrowed by a `?:` guard.
 * @param {any} node
 * @returns {boolean}
 */
function isCallFreeChain(node) {
  const value = unwrap(node);
  if (value == null) {
    return false;
  }
  if (value.type === 'Identifier' || value.type === 'ThisExpression') {
    return true;
  }
  if (value.type === 'MemberExpression') {
    const key = value.property;
    const literalKey =
      !value.computed ||
      key.type === 'StringLiteral' ||
      key.type === 'NumericLiteral' ||
      key.type === 'Literal';
    return (
      literalKey && value.optional !== true && isCallFreeChain(value.object)
    );
  }
  return false;
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
 * @param {any} j @param {any} root @param {'value' | 'type'} kind
 */
function swipeImport(j, root, kind) {
  const existing = root
    .find(j.ImportDeclaration)
    .filter(
      (/** @type {any} */ p) =>
        p.node.source.value === SWIPE_SOURCE &&
        (kind === 'type'
          ? p.node.importKind === 'type'
          : p.node.importKind !== 'type') &&
        !(p.node.specifiers ?? []).some(
          (/** @type {any} */ s) => s.type === 'ImportNamespaceSpecifier',
        ),
    );
  if (existing.size() > 0) {
    return existing.get().node;
  }
  const declaration = j.importDeclaration([], j.stringLiteral(SWIPE_SOURCE));
  if (kind === 'type') {
    declaration.importKind = 'type';
  }
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
  swipeImport(j, root, 'value').specifiers.push(
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
  if (object.type === 'ObjectExpression') {
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
  return j.objectExpression([j.spreadElement(value), property]);
}

/** Array methods that change the array they are called on. */
const MUTATORS = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);

/**
 * Reports each statement that mutates the `leading` or `trailing` array of a
 * value declared with one of `typeNames` (the local names of
 * `ItemSwipeActions`), which this codemod retypes as `CreateSwipeOptions`,
 * whose arrays are `readonly SwipeAction[]` (`spec:AST-057` DEP-0017). A value
 * is a variable, parameter or property annotated with the type, or a variable
 * whose value is cast to it.
 * @param {any} j @param {any} root @param {Set<string>} typeNames
 */
function reportReadonlyMutations(j, root, typeNames) {
  if (typeNames.size === 0) {
    return false;
  }
  const namesType = (/** @type {any} */ annotation) =>
    annotation?.type === 'TSTypeReference' &&
    annotation.typeName?.type === 'Identifier' &&
    typeNames.has(annotation.typeName.name);
  const values = new Set();
  root.find(j.Identifier).forEach((/** @type {any} */ p) => {
    if (namesType(p.node.typeAnnotation?.typeAnnotation)) {
      values.add(p.node.name);
    }
  });
  root.find(j.VariableDeclarator).forEach((/** @type {any} */ p) => {
    const init = p.node.init;
    if (
      p.node.id?.type === 'Identifier' &&
      (init?.type === 'TSAsExpression' ||
        init?.type === 'TSSatisfiesExpression') &&
      namesType(init.typeAnnotation)
    ) {
      values.add(p.node.id.name);
    }
  });
  if (values.size === 0) {
    return false;
  }
  /** `value.leading` or `value.trailing`. @param {any} node */
  const isSide = node => {
    const member = unwrap(node);
    const object = unwrap(member?.object);
    return (
      member?.type === 'MemberExpression' &&
      !member.computed &&
      (member.property?.name === 'leading' ||
        member.property?.name === 'trailing') &&
      object?.type === 'Identifier' &&
      values.has(object.name)
    );
  };
  /** Inside a side: `value.leading[0]`, `value.trailing.length`. @param {any} node */
  const isInSide = node => {
    const member = unwrap(node);
    return member?.type === 'MemberExpression' && isSide(member.object);
  };
  let changed = false;
  const report = (/** @type {any} */ path) => {
    let at = path;
    while (
      at?.parent != null &&
      !/Statement$|Declaration$/.test(at.node.type)
    ) {
      at = at.parent;
    }
    if (at?.node != null && at.node.type !== 'Program') {
      changed = addComment(j, at.node, READONLY_COMMENT) || changed;
    }
  };
  root.find(j.CallExpression).forEach((/** @type {any} */ p) => {
    const callee = unwrap(p.node.callee);
    if (
      callee?.type === 'MemberExpression' &&
      !callee.computed &&
      MUTATORS.has(callee.property?.name) &&
      isSide(callee.object)
    ) {
      report(p);
    }
  });
  root.find(j.AssignmentExpression).forEach((/** @type {any} */ p) => {
    if (isInSide(p.node.left)) report(p);
  });
  root.find(j.UpdateExpression).forEach((/** @type {any} */ p) => {
    if (isInSide(p.node.argument)) report(p);
  });
  root.find(j.UnaryExpression).forEach((/** @type {any} */ p) => {
    if (p.node.operator === 'delete' && isInSide(p.node.argument)) report(p);
  });
  return changed;
}

/**
 * Renames the four `ItemSwipe*` types imported from Core, importing the new
 * names from the Swipe entry when their entry does not export them, and
 * reports mutations of a retyped value's arrays.
 * @param {any} j @param {any} root
 */
function renameTypes(j, root) {
  let changed = false;
  /** @type {Map<string, string>} local names to rename in the file */
  const locals = new Map();
  /** @type {Set<string>} local names of `ItemSwipeActions` */
  const optionsTypes = new Set();
  root
    .find(j.ImportDeclaration)
    .filter((/** @type {any} */ p) => CORE_IMPORT_RE.test(p.node.source.value))
    .forEach((/** @type {any} */ p) => {
      const declaration = p.node;
      const fromRoot =
        CORE_ROOT_RE.test(declaration.source.value) ||
        declaration.source.value === SWIPE_SOURCE;
      const moved = [];
      for (const specifier of [...(declaration.specifiers ?? [])]) {
        if (specifier.type !== 'ImportSpecifier') continue;
        const replacement = TYPE_RENAMES.get(specifier.imported.name);
        if (replacement == null) continue;
        const localName = specifier.local?.name ?? specifier.imported.name;
        const isAliased = localName !== specifier.imported.name;
        const next = isAliased
          ? j.importSpecifier(
              j.identifier(replacement),
              j.identifier(localName),
            )
          : j.importSpecifier(j.identifier(replacement));
        if (specifier.importKind === 'type') next.importKind = 'type';
        if (!isAliased) locals.set(localName, replacement);
        if (specifier.imported.name === 'ItemSwipeActions') {
          optionsTypes.add(localName);
        }
        if (fromRoot) {
          declaration.specifiers.splice(
            declaration.specifiers.indexOf(specifier),
            1,
            next,
          );
        } else {
          declaration.specifiers.splice(
            declaration.specifiers.indexOf(specifier),
            1,
          );
          moved.push(next);
        }
        changed = true;
      }
      if (moved.length > 0) {
        // Each name keeps the import kind it had: a type-only declaration
        // stays type-only, an inline `type` stays inline.
        swipeImport(
          j,
          root,
          declaration.importKind === 'type' ? 'type' : 'value',
        ).specifiers.push(...moved);
        if (declaration.specifiers.length === 0) {
          j(p).remove();
        }
      }
    });
  changed = reportReadonlyMutations(j, root, optionsTypes) || changed;
  if (locals.size > 0) {
    root.find(j.Identifier).forEach((/** @type {any} */ p) => {
      const replacement = locals.get(p.node.name);
      if (replacement == null) return;
      const parent = p.parent?.node;
      const isKey =
        (parent?.type === 'MemberExpression' &&
          parent.property === p.node &&
          !parent.computed) ||
        ((parent?.type === 'ObjectProperty' || parent?.type === 'Property') &&
          parent.key === p.node &&
          !parent.computed) ||
        parent?.type === 'ImportSpecifier';
      if (!isKey) p.node.name = replacement;
    });
  }
  return changed;
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
      const isObject = valueNode?.type === 'ObjectExpression';
      if (!(isObject || isCallFreeChain(valueNode))) {
        hasChanges = addComment(j, actions, VALUE_COMMENT) || hasChanges;
        return;
      }
      const behaviorValue = behavior == null ? null : attributeValue(behavior);
      const isDefault =
        behaviorValue != null && staticString(behaviorValue) === 'reveal';
      rewrites.push(() => {
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
        actions.value = j.jsxExpressionContainer(
          isObject
            ? call
            : j.conditionalExpression(value, call, j.identifier('undefined')),
        );
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
  hasChanges = renameTypes(j, root) || hasChanges;
  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
