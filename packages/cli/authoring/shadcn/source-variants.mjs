// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reproduce the JavaScript transform used by the pinned ShadCN client.
 * @input Registry TypeScript/TSX source and its explicit target path.
 * @output Exact JavaScript/JSX bytes and target used when components.json has tsx=false.
 * @position Shared compatibility boundary for generated receipt variants and upgrades.
 */

import {transformFromAstSync} from '@babel/core';
import {parse} from '@babel/parser';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import * as recast from 'recast';

const require = createRequire(import.meta.url);
/** @type {import('@babel/core').PluginItem} */
const transformTypeScript =
  require('@babel/plugin-transform-typescript').default;

/** @type {import('@babel/parser').ParserOptions} */
const SHADCN_PARSER_OPTIONS = {
  sourceType: 'module',
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  startLine: 1,
  tokens: true,
  plugins: [
    'asyncGenerators',
    'bigInt',
    'classPrivateMethods',
    'classPrivateProperties',
    'classProperties',
    'classStaticBlock',
    'decimal',
    'decorators-legacy',
    'doExpressions',
    'dynamicImport',
    'exportDefaultFrom',
    'exportNamespaceFrom',
    'functionBind',
    'functionSent',
    'importAssertions',
    'importMeta',
    'nullishCoalescingOperator',
    'numericSeparator',
    'objectRestSpread',
    'optionalCatchBinding',
    'optionalChaining',
    ['pipelineOperator', {proposal: 'minimal'}],
    ['recordAndTuple', {syntaxType: 'hash'}],
    'throwExpressions',
    'topLevelAwait',
    'v8intrinsic',
    'typescript',
    'jsx',
  ],
};

/** @param {string} target */
export function shadcnJavaScriptTarget(target) {
  const extension = path.posix.extname(target);
  if (extension === '.tsx') return `${target.slice(0, -4)}.jsx`;
  if (extension === '.ts') return `${target.slice(0, -3)}.js`;
  return target;
}

/**
 * Give precompiled JavaScript a narrow ambient type instead of labelling the
 * untyped Babel output as TSX. The suffix wildcard covers relative and aliased
 * imports of this exact composition without masking unrelated JavaScript.
 * @param {string} sourceTarget
 */
export function createShadcnPrecompiledDeclaration(sourceTarget) {
  const extension = path.posix.extname(sourceTarget);
  if (extension !== '.jsx' && extension !== '.js') {
    throw new Error(
      `Precompiled declaration source must be JavaScript: ${sourceTarget}`,
    );
  }
  const moduleSuffix = sourceTarget.slice(0, -extension.length);
  return (
    `declare module '*${moduleSuffix}' {\n` +
    `  const Component: import('react').ComponentType;\n` +
    `  export default Component;\n` +
    `}\n`
  );
}

/** @param {string} sourceTarget */
export function shadcnPrecompiledDeclarationTarget(sourceTarget) {
  const extension = path.posix.extname(sourceTarget);
  if (extension !== '.jsx' && extension !== '.js') {
    throw new Error(
      `Precompiled declaration source must be JavaScript: ${sourceTarget}`,
    );
  }
  return `${sourceTarget.slice(0, -extension.length)}.astryx.d.mts`;
}

/**
 * Match shadcn 4.19's tsx=false transform byte-for-byte. Keep this small and
 * covered by a real stock-client install test rather than importing private
 * chunks from the shadcn package.
 * @param {string} source
 */
export function transformShadcnJavaScriptSource(source) {
  const ast = recast.parse(source, {
    parser: {
      /** @param {string} input */
      parse: input => parse(input, SHADCN_PARSER_OPTIONS),
    },
  });
  const transformed = transformFromAstSync(ast, source, {
    cloneInputAst: false,
    code: false,
    ast: true,
    plugins: [transformTypeScript],
    configFile: false,
  });
  if (!transformed?.ast) {
    throw new Error('ShadCN JavaScript transform produced no AST');
  }
  return recast.print(transformed.ast).code;
}

/**
 * Ignore parser metadata and literal raw spelling while preserving the complete
 * JavaScript/JSX syntax tree and attached comment text. AST structure keeps
 * automatic-semicolon-insertion changes distinct from printer-only changes.
 * @param {unknown} value
 * @returns {unknown}
 */
function normalizeJavaScriptAst(value) {
  if (Array.isArray(value)) return value.map(normalizeJavaScriptAst);
  if (value == null || typeof value !== 'object') return value;
  const objectValue = /** @type {Record<string, unknown>} */ (value);
  /** @type {Record<string, unknown>} */
  const normalized = {};
  for (const key of Object.keys(objectValue).sort()) {
    if (
      key === 'start' ||
      key === 'end' ||
      key === 'loc' ||
      key === 'range' ||
      key === 'extra' ||
      key === 'tokens' ||
      key === 'errors'
    ) {
      continue;
    }
    normalized[key] = normalizeJavaScriptAst(objectValue[key]);
  }
  return normalized;
}

/**
 * Recognize printer-only JavaScript differences without hiding code or comment
 * edits. This protects receipts from compatible ShadCN formatter drift.
 * @param {string} left
 * @param {string} right
 */
export function shadcnJavaScriptSourcesEquivalent(left, right) {
  try {
    return (
      JSON.stringify(
        normalizeJavaScriptAst(parse(left, SHADCN_PARSER_OPTIONS)),
      ) ===
      JSON.stringify(
        normalizeJavaScriptAst(parse(right, SHADCN_PARSER_OPTIONS)),
      )
    );
  } catch {
    return false;
  }
}
