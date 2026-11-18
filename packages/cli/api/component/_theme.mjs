// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Resolve the theme used by component metadata.
 *
 * A generated app-theme module is authoritative when present: its static record
 * selects the default theme's built module. Without that module, the released
 * `package.json#astryx.theme` field keeps its meaning. Environment variables
 * never select a theme.
 *
 * Resolution strategy for the configured value:
 * - Starts with `.` or `/` → file path relative to cwd
 * - Starts with `@` → npm package (require/import)
 * - Otherwise → try `@astryxdesign/theme-{name}`, then try as bare package name
 *
 * Returns the theme object's `name` and `fonts`, plus the loaded module's
 * `themeVariants` export (custom component prop values that `astryx theme
 * build` emits beside the built theme object), or null if no theme is
 * configured or found.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';

const legacyRequire = createRequire(import.meta.url);

/**
 * Released package-field loader. Bare package names resolve from the CLI's own
 * installation; relative paths resolve from the exact cwd given to the command.
 * @param {string} specifier
 * @param {string} cwd
 * @returns {unknown}
 */
function tryLoadLegacyModule(specifier, cwd) {
  const target =
    specifier.startsWith('.') || specifier.startsWith('/')
      ? path.resolve(cwd, specifier)
      : specifier;
  try {
    return legacyRequire(target);
  } catch {
    return null;
  }
}

/**
 * Extract theme data from a loaded module.
 * Handles both `module.default` and direct `module` patterns,
 * as well as named exports like `module.theme` or `module.{name}Theme`.
 * @param {any} mod
 * @returns {any}
 */
function extractTheme(mod) {
  if (!mod || typeof mod !== 'object') return null;

  const obj = mod.default || mod;
  if (obj.name && (obj.tokens || obj.variants)) return obj;

  if (mod.theme && typeof mod.theme === 'object' && mod.theme.name) {
    return mod.theme;
  }

  for (const key of Object.keys(mod)) {
    if (
      key.endsWith('Theme') &&
      typeof mod[key] === 'object' &&
      mod[key]?.name
    ) {
      return mod[key];
    }
  }

  return null;
}

/**
 * A theme problem as one inert line. The configured theme value and the
 * generated record come from the checkout, so a newline, an escape sequence or
 * a bidi override in them must not rewrite the terminal that prints it.
 * Control and format characters become U+FFFD.
 * @param {string} message
 * @returns {string}
 */
function inertProblem(message) {
  return message.replace(/[\p{Cc}\p{Cf}]/gu, '\uFFFD');
}

/**
 * @typedef {(problem: string) => void} ThemeProblemSink
 * Receives each reason a configured theme did not resolve, as one inert line.
 */

/**
 * Read the custom-value metadata a built theme module exports as
 * `themeVariants`: `{ [componentKey]: { [prop]: value[] } }`. It is a sibling
 * of the theme object rather than a theme field, because build/CLI metadata
 * stays outside `DefinedTheme` (docs/architecture/theme-authoring-contract.md).
 * @param {any} mod
 * @returns {Record<string, Record<string, string[]>> | null}
 */
function extractVariants(mod) {
  const variants = mod?.themeVariants;
  return variants && typeof variants === 'object' ? variants : null;
}

/**
 * @param {unknown} mod
 * @param {string} specifier
 * @param {ThemeProblemSink} onProblem
 */
function resolvedThemeData(mod, specifier, onProblem) {
  const theme = extractTheme(mod);
  if (!theme) {
    onProblem(
      inertProblem(`loaded "${specifier}" but could not find a theme object`),
    );
    return null;
  }
  return {
    name: theme.name || null,
    variants: extractVariants(mod),
    fonts: theme.fonts || null,
  };
}

/**
 * Resolve the active Astryx theme from the generated record, or from
 * `package.json#astryx.theme` when there is no generated module. A configured
 * theme that does not resolve returns null and reports why to `onProblem`; it
 * prints nothing. An unrelated error the theme module throws while loading
 * propagates.
 *
 * @param {string} [cwd] Working directory (defaults to process.cwd())
 * @param {{onProblem?: ThemeProblemSink}} [options]
 * @returns {Promise<{variants?: Record<string, Record<string, string[]>>|null, fonts?: Record<string, string>|null, name?: string|null}|null>}
 */
export async function resolveTheme(cwd = process.cwd(), options = {}) {
  const {onProblem = () => {}} = options;
  // The theme API loads on first use: only a read that carries theme values
  // needs it.
  const {resolveRecordedTheme} = await import('../theme/theme.mjs');
  const loaded = await resolveRecordedTheme(cwd);
  if (loaded.configured) {
    if (!loaded.module) {
      onProblem(
        inertProblem(
          loaded.problem ??
            `could not resolve the generated default theme (${loaded.specifier})`,
        ),
      );
      return null;
    }
    return resolvedThemeData(loaded.module, loaded.specifier, onProblem);
  }

  // No generated module: keep the released package-field lookup byte-for-byte in
  // behavior. It reads only cwd/package.json, resolves relative paths from cwd,
  // and resolves bare packages from the CLI installation.
  let specifier = null;
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      specifier = pkg.astryx?.theme || null;
    } catch {
      // Ignore parse errors.
    }
  }

  // `astryx.theme` is user/third-party controlled and may be any value.
  // Anything that is not a usable non-empty string means "no theme".
  if (typeof specifier !== 'string' || specifier.length === 0) return null;

  let mod;
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    mod = tryLoadLegacyModule(specifier, cwd);
    if (!mod) {
      onProblem(
        inertProblem(`could not resolve file "${specifier}" from ${cwd}`),
      );
      return null;
    }
  } else if (specifier.startsWith('@')) {
    mod = tryLoadLegacyModule(specifier, cwd);
    if (!mod) {
      onProblem(inertProblem(`could not resolve package "${specifier}"`));
      return null;
    }
  } else {
    const conventional = `@astryxdesign/theme-${specifier}`;
    mod =
      tryLoadLegacyModule(conventional, cwd) ??
      tryLoadLegacyModule(specifier, cwd);
    if (!mod) {
      onProblem(
        inertProblem(
          `could not resolve "${specifier}" (tried ${conventional} and ${specifier})`,
        ),
      );
      return null;
    }
  }

  return resolvedThemeData(mod, specifier, onProblem);
}
