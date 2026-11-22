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
import {
  irregularFileKind,
  readRegularFile,
} from '../../foundation/fs/regular-file.mjs';
import {isAlive} from '../../foundation/release/cache.mjs';
import {stillHolds} from '../../foundation/release/folder-lock.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  ANCHOR_INPUT_KEYS,
  DEFAULT_21_STOPS,
  FAMILY_INPUT_KEYS,
  GENERATION_INPUT_KEYS,
  PALETTE_BLACK,
  PALETTE_GENERATOR_VERSION,
  PALETTE_RECIPE,
  PALETTE_RECIPE_V2,
  PALETTE_RECIPES,
  PALETTE_WHITE,
  generateTonalPalette,
  modesForStrategy,
} from '../theme/palette/generate/generator.mjs';
import {themePaletteGenerate} from '../theme/palette/generate/generate.mjs';
import {
  ACCENT_MUTED,
  BORDER,
  DARK_FILL,
  LIFT_GROUNDS,
  LIFT_PARTS,
  NEUTRAL_INSIDE,
  NEUTRAL_STOPS,
  NEUTRAL_TINTS,
  NON_TEXT,
  ON_MUTED,
  PALETTE_DIALS,
  STATUS_MUTED,
  STATUS_TOKEN,
  TEXT,
  TEXT_STOP,
  VIBRANCY_DEFAULT,
  anchorDarkFills,
  dialFamily,
  fillAt,
  grownGrays,
  isGray,
  isLookToken,
  mapPalette,
  nearestShade,
  paletteToken,
  sameColor,
  shade,
} from '../theme/palette/generate/mapping.mjs';
import * as editorLook from '../theme/palette/generate/editor-look.mjs';
import {
  cvdClashes,
  isLookFamily,
} from '../theme/palette/generate/derive-look.mjs';
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
import {alphaOf, hex, isClipped, parseColor} from './_color.mjs';
import {
  contrastRatio,
  hexToOklch,
  oklchClampedHex,
} from '../theme/palette/generate/color.mjs';
import {splitTop} from './_css.mjs';
import {isColorToken} from './_compiler.mjs';
import {P} from './_tables.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {sha256} from '../../foundation/render/source-block.mjs';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {
  newerRecipe,
  newerRecipeRefusal,
} from '../theme/palette/generate/newer-recipe.mjs';

export {readRegularFile};

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
  // A pipe, a device or a socket there is not the editor's: the rename
  // below would replace it, so it is refused and left as it is.
  const kind = irregularFileKind(file);
  if (kind && kind !== 'a folder')
    throw new AstryxError(
      `${[path.dirname(path.dirname(file)), path.dirname(file), file].map(p => path.basename(p)).join('/')} is ${kind}, not a file, so the editor writes nothing over it. Move it, then run the command again.`,
      [],
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  // The same bytes already there are not written again: a refused command
  // that puts back what it built leaves the file as it was, time included.
  if (sameBytes(file, text)) return;
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
 * Whether a regular file (never a link) at `file` holds exactly `text`.
 * @param {string} file
 * @param {string | Buffer} text
 */
function sameBytes(file, text) {
  const st = fs.lstatSync(file, {throwIfNoEntry: false});
  if (!st?.isFile()) return false;
  const want = Buffer.isBuffer(text) ? text : Buffer.from(text);
  if (st.size !== want.length) return false;
  try {
    return readRegularFile(file).equals(want);
  } catch {
    return false;
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
    // A picture taken under its own name (`.<picture>.part-<pid>.png`) by a
    // run stopped while the browser ran.
    const m =
      /^\..+\.astryx-(\d+)-[a-z0-9]+\.tmp$/.exec(n) ??
      /^\.[\w-]+\.part-(\d+)\.png$/.exec(n);
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
 * Whether a file name is one of the editor's own temp files: a whole-file
 * write's `.<name>.astryx-<pid>-<random>.tmp`, a build's `.<name>.tmp-<id>`,
 * or a picture's `.<picture>.part-<pid>.png`. A command stopped part way can
 * leave one behind.
 * @param {string} name
 */
export const isEditorTemp = name =>
  /^\..+\.(astryx-\d+-[a-z0-9]+\.tmp|tmp-[\w-]+)$/.test(name) ||
  /^\.[\w-]+\.part-\d+\.png$/.test(name);

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
 * @property {boolean} [base] - The half is the base theme's own value in that mode (family `literal`): the generated module reads it from the base, so the mode follows the base theme.
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
 * @property {{thing: string, value: string, mode?: Mode}} [fix] - The nearest setting that passes it, when one does: a darker exact color for a pale fill.
 */

/**
 * A color dial's family: its seed, and the source token that gives it when
 * the theme's own source sets the family's fill (null when the setting does).
 * An accent set as a token carries the one mode it is for.
 * @typedef {{id: string, dial: string, seed: string, value: string, source: string | null, only?: 'light' | 'dark'}} DialFamily
 */

/**
 * The palette mapping of a theme.
 * @typedef {object} PaletteMapping
 * @property {Candidate} candidate
 * @property {DialFamily[]} families
 * @property {Record<string, {family: string, light: StopRef, dark: StopRef}>} tokens
 * @property {ContrastCheck[]} contrast
 * @property {boolean} [stored] - Whether the palette is kept as saved (made with a recipe this CLI does not know): its colors cannot change here.
 * @property {number} vibrancy - The generator's vibrancy, 0 to 100.
 * @property {Record<string, Partial<Record<Mode, string>>>} exact - Main tokens the theme sets exactly, the value per mode: the dial's fill gives way to them.
 * @property {Record<string, string>} [unread] - Main tokens the theme sets exactly to a value the editor cannot read as one color in some mode, as written: the text on them is not picked for that value.
 * @property {string[]} notes - What the config writer kept or replaced of a hand edit.
 * @property {{badges: 'derived' | 'none', chart: 'derived' | 'none', limits: string[], moved: string[], alike: boolean, unread: boolean}} [categories] - Whether the category colors (Badge, Token, Card tints) and the chart colors follow the look, and what they gave up to stay written.
 * @property {Array<{a: string, b: string, vision: 'red-weak' | 'green-weak', mode: Mode, colors: [string, string], page?: string, pages?: string[]}>} [cvd] - Status fills someone red-weak or green-weak may not tell apart.
 * @property {string[]} [code] - The code colors that keep the base theme's because none of their family's stops reads on the code background and the page.
 * @property {Array<{token: string, mode: Mode, pair: import('../theme/palette/generate/mapping.mjs').BasePair, ratio: number}>} [kept] - The look's colors kept at the base theme's in a mode, because a text/fill pair the base theme draws with them would not read.
 * @property {{roles: Record<string, 'derived'>, why: string[], short: string[]}} [statuses] - The status roles the theme leaves unset, each derived from the look, and what they gave up to stay written.
 * @property {Record<string, Partial<Record<Mode, StopRef>>> | null} lift - Lifted secondary text per background token of LIFT_PARTS (the accent tint, the neutral track), per mode, from the neutral color; null without one.
 */

// The color dials, the vibrancy default, each dial's main token, the lifted
// parts and the nearest shade of a ramp: the palette mapping's, which other
// editor modules read through this one.
export {
  LIFT_PARTS,
  PALETTE_DIALS,
  VIBRANCY_DEFAULT,
  nearestShade,
  paletteToken,
};

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

/** A layout needs this many stops between black and white to map every token. */
const MIN_INNER_STOPS = 5;
/** The widest gap between two stops that still maps every token near its stop. */
const MAX_STOP_GAP = 25;

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

/** Whether a seed (or no seed) has no color to saturate. @param {string | null} seed */
export const isGraySeed = seed => !seed || isGray(seed);

/**
 * Whether a color dial's seed comes out different at two vibrancies: the
 * ramp the generator grows from it, light and dark, compared shade by
 * shade. A seed with no saturation to change (a pure gray) gives the same
 * ramp at every vibrancy. A gray-ish seed is grown as the editor grows it
 * (a neutral), so a warm or cool gray counts by what it shows.
 * @param {string} dial
 * @param {string | null} seed
 * @param {number} from
 * @param {number} to
 */
export function vibrancyMoves(dial, seed, from, to) {
  if (!seed || from === to) return false;
  const kind = dial === 'neutral' || isGray(seed) ? 'neutral' : 'chromatic';
  const ramp = (/** @type {number} */ vibrancy) =>
    JSON.stringify(
      /** @type {any} */ (
        generate({
          vibrancy,
          ...(kind === 'neutral' ? {neutralProfile: 'custom'} : {}),
          families: [{id: 'seed', seed, kind}],
        }).palette.seed
      ),
    );
  return ramp(from) !== ramp(to);
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
 * The light-mode color of a token value the theme's own source writes: a
 * plain color, or the first half of a light-dark() pair.
 * @param {string | undefined} value
 */
function lightHalf(value) {
  const v = String(value ?? '').trim();
  const pair = /^light-dark\((.*)\)$/is.exec(v);
  return pair ? (splitTop(pair[1], ',')[0] ?? '').trim() : v;
}

/**
 * The color dial settings of a theme, in dial order. A family whose fill
 * token the theme's own source sets exactly takes that color, the one in
 * effect, as its seed: the shades its text, icons and tints read come from
 * the color the fill shows, never from a dial value the source overrides.
 * The neutral family always takes its setting.
 * @param {{settings: Setting[]}} data
 * @param {Record<string, string>} [own] the tokens the theme's own source sets
 */
function dialFamilies(data, own = {}) {
  /** @type {DialFamily[]} */
  const out = [];
  for (const dial of PALETTE_DIALS) {
    const s = [...data.settings]
      .reverse()
      .find(x => x?.source === 'dial' && x.thing === dial && !x.on && !x.mode);
    // The neutral family keeps its setting: a gray the source sets exactly
    // is one surface, not the color every gray grows from.
    const inEffect =
      dial === 'neutral' ? null : seedOf(lightHalf(own[paletteToken(dial)]));
    const seed = inEffect ?? (s && seedOf(s.value));
    if (s && seed)
      out.push({
        id: dial,
        dial,
        seed,
        value: s.value,
        source: inEffect ? paletteToken(dial) : null,
      });
  }
  // A whole-theme --color-accent set as a token is the accent too: the
  // accent's shades (links, selected rows, tints) grow from it as from the
  // dial, and the token itself keeps the exact value it was given.
  if (!out.some(f => f.id === 'accent')) {
    const raws = data.settings.filter(
      x =>
        x?.source === 'token' &&
        x.thing === '--color-accent' &&
        !x.on &&
        !x.when &&
        !x.state,
    );
    const last = (/** @type {(m: unknown) => boolean} */ ok) =>
      [...raws].reverse().find(x => ok(x.mode));
    const light = last(m => !m || m === 'light') ?? last(m => m === 'dark');
    const seed = light && seedOf(light.value);
    // Set for one mode only, it moves that mode only.
    const modes = new Set(raws.map(x => x.mode ?? 'both'));
    const only =
      modes.size === 1 && (modes.has('light') || modes.has('dark'))
        ? /** @type {'light' | 'dark'} */ ([...modes][0])
        : null;
    if (light && seed)
      out.unshift({
        id: 'accent',
        dial: 'accent',
        seed,
        value: light.value,
        source: null,
        ...(only ? {only} : {}),
      });
  }
  return out;
}

/**
 * The seed each color family grows from now: the fill the theme's own source
 * sets as a fixed color, else the color setting.
 * @param {string} cwd
 * @param {string} slug
 * @param {{settings: Setting[]}} data
 */
export function seedsInEffect(cwd, slug, data) {
  return seedsOfSettings(data, ownSourceTokenValues(cwd, slug));
}

/**
 * The seeds of a theme's color settings, its own source's values read:
 * what seedsInEffect returns, for a caller that holds those values.
 * @param {{settings: Setting[]}} data
 * @param {Record<string, string>} own the theme source's own token values
 */
export function seedsOfSettings(data, own) {
  // (A color setting's families only: an accent set as a token keeps its
  // exact value, so it is not a seed a dial such as vibrancy moves.)
  return dialFamilies(data, own).filter(f =>
    data.settings.some(x => x?.source === 'dial' && x.thing === f.dial),
  );
}

/**
 * Whether `set <theme> vibrancy` changes anything: a color setting's seed
 * that vibrancy moves, the check set runs.
 * @param {{settings: Setting[]}} data
 * @param {Record<string, string>} own the theme source's own token values
 */
export function vibrancyTakes(data, own) {
  return vibrancyMovesAny(seedsOfSettings(data, own));
}

/**
 * Whether vibrancy changes any of these seeds: the one test `set <theme>
 * vibrancy`, `how` and the color notes share.
 * @param {DialFamily[]} seeds
 */
export function vibrancyMovesAny(seeds) {
  return seeds.some(f => vibrancyMoves(f.dial, f.seed, 0, 100));
}

/**
 * The token words of the status roles a theme's look derives: every role
 * it leaves unset, once it sets a color.
 * @param {{settings: Setting[]}} data
 * @returns {string[]}
 */
export function derivedStatusWords(data) {
  const fams = dialFamilies(data);
  if (!fams.length) return [];
  return Object.keys(STATUS_TOKEN)
    .filter(d => !fams.some(f => f.id === d))
    .map(d => STATUS_TOKEN[d]);
}

/**
 * The tokens a theme sets to a value of its own for the whole theme: the
 * change names each, apart from the colors that move with the look.
 * @param {{settings: Setting[]}} data
 * @returns {string[]}
 */
export function exactTokens(data) {
  return data.settings
    .filter(x => x?.source === 'token' && !x.on && !x.when && !x.state)
    .map(x => x.thing);
}

export {isLookToken, STATUS_TOKEN};

/** A code color or the overlay scrim. @param {string} token */
const isCodeToken = token => /^--color-(?:syntax-[a-z]+|overlay)$/.test(token);

/**
 * A change's token lines with the look's own (category and chart colors)
 * said in one line each, as counts: they move together with every look
 * change, and one line per value would bury the rest.
 * @param {unknown[]} lines - `token (mode): before -> after` lines.
 * @param {string[]} [statusWords] - The status words whose colors the look derives (derivedStatusWords): theirs are counted too.
 * @param {string[]} [exact] - Tokens the theme sets to a value of its own (exactTokens): each is named, never counted, as it did not move with the look.
 */
export function lookCollapsed(lines, statusWords = [], exact = []) {
  const tokenOf = (/** @type {unknown} */ c) => String(c).split(/[\s:]/)[0];
  const status = new RegExp(
    `^--color-(?:(?:on|text|icon|border)-)?(?:${statusWords.join('|') || '(?!)'})(?:-muted)?$`,
  );
  const folded = (/** @type {unknown} */ c) =>
    status.test(tokenOf(c)) && !exact.includes(tokenOf(c));
  const statusLines = lines.filter(folded);
  const rest = lines.filter(c => !folded(c));
  lines = rest;
  // (A look token the theme sets to a value of its own is named, never
  // counted: it did not move with the look.)
  const counted = (/** @type {unknown} */ c) =>
    isLookToken(tokenOf(c)) && !exact.includes(tokenOf(c));
  const look = lines.filter(counted).map(String);
  const code = look.filter(c => isCodeToken(tokenOf(c))).length;
  const badges = look.filter(
    c => !tokenOf(c).startsWith('--color-data-') && !isCodeToken(tokenOf(c)),
  );
  const chart = look.length - badges.length - code;
  return {
    lines: [
      ...lines.filter(c => !counted(c)).map(String),
      ...(badges.length
        ? [
            `category colors (badges, tokens and card tints): ${badges.length} values moved with the look`,
          ]
        : []),
      ...(chart ? [`chart colors: ${chart} values moved with the look`] : []),
      ...(code
        ? [`code colors and the overlay: ${code} values moved with the look`]
        : []),
      ...(statusLines.length
        ? [
            `status colors (${statusWords.join(', ')}): ${statusLines.length} values moved with the look`,
          ]
        : []),
    ],
    look: [...look, ...statusLines.map(String)],
  };
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
 * A theme's settings file as it is on disk, or null when it does not read.
 * @param {string} cwd
 * @param {string} slug
 * @returns {any}
 */
function savedTheme(cwd, slug) {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(cwd, 'themes', slug, `${slug}.settings.json`),
        'utf8',
      ),
    );
  } catch {
    return null;
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
  const data = savedTheme(cwd, slug);
  return {
    settings: Array.isArray(data?.settings) ? data.settings : [],
    mode: typeof data?.mode === 'string' ? data.mode : null,
  };
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
 * What the palette mapping reads of a theme: its base colors, the tokens it
 * has, its exact token settings (a page-wide token its own source sets wins,
 * as the build shows it), the fixed color a value gives in a mode, and the
 * command that sets a value, and the modes the theme shows.
 * @param {string} cwd
 * @param {string} slug
 * @param {{mode?: string, settings: Setting[]}} data
 * @param {{light: Record<string, string>, dark: Record<string, string>} | undefined} base
 * @param {Record<string, unknown>} [tokenDefaults]
 * @returns {import('../theme/palette/generate/mapping.mjs').PaletteMappingContext}
 */
function paletteContext(cwd, slug, data, base, tokenDefaults = {}) {
  const own = ownSourceTokenValues(cwd, slug);
  /** @param {string} token @param {Mode} m @returns {string | undefined} */
  const settingOf = (token, m) =>
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
    const set = settingOf(t, m);
    const read =
      set != null ? colorIn(set, m, seen) : colorIn(base?.[m]?.[t], m, seen);
    return read ?? (rest.length ? colorIn(rest.join(','), m, seen) : null);
  };
  return {
    base,
    has: token => token in tokenDefaults,
    // The editor's own rules (Core's context.editor), which only the
    // editor loads.
    editor: editorLook,
    shown: modesOf(data),
    defaults: tokenDefaults,
    reader: {
      rgb: value =>
        /** @type {[number, number, number] | null} */ (parseColor(value)),
      alpha: value => alphaOf(value),
    },
    settingOf,
    colorIn: (value, m) => colorIn(value, m),
    setExactly: token =>
      data.settings.some(
        s =>
          s.source === 'token' &&
          s.thing === token &&
          !s.on &&
          !s.when &&
          !s.state,
      ),
    setLine: (thing, value, mode) =>
      `${P} set ${slug} ${thing} ${quoteCommandArgument(value)}${mode ? ` --mode ${mode}` : ''}`,
  };
}

/**
 * What the config writer decided: the config, what it kept or replaced of
 * a hand edit, and for each accent or status color the stop of its exact
 * color and whether dark mode holds it too (why not, when not).
 * @typedef {object} PalettePlan
 * @property {any} config
 * @property {string[]} notes
 * @property {Record<string, {stop: number, dark: boolean, why: string, ratio: number}>} fills
 * @property {boolean} [stored] the saved palette, kept as it is (a recipe this CLI does not know)
 */

/**
 * Whether a theme's palette names a recipe this CLI does not know (its
 * colors are kept as saved, made by a newer CLI).
 * @param {string} cwd
 * @param {string} slug
 */
export function paletteRecipeUnknown(cwd, slug) {
  const config = readConfig(path.join(cwd, paletteFiles(slug).config));
  return newerRecipe(config?.recipe) != null;
}

/**
 * The colors of a palette kept as saved (made with a recipe a newer CLI
 * knows), as its module holds them; null for any other palette.
 * @param {string} cwd
 * @param {string} slug
 * @returns {{palette: any, black: string, white: string} | null}
 */
export function keptPaletteColors(cwd, slug) {
  const config = readConfig(path.join(cwd, paletteFiles(slug).config));
  if (newerRecipe(config?.recipe) == null) return null;
  const stored = storedCandidate(cwd, slug, config);
  return stored
    ? {palette: stored.palette, black: stored.black, white: stored.white}
    : null;
}

/**
 * What a palette kept as saved is, in words: whose colors use which recipe,
 * that this CLI does not make it, and what still works. No update step: a
 * CLI that makes the recipe may not be released yet.
 * @param {string} slug
 * @param {unknown} recipe
 */
const keptPaletteWords = (slug, recipe) =>
  `${slug}'s colors use the ${String(recipe)} recipe, which this Astryx CLI (${cliVersion()}) does not make; its palette is kept as saved. Changes to what the palette is made from (the accent, neutral and status colors, the vibrancy) need a CLI that makes that recipe; other changes, including exact color tokens, a part's colors, the mode and the base, save as usual.`;

/**
 * The refusal of a color change to a palette kept as saved (a recipe a
 * newer CLI names): what it is, and nothing to run.
 * @param {string} slug
 * @param {unknown} recipe
 */
function unknownRecipe(slug, recipe) {
  return new AstryxError(
    `${keptPaletteWords(slug, recipe)} Nothing was changed.`,
    [],
    ERROR_CODES.ERR_PALETTE_GENERATION,
  );
}

/**
 * Each theme's colors as saved (its {@link paletteMadeFromKey}), as the
 * settings reader read the file: a change is compared with this.
 * @type {Map<string, string | null>}
 */
const SAVED_COLORS = new Map();

/**
 * Each theme's settings as the settings reader read the file, before any
 * change: what a hand edit is checked against.
 * @type {Map<string, any>}
 */
const LOADED_SETTINGS = new Map();

/**
 * Note what a theme's colors come from as saved, read as the settings
 * reader reads the file (its base word, its field and entry names).
 * @param {string} cwd
 * @param {string} slug
 * @param {any} data the settings as read, before any change
 */
export function noteSavedColors(cwd, slug, data) {
  SAVED_COLORS.set(path.join(cwd, 'themes', slug), paletteMadeFromKey(data));
  LOADED_SETTINGS.set(path.join(cwd, 'themes', slug), data);
}

/**
 * A theme's settings as read before any change (the ones its settings
 * module was built from), else as the file holds them now.
 * @param {string} cwd
 * @param {string} slug
 * @returns {any}
 */
export function settingsBeforeChange(cwd, slug) {
  const dir = path.join(cwd, 'themes', slug);
  return LOADED_SETTINGS.has(dir)
    ? LOADED_SETTINGS.get(dir)
    : savedTheme(cwd, slug);
}

/**
 * What a palette is made from, as one key to compare: the color dials and
 * vibrancy, and a whole-theme accent token, as {@link dialFamilies} reads
 * them. A change to these makes the palette again; the mode, the base and
 * any other color token only map it.
 * @param {{settings?: Setting[]} | null} d
 */
export function paletteMadeFromKey(d) {
  // (Beside an accent dial, a whole-theme accent token is an exact value
  // the palette never reads, as dialFamilies reads it.)
  const accentDial = (d?.settings ?? []).some(
    x => x?.source === 'dial' && x.thing === 'accent' && !x.on && !x.mode,
  );
  return d
    ? JSON.stringify(
        (d.settings ?? [])
          .filter(
            x =>
              (x?.source === 'dial' &&
                !x.on &&
                (PALETTE_DIALS.includes(x.thing) || x.thing === 'vibrancy')) ||
              (!accentDial &&
                x?.source === 'token' &&
                x.thing === '--color-accent' &&
                !x.on &&
                !x.when &&
                !x.state),
          )
          .map(x =>
            [x.source, x.thing, x.value, x.mode]
              .map(v => String(v ?? '').toLowerCase())
              .join('|'),
          ),
      )
    : null;
}

/**
 * What a theme's colors come from, as one key to compare: its mode, its
 * base, its color dials (and vibrancy) and its color tokens. A change that
 * leaves this as it was leaves the palette's colors alone.
 * @param {{mode?: string | null, like?: string | null, settings?: Setting[]} | null} d
 */
export function paletteColorKey(d) {
  return d
    ? JSON.stringify({
        mode: d.mode ?? 'both',
        like: d.like ?? null,
        // (Each by what it says.)
        colors: (d.settings ?? [])
          .filter(
            x =>
              (x?.source === 'dial' &&
                (PALETTE_DIALS.includes(x.thing) || x.thing === 'vibrancy')) ||
              (x?.source === 'token' && isColorToken(x.thing)),
          )
          .map(x =>
            [x.source, x.thing, x.value, x.on, x.when, x.state, x.mode]
              .map(v => String(v ?? '').toLowerCase())
              .join('|'),
          ),
      })
    : null;
}

/**
 * The palette as its files hold it, read as the generator's candidate
 * (its stops, families and ends), for a palette this CLI cannot make
 * again; null when the palette file is missing or does not read.
 * @param {string} cwd
 * @param {string} slug
 * @param {any} config
 */
function storedCandidate(cwd, slug, config) {
  const f = paletteFiles(slug);
  let data;
  try {
    data = paletteData(fs.readFileSync(path.join(cwd, f.palette), 'utf8'));
  } catch {
    return null;
  }
  if (!data) return null;
  const first = /** @type {any} */ (Object.values(data.palette)[0]);
  const stops = (
    Array.isArray(config?.stops)
      ? config.stops
      : Object.keys(first?.light ?? first?.dark ?? {})
  )
    .map(Number)
    .sort((/** @type {number} */ a, /** @type {number} */ b) => a - b);
  return {
    schemaVersion: 1,
    status: 'candidate',
    recipe: config?.recipe,
    black: data.black ?? PALETTE_BLACK,
    white: data.white ?? PALETTE_WHITE,
    stops,
    palette: data.palette,
  };
}

/**
 * Whether a theme's palette is kept exactly as saved, as one made with a
 * recipe this CLI does not know is ({@link planPalette}): its build keeps
 * what that palette made.
 * @param {string} cwd
 * @param {string} slug
 * @param {{mode?: string, settings: Setting[]}} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} [base]
 */
export function paletteKeptAsSaved(cwd, slug, data, base) {
  try {
    return Boolean(planPalette(cwd, slug, data, base)?.stored);
  } catch {
    return false;
  }
}

/**
 * The candidate a plan's palette is: the saved one for a palette this CLI
 * cannot make again, else the generator's.
 * @param {string} cwd
 * @param {string} slug
 * @param {PalettePlan} plan
 */
function candidateOf(cwd, slug, plan) {
  return plan.stored
    ? /** @type {Candidate} */ (storedCandidate(cwd, slug, plan.config))
    : generate(plan.config, paletteFiles(slug).config, cwd);
}

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
 * @param {{mode?: string, like?: string, settings: Setting[], palette?: string}} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} [base] the base theme's resolved colors, which the dark check reads
 * @returns {PalettePlan | null}
 */
function planPalette(cwd, slug, data, base) {
  const file = paletteFiles(slug).config;
  const existing = readConfig(path.join(cwd, file));
  const fams = dialFamilies(data, ownSourceTokenValues(cwd, slug));
  if (!existing && !fams.length) return null;
  /** @type {string[]} */
  const notes = [];
  const own =
    existing && typeof existing === 'object' && !Array.isArray(existing);
  // A palette made with a recipe this CLI does not know (a newer CLI's):
  // its saved colors stay exactly as stored, so opening the theme never
  // recolors it; only a change to its colors needs a CLI that knows it.
  if (own && newerRecipe(existing.recipe)) {
    const stored = storedCandidate(cwd, slug, existing);
    const dir = path.join(cwd, 'themes', slug);
    const savedKey = SAVED_COLORS.has(dir)
      ? SAVED_COLORS.get(dir)
      : paletteMadeFromKey(savedTheme(cwd, slug));
    /** The seed the saved palette made a family from. @param {string} id */
    const seedOfSaved = id =>
      /** @type {any[]} */ (
        Array.isArray(existing.families) ? existing.families : []
      ).find(x => x?.id === id)?.seed;
    // (A color changed in the settings file by hand is a change too: each
    // color the settings name is checked against the seed the saved
    // palette was made from, where it names that family. A color the
    // saved palette has no shades for is a change too.)
    /** @param {DialFamily[]} list */
    const differing = list =>
      list.find(f => {
        if (!(/** @type {any} */ (stored?.palette)?.[f.id])) return true;
        const was = seedOfSaved(f.id);
        return Boolean(was) && !sameColor(String(was), f.seed);
      }) ?? null;
    const madeFrom = !differing(fams);
    // Settings that already disagree with the saved palette as read (a
    // color changed or added in the file by hand).
    const loaded = LOADED_SETTINGS.has(dir)
      ? LOADED_SETTINGS.get(dir)
      : savedTheme(cwd, slug);
    const hand =
      stored && Array.isArray(loaded?.settings)
        ? differing(dialFamilies(loaded, ownSourceTokenValues(cwd, slug)))
        : null;
    // (From such a file, any change that brings every color back to the
    // seeds the saved palette was made from is the way back, an undo or a
    // `set` of the saved seed alike, as long as the vibrancy is the saved
    // one.)
    const back =
      hand != null &&
      // (Every color the file names still named, so none falls back to the
      // base theme's.)
      // (A color the saved palette has no shades for may go.)
      dialFamilies(loaded, ownSourceTokenValues(cwd, slug)).every(
        l =>
          !(/** @type {any} */ (stored?.palette)?.[l.id]) ||
          fams.some(f => f.id === l.id),
      ) &&
      (dialVibrancy(data.settings) ?? VIBRANCY_DEFAULT) ===
        (existing.vibrancy ?? VIBRANCY_DEFAULT);
    if (stored && madeFrom && (paletteMadeFromKey(data) === savedKey || back))
      return {
        config: existing,
        // Each accent or status color at the stop its saved palette holds
        // it, light (its exact anchor, else the nearest shade), and dark
        // when an exact dark anchor holds it there too.
        fills: Object.fromEntries(
          fams
            .filter(f => f.id !== 'neutral')
            .map(f => {
              const anchors = /** @type {any[]} */ (
                existing.families?.find(
                  (/** @type {any} */ x) => x?.id === f.id,
                )?.anchors ?? []
              );
              const exact = (/** @type {Mode} */ m) =>
                anchors.find(
                  a =>
                    a?.mode === m &&
                    a.policy === 'exact' &&
                    sameColor(a.color, f.seed),
                );
              const ramp = /** @type {any} */ (stored.palette)[f.id]?.light;
              const stop =
                exact('light')?.stop ??
                (ramp ? nearestShade(ramp, f.seed) : null) ??
                50;
              return [
                f.id,
                {
                  stop: Number(stop),
                  dark: Boolean(exact('dark')),
                  why: '',
                  ratio: 0,
                },
              ];
            }),
        ),
        notes: [`${file}: ${keptPaletteWords(slug, existing.recipe)}`],
        stored: true,
      };
    // (A palette file gone or unreadable leaves nothing to keep: every
    // command needs it back, or a CLI that can make the colors again.)
    if (!stored)
      throw new AstryxError(
        `${file}: ${slug}'s colors use the ${String(existing.recipe)} recipe, which this Astryx CLI (${cliVersion()}) does not make, and its palette file (${paletteFiles(slug).palette}) is missing or does not read, so the theme cannot be built until that file is back. Nothing was changed.`,
        [],
        ERROR_CODES.ERR_PALETTE_GENERATION,
      );
    // Settings that already disagree with the saved palette as read refuse
    // every other command, so the refusal names that setting and the way
    // back.
    if (hand) {
      const name =
        hand.source ??
        (loaded.settings.some(
          (/** @type {any} */ x) =>
            x?.source === 'dial' && x.thing === hand.dial,
        )
          ? hand.dial
          : '--color-accent');
      const seed = /** @type {any} */ (stored?.palette)?.[hand.id]
        ? String(seedOfSaved(hand.id))
        : null;
      const was = seed
        ? `the saved palette was made from ${seed}`
        : `the saved palette has no shades for ${hand.dial}`;
      // (The way back named is the one that opens the theme: `set` of the
      // saved seed when that setting is the only difference, else each
      // difference to put back by hand.)
      const own = ownSourceTokenValues(cwd, slug);
      const diffs = dialFamilies(loaded, own).filter(f => differing([f]));
      const vibrancyOff =
        (dialVibrancy(loaded.settings) ?? VIBRANCY_DEFAULT) !==
        (existing.vibrancy ?? VIBRANCY_DEFAULT);
      const nameOf = (/** @type {DialFamily} */ f) =>
        f.source ??
        (loaded.settings.some(
          (/** @type {any} */ x) => x?.source === 'dial' && x.thing === f.dial,
        )
          ? f.dial
          : '--color-accent');
      // (A color the theme's own source sets wins over the settings: it is
      // put back in that file, never with set.)
      const sourceFile = `themes/${slug}/${slug}.theme.ts`;
      const backOf = (/** @type {DialFamily} */ f) =>
        /** @type {any} */ (stored?.palette)?.[f.id]
          ? `${nameOf(f)} back to ${String(seedOfSaved(f.id))}${f.source ? ` in ${sourceFile}` : ''}`
          : `${nameOf(f)} out${f.source ? ` of ${sourceFile}` : ''}`;
      const way =
        diffs.length === 1 && !vibrancyOff
          ? hand.source
            ? `Change it back in ${sourceFile} to open the theme.`
            : seed
              ? `Put it back by hand, or with set ${slug} ${name} ${seed}, to open the theme.`
              : `Take it out of the file by hand to open the theme.`
          : `Put every one back by hand to open the theme: ${[
              ...diffs.map(backOf),
              ...(vibrancyOff
                ? [
                    `vibrancy back to ${String(existing.vibrancy ?? VIBRANCY_DEFAULT)}`,
                  ]
                : []),
            ].join(', ')}.`;
      throw new AstryxError(
        `${slug}'s colors use the ${String(existing.recipe)} recipe, which this Astryx CLI (${cliVersion()}) does not make; its palette is kept as saved. ${hand.source ? sourceFile : `themes/${slug}/${slug}.settings.json`} sets ${name} to ${hand.source ? hand.seed : hand.value}, but ${was}. ${way} Nothing was changed.`,
        [],
        ERROR_CODES.ERR_PALETTE_GENERATION,
      );
    }
    throw unknownRecipe(slug, existing.recipe);
  }
  // A new palette is made with the newest recipe; a palette the theme
  // already has keeps the one it was made with (none named is the first),
  // so its colors never move with a CLI upgrade. Moving it is a choice
  // made in its config.
  const config = own ? {...existing} : {recipe: PALETTE_RECIPE_V2};
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
  const savedSeeds = dialFamilies(
    {settings: saved},
    ownSourceTokenValues(cwd, slug),
  );
  // A config the editor wrote holds the seeds it gave, from the settings and
  // the source as they were then: its seed is never a hand edit.
  const configMine = configWrittenByEditor(cwd, slug, data);

  /**
   * One dial family: the author's family with the dial's seed and the
   * exact anchors of that seed in place of the old ones.
   * @param {any} prev
   * @param {DialFamily} f
   */
  const familyOf = (prev, f) => {
    const old = prev && typeof prev === 'object' ? prev : {};
    const neutral = f.id === 'neutral';
    const wasSaved = configMine
      ? old.seed
      : savedSeeds.find(x => x.id === f.id)?.seed;
    if (old.seed != null && wasSaved && !sameColor(old.seed, wasSaved))
      notes.push(
        `${file}: the ${f.id} seed ${old.seed} there is replaced by ${f.source ? `the ${f.source} your theme source sets` : `your ${f.id} setting`}, ${f.seed}`,
      );
    const {family: made, stop} = dialFamily(f, config, modes);
    // The setting's family as a fresh palette has it; of the author's
    // family, a chromatic kind stays.
    const kind =
      made.kind ?? (old.kind === 'chromatic' ? 'chromatic' : undefined);
    if (
      old.kind === 'neutral' &&
      !kind &&
      !neutral &&
      !(wasSaved && isGray(wasSaved))
    )
      notes.push(
        `${file}: the ${f.id} kind "neutral" is dropped: your ${f.id} is not a gray, and a neutral kind turns its shades gray where no exact color holds them`,
      );
    /** @type {any[]} */
    const mine = made.anchors ?? [];
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
      name: old.name ?? made.name,
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
      if (mine.id !== 'neutral') fills[mine.id] = fillAt(stop);
      return family;
    })
    .filter(Boolean);
  for (const f of fams)
    if (!families.some(x => x?.id === f.id)) {
      const {family, stop} = familyOf(null, f);
      if (f.id !== 'neutral') fills[f.id] = fillAt(stop);
      families.push(family);
    }
  // The hues the editor grew for the look (lookSeeds) go, and are grown
  // again below while the theme has a color; any other hue the config
  // holds is the author's, and stays as written.
  const grown = isLookFamily;
  for (let i = families.length - 1; i >= 0; i--)
    if (grown(families[i])) families.splice(i, 1);
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
  // The category and chart hues grow with the look, after the theme's own
  // colors, and so do the status roles the theme leaves unset (the
  // editor's own grownFamilies); a family the author's config already holds stays
  // theirs. A status family that is not a setting is the editor's, grown
  // again at every plan.
  for (const family of editorLook.grownFamilies(fams, {
    base,
    reader: {rgb: parseColor, alpha: alphaOf},
  }))
    if (!families.some(f => f?.id === family.id)) families.push(family);
  // A color change on a palette made with the first recipe says what the
  // newer one does, and how to choose it.
  /** @param {any} c */
  const colorsOf = c =>
    JSON.stringify([
      c?.vibrancy ?? null,
      (Array.isArray(c?.families) ? c.families : []).map(
        (/** @type {any} */ f) => [f?.id, String(f?.seed ?? '').toLowerCase()],
      ),
    ]);
  if (
    own &&
    (config.recipe ?? PALETTE_RECIPE) === PALETTE_RECIPE &&
    colorsOf(existing) !== colorsOf(config)
  )
    notes.push(
      `${file} makes its colors with the ${PALETTE_RECIPE} recipe it was made with, whose pale shades stay at the edge of what a screen shows whatever the vibrancy; "recipe": "${PALETTE_RECIPE_V2}" there makes them follow the vibrancy and each color's own strength (its colors change once)`,
    );
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
    try {
      config.families = anchorDarkFills(
        config,
        fams,
        fills,
        paletteContext(cwd, slug, data, base),
        (id, stop) =>
          notes.push(
            `${file}: your dark anchor at shade ${shade(stop)} of ${id} is replaced by your exact ${id} color`,
          ),
      );
    } catch (error) {
      // A config the generator refuses is refused as the editor refuses
      // it, naming the file.
      generate(config, file);
      throw error;
    }
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
 * Whether the editor wrote the theme's palette config as it is now: its hash
 * is the one the settings hold (`data.palette`, or the saved settings, which
 * an undo may carry from before the palette existed), or the one the editor
 * recorded writing (a color change stopped before its settings were saved).
 * @param {string} cwd
 * @param {string} slug
 * @param {{palette?: string}} data
 */
function configWrittenByEditor(cwd, slug, data) {
  const file = path.join(cwd, paletteFiles(slug).config);
  if (!fs.existsSync(file)) return false;
  const hash = sha256(fs.readFileSync(file));
  /** @type {string | undefined} */
  let saved;
  try {
    saved = JSON.parse(
      fs.readFileSync(
        path.join(cwd, 'themes', slug, `${slug}.settings.json`),
        'utf8',
      ),
    ).palette;
  } catch {
    saved = undefined;
  }
  return (
    data.palette === hash ||
    saved === hash ||
    readWrittenRecord(cwd, slug)['palette.config.json'] === hash
  );
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
    const mine = configWrittenByEditor(cwd, slug, data);
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
  // A palette this CLI cannot make again keeps its files as they are.
  // (Its note rides on the mapping, paletteMapping, once.)
  if (plan.stored) {
    data.palette = sha256(fs.readFileSync(abs(f.config)));
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
  return readRecordIn(path.join(cwd, 'themes', slug), slug);
}

/**
 * The record of what the editor wrote, read from a theme folder as it is
 * (a copy of one included); empty when there is none or it is damaged.
 * @param {string} dir
 * @param {string} slug
 * @returns {Record<string, string>}
 */
export function readRecordIn(dir, slug) {
  try {
    const json = JSON.parse(
      readRegularFile(path.join(dir, `${slug}.pictures.json`), 'utf8'),
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
  // A link of the user's at the record's name is left as it is.
  if (fs.lstatSync(file, {throwIfNoEntry: false})?.isSymbolicLink()) return;
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
 * A palette made with a recipe this CLI does not know, with the file left as
 * it is. A newer CLI's recipe is no fault to fix by hand: it gets the
 * refusal `theme palette generate` gives, with the update step that fits
 * where the CLI runs. Any other recipe is named as no recipe Astryx makes,
 * and the file is the fix: its `recipe` set to one this CLI knows.
 * @param {any} config
 * @param {string} file the config's path, for the refusal
 * @param {string} [cwd] the project, for the step that updates the CLI
 */
function refuseUnknownRecipe(config, file, cwd) {
  const recipe = config?.recipe;
  if (recipe == null || PALETTE_RECIPES.includes(recipe)) return;
  if (newerRecipe(recipe))
    throw newerRecipeRefusal({recipe, file, cwd: cwd ?? process.cwd()});
  // Every command that reads the theme builds this plan and meets this
  // refusal again, so the way out is the file itself, and no command is
  // offered.
  throw new AstryxError(
    `${file}: this theme's colors name the palette recipe ${String(recipe)}, which no Astryx CLI makes. Fix that part of the file by hand: set "recipe" to one of the recipes this CLI (${cliVersion()}) knows, ${PALETTE_RECIPES.join(', ')}. Nothing was changed.`,
    [],
    ERROR_CODES.ERR_PALETTE_GENERATION,
  );
}

/**
 * @param {any} config
 * @param {string} [file] the config's path, for the refusal
 * @param {string} [cwd] the project, for the command that updates the CLI
 * @returns {Candidate}
 */
function generate(config, file = 'palette.config.json', cwd = undefined) {
  refuseUnknownRecipe(config, file, cwd);
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
 * A family's ramp in each mode, as the theme makes it: the palette's own
 * family when its color settings define one; for the neutral family, else
 * the grays grown from the theme's secondary text (every theme has its
 * grays); null for another family the palette does not define.
 * @param {string} cwd
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @param {string} family
 * @returns {{light: Record<string, string>, dark: Record<string, string>} | null}
 */
export function familyRamp(cwd, slug, data, base, family) {
  if (dialFamilies(data).some(f => f.id === family)) {
    const plan = /** @type {PalettePlan} */ (
      planPalette(cwd, slug, data, base)
    );
    const ramp = /** @type {any} */ (candidateOf(cwd, slug, plan).palette)[
      family
    ];
    if (ramp?.light && ramp?.dark) return ramp;
  }
  if (family !== 'neutral') return null;
  /** (The secondary text the theme sets exactly in a mode, else its base's.) @param {Mode} m */
  const grown = m => {
    const set = data.settings.find(
      s =>
        s.source === 'token' &&
        s.thing === '--color-text-secondary' &&
        !s.on &&
        !s.when &&
        !s.state &&
        (!s.mode || s.mode === m),
    )?.value;
    const v =
      (set && parseColor(set) ? set : null) ??
      base?.[m]?.['--color-text-secondary'];
    const rgb = v ? parseColor(v) : null;
    return rgb ? grownGrays(hex(/** @type {number[]} */ (rgb)), m) : null;
  };
  const light = grown('light');
  const dark = grown('dark');
  return light && dark ? {light, dark} : null;
}

/**
 * The colors and token mapping of a theme's palette, or null when it sets no
 * color dial. Reads the config the settings ask for and runs the generator
 * in memory, so it matches the palette file `syncPalette` writes.
 * @param {string} cwd
 * @param {string} slug
 * @param {{mode?: string, settings: Setting[]}} data - The theme's settings (a whole ThemeData, or the settings with one left out).
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @param {Record<string, unknown>} tokenDefaults
 * @returns {PaletteMapping | null}
 */
export function paletteMapping(cwd, slug, data, base, tokenDefaults) {
  if (!dialFamilies(data).length) return null;
  // One change asks for the mapping several times (to build, to check, to
  // say what changed), each with the same inputs: what it reads (the
  // settings, the base, the color config, saved settings and generated
  // palette on disk, the theme's own token values) names it, and an answer is made once. A
  // config that does not parse is read again each time, so it is named.
  const config = readText(path.join(cwd, paletteFiles(slug).config));
  if (config != null && !parsesAsJson(config))
    return paletteMappingOf(cwd, slug, data, base, tokenDefaults);
  const key = sha256(
    JSON.stringify([
      cwd,
      slug,
      data,
      base,
      tokenDefaults,
      config,
      readText(path.join(cwd, 'themes', slug, `${slug}.settings.json`)),
      ownSourceTokenValues(cwd, slug),
      // (The generated palette and its receipt: a hand edit there is the
      // mapping's "was edited by hand" note.)
      readText(path.join(cwd, paletteFiles(slug).palette)),
      readText(path.join(cwd, paletteFiles(slug).receipt)),
    ]),
  );
  const kept = MAPPINGS.get(key);
  if (kept) {
    MAPPINGS.delete(key);
    MAPPINGS.set(key, kept);
    return structuredClone(kept);
  }
  const made = paletteMappingOf(cwd, slug, data, base, tokenDefaults);
  if (made) {
    MAPPINGS.set(key, structuredClone(made));
    if (MAPPINGS.size > MAPPINGS_KEPT)
      MAPPINGS.delete(/** @type {string} */ (MAPPINGS.keys().next().value));
  }
  return made;
}

/** The mappings made last, by what they were made from (paletteMapping). @type {Map<string, PaletteMapping>} */
const MAPPINGS = new Map();
/** How many mappings are kept. */
const MAPPINGS_KEPT = 8;

/** A file's text, or null when it cannot be read. @param {string} file */
function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** @param {string} text */
function parsesAsJson(text) {
  try {
    JSON.parse(text.replace(/^\uFEFF/, ''));
    return true;
  } catch {
    return false;
  }
}

/**
 * The mapping, made: see {@link paletteMapping}.
 * @param {string} cwd
 * @param {string} slug
 * @param {{mode?: string, settings: Setting[]}} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @param {Record<string, unknown>} tokenDefaults
 * @returns {PaletteMapping | null}
 */
function paletteMappingOf(cwd, slug, data, base, tokenDefaults) {
  const fams = dialFamilies(data, ownSourceTokenValues(cwd, slug));
  if (!fams.length) return null;
  const plan = /** @type {PalettePlan} */ (planPalette(cwd, slug, data, base));
  const {config} = plan;
  const candidate = candidateOf(cwd, slug, plan);
  const mapping = mapPalette(
    candidate,
    fams,
    plan.fills,
    paletteContext(cwd, slug, data, base, tokenDefaults),
  );
  const {tokens} = mapping;
  // An accent set as a token for one mode moves that mode only: the other
  // mode keeps what the theme's palette gives it without that accent (its
  // other colors, a warm gray, still drawn), else follows the base theme.
  // (A palette kept as saved has no palette without that accent to make:
  // its saved shades stand for both modes.)
  const only = plan.stored ? null : fams.find(f => f.id === 'accent')?.only;
  if (only) {
    const other = only === 'light' ? 'dark' : 'light';
    // The palette's checks for that mode are those of the palette without
    // the accent, which this change does not move.
    mapping.contrast = mapping.contrast.filter(c => c.mode !== other);
    const rest = paletteMapping(
      cwd,
      slug,
      {
        ...data,
        settings: data.settings.filter(
          x =>
            !(
              x.source === 'token' &&
              x.thing === '--color-accent' &&
              !x.on &&
              !x.when &&
              !x.state &&
              x.mode === only
            ),
        ),
      },
      base,
      tokenDefaults,
    );
    for (const [k, v] of Object.entries(tokens)) {
      const before = rest?.tokens?.[k]?.[other];
      if (before) {
        // (The same shade where the palette's color there is the same; its
        // color written out where it differs, as the accent moves the
        // shades it coordinates.)
        tokens[k] = {
          ...v,
          [other]:
            String(v[other]?.color).toLowerCase() ===
            String(before.color).toLowerCase()
              ? v[other]
              : {stop: 0, color: String(before.color), family: 'literal'},
        };
        continue;
      }
      const kept = base?.[other]?.[k];
      if (kept == null) {
        delete tokens[k];
        continue;
      }
      // (The base theme's own value: the module reads it from the base,
      // so the mode keeps following it.)
      tokens[k] = {
        ...v,
        [other]: {stop: 0, color: String(kept), family: 'literal', base: true},
      };
    }
  }
  return {
    candidate,
    families: fams,
    ...mapping,
    stored: Boolean(plan.stored),
    vibrancy: config.vibrancy ?? VIBRANCY_DEFAULT,
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
          `${t}: light shade ${l}, dark shade ${d}${t.endsWith('-secondary') ? ` (moves to a shade that reads at ${t.includes('icon') ? NON_TEXT : TEXT}:1 on the surfaces)` : NEUTRAL_INSIDE.includes(t) ? ' (the card surface of the other mode, for tooltips and toasts, at the nearest shade inside the ramp so it carries your color)' : ''}`,
      ),
      ...Object.entries(NEUTRAL_TINTS).map(
        ([t, [[l, la], [d, da]]]) =>
          `${t}: light shade ${l} at opacity ${la}, dark shade ${d} at opacity ${da}`,
      ),
      ...Object.entries(LIFT_GROUNDS)
        .filter(([g]) => !g.startsWith('--color-background-'))
        .map(
          ([, g]) =>
            `--color-text-secondary on ${g.parts}: the shade nearest the secondary text's that reads at ${TEXT}:1 on ${g.what} and under a hover, as the official theme lifts it`,
        ),
      ...(Object.keys(LIFT_GROUNDS).some(g =>
        g.startsWith('--color-background-'),
      )
        ? [
            `--color-text-secondary on coloured cards: the shade nearest the secondary text's that reads at ${TEXT}:1 on each card's fill, as the official theme lifts it`,
          ]
        : []),
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
 * The contrast checks of the colors a dial makes, in the theme's modes.
 * @param {PaletteMapping} pal
 * @param {string} dial
 * @param {Mode[]} modes
 */
function dialChecks(pal, dial, modes) {
  return pal.contrast.filter(
    c =>
      (pal.tokens[c.token]?.family === dial || c.dials?.includes(dial)) &&
      // A theme with one mode never shows the other one's shades.
      modes.includes(c.mode),
  );
}

/**
 * What one contrast check says: its own note, or for a failed one the
 * ratio it reached.
 * @param {PaletteMapping['contrast'][number]} c
 * @param {string} dial
 */
function checkNote(c, dial) {
  return (
    c.note ||
    `${c.token} reads at only ${c.ratio}:1 in ${c.mode} on ${c.against} (needs ${c.needs}:1) even at shade ${shade(c.stop)}, the most contrasting one: pick a lighter or darker ${dial}, or set ${c.token} exactly`
  );
}

/**
 * A contrast check's identity: its token, its mode and what it is measured
 * on, whatever ratio or shade it reaches. The same check before and after a
 * change has the same key, as a text or border problem's key does.
 * @param {ContrastCheck} c
 */
export function paletteCheckKey(c) {
  return `palette|${c.token}|${c.mode}|${c.against}`;
}

/**
 * The contrast checks a dial's colors fail, as their notes say them, each
 * with its identity ({@link paletteCheckKey}), to tell the checks a change
 * made fail from the ones that failed before it.
 * @param {PaletteMapping | null} pal
 * @param {string} dial
 * @param {Mode[]} [modes] the modes the theme has
 * @returns {Array<{key: string, text: string}>}
 */
export function paletteFailures(pal, dial, modes = ['light', 'dark']) {
  if (!pal) return [];
  return dialChecks(pal, dial, modes)
    .filter(c => !c.pass)
    .map(c => ({
      key: paletteCheckKey(c),
      text: checkNote(c, dial),
      ...(c.fix ? {fix: c.fix} : {}),
    }));
}

/**
 * The identities of every contrast check a palette fails, whatever its
 * dial: what a change compares its own failures with.
 * @param {PaletteMapping | null} pal
 * @returns {Set<string>}
 */
export function paletteFailedKeys(pal) {
  return new Set(
    (pal?.contrast ?? []).filter(c => !c.pass).map(paletteCheckKey),
  );
}

/**
 * A text/fill pair the base theme draws, as a person reads it: "the blue
 * card's primary text", "text on the error tint".
 * @param {import('../theme/palette/generate/mapping.mjs').BasePair} pair
 */
function pairWords(pair) {
  if (pair.kind === 'category') return `${pair.hue} category text`;
  if (pair.kind === 'status')
    return pair.tint ? `text on the ${pair.role} tint` : `text on ${pair.role}`;
  const which =
    /^(?:variant|color):(.+)$/.exec(pair.block)?.[1] ??
    pair.block.replace(':', ' ');
  const role =
    pair.prop === 'color'
      ? 'text'
      : `${pair.prop.replace(/^--color-text-/, '')} text`;
  return `the ${which === 'base' ? '' : `${which} `}${pair.part.replace(/-/g, ' ')}'s ${role}`;
}

/**
 * What the look did to the category colors (Badge, Token, Card tints), the
 * chart colors and the status roles: one line with the accent's notes, and
 * what a set gave up to stay written with every dial's.
 * @param {PaletteMapping} pal
 * @param {string} dial
 * @param {string} [slug]
 * @param {boolean} [vibrancyRuns] whether `set <theme> vibrancy` changes
 *   anything (vibrancyTakes): only then is a higher vibrancy advised
 */
export function categoryNotes(
  pal,
  dial,
  slug = '<theme>',
  vibrancyRuns = false,
) {
  const c = pal.categories;
  if (!c) return [];
  /** @type {string[]} */
  const out = [];
  const derived = [
    c.badges === 'derived'
      ? 'category colors (badges, tokens and card tints)'
      : '',
    c.chart === 'derived' ? 'chart colors' : '',
    Object.keys(pal.tokens).some(k => k.startsWith('--color-syntax-'))
      ? 'code colors'
      : '',
  ].filter(Boolean);
  if (dial === 'accent' && derived.length)
    out.push(
      `${derived.join(', ').replace(/, ([^,]*)$/, ' and $1')} grow from Core's hues at your accent's strength and the palette's vibrancy, so they match the look; card tints stay tints that the page's text reads on where a shade allows, code reads at 4.5:1 on its background, and an exact --color-<role>-<hue>, --color-data-* or --color-syntax-* setting wins`,
    );
  // (Every limit no shade meets is said; the colors moved apart are
  // counted after the first.)
  if (c.limits.length || c.moved.length) {
    // (Hues drawn alike come from a low vibrancy: a higher one is advised,
    // with its command, only where set takes it.)
    // (A theme at 100 already has no higher vibrancy.)
    const apart =
      c.alike && vibrancyRuns && pal.vibrancy < 100
        ? `; a higher vibrancy draws the hues apart: ${P} set ${slug} vibrancy more`
        : '';
    const moves = c.moved.length
      ? `${c.moved[0]}${c.moved.length > 1 ? `, and ${c.moved.length - 1} more moved apart` : ''}`
      : '';
    out.push(
      `category and chart colors follow your look: ${[...c.limits, ...(moves ? [moves] : [])].join('; ')}${apart}${c.unread ? '; an exact setting of a color that does not read chooses it' : ''}`,
    );
  }
  // Status fills someone red-weak or green-weak may not tell apart: one
  // note per pair, with a line that sets one of them apart in lightness.
  /** @type {Set<string>} */
  const saidPairs = new Set();
  for (const c of pal.cvd ?? []) {
    const id = `${c.a}|${c.b}`;
    if (saidPairs.has(id)) continue;
    saidPairs.add(id);
    const visions = [
      ...new Set(
        (pal.cvd ?? [])
          .filter(x => x.a === c.a && x.b === c.b)
          .map(x => `${x.vision} (${x.mode})`),
      ),
    ];
    // The one to move and its way: the second of the pair first, away
    // from the first in lightness, then the other way, then the first of
    // the pair; the first move that keeps the moved fill standing out from
    // the page (3:1, in every mode the theme shows) is the line. None
    // that does: the note names no line.
    const pages = [
      ...new Set(
        (pal.cvd ?? [])
          .filter(z => z.a === c.a && z.b === c.b)
          .flatMap(z => z.pages ?? (z.page ? [z.page] : [])),
      ),
    ];
    const tries = /** @type {Array<[number, number]>} */ ([
      [1, 1],
      [1, -1],
      [0, 1],
      [0, -1],
    ]);
    const [p0, p1] = c.colors.map(v => hexToOklch(v));
    // (The smallest move, in steps of lightness, that sets the pair apart
    // for color-blind readers and still stands out from every page.)
    const steps = [0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27, 0.3];
    const move = steps
      .flatMap(d =>
        tries.map(([who, way]) => {
          const [me, other] = who === 1 ? [p1, p0] : [p0, p1];
          const sign = (me.L >= other.L ? 1 : -1) * way;
          const L = me.L + sign * d;
          if (L < 0.15 || L > 0.95) return null;
          const to = oklchClampedHex(L, me.C, me.H);
          if (!pages.every(pg => contrastRatio(to, pg) >= NON_TEXT))
            return null;
          const role = who === 1 ? c.b : c.a;
          const pair = {
            [c.a]: role === c.a ? to : c.colors[0],
            [c.b]: role === c.b ? to : c.colors[1],
          };
          if (cvdClashes(pair).some(x => x.a === c.a && x.b === c.b))
            return null;
          return {role, to, lighter: sign > 0};
        }),
      )
      .find(Boolean);
    const dial = move ? (move.role === 'error' ? 'danger' : move.role) : '';
    out.push(
      `for color-blind readers, the ${c.a} and ${c.b} fills may look alike (${visions.join(', ')}: ${c.colors.join(' and ')}); ${move ? `a ${move.lighter ? 'lighter' : 'darker'} ${dial} keeps the colors apart: ${P} set ${slug} ${dial} ${quoteCommandArgument(move.to)}` : 'no lighter or darker shade of either keeps both standing out from the page; pick a status color of another hue'}`,
    );
  }
  if (pal.code?.length)
    out.push(
      `${pal.code.join(', ')} ${pal.code.length > 1 ? 'keep' : 'keeps'} the base theme's: no shade of ${pal.code.length > 1 ? 'their' : 'its'} color reads at 4.5:1 on the code background and the page`,
    );
  const held = pal.kept ?? [];
  if (held.length) {
    const tokensHeld = [...new Set(held.map(h => h.token))];
    const pairs = [
      ...new Set(held.map(h => `${pairWords(h.pair)} (${h.mode})`)),
    ];
    out.push(
      `${tokensHeld.length} of the colors the look grows keep the base theme's where the base theme draws its own text with them, so it stays readable: ${pairs.slice(0, 3).join(', ')}${pairs.length > 3 ? `, and ${pairs.length - 3} more` : ''}`,
    );
  }
  const st = pal.statuses;
  const grown = ['info', 'success', 'warning', 'danger'].filter(
    role => st?.roles[role] === 'derived',
  );
  if (dial === 'accent' && grown.length)
    out.push(
      `${grown.join(', ')} ${grown.length > 1 ? 'grow' : 'grows'} from the base theme's ${grown.length > 1 ? 'hues' : 'hue'} at your accent's strength and the palette's vibrancy, kept apart from your accent where a shade allows (badges, banners, status dots, field status); an exact setting of ${grown.length > 1 ? 'one' : 'it'} chooses it`,
    );
  if (st?.why.length)
    out.push(
      `status colors follow your look: ${st.why.join('; ')}; to choose one: ${st.short.map(role => `${P} set ${slug} ${role} <color>`).join(', ')}`,
    );
  return out;
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
 * @param {boolean} [vibrancyRuns] whether `set <theme> vibrancy` changes
 *   anything (vibrancyTakes)
 * @returns {string[]}
 */
export function paletteNotes(
  pal,
  dial,
  slug,
  modes = ['light', 'dark'],
  vibrancyRuns = false,
) {
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
      given.source
        ? `your ${dial} ${given.value} is outside the colors every screen shows (sRGB); the nearest one is ${seedOf(given.value)}, but the ${given.source} your theme source sets, ${given.seed}, is used`
        : `your ${dial} ${given.value} is outside the colors every screen shows (sRGB), so the nearest one, ${seedOf(given.value)}, is used`,
    );
  for (const c of dialChecks(pal, dial, modes)) {
    if (c.note || !c.pass) notes.push(checkNote(c, dial));
    else if (c.stop !== c.preferred)
      notes.push(
        `${c.token} uses shade ${shade(c.stop)} in ${c.mode}, not ${shade(c.preferred)}, so it reads at ${c.ratio}:1 on ${c.against}`,
      );
  }
  notes.push(...categoryNotes(pal, dial, slug, vibrancyRuns));
  notes.push(
    `the generated colors are in ${f.palette}, made from ${f.config} (receipt: ${f.receipt}); the theme imports only the shades it uses, from ${f.refs}`,
  );
  return notes;
}
