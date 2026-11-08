// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: Rename Avatar named sizes to Icon's abbreviated scale
 * @see https://github.com/meta/astryx/issues/2672
 *
 * This transform is deliberately limited to static literals written directly
 * in the `size` prop of an imported Avatar or AvatarGroup JSX element. It does
 * not infer through variables, helpers, objects, types, Storybook metadata, or
 * wrappers: missing an indirect migration is safer than rewriting another
 * component's size vocabulary.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: 'Rename Avatar named sizes tiny/xsmall/small/medium/large → xsm/sm/md/lg/xl',
  description:
    'Renames static sizes written directly on imported Avatar and AvatarGroup ' +
    'JSX elements. Indirect values are left unchanged for manual migration.',
  pr: '#2672',
};

const IMPORT_SOURCES = new Set([
  '@astryxdesign/core',
  '@astryxdesign/core/Avatar',
  '@astryxdesign/core/AvatarGroup',
  '@xds/core',
  '@xds/core/Avatar',
  '@xds/core/AvatarGroup',
]);

const COMPONENT_PROPS = new Map([
  ['Avatar', new Set(['size'])],
  ['AvatarGroup', new Set(['size'])],
]);

const RENAMES = new Map([
  ['tiny', 'xsm'],
  ['xsmall', 'sm'],
  ['small', 'md'],
  ['medium', 'lg'],
  ['large', 'xl'],
]);

/** @param {string} name */
function canonicalComponentName(name) {
  return name.startsWith('XDS') ? name.slice(3) : name;
}

/** @param {any} node @returns {boolean} */
function renameStaticValue(node) {
  if (!node) return false;
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TypeCastExpression' ||
    node.type === 'ParenthesizedExpression'
  ) {
    return renameStaticValue(node.expression);
  }
  if (node.type === 'ConditionalExpression') {
    const consequentChanged = renameStaticValue(node.consequent);
    const alternateChanged = renameStaticValue(node.alternate);
    return consequentChanged || alternateChanged;
  }
  if (
    (node.type !== 'StringLiteral' && node.type !== 'Literal') ||
    typeof node.value !== 'string'
  ) {
    return false;
  }
  const replacement = RENAMES.get(node.value);
  if (!replacement) return false;
  node.value = replacement;
  if (node.raw) node.raw = undefined;
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
      matchesImport: source => IMPORT_SOURCES.has(source),
      components: COMPONENT_PROPS,
      normalizeComponentName: canonicalComponentName,
    },
    propPath => {
      const prop = propPath.node;
      const value =
        prop.value?.type === 'JSXExpressionContainer'
          ? prop.value.expression
          : prop.value;
      if (renameStaticValue(value)) hasChanges = true;
    },
  );

  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
