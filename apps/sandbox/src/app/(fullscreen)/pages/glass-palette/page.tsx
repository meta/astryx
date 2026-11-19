// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {glassTheme} from '@astryxdesign/theme-glass/built';
import {palette as glassModePalettes} from '../../../../../../../packages/themes/glass/src/glassPalettes.generated';
import {ThemePalettePreview} from '@/components/ThemePalettePreview';
import type {TonalColor} from '@/components/ThemePalettePreview';

// Glass is dark-only: preview the dark ramps the theme consumes.
const TONAL_COLORS: TonalColor[] = [
  {
    name: 'Glass Navy',
    sourceHex: '#5C6688',
    tones: glassModePalettes.neutral.dark,
  },
  {
    name: 'Blue',
    sourceHex: '#6EA8FF',
    semantic: 'Accent / info',
    tones: glassModePalettes.blue.dark,
  },
  {
    name: 'Green',
    sourceHex: '#5BD67F',
    semantic: 'Success',
    tones: glassModePalettes.green.dark,
  },
  {
    name: 'Yellow',
    sourceHex: '#FFD25E',
    semantic: 'Warning',
    tones: glassModePalettes.yellow.dark,
  },
  {
    name: 'Red',
    sourceHex: '#FF6B6B',
    semantic: 'Error',
    tones: glassModePalettes.red.dark,
  },
  {
    name: 'Cyan',
    sourceHex: '#4FD8EE',
    tones: glassModePalettes.cyan.dark,
  },
  {
    name: 'Teal',
    sourceHex: '#3FD6BD',
    tones: glassModePalettes.teal.dark,
  },
  {
    name: 'Purple',
    sourceHex: '#B18CFF',
    tones: glassModePalettes.purple.dark,
  },
  {
    name: 'Pink',
    sourceHex: '#FF7FA0',
    tones: glassModePalettes.pink.dark,
  },
  {
    name: 'Orange',
    sourceHex: '#FFA25E',
    tones: glassModePalettes.orange.dark,
  },
];

const CORE = [
  {hex: '#060A17', name: 'Body / Surface'},
  {hex: '#0E1630', name: 'Card'},
  {hex: '#141D3C', name: 'Popover'},
  {hex: '#6EA8FF', name: 'Accent'},
  {hex: '#98A3C7', name: 'Text secondary'},
  {hex: '#EEF1FF', name: 'Text primary'},
];

export default function GlassPalettePage() {
  return (
    <ThemePalettePreview
      theme={glassTheme}
      title="Glass Theme Palette"
      subtitle="Dark-only theme: a deep navy canvas, glass cards with a light top edge, and one vivid hue per colored card."
      tonalColors={TONAL_COLORS}
      coreSwatches={CORE}
      singleMode="dark"
    />
  );
}
