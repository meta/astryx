// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Generic matrix expansion for provenance-aware vibe-test runners.
 * @position internal/vibe-tests/src/provenance-matrix.ts
 */

export interface ExecutionMatrixConfig {
  harnesses: readonly string[];
  models: readonly string[];
  efforts?: readonly string[];
  conditions?: readonly string[];
  reps?: number;
}

export interface ExecutionMatrixEntry {
  harness: string;
  model: string;
  effort?: string;
  condition?: string;
  rep: number;
}

export function expandExecutionMatrix(
  config: ExecutionMatrixConfig,
): ExecutionMatrixEntry[] {
  if (config.harnesses.length === 0 || config.models.length === 0) {
    throw new Error(
      'Execution matrices require at least one harness and model',
    );
  }
  const efforts = config.efforts?.length ? config.efforts : [undefined];
  const conditions = config.conditions?.length
    ? config.conditions
    : [undefined];
  const reps = config.reps ?? 1;
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error('Execution matrix reps must be a positive integer');
  }

  const entries: ExecutionMatrixEntry[] = [];
  for (const harness of config.harnesses) {
    for (const model of config.models) {
      for (const effort of efforts) {
        for (const condition of conditions) {
          for (let rep = 1; rep <= reps; rep++) {
            entries.push({
              harness,
              model,
              ...(effort ? {effort} : {}),
              ...(condition ? {condition} : {}),
              rep,
            });
          }
        }
      }
    }
  }
  return entries;
}
