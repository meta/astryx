// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A built theme module that loads in any bundler and in plain Node: the
 * theme's local modules it carries by import (an icon registry, a slot
 * value, the helpers they import) that are TypeScript or JSX are compiled to
 * JavaScript beside the build, and every local import names its file with
 * its extension. Package imports stay as they are.
 *
 * It reads files only through the `files` reader the theme adapter gives it.
 *
 * @input the built module's carried imports, the theme source, the output
 *   folder, and the adapter's file reader
 * @output the imports as the built module writes them, and the compiled modules
 * @position used by `theme build` (build.mjs) for a theme's built module; its
 *   file reader is `localModuleFiles` in ../_adapter.mjs
 */

import * as path from 'node:path';
import {
  babelCore,
  babelParse,
} from '../../../foundation/runtime/lazy-dependencies.mjs';

/**
 * How the module reads the theme's local files, given by the theme adapter.
 * @typedef {object} LocalModuleFiles
 * @property {(file: string) => string | null} read a file's text, or null
 * @property {(file: string) => boolean} exists
 * @property {(specifier: string, fromFile: string, extensions: readonly string[]) => string | null} resolve
 *   a relative import's file, as an app's bundler resolves it
 * @property {{typescript: string, jsx: string}} plugins the Babel plugins
 *   that compile TypeScript and JSX, as module paths
 */

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
 * @param {LocalModuleFiles} files
 * @param {string} specifier
 * @param {string} fromFile
 * @param {string} marker the build header's mark
 * @returns {string | null}
 */
function localFile(files, specifier, fromFile, marker) {
  if (!isRelative(specifier)) return null;
  const resolved = files.resolve(specifier, fromFile, LOCAL_EXTENSIONS);
  if (!resolved || resolved.split(path.sep).includes('node_modules'))
    return null;
  const extension = /** @type {keyof typeof SOURCE_OF} */ (
    path.extname(resolved).toLowerCase()
  );
  if (SOURCE_OF[extension] && !holdsOtherFile(files, resolved, marker)) {
    const stem = resolved.slice(0, -extension.length);
    const source = SOURCE_OF[extension]
      .map(ext => `${stem}${ext}`)
      .find(file => files.exists(file));
    if (source) return source;
  }
  return resolved;
}

/**
 * Whether `file` holds a file the build did not write: one of the person's
 * own, which a compiled module never replaces.
 * @param {LocalModuleFiles} files
 * @param {string} file
 * @param {string} marker the build header's mark
 */
function holdsOtherFile(files, file, marker) {
  const text = files.read(file);
  return text != null && !text.slice(0, 400).includes(marker);
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
 * The deepest folder that holds every one of `dirs`.
 * @param {string[]} dirs
 */
function commonFolder(dirs) {
  let common = path.resolve(dirs[0]);
  for (const dir of dirs.slice(1)) {
    const resolved = path.resolve(dir);
    while (
      resolved !== common &&
      !resolved.startsWith(
        common.endsWith(path.sep) ? common : common + path.sep,
      )
    ) {
      const up = path.dirname(common);
      if (up === common) break;
      common = up;
    }
  }
  return common;
}

/**
 * Make built modules' carried imports load anywhere. Each relative import
 * that names a TypeScript or JSX module is compiled, with the local
 * TypeScript or JSX modules it imports, to JavaScript under the output
 * folder, and the import names the compiled file. A compiled module goes
 * to the place under the output folder that its source has under the folder
 * holding every theme source and compiled source (beside the outputs for a
 * registry beside the theme source), so two sources never share one
 * compiled file and nothing is written into the source tree. A relative
 * import of a plain JavaScript module stays as the source writes it, with
 * the file's extension written out. A compiled module is never written
 * over a file the build did not write: the imports of that source are kept
 * as written.
 * @param {Array<{sourceFile: string, bindings: Array<{importPath: string, importedName: string, localName: string}>}>} entries
 *   each theme source (a family's members), with the imports its built
 *   module carries
 * @param {{outDir: string, header: (file: string) => string, marker: string, files: LocalModuleFiles, keep?: (binding: {importPath: string, localName: string}) => boolean}} options
 *   `header`: the build header for a compiled module, from its source file;
 *   `files`: the theme adapter's file reader;
 *   `keep`: a binding written as given (an --icons-specifier)
 * @returns {{entries: Array<{bindings: Array<{importPath: string, importedName: string, localName: string}>, renamed: Map<string, string>, compiled: Map<string, string>}>, writes: Array<{dest: string, content: string}>}}
 *   for each entry, `renamed`: each import path as it was, to the one the
 *   module writes; `compiled`: each import path, as it was, whose module was
 *   compiled, to that module's source file
 */
export function selfContainedImports(entries, options) {
  const {outDir, header, marker, files} = options;
  /** @param {{importPath: string, localName: string}} binding */
  const kept = binding => Boolean(options.keep?.(binding));

  // Every TypeScript or JSX module the built modules reach, with what each
  // imports: read once.
  /** @type {Map<string, {source: string, imports: Array<{value: string, target: string}>}>} */
  const graph = new Map();
  /** @param {string} file */
  const visit = file => {
    if (graph.has(file)) return;
    const source = files.read(file);
    if (source == null) return;
    /** @type {Array<{value: string, target: string}>} */
    const imports = [];
    graph.set(file, {source, imports});
    for (const {value} of specifiersOf(source, file)) {
      const target = localFile(files, value, file, marker);
      if (!target) continue;
      imports.push({value, target});
      if (COMPILED_SOURCE.test(target)) visit(target);
    }
  };
  for (const entry of entries)
    for (const binding of entry.bindings) {
      if (kept(binding)) continue;
      const target = localFile(
        files,
        binding.importPath,
        entry.sourceFile,
        marker,
      );
      if (target && COMPILED_SOURCE.test(target)) visit(target);
    }

  const root = commonFolder([
    ...entries.map(entry => path.dirname(entry.sourceFile)),
    ...[...graph.keys()].map(file => path.dirname(file)),
  ]);
  /** @type {Map<string, string>} compiled file, by source; absent when it cannot be */
  const destOf = new Map();
  /** @type {Set<string>} */
  const claimed = new Set();
  for (const file of graph.keys()) {
    const ext = /\.mts$/i.test(file)
      ? '.mjs'
      : /\.cts$/i.test(file)
        ? '.cjs'
        : '.js';
    const rel = path.relative(root, file).replace(/\.[^./\\]+$/u, ext);
    const dest = path.join(outDir, rel);
    if (claimed.has(dest) || holdsOtherFile(files, dest, marker)) continue;
    claimed.add(dest);
    destOf.set(file, dest);
  }

  /** @type {Array<{dest: string, content: string}>} */
  const writes = [];
  for (const [file, {source, imports}] of graph) {
    const dest = destOf.get(file);
    if (!dest) continue;
    /** @type {Map<string, string>} */
    const rewrite = new Map();
    for (const {value, target} of imports) {
      const to = COMPILED_SOURCE.test(target) ? destOf.get(target) : target;
      if (to) rewrite.set(value, importOf(path.dirname(dest), to));
    }
    writes.push({
      dest,
      content:
        header(file) + compileModule(files, file, source, rewrite) + '\n',
    });
  }

  return {
    entries: entries.map(entry => {
      const sourceDir = path.dirname(entry.sourceFile);
      /** @type {Map<string, string>} */
      const renamed = new Map();
      /** @type {Map<string, string>} */
      const compiledPaths = new Map();
      const bindings = entry.bindings.map(binding => {
        if (kept(binding)) return binding;
        const target = localFile(
          files,
          binding.importPath,
          entry.sourceFile,
          marker,
        );
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
        const to = destOf.get(target);
        if (!to) return binding;
        const importPath = importOf(outDir, to);
        renamed.set(binding.importPath, importPath);
        compiledPaths.set(binding.importPath, target);
        return {...binding, importPath};
      });
      return {bindings, renamed, compiled: compiledPaths};
    }),
    writes,
  };
}

/**
 * One TypeScript or JSX module as JavaScript, its local imports naming
 * the files `rewrite` gives.
 * @param {LocalModuleFiles} files
 * @param {string} file
 * @param {string} source
 * @param {Map<string, string>} rewrite import as written, to the import it becomes
 */
function compileModule(files, file, source, rewrite) {
  const jsx = /\.(?:tsx|jsx)$/i.test(file);
  const result = babelCore().transformSync(source, {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    compact: false,
    plugins: [
      ...(/\.[cm]?tsx?$/i.test(file)
        ? [
            [
              files.plugins.typescript,
              {isTSX: jsx, allExtensions: true, onlyRemoveTypeImports: false},
            ],
          ]
        : []),
      ...(jsx ? [[files.plugins.jsx, {runtime: 'automatic'}]] : []),
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
  return result?.code ?? '';
}
