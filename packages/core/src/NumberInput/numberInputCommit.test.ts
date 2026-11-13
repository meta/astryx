// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file numberInputCommit.test.ts
 * @input Uses Vitest and the NumberInput draft commit policy
 * @output Focused tests for commit, clear, clamp, and revert decisions, and
 *   for the rejection of a draft that cannot commit
 * @position Testing; validates numberInputCommit.ts independently of React
 */

import {describe, expect, it} from 'vitest';
import {
  getNumberInputRejection,
  parseNumberInput,
  resolveNumberInputCommit,
} from './numberInputCommit';

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

describe('getNumberInputRejection', () => {
  it('rejects text that is not a number for the locale', () => {
    expect(getNumberInputRejection('1a', {})).toEqual({kind: 'unreadable'});
    expect(getNumberInputRejection('-', {})).toEqual({kind: 'unreadable'});
    expect(getNumberInputRejection('1·234·567', {locale: 'en-US'})).toEqual({
      kind: 'unreadable',
    });
  });

  it('rejects a fraction in an integer-only field, with its number', () => {
    expect(
      getNumberInputRejection('2,5', {isIntegerOnly: true, locale: 'de-DE'}),
    ).toEqual({kind: 'fractional', value: 2.5});
  });

  it('rejects any number when no number fits the range', () => {
    expect(getNumberInputRejection('5', {min: 10, max: 1})).toEqual({
      kind: 'outOfRange',
      value: 5,
    });
    // Integer-only bounds round inward, so 1.5 to 1.9 holds no integer.
    expect(
      getNumberInputRejection('1', {min: 1.5, max: 1.9, isIntegerOnly: true}),
    ).toEqual({kind: 'outOfRange', value: 1});
  });

  it('accepts an empty draft and a number past an ordinary bound', () => {
    expect(getNumberInputRejection('  ', {min: 1, max: 2})).toBeNull();
    expect(getNumberInputRejection('150', {min: 1, max: 100})).toBeNull();
    expect(getNumberInputRejection('-3', {min: 1, max: 100})).toBeNull();
  });
});
