// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: remove deprecated explicit RTL options from focus hooks
 *
 * useGridFocus and useListFocus derive direction from their container at the
 * moment a horizontal arrow key is pressed. This removes static `isRtl`
 * properties from inline option objects passed to those hooks.
 *
 * Dynamic config objects are deliberately left alone: removing a property from
 * an object whose ownership is unknown would be guesswork, and the 0.6 type
 * error makes those remaining sites visible.
 */

export const meta = {
  title: 'Remove explicit RTL options from focus hooks',
  description:
    'Removes deprecated `isRtl` properties from inline useGridFocus and ' +
    'useListFocus option objects. Direction is detected from the container.',
};

const IMPORT_SOURCES = new Set([
  '@astryxdesign/core',
  '@astryxdesign/core/hooks',
  '@xds/core',
  '@xds/core/hooks',
]);
const HOOKS = new Set(['useGridFocus', 'useListFocus']);

/** @param {any} property */
function staticPropertyName(property) {
  if (property.computed) return null;
  const key = property.key;
  if (key?.type === 'Identifier') return key.name;
  if (key?.type === 'StringLiteral' || key?.type === 'Literal') {
    return key.value;
  }
  return null;
}

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  if (!file.source.includes('isRtl')) return undefined;

  const j = api.jscodeshift;
  const root = j(file.source);
  /** @type {Map<string, any>} */
  const bindings = new Map();

  root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
    if (!IMPORT_SOURCES.has(path.node.source.value)) return;
    for (const specifier of path.node.specifiers ?? []) {
      if (
        specifier.type === 'ImportSpecifier' &&
        HOOKS.has(specifier.imported?.name)
      ) {
        const local = specifier.local?.name ?? specifier.imported.name;
        bindings.set(local, path.scope.lookup(local) ?? path.scope);
      }
    }
  });
  if (bindings.size === 0) return undefined;

  let changed = false;
  root.find(j.CallExpression).forEach((/** @type {any} */ path) => {
    const callee = path.node.callee;
    if (callee.type !== 'Identifier' || !bindings.has(callee.name)) return;
    // A parameter/local with the same name shadows the imported hook. Only
    // rewrite calls whose lexical binding is the import we discovered.
    if (path.scope.lookup(callee.name) !== bindings.get(callee.name)) return;
    const options = path.node.arguments[0];
    if (options?.type !== 'ObjectExpression') return;

    const before = options.properties.length;
    options.properties = options.properties.filter(
      (/** @type {any} */ property) => staticPropertyName(property) !== 'isRtl',
    );
    changed ||= options.properties.length !== before;
  });

  return changed ? root.toSource({quote: 'single'}) : undefined;
}
