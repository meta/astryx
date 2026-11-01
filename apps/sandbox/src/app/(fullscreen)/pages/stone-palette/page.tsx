// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {stoneTheme} from '@astryxdesign/theme-stone/built';
import {palette as stoneModePalettes} from '../../../../../../../packages/themes/stone/src/stonePalettes.generated';
import {ThemePalettePreview} from '@/components/ThemePalettePreview';
import type {TonalColor} from '@/components/ThemePalettePreview';

const MONTSERRAT =
  '"Montserrat", "Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Pass Stone's explicit light and dark ramps so the preview and audit drawer
// use the reviewed mode-aware values instead of the legacy shared-ramp alias.
const TONAL_COLORS: TonalColor[] = [
  {
    name: 'Stone Neutral',
    sourceHex: '#e2e2e2',
    tones: stoneModePalettes.neutral.light,
    dark: {tones: stoneModePalettes.neutral.dark},
  },
  {
    name: 'Blue',
    sourceHex: '#d7e4f5',
    tones: stoneModePalettes.blue.light,
    dark: {tones: stoneModePalettes.blue.dark},
  },
  {
    name: 'Cyan',
    sourceHex: '#cce8e5',
    tones: stoneModePalettes.cyan.light,
    dark: {tones: stoneModePalettes.cyan.dark},
  },
  {
    name: 'Green',
    sourceHex: '#d0e9ce',
    semantic: 'Success',
    tones: stoneModePalettes.green.light,
    dark: {tones: stoneModePalettes.green.dark},
  },
  {
    name: 'Teal',
    sourceHex: '#d4e7dc',
    tones: stoneModePalettes.teal.light,
    dark: {tones: stoneModePalettes.teal.dark},
  },
  {
    name: 'Yellow',
    sourceHex: '#f4e1b7',
    semantic: 'Warning',
    tones: stoneModePalettes.yellow.light,
    dark: {tones: stoneModePalettes.yellow.dark},
  },
  {
    name: 'Orange',
    sourceHex: '#ffdcbb',
    tones: stoneModePalettes.orange.light,
    dark: {tones: stoneModePalettes.orange.dark},
  },
  {
    name: 'Red',
    sourceHex: '#f9dcd7',
    semantic: 'Error',
    tones: stoneModePalettes.red.light,
    dark: {tones: stoneModePalettes.red.dark},
  },
  {
    name: 'Pink',
    sourceHex: '#f0dde8',
    tones: stoneModePalettes.pink.light,
    dark: {tones: stoneModePalettes.pink.dark},
  },
  {
    name: 'Purple',
    sourceHex: '#e8dff3',
    tones: stoneModePalettes.purple.light,
    dark: {tones: stoneModePalettes.purple.dark},
  },
];

const CORE = [
  {hex: '#28282A', name: 'Stone 900'},
  {hex: '#84848B', name: 'Stone 500'},
  {hex: '#D8D8DB', name: 'Stone 300'},
  {hex: '#f3f3f5', name: 'Stone 100'},
  {hex: '#FFFFFF', name: 'White'},
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
      <h3 style={sectionTitle}>Display Text (Montserrat)</h3>
      <VStack gap={2}>
        <span
          style={{
            fontFamily: MONTSERRAT,
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}>
          Display 1
        </span>
        <span
          style={{
            fontFamily: MONTSERRAT,
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
          }}>
          Display 2
        </span>
        <span
          style={{
            fontFamily: MONTSERRAT,
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
          }}>
          Display 3
        </span>
        <span
          style={{
            fontFamily: MONTSERRAT,
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.3,
            color: 'var(--color-text-secondary)',
            marginTop: 12,
          }}>
          Quietly hewn from sand and time
        </span>
      </VStack>
    </div>
  );
}

export default function StonePalettePage() {
  return (
    <ThemePalettePreview
      theme={stoneTheme}
      title="Stone Theme Palette"
      subtitle="A warm, earthy neutral theme inspired by natural stone and sandstone. Light mode uses pastel T90 surfaces with T30 text; dark mode uses T35 surfaces with T90 text, same hex as the light-mode pastel, clean palette symmetry. Montserrat for headings and display, Figtree for body, JetBrains Mono for code."
      tonalColors={TONAL_COLORS}
      coreSwatches={CORE}
      leadingExtras={<DisplayTextSection />}
      shadowDescription="Three shadow levels: warm, low-alpha drop shadow stack using Stone 900. Plain drops in both modes (no inset bezel); dark surfaces lift via a slightly lighter card token rather than a shadow rim."
    />
  );
}
