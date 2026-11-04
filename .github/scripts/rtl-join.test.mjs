// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import componentPackages from '../../scripts/component-packages.cjs';
import {evaluateRtlJoin, readShardEvidence} from './rtl-join.mjs';

const {COMPONENT_PACKAGE_NAMES} = componentPackages;
const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'rtl-join.mjs',
);

function completeEvidence(applicable = [...COMPONENT_PACKAGE_NAMES]) {
  return {
    scopes: COMPONENT_PACKAGE_NAMES.map(packageName => ({
      package: packageName,
      shouldRun: applicable.includes(packageName),
      filter: '',
    })),
    reports: [...applicable],
    errors: [],
  };
}

function evaluate(overrides = {}) {
  return evaluateRtlJoin({
    checkComponentsResult: 'success',
    shardResult: 'success',
    shouldRun: true,
    evidence: completeEvidence(['charts']),
    ...overrides,
  });
}

describe('RTL matrix join', () => {
  it('accepts exact evidence for the applicable package set', () => {
    expect(evaluate()).toEqual({
      ok: true,
      message: 'All applicable RTL package shards produced reports.',
    });
  });

  it.each([
    ['failure', 'success'],
    ['cancelled', 'success'],
    ['success', 'failure'],
    ['success', 'cancelled'],
    ['success', 'skipped'],
  ])(
    'rejects classification=%s shards=%s when work is required',
    (checkComponentsResult, shardResult) => {
      expect(evaluate({checkComponentsResult, shardResult}).ok).toBe(false);
    },
  );

  it('binds trusted full scope to five runnable empty-filter shards', () => {
    expect(
      evaluate({forceFull: true, evidence: completeEvidence(['charts'])}),
    ).toEqual({
      ok: false,
      message: 'Trusted full scope was narrowed by a package shard.',
    });
    expect(evaluate({forceFull: true, evidence: completeEvidence()}).ok).toBe(
      true,
    );
    const filtered = completeEvidence();
    filtered.scopes[0].filter = 'core/Button';
    expect(evaluate({forceFull: true, evidence: filtered}).ok).toBe(false);
  });

  it('accepts the no-scope skipped state only after classification succeeds', () => {
    expect(
      evaluateRtlJoin({
        checkComponentsResult: 'success',
        shardResult: 'skipped',
        shouldRun: false,
      }),
    ).toEqual({
      ok: true,
      message: 'No RTL-owned scope; package shards did no RTL work.',
    });
    expect(
      evaluateRtlJoin({
        checkComponentsResult: 'success',
        shardResult: 'skipped',
        shouldRun: false,
        forceFull: true,
      }).ok,
    ).toBe(false);
    expect(
      evaluateRtlJoin({
        checkComponentsResult: 'failure',
        shardResult: 'skipped',
        shouldRun: false,
      }).ok,
    ).toBe(false);
    // Shards that decided their own scope and did nothing succeed with no
    // manifest or report; any RTL output from them is unexpected.
    expect(
      evaluateRtlJoin({
        checkComponentsResult: 'success',
        shardResult: 'success',
        shouldRun: false,
      }).ok,
    ).toBe(true);
    expect(
      evaluateRtlJoin({
        checkComponentsResult: 'success',
        shardResult: 'success',
        shouldRun: false,
        evidence: completeEvidence(),
      }).ok,
    ).toBe(false);
    // The shard and merge jobs can land on different sides of the no-op.
    for (const shardResult of ['skipped/success', 'success/skipped']) {
      expect(
        evaluateRtlJoin({
          checkComponentsResult: 'success',
          shardResult,
          shouldRun: false,
        }).ok,
        shardResult,
      ).toBe(true);
    }
    expect(
      evaluateRtlJoin({
        checkComponentsResult: 'success',
        shardResult: 'skipped/failure',
        shouldRun: false,
      }).ok,
    ).toBe(false);
  });

  it('rejects all-skipped manifests when trusted scope requires work', () => {
    expect(evaluate({evidence: completeEvidence([])})).toEqual({
      ok: false,
      message: 'RTL scope required work, but every package shard skipped.',
    });
  });

  it.each([0, 1, 4])(
    'rejects %i reports when all five packages are applicable',
    reportCount => {
      const evidence = completeEvidence();
      evidence.reports = COMPONENT_PACKAGE_NAMES.slice(0, reportCount);
      expect(evaluate({evidence}).ok).toBe(false);
    },
  );

  it('accepts exactly five reports when all five packages are applicable', () => {
    expect(evaluate({evidence: completeEvidence()}).ok).toBe(true);
  });

  it('rejects duplicate, missing, and unexpected report packages', () => {
    const duplicate = completeEvidence(['charts']);
    duplicate.reports.push('charts');
    expect(evaluate({evidence: duplicate}).ok).toBe(false);

    const missing = completeEvidence(['charts', 'core']);
    missing.reports = ['charts'];
    expect(evaluate({evidence: missing}).ok).toBe(false);

    const unexpected = completeEvidence(['charts']);
    unexpected.reports.push('core');
    expect(evaluate({evidence: unexpected}).ok).toBe(false);
  });

  it('rejects missing, duplicate, and malformed scope manifests', () => {
    const missing = completeEvidence(['charts']);
    missing.scopes.pop();
    expect(evaluate({evidence: missing}).ok).toBe(false);

    const duplicate = completeEvidence(['charts']);
    duplicate.scopes.push({
      package: 'charts',
      shouldRun: true,
      filter: '',
    });
    expect(evaluate({evidence: duplicate}).ok).toBe(false);

    expect(
      evaluate({
        evidence: {
          ...completeEvidence(['charts']),
          errors: ['invalid scope manifest'],
        },
      }).ok,
    ).toBe(false);
  });

  it('reads nested scope and report artifacts with package identity', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-join-evidence-'));
    try {
      for (const packageName of COMPONENT_PACKAGE_NAMES) {
        const shard = path.join(dir, `rtl-audit-report-${packageName}`);
        fs.mkdirSync(shard);
        fs.writeFileSync(
          path.join(shard, 'rtl-shard-scope.json'),
          JSON.stringify({
            package: packageName,
            shouldRun: packageName === 'charts',
            filter: '',
          }),
        );
        if (packageName === 'charts') {
          fs.writeFileSync(
            path.join(shard, 'rtl-audit-report.json'),
            JSON.stringify({scope: {packages: ['charts']}}),
          );
        }
      }
      expect(readShardEvidence(dir)).toEqual(completeEvidence(['charts']));
      const narrowedFullScope = spawnSync(
        process.execPath,
        [
          SCRIPT,
          '--check-components',
          'success',
          '--shards',
          'success',
          '--should-run',
          'true',
          '--force-full',
          'true',
          '--reports-dir',
          dir,
        ],
        {encoding: 'utf8'},
      );
      expect(narrowedFullScope.status).not.toBe(0);
      expect(narrowedFullScope.stderr).toContain(
        'Trusted full scope was narrowed',
      );
      fs.writeFileSync(
        path.join(dir, 'rtl-audit-report-charts', 'rtl-audit-report.json'),
        JSON.stringify({scope: {packages: ['unknown']}}),
      );
      expect(readShardEvidence(dir).errors[0]).toContain(
        'invalid shard report',
      );
      expect(readShardEvidence(path.join(dir, 'missing'))).toEqual({
        scopes: [],
        reports: [],
        errors: [],
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
