// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which names a module uses as values, read from its Babel AST.
 *
 * @input  a module's AST (`@babel/parser`, TypeScript and JSX) and the names to look for
 * @output the names the module uses in an expression or JSX, not only in a type
 * @position foundation/render, used by the render worker's import checks
 */

/** AST keys that never hold a value use of a name. */
const SKIPPED_KEYS = new Set([
  'loc',
  'start',
  'end',
  'extra',
  'range',
  'comments',
  'leadingComments',
  'trailingComments',
  'innerComments',
]);

/** AST keys whose subtree is a type, which a build drops. */
const TYPE_KEYS = new Set([
  'typeAnnotation',
  'returnType',
  'typeParameters',
  'typeArguments',
  'superTypeParameters',
  'implements',
]);

/** Declarations that hold only types. */
const TYPE_NODES = new Set([
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSDeclareFunction',
  'TSImportType',
  'TSTypeQuery',
  'TSTypeReference',
]);

/**
 * The names among `names` that a module uses as values: in an expression or
 * JSX, not only in a type, a property key or an import. `export type {A}`
 * and `export {type A}` name a type, as a type position does.
 * @param {any} program the module's AST (`File.program`)
 * @param {Set<string>} names
 * @returns {Set<string>}
 */
export function valueUses(program, names) {
  /** @type {Set<string>} */
  const used = new Set();
  /** @param {any} node @param {any} parent @param {string} key @param {boolean} inType */
  const walk = (node, parent, key, inType) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ImportDeclaration') return;
    const typeExport =
      (node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportSpecifier') &&
      node.exportKind === 'type';
    const typed =
      inType || typeExport || TYPE_KEYS.has(key) || TYPE_NODES.has(node.type);
    if (
      (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
      names.has(node.name) &&
      !typed
    ) {
      const isKey =
        ((parent?.type === 'MemberExpression' ||
          parent?.type === 'OptionalMemberExpression' ||
          parent?.type === 'JSXMemberExpression') &&
          key === 'property' &&
          !parent.computed) ||
        ((parent?.type === 'ObjectProperty' ||
          parent?.type === 'ObjectMethod' ||
          parent?.type === 'ClassProperty' ||
          parent?.type === 'ClassMethod') &&
          key === 'key' &&
          !parent.computed) ||
        (parent?.type === 'JSXAttribute' && key === 'name');
      if (!isKey) used.add(node.name);
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(childKey) || !child || typeof child !== 'object')
        continue;
      if (Array.isArray(child))
        for (const item of child) walk(item, node, childKey, typed);
      else walk(child, node, childKey, typed);
    }
  };
  for (const statement of program.body) walk(statement, program, 'body', false);
  return used;
}

/**
 * The modules a module's static imports name that it needs at run time: a
 * module it imports for its effects alone (`import 'x'`), or one with a
 * binding the module uses as a value. An import only of types, or of names
 * the module never uses, is left out, as a build leaves it out.
 * @param {any} program the module's AST (`File.program`)
 * @returns {{needed: Set<string>, imported: Set<string>}} `imported`: every module a static import names
 */
export function neededImports(program) {
  /** @type {Set<string>} */
  const imported = new Set();
  /** @type {Map<string, string[]>} */
  const bindings = new Map();
  /** @type {Set<string>} */
  const needed = new Set();
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const source = String(node.source.value);
    imported.add(source);
    if (node.importKind === 'type') continue;
    if (node.specifiers.length === 0) {
      needed.add(source);
      continue;
    }
    const names = node.specifiers
      .filter((/** @type {any} */ s) => s.importKind !== 'type')
      .map((/** @type {any} */ s) => s.local.name);
    bindings.set(source, [...(bindings.get(source) ?? []), ...names]);
  }
  const used = valueUses(program, new Set([...bindings.values()].flat()));
  for (const [source, names] of bindings) {
    if (names.some(name => used.has(name))) needed.add(source);
  }
  return {needed, imported};
}
