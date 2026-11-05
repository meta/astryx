// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {
  COMPACT_11_STOPS,
  DEFAULT_21_STOPS,
  PALETTE_RECIPE,
  generatePaletteSet,
  generateTonalPalette,
  perceptualDelta,
  validateStops,
} from './generator.mjs';
import {hexToOklch} from './color.mjs';

const families = [
  {id: 'neutral', name: 'Neutral', seed: '#777777', kind: 'neutral'},
  {id: 'blue', name: 'Blue', seed: '#0074e2'},
  {id: 'orange', name: 'Orange', seed: '#d57113'},
];

function candidateDigest(request) {
  const candidate = generateTonalPalette(request);
  return createHash('sha256')
    .update(`${JSON.stringify(candidate, null, 2)}\n`)
    .digest('hex');
}

describe('astryx-oklch-v1 palette generator', () => {
  it('returns directly usable candidate data without filesystem work', () => {
    const candidate = generateTonalPalette({
      families: [families[1]],
      stops: [40],
    });

    expect(candidate).toMatchObject({
      schemaVersion: 1,
      status: 'candidate',
      recipe: 'astryx-oklch-v1',
    });
    expect(candidate.palette.blue.light[40]).toMatch(/^#[0-9a-f]{6}$/);
    expect(candidate.palette.blue.dark[40]).toMatch(/^#[0-9a-f]{6}$/);
    expect(candidate.black).toBe('#000000');
    expect(candidate.white).toBe('#ffffff');
    expect(candidate.stops).toEqual([40]);
  });

  it('locks the normative recipe fixtures', () => {
    expect(candidateDigest({families})).toBe(
      '11c40191d508274d89d631bb4e1cb662f70ff0dce6c0dec101c317f9f69d3e25',
    );
    expect(
      candidateDigest({
        modeStrategy: 'light-only',
        stops: [20, 50, 80],
        families: [
          {
            id: 'blue',
            name: 'Blue',
            seed: '#0074e2',
            anchors: [
              {
                mode: 'light',
                stop: 50,
                color: '#1682d5',
                policy: 'exact',
              },
            ],
          },
        ],
      }),
    ).toBe('c42929be3c4b5cb857cada078f62bb5a2242c1a22cfa4ae7546a18592540f7f3');
    expect(
      candidateDigest({
        modeStrategy: 'dark-only',
        stops: [40],
        families: [{id: 'red', name: 'Red', seed: '#d62830'}],
      }),
    ).toBe('88d3d69865c74c7fb14347b9967575285a7d44ab893087a08bc842bb66b29bbb');
    expect(
      candidateDigest({
        stops: [60, 80, 95],
        families: [
          {id: 'green', name: 'Green', seed: '#358a3a'},
          {id: 'teal', name: 'Teal', seed: '#0c7365'},
          {id: 'cyan', name: 'Cyan', seed: '#0c6f82'},
        ],
      }),
    ).toBe('873821574fdbe3357304dbc06986bd2e5ec88af80d0f36305626fd826c3cf07b');
  });

  it('defaults to 21 stops while allowing authors to omit endpoints', () => {
    expect(generatePaletteSet({families: [families[1]]}).request.stops).toEqual(
      DEFAULT_21_STOPS,
    );
    expect(DEFAULT_21_STOPS).toHaveLength(21);
    expect(DEFAULT_21_STOPS[0]).toBe(0);
    expect(DEFAULT_21_STOPS.at(-1)).toBe(100);
    expect(
      generatePaletteSet({families: [families[1]], stops: [15, 40, 72]}).request
        .stops,
    ).toEqual([15, 40, 72]);
    expect(
      generatePaletteSet({families: [families[1]], stops: [40]}).families[0]
        .light.colors,
    ).toEqual({40: expect.stringMatching(/^#[0-9a-f]{6}$/)});
  });

  it('keeps shared stop values stable across full, compact, and custom layouts', () => {
    const family = {id: 'blue', name: 'Blue', seed: '#0074e2'};
    const full = generateTonalPalette({
      stops: [...DEFAULT_21_STOPS],
      families: [family],
    });
    const compact = generateTonalPalette({
      stops: [...COMPACT_11_STOPS],
      families: [family],
    });
    const custom = generateTonalPalette({
      stops: [12.5, 50, 80],
      families: [family],
    });

    expect(custom.stops).toEqual([12.5, 50, 80]);
    expect(custom.stops.map(stop => custom.palette.blue.light[stop])).toEqual([
      custom.palette.blue.light[12.5],
      custom.palette.blue.light[50],
      custom.palette.blue.light[80],
    ]);

    for (const mode of ['light', 'dark']) {
      for (const stop of COMPACT_11_STOPS) {
        expect(compact.palette.blue[mode][stop]).toBe(
          full.palette.blue[mode][stop],
        );
      }
      expect(custom.palette.blue[mode][50]).toBe(full.palette.blue[mode][50]);
      expect(custom.palette.blue[mode][80]).toBe(full.palette.blue[mode][80]);
      expect(custom.palette.blue[mode][12.5]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps default endpoints black and white and rejects tinted endpoint anchors', () => {
    const candidate = generateTonalPalette({families: [families[1]]});
    for (const mode of ['light', 'dark']) {
      expect(candidate.palette.blue[mode][0]).toBe('#000000');
      expect(candidate.palette.blue[mode][100]).toBe('#ffffff');
    }
    expect(() =>
      generateTonalPalette({
        families: [
          {
            ...families[1],
            anchors: [
              {
                mode: 'light',
                stop: 0,
                color: '#001122',
                policy: 'exact',
              },
            ],
          },
        ],
      }),
    ).toThrow('reserved for exact black');
  });

  it('rejects invalid stop layouts without prescribing a count', () => {
    expect(() => validateStops([])).toThrow('at least one stop');
    expect(() => validateStops([0, 40, 40, 100])).toThrow(
      'unique and strictly increasing',
    );
    expect(() => validateStops([-1, 50])).toThrow('from 0 to 100');
    expect(() => validateStops([0, Number.NaN, 100])).toThrow('finite number');
    expect(validateStops([0.5, 37.25, 99.75])).toEqual([0.5, 37.25, 99.75]);
  });

  it('uses literal stop tones in dark mode', () => {
    const candidate = generateTonalPalette({
      modeStrategy: 'light-and-dark',
      stops: [0, 5, 100],
      families: [families[1]],
    });

    expect(candidate.palette.blue.light[0]).toBe('#000000');
    expect(candidate.palette.blue.dark[0]).toBe('#000000');
    expect(candidate.palette.blue.dark[5]).toBe('#000f30');
    expect(candidate.palette.blue.light[100]).toBe('#ffffff');
    expect(candidate.palette.blue.dark[100]).toBe('#ffffff');
  });

  it('preserves exact anchors and rejects anchors outside the stop layout', () => {
    const result = generatePaletteSet({
      modeStrategy: 'light-only',
      stops: [20, 50, 80],
      families: [
        {
          id: 'blue',
          name: 'Blue',
          seed: '#0074e2',
          anchors: [
            {
              mode: 'light',
              stop: 50,
              color: '#1682d5',
              policy: 'exact',
            },
          ],
        },
      ],
    });

    expect(result.families[0].light.colors[50]).toBe('#1682d5');
    expect(() =>
      generatePaletteSet({
        modeStrategy: 'light-only',
        stops: [20, 50, 80],
        families: [
          {
            id: 'broken',
            name: 'Broken',
            seed: '#ff0000',
            anchors: [
              {
                mode: 'light',
                stop: 30,
                color: '#ff0000',
                policy: 'exact',
              },
            ],
          },
        ],
      }),
    ).toThrow('Anchor stop 30 is not present in the requested stop layout.');
  });

  it('distinguishes exact, bounded, and flexible authoring policies', () => {
    const target = '#1682d5';
    const generate = (policy, maxDeltaE) =>
      generateTonalPalette({
        modeStrategy: 'light-only',
        stops: [50],
        families: [
          {
            id: 'blue',
            name: 'Blue',
            seed: '#0074e2',
            anchors: [
              {
                mode: 'light',
                stop: 50,
                color: target,
                policy,
                ...(maxDeltaE == null ? {} : {maxDeltaE}),
              },
            ],
          },
        ],
      }).palette.blue.light[50];

    const exact = generate('exact');
    const bounded = generate('bounded', 2);
    const flexible = generate('flexible');

    expect(exact).toBe(target);
    expect(perceptualDelta(bounded, target)).toBeLessThanOrEqual(2.01);
    expect(flexible).not.toBe(target);
    expect(new Set([exact, bounded, flexible]).size).toBe(3);
  });

  it('rejects malformed anchors instead of silently dropping author intent', () => {
    expect(() =>
      generateTonalPalette({
        modeStrategy: 'light-only',
        stops: [50],
        families: [{...families[1], anchors: {}}],
      }),
    ).toThrow('anchors must be an array');

    expect(() =>
      generateTonalPalette({
        modeStrategy: 'light-only',
        stops: [50],
        families: [
          {
            ...families[1],
            anchors: [
              {mode: 'dark', stop: 50, color: '#1682d5', policy: 'exact'},
            ],
          },
        ],
      }),
    ).toThrow('Anchor mode dark is not generated by mode strategy light-only');
  });

  it('rejects an unknown neutral profile even without a neutral family', () => {
    expect(() =>
      generatePaletteSet({neutralProfile: 'warm-v2', families: [families[1]]}),
    ).toThrow('Unknown neutral profile: warm-v2');
    expect(
      generatePaletteSet({neutralProfile: 'warm-v1', families: [families[1]]})
        .request.neutralProfile,
    ).toBe('warm-v1');
  });

  it('normalizes anchor colors in the generation receipt', () => {
    const result = generatePaletteSet({
      modeStrategy: 'light-only',
      stops: [50],
      families: [
        {
          ...families[1],
          anchors: [
            {mode: 'light', stop: 50, color: '#AABBCC', policy: 'exact'},
          ],
        },
      ],
    });

    expect(result.request.families[0].anchors[0].color).toBe('#aabbcc');
  });

  it('requires bounded anchor tolerance to be a number', () => {
    for (const maxDeltaE of [null, '2']) {
      expect(() =>
        generateTonalPalette({
          modeStrategy: 'light-only',
          stops: [50],
          families: [
            {
              ...families[1],
              anchors: [
                {
                  mode: 'light',
                  stop: 50,
                  color: '#aabbcc',
                  policy: 'bounded',
                  maxDeltaE,
                },
              ],
            },
          ],
        }),
      ).toThrow('requires a non-negative maxDeltaE');
    }
  });

  it('generates an accent family only when the author declares one', () => {
    const withoutAccent = generateTonalPalette({
      stops: [50],
      families: [families[1]],
    });
    const withAccent = generateTonalPalette({
      stops: [50],
      families: [{id: 'accent', name: 'Accent', seed: '#ff4db8'}],
    });

    expect(withoutAccent.palette).not.toHaveProperty('accent');
    expect(withAccent.palette.accent.light[50]).toMatch(/^#[0-9a-f]{6}$/);
    expect(withAccent.palette.accent.dark[50]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('reserves black and white for the standalone palette values', () => {
    for (const id of ['black', 'white']) {
      expect(() =>
        generateTonalPalette({
          families: [{id, name: id, seed: '#777777'}],
        }),
      ).toThrow(
        `Family id ${id} is reserved for the standalone ${id} palette value.`,
      );
    }
  });

  it('uses vibrancy to make the generated families more muted or vivid', () => {
    const generate = vibrancy =>
      generateTonalPalette({
        vibrancy,
        stops: [50],
        families: [families[1]],
      }).palette.blue.light[50];

    expect(hexToOklch(generate(25)).C).toBeLessThan(hexToOklch(generate(75)).C);
  });
});
