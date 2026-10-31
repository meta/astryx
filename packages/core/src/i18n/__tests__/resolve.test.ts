// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolve.test.ts
 * @input packages/core/src/i18n/resolve.ts
 * @output Unit tests for the shared i18n lookup + format core
 * @position Colocated tests; targets locale-chain fallback, ICU formatting,
 *   overrides, and missing-key behavior.
 */

import {describe, expect, test, beforeEach, vi} from 'vitest';
import {__resetForTests, getResolve, resolveLocaleChain} from '../resolve';
import enCatalog from '../generated-locales/en.generated';
import paginationMessages from '../generated-locales/en/pagination.generated';
import type {
  Catalog,
  MessagesByLocale,
  Overrides,
  ProviderMessagesByLocale,
  RuntimeCatalog,
} from '../types';

// The English fallback is the caller's (a component's slice, or the whole
// catalog through useTranslator); these cases resolve against the whole
// catalog, as useTranslator does, unless a case passes its own.
const resolve = (
  key: string,
  values: Record<string, unknown> | undefined,
  locale: Parameters<typeof getResolve>[0],
  messages: Parameters<typeof getResolve>[1],
  overrides: Parameters<typeof getResolve>[2],
  fallback: RuntimeCatalog | undefined = enCatalog,
) => getResolve(locale, messages, overrides)(key, values, fallback);

// Reset caches between tests so warn-once and formatter cache don't bleed.
beforeEach(() => {
  __resetForTests();
});

describe('resolveLocaleChain', () => {
  test('single-part tag returns single-item chain', () => {
    expect(resolveLocaleChain('en')).toEqual(['en']);
  });

  test('regional tag walks to base language', () => {
    expect(resolveLocaleChain('pt-BR')).toEqual(['pt-BR', 'pt']);
  });

  test('script-tagged locale walks to script and then base', () => {
    expect(resolveLocaleChain('zh-Hans-CN')).toEqual([
      'zh-Hans-CN',
      'zh-Hans',
      'zh',
    ]);
  });

  test('canonicalizes casing via Intl.Locale', () => {
    // Consumers who pass "en-us" (lowercase region) should get the canonical
    // BCP 47 form back so lookups match spec-canonical catalog keys.
    expect(resolveLocaleChain('en-us')).toEqual(['en-US', 'en']);
    expect(resolveLocaleChain('PT-br')).toEqual(['pt-BR', 'pt']);
  });

  test('malformed input falls back to the raw string chain', () => {
    // Intl.Locale throws on invalid input; we don't want the whole render to
    // die because a consumer passed a bad tag.
    expect(resolveLocaleChain('not_a_locale')).toEqual(['not_a_locale']);
  });
});

describe('resolve — basic lookup', () => {
  test('falls back to the shipped en catalog when locale is en and no messages passed', () => {
    const out = resolve(
      '@astryx.pagination.next',
      undefined,
      'en',
      {},
      undefined,
    );
    expect(out).toBe('Go to next page');
  });

  test("resolves from a component's own namespace slice, and no further", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      resolve(
        '@astryx.pagination.next',
        undefined,
        'en',
        {},
        undefined,
        paginationMessages,
      ),
    ).toBe('Go to next page');
    // A key of another namespace is not in the slice: the key comes back and
    // the one-time warning fires, which is what check:i18n-catalog's
    // slice-coverage rule (landing with the component sweep) prevents.
    expect(
      resolve(
        '@astryx.button.loading',
        undefined,
        'en',
        {},
        undefined,
        paginationMessages,
      ),
    ).toBe('@astryx.button.loading');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing key'));
    warn.mockRestore();
  });

  test('carries no English catalog of its own: with no fallback the key comes back', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getResolve('en', {})('@astryx.pagination.next', undefined)).toBe(
      '@astryx.pagination.next',
    );
    warn.mockRestore();
  });

  test('returns the key itself and warns for unknown key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = resolve(
      '@astryx.does.not.exist',
      undefined,
      'en',
      {},
      undefined,
    );
    expect(out).toBe('@astryx.does.not.exist');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing key'));
    warn.mockRestore();
  });
});

describe('resolve — provider messages', () => {
  const catalog: Catalog = {
    '@astryx.pagination.next': {defaultMessage: 'Suivant'},
  };
  const messages: MessagesByLocale = {fr: catalog};

  test('uses provider messages for the current locale', () => {
    const out = resolve(
      '@astryx.pagination.next',
      undefined,
      'fr',
      messages,
      undefined,
    );
    expect(out).toBe('Suivant');
  });

  test('uses a generated runtime string map for the current locale', () => {
    const runtimeMessages: ProviderMessagesByLocale = {
      fr: {'@astryx.pagination.next': 'Suivant compact'},
    };
    const out = resolve(
      '@astryx.pagination.next',
      undefined,
      'fr',
      runtimeMessages,
      undefined,
    );
    expect(out).toBe('Suivant compact');
  });

  test('falls back to en for keys not in the provider catalog, silently', () => {
    // pagination.previous is only in en; fr catalog has only .next.
    // Missing translations for a locale are expected during rollout — the
    // fallback should be silent (matches i18next / FormatJS default). We
    // reserve console.warn for real bugs (key missing even from en).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = resolve(
      '@astryx.pagination.previous',
      undefined,
      'fr',
      messages,
      undefined,
    );
    expect(out).toBe('Go to previous page');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('resolve — locale-chain fallback (regional → language)', () => {
  const messages: MessagesByLocale = {
    'pt-BR': {
      '@astryx.pagination.next': {defaultMessage: 'Próxima (BR)'},
    },
    pt: {
      '@astryx.pagination.next': {defaultMessage: 'Próxima'},
      '@astryx.pagination.previous': {defaultMessage: 'Anterior'},
    },
  };

  test('exact regional match wins', () => {
    const out = resolve(
      '@astryx.pagination.next',
      undefined,
      'pt-BR',
      messages,
      undefined,
    );
    expect(out).toBe('Próxima (BR)');
  });

  test('falls back to base language when regional entry missing', () => {
    // pt-BR catalog has no .previous — should walk pt-BR → pt
    const out = resolve(
      '@astryx.pagination.previous',
      undefined,
      'pt-BR',
      messages,
      undefined,
    );
    expect(out).toBe('Anterior');
  });

  test('falls back to en when neither regional nor base has the key', () => {
    // pt-BR nor pt has .label — walk to en
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = resolve(
      '@astryx.pagination.label',
      undefined,
      'pt-BR',
      messages,
      undefined,
    );
    expect(out).toBe('Pagination');
    warn.mockRestore();
  });
});

describe('resolve — overrides', () => {
  test('per-locale override wins over shipped catalog', () => {
    const messages: MessagesByLocale = {
      fr: {'@astryx.pagination.next': {defaultMessage: 'Suivant'}},
    };
    const overrides: Overrides = {
      fr: {'@astryx.pagination.next': 'Suiv.'},
    };
    const out = resolve(
      '@astryx.pagination.next',
      undefined,
      'fr',
      messages,
      overrides,
    );
    expect(out).toBe('Suiv.');
  });

  test('overrides respect the locale chain (pt-BR → pt)', () => {
    // Override defined at pt level, current locale is pt-BR
    const overrides: Overrides = {
      pt: {'@astryx.pagination.next': 'Próxima (pt override)'},
    };
    const out = resolve(
      '@astryx.pagination.next',
      undefined,
      'pt-BR',
      {},
      overrides,
    );
    expect(out).toBe('Próxima (pt override)');
  });

  test('override for a different locale does not apply', () => {
    const overrides: Overrides = {
      es: {'@astryx.pagination.next': 'Siguiente'},
    };
    const out = resolve(
      '@astryx.pagination.next',
      undefined,
      'fr',
      {},
      overrides,
    );
    // Should fall through to en since fr has no messages and es override doesn't apply
    expect(out).toBe('Go to next page');
  });

  test('override `pt` should take precedence over message `pt-BR`', () => {
    const overrides: Overrides = {
      pt: {key: 'override'},
    };
    const messages: MessagesByLocale = {
      'pt-BR': {
        key: {
          defaultMessage: 'shipped',
        },
      },
    };
    const out = resolve('key', undefined, 'pt-BR', messages, overrides);
    expect(out).toBe('override');
  });
});

describe('resolve — ICU MessageFormat', () => {
  test('interpolates simple named placeholders', () => {
    const out = resolve(
      '@astryx.pagination.goToPage',
      {page: 5},
      'en',
      {},
      undefined,
    );
    expect(out).toContain('5');
    expect(out).toMatch(/Go to page/);
  });

  test('formats numbers using Intl.NumberFormat for the locale', () => {
    // Pagination.count uses {from, number}, {to, number}, {total, number}
    // In en-US, 1000 formats as "1,000"
    const out = resolve(
      '@astryx.pagination.count',
      {from: 1, to: 10, total: 1000},
      'en-US',
      {},
      undefined,
    );
    expect(out).toContain('1,000');
  });

  test('formats numbers for locales with different separators', () => {
    // In de-DE, 1000 formats as "1.000"
    const out = resolve(
      '@astryx.pagination.count',
      {from: 1, to: 10, total: 1000},
      'de-DE',
      {},
      undefined,
    );
    // We don't have a de catalog so falls back to en's PATTERN, but the
    // number formatting uses the locale passed to IntlMessageFormat.
    expect(out).toContain('1.000');
  });

  test('handles plural forms with ICU {n, plural, one {} other {}} pattern', () => {
    const catalog: Catalog = {
      'test.items': {
        defaultMessage:
          '{count, plural, =0 {no items} one {# item} other {# items}}',
      },
    };
    const messages = {en: catalog};

    expect(resolve('test.items', {count: 0}, 'en', messages, undefined)).toBe(
      'no items',
    );
    expect(resolve('test.items', {count: 1}, 'en', messages, undefined)).toBe(
      '1 item',
    );
    expect(resolve('test.items', {count: 5}, 'en', messages, undefined)).toBe(
      '5 items',
    );
  });
});

describe('resolve — warn-once behavior', () => {
  test('duplicate missing-key warnings are suppressed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolve('@astryx.does.not.exist', undefined, 'en', {}, undefined);
    resolve('@astryx.does.not.exist', undefined, 'en', {}, undefined);
    resolve('@astryx.does.not.exist', undefined, 'en', {}, undefined);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
