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
 * Returns the theme object's `variants` and `fonts` if available,
 * or null if no theme is configured or found.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {resolveRecordedTheme} from '../../../api/theme/theme.mjs';

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

/** @param {unknown} mod @param {string} specifier */
function resolvedThemeData(mod, specifier) {
  const theme = extractTheme(mod);
  if (!theme) {
    console.warn(
      `⚠ theme: loaded "${specifier}" but could not find a theme object`,
    );
    return null;
  }
  return {
    name: theme.name || null,
    variants: theme.variants || null,
    fonts: theme.fonts || null,
  };
}

/**
 * Resolve the active Astryx theme from the generated record, or from
 * `package.json#astryx.theme` when there is no generated module.
 *
 * @param {string} [cwd] Working directory (defaults to process.cwd())
 * @returns {Promise<{variants?: Record<string, string[]>|null, fonts?: Record<string, string>|null, name?: string|null}|null>}
 */
export async function resolveTheme(cwd = process.cwd()) {
  const loaded = await resolveRecordedTheme(cwd);
  if (loaded.configured) {
    if (!loaded.module) {
      console.warn(
        `⚠ theme: ${loaded.problem ?? `could not resolve the generated default theme (${loaded.specifier})`}`,
      );
      return null;
    }
    return resolvedThemeData(loaded.module, loaded.specifier);
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
      console.warn(
        `⚠ theme: could not resolve file "${specifier}" from ${cwd}`,
      );
      return null;
    }
  } else if (specifier.startsWith('@')) {
    mod = tryLoadLegacyModule(specifier, cwd);
    if (!mod) {
      console.warn(`⚠ theme: could not resolve package "${specifier}"`);
      return null;
    }
  } else {
    const conventional = `@astryxdesign/theme-${specifier}`;
    mod =
      tryLoadLegacyModule(conventional, cwd) ??
      tryLoadLegacyModule(specifier, cwd);
    if (!mod) {
      console.warn(
        `⚠ theme: could not resolve "${specifier}" (tried ${conventional} and ${specifier})`,
      );
      return null;
    }
  }

  return resolvedThemeData(mod, specifier);
}
