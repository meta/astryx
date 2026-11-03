// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file migrate-touch-trigger-tap-to-trigger-behavior.mjs
 * @input A source file's Tooltip and HoverCard elements and its useTooltip and
 *   useHoverCard calls
 * @output A codemod that moves `touchTrigger` to `triggerBehavior` where the
 *   result is provably the same, and leaves a TODO everywhere else
 * @position `next` upgrade transform; uses `transformProp` and `outcome.mjs`
 *
 * `touchTrigger="tap"` becomes `triggerBehavior="toggle"` only on an inert icon
 * or span trigger, which keeps tap-only opening. A static `"auto"` goes, and a
 * static `"none"` becomes `triggerBehavior="hover"`. A site it cannot prove
 * keeps its prop and gets a TODO, added once and reported on every run.
 */

import {ManualMigrationRequired} from '../../outcome.mjs';
import {
  importedComponents,
  isModuleBinding,
  resolveImportedComponent,
  transformProp,
} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate touchTrigger="tap" to triggerBehavior="toggle"',
  description:
    'Replaces the deprecated `touchTrigger="tap"` on Tooltip and HoverCard ' +
    'with `triggerBehavior="toggle"` where the trigger is a plain icon or span ' +
    '(no role, tabIndex, event handler, or spread props), ' +
    'removes a static `touchTrigger="auto"` and rewrites a static ' +
    '`touchTrigger="none"` to `triggerBehavior="hover"` where no props are ' +
    'spread. ' +
    'Leaves a TODO with the ' +
    'manual migration on every other tap site (a button, a link, a trigger ' +
    'whose layer repeats its own text, a useTooltip or useHoverCard options ' +
    'object, an element it cannot identify), where the value is computed, ' +
    'where an explicit adaptive or computed triggerBehavior is also set, and where ' +
    'props are spread, a static toggle there included.',
};

const OLD_NAME = 'touchTrigger';
const NEW_NAME = 'triggerBehavior';
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
  'triggerBehavior="toggle" where it is "tap", triggerBehavior="hover" where ' +
  'it is "none", and drop touchTrigger where it is "auto". ';
const BEHAVIOR_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="tap" is deprecated (DEP-0016), but ' +
  'an explicit triggerBehavior="adaptive" or a computed one is also set here, under which touchTrigger still decides taps, so it was ' +
  'left unchanged. Decide which one this layer needs by hand. ';
const NONE_BEHAVIOR_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="none" becomes ' +
  'triggerBehavior="hover" before touchTrigger is removed (DEP-0016), but a ' +
  'computed triggerBehavior is also set here, under which touchTrigger still ' +
  'decides taps where it is "adaptive", so it was left unchanged. Pass ' +
  'triggerBehavior="hover" where it is "adaptive", by hand. ';
const HAND_MIGRATION =
  'Migrate it by hand: pass triggerBehavior="toggle" when the trigger\'s ' +
  'only job is this layer; remove tap and keep the default adaptive when ' +
  "the trigger's accessible name already carries the layer's text; " +
  'otherwise move the information to an adjacent InfoTip or the visible ' +
  'label, then remove tap. Or keep tap until the next minor. ';
const TRIGGER_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="tap" is deprecated (DEP-0016). This ' +
  'trigger is not a plain icon or span (a button, a link, an element with a ' +
  'role, tabIndex, event handler, or spread props, a trigger whose layer ' +
  'repeats its own text, or an element the codemod cannot identify), ' +
  'and there triggerBehavior="toggle" changes what a click, Enter, or Space ' +
  'does, so it was left unchanged. ' +
  HAND_MIGRATION;
const HOOK_COMMENT =
  " TODO(astryx upgrade): touchTrigger: 'tap' is deprecated (DEP-0016). The " +
  'trigger this hook wires is not visible here, so it was left unchanged. ' +
  "On an icon or span trigger, pass triggerBehavior: 'toggle'. " +
  HAND_MIGRATION;
const DYNAMIC_HOOK_COMMENT =
  " TODO(astryx upgrade): touchTrigger: 'tap' is deprecated (DEP-0016). " +
  'These options are not written at the call, so the codemod could not ' +
  "check them. If they pass touchTrigger: 'tap', on an icon or span trigger " +
  "pass triggerBehavior: 'toggle'. " +
  HAND_MIGRATION;
const DYNAMIC_SPREAD_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="tap" is deprecated (DEP-0016). These ' +
  'props are spread, so the codemod could not check them. If they pass ' +
  'touchTrigger="tap", on an icon or span trigger pass ' +
  'triggerBehavior="toggle". ' +
  HAND_MIGRATION;
const DYNAMIC_OPTIONS_COMMENT =
  " TODO(astryx upgrade): touchTrigger: 'tap' is deprecated (DEP-0016). " +
  'Some of these options are spread or computed, so the codemod could not ' +
  "check them. If they pass touchTrigger: 'tap', on an icon or span trigger " +
  "pass triggerBehavior: 'toggle'. " +
  HAND_MIGRATION;
const NONE_SPREAD_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="none" becomes ' +
  'triggerBehavior="hover" before touchTrigger is removed (DEP-0016), but ' +
  'props are also spread here and may set touchTrigger or triggerBehavior, so ' +
  'it was left unchanged. Pass triggerBehavior="hover" by hand. ';
const SPREAD_COMMENT =
  ' TODO(astryx upgrade): touchTrigger="tap" is deprecated (DEP-0016), but ' +
  'props are also spread here and may set touchTrigger or triggerBehavior, so ' +
  'it was left unchanged. On an icon or span trigger, pass ' +
  'triggerBehavior="toggle". ' +
  HAND_MIGRATION;

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
 * Whether an element carries nothing that makes it act or take focus: no
 * `role`, `tabIndex`, `contentEditable`, event handler, or spread props. The
 * toggle pins a `role="button"` trigger, so such an element would not keep
 * `tap`'s behavior; it migrates by hand.
 * @param {any} opening a JSXOpeningElement
 */
function isInert(opening) {
  return opening.attributes.every((/** @type {any} */ a) => {
    if (a.type !== 'JSXAttribute' || a.name?.type !== 'JSXIdentifier') {
      return false;
    }
    const name = a.name.name;
    return (
      name !== 'role' &&
      name !== 'tabIndex' &&
      name !== 'contentEditable' &&
      !/^on[A-Z]/.test(name)
    );
  });
}

/**
 * Whether an element and everything inside it are inert markup: elements that
 * pass `isInert`, and whitespace or static text between them.
 * @param {any} element a JSXElement
 */
function isInertTree(element) {
  if (!isInert(element.openingElement)) {
    return false;
  }
  return element.children.every((/** @type {any} */ child) => {
    if (child.type === 'JSXText') {
      return true;
    }
    if (child.type === 'JSXElement') {
      return isInertTree(child);
    }
    return (
      child.type === 'JSXExpressionContainer' &&
      (child.expression.type === 'JSXEmptyExpression' ||
        staticString(child.expression) != null)
    );
  });
}

/**
 * The text a JSX child list shows when every child is inert and plain. Plain
 * means text, a static string, a plain tag, or an Astryx `Icon` (no text).
 * Null otherwise.
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
      if (name.type !== 'JSXIdentifier' || !isInert(child.openingElement)) {
        return null;
      }
      if (icons.has(name.name)) {
        if (!isInertTree(child)) {
          return null;
        }
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
 * `triggerBehavior="toggle"`: its trigger is statically a non-interactive icon
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
      return isInertTree(child);
    }
    if (name.name !== 'span' || !isInert(child.openingElement)) {
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
  // The toggle pins a trigger whose layer repeats its own visible text on a
  // click, so such a trigger migrates by hand.
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

/** Whether a JSX attribute's static value is `none`. @param {any} attribute */
function isNone(attribute) {
  return staticString(attributeValue(attribute)) === 'none';
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
 * Marks a site the codemod leaves for a person. It adds a TODO on the node
 * once. It reports the same note, with its line, to the upgrade's
 * manual-migration list on every run. Returns whether the source changed.
 * @param {any} j @param {any} api @param {any} node @param {string} text
 */
function leaveForPerson(j, api, node, text) {
  api.report?.(
    new ManualMigrationRequired(
      text.trim().replace(/^TODO\(astryx upgrade\): /, ''),
      {line: node.loc?.start?.line ?? null},
    ),
  );
  return addComment(j, node, text);
}

/**
 * What to do with one `touchTrigger`. It takes the static value, the static
 * `triggerBehavior` beside it (undefined when absent, null when computed), and
 * whether props spread beside it. `spreadsAfter` says whether a spread follows
 * it. `hover` means: the layer takes `triggerBehavior="hover"` and loses
 * `touchTrigger`.
 * @param {string | null} value
 * @param {string | null | undefined} behavior
 * @param {boolean} spreads
 * @param {boolean} spreadsAfter
 * @returns {'rewrite' | 'hover' | 'remove' | 'keep' | 'value' | 'behavior' | 'spread'}
 */
function decide(value, behavior, spreads, spreadsAfter) {
  // Spread props may set touchTrigger or triggerBehavior, even over a static
  // toggle, so no rewrite or removal here is provably the same. `auto`, the
  // default, stays as it is when it follows every spread. A later spread can
  // carry `tap`, so that site and any other value are left for a person.
  if (spreads) {
    return value === 'auto' && !spreadsAfter ? 'keep' : 'spread';
  }
  // `hover` and `toggle` ignore `touchTrigger`, so beside them it is dead.
  if (behavior === 'hover' || behavior === 'toggle') {
    return 'remove';
  }
  if (value == null) {
    return 'value';
  }
  if (value === 'auto') {
    return 'remove';
  }
  // `none` decides taps only under `adaptive`, where `hover` keeps it: no
  // touch or pen tap opens the layer, and no press pins it.
  if (value === 'none') {
    return behavior === undefined || behavior === 'adaptive'
      ? 'hover'
      : 'behavior';
  }
  if (behavior !== undefined) {
    return 'behavior';
  }
  return value === 'tap' ? 'rewrite' : 'keep';
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
      const behavior =
        pressAttribute == null
          ? undefined
          : staticString(attributeValue(pressAttribute));
      switch (
        decide(
          staticString(attributeValue(attribute)),
          behavior,
          spreads,
          attributes
            .slice(attributes.indexOf(attribute) + 1)
            .some((/** @type {any} */ a) => a.type === 'JSXSpreadAttribute'),
        )
      ) {
        case 'rewrite': {
          const element = propPath.parent?.parent?.node;
          if (
            element?.type !== 'JSXElement' ||
            !isPlainIconOrSpan(element, icons)
          ) {
            hasChanges =
              leaveForPerson(j, api, attribute, TRIGGER_COMMENT) || hasChanges;
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
        case 'hover':
          if (pressAttribute == null) {
            attribute.name.name = NEW_NAME;
            attribute.value = j.stringLiteral('hover');
          } else {
            pressAttribute.value = j.stringLiteral('hover');
            removals.push({opening, attribute});
          }
          hasChanges = true;
          return;
        case 'remove':
          removals.push({opening, attribute});
          return;
        case 'value':
          hasChanges =
            leaveForPerson(j, api, attribute, VALUE_COMMENT) || hasChanges;
          return;
        case 'behavior':
          hasChanges =
            leaveForPerson(
              j,
              api,
              attribute,
              isNone(attribute) ? NONE_BEHAVIOR_COMMENT : BEHAVIOR_COMMENT,
            ) || hasChanges;
          return;
        case 'spread':
          hasChanges =
            leaveForPerson(
              j,
              api,
              attribute,
              isNone(attribute) ? NONE_SPREAD_COMMENT : SPREAD_COMMENT,
            ) || hasChanges;
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

  // A Tooltip or HoverCard with spread props and no touchTrigger of its own
  // may still receive one through the spread.
  const layers = importedComponents(root, j, {
    matchesImport,
    components: COMPONENT_PROPS,
  });
  root.find(j.JSXOpeningElement).forEach((/** @type {any} */ openingPath) => {
    const opening = openingPath.node;
    if (resolveImportedComponent(opening.name, openingPath, layers) == null) {
      return;
    }
    const attributes = opening.attributes ?? [];
    const spread = attributes.find(
      (/** @type {any} */ a) => a.type === 'JSXSpreadAttribute',
    );
    const hasOwn = attributes.some(
      (/** @type {any} */ a) =>
        a.type === 'JSXAttribute' && a.name?.name === OLD_NAME,
    );
    if (spread != null && !hasOwn) {
      hasChanges =
        leaveForPerson(j, api, spread, DYNAMIC_SPREAD_COMMENT) || hasChanges;
    }
  });

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
      if (!isHook || options == null) {
        return;
      }
      if (options.type !== 'ObjectExpression') {
        hasChanges =
          leaveForPerson(j, api, callPath.node, DYNAMIC_HOOK_COMMENT) ||
          hasChanges;
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
        // A spread or computed key may still carry touchTrigger.
        const unknown = properties.find(
          (/** @type {any} */ p) =>
            p.type === 'SpreadElement' ||
            p.type === 'SpreadProperty' ||
            p.computed === true,
        );
        if (unknown != null) {
          hasChanges =
            leaveForPerson(j, api, unknown, DYNAMIC_OPTIONS_COMMENT) ||
            hasChanges;
        }
        return;
      }
      const pressProperty = properties.find(
        (/** @type {any} */ p) => keyOf(p) === NEW_NAME,
      );
      const behavior =
        pressProperty == null ? undefined : staticString(pressProperty.value);
      const spreads = properties.some(
        (/** @type {any} */ p) =>
          p.type === 'SpreadElement' || p.type === 'SpreadProperty',
      );
      const spreadsAfter = properties
        .slice(properties.indexOf(touch) + 1)
        .some(
          (/** @type {any} */ p) =>
            p.type === 'SpreadElement' || p.type === 'SpreadProperty',
        );
      switch (
        decide(staticString(touch.value), behavior, spreads, spreadsAfter)
      ) {
        case 'rewrite':
          // The trigger element is not visible at the hook's call.
          hasChanges =
            leaveForPerson(j, api, touch, HOOK_COMMENT) || hasChanges;
          return;
        case 'hover':
          if (pressProperty == null) {
            touch.key = j.identifier(NEW_NAME);
            touch.value = j.stringLiteral('hover');
            touch.shorthand = false;
          } else {
            pressProperty.value = j.stringLiteral('hover');
            options.properties = properties.filter(
              (/** @type {any} */ p) => p !== touch,
            );
          }
          hasChanges = true;
          return;
        case 'remove':
          options.properties = properties.filter(
            (/** @type {any} */ p) => p !== touch,
          );
          hasChanges = true;
          return;
        case 'value':
          hasChanges =
            leaveForPerson(j, api, touch, VALUE_COMMENT) || hasChanges;
          return;
        case 'behavior':
          hasChanges =
            leaveForPerson(
              j,
              api,
              touch,
              staticString(touch.value) === 'none'
                ? NONE_BEHAVIOR_COMMENT
                : BEHAVIOR_COMMENT,
            ) || hasChanges;
          return;
        case 'spread':
          hasChanges =
            leaveForPerson(
              j,
              api,
              touch,
              staticString(touch.value) === 'none'
                ? NONE_SPREAD_COMMENT
                : SPREAD_COMMENT,
            ) || hasChanges;
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
