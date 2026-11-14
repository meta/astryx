// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate Item and ListItem swipe actions to createSwipe
 *
 * `swipeActions={X}` on `Item` and `ListItem` becomes `swipe={NAME}`, with
 * `const NAME = createSwipe(X)` defined once. `X` is an object literal whose
 * `leading` and `trailing` are array literals of object literals, or a
 * conditional whose branches are such objects or nullish. The definition goes
 * to module scope when every value outside a handler is fixed at import: a
 * literal, a JSX element, an import or a module `const`. It goes into
 * `useMemo` in the enclosing component or hook when they read its props or
 * state. A `useState` or `useReducer` setter and a ref are stable, so they stay
 * out of the dependencies. On a `ListItem`, a handler that compares the row's
 * own `itemKey` value with `===` or `!==` takes `itemKey` from `onActivate`
 * instead. Where it cannot move the options, `createSwipe` stays on the row
 * with a TODO. Each entry
 * with no `id` takes one from its static label, then its handler's name, then
 * its side and place with a TODO. Rows with the same options in one place
 * share one definition when every local they read keeps one value. A
 * `swipeBehavior={B}` joins the options; a static
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
const ITEM_PLACE_COMMENT =
  ' TODO(astryx upgrade): define this swipe once, at module scope or in ' +
  'useMemo (AST-057 DEC-10). Its actions read values this codemod cannot ' +
  'move, and an Item passes no itemKey to onActivate. So define it where ' +
  'those values live: move the row into a component of its own, or use a ' +
  'ListItem with an itemKey. ';
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
 * The statement of `body` that holds a row. A body this codemod wrapped in a
 * block holds the row in a new `return`, which the row's path predates, so
 * the row is then found by its node.
 * @param {any} j @param {any[]} body @param {any} path
 */
function statementHolding(j, body, path) {
  return (
    statementIn(body, path) ??
    body.find(
      (/** @type {any} */ statement) =>
        j(statement)
          .find(j.Node)
          .filter((/** @type {any} */ p) => p.node === path.node)
          .size() > 0,
    ) ??
    null
  );
}

/** Nodes that run code where they are evaluated. */
const RUNS_CODE = new Set([
  'CallExpression',
  'OptionalCallExpression',
  'NewExpression',
  'TaggedTemplateExpression',
  'AwaitExpression',
  'YieldExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'ImportExpression',
  'MemberExpression',
  'OptionalMemberExpression',
]);

/** Globals whose value never changes. */
const FIXED_GLOBALS = new Set(['undefined', 'NaN', 'Infinity']);

/**
 * Whether `path` lies inside an entry's `onActivate` function in `object`.
 * It is the only code in a swipe's options that runs when an action fires.
 * Any other function there, such as a `map` callback that builds a label,
 * runs at render.
 * @param {any} path @param {any} object
 */
function inActivate(path, object) {
  for (let q = path.parent; q != null && q.node !== object; q = q.parent) {
    const node = q.node;
    if (node.type === 'ObjectMethod') {
      if (keyOf(node) === 'onActivate') {
        return true;
      }
      continue;
    }
    const property = q.parent?.node;
    if (
      FUNCTION_TYPES.has(node.type) &&
      (property?.type === 'ObjectProperty' || property?.type === 'Property') &&
      property.value === node &&
      keyOf(property) === 'onActivate'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a swipe's options hold only values that stay the same where its
 * definition goes. At module scope (`owner` null), each value outside a
 * handler is a literal, a JSX element, or a name bound by an import, a module
 * `const`, or a function or class declaration. In `useMemo` in `owner`, the
 * owner's locals count too, since each becomes a dependency, and so does a
 * call or a property read on one, such as `t('archive')` with a `t` from
 * `useTranslation()`. A ref or a setter stays out of the dependencies, so a
 * read or call on one does not count. Any other call, construction, property
 * read or global
 * such as `window` runs or reads at render, so a definition would freeze it:
 * at module scope once, at import; in `useMemo` until a dependency changes.
 * Only an entry's `onActivate` is a handler: its body runs when the action
 * fires, so it may read anything.
 * @param {any} j @param {any} objectPath @param {Set<any>} created @param {any} owner
 */
function fixedWhereDefined(j, objectPath, created, owner = null) {
  const object = objectPath.node;
  const inHandler = (/** @type {any} */ p) => inActivate(p, object);
  let fixed = true;
  /** Whether a member read reads a namespace import, which never changes. */
  const readsNamespace = (/** @type {any} */ p) => {
    let node = p.node;
    while (
      (node.type === 'MemberExpression' ||
        node.type === 'OptionalMemberExpression') &&
      !node.computed
    ) {
      node = unwrap(node.object);
    }
    if (node?.type !== 'Identifier') {
      return false;
    }
    const bindings = p.scope?.lookup(node.name)?.getBindings()[node.name] ?? [];
    return (
      bindings.length > 0 &&
      bindings.every(
        (/** @type {any} */ b) =>
          b.parent?.node?.type === 'ImportNamespaceSpecifier',
      )
    );
  };
  /** Whether a name is one of the owner's locals: a dependency of its memo. */
  const ownerLocal = (/** @type {any} */ p, /** @type {string} */ name) =>
    owner != null && p.scope?.lookup(name)?.path.node === owner;
  /**
   * Whether an owner's local can change between renders, so its memo
   * depends on it. A ref or a setter is stable and stays out of the
   * dependencies: a ref's `current` read at render would freeze.
   */
  const changingLocal = (/** @type {any} */ p, /** @type {string} */ name) =>
    ownerLocal(p, name) && !isStable(p.scope.lookup(name), name);
  /** Whether a name is bound inside the options, as a callback's parameter. */
  const ownBinding = (/** @type {any} */ p, /** @type {string} */ name) => {
    const scope = p.scope?.lookup(name);
    return scope != null && within(scope.path.node, object);
  };
  /** The identifier a chain of member reads and calls starts from, or null. */
  const chainStart = (/** @type {any} */ node) => {
    let current = unwrap(node);
    while (
      current?.type === 'MemberExpression' ||
      current?.type === 'OptionalMemberExpression' ||
      current?.type === 'CallExpression' ||
      current?.type === 'OptionalCallExpression'
    ) {
      current = unwrap(
        current.type === 'CallExpression' ||
          current.type === 'OptionalCallExpression'
          ? current.callee
          : current.object,
      );
    }
    return current?.type === 'Identifier' ? current : null;
  };
  j(objectPath)
    .find(j.Node)
    .forEach((/** @type {any} */ p) => {
      if (!fixed || created.has(p.node) || inHandler(p) || inType(p, object)) {
        return;
      }
      if (RUNS_CODE.has(p.node.type)) {
        const isRead =
          p.node.type === 'MemberExpression' ||
          p.node.type === 'OptionalMemberExpression';
        const isCall =
          p.node.type === 'CallExpression' ||
          p.node.type === 'OptionalCallExpression';
        const start = isRead || isCall ? chainStart(p.node) : null;
        fixed =
          (isRead && readsNamespace(p)) ||
          (start != null &&
            (ownBinding(p, start.name) || changingLocal(p, start.name)));
        return;
      }
      if (p.node.type !== 'Identifier' || !isReference(p)) {
        return;
      }
      if (ownerLocal(p, p.node.name) || ownBinding(p, p.node.name)) {
        return;
      }
      const scope = p.scope?.lookup(p.node.name);
      if (scope == null) {
        fixed = FIXED_GLOBALS.has(p.node.name);
        return;
      }
      fixed = (scope.getBindings()[p.node.name] ?? []).every(
        (/** @type {any} */ binding) => {
          const declarator = binding.parent?.node;
          const statement = binding.parent?.parent?.node;
          return (
            declarator?.type === 'ImportSpecifier' ||
            declarator?.type === 'ImportDefaultSpecifier' ||
            declarator?.type === 'ImportNamespaceSpecifier' ||
            declarator?.type === 'FunctionDeclaration' ||
            declarator?.type === 'ClassDeclaration' ||
            (declarator?.type === 'VariableDeclarator' &&
              declarator.id === binding.node &&
              statement?.type === 'VariableDeclaration' &&
              statement.kind === 'const')
          );
        },
      );
    });
  return fixed;
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

/**
 * Whether a call wraps `fn` as a component: `memo(fn)` or `forwardRef(fn)`,
 * named or on a namespace, with `fn` as its first argument. A callback of any
 * other call, such as `rows.map(…)` or `useCallback(…)`, is not a component.
 * @param {any} call @param {any} fn
 */
function wrapsComponent(call, fn) {
  const callee = unwrap(call.callee);
  const name =
    callee?.type === 'Identifier'
      ? callee.name
      : callee?.type === 'MemberExpression' && !callee.computed
        ? callee.property?.name
        : null;
  return (
    (name === 'memo' || name === 'forwardRef') &&
    unwrap(call.arguments?.[0]) === fn
  );
}

/** A function's name, or the name of the variable it is assigned to. */
function functionName(/** @type {any} */ path) {
  if (path.node.id?.name) {
    return path.node.id.name;
  }
  let node = path.node;
  let parent = path.parent;
  while (
    parent?.node.type === 'CallExpression' &&
    wrapsComponent(parent.node, node)
  ) {
    node = parent.node;
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
 * the component or hook whose bindings they read. Either way, they hold only
 * values that stay the same there (`fixedWhereDefined`). Null when neither
 * works: a `this`, a binding of an inner function such as a map callback, a
 * binding declared after the row's statement or after an early return, or a
 * value read at render.
 * @param {any} j @param {any} root @param {any} rowPath @param {any} objectPath @param {Set<any>} created
 * @returns {{kind: 'module', shareable: boolean, after: any} | {kind: 'memo', owner: any, deps: string[], shareable: boolean, after: any} | null}
 */
function placementOf(j, root, rowPath, objectPath, created) {
  const object = objectPath.node;
  let movable = true;
  j(objectPath)
    .find(j.ThisExpression)
    .forEach((/** @type {any} */ p) => {
      movable = movable && hasOwnThis(p, object);
    });
  /** @type {Array<{name: string, scope: any, inHandler: boolean}>} */
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
      outer.push({
        name: p.node.name,
        scope,
        inHandler: inActivate(p, object),
      });
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
    // A handler reads a module binding only when its action fires, so only
    // reads outside one decide how early the definition can run.
    let lastDependency = -1;
    for (const {name, scope, inHandler} of outer) {
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
        if (!hoisted && !inHandler) {
          lastDependency = Math.max(lastDependency, body.indexOf(declared));
        }
      }
    }
    if (row == null || !fixedWhereDefined(j, objectPath, created)) {
      return null;
    }
    const after = afterFor(row, body, lastDependency);
    if (
      after !== undefined &&
      reachedAbove(j, body, indexFor(body, after, body.indexOf(row), true), row)
    ) {
      return null;
    }
    return {kind: 'module', shareable: true, after};
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
  const row =
    statements == null ? null : statementHolding(j, statements, rowPath);
  let lastDependency = -1;
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
        lastDependency = Math.max(lastDependency, statements.indexOf(declared));
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
  if (!fixedWhereDefined(j, objectPath, created, fn)) {
    return null;
  }
  // Rows with the same options share one definition only when every local
  // those options read keeps one value: a `let` reassigned between two rows
  // would show the first row's value on the second.
  const shareable = local.every(
    r => isParam(r.name) || keepsOneValue(owner.scope, r.name),
  );
  // `useMemo` reads its dependencies when it runs, handler reads included.
  const after =
    statements == null ? undefined : afterFor(row, statements, lastDependency);
  if (
    after !== undefined &&
    reachedAbove(
      j,
      statements,
      indexFor(statements, after, statements.indexOf(row), false),
      row,
    )
  ) {
    return null;
  }
  return {kind: 'memo', owner: fn, deps, shareable, after};
}

/**
 * Whether code in `body` above `index` can call the hoisted function that
 * `row` declares before a definition placed at `index` runs. A statement
 * there names it, or names a function declaration whose body names it, and
 * so on.
 * @param {any} j @param {any[]} body @param {number} index @param {any} row
 */
function reachedAbove(j, body, index, row) {
  const declared = (/** @type {any} */ statement) =>
    statement.type === 'FunctionDeclaration'
      ? statement
      : statement.declaration?.type === 'FunctionDeclaration'
        ? statement.declaration
        : null;
  const name = declared(row)?.id?.name;
  if (name == null) {
    return false;
  }
  const callers = new Set([name]);
  const names = (/** @type {any} */ node) =>
    j(node)
      .find(j.Node)
      .filter(
        (/** @type {any} */ p) =>
          (p.node.type === 'JSXIdentifier' ||
            (p.node.type === 'Identifier' && isReference(p))) &&
          callers.has(p.node.name),
      )
      .size() > 0;
  for (let grew = true; grew;) {
    grew = false;
    for (const statement of body) {
      const fn = declared(statement);
      if (fn?.id != null && !callers.has(fn.id.name) && names(fn.body)) {
        callers.add(fn.id.name);
        grew = true;
      }
    }
  }
  return body.slice(0, index).some(names);
}

/**
 * Whether every binding of a name keeps one value: a `const`, directly or
 * through a destructuring pattern such as `const [rows, setRows] =
 * useState()`, or a function or class declaration.
 * @param {any} scope @param {string} name
 */
function keepsOneValue(scope, name) {
  return (scope.getBindings()[name] ?? []).every((/** @type {any} */ b) => {
    const declarator = b.parent?.node?.type;
    if (
      declarator === 'FunctionDeclaration' ||
      declarator === 'ClassDeclaration'
    ) {
      return true;
    }
    for (let p = b.parent; p != null; p = p.parent) {
      const type = p.node?.type;
      if (type === 'VariableDeclaration') {
        return p.node.kind === 'const';
      }
      if (
        type !== 'VariableDeclarator' &&
        type !== 'ArrayPattern' &&
        type !== 'ObjectPattern' &&
        type !== 'ObjectProperty' &&
        type !== 'Property' &&
        type !== 'RestElement' &&
        type !== 'AssignmentPattern'
      ) {
        return false;
      }
    }
    return false;
  });
}

/**
 * Where a definition goes when the row's statement is a hoisted function
 * declaration: code above it may call it before a `const` placed just before
 * it initializes. So the definition goes right after the last statement that
 * declares a binding it reads when it runs, or at the top (after the imports)
 * when it reads none. When code above that point can still reach the
 * function, `placementOf` keeps `createSwipe` on the row. Undefined
 * otherwise: the definition goes just before the row's statement.
 * @param {any} row @param {any[]} body @param {number} lastDependency
 * @returns {any}
 */
function afterFor(row, body, lastDependency) {
  const hoisted =
    row?.type === 'FunctionDeclaration' ||
    ((row?.type === 'ExportNamedDeclaration' ||
      row?.type === 'ExportDefaultDeclaration') &&
      row.declaration?.type === 'FunctionDeclaration');
  if (!hoisted) {
    return undefined;
  }
  return lastDependency >= 0 ? body[lastDependency] : null;
}

/**
 * The index in `body` a definition goes to: `before`, the row statement's
 * index, unless `afterFor` gave a point (`after`): right after that
 * statement, or at the top, after the imports at module scope.
 * @param {any[]} body @param {any} after @param {number} before @param {boolean} isModule
 */
function indexFor(body, after, before, isModule) {
  if (after === undefined) {
    return before;
  }
  if (after != null) {
    return body.indexOf(after) + 1;
  }
  let afterImports = 0;
  if (isModule) {
    body.forEach((statement, i) => {
      if (statement.type === 'ImportDeclaration') {
        afterImports = i + 1;
      }
    });
  }
  return afterImports;
}

/**
 * Where a swipe's definition goes: the statement list and its index, at
 * module scope or at the top level of the owner's body. Null for an owner
 * whose body is an expression, which `insertDefinition` wraps in a block.
 * @param {any} j @param {any} root @param {any} placement @param {any} rowPath
 * @returns {{body: any[], index: number} | null}
 */
function insertionPoint(j, root, placement, rowPath) {
  if (placement.kind === 'module') {
    const body = root.get().node.program.body;
    const before = body.indexOf(statementIn(body, rowPath));
    return {body, index: indexFor(body, placement.after, before, true)};
  }
  if (placement.owner.body.type !== 'BlockStatement') {
    return null;
  }
  const body = placement.owner.body.body;
  const row = statementHolding(j, body, rowPath);
  const before = row == null ? body.length - 1 : body.indexOf(row);
  return {body, index: indexFor(body, placement.after, before, false)};
}

/**
 * Inserts a swipe's definition where `insertionPoint` says.
 * @param {any} j @param {any} root @param {any} placement @param {any} rowPath @param {any} declaration
 */
function insertDefinition(j, root, placement, rowPath, declaration) {
  const point = insertionPoint(j, root, placement, rowPath);
  if (point == null) {
    const owner = placement.owner;
    owner.body = j.blockStatement([declaration, j.returnStatement(owner.body)]);
    return;
  }
  point.body.splice(point.index, 0, declaration);
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
 * to such an object literal, or what an array literal's `map` callback takes
 * when every element gives it one.
 * @param {any} spread @param {any} rowPath
 */
function carriesNoSwipeProps(spread, rowPath) {
  const argument = unwrap(spread.argument);
  if (argument?.type !== 'Identifier') {
    return false;
  }
  const bindings =
    rowPath.scope?.lookup(argument.name)?.getBindings()[argument.name] ?? [];
  if (bindings.length !== 1) {
    return false;
  }
  const declarator = bindings[0].parent?.node;
  if (declarator?.type !== 'VariableDeclarator') {
    return mappedValuesHaveNoSwipeKey(bindings[0]);
  }
  return (
    declarator.id === bindings[0].node &&
    bindings[0].parent.parent?.node?.kind === 'const' &&
    hasNoSwipeKey(declarator.init)
  );
}

/**
 * Whether a node is an object literal with no spread and no swipe key.
 * @param {any} node
 */
function hasNoSwipeKey(node) {
  const object = unwrap(node);
  return (
    object?.type === 'ObjectExpression' &&
    object.properties.every((/** @type {any} */ p) => {
      const key =
        keyOf(p) ??
        (p.type === 'ObjectMethod' && !p.computed ? p.key?.name : null);
      return key != null && !SWIPE_PROPS.has(key);
    })
  );
}

/**
 * Whether a `map` callback's first parameter, or one place in its array
 * pattern, is such an object literal in every element of the array literal it
 * maps.
 * @param {any} binding
 */
function mappedValuesHaveNoSwipeKey(binding) {
  const pattern = binding.parent?.node;
  const place =
    pattern?.type === 'ArrayPattern'
      ? pattern.elements.indexOf(binding.node)
      : -1;
  const param = place >= 0 ? binding.parent : binding;
  const callback = param.parent?.node;
  const call = param.parent?.parent?.node;
  const callee = call?.callee;
  const array = unwrap(callee?.object);
  if (
    !['ArrowFunctionExpression', 'FunctionExpression'].includes(
      callback?.type,
    ) ||
    callback.params[0] !== param.node ||
    call?.type !== 'CallExpression' ||
    call.arguments[0] !== callback ||
    callee?.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property?.name !== 'map' ||
    array?.type !== 'ArrayExpression'
  ) {
    return false;
  }
  return array.elements.every((/** @type {any} */ element) => {
    if (place < 0) {
      return hasNoSwipeKey(element);
    }
    const entry = unwrap(element);
    return (
      entry?.type === 'ArrayExpression' && hasNoSwipeKey(entry.elements[place])
    );
  });
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
 * Makes each handler that takes nothing and compares the row's own `itemKey`
 * value with `===` or `!==` take `itemKey` from `onActivate` instead. A
 * `ListItem` passes its `itemKey` to `onActivate`, so the swipe no longer
 * closes over the row.
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
      // `itemKey` is `string | number | undefined`. Compared with `===` or
      // `!==` it type-checks wherever the row's own key did; passed on, as in
      // `remove(itemKey)`, it can fail where the key's own type passed. So a
      // handler that reads the key any other way keeps its closure, and the
      // row keeps `createSwipe` with a TODO.
      const compared = reads.every((/** @type {any} */ p) => {
        const parent = p.parent?.node;
        return (
          parent?.type === 'BinaryExpression' &&
          (parent.operator === '===' || parent.operator === '!==')
        );
      });
      if (!compared) {
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
  /** Each definition's declaration, by the name it defines. */
  /** @type {Map<string, any>} */
  const definitionNodes = new Map();
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
      const placeComment =
        resolved.component === 'ListItem' ? PLACE_COMMENT : ITEM_PLACE_COMMENT;
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
            addComment(j, actions, placeComment);
            if (positional) {
              addComment(j, actions, NAME_COMMENT);
            }
          } else {
            const key = placement.shareable
              ? `${ownerKey(placement)}\u0000${shapeOf(object)}`
              : null;
            let name = key == null ? undefined : definitions.get(key);
            // A hoisted row's definition must run before any call to it, so
            // it reuses one only where that one already sits early enough.
            if (name != null && placement.after !== undefined) {
              const point = insertionPoint(j, root, placement, rowPath);
              const at = point?.body.indexOf(definitionNodes.get(name)) ?? -1;
              if (point == null || at === -1 || at > point.index) {
                name = undefined;
              }
            }
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
              definitionNodes.set(name, declaration);
              if (key != null) {
                definitions.set(key, name);
              }
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
