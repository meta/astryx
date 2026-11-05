// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import type {UniversalRunSummary, UniversalScore} from './types';
import {
  buildExecutionBreakdown,
  loadOptionalExecutionProvenance,
  matchesExecutionFilter,
  resolveDuration,
  resolveUsage,
} from './provenance-aggregation';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

function score(value: number): UniversalScore {
  return {
    correctness: {score: value},
    accessibility: {score: value},
    codeQuality: {score: value},
    efficiency: {score: value},
    maintainability: {score: value},
  };
}

function run(
  promptId: string,
  harness: string,
  model: string,
  usageComplete = true,
): UniversalRunSummary {
  return {
    promptId,
    taskId: promptId,
    harness,
    model,
    score: score(80),
    duration: {valueMs: 100, source: 'provenance', quality: 'measured'},
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      source: 'runner',
      quality: usageComplete ? 'complete' : 'incomplete',
      complete: usageComplete,
    },
  };
}

describe('provenance aggregation', () => {
  it('treats an absent sidecar as an explicit estimated fallback', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-provenance-'));
    tempDirs.push(dir);
    expect(
      loadOptionalExecutionProvenance(path.join(dir, 'missing.json')),
    ).toBe(undefined);
    expect(
      resolveUsage({estimatedInputTokens: 30, estimatedOutputTokens: 20}),
    ).toEqual({
      inputTokens: 30,
      outputTokens: 20,
      source: 'estimate',
      quality: 'estimated',
      complete: false,
    });
  });

  it('fails on malformed present sidecars instead of ignoring them', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-provenance-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'prompt.provenance.json');
    fs.writeFileSync(file, '{not-json');
    expect(() => loadOptionalExecutionProvenance(file)).toThrow(
      'Invalid execution provenance in prompt.provenance.json',
    );
  });

  it('prefers sidecar duration and usage over legacy estimates', () => {
    const provenance = {
      schemaVersion: 1 as const,
      execution: {durationMs: 42},
      usage: {
        inputTokens: 7,
        outputTokens: 3,
        source: '/home/example/private-usage.json',
        complete: true,
      },
    };
    expect(
      resolveDuration({
        provenance,
        legacyStartedAt: '2026-08-25T10:00:00.000Z',
        legacyFinishedAt: '2026-08-25T10:00:10.000Z',
      }),
    ).toEqual({valueMs: 42, source: 'provenance', quality: 'measured'});
    expect(
      resolveUsage({
        provenance,
        estimatedInputTokens: 100,
        estimatedOutputTokens: 50,
      }),
    ).toEqual({
      inputTokens: 7,
      outputTokens: 3,
      source: 'runner-reported',
      quality: 'complete',
      complete: true,
    });
  });

  it('groups the same model across two harnesses without collapsing them', () => {
    const breakdown = buildExecutionBreakdown([
      run('a', 'harness-a', 'model-a'),
      run('b', 'harness-b', 'model-a'),
    ]);
    expect(breakdown.byHarnessModel.map(group => group.dimensions)).toEqual([
      {harness: 'harness-a', model: 'model-a'},
      {harness: 'harness-b', model: 'model-a'},
    ]);
  });

  it('groups the same harness across two models without collapsing them', () => {
    const breakdown = buildExecutionBreakdown([
      run('a', 'harness-a', 'model-a'),
      run('b', 'harness-a', 'model-b'),
    ]);
    expect(breakdown.byHarnessModel.map(group => group.dimensions)).toEqual([
      {harness: 'harness-a', model: 'model-a'},
      {harness: 'harness-a', model: 'model-b'},
    ]);
    expect(breakdown.runs[0]).toMatchObject({
      harness: 'harness-a',
      model: 'model-a',
    });
  });

  it('groups fixture and condition when present', () => {
    const first = run('a', 'harness-a', 'model-a');
    first.fixture = 'fixture-a';
    first.condition = 'adoption';
    const breakdown = buildExecutionBreakdown([first]);
    expect(breakdown.byFixture[0]?.dimensions).toEqual({fixture: 'fixture-a'});
    expect(breakdown.byCondition[0]?.dimensions).toEqual({
      condition: 'adoption',
    });
  });

  it('filters by executor, fixture, and condition labels', () => {
    const provenance = {
      schemaVersion: 1 as const,
      executor: {harness: 'harness-a', model: 'model-a'},
      fixture: {id: 'fixture-a'},
      condition: 'setup',
    };
    expect(
      matchesExecutionFilter(provenance, {
        harness: 'harness-a',
        model: 'model-a',
        fixture: 'fixture-a',
        condition: 'setup',
      }),
    ).toBe(true);
    expect(matchesExecutionFilter(provenance, {model: 'model-b'})).toBe(false);
    expect(matchesExecutionFilter(undefined, {harness: 'unknown'})).toBe(true);
    expect(matchesExecutionFilter(undefined, {model: 'unknown'})).toBe(true);
  });

  it('does not report incomplete usage as comparable totals', () => {
    expect(
      resolveUsage({
        provenance: {
          schemaVersion: 1,
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            source: 'runner',
            complete: false,
          },
        },
        estimatedInputTokens: 100,
        estimatedOutputTokens: 50,
      }),
    ).toMatchObject({quality: 'incomplete', complete: false});

    const breakdown = buildExecutionBreakdown([
      run('a', 'harness-a', 'model-a', true),
      run('b', 'harness-a', 'model-a', false),
    ]);
    expect(breakdown.byHarnessModel[0]?.usage).toEqual({
      complete: false,
      completeRuns: 1,
      incompleteRuns: 1,
      inputTokens: null,
      outputTokens: null,
    });
  });
});
