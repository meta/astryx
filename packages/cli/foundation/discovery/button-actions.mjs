// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Core buttons in an app's own source that do nothing when
 * pressed. A `Button` or `IconButton` from `@astryxdesign/core` acts on a
 * press through `onClick`, `clickAction`, `href`, or a `submit` or `reset`
 * type. A button with none of them, or with an empty handler or a link that
 * goes nowhere (`#`), does nothing, unless something around it acts on the
 * press. Each module is read only as
 * a syntax tree, so a button is reported only where the tree shows that
 * nothing acts on it: each element around it is a layout element that renders
 * its children in place, and the component that holds it is rendered the same
 * way wherever the app renders it, or is rendered by nothing in the app (a
 * page or an entry point).
 *
 * @input The source text of each module, and which imports name the app's
 *   own code.
 * @output Each button with no action: its file, line, column, component and
 *   label.
 * @position packages/cli/foundation/discovery — read by the doctor adapter
 *   (findButtonsWithoutAction) for the `button-actions` check.
 */

import {parseTemplateSource, traverseTemplateSource} from './template-source-tree.mjs';

const CORE = '@astryxdesign/core';

/** Whether a module is Core: its main entry, or one of its component entries such as `@astryxdesign/core/Button`. */
const isCore = (/** @type {string} */ source) => source === CORE || source.startsWith(`${CORE}/`);

/** The Core buttons the scan reads. */
const BUTTONS = new Set(['Button', 'IconButton']);

/**
 * Core components that render their children in place and act on no press:
 * none clones its children or listens for a click, a pointer or a key that
 * activates. SYNC: button-actions.test.mjs reads each one's source.
 */
export const LAYOUT_COMPONENTS = new Set([
  'AspectRatio',
  'Blockquote',
  'ButtonGroup',
  'Card',
  'Center',
  'EmptyState',
  'FormLayout',
  'Grid',
  'GridSpan',
  'HStack',
  'Heading',
  'InputGroup',
  'Layout',
  'LayoutContent',
  'LayoutFooter',
  'LayoutHeader',
  'LayoutPanel',
  'MediaTheme',
  'ScrollableArea',
  'Section',
  'Stack',
  'StackItem',
  'Text',
  'Theme',
  'Toolbar',
  'VStack',
]);

/** React's components that render their children in place. */
const REACT_WRAPPERS = new Set(['Fragment', 'StrictMode', 'Suspense', 'Profiler']);

/**
 * HTML elements whose content can act on a press, or that the page does not
 * show as written: a button inside one can do something without an action of
 * its own.
 */
const ACTING_ELEMENTS = new Set([
  'a',
  'area',
  'audio',
  'button',
  'datalist',
  'details',
  'dialog',
  'embed',
  'iframe',
  'input',
  'label',
  'map',
  'object',
  'optgroup',
  'option',
  'select',
  'summary',
  'template',
  'textarea',
  'video',
]);

/**
 * The events a form fires that no press on a `type="button"` button causes,
 * so a form that listens only for them does not act on the press.
 */
const FORM_EVENTS = new Set([
  'onChange',
  'onInput',
  'onInvalid',
  'onReset',
  'onSubmit',
]);

/**
 * Props of a Core button that change how it looks or reads, never what a
 * press does. `type`, `isDisabled`, `isLoading` and the action props are
 * read on their own.
 */
const BUTTON_LOOK_PROPS = new Set([
  'aria-describedby',
  'aria-label',
  'aria-labelledby',
  'aria-pressed',
  'children',
  'className',
  'data-testid',
  'dir',
  'elevation',
  'endContent',
  'icon',
  'isIconOnly',
  'isInterruptible',
  'key',
  'label',
  'lang',
  'name',
  'rel',
  'size',
  'style',
  'tabIndex',
  'target',
  'value',
  'variant',
  'width',
  'xstyle',
]);

/** The props through which a Core button acts on a press. */
const ACTION_PROPS = new Set(['onClick', 'clickAction']);

/**
 * Props that make a layout element act on a press, or that hand it to code
 * the tree does not show: an event handler, a link, a ref, a role or focus,
 * a data attribute that a script may look for, or props spread in.
 * @param {any} attribute a JSXAttribute or JSXSpreadAttribute node
 * @param {string} tag the element's tag; `form` ignores its own events
 */
function actsOnPress(attribute, tag) {
  if (attribute.type !== 'JSXAttribute') return true;
  const name = attributeName(attribute);
  if (name == null) return true;
  if (/^on[A-Z]/.test(name)) return !(tag === 'form' && FORM_EVENTS.has(name));
  if (name.startsWith('data-')) return name !== 'data-testid';
  return [
    'as',
    'contentEditable',
    'draggable',
    'href',
    'popover',
    'ref',
    'role',
    'tabIndex',
  ].includes(name);
}

/** @param {any} attribute */
function attributeName(attribute) {
  const name = attribute.name;
  if (name?.type === 'JSXIdentifier') return name.name;
  return null;
}

/**
 * What an expression in a button's props stands for: the value of a `const`
 * that is a string or a function, or of a function declaration, when the
 * name is one of those in the module; else the expression itself.
 * @param {any} expression
 * @param {any} path the button's JSXElement path, whose scope holds the name
 * @returns {any}
 */
function constantValue(expression, path) {
  if (expression?.type !== 'Identifier') return expression;
  const binding = path.scope.getBinding(expression.name);
  if (binding?.kind === 'hoisted' && binding.path.isFunctionDeclaration()) return binding.path.node;
  if (binding?.kind !== 'const' || !binding.path.isVariableDeclarator()) return expression;
  let init = binding.path.node.init;
  while (
    init?.type === 'TSAsExpression' ||
    init?.type === 'TSSatisfiesExpression' ||
    init?.type === 'TSTypeAssertion' ||
    init?.type === 'ParenthesizedExpression'
  ) {
    init = init.expression;
  }
  const isValue =
    init?.type === 'StringLiteral' ||
    (init?.type === 'TemplateLiteral' && init.expressions.length === 0) ||
    init?.type === 'ArrowFunctionExpression' ||
    init?.type === 'FunctionExpression';
  return isValue ? init : expression;
}

/**
 * Whether an attribute value is a handler that does nothing: a function with
 * an empty body, or one that returns `undefined`, `null` or `void 0`.
 * @param {any} value a JSXAttribute value
 * @param {any} path the button's JSXElement path
 */
function isEmptyHandler(value, path) {
  if (value?.type !== 'JSXExpressionContainer') return false;
  const fn = constantValue(value.expression, path);
  if (
    fn?.type !== 'ArrowFunctionExpression' &&
    fn?.type !== 'FunctionExpression' &&
    fn?.type !== 'FunctionDeclaration'
  ) {
    return false;
  }
  const body = fn.body;
  if (body.type === 'BlockStatement') return body.body.length === 0;
  return (
    body.type === 'NullLiteral' ||
    (body.type === 'Identifier' && body.name === 'undefined') ||
    (body.type === 'UnaryExpression' && body.operator === 'void' && body.argument.type === 'NumericLiteral')
  );
}

/**
 * The link an `href` holds when the source states it: a string, or a `const`
 * string in the module. Null when the link is computed.
 * @param {any} value a JSXAttribute value
 * @param {any} path the button's JSXElement path
 * @returns {{href: string, name: string | null} | null}
 */
function linkOf(value, path) {
  const expression = value?.type === 'JSXExpressionContainer' ? value.expression : null;
  const href = staticText(expression?.type === 'Identifier' ? constantValue(expression, path) : value);
  if (href == null) return null;
  return {href: href.trim(), name: expression?.type === 'Identifier' ? expression.name : null};
}

/**
 * Whether a link goes nowhere: `#` alone, an empty link, or a `javascript:`
 * link. A link to an anchor on the page, such as `#features`, goes
 * somewhere, and so does `#` in an app that routes by the hash, where it
 * opens the first page.
 * @param {string} href
 * @param {ScanContext} context
 */
function goesNowhere(href, context) {
  return href === '' || (href === '#' && !context.hashRouting) || /^javascript:/i.test(href);
}

/**
 * The text of a string-valued attribute or child: a string literal, or a
 * template literal with no expressions. Null otherwise.
 * @param {any} node
 */
function staticText(node) {
  if (node == null) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'JSXExpressionContainer') return staticText(node.expression);
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((/** @type {any} */ q) => q.value.cooked ?? '').join('');
  }
  return null;
}

/**
 * The words a button shows or says: its `label`, else its text children.
 * @param {any} element a JSXElement node
 * @returns {string | null}
 */
function labelOf(element) {
  for (const key of ['label', 'aria-label']) {
    for (const attribute of element.openingElement.attributes) {
      if (attribute.type === 'JSXAttribute' && attributeName(attribute) === key) {
        const text = staticText(attribute.value);
        if (text != null && text.trim() !== '') return text.trim().replace(/\s+/g, ' ');
      }
    }
  }
  const words = [];
  for (const child of element.children) {
    if (child.type === 'JSXText') words.push(child.value);
    else {
      const text = staticText(child);
      if (text != null) words.push(text);
    }
  }
  const text = words.join(' ').trim().replace(/\s+/g, ' ');
  return text === '' ? null : text;
}

/**
 * The module a binding imports from, the name it imports (`default` or
 * `*` for a default or namespace import), and whether the import is
 * type-only. Null for a binding that is not an import.
 * @param {any} binding a Babel scope binding
 */
function importOf(binding) {
  const path = binding?.path;
  if (!path) return null;
  const declaration = path.parentPath?.node;
  if (declaration?.type !== 'ImportDeclaration') return null;
  const node = path.node;
  const typeOnly = declaration.importKind === 'type' || node.importKind === 'type';
  /** @type {string} */
  let imported;
  if (node.type === 'ImportDefaultSpecifier') imported = 'default';
  else if (node.type === 'ImportNamespaceSpecifier') imported = '*';
  else imported = node.imported.type === 'StringLiteral' ? node.imported.value : node.imported.name;
  return {source: /** @type {string} */ (declaration.source.value), imported, typeOnly};
}

/**
 * @typedef {{kind: 'intrinsic', tag: string}
 *   | {kind: 'package', source: string, name: string}
 *   | {kind: 'local', name: string}
 *   | {kind: 'own', names: string[]}
 *   | {kind: 'other', names: string[]}} Referent
 */

/**
 * What an element's name refers to: a component a package exports
 * (`package`, with the name it exports), a component the module declares
 * (`local`), one it imports from the app's own code (`own`, with the names
 * it may go by), another binding (`other`), or an HTML element
 * (`intrinsic`).
 * @param {any} path a JSXElement path
 * @param {(specifier: string) => boolean} isOwnCode
 * @returns {Referent}
 */
function referent(path, isOwnCode) {
  const name = path.node.openingElement.name;
  if (name.type === 'JSXIdentifier') {
    if (/^[a-z]/.test(name.name) || name.name.includes('-')) {
      return {kind: 'intrinsic', tag: name.name};
    }
    return bindingReferent(path, name.name, null, isOwnCode);
  }
  if (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier') {
    return bindingReferent(path, name.object.name, name.property.name, isOwnCode);
  }
  return {kind: 'other', names: []};
}

/**
 * @param {any} path
 * @param {string} local
 * @param {string | null} member the property read off the binding, as in `NS.Card`
 * @param {(specifier: string) => boolean} isOwnCode
 * @returns {Referent}
 */
function bindingReferent(path, local, member, isOwnCode) {
  const binding = path.scope.getBinding(local);
  const imported = importOf(binding);
  if (imported && !imported.typeOnly) {
    const own = /^\.{1,2}(\/|$)/.test(imported.source) || isOwnCode(imported.source);
    if (member != null) {
      if (own) return {kind: 'own', names: [member]};
      // A member of a namespace or default import is the module's export of
      // that name; a member of a named import is a part of that export.
      const whole = imported.imported === '*' || imported.imported === 'default';
      return {kind: 'package', source: imported.source, name: whole ? member : `${imported.imported}.${member}`};
    }
    if (!own) return {kind: 'package', source: imported.source, name: imported.imported};
    const stem = specifierStem(imported.source);
    return {
      kind: 'own',
      names: imported.imported === 'default' ? [local, ...(stem ? [stem] : [])] : [imported.imported],
    };
  }
  if (member == null && binding && isComponentDeclaration(binding)) {
    return {kind: 'local', name: local};
  }
  return {kind: 'other', names: [member ?? local]};
}

/**
 * The last segment of a module path, without its extension; for an `index`
 * file, the folder's name.
 * @param {string} specifier
 */
function specifierStem(specifier) {
  const parts = specifier.split('/').filter(part => part !== '' && part !== '.' && part !== '..');
  let last = parts.pop() ?? '';
  last = last.replace(/\.[cm]?[jt]sx?$/, '');
  if (last === 'index') last = parts.pop() ?? '';
  return last === '' ? null : last;
}

/**
 * Whether a binding is a component the module declares: a function, or a
 * variable whose value is a function or a `memo` or `forwardRef` call.
 * @param {any} binding
 */
function isComponentDeclaration(binding) {
  const node = binding.path.node;
  if (node.type === 'FunctionDeclaration') return true;
  if (node.type !== 'VariableDeclarator') return false;
  return wrappedFunction(node.init) != null;
}

/**
 * The function a component value holds: itself, or the first argument of a
 * `memo` or `forwardRef` call around it.
 * @param {any} node
 * @returns {any}
 */
function wrappedFunction(node) {
  if (node == null) return null;
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return node;
  if (node.type === 'CallExpression' && isComponentWrapper(node.callee)) {
    return wrappedFunction(node.arguments[0]);
  }
  if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') {
    return wrappedFunction(node.expression);
  }
  return null;
}

/** @param {any} callee */
function isComponentWrapper(callee) {
  const name =
    callee.type === 'Identifier'
      ? callee.name
      : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
        ? callee.property.name
        : null;
  return name === 'memo' || name === 'forwardRef';
}

/**
 * The component a function is: its name and whether it is the module's
 * default export, or null when the function is not a component (its name
 * does not start with a capital letter, and it is not the default export).
 * @param {any} fn a function path
 * @returns {{name: string, isDefault: boolean} | null}
 */
function componentOf(fn) {
  /** @type {any} */
  let path = fn;
  if (fn.node.type === 'FunctionDeclaration') {
    const name = fn.node.id?.name ?? null;
    const isDefault = fn.parentPath?.node.type === 'ExportDefaultDeclaration';
    if (name && /^[A-Z]/.test(name)) return {name, isDefault};
    return isDefault ? {name: name ?? 'default', isDefault} : null;
  }
  while (
    path.parentPath?.node.type === 'CallExpression' &&
    isComponentWrapper(path.parentPath.node.callee) &&
    path.parentPath.node.arguments[0] === path.node
  ) {
    path = path.parentPath;
  }
  const parent = path.parentPath?.node;
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return /^[A-Z]/.test(parent.id.name) ? {name: parent.id.name, isDefault: false} : null;
  }
  if (parent?.type === 'ExportDefaultDeclaration') return {name: 'default', isDefault: true};
  return null;
}

/**
 * Whether a function is the callback of a `map` or `flatMap` call, whose
 * result the module renders where the call stands.
 * @param {any} fn a function path
 */
function isMapCallback(fn) {
  const call = fn.parentPath?.node;
  return (
    call?.type === 'CallExpression' &&
    call.arguments[0] === fn.node &&
    call.callee.type === 'MemberExpression' &&
    call.callee.property.type === 'Identifier' &&
    ['map', 'flatMap'].includes(call.callee.property.name)
  );
}

/** Array methods that keep the elements a `map` made, in the same place. */
const KEEPING_METHODS = new Set(['concat', 'filter', 'flat', 'reverse', 'slice', 'sort', 'toReversed', 'toSorted']);

/**
 * Whether a call renders an element at the root of the app: `render` or
 * `hydrate` on a root or on ReactDOM, or `hydrateRoot`.
 * @param {any} call a CallExpression node
 */
function isRootRender(call) {
  const callee = call.callee;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name === 'render' || callee.property.name === 'hydrate';
  }
  return callee.type === 'Identifier' && callee.name === 'hydrateRoot';
}

/** The packages whose `Route` renders its `element` prop as a page. */
const ROUTERS = new Set(['react-router', 'react-router-dom']);

/**
 * @typedef {'blocked' | 'root' | {component: string}} Placement
 *   Where an element is rendered: `root`, at the top of the app (a root
 *   render call, or a route's page); `{component}`, in what the module's
 *   component of that name renders, with nothing around it that may act on a
 *   press; `blocked`, anywhere else, or somewhere the tree cannot show.
 */

/**
 * @typedef {object} ScanContext
 * @property {(specifier: string) => boolean} isOwnCode
 * @property {boolean} hashRouting whether the app routes by the URL hash
 */

/**
 * Where an element is rendered. Walks out from the element through the
 * elements and expressions around it, up to the component that returns it.
 * @param {any} elementPath a JSXElement path
 * @param {ScanContext} context
 * @returns {Placement}
 */
function placementOf(elementPath, context) {
  /** @type {any} */
  let path = elementPath;
  for (;;) {
    const parent = path.parentPath;
    if (!parent) return 'blocked';
    const node = parent.node;
    switch (node.type) {
      case 'JSXElement':
        if (path.listKey !== 'children') return 'blocked';
        if (!rendersInPlace(parent, context)) return 'blocked';
        path = parent;
        continue;
      case 'JSXFragment':
        path = parent;
        continue;
      case 'JSXExpressionContainer':
        if (parent.parentPath?.node.type === 'JSXAttribute') {
          const attribute = parent.parentPath;
          if (routePage(attribute, context)) return 'root';
          // A layout component renders each element its props hold in place,
          // as it renders its children.
          const element = attribute.parentPath?.parentPath;
          if (element?.node.type === 'JSXElement' && isLayoutComponent(element, context) && rendersInPlace(element, context)) {
            path = element;
            continue;
          }
          return 'blocked';
        }
        path = parent;
        continue;
      case 'ConditionalExpression':
        if (path.key === 'test') return 'blocked';
        path = parent;
        continue;
      case 'LogicalExpression':
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'ArrayExpression':
        path = parent;
        continue;
      case 'MemberExpression': {
        const call = parent.parentPath?.node;
        if (
          path.key === 'object' &&
          call?.type === 'CallExpression' &&
          call.callee === node &&
          node.property.type === 'Identifier' &&
          KEEPING_METHODS.has(node.property.name) &&
          path.node.type === 'CallExpression'
        ) {
          path = parent.parentPath;
          continue;
        }
        return 'blocked';
      }
      case 'CallExpression':
        if (path.listKey === 'arguments' && isRootRender(node)) return 'root';
        return 'blocked';
      case 'ReturnStatement': {
        const fn = parent.getFunctionParent();
        if (!fn) return 'blocked';
        if (isMapCallback(fn)) {
          path = fn.parentPath;
          continue;
        }
        const component = componentOf(fn);
        return component ? {component: component.name} : 'blocked';
      }
      case 'ArrowFunctionExpression': {
        if (path.key !== 'body') return 'blocked';
        if (isMapCallback(parent)) {
          path = parent.parentPath;
          continue;
        }
        const component = componentOf(parent);
        return component ? {component: component.name} : 'blocked';
      }
      default:
        return 'blocked';
    }
  }
}

/**
 * Whether an attribute is the `element` of a router's `Route`, which renders
 * it as a page.
 * @param {any} attributePath a JSXAttribute path
 * @param {ScanContext} context
 */
function routePage(attributePath, context) {
  if (attributeName(attributePath.node) !== 'element') return false;
  const element = attributePath.parentPath?.parentPath;
  if (element?.node.type !== 'JSXElement') return false;
  const target = referent(element, context.isOwnCode);
  return target.kind === 'package' && ROUTERS.has(target.source) && target.name === 'Route';
}

/**
 * Whether an element is a Core layout component or a React wrapper, whose
 * every prop that holds an element renders it in place.
 * @param {any} path a JSXElement path
 * @param {ScanContext} context
 */
function isLayoutComponent(path, context) {
  const target = referent(path, context.isOwnCode);
  return (
    target.kind === 'package' &&
    ((isCore(target.source) && LAYOUT_COMPONENTS.has(target.name)) ||
      (target.source === 'react' && REACT_WRAPPERS.has(target.name)))
  );
}

/**
 * Whether an element renders its children in place and acts on no press: an
 * HTML element that holds no control, a Core layout component, a React
 * wrapper, or a context provider, none of them with a prop that may act on a
 * press.
 * @param {any} path a JSXElement path
 * @param {ScanContext} context
 */
function rendersInPlace(path, context) {
  const target = referent(path, context.isOwnCode);
  /** @type {string} */
  let tag = '';
  if (target.kind === 'intrinsic') {
    tag = target.tag;
    if (ACTING_ELEMENTS.has(tag)) return false;
  } else if (target.kind === 'package') {
    const layout =
      (isCore(target.source) && LAYOUT_COMPONENTS.has(target.name)) ||
      (target.source === 'react' && REACT_WRAPPERS.has(target.name)) ||
      /Provider$/.test(target.name);
    if (!layout) return false;
  } else if (target.kind === 'own' || target.kind === 'local' || target.kind === 'other') {
    const names = target.kind === 'local' ? [target.name] : target.names;
    if (!names.some(name => /Provider$/.test(name))) return false;
  }
  return !path.node.openingElement.attributes.some((/** @type {any} */ attribute) => actsOnPress(attribute, tag));
}

/**
 * Why a Core button's element shows no action of its own, or null when it
 * has one or the scan cannot judge it. None of its props may act on a press
 * or hand it to code the tree does not show, and nothing inside it may act.
 * The reason is null for a button with no action prop at all, else the prop
 * that does nothing: an empty handler, or a link that goes nowhere.
 * @param {any} path a JSXElement path
 * @param {ScanContext} context
 * @returns {{note: string | null} | null}
 */
function missingAction(path, context) {
  /** @type {string | null} */
  let note = null;
  for (const attribute of path.node.openingElement.attributes) {
    if (attribute.type !== 'JSXAttribute') return null;
    const name = attributeName(attribute);
    if (name == null) return null;
    if (ACTION_PROPS.has(name)) {
      if (!isEmptyHandler(attribute.value, path)) return null;
      note = `empty ${name}`;
      continue;
    }
    if (name === 'href') {
      const link = linkOf(attribute.value, path);
      if (link == null || !goesNowhere(link.href, context)) return null;
      note ??= link.name == null ? `href="${link.href}"` : `${link.name} is "${link.href}"`;
      continue;
    }
    if (name === 'type') {
      if (staticText(attribute.value) !== 'button') return null;
      continue;
    }
    if (name === 'isDisabled' || name === 'isLoading') {
      const value = attribute.value;
      const isFalse =
        value?.type === 'JSXExpressionContainer' &&
        value.expression.type === 'BooleanLiteral' &&
        value.expression.value === false;
      if (!isFalse) return null;
      continue;
    }
    if (!BUTTON_LOOK_PROPS.has(name)) return null;
  }
  return holdsActingContent(path, context) ? null : {note};
}

/**
 * Whether anything inside a button's element, its children or the elements
 * its props hold, may act on a press: a prop that acts, or an element that
 * is not plain content.
 * @param {any} path a JSXElement path
 * @param {ScanContext} context
 */
function holdsActingContent(path, context) {
  let acting = false;
  path.traverse({
    JSXElement(/** @type {any} */ inner) {
      if (acting) return;
      const target = referent(inner, context.isOwnCode);
      if (target.kind === 'intrinsic' && ACTING_ELEMENTS.has(target.tag)) acting = true;
      if (target.kind === 'own' || target.kind === 'local' || target.kind === 'other') acting = true;
      if (inner.node.openingElement.attributes.some((/** @type {any} */ a) => actsOnPress(a, ''))) {
        acting = true;
      }
      if (acting) inner.stop();
    },
  });
  return acting;
}

/**
 * @typedef {object} ButtonUse
 * @property {number} line
 * @property {number} column
 * @property {'Button' | 'IconButton'} component
 * @property {string | null} label
 * @property {string | null} note the prop that does nothing, such as
 *   `empty onClick` or `href="#"`; null when the button has no action prop
 * @property {Placement} placement
 */

/**
 * @typedef {object} ComponentUse A component of the app's own code that the
 *   module renders.
 * @property {string | null} local the component of this module it names, or
 *   null for one that may come from another module
 * @property {string[]} names the names that component may go by elsewhere
 * @property {Placement} placement
 */

/**
 * @typedef {object} ModuleScan
 * @property {ButtonUse[]} buttons the Core buttons in the module that show no
 *   action of their own, each with where it is rendered
 * @property {ComponentUse[]} uses
 * @property {Map<string, string[]>} exports each component the module
 *   exports, by its name in the module, with the names it goes by elsewhere
 */

/**
 * Read one module of the app's own source: its Core buttons that show no
 * action of their own, the components of the app it renders, and the
 * components it exports. Null when the module does not parse.
 * @param {string} source
 * @param {{isOwnCode: (specifier: string) => boolean, stem: string | null, hashRouting?: boolean}} options
 *   `isOwnCode` tells a path alias from a package; `stem` is the module's
 *   name as another module imports it (its file name, or its folder's for an
 *   `index` file); `hashRouting` says the app routes by the URL hash, so a
 *   `#` link opens its first page
 * @returns {ModuleScan | null}
 */
export function scanButtonActions(source, {isOwnCode, stem, hashRouting = false}) {
  /** @type {any} */
  let file;
  try {
    file = parseTemplateSource(source);
  } catch {
    return null;
  }
  /** @type {ScanContext} */
  const context = {isOwnCode, hashRouting};
  /** @type {ButtonUse[]} */
  const buttons = [];
  /** @type {ComponentUse[]} */
  const uses = [];
  /** @type {Map<string, string[]>} */
  const exports = new Map();
  const exportAs = (/** @type {string} */ local, /** @type {string} */ name) => {
    const names = exports.get(local) ?? [];
    if (!names.includes(name)) names.push(name);
    exports.set(local, names);
  };
  traverseTemplateSource(file, {
    JSXElement(/** @type {any} */ path) {
      const target = referent(path, isOwnCode);
      if (target.kind === 'package' && isCore(target.source) && BUTTONS.has(target.name)) {
        const missing = missingAction(path, context);
        if (!missing) return;
        const loc = path.node.loc?.start;
        buttons.push({
          line: loc?.line ?? 0,
          column: (loc?.column ?? 0) + 1,
          component: /** @type {'Button' | 'IconButton'} */ (target.name),
          label: labelOf(path.node),
          note: missing.note,
          placement: placementOf(path, context),
        });
        return;
      }
      if (target.kind === 'local') {
        uses.push({local: target.name, names: [target.name], placement: placementOf(path, context)});
      } else if (target.kind === 'own' || (target.kind === 'other' && /^[A-Z]/.test(target.names[0] ?? ''))) {
        uses.push({local: null, names: target.names, placement: placementOf(path, context)});
      }
    },
    ExportDefaultDeclaration(/** @type {any} */ path) {
      const declaration = path.node.declaration;
      const aliases = ['default', ...(stem ? [stem] : [])];
      /** @type {string | null} */
      let local = null;
      if (declaration.type === 'FunctionDeclaration') local = declaration.id?.name ?? 'default';
      else if (declaration.type === 'Identifier') local = declaration.name;
      else if (wrappedFunction(declaration)) local = 'default';
      if (local == null) return;
      for (const alias of [local, ...aliases]) exportAs(local, alias);
    },
    ExportNamedDeclaration(/** @type {any} */ path) {
      const {declaration, specifiers, source: from} = path.node;
      if (from) return;
      if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
        exportAs(declaration.id.name, declaration.id.name);
      } else if (declaration?.type === 'VariableDeclaration') {
        for (const each of declaration.declarations) {
          if (each.id.type === 'Identifier') exportAs(each.id.name, each.id.name);
        }
      }
      for (const specifier of specifiers ?? []) {
        if (specifier.type !== 'ExportSpecifier' || specifier.local.type !== 'Identifier') continue;
        const exported =
          specifier.exported.type === 'StringLiteral' ? specifier.exported.value : specifier.exported.name;
        exportAs(specifier.local.name, exported);
        if (exported === 'default' && stem) exportAs(specifier.local.name, stem);
      }
    },
  });
  return {buttons, uses, exports};
}

/**
 * @typedef {object} ScannedModule
 * @property {string} file
 * @property {ModuleScan} scan
 */

/**
 * @typedef {object} ButtonFinding
 * @property {string} file
 * @property {number} line
 * @property {number} column
 * @property {'Button' | 'IconButton'} component
 * @property {string | null} label
 * @property {string | null} note
 */

/**
 * The Core buttons in an app that do nothing when pressed: each button that
 * shows no action of its own and is rendered, through every component that
 * holds it, with nothing around it that may act on a press.
 * @param {object} app
 * @param {string[]} app.files the modules that hold Core buttons
 * @param {(file: string) => ModuleScan | null} app.scan
 * @param {(names: string[]) => string[]} app.modulesNaming the modules whose
 *   text names any of the names, which may render a component that goes by one
 * @returns {ButtonFinding[]}
 */
export function buttonsWithoutAction({files, scan, modulesNaming}) {
  /** @type {Map<string, boolean>} */
  const known = new Map();
  /** @type {Set<string>} */
  const visiting = new Set();

  /**
   * Whether every place the app renders a component is clear of anything
   * that may act on a press, or nothing renders it and it is exported (a
   * page or an entry point).
   * @param {string} file
   * @param {string} component
   * @returns {boolean}
   */
  const clear = (file, component) => {
    const key = `${file}\0${component}`;
    const memo = known.get(key);
    if (memo !== undefined) return memo;
    if (visiting.has(key)) return false;
    visiting.add(key);
    const own = scan(file);
    const names = own?.exports.get(component) ?? [];
    /** @type {Array<{file: string, placement: Placement}>} */
    const places = [];
    for (const use of own?.uses ?? []) {
      const here =
        use.local === component ||
        (use.local == null && use.names.some(name => name === component || names.includes(name)));
      if (here && !sameComponent(use.placement, component)) places.push({file, placement: use.placement});
    }
    const shared = names.filter(name => name !== 'default');
    if (shared.length > 0) {
      for (const other of modulesNaming(shared)) {
        if (other === file) continue;
        for (const use of scan(other)?.uses ?? []) {
          if (use.local == null && use.names.some(name => shared.includes(name))) {
            places.push({file: other, placement: use.placement});
          }
        }
      }
    }
    const result =
      places.length === 0
        ? names.length > 0
        : places.every(place => placementClear(place.file, place.placement));
    visiting.delete(key);
    known.set(key, result);
    return result;
  };

  /**
   * @param {string} file
   * @param {Placement} placement
   */
  const placementClear = (file, placement) =>
    placement === 'root' || (typeof placement === 'object' && clear(file, placement.component));

  /** @type {ButtonFinding[]} */
  const found = [];
  for (const file of files) {
    for (const button of scan(file)?.buttons ?? []) {
      if (placementClear(file, button.placement)) {
        found.push({
          file,
          line: button.line,
          column: button.column,
          component: button.component,
          label: button.label,
          note: button.note,
        });
      }
    }
  }
  return found;
}

/**
 * @param {Placement} placement
 * @param {string} component
 */
function sameComponent(placement, component) {
  return typeof placement === 'object' && placement.component === component;
}
