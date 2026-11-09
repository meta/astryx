// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

// =============================================================================
// Y2K Theme Palette Preview
// =============================================================================

import {VStack} from '@astryxdesign/core/Layout';
import {y2kTheme} from '@astryxdesign/theme-y2k/built';
import {palette as y2kModePalettes} from '../../../../../../../packages/themes/y2k/src/y2kPalettes.generated';
import {ThemePalettePreview} from '@/components/ThemePalettePreview';
import type {TonalColor} from '@/components/ThemePalettePreview';

const CRIMSON = "'Crimson Text', Georgia, 'Times New Roman', serif";

// Use the reviewed mode-aware ramps the maintained theme consumes, not the
// frozen public compatibility snapshot.
const TONAL_COLORS: TonalColor[] = [
  {
    name: 'Y2K Neutral',
    sourceHex: '#FFF6ED',
    tones: y2kModePalettes.neutral.light,
    dark: {tones: y2kModePalettes.neutral.dark},
  },
  {
    name: 'Periwinkle',
    sourceHex: '#CCCFFA',
    tones: y2kModePalettes.accent.light,
    dark: {tones: y2kModePalettes.accent.dark},
  },
  {
    name: 'Green',
    sourceHex: '#C5E17A',
    semantic: 'Success',
    tones: y2kModePalettes.green.light,
    dark: {tones: y2kModePalettes.green.dark},
  },
  {
    name: 'Red',
    sourceHex: '#FF6F7A',
    semantic: 'Error',
    tones: y2kModePalettes.red.light,
    dark: {tones: y2kModePalettes.red.dark},
  },
  {
    name: 'Yellow',
    sourceHex: '#FFD34F',
    semantic: 'Warning',
    tones: y2kModePalettes.yellow.light,
    dark: {tones: y2kModePalettes.yellow.dark},
  },
  {
    name: 'Blue',
    sourceHex: '#00A8FF',
    tones: y2kModePalettes.blue.light,
    dark: {tones: y2kModePalettes.blue.dark},
  },
  {
    name: 'Pink',
    sourceHex: '#FF72B6',
    tones: y2kModePalettes.pink.light,
    dark: {tones: y2kModePalettes.pink.dark},
  },
  {
    name: 'Purple',
    sourceHex: '#A589FF',
    tones: y2kModePalettes.purple.light,
    dark: {tones: y2kModePalettes.purple.dark},
  },
  {
    name: 'Cyan',
    sourceHex: '#42D4D0',
    tones: y2kModePalettes.cyan.light,
    dark: {tones: y2kModePalettes.cyan.dark},
  },
  {
    name: 'Orange',
    sourceHex: '#FF9F4A',
    tones: y2kModePalettes.orange.light,
    dark: {tones: y2kModePalettes.orange.dark},
  },
  {
    name: 'Teal',
    sourceHex: '#48C99A',
    tones: y2kModePalettes.teal.light,
    dark: {tones: y2kModePalettes.teal.dark},
  },
];

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  margin: 0,
  marginBottom: 12,
};

function DisplayTextSection() {
  return (
    <div>
      <h3 style={sectionTitle}>Display Text (Crimson Text)</h3>
      <VStack gap={2}>
        <span
          style={{
            fontFamily: CRIMSON,
            fontSize: 83,
            fontWeight: 400,
            lineHeight: 1.15,
          }}>
          Display 1
        </span>
        <span
          style={{
            fontFamily: CRIMSON,
            fontSize: 67,
            fontWeight: 400,
            lineHeight: 1.15,
          }}>
          Display 2
        </span>
        <span
          style={{
            fontFamily: CRIMSON,
            fontSize: 53,
            fontWeight: 400,
            lineHeight: 1.2,
          }}>
          Display 3
        </span>
      </VStack>
    </div>
  );
}

export default function Y2kPalettePage() {
  return (
    <ThemePalettePreview
      theme={y2kTheme}
      title="Y2K Theme Palette"
      subtitle="A bubbly, playful pop theme: hot pink body, lime green accents, Crimson Text headings + Poppins body."
      tonalColors={TONAL_COLORS}
      leadingExtras={<DisplayTextSection />}
    />
  );
}
