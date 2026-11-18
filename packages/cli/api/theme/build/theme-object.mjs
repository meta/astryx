// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a theme source's own module gives its theme object, read from
 * its syntax tree: the bindings a module declares (imports, top-level
 * consts, exports), the object literal an expression stands for (through
 * consts, a defineTheme() call or a type assertion), and the chain of
 * themes the built export extends inside the same file.
 *
 * @input a parsed module (Babel AST) and the name of the export built
 * @output imports, consts and exports; the theme object of an expression;
 *   the same-file base objects of the built theme
 * @position api/theme/build — read by the build's base binding and by the
 *   source line index of settings
 */

const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
]);

/**
 * An expression without the type assertions and parentheses around it.
 * @param {any} node
 * @returns {any}
 */
export function unwrapExpression(node) {
  while (node && WRAPPERS.has(node.type)) node = node.expression;
  return node;
}

/**
 * The bindings a module declares at its top level: each import (its
 * specifier and the name it imports), each const, and the node each export
 * gives.
 * @param {any} ast
 */
export function moduleBindings(ast) {
  /** @type {Map<string, {source: string, imported: string}>} */
  const imports = new Map();
  /** @type {Map<string, any>} */
  const consts = new Map();
  /** @type {Map<string, any>} the node each export gives */
  const exported = new Map();
  /** @param {any} declaration */
  const addDeclaration = declaration => {
    if (declaration?.type !== 'VariableDeclaration') return;
    for (const d of declaration.declarations)
      if (d.id?.type === 'Identifier' && d.init) consts.set(d.id.name, d.init);
  };
  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type')
      for (const spec of node.specifiers)
        if (spec.type === 'ImportSpecifier')
          imports.set(spec.local.name, {
            source: node.source.value,
            imported: spec.imported.name ?? spec.imported.value,
          });
        else if (spec.type === 'ImportDefaultSpecifier')
          imports.set(spec.local.name, {
            source: node.source.value,
            imported: 'default',
          });
    addDeclaration(node);
    if (node.type === 'ExportNamedDeclaration') {
      addDeclaration(node.declaration);
      if (node.declaration?.type === 'VariableDeclaration')
        for (const d of node.declaration.declarations)
          if (d.id?.type === 'Identifier') exported.set(d.id.name, d.id);
      if (!node.source)
        for (const spec of node.specifiers ?? [])
          if (spec.type === 'ExportSpecifier')
            exported.set(spec.exported.name ?? spec.exported.value, spec.local);
    }
    if (node.type === 'ExportDefaultDeclaration')
      exported.set('default', node.declaration);
  }
  return {imports, consts, exported};
}

/**
 * The theme object literal an expression stands for: itself, a const's
 * value, or the first argument of a call (`defineTheme({...})`). Null when
 * the source does not show one.
 * @param {any} node
 * @param {Map<string, any>} consts
 * @param {number} [depth]
 * @returns {any}
 */
export function themeObjectOf(node, consts, depth = 0) {
  node = unwrapExpression(node);
  if (!node || depth > 8) return null;
  if (node.type === 'Identifier')
    return consts.has(node.name)
      ? themeObjectOf(consts.get(node.name), consts, depth + 1)
      : null;
  if (node.type === 'CallExpression')
    return themeObjectOf(node.arguments?.[0], consts, depth + 1);
  return node.type === 'ObjectExpression' ? node : null;
}

/**
 * The `extends` value an object literal writes, unwrapped, or undefined.
 * @param {any} object
 */
export function extendsOf(object) {
  const field = object?.properties?.find(
    (/** @type {any} */ p) =>
      p.type === 'ObjectProperty' &&
      !p.computed &&
      (p.key.name ?? p.key.value) === 'extends',
  );
  return unwrapExpression(field?.value);
}

/**
 * The theme objects the built export extends inside its own file, nearest
 * first: its `extends` names a const of the file, whose theme may extend
 * another. The built theme's own object is never among them.
 * @param {any} ast
 * @param {string} [exportName] - the export built; `default` when omitted
 * @returns {any[]}
 */
export function sameFileBases(ast, exportName) {
  const {consts, exported} = moduleBindings(ast);
  const built = themeObjectOf(exported.get(exportName ?? 'default'), consts);
  /** @type {any[]} */
  const bases = [];
  let object = built;
  for (let hop = 0; object && hop < 8; hop++) {
    const value = extendsOf(object);
    const next =
      value?.type === 'Identifier' && consts.has(value.name)
        ? themeObjectOf(value, consts)
        : null;
    if (!next || next === built || bases.includes(next)) break;
    bases.push(next);
    object = next;
  }
  return bases;
}
