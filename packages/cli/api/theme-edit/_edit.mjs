// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editing operations behind `astryx experimental theme editor`:
 * new, set, undo (a step back, or one setting removed) and show. Every change
 * is checked first against what the installed Core's parts really read; a
 * change that cannot take effect is refused and nothing is written.
 *
 * @position api/theme-edit — imported only by _adapter.mjs
 */

import * as fs from 'node:fs';
import {coversProperty} from './_css.mjs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {vetSuggestions} from './_vet.mjs';
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
  settingsShapeOk,
  slugFor,
  themeSource,
  themeSourceProblem,
  refuseThemeParse,
  ownSourceTokens,
  ownSourceTokenValues,
  ownPartTokens,
  PHONE_TYPE,
  refreshSourceStamp,
  sourceChangedReason,
  builtPairs,
  ownPairMessage,
  freeThemeName,
  refuseLinks,
  usableNewName,
  FOLDER_JUNK,
  dialValueFits,
  holdAfterBuild,
} from './_settings.mjs';
import {
  checkSetting,
  exampleOf,
  normalizeEntry,
  storedProblems,
} from './_check.mjs';
import {MODAL} from './_compiler.mjs';
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
} from './_palette.mjs';
import {
  renderPreview,
  renderSheet,
  takeFirstAppCopy,
  writeAppCopy,
} from './_preview.mjs';
import {appWiring, refreshPreviewRoute} from './_preview-app.mjs';
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
    /^(preview(-[a-z]+)?\.(html|png)|sheet(-[a-z-]+)?\.(html|png)|palette\.config\.json)$/.test(
      n,
    ) ||
    // The editor's temp names: `.<name>.astryx-<pid>-<rand>.tmp`, and the
    // build's `.<name>.tmp-<id>`.
    /^\..+\.(astryx-\d+-[a-z0-9]+\.tmp|tmp-[\w-]+)$/.test(n);
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
    return settingsShapeOk(
      JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')),
    );
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
  if (!slugOk(name)) {
    const fixed = slugFor(name);
    // Only a name typed in another case is the theme here already.
    const sameName = String(name ?? '').toLowerCase() === fixed;
    const exists = sameName && fs.existsSync(themeFiles(cwd, fixed).settings);
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `"${String(name ?? '').slice(0, 80)}" is not a theme name (${NAME_RULE})${exists ? `; ${fixed} is a theme here already` : ''}.${dropped}`,
      {
        run: exists
          ? [`${P} show ${fixed}`]
          : [again(usableNewName(cwd, fixed))],
      },
    );
  }
  // A built-in theme's name would collide with the theme of that name the
  // app may also use.
  if (LIKE.includes(name))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} is a built-in theme; an editor theme needs a name of its own. To start from ${name}, build on it.${dropped}`,
      {
        run: [
          again(
            fs.existsSync(themeFiles(cwd, `my-${name}`).dir)
              ? freeThemeName(cwd, `my-${name}`)
              : `my-${name}`,
            // Built on the theme named when it is installed, unless another
            // base (or none) was given.
            likeFixed ?? name,
          ),
        ],
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
      {run: [again(freeThemeName(cwd, name))]},
    );
  // Settings that are not valid JSON are kept aside, and the theme is
  // made again beside them.
  const damaged = fs.existsSync(f.settings) && !readableJson(f.settings);
  if (fs.existsSync(f.settings) && !damaged)
    refuse(E.ERR_FILE_EXISTS, `Theme "${name}" already exists.${dropped}`, {
      // What the command asked for, on the theme that exists or as a new one.
      run: [
        `${P} show ${name}`,
        ...(likeFixed && LIKE.includes(likeFixed)
          ? [`${P} set ${name} base ${likeFixed}`]
          : []),
        again(freeThemeName(cwd, name)),
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
    fs.readdirSync(f.dir).some(n => !FOLDER_JUNK.has(n));
  if (holdsOther)
    refuse(
      E.ERR_FILE_EXISTS,
      `themes/${name}/ already holds files this command did not make; choose another name.${dropped}`,
      {run: [again(freeThemeName(cwd, name))]},
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
  applyNewSettings(ctx, name, data, settings, png, likeFixed ?? undefined);
  if (left?.keep.some(p => path.basename(p) === `${name}.theme.ts`))
    refuseThemeSource(cwd, name);
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
  const p = await previewAndRoute(ctx, name, data, png);
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
        s = checkSetting(ctx, slug, data, thing, String(value), {}, false);
      } catch (e) {
        throw asNewRefusal(
          vetSuggestions(e, ctx, slug, data),
          slug,
          settings,
          likeFlag,
          png,
          {thing, index},
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
 * The preview after a change, with the in-app preview route kept in step:
 * its imports follow the theme, such as the stylesheet of a font package
 * installed since the last change.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {boolean} png
 */
async function previewAndRoute(ctx, slug, data, png) {
  const p = await previewAfter(ctx, slug, data, png);
  const wrote = takeFirstAppCopy(ctx.project.cwd, slug);
  return {
    ...p,
    previewStale: await keepPreviewRoute(ctx, slug),
    // The first time the theme's app copy is written, its files are named.
    ...(wrote ? {appCopy: {wrote}} : {}),
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
  } catch {
    // A damaged or moved preview.
    return [];
  }
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
  return change('set', theme, thing, value, options);
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
  const found = bad.length === 1 ? bad[0] : null;
  // A clean value is offered only when set takes it, so the line works.
  const takes = (/** @type {typeof found} */ b) => {
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
        !one.scope &&
        one.setting.source === 'token' &&
        ctx.C.isToken(one.setting.thing)
          ? [
              // The value the check suggests for this value, else a stock
              // one of the token's type.
              `${P} set ${slug} ${one.setting.thing} ${quoteCommandArgument(one.fix ?? exampleOf(ctx.C.typeOf(one.setting.thing), one.setting.thing))}`,
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
 * For `compile`: the refusal of [light, dark] pairs on tokens that are not
 * colors in what the theme builds now, or null.
 * @param {string} root
 * @param {string} slug
 * @returns {Promise<import('../error.mjs').AstryxError | null>}
 */
export async function editorPairRefusal(root, slug) {
  const ctx = await context(root);
  const names = await builtPairs(ctx, slug);
  if (!names.length) return null;
  return new AstryxError(
    ownPairMessage(slug, names),
    [
      {
        name: `grep -n -- ${quoteCommandArgument(names[0])} ${quoteCommandArgument(`themes/${slug}/${slug}.theme.ts`)}`,
        reason: 'see where the file sets it',
      },
    ],
    ERROR_CODES.ERR_THEME_INVALID,
  );
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
  // How it was typed, put right before anything reads it (a pasted
  // declaration, a dash, a var(), invisible spaces).
  if (typeof thing === 'string') {
    const entry = normalizeEntry(thing, value);
    thing = entry.thing;
    value = entry.value;
  }
  /** @type {{ctx?: import('./_settings.mjs').Ctx, data?: import('./_settings.mjs').ThemeData}} */
  const seen = {};
  try {
    return await changeOnce(sub, slug, thing, value, options, seen, typedThing);
  } catch (e) {
    // A theme name one letter off an existing theme: the same command with
    // that name comes first, before making a theme of the typo.
    if (e instanceof AstryxError && e.code === E.ERR_UNKNOWN_THEME) {
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
        e.suggestions = [
          {
            name: `${P} ${sub} ${near.name}${words.length ? ` ${words.join(' ')}` : ''}`,
            reason: `do this instead: ${near.name} is a theme here`,
          },
          ...(e.suggestions ?? []).filter(x => x !== near),
        ];
      }
      throw e;
    }
    // Every `set` the refusal suggests is checked as `set` checks it.
    throw vetSuggestions(e, seen.ctx, slug, seen.data);
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
  });
  const data = loadTheme(cwd, slug, target);
  /** @type {string[]} */
  const fieldNotes = [];
  if (sub === 'set' && (thing === 'base' || thing === 'mode')) {
    // The other field, when it is damaged too, goes back to its default,
    // so the theme loads again.
    if (
      thing !== 'mode' &&
      !['both', 'light-only', 'dark-only'].includes(data.mode)
    ) {
      data.mode = 'both';
      fieldNotes.push('mode was missing or damaged, so it is both again');
    }
    if (thing !== 'base' && data.like != null && !LIKE.includes(data.like)) {
      delete data.like;
      fieldNotes.push('base was not a built-in theme, so it is none again');
    }
  }
  const ctx = await context(cwd);
  // An undo of one setting only removes it, so it never waits on the
  // others being fixed.
  if (sub !== 'undo')
    refuseStoredTokens(ctx, slug, data, {
      thing,
      on: options.on,
      when: options.when,
      state: options.state,
      mode: options.mode,
    });
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
  let rawIdx = -1;
  if (exactIdx >= 0) {
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
  if (sub === 'set' && (s.thing === 'base' || s.thing === 'mode')) {
    const before = s.thing === 'base' ? (data.like ?? 'none') : data.mode;
    if (s.thing === 'base') {
      if (s.value === 'none') delete data.like;
      else data.like = s.value;
    } else
      data.mode = /** @type {'both' | 'light-only' | 'dark-only'} */ (s.value);
    const r = await commitTheme(ctx, slug, data, {history: true});
    const p = await previewAndRoute(ctx, slug, data, png);
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
    rawIdx >= 0 ? rawIdx : data.settings.findIndex(x => keyOf(x) === k);
  /** @type {string | null} */
  let vibrancyGone = null;
  const prev = prevIdx >= 0 ? data.settings[prevIdx] : null;
  if (sub === 'undo') {
    if (!prev) {
      const near = data.settings.filter(x => x.thing === s.thing).map(describe);
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
            ? [`settings for ${s.thing}: ${near.join('; ')}`]
            : [],
          run: [
            ...data.settings
              .filter(x => x.thing === s.thing)
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
  // A setting listed twice by hand keeps only the entry this command left.
  if (sub === 'set') {
    const last = data.settings.map(x => keyOf(x)).lastIndexOf(k);
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
          x => x !== s && x.mode && keyOf({...x, mode: undefined}) === k,
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
            )}${ownPartHits.length > 3 ? ` and ${ownPartHits.length - 3} more` : ''}, and your own source wins over the settings, so this does not show there; change it in ${slug}.theme.ts${ownHitDirect ? `, or take this back with \`${P} undo ${slug} ${undoArgs(s)}\`` : ''}`,
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
          ownPartHits.length
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
  // A change that changed nothing writes nothing, the preview included.
  const f0 = themeFiles(cwd, slug);
  const p =
    r.unchanged && !png && fs.existsSync(f0.preview)
      ? {
          preview: shown(cwd, f0.preview),
          pictures: [],
          pictureProblem: null,
          notChecked: null,
          previewStale: [],
        }
      : await previewAndRoute(ctx, slug, data, png);
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
  const brokenSource = themeSourceProblem(cwd, theme);
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
      : {files: [], problem: null};
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
        return data.settings.map(s => {
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
  const lost = ownSourceTokens(cwd, slug).filter(
    k => PHONE_TYPE.test(k) && !exact.has(k),
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
    if (own.has(x.thing))
      out.push(
        `${describe(x)}: ${slug}.theme.ts sets ${x.thing} on ${x.on}${state ? ` ${state}` : ''}${x.when ? ` when ${x.when}` : ''} itself${own.get(x.thing) != null ? ` (${own.get(x.thing)})` : ''}, so this setting does not show there`,
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
  const {cwd = process.cwd(), png = false, thing} = options;
  // base and mode are not settings in the list: undoing one goes back to
  // what the theme was made with (the oldest step the history keeps).
  if (thing === 'base' || thing === 'mode') {
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
  try {
    current = loadTheme(cwd, theme);
  } catch (e) {
    if (!(e instanceof AstryxError && e.code === E.ERR_THEME_INVALID)) throw e;
  }
  const f = themeFiles(cwd, theme);
  const {steps: history, dropped} = readHistory(f.history);
  if (!history.length && dropped)
    refuse(
      E.ERR_THEME_INVALID,
      `${theme}.history.json is damaged, so there is no step to go back to.`,
      {
        fix: `move ${shown(cwd, f.history)} out of the theme folder (it is kept as it is): the next change starts a new history, and your settings stay as they are`,
        run: [`${P} show ${theme}`],
      },
    );
  if (!history.length)
    refuse(
      E.ERR_THEME_NOTHING_TO_UNDO,
      `Nothing to undo: ${theme} has no earlier change.`,
      {run: [`${P} show ${theme}`]},
    );
  // A top step equal to the settings now (left by an undo stopped between
  // its two writes) changes nothing: skip it.
  const nowText = fs.readFileSync(f.settings, 'utf8');
  const same = (/** @type {string} */ a, /** @type {string} */ b) => {
    try {
      return (
        JSON.stringify({
          ...JSON.parse(a.replace(/^\uFEFF/, '')),
          lifted: 0,
          built: 0,
        }) ===
        JSON.stringify({
          ...JSON.parse(b.replace(/^\uFEFF/, '')),
          lifted: 0,
          built: 0,
        })
      );
    } catch {
      return false;
    }
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
    JSON.parse(prevText.replace(/^\uFEFF/, ''))
  );
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
  if (current && current.mode !== prev.mode)
    undone.push(`mode ${current.mode} is back to ${prev.mode}`);
  const p = await previewAndRoute(ctx, theme, prev, png);
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
