// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file The word mapping that runs stable theme suites against the copies. */

import {describe, expect, it} from 'vitest';
import {toExperimental, toStableText} from './experimental-theme-words.mjs';

describe('experimental theme words', () => {
  it('maps theme build to experimental theme compile, after global flags', () => {
    expect(toExperimental(['--json', 'theme', 'build', 'a.mjs'])).toEqual([
      '--json',
      'experimental',
      'theme',
      'compile',
      'a.mjs',
    ]);
    expect(toExperimental(['theme', 'palette', 'generate', 'x'])).toEqual([
      'experimental',
      'theme',
      'palette',
      'generate',
      'x',
    ]);
    expect(toExperimental(['component', 'Button'])).toEqual([
      'component',
      'Button',
    ]);
  });

  it('maps the output back to the stable words', () => {
    expect(toStableText('run astryx experimental theme compile x')).toBe(
      'run astryx theme build x',
    );
    expect(toStableText('astryx experimental theme list')).toBe(
      'astryx theme list',
    );
  });
});
