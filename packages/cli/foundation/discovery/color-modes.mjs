// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The color modes a theme module declares, read without running it.
 * @input A theme module's file, and the name of its theme export
 * @output `light`, `dark`, `both`, or null
 * @position foundation/discovery — used by theme-imports.mjs (theme add, the
 *   preview) and by the export (render-page.mjs)
 */

import * as fs from 'node:fs';
import {moduleExportSource} from './module-exports.mjs';

/**
 * The color modes a theme module declares in its `colorModes` export, read
 * without running it: `light` or `dark` for one mode, `both` for a module
 * that lists both, null for a module that exports none.
 * @param {string | null | undefined} moduleFile
 * @param {string} [exportName] the theme's export: a module that re-exports
 *   only the theme by name (`export {oceanTheme} from './ocean.js'`) is
 *   read where the theme is declared
 * @returns {'light' | 'dark' | 'both' | null}
 */
export function declaredColorModes(moduleFile, exportName) {
  if (!moduleFile) return null;
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
  if (!declaring) return null;
  let text;
  try {
    text = fs.readFileSync(declaring, 'utf8');
  } catch {
    return null;
  }
  const list = /^export const colorModes = \[([^\]]*)\];?\s*$/m.exec(text);
  if (!list) return null;
  const items = list[1].split(',').map(item => item.trim()).filter(Boolean);
  const modes = items.map(item => /^["'](light|dark)["']$/.exec(item)?.[1]);
  if (modes.some(mode => !mode) || new Set(modes).size !== modes.length) return null;
  if (modes.length === 1) return /** @type {'light' | 'dark'} */ (modes[0]);
  return modes.length === 2 ? 'both' : null;
}
