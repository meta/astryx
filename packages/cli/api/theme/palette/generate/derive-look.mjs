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

import {
  hexToOklch,
  luminance,
  maxOklchChroma,
  oklchClampedHex,
} from './color.mjs';
import {perceptualDelta} from './generator.mjs';

/** @typedef {'light' | 'dark'} Mode */
/** @typedef {{stop: number, color: string, family?: string, alpha?: string}} Stop */
/** @typedef {{family: string, light: Stop, dark: Stop}} DerivedToken */

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

/** Each chart scale and the family it is drawn from. */
export const CHART_SCALES = /** @type {Readonly<Record<string, string>>} */ ({
  blue: 'blue',
  shamrock: 'green',
  orange: 'orange',
  pink: 'pink',
  purple: 'purple',
  red: 'red',
  teal: 'teal',
  yellow: 'yellow',
  gray: 'neutral',
});

/** The stops of a scale's five steps, pale to deep. */
const SCALE_STOPS = [92, 75, 55, 35, 15];

/**
 * The seed each derived hue grows from: the official neutral palette's
 * category seeds (packages/themes/neutral/palette.config.json; a test keeps
 * them equal), and Core's own chart colors for the two series no category
 * has.
 */
export const HUE_SEEDS = /** @type {Readonly<Record<string, string>>} */ ({
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
});

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

/** How strong a color is for its lightness and hue, 0 to 1. @param {string} color */
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
 * they are; Core's strength without a colored accent.
 * @param {string | null | undefined} accent
 * @returns {Record<string, string>}
 */
export function lookSeeds(accent) {
  const hues = Object.keys(HUE_SEEDS);
  const scale = strengthScale(accent);
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
 * @param {any} family
 */
export function isLookFamily(family) {
  const core = HUE_SEEDS[family?.id];
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
  const slack = 2 + (Math.atan2(0.004, Math.max(a.C, 1e-6)) * 180) / Math.PI;
  return Math.abs(a.L - b.L) < 0.02 && (turn < slack || a.C < GRAY_CHROMA);
}

/**
 * A see-through color over an opaque one, as the eye sees it.
 * @param {string} color @param {string} alpha - Two hex digits. @param {string} under
 */
function over(color, alpha, under) {
  const a = parseInt(alpha, 16) / 255;
  const ch = (/** @type {string} */ c, /** @type {number} */ i) =>
    parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map(i =>
      Math.round(a * ch(color, i) + (1 - a) * ch(under, i))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The category and chart colors a palette derives.
 * @param {object} input
 * @param {Record<string, Record<Mode, Record<string | number, string>>>} input.palette - Generated families by id.
 * @param {number[]} input.stops - The palette's stops.
 * @param {Mode[]} input.modes
 * @param {(m: Mode) => string[]} input.text - The theme's text and secondary text colors (opaque hex) in a mode.
 * @param {(m: Mode) => string[]} input.grounds - The surfaces text sits on in a mode: page, surface, card (opaque hex).
 * @param {(token: string) => boolean} [input.wanted] - Whether a token is written (Core has it and the theme does not set it by hand).
 * @returns {{tokens: Record<string, DerivedToken>, badges: 'derived' | 'merged' | 'unreadable' | 'none', chart: 'derived' | 'merged' | 'unreadable' | 'none', merged: string[], unreadable: Array<{token: string, mode: Mode, stop: number, ratio: number, needs: number}>}}
 */
export function deriveLookColors({
  palette,
  stops,
  modes,
  text,
  grounds,
  wanted = () => true,
}) {
  /** @type {Record<string, DerivedToken>} */
  const tokens = {};
  /** @type {Array<{token: string, mode: Mode, stop: number, ratio: number, needs: number}>} */
  const unreadable = [];
  /** @type {string[]} */
  const merged = [];
  const out = {
    tokens,
    badges: /** @type {'derived' | 'merged' | 'unreadable' | 'none'} */ (
      'none'
    ),
    chart: /** @type {'derived' | 'merged' | 'unreadable' | 'none'} */ ('none'),
    merged,
    unreadable,
  };
  const sorted = [...stops].sort((a, b) => a - b);
  /** @param {number} n */
  const near = n =>
    sorted.reduce(
      (best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best),
      sorted[0],
    );
  /** @param {string} id @param {Mode} m @param {number} stop @returns {Stop} */
  const at = (id, m, stop) => ({stop, color: String(palette[id][m][stop])});
  /**
   * The stop nearest `start` that reads at `needs` on every ground,
   * searched both ways (darker first in light, lighter first in dark); the
   * most contrasting one, noted, when none does.
   * @param {string} token @param {string} id @param {Mode} m @param {number} start @param {string[]} on @param {number} needs
   */
  const pick = (token, id, m, start, on, needs) => {
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
  /** @param {(m: Mode) => Stop} fn */
  const each = fn => {
    const v = /** @type {Record<Mode, Stop>} */ ({});
    for (const m of /** @type {Mode[]} */ (['light', 'dark']))
      v[m] = fn(modes.includes(m) ? m : modes[0]);
    return v;
  };
  /**
   * The pairs of hues drawn alike: every color given for both under ΔE 2
   * in some mode.
   * @param {Record<string, Record<Mode, string[]>>} drawn
   */
  const alike = drawn => {
    const names = Object.keys(drawn);
    /** @type {string[]} */
    const found = [];
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
  const famOf = (/** @type {string} */ h) => (h === 'gray' ? 'neutral' : h);
  if (hues.every(h => palette[famOf(h)])) {
    /** @type {Record<string, DerivedToken>} */
    const badge = {};
    /** @type {Record<string, Record<Mode, string[]>>} */
    const drawn = {};
    const first = unreadable.length;
    for (const h of hues) {
      const id = famOf(h);
      const gray = h === 'gray';
      /** @param {'background' | 'border' | 'icon' | 'text'} role @param {Mode} m */
      const start = (role, m) => {
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
      const on = (/** @type {Mode} */ m) => [fill[m].color, ...grounds(m)];
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
    /** @type {Record<string, DerivedToken>} */
    const chart = {};
    /** @type {Record<string, Record<Mode, string[]>>} */
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
export const STATUS_ROLES = /** @type {Readonly<Record<string, string>>} */ ({
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
});

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
 * @param {Record<string, string>} base - Each role's base color by dial id (info, success, warning, danger).
 * @param {string | null | undefined} accent
 * @returns {Record<string, string>}
 */
export function statusSeeds(base, accent) {
  const scale = strengthScale(accent);
  /** @type {Record<string, string>} */
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
 * @param {object} input
 * @param {Record<string, Record<Mode, Record<string | number, string>>>} input.palette - Generated families by id; a role's family has the role's dial id.
 * @param {number[]} input.stops
 * @param {Mode[]} input.modes
 * @param {string[]} input.roles - The dial ids to derive (info, success, warning, danger).
 * @param {(m: Mode) => string[]} input.grounds - Page, surface, card (opaque hex).
 * @param {(m: Mode, role: string) => Array<Stop & {family: string}>} input.inks - The text the theme draws on a role's fill in a mode, preferred first (white or near-black).
 * @param {(m: Mode) => string | null} input.accent - The accent fill in a mode, kept apart from.
 * @param {(token: string) => boolean} [input.wanted]
 * @returns {{tokens: Record<string, DerivedToken>, roles: Record<string, 'derived' | 'unreadable' | 'alike'>, why: string[]}} A token's stop may name its own family (the text on a fill is the neutral color's, or white or black).
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
  /** @type {Record<string, DerivedToken>} */
  const tokens = {};
  /** @type {Record<string, 'derived' | 'unreadable' | 'alike'>} */
  const state = {};
  /** @type {string[]} */
  const why = [];
  const sorted = [...stops].filter(s => s > 0 && s < 100).sort((a, b) => a - b);
  /** @param {number} n */
  const near = n =>
    sorted.reduce(
      (best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best),
      sorted[0],
    );
  /** @param {(m: Mode) => Stop} fn */
  const each = fn => {
    const v = /** @type {Record<Mode, Stop>} */ ({});
    for (const m of /** @type {Mode[]} */ (['light', 'dark']))
      v[m] = fn(modes.includes(m) ? m : modes[0]);
    return v;
  };
  for (const id of roles) {
    const w = STATUS_ROLES[id];
    const fam = palette[id];
    if (!w || !fam) continue;
    /** @param {Mode} m @param {number} stop @returns {Stop} */
    const at = (m, stop) => ({stop, color: String(fam[m][stop])});
    /** @type {string[]} */
    const fails = [];
    /**
     * The stop nearest `start` that reads at `needs` on every color in `bg`.
     * @param {string} token @param {Mode} m @param {number} start @param {string[]} bg @param {number} needs
     */
    const pick = (token, m, start, bg, needs) => {
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
    /** @type {Record<Mode, Stop & {family: string}>} */
    const onFill = /** @type {any} */ ({});
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
    /** The tint as it shows over each surface. @param {Mode} m */
    const tintSeen = m =>
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
