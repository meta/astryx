// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The palette behind the color dials of `astryx experimental theme`:
 * each color dial is one family in the theme's palette.config.json, grown by
 * the palette generator (the same function as `theme palette generate`), and
 * the theme's color tokens point at stops of that palette. Contrast moves a
 * token to a nearer stop that passes; it never makes a new color. The
 * `vibrancy` dial is the generator's `vibrancy`. Users see "colors" and
 * "shades": the words palette, family and stop stay in the code.
 *
 * @position api/theme-edit — imported by _settings.mjs, _check.mjs, _how.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  generateTonalPalette,
  perceptualDelta,
} from '../theme/palette/generate/generator.mjs';
import {themePaletteGenerate} from '../theme/palette/generate/generate.mjs';
import {hexToOklch} from '../theme/palette/generate/color.mjs';
import {parseColor, hex, ratio} from './_color.mjs';

/** @typedef {'light' | 'dark'} Mode */
/** @typedef {import('../theme/theme.type.mjs').TonalPaletteCandidate} Candidate */

/**
 * One token pointed at a palette stop in each mode.
 * @typedef {object} StopRef
 * @property {number} stop
 * @property {Mode} [from] - The ramp the stop is from when it is not the token's own mode: a dark fill that keeps the exact color takes the light ramp's stop.
 * @property {string} color - The stop's color, with `alpha` appended when set.
 * @property {string} [alpha] - Two hex digits of opacity.
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
 */

/**
 * The palette mapping of a theme.
 * @typedef {object} PaletteMapping
 * @property {Candidate} candidate
 * @property {Array<{id: string, dial: string, seed: string, value: string}>} families
 * @property {Record<string, {family: string, light: StopRef, dark: StopRef}>} tokens
 * @property {ContrastCheck[]} contrast
 * @property {number} vibrancy - The generator's vibrancy, 0 to 100.
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
 * The vibrancy the theme sets, or null.
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {number | null}
 */
function dialVibrancy(data) {
  const s = [...data.settings]
    .reverse()
    .find(x => x.source === 'dial' && x.thing === 'vibrancy');
  return s ? Number(s.value) : null;
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

/** Text contrast (WCAG AA) and non-text contrast (focus rings, icons). */
const TEXT = 4.5;
const NON_TEXT = 3;

/**
 * The stop each token starts from, `[light, dark]`, as the official themes
 * map them: neutral surfaces, text and borders as in the neutral theme (the
 * page background, `--color-background-body`, stays the base theme's, so a
 * tinted gray never tints the page); an
 * accent or status fill at its seed's anchored stop in light (as the neutral
 * theme anchors its blue) and 70 in dark (as the theme authoring guide maps
 * it); status text, tints and borders as the neutral theme maps its hue
 * families.
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
const FILL = /** @type {[number, number]} */ ([45, 70]);
const TEXT_STOP = /** @type {[number, number]} */ ([45, 80]);
const MUTED = /** @type {[number, number]} */ ([85, 25]);
const ON_MUTED = /** @type {[number, number]} */ ([25, 80]);
const BORDER = /** @type {[number, number]} */ ([80, 65]);
/** Text on a fill: white on light-mode fills, near-black on dark-mode fills. */
const ON_FILL = /** @type {Record<Mode, number[]>} */ ({
  light: [100, 5],
  dark: [5, 100],
});

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
    importPath: `./tokens/${slug}.palette`,
  };
}

/**
 * The seed a color dial value grows from, or null for a value with no fixed
 * color (a variable, a keyword, `color-mix()`).
 * @param {string} value
 */
export function seedOf(value) {
  const rgb = parseColor(value);
  return rgb ? hex(rgb) : null;
}

/**
 * Below this OKLCH chroma a seed reads as gray: its family is generated as a
 * neutral, so no hue is invented for it in either mode.
 */
const GRAY_CHROMA = 0.02;

/** @param {string} seed */
const isGray = seed => hexToOklch(seed).C < GRAY_CHROMA;

/**
 * The color dial settings of a theme, in dial order.
 * @param {import('./_settings.mjs').ThemeData} data
 */
function dialFamilies(data) {
  /** @type {Array<{id: string, dial: string, seed: string, value: string}>} */
  const out = [];
  for (const dial of PALETTE_DIALS) {
    const s = [...data.settings]
      .reverse()
      .find(x => x.source === 'dial' && x.thing === dial && !x.on && !x.mode);
    const seed = s && seedOf(s.value);
    if (s && seed) out.push({id: dial, dial, seed, value: s.value});
  }
  return out;
}

/** @param {string} file */
function readConfig(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new AstryxError(
      `${path.basename(path.dirname(file))}/palette.config.json is not valid JSON (${e instanceof Error ? e.message : String(e)}). Fix it by hand. Nothing was changed.`,
      [],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
}

/**
 * The light stop nearest a seed color in the ramp the generator grows from
 * it. The official themes anchor a brand color there, exactly, so the fill
 * keeps the color as given. The end stops are pure black and white and
 * never hold an anchor.
 * @param {string} seed
 * @param {any} config - Its `stops`, `vibrancy` and `neutralProfile` shape the ramp.
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
 * The palette config a theme's settings ask for: the existing config, with
 * each color dial's family written in place and families the dials no longer
 * set removed, and `vibrancy` as the vibrancy dial sets it (absent without
 * the dial). Other families and fields are kept. Null when the config would
 * hold no family.
 * @param {string} cwd
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {any}
 */
export function paletteConfig(cwd, slug, data) {
  const existing = readConfig(path.join(cwd, paletteFiles(slug).config));
  const fams = dialFamilies(data);
  if (!existing && !fams.length) return null;
  const config = {...(existing ?? {})};
  const vibrancy = dialVibrancy(data);
  if (vibrancy == null) delete config.vibrancy;
  else config.vibrancy = vibrancy;
  /** @type {any[]} */
  const before = Array.isArray(config.families) ? config.families : [];
  /** @param {{id: string, seed: string}} f */
  const familyOf = f => {
    if (f.id === 'neutral')
      return {id: f.id, name: 'Neutral', seed: f.seed, kind: 'neutral'};
    const kind = isGray(f.seed) ? 'neutral' : 'chromatic';
    return {
      id: f.id,
      name: f.id[0].toUpperCase() + f.id.slice(1),
      seed: f.seed,
      ...(kind === 'neutral' ? {kind} : {}),
      anchors: [
        {
          mode: 'light',
          stop: seedStop(f.seed, config, kind),
          color: f.seed,
          policy: 'exact',
        },
      ],
    };
  };
  const families = before
    .map(f => {
      if (!PALETTE_DIALS.includes(f?.id)) return f;
      const mine = fams.find(x => x.id === f.id);
      if (!mine) return null;
      const {kind, ...rest} = f;
      void kind;
      return {...rest, ...familyOf(mine)};
    })
    .filter(Boolean);
  for (const f of fams)
    if (!families.some(x => x.id === f.id)) families.push(familyOf(f));
  if (!families.length) return null;
  config.modeStrategy = 'light-and-dark';
  // The neutral profiles other than `custom` ignore the seed.
  if (families.some(f => f?.kind === 'neutral'))
    config.neutralProfile = 'custom';
  config.families = families;
  return config;
}

/**
 * Write the palette config, palette and receipt the settings ask for, with
 * the same generator as `theme palette generate --out`; remove all three
 * when no family is left. Files are only rewritten when the config changes.
 * @param {string} cwd
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 */
export function syncPalette(cwd, slug, data) {
  const f = paletteFiles(slug);
  const abs = (/** @type {string} */ p) => path.join(cwd, p);
  const config = paletteConfig(cwd, slug, data);
  if (!config) {
    for (const p of [f.config, f.palette, f.receipt])
      fs.rmSync(abs(p), {force: true});
    const tokensDir = path.dirname(abs(f.palette));
    if (fs.existsSync(tokensDir) && !fs.readdirSync(tokensDir).length)
      fs.rmdirSync(tokensDir);
    return;
  }
  const text = `${JSON.stringify(config, null, 2)}\n`;
  const same =
    fs.existsSync(abs(f.config)) &&
    fs.readFileSync(abs(f.config), 'utf8') === text &&
    fs.existsSync(abs(f.palette)) &&
    fs.existsSync(abs(f.receipt));
  if (same) return;
  fs.writeFileSync(abs(f.config), text);
  themePaletteGenerate(f.config, {out: f.palette, overwrite: true}, {cwd});
}

/** @param {any} config @returns {Candidate} */
function generate(config) {
  try {
    return generateTonalPalette(config);
  } catch (e) {
    throw new AstryxError(
      `The palette could not be generated: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.`,
      [],
      ERROR_CODES.ERR_PALETTE_GENERATION,
    );
  }
}

/**
 * The stops from `start` toward `dir`, `start` first.
 * @param {number[]} stops
 * @param {number} start
 * @param {1 | -1} dir
 */
function walk(stops, start, dir) {
  const i = stops.includes(start)
    ? stops.indexOf(start)
    : stops.findIndex(s => s >= start);
  const from = i < 0 ? stops.length - 1 : i;
  return dir > 0 ? stops.slice(from) : stops.slice(0, from + 1).reverse();
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const x = parseColor(a);
  const y = parseColor(b);
  return x && y ? ratio(x, y) : 0;
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
  const config = paletteConfig(cwd, slug, data);
  const candidate = generate(config);
  /** The light fill starts at the family's light anchor, as the seed lands there. @param {string} id */
  const fillStart = id =>
    /** @type {any[]} */ (config.families)
      .find(f => f.id === id)
      ?.anchors?.find((/** @type {any} */ a) => a.mode === 'light')?.stop ??
    FILL[0];
  const {stops} = candidate;
  /** @type {PaletteMapping['tokens']} */
  const tokens = {};
  /** @type {ContrastCheck[]} */
  const checks = [];
  const has = (/** @type {string} */ t) => t in tokenDefaults;
  /** @param {string} id @param {Mode} m @param {number} stop @param {string} [alpha] @returns {StopRef} */
  const ref = (id, m, stop, alpha) => {
    const color = /** @type {any} */ (candidate.palette[id])[m][stop];
    return alpha ? {stop, color: `${color}${alpha}`, alpha} : {stop, color};
  };
  /** @param {string} token @param {string} id @param {StopRef} light @param {StopRef} dark */
  const put = (token, id, light, dark) => {
    if (has(token)) tokens[token] = {family: id, light, dark};
  };
  /**
   * The first stop from `start` toward more contrast that reads at `needs`
   * on every color in `on`; the most contrasting stop when none does.
   * @param {string} token @param {string} id @param {Mode} m @param {number} start
   * @param {Array<[string, string]>} on - `[name, color]` pairs.
   * @param {number} needs
   */
  const pick = (token, id, m, start, on, needs) => {
    /** @type {{stop: number, r: number} | null} */
    let best = null;
    for (const stop of walk(stops, start, TOWARD_CONTRAST[m])) {
      const c = ref(id, m, stop).color;
      const r = Math.min(...on.map(([, bg]) => contrast(c, bg)));
      if (!best || r > best.r) best = {stop, r};
      if (r >= needs) {
        best = {stop, r};
        break;
      }
    }
    const b = /** @type {{stop: number, r: number}} */ (best);
    if (has(token))
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
  /**
   * A fill and the text on it: the fill moves toward more contrast until the
   * better of the two text stops reads at 4.5:1 on it.
   * @param {string} fillToken @param {string} onToken @param {string} id @param {Mode} m @param {number} start
   */
  const fillPair = (fillToken, onToken, id, m, start) => {
    /** @type {{fill: number, on: number, r: number} | null} */
    let best = null;
    for (const stop of walk(stops, start, TOWARD_CONTRAST[m])) {
      const fill = ref(id, m, stop).color;
      for (const on of ON_FILL[m]) {
        const r = contrast(ref(id, m, on).color, fill);
        if (!best || r > best.r + 0.01) best = {fill: stop, on, r};
      }
      if (/** @type {{r: number}} */ (best).r >= TEXT) break;
    }
    const b = /** @type {{fill: number, on: number, r: number}} */ (best);
    // The other text shade's ratio on the same fill, so a switch between
    // white and near-black text says why.
    const other = ON_FILL[m].find(on => on !== b.on);
    const otherR =
      other == null
        ? null
        : round(contrast(ref(id, m, other).color, ref(id, m, b.fill).color));
    if (has(onToken))
      checks.push({
        token: onToken,
        mode: m,
        stop: b.on,
        preferred: ON_FILL[m][0],
        against: `${fillToken} (shade ${b.fill})${otherR == null ? '' : `, where ${other === 100 ? 'white' : other === 0 || other === 5 ? 'near-black' : `shade ${other}`} text reads at only ${otherR}:1`}`,
        ratio: round(b.r),
        needs: TEXT,
        pass: b.r >= TEXT,
      });
    return {fill: ref(id, m, b.fill), on: ref(id, m, b.on), moved: b.fill};
  };

  /**
   * The dark fill as the exact color given, when text on it reads at 4.5:1
   * (white first, then the dark text stop) and it stands out from the dark
   * surfaces at 3:1; no pair otherwise, with why.
   * @param {string} fillToken @param {string} onToken @param {string} id @param {number} seedStop
   * @returns {{pair: ReturnType<typeof fillPair> | null, ratio: number, why: string}}
   */
  const exactDarkFill = (fillToken, onToken, id, seedStop) => {
    const fill = ref(id, 'light', seedStop);
    const best = [...ON_FILL.dark]
      .reverse()
      .map(on => ({on, r: contrast(ref(id, 'dark', on).color, fill.color)}))
      .reduce((a, b) => (b.r > a.r + 0.01 ? b : a));
    if (best.r < TEXT)
      return {
        pair: null,
        ratio: round(best.r),
        why: `your exact color reads at only ${round(best.r)}:1 with any text shade, and text needs ${TEXT}:1`,
      };
    // The fill must also stand out from the dark surfaces it sits on.
    const page = Math.min(
      ...surfaces('dark', id).map(([, bg]) => contrast(fill.color, bg)),
    );
    if (page < NON_TEXT)
      return {
        pair: null,
        ratio: round(page),
        why: `your exact color stands out from the dark page at only ${round(page)}:1, and a fill needs ${NON_TEXT}:1`,
      };
    if (has(onToken))
      checks.push({
        token: onToken,
        mode: 'dark',
        stop: best.on,
        preferred: ON_FILL.dark[1],
        against: `${fillToken} (your exact color)`,
        ratio: round(best.r),
        needs: TEXT,
        pass: true,
      });
    return {
      pair: {
        fill: {...fill, from: /** @type {Mode} */ ('light')},
        on: ref(id, 'dark', best.on),
        moved: FILL[1],
      },
      ratio: round(best.r),
      why: '',
    };
  };

  const modes = /** @type {Mode[]} */ (['light', 'dark']);
  const neutral = fams.find(f => f.id === 'neutral');
  if (neutral) {
    for (const [token, [l, d]] of Object.entries(NEUTRAL_STOPS)) {
      if (
        token === '--color-text-secondary' ||
        token === '--color-icon-secondary'
      )
        continue;
      put(
        token,
        'neutral',
        ref('neutral', 'light', l),
        ref('neutral', 'dark', d),
      );
    }
    for (const [token, [[l, la], [d, da]]] of Object.entries(NEUTRAL_TINTS))
      put(
        token,
        'neutral',
        ref('neutral', 'light', l, la),
        ref('neutral', 'dark', d, da),
      );
  }
  /** What text sits on in each mode: the neutral surfaces, else the base theme's. @param {Mode} m @param {string} id */
  const surfaces = (m, id) => {
    const names = [
      '--color-background-surface',
      '--color-background-body',
      '--color-background-card',
    ];
    /** @type {Array<[string, string]>} */
    const out = [];
    for (const n of names) {
      const v = tokens[n]?.[m].color ?? base[m][n];
      if (v && parseColor(v)) out.push([n, v]);
    }
    if (!out.length)
      out.push([
        `${id} shade ${NEUTRAL_STOPS['--color-background-surface'][m === 'light' ? 0 : 1]}`,
        ref(
          id,
          m,
          NEUTRAL_STOPS['--color-background-surface'][m === 'light' ? 0 : 1],
        ).color,
      ]);
    return out;
  };
  if (neutral) {
    const [[tl, td], [il, id]] = [
      NEUTRAL_STOPS['--color-text-secondary'],
      NEUTRAL_STOPS['--color-icon-secondary'],
    ];
    const text = modes.map((m, i) =>
      pick(
        '--color-text-secondary',
        'neutral',
        m,
        [tl, td][i],
        surfaces(m, 'neutral'),
        TEXT,
      ),
    );
    put('--color-text-secondary', 'neutral', text[0], text[1]);
    const icon = modes.map((m, i) =>
      pick(
        '--color-icon-secondary',
        'neutral',
        m,
        [il, id][i],
        surfaces(m, 'neutral'),
        NON_TEXT,
      ),
    );
    put('--color-icon-secondary', 'neutral', icon[0], icon[1]);
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
    const muted = modes.map((m, i) => ref(f.id, m, MUTED[i]));
    put(names.muted, f.id, muted[0], muted[1]);
    const pairs = modes.map(m => {
      if (m === 'light')
        return fillPair(names.fill, names.on, f.id, m, fillStart(f.id));
      const exact = exactDarkFill(names.fill, names.on, f.id, fillStart(f.id));
      if (exact.pair) return exact.pair;
      const pair = fillPair(names.fill, names.on, f.id, m, FILL[1]);
      if (has(names.fill))
        checks.push({
          token: names.fill,
          mode: 'dark',
          stop: pair.fill.stop,
          preferred: fillStart(f.id),
          against: `the text on it: ${exact.why}`,
          ratio: exact.ratio,
          needs: TEXT,
          pass: true,
        });
      return pair;
    });
    put(names.fill, f.id, pairs[0].fill, pairs[1].fill);
    put(names.on, f.id, pairs[0].on, pairs[1].on);
    const text = modes.map((m, i) =>
      pick(
        names.text,
        f.id,
        m,
        TEXT_STOP[i],
        [...surfaces(m, f.id), [names.muted, muted[i].color]],
        TEXT,
      ),
    );
    put(names.text, f.id, text[0], text[1]);
    put(names.icon, f.id, text[0], text[1]);
    if (names.onMuted) {
      const on = modes.map((m, i) =>
        pick(
          /** @type {string} */ (names.onMuted),
          f.id,
          m,
          ON_MUTED[i],
          [[names.muted, muted[i].color]],
          TEXT,
        ),
      );
      put(names.onMuted, f.id, on[0], on[1]);
    }
    if (names.border)
      put(
        names.border,
        f.id,
        ref(f.id, 'light', BORDER[0]),
        ref(f.id, 'dark', BORDER[1]),
      );
    if (names.focus) {
      const ring = modes.map((m, i) =>
        pick(
          /** @type {string} */ (names.focus),
          f.id,
          m,
          pairs[i].moved,
          surfaces(m, f.id),
          NON_TEXT,
        ),
      );
      put(names.focus, f.id, ring[0], ring[1]);
    }
  }
  return {
    candidate,
    families: fams,
    tokens,
    contrast: checks,
    vibrancy: config.vibrancy ?? VIBRANCY_DEFAULT,
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
      ...Object.entries(NEUTRAL_STOPS).map(
        ([t, [l, d]]) =>
          `${t}: light shade ${l}, dark shade ${d}${t.endsWith('-secondary') ? ` (moves to a shade that reads at ${t.includes('icon') ? NON_TEXT : TEXT}:1 on the surfaces)` : ''}`,
      ),
      ...Object.entries(NEUTRAL_TINTS).map(
        ([t, [[l, la], [d, da]]]) =>
          `${t}: light shade ${l} at opacity ${la}, dark shade ${d} at opacity ${da}`,
      ),
    ];
  const word = dial === 'accent' ? null : STATUS_TOKEN[dial];
  if (dial !== 'accent' && !word) return [];
  const t = (/** @type {string} */ a, /** @type {string} */ b) =>
    word ? a.replace('$', word) : b;
  const rows = [
    `${t('--color-$', '--color-accent')}: the color you gave, exactly, in light and in dark; in dark, when no text on it reads at ${TEXT}:1, shade ${FILL[1]} or the nearest shade where text does, and the result says so`,
    `${t('--color-on-$', '--color-on-accent')}: shade ${ON_FILL.light[0]} or ${ON_FILL.light[1]} in light, ${ON_FILL.dark[0]} or ${ON_FILL.dark[1]} in dark, whichever reads better on the fill`,
    `${t('--color-text-$', '--color-text-accent')} and ${t('--color-icon-$', '--color-icon-accent')}: light shade ${TEXT_STOP[0]}, dark shade ${TEXT_STOP[1]} (moves until it reads at ${TEXT}:1 on the surfaces and the muted tint)`,
    `${t('--color-$-muted', '--color-accent-muted')}: light shade ${MUTED[0]}, dark shade ${MUTED[1]}`,
  ];
  if (word)
    rows.push(
      `--color-on-${word}-muted: light shade ${ON_MUTED[0]}, dark shade ${ON_MUTED[1]} (moves until it reads at ${TEXT}:1 on the muted tint)`,
      `--color-border-${word}: light shade ${BORDER[0]}, dark shade ${BORDER[1]}`,
    );
  else
    rows.push(
      `--focus-outline-color (the focus ring): the accent's shade, moved until it reads at ${NON_TEXT}:1 on the surfaces`,
      'links and selection read --color-text-accent and --color-accent; Core has no separate accent hover or pressed tokens (buttons tint with the overlay tokens, which the neutral dial sets)',
    );
  return rows;
}

/**
 * What one color dial did, for the result notes: the shade of its main token
 * in each mode, every token contrast moved, and last the generated files.
 * @param {PaletteMapping | null} pal
 * @param {string} dial
 * @param {string} slug
 * @param {Mode[]} [modes] the modes the theme has
 * @returns {string[]}
 */
export function paletteNotes(pal, dial, slug, modes = ['light', 'dark']) {
  if (!pal) return [];
  const f = paletteFiles(slug);
  const main = pal.tokens[paletteToken(dial)];
  /** @type {string[]} */
  const notes = [];
  const lightPart = `${dial} shade ${main?.light.stop} (${main?.light.color}) in light`;
  const darkPart = main?.dark.from
    ? 'the same exact color in dark'
    : `shade ${main?.dark.stop} (${main?.dark.color}) in dark`;
  if (main)
    notes.push(
      `${paletteToken(dial)} uses ${modes.length > 1 ? `${lightPart} and ${darkPart}` : modes[0] === 'light' ? lightPart : darkPart.replace(/^shade/, `${dial} shade`).replace(/^the same exact color/, 'your exact color')}`,
    );
  for (const c of pal.contrast) {
    if (pal.tokens[c.token]?.family !== dial) continue;
    // A theme with one mode never shows the other one's shades.
    if (!modes.includes(c.mode)) continue;
    if (c.against.startsWith('the text on it'))
      notes.push(
        `in dark, ${c.token} is shade ${c.stop}, not your exact color: ${c.against.slice('the text on it: '.length)}`,
      );
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
    `the generated colors are in ${f.palette}, made from ${f.config} (receipt: ${f.receipt})`,
  );
  return notes;
}
