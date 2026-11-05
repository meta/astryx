// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: rename emptySearchResultsText to emptySearchText
 *
 * `emptySearchResultsText` was renamed to `emptySearchText` (`spec:AST-056`
 * FR1) and the old name is removed in a minor release. The new prop takes a
 * `ReactNode`, so every old `string` value stays valid and the rename never
 * changes a value.
 *
 * A straight rename at the JSX boundary, through the shared `transformProp`
 * helper: the prop on an imported `Tokenizer`, `Typeahead`, or `BaseTypeahead`
 * element, and the key on `ChatComposerInput` trigger objects written inline
 * in its `triggers` prop. Like every transform built on the helper it does
 * not follow variables, helpers, spreads, wrappers, or types. Where it cannot
 * attribute the value it leaves a TODO instead of choosing a winner: the new
 * name already set, any spread onto one of these elements (whether or not the
 * element writes the old name itself — a spread may carry either name or the
 * triggers), a `triggers` value that is not an inline object or array, or a
 * trigger object with a spread or computed key. A value forwarded through a
 * spread is the one case the type checker cannot report after the removal,
 * which is why every spread gets the TODO.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: 'Rename emptySearchResultsText to emptySearchText',
  description:
    'Renames the removed `emptySearchResultsText` prop to `emptySearchText` ' +
    'on imported Tokenizer, Typeahead, and BaseTypeahead elements, and the ' +
    "same key on trigger objects written inline in ChatComposerInput's " +
    '`triggers`. Leaves a TODO where the new name is already set, on every ' +
    'spread onto these elements, where the triggers value is not written ' +
    'inline, and on a trigger object with a spread or computed key.',
};

const OLD_NAME = 'emptySearchResultsText';
const NEW_NAME = 'emptySearchText';
const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;

const COMPONENTS = new Map([
  ['Tokenizer', new Set([OLD_NAME])],
  ['Typeahead', new Set([OLD_NAME])],
  ['BaseTypeahead', new Set([OLD_NAME])],
  ['ChatComposerInput', new Set(['triggers'])],
]);

const BOTH_SET_COMMENT =
  ' TODO(astryx upgrade): emptySearchResultsText was removed and ' +
  'emptySearchText is already set here; delete the old one if the new value ' +
  'is what you want. ';
const UNREADABLE_OBJECT_COMMENT =
  ' TODO(astryx upgrade): emptySearchResultsText was removed. Rename it to ' +
  'emptySearchText by hand; this object has a spread or computed key. ';
const SPREAD_COMMENT =
  ' TODO(astryx upgrade): emptySearchResultsText was removed. This element ' +
  'spreads props that may carry either name; rename to emptySearchText ' +
  'where the props are built and delete the old one. ';
const OPAQUE_TRIGGERS_COMMENT =
  ' TODO(astryx upgrade): emptySearchResultsText was removed. These triggers ' +
  'are built elsewhere; rename the key to emptySearchText where they are ' +
  'built. ';

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
function staticPropertyName(property) {
  if (property.computed) return null;
  const key = property.key;
  if (key?.type === 'Identifier') return key.name;
  if (key?.type === 'StringLiteral' || key?.type === 'Literal') {
    return typeof key.value === 'string' ? key.value : null;
  }
  return null;
}

/**
 * Attach a comment to a node once (re-running the codemod adds nothing).
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

/**
 * Rename the key on one trigger object literal.
 * @param {any} j @param {any} object @returns {boolean}
 */
function renameTriggerKey(j, object) {
  const old = object.properties.find(
    (/** @type {any} */ property) => staticPropertyName(property) === OLD_NAME,
  );
  const unreadable = object.properties.find(
    (/** @type {any} */ property) =>
      property.type === 'SpreadElement' ||
      property.type === 'SpreadProperty' ||
      property.computed,
  );
  // A spread or computed key may carry the removed key itself, so the
  // object gets the TODO whether or not it writes the old name.
  if (unreadable) {
    return addComment(j, old ?? unreadable, UNREADABLE_OBJECT_COMMENT);
  }
  if (!old) return false;
  const already = object.properties.some(
    (/** @type {any} */ property) => staticPropertyName(property) === NEW_NAME,
  );
  if (already) return addComment(j, old, BOTH_SET_COMMENT);
  old.key = j.identifier(NEW_NAME);
  if (old.shorthand) old.shorthand = false;
  return true;
}

/** @param {any} fileInfo @param {any} api */
export default function transform(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;

  transformProp(
    root,
    j,
    {
      matchesImport: source => CORE_IMPORT_RE.test(source),
      components: COMPONENTS,
    },
    (propPath, {component}) => {
      const prop = propPath.node;
      const attributes = propPath.parent.node.attributes ?? [];
      const hasSpread = attributes.some(
        (/** @type {any} */ attribute) =>
          attribute.type === 'JSXSpreadAttribute',
      );
      if (component === 'ChatComposerInput') {
        // `triggers={[{...}, {...}]}` or `triggers={{...}}`: rename the key
        // on each object written inline; a value built elsewhere, or an
        // element whose spread may carry triggers, gets a TODO.
        const value =
          prop.value?.type === 'JSXExpressionContainer'
            ? unwrap(prop.value.expression)
            : null;
        const items =
          value?.type === 'ArrayExpression'
            ? value.elements.map((/** @type {any} */ e) => unwrap(e))
            : [value];
        let opaque = hasSpread;
        for (const item of items) {
          if (item?.type === 'ObjectExpression') {
            changed = renameTriggerKey(j, item) || changed;
          } else {
            opaque = true;
          }
        }
        if (opaque) {
          changed = addComment(j, prop, OPAQUE_TRIGGERS_COMMENT) || changed;
        }
        return;
      }
      if (hasSpread) {
        changed = addComment(j, prop, SPREAD_COMMENT) || changed;
        return;
      }
      const already = attributes.some(
        (/** @type {any} */ attribute) =>
          attribute.type === 'JSXAttribute' &&
          attribute.name?.name === NEW_NAME,
      );
      if (already) {
        changed = addComment(j, prop, BOTH_SET_COMMENT) || changed;
        return;
      }
      prop.name.name = NEW_NAME;
      changed = true;
    },
  );

  // Every spread onto one of these elements that the prop pass did not reach
  // (the element writes neither the old name nor, for ChatComposerInput,
  // `triggers`): the spread may carry the removed key, so it gets the TODO.
  for (const [component, props] of COMPONENTS) {
    const sentinel = `__astryx_spread_${component}`;
    root
      .find(j.JSXOpeningElement)
      .filter((/** @type {any} */ path) =>
        (path.node.attributes ?? []).some(
          (/** @type {any} */ attribute) =>
            attribute.type === 'JSXSpreadAttribute',
        ),
      )
      .forEach((/** @type {any} */ path) => {
        const attributes = path.node.attributes ?? [];
        const names = new Set(
          attributes
            .filter((/** @type {any} */ a) => a.type === 'JSXAttribute')
            .map((/** @type {any} */ a) => a.name?.name),
        );
        if ([...props].some(name => names.has(name))) return;
        // Let the shared helper decide whether this element is the imported
        // component: give it a sentinel prop to find, then take it back.
        const marker = j.jsxAttribute(j.jsxIdentifier(sentinel));
        path.node.attributes = [...attributes, marker];
        let matched = false;
        transformProp(
          root,
          j,
          {
            matchesImport: source => CORE_IMPORT_RE.test(source),
            components: new Map([[component, new Set([sentinel])]]),
          },
          propPath => {
            if (propPath.node === marker) matched = true;
          },
        );
        path.node.attributes = attributes;
        if (!matched) return;
        const spread = attributes.find(
          (/** @type {any} */ attribute) =>
            attribute.type === 'JSXSpreadAttribute',
        );
        changed =
          addComment(
            j,
            spread,
            component === 'ChatComposerInput'
              ? OPAQUE_TRIGGERS_COMMENT
              : SPREAD_COMMENT,
          ) || changed;
      });
  }

  return changed ? root.toSource({quote: 'single'}) : null;
}
