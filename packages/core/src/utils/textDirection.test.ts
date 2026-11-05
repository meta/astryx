// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textDirection.test.ts
 * @input Uses vitest, textDirectionProps
 * @output Unit tests for the plain-text direction rule
 * @position Testing; validates utils/textDirection.ts
 */

import {describe, it, expect} from 'vitest';
import {textDirectionProps} from './textDirection';

describe('textDirectionProps', () => {
  it('lays out plain text with no right-to-left letter left to right', () => {
    for (const text of [
      'https://',
      '.com',
      '+3',
      '@alice',
      'C++',
      '#design',
      'Inbox',
      '',
    ]) {
      expect(textDirectionProps(text), text).toEqual({dir: 'ltr'});
    }
    expect(textDirectionProps(42)).toEqual({dir: 'ltr'});
  });

  it('leaves text with a right-to-left letter in the page direction', () => {
    for (const text of [
      'iPhone \u062c\u062f\u064a\u062f',
      'example.com \u0645\u0648\u0642\u0639',
      '\u05e9\u05dc\u05d5\u05dd',
      '\u0710\u0712',
      '\u0780\u0781',
      '\u07ca\u07cb',
      '\ufb50',
      // Samaritan and Adlam (a supplementary-plane script).
      '\u0800\u0801',
      '\u{1E900}\u{1E923}\u{1E924}!',
    ]) {
      expect(textDirectionProps(text), text).toEqual({});
    }
  });

  it('leaves a rich node to its caller', () => {
    expect(textDirectionProps(null)).toEqual({});
    expect(textDirectionProps(undefined)).toEqual({});
    expect(textDirectionProps(['a', 'b'])).toEqual({});
  });
});
