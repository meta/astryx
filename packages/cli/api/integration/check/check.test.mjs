// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file integrationCheck(): each check counted the way its own subcommand
 * exits, the reports a check carries, and what strict adds: the same data,
 * reported again as errors.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  integrationComponentConflicts,
  integrationDocConflicts,
  integrationTemplateConflicts,
} from '../authoring-checks.mjs';
import {
  CONFLICT_CODES,
  NO_MANIFEST_CODE,
  NO_MANIFEST_SKIP,
  combineChecks,
  integrationCheck,
  isCheckReport,
  skippedCode,
  summarizeCheck,
} from './check.mjs';
import {validateIntegration} from '../validate-integration.mjs';
import {discoverCoreTemplates} from '../../../foundation/discovery/template-adapter.mjs';

const IDENTITY = {validated: true, name: '@acme/widgets', version: '1.2.3'};

describe('summarizeCheck', () => {
  it('counts error and warning issues, and fails only on errors', () => {
    expect(
      summarizeCheck({
        type: 'integration.validate',
        data: {
          ...IDENTITY,
          issues: [
            {code: 'missing_root', severity: 'error', message: 'm'},
            {code: 'unknown_manifest_key', severity: 'warning', message: 'w'},
          ],
        },
      }),
    ).toEqual({errors: 1, warnings: 1, skipped: [], failed: true});
  });

  it('counts warning conflicts as warnings and ignores info', () => {
    const conflict = (/** @type {'warning' | 'info'} */ severity) =>
      /** @type {any} */ ({severity, id: 'x', message: 'm'});
    expect(
      summarizeCheck({
        type: 'integration.template-conflicts',
        data: {
          ...IDENTITY,
          issues: [],
          conflicts: [conflict('warning'), conflict('info')],
        },
      }),
    ).toEqual({errors: 0, warnings: 1, skipped: [], failed: false});
  });

  it('fails the docs check on an error finding, as its subcommand does', () => {
    const finding = (/** @type {'error' | 'info'} */ severity) =>
      /** @type {any} */ ({severity, topic: 't', message: 'm'});
    expect(
      summarizeCheck({
        type: 'integration.doc-conflicts',
        data: {
          ...IDENTITY,
          issues: [],
          findings: [finding('error'), finding('info')],
        },
      }),
    ).toEqual({errors: 1, warnings: 0, skipped: [], failed: true});
  });

  it('names a package with no manifest as skipped work, but not a missing package.json, which is an error', () => {
    expect(
      summarizeCheck({
        type: 'integration.component-conflicts',
        data: {
          validated: false,
          name: null,
          version: null,
          issues: [],
          conflicts: [],
        },
      }).skipped,
    ).toEqual([NO_MANIFEST_SKIP]);
    expect(
      summarizeCheck({
        type: 'integration.validate',
        data: {
          validated: false,
          name: null,
          version: null,
          issues: [{code: 'no_package', severity: 'error', message: 'm'}],
        },
      }),
    ).toEqual({errors: 1, warnings: 0, skipped: [], failed: true});
  });

  it('counts the findings of a report a check carries as warnings, and a skipped report as skipped work', () => {
    const data = /** @type {any} */ ({
      ...IDENTITY,
      issues: [],
      conflicts: [],
      compared: {status: 'checked', findings: [{severity: 'warning'}, {}]},
      typed: {
        status: 'skipped',
        reason: 'TypeScript is not installed',
        findings: [],
      },
      notAReport: {status: 'checked'},
    });
    expect(
      summarizeCheck({type: 'integration.component-conflicts', data}),
    ).toEqual({
      errors: 0,
      warnings: 2,
      skipped: ['TypeScript is not installed'],
      failed: false,
    });
    expect(isCheckReport(data.compared)).toBe(true);
    expect(isCheckReport(data.notAReport)).toBe(false);
  });

  it('names prop types the comparison could not judge as skipped work, which strict fails and the default run shows', () => {
    const reason =
      'TypeScript 4.7.4 is older than 4.8, the oldest the type comparison reads';
    /** @type {any[]} */
    const responses = [
      {
        type: 'integration.validate',
        data: {...IDENTITY, issues: []},
      },
      {
        type: 'integration.component-conflicts',
        data: {
          ...IDENTITY,
          issues: [],
          conflicts: [],
          propDrift: {status: 'checked', findings: [], typesSkipped: reason},
        },
      },
      {
        type: 'integration.template-conflicts',
        data: {...IDENTITY, issues: [], conflicts: []},
      },
      {
        type: 'integration.doc-conflicts',
        data: {...IDENTITY, issues: [], findings: []},
      },
    ];
    const message = `prop types not judged: ${reason}`;
    const loose = combineChecks(responses, false);
    expect(loose.skipped).toEqual([`components: ${message}`]);
    expect(loose.failures).toEqual([]);
    expect(loose.failed).toBe(false);
    const strict = combineChecks(responses, true);
    expect(strict.failures).toEqual([
      {
        check: 'components',
        severity: 'error',
        code: 'prop_types_skipped',
        message,
      },
    ]);
    expect(strict.failed).toBe(true);
  });

  it('names a skipped comparison by its key in snake case', () => {
    expect(skippedCode('propDrift')).toBe('prop_drift_skipped');
    expect(skippedCode('docTypes')).toBe('doc_types_skipped');
  });
});

/**
 * What the default run reports as warnings and skipped work, read from each
 * check's own envelope: what `--strict` must report again as errors. A later
 * check's repeat of one of validate's items is validate's, counted once.
 * @param {any} result an `integration.check` envelope
 */
function warningsAndSkips(result) {
  /** @type {Map<string, number>} */
  const fromValidate = new Map();
  /** @type {Array<{check: string, code: string, message: string}>} */
  const found = [];
  result.data.checks.forEach((/** @type {any} */ {check, response}, i) => {
    const {data} = response;
    /** @type {any[]} */
    const reports = Object.values(data).filter(isCheckReport);
    const items = [
      ...data.issues
        .filter((/** @type {any} */ x) => x.severity === 'warning')
        .map((/** @type {any} */ x) => [x.code, x.message]),
      ...(data.conflicts ?? [])
        .filter((/** @type {any} */ x) => x.severity === 'warning')
        .map((/** @type {any} */ x) => [CONFLICT_CODES[check], x.message]),
      ...reports.flatMap(report =>
        report.findings.map((/** @type {any} */ f) => [
          f.code ?? f.problem ?? f.kind,
          f.message,
        ]),
      ),
      ...(data.validated ? [] : [[NO_MANIFEST_CODE, NO_MANIFEST_SKIP]]),
      ...Object.entries(data)
        .filter(([, v]) => isCheckReport(v) && v.status === 'skipped')
        .map(([key, v]) => [skippedCode(key), v.reason]),
      ...reports
        .filter(report => typeof report.typesSkipped === 'string')
        .map(report => [
          'prop_types_skipped',
          `prop types not judged: ${report.typesSkipped}`,
        ]),
    ];
    const repeats = new Map(fromValidate);
    for (const [code, message] of items) {
      const key = `${code}\0${message}`;
      const left = repeats.get(key) ?? 0;
      if (i === 0) fromValidate.set(key, left + 1);
      else if (left > 0) {
        repeats.set(key, left - 1);
        continue;
      }
      found.push({check, code, message});
    }
  });
  return found;
}

describe('combineChecks', () => {
  const respond = (/** @type {string} */ type, /** @type {object} */ data) =>
    /** @type {any} */ ({
      type,
      data: {...IDENTITY, issues: [], conflicts: [], findings: [], ...data},
    });
  const sameMessage = (/** @type {string} */ component) => ({
    component,
    prop: 'label',
    severity: 'warning',
    kind: 'required_mismatch',
    message:
      '"label" is required in the code, but the doc does not mark it required.',
    doc: 'components/List.doc.mjs',
  });
  const responses = [
    respond('integration.validate', {
      issues: [
        {
          code: 'unknown_manifest_key',
          severity: 'warning',
          message: 'Unknown key.',
        },
      ],
    }),
    respond('integration.component-conflicts', {
      issues: [
        {
          code: 'unknown_manifest_key',
          severity: 'warning',
          message: 'Unknown key.',
        },
      ],
      report: {
        status: 'checked',
        findings: [sameMessage('List'), sameMessage('ListItem')],
        unchecked: [
          {component: 'Ghost', doc: 'components/Ghost.doc.mjs', reason: 'x'},
        ],
      },
    }),
    respond('integration.template-conflicts', {}),
    respond('integration.doc-conflicts', {}),
  ];

  it('counts the findings the next minor release fails as upcoming, and fails on them only with strict and next', () => {
    const withNotes = [
      respond('integration.validate', {
        notes: [
          {
            code: 'duplicate_component_doc',
            message: 'Two docs. Fix: one.',
            next: true,
          },
          {code: 'invalid_cli_command', message: 'Not a command.'},
        ],
      }),
      respond('integration.component-conflicts', {}),
      respond('integration.template-conflicts', {}),
      respond('integration.doc-conflicts', {}),
    ];
    // The default run, strict included, fails on none: the next minor does.
    for (const strict of [false, true]) {
      expect(combineChecks(withNotes, strict)).toMatchObject({
        upcoming: 1,
        warnings: 0,
        failures: [],
        failed: false,
      });
    }
    expect(combineChecks(withNotes, false, true)).toMatchObject({
      upcoming: 1,
      warnings: 1,
      failures: [],
      failed: false,
    });
    // validate's own summary row shows the note it now counts.
    expect(combineChecks(withNotes, false, true).checks[0].warnings).toBe(1);
    expect(combineChecks(withNotes, false).checks[0].warnings).toBe(0);
    expect(combineChecks(withNotes, true, true)).toMatchObject({
      upcoming: 1,
      warnings: 1,
      failures: [
        {
          check: 'validate',
          severity: 'error',
          code: 'duplicate_component_doc',
          message: 'Two docs. Fix: one.',
        },
      ],
      failed: true,
    });
  });

  it('counts a package-level issue once, and two findings with one message twice, naming each component', () => {
    const loose = combineChecks(responses, false);
    const strict = combineChecks(responses, true);

    expect(loose).toMatchObject({
      errors: 0,
      warnings: 3,
      unchecked: 1,
      failed: false,
    });
    expect(strict.warnings).toBe(3);
    expect(
      strict.failures.map(f => [f.check, f.code, f.component ?? null]),
    ).toEqual([
      ['validate', 'unknown_manifest_key', null],
      ['components', 'required_mismatch', 'List'],
      ['components', 'required_mismatch', 'ListItem'],
    ]);
    expect(strict.failures[1]).toMatchObject({
      prop: 'label',
      file: 'components/List.doc.mjs',
    });
  });

  it('counts each finding a check repeats within itself, and consumes only validate’s own issues as repeats', () => {
    const issue = (/** @type {string} */ code, severity = 'warning') => ({
      code,
      severity,
      message: code,
    });
    const root = issue('invalid_root', 'error');
    const link = issue('invalid_doc_graph');
    const broken = issue('bad_link', 'error');
    const repeated = ['validate', 'component', 'template', 'doc'].map(kind =>
      respond(
        `integration.${kind === 'validate' ? kind : `${kind}-conflicts`}`,
        {
          issues: kind === 'doc' ? [root, link, link, broken, broken] : [root],
        },
      ),
    );

    const loose = combineChecks(repeated, false);
    const strict = combineChecks(repeated, true);

    expect(loose.checks.map(c => `${c.errors}/${c.warnings}`)).toEqual([
      '1/0',
      '1/0',
      '1/0',
      '3/2',
    ]);
    expect(loose).toMatchObject({errors: 3, warnings: 2});
    expect(strict.failures.map(f => [f.check, f.code])).toEqual([
      ['docs', 'invalid_doc_graph'],
      ['docs', 'invalid_doc_graph'],
    ]);
  });

  it('states each option’s default in its reference doc', async () => {
    const {doc} = await import('../integrationCheck.doc.mjs');
    const params = new Map(doc.params?.map(param => [param.name, param]));
    expect(params.get('options.strict')?.default).toBe('false');
    expect(params.get('options.cwd')?.default).toBe('process.cwd()');
  });
});

describe('integrationCheck', () => {
  /** @type {string} */
  let pkg;

  beforeEach(() => {
    // Under the repository, so the components check resolves Core.
    pkg = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-integration-check-'),
    );
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default {templates: './templates'};\n",
    );
    fs.mkdirSync(path.join(pkg, 'templates'));
    fs.writeFileSync(
      path.join(pkg, 'templates', 'acme-page.doc.mjs'),
      "export default {type: 'page', name: 'Acme page', displayName: 'Acme page', description: 'fixture', replaces: 'missing-core-page'};\n",
    );
    fs.writeFileSync(
      path.join(pkg, 'templates', 'acme-page.tsx'),
      'export default function Fixture() { return null; }\n',
    );
  });

  afterEach(() => {
    fs.rmSync(pkg, {recursive: true, force: true});
  });

  it('returns each check’s own envelope, unchanged, in the order the checks run', async () => {
    const result = await integrationCheck({cwd: pkg});

    expect(result.type).toBe('integration.check');
    expect(result.data.checks.map(check => check.response)).toEqual([
      await validateIntegration(undefined, {cwd: pkg}),
      await integrationComponentConflicts(undefined, {cwd: pkg}),
      await integrationTemplateConflicts(undefined, {cwd: pkg}),
      await integrationDocConflicts(undefined, {cwd: pkg}),
    ]);
  });

  it('fails when a check fails on its own, with or without strict', async () => {
    const result = await integrationCheck({cwd: pkg});

    const templates = result.data.checks.find(
      check => check.check === 'templates',
    );
    expect(templates?.failed).toBe(true);
    expect(result.data).toMatchObject({
      validated: true,
      strict: false,
      failures: [],
      failed: true,
    });
    expect(result.data.errors).toBeGreaterThan(0);
  });

  it('fails on warnings only with strict, which reports exactly the default run’s warnings and skipped work again, as errors', async () => {
    const core = (await discoverCoreTemplates()).find(
      template => template.type === 'page',
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default {templates: './templates', unknownKey: true};\n",
    );
    fs.rmSync(path.join(pkg, 'templates', 'acme-page.doc.mjs'));
    fs.renameSync(
      path.join(pkg, 'templates', 'acme-page.tsx'),
      path.join(pkg, 'templates', `${core?.dirName}.tsx`),
    );
    fs.writeFileSync(
      path.join(pkg, 'templates', `${core?.dirName}.doc.mjs`),
      "export default {type: 'page', name: 'Acme page', displayName: 'Acme page', description: 'fixture'};\n",
    );

    const loose = await integrationCheck({cwd: pkg});
    const strict = await integrationCheck({cwd: pkg, strict: true});

    expect(loose.data).toMatchObject({errors: 0, failures: [], failed: false});
    // The unknown key is validate's, and every check starts from validate's
    // issues: it counts once.
    expect(loose.data.warnings).toBe(2);
    expect(strict.data).toMatchObject({strict: true, errors: 0, failed: true});
    expect(strict.data.warnings).toBe(loose.data.warnings);
    // Same data: the same checks, read once each, in both modes.
    expect(strict.data.checks.map(check => check.response)).toEqual(
      loose.data.checks.map(check => check.response),
    );
    // Only the severity changes.
    expect(new Set(strict.data.failures.map(f => f.severity))).toEqual(
      new Set(['error']),
    );
    expect(
      strict.data.failures.map(({check, code, message}) => ({
        check,
        code,
        message,
      })),
    ).toEqual(warningsAndSkips(loose));
    expect(strict.data.failures.map(f => [f.check, f.code])).toEqual([
      ['validate', 'unknown_manifest_key'],
      ['templates', 'template_id_conflict'],
    ]);
  });

  it('counts a missing root once, though every check reports it', async () => {
    fs.rmSync(path.join(pkg, 'templates'), {recursive: true, force: true});

    const result = await integrationCheck({cwd: pkg});

    expect(result.data.checks.map(check => check.failed)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(result.data.errors).toBe(1);
    expect(result.data.failed).toBe(true);
  });

  it('reads a missing package.json from validate alone', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-pkg-'));
    try {
      const result = await integrationCheck({cwd: empty, strict: true});

      expect(result.data).toMatchObject({
        errors: 1,
        skipped: [],
        failures: [],
        failed: true,
      });
      expect(result.data.checks.map(check => check.skipped)).toEqual([
        [],
        [],
        [],
        [],
      ]);
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });
});
