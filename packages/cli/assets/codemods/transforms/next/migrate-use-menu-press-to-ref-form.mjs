// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: move useMenuPress to its ref form
 *
 * `useMenuPress({menuRef, ...options})` becomes
 * `useMenuPress(menuRef, {...options})`. The ref form takes the press-downs of
 * the menu and the trigger itself. So the spreads of the old return's
 * `menuProps` and `triggerProps` go. In a DropdownMenu trigger render
 * function, a redundant forward of `onPointerDown` or `onContextMenu` goes. It
 * goes only where a spread of the trigger props on the same element still
 * passes it. That spread comes after the forward, or before it with no other
 * spread between. Any other forward stays as it is.
 *
 * Where it cannot prove the result, it leaves the code unchanged with a TODO.
 * That covers options that are not an object literal or that spread, and a
 * return used other than through those spreads, `isTriggerClickFromPress` and
 * `cancel`. It also covers a call that spreads no `menuProps` on the menu
 * element, since the old call then ran no press. So does a trigger that the old
 * call reached only through its spread, since a release on it closed the menu.
 * So does a spread on an element whose `ref` is not the menu's or the
 * trigger's. So does an element inside the menu or the trigger that sets
 * `onPointerDown` or spreads props. So does a component, or a child other than
 * JSX or a literal, inside them. The menu and trigger elements must sit in one
 * of the component's returns, through DOM elements, fragments and conditions
 * only. A component element or a function may mount them in a later commit,
 * when the ref form does not read their refs. With a trigger, the menu element
 * must sit in the component's one returned JSX, through DOM elements and
 * fragments only. No function, prop value or early return may stand in between.
 * The ref form has no press while the menu is unmounted. The deprecated forms
 * keep working there. Comments are the codemod's only report channel. Each is
 * added once, so a second run changes nothing.
 */

export const meta = {
  title: 'Move useMenuPress to its ref form',
  description:
    'Rewrites `useMenuPress({menuRef, ...options})` to ' +
    '`useMenuPress(menuRef, {...options})` and removes the spreads of its ' +
    '`menuProps` and `triggerProps`, which the ref form does not return. ' +
    "Removes redundant forwards of a DropdownMenu trigger's " +
    '`onPointerDown` and `onContextMenu`. Leaves a TODO where it cannot ' +
    'prove the result; the deprecated forms still work there.',
};

const HOOK = 'useMenuPress';
const DROPDOWN = 'DropdownMenu';
const TRIGGER_PROPS_TYPE = 'DropdownMenuTriggerProps';
const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;
const TRIGGER_HANDLERS = new Set(['onPointerDown', 'onContextMenu']);
const KEPT_RETURN_KEYS = new Set(['isTriggerClickFromPress', 'cancel']);
const SPREAD_KEYS = new Set(['menuProps', 'triggerProps']);

const CALL_COMMENT =
  ' TODO(astryx upgrade): useMenuPress({menuRef, ...}) is deprecated. Call ' +
  'useMenuPress(menuRef, options) instead, pass triggerRef, and remove the ' +
  'menuProps and triggerProps spreads. With a trigger, keep the menu ' +
  'element mounted while closed. This call could not be rewritten safely, ' +
  'so it was left unchanged. ';

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

/** @param {any} property */
function isPlainProperty(property) {
  return (
    (property.type === 'ObjectProperty' || property.type === 'Property') &&
    property.kind !== 'get' &&
    property.kind !== 'set' &&
    property.method !== true
  );
}

/** The static name of a property's key, or null. @param {any} property */
function keyName(property) {
  if (property.computed) {
    return null;
  }
  const key = property.key;
  if (key.type === 'Identifier') {
    return key.name;
  }
  if (
    (key.type === 'StringLiteral' || key.type === 'Literal') &&
    typeof key.value === 'string'
  ) {
    return key.value;
  }
  return null;
}

/** The imported name of a specifier. @param {any} specifier */
function importedName(specifier) {
  return specifier.imported.name ?? specifier.imported.value;
}

/** @param {any} attribute */
function attributeExpression(attribute) {
  return attribute?.value?.type === 'JSXExpressionContainer'
    ? attribute.value.expression
    : null;
}

/** @param {any} opening @param {string} name */
function findAttribute(opening, name) {
  return (
    opening.attributes.find(
      (/** @type {any} */ attribute) =>
        attribute.type === 'JSXAttribute' &&
        attribute.name.type === 'JSXIdentifier' &&
        attribute.name.name === name,
    ) ?? null
  );
}

/** Source text with whitespace removed, to compare two refs. */
function sourceOf(/** @type {any} */ j, /** @type {any} */ node) {
  return j(node).toSource().replace(/\s+/g, '');
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
 * Whether an identifier reads its binding, as opposed to naming a property
 * or a type.
 * @param {any} path
 */
function isReference(path) {
  const parent = path.parent?.node;
  const node = path.node;
  if (parent == null) {
    return true;
  }
  if (node.type === 'JSXIdentifier') {
    // A JSX attribute's name is no read; a component's name is.
    return parent.type === 'JSXMemberExpression'
      ? parent.object === node
      : parent.type === 'JSXOpeningElement';
  }
  if (
    (parent.type === 'MemberExpression' ||
      parent.type === 'OptionalMemberExpression') &&
    parent.property === node &&
    !parent.computed
  ) {
    return false;
  }
  // A shorthand property reads its name in an object, but its key only names
  // the property in a pattern.
  if (
    (parent.type === 'ObjectProperty' || parent.type === 'Property') &&
    parent.key === node &&
    !parent.computed &&
    (parent.shorthand !== true ||
      path.parent.parent?.node.type === 'ObjectPattern')
  ) {
    return false;
  }
  if (
    (parent.type === 'ObjectMethod' ||
      parent.type === 'ClassProperty' ||
      parent.type === 'ClassMethod' ||
      parent.type === 'TSPropertySignature') &&
    parent.key === node &&
    !parent.computed
  ) {
    return false;
  }
  return !(
    parent.type === 'TSQualifiedName' ||
    parent.type === 'TSTypeReference' ||
    parent.type === 'LabeledStatement' ||
    parent.type === 'BreakStatement' ||
    parent.type === 'ContinueStatement'
  );
}

/** Whether an identifier declares a binding. @param {any} path */
function isBinding(path) {
  const parent = path.parent?.node;
  const node = path.node;
  if (parent == null) {
    return false;
  }
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.id === node;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'ClassDeclaration':
      return parent.id === node || parent.params?.includes(node) === true;
    case 'AssignmentPattern':
      return parent.left === node;
    case 'RestElement':
      return parent.argument === node;
    case 'ArrayPattern':
      return parent.elements.includes(node);
    case 'CatchClause':
      return parent.param === node;
    case 'ObjectProperty':
    case 'Property':
      return (
        parent.value === node &&
        path.parent.parent?.node.type === 'ObjectPattern'
      );
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return parent.local === node;
    default:
      return false;
  }
}

/** Whether `name` is bound again inside `scope`, besides `binding`. */
function isRedeclared(
  /** @type {any} */ j,
  /** @type {any} */ scope,
  /** @type {string} */ name,
  /** @type {any} */ binding,
) {
  return (
    j(scope)
      .find(j.Identifier, {name})
      .filter(
        (/** @type {any} */ path) => path.node !== binding && isBinding(path),
      )
      .size() > 0
  );
}

/**
 * The spreads of the old return's `menuProps` and `triggerProps`, and the
 * edits that drop them, or null when another use keeps the call unproven.
 * @param {any} j @param {any} root @param {any} callPath
 * @param {any} menuRef @param {any} triggerRef
 */
function planReturnUses(j, root, callPath, menuRef, triggerRef) {
  const parent = callPath.parent.node;
  /** @type {{removals: Array<() => void>}} */
  const plan = {removals: []};
  if (parent.type === 'ExpressionStatement') {
    // An unused result spreads no menuProps, so the old call ran no press.
    return null;
  }
  if (parent.type !== 'VariableDeclarator' || parent.init !== callPath.node) {
    return null;
  }
  const functions = j(callPath).closest(j.Function);
  const scope =
    functions.size() > 0
      ? functions.paths()[0]
      : root.find(j.Program).paths()[0];
  /** @type {{menuProps: any[], triggerProps: any[]}} */
  const spreads = {menuProps: [], triggerProps: []};

  if (parent.id.type === 'Identifier') {
    const name = parent.id.name;
    if (isRedeclared(j, scope, name, parent.id)) {
      return null;
    }
    let isProven = true;
    j(scope)
      .find(j.Identifier, {name})
      .forEach((/** @type {any} */ path) => {
        if (!isProven || path.node === parent.id || !isReference(path)) {
          return;
        }
        const member = path.parent.node;
        if (
          member.type !== 'MemberExpression' ||
          member.object !== path.node ||
          member.computed
        ) {
          isProven = false;
          return;
        }
        const key = member.property.name;
        if (KEPT_RETURN_KEYS.has(key)) {
          return;
        }
        const spread = path.parent.parent;
        if (
          !SPREAD_KEYS.has(key) ||
          spread?.node.type !== 'JSXSpreadAttribute' ||
          spread.node.argument !== member
        ) {
          isProven = false;
          return;
        }
        spreads[/** @type {'menuProps' | 'triggerProps'} */ (key)].push(spread);
      });
    if (!isProven) {
      return null;
    }
  } else if (parent.id.type === 'ObjectPattern') {
    const pattern = parent.id;
    /** @type {any[]} */
    const kept = [];
    for (const property of pattern.properties) {
      if (!isPlainProperty(property)) {
        return null;
      }
      const key = keyName(property);
      if (key != null && KEPT_RETURN_KEYS.has(key)) {
        kept.push(property);
        continue;
      }
      if (key == null || !SPREAD_KEYS.has(key)) {
        return null;
      }
      const local = property.value;
      if (
        local.type !== 'Identifier' ||
        isRedeclared(j, scope, local.name, local)
      ) {
        return null;
      }
      let isProven = true;
      j(scope)
        .find(j.Identifier, {name: local.name})
        .forEach((/** @type {any} */ path) => {
          if (!isProven || path.node === local || !isReference(path)) {
            return;
          }
          if (path.parent.node.type !== 'JSXSpreadAttribute') {
            isProven = false;
            return;
          }
          spreads[/** @type {'menuProps' | 'triggerProps'} */ (key)].push(
            path.parent,
          );
        });
      if (!isProven) {
        return null;
      }
    }
    const declaration = callPath.parent.parent;
    plan.removals.push(() => {
      if (kept.length > 0 || declaration.node.declarations.length > 1) {
        pattern.properties = kept;
        return;
      }
      j(declaration).replaceWith(j.expressionStatement(callPath.node));
    });
  } else {
    return null;
  }

  // The old call ran a press only through a menuProps spread.
  if (spreads.menuProps.length === 0) {
    return null;
  }
  // A trigger opens a menu that must stay mounted: the ref form has no press
  // while the menu is unmounted.
  // A trigger the old call never reached keeps no press: the ref form would
  // add one on its ref.
  if (triggerRef != null && spreads.triggerProps.length === 0) {
    return null;
  }
  // A trigger that the old call reached only through its spread was not its
  // trigger, so a release there closed the menu. As `triggerRef`, it would not.
  if (triggerRef == null && spreads.triggerProps.length > 0) {
    return null;
  }
  if (
    triggerRef != null &&
    !spreads.menuProps.every(spread => isAlwaysRendered(j, spread, scope))
  ) {
    return null;
  }
  // The ref form reads its refs only on the calling component's commits. A
  // menu or trigger that another component mounts in a commit of its own gets
  // no press.
  if (
    ![...spreads.menuProps, ...spreads.triggerProps].every(spread =>
      rendersWithComponent(j, spread, scope),
    )
  ) {
    return null;
  }
  const menuSource = sourceOf(j, menuRef);
  for (const spread of spreads.menuProps) {
    const ref = attributeExpression(findAttribute(spread.parent.node, 'ref'));
    if (
      ref == null ||
      sourceOf(j, ref) !== menuSource ||
      !isAloneWithPress(spread, ['onPointerDown'])
    ) {
      return null;
    }
  }
  const triggerSource = triggerRef == null ? null : sourceOf(j, triggerRef);
  for (const spread of spreads.triggerProps) {
    const ref = attributeExpression(findAttribute(spread.parent.node, 'ref'));
    if (
      ref == null ||
      sourceOf(j, ref) !== triggerSource ||
      // A component may drop the two handlers, or give its ref to an
      // imperative handle that takes no listeners.
      !isDomElement(spread.parent.parent.node) ||
      !isAloneWithPress(spread, ['onPointerDown', 'onContextMenu'])
    ) {
      return null;
    }
  }
  const pressSpreads = [...spreads.menuProps, ...spreads.triggerProps];
  if (pressSpreads.some(spread => mayHandleInnerPressDown(j, spread))) {
    return null;
  }
  for (const spread of pressSpreads) {
    plan.removals.push(() => j(spread).remove());
  }
  return plan;
}

/**
 * Whether something inside the spread's element may handle a press-down: an
 * `onPointerDown`, a spread, a component, or a child the codemod cannot read.
 * Such a handler ran before the old spread's, so its stop kept the press from
 * starting. The ref form's own listener runs before every React
 * `onPointerDown` handler.
 * @param {any} j @param {any} spread
 */
function mayHandleInnerPressDown(j, spread) {
  const element = spread.parent.parent;
  const inside = (/** @type {any} */ path) =>
    path.parent.node !== element.node.openingElement;
  const scope = j(element);
  return (
    scope.find(j.JSXAttribute, {name: {name: 'onPointerDown'}}).some(inside) ||
    scope.find(j.JSXSpreadAttribute).some(inside) ||
    scope
      .find(j.JSXElement)
      .some(
        (/** @type {any} */ path) =>
          path.node !== element.node && !isDomElement(path.node),
      ) ||
    scope
      .find(j.JSXExpressionContainer)
      .some(
        (/** @type {any} */ path) =>
          path.parent.node.type !== 'JSXAttribute' &&
          !isReadableChild(path.node.expression),
      )
  );
}

/**
 * Whether an expression child is one the codemod can read: JSX, a comment, or
 * a literal. Anything else may render rows with their own handlers.
 * @param {any} expression
 */
function isReadableChild(expression) {
  return [
    'JSXElement',
    'JSXFragment',
    'JSXEmptyExpression',
    'StringLiteral',
    'NumericLiteral',
    'Literal',
  ].includes(expression.type);
}

/**
 * Whether a press spread is the only thing on its element that meets the
 * press: no `handlers` attribute and no other spread. The old spread and such a
 * handler override each other by order, and the ref form runs both.
 * @param {any} spread @param {string[]} handlers
 */
function isAloneWithPress(spread, handlers) {
  return (spread.parent.node.attributes ?? []).every(
    (/** @type {any} */ attribute) =>
      attribute === spread.node ||
      (attribute.type === 'JSXAttribute' &&
        !handlers.includes(attribute.name?.name)),
  );
}

/**
 * Whether a JSX element is a DOM element. A component element carrying the
 * spread may mount its own DOM later, or only while open.
 * @param {any} node
 */
function isDomElement(node) {
  const name = node.openingElement.name;
  return name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name);
}

/**
 * Whether a JSX node renders its children in the same commit: a DOM element or
 * a fragment. A component element may mount them later.
 * @param {any} node
 */
function passesChildren(node) {
  if (node?.type === 'JSXFragment') {
    return true;
  }
  const name = node?.type === 'JSXElement' ? node.openingElement.name : null;
  return (
    (name?.type === 'JSXIdentifier' &&
      (/^[a-z]/.test(name.name) || name.name === 'Fragment')) ||
    (name?.type === 'JSXMemberExpression' &&
      name.object.name === 'React' &&
      name.property.name === 'Fragment')
  );
}

/**
 * Whether a JSX attribute's element mounts in its component's own commits. It
 * must sit in one of the component's returns, reached only through conditions
 * and the children of DOM elements and fragments. A function, a prop value or
 * a component element stops it.
 * @param {any} j @param {any} path @param {any} fnPath
 */
function rendersWithComponent(j, path, fnPath) {
  let current = path.parent?.parent;
  if (current?.node.type !== 'JSXElement' || !isDomElement(current.node)) {
    return false;
  }
  for (;;) {
    const parent = current.parent;
    const node = parent?.node;
    const isChild =
      (passesChildren(node) && (node.children ?? []).includes(current.node)) ||
      (node?.type === 'JSXExpressionContainer' &&
        passesChildren(parent.parent?.node) &&
        (parent.parent.node.children ?? []).includes(node));
    const isBranch =
      (node?.type === 'LogicalExpression' && node.right === current.node) ||
      (node?.type === 'ConditionalExpression' && node.test !== current.node);
    if (isChild || isBranch) {
      current = parent;
      continue;
    }
    if (node?.type !== 'ReturnStatement') {
      return false;
    }
    const owner = j(parent).closest(j.Function);
    return owner.size() > 0 && owner.paths()[0].node === fnPath.node;
  }
}

/**
 * Whether a JSX attribute's element always renders with its component. It
 * sits in the component's one top-level return, reached only through the
 * children of DOM elements and fragments. A function, a prop value, a
 * component element (which may hold its children back), a condition or
 * another return stops it.
 * @param {any} j @param {any} path @param {any} fnPath
 */
function isAlwaysRendered(j, path, fnPath) {
  let current = path.parent?.parent;
  if (current?.node.type !== 'JSXElement' || !isDomElement(current.node)) {
    return false;
  }
  for (;;) {
    const parent = current.parent;
    const node = parent?.node;
    if (passesChildren(node) && (node.children ?? []).includes(current.node)) {
      current = parent;
      continue;
    }
    if (
      node?.type === 'JSXExpressionContainer' &&
      passesChildren(parent.parent?.node) &&
      (parent.parent.node.children ?? []).includes(node)
    ) {
      current = parent;
      continue;
    }
    if (node?.type !== 'ReturnStatement') {
      return false;
    }
    const fn = fnPath.node;
    if (fn.type === 'Program' || parent.parent?.node !== fn.body) {
      return false;
    }
    const returns = j(fnPath)
      .find(j.ReturnStatement)
      .filter((/** @type {any} */ each) => {
        const owner = j(each).closest(j.Function);
        return owner.size() > 0 && owner.paths()[0].node === fn;
      });
    return returns.size() === 1;
  }
}

/**
 * Whether a spread of the props on a forward's element still passes the
 * handler without the forward. A later spread passes it. An earlier one
 * passes it only when no other spread or attribute of that name stands
 * between them.
 * @param {any} attribute @param {string} propsName
 */
function isPassedAgain(attribute, propsName) {
  const attributes = attribute.parent.node.attributes;
  const at = attributes.indexOf(attribute.node);
  const spreadsProps = (/** @type {any} */ each) => {
    const argument =
      each.type === 'JSXSpreadAttribute' ? unwrap(each.argument) : null;
    return argument?.type === 'Identifier' && argument.name === propsName;
  };
  if (attributes.slice(at + 1).some(spreadsProps)) {
    return true;
  }
  for (const each of attributes.slice(0, at).reverse()) {
    if (spreadsProps(each)) {
      return true;
    }
    if (
      each.type === 'JSXSpreadAttribute' ||
      each.name?.name === attribute.node.name.name
    ) {
      return false;
    }
  }
  return false;
}

/**
 * The JSX attribute a reference is the whole value of, when its name is
 * `name`, or null.
 * @param {any} path @param {string} name
 */
function forwardingAttribute(path, name) {
  const container = path.parent;
  const attribute = container?.parent;
  if (
    container?.node.type !== 'JSXExpressionContainer' ||
    attribute?.node.type !== 'JSXAttribute' ||
    attribute.node.name.name !== name
  ) {
    return null;
  }
  return attribute;
}

/**
 * Drops redundant forwards of the trigger handlers beside a spread of the
 * trigger props in one trigger render function. Returns 'changed',
 * 'unproven' or 'none'.
 * @param {any} j @param {any} fnPath
 */
function migrateTriggerFunction(j, fnPath) {
  const param = fnPath.node.params[0];
  const body = j(fnPath.get('body'));
  /** @type {any[]} */
  const forwards = [];
  if (param?.type === 'Identifier') {
    let isProven = true;
    body
      .find(j.MemberExpression, {
        object: {type: 'Identifier', name: param.name},
      })
      .forEach((/** @type {any} */ path) => {
        const member = path.node;
        if (
          !isProven ||
          member.computed ||
          !TRIGGER_HANDLERS.has(member.property.name)
        ) {
          return;
        }
        const attribute = forwardingAttribute(path, member.property.name);
        // Only a forward that a spread of the props passes again is
        // redundant: the spread still passes the handler, under any ancestor.
        if (attribute == null || !isPassedAgain(attribute, param.name)) {
          isProven = false;
          return;
        }
        forwards.push(attribute);
      });
    if (!isProven) {
      return 'unproven';
    }
    forwards.forEach(attribute => j(attribute).remove());
    return forwards.length > 0 ? 'changed' : 'none';
  }
  if (param?.type !== 'ObjectPattern') {
    return 'none';
  }
  // A destructured handler is not in the rest the element spreads. Its
  // forward is then the control's only path to the press under an ancestor
  // that stops the press-down.
  const hasHandler = param.properties.some(
    (/** @type {any} */ property) =>
      property.type !== 'RestElement' &&
      isPlainProperty(property) &&
      TRIGGER_HANDLERS.has(keyName(property) ?? ''),
  );
  return hasHandler ? 'unproven' : 'none';
}

/** @param {any} file @param {any} api */
export default function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  /** @type {Set<string>} */
  const hookNames = new Set();
  /** @type {Set<string>} */
  const dropdownNames = new Set();
  /** @type {Set<string>} */
  const triggerTypeNames = new Set();
  /** @type {Set<string>} */
  const namespaces = new Set();
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
    const source = path.node.source.value;
    if (typeof source !== 'string' || !CORE_IMPORT_RE.test(source)) {
      return;
    }
    for (const specifier of path.node.specifiers ?? []) {
      if (specifier.type === 'ImportNamespaceSpecifier') {
        namespaces.add(specifier.local.name);
      } else if (specifier.type === 'ImportSpecifier') {
        const imported = importedName(specifier);
        const isTypeOnly =
          path.node.importKind === 'type' || specifier.importKind === 'type';
        if (imported === TRIGGER_PROPS_TYPE) {
          triggerTypeNames.add(specifier.local.name);
        } else if (!isTypeOnly && imported === HOOK) {
          hookNames.add(specifier.local.name);
        } else if (!isTypeOnly && imported === DROPDOWN) {
          dropdownNames.add(specifier.local.name);
        }
      }
    }
  });
  /** @param {any} node @param {Set<string>} names @param {string} exported */
  const resolves = (node, names, exported) =>
    (node.type === 'Identifier' && names.has(node.name)) ||
    (node.type === 'JSXIdentifier' && names.has(node.name)) ||
    ((node.type === 'MemberExpression' ||
      node.type === 'JSXMemberExpression') &&
      !node.computed &&
      (node.object.type === 'Identifier' ||
        node.object.type === 'JSXIdentifier') &&
      namespaces.has(node.object.name) &&
      node.property.name === exported);

  let changed = false;
  /** @param {any} path @param {string} text */
  const report = (path, text) => {
    const statement = j(path).closest(j.Statement);
    const target = statement.size() > 0 ? statement.paths()[0].node : null;
    if (target != null && addComment(j, target, text)) {
      changed = true;
    }
  };

  root
    .find(j.CallExpression)
    .filter(
      (/** @type {any} */ path) =>
        path.node.arguments.length === 1 &&
        resolves(path.node.callee, hookNames, HOOK),
    )
    .forEach((/** @type {any} */ path) => {
      const options = unwrap(path.node.arguments[0]);
      if (options?.type !== 'ObjectExpression') {
        report(path, CALL_COMMENT);
        return;
      }
      let menuRef = null;
      let triggerRef = null;
      /** @type {any[]} */
      const rest = [];
      for (const property of options.properties) {
        const key = isPlainProperty(property) ? keyName(property) : null;
        if (key == null) {
          report(path, CALL_COMMENT);
          return;
        }
        if (key === 'menuRef') {
          menuRef = property.value;
          continue;
        }
        if (key === 'triggerRef') {
          triggerRef = property.value;
        }
        rest.push(property);
      }
      const plan =
        menuRef == null
          ? null
          : planReturnUses(j, root, path, menuRef, triggerRef);
      if (plan == null) {
        report(path, CALL_COMMENT);
        return;
      }
      path.node.arguments = [menuRef, j.objectExpression(rest)];
      plan.removals.forEach(remove => remove());
      changed = true;
    });

  /** @type {Set<any>} */
  const triggerFunctions = new Set();
  root.find(j.JSXAttribute).forEach((/** @type {any} */ path) => {
    if (
      path.node.name.name !== 'renderTrigger' ||
      !resolves(path.parent.node.name, dropdownNames, DROPDOWN)
    ) {
      return;
    }
    const value = unwrap(attributeExpression(path.node));
    if (
      value?.type === 'ArrowFunctionExpression' ||
      value?.type === 'FunctionExpression'
    ) {
      triggerFunctions.add(value);
    }
  });
  root.find(j.Function).forEach((/** @type {any} */ path) => {
    const annotation = path.node.params[0]?.typeAnnotation?.typeAnnotation;
    if (
      annotation?.type === 'TSTypeReference' &&
      annotation.typeName.type === 'Identifier' &&
      triggerTypeNames.has(annotation.typeName.name)
    ) {
      triggerFunctions.add(path.node);
    }
  });
  root
    .find(j.Function)
    .filter((/** @type {any} */ path) => triggerFunctions.has(path.node))
    .forEach((/** @type {any} */ path) => {
      if (migrateTriggerFunction(j, path) === 'changed') {
        changed = true;
      }
    });

  return changed ? root.toSource() : null;
}
