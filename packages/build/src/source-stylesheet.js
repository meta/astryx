// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build: source stylesheets. A source build of a package's
 * modules prints its prebuilt stylesheet's rules, selectors and order. It
 * prints them in one `@layer astryx-base` after the layer order.
 * `stylexOptions()` holds the options the prebuilt stylesheets use
 * (scripts/build-css.mjs), `packageModules()` the module set, and
 * `renderPackage()` prints it. The bundler compiles the same modules with the
 * same options (turbopack-loader.js), so rendered class names match the rules.
 */

const fs = require('node:fs');
const path = require('node:path');
const {globSync} = require('fast-glob');

// Loaded on first use: next.js reads this file's package helpers on the
// webpack path too, which must not start requiring the compiler.
const babel = () => require('@babel/core');
const stylexBabelPlugin = () => require('@stylexjs/babel-plugin');

/** The packages the webpack setup of withAstryx() transpiles from source.
 * Rich Text and Charts keep their prebuilt stylesheets there. */
const ASTRYX_PACKAGES = [
  '@astryxdesign/core',
  '@astryxdesign/theme-neutral',
  '@astryxdesign/lab',
];

/** The packages a Turbopack source build compiles when they ship `source`
 * entries. They are every package with a prebuilt stylesheet, in the order
 * their blocks print. Theme packages ship none and keep their stylesheet. */
const SOURCE_PACKAGES = [
  ...ASTRYX_PACKAGES,
  '@astryxdesign/charts',
  '@astryxdesign/richtext',
];

const CORE = '@astryxdesign/core';
const STYLEX_MODULE = /\.stylex\.[cm]?[jt]sx?$/;

/**
 * Each package's prebuilt stylesheet export: the file a source build replaces,
 * and never takes a rule from.
 */
const PREBUILT_STYLESHEETS = {
  [CORE]: './astryx.css',
  '@astryxdesign/lab': './lab.css',
  '@astryxdesign/charts': './charts.css',
  '@astryxdesign/richtext': './richtext.css',
};

/**
 * Variable modules a prebuilt stylesheet compiles though none of the package's
 * modules imports them: scripts/build-css.mjs's `stylexEntries`. Core's public
 * `dataVars` entry is one, since an app reads its defaults as plain `var()`
 * references. The parity test, whose reference comes from that script's own
 * targets, fails if this list drifts from it.
 */
const STYLEX_ENTRIES = {[CORE]: ['theme/dataTokens.stylex.ts']};

/**
 * Locate an installed package's directory by walking `node_modules` up from
 * `from`, the way Node resolves a bare specifier. Null when not installed.
 */
function findPackageDir(name, from) {
  let dir = path.resolve(from);
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function readManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

/**
 * The installed packages a source build compiles, in `SOURCE_PACKAGES`
 * order, each with its exact `source` entries (request → file). A package's
 * source directory is the one its root entry lives in.
 */
function sourcePackages(from) {
  const packages = [];
  for (const name of SOURCE_PACKAGES) {
    const dir = findPackageDir(name, from);
    const exports = dir && readManifest(dir)?.exports;
    if (exports == null || typeof exports !== 'object') {
      continue;
    }
    const entries = new Map();
    for (const [key, value] of Object.entries(exports)) {
      if (typeof value?.source === 'string' && !key.includes('*')) {
        const request = key === '.' ? name : `${name}/${key.slice(2)}`;
        entries.set(request, path.resolve(dir, value.source));
      }
    }
    if (entries.has(name)) {
      packages.push({
        name,
        dir,
        srcDir: path.dirname(entries.get(name)),
        entries,
      });
    }
  }
  return packages;
}

/**
 * The file an installed package's prebuilt stylesheet export names, or null
 * when the package has none.
 */
function prebuiltStylesheet(pkg) {
  const key = PREBUILT_STYLESHEETS[pkg.name];
  const target = key && readManifest(pkg.dir).exports?.[key];
  const file = typeof target === 'string' ? target : target?.default;
  return typeof file === 'string' ? path.resolve(pkg.dir, file) : null;
}

/**
 * The StyleX options the prebuilt stylesheets are compiled with: the default
 * `x` class-name prefix, no development class names and StyleX's default
 * property validation. Plain JSON, since Turbopack passes only serializable
 * loader options: `pluginOptions()` adds the resolution's functions.
 */
function stylexOptions(pkg, packages) {
  const core = packages.find(candidate => candidate.name === CORE);
  return {
    dev: false,
    runtimeInjection: false,
    genConditionalClasses: true,
    treeshakeCompensation: true,
    aliases:
      pkg.name === CORE || core == null
        ? {}
        : {
            '@astryxdesign/core/*': [path.join(core.srcDir, '*')],
            '@astryxdesign/core': [core.srcDir],
          },
    unstable_moduleResolution: {type: 'custom', rootDir: pkg.dir},
  };
}

// Resolution failures that mean an import cannot be found from its importer.
const UNRESOLVED = new Set([
  'MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
]);

/**
 * StyleX's options for `stylexOptions()`. They resolve `.stylex` imports as the
 * prebuilt build does (scripts/stylex-module-resolution.cjs). A request into a
 * source-built package names its `source` entry or `src/<subpath>`, never the
 * `dist` file Node finds. So a marker, constant or hashed variable keeps the
 * name its own package gives it. Names follow StyleX's rule,
 * `<package name>:<path inside it>`, so Core's names do not change.
 */
function pluginOptions(options) {
  const {rootDir} = options.unstable_moduleResolution;
  let packages;
  const owner = request =>
    (packages ??= sourcePackages(rootDir)).find(({name}) =>
      request.startsWith(`${name}/`),
    );
  const filePathResolver = (request, importer, aliases) => {
    const pkg = !request.startsWith('.') && owner(request);
    if (pkg) {
      const subpath = request.slice(pkg.name.length + 1);
      return (
        pkg.entries.get(request) ?? firstFile([path.join(pkg.srcDir, subpath)])
      );
    }
    const local = resolveStyleXImport(request, importer, aliases);
    if (local != null) return local;
    try {
      return require.resolve(request, {paths: [path.dirname(importer)]});
    } catch (error) {
      // An import the importer cannot resolve reads as "not a theme file", as
      // in StyleX's own resolvers. Any other error, such as a broken
      // package.json, throws.
      if (UNRESOLVED.has(error.code)) return null;
      throw error;
    }
  };
  const getCanonicalFilePath = file => {
    let dir = path.dirname(file);
    while (!fs.existsSync(path.join(dir, 'package.json'))) {
      if (dir === path.parse(dir).root) return path.relative(rootDir, file);
      dir = path.dirname(dir);
    }
    return `${readManifest(dir).name}:${path.relative(dir, file)}`;
  };
  return {
    ...options,
    unstable_moduleResolution: {
      type: 'custom',
      filePathResolver,
      getCanonicalFilePath,
    },
  };
}

function staticStyleXImports(source) {
  const specifiers = [];
  const pattern =
    /\b(?:import|export)\s+([^'";]*?\sfrom\s*)?['"]([^'"]+\.stylex)['"]/g;
  for (const match of source.matchAll(pattern)) {
    const clause = (match[1] ?? '').replace(/\s+from\s*$/, '').trim();
    const named = /^\{([^}]*)\}$/.exec(clause);
    const typeOnly =
      /^type(?:\s|\*|\{)/.test(clause) ||
      (named != null &&
        named[1]
          .split(',')
          .map(specifier => specifier.trim())
          .filter(Boolean)
          .every(specifier => /^type\b/.test(specifier)));
    if (!typeOnly) {
      specifiers.push(match[2]);
    }
  }
  return specifiers;
}

const SUFFIXES = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];

/** The first file named by a base and a suffix, in order. */
function firstFile(bases, suffixes = SUFFIXES) {
  for (const file of bases.flatMap(base => suffixes.map(s => base + s))) {
    if (fs.statSync(file, {throwIfNoEntry: false})?.isFile()) return file;
  }
  return null;
}

function resolveStyleXImport(specifier, importer, aliases) {
  if (specifier.startsWith('.')) {
    return firstFile([path.resolve(path.dirname(importer), specifier)]);
  }
  for (const [pattern, targets] of Object.entries(aliases)) {
    // A key without `*` matches only itself, as in StyleX's own aliases.
    if (!pattern.includes('*') && specifier !== pattern) continue;
    const [prefix, suffix = ''] = pattern.split('*');
    if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
      const matched = specifier.slice(
        prefix.length,
        specifier.length - suffix.length,
      );
      const found = targets
        .map(target => firstFile([target.replace('*', matched)]))
        .find(Boolean);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The modules a package's prebuilt stylesheet is compiled from, walked as
 * scripts/build-css.mjs walks them. That is every source file except tests and
 * `.stylex` modules, plus the package's `STYLEX_ENTRIES`. The walk adds the
 * variable modules they import, minus those a provider's stylesheet already
 * emits. It adds the provided modules the package imports to `imported`. The
 * parity test in source-stylesheet.test.mjs fails if this drifts from
 * scripts/build-css.mjs.
 */
function packageModules(
  pkg,
  packages,
  provided = new Set(),
  imported = new Set(),
) {
  const {aliases} = stylexOptions(pkg, packages);
  const queue = [
    ...globSync('**/*.{ts,tsx}', {
      cwd: pkg.srcDir,
      absolute: true,
      ignore: ['**/*.test.*', '**/*.d.ts', '**/node_modules/**'],
    })
      .map(file => path.normalize(file))
      .filter(file => !STYLEX_MODULE.test(file)),
    // A version older than an entry has none of it to print.
    ...(STYLEX_ENTRIES[pkg.name] ?? [])
      .map(entry => path.join(pkg.srcDir, entry))
      .filter(file => fs.existsSync(file)),
  ].filter(file => !provided.has(file));
  const modules = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (modules.has(file)) continue;
    modules.add(file);
    for (const specifier of staticStyleXImports(
      fs.readFileSync(file, 'utf8'),
    )) {
      const dependency = resolveStyleXImport(specifier, file, aliases);
      if (dependency == null) {
        throw new Error(
          `[@astryxdesign/build] Cannot resolve "${specifier}" from ${file}`,
        );
      }
      if (!provided.has(dependency)) queue.push(dependency);
      else imported.add(dependency);
    }
  }
  return modules;
}

/** A `defineConsts` value, as StyleX collects it: no CSS of its own. */
const isConstant = rule =>
  rule[1]?.constKey != null && rule[1]?.constVal != null;

/**
 * Every rule of a package's prebuilt stylesheet, collected as
 * scripts/build-css.mjs collects them. That is its modules' rules, plus the
 * constants it reads from a provider's modules. Those constants resolve where
 * they are read.
 */
async function packageRules(pkg, packages, provided) {
  const options = stylexOptions(pkg, packages);
  const imported = new Set();
  const modules = packageModules(pkg, packages, provided, imported);
  const rules = [];
  for (const file of modules) {
    rules.push(...(await compileRules(file, options)));
  }
  for (const file of imported) {
    rules.push(...(await compileRules(file, options)).filter(isConstant));
  }
  return {modules, rules};
}

const compiled = new Map();

function stamp(file) {
  const stat = fs.statSync(file);
  return `${stat.mtimeMs}:${stat.size}`;
}

/** One module's StyleX rules, cached on its modification stamp. */
async function compileRules(file, options) {
  const key = `${stamp(file)}:${JSON.stringify(options)}`;
  if (compiled.get(file)?.key === key) {
    return compiled.get(file).rules;
  }
  const code = fs.readFileSync(file, 'utf8');
  let rules = [];
  if (code.includes('@stylexjs/stylex')) {
    const result = await babel().transformAsync(code, {
      filename: file,
      babelrc: false,
      configFile: false,
      code: false,
      parserOpts: {plugins: ['typescript', 'jsx']},
      plugins: [[stylexBabelPlugin(), pluginOptions(options)]],
    });
    rules = result?.metadata?.stylex ?? [];
  }
  compiled.set(file, {key, rules});
  return rules;
}

/**
 * The cascade-layer order every Astryx stylesheet registers before its rules,
 * the line scripts/build-css.mjs writes into each prebuilt stylesheet.
 */
const LAYER_ORDER = '@layer reset, astryx-base, astryx-theme;';

/**
 * Print a package's rules as its prebuilt stylesheet prints them. Print the
 * layer order, then StyleX's output inside one `@layer astryx-base`. Print
 * nothing when there are no rules. Each block carries the order, so the order
 * holds whichever block or chunk loads first. The product needs no line of its
 * own.
 */
function renderPackage(rules) {
  const css = stylexBabelPlugin().processStylexRules(rules, false);
  if (!css.trim()) return '';
  return `${LAYER_ORDER}\n\n@layer astryx-base {\n${css.replace(/^/gm, '  ')}\n}\n`;
}

/**
 * The stylesheet a source build emits. It holds every rule of each
 * source-built package, as its prebuilt stylesheet prints them, one block per
 * package in package order. Another package's block leaves out the Core
 * variable modules that Core's block carries, as prebuilt `lab.css` does.
 */
async function sourceStylesheet({cwd}) {
  const packages = sourcePackages(cwd);
  const blocks = [];
  let provided = new Set();
  for (const pkg of packages) {
    const {modules, rules} = await packageRules(pkg, packages, provided);
    if (pkg.name === CORE) {
      provided = new Set([...modules].filter(file => STYLEX_MODULE.test(file)));
    }
    blocks.push(renderPackage(rules));
  }
  return {css: blocks.filter(Boolean).join('\n'), packages};
}

module.exports = {
  ASTRYX_PACKAGES,
  SOURCE_PACKAGES,
  PREBUILT_STYLESHEETS,
  prebuiltStylesheet,
  findPackageDir,
  sourcePackages,
  stylexOptions,
  pluginOptions,
  packageModules,
  compileRules,
  renderPackage,
  resolveStyleXImport,
  sourceStylesheet,
};
