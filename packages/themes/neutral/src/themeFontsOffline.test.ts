// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Each built-in theme ships its fonts: its font stylesheet loads every face
 * from a woff2 file in the package, with font-display: fallback, so a page
 * that imports it never waits on a network (an offline machine, a sandbox,
 * CI) and draws its text in the face it loads from the package. Each family it ships has its license beside it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';

const themesDir = path.resolve(import.meta.dirname, '../..');
const themes = fs
  .readdirSync(themesDir)
  .filter(name => fs.existsSync(path.join(themesDir, name, 'fonts.css')));

/** The `@font-face` rules of a stylesheet. */
function faces(css: string) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
    const body = m[1] as string;
    return {
      family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
      display: /font-display:\s*([a-z]+)/.exec(body)?.[1],
      ranged: /unicode-range:/.test(body),
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
      expect(face.display, face.family).toBe('fallback');
      // A subset: a page fetches only the files its text needs.
      expect(face.ranged, face.family).toBe(true);
      expect(face.urls.length).toBeGreaterThan(0);
      for (const url of face.urls) {
        expect(url).toMatch(/^\.\/fonts\/[^/]+\.woff2$/);
        expect(fs.existsSync(path.join(dir, url)), url).toBe(true);
      }
    }
    // Each family it loads has its license beside its files.
    for (const family of new Set(all.map(f => f.family)))
      expect(
        fs.existsSync(
          path.join(
            dir,
            'fonts',
            `${String(family).toLowerCase().replace(/\s+/g, '-')}.LICENSE.txt`,
          ),
        ),
        family,
      ).toBe(true);
    // Every file it ships is a face it loads, or a license.
    const named = new Set(all.flatMap(f => f.urls.map(u => path.basename(u))));
    for (const file of fs.readdirSync(path.join(dir, 'fonts')))
      expect(named.has(file) || file.endsWith('.LICENSE.txt'), file).toBe(true);
  });

  it.each(themes)('of %s ships its fonts', theme => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(themesDir, theme, 'package.json'), 'utf8'),
    );
    expect(pkg.files).toEqual(expect.arrayContaining(['fonts', 'fonts.css']));
    expect(pkg.exports['./fonts.css']).toBeTruthy();
  });
});
