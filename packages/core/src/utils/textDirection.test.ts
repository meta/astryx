// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textDirection.test.ts
 * @input Uses vitest, textDirectionProps
 * @output Unit tests for the plain-text direction rule
 * @position Testing; validates utils/textDirection.ts
 */

import {describe, it, expect} from 'vitest';
import {createElement, isValidElement} from 'react';
import {textDirectionProps, withTextDirection} from './textDirection';

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

  it('reads an invisible leading character as no right-to-left letter', () => {
    expect(textDirectionProps('\uFEFF+3')).toEqual({dir: 'ltr'});
    expect(textDirectionProps('\uFEFFhttps://')).toEqual({dir: 'ltr'});
    expect(textDirectionProps('\uFEFF\u05E9\u05DC\u05D5\u05DD')).toEqual({});
  });

  it('agrees with the shared classifier on the right-to-left mark and Arabic letter mark', () => {
    expect(textDirectionProps('\u200F+3')).toEqual({});
    expect(textDirectionProps('\u061C+3')).toEqual({});
  });

  it('leaves a rich node to its caller', () => {
    expect(textDirectionProps(null)).toEqual({});
    expect(textDirectionProps(undefined)).toEqual({});
    expect(textDirectionProps(['a', 'b'])).toEqual({});
  });
});

describe('withTextDirection', () => {
  it('puts plain left-to-right text in a dir="ltr" span', () => {
    const node = withTextDirection('https://');
    expect(isValidElement(node)).toBe(true);
    expect(node).toMatchObject({
      type: 'span',
      props: {dir: 'ltr', children: 'https://'},
    });
  });

  it('returns text with a right-to-left letter, an empty string and a rich node as they are', () => {
    expect(withTextDirection('\u05e9\u05dc\u05d5\u05dd')).toBe(
      '\u05e9\u05dc\u05d5\u05dd',
    );
    expect(withTextDirection('')).toBe('');
    const rich = createElement('b', null, 'bold');
    expect(withTextDirection(rich)).toBe(rich);
  });
});
