// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme editor's palette helpers that need no project on disk:
 * which token each color dial feeds, where its files live, which values
 * grow a palette, the mapping `how` prints for each dial, and the notes a
 * color change reports.
 */

import {describe, expect, it} from 'vitest';
import {
  PALETTE_DIALS,
  PALETTE_TOKENS,
  VIBRANCY_DEFAULT,
  mappingRows,
  paletteFiles,
  paletteNotes,
  paletteToken,
  seedOf,
} from './_palette.mjs';

describe('paletteToken', () => {
  it('names the main token each color dial feeds', () => {
    expect(paletteToken('accent')).toBe('--color-accent');
    expect(paletteToken('neutral')).toBe('--color-background-surface');
  });

  it('uses Core\'s word for each status family (danger is "error")', () => {
    expect(paletteToken('success')).toBe('--color-success');
    expect(paletteToken('warning')).toBe('--color-warning');
    expect(paletteToken('danger')).toBe('--color-error');
    expect(paletteToken('info')).toBe('--color-info');
  });

  it('points every dial at a token a color dial can actually set', () => {
    for (const dial of PALETTE_DIALS)
      expect(PALETTE_TOKENS.has(paletteToken(dial)), dial).toBe(true);
  });
});

describe('PALETTE_DIALS', () => {
  it('lists the six color dials, accent first', () => {
    expect(PALETTE_DIALS).toEqual([
      'accent',
      'neutral',
      'success',
      'warning',
      'danger',
      'info',
    ]);
  });
});

describe('VIBRANCY_DEFAULT', () => {
  it("sits inside the dial's 0 to 100 range", () => {
    expect(VIBRANCY_DEFAULT).toBeGreaterThanOrEqual(0);
    expect(VIBRANCY_DEFAULT).toBeLessThanOrEqual(100);
  });
});

describe('paletteFiles', () => {
  it("puts every generated file under the theme's own folder", () => {
    expect(paletteFiles('brand')).toEqual({
      config: 'themes/brand/palette.config.json',
      palette: 'themes/brand/tokens/brand.palette.ts',
      receipt: 'themes/brand/tokens/brand.palette.receipt.json',
      refs: 'themes/brand/tokens/brand.palette-refs.ts',
      importPath: './tokens/brand.palette',
      refsImportPath: './tokens/brand.palette-refs',
    });
  });

  it('follows the slug for any theme name', () => {
    const f = paletteFiles('my-theme');
    expect(f.config).toBe('themes/my-theme/palette.config.json');
    expect(f.importPath).toBe('./tokens/my-theme.palette');
  });

  it('keeps each import path as its file without the extension', () => {
    const f = paletteFiles('brand');
    expect(`themes/brand/${f.importPath.slice(2)}.ts`).toBe(f.palette);
    // The theme imports only the stops it uses, from the refs file.
    expect(`themes/brand/${f.refsImportPath.slice(2)}.ts`).toBe(f.refs);
  });
});

describe('seedOf', () => {
  it('turns every fixed color form into the same lowercase hex seed', () => {
    for (const v of ['red', 'RED', '#f00', '#F00', '#ff0000', 'rgb(255 0 0)'])
      expect(seedOf(v), v).toBe('#ff0000');
  });

  it('gives null for a value with no fixed color', () => {
    for (const v of [
      'var(--color-accent)',
      'color-mix(in srgb, var(--x), blue)',
      'currentcolor',
      'banana',
      '',
    ])
      expect(seedOf(v), v).toBeNull();
  });
});

describe('PALETTE_TOKENS', () => {
  it('holds the accent tokens and the focus ring', () => {
    for (const t of [
      '--color-accent',
      '--color-on-accent',
      '--color-text-accent',
      '--color-icon-accent',
      '--color-accent-muted',
      '--focus-outline-color',
      '--color-background-body',
    ])
      expect(PALETTE_TOKENS.has(t), t).toBe(true);
  });

  it('holds all seven tokens of every status family', () => {
    for (const w of ['success', 'warning', 'error', 'info'])
      for (const t of [
        `--color-${w}`,
        `--color-on-${w}`,
        `--color-text-${w}`,
        `--color-icon-${w}`,
        `--color-${w}-muted`,
        `--color-on-${w}-muted`,
        `--color-border-${w}`,
      ])
        expect(PALETTE_TOKENS.has(t), t).toBe(true);
  });

  it('uses Core\'s "error", not the dial name "danger"', () => {
    expect(PALETTE_TOKENS.has('--color-danger')).toBe(false);
    expect(PALETTE_TOKENS.has('--color-error')).toBe(true);
  });
});

describe('mappingRows', () => {
  it('shows the accent mapping with the focus ring and link notes', () => {
    const rows = mappingRows('accent');
    expect(rows[0]).toMatch(/^--color-accent: /);
    expect(rows.some(r => r.startsWith('--color-on-accent:'))).toBe(true);
    expect(rows.some(r => r.startsWith('--color-accent-muted:'))).toBe(true);
    expect(rows.some(r => r.startsWith('--focus-outline-color'))).toBe(true);
    expect(rows.some(r => r.startsWith('links and selection'))).toBe(true);
    // Accent has no separate on-muted or border tokens.
    expect(rows.some(r => r.includes('on-accent-muted'))).toBe(false);
    expect(rows.some(r => r.includes('border-accent'))).toBe(false);
  });

  it("shows each status mapping under Core's word for it", () => {
    const rows = mappingRows('danger');
    expect(rows[0]).toMatch(/^--color-error: /);
    expect(rows.some(r => r.startsWith('--color-on-error-muted:'))).toBe(true);
    expect(rows.some(r => r.startsWith('--color-border-error:'))).toBe(true);
    expect(rows.join('\n')).not.toContain('$');
    expect(rows.join('\n')).not.toContain('danger');
    // The accent-only notes stay out of a status mapping.
    expect(rows.some(r => r.startsWith('--focus-outline-color'))).toBe(false);
  });

  it('gives a status family the same rows as each other, by word', () => {
    const swap = (/** @type {string[]} */ rows, /** @type {string} */ w) =>
      rows.map(r => r.replaceAll(w, 'X'));
    const base = swap(mappingRows('success'), 'success');
    expect(swap(mappingRows('info'), 'info')).toEqual(base);
    expect(swap(mappingRows('danger'), 'error')).toEqual(base);
    // Warning differs in one row only: text on its fill is near-black first,
    // as the official themes put it.
    const warning = swap(mappingRows('warning'), 'warning');
    const onRow = (/** @type {string} */ r) => r.startsWith('--color-on-X:');
    expect(warning.filter(r => !onRow(r))).toEqual(base.filter(r => !onRow(r)));
    expect(warning.find(onRow)).toContain('near-black first in both modes');
  });

  it('shows the neutral mapping as shades, tints and moving text', () => {
    const rows = mappingRows('neutral');
    expect(rows.length).toBeGreaterThan(5);
    // First the exact neutral color, then each token's shades.
    expect(rows[0]).toMatch(/^your exact color sits at its own shade/);
    expect(rows.filter(r => r.startsWith('--'))[0]).toMatch(
      /^--[\w-]+: light shade \d+, dark shade \d+/,
    );
    expect(rows.some(r => /at opacity/.test(r))).toBe(true);
    // Secondary text and icons move until they read: icons need 3:1, text 4.5:1.
    const secondary = rows.filter(r => r.includes('-secondary:'));
    expect(secondary.length).toBeGreaterThan(0);
    for (const r of secondary)
      expect(r).toMatch(
        r.includes('icon')
          ? /reads at 3:1 on the surfaces/
          : /reads at 4\.5:1 on the surfaces/,
      );
  });

  it('gives no rows for a name that is not a color dial', () => {
    expect(mappingRows('corners')).toEqual([]);
    expect(mappingRows('')).toEqual([]);
  });

  it('gives rows for every real dial', () => {
    for (const dial of PALETTE_DIALS)
      expect(mappingRows(dial).length, dial).toBeGreaterThan(0);
  });
});

describe('paletteNotes', () => {
  /** @param {string} family @param {string} token */
  const stop = (family, token) => ({
    family,
    light: {stop: 50, color: '#aa0000'},
    dark: {stop: 70, color: '#ff8888'},
    token,
  });

  /** @param {any[]} contrast @param {Record<string, any>} [tokens] */
  const mapping = (contrast, tokens) =>
    /** @type {any} */ ({
      tokens: tokens ?? {'--color-error': stop('danger', '--color-error')},
      contrast,
      // No main token set exactly, no hand edits kept, no seeds to name.
      exact: {},
      notes: [],
      families: [],
    });

  it('has nothing to say with no palette', () => {
    expect(paletteNotes(null, 'accent', 'brand')).toEqual([]);
  });

  it("names the main token's shade in each mode, then the generated files", () => {
    const notes = paletteNotes(mapping([]), 'danger', 'brand');
    expect(notes).toEqual([
      '--color-error uses danger shade 50 (#aa0000) in light and danger shade 70 (#ff8888) in dark',
      'the generated colors are in themes/brand/tokens/brand.palette.ts, made from themes/brand/palette.config.json (receipt: themes/brand/tokens/brand.palette.receipt.json); the theme imports only the shades it uses, from themes/brand/tokens/brand.palette-refs.ts',
    ]);
  });

  it("skips the shade line when the dial's main token is not mapped", () => {
    const notes = paletteNotes(mapping([], {}), 'danger', 'brand');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^the generated colors are in /);
  });

  it('reports a token that had to move off its preferred shade', () => {
    const notes = paletteNotes(
      mapping([
        {
          token: '--color-error',
          mode: 'light',
          against: 'the surfaces',
          needs: 4.5,
          stop: 45,
          preferred: 50,
          ratio: 4.7,
          pass: true,
        },
      ]),
      'danger',
      'brand',
    );
    expect(notes[1]).toBe(
      '--color-error uses shade 45 in light, not 50, so it reads at 4.7:1 on the surfaces',
    );
  });

  it('stays quiet about a token that kept its preferred shade', () => {
    const notes = paletteNotes(
      mapping([
        {
          token: '--color-error',
          mode: 'light',
          against: 'the surfaces',
          needs: 4.5,
          stop: 50,
          preferred: 50,
          ratio: 5.1,
          pass: true,
        },
      ]),
      'danger',
      'brand',
    );
    expect(notes).toHaveLength(2);
  });

  it('refuses to hide a token that cannot reach its contrast', () => {
    const notes = paletteNotes(
      mapping([
        {
          token: '--color-error',
          mode: 'dark',
          against: 'the muted tint',
          needs: 4.5,
          stop: 100,
          preferred: 80,
          ratio: 3.2,
          pass: false,
        },
      ]),
      'danger',
      'brand',
    );
    expect(notes[1]).toBe(
      '--color-error reads at only 3.2:1 in dark on the muted tint (needs 4.5:1) even at shade 100, the most contrasting one: pick a lighter or darker danger, or set --color-error exactly',
    );
  });

  it('ignores contrast checks that belong to another family', () => {
    const notes = paletteNotes(
      mapping(
        [
          {
            token: '--color-accent',
            mode: 'light',
            against: 'the surfaces',
            needs: 4.5,
            stop: 100,
            preferred: 50,
            ratio: 2,
            pass: false,
          },
        ],
        {
          '--color-error': stop('danger', '--color-error'),
          '--color-accent': stop('accent', '--color-accent'),
        },
      ),
      'danger',
      'brand',
    );
    expect(notes.some(n => n.includes('--color-accent'))).toBe(false);
    expect(notes).toHaveLength(2);
  });

  it('ignores a contrast check for a token the palette does not map', () => {
    const notes = paletteNotes(
      mapping([
        {
          token: '--color-unmapped',
          mode: 'light',
          against: 'the surfaces',
          needs: 4.5,
          stop: 100,
          preferred: 50,
          ratio: 2,
          pass: false,
        },
      ]),
      'danger',
      'brand',
    );
    expect(notes).toHaveLength(2);
  });
});
