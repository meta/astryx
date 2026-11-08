// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file numberInputCommit.test.ts
 * @input Uses Vitest and the NumberInput draft commit policy
 * @output Focused tests for commit, clear, clamp, and revert decisions
 * @position Testing; validates numberInputCommit.ts independently of React
 */

import {describe, expect, it} from 'vitest';
import {parseNumberInput, resolveNumberInputCommit} from './numberInputCommit';

describe('parseNumberInput', () => {
  it('validates the complete localized draft', () => {
    expect(parseNumberInput('1.234.567', {locale: 'de-DE'})).toBe(1234567);
    expect(parseNumberInput('1·234·567', {locale: 'de-DE'})).toBeNull();
  });
});

describe('resolveNumberInputCommit', () => {
  it('commits one valid localized draft', () => {
    expect(
      resolveNumberInputCommit('1.234.567', {
        locale: 'de-DE',
        hasClear: false,
      }),
    ).toEqual({
      type: 'commit',
      value: 1234567,
      didClamp: false,
    });
  });

  it('reverts the whole draft when parsing fails', () => {
    expect(
      resolveNumberInputCommit('1·234·567', {
        locale: 'en-US',
        hasClear: false,
      }),
    ).toEqual({type: 'revert'});
  });

  it('clamps an out-of-range draft and requests normalization', () => {
    expect(
      resolveNumberInputCommit('100', {
        min: 1,
        max: 2,
        isIntegerOnly: true,
        hasClear: false,
      }),
    ).toEqual({type: 'commit', value: 2, didClamp: true});
  });

  it('distinguishes a clearable empty draft from a revert', () => {
    expect(resolveNumberInputCommit('', {hasClear: true})).toEqual({
      type: 'clear',
    });
    expect(resolveNumberInputCommit('', {hasClear: false})).toEqual({
      type: 'revert',
    });
  });

  it('reverts when no value can satisfy the bounds', () => {
    expect(
      resolveNumberInputCommit('10', {
        min: 5,
        max: 2,
        hasClear: false,
      }),
    ).toEqual({type: 'revert'});
  });
});
