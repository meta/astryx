// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {butterTheme} from '@astryxdesign/theme-butter/built';
import {palette as butterModePalettes} from '../../../../../../../packages/themes/butter/src/butterPalettes.generated';
import {ThemePalettePreview} from '@/components/ThemePalettePreview';
import type {TonalColor} from '@/components/ThemePalettePreview';

const SARINA = "'Sarina', cursive";

// Pass Butter's reviewed mode-aware ramps so the preview and audit drawer show
// the palette the maintained theme actually consumes, not the frozen public
// compatibility snapshot.
const TONAL_COLORS: TonalColor[] = [
  {
    name: 'Brand Blue',
    sourceHex: '#225BFF',
    tones: butterModePalettes.accent.light,
    dark: {tones: butterModePalettes.accent.dark},
  },
  {
    name: 'Butter Neutral',
    sourceHex: '#79786A',
    tones: butterModePalettes.neutral.light,
    dark: {tones: butterModePalettes.neutral.dark},
  },
  {
    name: 'Red',
    sourceHex: '#FF7553',
    semantic: 'Error',
    tones: butterModePalettes.red.light,
    dark: {tones: butterModePalettes.red.dark},
  },
  {
    name: 'Orange',
    sourceHex: '#FFA347',
    tones: butterModePalettes.orange.light,
    dark: {tones: butterModePalettes.orange.dark},
  },
  {
    name: 'Butter Yellow',
    sourceHex: '#FDEE8C',
    semantic: 'Warning',
    tones: butterModePalettes.yellow.light,
    dark: {tones: butterModePalettes.yellow.dark},
  },
  {
    name: 'Green',
    sourceHex: '#5DCE5F',
    semantic: 'Success',
    tones: butterModePalettes.green.light,
    dark: {tones: butterModePalettes.green.dark},
  },
  {
    name: 'Cyan',
    sourceHex: '#60CFD3',
    tones: butterModePalettes.cyan.light,
    dark: {tones: butterModePalettes.cyan.dark},
  },
  {
    name: 'Teal',
    sourceHex: '#6CD9A8',
    tones: butterModePalettes.teal.light,
    dark: {tones: butterModePalettes.teal.dark},
  },
  {
    name: 'Blue',
    sourceHex: '#5681FF',
    tones: butterModePalettes.blue.light,
    dark: {tones: butterModePalettes.blue.dark},
  },
  {
    name: 'Purple',
    sourceHex: '#B780F6',
    tones: butterModePalettes.purple.light,
    dark: {tones: butterModePalettes.purple.dark},
  },
  {
    name: 'Pink',
    sourceHex: '#F680E8',
    tones: butterModePalettes.pink.light,
    dark: {tones: butterModePalettes.pink.dark},
  },
];

const CORE = [
  {hex: '#225BFF', name: '#225BFF', dark: {hex: '#FDEE8C', name: '#FDEE8C'}},
  {hex: '#5681FF', name: '#5681FF', dark: {hex: '#EDD64B', name: '#EDD64B'}},
  {hex: '#FDEE8C', name: '#FDEE8C', dark: {hex: '#725538', name: '#725538'}},
  {hex: '#FDFBE4', name: '#FDFBE4', dark: {hex: '#36261C', name: '#36261C'}},
  {hex: '#FFFFFF', name: '#FFFFFF', dark: {hex: '#261A13', name: '#261A13'}},
];

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  margin: 0,
  marginBottom: 12,
};

function DisplayTextSection() {
  // Brand-blue in light mode, butter yellow in dark mode.
  const displayColor = 'light-dark(#225BFF, #FDEE8C)';
  return (
    <div>
      <h3 style={sectionTitle}>Display Text (Sarina)</h3>
      <VStack gap={2}>
        <span
          style={{
            fontFamily: SARINA,
            fontSize: 83,
            fontWeight: 400,
            lineHeight: 1.15,
            color: displayColor,
          }}>
          Display 1
        </span>
        <span
          style={{
            fontFamily: SARINA,
            fontSize: 67,
            fontWeight: 400,
            lineHeight: 1.15,
            color: displayColor,
          }}>
          Display 2
        </span>
        <span
          style={{
            fontFamily: SARINA,
            fontSize: 53,
            fontWeight: 400,
            lineHeight: 1.2,
            color: displayColor,
          }}>
          Display 3
        </span>
      </VStack>
    </div>
  );
}

export default function ButterPalettePage() {
  return (
    <ThemePalettePreview
      theme={butterTheme}
      title="Butter Theme Palette"
      subtitle="Golden buttery theme with blue accents. Sarina for Display, Outfit for headings and body."
      tonalColors={TONAL_COLORS}
      coreSwatches={CORE}
      leadingExtras={<DisplayTextSection />}
    />
  );
}
