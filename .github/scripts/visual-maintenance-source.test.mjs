// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Canonical baseline-capture identity contracts.
 * @input A full visual manifest and verdict produced by the maintenance capture.
 * @output Refusal for partial, stale, or wrongly routed candidate evidence.
 * @position Validation before a candidate artifact can become a reviewed PR.
 */

import {createHash} from 'node:crypto';

import {describe, expect, it} from 'vitest';

import {validateVisualMaintenanceCapture} from './visual-maintenance-source.mjs';

const SHA = 'a'.repeat(40);
const KEY = 'core-button--default__neutral-light';

function captureFixture() {
  const keys = [KEY];
  const context = {
    sha: SHA,
    ref: 'refs/heads/main',
    runId: '101',
    runAttempt: '2',
    releasePlan: {
      version: 1,
      lane: 'stable-release',
      authority: 'report-removals',
      keys,
      digest: createHash('sha256').update(JSON.stringify(keys)).digest('hex'),
    },
  };
  return {
    manifest: {
      context,
      shots: {[KEY]: {stableVisual: true, stableThemeVisual: true}},
    },
    verdict: {context: structuredClone(context), status: 'changed'},
    sha: SHA,
    runId: 101,
    runAttempt: 2,
  };
}

describe('canonical baseline candidate identity', () => {
  it('accepts the full canonical source without changing the baseline or verdict', () => {
    const fixture = captureFixture();
    const before = structuredClone(fixture);
    validateVisualMaintenanceCapture(fixture);
    expect(fixture).toEqual(before);
  });

  it.each([
    [
      'wrong captured commit',
      fixture => (fixture.manifest.context.sha = 'b'.repeat(40)),
    ],
    [
      'wrong captured ref',
      fixture => (fixture.manifest.context.ref = 'refs/heads/feature'),
    ],
    ['wrong captured run', fixture => (fixture.manifest.context.runId = '102')],
    [
      'wrong captured attempt',
      fixture => (fixture.manifest.context.runAttempt = '1'),
    ],
    ['missing captured shot', fixture => (fixture.manifest.shots = {})],
    [
      'scoped PR capture',
      fixture => delete fixture.manifest.context.releasePlan,
    ],
    [
      'mismatched plan digest',
      fixture => (fixture.manifest.context.releasePlan.digest = 'invalid'),
    ],
    [
      'mismatched verdict identity',
      fixture => (fixture.verdict.context.sha = 'b'.repeat(40)),
    ],
    [
      'mismatched verdict plan',
      fixture => (fixture.verdict.context.releasePlan.keys = []),
    ],
    ['skipped capture', fixture => (fixture.verdict.status = 'skipped')],
  ])('refuses %s', (_label, mutate) => {
    const fixture = captureFixture();
    mutate(fixture);
    expect(() => validateVisualMaintenanceCapture(fixture)).toThrow();
  });
});
