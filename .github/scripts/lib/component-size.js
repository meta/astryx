// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file component-size.js
 * @input A built package's dist directory, a component's dist entry, and the
 *   package's prebuilt stylesheet
 * @output The gzip size of the JavaScript a component's import loads eagerly
 *   (the minified entry chunk and the chunks it imports statically, package
 *   imports included) and the gzip size of the stylesheet rules referenced by
 *   the modules it can load, import() targets included
 * @position Shared by analyze-pr.js for the PR size report. Sizes are gzip at
 *   the default compression level (spec:AST-080 FR8,
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

// Bundle what importing `entry` loads eagerly: the entry chunk and the chunks
// it imports statically, including modules reached through package imports
// (other Astryx packages, React, StyleX, third-party libraries), minified for
// production. Also returns the modules of every chunk the import can load,
// import() targets included, for CSS. Returns null when the import cannot be
// bundled.
function bundleImportWithInputs(entry, exportName) {
  if (!entry || !fs.existsSync(entry)) return null;
  const os = require('node:os');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-size-'));
  try {
    const esbuild = require('esbuild');
    const workingDir = process.cwd();
    const entryFile = path.join(scratch, 'entry.mjs');
    fs.writeFileSync(
      entryFile,
      exportName
        ? `export {${exportName}} from ${JSON.stringify(path.resolve(entry))};`
        : `export * from ${JSON.stringify(path.resolve(entry))};`,
    );
    // Code splitting keeps modules reached only through import() in their own
    // chunks, so the figure counts what the import loads eagerly: the entry
    // chunk and every chunk it imports statically.
    const outdir = path.join(scratch, 'out');
    const result = esbuild.buildSync({
      absWorkingDir: workingDir,
      entryPoints: [entryFile],
      outdir,
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
    });
    const outputs = result.metafile.outputs;
    const byPath = new Map(
      result.outputFiles.map(file => [
        path.relative(workingDir, file.path),
        file.text,
      ]),
    );
    const entryOutput = Object.keys(outputs).find(
      key => outputs[key].entryPoint !== undefined,
    );
    // Chunks the entry reaches, following only the given import kinds.
    function reachable(kinds) {
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
    let text = '';
    for (const key of reachable(['import-statement'])) {
      text += byPath.get(key) ?? '';
    }
    // CSS ships in the package stylesheet whether its module loads eagerly or
    // through import(), so class names come from every chunk the entry can
    // load, dynamic imports included; chunks no kept code imports are ignored.
    const inputs = new Set();
    for (const key of reachable(['import-statement', 'dynamic-import'])) {
      for (const input of Object.keys(outputs[key].inputs || {})) {
        inputs.add(path.resolve(workingDir, input));
      }
    }
    inputs.delete(entryFile);
    return {text, inputs: [...inputs]};
  } catch {
    return null;
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}

// The modules each entry's bundle reaches, import() targets included, from one
// build over every entry: Map of absolute entry path to absolute input paths.
// Returns null when the entries cannot be bundled together.
function bundleInputsByEntry(entries) {
  const existing = entries.filter(entry => fs.existsSync(entry));
  if (existing.length === 0) return new Map();
  const os = require('node:os');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-reach-'));
  try {
    const esbuild = require('esbuild');
    const workingDir = process.cwd();
    const result = esbuild.buildSync({
      absWorkingDir: workingDir,
      entryPoints: existing,
      outdir: scratch,
      metafile: true,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      define: {'process.env.NODE_ENV': '"production"'},
      loader: {'.css': 'empty'},
      write: false,
      logLevel: 'silent',
    });
    const reach = new Map();
    for (const output of Object.values(result.metafile.outputs)) {
      if (output.entryPoint === undefined) continue;
      reach.set(
        fs.realpathSync(path.resolve(workingDir, output.entryPoint)),
        Object.keys(output.inputs).map(input =>
          path.resolve(workingDir, input),
        ),
      );
    }
    // Key by the paths callers passed, which may differ from real paths.
    const byEntry = new Map();
    for (const entry of existing) {
      byEntry.set(entry, reach.get(fs.realpathSync(entry)) ?? []);
    }
    return byEntry;
  } catch {
    return null;
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
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
  packageStylesheetPath,
  bundleImport,
  classNamesIn,
  rulesForClasses,
  measureComponentImport,
  bundleInputsByEntry,
};
