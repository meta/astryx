// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate Item and ListItem swipe actions to createSwipe
 *
 * `swipeActions={X}` on `Item` and `ListItem` becomes `swipe={NAME}`, with
 * `const NAME = createSwipe(X)` defined once. `X` is an object literal whose
 * `leading` and `trailing` are array literals of object literals, or a
 * conditional whose branches are such objects or nullish. The definition goes
 * to module scope when the options read only module bindings. It goes into
 * `useMemo` in the enclosing component or hook when they read its props or
 * state. A `useState` or `useReducer` setter and a ref are stable, so they stay
 * out of the dependencies. On a `ListItem`, a handler that reads the row's own
 * `itemKey` value takes `itemKey` from `onActivate` instead. Where it cannot
 * move the options, `createSwipe` stays on the row with a TODO. Each entry
 * with no `id` takes one from its static label, then its handler's name, then
 * its side and place with a TODO. Rows with the same options in one place
 * share one definition. A `swipeBehavior={B}` joins the options; a static
 * `'reveal'`, the default, is dropped. On a row that already sets `swipe`, the
 * deprecated props do nothing, so they are removed, and so is a lone
 * `swipeBehavior`. The `ItemSwipe*` types stay as they are.
 *
 * It does not follow helpers, wrappers, or types. Where it cannot see every
 * entry, it keeps the old props and leaves a TODO instead of guessing. That
 * covers a name, a property, a computed value, an object with a spread, an
 * entry that is not an object literal, and a row that spreads props it cannot
 * prove free of the deprecated props. Comments are the codemod's only report
 * channel. Each is added once, so a second run changes nothing.
 */

import {
  importedComponents,
  resolveImportedComponent,
} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate Item and ListItem swipe actions to createSwipe',
  description:
    'Replaces `swipeActions={X}` and `swipeBehavior` on Item and ListItem with ' +
    '`swipe={NAME}`, defining `NAME = createSwipe({...X, swipeBehavior})` ' +
    'once at module scope or in useMemo, with ids named after each label or ' +
    'handler. Keeps the old props with a TODO where it cannot see every entry ' +
    'and where the row spreads props that may carry them.',
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

const NAME_COMMENT =
  ' TODO(astryx upgrade): give each action here an id of its own instead ' +
  "of its side and place, such as 'trailing-0': a row keys its swipe on the " +
  'ids (AST-057 DEC-10). ';
const PLACE_COMMENT =
  ' TODO(astryx upgrade): define this swipe once, at module scope or in ' +
  'useMemo, and read the row from the itemKey that onActivate receives ' +
  '(AST-057 DEC-10). Its actions read values this codemod cannot move. ';
const SWIPE_PROPS = new Set(['swipe', 'swipeActions', 'swipeBehavior']);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const SKIPPED_KEYS = new Set([
  'loc',
  'start',
  'end',
  'range',
  'extra',
  'tokens',
  'comments',
  'leadingComments',
  'trailingComments',
  'original',
]);

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

/** Whether a node is `undefined` or `null`. @param {any} node */
function isNullish(node) {
  const value = unwrap(node);
  return (
    (value?.type === 'Identifier' && value.name === 'undefined') ||
    value?.type === 'NullLiteral' ||
    (value?.type === 'Literal' && value.value === null)
  );
}

/**
 * The object literals a swipeActions value gives, each with its entries by
 * side: the value itself, or each branch of a conditional that is not
 * nullish. Null when any of them hides an entry.
 * @param {any} value
 * @returns {Array<{object: any, sides: Array<[string, any[]]>, replace: ((expression: any) => void) | null}> | null}
 */
function swipeObjects(value) {
  const node = unwrap(value);
  if (node?.type === 'ObjectExpression') {
    const sides = visibleEntries(node);
    return sides == null ? null : [{object: node, sides, replace: null}];
  }
  if (node?.type !== 'ConditionalExpression') {
    return null;
  }
  const objects = [];
  for (const branch of ['consequent', 'alternate']) {
    const branchNode = unwrap(node[branch]);
    if (isNullish(branchNode)) {
      continue;
    }
    const sides =
      branchNode?.type === 'ObjectExpression'
        ? visibleEntries(branchNode)
        : null;
    if (sides == null) {
      return null;
    }
    objects.push({
      object: branchNode,
      sides,
      replace: (/** @type {any} */ expression) => {
        node[branch] = expression;
      },
    });
  }
  return objects.length === 0 ? null : objects;
}

/** A kebab-case id from text, or null when none fits. @param {string} text */
function slug(text) {
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(id) ? id : null;
}

/**
 * An id from a handler: its name, or the name of the one function it calls,
 * without a `handle` or `on` prefix. Null when it names nothing.
 * @param {any} node
 */
function handlerId(node) {
  let callee = unwrap(node);
  if (
    callee?.type === 'ArrowFunctionExpression' ||
    callee?.type === 'FunctionExpression'
  ) {
    let body = callee.body;
    if (body?.type === 'BlockStatement') {
      if (
        body.body.length !== 1 ||
        body.body[0].type !== 'ExpressionStatement'
      ) {
        return null;
      }
      body = body.body[0].expression;
    }
    body = unwrap(body);
    if (body?.type !== 'CallExpression') {
      return null;
    }
    callee = unwrap(body.callee);
  }
  const name =
    callee?.type === 'Identifier'
      ? callee.name
      : (callee?.type === 'MemberExpression' ||
            callee?.type === 'OptionalMemberExpression') &&
          !callee.computed &&
          callee.property?.type === 'Identifier'
        ? callee.property.name
        : null;
  if (name == null) {
    return null;
  }
  const verb = name.replace(/^(?:handle|on)(?=[A-Z])/, '');
  return slug(verb.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
}

/**
 * Gives each entry with no `id` one: from its static label, then from its
 * handler, then from its side and place. `createSwipe` needs an `id` on every
 * action, and the ids stay unique in the swipe.
 * @param {any} j @param {Array<[string, any[]]>} sides
 * @returns {{ids: Array<string | null>, positional: boolean}}
 */
function entryIds(j, sides) {
  const idOf = (/** @type {any} */ entry) =>
    entry.properties.find((/** @type {any} */ p) => keyOf(p) === 'id');
  const taken = new Set();
  for (const [, entries] of sides) {
    for (const entry of entries) {
      const id = idOf(entry);
      if (id != null && staticString(id.value) != null) {
        taken.add(staticString(id.value));
      }
    }
  }
  /** @type {Array<string | null>} */
  const ids = [];
  let positional = false;
  for (const [side, entries] of sides) {
    entries.forEach((entry, index) => {
      const existing = idOf(entry);
      if (existing != null) {
        ids.push(staticString(existing.value));
        return;
      }
      const valueOf = (/** @type {string} */ name) =>
        entry.properties.find((/** @type {any} */ p) => keyOf(p) === name)
          ?.value;
      const label = staticString(valueOf('label'));
      let id =
        (label == null ? null : slug(label)) ??
        handlerId(valueOf('onActivate'));
      if (id == null) {
        positional = true;
        id = `${side}-${index}`;
      }
      let unique = id;
      for (let n = 2; taken.has(unique); n++) {
        unique = `${id}-${n}`;
      }
      taken.add(unique);
      ids.push(unique);
      entry.properties.unshift(
        j.objectProperty(j.identifier('id'), j.stringLiteral(unique)),
      );
    });
  }
  return {ids, positional};
}

/**
 * The name for a swipe: its ids in camelCase, or `rowSwipe` when they are
 * many, positional, or not static.
 * @param {Array<string | null>} ids @param {boolean} positional
 */
function swipeName(ids, positional) {
  if (positional || ids.length === 0 || ids.length > 3) {
    return 'rowSwipe';
  }
  const words = [];
  for (const id of ids) {
    if (id == null || !/^[a-z][a-z0-9-]*$/.test(id)) {
      return 'rowSwipe';
    }
    words.push(...id.split('-').filter(Boolean));
  }
  return (
    words
      .map((word, index) =>
        index === 0 ? word : word[0].toUpperCase() + word.slice(1),
      )
      .join('') + 'Swipe'
  );
}

/** Whether `node` lies inside `outer` in the source. @param {any} node @param {any} outer */
function within(node, outer) {
  return (
    typeof node?.start === 'number' &&
    typeof outer?.start === 'number' &&
    node.start >= outer.start &&
    node.end <= outer.end
  );
}

/**
 * Whether an identifier reads a variable. A property key, a member name, and
 * a binding do not.
 * @param {any} path
 */
function isReference(path) {
  const node = path.node;
  const parentPath = path.parent;
  const parent = parentPath?.node;
  if (parent == null) {
    return true;
  }
  switch (parent.type) {
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return parent.object === node || parent.computed === true;
    case 'ObjectProperty':
    case 'Property':
      if (parentPath.parent?.node?.type === 'ObjectPattern') {
        return false;
      }
      return parent.computed === true || parent.value === node;
    case 'ObjectMethod':
    case 'ClassMethod':
    case 'ClassPrivateMethod':
    case 'ClassProperty':
    case 'ClassPrivateProperty':
      return (
        (parent.computed === true && parent.key === node) ||
        parent.value === node
      );
    case 'VariableDeclarator':
      return parent.init === node;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return parent.body === node;
    case 'ClassDeclaration':
    case 'ClassExpression':
      return parent.superClass === node;
    case 'AssignmentPattern':
      return parent.right === node;
    case 'ArrayPattern':
    case 'ObjectPattern':
    case 'RestElement':
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ExportSpecifier':
    case 'CatchClause':
      return false;
    default:
      return true;
  }
}

/** Whether a path sits in a type, up to `stop`. @param {any} path @param {any} stop */
function inType(path, stop) {
  for (let p = path.parent; p != null && p.node !== stop; p = p.parent) {
    const type = p.node.type;
    if (
      (type.startsWith('TS') && !TYPE_WRAPPERS.has(type)) ||
      type === 'TypeAnnotation'
    ) {
      return true;
    }
  }
  return false;
}

/** Whether a function between a path and `stop` gives it its own `this`. */
function hasOwnThis(/** @type {any} */ path, /** @type {any} */ stop) {
  for (let p = path.parent; p != null && p.node !== stop; p = p.parent) {
    const type = p.node.type;
    if (
      type === 'FunctionExpression' ||
      type === 'FunctionDeclaration' ||
      type === 'ObjectMethod' ||
      type === 'ClassMethod' ||
      type === 'ClassPrivateMethod'
    ) {
      return true;
    }
  }
  return false;
}

/** The statement of `body` that holds a path, or null. @param {any[]} body @param {any} path */
function statementIn(body, path) {
  for (let p = path; p != null; p = p.parentPath) {
    if (body.includes(p.node)) {
      return p.node;
    }
  }
  return null;
}

/**
 * Whether a statement returns from its function.
 * @param {any} node
 * @returns {boolean}
 */
function returns(node) {
  if (node == null || typeof node !== 'object') {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some(returns);
  }
  if (node.type === 'ReturnStatement') {
    return true;
  }
  if (
    FUNCTION_TYPES.has(node.type) ||
    node.type === 'ObjectMethod' ||
    node.type === 'ClassMethod' ||
    node.type === 'ClassDeclaration' ||
    node.type === 'ClassExpression'
  ) {
    return false;
  }
  return Object.keys(node).some(
    key =>
      !SKIPPED_KEYS.has(key) &&
      node[key] != null &&
      typeof node[key] === 'object' &&
      returns(node[key]),
  );
}

/** A function's name, or the name of the variable it is assigned to. */
function functionName(/** @type {any} */ path) {
  if (path.node.id?.name) {
    return path.node.id.name;
  }
  let parent = path.parent;
  // memo(...) and forwardRef(...) wrap a component.
  while (parent?.node.type === 'CallExpression') {
    parent = parent.parent;
  }
  return parent?.node.type === 'VariableDeclarator' &&
    parent.node.id?.type === 'Identifier'
    ? parent.node.id.name
    : null;
}

/** Whether a call is one of the named React hooks. @param {any} node @param {string[]} names */
function isHookCall(node, names) {
  const call = unwrap(node);
  if (call?.type !== 'CallExpression') {
    return false;
  }
  const callee = unwrap(call.callee);
  const name =
    callee?.type === 'Identifier'
      ? callee.name
      : callee?.type === 'MemberExpression' && !callee.computed
        ? callee.property?.name
        : null;
  return names.includes(name);
}

/**
 * Whether a binding never changes between renders: a `useState` or
 * `useReducer` setter, or a `useRef` result.
 * @param {any} scope @param {string} name
 */
function isStable(scope, name) {
  const bindings = scope.getBindings()[name] ?? [];
  return (
    bindings.length > 0 &&
    bindings.every((/** @type {any} */ binding) => {
      const parent = binding.parent?.node;
      if (parent?.type === 'ArrayPattern') {
        const declarator = binding.parent.parent?.node;
        return (
          parent.elements[1] === binding.node &&
          declarator?.type === 'VariableDeclarator' &&
          isHookCall(declarator.init, ['useState', 'useReducer'])
        );
      }
      return (
        parent?.type === 'VariableDeclarator' &&
        parent.id === binding.node &&
        isHookCall(parent.init, ['useRef'])
      );
    })
  );
}

/**
 * Where a swipe's options can be built once: at module scope when they read
 * only module bindings declared before the row's statement, or in `useMemo` in
 * the component or hook whose bindings they read. Null when neither works: a
 * `this`, a binding of an inner function such as a map callback, or a
 * binding declared after the row's statement or after an early return.
 * @param {any} j @param {any} root @param {any} rowPath @param {any} objectPath @param {Set<any>} created
 * @returns {{kind: 'module'} | {kind: 'memo', owner: any, deps: string[]} | null}
 */
function placementOf(j, root, rowPath, objectPath, created) {
  const object = objectPath.node;
  let movable = true;
  j(objectPath)
    .find(j.ThisExpression)
    .forEach((/** @type {any} */ p) => {
      movable = movable && hasOwnThis(p, object);
    });
  /** @type {Array<{name: string, scope: any}>} */
  const outer = [];
  const read = (/** @type {any} */ p) => {
    if (created.has(p.node) || !isReference(p) || inType(p, object)) {
      return;
    }
    if (p.node.name === 'arguments') {
      movable = false;
      return;
    }
    const scope = p.scope?.lookup(p.node.name);
    if (scope != null && !within(scope.path.node, object)) {
      outer.push({name: p.node.name, scope});
    }
  };
  j(objectPath).find(j.Identifier).forEach(read);
  j(objectPath)
    .find(j.JSXIdentifier)
    .forEach((/** @type {any} */ p) => {
      const parent = p.parent?.node;
      if (
        ((parent?.type === 'JSXOpeningElement' ||
          parent?.type === 'JSXClosingElement') &&
          parent.name === p.node &&
          /^[A-Z_$]/.test(p.node.name)) ||
        (parent?.type === 'JSXMemberExpression' && parent.object === p.node)
      ) {
        read(p);
      }
    });
  if (!movable) {
    return null;
  }
  const local = outer.filter(r => r.scope.path.node.type !== 'Program');
  if (local.length === 0) {
    const body = root.get().node.program.body;
    const row = statementIn(body, rowPath);
    for (const {name, scope} of outer) {
      for (const binding of scope.getBindings()[name] ?? []) {
        const declared = statementIn(body, binding);
        const hoisted =
          declared?.type === 'ImportDeclaration' ||
          declared?.type === 'FunctionDeclaration' ||
          declared?.declaration?.type === 'FunctionDeclaration';
        if (
          declared == null ||
          (!hoisted && body.indexOf(declared) >= body.indexOf(row))
        ) {
          return null;
        }
      }
    }
    return row == null ? null : {kind: 'module'};
  }
  const owner = local[0].scope.path;
  const fn = owner.node;
  const name = FUNCTION_TYPES.has(fn.type) ? functionName(owner) : null;
  if (
    name == null ||
    !/^(?:[A-Z]|use[A-Z0-9])/.test(name) ||
    local.some(r => r.scope.path.node !== fn)
  ) {
    return null;
  }
  const isParam = (/** @type {string} */ name) =>
    (owner.scope.getBindings()[name] ?? []).every((/** @type {any} */ b) =>
      fn.params.some((/** @type {any} */ param) => within(b.node, param)),
    );
  const statements = fn.body.type === 'BlockStatement' ? fn.body.body : null;
  const row = statements == null ? null : statementIn(statements, rowPath);
  if (statements != null) {
    const index = statements.indexOf(row);
    if (row == null || statements.slice(0, index).some(returns)) {
      return null;
    }
    for (const r of local) {
      if (isParam(r.name)) {
        continue;
      }
      for (const binding of owner.scope.getBindings()[r.name] ?? []) {
        const declared = statementIn(statements, binding);
        if (declared == null || statements.indexOf(declared) >= index) {
          return null;
        }
      }
    }
  } else if (!local.every(r => isParam(r.name))) {
    return null;
  }
  /** @type {string[]} */
  const deps = [];
  for (const r of local) {
    if (!deps.includes(r.name) && !isStable(owner.scope, r.name)) {
      deps.push(r.name);
    }
  }
  return {kind: 'memo', owner: fn, deps};
}

/**
 * Inserts a swipe's definition before the statement that holds the row: at
 * module scope, or at the top level of the owner's body.
 * @param {any} j @param {any} root @param {any} placement @param {any} rowPath @param {any} declaration
 */
function insertDefinition(j, root, placement, rowPath, declaration) {
  if (placement.kind === 'module') {
    const body = root.get().node.program.body;
    body.splice(body.indexOf(statementIn(body, rowPath)), 0, declaration);
    return;
  }
  const owner = placement.owner;
  if (owner.body.type !== 'BlockStatement') {
    owner.body = j.blockStatement([declaration, j.returnStatement(owner.body)]);
    return;
  }
  const body = owner.body.body;
  const row = statementIn(body, rowPath);
  // A body this codemod made holds the row in its last statement.
  body.splice(
    row == null ? body.length - 1 : body.indexOf(row),
    0,
    declaration,
  );
}

/**
 * The expression `useMemo` is called by, adding it to a `react` import when
 * the file has none.
 * @param {any} j @param {any} root
 */
function ensureUseMemo(j, root) {
  /** @type {string | null} */
  let local = null;
  /** @type {any} */
  let named = null;
  /** @type {string | null} */
  let namespace = null;
  root
    .find(j.ImportDeclaration)
    .filter(
      (/** @type {any} */ p) =>
        p.node.source.value === 'react' && p.node.importKind !== 'type',
    )
    .forEach((/** @type {any} */ p) => {
      for (const specifier of p.node.specifiers ?? []) {
        if (specifier.type === 'ImportSpecifier') {
          if (specifier.importKind === 'type') {
            continue;
          }
          named ??= p.node;
          if (
            (specifier.imported.name ?? specifier.imported.value) === 'useMemo'
          ) {
            local = specifier.local?.name ?? 'useMemo';
          }
        } else {
          namespace ??= specifier.local.name;
        }
      }
    });
  if (local != null) {
    return j.identifier(local);
  }
  if (named == null && namespace != null) {
    return j.memberExpression(j.identifier(namespace), j.identifier('useMemo'));
  }
  const name = freeName(j, root, 'useMemo');
  const specifier =
    name === 'useMemo'
      ? j.importSpecifier(j.identifier('useMemo'))
      : j.importSpecifier(j.identifier('useMemo'), j.identifier(name));
  if (named != null) {
    named.specifiers.push(specifier);
  } else {
    const declaration = j.importDeclaration(
      [specifier],
      j.stringLiteral('react'),
    );
    const imports = root.find(j.ImportDeclaration);
    if (imports.size() > 0) {
      imports.at(imports.size() - 1).insertAfter(declaration);
    } else {
      root.get().node.program.body.unshift(declaration);
    }
  }
  return j.identifier(name);
}

/**
 * Whether a spread provably carries no swipe prop: it spreads a `const` bound
 * to an object literal with no spread and no swipe key.
 * @param {any} spread @param {any} rowPath
 */
function carriesNoSwipeProps(spread, rowPath) {
  const argument = unwrap(spread.argument);
  if (argument?.type !== 'Identifier') {
    return false;
  }
  const bindings =
    rowPath.scope?.lookup(argument.name)?.getBindings()[argument.name] ?? [];
  const declarator = bindings[0]?.parent?.node;
  const declaration = bindings[0]?.parent?.parent?.node;
  const init = unwrap(declarator?.init);
  return (
    bindings.length === 1 &&
    declarator?.type === 'VariableDeclarator' &&
    declarator.id === bindings[0].node &&
    declaration?.kind === 'const' &&
    init?.type === 'ObjectExpression' &&
    init.properties.every((/** @type {any} */ p) => {
      const key =
        keyOf(p) ??
        (p.type === 'ObjectMethod' && !p.computed ? p.key?.name : null);
      return key != null && !SWIPE_PROPS.has(key);
    })
  );
}

/**
 * The identifier or member chain `a.b.c` a node is, unwrapped, or null.
 * @param {any} node
 * @returns {any}
 */
function chain(node) {
  const value = unwrap(node);
  if (value?.type === 'Identifier') {
    return value;
  }
  return value?.type === 'MemberExpression' &&
    !value.computed &&
    value.property?.type === 'Identifier' &&
    chain(value.object) != null
    ? value
    : null;
}

/**
 * Whether two chains name the same path.
 * @param {any} a @param {any} b
 * @returns {boolean}
 */
function sameChain(a, b) {
  const left = chain(a);
  const right = chain(b);
  if (left?.type === 'Identifier' || right?.type === 'Identifier') {
    return left?.type === right?.type && left?.name === right?.name;
  }
  return (
    left != null &&
    right != null &&
    left.property.name === right.property.name &&
    sameChain(left.object, right.object)
  );
}

/** The identifier a chain starts from. @param {any} node */
function chainRoot(node) {
  let value = chain(node);
  while (value?.type === 'MemberExpression') {
    value = chain(value.object);
  }
  return value;
}

/**
 * Makes each handler that takes nothing and reads the row's own `itemKey`
 * value take `itemKey` from `onActivate` instead. A `ListItem` passes its
 * `itemKey` to `onActivate`, so the swipe no longer closes over the row.
 * @param {any} j @param {any} rowPath @param {any} objectPath
 * @param {Array<[string, any[]]>} sides @param {any} keyAttribute @param {Set<any>} created
 */
function readItemKey(j, rowPath, objectPath, sides, keyAttribute, created) {
  const key = chain(attributeValue(keyAttribute));
  const keyRoot = chainRoot(key);
  const keyScope = keyRoot == null ? null : rowPath.scope?.lookup(keyRoot.name);
  if (keyScope == null || keyScope.path.node.type === 'Program') {
    return;
  }
  for (const [, entries] of sides) {
    for (const entry of entries) {
      const handler = unwrap(
        entry.properties.find(
          (/** @type {any} */ p) => keyOf(p) === 'onActivate',
        )?.value,
      );
      if (
        (handler?.type !== 'ArrowFunctionExpression' &&
          handler?.type !== 'FunctionExpression') ||
        handler.params.length > 0
      ) {
        continue;
      }
      const handlerPath = j(objectPath)
        .find(j.Node)
        .filter((/** @type {any} */ p) => p.node === handler)
        .paths()[0];
      if (
        handlerPath == null ||
        j(handlerPath).find(j.Identifier, {name: 'itemKey'}).size() > 0
      ) {
        continue;
      }
      const reads = j(handlerPath)
        .find(key.type === 'Identifier' ? j.Identifier : j.MemberExpression)
        .filter(
          (/** @type {any} */ p) =>
            sameChain(p.node, key) &&
            (key.type !== 'Identifier' || isReference(p)) &&
            p.scope?.lookup(keyRoot.name)?.path.node === keyScope.path.node,
        )
        .paths();
      if (reads.length === 0) {
        continue;
      }
      for (const p of reads) {
        const replacement = j.identifier('itemKey');
        created.add(replacement);
        p.replace(replacement);
      }
      // A parsed pattern keeps its one-line source when printed.
      const pattern = j('({itemKey}) => {}')
        .find(j.ArrowFunctionExpression)
        .get().node.params[0];
      created.add(pattern.properties[0].key).add(pattern.properties[0].value);
      handler.params = [pattern];
    }
  }
}

/** A key for a node's shape that ignores source positions. @param {any} node */
function shapeOf(node) {
  return JSON.stringify(node, (key, value) =>
    SKIPPED_KEYS.has(key) ? undefined : value,
  );
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
  /** Nodes this codemod made, which read nothing from the file. */
  const created = new Set();
  /** @type {Map<string, string>} */
  const definitions = new Map();
  /** @type {Map<any, string>} */
  const owners = new Map();
  const ownerKey = (/** @type {any} */ placement) => {
    if (placement.kind === 'module') {
      return 'module';
    }
    if (!owners.has(placement.owner)) {
      owners.set(placement.owner, `owner-${owners.size}`);
    }
    return owners.get(placement.owner);
  };

  const imports = importedComponents(root, j, {
    matchesImport: source => CORE_IMPORT_RE.test(source),
    components: COMPONENTS,
  });
  if (imports.direct.size > 0 || imports.namespaces.size > 0) {
    root.find(j.JSXOpeningElement).forEach((/** @type {any} */ rowPath) => {
      const resolved = resolveImportedComponent(
        rowPath.node.name,
        rowPath,
        imports,
      );
      if (!resolved) {
        return;
      }
      const opening = rowPath.node;
      const attributes = opening.attributes ?? [];
      const named = (/** @type {string} */ name) =>
        attributes.find(
          (/** @type {any} */ a) =>
            a.type === 'JSXAttribute' && a.name?.name === name,
        );
      const actions = named('swipeActions');
      const behavior = named('swipeBehavior');
      const swipe = named('swipe');
      const spreads = attributes.filter(
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
      if (
        spreads.some((/** @type {any} */ s) => !carriesNoSwipeProps(s, rowPath))
      ) {
        hasChanges =
          addComment(j, actions ?? behavior ?? spreads[0], SPREAD_COMMENT) ||
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
      const objects = swipeObjects(value);
      if (objects == null) {
        hasChanges = addComment(j, actions, VALUE_COMMENT) || hasChanges;
        return;
      }
      const behaviorValue = behavior == null ? null : attributeValue(behavior);
      const behaviorText =
        behaviorValue == null ? null : staticString(behaviorValue);
      const keyAttribute =
        resolved.component === 'ListItem' ? named('itemKey') : null;
      rewrites.push(() => {
        const create = ensureCreateImport(j, root);
        let expression = unwrap(value);
        for (const {object, sides, replace} of objects) {
          const objectPath = j(rowPath)
            .find(j.ObjectExpression)
            .filter((/** @type {any} */ p) => p.node === object)
            .paths()[0];
          if (keyAttribute != null) {
            readItemKey(j, rowPath, objectPath, sides, keyAttribute, created);
          }
          const {ids, positional} = entryIds(j, sides);
          if (behaviorValue != null && behaviorText !== 'reveal') {
            optionsOf(
              j,
              object,
              behaviorText == null
                ? behaviorValue
                : j.stringLiteral(behaviorText),
            );
          }
          const placement = placementOf(j, root, rowPath, objectPath, created);
          let replacement;
          if (placement == null) {
            replacement = j.callExpression(j.identifier(create), [object]);
            addComment(j, actions, PLACE_COMMENT);
            if (positional) {
              addComment(j, actions, NAME_COMMENT);
            }
          } else {
            const key = `${ownerKey(placement)}\u0000${shapeOf(object)}`;
            let name = definitions.get(key);
            if (name == null) {
              name = freeName(j, root, swipeName(ids, positional));
              const call = j.callExpression(j.identifier(create), [object]);
              const declaration = j.variableDeclaration('const', [
                j.variableDeclarator(
                  j.identifier(name),
                  placement.kind === 'module'
                    ? call
                    : j.callExpression(ensureUseMemo(j, root), [
                        j.arrowFunctionExpression([], call),
                        j.arrayExpression(
                          placement.deps.map(dep => j.identifier(dep)),
                        ),
                      ]),
                ),
              ]);
              if (positional) {
                addComment(j, declaration, NAME_COMMENT);
              }
              insertDefinition(j, root, placement, rowPath, declaration);
              definitions.set(key, name);
            }
            replacement = j.identifier(name);
          }
          if (replace == null) {
            expression = replacement;
          } else {
            replace(replacement);
          }
        }
        actions.name = j.jsxIdentifier('swipe');
        actions.value = j.jsxExpressionContainer(expression);
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
