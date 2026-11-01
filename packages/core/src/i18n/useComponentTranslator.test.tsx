// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useComponentTranslator.test.tsx
 * @input Uses vitest, @testing-library/react, useComponentTranslator, the
 *   i18n provider and two English namespace slices
 * @output Verifies a component's translator resolves its own slice, the
 *   provider's catalog and overrides ahead of it, nothing outside it, and
 *   stays stable across renders
 * @position Testing; validates useComponentTranslator.ts. Resolution order
 *   itself is covered by resolve.test.ts.
 */

import {use} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useComponentTranslator} from './useComponentTranslator';
import {useTranslator} from './useTranslator';
import {InternationalizationContext} from './InternationalizationContext';
import {InternationalizationProvider} from './InternationalizationProvider';
import {__resetForTests} from './resolve';
import enCatalog from './generated-locales/en.generated';
import buttonMessages from './generated-locales/en/button.generated';
import paginationMessages from './generated-locales/en/pagination.generated';
import enSource from '../../locales/en.json';
import type {MessagesByLocale, Overrides} from './types';

const FR_MESSAGES: MessagesByLocale = {
  fr: {'@astryx.button.loading': {defaultMessage: 'Chargement'}},
};
const FR_OVERRIDES: Overrides = {
  fr: {'@astryx.button.loading': 'Patientez'},
};

beforeEach(() => {
  __resetForTests();
});

describe('useComponentTranslator', () => {
  it("resolves the component's own keys from its slice with no provider", () => {
    const {result} = renderHook(() => useComponentTranslator(buttonMessages));
    expect(result.current('@astryx.button.loading')).toBe('Loading');
  });

  it('formats ICU values from the slice', () => {
    const {result} = renderHook(() =>
      useComponentTranslator(paginationMessages),
    );
    expect(
      result.current('@astryx.pagination.pageAnnounce', {current: 3}),
    ).toContain('3');
  });

  it("returns a key outside the slice as the key, and warns once: the slice is the component's whole English", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {result} = renderHook(() => useComponentTranslator(buttonMessages));
    expect(result.current('@astryx.pagination.next')).toBe(
      '@astryx.pagination.next',
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing key'));
    warn.mockRestore();
  });

  it("lets the provider's catalog beat the slice", () => {
    const {result} = renderHook(() => useComponentTranslator(buttonMessages), {
      wrapper: ({children}) => (
        <InternationalizationProvider locale="fr" messages={FR_MESSAGES}>
          {children}
        </InternationalizationProvider>
      ),
    });
    expect(result.current('@astryx.button.loading')).toBe('Chargement');
  });

  it("lets a provider override beat the provider's catalog and the slice", () => {
    const {result} = renderHook(() => useComponentTranslator(buttonMessages), {
      wrapper: ({children}) => (
        <InternationalizationProvider
          locale="fr"
          messages={FR_MESSAGES}
          overrides={FR_OVERRIDES}>
          {children}
        </InternationalizationProvider>
      ),
    });
    expect(result.current('@astryx.button.loading')).toBe('Patientez');
  });

  it('hands back the same function across renders while the slice and provider hold', () => {
    const {result, rerender} = renderHook(() =>
      useComponentTranslator(buttonMessages),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('useTranslator with no argument still resolves every shipped key', () => {
    const {result} = renderHook(() => useTranslator());
    expect(result.current('@astryx.button.loading')).toBe('Loading');
    expect(result.current('@astryx.pagination.next')).toBe('Go to next page');
  });
});

describe('the whole English catalog', () => {
  it('carries every authored key and message, and agrees with the slices', () => {
    const authored = Object.keys(enSource).sort();
    expect(Object.keys(enCatalog).sort()).toEqual(authored);
    for (const key of authored) {
      expect(enCatalog[key]).toBe(
        (enSource as Record<string, {defaultMessage: string}>)[key]
          .defaultMessage,
      );
    }
    expect(enCatalog['@astryx.button.loading']).toBe(
      buttonMessages['@astryx.button.loading'],
    );
  });
});

describe('the public InternationalizationContext boundary', () => {
  it('its translate falls back to the whole shipped English catalog with no provider, as it always has', () => {
    const {result} = renderHook(() => use(InternationalizationContext));
    expect(result.current.locale).toBe('en');
    expect(result.current.translate('@astryx.pagination.next', undefined)).toBe(
      'Go to next page',
    );
    expect(result.current.translate('@astryx.button.loading')).toBe('Loading');
  });

  it('its translate falls back to English under a provider whose catalog lacks the key', () => {
    const {result} = renderHook(() => use(InternationalizationContext), {
      wrapper: ({children}) => (
        <InternationalizationProvider locale="fr" messages={FR_MESSAGES}>
          {children}
        </InternationalizationProvider>
      ),
    });
    expect(result.current.locale).toBe('fr');
    expect(result.current.translate('@astryx.button.loading')).toBe(
      'Chargement',
    );
    expect(result.current.translate('@astryx.pagination.next')).toBe(
      'Go to next page',
    );
  });
});
