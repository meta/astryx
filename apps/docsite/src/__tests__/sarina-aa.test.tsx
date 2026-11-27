// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sarina-aa.test.tsx
 * @input The drawing of the letters "Aa" on the themes card, the card's
 *   swatch rail, and the Butter theme
 * @output Proof that the drawing has no text and no font, is hidden from
 *   assistive technology, and has the outlines of the two glyphs, with no
 *   number changed, in a box of two ems by one em; that the rail gives it
 *   the box and the color of the text that it replaces; and that Sarina,
 *   whose letters it shows, is the display font of Butter
 * @position Docsite unit tests. e2e/font-loading.spec.ts measures the
 *   drawing on the built pages.
 * Run: pnpm -F @astryxdesign/docsite test sarina-aa
 */

import {createHash} from 'node:crypto';
import {createElement, type CSSProperties, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {butterTheme} from '../../../../packages/themes/butter/src/butterTheme';
import {SarinaAa} from '../app/(site)/_landing/SarinaAa';
import {ThemesPreview} from '../app/(site)/_landing/ThemesPreview';

// The docsite's own StyleX is compiled by its Babel build, not by Vitest.
// Here a style is the object that the source gives `create`, and an element
// gets the styles as its `style`, so that a test can read them.
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: (...styles: unknown[]) => ({
    style: Object.assign(
      {},
      ...styles.filter(
        style => typeof style === 'object' && !Array.isArray(style),
      ),
    ) as CSSProperties,
  }),
}));
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({children}: {children?: ReactNode}) =>
    createElement('div', null, children),
}));
vi.mock('@astryxdesign/core/Layout', () => ({
  HStack: ({children}: {children?: ReactNode}) =>
    createElement('div', {'data-rail': ''}, children),
}));
vi.mock('@astryxdesign/core/theme', async importOriginal => ({
  ...(await importOriginal<object>()),
  Theme: ({children}: {children?: ReactNode}) => children,
}));
vi.mock('../generated/themeRegistry', () => ({themeObjects: {}}));
vi.mock('../app/providers', () => ({
  useThemeMode: () => ({themeMode: 'system'}),
}));

/** The numbers of a path, as points. */
function points(path: string) {
  const numbers = path.match(/-?\d+(?:\.\d+)?/gu)!.map(Number);
  return numbers.flatMap((x, index) =>
    index % 2 === 0 ? [{x, y: numbers[index + 1]}] : [],
  );
}

describe('the drawing of "Aa"', () => {
  const html = renderToStaticMarkup(<SarinaAa />);

  it('is one path with no text, hidden from assistive technology', () => {
    expect(html).toMatch(
      /^<svg style="[^"]*" viewBox="[^"]+" aria-hidden="true"><path d="M[^"]+Z"><\/path><\/svg>$/u,
    );
    expect(html).not.toContain('font');
  });

  it('has a box of two ems by one em, with the baseline 19 of 24 parts below its top', () => {
    const [left, top, width, height] = /viewBox="([^"]+)"/u
      .exec(html)![1]
      .split(' ')
      .map(Number);
    expect({left, width, height}).toEqual({left: 0, width: 4096, height: 2048});
    expect((-top / height) * 24).toBeCloseTo(19, 10);
  });

  it('has the outlines of the glyphs "A" and "a" of Sarina, the "a" 30 of 24 parts of an em after the "A"', () => {
    const path = /<path d="([^"]+)"/u.exec(html)![1];
    expect(path.match(/M/gu)).toHaveLength(2);
    expect(path.match(/Z/gu)).toHaveLength(2);
    // In the font, "A" extends from -11 to 2596 and "a" from -206 to 1769,
    // and they extend from 67 below the baseline to 1369 above it.
    const xs = points(path).map(point => point.x);
    const ys = points(path).map(point => point.y);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([
      -11,
      (30 / 24) * 2048 + 1769,
    ]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([-1369, 67]);
  });

  it('keeps each number of the outline', () => {
    // The outline is data from the font file. Its extent does not change
    // when an edit moves a point inside it, and its digest does.
    const path = /<path d="([^"]+)"/u.exec(html)![1];
    expect(createHash('sha256').update(path).digest('hex').slice(0, 16)).toBe(
      '5d60ee426572fc55',
    );
  });

  it('has the box of the text, lets the letters extend past it, and has the color of its element', () => {
    expect(html).toContain(
      'display:block;width:2em;height:1em;overflow:visible;fill:currentColor',
    );
  });

  it('shows the letters of the display font of Butter', () => {
    for (const type of ['type:display-1', 'type:display-2', 'type:display-3']) {
      expect(butterTheme.components?.text?.[type]).toMatchObject({
        fontFamily: expect.stringMatching(/^Sarina,/u),
      });
    }
  });
});

describe('the swatch rail of the themes card', () => {
  const html = renderToStaticMarkup(<ThemesPreview store={null} />);
  const rail = /<div data-rail="">(.*?)<\/div><\/div><\/div>$/u.exec(html)![1];

  it('ends with the drawing, at a font size of 24px and in the accent color', () => {
    expect(rail).toMatch(
      /<svg style="display:block;width:2em;height:1em;overflow:visible;fill:currentColor;font-size:24px;color:var\(--color-accent\)" viewBox="[^"]+" aria-hidden="true"><path d="[^"]+"><\/path><\/svg>$/u,
    );
  });

  it('has no text', () => {
    expect(rail.replace(/<[^>]+>/gu, '')).toBe('');
  });

  it('gives the first swatch the color of the drawing', () => {
    expect(rail).toMatch(
      /^<div style="[^"]*background-color:var\(--color-accent\)"><\/div>/u,
    );
  });
});
