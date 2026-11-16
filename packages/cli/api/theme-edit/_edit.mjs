// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editing operations behind `astryx experimental theme editor`:
 * new, set, undo (a step back, or one setting removed) and show. Every change
 * is checked first against what the installed Core's parts really read; a
 * change that cannot take effect is refused and nothing is written.
 *
 * @position api/theme-edit — imported only by _adapter.mjs
 */

import {THEME_SLUG_RE} from '../../foundation/discovery/theme-discovery.mjs';
import * as fs from 'node:fs';
import {
  coversProperty,
  cssProperties,
  matchValue,
  vendorProperties,
} from './_css.mjs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {
  followLine,
  readSetLine,
  splitCommand,
  vetSuggestions,
  repairGate,
} from './_vet.mjs';
import {
  allowedLine,
  booleanWord,
  colorPair,
  coversTyped,
  readsTyped,
  withoutCopyDebris,
  withoutDebris,
  baseWord,
  typoNear,
  stateSpelling,
} from './_normal.mjs';
import {
  AUTO_SPREAD,
  COMMON_STATES,
  CORNERS,
  CSS_PSEUDO_CLASSES,
  CSS_PSEUDO_ELEMENTS,
  ONE_COLON_PSEUDO_ELEMENTS,
  DIALS,
  FAMILIES,
  FONT_ROLES,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  KEY_TOKENS,
  LIKE,
  P,
  SPACING,
  TYPE_STYLES,
  familyOf,
  wordTable,
} from './_tables.mjs';
import {
  commitTheme,
  compileTheme,
  cornerPx,
  radiusAt,
  radioCircle,
  radiusTokenOf,
  contrastProblems,
  describe,
  entryDamage,
  entryNotes,
  printedEntry,
  readSavedStates,
  keyOf,
  loadTheme,
  maskedSettings,
  modesOf,
  coreElementVars,
  nearest,
  closestOf,
  partsOf,
  undoArgs,
  isCheckNote,
  withoutBadValues,
  NAME_RULE,
  HISTORY_STEPS,
  readHistory,
  refuseUnreadableFiles,
  refuse,
  settingsProblem,
  resolvedTokens,
  shown,
  slugOk,
  themeFiles,
  buildTheme,
  staleBuild,
  EDITOR_SUFFIXES,
  outputsDrift,
  kebab,
  camel,
  NEW_MARKER,
  clearNewMarker,
  refuseThemeSource,
  settingsRemade,
  entriesReadable,
  readAsMeant,
  editorMadeFolder,
  builtOnBase,
  onBuiltInSteps,
  readFields,
  settingsJson,
  slugFor,
  typedThemeName,
  themeNameReadings,
  themeSource,
  themeSourceProblem,
  refuseThemeParse,
  ownSourceTokens,
  ownSourceTokenValues,
  ownTokenEntries,
  fontOf,
  ownThemeInput,
  describeValue,
  settingsThemeName,
  nonTextMessage,
  ownPartTokens,
  PHONE_RULE_WHEN,
  builtTouchTokens,
  PHONE_TYPE,
  refreshSourceStamp,
  sourceChangedReason,
  setOwnTokenCheck,
  freeThemeName,
  refuseLinks,
  usableNewName,
  FOLDER_JUNK,
  folderIsEmpty,
  dialValueFits,
  holdAfterBuild,
  cornersPlain,
  setArgs,
  editedThemes,
  entryFieldNames,
  propertySpelling,
  entryProblem,
  namesSetting,
  namesSettingAsTyped,
  dialSettingsInText,
  skips,
  OPEN_SECTION,
  FOLLOWS,
  baseRedraws,
} from './_settings.mjs';
import {
  checkSetting,
  indicatorLines,
  selectedBoxes,
  coveredPaints,
  dividerParts,
  normalizeEntry,
  pillDrawnRadios,
  pillParts,
  propertyValueProblem,
  storedProblems,
  unknownVarRef,
  STATE_WORDS,
} from './_check.mjs';
import {MODAL, isColorToken} from './_compiler.mjs';
import {fontShorthandFamilyList} from '../theme/build/font-warning.mjs';
import {
  isHeadingLevel,
  levelDuplicates,
  missingScaleFieldWhy,
  noLevelWhy,
  typographyBlockWhy,
  noScaleWeightWhy,
  roleWeightTokens,
  typographyValueProblem,
} from '../theme/build/typography-values.mjs';
import {radiusInputProblems} from '../theme/build/radius-values.mjs';
import {
  derivedPrivateCopies,
  spreadPrivateVarMessage,
} from '../../foundation/config/theme-private-vars.mjs';
import {innerBlock, partKeyProblem} from '../theme/build/style-keys.mjs';
import {
  CUSTOM_PROPERTY,
  customPropertyCycle,
  cycleProblem,
  writtenPrimitive,
} from '../theme/build/written-values.mjs';
import {colorProblem, hex, parseColor} from './_color.mjs';
import {hexToOklch, oklchClampedHex} from '../theme/palette/generate/color.mjs';
import {
  PALETTE_DIALS,
  VIBRANCY_DEFAULT,
  paletteFiles,
  paletteMapping,
  paletteDialOf,
  paletteNotes,
  paletteFailures,
  paletteFailedKeys,
  lockHeld,
  refuseIfLockLost,
  writeWhole,
  isGraySeed,
  seedOf,
  isEditorTemp,
} from './_palette.mjs';
import {
  renderPreview,
  renderSheet,
  pageInTheWay,
  inTheWayPhrase,
  previewIsCurrent,
  takeFirstAppCopy,
  appCopyBehind,
  appCopyStale,
  copyFontsCss,
  writeAppCopy,
  touchedFamilies,
} from './_preview.mjs';
import {appWiring, refreshPreviewRoute, seeLine} from './_preview-app.mjs';
/** The preview command, as a person runs it. */
const PREVIEW_CMD = `${P.replace(/ editor$/, '')} preview`;
import {
  baseInstalled,
  baseResolved,
  copiesLine,
  installLine,
  openProject,
  themeCacheRoot,
} from './_project.mjs';
import {reactMissing} from './_parts.mjs';
import {borderFrames, missedSteps} from './_missed.mjs';
import {
  reactCopies,
  renderCause,
  requireProject,
  context,
  pictures,
  SAMPLE_PAGE_NAME,
  cutShortNote,
  cutShortProblem,
  openStatesPage,
  fontNotes,
  fontsNotLoaded,
  themeImageNotes,
  styledChanges,
  previewAfter,
  checkSection,
  stampSheet,
  lookAtPictures,
  familyPages,
  FAMILY_PICTURE_HEIGHT,
  FAMILY_SECTIONS,
  UNWRITABLE,
  FAMILY_OVERVIEW,
} from './_context.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {readThemeState} from '../../foundation/config/theme-state.mjs';
import {
  formatCliCommand,
  getCliInvocation,
  quoteCommandArgument,
} from '../../foundation/env/package-manager.mjs';

const E = ERROR_CODES;

/**
 * @typedef {import('./theme-edit.type.mjs').ThemeEditChangeOptions} ChangeOptions
 */
/**
 * A setting's scope as set's flags give it.
 * @typedef {{on?: string, when?: string, state?: string, mode?: string, only?: boolean}} ScopeFlags
 */
/** The marker a `new` writes first and removes last. */

/**
 * A folder the editor made but that has no settings: a stopped `new` left
 * its marker, or the settings were removed beside the editor's generated
 * module. `clear` is what `new` makes again (the files the editor writes
 * for that name, the source only exactly as it writes it); `keep` is every
 * other file, which is never touched. Null when the editor did not make
 * the folder. System files (.DS_Store) are in neither.
 * @param {string} cwd
 * @param {string} dir
 * @param {string} slug
 * @param {boolean} [damaged] its settings are there but not valid JSON
 * @returns {{clear: string[], keep: string[]} | null}
 */
function editorLeftovers(cwd, dir, slug, damaged = false) {
  // The editor made this folder: a stopped `new` left its marker, the
  // generated settings module (which carries the editor's header) is there
  // without its settings, or its settings are there but damaged (kept
  // aside by `new`, so neither cleared nor kept here).
  if (!damaged && !editorMadeFolder(cwd, slug)) return null;
  /** @type {string[]} */
  const clear = [];
  /** @type {string[]} */
  const keep = [];
  const named = (/** @type {string} */ n) =>
    n === NEW_MARKER ||
    EDITOR_SUFFIXES.some(x => n === `${slug}.${x}`) ||
    /^(preview(-dark)?\.(html|png)|sheet(-[a-z-]+)?\.(html|png)|palette\.config\.json)$/.test(
      n,
    ) ||
    // The editor's temp names (writes, builds, pictures).
    isEditorTemp(n);
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (FOLDER_JUNK.has(e.name)) continue;
    if (damaged && e.name === `${slug}.settings.json`) continue;
    if (e.isDirectory() && e.name === 'tokens') {
      for (const t of fs.readdirSync(p, {withFileTypes: true}))
        (t.isFile() && t.name.startsWith(`${slug}.palette`)
          ? clear
          : keep
        ).push(path.join(p, t.name));
      continue;
    }
    // The source as the editor writes it is made again; one changed by hand
    // is the user's, and stays. The history stays too when the settings were
    // removed, so `undo` can step back to them.
    const mine =
      e.isFile() &&
      (e.name === `${slug}.theme.ts`
        ? fs.readFileSync(p, 'utf8') === themeSource(slug)
        : // A `new` writes no history: one here is from later commands,
          // and always stays.
          e.name === `${slug}.history.json`
          ? false
          : named(e.name));
    (mine ? clear : keep).push(p);
  }
  return {clear, keep};
}

/** Whether a settings file parses, in the shape the editor reads. @param {string} file */
function readableJson(file) {
  try {
    // An entry with no thing or no source is damage too: `new` keeps the
    // file aside, as the refusal for it says.
    return !settingsRemade(settingsJson(fs.readFileSync(file, 'utf8')));
  } catch {
    return false;
  }
}

/**
 * A physical padding side as its logical side (left-to-right), so a later
 * `padding-inline` replaces an earlier `padding-left` as it does
 * `padding-inline-start`.
 * @param {string} prop
 */
const logicalSide = prop =>
  /** @type {Record<string, string>} */ ({
    'padding-left': 'padding-inline-start',
    'padding-right': 'padding-inline-end',
    'padding-top': 'padding-block-start',
    'padding-bottom': 'padding-block-end',
  })[prop] ?? prop;

/**
 * Put back every recorded file: its bytes, or removed when it was not
 * there; a palette file the build made new in tokens/ goes too.
 * @param {Map<string, Buffer | null>} kept
 * @param {string} tokensDir
 */
function putBack(kept, tokensDir) {
  for (const [file, bytes] of kept)
    if (bytes) writeWhole(file, bytes);
    else if (!fs.existsSync(file) || fs.lstatSync(file).isFile())
      fs.rmSync(file, {force: true});
  if (kept.size && fs.existsSync(tokensDir))
    for (const n of fs.readdirSync(tokensDir)) {
      const file = path.join(tokensDir, n);
      // Only a file the build made new; a folder the user put there stays.
      if (!kept.has(file) && fs.lstatSync(file).isFile())
        fs.rmSync(file, {force: true});
    }
}

/**
 * Start a theme in themes/<name>/, optionally on a built-in theme, with any
 * dial settings applied in the same build. Each setting is checked as `set`
 * checks it, before anything is written.
 * @experimental
 * @param {string} name
 * @param {import('./theme-edit.type.mjs').ThemeEditNewOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditNewResponse>}
 */

export async function themeEditNew(name, options = {}) {
  try {
    // The public call always makes the theme: only checkedNewLines asks
    // for the checks alone.
    return /** @type {import('./theme-edit.type.mjs').ThemeEditNewResponse} */ (
      await newTheme(name, options)
    );
  } catch (e) {
    // Settings typed where the name goes are typed settings too: the line
    // that carries them is checked against them.
    const fromName =
      typeof name === 'string' && !slugOk(name)
        ? dialSettingsInText(name)
        : null;
    throw await vetNewLines(
      e,
      options.cwd ?? process.cwd(),
      {...Object.fromEntries(fromName ?? []), ...(options.settings ?? {})},
      options.like,
    );
  }
}

/**
 * A `new` line read back: its theme, base, --png and dial flags in order;
 * null when it is no `new` line the editor writes.
 * @param {string} line the whole command, `astryx experimental theme editor new <theme> …`
 * @returns {{slug: string, like: string | undefined, png: boolean, flags: Array<[string, string]>} | null}
 */
function readNewLine(line) {
  const prefix = `${P} new `;
  if (!line.startsWith(prefix)) return null;
  const args = splitCommand(line.slice(prefix.length));
  if (!args || !args.length || args[0].startsWith('-')) return null;
  const [slug, ...rest] = args;
  /** @type {Array<[string, string]>} */
  const flags = [];
  let like = /** @type {string | undefined} */ (undefined);
  let png = false;
  for (let j = 0; j < rest.length; j += 1) {
    const m = /^--([a-z-]+)$/.exec(rest[j]);
    if (m?.[1] === 'png') png = true;
    else if (m && rest[j + 1] != null) {
      const v = rest[(j += 1)];
      if (m[1] === 'like') like = v;
      else flags.push([m[1], v]);
    } else return null;
  }
  return {slug, like, png, flags};
}

/**
 * The dial settings a `new` keeps of the ones given, as new itself repairs
 * them for a theme name that is free (each value read as the one gate
 * reads it, else left out): what a refusal for the NAME offers with the
 * name corrected. Null when new refuses them with no line.
 * @param {string} cwd
 * @param {import('./theme-edit.type.mjs').ThemeEditNewOptions} options
 * Several when new reads a value several ways (a mode it cannot tell:
 * each mode it can be), one map each.
 * @returns {Promise<Array<Record<string, string | string[]>> | null>}
 */
async function repairedNewSettings(cwd, options) {
  const settings = /** @type {Record<string, string | string[]>} */ (
    options.settings ?? {}
  );
  const probe = usableNewName(cwd, 'my-theme');
  try {
    await newTheme(
      probe,
      {...options, settings},
      {check: true, repairing: true},
    );
    return [settings];
  } catch (e) {
    const vetted = await vetNewLines(e, cwd, settings, options.like);
    if (!(vetted instanceof AstryxError)) throw vetted;
    const lines = (vetted.suggestions ?? [])
      .map(x => readNewLine(x.name))
      .filter(x => x?.slug === probe);
    if (!lines.length) return null;
    return lines.map(line => {
      /** @type {Record<string, string | string[]>} */
      const out = {};
      for (const [k, v] of /** @type {any} */ (line).flags) {
        const had = out[k];
        out[k] = had == null ? v : [...[had].flat(), v];
      }
      return out;
    });
  }
}

/**
 * Every `new` a refusal offers, checked as `new` checks its options (in
 * memory, nothing written) before it is offered: a dial value the line
 * gives in place of one typed passes only as an exact reading of what was
 * typed (never a stock value); a flag `new` refuses is left out, and the
 * reason names it; a line that adds a setting nobody typed, or is still
 * refused, is not offered; a did-you-mean reads a whole value typed. The
 * one gate for `new` lines, as set's lines have theirs.
 * @param {unknown} e
 * @param {string} cwd
 * @param {Record<string, string | string[] | undefined>} typed the dial options given
 * @param {string} [like] the base given (--like), which a did-you-mean may read
 * @returns {Promise<unknown>}
 */
async function vetNewLines(e, cwd, typed, like) {
  if (!(e instanceof AstryxError) || !(e.suggestions ?? []).length) return e;
  const prefix = `${P} new `;
  /** @type {import('./_settings.mjs').Ctx | null} */
  let ctx = null;
  try {
    ctx = /** @type {import('./_settings.mjs').Ctx} */ (await context(cwd));
  } catch {
    return e;
  }
  const read = readNewLine;
  /**
   * The refusal `new` gives these flags, or null.
   * @param {string} slug @param {string | undefined} like
   * @param {Array<[string, string]>} flags @param {boolean} png
   */
  const problem = async (slug, like, flags, png) => {
    /** @type {Record<string, string | string[]>} */
    const settings = {};
    for (const [k, v] of flags) {
      const had = settings[k];
      settings[k] = had == null ? v : [...[had].flat(), v];
    }
    const base = like && like !== 'none' ? like : undefined;
    try {
      /** @type {any} */ (ctx).base = await baseResolved(
        /** @type {any} */ (ctx).project,
        base,
      );
    } catch {
      /** @type {any} */ (ctx).base = await baseResolved(
        /** @type {any} */ (ctx).project,
        undefined,
      );
    }
    try {
      applyNewSettings(
        /** @type {any} */ (ctx),
        slug,
        {name: slug, ...(base ? {like: base} : {}), mode: 'both', settings: []},
        settings,
        png,
        like,
      );
      return null;
    } catch (err) {
      if (err instanceof AstryxError) return err;
      throw err;
    }
  };
  // A light and a dark color typed as one value is read as that pair, for
  // a color dial only and only when both halves are colors: a comma in any
  // other value is the dial's own (a decimal comma, a list).
  const typedValues = (/** @type {string} */ k) =>
    [typed[k]]
      .flat()
      .filter(v => v != null)
      .map(String)
      // headings takes a list in new (a weight and a tracking): a list
      // typed as one value (`bold, tight`) is each of its words.
      .flatMap(v =>
        k === 'headings' && /[\s,]/.test(v.trim())
          ? v
              .trim()
              .split(/\s*,\s*|\s+/)
              .filter(Boolean)
          : [v],
      )
      .map(v => {
        if (!PALETTE_DIALS.includes(k)) return v;
        const pair = colorPair(v) ?? modeColorsOf(v);
        return pair.light &&
          pair.dark &&
          !colorProblem(pair.light) &&
          !colorProblem(pair.dark)
          ? `light-dark(${pair.light}, ${pair.dark})`
          : v;
      });
  /** @type {Array<{name: string, reason?: string}>} */
  const out = [];
  /** Change lines that need the theme made first. @type {Array<{name: string, reason?: string}>} */
  const later = [];
  const typedKeys = Object.keys(typed).filter(k => typed[k] != null);
  /** Settings whose typed value no reading makes work. @type {Set<string>} */
  const unread = new Set();
  for (const x of e.suggestions ?? []) {
    // A did-you-mean value passes the same gate as a line: a reading of a
    // whole value typed, never one word of it.
    if (x.reason === 'did you mean') {
      if (
        (typeof like === 'string' &&
          allowedLine({offered: x.name, typed: like, thing: 'base'})) ||
        typedKeys.some(k =>
          typedValues(k).some(t =>
            allowedLine({offered: x.name, typed: t, thing: k}),
          ),
        )
      )
        out.push(x);
      continue;
    }
    const line = x.name.startsWith(prefix) ? read(x.name) : null;
    if (!line) {
      // A change line for the theme new was refused for (set's own
      // repair of a value) needs that theme made first: it follows a new
      // line that makes it, as its next step, or is not offered.
      const made = /^(?:set|undo) ([a-z0-9-]+)\b/.exec(
        x.name.startsWith(P) ? x.name.slice(P.length + 1) : '',
      )?.[1];
      if (made && !fs.existsSync(themeFiles(cwd, made).settings)) {
        later.push({
          ...x,
          reason: `then this, once a new line above has made ${made}`,
        });
        continue;
      }
      out.push(x);
      continue;
    }
    // The typed values the line's flags carry together, by the setting
    // typed: each flag reads the value whole, or carries a part of it and
    // the flags beside it the rest (`Inter 600` is --font Inter with
    // --headings semibold), as set's lines for that value do.
    /** @type {Set<string>} */
    const coveredTyped = new Set();
    for (const k of typedKeys)
      for (const t of typedValues(k)) {
        const reads = line.flags
          .filter(([fk]) => fk === k || !typedKeys.includes(fk))
          .map(([fk, fv]) =>
            readsTyped({offered: fv, typed: t, thing: fk, typedThing: k}),
          );
        if (reads.every(r => r !== false) && coversTyped(reads, t, k))
          coveredTyped.add(`${k}\n${t}`);
      }
    // A line that adds a setting nobody typed (a mode read from a color's
    // words) is another command, never offered; one that carries a part of
    // a value typed beside the typed setting's own part is that value.
    const extra = line.flags.some(([k]) => !typedKeys.includes(k));
    if (extra && !coveredTyped.size) continue;
    /** The flags no reading of this line makes work, each with its text. @type {Array<[string, string]>} */
    const untyped = [];
    /** @type {string[]} */
    const refused = [];
    const shown = (/** @type {[string, string]} */ [k, v]) =>
      `--${k} ${quoteCommandArgument(v)}`;
    // A value in place of one typed is offered only as an exact reading of
    // what was typed.
    const lineMode = line.flags.find(([k]) => k === 'mode')?.[1];
    const typedOnly = line.flags.filter(f => {
      const was = typedValues(f[0]);
      const ok =
        !was.length ||
        was.includes(f[1]) ||
        was.some(t => coveredTyped.has(`${f[0]}\n${t}`)) ||
        was.some(t =>
          allowedLine({
            offered: f[1],
            typed: t,
            thing: f[0],
            ...(lineMode ? {saved: new Map([['mode', [lineMode]]])} : {}),
          }),
        );
      if (!ok) {
        untyped.push([f[0], shown([f[0], was[0]])]);
        unread.add(f[0]);
      }
      return ok;
    });
    // Each flag in turn is kept when new still takes the line with it, so a
    // flag new refuses (alone, or beside one kept before it) is left out.
    /** @type {Array<[string, string]>} */
    const flags = [];
    for (const f of typedOnly)
      if (await problem(line.slug, line.like, [...flags, f], false))
        refused.push(shown(f));
      else flags.push(f);
    if (await problem(line.slug, line.like, flags, line.png)) continue;
    const reason = (/** @type {Set<string>} */ readElsewhere) => {
      const notRead = untyped.filter(([k]) => !readElsewhere.has(k));
      const dropped = [
        ...(notRead.length
          ? [
              `${notRead.map(([, t]) => t).join(' and ')}, which no reading makes work`,
            ]
          : []),
        ...(refused.length
          ? [`${refused.join(' and ')}, which new refuses`]
          : []),
      ];
      return dropped.length
        ? `do this instead, without ${dropped.join('; and without ')}`
        : x.reason;
    };
    const name = `${prefix}${line.slug}${newFlags(
      line.like,
      Object.fromEntries(
        flags.reduce((/** @type {Map<string, string[]>} */ m, [k, v]) => {
          m.set(k, [...(m.get(k) ?? []), v]);
          return m;
        }, new Map()),
      ),
      line.png,
    )}`;
    if (out.some(y => y.name === name)) continue;
    out.push(
      /** @type {any} */ ({
        ...x,
        name,
        flagsKept: flags.map(([k]) => k),
        flagsUnread: untyped.map(([k]) => k),
        reasonFor: reason,
      }),
    );
  }
  // A flag another line carries a reading of is no flag "no reading makes
  // work": each line says only what no line keeps.
  const kept = new Set(
    out.flatMap(y => /** @type {any} */ (y).flagsKept ?? []),
  );
  // A line that lost a flag another line carries a reading of is that line
  // without the setting typed: never offered, as its reason no longer
  // holds.
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const unreadHere = /** @type {any} */ (out[i]).flagsUnread ?? [];
    if (
      unreadHere.length &&
      unreadHere.every((/** @type {string} */ k) => kept.has(k))
    )
      out.splice(i, 1);
  }
  for (const y of out) {
    const z = /** @type {any} */ (y);
    if (z.reasonFor) z.reason = z.reasonFor(kept);
    delete z.flagsKept;
    delete z.flagsUnread;
    delete z.reasonFor;
  }
  // What such a setting takes, as set ends for the same value.
  for (const k of unread)
    if (!kept.has(k) && !out.some(y => y.name === `${P} how ${k}`))
      out.push({name: `${P} how ${k}`, reason: 'what it takes'});
  e.suggestions = [
    ...out,
    ...(out.some(y => y.name.startsWith(prefix)) ? later : []),
  ];
  return e;
}

/**
 * {@link themeEditNew}'s work; with `check` (an argument of its own, never
 * one of the public options), its checks only (null when they pass,
 * nothing written).
 * @param {string} name
 * @param {import('./theme-edit.type.mjs').ThemeEditNewOptions} options
 * @param {{check?: boolean, repairing?: boolean}} [mode]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditNewResponse | null>}
 */
async function newTheme(
  name,
  options,
  {check = false, repairing = false} = {},
) {
  const {cwd = process.cwd(), png = false, settings = {}} = options;
  // --like reads a base in any case, by the one case rule of every dial
  // (`set <theme> base Neutral` is neutral); `--like none` builds on no
  // base, as `set <theme> base none` does.
  const likeWord =
    typeof options.like === 'string'
      ? baseWord(options.like) || options.like
      : options.like;
  const like = likeWord === 'none' ? undefined : likeWord;
  requireProject(cwd);
  // A corrected `new` keeps every option given, fixing only the bad one.
  // A --like in another case is the built-in theme it names.
  // A --like that names no built-in theme is the nearest one, or none: a
  // corrected command never repeats a --like that is refused below.
  // A typo of a built-in base under the one typo limit is that base, as a
  // base named in other letters is, installed or not (its refusal then
  // offers the install, then the same new, or the same new on no base).
  // `@astryxdesign/theme-butter`, `butterTheme`, `Butter`: butter (the one
  // base reader, baseWord, shared with set and the settings file).
  const likeFixed =
    like == null
      ? likeWord === 'none'
        ? 'none'
        : undefined
      : LIKE.includes(like)
        ? like
        : (nearest(like, LIKE)[0] ??
          // Two bases in one value (`neutral,stone`, `neutral stone`): the
          // first built-in one named, as for --like given twice.
          String(options.like ?? like)
            .split(/[\s,|;]+/)
            .map(w => w.toLowerCase())
            .find(w => LIKE.includes(w)) ??
          null);
  // A dial value the dial does not take is left out of a suggested `new`
  // (a corrected name must not repeat it), and the refusal says so.
  /** @type {Array<[string, string]>} */
  const badValue = Object.entries(settings).flatMap(([k, v]) =>
    (Array.isArray(v) ? v : v == null ? [] : [v])
      .map(x => /** @type {[string, string]} */ ([k, String(x)]))
      .filter(([dial, x]) => DIALS[dial] && !dialValueFits(dial, x)),
  );
  // Refused for no effect as new refuses it: vibrancy with no color given
  // that is not a gray (a new theme has no other color to saturate).
  const colorGiven = Object.entries(settings).some(
    ([k, v]) =>
      PALETTE_DIALS.includes(k) &&
      (Array.isArray(v) ? v : v == null ? [] : [v]).some(
        x =>
          !badValue.some(([a, b]) => a === k && b === String(x)) &&
          !isGraySeed(seedOf(String(x))),
      ),
  );
  /** @type {Array<[string, string]>} */
  const noEffect =
    settings.vibrancy != null && !colorGiven
      ? (Array.isArray(settings.vibrancy)
          ? settings.vibrancy
          : [settings.vibrancy]
        ).map(x => /** @type {[string, string]} */ (['vibrancy', String(x)]))
      : [];
  const unfit = [...badValue, ...noEffect];
  // A font the font readers refuse (a preset typo, a weight word after the
  // family) takes any family text by its dial's own test, so a refusal
  // for the name reads it as new reads it for a free name.
  const nameRefused =
    typeof name !== 'string' ||
    !slugOk(name) ||
    fs.existsSync(themeFiles(cwd, name).settings);
  const isUnfit = (/** @type {string} */ k, /** @type {unknown} */ x) =>
    unfit.some(([a, b]) => a === k && b === String(x));
  // A value it does not take is repaired as new repairs it for a free name
  // (the one gate), so a refusal for the name keeps it as read; only a
  // value no reading repairs is left out.
  // The repairs are read on the base as read (a --like typo is the base
  // it names), so a refusal for the base keeps them too; a base not
  // installed here reads them on no base, as nothing it adds is needed to
  // read a dial's value.
  const readings =
    (unfit.length || (settings.font != null && nameRefused)) && !repairing
      ? await repairedNewSettings(cwd, {
          ...options,
          like:
            likeFixed && likeFixed !== 'none' && baseInstalled(cwd, likeFixed)
              ? likeFixed
              : 'none',
          settings,
        })
      : null;
  // Each reading of the values (one, or one per mode new cannot tell).
  const repaired = readings?.[0] ?? null;
  // The font as new reads it: refused when its reading differs.
  if (
    repaired &&
    settings.font != null &&
    JSON.stringify(repaired.font) !== JSON.stringify(settings.font)
  )
    for (const x of [settings.font].flat()) unfit.push(['font', String(x)]);
  const keptAs = (/** @type {string} */ k) => repaired?.[k];
  const lostBad = badValue.filter(
    ([k]) => repaired == null || keptAs(k) == null,
  );
  const lostNoEffect = noEffect.filter(
    ([k]) => repaired == null || keptAs(k) == null,
  );
  /** The settings a suggested new carries, for one reading of the values. */
  const fitFor = (
    /** @type {Record<string, string | string[]> | null} */ reading,
  ) =>
    /** @type {Record<string, string | string[] | undefined>} */ ({
      ...Object.fromEntries(
        Object.entries(settings).map(([k, v]) => [
          k,
          reading && unfit.some(([a]) => a === k)
            ? reading[k]
            : Array.isArray(v)
              ? v.filter(x => !isUnfit(k, x))
              : isUnfit(k, v)
                ? undefined
                : v,
        ]),
      ),
      // A setting the font's reading adds (the weight its words name).
      ...(reading && unfit.some(([a]) => a === 'font')
        ? Object.fromEntries(
            Object.entries(reading).filter(([k]) => !(k in settings)),
          )
        : {}),
    });
  const fitVariants = (readings ?? [null]).map(fitFor);
  const fitSettings = fitVariants[0];
  const flag = (/** @type {[string, string]} */ [k, x]) =>
    `--${k} ${quoteCommandArgument(x)}`;
  const dropped = [
    lostBad.length
      ? ` The suggestion leaves out ${lostBad.map(flag).join(', ')}: not ${lostBad.length === 1 ? 'a value its dial takes' : 'values their dials take'} (${[...new Set(lostBad.map(([k]) => `${k} takes ${DIALS[k].values}`))].join('; ')}).`
      : '',
    lostNoEffect.length
      ? ` The suggestion leaves out ${lostNoEffect.map(flag).join(', ')}: vibrancy saturates the theme's colors, and no color that is not a gray is given, so it would change nothing.`
      : '',
  ].join('');
  const again = (
    /** @type {string} */ newName,
    /** @type {string | null | undefined} */ likeValue = likeFixed,
  ) => `${P} new ${newName}${newFlags(likeValue, fitSettings, png)}`;
  // The same new as lines that run here: a built-in base the project has
  // not installed is installed first.
  // One line for each reading of the values (each mode new cannot tell).
  const againLines = (
    /** @type {string} */ newName,
    /** @type {string | null | undefined} */ likeValue = likeFixed,
  ) => {
    const lines = fitVariants.map(
      fit => `${P} new ${newName}${newFlags(likeValue, fit, png)}`,
    );
    if (!(likeValue && LIKE.includes(likeValue))) return lines;
    // A base not installed here: its install, then the line; and the same
    // new on no base, which works now.
    return [
      ...lines.flatMap(l => onBuiltInSteps(cwd, likeValue, l)),
      ...(baseInstalled(cwd, likeValue)
        ? []
        : fitVariants.map(fit => ({
            name: `${P} new ${newName}${newFlags(null, fit, png)}`,
            reason: 'build on no theme',
          }))),
    ].filter((x, i, all) => all.findIndex(y => y.name === x.name) === i);
  };
  // A name that reads as a built-in base (Neutral, stoneTheme, its package
  // @astryxdesign/theme-stone), by the one base reader, is that base: it
  // gets the built-in name's answer below, which keeps the base.
  // A path names the base its last part does (`./x/theme-stone`): the
  // one base reader reads it so.
  const asBase = typeof name === 'string' ? baseWord(name) : '';
  if (LIKE.includes(asBase) && name !== asBase) name = asBase;
  if (!slugOk(name)) {
    // A path typed for the name (themes/brand, ./t, t/) names the theme the
    // path ends in.
    // A file name, the app copy's export (tTheme), camelCase or spaces
    // (BrandDark, "Brand Dark") name the theme they read as: when it is
    // here already, that is said, never a numbered second copy offered.
    // The name typed as an option (`--theme=t2`, `--name=t2`) is that name.
    const asOption = /^--?(?:theme|name)=(.+)$/i.exec(String(name ?? ''));
    const typed = asOption ? asOption[1] : String(name ?? '');
    const path_ = /[\\/]/.test(typed);
    const readings = themeNameReadings(typed);
    const present = readings.find(n =>
      fs.existsSync(themeFiles(cwd, n).settings),
    );
    const fixed =
      present ?? readings[0] ?? slugFor(path_ ? typedThemeName(typed) : typed);
    const exists = Boolean(present);
    // A token's name typed where the theme's name goes, with or without
    // its dashes (`--color-accent`, `Color-Accent`), is no theme to make:
    // the editor reads a token by either spelling, so a free name is
    // offered instead, as for a dial's name.
    const asToken = await (async () => {
      if (exists || !/^[a-z][a-z0-9-]*$/i.test(typed)) return false;
      try {
        const {C} = await context(cwd);
        return Boolean(C.isToken(`--${typed.toLowerCase()}`));
      } catch {
        return false;
      }
    })();
    // Dial settings typed where the name goes (`'accent: red'`, `{"accent":
    // "red"}`): a free name, with those settings as their options, checked
    // as every new line is.
    const typedSettings = exists ? null : dialSettingsInText(typed);
    if (typedSettings) {
      const free = usableNewName(cwd, 'my-theme');
      const merged = {...settings, ...Object.fromEntries(typedSettings)};
      const lines = await checkedNewLines(
        `${P} new ${free}${newFlags(likeFixed ?? undefined, merged, png)}`,
        free,
        {...options, cwd, like: likeFixed ?? undefined, settings: merged},
      );
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `"${String(name ?? '').slice(0, 80)}" holds settings, not a theme name (${NAME_RULE}).${dropped}`,
        {run: lines.map(x => x.name)},
      );
    }
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `"${String(name ?? '').slice(0, 80)}" is not a theme name (${NAME_RULE})${exists ? `; ${fixed} is a theme here already` : ''}.${dropped}`,
      {
        run: exists
          ? [`${P} show ${fixed}`]
          : // A setting's name (--color-accent) is never a theme to make, as
            // the other commands read it: a free name instead.
            againLines(
              usableNewName(
                cwd,
                namesSettingAsTyped(typed) || asToken ? 'my-theme' : fixed,
              ),
            ),
      },
    );
  }
  // A name the theme commands' own discovery skips ("a--b", "b-") would
  // make an app copy no `theme add`, `theme list` or doctor takes.
  if (!THEME_SLUG_RE.test(name)) {
    const cleaned = name.replace(/-{2,}/g, '-').replace(/-+$/, '');
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `"${name}" is not a theme name the theme commands take: a dash only between letters or digits (no two in a row, none at the end), so its app copy in src/themes/ would be skipped by theme add, theme list and doctor.${dropped}`,
      {run: againLines(usableNewName(cwd, cleaned))},
    );
  }
  // A built-in theme's name would collide with the theme of that name the
  // app may also use.
  if (LIKE.includes(name))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} is a built-in theme; an editor theme needs a name of its own. To start from ${name}, build on it.${dropped}`,
      {
        run: (() => {
          const mine = fs.existsSync(themeFiles(cwd, `my-${name}`).dir)
            ? freeThemeName(cwd, `my-${name}`)
            : `my-${name}`;
          // Built on the theme named (installed first when it is not),
          // unless another base (or none) was given; or on no base.
          return likeFixed !== undefined
            ? againLines(mine, likeFixed)
            : [...againLines(mine, name)];
        })(),
      },
    );
  const f = themeFiles(cwd, name);
  // A link or a file where the theme goes is never written through or
  // replaced.
  // themes/ itself in the way blocks every name: say so, and how to fix it.
  const rootSt = fs.lstatSync(f.root, {throwIfNoEntry: false});
  if (rootSt && (rootSt.isSymbolicLink() || !rootSt.isDirectory()))
    refuse(
      E.ERR_FILE_EXISTS,
      `themes in this app is ${rootSt.isSymbolicLink() ? `a link (to ${fs.readlinkSync(f.root)})` : 'a file'}, not a folder, so no editor theme can be made: every theme goes in themes/<name>/. Rename or move it, then run new again.`,
      // A look that changes nothing: what is in the way.
      {
        run: [
          `ls -la ${quoteCommandArgument(path.relative(cwd, f.root) || 'themes')}`,
        ],
      },
    );
  const dirSt = fs.lstatSync(f.dir, {throwIfNoEntry: false});
  if (dirSt && (dirSt.isSymbolicLink() || !dirSt.isDirectory()))
    refuse(
      E.ERR_FILE_EXISTS,
      `themes/${name} is ${dirSt.isSymbolicLink() ? 'a link' : 'a file'}, so a theme is not made there.${dropped}`,
      {run: againLines(freeThemeName(cwd, name))},
    );
  // Settings that are not valid JSON are kept aside, and the theme is
  // made again beside them.
  const damaged = fs.existsSync(f.settings) && !readableJson(f.settings);
  if (fs.existsSync(f.settings) && !damaged)
    refuse(E.ERR_FILE_EXISTS, `Theme "${name}" already exists.${dropped}`, {
      // What the command asked for, on the theme that exists or as a new one.
      // A base's install line, when one is needed, is given once.
      run: [
        `${P} show ${name}`,
        ...(likeFixed && LIKE.includes(likeFixed)
          ? onBuiltInSteps(cwd, likeFixed, `${P} set ${name} base ${likeFixed}`)
          : []),
        ...againLines(freeThemeName(cwd, name)),
      ].filter(
        (r, i, all) =>
          all.findIndex(
            x =>
              (typeof x === 'string' ? x : x.name) ===
              (typeof r === 'string' ? r : r.name),
          ) === i,
      ),
    });
  // A `new` stopped part way (killed, out of memory) leaves its own marker
  // beside the files it wrote: only such a folder is cleared, and only
  // after every argument is checked. Anything else in the folder, or a
  // folder without the marker, is never touched.
  const left = fs.existsSync(f.dir)
    ? editorLeftovers(cwd, f.dir, name, damaged)
    : null;
  const holdsOther =
    fs.existsSync(f.dir) &&
    !left &&
    // Empty folders (an empty tokens/) hold nothing of anyone's.
    !folderIsEmpty(f.dir);
  if (holdsOther)
    refuse(
      E.ERR_FILE_EXISTS,
      `themes/${name}/ already holds files this command did not make; choose another name.${dropped}`,
      {run: againLines(freeThemeName(cwd, name))},
    );
  if (like != null && !LIKE.includes(like)) {
    const message = `--like takes a built-in theme (${LIKE.join(', ')}), not "${String(options.like ?? '').trim()}"${fs.existsSync(themeFiles(cwd, String(like)).settings) ? `; ${like} is a theme made here, and a new theme builds only on a built-in one` : ''}. Nothing was changed.${dropped}`;
    // The built-in theme it names in another case, or a typo of one
    // (installed or not, with its install first: the one install helper);
    // the did-you-mean and the lines agree.
    throw new AstryxError(
      message,
      [
        ...(likeFixed && likeFixed !== 'none'
          ? [
              ...onBuiltInSteps(cwd, likeFixed, again(name, likeFixed)),
              ...(baseInstalled(cwd, likeFixed)
                ? []
                : [{name: again(name, null), reason: 'build on no theme'}]),
            ]
          : [
              // No base read: the same new on no theme, said as such.
              {
                name: again(name, likeFixed ?? null),
                reason: likeFixed ? 'do this instead' : 'build on no theme',
              },
            ]),
        // A spelling is a did-you-mean; the same word with copy debris on
        // it (`neutral'`, `neutral,`) is no other word, so none is said.
        ...(likeFixed &&
        baseWord(
          withoutDebris(withoutCopyDebris(String(options.like ?? ''))),
        ) !== likeFixed
          ? [{name: likeFixed, reason: 'did you mean'}]
          : []),
      ],
      E.ERR_THEME_BAD_VALUE,
    );
  }
  const ctx = await context(cwd);
  // A --png takes the sample page and the open states again after the build.
  ctx.takesPictures = png ? {sheet: null} : null;
  /** @type {import('./_settings.mjs').ThemeData} */
  const data = {name, ...(like ? {like} : {}), mode: 'both', settings: []};
  try {
    /** @type {import('./_settings.mjs').Ctx} */ (ctx).base =
      await baseResolved(ctx.project, data.like);
  } catch (e) {
    // A base that is not installed: install it, then the same new on it
    // (the one helper set's refusal uses too); or the same new on no base.
    if (e instanceof AstryxError && e.code === E.ERR_UNKNOWN_THEME && like)
      e.suggestions = [
        ...onBuiltInSteps(cwd, like, again(name, like)),
        {name: again(name, null), reason: 'build on no theme'},
      ];
    throw e;
  }
  // Every check comes before the first change to the folder: the settings,
  // and a source of the user's own kept from before (it must still extend
  // the settings, or the build fails after the folder was cleared).
  try {
    applyNewSettings(
      ctx,
      name,
      structuredClone(data),
      settings,
      png,
      likeFixed ?? undefined,
    );
  } catch (e) {
    throw await followNewLine(e, ctx, name, data);
  }
  // Checked only (checkedNewLines): every check has passed, and nothing
  // is written.
  if (check) return null;
  applyNewSettings(ctx, name, data, settings, png, likeFixed ?? undefined);
  if (left?.keep.some(p => path.basename(p) === `${name}.theme.ts`))
    await refuseThemeSource(cwd, name);
  /** @type {string[]} */
  const keptNotes = [];
  /** @type {string[]} */
  const leftNotes = [];
  const ownKept = (left?.keep ?? []).filter(
    p => path.basename(p) !== `${name}.history.json`,
  );
  if (ownKept.length)
    leftNotes.push(
      `kept your own files in themes/${name}/: ${ownKept
        .slice(0, 4)
        .map(p => path.relative(f.dir, p))
        .join(', ')}${ownKept.length > 4 ? ', …' : ''}`,
    );
  if (left?.keep.some(p => path.basename(p) === `${name}.history.json`))
    leftNotes.push(
      `the history is kept in ${name}.history.json: \`${P} undo ${name}\` steps back to the settings from before the last change, and the last change itself is not kept`,
    );
  // The marker goes first and comes off last: a `new` stopped between
  // leaves a folder the next `new` can prove it made. The damaged settings
  // are moved aside after it, and back on a failure.
  const dirMade = !fs.existsSync(f.dir);
  fs.mkdirSync(f.dir, {recursive: true});
  const marker = path.join(f.dir, NEW_MARKER);
  // Fenced like every write under the theme lock.
  writeWhole(marker, JSON.stringify({pid: process.pid, started: Date.now()}));
  /** @type {string | null} */
  let aside = null;
  if (damaged) {
    let n = 1;
    const at = (/** @type {number} */ k) =>
      path.join(f.dir, `${name}.settings.damaged${k > 1 ? `-${k}` : ''}.json`);
    while (fs.existsSync(at(n))) n++;
    aside = at(n);
    refuseIfLockLost();
    fs.renameSync(f.settings, aside);
    keptNotes.push(
      `${name}.settings.json was damaged: it is kept as ${path.basename(aside)}, and the theme was made again`,
    );
  }
  // A file this build writes again is newer than this moment.
  const before = new Map(
    (left?.clear ?? []).map(p => [
      p,
      fs.statSync(p, {throwIfNoEntry: false})?.mtimeMs ?? null,
    ]),
  );
  /** @type {Awaited<ReturnType<typeof commitTheme>>} */
  let r;
  try {
    r = await commitTheme(ctx, name, data, {history: false});
  } catch (e) {
    // A command that lost its lock owns none of these files now: it puts
    // nothing back and removes nothing.
    if (/** @type {any} */ (e)?.lockLost || !lockHeld()) refuseIfLockLost();
    if (aside && !fs.existsSync(f.settings)) fs.renameSync(aside, f.settings);
    fs.rmSync(marker, {force: true});
    if (dirMade)
      try {
        fs.rmdirSync(f.dir);
      } catch {
        // It holds something else now.
      }
    throw e;
  }
  // Only after the theme is made: the editor's old files this build did not
  // write again go (old pictures, a stopped run's temp files).
  if (left && left.clear.length) {
    // The build's own outputs are its now; the rest (old pictures, a
    // stopped run's temp files and history) goes when this build did not
    // write it again.
    const outputs = [
      'css',
      'js',
      'd.ts',
      'css.d.ts',
      'settings.ts',
      // The source exactly as the editor writes it, which the build keeps.
      'theme.ts',
    ].map(x => `${name}.${x}`);
    const gone = left.clear.filter(p => {
      if (path.basename(p) === NEW_MARKER) return false;
      if (outputs.includes(path.basename(p))) return false;
      const now = fs.statSync(p, {throwIfNoEntry: false})?.mtimeMs;
      return now != null && now === before.get(p);
    });
    refuseIfLockLost();
    for (const p of gone) fs.rmSync(p, {force: true});
    try {
      fs.rmdirSync(path.join(f.dir, 'tokens'));
    } catch {
      // Not there, or it holds something else.
    }
    const stopped = left.clear.some(p => path.basename(p) === NEW_MARKER);
    const shownLeft = left.clear.filter(p => path.basename(p) !== NEW_MARKER);
    leftNotes.unshift(
      `made the theme again over ${shownLeft.length} file${shownLeft.length === 1 ? '' : 's'} ${stopped ? 'a stopped `new` left' : 'the editor had left'} in themes/${name}/ (${shownLeft
        .slice(0, 4)
        .map(p => path.relative(f.dir, p))
        .join(', ')}${shownLeft.length > 4 ? ', …' : ''})`,
    );
  }
  refuseIfLockLost();
  fs.rmSync(marker, {force: true});
  const {cutShort, ...p} = await previewAndRoute(
    ctx,
    name,
    data,
    png,
    'overview',
    'new',
  );
  /** @type {string[]} */
  const notes = [
    ...keptNotes,
    ...leftNotes,
    ...(data.settings.some(s => s.thing === 'font')
      ? fontNotes(ctx, data)
      : []),
    ...cutShort.map(cutShortNote),
  ];
  return {
    type: 'themeEdit.new',
    data: {
      theme: name,
      like: like ?? null,
      files: {
        settings: shown(cwd, f.settings),
        source: shown(cwd, f.ts),
        css: shown(cwd, f.css),
        module: shown(cwd, f.js),
      },
      // Every setting it applied: mode is the theme's, not a setting entry.
      settings: [
        ...(settings.mode != null ? [`mode = ${data.mode} (whole theme)`] : []),
        ...data.settings.map(describe),
      ],
      notes,
      // Text it made unreadable, then the contrast checks its color dials
      // fail (a pale accent that does not stand out from the page), as a
      // change of that dial says them.
      problems: [
        ...r.problems,
        ...(await (async () => {
          const dials = [
            ...new Set(
              data.settings
                .filter(s => PALETTE_DIALS.includes(s.thing))
                .map(s => s.thing),
            ),
          ];
          if (!dials.length) return [];
          const pal = paletteMapping(
            cwd,
            name,
            data,
            await baseResolved(ctx.project, data.like),
            ctx.project.core.tokenDefaults,
          );
          const seen = new Set();
          return dials.flatMap(d =>
            paletteFailures(pal, d, modesOf(data))
              .filter(x => !seen.has(x.key) && seen.add(x.key))
              .map(x => x.text),
          );
        })()),
      ],
      // What the colors and dials it started with did not reach, as a
      // change reports it.
      ...(await missedSummary(ctx, name, data, r.res)),
      ...p,
      // How to use the theme in this app: theme add <theme> for its app copy.
      wiring: appWiring(ctx, name, data),
    },
  };
}

/**
 * A refused `new` whose suggestions include another `new` of the theme:
 * that line is checked as `new` checks its dial flags (in memory, nothing
 * written), and each repair a refusal of it offers is folded in, so the one
 * line fixes or drops every bad flag. It comes first.
 * @param {unknown} e
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data the theme before any dial
 * @returns {Promise<unknown>}
 */
async function followNewLine(e, ctx, slug, data) {
  if (!(e instanceof AstryxError)) return e;
  const prefix = `${P} new ${slug}`;
  const isNew = (/** @type {string} */ n) =>
    n === prefix || n.startsWith(`${prefix} `);
  const first = (e.suggestions ?? []).find(x => isNew(x.name));
  if (!first) return e;
  const followed = await followLine(
    first.name,
    line => {
      const args = splitCommand(line.slice(prefix.length));
      if (!args) return null;
      /** @type {Record<string, string | string[]>} */
      const settings = {};
      /** @type {string | undefined} */
      let like;
      let png = false;
      for (let j = 0; j < args.length; j += 1) {
        const m = /^--([a-z-]+)$/.exec(args[j]);
        if (m?.[1] === 'png') png = true;
        else if (m && args[j + 1] != null) {
          const v = args[(j += 1)];
          if (m[1] === 'like') like = v;
          else {
            const had = settings[m[1]];
            settings[m[1]] = had == null ? v : [...[had].flat(), v];
          }
        } else return null;
      }
      try {
        applyNewSettings(
          ctx,
          slug,
          structuredClone(data),
          settings,
          png,
          like ?? data.like,
        );
        return null;
      } catch (again) {
        if (again instanceof AstryxError) return again;
        throw again;
      }
    },
    isNew,
  );
  // A line that is still refused is never offered as the fix.
  if (followed.line === first.name || followed.why) return e;
  e.suggestions = [
    {
      ...first,
      name: followed.line,
      reason: 'do this instead: every flag fixed',
    },
    ...(e.suggestions ?? []).filter(
      x => x !== first && x.name !== followed.line,
    ),
  ];
  return e;
}

/**
 * The dial settings of `new`, checked one at a time in dial order (mode
 * first; a color before vibrancy, which needs one) into `data`.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {Record<string, string | string[] | undefined>} settings
 * @param {boolean} [png] kept in a corrected `new` a refusal suggests
 * @param {string} [likeFlag] the --like a corrected `new` keeps (`none` too)
 */
function applyNewSettings(
  ctx,
  slug,
  data,
  settings,
  png = false,
  likeFlag = data.like,
) {
  const given = Object.entries(settings).filter(([, v]) => v != null);
  for (const [thing] of given)
    if (!DIALS[thing] || thing === 'base')
      refuse(
        E.ERR_INVALID_ARGUMENT,
        thing === 'base'
          ? 'new takes the base theme as --like.'
          : `"${thing}" is not a setting new takes; it takes ${Object.keys(
              DIALS,
            )
              .filter(d => d !== 'base')
              .join(', ')}.`,
        {
          didYouMean: nearest(thing, Object.keys(DIALS)),
          run: [`${P} new ${slug} --help`],
        },
      );
  const order = ['mode', ...Object.keys(DIALS).filter(d => d !== 'mode')];
  for (const thing of order) {
    const given = settings[thing];
    if (given == null) continue;
    // `headings` takes a weight and a tracking: one value per axis.
    const values = Array.isArray(given) ? given : [given];
    for (const [index, value] of values.entries()) {
      /** @type {import('./_settings.mjs').Setting} */
      let s;
      try {
        // The same input cleanup set gives a typed value (quotes of any
        // kind around a font, invisible spaces, a pasted `name: value`).
        const typed = normalizeEntry(thing, String(value)).value;
        s = checkSetting(
          ctx,
          slug,
          data,
          thing,
          typed ?? String(value),
          {},
          false,
        );
      } catch (e) {
        throw newColorPair(
          asNewRefusal(
            vetSuggestions(e, ctx, slug, data),
            slug,
            settings,
            likeFlag,
            png,
            {thing, index},
          ),
          slug,
          settings,
          likeFlag,
          png,
          thing,
          String(value),
        );
      }
      if (thing === 'mode')
        data.mode = /** @type {'both' | 'light-only' | 'dark-only'} */ (
          s.value
        );
      else {
        const same = data.settings.findIndex(x => keyOf(x) === keyOf(s));
        if (same >= 0)
          refuse(
            E.ERR_INVALID_ARGUMENT,
            `--${thing} was given two values for the same thing (${data.settings[same].value}, ${s.value}); give one.`,
            {
              // Every other option given stays, and the first value on each
              // axis: every later value for an axis already given goes.
              run: [
                `${P} new ${slug}${newFlags(
                  likeFlag,
                  {...settings, [thing]: firstPerAxis(values)},
                  png,
                )}`,
              ],
            },
          );
        data.settings.push(s);
      }
    }
  }
}

/**
 * The options of a `new` as flags, in the order given (`new --help`'s order
 * for the command): `--like`, each dial setting, then `--png`.
 * @param {string | null | undefined} like none when null or undefined
 * @param {Record<string, string | string[] | undefined>} settings
 * @param {boolean} [png]
 * @returns {string[]}
 */
export function newFlagList(like, settings, png = false) {
  return [
    ...(like ? [`--like ${quoteCommandArgument(like)}`] : []),
    ...Object.entries(settings)
      .filter(([, v]) => v != null)
      .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map(x => [k, x]))
      .map(([k, v]) => `--${k} ${quoteCommandArgument(String(v))}`),
    ...(png ? ['--png'] : []),
  ];
}

/**
 * The options of a `new` as one flag line, with its leading space.
 * @param {string | null | undefined} like
 * @param {Record<string, string | string[] | undefined>} settings
 * @param {boolean} png
 */
function newFlags(like, settings, png) {
  const parts = newFlagList(like, settings, png);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

/**
 * A refusal from a setting `new` was given, with its suggestions turned
 * into `new` commands: the theme does not exist yet, so a `set` would fail.
 * @param {unknown} e
 * @param {string} slug
 * @param {Record<string, string | string[] | undefined>} settings
 * @param {string} [like] the --like given, kept in a corrected command
 * @param {boolean} [png] --png, kept in a corrected command
 * @param {{thing: string, index: number} | null} [at] the value refused
 */
function asNewRefusal(e, slug, settings, like, png = false, at = null) {
  if (!(e instanceof AstryxError)) return e;
  const setPrefix = `${P} set ${slug} `;
  /** @type {string[]} */
  const after = [];
  /** @type {Array<import('../../foundation/response/base').Suggestion | null>} */
  const mapped = (e.suggestions ?? []).map(s => {
    if (s.name === `${P} set --help`) return {...s, name: `${P} new --help`};
    if (!s.name.startsWith(setPrefix)) return s;
    const words = splitCommand(s.name.slice(setPrefix.length)) ?? [];
    const [thing, ...rest] = s.name.slice(setPrefix.length).split(' ');
    if (thing.startsWith('--') || !DIALS[thing]) return s;
    // A set with its own scope (`corners pill --on button`) is no option of
    // new: it is a change to make once the theme is made (said in the
    // message below).
    if (words.length !== 2) {
      after.push(s.name);
      return null;
    }
    const fixed = unquoteWord(rest.join(' '));
    // Only the refused value changes: a dial given several values
    // (--headings tight --headings BOLD) keeps the others, in order.
    const given = settings[thing];
    const values = Array.isArray(given) ? [...given] : null;
    const next =
      values && at && at.thing === thing
        ? firstPerAxis(values.map((v, i) => (i === at.index ? fixed : v)))
        : fixed;
    return {
      ...s,
      name: `${P} new ${slug}${newFlags(like, {...settings, [thing]: next}, png)}`,
    };
  });
  // Lines that set one dial in steps (a headings weight, then its
  // tracking) are one new line: new takes the dial's values together.
  /** @type {Map<string, string[]>} */
  const steps = new Map();
  (e.suggestions ?? []).forEach(s => {
    if (!s.name.startsWith(setPrefix)) return;
    const words = splitCommand(s.name.slice(setPrefix.length)) ?? [];
    if (words.length !== 2 || !DIALS[words[0]]) return;
    steps.set(words[0], [...(steps.get(words[0]) ?? []), words[1]]);
  });
  for (const [thing, values] of steps) {
    const stepped = (e.suggestions ?? []).some(
      s =>
        s.name.startsWith(`${setPrefix}${thing} `) &&
        /^then this/.test(s.reason ?? ''),
    );
    if (!stepped || values.length < 2) continue;
    const first = mapped.findIndex(
      (x, i) =>
        x != null &&
        (e.suggestions ?? [])[i]?.name.startsWith(`${setPrefix}${thing} `),
    );
    (e.suggestions ?? []).forEach((s, i) => {
      if (s.name.startsWith(`${setPrefix}${thing} `)) mapped[i] = null;
    });
    if (first >= 0)
      mapped[first] = {
        name: `${P} new ${slug}${newFlags(like, {...settings, [thing]: values}, png)}`,
        reason: 'do this instead',
      };
  }
  // A value that holds several settings (`Inter 600`: a family and a
  // weight) gets one set line per dial, each carrying its part: new takes
  // the dials together, so they are one new line, offered when the parts
  // cover the whole value typed (the gate set's lines pass).
  const refused = at ? settings[at.thing] : undefined;
  const typedValue =
    at && refused != null
      ? String(Array.isArray(refused) ? refused[at.index] : refused)
      : null;
  /** @type {Array<{i: number, thing: string, value: string, read: true | number[] | {oneOf: number[]} | false}>} */
  const parts = [];
  if (at && typedValue != null)
    (e.suggestions ?? []).forEach((s, i) => {
      if (!s.name.startsWith(setPrefix) || mapped[i] == null) return;
      const words = splitCommand(s.name.slice(setPrefix.length)) ?? [];
      if (words.length !== 2 || !DIALS[words[0]] || words[0] === 'base') return;
      parts.push({
        i,
        thing: words[0],
        value: words[1],
        read: readsTyped({
          offered: words[1],
          typed: typedValue,
          thing: words[0],
          typedThing: at.thing,
        }),
      });
    });
  const own = parts.find(p => p.thing === at?.thing && Array.isArray(p.read));
  const others = parts.filter(
    p => p.thing !== at?.thing && p.read && p.read !== true,
  );
  if (
    at &&
    own &&
    others.length &&
    new Set(others.map(p => p.thing)).size === others.length &&
    coversTyped(
      [own, ...others].map(p => p.read),
      /** @type {string} */ (typedValue),
      at.thing,
    )
  ) {
    const given = settings[at.thing];
    const values = Array.isArray(given) ? [...given] : null;
    /** @type {Record<string, string | string[] | undefined>} */
    const together = {
      ...settings,
      [at.thing]: values
        ? firstPerAxis(values.map((v, i) => (i === at.index ? own.value : v)))
        : own.value,
    };
    for (const p of others) {
      const had = together[p.thing];
      together[p.thing] = had == null ? p.value : [...[had].flat(), p.value];
    }
    for (const p of [own, ...others]) mapped[p.i] = null;
    mapped[own.i] = {
      name: `${P} new ${slug}${newFlags(like, together, png)}`,
      reason: 'do this instead',
    };
  }
  e.suggestions = mapped.filter(x => x != null);
  if (after.length)
    e.message = e.message.replace(
      /( Nothing was changed\.)?$/,
      ` Once ${slug} is made, ${after.slice(0, 2).join(' or ')} does that.$1`,
    );
  // A refused value with nothing to put in its place: the same new
  // without it, every other option kept.
  if (at && !e.suggestions.some(x => x.name.startsWith(`${P} new `))) {
    const given = settings[at.thing];
    const rest = Array.isArray(given)
      ? given.filter((_, i) => i !== at.index)
      : undefined;
    e.suggestions.push({
      name: `${P} new ${slug}${newFlags(like, {...settings, [at.thing]: rest?.length ? rest : undefined}, png)}`,
      reason: `without --${at.thing} ${quoteCommandArgument(String(Array.isArray(given) ? given[at.index] : given))}`,
    });
  }
  return e;
}

/**
 * The color for each mode a value names in words (`light #111111 dark
 * #eeeeee`, `dark: navy`): the one reading of a light and a dark color
 * typed for a color dial on `new`.
 * @param {string} typed
 * @returns {Record<string, string>}
 */
function modeColorsOf(typed) {
  /** @type {Record<string, string>} */
  const pair = {};
  /** @type {Record<string, boolean>} */
  const marked = {};
  for (const m of typed.matchAll(
    /\b(light|dark)\b\s*(mode\s*)?([:=])?\s*(#[0-9a-f]{3,8}\b|[a-z]+\([^)]*\)|[a-z]+)/gi,
  )) {
    const mode = m[1].toLowerCase();
    pair[mode] = m[4];
    // A mode word marked as a label (a colon, an equals sign, the word
    // mode) or followed by a hex or a color function.
    marked[mode] = Boolean(m[2] || m[3]) || !/^[a-z]+$/i.test(m[4]);
  }
  // CSS names colors that start with light or dark (`light blue` is
  // lightblue): a mode word followed by a bare name is one only beside the
  // other mode's half, or marked as a label.
  if (pair.light && pair.dark) return pair;
  return Object.fromEntries(
    Object.entries(pair).filter(([mode]) => marked[mode]),
  );
}

/**
 * A color dial on `new` given a light and a dark color ("light #111111 dark
 * #eeeeee"): the refusal offers the user's own colors, per mode, as set
 * does, never a stock color they did not type.
 * @param {unknown} e
 * @param {string} slug
 * @param {Record<string, any>} settings
 * @param {string | undefined} like
 * @param {boolean} png
 * @param {string} thing
 * @param {string} typed
 */
function newColorPair(e, slug, settings, like, png, thing, typed) {
  if (!(e instanceof AstryxError) || !PALETTE_DIALS.includes(thing)) return e;
  // (A color the user did not type, such as a stock example, is left out
  // by the one gate every offered new line passes: vetNewLines.)
  // With no new line, the same new without that color, every other option
  // kept.
  if (!(e.suggestions ?? []).some(x => x.name.startsWith(`${P} new `)))
    (e.suggestions ??= []).push({
      name: `${P} new ${slug}${newFlags(like, {...settings, [thing]: undefined}, png)}`,
      reason: `without --${thing} ${quoteCommandArgument(typed)}`,
    });
  const pair = modeColorsOf(typed);
  if (!pair.light && !pair.dark) return e;
  const mode = String(
    Array.isArray(settings.mode) ? settings.mode[0] : (settings.mode ?? 'both'),
  );
  /** @type {Array<{name: string, reason: string}>} */
  const lines = [];
  /** @param {string} color @param {string} reason @param {Record<string, any>} [extra] */
  const line = (color, reason, extra = {}) =>
    lines.push({
      name: `${P} new ${slug}${newFlags(like, {...settings, ...extra, [thing]: color}, png)}`,
      reason,
    });
  if (mode === 'dark-only' && pair.dark)
    line(pair.dark, 'do this instead: the dark color you gave');
  else if (mode === 'light-only' && pair.light)
    line(pair.light, 'do this instead: the light color you gave');
  else if (mode === 'both') {
    if (pair.light)
      line(
        pair.light,
        `the light color you gave; then set ${slug} --color-${thing} ${pair.dark ?? '…'} --mode dark for the dark one`,
      );
    if (pair.dark)
      line(pair.dark, 'or a dark-only theme with the dark color you gave', {
        mode: 'dark-only',
      });
  }
  // No color for the mode the theme has: how the dial works, and the
  // same new without it, never a color made up.
  if (!lines.length)
    lines.push({
      name: `${P} how ${thing}`,
      reason: `no ${mode === 'light-only' ? 'light' : 'dark'} color was given for this ${mode} theme`,
    });
  e.suggestions = [
    ...lines,
    ...(e.suggestions ?? []).filter(x => !lines.some(l => l.name === x.name)),
  ];
  return e;
}

/**
 * Headings values with every later value for an axis already given left
 * out (the first weight and the first tracking stay); a word of neither
 * axis stays, for its own refusal.
 * @param {string[]} values
 * @returns {string[]}
 */
function firstPerAxis(values) {
  const seen = new Set();
  return values.filter(v => {
    const w = String(v).trim().toLowerCase();
    const axis =
      HEADING_WEIGHTS[w] !== undefined
        ? 'weight'
        : HEADING_TRACKING[w] !== undefined
          ? 'tracking'
          : null;
    if (!axis) return true;
    if (seen.has(axis)) return false;
    seen.add(axis);
    return true;
  });
}

/**
 * A word as a suggested command writes it, without the quotes
 * quoteCommandArgument adds.
 * @param {string} word
 */
function unquoteWord(word) {
  const m = /^'(.*)'$/s.exec(word);
  return m ? m[1].replace(/'\\''/g, "'") : word;
}

/**
 * The preview page most about a change: Colors for a color (a color dial
 * or a color token), Components for a part setting, else Overview.
 * @param {{thing: string, on?: string | null}} s
 * @returns {'colors' | 'components' | 'overview'}
 */
function changeFocus(s) {
  if (s.on) return 'components';
  if (
    PALETTE_DIALS.includes(s.thing) ||
    s.thing === 'vibrancy' ||
    /^--color-/.test(s.thing)
  )
    return 'colors';
  return 'overview';
}

/**
 * A signal handler for the checks and pictures after a change is saved: it
 * says what is saved (in the words of the command that ran) and how to run
 * what did not, with the project's own CLI invocation, then lets the
 * signal end the process (the render's own handler re-raises it; with none,
 * this one does).
 * @param {string} slug
 * @param {'set' | 'undo' | 'new'} [kind] the command that saved
 * @param {string} [cwd] the project, for the CLI invocation
 * @param {boolean} [png] pictures were asked for: the command named takes
 *   them too
 * @returns {(sig: NodeJS.Signals) => void}
 */
export function stoppedAfterSave(
  slug,
  kind = 'set',
  cwd = process.cwd(),
  png = false,
) {
  const done =
    kind === 'undo'
      ? `the undo is done: ${slug} is saved and built as it was before that change`
      : kind === 'new'
        ? `${slug} is made and built`
        : `the change to ${slug} is saved and built (and its undo step kept)`;
  return sig => {
    process.stderr.write(
      `Stopped: ${done}; its checks and pictures did not run. ${formatCliCommand(`${P} show ${slug}${png ? ' --png' : ''}`, cwd)} runs them.\n`,
    );
    if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
  };
}

/**
 * The preview after a change, with the in-app preview route kept in step:
 * its imports follow the theme, such as the stylesheet of a font package
 * installed since the last change.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {boolean} png
 * @param {'colors' | 'components' | 'overview'} [focus] the preview page
 *   most about the change: Colors for a color, Components for a part
 * @param {'set' | 'undo' | 'new'} [kind] the command that saved
 */
async function previewAndRoute(
  ctx,
  slug,
  data,
  png,
  focus = 'overview',
  kind = /** @type {'set' | 'undo' | 'new'} */ ('set'),
) {
  // Stopped (Ctrl-C) while the checks and pictures run: the change is saved
  // and built already, which one line says before the process ends.
  const stopped = stoppedAfterSave(slug, kind, ctx.project.cwd, png);
  process.once('SIGINT', stopped);
  process.once('SIGTERM', stopped);
  /** @type {Awaited<ReturnType<typeof previewAfter>>} */
  let p;
  try {
    p = await previewAfter(ctx, slug, data, png);
  } finally {
    process.removeListener('SIGINT', stopped);
    process.removeListener('SIGTERM', stopped);
  }
  const wrote = takeFirstAppCopy(ctx.project.cwd, slug);
  const previewStale = await keepPreviewRoute(ctx, slug);
  return {
    ...p,
    previewStale,
    // How to see the change: the page about it, at its own URL.
    // A page not written this time (preview null) still shows the theme
    // as it was; checks that failed with the page written do not.
    see: seeLine(
      ctx.project.cwd,
      slug,
      focus,
      p.preview == null
        ? (p.notChecked ?? {
            code: 'ERR_THEME_NOT_CHECKED',
            cause: 'no preview was rendered',
          })
        : null,
      {
        // Only a run that took no picture failed: a note on pictures that
        // were taken (why an earlier browser did not) is not a failure.
        pictureProblem:
          png && !(p.pictures ?? []).length ? p.pictureProblem : null,
        pictures: p.pictures ?? [],
        stale: previewStale,
      },
    ),
    // The first time the theme's app copy is written, its files are named.
    ...(wrote ? {appCopy: {wrote}} : {}),
    // A copy a file of yours kept from being written: said, never a quiet ok.
    ...appCopyStale(ctx.project.cwd, slug),
  };
}

/**
 * Rewrite the in-app preview route when its imports changed. A route that
 * cannot be rewritten stays as it is; the change itself still stands, and
 * the next `preview add` writes the route again.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @returns {Promise<string[]>} preview files changed by hand, left showing
 *   the theme as it was
 */
async function keepPreviewRoute(ctx, slug) {
  try {
    return (await refreshPreviewRoute(ctx.project.cwd, slug)).stale;
  } catch (e) {
    // A route that could not be written (its permissions, a folder in its
    // place) does not follow this change: said, never a quiet ok. A
    // damaged preview record is named by the preview commands themselves.
    const code = /** @type {any} */ (e)?.code;
    if (code && /^E[A-Z]+$/.test(code)) {
      const where = /** @type {any} */ (e)?.path;
      return [
        `${where ? path.relative(ctx.project.cwd, where) : 'the in-app preview route'} could not be written (${code}), so the in-app preview does not follow this change; fix its permissions, then ${PREVIEW_CMD} add writes it again`,
      ];
    }
    return [];
  }
}

/**
 * The app's theme state (the themes `theme add` put into its theme
 * module), or null when it cannot be read.
 * @param {string} cwd
 */
function appThemeState(cwd) {
  try {
    return readThemeState(cwd);
  } catch {
    return null;
  }
}

/**
 * Whether the app lists the theme (`theme add` put it into its module).
 * @param {string} cwd
 * @param {string} slug
 */
const appListsTheme = (cwd, slug) =>
  Object.hasOwn(appThemeState(cwd)?.themes ?? {}, slug);

/**
 * For a theme `theme add` put into the app: the app's theme module gives
 * the app each theme's one color mode, written when the theme was added,
 * so a change of mode needs `theme add` again. Null for a theme the app
 * does not list (its mode is the app's own <Theme mode>).
 * @param {string} cwd
 * @param {string} slug
 * @param {'light' | 'dark' | null} now the one mode it has now
 * @returns {string | null}
 */
function addedModeNote(cwd, slug, now) {
  const state = appThemeState(cwd);
  if (!state || !Object.hasOwn(state.themes, slug)) return null;
  const module = path
    .relative(cwd, state.module.path)
    .split(path.sep)
    .join('/');
  return `${module}, the app's theme module, gives the app ${slug}'s mode as it was when ${slug} was added; run \`theme add ${slug}\` to write it again, and the app ${now ? `shows ${slug} in ${now} mode` : 'follows the system again'}`;
}

/**
 * What a change of mode asks of the app's wiring: a one-mode theme is
 * given its mode by the app's <Theme>, and one back to both modes no longer.
 * @param {string} cwd
 * @param {string} slug
 * @param {string | undefined} before
 * @param {string | undefined} after
 * @returns {string[]}
 */
function modeWiringNotes(cwd, slug, before, after) {
  /** @param {string | undefined} m @returns {'light' | 'dark' | null} */
  const one = m =>
    m === 'light-only' ? 'light' : m === 'dark-only' ? 'dark' : null;
  const [was, now] = [one(before), one(after)];
  if (was === now) return [];
  const added = addedModeNote(cwd, slug, now);
  if (added) return [added];
  return [
    ...(was
      ? [
          `if the app's <Theme> was given mode="${was}" for ${slug}, take it out${now ? ` (or make it mode="${now}")` : ''}: with it the app stays ${was}, whatever the system asks for`,
        ]
      : []),
    ...(now && !was
      ? [
          `the app shows ${slug} in ${now} mode when its <Theme> is given mode="${now}": \`${P.replace(' experimental theme editor', '')} theme add ${slug}\` records the theme and its mode, and the wiring it prints passes it (mode={themeModes[defaultThemeSlug] ?? 'system'}), so nothing else is needed; give it yourself only where the app renders <Theme> on its own. The theme keeps both halves of its colors, so a toast or a lightbox Core draws in the other mode stays readable`,
        ]
      : []),
  ];
}

/**
 * The scope a pasted line's label names (normalizeEntry's `label`): the
 * part it names exactly (the project's part names, as --on reads them:
 * `(card)`) or the one part it is a typo of (`(crad)`, which set's part
 * reader repairs with its line); a state (`(hover)`); a mode for a word
 * one typo from one (`(drak)`); else the part it names, as set checks it.
 * @param {{label?: string}} scope
 * @param {string} cwd
 * @returns {Promise<{on?: string, mode?: string, state?: string}>}
 */
async function labelRead(scope, cwd) {
  if (!scope.label) return {};
  const word = scope.label.trim().toLowerCase().replace(/\s+/g, '-');
  const target = await openProject(cwd)
    .then(p => p.target)
    .catch(() => null);
  if (target?.has(word) || FAMILIES[word]) return {on: word};
  const parts = [...(target?.keys() ?? []), ...Object.keys(FAMILIES)];
  if (parts.filter(n => typoNear(word, n)).length === 1)
    return {on: scope.label.trim()};
  // A state (`(hover)`) is that state.
  const state = stateSpelling(scope.label);
  if (STATE_WORDS.includes(state)) return {state};
  // A word one typo from a mode is that mode (`(drak)`), for the mode
  // reader's typo rule; any other word names no mode, and is read as the
  // part it names, which set checks (never dropped for a both-modes line).
  if (['light', 'dark'].some(m => typoNear(word, m)))
    return {mode: scope.label};
  return {on: scope.label.trim()};
}

/**
 * Change one thing in a theme: checked, built, previewed.
 * @experimental
 * @param {string} theme
 * @param {string} thing a dial, a token, or a CSS property
 * @param {string} value
 * @param {ChangeOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
export async function themeEditSet(theme, thing, value, options = {}) {
  try {
    return await change('set', theme, thing, value, options);
  } catch (e) {
    throw await themeLeftOut(
      await swappedThingValue(
        await swappedOrder(e, 'set', [theme, thing, value], options),
        theme,
        thing,
        value,
        options,
      ),
      theme,
      thing,
      value,
      options,
    );
  }
}

/**
 * A refused set whose theme word names a setting (`set padding '4px 8px'
 * --on card`, `set font Inter Tight`) in an app with one editor theme: the
 * set on that theme, the words after the setting as its value and every
 * option kept, followed by set's own check, leads.
 * @param {unknown} e
 * @param {string} word the word typed where the theme goes
 * @param {string} thing
 * @param {string | undefined} value
 * @param {ChangeOptions} options
 * @returns {Promise<unknown>}
 */
async function themeLeftOut(e, word, thing, value, options) {
  // The word names a setting, or no theme: the set on the theme here is
  // offered only when set's own check passes it (`shadow` as box-shadow).
  if (
    !(e instanceof AstryxError) ||
    !(namesSetting(String(word)) || e.code === E.ERR_UNKNOWN_THEME)
  )
    return e;
  const cwd = options.cwd ?? process.cwd();
  /** @type {string[]} */
  let themes;
  try {
    themes = editedThemes(cwd);
  } catch {
    return e;
  }
  if (themes.length !== 1 || themes.includes(word)) return e;
  const [slug] = themes;
  const typed = [thing, value].filter(w => w != null && w !== '').join(' ');
  const flags = [
    .../** @type {const} */ (['on', 'when', 'state', 'mode']).flatMap(k =>
      options[k] != null
        ? [`--${k} ${quoteCommandArgument(String(options[k]))}`]
        : [],
    ),
    ...(options.only ? ['--only'] : []),
  ];
  const followed = await followChangeLine(
    'set',
    slug,
    [
      `${P} set ${slug} ${quoteCommandArgument(String(word))}`,
      ...(typed ? [quoteCommandArgument(typed)] : []),
      ...flags,
    ].join(' '),
    cwd,
  );
  if (followed.why != null) return e;
  e.suggestions = [
    {
      name: followed.line,
      reason: `do this instead: ${slug} is the theme here`,
    },
    // Never a theme named after the setting.
    ...(e.suggestions ?? []).filter(
      x => x.name !== followed.line && !x.name.startsWith(`${P} new `),
    ),
  ];
  return e;
}

/**
 * A refused set whose thing is no setting, with a value that names one
 * (`set t round corners`): the same set with the two in the other order,
 * checked by set, leads when it works.
 * @param {unknown} e
 * @param {string} slug
 * @param {string} thing
 * @param {string | undefined} value
 * @param {{cwd?: string, on?: string, when?: string, state?: string, mode?: string, only?: boolean}} options
 * @returns {Promise<unknown>}
 */
async function swappedThingValue(e, slug, thing, value, options) {
  // A pasted one-argument form (`'pill: corners'`, `'red = background-color
  // on card'`, `'{"red": "background-color"}'`) is checked as the setting,
  // value and scope the one entry reader reads from it, as a typed pair is.
  const typedThing = thing;
  if (value == null || String(value).trim() === '') {
    const entry = normalizeEntry(String(thing ?? ''), value);
    if (entry.pasted || entry.thing !== String(thing ?? '').trim()) {
      thing = entry.thing;
      value = entry.value;
      const s = entry.scope ?? {};
      options = {
        ...options,
        ...(s.on && !options.on ? {on: s.on} : {}),
        ...(s.only && !options.only ? {only: true} : {}),
        ...(s.when && !options.when ? {when: s.when} : {}),
        ...(s.state && !options.state ? {state: s.state} : {}),
        ...(s.mode && !options.mode ? {mode: s.mode} : {}),
      };
    }
  }
  // The thing named no setting, or the value names one itself (`neutral
  // base`: a color dial given the base dial's name).
  if (
    !(e instanceof AstryxError) ||
    !value ||
    !(
      e.code === E.ERR_THEME_UNKNOWN_THING ||
      (DIALS[value.trim().toLowerCase()] && e.code === E.ERR_THEME_BAD_VALUE) ||
      // A scope refused first (a part, state or mode typo) while the
      // setting and its value are in the other order.
      maybeSwapped(String(thing), String(value))
    )
  )
    return e;
  const swapped = await swappedLines(slug, thing, value, options);
  if (!swapped) return e;
  // How for the value typed as the setting answers nothing: left out.
  const howTyped = [thing, typedThing].map(
    w => `${P} how ${quoteCommandArgument(String(w))}`,
  );
  e.suggestions = [
    ...swapped,
    ...(e.suggestions ?? []).filter(
      x => !swapped.some(y => y.name === x.name) && !howTyped.includes(x.name),
    ),
  ];
  return e;
}

/**
 * Whether a setting and a value may be in the other order: the value is
 * shaped like a setting's name (a dial, a token, a property) and the thing
 * names no dial or token. Set itself says whether the swapped line works.
 * @param {string} thing
 * @param {string} value
 */
function maybeSwapped(thing, value) {
  const t = thing.trim().toLowerCase();
  return (
    // (A property's name may be typed with spaces: `background color`.)
    /^(--)?[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*){0,2}$/i.test(value.trim()) &&
    !DIALS[t] &&
    !t.startsWith('--')
  );
}

/**
 * The same set with the setting and the value in the other order, checked
 * by set with the scope typed, as the lines that carry it out (a step such
 * as an install first); null when set does not take it, or the line does
 * not carry the thing typed as its value (the one gate).
 * @param {string} slug
 * @param {string} thing
 * @param {string} value
 * @param {{cwd?: string, on?: string, when?: string, state?: string, mode?: string, only?: boolean}} options
 * @returns {Promise<import('../../foundation/response/base').Suggestion[] | null>}
 */
async function swappedLines(slug, thing, value, options) {
  if (!slugOk(slug)) return null;
  const line = `${P} set ${slug} ${[
    value,
    thing,
    ...(options.on ? ['--on', options.on] : []),
    ...(options.when ? ['--when', options.when] : []),
    ...(options.state ? ['--state', options.state] : []),
    ...(options.mode ? ['--mode', options.mode] : []),
  ]
    .map(w => quoteCommandArgument(String(w)))
    .join(' ')}${options.only ? ' --only' : ''}`;
  const followed = await followChangeLine(
    'set',
    slug,
    line,
    options.cwd ?? process.cwd(),
  );
  // The swapped reading holds only when set takes the value typed as the
  // setting, with the scope typed, and the line carries the thing typed
  // as its value: never a sample command from a refusal of the swapped
  // line (`bold` is no setting, and no part was named).
  const read = readSetLine(followed.line, slug);
  // The setting typed as the value, or the one name it is a typo of (set's
  // own repair of `cornres`): the swap of a misspelled name is still a swap.
  const typedName = String(value).trim().toLowerCase();
  if (
    !read ||
    (read.thing.toLowerCase() !== typedName &&
      // A misspelled name read as another carries the value as typed.
      (!typoNear(typedName, read.thing.toLowerCase()) ||
        read.value.toLowerCase() !== String(thing).trim().toLowerCase())) ||
    // A part named, or none: set's own repair of a typed part may name it
    // as it is spelled, never a part where none was named.
    Boolean(read.flags?.on) !== Boolean(options.on) ||
    !allowedLine({offered: read.value, typed: String(thing), thing: read.thing})
  )
    return null;
  const lines = readyLines(
    followed,
    `do this instead: ${read.thing} is the setting and ${thing} its value`,
  );
  return lines.length ? lines : null;
}

/**
 * The theme and the context a line is checked against (set's own check, in
 * memory), a saved entry not checked while the theme is read; null when
 * the theme does not load.
 * @param {string} cwd
 * @param {string} slug
 * @param {Partial<import('./_settings.mjs').Setting>} [skip]
 */
async function loadedForCheck(cwd, slug, skip) {
  try {
    const data = loadTheme(cwd, slug, skip);
    const ctx = /** @type {import('./_settings.mjs').Ctx} */ (
      await context(cwd)
    );
    ctx.base = await baseResolved(ctx.project, data.like);
    return {data, ctx};
  } catch {
    return null;
  }
}

/**
 * What a whole-theme change leaves out, by the census, each with the lines
 * that reach it, one per part: corners leave the parts the theme gives
 * corners of their own as they are; square corners leave the parts drawn as
 * pills round (they read --radius-full); a wider or narrower
 * --border-width does not reach the surfaces that draw no border or a
 * fixed line of their own, and moves every divider's rule with it.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} sub
 * @param {import('./_settings.mjs').Setting} s
 * @returns {Array<{note: string, run: string[]}>}
 */
function leftOutParts(ctx, slug, data, sub, s) {
  if (sub !== 'set' || s.on || s.when || s.state) return [];
  const C = ctx.C;
  const has = (/** @type {string} */ p) => ctx.project.target.has(p);
  /** @type {Array<{note: string, run: string[]}>} */
  const out = [];
  // Whole-theme corners never reach a part the theme gives corners of its
  // own (border-radius 12px --on dialog, corners pill --on button): those
  // parts are named as kept, with the lines that hand them back to the
  // dial.
  if (s.source === 'dial' && s.thing === 'corners') {
    const own = data.settings.filter(
      x =>
        x.on &&
        !x.state &&
        (x.thing === 'corners' ||
          /^border-(?:(?:top|bottom)-(?:left|right)-|(?:start|end)-(?:start|end)-)?radius$/.test(
            String(x.thing),
          )),
    );
    const parts = [...new Set(own.map(x => String(x.on)))];
    if (parts.length)
      out.push({
        note: `${parts.join(', ')} ${parts.length > 1 ? 'keep their' : 'keeps its'} own corners (set on ${parts.length > 1 ? 'them' : 'it'} in this theme), which the corners dial does not change; ${own.length > 1 ? 'these hand them' : 'this hands it'} back to the dial:`,
        run: own.map(x => `${P} undo ${slug} ${undoArgs(x)}`),
      });
  }
  if (
    s.source === 'dial' &&
    s.thing === 'corners' &&
    ['square', '0px'].includes(cornersPlain(String(s.value)) ?? '') &&
    !data.settings.some(x => x.thing === '--radius-full' && !x.on)
  ) {
    const pills = pillParts(C).filter(has);
    // On a Core that draws a radio's circle with the pill token, the radio
    // marks keep it at Core's value (pillDrawnRadios).
    const radios = pillDrawnRadios(C).filter(has);
    const round = String(
      ctx.project.core.tokenDefaults?.['--radius-full'] ?? '9999px',
    );
    /** @param {string} m */
    const only = m =>
      !FAMILIES[m] && AUTO_SPREAD.includes(familyOf(m) ?? '') ? ' --only' : '';
    if (pills.length)
      out.push({
        note: `the parts drawn as pills stay round (${pills.join(', ')}): they read --radius-full, which corners leaves as it is; ${radios.length ? `these square them and keep the radio marks round (${radios.join(', ')})` : 'this squares them'}:`,
        run: [
          `${P} set ${slug} --radius-full 0px`,
          ...radios.map(
            m => `${P} set ${slug} --radius-full ${round} --on ${m}${only(m)}`,
          ),
        ],
      });
  }
  if (s.source === 'token' && s.thing === '--border-width') {
    const line = quoteCommandArgument(`${s.value} solid var(--color-border)`);
    // The same frames show's missed list has (only parts that draw a box,
    // scoped to the variants that do); none for a width of zero, which
    // draws no border anywhere.
    const zero = /^0(?:px|rem|em)?$/.test(String(s.value).trim());
    const frames = zero
      ? []
      : borderFrames(ctx, data, `${s.value} solid var(--color-border)`);
    const bare = frames.map(x => x.part);
    if (frames.length)
      out.push({
        note: `--border-width does not reach the surfaces that draw no border or a fixed line of their own (${bare.join(', ')}); these give each one:`,
        run: frames.flatMap(x =>
          x.steps.map(
            st =>
              `${P} set ${slug} border ${quoteCommandArgument(st.value)} --on ${st.on}${st.when ? ` --when ${st.when}` : ''}`,
          ),
        ),
      });
    const own = String(
      ctx.project.core.tokenDefaults?.['--border-width'] ?? '1px',
    );
    const pinned = (/** @type {string} */ p) =>
      data.settings.some(x => x.thing === '--border-width' && x.on === p);
    const dividers = dividerParts(C).filter(
      p => has(p) && !bare.includes(p) && !pinned(p),
    );
    if (dividers.length && String(s.value).trim() !== own)
      out.push({
        note: `the dividers draw their rules at --border-width too, so they are ${s.value} now (${dividers.join(', ')}); these keep each at ${own}:`,
        run: dividers.map(
          p => `${P} set ${slug} --border-width ${own} --on ${p}`,
        ),
      });
    const boxed = (/** @type {string} */ p) =>
      data.settings.some(
        x => x.on === p && x.state === 'selected' && /^border/.test(x.thing),
      );
    const selected = zero
      ? []
      : selectedBoxes(C).filter(p => has(p) && !boxed(p));
    if (selected.length)
      out.push({
        note: `the parts that draw a box only when selected draw no border (${selected.join(', ')}); these give each one there:`,
        run: selected.map(
          p => `${P} set ${slug} border ${line} --on ${p} --state selected`,
        ),
      });
    const lines = indicatorLines(C).filter(
      x =>
        has(x.part) &&
        !data.settings.some(y => y.on === x.part && y.thing === x.side),
    );
    if (lines.length && String(s.value).trim() !== own)
      out.push({
        note: `the indicator lines keep their own thickness (${lines.map(x => x.part).join(', ')}); these draw each at ${s.value}:`,
        run: lines.map(
          x => `${P} set ${slug} ${x.side} ${s.value} --on ${x.part}`,
        ),
      });
  }
  return out;
}

/**
 * A saved entry's thing and value as set reads them typed: the thing put
 * right (normalizeEntry), a value saved inside the thing (`corners: pill`,
 * or `corners pill` with an empty value, as set takes one argument), and
 * the flags saved inside the value (`red --on card`), which name the
 * entry's scope when it has none of its own.
 * @param {string} thing
 * @param {string} value
 * @returns {{thing: string, value: string, scope: {on?: string, when?: string, state?: string, mode?: string}}}
 */
function savedEntryRead(thing, value) {
  const entry = normalizeEntry(thing, value);
  let t = String(entry.thing);
  let v = String(entry.value ?? '');
  if (!v.trim()) {
    const pair = /^\s*(\S+)\s+(.+?)\s*$/.exec(t);
    if (pair) {
      t = pair[1];
      v = pair[2];
    }
  }
  /** @type {{on?: string, when?: string, state?: string, mode?: string}} */
  const scope = {};
  v = v
    .replace(/\s+--(on|when|state|mode)(?:\s+|=)(\S+)/g, (_, flag, word) => {
      scope[/** @type {'on' | 'when' | 'state' | 'mode'} */ (flag)] = word;
      return '';
    })
    .trim();
  return {thing: t, value: v, scope};
}

/**
 * A refusal about what the settings file holds, as every command gives it
 * (set, undo, show, compile): its lines checked (against the theme as loaded
 * when there is one), and set's repair for a damaged saved value beside the
 * undo. The one path for saved damage.
 * @param {unknown} e
 * @param {string} slug
 * @param {string} cwd
 * @param {{ctx?: import('./_settings.mjs').Ctx, data?: import('./_settings.mjs').ThemeData}} [seen]
 * @returns {Promise<unknown>}
 */
async function savedDamageRefusal(e, slug, cwd, seen = {}) {
  return withSavedRepair(
    seen.ctx
      ? vetSuggestions(e, seen.ctx, slug, /** @type {any} */ (seen.data))
      : await vetLoadRefusal(e, cwd, slug),
    slug,
    cwd,
  );
}

/**
 * A refusal of a saved entry whose value the editor no longer accepts,
 * with the repair `set` offers for that value as typed (a typo, a unit, a
 * label read as set reads them) beside the undo: the line is followed as
 * set takes it, with the saved entry not checked while the theme is read,
 * and offered only when it carries the saved value (the one gate).
 * @param {unknown} e
 * @param {string} slug
 * @param {string} cwd
 */
async function withSavedRepair(e, slug, cwd) {
  const bad = /** @type {any} */ (e)?.damaged;
  // The value as set reads a typed one: text, or a number written as JSON
  // (`8` on corners is the 8 typed).
  let saved =
    typeof bad?.value === 'string'
      ? bad.value
      : typeof bad?.value === 'number' && Number.isFinite(bad.value)
        ? String(bad.value)
        : null;
  if (
    !(e instanceof AstryxError) ||
    !bad ||
    saved == null ||
    ['mode', 'base'].includes(bad.thing)
  )
    return e;
  // The entry as set reads a typed one: the thing (`CORNERS`, `corners `
  // are corners), a value saved inside the thing (`corners: pill`,
  // `corners pill`), and flags saved inside the value (`red --on card`),
  // which go with the entry's own scope.
  const read = savedEntryRead(String(bad.thing), saved);
  const thing = read.thing;
  saved = read.value;
  // The scope the saved value names, where the entry has none of its own.
  /** @type {any} */
  const scoped = {...bad};
  for (const [k, v] of Object.entries(read.scope)) scoped[k] ??= v;
  // A scope saved empty (`"mode": ""`) names no scope; one that is not
  // text (`"when": 5`, `"on": {}`) is damage, never read as a flag.
  /** Whether a damaged scope key (not text) was left out. */
  let droppedScope = false;
  for (const k of ['on', 'when', 'state', 'mode'])
    if (
      scoped[k] != null &&
      (typeof scoped[k] !== 'string' || !scoped[k].trim())
    ) {
      droppedScope ||= typeof scoped[k] !== 'string';
      delete scoped[k];
    }
  const line = `${P} set ${slug} ${setArgs({...scoped, thing}, saved)}`;
  // The lines set offers for the value, as for a typed one: each checked
  // as set checks it, and offered only when they carry the saved value
  // (the one gate; a family and its size may take two lines).
  // An entry whose own mode, source or `only` means nothing stops the
  // theme from loading at all: it is read as removed while its value is
  // checked, as its undo removes it.
  const without = entryDamage(bad) ? {...bad, removing: true} : bad;
  const loaded = await loadedForCheck(cwd, slug, without);
  if (!loaded) return e;
  // With a damaged scope left out, a line on the scope another saved entry
  // holds would replace that entry: only the undo is offered.
  if (
    droppedScope &&
    loaded.data.settings.some(
      x => keyOf(x) === keyOf({...scoped, thing, value: saved}),
    )
  )
    return e;
  /** @type {string[]} */
  let lines;
  try {
    checkSetting(
      loaded.ctx,
      slug,
      structuredClone(loaded.data),
      thing,
      saved,
      {
        on: scoped.on,
        when: scoped.when,
        state: scoped.state,
        mode: scoped.mode,
      },
      false,
    );
    lines = [line];
  } catch (x) {
    if (!(x instanceof AstryxError)) throw x;
    lines = (x.suggestions ?? [])
      .map(y => y.name)
      .filter(n => n.startsWith(`${P} set ${slug} `));
  }
  /** @type {string[]} */
  const working = [];
  for (const l of lines) {
    const followed = await followChangeLine('set', slug, l, cwd, without);
    if (!followed.why) working.push(followed.line);
  }
  const reads = working.map(l => {
    const read = readSetLine(l, slug);
    return read
      ? readsTyped({
          offered: read.value,
          typed: saved,
          thing: read.thing,
          typedThing: thing,
        })
      : false;
  });
  const covered = coversTyped(reads, saved, thing);
  const kept = working.filter(
    (_, i) =>
      reads[i] === true ||
      (reads[i] && typeof reads[i] === 'object' && covered),
  );
  if (!kept.length) return e;
  const list = e.suggestions ?? [];
  // A set line the refusal already offers (the value cleaned) stands.
  if (list.some(x => x.name.startsWith(`${P} set ${slug} `))) return e;
  const at = list.findIndex(x => x.name.startsWith(`${P} undo ${slug} `));
  // Each line as the user will run it: set skips only the saved setting
  // its own line names. One that replaces the damaged entry works alone;
  // any other works only once the undo above removed it, and says so.
  /** @type {Array<{name: string, reason: string}>} */
  const steps = [];
  for (const name of kept) {
    const read = readSetLine(name, slug);
    // The setting the line names, by its scope: what set skips.
    /** @type {{thing: string, axis?: string, on?: string, when?: string, state?: string, mode?: 'light' | 'dark'} | undefined} */
    const target = read
      ? {
          thing: read.thing,
          // A headings word sets one half: the tracking for a tracking word,
          // else the weight (what set replaces).
          ...(read.thing === 'headings'
            ? {
                axis:
                  HEADING_TRACKING[String(read.value).toLowerCase()] !==
                  undefined
                    ? 'tracking'
                    : 'weight',
              }
            : {}),
          ...(read.flags.on ? {on: String(read.flags.on)} : {}),
          ...(read.flags.when ? {when: String(read.flags.when)} : {}),
          ...(read.flags.state ? {state: String(read.flags.state)} : {}),
          ...(read.flags.mode === 'light' || read.flags.mode === 'dark'
            ? {mode: read.flags.mode}
            : {}),
        }
      : undefined;
    const alone = await followChangeLine('set', slug, name, cwd, target);
    // As run: the theme loads with only that setting skipped, and no other
    // saved setting is refused (the stored checks set runs).
    const run = await loadedForCheck(cwd, slug, target);
    const passes =
      run != null &&
      target != null &&
      storedProblems(run.ctx, slug, run.data, target).length === 0;
    steps.push({
      name,
      reason:
        passes && !alone.why && alone.line === name
          ? 'or set the value it holds, as set reads it'
          : at >= 0
            ? 'then this, once the undo above has removed that setting'
            : 'then this, once that setting is removed',
    });
  }
  e.suggestions = [...list.slice(0, at + 1), ...steps, ...list.slice(at + 1)];
  return e;
}

/**
 * The lines that carry out a `new` the CLI builds (words of a value read
 * back into it): the line when new takes it, else what new's own refusal
 * of it offers, vetted as every offered new line is. new's checks only:
 * nothing is written.
 * @param {string} line the whole command, `astryx experimental theme editor new <theme> …`
 * @param {string} name
 * @param {import('./theme-edit.type.mjs').ThemeEditNewOptions} options
 * @returns {Promise<import('../../foundation/response/base').Suggestion[]>}
 */
export async function checkedNewLines(line, name, options) {
  try {
    await newTheme(name, options, {check: true});
    return [{name: line, reason: 'do this instead'}];
  } catch (e) {
    const vetted = await vetNewLines(
      e,
      options.cwd ?? process.cwd(),
      options.settings ?? {},
      options.like,
    );
    if (vetted instanceof AstryxError) return vetted.suggestions ?? [];
    throw vetted;
  }
}

/**
 * The lines that carry out a `show` the CLI builds: the line when show's
 * section check takes it, else what that check's refusal offers (the
 * other options kept). show's checks only: nothing is written.
 * @param {string} line the whole command, `astryx experimental theme editor show <theme> …`
 * @returns {import('../../foundation/response/base').Suggestion[]}
 */
export function checkedShowLines(line) {
  const words = splitCommand(line.slice(`${P} show `.length));
  if (!line.startsWith(`${P} show `) || !words?.length) return [];
  const [theme, ...rest] = words;
  const at = rest.indexOf('--section');
  const section = at >= 0 ? rest[at + 1] : undefined;
  const others = rest
    .filter((_, j) => at < 0 || (j !== at && j !== at + 1))
    .map(w => quoteCommandArgument(w))
    .join(' ');
  try {
    checkSection(section, theme, others ? ` ${others}` : '');
    return [{name: line, reason: 'do this instead'}];
  } catch (e) {
    if (!(e instanceof AstryxError)) throw e;
    return e.suggestions ?? [];
  }
}

/**
 * A `set` or `undo` command line as set or undo takes it (a repair either
 * offers folded in, see followChangeLine), or null when it is refused with
 * no repair: the check every offered line passes, for lines the CLI builds
 * (a flag written with a value).
 * @param {'set' | 'undo'} sub
 * @param {string} line the whole command, `astryx experimental theme editor set <theme> …`
 * @param {string} cwd
 * @returns {Promise<string | null>}
 */
export async function checkedChangeLine(sub, line, cwd) {
  const slug = splitCommand(line.slice(`${P} ${sub} `.length))?.[0];
  if (!line.startsWith(`${P} ${sub} `) || !slug) return null;
  const followed = await followChangeLine(sub, slug, line, cwd);
  if (!followed.why) return followed.line;
  // A set refused with the setting and value in the other order: set's
  // own swap repair, as set gives it when typed so.
  const read = sub === 'set' ? readSetLine(line, slug) : null;
  if (!read?.value || !maybeSwapped(read.thing, read.value)) return null;
  const swapped = await swappedLines(slug, read.thing, read.value, {
    ...read.flags,
    cwd,
  });
  return swapped?.length === 1 ? swapped[0].name : null;
}

/**
 * The lines that carry out a followed line: itself when it works; when its
 * own refusal offers it after a step (an install), that step and then the
 * line; else nothing.
 * @param {{line: string, why: string | null, next?: import('../../foundation/response/base').Suggestion[]}} followed
 * @param {string} reason
 * @returns {import('../../foundation/response/base').Suggestion[]}
 */
function readyLines(followed, reason) {
  if (!followed.why) return [{name: followed.line, reason}];
  const at = (followed.next ?? []).findIndex(x => x.name === followed.line);
  return at > 0
    ? [
        ...(followed.next ?? []).slice(0, at),
        {
          name: followed.line,
          reason: `then ${reason.replace(/^do this instead: /, '')}`,
        },
      ]
    : [];
}

/**
 * A refused theme name when the theme was typed after the setting (`set
 * --color-accent '#123457' t`): the same command with the theme first,
 * checked by that command, comes first, and no `new` of the setting's name
 * is offered.
 * @param {unknown} e
 * @param {'set' | 'undo'} sub
 * @param {Array<string | undefined>} words the positionals as typed
 * @param {{cwd?: string, on?: string, when?: string, state?: string, mode?: string, only?: boolean}} options
 * @returns {Promise<unknown>}
 */
async function swappedOrder(e, sub, words, options) {
  if (
    !(e instanceof AstryxError) ||
    (e.code !== E.ERR_INVALID_ARGUMENT && e.code !== E.ERR_UNKNOWN_THEME)
  )
    return e;
  const cwd = options.cwd ?? process.cwd();
  let [first, ...rest] = words.map(w => (w == null ? '' : String(w)));
  if (slugOk(first) && fs.existsSync(themeFiles(cwd, first).settings)) return e;
  // The theme typed as an option (`--theme t`, `--theme=t`): the option word
  // is no word of the command, and the words after the theme are read as
  // the command reads them (a set's thing, then its value).
  const asOption = /^--?theme(?:=(.*))?$/i.exec(first);
  if (asOption) {
    rest = asOption[1] ? [asOption[1], ...rest] : rest;
    first = '';
  }
  const at = rest.findIndex(
    w => slugOk(w) && fs.existsSync(themeFiles(cwd, w).settings),
  );
  if (at < 0) return e;
  const theme = rest[at];
  let moved = [first, ...rest.filter((_, i) => i !== at)].filter(w => w !== '');
  if (asOption && sub === 'set' && moved.length === 1 && /\s/.test(moved[0])) {
    const [thing, ...value] = moved[0].trim().split(/\s+/);
    moved = [thing, value.join(' ')];
  }
  const flags = [
    ...(options.on ? ['--on', options.on] : []),
    ...(options.when ? ['--when', options.when] : []),
    ...(options.state ? ['--state', options.state] : []),
    ...(options.mode ? ['--mode', options.mode] : []),
  ];
  // The line with the theme first, as set or undo checks it; for a set
  // whose other two words are also in the other order, the line with those
  // swapped too. Only a line that works is offered.
  const lineOf = (/** @type {string[]} */ ws) =>
    `${P} ${sub} ${theme} ${[...ws, ...flags]
      .map(w => quoteCommandArgument(w))
      .join(' ')}${options.only ? ' --only' : ''}`;
  let followed = await followChangeLine(sub, theme, lineOf(moved), cwd);
  if (followed.why && sub === 'set' && moved.length === 2)
    followed = await followChangeLine(
      sub,
      theme,
      lineOf([moved[1], moved[0]]),
      cwd,
    );
  const ready = readyLines(
    followed,
    `do this instead: ${theme} is the theme, so it comes first`,
  );
  // With the theme first and still refused, that refusal's reason and its
  // own next commands: never a `new` of the setting's name.
  if (!ready.length && followed.why)
    e.message = `${e.message.replace(/\s*Nothing was changed\.$/, '')} With ${theme} first: ${followed.why}. Nothing was changed.`;
  e.suggestions = [
    ...(ready.length
      ? ready
      : (followed.next ?? []).filter(x => !x.name.startsWith(`${P} new `))),
    ...(e.suggestions ?? []).filter(
      x => x.name !== followed.line && !x.name.startsWith(`${P} new `),
    ),
  ];
  return e;
}

/**
 * Refuse a theme whose saved exact tokens the type rules no longer take,
 * naming the undo that removes the one that fails.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string | {thing: string, on?: string, when?: string, state?: string, mode?: string}} [skip]
 */
function refuseStoredTokens(ctx, slug, data, skip) {
  const bad = storedProblems(ctx, slug, data, skip);
  if (!bad.length) return;
  // A repair offers only the value it holds, cleaned: never a stock value
  // the saved setting did not hold.
  for (const b of bad) {
    if (
      b.fix &&
      !allowedLine({
        offered: String(b.fix),
        typed: String(b.setting.value),
        thing: b.setting.thing,
        mode: b.setting.mode ?? '',
      })
    )
      delete b.fix;
    // A light and a dark color saved as one (`red / blue`) is that pair.
    const pair =
      !b.fix && isColorToken(b.setting.thing)
        ? colorPair(String(b.setting.value))
        : null;
    if (pair && !colorProblem(pair.light) && !colorProblem(pair.dark))
      b.fix = `light-dark(${pair.light}, ${pair.dark})`;
  }
  const found = bad.length === 1 ? bad[0] : null;
  // A clean value is offered only when set takes it, so the line works.
  const takes = (/** @type {typeof found} */ b) => {
    if (!b?.fix) return true;
    // A value whose only fault was curly quotes around it: without them,
    // when set takes that (`“#e11d48”` is #e11d48).
    const bare = /^(["'])(.*)\1$/.exec(b.fix)?.[2];
    if (
      bare &&
      b.setting.source === 'token' &&
      !/font|content/.test(b.setting.thing)
    ) {
      const was = b.fix;
      b.fix = bare;
      if (takesOne(b)) return true;
      b.fix = was;
    }
    return takesOne(b);
  };
  const takesOne = (/** @type {typeof found} */ b) => {
    if (!b?.fix) return true;
    try {
      checkSetting(
        ctx,
        slug,
        {...data, settings: data.settings.filter(x => x !== b.setting)},
        b.setting.thing,
        b.fix,
        {
          on: b.setting.on,
          when: b.setting.when,
          state: b.setting.state,
          mode: b.setting.mode,
        },
        false,
      );
      return true;
    } catch {
      return false;
    }
  };
  const one = found && takes(found) ? found : null;
  // One saved entry with no line of its own: the entry rides on the
  // refusal, and the change offers set's repair for its value beside the
  // undo (withSavedRepair).
  try {
    refuse(
      E.ERR_THEME_INVALID,
      `themes/${slug}/${slug}.settings.json: ${bad
        .map(
          b =>
            `${describe(b.setting)} ${b.scope ? 'applies where the editor does not accept it' : 'holds a value the editor no longer accepts'} (${b.why})`,
        )
        .join('; ')}.`,
      {
        // Each undo runs while the others are still saved: an undo of one
        // setting is never refused for another.
        run: [
          ...bad
            .slice(0, 5)
            .map(b => `${P} undo ${slug} ${undoArgs(b.setting)}`),
          // A value to set only for a token whose stored value has the wrong
          // type; any other thing `set` would refuse, or read as a dial.
          ...(one &&
          one.fix &&
          !one.scope &&
          one.setting.source === 'token' &&
          ctx.C.isToken(one.setting.thing)
            ? [
                // The value the check suggests for this value, else a stock
                // one of the token's type.
                `${P} set ${slug} ${one.setting.thing} ${quoteCommandArgument(String(one.fix))}${one.setting.mode ? ` --mode ${one.setting.mode}` : ''}`,
              ]
            : one && one.fix && one.setting.source === 'dial'
              ? [
                  `${P} set ${slug} ${one.setting.thing} ${quoteCommandArgument(one.fix)}`,
                ]
              : []),
        ],
      },
    );
  } catch (e) {
    throw Object.assign(/** @type {object} */ (e), {
      aboutSaved: true,
      ...(found && !(one && one.fix) ? {damaged: found.setting} : {}),
    });
  }
}

/**
 * For `compile`: a refusal of what the settings file holds, with the lines
 * every command gives it (the undo and set's repair).
 * @param {AstryxError} e
 * @param {string} root
 * @param {string} slug
 * @returns {Promise<AstryxError>}
 */
export async function editorSavedRefusal(e, root, slug) {
  return /** @type {AstryxError} */ (await savedDamageRefusal(e, slug, root));
}

/**
 * For `compile`: the refusal `show` gives for saved settings the editor no
 * longer accepts, with the same lines (the undo and set's repair), or null.
 * @param {string} root
 * @param {string} slug
 * @returns {Promise<AstryxError | null>}
 */
export async function editorStoredRefusal(root, slug) {
  /** @type {{ctx?: import('./_settings.mjs').Ctx, data?: import('./_settings.mjs').ThemeData}} */
  const seen = {};
  try {
    seen.ctx = await context(root);
    seen.data = loadTheme(root, slug);
    refuseStoredTokens(seen.ctx, slug, seen.data);
    return null;
  } catch (e) {
    // The lines every command gives saved damage (the undo and set's
    // repair), as set and show give them.
    if (e instanceof AstryxError) {
      const repaired = await savedDamageRefusal(e, slug, root, seen);
      return repaired instanceof AstryxError ? repaired : e;
    }
    throw e;
  }
}

/**
 * A value as the build writes it (written-values' `writtenPrimitive`): a
 * BigInt as its digits, a boxed primitive (`new String('red')`) as its
 * primitive, each half of a pair too; any other value as it is.
 * @param {unknown} value
 * @returns {unknown}
 */
const asPrimitive = value =>
  Array.isArray(value) ? value.map(writtenPrimitive) : writtenPrimitive(value);

/** @type {WeakMap<object, Record<string, Record<string, unknown>>>} */
const coreSurfaces = new WeakMap();
/**
 * The tokens the project's Core sets on a media surface by itself (on dark
 * surfaces, the main text color reads --color-on-dark): the surface of a
 * theme that sets none.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} surface `onDark` or `onLight`
 * @returns {Record<string, unknown>}
 */
function coreSurfaceTokens(ctx, surface) {
  const core = ctx.project.core;
  let surfaces = coreSurfaces.get(core);
  if (!surfaces) {
    /** @type {any} */
    let bare = null;
    try {
      bare = core.defineTheme({name: 'astryx-defaults'});
    } catch {
      // A Core that cannot define a bare theme sets nothing known here.
    }
    surfaces = {
      onDark: bare?.__onDark?.tokens ?? {},
      onLight: bare?.__onLight?.tokens ?? {},
    };
    coreSurfaces.set(core, surfaces);
  }
  return surfaces[surface] ?? {};
}

/**
 * The token values the theme's own source gives that `set` refuses (a
 * radius of `banana`, a color of `12px`), each with why and the line of
 * the file that sets it; checked with the very rules `set` uses.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {Promise<Array<{token: string, key?: string, value: string, why: string, run?: string[], line: number | null, file?: string | null}>>}
 */
async function ownTokenProblems(ctx, slug, data) {
  const {cwd} = ctx.project;
  /** @type {Array<{token: string, key?: string, value: string, why: string, run?: string[], line: number | null, file?: string | null}>} */
  const out = [];
  const known = ctx.project.core.tokenDefaults;
  /**
   * @param {string} token
   * @param {string} value
   * @param {ReadonlySet<string>} [reads] custom properties the theme sets where the value is read
   * @param {Record<string, string>} [flags] set's flags, such as the part a property is on
   * @param {Record<string, unknown>} [element] the custom properties set on the element the value is set on, when that is not the theme's root
   * @returns {string | null}
   */
  const refused = (token, value, reads, flags = {}, element = undefined) => {
    try {
      checkSetting(
        ctx,
        slug,
        {...data, settings: []},
        token,
        value,
        flags,
        false,
        {
          reads,
          element,
        },
      );
      return null;
    } catch (e) {
      if (!(e instanceof AstryxError)) throw e;
      return e.message.replace(/ Nothing was changed\.$/, '');
    }
  };
  /** The file an entry is in, as the project names it; null for the theme file. @param {{file?: string}} e */
  const fileOf = e => (e.file ? path.relative(cwd, e.file) : null);
  /** @param {{line: number | null, file?: string}} e */
  const atOf = e => ({line: e.line, file: fileOf(e)});
  // Every value is judged as the source gives it to defineTheme(), the
  // module evaluated as a build evaluates it (an import, an expression, a
  // spread or a computed key is its value), in every place a build writes
  // tokens from: the page's tokens, a part's blocks, onDark and onLight,
  // adaptation rules, and the typography. The source's syntax is read to
  // name the file and line that hold each value, and for what evaluation
  // erases: a `tokens` key given twice (JavaScript keeps the last) and a
  // [light, dark] pair with other than two values written in the file.
  const entries = ownTokenEntries(cwd, slug).filter(e => !e.overridden);
  const tokensLine = entries.find(e => e.kind === 'unresolved')?.line ?? null;
  /** Where a page token's value comes from. @param {string} token */
  const whereOf = token => {
    const e = entries.find(
      x => x.token === token && x.kind !== 'scoped' && x.kind !== 'chain',
    );
    return e ? atOf(e) : {line: tokensLine, file: null};
  };
  /** A scope path as the file writes it (`adaptations.rules[0].value`). @param {string[]} path */
  const labelOf = path => path.join('.').replace(/\.(\d+)(?=\.|$)/g, '[$1]');
  /** Where a field or a block's own key is written. @param {string} scope @param {string} key */
  const whereKey = (scope, key) => {
    const e = entries.find(
      x =>
        (x.kind === 'field' || x.kind === 'key') &&
        (x.scope ?? '') === scope &&
        x.key === key,
    );
    return e ? atOf(e) : null;
  };
  /** Where a scoped token's value comes from. @param {string} scope @param {string} token */
  const whereIn = (scope, token) => {
    const e =
      entries.find(
        x => x.kind === 'scoped' && x.scope === scope && x.token === token,
      ) ??
      entries.find(x => x.kind === 'scope' && x.key === scope.split('.')[0]);
    return e ? atOf(e) : {line: null, file: null};
  };
  for (const e of entries) {
    if (e.kind === 'duplicate')
      out.push({
        token: 'tokens',
        value: '',
        why: `defineTheme is given tokens twice (lines ${(e.lines ?? []).join(' and ')}); the build keeps only the last, so the first does nothing: merge them into one`,
        ...atOf(e),
      });
    else if (e.notToken) {
      const key = e.key.replace(/^(["'`])(.*)\1$/, '$2');
      out.push({
        token: key,
        value: '',
        why: `${key} is no token: a token name starts with -- (such as --color-accent), and the build writes any other key as a CSS declaration on the theme's root, which styles every element; for one part, set it as a property on that part (\`${P} set ${slug} ${key} <value> --on <part>\`)`,
        ...atOf(e),
      });
    } else if (
      e.token?.startsWith('--_') &&
      e.kind !== 'scoped' &&
      e.kind !== 'chain'
    )
      out.push({
        token: e.token,
        value: '',
        why: `${e.token} is a private variable (--_*), which Core sets itself, so the build refuses a theme that sets one: remove it`,
        ...atOf(e),
      });
    else if (
      e.kind === 'pair' &&
      e.token &&
      e.token in known &&
      (e.halves ?? []).length !== 2
    ) {
      const halves = e.halves ?? [];
      out.push({
        token: e.token,
        value: `[${halves.map(h => (h === undefined ? '…' : JSON.stringify(h))).join(', ')}]`,
        why: `a [light, dark] pair holds exactly two values in quotes, and this holds ${halves.length}; the build would write ${halves.length < 2 ? 'light-dark() with an undefined half' : 'the first two and drop the rest'}`,
        ...atOf(e),
      });
    }
  }
  // A private variable stops the build itself: nothing more to judge.
  if (out.some(b => b.token.startsWith('--_'))) return out;
  const loaded = await ownThemeInput(ctx, slug, data.like ?? null);
  const input = loaded?.input;
  if (!input || typeof input !== 'object') return out;
  const named = new Set(out.map(b => b.token));
  // Core refuses the input itself, naming the path of what it refuses
  // (`defineTheme("t").adaptations.rules[0].when.pointr is not
  // supported.`) or a local token by name: its message, at the line that
  // writes that path. A path the source does not have (a rule Core derives
  // from the typography) is Core's own: the source is judged on its own.
  const coreError = loaded?.error?.message ?? '';
  const corePath =
    /defineTheme\("[^"]*"\)((?:\.[A-Za-z_$][\w$]*|\[\d+\]|\["[^"]*"\])+) ([^\n]*)/.exec(
      coreError,
    );
  const coreLocal =
    /defineTheme\("[^"]*"\): local token "([^"]*)" ([^\n]*)/.exec(coreError);
  const coreSays = corePath
    ? {
        steps: [
          ...corePath[1].matchAll(
            /\.([A-Za-z_$][\w$]*)|\[(\d+)\]|\["([^"]*)"\]/g,
          ),
        ].map(m => /** @type {string} */ (m[1] ?? m[2] ?? m[3])),
        says: corePath[2],
      }
    : coreLocal
      ? {
          steps: ['localTokens', coreLocal[1]],
          says: `(a local token) ${coreLocal[2]}`,
        }
      : null;
  /** The input has every step of a path. @param {string[]} steps */
  const inInput = steps => {
    /** @type {any} */
    let node = input;
    for (const step of steps) {
      if (!node || typeof node !== 'object' || !Object.hasOwn(node, step))
        return false;
      node = node[step];
    }
    return true;
  };
  if (coreSays && inInput(coreSays.steps)) {
    const {steps} = coreSays;
    const key = /** @type {string} */ (steps.at(-1));
    const scope = steps.slice(0, -1).join('.');
    const at =
      whereKey(scope, key) ??
      (scope ? whereIn(scope, key) : null) ??
      whereKey('', String(steps[0]));
    out.push({
      token: labelOf(steps),
      key,
      value: '',
      why: `Core refuses the theme: ${labelOf(steps)} ${coreSays.says.replace(/\.+$/, '')}`,
      ...(at ?? {line: null, file: null}),
    });
  }

  /**
   * Why a token's value is refused, or null. Any token, a design token or
   * the theme's own, takes text or a pair of two texts; any other value
   * (null, a boolean, a number, a BigInt, a symbol, an object) is no text.
   * A design token's text is checked as `set` checks it, and only a color
   * takes a pair.
   * @param {string} token
   * @param {unknown} value
   * @param {string} file the file named in a pair's refusal
   * @param {ReadonlySet<string>} reads custom properties the theme sets where the value is read
   * @param {Record<string, unknown>} [element] the custom properties set on the element the token is set on, when that is not the theme's root (a surface's own)
   * @returns {string | null}
   */
  const judge = (token, value, file, reads, element = undefined) => {
    // A null token leaves it unset: the build writes it as it is and warns
    // at its line.
    if (value === null) return null;
    // A boxed primitive (`new String('red')`) is written as its primitive,
    // so it is judged as that.
    value = asPrimitive(value);
    const custom = !(token in known);
    if (Array.isArray(value)) {
      if (value.length !== 2 || value.some(h => typeof h !== 'string'))
        return nonTextMessage(ctx, slug, [token, value]);
      if (custom) return null;
      if (!isColorToken(token)) {
        const unitless =
          ctx.C.typeOf(token) === 'size' &&
          value.every(h => /^\d*\.?\d+$/.test(String(h).trim()));
        return unitless
          ? nonTextMessage(ctx, slug, [token, value.map(Number), 'unit'])
          : `${file} gives ${token} a [light, dark] pair, but only colors differ by mode: the build would write light-dark(), which browsers take only for colors; give it one value`;
      }
      for (const [i, h] of value.entries()) {
        const why = refused(token, String(h), reads, {}, element);
        if (why) return `its ${i === 0 ? 'light' : 'dark'} half: ${why}`;
      }
      return null;
    }
    if (typeof value !== 'string')
      return nonTextMessage(
        ctx,
        slug,
        value && typeof value === 'object'
          ? [token, value, 'object']
          : [token, value],
      );
    // A custom property of the theme's own passes its value on to what
    // reads it: a var() in it that reads nothing gives that nothing.
    if (custom) {
      const ref = unknownVarRef(value, known, token, reads);
      return ref
        ? `${token} passes its value on to what reads it: ${ref.message}`
        : null;
    }
    if (/^light-dark\(/i.test(value) && !isColorToken(token))
      return `${file} gives ${token} a [light, dark] pair, but only colors differ by mode: the build would write light-dark(), which browsers take only for colors; give it one value`;
    return refused(token, value, reads, {}, element);
  };
  /**
   * Why a part's CSS property value is refused, or null: text as `set`
   * checks it for that property; a number is written as it is, so it
   * stands only where the property takes a bare number; any other value is
   * no text.
   * @param {string} prop the property, as CSS names it
   * @param {unknown} value
   * @param {string} file
   * @param {ReadonlySet<string>} reads custom properties the theme sets where the value is read
   * @param {string | undefined} component the part, as the components map names it
   * @returns {string | null}
   */
  const judgeProperty = (prop, value, file, reads, component) => {
    value = asPrimitive(value);
    // A family list is read as set reads one for that part (a comma
    // missing before a generic family, a quoted generic, a dial word):
    // font-family's value, and the families a `font` shorthand names last.
    if (
      typeof value === 'string' &&
      (prop === 'font-family' || prop === 'font') &&
      component &&
      ctx.project.target.has(component)
    ) {
      const families = prop === 'font' ? fontShorthandFamilyList(value) : value;
      const why = families
        ? refused('font-family', families, reads, {on: component})
        : null;
      if (why)
        return prop === 'font'
          ? `font names the families "${families}" last, read as font-family: ${why}`
          : why;
    }
    // A var() of a custom property the theme's own page sets reads the
    // text it gives: the property must take that text there.
    if (typeof value === 'string')
      for (const m of value.matchAll(
        new RegExp(String.raw`var\(\s*(${CUSTOM_PROPERTY})\s*\)`, 'gi'),
      )) {
        const text = ownText.get(m[1]);
        if (
          text === undefined ||
          /\bvar\(/i.test(text) ||
          matchValue(prop, value.replace(m[0], text))
        )
          continue;
        return `${prop} does not take ${JSON.stringify(text)}, which ${m[1]} holds (${file} sets it), so the browser would drop it`;
      }
    if (typeof value === 'string')
      return propertyValueProblem(ctx, prop, value, known, reads);
    if (typeof value === 'number' && !Number.isFinite(value))
      return `${file} gives ${prop} ${value}, a number no CSS value holds (a computed value gone wrong, such as a division by zero), which the build writes as it is and the browser drops: give a CSS value in quotes`;
    if (typeof value === 'number')
      return matchValue(prop, String(value))
        ? null
        : `${file} gives ${prop} the number ${value}, which the build writes as it is (${prop}: ${value}) and ${prop} does not take, so the browser drops it; write it with a unit, such as '${value}px'`;
    return `${file} gives ${prop} the value ${describeValue(value)}, which is not text: a part's property is a CSS value in quotes, such as '4px'`;
  };
  /** @param {{line: number | null, file: string | null}} at */
  const fileName = at => at.file ?? `${slug}.theme.ts`;
  /** A value as the build writes it, when it is text. @param {unknown} v */
  const asWritten = v =>
    typeof v === 'string'
      ? v
      : Array.isArray(v) &&
          v.length === 2 &&
          v.every(h => typeof h === 'string')
        ? `light-dark(${v.join(', ')})`
        : '';
  /** The custom properties a block of tokens sets. @param {any} node */
  const varsIn = node =>
    node && typeof node === 'object' && !Array.isArray(node)
      ? Object.keys(node).filter(k => k.startsWith('--'))
      : [];
  /** The camelCase name of each CSS property, for a misspelled one. */
  const camelNames = () =>
    [...cssProperties()].map(p =>
      p.replace(/-([a-z])/g, (_m, c) => c.toUpperCase()),
    );
  /**
   * The part a components key names (`card`), or null when Core themes no
   * such part: Core reads a components key as the part's own key.
   * @param {string} name
   * @returns {string | null}
   */
  const targetKey = name => (ctx.project.target.has(name) ? name : null);
  /**
   * Every custom property a var() anywhere in the theme reads: a name it
   * reads is the theme's own helper, never a typo of another.
   * @type {Set<string>}
   */
  const readVars = new Set();
  /** @param {unknown} node @param {number} depth */
  const collectReads = (node, depth) => {
    if (typeof node === 'string')
      for (const m of node.matchAll(
        new RegExp(String.raw`var\(\s*(${CUSTOM_PROPERTY})`, 'g'),
      ))
        readVars.add(m[1]);
    else if (node && typeof node === 'object' && depth < 24)
      for (const v of Object.values(node)) collectReads(v, depth + 1);
  };
  collectReads(input, 0);
  /**
   * The text the theme's own page gives each custom property it sets (its
   * tokens and local tokens), for a part property that reads one.
   * @type {Map<string, string>}
   */
  const ownText = new Map(
    [
      ...Object.entries(input.tokens ?? {}),
      ...Object.entries(input.localTokens ?? {}),
    ].filter(
      (/** @type {[string, unknown]} */ [k, v]) =>
        typeof v === 'string' && !(k in known),
    ),
  );
  /**
   * The refusal for a key that holds null where the build reads a block.
   * @param {string} key @param {string} give what to give it instead
   */
  const nullBlock = (key, give) =>
    `${key} holds null, which the build cannot read as a block: give it ${give}, or remove it`;
  /**
   * Judge one block of what a theme gives: its tokens and local tokens,
   * its parts, its onDark and onLight surfaces, and each adaptation rule's
   * value, which is a block too. A var() reads the custom properties the
   * block and the blocks around it set.
   * @param {any} block
   * @param {string[]} path where the block is, as the file writes it
   * @param {Set<string>} around custom properties the blocks around it set
   * @param {(scope: string, key: string) => {line: number | null, file: string | null}} where
   * @param {string} prefix what names a value of this theme in a refusal
   */
  const judgeBlock = (block, path, around, where, prefix) => {
    if (!block || typeof block !== 'object') return;
    const reads = new Set([
      ...around,
      ...varsIn(block.tokens),
      ...varsIn(block.localTokens),
    ]);
    /**
     * @param {string[]} at
     * @param {string} key
     * @param {string} why
     * @param {string} [value]
     * @param {{line: number | null, file: string | null} | null} [loc] where it is written, when known
     */
    const refuse = (at, key, why, value = '', loc = null) => {
      const scope = at.join('.');
      const label = labelOf(at);
      out.push({
        token: `${prefix}${label ? `${label} ` : ''}${key}`.trim(),
        key,
        value,
        why,
        ...(loc ?? (at.length || prefix ? where(scope, key) : whereOf(key))),
      });
    };
    // A field the block's kind does not take (Core's own input fields, read
    // from its types): the build reads nothing from it.
    const surface =
      path.length > 0 && ['onDark', 'onLight'].includes(String(path.at(-1)));
    const takes =
      path.length === 0
        ? ctx.project.inputFields?.theme
        : surface
          ? ctx.project.inputFields?.surface
          : undefined;
    if (takes)
      for (const k of Object.keys(block)) {
        if (takes.includes(k)) continue;
        const near = nearest(
          k,
          takes.filter(f => !f.startsWith('__')),
        )[0];
        refuse(
          path,
          k,
          `${k} is no field ${path.length ? `${labelOf(path)} takes` : 'defineTheme takes'}, so the build reads nothing from it${near ? `; did you mean ${near}?` : ''}`,
          '',
          prefix ? null : whereKey(path.join('.'), k),
        );
      }
    /**
     * The variable Core sets on a component's own element that `k` names,
     * or, with `near`, the one it is a typo of. The element's own value
     * shadows one set anywhere else (the page, another part), so that
     * value never reaches the part.
     * @param {string} k @param {boolean} near
     */
    const shadowedPartVar = (k, near) => {
      const shadowed = (ctx.project.vars ?? []).filter(x =>
        coreElementVars(ctx).has(x.name),
      );
      if (!near) return shadowed.find(x => x.name === k);
      const closest = nearest(
        k,
        shadowed.map(y => y.name),
      )[0];
      return (
        shadowed.find(x => x.name === k) ??
        shadowed.find(x => x.name === closest)
      );
    };
    /**
     * Refuse a part variable set where its element's own value shadows it.
     * @param {string[]} at @param {string} k @param {unknown} v
     * @param {{name: string, component: string}} partVar
     * @param {string} where where the value is set, as the refusal says it
     */
    const refuseShadowed = (at, k, v, partVar, where) => {
      const key =
        [...ctx.project.target.values()].find(
          t => t.component === partVar.component,
        )?.key ?? partVar.component.toLowerCase();
      const typo = partVar.name !== k;
      refuse(
        at,
        k,
        `${typo ? `"${k}" is not a design token; did you mean ${partVar.name}? ` : ''}${partVar.name} is a variable ${partVar.component} sets on its own element, so a value ${where} never reaches it: set it on the part, components: {${key}: {base: {'${partVar.name}': ${JSON.stringify(asWritten(v) || '…')}}}}`,
        asWritten(v),
      );
    };
    /**
     * A custom property and its value, wherever a block sets one. An
     * undefined value is not set: the build writes nothing for it.
     * @param {string[]} at @param {string} k @param {unknown} v @param {Set<string>} here
     * @param {boolean} [designMap] a `tokens` map, which overrides design tokens
     */
    const token = (at, k, v, here, designMap = false) => {
      const loc = at.length || prefix ? where(at.join('.'), k) : whereOf(k);
      // A tokens map overrides design tokens; a name one typo from one is
      // that token misspelled, which the build writes as a property
      // nothing reads (the theme's own go in localTokens).
      if (designMap && !(k in known)) {
        const near = nearest(k, Object.keys(known))[0];
        if (near)
          return refuse(
            at,
            k,
            `"${k}" is not a design token, so the build writes a custom property nothing reads; did you mean ${near}? A custom property of the theme's own goes in localTokens`,
            asWritten(v),
          );
        // A name one typo from a part variable is that variable misspelled.
        const partVar = shadowedPartVar(k, true);
        if (partVar)
          return refuseShadowed(at, k, v, partVar, "in the page's tokens");
      }
      if (k.startsWith('--_'))
        return refuse(
          at,
          k,
          `${k} is a private variable (--_*), which Core sets itself, so the build refuses a theme that sets one: remove it`,
        );
      if (v === undefined) return;
      if (!at.length && !prefix && named.has(k)) return;
      // A surface's tokens resolve on the surface, where only what it sets
      // can loop back: the tokens Core sets there itself, under the theme's.
      const element =
        surface && !at.includes('components')
          ? {
              ...coreSurfaceTokens(ctx, String(path.at(-1))),
              ...(block.localTokens ?? {}),
              ...(block.tokens ?? {}),
            }
          : undefined;
      const why = judge(k, v, fileName(loc), here, element);
      if (why) refuse(at, k, why, asWritten(v));
    };
    /** @type {Record<string, unknown>} */
    const onElement = Object.fromEntries(
      ['localTokens', 'tokens'].flatMap(map =>
        block[map] && typeof block[map] === 'object'
          ? Object.entries(block[map])
          : [],
      ),
    );
    for (const map of ['tokens', 'localTokens']) {
      const m = block[map];
      if (!m || typeof m !== 'object') continue;
      // The exported theme's own tokens are named by token alone.
      const top = path.length === 0 && map === 'tokens';
      const at = top && !prefix ? [] : [...path, map];
      // Core's own copies, carried by a map spread from a defined theme's
      // tokens, are no write of the author's.
      const copies =
        map === 'tokens'
          ? derivedPrivateCopies(m, ctx.project.core?.defineTheme)
          : new Set();
      for (const [k, v] of Object.entries(m)) {
        if (copies.has(k)) continue;
        if (copies.size > 0 && k.startsWith('--_')) {
          refuse(at, k, spreadPrivateVarMessage(k, copies));
          continue;
        }
        // The theme's own names go in localTokens, so only a part
        // variable's exact name there is that variable.
        const partVar =
          map === 'localTokens' && v !== undefined
            ? shadowedPartVar(k, false)
            : undefined;
        if (partVar) {
          refuseShadowed(at, k, v, partVar, "in the page's localTokens");
          continue;
        }
        // Tokens and local tokens are set on one element: tokens that read
        // each other there have no value, whatever their names. A token
        // that reads only itself is judged with the theme's tokens, which
        // also follows the settings and the base theme.
        const cycle = customPropertyCycle(k, onElement);
        if (
          cycle &&
          (cycle.length > 2 ||
            (block.localTokens &&
              typeof block.localTokens === 'object' &&
              k in block.localTokens))
        ) {
          refuse(
            at,
            k,
            /** @type {string} */ (cycleProblem(k, onElement)),
            asWritten(v),
          );
          continue;
        }
        token(at, k, v, reads, map === 'tokens');
      }
    }
    /**
     * A part's style block: its style keys at depth 0, then the block of
     * `kind` each holds.
     * @param {any} node @param {string[]} at @param {Set<string>} outer @param {number} depth
     * @param {import('../theme/build/style-keys.mjs').PartBlock} [kind]
     */
    const part = (node, at, outer, depth, kind = 'style') => {
      if (!node || typeof node !== 'object' || depth > 12) return;
      const named = at[at.lastIndexOf('components') + 1];
      const component = named ? (targetKey(named) ?? undefined) : undefined;
      const target = component ? ctx.project.target.get(component) : undefined;
      // The public custom properties the part's component reads.
      const partVars = target
        ? (ctx.project.vars ?? []).filter(x => x.component === target.component)
        : [];
      // A var() on the part reads what the theme sets around it, and the
      // variables Core sets on the part's own element.
      const here = new Set([
        ...outer,
        ...varsIn(node),
        ...partVars
          .filter(x => coreElementVars(ctx).has(x.name))
          .map(x => x.name),
      ]);
      for (const [k, v] of Object.entries(node)) {
        // A style key's own value is judged with the part's entries.
        if (depth === 0 && (!v || typeof v !== 'object')) continue;
        // Inside a style key, a block under a pseudo-class's bare name is
        // that pseudo-class without its colon.
        if (
          depth > 0 &&
          v &&
          typeof v === 'object' &&
          /^[a-z-]+$/i.test(k) &&
          (CSS_PSEUDO_CLASSES.has(k.toLowerCase()) ||
            (target?.states ?? []).includes(k))
        ) {
          refuse(
            at,
            k,
            `${k} holds a block, and a pseudo-class starts with a colon: write it as ':${k}'`,
            '',
            whereKey(at.join('.'), k),
          );
          continue;
        }
        // A pseudo-class or pseudo-element one typo from one browsers know
        // (or a state the part takes), anywhere in the key's selector
        // chain, inside :not() and :is() too: that one misspelled, a rule
        // that never applies. A pseudo-element near none is judged with the
        // other keys the build cannot write.
        const typo = k.startsWith(':')
          ? pseudoTypo(k, target?.states ?? [])
          : null;
        if (typo) {
          refuse(
            at,
            k,
            `${typo.written} is no ${typo.element ? 'pseudo-element' : 'pseudo-class'} a browser knows, so the build writes a selector that never matches; did you mean ${typo.fixed}?`,
            '',
            whereKey(at.join('.'), k),
          );
          continue;
        }
        // A key the build cannot write as it is: a custom property whose
        // name it renames or CSS keeps, a pseudo key that is no single
        // selector or that the browser drops, a block where none nests, a
        // vendor property without its dash.
        const unwritable =
          depth === 0
            ? null
            : (partKeyProblem(k, v, kind) ??
              (k.startsWith('--')
                ? cycleProblem(
                    k,
                    Object.fromEntries(
                      Object.entries(node).filter(([n]) => n.startsWith('--')),
                    ),
                  )
                : null));
        if (unwritable) {
          const pseudo = k.startsWith(':');
          refuse(
            at,
            k,
            unwritable,
            pseudo ? '' : asWritten(v),
            pseudo ? whereKey(at.join('.'), k) : undefined,
          );
          continue;
        }
        if (k.startsWith('--') && component && v !== undefined) {
          const own = partVars.find(x => x.name === k);
          // Another component's variable that Core sets on that
          // component's own element: shadowed there, so it never applies.
          const other = own ? undefined : shadowedPartVar(k, false);
          if (other && other.component !== target?.component) {
            refuseShadowed(at, k, v, other, `on ${named}`);
            continue;
          }
          // A variable named for the part, one typo from a variable the
          // part reads, that nothing in the theme reads: that variable
          // misspelled. Any other is the theme's own helper.
          const near =
            !own && k.startsWith(`--${component}-`) && !readVars.has(k)
              ? nearest(
                  k,
                  partVars.map(x => x.name),
                )[0]
              : undefined;
          if (near) {
            refuse(
              at,
              k,
              `${k} is no variable ${component} reads (${partVars.map(x => x.name).join(', ')}), and nothing in the theme reads it, so the build writes a custom property that never applies; did you mean ${near}?`,
              asWritten(v),
            );
            continue;
          }
          // A part variable that defaults to a design token takes what
          // that token takes.
          const reads = own
            ? new RegExp(
                String.raw`^var\(\s*(${CUSTOM_PROPERTY})\s*\)$`,
                'i',
              ).exec(own.default)?.[1]
            : undefined;
          if (reads && reads in known) {
            const loc = where(at.join('.'), k);
            const why = judge(reads, v, fileName(loc), here);
            if (why)
              refuse(
                at,
                k,
                `${k} defaults to var(${reads}), so it takes what ${reads} takes: ${why.replace(/\.+$/, '')}`,
                asWritten(v),
              );
            continue;
          }
        }
        if (k.startsWith('--')) {
          token(at, k, v, here, false);
          continue;
        }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          part(
            v,
            [...at, k],
            here,
            depth + 1,
            depth === 0 ? 'style' : innerBlock(k, kind),
          );
          continue;
        }
        const prop = k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
        // A vendor-prefixed property is the browser's own, when the data
        // knows it or it is a prefixed CSS property; any other is a typo or
        // a name no browser reads.
        if (prop.startsWith('-')) {
          const bare = prop.replace(/^-[a-z]+-/, '');
          if (
            v !== undefined &&
            !vendorProperties().has(prop) &&
            !cssProperties().has(bare)
          ) {
            const near = nearest(prop, [...vendorProperties()])[0];
            refuse(
              at,
              k,
              `${k} is no vendor property a browser knows, so the build writes a declaration no browser reads${near ? `; did you mean '${near}'?` : ''}`,
            );
          }
          continue;
        }
        // An undefined property is not set: the build writes nothing for it.
        if (v === undefined) continue;
        const loc = where(at.join('.'), k);
        // A null property leaves it unset (the build writes it as it is),
        // and a null pseudo-class or at-rule builds no block: the build
        // warns either at its line.
        if (v === null && (cssProperties().has(prop) || /^[:@]/.test(k)))
          continue;
        if (!cssProperties().has(prop)) {
          const near = nearest(k, camelNames())[0];
          refuse(
            at,
            k,
            `${k} is not a CSS property, so the build writes a declaration no browser reads${near ? `; did you mean ${near}?` : ''}`,
          );
          continue;
        }
        const why = judgeProperty(prop, v, fileName(loc), here, component);
        // Found by the key as the file writes it (backgroundColor).
        if (why) refuse(at, prop, why, typeof v === 'string' ? v : '', loc);
      }
    };
    const components = block.components;
    if (components && typeof components === 'object')
      for (const [name, styles] of Object.entries(components)) {
        // A part left undefined is not set; one given null, or another
        // value that is no block of style keys, cannot be read.
        if (styles === undefined) continue;
        if (!styles || typeof styles !== 'object') {
          refuse(
            [...path, 'components'],
            name,
            `${name} holds ${describeValue(styles)}, which the build cannot read as a part's style keys: give it style keys, such as ${name}: {base: {…}}, or remove it`,
            '',
            prefix ? null : whereKey([...path, 'components'].join('.'), name),
          );
          continue;
        }
        if (!targetKey(name)) {
          // A part's class (`.astryx-card`) names it the way a stylesheet
          // does; the components map names it by its key (`card`).
          const byClass = [...ctx.project.target.values()].find(
            t => `.${t.className}` === name,
          )?.key;
          const near =
            byClass ?? nearest(name, [...ctx.project.target.keys()])[0];
          refuse(
            [...path, 'components'],
            name,
            `${name} is no component Core themes, so the build writes nothing for it${byClass ? `; the components map names a part by its key: ${byClass}` : near ? `; did you mean ${near}?` : ''}`,
            '',
            prefix ? null : whereKey([...path, 'components'].join('.'), name),
          );
          continue;
        }
        // A component's entries are style keys, each holding a block. A
        // value there is a property written outside one; null is no block
        // and no value.
        for (const [key, block] of Object.entries(styles))
          if (block === null)
            refuse(
              [...path, 'components', name],
              key,
              nullBlock(key, `properties, such as ${key}: {color: …}`),
            );
          else if (block !== undefined && typeof block !== 'object')
            refuse(
              [...path, 'components', name],
              key,
              `${name}'s entries are style keys (such as base) that each hold a block of properties, and ${key} holds ${describeValue(block)}, which the build cannot read as one: write it inside a style key, such as base: {${key}: ${JSON.stringify(block)}}`,
            );
        part(styles, [...path, 'components', name], reads, 0);
      }
    for (const surface of ['onDark', 'onLight'])
      judgeBlock(block[surface], [...path, surface], reads, where, prefix);
    const rules = block.adaptations?.rules;
    if (Array.isArray(rules))
      rules.forEach((rule, i) =>
        judgeBlock(
          rule?.value,
          [...path, 'adaptations', 'rules', String(i), 'value'],
          reads,
          where,
          prefix,
        ),
      );
  };
  judgeBlock(input, [], new Set(), whereIn, '');
  // The custom properties the theme's own page sets, which a typography
  // token Core builds may read.
  const pageVars = new Set([
    ...varsIn(input.tokens),
    ...varsIn(input.localTokens),
  ]);
  // Every theme the exported one extends that this source defines (one
  // between the editor's settings and the export), judged the same way:
  // the build writes what each gives.
  for (const parent of loaded?.chain ?? []) {
    if (parent?.name === settingsThemeName(slug)) break;
    const theme = String(parent?.name ?? '');
    /** @param {string} _scope @param {string} key */
    const whereChain = (_scope, key) => {
      const e =
        entries.find(
          x => x.kind === 'chain' && x.theme === theme && x.token === key,
        ) ??
        entries.find(x => x.kind === 'chain' && x.theme === theme && !x.token);
      return e ? atOf(e) : {line: null, file: null};
    };
    judgeBlock(parent, [], new Set(), whereChain, `theme '${theme}' `);
  }
  // Typography: each field the source gives, as given, then each token
  // Core builds from it, named by the field that gives it.
  const typo = entries.filter(e => e.kind === 'typography');
  /** @type {Set<string>} */
  const flagged = new Set();
  const typeFields = ctx.project.inputFields;
  /**
   * The keys Core reads at a place in the typography block, or null where
   * it does not say: its fields, a role's, the scale's, the heading levels
   * a role's weights takes.
   * @param {string[]} path
   * @returns {string[] | null}
   */
  const typographyTakes = path =>
    !typeFields
      ? null
      : path.length === 0
        ? typeFields.typography
        : path.length === 1 && path[0] === 'scale'
          ? typeFields.scale
          : path.length === 1
            ? typeFields.role
            : path.length === 2 && path[1] === 'weights'
              ? typeFields.levels
              : null;
  /** @param {any} node @param {string[]} path */
  const fields = (node, path) => {
    if (!node || typeof node !== 'object') return;
    const takes = typographyTakes(path);
    for (const [k, v] of Object.entries(node)) {
      const key = [...path, k].join('.');
      if (v === undefined) continue;
      // A weights key is a level as Core reads it (`'01'` is level 1).
      const isLevelKey = path.at(-1) === 'weights';
      if (
        takes &&
        !(isLevelKey ? isHeadingLevel(k, takes) : takes.includes(k))
      ) {
        const levels = isLevelKey;
        const near = levels ? undefined : nearest(k, takes)[0];
        const e = typo.find(x => x.key === key || x.key.startsWith(`${key}.`));
        flagged.add(path[0] ?? k);
        out.push({
          token: `typography.${key}`,
          key: k,
          value: '',
          why: levels
            ? noLevelWhy(k, takes, key)
            : `${k} is no field ${path.length ? `typography.${path.join('.')} takes` : 'typography takes'} (${takes.join(', ')}), so Core builds nothing from it${near ? `; did you mean ${near}?` : ''}`,
          ...(e ? atOf(e) : {line: null, file: null}),
        });
        continue;
      }
      if (v && typeof v === 'object' && !Array.isArray(v))
        fields(v, [...path, k]);
      else {
        const why = typographyValueProblem(key, v);
        if (!why) continue;
        const e = typo.find(x => x.key === key) ?? typo[0];
        flagged.add(key.split('.')[0]);
        out.push({
          token: `typography.${key}`,
          value: typeof v === 'string' ? v : '',
          why,
          ...(e ? atOf(e) : {line: null, file: null}),
        });
      }
    }
  };
  if (
    input.typography != null &&
    (typeof input.typography !== 'object' || Array.isArray(input.typography))
  ) {
    const e = typo[0];
    out.push({
      token: 'typography',
      value: typeof input.typography === 'string' ? input.typography : '',
      why: typographyBlockWhy(input.typography),
      ...(e ? atOf(e) : {line: null, file: null}),
    });
  }
  fields(input.typography, []);
  // Two keys for one heading level ('01' and 1): Core keeps one.
  if (input.typography && typeof input.typography === 'object')
    for (const [role, r] of Object.entries(input.typography)) {
      const weights = r && typeof r === 'object' ? r.weights : undefined;
      if (!weights || typeof weights !== 'object' || Array.isArray(weights))
        continue;
      for (const d of levelDuplicates(
        role,
        weights,
        typeFields?.levels ?? [],
      )) {
        const key = `${role}.weights.${d.key}`;
        const e = typo.find(x => x.key === key) ?? typo[0];
        flagged.add(role);
        out.push({
          token: `typography.${key}`,
          value: typeof weights[d.key] === 'string' ? weights[d.key] : '',
          why: d.why,
          ...(e ? atOf(e) : {line: null, file: null}),
        });
      }
    }
  // Core builds a role's font list from its family, with the fallbacks
  // after it: fallbacks with no family in that role build nothing.
  if (input.typography && typeof input.typography === 'object')
    for (const role of ['body', 'heading', 'code']) {
      const r = input.typography[role];
      if (
        !r ||
        typeof r !== 'object' ||
        flagged.has(role) ||
        r.fallbacks === undefined ||
        r.family
      )
        continue;
      const key = `${role}.fallbacks`;
      const e = typo.find(x => x.key === key) ?? typo[0];
      out.push({
        token: `typography.${key}`,
        value: typeof r.fallbacks === 'string' ? r.fallbacks : '',
        why: `Core builds a role's font list from its family, with the fallbacks after it, so typography.${key} builds nothing without typography.${role}.family${role === 'body' ? '' : `; ${role === 'heading' ? 'a heading with no family takes the body list whole' : 'give the code family beside them'}`}: give ${role}.family beside them (such as family: 'Inter')`,
        ...(e ? atOf(e) : {line: null, file: null}),
      });
    }
  // Core writes a role's weight only from a type scale: without one, a
  // weight builds nothing.
  if (
    input.typography &&
    typeof input.typography === 'object' &&
    !input.typography.scale
  )
    for (const role of ['body', 'heading', 'code']) {
      const r = input.typography[role];
      if (!r || typeof r !== 'object' || flagged.has(role)) continue;
      for (const field of ['weight', 'weights']) {
        if (r[field] === undefined) continue;
        const key = `${role}.${field}`;
        const e =
          typo.find(x => x.key === key || x.key.startsWith(`${key}.`)) ??
          typo[0];
        // The weight alone, never a scale: one would also resize every
        // text (the base's own sizes give way to the scale's). A heading
        // weight is the headings dial, as set takes it (set's own repair of
        // the value: 700 is bold); any other role's weight is its token.
        const given = typeof r[field] === 'string' ? r[field] : null;
        /** @type {string[]} */
        let run = [];
        if (role === 'heading' && field === 'weight' && given) {
          try {
            checkSetting(
              ctx,
              slug,
              structuredClone(data),
              'headings',
              given,
              {},
              false,
            );
            run = [`${P} set ${slug} headings ${quoteCommandArgument(given)}`];
          } catch (x) {
            if (!(x instanceof AstryxError)) throw x;
            run = (x.suggestions ?? [])
              .map(y => y.name)
              .filter(n => n.startsWith(`${P} set ${slug} headings `));
          }
        }
        out.push({
          token: `typography.${key}`,
          value: given ?? '',
          why: noScaleWeightWhy(
            key,
            role,
            run.length
              ? 'run the line below, which changes only the heading weight'
              : `give the weight as the ${roleWeightTokens(role)} token${role === 'heading' ? 's' : ''} in tokens, which changes only that weight`,
          ),
          ...(run.length ? {run} : {}),
          ...(e ? atOf(e) : {line: null, file: null}),
        });
      }
    }
  const scale = input.typography?.scale;
  for (const field of /** @type {const} */ (['base', 'ratio']))
    if (
      scale &&
      typeof scale === 'object' &&
      scale[field] === undefined &&
      !flagged.has('scale')
    ) {
      flagged.add('scale');
      const e =
        typo.find(x => x.key === 'scale') ??
        typo.find(x => x.key.startsWith('scale.')) ??
        typo[0];
      out.push({
        token: 'typography.scale',
        value: '',
        why: missingScaleFieldWhy(field),
        ...(e ? atOf(e) : {line: null, file: null}),
      });
    }
  // The radius scale: a field missing builds every scaled corner as NaNpx.
  {
    const e = entries.find(x => x.kind === 'field' && x.key === 'radius');
    for (const r of radiusInputProblems(input.radius))
      out.push({
        token: r.path.join('.'),
        value: typeof r.value === 'string' ? r.value : '',
        why: r.why,
        ...(e ? atOf(e) : {line: null, file: null}),
      });
  }
  const tokens = loaded?.theme?.tokens;
  if (input.typography && tokens && typeof tokens === 'object') {
    /** @param {string} role */
    const roleEntry = role =>
      typo.find(e => e.key.startsWith(`${role}.`)) ??
      (role === 'heading'
        ? typo.find(e => e.key.startsWith('body.'))
        : undefined);
    /** The typography field that gives a token Core builds. @param {string} token */
    const typographyOf = token => {
      const family = /^--font-family-([a-z]+)$/.exec(token)?.[1];
      if (family) return roleEntry(family) ?? null;
      if (!/^--(font-size|text|heading)-/.test(token)) return null;
      if (/-weight$/.test(token)) {
        const role = /heading/.test(token)
          ? 'heading'
          : /code/.test(token)
            ? 'code'
            : 'body';
        return (
          typo.find(
            e =>
              e.key === `${role}.weight` || e.key.startsWith(`${role}.weights`),
          ) ??
          roleEntry(role) ??
          typo.find(e => /weight/.test(e.key)) ??
          typo[0] ??
          null
        );
      }
      return typo.find(e => e.key.startsWith('scale.')) ?? typo[0] ?? null;
    };
    /** @type {Set<any>} */
    const reported = new Set();
    for (const [token, value] of Object.entries(tokens)) {
      if (!(token in known) || token in (input.tokens ?? {})) continue;
      const owner = typographyOf(token);
      if (!owner || reported.has(owner) || flagged.has(owner.key.split('.')[0]))
        continue;
      // A token Core leaves as the base theme writes it is the base's.
      if (loaded?.base.get(token) === value) continue;
      // A family token is built from the family and its fallbacks: the
      // fallbacks are named when they alone are refused.
      const role = /^--font-family-([a-z]+)$/.exec(token)?.[1];
      const fallbacks = role ? input.typography?.[role]?.fallbacks : undefined;
      const fallbackEntry =
        typeof fallbacks === 'string' &&
        judge(token, fallbacks, fileName(atOf(owner)), pageVars)
          ? typo.find(e => e.key === `${role}.fallbacks`)
          : undefined;
      const field = fallbackEntry ?? owner;
      const at = atOf(field);
      const why = judge(token, value, fileName(at), pageVars);
      if (why) {
        reported.add(owner);
        out.push({
          token: `typography.${field.key} (builds ${token})`,
          value: asWritten(value),
          why,
          ...at,
        });
      }
    }
  }
  return out;
}

/**
 * Refuse a theme whose own source gives a token a value `set` refuses: the
 * build would write it as it is (a browser drops it), so it is named, with
 * the line of the file, before anything is written.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 */
async function refuseOwnTokenValues(ctx, slug, data) {
  const err = await ownTokenRefusal(ctx, slug, data);
  if (err) throw err;
}
setOwnTokenCheck(refuseOwnTokenValues);

/**
 * The first pseudo-class or pseudo-element in a selector key (`:hover`,
 * `::before`, `:hover:focus-visible`, `:not(:hover)`) that browsers do not
 * know and that is one typo from one they know (or from a state the part
 * takes): the name as written, and the key with that name corrected. Null
 * when every name is known, vendor-prefixed, or near none.
 * @param {string} key
 * @param {string[]} states the states the part takes
 * @returns {{written: string, fixed: string, element: boolean} | null}
 */
function pseudoTypo(key, states) {
  // Attribute selectors and quoted text may hold colons of their own.
  const bare = key.replace(/\[[^\]]*\]|"[^"]*"|'[^']*'/g, m =>
    ' '.repeat(m.length),
  );
  for (const m of bare.matchAll(/(::?)([a-z-]+)/gi)) {
    const [whole, colons, raw] = m;
    const name = raw.toLowerCase();
    if (name.startsWith('-')) continue;
    const element = colons === '::';
    const known = element
      ? CSS_PSEUDO_ELEMENTS.has(name)
      : CSS_PSEUDO_CLASSES.has(name) || ONE_COLON_PSEUDO_ELEMENTS.has(name);
    if (known) continue;
    const near = element
      ? nearest(name, [...CSS_PSEUDO_ELEMENTS])[0]
      : (nearest(name, [...states, ...COMMON_STATES])[0] ??
        nearest(name, [...CSS_PSEUDO_CLASSES])[0]);
    if (!near || near === name) continue;
    const at = /** @type {number} */ (m.index);
    return {
      written: `${colons}${raw}`,
      fixed: `${key.slice(0, at)}${colons}${near}${key.slice(at + whole.length)}`,
      element,
    };
  }
  return null;
}

/**
 * The refusal for own-source token values `set` refuses, or null.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {Promise<AstryxError | null>}
 */
async function ownTokenRefusal(ctx, slug, data) {
  /** @type {Awaited<ReturnType<typeof ownTokenProblems>>} */
  let bad;
  try {
    bad = await ownTokenProblems(ctx, slug, data);
  } catch (error) {
    // The theme's own code threw while its values were read (a getter, a
    // Proxy): nothing here can judge them, and the build that follows
    // refuses the theme with its own load error.
    if (error instanceof AstryxError) throw error;
    return null;
  }
  if (!bad.length) return null;
  const own = `themes/${slug}/${slug}.theme.ts`;
  const file = bad[0].file ?? own;
  const list = `${bad
    .slice(0, 3)
    .map(
      b =>
        `${b.token}${b.value ? `: "${b.value}"` : ''}${b.file ? ` (in ${b.file}${b.line ? `, line ${b.line}` : ''})` : b.line ? ` (line ${b.line})` : ''}: ${b.why.replace(/\.+$/, '')}`,
    )
    .join('; ')}${bad.length > 3 ? `; and ${bad.length - 3} more` : ''}`;
  return new AstryxError(
    `${own} gives ${bad.length === 1 ? 'a value' : `${bad.length} values`} the editor refuses, since the build would not apply ${bad.length === 1 ? 'it' : 'them'} as written: ${list}${/[?!]$/.test(list) ? '' : '.'} Change it in ${file}. Nothing was changed.`,
    [
      bad[0].line
        ? {
            name: `sed -n ${bad[0].line}p ${quoteCommandArgument(file)}`,
            reason: 'see the line that sets it',
          }
        : {
            name: `grep -n -- ${quoteCommandArgument(bad[0].key ?? bad[0].token)} ${quoteCommandArgument(file)}`,
            reason: 'see the line',
          },
      // A line that does what a value meant, once that value is out.
      ...bad.flatMap(b =>
        (b.run ?? []).map(name => ({
          name,
          reason: `then this, once ${b.token} is taken out of ${b.file ?? own}`,
        })),
      ),
    ],
    ERROR_CODES.ERR_THEME_INVALID,
  );
}

/**
 * The refusal `compile` gives an editor theme whose own source gives a
 * token a value `set` refuses, or null.
 * @param {string} root
 * @param {string} slug
 * @returns {Promise<AstryxError | null>}
 */
export async function editorOwnTokenRefusal(root, slug) {
  const ctx = await context(root);
  /** @type {import('./_settings.mjs').ThemeData} */
  let data;
  try {
    data = loadTheme(root, slug);
  } catch {
    return null;
  }
  return ownTokenRefusal(ctx, slug, data);
}

/**
 * A note for type scale steps that land outside 9 to 200 pixels.
 * @param {Record<string, string>} res resolved light tokens
 * @returns {string[]}
 */
function extremeSteps(res) {
  const out = Object.entries(res)
    .filter(([k]) => /^--font-size-/.test(k))
    .map(([k, v]) => {
      const n = Number.parseFloat(v);
      return /** @type {[string, number]} */ ([k, /rem$/.test(v) ? n * 16 : n]);
    })
    .filter(([, px]) => Number.isFinite(px) && (px < 9 || px > 200))
    .map(([k, px]) => `${k} ${Math.round(px)}px`);
  return out.length
    ? [
        `some scale steps are outside reading sizes (9 to 200px): ${out.slice(0, 4).join(', ')}`,
      ]
    : [];
}

/**
 * The fields the editor adds to a setting in its own results, never part
 * of a saved entry: show's `parts` and `masked`, set's `note`.
 */
const OUTPUT_ONLY_KEYS = Object.freeze(['parts', 'masked', 'note']);

/**
 * An entry as the settings file saves it: without the fields only the
 * editor's results carry ({@link OUTPUT_ONLY_KEYS}).
 * @param {Record<string, any>} entry
 */
const withoutOutputKeys = entry =>
  Object.fromEntries(
    Object.entries(entry).filter(([k]) => !OUTPUT_ONLY_KEYS.includes(k)),
  );

/**
 * An object of settings written as JSON, with single quotes, or as its
 * entries with no braces (`"accent": "#e11d48", "corners": "pill"`).
 * Throws when it is none of these.
 * @param {string} text
 * @returns {any}
 */
function looseObject(text) {
  const t = text.trim();
  // A list (`[{…}]`, as the settings file holds its entries) as it is.
  const braced = t.startsWith('{') || t.startsWith('[') ? t : `{${t}}`;
  try {
    return JSON.parse(braced);
  } catch {
    return JSON.parse(
      braced.replace(/'((?:[^'\\]|\\.)*)'/g, (_, x) =>
        JSON.stringify(x.replace(/\\'/g, "'")),
      ),
    );
  }
}

/**
 * A refusal with each line that sets the typed setting again kept only
 * when it carries the value typed; with none left, `how` for the setting.
 * Another setting's line, an undo or a look stays.
 * @param {any} e
 * @param {'set' | 'undo'} sub
 * @param {string} slug
 * @param {string} thing
 * @param {unknown} typed
 * @param {import('./_settings.mjs').ThemeData} [data] the theme, whose saved
 *   values a keep line may carry
 */
function carryTyped(e, sub, slug, thing, typed, data, cwd = process.cwd()) {
  if (
    sub !== 'set' ||
    !(e instanceof AstryxError) ||
    // A refusal about what the settings file holds: its lines carry the
    // saved value (checked where they are made), not the typed one.
    /** @type {any} */ (e).aboutSaved ||
    typeof typed !== 'string' ||
    !e.suggestions?.length
  )
    return e;
  const head = new RegExp(
    `^.* set \\S+ (?:'([^']+)'|(\\S+)) (?:'((?:[^']|'\\\\'')*)'|(\\S+))`,
  );
  // Every set line, of this setting or another (a dial's other name, a
  // label, a theme-wide equivalent), offers a value only through the gate's
  // declared sources (readsTyped): never a stock, reset or nearest value.
  // A line that carries only part of the value is offered only when the
  // refusal's lines together carry all of it (a family and its weight).
  // With no value typed, the thing held it (`accent: red`).
  const typedText = typed.trim() ? typed : String(thing);
  /** @type {Map<string, string[]>} */
  const saved = new Map();
  for (const x of data?.settings ?? [])
    saved.set(x.thing, [...(saved.get(x.thing) ?? []), String(x.value ?? '')]);
  // The base the theme was built on is a saved value of its base too (the
  // module's header holds it when the file's base is damaged).
  const builtOn = builtOnBase(cwd, slug);
  saved.set(
    'base',
    /** @type {string[]} */ (
      [data?.like, builtOn].filter(b => typeof b === 'string' && b !== '')
    ),
  );
  if (data?.mode) saved.set('mode', [data.mode]);
  const reads = e.suggestions.map(x => {
    const m = head.exec(x.name);
    if (!m) return /** @type {true | number[] | false} */ (true);
    return readsTyped({
      offered: m[3] ?? m[4],
      typed: typedText,
      thing: (m[1] ?? m[2]).replace(/^'(.*)'$/, '$1'),
      typedThing: String(thing),
      saved,
      mode: / --mode (light|dark)\b/.exec(x.name)?.[1] ?? '',
      scope: {
        on: / --on '?([a-z][a-z0-9-]*)/.exec(x.name)?.[1],
        state: / --state '?([a-z][a-z0-9-]*)/.exec(x.name)?.[1],
      },
    });
  });
  const covered = coversTyped(reads, typedText, String(thing));
  /** @type {Set<string>} */
  const dropped = new Set();
  const lines = e.suggestions.filter((x, i) => {
    const read = reads[i];
    if (read === true || (read && typeof read === 'object' && covered))
      return true;
    const m = head.exec(x.name);
    if (m) dropped.add(String(m[3] ?? m[4]).toLowerCase());
    return false;
  });
  // A value named as a did-you-mean goes with its line.
  const kept = lines.filter(
    x => !(x.reason === 'did you mean' && dropped.has(x.name.toLowerCase())),
  );
  // A refusal always names a command that works: with no set, undo, new or
  // how line left, how for the setting.
  const runnable = kept.some(
    x => x.reason !== 'did you mean' && !/ --help$/.test(x.name),
  );
  if (kept.length === e.suggestions.length && runnable) return e;
  e.suggestions = runnable
    ? kept
    : [
        ...kept.filter(x => !/ --help$/.test(x.name)),
        // (With no thing named, the settings it can name.)
        String(thing).trim()
          ? {
              name: `${P} how ${quoteCommandArgument(String(thing))}`,
              reason: 'what it takes',
            }
          : {name: `${P} how --list dials`, reason: 'the settings it takes'},
      ];
  return e;
}

/**
 * A theme's settings file as written, for the values a keep line may carry
 * when the theme does not load (a damaged entry); null when it cannot be
 * read.
 * @param {string} cwd
 * @param {string} slug
 * @returns {import('./_settings.mjs').ThemeData | undefined}
 */
function savedAsWritten(cwd, slug) {
  try {
    const data = settingsJson(
      fs.readFileSync(themeFiles(cwd, slug).settings, 'utf8'),
    );
    return entriesReadable(data) ? data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A refusal of the settings file (a setting listed twice, a damaged
 * entry) with every `set` it suggests checked as set checks it, against
 * the file as written: a keep line whose value set refuses is dropped.
 * @param {unknown} e
 * @param {string} cwd
 * @param {string} slug
 * @returns {Promise<unknown>}
 */
async function vetLoadRefusal(e, cwd, slug) {
  if (!(e instanceof AstryxError) || e.code !== E.ERR_THEME_INVALID) return e;
  const data = savedAsWritten(cwd, slug);
  if (!data) return e;
  try {
    const ctx = /** @type {import('./_settings.mjs').Ctx} */ (
      await context(cwd)
    );
    ctx.base = await baseResolved(ctx.project, data.like ?? undefined);
    return vetSuggestions(e, ctx, slug, data);
  } catch {
    return e;
  }
}

/**
 * The lines of a repair that work: each run through set's own check (in
 * memory) and offered only when set takes it as offered and its value
 * passes the allowlist of exact readings of what was typed. A line left
 * out that names its own setting points to how for it; with no line left,
 * how for the thing (or the command's help when there is no one thing).
 * @param {'set' | 'undo'} sub
 * @param {string} slug
 * @param {Array<string | [string, string] | [string, string, string] | [string, string, string, ScopeFlags]>} lines
 *   each line, or each line with the typed text it carries (and, for an
 *   entry of a pasted object, its setting, and the scope it was pasted
 *   with: a set line refused is then checked with the setting and value in
 *   the other order, as a typed pair is: swappedLines)
 * @param {string} cwd
 * @param {string} typed
 * @param {string} thing
 * @returns {Promise<Array<string | {name: string, reason: string}>>}
 */
async function workingLines(sub, slug, lines, cwd, typed, thing) {
  /** @type {Array<string | {name: string, reason: string}>} */
  const out = [];
  for (const item of lines) {
    const [line, own, subject, scope] = Array.isArray(item)
      ? item
      : [item, typed, undefined, undefined];
    // A line left out is checked swapped (an entry pasted with its setting
    // and value in the other order); else it points to how for its own
    // setting, when it names one (an entry of a pasted object).
    const left = async () => {
      const swapped =
        sub === 'set' && scope && subject && own
          ? await swappedLines(slug, subject, own, {...scope, cwd})
          : null;
      if (swapped)
        out.push(
          ...swapped.map(x => ({
            name: x.name,
            reason: x.reason ?? 'do this instead',
          })),
        );
      else if (subject) out.push(`${P} how ${quoteCommandArgument(subject)}`);
    };
    // The line as set takes it (a repair set offers for it folded in).
    const followed = await followChangeLine(sub, slug, line, cwd);
    if (followed.why) {
      await left();
      continue;
    }
    const read = readSetLine(followed.line, slug);
    if (
      sub === 'set' &&
      read &&
      !allowedLine({
        offered: read.value,
        typed: own,
        thing: read.thing,
        mode: String(read.flags?.mode ?? ''),
      })
    ) {
      await left();
      continue;
    }
    out.push(followed.line);
  }
  /** @param {string | {name: string}} x */
  const name = x => (typeof x === 'string' ? x : x.name);
  return out.length
    ? out.filter((x, i) => out.findIndex(y => name(y) === name(x)) === i)
    : [
        thing
          ? `${P} how ${quoteCommandArgument(thing)}`
          : `${P} ${sub} --help`,
      ];
}

/**
 * A `set` or `undo` line for the theme a path or other letters named, run
 * through that command's own check (in memory, nothing written). Each
 * repair a refusal of it offers is folded into the one line, so the line
 * runs as offered; `why` names what is still refused when no repair is
 * offered.
 * @param {'set' | 'undo'} sub
 * @param {string} slug
 * @param {string} line
 * @param {string} cwd
 * @param {Partial<import('./_settings.mjs').Setting>} [skip] a saved entry
 *   the line replaces, whose value is not checked when the theme is read
 * @returns {Promise<{line: string, why: string | null, next?: import("../../foundation/response/base").Suggestion[]}>}
 */
async function followChangeLine(sub, slug, line, cwd, skip) {
  const loaded = await loadedForCheck(cwd, slug, skip);
  // A line for a theme this command never made cannot run; a theme whose
  // file does not read is checked by the command itself.
  if (!loaded)
    return {
      line,
      why:
        slugOk(slug) && fs.existsSync(themeFiles(cwd, slug).settings)
          ? null
          : `there is no theme "${slug}" made by this command`,
    };
  const {data, ctx} = loaded;
  return followLine(
    line,
    now => {
      // A step back (`undo <theme>` naming no setting) works only with an
      // earlier change to go back to.
      if (sub === 'undo' && now.trim() === `${P} undo ${slug}`)
        return readHistory(themeFiles(cwd, slug).history).steps.length
          ? null
          : new AstryxError(`${slug} has no earlier change to undo`, [
              {name: `${P} show ${slug}`, reason: 'see what it sets'},
            ]);
      const read = readSetLine(
        sub === 'undo' ? now.replace(`${P} undo `, `${P} set `) : now,
        slug,
      );
      // A line set does not read (an option it does not take, an option
      // with no value) fails when followed: never offered as working.
      if (!read)
        return new AstryxError(
          'the line does not read as the command takes it',
          [],
        );
      try {
        const s = checkSetting(
          ctx,
          slug,
          structuredClone(data),
          read.thing,
          read.value,
          read.flags,
          sub === 'undo',
        );
        return sub === 'undo' && !data.settings.some(x => keyOf(x) === keyOf(s))
          ? new AstryxError(
              `${slug} does not set ${describe({...s, value: '?'}).replace(' = ?', '')}`,
              [{name: `${P} show ${slug}`, reason: 'see what it sets'}],
            )
          : null;
      } catch (e) {
        if (e instanceof AstryxError) return e;
        throw e;
      }
    },
    name => repairGate(sub, slug, line, name),
  );
}

/**
 * The record of the last change command refused for a theme, kept in the
 * project's theme cache: the command and when it was refused.
 * @param {string} cwd
 * @param {string} slug
 */
const refusedFile = (cwd, slug) => {
  const root = themeCacheRoot(cwd);
  return root ? path.join(root, 'refused', `${slug}.json`) : null;
};

/**
 * Note a change command refused for a theme that exists, so a later undo
 * can say the refused command changed nothing. Best effort: a cache that
 * cannot be written leaves the note out.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} command the command as typed, after the CLI name
 */
function noteRefused(cwd, slug, command) {
  try {
    if (!slugOk(slug) || !fs.existsSync(themeFiles(cwd, slug).settings)) return;
    const file = refusedFile(cwd, slug);
    if (!file) return;
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, JSON.stringify({at: Date.now(), command}));
  } catch {
    // No note.
  }
}

/**
 * The change command refused for a theme since its last change (the
 * history's last write), or null.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} history the theme's history file
 * @returns {string | null}
 */
function refusedAfter(cwd, slug, history) {
  try {
    const file = refusedFile(cwd, slug);
    if (!file) return null;
    const note = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof note?.command === 'string' &&
      typeof note.at === 'number' &&
      note.at > fs.statSync(history).mtimeMs
      ? note.command
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {'set' | 'undo'} sub
 * @param {string} slug
 * @param {string} thing
 * @param {string | undefined} value
 * @param {ChangeOptions} options
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
async function change(sub, slug, thing, value, options) {
  // As typed: an undo of a saved entry written in a form the cleanup below
  // repairs (`Corners`, `var(--radius-page)`) removes that exact entry.
  const typedThing = thing;
  const typedValue = value;
  // An object of several settings pasted as one (JSON, single quotes, or
  // its entries with no braces, split at the first colon on the way): one
  // set line each.
  const objectText =
    typeof thing !== 'string'
      ? null
      : value == null || value === ''
        ? /^\s*(\[\s*)?\{[\s\S]*\}(\s*\])?\s*$/.test(thing)
          ? thing
          : // Its entries with no braces, as copied from inside the
            // settings file (`"thing": "corners", "value": "pill",`).
            /^\s*(["'])[^"']+\1\s*:[\s\S]*,/.test(thing)
            ? `{${thing.trim().replace(/,$/, '')}}`
            : null
        : /^\s*(\[\s*)?\{?\s*["']/.test(thing) && /["']\s*:/.test(String(value))
          ? `${thing}:${value}`
          : null;
  // A pasted object of one entry is that entry, as read below: its repair
  // carries the entry's value, and how names its setting.
  let oneEntry = false;
  // Several lines pasted as one argument (declarations, the editor's own
  // printed or change lines): each line read by the one entry reader, one
  // line each, with the scope typed.
  const pastedLines =
    typeof thing === 'string' &&
    objectText == null &&
    (value == null || value === '')
      ? thing
          .split(/\r?\n/)
          .map(l => l.trim().replace(/;$/, '').trim())
          .filter(Boolean)
      : [];
  if (
    pastedLines.length > 1 &&
    pastedLines.every(l => {
      const read = normalizeEntry(l, undefined);
      return read.pasted && String(read.value ?? '').trim() !== '';
    })
  ) {
    const cwd = options.cwd ?? process.cwd();
    /** @type {Array<[string, string, string, ScopeFlags]>} */
    const lines = [];
    for (const l of pastedLines.slice(0, 6)) {
      const read = normalizeEntry(l, undefined);
      const own = {...(read.scope ?? {})};
      Object.assign(own, await labelRead(own, cwd));
      delete own.label;
      /** @type {any} */
      const entry = {
        ...own,
        ...Object.fromEntries(
          /** @type {const} */ (['on', 'when', 'state', 'mode', 'only'])
            .filter(k => options[k])
            .map(k => [k, options[k]]),
        ),
        thing: String(read.thing),
        value: String(read.value ?? ''),
      };
      lines.push([
        `${P} ${sub} ${slug} ${sub === 'set' ? setArgs(entry, entry.value) : undoArgs(entry)}`,
        entry.value,
        entry.thing,
        entry,
      ]);
    }
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `This holds ${pastedLines.length} settings, one a line; ${sub} changes one at a time.`,
      {run: await workingLines(sub, slug, lines, cwd, String(thing), '')},
    );
  }
  // A pasted object or list with nothing in it (`{,}`, `[ ]`) names no
  // setting.
  if (objectText != null && /^\s*[[{][\s,;]*[\]}]\s*$/.test(objectText))
    refuse(
      E.ERR_MISSING_ARGUMENT,
      `The pasted ${objectText.trim().startsWith('[') ? 'list' : 'object'} holds no setting: name the thing to change.`,
      {run: [`${P} how --list dials`, `${P} ${sub} --help`]},
    );
  if (objectText != null) {
    // The scope keys an entry may carry, as set's flags name them.
    const SCOPE = /** @type {const} */ ([
      'on',
      'when',
      'state',
      'mode',
      'only',
    ]);
    /** An entry's own scope. @param {any} x @returns {any} */
    const scopeOf = x =>
      Object.fromEntries(SCOPE.filter(k => k in x).map(k => [k, x[k]]));
    // The scope typed as flags beside the paste (`--on card`) is the scope
    // of every setting it holds, over the scope the paste names.
    /** @type {ScopeFlags} */
    const typedScope = scopeOf(
      Object.fromEntries(
        SCOPE.filter(k => options[k]).map(k => [k, options[k]]),
      ),
    );
    // A scope's `only` read by the one yes/no reader (`"no"`, `"0"` say
    // no); one that says neither is refused, never read as yes.
    /** @param {any} scope @param {string} what */
    const readOnly = (scope, what) => {
      if (!('only' in scope) || typeof scope.only === 'boolean') return;
      const yes = booleanWord(scope.only);
      if (yes == null)
        refuse(
          E.ERR_INVALID_ARGUMENT,
          `${what}, and its "only" is ${JSON.stringify(scope.only)}, which reads as neither yes nor no: give it true to set only that part, or leave it out.`,
          {run: []},
        );
      if (yes) scope.only = true;
      else delete scope.only;
    };
    /** @type {any} */
    let obj = null;
    try {
      obj = looseObject(objectText);
    } catch {
      // Not an object: read as typed.
    }
    // A list of entries as the settings file holds them (`[{…}]`, copied
    // from it or from show --json): one entry is that entry; several are
    // one line each.
    if (Array.isArray(obj)) {
      const entries = obj.filter(
        x => x && typeof x === 'object' && typeof x.thing === 'string',
      );
      if (entries.length !== obj.length || !entries.length) obj = null;
      else if (entries.length === 1) obj = entries[0];
      else
        refuse(
          E.ERR_INVALID_ARGUMENT,
          `This holds ${entries.length} settings in the form the settings file saves them; ${sub} changes one at a time.`,
          {
            run: await workingLines(
              sub,
              slug,
              entries.slice(0, 6).map(x => {
                const entry = /** @type {import('./_settings.mjs').Setting} */ (
                  withoutOutputKeys({
                    ...x,
                    ...typedScope,
                    value: String(x.value ?? ''),
                  })
                );
                return /** @type {[string, string, string, ScopeFlags]} */ ([
                  `${P} ${sub} ${slug} ${sub === 'set' ? setArgs(entry, entry.value) : undoArgs(entry)}`,
                  entry.value,
                  entry.thing,
                  scopeOf(entry),
                ]);
              }),
              options.cwd ?? process.cwd(),
              objectText,
              '',
            ),
          },
        );
    }
    // An entry's own fields in other letters (`Thing`, `VALUE`, `On`) or
    // spelled as their flags (`--on`) are those fields: the one field
    // reader for a typed entry and a saved one.
    obj = entryFieldNames(obj);
    // An entry that names its thing under `setting`, as the editor's own
    // results print it, is that entry.
    obj = printedEntry(obj);
    // The fields the editor adds to an entry in its own results (show's
    // parts, set's note) are no part of the setting.
    if (obj && typeof obj === 'object' && typeof obj.thing === 'string')
      obj = withoutOutputKeys(obj);
    /** An entry's value as set takes it: text, a nested value as JSON. @param {unknown} x */
    const entryText = x =>
      x != null && typeof x === 'object' ? JSON.stringify(x) : String(x);
    // Each key read as set reads a typed thing (spaces around it, a quote
    // or a colon left on it): the one thing-name reader, normalizeEntry.
    if (obj && typeof obj === 'object' && !Array.isArray(obj))
      obj = Object.fromEntries(
        Object.entries(obj).map(([k, x]) => [
          String(normalizeEntry(k, entryText(x)).thing ?? k),
          x,
        ]),
      );
    // One setting with its scope: the editor's own saved form (`{"thing",
    // "value", "on", …}`), or one setting beside scope keys (`{"color":
    // "red", "on": "card"}`): its thing and value, its scope as flags.
    const rest =
      obj && typeof obj === 'object'
        ? Object.keys(obj).filter(k => !SCOPE.includes(/** @type {any} */ (k)))
        : [];
    // The saved form is read by its thing and value; a key beside them the
    // editor does not write (`comment`, `id`) is left out, and said.
    const SAVED = ['thing', 'value', 'source', 'axis'];
    // An entry in the saved form names its thing under `thing`, with its
    // value or (an undo needs none) without one: never a setting named
    // "thing".
    const savedForm =
      typeof obj?.thing === 'string' &&
      ('value' in obj || rest.every(k => SAVED.includes(k)));
    const unread = savedForm ? rest.filter(k => !SAVED.includes(k)) : [];
    const scoped =
      !savedForm &&
      rest.length === 1 &&
      Object.keys(obj).some(k => SCOPE.includes(/** @type {any} */ (k)));
    if (savedForm || scoped) {
      /** @type {any} */
      const entry = savedForm
        ? {
            ...Object.fromEntries(
              Object.entries(obj).filter(([k]) => !unread.includes(k)),
            ),
            ...typedScope,
            value: String(obj.value ?? ''),
          }
        : {
            ...scopeOf(obj),
            ...typedScope,
            thing: rest[0],
            value: String(obj[rest[0]] ?? ''),
          };
      readOnly(
        entry,
        `This is one setting${savedForm ? ' in the form the settings file saves it' : ' with its scope'}`,
      );
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `This is one setting${savedForm ? ' in the form the settings file saves it' : ' with its scope'}; ${sub} takes its thing${sub === 'set' ? ' and value' : ''}, with its scope as flags.${unread.length ? ` ${unread.map(k => JSON.stringify(k)).join(', ')} ${unread.length === 1 ? 'is no field' : 'are no fields'} the editor reads, so ${unread.length === 1 ? 'it is' : 'they are'} left out.` : ''}`,
        {
          run: await workingLines(
            sub,
            slug,
            [
              [
                `${P} ${sub} ${slug} ${sub === 'set' ? setArgs(entry, entry.value) : undoArgs(entry)}`,
                entry.value,
                entry.thing,
                scopeOf(entry),
              ],
            ],
            options.cwd ?? process.cwd(),
            objectText,
            entry.thing,
          ),
        },
      );
    }
    // A pasted object or list that holds nothing names no setting.
    if (obj && typeof obj === 'object' && !Object.keys(obj).length)
      refuse(
        E.ERR_MISSING_ARGUMENT,
        `The pasted ${Array.isArray(obj) ? 'list' : 'object'} holds no setting: name the thing to change.`,
        {run: [`${P} how --list dials`, `${P} ${sub} --help`]},
      );
    oneEntry = Boolean(
      obj && typeof obj === 'object' && Object.keys(obj).length === 1,
    );
    // A pasted object of one entry is that entry, its key read above.
    if (oneEntry) {
      const [[k, x]] = Object.entries(obj);
      thing = k;
      value = entryText(x);
    }
    if (obj && typeof obj === 'object' && Object.keys(obj).length > 1) {
      // Scope keys beside several settings (`"on": "card"`) are the scope
      // of each, with the scope typed as flags; never settings of their own.
      const settings = rest.length ? rest : Object.keys(obj);
      /** @type {any} */
      const scope = {...(rest.length ? scopeOf(obj) : {}), ...typedScope};
      readOnly(
        scope,
        `This holds ${settings.length} settings with their scope`,
      );
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `This holds ${settings.length} settings; ${sub} changes one at a time.`,
        {
          // Each entry as its own line with the scope, a nested value
          // (`{"$value": …}`, a light and dark pair) written back as typed;
          // each line checked, and one set refuses is left out.
          run: await workingLines(
            sub,
            slug,
            settings.slice(0, 6).map(k => {
              const entry = entryText(obj[k]);
              const read = String(normalizeEntry(k, entry).value ?? '');
              const x = /** @type {import('./_settings.mjs').Setting} */ ({
                ...scope,
                thing: k,
                value: read,
              });
              // Each line with the entry it carries, as typed.
              return /** @type {[string, string, string, ScopeFlags]} */ ([
                `${P} ${sub} ${slug} ${sub === 'set' ? setArgs(x, read) : undoArgs(x)}`,
                read,
                k,
                scope,
              ]);
            }),
            options.cwd ?? process.cwd(),
            objectText,
            // No one setting: each entry left out points to how for its
            // own (above), else set's help.
            '',
          ),
        },
      );
    }
  }
  // An undo of a setting and its value in one argument (`'accent red'`),
  // as set takes it: the first word names a setting and no other word
  // names a saved one (several are a list of settings, read below).
  if (
    sub === 'undo' &&
    objectText == null &&
    typeof thing === 'string' &&
    (value == null || value === '') &&
    !/,|\s(?:and|&)\s/i.test(thing) &&
    // A pasted form (`opacity = 0.5 on card`) is read by its own reader.
    !normalizeEntry(thing, undefined).pasted
  ) {
    const pair = /^\s*(\S+)\s+(\S.*?)\s*$/.exec(thing);
    const names = new Set(
      (savedAsWritten(options.cwd ?? process.cwd(), slug)?.settings ?? []).map(
        (/** @type {any} */ x) => String(x?.thing ?? '').toLowerCase(),
      ),
    );
    // The first word names a setting as set reads one: a saved setting, a
    // dial, a token or a property, or the one saved setting it is a typo
    // of (`cornres pill`). Whether the theme holds it is undo's to say.
    const first = pair ? pair[1].toLowerCase() : '';
    const firstNames =
      names.has(first) ||
      Boolean(DIALS[first]) ||
      first.startsWith('--') ||
      cssProperties().has(first) ||
      [...names].filter(n => typoNear(first, n)).length === 1;
    if (
      pair &&
      firstNames &&
      !pair[2].split(/\s+/).some(w => names.has(w.toLowerCase()))
    ) {
      thing = pair[1];
      value = pair[2];
    }
  }
  // A flag typed inside the value (`'red --mode dark'`, `'4px --state
  // hover'`, `'pill --on button'`): the same command with the flag lifted
  // out, never the value alone, which would change another scope.
  if (typeof value === 'string' && /\s--(mode|state|on|when)\b/.test(value)) {
    /** @type {Record<string, string>} */
    const lifted = {};
    // The rest is cleaned as any value is (a trailing `;`, `!important`,
    // a comment).
    const bare = withoutCopyDebris(
      value.replace(
        /\s+--(mode|state|on|when)(?:\s*=\s*|\s+)("[^"]*"|'[^']*'|\S+)/g,
        (_, f, x) => {
          lifted[f] = x.replace(/^(["'])(.*)\1$/, '$2');
          return '';
        },
      ),
    );
    if (bare && Object.keys(lifted).length) {
      const opts = /** @type {Record<string, unknown>} */ ({
        ...options,
        ...lifted,
      });
      const flagText = ['on', 'when', 'state', 'mode']
        .filter(f => opts[f])
        .map(f => ` --${f} ${quoteCommandArgument(String(opts[f]))}`)
        .join('');
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `"${value}" holds ${Object.keys(lifted)
          .map(f => `--${f}`)
          .join(' and ')} inside the value; a flag goes outside the quotes.`,
        {
          // The line is checked as set checks it; one set refuses is left
          // out, and how is named instead.
          run: await workingLines(
            sub,
            slug,
            [
              `${P} ${sub} ${slug} ${quoteCommandArgument(String(thing))}${sub === 'set' ? ` ${quoteCommandArgument(bare)}` : ''}${flagText}${options.only ? ' --only' : ''}`,
            ],
            options.cwd ?? process.cwd(),
            value,
            String(thing),
          ),
        },
      );
    }
  }
  // How it was typed, put right before anything reads it (a pasted
  // declaration, a dash, a var(), invisible spaces).
  /** @type {string | undefined} */
  let dropped;
  // A setting pasted in a printed or declared form (`padding = 8 px on
  // card`, `aspect-ratio: 16,9`, `accent tomato -> tomatoe`), whole or with
  // its thing apart: its repairs carry the setting and value read from it,
  // as a typed pair's do.
  let readFromText = false;
  if (typeof thing === 'string') {
    const entry = normalizeEntry(thing, value);
    readFromText =
      Boolean(entry.pasted) &&
      entry.value != null &&
      String(entry.value).trim() !== '';
    thing = entry.thing;
    value = entry.value;
    dropped = entry.dropped;
    // The scope the editor's own printed line names, where no flag gives
    // one.
    if (entry.scope) {
      const s = {...entry.scope};
      // A label that names no mode word is the part it names exactly (the
      // project's part names, as --on reads them: `(card)`), else a mode
      // for the mode reader's typo rule (`(drak)`).
      Object.assign(s, await labelRead(s, options.cwd ?? process.cwd()));
      delete s.label;
      options = {
        ...options,
        ...(s.on && !options.on ? {on: s.on} : {}),
        ...(s.only && !options.only ? {only: true} : {}),
        ...(s.when && !options.when ? {when: s.when} : {}),
        ...(s.state && !options.state ? {state: s.state} : {}),
        ...(s.mode && !options.mode ? {mode: s.mode} : {}),
      };
    }
  }
  /** @type {{ctx?: import('./_settings.mjs').Ctx, data?: import('./_settings.mjs').ThemeData}} */
  const seen = {};
  try {
    const r = await changeOnce(
      sub,
      slug,
      thing,
      value,
      options,
      seen,
      typedThing,
    );
    // A second declaration pasted after the first is not set: said, with
    // its own set line.
    if (dropped && sub === 'set') {
      const m = /^([^:]+):\s*(.*?);?\s*$/.exec(dropped);
      const flags = [
        ...(options.on ? [`--on ${options.on}`] : []),
        ...(options.when ? [`--when ${options.when}`] : []),
        ...(options.state ? [`--state ${options.state}`] : []),
      ].join(' ');
      // Its line goes through the one gate as a repair does: checked as set
      // checks it (a repair set offers for it folded in) and carrying what
      // was pasted; else no line is named.
      const [line] = m
        ? await workingLines(
            'set',
            slug,
            [
              `${P} set ${slug} ${quoteCommandArgument(m[1].trim())} ${quoteCommandArgument(m[2].trim())}${flags ? ` ${flags}` : ''}`,
            ],
            options.cwd ?? process.cwd(),
            m[2].trim(),
            m[1].trim(),
          )
        : [];
      /** @type {any} */ (r.data).notes = [
        ...(r.data.notes ?? []),
        `the pasted text also held "${dropped}", which this did not set${typeof line === 'string' && / set /.test(line) ? `: ${line} sets it` : ''}`,
      ];
    }
    // A mode or base entry in the settings list does nothing: said after
    // every change, with the undo that removes it.
    if (seen.ctx && r.data.theme) {
      /** @type {import('./_settings.mjs').ThemeData | null} */
      let now = null;
      try {
        now = loadTheme(seen.ctx.project.cwd, r.data.theme);
      } catch {
        now = null;
      }
      const left = now ? misplacedNotes(r.data.theme, now) : [];
      if (left.length)
        /** @type {any} */ (r.data).notes = [...left, ...(r.data.notes ?? [])];
    }
    return r;
  } catch (e) {
    // A refused change changed nothing: noted, for a later undo to say so.
    if (e instanceof AstryxError)
      noteRefused(
        options.cwd ?? process.cwd(),
        slug,
        [
          `${P.replace(/^astryx /, '')} ${sub} ${slug}`,
          ...[typedThing, typedValue]
            .filter(w => w != null && w !== '')
            .map(w => quoteCommandArgument(String(w))),
          ...(options.on ? [`--on ${options.on}`] : []),
          ...(options.when ? [`--when ${options.when}`] : []),
          ...(options.state ? [`--state ${options.state}`] : []),
          ...(options.mode ? [`--mode ${options.mode}`] : []),
          ...(options.only ? ['--only'] : []),
        ].join(' '),
      );
    // A theme name one letter off an existing theme, or typed in other
    // letters or as a path (T, ./t, themes/t): the same command with that
    // name comes first, never a bare look at the theme that drops the change.
    const named =
      e instanceof AstryxError &&
      (e.code === E.ERR_UNKNOWN_THEME ||
        (e.code === E.ERR_INVALID_ARGUMENT &&
          (e.suggestions ?? []).some(
            x =>
              x.reason === 'did you mean' &&
              slugOk(x.name) &&
              x.name !== slug &&
              fs.existsSync(
                themeFiles(options.cwd ?? process.cwd(), x.name).settings,
              ),
          )));
    if (named) {
      const near = (e.suggestions ?? []).find(x => x.reason === 'did you mean');
      if (near && slugOk(near.name)) {
        const flags = [
          ...(options.on ? ['--on', options.on] : []),
          ...(options.when ? ['--when', options.when] : []),
          ...(options.state ? ['--state', options.state] : []),
          ...(options.mode ? ['--mode', options.mode] : []),
          ...(options.only ? ['--only'] : []),
        ];
        const words = [thing, ...(value == null ? [] : [value]), ...flags]
          .filter(w => w != null && w !== '')
          .map(w =>
            String(w).startsWith('--') ? w : quoteCommandArgument(String(w)),
          );
        const followed = await followChangeLine(
          sub,
          near.name,
          `${P} ${sub} ${near.name}${words.length ? ` ${words.join(' ')}` : ''}`,
          options.cwd ?? process.cwd(),
        );
        // A step back with nothing to go back to is no line to offer: the
        // theme's show is.
        const stepless = !words.length && followed.why != null;
        e.suggestions = [
          stepless
            ? {
                name: `${P} show ${near.name}`,
                reason: `do this instead: ${near.name} is a theme here, and ${followed.why}`,
              }
            : {
                name: followed.line,
                reason: `do this instead: ${near.name} is a theme here${followed.why ? `, but this still needs a fix: ${followed.why}` : ''}`,
              },
          ...(e.suggestions ?? []).filter(
            x => x !== near && x.name !== `${P} show ${near.name}`,
          ),
        ];
      }
      throw e;
    }
    // Every `set` the refusal suggests is checked as `set` checks it, and
    // carries the value typed (cleaned), never a stock value.
    throw misplacedFirst(
      carryTyped(
        // A refusal of a saved entry gets set's repair for its value
        // beside the undo.
        await savedDamageRefusal(e, slug, options.cwd ?? process.cwd(), seen),
        sub,
        slug,
        oneEntry || readFromText ? thing : typedThing,
        oneEntry || readFromText ? value : typedValue,
        seen.data ?? savedAsWritten(options.cwd ?? process.cwd(), slug),
        options.cwd ?? process.cwd(),
      ),
      seen.data?.name ?? slug,
      seen.data,
    );
  }
}

/**
 * @param {'set' | 'undo'} sub
 * @param {string} slug
 * @param {string} thing
 * @param {string | undefined} value
 * @param {ChangeOptions} options
 * @param {{ctx?: import('./_settings.mjs').Ctx, data?: import('./_settings.mjs').ThemeData}} seen
 *   the context and the theme as loaded, for checking a refusal's suggestions
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
async function changeOnce(
  sub,
  slug,
  thing,
  value,
  options,
  seen,
  typedThing = thing,
) {
  const {cwd = process.cwd(), png = false} = options;
  requireProject(cwd);
  // The setting this command changes or removes may be the bad one; any
  // other bad setting still refuses (or is left out when this fixes one).
  const target = /** @type {Partial<import('./_settings.mjs').Setting>} */ ({
    // An undo may name a saved entry exactly as written; a set names the
    // setting as the settings file holds it (a property or token typed in
    // other letters, `Background-Color`, is that property or token), so it
    // is the change that fixes that setting listed twice.
    thing:
      sub === 'undo'
        ? typedThing
        : options.on && !String(thing).startsWith('--')
          ? (propertySpelling(String(thing)) ?? thing)
          : String(thing).startsWith('--')
            ? String(thing).toLowerCase()
            : thing,
    on: options.on,
    when: options.when,
    state: options.state,
    mode: options.mode,
    // An undo removes the entry it names even when that entry's mode or
    // source means nothing.
    ...(sub === 'undo' ? {removing: true} : {}),
  });
  /** @type {import('./_settings.mjs').ThemeData} */
  let data;
  try {
    data = loadTheme(cwd, slug, target);
  } catch (e) {
    throw await withSavedRepair(e, slug, cwd);
  }
  const ctx = await context(cwd);
  // A saved state in a spelling set reads is the part's own, noted with the
  // other entries read before this command's notes are taken.
  readSavedStates(ctx, data);
  /** @type {string[]} */
  // A damaged mode or base the command does not set itself is read as
  // meant, or goes back to its default, so the theme loads again.
  const fieldNotes = [
    ...entryNotes(data),
    ...readFields(
      data,
      cwd,
      thing === 'mode' || thing === 'base' ? thing : undefined,
      slug,
    ),
  ];
  // A --png takes the sample page and the open states again after the build.
  ctx.takesPictures = png ? {sheet: null} : null;
  // An undo of one setting only removes it, so it never waits on the
  // others being fixed.
  if (sub !== 'undo') {
    refuseStoredTokens(ctx, slug, data, {
      thing,
      on: options.on,
      when: options.when,
      state: options.state,
      mode: options.mode,
    });
  }
  const flags = {
    on: options.on,
    when: options.when,
    state: options.state,
    mode: options.mode,
    only: options.only,
  };
  /** @type {{light: Record<string, string>, dark: Record<string, string>}} */
  let base;
  try {
    base = await baseResolved(ctx.project, data.like);
  } catch (e) {
    // A base package that is gone: moving off it still works.
    if (!(sub === 'set' && thing === 'base')) throw e;
    base = await baseResolved(
      ctx.project,
      value === 'none' ? undefined : value,
    );
  }
  /** @type {import('./_settings.mjs').Ctx} */ (ctx).base = base;
  seen.ctx = ctx;
  seen.data = structuredClone(data);
  // The saved entry the command names exactly as written (thing and
  // scope, in their own letters, the one its load skipped), when the editor
  // would read it as another setting or refuse it: undo removes that
  // entry, never a valid neighbor the cleaned name also matches, and set
  // writes its setting in that entry's place, so the damaged one is gone.
  const exactIdx = data.settings.findIndex(
    x =>
      x.thing === target.thing &&
      (x.on ?? null) === (flags.on ?? null) &&
      (x.when ?? null) === (flags.when ?? null) &&
      stateKeyOf(x.state) === stateKeyOf(flags.state) &&
      (x.mode ?? null) === (flags.mode ?? null) &&
      Boolean(x.only) === Boolean(flags.only),
  );
  // An entry of this name whose mode or source means nothing is the one an
  // undo removes: only that entry, never a valid one beside it.
  const damagedIdx =
    sub === 'undo'
      ? data.settings.findIndex(x => {
          const damage = entryDamage(x);
          // Each place the same, or the damaged one with no flag for it.
          const place = (/** @type {'on' | 'when' | 'state'} */ k) =>
            (x[k] ?? null) === (flags[k] ?? null) ||
            (damage === k && !flags[k]);
          return (
            (x.thing === typedThing || x.thing === thing) &&
            place('on') &&
            place('when') &&
            place('state') &&
            (damage === 'only' || Boolean(x.only) === Boolean(flags.only)) &&
            (damage === 'mode'
              ? !flags.mode
              : damage != null && (x.mode ?? null) === (flags.mode ?? null))
          );
        })
      : -1;
  let rawIdx = damagedIdx;
  if (exactIdx >= 0 && rawIdx < 0) {
    // Only an entry the editor would not save as written: one it refuses,
    // or reads as another name, part or state.
    const entry = data.settings[exactIdx];
    let read = null;
    try {
      read = checkSetting(
        ctx,
        slug,
        data,
        normalizeEntry(entry.thing, '').thing,
        undefined,
        {
          on: entry.on,
          when: entry.when,
          state: entry.state,
          mode: entry.mode,
          only: entry.only,
        },
        true,
      );
    } catch {
      // Refused as written.
    }
    if (
      !read ||
      read.thing !== entry.thing ||
      (read.on ?? null) !== (entry.on ?? null) ||
      (read.state ?? null) !== (entry.state ?? null) ||
      (read.when ?? null) !== (entry.when ?? null)
    )
      rawIdx = exactIdx;
  }
  /** The saved settings' names, in lower case. */
  const things = [...new Set(data.settings.map(x => x.thing.toLowerCase()))];
  /** Whether a word names a saved setting (a typo of one too). @param {string} w */
  const namesSaved = w => {
    const t = String(w).trim().toLowerCase();
    return things.includes(t) || nearest(t, things).length > 0;
  };
  /**
   * A list of settings named for undo (`corners, padding`, `corners and
   * accent`, or split across the thing and its value): one undo for each
   * saved setting it names, never a step back, which would remove a
   * change none of them names. Returns when the text names fewer than
   * two pieces or no saved setting.
   * @param {string} text
   * @param {string} code
   */
  const undoList = (text, code) => {
    const words = text
      .toLowerCase()
      .split(/\s*,\s*|\s+(?:and|&)\s+|\s+/)
      .filter(Boolean);
    if (words.length < 2) return;
    // A setting named twice is named once.
    const pieces = [...new Set(words)];
    // Of a setting saved in several scopes, those in the scope typed (a
    // part, a state) when it has any there.
    const inScope = (/** @type {any} */ x) =>
      ['on', 'when', 'state', 'mode'].every(
        k =>
          !(/** @type {any} */ (flags)[k]) ||
          x[k] === /** @type {any} */ (flags)[k],
      );
    const listed = pieces.map(w => {
      const meant = things.includes(w) ? w : nearest(w, things)[0];
      const all = data.settings.filter(x => x.thing.toLowerCase() === meant);
      const scoped = all.filter(inScope);
      return {w, entries: scoped.length ? scoped : all};
    });
    // A list names two saved settings or more (or one twice); with one,
    // the rest is its value (`accent red`), read as set reads it.
    const named = listed.filter(l => l.entries.length).length;
    if (!named || (pieces.length > 1 && named < 2)) return;
    // A word that is the value a listed setting holds (`corners pill
    // accent`) is that setting's value, never a setting the theme lacks.
    const held = new Set(
      listed.flatMap(l =>
        l.entries.map(x => String(x.value ?? '').toLowerCase()),
      ),
    );
    const none = listed
      .filter(l => !l.entries.length && !held.has(l.w))
      .map(l => l.w);
    const count = named + none.length;
    throw new AstryxError(
      `"${text}" names ${pieces.length === 1 ? `${pieces[0]} more than once` : `${count} settings`}; undo removes one setting at a time${none.length ? ` (${slug} sets no ${none.join(' or ')})` : ''}. Nothing was changed.`,
      [...new Set(listed.flatMap(l => l.entries))].map(x => ({
        name: `${P} undo ${slug} ${undoArgs(x)}`,
        reason: `removes ${describe({...x, value: '?'}).replace(' = ?', '')}`,
      })),
      code,
    );
  };
  /** @type {import('./_settings.mjs').Setting} */
  let s;
  try {
    s =
      sub === 'undo' && rawIdx >= 0
        ? data.settings[rawIdx]
        : checkSetting(ctx, slug, data, thing, value, flags, sub === 'undo');
  } catch (e) {
    // A stored setting this Core no longer knows (a renamed part or
    // property, or a hand edit) can still be removed.
    const stored =
      sub === 'undo'
        ? data.settings.find(
            x =>
              x.thing.toLowerCase() === String(thing).toLowerCase() &&
              (x.on ?? null) === (flags.on ?? null) &&
              (x.when ?? null) === (flags.when ?? null) &&
              stateKeyOf(x.state) === stateKeyOf(flags.state) &&
              (x.mode ?? null) === (flags.mode ?? null) &&
              // --only names a setting made with it; it is never dropped.
              Boolean(x.only) === Boolean(flags.only),
          )
        : null;
    if (!stored) {
      // An undo is told what it can undo, never a `set`: the settings of
      // what it named (or of the dial its refusal names), else the last
      // step.
      if (sub === 'undo' && e instanceof AstryxError) {
        // Setting names are matched in any case, and a near name of a
        // setting the theme has counts: `undo t Corners`, `undo t corner`.
        const typed = String(thing).toLowerCase();
        // A token named without its dashes (radius-element) is the token.
        const dashed = typed.startsWith('--') ? typed : `--${typed}`;
        const named = new Set([
          typed,
          dashed,
          ...(e.suggestions ?? [])
            .filter(x => x.reason === 'did you mean')
            .map(x => x.name.toLowerCase()),
          ...(e.suggestions ?? [])
            .map(
              x => new RegExp(` (?:set|undo) ${slug} (\\S+)`).exec(x.name)?.[1],
            )
            .filter(Boolean),
          ...nearest(
            typed,
            data.settings.map(x => x.thing.toLowerCase()),
          ),
        ]);
        const matches = data.settings.filter(x =>
          named.has(x.thing.toLowerCase()),
        );
        // A word that is near a setting name (a typo, another case) is never
        // answered with a bare step back, which would undo another change;
        // only `all` or `last` asks for the last step.
        // A token or a property named (radius-element, padding) is a named
        // thing too: never answered with a step back.
        const namesThing =
          ctx.C.isToken(dashed) ||
          data.settings.some(
            x => x.source === 'property' && x.thing.toLowerCase() === typed,
          ) ||
          /^[a-z]+(-[a-z]+)+$|^(padding|margin|color|background|border|gap|width|height|opacity)$/.test(
            typed,
          );
        const nearSetting =
          namesThing ||
          named.size > (dashed === typed ? 1 : 2) ||
          nearest(typed, [
            ...Object.keys(DIALS),
            ...data.settings.map(x => x.thing.toLowerCase()),
          ]).length > 0;
        const steps = readHistory(themeFiles(cwd, slug).history).steps.length;
        // A list of settings (`corners, padding`, `corners and accent`),
        // the value word included when it names one: one undo for each.
        undoList(
          value != null && value !== '' && namesSaved(value)
            ? `${typed} ${String(value).toLowerCase()}`
            : typed,
          e.code,
        );
        /**
         * The scope the flags typed name, as a `set|undo <theme> …` line
         * reads them back: the scope of the first such line offered, else
         * the flags as typed (`--on Card`, `cards`, `--mode drak`,
         * `--state hovered` are read by set's own check, which writes the
         * line).
         * @param {Array<{name: string}>} offered
         * @returns {Record<string, string | undefined>}
         */
        const scopeFromLines = offered => {
          /** @type {Record<string, string | undefined>} */
          const read = {
            on: flags.on,
            when: flags.when,
            state: flags.state,
            mode: flags.mode,
          };
          for (const x of offered) {
            const at = x.name.indexOf(' editor ');
            const words =
              at >= 0
                ? splitCommand(x.name.slice(at + ' editor '.length))
                : null;
            if (
              !words ||
              !['set', 'undo'].includes(words[0]) ||
              words[1] !== slug
            )
              continue;
            for (const k of /** @type {const} */ ([
              'on',
              'when',
              'state',
              'mode',
            ])) {
              const n = words.indexOf(`--${k}`);
              if (flags[k] != null && n > 0 && words[n + 1] != null)
                read[k] = words[n + 1];
            }
            break;
          }
          return read;
        };
        /**
         * The typed scope as set's own check reads it for a thing: the
         * scope of the setting it reads, or of the line its refusal
         * offers (scopeFromLines).
         * @param {string} th
         * @param {string} val
         * @returns {Record<string, string | undefined>}
         */
        const scopeAsRead = (th, val) => {
          if (!(flags.on || flags.when || flags.state || flags.mode))
            return scopeFromLines([]);
          try {
            const got = checkSetting(
              ctx,
              slug,
              structuredClone(data),
              th,
              val,
              flags,
              true,
            );
            return {
              on: got.on,
              when: got.when,
              state: got.state,
              mode: got.mode,
            };
          } catch (err) {
            return scopeFromLines(/** @type {any} */ (err)?.suggestions ?? []);
          }
        };
        // The setting whose scope is the one typed (no --on: the whole
        // theme's) leads; with none of that scope, the message says so and
        // the others are listed after it.
        /** @type {Record<string, string | undefined>} */
        const meant = scopeFromLines(e.suggestions ?? []);
        const sameScope = (/** @type {any} */ x) =>
          (x.on ?? null) === (meant.on ?? null) &&
          (x.when ?? null) === (meant.when ?? null) &&
          stateKeyOf(x.state) === stateKeyOf(meant.state) &&
          (x.mode ?? null) === (meant.mode ?? null);
        /**
         * How near a saved setting is to the scope typed, read as `m`: its
         * whole scope (the most), else how many of the flags typed it
         * shares (`--on card` with a card setting in a state leads ahead
         * of a whole-theme one).
         * @param {any} x
         * @param {Record<string, string | undefined>} m
         */
        const nearness = (x, m) => {
          const same = (/** @type {string} */ k) =>
            k === 'state'
              ? stateKeyOf(x.state) === stateKeyOf(m.state)
              : (x[k] ?? null) === (m[k] ?? null);
          const keys = /** @type {const} */ (['on', 'when', 'state', 'mode']);
          if (keys.every(same)) return 10;
          return keys.filter(
            k => /** @type {any} */ (flags)[k] != null && same(k),
          ).length;
        };
        /** Stable, nearest first. @param {any[]} list @param {(x: any) => number} by */
        const nearestFirst = (list, by) =>
          list
            .map((x, i) => ({x, i, n: by(x)}))
            .sort((a, b) => b.n - a.n || a.i - b.i)
            .map(e => e.x);
        const ordered = nearestFirst(matches, x => nearness(x, meant));
        const scoped = flags.on || flags.when || flags.state || flags.mode;
        // A word that is a value the theme holds (`undo t red`) names the
        // setting that holds it: its undo, never a step back that takes back
        // another change.
        // A value then the setting holding it (`undo t red accent`): the
        // two in the other order, as set reads them.
        const swapped =
          value != null && value !== ''
            ? data.settings.filter(
                x =>
                  x.thing.toLowerCase() === String(value).toLowerCase() &&
                  valueIs(x.value, typed),
              )
            : [];
        if (swapped.length)
          throw new AstryxError(
            `"${thing}" is no setting; ${value} is the setting and ${thing} its value. Nothing was changed.`,
            swapped.slice(0, 5).map(x => ({
              name: `${P} undo ${slug} ${setArgs(x, String(x.value))}`,
              reason: `do this instead: ${x.thing} is the setting and ${thing} its value`,
            })),
            e.code,
          );
        const holding =
          matches.length || (value != null && value !== '')
            ? []
            : data.settings.filter(x => valueIs(x.value, typed));
        // The one in the scope typed (read as set reads it for that
        // setting) leads.
        const byValue = nearestFirst(holding, x =>
          nearness(x, scopeAsRead(x.thing, String(x.value))),
        );
        if (byValue.length)
          throw new AstryxError(
            `"${thing}" is no setting; ${slug} holds it as the value of ${byValue.map(x => describe(x)).join(', ')}. Nothing was changed.`,
            byValue.slice(0, 5).map(x => ({
              name: `${P} undo ${slug} ${setArgs(x, String(x.value))}`,
              reason: `do this instead: ${thing} is the value of ${describe(x)}`,
            })),
            e.code,
          );
        // A step back takes back the last change, which may be another
        // setting: it says what it takes back, and a look at the theme
        // follows it.
        const takes = steps ? lastStepTakes(cwd, slug, data) : [];
        throw new AstryxError(
          matches.length && !matches.some(sameScope) && scoped
            ? `${e.message.replace(/\s*Nothing was changed\.$/, '')} ${slug} sets ${matches[0].thing} only where these lines name. Nothing was changed.`
            : e.message,
          matches.length
            ? ordered.slice(0, 5).map(x => ({
                name: `${P} undo ${slug} ${undoArgs(x)}`,
                reason: sameScope(x)
                  ? 'do this instead'
                  : `do this instead: ${describe({...x, value: '?'}).replace(' = ?', '')}`,
              }))
            : // A plain step back can take back another change than the
              // one typed: it is offered only for `all` or `last`, which
              // ask for the last step; any other word gets a look.
              steps && !nearSetting && /^(all|last)$/.test(typed)
              ? [
                  {
                    name: `${P} undo ${slug}`,
                    reason: `step back one change${takes.length ? `, which takes back ${takes.join('; ')}` : ''}`,
                  },
                  {name: `${P} show ${slug}`, reason: 'see what it sets'},
                ]
              : [
                  // An undo the check itself offers for the word (`like`
                  // is the base: `undo t base`) leads.
                  ...(e.suggestions ?? []).filter(x =>
                    new RegExp(`^${P} undo ${slug} base$`).test(x.name),
                  ),
                  {name: `${P} show ${slug}`, reason: 'see what it sets'},
                ],
          e.code,
        );
      }
      throw e;
    }
    s = stored;
  }
  // A color set with no --mode in a one-mode theme is that mode's color, as
  // the build reads it (it fills that mode's half): saved with the mode, so
  // the theme going back to both modes keeps it there, and a color saved
  // for the other mode (the half a toast or a lightbox reads) stays. An
  // undo with no --mode names that entry too.
  const ownMode =
    data.mode === 'dark-only'
      ? 'dark'
      : data.mode === 'light-only'
        ? 'light'
        : null;
  if (
    ownMode &&
    sub === 'set' &&
    !s.mode &&
    s.source !== 'dial' &&
    typeof s.value === 'string' &&
    parseColor(s.value.trim()) != null &&
    (s.source === 'property' || MODAL.has(ctx.C.typeOf(s.thing)))
  )
    s = {...s, mode: ownMode};
  if (
    ownMode &&
    sub === 'undo' &&
    !s.mode &&
    !data.settings.some(x => keyOf(x) === keyOf(s)) &&
    data.settings.some(x => keyOf(x) === keyOf({...s, mode: ownMode}))
  )
    s = {...s, mode: ownMode};
  let k = keyOf(s);
  let prevIdx =
    rawIdx >= 0
      ? rawIdx
      : // A setting listed twice by hand: the last entry is the one the
        // build reads, so it is the one this command changes.
        data.settings.map(x => keyOf(x)).lastIndexOf(k);
  /** @type {string | null} */
  let vibrancyGone = null;
  let prev = prevIdx >= 0 ? data.settings[prevIdx] : null;
  /** The other entries of a setting listed twice by hand that this command replaces or removes. @type {import('./_settings.mjs').Setting[]} */
  let alsoReplaced = [];
  // A value is compared as `set` reads it: case, spacing around commas,
  // slashes and parentheses, and the quote style are not part of it.
  const norm = (/** @type {string} */ x) =>
    x
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*([,()/])\s*/g, '$1')
      .replace(/'/g, '"')
      .replace(/^"|"$/g, '');
  // A color is compared as the color it names: a short hex, another letter
  // case or its name is the saved color.
  const sameColor = (/** @type {string} */ a, /** @type {string} */ b) => {
    const ca = parseColor(String(a).trim());
    const cb = parseColor(String(b).trim());
    return Boolean(ca && cb && hex(ca) === hex(cb));
  };
  /** Whether a saved entry holds the typed value. @param {import('./_settings.mjs').Setting} held @param {string} typed */
  const holds = (held, typed) =>
    norm(String(held.value)) === norm(typed) ||
    norm(String(held.value)) === norm(String(s.value ?? '')) ||
    sameColor(String(held.value), typed);
  if (sub === 'undo' && !prev && !s.mode) {
    // An undo with no --mode of a setting saved for one mode only: that
    // entry, named with its mode (before its value is checked, so a value
    // it does not hold is refused). Saved for each mode, a typed value
    // picks the entry that holds it; with none typed, one undo each.
    const modal = data.settings.filter(
      x =>
        x.thing === s.thing &&
        x.mode &&
        (x.on ?? null) === (s.on ?? null) &&
        (x.when ?? null) === (s.when ?? null) &&
        (x.state ?? null) === (s.state ?? null) &&
        Boolean(x.only) === Boolean(s.only),
    );
    const typed = value != null && value !== '' ? value : null;
    const picked =
      typed != null && modal.length > 1
        ? modal.filter(x => holds(x, typed))
        : modal;
    if (picked.length === 1) {
      s.mode = picked[0].mode;
      k = keyOf(s);
      prevIdx = data.settings.indexOf(picked[0]);
      prev = picked[0];
    } else if (modal.length > 1 && typed != null && picked.length === 0)
      refuse(
        E.ERR_THEME_NOT_SET,
        `${slug} sets ${describe({...s, value: '?'})
          .replace(' = ?', '')
          .replace(
            / \(whole theme\)$/,
            '',
          )} for each mode on its own (${modal.map(x => `${x.mode}: ${x.value}`).join('; ')}), not ${typed}.`,
        {run: modal.map(x => `${P} undo ${slug} ${undoArgs(x)}`)},
      );
    else if (modal.length > 1)
      refuse(
        E.ERR_THEME_NOT_SET,
        `${slug} sets ${describe({...s, value: '?'})
          .replace(' = ?', '')
          .replace(
            / \(whole theme\)$/,
            '',
          )} for each mode on its own (${modal.map(x => `${x.mode}: ${x.value}`).join('; ')}), so undo needs the one to remove: name its --mode.`,
        {run: modal.map(x => `${P} undo ${slug} ${undoArgs(x)}`)},
      );
  }
  // undo <thing> <value> removes the setting only when that is its value.
  if (sub === 'undo' && value != null && value !== '') {
    // A word that names a part with a setting of this thing meant --on.
    const onPart = data.settings.find(
      x => x.thing === s.thing && x.on === value.trim() && !s.on,
    );
    if (onPart)
      refuse(
        E.ERR_THEME_NOT_SET,
        `${value.trim()} is a part: ${describe(onPart)} is set; name the part with --on.`,
        {run: [`${P} undo ${slug} ${undoArgs(onPart)}`]},
      );
    // A setting listed twice by hand holds each of its values: the one
    // named is accepted, and the refusal names the last, which the build
    // reads and undo removes with the others.
    const heldAll = data.settings.filter(x => keyOf(x) === keyOf(s));
    const held = heldAll.at(-1);
    // `headings weight|tracking` names a half, not a value.
    const half =
      s.thing === 'headings' && ['weight', 'tracking'].includes(norm(value));
    // A headings word typed with a typo (wdie): the half its reading names
    // (the one typo limit), never the other half by default; with no single
    // reading, each half the theme sets.
    if (s.thing === 'headings' && !half) {
      const words = [
        ...Object.keys(HEADING_WEIGHTS),
        ...Object.keys(HEADING_TRACKING),
      ];
      const typedWord = norm(value);
      if (!words.includes(typedWord)) {
        const halves = data.settings.filter(
          x =>
            x.thing === 'headings' &&
            (x.on ?? null) === (s.on ?? null) &&
            (x.when ?? null) === (s.when ?? null) &&
            (x.state ?? null) === (s.state ?? null),
        );
        const readings = closestOf(typedWord, words);
        const axisOf = (/** @type {string} */ w) =>
          HEADING_TRACKING[w] !== undefined ? 'tracking' : 'weight';
        const meant =
          readings.length === 1
            ? halves.find(x => (x.axis ?? 'weight') === axisOf(readings[0]))
            : undefined;
        refuse(
          E.ERR_THEME_NOT_SET,
          meant
            ? `"${value}" is no headings word; it reads as ${readings[0]}, and the theme sets ${describe(meant)}.`
            : `The theme sets ${halves.map(describe).join(' and ') || 'no headings'}, not ${value}.`,
          {
            run: (meant ? [meant] : halves).map(
              x => `${P} undo ${slug} ${setArgs(x, String(x.value))}`,
            ),
          },
        );
      }
    }
    if (held && !half && !heldAll.some(x => holds(x, value))) {
      // A value word that names another saved setting (`undo t corners
      // padding`): one undo for each setting named.
      if (namesSaved(value)) undoList(`${thing} ${value}`, E.ERR_THEME_NOT_SET);
      refuse(
        E.ERR_THEME_NOT_SET,
        `The theme sets ${describe(held)}, not ${value}.`,
        {run: [`${P} undo ${slug} ${undoArgs(held)}`]},
      );
    }
  }
  const compiledBefore = compileTheme(ctx, data, base);
  // The build notes the theme had before this change: only new ones are
  // this change's to report.
  const notesBefore = new Set(buildNotes(ctx));
  // The color contrast checks the theme failed before this change (read
  // before anything is written): a check that already failed is no new
  // problem of this change, whatever ratio it reaches now.
  const paletteFailedBefore =
    sub === 'set'
      ? (() => {
          try {
            return paletteFailedKeys(
              paletteMapping(
                cwd,
                slug,
                data,
                base,
                ctx.project.core.tokenDefaults,
              ),
            );
          } catch {
            return new Set();
          }
        })()
      : new Set();
  /**
   * The checks a change made fail, each with the line that passes it when
   * one does (a darker exact color for a pale fill).
   * @param {Array<{key: string, text: string, fix?: {thing: string, value: string, mode?: string}}>} found
   * @returns {Array<{problem: string, fix: string | null}>}
   */
  const newFailures = found =>
    found
      .filter(x => !paletteFailedBefore.has(x.key))
      .map(x => ({
        problem: x.text,
        fix: x.fix
          ? `${P} set ${slug} ${x.fix.thing} ${quoteCommandArgument(x.fix.value)}${x.fix.mode && modesOf(data).length > 1 ? ` --mode ${x.fix.mode}` : ''}`
          : null,
      }));
  if (sub === 'set' && (s.thing === 'base' || s.thing === 'mode')) {
    const before = s.thing === 'base' ? (data.like ?? 'none') : data.mode;
    if (s.thing === 'base') {
      if (s.value === 'none') delete data.like;
      else data.like = s.value;
    } else
      data.mode = /** @type {'both' | 'light-only' | 'dark-only'} */ (s.value);
    const r = await commitTheme(ctx, slug, data, {history: true});
    const {cutShort, ...p} = await previewAndRoute(
      ctx,
      slug,
      data,
      png,
      'overview',
      sub,
    );
    const after = await baseResolved(ctx.project, data.like).catch(() => base);
    return {
      type: 'themeEdit.set',
      data: {
        theme: slug,
        action: 'set',
        setting: s,
        replaced: null,
        was: before,
        parts: [],
        group: null,
        changedTokens: r.changed,
        changedPartTokens: r.changedParts ?? [],
        styled: styledChanges(compiledBefore, compileTheme(ctx, data, after)),
        kept: [],
        lifted: r.lifted,
        leftOut: [],
        notes: [
          ...(r.unchanged
            ? [
                `no change: ${s.thing} is already ${s.value}, so nothing was built and no undo step was added`,
              ]
            : []),
          ...fieldNotes,
          ...r.notes,
          ...(data.settings.length
            ? [
                `your ${data.settings.length} setting${data.settings.length === 1 ? ' is' : 's are'} kept`,
              ]
            : []),
          ...otherModeNotes(data),
          // A theme the app lists takes its mode from the app's theme
          // module: `theme add` writes it again.
          ...(s.thing === 'mode' && before !== data.mode
            ? [
                addedModeNote(
                  cwd,
                  slug,
                  data.mode === 'light-only'
                    ? 'light'
                    : data.mode === 'dark-only'
                      ? 'dark'
                      : null,
                ),
              ].filter(x => x !== null)
            : []),
          // Back to both modes: a mode the app's <Theme> was given for the
          // one-mode theme pins it still.
          ...(s.thing === 'mode' &&
          !appListsTheme(cwd, slug) &&
          data.mode === 'both' &&
          (before === 'light-only' || before === 'dark-only')
            ? [
                `if the app's <Theme> was given mode="${before === 'light-only' ? 'light' : 'dark'}" for ${slug}, take it out: with it the app stays ${before === 'light-only' ? 'light' : 'dark'}, whatever the system asks for`,
              ]
            : []),
          // Core has no mode inside a theme: the app's <Theme> is given it.
          ...(s.thing === 'mode' &&
          !appListsTheme(cwd, slug) &&
          (data.mode === 'light-only' || data.mode === 'dark-only')
            ? [
                `the app shows ${slug} in ${data.mode === 'light-only' ? 'light' : 'dark'} mode when its <Theme> is given mode="${data.mode === 'light-only' ? 'light' : 'dark'}": \`${P.replace(' experimental theme editor', '')} theme add ${slug}\` records the theme and its mode, and the wiring it prints passes it (mode={themeModes[defaultThemeSlug] ?? 'system'}), so nothing else is needed; give it yourself only where the app renders <Theme> on its own. The theme keeps both halves of its colors, so a toast or a lightbox Core draws in the other mode stays readable`,
              ]
            : []),
          // The colors are made again for the new base or mode: their
          // shade notes follow.
          ...data.settings
            .filter(x => x.source === 'dial' && PALETTE_DIALS.includes(x.thing))
            .flatMap(x =>
              paletteNotes(
                paletteMapping(
                  cwd,
                  slug,
                  data,
                  after,
                  ctx.project.core.tokenDefaults,
                ),
                x.thing,
                slug,
                modesOf(data),
              ).slice(0, -1),
            ),
          ...cutShort.map(cutShortNote),
        ],
        problems: r.problems,
        newProblems: [
          ...problemLines(r.newProblems),
          ...cutShort.map(c => cutShortProblem(ctx, slug, c)),
        ],
        warnings: r.warnings,
        ...p,
      },
    };
  }
  if (sub === 'undo') {
    if (!prev) {
      // A value word that names another saved setting (`undo t spacing
      // background-color --on card`): one undo for each setting named,
      // never a line that removes one of them.
      if (value != null && value !== '' && namesSaved(value))
        undoList(`${thing} ${value}`, E.ERR_THEME_NOT_SET);
      // A property set in another form of the same family on the same
      // part is a near one too: a padding side for the shorthand (or the
      // other way), and a shorthand for the longhand it writes
      // (`background` for `background-color`, as CSS reads them).
      const PAD = /^padding(?:-(?:inline|block|top|right|bottom|left))?$/;
      /** The shorthand a property belongs to. @param {string} t */
      const family = t =>
        PAD.test(t)
          ? 'padding'
          : /^(?:background|border|font|margin|outline|transition|flex|grid|list-style|overflow|place|gap|inset)(?:-|$)/.test(
                t,
              )
            ? /^[a-z]+/.exec(t)?.[0]
            : null;
      const sameFamily = family(s.thing);
      const nearOnes = data.settings.filter(
        x =>
          x.thing === s.thing ||
          (sameFamily != null &&
            family(x.thing) === sameFamily &&
            (x.on ?? null) === (s.on ?? null) &&
            (x.when ?? null) === (s.when ?? null) &&
            (x.state ?? null) === (s.state ?? null)),
      );
      const near = nearOnes.map(describe);
      // A token the theme's own source sets: that file is where it is
      // changed, never the settings.
      const ownEntry =
        s.thing.startsWith('--') && !s.on && !s.when && !s.state
          ? ownTokenEntries(cwd, slug).find(
              x =>
                x.token === s.thing &&
                !x.overridden &&
                x.kind !== 'scoped' &&
                x.kind !== 'chain',
            )
          : undefined;
      if (ownEntry) {
        const file = ownEntry.file
          ? path.relative(cwd, ownEntry.file)
          : `themes/${slug}/${slug}.theme.ts`;
        refuse(
          E.ERR_THEME_NOT_SET,
          `The settings do not set ${s.thing}: ${file} sets it itself${ownEntry.line ? ` (line ${ownEntry.line})` : ''}, so undo has nothing to remove; change or remove it in ${file}.`,
          {
            run: [
              ownEntry.line
                ? `sed -n ${ownEntry.line}p ${quoteCommandArgument(file)}`
                : `grep -n -- ${quoteCommandArgument(s.thing)} ${quoteCommandArgument(file)}`,
            ],
          },
        );
      }
      // headings has two halves: name the one that is set.
      const otherHalf =
        s.thing === 'headings'
          ? data.settings.find(x => x.thing === 'headings' && x.axis !== s.axis)
          : null;
      refuse(
        E.ERR_THEME_NOT_SET,
        otherHalf
          ? `The theme sets only the headings ${otherHalf.axis ?? 'weight'} half (${describe(otherHalf)}), not its ${s.axis ?? 'weight'}; \`${P} undo ${slug} ${undoArgs(otherHalf)}\` removes the one that is set.`
          : `The theme does not set ${describe({...s, value: '?'}).replace(' = ?', '')}.`,
        {
          also: near.length
            ? [
                `settings for ${s.thing}: ${near.join('; ')}${nearOnes.some(x => x.thing === 'padding' && s.thing !== 'padding') ? ' (undoing padding removes all four sides)' : ''}`,
              ]
            : [],
          run: [
            ...nearOnes
              .slice(0, 3)
              .map(x => `${P} undo ${slug} ${undoArgs(x)}`),
            `${P} show ${slug}`,
          ],
        },
      );
    }
    data.settings.splice(prevIdx, 1);
    // A setting listed twice by hand goes in full, and each entry removed
    // is named.
    alsoReplaced = data.settings.filter(x => keyOf(x) === k);
    data.settings = data.settings.filter(x => keyOf(x) !== k);
    // Vibrancy needs a color: undoing the last one takes it along, so the
    // theme never holds a state `set` refuses.
    if (
      PALETTE_DIALS.includes(s.thing) &&
      !data.settings.some(
        x => x.source === 'dial' && PALETTE_DIALS.includes(x.thing),
      )
    ) {
      const v = data.settings.findIndex(
        x => x.source === 'dial' && x.thing === 'vibrancy',
      );
      if (v >= 0)
        vibrancyGone = /** @type {string} */ (
          data.settings.splice(v, 1)[0]?.value
        );
    }
  } else if (
    prev &&
    JSON.stringify(prev) === JSON.stringify(s) &&
    // A later setting that covers the same parts hides it: set again, it
    // moves last and wins.
    !data.settings
      .slice(prevIdx + 1)
      .some(
        x =>
          x.thing === s.thing &&
          partsOf(ctx, x).some(t => partsOf(ctx, s).includes(t)),
      )
  ) {
    // The same setting again: nothing moves.
  } else {
    // A changed setting goes last, so it wins over what came before it.
    if (prev) data.settings.splice(prevIdx, 1);
    data.settings.push(s);
  }
  // A setting listed twice by hand keeps only the entry this command left;
  // every other entry it replaces is named in the notes.
  // A damaged entry the theme was read past as the one this set changes
  // (a headings entry whose axis names no half) is replaced by it too,
  // never left to refuse every later command.
  if (sub === 'set') {
    const last = data.settings.map(x => keyOf(x)).lastIndexOf(k);
    const replaced = (
      /** @type {import('./_settings.mjs').Setting} */ x,
      /** @type {number} */ i,
    ) =>
      (keyOf(x) === k && i !== last) ||
      (x !== s &&
        keyOf(x) !== k &&
        skips(x, s) &&
        entryProblem(x, data) != null);
    alsoReplaced = data.settings.filter(replaced);
    data.settings = data.settings.filter((x, i) => !replaced(x, i));
  }
  // A setting for both modes replaces the ones made for one mode, which it
  // would otherwise sit under.
  /** @type {import('./_settings.mjs').Setting[]} */
  const covered =
    sub === 'set' && !s.mode && s.source !== 'dial'
      ? data.settings.filter(
          x =>
            x !== s &&
            x.mode &&
            (keyOf({...x, mode: undefined}) === k ||
              // The background shorthand and its color are one property
              // here: a one-mode one is replaced by either for both modes.
              (s.source === 'property' &&
                x.source === 'property' &&
                x.on === s.on &&
                x.when === s.when &&
                x.state === s.state &&
                [x.thing, s.thing].every(t =>
                  /^background(-color)?$/.test(kebab(t)),
                ) &&
                !/gradient\(|url\(/i.test(String(s.value)))),
        )
      : [];
  data.settings = data.settings.filter(x => !covered.includes(x));
  // A shorthand set after its longhands on the same part replaces them.
  const longhands =
    sub === 'set' && s.source === 'property'
      ? data.settings.filter(
          x =>
            x !== s &&
            x.source === 'property' &&
            // On the same part, or on a member of the group it is set on:
            // the later setting wins, whichever way Core writes it.
            (x.on === s.on ||
              (s.on != null &&
                (FAMILIES[s.on] ?? []).includes(
                  /** @type {string} */ (x.on),
                ))) &&
            x.when === s.when &&
            x.state === s.state &&
            // A shorthand for one mode replaces longhands of that mode only:
            // a longhand set for both modes still holds the other mode.
            (!s.mode || x.mode === s.mode) &&
            // A longhand the shorthand really sets (MDN's data), never a
            // property that only shares its name (overflow-wrap).
            (coversProperty(s.thing, x.thing) ||
              coversProperty(logicalSide(s.thing), logicalSide(x.thing))),
        )
      : [];
  // They go, as the note says: Core writes each side to its own variable,
  // where a later shorthand would not win over them (undo brings them back).
  data.settings = data.settings.filter(x => !longhands.includes(x));
  // A group setting covers part settings made before it for its members.
  const covers =
    sub === 'set' && s.source === 'dial' && s.on && FAMILIES[s.on]
      ? data.settings.filter(
          x =>
            x !== s &&
            x.thing === s.thing &&
            x.on &&
            FAMILIES[/** @type {string} */ (s.on)].includes(x.on) &&
            (x.when ?? '') === (s.when ?? '') &&
            (x.state ?? '') === (s.state ?? ''),
        )
      : [];
  const r = await commitTheme(ctx, slug, data, {history: true});
  await sayNextStepClears(ctx, slug, s, r);
  const compiledAfter = compileTheme(ctx, data, base);
  // What the spacing dial said of the sizes it could not keep apart.
  // What the build said of settings it could not write as they are.
  const compileNotes = buildNotes(ctx).filter(n => !notesBefore.has(n));
  const sizeNotes =
    /** @type {{sizeNotes?: string[]}} */ (/** @type {unknown} */ (ctx))
      .sizeNotes ?? [];
  const styled = styledChanges(compiledBefore, compiledAfter, base);
  const parts = partsOf(ctx, s);
  // Exact whole-theme tokens that win over what this dial writes: the dial
  // changes them only in a theme without them.
  /** @type {import('./_settings.mjs').Setting[]} */
  let exactWins = [];
  /** Tokens this whole-theme dial changes. */
  let dialTokens = new Set();
  if (sub === 'set' && s.source === 'dial' && !s.on) {
    const touched = dialTouched(ctx, data, s, base);
    exactWins = data.settings.filter(
      x => x.source === 'token' && !x.on && !x.when && touched.has(x.thing),
    );
    dialTokens = touched;
  }
  // A role font (font X --on heading) writes --font-family-<role>: an exact
  // setting of that token wins over it.
  if (sub === 'set' && s.thing === 'font' && s.on && FONT_ROLES.includes(s.on))
    exactWins = data.settings.filter(
      x =>
        x.source === 'token' &&
        !x.on &&
        !x.when &&
        x.thing === `--font-family-${s.on}`,
    );
  // A whole-theme spacing dial keeps a part's own exact control size too,
  // on that part.
  if (sub === 'set' && s.source === 'dial' && s.thing === 'spacing' && !s.on)
    exactWins.push(
      ...data.settings.filter(
        x =>
          x.source === 'token' &&
          !!x.on &&
          !x.state &&
          /^--size-element-/.test(x.thing),
      ),
    );
  // A spacing dial on a part keeps the exact spacing and sizes there too:
  // the whole theme's, and the part's own.
  if (sub === 'set' && s.source === 'dial' && s.thing === 'spacing' && s.on)
    exactWins = data.settings.filter(
      x =>
        x.source === 'token' &&
        !x.when &&
        !x.state &&
        /^--(size-element|spacing)-/.test(x.thing) &&
        (!x.on || x.on === s.on),
    );
  // The theme's own source wins over an exact setting, as the exact
  // setting does over a dial: an exact token the file also sets is named
  // as the file's below, never as the one that shows after an undo.
  const ownFirst = new Set(ownSourceTokens(cwd, slug));
  exactWins = exactWins.filter(x => !ownFirst.has(x.thing));
  const kept =
    sub === 'set' && s.source === 'dial' && !s.on
      ? [
          ...data.settings.filter(x => x.thing === s.thing && x.on),
          ...exactWins,
        ].map(describe)
      : [];
  // The role fonts a whole-theme font sits under.
  // An exact --font-family-<role> wins over both: that role is named by
  // the exact note instead.
  /** @param {string} role */
  const exactFamily = role =>
    data.settings.find(
      x =>
        x.source === 'token' &&
        !x.on &&
        !x.when &&
        x.thing === `--font-family-${role}`,
    );
  const roleOver =
    sub === 'set' && s.thing === 'font' && !s.on
      ? data.settings.filter(
          x =>
            x.thing === 'font' &&
            x.on &&
            ['body', 'heading'].includes(x.on) &&
            !exactFamily(x.on),
        )
      : [];
  if (sub === 'set' && s.thing === 'font' && !s.on)
    for (const role of FONT_ROLES) {
      const exact = exactFamily(role);
      if (exact && !exactWins.includes(exact)) exactWins.push(exact);
    }
  // The exact property a dial on a part competes with there.
  const DIAL_PROPERTY = wordTable(
    /** @type {Record<string, RegExp>} */ ({
      corners: /radius$/,
      spacing: /^(padding|gap)(-|$)/,
    }),
  );
  // A whole-theme look dial (buttons, surfaces) writes part properties
  // too: an exact property on one of them wins there, read from the build.
  const looksOver =
    sub === 'set' && s.source === 'dial' && !DIAL_PROPERTY[s.thing]
      ? (() => {
          const writes = dialWrites(ctx, data, s, base);
          if (!writes.size) return null;
          return (
            data.settings.find(
              x =>
                x.source === 'property' &&
                x.on &&
                !x.when &&
                !x.state &&
                partsOf(ctx, x).some(t => writes.has(`${t}\0${x.thing}`)) &&
                // (The dial's rule on a variant is more specific than the
                // exact property on the part's plain rule: there the dial
                // wins, so the exact property does not win everywhere.)
                !partsOf(ctx, x).some(t =>
                  writes.has(`${t}\0${x.thing}\0variant`),
                ),
            ) ?? null
          );
        })()
      : null;
  const exactOver =
    looksOver ??
    (sub === 'set' && s.source === 'dial' && s.on && DIAL_PROPERTY[s.thing]
      ? (data.settings.find(
          x =>
            x.source === 'property' &&
            DIAL_PROPERTY[s.thing].test(x.thing) &&
            x.on &&
            partsOf(ctx, x).some(t => partsOf(ctx, s).includes(t)) &&
            (x.when ?? '') === (s.when ?? '') &&
            (x.state ?? '') === (s.state ?? ''),
        ) ?? null)
      : null);
  // An exact token the theme's own source also sets: the file's value
  // shows (read from what the build made of it), not the setting.
  // On parts: every property or token this change writes on a part's
  // plain or variant rule (a dial's too, and each member of a group) that
  // the own source sets on that same rule.
  /** @type {Array<{target: string, key: string, state?: string | null, prop: string, value: string | null}>} */
  const ownPartHits = [];
  if (sub === 'set' && s.on) {
    const a = /** @type {any} */ (compiledBefore)?.components ?? {};
    const b = /** @type {any} */ (compiledAfter)?.components ?? {};
    for (const target of new Set([...Object.keys(a), ...Object.keys(b)]))
      for (const key of new Set([
        ...Object.keys(a[target] ?? {}),
        ...Object.keys(b[target] ?? {}),
      ])) {
        if (key !== 'base' && !key.startsWith('variant:')) continue;
        const x = a[target]?.[key] ?? {};
        const y = b[target]?.[key] ?? {};
        /**
         * The changed properties of one rule (or a state block in it)
         * the own source sets there too.
         * @param {any} xs @param {any} ys @param {string | null} state
         */
        const compare = (xs, ys, state) => {
          /** @type {Map<string, string | null> | null} */
          let own = null;
          for (const prop of new Set([
            ...Object.keys(xs ?? {}),
            ...Object.keys(ys ?? {}),
          ])) {
            if (JSON.stringify(xs?.[prop]) === JSON.stringify(ys?.[prop]))
              continue;
            if (prop.startsWith(':')) {
              // A state block (`:hover`) in the rule.
              if (!state) compare(xs?.[prop], ys?.[prop], prop);
              continue;
            }
            const css = prop.startsWith('--')
              ? prop
              : prop.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
            own ??= ownPartTokens(cwd, slug, target, key, state);
            if (own.has(css))
              ownPartHits.push({
                target,
                key,
                state,
                prop: css,
                value: own.get(css) ?? null,
              });
          }
        };
        compare(x, y, null);
      }
  }
  // A part dial writes its property on each part it reaches: the own
  // source setting it there wins, whatever else wins over the dial.
  if (
    sub === 'set' &&
    s.source === 'dial' &&
    s.on &&
    !s.state &&
    DIAL_PROPERTY[s.thing]
  )
    for (const target of partsOf(ctx, s))
      for (const [prop, value] of ownPartTokens(
        cwd,
        slug,
        target,
        s.when ?? 'base',
      ))
        if (
          DIAL_PROPERTY[s.thing].test(prop) &&
          !ownPartHits.some(h => h.target === target && h.prop === prop)
        )
          ownPartHits.push({target, key: s.when ?? 'base', prop, value});
  // A padding the own source sets on a rule wins over every padding setting
  // there (the editor writes none), whichever sides each names.
  if (
    sub === 'set' &&
    s.source === 'property' &&
    s.on &&
    /^padding(-|$)/.test(s.thing)
  )
    for (const target of partsOf(ctx, s)) {
      const state = s.state ? `:${s.state}` : null;
      for (const [prop, value] of ownPartTokens(
        cwd,
        slug,
        target,
        s.when ?? 'base',
        state,
      ))
        if (
          /^padding(-|$)/.test(prop) &&
          !ownPartHits.some(h => h.target === target && h.prop === prop)
        ) {
          ownPartHits.push({target, key: s.when ?? 'base', state, prop, value});
          break;
        }
    }
  // A radius the own source sets on a part wins over a radius setting
  // there, which the editor writes as the part's radius token (a button's
  // --radius-element): the own border-radius does not read it.
  if (
    sub === 'set' &&
    s.source === 'property' &&
    s.on &&
    /^border(-[a-z]+)*-radius$/.test(s.thing)
  )
    for (const target of partsOf(ctx, s)) {
      const state = s.state ? `:${s.state}` : null;
      for (const [prop, value] of ownPartTokens(
        cwd,
        slug,
        target,
        s.when ?? 'base',
        state,
      ))
        if (
          /^border(-[a-z]+)*-radius$/.test(prop) &&
          !String(value ?? '').includes('var(--radius-') &&
          !ownPartHits.some(h => h.target === target && h.prop === prop)
        ) {
          ownPartHits.push({target, key: s.when ?? 'base', state, prop, value});
          break;
        }
    }
  // A direct setting on exactly the rule the own source sets: its undo
  // takes it back (anything else the file wins over either way).
  const ownHitDirect =
    ownPartHits.length === 1 &&
    (s.source === 'token' || s.source === 'property') &&
    ownPartHits[0].target === s.on &&
    ownPartHits[0].prop === s.thing &&
    ownPartHits[0].key === (s.when ?? 'base') &&
    (ownPartHits[0].state ?? null) === (s.state ? `:${s.state}` : null);
  const ownOverToken =
    sub !== 'set' || s.when || s.state || s.on
      ? null
      : s.source === 'token'
        ? (Object.entries(ownSourceTokenValues(cwd, slug)).find(
            ([k]) => k === s.thing,
          ) ??
          (ownSourceTokens(cwd, slug).includes(s.thing)
            ? [s.thing, null]
            : null))
        : null;
  /** @type {string[]} */
  const notes = [
    ...fieldNotes,
    ...(alsoReplaced.length && prev
      ? [
          `${describe({...prev, value: '?'}).replace(' = ?', '')} was listed ${alsoReplaced.length === 1 ? 'twice' : `${alsoReplaced.length + 1} times`} (${[...alsoReplaced, prev].map(x => x.value).join(', ')}); each is ${sub === 'set' ? 'replaced' : 'removed'}`,
        ]
      : []),
    ...(covered.length ? [`replaces ${covered.map(describe).join(', ')}`] : []),
    ...(ownPartHits.length
      ? [
          `${slug}.theme.ts sets ${ownPartHits
            .slice(0, 3)
            .map(
              h =>
                `${h.prop} on ${h.target}${h.state ? ` ${h.state}` : ''}${h.key === 'base' ? '' : ` when ${h.key}`} itself${h.value != null ? ` (${h.value})` : ''}`,
            )
            .join(
              ', ',
            )}${ownPartHits.length > 3 ? ` and ${ownPartHits.length - 3} more` : ''}, and your own source wins over the settings, so this does not show ${/^padding(-|$)/.test(s.thing) && ownPartHits.every(h => /^padding-/.test(h.prop)) ? 'on the sides that sets; its other sides take this setting' : 'there'}; change it in ${slug}.theme.ts${ownHitDirect ? `, or take this back with \`${P} undo ${slug} ${undoArgs(s)}\`` : ''}`,
        ]
      : []),
    ...(ownOverToken
      ? [
          `${slug}.theme.ts sets ${s.thing}${s.on ? ` on ${s.on}` : ''} itself${ownOverToken[1] != null ? ` (${ownOverToken[1]})` : ''}, and your own source wins over the settings, so this does not show${PHONE_TYPE.test(s.thing) ? ` on wide screens (on ${PHONES} this setting shows: the editor repeats exact font settings after the base theme's type there)` : ''}; change it in ${slug}.theme.ts, or take this back with \`${P} undo ${slug} ${undoArgs(s)}\``,
        ]
      : []),
    ...(exactWins.length
      ? [
          `keeps your exact ${exactWins.map(describe).join(', ')}: an exact setting wins over a dial, so ${exactWins.length > 1 ? 'those do' : 'that does'} not change; this shows after \`${P} undo ${slug} ${exactWins.map(x => undoArgs(x)).join(`\` and \`${P} undo ${slug} `)}\``,
        ]
      : []),
    ...(sub === 'set' && s.thing === 'spacing' ? sizeNotes : []),
    ...(sub === 'set' ? compileNotes : []),
    ...(covers.length
      ? [
          `comes after ${covers.map(describe).join(', ')}, so ${covers.length > 1 ? 'those parts show' : `${covers[0].on} shows`} this value now; set ${covers.length > 1 ? 'one' : 'it'} again to make it win`,
        ]
      : []),
    // Core writes a part's derived variables (a button's or card's radius
    // variable, read by what is drawn inside it) from plain declarations
    // only: in a state they keep the plain value, and the result says so.
    ...(sub === 'set' && s.state && s.on
      ? (() => {
          const prop =
            s.thing === 'corners' || /radius$/.test(s.thing)
              ? 'borderRadius'
              : s.thing === 'padding' || s.thing === 'spacing'
                ? 'padding'
                : s.thing.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          const vars = parts.flatMap(t =>
            (ctx.derived?.[t] ?? [])
              .filter(d => d.property === prop)
              .flatMap(d => d.vars ?? []),
          );
          return vars.length
            ? [
                `in the ${s.state} state, ${[...new Set(vars)].join(', ')} (which Core sets from the plain value, for what is drawn inside the part) keeps the plain value`,
              ]
            : [];
        })()
      : []),
    // Phones keep the base theme's reading sizes (a coarse pointer below
    // the lg width), so a size change says where it applies.
    ...(sub === 'set' &&
    !s.on &&
    (['text-size', 'type'].includes(s.thing) ||
      /^--(font-size-|text-[a-z0-9-]+-(size|leading)$)/.test(s.thing))
      ? [
          'phones (touch screens below 1024px wide) keep the base theme reading sizes; this applies on wider or mouse screens',
        ]
      : []),
    // A scale step far outside reading sizes is named.
    ...(sub === 'set' && ['text-size', 'type'].includes(s.thing)
      ? extremeSteps(r.res.light)
      : []),
    // An exact property on the same part wins over a dial there.
    ...(exactOver
      ? [
          // The own source holding only some sides or corners there leaves
          // the dial the others once the exact property is undone.
          ownPartHits.length &&
          ownPartHits.every(h =>
            /(Top|Bottom|Left|Right|Start|End|Block|Inline)/.test(
              camel(String(h.prop)),
            ),
          )
            ? `${describe(exactOver)} is an exact property and wins over ${s.thing} there, so this shows only after \`${P} undo ${slug} ${undoArgs(exactOver)}\`, and then not on the ${[...new Set(ownPartHits.map(h => kebab(String(h.prop))))].join(', ')} ${slug}.theme.ts sets itself`
            : ownPartHits.length
              ? `${describe(exactOver)} is an exact property and wins over ${s.thing} there too; undoing it does not make ${s.thing} show on ${[...new Set(ownPartHits.map(h => h.target))].join(', ')}, where ${slug}.theme.ts wins`
              : `${describe(exactOver)} is an exact property and wins over ${s.thing} there, so this shows only after \`${P} undo ${slug} ${undoArgs(exactOver)}\``,
        ]
      : []),
    // A whole-theme font under fonts set for each role shows only where no
    // role font is set.
    ...(roleOver.length
      ? [
          `keeps your ${roleOver.map(describe).join(', ')}: a font for one role wins over the whole-theme font, so ${s.value} shows there only after ${roleOver.map(x => `\`${P} undo ${slug} ${undoArgs(x)}\``).join(' and ')}`,
        ]
      : []),
    // An accepted change that the theme already showed says so.
    ...(sub === 'set' &&
    !exactOver &&
    !roleOver.length &&
    !ownOverToken &&
    !ownPartHits.length &&
    // With the last build unreadable or missing, nothing was compared.
    !r.notes.some(
      n =>
        n.includes('could not be read') ||
        n.includes('there was no last build'),
    ) &&
    !r.unchanged &&
    !r.changed.length &&
    !styled.length &&
    !ctx.unchecked
      ? [
          `this changes nothing you see: the theme already shows ${describe(s)} (it is saved, and stays when the base theme changes)`,
          // A mode's own setting under one the theme sets for every mode:
          // that one still draws the other modes, which this does not
          // change.
          ...(() => {
            if (!s.mode) return [];
            const whole = data.settings.find(
              x =>
                x !== s &&
                !x.mode &&
                x.source === s.source &&
                x.thing === s.thing &&
                (x.on ?? null) === (s.on ?? null) &&
                (x.when ?? null) === (s.when ?? null) &&
                (x.state ?? null) === (s.state ?? null),
            );
            if (!whole) return [];
            const others = modesOf(data).filter(m => m !== s.mode);
            return others.length
              ? [
                  `your setting for every mode (${describe(whole)}) still draws ${others.join(' and ')}; to keep it for ${s.mode} only, take that one back (this one stays): ${P} undo ${slug} ${undoArgs(whole)}`,
                ]
              : [];
          })(),
        ]
      : []),
    // A card's content takes one radius from Core, whatever its corners.
    ...(sub === 'set' &&
    s.source === 'property' &&
    s.thing === 'border-radius' &&
    s.on &&
    (ctx.derived?.[s.on] ?? []).some(
      d => d.property === 'borderRadius' && d.vars?.length,
    ) &&
    /\s|\//.test(String(s.value).trim())
      ? [
          `each corner of ${s.on} takes its own radius; the content that reaches its edges takes one, ${
            String(s.value)
              .trim()
              .split(/[\s/]+/)[0]
          }, for every corner (Core gives it a single radius)`,
        ]
      : []),
    ...(longhands.length
      ? [
          `${s.thing} comes after ${longhands.map(x => x.thing).join(', ')} on ${s.on}, so it replaces them there`,
        ]
      : []),
    ...(r.unchanged
      ? [
          `no change: ${describe(s)} is already set, so nothing was built and no undo step was added`,
        ]
      : []),
    ...r.notes,
  ];
  const group = s.on
    ? FAMILIES[s.on]
      ? s.on
      : parts.length > 1
        ? familyOf(s.on)
        : null
    : null;
  if (s.note) notes.push(s.note);
  // A fill on the plain part covers the paints Core gives its variants and
  // states (a primary button's accent, a checked box's): said, with the
  // lines that change one of them, or only the part at rest.
  if (
    sub === 'set' &&
    s.on &&
    !s.state &&
    !s.when &&
    /^background(-color)?$/.test(s.thing)
  ) {
    // One note for each cause: the parts of a group whose fill covers the
    // same paints (every input's status and disabled fills) are said
    // together, with lines on the group, not once for each part.
    /** @type {Map<string, {members: string[], rest: string | null, all: Set<string>, flags: Set<string>}>} */
    const causes = new Map();
    for (const t of parts) {
      const {rest, covered} = coveredPaints(ctx, t, s.thing);
      if (!covered.length) continue;
      // (The cause is what the fill covers, by kind: the props and states
      // Core paints a fill for, whatever their order or count on a part.)
      const kinds = [
        ...new Set(covered.map(c => String(c.cond).split('=')[0])),
      ].sort();
      const key = JSON.stringify([kinds, rest ?? null]);
      const cause = causes.get(key) ?? {
        members: [],
        rest: rest ?? null,
        all: new Set(),
        flags: new Set(),
      };
      cause.members.push(t);
      for (const c of covered) {
        cause.all.add(`${c.cond} (${c.token})`);
        if (c.flags) cause.flags.add(String(c.flags));
      }
      causes.set(key, cause);
    }
    // Each chain starts with the undo of the fill just set: while it
    // stays, every variant and state keeps it.
    const undo = `${P} undo ${slug} ${undoArgs(s)}`;
    const modeFlag = s.mode ? ` --mode ${s.mode}` : '';
    for (const {
      members,
      rest,
      all: allSet,
      flags: flagSet,
    } of causes.values()) {
      const all = [...allSet].sort();
      const named = [
        ...all.slice(0, 4),
        ...(all.length > 4 ? [`${all.length - 4} more`] : []),
      ];
      const flags = [...flagSet];
      // Lines go on the part as set when the cause is every part it
      // styles (its group); else on each part the cause is.
      const targets =
        members.length === parts.length && s.on ? [s.on] : members;
      const lines = [
        ...new Set(
          targets.flatMap(on =>
            flags.map(
              f =>
                `${P} set ${slug} background-color ${quoteCommandArgument(String(s.value))} --on ${on} ${f}${modeFlag}`,
            ),
          ),
        ),
      ];
      const who =
        members.length > 3
          ? `${members.slice(0, 3).join(', ')} and ${members.length - 3} more`
          : members.join(', ');
      const own = members.length > 1 ? 'their' : 'its';
      notes.push(
        `${s.mode ? `in ${s.mode} mode, ` : ''}${who}${members.length > 1 ? "'s fills now cover" : "'s fill now covers"} the fill Core gives ${members.length > 1 ? 'them' : 'it'} ${named.length > 1 ? 'in each of' : 'in'} ${named.join(', ')}, so ${named.length > 1 ? 'those no longer differ' : 'that no longer shows'}${
          rest
            ? `; to change only ${own} fill at rest: ${undo}, then ${targets.map(on => `${P} set ${slug} ${rest} ${quoteCommandArgument(String(s.value))} --on ${on}${modeFlag}`).join('; ')}`
            : ''
        }${lines.length ? `; to fill only one of them: ${undo}, then ${lines.slice(0, 3).join('; or ')}` : ''}`,
      );
    }
  }
  // A color dial or token that a plain part's own fill covers no longer
  // reaches that part where Core paints with it: said.
  if (sub === 'set' && !s.on) {
    const tokens = s.source === 'token' ? new Set([s.thing]) : dialTokens;
    for (const x of data.settings) {
      if (
        x === s ||
        !x.on ||
        x.state ||
        x.when ||
        !/^background(-color)?$/.test(x.thing)
      )
        continue;
      const lost = [
        ...new Set(
          partsOf(ctx, x)
            .flatMap(t => coveredPaints(ctx, t, x.thing).covered)
            .filter(c => tokens.has(c.token))
            .filter(
              c =>
                !data.settings.some(
                  y =>
                    y.on === x.on &&
                    /^background(-color)?$/.test(y.thing) &&
                    c.flags != null &&
                    (`--when ${y.when}` === c.flags ||
                      `--state ${y.state}` === c.flags),
                ),
            )
            .map(c => c.cond),
        ),
      ];
      if (lost.length)
        notes.push(
          `${x.mode ? `in ${x.mode} mode, ` : ''}the fill set on ${x.on} (${x.value}) covers ${lost.join(', ')}, so ${s.thing} does not reach ${x.on} there${x.mode ? ` (it does in ${x.mode === 'light' ? 'dark' : 'light'} mode)` : ''}`,
        );
    }
  }
  // A value for the mode a one-mode theme does not show applies where Core
  // draws that mode.
  if (
    s.mode &&
    (data.mode === 'light-only' || data.mode === 'dark-only') &&
    data.mode !== `${s.mode}-only`
  )
    notes.push(
      `a ${data.mode} theme shows ${s.mode} mode only where Core draws a ${s.mode} region (a toast, a lightbox), so this value applies there`,
    );
  // A group kept alike (inputs share one height) loses that when one member
  // changes its height alone.
  const family = s.on && s.only ? familyOf(s.on) : null;
  if (
    family &&
    AUTO_SPREAD.includes(family) &&
    (s.thing === 'spacing' ||
      /^--size-element-/.test(s.thing) ||
      /^(min-|max-)?(height|block-size)$|^padding(-block(-start|-end)?|-top|-bottom)?$/.test(
        s.thing,
      ))
  )
    notes.push(
      `${s.on} alone now differs in height from the rest of ${family}, which are kept alike; --on ${family} changes them together`,
    );
  // A token the theme's own source sets itself wins over what this dial
  // writes, as an exact setting does.
  const ownWins = ownSourceTokens(cwd, slug).filter(
    k =>
      (dialTokens.has(k) ||
        // A role font writes --font-family-<role>.
        (s.thing === 'font' && s.on && k === `--font-family-${s.on}`)) &&
      !exactWins.some(x => x.thing === k),
  );
  const ownSet = new Set(ownSourceTokens(cwd, slug));
  if (ownWins.length)
    notes.push(
      `${slug}.theme.ts sets ${ownWins.slice(0, 4).join(', ')}${ownWins.length > 4 ? ` and ${ownWins.length - 4} more` : ''} itself, and your own source wins over the settings, so ${ownWins.length > 1 ? 'those do' : 'that does'} not change; ${ownTakeOut(slug, s.thing, ownWins, data)}`,
    );
  /** The contrast checks the colors this change made fail. @type {Array<{problem: string, fix: string | null}>} */
  const colorFails = [];
  const dialPal =
    PALETTE_DIALS.includes(s.thing) && sub === 'set'
      ? paletteMapping(cwd, slug, data, base, ctx.project.core.tokenDefaults)
      : null;
  if (dialPal)
    colorFails.push(
      ...newFailures(paletteFailures(dialPal, s.thing, modesOf(data))),
    );
  if (PALETTE_DIALS.includes(s.thing) && sub === 'set')
    notes.push(
      ...paletteNotes(dialPal, s.thing, slug, modesOf(data))
        // A shade the mapping would pick for a token the theme's own source
        // sets never shows: the file's value does (named once above).
        .filter(n => {
          const subject = /^(?:in (?:light|dark), )?(--[a-z0-9-]+) /.exec(
            n,
          )?.[1];
          return (
            !subject ||
            !ownSet.has(subject) ||
            / uses your exact setting \(/.test(n)
          );
        })
        .map(n => {
          // The exact color is the one the theme's own source sets: named so.
          const token = n.split(' ')[0];
          return ownSet.has(token) && / uses your exact setting \(/.test(n)
            ? n
                .replace(
                  ' uses your exact setting (',
                  ` uses the value ${slug}.theme.ts sets (`,
                )
                .replace('an exact setting wins', 'your own source wins')
            : n;
        }),
    );
  // An exact color the mapping reads (a fill, a tint, text on a fill)
  // changes what it picks around it: say what, as the dial does.
  const dialOfToken =
    s.source === 'token' && !s.on && !s.when && !s.state
      ? paletteDialOf(s.thing)
      : null;
  if (dialOfToken && sub === 'set') {
    const pal = paletteMapping(
      cwd,
      slug,
      data,
      base,
      ctx.project.core.tokenDefaults,
    );
    if (pal?.families.some(x => x.dial === dialOfToken)) {
      notes.push(
        ...paletteNotes(pal, dialOfToken, slug, modesOf(data)).filter(
          n => !n.startsWith('the generated colors are in '),
        ),
      );
      colorFails.push(
        ...newFailures(paletteFailures(pal, dialOfToken, modesOf(data))),
      );
    }
  }
  if (PALETTE_DIALS.includes(s.thing) && sub === 'undo')
    notes.push(
      `the ${s.thing} color is no longer generated, and the tokens it fed go back to the base theme's values`,
      ...(vibrancyGone != null
        ? [
            `vibrancy ${vibrancyGone} is removed too: it sets how saturated the colors are, and the theme sets no color now`,
          ]
        : []),
    );
  // A whole-theme token the base theme draws past on some parts (its own
  // rule for the part sets the property the token feeds in Core): the
  // token never reaches those, and the result says so, with the command
  // that does.
  if (
    sub === 'set' &&
    s.source === 'token' &&
    !s.on &&
    !s.when &&
    !s.state &&
    ctx.C?.MAP
  )
    for (const r of baseRedraws(ctx.C, base, s.thing)) {
      // (Unless the theme already sets it there itself.)
      if (
        data.settings.some(
          x =>
            x.source === 'property' &&
            x.thing === r.prop &&
            (x.when ?? null) === (r.when ? r.when : null) &&
            partsOf(ctx, x).includes(r.part),
        )
      )
        continue;
      notes.push(
        `${r.part}${r.when ? ` (${r.when.replace(':', ' ')})` : ''} does not use ${s.thing}: the ${data.like ?? 'base'} theme draws its ${r.prop} from ${r.value} there; to change it: ${P} set ${slug} ${r.prop} ${quoteCommandArgument(String(s.value))} --on ${r.part}${r.when ? ` --when ${r.when}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
      );
    }
  // A token another one follows (the surface's fills, the emphasized
  // border) says what moved with it.
  if (sub === 'set' && s.source === 'token' && !s.on && !s.when && !s.state) {
    const followers = Object.keys(FOLLOWS).filter(
      k =>
        FOLLOWS[k] === s.thing &&
        r.changed.some(
          (/** @type {unknown} */ c) => String(c).split(/[\s:]/)[0] === k,
        ),
    );
    // The parts the base theme draws from a follower besides its own
    // token (neutral's progress and switch tracks, from the emphasized
    // border) move with it too.
    /** @param {string} token */
    const drawnFrom = token =>
      Object.entries(
        /** @type {{components?: Record<string, Record<string, unknown>>}} */ (
          base
        ).components ?? {},
      )
        .filter(([, keys]) =>
          Object.values(keys).some(
            b =>
              b &&
              typeof b === 'object' &&
              Object.values(b).some(
                v => typeof v === 'string' && v.includes(`var(${token})`),
              ),
          ),
        )
        .map(([t]) => t);
    if (followers.length) {
      const also = [...new Set(followers.flatMap(drawnFrom))];
      notes.push(
        `${followers.join(', ')} ${followers.length === 1 ? 'follows' : 'follow'} it (${s.thing === '--color-border' ? 'the frames of inputs and selectors, never fainter than the border' : "the fills made from the surface, at the base theme's step from it"})${also.length ? `, and so do the parts the base theme draws from ${followers.length === 1 ? 'it' : 'them'}: ${also.join(', ')}` : ''}; an exact setting of ${followers.length === 1 ? 'it' : 'one'} keeps its own color`,
      );
    }
  }
  if (s.thing === 'neutral' && sub === 'set') {
    // Only the theme's own modes; a dark theme gets no white-page offer.
    const modes = modesOf(data);
    // A gray whose shades are the base theme's own grays (black or white,
    // which every gray ramp ends with, or the base's own gray): the page,
    // surfaces, text and borders keep their colors. A gray sets the tint of
    // the grays, never how light or dark the surfaces are.
    const GRAYS_SHOWN = [
      '--color-background-body',
      '--color-background-surface',
      '--color-background-card',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-border-emphasized',
    ];
    const moved = /** @type {unknown[]} */ (r.changed ?? []).map(
      c => String(c).split(/[\s:]/)[0],
    );
    if (!GRAYS_SHOWN.some(k => moved.includes(k)))
      notes.push(
        `neutral ${s.value} grows the same grays the ${data.like ?? 'base'} theme already shows, so its page, surfaces, text and borders keep their colors${moved.length ? ` (only ${[...new Set(moved)].join(', ')} changed)` : ''}: a gray sets the tint of the grays, not how light or dark the surfaces are. For dark surfaces: ${P} set ${slug} mode dark-only, or set --color-background-surface and --color-background-body to the colors you want`,
      );
    const pinned = data.settings.some(
      x =>
        x.source === 'token' &&
        x.thing === '--color-background-body' &&
        !x.on &&
        !x.when &&
        !x.state,
    );
    notes.push(
      `${pinned ? 'the page background keeps the color you set for it' : "the page background follows it too, at the official theme's page shade of this gray"}${
        modes.includes('light')
          ? `; for a white or off-white page: ${P} set ${slug} --color-background-body ${quoteCommandArgument('#ffffff')}${modes.length > 1 ? ' --mode light' : ''}`
          : `; for another page color: ${P} set ${slug} --color-background-body ${quoteCommandArgument('#111111')}`
      }`,
    );
  }
  if (s.thing === 'accent' && sub === 'set') {
    notes.push(...infoClashNotes(data, base, slug, String(s.value)));
  }
  if (s.thing === 'vibrancy') {
    notes.push(
      sub === 'set'
        ? `every color this theme sets is made again at vibrancy ${s.value} (0 is gray, 100 the most vivid, ${VIBRANCY_DEFAULT} the default)`
        : `every color this theme sets is made again at the default vibrancy, ${VIBRANCY_DEFAULT}`,
    );
    notes.push(...unsetColorNotes(data, base, slug));
  }
  // A font set (the dial, a part's own font-family, a font token): how
  // it loads.
  if (
    (s.thing === 'font' ||
      s.thing === 'font-family' ||
      /^--font-family-/.test(s.thing)) &&
    sub === 'set'
  )
    notes.unshift(
      ...ownFamilyNotes(ctx, slug, s),
      ...fontNotes(ctx, {...data, settings: [s]}),
    );
  if (s.thing === 'type' || s.thing === 'headings')
    for (const [m, why] of maskedSettings(data, ctx))
      notes.push(`${describe(m)}: ${why}`);
  // An earlier setting this one now covers (through a spread too) is named.
  else if (sub === 'set')
    for (const [m, why] of maskedSettings(data, ctx))
      if (m !== s && why.startsWith(describe(s)))
        notes.push(`${describe(m)} no longer shows: ${why}`);
  if (s.thing === 'type' && sub === 'set' && TYPE_STYLES[s.value].ratio > 1.2)
    notes.push(
      'text below the base size keeps its standard sizes, so small text stays readable',
    );
  // A change that changed nothing writes nothing, the preview included,
  // once preview.html was rendered from the theme as it is now (a retry
  // after a render that failed renders it).
  const f0 = themeFiles(cwd, slug);
  // A change that changed nothing still writes back an app copy file that
  // is gone or not the current build.
  // Its font stylesheet follows the fonts the theme loads now (a font
  // package installed or removed since).
  if (r.unchanged && appCopyBehind(cwd, slug, copyFontsCss(ctx, slug, data)))
    writeAppCopy(ctx, slug, data);
  const {cutShort, ...p} =
    r.unchanged &&
    !png &&
    fs.existsSync(f0.preview) &&
    previewIsCurrent(ctx, slug, data)
      ? {
          preview: shown(cwd, f0.preview),
          pictures: [],
          pictureProblem: null,
          // No pictures: nothing measured.
          cutShort: [],
          notChecked: null,
          previewStale: [],
          see: seeLine(cwd, slug, changeFocus(s)),
          // A copy something keeps behind is said here too.
          ...appCopyStale(cwd, slug),
        }
      : await previewAndRoute(ctx, slug, data, png, changeFocus(s), sub);
  return {
    type: sub === 'set' ? 'themeEdit.set' : 'themeEdit.undo',
    data: {
      theme: slug,
      action: sub,
      setting:
        sub === 'set'
          ? s
          : /** @type {import('./_settings.mjs').Setting} */ (prev),
      // On undo, the setting above is the one removed, named as such.
      ...(sub === 'undo' && prev
        ? {
            removed: prev,
            now: nowApplies(ctx, data, prev, base),
            // The other entries of a setting listed twice by hand, removed
            // with it.
            ...(alsoReplaced.length ? {alsoRemoved: alsoReplaced} : {}),
          }
        : {}),
      // A plain value that replaced per-mode ones names the first of them;
      // the notes name them all.
      replaced:
        sub === 'set' ? (prev ?? covered[0] ?? longhands[0] ?? null) : null,
      // A whole-theme dial names the value it replaced, as base and mode do.
      was:
        sub === 'set' && prev && prev.source === 'dial' && !prev.on
          ? prev.value
          : null,
      // What else to know, then the text the sample page's pictures draw
      // cut short.
      notes: [...notes, ...cutShort.map(cutShortNote)],
      // What the whole-theme change leaves out, with the lines that reach
      // it; the text output prints it right under the status line.
      leftOut: leftOutParts(ctx, slug, data, sub, s),
      // A font this set names that does not load until its package is
      // installed: the text prints it under the status line too.
      ...(() => {
        const fonts =
          sub === 'set' &&
          (s.thing === 'font' ||
            s.thing === 'font-family' ||
            /^--font-family-/.test(s.thing))
            ? fontsNotLoaded(ctx, {...data, settings: [s]})
            : [];
        return fonts.length ? {fontNotLoaded: fonts} : {};
      })(),
      parts,
      group: group
        ? {
            name: group,
            members: parts,
            onlyHint: !FAMILIES[s.on ?? ''] && AUTO_SPREAD.includes(group),
          }
        : null,
      changedTokens: r.changed,
      changedPartTokens: r.changedParts ?? [],
      styled,
      kept,
      lifted: r.lifted,
      problems: r.problems,
      // What this change made unreadable or unseen, with each fix: text
      // and borders measured against the settings before it, and the
      // contrast checks the colors it made fail.
      newProblems: [
        ...problemLines(r.newProblems),
        ...colorFails,
        // Text the sample page's pictures draw cut short, with the line
        // the browser measured as keeping it whole.
        ...cutShort.map(c => cutShortProblem(ctx, slug, c)),
      ],
      ...(await missedSummary(ctx, slug, data, r.res)),
      warnings: r.warnings,
      ...p,
    },
  };
}

/**
 * When the theme sets a colored accent and leaves info unset, and the base
 * theme's info is a strong color whose hue is far from the accent's (and
 * from a colored neutral's): info's banners and badges keep that hue in a
 * palette that has none of it (a bright blue info in a pink theme). Says
 * so, with an info between the two hues at info's own lightness and a
 * little less strength, so it sits with the palette and stays apart from
 * the accent.
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @param {string} slug
 * @param {string} accent the accent color set
 * @returns {string[]}
 */
function infoClashNotes(data, base, slug, accent) {
  if (data.settings.some(x => x.source === 'dial' && x.thing === 'info'))
    return [];
  const info = parseColor(String(base.light['--color-info'] ?? ''));
  const now = parseColor(accent);
  if (!info || !now) return [];
  const i = hexToOklch(hex(info));
  const n = hexToOklch(hex(now));
  /** @param {number} a @param {number} b */
  const apart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  if (i.C < 0.08 || n.C < 0.05 || apart(i.H, n.H) <= 60) return [];
  const neutral = [...data.settings]
    .reverse()
    .find(x => x.source === 'dial' && x.thing === 'neutral' && !x.on);
  const gray = neutral && parseColor(String(neutral.value));
  if (gray) {
    const g = hexToOklch(hex(gray));
    if (g.C >= 0.02 && apart(i.H, g.H) <= 60) return [];
  }
  const turn = ((n.H - i.H + 540) % 360) - 180;
  const between = oklchClampedHex(
    i.L,
    i.C * 0.85,
    (i.H + turn / 2 + 360) % 360,
  );
  return [
    `info (banners, info badges) keeps the base theme's ${hex(info)}, a hue your accent ${accent} does not share; for an info that sits with your palette and stays apart from the accent: ${P} set ${slug} info ${quoteCommandArgument(between)}`,
  ];
}

/**
 * Which status colors the theme does not set, so they keep the base theme's
 * values whatever the vibrancy, with the commands that bring them in: each
 * seeded with the base theme's own color, so it is then generated at the
 * theme's vibrancy. Colored cards and other info-tinted surfaces follow info.
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @param {string} slug
 * @returns {string[]}
 */
function unsetColorNotes(data, base, slug) {
  const word = /** @type {Record<string, string>} */ ({
    info: '--color-info',
    success: '--color-success',
    warning: '--color-warning',
    danger: '--color-error',
  });
  const unset = Object.keys(word).filter(
    d => !data.settings.some(x => x.source === 'dial' && x.thing === d),
  );
  if (!unset.length) return [];
  return [
    `${unset.join(', ')} ${unset.length > 1 ? 'are' : 'is'} not set by this theme, so ${unset.length > 1 ? 'they keep' : 'it keeps'} the base theme's colors at any vibrancy${unset.includes('info') ? ', and so do surfaces tinted with info, such as colored cards' : ''}. To include ${unset.length > 1 ? 'them' : 'it'}: ${unset
      .map(
        d =>
          `${P} set ${slug} ${d} ${quoteCommandArgument(base.light[word[d]] ?? '#1f2937')}`,
      )
      .join('; ')}`,
  ];
}

/**
 * Whether a settings entry is a mode or base a hand edit put in the list:
 * it does nothing there (the theme's mode and base are its own fields).
 * @param {{thing: string}} s
 */
const misplaced = s => s.thing === 'mode' || s.thing === 'base';

/**
 * The note for each misplaced entry: listed here only, never as a
 * setting, with the undo that removes it first.
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
function misplacedNotes(slug, data) {
  return data.settings
    .filter(misplaced)
    .map(
      x =>
        `misplaced: the settings list holds ${x.thing} = ${x.value}, which does nothing there (the theme's ${x.thing} is ${x.thing === 'mode' ? data.mode : (data.like ?? 'none')}); \`${P} undo ${slug} ${x.thing}\` removes it, and \`${P} set ${slug} ${x.thing} <value>\` sets the theme's ${x.thing}`,
    );
}

/**
 * A refusal for a theme with misplaced entries, its suggestions led by the
 * undo that removes each.
 * @param {unknown} e
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData | undefined} data
 */
function misplacedFirst(e, slug, data) {
  if (!(e instanceof AstryxError) || !data) return e;
  const undos = data.settings.filter(misplaced).map(x => ({
    name: `${P} undo ${slug} ${x.thing}`,
    reason: `removes the ${x.thing} entry that does nothing in the settings list`,
  }));
  if (!undos.length) return e;
  e.suggestions = [
    ...undos,
    ...(e.suggestions ?? []).filter(x => !undos.some(u => u.name === x.name)),
  ];
  return e;
}

/**
 * The command that leads to the fix of a render that failed: installing
 * React when it is missing, listing React's copies when the app and Core
 * resolve two (the message says which), and otherwise doctor's install
 * checks.
 * @param {any} ctx
 * @param {string} cwd
 */
function renderFix(ctx, cwd) {
  if (ctx.uncheckedCode === 'ERR_RENDER_MISSING_DEPENDENCY')
    return [installLine(cwd, ['react', 'react-dom'])];
  // A file too large to carry is named by the message, which says the fix
  // (a smaller copy): no command leads to it.
  if (ctx.uncheckedCode === 'ERR_RENDER_ASSET_TOO_LARGE') return [];
  if (reactCopies(ctx.project)) return [copiesLine(cwd, 'react')];
  return [`${getCliInvocation(cwd)} doctor`];
}

/**
 * Problems as a result names them: each with the command that fixes it.
 * @param {import('./_settings.mjs').ThemeProblem[] | undefined} list
 * @returns {Array<{problem: string, fix: string | null}>}
 */
function problemLines(list) {
  return (list ?? []).map(x => ({problem: x.text, fix: x.fix}));
}

/**
 * Every setting of a theme, key resolved values, problems it caused, the
 * sample page and the theme-building page with every component.
 * @experimental
 * @param {string} theme
 * @param {import('./theme-edit.type.mjs').ThemeEditShowOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditShowResponse>}
 */
export async function themeEditShow(theme, options = {}) {
  const {cwd = process.cwd(), png = false} = options;
  // Without the theme lock (it cannot be taken), show writes nothing: it
  // reports the last build as it is.
  const readOnly = Boolean(/** @type {any} */ (options).readOnly);
  requireProject(cwd);
  const section = checkSection(options.section, theme, png ? ' --png' : '');
  /** What each build this show makes reports (the pictures it removed). @type {string[]} */
  const rebuiltNotes = [];
  /** @type {import('./_settings.mjs').ThemeData} */
  let data;
  try {
    data = loadTheme(cwd, theme);
  } catch (e) {
    // The settings reader's one refusal, with set's repair for a damaged
    // saved value beside its undo, as every change command gives it.
    throw await savedDamageRefusal(e, theme, cwd);
  }
  const ctx = await context(cwd);
  // show --png takes its sheet too, after any build it makes.
  ctx.takesPictures = png ? {sheet: section ? `sheet-${section}` : null} : null;
  // The app copy is written once show succeeds (at its end), never by a
  // build a later refusal puts back.
  holdAfterBuild(ctx);
  // A saved value or scope set refuses gets set's lines (the undo and the
  // repair), as a change does.
  try {
    refuseStoredTokens(ctx, theme, data);
  } catch (e) {
    throw await savedDamageRefusal(e, theme, cwd, {ctx, data});
  }
  await refuseOwnTokenValues(ctx, theme, data);
  // Without React, show still lists the settings and builds the theme, as
  // set does; only the pages, pictures and the checks that render are
  // skipped, and the result says how to fix it.
  const noReact =
    !readOnly &&
    (reactMissing(cwd).length > 0 ||
      ctx.uncheckedCode === 'ERR_RENDER_MISSING_DEPENDENCY');
  const noPages = readOnly || noReact;
  // Any other render failure (two copies of React, a component that
  // throws) is refused, and nothing is written.
  if (ctx.unchecked && !readOnly && !noReact)
    refuse(
      E.ERR_RENDER_FAILED,
      `${theme} cannot be shown: ${ctx.unchecked} Nothing was written.`,
      {
        run: renderFix(ctx, cwd),
      },
    );
  const f = themeFiles(cwd, theme);
  // A build that does not match the settings (a command stopped mid-build,
  // a hand edit, another CLI) is made again from the settings, and said.
  // An own source that does not parse is refused before anything is
  // built, written or removed (the build would fail part way).
  if (!readOnly) refuseThemeParse(cwd, theme);
  const brokenSource = await themeSourceProblem(cwd, theme);
  // Every output, as `compile --check` reads them: one missing or edited by
  // hand is built again too.
  let stale = staleBuild(cwd, theme, data);
  // An own source changed since the editor's build, whose outputs a build
  // of it now makes as they are (it was compiled since): current, as
  // `compile --check` reads it, so the editor records the source it was
  // built with instead of building again. One rule for both.
  if (
    stale === sourceChangedReason(theme) &&
    !brokenSource &&
    !(await outputsDrift(ctx, theme))
  ) {
    if (!readOnly) refreshSourceStamp(cwd, theme);
    stale = readOnly ? stale : staleBuild(cwd, theme, data);
  }
  stale ||= brokenSource ? null : await outputsDrift(ctx, theme);
  // Every file the build may rewrite or remove (the settings module, the
  // built outputs, the variants types, section sheets, pictures), so a
  // theme source that does not build, or builds a value that is not text,
  // leaves the folder exactly as it was.
  // An output that was not there is recorded as absent (null), so putting
  // the folder back removes what the build made new; the palette files in
  // tokens/ are recorded the same way.
  /** @type {Map<string, Buffer | null>} */
  let kept = new Map();
  const tokensDir = path.join(f.dir, 'tokens');
  if (stale && !brokenSource && !readOnly) {
    kept = new Map(
      fs
        .readdirSync(f.dir)
        .filter(
          n =>
            n === path.basename(f.settingsTs) ||
            (n.startsWith(`${theme}.`) &&
              /\.(css|js|d\.ts|css\.d\.ts|variants\.d\.ts)$/.test(n)) ||
            /^(sheet-[a-z-]+\.html|(sheet|preview)(-[a-z-]+)?\.png)$/.test(n),
        )
        .map(n => [path.join(f.dir, n), fs.readFileSync(path.join(f.dir, n))]),
    );
    for (const n of [
      path.basename(f.settingsTs),
      `${theme}.css`,
      `${theme}.js`,
      `${theme}.d.ts`,
      `${theme}.css.d.ts`,
      `${theme}.variants.d.ts`,
    ])
      if (!kept.has(path.join(f.dir, n))) kept.set(path.join(f.dir, n), null);
    if (fs.existsSync(tokensDir))
      for (const n of fs.readdirSync(tokensDir)) {
        const file = path.join(tokensDir, n);
        if (fs.statSync(file).isFile()) kept.set(file, fs.readFileSync(file));
      }
    const refs = path.join(tokensDir, `${theme}.palette-refs.ts`);
    if (!kept.has(refs)) kept.set(refs, null);
    try {
      rebuiltNotes.push(...(await buildTheme(ctx, theme, data)).notes);
    } catch (e) {
      putBack(kept, tokensDir);
      if (e instanceof AstryxError && e.code !== E.ERR_THEME_LOAD) throw e;
      // An own theme source that no longer builds is named, as `set` names
      // it; the old build is never shown as current.
      const why = (e instanceof Error ? e.message : String(e))
        .split(`${cwd}${path.sep}`)
        .join('')
        .replace(/\s*Make sure all imports[^|]*$/s, '')
        .split('\n')
        .slice(0, 3)
        .join(' | ');
      refuse(
        E.ERR_THEME_INVALID,
        `${theme} did not build: ${why}${why.includes(path.basename(f.ts)) ? ` (${shown(cwd, f.ts)} is your own file: fix it, then run show again)` : ''}`,
        {
          // The build failure's own way on (the annotated source that
          // loads, to compare with), else show again once it is fixed.
          run:
            e instanceof AstryxError && e.suggestions?.length
              ? e.suggestions.map(x => ({
                  name: x.name,
                  reason: x.reason ?? 'do this instead',
                }))
              : [
                  {
                    name: `${P} show ${theme}`,
                    reason: 'once the source is fixed as the message says',
                  },
                ],
        },
      );
    }
  }
  // The settings loaded whole: a `new` marker beside them is stale.
  if (!readOnly) clearNewMarker(f.dir);
  // A built module that cannot be read (damaged by hand) is built again.
  /** @type {string | null} */
  let unreadable = null;
  const res = await resolvedTokens(ctx, theme).catch(async e => {
    if (
      e instanceof AstryxError &&
      e.code === E.ERR_THEME_INVALID &&
      kept.size
    ) {
      // What this show just built goes back with the refusal.
      putBack(kept, tokensDir);
      throw e;
    }
    if (e instanceof AstryxError || readOnly) throw e;
    // The source lines the settings need are missing too: the build cannot
    // be made again until they are back, and show says so (never a run of
    // show itself).
    if (brokenSource)
      refuse(
        E.ERR_THEME_INVALID,
        `${theme}.js could not be read, and it cannot be built again: ${brokenSource.problem}. ${brokenSource.fix} Then run show again.`,
        {
          run: [`cat ${quoteCommandArgument(shown(cwd, f.ts))}`],
        },
      );
    unreadable = `${theme}.js could not be read (${e instanceof Error ? e.message.split('\n')[0] : String(e)}), so it was built again from the settings`;
    rebuiltNotes.push(...(await buildTheme(ctx, theme, data)).notes);
    return resolvedTokens(ctx, theme);
  });
  const ownOverNotes = ownOverSettingNotes(cwd, theme, data);
  const ownMasked = ownOverNotes.map(n => n.slice(0, n.indexOf(': ')));
  const checked = await contrastProblems(ctx, data, res);
  // What cannot be measured is a note, not a problem.
  const shownChecks = checked.filter(x => !isCheckNote(x));
  const problems = shownChecks.map(x => x.text);
  const pal = paletteMapping(
    cwd,
    theme,
    data,
    await baseResolved(ctx.project, data.like),
    ctx.project.core.tokenDefaults,
  );
  /** @type {Record<string, string>} */
  let ownTokens = {};
  try {
    ownTokens = ownSourceTokenValues(cwd, theme);
  } catch {
    // A source that cannot be read sets nothing here.
  }
  const {colorProblems, ...colorPart} = colorsReport(
    pal,
    data,
    res,
    theme,
    ownTokens,
  );
  // A render that fails here (two copies of React, a component that
  // throws) is refused as the one above: what this show built goes back,
  // and the result says so.
  const rendering = async (/** @type {() => Promise<any>} */ run) => {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (e instanceof AstryxError && e.code !== E.ERR_RENDER_FAILED) throw e;
      putBack(kept, tokensDir);
      // A folder it cannot write is no render failure: the folder is named.
      const code = /** @type {any} */ (e).code;
      if (['EACCES', 'EPERM', 'EROFS'].includes(code)) {
        const where = /** @type {any} */ (e).path;
        return refuse(
          E.ERR_WRITE_FAILED,
          `${theme} cannot be shown: ${where ? `${shown(cwd, path.dirname(where))}/` : 'its theme folder'} cannot be written (${code}). Fix its permissions, then run the command again. Nothing was written.`,
          {run: [`${P} show ${theme}`]},
        );
      }
      return refuse(
        E.ERR_RENDER_FAILED,
        `${theme} cannot be shown: ${renderCause(ctx.project, e.message)} ${[...kept.values()].some(Boolean) ? 'The build this show made again was put back as it was. ' : ''}Nothing was written.`,
        {run: renderFix(ctx, cwd)},
      );
    }
  };
  // Something of yours at a page's name (a file the editor did not write,
  // a link, a folder) is never written over: that page is not made, its
  // picture is not taken, and the result names it, as for the open states.
  const sheetFile = section
    ? path.join(f.dir, `sheet-${section}.html`)
    : f.sheet;
  /** @type {Array<{html: string, png: string | null, kind: 'link' | 'file' | 'other', page: string}>} */
  const leftPages = noPages
    ? []
    : [
        {html: f.preview, png: f.previewPng, page: 'the sample page'},
        {
          html: sheetFile,
          // The full sheet is not photographed.
          png: section ? path.join(f.dir, `sheet-${section}.png`) : null,
          page: section ? `the ${section} sheet` : 'the sheet',
        },
      ].flatMap(x => {
        // A folder there is refused by the write itself, by name: no page
        // can be made over it. A pipe or a device is left as it is and
        // named, as at the open states page's name.
        const kind = pageInTheWay(x.html);
        return kind === 'file' || kind === 'link' || kind === 'other'
          ? [{...x, kind}]
          : [];
      });
  const left = (/** @type {string} */ file) =>
    leftPages.some(x => x.html === file);
  const preview =
    noPages || left(f.preview)
      ? shown(cwd, f.preview)
      : await rendering(() => renderPreview(ctx, theme, data));
  const previewStale = noPages
    ? []
    : await rendering(() => keepPreviewRoute(ctx, theme));
  const sheet =
    noPages || left(sheetFile)
      ? {file: shown(cwd, sheetFile), components: 0, skipped: [], notes: []}
      : await rendering(() => renderSheet(ctx, theme, data, {group: section}));
  // The full sheet records the build it shows, so a later change tells a
  // sheet that still matches (after an undo) from one that does not.
  if (!noPages && !left(sheetFile)) stampSheet(sheetFile, theme, cwd);
  // The full sheet is too tall to read whole: --png also takes each family
  // of components on a page of its own, cut from it.
  // Each takes a browser run, so --png pictures the families the theme sets
  // a part of (the buttons when it sets none); --section <family> takes any
  // other, and sheet.html holds every component.
  const touched = touchedFamilies(ctx.project, data).filter(f =>
    FAMILY_SECTIONS.includes(f),
  );
  const families =
    png && !noPages && !section && !left(sheetFile)
      ? familyPages(
          sheetFile,
          theme,
          cwd,
          touched.length ? touched : [FAMILY_OVERVIEW],
        )
      : {pages: [], problems: []};
  const leftWords = leftPages.map(
    x =>
      `${inTheWayPhrase(shown(cwd, x.html), x.kind, x.page)}, so ${x.page} was not made${png && x.png ? ` and ${shown(cwd, x.png)} was not taken` : ''}; move ${x.kind === 'link' ? 'the link' : 'it'}, then run ${P} show ${theme}${section ? ` --section ${section}` : ''}${png ? ' --png' : ''}`,
  );
  const modes = modesOf(data);
  // The open states (every overlay drawn open) beside the sample page: the
  // full sheet holds them too, but is too tall to read whole. --png always
  // takes them, with a section's sheet as with the full one.
  // The overlays section's sheet is the open states page itself: made and
  // photographed once, as the section.
  const open =
    png && !noPages && section !== OPEN_SECTION
      ? await rendering(async () => {
          try {
            return await openStatesPage(ctx, theme, data);
          } catch (e) {
            // A theme folder it cannot write is the pictures' problem: the
            // picture run names the folder, and show stands.
            if (UNWRITABLE.includes(/** @type {any} */ (e)?.code)) return null;
            throw e;
          }
        })
      : null;
  /** @type {{files: string[], problem: string | null, cutShort: import('./_context.mjs').CutShort[]}} */
  const shots =
    png && !noPages
      ? await pictures(
          ctx.project,
          [
            {html: f.preview, png: f.previewPng, name: SAMPLE_PAGE_NAME},
            ...(open && !('problem' in open) ? [open] : []),
            // A family taller than a reader takes in whole is cut into
            // pictures of a readable height.
            ...families.pages.map(({html, png: out}) => ({
              html,
              png: out,
              most: FAMILY_PICTURE_HEIGHT,
            })),
            // A section is photographed from its own sheet, a family cut
            // as above. The full sheet, every component, is too tall to
            // read whole and slow to take: it is not photographed.
            ...(section
              ? [
                  {
                    html: path.join(f.dir, `sheet-${section}.html`),
                    png: path.join(f.dir, `sheet-${section}.png`),
                    ...(section !== OPEN_SECTION
                      ? {most: FAMILY_PICTURE_HEIGHT}
                      : {}),
                  },
                ]
              : []),
          ].filter(x => !left(x.html)),
          modes,
        )
      : // Pictures asked for but not taken: said, never a quiet none.
        {
          files: [],
          cutShort: [],
          problem: png
            ? readOnly
              ? 'no picture was taken: show ran read-only (the project or its install cannot be written, so it could not hold the theme lock), and the pages the pictures are taken of were not made; run show --png where the project can be written'
              : 'no picture was taken: React is not installed here, so the pages the pictures are taken of could not be made; install react and react-dom, then run show --png again'
            : null,
        };
  // Why the open states were not taken goes with the pictures, as for a
  // change (something of yours at its page's name is left as it is).
  if (open && 'problem' in open)
    shots.problem = [open.problem, shots.problem].filter(Boolean).join('; ');
  if (png && leftWords.length)
    shots.problem = [...leftWords, shots.problem].filter(Boolean).join('; ');
  if (families.problems.length)
    shots.problem = [...families.problems, shots.problem]
      .filter(Boolean)
      .join('; ');
  const look = lookAtPictures(shots.files);
  // The app copy follows the build there now, also when the build was
  // current and only the copy is missing (a theme made before it existed).
  if (!readOnly)
    try {
      writeAppCopy(ctx, theme, data);
    } catch (e) {
      if (/** @type {any} */ (e)?.lockLost) throw e;
    }
  return {
    type: 'themeEdit.show',
    data: {
      theme,
      like: data.like ?? null,
      mode: data.mode,
      settings: await (async () => {
        const looksBase = await baseResolved(ctx.project, data.like).catch(
          () => null,
        );
        return data.settings
          .filter(s => !misplaced(s))
          .map(s => {
            let masked = maskedSettings(data, ctx).get(s);
            // A look dial (buttons, surfaces) under an exact property on a
            // part it writes: named, as corners under border-radius is.
            if (!masked && looksBase && s.source === 'dial' && !s.on) {
              const writes = dialWrites(ctx, data, s, looksBase);
              const exact = writes.size
                ? data.settings.find(
                    x =>
                      x.source === 'property' &&
                      x.on &&
                      !x.when &&
                      !x.state &&
                      partsOf(ctx, x).some(t =>
                        writes.has(`${t}\0${x.thing}`),
                      ) &&
                      // (Not where the dial writes a variant's own rule,
                      // which is more specific: the dial wins there.)
                      !partsOf(ctx, x).some(t =>
                        writes.has(`${t}\0${x.thing}\0variant`),
                      ),
                  )
                : undefined;
              if (exact)
                masked = `${describe(exact)} is an exact property and wins over ${s.thing} on ${exact.on}`;
            }
            return {...s, parts: partsOf(ctx, s), ...(masked ? {masked} : {})};
          });
      })(),
      notes: [
        // What the settings file holds in a form read differently from its
        // text (a field written twice, a name in other letters), as a
        // change says it.
        ...entryNotes(data),
        ...rebuiltNotes,
        ...(png ? [] : leftWords),
        ...sheet.notes,
        // Text the sample page's pictures draw cut short.
        ...shots.cutShort.map(cutShortNote),
        ...misplacedNotes(theme, data),
        ...(noReact
          ? [
              `react and react-dom cannot be found from this app, so the pages and pictures were not made again and the checks that render components were skipped; install them (${installLine(cwd, ['react', 'react-dom'])}), then run show again`,
            ]
          : []),
        ...(readOnly
          ? [
              `the theme lock could not be taken, so nothing was written: this is the last build as it is${stale ? ` (it does not match the settings: ${stale})` : ''}, and the pages were not made again`,
            ]
          : stale && !brokenSource
            ? [
                `the build was not current (${stale}), so it was built again from the settings`,
              ]
            : stale
              ? [
                  `the build is not current (${stale}), and it was not built again: the theme source cannot carry the settings`,
                ]
              : []),
        ...(unreadable ? [unreadable] : []),
        ...(brokenSource
          ? [
              `${brokenSource.problem}, so settings cannot take effect. ${brokenSource.fix}`,
            ]
          : []),
        // A setting the theme file wins over is not live: no contrast
        // caveat for it (its own note says it does not show).
        ...checked
          .filter(
            x =>
              isCheckNote(x) &&
              !ownMasked.some(d => x.text.includes(` for ${d},`)),
          )
          .map(x => x.text),
        ...fontNotes(ctx, data),
        // Images and files of the theme the previews cannot show.
        ...themeImageNotes(ctx, theme),
        ...ownSourceMaskNotes(
          ctx,
          cwd,
          theme,
          data,
          await baseResolved(ctx.project, data.like),
        ),
        ...ownOverNotes,
        ...ownPhoneNotes(cwd, theme, data),
      ],
      // A size, number or font is the same in both modes: one value.
      resolved: Object.fromEntries(
        KEY_TOKENS.map(k => [
          k,
          MODAL.has(ctx.C.typeOf(k))
            ? Object.fromEntries(modes.map(m => [m, res[m][k] ?? null]))
            : (res[modes[0]][k] ?? null),
        ]),
      ),
      partValues: partValues(
        Object.assign(ctx, {base: await baseResolved(ctx.project, data.like)}),
        data,
        res,
        modes[0],
      ),
      ...colorPart,
      unreached: unreachedParts(
        ctx,
        data,
        res,
        await baseResolved(ctx.project, data.like),
      ),
      missed: await missedParts(
        ctx,
        theme,
        data,
        res,
        await baseResolved(ctx.project, data.like),
      ),
      problems,
      // Every problem the theme has now, its text, border and color
      // contrast, each with the command that fixes it when one does.
      openProblems: [
        ...problemLines(shownChecks),
        ...colorProblems,
        // Text the sample page's pictures draw cut short, with the line
        // the browser measured as keeping it whole.
        ...shots.cutShort.map(c => cutShortProblem(ctx, theme, c)),
      ],
      preview,
      previewStale,
      sheet: sheet.file,
      sheetComponents: sheet.components,
      skipped: sheet.skipped,
      pictures: shots.files,
      pictureProblem: shots.problem,
      // The pictures to open, by name: the text puts it first and last.
      ...(look ? {look} : {}),
      // How to use the theme in this app: theme add <theme> for its app copy.
      wiring: appWiring(ctx, theme, data),
      ...(() => {
        // The first time the theme's app copy is written, its files.
        const wrote = takeFirstAppCopy(cwd, theme);
        return wrote ? {appCopy: {wrote}} : {};
      })(),
      ...appCopyStale(cwd, theme),
      colorFiles: pal ? colorFiles(theme) : null,
    },
  };
}

/**
 * The part properties a dial writes, read from what the build writes with
 * it and without it (so a dial's outputs are never listed by hand), as
 * `target\0css-property` keys.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {import('./_settings.mjs').Setting} dial
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @returns {Set<string>}
 */
function dialWrites(ctx, data, dial, base) {
  /** @type {Set<string>} */
  const out = new Set();
  const comps = (/** @type {import('./_settings.mjs').Setting[]} */ settings) =>
    /** @type {Record<string, Record<string, Record<string, unknown>>>} */ (
      compileTheme(ctx, {...data, settings}, base).components ?? {}
    );
  let plain;
  let withDial;
  try {
    plain = comps([]);
    withDial = comps([dial]);
  } catch {
    return out;
  }
  for (const [target, keys] of Object.entries(withDial))
    for (const [key, block] of Object.entries(keys ?? {}))
      for (const [prop, value] of Object.entries(block ?? {}))
        if (
          typeof value === 'string' &&
          plain[target]?.[key]?.[prop] !== value
        ) {
          out.add(`${target}\0${kebab(prop)}`);
          // (Written on a variant's own rule too: a rule more specific than
          // the part's plain one.)
          if (key.startsWith('variant:'))
            out.add(`${target}\0${kebab(prop)}\0variant`);
        }
  return out;
}

/**
 * What applies once `removed` is gone, in each mode it applied in: a
 * setting of the same thing saved for one mode applies in that mode only,
 * so a theme with two modes can have a different answer for each.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {import('./_settings.mjs').Setting} removed
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @returns {string}
 */
function nowApplies(ctx, data, removed, base) {
  const modes = removed.mode ? [] : modesOf(data);
  if (modes.length < 2) return nowAppliesIn(ctx, data, removed, base);
  const each = modes.map(m => ({
    m,
    now: nowAppliesIn(
      ctx,
      data,
      /** @type {import('./_settings.mjs').Setting} */ ({...removed, mode: m}),
      base,
    ),
  }));
  return each.every(x => x.now === each[0].now)
    ? nowAppliesIn(ctx, data, removed, base)
    : each.map(x => `${x.now} in ${x.m} mode`).join(' and ');
}

/**
 * What applies once `removed` is gone: a whole-theme setting of the same
 * thing for a part setting, a dial that still writes the token, or the
 * base theme's value.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {import('./_settings.mjs').Setting} removed
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @returns {string}
 */
function nowAppliesIn(ctx, data, removed, base) {
  // Vibrancy has no base theme value: the colors are made again at the
  // default.
  if (removed.source === 'dial' && removed.thing === 'vibrancy')
    return `the default vibrancy, ${VIBRANCY_DEFAULT}`;
  // A token the theme's own source sets shows its value, whatever else
  // the settings give it.
  if (removed.source === 'token' && !removed.on && !removed.when) {
    const own = ownSourceTokenValues(ctx.project.cwd, data.name)[removed.thing];
    if (own != null)
      return `${removed.thing} = ${own} (set in ${data.name}.theme.ts)`;
  }
  // On a part, the same for what the own source sets on that part's rule.
  if (
    (removed.source === 'token' || removed.source === 'property') &&
    removed.on
  ) {
    const own = ownPartTokens(
      ctx.project.cwd,
      data.name,
      removed.on,
      removed.when ?? 'base',
      removed.state ? `:${removed.state}` : null,
    );
    if (own.has(removed.thing))
      return `${removed.thing} = ${own.get(removed.thing) ?? 'its value'} on ${removed.on}${removed.state ? ` :${removed.state}` : ''}${removed.when ? ` when ${removed.when}` : ''} (set in ${data.name}.theme.ts)`;
  }
  // A role font removed under an exact --font-family-<role>: that token is
  // what shows there.
  if (
    removed.thing === 'font' &&
    removed.on &&
    FONT_ROLES.includes(removed.on)
  ) {
    const exact = data.settings.find(
      x =>
        x.source === 'token' &&
        !x.on &&
        !x.when &&
        x.thing === `--font-family-${removed.on}`,
    );
    if (exact) return describe(exact);
  }
  // Another setting of the same thing that still applies where this one
  // did (a whole-theme color removed over one saved for this mode): that
  // setting, not the base theme's value.
  if (!removed.on) {
    const still = [...data.settings]
      .reverse()
      .find(
        x =>
          x !== removed &&
          !x.on &&
          !x.when &&
          !x.state &&
          x.thing === removed.thing &&
          (removed.mode ? !x.mode || x.mode === removed.mode : Boolean(x.mode)),
      );
    if (still) return describe(still);
  }
  // A token a dial still writes (an accent color feeds --color-accent):
  // name that dial.
  if (removed.source === 'token' && !removed.on) {
    const value = (/** @type {import('./_settings.mjs').ThemeData} */ d) =>
      JSON.stringify(
        compileTheme(ctx, d, base).tokens?.[removed.thing] ?? null,
      );
    const now = value(data);
    if (now !== 'null')
      for (const d of [...data.settings].reverse()) {
        if (d.source !== 'dial' || d.on) continue;
        const without = {...data, settings: data.settings.filter(x => x !== d)};
        if (value(without) !== now)
          return PALETTE_DIALS.includes(d.thing)
            ? `the generated ${d.thing} color (${describe(d)})`
            : describe(d);
      }
  }
  // What still reaches where the removed setting applied: on a part, the
  // same thing set plainly on it, on its group, or for the whole theme; an
  // exact property on the part that this dial would have competed with.
  if (removed.on) {
    const fam = familyOf(removed.on);
    // The part's or its group's setting for the same variant and state
    // first (a group's hover after the part's hover goes), then a plain one.
    /** @param {(x: import('./_settings.mjs').Setting) => boolean} scoped */
    const find = scoped =>
      [...data.settings]
        .reverse()
        .find(
          x =>
            x.thing === removed.thing &&
            x !== removed &&
            (!x.mode || x.mode === removed.mode) &&
            (x.on === removed.on || (fam != null && x.on === fam)) &&
            scoped(x),
        );
    const reaches =
      (removed.when || removed.state
        ? find(
            x =>
              (x.when ?? '') === (removed.when ?? '') &&
              (x.state ?? '') === (removed.state ?? ''),
          )
        : undefined) ?? find(x => !x.when && !x.state);
    if (reaches) return describe(reaches);
    const DIAL_PROPERTY = wordTable(
      /** @type {Record<string, RegExp>} */ ({
        corners: /radius$/,
        spacing: /^(padding|gap)(-|$)/,
      }),
    );
    const exact =
      removed.source === 'dial' && DIAL_PROPERTY[removed.thing]
        ? data.settings.find(
            x =>
              x.source === 'property' &&
              x.on === removed.on &&
              DIAL_PROPERTY[removed.thing].test(x.thing),
          )
        : null;
    if (exact) return describe(exact);
    // A removed exact property leaves the dial whose build writes it there
    // (buttons, surfaces: read from the build), on the part, its group, or
    // the whole theme.
    if (removed.source === 'property') {
      const targets = partsOf(ctx, removed);
      const writer = [...data.settings].reverse().find(
        x =>
          x.source === 'dial' &&
          x !== removed &&
          (!x.on || x.on === removed.on || (fam != null && x.on === fam)) &&
          (x.when ?? '') === (removed.when ?? '') &&
          (x.state ?? '') === (removed.state ?? '') &&
          [...dialWrites(ctx, data, x, base)].some(k => {
            const [t, prop] = k.split('\0');
            return targets.includes(t) && prop === removed.thing;
          }),
      );
      if (writer) return describe(writer);
    }
    if (removed.source === 'property') {
      const dial = Object.entries(DIAL_PROPERTY).find(([, re]) =>
        re.test(removed.thing),
      )?.[0];
      const fromDial = dial
        ? [...data.settings]
            .reverse()
            .find(
              x =>
                x.thing === dial &&
                (x.on === removed.on || (fam && x.on === fam) || !x.on) &&
                (x.when ?? '') === (removed.when ?? '') &&
                (x.state ?? '') === (removed.state ?? ''),
            )
        : undefined;
      if (fromDial) return describe(fromDial);
    }
  }
  const whole =
    removed.on || removed.when || removed.state || removed.mode
      ? [...data.settings]
          .reverse()
          .find(
            x =>
              x.thing === removed.thing &&
              x.source === removed.source &&
              !x.on &&
              !x.when &&
              !x.state &&
              (!x.mode || x.mode === removed.mode),
          )
      : null;
  return whole ? describe(whole) : "the base theme's value";
}

/**
 * Settings saved for the mode a one-mode theme does not show: they apply
 * where Core draws that mode (a toast, a lightbox), as the theme's other
 * halves of its colors do.
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
function otherModeNotes(data) {
  const modes = modesOf(data);
  const off = data.settings.filter(
    s => s.mode && !modes.includes(/** @type {'light' | 'dark'} */ (s.mode)),
  );
  if (!off.length) return [];
  return [
    `a ${data.mode} theme shows the other mode only where Core draws it (a toast, a lightbox), so these apply there: ${off
      .slice(0, 4)
      .map(describe)
      .join(', ')}${off.length > 4 ? `, and ${off.length - 4} more` : ''}`,
  ];
}

/**
 * The tokens a whole-theme dial setting writes: those that differ between
 * the theme's dials with it and without it (a font role's family, and every
 * text size when the scale moves).
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {import('./_settings.mjs').Setting} s
 * @param {any} base
 * @returns {Set<string>}
 */
function dialTouched(ctx, data, s, base) {
  /** @param {import('./_settings.mjs').Setting[]} list */
  const dialsOnly = list => ({
    ...data,
    settings: list.filter(x => x.source === 'dial'),
  });
  const withDial = compileTheme(ctx, dialsOnly(data.settings), base);
  const without = compileTheme(
    ctx,
    dialsOnly(data.settings.filter(x => x !== s)),
    base,
  );
  const differs = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
    JSON.stringify(a) !== JSON.stringify(b);
  const touched = new Set(
    [
      ...Object.keys(withDial.tokens ?? {}),
      ...Object.keys(without.tokens ?? {}),
    ].filter(k => differs(withDial.tokens?.[k], without.tokens?.[k])),
  );
  for (const r of FONT_ROLES)
    if (differs(withDial.typography?.[r], without.typography?.[r]))
      touched.add(`--font-family-${r}`);
  // The type scale feeds every font size and every role size (body,
  // headings, labels): an exact one of those keeps its text as it is.
  if (differs(withDial.typography?.scale, without.typography?.scale))
    for (const k of Object.keys(ctx.project.core.tokenDefaults ?? {}))
      if (/^--(font-size-|text-[a-z0-9-]+-size$)/.test(k)) touched.add(k);
  return touched;
}

/**
 * The family and weight tokens the theme's own source sets as plain tokens
 * that phones do not show: on top of a base theme, its rule for those
 * screens sets its type again (a rule wins over plain tokens, by Core's
 * contract), unless an exact setting is repeated after it. The note names
 * the fix within that contract: the theme's typography, or a same-screens
 * rule.
 * @param {string} cwd
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
export function ownPhoneNotes(cwd, slug, data) {
  if (!data.like) return [];
  const exact = new Set(
    data.settings
      .filter(x => x.source === 'token' && !x.on && !x.when && !x.state)
      .map(x => x.thing),
  );
  // A family or size the theme's typography sets is kept on phones (the
  // base theme's rule for those screens keeps the theme's typography); only
  // one the tokens map sets is lost there.
  const entries = ownTokenEntries(cwd, slug);
  const roles = new Set(
    entries.filter(e => e.kind === 'typography').map(e => e.key.split('.')[0]),
  );
  const inMap = new Set(
    entries
      .filter(
        e =>
          e.token && !e.overridden && e.kind !== 'scoped' && e.kind !== 'chain',
      )
      .map(e => e.token),
  );
  /** @param {string} k */
  const fromTypography = k => {
    const role = /^--font-family-([a-z]+)$/.exec(k)?.[1];
    if (role)
      return roles.has(role) || (role === 'heading' && roles.has('body'));
    return roles.has('scale') && !/^--font-family-/.test(k);
  };
  // A value the build already writes for those screens too (the theme's
  // own rule for them, say) is kept there.
  const touch = builtTouchTokens(cwd, slug);
  const ownValue = (/** @type {string} */ k) =>
    entries.find(x => x.token === k && typeof x.value === 'string')?.value;
  const lost = ownSourceTokens(cwd, slug).filter(
    k =>
      PHONE_TYPE.test(k) &&
      !exact.has(k) &&
      (!fromTypography(k) || inMap.has(k)) &&
      !(ownValue(k) !== undefined && touch.get(k) === ownValue(k)),
  );
  if (!lost.length) return [];
  const families = lost.filter(k => /^--font-family-/.test(k));
  const others = lost.filter(k => !/^--font-family-/.test(k));
  const role =
    /^--font-family-([a-z]+)$/.exec(families[0] ?? '')?.[1] ?? 'body';
  // A family the theme's typography sets is kept on those screens; a
  // weight is kept there only by a rule for the same screens (a role's
  // weight without a scale builds nothing), so the fix names that rule
  // with the theme's own values.
  const valueOf = (/** @type {string} */ k) => ownValue(k) ?? '...';
  /** A value as a theme source writes it. @param {any} v @returns {string} */
  const literal = v =>
    typeof v === 'string'
      ? `'${v}'`
      : `{${Object.entries(v)
          .map(
            ([k, x]) =>
              `${/^[a-z]\w*$/i.test(k) ? k : `'${k}'`}: ${literal(x)}`,
          )
          .join(', ')}}`;
  const rule = `adaptations: {rules: [${literal({
    when: PHONE_RULE_WHEN,
    value: {
      tokens: Object.fromEntries(others.slice(0, 3).map(k => [k, valueOf(k)])),
    },
  })}]}`;
  const fix = [
    ...(families.length
      ? [
          `set ${families.length > 1 ? 'the families' : 'the family'} on the theme's typography in ${slug}.theme.ts (such as typography: {${role}: {family: ...}}, which that rule then keeps)`,
        ]
      : []),
    ...(others.length
      ? [
          `give ${others.length > 1 ? 'the weights' : 'the weight'} in a rule for the same screens in ${slug}.theme.ts (${rule})`,
        ]
      : []),
  ].join(', and ');
  return [
    `on ${PHONES}, the base theme's type shows for ${lost.slice(0, 4).join(', ')}${lost.length > 4 ? ` and ${lost.length - 4} more` : ''}, which ${slug}.theme.ts sets as plain tokens: the base theme's rule for those screens sets its type again, and a rule wins over plain tokens there. To keep yours on every screen, ${fix}`,
  ];
}

/**
 * Notes for the exact settings the theme's own source sets itself (a
 * whole-theme token, or a token or property on a part's plain or variant
 * rule): the file's value shows, not the setting.
 * @param {string} cwd
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
function ownOverSettingNotes(cwd, slug, data) {
  const top = ownSourceTokenValues(cwd, slug);
  const topKeys = new Set(ownSourceTokens(cwd, slug));
  /** @type {Map<string, Map<string, string | null>>} */
  const parts = new Map();
  /** @type {string[]} */
  const out = [];
  for (const x of data.settings) {
    if (x.source !== 'token' && x.source !== 'property') continue;
    if (!x.on) {
      if (x.source === 'token' && !x.when && topKeys.has(x.thing))
        out.push(
          `${describe(x)}: ${slug}.theme.ts sets ${x.thing} itself${top[x.thing] != null ? ` (${top[x.thing]})` : ''}, so this setting does not show${PHONE_TYPE.test(x.thing) ? ` on wide screens (on ${PHONES} it does: the editor repeats exact font settings there)` : ''}`,
        );
      continue;
    }
    const state = x.state ? `:${x.state}` : null;
    const key = `${x.on}\0${x.when ?? 'base'}\0${state ?? ''}`;
    if (!parts.has(key))
      parts.set(key, ownPartTokens(cwd, slug, x.on, x.when ?? 'base', state));
    const own = /** @type {Map<string, string | null>} */ (parts.get(key));
    // A padding the own source sets on the rule wins over every padding
    // setting there, whichever sides each names.
    const shown = own.has(x.thing)
      ? x.thing
      : /^padding(-|$)/.test(x.thing)
        ? [...own.keys()].find(k => /^padding(-|$)/.test(k))
        : undefined;
    if (shown)
      out.push(
        `${describe(x)}: ${slug}.theme.ts sets ${shown} on ${x.on}${state ? ` ${state}` : ''}${x.when ? ` when ${x.when}` : ''} itself${own.get(shown) != null ? ` (${own.get(shown)})` : ''}, so this setting does not show there`,
      );
  }
  return out;
}

/** Phones, as the base themes' type rule names them. */
const PHONES = 'phones (touch screens below 1024px)';

/**
 * What taking tokens out of the theme file lets show: the dial, or an
 * exact setting of a token first (file > exact > dial), with its undo.
 * @param {string} slug
 * @param {string} dial the dial's name
 * @param {string[]} tokens
 * @param {import('./_settings.mjs').ThemeData} data
 */
function ownTakeOut(slug, dial, tokens, data) {
  const it = tokens.length > 1 ? 'them' : 'it';
  const exact = data.settings.filter(
    x =>
      x.source === 'token' &&
      !x.on &&
      !x.when &&
      !x.state &&
      tokens.includes(x.thing),
  );
  if (!exact.length)
    return `take ${it} out of ${slug}.theme.ts to let ${dial} set ${it}`;
  return `taking ${it} out of ${slug}.theme.ts shows your exact ${exact.map(describe).join(', ')}, which win${exact.length > 1 ? '' : 's'} over ${dial}; after that, ${exact.map(x => `\`${P} undo ${slug} ${undoArgs(x)}\``).join(' and ')} lets ${dial} set ${it}`;
}

/**
 * Notes for the tokens the theme's own source sets that a whole-theme dial
 * also writes: the source wins, so the dial does not change them.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} cwd
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {any} base
 * @returns {string[]}
 */
function ownSourceMaskNotes(ctx, cwd, slug, data, base) {
  const own = ownSourceTokens(cwd, slug);
  if (!own.length) return [];
  /** @type {string[]} */
  const notes = [];
  for (const s of data.settings) {
    if (s.source !== 'dial' || s.on || s.when || s.state) continue;
    const touched = dialTouched(ctx, data, s, base);
    const wins = own.filter(k => touched.has(k));
    if (wins.length)
      notes.push(
        `${slug}.theme.ts sets ${wins.slice(0, 4).join(', ')}${wins.length > 4 ? ` and ${wins.length - 4} more` : ''} itself, and your own source wins over the settings, so ${s.thing} = ${s.value} does not change ${wins.length > 1 ? 'them' : 'it'}; ${ownTakeOut(slug, s.thing, wins, data)}`,
      );
  }
  return notes;
}

/**
 * The parts with a fill of their own that the theme leaves on its base's
 * look: no setting is on them, and their fill or their text color (the
 * tokens the part data says they paint them with, in any state) has the
 * base's value in both modes. A part counts as reached only when both its
 * fill and its text changed (a part with no text color of its own, by its
 * fill). The most visible first (overlays, feedback, navigation, then the
 * rest), so an agent sees which parts its look did not reach (toast,
 * banner, a selected nav item). None for a theme with no settings.
 * @param {any} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {Record<string, Record<string, string>>} res
 * @param {Record<string, any>} base
 * @returns {string[]}
 */
function unreachedParts(ctx, data, res, base) {
  if (!data.settings.length) return [];
  const modes = Object.keys(res).filter(m => m === 'light' || m === 'dark');
  /** @param {string} token */
  const changed = token =>
    modes.some(m => String(res[m]?.[token]) !== String(base[m]?.[token]));
  /** A setting at rest on the part that covers its fill or its text color:
   * a background or color property, or a color token it paints them with.
   * A setting of another property or of a state leaves it on the list.
   * @param {string} part @param {string[]} tokens */
  const covered = (part, tokens) =>
    data.settings.some(
      x =>
        x.on &&
        !x.state &&
        !x.when &&
        partsOf(ctx, x).includes(part) &&
        (/^(background(-color|-image)?|color)$/.test(x.thing) ||
          tokens.includes(x.thing)),
    );
  /** The color tokens a part paints a property with: never the shared
   * hover and pressed tints (--color-overlay-*), which lie over whatever
   * fill a part has and no setting moves, so they are no fill of its own.
   * @param {any[]} reads @param {(prop: string) => boolean} prop */
  const painting = (reads, prop) =>
    reads
      .filter(
        r =>
          /^--color-/.test(r.token) &&
          !/^--color-overlay-/.test(r.token) &&
          r.props.some(prop),
      )
      .map(r => r.token);
  const unreached = Object.keys(ctx.C.MAP).filter(part => {
    const reads = ctx.C.partReads(part, null);
    if (
      covered(
        part,
        painting(reads, x => /^background|^color$/.test(x)),
      )
    )
      return false;
    const fill = painting(reads, x => /^background/.test(x));
    if (!fill.length) return false;
    const text = painting(reads, x => x === 'color');
    return !(fill.some(changed) && (!text.length || text.some(changed)));
  });
  // The most visible first: by the category of the component the part
  // belongs to.
  const RANK = ['overlay', 'feedback & status', 'navigation', 'action'];
  /** @param {string} part */
  const rank = part => {
    const name = ctx.project.target.get(part)?.component;
    const info = name ? ctx.project.components[name] : null;
    const parent = info?.subComponentOf
      ? ctx.project.components[info.subComponentOf]
      : null;
    const at = RANK.indexOf(
      String(info?.category || parent?.category || '').toLowerCase(),
    );
    return at < 0 ? RANK.length : at;
  };
  return unreached
    .map((part, i) => ({part, i, r: rank(part)}))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.part);
}

/**
 * A problem a change made that the next step of a line the editor offered
 * clears: the change was the first step of a several-step missed line (a
 * tooltip's surface, then its text), and the problem sits on that line's
 * part. Its text says so, with that step, so a person running one step at
 * a time sees it is expected. Nothing is hidden: the problem stays listed.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').Setting} s the setting the change wrote
 * @param {{newProblems: Array<{text: string, key: string, fix: string | null}>, before?: import('./_settings.mjs').ThemeData | null, resBefore?: {light: Record<string, string>, dark: Record<string, string>} | null}} r
 */
async function sayNextStepClears(ctx, slug, s, r) {
  if (!r.newProblems.length || !r.before || !r.resBefore) return;
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
    String(a ?? '')
      .trim()
      .toLowerCase() ===
    String(b ?? '')
      .trim()
      .toLowerCase();
  const missed = missedSteps(
    ctx,
    r.before,
    r.resBefore,
    await baseResolved(ctx.project, r.before.like),
  );
  for (const m of missed) {
    const [first, next] = m.steps;
    if (
      !next ||
      !same(first.thing, s.thing) ||
      !same(first.value, s.value) ||
      !same(first.on, s.on) ||
      !same(first.mode, s.mode) ||
      !same(first.when, s.when) ||
      !same(first.state, s.state)
    )
      continue;
    const line = `${P} set ${slug} ${next.thing} ${quoteCommandArgument(next.value)}${next.on ? ` --on ${next.on}` : ''}${next.when ? ` --when ${next.when}` : ''}${next.state ? ` --state ${next.state}` : ''}${next.mode ? ` --mode ${next.mode}` : ''}`;
    for (const x of r.newProblems)
      if (new RegExp(`^text in ${m.part}\\b`).test(x.text))
        x.text += `; this was the first step of the line offered for ${m.part}, and its next step clears it: ${line}`;
  }
}

/**
 * How many misses the theme's own changes left (show lists each with the
 * line that reaches it), on how many parts (a part can miss two ways: its
 * border and its shadow), and which: what a change or a new theme reports.
 * Left out when none is missed.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>} | undefined} res
 *   the theme's tokens as the change built them (a change that changed
 *   nothing comes back with none: they are read again)
 * @returns {Promise<{missed?: number, missedParts?: number, missedOn?: string[]}>}
 */
async function missedSummary(ctx, slug, data, res) {
  if (!data.settings.length) return {};
  const list = await missedParts(
    ctx,
    slug,
    data,
    Object.keys(res?.light ?? {}).length
      ? /** @type {any} */ (res)
      : await resolvedTokens(ctx, slug),
    await baseResolved(ctx.project, data.like),
    {count: true},
  ).catch(() => []);
  const on = [...new Set(list.map(m => m.part))];
  return list.length
    ? {missed: list.length, missedParts: on.length, missedOn: on}
    : {};
}

/**
 * The parts the theme's own changes should have reached and did not, most
 * flagged first, each with why and the line that reaches it, its steps
 * joined with && (its state and variant named): with the accent changed, a
 * disabled part drawn as the accent at reduced opacity (a button), a
 * selected look still on the base's fill (a nav item), a status fill still
 * the base's (an info banner); with the page surfaces changed, a part on the
 * base's inverted surface (a toast); with the corners changed, a pill still
 * fully round; with the border width changed, a surface still borderless.
 * A setting that covers the aspect (the fill at rest or in that state, the
 * corners, the border) takes the part off. Each step is checked as set
 * checks it; one set refuses names `how` instead. Each line leaves the part
 * readable: the text that sits on a fill changes with it. None for a theme
 * with no settings.
 * @param {any} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {Record<string, Record<string, string>>} res
 * @param {Record<string, any>} base
 * @param {{count?: boolean}} [opts] `count`: the entries alone, their lines
 *   not built (a change counts them; show lists each with its line)
 * @returns {Promise<Array<{part: string, state?: string, why: string, line: string}>>}
 */
async function missedParts(ctx, slug, data, res, base, opts = {}) {
  const ordered = missedSteps(ctx, data, res, base);
  /** @type {Array<{part: string, state?: string, why: string, line: string}>} */
  const out = [];
  if (opts.count)
    return ordered.map(x => ({
      part: x.part,
      ...(x.state ? {state: x.state} : {}),
      why: x.why,
      line: '',
    }));
  for (const x of ordered) {
    /** @type {string[]} */
    const lines = [];
    let refused = false;
    for (const st of x.steps) {
      const typed = `${P} set ${slug} ${st.thing} ${quoteCommandArgument(st.value)}${st.on ? ` --on ${st.on}` : ''}${st.when ? ` --when ${st.when}` : ''}${st.state ? ` --state ${st.state}` : ''}${st.mode ? ` --mode ${st.mode}` : ''}`;
      const followed = await followChangeLine(
        'set',
        slug,
        typed,
        ctx.project.cwd,
      );
      if (followed.why) refused = true;
      else lines.push(followed.line);
    }
    // Only a line set takes: a part none reaches is left out, never given
    // a question that changes nothing.
    if (refused || !x.steps.length) continue;
    out.push({
      part: x.part,
      ...(x.state ? {state: x.state} : {}),
      why: x.why,
      line: lines.join(' && '),
    });
  }
  return out;
}

/**
 * Each corners or spacing dial set on a part or group, with what its parts
 * get, beside the whole-theme value: `corners large on containers ->
 * border-radius 12px on card, dialog, ... (whole theme: --radius-container
 * 10px)`.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @param {'light' | 'dark'} mode
 * @returns {string[]}
 */
function partValues(ctx, data, res, mode) {
  const masked = maskedSettings(data, ctx);
  return data.settings
    .filter(
      s =>
        s.source === 'dial' && s.on && ['corners', 'spacing'].includes(s.thing),
    )
    .map(s => {
      // A setting a later group setting covers shows that one's value.
      const hidden = masked.get(s);
      if (hidden) return `${describe(s)} -> not shown: ${hidden}`;
      // An exact property on the part wins over the dial there.
      const exact = data.settings.find(
        x =>
          x.source === 'property' &&
          x.on &&
          (s.thing === 'corners'
            ? x.thing === 'border-radius'
            : /^(padding|gap)(-|$)/.test(x.thing)) &&
          partsOf(ctx, x).some(t => partsOf(ctx, s).includes(t)) &&
          (x.when ?? '') === (s.when ?? '') &&
          (x.state ?? '') === (s.state ?? ''),
      );
      if (exact)
        return `${describe(s)} -> not shown: ${describe(exact)} is an exact property and wins there`;
      const parts = partsOf(ctx, s);
      const listed = `${parts.slice(0, 4).join(', ')}${parts.length > 4 ? `, and ${parts.length - 4} more` : ''}`;
      if (s.thing === 'corners') {
        const px = cornerPx(s.value);
        // The radius token each part's resting corners read, as the whole-
        // theme value they would have without this setting.
        // The token each part's resting corners read. A part the census saw
        // closed (a menu, a popover) has none recorded: a container or menu
        // reads the container radius, like every Core surface; any other
        // part's is unknown.
        /** @type {Map<string, string[]>} */
        const byToken = new Map();
        // A radio's circle is no corner: the dial leaves it (the build
        // writes nothing there).
        for (const t of parts) {
          const token = radioCircle(ctx.C, t)
            ? 'circle'
            : radiusTokenOf(ctx, t);
          byToken.set(token, [...(byToken.get(token) ?? []), t]);
        }
        const whole = [...byToken]
          .map(
            ([token, ts]) =>
              `${token === 'unknown' ? 'unknown' : token === 'circle' ? "a radio's circle, 50%" : `${token} ${res[mode][token] ?? 'unset'}`}${byToken.size > 1 ? ` for ${ts.join(', ')}` : ''}`,
          )
          .join('; ');
        // What the build writes on each part: a rung by the radius token
        // the part reads, an exact size as given.
        const rung = CORNERS.some(([n]) => n === s.value) || px >= 1000;
        const built = [...byToken]
          .map(([token, ts]) => {
            if (token === 'circle')
              return `none (a radio's circle stays 50%)${byToken.size > 1 ? ` on ${ts.join(', ')}` : ''}`;
            const v =
              rung && token !== 'unknown' && ctx.base
                ? radiusAt(ctx.base, s.value, token)
                : px >= 1000
                  ? 9999
                  : px;
            return `${v >= 9999 ? 'fully round' : `${v}px`}${byToken.size > 1 ? ` on ${ts.join(', ')}` : ''}`;
          })
          .join('; ');
        return `${describe(s)} -> border-radius ${built}${byToken.size > 1 ? '' : ` on ${listed}`} (whole theme: ${whole})`;
      }
      const f = SPACING.find(([n]) => n === s.value)?.[1] ?? 1;
      return `${describe(s)} -> spacing x${f} inside ${listed} (whole theme: --spacing-4 ${res[mode]['--spacing-4'] ?? 'unset'})`;
    });
}

/**
 * The colors part of `show`: the vibrancy, each color with its seed and the
 * shade each token uses in light and dark (an exact token setting wins and
 * says so), and the contrast moves behind the shade choices.
 * @param {import('./_palette.mjs').PaletteMapping | null} pal
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {Record<'light' | 'dark', Record<string, string>>} [built] the
 *   built theme's resolved values: where one differs from the generated
 *   shade with no exact setting, the theme's own source changed it
 * @param {string} [slug]
 * @param {Record<string, string>} [own] the tokens the theme's own source sets
 * @returns {{vibrancy: number | null, colors: import('./theme-edit.type.mjs').ThemeEditColor[], colorNotes: string[], colorProblems: Array<{problem: string, fix: string | null}>}}
 *   `colorProblems`: the color notes of pairings that fail their contrast
 */
function colorsReport(pal, data, built, slug = '', own = {}) {
  if (!pal)
    return {vibrancy: null, colors: [], colorNotes: [], colorProblems: []};
  /** What the user set for each token exactly, in each mode. */
  const exactBy =
    /** @type {Record<string, {light?: string, dark?: string}>} */ ({});
  for (const s of data.settings)
    if (s.source === 'token' && !s.on && !s.when && !s.state)
      for (const m of s.mode ? [s.mode] : ['light', 'dark'])
        (exactBy[s.thing] ??= {})[/** @type {'light' | 'dark'} */ (m)] =
          s.value;
  /** Tokens the theme's own source sets to another value than generated. */
  const ownBy =
    /** @type {Record<string, {light?: string, dark?: string}>} */ ({});
  /** Tokens that follow another the theme sets exactly ({@link FOLLOWS}). */
  const followBy =
    /** @type {Record<string, {light?: string, dark?: string}>} */ ({});
  for (const [k, v] of Object.entries(pal.tokens))
    for (const m of /** @type {const} */ (['light', 'dark'])) {
      const now = built?.[m]?.[k];
      if (
        now &&
        !exactBy[k]?.[m] &&
        now.trim().toLowerCase() !== String(v[m].color).trim().toLowerCase()
      )
        (FOLLOWS[k] && exactBy[FOLLOWS[k]]?.[m] != null && !(k in own)
          ? (followBy[k] ??= {})
          : (ownBy[k] ??= {}))[m] = now;
    }
  /** @param {import('./_palette.mjs').StopRef} r */
  const shade = r =>
    r.family === 'black' || r.family === 'white'
      ? `${r.family} ${r.color}`
      : `${r.family ? `${r.family} ` : ''}${r.stop}${r.alpha ? ` at opacity ${r.alpha}` : ''} ${r.color}${r.exact ? ' (your exact color)' : ''}`;
  // A theme with one mode lists only that mode's shades.
  const modes = modesOf(data);
  /** @param {{light: import('./_palette.mjs').StopRef, dark: import('./_palette.mjs').StopRef}} v */
  const shades = v => modes.map(m => `${m} ${shade(v[m])}`).join(', ');
  // The pairings the color config checked, in the theme's modes; one the
  // theme's own source changed no longer holds.
  const pairings = pal.contrast
    .filter(c => modes.includes(c.mode))
    .filter(
      c =>
        !ownBy[c.token]?.[/** @type {'light' | 'dark'} */ (c.mode)] &&
        !ownBy[c.against]?.[/** @type {'light' | 'dark'} */ (c.mode)],
    );
  /** @param {(typeof pairings)[number]} c */
  const pairingNote = c =>
    c.note
      ? c.note
      : c.pass
        ? `${c.token} ${c.mode}: shade ${c.stop}, not ${c.preferred}, so it reads at ${c.ratio}:1 on ${c.against}`
        : `${c.token} ${c.mode}: only ${c.ratio}:1 on ${c.against} at shade ${c.stop} (needs ${c.needs}:1)`;
  return {
    vibrancy: pal.vibrancy,
    colors: pal.families.map(fam => ({
      color: fam.id,
      seed: fam.seed,
      tokens: Object.fromEntries(
        Object.entries(pal.tokens)
          .filter(([, v]) => v.family === fam.id)
          .map(([k, v]) => [
            k,
            // Each mode says what it shows: the exact setting where one is
            // made for it, else the generated shade.
            exactBy[k] || ownBy[k] || followBy[k]
              ? modes
                  .map(m =>
                    exactBy[k]?.[m] != null
                      ? `${m} ${exactBy[k][m]} (your exact setting wins over the generated ${shade(v[m])})`
                      : ownBy[k]?.[m] != null
                        ? `${m} ${ownBy[k][m]} (your change in ${slug}.theme.ts wins over the generated ${shade(v[m])})`
                        : followBy[k]?.[m] != null
                          ? `${m} ${followBy[k][m]} (follows your ${FOLLOWS[k]}, over the generated ${shade(v[m])})`
                          : `${m} ${shade(v[m])}`,
                  )
                  .join(', ')
              : shades(v),
          ]),
      ),
    })),
    colorNotes: [
      // A note about a token the theme's own source changed is dropped:
      // what it says no longer holds.
      ...pal.notes.filter(
        n =>
          !Object.keys(ownBy).some(k =>
            new RegExp(`${k.replace(/[-]/g, '\\-')}(?![\\w-])`).test(n),
          ),
      ),
      ...pairings
        .filter(c => c.note || !c.pass || c.stop !== c.preferred)
        .map(pairingNote),
    ].filter(
      n =>
        !Object.keys(ownBy).some(k =>
          new RegExp(`${k.replace(/[-]/g, '\\-')}(?![\\w-])`).test(n),
        ),
    ),
    // Each with the line that passes it, when one does.
    colorProblems: pairings
      .filter(c => !c.pass)
      .map(c => ({
        problem: pairingNote(c),
        fix: c.fix
          ? `${P} set ${slug} ${c.fix.thing} ${quoteCommandArgument(c.fix.value)}${c.fix.mode && modesOf(data).length > 1 ? ` --mode ${c.fix.mode}` : ''}`
          : null,
      })),
  };
}

/**
 * The generated color files of a theme, for the end of `show`.
 * @param {string} slug
 */
function colorFiles(slug) {
  const f = paletteFiles(slug);
  return {config: f.config, module: f.palette, receipt: f.receipt};
}

/**
 * A setting's state as undo matches it: several at once in any order are
 * the same (`selected+hover`, `hover+selected`).
 * @param {unknown} state
 * @returns {string | null}
 */
function stateKeyOf(state) {
  return state == null ? null : String(state).split('+').sort().join('+');
}

/**
 * Put the theme back as it was before its last change. With `thing`, remove
 * that one setting instead, wherever it is in the settings: it goes back to
 * the base theme's value.
 * @experimental
 * @param {string} theme
 * @param {import('./theme-edit.type.mjs').ThemeEditUndoOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditUndoResponse | import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
export async function themeEditUndo(theme, options = {}) {
  try {
    return await undoTheme(theme, options);
  } catch (e) {
    // A theme name typed in another form (tTheme, T, brand_dark, themes/t):
    // the same undo with the theme's name comes first, never a look at the
    // theme that drops the undo.
    if (
      e instanceof AstryxError &&
      (e.code === E.ERR_INVALID_ARGUMENT || e.code === E.ERR_UNKNOWN_THEME)
    ) {
      const cwd = options.cwd ?? process.cwd();
      const showOf = (/** @type {{name: string}} */ x) => {
        const rest = x.name.startsWith(`${P} show `)
          ? x.name.slice(`${P} show `.length)
          : null;
        return rest && !/\s/.test(rest) ? rest : null;
      };
      // A setting's name is never a theme to make or look at, nor a theme
      // name typed with a typo.
      // (With its value in the same word, `corners pill`, too.)
      // (`corners:pill`, `corners, accent` and a pasted object too.)
      const firstWord = String(theme ?? '')
        .trim()
        .replace(/^\{\s*"?/, '')
        .split(/[\s:=,;|"]+/)[0];
      const settingName = namesSettingAsTyped(theme);
      // A list of themes (t,u) stays a look at each: one theme at a time.
      const shows = (e.suggestions ?? []).filter(x => showOf(x) != null);
      // (A list where the theme goes, `Inter, Arial`, is no typo of one.)
      const listed = /[,;|]/.test(String(theme ?? ''));
      const near = (
        shows.length === 1 && !settingName && !listed ? shows : []
      ).find(x => {
        const n = showOf(x);
        return (
          n != null &&
          n !== theme &&
          slugOk(n) &&
          fs.existsSync(themeFiles(cwd, n).settings)
        );
      });
      const name = near ? showOf(near) : null;
      if (near && name) {
        const words = [
          ...(options.thing ? [options.thing] : []),
          ...(options.value ? [options.value] : []),
          ...(options.on ? ['--on', options.on] : []),
          ...(options.when ? ['--when', options.when] : []),
          ...(options.state ? ['--state', options.state] : []),
          ...(options.mode ? ['--mode', options.mode] : []),
        ].map(w =>
          String(w).startsWith('--') ? w : quoteCommandArgument(String(w)),
        );
        const followed = await followChangeLine(
          'undo',
          name,
          `${P} undo ${name}${words.length ? ` ${words.join(' ')}` : ''}`,
          cwd,
        );
        // A step back with nothing to go back to is no line to offer: the
        // theme's show is.
        const stepless = !words.length && followed.why != null;
        e.suggestions = [
          stepless
            ? {
                name: `${P} show ${name}`,
                reason: `do this instead: ${name} is a theme here, and ${followed.why}`,
              }
            : {
                name: followed.line,
                reason: `do this instead: ${name} is a theme here${followed.why ? `, but this still needs a fix: ${followed.why}` : ''}`,
              },
          ...(e.suggestions ?? []).filter(x => x !== near),
        ];
      } else {
        // A word that is no theme here but a setting a theme here holds
        // (`undo accent`, `undo background-color --on card`): that theme's
        // undo of it, never a new theme or a look named after the setting.
        // A value typed unquoted with commas (`undo Inter, Arial`, `undo
        // rgb(1, 2, 3) --on card`) is read whole, as set reads it.
        const typedAll = [theme, options.thing, options.value]
          .filter(w => w != null && w !== '')
          .join(' ');
        let held = await heldSettingUndos(
          cwd,
          firstWord !== String(theme ?? '').trim() && namesSetting(firstWord)
            ? firstWord
            : theme,
          options,
        );
        if (
          !held.length &&
          typedAll !== String(theme ?? '') &&
          /,$/.test(String(theme ?? '').trim())
        )
          held = await heldSettingUndos(cwd, typedAll, options);
        const asSetting = held.length > 0 || settingName;
        // An undo never makes a theme from the word: no `new` line, but the
        // one that makes a theme here again whose settings file is gone.
        e.suggestions = [
          ...held,
          ...(e.suggestions ?? [])
            .filter(
              x =>
                // (A theme whose folder is here but whose settings file is
                // gone is made again under its own name.)
                (!x.name.startsWith(`${P} new `) ||
                  (x.name === `${P} new ${theme}` &&
                    slugOk(theme) &&
                    fs.existsSync(
                      path.dirname(themeFiles(cwd, theme).settings),
                    ))) &&
                !(asSetting && x.name === `${P} show ${theme}`),
            )
            // With no theme holding it, a look at each theme here says so.
            .map(x => {
              const n = showOf(x);
              return n && settingName && !held.length
                ? {
                    ...x,
                    reason: `do this instead: no theme here holds ${theme}; see what ${n} sets`,
                  }
                : x;
            }),
        ];
        if (!e.suggestions.length)
          try {
            e.suggestions = editedThemes(cwd)
              .slice(0, 3)
              .map(n => ({
                name: `${P} show ${n}`,
                reason: `do this instead: see what ${n} sets`,
              }));
          } catch {
            // No themes folder: nothing to look at.
          }
      }
    }
    // Then the theme typed after the setting (`undo corners t`).
    throw await swappedOrder(
      e,
      'undo',
      [theme, options.thing, options.value],
      options,
    );
  }
}

/**
 * The undo lines for a setting named where a theme was expected: each theme
 * here that holds a setting of that thing, in the typed scope, gets the
 * undo of it, followed before it is offered.
 * @param {string} cwd
 * @param {string} word the word typed as the theme
 * @param {import('./theme-edit.type.mjs').ThemeEditUndoOptions} options
 * @returns {Promise<import('../../foundation/response/base').Suggestion[]>}
 */
async function heldSettingUndos(cwd, word, options) {
  /** @type {import('../../foundation/response/base').Suggestion[]} */
  const out = [];
  /** @type {string[]} */
  let slugs;
  try {
    slugs = editedThemes(cwd);
  } catch {
    return out;
  }
  const scope = /** @type {const} */ (['on', 'when', 'state', 'mode']);
  for (const slug of slugs) {
    /** @type {import('./_settings.mjs').Setting[]} */
    let settings;
    try {
      settings = loadTheme(cwd, slug).settings;
    } catch {
      continue;
    }
    const holding = settings.filter(
      x => x.thing.toLowerCase() === word.toLowerCase(),
    );
    if (!holding.length) {
      // A typo of a setting's name the theme holds (`acent`), or a value it
      // holds (`red`, `pill`): that setting's undo, followed by undo's own
      // check.
      const near = nearest(word.toLowerCase(), [
        ...new Set(settings.map(x => x.thing.toLowerCase())),
      ]);
      for (const x of settings) {
        const byName = near.includes(x.thing.toLowerCase());
        if (!byName && !valueIs(x.value, word)) continue;
        const followed = await followChangeLine(
          'undo',
          slug,
          `${P} undo ${slug} ${byName ? undoArgs(x) : setArgs(x, String(x.value))}`,
          cwd,
        );
        if (followed.why == null)
          out.push({
            name: followed.line,
            reason: `do this instead: ${byName ? `${word} reads as ${x.thing}` : `${word} is the value of`}, a setting ${slug} holds (${describe(x)})`,
          });
      }
      continue;
    }
    const before = out.length;
    for (const x of holding) {
      // A setting for both modes applies in the mode named too.
      if (
        scope.some(
          k =>
            options[k] != null &&
            !(k === 'mode' && x.mode == null) &&
            String(/** @type {any} */ (x)[k] ?? '') !== String(options[k]),
        )
      )
        continue;
      const followed = await followChangeLine(
        'undo',
        slug,
        `${P} undo ${slug} ${undoArgs(x)}`,
        cwd,
      );
      if (followed.why == null)
        out.push({
          name: followed.line,
          reason: `do this instead: ${word} is a setting ${slug} holds (${describe(x)})`,
        });
    }
    // A scope typed in another spelling the undo reads (`--state
    // focusVisible`, `--on Card`, `--mode Dark`): the undo as typed on this
    // theme, read and followed by undo's own check.
    const flags = [
      ...scope.flatMap(k =>
        options[k] != null
          ? [`--${k} ${quoteCommandArgument(String(options[k]))}`]
          : [],
      ),
      ...(options.only ? ['--only'] : []),
    ];
    if (out.length === before && flags.length) {
      const followed = await followChangeLine(
        'undo',
        slug,
        `${P} undo ${slug} ${quoteCommandArgument(word)} ${flags.join(' ')}`,
        cwd,
      );
      if (followed.why == null)
        out.push({
          name: followed.line,
          reason: `do this instead: ${word} is a setting ${slug} holds`,
        });
    }
  }
  return out;
}

/**
 * Whether a saved value is the word typed: the same text in any case, or
 * the same color however written (`#f00` is red).
 * @param {unknown} saved
 * @param {string} typed
 */
function valueIs(saved, typed) {
  const a = String(saved ?? '')
    .trim()
    .toLowerCase();
  const b = String(typed).trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const [ca, cb] = [parseColor(a), parseColor(b)];
  return Boolean(ca && cb && hex(ca) === hex(cb));
}

/**
 * What a step back of a theme takes back now: each setting, base and mode
 * the last step in its history changes (stepTakesBack); none without one.
 * @param {string} cwd
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} now the settings now
 * @returns {string[]}
 */
function lastStepTakes(cwd, slug, now) {
  const steps = readHistory(themeFiles(cwd, slug).history).steps;
  const at = JSON.stringify({...now, lifted: 0, built: 0});
  for (let i = steps.length - 1; i >= 0; i--) {
    const before = settingsJson(steps[i]);
    if (
      !before ||
      typeof before !== 'object' ||
      !Array.isArray(before.settings)
    )
      return [];
    if (JSON.stringify({...before, lifted: 0, built: 0}) === at) continue;
    return stepTakesBack(now, before);
  }
  return [];
}

/**
 * What a step back from `after` to `before` takes back, each setting, base
 * and mode it changes, as the undo headline names them.
 * @param {import('./_settings.mjs').ThemeData} after the settings now
 * @param {import('./_settings.mjs').ThemeData} before the settings it goes back to
 * @returns {string[]}
 */
function stepTakesBack(after, before) {
  const now = new Map(before.settings.map(s => [keyOf(s), s]));
  const was = new Map(after.settings.map(s => [keyOf(s), s]));
  /** @type {string[]} */
  const took = [];
  for (const [k, s] of was) {
    const back = now.get(k);
    if (!back) took.push(describe(s));
    else if (back.value !== s.value)
      took.push(`${describe(s)} (back to ${back.value})`);
  }
  for (const [k, s] of now)
    if (!was.has(k)) took.push(`the removal of ${describe(s)}`);
  if ((after.like ?? 'none') !== (before.like ?? 'none'))
    took.push(
      `base ${after.like ?? 'none'} (back to ${before.like ?? 'none'})`,
    );
  if (after.mode !== before.mode)
    took.push(`mode ${after.mode} (back to ${before.mode})`);
  return took;
}

/**
 * {@link themeEditUndo}'s work.
 * @param {string} theme
 * @param {import('./theme-edit.type.mjs').ThemeEditUndoOptions} options
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditUndoResponse | import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
async function undoTheme(theme, options) {
  const {cwd = process.cwd(), png = false, thing} = options;
  // base and mode are not settings in the list: undoing one goes back to
  // what the theme was made with (the oldest step the history keeps).
  // A `base` or `mode` entry a hand edit put in the settings list is a
  // setting like any other there: undo removes it.
  const listed =
    (thing === 'base' || thing === 'mode') &&
    slugOk(theme) &&
    (() => {
      try {
        return JSON.parse(
          fs
            .readFileSync(themeFiles(cwd, theme).settings, 'utf8')
            .replace(/^\uFEFF/, ''),
        ).settings.some((/** @type {any} */ x) => x?.thing === thing);
      } catch {
        return false;
      }
    })();
  if ((thing === 'base' || thing === 'mode') && !listed) {
    requireProject(cwd);
    const now = loadTheme(cwd, theme, thing);
    const historyFile = themeFiles(cwd, theme).history;
    const {steps, dropped} = readHistory(historyFile);
    const [first] = steps;
    // `new` writes no history: with none, no change is saved (a new theme,
    // or a history deleted). An empty one is every step undone, back to how
    // the theme was made. A full one may have lost its oldest steps.
    const noHistory = !fs.existsSync(historyFile);
    const reachesStart =
      (steps.length > 0 && steps.length < HISTORY_STEPS) ||
      (!noHistory && steps.length === 0 && dropped === 0);
    /** @type {any} */
    let made = now;
    try {
      if (first) made = JSON.parse(first.replace(/^\uFEFF/, ''));
    } catch {
      made = now;
    }
    const of = (/** @type {any} */ d) =>
      thing === 'base' ? (d?.like ?? 'none') : (d?.mode ?? 'both');
    // A step in between that had another value: changed and changed back.
    const changedBack = steps.some(step => {
      try {
        return of(JSON.parse(step.replace(/^\uFEFF/, ''))) !== of(now);
      } catch {
        return false;
      }
    });
    if (of(made) === of(now))
      refuse(
        E.ERR_THEME_NOT_SET,
        reachesStart && changedBack
          ? `${thing} is back at ${of(now)}, the ${thing} ${theme} was made with (it was changed and changed back), so there is nothing to undo for it.`
          : reachesStart
            ? `${thing} was never changed: it is ${of(now)}, as ${theme} was made.`
            : noHistory
              ? `${thing} is ${of(now)}, and ${theme} has no saved change (it has had none since it was made, or its history was deleted), so there is no earlier ${thing} to go back to.`
              : `${thing} is ${of(now)}, and ${theme}'s history does not reach back to how it was made, so there is no earlier ${thing} to go back to. Set the ${thing} you want with \`${P} set ${theme} ${thing} …\` instead.`,
        {run: [`${P} show ${theme}`]},
      );
    return change('set', theme, thing, of(made), options);
  }
  if (thing != null)
    return change('undo', theme, thing, options.value, options);
  requireProject(cwd);
  // A scope flag without a thing would undo some other change.
  const scoped = /** @type {const} */ (['on', 'when', 'state', 'mode']).find(
    k => options[k] != null,
  );
  // A theme that does not exist is named as such first.
  if (
    (scoped || options.only) &&
    !fs.existsSync(themeFiles(cwd, theme).settings)
  )
    loadTheme(cwd, theme);
  if (scoped || options.only)
    refuse(
      E.ERR_MISSING_ARGUMENT,
      `--${scoped ?? 'only'} names where one setting applies; name the setting too, or drop it to step back one change.`,
      {
        run: [
          // The saved settings in that scope, as commands that remove them.
          ...(() => {
            try {
              return loadTheme(cwd, theme)
                .settings.filter(x =>
                  scoped
                    ? String(/** @type {any} */ (x)[scoped] ?? '') ===
                      String(options[scoped])
                    : x.only,
                )
                .slice(0, 3)
                .map(x => `${P} undo ${theme} ${undoArgs(x)}`);
            } catch {
              return [];
            }
          })(),
          // A step back only when there is one to take; else a look.
          readHistory(themeFiles(cwd, theme).history).steps.length
            ? `${P} undo ${theme}`
            : `${P} show ${theme}`,
        ],
      },
    );
  // A damaged settings file is what undo recovers from: the last history
  // entry replaces it without the current file being read.
  /** @type {import('./_settings.mjs').ThemeData | null} */
  let current = null;
  // A file in the theme that is a folder or cannot be read is named first;
  // the damaged-settings path below never sees it.
  if (slugOk(theme)) refuseUnreadableFiles(cwd, theme);
  // A link in the theme is refused as set refuses it, never read as an
  // empty history.
  if (slugOk(theme)) refuseLinks(cwd, theme);
  /** The command that works when the settings cannot be read. @type {string[] | null} */
  let repair = null;
  /** The settings reader's refusal of a file that reads but holds damage. @type {unknown} */
  let readsDamaged = null;
  try {
    current = loadTheme(cwd, theme);
  } catch (e) {
    if (!(e instanceof AstryxError && e.code === E.ERR_THEME_INVALID)) throw e;
    // A file that reads (valid JSON, entries new keeps) holding a damaged
    // entry is no unreadable file: its own refusal names what works.
    /** @type {string} */
    let text;
    try {
      text = fs.readFileSync(themeFiles(cwd, theme).settings, 'utf8');
    } catch {
      text = '';
    }
    if (text && !settingsRemade(settingsJson(text))) readsDamaged = e;
    // What the refusal itself names (make the theme again, keeping the
    // damaged file), never `show`, which fails the same way.
    repair = (e.suggestions ?? [])
      .map(x => x.name)
      .filter(n => !/ show /.test(` ${n} `) && !/ undo /.test(` ${n} `));
    if (!repair.length) repair = [`${P} new ${theme}`];
  }
  const f = themeFiles(cwd, theme);
  // A change command refused since the last change changed nothing: this
  // undo takes back the change before it, and says so.
  const refusedSince = refusedAfter(cwd, theme, f.history);
  const {steps: history, dropped} = readHistory(f.history);
  if (!history.length && dropped)
    refuse(
      E.ERR_THEME_INVALID,
      `${theme}.history.json is damaged, so there is no step to go back to.`,
      {
        fix: `move ${shown(cwd, f.history)} out of the theme folder (it is kept as it is): the next change starts a new history, and your settings stay as they are`,
        run: repair ?? [`${P} show ${theme}`],
      },
    );
  // No step back, and a file that reads but holds damage: the settings
  // reader's refusal, its undo and set's repair (never a `new` that is
  // refused for a theme that is there).
  if (!history.length && readsDamaged)
    throw await savedDamageRefusal(readsDamaged, theme, cwd);
  if (!history.length)
    refuse(
      E.ERR_THEME_NOTHING_TO_UNDO,
      `Nothing to undo: ${theme} has no earlier change${repair ? `, and ${theme}.settings.json cannot be read` : ''}.`,
      {run: repair ?? [`${P} show ${theme}`]},
    );
  // A top step equal to the settings now (left by an undo stopped between
  // its two writes) changes nothing: skip it.
  const nowText = fs.readFileSync(f.settings, 'utf8');
  const same = (/** @type {string} */ a, /** @type {string} */ b) => {
    const [x, y] = [settingsJson(a), settingsJson(b)];
    return (
      x !== undefined &&
      y !== undefined &&
      JSON.stringify({...x, lifted: 0, built: 0}) ===
        JSON.stringify({...y, lifted: 0, built: 0})
    );
  };
  while (history.length && same(history[history.length - 1], nowText))
    history.pop();
  if (!history.length)
    refuse(
      E.ERR_THEME_NOTHING_TO_UNDO,
      `Nothing to undo: ${theme} has no earlier change (the last step equals the settings now).`,
      {run: [`${P} show ${theme}`]},
    );
  const ctx = await context(cwd);
  // A --png takes the sample page and the open states again after the build.
  ctx.takesPictures = png ? {sheet: null} : null;
  const prevText = /** @type {string} */ (history.pop());
  let prev = /** @type {import('./_settings.mjs').ThemeData} */ (
    settingsJson(prevText)
  );
  // A step is read as a change reads the settings file.
  readAsMeant(prev, cwd);
  // A step always restores into this theme, whatever name it holds.
  prev.name = theme;
  // What the step's build showed is restored with it, not saved as a
  // setting.
  const built = /** @type {any} */ (prev).built;
  delete (/** @type {any} */ (prev).built);
  const radii =
    built?.radii && typeof built.radii === 'object'
      ? /** @type {Record<string, string>} */ (
          Object.fromEntries(
            Object.entries(built.radii).filter(
              ([k, v]) =>
                /^--radius-(element|inner|container|page)$/.test(k) &&
                typeof v === 'string' &&
                /^\d+(\.\d+)?px$/.test(v),
            ),
          )
        )
      : null;
  // The step it goes back to is checked like the settings file itself. A
  // value the editor no longer accepts is left out of that step (with a
  // note); a step whose shape is broken is refused.
  /** @type {import('./_settings.mjs').Setting[]} */
  let leftOut = [];
  if (settingsProblem(prev)) {
    const repaired = withoutBadValues(prev);
    const still = settingsProblem(repaired.data);
    if (still)
      refuse(
        E.ERR_THEME_INVALID,
        `The settings before the last change, in ${theme}.history.json, are damaged: ${still}.`,
        {
          fix: `move ${shown(cwd, f.history)} out of the theme folder (it is kept as it is): the next change starts a new history, and your settings stay as they are`,
          run: [`${P} show ${theme}`],
        },
      );
    prev = repaired.data;
    leftOut = repaired.dropped;
  }
  // The checks that need this Core too (a token's type, a part, a state,
  // a name that is no token or property): what they refuse is left out of
  // the step, with the same note, so the build stays valid.
  {
    const bad = new Set(storedProblems(ctx, theme, prev).map(p => p.setting));
    if (bad.size) {
      leftOut = [...leftOut, ...prev.settings.filter(s => bad.has(s))];
      prev = {...prev, settings: prev.settings.filter(s => !bad.has(s))};
    }
  }
  // The steps a later undo can still go back to: one equal to the settings
  // it would leave (a step this undo left a setting out of may then equal
  // the next one) is skipped, as undo skips it.
  let stepsLeft = 0;
  {
    let at = JSON.stringify(prev);
    for (let i = history.length - 1; i >= 0; i--)
      if (!same(history[i], at)) {
        stepsLeft++;
        at = history[i];
      }
  }
  // The popped history is written with the change, inside its rollback.
  const committed = await commitTheme(ctx, theme, prev, {
    history: false,
    historyAfter: history,
    radii,
  });
  /** @type {string[]} */
  const undone = current
    ? []
    : [
        `the damaged ${theme}.settings.json is replaced by the settings before the last change`,
      ];
  for (const x of leftOut)
    undone.push(
      `left out ${describe(x)} from the step it went back to: a value the editor no longer accepts`,
    );
  const now = new Map(prev.settings.map(s => [keyOf(s), s]));
  const was = new Map((current?.settings ?? []).map(s => [keyOf(s), s]));
  for (const [k, s] of was) {
    const back = now.get(k);
    if (!back) undone.push(`removed ${describe(s)}`);
    else if (back.value !== s.value)
      undone.push(`${describe(s)} is back to ${back.value}`);
  }
  if (current)
    for (const [k, s] of now)
      if (!was.has(k)) undone.push(`put back ${describe(s)}`);
  // What the build kept, such as a color file edited by hand.
  undone.push(...committed.notes);
  if (current && (current.like ?? 'none') !== (prev.like ?? 'none'))
    undone.push(
      `base ${current.like ?? 'none'} is back to ${prev.like ?? 'none'}`,
    );
  if (current && current.mode !== prev.mode) {
    undone.push(`mode ${current.mode} is back to ${prev.mode}`);
    undone.push(...modeWiringNotes(cwd, theme, current.mode, prev.mode));
  }
  // The page most about what the step reverted: Colors for a color,
  // Components for a part setting, else Overview.
  const touched = [
    ...[...was].filter(([k, s]) => now.get(k)?.value !== s.value),
    ...[...now].filter(([k]) => !was.has(k)),
  ].map(([, s]) => changeFocus(s));
  const focus = touched.includes('colors')
    ? 'colors'
    : touched.includes('components')
      ? 'components'
      : 'overview';
  const {cutShort, ...p} = await previewAndRoute(
    ctx,
    theme,
    prev,
    png,
    focus,
    'undo',
  );
  // What the step took back, for the headline: each setting, base and mode
  // it changed, in one line.
  const took = current ? stepTakesBack(current, prev) : [];
  const undid =
    took.length === 0
      ? 'the last change'
      : took.length === 1
        ? took[0]
        : `${took.length} changes: ${took.join('; ')}`;
  // The change now on top, from the history's own entries: what the next
  // undo takes back (an ask that made several changes is taken back one
  // step at a time).
  /** @type {string | null} */
  let next = null;
  {
    const at = JSON.stringify(prev);
    for (let i = history.length - 1; i >= 0; i--)
      if (!same(history[i], at)) {
        const before = settingsJson(history[i]);
        const back =
          before && typeof before === 'object' && Array.isArray(before.settings)
            ? stepTakesBack(prev, before)
            : [];
        if (back.length)
          next = `the change before this, ${back.join('; ')}, is next; undo again to take it back too`;
        break;
      }
  }
  return {
    type: 'themeEdit.undo',
    data: {
      theme,
      action: 'step',
      undid,
      ...(refusedSince
        ? {
            refusedBefore: `the last command (${refusedSince}) was refused and changed nothing, so this undid the change before it`,
          }
        : {}),
      undone,
      ...(next ? {next} : {}),
      settings: prev.settings.length,
      stepsLeft: stepsLeft,
      // What the step back changed, as a change reports it.
      changedTokens: committed.changed,
      changedPartTokens: committed.changedParts ?? [],
      problems: committed.problems,
      newProblems: [
        ...problemLines(committed.newProblems),
        ...cutShort.map(c => cutShortProblem(ctx, theme, c)),
      ],
      // Text the sample page's pictures draw cut short.
      ...(cutShort.length ? {notes: cutShort.map(cutShortNote)} : {}),
      ...p,
    },
  };
}

/**
 * Why an editor theme's build is not current, or null: the editor's own
 * staleness check (the settings it was built from, the CLI and packages it
 * was built with), for `compile --check`.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Promise<string | null>}
 */
export async function editorStale(cwd, slug) {
  const data = loadTheme(cwd, slug);
  return staleBuild(cwd, slug, data) || null;
}

/**
 * The notes the last build of the theme left (settings it could not write
 * as they are).
 * @param {unknown} ctx
 * @returns {string[]}
 */
function buildNotes(ctx) {
  const notes = /** @type {{compileNotes?: unknown}} */ (ctx)?.compileNotes;
  return Array.isArray(notes) ? notes.map(String) : [];
}

/**
 * The roles a page-wide font setting does not reach because the theme's
 * own source gives their family itself (a `typography` family or a
 * `--font-family-*` token): the source wins over its settings, so those
 * roles keep the source's family. Read from the build the set just made.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').Setting} s
 * @returns {string[]}
 */
function ownFamilyNotes(ctx, slug, s) {
  if (s.on || s.when || s.state) return [];
  const roles =
    s.thing === 'font'
      ? ['body', 'heading']
      : /^--font-family-[a-z]+$/.test(s.thing)
        ? [s.thing.slice('--font-family-'.length)]
        : [];
  if (!roles.length) return [];
  const cwd = ctx.project.cwd;
  const own = ownTokenEntries(cwd, slug).filter(
    e =>
      !e.overridden &&
      !e.block &&
      ((e.kind === 'typography' && /^[^.]+\.family$/.test(e.key)) ||
        (e.token != null && /^--font-family-/.test(e.token))),
  );
  if (!own.length) return [];
  /** @type {string} */
  let css;
  try {
    css = fs.readFileSync(themeFiles(cwd, slug).css, 'utf8');
  } catch {
    return [];
  }
  const unquote = (/** @type {string} */ f) => f.replace(/["']/g, '').trim();
  const asked = unquote(
    s.thing === 'font'
      ? fontOf(String(s.value)).family
      : (String(s.value).split(',')[0] ?? ''),
  );
  /** @type {Array<[string, string]>} */
  const kept = [];
  for (const role of roles) {
    const m = new RegExp(`--font-family-${role}:\\s*([^;}]+)`).exec(css);
    const first = m ? unquote(m[1].split(',')[0] ?? '') : '';
    if (first && first.toLowerCase() !== asked.toLowerCase())
      kept.push([role, first]);
  }
  if (!kept.length) return [];
  const fileOf = (/** @type {{file?: string}} */ e) =>
    e.file ? path.relative(cwd, e.file) : `themes/${slug}/${slug}.theme.ts`;
  const file = fileOf(own[0]);
  const where = own
    .map(
      e =>
        `${e.token ?? `typography.${e.key}`}${e.line ? ` (line ${e.line})` : ''}${fileOf(e) === file ? '' : ` in ${fileOf(e)}`}`,
    )
    .join(', ');
  const roleWords = (/** @type {string} */ role) =>
    role === 'body' ? 'body text' : role === 'heading' ? 'headings' : role;
  const families = [...new Set(kept.map(([, f]) => f))];
  const what = `${kept.map(([role]) => roleWords(role)).join(' and ')} keep${kept.length === 1 && kept[0][0] !== 'heading' ? 's' : ''} ${families.join(' and ')}`;
  return [
    `${describe(s)} does not show${kept.length < roles.length ? ` in ${kept.map(([role]) => roleWords(role)).join(' and ')}` : ''}: ${what}, because ${file} sets ${where} itself, and the theme's own source wins over its settings. To use ${asked} there, change the family in ${file}, or take it out of that file.`,
  ];
}
