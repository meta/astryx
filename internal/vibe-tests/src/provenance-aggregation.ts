// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Provenance-aware fallback and grouping helpers for universal aggregation.
 * @position internal/vibe-tests/src/provenance-aggregation.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DurationMetric,
  ExecutionBreakdown,
  ExecutionGroupSummary,
  ExecutionProvenanceFilter,
  TokenMetric,
  UniversalDimension,
  UniversalRunSummary,
  UniversalScore,
} from './types.js';
import {
  parseExecutionProvenanceV1,
  type ExecutionProvenanceV1,
} from './provenance.js';
// @ts-expect-error -- public-artifact.mjs intentionally has no declaration output.
import {publicSourceLabel} from './public-artifact.mjs';

export function loadOptionalExecutionProvenance(
  filePath: string,
): ExecutionProvenanceV1 | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(
      `Invalid execution provenance in ${path.basename(filePath)}: ${String(error)}`,
      {cause: error},
    );
  }

  try {
    return parseExecutionProvenanceV1(value);
  } catch (error) {
    throw new Error(
      `Invalid execution provenance in ${path.basename(filePath)}: ${String(error)}`,
      {cause: error},
    );
  }
}

export function matchesExecutionFilter(
  provenance: ExecutionProvenanceV1 | undefined,
  filter: ExecutionProvenanceFilter,
): boolean {
  const harness = provenance?.executor?.harness ?? 'unknown';
  const model = provenance?.executor?.model ?? 'unknown';
  return (
    (!filter.harness || harness === filter.harness) &&
    (!filter.model || model === filter.model) &&
    (!filter.fixture || provenance?.fixture?.id === filter.fixture) &&
    (!filter.condition || provenance?.condition === filter.condition)
  );
}

export function resolveDuration(options: {
  provenance?: ExecutionProvenanceV1;
  legacyStartedAt?: string;
  legacyFinishedAt?: string;
  taskMtimeMs?: number;
  resultMtimeMs?: number;
}): DurationMetric {
  const explicit = options.provenance?.execution?.durationMs;
  if (explicit !== undefined) {
    return {valueMs: explicit, source: 'provenance', quality: 'measured'};
  }

  const provenanceStartedAt = options.provenance?.execution?.startedAt;
  const provenanceFinishedAt = options.provenance?.execution?.finishedAt;
  if (provenanceStartedAt && provenanceFinishedAt) {
    const valueMs =
      new Date(provenanceFinishedAt).getTime() -
      new Date(provenanceStartedAt).getTime();
    if (valueMs >= 0) {
      return {valueMs, source: 'provenance-timestamps', quality: 'derived'};
    }
  }

  if (options.legacyStartedAt && options.legacyFinishedAt) {
    const valueMs =
      new Date(options.legacyFinishedAt).getTime() -
      new Date(options.legacyStartedAt).getTime();
    if (Number.isFinite(valueMs) && valueMs >= 0) {
      return {valueMs, source: 'result-metadata', quality: 'derived'};
    }
  }

  if (
    options.taskMtimeMs !== undefined &&
    options.resultMtimeMs !== undefined &&
    options.resultMtimeMs >= options.taskMtimeMs
  ) {
    return {
      valueMs: Math.round(options.resultMtimeMs - options.taskMtimeMs),
      source: 'filesystem',
      quality: 'estimated',
    };
  }

  return {valueMs: null, source: 'unavailable', quality: 'unavailable'};
}

export function resolveUsage(options: {
  provenance?: ExecutionProvenanceV1;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}): TokenMetric {
  const usage = options.provenance?.usage;
  if (usage) {
    return {
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      source: publicSourceLabel(usage.source),
      quality: usage.complete ? 'complete' : 'incomplete',
      complete: usage.complete,
    };
  }

  return {
    inputTokens: options.estimatedInputTokens,
    outputTokens: options.estimatedOutputTokens,
    source: 'estimate',
    quality: 'estimated',
    complete: false,
  };
}

function averageScore(score: UniversalScore): number {
  const dimensions: UniversalDimension[] = [
    'correctness',
    'accessibility',
    'codeQuality',
    'efficiency',
    'maintainability',
    'design',
  ];
  const values = dimensions
    .map(dimension => score[dimension]?.score)
    .filter((value): value is number => value !== undefined);
  return values.length === 0
    ? 0
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function summarizeGroup(
  dimensions: ExecutionGroupSummary['dimensions'],
  runs: UniversalRunSummary[],
): ExecutionGroupSummary {
  const durationValues = runs
    .map(run => run.duration.valueMs)
    .filter((value): value is number => value !== null);
  const completeUsageRuns = runs.filter(run => run.usage.complete).length;
  const usageComplete = completeUsageRuns === runs.length;
  return {
    dimensions,
    runCount: runs.length,
    averageScore: Math.round(
      runs.reduce((sum, run) => sum + averageScore(run.score), 0) / runs.length,
    ),
    averageDurationMs:
      durationValues.length > 0
        ? Math.round(
            durationValues.reduce((sum, value) => sum + value, 0) /
              durationValues.length,
          )
        : null,
    usage: {
      complete: usageComplete,
      completeRuns: completeUsageRuns,
      incompleteRuns: runs.length - completeUsageRuns,
      inputTokens: usageComplete
        ? runs.reduce((sum, run) => sum + (run.usage.inputTokens ?? 0), 0)
        : null,
      outputTokens: usageComplete
        ? runs.reduce((sum, run) => sum + (run.usage.outputTokens ?? 0), 0)
        : null,
    },
  };
}

function groupRuns(
  runs: UniversalRunSummary[],
  dimensionsFor: (
    run: UniversalRunSummary,
  ) => ExecutionGroupSummary['dimensions'] | undefined,
): ExecutionGroupSummary[] {
  const groups = new Map<
    string,
    {
      dimensions: ExecutionGroupSummary['dimensions'];
      runs: UniversalRunSummary[];
    }
  >();
  for (const run of runs) {
    const dimensions = dimensionsFor(run);
    if (!dimensions) {
      continue;
    }
    const key = JSON.stringify(dimensions);
    const existing = groups.get(key);
    if (existing) {
      existing.runs.push(run);
    } else {
      groups.set(key, {dimensions, runs: [run]});
    }
  }
  return [...groups.values()]
    .map(group => summarizeGroup(group.dimensions, group.runs))
    .sort((a, b) =>
      JSON.stringify(a.dimensions).localeCompare(JSON.stringify(b.dimensions)),
    );
}

export function buildExecutionBreakdown(
  runs: UniversalRunSummary[],
): ExecutionBreakdown {
  return {
    runs,
    byHarnessModel: groupRuns(runs, run => ({
      harness: run.harness,
      model: run.model,
    })),
    byFixture: groupRuns(runs, run =>
      run.fixture ? {fixture: run.fixture} : undefined,
    ),
    byCondition: groupRuns(runs, run =>
      run.condition ? {condition: run.condition} : undefined,
    ),
  };
}
