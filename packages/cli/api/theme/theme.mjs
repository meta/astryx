// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme` command barrel. Re-exports the build, app-management,
 * authoring, listing, target, and palette leaves so the CLI and scripted callers
 * import from one place. Each leaf is also importable directly. `theme` has real
 * subcommands, so there is no flag dispatch here.
 */

export {themeBuild, importSpecifier} from './build/build.mjs';
export {themeAdd} from './add/add.mjs';
export {themeRemove} from './remove/remove.mjs';
export {themeUse} from './use/use.mjs';
export {themeEject} from './eject/eject.mjs';
export {themeTemplate} from './template/template.mjs';
export {themeTargets} from './targets/targets.mjs';
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
