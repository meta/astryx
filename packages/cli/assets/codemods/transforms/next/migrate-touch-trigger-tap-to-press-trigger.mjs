// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate touchTrigger="tap" to pressTrigger="toggle"
 *
 * DEP-0016 (`component:Tooltip` and `component:HoverCard` DEC-1): the
 * deprecated `touchTrigger="tap"` on `Tooltip` and `HoverCard` becomes
 * `pressTrigger="toggle"` only where the trigger is statically a
 * non-interactive icon or span: an Astryx `Icon` or an `<svg>`, a `<span>` of
 * text and icons, or a lone string the layer wraps in a span. There the result
 * is observably the same, since FR9 keeps a non-button toggle trigger on
 * tap-only opening, as `tap` does. Every other `tap` site keeps its prop and
 * gets a TODO with the manual migration: a button or a link (where the toggle
 * changes what a click, Enter, or Space does), a trigger whose layer repeats
 * its own text, a `useTooltip` or `useHoverCard` options object (its trigger
 * element is not visible here), and any element the codemod cannot identify.
 * A static `touchTrigger="auto"`, the default, is removed. Beside a static
 * `pressTrigger="toggle"`, which wins, any `touchTrigger` is removed.
 *
 * Built on the shared `transformProp` helper for JSX and the same import
 * resolution for the hooks, so it does not follow variables, helpers,
 * wrappers, or types. Where it cannot prove the result it keeps the old prop
 * and leaves a TODO instead of guessing: a computed `touchTrigger`, a
 * `touchTrigger` beside a `pressTrigger` that is not a static `toggle`, an
 * element or options object that also spreads props. `touchTrigger="none"`
 * is unchanged: it is not deprecated. Comments are the codemod's only report
 * channel, and each is added once, so a second run changes nothing.
 */

import {
  importedComponents,
  isModuleBinding,
  transformProp,
} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate touchTrigger="tap" to pressTrigger="toggle"',
  description:
    'Replaces the deprecated `touchTrigger="tap"` on Tooltip and HoverCard ' +
    'with `pressTrigger="toggle"` where the trigger is a plain icon or span, ' +
    'and removes a static `touchTrigger="auto"`. Leaves a TODO with the ' +
    'manual migration on every other tap site (a button, a link, a trigger ' +
    'whose layer repeats its own text, a useTooltip or useHoverCard options ' +
    'object, an element it cannot identify), where the value is computed, ' +
    'where a pressTrigger other than a static toggle is also set, and where ' +
    'props are spread.',
};

const OLD_NAME = 'touchTrigger';
const NEW_NAME = 'pressTrigger';
const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;
const COMPONENT_PROPS = new Map([
  ['Tooltip', new Set([OLD_NAME])],
  ['HoverCard', new Set([OLD_NAME])],
]);
const HOOKS = new Map([
  ['useTooltip', new Set()],
  ['useHoverCard', new Set()],
]);

const VALUE_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="tap" is deprecated (DEP-0016). ' +
  'This value is computed, so it was left unchanged: pass ' +
  'pressTrigger="toggle" where it is "tap", and drop touchTrigger where it ' +
  'is "auto". ';
const PRESS_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="tap" is deprecated (DEP-0016), but ' +
  'a pressTrigger other than a static "toggle" is also set here, so it was ' +
  'left unchanged. Decide which one this layer needs by hand. ';
const TRIGGER_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="tap" is deprecated (DEP-0016). This ' +
  'trigger is not a plain icon or span (a button, a link, a trigger whose ' +
  'layer repeats its own text, or an element the codemod cannot identify), ' +
  'and there pressTrigger="toggle" changes what a click, Enter, or Space ' +
  'does, so it was left unchanged. Migrate it by hand: pressTrigger="toggle" ' +
  'on a button whose only job is this layer; otherwise keep tap until the ' +
  'next minor. ';
const HOOK_COMMENT =
  " TODO(astryx upgrade): touchTrigger: 'tap' is deprecated (DEP-0016). The " +
  'trigger this hook wires is not visible here, so it was left unchanged. ' +
  'On an icon or span trigger, or a button whose only job is this layer, ' +
  "pass pressTrigger: 'toggle'; otherwise keep tap until the next minor. ";
const SPREAD_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="tap" is deprecated (DEP-0016), but ' +
  'props are also spread here and may set touchTrigger or pressTrigger, so ' +
  'it was left unchanged. Pass pressTrigger="toggle" by hand. ';

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

/** Plain markup that an icon or span trigger may hold. */
const PLAIN_TAGS = new Set([
  'span',
  'b',
  'i',
  'em',
  'strong',
  'small',
  'abbr',
  'svg',
  'path',
  'g',
  'circle',
  'rect',
  'use',
]);

/** @param {string} text */
function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The text a JSX child list shows, when every child is plain: text, a static
 * string, a plain tag, or an Astryx `Icon` (no text). Null otherwise.
 * @param {any[]} children
 * @param {Set<string>} icons local names of Core's `Icon`
 * @returns {string | null}
 */
function plainText(children, icons) {
  let text = '';
  for (const child of children) {
    if (child.type === 'JSXText') {
      text += child.value;
    } else if (child.type === 'JSXExpressionContainer') {
      if (child.expression.type === 'JSXEmptyExpression') {
        continue;
      }
      const value = staticString(child.expression);
      if (value == null) {
        return null;
      }
      text += value;
    } else if (child.type === 'JSXElement') {
      const name = child.openingElement.name;
      if (name.type !== 'JSXIdentifier') {
        return null;
      }
      if (icons.has(name.name)) {
        continue;
      }
      if (!PLAIN_TAGS.has(name.name)) {
        return null;
      }
      const inner = plainText(child.children, icons);
      if (inner == null) {
        return null;
      }
      text += inner;
    } else {
      return null;
    }
  }
  return text;
}

/**
 * Whether a `touchTrigger="tap"` on this element may become
 * `pressTrigger="toggle"`: its trigger is statically a non-interactive icon
 * or span whose layer does not repeat its text.
 * @param {any} element the Tooltip or HoverCard JSXElement
 * @param {Set<string>} icons local names of Core's `Icon`
 */
function isPlainIconOrSpan(element, icons) {
  const attributes = element.openingElement.attributes;
  if (
    attributes.some(
      (/** @type {any} */ a) =>
        a.type === 'JSXAttribute' && a.name?.name === 'anchorRef',
    )
  ) {
    return false;
  }
  const children = element.children.filter(
    (/** @type {any} */ c) =>
      !(c.type === 'JSXText' && c.value.trim() === '') &&
      !(
        c.type === 'JSXExpressionContainer' &&
        c.expression.type === 'JSXEmptyExpression'
      ),
  );
  if (children.length !== 1) {
    return false;
  }
  const [child] = children;
  let text;
  if (child.type === 'JSXElement') {
    const name = child.openingElement.name;
    if (name.type !== 'JSXIdentifier') {
      return false;
    }
    if (icons.has(name.name) || name.name === 'svg') {
      return true;
    }
    if (name.name !== 'span') {
      return false;
    }
    text = plainText(child.children, icons);
  } else {
    // A lone string: the layer wraps it in a focusable span.
    text = plainText([child], icons);
  }
  if (text == null) {
    return false;
  }
  const content = attributes.find(
    (/** @type {any} */ a) =>
      a.type === 'JSXAttribute' && a.name?.name === 'content',
  );
  const contentText =
    content == null ? null : staticString(attributeValue(content));
  // A trigger whose layer repeats its own visible text: the toggle would pin
  // it on a click (FR9's exemption), so it migrates by hand.
  return (
    contentText == null ||
    normalizeText(text) === '' ||
    normalizeText(contentText) !== normalizeText(text)
  );
}

/** @param {any} attribute */
function attributeValue(attribute) {
  return attribute.value?.type === 'JSXExpressionContainer'
    ? attribute.value.expression
    : attribute.value;
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
 * What to do with one `touchTrigger`, given its static value, the static
 * `pressTrigger` beside it (undefined when absent, null when computed), and
 * whether props are spread beside it.
 * @param {string | null} value
 * @param {string | null | undefined} press
 * @param {boolean} spreads
 * @returns {'rewrite' | 'remove' | 'keep' | 'value' | 'press' | 'spread'}
 */
function decide(value, press, spreads) {
  if (press === 'toggle') {
    return 'remove';
  }
  if (value === 'none') {
    return 'keep';
  }
  if (spreads) {
    return 'spread';
  }
  if (value == null) {
    return 'value';
  }
  if (press !== undefined) {
    return value === 'auto' ? 'remove' : 'press';
  }
  if (value === 'tap') {
    return 'rewrite';
  }
  if (value === 'auto') {
    return 'remove';
  }
  return 'keep';
}

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  if (!file.source.includes(OLD_NAME)) {
    return undefined;
  }
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;
  const matchesImport = (/** @type {string} */ source) =>
    CORE_IMPORT_RE.test(source);

  // Core's Icon, by local name: an icon trigger.
  /** @type {Set<string>} */
  const icons = new Set();
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ importPath) => {
    const source = importPath.node.source.value;
    if (typeof source !== 'string' || !matchesImport(source)) {
      return;
    }
    for (const specifier of importPath.node.specifiers ?? []) {
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.imported?.name === 'Icon'
      ) {
        icons.add(specifier.local?.name ?? 'Icon');
      }
    }
  });

  // JSX: removals wait until the walk is done, so no attribute is skipped.
  /** @type {Array<{opening: any, attribute: any}>} */
  const removals = [];
  transformProp(
    root,
    j,
    {matchesImport, components: COMPONENT_PROPS},
    (/** @type {any} */ propPath) => {
      const opening = propPath.parent?.node;
      const attributes = opening?.attributes ?? [];
      const attribute = propPath.node;
      const spreads = attributes.some(
        (/** @type {any} */ a) => a.type === 'JSXSpreadAttribute',
      );
      const pressAttribute = attributes.find(
        (/** @type {any} */ a) =>
          a.type === 'JSXAttribute' && a.name?.name === NEW_NAME,
      );
      const press =
        pressAttribute == null
          ? undefined
          : staticString(attributeValue(pressAttribute));
      switch (decide(staticString(attributeValue(attribute)), press, spreads)) {
        case 'rewrite': {
          const element = propPath.parent?.parent?.node;
          if (
            element?.type !== 'JSXElement' ||
            !isPlainIconOrSpan(element, icons)
          ) {
            hasChanges =
              addComment(j, attribute, TRIGGER_COMMENT) || hasChanges;
            return;
          }
          attribute.name.name = NEW_NAME;
          const value = attributeValue(attribute);
          const literal = unwrap(value);
          if (literal?.type === 'TemplateLiteral') {
            attribute.value = j.stringLiteral('toggle');
          } else {
            literal.value = 'toggle';
            if (literal.raw != null) {
              literal.raw = undefined;
            }
            if (literal.extra != null) {
              literal.extra = undefined;
            }
          }
          hasChanges = true;
          return;
        }
        case 'remove':
          removals.push({opening, attribute});
          return;
        case 'value':
          hasChanges = addComment(j, attribute, VALUE_COMMENT) || hasChanges;
          return;
        case 'press':
          hasChanges = addComment(j, attribute, PRESS_COMMENT) || hasChanges;
          return;
        case 'spread':
          hasChanges = addComment(j, attribute, SPREAD_COMMENT) || hasChanges;
          return;
        default:
      }
    },
  );
  for (const {opening, attribute} of removals) {
    opening.attributes = opening.attributes.filter(
      (/** @type {any} */ a) => a !== attribute,
    );
    hasChanges = true;
  }

  // useTooltip and useHoverCard: the options object written at the call.
  const hooks = importedComponents(root, j, {
    matchesImport,
    components: HOOKS,
  });
  if (hooks.direct.size > 0 || hooks.namespaces.size > 0) {
    root.find(j.CallExpression).forEach((/** @type {any} */ callPath) => {
      const callee = callPath.node.callee;
      const isHook =
        (callee.type === 'Identifier' &&
          hooks.direct.has(callee.name) &&
          isModuleBinding(callPath, callee.name)) ||
        (callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          hooks.namespaces.has(callee.object.name) &&
          isModuleBinding(callPath, callee.object.name) &&
          HOOKS.has(callee.property.name));
      const options = unwrap(callPath.node.arguments[0]);
      if (!isHook || options?.type !== 'ObjectExpression') {
        return;
      }
      const properties = options.properties;
      const keyOf = (/** @type {any} */ p) =>
        (p.type === 'ObjectProperty' || p.type === 'Property') && !p.computed
          ? p.key.type === 'Identifier'
            ? p.key.name
            : staticString(p.key)
          : null;
      const touch = properties.find(
        (/** @type {any} */ p) => keyOf(p) === OLD_NAME,
      );
      if (touch == null) {
        return;
      }
      const pressProperty = properties.find(
        (/** @type {any} */ p) => keyOf(p) === NEW_NAME,
      );
      const press =
        pressProperty == null ? undefined : staticString(pressProperty.value);
      const spreads = properties.some(
        (/** @type {any} */ p) =>
          p.type === 'SpreadElement' || p.type === 'SpreadProperty',
      );
      switch (decide(staticString(touch.value), press, spreads)) {
        case 'rewrite':
          // The trigger element is not visible at the hook's call.
          hasChanges = addComment(j, touch, HOOK_COMMENT) || hasChanges;
          return;
        case 'remove':
          options.properties = properties.filter(
            (/** @type {any} */ p) => p !== touch,
          );
          hasChanges = true;
          return;
        case 'value':
          hasChanges = addComment(j, touch, VALUE_COMMENT) || hasChanges;
          return;
        case 'press':
          hasChanges = addComment(j, touch, PRESS_COMMENT) || hasChanges;
          return;
        case 'spread':
          hasChanges = addComment(j, touch, SPREAD_COMMENT) || hasChanges;
          return;
        default:
      }
    });
  }

  if (!hasChanges) {
    return undefined;
  }
  return root.toSource({quote: 'single'});
}
