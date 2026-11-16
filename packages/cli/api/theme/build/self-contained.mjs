// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A built theme module that loads in any bundler and in plain Node: the
 * theme's local modules it carries by import (an icon registry, a slot
 * value, the helpers they import) that are TypeScript or JSX are compiled to
 * JavaScript beside the build, and every local import names its file with
 * its extension. Package imports stay as they are.
 *
 * It reads the theme's files only through the `files` reader the theme
 * adapter gives it. The JavaScript it compiles is kept between runs, under
 * the stamps of every file of Babel's code that compiled it.
 *
 * @input the built module's carried imports, the theme source, the output
 *   folder, and the adapter's file reader
 * @output the imports as the built module writes them, and the compiled modules
 * @position used by `theme build` (build.mjs) for a theme's built module; its
 *   file reader is `localModuleFiles` in ../_adapter.mjs
 */

import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {babelCore} from '../../../foundation/runtime/lazy-dependencies.mjs';
import {persistedSummary} from '../../../foundation/fs/gather-cache.mjs';
import {loadedCodeStamps} from '../../../foundation/fs/loaded-files.mjs';
import {moduleImports} from '../../../foundation/render/embedded-imports.mjs';

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

/**
 * The file a local import names, resolved as an app's bundler resolves it,
 * TypeScript first (with an extension or a folder's index); null for a
 * package, a file that is not there, or one in `node_modules`.
 * @param {LocalModuleFiles} files
 * @param {string} specifier
 * @param {string} fromFile
 * @returns {string | null}
 */
function localFile(files, specifier, fromFile) {
  if (!isRelative(specifier)) return null;
  const resolved = files.resolve(specifier, fromFile, LOCAL_EXTENSIONS);
  return resolved && !resolved.split(path.sep).includes('node_modules')
    ? resolved
    : null;
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
 * The relative imports a module makes that bring in code (type-only
 * imports aside).
 * @param {string} source
 * @param {string} file
 * @returns {string[]}
 */
function codeImportsOf(source, file) {
  return (moduleImports(source, file) ?? [])
    .filter(each => !each.typeOnly && isRelative(each.specifier))
    .map(each => each.specifier);
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
 * TypeScript or JSX modules it imports, to JavaScript in the build's own
 * modules folder (`modulesDir`, one per output stem), and the import names
 * the compiled file. A compiled module is its source's name with `.js`
 * added (`icons.tsx.js`), at the place its source has under the folder that
 * holds the theme sources and every compiled source, so each source has
 * one path of its own by construction, and no two builds share one. A
 * relative import of a plain JavaScript module stays as the source writes
 * it, with the file's extension written out. A compiled module is never
 * written over a file the build did not write: that source's import is
 * kept as written, and named in `kept`.
 * @param {Array<{sourceFile: string, bindings: Array<{importPath: string, importedName: string, localName: string}>}>} entries
 *   each theme source (a family's members), with the imports its built
 *   module carries
 * @param {{outDir: string, modulesDir: string, header: (file: string) => string, marker: string, files: LocalModuleFiles, keep?: (binding: {importPath: string, localName: string}) => boolean}} options
 *   `outDir`: where the built modules are; `modulesDir`: the folder the
 *   compiled modules go to; `header`: the build header for a compiled
 *   module, from its source file;
 *   `files`: the theme adapter's file reader;
 *   `keep`: a binding written as given (an --icons-specifier)
 * @returns {{entries: Array<{bindings: Array<{importPath: string, importedName: string, localName: string}>, renamed: Map<string, string>, compiled: Map<string, string>}>, writes: Array<{dest: string, content: string, source: string}>, kept: Array<{source: string, dest: string}>}}
 *   for each entry, `renamed`: each import path as it was, to the one the
 *   module writes; `compiled`: each import path, as it was, whose module was
 *   compiled, to that module's source file; `kept`: each source not
 *   compiled because a file of the person's own holds its compiled path
 */
export function selfContainedImports(entries, options) {
  const {outDir, modulesDir, header, marker, files} = options;
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
    for (const value of codeImportsOf(source, file)) {
      const target = localFile(files, value, file);
      if (!target) continue;
      imports.push({value, target});
      if (COMPILED_SOURCE.test(target)) visit(target);
    }
  };
  for (const entry of entries)
    for (const binding of entry.bindings) {
      if (kept(binding)) continue;
      const target = localFile(files, binding.importPath, entry.sourceFile);
      if (target && COMPILED_SOURCE.test(target)) visit(target);
    }

  const root = commonFolder([
    ...entries.map(entry => path.dirname(entry.sourceFile)),
    ...[...graph.keys()].map(file => path.dirname(file)),
  ]);
  /** @type {Map<string, string>} compiled file, by source; absent when it cannot be */
  const destOf = new Map();
  /** @type {Array<{source: string, dest: string}>} */
  const keptSources = [];
  for (const file of graph.keys()) {
    // `icons.tsx` → `icons.tsx.js`: one path per source, and an import of
    // `./icons` never finds the compiled copy.
    const dest = path.join(modulesDir, `${path.relative(root, file)}.js`);
    if (holdsOtherFile(files, dest, marker))
      keptSources.push({source: file, dest});
    else destOf.set(file, dest);
  }

  /** @type {Array<{dest: string, content: string, source: string}>} */
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
      source: file,
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
        const target = localFile(files, binding.importPath, entry.sourceFile);
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
    kept: keptSources,
  };
}

/**
 * The options Babel compiles one module with, but for the plugin that
 * rewrites its imports. No Babel config file or `.babelrc` of the project is
 * read, so the JavaScript depends only on these, the source, the rewrites and
 * Babel's own code.
 * @param {LocalModuleFiles} files
 * @param {string} file
 */
function compileOptions(files, file) {
  const jsx = /\.(?:tsx|jsx)$/i.test(file);
  return {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceType: /** @type {const} */ ('module'),
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
    ],
  };
}

/**
 * The Babel plugin that makes a module's local imports name their compiled
 * or plain file.
 * @param {Map<string, string>} rewrite import as written, to the import it becomes
 */
function rewriteImports(rewrite) {
  return () => ({
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
  });
}

/**
 * One TypeScript or JSX module as JavaScript, its local imports naming the
 * files `rewrite` gives. The JavaScript is kept between runs beside the kept
 * gathers (fs/gather-cache.mjs persistedSummary): it is read back while the
 * source, the options, the rewrites and every file of Babel's code that made
 * it are as they were, so a build of an unchanged theme loads neither
 * `@babel/core` nor its plugins.
 * @param {LocalModuleFiles} files
 * @param {string} file
 * @param {string} source
 * @param {Map<string, string>} rewrite import as written, to the import it becomes
 */
function compileModule(files, file, source, rewrite) {
  const options = compileOptions(files, file);
  const key = createHash('sha256')
    .update(
      JSON.stringify({
        source,
        options,
        rewrite: [...rewrite].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        rewriteImports: String(rewriteImports),
        // What Babel reads for a config's `env` blocks; none is read here,
        // so it stays only as an input Babel could consult.
        envName: process.env.BABEL_ENV || process.env.NODE_ENV || 'development',
      }),
    )
    .digest('hex');
  let current = false;
  return persistedSummary(
    ['theme-module-javascript', key],
    () => {
      const result = babelCore().transformSync(source, {
        ...options,
        plugins: [...options.plugins, rewriteImports(rewrite)],
      });
      const code = result?.code ?? '';
      const require = createRequire(import.meta.url);
      const roots = [
        require.resolve('@babel/core'),
        ...options.plugins.map(([plugin]) => String(plugin)),
      ];
      // Kept only while Babel's files, and the package folders its
      // modules were found in, are those this process loaded: after a
      // reinstall, the JavaScript is the old Babel's.
      const {stamps, unchangedSinceStart} = loadedCodeStamps(
        fileURLToPath(import.meta.url),
        roots,
      );
      current = unchangedSinceStart;
      return {value: code, stamps};
    },
    {keep: code => current && code !== ''},
  );
}
