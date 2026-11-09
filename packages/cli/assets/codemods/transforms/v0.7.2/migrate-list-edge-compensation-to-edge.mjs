// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate List edgeCompensation to edge
 *
 * `edgeCompensation="inline"` on an imported `List` becomes `edge="outset"`,
 * the value it already resolves to. List resolves
 * `edge ?? (edgeCompensation === 'inline' ? 'outset' : 'padded')`, so `edge`
 * wins only when it has a value. The deprecated prop is removed beside an
 * `edge` string that no later spread can override; beside a computed `edge`,
 * which may be undefined at runtime, it gets a TODO instead.
 *
 * Built on the shared `transformProp` helper, so it does not follow
 * variables, helpers, wrappers, or types. Where a List writes
 * `edgeCompensation` but the codemod cannot prove the result, it keeps the
 * old prop and leaves a TODO instead of guessing: on a dynamic value, and
 * wherever the List also spreads props. A spread before the old prop may
 * carry an `edge` that wins today and that a new `edge` would override; one
 * after it may override either prop. A spread onto a List that never writes
 * `edgeCompensation` is not evidence of use, so it stays unchanged
 * (`spec:AST-040` FR1): the deprecated prop keeps working through it, and
 * its `@deprecated` type reports a typed use where the props are written.
 * Comments are the codemod's only report channel (`api.report` is a stub),
 * and each is added once, so a second run changes nothing.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate List edgeCompensation to edge',
  description:
    'Renames `edgeCompensation="inline"` to `edge="outset"` on List, and ' +
    'drops `edgeCompensation` beside an `edge` string. Keeps the old prop ' +
    'with a TODO where `edge` is computed or a later spread may override ' +
    'it, on a dynamic value, and where the List also spreads props; the ' +
    'deprecated prop still works there.',
};

const OLD_NAME = 'edgeCompensation';
const NEW_NAME = 'edge';
const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;

const COMPONENT_PROPS = new Map([['List', new Set([OLD_NAME])]]);

const DYNAMIC_COMMENT =
  ' TODO(astryx upgrade): edgeCompensation is deprecated. Replace ' +
  'edgeCompensation="inline" with edge="outset" by hand; this value is ' +
  'computed. ';
const BOTH_SET_COMMENT =
  ' TODO(astryx upgrade): edgeCompensation is deprecated. edge is also set ' +
  'here, but it may be undefined, and then edgeCompensation still applies. ' +
  'Make edge default to "outset" where edgeCompensation is "inline", then ' +
  'remove edgeCompensation. ';
const SPREAD_COMMENT =
  ' TODO(astryx upgrade): edgeCompensation is deprecated, but this List ' +
  'also spreads props that may set edge, so it was left unchanged. Replace ' +
  'edgeCompensation="inline" with edge="outset" by hand, after checking ' +
  'which edge the spread passes. ';

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

/** @param {any} node */
function isStringLiteral(node) {
  const value = unwrap(node);
  return (
    value != null &&
    (value.type === 'StringLiteral' || value.type === 'Literal') &&
    typeof value.value === 'string'
  );
}

/**
 * The value of a JSX attribute: the string of `edge="flush"`, or the
 * expression inside `edge={...}`.
 * @param {any} attribute
 */
function attributeValue(attribute) {
  return attribute.value?.type === 'JSXExpressionContainer'
    ? attribute.value.expression
    : attribute.value;
}

/** @param {any} node */
function isInlineLiteral(node) {
  const value = unwrap(node);
  return (
    value != null &&
    (value.type === 'StringLiteral' || value.type === 'Literal') &&
    value.value === 'inline'
  );
}

/**
 * Attach a comment to a node once, so re-running the codemod adds nothing.
 * @param {any} j @param {any} node @param {string} text
 */
function addComment(j, node, text) {
  node.comments ??= [];
  if (node.comments.some((/** @type {any} */ c) => c.value === text)) {
    return false;
  }
  node.comments.push(j.commentBlock(text, true, false));
  return true;
}

/** @param {any} attributes */
function firstSpread(attributes) {
  return attributes.find(
    (/** @type {any} */ attribute) => attribute.type === 'JSXSpreadAttribute',
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
      const edgeIndex = attributes.findIndex(
        (/** @type {any} */ attribute) =>
          attribute.type === 'JSXAttribute' &&
          attribute.name?.name === NEW_NAME,
      );
      if (edgeIndex !== -1) {
        // `edge` wins only when it has a value. A string that no later
        // spread can override always does, so the old prop is inert and
        // removing it changes nothing. A computed `edge` may be undefined,
        // and then the old prop still decides.
        const isProven =
          isStringLiteral(attributeValue(attributes[edgeIndex])) &&
          !attributes
            .slice(edgeIndex + 1)
            .some(
              (/** @type {any} */ attribute) =>
                attribute.type === 'JSXSpreadAttribute',
            );
        if (isProven) {
          opening.attributes = attributes.filter(
            (/** @type {any} */ attribute) => attribute !== prop,
          );
          hasChanges = true;
        } else {
          hasChanges = addComment(j, prop, BOTH_SET_COMMENT) || hasChanges;
        }
        return;
      }
      // With a spread on the element the rename cannot be proven: a spread
      // before the old prop may carry an `edge` that wins today and that a
      // new `edge` would override, and one after it may override either
      // prop. The old prop keeps working, so it stays, with a TODO.
      if (firstSpread(attributes)) {
        hasChanges = addComment(j, prop, SPREAD_COMMENT) || hasChanges;
        return;
      }
      if (isInlineLiteral(attributeValue(prop))) {
        prop.name.name = NEW_NAME;
        prop.value = j.stringLiteral('outset');
        hasChanges = true;
      } else {
        hasChanges = addComment(j, prop, DYNAMIC_COMMENT) || hasChanges;
      }
    },
  );

  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
