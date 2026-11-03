// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The syntax tree of a template's source, shared by every rewrite of
 * it: parsing, a walk over every node, whether an identifier is a reference,
 * the names a file writes, and the module scope that resolves bindings.
 *
 * @input Template source text
 * @output Its parsed tree, node visits, names, and module scope
 * @position packages/cli/foundation/discovery — read by template-icons and by
 *   the demo-content replacement in template-adapter
 */

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

/** @type {typeof import('@babel/parser') | undefined} */
let babelParser;
/** @type {typeof import('@babel/core') | undefined} */
let babelCore;

/**
 * Parse template source as TSX. Babel loads on first use, so a command that
 * only lists templates never pays for it.
 * @param {string} source
 * @returns {any} The file node.
 */
export function parseTemplateSource(source) {
  babelParser ??= /** @type {typeof import('@babel/parser')} */ (
    require('@babel/parser')
  );
  return babelParser.parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: false,
  });
}

/**
 * The module scope of a parsed file. Its bindings, and the scope of each path
 * a traversal visits, resolve a name to the declaration it reads, so a rewrite
 * acts on bindings and not on names.
 * @param {any} file - A file node from {@link parseTemplateSource}.
 * @returns {any} The program path; its `scope` is the module scope.
 */
export function programPath(file) {
  /** @type {any} */
  let program;
  traverseTemplateSource(file, {
    Program(/** @type {any} */ path) {
      program = path;
      path.stop();
    },
  });
  return program;
}

/**
 * Traverse a parsed file with scope tracking.
 * @param {any} file - A file node from {@link parseTemplateSource}.
 * @param {import('@babel/core').Visitor} visitor
 */
export function traverseTemplateSource(file, visitor) {
  babelCore ??= /** @type {typeof import('@babel/core')} */ (
    require('@babel/core')
  );
  babelCore.traverse(file, visitor);
}

/**
 * Every node in the tree, with its parent and the key it sits under.
 * @param {any} node
 * @param {(node: any, parent: any, key: string) => void} visit
 * @param {any} [parent]
 * @param {string} [key]
 */
export function walk(node, visit, parent = null, key = '') {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent, key);
    return;
  }
  if (
    node == null ||
    typeof node !== 'object' ||
    typeof node.type !== 'string'
  ) {
    return;
  }
  visit(node, parent, key);
  for (const childKey of Object.keys(node)) {
    if (
      childKey === 'loc' ||
      childKey === 'extra' ||
      childKey.endsWith('Comments') ||
      childKey === 'comments' ||
      childKey === 'tokens'
    ) {
      continue;
    }
    const child = node[childKey];
    if (child != null && typeof child === 'object') {
      walk(child, visit, node, childKey);
    }
  }
}

/**
 * Whether an identifier node is a reference to a binding, not a property
 * name or a JSX attribute name.
 * @param {any} node
 * @param {any} parent
 * @param {string} key
 */
export function isReference(node, parent, key) {
  if (!parent) return true;
  switch (parent.type) {
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return false;
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return key !== 'property' || parent.computed;
    case 'ObjectProperty':
      return key === 'value' || parent.computed;
    case 'ObjectMethod':
    case 'ClassMethod':
    case 'ClassProperty':
      return key !== 'key' || parent.computed;
    case 'JSXAttribute':
      return false;
    case 'JSXMemberExpression':
      return key === 'object';
    case 'TSPropertySignature':
      return key !== 'key';
    default:
      return true;
  }
}

/**
 * Every name a file writes, so a name a rewrite adds collides with nothing
 * and shadows nothing. The name an import specifier reads from its module
 * binds nothing in the file, so it is not included.
 * @param {any} file - A file node from {@link parseTemplateSource}.
 * @returns {Set<string>}
 */
export function writtenNames(file) {
  /** @type {Set<string>} */
  const written = new Set();
  walk(file.program, (node, parent, key) => {
    if (parent?.type === 'ImportSpecifier' && key === 'imported') return;
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      written.add(node.name);
    }
  });
  return written;
}
