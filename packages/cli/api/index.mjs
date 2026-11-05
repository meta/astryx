// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the Astryx CLI.
 *
 * Every function returns the same { type, data } envelope that `astryx --json` outputs.
 * Errors throw AstryxError (with optional .suggestions).
 *
 * @example
 * import { component, docs, hook, AstryxError } from '@astryxdesign/cli/api';
 *
 * const result = await component('Button');
 * // { type: 'component.detail', data: { name: 'Button', ... } }
 *
 * const list = await component(undefined, { list: true });
 * // { type: 'component.list', data: { Layout: [...], ... } }
 *
 * const useMediaQuery = await hook('useMediaQuery');
 * // { type: 'hook.detail', data: { name: 'useMediaQuery', ... } }
 */

// ── Functions (runtime) ──────────────────────────────────────────────
export {component} from './component/component.mjs';
export {docs} from './docs/docs.mjs';
export {blog} from './blog/blog.mjs';
export {icon} from './icon/icon.mjs';
export {iconAdd} from './icon/add/add.mjs';
export {iconMap} from './icon/map/map.mjs';
export {iconUse} from './icon/use/use.mjs';
export {iconNewSet} from './icon/new-set/new-set.mjs';
export {iconNewDefinition} from './icon/new-definition/new-definition.mjs';
export {discover} from './discover/discover.mjs';
export {template} from './template/template.mjs';
export {
  themeBuild,
  themeAdd,
  themeRemove,
  themeUse,
  themeEject,
  themeTemplate,
  themeList,
  themeListAvailable,
  themeListCopySources,
  themeTargets,
  themePaletteGenerate,
  generateTonalPalette,
  listThemes,
} from './theme/theme.mjs';
export {hook} from './hook/hook.mjs';
export {search} from './search/search.mjs';
export {build} from './build/build.mjs';
export {swizzle} from './swizzle/swizzle.mjs';
export {gapReport} from './gap-report/gap-report.mjs';
export {upgrade} from './upgrade/upgrade.mjs';
export {init} from './init/init.mjs';
export {doctor} from './doctor/doctor.mjs';
export {
  integrationAdd,
  integrationAddAgentDoc,
  integrationAddCodemod,
  integrationAddComponent,
  integrationAddDoc,
  integrationAddTemplate,
} from './integration/add-contribution.mjs';
export {integrationAddTheme} from './integration/add-theme.mjs';
export {integrationPackCheck} from './integration/pack-check.mjs';
export {
  validateIntegration,
  summarizeIssues,
} from './integration/validate-integration.mjs';
export {
  integrationTemplateConflicts,
  integrationComponentConflicts,
  integrationDocConflicts,
} from './integration/authoring-checks.mjs';
export {integrationCheck} from './integration/check/check.mjs';
export {AstryxError} from './error.mjs';
// The one shared logger: the `logger` instance side-effecting commands write
// through, plus its generated `Logger` type. Part of the public surface so an
// embedder can enable/inspect output.
export {logger} from './logger.mjs';
/**
 * @typedef {import('./logger.mjs').Logger} Logger
 */

// ── Types (re-exported from the shared response foundation and each command's
// colocated `.type.mjs`) ──────────────────────────────────────────────────
// Runtime no-ops (the .type.mjs files are `export {}`); tsc carries these
// through to the generated api/index.d.mts so the public type surface exposes
// the shared receipt vocabulary and every command's Options + response types.
export * from '../foundation/response/batch.type.mjs';
export * from './component/component.type.mjs';
export * from './docs/docs.type.mjs';
export * from './blog/blog.type.mjs';
export * from './discover/discover.type.mjs';
export * from './template/template.type.mjs';
export * from './theme/theme.type.mjs';
export * from './hook/hook.type.mjs';
export * from './search/search.type.mjs';
export * from './build/build.type.mjs';
export * from './swizzle/swizzle.type.mjs';
export * from './gap-report/gap-report.type.mjs';
export * from './upgrade/upgrade.type.mjs';
export * from './init/init.type.mjs';
export * from './doctor/doctor.type.mjs';
export * from './integration/integration-authoring.type.mjs';
export * from './integration/pack-check.type.mjs';
export * from './integration/validate-integration.type.mjs';
export * from './integration/authoring-checks.type.mjs';
export * from './integration/integration-check.type.mjs';
