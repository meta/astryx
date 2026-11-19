// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Typedefs for `integrationCheck()` / `astryx integration check`.
 */

/**
 * Options for `integrationCheck()`.
 * @typedef {object} IntegrationCheckOptions
 * @property {string} [cwd] The integration package folder to check; the
 *   current directory by default.
 * @property {boolean} [strict] Also fail on any warning and on any check that
 *   did not run, not only on errors.
 * @property {boolean} [next] Also count each finding the next minor release
 *   turns into a warning (a note marked `next`) as a warning now, so `strict`
 *   fails on it.
 */

/**
 * The checks `integrationCheck()` runs, in the order it runs them.
 * @typedef {'validate' | 'components' | 'templates' | 'docs'} IntegrationCheckName
 */

/**
 * The envelope one check returns on its own, unchanged.
 * @typedef {import('./validate-integration.type.mjs').ValidateIntegrationResponse
 *   | import('./authoring-checks.type.mjs').IntegrationComponentConflictResponse
 *   | import('./authoring-checks.type.mjs').IntegrationTemplateConflictResponse
 *   | import('./authoring-checks.type.mjs').IntegrationDocConflictResponse} IntegrationCheckResponse
 */

/**
 * A comparison a check carries beside its issues, such as one that needs the
 * project's own TypeScript. `skipped` means it did not run, and `reason` says
 * why; each of its findings is a warning.
 * @typedef {object} IntegrationCheckReport
 * @property {'checked' | 'skipped'} status
 * @property {string} [reason]
 * @property {Array<{severity?: string}>} findings
 */

/**
 * One check's result, counted the way its own subcommand exits.
 * @typedef {object} IntegrationCheckResult
 * @property {IntegrationCheckName} check
 * @property {number} errors What makes the check's own subcommand exit 1.
 * @property {number} warnings Warning issues, conflicts and findings, and the
 *   findings of every report the check carries.
 * @property {string[]} skipped Why work did not run: no integration manifest,
 *   or a report the check carries that was skipped.
 * @property {boolean} failed Whether the check's own subcommand exits 1.
 * @property {IntegrationCheckResponse} response The check's own envelope.
 */

/**
 * A warning, or work a check skipped, as `--strict` reports it: an error in
 * the checks' own issue format, with the finding's own code (a conflict's is
 * `component_name_conflict` or `template_id_conflict`, a package with no
 * manifest's is `missing_manifest`, and a skipped comparison's is its key in
 * snake case with `_skipped`), message, and its fix, file, and line where it
 * has them.
 * @typedef {object} IntegrationCheckFailure
 * @property {IntegrationCheckName} check
 * @property {'error'} severity
 * @property {string} code
 * @property {string} message
 * @property {string} [component] the component a finding is about
 * @property {string} [prop] the prop a finding is about
 * @property {string} [fix]
 * @property {string} [file]
 * @property {number} [line]
 */

/**
 * `astryx --json integration check [--strict]`.
 *
 * `failed` decides the exit code: any check that fails on its own, and with
 * `strict` also any warning or skipped work, which `failures` then lists as
 * errors (it is empty without `strict`).
 * @typedef {object} IntegrationCheckCommandResponse
 * @property {'integration.check'} type
 * `unchecked` counts the items the checks list as not compared, which never
 * fail it.
 * @property {{validated: boolean, name: string | null, version: string | null, strict: boolean, next: boolean, checks: IntegrationCheckResult[], errors: number, warnings: number, skipped: string[], unchecked: number, upcoming: number, failures: IntegrationCheckFailure[], failed: boolean}} data
 */

export {};
