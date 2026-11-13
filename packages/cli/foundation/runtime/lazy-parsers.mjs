// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The authored-value parsers, loaded on first use.
 * @input Each parser's own arguments.
 * @output The same parsers authoring/ exports (doc kinds, templates, themes,
 *   icon definitions and sets, the project config, integration manifests and
 *   their contributions, codemods), each a thin function that loads its
 *   module the first time it is called and hands the call on unchanged.
 * @position The CLI's runtime reaches authoring/'s parsers through here.
 *   Those modules build their zod schemas when they load, and zod alone is
 *   about a hundred modules: a run that never validates an authored value (a
 *   search, a build, a template list in a project with no config) loads none
 *   of it. Each module loads with `require`, which for an ES module returns
 *   the very module an `import` of it gives, so there is one zod and one set
 *   of schemas whichever way a module is reached (test/lazy-parsers.test.mjs
 *   checks it). zod is imported only by authoring/ modules, never required.
 */

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

/** Each authoring/ module, once loaded. @type {Record<string, any>} */
const loaded = {};

/** @returns {typeof import('../../authoring/doctypes/parse.mjs')} */
const doctypes = () =>
  (loaded.doctypes ??= require('../../authoring/doctypes/parse.mjs'));
/** @returns {typeof import('../../authoring/doctypes/template/parse.mjs')} */
const templates = () =>
  (loaded.templates ??= require('../../authoring/doctypes/template/parse.mjs'));
/** @returns {typeof import('../../authoring/doctypes/theme/parse.mjs')} */
const themes = () =>
  (loaded.themes ??= require('../../authoring/doctypes/theme/parse.mjs'));
/** @returns {typeof import('../../authoring/doctypes/icon-definition/parse.mjs')} */
const iconDefinitions = () =>
  (loaded.iconDefinitions ??= require('../../authoring/doctypes/icon-definition/parse.mjs'));
/** @returns {typeof import('../../authoring/doctypes/icon-set/parse.mjs')} */
const iconSetModule = () =>
  (loaded.iconSetModule ??= require('../../authoring/doctypes/icon-set/parse.mjs'));
/** @returns {typeof import('../../authoring/config/parse.mjs')} */
const config = () =>
  (loaded.config ??= require('../../authoring/config/parse.mjs'));
/** @returns {typeof import('../../authoring/integration/schema.mjs')} */
const integration = () =>
  (loaded.integration ??= require('../../authoring/integration/schema.mjs'));
/** @returns {typeof import('../../authoring/gap-report/parse.mjs')} */
const gapReport = () =>
  (loaded.gapReport ??= require('../../authoring/gap-report/parse.mjs'));
/** @returns {typeof import('../../authoring/discover/parse.mjs')} */
const discover = () =>
  (loaded.discover ??= require('../../authoring/discover/parse.mjs'));
/** @returns {typeof import('../../authoring/codemod/parse.mjs')} */
const codemods = () =>
  (loaded.codemods ??= require('../../authoring/codemod/parse.mjs'));

/** @type {typeof import('../../authoring/doctypes/parse.mjs').parseDoc} */
export const parseDoc = (...args) => doctypes().parseDoc(...args);
/** @type {typeof import('../../authoring/doctypes/template/parse.mjs').parseTemplate} */
export const parseTemplate = (...args) => templates().parseTemplate(...args);
/** @type {typeof import('../../authoring/doctypes/theme/parse.mjs').parseTheme} */
export const parseTheme = (...args) => themes().parseTheme(...args);
/** @type {typeof import('../../authoring/doctypes/icon-definition/parse.mjs').parseIconDefinition} */
export const parseIconDefinition = (...args) =>
  iconDefinitions().parseIconDefinition(...args);
/** @type {typeof import('../../authoring/doctypes/icon-set/parse.mjs').parseIconSet} */
export const parseIconSet = (...args) => iconSetModule().parseIconSet(...args);
/** @type {typeof import('../../authoring/doctypes/icon-set/parse.mjs').parseIconSetData} */
export const parseIconSetData = (...args) =>
  iconSetModule().parseIconSetData(...args);
/** @type {typeof import('../../authoring/config/parse.mjs').parseConfig} */
export const parseConfig = (...args) => config().parseConfig(...args);
/** @type {typeof import('../../authoring/integration/schema.mjs').parseIntegrationBase} */
export const parseIntegrationBase = (...args) =>
  integration().parseIntegrationBase(...args);
/** @type {typeof import('../../authoring/integration/schema.mjs').parseAgentDocsField} */
export const parseAgentDocsField = (...args) =>
  integration().parseAgentDocsField(...args);
/** @type {typeof import('../../authoring/integration/schema.mjs').parseCliCommandField} */
export const parseCliCommandField = (...args) =>
  integration().parseCliCommandField(...args);
/** @type {typeof import('../../authoring/integration/schema.mjs').unknownIntegrationKeys} */
export const unknownIntegrationKeys = (...args) =>
  integration().unknownIntegrationKeys(...args);
/**
 * The manifest keys this CLI knows (authoring/integration/schema.mjs
 * KNOWN_INTEGRATION_KEYS).
 * @returns {readonly string[]}
 */
export const knownIntegrationKeys = () => integration().KNOWN_INTEGRATION_KEYS;
/** @type {typeof import('../../authoring/gap-report/parse.mjs').parseGapReportHandler} */
export const parseGapReportHandler = (...args) =>
  gapReport().parseGapReportHandler(...args);
/** @type {typeof import('../../authoring/discover/parse.mjs').parseDiscoverSource} */
export const parseDiscoverSource = (...args) =>
  discover().parseDiscoverSource(...args);
/** @type {typeof import('../../authoring/codemod/parse.mjs').parseCodemod} */
export const parseCodemod = (...args) => codemods().parseCodemod(...args);

/**
 * Load every parser module now, through `import`, for a run that will
 * validate anyway: one in a project where an integration can load, whose
 * manifests are always checked. The modules then load as they did when the
 * CLI imported them at startup, and a later parser call finds its module
 * loaded.
 * @returns {Promise<void>}
 */
export function loadParsers() {
  return (parsersLoading ??= importParsers());
}

/** Every parser module's import, once started. @type {Promise<void> | undefined} */
let parsersLoading;

/** @returns {Promise<void>} */
async function importParsers() {
  const [
    doctypesModule,
    templatesModule,
    themesModule,
    iconDefinitionsModule,
    iconSetsModule,
    configModule,
    integrationModule,
    gapReportModule,
    discoverModule,
    codemodsModule,
  ] = await Promise.all([
    import('../../authoring/doctypes/parse.mjs'),
    import('../../authoring/doctypes/template/parse.mjs'),
    import('../../authoring/doctypes/theme/parse.mjs'),
    import('../../authoring/doctypes/icon-definition/parse.mjs'),
    import('../../authoring/doctypes/icon-set/parse.mjs'),
    import('../../authoring/config/parse.mjs'),
    import('../../authoring/integration/schema.mjs'),
    import('../../authoring/gap-report/parse.mjs'),
    import('../../authoring/discover/parse.mjs'),
    import('../../authoring/codemod/parse.mjs'),
  ]);
  loaded.doctypes ??= doctypesModule;
  loaded.templates ??= templatesModule;
  loaded.themes ??= themesModule;
  loaded.iconDefinitions ??= iconDefinitionsModule;
  loaded.iconSetModule ??= iconSetsModule;
  loaded.config ??= configModule;
  loaded.integration ??= integrationModule;
  loaded.gapReport ??= gapReportModule;
  loaded.discover ??= discoverModule;
  loaded.codemods ??= codemodsModule;
}
