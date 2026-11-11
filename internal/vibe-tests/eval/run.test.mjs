// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseOptions} from './run.mjs';

describe('parseOptions', () => {
  it('reads self-test options and lists', () => {
    const options = parseOptions(['--self-test', '--tasks', 'a, b', '--arms', 'astryx-vite']);
    expect(options).toMatchObject({selfTest: true, taskSet: 'pilot', taskIds: ['a', 'b'], arms: ['astryx-vite']});
  });

  it('refuses to run with nothing to do', () => {
    expect(() => parseOptions([])).toThrow(/nothing to do/);
  });
});
