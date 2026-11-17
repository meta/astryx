// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The colors a palette derives beyond its own families: Core's
 * category colors (Badge, Token and Card tints) and the chart colors.
 * @input A generated palette, the theme's text and surface colors per mode.
 * @output The seeds of the derived hues, and each derived token's stops.
 * @position Beside the generator, so the theme editor and a later
 *   `defineTheme({palette})` derive the same colors from one function.
 *
 * Each hue grows from Core's own hue at the strength of the theme's accent
 * (the palette's vibrancy then shapes it as it shapes every color). Each
 * token starts at the stop the official neutral theme maps it to: a card
 * tint pale enough that the theme's text and secondary text read on it,
 * text on it and on the page at 4.5:1, icons at 3:1 (WCAG 2.2 SC 1.4.3,
 * 1.4.11), and chart series at 3:1 on the page. A set that draws two hues
 * alike (fill and text, or series, under ΔE 2), or holds a color that
 * cannot reach its contrast, is refused: the theme keeps its base's.
 */

import {hexToOklch, luminance, maxOklchChroma, oklchClampedHex} from './color';
import {perceptualDelta} from './generator';

type Mode = 'light' | 'dark';
type Stop = {stop: number; color: string; family?: string; alpha?: string};

/**
 * The stops a category fill may take, by mode: it is also a card's tint, so
 * it stays pale in light and deep in dark.
 */
const TINT_STOPS = {light: [70, 95], dark: [10, 35]} as const;
type DerivedToken = {family: string; light: Stop; dark: Stop};

/** Core's category hues; gray is the neutral family's. */
export const CATEGORY_HUES = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;

/** The chart's series hues, in Core's series order. */
export const CHART_SERIES = [
  'blue',
  'orange',
  'purple',
  'green',
  'pink',
  'cyan',
  'red',
  'teal',
  'brown',
  'indigo',
] as const;

/** Each chart scale and the family it is drawn from. */
export const CHART_SCALES = {
  blue: 'blue',
  shamrock: 'green',
  orange: 'orange',
  pink: 'pink',
  purple: 'purple',
  red: 'red',
  teal: 'teal',
  yellow: 'yellow',
  gray: 'neutral',
} as Readonly<Record<string, string>>;

/** The stops of a scale's five steps, pale to deep. */
const SCALE_STOPS = [92, 75, 55, 35, 15];

/**
 * The seed each derived hue grows from: the official neutral palette's
 * category seeds (packages/themes/neutral/palette.config.json; a test keeps
 * them equal), and Core's own chart colors for the two series no category
 * has.
 */
export const HUE_SEEDS = {
  red: '#d62830',
  orange: '#d57113',
  yellow: '#f8c723',
  green: '#358a3a',
  teal: '#0c7365',
  cyan: '#0c6f82',
  blue: '#0074e2',
  purple: '#980fb2',
  pink: '#b10e69',
  brown: '#965E03',
  indigo: '#6F8AFF',
} as Readonly<Record<string, string>>;

/**
 * Where each category token starts, `[light, dark]`, as the official
 * neutral theme maps it (a test keeps them equal).
 */
export const CATEGORY_STOPS = {
  background: [85, 25],
  border: [80, 65],
  icon: [25, 75],
  text: [25, 80],
  grayBackground: [90, 20],
  grayBorder: [85, 15],
  grayIcon: [30, 65],
  grayText: [10, 85],
} as const;

/** WCAG 2.2 AA by role. */
const TEXT = 4.5;
const NON_TEXT = 3;
/** Two colors under this ΔE (×100) read as one. */
const ALIKE = 2;
/** Below this chroma a seed is a gray. */
const GRAY_CHROMA = 0.02;

/** How strong a color is for its lightness and hue, 0 to 1. */
function strength(color: string) {
  const {L, C, H} = hexToOklch(color);
  const most = maxOklchChroma(H, L);
  return most > 0 ? Math.min(1, C / most) : 0;
}

/**
 * How strong the look's colors are against Core's: the accent's strength
 * over the median of Core's hues, in steps of 0.05 (so an accent of about
 * the same strength leaves them as they are); 1 without a colored accent.
 */
function strengthScale(accent: string | null | undefined) {
  const core = Object.values(HUE_SEEDS)
    .map(strength)
    .sort((a, b) => a - b);
  const median = core[Math.floor(core.length / 2)];
  return accent && hexToOklch(accent).C >= GRAY_CHROMA && median > 0
    ? Math.round(
        Math.min(1.2, Math.max(0.25, strength(accent) / median)) * 20,
      ) / 20
    : 1;
}

/**
 * The seeds of the derived hues: Core's hues at the strength of the accent,
 * in steps of 0.05 so an accent of about the same strength leaves them as
 * they are, turned a little toward the accent's and a tinted neutral's hue
 * (hueLean); Core's strength without a colored accent.
 */
export function lookSeeds(
  accent: string | null | undefined,
  neutral: string | null | undefined,
): Record<string, string> {
  const hues = Object.keys(HUE_SEEDS);
  const scale = strengthScale(accent);
  const lean = hueLean(accent, neutral);
  return Object.fromEntries(
    hues.map(h => {
      const {L, C, H} = hexToOklch(HUE_SEEDS[h]);
      return [h, oklchClampedHex(L, C * scale, lean(H))];
    }),
  );
}

/** The most a look turns a hue toward its accent, and toward its neutral. */
const LEAN_TO_ACCENT = 10;
const LEAN_TO_NEUTRAL = 6;

/**
 * How the look turns each hue: a share of the way toward the accent's hue
 * (at most 10°), and toward a tinted neutral's (at most 6°), so a slate
 * theme's colors run cool and a warm gray's warm, and two looks with the
 * same strength still differ. Rounded to whole degrees so a nearby color
 * leaves the hues as they are.
 */
function hueLean(
  accent: string | null | undefined,
  neutral: string | null | undefined,
): (hue: number) => number {
  const toward: (
    c: string | null | undefined,
    share: number,
    most: number,
  ) => (hue: number) => number = (
    c,
    share,
    most,
  ): ((hue: number) => number) => {
    if (!c) return () => 0;
    const {C, H} = hexToOklch(c);
    if (C < GRAY_CHROMA) return () => 0;
    return (hue: number) => {
      const gap = ((H - hue + 540) % 360) - 180;
      return Math.max(-most, Math.min(most, gap * share));
    };
  };
  const a = toward(accent, 0.15, LEAN_TO_ACCENT);
  const n = toward(neutral, 0.1, LEAN_TO_NEUTRAL);
  return hue => (Math.round(hue + a(hue) + n(hue)) + 360) % 360;
}

/**
 * Where a look's card tints start, `[light, dark]`: a strong or dark
 * accent draws them a step deeper, a pale accent a step paler; the
 * official neutral theme's stops otherwise.
 */
export function tintStops(
  accent: string | null | undefined,
): readonly [number, number] {
  if (!accent || hexToOklch(accent).C < GRAY_CHROMA)
    return CATEGORY_STOPS.background;
  const {L} = hexToOklch(accent);
  if (strengthScale(accent) >= 1.1 || L < 0.4) return [80, 30];
  if (L > 0.8) return [90, 20];
  return CATEGORY_STOPS.background;
}

/**
 * Whether a family is one lookSeeds grows: an id, a name and a seed at
 * Core's own lightness and hue for that id (only its strength follows the
 * look).
 */
export function isLookFamily(input: unknown) {
  const family = (input ?? {}) as Record<string, unknown>;
  const core = HUE_SEEDS[String(family.id)];
  if (!core || typeof family?.seed !== 'string') return false;
  if (!Object.keys(family).every(k => ['id', 'name', 'seed'].includes(k)))
    return false;
  let a;
  try {
    a = hexToOklch(family.seed);
  } catch {
    return false;
  }
  const b = hexToOklch(core);
  const turn = Math.abs(((a.H - b.H + 540) % 360) - 180);
  // A weak seed's hue moves a little when written as hex.
  const slack =
    2 +
    LEAN_TO_ACCENT +
    LEAN_TO_NEUTRAL +
    (Math.atan2(0.004, Math.max(a.C, 1e-6)) * 180) / Math.PI;
  return Math.abs(a.L - b.L) < 0.02 && (turn < slack || a.C < GRAY_CHROMA);
}

/**
 * A see-through color over an opaque one, as the eye sees it.
 * @param alpha - Two hex digits. */
function over(color: string, alpha: string, under: string) {
  const a = parseInt(alpha, 16) / 255;
  const ch = (c: string, i: number) =>
    parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map(i =>
      Math.round(a * ch(color, i) + (1 - a) * ch(under, i))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function contrast(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The category and chart colors a palette derives.
 * @param input.palette - Generated families by id.
 * @param input.stops - The palette's stops.
 * @param input.text - The theme's text and secondary text colors (opaque hex) in a mode.
 * @param input.grounds - The surfaces text sits on in a mode: page, surface, card (opaque hex).
 * @param [input.wanted] - Whether a token is written (Core has it and the theme does not set it by hand).
 * @param [input.accent] - The look's accent seed: how deep its card tints sit (tintStops).
 */
export function deriveLookColors({
  palette,
  stops,
  modes,
  text,
  grounds,
  wanted = () => true,
  accent = null,
}: {
  palette: Record<string, Record<Mode, Record<string | number, string>>>;
  stops: number[];
  modes: Mode[];
  text: (m: Mode) => string[];
  grounds: (m: Mode) => string[];
  wanted?: (token: string) => boolean;
  accent?: string | null;
}): {
  tokens: Record<string, DerivedToken>;
  badges: 'derived' | 'merged' | 'unreadable' | 'none';
  chart: 'derived' | 'merged' | 'unreadable' | 'none';
  merged: string[];
  unreadable: Array<{
    token: string;
    mode: Mode;
    stop: number;
    ratio: number;
    needs: number;
  }>;
} {
  const tokens: Record<string, DerivedToken> = {};
  const unreadable: Array<{
    token: string;
    mode: Mode;
    stop: number;
    ratio: number;
    needs: number;
  }> = [];
  const merged: string[] = [];
  const tint = tintStops(accent);
  const out = {
    tokens,
    badges: 'none' as 'derived' | 'merged' | 'unreadable' | 'none',
    chart: 'none' as 'derived' | 'merged' | 'unreadable' | 'none',
    merged,
    unreadable,
  };
  const sorted = [...stops].sort((a, b) => a - b);
  const near = (n: number): number =>
    sorted.reduce(
      (best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best),
      sorted[0],
    );
  const at = (id: string, m: Mode, stop: number): Stop => ({
    stop,
    color: String(palette[id][m][stop]),
  });
  /**
   * The stop nearest `start` that reads at `needs` on every ground,
   * searched both ways (darker first in light, lighter first in dark); the
   * most contrasting one, noted, when none does.
   * */
  const pick = (
    token: string,
    id: string,
    m: Mode,
    start: number,
    on: string[],
    needs: number,
  ) => {
    const s0 = near(start);
    const order = [...sorted].sort(
      (a, b) =>
        Math.abs(a - s0) - Math.abs(b - s0) || (m === 'light' ? a - b : b - a),
    );
    const scored = order.map(stop => ({
      stop,
      r: Math.min(...on.map(bg => contrast(at(id, m, stop).color, bg))),
    }));
    const best =
      scored.find(x => x.r >= needs) ??
      scored.reduce((x, y) => (y.r > x.r ? y : x));
    if (best.r < needs)
      unreadable.push({
        token,
        mode: m,
        stop: best.stop,
        ratio: Math.round(best.r * 100) / 100,
        needs,
      });
    return at(id, m, best.stop);
  };
  const each = (fn: (m: Mode) => Stop): Record<Mode, Stop> => {
    const v = {} as Record<Mode, Stop>;
    for (const m of ['light', 'dark'] as Mode[])
      v[m] = fn(modes.includes(m) ? m : modes[0]);
    return v;
  };
  /**
   * The pairs of hues drawn alike: every color given for both under ΔE 2
   * in some mode.
   */
  const alike = (drawn: Record<string, Record<Mode, string[]>>): string[] => {
    const names = Object.keys(drawn);
    const found: string[] = [];
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        for (const m of modes) {
          const a = drawn[names[i]][m];
          const b = drawn[names[j]][m];
          if (a.every((c, k) => perceptualDelta(c, b[k]) < ALIKE)) {
            found.push(`${names[i]} and ${names[j]} (${m})`);
            break;
          }
        }
    return found;
  };

  // Category colors: Badge and Token fill and text, Card tints.
  const hues = CATEGORY_HUES.filter(h => h !== 'gray' || palette.neutral);
  const famOf = (h: string) => (h === 'gray' ? 'neutral' : h);
  if (hues.every(h => palette[famOf(h)])) {
    const badge: Record<string, DerivedToken> = {};
    const drawn: Record<string, Record<Mode, string[]>> = {};
    const first = unreadable.length;
    for (const h of hues) {
      const id = famOf(h);
      const gray = h === 'gray';
      const start = (
        role: 'background' | 'border' | 'icon' | 'text',
        m: Mode,
      ) => {
        const pair = gray
          ? {
              background: CATEGORY_STOPS.grayBackground,
              border: CATEGORY_STOPS.grayBorder,
              icon: CATEGORY_STOPS.grayIcon,
              text: CATEGORY_STOPS.grayText,
            }[role]
          : CATEGORY_STOPS[role];
        return pair[m === 'light' ? 0 : 1];
      };
      const fill = each(m => {
        const s0 = near(
          h === 'gray' ? start('background', m) : tint[m === 'light' ? 0 : 1],
        );
        // Paler first in light, darker first in dark: a tint, never a solid
        // fill, since it is also the card's tint.
        const order = [...sorted].sort(
          (a, b) =>
            Math.abs(a - s0) - Math.abs(b - s0) ||
            (m === 'light' ? b - a : a - b),
        );
        // It stays a tint: a text color it cannot carry within the tint's
        // stops leaves the hue unreadable, never a white or black fill.
        const [lo, hi] = TINT_STOPS[m];
        const reads = text(m);
        const s = order
          .filter(x => x >= lo && x <= hi)
          .find(x => reads.every(c => contrast(c, at(id, m, x).color) >= TEXT));
        if (s == null) {
          const worst = Math.min(
            ...reads.map(c => contrast(c, at(id, m, s0).color)),
          );
          unreadable.push({
            token: `--color-background-${h}`,
            mode: m,
            stop: s0,
            ratio: Math.round(worst * 100) / 100,
            needs: TEXT,
          });
          return at(id, m, s0);
        }
        return at(id, m, s);
      });
      const on = (m: Mode) => [fill[m].color, ...grounds(m)];
      const ink = each(m =>
        pick(`--color-text-${h}`, id, m, start('text', m), on(m), TEXT),
      );
      badge[`--color-background-${h}`] = {family: id, ...fill};
      badge[`--color-text-${h}`] = {family: id, ...ink};
      badge[`--color-icon-${h}`] = {
        family: id,
        ...each(m =>
          pick(`--color-icon-${h}`, id, m, start('icon', m), on(m), NON_TEXT),
        ),
      };
      badge[`--color-border-${h}`] = {
        family: id,
        ...each(m => at(id, m, near(start('border', m)))),
      };
      drawn[h] = {
        light: [fill.light.color, ink.light.color],
        dark: [fill.dark.color, ink.dark.color],
      };
    }
    const pairs = alike(drawn);
    if (pairs.length) {
      merged.push(...pairs);
      unreadable.length = first;
      out.badges = 'merged';
    } else if (unreadable.length > first) {
      // A color that cannot reach its contrast is not written either: the
      // base theme's stay, and `unreadable` says which.
      out.badges = 'unreadable';
    } else {
      for (const [k, v] of Object.entries(badge)) if (wanted(k)) tokens[k] = v;
      out.badges = 'derived';
    }
  }

  // Chart colors: series at 3:1 on the page (graphics), a gray, and the
  // five-step scales.
  if (CHART_SERIES.every(h => palette[h])) {
    const chart: Record<string, DerivedToken> = {};
    const series: Record<string, Record<Mode, string[]>> = {};
    const first = unreadable.length;
    for (const h of CHART_SERIES) {
      const k = `--color-data-categorical-${h}`;
      const refs = each(m =>
        pick(k, h, m, m === 'light' ? 50 : 60, grounds(m), NON_TEXT),
      );
      chart[k] = {family: h, ...refs};
      series[h] = {light: [refs.light.color], dark: [refs.dark.color]};
    }
    if (palette.neutral)
      chart['--color-data-neutral'] = {
        family: 'neutral',
        ...each(m =>
          pick('--color-data-neutral', 'neutral', m, 55, grounds(m), NON_TEXT),
        ),
      };
    for (const [scale, id] of Object.entries(CHART_SCALES))
      if (palette[id])
        SCALE_STOPS.forEach((stop, i) => {
          chart[`--color-data-${scale}-${i + 1}`] = {
            family: id,
            ...each(m => at(id, m, near(stop))),
          };
        });
    const pairs = alike(series);
    if (pairs.length) {
      merged.push(...pairs.map(x => `chart ${x}`));
      unreadable.length = first;
      out.chart = 'merged';
    } else if (unreadable.length > first) {
      out.chart = 'unreadable';
    } else {
      for (const [k, v] of Object.entries(chart)) if (wanted(k)) tokens[k] = v;
      out.chart = 'derived';
    }
  }
  return out;
}

/**
 * The status roles a palette derives for a look that leaves them unset: each
 * role's dial id and the word its tokens carry.
 */
export const STATUS_ROLES = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
} as Readonly<Record<string, string>>;

/**
 * A status fill under this ΔE (×100, an OKLab distance of 0.1) from the
 * accent's reads as the accent at a glance, as two button fills do.
 */
const APART_FROM_ACCENT = 10;
/** How far apart, in hue, a status role keeps from the accent. */
const ROLE_APART = 30;
/** How far a role's hue may turn to keep apart, so it stays its family. */
const ROLE_TURN = 40;

/**
 * The seeds of the status roles a look derives: each role's own hue and
 * lightness (the base theme's color for it) at the accent's strength,
 * turned away from the accent's hue when the two would sit within 30°
 * (at most 40°, so info stays a blue, danger a red).
 * @param base - Each role's base color by dial id (info, success, warning, danger).
 */
export function statusSeeds(
  base: Record<string, string>,
  accent: string | null | undefined,
): Record<string, string> {
  const scale = strengthScale(accent);
  const a = accent ? hexToOklch(accent) : null;
  const out: Record<string, string> = {};
  for (const [id, color] of Object.entries(base)) {
    const {L, C, H} = hexToOklch(color);
    let hue = H;
    if (a && a.C >= GRAY_CHROMA) {
      const gap = ((H - a.H + 540) % 360) - 180;
      if (Math.abs(gap) < ROLE_APART) {
        const away = Math.min(ROLE_TURN, ROLE_APART - Math.abs(gap));
        hue = (H + (gap >= 0 ? away : -away) + 360) % 360;
      }
    }
    out[id] = oklchClampedHex(L, C * scale, hue);
  }
  return out;
}

/**
 * Where each status token starts, `[light, dark]`: the fill at its middle,
 * the text, tint and text on the tint where the official neutral theme maps
 * them, icons and borders at the fill.
 */
export const STATUS_STOPS = {
  fill: [50, 70],
  warningFill: [85, 85],
  text: [45, 80],
  muted: [85, 75],
  /** The dark tint is see-through, as the official neutral theme's is. */
  mutedDarkAlpha: '3D',
  onMuted: [25, 80],
} as const;

/**
 * The status colors a palette derives for the roles a theme leaves unset.
 * @param input.palette - Generated families by id; a role's family has the role's dial id.
 * @param input.roles - The dial ids to derive (info, success, warning, danger).
 * @param input.grounds - Page, surface, card (opaque hex).
 * @param input.inks - The text the theme draws on a role's fill in a mode, preferred first (white or near-black).
 * @param input.accent - The accent fill in a mode, kept apart from.
 * @returns A token's stop may name its own family (the text on a fill is the neutral color's, or white or black).
 */
export function deriveStatusColors({
  palette,
  stops,
  modes,
  roles,
  grounds,
  inks,
  accent,
  wanted = () => true,
}: {
  palette: Record<string, Record<Mode, Record<string | number, string>>>;
  stops: number[];
  modes: Mode[];
  roles: string[];
  grounds: (m: Mode) => string[];
  inks: (m: Mode, role: string) => Array<Stop & {family: string}>;
  accent: (m: Mode) => string | null;
  wanted?: (token: string) => boolean;
}): {
  tokens: Record<string, DerivedToken>;
  roles: Record<string, 'derived' | 'unreadable' | 'alike'>;
  why: string[];
} {
  const tokens: Record<string, DerivedToken> = {};
  const state: Record<string, 'derived' | 'unreadable' | 'alike'> = {};
  const why: string[] = [];
  const sorted = [...stops].filter(s => s > 0 && s < 100).sort((a, b) => a - b);
  const near = (n: number): number =>
    sorted.reduce(
      (best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best),
      sorted[0],
    );
  const each = (fn: (m: Mode) => Stop): Record<Mode, Stop> => {
    const v = {} as Record<Mode, Stop>;
    for (const m of ['light', 'dark'] as Mode[])
      v[m] = fn(modes.includes(m) ? m : modes[0]);
    return v;
  };
  for (const id of roles) {
    const w = STATUS_ROLES[id];
    const fam = palette[id];
    if (!w || !fam) continue;
    const at = (m: Mode, stop: number): Stop => ({
      stop,
      color: String(fam[m][stop]),
    });
    const fails: string[] = [];
    /**
     * The stop nearest `start` that reads at `needs` on every color in `bg`.
     * */
    const pick = (
      token: string,
      m: Mode,
      start: number,
      bg: string[],
      needs: number,
    ) => {
      const s0 = near(start);
      const order = [...sorted].sort(
        (a, b) =>
          Math.abs(a - s0) - Math.abs(b - s0) ||
          (m === 'light' ? a - b : b - a),
      );
      const scored = order.map(stop => ({
        stop,
        r: Math.min(...bg.map(c => contrast(at(m, stop).color, c))),
      }));
      const best =
        scored.find(x => x.r >= needs) ??
        scored.reduce((x, y) => (y.r > x.r ? y : x));
      if (best.r < needs)
        fails.push(
          `${token} reads at only ${Math.round(best.r * 100) / 100}:1 in ${m} (needs ${needs}:1)`,
        );
      return at(m, best.stop);
    };
    // The fill: nearest its middle that stands out from the page at 3:1 and
    // carries white or near-black text at 4.5:1 (near-black first on
    // warning, white first otherwise).
    const onFill = {} as Record<Mode, Stop & {family: string}>;
    // Warning is a bright fill that carries near-black text, as Core's is:
    // its text, not its edge, makes it read, so it is not held to 3:1 on
    // the page.
    const bright = id === 'warning';
    const fill = each(m => {
      const s0 = near(
        (bright ? STATUS_STOPS.warningFill : STATUS_STOPS.fill)[
          m === 'light' ? 0 : 1
        ],
      );
      const order = [...sorted].sort(
        (a, b) => Math.abs(a - s0) - Math.abs(b - s0) || b - a,
      );
      const choices = inks(m, id);
      // The role's usual text first: the nearest stop it reads on, before
      // the other text on a nearer stop.
      for (const ink of choices)
        for (const s of order) {
          const c = at(m, s).color;
          if (
            !bright &&
            Math.min(...grounds(m).map(g => contrast(c, g))) < NON_TEXT
          )
            continue;
          const a = accent(m);
          if (a && perceptualDelta(c, a) < APART_FROM_ACCENT) continue;
          if (contrast(ink.color, c) >= TEXT) {
            onFill[m] = ink;
            return at(m, s);
          }
        }
      fails.push(
        `--color-${w} cannot carry readable text and stand out from the page in ${m}`,
      );
      onFill[m] = choices[0];
      return at(m, s0);
    });
    const muted = each(m => {
      const stop = near(STATUS_STOPS.muted[m === 'light' ? 0 : 1]);
      const solid = at(m, stop);
      return m === 'dark'
        ? {
            stop,
            color: `${solid.color}${STATUS_STOPS.mutedDarkAlpha.toLowerCase()}`,
            alpha: STATUS_STOPS.mutedDarkAlpha.toLowerCase(),
          }
        : solid;
    });
    /** The tint as it shows over each surface. */
    const tintSeen = (m: Mode): string[] =>
      muted[m].alpha
        ? grounds(m).map(g =>
            over(muted[m].color.slice(0, 7), muted[m].alpha ?? 'ff', g),
          )
        : [muted[m].color];
    const set = {
      [`--color-${w}`]: fill,
      [`--color-${w}-muted`]: muted,
      [`--color-text-${w}`]: each(m =>
        pick(
          `--color-text-${w}`,
          m,
          STATUS_STOPS.text[m === 'light' ? 0 : 1],
          [...grounds(m), ...tintSeen(m)],
          TEXT,
        ),
      ),
      [`--color-on-${w}-muted`]: each(m =>
        pick(
          `--color-on-${w}-muted`,
          m,
          STATUS_STOPS.onMuted[m === 'light' ? 0 : 1],
          tintSeen(m),
          TEXT,
        ),
      ),
      [`--color-icon-${w}`]: each(m =>
        pick(`--color-icon-${w}`, m, fill[m].stop, grounds(m), NON_TEXT),
      ),
      [`--color-border-${w}`]: each(m =>
        pick(`--color-border-${w}`, m, fill[m].stop, grounds(m), NON_TEXT),
      ),
    };
    // Apart from the accent: a role whose fill is drawn like the accent's
    // would not tell a status from an action.
    const alike = modes.some(m => {
      const a = accent(m);
      return a ? perceptualDelta(fill[m].color, a) < APART_FROM_ACCENT : false;
    });
    if (fails.length) {
      state[id] = 'unreadable';
      why.push(...fails);
      continue;
    }
    if (alike) {
      state[id] = 'alike';
      why.push(`${id} would be drawn like the accent`);
      continue;
    }
    state[id] = 'derived';
    for (const [k, v] of Object.entries(set))
      if (wanted(k)) tokens[k] = {family: id, ...v};
    const inkToken = `--color-on-${w}`;
    if (wanted(inkToken))
      tokens[inkToken] = {
        family: onFill.light.family,
        light: onFill.light,
        dark: onFill.dark,
      };
  }
  return {tokens, roles: state, why};
}

/**
 * Code colors, `[family, light stop, dark stop]` by syntax role, as the
 * official neutral theme maps them. The gray roles read the neutral.
 */
export const SYNTAX_STOPS = {
  keyword: ['purple', 30, 80],
  string: ['green', 30, 80],
  comment: ['neutral', 35, 75],
  number: ['orange', 30, 80],
  function: ['blue', 30, 80],
  type: ['purple', 30, 80],
  variable: ['neutral', 5, 90],
  operator: ['neutral', 35, 75],
  constant: ['orange', 30, 80],
  tag: ['red', 30, 80],
  attribute: ['yellow', 30, 80],
  property: ['teal', 30, 80],
  punctuation: ['neutral', 35, 75],
} as const;

/** The code background and the overlay scrim, from the neutral. */
const CODE_GROUND = {light: 100, dark: 5} as const;
const SCRIM = {
  light: {stop: 10, alpha: '80'},
  dark: {stop: 5, alpha: 'cc'},
} as const;

/**
 * The code colors and the overlay scrim a palette derives: each syntax role
 * from its hue's family, the nearest stop that reads at 4.5:1 on the code
 * background and on the page; the code background and the scrim from the
 * neutral. A role that cannot read keeps the base theme's.
 * @param input.grounds - The page colors code sits on, opaque hex.
 */
export function deriveCodeColors({
  palette,
  stops,
  modes,
  grounds,
  wanted = () => true,
}: {
  palette: Record<string, Record<Mode, Record<string | number, string>>>;
  stops: number[];
  modes: Mode[];
  grounds: (m: Mode) => string[];
  wanted?: (token: string) => boolean;
}): {tokens: Record<string, DerivedToken>; unreadable: string[]} {
  const tokens: Record<string, DerivedToken> = {};
  const unreadable: string[] = [];
  const sorted = [...stops].sort((a, b) => a - b);
  const near = (n: number) =>
    sorted.reduce((x, y) => (Math.abs(y - n) < Math.abs(x - n) ? y : x));
  const at = (id: string, m: Mode, stop: number): Stop => ({
    stop,
    color: palette[id][m][stop],
  });
  const ground: Partial<Record<Mode, Stop>> = {};
  if (palette.neutral) {
    const bg = {} as Record<Mode, Stop>;
    for (const m of modes) {
      bg[m] = at('neutral', m, near(CODE_GROUND[m]));
      ground[m] = bg[m];
    }
    if (wanted('--color-syntax-background'))
      tokens['--color-syntax-background'] = {family: 'neutral', ...bg};
    const scrim = {} as Record<Mode, Stop>;
    for (const m of modes) {
      const s = near(SCRIM[m].stop);
      const c = palette.neutral[m][s];
      scrim[m] = {
        stop: s,
        color: `${c}${SCRIM[m].alpha}`,
        alpha: SCRIM[m].alpha,
      };
    }
    if (wanted('--color-overlay'))
      tokens['--color-overlay'] = {family: 'neutral', ...scrim};
  }
  for (const [role, [id, light, dark]] of Object.entries(SYNTAX_STOPS)) {
    const k = `--color-syntax-${role}`;
    if (!palette[id] || !wanted(k)) continue;
    const refs = {} as Record<Mode, Stop>;
    let ok = true;
    for (const m of modes) {
      const on = [...(ground[m] ? [ground[m].color] : []), ...grounds(m)];
      const s0 = near(m === 'light' ? light : dark);
      const order = [...sorted].sort(
        (a, b) =>
          Math.abs(a - s0) - Math.abs(b - s0) ||
          (m === 'light' ? a - b : b - a),
      );
      const s = order.find(x =>
        on.every(bg => contrast(palette[id][m][x], bg) >= TEXT),
      );
      if (s == null) {
        ok = false;
        unreadable.push(`${k} (${m})`);
        break;
      }
      refs[m] = at(id, m, s);
    }
    if (ok) tokens[k] = {family: id, ...refs};
  }
  return {tokens, unreadable};
}

/**
 * How full red-blind (protanopia) and green-blind (deuteranopia) vision maps
 * linear sRGB (Machado, Oliveira and Fernandes, 2009, severity 1). Anyone
 * red-weak or green-weak sees between these and normal vision.
 */
const CVD = {
  'red-weak': [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  'green-weak': [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;

/** How far toward full red- or green-blindness the check looks. */
const CVD_SEVERITY = 0.6;

/** Two fills closer than this (OKLab distance) read as one color. */
const CVD_ALIKE = 0.06;

function linearRgb(hex: string): number[] {
  return [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}

function oklabOfLinear([r, g, b]: number[]): number[] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * The pairs of status fills that someone red-weak or green-weak may not
 * tell apart: their colors as that vision sees them sit closer than
 * CVD_ALIKE.
 * @param fills - Opaque hex by role.
 */
export function cvdClashes(
  fills: Record<string, string>,
): Array<{a: string; b: string; vision: 'red-weak' | 'green-weak'}> {
  const out: Array<{a: string; b: string; vision: 'red-weak' | 'green-weak'}> =
    [];
  const roles = Object.keys(fills).filter(r =>
    /^#[0-9a-f]{6}$/i.test(fills[r]),
  );
  for (const [vision, M] of Object.entries(CVD) as Array<
    ['red-weak' | 'green-weak', readonly (readonly number[])[]]
  >) {
    // Weak, not absent: partway from normal vision to the full matrix.
    const W = M.map((row, r) =>
      row.map(
        (v, c) => (r === c ? 1 : 0) + CVD_SEVERITY * (v - (r === c ? 1 : 0)),
      ),
    );
    const seen = (hex: string) => {
      const lin = linearRgb(hex);
      return oklabOfLinear(
        W.map(row =>
          Math.min(
            1,
            Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]),
          ),
        ),
      );
    };
    for (let i = 0; i < roles.length; i++)
      for (let j = i + 1; j < roles.length; j++) {
        const x = seen(fills[roles[i]]);
        const y = seen(fills[roles[j]]);
        if (Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < CVD_ALIKE)
          out.push({a: roles[i], b: roles[j], vision});
      }
  }
  return out;
}
