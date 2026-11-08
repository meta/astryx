// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Versioned, executor-neutral provenance contract for vibe-test results.
 * @position internal/vibe-tests/src/provenance.ts
 */

export interface ExecutionProvenanceTaskV1 {
  id: string;
  sha256: string;
  [key: string]: unknown;
}

export interface ExecutionProvenanceFixtureV1 {
  id: string;
  sha256?: string;
  commit?: string;
  [key: string]: unknown;
}

export interface ExecutionProvenanceExecutorV1 {
  harness: string;
  model: string;
  effort?: string;
  harnessVersion?: string;
  runnerVersion?: string;
  [key: string]: unknown;
}

export interface ExecutionProvenanceExecutionV1 {
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  attempt?: number;
  retry?: number;
  [key: string]: unknown;
}

export interface ExecutionProvenanceUsageV1 {
  inputTokens?: number;
  outputTokens?: number;
  source?: string;
  complete: boolean;
  [key: string]: unknown;
}

export interface ExecutionProvenanceV1 {
  schemaVersion: 1;
  task?: ExecutionProvenanceTaskV1;
  fixture?: ExecutionProvenanceFixtureV1;
  condition?: string;
  rep?: number;
  executor?: ExecutionProvenanceExecutorV1;
  execution?: ExecutionProvenanceExecutionV1;
  usage?: ExecutionProvenanceUsageV1;
  environmentHash?: string;
  toolPolicyHash?: string;
  [key: string]: unknown;
}

export class ExecutionProvenanceValidationError extends Error {
  constructor(
    message: string,
    readonly field = '$',
  ) {
    super(`${field}: ${message}`);
    this.name = 'ExecutionProvenanceValidationError';
  }
}

const SHA256 = /^[a-fA-F0-9]{64}$/;
const RFC3339_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

function fail(field: string, message: string): never {
  throw new ExecutionProvenanceValidationError(message, field);
}

function objectAt(value: unknown, field: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    fail(field, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function optionalString(
  object: Record<string, unknown>,
  key: string,
  field: string,
): void {
  const value = object[key];
  if (
    value !== undefined &&
    (typeof value !== 'string' || value.length === 0)
  ) {
    fail(`${field}.${key}`, 'must be a non-empty string');
  }
}

function requiredString(
  object: Record<string, unknown>,
  key: string,
  field: string,
): void {
  optionalString(object, key, field);
  if (object[key] === undefined) {
    fail(`${field}.${key}`, 'is required');
  }
}

function optionalInteger(
  object: Record<string, unknown>,
  key: string,
  field: string,
  minimum: number,
): void {
  const value = object[key];
  if (
    value !== undefined &&
    (typeof value !== 'number' || !Number.isInteger(value) || value < minimum)
  ) {
    fail(
      `${field}.${key}`,
      `must be an integer greater than or equal to ${minimum}`,
    );
  }
}

function optionalNumber(
  object: Record<string, unknown>,
  key: string,
  field: string,
): void {
  const value = object[key];
  if (
    value !== undefined &&
    (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
  ) {
    fail(`${field}.${key}`, 'must be a non-negative finite number');
  }
}

function optionalSha256(
  object: Record<string, unknown>,
  key: string,
  field: string,
): void {
  const value = object[key];
  if (
    value !== undefined &&
    (typeof value !== 'string' || !SHA256.test(value))
  ) {
    fail(
      `${field}.${key}`,
      'must be a 64-character hexadecimal SHA-256 digest',
    );
  }
}

function optionalDateTime(
  object: Record<string, unknown>,
  key: string,
  field: string,
): void {
  const value = object[key];
  if (
    value !== undefined &&
    (typeof value !== 'string' ||
      !RFC3339_DATE_TIME.test(value) ||
      Number.isNaN(Date.parse(value)))
  ) {
    fail(`${field}.${key}`, 'must be a valid date-time string');
  }
}

export function parseExecutionProvenanceV1(
  input: unknown,
): ExecutionProvenanceV1 {
  const value = objectAt(input, '$');
  if (value.schemaVersion !== 1) {
    if (value.schemaVersion === undefined) {
      fail('$.schemaVersion', 'is required');
    }
    fail(
      '$.schemaVersion',
      `unsupported provenance schema version ${String(value.schemaVersion)}; expected 1`,
    );
  }

  if (value.task !== undefined) {
    const task = objectAt(value.task, '$.task');
    requiredString(task, 'id', '$.task');
    requiredString(task, 'sha256', '$.task');
    optionalSha256(task, 'sha256', '$.task');
  }

  if (value.fixture !== undefined) {
    const fixture = objectAt(value.fixture, '$.fixture');
    requiredString(fixture, 'id', '$.fixture');
    optionalSha256(fixture, 'sha256', '$.fixture');
    optionalString(fixture, 'commit', '$.fixture');
  }

  optionalString(value, 'condition', '$');
  optionalInteger(value, 'rep', '$', 1);

  if (value.executor !== undefined) {
    const executor = objectAt(value.executor, '$.executor');
    requiredString(executor, 'harness', '$.executor');
    requiredString(executor, 'model', '$.executor');
    optionalString(executor, 'effort', '$.executor');
    optionalString(executor, 'harnessVersion', '$.executor');
    optionalString(executor, 'runnerVersion', '$.executor');
  }

  if (value.execution !== undefined) {
    const execution = objectAt(value.execution, '$.execution');
    optionalString(execution, 'status', '$.execution');
    optionalDateTime(execution, 'startedAt', '$.execution');
    optionalDateTime(execution, 'finishedAt', '$.execution');
    optionalNumber(execution, 'durationMs', '$.execution');
    optionalInteger(execution, 'attempt', '$.execution', 1);
    optionalInteger(execution, 'retry', '$.execution', 0);
  }

  if (value.usage !== undefined) {
    const usage = objectAt(value.usage, '$.usage');
    optionalInteger(usage, 'inputTokens', '$.usage', 0);
    optionalInteger(usage, 'outputTokens', '$.usage', 0);
    optionalString(usage, 'source', '$.usage');
    if (typeof usage.complete !== 'boolean') {
      fail('$.usage.complete', 'must be a boolean');
    }
    if (
      usage.complete &&
      (usage.inputTokens === undefined || usage.outputTokens === undefined)
    ) {
      fail(
        '$.usage',
        'complete usage requires both inputTokens and outputTokens',
      );
    }
  }

  optionalSha256(value, 'environmentHash', '$');
  optionalSha256(value, 'toolPolicyHash', '$');
  return value as unknown as ExecutionProvenanceV1;
}

export function provenanceFilename(promptId: string): string {
  return `${promptId}.provenance.json`;
}
