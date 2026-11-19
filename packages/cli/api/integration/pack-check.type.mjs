// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for `astryx integration verify`.
 */

/**
 * @typedef {object} IntegrationPackCheckOptions
 * @property {string} [cwd]
 */

/**
 * @typedef {object} IntegrationPackCheckResponse
 * @property {'integration.pack-check'} type
 * @property {PackCheckData} data
 */

/** @typedef {IntegrationPackCheckResponse} PackCheckResponse */

/**
 * Public contribution inventory returned by pack-check. Kept here rather than
 * importing the runtime inventory module so the type-only `/json` surface does
 * not pull implementation dependencies into downstream type checking.
 * @typedef {object} PackCheckContributionIdentities
 * @property {{slug: string, exportName: string}[]} themes
 * @property {string[]} components
 * @property {{id: string, type: string, name: string, replaces?: string}[]} templates
 * @property {{version: string, id: string}[]} codemods
 * @property {string[]} docs
 * @property {string[]} agentDocsAppend
 * @property {string[]} [iconSets] - Icon set names; present only when the package declares `experimental.iconSets`. Experimental: may change or be removed in a patch release.
 */

/**
 * @typedef {object} PackCheckData
 * @property {string|null} name
 * @property {string|null} version
 * @property {boolean} packable — true when zero error-severity issues
 * @property {PackCheckTarball|null} tarball
 * @property {PackCheckInventory} inventory
 * @property {{local: PackCheckContributionIdentities|null, packed: PackCheckContributionIdentities|null}} contributions
 * @property {import('../../foundation/integrations/issue').AstryxIntegrationIssue[]} issues
 */

/**
 * @typedef {object} PackCheckTarball
 * @property {string} filename
 * @property {number} fileCount
 * @property {number} size
 * @property {number} unpackedSize
 */

/**
 * @typedef {object} PackCheckInventory
 * @property {string|null} manifest
 * @property {PackCheckInventoryRoot[]} roots
 * @property {number} expectedFiles
 * @property {number} packedFiles
 */

/**
 * @typedef {object} PackCheckInventoryRoot
 * @property {'themes'|'components'|'templates'|'codemods'|'docs'|'iconSets'} kind
 *   `iconSets` is the experimental icon-set root: it may change or be removed
 *   in a patch release.
 * @property {string} path
 * @property {number} expectedFiles
 * @property {string[]} missingFiles
 * @property {boolean} complete
 */

export {};
