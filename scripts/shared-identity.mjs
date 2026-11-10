// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file shared-identity.mjs
 * @input The source of the packages swizzle copies components from
 * @output The places where a module keeps cross-module identity in module
 *   scope instead of a registered shared key (spec:AST-110 FR3): a
 *   module-local symbol that keys an exported type or that an exported
 *   function reaches, and module-scope state (a `let`, or a collection or an
 *   object or array literal that changes) that an exported function reaches, directly or through the
 *   module's own functions, or that is keyed by a document or window
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
const COLLECTION = /^(?:Map|Set|WeakMap|WeakSet)$/;
const DOCUMENT_KEY = /^(?:Document|Window)$/;
const MUTATING_METHOD =
  /^(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|set|add|delete|clear)$/;

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
  /** Top-level functions, classes and types, by name. */
  /** @type {Map<string, {node: import('typescript').Node, isType: boolean}>} */
  const scopes = new Map();
  /** Names the module exports, from modifiers, `export {…}` lists and defaults. */
  const exported = new Set();
  const hasExport = node =>
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
  /** Whether the module writes into the value `name` holds. */
  const isMutated = name => {
    const rootOf = expression => {
      let node = expression;
      while (
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node) ||
        ts.isNonNullExpression(node) ||
        ts.isParenthesizedExpression(node)
      ) {
        node = node.expression;
      }
      return ts.isIdentifier(node) ? node.text : null;
    };
    let mutated = false;
    const visit = node => {
      if (mutated) return;
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        !ts.isIdentifier(node.left) &&
        rootOf(node.left) === name
      ) {
        mutated = true;
      } else if (
        (ts.isPrefixUnaryExpression(node) ||
          ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken) &&
        !ts.isIdentifier(node.operand) &&
        rootOf(node.operand) === name
      ) {
        mutated = true;
      } else if (
        ts.isDeleteExpression(node) &&
        rootOf(node.expression) === name
      ) {
        mutated = true;
      } else if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        MUTATING_METHOD.test(node.expression.name.text) &&
        rootOf(node.expression.expression) === name
      ) {
        mutated = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return mutated;
  };

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      const isLet = (statement.declarationList.flags & ts.NodeFlags.Let) !== 0;
      const isDeclare = statement.modifiers?.some(
        m => m.kind === ts.SyntaxKind.DeclareKeyword,
      );
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const name = declaration.name.text;
        if (hasExport(statement)) exported.add(name);
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
            ((init.arguments?.length ?? 0) > 0 && !isMutated(name));
          if (COLLECTION.test(ctor) && !isConstant) {
            const keyType =
              init.typeArguments?.[0]?.getText(source) ??
              typeText.match(/^\w+<\s*(\w+)/)?.[1] ??
              '';
            candidates.set(
              name,
              DOCUMENT_KEY.test(keyType) ? 'document-registry' : 'registry',
            );
          }
        } else if (isLet) {
          candidates.set(name, 'registry');
        } else if (
          init &&
          (ts.isObjectLiteralExpression(init) ||
            ts.isArrayLiteralExpression(init)) &&
          !/^Readonly/.test(typeText) &&
          isMutated(name)
        ) {
          // An object or array literal that the module changes holds state
          // like a collection does.
          candidates.set(name, 'registry');
        }
        if (
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          scopes.set(name, {node: init, isType: false});
        }
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      scopes.set(statement.name.text, {node: statement, isType: false});
      if (hasExport(statement)) exported.add(statement.name.text);
    } else if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      scopes.set(statement.name.text, {node: statement, isType: true});
      if (hasExport(statement)) exported.add(statement.name.text);
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        exported.add((element.propertyName ?? element.name).text);
      }
    } else if (
      ts.isExportAssignment(statement) &&
      ts.isIdentifier(statement.expression)
    ) {
      exported.add(statement.expression.text);
    }
  }
  if (candidates.size === 0) return [];

  /**
   * The candidates a node uses (and whether each is a computed key in a
   * type), and the top-level scopes it refers to.
   */
  const usesIn = node => {
    /** @type {Map<string, boolean>} */
    const used = new Map();
    const refers = new Set();
    const visit = child => {
      if (ts.isIdentifier(child)) {
        if (candidates.has(child.text)) {
          const parent = child.parent;
          const asTypeKey =
            parent &&
            ts.isComputedPropertyName(parent) &&
            (ts.isPropertySignature(parent.parent) ||
              ts.isMethodSignature(parent.parent));
          used.set(child.text, Boolean(used.get(child.text) || asTypeKey));
        }
        if (scopes.has(child.text)) refers.add(child.text);
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    return {used, refers};
  };
  const uses = new Map(
    [...scopes].map(([name, scope]) => [name, usesIn(scope.node)]),
  );

  // A function the module hands to another module at load, such as a
  // callback it installs, acts for the module as an export does.
  const handedOut = new Set();
  for (const statement of source.statements) {
    if (
      ts.isExpressionStatement(statement) ||
      (ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          declaration =>
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer),
        ))
    ) {
      for (const name of usesIn(statement).refers) {
        if (!exported.has(name) && !scopes.get(name).isType) {
          handedOut.add(name);
        }
      }
    }
  }

  const rootName = root =>
    exported.has(root)
      ? `the exported ${root}`
      : `${root}, which the module hands out at load,`;
  /** @type {Map<string, string>} name -> why it crosses modules */
  const found = new Map();
  for (const root of [...[...exported].sort(), ...[...handedOut].sort()]) {
    const scope = scopes.get(root);
    if (!scope) continue;
    if (scope.isType) {
      for (const [name, asTypeKey] of uses.get(root).used) {
        if (
          candidates.get(name) === 'symbol' &&
          asTypeKey &&
          !found.has(name)
        ) {
          found.set(name, `keys the exported type ${root}`);
        }
      }
      continue;
    }
    // Everything the exported function reaches through the module's own
    // functions acts for it.
    const reached = new Set([root]);
    const queue = [root];
    while (queue.length) {
      const next = queue.pop();
      for (const name of uses.get(next)?.refers ?? []) {
        if (!reached.has(name) && !scopes.get(name).isType) {
          reached.add(name);
          queue.push(name);
        }
      }
    }
    for (const name of reached) {
      for (const used of uses.get(name).used.keys()) {
        if (found.has(used)) continue;
        found.set(
          used,
          candidates.get(used) === 'document-registry'
            ? `a per-document store ${rootName(root)} uses`
            : candidates.get(used) === 'symbol'
              ? `read or written by ${rootName(root)}`
              : `module state ${rootName(root)} uses`,
        );
      }
    }
  }
  // A per-document store counts even when no export reaches it: the
  // components of the package and of a copy share the document.
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

/** The helpers that name a shared slot, and the prefix each puts before the name. */
const SLOT_HELPERS = {
  sharedKey: '',
  sharedState: '',
  sharedMap: '',
  sharedWeakMap: '',
  sharedWeakSet: '',
  sharedStore: '',
  sharedBrand: '',
  sharedSequence: '',
  createSharedContext: 'context/',
  sharedForReact: 'react/',
  createLayerScopedContext: 'context/',
};
/** Files that define a slot helper, where the name is the caller's parameter. */
const HELPER_FILES = new Set([
  'packages/core/src/utils/sharedRealm.ts',
  'packages/core/src/utils/sharedContext.ts',
  'packages/core/src/Layer/layerScopedContext.tsx',
]);

/**
 * Every call that names a shared slot. A slot's name and version are its
 * identity, so each call must spell both as literals.
 * @returns {Array<{file: string, line: number, helper: string, slot: string|null}>}
 *   `slot` is `<prefix><name>/v<version>`, or null when either is not a literal
 */
export function sharedSlots() {
  /** @type {Array<{file: string, line: number, helper: string, slot: string|null}>} */
  const slots = [];
  for (const file of sourceFiles()) {
    if (HELPER_FILES.has(file)) continue;
    const code = fs.readFileSync(path.join(REPO, file), 'utf8');
    if (
      !/\b(?:shared[A-Z]\w*|create(?:Shared|LayerScoped)Context)\b/.test(code)
    ) {
      continue;
    }
    const source = ts.createSourceFile(
      file,
      code,
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = node => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        Object.hasOwn(SLOT_HELPERS, node.expression.text)
      ) {
        const helper = node.expression.text;
        const [name, version] = node.arguments;
        const literal =
          name &&
          version &&
          (ts.isStringLiteral(name) ||
            ts.isNoSubstitutionTemplateLiteral(name)) &&
          ts.isNumericLiteral(version);
        slots.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          helper,
          slot: literal
            ? `${SLOT_HELPERS[helper]}${name.text}/v${version.text}`
            : null,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return slots;
}
