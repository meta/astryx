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
import {importedName} from './template-icons.mjs';
import {ICON_EXPORT_NAME_RE} from './icon-set-discovery.mjs';
import {writtenString} from '../text/written-string.mjs';

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
 * ARIA roles that name a landmark or a part of a document. An element with
 * one of them still holds content and takes no press; a widget role, such as
 * `button` or `menuitem`, can.
 */
const STRUCTURE_ROLES = new Set([
  'article',
  'banner',
  'complementary',
  'contentinfo',
  'document',
  'form',
  'group',
  'list',
  'listitem',
  'main',
  'navigation',
  'none',
  'note',
  'presentation',
  'region',
  'search',
]);

/**
 * Props that make a layout element act on a press, or that hand it to code
 * the tree does not show: an event handler, a link, a ref, a widget role or
 * focus, a data attribute that a script may look for, or props spread in.
 * @param {any} attribute a JSXAttribute or JSXSpreadAttribute node
 * @param {string} tag the element's tag; `form` ignores its own events
 */
function actsOnPress(attribute, tag) {
  if (attribute.type !== 'JSXAttribute') return true;
  const name = attributeName(attribute);
  if (name == null) return true;
  if (/^on[A-Z]/.test(name)) return !(tag === 'form' && FORM_EVENTS.has(name));
  if (name.startsWith('data-')) return name !== 'data-testid';
  if (name === 'role') return !STRUCTURE_ROLES.has(staticText(attribute.value) ?? '');
  // A disabled group or fieldset, or inert content, disables the buttons it holds.
  if (name === 'isDisabled' || name === 'disabled' || name === 'inert') return !isFalse(attribute.value);
  return ['as', 'contentEditable', 'draggable', 'href', 'popover', 'ref', 'tabIndex'].includes(name);
}

/**
 * Whether an attribute value is the literal `{false}`.
 * @param {any} value a JSXAttribute value
 */
function isFalse(value) {
  return (
    value?.type === 'JSXExpressionContainer' &&
    value.expression.type === 'BooleanLiteral' &&
    value.expression.value === false
  );
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
  const nothing = (/** @type {any} */ node) =>
    node == null ||
    node.type === 'NullLiteral' ||
    (node.type === 'Identifier' && node.name === 'undefined') ||
    (node.type === 'UnaryExpression' && node.operator === 'void' && node.argument.type === 'NumericLiteral');
  const body = fn.body;
  if (body.type !== 'BlockStatement') return nothing(body);
  // A block that is empty, or that only returns nothing.
  return body.body.length === 0 || (body.body.length === 1 && body.body[0].type === 'ReturnStatement' && nothing(body.body[0].argument));
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
 * How the warning names a link that goes nowhere: a placeholder to replace.
 * @param {{href: string, name: string | null}} link
 */
function placeholderNote({href, name}) {
  if (href === '#') {
    return name == null
      ? 'placeholder link: replace `#` with a real href'
      : `placeholder link: replace \`#\` in ${name} with a real href`;
  }
  return name == null ? 'placeholder link: give it a real href' : `placeholder link: give ${name} a real href`;
}

/**
 * The text of a string-valued attribute or child: a string literal, or a
 * template literal with no expressions. Null otherwise.
 * @param {any} node
 */
function staticText(node) {
  return writtenString(node?.type === 'JSXExpressionContainer' ? node.expression : node);
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
  return {source: /** @type {string} */ (declaration.source.value), imported: importedName(node), typeOnly};
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
 * @param {{isOwnCode: (specifier: string) => boolean, stemOf: (specifier: string) => string | null}} context
 * @returns {Referent}
 */
function referent(path, context) {
  const name = path.node.openingElement.name;
  if (name.type === 'JSXIdentifier') {
    if (/^[a-z]/.test(name.name) || name.name.includes('-')) {
      return {kind: 'intrinsic', tag: name.name};
    }
    return bindingReferent(path, name.name, null, context);
  }
  if (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier') {
    return bindingReferent(path, name.object.name, name.property.name, context);
  }
  return {kind: 'other', names: []};
}

/**
 * @param {any} path
 * @param {string} local
 * @param {string | null} member the property read off the binding, as in `NS.Card`
 * @param {{isOwnCode: (specifier: string) => boolean, stemOf: (specifier: string) => string | null}} context
 * @returns {Referent}
 */
function bindingReferent(path, local, member, context) {
  const binding = path.scope.getBinding(local);
  const imported = importOf(binding);
  if (imported && !imported.typeOnly) {
    const own = ownModule(imported.source, context.isOwnCode);
    if (member != null) {
      // `S.default` off the app's own namespace import is that module's
      // default export, named as a default import names it.
      if (own && member === 'default') {
        const stem = context.stemOf(imported.source);
        return {kind: 'own', names: stem ? [stem] : [member]};
      }
      if (own) return {kind: 'own', names: [member]};
      // A member of a namespace or default import is the module's export of
      // that name; a member of a named import is a part of that export.
      const whole = imported.imported === '*' || imported.imported === 'default';
      return {kind: 'package', source: imported.source, name: whole ? member : `${imported.imported}.${member}`};
    }
    if (!own) return {kind: 'package', source: imported.source, name: imported.imported};
    const stem = context.stemOf(imported.source);
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
export function specifierStem(specifier) {
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

/** A router's own components that render the routes they hold in place. */
const ROUTER_WRAPPERS = new Set(['BrowserRouter', 'HashRouter', 'MemoryRouter', 'Router', 'StaticRouter', 'Routes']);

/**
 * @typedef {'blocked' | 'root' | {component: string}} Placement
 *   Where an element is rendered: `root`, at the top of the app (a root
 *   render call); `{component}`, in what the module's
 *   component of that name renders, with nothing around it that may act on a
 *   press; `blocked`, anywhere else, or somewhere the tree cannot show.
 */

/**
 * @typedef {object} ScanContext
 * @property {(specifier: string) => boolean} isOwnCode
 * @property {(specifier: string) => string | null} stemOf the name of the
 *   module a path imports, as `specifierStem` reads it, with `.` and `..`
 *   read from the importing module's own folder
 * @property {boolean} hashRouting whether the app routes by the URL hash
 * @property {(specifier: string) => boolean} knownPackage whether a bare
 *   module path names a package the project declares or has installed
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
          // A route's page renders where its `Routes` sit, so the walk goes on
          // from the route, through the router's own wrappers.
          if (routePage(attribute, context)) {
            path = attribute.parentPath.parentPath;
            continue;
          }
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
  const target = referent(element, context);
  return target.kind === 'package' && ROUTERS.has(target.source) && target.name === 'Route';
}

/** The props of a `Route` that only match a path, so it renders its child routes in place. */
const ROUTE_MATCH_PROPS = new Set(['path', 'index', 'caseSensitive', 'id', 'key']);

/**
 * Whether a router's element renders the routes it holds in place: a router,
 * `Routes`, or a `Route` with only props that match a path. A route nested in
 * any other `Route` (with an `element`, a `Component` or a `lazy` load)
 * renders in that route's `Outlet`, which the scan does not follow.
 * @param {any} path a JSXElement path
 * @param {{kind: 'package', source: string, name: string}} target
 */
function routesInPlace(path, target) {
  if (!ROUTERS.has(target.source)) return false;
  if (ROUTER_WRAPPERS.has(target.name)) return true;
  return (
    target.name === 'Route' &&
    path.node.openingElement.attributes.every(
      (/** @type {any} */ a) => a.type === 'JSXAttribute' && ROUTE_MATCH_PROPS.has(attributeName(a)),
    )
  );
}

/**
 * Whether an element is a Core layout component or a React wrapper, whose
 * every prop that holds an element renders it in place.
 * @param {any} path a JSXElement path
 * @param {ScanContext} context
 */
function isLayoutComponent(path, context) {
  const target = referent(path, context);
  return (
    target.kind === 'package' &&
    ((isCore(target.source) && LAYOUT_COMPONENTS.has(target.name)) ||
      (target.source === 'react' && REACT_WRAPPERS.has(target.name)))
  );
}

/** The routers and histories that keep the route in the URL hash. */
const HASH_ROUTERS = new Set(['HashRouter', 'createHashRouter', 'createHashHistory', 'useHashLocation']);

/**
 * Whether a call or assignment listens for the URL hash to change:
 * `addEventListener('hashchange', …)` on any target, or an `onhashchange`
 * handler assigned to one.
 * @param {any} node
 */
function listensForHash(node) {
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    const name = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : callee.type === 'Identifier' ? callee.name : null;
    return name === 'addEventListener' && writtenString(node.arguments[0]) === 'hashchange';
  }
  if (node.type === 'AssignmentExpression') {
    const target = node.left;
    return (
      (target.type === 'MemberExpression' && !target.computed && target.property.name === 'onhashchange') ||
      (target.type === 'Identifier' && target.name === 'onhashchange')
    );
  }
  return false;
}

/**
 * Whether a module routes by the URL hash: it imports React Router's
 * `HashRouter` or `createHashRouter`, a `createHashHistory` (TanStack Router,
 * `history`) or wouter's `useHashLocation`, by name, or reads one from a
 * namespace it imports (`RR.HashRouter` from
 * `import * as RR from 'react-router-dom'`); or it listens for the hash to
 * change itself (`addEventListener('hashchange', …)`, `onhashchange`). A name
 * in a comment or a string is not an import.
 * @param {string} source
 * @param {{jsx?: boolean}} [options] `jsx: false` for a `.ts` module
 * @returns {boolean}
 */
export function routesByHash(source, {jsx = true} = {}) {
  if (!/\b(?:HashRouter|createHashRouter|createHashHistory|useHashLocation)\b|hashchange/.test(source)) return false;
  let file;
  try {
    file = parseTemplateSource(source, {errorRecovery: true, jsx});
  } catch {
    // A module that does not parse and names a hash router may use it.
    return true;
  }
  /** @type {Set<string>} */
  const namespaces = new Set();
  for (const statement of file.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(specifier.local.name);
      else if (specifier.type === 'ImportSpecifier' && HASH_ROUTERS.has(importedName(specifier))) return true;
    }
  }
  let found = false;
  traverseTemplateSource(file, {
    'MemberExpression|JSXMemberExpression'(/** @type {any} */ path) {
      const {object, property, computed} = path.node;
      if (computed || !namespaces.has(object.name) || !HASH_ROUTERS.has(property.name)) return;
      found = true;
      path.stop();
    },
    'CallExpression|AssignmentExpression'(/** @type {any} */ path) {
      if (!listensForHash(path.node)) return;
      found = true;
      path.stop();
    },
  });
  return found;
}

/**
 * Whether an element is one the page's scripts define: a custom element
 * (`<clipboard-copy>`, a tag with a hyphen) or a built-in element given an
 * `is` attribute. Its behavior is code the scan does not read.
 * @param {any} path a JSXElement path
 * @param {string} tag
 */
function scriptedElement(path, tag) {
  return (
    tag.includes('-') ||
    path.node.openingElement.attributes.some(
      (/** @type {any} */ attribute) => attribute.type === 'JSXAttribute' && attributeName(attribute) === 'is',
    )
  );
}

/**
 * Whether an element renders its children in place and acts on no press: an
 * HTML element that holds no control and that no script defines, a Core
 * layout component, a React wrapper, a package's provider, or a context's
 * `Provider`, none of them with a prop that may act on a press.
 * @param {any} path a JSXElement path
 * @param {ScanContext} context
 */
function rendersInPlace(path, context) {
  const target = referent(path, context);
  /** @type {string} */
  let tag = '';
  if (target.kind === 'intrinsic') {
    tag = target.tag;
    if (ACTING_ELEMENTS.has(tag) || scriptedElement(path, tag)) return false;
  } else if (target.kind === 'package') {
    // A provider is trusted only from a package: a module path only a bundler
    // resolves may be the app's own code, which may wrap it in anything.
    const layout =
      (isCore(target.source) && LAYOUT_COMPONENTS.has(target.name)) ||
      (target.source === 'react' && REACT_WRAPPERS.has(target.name)) ||
      (/Provider$/.test(target.name) && context.knownPackage(target.source)) ||
      routesInPlace(path, target);
    if (!layout) return false;
  } else {
    // A context's own Provider (`Theme.Provider`) renders what it holds as it
    // is; a component of the app named like a provider may wrap it in anything,
    // and so may a `Provider` read off a namespace or default import of the
    // app's own module (`UI.Provider` from `import * as UI from './ui'`).
    const name = path.node.openingElement.name;
    if (name.type !== 'JSXMemberExpression' || name.property.name !== 'Provider') return false;
    if (name.object.type !== 'JSXIdentifier') return false;
    const imported = importOf(path.scope.getBinding(name.object.name));
    if (
      imported &&
      (imported.imported === '*' || imported.imported === 'default') &&
      (ownModule(imported.source, context.isOwnCode) || !context.knownPackage(imported.source))
    ) {
      return false;
    }
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
      note ??= placeholderNote(link);
      continue;
    }
    if (name === 'type') {
      if (staticText(attribute.value) !== 'button') return null;
      continue;
    }
    if (name === 'isDisabled' || name === 'isLoading') {
      if (!isFalse(attribute.value)) return null;
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
  // Content the scan cannot read (`{children}`, an element prop that holds a
  // variable or a call) may be a link or a control, as a wrapper passes in.
  const opening = path.node.openingElement;
  for (const attribute of opening.attributes) {
    if (attribute.type !== 'JSXAttribute' || !ELEMENT_PROPS.has(attributeName(attribute))) continue;
    if (attribute.value?.type === 'JSXExpressionContainer' && !plainContent(attribute.value.expression, path, context)) return true;
  }
  for (const child of path.node.children) {
    if (child.type === 'JSXSpreadChild') return true;
    if (child.type === 'JSXExpressionContainer' && !plainContent(child.expression, path, context)) return true;
  }
  let acting = false;
  path.traverse({
    // Content nested in the button's elements (`<Text>{children}</Text>`, a
    // fragment, an element prop's element) may act as its own content may.
    JSXExpressionContainer(/** @type {any} */ inner) {
      if (acting) return;
      const parent = inner.parent;
      const inContent =
        parent.type === 'JSXElement' || parent.type === 'JSXFragment'
          ? parent.children.includes(inner.node)
          : parent.type === 'JSXAttribute' &&
            ELEMENT_PROPS.has(attributeName(parent)) &&
            inner.parentPath.parentPath.parent !== path.node &&
            !glyphProp(inner.parentPath.parentPath.parentPath, attributeName(parent), context);
      if (inContent && !plainContent(inner.node.expression, path, context)) {
        acting = true;
        inner.stop();
      }
    },
    JSXSpreadChild(/** @type {any} */ inner) {
      acting = true;
      inner.stop();
    },
    JSXElement(/** @type {any} */ inner) {
      if (acting) return;
      const target = referent(inner, context);
      if (target.kind === 'intrinsic' && (ACTING_ELEMENTS.has(target.tag) || scriptedElement(inner, target.tag))) {
        acting = true;
      }
      // Only Core's components and icons (a package export named like
      // `PencilIcon`) are read as plain content: another package's, such as a
      // router's `Link`, may act on a press.
      if (target.kind === 'own' || target.kind === 'local' || target.kind === 'other') acting = true;
      if (target.kind === 'package' && !isCore(target.source) && !ICON_EXPORT_NAME_RE.test(target.name.split('.').pop() ?? '')) {
        acting = true;
      }
      if (inner.node.openingElement.attributes.some((/** @type {any} */ a) => actsOnPress(a, ''))) {
        acting = true;
      }
      if (acting) inner.stop();
    },
  });
  return acting;
}

/** The props of a button that hold content: what it shows beside its label. */
const ELEMENT_PROPS = new Set(['children', 'endContent', 'icon']);

/** Core components whose named props take a glyph (an icon name or component), never content. */
const CORE_GLYPH_PROPS = new Map([['Icon', new Set(['icon'])]]);

/**
 * Whether a prop of an element in a button's content takes a glyph: Core
 * `Icon`'s `icon`, which nothing can press.
 * @param {any} elementPath a JSXElement path
 * @param {string} prop
 * @param {ScanContext} context
 */
function glyphProp(elementPath, prop, context) {
  const target = referent(elementPath, context);
  return target.kind === 'package' && isCore(target.source) && CORE_GLYPH_PROPS.get(target.name.split('.').pop() ?? '')?.has(prop) === true;
}

/**
 * Whether an expression in a button's content is plain content the scan can
 * read: text, a number, nothing, an element (its own elements are read on
 * their own), an icon a package exports (`PencilIcon`), or a choice between
 * such content.
 * @param {any} expression
 * @param {any} path the button's JSXElement path
 * @param {ScanContext} context
 * @returns {boolean}
 */
function plainContent(expression, path, context) {
  switch (expression?.type) {
    case 'JSXEmptyExpression':
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'TemplateLiteral':
    case 'JSXElement':
    case 'JSXFragment':
      return true;
    case 'Identifier': {
      if (expression.name === 'undefined') return true;
      const imported = importOf(path.scope.getBinding(expression.name));
      return imported != null && !ownModule(imported.source, context.isOwnCode) && ICON_EXPORT_NAME_RE.test(imported.imported);
    }
    case 'ConditionalExpression':
      return plainContent(expression.consequent, path, context) && plainContent(expression.alternate, path, context);
    case 'LogicalExpression':
      // `a && b` renders `b` or nothing; `a || b` and `a ?? b` may render `a`.
      return (expression.operator === '&&' || plainContent(expression.left, path, context)) && plainContent(expression.right, path, context);
    default:
      return false;
  }
}

/**
 * @typedef {object} ButtonUse
 * @property {number} line
 * @property {number} column
 * @property {'Button' | 'IconButton'} component
 * @property {string | null} label
 * @property {string | null} note the prop that does nothing, such as
 *   `empty onClick` or `placeholder link: replace \`#\` with a real href`;
 *   null when the button has no action prop
 * @property {Placement} placement
 */

/**
 * @typedef {object} ComponentUse A component of the app's own code that the
 *   module renders, or refers to in a way the scan cannot follow (then its
 *   placement is `blocked`).
 * @property {string | null} local the component of this module it names, or
 *   null for one that may come from another module
 * @property {string[]} names the names that component may go by elsewhere
 * @property {string | null} [module] the name of a module whose every export
 *   it may render, as a `lazy(() => import('./Hero'))` does
 * @property {Placement} placement
 */

/**
 * @typedef {object} ModuleScan
 * @property {ButtonUse[]} buttons the Core buttons in the module that show no
 *   action of their own, each with where it is rendered
 * @property {ComponentUse[]} uses
 * @property {Map<string, string[]>} exports each component the module
 *   exports, by its name in the module, with the names it goes by elsewhere
 * @property {string | null} stem the module's name as another module imports it
 * @property {string[]} reexports the names of the modules whose exports this
 *   module passes on under the same names, as a barrel `index` does
 * @property {string[]} loads the folders, relative to the module, that it
 *   loads modules from by a path the scan cannot read (a computed `import()`
 *   or `require()`, `import.meta.glob`, `require.context`); `*` when the
 *   folder is not a plain relative path, so it may load any module
 */

/**
 * Whether a reference to a component is the name of an element that renders
 * it, as in `<Hero />` or `<Sections.Hero />`.
 * @param {any} ref
 */
function isElementName(ref) {
  let top = ref;
  while (top.parentPath?.isJSXMemberExpression() && top.key === 'object') top = top.parentPath;
  return Boolean(top.parentPath?.isJSXOpeningElement() || top.parentPath?.isJSXClosingElement());
}

/**
 * Whether a reference to a component only exports it or names its type, so
 * it renders nothing.
 * @param {any} ref
 */
function rendersNothing(ref) {
  // An exported declaration is a reference of its own binding.
  if (ref.isExportDeclaration()) return true;
  const parent = ref.parentPath;
  if (parent?.isExportSpecifier() || parent?.isExportDefaultDeclaration()) return true;
  return Boolean(
    ref.findParent(
      (/** @type {any} */ p) =>
        /^TS/.test(p.node.type) && !/^TS(As|Satisfies|NonNull|Instantiation)Expression$|^TSTypeAssertion$/.test(p.node.type),
    ),
  );
}

/**
 * Whether a binding is referred to anywhere except as the name of an element
 * or in an export: in a list, as a value, through `lazy`, and so on. The scan
 * cannot follow where such a reference renders the component.
 * @param {any} binding
 */
function referredToElsewhere(binding) {
  return (binding?.referencePaths ?? []).some(
    (/** @type {any} */ ref) => !isElementName(ref) && !rendersNothing(ref),
  );
}

/**
 * Whether a module path is the app's own code: a relative path or a path alias.
 * @param {string} specifier
 * @param {(specifier: string) => boolean} isOwnCode
 */
function ownModule(specifier, isOwnCode) {
  // A `#` specifier is a package.json `imports` entry: the package's own code.
  return /^\.{1,2}(\/|$)|^#/.test(specifier) || isOwnCode(specifier);
}

/**
 * Read one module of the app's own source: its Core buttons that show no
 * action of their own, the components of the app it renders, and the
 * components it exports. Null when the module does not parse.
 * @param {string} source
 * @param {{isOwnCode: (specifier: string) => boolean, stem: string | null, hashRouting?: boolean, knownPackage?: (specifier: string) => boolean, jsx?: boolean, stemOf?: (specifier: string) => string | null}} options
 *   `isOwnCode` tells a path alias from a package; `stem` is the module's
 *   name as another module imports it (its file name, or its folder's for an
 *   `index` file); `hashRouting` says the app routes by the URL hash, so a
 *   `#` link opens its first page; `knownPackage` tells a package from a
 *   module path only a bundler resolves (`~/Hero`), whose imports the scan
 *   cannot follow (by default, every bare module path is a package); `jsx:
 *   false` reads a plain TypeScript module (`.ts`)
 * @returns {ModuleScan | null}
 *   `stemOf` names the module an import path reads, `.` and `..` included
 *   (the default reads the path alone)
 */
export function scanButtonActions(source, {isOwnCode, stem, hashRouting = false, knownPackage = () => true, jsx = true, stemOf = specifierStem}) {
  /** @type {any} */
  let file;
  try {
    file = parseTemplateSource(source, {jsx});
  } catch {
    return null;
  }
  /** @type {ScanContext} */
  const context = {isOwnCode, hashRouting, knownPackage, stemOf};
  const mayBeOwn = (/** @type {string} */ specifier) => ownModule(specifier, isOwnCode) || !knownPackage(specifier);
  /** @type {ButtonUse[]} */
  const buttons = [];
  /** @type {ComponentUse[]} */
  const uses = [];
  /** @type {Map<string, string[]>} */
  const exports = new Map();
  /** @type {string[]} */
  const reexports = [];
  /** @type {Set<string>} */
  const loads = new Set();
  // A load by a path the scan can read names the module it loads; one by a
  // path it cannot read may load any module in the folder the path starts in.
  const loadFrom = (/** @type {any} */ source) => {
    const written = writtenString(source);
    if (written != null) {
      if (mayBeOwn(written)) uses.push({local: null, names: [], module: stemOf(written), placement: 'blocked'});
      return;
    }
    // A path joined with `+` starts with its first part.
    let start = source;
    while (start?.type === 'BinaryExpression' && start.operator === '+') start = start.left;
    if (start !== source && writtenString(start) != null) {
      const prefix = /** @type {string} */ (writtenString(start));
      if (prefix === '' || /^\.{0,2}\//.test(prefix)) loads.add(loadFolder(prefix));
      else if (mayBeOwn(prefix)) loads.add('*');
      return;
    }
    if (source?.type === 'TemplateLiteral') {
      const prefix = source.quasis[0]?.value.cooked ?? '';
      if (prefix === '' || /^\.{0,2}\//.test(prefix)) loads.add(loadFolder(prefix));
      else if (mayBeOwn(prefix)) loads.add('*');
      return;
    }
    if (source != null) loads.add('./');
  };
  // An export of a binding the module imports from the app's own code passes
  // that module's export on: under the same name, as a barrel does; under
  // another name, or for a default or namespace import, the scan cannot
  // match it to the component.
  const passOn = (/** @type {any} */ path, /** @type {string} */ local, /** @type {string} */ exported) => {
    const imported = importOf(path.scope.getBinding(local));
    if (!imported || imported.typeOnly || !mayBeOwn(imported.source)) return;
    const fromStem = stemOf(imported.source);
    if (imported.imported === '*' || imported.imported === 'default') {
      uses.push({local: null, names: fromStem ? [fromStem] : [], module: fromStem, placement: 'blocked'});
    } else if (exported === imported.imported) {
      if (fromStem && !reexports.includes(fromStem)) reexports.push(fromStem);
    } else {
      uses.push({local: null, names: [imported.imported], placement: 'blocked'});
    }
  };
  const exportAs = (/** @type {string} */ local, /** @type {string} */ name) => {
    const names = exports.get(local) ?? [];
    if (!names.includes(name)) names.push(name);
    exports.set(local, names);
  };
  traverseTemplateSource(file, {
    JSXElement(/** @type {any} */ path) {
      const target = referent(path, context);
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
    ImportDeclaration(/** @type {any} */ path) {
      const from = path.node.source.value;
      if (path.node.importKind === 'type') return;
      // A module path only a bundler resolves may be the app's own code, so
      // every component it imports may render anywhere.
      const unresolved = !ownModule(from, isOwnCode) && !knownPackage(from);
      if (!unresolved && !ownModule(from, isOwnCode)) return;
      for (const specifier of path.node.specifiers) {
        if (specifier.importKind === 'type') continue;
        if (!unresolved && !referredToElsewhere(path.scope.getBinding(specifier.local.name))) continue;
        const imported = importOf(path.scope.getBinding(specifier.local.name))?.imported ?? '*';
        const fromStem = stemOf(from);
        uses.push(
          imported === '*'
            ? {local: null, names: [], module: fromStem, placement: 'blocked'}
            : {
                local: null,
                names: imported === 'default' ? [specifier.local.name, ...(fromStem ? [fromStem] : [])] : [imported],
                placement: 'blocked',
              },
        );
      }
    },
    CallExpression(/** @type {any} */ path) {
      const {callee, arguments: args} = path.node;
      const [specifier] = args;
      if (callee.type === 'Import' || (callee.type === 'Identifier' && callee.name === 'require' && !path.scope.getBinding('require'))) {
        loadFrom(specifier);
      } else if (isImportMetaGlob(callee)) {
        const patterns = specifier?.type === 'ArrayExpression' ? specifier.elements : [specifier];
        for (const pattern of patterns) {
          const text = writtenString(pattern);
          if (text == null) loads.add('./');
          else if (!text.startsWith('!') && !NOT_A_MODULE.test(text)) loads.add(loadFolder(text.slice(0, text.search(/[*?{[]|$/))));
        }
      } else if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' && callee.object.name === 'require' && callee.property.name === 'context') {
        const folder = writtenString(specifier);
        loads.add(folder == null ? './' : loadFolder(folder.endsWith('/') ? folder : `${folder}/`));
      }
    },
    ImportExpression(/** @type {any} */ path) {
      loadFrom(path.node.source);
    },
    TSImportEqualsDeclaration(/** @type {any} */ path) {
      const reference = path.node.moduleReference;
      if (reference.type === 'TSExternalModuleReference') loadFrom(reference.expression);
    },
    Program: {
      exit(/** @type {any} */ path) {
        // A component in any scope, a nested one included, that the module
        // refers to other than by rendering it may be rendered anywhere.
        const scopes = new Set([path.scope]);
        path.traverse({
          Scopable(/** @type {any} */ inner) {
            scopes.add(inner.scope);
          },
        });
        for (const scope of scopes) {
          for (const [name, binding] of Object.entries(scope.bindings)) {
            if (isComponentDeclaration(binding) && referredToElsewhere(binding)) {
              uses.push({local: name, names: [name], placement: 'blocked'});
            }
          }
        }
      },
    },
    ExportAllDeclaration(/** @type {any} */ path) {
      const from = path.node.source.value;
      if (!mayBeOwn(from)) return;
      const fromStem = stemOf(from);
      if (path.node.exported) {
        uses.push({local: null, names: [], module: fromStem, placement: 'blocked'});
      } else if (fromStem && !reexports.includes(fromStem)) {
        reexports.push(fromStem);
      }
    },
    ExportDefaultDeclaration(/** @type {any} */ path) {
      const declaration = path.node.declaration;
      const aliases = ['default', ...(stem ? [stem] : [])];
      /** @type {string | null} */
      let local = null;
      if (declaration.type === 'FunctionDeclaration') local = declaration.id?.name ?? 'default';
      else if (declaration.type === 'Identifier') {
        local = declaration.name;
        passOn(path, declaration.name, 'default');
      }
      else if (wrappedFunction(declaration)) local = 'default';
      if (local == null) return;
      for (const alias of [local, ...aliases]) exportAs(local, alias);
    },
    ExportNamedDeclaration(/** @type {any} */ path) {
      const {declaration, specifiers, source: from} = path.node;
      if (from) {
        // A re-export under another name, or of a module's default export,
        // goes by a name the scan cannot match to the component.
        if (!mayBeOwn(from.value)) return;
        const fromStem = stemOf(from.value);
        if (fromStem && !reexports.includes(fromStem)) reexports.push(fromStem);
        for (const specifier of specifiers ?? []) {
          if (specifier.type === 'ExportNamespaceSpecifier') {
            uses.push({local: null, names: [], module: fromStem, placement: 'blocked'});
            continue;
          }
          if (specifier.type !== 'ExportSpecifier') continue;
          const local = specifier.local.type === 'StringLiteral' ? specifier.local.value : specifier.local.name;
          const exported =
            specifier.exported.type === 'StringLiteral' ? specifier.exported.value : specifier.exported.name;
          if (local === 'default') {
            uses.push({local: null, names: fromStem ? [fromStem] : [], module: fromStem, placement: 'blocked'});
          } else if (exported !== local) {
            uses.push({local: null, names: [local], placement: 'blocked'});
          }
        }
        return;
      }
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
        passOn(path, specifier.local.name, exported);
        exportAs(specifier.local.name, exported);
        if (exported === 'default' && stem) exportAs(specifier.local.name, stem);
      }
    },
  });
  return {buttons, uses, exports, stem, reexports, loads: [...loads]};
}

/** A glob pattern for files that hold no component: data, styles or images. */
const NOT_A_MODULE = /\.(?:json|css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|txt|ya?ml|md)$/;

/**
 * Whether a callee is Vite's `import.meta.glob` (or `globEager`).
 * @param {any} callee
 */
function isImportMetaGlob(callee) {
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'MetaProperty' &&
    callee.object.meta.name === 'import' &&
    callee.object.property.name === 'meta' &&
    (callee.property.name === 'glob' || callee.property.name === 'globEager')
  );
}

/**
 * The folder a load path starts in: the part of a relative or root path
 * (`/src/…`, from the project folder) up to its last `/`; the loading
 * module's own folder (`./`) for a path the scan reads none of, as a bundler
 * loads it; or `*` for a path alias or other bare path.
 * @param {string} prefix the part of the path before what the scan cannot read
 */
export function loadFolder(prefix) {
  if (prefix === '') return './';
  if (!/^\.{0,2}\//.test(prefix)) return '*';
  return prefix.slice(0, prefix.lastIndexOf('/') + 1);
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
 * @param {boolean} [app.complete] false when the scan did not list every
 *   module of the app; then no component counts as one that nothing renders
 * @param {(file: string) => boolean} [app.loaded] whether a module may load
 *   the file by a path the scan cannot read; then its components may be
 *   rendered anywhere
 * @returns {ButtonFinding[]}
 */
export function buttonsWithoutAction({files, scan, modulesNaming, complete = true, loaded = () => false}) {
  /** @type {Map<string, boolean>} */
  const known = new Map();
  /** @type {Set<string>} */
  const visiting = new Set();

  /**
   * A module's name and the names of the modules that pass its exports on,
   * through barrels of barrels: a module that loads any of them may render
   * any of its components.
   * @param {string} stem
   */
  const passedOnBy = stem => {
    const found = new Set([stem]);
    /** @type {string[]} */
    const barrels = [];
    const queue = [stem];
    while (queue.length > 0) {
      const next = /** @type {string} */ (queue.shift());
      for (const other of modulesNaming([next])) {
        const barrel = scan(other);
        if (barrel?.stem && barrel.reexports.includes(next) && !found.has(barrel.stem)) {
          found.add(barrel.stem);
          barrels.push(other);
          queue.push(barrel.stem);
        }
      }
    }
    return {stems: found, barrels};
  };

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
    const shared = names.filter(name => name !== 'default');
    const passed = names.length > 0 && own?.stem ? passedOnBy(own.stem) : {stems: new Set(), barrels: []};
    const moduleNames = passed.stems;
    // A module that may be loaded by a path the scan cannot read, or a barrel
    // that passes the component on and may be, may render it anywhere.
    /** @type {Array<{file: string, placement: Placement}>} */
    const places = loaded(file) || passed.barrels.some(loaded) ? [{file, placement: 'blocked'}] : [];
    for (const use of own?.uses ?? []) {
      const here =
        use.local === component ||
        (use.local == null && use.names.some(name => name === component || names.includes(name)));
      if (here && !sameComponent(use.placement, component)) places.push({file, placement: use.placement});
    }
    const lookFor = [...new Set([...shared, ...moduleNames])];
    if (lookFor.length > 0) {
      for (const other of modulesNaming(lookFor)) {
        if (other === file) continue;
        const read = scan(other);
        // A module that names the component but cannot be read may render
        // it anywhere.
        if (read == null) {
          places.push({file: other, placement: 'blocked'});
          continue;
        }
        for (const use of read.uses) {
          const byName = use.local == null && use.names.some(name => shared.includes(name));
          const byModule = use.module != null && moduleNames.has(use.module);
          if (byName || byModule) places.push({file: other, placement: use.placement});
        }
      }
    }
    const result =
      places.length === 0
        ? complete && names.length > 0
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
