// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Resolve one discovered source theme to the built imports an app uses.
 *
 * Package themes use their fixed public export paths. Local themes use the
 * `.js` and `.css` outputs `astryx theme build` writes beside their source.
 * Resolution fails closed and never falls back to runtime source or copying.
 *
 * @input A discovered theme, project directory, and owner theme count
 * @output Built module/CSS import metadata with absolute files for verification
 * @position packages/cli/foundation/discovery — source-to-built theme boundary
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findInstalledPackage} from '../fs/paths.mjs';
import {moduleExportSource, moduleExportsName} from './module-exports.mjs';
import {inspectPackageExport} from './package-exports.mjs';
import {themeImportPackage} from './theme-discovery.mjs';
import {isLocalThemeOwner, projectPath} from '../config/theme-state.mjs';
import {formatCliCommand} from '../env/package-manager.mjs';
import {installCommandFor} from './template-needs.mjs';

export class ThemeImportError extends Error {
  /**
   * @param {string} message
   * @param {{cause?: unknown, suggestions?: Array<{name: string, reason: string}>}} [options]
   */
  constructor(message, options = {}) {
    super(
      message,
      options.cause === undefined ? undefined : {cause: options.cause},
    );
    /** Commands that move past the refusal. */
    this.suggestions = options.suggestions ?? [];
  }
}

/** @param {string} file */
function readPackage(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new ThemeImportError(
      `Cannot read theme package metadata at ${file}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      {cause: error},
    );
  }
}

/**
 * @param {import('./theme-discovery.mjs').DiscoveredTheme} theme
 * @param {string} cwd
 */
function resolveLocalTheme(theme, cwd) {
  const moduleFile = path.join(theme.sourceDir, `${theme.slug}.js`);
  const stylesheetFile = path.join(theme.sourceDir, `${theme.slug}.css`);
  const fontStylesheetFile = path.join(
    theme.sourceDir,
    `${theme.slug}.fonts.css`,
  );
  const missing = [moduleFile, stylesheetFile].filter(file => {
    try {
      return !fs.statSync(file).isFile();
    } catch {
      return true;
    }
  });
  if (missing.length > 0) {
    const source = projectPath(
      path.relative(cwd, path.join(theme.sourceDir, theme.entry)),
    );
    throw new ThemeImportError(
      `Local theme "${theme.slug}" is not built. Run \`${formatCliCommand(`theme build ${source}`, cwd)}\` and try again. Missing: ${missing
        .map(file => projectPath(path.relative(cwd, file)))
        .join(', ')}.`,
    );
  }
  if (!moduleExportsName(moduleFile, theme.exportName)) {
    throw new ThemeImportError(
      `Local theme "${theme.slug}" built module ${projectPath(
        path.relative(cwd, moduleFile),
      )} does not export "${theme.exportName}". Rebuild it with \`${formatCliCommand(
        `theme build ${projectPath(
          path.relative(cwd, path.join(theme.sourceDir, theme.entry)),
        )}`,
        cwd,
      )}\`.`,
    );
  }
  return {
    slug: theme.slug,
    owner: theme.package,
    exportName: theme.exportName,
    module: '',
    stylesheet: '',
    moduleFile,
    stylesheetFile,
    ...(fs.existsSync(fontStylesheetFile) ? {fontStylesheetFile} : {}),
    source: /** @type {const} */ ('local'),
    ...builtColorMode(moduleFile, theme.exportName),
  };
}

/**
 * Inspect one package export triplet.
 * @param {Record<string, any>} pkg
 * @param {string} packageDir
 * @param {string} moduleSubpath
 * @param {string} stylesheetSubpath
 * @param {string} fontSubpath
 */
function packageTriplet(
  pkg,
  packageDir,
  moduleSubpath,
  stylesheetSubpath,
  fontSubpath,
) {
  return {
    module: inspectPackageExport(pkg, packageDir, moduleSubpath),
    stylesheet: inspectPackageExport(pkg, packageDir, stylesheetSubpath),
    font: inspectPackageExport(pkg, packageDir, fontSubpath),
  };
}

/** @param {ReturnType<typeof packageTriplet>} triplet */
function complete(triplet) {
  return (
    triplet.module.exported &&
    triplet.module.target != null &&
    triplet.stylesheet.exported &&
    triplet.stylesheet.target != null
  );
}

/**
 * @param {import('./theme-discovery.mjs').DiscoveredTheme} theme
 * @param {string} cwd
 * @param {number} ownerThemeCount
 */
function resolvePackageTheme(theme, cwd, ownerThemeCount) {
  const importPackage = themeImportPackage(theme);
  const packageDir =
    /** @type {any} */ (theme).packageDir ??
    findInstalledPackage(cwd, importPackage);
  if (!packageDir) {
    // The app imports a theme from its package, bundled themes included, so
    // the package is installed in the app before the theme is added.
    const {installCommand} = installCommandFor([importPackage], cwd);
    const add = formatCliCommand(`theme add ${theme.slug}`, cwd);
    const install = installCommand ?? `npm install ${importPackage}`;
    throw new ThemeImportError(
      `Theme package "${importPackage}" is not installed. The app imports ${theme.slug} from it, so install it, then add the theme: \`${install}\`, then \`${add}\`.`,
      {
        suggestions: [
          {
            name: install,
            reason: `install ${importPackage}, which the app imports`,
          },
          {name: add, reason: 'add the theme once it is installed'},
        ],
      },
    );
  }
  const pkg = readPackage(path.join(packageDir, 'package.json'));
  const perTheme = packageTriplet(
    pkg,
    packageDir,
    `./themes/${theme.slug}`,
    `./themes/${theme.slug}.css`,
    `./themes/${theme.slug}.fonts.css`,
  );
  const single =
    ownerThemeCount === 1
      ? packageTriplet(pkg, packageDir, './built', './theme.css', './fonts.css')
      : null;
  const selected = complete(perTheme)
    ? perTheme
    : single && complete(single)
      ? single
      : null;
  if (!selected) {
    const missing = [];
    if (!perTheme.module.exported || !perTheme.module.target) {
      missing.push(`module export ${pkg.name}/themes/${theme.slug}`);
    }
    if (!perTheme.stylesheet.exported || !perTheme.stylesheet.target) {
      missing.push(`stylesheet export ${pkg.name}/themes/${theme.slug}.css`);
    }
    if (ownerThemeCount === 1) {
      missing.push(
        `or the single-theme exports ${pkg.name}/built and ${pkg.name}/theme.css`,
      );
    }
    throw new ThemeImportError(
      `Theme "${theme.slug}" from ${importPackage} has no resolvable built module and stylesheet. Missing ${missing.join(', ')}. The package must build and export them before it can be added.`,
    );
  }
  if (selected.font.exported && selected.font.target == null) {
    throw new ThemeImportError(
      `Theme "${theme.slug}" from ${importPackage} exports ${selected.font.specifier}, but that font stylesheet does not resolve from the installed package.`,
    );
  }
  if (
    !selected.module.target ||
    !moduleExportsName(selected.module.target, theme.exportName)
  ) {
    throw new ThemeImportError(
      `Theme "${theme.slug}" built module ${selected.module.specifier} does not export "${theme.exportName}". Rebuild the package theme before adding it.`,
    );
  }
  return {
    slug: theme.slug,
    owner: importPackage,
    exportName: theme.exportName,
    module: selected.module.specifier,
    stylesheet: selected.stylesheet.specifier,
    ...(selected.font.exported && selected.font.target
      ? {fontStylesheet: selected.font.specifier}
      : {}),
    moduleFile: selected.module.target,
    stylesheetFile: /** @type {string} */ (selected.stylesheet.target),
    ...(selected.font.target ? {fontStylesheetFile: selected.font.target} : {}),
    source:
      /** @type {any} */ (theme).source === 'bundled' || theme.bundled
        ? /** @type {const} */ ('bundled')
        : /** @type {const} */ ('package'),
    ...builtColorMode(selected.module.target, theme.exportName),
  };
}

/**
 * `{mode}` for a built theme module that exports one color mode
 * (`export const colorModes = ["light"];`, which `theme build` writes beside
 * the theme export), read without running it; nothing for a module with
 * both modes, which exports none.
 * @param {string | null | undefined} moduleFile
 * @param {string} [exportName] the theme's export: a module that re-exports
 *   only the theme by name (`export {oceanTheme} from './ocean.js'`) is
 *   read where the theme is declared
 * @returns {{mode?: 'light' | 'dark'}}
 */
export function builtColorMode(moduleFile, exportName) {
  if (!moduleFile) return {};
  // The file that declares it: the module, or the built module it re-exports
  // (`export * from './ocean.js'`); else the built module that declares the
  // theme the module re-exports by name.
  const declaring =
    moduleExportSource(moduleFile, 'colorModes') ??
    (exportName
      ? (() => {
          const theme = moduleExportSource(moduleFile, exportName);
          return theme && theme !== moduleFile
            ? moduleExportSource(theme, 'colorModes')
            : null;
        })()
      : null);
  if (!declaring) return {};
  let text;
  try {
    text = fs.readFileSync(declaring, 'utf8');
  } catch {
    return {};
  }
  const m =
    /^export const colorModes = \[\s*["'](light|dark)["']\s*\];?\s*$/m.exec(
      text,
    );
  return m ? {mode: /** @type {'light' | 'dark'} */ (m[1])} : {};
}

/**
 * Resolve a discovered theme to app imports.
 * @param {import('./theme-discovery.mjs').DiscoveredTheme} theme
 * @param {{cwd?: string, ownerThemeCount?: number}} [options]
 * @returns {import('../config/theme-state.mjs').ResolvedAppTheme}
 */
export function resolveThemeImports(theme, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  if (
    /** @type {any} */ (theme).source === 'local' ||
    isLocalThemeOwner(theme.package)
  ) {
    return resolveLocalTheme(theme, cwd);
  }
  return resolvePackageTheme(theme, cwd, options.ownerThemeCount ?? 1);
}
