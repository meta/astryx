// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A built theme module that loads in any bundler and in plain Node: the
 * theme's local modules it carries by import (an icon registry, a slot
 * value, the helpers they import) that are TypeScript or JSX are compiled to
 * JavaScript beside the build, and every local import names its file with
 * its extension. Package imports stay as they are.
 *
 * @input the built module's carried imports, the theme source, the output folder
 * @output the imports as the built module writes them, and the compiled modules
 * @position used by `theme build` (build.mjs) for a theme's built module
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {resolveLocalModule} from '../../../foundation/discovery/module-exports.mjs';
import {
  babelCore,
  babelParse,
} from '../../../foundation/runtime/lazy-dependencies.mjs';

const require = createRequire(import.meta.url);

/** Module files that only a TypeScript or JSX compiler can load. */
const COMPILED_SOURCE = /\.(?:ts|tsx|mts|cts|jsx)$/i;
/** Module files a bundler and Node both load. */
const PLAIN_SOURCE = /\.(?:js|mjs|cjs)$/i;
/** The extensions a local import may leave out, as a bundler resolves them. */
const LOCAL_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
];

/** @param {string} specifier */
const isRelative = specifier =>
  specifier.startsWith('./') || specifier.startsWith('../');

/** @param {string} file */
const posix = file => file.split(path.sep).join('/');

/**
 * The import a module at `fromDir` writes for `file`: relative, with the
 * file's own extension.
 * @param {string} fromDir
 * @param {string} file
 */
function importOf(fromDir, file) {
  const rel = posix(path.relative(fromDir, file));
  return rel.startsWith('./') || rel.startsWith('../') ? rel : `./${rel}`;
}

/** The source a compiled module of each extension is built from. */
const SOURCE_OF = Object.freeze({
  '.js': ['.ts', '.tsx', '.jsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
});

/**
 * The file a local import names, resolved as an app's bundler resolves it,
 * TypeScript first (with an extension or a folder's index); null for a
 * package, a file that is not there, or one in `node_modules`. A module an
 * earlier build compiled names its source instead, so a change to the
 * source is compiled again.
 * @param {string} specifier
 * @param {string} fromFile
 * @param {string} marker the build header's mark
 * @returns {string | null}
 */
function localFile(specifier, fromFile, marker) {
  if (!isRelative(specifier)) return null;
  const resolved = resolveLocalModule(specifier, fromFile, {
    bundler: true,
    extensions: LOCAL_EXTENSIONS,
  });
  if (!resolved || resolved.split(path.sep).includes('node_modules'))
    return null;
  const extension = /** @type {keyof typeof SOURCE_OF} */ (
    path.extname(resolved).toLowerCase()
  );
  if (SOURCE_OF[extension] && !holdsOtherFile(resolved, marker)) {
    const stem = resolved.slice(0, -extension.length);
    const source = SOURCE_OF[extension]
      .map(ext => `${stem}${ext}`)
      .find(file => fs.existsSync(file));
    if (source) return source;
  }
  return resolved;
}

/**
 * Whether `file` holds a file the build did not write: one of the person's
 * own, which a compiled module never replaces.
 * @param {string} file
 * @param {string} marker the build header's mark
 */
function holdsOtherFile(file, marker) {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 400);
    return !head.includes(marker);
  } catch {
    return false;
  }
}

/**
 * The relative module specifiers a source writes (static imports and
 * re-exports, dynamic imports with a literal), each with where it is.
 * @param {string} source
 * @param {string} file
 * @returns {Array<{value: string, start: number, end: number}>}
 */
function specifiersOf(source, file) {
  /** @type {import('@babel/parser').ParserPlugin[]} */
  const plugins = [];
  if (/\.[cm]?tsx?$/i.test(file)) plugins.push('typescript');
  if (/\.(?:tsx|jsx)$/i.test(file) || /\.[cm]?js$/i.test(file))
    plugins.push('jsx');
  const ast = babelParse(source, {sourceType: 'module', plugins});
  /** @type {Array<{value: string, start: number, end: number}>} */
  const found = [];
  /** @param {any} node */
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    const source =
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration'
        ? node.source
        : node.type === 'ImportExpression'
          ? node.source
          : node.type === 'CallExpression' && node.callee?.type === 'Import'
            ? node.arguments?.[0]
            : null;
    if (
      source?.type === 'StringLiteral' &&
      isRelative(source.value) &&
      node.importKind !== 'type' &&
      node.exportKind !== 'type'
    )
      found.push({value: source.value, start: source.start, end: source.end});
    for (const value of Object.values(node))
      if (Array.isArray(value))
        value.forEach(child => child?.type && visit(child));
      else if (value?.type) visit(value);
  };
  visit(ast.program);
  return found;
}

/**
 * Make the built module's carried imports load anywhere. Each relative
 * import that names a TypeScript or JSX module is compiled, with the local
 * modules it imports, to JavaScript in the output folder (at the same place
 * relative to the theme source as the source module; beside the source
 * module when that is outside the theme source's folder), and the import
 * names the compiled file. A relative import of a plain JavaScript module
 * stays as the source writes it, with the file's extension written out. A compiled module is never written over
 * a file the build did not write: that import is kept as written.
 * @param {Array<{importPath: string, importedName: string, localName: string}>} bindings
 * @param {{sourceFile: string, outDir: string, header: (file: string) => string, marker: string, keep?: (binding: {importPath: string, localName: string}) => boolean}} options
 *   `header`: the build header for a compiled module, from its source file;
 *   `keep`: a binding written as given (an --icons-specifier)
 * @returns {{bindings: Array<{importPath: string, importedName: string, localName: string}>, renamed: Map<string, string>, compiled: Set<string>, writes: Array<{dest: string, content: string}>}}
 *   `renamed`: each import path as it was, to the one the module writes;
 *   `compiled`: the import paths, as they were, whose module was compiled
 */
export function selfContainedImports(bindings, options) {
  const {sourceFile, outDir, header, marker} = options;
  const sourceDir = path.dirname(sourceFile);
  /** @type {Map<string, string | null>} compiled module, by source file */
  const compiled = new Map();
  /** @type {Array<{dest: string, content: string}>} */
  const writes = [];

  /** Where a source module's compiled form goes, or null when it cannot. @param {string} file */
  const destOf = file => {
    const ext = /\.mts$/i.test(file)
      ? '.mjs'
      : /\.cts$/i.test(file)
        ? '.cjs'
        : '.js';
    const rel = path.relative(sourceDir, file);
    const inside = !rel.startsWith('..') && !path.isAbsolute(rel);
    const stem = path.basename(file).replace(/\.[^.]+$/u, '');
    const dest = inside
      ? path.join(outDir, path.dirname(rel), `${stem}${ext}`)
      : path.join(path.dirname(file), `${stem}${ext}`);
    return holdsOtherFile(dest, marker) ? null : dest;
  };

  /**
   * Compile one TypeScript or JSX module, and the local ones it imports.
   * @param {string} file
   * @returns {string | null} the compiled file, or null when it cannot be
   */
  const compile = file => {
    if (compiled.has(file))
      return /** @type {string | null} */ (compiled.get(file));
    const dest = destOf(file);
    compiled.set(file, dest);
    if (!dest) return null;
    const source = fs.readFileSync(file, 'utf8');
    /** @type {Map<string, string>} */
    const rewrite = new Map();
    for (const {value} of specifiersOf(source, file)) {
      const target = localFile(value, file, marker);
      if (!target) continue;
      const to = COMPILED_SOURCE.test(target) ? compile(target) : target;
      if (to) rewrite.set(value, importOf(path.dirname(dest), to));
    }
    const jsx = /\.(?:tsx|jsx)$/i.test(file);
    const result = babelCore().transformSync(source, {
      filename: file,
      babelrc: false,
      configFile: false,
      sourceType: 'module',
      retainLines: false,
      compact: false,
      plugins: [
        ...(/\.[cm]?tsx?$/i.test(file)
          ? [
              [
                require.resolve('@babel/plugin-transform-typescript'),
                {isTSX: jsx, allExtensions: true, onlyRemoveTypeImports: false},
              ],
            ]
          : []),
        ...(jsx
          ? [
              [
                require.resolve('@babel/plugin-transform-react-jsx'),
                {runtime: 'automatic'},
              ],
            ]
          : []),
        // The local imports name their compiled or plain file.
        () => ({
          visitor: {
            /** @param {any} p */
            StringLiteral(p) {
              const to = rewrite.get(p.node.value);
              if (!to) return;
              const parent = p.parent;
              const isSource =
                ((parent.type === 'ImportDeclaration' ||
                  parent.type === 'ExportNamedDeclaration' ||
                  parent.type === 'ExportAllDeclaration') &&
                  parent.source === p.node) ||
                parent.type === 'ImportExpression' ||
                (parent.type === 'CallExpression' &&
                  parent.callee?.type === 'Import');
              if (isSource) p.node.value = to;
            },
          },
        }),
      ],
    });
    writes.push({dest, content: header(file) + (result?.code ?? '') + '\n'});
    return dest;
  };

  /** @type {Map<string, string>} */
  const renamed = new Map();
  /** @type {Set<string>} */
  const compiledPaths = new Set();
  const out = bindings.map(binding => {
    if (options.keep?.(binding)) return binding;
    const target = localFile(binding.importPath, sourceFile, marker);
    if (!target) return binding;
    // A plain JavaScript module keeps the import as the source writes it
    // (an app may put its compiled registry beside the output), with its
    // extension written out when the source leaves it off.
    if (PLAIN_SOURCE.test(target)) {
      if (path.resolve(sourceDir, binding.importPath) === target)
        return binding;
      const importPath = importOf(sourceDir, target);
      renamed.set(binding.importPath, importPath);
      return {...binding, importPath};
    }
    const to = COMPILED_SOURCE.test(target) ? compile(target) : null;
    if (!to) return binding;
    const importPath = importOf(outDir, to);
    renamed.set(binding.importPath, importPath);
    compiledPaths.add(binding.importPath);
    return {...binding, importPath};
  });
  return {bindings: out, renamed, compiled: compiledPaths, writes};
}
