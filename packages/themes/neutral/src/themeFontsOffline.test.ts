// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Each built-in theme ships its fonts: its font stylesheet loads every face
 * from a woff2 file in the package, with font-display: swap, so a page that
 * imports it draws at once and never waits on a network (an offline
 * machine, a sandbox, CI). Each family it ships has its license beside it,
 * and the Google Fonts stylesheet names the same families.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';

const themesDir = path.resolve(import.meta.dirname, '../..');
const themes = fs
  .readdirSync(themesDir)
  .filter(name => fs.existsSync(path.join(themesDir, name, 'fonts.css')));

/** The families a Google Fonts stylesheet asks for. */
function googleFamilies(css: string) {
  const url = /@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(css)?.[1];
  return url
    ? new URL(url).searchParams
        .getAll('family')
        .map(spec => ({family: (spec.split(':')[0] ?? '').replace(/\+/g, ' ')}))
    : [];
}

/** The `@font-face` rules of a stylesheet. */
function faces(css: string) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
    const body = m[1] as string;
    return {
      family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
      display: /font-display:\s*([a-z]+)/.exec(body)?.[1],
      urls: [...body.matchAll(/url\(\s*'?([^')]+)'?\s*\)/g)].map(
        u => u[1] as string,
      ),
    };
  });
}

describe('a theme font stylesheet', () => {
  it('is in every built-in theme', () => {
    expect(themes).toContain('neutral');
  });

  it.each(themes)('of %s loads every face from a file it ships', theme => {
    const dir = path.join(themesDir, theme);
    const css = fs.readFileSync(path.join(dir, 'fonts.css'), 'utf8');
    // No stylesheet import: nothing a page would wait on.
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/@import/);
    const all = faces(css);
    expect(all.length).toBeGreaterThan(0);
    for (const face of all) {
      expect(face.display, face.family).toBe('swap');
      expect(face.urls.length).toBeGreaterThan(0);
      for (const url of face.urls) {
        expect(url).toMatch(/^\.\/fonts\/[^/]+\.woff2$/);
        expect(fs.existsSync(path.join(dir, url)), url).toBe(true);
      }
    }
    // The same families as the Google Fonts stylesheet, each with its license.
    const google = googleFamilies(
      fs.readFileSync(path.join(dir, 'fonts.google.css'), 'utf8'),
    );
    expect(new Set(all.map(f => f.family))).toEqual(
      new Set(google.map(g => g.family)),
    );
    for (const {family} of google)
      expect(
        fs.existsSync(
          path.join(
            dir,
            'fonts',
            `${family.toLowerCase().replace(/\s+/g, '-')}.LICENSE.txt`,
          ),
        ),
        family,
      ).toBe(true);
  });

  it.each(themes)(
    'of %s ships its fonts and the Google Fonts stylesheet',
    theme => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(themesDir, theme, 'package.json'), 'utf8'),
      );
      expect(pkg.files).toEqual(
        expect.arrayContaining(['fonts', 'fonts.css', 'fonts.google.css']),
      );
      expect(pkg.exports['./fonts.google.css']).toBeTruthy();
    },
  );
});
