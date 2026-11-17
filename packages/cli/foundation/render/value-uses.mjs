// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which of a module's import bindings it uses as values, read through
 * Babel's scope.
 *
 * @input  a module's AST (`@babel/parser`, a `File`)
 * @output each static import's bindings with the references that resolve to
 *   them as values; the packages a TypeScript build drops
 * @position foundation/render, used by the render worker's import checks
 */

import {traverse} from '@babel/core';

/**
 * Whether a reference sits in a type, which a TypeScript build drops. This
 * is the test Babel's TypeScript transform applies before it drops an import.
 * @param {any} ref a reference's NodePath
 */
function inType(ref) {
  switch (ref.parent.type) {
    case 'TSTypeReference':
    case 'TSExpressionWithTypeArguments':
    case 'TSTypeQuery':
      return true;
    case 'TSQualifiedName':
      return (
        ref.parentPath.findParent(
          (/** @type {any} */ up) => up.type !== 'TSQualifiedName',
        ).type !== 'TSImportEqualsDeclaration'
      );
    case 'ExportSpecifier':
      return (
        ref.parent.exportKind === 'type' ||
        ref.parentPath.parent.exportKind === 'type'
      );
    default:
      return false;
  }
}

/**
 * One binding a static import makes.
 * @typedef {object} ImportUse
 * @property {any} specifier the import specifier
 * @property {any[]} values the NodePaths of the references that resolve to
 *   this binding and use it as a value. A parameter or a local declaration
 *   of the same name is its own binding, so its references are not here.
 */

/**
 * Each static import declaration of a module, with the bindings it makes.
 * @param {any} ast the module's AST (`File`)
 * @returns {Map<any, ImportUse[]>} by import declaration, in source order
 */
export function importUses(ast) {
  /** @type {Map<any, ImportUse[]>} */
  const uses = new Map();
  traverse(ast, {
    Program(program) {
      for (const statement of program.get('body')) {
        if (!statement.isImportDeclaration()) continue;
        uses.set(
          statement.node,
          statement.node.specifiers.map((/** @type {any} */ specifier) => {
            const binding = program.scope.getBinding(specifier.local.name);
            return {
              specifier,
              values:
                binding?.kind === 'module'
                  ? binding.referencePaths.filter(ref => !inType(ref))
                  : [],
            };
          }),
        );
      }
      program.stop();
    },
  });
  return uses;
}

/**
 * The modules a TypeScript build drops from a module's static imports: an
 * `import type`, or an import each binding of which is a `type` binding or
 * is used only in types or not at all. A module that another static import
 * of the same module keeps is not dropped. Only static import declarations
 * are read: a re-export, an `import()` or a `require()` loads its module.
 * JavaScript keeps every import, so call this only for a TypeScript module.
 * @param {any} ast the module's AST (`File`)
 * @returns {Set<string>}
 */
export function droppedImports(ast) {
  /** @type {Set<string>} */
  const dropped = new Set();
  /** @type {Set<string>} */
  const kept = new Set();
  for (const [declaration, bindings] of importUses(ast)) {
    const elided =
      declaration.importKind === 'type' ||
      (bindings.length > 0 &&
        bindings.every(
          ({specifier, values}) =>
            specifier.importKind === 'type' || values.length === 0,
        ));
    (elided ? dropped : kept).add(String(declaration.source.value));
  }
  for (const source of kept) dropped.delete(source);
  return dropped;
}
