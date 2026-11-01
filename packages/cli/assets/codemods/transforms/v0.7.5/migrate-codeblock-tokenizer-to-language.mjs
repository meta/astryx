// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate CodeBlock tokenizer to a custom language value
 *
 * `tokenizer={fn}` beside a static `language="x"` other than `plaintext`
 * becomes `language={createCodeLanguage({name: 'x', identifiers: ['x'],
 * tokenize: fn})}` (`component:CodeBlock` FR13). The custom language paints
 * with the same function, labels `x`, and reflects `data-language="x"`, so the
 * block looks the same. `createCodeLanguage` is imported from
 * `@astryxdesign/core/CodeBlock` when the file does not import it yet, under
 * a free alias when the file already binds the name to something else. A
 * `tokenizer` that is a name or a call-free property may be undefined at run
 * time, so it is guarded: `fn ? createCodeLanguage({...}) : 'x'`.
 *
 * Built on the shared `transformProp` helper, so it does not follow
 * variables, helpers, wrappers, or types. Where a CodeBlock writes
 * `tokenizer` but the codemod cannot prove the result, it keeps the old prop
 * and leaves a TODO instead of guessing: a computed or missing `language`, a
 * `tokenizer` value that is neither a function literal nor a name or property
 * (a name or property is guarded with `fn ? createCodeLanguage(...) : 'x'`,
 * since it may be undefined), a
 * `plaintext` language (which shows no label today, while a language value
 * does), and any CodeBlock that also spreads props. The deprecated prop keeps
 * working there. Comments are the codemod's only report channel, and each is
 * added once, so a second run changes nothing.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate CodeBlock tokenizer to a custom language',
  description:
    'Replaces `tokenizer={fn}` beside a static `language="x"` with ' +
    "`language={createCodeLanguage({name: 'x', identifiers: ['x'], tokenize: fn})}`. " +
    'Keeps the old prop with a TODO where the language is computed, missing, ' +
    'or `plaintext`, and where the CodeBlock also spreads props; the ' +
    'deprecated prop still works there.',
};

const OLD_NAME = 'tokenizer';
const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;
const CODEBLOCK_SOURCE = '@astryxdesign/core/CodeBlock';
const COMPONENT_PROPS = new Map([['CodeBlock', new Set([OLD_NAME])]]);

const UNPROVEN_COMMENT =
  ' TODO(astryx upgrade): tokenizer is deprecated. Pass ' +
  'language={createCodeLanguage({name, identifiers, tokenize})} instead, ' +
  'with this function as tokenize; the language here is computed, missing, ' +
  'or plaintext, so it was left unchanged. ';
const VALUE_COMMENT =
  ' TODO(astryx upgrade): tokenizer is deprecated. Pass ' +
  'language={createCodeLanguage({name, identifiers, tokenize})} instead; ' +
  'this tokenizer value is computed (not a function, a name, or a ' +
  'call-free property), so it was left unchanged. ';
const SPREAD_COMMENT =
  ' TODO(astryx upgrade): tokenizer is deprecated, but this CodeBlock also ' +
  'spreads props that may set language or tokenizer, so it was left ' +
  'unchanged. Pass language={createCodeLanguage({name, identifiers, ' +
  'tokenize})} by hand. ';

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

/**
 * A name, or a property chain on one with no call and no computed key other
 * than a literal: safe to read twice, and narrowed by a `?:` guard.
 * @param {any} node
 * @returns {boolean}
 */
function isCallFreeChain(node) {
  const value = unwrap(node);
  if (value == null) {
    return false;
  }
  if (value.type === 'Identifier' || value.type === 'ThisExpression') {
    return true;
  }
  if (value.type === 'MemberExpression') {
    const key = value.property;
    const literalKey =
      !value.computed ||
      key.type === 'StringLiteral' ||
      key.type === 'NumericLiteral' ||
      key.type === 'Literal';
    return (
      literalKey && value.optional !== true && isCallFreeChain(value.object)
    );
  }
  return false;
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
 * The local name `createCodeLanguage` is imported under, adding the import
 * when the file has none.
 * @param {any} j @param {any} root
 */
function ensureCreateImport(j, root) {
  let local = null;
  root
    .find(j.ImportDeclaration)
    .filter((/** @type {any} */ p) => CORE_IMPORT_RE.test(p.node.source.value))
    .forEach((/** @type {any} */ p) => {
      for (const specifier of p.node.specifiers ?? []) {
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.name === 'createCodeLanguage'
        ) {
          local = specifier.local?.name ?? 'createCodeLanguage';
        }
      }
    });
  if (local != null) {
    return local;
  }
  // Any other binding of the name (a local import or function) would clash,
  // so the import takes the first free alias instead.
  const name = freeName(j, root, 'createCodeLanguage');
  const specifier =
    name === 'createCodeLanguage'
      ? j.importSpecifier(j.identifier('createCodeLanguage'))
      : j.importSpecifier(
          j.identifier('createCodeLanguage'),
          j.identifier(name),
        );
  const existing = root.find(j.ImportDeclaration).filter(
    (/** @type {any} */ p) =>
      p.node.source.value === CODEBLOCK_SOURCE &&
      p.node.importKind !== 'type' &&
      // A namespace import cannot take a named specifier beside it.
      !(p.node.specifiers ?? []).some(
        (/** @type {any} */ s) => s.type === 'ImportNamespaceSpecifier',
      ),
  );
  if (existing.size() > 0) {
    existing.get().node.specifiers.push(specifier);
  } else {
    const declaration = j.importDeclaration(
      [specifier],
      j.stringLiteral(CODEBLOCK_SOURCE),
    );
    const imports = root.find(j.ImportDeclaration);
    if (imports.size() > 0) {
      imports.at(imports.size() - 1).insertAfter(declaration);
    } else {
      root.get().node.program.body.unshift(declaration);
    }
  }
  return name;
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
      if (
        attributes.some(
          (/** @type {any} */ a) => a.type === 'JSXSpreadAttribute',
        )
      ) {
        hasChanges = addComment(j, prop, SPREAD_COMMENT) || hasChanges;
        return;
      }
      const languageAttribute = attributes.find(
        (/** @type {any} */ a) =>
          a.type === 'JSXAttribute' && a.name?.name === 'language',
      );
      const language =
        languageAttribute == null
          ? null
          : staticString(attributeValue(languageAttribute));
      const tokenize = attributeValue(prop);
      const tokenizeNode = unwrap(tokenize);
      // A function literal is always a function. A name or property may be
      // undefined at run time (a forwarded optional prop), so it is guarded:
      // `fn ? createCodeLanguage({...}) : 'x'` keeps the plain block the
      // released prop drew without one. Anything else is reported.
      const isFunction =
        tokenizeNode?.type === 'ArrowFunctionExpression' ||
        tokenizeNode?.type === 'FunctionExpression';
      const isGuardable = isCallFreeChain(tokenizeNode);
      if (language == null || language === '' || language === 'plaintext') {
        hasChanges = addComment(j, prop, UNPROVEN_COMMENT) || hasChanges;
        return;
      }
      if (!(isFunction || isGuardable)) {
        hasChanges = addComment(j, prop, VALUE_COMMENT) || hasChanges;
        return;
      }
      rewrites.push(() => {
        const create = ensureCreateImport(j, root);
        const value = j.callExpression(j.identifier(create), [
          j.objectExpression([
            j.objectProperty(j.identifier('name'), j.stringLiteral(language)),
            j.objectProperty(
              j.identifier('identifiers'),
              j.arrayExpression([j.stringLiteral(language)]),
            ),
            j.objectProperty(j.identifier('tokenize'), tokenize),
          ]),
        ]);
        languageAttribute.value = j.jsxExpressionContainer(
          isFunction
            ? value
            : j.conditionalExpression(
                tokenize,
                value,
                j.stringLiteral(language),
              ),
        );
        opening.attributes = opening.attributes.filter(
          (/** @type {any} */ a) => a !== prop,
        );
      });
    },
  );

  for (const rewrite of rewrites) {
    rewrite();
    hasChanges = true;
  }
  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
