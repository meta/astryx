// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: move Tokenizer's experimental presentation to the stable prop
 *
 * `experimental={{presentation: x}}` on a Tokenizer becomes
 * `presentation={x}`, or `presentation="x"` for a string. Tokenizer no longer
 * reads `experimental`, and `presentation` takes the same values, so the
 * rewrite restores the surface the call selected. Other keys stay in the
 * `experimental` object, and an object left empty is removed. Built on the
 * shared `transformProp` helper, so it does not follow variables, helpers,
 * wrappers, or types. Where it cannot prove the result it leaves the call
 * unchanged with a TODO: an `experimental` value that is not an object
 * literal, a spread or computed key in it, a Tokenizer that already passes
 * `presentation`, and a Tokenizer that spreads props. A spread can carry
 * `presentation`, also as `undefined`, and then the result changes with the
 * moved attribute before or after it. Each TODO names its case and is added
 * once, so a second run changes nothing.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: "Move Tokenizer's removed experimental presentation to presentation",
  description:
    'Rewrites `experimental={{presentation: x}}` on Tokenizer to ' +
    '`presentation={x}`; Tokenizer no longer reads `experimental`. Leaves a ' +
    'TODO where the experimental value is not an object literal, where the ' +
    'Tokenizer already passes presentation, and where it spreads props.',
};

const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;
const COMPONENT_PROPS = new Map([['Tokenizer', new Set(['experimental'])]]);

const TODO_PREFIX =
  ' TODO(astryx upgrade): experimental.presentation was removed in favor of ' +
  'presentation. ';
/** @param {string} reason */
const moveTodo = reason =>
  `${TODO_PREFIX}Move the value to presentation; the codemod left this one ` +
  `unchanged because ${reason}. `;
/** One TODO per case, so the reader knows what to check. */
const TODOS = {
  notLiteral: moveTodo('the value is not a literal object'),
  unprovenKey: moveTodo('the object has a spread or a computed key'),
  repeatedKey: moveTodo('the object sets presentation more than once'),
  presentationSet: `${TODO_PREFIX}presentation is already set; remove experimental.presentation. `,
  spread: moveTodo('a spread may also set presentation'),
};

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

/** The static key of an object entry, or null. @param {any} entry */
function keyName(entry) {
  if (
    (entry.type !== 'ObjectProperty' && entry.type !== 'Property') ||
    entry.computed
  ) {
    return null;
  }
  const key = entry.key;
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
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

  transformProp(
    root,
    j,
    {
      matchesImport: source => CORE_IMPORT_RE.test(source),
      components: COMPONENT_PROPS,
    },
    propPath => {
      const opening = propPath.parent?.node;
      const attributes = opening?.attributes ?? [];
      const prop = propPath.node;
      const value =
        prop.value?.type === 'JSXExpressionContainer'
          ? unwrap(prop.value.expression)
          : null;
      const entries =
        value?.type === 'ObjectExpression' ? value.properties : [];
      const presentationEntries = entries.filter(
        (/** @type {any} */ entry) => keyName(entry) === 'presentation',
      );
      const hasUnprovenEntry = entries.some(
        (/** @type {any} */ entry) => keyName(entry) == null,
      );
      if (
        value?.type === 'ObjectExpression' &&
        presentationEntries.length === 0 &&
        !hasUnprovenEntry
      ) {
        return;
      }
      const hasPresentation = attributes.some(
        (/** @type {any} */ a) =>
          a.type === 'JSXAttribute' && a.name?.name === 'presentation',
      );
      const hasSpread = attributes.some(
        (/** @type {any} */ a) => a.type === 'JSXSpreadAttribute',
      );
      const todo =
        value?.type !== 'ObjectExpression'
          ? TODOS.notLiteral
          : hasUnprovenEntry
            ? TODOS.unprovenKey
            : hasPresentation
              ? TODOS.presentationSet
              : presentationEntries.length > 1
                ? TODOS.repeatedKey
                : hasSpread
                  ? TODOS.spread
                  : null;
      if (todo != null) {
        hasChanges = addComment(j, prop, todo) || hasChanges;
        return;
      }

      const entry = presentationEntries[0];
      const entryValue = entry.value;
      const literal = unwrap(entryValue);
      const attributeValue =
        (literal?.type === 'StringLiteral' || literal?.type === 'Literal') &&
        typeof literal.value === 'string'
          ? j.stringLiteral(literal.value)
          : j.jsxExpressionContainer(entryValue);
      const presentation = j.jsxAttribute(
        j.jsxIdentifier('presentation'),
        attributeValue,
      );
      value.properties = entries.filter((/** @type {any} */ e) => e !== entry);
      const index = opening.attributes.indexOf(prop);
      if (value.properties.length === 0) {
        opening.attributes.splice(index, 1, presentation);
      } else {
        opening.attributes.splice(index + 1, 0, presentation);
      }
      hasChanges = true;
    },
  );

  if (!hasChanges) return undefined;
  // `auto` keeps every reprinted string's own quotes and writes the new
  // attribute string in double quotes, as JSX attributes are written.
  return root.toSource({quote: 'auto'});
}
