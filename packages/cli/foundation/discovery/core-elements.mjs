// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which module paths and JSX elements name Core.
 * @input A module path, or a JSX element's name node and its Babel scope.
 * @output Whether the path is Core's package or one of its subpaths, and the
 *   Core component an element draws.
 * @position Shared by doctor's prop check (core-props.mjs), the reader of
 *   what augments Core (core-augmentation-points.mjs) and the page render
 *   worker (render/page-worker.mjs), so that they agree on what is Core.
 */

const CORE_PACKAGE = '@astryxdesign/core';

/**
 * Whether a module path names Core: the package or one of its subpaths.
 * @param {string} specifier
 */
export function isCoreModule(specifier) {
  return specifier === CORE_PACKAGE || specifier.startsWith(`${CORE_PACKAGE}/`);
}

/**
 * The Core component a JSX element name draws, when the module imports it
 * from Core: `<Button>` from a named import of Core or one of its subpaths,
 * under any local name, or `<Core.Button>` from a namespace import of Core.
 * Null for any other element, and for a type-only import.
 * @param {any} name the element's JSX name node
 * @param {any} scope the element's Babel scope
 * @returns {string | null}
 */
export function coreComponentOf(name, scope) {
  return coreImportOf(name, scope)?.component ?? null;
}

/**
 * The Core component a JSX element name draws, as `coreComponentOf` reads
 * it, with the module path the module imports it from.
 * @param {any} name the element's JSX name node
 * @param {any} scope the element's Babel scope
 * @returns {{component: string, source: string} | null}
 */
export function coreImportOf(name, scope) {
  const local = name.type === 'JSXIdentifier' ? name : name.type === 'JSXMemberExpression' ? name.object : null;
  if (local?.type !== 'JSXIdentifier') return null;
  const specifier = scope.getBinding(local.name)?.path;
  const declaration = specifier?.parentPath?.node;
  const source = String(declaration?.source?.value ?? '');
  if (declaration?.type !== 'ImportDeclaration' || !isCoreModule(source)) return null;
  if (declaration.importKind === 'type' || specifier.node.importKind === 'type') return null;
  if (name.type === 'JSXMemberExpression') {
    return specifier.node.type === 'ImportNamespaceSpecifier' ? {component: name.property.name, source} : null;
  }
  if (specifier.node.type !== 'ImportSpecifier') return null;
  const imported = specifier.node.imported.type === 'Identifier' ? specifier.node.imported.name : specifier.node.imported.value;
  return imported === 'default' ? null : {component: imported, source};
}
