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

import * as fs from 'node:fs';
import * as path from 'node:path';
import {isAlive} from '../../foundation/release/cache.mjs';
import {stillHolds} from '../../foundation/release/folder-lock.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {parse} from '@babel/parser';
import {THEMES_DIR} from '../../foundation/discovery/theme-discovery.mjs';
import {
  ANCHOR_INPUT_KEYS,
  DEFAULT_21_STOPS,
  FAMILY_INPUT_KEYS,
  GENERATION_INPUT_KEYS,
  PALETTE_BLACK,
  PALETTE_GENERATOR_VERSION,
  PALETTE_WHITE,
  generateTonalPalette,
  modesForStrategy,
  perceptualDelta,
} from '../theme/palette/generate/generator.mjs';
import {themePaletteGenerate} from '../theme/palette/generate/generate.mjs';
/**
 * How the page-wide tokens a theme's own source sets are read: given by
 * _settings (which imports this module) when it loads.
 * @type {(cwd: string, slug: string) => Record<string, string>}
 */
let ownSourceTokenValues = () => ({});

/**
 * Give the reader of the tokens a theme's own source sets.
 * @param {(cwd: string, slug: string) => Record<string, string>} read
 */
export function setOwnTokenReader(read) {
  ownSourceTokenValues = read;
}
import {hexToOklch, normalizeColor} from '../theme/palette/generate/color.mjs';
import {
  alphaOf,
  compositeOver,
  hex,
  isClipped,
  parseColor,
  ratio,
} from './_color.mjs';
import {splitTop} from './_css.mjs';
import {P, wordTable} from './_tables.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {sha256} from '../../foundation/render/source-block.mjs';

/**
 * Write a file whole: a temp file beside it, renamed into place, so a link
 * there is replaced, never written through, and a stopped write leaves the
 * old file. The temp file goes whatever happens.
 * @param {string} file
 * @param {string | Buffer} text
 */
export function writeWhole(file, text) {
  // A folder where a file goes (a folder named preview.html) is never
  // written through or replaced.
  if (fs.lstatSync(file, {throwIfNoEntry: false})?.isDirectory())
    throw new AstryxError(
      `${[path.dirname(path.dirname(file)), path.dirname(file), file].map(p => path.basename(p)).join('/')} is a folder, so the editor cannot write that file there. Rename or move the folder, then run the command again.`,
      [
        {
          name: `ls -la ${quoteCommandArgument(file)}`,
          reason:
            'see what is in the folder; move or rename it, then run the same command again',
        },
      ],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  sweepTemps(path.dirname(file));
  refuseIfLockLost();
  const tmp = tempFor(file);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, {force: true});
  }
}

/**
 * A command stopped long enough for another to take its lock (Ctrl-Z, a
 * sleeping computer, a debugger) writes nothing more: refuse. Called right
 * before each write.
 */
export function refuseIfLockLost() {
  if (lockHeld()) return;
  const error = new AstryxError(
    `Another command took over the theme's lock while this one was stopped (Ctrl-Z, a sleeping computer, a debugger). This command's change was not applied, and it touched nothing more: the files stay as the other command left them. Run it again if you still want it.`,
    [{name: `${P} how --list dials`, reason: 'what you can set'}],
    ERROR_CODES.ERR_THEME_BUSY,
  );
  /** @type {any} */ (error).lockLost = true;
  throw error;
}

/** Whether this command still holds its lock (true outside a lock). */
export function lockHeld() {
  try {
    stillHolds();
    return true;
  } catch {
    return false;
  }
}

/** When this process started, for telling its own temp files from an earlier one's with the same id. */
const STARTED_AT = Date.now() - process.uptime() * 1000;

/**
 * Remove the editor's own temp files a stopped command left in a folder:
 * only names the editor makes (`.<name>.astryx-<pid>-<random>.tmp`) whose
 * process is gone, or that are older than ten minutes, and a build's
 * `.<name>.tmp-<id>` older than ten minutes. Links are never
 * followed. A theme folder holds a few files, so every write looks.
 * @param {string} dir
 */
function sweepTemps(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    // A build's own temp (`.<name>.tmp-<id>`) names no process: one older
    // than ten minutes is a leftover of a command stopped mid-build (a
    // build renames it in moments).
    if (/^\..+\.tmp-[\w-]+$/.test(n)) {
      const p = path.join(dir, n);
      try {
        const st = fs.lstatSync(p);
        if (st.isFile() && Date.now() - st.mtimeMs >= 10 * 60_000)
          fs.rmSync(p, {force: true});
      } catch {
        // Gone already.
      }
      continue;
    }
    const m = /^\..+\.astryx-(\d+)-[a-z0-9]+\.tmp$/.exec(n);
    if (!m) continue;
    const p = path.join(dir, n);
    try {
      const st = fs.lstatSync(p);
      // Writes into a theme folder run under its lock, so a temp file
      // whose process is gone is never one a live command still renames.
      if (!st.isFile()) continue;
      // A process id from another process space (pid 1 in a container)
      // may look alive here: past ten minutes, an editor temp file is a
      // leftover whatever its id says (a live writer renames it in
      // moments, and holds the lock this write holds now).
      // A temp named with this process's own id but older than this process
      // is another one's (pid 1 in each container start).
      const own = Number(m[1]) === process.pid;
      const young = Date.now() - st.mtimeMs < 10 * 60_000;
      if (
        own ? st.mtimeMs >= STARTED_AT && young : isAlive(Number(m[1])) && young
      )
        continue;
      fs.rmSync(p, {force: true});
    } catch {
      // Gone already, or not ours to judge.
    }
  }
}

/**
 * Remove `dir` when it is empty; with `deep`, the empty folders under it
 * first. A folder with a file in it stays.
 * @param {string} dir
 * @param {{deep?: boolean}} [opts]
 */
export function removeEmptyFolder(dir, opts = {}) {
  if (!fs.existsSync(dir)) return;
  if (opts.deep)
    for (const e of fs.readdirSync(dir, {withFileTypes: true}))
      if (e.isDirectory()) removeEmptyFolder(path.join(dir, e.name), opts);
  try {
    fs.rmdirSync(dir);
  } catch {
    // Not empty, or gone already.
  }
}

/**
 * Whether a file name is one of the editor's own temp files: a whole-file
 * write's `.<name>.astryx-<pid>-<random>.tmp`, or a build's
 * `.<name>.tmp-<id>`. A command stopped part way can leave one behind.
 * @param {string} name
 */
export const isEditorTemp = name =>
  /^\..+\.(astryx-\d+-[a-z0-9]+\.tmp|tmp-[\w-]+)$/.test(name);

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
 * @property {string[]} [dials] - The color dials whose notes report it, when its token belongs to none of them.
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
 * @property {Record<string, string>} [unread] - Main tokens the theme sets exactly to a value the editor cannot read as one color in some mode, as written: the text on them is not picked for that value.
 * @property {string[]} notes - What the config writer kept or replaced of a hand edit.
 * @property {Record<string, Partial<Record<Mode, StopRef>>> | null} lift - Lifted secondary text per background token of LIFT_PARTS (the accent tint, the neutral track), per mode, from the neutral color; null without one.
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
const STATUS_TOKEN = wordTable(
  /** @type {Record<string, string>} */ ({
    success: 'success',
    warning: 'warning',
    danger: 'error',
    info: 'info',
  }),
);

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
 * The official neutral theme's color mapping, read from the theme the CLI
 * ships rather than copied: each token's stops, `[light, dark]`, written
 * there as `<family>.<mode>[N]` or `withAlpha(<family>.<mode>[N], 'aa')`,
 * and the parts whose secondary text it lifts (`[part, block]`).
 * @returns {{stops: Record<string, Array<{stop: number, alpha?: string}>>, lifted: Array<[string, string]>}}
 */
function readOfficialNeutral() {
  const ast = parse(
    fs.readFileSync(
      path.join(THEMES_DIR, 'neutral', 'neutralTheme.ts'),
      'utf8',
    ),
    {sourceType: 'module', plugins: ['typescript']},
  );
  /** @param {any} n @returns {{stop: number, alpha?: string} | null} */
  const stopOf = n => {
    if (n?.type === 'CallExpression' && n.callee?.name === 'withAlpha') {
      const inner = stopOf(n.arguments[0]);
      const alpha = n.arguments[1]?.value;
      return inner && typeof alpha === 'string'
        ? {...inner, alpha: alpha.toLowerCase()}
        : null;
    }
    return n?.type === 'MemberExpression' &&
      n.computed &&
      n.property.type === 'NumericLiteral' &&
      ['light', 'dark'].includes(n.object?.property?.name)
      ? {stop: n.property.value}
      : null;
  };
  /** @type {Record<string, Array<{stop: number, alpha?: string}>>} */
  const stops = {};
  /** @type {Array<[string, string]>} */
  const lifted = [];
  /** @param {any} node @param {string[]} keys */
  const visit = (node, keys) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectProperty') {
      const key = node.key.name ?? node.key.value;
      const at = [...keys, String(key)];
      if (keys.at(-1) === 'tokens' && node.value.type === 'ArrayExpression') {
        const pair = node.value.elements.map(stopOf);
        if (pair.length === 2 && pair.every(Boolean)) stops[key] = pair;
      }
      if (keys.at(-3) === 'components' && key === '--color-text-secondary')
        lifted.push([keys.at(-2) ?? '', keys.at(-1) ?? '']);
      visit(node.value, at);
      return;
    }
    for (const [k, v] of Object.entries(node))
      if (k !== 'loc' && k !== 'start' && k !== 'end')
        for (const x of Array.isArray(v) ? v : [v]) visit(x, keys);
  };
  visit(ast.program, []);
  return {stops, lifted};
}
const OFFICIAL = readOfficialNeutral();
/** A token's official `[light, dark]` stops. @param {string} token */
const officialStops = token =>
  /** @type {[number, number]} */ (
    (OFFICIAL.stops[token] ?? []).map(x => x.stop)
  );

/**
 * The tokens the neutral color sets at the official theme's stops. The page
 * background, `--color-background-body`, stays the base theme's, so a
 * tinted gray never tints the page. A layout without one of these stops
 * uses the nearest one it has.
 */
const NEUTRAL_STOPS = wordTable(
  Object.fromEntries(
    [
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
    ].map(t => [t, officialStops(t)]),
  ),
);
/** Neutral tints: a stop with an opacity, `[[stop, alpha], [stop, alpha]]`. */
const NEUTRAL_TINTS = wordTable(
  Object.fromEntries(
    ['--color-border', '--color-overlay-hover', '--color-overlay-pressed'].map(
      t => [
        t,
        /** @type {[[number, string], [number, string]]} */ (
          OFFICIAL.stops[t].map(x => [x.stop, String(x.alpha)])
        ),
      ],
    ),
  ),
);
/**
 * Accent and status stops, `[light, dark]`, as the official neutral theme
 * maps its accent tint and its status families (info stands for them). The
 * dark fill starts at 70, where the theme authoring guide puts it, when the
 * exact color does not read in dark. A status tint is translucent in dark
 * (`[stop, alpha]`).
 */
const DARK_FILL = 70;
const TEXT_STOP = officialStops('--color-text-info');
const ACCENT_MUTED = officialStops('--color-accent-muted');
const STATUS_MUTED = /** @type {[number, [number, string]]} */ (
  OFFICIAL.stops['--color-info-muted'].map((x, i) =>
    i === 0 ? x.stop : [x.stop, String(x.alpha)],
  )
);
const ON_MUTED = officialStops('--color-on-info-muted');
/**
 * The parts whose secondary text the official neutral theme lifts, with
 * the block it lifts it in and what the text sits on: the accent tint,
 * except under segmented-control labels, which sit on the translucent
 * neutral track (`--color-neutral`).
 */
export const LIFT_PARTS = OFFICIAL.lifted.map(
  ([part, block]) =>
    /** @type {[string, string, string]} */ ([
      part,
      block,
      part === 'segmented-control-item'
        ? '--color-neutral'
        : '--color-accent-muted',
    ]),
);
/** What each lifted background is, and the parts on it, for notes. */
const LIFT_GROUNDS =
  /** @type {Record<string, {what: string, parts: string}>} */ ({
    '--color-accent-muted': {
      what: 'the accent tint',
      parts: 'selected items and rows, a dropzone, numbered citations',
    },
    '--color-neutral': {
      what: 'the neutral track',
      parts: 'segmented-control labels',
    },
  });
const BORDER = /** @type {[number, number]} */ ([80, 65]);
/**
 * Text on a fill, from the neutral family as the official themes take it:
 * white (100) first in light, near-black (5) first in dark, and near-black
 * first in both modes on warning. Without a neutral color, black and white.
 */
const [ON_LIGHT, ON_DARK] = officialStops('--color-on-accent');
const ON_FILL = wordTable(
  /** @type {Record<Mode, [number, number]>} */ ({
    light: [ON_LIGHT, ON_DARK],
    dark: [ON_DARK, ON_LIGHT],
  }),
);
/** A layout needs this many stops between black and white to map every token. */
const MIN_INNER_STOPS = 5;
/** The widest gap between two stops that still maps every token near its stop. */
const MAX_STOP_GAP = 25;

/** Text on surfaces darkens in light mode and lightens in dark mode. */
const TOWARD_CONTRAST = wordTable(
  /** @type {Record<Mode, 1 | -1>} */ ({
    light: -1,
    dark: 1,
  }),
);

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
 * The modes a theme has: one for a one-mode theme, else light and dark.
 * @param {{mode?: string}} data
 * @returns {Mode[]}
 */
export function modesOf(data) {
  return modesForStrategy(
    data.mode === 'light-only' || data.mode === 'dark-only'
      ? data.mode
      : 'light-and-dark',
  );
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

/** Notes for damaged color configs kept aside during one sync. @type {string[]} */
const keptDamaged = [];

/** @param {string} file */
function readConfig(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    // A file that does not parse holds nothing the editor can keep: it is
    // read as no config. Only a command that writes the theme keeps its
    // text aside (keepDamaged), so a read writes nothing.
    damagedConfigs.add(file);
    return null;
  }
}

/** Damaged configs read in this run, kept aside when a change is written. */
const damagedConfigs = new Set();

/**
 * Keep a damaged config's text beside it (palette.config.damaged.json,
 * then -2, -3 …; the same text once) before the editor writes the config
 * again, and say where.
 * @param {string} file
 */
function keepDamaged(file) {
  if (!damagedConfigs.has(file) || !fs.existsSync(file)) return;
  damagedConfigs.delete(file);
  {
    const text = fs.readFileSync(file);
    let n = 1;
    const name = (/** @type {number} */ k) =>
      `palette.config.damaged${k > 1 ? `-${k}` : ''}.json`;
    const at = (/** @type {number} */ k) =>
      path.join(path.dirname(file), name(k));
    // The same damaged text is kept once.
    while (fs.existsSync(at(n)) && !fs.readFileSync(at(n)).equals(text)) n++;
    if (!fs.existsSync(at(n))) fs.copyFileSync(file, at(n));
    keptDamaged.push(
      `palette.config.json was damaged, so it was made again from the settings; its text is kept in ${name(n)}`,
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

/**
 * The fields of a config the generator never reads, by path.
 * @param {any} config
 * @returns {string[]}
 */
function deadKeys(config) {
  /** @type {string[]} */
  const out = Object.keys(config).filter(
    k => !GENERATION_INPUT_KEYS.includes(k),
  );
  (Array.isArray(config.families) ? config.families : []).forEach(
    (/** @type {any} */ f, /** @type {number} */ i) => {
      if (!f || typeof f !== 'object') return;
      for (const k of Object.keys(f))
        if (!FAMILY_INPUT_KEYS.includes(k)) out.push(`families[${i}].${k}`);
      (Array.isArray(f.anchors) ? f.anchors : []).forEach(
        (/** @type {any} */ a, /** @type {number} */ j) => {
          if (a && typeof a === 'object')
            for (const k of Object.keys(a))
              if (!ANCHOR_INPUT_KEYS.includes(k))
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
      [{name: `${P} how colors`, reason: 'how the shades are made'}],
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
function tools(
  candidate,
  data,
  base,
  /** @type {Record<string, string>} */ own = {},
) {
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
   * The whole-theme value a token setting gives in a mode, as written, or
   * undefined.
   * @param {string} token @param {Mode} m
   */
  const settingOf = (token, m) =>
    // A page-wide token the theme's own source sets wins over the settings
    // (the build shows it), as an exact setting would.
    (Object.hasOwn(own, token) ? own[token] : undefined) ??
    [...data.settings]
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
  /**
   * The fixed color a value gives in a mode, as written when it is one
   * already, or null: `light-dark()` takes its side for the mode, and a
   * `var()` reads the theme's own setting, else the base theme's value.
   * @param {unknown} value @param {Mode} m @param {Set<string>} [seen]
   * @returns {string | null}
   */
  const colorIn = (value, m, seen = new Set()) => {
    const v = String(value ?? '').trim();
    if (!v) return null;
    if (parseColor(v)) return v;
    const fn = /^([a-z-]+)\((.*)\)$/is.exec(v);
    if (!fn) return null;
    const name = fn[1].toLowerCase();
    if (name === 'light-dark') {
      const halves = splitTop(fn[2], ',');
      return halves.length === 2
        ? colorIn(halves[m === 'dark' ? 1 : 0], m, seen)
        : null;
    }
    if (name !== 'var') {
      // A color function of tokens (a color-mix() of two) reads each one.
      const put = v.replace(
        /var\(\s*(--[a-z0-9-]+)\s*\)/gi,
        (whole, t) => colorIn(`var(${t})`, m, new Set(seen)) ?? whole,
      );
      return put !== v && parseColor(put) ? put : null;
    }
    const [ref, ...rest] = splitTop(fn[2], ',');
    const t = ref.trim();
    if (!/^--[a-z0-9-]+$/i.test(t) || seen.has(t)) return null;
    seen.add(t);
    const own = settingOf(t, m);
    const read =
      own != null ? colorIn(own, m, seen) : colorIn(base?.[m]?.[t], m, seen);
    return read ?? (rest.length ? colorIn(rest.join(','), m, seen) : null);
  };
  /**
   * The exact whole-theme color a token setting gives in a mode, or null.
   * @param {string} token @param {Mode} m
   */
  const exactOf = (token, m) => {
    const v = colorIn(settingOf(token, m), m);
    const rgb = v == null ? null : parseColor(v);
    return rgb && v != null && alphaOf(v) >= 1 ? hex(rgb) : null;
  };
  /**
   * The exact whole-theme color a token setting gives in a mode, see-through
   * or not, as written (a hex keeps its alpha digits; a `light-dark()` or a
   * `var()` gives the color it reads in the mode); null when there is none
   * or it is not a fixed color.
   * @param {string} token @param {Mode} m
   */
  const rawOf = (token, m) => colorIn(settingOf(token, m), m);
  /**
   * Which column of a `[light, dark]` mapping a mode takes: the light one
   * on a light page and the dark one on a dark page, by the page the theme
   * keeps (its exact page color, else the base theme's). A base whose
   * light page is dark, such as Gothic, gets dark-page shades in light.
   * @param {Mode} m
   * @returns {0 | 1}
   */
  const side = m => {
    const page =
      rawOf('--color-background-body', m) ??
      base?.[m]?.['--color-background-body'];
    const rgb = page ? parseColor(page) : null;
    if (!rgb || alphaOf(page) < 1) return m === 'light' ? 0 : 1;
    return ratio(rgb, [255, 255, 255]) > ratio(rgb, [0, 0, 0]) ? 1 : 0;
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
          ? ref('neutral', m, at(NEUTRAL_STOPS[n][side(m)])).color
          : null;
      const v = exactOf(n, m) ?? own ?? base?.[m]?.[n];
      if (v && parseColor(v) && alphaOf(v) >= 1)
        out.push([n, hex(/** @type {number[]} */ (parseColor(v)))]);
    }
    if (!out.length) {
      const s = at(NEUTRAL_STOPS['--color-background-surface'][side(m)]);
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
  /**
   * A color as the eye sees it on the surface in a mode: a see-through one
   * drawn over the first surface.
   * @param {string} color @param {Mode} m @param {string} id
   */
  const solid = (color, m, id) => {
    const rgb = /** @type {[number, number, number]} */ (parseColor(color));
    const a = alphaOf(color);
    if (a >= 1) return hex(rgb);
    const under = /** @type {[number, number, number]} */ (
      parseColor(surfaces(m, id)[0][1])
    );
    return hex(compositeOver(rgb, a, under));
  };
  return {
    stops,
    at,
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
  };
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
  // Every theme's palette has both modes: a one-mode theme keeps both
  // halves of its colors (its mode is the one the app's <Theme> is given),
  // and a region Core draws in the other mode reads the other half.
  const modes = modesForStrategy('light-and-dark');

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
  const wrote = savedMode ? strategyOf(modesOf({mode: savedMode})) : null;
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
          `${file}: the ${f.id} ${a?.mode} anchor at shade ${shade(a?.stop)} is dropped: the theme has no ${a?.mode} mode`,
        );
        continue;
      }
      if (mine.some(x => x.mode === a.mode && x.stop === a.stop)) {
        notes.push(
          `${file}: your ${a.mode} anchor at shade ${shade(a.stop)} of ${f.id} is replaced by your exact ${f.id} color`,
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
    // The keys always in one order, so a change and its undo write the
    // same bytes.
    /** @type {Record<string, unknown>} */
    const ordered = {};
    for (const k of FAMILY_INPUT_KEYS) if (k in out) ordered[k] = out[k];
    for (const k of Object.keys(out)) if (!(k in ordered)) ordered[k] = out[k];
    return {family: /** @type {typeof out} */ (ordered), stop};
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
  // The editor's colors stand in the order of their settings, wherever they
  // sit among a config's own families, so a step back writes the same file.
  const slots = families
    .map((f, i) => (PALETTE_DIALS.includes(f?.id) ? i : -1))
    .filter(i => i >= 0);
  const inOrder = fams
    .map(x => families.find(f => f?.id === x.id))
    .filter(Boolean);
  if (inOrder.length === slots.length)
    slots.forEach((i, k) => (families[i] = inOrder[k]));
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
    const t = tools(
      generate(config, file),
      data,
      base,
      ownSourceTokenValues(cwd, slug),
    );
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
            `${file}: your dark anchor at shade ${shade(anchor.stop)} of ${id} is replaced by your exact ${id} color`,
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
  keptDamaged.length = 0;
  // The config is read first, so a damaged one is kept aside before the
  // sync writes it again.
  const config = path.join(cwd, paletteFiles(slug).config);
  readConfig(config);
  keepDamaged(config);
  const notes = syncPaletteFiles(cwd, slug, data, base);
  return [...keptDamaged.splice(0), ...notes];
}

/**
 * @param {string} cwd
 * @param {string} slug
 * @param {any} data
 * @param {any} base
 * @returns {string[]}
 */
function syncPaletteFiles(cwd, slug, data, base) {
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
      ? sha256(fs.readFileSync(abs(f.config)))
      : null;
    // Or the config the editor recorded writing (a color change stopped
    // before its settings were saved).
    const recorded = readWrittenRecord(cwd, slug)['palette.config.json'];
    const mine =
      hash != null &&
      (data.palette === hash || saved === hash || recorded === hash);
    delete data.palette;
    if (!mine) return [];
    // A palette file edited by hand is never deleted: it stays, and the
    // result names it. Its config and receipt go, so the next color change
    // asks whether to keep or discard it.
    // The selected-stops file is generated from the palette on every
    // change, so it always goes.
    const editedPalette = paletteEdited(cwd, slug);
    /** @type {string[]} */
    const notes = [];
    for (const p of [f.config, f.receipt, f.refs])
      fs.rmSync(abs(p), {force: true});
    noteWritten(cwd, slug, 'palette.config.json', null);
    if (editedPalette)
      notes.push(
        `${f.palette} was edited by hand, so it stays: the theme no longer reads it. Move it out of tokens/ to keep it as your own, or delete it`,
      );
    else fs.rmSync(abs(f.palette), {force: true});
    const tokensDir = path.dirname(abs(f.palette));
    if (fs.existsSync(tokensDir) && !fs.readdirSync(tokensDir).length)
      fs.rmdirSync(tokensDir);
    return notes;
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
    data.palette = sha256(Buffer.from(text));
    // The theme reads only the selected shades, which come from the
    // generator, so a hand edit to the palette file never shows: say so.
    return paletteEdited(cwd, slug)
      ? [
          `${f.palette} was edited by hand, but the theme never reads it: it reads ${f.refs}, which the editor writes from the generator, so your edit does not show. The next color change asks whether to keep or discard it`,
        ]
      : [];
  }
  if (paletteEdited(cwd, slug)) {
    throw new AstryxError(
      `${f.palette} was edited by hand, so the editor will not write over it. The theme never read the edit: it reads ${f.refs}, which the editor writes from the generator. To keep your edits, move the file out of tokens/ (it is then yours: import it in ${slug}.theme.ts); to discard them, delete it. Then run the command again, and the editor writes the generated shades back. Only color changes wait for this; other changes still work. Nothing was changed.`,
      [
        {
          name: `${P} show ${slug}`,
          reason: `do this next: after you move ${f.palette} out of tokens/ (keeps your edits) or delete it (discards them), run your command again; show lists the theme as it is now`,
        },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  fs.mkdirSync(path.dirname(abs(f.config)), {recursive: true});
  // Recorded before it is written: a run stopped after this leaves a config
  // the next build knows is the editor's.
  noteWritten(cwd, slug, 'palette.config.json', sha256(Buffer.from(text)));
  writeWhole(abs(f.config), text);
  data.palette = sha256(Buffer.from(text));
  themePaletteGenerate(f.config, {out: f.palette, overwrite: true}, {cwd});
  return plan.notes;
}

/**
 * The record of the files the editor wrote into a theme folder,
 * `themes/<theme>/<theme>.pictures.json`: each by name, with the hash of
 * what was written (its pictures and its color config). The one reader and
 * writer of that record.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Record<string, string>}
 */
export function readWrittenRecord(cwd, slug) {
  try {
    const json = JSON.parse(
      fs.readFileSync(writtenRecordFile(cwd, slug), 'utf8'),
    );
    return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  } catch {
    return {};
  }
}

/** @param {string} cwd @param {string} slug */
const writtenRecordFile = (cwd, slug) =>
  path.join(cwd, 'themes', slug, `${slug}.pictures.json`);

/**
 * Write the record whole, or remove it when it names nothing. A record that
 * cannot be written leaves nothing removed later: the safe way round.
 * @param {string} cwd
 * @param {string} slug
 * @param {Record<string, string>} map
 */
export function writeWrittenRecord(cwd, slug, map) {
  const file = writtenRecordFile(cwd, slug);
  try {
    if (!Object.keys(map).length) fs.rmSync(file, {force: true});
    else {
      fs.mkdirSync(path.dirname(file), {recursive: true});
      writeWhole(file, `${JSON.stringify(map, null, 2)}\n`);
    }
  } catch {
    // Without the record, nothing it names is removed later.
  }
}

/**
 * Note a file the editor wrote into a theme folder, by name with the hash
 * of what it wrote, or forget it (null).
 * @param {string} cwd
 * @param {string} slug
 * @param {string} name
 * @param {string | null} hash
 */
export function noteWritten(cwd, slug, name, hash) {
  const map = readWrittenRecord(cwd, slug);
  if (hash) map[name] = hash;
  else if (name in map) delete map[name];
  else return;
  writeWrittenRecord(cwd, slug, map);
}

/**
 * The value of the object literal that starts at the first `{` from
 * `from`, read as data: string and numeric keys, string values, nested
 * objects; quotes, commas, comments and white space as any formatter writes
 * them. Null when it is not such a literal.
 * @param {string} text
 * @param {number} from
 * @returns {any}
 */
function objectLiteral(text, from) {
  const open = text.indexOf('{', from);
  if (open < 0) return null;
  /** @type {string[]} */
  const json = [];
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);
      if (i < 0) return null;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) return null;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = '';
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\') j++;
        v += text[j++];
      }
      json.push(JSON.stringify(v));
      i = j + 1;
      continue;
    }
    if (/[\s]/.test(c)) {
      i++;
      continue;
    }
    if (c === '{' || c === '[') depth++;
    if (c === '}' || c === ']') {
      // A trailing comma before a closing bracket.
      if (json.at(-1) === ',') json.pop();
      depth--;
    }
    if ('{}[]:,'.includes(c)) {
      json.push(c);
      i++;
      if (depth === 0) break;
      continue;
    }
    const word = /^[\w.$+-]+/.exec(text.slice(i))?.[0];
    if (!word) return null;
    json.push(JSON.stringify(word));
    i += word.length;
  }
  try {
    return JSON.parse(json.join(''));
  } catch {
    return null;
  }
}

/**
 * The colors a palette module holds, read as data so formatting never
 * counts: `palette` (family, mode, stop, color) and `black`/`white`. Null
 * when the file does not read as one.
 * @param {string} text
 * @returns {{palette: any, black: string | null, white: string | null} | null}
 */
function paletteData(text) {
  const t = text.replace(/^\uFEFF/, '');
  const at = /\bconst\s+palette\s*=/.exec(t);
  const palette = at ? objectLiteral(t, at.index) : null;
  if (!palette || typeof palette !== 'object') return null;
  /** @param {string} name */
  const end = name =>
    new RegExp(`\\bconst\\s+${name}\\s*=\\s*["'](#[0-9a-fA-F]{6})["']`)
      .exec(t)?.[1]
      ?.toLowerCase() ?? null;
  return {palette, black: end('black'), white: end('white')};
}

/**
 * Whether two palettes hold the same colors at the same stops.
 * @param {any} a @param {any} b
 */
function samePalette(a, b) {
  /** @param {any} p */
  const flat = p => {
    /** @type {string[]} */
    const out = [];
    for (const [fam, f] of Object.entries(p ?? {}))
      for (const m of /** @type {Mode[]} */ (['light', 'dark']))
        for (const [stop, color] of Object.entries(
          /** @type {any} */ (f)?.[m] ?? {},
        ))
          out.push(
            `${fam}.${m}.${Number(stop)}=${String(color).toLowerCase()}`,
          );
    return out.sort().join('|');
  };
  return flat(a) === flat(b);
}

/**
 * The first line of the empty palette module the preview writes for a
 * Colors page it keeps (changed by hand) once the theme has no colors, so
 * the app still builds. The editor replaces it freely.
 */
export const PALETTE_STAND_IN =
  '// A stand-in for a preview page that imports this file: the theme has no generated colors.';

/**
 * Whether a theme's palette file was edited by hand. Its bytes match its
 * receipt, or its colors (read as data, so formatting, a BOM or semicolons
 * never count) are the ones the generator gives for the request it came
 * from: the receipt's, else the config the editor wrote. Without a receipt
 * and with a config edited by hand since, the request is unknown; then the
 * file counts as the editor's when it holds every shade the theme ships
 * (the selected-stops file) unchanged. False when there is no palette file.
 * @param {string} cwd
 * @param {string} slug
 */
export function paletteEdited(cwd, slug) {
  const f = paletteFiles(slug);
  const file = path.join(cwd, f.palette);
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  // The empty stand-in a kept preview page imports is the editor's own.
  if (text.startsWith(PALETTE_STAND_IN)) return false;
  /** @type {any} */
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(path.join(cwd, f.receipt), 'utf8'));
  } catch {
    receipt = null;
  }
  if (receipt?.candidateSha256 === sha256(Buffer.from(text))) return false;
  const data = paletteData(text);
  if (!data) return true;
  /** @type {any} */
  let request = receipt?.request ?? null;
  let configMine = false;
  if (!request)
    try {
      const configText = fs.readFileSync(path.join(cwd, f.config), 'utf8');
      const saved = JSON.parse(
        fs.readFileSync(
          path.join(cwd, 'themes', slug, `${slug}.settings.json`),
          'utf8',
        ),
      )?.palette;
      configMine = saved == null || saved === sha256(Buffer.from(configText));
      request = JSON.parse(configText.replace(/^\uFEFF/, ''));
    } catch {
      request = null;
    }
  if (request && (receipt?.request || configMine))
    try {
      const candidate = generateTonalPalette(request);
      return !(
        samePalette(candidate.palette, data.palette) &&
        (data.black == null || data.black === candidate.black) &&
        (data.white == null || data.white === candidate.white)
      );
    } catch {
      return true;
    }
  return refsDiffer(cwd, slug, data.palette) !== false;
}

/**
 * Whether the selected-stops file holds a shade that differs from the
 * palette's: true when one differs, false when every one matches, null
 * when there is no such file to compare.
 * @param {string} cwd
 * @param {string} slug
 * @param {any} palette the palette file's colors
 * @returns {boolean | null}
 */
function refsDiffer(cwd, slug, palette) {
  const file = path.join(cwd, paletteFiles(slug).refs);
  if (!fs.existsSync(file)) return null;
  const refs = objectLiteral(fs.readFileSync(file, 'utf8'), 0);
  if (!refs || typeof refs !== 'object') return true;
  for (const [fam, f] of Object.entries(refs)) {
    if (typeof f !== 'object' || !f) continue;
    for (const [m, ramp] of Object.entries(/** @type {any} */ (f)))
      for (const [stop, color] of Object.entries(/** @type {any} */ (ramp))) {
        const mine = palette?.[fam]?.[m];
        const at = mine
          ? Object.entries(mine).find(([k]) => Number(k) === Number(stop))?.[1]
          : undefined;
        if (String(at ?? '').toLowerCase() !== String(color).toLowerCase())
          return true;
      }
  }
  return false;
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
      [{name: `${P} how colors`, reason: 'how the colors are made'}],
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

/** A stop as text: a layout may hold 16.666666666666668. @param {number} s */
const shade = s => String(round(s));

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
  const t = tools(candidate, data, base, ownSourceTokenValues(cwd, slug));
  const {stops, at, ref, exactOf, rawOf, settingOf, side, solid, surfaces} = t;
  // Both halves, for a one-mode theme too (see planPalette).
  const modes = modesForStrategy('light-and-dark');
  /** @type {PaletteMapping['tokens']} */
  const tokens = {};
  /** @type {ContrastCheck[]} */
  const checks = [];
  /** @type {PaletteMapping['exact']} */
  const exact = {};
  /** @type {Record<string, string>} */
  const unread = {};
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
        each(m => ref('neutral', m, at(pair[side(m)]))),
      );
    }
    for (const [token, pair] of Object.entries(NEUTRAL_TINTS))
      put(
        token,
        'neutral',
        each(m => {
          const [s, a] = pair[side(m)];
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
            at(NEUTRAL_STOPS[token][side(m)]),
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
      const v = rawOf(names.fill, m);
      if (v) exactFill[m] = v;
      else if (settingOf(names.fill, m) != null)
        unread[names.fill] = String(settingOf(names.fill, m)).trim();
    }
    if (Object.keys(exactFill).length)
      exact[names.fill] = Object.fromEntries(
        Object.entries(exactFill).map(([m, v]) => {
          // A var() is named with the color it reads, so the note says
          // which color the text was picked for.
          const written = String(
            settingOf(names.fill, /** @type {Mode} */ (m)) ?? '',
          ).trim();
          const rgb = parseColor(v);
          const color = rgb && alphaOf(v) >= 1 ? hex(rgb) : v;
          return [m, /var\(/i.test(written) ? `${written} = ${color}` : v];
        }),
      );

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
          note: `in dark, ${names.fill} is shade ${shade(found)}, not your exact color: ${plain.why}${found === start ? '' : `; shade ${shade(start)} does not pass either, so it is the nearest shade that does`}`,
        });
    }
    put(names.fill, f.id, fill);

    // Text on the fill reads on the fill the theme really uses: the exact
    // token setting when there is one. The exact color never moves; the
    // text changes instead.
    const on = each(m => {
      const used = exactFill[m] ?? /** @type {StopRef} */ (fill[m]).color;
      // A see-through exact fill is measured as it shows on the surface.
      const o = t.onFor(fillWord, m, solid(used, m, f.id));
      const what = exactFill[m]
        ? `your exact ${names.fill} (${used}${alphaOf(used) < 1 ? `, as it shows: ${solid(used, m, f.id)}` : ''})`
        : `${names.fill} (shade ${shade(Number(fill[m]?.stop))})`;
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
      const p = t.page(solid(used, 'light', f.id), 'light', f.id);
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

    // The tint: the official stop, never the fill's own shade, see-through
    // or not. Secondary text on the parts that sit on the accent tint is
    // lifted instead, as the official neutral theme lifts it (`lift`).
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
    /** The tint the theme really shows: an exact setting wins. @param {Mode} m */
    const mutedSeen = m => {
      const own = rawOf(names.muted, m);
      return own
        ? surfaces(m, f.id).map(
            ([n, bg]) =>
              /** @type {[string, string]} */ ([
                `your exact ${names.muted} over ${n}`,
                hex(
                  compositeOver(
                    /** @type {[number, number, number]} */ (parseColor(own)),
                    alphaOf(own),
                    /** @type {[number, number, number]} */ (parseColor(bg)),
                  ),
                ),
              ]),
          )
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
        at(TEXT_STOP[side(m)]),
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
          pick(onMuted, f.id, m, at(ON_MUTED[side(m)]), mutedSeen(m), TEXT),
        ),
      );
    }
    if (names.border)
      put(
        names.border,
        f.id,
        each(m => ref(f.id, m, at(BORDER[side(m)]))),
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

  // Secondary text on the parts the official neutral theme lifts it on
  // (LIFT_PARTS), lifted the same way, for every accent: for each
  // background (the accent tint, the neutral track), the gray shade
  // nearest the secondary text's own that reads at 4.5:1 on it and on it
  // under a hover, over every surface. The grays are the neutral color's,
  // else a gray ramp the generator grows from the base theme's own
  // secondary text (written as colors, not shades of the palette). The
  // tint stays at its official stop. A mode where the theme sets
  // secondary text exactly takes that value instead, as written.
  /** @type {Record<string, Partial<Record<Mode, StopRef>>> | null} */
  let lift = null;
  {
    /** @param {Mode} m @param {string} token */
    const valueOf = (m, token) => {
      const v =
        rawOf(token, m) ?? tokens[token]?.[m].color ?? base?.[m]?.[token];
      return v && parseColor(v) ? v : null;
    };
    /** The secondary text a mode starts from. @param {Mode} m */
    const startText = m => {
      const v =
        tokens['--color-text-secondary']?.[m].color ??
        base?.[m]?.['--color-text-secondary'];
      return v && parseColor(v)
        ? hex(/** @type {number[]} */ (parseColor(v)))
        : null;
    };
    /**
     * The gray ramp of a mode, and whether its shades are the palette's
     * neutral ones (else plain colors).
     * @param {Mode} m
     * @returns {{ramp: Record<string, string>, palette: boolean} | null}
     */
    const grays = m => {
      if (neutral)
        return {
          ramp: /** @type {any} */ (candidate.palette.neutral)[m],
          palette: true,
        };
      const seed = startText(m);
      if (!seed) return null;
      try {
        const g = generateTonalPalette({
          modeStrategy: m === 'light' ? 'light-only' : 'dark-only',
          neutralProfile: 'custom',
          families: [{id: 'gray', seed, kind: 'neutral'}],
        });
        return {ramp: /** @type {any} */ (g.palette.gray)[m], palette: false};
      } catch {
        return null;
      }
    };
    /**
     * A color drawn over each of `under`, as the eye sees it.
     * @param {string} name @param {string} color @param {Array<[string, string]>} under
     * @returns {Array<[string, string]>}
     */
    const drawn = (name, color, under) => {
      const top = /** @type {[number, number, number]} */ (parseColor(color));
      const a = alphaOf(color);
      return under.map(([n, c]) => [
        `${name} over ${n}`,
        hex(
          compositeOver(
            top,
            a,
            /** @type {[number, number, number]} */ (parseColor(c)),
          ),
        ),
      ]);
    };
    /** @type {Record<string, Partial<Record<Mode, StopRef>>>} */
    const found = {};
    for (const ground of new Set(LIFT_PARTS.map(([, , g]) => g))) {
      const {what, parts} = LIFT_GROUNDS[ground];
      /**
       * The shade the base theme itself lifts this ground's text to in a
       * mode, when it gives one: the search starts there, so a change of
       * color moves it only when that shade no longer reads.
       * @param {Mode} m
       * @returns {string | null}
       */
      const baseLift = m => {
        for (const [part, block, g] of LIFT_PARTS) {
          if (g !== ground) continue;
          const v = /** @type {any} */ (base)?.components?.[part]?.[block]?.[
            '--color-text-secondary'
          ];
          const pair = Array.isArray(v)
            ? v
            : typeof v === 'string'
              ? /^light-dark\((.*)\)$/s.exec(v.trim())?.[1]
                ? splitTop(
                    /** @type {string} */ (
                      /^light-dark\((.*)\)$/s.exec(v.trim())?.[1]
                    ),
                    ',',
                  )
                : [v, v]
              : null;
          const c = pair?.[m === 'light' ? 0 : 1]?.trim();
          if (c && parseColor(c))
            return hex(/** @type {number[]} */ (parseColor(c)));
        }
        return null;
      };
      /** @type {Partial<Record<Mode, StopRef>>} */
      const byMode = {};
      for (const m of modes) {
        const own = rawOf('--color-text-secondary', m);
        if (own) {
          byMode[m] = {stop: 0, color: own, family: 'literal'};
          continue;
        }
        const fillColor = valueOf(m, ground);
        const g = grays(m);
        const text = startText(m);
        if (!fillColor || !g || !text) break;
        const seen = drawn(what, fillColor, surfaces(m, 'neutral'));
        const hover = valueOf(m, '--color-overlay-hover');
        const on = [
          ...seen,
          ...(hover && alphaOf(hover) > 0
            ? drawn('a hover', hover, seen).map(
                ([n, c]) =>
                  /** @type {[string, string]} */ ([
                    n.replace(/^a hover over (.*)$/, '$1 under a hover'),
                    c,
                  ]),
              )
            : []),
        ];
        const keys = Object.keys(g.ramp)
          .map(Number)
          .sort((a, b) => a - b);
        const from = baseLift(m) ?? text;
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
        const moved =
          hex(/** @type {number[]} */ (parseColor(g.ramp[b.stop]))) !== from;
        if (b.r < TEXT || moved)
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
      if (modes.every(m => byMode[m])) found[ground] = byMode;
    }
    if (Object.keys(found).length) lift = found;
  }

  return {
    candidate,
    families: fams,
    tokens,
    contrast: checks.filter(c => c.note !== ''),
    lift,
    vibrancy: config.vibrancy ?? VIBRANCY_DEFAULT,
    exact,
    unread,
    notes: [
      ...plan.notes,
      ...(paletteEdited(cwd, slug)
        ? [
            `${paletteFiles(slug).palette} was edited by hand, but the theme never reads it: it reads ${paletteFiles(slug).refs}, which the editor writes from the generator, so the edit does not show. The next color change asks whether to keep or discard it`,
          ]
        : []),
    ],
  };
}

/**
 * The color dial whose generated colors a token belongs to, or null: an
 * exact setting of it changes what that dial's mapping picks around it.
 * @param {string} token
 * @returns {string | null}
 */
export function paletteDialOf(token) {
  if (!PALETTE_TOKENS.has(token)) return null;
  if (/accent|^--focus-outline-color$/.test(token)) return 'accent';
  for (const [dial, word] of Object.entries(STATUS_TOKEN))
    if (new RegExp(`-${word}(-muted)?$`).test(token)) return dial;
  return 'neutral';
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
      ...Object.values(LIFT_GROUNDS).map(
        g =>
          `--color-text-secondary on ${g.parts}: the shade nearest the secondary text's that reads at ${TEXT}:1 on ${g.what} and under a hover, as the official theme lifts it`,
      ),
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
      : `--color-accent-muted: light shade ${ACCENT_MUTED[0]}, dark shade ${ACCENT_MUTED[1]}, as the official neutral theme maps it, never the fill's own shade; secondary text on the parts that sit on it (selected items and rows, a dropzone, numbered citations) is lifted instead, to the gray nearest it that reads at ${TEXT}:1 on the tint and under a hover: the neutral color's shades, else grays grown from the base theme's own secondary text`,
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
  }
  const unread = pal.unread?.[token];
  if (unread) {
    notes.push(
      `${token} keeps your exact setting (${unread}), which the editor cannot read as one color${exact ? ' in every mode' : ''}: an exact setting wins, so the generated ${dial} shade does not show${dial === 'neutral' ? '' : ' there, and the text on it is not checked against your color: set a fixed color, or set the text color on it exactly'}`,
    );
  } else if (!exact && main) {
    /** @param {Mode} m */
    const part = m =>
      main[m].exact
        ? m === 'dark' && modes.length > 1
          ? 'the same exact color in dark'
          : `your exact color (${main[m].color}, ${dial} shade ${shade(main[m].stop)}) in ${m}`
        : `${dial} shade ${shade(main[m].stop)} (${main[m].color}) in ${m}`;
    notes.push(`${token} uses ${modes.map(part).join(' and ')}`);
  }
  const given = pal.families.find(x => x.dial === dial);
  if (given && isClipped(given.value))
    notes.push(
      `your ${dial} ${given.value} is outside the colors every screen shows (sRGB), so the nearest one, ${given.seed}, is used`,
    );
  for (const c of pal.contrast) {
    if (pal.tokens[c.token]?.family !== dial && !c.dials?.includes(dial))
      continue;
    // A theme with one mode never shows the other one's shades.
    if (!modes.includes(c.mode)) continue;
    if (c.note) notes.push(c.note);
    else if (!c.pass)
      notes.push(
        `${c.token} reads at only ${c.ratio}:1 in ${c.mode} on ${c.against} (needs ${c.needs}:1) even at shade ${shade(c.stop)}, the most contrasting one: pick a lighter or darker ${dial}, or set ${c.token} exactly`,
      );
    else if (c.stop !== c.preferred)
      notes.push(
        `${c.token} uses shade ${shade(c.stop)} in ${c.mode}, not ${shade(c.preferred)}, so it reads at ${c.ratio}:1 on ${c.against}`,
      );
  }
  notes.push(
    `the generated colors are in ${f.palette}, made from ${f.config} (receipt: ${f.receipt}); the theme imports only the shades it uses, from ${f.refs}`,
  );
  return notes;
}
