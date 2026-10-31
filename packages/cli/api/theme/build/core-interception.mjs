// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Capture a theme's authored adaptation input as the theme file loads.
 *
 * `astryx theme build` resolves a theme by calling the INSTALLED core's
 * `defineTheme()`. A core that predates ordered adaptations builds its result
 * field by field and drops `adaptations` on the way in, so by the time the
 * build holds a theme object, the author's rules are gone without a trace —
 * and building anyway would emit CSS with every adaptation rule silently
 * missing.
 *
 * Rather than re-deriving the author's intent from the source (which means
 * following factories, barrels, spreads and package resolution — an incomplete
 * JS interpreter, and a bug farm), this watches the real thing happen. The
 * theme is already loaded through jiti; jiti's `virtualModules` lets us hand
 * the theme file a `@astryxdesign/core/theme` whose `defineTheme` is the
 * installed one wrapped in a recorder. Every call — in the theme file, in a
 * relative base, in an installed package, at any depth — hands us the raw
 * input before the old resolver can erase it. The JS engine does the
 * evaluating; we only observe.
 *
 * ## Lineage, not a pile of calls
 *
 * A module can define several themes, and only one of them is the theme being
 * built. Failing a build because SOME theme in the import graph uses
 * adaptations would be wrong — an unused adaptive theme sitting in the same
 * file must not fail its plain sibling. So each returned theme is associated
 * with the input it came from, and capability detection walks only the
 * selected theme's own lineage:
 *
 * - a WeakMap keyed by the returned object, for themes handled by reference;
 * - an enumerable Symbol on the returned object, because a theme is routinely
 *   OBJECT-SPREAD (`{...base, name: 'child'}`) and a spread copies enumerable
 *   symbol keys while a WeakMap entry does not survive it.
 *
 * The Symbol is scoped to one isolated load and stripped before the theme
 * reaches any output path. It cannot leak into a generated file regardless:
 * `JSON.stringify`, `Object.keys` and `Object.entries` all ignore symbol keys.
 *
 * Used only when the installed core cannot compile adaptations. A core that
 * can reports them on the resolved theme itself, which needs none of this.
 *
 * ## Reach, and its one edge
 *
 * jiti hands a module's imports back to itself only when it TRANSPILES that
 * module, so the load runs through jiti's synchronous path (see
 * `importThemeModule`), which transpiles installed ESM packages too — a
 * package whose source calls `defineTheme` is observed like any other module.
 * `patchCommonJs` covers `.cjs` source, which jiti always loads natively, by
 * wrapping the core's own CommonJS exports object for the duration of the
 * load.
 *
 * One combination stays out of reach: a `.cjs` package source resolving an
 * ESM-ONLY core. Node's `require(esm)` hands it a frozen/non-configurable module
 * namespace, which cannot be patched in place. `patchCommonJs` reports that
 * coverage gap; if the selected theme's lineage then contains an unobserved
 * member, the build fails closed rather than assuming erased adaptations were
 * absent. A package's BUILT artifact remains supported because it carries
 * `__adaptations` as observable plain data.
 *
 * The same capture also retains raw typography, color, radius, and motion axes.
 * Older cores resolve those inputs into tokens but do not expose `__axes`; the
 * CLI reconstructs the effective metadata with current core's merge semantics
 * so a later current-core child can extend the built artifact source-equivalently.
 *
 * SYNC: packages/cli/api/theme/build/build.mjs (importThemeModule)
 */

import Module, {createRequire} from 'node:module';
import * as path from 'node:path';

import {findInstalledPackage} from '../../../foundation/fs/paths.mjs';

/**
 * Marks a theme object with the raw input it was resolved from. Enumerable on
 * purpose — an object spread must carry it — and a Symbol on purpose, so it is
 * invisible to every serialization path the build uses.
 */
export const THEME_LINEAGE = Symbol.for('astryx.theme.lineage');

/** Complete private capture retained for cached exports and repeated checks. */
const retainedLineageByReference = new WeakMap();
/**
 * @typedef {object} ThemeLineage
 * @property {any} input - The raw `defineTheme()` argument.
 * @property {any} result - What the installed core returned for it.
 */

/**
 * A recorder for one isolated theme load.
 *
 * @typedef {object} CoreInterception
 * @property {Record<string, unknown>} modules - `virtualModules` for jiti.
 * @property {(theme: any) => boolean} observed - Whether authored input was captured.
 * @property {(theme: any) => void} retain - Retain capture before stripping.
 * @property {(theme: any) => any} parentOf - Exact authored `extends` value.
 * @property {(theme: any) => any[]} lineageOf - Every raw input that fed a
 *   theme, following its own `extends` chain and spread provenance.
 * @property {(theme: any) => any[]} unobservedIn - Lineage members this
 *   recorder never saw and that carry no adaptation metadata; ask before
 *   `strip`.
 * @property {(theme: any) => Record<string, any> | undefined} capturedAxesOf -
 *   Effective generative-axis metadata reconstructed from captured raw inputs.
 * @property {(theme: any) => void} strip - Remove the marker from a theme and
 *   its reachable bases, before it is used to generate anything.
 * @property {(fromFile: string) => {covered: boolean, undo: () => void}} patchCommonJs -
 *   Cover the one path `virtualModules` cannot reach and report whether every
 *   resolvable CommonJS core namespace could be wrapped.
 */

/**
 * Was this theme produced by a `defineTheme()` call the recorder saw? The
 * temporary symbol must be read before `strip`; retained WeakMap capture remains
 * available for cached retries.
 *
 * @param {any} value
 * @param {WeakMap<object, ThemeLineage>} byReference
 * @returns {boolean}
 */
// prettier-ignore
function wasObserved(value, byReference) { return Boolean(value && typeof value === 'object' && (byReference.has(value) || retainedLineageByReference.has(value) || value[THEME_LINEAGE] !== undefined)); }

const GENERATIVE_AXIS_KEYS = ['typography', 'color', 'radius', 'motion'];

/**
 * Merge generative axes exactly as current core does. The CLI needs this small
 * compatibility copy because the installed core being observed predates both
 * the public adaptation compiler and retained `__axes` metadata.
 *
 * SYNC: packages/core/src/theme/themeAdaptations.ts
 *       (resolveThemeGenerativeAxes, mergeRole)
 *
 * @param {Record<string, any> | undefined} inherited
 * @param {Record<string, any>} own
 * @returns {Record<string, any>}
 */
function mergeGenerativeAxes(inherited, own) {
  /** @param {any} root @param {any} next */
  const mergeRole = (root, next) => {
    if (!root) return next;
    if (!next) return root;
    return {
      ...root,
      ...next,
      weights:
        root.weights || next.weights
          ? {...root.weights, ...next.weights}
          : undefined,
    };
  };

  const inheritedTypography = inherited?.typography;
  const ownTypography = own.typography;
  /** @param {any} inheritedRole @param {any} ownRole @param {boolean} [followsOwnBody] */
  const resolveFamily = (inheritedRole, ownRole, followsOwnBody = false) => {
    const merged = mergeRole(inheritedRole, ownRole);
    if (!merged) return undefined;
    if (ownRole?.family) {
      return {
        ...merged,
        family: ownRole.family,
        fallbacks: ownRole.fallbacks,
      };
    }
    if (followsOwnBody) {
      return {...merged, family: undefined, fallbacks: undefined};
    }
    return {
      ...merged,
      family: inheritedRole?.family,
      fallbacks: inheritedRole?.fallbacks,
    };
  };

  let body = resolveFamily(inheritedTypography?.body, ownTypography?.body);
  let heading = resolveFamily(
    inheritedTypography?.heading,
    ownTypography?.heading,
    Boolean(ownTypography?.body?.family && !ownTypography?.heading?.family),
  );
  let code = resolveFamily(inheritedTypography?.code, ownTypography?.code);
  const weightOwner = ownTypography?.scale
    ? ownTypography
    : inheritedTypography?.scale
      ? inheritedTypography
      : undefined;
  /** @param {any} role @param {any} owner */
  const applyWeights = (role, owner) =>
    role
      ? {...role, weight: owner?.weight, weights: owner?.weights}
      : undefined;
  body = applyWeights(body, weightOwner?.body);
  heading = applyWeights(heading, weightOwner?.heading);
  code = applyWeights(code, weightOwner?.code);

  const typography =
    inheritedTypography || ownTypography
      ? {
          ...inheritedTypography,
          ...ownTypography,
          scale: ownTypography?.scale ?? inheritedTypography?.scale,
          body,
          heading,
          code,
        }
      : undefined;
  const color = own.color ?? inherited?.color;
  const radius = own.radius
    ? {...inherited?.radius, ...own.radius}
    : inherited?.radius;
  const motion = own.motion
    ? {...inherited?.motion, ...own.motion}
    : inherited?.motion;

  return {
    ...(typography ? {typography} : {}),
    ...(color ? {color} : {}),
    ...(radius ? {radius} : {}),
    ...(motion ? {motion} : {}),
  };
}

/**
 * The file `specifier` resolves to through `require`, or null when Core has
 * no such entry: no file where its `exports` points (`MODULE_NOT_FOUND`), or
 * no such subpath in them (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Any other error
 * is thrown.
 * @param {NodeJS.Require} require
 * @param {string} specifier
 * @returns {string | null}
 */
export function resolveEntry(require, specifier) {
  try {
    return require.resolve(specifier);
  } catch (error) {
    const {code} = /** @type {NodeJS.ErrnoException} */ (error);
    if (
      code === 'MODULE_NOT_FOUND' ||
      code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Core's root entry, loaded once, the first time a theme module requires
 * `@astryxdesign/core`. The root loads all of Core and React (thousands of
 * modules), and most themes import only the theme subpath, so nothing loads
 * it before a theme asks (the CommonJS patch for a theme's `.cjs` dependencies
 * wraps an installed root only when the load requires it, too). jiti asks for
 * a virtual module synchronously, so it loads through `require` of an ES
 * module, which the CLI's Node floor supports. An entry that fails to load
 * throws to the theme that imports it. Only a Core with no root entry has no
 * loader, and the theme namespace stands in for its root.
 * @param {string} file - The root entry's file
 * @returns {() => any}
 */
export function lazyCoreRoot(file) {
  /** @type {{root: any} | null} */
  let loaded = null;
  return () => {
    loaded ??= {root: createRequire(file)(file)};
    return loaded.root;
  };
}

/**
 * Wrap an installed core module so every `defineTheme()` call records the raw
 * input against the theme it produced.
 *
 * Both entry points a theme can import core through are wrapped, each from its
 * OWN namespace: `@astryxdesign/core/theme` keeps the theme namespace, and the
 * package root keeps the root namespace, which exports far more (components,
 * hooks) than the theme subpath. Mapping the root at the theme namespace would
 * silently delete every one of those exports from a theme file that imports a
 * component. Every real export is preserved on each; one function is wrapped.
 *
 * Current-Core family builds also use this private recorder for exact parents;
 * standalone builds with current Core do not.
 *
 * @param {any} coreThemeModule - The installed `@astryxdesign/core/theme` namespace.
 * @param {any} [coreRootModule] - The installed `@astryxdesign/core` namespace,
 *   or a function that loads it, called the first time a theme module
 *   requires the root.
 * @returns {CoreInterception}
 */
export function interceptCore(coreThemeModule, coreRootModule) {
  /** @type {WeakMap<object, ThemeLineage>} */
  const byReference = new WeakMap();

  /** @param {any} value @param {ThemeLineage} lineage */
  const mark = (value, lineage) => {
    if (!value || typeof value !== 'object') return;
    byReference.set(value, lineage);
    retainedLineageByReference.set(value, lineage);
    try {
      // Enumerable so a spread of this theme carries it; configurable so it
      // can be removed again before the theme is used for output.
      Object.defineProperty(value, THEME_LINEAGE, {
        value: lineage,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } catch {
      // A frozen or sealed theme keeps the WeakMap association only.
    }
  };

  /** @param {any} value @returns {ThemeLineage | undefined} */
  // prettier-ignore
  const lineageFor = value => value && typeof value === 'object' ? byReference.get(value) ?? retainedLineageByReference.get(value) ?? value[THEME_LINEAGE] : undefined;

  /**
   * One namespace, spread so exports this file does not know about still
   * reach the theme file, with `defineTheme` (if present) wrapped.
   * @param {any} namespace
   * @returns {any}
   */
  const wrapNamespace = namespace => {
    if (!namespace) return namespace;
    const real = namespace.defineTheme;
    if (typeof real !== 'function') return {...namespace};
    return {
      ...namespace,
      /** @param {any} input */
      defineTheme(input) {
        const result = real.call(namespace, input);
        mark(result, {input, result});
        return result;
      },
    };
  };

  /** @type {Record<string, any>} */
  const modules = {
    '@astryxdesign/core/theme': wrapNamespace(coreThemeModule),
  };
  // The root loads all of Core and React, so it is read only when a theme
  // module requires it: jiti reads a virtual module when the specifier is
  // required, not before. Falls back to the theme namespace only when the
  // root could not be loaded at all; a partial root is better than none, and
  // a core missing its own root entry is already broken.
  /** @type {any} */
  let rootNamespace;
  let rootRead = false;
  Object.defineProperty(modules, '@astryxdesign/core', {
    enumerable: true,
    get() {
      if (!rootRead) {
        rootRead = true;
        const root =
          typeof coreRootModule === 'function'
            ? coreRootModule()
            : coreRootModule;
        rootNamespace = wrapNamespace(root ?? coreThemeModule);
      }
      return rootNamespace;
    },
  });

  return {
    modules,

    // prettier-ignore
    observed(theme) { return wasObserved(theme, byReference); },
    // prettier-ignore
    retain(theme) { const lineage = lineageFor(theme); if (lineage && theme && typeof theme === 'object') retainedLineageByReference.set(theme, lineage); },
    // prettier-ignore
    parentOf(theme) { const input = lineageFor(theme)?.input; return input && typeof input === 'object' && 'extends' in input ? input.extends : theme && typeof theme === 'object' ? theme.extends : undefined; },
    lineageOf(theme) {
      /** @type {any[]} */
      const inputs = [];
      /** @type {Set<any>} */
      const seen = new Set();
      /** @type {any[]} */
      const queue = [theme];

      while (queue.length > 0) {
        const value = queue.pop();
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);

        // The theme itself is evidence: a built module or a plain object
        // literal carries its adaptation metadata directly, having never gone
        // through `defineTheme` at all.
        inputs.push(value);

        const lineage = lineageFor(value);
        if (lineage) {
          // The raw input is where an erased `adaptations` still lives, and
          // its own `extends` is the next link in the chain.
          if (lineage.input && typeof lineage.input === 'object') {
            queue.push(lineage.input);
          }
        }
        if (value.extends) queue.push(value.extends);
      }
      return inputs;
    },

    unobservedIn(theme) {
      // Lineage members this recorder never saw AND that carry no adaptation
      // metadata of their own. On a degraded load these are exactly the
      // themes whose adaptations, if any, were erased unobserved. Retained
      // WeakMap capture keeps this answer stable after a cached retry.
      //
      // A RAW INPUT reached through an observed result is itself evidence —
      // it is the very object the recorder captured, and only the result
      // carries the marker. Counting it as unobserved would fail every
      // degraded build, including themes whose whole lineage was seen.
      /** @type {Set<any>} */
      const observedInputs = new Set();
      for (const value of this.lineageOf(theme)) {
        const lineage = lineageFor(value);
        if (lineage?.input && typeof lineage.input === 'object') {
          observedInputs.add(lineage.input);
        }
      }

      return this.lineageOf(theme).filter(
        value =>
          value &&
          typeof value === 'object' &&
          !wasObserved(value, byReference) &&
          !observedInputs.has(value) &&
          value.adaptations === undefined &&
          value.__adaptations === undefined &&
          value.__adaptationRules === undefined,
      );
    },

    capturedAxesOf(theme) {
      /** @type {Set<any>} */
      const seen = new Set();

      /** @param {any} value @returns {Record<string, any> | undefined} */
      const visit = value => {
        if (!value || typeof value !== 'object' || seen.has(value)) {
          return undefined;
        }
        seen.add(value);

        // A built/current theme already carries the effective metadata. An
        // empty object is meaningful: it proves there are no inherited axes.
        if (value.__axes !== undefined) {
          return value.__axes &&
            typeof value.__axes === 'object' &&
            !Array.isArray(value.__axes)
            ? value.__axes
            : undefined;
        }

        const lineage = lineageFor(value);
        const input =
          lineage?.input && typeof lineage.input === 'object'
            ? lineage.input
            : value;
        const inherited = visit(input.extends);
        /** @type {Record<string, any>} */
        const own = {};
        for (const key of GENERATIVE_AXIS_KEYS) {
          if (input[key] !== undefined) own[key] = input[key];
        }
        if (!inherited && Object.keys(own).length === 0) return undefined;
        return mergeGenerativeAxes(inherited, own);
      };

      return visit(theme);
    },

    strip(theme) {
      /** @type {Set<any>} */
      const seen = new Set();
      /** @type {any[]} */
      const queue = [theme];
      while (queue.length > 0) {
        const value = queue.pop();
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        const lineage = lineageFor(value);
        if (lineage) retainedLineageByReference.set(value, lineage);
        if (Object.hasOwn(value, THEME_LINEAGE)) {
          try {
            delete value[THEME_LINEAGE];
          } catch {
            // Best effort: a non-configurable marker is still invisible to
            // JSON.stringify / Object.keys, so it cannot reach output.
          }
        }
        if (lineage?.input && typeof lineage.input === 'object') {
          queue.push(lineage.input);
        }
        if (value.extends) queue.push(value.extends);
      }
    },

    patchCommonJs(fromFile) {
      // jiti hands a module's imports back to itself only when it transpiles
      // that module, and it never transpiles a `.cjs` file — so a package
      // whose source is `.cjs` requires the real core natively and
      // `virtualModules` never sees it. Patch mutable CommonJS exports in place;
      // when require(esm) returns a non-configurable module namespace, report
      // the coverage gap so the caller can reject any selected lineage member
      // whose adaptation intent could not be observed.
      /** @type {Array<() => void>} */
      const undo = [];
      let covered = true;

      // Only a core the theme's OWN node_modules chain can reach is one a
      // `.cjs` source dependency beside it could require. `require` also folds
      // NODE_PATH in, and pnpm's isolated layout puts every package in
      // `node_modules/.pnpm/node_modules` — which Vitest puts on NODE_PATH.
      // An ambient hit there belongs to no dependency here, so wrapping it
      // proves nothing and failing to wrap it gaps nothing.
      if (!findInstalledPackage(path.dirname(fromFile), '@astryxdesign/core')) {
        return {covered, undo: () => {}};
      }

      const requireFromTheme = createRequire(fromFile);
      /**
       * Wraps `defineTheme` on a CommonJS exports object in place, so a call
       * from a `.cjs` dependency is recorded. False when it cannot be wrapped.
       * @param {any} cjs
       */
      const wrap = cjs => {
        const real = cjs?.defineTheme;
        if (typeof real !== 'function') return true;
        const descriptor = Object.getOwnPropertyDescriptor(cjs, 'defineTheme');
        if (!descriptor || !(descriptor.writable || descriptor.configurable)) {
          return false;
        }
        try {
          Object.defineProperty(cjs, 'defineTheme', {
            ...descriptor,
            value: /** @param {any} input */ input => {
              const result = real.call(cjs, input);
              mark(result, {input, result});
              return result;
            },
          });
          undo.push(() =>
            Object.defineProperty(cjs, 'defineTheme', descriptor),
          );
          return true;
        } catch {
          // ESM namespace exotic objects may report a writable descriptor but
          // still reject redefinition. This is a real coverage failure, not an
          // absent CommonJS entry: a `.cjs` dependency can call the function
          // while the recorder cannot wrap it.
          return false;
        }
      };

      // A specifier that CommonJS cannot resolve cannot be used by a `.cjs`
      // source dependency either, so it creates no unobserved path. Both are
      // resolved before anything is patched, so an error leaves nothing to
      // undo.
      const themeFile = resolveEntry(
        requireFromTheme,
        '@astryxdesign/core/theme',
      );
      const rootFile = resolveEntry(requireFromTheme, '@astryxdesign/core');

      // The theme subpath is small, so it is wrapped now. It loads here, and
      // its error, if it throws, is the build's.
      if (themeFile && !wrap(requireFromTheme(themeFile))) covered = false;

      // The root loads all of Core, so it is wrapped when this load first
      // requires it (a `.cjs` dependency, or the virtual module's own loader),
      // not before: every CommonJS require goes through `Module._load`, which
      // is watched for the load's duration. A load that never requires the
      // root leaves no path through it to observe.
      if (rootFile) {
        /** @type {any} */
        const loader = Module;
        const load = loader._load;
        let seen = false;
        loader._load = function (
          /** @type {string} */ request,
          /** @type {any} */ parent,
          /** @type {boolean} */ isMain,
        ) {
          const exports = load.apply(this, arguments);
          if (
            !seen &&
            typeof request === 'string' &&
            request.includes('@astryxdesign/core')
          ) {
            // The request just loaded, so it resolves.
            const resolved = loader._resolveFilename(request, parent, isMain);
            if (resolved === rootFile) {
              seen = true;
              if (!wrap(exports)) covered = false;
            }
          }
          return exports;
        };
        undo.push(() => {
          loader._load = load;
        });
      }
      return {
        /** Read after the load: a root required during it counts. */
        get covered() {
          return covered;
        },
        undo() {
          for (const restore of undo.reverse()) {
            try {
              restore();
            } catch {
              /* best effort */
            }
          }
        },
      };
    },
  };
}
