// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file shared-identity.mjs
 * @input The source of the packages swizzle copies components from
 * @output The places where a module keeps cross-module identity in module
 *   scope instead of a registered shared key (spec:AST-110 FR3): a
 *   module-local symbol that keys an exported type or that an exported
 *   function reads or writes, and a module-scope registry that an exported
 *   register, subscribe, read or identity function uses, or that is keyed by
 *   a document or window
 * @position Read by shared-identity.test.mjs; no Vitest import
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const ts = createRequire(path.join(REPO, 'package.json'))('typescript');

/** The packages swizzle copies components from. */
export const SOURCE_ROOTS = ['core', 'lab', 'charts', 'richtext', 'vega'].map(
  name => `packages/${name}/src`,
);
const SOURCE_FILE = /\.tsx?$/;
const NOT_SHIPPED =
  /\.(?:test|spec|stories|story|d|bench)\.tsx?$|(?:^|\/)__(?:tests|fixtures|mocks)__\//;
/** An exported function whose name says it registers, subscribes or recognizes. */
const IDENTITY_FUNCTION =
  /^(?:register|unregister|subscribe|is|has|get|read|attach|set|create|use)[A-Z_]/;
const COLLECTION = /^(?:Map|Set|WeakMap|WeakSet)$/;
const DOCUMENT_KEY = /^(?:Document|Window)$/;

/** Every shipped source file, repository-relative. */
export function sourceFiles() {
  return SOURCE_ROOTS.flatMap(root =>
    fs
      .readdirSync(path.join(REPO, root), {recursive: true})
      .map(String)
      .map(file => path.join(root, file))
      .filter(file => SOURCE_FILE.test(file) && !NOT_SHIPPED.test(file)),
  ).sort();
}

/**
 * The cross-module identity one module keeps in module scope.
 * @param {string} file repository-relative
 * @returns {Array<{file: string, name: string, kind: 'symbol'|'registry', why: string}>}
 */
export function findInFile(file) {
  return findInSource(file, fs.readFileSync(path.join(REPO, file), 'utf8'));
}

/**
 * The cross-module identity one module's source keeps in module scope.
 * @param {string} file the name to report
 * @param {string} code the module's source
 * @returns {Array<{file: string, name: string, kind: 'symbol'|'registry', why: string}>}
 */
export function findInSource(file, code) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  /** @type {Map<string, 'symbol'|'registry'|'document-registry'>} */
  const candidates = new Map();
  /** @type {Array<{node: import('typescript').Node, exported: boolean, isType: boolean, name: string}>} */
  const scopes = [];
  const isExported = node =>
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      const isLet = (statement.declarationList.flags & ts.NodeFlags.Let) !== 0;
      const isDeclare = statement.modifiers?.some(
        m => m.kind === ts.SyntaxKind.DeclareKeyword,
      );
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const name = declaration.name.text;
        const init = declaration.initializer;
        const typeText = declaration.type?.getText(source) ?? '';
        if (
          (init &&
            ts.isCallExpression(init) &&
            init.expression.getText(source) === 'Symbol') ||
          (isDeclare && /unique symbol/.test(typeText))
        ) {
          candidates.set(name, 'symbol');
        } else if (init && ts.isNewExpression(init)) {
          const ctor = init.expression.getText(source);
          // A collection with fixed contents that nothing changes, or one
          // typed read-only, is a constant, not a registry.
          const isConstant =
            /^Readonly/.test(typeText) ||
            ((init.arguments?.length ?? 0) > 0 &&
              !new RegExp(`\\b${name}\\.(?:add|set|delete|clear)\\(`).test(
                code,
              ));
          if (COLLECTION.test(ctor) && !isConstant) {
            const keyType = init.typeArguments?.[0]?.getText(source) ?? '';
            candidates.set(
              name,
              DOCUMENT_KEY.test(keyType) ? 'document-registry' : 'registry',
            );
          }
        } else if (isLet) {
          candidates.set(name, 'registry');
        }
        if (
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          scopes.push({
            node: init,
            exported: isExported(statement),
            isType: false,
            name,
          });
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      scopes.push({
        node: statement,
        exported: isExported(statement),
        isType: false,
        name: statement.name.text,
      });
    } else if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      scopes.push({
        node: statement,
        exported: isExported(statement),
        isType: true,
        name: statement.name.text,
      });
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      scopes.push({
        node: statement,
        exported: isExported(statement),
        isType: false,
        name: statement.name.text,
      });
    }
  }
  if (candidates.size === 0) return [];

  /** Identifiers a node uses, and whether each is a computed key in a type. */
  const usesIn = node => {
    /** @type {Map<string, boolean>} name -> used as a computed type key */
    const used = new Map();
    const visit = child => {
      if (ts.isIdentifier(child) && candidates.has(child.text)) {
        const parent = child.parent;
        const asTypeKey =
          parent &&
          ts.isComputedPropertyName(parent) &&
          (ts.isPropertySignature(parent.parent) ||
            ts.isMethodSignature(parent.parent));
        used.set(child.text, Boolean(used.get(child.text) || asTypeKey));
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    return used;
  };

  /** @type {Map<string, string>} name -> why it crosses modules */
  const found = new Map();
  for (const scope of scopes) {
    if (!scope.exported) continue;
    for (const [name, asTypeKey] of usesIn(scope.node)) {
      const kind = candidates.get(name);
      if (found.has(name)) continue;
      if (kind === 'symbol') {
        if (scope.isType && asTypeKey) {
          found.set(name, `keys the exported type ${scope.name}`);
        } else if (!scope.isType) {
          found.set(name, `read or written by the exported ${scope.name}`);
        }
      } else if (!scope.isType) {
        if (kind === 'document-registry') {
          found.set(
            name,
            `a per-document store the exported ${scope.name} uses`,
          );
        } else if (IDENTITY_FUNCTION.test(scope.name)) {
          found.set(name, `a registry the exported ${scope.name} uses`);
        }
      }
    }
  }
  // A per-document store counts even when only module-private functions use it:
  // the components of the package and of a copy share the document.
  for (const [name, kind] of candidates) {
    if (kind === 'document-registry' && !found.has(name)) {
      found.set(name, 'a per-document store in module scope');
    }
  }
  return [...found].map(([name, why]) => ({
    file,
    name,
    kind: candidates.get(name) === 'symbol' ? 'symbol' : 'registry',
    why,
  }));
}

/** Every hit in the shipped source. */
export function findAll() {
  return sourceFiles().flatMap(findInFile);
}
