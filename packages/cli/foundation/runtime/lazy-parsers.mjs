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
 *   What they load is left out of a kept gather's record, as it was when they
 *   loaded with the CLI at startup (withoutModuleRecords).
 */

import {createRequire} from 'node:module';
import {withoutModuleRecords} from '../fs/gather-cache.mjs';

const require = createRequire(import.meta.url);

/** Each authoring/ module, once loaded. @type {Record<string, any>} */
const loaded = {};

/** @returns {typeof import('../../authoring/doctypes/parse.mjs')} */
const doctypes = () =>
  (loaded.doctypes ??= withoutModuleRecords(() =>
    require('../../authoring/doctypes/parse.mjs'),
  ));
/** @returns {typeof import('../../authoring/doctypes/template/parse.mjs')} */
const templates = () =>
  (loaded.templates ??= withoutModuleRecords(() =>
    require('../../authoring/doctypes/template/parse.mjs'),
  ));
/** @returns {typeof import('../../authoring/doctypes/theme/parse.mjs')} */
const themes = () =>
  (loaded.themes ??= withoutModuleRecords(() =>
    require('../../authoring/doctypes/theme/parse.mjs'),
  ));
/** @returns {typeof import('../../authoring/doctypes/icon-definition/parse.mjs')} */
const iconDefinitions = () =>
  (loaded.iconDefinitions ??= withoutModuleRecords(() =>
    require('../../authoring/doctypes/icon-definition/parse.mjs'),
  ));
/** @returns {typeof import('../../authoring/doctypes/icon-set/parse.mjs')} */
const iconSetModule = () =>
  (loaded.iconSetModule ??= withoutModuleRecords(() =>
    require('../../authoring/doctypes/icon-set/parse.mjs'),
  ));
/** @returns {typeof import('../../authoring/config/parse.mjs')} */
const config = () =>
  (loaded.config ??= withoutModuleRecords(() =>
    require('../../authoring/config/parse.mjs'),
  ));
/** @returns {typeof import('../../authoring/integration/schema.mjs')} */
const integration = () =>
  (loaded.integration ??= withoutModuleRecords(() =>
    require('../../authoring/integration/schema.mjs'),
  ));
/** @returns {typeof import('../../authoring/gap-report/parse.mjs')} */
const gapReport = () =>
  (loaded.gapReport ??= withoutModuleRecords(() =>
    require('../../authoring/gap-report/parse.mjs'),
  ));
/** @returns {typeof import('../../authoring/discover/parse.mjs')} */
const discover = () =>
  (loaded.discover ??= withoutModuleRecords(() =>
    require('../../authoring/discover/parse.mjs'),
  ));
/** @returns {typeof import('../../authoring/codemod/parse.mjs')} */
const codemods = () =>
  (loaded.codemods ??= withoutModuleRecords(() =>
    require('../../authoring/codemod/parse.mjs'),
  ));

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
