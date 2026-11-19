// Copyright (c) Meta Platforms, Inc. and affiliates.

import {palette as butterModePalettes} from '../../../../../../../packages/themes/butter/src/butterPalettes.generated';
import {palette as gothicModePalettes} from '../../../../../../../packages/themes/gothic/src/gothicPalettes.generated';
import {palette as stoneModePalettes} from '../../../../../../../packages/themes/stone/src/stonePalettes.generated';
import {palette as y2kModePalettes} from '../../../../../../../packages/themes/y2k/src/y2kPalettes.generated';

import {hexToHct, hctToHex} from '../color-studio/colorUtils';
import {FULL_21_STOPS, type PaletteMode} from './generator';
import {NEUTRAL_THEME_PALETTE_REFERENCE} from './neutralThemePaletteReference';

export interface ThemeReferenceFamily {
  id: string;
  name: string;
  seed: string;
  kind?: 'chromatic' | 'neutral';
  light?: Record<number, string>;
  dark?: Record<number, string>;
  /** The same stored ramp is used in both preview columns. */
  sharedAcrossModes?: boolean;
}

export interface ThemeReference {
  id: string;
  name: string;
  description: string;
  referenceKind: 'stored' | 'legacy-generated';
  /** Best-fit starting points measured against stops 5–95. */
  suggestedVibrancy: {oklch: number; hct: number; compare: number};
  modes: PaletteMode[];
  families: ThemeReferenceFamily[];
}

type RawPalette = Readonly<Record<string | number, string | number>>;

function tones(palette: RawPalette): Record<number, string> {
  return Object.fromEntries(
    FULL_21_STOPS.map(stop => {
      const value = palette[stop];
      if (typeof value !== 'string') {
        throw new Error(`Theme palette is missing stop ${stop}.`);
      }
      return [stop, value.toLowerCase()];
    }),
  );
}

function legacyRamp(seed: string, mode: PaletteMode): Record<number, string> {
  const source = hexToHct(seed);
  const chroma = mode === 'dark' ? source.chroma * 0.85 : source.chroma;
  const maximumChroma = chroma * 1.8;
  return Object.fromEntries(
    FULL_21_STOPS.map(stop => {
      let tone: number = stop;
      if (mode === 'dark') {
        const lift = stop >= 95 ? 0 : stop <= 80 ? 5 : 5 * ((95 - stop) / 15);
        tone = Math.min(100, stop + lift);
      }
      const boost = tone < 50 ? 1 + (50 - tone) / 40 : 1;
      return [
        stop,
        hctToHex({
          hue: source.hue,
          chroma: Math.min(chroma * boost, maximumChroma),
          tone,
        }),
      ];
    }),
  );
}

function generatedFamily(
  id: string,
  name: string,
  seed: string,
  kind: 'chromatic' | 'neutral' = 'chromatic',
): ThemeReferenceFamily {
  return {
    id,
    name,
    seed,
    kind,
    light: legacyRamp(seed, 'light'),
    dark: legacyRamp(seed, 'dark'),
  };
}

function storedFamily(
  id: string,
  name: string,
  seed: string,
  palette: RawPalette,
  kind: 'chromatic' | 'neutral' = 'chromatic',
  darkPalette?: RawPalette,
): ThemeReferenceFamily {
  const ramp = tones(palette);
  return {
    id,
    name,
    seed,
    kind,
    light: ramp,
    dark: darkPalette ? tones(darkPalette) : ramp,
    sharedAcrossModes: darkPalette == null,
  };
}

function neutralReferenceFamily(
  id: keyof typeof NEUTRAL_THEME_PALETTE_REFERENCE,
  name: string,
  kind: 'chromatic' | 'neutral' = 'chromatic',
): ThemeReferenceFamily {
  const palette = NEUTRAL_THEME_PALETTE_REFERENCE[id];
  return {
    id,
    name,
    seed: palette.light[50],
    kind,
    light: tones(palette.light),
    dark: tones(palette.dark),
  };
}

const neutralReferenceFamilies = [
  neutralReferenceFamily('neutral', 'Neutral', 'neutral'),
  neutralReferenceFamily('red', 'Red'),
  neutralReferenceFamily('orange', 'Orange'),
  neutralReferenceFamily('yellow', 'Yellow'),
  neutralReferenceFamily('green', 'Green'),
  neutralReferenceFamily('teal', 'Teal'),
  neutralReferenceFamily('cyan', 'Cyan'),
  neutralReferenceFamily('blue', 'Blue'),
  neutralReferenceFamily('purple', 'Purple'),
  neutralReferenceFamily('pink', 'Pink'),
];

const neutralFamilies = [
  generatedFamily('neutral', 'Neutral', '#e5e5e5', 'neutral'),
  generatedFamily('red', 'Red', '#eb183a'),
  generatedFamily('orange', 'Orange', '#d57113'),
  generatedFamily('yellow', 'Yellow', '#f8c723'),
  generatedFamily('green', 'Green', '#358a3a'),
  generatedFamily('teal', 'Teal', '#0c7365'),
  generatedFamily('cyan', 'Cyan', '#0c6f82'),
  generatedFamily('blue', 'Blue', '#1679fa'),
  generatedFamily('purple', 'Purple', '#980fb2'),
  generatedFamily('pink', 'Pink', '#b10e69'),
];

const stoneFamilies = [
  storedFamily(
    'neutral',
    'Stone Neutral',
    '#e2e2e2',
    stoneModePalettes.neutral.light,
    'neutral',
    stoneModePalettes.neutral.dark,
  ),
  storedFamily(
    'blue',
    'Blue',
    '#d7e4f5',
    stoneModePalettes.blue.light,
    'chromatic',
    stoneModePalettes.blue.dark,
  ),
  storedFamily(
    'cyan',
    'Cyan',
    '#cce8e5',
    stoneModePalettes.cyan.light,
    'chromatic',
    stoneModePalettes.cyan.dark,
  ),
  storedFamily(
    'green',
    'Green',
    '#d0e9ce',
    stoneModePalettes.green.light,
    'chromatic',
    stoneModePalettes.green.dark,
  ),
  storedFamily(
    'teal',
    'Teal',
    '#d4e7dc',
    stoneModePalettes.teal.light,
    'chromatic',
    stoneModePalettes.teal.dark,
  ),
  storedFamily(
    'yellow',
    'Yellow',
    '#f4e1b7',
    stoneModePalettes.yellow.light,
    'chromatic',
    stoneModePalettes.yellow.dark,
  ),
  storedFamily(
    'orange',
    'Orange',
    '#ffdcbb',
    stoneModePalettes.orange.light,
    'chromatic',
    stoneModePalettes.orange.dark,
  ),
  storedFamily(
    'red',
    'Red',
    '#f9dcd7',
    stoneModePalettes.red.light,
    'chromatic',
    stoneModePalettes.red.dark,
  ),
  storedFamily(
    'pink',
    'Pink',
    '#f0dde8',
    stoneModePalettes.pink.light,
    'chromatic',
    stoneModePalettes.pink.dark,
  ),
  storedFamily(
    'purple',
    'Purple',
    '#e8dff3',
    stoneModePalettes.purple.light,
    'chromatic',
    stoneModePalettes.purple.dark,
  ),
];

const gothicFamilies = [
  storedFamily(
    'neutral',
    'Gothic Neutral',
    '#5d646b',
    gothicModePalettes.neutral.dark,
    'neutral',
  ),
  storedFamily('green', 'Green', '#779e5d', gothicModePalettes.green.dark),
  storedFamily('red', 'Red', '#7d5e51', gothicModePalettes.red.dark),
  storedFamily('yellow', 'Yellow', '#cca74c', gothicModePalettes.yellow.dark),
  storedFamily('blue', 'Blue', '#6170bf', gothicModePalettes.blue.dark),
  storedFamily('purple', 'Purple', '#a363bd', gothicModePalettes.purple.dark),
  storedFamily('pink', 'Pink', '#b15876', gothicModePalettes.pink.dark),
  storedFamily('cyan', 'Cyan', '#6a9eb1', gothicModePalettes.cyan.dark),
  storedFamily('orange', 'Orange', '#c87a4a', gothicModePalettes.orange.dark),
  storedFamily('teal', 'Teal', '#5aa091', gothicModePalettes.teal.dark),
].map(family => ({...family, light: undefined, sharedAcrossModes: false}));

const y2kFamilies = [
  storedFamily(
    'neutral',
    'Y2K Neutral',
    '#fff6ed',
    y2kModePalettes.neutral.light,
    'neutral',
    y2kModePalettes.neutral.dark,
  ),
  storedFamily(
    'accent',
    'Periwinkle',
    '#cccffa',
    y2kModePalettes.accent.light,
    'chromatic',
    y2kModePalettes.accent.dark,
  ),
  storedFamily(
    'red',
    'Red',
    '#ff6f7a',
    y2kModePalettes.red.light,
    'chromatic',
    y2kModePalettes.red.dark,
  ),
  storedFamily(
    'orange',
    'Orange',
    '#ff9f4a',
    y2kModePalettes.orange.light,
    'chromatic',
    y2kModePalettes.orange.dark,
  ),
  storedFamily(
    'yellow',
    'Yellow',
    '#ffd34f',
    y2kModePalettes.yellow.light,
    'chromatic',
    y2kModePalettes.yellow.dark,
  ),
  storedFamily(
    'green',
    'Green',
    '#c5e17a',
    y2kModePalettes.green.light,
    'chromatic',
    y2kModePalettes.green.dark,
  ),
  storedFamily(
    'teal',
    'Teal',
    '#48c99a',
    y2kModePalettes.teal.light,
    'chromatic',
    y2kModePalettes.teal.dark,
  ),
  storedFamily(
    'cyan',
    'Cyan',
    '#42d4d0',
    y2kModePalettes.cyan.light,
    'chromatic',
    y2kModePalettes.cyan.dark,
  ),
  storedFamily(
    'blue',
    'Blue',
    '#00a8ff',
    y2kModePalettes.blue.light,
    'chromatic',
    y2kModePalettes.blue.dark,
  ),
  storedFamily(
    'purple',
    'Purple',
    '#a589ff',
    y2kModePalettes.purple.light,
    'chromatic',
    y2kModePalettes.purple.dark,
  ),
  storedFamily(
    'pink',
    'Pink',
    '#ff72b6',
    y2kModePalettes.pink.light,
    'chromatic',
    y2kModePalettes.pink.dark,
  ),
];

const butterFamilies = [
  storedFamily(
    'accent',
    'Accent',
    '#225bff',
    butterModePalettes.accent.light,
    'chromatic',
    butterModePalettes.accent.dark,
  ),
  storedFamily(
    'neutral',
    'Gray',
    '#868b99',
    butterModePalettes.neutral.light,
    'neutral',
    butterModePalettes.neutral.dark,
  ),
  storedFamily(
    'red',
    'Red',
    '#ff7553',
    butterModePalettes.red.light,
    'chromatic',
    butterModePalettes.red.dark,
  ),
  storedFamily(
    'orange',
    'Orange',
    '#ffa347',
    butterModePalettes.orange.light,
    'chromatic',
    butterModePalettes.orange.dark,
  ),
  storedFamily(
    'yellow',
    'Yellow',
    '#edd64b',
    butterModePalettes.yellow.light,
    'chromatic',
    butterModePalettes.yellow.dark,
  ),
  storedFamily(
    'green',
    'Green',
    '#5dce5f',
    butterModePalettes.green.light,
    'chromatic',
    butterModePalettes.green.dark,
  ),
  storedFamily(
    'cyan',
    'Cyan',
    '#60cfd3',
    butterModePalettes.cyan.light,
    'chromatic',
    butterModePalettes.cyan.dark,
  ),
  storedFamily(
    'teal',
    'Teal',
    '#6cd9a8',
    butterModePalettes.teal.light,
    'chromatic',
    butterModePalettes.teal.dark,
  ),
  storedFamily(
    'blue',
    'Blue',
    '#5681ff',
    butterModePalettes.blue.light,
    'chromatic',
    butterModePalettes.blue.dark,
  ),
  storedFamily(
    'purple',
    'Purple',
    '#b780f6',
    butterModePalettes.purple.light,
    'chromatic',
    butterModePalettes.purple.dark,
  ),
  storedFamily(
    'pink',
    'Pink',
    '#f680e8',
    butterModePalettes.pink.light,
    'chromatic',
    butterModePalettes.pink.dark,
  ),
];

export const THEME_REFERENCES: ThemeReference[] = [
  {
    id: 'neutral-pr-5628',
    name: 'Neutral — PR #5628',
    description:
      'Exact approved higher-chroma light and dark ramps merged in PR #5628.',
    referenceKind: 'stored',
    suggestedVibrancy: {oklch: 66, hct: 49, compare: 61},
    modes: ['light', 'dark'],
    families: neutralReferenceFamilies,
  },
  {
    id: 'neutral-legacy',
    name: 'Neutral — legacy preview',
    description:
      'Existing HCT-generated reference ramps used by the Neutral preview.',
    referenceKind: 'legacy-generated',
    suggestedVibrancy: {oklch: 71, hct: 71, compare: 71},
    modes: ['light', 'dark'],
    families: neutralFamilies,
  },
  {
    id: 'stone',
    name: 'Stone',
    description: 'Stored hand-tuned warm stone ramps.',
    referenceKind: 'stored',
    suggestedVibrancy: {oklch: 12, hct: 9, compare: 10},
    modes: ['light', 'dark'],
    families: stoneFamilies,
  },
  {
    id: 'gothic',
    name: 'Gothic',
    description: 'Stored dark-only muted gem-tone ramps.',
    referenceKind: 'stored',
    suggestedVibrancy: {oklch: 36, hct: 23, compare: 30},
    modes: ['dark'],
    families: gothicFamilies,
  },
  {
    id: 'y2k',
    name: 'Y2K',
    description: 'Stored high-chroma pastel pop ramps.',
    referenceKind: 'stored',
    suggestedVibrancy: {oklch: 72, hct: 53, compare: 72},
    modes: ['light', 'dark'],
    families: y2kFamilies,
  },
  {
    id: 'butter',
    name: 'Butter',
    description: 'Stored branded pastel ramps.',
    referenceKind: 'stored',
    suggestedVibrancy: {oklch: 24, hct: 22, compare: 23},
    modes: ['light', 'dark'],
    families: butterFamilies,
  },
];
