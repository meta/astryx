// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme` command barrel. Re-exports the build, app-management,
 * authoring, listing, target, and palette leaves so the CLI and scripted callers
 * import from one place. Each leaf is also importable directly. `theme` has real
 * subcommands, so there is no flag dispatch here. The build, add, eject and
 * targets leaves load on their first call, so a read that resolves only the
 * recorded theme (clients/cli/lib/resolve-theme.mjs) does not load them.
 */

export {importSpecifier} from './build/import-specifier.mjs';

/**
 * Build a theme: the theme build (./build/build.mjs), loaded on the first
 * call, so a read that resolves only the recorded theme does not load it.
 * @type {typeof import('./build/build.mjs').themeBuild}
 */
export async function themeBuild(...args) {
  const {themeBuild: build} = await import('./build/build.mjs');
  return build(...args);
}
/**
 * Add a theme (./add/add.mjs), loaded on the first call.
 * @type {typeof import('./add/add.mjs').themeAdd}
 */
export async function themeAdd(...args) {
  const {themeAdd: add} = await import('./add/add.mjs');
  return add(...args);
}
export {themeRemove} from './remove/remove.mjs';
export {themeUse} from './use/use.mjs';
/**
 * Eject a theme (./eject/eject.mjs), loaded on the first call.
 * @type {typeof import('./eject/eject.mjs').themeEject}
 */
export async function themeEject(...args) {
  const {themeEject: eject} = await import('./eject/eject.mjs');
  return eject(...args);
}
export {themeTemplate} from './template/template.mjs';
/**
 * List a theme's targets (./targets/targets.mjs), loaded on the first call.
 * @type {typeof import('./targets/targets.mjs').themeTargets}
 */
export async function themeTargets(...args) {
  const {themeTargets: targets} = await import('./targets/targets.mjs');
  return targets(...args);
}
export {themePaletteGenerate} from './palette/generate/generate.mjs';
export {
  COMPACT_11_STOPS,
  DEFAULT_21_STOPS,
  PALETTE_RECIPE,
  generatePaletteSet,
  generateTonalPalette,
  parseStopList,
  validateStops,
} from './palette/generate/generator.mjs';
export {
  themeList,
  themeListAvailable,
  themeListCopySources,
} from './list/list.mjs';
export {listThemes, resolveRecordedTheme} from './_adapter.mjs';
