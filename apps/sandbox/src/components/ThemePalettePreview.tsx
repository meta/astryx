// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo, useReducer} from 'react';

import {Banner} from '@astryxdesign/core/Banner';
import {Spinner} from '@astryxdesign/core/Spinner';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Switch} from '@astryxdesign/core/Switch';
import {Card} from '@astryxdesign/core/Card';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Theme} from '@astryxdesign/core/theme';
import type {DefinedTheme} from '@astryxdesign/core/theme';
import {LayerProvider} from '@astryxdesign/core/Layer';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';

import {ThemeAuditDrawer, useThemeAudit} from './themePreview/ThemeAuditDrawer';
import {
  buildTonalUsageMap,
  tonalUsageKey,
  type TonalUsageMap,
} from './themePreview/themeAudit';
import {
  buildOverrideCSSVars,
  overridesReducer,
  type OverridesMap,
  type SerializeContext,
} from './themePreview/themeOverrides';

// === HCT color space helpers for tonal palettes ===

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').slice(0, 6);
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, s * 255)));
}
function linearRgbToXyz(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}
function xyzToLinearRgb(
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}
const D65: [number, number, number] = [0.95047, 1.0, 1.08883];
function labF(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}
function labFInv(t: number): number {
  const d = 6 / 29;
  return t > d ? t * t * t : 3 * d * d * (t - 4 / 29);
}
function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const fx = labF(x / D65[0]),
    fy = labF(y / D65[1]),
    fz = labF(z / D65[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function labToXyz(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116,
    fx = a / 500 + fy,
    fz = fy - b / 200;
  return [labFInv(fx) * D65[0], labFInv(fy) * D65[1], labFInv(fz) * D65[2]];
}

interface HCT {
  hue: number;
  chroma: number;
  tone: number;
}

function hexToHct(hex: string): HCT {
  const [r, g, b] = hexToRgb(hex);
  const [x, y, z] = linearRgbToXyz(
    srgbToLinear(r),
    srgbToLinear(g),
    srgbToLinear(b),
  );
  const [L, a, bL] = xyzToLab(x, y, z);
  let hue = (Math.atan2(bL, a) * 180) / Math.PI;
  if (hue < 0) {
    hue += 360;
  }
  return {
    hue,
    chroma: Math.sqrt(a * a + bL * bL),
    tone: Math.max(0, Math.min(100, L)),
  };
}

function hctToHex({hue, chroma, tone}: HCT): string {
  if (tone <= 0) {
    return '#000000';
  }
  if (tone >= 100) {
    return '#ffffff';
  }
  if (chroma < 0.5) {
    const y = labFInv((tone + 16) / 116);
    const g = linearToSrgb(y);
    return '#' + [g, g, g].map(c => c.toString(16).padStart(2, '0')).join('');
  }
  let lo = 0,
    hi = chroma,
    best = '#000000';
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const hRad = (hue * Math.PI) / 180;
    const a = Math.cos(hRad) * mid,
      b = Math.sin(hRad) * mid;
    const [x, y, z] = labToXyz(tone, a, b);
    const [lr, lg, lb] = xyzToLinearRgb(x, y, z);
    const r = linearToSrgb(lr),
      g = linearToSrgb(lg),
      bv = linearToSrgb(lb);
    const ok =
      Math.abs(srgbToLinear(r) - lr) < 0.02 &&
      Math.abs(srgbToLinear(g) - lg) < 0.02 &&
      Math.abs(srgbToLinear(bv) - lb) < 0.02 &&
      r >= 0 &&
      r <= 255 &&
      g >= 0 &&
      g <= 255 &&
      bv >= 0 &&
      bv <= 255;
    if (ok) {
      best =
        '#' + [r, g, bv].map(c => c.toString(16).padStart(2, '0')).join('');
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

const TONE_STEPS = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
];

function tonalPalette(hue: number, chroma: number): Record<number, string> {
  const result: Record<number, string> = {};
  const maxChroma = chroma * 1.8;
  for (const t of TONE_STEPS) {
    const boost = t < 50 ? 1 + (50 - t) / 40 : 1;
    result[t] = hctToHex({
      hue,
      chroma: Math.min(chroma * boost, maxChroma),
      tone: t,
    });
  }
  return result;
}

/**
 * Dark-mode tonal palette per the audit rubric in issue #2150 §4:
 *   "Dark palette: chroma reduced ~15% across the ramp"
 *
 * Two transforms vs the canonical light ramp:
 *
 *   1. Tone lift: every stop shifts up by +5 tone units so mid-tones land
 *      brighter against the dark canvas. The lift tapers off between T80
 *      and T95 and is zero at T95+ so the top of the ramp doesn't collapse
 *      into pure white.
 *
 *   2. Chroma reduction: chroma multiplied by 0.85 across the whole ramp
 *      so saturated stops don't vibrate against the dark body — full
 *      saturation reads as neon at low surrounding luminance.
 *
 * Same low-tone chroma boost as the light ramp (low tones get extra
 * chroma so dark colored text stays visibly hued), gamut-clamped per-tone
 * via the binary search inside `hctToHex`.
 */
const DARK_TONE_LIFT = 5;
const DARK_LIFT_TAPER_START = 80;
const DARK_LIFT_TAPER_END = 95;
const DARK_CHROMA_FACTOR = 0.85;
function darkTonalPalette(hue: number, chroma: number): Record<number, string> {
  const adjustedChroma = chroma * DARK_CHROMA_FACTOR;
  const maxChroma = adjustedChroma * 1.8;
  const result: Record<number, string> = {};
  for (const t of TONE_STEPS) {
    let lift = DARK_TONE_LIFT;
    if (t >= DARK_LIFT_TAPER_END) {
      lift = 0;
    } else if (t > DARK_LIFT_TAPER_START) {
      const ratio =
        (DARK_LIFT_TAPER_END - t) /
        (DARK_LIFT_TAPER_END - DARK_LIFT_TAPER_START);
      lift = DARK_TONE_LIFT * ratio;
    }
    const liftedTone = Math.min(100, t + lift);
    const boost = liftedTone < 50 ? 1 + (50 - liftedTone) / 40 : 1;
    result[t] = hctToHex({
      hue,
      chroma: Math.min(adjustedChroma * boost, maxChroma),
      tone: liftedTone,
    });
  }
  return result;
}

/** Pick the per-mode ramp generator. Light keeps the canonical ramp. */
function tonalPaletteForMode(
  hue: number,
  chroma: number,
  mode: Mode,
): Record<number, string> {
  return mode === 'dark'
    ? darkTonalPalette(hue, chroma)
    : tonalPalette(hue, chroma);
}

// =============================================================================
// Types & data
// =============================================================================

export interface TonalColor {
  name: string;
  sourceHex: string;
  semantic?: string;
  note?: string;
  /**
   * Optional pre-computed canonical ramp keyed by tone (0-100).
   *
   * Two purposes, both served by the same field:
   *
   *   1. **Visible ramp accuracy** — when provided, the preview renders
   *      these exact values instead of deriving them from `sourceHex`
   *      via the built-in HCT algorithm, so the displayed strip stays
   *      in sync with the theme's own hand-tuned palette (card/badge
   *      variants visually match).
   *
   *   2. **Audit snap accuracy** — themes with hand-tuned palettes
   *      (stone, gothic, y2k, butter) export `*Palettes` objects whose
   *      values drift from the pure HCT generator by a couple of \u0394E
   *      units. The audit drawer uses these canonical values for
   *      snap-to-ramp matching so tokens whose values come from the
   *      canonical ramp don't show up as "off-ramp".
   *
   * Numeric keys are interpreted as tone steps; non-numeric compatibility
   * metadata is ignored. Pass a family's explicit `light` and `dark` ramps
   * when the theme owns separate mode-aware palette values.
   *
   * Omit for themes that don't carry a custom-tuned ramp — the audit
   * + preview both fall back to generating the ramp from `sourceHex`
   * via HCT, which is correct for those themes (their tokens were
   * generated the same way).
   */
  tones?: Readonly<Record<string | number, string | number>>;
  /**
   * Optional dark-mode overrides. When present, these values replace
   * `sourceHex` and `tones` in the dark mode column — allowing fully
   * curated per-mode tonal ramps without duplicating the full array.
   */
  dark?: {
    sourceHex?: string;
    tones?: Readonly<Record<string | number, string | number>>;
  };
}

export interface CoreSwatch {
  hex: string;
  name: string;
  /** Optional dark-mode override. When present, replaces hex and name in the dark column. */
  dark?: {hex: string; name: string};
}

export interface ThemePalettePreviewProps {
  /** The Astryx theme object */
  theme: DefinedTheme;
  /** Theme display name for the page title */
  title: string;
  /** Description subtitle */
  subtitle: string;
  /** Tonal color data for ramp display */
  tonalColors: TonalColor[];
  /** Core palette swatches. When omitted, the Core Palette section is hidden. */
  coreSwatches?: CoreSwatch[];
  /** Additional sections to render at the end of each mode column */
  extraSections?: React.ReactNode;
  /** Additional sections to render before the headers (TextRampSection) in each mode column */
  leadingExtras?: React.ReactNode;
  /** Hide the title, subtitle, and tonal section (useful when embedded in another layout) */
  componentPreviewOnly?: boolean;
  /**
   * Render only one mode column instead of side-by-side light + dark.
   * Useful for single-mode themes (e.g. dark-only) where both columns
   * would render identically.
   */
  singleMode?: Mode;
  /**
   * Optional theme-specific paragraph rendered under the "Elevations"
   * section heading. Use this to describe the shadow design (e.g. "deepened
   * drop with all-around 1px white inset for a Figma-style bezel" for
   * neutral; "warm, low-alpha drop shadow stack" for stone). Defaults to a
   * generic description that's accurate for any theme.
   */
  shadowDescription?: string;
}

type Mode = 'light' | 'dark';

const VAR_SURFACES = {
  body: 'var(--color-background-body)',
  surface: 'var(--color-background-surface)',
  card: 'var(--color-background-card)',
  popover: 'var(--color-background-popover)',
  border: 'var(--color-border)',
  borderEmphasized: 'var(--color-border-emphasized)',
  textPrimary: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  accent: 'var(--color-accent)',
  onAccent: 'var(--color-on-accent)',
};

// =============================================================================
// Styles
// =============================================================================

const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-background-body)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-body)',
    padding: '40px 32px',
  } satisfies React.CSSProperties,
  inner: {
    maxWidth: 1280,
    margin: '0 auto',
  } satisfies React.CSSProperties,
  title: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: 0,
    marginBottom: 8,
    fontFamily: 'var(--font-family-heading)',
  } satisfies React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: 'var(--color-text-secondary)',
    margin: 0,
    marginBottom: 32,
  } satisfies React.CSSProperties,
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
  } satisfies React.CSSProperties,
  modeCol: (bg: string, fg: string): React.CSSProperties => ({
    background: bg,
    color: fg,
    border: '1px solid var(--color-border)',
    borderRadius: 16,
    padding: 24,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 28,
  }),
  modeLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: 0,
    marginBottom: 16,
    opacity: 0.6,
  } satisfies React.CSSProperties,
  section: {} satisfies React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
    marginBottom: 12,
  } satisfies React.CSSProperties,
  coreRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 10,
  } satisfies React.CSSProperties,
  coreSwatch: (bg: string): React.CSSProperties => ({
    background: bg,
    borderRadius: 10,
    border: '1px solid light-dark(rgba(0,0,0,0.08), rgba(255,255,255,0.15))',
    height: 88,
  }),
  coreMeta: {
    marginTop: 6,
    fontFamily: MONO,
    fontSize: 10,
    lineHeight: 1.4,
    opacity: 0.7,
  } satisfies React.CSSProperties,
  surfacesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 8,
  } satisfies React.CSSProperties,
  surfaceCell: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  } satisfies React.CSSProperties,
  surfaceSwatch: (bg: string, ring: string): React.CSSProperties => ({
    height: 56,
    background: bg,
    borderRadius: 8,
    border: `1px solid ${ring}`,
  }),
  surfaceMeta: {
    fontFamily: MONO,
    fontSize: 9.5,
    lineHeight: 1.3,
    opacity: 0.7,
  } satisfies React.CSSProperties,
  tonalRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  } satisfies React.CSSProperties,
  tonalLabel: {
    width: 80,
    flexShrink: 0,
    fontSize: 10,
    fontFamily: MONO,
    opacity: 0.7,
  } satisfies React.CSSProperties,
  tonalStrip: {
    display: 'flex',
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.06)',
  } satisfies React.CSSProperties,
  tonalCell: (bg: string): React.CSSProperties => ({
    flex: 1,
    height: 36,
    background: bg,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 2,
  }),
  tonalNum: (tone: number): React.CSSProperties => ({
    fontSize: 7,
    fontFamily: MONO,
    color: tone >= 50 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)',
    pointerEvents: 'none' as const,
  }),
  tonalHct: {
    width: 60,
    flexShrink: 0,
    fontSize: 9,
    fontFamily: MONO,
    opacity: 0.5,
    textAlign: 'right' as const,
  } satisfies React.CSSProperties,
  markerDot: (tone: number): React.CSSProperties => ({
    position: 'absolute' as const,
    top: 2,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: 8,
    height: 8,
    paddingInline: 2,
    borderRadius: 999,
    border: `1.5px solid ${tone >= 50 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)'}`,
    background: tone >= 50 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  }),
  // Pill shows the token count when more than one token snaps to the same
  // tone step. Stays inside the marker dot so the strip layout is unchanged.
  markerCount: (tone: number): React.CSSProperties => ({
    fontSize: 7.5,
    fontWeight: 700,
    fontFamily: MONO,
    color: tone >= 50 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
    pointerEvents: 'none' as const,
  }),
};

// =============================================================================
// Section components
// =============================================================================

function CoreSection({swatches, mode}: {swatches: CoreSwatch[]; mode?: Mode}) {
  const isDark = mode === 'dark';
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Core Palette</h3>
      <div style={S.coreRow}>
        {swatches.map(c => {
          const hex = (isDark && c.dark?.hex) || c.hex;
          const name = (isDark && c.dark?.name) || c.name;
          return (
            <div key={hex}>
              <div style={S.coreSwatch(hex)} />
              <div style={S.coreMeta}>{name && <div>{name}</div>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextRampSection() {
  const base = 14;
  const ratio = 1.25;
  const sizes = {
    h1: (base * ratio ** 4).toFixed(1),
    h2: (base * ratio ** 3).toFixed(1),
    h3: (base * ratio ** 2).toFixed(1),
    h4: (base * ratio ** 1).toFixed(1),
    body: base.toFixed(1),
    supporting: '12.0',
  };
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Text Hierarchy (1.25 scale, 14px base)</h3>
      <VStack gap={2}>
        <HStack gap={2} vAlign="end">
          <Heading level={1}>Heading 1</Heading>
          <Text type="supporting" color="secondary">
            {sizes.h1}px
          </Text>
        </HStack>
        <HStack gap={2} vAlign="end">
          <Heading level={2}>Heading 2</Heading>
          <Text type="supporting" color="secondary">
            {sizes.h2}px
          </Text>
        </HStack>
        <HStack gap={2} vAlign="end">
          <Heading level={3}>Heading 3</Heading>
          <Text type="supporting" color="secondary">
            {sizes.h3}px
          </Text>
        </HStack>
        <HStack gap={2} vAlign="end">
          <Heading level={4}>Heading 4</Heading>
          <Text type="supporting" color="secondary">
            {sizes.h4}px
          </Text>
        </HStack>
        <HStack gap={2} vAlign="end">
          <Text type="body">Body — primary</Text>
          <Text type="supporting" color="secondary">
            {sizes.body}px
          </Text>
        </HStack>
        <HStack gap={2} vAlign="end">
          <Text type="body" color="secondary">
            Body — secondary
          </Text>
          <Text type="supporting" color="secondary">
            {sizes.body}px
          </Text>
        </HStack>
        <HStack gap={2} vAlign="end">
          <Text type="supporting">Supporting</Text>
          <Text type="supporting" color="secondary">
            {sizes.supporting}px
          </Text>
        </HStack>
        <HStack gap={2} vAlign="end">
          <Text type="body" color="disabled">
            Disabled
          </Text>
          <Text type="supporting" color="secondary">
            {sizes.body}px
          </Text>
        </HStack>
      </VStack>
    </div>
  );
}

function SemanticBadgeSection() {
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Semantic Badges</h3>
      <HStack gap={2} wrap="wrap">
        <Badge variant="success" label="Success" />
        <Badge variant="error" label="Error" />
        <Badge variant="warning" label="Warning" />
        <Badge variant="info" label="Info" />
        <Badge variant="neutral" label="Neutral" />
      </HStack>
    </div>
  );
}

function CategoricalBadgeSection() {
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Categorical Badges</h3>
      <HStack gap={2} wrap="wrap">
        <Badge variant="blue" label="Blue" />
        <Badge variant="cyan" label="Cyan" />
        <Badge variant="green" label="Green" />
        <Badge variant="orange" label="Orange" />
        <Badge variant="pink" label="Pink" />
        <Badge variant="purple" label="Purple" />
        <Badge variant="red" label="Red" />
        <Badge variant="teal" label="Teal" />
        <Badge variant="yellow" label="Yellow" />
      </HStack>
    </div>
  );
}

function ButtonSection() {
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Buttons</h3>
      <VStack gap={4}>
        <div>
          <div
            style={{
              fontSize: 10,
              fontFamily: MONO,
              opacity: 0.6,
              marginBottom: 6,
            }}>
            Default
          </div>
          <HStack gap={3} vAlign="center">
            <Button label="Primary" variant="primary" />
            <Button label="Secondary" variant="secondary" />
            <Button label="Ghost" variant="ghost" />
            <Button label="Destructive" variant="destructive" />
          </HStack>
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              fontFamily: MONO,
              opacity: 0.6,
              marginBottom: 6,
            }}>
            Disabled
          </div>
          <HStack gap={3} vAlign="center">
            <Button label="Primary" variant="primary" isDisabled />
            <Button label="Secondary" variant="secondary" isDisabled />
            <Button label="Ghost" variant="ghost" isDisabled />
            <Button label="Destructive" variant="destructive" isDisabled />
          </HStack>
        </div>
      </VStack>
    </div>
  );
}

function SpinnerSection() {
  return (
    <div>
      <h3 style={S.sectionTitle}>Spinners</h3>
      <HStack gap={4} vAlign="center">
        <Spinner size="sm" />
        <Spinner size="md" />
        <Spinner size="lg" />
      </HStack>
    </div>
  );
}

function ProgressBarSection() {
  return (
    <div>
      <h3 style={S.sectionTitle}>Progress</h3>
      <VStack gap={3}>
        <ProgressBar value={75} label="Progress" hasValueLabel />
        <ProgressBar
          value={40}
          label="Upload"
          variant="success"
          hasValueLabel
        />
        <ProgressBar
          value={90}
          label="Storage"
          variant="warning"
          hasValueLabel
        />
        <ProgressBar isIndeterminate label="Loading..." />
      </VStack>
    </div>
  );
}

function CheckboxRadioSwitchSection() {
  return (
    <div>
      <h3 style={S.sectionTitle}>Controls</h3>
      <VStack gap={4}>
        <VStack gap={2}>
          <CheckboxInput
            label="Enable notifications"
            value={true}
            onChange={() => {}}
          />
          <CheckboxInput
            label="Auto-save drafts"
            value={false}
            onChange={() => {}}
          />
          <CheckboxInput
            label="Show previews"
            value={true}
            onChange={() => {}}
            isDisabled
          />
        </VStack>
        <RadioList label="Display mode" value="comfortable" onChange={() => {}}>
          <RadioListItem value="compact" label="Compact" />
          <RadioListItem value="comfortable" label="Comfortable" />
          <RadioListItem value="spacious" label="Spacious" />
        </RadioList>
        <VStack gap={2}>
          <Switch label="Dark mode" value={true} onChange={() => {}} />
          <Switch label="Reduce motion" value={false} onChange={() => {}} />
          <Switch
            label="High contrast"
            value={false}
            onChange={() => {}}
            isDisabled
          />
        </VStack>
      </VStack>
    </div>
  );
}

const CARD_VARIANTS = [
  'default',
  'muted',
  'blue',
  'cyan',
  'gray',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
] as const;

function CardVariantsSection() {
  return (
    <div>
      <h3 style={S.sectionTitle}>Card Variants</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
        }}>
        {CARD_VARIANTS.map(v => (
          <Card key={v} variant={v} padding={2}>
            <Text type="supporting" weight="bold">
              {v}
            </Text>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SurfacesSection({mode}: {mode: Mode}) {
  const ring = mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const cells = [
    {label: 'border', hex: VAR_SURFACES.border},
    {label: 'border-emp', hex: VAR_SURFACES.borderEmphasized},
    {label: 'surface', hex: VAR_SURFACES.surface},
    {label: 'body', hex: VAR_SURFACES.body},
    {label: 'card', hex: VAR_SURFACES.card},
    {label: 'popover', hex: VAR_SURFACES.popover},
  ];
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Borders & Surfaces</h3>
      <div style={S.surfacesGrid}>
        {cells.map(c => (
          <div key={c.label} style={S.surfaceCell}>
            <div style={S.surfaceSwatch(c.hex, ring)} />
            <div style={S.surfaceMeta}>
              <div>{c.label}</div>
              <div>{c.hex}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Three shadow levels (low / med / high) rendered as cards over body so
 * the cast shadows have a surface to read against. Each sample is annotated
 * with the components that consume that level — keeps the elevation
 * vocabulary visible alongside the visual treatment.
 *
 * Dark mode swaps the elevated card to `--color-background-surface` (T15)
 * so the inset rim used by the figma-style shadow tokens has a slightly
 * lighter base to catch; light mode keeps a white card.
 */
const DEFAULT_SHADOW_DESCRIPTION =
  'Three shadow levels mapped to the components that use them.';

function ElevationsSection({
  mode,
  description = DEFAULT_SHADOW_DESCRIPTION,
}: {
  mode: Mode;
  description?: string;
}) {
  const levels = [
    {
      label: 'Low — popovers / dropdowns / composer',
      shadow: 'var(--shadow-low)',
      consumers:
        'Popover, TopNav mega menu, SegmentedControl item, ChatComposer (resting)',
    },
    {
      label: 'Medium — hover / floating',
      shadow: 'var(--shadow-med)',
      consumers:
        'HoverCard, Toast, Carousel scroll button, Chat scroll button, Thumbnail (hover), ChatComposer (hover/focus)',
    },
    {
      label: 'High — modal / dialog',
      shadow: 'var(--shadow-high)',
      consumers: 'Dialog',
    },
  ];

  const elevatedBg =
    mode === 'light' ? '#ffffff' : 'var(--color-background-surface)';
  const cardStyle = (shadow: string): React.CSSProperties => ({
    backgroundColor: elevatedBg,
    color: 'var(--color-text-primary)',
    padding: 16,
    borderRadius: 12,
    boxShadow: shadow,
    fontFamily: 'var(--font-family-body)',
    fontSize: 13,
    flex: 1,
    minWidth: 220,
    minHeight: 88,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Elevations</h3>
      <p
        style={{
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          margin: 0,
          marginBottom: 12,
        }}>
        {description}
      </p>
      <div
        style={{
          background: 'var(--color-background-body)',
          padding: 32,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}>
        {levels.map(l => (
          <div
            key={l.label}
            style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            <div style={cardStyle(l.shadow)}>{l.label}</div>
            <div
              style={{
                fontSize: 10,
                fontFamily: MONO,
                color: 'var(--color-text-secondary)',
                paddingLeft: 4,
              }}>
              Consumed by: {l.consumers}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BannerSection() {
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Banners</h3>
      <VStack gap={2}>
        <Banner
          status="info"
          title="Info banner title"
          description="Description text for the info state."
        />
        <Banner
          status="success"
          title="Success banner title"
          description="Description text for the success state."
        />
        <Banner
          status="warning"
          title="Warning banner title"
          description="Description text for the warning state."
        />
        <Banner
          status="error"
          title="Error banner title"
          description="Description text for the error state."
        />
      </VStack>
    </div>
  );
}

function InputSection() {
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Inputs</h3>
      <VStack gap={3}>
        <TextInput
          label="Default"
          placeholder="Placeholder text"
          value=""
          onChange={() => {}}
        />
        <TextInput
          label="Success"
          value="Valid input"
          onChange={() => {}}
          status={{type: 'success', message: 'Looks good!'}}
        />
        <TextInput
          label="Error"
          value="Invalid input"
          onChange={() => {}}
          status={{type: 'error', message: 'This field is required.'}}
        />
        <TextInput
          label="Warning"
          value="Risky value"
          onChange={() => {}}
          status={{type: 'warning', message: 'This value may cause issues.'}}
        />
        <TextInput
          label="Disabled"
          value="Cannot edit"
          onChange={() => {}}
          isDisabled
        />
      </VStack>
    </div>
  );
}

function TonalSection({
  colors,
  mode = 'light',
  usage,
}: {
  colors: TonalColor[];
  mode?: Mode;
  /** Audit-derived map of which tone steps are consumed by which tokens. */
  usage?: TonalUsageMap;
}) {
  const isDark = mode === 'dark';
  return (
    <div style={{marginBottom: 40}}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          margin: 0,
          marginBottom: 6,
          fontFamily: 'var(--font-family-heading)',
        }}>
        Tonal Palettes
      </h2>
      <p
        style={{
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          margin: 0,
          marginBottom: 20,
        }}>
        Full HCT tonal ramps: 21 perceptually uniform steps from black (T0) to
        white (T100).
        {isDark && (
          <>
            {' '}
            Dark mode applies the audit&apos;s &sect;4 transform (
            <strong>+5 brightness</strong> with taper above T80,{' '}
            <strong>×0.85 chroma</strong>) so saturated stops don&apos;t vibrate
            against the dark canvas.
          </>
        )}{' '}
        {usage
          ? 'Markers ● show tone steps consumed by theme tokens (open the audit drawer for the full report).'
          : 'Badge tokens use T90/T30 (light) and T70/T15 (dark).'}
      </p>
      {colors.map(
        ({name, sourceHex, semantic, note, tones: overrideTones, dark}) => {
          // In dark mode, use per-mode overrides if provided.
          const effectiveSourceHex = (isDark && dark?.sourceHex) || sourceHex;
          const effectiveTones = (isDark && dark?.tones) || overrideTones;
          const hct = hexToHct(effectiveSourceHex);
          const computedTones = tonalPaletteForMode(hct.hue, hct.chroma, mode);
          // Theme override wins when it has a hex for this step; otherwise
          // fall back to the algorithm so the strip is always a full 21-step
          // ramp (no missing cells when the theme defines a subset).
          const resolveTone = (t: number): string => {
            if (effectiveTones) {
              const v = effectiveTones[t];
              if (typeof v === 'string') {
                return v;
              }
            }
            return computedTones[t];
          };
          const steps = TONE_STEPS;
          return (
            <div key={name} style={S.tonalRow}>
              <span style={S.tonalLabel}>
                {name}
                {semantic && (
                  <span style={{display: 'block', fontSize: 8, opacity: 0.5}}>
                    = {semantic}
                  </span>
                )}
                {note && (
                  <span style={{display: 'block', fontSize: 8, opacity: 0.5}}>
                    {note}
                  </span>
                )}
              </span>
              <div style={S.tonalStrip}>
                {steps.map(t => {
                  const hex = resolveTone(t);
                  const usages = usage?.[tonalUsageKey(name, mode, t)] ?? [];
                  // Title summarises which tokens snap to this step (max 4
                  // listed to keep the native tooltip readable on dense ramps).
                  const titleLines = [
                    `${name} T${t}: ${hex}`,
                    ...usages
                      .slice(0, 4)
                      .map(u => `· ${u.name} (\u0394E ${u.deltaE.toFixed(1)})`),
                    usages.length > 4 ? `· +${usages.length - 4} more` : '',
                  ].filter(Boolean);
                  return (
                    <div
                      key={t}
                      style={{
                        ...S.tonalCell(hex),
                        position: 'relative' as const,
                      }}
                      title={titleLines.join('\n')}>
                      <span style={S.tonalNum(t)}>{t}</span>
                      {usages.length > 0 && (
                        <div style={S.markerDot(t)}>
                          {usages.length > 1 && (
                            <span style={S.markerCount(t)}>
                              {usages.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <span style={S.tonalHct}>
                H:{hct.hue.toFixed(0)} C:{hct.chroma.toFixed(0)}
              </span>
            </div>
          );
        },
      )}
      <p
        style={{
          fontSize: 10,
          color: 'var(--color-text-secondary)',
          margin: 0,
          marginTop: 10,
          fontFamily: MONO,
        }}>
        {usage
          ? '● = tone step consumed by a theme token. Number = count when multiple tokens share the same step. Hover any cell for details.'
          : '● = token in use (T15 dark bg · T25 light text · T80 dark text · T90 light bg)'}
      </p>
    </div>
  );
}

function ModeColumn({
  theme,
  mode,
  coreSwatches,
  extraSections,
  leadingExtras,
  shadowDescription,
  overrideVars,
  bare = false,
}: {
  theme: DefinedTheme;
  mode: Mode;
  coreSwatches?: CoreSwatch[];
  extraSections?: React.ReactNode;
  leadingExtras?: React.ReactNode;
  shadowDescription?: string;
  /**
   * Pending-overrides CSS custom properties spread onto the column's
   * outermost styled wrapper *inside* the Theme scope. Required:
   * Theme re-injects the canonical token values on its own scope
   * element, so any `--color-*` overrides applied above Theme would
   * be stomped by the inner theme rules. Putting the overrides
   * inside the theme wrapper (as inline style on a child element)
   * wins via specificity.
   */
  overrideVars?: React.CSSProperties;
  /**
   * When true, render the column as a transparent layout container
   * (no background, border, or padding) — the outer page provides the
   * surface. Used by single-mode previews to avoid a redundant frame.
   */
  bare?: boolean;
}) {
  const columnStyle: React.CSSProperties = bare
    ? {
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }
    : S.modeCol(VAR_SURFACES.body, VAR_SURFACES.textPrimary);

  return (
    <Theme theme={theme} mode={mode}>
      <LayerProvider>
        <div style={{...columnStyle, ...overrideVars}}>
          {!bare && (
            <p style={S.modeLabel}>
              {mode === 'light' ? 'Light Mode' : 'Dark Mode'}
            </p>
          )}
          {coreSwatches && coreSwatches.length > 0 && (
            <CoreSection swatches={coreSwatches} mode={mode} />
          )}
          {leadingExtras}
          <TextRampSection />
          <SemanticBadgeSection />
          <CategoricalBadgeSection />
          <BannerSection />
          <InputSection />
          <ButtonSection />
          <SpinnerSection />
          <ProgressBarSection />
          <CheckboxRadioSwitchSection />
          <CardVariantsSection />
          <SurfacesSection mode={mode} />
          <ElevationsSection mode={mode} description={shadowDescription} />
          {extraSections}
        </div>
      </LayerProvider>
    </Theme>
  );
}

// =============================================================================
// Public component
// =============================================================================

export function ThemePalettePreview({
  theme,
  title,
  subtitle,
  tonalColors,
  coreSwatches,
  extraSections,
  leadingExtras,
  shadowDescription,
  componentPreviewOnly = false,
  singleMode,
}: ThemePalettePreviewProps) {
  const columnsStyle: React.CSSProperties = singleMode
    ? {display: 'block'}
    : S.twoCol;

  // Run audit once per (theme, tonalColors). The drawer reads diff + snap
  // tables; the Tonal section reads `usage` to draw token-driven markers.
  const audit = useThemeAudit(theme, tonalColors);

  // Pending-overrides state lives at the page level (not in the drawer)
  // so we can also feed it into a CSS-variable injection at the page
  // root — that way every component on the page (mode columns + tonal
  // strip) re-renders live as you reassign tokens in the drawer.
  const emptyOverrides = {};
  const [overrides, dispatchOverrides] = useReducer(
    overridesReducer,
    emptyOverrides as OverridesMap,
  );

  // Map of `--token: light-dark(#L, #D)` for every pending override.
  // Spread directly onto the page root so the values cascade into every
  // descendant via CSS custom property inheritance.
  const serializeCtx: SerializeContext = useMemo(() => {
    const map: SerializeContext['currentTokenValues'] = {};
    for (const e of audit.snap) {
      map[e.name] = {light: e.light, dark: e.dark};
    }
    return {currentTokenValues: map};
  }, [audit.snap]);
  const overrideVars = useMemo(
    () => buildOverrideCSSVars(overrides, serializeCtx),
    [overrides, serializeCtx],
  );

  // Tonal markers respect pending overrides — every reassignment shows
  // up as a new marker on the chosen ramp+tone the moment the user
  // changes a dropdown. Auto-detected matches still drive markers for
  // tokens that haven't been edited yet.
  const effectiveUsage = useMemo(
    () => buildTonalUsageMap(audit.snap, overrides),
    [audit.snap, overrides],
  );

  const renderColumns = () => {
    if (singleMode) {
      return (
        <ModeColumn
          theme={theme}
          mode={singleMode}
          coreSwatches={coreSwatches}
          extraSections={extraSections}
          leadingExtras={leadingExtras}
          shadowDescription={shadowDescription}
          overrideVars={overrideVars}
          bare
        />
      );
    }
    return (
      <>
        <ModeColumn
          theme={theme}
          mode="light"
          coreSwatches={coreSwatches}
          extraSections={extraSections}
          leadingExtras={leadingExtras}
          shadowDescription={shadowDescription}
          overrideVars={overrideVars}
        />
        <ModeColumn
          theme={theme}
          mode="dark"
          coreSwatches={coreSwatches}
          extraSections={extraSections}
          leadingExtras={leadingExtras}
          shadowDescription={shadowDescription}
          overrideVars={overrideVars}
        />
      </>
    );
  };

  if (componentPreviewOnly) {
    // Embedded usage (e.g. inside docsite layouts) skips the audit drawer too —
    // hosts that need it can mount <ThemeAuditDrawer> separately.
    return <div style={columnsStyle}>{renderColumns()}</div>;
  }

  // Page chrome (title/subtitle) uses the singleMode when set so the outer
  // surface matches the rendered theme; otherwise default to light.
  const chromeMode: Mode = singleMode ?? 'light';

  // Render the Tonal Palettes section once per mode (light + dark) so
  // designers see how the same HCT ramps feel against each theme surface.
  // For singleMode themes (e.g. gothic, y2k), only the relevant mode renders.
  const tonalModes: Mode[] = singleMode ? [singleMode] : ['light', 'dark'];

  return (
    <>
      {/* Preview surface — themed by the theme being audited. Override
          CSS vars live here so they cascade into every preview component
          (page background, tonal block, mode columns) but NOT into the
          audit drawer rendered in its own theme below. */}
      <Theme theme={theme} mode={chromeMode}>
        <LayerProvider>
          <div
            style={{
              ...S.page,
              ...overrideVars,
              margin: -0,
              position: 'relative',
              zIndex: 1,
            }}>
            <div style={S.inner}>
              <h1 style={S.title}>{title}</h1>
              <p style={S.subtitle}>{subtitle}</p>
              {tonalModes.map(m => (
                <Theme key={m} theme={theme} mode={m}>
                  <LayerProvider>
                    {/* Spread overrideVars *inside* the inner Theme so
                      pending overrides win over the theme's own
                      `:scope { --color-*: … }` rules. Same trick the
                      ModeColumn uses. */}
                    <div
                      style={{
                        ...overrideVars,
                        background: 'var(--color-background-body)',
                        color: 'var(--color-text-primary)',
                        borderRadius: 16,
                        padding: 24,
                        marginBottom: 16,
                        border: '1px solid var(--color-border)',
                      }}>
                      {tonalModes.length > 1 && (
                        <p style={{...S.modeLabel, marginBottom: 16}}>
                          {m === 'light' ? 'Light Mode' : 'Dark Mode'}
                        </p>
                      )}
                      <TonalSection
                        colors={tonalColors}
                        mode={m}
                        usage={effectiveUsage}
                      />
                    </div>
                  </LayerProvider>
                </Theme>
              ))}
              <div style={columnsStyle}>{renderColumns()}</div>
            </div>
          </div>
        </LayerProvider>
      </Theme>

      {/* Audit drawer + draft indicator — mounted *outside* the audited
          theme so the drawer's own chrome (buttons, borders, text) stays
          stable regardless of which theme is being previewed. Uses the
          neutral default theme so it always looks the same across all 5
          palette pages. Position-fixed elements inside the drawer
          attach to the viewport, not this wrapper. */}
      <Theme theme={neutralTheme} mode="light">
        <LayerProvider>
          <ThemeAuditDrawer
            audit={audit}
            themeName={theme.name}
            overrides={overrides}
            dispatchOverrides={dispatchOverrides}
          />
        </LayerProvider>
      </Theme>
    </>
  );
}
