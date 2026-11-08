// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  generateMonthCapitalLanguages,
  hasStandaloneMonthCapital,
  renderGeneratedFile,
} from './generate-cldr-month-capitals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = path.join(
  ROOT,
  'packages/core/src/utils/standaloneMonthCapitals.generated.ts',
);

describe('generate-cldr-month-capitals', () => {
  it('matches the checked-in generated output', async () => {
    expect(await renderGeneratedFile()).toBe(
      fs.readFileSync(OUTPUT_FILE, 'utf8'),
    );
  });

  it("reads CLDR's stand-alone month transform", () => {
    expect(hasStandaloneMonthCapital('es')).toBe(true);
    expect(hasStandaloneMonthCapital('ru')).toBe(true);
    // CLDR records no transform for Vietnamese; German months are capitalized
    // in running text already.
    expect(hasStandaloneMonthCapital('vi')).toBe(false);
    expect(hasStandaloneMonthCapital('de')).toBe(false);
    // Czech titlecases months only in menus, not stand-alone.
    expect(hasStandaloneMonthCapital('cs')).toBe(false);
  });

  it('lists only shipped languages, sorted', () => {
    const languages = generateMonthCapitalLanguages();
    expect(languages).toEqual([...languages].sort());
    expect(languages).toContain('pl');
    expect(languages).not.toContain('vi');
  });
});
