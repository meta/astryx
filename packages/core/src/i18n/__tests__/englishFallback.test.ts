// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file englishFallback.test.ts
 * @input The generated per-module English fallback maps, the generated locale
 *   catalogs, resolve.ts, and scripts/i18n-english-fallback.mjs
 * @output Resolution-parity and wiring tests for Core's per-module English
 * @position Proves a component resolves every key it names exactly as it did
 *   with the whole English catalog, in every shipped locale's fallback path.
 *
 * This file must not import the public `useTranslator` or the public context
 * export: both register the whole catalog, which would hide a missing map.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {describe, expect, it, beforeEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import {
  CORE_SRC_DIR,
  ENGLISH_FALLBACK_DIR,
  collectEnglishFallbackSlices,
  findWiringProblems,
  getSliceModuleName,
} from '../../../../../scripts/i18n-english-fallback.mjs';
import enCatalog from '../generated-locales/en.generated';
import {__resetForTests, getResolve} from '../resolve';
import {englishFallback} from '../englishFallback';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../useComponentTranslator';
import type {RuntimeCatalog} from '../types';

/** Load every generated module under `dir`, keyed by its path relative to `dir`. */
async function loadGenerated(
  dir: string,
): Promise<Record<string, RuntimeCatalog>> {
  const files = fs
    .readdirSync(dir, {recursive: true, encoding: 'utf8'})
    .filter(file => file.endsWith('.generated.ts'))
    .map(file => file.split(path.sep).join('/'));
  const entries = await Promise.all(
    files.map(async file => {
      const module = (await import(
        /* @vite-ignore */ pathToFileURL(path.join(dir, file)).href
      )) as {default: RuntimeCatalog};
      return [file, module.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}

const slices = await loadGenerated(ENGLISH_FALLBACK_DIR);

const localeCatalogs = Object.fromEntries(
  Object.entries(
    await loadGenerated(path.join(CORE_SRC_DIR, 'i18n', 'generated-locales')),
  ).map(([file, catalog]) => [file.slice(0, -'.generated.ts'.length), catalog]),
);

beforeEach(() => {
  __resetForTests();
});

describe('per-module English fallback', () => {
  it('derives one map per Core module that names catalog keys, holding exactly those keys', () => {
    const expected = collectEnglishFallbackSlices(enCatalog);
    expect(expected.size).toBeGreaterThan(0);
    expect(new Set(Object.keys(slices))).toEqual(
      new Set([...expected.keys()].map(getSliceModuleName)),
    );
    for (const [sourceRel, keys] of expected) {
      expect(
        new Set(Object.keys(slices[getSliceModuleName(sourceRel)])),
      ).toEqual(new Set(keys));
    }
  });

  it('wires every such module to import and register its own map', () => {
    expect(findWiringProblems(collectEnglishFallbackSlices(enCatalog))).toEqual(
      [],
    );
  });

  it('holds the same English as the whole catalog', () => {
    for (const slice of Object.values(slices)) {
      for (const [key, message] of Object.entries(slice)) {
        expect(message).toBe(enCatalog[key]);
      }
    }
  });

  it('resolves every key each module names exactly as the whole catalog does, in every shipped locale', () => {
    // The formatted result is a function of the resolved message and the
    // locale, so equal messages give equal output for any values.
    expect(Object.keys(localeCatalogs)).toContain('en');
    expect(Object.keys(localeCatalogs).length).toBeGreaterThan(2);
    let compared = 0;
    for (const [locale, catalog] of Object.entries(localeCatalogs)) {
      const messages = {[locale]: catalog};
      const full = getResolve(locale, messages, undefined, enCatalog);
      for (const slice of Object.values(slices)) {
        const sliced = getResolve(locale, messages, undefined, slice);
        for (const key of Object.keys(slice)) {
          expect(sliced(key, undefined), `${locale} ${key}`).toBe(
            full(key, undefined),
          );
          compared += 1;
        }
      }
      // With no provider catalog, every key falls straight to English.
      const fullNoCatalog = getResolve(locale, {}, undefined, enCatalog);
      for (const slice of Object.values(slices)) {
        const slicedNoCatalog = getResolve(locale, {}, undefined, slice);
        for (const key of Object.keys(slice)) {
          expect(slicedNoCatalog(key, undefined)).toBe(
            fullNoCatalog(key, undefined),
          );
        }
      }
    }
    expect(compared).toBeGreaterThan(Object.keys(localeCatalogs).length);
  });

  it('lets a component resolve the keys it registered without the whole catalog', () => {
    registerEnglishFallback(slices['Button/Button.generated.ts']);
    const {result} = renderHook(() => useComponentTranslator());
    expect(result.current('@astryx.button.loading')).toBe(
      enCatalog['@astryx.button.loading'],
    );
    // Only registered modules contribute; nothing here loaded the whole catalog.
    expect(Object.keys(englishFallback).length).toBeLessThan(
      Object.keys(enCatalog).length,
    );
  });
});
