// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {gothicTheme} from '@astryxdesign/theme-gothic/built';
import {palette as gothicModePalettes} from '../../../../../../../packages/themes/gothic/src/gothicPalettes.generated';
import {ThemePalettePreview} from '@/components/ThemePalettePreview';
import type {TonalColor} from '@/components/ThemePalettePreview';

const GOTHIC =
  '"Manufacturing Consent", "UnifrakturMaguntia", "Old English Text MT", serif';

// Gothic is dark-only: preview the reviewed dark ramps the maintained theme
// consumes, not the frozen public compatibility snapshot.
const TONAL_COLORS: TonalColor[] = [
  {
    name: 'Gothic Neutral',
    sourceHex: '#5D646B',
    tones: gothicModePalettes.neutral.dark,
  },
  {
    name: 'Green',
    sourceHex: '#779E5D',
    semantic: 'Success / forest moss',
    tones: gothicModePalettes.green.dark,
  },
  {
    name: 'Red',
    sourceHex: '#7D5E51',
    semantic: 'Error / blood crimson',
    tones: gothicModePalettes.red.dark,
  },
  {
    name: 'Yellow',
    sourceHex: '#CCA74C',
    semantic: 'Warning / aged gold',
    tones: gothicModePalettes.yellow.dark,
  },
  {
    name: 'Blue',
    sourceHex: '#6170BF',
    tones: gothicModePalettes.blue.dark,
  },
  {
    name: 'Purple',
    sourceHex: '#A363BD',
    tones: gothicModePalettes.purple.dark,
  },
  {
    name: 'Pink',
    sourceHex: '#B15876',
    tones: gothicModePalettes.pink.dark,
  },
  {
    name: 'Cyan',
    sourceHex: '#6A9EB1',
    tones: gothicModePalettes.cyan.dark,
  },
  {
    name: 'Orange',
    sourceHex: '#C87A4A',
    tones: gothicModePalettes.orange.dark,
  },
  {
    name: 'Teal',
    sourceHex: '#5AA091',
    tones: gothicModePalettes.teal.dark,
  },
];

const CORE = [
  {hex: '#101314', name: 'Body / Surface'},
  {hex: '#191D20', name: 'Card'},
  {hex: '#24292D', name: 'Popover'},
  {hex: '#495056', name: 'Border emp.'},
  {hex: '#96A0AB', name: 'Text secondary'},
  {hex: '#E8F1F6', name: 'Text primary'},
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
      <h3 style={sectionTitle}>Display Text (Manufacturing Consent)</h3>
      <VStack gap={2}>
        <span
          style={{
            fontFamily: GOTHIC,
            fontSize: 72,
            fontWeight: 400,
            lineHeight: 1.1,
          }}>
          Display 1
        </span>
        <span
          style={{
            fontFamily: GOTHIC,
            fontSize: 56,
            fontWeight: 400,
            lineHeight: 1.15,
          }}>
          Display 2
        </span>
        <span
          style={{
            fontFamily: GOTHIC,
            fontSize: 44,
            fontWeight: 400,
            lineHeight: 1.2,
          }}>
          Display 3
        </span>
        <span
          style={{
            fontFamily: GOTHIC,
            fontSize: 36,
            fontWeight: 400,
            lineHeight: 1.25,
            color: 'var(--color-text-secondary)',
            marginTop: 12,
          }}>
          Little joys, everywhere you go
        </span>
      </VStack>
    </div>
  );
}

export default function GothicPalettePage() {
  return (
    <ThemePalettePreview
      theme={gothicTheme}
      title="Gothic Theme Palette"
      subtitle="Dark-only theme: deep blue-gray surfaces, distressed display heading, pastel categorical accents that glow against the dark page like illuminated panels."
      tonalColors={TONAL_COLORS}
      coreSwatches={CORE}
      singleMode="dark"
      leadingExtras={<DisplayTextSection />}
    />
  );
}
