// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx integration check`: every `doctor integration` check in one
 * call, for a package's own build.
 *
 * Runs `validate`, `components`, `templates` and `docs` against the
 * integration package in `cwd` and counts each result the way that check's
 * own subcommand exits, so the
 * run fails exactly when one of them would. With `strict` it also fails on
 * any warning and on any check, or comparison a check carries, that did not
 * run, so a package can gate its build on its docs staying in sync. `--strict`
 * adds no check: it reports the same warnings and skipped work again, as
 * errors in the checks' own issue format, and fails on them. `--next` counts
 * the findings the next minor release turns into warnings (validate's notes
 * marked `next`) as warnings now, so a package can fix them ahead of the
 * release; every run reports how many there are.
 *
 * What fails it is a contract for the builds that run it: a new check, or a
 * new failure code, joins only in a minor release that names it.
 * `test/integration-check-failures.test.mjs` lists each one, so adding one
 * shows up in review.
 *
 * @input A local or installed integration package.
 * @output Each check's own envelope with its errors, warnings and skipped
 *   work, the totals, and whether the run fails.
 * @position Backs `astryx integration check`.
 */

import {
  integrationComponentConflicts,
  integrationDocConflicts,
  integrationTemplateConflicts,
} from '../authoring-checks.mjs';
import {
  summarizeIssues,
  validateIntegration,
} from '../validate-integration.mjs';

/** @typedef {import('../integration-check.type.mjs').IntegrationCheckName} IntegrationCheckName */
/** @typedef {import('../integration-check.type.mjs').IntegrationCheckReport} IntegrationCheckReport */
/** @typedef {import('../integration-check.type.mjs').IntegrationCheckResponse} IntegrationCheckResponse */
/** @typedef {import('../integration-check.type.mjs').IntegrationCheckResult} IntegrationCheckResult */
/** @typedef {import('../integration-check.type.mjs').IntegrationCheckOptions} IntegrationCheckOptions */
/** @typedef {import('../integration-check.type.mjs').IntegrationCheckCommandResponse} IntegrationCheckCommandResponse */
/** @typedef {import('../integration-check.type.mjs').IntegrationCheckFailure} IntegrationCheckFailure */

/** The checks `integration check` runs, in the order it runs them. */
export const INTEGRATION_CHECKS = /** @type {const} */ ([
  'validate',
  'components',
  'templates',
  'docs',
]);

/** The skipped-work line for a package with no integration manifest. */
export const NO_MANIFEST_SKIP =
  'No astryx.integration.* found next to package.json, so nothing was checked.';

/**
 * The code a conflict carries when `--strict` reports it: conflicts have no
 * code of their own.
 */
export const CONFLICT_CODES = /** @type {const} */ ({
  components: 'component_name_conflict',
  templates: 'template_id_conflict',
});

/** The code a check with no integration manifest carries under `--strict`. */
export const NO_MANIFEST_CODE = 'missing_manifest';

/**
 * The code a skipped comparison carries under `--strict`: its key in the
 * check's result, in snake case, then `_skipped` (`propDrift` is
 * `prop_drift_skipped`).
 * @param {string} key
 */
export function skippedCode(key) {
  return `${key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}_skipped`;
}

/** Each check's envelope type, by check. */
const CHECK_OF_TYPE = /** @type {const} */ ({
  'integration.validate': 'validate',
  'integration.component-conflicts': 'components',
  'integration.template-conflicts': 'templates',
  'integration.doc-conflicts': 'docs',
});

/**
 * Whether a value is a report a check carries beside its issues: a
 * comparison with a `status` of `checked` or `skipped` and its `findings`.
 * @param {unknown} value
 * @returns {value is IntegrationCheckReport}
 */
export function isCheckReport(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const report = /** @type {{status?: unknown, findings?: unknown}} */ (value);
  return (
    (report.status === 'checked' || report.status === 'skipped') &&
    Array.isArray(report.findings)
  );
}

/**
 * One finding as an issue: its own code, message, fix, file, and line where
 * it has them.
 * @param {any} finding
 * @param {string} code
 * @returns {Omit<IntegrationCheckFailure, 'check' | 'severity'>}
 */
function asIssue(finding, code) {
  const file = finding.file ?? finding.doc ?? finding.source;
  return {
    code,
    message: String(finding.message ?? ''),
    ...(typeof finding.component === 'string'
      ? {component: finding.component}
      : {}),
    ...(typeof finding.prop === 'string' ? {prop: finding.prop} : {}),
    ...(typeof finding.fix === 'string' ? {fix: finding.fix} : {}),
    ...(typeof file === 'string' ? {file} : {}),
    ...(typeof finding.line === 'number' ? {line: finding.line} : {}),
  };
}

/**
 * Every warning in one check's result, and every piece of work it skipped,
 * as issues: what `--strict` reports as errors. The counts come from the
 * same list, so the default run and the strict run read the same data.
 * @param {IntegrationCheckName} check
 * @param {IntegrationCheckResponse} response
 * @param {{noPackage?: boolean}} [context] `noPackage`: validate found no
 *   package.json, which only it reports; then no other check names a
 *   missing manifest as skipped work
 * @returns {{warnings: Array<Omit<IntegrationCheckFailure, 'check' | 'severity'>>, skipped: Array<Omit<IntegrationCheckFailure, 'check' | 'severity'>>}}
 */
export function strictIssues(check, response, context = {}) {
  const data =
    /** @type {Record<string, unknown> & IntegrationCheckResponse['data']} */ (
      response.data
    );
  const warnings = [];
  for (const issue of data.issues) {
    if (issue.severity === 'warning') {
      warnings.push(asIssue(issue, issue.code));
    }
  }
  const conflictCode = /** @type {Record<string, string>} */ (CONFLICT_CODES)[
    check
  ];
  for (const conflict of /** @type {any[]} */ (
    Array.isArray(data.conflicts) ? data.conflicts : []
  )) {
    if (conflict.severity === 'warning' && conflictCode) {
      warnings.push(asIssue(conflict, conflictCode));
    }
  }
  for (const finding of /** @type {any[]} */ (
    Array.isArray(data.findings) ? data.findings : []
  )) {
    if (finding.severity === 'warning') {
      warnings.push(asIssue(finding, finding.code ?? finding.relationship));
    }
  }
  const skipped = [];
  const noPackage =
    context.noPackage === true ||
    data.issues.some(issue => issue.code === 'no_package');
  if (!data.validated && !noPackage) {
    skipped.push({code: NO_MANIFEST_CODE, message: NO_MANIFEST_SKIP});
  }
  for (const [key, value] of Object.entries(data)) {
    if (!isCheckReport(value)) continue;
    if (value.status === 'skipped') {
      skipped.push({
        code: skippedCode(key),
        message: value.reason ?? `${key} did not run`,
      });
      continue;
    }
    for (const finding of /** @type {any[]} */ (value.findings)) {
      if ((finding.severity ?? 'warning') !== 'warning') continue;
      warnings.push(
        asIssue(finding, finding.code ?? finding.problem ?? finding.kind),
      );
    }
    // A comparison that ran but judged no prop type (a TypeScript older than
    // the type comparison reads) skipped that work.
    const typesSkipped = /** @type {{typesSkipped?: unknown}} */ (value)
      .typesSkipped;
    if (typeof typesSkipped === 'string') {
      skipped.push({
        code: 'prop_types_skipped',
        message: `prop types not judged: ${typesSkipped}`,
      });
    }
  }
  return {warnings, skipped};
}

/**
 * Count one check's result the way its own subcommand exits. Errors are what
 * make it exit 1: error-severity issues, and for `docs` error findings.
 * Warnings are warning issues, conflicts and findings, and the findings of
 * any report the check carries. Skipped names work that did not run: no
 * integration manifest, or a report that was skipped.
 * @param {IntegrationCheckResponse} response
 * @param {{noPackage?: boolean}} [context] as {@link strictIssues} takes it
 * @returns {Omit<IntegrationCheckResult, 'check' | 'response'>}
 */
export function summarizeCheck(response, context = {}) {
  const check = /** @type {IntegrationCheckName} */ (
    CHECK_OF_TYPE[response.type]
  );
  let errors = summarizeIssues(response.data.issues).errors;
  // The docs check is the one whose findings fail it.
  if (response.type === 'integration.doc-conflicts') {
    errors += response.data.findings.filter(
      finding => finding.severity === 'error',
    ).length;
  }
  const {warnings, skipped} = strictIssues(check, response, context);
  return {
    errors,
    warnings: warnings.length,
    skipped: skipped.map(each => each.message),
    failed: errors > 0,
  };
}

/**
 * Run every `doctor integration` check against the integration package in
 * `cwd`, as its own build does, and return the `integration.check` envelope.
 *
 * @param {IntegrationCheckOptions} [options]
 * @returns {Promise<IntegrationCheckCommandResponse>}
 */
export async function integrationCheck(options = {}) {
  const {cwd = process.cwd(), strict = false, next = false} = options;
  // One after another: each loads the package through the same discovery.
  /** @type {IntegrationCheckResponse[]} */
  const responses = [];
  responses.push(await validateIntegration(undefined, {cwd}));
  responses.push(await integrationComponentConflicts(undefined, {cwd}));
  responses.push(await integrationTemplateConflicts(undefined, {cwd}));
  responses.push(await integrationDocConflicts(undefined, {cwd}));

  const [validation] = responses;
  return {
    type: 'integration.check',
    data: {
      validated: validation.data.validated,
      name: validation.data.name,
      version: validation.data.version,
      strict,
      next,
      ...combineChecks(responses, strict, next),
    },
  };
}

/**
 * Count the four checks' results into one summary. Each check's own row
 * counts as its subcommand exits; the totals and `failures` count validate's
 * issues once, though the other checks repeat them, and every other finding
 * on its own, so two findings with one message stay two.
 * @param {IntegrationCheckResponse[]} responses validate first
 * @param {boolean} strict
 * @param {boolean} [next] count validate's notes marked `next`, the findings
 *   the next minor release turns into warnings, as warnings now
 */
export function combineChecks(responses, strict, next = false) {
  const [validation] = responses;
  // Only validate reports a missing package.json; the other checks read it
  // from there instead of each naming a missing manifest.
  const noPackage = validation.data.issues.some(
    issue => issue.code === 'no_package',
  );
  /** @type {IntegrationCheckResult[]} */
  const checks = responses.map(response => ({
    check: /** @type {IntegrationCheckName} */ (CHECK_OF_TYPE[response.type]),
    ...summarizeCheck(response, {noPackage}),
    response,
  }));
  // Later checks repeat validate's issues and its missing manifest: each
  // match is consumed once per check, as from a multiset. Every other issue
  // counts, even a repeat within one check.
  const keyOf = (/** @type {string} */ kind, /** @type {object} */ issue) =>
    `${kind}\0${JSON.stringify(issue)}`;
  const validateFound = strictIssues('validate', validation, {noPackage});
  /** @type {Map<string, number>} */
  const fromValidate = new Map();
  for (const key of [
    ...validation.data.issues
      .filter(issue => issue.severity === 'error')
      .map(issue => keyOf('error', asIssue(issue, issue.code))),
    ...validateFound.warnings.map(issue => keyOf('warning', issue)),
    ...validateFound.skipped.map(issue => keyOf('skipped', issue)),
  ]) {
    fromValidate.set(key, (fromValidate.get(key) ?? 0) + 1);
  }

  let errors = 0;
  let warnings = 0;
  let unchecked = 0;
  /** @type {string[]} */
  const skipped = [];
  // `--strict` adds no check: it reports the same warnings and skipped work
  // as errors, and they fail the run.
  /** @type {IntegrationCheckFailure[]} */
  const failures = [];
  checks.forEach(({check, response}, index) => {
    /** @type {Map<string, number>} */
    const repeats = index === 0 ? new Map() : new Map(fromValidate);
    const isRepeat = (/** @type {string} */ key) => {
      const left = repeats.get(key) ?? 0;
      if (left === 0) return false;
      repeats.set(key, left - 1);
      return true;
    };
    for (const issue of response.data.issues) {
      if (
        issue.severity === 'error' &&
        !isRepeat(keyOf('error', asIssue(issue, issue.code)))
      ) {
        errors++;
      }
    }
    if (response.type === 'integration.doc-conflicts') {
      errors += response.data.findings.filter(
        finding => finding.severity === 'error',
      ).length;
    }
    for (const value of Object.values(response.data)) {
      const list = /** @type {{unchecked?: unknown}} */ (value)?.unchecked;
      if (isCheckReport(value) && Array.isArray(list)) unchecked += list.length;
    }
    const found =
      index === 0 ? validateFound : strictIssues(check, response, {noPackage});
    for (const issue of found.warnings) {
      if (isRepeat(keyOf('warning', issue))) continue;
      warnings++;
      if (strict) failures.push({check, severity: 'error', ...issue});
    }
    for (const issue of found.skipped) {
      if (isRepeat(keyOf('skipped', issue))) continue;
      skipped.push(`${check}: ${issue.message}`);
      if (strict) failures.push({check, severity: 'error', ...issue});
    }
  });
  // The findings the next minor release turns into warnings: always counted,
  // so the default run can say how many there are, and with `next` counted
  // as warnings now.
  const notes =
    /** @type {{notes?: Array<{code: string, message: string, next?: boolean}>}} */ (
      validation.data
    ).notes ?? [];
  const upcoming = notes.filter(note => note.next === true);
  if (next) {
    warnings += upcoming.length;
    // validate's own row counts them too, so the summary shows what fails.
    checks[0].warnings += upcoming.length;
    if (strict) {
      for (const note of upcoming) {
        failures.push({
          check: 'validate',
          severity: 'error',
          code: note.code,
          message: note.message,
        });
      }
    }
  }
  return {
    checks,
    errors,
    warnings,
    skipped,
    unchecked,
    upcoming: upcoming.length,
    failures,
    failed: checks.some(check => check.failed) || failures.length > 0,
  };
}
