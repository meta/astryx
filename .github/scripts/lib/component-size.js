// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file component-size.js
 * @input A built package's dist directory, a component's dist entry, and the
 *   package's prebuilt stylesheet
 * @output The gzip size of the JavaScript a component's import loads eagerly
 *   (the minified entry chunk and the chunks it imports statically, package
 *   imports included) and the gzip size of the stylesheet rules referenced by
 *   the modules it can load, import() targets included
 * @position Shared by analyze-pr.js for the PR size report, by the
 *   English-fallback import-cost test, which bundles several imports in one
 *   build, and by the component import-boundaries check, which builds each
 *   entry with the same esbuild options. Sizes are gzip at the default
 *   compression level (spec:AST-080 FR8,
 *   architecture:component-style-authoring INV6).
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function gzipBytes(text) {
  return zlib.gzipSync(Buffer.from(text, 'utf8')).length;
}

// The package's prebuilt stylesheet: `dist/<name>.css` from its `.css` export
// other than the reset and Tailwind theme files.
function packageStylesheetPath(packageDir) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
    const keys = Object.keys(manifest.exports || {}).filter(
      key =>
        key.endsWith('.css') &&
        key !== './reset.css' &&
        key !== './tailwind-theme.css',
    );
    for (const key of keys) {
      const target = manifest.exports[key];
      const file = typeof target === 'string' ? target : target?.default;
      if (!file) continue;
      const resolved = path.join(packageDir, file);
      if (fs.existsSync(resolved)) return resolved;
    }
  } catch {
    // An unreadable manifest has no stylesheet to measure.
  }
  return null;
}

// The import under measurement reaches esbuild as stdin, read as if it were
// this file beside the entry. The outputs stay in memory under this directory
// of the working directory, so nothing is written. esbuild reads the listing
// of every directory above each file it bundles. On a shared machine the
// system temp directory can hold hundreds of thousands of entries. A file
// written there for the import cost more than the build itself.
const ENTRY_SOURCE = '__astryx-size-entry__.mjs';
const OUT_DIR = '.astryx-size-out';

// Bundle what importing `entry` loads eagerly: the entry chunk and the chunks
// it imports statically, including modules reached through package imports
// (other Astryx packages, React, StyleX, third-party libraries), minified for
// production. Also returns the modules of every chunk the import can load,
// import() targets included, for CSS. Returns null when the import cannot be
// bundled.
function bundleImportWithInputs(entry, exportName) {
  if (!entry || !fs.existsSync(entry)) return null;
  try {
    const workingDir = process.cwd();
    const resolveDir = path.dirname(path.resolve(entry));
    const entryFile = path.join(resolveDir, ENTRY_SOURCE);
    const {outputs, byPath} = splitBuild(
      {
        stdin: {
          contents: exportName
            ? `export {${exportName}} from ${JSON.stringify(path.resolve(entry))};`
            : `export * from ${JSON.stringify(path.resolve(entry))};`,
          resolveDir,
          sourcefile: ENTRY_SOURCE,
          loader: 'js',
        },
      },
      workingDir,
    );
    // A chunk an import() reaches is an entry point too: the import's own
    // chunk is the one whose entry is the import.
    const entryPoint = path
      .relative(workingDir, entryFile)
      .split(path.sep)
      .join('/');
    const entryOutput = Object.keys(outputs).find(
      key => outputs[key].entryPoint === entryPoint,
    );
    if (entryOutput === undefined) return null;
    const text = eagerText(outputs, byPath, entryOutput);
    // CSS ships in the package stylesheet whether its module loads eagerly or
    // through import(), so class names come from every chunk the entry can
    // load, dynamic imports included; chunks no kept code imports are ignored.
    const inputs = new Set();
    for (const key of reachableChunks(outputs, entryOutput, [
      'import-statement',
      'dynamic-import',
    ])) {
      for (const input of Object.keys(outputs[key].inputs || {})) {
        inputs.add(path.resolve(workingDir, input));
      }
    }
    inputs.delete(entryFile);
    return {text, inputs: [...inputs]};
  } catch {
    return null;
  }
}

// The esbuild options of a build as the size report measures an import:
// minified ESM for the browser, without CSS, its outputs in memory. Code
// splitting keeps modules reached only through import() in their own chunks.
// So an entry chunk and the chunks it imports statically are what the import
// loads eagerly.
function sizeBuildOptions(workingDir) {
  return {
    absWorkingDir: workingDir,
    outdir: path.join(workingDir, OUT_DIR),
    metafile: true,
    bundle: true,
    splitting: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    define: {'process.env.NODE_ENV': '"production"'},
    loader: {'.css': 'empty'},
    write: false,
    logLevel: 'silent',
  };
}

// One build with the size report's options. `input` names the entries:
// `{stdin}` or `{entryPoints}`. Returns the metafile outputs and each
// output's text by its relative path.
function splitBuild(input, workingDir) {
  const esbuild = require('esbuild');
  const result = esbuild.buildSync({...sizeBuildOptions(workingDir), ...input});
  const byPath = new Map(
    result.outputFiles.map(file => [
      path.relative(workingDir, file.path),
      file.text,
    ]),
  );
  return {outputs: result.metafile.outputs, byPath};
}

// Chunks an entry chunk reaches in a build's metafile outputs, following only
// the given import kinds.
function reachableChunks(outputs, entryOutput, kinds) {
  const seen = new Set();
  const pending = [entryOutput];
  while (pending.length > 0) {
    const key = pending.pop();
    if (key === undefined || seen.has(key)) continue;
    seen.add(key);
    for (const imported of outputs[key].imports || []) {
      if (kinds.includes(imported.kind) && !imported.external) {
        pending.push(imported.path);
      }
    }
  }
  return seen;
}

// What importing an entry loads eagerly: its chunk and every chunk it imports
// statically, concatenated.
function eagerText(outputs, byPath, entryOutput) {
  let text = '';
  for (const key of reachableChunks(outputs, entryOutput, [
    'import-statement',
  ])) {
    text += byPath.get(key) ?? '';
  }
  return text;
}

// Each entry's output key in a build over the entries, by the path the caller
// passed. esbuild names an entry by its path from the working directory, with
// links resolved, so the match compares real paths.
function entryOutputKeys(entries, outputs, workingDir) {
  const byRealPath = new Map();
  for (const [key, output] of Object.entries(outputs)) {
    if (output.entryPoint === undefined) continue;
    byRealPath.set(
      fs.realpathSync(path.resolve(workingDir, output.entryPoint)),
      key,
    );
  }
  const keys = new Map();
  for (const entry of entries) {
    const key = byRealPath.get(fs.realpathSync(entry));
    if (key !== undefined) keys.set(entry, key);
  }
  return keys;
}

// What importing each entry loads eagerly, from one build over every entry.
// The build parses the modules the entries share once, not once per entry. A
// file the entries share goes into one chunk with every part that any entry
// keeps. Each entry is an entry point, so its default export counts too. So
// each text holds at least what the entry's own build loads eagerly. That
// bounds what an import keeps from above, and it is not the import's size.
// Returns a Map of each bundled entry path to its text, or null when the
// entries cannot be bundled together.
function bundleImportsByEntry(entries) {
  const existing = entries.filter(entry => fs.existsSync(entry));
  if (existing.length === 0) return new Map();
  try {
    const workingDir = process.cwd();
    const {outputs, byPath} = splitBuild({entryPoints: existing}, workingDir);
    const texts = new Map();
    for (const [entry, key] of entryOutputKeys(existing, outputs, workingDir)) {
      texts.set(entry, eagerText(outputs, byPath, key));
    }
    return texts;
  } catch {
    return null;
  }
}

// The modules each entry's bundle reaches, import() targets included, from one
// build over every entry: Map of absolute entry path to absolute input paths.
// Returns null when the entries cannot be bundled together.
function bundleInputsByEntry(entries) {
  const existing = entries.filter(entry => fs.existsSync(entry));
  if (existing.length === 0) return new Map();
  try {
    const esbuild = require('esbuild');
    const workingDir = process.cwd();
    const result = esbuild.buildSync({
      absWorkingDir: workingDir,
      entryPoints: existing,
      outdir: path.join(workingDir, OUT_DIR),
      metafile: true,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      define: {'process.env.NODE_ENV': '"production"'},
      loader: {'.css': 'empty'},
      write: false,
      logLevel: 'silent',
    });
    const outputs = result.metafile.outputs;
    const keys = entryOutputKeys(existing, outputs, workingDir);
    const byEntry = new Map();
    for (const entry of existing) {
      const key = keys.get(entry);
      byEntry.set(
        entry,
        key === undefined
          ? []
          : Object.keys(outputs[key].inputs).map(input =>
              path.resolve(workingDir, input),
            ),
      );
    }
    return byEntry;
  } catch {
    return null;
  }
}

function bundleImport(entry) {
  return bundleImportWithInputs(entry)?.text ?? null;
}

// StyleX atomic class names the bundle references.
function classNamesIn(js) {
  return new Set(js.match(/\bx[a-z0-9]{3,12}\b/g) || []);
}

// Parse CSS into nested blocks: {prelude, children} for block rules and
// {prelude} for statements. Comments are dropped; strings are kept intact.
function parseBlocks(css) {
  let index = 0;
  function skipComment() {
    if (css.startsWith('/*', index)) {
      const end = css.indexOf('*/', index + 2);
      index = end < 0 ? css.length : end + 2;
      return true;
    }
    return false;
  }
  function readUntil(stops) {
    let out = '';
    while (index < css.length && !stops.includes(css[index])) {
      if (skipComment()) continue;
      const ch = css[index];
      if (ch === '"' || ch === "'") {
        const start = index;
        index += 1;
        while (index < css.length && css[index] !== ch) {
          if (css[index] === '\\') index += 1;
          index += 1;
        }
        index += 1;
        out += css.slice(start, index);
        continue;
      }
      out += ch;
      index += 1;
    }
    return out;
  }
  function parseList() {
    const nodes = [];
    while (index < css.length) {
      const prelude = readUntil(['{', ';', '}']).trim();
      const ch = css[index];
      if (ch === '}') {
        index += 1;
        break;
      }
      index += 1;
      if (ch === ';' || ch === undefined) {
        if (prelude) nodes.push({prelude});
        continue;
      }
      // A style rule's body holds declarations; an at-rule's body may hold rules.
      if (
        prelude.startsWith('@') &&
        !/^@(font-face|page|property)\b/.test(prelude)
      ) {
        nodes.push({prelude, children: parseList()});
      } else {
        const body = readUntil(['}']);
        index += 1;
        nodes.push({prelude, body});
      }
    }
    return nodes;
  }
  return parseList();
}

// The stylesheet rules whose selectors name one of `classes`, inside the
// at-rules that wrap them, plus the @keyframes those rules name.
function rulesForClasses(css, classes) {
  if (!css || classes.size === 0) return '';
  const classPattern = /\.([A-Za-z_][\w-]*)/g;
  const tree = parseBlocks(css);
  function keep(nodes, keyframes) {
    let out = '';
    for (const node of nodes) {
      if (node.children) {
        const name = /^@(?:-webkit-)?keyframes\s+([\w-]+)/.exec(
          node.prelude,
        )?.[1];
        if (name !== undefined) {
          if (keyframes.has(name)) {
            out += `${node.prelude}{${node.children.map(child => `${child.prelude}{${child.body ?? ''}}`).join('')}}`;
          }
          continue;
        }
        const inner = keep(node.children, keyframes);
        if (inner) out += `${node.prelude}{${inner}}`;
      } else if (node.body !== undefined) {
        const names = [...node.prelude.matchAll(classPattern)].map(m => m[1]);
        if (names.some(name => classes.has(name))) {
          out += `${node.prelude}{${node.body}}`;
        }
      }
    }
    return out;
  }
  const rules = keep(tree, new Set());
  // Keyframes a kept rule names through `animation` or `animation-name`.
  const named = new Set();
  for (const match of rules.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const token of match[1].split(/[\s,]+/)) if (token) named.add(token);
  }
  return named.size === 0 ? rules : keep(tree, named);
}

/**
 * Measure one component import: gzip JavaScript it pulls in and gzip CSS of
 * the stylesheet rules that JavaScript references. Null where unmeasurable.
 */
function measureComponentImport(entry, stylesheetText, ownDistDir, exportName) {
  const bundle = bundleImportWithInputs(entry, exportName);
  if (bundle === null) return {importGzipBytes: null, cssGzipBytes: null};
  // CSS counts only the rules the component's own package modules reference:
  // classes from modules reached in other packages belong to their stylesheets.
  // Compare real paths: esbuild reports inputs with symlinks resolved.
  const ownDir =
    fs.realpathSync(path.resolve(ownDistDir || path.dirname(entry))) + path.sep;
  const classes = new Set();
  for (const input of bundle.inputs) {
    if (!fs.existsSync(input) || !fs.realpathSync(input).startsWith(ownDir))
      continue;
    for (const name of classNamesIn(fs.readFileSync(input, 'utf8')))
      classes.add(name);
  }
  const css = stylesheetText ? rulesForClasses(stylesheetText, classes) : null;
  return {
    importGzipBytes: gzipBytes(bundle.text),
    cssGzipBytes: css === null ? null : gzipBytes(css),
  };
}

module.exports = {
  gzipBytes,
  sizeBuildOptions,
  reachableChunks,
  eagerText,
  packageStylesheetPath,
  bundleImport,
  classNamesIn,
  rulesForClasses,
  measureComponentImport,
  bundleImportsByEntry,
  bundleInputsByEntry,
};
