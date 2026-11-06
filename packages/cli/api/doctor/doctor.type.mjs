// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `doctor` command — source of truth for the
 * `astryx doctor` JSON response shapes. `types/doctor.d.ts` re-exports these so
 * the public `./types/doctor` entrypoint (and the types barrel) keep working
 * unchanged.
 */

/**
 * Outcome of a single diagnostic check.
 * @typedef {'pass' | 'warn' | 'fail' | 'info'} DoctorStatus
 */

/**
 * A single diagnostic check result.
 * @typedef {object} DoctorCheck
 * @property {string} id - Stable machine-readable id (e.g. 'node-version').
 * @property {string} label - Human-readable check name.
 * @property {DoctorStatus} status
 * @property {string} message - One-line result summary.
 * @property {string} [fix] - Actionable remediation: always present on 'warn' and 'fail'; some 'info' checks carry one too.
 */

/**
 * Aggregate counts per status.
 * @typedef {object} DoctorSummary
 * @property {number} pass
 * @property {number} warn
 * @property {number} fail
 * @property {number} info
 */

/**
 * `astryx --json doctor`
 * @typedef {object} DoctorResponse
 * @property {'doctor'} type
 * @property {object} data
 * @property {DoctorCheck[]} data.checks
 * @property {DoctorSummary} data.summary
 */

/**
 * Options for `doctor()`.
 * @typedef {object} DoctorOptions
 * @property {string} [cwd]
 * @property {string} [built] A finished build to check for Astryx use: a
 *   project folder, a build output folder, or one built file. Adds the
 *   `built-astryx-usage` and `built-astryx-purity` checks.
 */

export {};
