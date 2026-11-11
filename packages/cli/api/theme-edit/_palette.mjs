// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The palette behind the color dials of `astryx experimental theme`:
 * each color dial is one family in the theme's palette.config.json, grown by
 * the palette generator (the same function as `theme palette generate`).
 * Every color decision is generator config: the seed's exact color is an
 * anchor at its stop, in dark too when it reads there. The theme's color
 * tokens point at stops as the official themes map them, and contrast moves
 * a token to a nearer stop that passes; it never makes a new color. The
 * theme imports only the stops it uses. `vibrancy` is the generator's
 * `vibrancy`. Users see "colors" and "shades": the words palette, family and
 * stop stay in the code.
 *
 * @position api/theme-edit — imported by _settings.mjs, _check.mjs, _how.mjs
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  DEFAULT_21_STOPS,
  PALETTE_BLACK,
  PALETTE_GENERATOR_VERSION,
  PALETTE_WHITE,
  generateTonalPalette,
  perceptualDelta,
} from '../theme/palette/generate/generator.mjs';
import {themePaletteGenerate} from '../theme/palette/generate/generate.mjs';
import {hexToOklch, normalizeColor} from '../theme/palette/generate/color.mjs';
import {
  alphaOf,
  compositeOver,
  hex,
  isClipped,
  parseColor,
  ratio,
} from './_color.mjs';
import {P} from './_tables.mjs';

/**
 * Write a file whole: a temp file beside it, renamed into place, so a link
 * there is replaced, never written through, and a stopped write leaves the
 * old file. The temp file goes whatever happens.
 * @param {string} file
 * @param {string | Buffer} text
 */
export function writeWhole(file, text) {
  const tmp = tempFor(file);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, {force: true});
  }
}

/**
 * A temp file beside `file` for a whole write, named so only the editor
 * makes such names: `.<name>.astryx-<pid>-<random>.tmp`. The write that
 * makes one removes it.
 * @param {string} file
 */
export function tempFor(file) {
  return path.join(
    path.dirname(file),
    `.${path.basename(file)}.astryx-${process.pid}-${Math.random().toString(36).slice(2, 10)}.tmp`,
  );
}

/** @typedef {'light' | 'dark'} Mode */
/** @typedef {import('./_settings.mjs').Setting} Setting */
/** @typedef {import('../theme/theme.type.mjs').TonalPaletteCandidate} Candidate */

/**
 * One token pointed at a palette stop in each mode.
 * @typedef {object} StopRef
 * @property {number} stop
 * @property {string} color - The stop's color, with `alpha` appended when set.
 * @property {string} [alpha] - Two hex digits of opacity.
 * @property {string} [family] - The family the stop is from when it is not the token's own: `neutral` for text on a fill, or `black` / `white`, the palette's own ends.
 * @property {boolean} [exact] - The stop holds the seed's exact color (an exact anchor).
 */

/**
 * One contrast check behind a stop choice.
 * @typedef {object} ContrastCheck
 * @property {string} token
 * @property {Mode} mode
 * @property {number} stop
 * @property {number} preferred - The stop the mapping starts from.
 * @property {string} against - What it was measured on.
 * @property {number} ratio - The lowest ratio over everything it was measured on.
 * @property {number} needs
 * @property {boolean} pass
 * @property {string} [note] - The whole sentence to report, when the check is not a plain stop move.
 */

/**
 * The palette mapping of a theme.
 * @typedef {object} PaletteMapping
 * @property {Candidate} candidate
 * @property {Array<{id: string, dial: string, seed: string, value: string}>} families
 * @property {Record<string, {family: string, light: StopRef, dark: StopRef}>} tokens
 * @property {ContrastCheck[]} contrast
 * @property {number} vibrancy - The generator's vibrancy, 0 to 100.
 * @property {Record<string, Partial<Record<Mode, string>>>} exact - Main tokens the theme sets exactly, the value per mode: the dial's fill gives way to them.
 * @property {string[]} notes - What the config writer kept or replaced of a hand edit.
 */

/** The color dials. Each one is a palette family of the same id. */
export const PALETTE_DIALS = [
  'accent',
  'neutral',
  'success',
  'warning',
  'danger',
  'info',
];

/** The generator's vibrancy when the theme sets none. */
export const VIBRANCY_DEFAULT = 50;

/**
 * The vibrancy dial a settings list sets, or null.
 * @param {Setting[]} settings
 * @returns {number | null}
 */
function dialVibrancy(settings) {
  const s = [...settings]
    .reverse()
    .find(x => x?.source === 'dial' && x.thing === 'vibrancy');
  // A value edited by hand that is not one (`high`, `150`) counts as none,
  // so the command that fixes it can still build the state before it.
  return s && /^\d{1,3}$/.test(String(s.value)) && Number(s.value) <= 100
    ? Number(s.value)
    : null;
}

/** The Core token word of each status family. */
const STATUS_TOKEN = /** @type {Record<string, string>} */ ({
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
});

/**
 * The main token a color dial feeds: the exact-token escape hatch for it.
 * @param {string} dial
 */
export const paletteToken = dial =>
  dial === 'accent'
    ? '--color-accent'
    : dial === 'neutral'
      ? '--color-background-surface'
      : `--color-${STATUS_TOKEN[dial]}`;

/** Text contrast and non-text contrast (fills, focus rings, icons). */
const TEXT = 4.5;
const NON_TEXT = 3;

/**
 * The stop each token starts from, `[light, dark]`, as the official neutral
 * theme maps them. The page background, `--color-background-body`, stays
 * the base theme's, so a tinted gray never tints the page. A layout without
 * one of these stops uses the nearest one it has.
 */
const NEUTRAL_STOPS = /** @type {Record<string, [number, number]>} */ ({
  '--color-background-surface': [100, 15],
  '--color-background-card': [100, 10],
  '--color-background-popover': [100, 10],
  '--color-background-muted': [95, 10],
  '--color-text-primary': [0, 100],
  '--color-text-secondary': [30, 65],
  '--color-text-disabled': [60, 35],
  '--color-icon-primary': [0, 100],
  '--color-icon-secondary': [45, 65],
  '--color-icon-disabled': [60, 35],
  '--color-border-emphasized': [85, 35],
  '--color-skeleton': [95, 35],
});
/** Neutral tints: a stop with an opacity, `[[stop, alpha], [stop, alpha]]`. */
const NEUTRAL_TINTS =
  /** @type {Record<string, [[number, string], [number, string]]>} */ ({
    '--color-border': [
      [0, '14'],
      [100, '1a'],
    ],
    '--color-overlay-hover': [
      [0, '0d'],
      [100, '0d'],
    ],
    '--color-overlay-pressed': [
      [0, '1a'],
      [100, '1a'],
    ],
  });
/**
 * Accent and status stops, `[light, dark]`, as the official neutral theme
 * maps its accent tint and its status families. The dark fill starts at 70,
 * where the theme authoring guide puts it, when the exact color does not
 * read in dark. A status tint is translucent in dark (`[stop, alpha]`).
 */
const DARK_FILL = 70;
const TEXT_STOP = /** @type {[number, number]} */ ([45, 80]);
const ACCENT_MUTED = /** @type {[number, number]} */ ([85, 30]);
const STATUS_MUTED = /** @type {[number, [number, string]]} */ ([
  85,
  [75, '3d'],
]);
const ON_MUTED = /** @type {[number, number]} */ ([25, 80]);
const BORDER = /** @type {[number, number]} */ ([80, 65]);
/**
 * Text on a fill, from the neutral family as the official themes take it:
 * white (100) first in light, near-black (5) first in dark, and near-black
 * first in both modes on warning. Without a neutral color, black and white.
 */
const ON_FILL = /** @type {Record<Mode, [number, number]>} */ ({
  light: [100, 5],
  dark: [5, 100],
});
/** A layout needs this many stops between black and white to map every token. */
const MIN_INNER_STOPS = 5;
/** The widest gap between two stops that still maps every token near its stop. */
const MAX_STOP_GAP = 25;

/** Text on surfaces darkens in light mode and lightens in dark mode. */
const TOWARD_CONTRAST = /** @type {Record<Mode, 1 | -1>} */ ({
  light: -1,
  dark: 1,
});

/** @param {string} slug */
export function paletteFiles(slug) {
  return {
    config: `themes/${slug}/palette.config.json`,
    palette: `themes/${slug}/tokens/${slug}.palette.ts`,
    receipt: `themes/${slug}/tokens/${slug}.palette.receipt.json`,
    refs: `themes/${slug}/tokens/${slug}.palette-refs.ts`,
    importPath: `./tokens/${slug}.palette`,
    refsImportPath: `./tokens/${slug}.palette-refs`,
  };
}

/** The export name of a theme's selected stops. @param {string} slug */
const refsName = slug =>
  `${slug.replace(/-+([a-z0-9])?/g, (_, c) => (c ? c.toUpperCase() : ''))}PaletteRefs`;

/**
 * The import line the generated settings use for the stops they read.
 * @param {string} slug
 */
export const paletteImport = slug =>
  `import {${refsName(slug)} as palette} from '${paletteFiles(slug).refsImportPath}';`;

/**
 * The seed a color dial value grows from, or null for a value with no fixed,
 * opaque color (a variable, a keyword, `color-mix()`, a translucent color).
 * @param {string} value
 */
export function seedOf(value) {
  const rgb = parseColor(value);
  return rgb && alphaOf(value) >= 1 ? hex(rgb) : null;
}

/**
 * Below this OKLCH chroma a seed reads as gray: its family is generated as a
 * neutral, so no hue is invented for it in either mode.
 */
const GRAY_CHROMA = 0.02;

/** @param {string} seed */
const isGray = seed => hexToOklch(seed).C < GRAY_CHROMA;

/** Whether a seed (or no seed) has no color to saturate. @param {string | null} seed */
export const isGraySeed = seed => !seed || isGray(seed);

/** @param {unknown} a @param {unknown} b */
function sameColor(a, b) {
  try {
    return normalizeColor(String(a)) === normalizeColor(String(b));
  } catch {
    return false;
  }
}

/**
 * The modes a theme has.
 * @param {{mode?: string}} data
 * @returns {Mode[]}
 */
function themeModes(data) {
  return data.mode === 'light-only'
    ? ['light']
    : data.mode === 'dark-only'
      ? ['dark']
      : ['light', 'dark'];
}

/**
 * The color dial settings of a theme, in dial order.
 * @param {{settings: Setting[]}} data
 */
function dialFamilies(data) {
  /** @type {Array<{id: string, dial: string, seed: string, value: string}>} */
  const out = [];
  for (const dial of PALETTE_DIALS) {
    const s = [...data.settings]
      .reverse()
      .find(x => x?.source === 'dial' && x.thing === dial && !x.on && !x.mode);
    const seed = s && seedOf(s.value);
    if (s && seed) out.push({id: dial, dial, seed, value: s.value});
  }
  return out;
}

/** @param {string} file */
function readConfig(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new AstryxError(
      `${path.basename(path.dirname(file))}/palette.config.json is not valid JSON (${e instanceof Error ? e.message : String(e)}). Fix it by hand. Nothing was changed.`,
      [],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
}

/**
 * The settings saved on disk, before the change being built: what the
 * editor wrote into the config last time, so a value it did not write is
 * known to be a hand edit.
 * @param {string} cwd
 * @param {string} slug
 * @returns {{settings: Setting[], mode: string | null}}
 */
function savedSettings(cwd, slug) {
  try {
    const data = JSON.parse(
      fs.readFileSync(
        path.join(cwd, 'themes', slug, `${slug}.settings.json`),
        'utf8',
      ),
    );
    return {
      settings: Array.isArray(data?.settings) ? data.settings : [],
      mode: typeof data?.mode === 'string' ? data.mode : null,
    };
  } catch {
    return {settings: [], mode: null};
  }
}

/** The generator's mode strategy for a list of modes. @param {Mode[]} modes */
const strategyOf = modes =>
  modes.length > 1 ? 'light-and-dark' : `${modes[0]}-only`;

/** The config fields the generator reads; anything else changes nothing. */
const CONFIG_KEYS = [
  'vibrancy',
  'neutralProfile',
  'modeStrategy',
  'stops',
  'families',
];
const FAMILY_KEYS = ['id', 'name', 'seed', 'kind', 'anchors'];
const ANCHOR_KEYS = ['mode', 'stop', 'color', 'policy', 'maxDeltaE'];

/**
 * The fields of a config the generator never reads (such as
 * `darkChromaTaper`), by path.
 * @param {any} config
 * @returns {string[]}
 */
function deadKeys(config) {
  /** @type {string[]} */
  const out = Object.keys(config).filter(k => !CONFIG_KEYS.includes(k));
  (Array.isArray(config.families) ? config.families : []).forEach(
    (/** @type {any} */ f, /** @type {number} */ i) => {
      if (!f || typeof f !== 'object') return;
      for (const k of Object.keys(f))
        if (!FAMILY_KEYS.includes(k)) out.push(`families[${i}].${k}`);
      (Array.isArray(f.anchors) ? f.anchors : []).forEach(
        (/** @type {any} */ a, /** @type {number} */ j) => {
          if (a && typeof a === 'object')
            for (const k of Object.keys(a))
              if (!ANCHOR_KEYS.includes(k))
                out.push(`families[${i}].anchors[${j}].${k}`);
        },
      );
    },
  );
  return out;
}

/**
 * The light stop nearest a seed color in the ramp the generator grows from
 * it. The official themes anchor a brand color there, exactly, so the fill
 * keeps the color as given. The end stops are pure black and white and
 * never hold an anchor.
 * @param {string} seed
 * @param {any} config - Its `stops` and `vibrancy` shape the ramp.
 * @param {'chromatic' | 'neutral'} [kind]
 */
function seedStop(seed, config, kind = 'chromatic') {
  const {stops, palette} = generate({
    ...(config.stops ? {stops: config.stops} : {}),
    ...(config.vibrancy != null ? {vibrancy: config.vibrancy} : {}),
    ...(kind === 'neutral' ? {neutralProfile: 'custom'} : {}),
    modeStrategy: 'light-only',
    families: [{id: 'seed', seed, kind}],
  });
  const ramp = /** @type {Record<number, string>} */ (
    /** @type {any} */ (palette.seed).light
  );
  const inner = stops.filter(s => s > 0 && s < 100);
  return inner.reduce((best, s) =>
    perceptualDelta(ramp[s], seed) < perceptualDelta(ramp[best], seed)
      ? s
      : best,
  );
}

/**
 * The stop of a layout nearest `n`; on a tie, the one nearer the middle.
 * @param {readonly number[]} stops
 * @param {number} n
 */
function nearestStop(stops, n) {
  return stops.reduce((best, s) => {
    const d = Math.abs(s - n) - Math.abs(best - n);
    return d < 0 || (d === 0 && Math.abs(s - 50) < Math.abs(best - 50))
      ? s
      : best;
  });
}

/**
 * Refuse a stop layout the token mapping cannot use: numbers only, black
 * (0) and white (100), enough shades between them, and no gap so wide that
 * tokens land far from where they belong. The generator checks the order.
 * @param {any} stops
 * @param {string} slug
 * @returns {readonly number[]}
 */
function usableStops(stops, slug) {
  if (stops == null) return DEFAULT_21_STOPS;
  const list = Array.isArray(stops) ? stops : [];
  const shown = Array.isArray(stops)
    ? stops.map(x => JSON.stringify(x)).join(', ')
    : JSON.stringify(stops);
  const fix = `Remove "stops" from it to use the default 21 shades, or give 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100. Nothing was changed.`;
  /** @param {string} why */
  const refuse = why => {
    throw new AstryxError(
      `themes/${slug}/palette.config.json: its stops (${shown}) ${why}. ${fix}`,
      [],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  };
  if (!Array.isArray(stops) || !list.length)
    refuse('are not a list of numbers');
  const bad = list.filter(x => typeof x !== 'number' || !Number.isFinite(x));
  if (bad.length)
    refuse(
      `hold ${bad.map(x => JSON.stringify(x)).join(', ')}, which ${bad.length > 1 ? 'are not numbers' : 'is not a number'}`,
    );
  if (!list.includes(0) || !list.includes(100))
    refuse('need 0 (black) and 100 (white) at the ends');
  const inner = list.filter(s => s > 0 && s < 100);
  if (inner.length < MIN_INNER_STOPS)
    refuse(
      `leave ${inner.length} shades between black and white, and the color tokens need at least ${MIN_INNER_STOPS}`,
    );
  const sorted = [...list].sort((a, b) => a - b);
  const gap = Math.max(...sorted.slice(1).map((x, i) => x - sorted[i]));
  if (gap > MAX_STOP_GAP)
    refuse(
      `leave a gap of ${gap} between two shades, and the color tokens need one at least every ${MAX_STOP_GAP}`,
    );
  return list;
}

/**
 * Look-ups shared by the config writer and the mapping, on one candidate:
 * the nearest stop, a stop's color, the surfaces text and fills sit on, the
 * text that reads on a fill, and the theme's exact color settings.
 * @param {Candidate} candidate
 * @param {{settings: Setting[]}} data
 * @param {{light: Record<string, string>, dark: Record<string, string>} | undefined} base
 */
function tools(candidate, data, base) {
  const {stops} = candidate;
  /** @param {number} n */
  const at = n => nearestStop(stops, n);
  /** @param {string} id @param {Mode} m @param {number} stop @param {string} [alpha] @returns {StopRef} */
  const ref = (id, m, stop, alpha) => {
    const color = /** @type {any} */ (candidate.palette[id])[m][stop];
    return alpha ? {stop, color: `${color}${alpha}`, alpha} : {stop, color};
  };
  const neutral = Boolean(/** @type {any} */ (candidate.palette).neutral);
  /**
   * The exact whole-theme color a token setting gives in a mode, or null.
   * @param {string} token @param {Mode} m
   */
  const exactOf = (token, m) => {
    const v = [...data.settings]
      .reverse()
      .find(
        s =>
          s.source === 'token' &&
          s.thing === token &&
          !s.on &&
          !s.when &&
          !s.state &&
          (!s.mode || s.mode === m),
      )?.value;
    const rgb = v == null ? null : parseColor(v);
    return rgb && alphaOf(v) >= 1 ? hex(rgb) : null;
  };
  /**
   * What text and fills sit on in a mode: the theme's exact surface
   * colors, else the neutral color's surfaces, else the base theme's; the
   * family's own surface stop when nothing else is known.
   * @param {Mode} m @param {string} id
   * @returns {Array<[string, string]>}
   */
  const surfaces = (m, id) => {
    /** @type {Array<[string, string]>} */
    const out = [];
    for (const n of [
      '--color-background-surface',
      '--color-background-body',
      '--color-background-card',
    ]) {
      const own =
        neutral && NEUTRAL_STOPS[n]
          ? ref('neutral', m, at(NEUTRAL_STOPS[n][m === 'light' ? 0 : 1])).color
          : null;
      const v = exactOf(n, m) ?? own ?? base?.[m]?.[n];
      if (v && parseColor(v) && alphaOf(v) >= 1)
        out.push([n, hex(/** @type {number[]} */ (parseColor(v)))]);
    }
    if (!out.length) {
      const s = at(
        NEUTRAL_STOPS['--color-background-surface'][m === 'light' ? 0 : 1],
      );
      out.push([`${id} shade ${s}`, ref(id, m, s).color]);
    }
    return out;
  };
  /**
   * The text shades for a fill, preferred first.
   * @param {string} id @param {Mode} m
   * @returns {StopRef[]}
   */
  const onChoices = (id, m) =>
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
   * @param {string} id @param {Mode} m @param {string} fill
   */
  const onFor = (id, m, fill) => {
    const [a, b] = onChoices(id, m).map(on => ({
      on,
      r: contrast(on.color, fill),
    }));
    const best = a.r >= TEXT || a.r >= b.r ? a : b;
    const other = best === a ? b : a;
    return {
      on: best.on,
      r: best.r,
      other: other.on,
      otherR: other.r,
      first: a.on,
    };
  };
  /** The lowest contrast of a color on the surfaces. @param {string} color @param {Mode} m @param {string} id */
  const page = (color, m, id) =>
    Math.min(...surfaces(m, id).map(([, bg]) => contrast(color, bg)));
  return {stops, at, ref, exactOf, surfaces, onFor, page, neutral};
}

/** @type {Partial<Record<Mode, number | null>>} */
const citationCache = {};

/**
 * How well citation text (`--color-text-secondary`) reads on the accent
 * tint (`--color-accent-muted`) in the official neutral theme, per mode:
 * both tokens' stops come from its theme source and their colors from its
 * selected palette stops, read from the installed package. Without the
 * package, the same official stops of a plain gray ramp from the
 * generator. Null when neither can be read.
 * @param {Mode} m
 * @returns {number | null}
 */
export function officialCitation(m) {
  if (m in citationCache)
    return /** @type {number | null} */ (citationCache[m]);
  const i = m === 'light' ? 0 : 1;
  /** @type {number | null} */
  let r = null;
  try {
    const dir = path.dirname(
      path.dirname(
        createRequire(import.meta.url).resolve('@astryxdesign/theme-neutral'),
      ),
    );
    const theme = fs.readFileSync(
      path.join(dir, 'src/neutralTheme.ts'),
      'utf8',
    );
    const refs = fs.readFileSync(
      path.join(dir, 'src/neutralPaletteRefs.generated.ts'),
      'utf8',
    );
    /** @param {string} token */
    const stopOf = token =>
      new RegExp(
        `'${token}':\\s*\\[\\s*neutral\\.light\\[(\\d+)\\],\\s*neutral\\.dark\\[(\\d+)\\]\\s*\\]`,
      ).exec(theme)?.[i + 1];
    // The first ramp of each mode after `neutral: {` is the neutral one.
    const from = refs.search(/\bneutral:\s*\{/);
    const ramp =
      from < 0
        ? ''
        : (new RegExp(`\\b${m}:\\s*\\{([^}]*)\\}`).exec(
            refs.slice(from),
          )?.[1] ?? '');
    /** @param {string | undefined} stop */
    const colorOf = stop =>
      stop == null
        ? null
        : new RegExp(`\\b${stop}:\\s*'(#[0-9a-f]{6})'`).exec(ramp)?.[1];
    const text = colorOf(stopOf('--color-text-secondary'));
    const tint = colorOf(stopOf('--color-accent-muted'));
    if (text && tint) r = contrast(text, tint);
  } catch {
    r = null;
  }
  if (r == null)
    try {
      const gray = /** @type {any} */ (
        generateTonalPalette({
          families: [{id: 'n', seed: '#808080', kind: 'neutral'}],
        }).palette.n
      )[m];
      r = contrast(
        gray[NEUTRAL_STOPS['--color-text-secondary'][i]],
        gray[ACCENT_MUTED[i]],
      );
    } catch {
      r = null;
    }
  citationCache[m] = r;
  return r;
}

/** A text shade, named for a sentence. @param {StopRef} r */
const textName = r =>
  r.family === 'white' || (r.family === 'neutral' && r.stop >= 95)
    ? 'white'
    : r.family === 'black' || (r.family === 'neutral' && r.stop <= 10)
      ? 'near-black'
      : `shade ${r.stop}`;

/**
 * Whether the exact seed color works as the dark fill: text on it reads at
 * 4.5:1 and it stands out from the dark surfaces at 3:1. Why not otherwise.
 * @param {ReturnType<typeof tools>} t
 * @param {string} id
 * @param {string} seed
 */
function darkExact(t, id, seed) {
  const on = t.onFor(id, 'dark', seed);
  if (on.r < TEXT)
    return {
      ok: false,
      ratio: round(on.r),
      why: `your exact color reads at only ${round(on.r)}:1 with any text shade, and text needs ${TEXT}:1`,
    };
  const p = t.page(seed, 'dark', id);
  if (p < NON_TEXT)
    return {
      ok: false,
      ratio: round(p),
      why: `your exact color stands out from the dark page at only ${round(p)}:1, and a fill needs ${NON_TEXT}:1`,
    };
  return {ok: true, ratio: round(on.r), why: ''};
}

/**
 * What the config writer decided: the config, what it kept or replaced of
 * a hand edit, and for each accent or status color the stop of its exact
 * color and whether dark mode holds it too (why not, when not).
 * @typedef {object} PalettePlan
 * @property {any} config
 * @property {string[]} notes
 * @property {Record<string, {stop: number, dark: boolean, why: string, ratio: number}>} fills
 */

/**
 * The palette config a theme's settings ask for. The existing config is
 * kept, and each color dial changes only what it owns: its family's seed,
 * the exact anchors of its seed (light, and dark when the color reads
 * there; both modes for neutral), and a gray seed's `kind`. `modeStrategy`
 * follows the theme's modes; `vibrancy` follows the vibrancy dial and is
 * kept when written by hand; anchors, names, profile, stops and families of
 * the author's own stay. Null when the config would hold no family.
 * @param {string} cwd
 * @param {string} slug
 * @param {{mode?: string, settings: Setting[]}} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} [base] the base theme's resolved colors, which the dark check reads
 * @returns {PalettePlan | null}
 */
function planPalette(cwd, slug, data, base) {
  const file = paletteFiles(slug).config;
  const existing = readConfig(path.join(cwd, file));
  const fams = dialFamilies(data);
  if (!existing && !fams.length) return null;
  /** @type {string[]} */
  const notes = [];
  const config =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? {...existing}
      : {};
  const {settings: saved, mode: savedMode} = savedSettings(cwd, slug);
  const modes = themeModes(data);

  const vibrancy = dialVibrancy(data.settings);
  const savedVibrancy = dialVibrancy(saved);
  if (vibrancy != null) {
    if (
      config.vibrancy != null &&
      savedVibrancy == null &&
      config.vibrancy !== vibrancy
    )
      notes.push(
        `${file}: your vibrancy ${config.vibrancy} there is replaced by the vibrancy setting, ${vibrancy}`,
      );
    config.vibrancy = vibrancy;
  } else if (savedVibrancy != null) delete config.vibrancy;
  else if (config.vibrancy != null)
    notes.push(
      `${file} keeps the vibrancy ${config.vibrancy} written there by hand; ${P} set ${slug} vibrancy ${config.vibrancy} makes it a setting`,
    );

  const strategy = strategyOf(modes);
  // Only a value the editor did not write is a hand edit worth naming: the
  // one it wrote follows the theme's mode as it was saved.
  const wrote = savedMode ? strategyOf(themeModes({mode: savedMode})) : null;
  if (
    config.modeStrategy != null &&
    config.modeStrategy !== strategy &&
    config.modeStrategy !== wrote
  )
    notes.push(
      `${file}: modeStrategy ${config.modeStrategy} is now ${strategy}, the modes the theme has`,
    );
  config.modeStrategy = strategy;
  usableStops(config.stops, slug);

  if (config.families != null && !Array.isArray(config.families))
    notes.push(
      `${file}: families was not a list, so it is made again from your color settings`,
    );
  /** @type {any[]} */
  const before = Array.isArray(config.families) ? config.families : [];
  const savedSeeds = dialFamilies({settings: saved});

  /**
   * One dial family: the author's family with the dial's seed and the
   * exact anchors of that seed in place of the old ones.
   * @param {any} prev
   * @param {{id: string, seed: string}} f
   */
  const familyOf = (prev, f) => {
    const old = prev && typeof prev === 'object' ? prev : {};
    const neutral = f.id === 'neutral';
    const wasSaved = savedSeeds.find(x => x.id === f.id)?.seed;
    if (old.seed != null && wasSaved && !sameColor(old.seed, wasSaved))
      notes.push(
        `${file}: the ${f.id} seed ${old.seed} there is replaced by your ${f.id} setting, ${f.seed}`,
      );
    const gray = isGray(f.seed);
    const kind =
      neutral || gray
        ? 'neutral'
        : old.kind === 'chromatic'
          ? 'chromatic'
          : undefined;
    if (
      old.kind === 'neutral' &&
      !kind &&
      !neutral &&
      !(wasSaved && isGray(wasSaved))
    )
      notes.push(
        `${file}: the ${f.id} kind "neutral" is dropped: your ${f.id} is not a gray, and a neutral kind turns its shades gray where no exact color holds them`,
      );
    const stop = seedStop(
      f.seed,
      config,
      kind === 'neutral' ? 'neutral' : 'chromatic',
    );
    // White and black already end every ramp, so a neutral of either holds
    // no anchor of its own.
    const ends =
      neutral &&
      (sameColor(f.seed, PALETTE_WHITE) || sameColor(f.seed, PALETTE_BLACK));
    /** @type {any[]} */
    const mine = ends
      ? []
      : (neutral ? modes : modes.filter(m => m === 'light')).map(m => ({
          mode: m,
          stop,
          color: f.seed,
          policy: 'exact',
        }));
    /** @type {any[]} */
    const kept = [];
    const anchors = Array.isArray(old.anchors) ? old.anchors : [];
    // The editor's own anchors: the seed's exact color at the one stop it
    // put it (light, else dark). The same color at another stop is the
    // author's.
    /** @param {any} a */
    const seedColored = a =>
      a?.policy === 'exact' &&
      (sameColor(a.color, old.seed) ||
        sameColor(a.color, f.seed) ||
        (wasSaved && sameColor(a.color, wasSaved)));
    const editorStop = (
      anchors.find(
        (/** @type {any} */ a) => seedColored(a) && a.mode === 'light',
      ) ?? anchors.find((/** @type {any} */ a) => seedColored(a))
    )?.stop;
    for (const a of anchors) {
      if (seedColored(a) && a.stop === editorStop) continue;
      if (!modes.includes(a?.mode)) {
        notes.push(
          `${file}: the ${f.id} ${a?.mode} anchor at shade ${a?.stop} is dropped: the theme has no ${a?.mode} mode`,
        );
        continue;
      }
      if (mine.some(x => x.mode === a.mode && x.stop === a.stop)) {
        notes.push(
          `${file}: your ${a.mode} anchor at shade ${a.stop} of ${f.id} is replaced by your exact ${f.id} color`,
        );
        continue;
      }
      kept.push(a);
    }
    if (kept.length && wasSaved && !sameColor(wasSaved, f.seed))
      notes.push(
        `${file} keeps your own ${f.id} anchors (${kept.map(a => `${a.mode} ${a.stop} ${a.color}`).join(', ')}): they were set for your earlier ${f.id}, ${wasSaved}, and still pull its shades toward them`,
      );
    const out = {
      ...old,
      id: f.id,
      name: old.name ?? f.id[0].toUpperCase() + f.id.slice(1),
      seed: f.seed,
      ...(kind ? {kind} : {}),
      anchors: [...mine, ...kept].sort((a, b) =>
        a.mode === b.mode ? a.stop - b.stop : a.mode === 'light' ? -1 : 1,
      ),
    };
    if (!kind) delete out.kind;
    if (!out.anchors.length) delete out.anchors;
    return {family: out, stop};
  };

  /** @type {PalettePlan['fills']} */
  const fills = {};
  const families = before
    .map(f => {
      if (!PALETTE_DIALS.includes(f?.id)) return f;
      const mine = fams.find(x => x.id === f.id);
      if (!mine) return null;
      const {family, stop} = familyOf(f, mine);
      if (mine.id !== 'neutral')
        fills[mine.id] = {stop, dark: false, why: '', ratio: 0};
      return family;
    })
    .filter(Boolean);
  for (const f of fams)
    if (!families.some(x => x?.id === f.id)) {
      const {family, stop} = familyOf(null, f);
      if (f.id !== 'neutral')
        fills[f.id] = {stop, dark: false, why: '', ratio: 0};
      families.push(family);
    }
  if (!families.length) return null;
  config.families = families;
  const dead = deadKeys(config);
  if (dead.length)
    notes.push(
      `${file}: the color generator does not read ${dead.join(', ')}, so ${dead.length > 1 ? 'they change' : 'it changes'} nothing`,
    );
  if (config.neutralProfile != null) {
    const grays = families.filter(f => f?.kind === 'neutral');
    const unheld = grays.filter(f =>
      modes.some(
        m => !(f.anchors ?? []).some((/** @type {any} */ a) => a.mode === m),
      ),
    );
    if (!unheld.length)
      notes.push(
        `${file}: neutralProfile ${config.neutralProfile} changes nothing here: ${grays.length ? 'each gray color holds its exact color in every mode, and that sets its grays' : 'no color is a gray'}`,
      );
  }

  // The exact color anchors dark mode too when it reads there, as the
  // official themes anchor a brand color in both modes.
  if (modes.includes('dark') && Object.keys(fills).length) {
    const t = tools(generate(config, file), data, base);
    /** @type {string[]} */
    const add = [];
    for (const [id, fill] of Object.entries(fills)) {
      const seed = /** @type {string} */ (fams.find(f => f.id === id)?.seed);
      const check = darkExact(t, id, seed);
      Object.assign(fill, {why: check.why, ratio: check.ratio});
      if (check.ok) add.push(id);
    }
    /** @param {string} id @param {any} cfg */
    const withDark = (id, cfg) => ({
      ...cfg,
      families: cfg.families.map((/** @type {any} */ f) => {
        if (f?.id !== id) return f;
        const anchor = {
          mode: 'dark',
          stop: fills[id].stop,
          color: f.seed,
          policy: 'exact',
        };
        const others = (f.anchors ?? []).filter(
          (/** @type {any} */ a) =>
            !(a.mode === 'dark' && a.stop === anchor.stop),
        );
        if (others.length < (f.anchors ?? []).length)
          notes.push(
            `${file}: your dark anchor at shade ${anchor.stop} of ${id} is replaced by your exact ${id} color`,
          );
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
        generateTonalPalette(tried);
        next = tried;
        fills[id].dark = true;
      } catch {
        fills[id].why =
          'the dark shades cannot hold your exact color and stay in order from dark to light';
      }
    }
    config.families = next.families;
  }
  return {config, notes, fills};
}

/**
 * The palette config a theme's settings ask for (see {@link planPalette}),
 * or null when it would hold no family.
 * @param {string} cwd
 * @param {string} slug
 * @param {{mode?: string, settings: Setting[]}} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} [base]
 * @returns {any}
 */
export function paletteConfig(cwd, slug, data, base) {
  return planPalette(cwd, slug, data, base)?.config ?? null;
}

/** @param {string} text */
const sha256 = text => createHash('sha256').update(text).digest('hex');

/**
 * Write the palette config, palette and receipt the settings ask for, with
 * the same generator as `theme palette generate --out`; remove them all
 * when no family is left. The palette is generated again when the config
 * changes, when a file is missing, or when it came from another generator
 * version. A palette edited by hand ({@link paletteEdited}) is never
 * overwritten: a change that would rewrite it is refused with the commands
 * that keep or discard the edit; a change that leaves it alone goes ahead. Gives back what the config writer kept or replaced
 * of a hand edit, for the result notes.
 * @param {string} cwd
 * @param {string} slug
 * @param {{mode?: string, settings: Setting[], palette?: string}} data
 *   `palette`: the hash of the config the editor wrote, kept in the settings
 * @param {{light: Record<string, string>, dark: Record<string, string>}} [base]
 * @returns {string[]}
 */
export function syncPalette(cwd, slug, data, base) {
  const f = paletteFiles(slug);
  const abs = (/** @type {string} */ p) => path.join(cwd, p);
  const plan = planPalette(cwd, slug, data, base);
  if (!plan) {
    // Only palette files the editor wrote go: a hand-made palette.config.json
    // (and what it generated) stays.
    // The hash the saved settings recorded too: an undo may carry settings
    // from before the palette existed.
    /** @type {string | undefined} */
    let saved;
    try {
      saved = JSON.parse(
        fs.readFileSync(abs(`themes/${slug}/${slug}.settings.json`), 'utf8'),
      ).palette;
    } catch {
      saved = undefined;
    }
    const hash = fs.existsSync(abs(f.config))
      ? sha256(fs.readFileSync(abs(f.config), 'utf8'))
      : null;
    const mine = hash != null && (data.palette === hash || saved === hash);
    delete data.palette;
    if (!mine) return [];
    for (const p of [f.config, f.palette, f.receipt, f.refs])
      fs.rmSync(abs(p), {force: true});
    const tokensDir = path.dirname(abs(f.palette));
    if (fs.existsSync(tokensDir) && !fs.readdirSync(tokensDir).length)
      fs.rmdirSync(tokensDir);
    return [];
  }
  const text = `${JSON.stringify(plan.config, null, 2)}\n`;
  /** @type {any} */
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(abs(f.receipt), 'utf8'));
  } catch {
    receipt = null;
  }
  const same =
    fs.existsSync(abs(f.config)) &&
    fs.readFileSync(abs(f.config), 'utf8') === text &&
    fs.existsSync(abs(f.palette)) &&
    receipt?.generatorVersion === PALETTE_GENERATOR_VERSION;
  // Nothing to rewrite: no notes either, so a kept hand edit is named once,
  // when a color change touches the config.
  if (same) {
    data.palette = sha256(text);
    return [];
  }
  if (paletteEdited(cwd, slug)) {
    throw new AstryxError(
      `${f.palette} was edited by hand, so the editor will not write over it. To keep your edits, move the file out of tokens/ (it is then yours: import it in ${slug}.theme.ts); to discard them, delete it. Then run the command again, and the editor writes the generated shades back. Only color changes wait for this; other changes still work. Nothing was changed.`,
      [],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  fs.mkdirSync(path.dirname(abs(f.config)), {recursive: true});
  writeWhole(abs(f.config), text);
  data.palette = sha256(text);
  themePaletteGenerate(f.config, {out: f.palette, overwrite: true}, {cwd});
  return plan.notes;
}

/**
 * Text with the differences a formatter or a checkout makes taken out:
 * line endings, white space at line ends and at the end, and quote style.
 * @param {string} text
 */
const normalized = text =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/'/g, '"')
    .trimEnd();

/**
 * The palette file the generator writes for a config, or null when it
 * cannot be generated.
 * @param {any} config
 * @returns {string | null}
 */
function renderPalette(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-palette-check-'));
  try {
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
    themePaletteGenerate('config.json', {out: 'palette.ts'}, {cwd: dir});
    return fs.readFileSync(path.join(dir, 'palette.ts'), 'utf8');
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

/**
 * Whether a theme's palette file was edited by hand: its bytes match no
 * receipt, and, formatting aside, it is not what the generator writes for
 * the request it came from (the receipt's, else the config's). False when
 * there is no palette file.
 * @param {string} cwd
 * @param {string} slug
 */
export function paletteEdited(cwd, slug) {
  const f = paletteFiles(slug);
  const file = path.join(cwd, f.palette);
  if (!fs.existsSync(file)) return false;
  const palette = fs.readFileSync(file, 'utf8');
  /** @type {any} */
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(path.join(cwd, f.receipt), 'utf8'));
  } catch {
    receipt = null;
  }
  if (receipt?.candidateSha256 === sha256(palette)) return false;
  /** @type {any} */
  let request = receipt?.request ?? null;
  if (!request)
    try {
      request = JSON.parse(fs.readFileSync(path.join(cwd, f.config), 'utf8'));
    } catch {
      request = null;
    }
  const expected = request ? renderPalette(request) : null;
  return expected == null || normalized(expected) !== normalized(palette);
}

/**
 * The stops a source reads: `palette.<family>.<mode>[<stop>]`, any number
 * as the stop (a layout may have 12.5), and `palette.black` / `palette.white`.
 */
const READS =
  /\bpalette(?:\.([a-z]\w*)|\["([a-z][a-z0-9-]*)"\])\.(light|dark)\[(\d+(?:\.\d+)?)\]|\bpalette\.(black|white)\b/g;

/** What the generated settings write for a stop before it becomes a reference. */
const PLACEHOLDER = '@@palette:';

/**
 * Refuse generated text that still holds a stop placeholder: the CSS would
 * carry it as a value no browser reads.
 * @param {string} file shown in the refusal
 * @param {string} text
 */
export function assertNoPlaceholder(file, text) {
  const at = text.indexOf(PLACEHOLDER);
  if (at < 0) return;
  const what = text.slice(at, at + 60).split(/["\s,)]/)[0];
  throw new AstryxError(
    `${file} would hold ${what}, a color reference that never resolved, so the change was not made. This is a bug in the editor; palette.config.json may hold a stop layout it cannot write. Nothing was changed.`,
    [],
    ERROR_CODES.ERR_THEME_INVALID,
  );
}

/**
 * The module of only the stops a generated settings source reads, in the
 * shape `scripts/generate-selected-palette-refs.mjs` gives the official
 * themes, or null when it reads none.
 * @param {string} slug
 * @param {Candidate} candidate
 * @param {string} source
 * @returns {string | null}
 */
export function paletteRefsSource(slug, candidate, source) {
  /** @type {Map<string, Map<Mode, Set<number>>>} */
  const used = new Map();
  /** @type {Set<'black' | 'white'>} */
  const ends = new Set();
  for (const m of source.matchAll(READS)) {
    if (m[5]) {
      ends.add(/** @type {'black' | 'white'} */ (m[5]));
      continue;
    }
    const family = m[1] ?? m[2];
    const modes = used.get(family) ?? new Map();
    used.set(family, modes);
    const mode = /** @type {Mode} */ (m[3]);
    (modes.get(mode) ?? modes.set(mode, new Set()).get(mode))?.add(
      Number(m[4]),
    );
  }
  if (!used.size && !ends.size) return null;
  const key = (/** @type {string} */ k) =>
    /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
  /** @type {string[]} */
  const body = [];
  for (const [family, modes] of used) {
    body.push(`  ${key(family)}: {`);
    for (const mode of /** @type {Mode[]} */ (['light', 'dark'])) {
      const stops = modes.get(mode);
      if (!stops) continue;
      const ramp = /** @type {any} */ (candidate.palette[family])?.[mode] ?? {};
      const pairs = [...stops]
        .sort((a, b) => a - b)
        .map(s => `${s}: '${ramp[s]}'`);
      body.push(`    ${mode}: {${pairs.join(', ')}},`);
    }
    body.push('  },');
  }
  for (const end of ends)
    body.push(
      `  ${end}: '${end === 'black' ? PALETTE_BLACK : PALETTE_WHITE}',`,
    );
  return [
    `// Generated by \`${P}\` on every change: do not edit.`,
    `// Only the shades ${slug}.settings.ts reads, from ${slug}.palette.ts, so the`,
    '// theme ships no shade it does not use.',
    '// prettier-ignore',
    `export const ${refsName(slug)} = {`,
    ...body,
    '};',
    '',
  ].join('\n');
}

/**
 * Write the selected stops module beside the palette for a generated
 * settings source, or remove it when the source reads no stop. A source
 * that still holds a stop placeholder is refused.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} source the generated settings source
 * @param {PaletteMapping | null} pal
 */
export function syncPaletteRefs(cwd, slug, source, pal) {
  assertNoPlaceholder(`themes/${slug}/${slug}.settings.ts`, source);
  const file = path.join(cwd, paletteFiles(slug).refs);
  const text = pal ? paletteRefsSource(slug, pal.candidate, source) : null;
  if (text == null) {
    fs.rmSync(file, {force: true});
    return;
  }
  fs.mkdirSync(path.dirname(file), {recursive: true});
  writeWhole(file, text);
}

/**
 * @param {any} config
 * @param {string} [file] the config's path, for the refusal
 * @returns {Candidate}
 */
function generate(config, file = 'palette.config.json') {
  try {
    return generateTonalPalette(config);
  } catch (e) {
    throw new AstryxError(
      `${file}: the colors could not be generated: ${(e instanceof Error ? e.message : String(e)).replace(/\.$/, '')}. Fix that part of the file by hand, or remove it. Nothing was changed.`,
      [],
      ERROR_CODES.ERR_PALETTE_GENERATION,
    );
  }
}

/**
 * The contrast ratio of two opaque colors. A color that does not parse is
 * a bug in the mapping, never a ratio of 0.
 * @param {string} a @param {string} b
 */
function contrast(a, b) {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) throw new Error(`No contrast between "${a}" and "${b}".`);
  return ratio(x, y);
}

/**
 * A translucent stop drawn over each surface, as the opaque colors the eye
 * sees; an opaque stop as it is.
 * @param {string} name @param {StopRef} r @param {Array<[string, string]>} under
 * @returns {Array<[string, string]>}
 */
function over(name, r, under) {
  if (!r.alpha) return [[name, r.color]];
  const top = /** @type {[number, number, number]} */ (
    parseColor(r.color.slice(0, 7))
  );
  const a = parseInt(r.alpha, 16) / 255;
  return under.map(([n, bg]) => [
    `${name} over ${n}`,
    hex(
      compositeOver(
        top,
        a,
        /** @type {[number, number, number]} */ (parseColor(bg)),
      ),
    ),
  ]);
}

/** @param {number} r */
const round = r => Math.round(r * 100) / 100;

/**
 * The colors and token mapping of a theme's palette, or null when it sets no
 * color dial. Reads the config the settings ask for and runs the generator
 * in memory, so it matches the palette file `syncPalette` writes.
 * @param {string} cwd
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @param {Record<string, unknown>} tokenDefaults
 * @returns {PaletteMapping | null}
 */
export function paletteMapping(cwd, slug, data, base, tokenDefaults) {
  const fams = dialFamilies(data);
  if (!fams.length) return null;
  const plan = /** @type {PalettePlan} */ (planPalette(cwd, slug, data, base));
  const {config} = plan;
  const candidate = generate(config, paletteFiles(slug).config);
  const t = tools(candidate, data, base);
  const {stops, at, ref, exactOf, surfaces} = t;
  const modes = themeModes(data);
  /**
   * The secondary text color in a mode: an exact setting, else the neutral
   * color's, else the base theme's; null when it is not a fixed color.
   * @param {Mode} m
   */
  const textSecondary = m => {
    const v =
      exactOf('--color-text-secondary', m) ??
      tokens['--color-text-secondary']?.[m].color ??
      base?.[m]?.['--color-text-secondary'];
    return v && parseColor(v) && alphaOf(v) >= 1 ? v : null;
  };
  /** @type {PaletteMapping['tokens']} */
  const tokens = {};
  /** @type {ContrastCheck[]} */
  const checks = [];
  /** @type {PaletteMapping['exact']} */
  const exact = {};
  const has = (/** @type {string} */ k) => k in tokenDefaults;
  /** A token the theme sets exactly in any mode: no check speaks for it. @param {string} k */
  const setExactly = k =>
    data.settings.some(
      s =>
        s.source === 'token' && s.thing === k && !s.on && !s.when && !s.state,
    );
  const reports = (/** @type {string} */ k) => has(k) && !setExactly(k);
  /**
   * Point a token at its stops. A theme with one mode has one ramp: the
   * other side repeats it.
   * @param {string} token @param {string} id @param {Partial<Record<Mode, StopRef>>} refs
   */
  const put = (token, id, refs) => {
    if (!has(token)) return;
    const one = /** @type {StopRef} */ (refs[modes[0]]);
    tokens[token] = {
      family: id,
      light: refs.light ?? one,
      dark: refs.dark ?? one,
    };
  };
  /** @template T @param {(m: Mode) => T} fn @returns {Partial<Record<Mode, T>>} */
  const each = fn => Object.fromEntries(modes.map(m => [m, fn(m)]));
  /**
   * The stop nearest `start` that reads at `needs` on every color in `on`,
   * searched both ways (the usual way first on a tie: darker in light,
   * lighter in dark), so a base with dark light-mode surfaces still finds
   * one; the most contrasting stop of all when none does.
   * @param {string} token @param {string} id @param {Mode} m @param {number} start
   * @param {Array<[string, string]>} on - `[name, color]` pairs.
   * @param {number} needs
   */
  const pick = (token, id, m, start, on, needs) => {
    const usual = TOWARD_CONTRAST[m];
    const order = [...stops].sort(
      (a, b) =>
        Math.abs(a - start) - Math.abs(b - start) ||
        (Math.sign(b - a) === usual ? 1 : -1),
    );
    /** @param {number} stop */
    const score = stop => {
      const c = ref(id, m, stop).color;
      return Math.min(...on.map(([, bg]) => contrast(c, bg)));
    };
    const scored = order.map(stop => ({stop, r: score(stop)}));
    const b =
      scored.find(x => x.r >= needs) ??
      scored.reduce((x, y) => (y.r > x.r ? y : x));
    if (reports(token))
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
    return ref(id, m, b.stop);
  };

  const neutral = fams.find(f => f.id === 'neutral');
  if (neutral) {
    for (const [token, pair] of Object.entries(NEUTRAL_STOPS)) {
      if (
        token === '--color-text-secondary' ||
        token === '--color-icon-secondary'
      )
        continue;
      put(
        token,
        'neutral',
        each(m => ref('neutral', m, at(pair[m === 'light' ? 0 : 1]))),
      );
    }
    for (const [token, pair] of Object.entries(NEUTRAL_TINTS))
      put(
        token,
        'neutral',
        each(m => {
          const [s, a] = pair[m === 'light' ? 0 : 1];
          return ref('neutral', m, at(s), a);
        }),
      );
    for (const [token, needs] of /** @type {const} */ ([
      ['--color-text-secondary', TEXT],
      ['--color-icon-secondary', NON_TEXT],
    ]))
      put(
        token,
        'neutral',
        each(m =>
          pick(
            token,
            'neutral',
            m,
            at(NEUTRAL_STOPS[token][m === 'light' ? 0 : 1]),
            surfaces(m, 'neutral'),
            needs,
          ),
        ),
      );
    const surface = paletteToken('neutral');
    const set = each(m => exactOf(surface, m));
    if (Object.values(set).some(Boolean))
      exact[surface] = /** @type {Partial<Record<Mode, string>>} */ (
        Object.fromEntries(Object.entries(set).filter(([, v]) => v))
      );
  }

  for (const f of fams) {
    if (f.id === 'neutral') continue;
    const word = f.id === 'accent' ? null : STATUS_TOKEN[f.id];
    const names = word
      ? {
          fill: `--color-${word}`,
          on: `--color-on-${word}`,
          text: `--color-text-${word}`,
          icon: `--color-icon-${word}`,
          muted: `--color-${word}-muted`,
          onMuted: `--color-on-${word}-muted`,
          border: `--color-border-${word}`,
          focus: null,
        }
      : {
          fill: '--color-accent',
          on: '--color-on-accent',
          text: '--color-text-accent',
          icon: '--color-icon-accent',
          muted: '--color-accent-muted',
          onMuted: null,
          border: null,
          focus: '--focus-outline-color',
        };
    const plain = plan.fills[f.id];
    const S = plain.stop;
    const fillWord = f.id;
    /** @type {Partial<Record<Mode, string>>} */
    const exactFill = {};
    for (const m of modes) {
      const v = exactOf(names.fill, m);
      if (v) exactFill[m] = v;
    }
    if (Object.keys(exactFill).length) exact[names.fill] = exactFill;

    /** @type {Partial<Record<Mode, StopRef>>} */
    const fill = {};
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
      if (reports(names.fill))
        checks.push({
          token: names.fill,
          mode: m,
          stop: found,
          preferred: S,
          against: 'the dark page and the text on it',
          ratio: plain.ratio,
          needs: TEXT,
          pass: true,
          note: `in dark, ${names.fill} is shade ${found}, not your exact color: ${plain.why}${found === start ? '' : `; shade ${start} does not pass either, so it is the nearest shade that does`}`,
        });
    }
    put(names.fill, f.id, fill);

    // Text on the fill reads on the fill the theme really uses: the exact
    // token setting when there is one. The exact color never moves; the
    // text changes instead.
    const on = each(m => {
      const used = exactFill[m] ?? /** @type {StopRef} */ (fill[m]).color;
      const o = t.onFor(fillWord, m, used);
      const what = exactFill[m]
        ? `your exact ${names.fill} (${used})`
        : `${names.fill} (shade ${fill[m]?.stop})`;
      const moved = o.on !== o.first;
      if (reports(names.on))
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
                  note: `${names.on} uses ${textName(o.on)} text in ${m}, not ${textName(o.first)}, so it reads at ${round(o.r)}:1 on ${what}, where ${textName(o.other)} text reads at only ${round(o.otherR)}:1`,
                }
              : {}),
        });
      return o.on;
    });
    put(names.on, f.id, on);

    // A pale fill in light can disappear into the page: say so, and keep
    // the exact color, the dial's or the token's.
    if (modes.includes('light') && has(names.fill)) {
      const used = exactFill.light ?? /** @type {StopRef} */ (fill.light).color;
      const p = t.page(used, 'light', f.id);
      if (p < NON_TEXT)
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
        });
    }

    // The tint: never the fill's own shade, see-through or not. The accent
    // tint keeps the official stop (85 light, 30 dark) unless Core's
    // citation text (--color-text-secondary) reads on it below both 4.5:1
    // and the official neutral theme's own pair (text-secondary on the
    // accent tint, read from the installed theme); only then it takes the
    // nearest shade that reads that well (darker first in dark, lighter
    // first in light), so it never ships below the official theme.
    const muted = each(m => {
      const i = m === 'light' ? 0 : 1;
      const spec = word ? STATUS_MUTED[i] : ACCENT_MUTED[i];
      const [s, alpha] = Array.isArray(spec) ? spec : [spec, undefined];
      const start = at(s);
      // Nearest first, both ways: lighter first in light, darker in dark.
      const usual = m === 'light' ? 1 : -1;
      const away = [...stops]
        .filter(x => x !== fill[m]?.stop)
        .sort(
          (a, b) =>
            Math.abs(a - start) - Math.abs(b - start) ||
            (Math.sign(b - a) === usual ? 1 : -1),
        );
      const secondary = word ? null : textSecondary(m);
      if (!secondary) return ref(f.id, m, away[0] ?? start, alpha);
      const scored = away.map(x => ({
        stop: x,
        r: contrast(secondary, ref(f.id, m, x).color),
      }));
      const official = officialCitation(m);
      if (official == null) return ref(f.id, m, away[0] ?? start, alpha);
      // Readable text (4.5:1) or the official theme's own ratio, whichever
      // asks less: in dark the official pair reads under 4.5:1, so that is
      // the bar; in light it reads above, so the tint moves only for text
      // that does not read.
      const needs = Math.min(TEXT, official);
      const b =
        scored.find(x => x.r >= needs - 0.005) ??
        scored.reduce((x, y) => (y.r > x.r ? y : x));
      const pass = b.r >= needs - 0.005;
      if (reports(names.muted) && (b.stop !== start || !pass))
        checks.push({
          token: names.muted,
          mode: m,
          stop: b.stop,
          preferred: start,
          against: 'citation text (--color-text-secondary)',
          ratio: round(b.r),
          needs: round(needs),
          pass,
          note: pass
            ? `${names.muted} uses shade ${b.stop} in ${m}, not ${start}, so citation text (--color-text-secondary) reads at ${round(b.r)}:1 on it${needs < TEXT ? `, as well as in the official neutral theme (${round(needs)}:1)` : ''}`
            : `citation text (--color-text-secondary) reads at only ${round(b.r)}:1 in ${m} on ${names.muted} even at shade ${b.stop}, the most contrasting one (needs ${round(needs)}:1): pick another ${f.id}, or set ${names.muted} exactly`,
        });
      return ref(f.id, m, b.stop, alpha);
    });
    put(names.muted, f.id, muted);
    /** The tint the theme really shows: an exact setting wins. @param {Mode} m */
    const mutedSeen = m => {
      const own = exactOf(names.muted, m);
      return own
        ? [/** @type {[string, string]} */ ([`your exact ${names.muted}`, own])]
        : over(
            names.muted,
            /** @type {StopRef} */ (muted[m]),
            surfaces(m, f.id),
          );
    };

    const text = each(m =>
      pick(
        names.text,
        f.id,
        m,
        at(TEXT_STOP[m === 'light' ? 0 : 1]),
        [...surfaces(m, f.id), ...mutedSeen(m)],
        TEXT,
      ),
    );
    put(names.text, f.id, text);
    put(names.icon, f.id, text);
    if (names.onMuted) {
      const onMuted = /** @type {string} */ (names.onMuted);
      put(
        onMuted,
        f.id,
        each(m =>
          pick(
            onMuted,
            f.id,
            m,
            at(ON_MUTED[m === 'light' ? 0 : 1]),
            mutedSeen(m),
            TEXT,
          ),
        ),
      );
    }
    if (names.border)
      put(
        names.border,
        f.id,
        each(m => ref(f.id, m, at(BORDER[m === 'light' ? 0 : 1]))),
      );
    // The focus ring follows the fill; with an exact fill it keeps
    // following that (Core's ring reads --color-accent).
    if (names.focus && !Object.keys(exactFill).length) {
      const focus = /** @type {string} */ (names.focus);
      put(
        focus,
        f.id,
        each(m =>
          pick(
            focus,
            f.id,
            m,
            /** @type {StopRef} */ (fill[m]).stop,
            surfaces(m, f.id),
            NON_TEXT,
          ),
        ),
      );
    }
  }
  return {
    candidate,
    families: fams,
    tokens,
    contrast: checks,
    vibrancy: config.vibrancy ?? VIBRANCY_DEFAULT,
    exact,
    notes: [
      ...plan.notes,
      ...(paletteEdited(cwd, slug)
        ? [
            `${paletteFiles(slug).palette} was edited by hand: the theme reads only the shades in ${paletteFiles(slug).refs}, which the editor writes, so the edit does not show, and the next color change asks whether to keep or discard it`,
          ]
        : []),
    ],
  };
}

/** Every token a color dial can point at a generated shade. */
export const PALETTE_TOKENS = new Set([
  ...Object.keys(NEUTRAL_STOPS),
  '--color-background-body',
  ...Object.keys(NEUTRAL_TINTS),
  '--color-accent',
  '--color-on-accent',
  '--color-text-accent',
  '--color-icon-accent',
  '--color-accent-muted',
  '--focus-outline-color',
  ...Object.values(STATUS_TOKEN).flatMap(w => [
    `--color-${w}`,
    `--color-on-${w}`,
    `--color-text-${w}`,
    `--color-icon-${w}`,
    `--color-${w}-muted`,
    `--color-on-${w}-muted`,
    `--color-border-${w}`,
  ]),
]);

/**
 * Where each token starts, for `how`: `token: light stop L, dark stop D`.
 * @param {string} dial
 * @returns {string[]}
 */
export function mappingRows(dial) {
  if (dial === 'neutral')
    return [
      'your exact color sits at its own shade, light and dark, and the shades around it follow it (white and black are already the ends of every ramp)',
      ...Object.entries(NEUTRAL_STOPS).map(
        ([t, [l, d]]) =>
          `${t}: light shade ${l}, dark shade ${d}${t.endsWith('-secondary') ? ` (moves to a shade that reads at ${t.includes('icon') ? NON_TEXT : TEXT}:1 on the surfaces)` : ''}`,
      ),
      ...Object.entries(NEUTRAL_TINTS).map(
        ([t, [[l, la], [d, da]]]) =>
          `${t}: light shade ${l} at opacity ${la}, dark shade ${d} at opacity ${da}`,
      ),
      "--color-background-body: the base theme's page color, so a tinted gray never tints the page",
    ];
  const word = dial === 'accent' ? null : STATUS_TOKEN[dial];
  if (dial !== 'accent' && !word) return [];
  const t = (/** @type {string} */ a, /** @type {string} */ b) =>
    word ? a.replace('$', word) : b;
  const onFirst =
    dial === 'warning'
      ? 'near-black first in both modes'
      : 'white first in light, near-black first in dark';
  const rows = [
    `${t('--color-$', '--color-accent')}: the color you gave, exactly, in light, and in dark when text on it reads at ${TEXT}:1 and it stands out from the dark page at ${NON_TEXT}:1; otherwise dark mode uses shade ${DARK_FILL}, or the shade nearest it that passes both, and the result says so. A light fill that stands out from the page at under ${NON_TEXT}:1 keeps your color, and the result says so`,
    `${t('--color-on-$', '--color-on-accent')}: the neutral color's white or near-black (${onFirst}; pure white or black without a neutral color), whichever reads at ${TEXT}:1 on the fill the theme uses`,
    `${t('--color-text-$', '--color-text-accent')} and ${t('--color-icon-$', '--color-icon-accent')}: light shade ${TEXT_STOP[0]}, dark shade ${TEXT_STOP[1]} (moves to the nearest shade, darker or lighter, that reads at ${TEXT}:1 on the surfaces and the muted tint)`,
    word
      ? `--color-${word}-muted: light shade ${STATUS_MUTED[0]}, dark shade ${STATUS_MUTED[1][0]} at opacity ${STATUS_MUTED[1][1]} over the surface, never the fill's own shade`
      : `--color-accent-muted: light shade ${ACCENT_MUTED[0]}, dark shade ${ACCENT_MUTED[1]}, as the official neutral theme maps it; moved to the nearest shade only when citation text (--color-text-secondary) would read on it below both ${TEXT}:1 and the official theme's own ratio, and never the fill's own shade`,
  ];
  if (word)
    rows.push(
      `--color-on-${word}-muted: light shade ${ON_MUTED[0]}, dark shade ${ON_MUTED[1]} (moves until it reads at ${TEXT}:1 on the muted tint)`,
      `--color-border-${word}: light shade ${BORDER[0]}, dark shade ${BORDER[1]}`,
    );
  else
    rows.push(
      `--focus-outline-color (the focus ring): the fill's shade, moved until it reads at ${NON_TEXT}:1 on the surfaces; with an exact --color-accent it follows that`,
      'links and selection read --color-text-accent and --color-accent; Core has no separate accent hover or pressed tokens (buttons tint with the overlay tokens, which the neutral dial sets)',
    );
  rows.push(
    `an exact ${t('--color-$', '--color-accent')} setting wins: the text on it is picked to read on your color, and the other tokens keep the generated shades`,
  );
  return rows;
}

/**
 * What one color dial did, for the result notes: what its main token uses
 * in each mode, every token contrast moved, and last the generated files.
 * What the config writer kept or replaced of a hand edit comes from the
 * build ({@link syncPalette}).
 * @param {PaletteMapping | null} pal
 * @param {string} dial
 * @param {string} slug
 * @param {Mode[]} [modes] the modes the theme has
 * @returns {string[]}
 */
export function paletteNotes(pal, dial, slug, modes = ['light', 'dark']) {
  if (!pal) return [];
  const f = paletteFiles(slug);
  const token = paletteToken(dial);
  const main = pal.tokens[token];
  const exact = pal.exact[token];
  /** @type {string[]} */
  const notes = [];
  if (exact) {
    const shown = modes
      .filter(m => exact[m])
      .map(m => `${exact[m]}${modes.length > 1 ? ` in ${m}` : ''}`)
      .join(' and ');
    notes.push(
      `${token} uses your exact setting (${shown}), not the generated ${dial} shade: an exact setting wins${dial === 'neutral' ? '' : '; the text on it is picked to read on your color'}${dial === 'accent' ? ', and the focus ring keeps following it' : ''}`,
    );
  } else if (main) {
    /** @param {Mode} m */
    const part = m =>
      main[m].exact
        ? m === 'dark' && modes.length > 1
          ? 'the same exact color in dark'
          : `your exact color (${main[m].color}, ${dial} shade ${main[m].stop}) in ${m}`
        : `${dial} shade ${main[m].stop} (${main[m].color}) in ${m}`;
    notes.push(`${token} uses ${modes.map(part).join(' and ')}`);
  }
  const given = pal.families.find(x => x.dial === dial);
  if (given && isClipped(given.value))
    notes.push(
      `your ${dial} ${given.value} is outside the colors every screen shows (sRGB), so the nearest one, ${given.seed}, is used`,
    );
  for (const c of pal.contrast) {
    if (pal.tokens[c.token]?.family !== dial) continue;
    // A theme with one mode never shows the other one's shades.
    if (!modes.includes(c.mode)) continue;
    if (c.note) notes.push(c.note);
    else if (!c.pass)
      notes.push(
        `${c.token} reads at only ${c.ratio}:1 in ${c.mode} on ${c.against} (needs ${c.needs}:1) even at shade ${c.stop}, the most contrasting one: pick a lighter or darker ${dial}, or set ${c.token} exactly`,
      );
    else if (c.stop !== c.preferred)
      notes.push(
        `${c.token} uses shade ${c.stop} in ${c.mode}, not ${c.preferred}, so it reads at ${c.ratio}:1 on ${c.against}`,
      );
  }
  notes.push(
    `the generated colors are in ${f.palette}, made from ${f.config} (receipt: ${f.receipt}); the theme imports only the shades it uses, from ${f.refs}`,
  );
  return notes;
}
