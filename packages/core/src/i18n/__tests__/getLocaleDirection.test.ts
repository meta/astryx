// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getLocaleDirection.test.ts
 * @input packages/core/src/i18n/getLocaleDirection.ts
 * @output Unit tests for the server-safe locale → direction helper
 * @position Colocated tests; targets LTR/RTL classification and the
 *   try/catch fallback for malformed input.
 */

import {afterEach, describe, expect, test} from 'vitest';
import {getLocaleDirection} from '../getLocaleDirection';

describe('getLocaleDirection', () => {
  test('returns ltr for English', () => {
    expect(getLocaleDirection('en')).toBe('ltr');
  });

  test('returns rtl for RTL languages', () => {
    expect(getLocaleDirection('ar')).toBe('rtl');
    expect(getLocaleDirection('he')).toBe('rtl');
    expect(getLocaleDirection('fa')).toBe('rtl');
    expect(getLocaleDirection('ur')).toBe('rtl');
  });

  test('returns ltr for regional LTR tags', () => {
    expect(getLocaleDirection('pt-BR')).toBe('ltr');
    expect(getLocaleDirection('zh-CN')).toBe('ltr');
  });

  test('falls back to ltr for a malformed locale without throwing', () => {
    expect(() => getLocaleDirection('not_a_locale')).not.toThrow();
    expect(getLocaleDirection('not_a_locale')).toBe('ltr');
  });

  test('falls back to ltr for an empty string without throwing', () => {
    expect(() => getLocaleDirection('')).not.toThrow();
    expect(getLocaleDirection('')).toBe('ltr');
  });
});

describe('getLocaleDirection without Intl.Locale text info', () => {
  // Firefox has neither getTextInfo() nor textInfo.
  const prototype = Intl.Locale.prototype as unknown as Record<string, unknown>;
  const saved = ['getTextInfo', 'textInfo'].map(
    name => [name, Object.getOwnPropertyDescriptor(prototype, name)] as const,
  );
  const removeTextInfo = () => {
    for (const [name] of saved) {
      Reflect.deleteProperty(prototype, name);
    }
  };
  afterEach(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor != null) {
        Object.defineProperty(prototype, name, descriptor);
      }
    }
  });

  test('reads right-to-left locales from their likely script', () => {
    removeTextInfo();
    expect(getLocaleDirection('ar-EG')).toBe('rtl');
    expect(getLocaleDirection('he')).toBe('rtl');
    expect(getLocaleDirection('fa')).toBe('rtl');
    expect(getLocaleDirection('ur')).toBe('rtl');
    expect(getLocaleDirection('hu-Hung')).toBe('rtl');
  });

  test('reads left-to-right locales from their likely script', () => {
    removeTextInfo();
    expect(getLocaleDirection('en-US')).toBe('ltr');
    expect(getLocaleDirection('zh-CN')).toBe('ltr');
    expect(getLocaleDirection('not_a_locale')).toBe('ltr');
  });
});
