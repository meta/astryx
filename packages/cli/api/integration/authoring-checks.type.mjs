// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated public types for integration authoring diagnostics.
 * @input Stable response fields exposed by integration-authoring APIs.
 * @output JSDoc typedefs consumed by declarations, commands, and callers.
 * @position Public type boundary for integration diagnostics.
 */

/**
 * @typedef {object} IntegrationAuthoringOptions
 * @property {string} [cwd]
 */

/**
 * @typedef {object} CoreTemplateMatch
 * @property {'page' | 'block'} type
 * @property {string} name
 */

/**
 * @typedef {object} IntegrationTemplateConflict
 * @property {string} id
 * @property {'warning'} severity
 * @property {string} integrationPackage
 * @property {'page' | 'block'} integrationType
 * @property {string} integrationName
 * @property {CoreTemplateMatch[]} coreMatches
 * @property {string} message
 * @property {string} command
 */

/**
 * @typedef {object} IntegrationComponentConflict
 * @property {string} name
 * @property {'warning'} severity
 * @property {string} integrationPackage
 * @property {string} message
 * @property {string} command
 */

/**
 * @typedef {object} IntegrationDocFinding
 * @property {string} topic
 * @property {'info' | 'error'} severity
 * @property {'replaces' | 'extends' | 'accidental'} relationship
 * @property {string} coreTopic
 * @property {string} message
 */

/**
 * A passage two topics repeat word for word: two of the package's own topics,
 * or one of them and a Core topic (never the Core topic it replaces). Only
 * prose counts, and only a run of 10 or more identical words, so each entry
 * is a real copy. Each is also a `copied_passage` warning, so
 * `integration check --strict` fails on it (architecture:cli-surface DEC-8).
 *
 * @typedef {object} CopiedPassage
 * @property {string} topic the package topic to change: it repeats the passage
 * @property {string | null} section the title of the section the passage starts in
 * @property {number | null} line the file line where the passage starts in `topic`, or null
 * @property {string} otherTopic the topic that also has it
 * @property {string} owner the topic that should keep the text: a Core topic, or of two package topics the one it fits
 * @property {string} text the passage as `topic` writes it: what to replace
 * @property {'package' | 'core'} otherOwner whether that topic is the package's own or Core's
 * @property {number} words the length of the longest shared run, in words
 * @property {number} passages how many separate runs the two topics share
 * @property {string} message what is repeated, and the exact fix: the passage in `topic` replaced by a link to `owner`
 */

/**
 * Fluff in a topic's prose: a padding phrase (`kind: 'phrase'`, with the
 * phrase, its section, and the file line where it was found), or a topic of
 * 80 or more prose words of which fewer than half are content words
 * (`kind: 'density'`, with the share). Each is also a `doc_fluff` warning, so
 * `integration check --strict` fails on it (architecture:cli-surface DEC-8).
 *
 * @typedef {object} DocFluff
 * @property {string} topic
 * @property {'phrase' | 'density'} kind
 * @property {string | null} phrase the padding phrase, for `kind: 'phrase'`
 * @property {string | null} section the title of the section it is in
 * @property {string} file the doc file, relative to the package root
 * @property {number | null} line the file line that holds the phrase, when one line does
 * @property {number | null} density the share of content words, for `kind: 'density'`
 * @property {string} message what to cut or write instead
 */

/**
 * A code span in prose that is exactly `astryx docs <name>` for a doc that
 * exists, where the doc's `{@link generic:<name>}` would be checked. Each is
 * also a `stray_doc_pointer` warning, so `integration check --strict` fails on
 * it (architecture:cli-surface DEC-8).
 *
 * @typedef {object} StrayPointer
 * @property {string} topic the package topic, or component doc, that has it
 * @property {'topic' | 'component'} kind whether it sits in a topic or a
 *   component doc
 * @property {string | null} section the title of the section it is in
 * @property {string | null} field the field it is in outside any section: a
 *   topic's `description` or `summary`, or a component doc's field path, such
 *   as `usage.bestPractices[0].description`
 * @property {string} file the doc file, relative to the package root
 * @property {number | null} line the file line that holds it, when found
 * @property {string} pointer the written command, `astryx docs <name>`
 * @property {string} link the link that replaces it
 * @property {string} message the exact replacement
 */

/**
 * Each of the three authoring checks reports `validated`: false means no
 * integration manifest was found, so nothing was inspected and the empty
 * conflicts/findings list carries no information about the package.
 *
 * @typedef {object} IntegrationTemplateConflictResponse
 * @property {'integration.template-conflicts'} type
 * @property {{validated: boolean, name: string | null, version: string | null, conflicts: IntegrationTemplateConflict[], issues: import('../../foundation/integrations/issue').AstryxIntegrationIssue[]}} data
 */

/**
 * Documented props compared with the component's TypeScript props. Present
 * when the manifest loads and declares a components root. `status: 'skipped'`
 * means nothing was compared (no TypeScript in the project) and `reason` says
 * why. Every finding is a warning.
 *
 * @typedef {import('../../foundation/discovery/prop-drift.mjs').PropDriftReport} PropDriftReport
 */

/**
 * @typedef {import('../../foundation/discovery/prop-drift.mjs').PropDriftFinding} PropDriftFinding
 */

/**
 * @typedef {object} IntegrationComponentConflictResponse
 * @property {'integration.component-conflicts'} type
 * @property {{validated: boolean, name: string | null, version: string | null, conflicts: IntegrationComponentConflict[], issues: import('../../foundation/integrations/issue').AstryxIntegrationIssue[], propDrift?: PropDriftReport}} data
 */

/**
 * @typedef {object} IntegrationDocConflictResponse
 * @property {'integration.doc-conflicts'} type
 * @property {{validated: boolean, name: string | null, version: string | null, findings: IntegrationDocFinding[], copiedPassages: CopiedPassage[], fluff: DocFluff[], strayPointers: StrayPointer[], issues: import('../../foundation/integrations/issue').AstryxIntegrationIssue[]}} data
 */

export {};
