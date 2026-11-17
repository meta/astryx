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
 * Build a theme. The theme build (./build/build.mjs) loads on the first call,
 * so a read that resolves only the recorded theme does not load it.
 * @type {typeof import('./build/build.mjs').themeBuild}
 */
export async function themeBuild(file, ...rest) {
  const {themeBuild: build} = await import('./build/build.mjs');
  return build(file, ...rest);
}
/**
 * Add one available built theme to the generated app module. `import` remains
 * accepted as a no-op so callers that opted in before the cleanup keep working.
 *
 * Removed source-copy options are rejected before discovery or any write, and
 * name the function that now owns them. `overwrite: false` remains an accepted
 * compatibility no-op.
 *
 * Its module (./add/add.mjs) loads on the first call.
 * @type {typeof import('./add/add.mjs').themeAdd}
 */
export async function themeAdd(slug, ...rest) {
  const {themeAdd: add} = await import('./add/add.mjs');
  return add(slug, ...rest);
}
export {themeRemove} from './remove/remove.mjs';
export {themeUse} from './use/use.mjs';
/**
 * Copy a bundled or installed theme's complete source inventory into the
 * consumer project as an independent local fork.
 *
 * Its module (./eject/eject.mjs) loads on the first call.
 * @type {typeof import('./eject/eject.mjs').themeEject}
 */
export async function themeEject(slug, ...rest) {
  const {themeEject: eject} = await import('./eject/eject.mjs');
  return eject(slug, ...rest);
}
export {themeTemplate} from './template/template.mjs';
/**
 * List every component theming target — the `defineTheme` `components` keys,
 * with the props and states each one accepts.
 *
 * A filter naming a component exactly wins over a substring search, so
 * `theme targets Button` is Button's own set (what `astryx component Button`
 * prints) rather than every key that happens to contain "button".
 *
 * Its module (./targets/targets.mjs) loads on the first call.
 * @type {typeof import('./targets/targets.mjs').themeTargets}
 */
export async function themeTargets(filter, ...rest) {
  const {themeTargets: targets} = await import('./targets/targets.mjs');
  return targets(filter, ...rest);
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
