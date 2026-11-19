// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build: source stylesheets. A source build of a package's
 * modules prints its prebuilt stylesheet's rules, selectors and order. It
 * prints them in one `@layer astryx-base` after the layer order. The walk,
 * the compile options and the layer block here also build the prebuilt
 * stylesheets (scripts/build-css.mjs). The bundler compiles the same modules
 * with the same options (turbopack-loader.js), so class names match the rules.
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
 * modules imports them. Core's public `dataVars` entry is one, since an app
 * reads its defaults as plain `var()` references. The targets of
 * scripts/build-css.mjs take their `stylexEntries` from this list.
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
 * The StyleX options every prebuilt stylesheet is compiled with: the default
 * `x` class-name prefix, no development class names and StyleX's default
 * property validation.
 */
const PREBUILT_OPTIONS = {
  dev: false,
  runtimeInjection: false,
  genConditionalClasses: true,
  treeshakeCompensation: true,
};

/** The aliases that point another package's imports of Core at Core's source. */
function coreAliases(srcDir) {
  return {
    '@astryxdesign/core/*': [path.join(srcDir, '*')],
    '@astryxdesign/core': [srcDir],
  };
}

/**
 * An installed package's StyleX options. They are plain JSON, since Turbopack
 * passes only serializable loader options. `pluginOptions()` adds the
 * resolution's functions.
 */
function stylexOptions(pkg, packages) {
  const core = packages.find(candidate => candidate.name === CORE);
  return {
    ...PREBUILT_OPTIONS,
    aliases: pkg.name === CORE || core == null ? {} : coreAliases(core.srcDir),
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
  // The prebuilt build passes the resolver the packages' JavaScript builds use.
  // Keep it, so CSS and JavaScript name each variable the same way.
  if (
    typeof options.unstable_moduleResolution.filePathResolver === 'function'
  ) {
    return options;
  }
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
 * The modules a stylesheet is compiled from. The walk starts at every source
 * file under `srcDir` except tests and `.stylex` modules, plus `entries`. It
 * follows static `.stylex` imports, through `aliases`. A module in `provided`
 * belongs to another stylesheet. The walk adds each one it reaches to
 * `imported`.
 */
function reachableModules(
  {srcDir, aliases, entries = []},
  provided = new Set(),
  imported = new Set(),
) {
  const queue = [
    ...globSync('**/*.{ts,tsx}', {
      cwd: srcDir,
      absolute: true,
      ignore: ['**/*.test.*', '**/*.d.ts', '**/node_modules/**'],
    })
      .map(file => path.normalize(file))
      .filter(file => !STYLEX_MODULE.test(file)),
    ...entries,
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

function packageWalk(pkg, packages) {
  return {
    srcDir: pkg.srcDir,
    aliases: stylexOptions(pkg, packages).aliases,
    // A version older than an entry has none of it to print.
    entries: (STYLEX_ENTRIES[pkg.name] ?? [])
      .map(entry => path.join(pkg.srcDir, entry))
      .filter(file => fs.existsSync(file)),
  };
}

function packageModules(pkg, packages, provided, imported) {
  return reachableModules(packageWalk(pkg, packages), provided, imported);
}

/** A `defineConsts` value, as StyleX collects it: no CSS of its own. */
const isConstant = rule =>
  rule[1]?.constKey != null && rule[1]?.constVal != null;

/**
 * Every rule of a stylesheet: its modules' rules, plus the constants it reads
 * from provided modules. Those constants resolve where they are read.
 */
async function collectRules(walk, provided, options) {
  const imported = new Set();
  const modules = reachableModules(walk, provided, imported);
  const rules = [];
  for (const file of modules) {
    rules.push(...(await compileRules(file, options)));
  }
  for (const file of imported) {
    rules.push(...(await compileRules(file, options)).filter(isConstant));
  }
  return {modules, rules};
}

function packageRules(pkg, packages, provided) {
  return collectRules(
    packageWalk(pkg, packages),
    provided,
    stylexOptions(pkg, packages),
  );
}

const compiled = new Map();

function stamp(file) {
  const stat = fs.statSync(file);
  return `${stat.mtimeMs}:${stat.size}`;
}

// `JSON.stringify` drops a resolver's functions, so each resolver object a
// caller sets gets an id in the cache key.
const resolverIds = new WeakMap();
let nextResolverId = 0;

function resolverKey({unstable_moduleResolution: resolution}) {
  if (typeof resolution?.filePathResolver !== 'function') return '';
  if (!resolverIds.has(resolution)) {
    resolverIds.set(resolution, nextResolverId++);
  }
  return `:${resolverIds.get(resolution)}`;
}

/** One module's StyleX rules, cached on its modification stamp. */
async function compileRules(file, options) {
  const key = `${stamp(file)}:${JSON.stringify(options)}${resolverKey(options)}`;
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

/** The cascade-layer order every Astryx stylesheet registers before its rules. */
const LAYER_ORDER = '@layer reset, astryx-base, astryx-theme;';

/** A stylesheet's block: the layer order, then `css` inside `@layer astryx-base`. */
function layerBlock(css) {
  const body = css
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');
  return `${LAYER_ORDER}\n\n@layer astryx-base {\n${body}\n}\n`;
}

/** StyleX's CSS for `rules`, from the copy of StyleX that compiled them. */
function processRules(rules) {
  return stylexBabelPlugin().processStylexRules(rules, false);
}

/**
 * Print a package's rules as its prebuilt stylesheet prints them, or nothing
 * when there are no rules. Each block carries the order, so the order holds
 * whichever block or chunk loads first. The product needs no line of its own.
 */
function renderPackage(rules) {
  const css = processRules(rules);
  return css.trim() ? layerBlock(css) : '';
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
  PREBUILT_OPTIONS,
  STYLEX_ENTRIES,
  STYLEX_MODULE,
  LAYER_ORDER,
  prebuiltStylesheet,
  findPackageDir,
  sourcePackages,
  coreAliases,
  stylexOptions,
  pluginOptions,
  reachableModules,
  packageModules,
  collectRules,
  compileRules,
  processRules,
  layerBlock,
  renderPackage,
  resolveStyleXImport,
  sourceStylesheet,
};
