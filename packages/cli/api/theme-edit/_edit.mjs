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
import {coversProperty} from './_css.mjs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {
  followLine,
  readSetLine,
  splitCommand,
  vetSuggestions,
} from './_vet.mjs';
import {
  allowedLine,
  colorPair,
  coversTyped,
  readsTyped,
  withoutCopyDebris,
} from './_normal.mjs';
import {
  AUTO_SPREAD,
  CORNERS,
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
  radiusTokenOf,
  contrastProblems,
  describe,
  entryDamage,
  entryNotes,
  keyOf,
  loadTheme,
  maskedSettings,
  modesOf,
  nearest,
  partsOf,
  undoArgs,
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
  madeByEditor,
  outputsDrift,
  kebab,
  camel,
  NEW_MARKER,
  clearNewMarker,
  refuseThemeSource,
  settingsEntriesOk,
  entriesReadable,
  readAsMeant,
  onBuiltIn,
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
  evaluatedTheme,
  nonTextMessage,
  ownPartTokens,
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
} from './_settings.mjs';
import {checkSetting, normalizeEntry, storedProblems} from './_check.mjs';
import {MODAL, isColorToken} from './_compiler.mjs';
import {colorProblem} from './_color.mjs';
import {
  PALETTE_DIALS,
  VIBRANCY_DEFAULT,
  paletteFiles,
  paletteMapping,
  paletteDialOf,
  paletteNotes,
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
  previewIsCurrent,
  takeFirstAppCopy,
  appCopyBehind,
  appCopyStale,
  copyFontsCss,
  writeAppCopy,
} from './_preview.mjs';
import {appWiring, refreshPreviewRoute, seeLine} from './_preview-app.mjs';
/** The preview command, as a person runs it. */
const PREVIEW_CMD = `${P.replace(/ editor$/, '')} preview`;
import {baseInstalled, baseResolved, installLine} from './_project.mjs';
import {reactMissing} from './_parts.mjs';
import {
  renderCause,
  requireProject,
  context,
  pictures,
  fontNotes,
  styledChanges,
  previewAfter,
  checkSection,
  stampSheet,
} from './_context.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  formatCliCommand,
  getCliInvocation,
  quoteCommandArgument,
} from '../../foundation/env/package-manager.mjs';

const E = ERROR_CODES;

/**
 * @typedef {import('./theme-edit.type.mjs').ThemeEditChangeOptions} ChangeOptions
 */
/** The marker a `new` writes first and removes last. */

/**
 * A folder the editor made but that has no settings: a stopped `new` left
 * its marker, or the settings were removed beside the editor's generated
 * module. `clear` is what `new` makes again (the files the editor writes
 * for that name, the source only exactly as it writes it); `keep` is every
 * other file, which is never touched. Null when the editor did not make
 * the folder. System files (.DS_Store) are in neither.
 * @param {string} dir
 * @param {string} slug
 * @param {boolean} [damaged] its settings are there but not valid JSON
 * @returns {{clear: string[], keep: string[]} | null}
 */
function editorLeftovers(dir, slug, damaged = false) {
  // The editor made this folder: a stopped `new` left its marker, the
  // generated settings module (which carries the editor's header) is there
  // without its settings, or its settings are there but damaged (kept
  // aside by `new`, so neither cleared nor kept here).
  const marked = fs.existsSync(path.join(dir, NEW_MARKER));
  if (
    !marked &&
    !damaged &&
    !madeByEditor(path.join(dir, `${slug}.settings.ts`))
  )
    return null;
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
    return settingsEntriesOk(settingsJson(fs.readFileSync(file, 'utf8')));
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
  const {cwd = process.cwd(), png = false, settings = {}} = options;
  // `--like none` builds on no base, as `set <theme> base none` does.
  const like = options.like === 'none' ? undefined : options.like;
  requireProject(cwd);
  // A corrected `new` keeps every option given, fixing only the bad one.
  // A --like in another case is the built-in theme it names.
  // A --like that names no built-in theme is the nearest one, or none: a
  // corrected command never repeats a --like that is refused below.
  // A guess (the nearest base to a word that names none) is only a base the
  // project has installed: another would be refused in turn. A base named
  // in other letters is the one meant, installed or not (its refusal then
  // offers the install, or the same new on no base).
  const have = LIKE.filter(b => baseInstalled(cwd, b));
  // `@astryxdesign/theme-butter`, `theme-butter`, `Butter`: butter.
  const baseName = (/** @type {unknown} */ v) =>
    String(v)
      .trim()
      .toLowerCase()
      .replace(/^@astryxdesign\/theme-/, '')
      .replace(/^theme-/, '');
  const likeFixed =
    like == null
      ? options.like === 'none'
        ? 'none'
        : undefined
      : LIKE.includes(baseName(like))
        ? baseName(like)
        : (nearest(baseName(like), have)[0] ?? null);
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
  const isUnfit = (/** @type {string} */ k, /** @type {unknown} */ x) =>
    unfit.some(([a, b]) => a === k && b === String(x));
  /** @type {Record<string, string | string[] | undefined>} */
  const fitSettings = Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [
      k,
      Array.isArray(v)
        ? v.filter(x => !isUnfit(k, x))
        : isUnfit(k, v)
          ? undefined
          : v,
    ]),
  );
  const flag = (/** @type {[string, string]} */ [k, x]) =>
    `--${k} ${quoteCommandArgument(x)}`;
  const dropped = [
    badValue.length
      ? ` The suggestion leaves out ${badValue.map(flag).join(', ')}: not ${badValue.length === 1 ? 'a value its dial takes' : 'values their dials take'} (${[...new Set(badValue.map(([k]) => `${k} takes ${DIALS[k].values}`))].join('; ')}).`
      : '',
    noEffect.length
      ? ` The suggestion leaves out ${noEffect.map(flag).join(', ')}: vibrancy saturates the theme's colors, and no color that is not a gray is given, so it would change nothing.`
      : '',
  ].join('');
  const again = (
    /** @type {string} */ newName,
    /** @type {string | null | undefined} */ likeValue = likeFixed,
  ) => `${P} new ${newName}${newFlags(likeValue, fitSettings, png)}`;
  // The same new as lines that run here: a built-in base the project has
  // not installed is installed first.
  const againLines = (
    /** @type {string} */ newName,
    /** @type {string | null | undefined} */ likeValue = likeFixed,
  ) =>
    likeValue && LIKE.includes(likeValue)
      ? onBuiltIn(cwd, likeValue, again(newName, likeValue))
      : [again(newName, likeValue)];
  if (!slugOk(name)) {
    // A path typed for the name (themes/brand, ./t, t/) names the theme the
    // path ends in.
    // A file name, the app copy's export (tTheme), camelCase or spaces
    // (BrandDark, "Brand Dark") name the theme they read as: when it is
    // here already, that is said, never a numbered second copy offered.
    const typed = String(name ?? '');
    const path_ = /[\\/]/.test(typed);
    const readings = themeNameReadings(typed);
    const present = readings.find(n =>
      fs.existsSync(themeFiles(cwd, n).settings),
    );
    const fixed =
      present ?? readings[0] ?? slugFor(path_ ? typedThemeName(typed) : typed);
    const exists = Boolean(present);
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `"${String(name ?? '').slice(0, 80)}" is not a theme name (${NAME_RULE})${exists ? `; ${fixed} is a theme here already` : ''}.${dropped}`,
      {
        run: exists
          ? [`${P} show ${fixed}`]
          : againLines(usableNewName(cwd, fixed)),
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
            : [
                ...againLines(mine, name),
                ...(baseInstalled(cwd, name) ? [] : [again(mine, null)]),
              ];
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
        ...new Set([
          `${P} show ${name}`,
          ...(likeFixed && LIKE.includes(likeFixed)
            ? onBuiltIn(cwd, likeFixed, `${P} set ${name} base ${likeFixed}`)
            : []),
          ...againLines(freeThemeName(cwd, name)),
        ]),
      ],
    });
  // A `new` stopped part way (killed, out of memory) leaves its own marker
  // beside the files it wrote: only such a folder is cleared, and only
  // after every argument is checked. Anything else in the folder, or a
  // folder without the marker, is never touched.
  const left = fs.existsSync(f.dir)
    ? editorLeftovers(f.dir, name, damaged)
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
  if (like != null && !LIKE.includes(like))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `--like takes a built-in theme (${LIKE.join(', ')}), not "${like}"${fs.existsSync(themeFiles(cwd, String(like)).settings) ? `; ${like} is a theme made here, and a new theme builds only on a built-in one` : ''}.`,
      {
        // The built-in theme it names in another case, or the nearest
        // installed one, else none: the did-you-mean and the run agree.
        didYouMean: likeFixed ? [likeFixed] : [],
        // A built-in base that is not installed: install it, then the same
        // new on it.
        run: [
          ...(likeFixed && likeFixed !== 'none' && !have.includes(likeFixed)
            ? [installLine(cwd, [`@astryxdesign/theme-${likeFixed}`])]
            : []),
          again(name, likeFixed ?? null),
        ],
      },
    );
  const ctx = await context(cwd);
  /** @type {import('./_settings.mjs').ThemeData} */
  const data = {name, ...(like ? {like} : {}), mode: 'both', settings: []};
  try {
    /** @type {import('./_settings.mjs').Ctx} */ (ctx).base =
      await baseResolved(ctx.project, data.like);
  } catch (e) {
    // A base that is not installed: install it, or the same new on no base.
    if (e instanceof AstryxError && e.code === E.ERR_UNKNOWN_THEME)
      e.suggestions = [
        ...(e.suggestions ?? []),
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
  const p = await previewAndRoute(ctx, name, data, png, 'overview', 'new');
  /** @type {string[]} */
  const notes = [
    ...keptNotes,
    ...leftNotes,
    ...(data.settings.some(s => s.thing === 'font')
      ? fontNotes(ctx, data)
      : []),
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
      problems: r.problems,
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
  if (followed.line === first.name) return e;
  e.suggestions = [
    {
      ...first,
      name: followed.line,
      reason: `do this instead: every flag fixed${followed.why ? `, but this still needs a fix: ${followed.why}` : ''}`,
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
  e.suggestions = (e.suggestions ?? []).map(s => {
    if (s.name === `${P} set --help`) return {...s, name: `${P} new --help`};
    if (!s.name.startsWith(setPrefix)) return s;
    const [thing, ...rest] = s.name.slice(setPrefix.length).split(' ');
    if (thing.startsWith('--') || !DIALS[thing]) return s;
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
  const typedLower = typed.toLowerCase();
  // A color in a line the user did not type (a stock example) goes.
  e.suggestions = (e.suggestions ?? []).filter(x => {
    if (!x.name.startsWith(`${P} new `)) return true;
    const m = new RegExp(`--${thing} '?(#[0-9a-f]{3,8})'?`, 'i').exec(x.name);
    return !m || typedLower.includes(m[1].toLowerCase());
  });
  // With every color line gone, the same new without that color, every
  // other option kept.
  if (!e.suggestions.some(x => x.name.startsWith(`${P} new `)))
    e.suggestions.push({
      name: `${P} new ${slug}${newFlags(like, {...settings, [thing]: undefined}, png)}`,
      reason: `without --${thing} ${quoteCommandArgument(typed)}`,
    });
  /** @type {Record<string, string>} */
  const pair = {};
  for (const m of typed.matchAll(
    /\b(light|dark)\b\s*(?:mode\s*)?[:=]?\s*(#[0-9a-f]{3,8}\b|[a-z]+\([^)]*\)|[a-z]+)/gi,
  ))
    pair[m[1].toLowerCase()] = m[2];
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
 * @returns {(sig: NodeJS.Signals) => void}
 */
export function stoppedAfterSave(slug, kind = 'set', cwd = process.cwd()) {
  const done =
    kind === 'undo'
      ? `the undo is done: ${slug} is saved and built as it was before that change`
      : kind === 'new'
        ? `${slug} is made and built`
        : `the change to ${slug} is saved and built (and its undo step kept)`;
  return sig => {
    process.stderr.write(
      `Stopped: ${done}; its checks and pictures did not run. ${formatCliCommand(`${P} show ${slug}`, cwd)} runs them.\n`,
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
  const stopped = stoppedAfterSave(slug, kind, ctx.project.cwd);
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
 * What a change of mode asks of the app's wiring: a one-mode theme is
 * given its mode by the app's <Theme>, and one back to both modes no longer.
 * @param {string} slug
 * @param {string | undefined} before
 * @param {string | undefined} after
 * @returns {string[]}
 */
function modeWiringNotes(slug, before, after) {
  const one = (/** @type {string | undefined} */ m) =>
    m === 'light-only' ? 'light' : m === 'dark-only' ? 'dark' : null;
  const [was, now] = [one(before), one(after)];
  if (was === now) return [];
  return [
    ...(was
      ? [
          `if the app's <Theme> was given mode="${was}" for ${slug}, take it out${now ? ` (or make it mode="${now}")` : ''}: with it the app stays ${was}, whatever the system asks for`,
        ]
      : []),
    ...(now && !was
      ? [
          `the app shows ${slug} in ${now} mode when its <Theme> is given mode="${now}" (<Theme theme={…} mode="${now}">), as the preview does; the theme keeps both halves of its colors, so a toast or a lightbox Core draws in the other mode stays readable`,
        ]
      : []),
  ];
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
    throw await swappedOrder(e, 'set', [theme, thing, value], options);
  }
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
  const [first, ...rest] = words.map(w => (w == null ? '' : String(w)));
  if (slugOk(first) && fs.existsSync(themeFiles(cwd, first).settings)) return e;
  const at = rest.findIndex(
    w => slugOk(w) && fs.existsSync(themeFiles(cwd, w).settings),
  );
  if (at < 0) return e;
  const theme = rest[at];
  const moved = [first, ...rest.filter((_, i) => i !== at)].filter(
    w => w !== '',
  );
  const flags = [
    ...(options.on ? ['--on', options.on] : []),
    ...(options.when ? ['--when', options.when] : []),
    ...(options.state ? ['--state', options.state] : []),
    ...(options.mode ? ['--mode', options.mode] : []),
  ];
  const line = `${P} ${sub} ${theme} ${[...moved, ...flags]
    .map(w => quoteCommandArgument(w))
    .join(' ')}${options.only ? ' --only' : ''}`;
  const followed = await followChangeLine(sub, theme, line, cwd);
  e.suggestions = [
    {
      name: followed.line,
      reason: `do this instead: ${theme} is the theme, so it comes first${followed.why ? `, but this still needs a fix: ${followed.why}` : ''}`,
    },
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
        ...bad.slice(0, 5).map(b => `${P} undo ${slug} ${undoArgs(b.setting)}`),
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
}

/**
 * For `compile`: the refusal `show` gives for saved settings the editor no
 * longer accepts (naming the undo that removes each), or null.
 * @param {string} root
 * @param {string} slug
 * @returns {Promise<import('../error.mjs').AstryxError | null>}
 */
export async function editorStoredRefusal(root, slug) {
  try {
    const ctx = await context(root);
    refuseStoredTokens(ctx, slug, loadTheme(root, slug));
    return null;
  } catch (e) {
    if (e instanceof AstryxError) return e;
    throw e;
  }
}

/**
 * The token values the theme's own source gives that `set` refuses (a
 * radius of `banana`, a color of `12px`), each with why and the line of
 * the file that sets it; checked with the very rules `set` uses.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {Promise<Array<{token: string, value: string, why: string, line: number | null, file?: string | null}>>}
 */
async function ownTokenProblems(ctx, slug, data) {
  const {cwd} = ctx.project;
  /** @type {Array<{token: string, value: string, why: string, line: number | null, file?: string | null}>} */
  const out = [];
  const known = ctx.project.core.tokenDefaults;
  /** @param {string} token @param {string} value @returns {string | null} */
  const refused = (token, value) => {
    try {
      checkSetting(ctx, slug, {...data, settings: []}, token, value, {});
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
  // Every value is judged as a build made now writes it (an import, an
  // expression, a spread or a computed key is its evaluated value). The
  // source is read to name the file and line that hold each value, and for
  // what a build erases or refuses outright: a `tokens` key given twice
  // (JavaScript keeps the last), a [light, dark] pair with other than two
  // values (the build drops the rest), a private variable (the build
  // refuses it), and a key that is no token name.
  const entries = ownTokenEntries(cwd, slug).filter(e => !e.overridden);
  const tokensLine = entries.find(e => e.kind === 'unresolved')?.line ?? null;
  /** Where the build's value for a token comes from. @param {string} token */
  const whereOf = token => {
    const e = entries.find(x => x.token === token);
    return e ? atOf(e) : {line: tokensLine, file: null};
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
    } else if (e.token?.startsWith('--_'))
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
  const built = await evaluatedTheme(ctx, slug, data.like ?? null);
  if (!built) return out;
  const named = new Set(out.map(b => b.token));
  // Typography: each token the build writes from it is judged like any
  // other, and named by the typography field that gives it.
  const typo = entries.filter(e => e.kind === 'typography');
  /** @param {string} role */
  const roleEntry = role =>
    typo.find(e => e.key.startsWith(`${role}.`)) ??
    (role === 'heading'
      ? typo.find(e => e.key.startsWith('body.'))
      : undefined);
  /**
   * The typography field that gives a token the build writes, or null when
   * the token is no typography token or the source sets no typography.
   * @param {string} token
   */
  const typographyOf = token => {
    if (!typo.length) return null;
    const family = /^--font-family-([a-z]+)$/.exec(token)?.[1];
    if (family) return roleEntry(family) ?? null;
    if (!/^--(font-size|text|heading)-/.test(token)) return null;
    if (/-weight$/.test(token))
      return (
        roleEntry(
          /heading/.test(token)
            ? 'heading'
            : /code/.test(token)
              ? 'code'
              : 'body',
        ) ??
        typo.find(e => /weight/.test(e.key)) ??
        typo[0]
      );
    return typo.find(e => e.key.startsWith('scale.')) ?? typo[0];
  };
  // The fields the typography is given, as the build was given them
  // (evaluated): what Core reads them as, with the working form.
  /** @type {Set<any>} */
  const flagged = new Set();
  for (const e of typo) {
    const value = e.key
      .split('.')
      .reduce(
        (/** @type {any} */ o, /** @type {string} */ k) => o?.[k],
        built.typography,
      );
    const why = typographyProblem(e.key, value);
    if (why) {
      flagged.add(e);
      out.push({
        token: `typography.${e.key}`,
        value: value == null ? '' : String(value),
        why,
        ...atOf(e),
      });
    }
  }
  const scale = built.typography?.scale;
  const scaleEntry = typo.find(e => e.key.startsWith('scale.'));
  if (
    scaleEntry &&
    scale &&
    scale.base === undefined &&
    !flagged.has(scaleEntry)
  ) {
    flagged.add(scaleEntry);
    out.push({
      token: 'typography.scale',
      value: '',
      why: 'the type scale is given no base, and Core reads the sizes from the base and the ratio together: add the body size in pixels, such as scale: {base: 16, ratio: …}',
      ...atOf(scaleEntry),
    });
  }
  for (const [token, value] of built.tops) {
    if (!(token in known) || named.has(token)) continue;
    const shape = built.shapes.get(token) ?? {kind: 'other'};
    if (
      value == null &&
      shape.kind !== 'number' &&
      shape.kind !== 'object' &&
      shape.kind !== 'pair'
    )
      continue;
    const owner = typographyOf(token);
    const own = built.own.has(token);
    if (!own && !owner) continue;
    // A typography token the build leaves as the base theme writes it is
    // the base theme's.
    if (owner && !own && built.base.get(token) === value) continue;
    // One problem per typography field: the first token it builds wrong.
    if (owner && flagged.has(owner)) continue;
    const at = owner ? atOf(owner) : whereOf(token);
    const label = owner ? `typography.${owner.key} (builds ${token})` : token;
    // A number, an object or a pair that is not two texts is no text.
    if (
      shape.kind === 'number' ||
      shape.kind === 'object' ||
      (shape.kind === 'pair' &&
        !(shape.halves ?? []).every(h => typeof h === 'string'))
    ) {
      out.push({
        token: label,
        value: '',
        why: nonTextMessage(
          ctx,
          slug,
          shape.kind === 'object'
            ? [token, shape.value, 'object']
            : [token, shape.kind === 'pair' ? shape.halves : shape.value],
        ),
        ...at,
      });
      if (owner) flagged.add(owner);
      continue;
    }
    if (value == null) continue;
    // Only a color differs by mode: a pair on any other token builds a
    // light-dark() no browser reads there. A size whose halves are bare
    // numbers is named with the unit it needs too.
    if (/^light-dark\(/i.test(value) && !isColorToken(token)) {
      const halves = value
        .replace(/^light-dark\(\s*|\s*\)$/gi, '')
        .split(/\s*,\s*/);
      const unitless =
        ctx.C.typeOf(token) === 'size' &&
        halves.every(h => /^\d*\.?\d+$/.test(h));
      out.push({
        token: label,
        value,
        why: unitless
          ? nonTextMessage(ctx, slug, [token, halves.map(Number), 'unit'])
          : `${at.file ?? `${slug}.theme.ts`} gives ${token} a [light, dark] pair, but only colors differ by mode: the build would write light-dark(), which browsers take only for colors; give it one value`,
        ...at,
      });
      if (owner) flagged.add(owner);
      continue;
    }
    const why = refused(token, value);
    if (why) {
      out.push({token: label, value, why, ...at});
      if (owner) flagged.add(owner);
    }
  }
  return out;
}

/**
 * What is wrong with one typography field of a theme's own source, or
 * null: a family is one family name without quotes (Core quotes it whole)
 * and with nothing CSS would read as the end of the value; the scale's
 * ratio is above 1 and at most 4, its base a positive number of pixels.
 * @param {string} key the dotted field (`body.family`, `scale.ratio`)
 * @param {unknown} value
 * @returns {string | null}
 */
function typographyProblem(key, value) {
  const field = key.split('.').pop();
  if (field === 'family') {
    if (typeof value !== 'string')
      return 'a typography family is a family name in quotes, such as "Inter"';
    const v = value.trim();
    if (/[;{}<>]/.test(v))
      return `"${v}" holds a ; { } < or >, so the CSS writer drops the whole declaration; give the family name alone, such as "Inter"`;
    const quoted = /^(["'])(.*)\1$/.exec(v);
    if (quoted)
      return `the family is written in quotes, and Core adds its own, so it builds ${JSON.stringify(`"${v}"`)}, a name no font has; write it without them: family: '${quoted[2]}'`;
    // Core quotes a family with a space whole, so a list here is one
    // family by that whole name, which exists nowhere.
    if (v.includes(','))
      return `a typography family is one family name, which Core quotes whole ("${v}" is one family that exists nowhere); give the first as family and the rest as fallbacks, such as family: '${v
        .split(',')[0]
        .trim()
        .replace(
          /^["']|["']$/g,
          '',
        )}', fallbacks: '${v.split(',').slice(1).join(',').trim()}'`;
    if (!v || /^[-+]?\d/.test(v) || /^(inherit|initial|unset|revert)$/i.test(v))
      return `"${v}" is no font family name; give one such as "Inter"`;
    return null;
  }
  if (field === 'ratio') {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 1 || n > 4)
      return `the type scale's ratio is how much each size grows over the last, a number above 1 and at most 4 (such as 1.2); ${JSON.stringify(value)} makes ${n <= 0 ? 'sizes that are not numbers' : n <= 1 ? 'every size the same or smaller' : 'sizes no page can use'}`;
    return null;
  }
  if (field === 'base') {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      // A size with a unit builds NaNrem: the number of pixels it means.
      const m = /^\s*([0-9.]+)\s*(px|rem|em)\s*$/i.exec(String(value));
      const px = m ? Number(m[1]) * (/^r?em$/i.test(m[2]) ? 16 : 1) : null;
      return `the type scale's base is the body size, a positive number of pixels${px ? `, so ${JSON.stringify(value)} is base: ${px}` : ' (such as 16)'}; ${JSON.stringify(value)} builds sizes no page can use${m ? ' (NaNrem)' : ''}`;
    }
    return null;
  }
  return null;
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
 * The refusal for own-source token values `set` refuses, or null.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {Promise<AstryxError | null>}
 */
async function ownTokenRefusal(ctx, slug, data) {
  const bad = await ownTokenProblems(ctx, slug, data);
  if (!bad.length) return null;
  const own = `themes/${slug}/${slug}.theme.ts`;
  const file = bad[0].file ?? own;
  return new AstryxError(
    `${own} gives ${bad.length === 1 ? 'a token a value' : `${bad.length} tokens values`} the editor refuses, which the build would write as it is: ${bad
      .slice(0, 3)
      .map(
        b =>
          `${b.token}${b.value ? `: "${b.value}"` : ''}${b.file ? ` (in ${b.file}${b.line ? `, line ${b.line}` : ''})` : b.line ? ` (line ${b.line})` : ''}: ${b.why.replace(/\.+$/, '')}`,
      )
      .join(
        '; ',
      )}${bad.length > 3 ? `; and ${bad.length - 3} more` : ''}. Change it in ${file}. Nothing was changed.`,
    [
      bad[0].line
        ? {
            name: `sed -n ${bad[0].line}p ${quoteCommandArgument(file)}`,
            reason: 'see the line that sets it',
          }
        : {
            name: `grep -n -- ${quoteCommandArgument(bad[0].token)} ${quoteCommandArgument(file)}`,
            reason: 'see the line',
          },
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

export {carriesTyped, offersTyped} from './_normal.mjs';

/**
 * An object of settings written as JSON, with single quotes, or as its
 * entries with no braces (`"accent": "#e11d48", "corners": "pill"`).
 * Throws when it is none of these.
 * @param {string} text
 * @returns {any}
 */
function looseObject(text) {
  const t = text.trim();
  const braced = t.startsWith('{') ? t : `{${t}}`;
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
function carryTyped(e, sub, slug, thing, typed, data) {
  if (
    sub !== 'set' ||
    !(e instanceof AstryxError) ||
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
  if (data?.like) saved.set('base', [data.like]);
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
    });
  });
  const covered = coversTyped(reads, typedText);
  /** @type {Set<string>} */
  const dropped = new Set();
  const lines = e.suggestions.filter((x, i) => {
    if (reads[i] === true || (Array.isArray(reads[i]) && covered)) return true;
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
        {
          name: `${P} how ${quoteCommandArgument(String(thing))}`,
          reason: 'what it takes',
        },
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
 * The lines of a repair that work: each run through set's own check (in
 * memory) and offered only when set takes it as offered and its value
 * passes the allowlist of exact readings of what was typed. With none
 * left, how for the thing.
 * @param {'set' | 'undo'} sub
 * @param {string} slug
 * @param {Array<string | [string, string]>} lines each line, or each line
 *   with the typed text it carries (an entry of a pasted object)
 * @param {string} cwd
 * @param {string} typed
 * @param {string} thing
 * @returns {Promise<string[]>}
 */
async function workingLines(sub, slug, lines, cwd, typed, thing) {
  /** @type {string[]} */
  const out = [];
  for (const item of lines) {
    const [line, own] = Array.isArray(item) ? item : [item, typed];
    // The line as set takes it (a repair set offers for it folded in).
    const followed = await followChangeLine(sub, slug, line, cwd);
    if (followed.why) continue;
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
    )
      continue;
    out.push(followed.line);
  }
  return out.length ? out : [`${P} how ${quoteCommandArgument(thing)}`];
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
 * @returns {Promise<{line: string, why: string | null}>}
 */
async function followChangeLine(sub, slug, line, cwd) {
  /** @type {import('./_settings.mjs').ThemeData} */
  let data;
  /** @type {import('./_settings.mjs').Ctx} */
  let ctx;
  try {
    data = loadTheme(cwd, slug);
    ctx = /** @type {import('./_settings.mjs').Ctx} */ (await context(cwd));
    ctx.base = await baseResolved(ctx.project, data.like);
  } catch {
    return {line, why: null};
  }
  const prefix = `${P} ${sub} ${slug} `;
  return followLine(
    line,
    now => {
      const read = readSetLine(
        sub === 'undo' ? now.replace(`${P} undo `, `${P} set `) : now,
        slug,
      );
      if (!read) return null;
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
            )
          : null;
      } catch (e) {
        if (e instanceof AstryxError) return e;
        throw e;
      }
    },
    name => name.startsWith(prefix),
  );
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
        ? /^\s*\{[\s\S]*\}\s*$/.test(thing)
          ? thing
          : null
        : /^\s*\{?\s*["']/.test(thing) && /["']\s*:/.test(String(value))
          ? `${thing}:${value}`
          : null;
  if (objectText != null) {
    /** @type {any} */
    let obj = null;
    try {
      obj = looseObject(objectText);
    } catch {
      // Not an object: read as typed.
    }
    if (obj && typeof obj === 'object' && Object.keys(obj).length > 1)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `This holds ${Object.keys(obj).length} settings; ${sub} changes one at a time.`,
        {
          // Each entry as its own line, a nested value (`{"$value": …}`, a
          // light and dark pair) written back as typed; each line checked,
          // and one set refuses is left out.
          run: await workingLines(
            sub,
            slug,
            Object.entries(obj)
              .slice(0, 6)
              .map(([k, x]) => {
                const entry =
                  x != null && typeof x === 'object'
                    ? JSON.stringify(x)
                    : String(x);
                const read = String(normalizeEntry(k, entry).value ?? '');
                // Each line with the entry it carries, as typed.
                return /** @type {[string, string]} */ ([
                  `${P} ${sub} ${slug} ${quoteCommandArgument(k)}${sub === 'set' ? ` ${quoteCommandArgument(read)}` : ''}`,
                  read,
                ]);
              }),
            options.cwd ?? process.cwd(),
            objectText,
            'settings',
          ),
        },
      );
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
  if (typeof thing === 'string') {
    const entry = normalizeEntry(thing, value);
    thing = entry.thing;
    value = entry.value;
    dropped = entry.dropped;
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
        `the pasted text also held "${dropped}", which this did not set${line && / set /.test(line) ? `: ${line} sets it` : ''}`,
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
        e.suggestions = [
          {
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
        vetSuggestions(e, seen.ctx, slug, seen.data),
        sub,
        slug,
        typedThing,
        typedValue,
        seen.data ?? savedAsWritten(options.cwd ?? process.cwd(), slug),
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
    // An undo may name a saved entry exactly as written.
    thing: sub === 'undo' ? typedThing : thing,
    on: options.on,
    when: options.when,
    state: options.state,
    mode: options.mode,
    // An undo removes the entry it names even when that entry's mode or
    // source means nothing.
    ...(sub === 'undo' ? {removing: true} : {}),
  });
  const data = loadTheme(cwd, slug, target);
  /** @type {string[]} */
  // A damaged mode or base the command does not set itself is read as
  // meant, or goes back to its default, so the theme loads again.
  const fieldNotes = [
    ...entryNotes(data),
    ...readFields(
      data,
      cwd,
      thing === 'mode' || thing === 'base' ? thing : undefined,
    ),
  ];
  const ctx = await context(cwd);
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
  // The saved entry an undo names exactly as written (thing and scope, in
  // their own letters), when the editor would read it as another setting
  // or refuse it: that entry is removed, never a valid neighbor the
  // cleaned name also matches.
  const exactIdx =
    sub === 'undo'
      ? data.settings.findIndex(
          x =>
            x.thing === typedThing &&
            (x.on ?? null) === (flags.on ?? null) &&
            (x.when ?? null) === (flags.when ?? null) &&
            (x.state ?? null) === (flags.state ?? null) &&
            (x.mode ?? null) === (flags.mode ?? null) &&
            Boolean(x.only) === Boolean(flags.only),
        )
      : -1;
  // An entry of this name whose mode or source means nothing is the one an
  // undo removes: only that entry, never a valid one beside it.
  const damagedIdx =
    sub === 'undo'
      ? data.settings.findIndex(
          x =>
            (x.thing === typedThing || x.thing === thing) &&
            (x.on ?? null) === (flags.on ?? null) &&
            (x.when ?? null) === (flags.when ?? null) &&
            (x.state ?? null) === (flags.state ?? null) &&
            (entryDamage(x) === 'only' ||
              Boolean(x.only) === Boolean(flags.only)) &&
            (entryDamage(x) === 'source' || entryDamage(x) === 'only'
              ? (x.mode ?? null) === (flags.mode ?? null)
              : entryDamage(x) === 'mode' && !flags.mode),
        )
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
  /** @type {import('./_settings.mjs').Setting} */
  let s;
  try {
    s =
      rawIdx >= 0
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
              (x.state ?? null) === (flags.state ?? null) &&
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
        // any other word (`all`) may mean the last step.
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
        throw new AstryxError(
          e.message,
          matches.length
            ? matches.slice(0, 5).map(x => ({
                name: `${P} undo ${slug} ${undoArgs(x)}`,
                reason: 'do this instead',
              }))
            : [
                steps && !nearSetting
                  ? {name: `${P} undo ${slug}`, reason: 'step back one change'}
                  : {name: `${P} show ${slug}`, reason: 'see what it sets'},
              ],
          e.code,
        );
      }
      throw e;
    }
    s = stored;
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
    const held = data.settings.find(x => keyOf(x) === keyOf(s));
    // `headings weight|tracking` names a half, not a value; a value is
    // compared as `set` reads it (case, spacing and quotes aside).
    const norm = (/** @type {string} */ x) =>
      x
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        // Spacing around commas, slashes and parentheses, and the quote
        // style, are not part of a value.
        .replace(/\s*([,()/])\s*/g, '$1')
        .replace(/'/g, '"')
        .replace(/^"|"$/g, '');
    const half =
      s.thing === 'headings' && ['weight', 'tracking'].includes(norm(value));
    if (
      held &&
      !half &&
      norm(held.value) !== norm(value) &&
      norm(held.value) !== norm(s.value ?? '')
    )
      refuse(
        E.ERR_THEME_NOT_SET,
        `The theme sets ${describe(held)}, not ${value}.`,
        {run: [`${P} undo ${slug} ${undoArgs(held)}`]},
      );
  }
  const compiledBefore = compileTheme(ctx, data, base);
  // The build notes the theme had before this change: only new ones are
  // this change's to report.
  const notesBefore = new Set(buildNotes(ctx));
  if (sub === 'set' && (s.thing === 'base' || s.thing === 'mode')) {
    // A built-in base this project has not installed: install it, then the
    // same set, whichever letters it was typed in.
    if (
      s.thing === 'base' &&
      s.value !== 'none' &&
      !baseInstalled(cwd, s.value)
    )
      refuse(
        E.ERR_UNKNOWN_THEME,
        `The ${s.value} theme is not installed, so ${slug} cannot build on it. Install @astryxdesign/theme-${s.value}, then set the base again, or build on no theme.`,
        {
          run: [
            installLine(cwd, [`@astryxdesign/theme-${s.value}`]),
            `${P} set ${slug} base ${s.value}`,
            `${P} set ${slug} base none`,
          ],
        },
      );
    const before = s.thing === 'base' ? (data.like ?? 'none') : data.mode;
    if (s.thing === 'base') {
      if (s.value === 'none') delete data.like;
      else data.like = s.value;
    } else
      data.mode = /** @type {'both' | 'light-only' | 'dark-only'} */ (s.value);
    const r = await commitTheme(ctx, slug, data, {history: true});
    const p = await previewAndRoute(ctx, slug, data, png, 'overview', sub);
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
        styled: styledChanges(compiledBefore, compileTheme(ctx, data, after)),
        kept: [],
        lifted: r.lifted,
        notes: [
          ...(r.unchanged
            ? [`no change: ${s.thing} is already ${s.value}`]
            : []),
          ...fieldNotes,
          ...r.notes,
          ...(data.settings.length
            ? [
                `your ${data.settings.length} setting${data.settings.length === 1 ? ' is' : 's are'} kept`,
              ]
            : []),
          ...otherModeNotes(data),
          // Back to both modes: a mode the app's <Theme> was given for the
          // one-mode theme pins it still.
          ...(s.thing === 'mode' &&
          data.mode === 'both' &&
          (before === 'light-only' || before === 'dark-only')
            ? [
                `if the app's <Theme> was given mode="${before === 'light-only' ? 'light' : 'dark'}" for ${slug}, take it out: with it the app stays ${before === 'light-only' ? 'light' : 'dark'}, whatever the system asks for`,
              ]
            : []),
          // Core has no mode inside a theme: the app's <Theme> is given it.
          ...(s.thing === 'mode' &&
          (data.mode === 'light-only' || data.mode === 'dark-only')
            ? [
                `the app shows ${slug} in ${data.mode === 'light-only' ? 'light' : 'dark'} mode when its <Theme> is given mode="${data.mode === 'light-only' ? 'light' : 'dark'}" (<Theme theme={…} mode="${data.mode === 'light-only' ? 'light' : 'dark'}">), as the preview does; the theme keeps both halves of its colors, so a toast or a lightbox Core draws in the other mode stays readable`,
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
        ],
        problems: r.problems,
        warnings: r.warnings,
        ...p,
      },
    };
  }
  const k = keyOf(s);
  const prevIdx =
    rawIdx >= 0
      ? rawIdx
      : // A setting listed twice by hand: the last entry is the one the
        // build reads, so it is the one this command changes.
        data.settings.map(x => keyOf(x)).lastIndexOf(k);
  /** @type {string | null} */
  let vibrancyGone = null;
  const prev = prevIdx >= 0 ? data.settings[prevIdx] : null;
  if (sub === 'undo') {
    if (!prev) {
      // A padding set in the other form (a side for the shorthand, or the
      // shorthand for a side) on the same part is a near one too.
      const PAD = /^padding(?:-(?:inline|block|top|right|bottom|left))?$/;
      const nearOnes = data.settings.filter(
        x =>
          x.thing === s.thing ||
          (PAD.test(s.thing) &&
            PAD.test(x.thing) &&
            (x.on ?? null) === (s.on ?? null)),
      );
      const near = nearOnes.map(describe);
      // A token the theme's own source sets: that file is where it is
      // changed, never the settings.
      const ownEntry =
        s.thing.startsWith('--') && !s.on && !s.when && !s.state
          ? ownTokenEntries(cwd, slug).find(
              x => x.token === s.thing && !x.overridden,
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
    // A setting listed twice by hand goes in full.
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
  /** @type {import('./_settings.mjs').Setting[]} */
  let alsoReplaced = [];
  if (sub === 'set') {
    const last = data.settings.map(x => keyOf(x)).lastIndexOf(k);
    alsoReplaced = data.settings.filter((x, i) => keyOf(x) === k && i !== last);
    data.settings = data.settings.filter(
      (x, i) => keyOf(x) !== k || i === last,
    );
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
            // A shorthand for one mode replaces longhands of that mode or of
            // both, never the other mode's.
            (!s.mode || !x.mode || x.mode === s.mode) &&
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
                partsOf(ctx, x).some(t => writes.has(`${t}\0${x.thing}`)),
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
          `${describe({...prev, value: '?'}).replace(' = ?', '')} was listed ${alsoReplaced.length === 1 ? 'twice' : `${alsoReplaced.length + 1} times`} (${[...alsoReplaced, prev].map(x => x.value).join(', ')}); each is replaced`,
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
  if (PALETTE_DIALS.includes(s.thing) && sub === 'set')
    notes.push(
      ...paletteNotes(
        paletteMapping(cwd, slug, data, base, ctx.project.core.tokenDefaults),
        s.thing,
        slug,
        modesOf(data),
      )
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
    if (pal?.families.some(x => x.dial === dialOfToken))
      notes.push(
        ...paletteNotes(pal, dialOfToken, slug, modesOf(data)).filter(
          n => !n.startsWith('the generated colors are in '),
        ),
      );
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
  if (s.thing === 'neutral' && sub === 'set') {
    // Only the theme's own modes; a dark theme gets no white-page offer.
    const modes = modesOf(data);
    const pages = modes
      .map(m => [m, base[m]['--color-background-body']])
      .filter(([, v]) => v)
      .map(([m, v]) => `${v} in ${m}`);
    notes.push(
      `the page background stays the base theme's${pages.length ? ` (${pages.join(', ')})` : ''}${
        modes.includes('light')
          ? `; for a white or off-white page: ${P} set ${slug} --color-background-body ${quoteCommandArgument('#ffffff')}${modes.length > 1 ? ' --mode light' : ''}`
          : `; for another page color: ${P} set ${slug} --color-background-body ${quoteCommandArgument('#f8fafc')}`
      }`,
    );
  }
  if (s.thing === 'vibrancy') {
    notes.push(
      sub === 'set'
        ? `every color this theme sets is made again at vibrancy ${s.value} (0 is gray, 100 the most vivid, ${VIBRANCY_DEFAULT} the default)`
        : `every color this theme sets is made again at the default vibrancy, ${VIBRANCY_DEFAULT}`,
    );
    notes.push(...unsetColorNotes(data, base, slug));
  }
  if (s.thing === 'font' && sub === 'set')
    notes.unshift(...fontNotes(ctx, {...data, settings: [s]}));
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
  const p =
    r.unchanged &&
    !png &&
    fs.existsSync(f0.preview) &&
    previewIsCurrent(ctx, slug, data)
      ? {
          preview: shown(cwd, f0.preview),
          pictures: [],
          pictureProblem: null,
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
        ? {removed: prev, now: nowApplies(ctx, data, prev, base)}
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
      notes,
      parts,
      group: group
        ? {
            name: group,
            members: parts,
            onlyHint: !FAMILIES[s.on ?? ''] && AUTO_SPREAD.includes(group),
          }
        : null,
      changedTokens: r.changed,
      styled,
      kept,
      lifted: r.lifted,
      problems: r.problems,
      warnings: r.warnings,
      ...p,
    },
  };
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
  const section = checkSection(options.section, theme);
  const data = loadTheme(cwd, theme);
  const ctx = await context(cwd);
  // The app copy is written once show succeeds (at its end), never by a
  // build a later refusal puts back.
  holdAfterBuild(ctx);
  refuseStoredTokens(ctx, theme, data);
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
        // Only a missing React is fixed by installing it; two copies or a
        // component that throws are named in the message.
        run:
          ctx.uncheckedCode === 'ERR_RENDER_MISSING_DEPENDENCY'
            ? [installLine(cwd, ['react', 'react-dom'])]
            : // Two copies of React and other install problems are named by
              // doctor; the same show would fail the same way.
              [`${getCliInvocation(cwd)} doctor`],
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
      await buildTheme(ctx, theme, data);
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
        {run: [`${P} how --list dials`]},
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
        `${theme}.js could not be read, and it cannot be built again: ${brokenSource}. Put back the import of ${camel(theme)}Settings from './${theme}.settings', extends: ${camel(theme)}Settings and name: '${theme}' in ${shown(cwd, f.ts)}, then run show again.`,
        {
          run: [`cat ${quoteCommandArgument(shown(cwd, f.ts))}`],
        },
      );
    unreadable = `${theme}.js could not be read (${e instanceof Error ? e.message.split('\n')[0] : String(e)}), so it was built again from the settings`;
    await buildTheme(ctx, theme, data);
    return resolvedTokens(ctx, theme);
  });
  const ownOverNotes = ownOverSettingNotes(cwd, theme, data);
  const ownMasked = ownOverNotes.map(n => n.slice(0, n.indexOf(': ')));
  const checked = await contrastProblems(ctx, data, res);
  // What cannot be measured is a note, not a problem.
  const problems = checked.filter(x => !x.startsWith('not checked'));
  const pal = paletteMapping(
    cwd,
    theme,
    data,
    await baseResolved(ctx.project, data.like),
    ctx.project.core.tokenDefaults,
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
        {run: [`${getCliInvocation(cwd)} doctor`]},
      );
    }
  };
  const preview = noPages
    ? shown(cwd, f.preview)
    : await rendering(() => renderPreview(ctx, theme, data));
  const previewStale = noPages
    ? []
    : await rendering(() => keepPreviewRoute(ctx, theme));
  const sheet = noPages
    ? {file: shown(cwd, f.sheet), components: 0, skipped: []}
    : await rendering(() => renderSheet(ctx, theme, data, {group: section}));
  // The full sheet records the build it shows, so a later change tells a
  // sheet that still matches (after an undo) from one that does not.
  if (!noPages)
    stampSheet(
      section ? path.join(f.dir, `sheet-${section}.html`) : f.sheet,
      theme,
      cwd,
    );
  const modes = modesOf(data);
  const shots =
    png && !noPages
      ? await pictures(
          ctx.project,
          [
            {html: f.preview, png: f.previewPng},
            // A section is photographed from its own sheet.
            section
              ? {
                  html: path.join(f.dir, `sheet-${section}.html`),
                  png: path.join(f.dir, `sheet-${section}.png`),
                }
              : {html: f.sheet, png: f.sheetPng},
          ],
          modes,
        )
      : // Pictures asked for but not taken: said, never a quiet none.
        {
          files: [],
          problem: png
            ? readOnly
              ? 'no picture was taken: show ran read-only (the project or its install cannot be written, so it could not hold the theme lock), and the pages the pictures are taken of were not made; run show --png where the project can be written'
              : 'no picture was taken: React is not installed here, so the pages the pictures are taken of could not be made; install react and react-dom, then run show --png again'
            : null,
        };
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
                      partsOf(ctx, x).some(t => writes.has(`${t}\0${x.thing}`)),
                  )
                : undefined;
              if (exact)
                masked = `${describe(exact)} is an exact property and wins over ${s.thing} on ${exact.on}`;
            }
            return {...s, parts: partsOf(ctx, s), ...(masked ? {masked} : {})};
          });
      })(),
      notes: [
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
              `${brokenSource}, so settings cannot take effect; put back the import, extends and name lines in ${theme}.theme.ts${/no longer names the theme/.test(brokenSource) ? ` (a copy of another theme's source still names that theme: change its name to '${theme}')` : ''}`,
            ]
          : []),
        // A setting the theme file wins over is not live: no contrast
        // caveat for it (its own note says it does not show).
        ...checked.filter(
          x =>
            x.startsWith('not checked') &&
            !ownMasked.some(d => x.includes(` for ${d},`)),
        ),
        ...fontNotes(ctx, data),
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
      ...colorsReport(pal, data, res, theme),
      problems,
      preview,
      previewStale,
      sheet: sheet.file,
      sheetComponents: sheet.components,
      skipped: sheet.skipped,
      pictures: shots.files,
      pictureProblem: shots.problem,
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
        if (typeof value === 'string' && plain[target]?.[key]?.[prop] !== value)
          out.add(`${target}\0${kebab(prop)}`);
  return out;
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
function nowApplies(ctx, data, removed, base) {
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
 * Settings saved for a mode a one-mode theme does not have: they stay saved
 * and apply again when the theme has that mode.
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
    `not applied in a ${data.mode} theme, kept for when it has that mode again: ${off
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
function ownPhoneNotes(cwd, slug, data) {
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
    entries.filter(e => e.token && !e.overridden).map(e => e.token),
  );
  /** @param {string} k */
  const fromTypography = k => {
    const role = /^--font-family-([a-z]+)$/.exec(k)?.[1];
    if (role)
      return roles.has(role) || (role === 'heading' && roles.has('body'));
    return roles.has('scale') && !/^--font-family-/.test(k);
  };
  const lost = ownSourceTokens(cwd, slug).filter(
    k =>
      PHONE_TYPE.test(k) &&
      !exact.has(k) &&
      (!fromTypography(k) || inMap.has(k)),
  );
  if (!lost.length) return [];
  const families = lost.filter(k => /^--font-family-/.test(k));
  const role =
    /^--font-family-([a-z]+)$/.exec(families[0] ?? '')?.[1] ?? 'body';
  return [
    `on ${PHONES}, the base theme's type shows for ${lost.slice(0, 4).join(', ')}${lost.length > 4 ? ` and ${lost.length - 4} more` : ''}, which ${slug}.theme.ts sets as plain tokens: the base theme's rule for those screens sets its type again, and a rule wins over plain tokens there. To keep yours on every screen, set ${lost.length > 1 ? 'them' : 'it'} on the theme's typography in ${slug}.theme.ts (such as typography: {${role}: {family: ...}}, which that rule then keeps), or in a rule for the same screens`,
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
        for (const t of parts) {
          const token = radiusTokenOf(ctx, t);
          byToken.set(token, [...(byToken.get(token) ?? []), t]);
        }
        const whole = [...byToken]
          .map(
            ([token, ts]) =>
              `${token === 'unknown' ? 'unknown' : `${token} ${res[mode][token] ?? 'unset'}`}${byToken.size > 1 ? ` for ${ts.join(', ')}` : ''}`,
          )
          .join('; ');
        // What the build writes on each part: a rung by the radius token
        // the part reads, an exact size as given.
        const rung = CORNERS.some(([n]) => n === s.value) || px >= 1000;
        const built = [...byToken]
          .map(([token, ts]) => {
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
 * @returns {{vibrancy: number | null, colors: import('./theme-edit.type.mjs').ThemeEditColor[], colorNotes: string[]}}
 */
function colorsReport(pal, data, built, slug = '') {
  if (!pal) return {vibrancy: null, colors: [], colorNotes: []};
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
  for (const [k, v] of Object.entries(pal.tokens))
    for (const m of /** @type {const} */ (['light', 'dark'])) {
      const now = built?.[m]?.[k];
      if (
        now &&
        !exactBy[k]?.[m] &&
        now.trim().toLowerCase() !== String(v[m].color).trim().toLowerCase()
      )
        (ownBy[k] ??= {})[m] = now;
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
            exactBy[k] || ownBy[k]
              ? modes
                  .map(m =>
                    exactBy[k]?.[m] != null
                      ? `${m} ${exactBy[k][m]} (your exact setting wins over the generated ${shade(v[m])})`
                      : ownBy[k]?.[m] != null
                        ? `${m} ${ownBy[k][m]} (your change in ${slug}.theme.ts wins over the generated ${shade(v[m])})`
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
      ...pal.contrast
        .filter(c => modes.includes(c.mode))
        // A pairing the theme's own source changed no longer holds.
        .filter(
          c =>
            !ownBy[c.token]?.[/** @type {'light' | 'dark'} */ (c.mode)] &&
            !ownBy[c.against]?.[/** @type {'light' | 'dark'} */ (c.mode)],
        )
        .filter(c => c.note || !c.pass || c.stop !== c.preferred)
        .map(c =>
          c.note
            ? c.note
            : c.pass
              ? `${c.token} ${c.mode}: shade ${c.stop}, not ${c.preferred}, so it reads at ${c.ratio}:1 on ${c.against}`
              : `${c.token} ${c.mode}: only ${c.ratio}:1 on ${c.against} at shade ${c.stop} (needs ${c.needs}:1)`,
        ),
    ].filter(
      n =>
        !Object.keys(ownBy).some(k =>
          new RegExp(`${k.replace(/[-]/g, '\\-')}(?![\\w-])`).test(n),
        ),
    ),
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
    return await undoTheme(theme, options).catch(async e => {
      throw await swappedOrder(
        e,
        'undo',
        [theme, options.thing, options.value],
        options,
      );
    });
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
      // A list of themes (t,u) stays a look at each: one theme at a time.
      const shows = (e.suggestions ?? []).filter(x => showOf(x) != null);
      const near = (shows.length === 1 ? shows : []).find(x => {
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
        e.suggestions = [
          {
            name: followed.line,
            reason: `do this instead: ${name} is a theme here${followed.why ? `, but this still needs a fix: ${followed.why}` : ''}`,
          },
          ...(e.suggestions ?? []).filter(x => x !== near),
        ];
      }
    }
    throw e;
  }
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
          `${P} undo ${theme}`,
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
  try {
    current = loadTheme(cwd, theme);
  } catch (e) {
    if (!(e instanceof AstryxError && e.code === E.ERR_THEME_INVALID)) throw e;
    // What the refusal itself names (make the theme again, keeping the
    // damaged file), never `show`, which fails the same way.
    repair = (e.suggestions ?? [])
      .map(x => x.name)
      .filter(n => !/ show /.test(` ${n} `) && !/ undo /.test(` ${n} `));
    if (!repair.length) repair = [`${P} new ${theme}`];
  }
  const f = themeFiles(cwd, theme);
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
    undone.push(...modeWiringNotes(theme, current.mode, prev.mode));
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
  const p = await previewAndRoute(ctx, theme, prev, png, focus, 'undo');
  return {
    type: 'themeEdit.undo',
    data: {
      theme,
      action: 'step',
      undone,
      settings: prev.settings.length,
      stepsLeft: stepsLeft,
      // What the step back changed, as a change reports it.
      changedTokens: committed.changed,
      problems: committed.problems,
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
