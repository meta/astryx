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
  hexToOklch,
  luminance,
  maxOklchChroma,
  oklchClampedHex,
} from './color.mjs';
import {perceptualDelta} from './generator.mjs';

/** @typedef {'light' | 'dark'} Mode */

/**
 * A shade of a family: its stop and color.
 * @typedef {object} Stop
 * @property {number} stop
 * @property {string} color
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
 * @property {(m: Mode) => string[]} grounds The surfaces text sits on in a mode: page, surface, card (opaque hex).
 * @property {(token: string) => boolean} [wanted] Whether a token is written (Core has it and the theme does not set it by hand).
 */

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
 * The seeds of the derived hues: Core's hues at the strength of the accent,
 * in steps of 0.05 so an accent of about the same strength leaves them as
 * they are; Core's strength without a colored accent.
 * @param {string | null | undefined} accent
 * @returns {Record<string, string>}
 */
export function lookSeeds(accent) {
  const hues = Object.keys(HUE_SEEDS);
  const core = hues.map(h => strength(HUE_SEEDS[h])).sort((a, b) => a - b);
  const median = core[Math.floor(core.length / 2)];
  const scale =
    accent && hexToOklch(accent).C >= GRAY_CHROMA && median > 0
      ? Math.round(
          Math.min(1.2, Math.max(0.25, strength(accent) / median)) * 20,
        ) / 20
      : 1;
  return Object.fromEntries(
    hues.map(h => {
      const {L, C, H} = hexToOklch(HUE_SEEDS[h]);
      return [h, oklchClampedHex(L, C * scale, H)];
    }),
  );
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
  const slack = 2 + (Math.atan2(0.004, Math.max(a.C, 1e-6)) * 180) / Math.PI;
  return Math.abs(a.L - b.L) < 0.02 && (turn < slack || a.C < GRAY_CHROMA);
}
/**
 * The WCAG contrast ratio of two opaque colors.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/**
 * The category and chart colors a palette derives.
 * @param {DeriveLookInput} param0
 * @returns {DerivedLook}
 */
export function deriveLookColors({
  palette,
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
      color: String(palette[id][m][stop]),
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
        r: Math.min(...on.map(bg => contrast(at(id, m, stop).color, bg))),
      }));
      const best =
        scored.find(x => x.r >= needs) ??
        scored.reduce((x, y) => (y.r > x.r ? y : x));
      if (best.r < needs) {
        unreadable.push({
          token,
          mode: m,
          stop: best.stop,
          ratio: Math.round(best.r * 100) / 100,
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
        const s0 = near(start('background', m));
        // Paler first in light, darker first in dark: a tint, never a solid
        // fill, since it is also the card's tint.
        const order = [...sorted].sort(
          (a, b) =>
            Math.abs(a - s0) - Math.abs(b - s0) ||
            (m === 'light' ? b - a : a - b),
        );
        const reads = text(m);
        const s =
          order.find(x =>
            reads.every(c => contrast(c, at(id, m, x).color) >= TEXT),
          ) ?? s0;
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
