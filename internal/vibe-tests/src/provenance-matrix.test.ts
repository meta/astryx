// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {expandExecutionMatrix} from './provenance-matrix';

describe('expandExecutionMatrix', () => {
  it('enumerates executor, condition, and repetition dimensions generically', () => {
    expect(
      expandExecutionMatrix({
        harnesses: ['harness-a', 'harness-b'],
        models: ['model-a'],
        efforts: ['standard'],
        conditions: ['setup', 'adoption'],
        reps: 2,
      }),
    ).toHaveLength(8);
  });
});
