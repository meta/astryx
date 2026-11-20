// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mapping.ts
 * @input Palette seeds (accent, neutral, status colors), a generated
 *   candidate, the base theme's resolved colors, and optional exact settings
 * @output The generation request for the seeds, and each color token's stop
 *   in light and dark with the contrast checks behind each choice
 * @position The palette-to-token mapping for a palette made from color
 *   settings. `themePalette()` runs it, and the CLI theme editor runs its
 *   generated copy
 */

import {hexToOklch, luminance, normalizeColor} from './color';
import {
  PALETTE_BLACK,
  PALETTE_WHITE,
  generateTonalPalette,
  perceptualDelta,
} from './generator';
import type {TonalPaletteCandidate, TonalPaletteGenerationInput} from './types';

export type PaletteMode = 'light' | 'dark';
type ColorTriple = [number, number, number];

/** One token pointed at a palette stop in one mode. */
export interface StopRef {
  stop: number;
  /** The stop's color, with `alpha` appended when set. */
  color: string;
  /** Two hex digits of opacity. */
  alpha?: string;
  /** The family the stop is from when it is not the token's own: `neutral` for text on a fill, `black` or `white` for the palette's own ends, `literal` for a color outside the palette. */
  family?: string;
  /** The stop holds the seed's exact color (an exact anchor). */
  exact?: boolean;
}

/** One contrast check behind a stop choice. */
export interface ContrastCheck {
  token: string;
  mode: PaletteMode;
  stop: number;
  /** The stop the mapping starts from. */
  preferred: number;
  /** What it was measured on. */
  against: string;
  /** The lowest ratio over everything it was measured on. */
  ratio: number;
  needs: number;
  pass: boolean;
  /** The whole sentence to report, when the check is not a plain stop move. */
  note?: string;
  /** The color settings whose notes report it, when its token belongs to none of them. */
  dials?: string[];
  /** The nearest setting that passes it, when one does: a darker exact color for a pale fill. */
  fix?: {thing: string; value: string; mode?: PaletteMode};
}

/** How the stop of an accent or status color's exact fill was settled. */
export interface PaletteFill {
  stop: number;
  dark: boolean;
  why: string;
  ratio: number;
}

/** Reads a fixed CSS color: its RGB (0–255) and its opacity (0–1). */
export interface PaletteColorReader {
  rgb(value: unknown): ColorTriple | null;
  alpha(value: unknown): number;
}

/** The resolved colors the mapping measures against, per mode. */
export interface PaletteBase {
  light: Record<string, string>;
  dark: Record<string, string>;
  /** Part styles, which may lift secondary text on some parts. */
  components?: Record<string, unknown>;
}

/** What the mapping reads around the palette. */
export interface PaletteMappingContext {
  base?: PaletteBase;
  /** Whether a token exists, so the mapping sets it. */
  has: (token: string) => boolean;
  reader: PaletteColorReader;
  /** The value a token is set to exactly in a mode, as written. */
  settingOf?: (token: string, mode: PaletteMode) => string | undefined;
  /** The fixed color a written value gives in a mode, or null. */
  colorIn?: (value: string, mode: PaletteMode) => string | null;
  /** Whether a token is set exactly in any mode. */
  setExactly?: (token: string) => boolean;
  /** The line that sets a value, for a note that offers one; without it, the note offers none. */
  setLine?: (thing: string, value: string, mode?: PaletteMode) => string;
}

/** One color setting: a palette family of the same id. */
export interface PaletteDial {
  id: string;
  seed: string;
}

/** A family of a palette config: the generator's family input, and any key of the author's. */
export interface ConfigFamily {
  id?: unknown;
  seed?: unknown;
  anchors?: {mode: string; stop: number; [key: string]: unknown}[];
  [key: string]: unknown;
}

/** A palette config: the generator's request, and any key of the author's. */
export interface PaletteConfig {
  families: ConfigFamily[];
  [key: string]: unknown;
}

/**
 * A palette config as the generator's request. The generator checks every
 * field it reads, and refuses a config it cannot run.
 */
const asRequest = (config: PaletteConfig): TonalPaletteGenerationInput =>
  config as unknown as TonalPaletteGenerationInput;

/** A family's stops in a mode. */
const rampOf = (
  candidate: TonalPaletteCandidate,
  id: string,
  m: PaletteMode,
): Record<string | number, string> => candidate.palette[id]?.[m] ?? {};

/** One block of a part's styles, or undefined. */
function partStyle(
  components: Record<string, unknown> | undefined,
  part: string,
  block: string,
): Record<string, unknown> | undefined {
  const blocks = components?.[part];
  const style =
    blocks && typeof blocks === 'object'
      ? (blocks as Record<string, unknown>)[block]
      : undefined;
  return style && typeof style === 'object'
    ? (style as Record<string, unknown>)
    : undefined;
}

/** The token mapping of a palette. */
export interface PaletteMapping {
  tokens: Record<string, {family: string; light: StopRef; dark: StopRef}>;
  contrast: ContrastCheck[];
  /** Main tokens set exactly, per mode: the color's fill gives way to them. */
  exact: Record<string, Partial<Record<PaletteMode, string>>>;
  /** Main tokens set exactly to a value that is not one readable color in some mode, as written. */
  unread: Record<string, string>;
  /** Lifted secondary text per background token of LIFT_PARTS, per mode; null without one. */
  lift: Record<string, Partial<Record<PaletteMode, StopRef>>> | null;
}

/** The color settings. Each one is a palette family of the same id. */
export const PALETTE_DIALS = Object.freeze([
  'accent',
  'neutral',
  'success',
  'warning',
  'danger',
  'info',
]);

/** The generator's vibrancy when the theme sets none. */
export const VIBRANCY_DEFAULT = 50;

/** A value a mapping table holds. */
type TableEntry = object | string | number | boolean | null | undefined;

/** A record without inherited keys, so a key such as `constructor` reads nothing. */
function ownTable<T extends object>(table: T): T {
  const own = (value: TableEntry): TableEntry => {
    if (Array.isArray(value)) {
      return value.map(own);
    }
    if (
      !value ||
      typeof value !== 'object' ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return value;
    }
    const out: Record<string, TableEntry> = Object.create(null);
    for (const [key, entry] of Object.entries(
      value as Record<string, TableEntry>,
    )) {
      out[key] = own(entry);
    }
    return out;
  };
  return own(table) as T;
}

/** The Core token word of each status family. */
export const STATUS_TOKEN: Record<string, string> = ownTable({
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
});

/** The main token a color setting feeds: the exact-token escape hatch for it. */
export const paletteToken = (dial: string): string =>
  dial === 'accent'
    ? '--color-accent'
    : dial === 'neutral'
      ? '--color-background-surface'
      : `--color-${STATUS_TOKEN[dial]}`;

/** Text contrast and non-text contrast (fills, focus rings, icons). */
export const TEXT = 4.5;
export const NON_TEXT = 3;

/**
 * The official Neutral theme's color mapping: each token's stops,
 * `[light, dark]`, with an opacity where it has one. A test keeps it equal
 * to the Neutral theme's source.
 */
export const OFFICIAL_NEUTRAL_STOPS: Readonly<
  Record<string, ReadonlyArray<{stop: number; alpha?: string}>>
> = ownTable({
  '--color-background-body': [{stop: 95}, {stop: 10}],
  '--color-background-surface': [{stop: 100}, {stop: 15}],
  '--color-background-card': [{stop: 100}, {stop: 10}],
  '--color-background-popover': [{stop: 100}, {stop: 10}],
  '--color-background-muted': [{stop: 95}, {stop: 10}],
  '--color-text-primary': [{stop: 0}, {stop: 100}],
  '--color-text-secondary': [{stop: 30}, {stop: 65}],
  '--color-text-disabled': [{stop: 60}, {stop: 35}],
  '--color-icon-primary': [{stop: 0}, {stop: 100}],
  '--color-icon-secondary': [{stop: 45}, {stop: 65}],
  '--color-icon-disabled': [{stop: 60}, {stop: 35}],
  '--color-border-emphasized': [{stop: 85}, {stop: 35}],
  '--color-skeleton': [{stop: 85}, {stop: 35}],
  '--color-on-dark': [{stop: 100}, {stop: 100}],
  '--color-on-light': [{stop: 5}, {stop: 5}],
  '--color-border': [
    {stop: 0, alpha: '14'},
    {stop: 100, alpha: '1a'},
  ],
  '--color-overlay-hover': [
    {stop: 0, alpha: '0d'},
    {stop: 100, alpha: '0d'},
  ],
  '--color-overlay-pressed': [
    {stop: 0, alpha: '1a'},
    {stop: 100, alpha: '1a'},
  ],
  '--color-text-info': [{stop: 45}, {stop: 80}],
  '--color-accent-muted': [{stop: 85}, {stop: 30}],
  '--color-info-muted': [{stop: 85}, {stop: 75, alpha: '3d'}],
  '--color-on-info-muted': [{stop: 25}, {stop: 80}],
  '--color-on-accent': [{stop: 100}, {stop: 5}],
});

/** The parts whose secondary text the official Neutral theme lifts, `[part, block]`. */
export const OFFICIAL_NEUTRAL_LIFTED: ReadonlyArray<readonly [string, string]> =
  Object.freeze([
    ['item', 'selected'],
    ['tree-list-item', 'selected'],
    ['file-input', 'mode:dropzone'],
    ['citation', 'variant:number'],
    ['segmented-control-item', 'base'],
    ['card', 'variant:blue'],
    ['card', 'variant:cyan'],
    ['card', 'variant:green'],
    ['card', 'variant:orange'],
    ['card', 'variant:pink'],
    ['card', 'variant:purple'],
    ['card', 'variant:red'],
    ['card', 'variant:teal'],
    ['card', 'variant:yellow'],
  ] as const);

/** A token's official `[light, dark]` stops. */
const officialStops = (token: string): [number, number] =>
  (OFFICIAL_NEUTRAL_STOPS[token] ?? []).map(x => x.stop) as [number, number];

/**
 * The tokens the neutral color sets at the official theme's stops: the
 * page background and the surfaces on it. A warm or cool gray so reaches
 * the page as it reaches the cards. The inverted surface (tooltips,
 * toasts) is the card surface of the other mode, inside the ramp (never
 * the white or black end every ramp shares), so it carries the neutral
 * color. A layout without one of these stops uses the nearest one it has.
 */
export const NEUTRAL_STOPS: Record<string, [number, number]> = ownTable({
  ...Object.fromEntries(
    [
      '--color-background-body',
      '--color-background-surface',
      '--color-background-card',
      '--color-background-popover',
      '--color-background-muted',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-text-disabled',
      '--color-icon-primary',
      '--color-icon-secondary',
      '--color-icon-disabled',
      '--color-border-emphasized',
      '--color-skeleton',
      '--color-on-dark',
      '--color-on-light',
    ].map(t => [t, officialStops(t)]),
  ),
  '--color-background-inverted': [
    ...officialStops('--color-background-card'),
  ].reverse() as [number, number],
});
/** Neutral tokens whose shade stays inside the ramp, off its white and black ends. */
export const NEUTRAL_INSIDE: ReadonlyArray<string> = Object.freeze([
  '--color-background-inverted',
]);
/** Neutral tints: a stop with an opacity, `[[stop, alpha], [stop, alpha]]`. */
export const NEUTRAL_TINTS: Record<
  string,
  [[number, string], [number, string]]
> = ownTable(
  Object.fromEntries(
    ['--color-border', '--color-overlay-hover', '--color-overlay-pressed'].map(
      t => [
        t,
        (OFFICIAL_NEUTRAL_STOPS[t] ?? []).map((x): [number, string] => [
          x.stop,
          String(x.alpha),
        ]) as [[number, string], [number, string]],
      ],
    ),
  ),
);
/**
 * Accent and status stops, `[light, dark]`, as the official Neutral theme
 * maps its accent tint and its status families (info stands for them). The
 * dark fill starts at 70 when the exact color does not read in dark. A
 * status tint is translucent in dark (`[stop, alpha]`).
 */
export const DARK_FILL = 70;
export const TEXT_STOP = officialStops('--color-text-info');
export const ACCENT_MUTED = officialStops('--color-accent-muted');
export const STATUS_MUTED = (
  OFFICIAL_NEUTRAL_STOPS['--color-info-muted'] ?? []
).map((x, i) => (i === 0 ? x.stop : [x.stop, String(x.alpha)])) as [
  number,
  [number, string],
];
export const ON_MUTED = officialStops('--color-on-info-muted');
/**
 * The parts whose secondary text the official Neutral theme lifts, with
 * the block it lifts it in and what the text sits on: the accent tint,
 * except under segmented-control labels, which sit on the translucent
 * neutral track (`--color-neutral`).
 */
export const LIFT_PARTS: ReadonlyArray<[string, string, string]> =
  OFFICIAL_NEUTRAL_LIFTED.map(([part, block]) => [
    part,
    block,
    liftGround(part, block),
  ]);
/**
 * What a lifted block's secondary text sits on: a card's own fill for a
 * card colour (the card variant rule lifts it there), the translucent
 * neutral track under segmented-control labels, else the accent tint.
 */
function liftGround(part: string, block: string): string {
  if (part === 'segmented-control-item') {
    return '--color-neutral';
  }
  const color = part === 'card' ? /^variant:([\w-]+)$/.exec(block)?.[1] : null;
  return color ? `--color-background-${color}` : '--color-accent-muted';
}
/** What each lifted background is, and the parts on it, for notes. */
export const LIFT_GROUNDS: Record<string, {what: string; parts: string}> = {
  '--color-accent-muted': {
    what: 'the accent tint',
    parts: 'selected items and rows, a dropzone, numbered citations',
  },
  '--color-neutral': {
    what: 'the neutral track',
    parts: 'segmented-control labels',
  },
  ...Object.fromEntries(
    LIFT_PARTS.filter(([part]) => part === 'card').map(([, block, g]) => {
      const color = block.replace(/^variant:/, '');
      return [g, {what: `the ${color} card fill`, parts: `${color} cards`}];
    }),
  ),
};
export const BORDER: [number, number] = [80, 65];
/**
 * Text on a fill, from the neutral family as the official themes take it:
 * white (100) first in light, near-black (5) first in dark, and near-black
 * first in both modes on warning. Without a neutral color, black and white.
 */
const [ON_LIGHT, ON_DARK] = officialStops('--color-on-accent');
export const ON_FILL: Record<PaletteMode, [number, number]> = ownTable({
  light: [ON_LIGHT, ON_DARK],
  dark: [ON_DARK, ON_LIGHT],
});
/** Text on surfaces darkens in light mode and lightens in dark mode. */
export const TOWARD_CONTRAST: Record<PaletteMode, 1 | -1> = ownTable({
  light: -1,
  dark: 1,
});

/**
 * Below this OKLCH chroma a seed reads as gray: its family is generated as a
 * neutral, so no hue is invented for it in either mode.
 */
const GRAY_CHROMA = 0.02;

/** Whether a seed reads as gray. */
export const isGray = (seed: string): boolean =>
  hexToOklch(seed).C < GRAY_CHROMA;

/** Whether two values are one color. */
export function sameColor(a: unknown, b: unknown): boolean {
  try {
    return normalizeColor(String(a)) === normalizeColor(String(b));
  } catch {
    return false;
  }
}

/** RGB channels (0–255) as a lowercase six-digit hex. */
export const hex = (rgb: ReadonlyArray<number>): string =>
  `#${rgb
    .slice(0, 3)
    .map(x =>
      Math.round(Math.max(0, Math.min(255, x)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** The WCAG contrast ratio of two RGB colors, each rounded to a hex first. */
export function ratio(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): number {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A color drawn at `alpha` over `under`, as the opaque color the eye sees. */
export function compositeOver(
  over: ReadonlyArray<number>,
  alpha: number,
  under: ReadonlyArray<number>,
): ColorTriple {
  return over.map((c, i) => c * alpha + under[i] * (1 - alpha)) as ColorTriple;
}

/** A ratio to two decimals. */
export const round = (r: number): number => Math.round(r * 100) / 100;

/** A stop as text: a layout may hold 16.666666666666668. */
export const shade = (s: number): string => String(round(s));

/**
 * The stop of a ramp whose shade is nearest a color, as the eye compares
 * them; never an end stop (pure black or white, which every ramp shares).
 * Null for a ramp with no inner stop.
 */
export function nearestShade(
  ramp: Record<string | number, string>,
  color: string,
): string | null {
  const inner = Object.keys(ramp).filter(s => Number(s) > 0 && Number(s) < 100);
  if (!inner.length) {
    return null;
  }
  return inner.reduce((best, s) =>
    perceptualDelta(ramp[s], color) < perceptualDelta(ramp[best], color)
      ? s
      : best,
  );
}

/** The stop of a layout nearest `n`; on a tie, the one nearer the middle. */
export function nearestStop(stops: ReadonlyArray<number>, n: number): number {
  return stops.reduce((best, s) => {
    const d = Math.abs(s - n) - Math.abs(best - n);
    return d < 0 || (d === 0 && Math.abs(s - 50) < Math.abs(best - 50))
      ? s
      : best;
  });
}

/**
 * The light stop nearest a seed color in the ramp the generator grows from
 * it. The official themes anchor a brand color there, exactly, so the fill
 * keeps the color as given. The end stops are pure black and white and
 * never hold an anchor.
 */
export function seedStop(
  seed: string,
  config: {stops?: number[]; vibrancy?: number},
  kind: 'chromatic' | 'neutral' = 'chromatic',
): number {
  const {palette} = generateTonalPalette({
    ...(config.stops ? {stops: config.stops} : {}),
    ...(config.vibrancy != null ? {vibrancy: config.vibrancy} : {}),
    ...(kind === 'neutral' ? {neutralProfile: 'custom'} : {}),
    modeStrategy: 'light-only',
    families: [{id: 'seed', seed, kind}],
  });
  const ramp = palette.seed.light as Record<number, string>;
  return Number(nearestShade(ramp, seed));
}

/**
 * A gray ramp the generator grows from a gray of the theme (its secondary
 * text), for a mode: the grays of a theme whose palette has no neutral
 * family. Null when the seed does not grow.
 */
export function grownGrays(
  seed: string,
  m: PaletteMode,
): Record<string, string> | null {
  try {
    const g = generateTonalPalette({
      modeStrategy: m === 'light' ? 'light-only' : 'dark-only',
      neutralProfile: 'custom',
      families: [{id: 'gray', seed, kind: 'neutral'}],
    });
    return g.palette.gray[m] ?? null;
  } catch {
    return null;
  }
}

/** A text shade, named for a sentence. */
export const textName = (r: StopRef): string =>
  r.family === 'white' || (r.family === 'neutral' && r.stop >= 95)
    ? 'white'
    : r.family === 'black' || (r.family === 'neutral' && r.stop <= 10)
      ? 'near-black'
      : `shade ${r.stop}`;

/**
 * Look-ups shared by the request planner and the mapping, on one
 * candidate: the nearest stop, a stop's color, the surfaces text and fills
 * sit on, the text that reads on a fill, and the theme's exact colors.
 */
export function paletteTools(
  candidate: TonalPaletteCandidate,
  context: PaletteMappingContext,
) {
  const {base, reader} = context;
  const {stops} = candidate;
  const parseColor = reader.rgb;
  const alphaOf = reader.alpha;
  const contrast = (a: string, b: string): number => {
    const x = parseColor(a);
    const y = parseColor(b);
    if (!x || !y) {
      throw new Error(`No contrast between "${a}" and "${b}".`);
    }
    return ratio(x, y);
  };
  const at = (n: number): number => nearestStop(stops, n);
  /** The stop nearest `n` off the white and black ends. */
  const atInside = (n: number): number =>
    nearestStop(
      stops.filter(s => s > 0 && s < 100),
      n,
    );
  const ref = (
    id: string,
    m: PaletteMode,
    stop: number,
    alpha?: string,
  ): StopRef => {
    const color = rampOf(candidate, id, m)[stop];
    return alpha ? {stop, color: `${color}${alpha}`, alpha} : {stop, color};
  };
  const neutral = Boolean(candidate.palette.neutral);
  /** The value a token is set to exactly in a mode, as written, or undefined. */
  const settingOf = (token: string, m: PaletteMode): string | undefined =>
    context.settingOf?.(token, m);
  const colorIn = (
    value: string | undefined,
    m: PaletteMode,
  ): string | null => {
    if (value == null) {
      return null;
    }
    if (context.colorIn) {
      return context.colorIn(value, m);
    }
    // (Without a reader of its own, a value is a color when it is one.)
    const v = value.trim();
    return parseColor(v) ? v : null;
  };
  /** The exact opaque color a token is set to in a mode, or null. */
  const exactOf = (token: string, m: PaletteMode): string | null => {
    const v = colorIn(settingOf(token, m), m);
    const rgb = v == null ? null : parseColor(v);
    return rgb && v != null && alphaOf(v) >= 1 ? hex(rgb) : null;
  };
  /**
   * The exact color a token is set to in a mode, see-through or not, as
   * written; null when there is none or it is not a fixed color.
   */
  const rawOf = (token: string, m: PaletteMode): string | null =>
    colorIn(settingOf(token, m), m);
  /**
   * Which column of a `[light, dark]` mapping a mode takes: the light one
   * on a light page and the dark one on a dark page, by the base theme's
   * page, the one its surfaces were made for.
   */
  const side = (m: PaletteMode): 0 | 1 => {
    const page = base?.[m]?.['--color-background-body'];
    const rgb = page ? parseColor(page) : null;
    if (!rgb || alphaOf(page) < 1) {
      return m === 'light' ? 0 : 1;
    }
    return ratio(rgb, [255, 255, 255]) > ratio(rgb, [0, 0, 0]) ? 1 : 0;
  };
  /**
   * What text and fills sit on in a mode: the theme's exact surface
   * colors, else the neutral color's surfaces, else the base theme's; the
   * family's own surface stop when nothing else is known.
   */
  const surfaces = (m: PaletteMode, id: string): [string, string][] => {
    const out: [string, string][] = [];
    for (const n of [
      '--color-background-surface',
      '--color-background-body',
      '--color-background-card',
    ]) {
      const own =
        neutral && NEUTRAL_STOPS[n]
          ? ref('neutral', m, at(NEUTRAL_STOPS[n][side(m)])).color
          : null;
      const v = exactOf(n, m) ?? own ?? base?.[m]?.[n];
      const rgb = v ? parseColor(v) : null;
      if (v && rgb && alphaOf(v) >= 1) {
        out.push([n, hex(rgb)]);
      }
    }
    if (!out.length) {
      const s = at(NEUTRAL_STOPS['--color-background-surface'][side(m)]);
      out.push([`${id} shade ${s}`, ref(id, m, s).color]);
    }
    return out;
  };
  /** The text shades for a fill, preferred first. */
  const onChoices = (id: string, m: PaletteMode): StopRef[] =>
    (id === 'warning' ? [5, 100] : ON_FILL[m]).map(s =>
      neutral
        ? {...ref('neutral', m, at(s)), family: 'neutral'}
        : s >= 50
          ? {stop: 100, color: PALETTE_WHITE, family: 'white'}
          : {stop: 0, color: PALETTE_BLACK, family: 'black'},
    );
  /**
   * The text on a fill: the preferred shade when it reads at 4.5:1, else
   * the one that reads better.
   */
  const onFor = (id: string, m: PaletteMode, fill: string) => {
    const [a, b] = onChoices(id, m).map(on => ({
      on,
      r: contrast(on.color, fill),
    }));
    let best = a.r >= TEXT || a.r >= b.r ? a : b;
    const other = best === a ? b : a;
    // Neither reads: the end of the gray ramp on the better side (black
    // past near-black, white past near-white) when it reads better, so the
    // text picked is never one a darker or lighter gray would beat.
    if (best.r < TEXT) {
      const dark =
        contrast(best.on.color, PALETTE_WHITE) > contrast(fill, PALETTE_WHITE);
      const end: StopRef = neutral
        ? {...ref('neutral', m, at(dark ? 0 : 100)), family: 'neutral'}
        : dark
          ? {stop: 0, color: PALETTE_BLACK, family: 'black'}
          : {stop: 100, color: PALETTE_WHITE, family: 'white'};
      const r = contrast(end.color, fill);
      if (r > best.r) {
        best = {on: end, r};
      }
    }
    return {
      on: best.on,
      r: best.r,
      other: other.on,
      otherR: other.r,
      first: a.on,
    };
  };
  /** The lowest contrast of a color on the surfaces. */
  const page = (color: string, m: PaletteMode, id: string): number =>
    Math.min(...surfaces(m, id).map(([, bg]) => contrast(color, bg)));
  /** A color as the eye sees it on the surface in a mode. */
  const solid = (color: string, m: PaletteMode, id: string): string => {
    const rgb = parseColor(color) as ColorTriple;
    const a = alphaOf(color);
    if (a >= 1) {
      return hex(rgb);
    }
    const under = parseColor(surfaces(m, id)[0][1]) as ColorTriple;
    return hex(compositeOver(rgb, a, under));
  };
  /** A translucent stop drawn over each surface; an opaque stop as it is. */
  const over = (
    name: string,
    r: StopRef,
    under: [string, string][],
  ): [string, string][] => {
    if (!r.alpha) {
      return [[name, r.color]];
    }
    const top = parseColor(r.color.slice(0, 7)) as ColorTriple;
    const a = parseInt(r.alpha, 16) / 255;
    return under.map(([n, bg]) => [
      `${name} over ${n}`,
      hex(compositeOver(top, a, parseColor(bg) as ColorTriple)),
    ]);
  };
  return {
    stops,
    at,
    atInside,
    ref,
    exactOf,
    settingOf,
    rawOf,
    side,
    solid,
    surfaces,
    onFor,
    page,
    neutral,
    contrast,
    over,
    parseColor,
    alphaOf,
  };
}

export type PaletteTools = ReturnType<typeof paletteTools>;

/**
 * Whether the exact seed color works as the dark fill: text on it reads at
 * 4.5:1 and it stands out from the dark surfaces at 3:1. Why not otherwise.
 */
export function darkExact(
  t: PaletteTools,
  id: string,
  seed: string,
): {ok: boolean; ratio: number; why: string} {
  const on = t.onFor(id, 'dark', seed);
  if (on.r < TEXT) {
    return {
      ok: false,
      ratio: round(on.r),
      why: `your exact color reads at only ${round(on.r)}:1 with any text shade, and text needs ${TEXT}:1`,
    };
  }
  const p = t.page(seed, 'dark', id);
  if (p < NON_TEXT) {
    return {
      ok: false,
      ratio: round(p),
      why: `your exact color stands out from the dark page at only ${round(p)}:1, and a fill needs ${NON_TEXT}:1`,
    };
  }
  return {ok: true, ratio: round(on.r), why: ''};
}

/** One family of a request, with its exact seed anchors. */
export type PaletteRequestFamily = {
  id: string;
  name: string;
  seed: string;
  kind?: 'neutral';
  anchors?: {
    mode: PaletteMode;
    stop: number;
    color: string;
    policy: 'exact';
  }[];
};

/**
 * The family a color setting makes: its seed, a gray seed generated as a
 * neutral, and the seed's exact color anchored at its nearest light stop
 * (both modes for neutral). White or black as neutral holds no anchor:
 * they already end every ramp.
 */
export function dialFamily(
  dial: PaletteDial,
  config: {stops?: number[]; vibrancy?: number},
  modes: ReadonlyArray<PaletteMode>,
): {family: PaletteRequestFamily; stop: number} {
  const neutral = dial.id === 'neutral';
  const kind = neutral || isGray(dial.seed) ? 'neutral' : undefined;
  const stop = seedStop(dial.seed, config, kind ?? 'chromatic');
  const ends =
    neutral &&
    (sameColor(dial.seed, PALETTE_WHITE) ||
      sameColor(dial.seed, PALETTE_BLACK));
  const anchors = ends
    ? []
    : (neutral ? modes : modes.filter(m => m === 'light')).map(m => ({
        mode: m,
        stop,
        color: dial.seed,
        policy: 'exact' as const,
      }));
  return {
    family: {
      id: dial.id,
      name: dial.id[0].toUpperCase() + dial.id.slice(1),
      seed: dial.seed,
      ...(kind ? {kind} : {}),
      ...(anchors.length ? {anchors} : {}),
    },
    stop,
  };
}

/**
 * Anchors each accent and status seed in dark too where it reads there, as
 * the official themes anchor a brand color in both modes. Settles each
 * fill's `dark`, `why` and `ratio`; returns the families with the dark
 * anchors that the generator can hold, and the notes of any anchor of the
 * author's that one replaces.
 */
export function anchorDarkFills(
  config: PaletteConfig,
  dials: ReadonlyArray<PaletteDial>,
  fills: Record<string, PaletteFill>,
  context: PaletteMappingContext,
  replaced: (id: string, stop: number) => void = () => {},
): ConfigFamily[] {
  const t = paletteTools(generateTonalPalette(asRequest(config)), context);
  const add: string[] = [];
  for (const [id, fill] of Object.entries(fills)) {
    const seed = dials.find(f => f.id === id)?.seed as string;
    const check = darkExact(t, id, seed);
    Object.assign(fill, {why: check.why, ratio: check.ratio});
    if (check.ok) {
      add.push(id);
    }
  }
  const withDark = (id: string, cfg: typeof config): typeof config => ({
    ...cfg,
    families: cfg.families.map(f => {
      if (f?.id !== id) {
        return f;
      }
      const anchor = {
        mode: 'dark',
        stop: fills[id].stop,
        color: f.seed,
        policy: 'exact',
      };
      const own: {mode: string; stop: number}[] = f.anchors ?? [];
      const others = own.filter(
        a => !(a.mode === 'dark' && a.stop === anchor.stop),
      );
      if (others.length < own.length) {
        replaced(id, anchor.stop);
      }
      return {
        ...f,
        anchors: [...others, anchor].sort((a, b) =>
          a.mode === b.mode ? a.stop - b.stop : a.mode === 'light' ? -1 : 1,
        ),
      };
    }),
  });
  let next = config;
  for (const id of add) {
    const tried = withDark(id, next);
    try {
      generateTonalPalette(asRequest(tried));
      next = tried;
      fills[id].dark = true;
    } catch {
      fills[id].why =
        'the dark shades cannot hold your exact color and stay in order from dark to light';
    }
  }
  return next.families;
}

/** An accent or status fill at its seed's stop, before dark mode is settled. */
export const fillAt = (stop: number): PaletteFill => ({
  stop,
  dark: false,
  why: '',
  ratio: 0,
});

/** What `planPaletteRequest` settles for a set of color settings. */
export interface PalettePlan {
  config: {
    recipe?: string;
    vibrancy?: number;
    modeStrategy: 'light-and-dark';
    families: ConfigFamily[];
  };
  fills: Record<string, PaletteFill>;
}

/**
 * The generation request for color settings with no palette config of the
 * author's: one family per setting in setting order, each seed anchored
 * exactly, in dark too where it reads there. Null without a setting.
 */
export function planPaletteRequest(
  dials: ReadonlyArray<PaletteDial>,
  options: {recipe?: string; vibrancy?: number},
  context: PaletteMappingContext,
): PalettePlan | null {
  if (!dials.length) {
    return null;
  }
  const modes: PaletteMode[] = ['light', 'dark'];
  const config: PalettePlan['config'] = {
    ...(options.recipe ? {recipe: options.recipe} : {}),
    ...(options.vibrancy != null ? {vibrancy: options.vibrancy} : {}),
    modeStrategy: 'light-and-dark',
    families: [],
  };
  const fills: Record<string, PaletteFill> = {};
  for (const dial of dials) {
    const {family, stop} = dialFamily(dial, config, modes);
    if (dial.id !== 'neutral') {
      fills[dial.id] = fillAt(stop);
    }
    config.families.push(family);
  }
  if (Object.keys(fills).length) {
    config.families = anchorDarkFills(config, dials, fills, context);
  }
  return {config, fills};
}

/**
 * The token mapping of a generated palette: each color token's stop in
 * light and dark, as the official Neutral theme maps its families, with the
 * contrast checks behind each choice.
 */
export function mapPalette(
  candidate: TonalPaletteCandidate,
  dials: ReadonlyArray<PaletteDial>,
  fills: Record<string, PaletteFill>,
  context: PaletteMappingContext,
): PaletteMapping {
  const t = paletteTools(candidate, context);
  const {
    stops,
    at,
    atInside,
    ref,
    exactOf,
    rawOf,
    settingOf,
    side,
    solid,
    surfaces,
    contrast,
    over,
    parseColor,
    alphaOf,
  } = t;
  const {base, has} = context;
  // Both halves, for a one-mode theme too.
  const modes: PaletteMode[] = ['light', 'dark'];
  const tokens: PaletteMapping['tokens'] = {};
  const checks: ContrastCheck[] = [];
  const exact: PaletteMapping['exact'] = {};
  const unread: Record<string, string> = {};
  const setExactly = (k: string): boolean => context.setExactly?.(k) ?? false;
  const reports = (k: string): boolean => has(k) && !setExactly(k);
  /** Point a token at its stops. One mode's stop stands for both when only one is given. */
  const put = (
    token: string,
    id: string,
    refs: Partial<Record<PaletteMode, StopRef>>,
  ): void => {
    if (!has(token)) {
      return;
    }
    const one = refs[modes[0]] as StopRef;
    tokens[token] = {
      family: id,
      light: refs.light ?? one,
      dark: refs.dark ?? one,
    };
  };
  const each = <T>(
    fn: (m: PaletteMode) => T,
  ): Partial<Record<PaletteMode, T>> =>
    Object.fromEntries(modes.map(m => [m, fn(m)]));
  /**
   * The stop nearest `start` that reads at `needs` on every color in `on`,
   * searched both ways (the usual way first on a tie: darker in light,
   * lighter in dark); the most contrasting stop of all when none does.
   */
  const pick = (
    token: string,
    id: string,
    m: PaletteMode,
    start: number,
    on: [string, string][],
    needs: number,
  ): StopRef => {
    const usual = TOWARD_CONTRAST[m];
    const order = [...stops].sort(
      (a, b) =>
        Math.abs(a - start) - Math.abs(b - start) ||
        (Math.sign(b - a) === usual ? 1 : -1),
    );
    const score = (stop: number): number => {
      const c = ref(id, m, stop).color;
      return Math.min(...on.map(([, bg]) => contrast(c, bg)));
    };
    const scored = order.map(stop => ({stop, r: score(stop)}));
    const b =
      scored.find(x => x.r >= needs) ??
      scored.reduce((x, y) => (y.r > x.r ? y : x));
    if (reports(token)) {
      checks.push({
        token,
        mode: m,
        stop: b.stop,
        preferred: start,
        against: on.map(([n]) => n).join(', '),
        ratio: round(b.r),
        needs,
        pass: b.r >= needs,
      });
    }
    return ref(id, m, b.stop);
  };

  const neutral = dials.find(f => f.id === 'neutral');
  if (neutral) {
    for (const [token, pair] of Object.entries(NEUTRAL_STOPS)) {
      if (
        token === '--color-text-secondary' ||
        token === '--color-icon-secondary'
      ) {
        continue;
      }
      const shadeAt = NEUTRAL_INSIDE.includes(token) ? atInside : at;
      put(
        token,
        'neutral',
        each(m => ref('neutral', m, shadeAt(pair[side(m)]))),
      );
    }
    for (const [token, pair] of Object.entries(NEUTRAL_TINTS)) {
      put(
        token,
        'neutral',
        each(m => {
          const [s, a] = pair[side(m)];
          return ref('neutral', m, at(s), a);
        }),
      );
    }
    for (const [token, needs] of [
      ['--color-text-secondary', TEXT],
      ['--color-icon-secondary', NON_TEXT],
    ] as const) {
      put(
        token,
        'neutral',
        each(m =>
          pick(
            token,
            'neutral',
            m,
            at(NEUTRAL_STOPS[token][side(m)]),
            surfaces(m, 'neutral'),
            needs,
          ),
        ),
      );
    }
    const surface = paletteToken('neutral');
    const set = each(m => exactOf(surface, m));
    if (Object.values(set).some(Boolean)) {
      exact[surface] = Object.fromEntries(
        Object.entries(set).filter(([, v]) => v),
      );
    }
  }

  for (const f of dials) {
    if (f.id === 'neutral') {
      continue;
    }
    const word = f.id === 'accent' ? null : STATUS_TOKEN[f.id];
    const names = word
      ? {
          fill: `--color-${word}`,
          on: `--color-on-${word}`,
          text: `--color-text-${word}`,
          icon: `--color-icon-${word}`,
          muted: `--color-${word}-muted`,
          onMuted: `--color-on-${word}-muted` as string | null,
          border: `--color-border-${word}` as string | null,
          focus: null as string | null,
        }
      : {
          fill: '--color-accent',
          on: '--color-on-accent',
          text: '--color-text-accent',
          icon: '--color-icon-accent',
          muted: '--color-accent-muted',
          onMuted: null as string | null,
          border: null as string | null,
          focus: '--focus-outline-color' as string | null,
        };
    const plain = fills[f.id];
    const S = plain.stop;
    const fillWord = f.id;
    const exactFill: Partial<Record<PaletteMode, string>> = {};
    for (const m of modes) {
      const v = rawOf(names.fill, m);
      if (v) {
        exactFill[m] = v;
      } else if (settingOf(names.fill, m) != null) {
        unread[names.fill] = String(settingOf(names.fill, m)).trim();
      }
    }
    if (Object.keys(exactFill).length) {
      exact[names.fill] = Object.fromEntries(
        Object.entries(exactFill).map(([m, v]) => {
          // A var() is named with the color it reads, so the note says
          // which color the text was picked for.
          const written = (
            settingOf(names.fill, m as PaletteMode) ?? ''
          ).trim();
          const rgb = parseColor(v);
          const color = rgb && alphaOf(v) >= 1 ? hex(rgb) : v;
          return [m, /var\(/i.test(written) ? `${written} = ${color}` : v];
        }),
      );
    }

    const fill: Partial<Record<PaletteMode, StopRef>> = {};
    for (const m of modes) {
      if (m === 'light' || plain.dark) {
        fill[m] = {...ref(f.id, m, S), exact: true};
        continue;
      }
      // The dark fill when the exact color does not read there: shade 70,
      // else the shade nearest 70 that passes, else 70.
      const start = at(DARK_FILL);
      const order = [...stops]
        .filter(s => s > 0 && s < 100)
        .sort((a, b) => Math.abs(a - start) - Math.abs(b - start) || b - a);
      const found =
        order.find(s => {
          const c = ref(f.id, m, s).color;
          return (
            t.page(c, m, f.id) >= NON_TEXT && t.onFor(f.id, m, c).r >= TEXT
          );
        }) ?? start;
      fill[m] = ref(f.id, m, found);
      // The shade nearest your color that passes, offered as the theme's
      // own dark fill when it is closer to your color than the one used.
      const near = [...stops]
        .filter(s => s > 0 && s < 100)
        .sort((a, b) => Math.abs(a - S) - Math.abs(b - S) || b - a)
        .find(s => {
          const c = ref(f.id, m, s).color;
          return (
            t.page(c, m, f.id) >= NON_TEXT && t.onFor(f.id, m, c).r >= TEXT
          );
        });
      const closer =
        near != null &&
        Math.abs(near - S) < Math.abs(found - S) &&
        context.setLine
          ? (() => {
              const c = ref(f.id, m, near).color;
              const o = t.onFor(f.id, m, c);
              return `; for a fill closer to your color in dark: ${context.setLine(names.fill, c, 'dark')} (shade ${shade(near)}, the nearest that passes, with ${textName(o.on)} text at ${round(o.r)}:1)`;
            })()
          : '';
      if (reports(names.fill)) {
        checks.push({
          token: names.fill,
          mode: m,
          stop: found,
          preferred: S,
          against: 'the dark page and the text on it',
          ratio: plain.ratio,
          needs: TEXT,
          pass: true,
          note: `in dark, ${names.fill} is shade ${shade(found)}, not your exact color: ${plain.why}${found === start ? '' : `; shade ${shade(start)} does not pass either, so it is the nearest shade that does`}${closer}`,
        });
      }
    }
    put(names.fill, f.id, fill);

    // Text on the fill reads on the fill the theme really uses: the exact
    // token setting when there is one. The exact color never moves; the
    // text changes instead.
    const on = each(m => {
      const used = exactFill[m] ?? (fill[m] as StopRef).color;
      // A see-through exact fill is measured as it shows on the surface.
      const o = t.onFor(fillWord, m, solid(used, m, f.id));
      const what = exactFill[m]
        ? `your exact ${names.fill} (${used}${alphaOf(used) < 1 ? `, as it shows: ${solid(used, m, f.id)}` : ''})`
        : `${names.fill} (shade ${shade(Number(fill[m]?.stop))})`;
      const moved = o.on !== o.first;
      if (reports(names.on)) {
        checks.push({
          token: names.on,
          mode: m,
          stop: o.on.stop,
          preferred: o.first.stop,
          against: what,
          ratio: round(o.r),
          needs: TEXT,
          pass: o.r >= TEXT,
          ...(o.r < TEXT
            ? {
                note: `text on ${what} reads at only ${round(o.r)}:1 in ${m} with white or near-black text (needs ${TEXT}:1); the fill keeps your color: pick a lighter or darker ${f.id}, or set ${names.on} exactly`,
              }
            : moved
              ? {
                  note: `${names.on} uses ${textName(o.on)} text in ${m}, not ${textName(o.first)}, so it reads at ${round(o.r)}:1 on ${what}, where ${textName(o.other)} text reads at only ${round(o.otherR)}:1 (button and badge labels are normal-size text, which needs ${TEXT}:1); to keep ${textName(o.other)} text anyway, set ${names.on} exactly`,
                }
              : {}),
        });
      }
      return o.on;
    });
    put(names.on, f.id, on);

    // A pale fill in light can disappear into the page: say so, and keep
    // the exact color, the setting's or the token's.
    if (modes.includes('light') && has(names.fill)) {
      const used = exactFill.light ?? (fill.light as StopRef).color;
      const p = t.page(solid(used, 'light', f.id), 'light', f.id);
      // The nearest darker color that stands out from the light page.
      let darker: string | null = null;
      const from = parseColor(solid(used, 'light', f.id));
      for (let i = 1; from && i <= 100 && !darker; i++) {
        const c = hex(from.map(v => Math.round(v * (1 - i / 100))));
        if (t.page(c, 'light', f.id) >= NON_TEXT) {
          darker = c;
        }
      }
      if (p < NON_TEXT) {
        checks.push({
          token: names.fill,
          mode: 'light',
          stop: S,
          preferred: S,
          against: 'the light page',
          ratio: round(p),
          needs: NON_TEXT,
          pass: false,
          note: exactFill.light
            ? `in light, your exact ${names.fill} (${used}) stands out from the page at only ${round(p)}:1, and a fill needs ${NON_TEXT}:1, so its buttons and badges may not show: give it a darker color`
            : `in light, your exact ${f.id} stands out from the page at only ${round(p)}:1, and a fill needs ${NON_TEXT}:1, so ${names.fill} buttons and badges may not show: pick a darker ${f.id}`,
          ...(darker
            ? {
                fix: exactFill.light
                  ? {thing: names.fill, value: darker, mode: 'light' as const}
                  : {thing: f.id, value: darker},
              }
            : {}),
        });
      }
    }

    // The tint: the official stop, never the fill's own shade, see-through
    // or not.
    const muted = each(m => {
      const i = side(m);
      const spec = word ? STATUS_MUTED[i] : ACCENT_MUTED[i];
      const [s, alpha] = Array.isArray(spec) ? spec : [spec, undefined];
      // Nearest the official stop first, both ways; on a tie (a layout
      // without that stop) lighter first in light, darker in dark.
      const usual = i === 0 ? 1 : -1;
      const order = [...stops].sort(
        (a, b) =>
          Math.abs(a - s) - Math.abs(b - s) ||
          (Math.sign(b - a) === usual ? 1 : -1),
      );
      const away = order.filter(x => x !== fill[m]?.stop);
      return ref(f.id, m, away[0] ?? order[0], alpha);
    });
    put(names.muted, f.id, muted);
    /** The tint the theme really shows: an exact setting wins. */
    const mutedSeen = (m: PaletteMode): [string, string][] => {
      const own = rawOf(names.muted, m);
      return own
        ? surfaces(m, f.id).map(([n, bg]) => [
            `your exact ${names.muted} over ${n}`,
            hex(
              compositeOver(
                parseColor(own) as ColorTriple,
                alphaOf(own),
                parseColor(bg) as ColorTriple,
              ),
            ),
          ])
        : over(names.muted, muted[m] as StopRef, surfaces(m, f.id));
    };

    // Accent text and icons are the color given where it reads on what
    // they sit on (the surfaces and the tint), in each mode its fill is
    // the exact color; only where it does not do they move, to the nearest
    // shade that reads, and the check says so.
    const text = each(m => {
      const grounds = [...surfaces(m, f.id), ...mutedSeen(m)];
      // The fill the theme really shows in this mode: an exact token
      // setting of it, else the setting's own color at its shade. The text
      // starts from that color's nearest shade.
      const shown = exactFill[m] ? solid(exactFill[m], m, f.id) : null;
      const start = shown
        ? stops.reduce((x, y) =>
            perceptualDelta(ref(f.id, m, y).color, shown) <
            perceptualDelta(ref(f.id, m, x).color, shown)
              ? y
              : x,
          )
        : S;
      const own = shown
        ? {...ref(f.id, m, start), color: shown}
        : fill[m]?.exact
          ? ref(f.id, m, S)
          : null;
      if (own) {
        const r = Math.min(...grounds.map(([, bg]) => contrast(own.color, bg)));
        if (r >= TEXT && !shown) {
          if (reports(names.text)) {
            checks.push({
              token: names.text,
              mode: m,
              stop: S,
              preferred: S,
              against: grounds.map(([n]) => n).join(', '),
              ratio: round(r),
              needs: TEXT,
              pass: true,
            });
          }
          return own;
        }
        const before = checks.length;
        const moved = pick(names.text, f.id, m, start, grounds, TEXT);
        if (r >= TEXT) {
          return moved;
        }
        const last = checks.length > before ? checks[checks.length - 1] : null;
        if (last && (moved.stop !== start || shown)) {
          last.note = `${names.text} ${m}: your exact color (${own.color}) reads at only ${grounds
            .map(([n, bg]): [string, number] => [n, contrast(own.color, bg)])
            .filter(([, x]) => x < TEXT)
            .map(([n, x]) => `${round(x)}:1 on ${n}`)
            .join(
              ', ',
            )} (text needs ${TEXT}:1), so ${f.id === 'accent' ? 'links and accent text' : `${f.id} text and icons`} use shade ${shade(moved.stop)} (${moved.color}), the nearest that reads; the fill keeps your color, and an exact ${names.text} keeps any color you give it`;
        }
        return moved;
      }
      return pick(names.text, f.id, m, at(TEXT_STOP[side(m)]), grounds, TEXT);
    });
    put(names.text, f.id, text);
    put(names.icon, f.id, text);
    if (names.onMuted) {
      const onMuted = names.onMuted;
      put(
        onMuted,
        f.id,
        each(m =>
          pick(onMuted, f.id, m, at(ON_MUTED[side(m)]), mutedSeen(m), TEXT),
        ),
      );
    }
    if (names.border) {
      put(
        names.border,
        f.id,
        each(m => ref(f.id, m, at(BORDER[side(m)]))),
      );
    }
    // The focus ring follows the fill; with an exact fill it keeps
    // following that (Core's ring reads --color-accent).
    if (names.focus && !Object.keys(exactFill).length) {
      const focus = names.focus;
      put(
        focus,
        f.id,
        each(m =>
          pick(
            focus,
            f.id,
            m,
            (fill[m] as StopRef).stop,
            surfaces(m, f.id),
            NON_TEXT,
          ),
        ),
      );
    }
  }

  // Secondary text on the parts the official Neutral theme lifts it on
  // (LIFT_PARTS), lifted the same way: for each background (the accent
  // tint, the neutral track), the gray shade nearest the secondary text's
  // own that reads at 4.5:1 on it and on it under a hover, over every
  // surface. The grays are the neutral color's, else a gray ramp grown
  // from the base theme's own secondary text. A mode where the theme sets
  // secondary text exactly takes that value instead, as written.
  let lift: PaletteMapping['lift'] = null;
  {
    const valueOf = (m: PaletteMode, token: string): string | null => {
      const v =
        rawOf(token, m) ?? tokens[token]?.[m].color ?? base?.[m]?.[token];
      return v && parseColor(v) ? v : null;
    };
    /** The secondary text a mode starts from. */
    const startText = (m: PaletteMode): string | null => {
      const v =
        tokens['--color-text-secondary']?.[m].color ??
        base?.[m]?.['--color-text-secondary'];
      const rgb = v ? parseColor(v) : null;
      return rgb ? hex(rgb) : null;
    };
    /** The gray ramp of a mode, and whether its shades are the palette's neutral ones. */
    const grays = (
      m: PaletteMode,
    ): {ramp: Record<string, string>; palette: boolean} | null => {
      if (neutral) {
        return {
          ramp: rampOf(candidate, 'neutral', m),
          palette: true,
        };
      }
      const seed = startText(m);
      const ramp = seed ? grownGrays(seed, m) : null;
      return ramp ? {ramp, palette: false} : null;
    };
    /** A color drawn over each of `under`, as the eye sees it. */
    const drawn = (
      name: string,
      color: string,
      under: [string, string][],
    ): [string, string][] => {
      const top = parseColor(color) as ColorTriple;
      const a = alphaOf(color);
      return under.map(([n, c]) => [
        `${name} over ${n}`,
        hex(compositeOver(top, a, parseColor(c) as ColorTriple)),
      ]);
    };
    const found: Record<string, Partial<Record<PaletteMode, StopRef>>> = {};
    for (const ground of new Set(LIFT_PARTS.map(([, , g]) => g))) {
      const {what, parts} = LIFT_GROUNDS[ground];
      /**
       * The shade the base theme itself lifts this ground's text to in a
       * mode, when it gives one: the search starts there, so a change of
       * color moves it only when that shade no longer reads.
       */
      const baseLift = (m: PaletteMode): string | null => {
        for (const [part, block, g] of LIFT_PARTS) {
          if (g !== ground) {
            continue;
          }
          const v = partStyle(base?.components, part, block)?.[
            '--color-text-secondary'
          ];
          const pair = sides(v);
          const c = pair?.[m === 'light' ? 0 : 1]?.trim();
          const rgb = c ? parseColor(c) : null;
          if (rgb) {
            return hex(rgb);
          }
        }
        return null;
      };
      const byMode: Partial<Record<PaletteMode, StopRef>> = {};
      for (const m of modes) {
        const own = rawOf('--color-text-secondary', m);
        const literal = (): void => {
          byMode[m] = {stop: 0, color: own as string, family: 'literal'};
        };
        const fillColor = valueOf(m, ground);
        const g = grays(m);
        const textColor = startText(m);
        if (!fillColor || !g || !textColor) {
          if (own) {
            literal();
            continue;
          }
          break;
        }
        const seen = drawn(what, fillColor, surfaces(m, 'neutral'));
        const hover = valueOf(m, '--color-overlay-hover');
        const on: [string, string][] = [
          ...seen,
          ...(hover && alphaOf(hover) > 0
            ? drawn('a hover', hover, seen).map(([n, c]): [string, string] => [
                n.replace(/^a hover over (.*)$/, '$1 under a hover'),
                c,
              ])
            : []),
        ];
        const keys = Object.keys(g.ramp)
          .map(Number)
          .sort((a, b) => a - b);
        if (
          own &&
          parseColor(own) &&
          Math.min(...on.map(([, bg]) => contrast(own, bg))) >= TEXT
        ) {
          literal();
          continue;
        }
        const ownRgb = own ? parseColor(own) : null;
        const from = (ownRgb ? hex(ownRgb) : null) ?? baseLift(m) ?? textColor;
        const start = keys.reduce((x, y) =>
          perceptualDelta(g.ramp[y], from) < perceptualDelta(g.ramp[x], from)
            ? y
            : x,
        );
        const scored = keys
          .sort(
            (a, b) =>
              Math.abs(a - start) - Math.abs(b - start) ||
              (Math.sign(b - a) === TOWARD_CONTRAST[m] ? 1 : -1),
          )
          .map(stop => ({
            stop,
            r: Math.min(...on.map(([, bg]) => contrast(g.ramp[stop], bg))),
          }));
        const b =
          scored.find(x => x.r >= TEXT) ??
          scored.reduce((x, y) => (y.r > x.r ? y : x));
        byMode[m] = g.palette
          ? ref('neutral', m, b.stop)
          : {stop: b.stop, color: g.ramp[b.stop], family: 'literal'};
        const moved = hex(parseColor(g.ramp[b.stop]) as ColorTriple) !== from;
        if (b.r < TEXT || moved) {
          checks.push({
            token: '--color-text-secondary',
            mode: m,
            stop: b.stop,
            preferred: start,
            against: `${what} over the surfaces`,
            ratio: round(b.r),
            needs: TEXT,
            pass: b.r >= TEXT,
            dials: ['accent', 'neutral'],
            note:
              b.r >= TEXT
                ? `--color-text-secondary on ${parts} uses ${g.ramp[b.stop]} in ${m}, not ${from}, so it stays readable (${round(b.r)}:1) on ${what} and under a hover`
                : `--color-text-secondary on ${parts} reads at only ${round(b.r)}:1 in ${m} on ${what} even at ${g.ramp[b.stop]}, the most contrasting gray (needs ${TEXT}:1): pick another accent or neutral, or set --color-text-secondary on those parts exactly`,
          });
        }
      }
      if (modes.every(m => byMode[m])) {
        found[ground] = byMode;
      }
    }
    if (Object.keys(found).length) {
      lift = found;
    }
  }

  return {
    tokens,
    contrast: checks.filter(c => c.note !== ''),
    exact,
    unread,
    lift,
  };
}

/**
 * A part-style value's light and dark halves: a `[light, dark]` pair, a
 * `light-dark()` value split at its top-level comma, or one value for
 * both; null for anything else.
 */
function sides(v: unknown): string[] | null {
  if (Array.isArray(v)) {
    return v as string[];
  }
  if (typeof v !== 'string') {
    return null;
  }
  const inner = /^light-dark\((.*)\)$/s.exec(v.trim())?.[1];
  return inner ? splitTopComma(inner) : [v, v];
}

/** Splits a CSS value at its top-level commas (outside brackets). */
export function splitTopComma(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of value) {
    if (c === '(') {
      depth++;
    }
    if (c === ')') {
      depth--;
    }
    if (depth === 0 && c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
