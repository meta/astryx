// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {hexToOklch} from '../color-studio/colorUtils';
import {THEME_REFERENCES} from './themeCorpus';

import {
  COMPACT_11_STOPS,
  FULL_21_STOPS,
  generatePaletteSet,
  parseStopList,
  perceptualDelta,
  serializeGenerationResult,
  validateStops,
  type PaletteGenerationRequest,
} from './generator';

function request(
  overrides: Partial<PaletteGenerationRequest> = {},
): PaletteGenerationRequest {
  return {
    algorithm: 'oklch-v1-experimental',
    vibrancy: 50,
    neutralProfile: 'neutral-v1',
    modeStrategy: 'light-and-dark',
    stops: [...FULL_21_STOPS],
    families: [
      {
        id: 'blue',
        name: 'Blue',
        seed: '#0074e2',
        anchors: [],
      },
    ],
    ...overrides,
  };
}

describe('experimental palette generator', () => {
  it('loads complete existing-theme comparison ramps', () => {
    expect(THEME_REFERENCES.map(theme => theme.id)).toEqual([
      'neutral-pr-5628',
      'neutral-legacy',
      'stone',
      'gothic',
      'y2k',
      'butter',
    ]);
    for (const theme of THEME_REFERENCES) {
      expect(theme.suggestedVibrancy.oklch).toBeGreaterThanOrEqual(0);
      expect(theme.suggestedVibrancy.oklch).toBeLessThanOrEqual(100);
      for (const family of theme.families) {
        for (const mode of theme.modes) {
          expect(Object.keys(family[mode] ?? {})).toHaveLength(21);
        }
      }
    }
  });

  it('keeps Y2K comparison inputs aligned with its reviewed palette request', () => {
    const y2k = THEME_REFERENCES.find(theme => theme.id === 'y2k');

    expect(y2k?.suggestedVibrancy).toEqual({oklch: 72, hct: 53, compare: 72});
    expect(
      Object.fromEntries(
        y2k?.families.map(family => [family.id, family.seed]) ?? [],
      ),
    ).toEqual({
      neutral: '#fff6ed',
      accent: '#cccffa',
      red: '#ff6f7a',
      orange: '#ff9f4a',
      yellow: '#ffd34f',
      green: '#c5e17a',
      teal: '#48c99a',
      cyan: '#42d4d0',
      blue: '#00a8ff',
      purple: '#a589ff',
      pink: '#ff72b6',
    });
  });

  it('supports the full and compact stop presets', () => {
    expect(validateStops([...FULL_21_STOPS])).toHaveLength(21);
    expect(validateStops([...COMPACT_11_STOPS])).toHaveLength(11);
    expect(parseStopList('0, 25, 50, 75, 100')).toEqual([0, 25, 50, 75, 100]);
  });

  it('rejects incomplete, duplicate, and unordered stop layouts', () => {
    expect(() => validateStops([10, 50, 100])).toThrow(
      'include stops 0 and 100',
    );
    expect(() => validateStops([0, 50, 50, 100])).toThrow(
      'unique and strictly increasing',
    );
    expect(() => validateStops([0, 75, 50, 100])).toThrow(
      'unique and strictly increasing',
    );
    expect(() => parseStopList('0, nope, 100')).toThrow(
      'Every custom stop must be a number',
    );
  });

  it('is byte-deterministic for an identical normalized request', () => {
    const input = request();
    expect(serializeGenerationResult(generatePaletteSet(input))).toBe(
      serializeGenerationResult(generatePaletteSet(input)),
    );
  });

  it('preserves exact anchors byte-for-byte', () => {
    const result = generatePaletteSet(
      request({
        families: [
          {
            id: 'blue',
            name: 'Blue',
            seed: '#0064e0',
            anchors: [
              {
                mode: 'light',
                stop: 50,
                color: '#0074e2',
                policy: 'exact',
              },
            ],
          },
        ],
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.families[0].light?.colors[50]).toBe('#0074e2');
    expect(result.families[0].light?.diagnostics.anchors[0].deltaE).toBe(0);
  });

  it('supports more than one anchor in the same family', () => {
    const result = generatePaletteSet(
      request({
        families: [
          {
            id: 'blue',
            name: 'Blue',
            seed: '#0064e0',
            anchors: [
              {
                mode: 'light',
                stop: 40,
                color: '#005ac0',
                policy: 'exact',
              },
              {
                mode: 'light',
                stop: 70,
                color: '#75b4ff',
                policy: 'exact',
              },
            ],
          },
        ],
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.families[0].light?.colors[40]).toBe('#005ac0');
    expect(result.families[0].light?.colors[70]).toBe('#75b4ff');
  });

  it('tapers an exact anchor into neighboring stops instead of creating a single-stop spike', () => {
    const result = generatePaletteSet(
      request({
        modeStrategy: 'light-only',
        families: [
          {
            id: 'blue',
            name: 'Blue',
            seed: '#0074e2',
            anchors: [
              {
                mode: 'light',
                stop: 50,
                color: '#7a3cff',
                policy: 'exact',
              },
            ],
          },
        ],
      }),
    );
    const colors = result.families[0].light?.colors;

    expect(result.errors).toEqual([]);
    expect(colors?.[50]).toBe('#7a3cff');
    expect(
      perceptualDelta(colors?.[45] ?? '', colors?.[50] ?? ''),
    ).toBeLessThan(7);
    expect(
      perceptualDelta(colors?.[50] ?? '', colors?.[55] ?? ''),
    ).toBeLessThan(7);
  });

  it('keeps bounded anchors within their declared tolerance', () => {
    const result = generatePaletteSet(
      request({
        families: [
          {
            id: 'blue',
            name: 'Blue',
            seed: '#0064e0',
            anchors: [
              {
                mode: 'light',
                stop: 50,
                color: '#0074e2',
                policy: 'bounded',
                maxDeltaE: 1.5,
              },
            ],
          },
        ],
      }),
    );

    expect(result.errors).toEqual([]);
    expect(
      result.families[0].light?.diagnostics.anchors[0].deltaE,
    ).toBeLessThanOrEqual(1.51);
  });

  it('fails a family when an anchor references a missing stop', () => {
    const result = generatePaletteSet(
      request({
        stops: [...COMPACT_11_STOPS],
        families: [
          {
            id: 'blue',
            name: 'Blue',
            seed: '#0064e0',
            anchors: [
              {
                mode: 'light',
                stop: 45,
                color: '#0074e2',
                policy: 'exact',
              },
            ],
          },
        ],
      }),
    );

    expect(result.families).toEqual([]);
    expect(result.errors[0].message).toContain('not present');
  });

  it('produces distinct, monotonic light and dark ramps', () => {
    const result = generatePaletteSet(request());
    const family = result.families[0];

    expect(result.errors).toEqual([]);
    expect(family.light?.diagnostics.monotonic).toBe(true);
    expect(family.dark?.diagnostics.monotonic).toBe(true);
    expect(family.light?.colors[50]).not.toBe(family.dark?.colors[50]);
    expect(result.coordination.map(item => item.mode)).toEqual([
      'light',
      'dark',
    ]);
  });

  it('does not emit a light ramp when dark-only output was requested', () => {
    const result = generatePaletteSet(request({modeStrategy: 'dark-only'}));

    expect(result.families[0].light).toBeUndefined();
    expect(result.families[0].dark).toBeDefined();
    expect(result.coordination.map(item => item.mode)).toEqual(['dark']);
  });

  it('makes continuous vibrancy values observably different', () => {
    const muted = generatePaletteSet(request({vibrancy: 25}));
    const vibrant = generatePaletteSet(request({vibrancy: 75}));
    const mutedColor = muted.families[0].light?.colors[50] ?? '#000000';
    const vibrantColor = vibrant.families[0].light?.colors[50] ?? '#000000';

    expect(perceptualDelta(mutedColor, vibrantColor)).toBeGreaterThan(1);
  });

  it('makes zero vibrancy genuinely achromatic', () => {
    const result = generatePaletteSet(
      request({vibrancy: 0, modeStrategy: 'light-only'}),
    );

    expect(result.families[0].light?.colors[50]).toMatch(
      /^#([0-9a-f]{2})\1\1$/,
    );
  });

  it('rejects vibrancy values outside the slider range', () => {
    expect(() => generatePaletteSet(request({vibrancy: 101}))).toThrow(
      'Vibrancy must be a number from 0 to 100',
    );
  });

  it('makes the known blue hue-drift tradeoff visible in the comparison', () => {
    const oklch = generatePaletteSet(request());
    const hct = generatePaletteSet(request({algorithm: 'hct-v1-experimental'}));

    expect(oklch.families[0].light?.diagnostics.maximumHueDrift).toBeLessThan(
      12,
    );
    expect(hct.families[0].light?.diagnostics.maximumHueDrift).toBeGreaterThan(
      12,
    );
  });

  it('keeps low-tone OKLCH orange from becoming a low-chroma brown band', () => {
    const result = generatePaletteSet(
      request({
        modeStrategy: 'light-only',
        families: [{id: 'orange', name: 'Orange', seed: '#d57113'}],
      }),
    );
    const tone30 = hexToOklch(
      result.families[0].light?.colors[30] ?? '#000000',
    );

    expect(tone30.H).toBeGreaterThan(35);
    expect(tone30.H).toBeLessThan(48);
    expect(tone30.C).toBeGreaterThan(0.1);
    expect(result.families[0].light?.diagnostics.hueIdentityRisk).toBeNull();
  });

  it('supports distinct neutral profiles without semantic family names affecting chromatic ramps', () => {
    const neutralFamily = {
      id: 'neutral',
      name: 'Whatever the author calls it',
      seed: '#777777',
      kind: 'neutral' as const,
    };
    const neutral = generatePaletteSet(
      request({neutralProfile: 'neutral-v1', families: [neutralFamily]}),
    );
    const cool = generatePaletteSet(
      request({neutralProfile: 'cool-v1', families: [neutralFamily]}),
    );

    expect(neutral.families[0].light?.colors[50]).not.toBe(
      cool.families[0].light?.colors[50],
    );
    expect(neutral.families[0].light?.colors[50]).toMatch(
      /^#([0-9a-f]{2})\1\1$/,
    );
    expect(neutral.families[0].dark?.colors[90]).not.toBe('#ffffff');
    expect(neutral.families[0].dark?.colors[100]).toBe('#ffffff');
  });

  it('reports cross-family distinction and chroma balance at a shared stop', () => {
    const result = generatePaletteSet(
      request({
        modeStrategy: 'light-only',
        families: [
          {id: 'blue', name: 'Blue', seed: '#0074e2'},
          {id: 'green', name: 'Green', seed: '#358a3a'},
          {id: 'purple', name: 'Purple', seed: '#980fb2'},
        ],
      }),
    );
    const diagnostic = result.coordination[0];

    expect(diagnostic.stop).toBe(50);
    expect(diagnostic.closestFamilies).not.toBeNull();
    expect(diagnostic.minimumFamilyDeltaE).toBeGreaterThan(0);
    expect(diagnostic.chromaRatio).toBeGreaterThanOrEqual(1);
    expect(diagnostic.chromaRatio).toBeLessThan(2);
  });
});
