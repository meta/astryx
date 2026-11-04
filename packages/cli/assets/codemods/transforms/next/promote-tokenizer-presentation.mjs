// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: move Tokenizer's experimental presentation to the stable prop
 *
 * `experimental={{presentation: x}}` on a Tokenizer becomes
 * `presentation={x}`, or `presentation="x"` for a string. Other keys stay in
 * the `experimental` object, and an object left empty is removed. The
 * deprecated spelling selects the same surface, so the result renders the
 * same. Built on the shared `transformProp` helper, so it does not follow
 * variables, helpers, wrappers, or types. Where it cannot prove the result it
 * keeps the deprecated spelling, which still works, and leaves a TODO: an
 * `experimental` value that is not an object literal, a spread or computed
 * key in it, a Tokenizer that already passes `presentation`, and a spread of
 * props after `experimental`, which could set `presentation` over the moved
 * value. A spread before `experimental` is safe: the moved attribute takes
 * `experimental`'s place, so it still wins over the spread, as the
 * experimental value did, and before this release a spread's `presentation`
 * did nothing. Each TODO is added once, so a second run changes
 * nothing.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: "Move Tokenizer's experimental presentation to presentation",
  description:
    'Rewrites `experimental={{presentation: x}}` on Tokenizer to the stable ' +
    '`presentation={x}`. Keeps the deprecated spelling, which still works, ' +
    'with a TODO where the experimental value is not an object literal, ' +
    'where the Tokenizer already passes presentation, and where it spreads ' +
    'props after experimental.',
};

const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;
const COMPONENT_PROPS = new Map([['Tokenizer', new Set(['experimental'])]]);

const TODO_COMMENT =
  ' TODO(astryx upgrade): experimental.presentation is deprecated. Pass ' +
  'presentation instead; this one was left unchanged because the codemod ' +
  'could not prove the rewrite. ';

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
      const isProvable =
        value?.type === 'ObjectExpression' &&
        presentationEntries.length === 1 &&
        !hasUnprovenEntry &&
        !attributes.some(
          (/** @type {any} */ a, /** @type {number} */ index) =>
            (a.type === 'JSXSpreadAttribute' &&
              index > attributes.indexOf(prop)) ||
            (a.type === 'JSXAttribute' && a.name?.name === 'presentation'),
        );
      if (!isProvable) {
        hasChanges = addComment(j, prop, TODO_COMMENT) || hasChanges;
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
