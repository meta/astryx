// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build/next
 *
 * Next.js configuration helper for Astryx source builds, under webpack or
 * Turbopack.
 *
 * Usage in next.config.mjs:
 *   import {withAstryx} from '@astryxdesign/build/next';
 *   export default withAstryx({
 *     // your normal next config
 *   });
 */

const fs = require('fs');
const path = require('path');
const {fileURLToPath} = require('url');
const {
  ASTRYX_PACKAGES,
  findPackageDir,
  sourcePackages,
  stylexOptions,
} = require('./source-stylesheet');

const ASTRYX_MODULE = /[\\/]node_modules[\\/]@astryxdesign[\\/]/;

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TURBOPACK_LOADER = require.resolve('./turbopack-loader.js');

/**
 * Match a wildcard alias key such as `@astryxdesign/*` against a request. The
 * resolver treats `*` as the variable part of the specifier, so a caller can
 * claim a whole scope with one entry.
 */
function wildcardPattern(name) {
  const source = name
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`);
}

/**
 * Drop the generated aliases a caller has already spoken for. A caller entry
 * is authoritative for the request it names: `'@astryxdesign/core'` is a prefix
 * alias covering the package and every subpath under it,
 * `'@astryxdesign/core$'` covers only the bare specifier, and
 * `'@astryxdesign/*'` claims everything the pattern matches. Without this the
 * generated entries sit earlier in the alias list and win, so a composed config
 * silently loads astryx source instead of the caller's implementation.
 */
function withoutCallerOverrides(generated, callerAlias) {
  const exact = new Set();
  const prefixes = [];
  const patterns = [];
  for (const key of Object.keys(callerAlias)) {
    const onlyModule = key.endsWith('$');
    const name = onlyModule ? key.slice(0, -1) : key;
    if (name.includes('*')) {
      patterns.push(wildcardPattern(name));
    } else if (onlyModule) {
      exact.add(name);
    } else {
      prefixes.push(name);
    }
  }
  const kept = {};
  for (const [key, target] of Object.entries(generated)) {
    const request = key.slice(0, -1);
    const overridden =
      exact.has(request) ||
      prefixes.some(
        prefix => request === prefix || request.startsWith(`${prefix}/`),
      ) ||
      patterns.some(pattern => pattern.test(request));
    if (!overridden) {
      kept[key] = target;
    }
  }
  return kept;
}

/**
 * Merge the generated aliases under whatever the caller already configured.
 * `resolve.alias` accepts an object or an array of entries; both are ordered,
 * first match wins, so the caller's entries stay ahead of ours either way.
 */
function mergeAliases(generated, existing) {
  if (Array.isArray(existing)) {
    const named = {};
    for (const entry of existing) {
      if (entry && typeof entry.name === 'string') {
        named[entry.onlyModule ? `${entry.name}$` : entry.name] = entry.alias;
      }
    }
    const kept = withoutCallerOverrides(generated, named);
    return [
      ...existing,
      ...Object.entries(kept).map(([key, alias]) => ({
        name: key.slice(0, -1),
        onlyModule: true,
        alias,
      })),
    ];
  }
  const callerAlias = existing || {};
  return {...withoutCallerOverrides(generated, callerAlias), ...callerAlias};
}

/**
 * Map each installed astryx package to the `source` targets in its export map,
 * so an app's imports reach raw TS the way an in-repo build does. Subpaths get
 * an entry each — `@astryxdesign/core/AlertDialog` is as much a documented
 * entry point as the package root. Packages that are absent, and export keys
 * that ship no `source` condition, are skipped and keep normal resolution.
 */
function sourceEntryAliases(packages, context) {
  const from = (context && context.dir) || process.cwd();
  const aliases = {};
  for (const name of packages) {
    // Not `require.resolve(`${name}/package.json`)`: packages that define
    // `exports` without a `./package.json` key — astryx's own among them —
    // make that request throw ERR_PACKAGE_PATH_NOT_EXPORTED.
    const packageDir = findPackageDir(name, from);
    if (packageDir == null) {
      continue;
    }
    let exports;
    try {
      exports = require(path.join(packageDir, 'package.json')).exports;
    } catch {
      continue;
    }
    if (exports == null || typeof exports !== 'object') {
      continue;
    }
    for (const [key, value] of Object.entries(exports)) {
      const entry = value && typeof value === 'object' ? value.source : null;
      if (typeof entry !== 'string' || key.includes('*')) {
        continue;
      }
      const request = key === '.' ? name : `${name}/${key.slice(2)}`;
      aliases[`${request}$`] = path.resolve(packageDir, entry);
    }
  }
  return aliases;
}

/**
 * Whether the resolved alias map routes any astryx request at all.
 *
 * The test is webpack's own matching rule rather than a list of shapes. A
 * non-exact alias `key` intercepts a request `R` when `R === key` or `R` starts
 * with `${key}/`, so an entry covers the packages when one of them sits at or
 * below its key: `'@astryxdesign'` claims `@astryxdesign/core`. A key *under* a
 * package counts too, because that is the shape of the entries this helper
 * generates, and a `*` key claims by pattern, using the same matcher
 * `withoutCallerOverrides` applies.
 *
 * Exactness — a trailing `$` on an object key, `onlyModule: true` on an array
 * entry — restricts an entry to the literal request, which removes the
 * ancestor case and only that one. `'@astryxdesign/core$'` still routes a real
 * request; `'@astryxdesign$'` routes only the bare scope specifier, which
 * nothing imports, so it covers nothing.
 *
 * Where a caller points its alias is its business; the only thing worth saying
 * is that no entry routes the packages at all. A false positive tells someone
 * their working build is broken, so an ambiguous config stays quiet — but an
 * exact-scope key is not ambiguous, it is determinately ineffective.
 */
function aliasCoversAstryx(alias, packages) {
  const covers = (key, exact) => {
    const bare = key.endsWith('$') ? key.slice(0, -1) : key;
    const isExact = exact || key.endsWith('$');
    if (bare.includes('*')) {
      const pattern = wildcardPattern(bare);
      return packages.some(name => pattern.test(name));
    }
    return packages.some(
      name =>
        name === bare ||
        bare.startsWith(`${name}/`) ||
        (!isExact && name.startsWith(`${bare}/`)),
    );
  };
  if (Array.isArray(alias)) {
    return alias.some(
      entry =>
        entry &&
        typeof entry.name === 'string' &&
        covers(entry.name, entry.onlyModule === true),
    );
  }
  if (alias == null || typeof alias !== 'object') {
    return false;
  }
  return Object.keys(alias).some(key => covers(key, false));
}

const posix = file => file.split(path.sep).join('/');
const sourceRegExp = tails =>
  new RegExp(`(^|/)(${[...new Set(tails)].map(escapeRegExp).join('|')})/`);

/**
 * How a package's source path ends in the resolved, root-relative paths
 * Turbopack matches rules against: from the app's closest ancestor that holds
 * it (`packages/core/src` for a workspace link), or in `node_modules`.
 */
function sourceTails(pkg, cwd) {
  const real = fs.realpathSync(pkg.srcDir);
  let base = fs.realpathSync(cwd);
  while (path.relative(base, real).startsWith('..')) base = path.dirname(base);
  return [
    `node_modules/${pkg.name}/${posix(path.relative(pkg.dir, pkg.srcDir))}`,
    posix(path.relative(base, real)),
  ];
}

/**
 * Keep a caller's rule off Astryx source. Turbopack runs every rule whose glob
 * matches, so a caller rule such as `*.tsx` running its own StyleX setup could
 * compile Astryx a second time, with other class names than the stylesheet
 * holds. Next.js makes each bare loader in a list a rule of its own, run in
 * list order, so wrapping each in place keeps the order on the app's files.
 */
function keepOffAstryx(collection, astryxSource) {
  const exclude = rule => ({
    ...rule,
    condition:
      rule.condition == null
        ? {not: astryxSource}
        : {all: [{not: astryxSource}, rule.condition]},
  });
  const isLoader = item => typeof item === 'string' || 'loader' in item;
  return Array.isArray(collection)
    ? collection.map(item => exclude(isLoader(item) ? {loaders: [item]} : item))
    : exclude(collection);
}

const ASTRYX_RULE = '*.{ts,tsx}';
const NEXT_CONFIG = /^next\.config(\.compiled)?\.[cm]?[jt]s$/;

/**
 * The project directory, which webpack's hook gets as `context.dir` but a
 * Turbopack config is built without. Next.js loads the config file from it
 * without changing the working directory (`next build <dir>`), so it is that
 * file's directory, found on the call stack, unless the working directory is
 * inside it (a config found in an ancestor).
 */
function projectDir() {
  const {prepareStackTrace, stackTraceLimit} = Error;
  Object.assign(Error, {prepareStackTrace: (_, sites) => sites});
  Error.stackTraceLimit = Infinity;
  const sites = new Error().stack;
  Object.assign(Error, {prepareStackTrace, stackTraceLimit});
  const config = sites
    .map(site => site.getFileName() ?? '')
    .map(file => (file.startsWith('file:') ? fileURLToPath(file) : file))
    .find(file => NEXT_CONFIG.test(path.basename(file)));
  const [cwd, dir] = [process.cwd(), config && path.dirname(config)];
  return dir && !`${cwd}${path.sep}`.startsWith(`${dir}${path.sep}`)
    ? dir
    : cwd;
}

/**
 * The Turbopack half, which configures Turbopack directly because it never
 * calls `nextConfig.webpack`. `resolveAlias` points each documented entry point
 * at its `source` file (Turbopack matches keys exactly and takes targets
 * relative to the project `cwd`), unless the caller aliased it. A rule per
 * package compiles its source with the prebuilt stylesheets' StyleX options,
 * and every caller rule is kept off that source.
 */
function turbopackConfig(turbopack = {}, cwd) {
  const packages = sourcePackages(cwd);
  if (packages.length === 0) {
    return turbopack;
  }
  const callerAlias = turbopack.resolveAlias || {};
  const claimed = Object.keys(callerAlias)
    .filter(key => key.includes('*'))
    .map(wildcardPattern);
  const resolveAlias = {};
  for (const {entries} of packages) {
    for (const [request, file] of entries) {
      if (request in callerAlias || claimed.some(p => p.test(request))) {
        continue;
      }
      const target = posix(path.relative(cwd, file));
      resolveAlias[request] = target.startsWith('../') ? target : `./${target}`;
    }
  }
  Object.assign(resolveAlias, callerAlias);

  const tails = packages.map(pkg => sourceTails(pkg, cwd));
  const astryxSource = {path: sourceRegExp(tails.flat())};
  const rules = {};
  for (const [glob, collection] of Object.entries(turbopack.rules || {})) {
    rules[glob] = keepOffAstryx(collection, astryxSource);
  }
  rules[ASTRYX_RULE] = [
    ...[rules[ASTRYX_RULE] ?? []].flat(),
    ...packages.map((pkg, i) => ({
      condition: {path: sourceRegExp(tails[i])},
      loaders: [
        {loader: TURBOPACK_LOADER, options: stylexOptions(pkg, packages)},
      ],
      as: '*',
    })),
  ];
  return {...turbopack, resolveAlias, rules};
}

/**
 * Wraps a Next.js config to enable Astryx source builds.
 * - Adds transpilePackages for @astryxdesign/* packages
 * - webpack: sets conditionNames and aliases to resolve source exports
 * - Turbopack: see `turbopackConfig()`
 */
function withAstryx(nextConfig = {}) {
  const astryxPackages = ASTRYX_PACKAGES;

  const existingTranspile = nextConfig.transpilePackages || [];
  const merged = Array.from(new Set([...existingTranspile, ...astryxPackages]));

  // Next sets TURBOPACK whenever it bundles with Turbopack (its default since
  // Next 16) and leaves it unset under `--webpack`.
  if (process.env.TURBOPACK) {
    // The webpack setup's PostCSS plugin reads this and refuses to run.
    process.env.ASTRYX_BUILD_TURBOPACK = '1';
    return {
      ...nextConfig,
      transpilePackages: merged,
      turbopack: turbopackConfig(nextConfig.turbopack, projectDir()),
    };
  }

  const existingWebpack = nextConfig.webpack;

  return {
    ...nextConfig,
    transpilePackages: merged,
    webpack: (config, context) => {
      // Astryx packages are consumed from their `source` export (raw TS) so
      // the sandbox/docsite build straight from src without a prebuild step.
      // Apply the `source` condition via a scoped, ALLOWLIST rule that only
      // matches @astryxdesign packages — the global conditions stay as Next's
      // defaults (webpack's `'...'` sentinel + react-server), which React JSX
      // resolution depends on. Third-party deps (e.g. `lexical`, which also
      // ships a `source` export) therefore resolve to their built output, not
      // raw TS. This is robust to new third-party `source`-shipping deps.
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      // `Rule.test` matches the module being processed, by the path the
      // resolver reports, and webpack reports a symlinked package by its real
      // path. Under pnpm's isolated layout that path still runs through
      // `node_modules/@astryxdesign/`, but a workspace link's does not
      // (`packages/core/...`), so the rule also matches each installed
      // package's real directory.
      const from = (context && context.dir) || process.cwd();
      const realPackageDirs = astryxPackages
        .map(name => findPackageDir(name, from))
        .filter(dir => dir != null)
        .map(dir => escapeRegExp(fs.realpathSync(dir) + path.sep));
      config.module.rules.unshift({
        test:
          realPackageDirs.length === 0
            ? ASTRYX_MODULE
            : new RegExp(
                `${ASTRYX_MODULE.source}|^(?:${realPackageDirs.join('|')})`,
              ),
        resolve: {
          conditionNames: ['source', '...'],
        },
      });

      // The rule above only covers astryx-to-astryx imports: `Rule.test`
      // matches the module being processed and `Rule.resolve` governs the
      // requests that module makes, so an app's own `@astryxdesign/*` imports —
      // issued from its sources, outside node_modules — never match it. Those
      // resolve through `default` to dist, whose runtime class names are
      // disjoint from the CSS the PostCSS pass compiles out of source, and the
      // app renders unstyled without erroring. Rules cannot key on the request
      // string, so point the packages at their `source` entry directly; the
      // global conditions stay as Next's defaults for React and for
      // third-party `source` shippers such as `lexical`.
      config.resolve = config.resolve || {};

      // Leave `resolve.symlinks` at webpack's default (true). Under pnpm's
      // isolated layout a package's own dependencies (`intl-messageformat`
      // for Core, `lucide-react` for the neutral theme) sit beside its real
      // path, not under the app's `node_modules`, so resolving from the
      // symlink path cannot find them.

      // Call user's webpack config if provided
      const merged = existingWebpack
        ? existingWebpack(config, context) || config
        : config;

      // Merge after the caller's hook, not before: aliases the hook adds are
      // as authoritative as the ones already on the config, and merging first
      // would leave the generated entries ahead of them in the alias list —
      // where the resolver, taking the first match, loads astryx source
      // instead. Only a byte-identical `$` key would have replaced ours.
      merged.resolve = merged.resolve || {};
      merged.resolve.alias = mergeAliases(
        sourceEntryAliases(astryxPackages, context),
        merged.resolve.alias,
      );

      // Generating no entries is not itself a fault: a package may simply not be
      // installed, and a caller alias that already routes the packages is a
      // working config this helper has nothing to add to. What is a fault is
      // ending up with an alias map that claims none of them — that is the
      // pre-0.5.3 config, where the app resolves dist while PostCSS compiles the
      // library from source and the page renders unstyled with nothing logged.
      // So the check is on the merged result, not on what we generated, and it
      // warns rather than throws: an install layout this helper cannot walk is
      // not proof the build is wrong.
      if (!aliasCoversAstryx(merged.resolve.alias, astryxPackages)) {
        console.warn(
          '[@astryxdesign/build] withAstryx(): no alias routes ' +
            `${astryxPackages.join(', ')} to their \`source\` entries. Either they ` +
            'are not installed where the app can see them, their export maps ' +
            'ship no `source` condition, or a configured alias does not match ' +
            'the requests — an exact key such as `@astryxdesign$` matches only ' +
            'the bare specifier. Source resolution is not in effect, so the app ' +
            'will load dist while the PostCSS pass compiles the library from ' +
            'source.',
        );
      }

      return merged;
    },
  };
}

module.exports = {withAstryx};
