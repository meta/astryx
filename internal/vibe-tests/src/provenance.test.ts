// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  ExecutionProvenanceValidationError,
  parseExecutionProvenanceV1,
  provenanceFilename,
} from './provenance';

const SHA = 'a'.repeat(64);

describe('ExecutionProvenanceV1', () => {
  it('parses a full sidecar and preserves unknown fields', () => {
    const value = parseExecutionProvenanceV1({
      schemaVersion: 1,
      task: {id: 'prompt-a', sha256: SHA, futureTaskField: true},
      fixture: {id: 'fixture-a', sha256: SHA, commit: 'abc123'},
      condition: 'setup',
      rep: 2,
      executor: {
        harness: 'shell-runner',
        model: 'model-a',
        effort: 'high',
        harnessVersion: '1.2.3',
        runnerVersion: '4.5.6',
        futureExecutorField: 'kept',
      },
      execution: {
        status: 'succeeded',
        startedAt: '2026-08-25T10:00:00.000Z',
        finishedAt: '2026-08-25T10:00:05.000Z',
        durationMs: 5000,
        attempt: 2,
        retry: 1,
      },
      usage: {
        inputTokens: 120,
        outputTokens: 45,
        source: 'runner',
        complete: true,
      },
      environmentHash: SHA,
      toolPolicyHash: SHA,
      futureTopLevelField: {enabled: true},
    });

    expect(value.executor?.harness).toBe('shell-runner');
    expect(value.futureTopLevelField).toEqual({enabled: true});
    expect(value.executor?.futureExecutorField).toBe('kept');
  });

  it('accepts a partial sidecar and canonicalizes its filename', () => {
    expect(parseExecutionProvenanceV1({schemaVersion: 1})).toEqual({
      schemaVersion: 1,
    });
    expect(provenanceFilename('prompt-a')).toBe('prompt-a.provenance.json');
  });

  it('rejects malformed present fields', () => {
    expect(() =>
      parseExecutionProvenanceV1({schemaVersion: 1, rep: 0}),
    ).toThrow(ExecutionProvenanceValidationError);
    expect(() =>
      parseExecutionProvenanceV1({
        schemaVersion: 1,
        execution: {startedAt: '2026-08-25'},
      }),
    ).toThrow('must be a valid date-time string');
    expect(() =>
      parseExecutionProvenanceV1({
        schemaVersion: 1,
        usage: {complete: true, inputTokens: 1},
      }),
    ).toThrow('complete usage requires both inputTokens and outputTokens');
  });

  it('rejects unknown schema versions clearly', () => {
    expect(() => parseExecutionProvenanceV1({schemaVersion: 2})).toThrow(
      'unsupported provenance schema version 2; expected 1',
    );
  });
});
