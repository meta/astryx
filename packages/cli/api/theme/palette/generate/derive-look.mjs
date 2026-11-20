// Copyright (c) Meta Platforms, Inc. and affiliates.
// Generated from packages/core/src/palette/derive-look.ts by
// scripts/generate-cli-palette-engine.mjs. Do not edit: change the Core
// source and run `pnpm generate:cli-palette-engine`.
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
import {
  compositeOver,
  contrastRatio,
  hexToRgbTriple as rgbOf,
  rgbTripleToHex as hexOf,
  hexToLinearRgb,
  hexToOklch,
  linearRgbToOklab,
  maxOklchChroma,
  oklchClampedHex,
  ratioDown,
} from './color.mjs';
import {perceptualDelta} from './generator.mjs';

/** @typedef {'light' | 'dark'} Mode */

/**
 * @typedef {object} Stop
 * @property {number} stop
 * @property {string} color
 * @property {string} [family]
 * @property {string} [alpha]
 */

/**
 * A derived token: its family and its shade in each mode.
 * @typedef {object} DerivedToken
 * @property {string} family
 * @property {Stop} light
 * @property {Stop} dark
 */

/** Whether a derived set is written, and why not. */
/** @typedef {'derived' | 'merged' | 'unreadable' | 'none'} DerivedState */

/**
 * A derived color that cannot reach its contrast.
 * @typedef {object} UnreadableColor
 * @property {string} token
 * @property {Mode} mode
 * @property {number} stop
 * @property {number} ratio
 * @property {number} needs
 */

/**
 * The category and chart colors a palette derives.
 * @typedef {object} DerivedLook
 * @property {Record<string, DerivedToken>} tokens
 * @property {DerivedState} badges
 * @property {DerivedState} chart
 * @property {string[]} merged
 * @property {UnreadableColor[]} unreadable
 */

/**
 * What deriveLookColors reads.
 * @typedef {object} DeriveLookInput
 * @property {Record<string, Record<Mode, Record<string | number, string>>>} palette Generated families by id.
 * @property {ReadonlyArray<number>} stops The palette's stops.
 * @property {ReadonlyArray<Mode>} modes
 * @property {(m: Mode) => string[]} text The theme's text and secondary text colors (opaque hex) in a mode.
 * @property {string | null} [accent] The look's accent seed: how deep its card tints sit (tintStops).
 * @property {(m: Mode) => string[]} grounds The surfaces text sits on in a mode: page, surface, card (opaque hex).
 * @property {(token: string) => boolean} [wanted] Whether a token is written (Core has it and the theme does not set it by hand).
 */

/**
 * What deriveStatusColors reads.
 * @typedef {object} DeriveStatusInput
 * @property {Record<string, Record<Mode, Record<string | number, string>>>} palette Generated families by id; a role's family has the role's dial id.
 * @property {ReadonlyArray<number>} stops
 * @property {ReadonlyArray<Mode>} modes
 * @property {ReadonlyArray<string>} roles The dial ids to derive (info, success, warning, danger).
 * @property {(m: Mode) => string[]} grounds Page, surface, card (opaque hex).
 * @property {(m: Mode, role: string) => (Stop & {family: string})[]} inks The text the theme draws on a role's fill in a mode, preferred first (white or near-black).
 * @property {(m: Mode) => string | null} accent The accent fill in a mode, kept apart from.
 * @property {(token: string) => boolean} [wanted]
 */

/**
 * The status colors a palette derives, and each role's state. A token's stop may name its own family (the text on a fill is the neutral color's, or white or black).
 * @typedef {object} DerivedStatus
 * @property {Record<string, DerivedToken>} tokens
 * @property {Record<string, 'derived' | 'unreadable' | 'alike'>} roles
 * @property {string[]} why
 */

/**
 * What deriveCodeColors reads.
 * @typedef {object} DeriveCodeInput
 * @property {Record<string, Record<Mode, Record<string | number, string>>>} palette
 * @property {ReadonlyArray<number>} stops
 * @property {ReadonlyArray<Mode>} modes
 * @property {(m: Mode) => string[]} grounds The page colors code sits on, opaque hex.
 * @property {(m: Mode) => string | null} [codeGround] The code background the theme sets itself in a mode (opaque hex), which code colors read on instead of the neutral's.
 * @property {(token: string) => boolean} [wanted]
 */

export {ratioDown};
/** A shade of a family: its stop and color. */
/**
 * The stops a category fill may take, by mode: it is also a card's tint, so
 * it stays pale in light and deep in dark.
 */
const TINT_STOPS = /** @type {const} */ ({light: [70, 95], dark: [10, 35]});
/** Core's category hues; gray is the neutral family's. */
export const CATEGORY_HUES = /** @type {const} */ ([
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
]);
/** The chart's series hues, in Core's series order. */
export const CHART_SERIES = /** @type {const} */ ([
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
]);
/**
 * Each chart scale and the family it is drawn from.
 * @type {Readonly<Record<string, string>>}
 */
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
};
/** The stops of a scale's five steps, pale to deep. */
const SCALE_STOPS = [92, 75, 55, 35, 15];
/**
 * The seed each derived hue grows from: the official neutral palette's
 * category seeds (packages/themes/neutral/palette.config.json; a test keeps
 * them equal), and Core's own chart colors for the two series no category
 * has.
 * @type {Readonly<Record<string, string>>}
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
};
/**
 * Where each category token starts, `[light, dark]`, as the official
 * neutral theme maps it (a test keeps them equal).
 */
export const CATEGORY_STOPS = /** @type {const} */ ({
  background: [85, 25],
  border: [80, 65],
  icon: [25, 75],
  text: [25, 80],
  grayBackground: [90, 20],
  grayBorder: [85, 15],
  grayIcon: [30, 65],
  grayText: [10, 85],
});
/** WCAG 2.2 AA by role. */
const TEXT = 4.5;
const NON_TEXT = 3;
/** Two colors under this ΔE (×100) read as one. */
const ALIKE = 2;
/** Below this chroma a seed is a gray. */
const GRAY_CHROMA = 0.02;
/**
 * How strong a color is for its lightness and hue, 0 to 1.
 * @param {string} color
 * @returns {number}
 */
function strength(color) {
  const {L, C, H} = hexToOklch(color);
  const most = maxOklchChroma(H, L);
  return most > 0 ? Math.min(1, C / most) : 0;
}
/**
 * How strong the look's colors are against Core's: the accent's strength
 * over the median of Core's hues, in steps of 0.05 (so an accent of about
 * the same strength leaves them as they are); 1 without a colored accent.
 * @param {string | null | undefined} accent
 * @returns {number}
 */
function strengthScale(accent) {
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
 * @param {string | null | undefined} accent
 * @param {string | null} [neutral]
 * @returns {Record<string, string>}
 */
export function lookSeeds(accent, neutral) {
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
 * @param {string | null | undefined} accent
 * @param {string | null | undefined} neutral
 * @returns {(hue: number) => number}
 */
function hueLean(accent, neutral) {
  const toward =
    /**
     * @param {string | null | undefined} c
     * @param {number} share
     * @param {number} most
     * @returns {((hue: number) => number)}
     */
    (c, share, most) => {
      if (!c) {
        return () => 0;
      }
      const {C, H} = hexToOklch(c);
      if (C < GRAY_CHROMA) {
        return () => 0;
      }
      return hue => {
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
 * @param {string | null | undefined} accent
 * @returns {readonly [number, number]}
 */
export function tintStops(accent) {
  if (!accent || hexToOklch(accent).C < GRAY_CHROMA) {
    return CATEGORY_STOPS.background;
  }
  const {L} = hexToOklch(accent);
  if (strengthScale(accent) >= 1.1 || L < 0.4) {
    return [80, 30];
  }
  if (L > 0.8) {
    return [90, 20];
  }
  return CATEGORY_STOPS.background;
}
/**
 * Whether a family is one lookSeeds grows: an id, a name and a seed at
 * Core's own lightness and hue for that id (only its strength follows the
 * look).
 * @param {unknown} family
 * @returns {boolean}
 */
export function isLookFamily(family) {
  const f = /** @type {{id?: unknown; seed?: unknown} | null | undefined} */ (
    family
  );
  const core = typeof f?.id === 'string' ? HUE_SEEDS[f.id] : undefined;
  if (!core || typeof f?.seed !== 'string') {
    return false;
  }
  if (!Object.keys(f).every(k => ['id', 'name', 'seed'].includes(k))) {
    return false;
  }
  /**
   * @type {{L: number; C: number; H: number}}
   */
  let a;
  try {
    a = hexToOklch(f.seed);
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
 * The category and chart colors a palette derives.
 * @param {DeriveLookInput} param0
 * @returns {DerivedLook}
 */
export function deriveLookColors({
  palette,
  accent = null,
  stops,
  modes,
  text,
  grounds,
  wanted = () => true,
}) {
  /**
   * @type {Record<string, DerivedToken>}
   */
  const tokens = {};
  const tint = tintStops(accent);
  /**
   * @type {UnreadableColor[]}
   */
  const unreadable = [];
  /**
   * @type {string[]}
   */
  const merged = [];
  /**
   * @type {DerivedLook}
   */
  const out = {
    tokens,
    badges: 'none',
    chart: 'none',
    merged,
    unreadable,
  };
  const sorted = [...stops].sort((a, b) => a - b);
  const near =
    /**
     * @param {number} n
     * @returns {number}
     */
    n =>
      sorted.reduce(
        (best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best),
        sorted[0],
      );
  const at =
    /**
     * @param {string} id
     * @param {Mode} m
     * @param {number} stop
     * @returns {Stop}
     */
    (id, m, stop) => ({
      stop,
      color: palette[id][m][stop],
    });
  /**
   * The stop nearest `start` that reads at `needs` on every ground,
   * searched both ways (darker first in light, lighter first in dark); the
   * most contrasting one, noted, when none does.
   */
  const pick =
    /**
     * @param {string} token
     * @param {string} id
     * @param {Mode} m
     * @param {number} start
     * @param {string[]} on
     * @param {number} needs
     * @returns {Stop}
     */
    (token, id, m, start, on, needs) => {
      const s0 = near(start);
      const order = [...sorted].sort(
        (a, b) =>
          Math.abs(a - s0) - Math.abs(b - s0) ||
          (m === 'light' ? a - b : b - a),
      );
      const scored = order.map(stop => ({
        stop,
        r: Math.min(...on.map(bg => contrastRatio(at(id, m, stop).color, bg))),
      }));
      const best =
        scored.find(x => x.r >= needs) ??
        scored.reduce((x, y) => (y.r > x.r ? y : x));
      if (best.r < needs) {
        unreadable.push({
          token,
          mode: m,
          stop: best.stop,
          ratio: ratioDown(best.r),
          needs,
        });
      }
      return at(id, m, best.stop);
    };
  const each =
    /**
     * @param {(m: Mode) => Stop} fn
     * @returns {Record<Mode, Stop>}
     */
    fn => {
      const v = /** @type {Record<Mode, Stop>} */ ({});
      for (const m of /** @type {const} */ (['light', 'dark'])) {
        v[m] = fn(modes.includes(m) ? m : modes[0]);
      }
      return v;
    };
  /**
   * The pairs of hues drawn alike: every color given for both under ΔE 2
   * in some mode.
   */
  const alike =
    /**
     * @param {Record<string, Record<Mode, string[]>>} drawn
     * @returns {string[]}
     */
    drawn => {
      const names = Object.keys(drawn);
      /**
       * @type {string[]}
       */
      const found = [];
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          for (const m of modes) {
            const a = drawn[names[i]][m];
            const b = drawn[names[j]][m];
            if (a.every((c, k) => perceptualDelta(c, b[k]) < ALIKE)) {
              found.push(`${names[i]} and ${names[j]} (${m})`);
              break;
            }
          }
        }
      }
      return found;
    };
  // Category colors: Badge and Token fill and text, Card tints.
  const hues = CATEGORY_HUES.filter(h => h !== 'gray' || palette.neutral);
  const famOf =
    /**
     * @param {string} h
     * @returns {string}
     */
    h => (h === 'gray' ? 'neutral' : h);
  if (hues.every(h => palette[famOf(h)])) {
    /**
     * @type {Record<string, DerivedToken>}
     */
    const badge = {};
    /**
     * @type {Record<string, Record<Mode, string[]>>}
     */
    const drawn = {};
    const first = unreadable.length;
    for (const h of hues) {
      const id = famOf(h);
      const gray = h === 'gray';
      const start =
        /**
         * @param {'background' | 'border' | 'icon' | 'text'} role
         * @param {Mode} m
         * @returns {number}
         */
        (role, m) => {
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
          .find(x =>
            reads.every(c => contrastRatio(c, at(id, m, x).color) >= TEXT),
          );
        if (s == null) {
          const worst = Math.min(
            ...reads.map(c => contrastRatio(c, at(id, m, s0).color)),
          );
          unreadable.push({
            token: `--color-background-${h}`,
            mode: m,
            stop: s0,
            ratio: ratioDown(worst),
            needs: TEXT,
          });
          return at(id, m, s0);
        }
        return at(id, m, s);
      });
      const on =
        /**
         * @param {Mode} m
         * @returns {string[]}
         */
        m => [fill[m].color, ...grounds(m)];
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
      for (const [k, v] of Object.entries(badge)) {
        if (wanted(k)) {
          tokens[k] = v;
        }
      }
      out.badges = 'derived';
    }
  }
  // Chart colors: series at 3:1 on the page (graphics), a gray, and the
  // five-step scales.
  if (CHART_SERIES.every(h => palette[h])) {
    /**
     * @type {Record<string, DerivedToken>}
     */
    const chart = {};
    /**
     * @type {Record<string, Record<Mode, string[]>>}
     */
    const series = {};
    const first = unreadable.length;
    for (const h of CHART_SERIES) {
      const k = `--color-data-categorical-${h}`;
      const refs = each(m =>
        pick(k, h, m, m === 'light' ? 50 : 60, grounds(m), NON_TEXT),
      );
      chart[k] = {family: h, ...refs};
      series[h] = {light: [refs.light.color], dark: [refs.dark.color]};
    }
    if (palette.neutral) {
      chart['--color-data-neutral'] = {
        family: 'neutral',
        ...each(m =>
          pick('--color-data-neutral', 'neutral', m, 55, grounds(m), NON_TEXT),
        ),
      };
    }
    for (const [scale, id] of Object.entries(CHART_SCALES)) {
      if (palette[id]) {
        SCALE_STOPS.forEach((stop, i) => {
          chart[`--color-data-${scale}-${i + 1}`] = {
            family: id,
            ...each(m => at(id, m, near(stop))),
          };
        });
      }
    }
    const pairs = alike(series);
    if (pairs.length) {
      merged.push(...pairs.map(x => `chart ${x}`));
      unreadable.length = first;
      out.chart = 'merged';
    } else if (unreadable.length > first) {
      out.chart = 'unreadable';
    } else {
      for (const [k, v] of Object.entries(chart)) {
        if (wanted(k)) {
          tokens[k] = v;
        }
      }
      out.chart = 'derived';
    }
  }
  return out;
}
/**
 * The status roles a palette derives for a look that leaves them unset: each
 * role's dial id and the word its tokens carry.
 * @type {Readonly<Record<string, string>>}
 */
export const STATUS_ROLES = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
};
/**
 * A status fill under this ΔE (×100, an OKLab distance of 0.1) from the
 * accent's reads as the accent at a glance, as two button fills do.
 */
const APART_FROM_ACCENT = 10;
/**
 * The seeds of the status roles a look derives: each role's own hue and
 * lightness (the base theme's color for it) at the accent's strength. A
 * role keeps its hue whatever the accent: an error stays the base's red,
 * info its blue. Only its strength follows the look; a role that would
 * then read as the accent keeps the base theme's colors (deriveStatusColors).
 * `base` holds each role's base color by dial id (info, success, warning,
 * danger).
 * @param {Record<string, string>} base
 * @param {string | null | undefined} accent
 * @returns {Record<string, string>}
 */
export function statusSeeds(base, accent) {
  const scale = strengthScale(accent);
  /**
   * @type {Record<string, string>}
   */
  const out = {};
  for (const [id, color] of Object.entries(base)) {
    const {L, C, H} = hexToOklch(color);
    out[id] = oklchClampedHex(L, C * scale, H);
  }
  return out;
}
/**
 * Where each status token starts, `[light, dark]`: the fill at its middle,
 * the text, tint and text on the tint where the official neutral theme maps
 * them, icons and borders at the fill.
 */
export const STATUS_STOPS = /** @type {const} */ ({
  fill: [50, 70],
  warningFill: [85, 85],
  text: [45, 80],
  muted: [85, 75],
  /** The dark tint is see-through, as the official neutral theme's is. */
  mutedDarkAlpha: '3D',
  onMuted: [25, 80],
});
/**
 * The status colors a palette derives for the roles a theme leaves unset.
 * @param {DeriveStatusInput} param0
 * @returns {DerivedStatus}
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
}) {
  /**
   * @type {Record<string, DerivedToken>}
   */
  const tokens = {};
  /**
   * @type {Record<string, 'derived' | 'unreadable' | 'alike'>}
   */
  const state = {};
  /**
   * @type {string[]}
   */
  const why = [];
  const sorted = [...stops].filter(s => s > 0 && s < 100).sort((a, b) => a - b);
  const near =
    /**
     * @param {number} n
     */
    n =>
      sorted.reduce(
        (best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best),
        sorted[0],
      );
  const each =
    /**
     * @param {(m: Mode) => Stop} fn
     */
    fn => {
      const v = /** @type {Record<Mode, Stop>} */ ({});
      for (const m of /** @type {Mode[]} */ (['light', 'dark']))
        v[m] = fn(modes.includes(m) ? m : modes[0]);
      return v;
    };
  for (const id of roles) {
    const w = STATUS_ROLES[id];
    const fam = palette[id];
    if (!w || !fam) continue;
    const at =
      /**
       * @param {Mode} m
       * @param {number} stop
       */
      (m, stop) => ({stop, color: fam[m][stop]});
    /**
     * @type {string[]}
     */
    const fails = [];
    /**
     * The stop nearest `start` that reads at `needs` on every color in `bg`.
     */
    const pick =
      /**
       * @param {string} token
       * @param {Mode} m
       * @param {number} start
       * @param {string[]} bg
       * @param {number} needs
       * @returns {Stop}
       */
      (token, m, start, bg, needs) => {
        const s0 = near(start);
        const order = [...sorted].sort(
          (a, b) =>
            Math.abs(a - s0) - Math.abs(b - s0) ||
            (m === 'light' ? a - b : b - a),
        );
        const scored = order.map(stop => ({
          stop,
          r: Math.min(...bg.map(c => contrastRatio(at(m, stop).color, c))),
        }));
        const best =
          scored.find(x => x.r >= needs) ??
          scored.reduce((x, y) => (y.r > x.r ? y : x));
        if (best.r < needs)
          fails.push(
            `${token} reads at only ${ratioDown(best.r)}:1 in ${m} (needs ${needs}:1)`,
          );
        return at(m, best.stop);
      };
    // The fill: nearest its middle that stands out from the page at 3:1 and
    // carries white or near-black text at 4.5:1 (near-black first on
    // warning, white first otherwise).
    const onFill = /** @type {Record<Mode, Stop & {family: string}>} */ ({});
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
            Math.min(...grounds(m).map(g => contrastRatio(c, g))) < NON_TEXT
          )
            continue;
          // (A bright fill already starts at the palest stop that reads as
          // a fill on a light page: one kept apart from the accent moves
          // deeper, never paler toward the page.)
          if (bright && m === 'light' && s > s0) continue;
          const a = accent(m);
          if (a && perceptualDelta(c, a) < APART_FROM_ACCENT) continue;
          if (contrastRatio(ink.color, c) >= TEXT) {
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
      let stop = near(STATUS_STOPS.muted[m === 'light' ? 0 : 1]);
      // (A light tint is paler than its fill: where the fill already sits
      // at the tint's stop or paler, a bright warning or one an accent made
      // pale, the tint takes the next paler stop that is another color.)
      if (m === 'light') {
        const paler = sorted.filter(
          s => s > fill[m].stop && at(m, s).color !== fill[m].color,
        );
        if (stop <= fill[m].stop || at(m, stop).color === fill[m].color)
          stop = paler[0] ?? stop;
      }
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
    const tintSeen =
      /**
       * @param {Mode} m
       */
      m =>
        muted[m].alpha
          ? grounds(m).map(g =>
              hexOf(
                compositeOver(
                  rgbOf(muted[m].color.slice(0, 7)),
                  parseInt(muted[m].alpha ?? 'ff', 16) / 255,
                  rgbOf(g),
                ),
              ),
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
export const SYNTAX_STOPS = /** @type {const} */ ({
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
});
/** The code background and the overlay scrim, from the neutral. */
const CODE_GROUND = /** @type {const} */ ({light: 100, dark: 5});
const SCRIM = /** @type {const} */ ({
  light: {stop: 10, alpha: '80'},
  dark: {stop: 5, alpha: 'cc'},
});
/**
 * The code colors and the overlay scrim a palette derives: each syntax role
 * from its hue's family, the nearest stop that reads at 4.5:1 on the code
 * background and on the page; the code background and the scrim from the
 * neutral. A role that cannot read keeps the base theme's.
 * @param {DeriveCodeInput} param0
 * @returns {{ tokens: Record<string, DerivedToken>; unreadable: string[]; }}
 */
export function deriveCodeColors({
  palette,
  stops,
  modes,
  grounds,
  codeGround = () => null,
  wanted = () => true,
}) {
  /**
   * @type {Record<string, DerivedToken>}
   */
  const tokens = {};
  /**
   * @type {string[]}
   */
  const unreadable = [];
  const sorted = [...stops].sort((a, b) => a - b);
  const near =
    /**
     * @param {number} n
     */
    n => sorted.reduce((x, y) => (Math.abs(y - n) < Math.abs(x - n) ? y : x));
  const at =
    /**
     * @param {string} id
     * @param {Mode} m
     * @param {number} stop
     * @returns {Stop}
     */
    (id, m, stop) => ({
      stop,
      color: palette[id][m][stop],
    });
  /**
   * @type {Partial<Record<Mode, Stop>>}
   */
  const ground = {};
  if (palette.neutral) {
    const bg = /** @type {Record<Mode, Stop>} */ ({});
    for (const m of modes) {
      bg[m] = at('neutral', m, near(CODE_GROUND[m]));
      ground[m] = bg[m];
    }
    if (wanted('--color-syntax-background')) {
      tokens['--color-syntax-background'] = {family: 'neutral', ...bg};
    }
    const scrim = /** @type {Record<Mode, Stop>} */ ({});
    for (const m of modes) {
      const s = near(SCRIM[m].stop);
      const c = palette.neutral[m][s];
      scrim[m] = {
        stop: s,
        color: `${c}${SCRIM[m].alpha}`,
        alpha: SCRIM[m].alpha,
      };
    }
    if (wanted('--color-overlay')) {
      tokens['--color-overlay'] = {family: 'neutral', ...scrim};
    }
  }
  for (const [role, [id, light, dark]] of Object.entries(SYNTAX_STOPS)) {
    const k = `--color-syntax-${role}`;
    if (!palette[id] || !wanted(k)) {
      continue;
    }
    const refs = /** @type {Record<Mode, Stop>} */ ({});
    let ok = true;
    for (const m of modes) {
      // A code background the theme sets itself is the one code shows on.
      const own = codeGround(m);
      const on = [
        ...(own ? [own] : ground[m] ? [ground[m].color] : []),
        ...grounds(m),
      ];
      const s0 = near(m === 'light' ? light : dark);
      const order = [...sorted].sort(
        (a, b) =>
          Math.abs(a - s0) - Math.abs(b - s0) ||
          (m === 'light' ? a - b : b - a),
      );
      const s = order.find(x =>
        on.every(bg => contrastRatio(palette[id][m][x], bg) >= TEXT),
      );
      if (s == null) {
        ok = false;
        unreadable.push(`${k} (${m})`);
        break;
      }
      refs[m] = at(id, m, s);
    }
    if (ok) {
      tokens[k] = {family: id, ...refs};
    }
  }
  return {tokens, unreadable};
}
/**
 * How full red-blind (protanopia) and green-blind (deuteranopia) vision maps
 * linear sRGB (Machado, Oliveira and Fernandes, 2009, severity 1). Anyone
 * red-weak or green-weak sees between these and normal vision.
 * @type {Record< 'red-weak' | 'green-weak', ReadonlyArray<ReadonlyArray<number>> >}
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
};
/** How far toward full red- or green-blindness the check looks. */
const CVD_SEVERITY = 0.6;
/** Two fills closer than this (OKLab distance) read as one color. */
const CVD_ALIKE = 0.06;
/**
 * The pairs of status fills that someone red-weak or green-weak may not
 * tell apart: their colors as that vision sees them sit closer than
 * CVD_ALIKE. `fills` holds opaque hex by role.
 * @param {Record<string, string>} fills
 * @returns {{a: string; b: string; vision: 'red-weak' | 'green-weak'}[]}
 */
export function cvdClashes(fills) {
  /**
   * @type {{a: string; b: string; vision: 'red-weak' | 'green-weak'}[]}
   */
  const out = [];
  const roles = Object.keys(fills).filter(r =>
    /^#[0-9a-f]{6}$/i.test(fills[r]),
  );
  for (const [
    vision,
    M,
  ] of /** @type {[ 'red-weak' | 'green-weak', ReadonlyArray<ReadonlyArray<number>>, ][]} */ (
    Object.entries(CVD)
  )) {
    // Weak, not absent: partway from normal vision to the full matrix.
    const W = M.map((row, r) =>
      row.map(
        (v, c) => (r === c ? 1 : 0) + CVD_SEVERITY * (v - (r === c ? 1 : 0)),
      ),
    );
    const seen =
      /**
       * @param {string} hex
       */
      hex => {
        const lin = hexToLinearRgb(hex);
        const [r, g, b] = W.map(row =>
          Math.min(
            1,
            Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]),
          ),
        );
        return linearRgbToOklab(r, g, b);
      };
    for (let i = 0; i < roles.length; i++) {
      for (let j = i + 1; j < roles.length; j++) {
        const x = seen(fills[roles[i]]);
        const y = seen(fills[roles[j]]);
        if (Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < CVD_ALIKE) {
          out.push({a: roles[i], b: roles[j], vision});
        }
      }
    }
  }
  return out;
}
