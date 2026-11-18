// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where an `astryx experimental theme` theme lives and how it is made:
 * the CLI-owned settings file (themes/<slug>/<slug>.settings.json), the
 * generated theme source (<slug>.theme.ts), the build through the same code
 * path as `astryx theme build`, the lift pass, resolved tokens, contrast
 * problems, and undo history.
 *
 * @position api/theme-edit — storage and compile for the theme commands
 */

import {APP_COPY_MARK, EDITOR_GENERATED_MARK} from './_marks.mjs';
import {irregularFileKind} from '../../foundation/fs/regular-file.mjs';
import {parse as parseModule} from '@babel/parser';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {
  coversProperty,
  cssNumber,
  cssProperties,
  longhandsOf,
} from './_css.mjs';
import postcss from 'postcss';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {themeFileImports} from '../../foundation/discovery/theme-discovery.mjs';
import {pathToFileURL} from 'node:url';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {AstryxError} from '../error.mjs';
import {logger} from '../logger.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {cssUnescape} from '../../foundation/text/css-escape.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {coreVarValues} from './_parts.mjs';
import {
  hexToOklch,
  oklabCoordinates,
  oklabCoordinatesToHex,
} from '../theme/palette/generate/color.mjs';
import {
  loadThemeExport,
  loadThemeInput,
  oneColorMode,
  themeBuildForReport,
} from '../theme/build/build.mjs';
import {
  expandFontVars,
  fontShorthandFamilyList,
  fontShorthandStyle,
  fontShorthandWeight,
  namedFontFamilies,
} from '../theme/build/font-warning.mjs';
import {
  customPropertyValues,
  declarationValues,
  elementCustomProperties,
  fontKey,
  fontRules,
} from '../../foundation/fonts/font-stylesheet.mjs';
import {
  AUTO_SPREAD,
  CORNERS,
  COMMON_STATES,
  DIALS,
  FAMILIES,
  FONTS,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  LIKE,
  OPEN_FONTS,
  isSystemFamily,
  P,
  SPACING,
  SURFACES,
  SURFACE_PARTS,
  FLOATING_PANELS,
  FLOATING_SURFACES,
  TEXT_SIZE,
  TYPE_STYLES,
  familyOf,
  WRAPPED_PARTS,
  CARD_LIKE,
  SHOWCASE_GROUPS,
} from './_tables.mjs';
import {TOP_BAR_COMPONENTS} from './_catalog.mjs';
import {
  baseWord,
  booleanWord,
  cleanDialValue,
  modeWord,
  normalizeEntry,
  typoLimit,
  typoNear,
  commaNumbers,
  stateSpelling,
} from './_normal.mjs';
import {
  alphaOf,
  colorProblem,
  compositeOver,
  hex,
  isColorValue,
  isSafeValue,
  parseColor,
  oklabDistance,
  ratio,
  splitTop,
} from './_color.mjs';
import {
  PALETTE_DIALS,
  assertNoPlaceholder,
  LIFT_PARTS,
  modesOf,
  paletteFiles,
  paletteImport,
  paletteMapping,
  syncPalette,
  syncPaletteRefs,
  refuseIfLockLost,
  lockHeld,
  writeWhole,
  setOwnTokenReader,
  readRecordIn,
  readRegularFile,
  readWrittenRecord,
  writeWrittenRecord,
} from './_palette.mjs';
import {removeEmptyFolder} from '../../foundation/fs/empty-folder.mjs';
import {EDITOR_STAMP, pngTexts} from './_png.mjs';
import {MODAL, isColorToken} from './_compiler.mjs';
import {
  baseInstalled,
  baseModule,
  baseResolved,
  baseThemeFile,
  installLine,
  packageInstalled,
} from './_project.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {compareText} from '../../foundation/text/compare-text.mjs';

// The palette reads the tokens the own source sets through this module.
setOwnTokenReader((cwd, slug) => ownSourceTokenValues(cwd, slug));

/**
 * One setting the CLI owns.
 * @typedef {object} Setting
 * @property {string} thing - A dial, a token (`--color-accent`), or a CSS property.
 * @property {string} value
 * @property {'dial' | 'token' | 'property'} source
 * @property {string} [on] - A part, a group, or a typography role (font).
 * @property {string} [when] - `<prop>:<value>`.
 * @property {string} [state]
 * @property {'light' | 'dark'} [mode]
 * @property {boolean} [only]
 * @property {string} [axis] - For the `headings` dial: `weight` or `tracking`.
 * @property {string} [note]
 */

/**
 * The settings file.
 * @typedef {object} ThemeData
 * @property {string} name
 * @property {string} [like] - The built-in theme it builds on.
 * @property {'both' | 'light-only' | 'dark-only'} mode
 * @property {Setting[]} settings
 * @property {string[]} [lifted] - Variant keys the last build repeated a part setting on.
 * @property {string} [palette] - The hash of the palette.config.json the editor last wrote.
 */

/** What lifted secondary text sits on: the contrast check measures it there. */
const LIFT_GROUND_TOKENS = new Set(LIFT_PARTS.map(([, , g]) => g));

/** @typedef {{project: import('./_project.mjs').ThemeProject, C: import('./_compiler.mjs').Compiler, unchecked?: string | null, uncheckedCode?: string | null, wrote?: Map<string, string | null>, base?: {light: Record<string, string>, dark: Record<string, string>, components?: Record<string, any>}, keepStops?: Record<string, Record<'light' | 'dark', {family: string, stop: number, alpha?: string}>> | null, keepRadii?: Record<string, string> | null, sizeNotes?: string[], compileNotes?: string[], derived?: Record<string, Array<{property: string, vars?: string[], replaces?: boolean, expand?: string}>>, takesPictures?: {sheet: string | null} | null}} Ctx */
/** @typedef {import('./_parts.mjs').PaintSide} PaintSide */
/** @typedef {import('./_parts.mjs').TextPair} TextPair */

import {NAME_RULE} from './_name-rule.mjs';

export {NAME_RULE};

/** A theme name: lowercase letters, digits and dashes, starting with a letter, 64 characters at most. @param {string} s */
export const slugOk = s =>
  typeof s === 'string' &&
  s.length <= 64 &&
  /^[a-z][a-z0-9-]*$/.test(s) &&
  !windowsReserved(s);

/**
 * A name Windows does not allow for a file or folder, so it cannot be
 * checked out there: a device name (con, nul, com1, com¹…), a character
 * Windows reserves (`<>:"|?*` and control characters), or a dot or space
 * at the end.
 * @param {string} s
 */
export const windowsReserved = s =>
  /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i.test(s) ||
  // eslint-disable-next-line no-control-regex
  /[<>:"|?*\u0000-\u001f]/.test(s) ||
  /[. ]$/.test(s);
/**
 * The theme name closest to what was typed: spaces and accents dropped,
 * lower case, anything else a dash.
 * @param {unknown} name
 */
export const slugFor = name =>
  String(name ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/-+$/, '')
    .slice(0, 64)
    // A device name Windows reserves gets a suffix.
    .replace(/^.+$/, w => (windowsReserved(w) ? `${w}-theme` : w)) ||
  'my-theme';
/** @param {string} s */
export const kebab = s =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
/**
 * The CSS property a name typed or saved in another form names: camel case,
 * other letters, or `_` or spaces for its dashes (backgroundColor,
 * Background-Color, font_size, "border radius"); null when it names none.
 * The one property-name reader, for `set` and the settings file alike.
 * @param {string} thing
 * @returns {string | null}
 */
export function propertySpelling(thing) {
  const spelled = kebab(String(thing).trim())
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
  return cssProperties().has(spelled) ? spelled : null;
}
/**
 * A theme name as an identifier: each dash goes, and the letter after it is
 * capitalized (`brand-2` → `brand2`, `x--y` → `xY`).
 * @param {string} s
 */
export const camel = s =>
  s.replace(/-+([a-z0-9])?/g, (_, c) => (c ? c.toUpperCase() : ''));

/**
 * The files of one theme, absolute.
 * @param {string} cwd
 * @param {string} slug
 */
export function themeFiles(cwd, slug) {
  const dir = path.join(cwd, 'themes', slug);
  return {
    root: path.join(cwd, 'themes'),
    dir,
    settings: path.join(dir, `${slug}.settings.json`),
    ts: path.join(dir, `${slug}.theme.ts`),
    settingsTs: path.join(dir, `${slug}.settings.ts`),
    js: path.join(dir, `${slug}.js`),
    css: path.join(dir, `${slug}.css`),
    history: path.join(dir, `${slug}.history.json`),
    preview: path.join(dir, 'preview.html'),
    sheet: path.join(dir, 'sheet.html'),
    previewPng: path.join(dir, 'preview.png'),
    pictures: path.join(dir, `${slug}.pictures.json`),
    sheetPng: path.join(dir, 'sheet.png'),
  };
}

/** Files a system or a tool puts in any folder; a folder of only these is empty. */
export const FOLDER_JUNK = new Set([
  '.DS_Store',
  '.gitkeep',
  'Thumbs.db',
  'desktop.ini',
]);

/**
 * Whether `dir` holds nothing of anyone's: absent, empty, or only system
 * files (what `git rm -r` or a branch switch leaves). A path that is not a
 * folder, or one that does not read, is not empty.
 * @param {string} dir
 * @returns {boolean}
 */
export function folderIsEmpty(dir) {
  if (!fs.existsSync(dir)) return true;
  try {
    // A folder holding only empty folders (an empty tokens/) holds nothing
    // either; a link is never followed.
    return (
      fs.lstatSync(dir).isDirectory() &&
      fs
        .readdirSync(dir)
        .every(
          n =>
            FOLDER_JUNK.has(n) ||
            (fs.lstatSync(path.join(dir, n)).isDirectory() &&
              folderIsEmpty(path.join(dir, n))),
        )
    );
  } catch {
    return false;
  }
}

/**
 * Whether a dial takes a value of its own kind beside its named words (a
 * size, a color, a family, a number: its list of values holds a `<…>`), so
 * a value of several words can be one value of it (`Open Sans`, `dark
 * blue`). A dial of named words only (mode, spacing) takes one word.
 * @param {string} dial
 */
export function dialTakesText(dial) {
  return /</.test(String(DIALS[dial]?.values ?? ''));
}

/**
 * Whether a value fits what a dial takes, read from the dial's own list of
 * values: a named rung in any case, or a value of the kind it names (a size,
 * a color, a number). `set` still checks the value in full.
 * @param {string} dial
 * @param {string} value
 */
export function dialValueFits(dial, value) {
  const spec = DIALS[/** @type {keyof typeof DIALS} */ (dial)]?.values;
  if (!spec) return false;
  const v = dialNumber(dial, String(value).trim());
  if (v === '') return false;
  return spec.split('|').some(option => {
    if (!option.startsWith('<') && !option.startsWith('"'))
      return option === v.toLowerCase();
    if (option.startsWith('"')) return true;
    if (option.includes('size')) return /^\d*\.?\d+(px|rem|em)$/.test(v);
    // A color by the editor's own color check (a bare word only when it
    // names a color).
    if (option === '<color>') return colorProblem(v) == null;
    if (option === '<0-100>') return /^\d{1,3}$/.test(v) && Number(v) <= 100;
    if (option === '<number>') return /^\d*\.?\d+$/.test(v);
    return false;
  });
}

/**
 * A dial's number as the dial takes it: for a dial whose number is in a
 * unit (text-size's pixels), the number typed with that unit, in any case
 * and with a space before it (`24px`, `24 PX`), is that number; any other
 * value is returned as it is. The one reader for typed and saved values.
 * @param {string} dial
 * @param {string} value
 * @returns {string}
 */
export function dialNumber(dial, value) {
  const unit = DIALS[/** @type {keyof typeof DIALS} */ (dial)]?.unit;
  if (!unit) return value;
  const m = new RegExp(`^\\s*([+]?\\d*\\.?\\d+)\\s*${unit}\\s*$`, 'i').exec(
    String(value),
  );
  return m ? m[1].replace(/^\+/, '') : value;
}

/** @param {string} file @returns {string | null} */
const contentHash = file => {
  try {
    return createHash('sha256').update(readRegularFile(file)).digest('hex');
  } catch {
    return null;
  }
};

/**
 * Record files the editor just wrote into a theme folder.
 * @param {string} cwd
 * @param {string} slug
 * @param {string[]} files
 */
export function recordWritten(cwd, slug, files) {
  const map = readWrittenRecord(cwd, slug);
  for (const file of files) {
    const hash = contentHash(file);
    if (hash) map[path.basename(file)] = hash;
  }
  writeWrittenRecord(cwd, slug, map);
}

/**
 * Whether the editor wrote this file in the theme folder and it is
 * unchanged since.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} file
 */
export function editorWrote(cwd, slug, file) {
  const map = readWrittenRecord(cwd, slug);
  const was = map[path.basename(file)];
  // A recorded picture is the editor's only while it is as it wrote it: a
  // picture changed after (re-saved by another tool, stamp and all) is the
  // person's.
  if (was) return was === contentHash(file);
  // With no record of it, the picture's stamp names the theme it shows.
  try {
    return pngTexts(readRegularFile(file))[EDITOR_STAMP] === slug;
  } catch {
    // Not there, unreadable, or not a regular file (a pipe): not the
    // editor's.
    return false;
  }
}

/**
 * Whether the pictures record names this file and it is unchanged since the
 * editor wrote it. Only such a file is ever deleted: a stamp alone is not
 * enough, since a byte copy of a picture (preview-before.png) carries the
 * same stamp and is the person's.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} file
 */
export function editorRecorded(cwd, slug, file) {
  const was = readWrittenRecord(cwd, slug)[path.basename(file)];
  return Boolean(was) && was === contentHash(file);
}

/**
 * Drop names from the record of what the editor wrote.
 * @param {string} cwd
 * @param {string} slug
 * @param {string[]} names
 */
function forgetWritten(cwd, slug, names) {
  if (!names.length) return;
  const map = readWrittenRecord(cwd, slug);
  for (const n of names) delete map[n];
  writeWrittenRecord(cwd, slug, map);
}

/**
 * A name `new` takes, for a suggestion: `name` itself when it is valid, not a
 * built-in theme and its folder is free; `my-<name>` for a built-in theme's
 * name; else the first free numbered name.
 * @param {string} cwd
 * @param {string} name
 */
export function usableNewName(cwd, name) {
  const base = LIKE.includes(name) ? `my-${name}` : name;
  return slugOk(base) && !fs.existsSync(themeFiles(cwd, base).dir)
    ? base
    : freeThemeName(cwd, base);
}

/**
 * A theme name near `name` that is valid and whose folder is free: `name-2`,
 * `name-3`, …, shortened to fit the name's length limit.
 * @param {string} cwd
 * @param {string} name
 */
export function freeThemeName(cwd, name) {
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${name.slice(0, 64 - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (slugOk(candidate) && !fs.existsSync(themeFiles(cwd, candidate).dir))
      return candidate;
  }
  return '<another name>';
}

/**
 * Why the editor cannot read one of its files, or null when it can (or the
 * file is not there): a folder in the file's place, or no permission to read
 * it. Bad content is a different problem, judged where the file is parsed.
 * @param {string} file
 * @returns {string | null}
 */
export function unreadableReason(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    return code === 'ENOENT' || code === 'ENOTDIR'
      ? null
      : `it cannot be read (${code ?? 'unknown error'})`;
  }
  if (st.isDirectory()) return 'it is a folder, not a file';
  try {
    fs.accessSync(file, fs.constants.R_OK);
  } catch (e) {
    return `it cannot be read (${/** @type {any} */ (e)?.code ?? 'no permission'}: permission denied)`;
  }
  return null;
}

/** The build outputs of a theme, by their ending after `<theme>`. */
export const APP_COPY_BUILT = [
  '.css',
  '.css.d.ts',
  '.js',
  '.d.ts',
  '.variants.d.ts',
];

/**
 * The names of a theme's app copy files.
 * @param {string} slug
 * @returns {Set<string>}
 */
export function appCopyNames(slug) {
  const name = `${camel(slug)}Theme`;
  return new Set([
    `${name}.doc.mjs`,
    `${name}.ts`,
    `${slug}.fonts.css`,
    ...APP_COPY_BUILT.map(ext => `${slug}${ext}`),
  ]);
}

/**
 * Refuse, by name, when a file of the theme is a folder or cannot be read:
 * every command reads them, and none should crash on one. The fix is to
 * look at the file and give it back its place; a file is never deleted.
 * @param {string} cwd
 * @param {string} slug
 */
export function refuseUnreadableFiles(cwd, slug) {
  const f = themeFiles(cwd, slug);
  // The files the editor reads (the settings, the source, the history) are
  // named here; the files the build writes (with their types) by the
  // build's own check, the same one show uses.
  refuseUnreadable(cwd, [
    ...builtFiles(cwd, slug, {name: slug, mode: 'both', settings: []}),
    path.join(f.dir, `${slug}.variants.d.ts`),
  ]);
  // A named pipe or a device at one of the app copy's names: every build
  // reads the copy's file before it writes it, and a read of one waits for
  // good.
  for (const n of appCopyNames(slug)) {
    const file = path.join(cwd, 'src', 'themes', slug, n);
    const kind = irregularFileKind(file);
    if (kind && kind !== 'a folder') refuseIrregular(cwd, file, kind);
  }
  for (const file of [f.settings, f.ts, f.history]) {
    const kind = irregularFileKind(file);
    if (kind && kind !== 'a folder') refuseIrregular(cwd, file, kind);
    const why = unreadableReason(file);
    if (why)
      throw new AstryxError(
        `${path.relative(cwd, file)} ${why}, so the theme cannot be read. Put the file back in its place (or give it read permission); nothing was changed.`,
        [
          {
            name: `ls -la ${quoteCommandArgument(path.relative(cwd, file))}`,
            reason: 'see what is there',
          },
        ],
        ERROR_CODES.ERR_THEME_INVALID,
      );
  }
}

/**
 * Refuse when the app's themes/ is a file or a link to something other
 * than a folder: every editor theme lives in themes/<name>/. The run lists
 * what is there; the message says to rename or move it.
 * @param {string} cwd
 */
export function refuseThemesNotFolder(cwd) {
  const root = path.join(cwd, 'themes');
  const st = fs.lstatSync(root, {throwIfNoEntry: false});
  if (!st) return;
  const isDir =
    st.isDirectory() ||
    (st.isSymbolicLink() &&
      fs.statSync(root, {throwIfNoEntry: false})?.isDirectory());
  if (isDir) return;
  refuse(
    ERROR_CODES.ERR_FILE_EXISTS,
    `themes in this app is ${st.isSymbolicLink() ? 'a link that does not lead to a folder' : 'a file, not a folder'}, so no editor theme can be read or made: every theme goes in themes/<name>/. Rename or move it, then run the command again.`,
    {run: ['ls -la themes']},
  );
}

/**
 * Whether a word names a setting: a dial, a token or a CSS property, in
 * any letters. Such a word is never a theme's name to make or look at.
 * @param {string} word
 */
export function namesSetting(word) {
  const w = String(word).trim().toLowerCase();
  return (
    Object.hasOwn(DIALS, w) || w.startsWith('--') || cssProperties().has(w)
  );
}

/**
 * Whether a word names a CSS property, which `set` writes only on a part
 * (`--on`): a theme a `new` makes takes no value for it, so its line comes
 * after the theme is made, with a part named.
 * @param {string} word
 */
export function needsPart(word) {
  const w = String(word).trim().toLowerCase();
  return (
    !Object.hasOwn(DIALS, w) && !w.startsWith('--') && cssProperties().has(w)
  );
}

/**
 * Whether text typed where a theme goes names settings, in any form set
 * reads them: a setting's name (`corners`, `--color-accent`), with its value
 * (`corners pill`, `corners:pill`, `corners=pill`, `accent: red`), a list of
 * them (`corners, accent`), or a pasted JSON object (`{"corners":"pill"}`).
 * Such text is never a theme to make or a list of themes.
 * @param {unknown} text
 */
export function namesSettingAsTyped(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (namesSetting(t)) return true;
  if (/^\{/.test(t))
    try {
      const keys = Object.keys(JSON.parse(t));
      return keys.length > 0 && keys.every(k => namesSetting(k));
    } catch {
      return false;
    }
  const items = t.split(/\s*[,;|]\s*/).filter(Boolean);
  return (
    items.length > 0 &&
    items.every(item => namesSetting(item.split(/[\s:=]+/)[0]))
  );
}

/**
 * The dial settings text holds, in any form set reads them: a JSON object
 * (`{"accent":"red"}`), `key=value` or `key: value` pairs apart at `;`
 * (`corners: pill; accent: red`), or `dial value` items apart at `,`
 * (`accent red, corners pill`); null when it holds none, or anything else.
 * @param {unknown} text
 * @returns {Array<[string, string]> | null}
 */
export function dialSettingsInText(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const dial = (/** @type {string} */ k) => {
    const w = k.trim().toLowerCase();
    return Object.hasOwn(DIALS, w) ? w : null;
  };
  if (/^\{/.test(t))
    try {
      const entries = Object.entries(JSON.parse(t));
      return entries.length && entries.every(([k]) => dial(k))
        ? entries.map(([k, v]) => [/** @type {string} */ (dial(k)), String(v)])
        : null;
    } catch {
      return null;
    }
  const pairs = t
    .split(/\s*;\s*/)
    .filter(Boolean)
    .map(x => /^([a-z-]+)\s*[=:]\s*(.+)$/i.exec(x));
  if (pairs.length && pairs.every(m => m && dial(m[1])))
    return pairs.map(m => [
      /** @type {string} */ (dial(/** @type {RegExpExecArray} */ (m)[1])),
      /** @type {RegExpExecArray} */ (m)[2].trim(),
    ]);
  const items = t
    .split(/\s*[,;]\s*/)
    .map(x => x.trim().split(/\s+/))
    .filter(x => x[0]);
  return items.length && items.every(x => x.length > 1 && dial(x[0]))
    ? items.map(x => [/** @type {string} */ (dial(x[0])), x.slice(1).join(' ')])
    : null;
}

/**
 * The themes the editor made in the app (a settings file of its own), by
 * name, or with `changed` the one an editor command changed last first: the
 * undo history is written only by an editor command, so its time is the
 * last change made there.
 * @param {string} cwd
 * @param {'name' | 'changed'} [order]
 * @returns {string[]}
 */
export function editedThemes(cwd, order = 'name') {
  const root = path.join(cwd, 'themes');
  if (!fs.existsSync(root)) return [];
  refuseThemesNotFolder(cwd);
  const names = fs
    .readdirSync(root)
    .filter(d => fs.existsSync(themeFiles(cwd, d).settings))
    .sort();
  if (order === 'name') return names;
  const when = (/** @type {string} */ d) => {
    const f = themeFiles(cwd, d);
    const t =
      [f.history, f.settingsTs, f.settings].find(x => fs.existsSync(x)) ??
      f.settings;
    return fs.statSync(t).mtimeMs;
  };
  return names
    .map(d => ({d, t: when(d)}))
    .sort((a, b) => b.t - a.t || compareText(a.d, b.d))
    .map(x => x.d);
}

/** A path as the person sees it: relative to cwd. @param {string} cwd @param {string} f */
export const shown = (cwd, f) =>
  path.relative(cwd, f).split(path.sep).join('/');

/**
 * Up to `n` names close to `x`.
 * @param {string} x
 * @param {Iterable<string>} list
 * @param {number} [n]
 */
export function nearest(x, list, n = 3) {
  // A phrase that negates a word (not round, no caps, unbold,
  // rounded-none) never has that word as its nearest: it asks the opposite.
  // A typo of a listed keyword that itself starts with no- or not-
  // (`not-alowed` for not-allowed, `no-repat` for no-repeat) is no
  // negation: it is read as a typo.
  if (
    negates(x) &&
    ![...list].some(c => /^(no|not)-/.test(c) && typoNear(x, c))
  )
    return [];
  // A long input (a pasted stylesheet or blob) holds many names inside
  // it: it is near nothing.
  if (x.length > 64) return [];
  // Only within the editor's one typo limit (typoLimit: none under four
  // letters, so only the name itself in other letters is near those),
  // nearest by edit distance first (brand-drak is brand-dark, not brand). A
  // name that only holds the typed word inside it is no typo of it.
  const limit = typoLimit(x);
  const typed = x.toLowerCase();
  return [...list]
    .filter(c => c.length > 2)
    .map(
      c =>
        /** @type {[string, number]} */ ([
          c,
          levenshteinDistance(typed, c.toLowerCase(), limit, {swaps: true}),
        ]),
    )
    .filter(([, d]) => d <= limit)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([c]) => c);
}

/**
 * The readings of a typo among `list`: every name at the smallest edit
 * distance, within the one typo limit (nearest's rule). One name is the
 * reading; two or more equally near (`tightr`: tight and tighter) are each
 * a reading, and none of them is chosen over the others.
 * @param {string} x
 * @param {Iterable<string>} list
 * @returns {string[]}
 */
export function closestOf(x, list) {
  const near = nearest(x, list, Infinity);
  if (!near.length) return [];
  const typed = x.toLowerCase();
  const limit = typoLimit(x);
  const d = (/** @type {string} */ c) =>
    levenshteinDistance(typed, c.toLowerCase(), limit, {swaps: true});
  const best = d(near[0]);
  return near.filter(c => d(c) === best);
}

/**
 * Whether typed words negate what they name (`not round`, `no caps`,
 * `anything but blue`, `unbold`, `non-bold`, `rounded-none`).
 * @param {string} x
 */
export function negates(x) {
  return /(^|[\s-])(not|no|non|without|never|less)([\s-]|$)|anything but|^un(round|bold|rais|outlin|cap)|-none$/i.test(
    String(x).trim(),
  );
}

/**
 * A refusal: nothing was changed, and the suggestions lead with the command
 * that does what the person wanted.
 * @param {string} code
 * @param {string} message
 * @param {{run?: Array<string | {name: string, reason: string}>, didYouMean?: string[], fix?: string, also?: string[]}} [extra]
 * @returns {never}
 */
export function refuse(code, message, extra = {}) {
  /** @type {Array<{name: string, reason: string}>} */
  const suggestions = [];
  for (const r of extra.run ?? []) {
    // A line with what it is for already (an install step and the line
    // that works once it is installed: onBuiltInSteps) is kept as it is.
    if (typeof r !== 'string') {
      suggestions.push(r);
      continue;
    }
    const [cmd, comment] = r.split(/\s{2,}#\s*/);
    suggestions.push({
      name: cmd.trim(),
      reason: comment
        ? `do this instead: ${comment.trim()}`
        : 'do this instead',
    });
  }
  for (const d of extra.didYouMean ?? [])
    suggestions.push({name: d, reason: 'did you mean'});
  const tail = [
    extra.fix ? `Fix: ${extra.fix}.` : '',
    ...(extra.also ?? []).map(a => `${a.replace(/\.$/, '')}.`),
    'Nothing was changed.',
  ]
    .filter(Boolean)
    .join(' ');
  throw new AstryxError(`${message} ${tail}`, suggestions, code);
}

/**
 * A theme name without a pasted label: `theme: t`, `name=t`, `--theme t`
 * and `slug: "t"` name t; quotes and backticks around it go. Case is kept.
 * A space is no label separator without dashes: "Theme Park" stays.
 * The one reader of such labels, for --theme and every editor command.
 * @param {unknown} s
 * @returns {string}
 */
export function unlabeledThemeName(s) {
  return (
    String(s ?? '')
      .trim()
      // A space ends a label only after dashes (`--theme t`): "Theme Park"
      // is one name.
      .replace(
        /^(?:-+(?:theme|name|slug)(?:\s*[:=]\s*|\s+)|(?:theme|name|slug)\s*[:=]\s*)(?=\S)/i,
        '',
      )
      .replace(/^['"`]+|['"`]+$/g, '')
      .trim()
  );
}

/**
 * A theme name as typed, read the way the editor reads it: a path to its
 * folder or a file in it (t.theme.ts, Brand.settings.json), in any case,
 * or a pasted label (`theme: t`, `name: t`), names the theme. The result may still need slugFor.
 * @param {unknown} s
 * @returns {string}
 */
export function typedThemeName(s) {
  return (
    unlabeledThemeName(s)
      .toLowerCase()
      // ./t and .\t name the theme t.
      .replace(/^(\.[\\/])+/, '')
      .replace(/^.*themes[\\/]/, '')
      .replace(/[\\/].*$/, '')
      .replace(
        /\.(theme\.ts|settings\.(json|ts)|history\.json|css\.d\.ts|d\.ts|css|js|ts)$/,
        '',
      )
  );
}

/**
 * The theme names a name typed the way the app shows it may mean, most
 * likely first: a path with doubled slashes or `../` (`themes//t`), a file
 * name with or without its folder (`brand.theme.ts`, `tTheme.ts`), the app
 * copy's export (`tTheme`), camelCase (`brandDark`) and spaces
 * (`Brand Dark`) each read as dashes. The caller picks the first that
 * exists, else the first.
 * @param {string} s
 * @returns {string[]}
 */
export function themeNameReadings(s) {
  const base = unlabeledThemeName(String(s ?? ''))
    .replace(/[\\/]+/g, '/')
    .replace(/^(\.\.?\/)+/, '')
    .replace(/^.*themes\//i, '')
    // A path names the theme its last part does (`@scope/brand`,
    // `./x/brand`, `brand/brand.theme.ts`).
    .replace(/\/+$/, '')
    .replace(/^.*\//, '')
    .replace(
      /\.(theme\.ts|settings\.(json|ts)|history\.json|css\.d\.ts|d\.ts|doc\.mjs|fonts\.css|css|mjs|js|tsx?)$/i,
      '',
    )
    .trim();
  const noTheme = base.replace(/([a-z0-9])Theme$/, '$1');
  const read = [base, noTheme === base ? '' : noTheme]
    .flatMap(x => [kebab(x), x.toLowerCase()])
    .filter(x => /[a-z]/i.test(x))
    .map(x => slugFor(x));
  // A module name in any letters (brandtheme, brand-theme) last: only
  // when the theme it names exists does it win.
  const moduleNames = read
    .map(n => n.replace(/-?theme$/, ''))
    .filter(n => n && slugOk(n));
  return [...new Set([...read, ...moduleNames])];
}

/**
 * A vibrancy written as set reads typed input: a share of one (0.5) or a
 * percent (50%) is that much of the 0-100 scale, as a whole number. Any
 * other dial's value, or a vibrancy that is no such number, comes back as
 * it was.
 * @param {string} dial
 * @param {string} v
 * @returns {string}
 */
export function vibrancyMeant(dial, v) {
  if (dial !== 'vibrancy') return v;
  // A comma between digits as the one comma rule reads it (0,5).
  const m = /^(\d*\.?\d+)\s*(%?)$/.exec(commaNumbers(v.trim()));
  if (!m) return v;
  const n = Number(m[1]);
  const scaled = !m[2] && n > 0 && n < 1 ? n * 100 : n;
  return scaled <= 100 ? String(Math.round(scaled)) : v;
}

/**
 * The mode and base a damaged theme file meant, read the way typed input
 * is: other letters, stray spaces, `_` or a space for a dash (`Dark-Only`,
 * ` Neutral`), and a base written as its package name
 * (`@astryxdesign/theme-neutral`). Each is the cleaned text even when it is
 * no value the editor takes; the caller checks it.
 * @param {any} data
 * @returns {{mode: string, like: string}}
 */
export function fieldsMeant(data) {
  return {mode: modeMeant(data), like: likeMeant(data)};
}

/**
 * Whether a saved base is the word for no base (`none`, `None`, ` NONE`),
 * read by the one base reader as a typed `set t base None` is.
 * @param {any} data
 */
function savedNoBase(data) {
  return typeof data?.like === 'string' && likeMeant(data) === 'none';
}

/** @param {string} t @param {string[]} list */
function nearOne(t, list) {
  const hits = list.filter(x => typoNear(t, x));
  return hits.length === 1 ? hits[0] : null;
}

/** The mode a damaged theme file meant (see fieldsMeant). @param {any} data */
function modeMeant(data) {
  const MODES = ['both', 'light-only', 'dark-only'];
  const typed = String(data?.mode ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  // A word for one mode (light, night, darkmode) is that one mode, by the
  // one mode reader; a typo of a mode is that mode.
  const one = modeWord(typed);
  const word = one ? `${one}-only` : undefined;
  return MODES.includes(typed)
    ? typed
    : (word ?? (typed ? nearOne(typed, MODES) : null) ?? typed);
}

/** The base a damaged theme file meant (see fieldsMeant). @param {any} data */
function likeMeant(data) {
  const likeTyped = baseWord(data?.like);
  return LIKE.includes(likeTyped) || likeTyped === 'none'
    ? likeTyped
    : ((likeTyped ? nearOne(likeTyped, LIKE) : null) ?? likeTyped);
}

/**
 * The settings of a theme, or a refusal naming the command that makes it.
 * @param {string} cwd
 * @param {string} slug
 * @param {string | Partial<Setting>} [skip] the thing (or the one setting)
 *   a command changes or removes: its value is not checked, so a value made
 *   under looser rules can be fixed
 * @returns {ThemeData}
 */
export function loadTheme(
  cwd,
  slug,
  skip = /** @type {string | Partial<Setting>} */ (''),
) {
  refuseThemesNotFolder(cwd);
  if (!slugOk(slug)) {
    // A path or a capital letter typed for a theme that exists names it.
    // A file name typed for the theme (t.theme.ts, Brand.settings.json)
    // names the theme.
    // The name a pasted label gives ("theme: park" is park) when its theme
    // exists; else the whole name as typed ("Theme Park" is theme-park).
    const whole = slugFor(
      String(slug ?? '')
        .trim()
        .toLowerCase(),
    );
    const plain = typedThemeName(slug);
    const named = slugFor(plain);
    // brandDark is brand-dark.
    const camelWords = slugFor(
      unlabeledThemeName(String(slug ?? '')).replace(
        /([a-z0-9])([A-Z])/g,
        '$1-$2',
      ),
    );
    const exists = (/** @type {string} */ n) =>
      Boolean(n) && fs.existsSync(themeFiles(cwd, n).settings);
    // The module or export name (brandTheme, the app copy's brandTheme.ts)
    // names the theme brand: one reader for every way a name is typed.
    const readings = themeNameReadings(slug);
    const fixed =
      [named, whole, camelWords, ...readings].find(exists) ??
      readings[0] ??
      named;
    const same = fs.existsSync(themeFiles(cwd, fixed).settings) ? fixed : null;
    // A list where one theme goes (t,u or "t;u"): one theme at a time,
    // each that exists named; never a new theme made of the list. A name
    // with spaces ("My Theme") is one name: its theme, found above, wins.
    const have = fs.existsSync(themeFiles(cwd, 'x').root)
      ? fs
          .readdirSync(themeFiles(cwd, 'x').root)
          .filter(d => slugOk(d) && fs.existsSync(themeFiles(cwd, d).settings))
          .sort()
      : [];
    // A theme here with a setting pasted onto it (`t=accent`, `t: accent`):
    // that theme, never a new one named after both.
    const head = String(slug ?? '').split(/\s*[=:]\s*|\s+/)[0];
    if (
      !same &&
      head !== String(slug ?? '').trim() &&
      slugOk(head) &&
      fs.existsSync(themeFiles(cwd, head).settings)
    )
      refuse(
        ERROR_CODES.ERR_INVALID_ARGUMENT,
        `"${String(slug ?? '').slice(0, 80)}" is not a theme name (${NAME_RULE}); ${head} is a theme here.`,
        {didYouMean: [head], run: [`${P} show ${head}`]},
      );
    // Settings typed where the theme goes (`corners, accent`,
    // `corners:pill`, `{"corners":"pill"}`): never a theme to make or a
    // list of themes; each theme here is offered to look at.
    if (!same && namesSettingAsTyped(slug))
      refuse(
        ERROR_CODES.ERR_INVALID_ARGUMENT,
        `"${String(slug ?? '').slice(0, 80)}" names a setting, not a theme; the theme comes first.`,
        {run: have.slice(0, 3).map(h => `${P} show ${h}`)},
      );
    const words = String(slug ?? '')
      .split(/\s*[,;|]\s*/)
      .map(w => slugFor(w.trim()))
      .filter(Boolean);
    if (!same && words.length > 1) {
      const existing = words.filter(
        w => slugOk(w) && fs.existsSync(themeFiles(cwd, w).settings),
      );
      // A list none of whose words is a theme here (a value, `Inter,
      // Arial`) names no theme at all: a look at each theme here, never a
      // new one named after a word of it.
      refuse(
        ERROR_CODES.ERR_INVALID_ARGUMENT,
        existing.length
          ? `"${String(slug ?? '').slice(0, 80)}" names more than one theme; a command takes one theme at a time.`
          : `"${String(slug ?? '').slice(0, 80)}" names no theme here; the theme comes first.`,
        {
          run: existing.length
            ? existing.map(w => `${P} show ${w}`)
            : have.length
              ? have.slice(0, 3).map(h => `${P} show ${h}`)
              : [`${P} new ${words[0]}`],
        },
      );
    }
    // An empty name (an unset variable, a lone dash): no theme to guess
    // from it, so the themes here are named instead of a new one.
    if (!same && !/[a-z0-9]/i.test(String(slug ?? ''))) {
      refuse(
        ERROR_CODES.ERR_INVALID_ARGUMENT,
        `The theme name is empty${String(slug ?? '').trim() ? ` ("${String(slug).slice(0, 20)}" has no letter or digit)` : ''}.${have.length ? ` Themes here: ${have.slice(0, 6).join(', ')}.` : ''}`,
        {
          run: have.length
            ? have.slice(0, 3).map(t => `${P} show ${t}`)
            : [`${P} new my-theme`],
        },
      );
    }
    refuse(
      ERROR_CODES.ERR_INVALID_ARGUMENT,
      `"${String(slug ?? '').slice(0, 80)}" is not a theme name (${NAME_RULE}).`,
      same
        ? {didYouMean: [same], run: [`${P} show ${same}`]}
        : // A setting's name (--color-accent), alone or with its value
          // (`corners pill`), typed where the theme goes is never a theme
          // to make, as for a name that is one (below): each theme here is
          // offered to look at.
          namesSettingAsTyped(slug)
          ? {run: have.slice(0, 3).map(h => `${P} show ${h}`)}
          : {run: [`${P} new ${fixed}`]},
    );
  }
  const f = themeFiles(cwd, slug);
  if (!fs.existsSync(f.settings)) {
    const have = fs.existsSync(f.root)
      ? fs
          .readdirSync(f.root)
          .filter(d => fs.existsSync(themeFiles(cwd, d).settings))
      : [];
    // A typed path or case of a theme that exists names that theme.
    const plain = String(slug)
      .toLowerCase()
      .replace(/^.*themes[\\/]/, '')
      .replace(/[\\/].*$/, '');
    const same = have.includes(plain) ? plain : null;
    // A theme written by hand, ejected or built in: not one the editor
    // made, and `new` with its name would be refused.
    const other = [
      [f.dir, `themes/${slug}`],
      [path.join(cwd, 'src', 'themes', slug), `src/themes/${slug}`],
    ].find(([d]) => fs.existsSync(d));
    // A `new` that was stopped part way left its marker, or the settings
    // were removed beside the editor's generated module: `new` makes the
    // theme again and keeps every file it did not write.
    // A marker beside a history is from a `new` that finished (it writes
    // none): the settings were lost after.
    const stopped =
      fs.existsSync(path.join(f.dir, NEW_MARKER)) && !fs.existsSync(f.history);
    if (!same && editorMadeFolder(cwd, slug)) {
      const remake = remakeLines(cwd, slug);
      refuse(
        ERROR_CODES.ERR_UNKNOWN_THEME,
        `${
          stopped
            ? `themes/${slug} was left by a \`new\` that was stopped part way, so it has no settings yet. Run new again to finish it; files you added there are kept`
            : `themes/${slug} has lost its settings (${slug}.settings.json is gone), but the editor made it. Run new to make it again: your own files there are kept${fs.existsSync(f.history) ? `, and \`undo ${slug}\` then steps back to the settings from before the last change (the last change itself is not kept)` : ''}`
        }; ${remake.base ? `it is made again on ${remake.base}, the base it was built on` : 'it starts on no base (the base it was built on cannot be read)'}.`,
        {run: remake.lines},
      );
    }
    // A folder copied or renamed by hand from an editor theme: its files
    // still carry the old name (t.settings.json in themes/t2).
    const copied =
      !same && fs.existsSync(f.dir)
        ? fs
            .readdirSync(f.dir)
            .map(n => /^(.+)\.settings\.json$/.exec(n)?.[1])
            .find(n => n && n !== slug)
        : undefined;
    if (copied) {
      const files = fs
        .readdirSync(f.dir)
        .filter(n => n.startsWith(`${copied}.`))
        .sort();
      const original = fs.existsSync(themeFiles(cwd, copied).settings);
      refuse(
        ERROR_CODES.ERR_UNKNOWN_THEME,
        `themes/${slug} holds the editor files of a theme named ${copied} (${files.slice(0, 4).join(', ')}${files.length > 4 ? ', …' : ''}): it looks like a copy or rename of ${copied}. The editor reads a theme's files by its folder's name, so to edit it as ${slug}, rename each ${copied}.* file there to ${slug}.* (${files
          .slice(0, 2)
          .map(n => `${n} to ${slug}${n.slice(copied.length)}`)
          .join(', ')}${files.length > 2 ? ', and so on' : ''})${
          // The theme source names the theme inside it too: every step.
          files.includes(`${copied}.theme.ts`)
            ? `, then in ${slug}.theme.ts change './${copied}.settings' to './${slug}.settings', ${camel(copied)}Settings to ${camel(slug)}Settings (in the import and in extends), name: '${copied}' to name: '${slug}', and ${camel(copied)}Theme to ${camel(slug)}Theme`
            : ''
        }${original ? `; ${copied} itself is still in themes/${copied}` : ''}.`,
        {
          run: original
            ? [`${P} show ${copied}`, `ls -la themes/${slug}`]
            : [`ls -la themes/${slug}`],
        },
      );
    }
    // An empty theme folder (or one of system files only) holds no theme
    // yet: `new` makes one there.
    if (
      !same &&
      other &&
      other[0] === f.dir &&
      !LIKE.includes(slug) &&
      fs.lstatSync(f.dir).isDirectory() &&
      folderIsEmpty(f.dir)
    )
      refuse(
        ERROR_CODES.ERR_UNKNOWN_THEME,
        `themes/${slug} is an empty folder: there is no theme ${slug} yet. new makes it there.`,
        {run: [`${P} new ${slug}`]},
      );
    // The editor's own app copy left behind when themes/<slug>/ is gone
    // (a git clean, a wrong rm, a branch switch): `new` makes the theme
    // again and writes the copy over.
    const copyName = `${camel(slug)}Theme`;
    if (
      !same &&
      other &&
      other[1] === `src/themes/${slug}` &&
      !fs.existsSync(f.dir) &&
      [`${copyName}.ts`, `${copyName}.doc.mjs`, `${slug}.fonts.css`].some(n => {
        try {
          return fs
            .readFileSync(path.join(other[0], n), 'utf8')
            .includes(APP_COPY_MARK);
        } catch {
          return false;
        }
      })
    )
      refuse(
        ERROR_CODES.ERR_UNKNOWN_THEME,
        `themes/${slug}/, the theme's source folder, is missing; src/themes/${slug}/ is the editor's app copy of it, left behind. \`new ${slug}\` makes the theme again and writes the copy over (its settings are lost: restore themes/${slug}/ from version control to keep them).`,
        {run: [`${P} new ${slug}`]},
      );
    if (!same && (other || LIKE.includes(slug)))
      refuse(
        ERROR_CODES.ERR_UNKNOWN_THEME,
        `${other ? `${other[1]} is a theme the editor did not make (written by hand, or ejected)` : `${slug} is a built-in theme`}, so the editor does not change it. Make an editor theme with its own name instead${LIKE.includes(slug) ? `, on top of ${slug}` : ''}.`,
        {
          run: [
            // The user's own theme on that base, when there is one, then a
            // free valid name for a new one.
            ...(fs.existsSync(themeFiles(cwd, `my-${slug}`).settings)
              ? [`${P} show my-${slug}`]
              : []),
            ...(LIKE.includes(slug)
              ? [
                  ...onBuiltIn(
                    cwd,
                    slug,
                    `${P} new ${usableNewName(cwd, `my-${slug}`)} --like ${slug}`,
                  ),
                  ...(baseInstalled(cwd, slug)
                    ? []
                    : [`${P} new ${usableNewName(cwd, `my-${slug}`)}`]),
                ]
              : [`${P} new ${usableNewName(cwd, `my-${slug}`)}`]),
          ],
        },
      );
    refuse(
      ERROR_CODES.ERR_UNKNOWN_THEME,
      `There is no theme "${slug}" made by this command (no themes/${slug}/${slug}.settings.json).`,
      (() => {
        // A doubled or trailing dash (brand--dark, t--): the name as new
        // cleans it, the theme of that name when there is one, never a new
        // theme new refuses.
        const cleaned = String(slug)
          .replace(/-{2,}/g, '-')
          .replace(/^-+|-+$/g, '');
        const cleanedHere =
          cleaned !== slug &&
          slugOk(cleaned) &&
          fs.existsSync(themeFiles(cwd, cleaned).settings)
            ? cleaned
            : null;
        const near = same
          ? [same]
          : cleanedHere
            ? [cleanedHere]
            : nearest(slug, have);
        const newName = usableNewName(cwd, cleaned || slug);
        // A setting's name (accent, corners, background-color) is never a
        // theme to make: each theme here is offered to look at instead.
        if (!same && namesSetting(slug))
          return {
            didYouMean: [],
            run: have.slice(0, 3).map(h => `${P} show ${h}`),
          };
        // A theme near the name comes first; a new theme of the name as
        // typed only after.
        return {
          didYouMean: near,
          run: same
            ? [`${P} show ${same}`]
            : near.length
              ? [`${P} show ${near[0]}`, `${P} new ${newName}`]
              : [`${P} new ${newName}`],
        };
      })(),
    );
  }
  refuseLinks(cwd, slug);
  // A file of the theme that is a folder or cannot be read is named, never
  // called damaged.
  refuseUnreadableFiles(cwd, slug);
  // undo is offered only when there is a step to go back to.
  const steps = readHistory(f.history).steps.length;
  // Made again, the theme keeps the base it was built on when that can be
  // read; else the text says it starts on no base.
  const remake = remakeLines(cwd, slug);
  const remakeText = `make the theme again with ${remake.lines.at(-1)}, which keeps the damaged file beside it and every file of yours${remake.base ? `, on ${remake.base}, the base it was built on` : ', on no base (the base it was built on cannot be read)'}`;
  const remakeRun = remake.lines.map(name => ({
    name,
    reason: 'do this instead',
  }));
  /** @type {any} */
  const data = settingsJson(fs.readFileSync(f.settings, 'utf8'));
  // Its field names in other letters are read before its shape is judged.
  const fieldNotes = topFieldNames(data);
  // A step back when there is one; else `new` only for damage `new` itself
  // keeps aside and makes again (settingsRemade): never a `new` it refuses.
  const recover = steps
    ? {
        text: `, or step back to the settings before the last change with ${P} undo ${slug} (the last change is then lost)`,
        run: [{name: `${P} undo ${slug}`, reason: 'do this instead'}],
      }
    : settingsRemade(data)
      ? {text: `; or ${remakeText}`, run: remakeRun}
      : {text: '', run: []};
  if (data === undefined)
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json is not valid JSON. Fix it by hand${recover.text}.`,
      recover.run,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  // Valid JSON of the wrong shape ([], {}, settings: null) is damage like
  // invalid JSON: `new` makes the theme again, keeping the file aside.
  if (!settingsShapeOk(data))
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json is damaged: ${settingsProblem(data) ?? 'it is not a settings object'}. Fix it by hand${steps ? `, step back to the settings before the last change with ${P} undo ${slug},` : ''} or ${remakeText}. Nothing was changed.`,
      [...recover.run.filter(r => !/ new /.test(r.name)), ...remakeRun],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  readEntryWords(data, fieldNotes);
  // `like: "none"`, the word for no base, is no base, in any letters or
  // spacing (the one base reader).
  if (savedNoBase(data)) delete data.like;
  // The folder names the theme: a name missing or changed by hand in the
  // file is the folder's, and the next save writes it back.
  data.name = slug;
  const problem = settingsProblem(data, skip);
  // An entry whose mode or source means nothing: `undo` with its name
  // removes that entry only; a step back loses the last change.
  const damaged = problem ? damagedEntry(data, problem) : null;
  if (damaged)
    throw withDamaged(
      damaged,
      new AstryxError(
        `themes/${slug}/${slug}.settings.json: ${problem}. Remove that setting with ${P} undo ${slug} ${undoArgs(damagedUndo(damaged))}; nothing else needs to change${steps ? `, or step back to the settings before the last change with ${P} undo ${slug} (the last change is then lost)` : ''}. Nothing was changed.`,
        [
          {
            name: `${P} undo ${slug} ${undoArgs(damagedUndo(damaged))}`,
            reason: 'do this instead: removes only that setting',
          },
          // A dial saved for one mode: the dial as set takes it, for both
          // modes, once that entry is removed.
          ...(damaged.source === 'dial' &&
          (damaged.mode === 'light' || damaged.mode === 'dark') &&
          (typeof damaged.value === 'string' ||
            typeof damaged.value === 'number')
            ? [
                {
                  name: `${P} set ${slug} ${setArgs({...damaged, mode: undefined}, String(damaged.value))}`,
                  reason:
                    'then this, once the undo above has removed that setting: a dial is the same in light and dark',
                },
              ]
            : []),
          ...(steps
            ? [
                {
                  name: `${P} undo ${slug}`,
                  reason:
                    'or step back to the settings before the last change (the last change is then lost)',
                },
              ]
            : []),
        ],
        ERROR_CODES.ERR_THEME_INVALID,
      ),
    );
  // A value made under looser rules is not damage: the command that
  // changes or removes that setting still works, with the other bad ones
  // left out of the build, so each listed fix runs on its own.
  // A setting listed twice is named as such, with keep and remove lines,
  // even when one of its values is bad: removing the bad one by its name
  // would remove both.
  const listedTwice = Boolean(problem?.includes(' is listed twice ('));
  const all = problem && !listedTwice ? badSettings(data) : [];
  if (
    problem &&
    skip &&
    all.some(s => skips(s, skip)) &&
    !settingsProblem({
      ...data,
      settings: data.settings.filter(
        (/** @type {any} */ s) => !all.includes(s),
      ),
    })
  )
    return data;
  if (
    problem &&
    all.length &&
    !settingsProblem({
      ...data,
      settings: data.settings.filter(
        (/** @type {any} */ s) => !all.includes(s),
      ),
    }) &&
    all.length > 1
  )
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json holds ${all.length} settings the editor no longer accepts: ${all
        .slice(0, 6)
        .map(s => entryProblem(s, data))
        .join(
          '; ',
        )}${all.length > 6 ? `; and ${all.length - 6} more` : ''}. Remove or change each; nothing else needs to change. Nothing was changed.`,
      all.slice(0, 6).map(s => ({
        name: `${P} undo ${slug} ${undoArgs(s)}`,
        reason: 'do this instead',
      })),
      ERROR_CODES.ERR_THEME_INVALID,
    );
  // A damaged mode or base is fixed first: the message names it, so the
  // suggestions set it (another bad value is named on the next run).
  // (Not an entry named mode or base inside the settings list.)
  const fieldBroken =
    (/^(it has no mode|mode ")/.test(problem ?? '') &&
      !['both', 'light-only', 'dark-only'].includes(data?.mode)) ||
    (/^base "/.test(problem ?? '') &&
      data?.like != null &&
      !LIKE.includes(data.like));
  const bad = problem && !fieldBroken && !listedTwice ? badSetting(data) : null;
  if (problem && bad && settingsProblem(data, bad.thing) !== problem) {
    // The value it holds, cleaned as typed input is (stray or invisible
    // spaces, other letters, a pasted `corners: pill`), when the dial takes
    // that; else a value it takes, for a dial; a color for a color token.
    const cleaned =
      DIALS[bad.thing] && typeof bad.value === 'string'
        ? vibrancyMeant(bad.thing, cleanDialValue(bad.thing, bad.value))
        : null;
    // Vibrancy saturates the colors the color dials make: with none, set
    // refuses it as having no effect, so it is not offered.
    const vibrancyActs =
      bad.thing !== 'vibrancy' ||
      (Array.isArray(data.settings) ? data.settings : []).some(
        (/** @type {any} */ x) =>
          x && x.source === 'dial' && PALETTE_DIALS.includes(x.thing),
      );
    const meant =
      cleaned &&
      cleaned !== bad.value &&
      vibrancyActs &&
      !valueProblem({...bad, value: cleaned})
        ? cleaned
        : null;
    // Only the value it holds, cleaned: never a stock value it did not hold.
    // A vibrancy with no color to saturate is one set refuses: undo only.
    const example =
      bad.thing === 'vibrancy' &&
      !data.settings.some(
        (/** @type {any} */ x) =>
          x !== bad && x.source === 'dial' && PALETTE_DIALS.includes(x.thing),
      )
        ? null
        : meant;
    // The entry rides on the refusal: a change reads its value as set reads
    // a typed one, and offers that repair beside the undo (see _edit).
    throw Object.assign(
      new AstryxError(
        `themes/${slug}/${slug}.settings.json: ${problem}${valueProblem(bad) ? ', a value the editor no longer accepts' : ''}. Remove or change that setting; nothing else needs to change. Nothing was changed.`,
        [
          {
            name: `${P} undo ${slug} ${undoArgs(bad)}`,
            reason: 'do this instead',
          },
          // Only a set that replaces this very entry: `mode` and `base` set
          // the theme's own fields, not an entry in the list.
          ...(example && !['mode', 'base'].includes(bad.thing)
            ? [
                {
                  name: `${P} set ${slug} ${setArgs(bad, example)}`,
                  reason: meant
                    ? 'or set the value it holds, cleaned'
                    : 'or give it a value it takes',
                },
              ]
            : []),
        ],
        ERROR_CODES.ERR_THEME_INVALID,
      ),
      {damaged: bad, aboutSaved: true},
    );
  }
  // A bad mode or base is fixed by setting it, with the one repair every
  // command gives that damage.
  const damagedField = /^(it has no mode|mode ")/.test(problem ?? '')
    ? 'mode'
    : /^base "/.test(problem ?? '')
      ? 'base'
      : null;
  const fieldFix = damagedField
    ? savedFieldRepairs(data, cwd, slug, damagedField)
    : null;
  // A damaged mode or base and a bad value in the list: setting the field
  // is refused while the list holds the bad value, but fixing that entry
  // saves the field as meant too, so its fix comes first. Never a bare
  // undo, which would throw away the last real change.
  const alsoBad = fieldFix ? badSetting(data) : null;
  if (problem && fieldFix && alsoBad) {
    const cleaned =
      DIALS[alsoBad.thing] && typeof alsoBad.value === 'string'
        ? vibrancyMeant(
            alsoBad.thing,
            cleanDialValue(alsoBad.thing, alsoBad.value),
          )
        : null;
    const meant =
      cleaned &&
      cleaned !== alsoBad.value &&
      !['mode', 'base'].includes(alsoBad.thing) &&
      !valueProblem({...alsoBad, value: cleaned})
        ? cleaned
        : null;
    const field = damagedField;
    const fieldValue = fieldFix.values.length === 1 ? fieldFix.values[0] : null;
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json: ${problem}, and ${settingsProblem(data, alsoBad.thing) ?? `${alsoBad.thing} "${alsoBad.value}" is not a value it takes`}. Fix that setting first: ${meant ? 'either command below does' : 'the command below does'}${fieldValue ? `, and saves the ${field} as ${fieldValue}` : `; then set the ${field} again`}. Nothing was changed.`,
      [
        ...(meant
          ? [
              {
                name: `${P} set ${slug} ${setArgs(alsoBad, meant)}`,
                reason: 'do this instead: set the value it holds, cleaned',
              },
            ]
          : []),
        {
          name: `${P} undo ${slug} ${undoArgs(alsoBad)}`,
          reason: meant ? 'or remove that setting' : 'do this instead',
        },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  // A setting listed twice: setting it to one of its values, or undoing
  // it, keeps one entry or none.
  const twice = problem?.includes(' is listed twice (')
    ? duplicated(data)
    : null;
  if (problem)
    throw new AstryxError(
      fieldFix && (fieldFix.uninstalled || fieldFix.readsAs)
        ? savedFieldText(
            slug,
            data,
            /** @type {'mode' | 'base'} */ (damagedField),
            fieldFix,
          )
        : `themes/${slug}/${slug}.settings.json: ${problem}. ${fieldFix ? 'Set it again' : twice ? `Set it to one of its values or undo it, or fix it by hand${recover.text}` : `Fix it by hand${recover.text}`}. Nothing was changed.`,
      fieldFix
        ? fieldFix.run
        : twice
          ? [
              ...twice.values
                .filter(
                  v =>
                    typeof v === 'string' &&
                    !valueProblem({...twice.setting, value: v}),
                )
                .slice(0, 2)
                .map(v => ({
                  name: `${P} set ${slug} ${setArgs(twice.setting, String(v))}`,
                  reason: `keep ${v}`,
                })),
              {
                name: `${P} undo ${slug} ${undoArgs(twice.setting)}`,
                reason: 'remove both',
              },
              ...recover.run,
            ]
          : recover.run,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  return data;
}

/**
 * A command that builds on a built-in theme, as it runs here: after the
 * line that installs that theme's package when the project does not have
 * it, so the first line offered always works.
 * @param {string} cwd
 * @param {string} base a built-in theme
 * @param {string} line the command on that base
 * @returns {string[]}
 */
export function onBuiltIn(cwd, base, line) {
  return baseInstalled(cwd, base)
    ? [line]
    : [installLine(cwd, [`@astryxdesign/theme-${base}`]), line];
}

/**
 * {@link onBuiltIn} with what each line is for: the install first, then
 * the line, which works once it is installed (never offered as working
 * now).
 * @param {string} cwd
 * @param {string} base
 * @param {string} line
 * @returns {Array<{name: string, reason: string}>}
 */
export function onBuiltInSteps(cwd, base, line) {
  return onBuiltIn(cwd, base, line).map(name =>
    name === line
      ? {
          name,
          reason: baseInstalled(cwd, base)
            ? 'do this instead'
            : `then this, once @astryxdesign/theme-${base} is installed`,
        }
      : {name, reason: 'install it'},
  );
}

/**
 * The first setting listed more than once, with every value it is listed
 * with, in order.
 * @param {any} data
 * @returns {{setting: any, values: unknown[]} | null}
 */
function duplicated(data) {
  /** @type {Map<string, any[]>} */
  const byKey = new Map();
  for (const s of data.settings ?? []) {
    if (!s || typeof s.thing !== 'string') continue;
    const key = keyOf(s);
    byKey.set(key, [...(byKey.get(key) ?? []), s]);
  }
  for (const list of byKey.values())
    if (list.length > 1)
      return {setting: list[0], values: [...new Set(list.map(x => x.value))]};
  return null;
}

/**
 * What is wrong with settings data, or null: its shape, and each value with
 * the same rules `set` checks it by (without the installed Core), so a value
 * edited by hand never reaches the build.
 * @param {any} data
 * @param {string | Partial<Setting>} [skip] a thing or setting whose value is not checked (the one a
 *   command is about to change or remove)
 * @returns {string | null}
 */
export function settingsProblem(
  data,
  skip = /** @type {string | Partial<Setting>} */ (''),
) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return 'the file is not a settings object';
  // A command that changes or removes a setting (or sets mode or base)
  // puts a damaged mode or base back to its default itself, with a note, so
  // two damaged fields never send each fix to the other.
  const fixing = typeof skip === 'string' ? skip : skip?.thing;
  const field = Boolean(fixing);
  if (!field && !['both', 'light-only', 'dark-only'].includes(data.mode))
    return data.mode == null
      ? 'it has no mode'
      : `mode "${data.mode}" is not both, light-only or dark-only`;
  if (!field && data.like != null && !LIKE.includes(data.like))
    return `base "${data.like}" is not a built-in theme (${LIKE.join(', ')})`;
  if (!Array.isArray(data.settings)) return 'settings is not a list';
  // `lifted` is written by the build: a list of text, or absent.
  if (
    data.lifted != null &&
    (!Array.isArray(data.lifted) ||
      data.lifted.some((/** @type {unknown} */ x) => typeof x !== 'string'))
  )
    return `lifted is ${JSON.stringify(data.lifted)}, not a list of text (the build writes it; remove the field and the next build writes it again)`;
  /** @type {Map<string, any>} */
  const keys = new Map();
  /** How many entries each key has. @type {Map<string, number>} */
  const twins = new Map();
  for (const s of data.settings)
    if (s && typeof s.thing === 'string')
      twins.set(keyOf(s), (twins.get(keyOf(s)) ?? 0) + 1);
  for (const s of data.settings) {
    // A value or scope that is not text is a bad setting `undo` removes;
    // a setting with no name is damage.
    // An entry with no thing is damage no line can name; one with a thing
    // and no value is a bad value, which `undo` with its thing removes.
    if (!s || typeof s.thing !== 'string')
      return 'a setting has no thing or value';
    if (removes(skip) && skips(s, skip) && entryDamage(s)) continue;
    if (!['dial', 'token', 'property'].includes(s.source))
      return s.source == null || s.source === ''
        ? `${s.thing} has no source (dial, token or property)${unreadFieldsText(s)}`
        : `${s.thing} has source ${JSON.stringify(s.source)}, not dial, token or property`;
    if (s.mode != null && s.mode !== 'light' && s.mode !== 'dark')
      return `${s.thing} has mode ${JSON.stringify(s.mode)}, not light or dark`;
    // A dial is the same in light and dark (set refuses --mode on every
    // one): a saved mode on it would be listed but applied as set never
    // applies it.
    if (s.mode != null && s.source === 'dial')
      return `${s.thing} has mode ${s.mode}, but a dial is the same in light and dark, so set takes no --mode for it`;
    if (s.only != null && s.only !== true)
      return `${s.thing} has only ${JSON.stringify(s.only)}, not true or false`;
    if (s.only === true && !onlyFits(s))
      return `${describe({...s, only: undefined, value: '?'}).replace(' = ?', '')} has only, which is for one member of a group styled alike (${AUTO_SPREAD.join(', ')})`;
    const key = keyOf(s);
    // The command that changes or removes a setting listed twice keeps one
    // value, or none, so it fixes the list. An entry with a twin is named
    // as listed twice, even when one value is bad: an undo of that setting
    // would remove both.
    if (keys.has(key) && !skips(s, skip))
      return `${describe({...s, value: '?'}).replace(' = ?', '')} is listed twice (${JSON.stringify(keys.get(key).value)}, ${JSON.stringify(s.value)})`;
    keys.set(key, s);
    if (!skips(s, skip) && (twins.get(key) ?? 0) < 2) {
      const problem = entryProblem(s, data);
      if (problem) return problem;
    }
  }
  return null;
}

/**
 * The built-in base the editor last built a theme on, read from the
 * generated module's header (`// Built on @astryxdesign/theme-neutral …`),
 * else from the newest undo step, or null when neither can be read. What a damaged base in
 * the settings file is put back to, and what a theme made again keeps.
 * @param {string} cwd
 * @param {string} slug
 * @returns {string | null}
 */
export function builtOnBase(cwd, slug) {
  const f = themeFiles(cwd, slug);
  /** @type {string | null | undefined} */
  let header;
  try {
    header = /\/\/ Built on @astryxdesign\/theme-([a-z0-9-]+) /.exec(
      fs.readFileSync(f.settingsTs, 'utf8'),
    )?.[1];
  } catch {
    header = null;
  }
  // With the module gone too, the newest undo step names the base.
  const steps = readHistory(f.history).steps;
  const stepped = steps.length
    ? settingsJson(steps[steps.length - 1])?.like
    : null;
  return (
    [header, stepped].find(b => typeof b === 'string' && LIKE.includes(b)) ??
    null
  );
}

/**
 * The `new` that makes a theme again in place, on the base it was built on
 * as far as can still be read: the settings file's base (in any case), else
 * the base the generated module was built on. With none, it says the theme
 * starts on no base.
 * @param {string} cwd
 * @param {string} slug
 * @returns {{lines: string[], base: string | null}}
 */
export function remakeLines(cwd, slug) {
  const f = themeFiles(cwd, slug);
  const read = (/** @type {string} */ file) => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  };
  const saved = settingsJson(read(f.settings));
  // The base the file names, read as every reader reads it.
  const typed =
    saved && typeof saved.like === 'string' ? fieldsMeant(saved).like : null;
  const base =
    [typed, builtOnBase(cwd, slug)].find(b => b && LIKE.includes(b)) ?? null;
  return {
    base,
    lines: base
      ? onBuiltIn(cwd, base, `${P} new ${slug} --like ${base}`)
      : [`${P} new ${slug}`],
  };
}

/**
 * A dial's own word typed in any case (ROOMY, MORE, Both, NONE): the word,
 * or null when the value is no word of that dial. The one case rule for
 * every dial, typed or saved. On the font dial several words are a family
 * list, whose names keep their letters; one word is the preset.
 * @param {string} thing
 * @param {string} value
 * @returns {string | null}
 */
export function dialWordOf(thing, value) {
  if (!DIALS[thing]) return null;
  const words = new Set(
    String(DIALS[thing].values ?? '')
      .split('|')
      .filter(w => /^[a-z][a-z-]*$/.test(w)),
  );
  const lower = value.trim().toLowerCase();
  const read = thing === 'font' ? [lower] : lower.split(/\s+/);
  return lower && read.every(w => words.has(w)) ? lower : null;
}

/** The fields of a saved or typed entry, as the editor writes them. */
const ENTRY_FIELDS = [
  'thing',
  'value',
  'setting',
  'source',
  'axis',
  'on',
  'when',
  'state',
  'mode',
  'only',
];

/**
 * The entry field a key names: the key in other letters (`Thing`, `VALUE`,
 * `On`) or spelled as its flag (`--on`), or null.
 * @param {string} k
 */
function entryFieldOf(k) {
  const name = k
    .trim()
    .toLowerCase()
    .replace(/^[-\u2013\u2014]+/, '');
  return ENTRY_FIELDS.find(f => f === name) ?? null;
}

/**
 * Whether a saved entry is a twin, in other letters only, of a setting the
 * theme holds (`Accent` beside `accent`) with a value that setting takes:
 * that setting listed twice, which a change of it fixes, rather than
 * damage its own undo removes (a twin in another form, `var(--x)`, or with
 * a value the setting does not take).
 * @param {any} s
 * @param {string} read the setting's name as the editor writes it
 * @param {any} data
 */
function twinInLetters(s, read, data) {
  return (
    s.thing.toLowerCase() === read.toLowerCase() &&
    entryProblem({...s, thing: read}, data) == null
  );
}

/**
 * The fields of a saved entry the editor does not read, said after what is
 * wrong with it (`; it has "part", a field the editor does not read: a
 * part is "on"`), or nothing.
 * @param {any} s
 */
function unreadFieldsText(s) {
  const unread = Object.keys(s).filter(
    k => !ENTRY_FIELDS.includes(k) && !['parts', 'masked', 'note'].includes(k),
  );
  if (!unread.length) return '';
  return `; it has ${unread.map(k => JSON.stringify(k)).join(', ')}, ${unread.length === 1 ? 'a field' : 'fields'} the editor does not read (the part a setting styles is "on")`;
}

/**
 * The keys of an entry grouped by the field each writes, in the order
 * written; `setting` (the thing as the editor prints it) is the thing.
 * @param {any} entry
 * @returns {Map<string, string[]>}
 */
function entryFieldGroups(entry) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const key of Object.keys(entry)) {
    const field = entryFieldOf(key);
    if (!field) continue;
    const as = field === 'setting' ? 'thing' : field;
    groups.set(as, [...(groups.get(as) ?? []), key]);
  }
  return groups;
}

/**
 * The keys of an entry that write a field it writes another way too
 * (`Value` beside `value`, `On` beside `--on`, `setting` beside `thing`),
 * each with that field and the key that is read: the editor's own
 * spelling, else the first written.
 * @param {any} entry
 * @returns {Array<{key: string, field: string, read: string}>}
 */
export function entryFieldTwins(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
  return [...entryFieldGroups(entry)].flatMap(([field, keys]) => {
    if (keys.length < 2) return [];
    const read = keys.includes(field) ? field : keys[0];
    return keys.filter(k => k !== read).map(key => ({key, field, read}));
  });
}

/**
 * An entry with its own fields in other letters (`Thing`, `VALUE`, `On`)
 * or spelled as their flags (`--on`) read as those fields, as setting
 * names are read in any case; a field written several ways is read once,
 * from the key entryFieldTwins names, and the others are dropped.
 * Anything else as it is. The one reader for a typed entry and a saved one.
 * @param {any} entry
 * @returns {any}
 */
export function entryFieldNames(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const dropped = new Set(entryFieldTwins(entry).map(t => t.key));
  return Object.fromEntries(
    Object.entries(entry).flatMap(([k, x]) => {
      if (dropped.has(k)) return [];
      const field = entryFieldOf(k);
      return [[field ?? k, x]];
    }),
  );
}

/**
 * An entry that names its thing under `setting`, as the editor's own
 * results print it (`{"setting": "accent", "value": "red"}`), as the entry
 * it is; anything else as it is. The one reader for a typed entry and a
 * saved one.
 * @param {any} entry
 * @returns {any}
 */
export function printedEntry(entry) {
  if (
    !entry ||
    typeof entry !== 'object' ||
    Array.isArray(entry) ||
    'thing' in entry ||
    typeof entry.setting !== 'string' ||
    !('value' in entry)
  )
    return entry;
  const {setting, ...others} = entry;
  return {thing: setting, ...others};
}

/**
 * Read each entry saved in a form set reads when typed (`{"corners":
 * "pill"}`, `"corners pill"`, `"corners: pill"`) as that setting, its thing
 * and value read as set reads them, with a note; the next change saves it
 * the editor's way. In place.
 * @param {any} data
 * @param {string[]} notes
 */
function readTypedEntries(data, notes) {
  if (!Array.isArray(data?.settings)) return;
  data.settings = data.settings.map((/** @type {any} */ saved) => {
    // Its fields in other letters (`Thing`, `Value`) are those fields, and
    // an entry that names its thing under `setting`, as the editor's own
    // results print it, is that entry (the readers set uses for one typed).
    const fields = entryFieldNames(saved);
    // A field written both ways is read the editor's way, and said; the
    // next save writes the entry once.
    const twins = entryFieldTwins(saved);
    const named =
      typeof fields?.thing === 'string'
        ? fields.thing
        : typeof fields?.setting === 'string'
          ? fields.setting
          : JSON.stringify(saved);
    for (const {key, read} of twins)
      notes.push(
        `${named} writes both "${read}" and "${key}"; "${read}" is read (${JSON.stringify(saved[read])}, not ${JSON.stringify(saved[key])})`,
      );
    const renamed = Object.keys(
      saved && typeof saved === 'object' ? saved : {},
    ).some(k => {
      const field = entryFieldOf(k);
      return (
        field != null &&
        field !== k &&
        !twins.some(t => t.key === k) &&
        !(field in saved)
      );
    });
    if (renamed)
      notes.push(
        `${JSON.stringify(saved)} writes its field names in other letters, read as ${JSON.stringify(fields)}`,
      );
    // A field the editor does not read (`modes`, `part`) is not used, and
    // said, with the field it is a typo of; the editor's own result fields
    // (show's `parts`) are no part of a setting.
    if (typeof fields?.thing === 'string')
      for (const k of Object.keys(fields)) {
        if (ENTRY_FIELDS.includes(k) || ['parts', 'masked', 'note'].includes(k))
          continue;
        const near = ENTRY_FIELDS.filter(f => typoNear(k.toLowerCase(), f));
        notes.push(
          `${named} has "${k}", a field the editor does not read${near.length === 1 ? ` (it reads "${near[0]}")` : ''}, so it is not used`,
        );
      }
    const s = printedEntry(fields);
    if (s !== fields)
      notes.push(
        `${JSON.stringify(fields)} names its thing under "setting", read as ${s.thing}`,
      );
    const keys =
      s && typeof s === 'object' && !Array.isArray(s) ? Object.keys(s) : [];
    const pair =
      typeof s === 'string' && s.trim()
        ? (/^\s*(\S+?)\s*[:=]?\s+(.+?)\s*$/.exec(s) ??
          /^\s*(\S+?)\s*[:=]\s*(.+?)\s*$/.exec(s))
        : keys.length === 1 &&
            // A lone field of an entry (`{"value": "pill"}`) names no
            // setting.
            !ENTRY_FIELDS.includes(keys[0]) &&
            (typeof s[keys[0]] === 'string' || typeof s[keys[0]] === 'number')
          ? [null, keys[0], String(s[keys[0]])]
          : null;
    if (!pair) return s;
    const read = normalizeEntry(String(pair[1]), String(pair[2]));
    if (!read.thing || read.value == null || read.value === '') return s;
    notes.push(
      `${JSON.stringify(s)} was saved as a typed setting, read as ${read.thing} = ${read.value}`,
    );
    const thing = String(read.thing);
    // Its source as the reader takes a missing one (a dial name is a dial,
    // a `--` name a token).
    const source = DIALS[thing]
      ? 'dial'
      : thing.startsWith('--')
        ? 'token'
        : undefined;
    return {thing, value: String(read.value), ...(source ? {source} : {})};
  });
}

/**
 * Read each entry's mode and source as the editor writes them: a mode in
 * other letters or words (`Dark`, `night`, `day`) as light or dark, a
 * source in other letters (`Dial`) as written, and a missing source from
 * the thing (a dial name is a dial, a `--` name a token, anything with a
 * part a property). Each change is kept as a note for the next command,
 * which saves the entry that way. A value that means nothing is left for
 * the check to name.
 * @param {any} data
 */
function readEntryWords(data, early = /** @type {string[]} */ ([])) {
  /** @type {string[]} */
  const notes = [...early, ...topFieldNames(data)];
  // `lifted` is written by the build: one that is no list of text is
  // dropped, and the next build writes it again.
  if (
    data &&
    data.lifted != null &&
    (!Array.isArray(data.lifted) ||
      data.lifted.some((/** @type {unknown} */ x) => typeof x !== 'string'))
  ) {
    notes.push(
      `lifted was ${JSON.stringify(data.lifted)}, not a list of text; the build writes it again`,
    );
    delete data.lifted;
  }
  readTypedEntries(data, notes);
  for (const s of Array.isArray(data?.settings) ? data.settings : []) {
    if (!s || typeof s !== 'object' || typeof s.thing !== 'string') continue;
    // A setting and its value saved the other way round (`"thing": "red",
    // "value": "accent"`): the thing names no setting and the value does,
    // as set reads `set t red accent` (the one thing reader).
    {
      /** The kind of setting a name is, or null. @param {string} x */
      const kindOf = x =>
        DIALS[x]
          ? 'dial'
          : x.startsWith('--')
            ? 'token'
            : s.on && cssProperties().has(x)
              ? 'property'
              : null;
      const asSaved = String(
        normalizeEntry(s.thing, String(s.value ?? '')).thing ?? '',
      );
      const swapped =
        typeof s.value === 'string'
          ? normalizeEntry(s.value, s.thing)
          : {thing: null, value: null};
      const kind = swapped.thing ? kindOf(String(swapped.thing)) : null;
      if (
        !kindOf(asSaved) &&
        kind &&
        swapped.value != null &&
        String(swapped.value) !== '' &&
        [undefined, null, '', kind].includes(s.source)
      ) {
        notes.push(
          `${s.thing} = ${s.value} was saved the other way round, read as ${swapped.thing} = ${swapped.value}`,
        );
        s.thing = String(swapped.thing);
        s.value = String(swapped.value);
      }
    }
    // A dial name saved in a typed form (`text size`, `Text Size`) is that
    // dial, as set reads the name typed (the one thing reader).
    if (
      !DIALS[s.thing] &&
      ['dial', undefined, null, ''].includes(s.source) &&
      !s.on
    ) {
      const entry = normalizeEntry(s.thing, String(s.value ?? ''));
      // The name alone: an entry whose value is saved inside its thing
      // (`corners: pill`) is left to the saved-entry repair.
      const read =
        String(entry.value ?? '') === String(s.value ?? '')
          ? String(entry.thing ?? '')
          : '';
      // When the theme holds that dial already, the entry is damage its
      // own undo removes, never a second copy of the dial; but a twin in
      // other letters with a value the dial takes is that dial listed
      // twice (twinInLetters), which a change of it fixes.
      const held = data.settings.some(
        (/** @type {any} */ x) => x !== s && x?.thing === read && !x.on,
      );
      if (
        read !== s.thing &&
        DIALS[read] &&
        (!held || twinInLetters(s, read, data))
      ) {
        notes.push(`${s.thing} was saved as "${s.thing}", read as ${read}`);
        s.thing = read;
      }
    }
    // A CSS property saved in another form on a part (`Background-Color`,
    // `background color`) is that property, as set reads the name typed
    // (the one property-name reader), unless the part holds it already
    // (then a twin in other letters is that property listed twice).
    if (
      s.on &&
      !s.thing.startsWith('--') &&
      !cssProperties().has(s.thing) &&
      ['property', undefined, null, ''].includes(s.source)
    ) {
      const read = propertySpelling(s.thing);
      const held = data.settings.some(
        (/** @type {any} */ x) =>
          x !== s && x && keyOf(x) === keyOf({...s, thing: read}),
      );
      if (read && (!held || twinInLetters(s, read, data))) {
        notes.push(`${s.thing} was saved as "${s.thing}", read as ${read}`);
        s.thing = read;
      }
    }
    // A token saved in other letters (`--Color-Accent`) is that token, as
    // set reads the name typed; with the theme holding it already, the two
    // are that token listed twice.
    if (
      s.thing.startsWith('--') &&
      s.thing !== s.thing.toLowerCase() &&
      ['token', undefined, null, ''].includes(s.source) &&
      (!data.settings.some(
        (/** @type {any} */ x) =>
          x !== s &&
          x?.thing === s.thing.toLowerCase() &&
          (x.on ?? null) === (s.on ?? null),
      ) ||
        twinInLetters(s, s.thing.toLowerCase(), data))
    ) {
      const read = s.thing.toLowerCase();
      notes.push(`${s.thing} was saved as "${s.thing}", read as ${read}`);
      s.thing = read;
    }
    // A token saved in another form (`var(--color-accent)`) is that token,
    // as set reads the name typed (the one thing reader).
    if (
      !s.thing.startsWith('--') &&
      ['token', undefined, null, ''].includes(s.source)
    ) {
      const entry = normalizeEntry(s.thing, String(s.value ?? ''));
      const read =
        String(entry.value ?? '') === String(s.value ?? '')
          ? String(entry.thing ?? '')
          : '';
      // Not when the theme holds that token already: the entry is then
      // damage its own undo removes.
      const held = data.settings.some(
        (/** @type {any} */ x) =>
          x !== s && x?.thing === read && (x.on ?? null) === (s.on ?? null),
      );
      if (read.startsWith('--') && !held) {
        notes.push(`${s.thing} was saved as "${s.thing}", read as ${read}`);
        s.thing = read;
      }
    }
    // A mode that names both modes or none (`"both"`, `""`) is no mode, as
    // set reads `--mode both` (the setting for both modes), unless the theme
    // holds that setting for both modes already.
    if (
      typeof s.mode === 'string' &&
      /^(both|)$/i.test(s.mode.trim()) &&
      !data.settings.some(
        (/** @type {any} */ x) =>
          x !== s &&
          x?.thing === s.thing &&
          keyOf(x) === keyOf({...s, mode: undefined}),
      )
    ) {
      notes.push(
        `${s.thing} was saved with mode ${JSON.stringify(s.mode)}, read as both modes`,
      );
      delete s.mode;
    }
    if (typeof s.mode === 'string' && s.mode !== 'light' && s.mode !== 'dark') {
      const read = modeWord(s.mode);
      if (read) {
        notes.push(
          `${s.thing} was saved with mode ${JSON.stringify(s.mode)}, read as ${read}`,
        );
        s.mode = read;
      }
    }
    // A state saved in other letters or with its colon (`Hover`, `:hover`)
    // is that state, as a typed --state is read (the one state reader). Its
    // words are split (`focusVisible` is focus-visible) only into a state
    // CSS writes that way: a part's own state is written as its census
    // names it (toggle-button's isPressed), which set saves and the build
    // reads, so that spelling is kept.
    // A state that is no state name as written (`IsPressed`, `is pressed`)
    // is put in its words (is-pressed) for the census half of the reader
    // (readSavedStates), which reads them as the part's own state and says
    // so, with the spelling saved.
    const stateRead =
      typeof s.state === 'string' ? stateSpelling(s.state) : null;
    if (typeof s.state === 'string' && stateRead && stateRead !== s.state) {
      if (
        COMMON_STATES.includes(stateRead) ||
        stateRead === s.state.trim().replace(/^:+/, '').toLowerCase()
      ) {
        notes.push(
          `${s.thing} was saved with state ${JSON.stringify(s.state)}, read as ${stateRead}`,
        );
        s.state = stateRead;
      } else if (!STATE_NAME.test(s.state)) {
        SAVED_STATE.set(s, s.state);
        s.state = stateRead;
      }
    }
    // A dial saved for one mode is refused as set refuses --mode on it
    // (settingsProblem): it is never built for a mode it does not name.
    // A part saved in other letters, with spaces around it, or as a list
    // of that one part (`Card`, ` card`, `["card"]`) is that part: part
    // names are lower case, so every reader matches it as one scope.
    {
      const one =
        Array.isArray(s.on) && s.on.length === 1 && typeof s.on[0] === 'string'
          ? s.on[0]
          : s.on;
      const part =
        typeof one === 'string' && /^\s*[a-z][a-z0-9-]*\s*$/i.test(one)
          ? one.trim().toLowerCase()
          : null;
      if (part && part !== s.on) {
        notes.push(
          `${s.thing} was saved on ${JSON.stringify(s.on)}, read as ${part}`,
        );
        s.on = part;
      }
    }
    // A dial's word saved in other letters (`Pill`) is that word.
    if (
      ['dial', undefined, null, ''].includes(s.source) ||
      String(s.source).toLowerCase() === 'dial'
    ) {
      // A corners size saved in rem is the px set saves it as; a dial's
      // number saved with its unit (text-size `20px`) is that number.
      const number =
        typeof s.value === 'string' ? dialNumber(s.thing, s.value) : null;
      const word =
        typeof s.value !== 'string'
          ? null
          : (dialWordOf(s.thing, s.value) ??
            (s.thing === 'corners'
              ? cornersPlain(s.value)
              : number !== s.value
                ? number
                : null));
      if (word && word !== s.value) {
        notes.push(
          `${s.thing} was saved as ${JSON.stringify(s.value)}, read as ${word}`,
        );
        s.value = word;
      }
    }
    // A headings word saved under the other half (or a tracking word with
    // no half) is filed under the half the word belongs to.
    if (
      s.thing === 'headings' &&
      typeof s.value === 'string' &&
      (s.axis == null || s.axis === 'weight' || s.axis === 'tracking')
    ) {
      const half = Object.hasOwn(HEADING_TRACKING, s.value)
        ? 'tracking'
        : Object.hasOwn(HEADING_WEIGHTS, s.value)
          ? 'weight'
          : null;
      if (half && (s.axis ?? 'weight') !== half) {
        notes.push(
          `headings "${s.value}" was saved under ${s.axis ?? 'weight'}, read as ${half}`,
        );
        if (half === 'tracking') s.axis = 'tracking';
        else delete s.axis;
      }
    }
    // `only` is true or absent; a yes or no written as text or a number
    // (`"true"`, `"yes"`, `"off"`, `1`, `0`) is read as what it says by the
    // one yes/no reader, since the build reads any other value as true.
    if (
      (typeof s.only === 'string' || typeof s.only === 'number') &&
      booleanWord(s.only) != null
    ) {
      const read = booleanWord(s.only) === true;
      notes.push(
        `${s.thing} was saved with only ${JSON.stringify(s.only)}, read as ${read}`,
      );
      if (read) s.only = true;
      else delete s.only;
    } else if (s.only === false) delete s.only;
    if (!['dial', 'token', 'property'].includes(s.source)) {
      const typed = typeof s.source === 'string' ? s.source.trim() : '';
      const read = typed
        ? ['dial', 'token', 'property'].find(x => x === typed.toLowerCase())
        : s.source == null || s.source === ''
          ? DIALS[s.thing]
            ? 'dial'
            : s.thing.startsWith('--')
              ? 'token'
              : s.on
                ? 'property'
                : undefined
          : undefined;
      if (read) {
        notes.push(
          typed
            ? `${s.thing} was saved with source ${JSON.stringify(s.source)}, read as ${read}`
            : `${s.thing} was saved with no source, read as ${read}`,
        );
        s.source = read;
      }
    }
  }
  ENTRY_NOTES.set(data, notes);
}

/** @type {WeakMap<object, string[]>} */
const ENTRY_NOTES = new WeakMap();

/**
 * What loading read differently from the file in the theme's entries (a
 * mode or source in other letters, a missing source): one note each.
 * @param {object} data the theme as {@link loadTheme} returned it
 * @returns {string[]}
 */
export function entryNotes(data) {
  return ENTRY_NOTES.get(data) ?? [];
}

/** The scope fields that name a place by text. */
const PLACE_SCOPES = /** @type {const} */ (['on', 'when', 'state']);

/**
 * Which part of an entry means nothing after reading: its source, a scope
 * that is not text (`"when": 5`, `"on": {}`) or a part named by no text
 * (`"on": ""`), its mode or `only`, or null. The one typed reader of a
 * saved scope: a damaged one is never read as a flag.
 * @param {any} s
 * @returns {'mode' | 'source' | 'only' | 'on' | 'when' | 'state' | null}
 */
export function entryDamage(s) {
  if (!s || typeof s.thing !== 'string') return null;
  if (!['dial', 'token', 'property'].includes(s.source)) return 'source';
  for (const k of PLACE_SCOPES)
    if (
      s[k] != null &&
      (typeof s[k] !== 'string' || (k === 'on' && !s[k].trim()))
    )
      return k;
  if (s.mode != null && s.mode !== 'light' && s.mode !== 'dark') return 'mode';
  // A dial is the same in light and dark: a mode on it means nothing.
  if (s.mode != null && s.source === 'dial') return 'mode';
  if (s.only != null && (s.only !== true || !onlyFits(s))) return 'only';
  return null;
}

/**
 * Whether `only` fits a setting: it names one member of a group styled
 * alike (a text input of inputs), as `set --only` takes it.
 * @param {any} s
 */
function onlyFits(s) {
  const fam = typeof s.on === 'string' ? familyOf(s.on) : null;
  return Boolean(
    fam && !FAMILIES[s.on] && AUTO_SPREAD.includes(/** @type {string} */ (fam)),
  );
}

/**
 * A refusal of one saved entry, with that entry (`damaged`), so the
 * repair set offers for it as typed goes beside the undo.
 * @param {any} entry
 * @param {AstryxError} e
 * @returns {AstryxError}
 */
function withDamaged(entry, e) {
  return Object.assign(e, {damaged: entry});
}

/**
 * The entry as an undo names it: without the mode or `only` that means
 * nothing (an undo without them removes that entry).
 * @param {any} s
 */
function damagedUndo(s) {
  const damage = entryDamage(s);
  return {
    ...s,
    mode: damage === 'mode' ? undefined : s.mode,
    only: damage === 'only' ? undefined : s.only,
    // A damaged part is named as no part (`--on ''`), which an undo of a
    // property still takes; a damaged variant or state is left out.
    on: damage === 'on' ? '' : s.on,
    when: damage === 'when' ? undefined : s.when,
    state: damage === 'state' ? undefined : s.state,
  };
}

/**
 * The entry a settings problem names when that problem is its mode or
 * `only`, or null.
 * @param {any} data
 * @param {string} problem
 */
function damagedEntry(data, problem) {
  return (
    (Array.isArray(data?.settings) ? data.settings : []).find(
      (/** @type {any} */ s) =>
        (entryDamage(s) === 'source' &&
          ((typeof s.source === 'string' &&
            s.source !== '' &&
            problem.startsWith(`${s.thing} has source `)) ||
            // An entry saved with no source its undo still names.
            ((s.source == null || s.source === '') &&
              problem.startsWith(`${s.thing} has no source `)))) ||
        (entryDamage(s) === 'mode' &&
          problem.startsWith(`${s.thing} has mode `)) ||
        (PLACE_SCOPES.some(k => entryDamage(s) === k) &&
          (problem.startsWith(
            `${s.thing} has a ${entryDamage(s)} that is not text`,
          ) ||
            problem.startsWith(`${s.thing} is set on ""`))) ||
        (entryDamage(s) === 'only' &&
          (problem.startsWith(`${s.thing} has only `) ||
            problem.includes(' has only, which is for one member'))),
    ) ?? null
  );
}

/**
 * Whether the command removes the setting it names (an undo): only that
 * takes an entry whose mode or source means nothing.
 * @param {string | Partial<Setting> | undefined} skip
 */
function removes(skip) {
  return Boolean(
    skip && typeof skip === 'object' && /** @type {any} */ (skip).removing,
  );
}

/**
 * Whether a setting is the one a command changes or removes: by thing, or
 * by the whole identity (part, variant, state, mode) when one is given.
 * @param {any} s
 * @param {string | Partial<Setting> | undefined} skip
 */
export function skips(s, skip) {
  if (!skip) return false;
  if (typeof skip === 'string') return s.thing === skip;
  // Each scope field the same, or (for an undo that names none) the one
  // that means nothing on this entry: that undo removes it.
  const same = (/** @type {'on' | 'when' | 'state' | 'mode'} */ k) =>
    (s[k] ?? '') === (skip[k] ?? '') ||
    (removes(skip) && !skip[k] && entryDamage(s) === k);
  return (
    s.thing === skip.thing &&
    // A headings half set or undone is that half alone, as keyOf reads it
    // (an entry with no axis is the weight); an entry whose axis names no
    // half is the headings any change of it replaces.
    (s.thing !== 'headings' ||
      /** @type {any} */ (skip).axis == null ||
      !['weight', 'tracking', undefined, null].includes(s.axis) ||
      (s.axis ?? 'weight') === /** @type {any} */ (skip).axis) &&
    same('on') &&
    same('when') &&
    same('state') &&
    same('mode')
  );
}

/**
 * Every setting whose only problem is its value or scope, each with the
 * command that removes it.
 * @param {any} data
 * @returns {Setting[]}
 */
export function badSettings(data) {
  return (Array.isArray(data?.settings) ? data.settings : []).filter(
    (/** @type {any} */ s) =>
      s && typeof s.thing === 'string' && entryProblem(s, data),
  );
}

/**
 * What is wrong with one saved setting among the others, or null: its
 * value (valueProblem), or a rule set checks against the theme's other
 * settings: a vibrancy saturates the colors the color dials make, so with
 * no color dial set it does nothing, and set refuses it.
 * @param {any} s
 * @param {any} data
 * @returns {string | null}
 */
export function entryProblem(s, data) {
  const own = valueProblem(s);
  if (own) return own;
  if (
    s?.thing === 'vibrancy' &&
    s.source === 'dial' &&
    !(Array.isArray(data?.settings) ? data.settings : []).some(
      (/** @type {any} */ x) =>
        x && x.source === 'dial' && PALETTE_DIALS.includes(x.thing),
    )
  )
    return `vibrancy ${JSON.stringify(s.value)} saturates the colors the color dials make, and no color dial is set, so it does nothing`;
  return null;
}

/**
 * The words that name a setting for `undo`.
 * @param {import('./_settings.mjs').Setting} x
 */
export function undoArgs(x) {
  return [
    quoteCommandArgument(String(x.thing)),
    // The tracking half of headings is named, so the undo reaches it even
    // when it is listed twice (a bare `undo headings` then reads the weight
    // half).
    ...(x.thing === 'headings' && x.axis === 'tracking' ? ['tracking'] : []),
    ...scopeFlags(x),
  ].join(' ');
}

/**
 * The words of a `set` that gives a setting's scope a value: set reads a
 * headings half from its word, so no half is named.
 * @param {import('./_settings.mjs').Setting} x
 * @param {string} value
 */
export function setArgs(x, value) {
  return [
    quoteCommandArgument(String(x.thing)),
    quoteCommandArgument(value),
    ...scopeFlags(x),
  ].join(' ');
}

/**
 * The flags that name a setting's scope, as set and undo take them.
 * @param {import('./_settings.mjs').Setting} x
 * @returns {string[]}
 */
function scopeFlags(x) {
  return [
    // A part named as none (`''`) is kept: an undo names it so.
    ...(x.on || x.on === ''
      ? [`--on ${quoteCommandArgument(String(x.on))}`]
      : []),
    ...(x.when ? [`--when ${quoteCommandArgument(String(x.when))}`] : []),
    ...(x.state ? [`--state ${quoteCommandArgument(String(x.state))}`] : []),
    ...(x.mode ? [`--mode ${quoteCommandArgument(String(x.mode))}`] : []),
    ...(x.only ? ['--only'] : []),
  ];
}

/**
 * The first setting whose only problem is its value (made under looser
 * rules): `undo <theme> <undoArgs>` removes it.
 * @param {any} data
 * @returns {Setting | null}
 */
export function badSetting(data) {
  for (const s of Array.isArray(data?.settings) ? data.settings : [])
    if (s && typeof s.thing === 'string' && entryProblem(s, data)) return s;
  return null;
}

/**
 * The settings without those whose only problem is their value (made under
 * looser rules), and the ones left out.
 * @param {ThemeData} data
 * @returns {{data: ThemeData, dropped: Setting[]}}
 */
export function withoutBadValues(data) {
  const dropped = data.settings.filter(s => entryProblem(s, data));
  return {
    data: {...data, settings: data.settings.filter(s => !dropped.includes(s))},
    dropped,
  };
}

/**
 * What is wrong with a setting's value, or null.
 * @param {any} s
 * @returns {string | null}
 */
export function valueProblem(s) {
  if (!('value' in s)) return `${s.thing} has no value`;
  if (typeof s.value !== 'string')
    return `${s.thing} has a value that is not text (${JSON.stringify(s.value)})`;
  for (const k of ['on', 'when', 'state', 'mode'])
    if (s[k] != null && typeof s[k] !== 'string')
      return `${s.thing} has a ${k} that is not text`;
  const scope = scopeProblem(s);
  if (scope) return scope;
  {
    const bad = `${s.thing} "${s.value}"`;
    // A font family name may hold an apostrophe (O'Reilly Sans): Core
    // quotes the family itself.
    const checked =
      s.source === 'dial' && s.thing === 'font'
        ? s.value.replace(/'/g, '')
        : s.value;
    if (!isSafeValue(checked)) return `${bad} cannot be a CSS value`;
    if (s.source === 'token') {
      if (s.mode && !isColorToken(s.thing))
        return `${s.thing} is set for ${s.mode} only, but only colors differ by mode`;
      if (new RegExp(`var\\(\\s*${s.thing}\\s*[,)]`, 'i').test(s.value))
        return `${bad} reads itself`;
    }
    if (s.source !== 'dial') return null;
    const d = DIALS[s.thing];
    if (!d) return `${s.thing} is not a dial`;
    // A color dial needs a fixed opaque seed, as `set` checks it: a
    // see-through, system or variable color generates no shades.
    if (PALETTE_DIALS.includes(s.thing) && isColorValue(s.value)) {
      const seed = colorProblem(s.value);
      if (seed) return `${bad} ${seed.message}`;
    }
    // `axis` names the half of headings a value sets; no other dial has
    // one, and each half takes only its own words.
    if (s.axis != null && s.thing !== 'headings')
      return `${s.thing} has an axis (${JSON.stringify(s.axis)}), which only headings takes`;
    if (s.thing === 'headings') {
      if (s.axis != null && s.axis !== 'weight' && s.axis !== 'tracking')
        return `headings has axis ${JSON.stringify(s.axis)}, not weight or tracking`;
      const half = s.axis === 'tracking' ? HEADING_TRACKING : HEADING_WEIGHTS;
      if (!Object.hasOwn(half, s.value))
        return `${bad} is not a ${s.axis ?? 'weight'} headings takes (${Object.keys(half).join('|')})`;
    }
    const words = d.values.split('|').filter(w => !w.startsWith('<'));
    const ok =
      s.thing === 'corners'
        ? words.includes(s.value) || /^\d+(\.\d+)?px$/.test(s.value)
        : s.thing === 'text-size'
          ? words.includes(s.value) ||
            (/^\d+(\.\d+)?$/.test(s.value) &&
              Number(s.value) >= 10 &&
              Number(s.value) <= 32)
          : s.thing === 'vibrancy'
            ? /^\d{1,3}$/.test(s.value) && Number(s.value) <= 100
            : PALETTE_DIALS.includes(s.thing)
              ? isColorValue(s.value)
              : s.thing === 'font'
                ? s.value.trim() !== ''
                : words.includes(s.value);
    if (!ok || s.value === 'more' || s.value === 'less')
      return `${bad} is not a value ${s.thing} takes (${d.values.replace('|more|less', '')})`;
  }
  return null;
}

/**
 * One entry of the top-level `tokens` map in a theme's own source, as
 * written: its token (null for a computed key no read of the file can
 * resolve), the key as typed, the line that sets it, and its value's shape.
 * A `chain` entry is another theme the file defines (`theme`, its name):
 * its call, or a token its literal tokens map sets. A `scope` entry names
 * where a scope (`components`, `onDark`, `onLight`, `adaptations`,
 * `localTokens`) starts; a `scoped` entry is a token one sets, with its
 * scope path (`components.button.base`). A `duplicate` entry names a
 * second `tokens` key (with every line); a
 * `typography` entry is one typography field (its dotted key and value;
 * `block` when it holds fields); a `field` entry is a field the theme
 * gives defineTheme; a `key` entry is a block's own key in a scope (a
 * style key, a pseudo-class, a surface's tokens), with its scope path;
 * an `unresolved` entry says the map holds something only a build reads.
 * A chain theme defined in another file carries that `file`.
 * @typedef {{token: string | null, key: string, line: number | null, kind: 'text' | 'number' | 'pair' | 'object' | 'other' | 'duplicate' | 'typography' | 'unresolved' | 'scope' | 'scoped' | 'chain' | 'field' | 'key', scope?: string, theme?: string, value?: any, halves?: Array<string | number | undefined>, lines?: Array<number | null>, file?: string, overridden?: boolean, expression?: boolean, notToken?: boolean, block?: boolean}} OwnTokenEntry
 */

/**
 * The entries of the top-level `tokens` map in a theme's own source, read
 * from its syntax tree, each with the line that sets it. Entries read from
 * the file the source re-exports its theme from name that file.
 * @param {string} cwd
 * @param {string} slug
 * @returns {OwnTokenEntry[]}
 */
export function ownTokenEntries(cwd, slug) {
  /** @type {OwnTokenEntry[]} */
  const detail = [];
  ownPageTokens(cwd, slug, detail);
  const source = themeSourceFile(cwd, slug);
  if (source && source.file !== themeFiles(cwd, slug).ts)
    for (const e of detail) e.file ??= source.file;
  return detail;
}

/**
 * The file that holds a theme's `defineTheme()` call, with its code: the
 * theme's own source, or the file beside it the source re-exports the
 * theme from (`export * from './impl'`). Null when the source cannot be
 * read.
 * @param {string} cwd
 * @param {string} slug
 * @returns {{file: string, code: string} | null}
 */
function themeSourceFile(cwd, slug) {
  let file = themeFiles(cwd, slug).ts;
  /** @param {any} node @returns {boolean} */
  const callsDefineTheme = node =>
    !!node &&
    typeof node === 'object' &&
    ((node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'defineTheme') ||
      Object.entries(node).some(
        ([k, v]) =>
          k !== 'loc' &&
          (Array.isArray(v)
            ? v.some(callsDefineTheme)
            : v && typeof v === 'object' && v.type && callsDefineTheme(v)),
      ));
  for (let hop = 0; hop < 4; hop++) {
    /** @type {string} */
    let code;
    try {
      code = fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
    /** @type {any} */
    let ast;
    try {
      ast = parseModule(code, {sourceType: 'module', plugins: ['typescript']});
    } catch {
      return {file, code};
    }
    if (callsDefineTheme(ast.program)) return {file, code};
    const from = file;
    const next = ast.program.body
      .map((/** @type {any} */ st) => reexportTarget(st, path.dirname(from)))
      .find(Boolean);
    if (!next) return {file, code};
    file = next;
  }
  return null;
}

/**
 * The file beside a module that one of its statements re-exports from
 * (`export * from './impl'`, `export {x} from './impl'`), or null.
 * @param {any} st a top-level statement
 * @param {string} dir the module's folder
 * @returns {string | null}
 */
function reexportTarget(st, dir) {
  return (st.type === 'ExportAllDeclaration' ||
    st.type === 'ExportNamedDeclaration') &&
    st.source &&
    String(st.source.value).startsWith('.')
    ? (localModuleFile(dir, String(st.source.value)) ?? null)
    : null;
}

/**
 * Add the names a declaration destructures (`const {toks} = all`, `const
 * {a: {b}} = all`, `const [first] = list`) to a file's bindings, each as the
 * member read it is (`all.toks`, `all.a.b`, `list[0]`), so a value given by
 * such a name is read where it is written.
 * @param {any} declarator
 * @param {Map<string, any>} into
 */
function addDestructuredReads(declarator, into) {
  if (!declarator?.init) return;
  /** @param {any} pattern @param {any} value the expression the pattern reads */
  const bind = (pattern, value) => {
    if (pattern?.type === 'AssignmentPattern') pattern = pattern.left;
    if (pattern?.type === 'Identifier') {
      into.set(pattern.name, value);
      return;
    }
    if (pattern?.type === 'ObjectPattern')
      for (const p of pattern.properties) {
        if (p.type !== 'ObjectProperty' || p.computed) continue;
        const key =
          p.key?.type === 'Identifier'
            ? p.key.name
            : p.key?.type === 'StringLiteral'
              ? p.key.value
              : null;
        if (key)
          bind(p.value, {
            type: 'MemberExpression',
            computed: false,
            object: value,
            property: {type: 'Identifier', name: key},
            loc: p.loc,
          });
      }
    else if (pattern?.type === 'ArrayPattern')
      pattern.elements.forEach(
        (/** @type {any} */ e, /** @type {number} */ i) => {
          if (e && e.type !== 'RestElement')
            bind(e, {
              type: 'MemberExpression',
              computed: true,
              object: value,
              property: {type: 'NumericLiteral', value: i},
              loc: e.loc,
            });
        },
      );
  };
  if (declarator.id?.type !== 'Identifier')
    bind(declarator.id, declarator.init);
}

/**
 * The value a module beside a theme exports by a name (`default` for its
 * default export), read in the file that holds it: an exported
 * declaration, a name in an `export {...}` list (an import the file
 * re-exports is followed), a re-export (`export {x} from`, `export * from`).
 * With that file's code and path, and an unwrap that reads its own
 * bindings. Null when no file beside it holds the value as written.
 * @param {string} file
 * @param {string} name
 * @param {number} [hops]
 * @returns {{obj: any, code: string, file: string, unwrap: (n: any) => any} | null}
 */
function exportedValue(file, name, hops = 0) {
  if (hops > 4) return null;
  /** @type {string} */
  let source;
  /** @type {any} */
  let ast;
  try {
    const text = fs.readFileSync(file, 'utf8');
    source = file.endsWith('.json') ? `export default ${text}` : text;
    ast = parseModule(source, {sourceType: 'module', plugins: ['typescript']});
  } catch {
    return null;
  }
  const dir = path.dirname(file);
  /** @type {Map<string, any>} */
  const local = new Map();
  /** @type {Map<string, {from: string, name: string}>} */
  const imports = new Map();
  for (const top of ast.program.body) {
    if (top.type === 'ImportDeclaration') {
      const from = String(top.source?.value ?? '');
      for (const x of top.specifiers)
        if (x.type !== 'ImportNamespaceSpecifier' && from.startsWith('.'))
          imports.set(x.local.name, {
            from,
            name:
              x.type === 'ImportDefaultSpecifier'
                ? 'default'
                : (x.imported?.name ?? x.imported?.value),
          });
    }
    const d = top.type === 'ExportNamedDeclaration' ? top.declaration : top;
    if (d?.type === 'FunctionDeclaration' && d.id) local.set(d.id.name, d);
    for (const v of d?.declarations ?? [])
      if (v.id?.type === 'Identifier') local.set(v.id.name, v.init);
      else addDestructuredReads(v, local);
  }
  /** @param {any} n @param {number} [k] @returns {any} */
  const unwrap = (n, k = 0) => {
    if (!n || k > 20) return null;
    if (
      [
        'TSAsExpression',
        'TSSatisfiesExpression',
        'TSNonNullExpression',
        'ParenthesizedExpression',
      ].includes(n.type)
    )
      return unwrap(n.expression, k + 1);
    if (n.type === 'Identifier' && local.has(n.name))
      return unwrap(local.get(n.name), k + 1);
    // A property of a block the file binds (`export const toks = base.toks`).
    if (
      n.type === 'MemberExpression' ||
      n.type === 'OptionalMemberExpression'
    ) {
      const key = n.computed
        ? ['NumericLiteral', 'StringLiteral'].includes(n.property?.type)
          ? String(n.property.value)
          : null
        : (n.property?.name ?? n.property?.value);
      const base = unwrap(n.object, k + 1);
      const value =
        key == null
          ? undefined
          : base?.type === 'ObjectExpression'
            ? base.properties.findLast(
                (/** @type {any} */ p) =>
                  p.type === 'ObjectProperty' &&
                  !p.computed &&
                  String(p.key?.name ?? p.key?.value) === key,
              )?.value
            : base?.type === 'ArrayExpression' && /^\d+$/.test(key)
              ? base.elements[Number(key)]
              : undefined;
      if (value) return unwrap(value, k + 1);
    }
    return n;
  };
  /** @param {any} node */
  const found = node => ({obj: unwrap(node), code: source, file, unwrap});
  /** A name the file binds, as its value: its own, or one it imports. @param {string} binding */
  const bound = binding => {
    if (local.has(binding)) return found(local.get(binding));
    const via = imports.get(binding);
    if (!via) return null;
    const next = localModuleFile(dir, via.from);
    return next ? exportedValue(next, via.name, hops + 1) : null;
  };
  /** @type {string[]} */
  const starred = [];
  for (const top of ast.program.body) {
    if (top.type === 'ExportDefaultDeclaration' && name === 'default')
      return top.declaration?.type === 'Identifier'
        ? bound(top.declaration.name)
        : found(top.declaration);
    if (top.type === 'ExportAllDeclaration') {
      const next = reexportTarget(top, dir);
      if (next) starred.push(next);
      continue;
    }
    if (top.type !== 'ExportNamedDeclaration') continue;
    if (
      top.declaration?.type === 'FunctionDeclaration' &&
      top.declaration.id?.name === name
    )
      return found(top.declaration);
    for (const v of top.declaration?.declarations ?? [])
      if (v.id?.type === 'Identifier' && v.id.name === name)
        return found(v.init);
    for (const x of top.specifiers ?? []) {
      const exported = x.exported?.name ?? x.exported?.value;
      if (exported !== name) continue;
      const orig = x.local?.name ?? x.local?.value;
      if (!top.source) return bound(orig);
      const next = reexportTarget(top, dir);
      return next ? exportedValue(next, orig, hops + 1) : null;
    }
  }
  for (const next of starred) {
    const value = exportedValue(next, name, hops + 1);
    if (value) return value;
  }
  return null;
}

/**
 * The page-wide tokens a theme's own source sets: the keys of the top-level
 * `tokens` map in its `defineTheme({...})`, read from the syntax tree, each
 * with its value when that is plain text (else null). A token set only in a
 * scope (`onDark`, `components`) is not one: it does not apply page-wide.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Map<string, string | null>}
 */
function ownPageTokens(
  cwd,
  slug,
  detail = /** @type {OwnTokenEntry[] | null} */ (null),
) {
  /** @type {Map<string, string | null>} */
  const out = new Map();
  const source = themeSourceFile(cwd, slug);
  if (!source) return out;
  const {code} = source;
  /** @type {any} */
  let ast;
  try {
    ast = parseModule(code, {sourceType: 'module', plugins: ['typescript']});
  } catch {
    return out;
  }
  /** @param {any} node @returns {string | null} */
  const keyOf = node =>
    node?.type === 'StringLiteral'
      ? node.value
      : node?.type === 'Identifier'
        ? node.name
        : node?.type === 'NumericLiteral'
          ? String(node.value)
          : null;
  /** @param {any} node @returns {string | null} */
  const textOf = node =>
    node?.type === 'StringLiteral'
      ? node.value
      : node?.type === 'TemplateLiteral' && node.expressions.length === 0
        ? node.quasis.map((/** @type {any} */ q) => q.value.cooked).join('')
        : null;
  // Every const binding in the file, by name, so a value given by name
  // (tokens: mine, ...mine) is read as written.
  /** @type {Map<string, any>} */
  const consts = new Map();
  /** @type {any[]} */
  const calls = [];
  /** @param {any} node @param {any} owner the exported name, when exported */
  const visit = (node, owner = null) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier')
      consts.set(node.id.name, node.init);
    else if (node.type === 'VariableDeclarator')
      addDestructuredReads(node, consts);
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'defineTheme' &&
      node.arguments?.[0]
    )
      calls.push({call: node, owner});
    for (const [k, v] of Object.entries(node)) {
      const nextOwner =
        node.type === 'VariableDeclarator' && k === 'init'
          ? (node.id?.name ?? owner)
          : node.type === 'ExportDefaultDeclaration'
            ? 'default'
            : owner;
      if (Array.isArray(v)) v.forEach(c => visit(c, nextOwner));
      else if (v && typeof v === 'object' && v.type) visit(v, nextOwner);
    }
  };
  visit(ast.program);
  /** @param {any} node @param {number} [depth] @returns {any} */
  const unwrap = (node, depth = 0) => {
    if (!node || depth > 20) return null;
    if (
      [
        'TSAsExpression',
        'TSSatisfiesExpression',
        'TSNonNullExpression',
        'TSTypeAssertion',
        'ParenthesizedExpression',
      ].includes(node.type)
    )
      return unwrap(node.expression, depth + 1);
    if (node.type === 'Identifier' && consts.has(node.name))
      return unwrap(consts.get(node.name), depth + 1);
    return node;
  };
  // The theme the build loads: the defineTheme that names it, else the one
  // exported as <camel>Theme or by default, else the only one.
  const named = calls.find(({call}) => {
    const obj = unwrap(call.arguments[0]);
    return (
      obj?.type === 'ObjectExpression' &&
      obj.properties.some(
        (/** @type {any} */ p) =>
          p.type === 'ObjectProperty' &&
          keyOf(p.key) === 'name' &&
          textOf(unwrap(p.value)) === slug,
      )
    );
  });
  const chosen =
    named ??
    calls.find(
      c => c.owner === `${camel(slug)}Theme` || c.owner === 'default',
    ) ??
    (calls.length === 1 ? calls[0] : null);
  if (!chosen) return out;
  // Every other theme the file defines (one the exported theme extends),
  // by its name: the line of its call and of each token its literal
  // tokens map sets.
  if (detail)
    for (const {call} of calls) {
      if (call === chosen.call) continue;
      const other = unwrap(call.arguments[0]);
      if (other?.type !== 'ObjectExpression') continue;
      /** @param {string} key */
      const prop = key =>
        other.properties.find(
          (/** @type {any} */ p) =>
            p.type === 'ObjectProperty' && !p.computed && keyOf(p.key) === key,
        );
      const theme = textOf(unwrap(prop('name')?.value));
      if (!theme) continue;
      detail.push({
        token: null,
        key: theme,
        kind: 'chain',
        theme,
        line: call.loc?.start?.line ?? null,
      });
      const map = unwrap(prop('tokens')?.value);
      for (const p of map?.type === 'ObjectExpression' ? map.properties : []) {
        const k =
          p.type !== 'ObjectProperty'
            ? null
            : p.computed
              ? textOf(unwrap(p.key))
              : keyOf(p.key);
        if (k?.startsWith('--'))
          detail.push({
            token: k,
            key: k,
            kind: 'chain',
            theme,
            line: p.loc?.start?.line ?? null,
          });
      }
    }
  const dir = path.dirname(source.file);
  /** @param {string} from */
  const localFile = from =>
    from.startsWith('.') ? (localModuleFile(dir, from) ?? null) : null;
  /**
   * The object a name imported from a file beside the theme gives (`import
   * {mine} from './mine'`, a default import of a .json file, or, with
   * `member`, `s.mine` of `import * as s from './mine'`), read from the
   * file that holds its value (through `export {mine}` lists and
   * re-exports), with that file's code and path; null for any other name.
   * `member` is true when the namespace member was read.
   * @param {string} name
   * @param {string} [member] the property read off the name
   * @returns {{obj: any, code: string, file: string, unwrap: (n: any) => any, member?: boolean} | null}
   */
  const imported = (name, member) => {
    for (const st of ast.program.body) {
      if (st.type !== 'ImportDeclaration') continue;
      const spec = st.specifiers.find(
        (/** @type {any} */ x) => x.local?.name === name,
      );
      const from = String(st.source?.value ?? '');
      if (!spec || !from.startsWith('.')) continue;
      const file = localFile(from);
      if (!file) return null;
      if (spec.type === 'ImportNamespaceSpecifier') {
        if (!member) return null;
        const value = exportedValue(file, member);
        return value ? {...value, member: true} : null;
      }
      return exportedValue(
        file,
        spec.type === 'ImportDefaultSpecifier'
          ? 'default'
          : (spec.imported?.name ?? spec.imported?.value),
      );
    }
    return null;
  };
  /**
   * The value a node of the theme file reads from a file beside it, read in
   * the file that holds it: an imported name, a property read off one
   * (`all.toks`, `all?.toks`, `s.toks` of a namespace import, `const {toks}
   * = all`), or what an imported function returns (`make()`), with the
   * arguments the theme file passes, by parameter. Null when the value is
   * not read from another file.
   * @param {any} node
   * @param {number} [depth]
   * @returns {{obj: any, code: string, file: string, unwrap: (n: any) => any, args?: Map<string, any>} | null}
   */
  const importedValue = (node, depth = 0) => {
    if (depth > 12) return null;
    const n = unwrap(node);
    if (n?.type === 'Identifier') return imported(n.name);
    if (
      n?.type === 'MemberExpression' ||
      n?.type === 'OptionalMemberExpression'
    ) {
      const property = n.computed ? unwrap(n.property) : n.property;
      const key = n.computed
        ? property?.type === 'NumericLiteral'
          ? String(property.value)
          : textOf(property)
        : keyOf(property);
      if (key == null) return null;
      if (n.object?.type === 'Identifier') {
        const namespaced = imported(n.object.name, key);
        if (namespaced?.member) return namespaced;
      }
      // A member of `await import('./shared')` is that file's export.
      const loaded = unwrap(n.object);
      const dynamic =
        loaded?.type === 'AwaitExpression' &&
        loaded.argument?.type === 'CallExpression' &&
        loaded.argument.callee?.type === 'Import'
          ? textOf(loaded.argument.arguments[0])
          : null;
      if (dynamic != null) {
        const file = localFile(dynamic);
        return file ? exportedValue(file, key) : null;
      }
      const base = importedValue(n.object, depth + 1);
      const obj = base?.obj;
      const value =
        obj?.type === 'ObjectExpression'
          ? obj.properties.findLast(
              (/** @type {any} */ p) =>
                p.type === 'ObjectProperty' &&
                !p.computed &&
                keyOf(p.key) === key,
            )?.value
          : obj?.type === 'ArrayExpression' && /^\d+$/.test(key)
            ? obj.elements[Number(key)]
            : undefined;
      return base && value ? {...base, obj: base.unwrap(value)} : null;
    }
    // A value that passes an imported one through (a template, a choice,
    // a call of a function of the theme file's own or a global, such as
    // String()) is read where that one is written.
    /** @param {any[]} parts */
    const through = parts => {
      for (const part of parts) {
        const from = importedValue(part, depth + 1);
        if (from) return from;
      }
      return null;
    };
    if (n?.type === 'TemplateLiteral') return through(n.expressions);
    if (n?.type === 'ConditionalExpression')
      return through([n.consequent, n.alternate]);
    if (n?.type === 'LogicalExpression') return through([n.left, n.right]);
    if (n?.type === 'CallExpression') {
      const fn = importedValue(n.callee, depth + 1);
      if (!fn) return through(n.arguments);
      const f = fn?.obj;
      const body = [
        'ArrowFunctionExpression',
        'FunctionExpression',
        'FunctionDeclaration',
      ].includes(f?.type)
        ? f.body
        : null;
      const returned =
        body?.type === 'BlockStatement'
          ? body.body.findLast(
              (/** @type {any} */ st) => st.type === 'ReturnStatement',
            )?.argument
          : body;
      if (!fn || !returned) return null;
      // A parameter the returned value holds is the argument the theme
      // file passes.
      /** @type {Map<string, any>} */
      const args = new Map();
      f.params.forEach((/** @type {any} */ p, /** @type {number} */ i) => {
        if (p.type === 'Identifier' && n.arguments[i])
          args.set(p.name, n.arguments[i]);
      });
      return {...fn, obj: fn.unwrap(returned), args};
    }
    return null;
  };
  /**
   * Where a value read from a file beside the theme is written
   * (`'--color-accent': brand`, `s.brand`, `all.brand`): that file and the
   * line of its value. Empty for any other value, or one read in another
   * file.
   * @param {any} node
   * @param {string | null} file the file the node is in (null for the source)
   * @returns {{file?: string, line?: number}}
   */
  const importedValueAt = (node, file) => {
    if (file != null) return {};
    const from = importedValue(node);
    const line = from?.obj?.loc?.start?.line;
    return from && line != null ? {file: from.file, line} : {};
  };
  /**
   * Where a property's value is written: its line in the file it is in, or,
   * for a parameter of an imported function (`make('nope')`), the argument
   * the theme file passes.
   * @param {any} p the property
   * @param {{file: string | null, args?: Map<string, any>}} at the file the property is in (null for the source)
   * @returns {{line: number | null, file?: string}}
   */
  const placeOf = (p, at) => {
    const arg =
      p.value?.type === 'Identifier' ? at.args?.get(p.value.name) : undefined;
    if (arg)
      return {
        line: arg.loc?.start?.line ?? null,
        ...importedValueAt(arg, null),
      };
    return {
      line: p.loc?.start?.line ?? null,
      ...(at.file ? {file: at.file} : {}),
      ...importedValueAt(p.value, at.file),
    };
  };
  // A theme the exported one extends that a file beside it defines
  // (`import {mid} from './mid'`): its call and each token its literal
  // tokens map sets, with that file.
  if (detail) {
    const here = new Set(
      detail.filter(e => e.kind === 'chain').map(e => e.theme),
    );
    // The theme file's local imports, and theirs in turn (a theme two
    // extends up, in a file a parent's file imports), each read once.
    /** @param {any} program @param {string} fromDir */
    const importsOf = (program, fromDir) =>
      program.body
        .filter((/** @type {any} */ st) => st.type === 'ImportDeclaration')
        .map((/** @type {any} */ st) => String(st.source?.value ?? ''))
        .filter((/** @type {string} */ from) => from.startsWith('.'))
        .map((/** @type {string} */ from) => localModuleFile(fromDir, from))
        .filter(
          (/** @type {string | null | undefined} */ file) =>
            file && !file.endsWith('.json'),
        );
    const queue = importsOf(ast.program, dir);
    const read = new Set([source.file]);
    while (queue.length > 0) {
      const file = /** @type {string} */ (queue.shift());
      if (read.has(file) || read.size > 50) continue;
      read.add(file);
      /** @type {any} */
      let other;
      try {
        other = parseModule(fs.readFileSync(file, 'utf8'), {
          sourceType: 'module',
          plugins: ['typescript'],
        });
      } catch {
        continue;
      }
      queue.push(...importsOf(other.program, path.dirname(file)));
      /** @param {any} node */
      const each = node => {
        if (!node || typeof node !== 'object') return;
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'defineTheme' &&
          node.arguments?.[0]?.type === 'ObjectExpression'
        ) {
          const obj = node.arguments[0];
          /** @param {string} key */
          const prop = key =>
            obj.properties.find(
              (/** @type {any} */ p) =>
                p.type === 'ObjectProperty' &&
                !p.computed &&
                keyOf(p.key) === key,
            );
          const theme = textOf(prop('name')?.value);
          if (theme && !here.has(theme)) {
            here.add(theme);
            detail.push({
              token: null,
              key: theme,
              kind: 'chain',
              theme,
              file,
              line: node.loc?.start?.line ?? null,
            });
            const map = prop('tokens')?.value;
            for (const p of map?.type === 'ObjectExpression'
              ? map.properties
              : []) {
              const k = p.type === 'ObjectProperty' ? keyOf(p.key) : null;
              if (k?.startsWith('--'))
                detail.push({
                  token: k,
                  key: k,
                  kind: 'chain',
                  theme,
                  file,
                  line: p.loc?.start?.line ?? null,
                });
            }
          }
        }
        for (const [k, v] of Object.entries(node)) {
          if (k === 'loc') continue;
          if (Array.isArray(v)) v.forEach(each);
          else if (v && typeof v === 'object' && v.type) each(v);
        }
      };
      each(other.program);
    }
  }
  const def = unwrap(chosen.call.arguments[0]);
  if (def?.type !== 'ObjectExpression') return out;
  // Each field the theme gives defineTheme, with its line, so a field
  // defineTheme does not take is named where it is written.
  if (detail)
    for (const p of def.properties) {
      const k =
        p.type === 'ObjectProperty' && !p.computed ? keyOf(p.key) : null;
      if (k)
        detail.push({
          token: null,
          key: k,
          kind: 'field',
          scope: '',
          line: p.loc?.start?.line ?? null,
        });
    }
  // JavaScript keeps the last of two `tokens` keys: that one is read, and
  // both are named.
  const tokensProps = def.properties.filter(
    (/** @type {any} */ p) =>
      p.type === 'ObjectProperty' && !p.computed && keyOf(p.key) === 'tokens',
  );
  if (detail && tokensProps.length > 1)
    detail.push({
      token: null,
      key: 'tokens',
      kind: 'duplicate',
      line: tokensProps[0].loc?.start?.line ?? null,
      lines: tokensProps.map((/** @type {any} */ p) => p.loc?.start?.line),
    });
  // Tokens a scope sets (a part's blocks in `components`, `onDark`,
  // `onLight`, an adaptation rule), each with its scope path and line.
  if (detail)
    for (const p of def.properties) {
      const scope =
        p.type === 'ObjectProperty' && !p.computed ? keyOf(p.key) : null;
      if (
        !scope ||
        ![
          'components',
          'onDark',
          'onLight',
          'adaptations',
          'localTokens',
        ].includes(scope)
      )
        continue;
      detail.push({
        token: null,
        key: scope,
        kind: 'scope',
        line: p.loc?.start?.line ?? null,
      });
      /**
       * A value as a block: one read from a file beside the theme
       * (`components: parts`, `parts.button`) is read in that file, so its
       * keys and lines are its own.
       * @param {any} node
       * @param {{file: string | null, unwrap: (n: any) => any, args?: Map<string, any>}} src the file the node is in (null for the source)
       * @returns {{obj: any, src: {file: string | null, unwrap: (n: any) => any, args?: Map<string, any>}}}
       */
      const blockOf = (node, src) => {
        const from = src.file == null ? importedValue(node) : null;
        if (from) return {obj: from.obj, src: from};
        let obj = src.unwrap(node);
        // A member of a block the file itself binds (`parts.button`).
        if (obj?.type === 'MemberExpression' && !obj.computed) {
          const readKey = obj.property?.name;
          const base = src.unwrap(obj.object);
          const prop =
            base?.type === 'ObjectExpression'
              ? base.properties.find(
                  (/** @type {any} */ p) =>
                    p.type === 'ObjectProperty' && keyOf(p.key) === readKey,
                )
              : null;
          obj = prop ? src.unwrap(prop.value) : null;
        }
        return {obj, src};
      };
      /**
       * @param {any} node
       * @param {string[]} at
       * @param {number} depth
       * @param {{file: string | null, unwrap: (n: any) => any, args?: Map<string, any>}} [from] the file the node is in (null for the source)
       */
      const walk = (node, at, depth, from = {file: null, unwrap}) => {
        if (depth > 12) return;
        const {obj, src} = blockOf(node, from);
        /** The file a read entry is in, when not the source. */
        const inFile = src.file ? {file: src.file} : {};
        if (obj?.type === 'ArrayExpression') {
          obj.elements.forEach(
            (/** @type {any} */ el, /** @type {number} */ i) =>
              walk(el, [...at, String(i)], depth + 1, src),
          );
          return;
        }
        if (obj?.type !== 'ObjectExpression') return;
        for (const q of obj.properties) {
          if (q.type !== 'ObjectProperty') continue;
          const k = q.computed ? textOf(src.unwrap(q.key)) : keyOf(q.key);
          if (!k) continue;
          const leaf = blockOf(q.value, src).obj;
          // A token, or a part's property (its value no block), by its
          // scope path and line.
          if (
            k.startsWith('--') ||
            (leaf?.type !== 'ObjectExpression' &&
              leaf?.type !== 'ArrayExpression')
          )
            detail.push({
              token: k,
              key: k,
              kind: 'scoped',
              scope: at.join('.'),
              ...placeOf(q, src),
            });
          else {
            // A block's own key (a style key, a pseudo-class, onDark's
            // tokens), by its scope path and line.
            detail.push({
              token: null,
              key: k,
              kind: 'key',
              scope: at.join('.'),
              line: q.loc?.start?.line ?? null,
              ...inFile,
            });
            walk(q.value, [...at, k], depth + 1, src);
          }
        }
      };
      walk(p.value, [scope], 0);
    }
  // The typography fields, as written, for their own checks.
  const typo = def.properties.find(
    (/** @type {any} */ p) =>
      p.type === 'ObjectProperty' &&
      !p.computed &&
      keyOf(p.key) === 'typography',
  );
  if (detail && typo) {
    /**
     * A block of typography fields. One read from a file beside the theme
     * (`typography: brandType`) is read in that file, so its lines are its
     * own.
     * @param {any} node
     * @param {string[]} at
     * @param {{file: string | null, unwrap: (n: any) => any}} [inFile] the file the node is in (null for the source)
     */
    const walk = (node, at, inFile = {file: null, unwrap}) => {
      const from = inFile.file == null ? importedValue(node) : null;
      const src = from ?? inFile;
      const obj = from ? from.obj : src.unwrap(node);
      const file = src.file ? {file: src.file} : {};
      if (obj?.type !== 'ObjectExpression') return;
      for (const p of obj.properties) {
        if (p.type !== 'ObjectProperty' || p.computed) continue;
        const k = keyOf(p.key);
        if (!k) continue;
        const inner = src.file == null ? importedValue(p.value) : null;
        const v = inner ? inner.obj : src.unwrap(p.value);
        if (v?.type === 'ObjectExpression') {
          detail.push({
            token: null,
            key: [...at, k].join('.'),
            kind: 'typography',
            line: p.loc?.start?.line ?? null,
            ...file,
            block: true,
          });
          walk(p.value, [...at, k], src);
        } else
          detail.push({
            token: null,
            key: [...at, k].join('.'),
            kind: 'typography',
            line: p.loc?.start?.line ?? null,
            ...file,
            ...importedValueAt(p.value, src.file),
            expression:
              textOf(v) == null &&
              v?.type !== 'NumericLiteral' &&
              !(
                v?.type === 'UnaryExpression' &&
                v.argument?.type === 'NumericLiteral'
              ),
            value:
              textOf(v) ??
              (v?.type === 'NumericLiteral'
                ? v.value
                : v?.type === 'UnaryExpression' &&
                    v.operator === '-' &&
                    v.argument?.type === 'NumericLiteral'
                  ? -v.argument.value
                  : undefined),
          });
      }
    };
    walk(typo.value, []);
  }
  const tokensProp = tokensProps[tokensProps.length - 1];
  if (!tokensProp) return out;
  let unresolved = false;
  /**
   * @param {any} node
   * @param {number} depth
   * @param {{code: string, file: string | null, unwrap: (n: any) => any, args?: Map<string, any>}} [at]
   *   the file the node is in (null for the theme file)
   */
  const collect = (node, depth, at = {code, file: null, unwrap}) => {
    const obj = at.unwrap(node);
    // A value read from a file beside the theme: read in that file, so its
    // values and lines are its own; the build still judges the result.
    const from = at.file != null ? null : importedValue(obj);
    if (from) {
      unresolved = true;
      collect(from.obj, depth + 1, from);
      return;
    }
    if (obj?.type !== 'ObjectExpression' || depth > 20) {
      unresolved = true;
      return;
    }
    // Spreads and keys merge in order: a later one wins. A computed key
    // that is text (`['--radius-page']`) is read like a literal one.
    for (const p of obj.properties) {
      if (p.type === 'SpreadElement') collect(p.argument, depth + 1, at);
      else if (p.type === 'ObjectProperty') {
        const k = p.computed ? textOf(at.unwrap(p.key)) : keyOf(p.key);
        if (k?.startsWith('--')) out.set(k, builtText(at.unwrap(p.value)));
        else if (p.computed) unresolved = true;
        if (detail && (k || p.computed))
          detail.push({
            token: k?.startsWith('--') ? k : null,
            key: at.code.slice(p.key.start, p.key.end),
            ...placeOf(p, at),
            // A key that is no token name (`color`): the build writes it
            // as a declaration on the theme's root.
            ...(k && !k.startsWith('--') ? {notToken: true} : {}),
            ...valueShape(at.unwrap(p.value), at.unwrap),
          });
      } else unresolved = true;
    }
  };
  /**
   * A token's value as the build writes it, when the file gives it as
   * text: a [light, dark] pair of two texts is its light-dark(); else
   * null.
   * @param {any} node
   * @returns {string | null}
   */
  const builtText = node => {
    const halves =
      node?.type === 'ArrayExpression' && node.elements.length === 2
        ? node.elements.map((/** @type {any} */ e) => textOf(unwrap(e)))
        : null;
    return halves && halves.every((/** @type {any} */ h) => h != null)
      ? `light-dark(${halves.join(', ')})`
      : textOf(node);
  };
  /**
   * What a token's value is, as written: text, a number, a [light, dark]
   * pair (each half's text, a number, or undefined), or something else.
   * @param {any} node
   * @param {(n: any) => any} [unwrapIn] how the node's file reads a name
   * @returns {Pick<OwnTokenEntry, 'kind' | 'value' | 'halves'>}
   */
  const valueShape = (node, unwrapIn = unwrap) => {
    const t = textOf(node);
    if (t != null) return {kind: 'text', value: t};
    if (node?.type === 'NumericLiteral')
      return {kind: 'number', value: node.value};
    if (node?.type === 'ArrayExpression')
      return {
        kind: 'pair',
        halves: node.elements.map((/** @type {any} */ e) => {
          const h = unwrapIn(e);
          return (
            textOf(h) ?? (h?.type === 'NumericLiteral' ? h.value : undefined)
          );
        }),
      };
    if (node?.type === 'ObjectExpression')
      return {
        kind: 'object',
        value: Object.fromEntries(
          node.properties
            .filter((/** @type {any} */ p) => p.type === 'ObjectProperty')
            .map((/** @type {any} */ p) => [
              keyOf(p.key) ?? '?',
              textOf(unwrap(p.value)) ?? null,
            ]),
        ),
      };
    return {kind: 'other'};
  };
  collect(tokensProp.value, 0);
  // Only the last entry for a token is what the build writes: an earlier
  // one a later key or spread overrides is marked, never judged.
  if (detail) {
    /** @type {Map<string, number>} */
    const last = new Map();
    /** A page token's entry, from the tokens map the build reads. @param {OwnTokenEntry} e */
    const page = e => e.token && e.kind !== 'scoped' && e.kind !== 'chain';
    detail.forEach((e, i) => {
      if (page(e)) last.set(/** @type {string} */ (e.token), i);
    });
    detail.forEach((e, i) => {
      if (page(e) && last.get(/** @type {string} */ (e.token)) !== i)
        e.overridden = true;
    });
  }
  // A value no read of the file can resolve (a call, an import) is read
  // from the build (ownTokens), and checked again after the next one.
  if (detail && unresolved)
    detail.push({
      token: null,
      key: 'tokens',
      kind: 'unresolved',
      line: tokensProp.loc?.start?.line ?? null,
    });
  return out;
}

/**
 * The var() loops among a theme's built top-level tokens, each with a key
 * that names it whatever token it starts from.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Array<{key: string, path: string[], part?: string}>}
 */
function builtLoops(cwd, slug) {
  const tokens = builtTopTokens(cwd, slug);
  /** @param {string} t */
  const refs = t =>
    [...String(tokens.get(t) ?? '').matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map(
      m => m[1],
    );
  /** @type {Array<{key: string, path: string[], part?: string}>} */
  const loops = [];
  const seen = new Set();
  for (const start of tokens.keys()) {
    /** @type {string[]} */
    const path = [];
    /** @param {string} t @returns {boolean} */
    const walk = t => {
      const at = path.indexOf(t);
      if (at >= 0) {
        const cycle = path.slice(at);
        const key = [...cycle].sort().join(' ');
        if (!seen.has(key)) {
          seen.add(key);
          loops.push({key, path: [...cycle, t]});
        }
        return true;
      }
      if (!tokens.has(t) || path.length > 50) return false;
      path.push(t);
      for (const r of refs(t)) if (walk(r)) return true;
      path.pop();
      return false;
    };
    walk(start);
  }
  // Inside one part: a part's own token reads the part's other own tokens
  // first, and a whole-theme one only as already resolved, so a loop there
  // closes among the part's own tokens.
  const js = themeFiles(cwd, slug).js;
  for (const part of blockKeys(js, ['components'])) {
    const plain = blockOf(js, ['components', part, 'base']);
    // Each state or variant rule of the part also has its plain rule.
    for (const scope of blockKeys(js, ['components', part])) {
      const own =
        scope === 'base' ? plain : blockOf(js, ['components', part, scope]);
      const block = new Map([...plain, ...own]);
      const where = scope === 'base' ? part : `${part} ${scope}`;
      for (const start of own.keys()) {
        if (!start.startsWith('--')) continue;
        /** @type {string[]} */
        const path = [];
        /** @param {string} t @returns {boolean} */
        const walk = t => {
          const at = path.indexOf(t);
          if (at >= 0) {
            const cycle = path.slice(at);
            const key = `${where}: ${[...cycle].sort().join(' ')}`;
            if (!seen.has(key)) {
              seen.add(key);
              loops.push({key, path: [...cycle, t], part: where});
            }
            return true;
          }
          if (!block.has(t) || path.length > 50) return false;
          path.push(t);
          for (const m of String(block.get(t) ?? '').matchAll(
            /var\(\s*(--[a-z0-9-]+)/gi,
          ))
            if (walk(m[1])) return true;
          path.pop();
          return false;
        };
        walk(start);
      }
    }
  }
  return loops;
}

/**
 * The keys of one object in a built theme module (see blockOf).
 * @param {string} file
 * @param {string[]} keys
 * @returns {string[]}
 */
function blockKeys(file, keys) {
  return [...blockOf(file, keys).keys()];
}

/**
 * The top-level tokens of a theme's built module (<slug>.js), which the
 * build wrote as plain data, or an empty map.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Map<string, string | null>}
 */
function builtTopTokens(cwd, slug) {
  return topTokensOf(themeFiles(cwd, slug).js);
}

/**
 * The base rule block of a part that a census rule (its attributes,
 * `variant=neutral,size=md`) falls under, most specific first: `base`, or a
 * block keyed by conditions (`variant:neutral`) every one of which the rule
 * has. Null when the base sets none.
 * @param {Record<string, any> | undefined} blocks the base's blocks for the part
 * @param {string} rule
 * @returns {{key: string, block: Record<string, any>}[]}
 */
export function baseBlocksFor(blocks, rule) {
  const attrs = rule.split(',').filter(Boolean);
  return Object.entries(blocks ?? {})
    .filter(([k, b]) => {
      if (!b || typeof b !== 'object') return false;
      if (k === 'base') return true;
      const pairs = k.split(',');
      return pairs.every(
        pr =>
          /^[a-z]+:[\w-]+$/.test(pr) && attrs.includes(pr.replace(':', '=')),
      );
    })
    .sort(([a], [b]) =>
      a === 'base'
        ? 1
        : b === 'base'
          ? -1
          : b.split(',').length - a.split(',').length,
    )
    .map(([key, block]) => ({key, block}));
}

/**
 * Where a base theme draws a property a token feeds in Core with something
 * else: each part and condition at rest under which Core reads the token for
 * a property but the base theme's own rule for the part sets that property
 * to another value (neutral's neutral badge fills with
 * --color-background-gray, not --color-neutral), with the base's value. The
 * token never reaches those.
 * @param {any} C the part data
 * @param {any} base the base theme, with its part blocks (`components`)
 * @param {string} token
 * @returns {Array<{part: string, when: string | null, prop: string, value: string}>}
 */
export function baseRedraws(C, base, token) {
  /** @type {Map<string, {part: string, when: string | null, prop: string, value: string}>} */
  const out = new Map();
  const blocks = base?.components ?? {};
  for (const [part, rec] of Object.entries(C?.MAP ?? {})) {
    if (!blocks[part]) continue;
    for (const [prop, at] of Object.entries(
      /** @type {Record<string, Record<string, unknown>>} */ (
        /** @type {any} */ (rec)?.at ?? {}
      ),
    ))
      for (const [k, v] of Object.entries(at)) {
        const [rule, cond = ''] = k.split(' ');
        if (cond || !String(v).includes(`var(${token})`)) continue;
        const camel = prop.replace(/-([a-z])/g, (_m, x) => x.toUpperCase());
        const hit = baseBlocksFor(blocks[part], rule).find(
          ({block}) => typeof block[camel] === 'string',
        );
        if (!hit || String(hit.block[camel]).includes(`var(${token})`))
          continue;
        const when = hit.key === 'base' ? null : hit.key;
        out.set(`${part}|${when}|${prop}`, {
          part,
          when,
          prop,
          value: String(hit.block[camel]),
        });
      }
  }
  return [...out.values()];
}

/**
 * The tokens a base theme's own component rules for a part read through
 * var() (neutral's progress-bar reads --color-border-emphasized), from its
 * built module; an empty set when it is not installed.
 * @param {string} cwd
 * @param {string | null | undefined} like
 * @param {string} target
 * @returns {Set<string>}
 */
export function baseComponentReads(cwd, like, target) {
  /** @type {Set<string>} */
  const out = new Set();
  const file = like ? baseModule(cwd, like) : null;
  if (!file) return out;
  try {
    const ast = /** @type {any} */ (
      parseModule(fs.readFileSync(file, 'utf8'), {sourceType: 'module'})
    );
    /** @param {any} node */
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'ObjectProperty' &&
        (node.key?.name ?? node.key?.value) === 'components' &&
        node.value?.type === 'ObjectExpression'
      ) {
        const part = node.value.properties.find(
          (/** @type {any} */ p) => (p.key?.value ?? p.key?.name) === target,
        );
        if (part) {
          const text = JSON.stringify(part.value);
          for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)/gi))
            out.add(m[1]);
        }
        return;
      }
      for (const v of Object.values(node))
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object' && v.type) visit(v);
    };
    visit(ast.program);
  } catch {
    // Not one this reads.
  }
  return out;
}

/**
 * The top-level tokens a base theme's built module gives (what the
 * editor's settings extend), or an empty map when it is not installed.
 * @param {string} cwd
 * @param {string | null | undefined} like
 * @returns {Map<string, string | null>}
 */
export function baseTopTokens(cwd, like) {
  const file = like ? baseModule(cwd, like) : null;
  return file ? topTokensOf(file) : new Map();
}

/**
 * The top-level tokens of a built theme module (plain data the build
 * wrote), or an empty map.
 * @param {string} file
 * @returns {Map<string, string | null>}
 */
function topTokensOf(file) {
  /** @type {Map<string, string | null>} */
  const out = new Map();
  for (const [k, v] of blockOf(file, ['tokens']))
    if (k.startsWith('--')) out.set(k, v);
  return out;
}

/**
 * One block of a built theme module (plain data the build wrote), by its
 * path from the theme object (`['tokens']`, `['components', 'card',
 * 'base']`): every key with its text value, a [light, dark] pair as the
 * build writes it, else null. An empty map when it is not there.
 * @param {string} file
 * @param {string[]} keys
 * @returns {Map<string, string | null>}
 */
function blockOf(file, keys) {
  /** @type {Map<string, string | null>} */
  const out = new Map();
  try {
    const ast = /** @type {any} */ (
      parseModule(fs.readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: ['typescript'],
      })
    );
    for (const st of ast.program.body) {
      const decl = st.declaration?.declarations?.[0];
      /** @type {any} */
      let obj = decl?.init;
      // The generated settings module: defineTheme({...}).
      if (obj?.type === 'CallExpression') obj = obj.arguments?.[0];
      for (const key of keys)
        obj =
          obj?.type === 'ObjectExpression'
            ? obj.properties.find(
                (/** @type {any} */ p) => (p.key?.name ?? p.key?.value) === key,
              )?.value
            : undefined;
      if (obj?.type !== 'ObjectExpression') continue;
      for (const p of obj.properties) {
        const k = p.key?.value ?? p.key?.name;
        if (typeof k === 'string')
          out.set(
            k,
            p.value?.type === 'StringLiteral'
              ? p.value.value
              : // A [light, dark] pair, as the build writes it.
                p.value?.type === 'ArrayExpression' &&
                  p.value.elements.length === 2 &&
                  p.value.elements.every(
                    (/** @type {any} */ e) => e?.type === 'StringLiteral',
                  )
                ? `light-dark(${p.value.elements.map((/** @type {any} */ e) => e.value).join(', ')})`
                : null,
          );
      }
      if (out.size) break;
    }
  } catch {
    // No build yet, or not one this reads.
  }
  return out;
}

/**
 * What a part's plain rule (its `base` block) holds in the theme as built
 * (the base theme's, the settings' and the own source's together), else in
 * the base theme alone when there is no build: tokens and properties by
 * name. Kebab-case property names, as the editor names them.
 * @param {string} cwd
 * @param {string} slug
 * @param {string | null | undefined} like
 * @param {string} part
 * @returns {Map<string, string | null>}
 */
export function partRuleTokens(cwd, slug, like, part) {
  const built = blockOf(themeFiles(cwd, slug).js, ['components', part, 'base']);
  const baseFile = like ? baseModule(cwd, like) : null;
  const base = baseFile
    ? blockOf(baseFile, ['components', part, 'base'])
    : new Map();
  /** @type {Map<string, string | null>} */
  const out = new Map();
  for (const m of [base, built])
    for (const [k, v] of m)
      out.set(
        k.startsWith('--')
          ? k
          : k.replace(
              /[A-Z]/g,
              (/** @type {string} */ c) => `-${c.toLowerCase()}`,
            ),
        v,
      );
  return out;
}

/**
 * The tokens and properties a theme's own source sets on a part's plain
 * rule, read from the build as ownTokens reads page-wide ones: what the
 * built rule holds that the settings module and the base theme do not give
 * as they are, and that the person's files name.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} part
 * @param {string} [scope] the rule: `base` (the plain one), or a variant
 *   such as `variant:primary`
 * @param {string | null} [state] a state block inside that rule (`:hover`)
 * @returns {Map<string, string | null>}
 */
export function ownPartTokens(cwd, slug, part, scope = 'base', state = null) {
  const at = ['components', part, scope, ...(state ? [state] : [])];
  /** @type {Map<string, string | null>} */
  const out = new Map();
  const f = themeFiles(cwd, slug);
  /** @type {string} */
  let module;
  try {
    module = fs.readFileSync(f.settingsTs, 'utf8');
  } catch {
    return out;
  }
  const stamp = /\/\/ Built with \S+\.theme\.ts ([0-9a-f]{16})\./.exec(
    module,
  )?.[1];
  /** @param {string} k */
  const css = k =>
    k.startsWith('--')
      ? k
      : k.replace(/[A-Z]/g, (/** @type {string} */ c) => `-${c.toLowerCase()}`);
  // With no build made from the source as it is now (an edit since the last
  // build), the file is read as written, as ownTokens reads page tokens.
  if (!stamp || stamp !== themeSourceHash(cwd, slug)) {
    for (const [k, v] of blockOf(f.ts, at)) out.set(css(k), v);
    return out;
  }
  const like = /\/\/ Built on @astryxdesign\/theme-([a-z0-9-]+) /.exec(
    module,
  )?.[1];
  const baseFile = like ? baseModule(cwd, like) : null;
  const base = baseFile ? blockOf(baseFile, at) : new Map();
  const settings = blockOf(f.settingsTs, at);
  const named = namedInOwnSource(cwd, slug);
  for (const [k, v] of blockOf(f.js, at)) {
    const given = settings.has(k) ? settings.get(k) : base.get(k);
    if (given !== v && named(k)) out.set(css(k), v);
  }
  return out;
}

/**
 * The page-wide tokens the theme's own source sets, read from what the
 * build made of it: the built module's top-level tokens that the
 * generated settings module does not give as they are (the own source wins
 * over the settings it extends). The build evaluates the file, so any way
 * of writing it counts (a namespace import, a renamed defineTheme, a
 * template, a spread of a shared object). Only a build made from the
 * source as it is now is read; with none, the file is read as written.
 * Both are joined: a key either names is the source's.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Map<string, string | null>}
 */
function ownTokens(cwd, slug) {
  const out = new Map(ownPageTokens(cwd, slug));
  const fromBuild = builtOwnTokens(cwd, slug);
  if (fromBuild) for (const [k, v] of fromBuild) out.set(k, v);
  return out;
}

/**
 * The tokens the own source sets, as the current build shows them, or null
 * when there is no build made from the source as it is now.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Map<string, string | null> | null}
 */
function builtOwnTokens(cwd, slug) {
  const f = themeFiles(cwd, slug);
  /** @type {string} */
  let module;
  try {
    module = fs.readFileSync(f.settingsTs, 'utf8');
  } catch {
    return null;
  }
  const built = /\/\/ Built with \S+\.theme\.ts ([0-9a-f]{16})\./.exec(
    module,
  )?.[1];
  if (!built || !fs.existsSync(f.js) || built !== themeSourceHash(cwd, slug))
    return null;
  // What the settings module gives each top-level token: a text value as
  // it is, a [light, dark] pair as a pair.
  /** @type {Map<string, string | 'pair' | 'other'>} */
  const settings = new Map();
  try {
    const ast = /** @type {any} */ (
      parseModule(module, {sourceType: 'module', plugins: ['typescript']})
    );
    /** @param {any} node */
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'CallExpression' &&
        node.callee?.name === 'defineTheme' &&
        node.arguments?.[0]?.type === 'ObjectExpression'
      ) {
        const tokens = node.arguments[0].properties.find(
          (/** @type {any} */ p) =>
            (p.key?.value ?? p.key?.name) === 'tokens' &&
            p.value?.type === 'ObjectExpression',
        );
        for (const p of tokens?.value.properties ?? []) {
          const k = p.key?.value ?? p.key?.name;
          if (typeof k !== 'string') continue;
          settings.set(
            k,
            p.value?.type === 'StringLiteral'
              ? p.value.value
              : p.value?.type === 'ArrayExpression'
                ? 'pair'
                : 'other',
          );
        }
        return;
      }
      for (const v of Object.values(node))
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object' && v.type) visit(v);
    };
    visit(ast.program);
  } catch {
    return null;
  }
  // What the base theme's built module gives: the tokens the settings
  // extend, which are no more the source's than the settings' are.
  const like = /\/\/ Built on @astryxdesign\/theme-([a-z0-9-]+) /.exec(
    module,
  )?.[1];
  const baseFile = like ? baseModule(cwd, like) : null;
  const base = baseFile ? topTokensOf(baseFile) : new Map();
  const named = namedInOwnSource(cwd, slug);
  /** @type {Map<string, string | null>} */
  const out = new Map();
  for (const [k, v] of builtTopTokens(cwd, slug)) {
    const given = settings.get(k);
    const own =
      given === undefined
        ? !base.has(k) || base.get(k) !== v
        : given === 'pair'
          ? !/^light-dark\(/.test(String(v ?? ''))
          : given !== 'other' && given !== v;
    if (own && named(k)) out.set(k, v);
  }
  return out;
}

/**
 * Whether a token or property name appears in the person's theme files: a
 * value the build shows that no file of theirs names came from the
 * settings (a dial's typography, a lifted value), not from them.
 * @param {string} cwd
 * @param {string} slug
 * @returns {(name: string) => boolean}
 */
function namedInOwnSource(cwd, slug) {
  const text = ownSourceFiles(cwd, slug)
    .map(file => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
  // A font set through `typography` (heading: {family: ...}) names its
  // role there, not the token the build writes for it.
  const typography = /\btypography\b/.test(text);
  return name =>
    text.includes(name) ||
    (typography &&
      (/^--font-family-([a-z]+)$/.exec(name)?.[1] ?? '') !== '' &&
      text.includes(
        /** @type {string[]} */ (/^--font-family-([a-z]+)$/.exec(name))[1],
      )) ||
    (typography &&
      /^--text-([a-z]+)-\d*-?weight$/.test(name) &&
      text.includes(
        /** @type {string[]} */ (/^--text-([a-z]+)/.exec(name))[1],
      ) &&
      /weight/.test(text)) ||
    // A property may be written camelCase (borderRadius).
    (!name.startsWith('--') &&
      text.includes(name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())));
}

/**
 * The page-wide tokens a theme's own source sets itself (see ownTokens):
 * they win over the settings it extends.
 * @param {string} cwd
 * @param {string} slug
 * @returns {string[]}
 */
export function ownSourceTokens(cwd, slug) {
  return [...ownTokens(cwd, slug).keys()];
}

/**
 * The values a theme's own source gives page-wide tokens as plain text, by
 * token (see ownTokens).
 * @param {string} cwd
 * @param {string} slug
 * @returns {Record<string, string>}
 */
export function ownSourceTokenValues(cwd, slug) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of ownTokens(cwd, slug)) if (v != null) out[k] = v;
  return out;
}

/**
 * A state name as the editor saves one: a part's own state as its census
 * names it (isPressed), a CSS state in its words (focus-visible), several
 * joined by +.
 */
const STATE_NAME = /^[a-z][a-zA-Z-]*(\+[a-z][a-zA-Z-]*)*$/;

/**
 * The state an entry was saved with, when the loader put it in its words
 * for the census half of the state reader (which names it in its note).
 * @type {WeakMap<object, string>}
 */
const SAVED_STATE = new WeakMap();

/**
 * What is wrong with where a setting applies, or null: names only, as
 * `set` takes them.
 * @param {any} s
 * @returns {string | null}
 */
function scopeProblem(s) {
  if (s.on != null && !/^[a-z][a-z0-9-]*$/.test(s.on))
    return `${s.thing} is set on "${s.on}", which is not a part or group name`;
  // (Several states at once are joined by +: `checked+disabled`.)
  if (s.state != null && !STATE_NAME.test(s.state))
    return `${s.thing} has state "${s.state}", which is not a state name`;
  // (Several, one per prop, are joined by +: `variant:ghost+size:sm`.)
  if (s.when != null && !/^[\w-]+:[\w.-]+(?:\+[\w-]+:[\w.-]+)*$/.test(s.when))
    return `${s.thing} has --when "${s.when}", which is not prop:value`;
  if ((s.when != null || s.state != null) && s.on == null)
    return `${s.thing} has a variant or state but no part`;
  return null;
}

/** The identity of a setting: a new one with the same identity replaces it. @param {Setting} s */
export const keyOf = s =>
  [
    s.thing,
    // A headings value saved with no axis is its weight half, as the build
    // reads it, so a set or undo of the weight replaces it. Only headings
    // has halves: an axis on any other setting names nothing.
    s.thing === 'headings' ? (s.axis ?? 'weight') : '',
    s.on ?? '',
    s.when ?? '',
    s.state ?? '',
    s.mode ?? '',
    s.only ? 'only' : '',
  ].join('|');

/** One line for a setting. @param {Setting} s */
export function describe(s) {
  // A setting for one mode on no part reaches the whole theme in that mode:
  // said in one phrase, never "(whole theme) [light only]", which reads as
  // two scopes at odds.
  const where = s.on
    ? ` on ${s.on}${s.only ? ' only' : ''}${s.when ? ` when ${s.when}` : ''}${s.state ? ` :${s.state}` : ''}`
    : s.mode
      ? ` (whole theme, ${s.mode} mode only)`
      : ' (whole theme)';
  // An entry saved with no value says so, never "undefined".
  const value = s.value === undefined ? '(no value)' : s.value;
  return `${s.thing} = ${value}${where}${s.mode && s.on ? ` [${s.mode} only]` : ''}`;
}

/**
 * The parts a setting styles: the group when `--on` names one, the whole
 * group of an always-alike member unless `--only`, else the one part.
 * @param {Ctx} ctx
 * @param {Pick<Setting, 'on' | 'only' | 'thing'>} s
 * @returns {string[]}
 */
export function partsOf(ctx, s) {
  if (!s.on) return [];
  if (s.thing === 'font') return [];
  const has = (/** @type {string} */ t) => ctx.project.target.has(t);
  // A border or a fill set on a group lands where each member draws its
  // edges or paints its box (a date and time field's two boxes, never the
  // row around them, which paints nothing).
  const spread = (/** @type {string[]} */ members) =>
    /^border(?!.*radius)(-|$)/.test(s.thing)
      ? [...new Set(members.flatMap(t => borderParts(ctx, t)))]
      : /^background(-color)?$/.test(s.thing)
        ? [...new Set(members.flatMap(t => fillParts(ctx, t)))]
        : members;
  if (FAMILIES[s.on]) return spread(FAMILIES[s.on].filter(has));
  const fam = familyOf(s.on);
  if (fam && AUTO_SPREAD.includes(fam) && !s.only)
    return spread(FAMILIES[fam].filter(has).filter(m => drawnAlike(ctx, s, m)));
  return [s.on];
}

/**
 * Whether a group member draws a property as the member named does, at
 * rest (the part data's values in each render, no state): a group styled
 * alike spreads a setting only where its members are alike in Core. A
 * radio is round where a checkbox has small corners, so a checkbox's
 * corners stay the checkbox's. Unknown either way counts as alike.
 * @param {Ctx} ctx
 * @param {Pick<Setting, 'on' | 'thing'>} s
 * @param {string} member
 * @returns {boolean}
 */
function drawnAlike(ctx, s, member) {
  if (member === s.on || !s.on) return true;
  const thing = String(s.thing ?? '');
  if (thing.startsWith('--')) return true;
  const prop = thing === 'corners' ? 'border-radius' : kebab(thing);
  /** @type {Record<string, any> | undefined} */
  const MAP = /** @type {any} */ (ctx).C?.MAP;
  /** @param {string} part */
  const rest = part => {
    const at = MAP?.[part]?.at?.[prop];
    if (!at) return null;
    const vals = Object.entries(at)
      .filter(([cond]) => !/:/.test(cond))
      .map(([, v]) => String(v).trim());
    return vals.length ? [...new Set(vals)].sort().join(' | ') : null;
  };
  const a = rest(s.on);
  const b = rest(member);
  return a == null || b == null || a === b;
}

/**
 * The parts that draw a part's border: the part itself, or, when it draws
 * none of its own and its edges are the borders of parts inside it (a date
 * and time field's date and time boxes), those parts.
 * @param {Ctx} ctx
 * @param {string} part
 * @returns {string[]}
 */
export function borderParts(ctx, part) {
  const own = ctx.C.MAP[part]?.own ?? {};
  if (Object.keys(own).some(k => /^border(?!.*radius)/.test(k))) return [part];
  const inner = cornerParts(ctx, part).filter(t => t !== part);
  return inner.length ? inner : [part];
}

/**
 * The parts that paint a part's box (a text input itself; a date and time
 * field's two boxes, where the row around them paints none).
 * @param {Ctx} ctx
 * @param {string} part
 * @returns {string[]}
 */
export function fillParts(ctx, part) {
  const own = ctx.C.MAP[part]?.own ?? {};
  if (own['background-color'] || own.background) return [part];
  const inner = cornerParts(ctx, part).filter(
    t =>
      t !== part &&
      (ctx.C.MAP[t]?.own?.['background-color'] ||
        ctx.C.MAP[t]?.own?.background),
  );
  return inner.length ? inner : [part];
}

export {modesOf};

/**
 * A corners value in the plain form the editor saves, typed or saved: a
 * rung in any case is that rung; a size in px or rem, any way a CSS number
 * is written, is that many px (a rem is 16px; 1000px and more is pill).
 * Null for any other value.
 * @param {string} v
 * @returns {string | null}
 */
export function cornersPlain(v) {
  const lower = String(v).trim().toLowerCase();
  if (CORNERS.some(([n]) => n === lower)) return lower;
  const px = /\d(px|rem)$/.test(lower) ? lengthPx(lower) : null;
  if (px == null || px < 0) return null;
  return px >= 1000 ? 'pill' : `${Math.round(px * 10000) / 10000}px`;
}

/**
 * A length in pixels: px as given, rem and em at 16px; null for anything
 * else (a percentage, calc(), a word).
 * @param {string} v
 * @returns {number | null}
 */
export function lengthPx(v) {
  // A CSS number: a sign, digits with or without a fraction, an exponent.
  const m =
    /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(px|rem|em)?\s*$/i.exec(
      String(v),
    );
  if (!m) return null;
  const n = Number(m[1]);
  return (m[2] ?? 'px').toLowerCase() === 'px' ? n : n * 16;
}

/** @param {string} v */
export const cornerPx = v =>
  CORNERS.find(([n]) => n === v)?.[1] ?? parseFloat(v);
/**
 * The base theme's body text size in px, read back from its built base
 * size (14 when it writes none).
 * @param {{light: Record<string, string>}} base
 */
export function baseTextPx(base) {
  const v = base?.light?.['--font-size-base'];
  return /^[\d.]+rem$/.test(v ?? '')
    ? Math.round(Number.parseFloat(String(v)) * 16)
    : 14;
}

/** @param {string} v */
export const textPx = v => TEXT_SIZE.find(([n]) => n === v)?.[1] ?? Number(v);

/**
 * The family and fallbacks a font value means: a preset, an open font, a
 * whole stack with commas, or one family name.
 * @param {string} value
 * @returns {{family: string, fallbacks: string, pkg: string | null}}
 */
export function fontOf(value) {
  const unquote = (/** @type {string} */ x) => x.replace(/^["']|["']$/g, '');
  if (FONTS[value])
    return {
      family: FONTS[value][0],
      fallbacks: FONTS[value][1],
      pkg: value === 'rounded' ? OPEN_FONTS.nunito.pkg : null,
    };
  if (OPEN_FONTS[value]) return {...OPEN_FONTS[value]};
  const v = value.trim();
  /** The package of an open font named by its family. @param {string} family */
  const pkgOf = family =>
    Object.values(OPEN_FONTS).find(
      f =>
        f.family.replace(/"/g, '').toLowerCase() ===
        family.replace(/["']/g, '').toLowerCase(),
    )?.pkg ?? null;
  /** Fallbacks without the family itself, so `system-ui` never repeats. @param {string} family @param {string[]} list */
  const without = (family, list) =>
    list
      .filter(x => unquote(x).toLowerCase() !== family.toLowerCase())
      .map(x => cssFamily(unquote(x), true))
      .join(', ');
  const parts = v
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  // Runs of spaces or tabs inside a family name are one space.
  const family = familySpaces(unquote(parts[0] ?? v)).trim();
  return {
    family: cssFamily(family),
    fallbacks:
      parts.length > 1
        ? without(family, parts.slice(1))
        : without(family, aloneFallbacks(family)),
    pkg: pkgOf(family),
  };
}

/**
 * The fallbacks a family typed alone gets, by the kind its name says, as
 * the open fonts get theirs: a monospace name (Mono, Code) monospace ones,
 * a serif name (but no sans) serif ones, any other sans-serif ones.
 * @param {string} family
 * @returns {string[]}
 */
function aloneFallbacks(family) {
  if (/\b(mono|code)\b/i.test(family)) return ['ui-monospace', 'monospace'];
  if (/serif/i.test(family) && !/sans/i.test(family))
    return ['Georgia', 'serif'];
  return ['system-ui', 'sans-serif'];
}

/**
 * Spacing in a font family name as CSS reads a bare name: every Unicode
 * space (a no-break space, a thin space, a tab) is one space, a run of them
 * one, and zero-width and format characters (zero-width space, joiners,
 * word joiner, byte-order mark) are dropped.
 * @param {string} v
 */
export function familySpaces(v) {
  return v
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g, ' ');
}

/**
 * A font family name as CSS reads it. A name that is a sequence of CSS
 * identifiers stays bare; any other is quoted, or the browser drops the
 * whole font (`3Dumb`, `My/Font`, `a.b`). Core quotes a family that has
 * a space itself, so such a name is quoted here only as a fallback
 * (`spaced`), where Core writes the list as given.
 * @param {string} name without quotes
 * @param {boolean} [spaced]
 */
export function cssFamily(name, spaced = false) {
  name = familySpaces(name);
  const words = name.trim().split(/\s+/);
  const ident = (/** @type {string} */ w) =>
    /^-?(?:[A-Za-z_]|[\u0080-\uffff])(?:[\w-]|[\u0080-\uffff])*$/.test(w) &&
    !w.startsWith('--');
  if (words.every(ident)) return name.trim();
  if (words.length > 1 && !spaced && !/["\\]/.test(name)) return name.trim();
  return `"${name.trim().replace(/["\\]/g, '\\$&')}"`;
}

/**
 * What a part reads for a property when the theme does not set it.
 * @param {Ctx} ctx
 * @param {string} target
 * @param {string} prop camelCase or kebab-case
 * @param {string | undefined} when
 * @param {string} [state] a state (hover): that state's own value
 */
function partDefault(ctx, target, prop, when, state) {
  const k = kebab(prop);
  const g = ctx.C.groupOfProp(k === 'background' ? 'background-color' : k);
  const want = (/** @type {import('./_compiler.mjs').Read} */ x) =>
    x.props.some(
      p => p === k || (k === 'background' && p === 'background-color'),
    );
  const reads = g ? ctx.C.partReads(target, g).filter(want) : [];
  const wv = when ? when.replace(':', '=') : null;
  // With a state, that state's own value (for the variant, if named);
  // when the state does not change this property, the plain value is what
  // shows in that state too.
  if (state) {
    const sr = reads.find(x =>
      x.when.some(w => w.includes(`:${state}`) && (!wv || w.includes(wv))),
    );
    if (sr) return `var(${sr.token})`;
  }
  const r =
    (wv && reads.find(x => x.when.some(w => w === wv))) ||
    reads.find(x => x.when.includes('')) ||
    reads.find(x => x.when.some(w => /=default\b/.test(w) && !/:/.test(w))) ||
    reads.find(x => x.when.every(w => !/:|selected/.test(w)));
  return r ? `var(${r.token})` : null;
}

/**
 * The variants (`variant:<name>`) of a part that each read their own value
 * of a color property (the button's background, a badge's text), in a
 * state when one is named and changes it: one rule's other-mode half would
 * give every one of them one variant's color. Empty when the part reads one
 * value for all.
 * @param {Ctx} ctx
 * @param {string} target
 * @param {string} prop camelCase or kebab-case
 * @param {string} [state]
 * @returns {string[]}
 */
function variantsReading(ctx, target, prop, state) {
  const k = kebab(prop);
  const g = ctx.C.groupOfProp(k === 'background' ? 'background-color' : k);
  if (!g) return [];
  const reads = ctx.C.partReads(target, g).filter(x =>
    x.props.some(
      p => p === k || (k === 'background' && p === 'background-color'),
    ),
  );
  const named = (/** @type {(w: string) => boolean} */ ok) => [
    ...new Set(
      reads
        .flatMap(x => x.when)
        .filter(ok)
        .map(w => /(?:^|,)variant=([\w-]+)/.exec(w)?.[1])
        .filter(Boolean)
        .map(n => `variant:${n}`),
    ),
  ];
  const inState = state ? named(w => w.includes(`:${state}`)) : [];
  if (inState.length) return inState;
  return reads.some(x => x.when.includes(''))
    ? []
    : named(w => /^variant=[\w-]+$/.test(w));
}

/** The line that records a generated module's own hash. */
const SEAL = /^\/\/ Module ([0-9a-f]{16})\.\n/m;

/**
 * A generated module with its own hash after its header, so a hand edit to
 * it is told from a module an earlier editor wrote (which has none).
 * @param {string} text
 */
function sealModule(text) {
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return text.replace(
    /^(\/\/ Built from settings [^\n]*\n)/m,
    `$1// Module ${hash}.\n`,
  );
}

/**
 * The staleness reason for an own source changed since the editor's build.
 * @param {string} slug
 */
export function sourceChangedReason(slug) {
  return `${slug}.theme.ts or a module it imports changed since the last build`;
}

/** The type tokens base themes set again for phones: families and weights. */
export const PHONE_TYPE = /^--font-family|^--(text-[a-z0-9-]+|font)-weight/;

/**
 * The tokens the theme's last build sets for touch screens (in its rules
 * for a coarse pointer), each with the last value it is given there.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Map<string, string>}
 */
export function builtTouchTokens(cwd, slug) {
  /** @type {Map<string, string>} */
  const out = new Map();
  try {
    postcss
      .parse(fs.readFileSync(themeFiles(cwd, slug).css, 'utf8'))
      .walkAtRules('media', rule => {
        if (!/pointer\s*:\s*coarse/i.test(rule.params)) return;
        rule.walkDecls(/^--/, decl => {
          out.set(decl.prop, decl.value);
        });
      });
  } catch {
    // Not built, or not readable: nothing known.
  }
  return out;
}

/**
 * The screens a base theme's type rule is for (touch screens below the
 * large breakpoint), as an adaptation rule's `when` writes them.
 */
export const PHONE_RULE_WHEN = {pointer: 'coarse', width: {below: 'lg'}};

/**
 * Record in an editor theme's generated settings that they were built with
 * its own source as it is now, after `compile` built that source (the
 * settings do not depend on what the source sets), only in a module as the
 * editor wrote it.
 * @param {string} cwd
 * @param {string} slug
 * @returns {boolean} whether it was recorded
 */
export function refreshSourceStamp(cwd, slug) {
  const f = themeFiles(cwd, slug);
  const ts = fs.readFileSync(f.settingsTs, 'utf8');
  if (moduleUnedited(ts) !== true) return false;
  const stamp = /\/\/ Built with (\S+\.theme\.ts) ([0-9a-f]{16})\./.exec(ts);
  if (!stamp) return false;
  const now = themeSourceHash(cwd, slug);
  if (stamp[2] === now) return true;
  const text = ts
    .replace(/\r\n/g, '\n')
    .replace(SEAL, '')
    .replace(stamp[0], `// Built with ${stamp[1]} ${now}.`);
  fs.writeFileSync(f.settingsTs, sealModule(text));
  return true;
}

/**
 * Whether a generated module is as the editor wrote it: true, false for a
 * hand edit, null for a module with no hash (an earlier editor's).
 * @param {string} text
 * @returns {boolean | null}
 */
export function moduleUnedited(text) {
  // A checkout that writes CRLF line endings changes no line.
  text = text.replace(/\r\n/g, '\n');
  const seal = SEAL.exec(text);
  if (!seal) return null;
  return (
    createHash('sha256')
      .update(text.replace(SEAL, ''))
      .digest('hex')
      .slice(0, 16) === seal[1]
  );
}

/**
 * The palette stops each token reads in a generated settings module, as
 * written there (`palette.accent.light[85]`, with ` + 'aa'` for a
 * see-through one): `[light, dark]` per token.
 * @param {string} source
 * @returns {Record<string, Record<'light' | 'dark', {family: string, stop: number, alpha?: string}>>}
 */
export function stopsIn(source) {
  /** @type {Record<string, Record<'light' | 'dark', {family: string, stop: number, alpha?: string}>>} */
  const out = {};
  const one = String.raw`palette(?:\.([a-z][\w]*)|\["([a-z][\w-]*)"\])\.(?:light|dark)\[(\d+(?:\.\d+)?)\](?: \+ '([0-9a-f]{2})')?`;
  const pair = new RegExp(
    String.raw`"(--[\w-]+)": \[\s*${one},\s*${one}\s*\]`,
    'g',
  );
  // Whether the module lifts secondary text on parts (an earlier editor
  // did not): the key cannot be a token's name.
  out['lifted parts'] = /** @type {any} */ (
    /"components":[\s\S]*"--color-text-secondary"/.test(source)
  );
  for (const m of source.matchAll(pair))
    out[m[1]] = {
      light: {
        family: m[2] ?? m[3],
        stop: Number(m[4]),
        ...(m[5] ? {alpha: m[5]} : {}),
      },
      dark: {
        family: m[6] ?? m[7],
        stop: Number(m[8]),
        ...(m[9] ? {alpha: m[9]} : {}),
      },
    };
  return out;
}

/**
 * The palette mapping with the shades a theme already shows kept, where
 * the palette still has them (see commitTheme).
 * @param {import('./_palette.mjs').PaletteMapping | null} pal
 * @param {ReturnType<typeof stopsIn> | null | undefined} kept
 * @returns {import('./_palette.mjs').PaletteMapping | null}
 */
function keepShades(pal, kept) {
  if (!pal || !kept) return pal;
  const tokens = {...pal.tokens};
  for (const [k, v] of Object.entries(tokens)) {
    if (k === 'lifted parts') continue;
    const old = kept[k];
    if (!old) continue;
    /** @type {any} */
    const next = {...v};
    for (const m of /** @type {const} */ (['light', 'dark'])) {
      const r = old[m];
      const color = /** @type {any} */ (pal.candidate.palette)[r.family]?.[m]?.[
        r.stop
      ];
      if (typeof color !== 'string') continue;
      next[m] = {
        stop: r.stop,
        color: r.alpha ? `${color}${r.alpha}` : color,
        ...(r.alpha ? {alpha: r.alpha} : {}),
        ...(r.family !== v.family ? {family: r.family} : {}),
      };
    }
    tokens[k] = next;
  }
  // A theme built without lifted text keeps the base theme's own.
  return {...pal, tokens, lift: kept['lifted parts'] ? pal.lift : null};
}

/**
 * A size in px: px, rem (16px each), or a calc() of those added and
 * subtracted; null for anything else.
 * @param {string} v
 * @param {Record<string, string>} [vars] values for the tokens a var() may name
 * @returns {number | null}
 */
export function sizePx(v, vars = {}) {
  let t = String(v).trim();
  // A token the dial or the theme gives a value (var(--spacing-12)),
  // through that value; a clamp() at its preferred value held to its
  // bounds, or its upper bound when the preferred one is no length;
  // min() and max() of the lengths they hold.
  const fn = /^(var|clamp|min|max)\((.*)\)$/is.exec(t);
  if (fn) {
    const args = splitTop(fn[2], ',').map(x => x.trim());
    if (fn[1].toLowerCase() === 'var') {
      const own = vars[args[0]];
      if (own != null) return sizePx(own, vars);
      return args[1] != null ? sizePx(args.slice(1).join(','), vars) : null;
    }
    const n = args.map(x => sizePx(x, vars));
    if (fn[1].toLowerCase() === 'clamp') {
      const [lo, mid, hi] = n;
      if (lo == null || hi == null) return null;
      return mid == null ? hi : Math.min(hi, Math.max(lo, mid));
    }
    const known = /** @type {number[]} */ (n.filter(x => x != null));
    if (!known.length) return null;
    return fn[1].toLowerCase() === 'min'
      ? Math.min(...known)
      : Math.max(...known);
  }
  const calc = /^calc\((.*)\)$/is.exec(t);
  if (calc) t = calc[1].trim();
  const terms =
    t.match(/[+-]?\s*[\d.]+(?:px|rem|em|pt|pc|in|cm|mm|q)\b|\S+/gi) ?? [];
  let sum = 0;
  let sign = 1;
  for (const raw of terms) {
    const x = raw.replace(/\s+/g, '');
    if (x === '+' || x === '-') {
      if (!calc) return null;
      sign = x === '-' ? -1 : 1;
      continue;
    }
    const m = /^([+-]?)([\d.]+)(px|rem|em|pt|pc|in|cm|mm|q)$/i.exec(x);
    if (!m || (!calc && terms.length > 1)) return null;
    // Absolute units by their fixed ratio to px; em and rem against the
    // 16px a control's text starts from.
    const n = parseFloat(m[2]) * (PX_PER[m[3].toLowerCase()] ?? 1);
    if (!Number.isFinite(n)) return null;
    sum += (m[1] === '-' ? -1 : 1) * sign * n;
    sign = 1;
  }
  return terms.length ? sum : null;
}

/** Pixels per unit of each length unit a kept size may be written in. */
const PX_PER = /** @type {Record<string, number>} */ ({
  px: 1,
  rem: 16,
  em: 16,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
});

/**
 * Spacing steps scaled with the spacing dial, kept in order around the
 * steps the theme keeps exact: each the plain scaled value unless it would
 * meet or pass a kept one; those are spread evenly between the kept one and
 * the nearest step that keeps its place. A step with no room below a kept
 * one takes the value of the one below it.
 * @param {Array<[string, number]>} steps token name and the base value, in px
 * @param {number} f the rung's factor
 * @param {Record<string, number>} kept exact steps the theme keeps, in px
 * @param {string[]} [noRoom] filled with the steps left no room
 * @returns {Array<[string, number]>} every step's new value in px, kept ones as kept
 */
export function spacingSteps(steps, f, kept, noRoom = []) {
  const px = [...steps].sort((a, b) => a[1] - b[1]);
  const n = px.map(([k, v]) => (k in kept ? kept[k] : v * f));
  const isKept = (/** @type {number} */ i) => px[i][0] in kept;
  px.forEach(([, base], k) => {
    if (!isKept(k)) return;
    // The steps below that would meet or pass it are spread evenly between
    // the last one that does not and it.
    let j0 = k;
    while (
      j0 > 0 &&
      !isKept(j0 - 1) &&
      n[j0 - 1] >= n[k] &&
      px[j0 - 1][1] < base
    )
      j0--;
    if (j0 < k) {
      const lo = j0 > 0 ? n[j0 - 1] : 0;
      if (lo >= n[k])
        for (let j = j0; j < k; j++) {
          n[j] = lo;
          noRoom.push(px[j][0]);
        }
      else
        for (let j = j0; j < k; j++)
          n[j] = lo + ((n[k] - lo) * (j - j0 + 1)) / (k - j0 + 1);
    }
    // The steps above that would meet or fall under it, likewise up to the
    // next one that does not (or above it by their own scaled steps).
    let j1 = k;
    while (
      j1 < n.length - 1 &&
      !isKept(j1 + 1) &&
      n[j1 + 1] <= n[k] &&
      px[j1 + 1][1] > base
    )
      j1++;
    if (j1 > k) {
      const hi = j1 < n.length - 1 ? n[j1 + 1] : null;
      for (let j = k + 1; j <= j1; j++)
        n[j] =
          hi == null
            ? n[k] + (px[j][1] - base) * f
            : n[k] + ((hi - n[k]) * (j - k)) / (j1 - k + 1);
    }
  });
  return px.map(([k], i) => [k, n[i]]);
}

/**
 * Control heights scaled with the spacing dial (a denser theme has shorter
 * controls), each kept distinct and in order: smallest to largest, a
 * control never under 24px (the smallest target a pointer can use
 * comfortably, unless the theme starts below it), each the plain scaled
 * value unless it would meet the one below, which then keeps its own step
 * scaled above it.
 * @param {Array<[string, string]>} sizes token name and the theme's value
 * @param {number} f the spacing rung's factor
 * @param {Record<string, number>} [kept] exact sizes the theme keeps, in px,
 *   which the others stay in order around
 * @param {string[]} [noRoom] filled with the sizes left no room between
 *   two kept ones (each then equals the one below it)
 * @returns {Array<[string, string]>} the tokens it writes, in px
 */
export function controlSizes(sizes, f, kept = {}, noRoom = []) {
  const px = sizes
    .filter(([, v]) => /^[\d.]+px$/.test(String(v).trim()))
    .map(([k, v]) => /** @type {[string, number]} */ ([k, parseFloat(v)]))
    .sort((a, b) => a[1] - b[1]);
  /** @type {number[]} */
  const n = px.map(([k, v]) =>
    k in kept ? kept[k] : Math.max(Math.min(24, v), Math.round(v * f)),
  );
  /** The step between two sizes, scaled. @param {number} i */
  const step = i => Math.max(1, Math.round((px[i][1] - px[i - 1][1]) * f));
  // Only a size that would meet (or pass) the one below moves, up; then one
  // that would meet a kept size above it moves down (a kept size stays).
  for (let i = 1; i < n.length; i++)
    if (!(px[i][0] in kept) && n[i] <= n[i - 1]) n[i] = n[i - 1] + step(i);
  for (let i = n.length - 2; i >= 0; i--)
    if (!(px[i][0] in kept) && n[i] >= n[i + 1]) n[i] = n[i + 1] - step(i + 1);
  // A size between two that cannot both move (kept, or one kept and the
  // other already at its place) sits halfway between them; with no room
  // between them it takes the smaller one's size, and the result says so.
  for (let i = 1; i < n.length - 1; i++)
    if (!(px[i][0] in kept) && (n[i] <= n[i - 1] || n[i] >= n[i + 1])) {
      const mid = Math.round(((n[i - 1] + n[i + 1]) / 2) * 2) / 2;
      if (mid > n[i - 1] && mid < n[i + 1]) n[i] = mid;
      else {
        n[i] = n[i - 1];
        noRoom.push(px[i][0]);
      }
    }
  return px
    .map(([k], i) => /** @type {[string, string]} */ ([k, `${n[i]}px`]))
    .filter(([k]) => !(k in kept));
}

/** The role each role-color dial sets, as Core's tokens and variants name it. */
const ROLE_OF_DIAL = /** @type {const} */ ({
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
});

/**
 * Where a role color the theme sets (a role dial, or a whole-theme role
 * token) must be written onto a part for it to show, because the base theme
 * draws that role there on its own:
 * - a variant named for the role in a color of the base's palette written
 *   out (butter's success badge, stone's success progress fill) points at
 *   the role's token, as Core draws that variant;
 * - a role token the base points at another token on a part (stone's
 *   success banner at its green) takes the theme's own value there
 *   (`value` null: the theme's token);
 * - a color the base gives a part as its own accent, written as the color
 *   itself (butter's nav links and outline buttons in its blue), points at
 *   the accent token.
 * Each comes once, and never where the theme sets that property on the
 * part itself. The compiler writes them; the missed list leaves them out.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {any} base the base theme resolved: its tokens per mode and its components
 * @returns {Array<{part: string, when: string | undefined, prop: string, value: string | null}>}
 */
export function roleReach(ctx, data, base) {
  /** @type {Set<string>} */
  const roles = new Set();
  for (const x of data.settings) {
    if (x.on || x.state || x.when) continue;
    if (x.source === 'dial' && x.thing in ROLE_OF_DIAL)
      roles.add(
        ROLE_OF_DIAL[/** @type {keyof typeof ROLE_OF_DIAL} */ (x.thing)],
      );
    const token =
      x.source === 'token' &&
      /^--color-(?:on-|text-|icon-)?(accent|info|success|warning|error)(?:-[\w-]+)?$/.exec(
        x.thing,
      )?.[1];
    if (token) roles.add(token);
  }
  /** @type {Array<{part: string, when: string | undefined, prop: string, value: string | null}>} */
  const out = [];
  if (!roles.size) return out;
  const modes = modesOf(data);
  /** A literal color in a mode: its half of light-dark(). @param {string} v @param {string} m */
  const literal = (v, m) => {
    const pair = /^light-dark\((.*)\)$/is.exec(String(v).trim());
    const halves = pair ? splitTop(pair[1], ',') : null;
    const x = (
      halves?.length === 2 ? halves[m === 'light' ? 0 : 1] : String(v)
    ).trim();
    return /^var\(/.test(x) ? null : parseColor(x);
  };
  const ACCENTS = [
    '--color-accent',
    '--color-text-accent',
    '--color-icon-accent',
  ];
  for (const [part, looks] of Object.entries(
    /** @type {Record<string, Record<string, any>>} */ (base?.components ?? {}),
  )) {
    if (!ctx.project.target.has(part)) continue;
    for (const [key, look] of Object.entries(looks ?? {})) {
      if (key !== 'base' && !/^[\w-]+:[\w-]+$/.test(key)) continue;
      if (!look || typeof look !== 'object') continue;
      const when = key === 'base' ? undefined : key;
      /** @param {string} prop */
      const owns = prop =>
        data.settings.some(
          x =>
            x.on &&
            !x.state &&
            (x.when ?? undefined) === when &&
            partsOf(ctx, x).includes(part) &&
            (x.thing === prop ||
              x.thing === kebab(prop) ||
              (prop === 'borderColor' && x.thing === 'border')),
        );
      /** @param {string} prop @param {string | null} value */
      const add = (prop, value) => {
        if (
          owns(prop) ||
          out.some(o => o.part === part && o.when === when && o.prop === prop)
        )
          return;
        out.push({part, when, prop, value});
      };
      const named = /^variant:(accent|info|success|warning|error)$/.exec(
        String(when ?? ''),
      )?.[1];
      if (named && roles.has(named))
        for (const [prop, side] of /** @type {const} */ ([
          ['backgroundColor', 'background'],
          ['color', 'text'],
        ])) {
          const v = look[prop];
          if (typeof v !== 'string' || /var\(/.test(v)) continue;
          if (!modes.every(m => literal(v, m) != null)) continue;
          const core = (ctx.C.partReads(part, side) ?? []).find(
            (/** @type {any} */ r) => r.when.includes(`variant=${named}`),
          )?.token;
          add(
            prop,
            `var(${core ?? (side === 'text' ? `--color-text-${named}` : `--color-${named}`)})`,
          );
        }
      for (const [prop, v] of Object.entries(look)) {
        const role =
          /^--color-(?:on-)?(accent|info|success|warning|error)(?:-[\w-]+)?$/.exec(
            prop,
          )?.[1];
        if (!role || !roles.has(role) || typeof v !== 'string') continue;
        const to = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v.trim())?.[1];
        if (to && to !== prop) add(prop, null);
      }
      if (roles.has('accent'))
        for (const [prop, token] of /** @type {const} */ ([
          ['color', '--color-text-accent'],
          ['backgroundColor', '--color-accent'],
          ['borderColor', '--color-accent'],
        ])) {
          const v = look[prop];
          if (typeof v !== 'string') continue;
          const isBaseAccent = modes.every(m => {
            const c = literal(v, m);
            return (
              c != null &&
              ACCENTS.some(a => {
                const b = parseColor(String(base?.[m]?.[a] ?? ''));
                return b != null && b.every((x, k) => x === c[k]);
              })
            );
          });
          if (isBaseAccent) add(prop, `var(${token})`);
        }
    }
  }
  return out;
}

/**
 * The settings, as a `defineTheme` object.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @returns {any}
 */
export function compileTheme(ctx, data, base) {
  ctx.sizeNotes = [];
  ctx.compileNotes = [];
  // A setting the editor no longer accepts never reaches the build; a
  // saved state is the part's own from here on (readSavedStates), so every
  // line made from the theme names it so.
  readSavedStates(ctx, data);
  data = {...data, settings: data.settings.filter(s => !valueProblem(s))};
  const TOKENS = ctx.project.core.tokenDefaults;
  // The base theme's type scale, read back from its sizes: base text, and
  // the ratio (2xl is three steps above base).
  const rem = (/** @type {string | undefined} */ v) =>
    /^[\d.]+rem$/.test(v ?? '') ? Number.parseFloat(String(v)) : null;
  const [b0, b3] = [
    rem(base.light['--font-size-base']),
    rem(base.light['--font-size-2xl']),
  ];
  const baseSize = baseTextPx(base);
  const baseRatio =
    b0 && b3 ? Math.round((b3 / b0) ** (1 / 3) * 100) / 100 : 1.2;
  /** @type {any} */
  const theme = {name: data.name, tokens: {}, components: {}};
  const modeOnly =
    data.mode === 'light-only'
      ? 'light'
      : data.mode === 'dark-only'
        ? 'dark'
        : null;
  /** The tokens the theme's own source sets, which win over the settings. */
  /** @type {Record<string, string> | null} */
  let ownTok = null;
  const ownTokenValues = () => {
    if (ownTok) return ownTok;
    try {
      ownTok = ownSourceTokenValues(ctx.project.cwd, data.name);
    } catch {
      ownTok = {};
    }
    return ownTok;
  };
  /**
   * The exact tokens kept where a dial writes (whole theme with no part):
   * the whole-theme settings', then the own source's, by name.
   * @param {string | null} t a part, for its own settings too
   * @returns {Map<string, string>}
   */
  const keptTokens = t => {
    /** @type {Map<string, string>} */
    const out = new Map();
    for (const x of data.settings)
      if (
        x.source === 'token' &&
        !x.when &&
        !x.state &&
        !(modeOnly && x.mode && x.mode !== modeOnly) &&
        (!x.on || (t != null && partsOf(ctx, x).includes(t)))
      )
        out.set(x.thing, String(x.value));
    for (const [k, v] of Object.entries(ownTokenValues())) out.set(k, v);
    return out;
  };
  /** @param {string | null} t */
  const keptSizes = t =>
    [...keptTokens(t)].filter(([k]) => /^--size-element-/.test(k));
  /** @type {Record<string, {light?: string, dark?: string}>} */
  const tok = {};
  /** @param {string} name @param {string | [string, string]} v @param {string} [mode] */
  const putTok = (name, v, mode) => {
    const t = (tok[name] ??= {});
    // A one-mode theme keeps both halves of a pair: its mode is the one the
    // app's <Theme> is given, and a region Core draws in the other mode
    // (a toast, a lightbox) still reads the other half.
    if (Array.isArray(v)) {
      if (!mode || mode === 'light') t.light = v[0];
      if (!mode || mode === 'dark') t.dark = v[1];
      return;
    }
    // A color set in a one-mode theme fills its mode's half only; the other
    // half keeps what it had (the base theme's), for the regions Core draws
    // in the other mode.
    const half = mode ?? modeOnly;
    // Only a color has a half per mode (light-dark() takes colors only): a
    // shadow or any other value in a one-mode theme is written whole.
    if (
      !MODAL.has(ctx.C.typeOf(name)) ||
      !half ||
      (!mode && !parseColor(String(v).trim()))
    ) {
      t.light = v;
      t.dark = v;
      return;
    }
    t[/** @type {'light' | 'dark'} */ (half)] = v;
  };
  /** @param {Setting} s @param {string} target @returns {Record<string, any>} */
  const block = (s, target) => {
    const t = (theme.components[target] ??= {});
    const {key, pseudo} = stateSlot(
      ctx.project.target.get(target)?.states ?? [],
      s.state,
      s.when,
      wrapsOneControl(ctx, target),
      ctx.project.target.get(target)?.stateValues,
    );
    const b = (t[key] ??= {});
    return pseudo ? (b[pseudo] ??= {}) : b;
  };
  /**
   * A setting's rule block for one color mode: the style key's `@light` or
   * `@dark` block, with the state inside it for a state Core writes as a
   * pseudo-class.
   * @param {Setting} s @param {string} target @param {'light' | 'dark'} mode
   * @returns {Record<string, any>}
   */
  const modeBlock = (s, target, mode) => {
    const t = (theme.components[target] ??= {});
    const {key, pseudo} = stateSlot(
      ctx.project.target.get(target)?.states ?? [],
      s.state,
      s.when,
      wrapsOneControl(ctx, target),
      ctx.project.target.get(target)?.stateValues,
    );
    const rule = (t[key] ??= {});
    const mb = (rule[`@${mode}`] ??= {});
    return pseudo ? (mb[pseudo] ??= {}) : mb;
  };
  /**
   * A padding on a part whose padding Core writes one variable per side
   * (its derivedVarRegistry's container expansion), as each side's value,
   * split at top-level spaces by the CSS shorthand rules: Core splits a
   * shorthand at every space, which cuts calc(4px + 2px) and loses a
   * fourth value. On the part itself the sides go as logical longhands,
   * which Core carries as they are; for a variant or state they go to the
   * side variables themselves, since Core writes one variable for equal
   * sides there and the part's own side variables would win over it.
   * Null for any other property or part.
   * @param {string} target @param {Setting} s
   * @returns {Record<string, string> | null}
   */
  const containerSides = (target, s) => {
    const prop = kebab(s.thing);
    if (
      s.mode ||
      !/^padding(-block|-inline|-left|-right|-top|-bottom|-block-start|-block-end|-inline-start|-inline-end)?$/.test(
        prop,
      )
    )
      return null;
    if (
      !(ctx.derived?.[target] ?? []).some(
        d => d.property === 'padding' && d.expand,
      )
    )
      return null;
    const scoped0 = s.when != null || s.state != null;
    // padding's initial value is 0, and padding does not inherit, so unset
    // is 0 too: on Core's side variables a keyword means no value at all.
    const value = /^(initial|unset)$/i.test(String(s.value).trim())
      ? '0'
      : String(s.value).trim();
    // A physical left or right stays physical, as Core keeps it (it maps
    // no physical side to a logical one but top and bottom, which it maps
    // itself): it is written as it is, and a later padding that covers it
    // takes it out of the block (below).
    const physical = /** @type {Record<string, string>} */ ({
      // One logical side is that side (its keyword resolved too).
      'padding-block-start': 'block-start',
      'padding-block-end': 'block-end',
      'padding-inline-start': 'inline-start',
      'padding-inline-end': 'inline-end',
      'padding-top': 'block-start',
      'padding-bottom': 'block-end',
    })[prop];
    if (physical)
      return {
        [scoped0
          ? `--astryx-${target}-padding-${physical}`
          : camel(`padding-${physical}`)]: value,
      };
    // A physical left or right is written as it is (its keyword resolved),
    // never split as an axis: there is no padding-left-start.
    if (prop === 'padding-left' || prop === 'padding-right')
      return {[camel(prop)]: value};
    const w = splitTop(value, ' ').map(x => x.trim());
    if (!w.length || w.length > (prop === 'padding' ? 4 : 2)) return null;
    const scoped = s.when != null || s.state != null;
    // Only what Core would split wrong is written side by side: math or a
    // function, four values with different left and right sides; and, for
    // a variant or state, any padding once the part sets a side itself.
    const coreSplitsWrong =
      value !== String(s.value).trim() ||
      /\(/.test(value) ||
      (prop === 'padding' && w.length === 4 && w[1] !== w[3]);
    const partSides = data.settings.some(
      x =>
        x !== s &&
        x.source === 'property' &&
        // The part's own, or a group's it is in.
        (x.on === s.on ||
          (FAMILIES[/** @type {string} */ (x.on)] ?? []).includes(target)) &&
        x.when == null &&
        x.state == null &&
        (/^padding-/.test(kebab(x.thing)) ||
          (kebab(x.thing) === 'padding' &&
            /\(|\S+\s+\S+\s+\S+\s+\S+/.test(x.value))),
    );
    // A side set on the part or its group: every side is written, so the
    // later setting wins as written.
    if (!coreSplitsWrong && !partSides) return null;
    /** @type {Record<string, string>} */
    const side = {};
    if (prop === 'padding') {
      const [top, right = top, bottom = top, left = right] = w;
      Object.assign(side, {
        'block-start': top,
        'inline-end': right,
        'block-end': bottom,
        'inline-start': left,
      });
    } else {
      const axis = prop.slice('padding-'.length);
      side[`${axis}-start`] = w[0];
      side[`${axis}-end`] = w[1] ?? w[0];
    }
    return Object.fromEntries(
      Object.entries(side).map(([k, v]) => [
        scoped ? `--astryx-${target}-padding-${k}` : camel(`padding-${k}`),
        v,
      ]),
    );
  };
  /**
   * A part's shadow with the layers Core composes its own shadow from (the
   * private variables in its resting declaration), over the theme's; a
   * shadow of none keeps Core's marks alone (a selection ring), never its
   * elevation, which is a shadow too. Any other part's is as given.
   * @param {string} target @param {string} v
   */
  const withCoreShadowLayers = (target, v) => {
    const at = ctx.C.MAP[target]?.at?.['box-shadow'] ?? {};
    const rest = Object.entries(at).find(([k]) => !/:|selected=/.test(k))?.[1];
    // Core's own layer that is only ever a shared shadow (a card's
    // elevation) is the part's shadow; any other (a selection ring) is a
    // mark of Core's own, kept in every case.
    const isElevation = (/** @type {string} */ layer) => {
      const name = /^var\(\s*(--_[a-z0-9-]+)/.exec(layer)?.[1];
      const values = name ? coreVarValues(ctx.project, name) : [];
      return (
        values.length > 0 &&
        values.every(x =>
          /^(?:var\(\s*--shadow-[a-z0-9-]+\s*\)|0 0 transparent|none)$/.test(x),
        )
      );
    };
    const value = String(v).trim();
    // (No shadow takes Core's elevation out too; a shadow of the theme's
    // sits over it.)
    const layers = splitTop(String(rest ?? ''), ',')
      .map(x => x.trim())
      .filter(
        x =>
          /^var\(\s*--_/.test(x) && !(/^none$/i.test(value) && isElevation(x)),
      );
    if (!layers.length || layers.every(l => value.includes(l))) return v;
    return /^none$/i.test(value)
      ? layers.join(', ')
      : `${layers.join(', ')}, ${value}`;
  };
  /** Whether the base theme's own rule for the part writes a radius. */
  const baseWritesRadius = (
    /** @type {string} */ target,
    /** @type {string | undefined} */ when,
  ) => {
    const rules = /** @type {any} */ (base).components?.[target] ?? {};
    return [rules.base, when ? rules[when] : undefined].some(
      r => r && typeof r === 'object' && 'borderRadius' in r,
    );
  };
  /**
   * A radius of more than one value on a part whose radius Core copies
   * into a variable for the content inside it (a card's full-bleed
   * children), as each corner's own radius, so Core writes no copy of the
   * whole value there (where one corner reads it, and `10px / 20px` or four
   * values are wrong). The inner variable takes one radius, the first
   * corner's across: Core gives the content one radius for every corner.
   * Null for any other property, part or a single radius.
   * @param {string} target @param {Setting} s
   * @returns {Record<string, string> | null}
   */
  const cornerRadii = (target, s) => {
    if (s.mode || kebab(s.thing) !== 'border-radius') return null;
    const vars = (ctx.derived?.[target] ?? []).find(
      d => d.property === 'borderRadius' && d.vars?.length,
    )?.vars;
    if (!vars) return null;
    const [across, down] = splitTop(String(s.value).trim(), '/').map(x =>
      splitTop(x.trim(), ' ').map(y => y.trim()),
    );
    if (!across?.length || (across.length === 1 && !down)) return null;
    /** @param {string[]} w top-left, top-right, bottom-right, bottom-left */
    const four = w => {
      const [tl, tr = tl, br = tl, bl = tr] = w;
      return [tl, tr, br, bl];
    };
    const h = four(across);
    const v = down?.length ? four(down) : null;
    const corner = (/** @type {number} */ i) =>
      v && v[i] !== h[i] ? `${h[i]} ${v[i]}` : h[i];
    // The whole radius as one value first, which Core turns into the
    // part's inner-corner variable itself (a theme writes no private
    // variable), then each corner, which the box shows.
    return {
      borderRadius: h[0],
      borderTopLeftRadius: corner(0),
      borderTopRightRadius: corner(1),
      borderBottomRightRadius: corner(2),
      borderBottomLeftRadius: corner(3),
    };
  };
  /**
   * A one-side logical padding on a part whose whole padding Core copies
   * into a variable of its own (a composer's or a menu's inner padding),
   * written for each direction (a left-to-right box's left is a
   * right-to-left box's right): Core feeds every logical padding into that
   * variable, so one side would set the whole box. Null for any other
   * property or part.
   * @param {string} target @param {Setting} s
   * @returns {Record<string, string | Record<string, string>> | null}
   */
  const boxSides = (target, s) => {
    const prop = kebab(s.thing);
    if (s.mode) return null;
    const derived = ctx.derived?.[target] ?? [];
    if (
      derived.some(d => d.property === 'padding' && d.expand) ||
      !derived.some(d => d.property === 'padding' && d.vars?.length)
    )
      return null;
    const SIDES = /** @type {Record<string, string[]>} */ ({
      'padding-block-start': ['block-start'],
      'padding-block-end': ['block-end'],
      'padding-inline-start': ['inline-start'],
      'padding-inline-end': ['inline-end'],
      'padding-block': ['block-start', 'block-end'],
      'padding-inline': ['inline-start', 'inline-end'],
    });
    const sides = SIDES[prop];
    if (!sides) return null;
    const w = splitTop(String(s.value).trim(), ' ').map(x => x.trim());
    // Each side for each direction: a block side is the top or bottom; an
    // inline side is the left in a left-to-right box and the right in a
    // right-to-left one, written under :dir(), where Core writes the
    // declarations as they are and feeds none into the whole-box variable.
    /** @type {Record<string, string>} */
    const plain = {};
    /** @type {Record<string, string>} */
    const ltr = {};
    /** @type {Record<string, string>} */
    const rtl = {};
    sides.forEach((side, i) => {
      const v = w[i] ?? w[0];
      if (side === 'block-start') plain.paddingTop = v;
      else if (side === 'block-end') plain.paddingBottom = v;
      else if (side === 'inline-start') {
        ltr.paddingLeft = v;
        rtl.paddingRight = v;
      } else {
        ltr.paddingRight = v;
        rtl.paddingLeft = v;
      }
    });
    return {
      ...plain,
      ...(Object.keys(ltr).length ? {':dir(ltr)': ltr, ':dir(rtl)': rtl} : {}),
    };
  };
  /**
   * A padding on a part whose visible box sits inside its themed wrapper,
   * as the padding variable that box reads, not the wrapper's own padding
   * (which would add a gap outside the box). Null for any other part.
   * @param {string} target @param {Setting} s
   * @returns {Record<string, string> | null}
   */
  const wrappedPadding = (target, s) => {
    if (s.mode || !WRAPPED_PARTS[target] || kebab(s.thing) !== 'padding')
      return null;
    const name = (ctx.derived?.[target] ?? []).find(
      d => d.property === 'padding' && d.vars?.length,
    )?.vars?.[0];
    // The box reads only Core's own variable, which a theme may not write,
    // and a padding property would pad the wrapper: nothing is written (a
    // saved one is refused, as set refuses it).
    return name ? {} : null;
  };
  /**
   * The prefix of the padding variables a part's box reads, for a part whose
   * padding Core writes to them (its derivedVarRegistry's container
   * expansion), or for one drawn by such a part (a clickable card is a
   * card); null for any other part.
   * @param {string} target
   */
  const padVars = target => {
    if (
      (ctx.derived?.[target] ?? []).some(
        d => d.property === 'padding' && d.expand,
      )
    )
      return `--astryx-${target}-padding`;
    return CARD_LIKE.includes(target) ? '--astryx-card-padding' : null;
  };
  /**
   * Padding settings per part and per scope (the block a setting writes
   * to), in the order they were made.
   * @type {Map<string, {target: string, s: Setting, list: Setting[]}>}
   */
  const padQueue = new Map();
  /** @param {Setting} s @param {string} target */
  const queuePadding = (s, target) => {
    const key = `${target}\0${s.when ?? ''}\0${s.state ?? ''}`;
    const q = padQueue.get(key) ?? {target, s, list: []};
    q.list.push(s);
    padQueue.set(key, q);
  };
  /**
   * One padding model: each scope's settings, in order, resolved to the
   * four logical sides for each direction (a physical left is the
   * inline-start in a left-to-right box and the inline-end in a
   * right-to-left one; the padding shorthand is physical too), then written
   * to the variables the part's box reads: a side the same in both
   * directions in the scope's own block, one that differs in a rule for
   * each direction (one level deep under a state). So the derived and
   * full-bleed values follow, and a variant or a state out-ranks the base
   * as Core's own rules do.
   */
  const emitPadding = () => {
    // The side variables written on a narrower selector (a variant, a
    // state, a clickable card), by the part whose variables they are, with
    // that selector: they inherit, so a plain one of those parts inside is
    // reset to its own fallback (below), never given a copy of a value.
    /** @type {Map<string, Map<string, Set<string>>>} */
    const narrow = new Map();
    /** A side as CSS reads it inside calc(): a bare 0 is no length. @param {string} v */
    const length = v => {
      const n = cssNumber(v);
      return n && n.unit === '' && n.value === 0 ? '0px' : v;
    };
    for (const {target, s, list} of padQueue.values()) {
      // The own source's padding on the same rule wins over the editor's on
      // the sides it sets (the result says so); the editor's other sides
      // still apply.
      const own = ownBox(target, s);
      if (own.ltr.size === 4 && own.rtl.size === 4) continue;
      const prefix = /** @type {string} */ (padVars(target));
      const owner = prefix.slice('--astryx-'.length, -'-padding'.length);
      const scoped = target !== owner || s.when != null || s.state != null;
      /** @type {Record<'ltr' | 'rtl', Record<string, string>>} */
      const side = {ltr: {}, rtl: {}};
      for (const x of list) {
        const prop = kebab(x.thing);
        const raw = String(x.value).trim();
        // initial and unset leave the variable without a value, so the part
        // takes Core's own default for it.
        const value = /^(initial|unset|inherit|revert|revert-layer)$/i.test(raw)
          ? 'initial'
          : raw;
        const w = splitTop(value, ' ').map(y => length(y.trim()));
        const one = length(value);
        for (const dir of /** @type {const} */ (['ltr', 'rtl'])) {
          const o = side[dir];
          const left = dir === 'ltr' ? 'inline-start' : 'inline-end';
          const right = dir === 'ltr' ? 'inline-end' : 'inline-start';
          if (prop === 'padding') {
            const [top, r = top, bottom = top, l = r] = w;
            Object.assign(o, {
              'block-start': top,
              [right]: r,
              'block-end': bottom,
              [left]: l,
            });
          } else if (prop === 'padding-block') {
            o['block-start'] = w[0];
            o['block-end'] = w[1] ?? w[0];
          } else if (prop === 'padding-inline') {
            o['inline-start'] = w[0];
            o['inline-end'] = w[1] ?? w[0];
          } else if (prop === 'padding-top') o['block-start'] = one;
          else if (prop === 'padding-bottom') o['block-end'] = one;
          else if (prop === 'padding-left') o[left] = one;
          else if (prop === 'padding-right') o[right] = one;
          else {
            const k = prop.slice('padding-'.length);
            if (/^(block|inline)-(start|end)$/.test(k)) o[k] = one;
          }
        }
      }
      // The sides the own source pads in a direction are its own there.
      for (const dir of /** @type {const} */ (['ltr', 'rtl']))
        for (const x of Object.keys(side[dir]))
          if (own[dir].has(boxSide(x, dir))) delete side[dir][x];
      /** @type {Record<string, string>} */
      let plain = {};
      /** @type {Record<string, string>} */
      const ltr = {};
      /** @type {Record<string, string>} */
      const rtl = {};
      for (const k of [
        'block-start',
        'block-end',
        'inline-start',
        'inline-end',
      ]) {
        const [a, b] = [side.ltr[k], side.rtl[k]];
        if (a != null && a === b) plain[`${prefix}-${k}`] = a;
        else {
          if (a != null) ltr[`${prefix}-${k}`] = a;
          if (b != null) rtl[`${prefix}-${k}`] = b;
        }
      }
      // On the part's own base, a side that is the same in both
      // directions is written as its logical padding property, which Core
      // lowers to the variables together with the base theme's and the own
      // source's padding in the same block: the later wins by key, and four
      // equal sides come out as the whole padding (a nested section keeps
      // following its parent's), whatever sides the base theme set.
      // Only the plain rule: a variant's or a state's rule written that way
      // would come out as the whole padding alone, which the base's own side
      // variables out-rank.
      const lowered = target === owner && !s.when && !s.state;
      if (lowered)
        plain = Object.fromEntries(
          Object.entries(plain).map(([k, v]) => [
            camel(`padding-${k.slice(prefix.length + 1)}`),
            v,
          ]),
        );
      // A part drawn by another (a clickable card) writes its sides for each
      // direction too, so a direction rule the card's own base has never
      // out-ranks it.
      if (target !== owner)
        for (const [k, v] of Object.entries(plain)) {
          ltr[k] ??= v;
          rtl[k] ??= v;
        }
      if (scoped) {
        const sel = narrowSelector(target, s);
        if (sel) {
          const bySel = narrow.get(owner) ?? new Map();
          const names = bySel.get(sel) ?? new Set();
          for (const k of [
            ...Object.keys(plain),
            ...Object.keys(ltr),
            ...Object.keys(rtl),
          ])
            names.add(k);
          bySel.set(sel, names);
          narrow.set(owner, bySel);
        }
      }
      for (const [k, v] of Object.entries(plain)) putComp(s, target, k, v);
      for (const [dir, rule] of /** @type {const} */ ([
        [':dir(ltr)', ltr],
        [':dir(rtl)', rtl],
      ]))
        if (Object.keys(rule).length) {
          const [b, key] = dirBlock(s, target, dir);
          b[key] = {...(b[key] ?? {}), ...rule};
        }
    }
    // A variant the own source pads: the sides it sets are left without a
    // side variable there, so the variant's own padding (which Core writes
    // as the whole padding) wins over any side the plain rule writes.
    for (const owner of new Set(
      [...padQueue.values()]
        .filter(({target, s}) => !s.when && !s.state && padVars(target))
        .map(({target}) =>
          /** @type {string} */ (padVars(target)).slice(
            '--astryx-'.length,
            -'-padding'.length,
          ),
        ),
    )) {
      const values = ctx.C.variantValues(owner);
      for (const [prop, vals] of Object.entries(values ?? {}))
        for (const v of /** @type {string[]} */ (vals ?? [])) {
          const when = `${prop}:${v}`;
          const own = ownBox(owner, /** @type {any} */ ({when}));
          if (!own.ltr.size && !own.rtl.size) continue;
          const variant = /** @type {any} */ ({when});
          const logical = [
            'block-start',
            'block-end',
            'inline-start',
            'inline-end',
          ];
          const at = (/** @type {'ltr' | 'rtl'} */ dir) =>
            logical.filter(x => own[dir].has(boxSide(x, dir)));
          const [l, r] = [at('ltr'), at('rtl')];
          const b = block(variant, owner);
          for (const x of l.filter(x => r.includes(x)))
            b[`--astryx-${owner}-padding-${x}`] ??= 'initial';
          // A pair variable the plain rule writes (the inline or block
          // padding) feeds both its sides, under the side variables: where
          // the own source pads both, it is left without a value too, so
          // the variant's own padding holds there.
          for (const pair of ['block', 'inline'])
            if (
              [`${pair}-start`, `${pair}-end`].every(
                x => l.includes(x) && r.includes(x),
              )
            )
              b[`--astryx-${owner}-padding-${pair}`] ??= 'initial';
          // Its own sides inherit into a plain one of the part inside it:
          // they are reset there like the editor's (below).
          const sel = narrowSelector(owner, variant);
          if (sel) {
            const bySel = narrow.get(owner) ?? new Map();
            const names = bySel.get(sel) ?? new Set();
            for (const x of new Set([...l, ...r]))
              names.add(`--astryx-${owner}-padding-${x}`);
            for (const pair of ['block', 'inline'])
              if ([...l, ...r].some(x => x.startsWith(pair)))
                names.add(`--astryx-${owner}-padding-${pair}`);
            bySel.set(sel, names);
            narrow.set(owner, bySel);
          }
          for (const [dir, xs] of /** @type {const} */ ([
            [':dir(ltr)', l.filter(x => !r.includes(x))],
            [':dir(rtl)', r.filter(x => !l.includes(x))],
          ]))
            if (xs.length) {
              const [db, key] = dirBlock(variant, owner, dir);
              db[key] = {
                ...(db[key] ?? {}),
                ...Object.fromEntries(
                  xs.map(x => [`--astryx-${owner}-padding-${x}`, 'initial']),
                ),
              };
            }
        }
    }
    // A plain part inside a narrower one: each side the narrower selector
    // writes is reset (left without a value, so Core's own fallback holds),
    // on the part's own class at its own weight, before any base setting a
    // theme gives it (the part's own base, or a source of the user's own,
    // which comes later and so wins).
    for (const [owner, bySel] of narrow) {
      const b = ((theme.components[owner] ??= {}).base ??= {});
      // The variables Core writes on the part's own rule, from the base
      // theme's, the settings' and the own source's padding there: the
      // reset leaves those alone, so the part's own value always holds.
      const own = basePaddingVars(owner, b);
      for (const [sel, names] of bySel) {
        /** @type {Record<string, string>} */
        const reset = {};
        for (const name of names)
          if (!(name in b) && !own.has(name)) reset[name] = 'initial';
        if (Object.keys(reset).length) {
          const key = `:where(${sel} *)`;
          b[key] = {...(b[key] ?? {}), ...reset};
        }
      }
    }
  };
  /**
   * The padding variables Core writes on a part's plain rule, as Core lowers
   * the padding properties there (the base theme's, then the settings',
   * then the own source's, later keys winning): the whole padding when the
   * four sides are equal, else each side given (an inline pair as one).
   * @param {string} owner @param {Record<string, any>} mine
   * @returns {Set<string>}
   */
  const basePaddingVars = (owner, mine) => {
    const prefix = `--astryx-${owner}-padding`;
    /** @type {Array<[string, string]>} */
    const keys = [];
    const fromBase = /** @type {any} */ (base).components?.[owner]?.base ?? {};
    for (const [k, v] of Object.entries(fromBase))
      if (typeof v === 'string') keys.push([k, v]);
    for (const [k, v] of Object.entries(mine))
      if (typeof v === 'string') keys.push([k, v]);
    try {
      for (const [k, v] of ownPartTokens(ctx.project.cwd, data.name, owner))
        if (v != null && !k.startsWith('--')) keys.push([camel(k), v]);
    } catch {
      // No own source.
    }
    /** @type {Record<string, string | undefined>} */
    const r = {};
    for (const [k, v] of keys) {
      const w = splitTop(v.trim(), ' ');
      if (k === 'padding') {
        r.bs = w[0];
        r.in = w[1] ?? w[0];
        r.be = w[2] ?? w[0];
        delete r.is;
        delete r.ie;
      } else if (k === 'paddingBlock') {
        r.bs = w[0];
        r.be = w[1] ?? w[0];
      } else if (k === 'paddingInline') {
        if (w.length > 1) [r.is, r.ie] = w;
        else r.in = w[0];
      } else if (k === 'paddingTop' || k === 'paddingBlockStart') r.bs = v;
      else if (k === 'paddingBottom' || k === 'paddingBlockEnd') r.be = v;
      else if (k === 'paddingInlineStart') r.is = v;
      else if (k === 'paddingInlineEnd') r.ie = v;
    }
    const out = new Set(Object.keys(mine).filter(k => k.startsWith(prefix)));
    const is = r.is ?? r.in;
    const ie = r.ie ?? r.in;
    if (is != null && is === ie && r.bs === is && r.be === is) out.add(prefix);
    else {
      if (r.is != null || r.ie != null) {
        if (is != null) out.add(`${prefix}-inline-start`);
        if (ie != null) out.add(`${prefix}-inline-end`);
      } else if (r.in != null) out.add(`${prefix}-inline`);
      if (r.bs != null) out.add(`${prefix}-block-start`);
      if (r.be != null) out.add(`${prefix}-block-end`);
    }
    return out;
  };
  /**
   * The box side a padding side names in a direction: a physical side as it
   * is, a logical one as the direction reads it (inline-start is the left in
   * left-to-right text, the right in right-to-left).
   * @param {string} x top, right, bottom, left, or a logical side
   * @param {'ltr' | 'rtl'} dir
   */
  const boxSide = (x, dir) =>
    ({
      'block-start': 'top',
      'block-end': 'bottom',
      'inline-start': dir === 'ltr' ? 'left' : 'right',
      'inline-end': dir === 'ltr' ? 'right' : 'left',
    })[x] ?? x;
  /**
   * The padding sides a padding property names, as it names them (physical
   * stays physical, logical stays logical), with each one's value.
   * @param {string} prop kebab-case
   * @param {string} value
   * @returns {Record<string, string>}
   */
  const paddingSides = (prop, value) => {
    const w = splitTop(String(value).trim(), ' ').map(y => y.trim());
    if (prop === 'padding') {
      const [top, right = top, bottom = top, left = right] = w;
      return {top, right, bottom, left};
    }
    if (prop === 'padding-block')
      return {'block-start': w[0], 'block-end': w[1] ?? w[0]};
    if (prop === 'padding-inline')
      return {'inline-start': w[0], 'inline-end': w[1] ?? w[0]};
    const side = prop.slice('padding-'.length);
    return /^(top|right|bottom|left|(block|inline)-(start|end))$/.test(side)
      ? {[side]: w[0]}
      : {};
  };
  /**
   * The box sides the theme's own source pads on a part's rule for a scope
   * (its plain rule, a variant, a state), in each direction.
   * @param {string} target @param {Setting} s
   * @returns {Record<'ltr' | 'rtl', Set<string>>}
   */
  const ownBox = (target, s) => {
    const out = {ltr: new Set(), rtl: new Set()};
    try {
      for (const k of ownPartTokens(
        ctx.project.cwd,
        data.name,
        target,
        s.when ?? 'base',
        s.state ? `:${s.state}` : null,
      ).keys())
        for (const x of Object.keys(paddingSides(k, '0')))
          for (const dir of /** @type {const} */ (['ltr', 'rtl']))
            out[dir].add(boxSide(x, dir));
    } catch {
      // No own source.
    }
    return out;
  };

  /**
   * The selector a narrower padding scope is written with (a clickable
   * card's class, a variant's attribute, a state's pseudo-class), or null
   * for a state Core writes as a block of its own.
   * @param {string} target @param {Setting} s
   */
  const narrowSelector = (target, s) => {
    const tg = ctx.project.target.get(target);
    const slot = stateSlot(
      tg?.states ?? [],
      s.state,
      s.when,
      wrapsOneControl(ctx, target),
      tg?.stateValues,
    );
    if (s.state && slot.key !== (s.when ?? 'base')) return null;
    const attrs = s.when
      ? String(s.when)
          .split('+')
          .map(w => {
            const [k, v] = w.split(':');
            return `[data-${k}="${v}"]`;
          })
          .join('')
      : '';
    return `.astryx-${target}${attrs}${slot.pseudo ?? ''}`;
  };

  /**
   * Each part's blocks with its base first, and in each block the rules for
   * a direction before a state's: Core writes them in this order, and a
   * variant or a state comes after the base it out-ranks (rules of the same
   * weight win by order).
   */
  const orderBlocks = () => {
    /** @param {Record<string, any>} b @returns {Record<string, any>} */
    const dirFirst = b => {
      const keys = Object.keys(b);
      const plain = keys.filter(k => !k.startsWith(':'));
      const dirs = keys.filter(k => /^:(where\()?dir\(/.test(k));
      // The reset a plain part inside a narrower one gets comes before the
      // part's own direction rules at the same weight, so a side the part
      // sets for a direction holds inside a variant too.
      const resets = keys.filter(k => /^:where\((?!:?dir\().* \*\)$/.test(k));
      const rest = keys.filter(
        k =>
          k.startsWith(':') &&
          !/^:(where\()?dir\(/.test(k) &&
          !resets.includes(k),
      );
      return Object.fromEntries(
        [...plain, ...resets, ...dirs, ...rest].map(k => [
          k,
          k.startsWith(':') && b[k] && typeof b[k] === 'object'
            ? dirFirst(b[k])
            : b[k],
        ]),
      );
    };
    // A part drawn by another (a clickable card) after the part drawing it,
    // so its own padding wins over the base's reset at the same weight.
    theme.components = Object.fromEntries([
      ...Object.entries(theme.components ?? {}).filter(
        ([t]) => !CARD_LIKE.includes(t),
      ),
      ...Object.entries(theme.components ?? {}).filter(([t]) =>
        CARD_LIKE.includes(t),
      ),
    ]);
    // The part's own rule first, then its variants' rules, then every other
    // condition (a status, a size): a condition written at the same weight
    // as a variant's rule wins over it whatever was set first, as Core
    // draws a status over the variant (a plain one-mode color is written
    // into each variant's block, so it must never out-rank an earlier
    // `--when status:error` setting).
    for (const [target, blocks] of Object.entries(theme.components ?? {})) {
      const keys = Object.keys(blocks);
      const variantOnly = (/** @type {string} */ k) =>
        /^variant:[^\s,]+$/.test(k);
      const ordered = [
        ...keys.filter(k => k === 'base'),
        ...keys.filter(variantOnly),
        ...keys.filter(k => k !== 'base' && !variantOnly(k)),
      ];
      theme.components[target] = Object.fromEntries(
        ordered.map(k => [
          k,
          blocks[k] && typeof blocks[k] === 'object'
            ? dirFirst(blocks[k])
            : blocks[k],
        ]),
      );
    }
  };
  /**
   * Where a per-direction rule goes for a setting, one level deep, as the
   * block and its key: in the setting's own block, or under a state Core
   * writes as a pseudo-class, beside that state with the direction after it.
   * @param {Setting} s @param {string} target @param {string} dir `:dir(ltr)`
   * @returns {[Record<string, any>, string]}
   */
  const dirBlock = (s, target, dir) => {
    const tg = ctx.project.target.get(target);
    // On the plain rule, a direction's rule keeps the plain rule's weight
    // (:where), so any variant, the own source's included, out-ranks it as
    // it out-ranks the plain rule.
    if (!s.state && !s.when) return [block(s, target), `:where(${dir})`];
    const slot = stateSlot(
      tg?.states ?? [],
      s.state,
      s.when,
      wrapsOneControl(ctx, target),
      tg?.stateValues,
    );
    if (!slot.pseudo) return [block(s, target), dir];
    const parent = ((theme.components[target] ??= {})[slot.key] ??= {});
    return [parent, `${slot.pseudo}${dir}`];
  };
  /**
   * One half of a light-dark() pair (1 light, 2 dark), or the value itself.
   * @param {string} x @param {1 | 2} side
   */
  const halfOf = (x, side) => {
    const inner = /^light-dark\((.*)\)$/s.exec(x.trim())?.[1];
    const halves = inner == null ? [] : splitTop(inner, ',');
    return halves.length === 2 ? halves[side - 1].trim() : x.trim();
  };
  /**
   * The value a variant of a part shows for a color property where the
   * theme sets none of its own: the base theme's rule for that variant (in
   * the state, else at rest), else Core's, else transparent for a
   * background Core never paints; null for a text color Core never sets.
   * @param {string} target @param {string} css a color longhand, kebab-case
   * @param {string} name the variant @param {string} [state]
   * @param {boolean} [stateOnly] the state's own value only, never the resting one
   * @returns {string | null}
   */
  const exactVariantValue = (target, css, name, state, stateOnly = false) => {
    const when = `variant:${name}`;
    const kebabs =
      css === 'background-color' ? ['background-color', 'background'] : [css];
    const props = kebabs.map(camel);
    const steps = state
      ? stateOnly
        ? [state]
        : [state, undefined]
      : [undefined];
    for (const st of steps)
      for (const p of props) {
        const b = baseComponent(base, ctx, target, p, {when, state: st});
        if (b != null) return b;
      }
    const keyOf = (/** @type {string} */ k) => {
      const [attrs, cond = ''] = k.split(' ');
      return attrs.split(',').includes(`variant=${name}`) ? cond : null;
    };
    for (const st of steps)
      for (const p of kebabs) {
        const at = ctx.C.MAP[target]?.at?.[p];
        for (const [k, val] of Object.entries(at ?? {})) {
          const cond = keyOf(k);
          if (cond == null) continue;
          if (st ? cond.includes(`:${st}`) : cond === '') return val;
        }
      }
    if (stateOnly) return null;
    return css === 'background-color'
      ? 'transparent'
      : css === 'color'
        ? null
        : 'currentcolor';
  };
  /** The family a color property belongs to: background is background-color. @param {string} p */
  const colorFamily = p => {
    const k = kebab(p);
    return k === 'background' ? 'background-color' : k;
  };
  /** @param {Setting} s @param {string} target @param {string} prop @param {string} v */
  const putComp = (s, target, prop, v) => {
    // A shadow on a part whose shadow Core composes from layers of its own
    // (a card's selection ring and elevation) keeps those layers over the
    // theme's: the theme's shadow is one more layer, never a list that
    // drops the ring.
    if (kebab(prop) === 'box-shadow') v = withCoreShadowLayers(target, v);
    const b = block(s, target);
    // A gradient background for one mode goes into the rule's block for
    // that mode as its image layers (with their positions, sizes and
    // repeats), and a layer that is a color alone as that mode's color: the
    // other mode keeps every image and color it had, Core's own included.
    if (
      s.mode &&
      /^background(-image)?$/.test(kebab(prop)) &&
      /gradient\(/i.test(v)
    ) {
      const mb = modeBlock(s, target, s.mode);
      // The background shorthand's last layer may carry the color under
      // the images: that color is this mode's background color, and the
      // rest are the images.
      const {images, color} =
        kebab(prop) === 'background'
          ? backgroundColorLayer(v)
          : {images: v, color: null};
      const parts = splitTop(images ?? '', ',')
        .map(x => x.trim())
        .filter(Boolean)
        .map(layerParts);
      for (const k of [
        'background',
        'backgroundImage',
        'backgroundPosition',
        'backgroundSize',
        'backgroundRepeat',
      ])
        delete mb[k];
      mb.backgroundImage = parts.map(x => x.image).join(', ');
      if (parts.some(x => x.position || x.size || x.repeat)) {
        mb.backgroundPosition = parts
          .map(x => x.position || '0% 0%')
          .join(', ');
        mb.backgroundSize = parts.map(x => x.size || 'auto').join(', ');
        mb.backgroundRepeat = parts.map(x => x.repeat || 'repeat').join(', ');
      }
      if (!parts.length) delete mb.backgroundImage;
      if (color) mb.backgroundColor = color;
      return;
    }
    // A color set in a one-mode theme fills its mode's half only (as a
    // setting for that mode does), so a region Core draws in the other mode
    // reads the other half.
    const mode =
      s.mode ??
      (modeOnly && parseColor(String(v).trim()) ? modeOnly : undefined);
    if (mode && !s.when && variantsReading(ctx, target, prop, s.state).length) {
      // A color for one mode on a part whose variants each have their own:
      // each variant's rule (in the state, for a state setting) gets the
      // color in its block for that mode, so no variant takes another's and
      // the other mode stays as it was. The part's own rule is left alone.
      // The property itself (a border color stays a border color); the
      // background shorthand is written as its color.
      const css = colorFamily(prop);
      // The part's own background being an image (a gradient) covers any
      // color under it: the color is written, and the result says it does
      // not show.
      // A color given beside its own image in one background (`linear-
      // gradient(…), ivory`) is that image's bottom layer, never covered by
      // it.
      const plainImage =
        css === 'background-color' && !ownImageLayer(s)
          ? ['background', 'backgroundImage']
              .map(k => b[k])
              .find(y => typeof y === 'string' && /gradient\(|url\(/i.test(y))
          : undefined;
      if (plainImage)
        (ctx.compileNotes ??= []).push(
          `${target}'s own background is an image (${plainImage}), which covers the ${mode} color: it does not show until that background is a color`,
        );
      const names = new Set([
        ...(ctx.C.variantValues(target)?.variant ?? []),
        ...(ctx.C.MAP[target]?.attrs?.variant ?? []),
      ]);
      for (const name of names) {
        const x = exactVariantValue(target, css, name, s.state);
        const variant = {...s, when: `variant:${name}`};
        const vb = block({...variant, mode: undefined}, target);
        const family = [
          css,
          ...(css === 'background-color' ? ['background'] : []),
        ];
        // A variant whose own background is an image (a gradient) keeps
        // it: one mode's color is not written there, and the result says so.
        const image = family
          .map(k => vb[camel(k)])
          .find(y => typeof y === 'string' && /gradient\(|url\(/i.test(y));
        if (image) {
          (ctx.compileNotes ??= []).push(
            `${target} variant:${name} keeps its own background image (${image}), so the ${mode} color is not written there`,
          );
          continue;
        }
        const mb = modeBlock(variant, target, mode);
        for (const k of family) delete mb[camel(k)];
        mb[camel(css)] = v;
        // A resting color on the variant's rule in this mode would also hide
        // the hover the variant shows unset in this mode: that hover is
        // written back there as it was, unless a hover setting of the
        // theme's own gives it one.
        if (
          !s.state &&
          !data.settings.some(
            y =>
              y.on === s.on &&
              y.state === 'hover' &&
              colorFamily(y.thing) === colorFamily(s.thing),
          )
        ) {
          const hover = exactVariantValue(target, css, name, 'hover', true);
          if (hover != null && hover !== x)
            modeBlock({...variant, state: 'hover'}, target, mode)[
              camel(css)
            ] ??= halfOf(hover, mode === 'light' ? 1 : 2);
        }
      }
      return;
    }
    // A color for one mode under the part's own gradient does not show:
    // the result says so.
    if (
      mode &&
      colorFamily(prop) === 'background-color' &&
      !ownImageLayer(s) &&
      ['background', 'backgroundImage'].some(
        k => typeof b[k] === 'string' && /gradient\(|url\(/i.test(b[k]),
      )
    )
      (ctx.compileNotes ??= []).push(
        `${target}${s.when ? ` ${s.when}` : ''}${s.state ? ` :${s.state}` : ''} has a background image (a gradient) over its color, so the ${mode} color does not show until that background is a color`,
      );
    // A color for one mode goes into the rule's block for that mode, which
    // applies only where the element's color mode is that mode: in the other
    // mode the rule, and every rule the base theme and Core give the part in
    // context, apply as they would without it.
    // The background shorthand and its color are one property there: the
    // later setting replaces the earlier.
    if (mode) {
      const mb = modeBlock(s, target, mode);
      if (colorFamily(prop) === 'background-color')
        for (const k of ['background', 'backgroundColor'])
          if (typeof mb[k] === 'string' && !/gradient\(|url\(/i.test(mb[k]))
            delete mb[k];
      mb[prop] = v;
    } else b[prop] = v;
    if (kebab(prop) === 'box-shadow' && !s.state) withRingStates(s, target, v);
    // A hover or press shadow on a ringed part: Core draws its hover ring
    // only while the part is not focused, so a focused part keeps its
    // focus ring under the mouse. The focus look, written after the
    // theme's hover rule, wins while both hold (a resting shadow of the
    // theme's composes it already).
    else if (
      kebab(prop) === 'box-shadow' &&
      /^(hover|active)$/.test(String(s.state)) &&
      !data.settings.some(
        y =>
          y.source === 'property' &&
          kebab(y.thing) === 'box-shadow' &&
          !y.state &&
          partsOf(ctx, y).includes(target),
      )
    )
      withRingStates({...s, state: undefined}, target, null);
    // A state shadow for the whole part that keeps Core's ring in it (an
    // input's hover ring, kept in the mode a one-mode shadow leaves): each
    // status that rings itself its own way in that state keeps its own
    // ring there, in place of the plain one.
    if (
      kebab(prop) === 'box-shadow' &&
      s.state &&
      !s.when &&
      typeof v === 'string'
    ) {
      const at = ctx.C.MAP[target]?.at?.['box-shadow'] ?? {};
      const inState = (/** @type {string} */ k) =>
        new RegExp(`\\s:${s.state}(?![\\w-])`).test(k);
      const plain = Object.entries(at).find(
        ([k, x]) =>
          inState(k) && !/\bstatus=/.test(k) && !/^\s*none\s*$/.test(String(x)),
      )?.[1];
      if (plain && v.includes(String(plain)))
        for (const [k, ring] of Object.entries(at)) {
          const status = /\bstatus=([\w-]+)/.exec(k)?.[1];
          if (!status || !inState(k) || String(ring) === String(plain))
            continue;
          if (
            data.settings.some(
              y =>
                y.source === 'property' &&
                kebab(y.thing) === 'box-shadow' &&
                y.state === s.state &&
                y.when === `status:${status}` &&
                partsOf(ctx, y).includes(target),
            )
          )
            continue;
          block({...s, when: `status:${status}`}, target).boxShadow = v.replace(
            String(plain),
            String(ring),
          );
        }
    }
  };
  /**
   * A resting shadow on a part that draws rings in its box-shadow in some
   * states (an input's hover and focus rings): for each set of the part's
   * renders Core styles apart (a variant, each status), in each state Core
   * rings any of them in, the theme's shadow with what Core draws for that
   * set in that state after it (`<shadow>, <ring>`), so every ring still
   * shows and a set that draws none there (a focused status input) gets the
   * shadow alone. A shadow of none puts the rings back in their states and
   * keeps a set's own none where the ring of the set it refines would
   * reach it. A write for one set (`--when status:error`) composes that set
   * only. States are written hover first, so a focus rule after it wins
   * while both hold, as Core's own order does. A state the theme sets a
   * shadow of its own (for the whole part, or that set) keeps that. With
   * no shadow (null), each set's focus look as Core draws it, alone: what
   * a hover setting must not hide.
   * @param {Setting} s @param {string} target @param {string | null} v
   */
  const withRingStates = (s, target, v) => {
    const none = /^\s*none\s*$/i.test(String(v));
    const focusOnly = v == null;
    const tg = ctx.project.target.get(target);
    const at = ctx.C.MAP[target]?.at?.['box-shadow'] ?? {};
    const ORDER = ['hover', 'active', 'focus', 'focus-visible', 'focus-within'];
    // The attributes that tell the part's shadow rules apart: a prop the
    // rules give more than one value, or give in some rules and not in
    // others (a status); one every rule gives alike (the size drawn) says
    // nothing.
    const keyed = Object.keys(at).map(k =>
      k
        .split(' ')[0]
        .split(',')
        .filter(Boolean)
        .map(a => a.split('=')),
    );
    /** @param {string} key */
    const tells = key => {
      const vals = keyed.map(list => list.find(([k]) => k === key)?.[1]);
      return new Set(vals).size > 1;
    };
    /** @type {Map<string, {pairs: string[], rest: string | null, states: Map<string, string>}>} */
    const sets = new Map();
    /** @type {Set<string>} */
    const ringed = new Set();
    for (const [k, value] of Object.entries(at)) {
      const [attrs, ...rest] = k.split(' ');
      const cond = rest.join(' ');
      const pairs = attrs
        .split(',')
        .filter(Boolean)
        .map(a => a.split('='))
        .filter(([key]) => tells(key));
      // A rule under an attribute set cannot name (disabled, read-only) is
      // left as Core draws it.
      if (pairs.some(([key]) => !tg?.props.includes(key))) continue;
      const names = pairs.map(([key, val]) => `${key}:${val}`).sort();
      const id = names.join('+');
      const set = sets.get(id) ?? {pairs: names, rest: null, states: new Map()};
      sets.set(id, set);
      if (!cond) {
        set.rest = String(value);
        continue;
      }
      const state = ORDER.find(x => new RegExp(`^:${x}(?![\\w-])`).test(cond));
      if (!state) continue;
      set.states.set(state, String(value));
      if (!/^\s*none\s*$/i.test(String(value))) ringed.add(state);
    }
    if (!ringed.size) return;
    /** The set a set refines (its pairs less one, the most it shares). @param {{pairs: string[]}} set */
    const parentOf = set =>
      [...sets.values()]
        .filter(
          x =>
            x !== set &&
            x.pairs.length < set.pairs.length &&
            x.pairs.every(p => set.pairs.includes(p)),
        )
        .sort((a, b) => b.pairs.length - a.pairs.length)[0] ?? null;
    /** What Core draws for a set in a state. @param {{pairs: string[], rest: string | null, states: Map<string, string>}} set @param {string} state @returns {string | null} */
    const coreOf = (set, state) => {
      const own = set.states.get(state);
      if (own != null) return own;
      // A set that refines another and has no rule of its own there keeps
      // its resting value (a status's none); a set alone draws nothing new.
      return parentOf(set) ? set.rest : null;
    };
    const asked = String(s.when ?? '')
      .split('+')
      .filter(Boolean);
    /** Whether the theme sets a shadow of its own for a state of a set. @param {string} state @param {string[]} pairs */
    const ownState = (state, pairs) =>
      data.settings.some(
        y =>
          y.source === 'property' &&
          kebab(y.thing) === 'box-shadow' &&
          y.state === state &&
          (y.when == null ||
            String(y.when)
              .split('+')
              .every(p => pairs.includes(p))) &&
          partsOf(ctx, y).includes(target),
      );
    for (const set of sets.values()) {
      // A write for one set composes that set (and the sets refining it).
      if (!asked.every(p => set.pairs.includes(p))) continue;
      const parent = parentOf(set);
      for (const state of ORDER.filter(x => ringed.has(x))) {
        if (focusOnly && !/^focus/.test(state)) continue;
        if (ownState(state, set.pairs)) continue;
        const core = coreOf(set, state);
        if (core == null) continue;
        if (focusOnly) {
          block(
            {...s, state, when: set.pairs.join('+') || undefined},
            target,
          ).boxShadow = core;
          continue;
        }
        const coreNone = /^\s*none\s*$/i.test(core);
        if (none && coreNone) {
          // Only where the ring of the set it refines, written back, would
          // reach it.
          const above = parent ? coreOf(parent, state) : null;
          if (!above || /^\s*none\s*$/i.test(above)) continue;
          if (!asked.every(p => (parent?.pairs ?? []).includes(p))) continue;
        }
        const rb = block(
          {...s, state, when: set.pairs.join('+') || undefined},
          target,
        );
        rb.boxShadow = none ? core : coreNone ? v : `${v}, ${core}`;
      }
    }
  };
  // Palette stops go first, so an exact token setting always wins over them.
  const pal = keepShades(
    paletteMapping(ctx.project.cwd, data.name, data, base, TOKENS),
    ctx.keepStops,
  );
  for (const [k, v] of Object.entries(pal?.tokens ?? {}))
    putTok(k, [v.light.color, v.dark.color]);
  // Secondary text lifted on the parts the official neutral theme lifts it
  // on, each for what it sits on. It is written into the very block the
  // base theme lifts it in, so it replaces the base's lift. A setting of it
  // on the part (no --when or --state) wins there, per mode, so a numbered
  // citation shows what `--on citation` set.
  // Without a color dial nothing is lifted, but an exact secondary text
  // still reaches those parts, and the base theme's own lift stays in the
  // mode it does not cover.
  /** @type {Partial<Record<'light' | 'dark', string>>} */
  const exactText = {};
  for (const x of data.settings)
    if (
      x.source === 'token' &&
      x.thing === '--color-text-secondary' &&
      !x.on &&
      !x.when &&
      !x.state
    )
      for (const m of /** @type {const} */ (['light', 'dark']))
        if (!x.mode || x.mode === m) exactText[m] = x.value;
  const blocks =
    /** @type {{components?: Record<string, any>}} */ (base).components ?? {};
  for (const [target, key, ground] of pal?.lift || Object.keys(exactText).length
    ? LIFT_PARTS
    : []) {
    /** @type {Partial<Record<'light' | 'dark', {color: string}>> | undefined} */
    let lift = pal?.lift?.[ground];
    if (!lift) {
      const own = blocks[target]?.[key]?.['--color-text-secondary'];
      const split =
        typeof own === 'string'
          ? /^light-dark\((.*),\s*([^,]*)\)$/.exec(own.trim())
          : null;
      /** @param {'light' | 'dark'} m */
      const baseAt = m =>
        (split ? split[m === 'light' ? 1 : 2].trim() : own) ??
        base[m]['--color-text-secondary'];
      /** A token as the theme draws it so far in a mode, its references read. @param {string} k @param {'light' | 'dark'} m */
      const drawnAs = (k, m) => {
        let v = String(tok[k]?.[m] ?? base[m][k] ?? '');
        for (let i = 0; i < 6; i++) {
          const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v.trim())?.[1];
          if (!ref) break;
          v = String(tok[ref]?.[m] ?? base[m][ref] ?? '');
        }
        return v;
      };
      // The exact color where it reads on what the part sits on (over the
      // surface), else the base theme's own lift there.
      /** @param {'light' | 'dark'} m */
      const at = m => {
        const exact = exactText[m];
        if (exact == null) return baseAt(m);
        const fill = drawnAs(ground, m);
        const under = parseColor(drawnAs('--color-background-surface', m));
        const top = parseColor(fill);
        const text = parseColor(exact);
        if (!top || !under || !text) return exact;
        const seen = compositeOver(
          /** @type {[number, number, number]} */ (top),
          alphaOf(fill),
          /** @type {[number, number, number]} */ (under),
        );
        const fallback = baseAt(m);
        const back = parseColor(String(fallback));
        return ratio(text, seen) >= 4.5 ||
          !back ||
          ratio(back, seen) <= ratio(text, seen)
          ? exact
          : fallback;
      };
      lift = {light: {color: at('light')}, dark: {color: at('dark')}};
    }
    if (!lift || !ctx.project.target.has(target)) continue;
    /** @type {Partial<Record<'light' | 'dark', {color: string}>>} */
    const value = {...lift};
    for (const x of data.settings)
      if (
        x.source === 'token' &&
        x.thing === '--color-text-secondary' &&
        x.on &&
        !x.when &&
        !x.state &&
        partsOf(ctx, x).includes(target)
      )
        for (const m of /** @type {const} */ (['light', 'dark']))
          if (!x.mode || x.mode === m) value[m] = {color: x.value};
    ((theme.components[target] ??= {})[key] ??= {})['--color-text-secondary'] =
      liftValue(value, null);
  }
  // `headings` owns heading weight and tracking whatever the order: `type`
  // sets them only where no `headings` setting does.
  const headingsAxis = (/** @type {'weight' | 'tracking'} */ axis) =>
    data.settings.some(
      x => x.thing === 'headings' && (x.axis ?? 'weight') === axis,
    );
  const headingWeightTokens = Object.keys(TOKENS).filter(k =>
    /^--text-(heading|display)-\d-weight$/.test(k),
  );
  // Dials first, then exact tokens and part properties: an exact setting
  // always wins over a dial, whatever the order they were made in.
  // A dial on a part (a font for one role, corners on cards) comes after
  // the whole-theme dials, so the part keeps its own whatever the order.
  const onPart = (/** @type {Setting} */ x) => !!x.on;
  const ordered = [
    ...data.settings.filter(x => x.source === 'dial' && !onPart(x)),
    ...data.settings.filter(x => x.source === 'dial' && onPart(x)),
    ...data.settings.filter(x => x.source !== 'dial'),
  ];
  // The shell regions a setting gives a background of their own keep it
  // when the page background paints the rest of the shell.
  // A background for one mode is that region's in its mode block only:
  // the page background still paints the region in the other mode.
  const regionsWithOwnBackground = new Set(
    data.settings
      .filter(
        x =>
          x.source === 'property' &&
          !x.mode &&
          /^background(-color|-image)?$/.test(kebab(x.thing)),
      )
      .flatMap(x => partsOf(ctx, x)),
  );
  /** @type {Record<string, any>[]} */
  const fixedToViewport = [];
  for (const s of ordered) {
    // A setting for the mode a one-mode theme does not show still applies
    // where Core draws that mode (a toast, a lightbox), as the theme's other
    // halves of its colors do.
    const parts = partsOf(ctx, s);
    if (s.source === 'dial') {
      if (s.thing === 'corners') {
        // Past 1000px a radius is fully round: the pill tokens apply.
        const px = cornerPx(s.value) >= 1000 ? 9999 : cornerPx(s.value);
        const pill = px >= 9999;
        const rung = CORNERS.some(([n]) => n === s.value);
        /** @param {string} token */
        const derived = token => `${radiusAt(base, s.value, token)}px`;
        if (parts.length)
          for (const t of parts.flatMap(p => cornerParts(ctx, p))) {
            // A radio's circle is no corner: the dial leaves it.
            if (radioCircle(ctx.C, t)) continue;
            // A rung on a part gives what the whole-theme rung gives the
            // radius token the part reads; an exact size is as given.
            {
              const value =
                rung || pill
                  ? derived(radiusTokenOf(ctx, t, s.when))
                  : `${px}px`;
              // (A base rule that writes the part's own radius would win
              // over the token: the radius is written there as before.)
              const token = baseWritesRadius(t, s.when)
                ? null
                : positionalCornerToken(ctx, t);
              putComp(
                {...s, mode: undefined},
                t,
                token ?? 'borderRadius',
                value,
              );
            }
          }
        else {
          for (const token of DIAL_RADII)
            // The radii the build already shows for this corners value (a
            // build by an earlier editor, or a step back) are kept, as the
            // colors are: they change only when corners or the base does.
            putTok(token, ctx.keepRadii?.[token] ?? derived(token));
          // A part rule of the base theme that gives a radius other than the
          // dial token the part reads (a length, or a token the dial never
          // moves, such as --radius-full) would keep it over the dial: the
          // rule is given that dial token, so the part follows the dial. A
          // part Core rounds with a token the dial never moves (a badge's
          // --radius-full) keeps its base radius.
          for (const [t, when, radius] of baseRadii(
            /** @type {{components?: Record<string, any>}} */ (base),
          )) {
            const token = radiusTokenOf(ctx, t, when);
            if (
              ctx.project.target.has(t) &&
              DIAL_RADII.includes(token) &&
              radius !== `var(${token})`
            )
              putComp(
                {...s, mode: undefined, when},
                t,
                'borderRadius',
                `var(${token})`,
              );
          }
        }
      } else if (PALETTE_DIALS.includes(s.thing) || s.thing === 'vibrancy') {
        // The palette mapping above sets these tokens.
      } else if (s.thing === 'font') {
        const f = fontOf(s.value);
        // A family typed alone that the base theme already uses keeps the
        // base's own fallbacks (Fraunces keeps Georgia, serif).
        if (!s.value.includes(',') && !FONTS[s.value] && !OPEN_FONTS[s.value])
          for (const token of [
            '--font-family-heading',
            '--font-family-body',
            '--font-family-code',
          ]) {
            const stack = base.light[token];
            if (!stack || !stack.includes(',')) continue;
            const own = fontOf(stack);
            if (fontKey(own.family) !== fontKey(f.family)) continue;
            // The base's fallbacks as it writes them, quotes and all.
            f.fallbacks = stack.slice(stack.indexOf(',') + 1).trim();
            break;
          }
        theme.typography ??= {};
        for (const r of s.on ? [s.on] : ['body', 'heading'])
          theme.typography[r] = {
            ...(theme.typography[r] ?? {}),
            family: f.family,
            // Code falls back to a monospace font unless the value names
            // its own fallbacks.
            fallbacks:
              r === 'code' &&
              !s.value.includes(',') &&
              !/monospace/.test(f.fallbacks)
                ? 'ui-monospace, monospace'
                : f.fallbacks,
          };
      } else if (s.thing === 'surfaces') {
        for (const t of SURFACE_PARTS.filter(x => ctx.project.target.has(x))) {
          // (A panel floating over the page keeps an edge under flat.)
          const look =
            FLOATING_PANELS.includes(t) && FLOATING_SURFACES[s.value]
              ? FLOATING_SURFACES[s.value]
              : SURFACES[s.value];
          // A frame that paints nothing (the banner's): its line and shadow
          // go on the part inside it that paints the rounded fill, so they
          // follow its corners; a square ring around them otherwise.
          const paintsNone =
            !ctx.C.MAP[t]?.at?.['background-color'] &&
            !ctx.C.MAP[t]?.at?.['border-radius'];
          const fill = paintsNone
            ? (ctx.C.MAP[t]?.contains ?? []).find(
                k =>
                  ctx.C.MAP[k]?.at?.['background-color'] &&
                  ctx.C.MAP[k]?.at?.['border-radius'],
              )
            : undefined;
          if (!fill) {
            Object.assign(block({...s, mode: undefined}, t), look);
            continue;
          }
          const edge = Object.fromEntries(
            Object.entries(look).filter(([k]) => /^(border|boxShadow)/.test(k)),
          );
          const rest = Object.fromEntries(
            Object.entries(look).filter(
              ([k]) => !/^(border|boxShadow)/.test(k),
            ),
          );
          Object.assign(block({...s, mode: undefined}, fill), edge);
          if (Object.keys(rest).length)
            Object.assign(block({...s, mode: undefined}, t), rest);
        }
      } else if (s.thing === 'buttons') {
        const primary = block(
          {...s, mode: undefined, when: 'variant:primary'},
          'button',
        );
        if (s.value === 'outline')
          Object.assign(primary, {
            backgroundColor: 'transparent',
            color: 'var(--color-text-accent)',
            borderStyle: 'solid',
            borderWidth: '1px',
            borderColor: 'var(--color-accent)',
          });
        if (s.value === 'soft')
          Object.assign(primary, {
            backgroundColor: 'var(--color-accent-muted)',
            color: 'var(--color-text-accent)',
          });
        if (s.value === 'caps')
          Object.assign(block({...s, mode: undefined}, 'button'), {
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: '700',
            flexShrink: '0',
          });
      } else if (s.thing === 'type') {
        const T = TYPE_STYLES[s.value];
        theme.typography ??= {};
        // The base is text-size's wherever it sits in the settings.
        const size = [...data.settings]
          .reverse()
          .find(x => x.source === 'dial' && x.thing === 'text-size' && !x.on);
        theme.typography.scale = {
          base: size
            ? textPx(size.value)
            : (theme.typography.scale?.base ?? baseSize),
          ratio: T.ratio,
        };
        if (T.weight && !headingsAxis('weight'))
          for (const k of headingWeightTokens) putTok(k, T.weight);
        if (T.tracking && !headingsAxis('tracking'))
          block({...s, mode: undefined}, 'heading').letterSpacing = T.tracking;
      } else if (s.thing === 'headings') {
        if (s.axis === 'tracking')
          block({...s, mode: undefined}, 'heading').letterSpacing =
            HEADING_TRACKING[s.value];
        else
          for (const k of headingWeightTokens)
            putTok(k, HEADING_WEIGHTS[s.value]);
      } else if (s.thing === 'text-size') {
        theme.typography ??= {};
        // The ratio is type's wherever it sits in the settings.
        const type = [...data.settings]
          .reverse()
          .find(x => x.source === 'dial' && x.thing === 'type');
        theme.typography.scale = {
          base: textPx(s.value),
          ratio: type
            ? TYPE_STYLES[type.value].ratio
            : (theme.typography.scale?.ratio ?? baseRatio),
        };
      } else if (s.thing === 'spacing') {
        const f = SPACING.find(([n]) => n === s.value)?.[1] ?? 1;
        // The rungs scale the spacing the base theme starts from.
        /** @param {string} k @param {string} nv */
        const put = (k, nv) => {
          if (parts.length) {
            // An exact whole-theme or own-source token holds inside the
            // part too.
            if (!keptTokens(null).has(k))
              for (const t of parts) block(s, t)[k] = nv;
          } else putTok(k, nv);
        };
        // The spacing steps, in order around the exact steps the theme
        // keeps (a whole-theme one or the own source's: they win over the
        // dial).
        /** @type {Record<string, string>} */
        const dialVars = {};
        {
          /** @type {Array<[string, number]>} */
          const steps = [];
          for (const [k, core] of Object.entries(
            /** @type {Record<string, string>} */ (TOKENS),
          )) {
            const v = base.light[k] ?? core;
            if (/^--spacing-/.test(k) && /rem$/.test(v))
              steps.push([k, parseFloat(v) * 16]);
          }
          /** @type {Record<string, number>} */
          const keptSteps = {};
          for (const [k, v] of keptTokens(null))
            if (/^--spacing-/.test(k)) {
              const n = sizePx(v);
              if (n != null) keptSteps[k] = n;
            }
          /** @type {string[]} */
          const noRoom = [];
          for (const [k, n] of spacingSteps(steps, f, keptSteps, noRoom)) {
            const nv = `${Number((n / 16).toFixed(3))}rem`;
            dialVars[k] = k in keptSteps ? String(keptTokens(null).get(k)) : nv;
            if (!(k in keptSteps)) put(k, nv);
          }
          for (const k of noRoom)
            (ctx.sizeNotes ??= []).push(
              `${k} has no room between the exact spacing steps kept around it, so it takes the value of the one below it`,
            );
        }
        // An exact size the theme keeps (it wins over the dial) is a fixed
        // point the others stay in order around: a whole-theme one, one of
        // the theme's own source, and on a part the part's own, in any
        // unit that comes to a length (a spacing token through the value
        // this dial gives it). A whole-theme dial also keeps each part's
        // own exact sizes in order on that part.
        const sizeParts = parts.length
          ? parts
          : [
              null,
              ...new Set(
                data.settings
                  .filter(
                    x =>
                      x.source === 'token' &&
                      /^--size-element-/.test(x.thing) &&
                      x.on &&
                      !x.when &&
                      !x.state,
                  )
                  .flatMap(x => partsOf(ctx, x)),
              ),
            ];
        for (const t of sizeParts) {
          /** @type {Record<string, number>} */
          const kept = {};
          for (const [k, v] of keptSizes(t)) {
            const n = sizePx(v, dialVars);
            if (n != null) kept[k] = n;
          }
          /** @type {string[]} */
          const noRoom = [];
          for (const [k, nv] of controlSizes(
            Object.keys(/** @type {Record<string, string>} */ (TOKENS))
              .filter(k => /^--size-element-/.test(k))
              .map(k => [k, base.light[k] ?? TOKENS[k]]),
            f,
            kept,
            noRoom,
          ))
            if (t) block(s, t)[k] = nv;
            else putTok(k, nv);
          for (const k of noRoom)
            (ctx.sizeNotes ??= []).push(
              `${k}${t ? ` on ${t}` : ''} has no room between the exact sizes kept around it, so it takes the size of the one below it`,
            );
        }
        // A variant's own exact size is kept in order on that variant too,
        // with the part's and the theme's kept sizes around it.
        /** @type {Map<string, {t: string, when: string}>} */
        const variantScopes = new Map();
        for (const x of data.settings)
          if (
            x.source === 'token' &&
            /^--size-element-/.test(x.thing) &&
            x.on &&
            x.when &&
            !x.state
          )
            for (const t of partsOf(ctx, x))
              if (!parts.length || parts.includes(t))
                variantScopes.set(`${t} ${x.when}`, {t, when: x.when});
        for (const {t, when} of variantScopes.values()) {
          /** @type {Record<string, number>} */
          const kept = {};
          for (const [k, v] of keptSizes(t)) {
            const n = sizePx(v, dialVars);
            if (n != null) kept[k] = n;
          }
          for (const x of data.settings)
            if (
              x.source === 'token' &&
              /^--size-element-/.test(x.thing) &&
              x.when === when &&
              !x.state &&
              partsOf(ctx, x).includes(t)
            ) {
              const n = sizePx(String(x.value), dialVars);
              if (n != null) kept[x.thing] = n;
            }
          /** @type {string[]} */
          const noRoom = [];
          for (const [k, nv] of controlSizes(
            Object.keys(/** @type {Record<string, string>} */ (TOKENS))
              .filter(k => /^--size-element-/.test(k))
              .map(k => [k, base.light[k] ?? TOKENS[k]]),
            f,
            kept,
            noRoom,
          ))
            block({...s, when}, t)[k] = nv;
          for (const k of noRoom)
            (ctx.sizeNotes ??= []).push(
              `${k} on ${t} when ${when} has no room between the exact sizes kept around it, so it takes the size of the one below it`,
            );
        }
      }
    } else if (s.source === 'token') {
      if (parts.length) for (const t of parts) putComp(s, t, s.thing, s.value);
      else putTok(s.thing, s.value, s.mode);
    } else if (s.source === 'property') {
      // A background on the whole app shell is the page background. The
      // shell's header and side nav paint the body or surface color over it
      // in every variant but section, and in an auto-height shell they are
      // sticky, so content must not show through them when it scrolls: they
      // take the same background. The main content area is made
      // see-through. A gradient is fixed to the viewport on the shell and on
      // those regions, so the regions line up with the page behind them. A
      // background a setting gives one of those regions itself is kept.
      /** @type {string[]} */
      const pageParts = [];
      if (
        parts.includes('app-shell') &&
        /^background(-color|-image)?$/.test(kebab(s.thing)) &&
        !s.when &&
        !s.state
      ) {
        /** @param {Record<string, any>} r */
        const ownBackground = r =>
          ['background', 'backgroundColor', 'backgroundImage'].some(
            k => k in r,
          );
        for (const region of ['app-shell-header', 'app-shell-sidenav'])
          if (
            ctx.project.target.has(region) &&
            !regionsWithOwnBackground.has(region)
          )
            pageParts.push(region);
        // The see-through main area and the fixed attachment go with the
        // page background: in its mode's block for a one-mode one, so the
        // other mode keeps the content panel Core paints.
        // (A main area a setting gives a background of its own, in this
        // mode or in every mode, keeps it: the see-through rule is not
        // written over it, in whichever order the two were set.)
        const panelOwn = data.settings.some(
          x =>
            x.source === 'property' &&
            /^background(-color|-image)?$/.test(kebab(x.thing)) &&
            !x.when &&
            !x.state &&
            (!x.mode || x.mode === s.mode) &&
            partsOf(ctx, x).includes('layout-content'),
        );
        if (ctx.project.target.has('layout-content') && !panelOwn) {
          const lc = ((theme.components['layout-content'] ??= {}).base ??= {});
          const scope = s.mode ? (lc[`@${s.mode}`] ??= {}) : lc;
          const main = (scope[':where(.astryx-app-shell [role="main"])'] ??=
            {});
          if (!ownBackground(main)) main.backgroundColor = 'transparent';
        }
        // Written after every setting (below), so no background shorthand
        // in the same rule resets it.
        if (/gradient\(/.test(String(s.value)))
          for (const t of ['app-shell', ...pageParts])
            fixedToViewport.push(
              s.mode
                ? modeBlock({...s, state: undefined}, t, s.mode)
                : block({...s, mode: undefined}, t),
            );
        (ctx.compileNotes ??= []).push(
          "the page background on app-shell also paints the shell's header and side nav (they stay opaque when content scrolls under them) and makes the main content area see-through; what is drawn inside keeps its colors, and in the default elevated layout the content panel keeps its own surface",
        );
      }
      for (const t of [...parts, ...pageParts]) {
        // A heading takes its color from its color prop, which reads the
        // text color tokens after part styles: the color goes into those
        // tokens on the heading (a named color prop's own token for
        // --when color:<name>), so it shows there and nowhere else.
        if (t === 'heading' && kebab(s.thing) === 'color') {
          const named = /^color:([\w-]+)$/.exec(s.when ?? '')?.[1];
          const scope = named ? {...s, when: undefined} : s;
          for (const tok of named
            ? [`--color-text-${named}`]
            : ['--color-text-primary', '--color-text-secondary'])
            // A value naming one of these tokens (the secondary text color)
            // leaves that token as it is: it would read itself.
            if (!new RegExp(`var\\(\\s*${tok}\\s*[,)]`).test(String(s.value)))
              putComp(scope, t, tok, s.value);
          continue;
        }
        // A part whose text is drawn by elements inside it that read a text
        // color token themselves (a top nav heading's title) takes the color
        // in those tokens too, on the part alone, so that text shows it.
        // A part whose text sits on Core's media surface inside it (a
        // toast's inverted surface) shows the color that surface gives its
        // text: --color-on-dark where it is dark, --color-on-light where it
        // is light. Its text color goes into both, on the part alone.
        if (
          kebab(s.thing) === 'color' &&
          ctx.C.MAP[t]?.media &&
          !ctx.C.MAP[t]?.own?.color
        )
          for (const tok of ['--color-on-dark', '--color-on-light'])
            if (!new RegExp(`var\\(\\s*${tok}\\s*[,)]`).test(String(s.value)))
              putComp(s, t, tok, s.value);
        if (kebab(s.thing) === 'color')
          for (const tok of innerTextTokens(ctx.C, t))
            if (!new RegExp(`var\\(\\s*${tok}\\s*[,)]`).test(String(s.value)))
              putComp(s, t, tok, s.value);
        // A padding on a part whose box reads Core's padding variables is
        // resolved with the rest of that part's padding, below.
        if (padVars(t) && /^padding(-|$)/.test(kebab(s.thing))) {
          queuePadding(s, t);
          continue;
        }
        // A padding on a part without padding variables, where the own source
        // pads some sides of the same rule: the editor writes the other
        // sides only, each as it names it (physical stays physical), so the
        // own sides win; a side the own source holds in one direction only
        // is written for the other direction.
        if (/^padding(-|$)/.test(kebab(s.thing)) && !s.mode && !padVars(t)) {
          const own = ownBox(t, s);
          if (own.ltr.size || own.rtl.size) {
            for (const [x, v] of Object.entries(
              paddingSides(kebab(s.thing), String(s.value)),
            )) {
              const prop = camel(`padding-${x}`);
              const [inL, inR] = [
                own.ltr.has(boxSide(x, 'ltr')),
                own.rtl.has(boxSide(x, 'rtl')),
              ];
              if (inL && inR) continue;
              if (!inL && !inR) {
                putComp(s, t, prop, v);
                continue;
              }
              const [db, key] = dirBlock(s, t, inL ? ':dir(rtl)' : ':dir(ltr)');
              db[key] = {...(db[key] ?? {}), [prop]: v};
            }
            continue;
          }
        }
        // One radius for a part whose corners Core draws by position: its
        // corner token on the part.
        const cornerToken =
          kebab(s.thing) === 'border-radius' &&
          !s.mode &&
          splitTop(String(s.value).trim(), ' ').length === 1 &&
          !String(s.value).includes('/')
            ? baseWritesRadius(t, s.when)
              ? null
              : positionalCornerToken(ctx, t)
            : null;
        const sides = cornerToken
          ? {[cornerToken]: String(s.value)}
          : (wrappedPadding(t, s) ??
            containerSides(t, s) ??
            cornerRadii(t, s) ??
            boxSides(t, s));
        if (sides)
          for (const [k, v] of Object.entries(sides)) {
            // A per-direction block joins what that direction already has,
            // one level deep: under a state it is the state's own key with
            // the direction after it (`:hover:dir(ltr)`), which Core writes
            // as one rule.
            if (k.startsWith(':') && typeof v === 'object') {
              const [b, key] = dirBlock(s, t, k);
              b[key] = {...(b[key] ?? {}), ...v};
            } else putComp(s, t, k, /** @type {string} */ (v));
          }
        else putComp(s, t, camel(s.thing), s.value);
        // A later padding takes out what it covers that would beat it: a
        // physical side written as it is (a group's left under a later part
        // padding; left-to-right, inline-start is the left), and a side
        // written per direction, whose :dir() rule is more specific.
        {
          const prop = kebab(s.thing);
          /** @type {Record<string, Array<'paddingLeft' | 'paddingRight'>>} */
          const COVERS = {
            padding: ['paddingLeft', 'paddingRight'],
            'padding-inline': ['paddingLeft', 'paddingRight'],
            'padding-inline-start': ['paddingLeft'],
            'padding-inline-end': ['paddingRight'],
            'padding-left': [],
            'padding-right': [],
          };
          const plain = COVERS[prop];
          if (plain) {
            const b = block(s, t);
            // A side written per direction leaves a physical side as it is:
            // its :dir(ltr) rule already wins in a left-to-right box, and in
            // a right-to-left one the physical left is still the left.
            const perDirection =
              !!sides && Object.keys(sides).some(x => x.startsWith(':'));
            if (!perDirection)
              for (const k of plain)
                if (b[k] != null && !(sides && k in sides)) delete b[k];
            // Per direction: a whole padding or inline padding covers both
            // sides in both directions; a physical side, that side in both.
            const dirSides =
              prop === 'padding' || prop === 'padding-inline'
                ? ['paddingLeft', 'paddingRight']
                : prop === 'padding-left'
                  ? ['paddingLeft']
                  : prop === 'padding-right'
                    ? ['paddingRight']
                    : [];
            if (
              dirSides.length &&
              !(sides && Object.keys(sides).some(x => x.startsWith(':')))
            )
              for (const d of [':dir(ltr)', ':dir(rtl)']) {
                const [db, key] = dirBlock(s, t, d);
                const rule = db[key];
                if (!rule) continue;
                for (const x of dirSides) delete rule[x];
                if (!Object.keys(rule).length) delete db[key];
              }
          }
        }
        // A part's own corner radii replace a single radius a group or an
        // earlier setting left in the same block, in their own order: the
        // whole radius (which Core turns into the content's radius) before
        // the corners, which the box shows.
        if (sides && 'borderTopLeftRadius' in sides) {
          const b = block(s, t);
          for (const k of Object.keys(sides)) delete b[k];
          Object.assign(b, sides);
        }
      }
    }
  }
  emitPadding();
  for (const r of fixedToViewport) {
    delete r.backgroundAttachment;
    r.backgroundAttachment = 'fixed';
  }
  orderBlocks();
  // Core gives headings the body font when a theme sets only the body's:
  // a font for the body alone keeps the base theme's heading font.
  if (theme.typography?.body && !theme.typography.heading) {
    const heading = base.light['--font-family-heading'];
    if (heading) {
      const f = fontOf(heading);
      theme.typography.heading = {family: f.family, fallbacks: f.fallbacks};
    }
  }
  // A scale steeper or flatter than the standard one changes the headings;
  // the steps below the base text size keep the standard ratio, so small
  // text stays as it was. An exact token setting still wins.
  const scale = theme.typography?.scale;
  if (scale && scale.ratio !== STANDARD_RATIO)
    for (const [k, step] of SMALL_STEPS)
      if (
        !data.settings.some(x => x.source === 'token' && x.thing === k && !x.on)
      )
        putTok(k, `${Math.round(scale.base * STANDARD_RATIO ** step) / 16}rem`);
  // A scale written here replaces the base theme's: its heading weights
  // stay as the theme sets them (a dial or an exact token first, then the
  // base theme). A base weight is written as the weight token it equals
  // (700 is var(--font-weight-bold)), so an exact weight token still feeds
  // it. The heading role carries them too, since Core expands the scale
  // again for phones from the role's weights.
  if (theme.typography?.scale) {
    const weightTokens = Object.keys(TOKENS).filter(k =>
      /^--font-weight-[a-z]+$/.test(k),
    );
    const asRef = (/** @type {string} */ v) => {
      const named = weightTokens.find(w => (base.light[w] ?? TOKENS[w]) === v);
      return named ? `var(${named})` : v;
    };
    /** @type {Record<string, string>} */
    const heading = {};
    for (const k of headingWeightTokens) {
      const level = /^--text-heading-(\d)-weight$/.exec(k)?.[1];
      const weight =
        tok[k]?.light ?? (base.light[k] != null ? asRef(base.light[k]) : null);
      if (weight == null) continue;
      if (!tok[k]) putTok(k, weight);
      if (level) heading[level] = weight;
    }
    if (Object.keys(heading).length)
      theme.typography.heading = {
        ...(theme.typography.heading ?? {}),
        weights: {...(theme.typography.heading?.weights ?? {}), ...heading},
      };
  }
  /**
   * What a token shows in one mode where the theme sets no half for it:
   * Core's own default when that is a reference to another token the base
   * theme's value equals (a focus ring that follows the accent), so it keeps
   * following what the theme sets there; else the base theme's value.
   * @param {string} k @param {'light' | 'dark'} side
   */
  const shownHalf = (k, side) => {
    const held = base[side][k];
    const ref = /^var\((--[\w-]+)\)$/.exec(String(TOKENS[k] ?? '').trim());
    if (ref && (held == null || base[side][ref[1]] === held)) return TOKENS[k];
    return held ?? TOKENS[k];
  };
  // A family follows the token it is made from, in each mode, unless the
  // theme pins it: the fills made from the surface (cards, popovers, the
  // muted fill, code blocks, skeletons) keep the base theme's lightness
  // step from it, and the emphasized border is an opaque border's own
  // color. An exact setting or the theme's own source value always wins.
  /** @param {string} k @param {'light' | 'dark'} m */
  const pinned = (k, m) =>
    k in ownTokenValues() ||
    data.settings.some(
      x =>
        x.source === 'token' &&
        x.thing === k &&
        !x.on &&
        !x.when &&
        !x.state &&
        (!x.mode || x.mode === m),
    );
  /** The color a token shows in a mode, opaque, as hex, or null. @param {string} k @param {'light' | 'dark'} m */
  const written = (k, m) => {
    // (A value written for both modes in one light-dark() is read by its
    // half for the mode, and a token it names to that token's color.)
    /** @param {unknown} raw @param {number} depth @returns {string | null} */
    const half = (raw, depth) => {
      if (raw == null || depth > 4) return null;
      let v = String(raw).trim();
      const pair = /^light-dark\((.*)\)$/s.exec(v);
      if (pair) {
        let depthP = 0;
        let cut = -1;
        for (let i = 0; i < pair[1].length; i++) {
          const ch = pair[1][i];
          if (ch === '(') depthP++;
          else if (ch === ')') depthP--;
          else if (ch === ',' && depthP === 0) {
            cut = i;
            break;
          }
        }
        if (cut < 0) return null;
        v = (
          m === 'light' ? pair[1].slice(0, cut) : pair[1].slice(cut + 1)
        ).trim();
      }
      const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(v)?.[1];
      if (ref) return half(tok[ref]?.[m] ?? base[m]?.[ref], depth + 1);
      return v;
    };
    const v = half(tok[k]?.[m], 0);
    const rgb = v == null ? null : parseColor(v);
    return rgb && alphaOf(v) >= 1 ? hex(rgb) : null;
  };
  /** The base theme's opaque color for a token in a mode, or null. @param {string} k @param {'light' | 'dark'} m */
  const baseColor = (k, m) => {
    const v = base[m]?.[k];
    const rgb = v == null ? null : parseColor(String(v).trim());
    return rgb && alphaOf(String(v)) >= 1 ? hex(rgb) : null;
  };
  for (const m of /** @type {const} */ (['light', 'dark'])) {
    if (modeOnly && m !== modeOnly) continue;
    const surface = pinned('--color-background-surface', m)
      ? written('--color-background-surface', m)
      : null;
    const baseSurface = baseColor('--color-background-surface', m);
    // A fill the base theme keeps between its page and its surface (a dark
    // card the page's own shade) stays between the page and the surface the
    // theme shows: its step never carries it past the page.
    const basePage = baseColor('--color-background-body', m);
    const page =
      written('--color-background-body', m) ?? basePage ?? baseSurface;
    if (surface && baseSurface)
      for (const k of SURFACE_FAMILY) {
        if (!(k in TOKENS || base[m]?.[k] != null) || pinned(k, m)) continue;
        const from = baseColor(k, m);
        if (!from) continue;
        const [sl, sa, sb] = oklabCoordinates(surface);
        const [fromL] = oklabCoordinates(from);
        const [baseSurfaceL] = oklabCoordinates(baseSurface);
        const l = Math.max(0, Math.min(1, sl + fromL - baseSurfaceL));
        let color = oklabCoordinatesToHex([l, sa, sb]);
        if (basePage && page) {
          const [basePageL] = oklabCoordinates(basePage);
          const [pageL] = oklabCoordinates(page);
          const inside = (
            /** @type {number} */ x,
            /** @type {number} */ a,
            /** @type {number} */ b,
          ) => x >= Math.min(a, b) && x <= Math.max(a, b);
          // Measured on the color written, so rounding never carries it
          // past the page: at or past a bound, it is that bound's color.
          if (
            inside(fromL, basePageL, baseSurfaceL) &&
            !inside(oklabCoordinates(color)[0], pageL, sl)
          )
            color = Math.abs(l - pageL) <= Math.abs(l - sl) ? page : surface;
        }
        putTok(k, color, m);
      }
    // The emphasized border (input and selector frames) is never fainter
    // than the border: an opaque border stronger than it on the surface
    // carries it; a fainter one leaves it as it is.
    const border = pinned('--color-border', m)
      ? written('--color-border', m)
      : null;
    const emphasized =
      written('--color-border-emphasized', m) ??
      baseColor('--color-border-emphasized', m);
    const ground =
      written('--color-background-surface', m) ??
      baseColor('--color-background-surface', m);
    if (
      border &&
      !pinned('--color-border-emphasized', m) &&
      (!emphasized ||
        !ground ||
        ratio(
          /** @type {[number, number, number]} */ (parseColor(border)),
          /** @type {[number, number, number]} */ (parseColor(ground)),
        ) >
          ratio(
            /** @type {[number, number, number]} */ (parseColor(emphasized)),
            /** @type {[number, number, number]} */ (parseColor(ground)),
          ))
    )
      putTok('--color-border-emphasized', border, m);
  }
  // A flat panel is tinted with the muted fill. The pieces inside it drawn
  // in that same color (a neutral badge, a track, whatever token the base
  // theme draws them from) would vanish into the tint, so inside the panel
  // each fill that shows as the tint is the panel's own surface instead (as
  // on a raised card, the other way round), and the emphasized border is
  // stepped where it stands out less from the tint than from that surface.
  // The tint is written as the colors it shows, since the panel then points
  // the muted fill elsewhere.
  /** The color a token shows in a mode, as hex, or null. @param {string} k @param {'light' | 'dark'} m */
  const shown = (k, m) => {
    let v = String(tok[k]?.[m] ?? base[m]?.[k] ?? '');
    for (let i = 0; i < 4; i++) {
      const ref = /^var\((--[\w-]+)\)$/.exec(v.trim())?.[1];
      if (!ref) break;
      v = String(tok[ref]?.[m] ?? base[m]?.[ref] ?? '');
    }
    const rgb = parseColor(v.trim());
    return rgb && alphaOf(v) >= 1 ? hex(rgb) : null;
  };
  for (const t of SURFACE_PARTS) {
    const own = /^var\((--[\w-]+)\)$/.exec(
      String(ctx.C.MAP[t]?.own?.['background-color']?.values?.[0] ?? ''),
    )?.[1];
    for (const b of Object.values(
      /** @type {Record<string, Record<string, unknown>>} */ (
        theme.components[t] ?? {}
      ),
    )) {
      if (b?.backgroundColor !== 'var(--color-background-muted)' || !own)
        continue;
      /** @type {Partial<Record<'light' | 'dark', string>>} */
      const tint = {};
      /** @type {Partial<Record<'light' | 'dark', string>>} */
      const edge = {};
      // A mode in which the theme gives the panel a fill of its own (white
      // cards) shows that fill, not the tint: its pieces stay as they are.
      /** @param {'light' | 'dark'} m */
      const ownFill = m =>
        data.settings.some(
          x =>
            x.source === 'property' &&
            /^background(-color)?$/.test(x.thing) &&
            !x.state &&
            (!x.mode || x.mode === m) &&
            partsOf(ctx, x).includes(t),
        );
      for (const m of /** @type {const} */ (['light', 'dark'])) {
        const fill = shown('--color-background-muted', m);
        const surface = shown(own, m);
        const line = shown('--color-border-emphasized', m);
        if (!fill) continue;
        tint[m] = fill;
        if (!surface || !line || ownFill(m)) continue;
        const rgb = (/** @type {string} */ x) =>
          /** @type {[number, number, number]} */ (parseColor(x));
        const need = ratio(rgb(line), rgb(surface));
        let [l, a, bb] = oklabCoordinates(line);
        const away = oklabCoordinates(fill)[0] > 0.5 ? -1 : 1;
        let stepped = line;
        for (let i = 0; i < 40 && ratio(rgb(stepped), rgb(fill)) < need; i++) {
          l = Math.max(0, Math.min(1, l + away * 0.02));
          stepped = oklabCoordinatesToHex([l, a, bb]);
        }
        if (stepped !== line) edge[m] = stepped;
      }
      if (!tint.light && !tint.dark) continue;
      b.backgroundColor =
        tint.light && tint.dark && tint.light !== tint.dark
          ? `light-dark(${tint.light}, ${tint.dark})`
          : (tint.light ?? tint.dark);
      for (const k of Object.keys(TOKENS).filter(isPieceFill)) {
        if (k === own) continue;
        /** @type {Partial<Record<'light' | 'dark', boolean>>} */
        const blends = {};
        for (const m of /** @type {const} */ (['light', 'dark'])) {
          const v = shown(k, m);
          const f = tint[m];
          if (ownFill(m)) {
            blends[m] = false;
            continue;
          }
          // A gray piece reads as the tint when it is near its lightness; a
          // colored one (a status or category fill) keeps its hue.
          blends[m] =
            k === '--color-background-muted' ||
            Boolean(
              v &&
              f &&
              hexToOklch(v).C < GRAY_PIECE &&
              ratio(
                /** @type {[number, number, number]} */ (parseColor(v)),
                /** @type {[number, number, number]} */ (parseColor(f)),
              ) < BLENDS,
            );
        }
        if (blends.light && blends.dark) b[k] = `var(${own})`;
        else if (blends.light || blends.dark)
          b[k] =
            `light-dark(${blends.light ? `var(${own})` : shown(k, 'light')}, ${blends.dark ? `var(${own})` : shown(k, 'dark')})`;
      }
      if (edge.light || edge.dark)
        b['--color-border-emphasized'] =
          `light-dark(${edge.light ?? shown('--color-border-emphasized', 'light')}, ${edge.dark ?? shown('--color-border-emphasized', 'dark')})`;
    }
  }
  for (const [k, {light, dark}] of Object.entries(tok)) {
    const l = light ?? shownHalf(k, 'light');
    const d = dark ?? shownHalf(k, 'dark');
    // A pair only for a color: anything else (a shadow) is one value, the
    // one the theme's mode shows.
    theme.tokens[k] =
      l === d
        ? l
        : ctx.C.typeOf(k) === 'color' || isColorToken(k)
          ? [l, d]
          : modeOnly === 'dark'
            ? d
            : l;
  }
  // A role color the theme sets reaches the parts where the base theme
  // draws that role on its own (see roleReach). What the theme sets on the
  // part itself stays.
  for (const r of roleReach(ctx, data, base)) {
    const mine = r.value ?? theme.tokens[r.prop];
    if (mine == null) continue;
    const b = block(
      /** @type {Setting} */ ({thing: '', value: '', when: r.when}),
      r.part,
    );
    b[r.prop] ??= Array.isArray(mine)
      ? `light-dark(${mine[0]}, ${mine[1]})`
      : String(mine);
  }
  // Base themes set the type tokens again for phones (a coarse pointer
  // below the lg width); an exact font family or weight, and the headings
  // dial's weights, are written there too, so they apply on every screen.
  // Sizes are not: phones keep their reading base. (What the theme's own
  // source sets is not repeated: on phones the base theme's type comes
  // back for it, by Core contract; the notes name the fix.)
  const phone = Object.fromEntries([
    ...data.settings
      .filter(
        x =>
          x.source === 'token' &&
          !x.on &&
          !x.mode &&
          PHONE_TYPE.test(x.thing) &&
          !(modeOnly && x.mode && x.mode !== modeOnly),
      )
      .map(x => [x.thing, x.value]),
  ]);
  // The headings dial's weights, unless an exact token sets one.
  const headingsWeight = [...data.settings]
    .reverse()
    .find(x => x.thing === 'headings' && x.axis !== 'tracking' && !x.on);
  if (headingsWeight && HEADING_WEIGHTS[headingsWeight.value])
    for (const k of headingWeightTokens)
      phone[k] ??= HEADING_WEIGHTS[headingsWeight.value];
  if (Object.keys(phone).length)
    theme.adaptations = {
      rules: [
        {
          when: PHONE_RULE_WHEN,
          value: {tokens: phone},
        },
      ],
    };
  // A longhand set after a shorthand that covers it is the one in effect,
  // as the result says. The build merges these blocks over the base
  // theme's, and a key the base holds keeps the base's (earlier) place, so
  // such a longhand would come before the shorthand and lose: it is written
  // as its own sides instead, which the base does not hold.
  const baseBlocks =
    /** @type {{components?: Record<string, any>}} */ (base).components ?? {};
  for (const [target, keys] of Object.entries(theme.components ?? {}))
    for (const [key, b] of Object.entries(
      /** @type {Record<string, any>} */ (keys),
    ))
      laterLonghandsAsSides(b, baseBlocks[target]?.[key]);
  if (!Object.keys(theme.tokens).length) delete theme.tokens;
  if (!Object.keys(theme.components).length) delete theme.components;
  return theme;
}

/**
 * Whether shorthand `a` sets `b`, a logical side included: padding sets
 * padding-inline, border-color sets border-inline-start-color.
 * @param {string} a @param {string} b
 */
function coversSide(a, b) {
  if (coversProperty(a, b)) return true;
  const root = b.replace(/-(inline|block)(-start|-end)?(?=-|$)/, '');
  return root !== b && (a === root || coversProperty(a, root));
}

/**
 * The part rules of a base theme that give a border radius: each as its
 * part, the rule's --when (undefined for the plain rule) and the radius.
 * @param {{components?: Record<string, any>}} base
 * @returns {Array<[string, string | undefined, string]>}
 */
function baseRadii(base) {
  /** @type {Array<[string, string | undefined, string]>} */
  const out = [];
  for (const [t, rules] of Object.entries(base.components ?? {}))
    for (const [key, rule] of Object.entries(
      /** @type {Record<string, any>} */ (rules ?? {}),
    )) {
      if (key !== 'base' && !/^[\w-]+:[\w-]+$/.test(key)) continue;
      const r = rule?.borderRadius;
      if (typeof r === 'string')
        out.push([t, key === 'base' ? undefined : key, r.trim()]);
    }
  return out;
}

/**
 * Whether a setting's own value is a background with an image layer, so any
 * color it writes is that background's bottom layer.
 * @param {Setting} s
 */
function ownImageLayer(s) {
  return (
    kebab(s.thing) === 'background' && /gradient\(|url\(/i.test(String(s.value))
  );
}

/**
 * A background shorthand split into its image layers and the color its
 * last layer may carry (the color under every image): a color word beside
 * the last image, or a last layer that is a color alone.
 * @param {string} value
 * @returns {{images: string, color: string | null}}
 */
export function backgroundColorLayer(value) {
  const layers = splitTop(value, ',')
    .map(x => x.trim())
    .filter(Boolean);
  const last = layers.at(-1) ?? '';
  const words = splitTop(last, ' ').map(x => x.trim());
  const at = words.findIndex(
    w => !/gradient\(|url\(/i.test(w) && isColorValue(w),
  );
  if (at < 0) return {images: value, color: null};
  const rest = words.filter((_, i) => i !== at).join(' ');
  return {
    images: [...layers.slice(0, -1), ...(rest ? [rest] : [])].join(', '),
    color: words[at],
  };
}

/**
 * A background layer's image (its gradient) and what follows it, as the
 * background longhands take them: position, size (after a slash) and
 * repeat.
 * @param {string} layer
 * @returns {{image: string, position: string, size: string, repeat: string}}
 */
function layerParts(layer) {
  const fn = /^((?:repeating-)?(?:linear|radial|conic)-gradient)\(/i.exec(
    layer,
  );
  if (!fn) return {image: layer, position: '', size: '', repeat: ''};
  let depth = 0;
  let end = layer.length - 1;
  for (let i = fn[0].length - 1; i < layer.length; i++) {
    if (layer[i] === '(') depth++;
    if (layer[i] === ')' && --depth === 0) {
      end = i;
      break;
    }
  }
  const rest = splitTop(layer.slice(end + 1).trim(), ' ');
  const REPEAT = /^(repeat|no-repeat|repeat-x|repeat-y|space|round)$/i;
  const repeat = rest.filter(w => REPEAT.test(w)).join(' ');
  const words = rest.filter(w => !REPEAT.test(w)).join(' ');
  const [position = '', size = ''] = words.split('/').map(x => x.trim());
  return {image: layer.slice(0, end + 1), position, size, repeat};
}

/** A side word in a longhand's name, in the order a box value lists sides. */
const BOX_SIDES = ['top', 'right', 'bottom', 'left'];

/**
 * The fills made from the surface: they follow a surface the theme sets,
 * at the base theme's lightness step from it.
 */
const SURFACE_FAMILY = [
  '--color-background-card',
  '--color-background-popover',
  '--color-background-muted',
  '--color-syntax-background',
  '--color-skeleton',
];

/**
 * The fills the pieces inside a panel are drawn from (a badge, a track, a
 * placeholder): Core's background tokens other than the page's and the
 * panels' own, and the skeleton.
 */
/** @param {string} k */
const isPieceFill = k =>
  (/^--color-background-/.test(k) &&
    !/^--color-background-(body|surface|card|popover|inverted)$/.test(k)) ||
  k === '--color-skeleton';

/** Below this contrast a gray piece reads as the tint it sits on. */
const BLENDS = 1.25;

/** Below this OKLCH chroma a piece's fill reads as a gray. */
const GRAY_PIECE = 0.02;

/**
 * The tokens that follow another one the theme sets exactly (where it
 * does not set them itself): each with the token it follows.
 */
export const FOLLOWS = Object.freeze(
  /** @type {Record<string, string>} */ ({
    ...Object.fromEntries(
      SURFACE_FAMILY.map(k => [k, '--color-background-surface']),
    ),
    '--color-border-emphasized': '--color-border',
  }),
);

/**
 * A block's longhands that follow a shorthand covering them, where the base
 * theme's block holds the same key, rewritten as that longhand's own sides
 * (padding-inline as padding-inline-start and -end, border-color as the
 * four side colors), in place and at the same position; a state's block
 * nested in it too. A longhand that is no side pair or box is kept.
 * @param {Record<string, any>} b
 * @param {Record<string, any> | undefined} baseBlock
 */
function laterLonghandsAsSides(b, baseBlock) {
  if (
    !b ||
    typeof b !== 'object' ||
    !baseBlock ||
    typeof baseBlock !== 'object'
  )
    return;
  for (const [k, v] of Object.entries(b))
    if (k.startsWith(':') && v && typeof v === 'object')
      laterLonghandsAsSides(v, baseBlock[k]);
  const keys = Object.keys(b);
  /** @type {Record<string, any>} */
  const out = {};
  let changed = false;
  keys.forEach((k, i) => {
    const v = b[k];
    const css = kebab(k);
    const sides =
      typeof v === 'string' &&
      !k.startsWith('-') &&
      typeof baseBlock[k] === 'string' &&
      keys
        .slice(0, i)
        .some(e => !e.startsWith(':') && coversSide(kebab(e), css))
        ? sidesOf(css, v)
        : null;
    if (!sides) {
      out[k] = v;
      return;
    }
    changed = true;
    for (const [p, x] of Object.entries(sides)) {
      delete out[camel(p)];
      out[camel(p)] = x;
    }
  });
  if (!changed) return;
  for (const k of Object.keys(b)) delete b[k];
  Object.assign(b, out);
}

/**
 * A two-sided (start/end) or four-sided (top/right/bottom/left) longhand's
 * value, as each side's property and value by the shorthand rules; null for
 * any other property.
 * @param {string} prop kebab-case
 * @param {string} v
 * @returns {Record<string, string> | null}
 */
function sidesOf(prop, v) {
  const direct = [...longhandsOf(prop)].filter(p => longhandsOf(p).size === 0);
  const w = splitTop(v.trim(), ' ').map(x => x.trim());
  if (!w.length || /!important/i.test(v)) return null;
  const start = direct.find(p => /-start(-|$)/.test(p));
  const end = direct.find(p => /-end(-|$)/.test(p));
  if (direct.length === 2 && start && end && w.length <= 2)
    return {[start]: w[0], [end]: w[1] ?? w[0]};
  const named = BOX_SIDES.map(side =>
    direct.find(p => new RegExp(`-${side}(-|$)`).test(p)),
  );
  if (direct.length !== 4 || named.some(x => !x) || w.length > 4) return null;
  const [t, r = t, bo = t, l = r] = w;
  const vals = [t, r, bo, l];
  return Object.fromEntries(
    named.map((p, i) => [/** @type {string} */ (p), vals[i]]),
  );
}

/** Core's default type scale ratio. */
const STANDARD_RATIO = 1.2;
/** The font-size tokens below the base, with their step on the scale. */
const SMALL_STEPS = /** @type {Array<[string, number]>} */ ([
  ['--font-size-sm', -1],
  ['--font-size-xs', -2],
  ['--font-size-2xs', -3],
  ['--font-size-3xs', -4],
  ['--font-size-4xs', -5],
]);

/**
 * Settings whose effect a later or stronger setting hides, with why: `type`
 * loses heading weight and tracking to `headings`.
 * @param {ThemeData} data
 * @param {Ctx | null} [ctx] with it, a later setting that reaches the parts through a spread counts too
 * @returns {Map<Setting, string>}
 */
export function maskedSettings(data, ctx = null) {
  /** @type {Map<Setting, string>} */
  const out = new Map();
  const axes = new Set(
    data.settings
      .filter(x => x.thing === 'headings')
      .map(x => x.axis ?? 'weight'),
  );
  // A part setting that a later setting on a group holding that part
  // covers: the later one is written after it, so it wins.
  data.settings.forEach((s, i) => {
    if (s.source !== 'dial' || !s.on || FAMILIES[s.on]) return;
    const later = data.settings
      .slice(i + 1)
      .find(
        x =>
          x.thing === s.thing &&
          x.on &&
          (FAMILIES[x.on] ?? []).includes(/** @type {string} */ (s.on)) &&
          (x.when ?? '') === (s.when ?? '') &&
          (x.state ?? '') === (s.state ?? ''),
      );
    if (later)
      out.set(
        s,
        `${describe(later)} comes later and covers ${s.on}, so ${s.on} shows ${later.value}; set ${s.on} again to make it win`,
      );
  });
  // With the parts known: a later setting of the same thing that reaches
  // every part an earlier one styles (a member that spreads to its group,
  // the same part without --only), dial or CSS property, covers it too.
  if (ctx)
    data.settings.forEach((s, i) => {
      if (
        out.has(s) ||
        !s.on ||
        (s.source !== 'dial' && s.source !== 'property')
      )
        return;
      const mine = partsOf(ctx, s);
      if (!mine.length) return;
      const later = data.settings
        .slice(i + 1)
        .find(
          x =>
            x.thing === s.thing &&
            x.source === s.source &&
            x.on &&
            (x.when ?? '') === (s.when ?? '') &&
            (x.state ?? '') === (s.state ?? '') &&
            (x.mode ?? '') === (s.mode ?? '') &&
            mine.every(t => partsOf(ctx, x).includes(t)),
        );
      if (later)
        out.set(
          s,
          `${describe(later)} comes later and covers ${s.on}, so ${s.on} shows ${later.value}; set ${s.on} again to make it win`,
        );
    });
  for (const s of data.settings) {
    if (s.thing !== 'type' || !axes.size) continue;
    const T = TYPE_STYLES[s.value];
    const hidden = [
      ...(T?.weight && axes.has('weight') ? ['weight'] : []),
      ...(T?.tracking && axes.has('tracking') ? ['tracking'] : []),
    ];
    if (hidden.length)
      out.set(
        s,
        `type still sets the heading sizes and line heights; heading ${hidden.join(' and ')} come${hidden.length > 1 ? '' : 's'} from headings`,
      );
  }
  return out;
}

/**
 * A style key in one spelling: each condition as `prop:value` (a bare state
 * `selected` is `selected:selected`), in order, as Core's parseStyleKey
 * writes the selector.
 * @param {string} key
 */
function styleKeyOf(key) {
  if (key === 'base') return key;
  return key
    .split('+')
    .map(part => (part.includes(':') ? part : `${part}:${part}`))
    .sort()
    .join('+');
}

/**
 * A plain part setting can lose to a more specific rule for the same part
 * and property, such as a base theme's `.astryx-heading[data-level="1"]
 * {font-weight}`. Find those rules in the built stylesheet.
 * @param {string} cssText
 * @param {any} theme
 * @returns {Array<{target: string, key: string, prop: string, value: string, state?: string}>}
 */
export function findOverrides(cssText, theme) {
  /** @type {Array<{target: string, key: string, prop: string, value: string, state?: string}>} */
  const extra = [];
  for (const [target, keys] of Object.entries(
    /** @type {Record<string, any>} */ (theme.components ?? {}),
  )) {
    const props = Object.keys(keys.base ?? {}).filter(
      p => !p.startsWith('--') && !p.startsWith(':') && !p.startsWith('@'),
    );
    if (!props.length) continue;
    const re = new RegExp(
      `\\.astryx-${target.replace(/-/g, '\\-')}\\[data-([a-z-]+)="([^"]+)"\\]\\s*\\{([^}]*)\\}`,
      'g',
    );
    // A shorthand and its longhands are one property: the last one set
    // (background after background-color) is the one in effect. Which
    // longhands a shorthand sets is MDN's data (background-blend-mode is
    // no part of background).
    /** @param {string} a @param {string} b */
    const sameProperty = (a, b) => {
      const [x, y] = [kebab(a), kebab(b)];
      return x === y || coversProperty(x, y) || coversProperty(y, x);
    };
    const last = props.filter(
      (p, i) => !props.slice(i + 1).some(later => sameProperty(later, p)),
    );
    for (const m of cssText.matchAll(re)) {
      for (const prop of last) {
        // A prop named for the property itself (weight for font-weight,
        // color for color) is the author's own choice: it keeps winning.
        const css = kebab(prop);
        if (css === m[1] || css.endsWith(`-${m[1]}`)) continue;
        // The override may set the property or one of its longhands.
        const declared = [...m[3].matchAll(/(?:^|[;\s])([a-z-]+)\s*:/g)].map(
          d => d[1],
        );
        if (declared.some(d => sameProperty(d, css)))
          extra.push({
            target,
            key: `${m[1]}:${m[2]}`,
            prop,
            value: keys.base[prop],
          });
      }
    }
  }
  // A state setting on the plain part (a whole-part hover) loses the same
  // way to a variant's own rule in that state: it is repeated there too.
  for (const [target, keys] of Object.entries(
    /** @type {Record<string, any>} */ (theme.components ?? {}),
  ))
    for (const [state, decl] of Object.entries(keys.base ?? {})) {
      if (!/^:[a-z-]+$/.test(state) || !decl || typeof decl !== 'object')
        continue;
      const props = Object.keys(decl).filter(
        p => !p.startsWith('--') && !p.startsWith(':'),
      );
      if (!props.length) continue;
      const re = new RegExp(
        `\\.astryx-${target.replace(/-/g, '\\-')}\\[data-([a-z-]+)="([^"]+)"\\](?:${state}(?![\\w-])[^{}]*|\\s*)\\{([^}]*)\\}`,
        'g',
      );
      // The variant's own rule in that state, and its resting rule: that
      // one comes after the plain state rule at the same weight.
      const seen = new Set();
      for (const m of cssText.matchAll(re)) {
        const declared = [...m[3].matchAll(/(?:^|[;\s])([a-z-]+)\s*:/g)].map(
          d => d[1],
        );
        for (const prop of props) {
          const css = kebab(prop);
          if (css === m[1] || css.endsWith(`-${m[1]}`)) continue;
          if (
            !seen.has(`${m[1]}:${m[2]} ${prop}`) &&
            declared.some(
              d =>
                d === css || coversProperty(d, css) || coversProperty(css, d),
            )
          ) {
            seen.add(`${m[1]}:${m[2]} ${prop}`);
            extra.push({
              target,
              key: `${m[1]}:${m[2]}`,
              state,
              prop,
              value: decl[prop],
            });
          }
        }
      }
    }
  return extra;
}

/**
 * The CSS value of lifted secondary text: one color in a one-mode theme,
 * else light-dark().
 * @param {Partial<Record<'light' | 'dark', {color: string}>>} lift
 * @param {'light' | 'dark' | null} only
 */
const liftValue = (lift, only) =>
  only
    ? String(lift[only]?.color)
    : `light-dark(${lift.light?.color}, ${lift.dark?.color})`;

/**
 * The generated theme source. A token the palette mapping set, and no exact
 * token setting replaced, reads its palette stop from the generated palette
 * module, so a regenerated palette moves the theme with it.
 * @param {string} slug
 * @param {ThemeData} data
 * @param {any} theme
 * @param {import('./_palette.mjs').PaletteMapping | null} pal
 * @param {string} [cwd]
 * @param {Record<string, any> | null} [baseParts] the base theme's components, whose state objects each written one starts from
 */
function settingsSource(slug, data, theme, pal, cwd = '', baseParts = null) {
  // Core merges a theme's state object (`:hover` in a rule) over the base
  // theme's whole, one level deep: each one starts as the base theme's own
  // for that rule, so the properties no setting names keep the base's.
  if (baseParts) {
    theme = {...theme, components: {...(theme.components ?? {})}};
    for (const [target, keys] of Object.entries(theme.components)) {
      /** @type {Record<string, any>} */
      const next = {};
      for (const [key, rule] of Object.entries(
        /** @type {Record<string, any>} */ (keys),
      )) {
        if (!rule || typeof rule !== 'object') {
          next[key] = rule;
          continue;
        }
        /** @type {Record<string, any>} */
        const r = {...rule};
        for (const [k, v] of Object.entries(rule)) {
          const own = baseParts[target]?.[key]?.[k];
          if (
            k.startsWith(':') &&
            v &&
            typeof v === 'object' &&
            own &&
            typeof own === 'object'
          )
            r[k] = {...own, ...v};
        }
        next[key] = r;
      }
      theme.components[target] = next;
    }
  }
  const like = data.like;
  const REF = '@@palette:';
  /** @param {string} family @param {'light' | 'dark'} m @param {import('./_palette.mjs').StopRef} r */
  const refOf = (family, m, r) =>
    r.family === 'black' || r.family === 'white'
      ? `${REF}${r.family}`
      : `${REF}${r.family ?? family}.${m}.${r.stop}${r.alpha ? `+${r.alpha}` : ''}`;
  const out = {...theme, name: settingsThemeName(slug)};
  // A one-mode theme keeps both halves too (see compileTheme).
  if (pal && theme.tokens) {
    out.tokens = {...theme.tokens};
    for (const [k, v] of Object.entries(pal.tokens)) {
      const now = theme.tokens[k];
      const [l, d] = Array.isArray(now) ? now : [now, now];
      if (l !== v.light.color || d !== v.dark.color) continue;
      out.tokens[k] = [
        refOf(v.family, 'light', v.light),
        refOf(v.family, 'dark', v.dark),
      ];
    }
  }
  // A lifted part reads the neutral color's stops too.
  if (pal?.lift && out.components) {
    out.components = {...out.components};
    for (const [target, key, ground] of LIFT_PARTS) {
      const lift = pal.lift[ground];
      if (!lift) continue;
      const literal = liftValue(lift, null);
      /** A shade of the neutral palette as a reference; a color as it is. @param {'light' | 'dark'} m */
      const one = m => {
        const r = /** @type {any} */ (lift[m]);
        return r.family === 'literal' ? r.color : refOf('neutral', m, r);
      };
      const refs = `light-dark(${one('light')}, ${one('dark')})`;
      const block = out.components[target]?.[key];
      if (block?.['--color-text-secondary'] !== literal) continue;
      out.components[target] = {
        ...out.components[target],
        [key]: {...block, '--color-text-secondary': refs},
      };
    }
  }
  let usesPalette = false;
  const body = JSON.stringify(out, null, 2)
    .replace(
      /"@@palette:(?:(black|white)|([a-z][a-z0-9-]*)\.(light|dark)\.(\d+(?:\.\d+)?)(?:\+([0-9a-f]{2}))?)"/g,
      (_, end, family, m, stop, alpha) => {
        usesPalette = true;
        if (end) return `palette.${end}`;
        return `palette${/^[a-z]\w*$/.test(family) ? `.${family}` : `[${JSON.stringify(family)}]`}.${m}[${stop}]${alpha ? ` + '${alpha}'` : ''}`;
      },
    )
    .replace(
      // A stop inside a longer value (light-dark()) becomes a template.
      /"([^"\n]*@@palette:[^"\n]*)"/g,
      (_, inner) => {
        usesPalette = true;
        return `\`${inner.replace(
          /@@palette:([a-z][a-z0-9-]*)\.(light|dark)\.(\d+(?:\.\d+)?)/g,
          (
            /** @type {string} */ __,
            /** @type {string} */ family,
            /** @type {string} */ m,
            /** @type {string} */ stop,
          ) =>
            `\${palette${/^[a-z]\w*$/.test(family) ? `.${family}` : `[${JSON.stringify(family)}]`}.${m}[${stop}]}`,
        )}\``;
      },
    );
  return sealModule(
    [
      `// Generated by \`${P}\` from ${slug}.settings.json on every change: do not edit.`,
      `// Built from settings ${settingsStamp(data)}.`,
      // The theme source as it is when the build starts (the editor's
      // own when the build writes it), so an own change to it after the
      // build is told by content.
      ...(cwd
        ? [`// Built with ${slug}.theme.ts ${themeSourceHash(cwd, slug)}.`]
        : []),
      ...(like && cwd
        ? [
            `// Built on @astryxdesign/theme-${like} ${baseVersionOf(cwd, like) ?? 'unknown'}.`,
          ]
        : []),
      `// Change it with \`${P} set ${slug} ...\`; your own changes go in ${slug}.theme.ts.`,
      "import {defineTheme} from '@astryxdesign/core/theme';",
      ...(like
        ? [
            `import {${like}Theme as base} from '@astryxdesign/theme-${like}/built';`,
          ]
        : []),
      ...(usesPalette ? [paletteImport(slug)] : []),
      '',
      `export const ${camel(slug)}Settings = defineTheme({`,
      ...(like ? ['  extends: base,'] : []),
      ...body.split('\n').slice(1, -1),
      '});',
      '',
    ].join('\n'),
  );
}

/**
 * A hash of a theme's source file as the next build reads it: the file, or
 * the source the editor writes when there is none.
 * @param {string} cwd
 * @param {string} slug
 */
function themeSourceHash(cwd, slug) {
  const f = themeFiles(cwd, slug);
  const hash = createHash('sha256');
  if (!fs.existsSync(f.ts)) {
    // The same as the file the build is about to write would hash.
    hash.update(`${path.basename(f.ts)}\0`);
    hash.update(themeModuleSource(slug));
    return hash.digest('hex').slice(0, 16);
  }
  for (const file of ownSourceFiles(cwd, slug)) {
    hash.update(`${path.relative(f.dir, file)}\0`);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * The theme source and every local module it reaches (an own helper such
 * as ./my-tokens), read the way theme discovery reads them: the person's
 * files. The editor's generated modules change with each build and are
 * judged by their own stamps.
 * @param {string} cwd
 * @param {string} slug
 * @returns {string[]}
 */
function ownSourceFiles(cwd, slug) {
  const f = themeFiles(cwd, slug);
  if (!fs.existsSync(f.ts)) return [];
  const generated = new Set([f.settingsTs]);
  const seen = new Set();
  /** @type {string[]} */
  const files = [];
  const queue = [f.ts];
  while (queue.length) {
    const file = /** @type {string} */ (queue.shift());
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(file);
    /** @type {string[]} */
    let specifiers = [];
    try {
      specifiers = themeFileImports(file, {withRequire: true});
    } catch {
      // A file that does not parse is hashed as it is; the build names it.
    }
    for (const spec of specifiers) {
      if (!spec.startsWith('.')) continue;
      const target = localModuleFile(path.dirname(file), spec);
      // Only the editor's own generated palette files are judged by their
      // stamps; any other file the theme reaches, in tokens/ too, is the
      // person's.
      if (
        target &&
        !generated.has(target) &&
        !isGeneratedPaletteFile(f.dir, slug, target)
      )
        queue.push(target);
    }
  }
  return files;
}

/** The extensions a theme's local module may have, as the build reads them. */
const MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
];

/**
 * The file a relative import names, resolved as TypeScript resolves it: a
 * JavaScript extension names its TypeScript source (`.js` → `.ts`/`.tsx`,
 * `.jsx` → `.tsx`, `.mjs` → `.mts`, `.cjs` → `.cts`), then the path as
 * written, with each module extension, and as a folder's index file.
 * @param {string} dir
 * @param {string} spec
 * @returns {string | undefined}
 */
export function localModuleFile(dir, spec) {
  const base = path.resolve(dir, spec);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  const sourceFor = /** @type {Record<string, string[]>} */ ({
    '.js': ['.ts', '.tsx'],
    '.jsx': ['.tsx'],
    '.mjs': ['.mts'],
    '.cjs': ['.cts'],
  })[ext];
  return [
    ...(sourceFor ?? []).map(x => stem + x),
    base,
    ...MODULE_EXTENSIONS.map(x => base + x),
    ...MODULE_EXTENSIONS.map(x => path.join(base, `index${x}`)),
  ].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
}

/**
 * Whether a file is one of the palette files the editor generates in a
 * theme's tokens/ folder (`tokens/<slug>.palette*`).
 * @param {string} dir the theme folder
 * @param {string} slug
 * @param {string} file
 */
function isGeneratedPaletteFile(dir, slug, file) {
  const rel = path.relative(path.join(dir, 'tokens'), file);
  return (
    !rel.startsWith('..') &&
    !path.isAbsolute(rel) &&
    !rel.includes(path.sep) &&
    rel.startsWith(`${slug}.palette`)
  );
}

/**
 * The theme module, written once: it extends the generated settings and is
 * the person's own from then on, so hand edits in it survive every change.
 * @param {string} slug
 */
function themeModuleSource(slug) {
  return [
    `// The ${slug} theme. \`${P}\` wrote this file once and never changes it again.`,
    `// The checked settings live in ${slug}.settings.json and the generated ${slug}.settings.ts;`,
    `// change them with \`${P} set ${slug} ...\`. Add your own changes below: they win over the settings.`,
    "import {defineTheme} from '@astryxdesign/core/theme';",
    `import {${camel(slug)}Settings} from './${slug}.settings';`,
    '',
    `export const ${camel(slug)}Theme = defineTheme({`,
    `  extends: ${camel(slug)}Settings,`,
    `  name: '${slug}',`,
    '});',
    '',
  ].join('\n');
}

/** The theme source as the editor first writes it. @param {string} slug */
export const themeSource = slug => themeModuleSource(slug);

/**
 * The name of the theme a settings module defines.
 * @param {string} slug
 */
export const settingsThemeName = slug => `${slug}-settings`;

/**
 * Why a theme's source cannot carry its settings, with the step that puts
 * it right; null when it carries them. The theme is the export a build of
 * the source reads, loaded as the build loads it: it must be named for the
 * theme, and the settings module's own export must be in the chain of
 * themes it extends (after every spread and repeated key), the very object,
 * not a theme named like it. Null for a source that does not parse (its
 * parse error is its own finding), and for one that imports the settings
 * but does not load (outputsDrift and the build report that).
 * @param {string} cwd
 * @param {string} slug
 * @returns {Promise<{problem: string, fix: string} | null>}
 */
export async function themeSourceProblem(cwd, slug) {
  const f = themeFiles(cwd, slug);
  /** @type {string} */
  let code;
  try {
    code = fs.readFileSync(f.ts, 'utf8');
  } catch {
    return null;
  }
  /** @type {any} */
  let ast;
  try {
    ast = parseModule(code, {sourceType: 'module', plugins: ['typescript']});
  } catch {
    return null;
  }
  const settings = `${camel(slug)}Settings`;
  const putBack = `Put back the import of ${settings} from './${slug}.settings', extends: ${settings} and name: '${slug}' in themes/${slug}/${slug}.theme.ts (your own changes stay below them).`;
  const fromSettings = new RegExp(`^\\./${slug}\\.settings(\\.[jt]s)?$`);
  const importsSettings = ast.program.body.some(
    (/** @type {any} */ node) =>
      node.type === 'ImportDeclaration' && fromSettings.test(node.source.value),
  );
  const notImported = {
    problem: `${slug}.theme.ts does not import ./${slug}.settings`,
    fix: putBack,
  };
  /** @type {{theme: any, exportName: string, extendsBase?: boolean}} */
  let loaded;
  try {
    loaded = await loadThemeExport(f.ts, {
      cwd,
      // The settings module's own export, by identity: a theme merely
      // named like it is not it.
      base: {
        file: path.join(f.dir, `${slug}.settings.ts`),
        exportName: settings,
        specifiers: ['', '.ts', '.js'].map(x => `./${slug}.settings${x}`),
      },
    });
  } catch {
    // A source that does not load is the build's own finding
    // (outputsDrift and every build report it); one that does not import
    // the settings says that first.
    return importsSettings ? null : notImported;
  }
  /** A field of an export's definition, as written. @param {any} def @param {string} key */
  const field = (def, key) =>
    def?.properties.find(
      (/** @type {any} */ p) =>
        p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === key,
    )?.value;
  /** An export's definition names the theme. @param {any} def */
  const namesTheme = def =>
    plainText(unwrapConst(ast, field(def, 'name'))) === slug;
  /** An export's definition extends the settings. @param {any} def */
  const extendsSettings = def => {
    const base = field(def, 'extends');
    return base?.type === 'Identifier' && base.name === settings;
  };
  /**
   * Another export of the file that is the theme the build should read,
   * by a test of its definition.
   * @param {(def: any) => boolean} test
   */
  const otherExport = test =>
    exportedNames(ast).find(
      name => name !== loaded.exportName && test(exportedDefinition(ast, name)),
    );
  /** The build reads another export than the theme: say which, and how to make it read the theme. @param {string} other @param {string} what */
  const readsOther = (other, what) => ({
    problem: `a build of ${slug}.theme.ts reads its export ${loaded.exportName} (the theme '${loaded.theme?.name}'), not ${other}, ${what}`,
    fix: `Make ${other} the theme a build reads: export it as the default (export default ${other}), or move the other theme to a file of its own.`,
  });
  if (loaded.theme?.name !== slug) {
    const other = otherExport(namesTheme);
    return other
      ? readsOther(other, `the theme named '${slug}'`)
      : {
          problem: `${slug}.theme.ts no longer names the theme '${slug}'`,
          fix: putBack,
        };
  }
  if (!loaded.extendsBase) {
    // The export the build reads is named for the theme but does not
    // extend the settings; another export that does is the theme.
    const other = otherExport(def => namesTheme(def) && extendsSettings(def));
    if (other) return readsOther(other, `the theme that extends ${settings}`);
    return importsSettings
      ? {
          problem: `${slug}.theme.ts no longer extends ${settings}`,
          fix: putBack,
        }
      : notImported;
  }
  // The theme extends the settings, but a field of its own may still
  // replace theirs (a spread of defineTheme's result with a tokens or
  // components field of its own): everything the settings set (each token,
  // each part's style) must reach the theme the build reads, or a change is
  // saved and never built.
  /** @type {any} */
  let settingsTheme;
  try {
    settingsTheme = (
      await loadThemeExport(path.join(f.dir, `${slug}.settings.ts`), {cwd})
    ).theme;
  } catch {
    settingsTheme = null;
  }
  /** @param {unknown} v */
  const isRecord = v => !!v && typeof v === 'object' && !Array.isArray(v);
  /**
   * The paths of every value set inside a field, each to a value that is
   * no record.
   * @param {any} v @param {string[]} at
   * @returns {string[][]}
   */
  const leaves = (v, at) =>
    isRecord(v)
      ? Object.entries(v)
          .filter(([, x]) => x != null)
          .flatMap(([k, x]) => leaves(x, [...at, k]))
      : [at];
  /** Whether a path is set in a value. @param {any} root @param {string[]} p */
  const reaches = (root, p) => {
    let at = root;
    for (const k of p) {
      if (!isRecord(at) || !Object.hasOwn(at, k)) return false;
      at = at[k];
    }
    return true;
  };
  // The fields defineTheme carries from `extends` into its result key by
  // key (its seed): what the settings set there reaches the theme only if
  // the result keeps each key. The axes are resolved again from the
  // theme's own inputs, so a theme's own typography rightly replaces them.
  for (const field of ['tokens', 'components']) {
    const value = settingsTheme?.[field];
    if (!isRecord(value)) continue;
    // By its first key: a token, or a part whose style is lost.
    const theirs = [...new Set(leaves(value, []).map(p => p[0]))].filter(
      Boolean,
    );
    const lost = [
      ...new Set(
        leaves(value, [])
          .filter(p => !reaches(loaded.theme?.[field], p))
          .map(p => p[0]),
      ),
    ];
    if (lost.length)
      return {
        problem: `${slug}.theme.ts replaces the ${field} of ${settings}: ${lost.length} of the ${theirs.length} ${field} the settings set (${lost.slice(0, 3).join(', ')}${lost.length > 3 ? ', …' : ''}) do not reach the theme it exports`,
        fix: `Give your own ${field} inside defineTheme({extends: ${settings}, name: '${slug}', ${field}: {…}}) in themes/${slug}/${slug}.theme.ts, where they are added to the settings' ${field}, instead of replacing the ${field} of its result.`,
      };
  }
  return null;
}

/**
 * A plain text value: a string, or a template with no expressions.
 * @param {any} node
 * @returns {string | null}
 */
function plainText(node) {
  return node?.type === 'StringLiteral'
    ? node.value
    : node?.type === 'TemplateLiteral' && node.expressions.length === 0
      ? node.quasis.map((/** @type {any} */ q) => q.value.cooked).join('')
      : null;
}

/**
 * A module's top-level const bindings, by name.
 * @param {any} ast
 * @returns {Map<string, any>}
 */
function topConsts(ast) {
  /** @type {Map<string, any>} */
  const out = new Map();
  for (const node of ast.program.body) {
    const decl =
      node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (decl?.type === 'VariableDeclaration')
      for (const d of decl.declarations)
        if (d.id.type === 'Identifier') out.set(d.id.name, d.init);
  }
  return out;
}

/**
 * An expression with TypeScript wrappers and parentheses taken off, and a
 * name read through to the top-level const it names. An imported name stays
 * the identifier.
 * @param {any} ast
 * @param {any} node
 * @returns {any}
 */
function unwrapConst(ast, node) {
  const consts = topConsts(ast);
  for (let depth = 0; node && depth < 20; depth++) {
    if (
      [
        'TSAsExpression',
        'TSSatisfiesExpression',
        'TSNonNullExpression',
        'TSTypeAssertion',
        'ParenthesizedExpression',
      ].includes(node.type)
    )
      node = node.expression;
    else if (node.type === 'Identifier' && consts.get(node.name))
      node = consts.get(node.name);
    else return node;
  }
  return node;
}

/**
 * The names a module exports, `default` included.
 * @param {any} ast
 * @returns {string[]}
 */
function exportedNames(ast) {
  /** @type {string[]} */
  const names = [];
  for (const node of ast.program.body) {
    if (node.type === 'ExportDefaultDeclaration') names.push('default');
    if (node.type !== 'ExportNamedDeclaration' || node.source) continue;
    if (node.declaration?.type === 'VariableDeclaration')
      for (const d of node.declaration.declarations)
        if (d.id.type === 'Identifier') names.push(d.id.name);
    for (const spec of node.specifiers ?? [])
      names.push(spec.exported.name ?? spec.exported.value);
  }
  return names;
}

/**
 * The object a module export defines its theme with: the argument of the
 * `defineTheme(...)` call, or the object itself, that the export names.
 * @param {any} ast
 * @param {string} exportName
 * @returns {any} an ObjectExpression, or null
 */
function exportedDefinition(ast, exportName) {
  /** @type {any} */
  let value = null;
  for (const node of ast.program.body) {
    if (node.type === 'ExportDefaultDeclaration' && exportName === 'default')
      value = node.declaration;
    if (node.type !== 'ExportNamedDeclaration') continue;
    if (node.declaration?.type === 'VariableDeclaration')
      for (const d of node.declaration.declarations)
        if (d.id.type === 'Identifier' && d.id.name === exportName)
          value = d.init;
    for (const spec of node.specifiers ?? [])
      if (
        !node.source &&
        (spec.exported.name ?? spec.exported.value) === exportName
      )
        value = spec.local;
  }
  value = unwrapConst(ast, value);
  if (value?.type === 'CallExpression')
    value = unwrapConst(ast, value.arguments[0]);
  return value?.type === 'ObjectExpression' ? value : null;
}

/**
 * Why the person's own theme source does not parse (its line and the
 * parser's message), or null when it parses or is not there.
 * @param {string} cwd
 * @param {string} slug
 * @returns {string | null}
 */
export function themeSourceParseError(cwd, slug) {
  const f = themeFiles(cwd, slug);
  let code;
  try {
    code = fs.readFileSync(f.ts, 'utf8');
  } catch {
    return null;
  }
  try {
    parseModule(code, {sourceType: 'module', plugins: ['typescript']});
    return null;
  } catch (e) {
    const err = /** @type {any} */ (e);
    return `${slug}.theme.ts does not parse${err?.loc?.line ? ` (line ${err.loc.line})` : ''}: ${String(err?.message ?? e).replace(/\s*\(\d+:\d+\)\s*$/, '')}`;
  }
}

/**
 * Refuse, before anything is written or removed, a command whose build
 * would load the person's own theme source when it does not parse: the
 * build would fail part way.
 * @param {string} cwd
 * @param {string} slug
 */
export function refuseThemeParse(cwd, slug) {
  const why = themeSourceParseError(cwd, slug);
  if (why)
    throw new AstryxError(
      `${why}, so the theme cannot build. It is your own file: fix it, then run the command again. Nothing was changed.`,
      [
        {
          name: `cat ${path.posix.join('themes', slug, `${slug}.theme.ts`)}`,
          reason: 'see the file',
        },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
}

/**
 * Refuse a build whose theme source cannot carry the settings, naming the
 * lines that put it back.
 * @param {string} cwd
 * @param {string} slug
 */
export async function refuseThemeSource(cwd, slug) {
  refuseThemeParse(cwd, slug);
  const refusal = await themeSourceRefusal(cwd, slug);
  if (refusal) throw refusal;
}

/**
 * The refusal for a theme source that cannot carry the settings (it no
 * longer imports or extends them, or names another theme), naming the
 * lines that put it back; null when it carries them. Every command that
 * builds the theme refuses with it.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Promise<AstryxError | null>}
 */
export async function themeSourceRefusal(cwd, slug) {
  const why = await themeSourceProblem(cwd, slug);
  return why
    ? new AstryxError(
        `${why.problem}, so settings cannot take effect. ${why.fix} Nothing was changed.`,
        [{name: `${P} show ${slug}`, reason: 'see the theme as it is'}],
        ERROR_CODES.ERR_THEME_INVALID,
      )
    : null;
}

/**
 * The input the theme's own source gives `defineTheme()`, evaluated as a
 * build evaluates it, with the theme Core made of it (or Core's error when
 * it refuses the input); null when the source does not load.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {string | null} like the base theme, whose built tokens are `base`
 * @returns {Promise<{input: any, theme: any, error: Error | null, chain: any[], base: Map<string, string | null>} | null>}
 */
export async function ownThemeInput(ctx, slug, like) {
  const {cwd} = ctx.project;
  const baseFile = like ? baseModule(cwd, like) : null;
  try {
    const loaded = await loadThemeInput(themeFiles(cwd, slug).ts, {
      cwd,
      name: slug,
    });
    return (
      loaded && {...loaded, base: baseFile ? topTokensOf(baseFile) : new Map()}
    );
  } catch {
    return null;
  }
}

/**
 * The refusal of a [light, dark] pair on tokens that are not colors.
 * @param {string} slug
 * @param {string[]} names
 */
export function ownPairMessage(slug, names) {
  return `themes/${slug}/${slug}.theme.ts gives ${names.join(', ')} a [light, dark] pair, but only colors differ by mode: the build would write light-dark(), which browsers take only for colors. Give ${names.length > 1 ? 'each' : 'it'} one value in ${slug}.theme.ts. Nothing was changed.`;
}

/**
 * The check of a theme's own token values, run before every build, set by
 * the editor (which owns the checks a value meets): null until it is set.
 * @type {((ctx: Ctx, slug: string, data: ThemeData) => Promise<void>) | null}
 */
let ownTokenCheck = null;

/**
 * Set the check of a theme's own token values run before every build.
 * @param {((ctx: Ctx, slug: string, data: ThemeData) => Promise<void>) | null} fn
 */
export function setOwnTokenCheck(fn) {
  ownTokenCheck = fn;
}

/**
 * What runs after every build of a theme, set by the adapter (the app copy
 * of the theme): null until it is set.
 * @type {((ctx: Ctx, slug: string, data: ThemeData) => void) | null}
 */
let afterBuild = null;

/**
 * Set what runs after every build of a theme.
 * @param {((ctx: Ctx, slug: string, data: ThemeData) => void) | null} fn
 */
export function setAfterBuild(fn) {
  afterBuild = fn;
}

/**
 * Builds whose after-build hook waits for the change to be saved: a change
 * that fails after its build puts its theme folder back, and its app copy
 * was never written.
 * @type {WeakSet<Ctx>}
 */
const afterSave = new WeakSet();

/**
 * Hold the after-build hook for this command's builds: the command writes
 * the app copy itself once it succeeds (show).
 * @param {Ctx} ctx
 */
export function holdAfterBuild(ctx) {
  afterSave.add(ctx);
}

/**
 * The section sheet whose picture shows every overlay open: `--png` takes
 * it beside the sample page's, so plain `show --png` takes it again.
 */
export const OPEN_SECTION = 'overlays';

/**
 * Generate the theme source, build it with the theme build, then repeat any
 * part setting a more specific rule would beat and build again.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {ThemeData} data
 * @returns {Promise<{warnings: string[], lifted: string[], notes: string[], removedPictures: string[]}>} `notes`: what the color config kept or replaced of a hand edit; `removedPictures`: the editor's pictures of the look before, removed
 */
export async function buildTheme(ctx, slug, data) {
  return (await buildThemeHeld(ctx, slug, data)).built;
}

/**
 * {@link buildTheme}, with a way to put back what it wrote: a command that
 * builds first and refuses later (a preview app whose copy checks fail)
 * leaves the theme as it found it.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {ThemeData} data
 * @returns {Promise<{built: Awaited<ReturnType<typeof buildThemeSteps>>, undo: () => void}>}
 */
export async function buildThemeHeld(ctx, slug, data) {
  // A change around the build (commitTheme) owns the rollback of what it
  // writes. With none (a preview command building a stale theme first), a
  // build that fails puts back what it wrote itself: a refused command
  // writes nothing.
  if (ctx.wrote)
    return {built: await buildThemeSteps(ctx, slug, data), undo: () => {}};
  const dir = themeFiles(ctx.project.cwd, slug).dir;
  const was = snapshotDir(dir);
  /** @type {Map<string, string | null>} */
  const wrote = new Map();
  ctx.wrote = wrote;
  try {
    const built = await buildThemeSteps(ctx, slug, data);
    return {built, undo: () => void restoreWritten(was, wrote)};
  } catch (e) {
    restoreWritten(was, wrote);
    throw e;
  } finally {
    ctx.wrote = undefined;
  }
}

/**
 * {@link buildTheme}'s steps, each write recorded in `ctx.wrote`.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {ThemeData} data
 */
async function buildThemeSteps(ctx, slug, data) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  await refuseThemeSource(cwd, slug);
  // The theme's own token values, judged as a build of the source writes
  // them, before anything is written.
  await ownTokenCheck?.(ctx, slug, data);
  if (data.like) baseThemeFile(ctx.project, data.like);
  const base = await baseResolved(ctx.project, data.like);
  fs.mkdirSync(f.dir, {recursive: true});
  // Each write is recorded for a rollback; the time between them is not.
  // Each step checks first that this command still holds the theme lock:
  // the build's own writes (the stylesheet and module the stable build
  // writes, the files it removes) are fenced as each step starts.
  /** @type {<T>(fn: () => T) => Promise<Awaited<T>>} */
  const step = fn => {
    refuseIfLockLost();
    return track(f.dir, ctx.wrote ?? new Map(), fn);
  };
  /** @type {string[]} */
  let notes = [];
  // The palette files are written first, and the theme is built from them
  // as written: a config an earlier editor wrote is brought up to date
  // before any color is read from it.
  const paletteFile = path.join(cwd, paletteFiles(slug).palette);
  const paletteBefore = fs.existsSync(paletteFile)
    ? fs.readFileSync(paletteFile, 'utf8')
    : null;
  await step(() => {
    notes = syncPalette(cwd, slug, data, base);
  });
  // Shades a theme already shows are kept only while its palette stays the
  // same: a palette made again moves every shade.
  if (
    (fs.existsSync(paletteFile)
      ? fs.readFileSync(paletteFile, 'utf8')
      : null) !== paletteBefore
  )
    ctx.keepStops = null;
  const theme = compileTheme(ctx, data, base);
  const pal = keepShades(
    paletteMapping(cwd, slug, data, base, ctx.project.core.tokenDefaults),
    ctx.keepStops,
  );
  await step(() => {
    writeWhole(
      f.settingsTs,
      settingsSource(
        slug,
        data,
        theme,
        pal,
        cwd,
        /** @type {any} */ (base).components ?? null,
      ),
    );
    syncPaletteRefs(cwd, slug, fs.readFileSync(f.settingsTs, 'utf8'), pal);
    if (!fs.existsSync(f.ts)) writeWhole(f.ts, themeModuleSource(slug));
  });
  // Files an earlier build wrote that this one may not: the variants types
  // of an older base, and the pictures the editor took of an older look
  // (a section sheet's too). Only a picture the editor recorded writing,
  // unchanged since, goes: a file of the user's is never touched. Section
  // sheets' html stays, marked as out of date like sheet.html.
  /** The pictures removed: named in the result. @type {string[]} */
  let removedPictures = [];
  await step(() => {
    // The preview's and the sheets' pictures (a section's, `sheet-inputs.png`,
    // included), in each mode: none shows the look this build makes.
    const pictures = fs.existsSync(f.dir)
      ? fs
          .readdirSync(f.dir)
          .filter(
            n =>
              /^(preview(-dark)?|sheet(-[a-z][a-z-]*)?)\.png$/.test(n) &&
              editorRecorded(cwd, slug, path.join(f.dir, n)),
          )
      : [];
    removedPictures = pictures.map(n =>
      path.relative(cwd, path.join(f.dir, n)).split(path.sep).join('/'),
    );
    for (const file of [
      path.join(f.dir, `${slug}.variants.d.ts`),
      ...pictures.map(n => path.join(f.dir, n)),
    ])
      fs.rmSync(file, {force: true});
    forgetWritten(cwd, slug, pictures);
  });
  let receipt = await step(() => runBuild(ctx, slug, data));
  // A state setting on the plain part that the own source's same state
  // rule wins over is not repeated on the variants either: the own source
  // wins on every variant, as the result says.
  /** @type {Map<string, Map<string, string | null>>} */
  const ownStates = new Map();
  /** @param {string} target @param {string} state @param {string} prop */
  const ownHolds = (target, state, prop) => {
    const k = `${target} ${state}`;
    const own =
      ownStates.get(k) ?? ownPartTokens(cwd, slug, target, 'base', state);
    ownStates.set(k, own);
    const css = kebab(prop);
    return [...own.keys()].some(
      o => o === css || coversProperty(o, css) || coversProperty(css, o),
    );
  };
  /**
   * The theme's own rules for a style key, whichever way it is written: a
   * bare state (`selected`) is the same selector as `selected:selected`, as
   * Core's parseStyleKey reads it.
   * @param {string} target @param {string} key
   */
  const ownRule = (target, key) => {
    const rules = /** @type {Record<string, any>} */ (
      theme.components[target] ?? {}
    );
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, r] of Object.entries(rules))
      if (styleKeyOf(k) === styleKeyOf(key)) Object.assign(out, r);
    return out;
  };
  const found = findOverrides(fs.readFileSync(f.css, 'utf8'), theme).filter(
    x =>
      // By property: a variant whose rule the settings give this property
      // or a shorthand covering it needs no copy; nor one holding a
      // longhand of it that the base theme's rule also holds and that has
      // no sides to be written as (a background color, one-mode or not):
      // the copy would come after it there and win. Any other longhand
      // takes the copy, then is written after it (as its sides where the
      // base holds it).
      !Object.entries(
        (x.state
          ? ownRule(x.target, x.key)[x.state]
          : ownRule(x.target, x.key)) ?? {},
      ).some(([k, v]) => {
        if (k.startsWith(':')) return false;
        if (k === x.prop || coversProperty(kebab(k), kebab(x.prop)))
          return true;
        if (!coversProperty(kebab(x.prop), kebab(k))) return false;
        const baseRule = /** @type {any} */ (base).components?.[x.target]?.[
          x.key
        ];
        const held = (x.state ? baseRule?.[x.state] : baseRule)?.[k];
        return held != null && sidesOf(kebab(k), String(v)) == null;
      }) && !(x.state && ownHolds(x.target, x.state, x.prop)),
  );
  /** @type {string[]} */
  const lifted = [];
  if (found.length) {
    for (const x of found) {
      const t = theme.components[x.target];
      // The base value goes before the variant's own declarations, so a
      // longhand or shorthand the variant sets itself (border-color after
      // a base border) still wins over it.
      const own = t[x.key] ?? {};
      const ownState = x.state ? (own[x.state] ?? {}) : own;
      // A variant that sets every longhand of the property itself needs
      // none of the base value (and a lifted radius would feed Core's copy
      // of it into the content's radius, after the variant's own).
      const longs = [...longhandsOf(kebab(x.prop))];
      if (longs.length && longs.every(l => camel(l) in ownState)) continue;
      t[x.key] = x.state
        ? {...own, [x.state]: {[x.prop]: x.value, ...ownState}}
        : {[x.prop]: x.value, ...own};
      // The variant's own longhands come after the copied shorthand; one
      // the base theme holds would keep the base's earlier place and lose,
      // so it is written as its sides.
      const baseRule = /** @type {any} */ (base).components?.[x.target]?.[
        x.key
      ];
      laterLonghandsAsSides(
        x.state ? t[x.key][x.state] : t[x.key],
        x.state ? baseRule?.[x.state] : baseRule,
      );
      lifted.push(`${x.target} ${x.key}${x.state ?? ''} ${kebab(x.prop)}`);
    }
    await step(() => {
      writeWhole(
        f.settingsTs,
        settingsSource(
          slug,
          data,
          theme,
          pal,
          cwd,
          /** @type {any} */ (base).components ?? null,
        ),
      );
      syncPaletteRefs(cwd, slug, fs.readFileSync(f.settingsTs, 'utf8'), pal);
    });
    receipt = await step(() => runBuild(ctx, slug, data));
  }
  for (const out of [f.css, f.js])
    if (fs.existsSync(out))
      assertNoPlaceholder(shown(cwd, out), fs.readFileSync(out, 'utf8'));
  // Font notices are reported by the font dial itself, once.
  const warnings = [
    ...(receipt?.data?.warnings ?? []),
    ...(receipt?.data?.notices ?? []),
  ]
    .map(String)
    .filter(w => !/^Font "/.test(w));
  // The app's copy, a standard local theme `theme add` reads, follows the
  // build (written by the hook the adapter sets: it owns that write).
  if (afterBuild && !afterSave.has(ctx))
    await step(() => {
      afterBuild?.(ctx, slug, data);
    });
  // Every caller reports the build's notes, so the pictures it removed are
  // named in the result of whatever command built (set, undo, show, a
  // preview command).
  // The pictures the running command takes again after this build (its
  // --png: the sample page, the open states, and show's sheet) are not
  // removed in the end: only the others are named, with what takes them.
  const modes = modesOf(data);
  const retaken = new Set(
    ctx.takesPictures
      ? [
          'preview',
          `sheet-${OPEN_SECTION}`,
          ...(ctx.takesPictures.sheet ? [ctx.takesPictures.sheet] : []),
        ].flatMap(n =>
          modes.map(m =>
            modes.length > 1 && m === 'dark' ? `${n}-dark.png` : `${n}.png`,
          ),
        )
      : [],
  );
  removedPictures = removedPictures.filter(
    p => !retaken.has(p.slice(p.lastIndexOf('/') + 1)),
  );
  if (removedPictures.length)
    notes = [
      ...notes,
      `removed ${removedPictures.join(', ')}: ${removedPictures.length === 1 ? 'a picture' : 'pictures'} of ${slug} as it was before this build; ${[
        ...new Set(
          removedPictures.map(p => {
            // A family's picture, or a piece cut from it (sheet-inputs-2.png).
            const section =
              /\/sheet-(?!dark[-.])([a-z][a-z-]*?)(-dark)?(-\d+)?\.png$/.exec(
                p,
              )?.[1];
            // The open states are taken by every --png: no section named.
            return `${P} show ${slug} --png${section && section !== OPEN_SECTION ? ` --section ${section}` : ''}`;
          }),
        ),
      ].join(
        ' and ',
      )} ${removedPictures.length === 1 ? 'takes a new one' : 'take new ones'}`,
    ];
  return {warnings, lifted, notes, removedPictures};
}

/**
 * The one color mode of a light-only or dark-only theme, from its settings,
 * for the build to write into the built module (`colorModes`); null for a
 * theme with both modes.
 * @param {string} cwd
 * @param {string} slug
 * @returns {['light'] | ['dark'] | null}
 */
export function buildColorModes(cwd, slug) {
  try {
    return oneColorMode(
      modesOf(
        settingsJson(fs.readFileSync(themeFiles(cwd, slug).settings, 'utf8')),
      ),
    );
  } catch {
    return null;
  }
}

/**
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {{mode?: string}} [data] the settings being built (saved after the
 *   build), whose mode the built module exports
 * @returns {Promise<any>}
 */
async function runBuild(ctx, slug, data) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  const silent = logger.silent;
  logger.setSilent(true);
  try {
    // No --out: the theme's name is its slug, so the build writes
    // <slug>.css beside the source, and the generated headers read as a
    // plain `compile themes/<slug>/<slug>.theme.ts` writes them.
    const {receipt} = await themeBuildForReport(
      shown(cwd, f.ts),
      {},
      {cwd},
      {compact: true},
      {
        // The theme folder is the editor's: a half-written or damaged
        // output there is repaired, never refused as a file of the user's.
        ownsOutputs: true,
        colorModes: data
          ? oneColorMode(modesOf(data))
          : buildColorModes(cwd, slug),
      },
    );
    return receipt;
  } finally {
    logger.setSilent(silent);
  }
}

/**
 * Why the built outputs differ from what the theme builds now: one that is
 * missing or changed by hand, found the way `compile --check` finds it
 * (the same build, compared and not written), or null when they match.
 * @param {Ctx} ctx
 * @param {string} slug
 * @returns {Promise<string | null>}
 */
export async function outputsDrift(ctx, slug) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  const silent = logger.silent;
  logger.setSilent(true);
  try {
    const {receipt} = await themeBuildForReport(
      shown(cwd, f.ts),
      {check: true},
      {cwd},
      {compact: true},
      {colorModes: buildColorModes(cwd, slug)},
    );
    const first = /** @type {any} */ (receipt)?.data?.stale?.[0];
    if (!first) return null;
    const name = path.basename(String(first.path));
    return first.reason === 'missing'
      ? `${name} was missing`
      : `${name} differs from what the settings build, after an edit by hand or by another tool`;
  } catch (e) {
    // The outputs could not be compared (the source does not load, or
    // anything else): the theme is built again, and a build that fails
    // says why. Nothing records the source as built.
    const err = /** @type {any} */ (e);
    return `the outputs could not be checked (${String(err?.message ?? e)
      .split('\n')[0]
      .slice(0, 160)})`;
  } finally {
    logger.setSilent(silent);
  }
}

/**
 * Whether Core's media surface inside a part follows what is painted behind
 * it (`MediaTheme mode="auto"`): a part that paints the inverted surface
 * and holds one (a toast), where Core measures the fill to pick the side
 * (and falls back from the inverted token). A surface on any other ground
 * (a lightbox's or a scrim's dark overlay) keeps its one side.
 * @param {Ctx} ctx
 * @param {string} part
 */
export function autoMediaPart(ctx, part) {
  return Boolean(
    ctx.C.MAP[part]?.media &&
    (ctx.C.partReads(part, 'background') ?? []).some(r =>
      /^--color-background-(error-)?inverted$/.test(r.token),
    ),
  );
}

/**
 * The side Core's auto media surface takes on a fill, by Core's own rule
 * (useAutoMediaMode's resolveBackdrop and pickMediaMode, and a toast's
 * fallback when the backdrop cannot be read): `'off'` when the theme's own
 * text reads at 3:1 on the backdrop, else whichever on-color reads better.
 * The backdrop is the fill composited onto the page when it is
 * see-through; a gradient or an image cannot be read, and the fallback is
 * taken from the inverted surface token (the error one for an error toast)
 * the same way with no ambient text, else from the mode. The pictures and
 * the contrast checks both take the side from here.
 * @param {string | null | undefined} fill the fill as a color value in the mode
 * @param {Record<string, string>} tokens the theme's resolved tokens in the mode
 * @param {{mode: string, error?: boolean}} o
 * @returns {'off' | 'dark' | 'light'}
 */
export function autoMediaSide(fill, tokens, o) {
  const page = parseColor(String(tokens['--color-background-body'] ?? ''));
  /** @param {unknown} v @returns {[number, number, number] | null} */
  const opaque = v => {
    const c = parseColor(String(v ?? ''));
    if (!c) return null;
    const a = alphaOf(String(v));
    if (a >= 1) return c;
    return page ? compositeOver(c, a, page) : null;
  };
  /** @param {[number, number, number]} back @param {boolean} ambient */
  const pick = (back, ambient) => {
    const onDark = opaque(tokens['--color-on-dark']);
    const onLight = opaque(tokens['--color-on-light']);
    if (!onDark || !onLight) return null;
    const text = ambient ? opaque(tokens['--color-text-primary']) : null;
    if (text && ratio(text, back) >= 3) return 'off';
    return ratio(onDark, back) >= ratio(onLight, back) ? 'dark' : 'light';
  };
  const v = String(fill ?? '').trim();
  const back = v && !/gradient\(|url\(/.test(v) ? opaque(v) : null;
  const measured = back ? pick(back, true) : null;
  if (measured) return measured;
  const surface = String(
    tokens[
      o.error
        ? '--color-background-error-inverted'
        : '--color-background-inverted'
    ] ?? '',
  );
  const s = parseColor(surface);
  const fromTokens = s && alphaOf(surface) >= 1 ? pick(s, false) : null;
  if (fromTokens && fromTokens !== 'off') return fromTokens;
  return o.error || o.mode === 'light' ? 'dark' : 'light';
}

/**
 * The side Core's auto media surface takes inside each part that holds one
 * (a toast), by `autoMediaSide`, for each mode the theme draws and each type
 * the part is drawn in (`type=error`, '' for none), on the fill the part
 * draws there: the fill a setting gives it, else the token it reads. A
 * static render takes Core's fallback from the inverted token, where the
 * app measures the painted fill: the pictures take this side instead.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {ThemeData} data
 * @returns {Promise<Record<string, Record<string, Record<string, 'off' | 'light' | 'dark'>>>>} part -> condition -> mode -> side
 */
export async function mediaSurfaceSides(ctx, slug, data) {
  /** @type {Record<string, Record<string, Record<string, 'off' | 'light' | 'dark'>>>} */
  const out = {};
  const parts = Object.keys(ctx.C.MAP).filter(t => autoMediaPart(ctx, t));
  if (!parts.length) return out;
  const res = await resolvedTokens(ctx, slug).catch(() => null);
  if (!res) return out;
  const fills = data.settings.filter(
    x =>
      x.source === 'property' &&
      /^background(-color|-image)?$/.test(kebab(x.thing)) &&
      !x.state &&
      x.on,
  );
  /** @param {string} raw @param {string} m */
  const colorOf = (raw, m) => {
    const split = /^light-dark\((.*),\s*([^,]*)\)$/.exec(raw.trim());
    const side = split ? split[m === 'dark' ? 2 : 1].trim() : raw.trim();
    const ref = /^var\((--[\w-]+)\)$/.exec(side);
    return ref ? res[/** @type {'light' | 'dark'} */ (m)][ref[1]] : side;
  };
  for (const t of parts) {
    const reads = ctx.C.partReads(t, 'background') ?? [];
    const types = /** @type {string[]} */ ([
      ...(ctx.C.MAP[t]?.attrs?.type ?? []),
    ]);
    for (const type of ['', ...types])
      for (const m of modesOf(data)) {
        const cond = type ? `type=${type}` : '';
        const set = [...fills]
          .reverse()
          .find(
            y =>
              (!y.mode || y.mode === m) &&
              (!y.when || y.when === `type:${type}`) &&
              partsOf(ctx, y).includes(t),
          );
        const read =
          reads.find(r => cond && r.when.includes(cond)) ??
          reads.find(r => r.when.includes(''));
        const v = set
          ? colorOf(String(set.value), m)
          : read
            ? res[/** @type {'light' | 'dark'} */ (m)][read.token]
            : null;
        ((out[t] ??= {})[cond] ??= {})[m] = autoMediaSide(
          v,
          res[/** @type {'light' | 'dark'} */ (m)],
          {mode: m, error: type === 'error'},
        );
      }
  }
  return out;
}

/**
 * Each auto media surface inside a part in a rendered page set to the side
 * `sides` gives it for the type the part is drawn in and the mode it is
 * drawn in (the page's mode, or the light or dark copy it sits in).
 * @param {string} html
 * @param {Record<string, Record<string, Record<string, 'off' | 'light' | 'dark'>>>} sides
 * @param {string} mode the page's mode: light, dark or system
 * @returns {string}
 */
export function settleMediaSides(html, sides, mode) {
  const names = Object.keys(sides);
  if (!names.length) return html;
  const re = new RegExp(
    `class="(cs-light|cs-dark)"|(<[a-z]+\\b[^>]*\\bclass="astryx-(?:${names.join('|')})[ "][^>]*>)| data-astryx-media="(dark|light)"`,
    'g',
  );
  let at = mode === 'system' ? 'light' : mode;
  /** @type {Record<string, Record<string, 'off' | 'light' | 'dark'>> | null} */
  let part = null;
  /** @type {string} */
  let cond = '';
  return html.replace(re, (all, copy, tag) => {
    if (copy) {
      at = copy === 'cs-dark' ? 'dark' : 'light';
      return all;
    }
    if (tag) {
      const name = /class="astryx-([\w-]+)/.exec(tag)?.[1] ?? '';
      part = sides[name] ?? null;
      const type = /\bdata-type="([\w-]+)"/.exec(tag)?.[1];
      cond = type ? `type=${type}` : '';
      return all;
    }
    const side = part ? (part[cond] ?? part[''])?.[at] : undefined;
    part = null;
    // ('off': no media context, as Core draws it: no attribute.)
    return side === 'off' ? '' : side ? ` data-astryx-media="${side}"` : all;
  });
}

/**
 * Resolved tokens of the built theme in both modes.
 * @param {Ctx} ctx
 * @param {string} slug
 * @returns {Promise<{light: Record<string, string>, dark: Record<string, string>}>}
 */
export async function resolvedTokens(ctx, slug) {
  const f = themeFiles(ctx.project.cwd, slug);
  // The built module is ESM in a .js file, and an app's package.json may not
  // say "type": "module": an .mjs copy loads as ESM with no Node warning,
  // and the query keeps it out of the module cache. The copy goes in the
  // project's cache folder, where package imports still resolve; only a
  // module with relative imports is copied beside itself. (The shared theme
  // loader caches a .js module of an ESM app by URL, so a second read in one
  // command would return the first build.)
  const source = fs.readFileSync(f.js, 'utf8');
  // Each copy has its own name, so two commands at once never share one; a
  // read-only cache folder falls back to the theme folder.
  const name = `.${slug}.load-${process.pid}-${Math.random().toString(36).slice(2, 8)}.mjs`;
  let copy = path.join(f.dir, name);
  // A real relative import (not the usage example in the doc comment).
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // A module that imports one of the theme folder's own modules (an icon
  // registry beside the theme, `./icons`, written in TypeScript) is loaded
  // as the app's bundler and the build load it: Node's own loader resolves
  // no import without its ending, nor reads TypeScript.
  const local = /^\s*(import|export)\b[^;]*\bfrom\s+['"]\.\.?\//m.test(code);
  if (!local)
    try {
      fs.mkdirSync(ctx.project.cacheDir, {recursive: true});
      fs.writeFileSync(path.join(ctx.project.cacheDir, name), source);
      copy = path.join(ctx.project.cacheDir, name);
    } catch {
      // The cache folder is not writable: use the theme folder.
    }
  /** @type {Record<string, any>} */
  let mod;
  if (local)
    try {
      mod = await (
        await import('../theme/build/build.mjs')
      ).loadBuiltThemeModule(f.js);
    } catch (e) {
      // A module of the theme folder that does not load (a syntax error,
      // a missing file) is the theme's own problem, named.
      throw new AstryxError(
        `${slug} could not be read: ${shown(ctx.project.cwd, f.js)} or a module of the theme folder it imports does not load (${e instanceof Error ? e.message.split('\n')[0] : String(e)}).`,
        [
          {
            name: `${P} show ${slug}`,
            reason: 'builds the theme again from its settings',
          },
        ],
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
  else
    try {
      if (copy.startsWith(f.dir)) fs.writeFileSync(copy, source);
      mod = await import(
        `${pathToFileURL(copy).href}?t=${Date.now()}${Math.random()}`
      );
    } catch (e) {
      if (e instanceof Error) e.message = e.message.split(copy).join(f.js);
      throw e;
    } finally {
      fs.rmSync(copy, {force: true});
    }
  const t = withoutNullTokens(
    Object.values(mod).find(
      v => v && typeof v === 'object' && typeof v.name === 'string',
    ),
  );
  const {core} = ctx.project;
  // A token value an own theme source gives as a number (8 for 8px)
  // reads as its text, never as a crash.
  const asText = (/** @type {Record<string, unknown>} */ m) =>
    Object.fromEntries(
      Object.entries(m ?? {}).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : String(v),
      ]),
    );
  // A token value that is not text (a number in an own theme source) is
  // named, never a crash.
  const resolve = (/** @type {'light' | 'dark'} */ mode) => {
    try {
      return asText(core.resolveThemeTokens(t, {mode}));
    } catch (e) {
      const bad = nonTextToken(t, ctx.C.typeOf);
      throw new AstryxError(
        bad
          ? nonTextMessage(ctx, slug, bad)
          : `${slug} could not be read: ${e instanceof Error ? e.message : String(e)}.`,
        [{name: `${P} how --list tokens`, reason: 'every token and its type'}],
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
  };
  // A pair that holds a value that is not text ([8, 8]) resolves, but
  // builds nothing a browser reads: named the same way.
  const pairBad = nonTextToken(t, ctx.C.typeOf);
  if (pairBad)
    throw new AstryxError(
      nonTextMessage(ctx, slug, pairBad),
      [{name: `${P} how --list tokens`, reason: 'every token and its type'}],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  const out = {light: resolve('light'), dark: resolve('dark')};
  // The tokens each part sets for itself (the official themes lift
  // secondary text on some parts), for the contrast check; kept out of the
  // modes so nothing that lists the resolved tokens sees it.
  /** @type {Record<string, Record<string, string>>} */
  const parts = {};
  for (const [target, blocks] of Object.entries(t?.components ?? {}))
    for (const block of Object.values(/** @type {any} */ (blocks) ?? {}))
      for (const [k, v] of Object.entries(/** @type {any} */ (block) ?? {}))
        if (k.startsWith('--') && typeof v === 'string')
          (parts[target] ??= {})[k] = v;
  Object.defineProperty(out, 'parts', {value: parts, enumerable: false});
  return out;
}

/**
 * A built theme without its null tokens. The build writes a null token as
 * it is, a value no browser reads, and warns it at its line; Core cannot
 * resolve one, so the editor's checks read the theme without it. A theme
 * with none is returned as it is.
 * @param {any} theme
 * @returns {any}
 */
function withoutNullTokens(theme) {
  const MAPS = ['tokens', 'localTokens'];
  const SURFACES = ['onDark', 'onLight', '__onDark', '__onLight'];
  /** @param {any} map */
  const hasNull = map =>
    !!map && typeof map === 'object' && Object.values(map).includes(null);
  /** @param {any} block @returns {boolean} */
  const nulls = block =>
    !!block &&
    typeof block === 'object' &&
    (MAPS.some(m => hasNull(block[m])) ||
      SURFACES.some(f => block[f] !== block && nulls(block[f])));
  if (!nulls(theme)) return theme;
  /** @param {any} block @returns {any} */
  const strip = block => {
    if (!block || typeof block !== 'object') return block;
    const fields = Object.getOwnPropertyDescriptors(block);
    for (const [f, d] of Object.entries(fields)) {
      if (!('value' in d)) continue;
      if (MAPS.includes(f) && hasNull(d.value))
        fields[f] = {
          ...d,
          value: Object.fromEntries(
            Object.entries(d.value).filter(([, v]) => v !== null),
          ),
        };
      else if (SURFACES.includes(f) && nulls(d.value))
        fields[f] = {...d, value: strip(d.value)};
    }
    return Object.defineProperties(
      Object.create(Object.getPrototypeOf(block)),
      fields,
    );
  };
  return strip(theme);
}

/**
 * The first token a built theme gives a value that is not text, alone or
 * in a [light, dark] pair, or null.
 * @param {any} t
 * @param {(name: string) => string} [typeOf] a token's type (size, color…)
 * @returns {[string, unknown, 'object' | 'pair' | 'unit' | 'value' | 'mode'] | null}
 */
function nonTextToken(t, typeOf = (/** @type {string} */ _k) => 'other') {
  for (const [k, raw] of Object.entries(t?.tokens ?? {})) {
    // An object ({light, dark}) is not a value Core builds: it would write
    // [object Object].
    if (raw && typeof raw === 'object' && !Array.isArray(raw))
      return [k, raw, 'object'];
    // A built theme writes a pair as light-dark(). A half that was not text
    // comes out as nothing, null or a boolean; a bare number is text the
    // source may have quoted, and is wrong only for a size, which needs a
    // unit.
    const pair =
      typeof raw === 'string' ? /^light-dark\((.*)\)$/s.exec(raw.trim()) : null;
    // Split at the top-level comma: a half may hold commas (rgb(0, 0, 0)).
    const parts = pair ? splitTop(pair[1], ',').map(x => x.trim()) : [];
    if (pair && parts.length === 2) {
      const halves = parts;
      const missing = halves.some(x =>
        /^(|null|undefined|true|false)$/.test(x),
      );
      const unitless =
        typeOf(k) === 'size' &&
        halves.some(x => /^-?\d+(\.\d+)?$/.test(x) && Number(x) !== 0);
      if (missing || unitless) {
        const half = (/** @type {string} */ x) =>
          /^-?\d+(\.\d+)?$/.test(x)
            ? Number(x)
            : x === '' || x === 'undefined' || x === 'null'
              ? null
              : x === 'true' || x === 'false'
                ? x === 'true'
                : x;
        return [k, [half(parts[0]), half(parts[1])], missing ? 'pair' : 'unit'];
      }
      // light-dark() takes only colors: a pair on any other token (a size,
      // a font, a shadow) is dropped by the browser, however the theme
      // file wrote it (a constant, `as const`, an imported module).
      if (typeOf(k) !== 'color') return [k, parts, 'mode'];
      continue;
    }
    if (Array.isArray(raw)) {
      if (raw.length !== 2 || raw.some(x => typeof x !== 'string'))
        return [k, raw, 'pair'];
      if (typeOf(k) !== 'color') return [k, raw, 'mode'];
      continue;
    }
    if (typeof raw !== 'string') return [k, raw, 'value'];
  }
  return null;
}

/**
 * A value as a message names it, whatever it is: text in quotes, a number,
 * a BigInt with its `n`, a symbol, a function, an array or an object as
 * JSON where it has one. Never throws.
 * @param {unknown} value
 * @returns {string}
 */
export function describeValue(value) {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && !Number.isFinite(value))
    return String(value);
  if (typeof value === 'symbol') return String(value);
  if (typeof value === 'function') return 'a function';
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, (_k, v) =>
      typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? String(v) : v,
    );
  } catch {
    return String(value);
  }
}

/**
 * Why a token value is not one, with a value of the token's own type to
 * write instead (a size in px, a weight as a number in quotes), or none.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {[string, unknown, ('object' | 'pair' | 'unit' | 'value' | 'mode')?]} bad
 */
export function nonTextMessage(ctx, slug, [name, value, kind = 'value']) {
  const type = ctx.C.typeOf(name);
  if (kind === 'mode') return ownPairMessage(slug, [name]);
  if (kind === 'object')
    return `${slug}.theme.ts gives ${name} an object (${describeValue(value)}); a token value is a CSS value in quotes, such as '8px' (only a color takes a [light, dark] pair).`;
  if (kind === 'unit') {
    const n = /** @type {unknown[]} */ (value).find(
      x => typeof x === 'number' && Number.isFinite(x) && x !== 0,
    );
    return `${slug}.theme.ts gives ${name}, a size, a [light, dark] pair with a number without a unit (${/** @type {unknown[]} */ (value).join(', ')}); a size needs one, and is the same in light and dark, so give one value${n === undefined ? '' : `, such as '${n}px'`}.`;
  }
  const one = Array.isArray(value)
    ? value.find(x => typeof x !== 'string')
    : value;
  // NaN and Infinity (a computed value gone wrong) are no CSS number, so
  // they give no example.
  const example =
    typeof one === 'number' && Number.isFinite(one)
      ? type === 'size'
        ? `'${one}px'`
        : `'${one}'`
      : null;
  const shape = Array.isArray(value)
    ? 'a [light, dark] pair of two CSS values in quotes'
    : 'a CSS value in quotes';
  return `${slug}.theme.ts gives ${name} the value ${describeValue(value)}, which is not text: a token value is ${shape}${example ? ` (such as ${Array.isArray(value) ? `[${example}, ${example}]` : example})` : ''}.`;
}

/**
 * Contrast problems this theme caused: text below 4.5:1 that was not as low
 * in the base theme. A part's own color or background setting, or a token
 * set on that part or on the part the text sits on, counts for that part.
 * Each comes with the set line that fixes it, when one color does: the text
 * token set where the text sits, for its mode, to the black or white that
 * reads on what it sits on.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @returns {Promise<ThemeProblem[]>}
 */
export async function contrastProblems(ctx, data, res) {
  const base = await baseResolved(ctx.project, data.like);
  /** A part's own fill setting, or a token it sets that its fill reads. @param {PaintSide} side @param {'bg'} _which @param {string} m @param {string} [when] */
  const override = (side, _which, m, when) => {
    if (!side.target) return null;
    const hit = [...data.settings]
      .reverse()
      .find(
        x =>
          partsOf(ctx, x).includes(/** @type {string} */ (side.target)) &&
          (!x.when || x.when === when) &&
          !x.state &&
          (!x.mode || x.mode === m) &&
          ((x.source === 'property' &&
            ['background', 'background-color'].includes(x.thing)) ||
            (x.source === 'token' && side.tokens.includes(x.thing))),
      );
    return hit?.value ?? null;
  };
  /**
   * A color as a mode draws it: a `light-dark()` pair gives its side, and
   * a token of the theme, `var(--token)`, gives the value it has in that
   * mode. Anything else is as written.
   * @param {string | null | undefined} v @param {string} m
   * @returns {string | null}
   */
  const inMode = (v, m) => {
    if (v == null) return null;
    const split = /^light-dark\((.*),\s*([^,]*)\)$/.exec(String(v).trim());
    const side = split ? split[m === 'dark' ? 2 : 1].trim() : String(v).trim();
    const ref = /^var\((--[\w-]+)\)$/.exec(side);
    return ref
      ? (res[/** @type {'light' | 'dark'} */ (m)][ref[1]] ?? side)
      : side;
  };
  /**
   * Text on a lifted background (the accent tint, the neutral track) as
   * the part sets it for itself: the official themes lift secondary text
   * there, and so does a generated theme.
   * @param {TextPair} p @param {string} m
   */
  const onTint = (p, m) => {
    const tok = p.fg.tokens[0];
    if (!tok || !LIFT_GROUND_TOKENS.has(String(p.bg.tokens[0]))) return null;
    const own = /** @type {any} */ (res).parts?.[p.fg.target ?? p.text]?.[tok];
    if (typeof own !== 'string') return null;
    return inMode(own, m);
  };
  /**
   * The state a pair is drawn in, when its fill is one its part draws only
   * in that state (a selected nav item's fill): the census records the pair
   * without it. Null for a pair at rest.
   * @param {TextPair} p
   * @returns {string | null}
   */
  const pairState = p => {
    const t = p.bg.target;
    const tok = p.bg.tokens?.[0];
    if (!t || !tok) return null;
    const states = ctx.project.target.get(t)?.states ?? [];
    const whens = (ctx.C.partReads(t, 'background') ?? [])
      .filter((/** @type {any} */ r) => r.token === tok)
      .flatMap((/** @type {any} */ r) => r.when)
      .filter((/** @type {string} */ w) => !/:/.test(w));
    if (!whens.length || whens.includes('')) return null;
    const found = states.filter((/** @type {string} */ st) =>
      whens.every((/** @type {string} */ w) =>
        new RegExp(`(^|[\\s,])${st}=`).test(w),
      ),
    );
    return found.length === 1 ? found[0] : null;
  };
  /** @type {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null} */
  const ofBase = (p, side, m) => {
    // The ground's own variant for the ground side (text on a header
    // variant), else the pair's variant.
    const pw = /** @type {any} */ (p);
    const w = side === 'bg' ? (pw.groundWhen ?? pw.when) : pw.when;
    const target = p[side].target;
    if (!target) return null;
    // A pair drawn in a state: the base's own rule for that state (butter
    // draws its selected nav item with no fill and a darker blue) wins
    // over its resting look and over Core's state fill.
    const state = pairState(p);
    const inState =
      state && target === p.bg.target
        ? (baseComponent(
            base,
            ctx,
            target,
            side === 'fg' ? 'color' : 'backgroundColor',
            {when: w, state},
          ) ??
          (side === 'bg'
            ? baseComponent(base, ctx, target, 'background', {
                when: w,
                state,
              })
            : null))
        : null;
    if (inState) return inMode(inState, m);
    const own =
      baseComponent(
        base,
        ctx,
        target,
        side === 'fg' ? 'color' : 'backgroundColor',
        {
          when: w,
        },
      ) ??
      (side === 'bg'
        ? baseComponent(base, ctx, target, 'background', {
            when: w,
          })
        : null);
    if (!own) return null;
    return inMode(own, m);
  };
  /**
   * The variant a pair's text is drawn in: its own, or the one variant of
   * its part that reads its text token on that ground (on the pair's fill,
   * or on no fill of its own when the text shows over another part), as
   * `variant:<name>`; null when the pair names none and no one variant is
   * it.
   * @param {TextPair} p
   * @returns {string | null}
   */
  const pairVariant = p => {
    const own = /** @type {any} */ (p).when;
    if (own) return own;
    const t = p.fg.target;
    const token = p.fg.tokens[0];
    if (!t || !token) return null;
    // A fill its part draws under one condition alone (an error toast's
    // red, `type=error`): the text on it is drawn in that condition.
    if (p.bg.target === t) {
      const conds = new Set(
        ctx.C.partReads(t, 'background')
          .filter(r => r.token === p.bg.tokens[0])
          .flatMap(r => r.when),
      );
      const one =
        conds.size === 1 ? /^([\w-]+)=([\w-]+)$/.exec([...conds][0]) : null;
      // (A state, a selected item's, is not a variant `--when` names: the
      // pair is drawn in that state, which pairState says.)
      const states = ctx.project.target.get(t)?.states ?? [];
      if (one && !states.includes(one[1])) return `${one[1]}:${one[2]}`;
    }
    // (Only variants the part is drawn in: a rule shared with its group
    // can name a variant the part does not take, which `--when` refuses.)
    const takes = new Set(
      /** @type {string[]} */ ([...(ctx.C.MAP[t]?.attrs?.variant ?? [])]),
    );
    /** @param {string[]} when */
    const atRest = when =>
      when
        .map(w => /^variant=([\w-]+)$/.exec(w)?.[1])
        .filter(v => v != null && takes.has(v));
    const reading = new Set(
      ctx.C.partReads(t, 'text')
        .filter(r => r.token === token)
        .flatMap(r => atRest(r.when)),
    );
    if (reading.size < 2) return null;
    const fills = ctx.C.partReads(t, 'background');
    const filled = new Set(fills.flatMap(r => atRest(r.when)));
    const onFill =
      p.bg.target === t
        ? new Set(
            fills
              .filter(r => r.token === p.bg.tokens[0])
              .flatMap(r => atRest(r.when)),
          )
        : null;
    const hits = [...reading].filter(v =>
      onFill ? onFill.has(v) : !filled.has(v),
    );
    return hits.length === 1 ? `variant:${hits[0]}` : null;
  };
  /**
   * The text tokens a pair's text reads in a mode. On Core's media surface
   * inside its part (a toast's inverted surface) that is the on-dark color
   * where the ground is dark and the on-light color where it is light, as
   * Core's media surface sets them; else the tokens the census saw.
   * @param {TextPair} p @param {string} m
   * @param {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null} read
   * @returns {string[]}
   */
  const textTokens = (p, m, read) => {
    const t = p.fg.target;
    // Text on a surface that keeps one side (a caption on a lightbox's
    // dark island) reads the on-color for that side, in both modes.
    const g = p.bg.target;
    const sides = /** @type {string[]} */ (
      /** @type {any} */ (g ? ctx.C.MAP[g] : null)?.mediaSides ?? []
    );
    if (
      g &&
      g !== t &&
      ctx.C.MAP[g]?.media &&
      !autoMediaPart(ctx, g) &&
      sides.length === 1 &&
      /^--color-text-(primary|secondary)$/.test(String(p.fg.tokens[0]))
    )
      return [`--color-on-${sides[0]}`];
    if (!t || !ctx.C.MAP[t]?.media || ctx.C.MAP[t]?.own?.color)
      return p.fg.tokens;
    // A surface that follows what is painted behind it (a toast's) takes
    // the side Core's rule takes on the part's fill: the theme's own text
    // where it reads ('off'), else an on-color; a fixed one, by its ground.
    if (autoMediaPart(ctx, t)) {
      const side = autoMediaSide(
        read(p, 'bg', m),
        res[/** @type {'light' | 'dark'} */ (m)],
        {mode: m, error: pairVariant(p) === 'type:error'},
      );
      return [
        side === 'off'
          ? '--color-text-primary'
          : side === 'dark'
            ? '--color-on-dark'
            : '--color-on-light',
      ];
    }
    const ground = parseColor(read(p, 'bg', m));
    if (!ground) return p.fg.tokens;
    return [
      plainOn(ground) === '#ffffff' ? '--color-on-dark' : '--color-on-light',
    ];
  };
  /**
   * The setting that draws a pair's text in a mode, by CSS's own order: a
   * `color` the text's part sets wins over a text token it sets, which
   * wins over that token set on the part the text sits on (every part
   * inside reads it). Null when no setting does.
   * @param {TextPair} p @param {string} m
   * @returns {Setting | null}
   */
  const drawnBy = (p, m) => {
    const when = pairVariant(p);
    // (A pair drawn in a state, a selected item's: a setting for that
    // state draws it too, and wins over one at rest.)
    const inState = pairState(p);
    /** @param {(x: Setting) => boolean} test @param {string | null} [w] the variant a setting must name, if any */
    const latest = (test, w = when) =>
      [...data.settings]
        .reverse()
        .sort((a, b) => Number(!!b.state) - Number(!!a.state))
        .find(
          x =>
            (!x.state || (inState != null && x.state === inState)) &&
            (!x.when || x.when === w) &&
            (!x.mode || x.mode === m) &&
            test(x),
        ) ?? null;
    /** @param {Setting} x @param {string | null} t */
    const on = (x, t) => t != null && partsOf(ctx, x).includes(t);
    const own = p.fg.target;
    const around = p.bg.target !== own ? p.bg.target : null;
    const tokens = textTokens(p, m, value);
    const mine =
      latest(
        x => x.source === 'property' && x.thing === 'color' && on(x, own),
      ) ??
      latest(
        x => x.source === 'token' && tokens.includes(x.thing) && on(x, own),
      );
    if (mine) return mine;
    // The base theme's own color on the text's part (butter's nav item)
    // wins over a token set on the part around it.
    if (ofBase(p, 'fg', m) != null) return null;
    // (On the part around it, a setting for that part's variant the text
    // sits on counts.)
    const viaGround = latest(
      x => x.source === 'token' && tokens.includes(x.thing) && on(x, around),
      /** @type {any} */ (p).groundWhen ?? when,
    );
    if (viaGround) return viaGround;
    // A token set on the region the text and its ground sit in (a top
    // bar's text color) reaches it the same way, as CSS inherits it.
    const region = /** @type {any} */ (p).over?.target ?? null;
    return region && region !== around && region !== own
      ? latest(
          x =>
            x.source === 'token' && tokens.includes(x.thing) && on(x, region),
          null,
        )
      : null;
  };
  /**
   * The mode a side of a pair is drawn in: the scheme of Core's media
   * surface around it (a lightbox's dark island draws what it holds in its
   * dark scheme, whatever the page's mode), for the text and the fill of a
   * part inside it; else the page's mode. The ground the surface itself
   * draws stays in the page's mode.
   * @param {TextPair} p @param {'fg' | 'bg'} side @param {string} m
   */
  const inScheme = (p, side, m) => {
    const drawnIn = /** @type {any} */ (p).drawnIn;
    if (!drawnIn) return m;
    return side === 'fg' || p.bg !== /** @type {any} */ (p).over ? drawnIn : m;
  };
  /**
   * A fill the theme paints on a part between the text and the ground the
   * census measured it on (a side nav pane painted blue, between its items
   * and the app shell), or on the text's own part (a tab the base draws
   * with no fill, painted gray): the text sits on that fill now. The
   * setting's value and the part it paints, or null when the theme paints
   * none there.
   * @param {TextPair} p @param {string} m
   * @returns {{value: string, part: string} | null}
   */
  const nearerFillOf = (p, m) => {
    const t = p.fg.target;
    const g = p.bg.target;
    if (!t || !g || g === t || /** @type {any} */ (p).over) return null;
    const holds = (/** @type {string} */ a, /** @type {string} */ b) =>
      /** @type {any} */ (ctx.C.MAP[a]?.contains ?? []).includes(b);
    /** @param {string} q */
    const between = q =>
      q === t ||
      (q !== g &&
        // (The census drew the text inside that part, and that part
        // inside the ground: a side nav's item in the side nav.)
        (p.within ?? []).includes(q) &&
        holds(g, q));
    const fill = [...data.settings]
      .reverse()
      .find(
        x =>
          x.source === 'property' &&
          /^background(-color)?$/.test(x.thing) &&
          !x.when &&
          !x.state &&
          (!x.mode || x.mode === m) &&
          x.on &&
          partsOf(ctx, x).some(between),
      );
    return fill
      ? {
          value: String(fill.value),
          part: /** @type {string} */ (partsOf(ctx, fill).find(between)),
        }
      : null;
  };
  /** @param {TextPair} p @param {string} m */
  const nearerFill = (p, m) => nearerFillOf(p, m)?.value ?? null;
  /** @type {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null} */
  const value = (p, side, m0) => {
    const m = inScheme(p, side, m0);
    const s = p[side];
    const tokens = side === 'fg' ? textTokens(p, m, value) : s.tokens;
    return (
      inMode(
        side === 'fg'
          ? drawnBy(p, m)?.value
          : (nearerFill(p, m) ??
              override(
                s,
                side,
                m,
                // The ground's own variant; else the variant the text is
                // drawn in, when the ground is the text's own part (a
                // secondary button's label on its secondary fill).
                /** @type {any} */ (p).groundWhen ??
                  /** @type {any} */ (p).when ??
                  (s.target && s.target === p.fg.target
                    ? pairVariant(p)
                    : null),
              )),
        m,
      ) ??
      // The base theme's own part style (neutral's destructive button),
      // which Core's reads do not know.
      ofBase(p, side, m) ??
      (side === 'fg' ? onTint(p, m) : null) ??
      (tokens.length
        ? res[/** @type {'light' | 'dark'} */ (m)][tokens[0]]
        : s.raw)
    );
  };
  /** @type {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null} */
  const baseValue = (p, side, m0) => {
    const m = inScheme(p, side, m0);
    // Lifted text on the tint is held to 4.5:1, never excused by an
    // unlifted base pair.
    if (onTint(p, m) != null) return null;
    const s = p[side];
    const tokens = side === 'fg' ? textTokens(p, m, baseValue) : s.tokens;
    return tokens.length
      ? base[/** @type {'light' | 'dark'} */ (m)][tokens[0]]
      : s.raw;
  };
  // The census renders each part once, with its default props: text on a
  // part whose variants each have their own colors (a destructive button)
  // is measured per variant too, from what each variant reads.
  /** @type {TextPair[]} */
  const variantPairs = [];
  const censusPairs = /** @type {any[]} */ (
    /** @type {any} */ (ctx).parts.pairs
  );
  /** @type {Set<string>} */
  const seenVariant = new Set();
  for (const p of censusPairs) {
    const t = p.fg.target;
    if (!t || t !== p.bg.target) continue;
    const fgReads = ctx.C.partReads(t, 'text');
    const bgReads = ctx.C.partReads(t, 'background');
    const variants = [
      ...new Set(
        bgReads
          .flatMap(r => r.when)
          .map(w => /^variant=([\w-]+)$/.exec(w)?.[1])
          .filter(Boolean),
      ),
    ];
    for (const v of /** @type {string[]} */ (variants)) {
      const bgTok = bgReads.find(r => r.when.includes(`variant=${v}`))?.token;
      const fgTok =
        fgReads.find(r => r.when.includes(`variant=${v}`))?.token ??
        p.fg.tokens[0];
      if (!bgTok || !fgTok) continue;
      if (bgTok === p.bg.tokens[0] && fgTok === p.fg.tokens[0]) continue;
      if (seenVariant.has(`${t}|${v}`)) continue;
      seenVariant.add(`${t}|${v}`);
      // The census draws every variant now: its own unscoped pair for this
      // variant is measured only as the scoped copy (its sample kept), so
      // the problem is listed once, with a fix for that variant.
      const twin = censusPairs.find(
        q =>
          q !== p &&
          q.fg.target === t &&
          q.bg.target === t &&
          q.fg.tokens[0] === fgTok &&
          q.bg.tokens[0] === bgTok,
      );
      variantPairs.push(
        /** @type {any} */ ({
          ...(twin ?? p),
          text: `${(twin ?? p).text} (variant ${v})`,
          when: `variant:${v}`,
          fg: {...(twin ?? p).fg, tokens: [fgTok]},
          bg: {...(twin ?? p).bg, tokens: [bgTok]},
          ...(twin ? {replaces: twin} : {}),
        }),
      );
    }
  }
  // Text that sits on another part (a heading on the app's header) whose
  // variants draw different grounds (the header's surface, wash and
  // elevated variants) is measured on each variant's ground, each scoped
  // to that variant, so a fix for one leaves the others as they are. Only
  // variants set can name.
  /** The grounds each settable variant of a part draws, per part. @type {Map<string, Map<string, string>>} */
  const groundsByPart = new Map();
  /** @param {string} g */
  const variantGrounds = g => {
    const known = groundsByPart.get(g);
    if (known) return known;
    const settable = /** @type {string[]} */ (
      ctx.C.variantValues(g)?.variant ?? []
    );
    /** @type {Map<string, string>} */
    const out = new Map();
    if (settable.length)
      for (const r of ctx.C.partReads(g, 'background'))
        for (const w of r.when) {
          const v = /^variant=([\w-]+)$/.exec(w)?.[1];
          if (v && settable.includes(v) && !out.has(v)) out.set(v, r.token);
        }
    groundsByPart.set(g, out);
    return out;
  };
  for (const p of /** @type {any} */ (ctx).parts.pairs) {
    const g = p.bg.target;
    if (!g || g === p.fg.target) continue;
    const grounds = variantGrounds(g);
    if (new Set(grounds.values()).size < 2) continue;
    const split = [...grounds].map(
      ([v, tok]) =>
        /** @type {any} */ ({
          ...p,
          text: `${p.text} (on ${g}, variant ${v})`,
          // The ground part's variant (the text's own part keeps its own).
          groundWhen: `variant:${v}`,
          bg: {...p.bg, tokens: [tok]},
          replaces: p,
        }),
    );
    // Only grounds that need different text as the theme draws them now
    // (a fill set on the whole part makes them alike) are told apart.
    const differ = modesOf(data).some(
      m =>
        new Set(
          split.map(q => {
            const c = parseColor(value(q, 'bg', m));
            return c ? plainOn(c) : '';
          }),
        ).size > 1,
    );
    if (differ) variantPairs.push(...split);
  }
  // Text of a part that sits in the app's top bar (one the census saw inside
  // the header region, or one the preview's own top bar draws) is measured
  // over the header's background too: a see-through background of its own
  // shows the header through it, not the page.
  /** @type {TextPair[]} */
  const headerPairs = [];
  const HEADER = 'app-shell-header';
  const census = /** @type {any} */ (ctx).parts;
  const grounds = [
    ...new Map(
      census.pairs
        .filter((/** @type {TextPair} */ p) => p.bg.target === HEADER)
        .map((/** @type {TextPair} */ p) => [
          p.bg.tokens.join('+') || p.bg.raw,
          p.bg,
        ]),
    ).values(),
  ];
  const inHeader = new Set([
    ...(census.map[HEADER]?.contains ?? []),
    ...TOP_BAR_COMPONENTS.map(kebab).filter(t => ctx.project.target.has(t)),
  ]);
  // A pair is in the top bar when the part whose background it sits on is
  // one there too (a segmented item on its control's track), or it paints
  // none of its own.
  for (const p of census.pairs)
    if (
      inHeader.has(p.text) &&
      p.bg.target !== HEADER &&
      (p.bg.target == null || inHeader.has(p.bg.target))
    )
      for (const over of grounds)
        headerPairs.push({...p, text: `${p.text} in the ${HEADER}`, over});
  // Text written straight in a part takes the part's own `color`: a part
  // with one set, whose text no census pair draws itself, is measured as
  // its own text on its own fill.
  /** @type {TextPair[]} */
  const ownTextPairs = [];
  const drawnParts = new Set(
    census.pairs.map((/** @type {TextPair} */ p) => p.fg.target),
  );
  for (const x of data.settings) {
    if (x.source !== 'property' || x.thing !== 'color' || !x.on || x.state)
      continue;
    for (const t of partsOf(ctx, x)) {
      if (drawnParts.has(t)) continue;
      // The fill the census saw the part draw (with its default props),
      // else what it reads at rest, else none: the page shows.
      const seen = census.pairs.find(
        (/** @type {TextPair} */ p) => p.bg.target === t,
      )?.bg;
      const fill =
        seen?.tokens[0] ??
        ctx.C.partReads(t, 'background').find(
          r => r.when.includes('') && r.props.some(q => /^background/.test(q)),
        )?.token;
      ownTextPairs.push(
        /** @type {any} */ ({
          text: t,
          sample: 'text written straight in it',
          fg: {target: t, tokens: [], raw: null},
          bg: {
            target: t,
            tokens: fill ? [fill] : [],
            raw: fill ? null : (seen?.raw ?? 'transparent'),
          },
          ...(x.when ? {when: x.when} : {}),
        }),
      );
    }
  }
  // Text of a part with a fill of its own inside Core's media surface (a
  // button on an overlay): that surface sets the text color tokens of what
  // it holds from --color-on-dark where it is dark and --color-on-light
  // where it is light, so the part's text is measured with the one its side
  // gives, on the part's own fill.
  /** @type {TextPair[]} */
  /**
   * A pair of a part drawn with its default props, named by the variant Core
   * draws it as (a Button is `secondary` unless told otherwise): the one
   * variant whose fill reads the pair's ground token and whose text reads
   * its text token. Its fix then reaches that variant, as a setting scoped
   * to it reaches the button the pair stands for. Any other pair as it is.
   * @param {TextPair} q
   * @returns {TextPair}
   */
  const defaultVariant = q => {
    const t = q.fg.target;
    if (!t || /** @type {any} */ (q).when || q.bg.target !== t) return q;
    const bgReads = ctx.C.partReads(t, 'background') ?? [];
    const fgReads = ctx.C.partReads(t, 'text') ?? [];
    /** @param {Array<{token: string, when: string[]}>} reads @param {string} v */
    const reads = (reads, v) =>
      reads.find(r => r.when.includes(`variant=${v}`))?.token;
    const variants = /** @type {string[]} */ ([
      ...(ctx.C.MAP[t]?.attrs?.variant ?? []),
    ]).filter(
      v =>
        reads(bgReads, v) === q.bg.tokens[0] &&
        (reads(fgReads, v) ?? q.fg.tokens[0]) === q.fg.tokens[0],
    );
    return variants.length === 1
      ? /** @type {any} */ ({...q, when: `variant:${variants[0]}`})
      : q;
  };
  const mediaPairs = [];
  const TEXT_ROLES = ['--color-text-primary', '--color-text-secondary'];
  // (One pair for each text and side, on the first surface that holds it:
  // one fix reaches it on every such surface.)
  const mediaSeen = new Set();
  for (const [m, rec] of Object.entries(ctx.C.MAP)) {
    const sides = /** @type {any} */ (rec)?.mediaSides ?? [];
    const inside = new Set(/** @type {any} */ (rec)?.contains ?? []);
    if (!(/** @type {any} */ (rec)?.media) || !sides.length || !inside.size)
      continue;
    // The ground the surface draws (a lightbox's dark overlay): a fill of
    // the text's own that lets it through (a transparent secondary button)
    // shows that, not the page.
    const reads = ctx.C.partReads(m, 'background') ?? [];
    const ground = (reads.find(r => r.when.includes('')) ?? reads[0])?.token;
    for (const q0 of [...variantPairs, ...census.pairs]) {
      const q = defaultVariant(q0);
      const t = q.fg.target;
      if (
        !t ||
        t === m ||
        !inside.has(t) ||
        q.bg.target !== t ||
        !TEXT_ROLES.includes(String(q.fg.tokens[0]))
      )
        continue;
      for (const side of sides) {
        // (A part's default variant is one with that variant's own pair.)
        const k = `${t}|${/** @type {any} */ (q).when ?? q.text}|${side}`;
        if (mediaSeen.has(k)) continue;
        mediaSeen.add(k);
        mediaPairs.push(
          /** @type {any} */ ({
            ...q,
            text: `${q.text} on ${m}`,
            fg: {
              ...q.fg,
              tokens: [
                side === 'dark' ? '--color-on-dark' : '--color-on-light',
              ],
            },
            mediaOf: m,
            drawnIn: side,
            pageOf: q,
            ...(ground ? {over: {target: m, tokens: [ground], raw: null}} : {}),
          }),
        );
      }
    }
  }
  const {problems: measured, unchecked} = ctx.C.contrast(
    value,
    baseValue,
    modesOf(data),
    {
      parseColor,
      ratio,
      alphaOf,
      compositeOver,
      page: m =>
        res[/** @type {'light' | 'dark'} */ (m)]['--color-background-body'],
    },
    [...variantPairs, ...headerPairs, ...ownTextPairs, ...mediaPairs],
  );
  // Text on a media surface is drawn in the surface's scheme whatever the
  // page's mode: one problem for it, not one for each mode.
  const mediaProblems = new Set();
  const problems = measured.filter(x => {
    const p = /** @type {any} */ (x.pair);
    if (!p?.drawnIn) return true;
    const k = `${x.part}|${p.when ?? ''}|${p.drawnIn}`;
    if (mediaProblems.has(k)) return false;
    mediaProblems.add(k);
    return true;
  });
  const slug = data.name;
  const modeFlag = (/** @type {string} */ m) =>
    modesOf(data).length > 1 ? ` --mode ${m}` : '';
  /** @type {(text: string) => ThemeProblem} */
  const plain = text => ({text, fix: null, key: text});
  /**
   * The whole-theme text token setting that draws a pair's text in a mode,
   * when no setting on a part does: one line on that token fixes every
   * place it is too faint.
   * @param {TextPair} pair @param {string} m
   * @returns {Setting | null}
   */
  const wholeOf = (pair, m) => {
    if (drawnBy(pair, m) || /** @type {any} */ (pair).mediaOf) return null;
    const toks = textTokens(pair, m, value);
    return (
      [...data.settings]
        .reverse()
        .find(
          y =>
            y.source === 'token' &&
            !y.on &&
            !y.when &&
            !y.state &&
            (!y.mode || y.mode === m) &&
            toks.includes(y.thing),
        ) ?? null
    );
  };
  /** The grounds each whole-theme text token is too faint on, by token and mode. @type {Map<string, Array<[number, number, number]>>} */
  const wholeGrounds = new Map();
  for (const x of problems) {
    const w = wholeOf(/** @type {TextPair} */ (x.pair), x.mode);
    if (!w) continue;
    const k = `${w.thing}|${x.mode}`;
    wholeGrounds.set(k, [...(wholeGrounds.get(k) ?? []), x.ground]);
  }
  const scoped = scopedTextProblems(ctx, data, res);
  /**
   * A destructive button a person cannot tell from the primary one: their
   * fills, as drawn, close in OKLab in a mode. A note (it fails no
   * contrast), with the line that draws the destructive button in the
   * theme's danger color, and its text on it.
   * @returns {ThemeProblem[]}
   */
  const destructiveLookalike = () => {
    /** The button pair drawn in a variant. @param {string} v */
    const pairOf = v =>
      variantPairs.find(
        q =>
          q.fg.target === 'button' &&
          /** @type {any} */ (q).when === `variant:${v}`,
      ) ??
      (v === 'primary'
        ? censusPairs.find(
            q =>
              q.fg.target === 'button' &&
              q.bg.target === 'button' &&
              !pairVariant(q),
          )
        : null);
    const primary = pairOf('primary');
    const destructive = pairOf('destructive');
    if (!primary || !destructive) return [];
    /** @type {ThemeProblem[]} */
    const out = [];
    for (const m of modesOf(data)) {
      const page = parseColor(
        String(
          res[/** @type {'light' | 'dark'} */ (m)]['--color-background-body'],
        ),
      );
      /** A fill as drawn on the page. @param {TextPair} q */
      const drawn = q => {
        const v = String(value(q, 'bg', m) ?? '');
        const c = parseColor(v);
        if (!c || !page || /gradient\(|url\(/.test(v)) return null;
        return compositeOver(c, alphaOf(v), page);
      };
      const a = drawn(primary);
      const b = drawn(destructive);
      if (!a || !b) continue;
      const d = oklabDistance(a, b);
      if (d >= LOOKS_ALIKE) continue;
      out.push({
        key: `lookalike|button|destructive|${m}`,
        note: true,
        text: `the destructive button (${hex(b)}) looks like the primary button (${hex(a)}) in ${m}, so Delete and Save read alike; to draw it in the theme's danger color: ${P} set ${data.name} background-color 'var(--color-error)' --on button --when variant:destructive && ${P} set ${data.name} color 'var(--color-on-error)' --on button --when variant:destructive`,
        fix: null,
      });
      break;
    }
    return out;
  };
  return [
    ...problems.map(x => ({
      // What the problem is, whatever its ratio: the text, the token or
      // property that draws it, what it sits on, its variant and mode.
      key: `text|${x.part}|${x.textPart ?? ''}|${x.fgToken ?? ''}|${x.bgPart ?? ''}|${/** @type {any} */ (x.pair)?.bg?.tokens?.join('+') ?? ''}|${x.when ?? ''}|${x.sample}|${x.mode}`,
      text: `text in ${x.part} ("${x.sample}") is ${x.ratio}:1 in ${/** @type {any} */ (x.pair)?.drawnIn ? `${/** @type {any} */ (x.pair).drawnIn} (${/** @type {any} */ (x.pair).mediaOf} draws it in its ${/** @type {any} */ (x.pair).drawnIn} scheme)` : x.mode} (${x.fg} on ${(x.pair ? nearerFillOf(/** @type {TextPair} */ (x.pair), inScheme(/** @type {TextPair} */ (x.pair), 'bg', x.mode))?.part : null) ?? x.bgPart ?? 'the page'}'s ${x.bg}${x.over ? ` over ${x.over}` : ''}); text needs 4.5:1`,
      // The fix sets what draws the text: the setting that wins in CSS,
      // where one does, else the text token where the text sits.
      fix: (() => {
        const pair = /** @type {TextPair} */ (x.pair);
        // (A pair drawn in a state, a selected item's: its line is for that
        // state.)
        const pairIn = pairState(pair);
        const stateFlag = pairIn ? ` --state ${pairIn}` : '';
        // Secondary text (a placeholder, a caption) stays secondary: its
        // own color moved toward black or white just far enough to read at
        // 4.5:1, not the plain black or white of primary text.
        // (It reads on every ground that text sits on there: a token set on
        // a part reaches its text on each of the part's grounds.)
        const fgNow = parseColor(String(value(pair, 'fg', x.mode) ?? ''));
        const secondary =
          fgNow &&
          /^--color-text-(secondary|placeholder)/.test(
            String(pair.fg.tokens?.[0]),
          );
        const page = parseColor(
          String(
            res[/** @type {'light' | 'dark'} */ (x.mode)][
              '--color-background-body'
            ],
          ),
        );
        const groundsThere = secondary
          ? [
              x.ground,
              .../** @type {TextPair[]} */ (
                /** @type {any} */ (ctx).parts.pairs
              )
                .filter(
                  q =>
                    (q.bg.target === x.bgPart || q.fg.target === x.textPart) &&
                    q.fg.tokens[0] === pair.fg.tokens[0],
                )
                .map(q => {
                  const v = String(value(q, 'bg', x.mode) ?? '');
                  const c = parseColor(v);
                  const a = alphaOf(v);
                  return c && a < 1 && page ? compositeOver(c, a, page) : c;
                })
                .filter(g => g != null && plainOn(g) === plainOn(x.ground)),
            ]
          : [];
        const color = `'${
          secondary
            ? nearestReading(
                /** @type {[number, number, number]} */ (fgNow),
                /** @type {Array<[number, number, number]>} */ (groundsThere),
                4.5,
              )
            : plainOn(x.ground)
        }'`;
        // Text in the top bar sits over each of the bar's grounds (its
        // variants): when they need opposite text, one color set on the
        // text's part turns it the wrong way on the others, so no line
        // fixes this alone.
        const over = /** @type {any} */ (pair).over;
        if (over && !(/** @type {any} */ (pair).mediaOf)) {
          const own = value(pair, 'bg', x.mode);
          const sides = new Set(
            grounds.map(g => {
              const under = parseColor(value({...pair, bg: g}, 'bg', x.mode));
              const top = parseColor(own);
              const a = alphaOf(own);
              const rgb =
                top && under
                  ? a >= 1
                    ? top
                    : compositeOver(top, a, under)
                  : under;
              return rgb ? plainOn(rgb) : null;
            }),
          );
          if (sides.size > 1) return null;
        }
        const drawn = drawnBy(pair, x.mode);
        // Scoped to the variant the text is drawn in, so the fix leaves the
        // part's other variants, on other grounds, as they are.
        const variant = pairVariant(pair);
        const when = (/** @type {string | null | undefined} */ w) =>
          w ? ` --when ${w}` : '';
        // A part the theme scopes to itself alone (a setting on it with
        // --only) is fixed alone too: --on it would reach its whole group.
        const only = (/** @type {string | null | undefined} */ part) =>
          part && data.settings.some(s => s.on === part && s.only)
            ? ' --only'
            : '';
        // Text inside Core's media surface (a button on a lightbox's dark
        // island) is drawn in the surface's scheme whatever the page's
        // mode: a color on its part (its variant) for that mode reaches it
        // there, and the page's parts in that mode, which sit on a ground of
        // the same kind. When the part's own fill lets the surface's ground
        // through (a transparent button) and the same text on the page in
        // that mode needs the other color, the two grounds disagree: the
        // surface's own on-color for its side reaches only the text inside
        // it (unless a color the theme set on the part draws the text).
        const onMedia = /** @type {any} */ (pair).mediaOf;
        const drawnIn = /** @type {any} */ (pair).drawnIn;
        if (onMedia && drawnIn) {
          const q = /** @type {TextPair} */ (/** @type {any} */ (pair).pageOf);
          const v = q ? value(q, 'bg', drawnIn) : null;
          const page = parseColor(
            String(
              res[/** @type {'light' | 'dark'} */ (drawnIn)][
                '--color-background-body'
              ],
            ),
          );
          const c = parseColor(String(v ?? ''));
          const a = alphaOf(String(v ?? ''));
          const through =
            !/gradient\(|url\(/.test(String(v ?? '')) && (!c || a < 1);
          const ground = !through
            ? null
            : c && page
              ? compositeOver(c, a, page)
              : page;
          const theirs = drawnBy(pair, drawnIn);
          if (ground && plainOn(ground) !== plainOn(x.ground)) {
            if (theirs?.thing === 'color') return null;
            // (Text the surface draws on its own on-color grounds, a
            // caption bar, would need that on-color the other way: then the
            // surface's own ground (its overlay) is what turned, and the
            // base theme's value for it is the line.)
            const want = plainOn(x.ground);
            const bars = census.pairs.some((/** @type {TextPair} */ q) => {
              if (
                q.bg.target !== onMedia ||
                !/^--color-on-/.test(String(q.bg.tokens[0]))
              )
                return false;
              const g = parseColor(String(value(q, 'bg', drawnIn) ?? ''));
              return g != null && plainOn(g) !== want;
            });
            if (!bars)
              return `${P} set ${slug} --color-on-${drawnIn} ${color} --on ${onMedia}`;
            const tok = /** @type {any} */ (pair).over?.tokens?.[0];
            const was = tok ? /** @type {any} */ (base)?.[x.mode]?.[tok] : null;
            return tok &&
              was &&
              was !== res[/** @type {'light' | 'dark'} */ (x.mode)][tok]
              ? `${P} set ${slug} ${tok} '${was}'${stateFlag}${modeFlag(x.mode)}`
              : null;
          }
          if (x.textPart)
            return `${P} set ${slug} color ${color} --on ${x.textPart}${only(x.textPart)}${when(theirs?.when ?? variant)}${modeFlag(drawnIn)}`;
        }
        // Text whose part's own color reads on a pane the theme painted for
        // it (a side nav's dark fill), shown here on another part that
        // holds it unpainted (the mobile nav drawer): that part takes the
        // same fill, which keeps the color where it reads. Recoloring the
        // text would turn it the wrong way on the painted pane.
        if (
          drawn?.thing === 'color' &&
          x.textPart &&
          x.bgPart &&
          x.bgPart !== x.textPart &&
          drawn.on &&
          partsOf(ctx, drawn).includes(x.textPart)
        ) {
          const holds = (/** @type {string} */ a, /** @type {string} */ b) =>
            /** @type {any} */ (ctx.C.MAP[a]?.contains ?? []).includes(b);
          const fg = parseColor(String(value(pair, 'fg', x.mode) ?? ''));
          const pane = [...data.settings]
            .reverse()
            .find(
              y =>
                y.source === 'property' &&
                /^background(-color)?$/.test(y.thing) &&
                !y.when &&
                !y.state &&
                (!y.mode || y.mode === x.mode) &&
                y.on &&
                y.on !== x.bgPart &&
                partsOf(ctx, y).some(q => holds(q, String(x.textPart))),
            );
          const paneColor = pane ? parseColor(String(pane.value)) : null;
          if (
            pane &&
            fg &&
            paneColor &&
            holds(x.bgPart, x.textPart) &&
            ratio(fg, paneColor) >= 4.5
          )
            return `${P} set ${slug} background-color '${String(pane.value)}' --on ${x.bgPart}${only(x.bgPart)}${stateFlag}${modeFlag(x.mode)}`;
        }
        // Text a whole-theme token setting draws, too faint in several
        // places: one line on that token, the nearest color that reads on
        // every ground it is too faint on (all of one side, light or dark).
        const whole = wholeOf(pair, x.mode);
        const wholeOn = whole
          ? wholeGrounds.get(`${whole.thing}|${x.mode}`)
          : null;
        if (
          whole &&
          wholeOn &&
          wholeOn.length > 1 &&
          wholeOn.every(g => plainOn(g) === plainOn(wholeOn[0]))
        ) {
          const fg = parseColor(String(value(pair, 'fg', x.mode) ?? ''));
          if (fg)
            return `${P} set ${slug} ${whole.thing} '${nearestReading(fg, wholeOn, 4.5)}'${modeFlag(x.mode)}`;
        }
        if (drawn) {
          const onText =
            drawn.on && partsOf(ctx, drawn).includes(String(x.textPart));
          // A setting that reaches the text's part through its group (a
          // color on date-input, which every input takes) cannot name a
          // variant only the text's part has: that variant is scoped on
          // the text's own part instead.
          const v = drawn.when ?? (onText ? variant : null);
          const name = /^variant:([\w-]+)$/.exec(String(v ?? ''))?.[1];
          if (
            name &&
            !drawn.when &&
            drawn.on &&
            x.textPart &&
            drawn.on !== x.textPart &&
            ![
              .../** @type {string[]} */ (
                /** @type {any} */ (ctx.C.MAP[drawn.on])?.attrs?.variant ?? []
              ),
            ].includes(name)
          )
            return `${P} set ${slug} ${drawn.thing} ${color} --on ${x.textPart}${only(x.textPart)}${when(v)}${stateFlag}${modeFlag(x.mode)}`;
          return `${P} set ${slug} ${drawn.thing} ${color}${drawn.on ? ` --on ${drawn.on}${drawn.only ? ' --only' : ''}` : ''}${when(v)}${stateFlag}${modeFlag(x.mode)}`;
        }
        // (Text on a toast's own surface takes a color on the toast: a
        // text token there never reaches it.)
        if (x.textPart && autoMediaPart(ctx, x.textPart))
          return `${P} set ${slug} color ${color} --on ${x.textPart}${only(x.textPart)}${when(variant)}${stateFlag}${modeFlag(x.mode)}`;
        // Text on a surface's own ground drawn from its on-color (a
        // lightbox's caption bar): the ground is what changed, and that
        // on-color on the surface is the line that reaches it, set to the
        // color the text reads on.
        const groundToken = String(pair.bg.tokens?.[0] ?? '');
        if (
          x.bgPart &&
          ctx.C.MAP[x.bgPart]?.media &&
          !autoMediaPart(ctx, x.bgPart) &&
          /^--color-on-(dark|light)$/.test(groundToken)
        ) {
          const fg = parseColor(String(value(pair, 'fg', x.mode) ?? ''));
          return fg
            ? `${P} set ${slug} ${groundToken} '${plainOn(fg)}' --on ${x.bgPart}${only(x.bgPart)}`
            : null;
        }
        // The base theme colors the text on its own part: only a color
        // there changes what is drawn.
        // (Text on a ground part's variants that need opposite text: a color
        // on the text's part turns it the wrong way on the others.)
        const was = /** @type {any} */ (pair).replaces;
        const sidesOver = was
          ? new Set(
              variantPairs
                .filter(q => /** @type {any} */ (q).replaces === was)
                .map(q => {
                  const g = parseColor(value(q, 'bg', x.mode));
                  return g ? plainOn(g) : null;
                }),
            ).size
          : 1;
        if (x.textPart && ofBase(pair, 'fg', x.mode) != null)
          return sidesOver > 1
            ? null
            : `${P} set ${slug} color ${color} --on ${x.textPart}${only(x.textPart)}${when(variant)}${stateFlag}${modeFlag(x.mode)}`;
        const token = x.fgToken ? textTokens(pair, x.mode, value)[0] : null;
        // A ground part that draws several grounds the theme cannot tell
        // apart (variants set cannot name): a token set on it would turn
        // the text on its other grounds the other way. The text's own part
        // is fixed instead, when its text sits on one ground only; else no
        // line can fix this alone.
        const groundsOf = (/** @type {(q: TextPair) => boolean} */ test) =>
          new Set(
            /** @type {any} */ (ctx).parts.pairs
              .filter(
                (/** @type {TextPair} */ q) =>
                  q.bg.target === x.bgPart && test(q),
              )
              // The text each ground needs now (black or white), as the
              // theme draws it: grounds a setting made alike are one.
              .map((/** @type {TextPair} */ q) => {
                const g = parseColor(value(q, 'bg', x.mode));
                return g ? plainOn(g) : '';
              }),
          ).size;
        // Text over a region's ground (a button in the top bar): a token on
        // the region reaches its text there, and nowhere else.
        const region = /** @type {any} */ (pair).over?.target;
        if (token && region && !onMedia)
          return `${P} set ${slug} ${token} ${color} --on ${region}${only(region)}${stateFlag}${modeFlag(x.mode)}`;
        const mixed =
          token &&
          x.bgPart &&
          x.bgPart !== x.textPart &&
          !x.when &&
          !(/** @type {any} */ (pair).groundWhen) &&
          groundsOf(() => true) > 1;
        if (mixed)
          return x.textPart &&
            groundsOf(
              (/** @type {TextPair} */ q) => q.fg.target === x.textPart,
            ) === 1
            ? `${P} set ${slug} ${token} ${color} --on ${x.textPart}${only(x.textPart)}${when(variant)}${stateFlag}${modeFlag(x.mode)}`
            : null;
        // (The ground is the part the theme painted under the text, where
        // it painted one: a tab given a fill of its own.)
        const groundPart =
          nearerFillOf(pair, inScheme(pair, 'bg', x.mode))?.part ?? x.bgPart;
        if (token)
          return x.bgPart && x.bgPart !== x.textPart
            ? `${P} set ${slug} ${token} ${color} --on ${groundPart}${only(String(groundPart))}${when(/** @type {any} */ (pair).groundWhen ?? x.when)}${stateFlag}${modeFlag(x.mode)}`
            : `${P} set ${slug} ${token} ${color}${x.textPart ? ` --on ${x.textPart}${only(x.textPart)}` : ''}${when(variant)}${stateFlag}${modeFlag(x.mode)}`;
        return x.textPart
          ? `${P} set ${slug} color ${color} --on ${x.textPart}${only(x.textPart)}${when(x.when)}${stateFlag}${modeFlag(x.mode)}`
          : null;
      })(),
    })),
    ...borderContrastProblems(ctx, data, res, base),
    ...trackContrastProblems(ctx, data, res, base),
    ...floatingEdgeProblems(ctx, data, res, base),
    ...scoped.problems,
    ...buttonStyleProblems(ctx, data, res),
    ...placeholderProblems(ctx, data, res, base),
    ...leakedButtonProblems(ctx, data, res),
    ...destructiveLookalike(),
    // Pairs styled for one state or condition whose colors cannot be read
    // as one color, and the button styles, are not measured yet.
    ...(() => {
      const scopedLeft = [...new Set(scoped.unmeasured)];
      return scopedLeft.length
        ? [
            plain(
              `not checked: text contrast for ${scopedLeft
                .slice(0, 3)
                .map(describe)
                .join(
                  '; ',
                )}${scopedLeft.length > 3 ? ` and ${scopedLeft.length - 3} more` : ''}, set for one variant or state`,
            ),
          ]
        : [];
    })(),
    ...(unchecked.length
      ? [
          plain(
            `not checked: text on or in ${unchecked.slice(0, 3).join(', ')}${unchecked.length > 3 ? ` and ${unchecked.length - 3} more` : ''}, which the editor cannot read as one fixed color`,
          ),
        ]
      : []),
  ];
}

/**
 * One problem the theme has, with the command that fixes it, or null when
 * no one command does. `key` names the problem whatever its ratio (what
 * is drawn, on what, in which variant and mode), so a change that only
 * moves a ratio makes no new problem.
 * @typedef {{text: string, fix: string | null, key: string, note?: boolean}} ThemeProblem
 */

/**
 * The plain black or white that stands out most from a drawn color: what a
 * fix sets text or a border to so it reads.
 * @param {[number, number, number]} rgb
 */
function plainOn(rgb) {
  return ratio([0, 0, 0], rgb) >= ratio([255, 255, 255], rgb)
    ? '#000000'
    : '#ffffff';
}

/**
 * The contrast under which a border no longer differs from the page at all
 * (the page's own color, within rounding). Where the base's own border is a
 * hairline under 3:1, the theme's hairline is a choice of how faint, a
 * clone's #ebebeb as much as the base's; only a border that draws nothing
 * is a problem there.
 */
const HAIRLINE_SHOWS = 1.02;

/**
 * A color moved toward black or white (whichever stands out on the
 * grounds) just far enough to reach a contrast on each: the nearest color
 * that reads, so a muted gray stays a gray.
 * @param {[number, number, number]} from
 * @param {Array<[number, number, number]>} grounds the first decides black or white
 * @param {number} need
 * @returns {string}
 */
function nearestReading(from, grounds, need) {
  const to = plainOn(grounds[0]);
  const end = /** @type {[number, number, number]} */ (parseColor(to));
  for (let i = 0; i <= 100; i++) {
    const c = /** @type {[number, number, number]} */ (
      from.map((v, k) => Math.round(v + ((end[k] - v) * i) / 100))
    );
    if (grounds.every(g => ratio(c, g) >= need)) return hex(c);
  }
  return to;
}

/**
 * Border contrast problems this theme caused: a border color it sets (a
 * border token for the whole theme, or a part's own border) below 3:1
 * against what the border sits on (the part's background, else the page)
 * in a mode, where the base theme's border there was not as low. A border
 * below 3:1 does not show as an edge (a control's edge needs 3:1, WCAG
 * 1.4.11): a part's own border counts on controls only (a card's or a
 * divider's is decoration). The border token for the whole theme, where
 * the base's own is a hairline under 3:1 (its edge comes from elsewhere, a
 * fill), is a problem only when it draws nothing at all
 * ({@link HAIRLINE_SHOWS}). The fix is the nearest color that reaches 3:1.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @returns {ThemeProblem[]}
 */
function borderContrastProblems(ctx, data, res, base) {
  const modeFlag = (/** @type {string} */ m) =>
    modesOf(data).length > 1 ? ` --mode ${m}` : '';
  /**
   * The fix color for a border on a ground, or null: the border's own color
   * moved toward black or white (whichever stands out on the ground) just
   * far enough to reach 3:1, so a faint gray edge becomes the nearest gray
   * that shows, not black.
   * @param {string} ground @param {string} page @param {string} [border]
   */
  const fixOn = (ground, page, border) => {
    const p = parseColor(page);
    const g0 = parseColor(ground);
    if (!p || !g0) return null;
    const g = compositeOver(g0, alphaOf(ground), p);
    const b0 = border ? parseColor(border) : null;
    if (!b0) return plainOn(g);
    return nearestReading(
      compositeOver(b0, alphaOf(String(border)), g),
      [g],
      3,
    );
  };
  /**
   * Whether a part is a control (it takes input: Core draws it disabled,
   * or as a button): its edge is how it is found, and needs 3:1 (WCAG
   * 1.4.11). A container's border (a card's hairline) is decoration, and a
   * faint one is a choice.
   * @param {string} t
   */
  const control = t => {
    const rec = /** @type {any} */ (ctx.C.MAP[t]);
    return Boolean(
      rec &&
      ('disabled' in (rec.attrs ?? {}) ||
        [...(rec.tags ?? [])].some(
          (/** @type {string} */ g) =>
            g === 'button' || g === 'input' || g === 'select',
        )),
    );
  };
  /** A value as one color in a mode: its half of light-dark(), a token read. @param {string} v @param {'light' | 'dark'} m @param {Record<string, string>} tokens */
  const inMode = (v, m, tokens) => {
    let x = String(v ?? '').trim();
    for (let i = 0; i < 4; i++) {
      const pair = /^light-dark\((.*)\)$/is.exec(x);
      if (pair) {
        const halves = splitTop(pair[1], ',');
        if (halves.length === 2) x = halves[m === 'light' ? 0 : 1].trim();
      }
      const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(x);
      if (!ref) break;
      x = String(tokens[ref[1]] ?? '');
    }
    return x;
  };
  /** The color word of a border shorthand, or the value. @param {string} v */
  const colorOfBorder = v =>
    splitTop(String(v).trim(), ' ').find(
      w => /^(light-dark|var)\(/i.test(w) || isColorValue(w),
    ) ?? null;
  /** The ratio of a border over what it sits on, or null when either is no one color. @param {string} border @param {string} ground @param {string} page */
  const measure = (border, ground, page) => {
    const p = parseColor(page);
    const g0 = parseColor(ground);
    const b0 = parseColor(border);
    if (!p || !g0 || !b0) return null;
    const g = compositeOver(g0, alphaOf(ground), p);
    const b = compositeOver(b0, alphaOf(border), g);
    return ratio(b, g);
  };
  /** @type {Map<string, ThemeProblem>} */
  const out = new Map();
  /** @param {string} key @param {string} text @param {string | null} fix */
  const add = (key, text, fix) => {
    if (!out.has(key)) out.set(key, {text, fix, key});
  };
  /** The border a setting draws: a border or an outline. @param {string} thing */
  const edge = thing => thing.replace(/-color$/, '');
  for (const m of modesOf(data)) {
    const mode = /** @type {'light' | 'dark'} */ (m);
    const page = res[mode]['--color-background-body'];
    const basePage = base[mode]['--color-background-body'];
    for (const [i, x] of data.settings.entries()) {
      if (x.state || x.when || (x.mode && x.mode !== mode)) continue;
      // A later setting of the same border for this mode on the same
      // parts is the one that shows.
      const parts = x.on ? partsOf(ctx, x) : [];
      if (
        data.settings
          .slice(i + 1)
          .some(
            y =>
              !y.state &&
              !y.when &&
              (!y.mode || y.mode === mode) &&
              y.source === x.source &&
              (x.source === 'token'
                ? y.thing === x.thing && !y.on && !x.on
                : edge(y.thing) === edge(x.thing) &&
                  parts.every(t => partsOf(ctx, y).includes(t))),
          )
      )
        continue;
      // A border token for the whole theme, on the page.
      if (
        x.source === 'token' &&
        !x.on &&
        /^--color-border(-|$)/.test(x.thing)
      ) {
        const now = measure(
          inMode(res[mode][x.thing], mode, res[mode]),
          page,
          page,
        );
        const was = measure(
          inMode(base[mode][x.thing], mode, base[mode]),
          basePage,
          basePage,
        );
        if (
          now != null &&
          now < 3 &&
          (was == null || (was >= 3 ? was > now : now < HAIRLINE_SHOWS))
        ) {
          const color = fixOn(
            page,
            page,
            inMode(res[mode][x.thing], mode, res[mode]),
          );
          add(
            `border|${x.thing}|${mode}`,
            `the border ${x.thing} (${inMode(res[mode][x.thing], mode, res[mode])}) is ${now.toFixed(2)}:1 on the page in ${mode} (${page}); a border needs 3:1 to show as an edge`,
            color
              ? `${P} set ${data.name} ${x.thing} '${color}'${modeFlag(mode)}`
              : null,
          );
        }
        continue;
      }
      // A part's own border color, on the part's background.
      if (
        x.source !== 'property' ||
        !x.on ||
        !/^(border|border-color|outline|outline-color)$/.test(x.thing)
      )
        continue;
      const color = /-color$/.test(x.thing)
        ? String(x.value)
        : colorOfBorder(String(x.value));
      if (!color) continue;
      const border = inMode(color, mode, res[mode]);
      for (const t of partsOf(ctx, x).filter(control)) {
        const own = [...data.settings]
          .reverse()
          .find(
            y =>
              !y.state &&
              !y.when &&
              (!y.mode || y.mode === mode) &&
              y.source === 'property' &&
              /^background(-color)?$/.test(y.thing) &&
              partsOf(ctx, y).includes(t),
          );
        const read = ctx.C.partReads(t, 'background').find(
          r => r.when.includes('') && r.props.some(p => /^background/.test(p)),
        );
        const ground = own
          ? inMode(String(own.value), mode, res[mode])
          : read
            ? inMode(`var(${read.token})`, mode, res[mode])
            : page;
        const now = measure(border, ground || page, page);
        // The base theme's border on the part: what it reads at rest, else
        // in its default variant (a card's), else the shared border token.
        const bReads = ctx.C.partReads(t, 'border').filter(r =>
          r.props.some(p => /border.*color|^border$/.test(p)),
        );
        const bRead = bReads.find(r => r.when.includes('')) ??
          bReads[0] ?? {token: '--color-border'};
        const was = measure(
          inMode(`var(${bRead.token})`, mode, base[mode]),
          read
            ? inMode(`var(${read.token})`, mode, base[mode]) || basePage
            : basePage,
          basePage,
        );
        if (now != null && now < 3 && (was == null || was > now)) {
          const color = fixOn(ground || page, page, border);
          add(
            `border|${x.thing}|${t}|${mode}`,
            `the border on ${t} (${border}) is ${now.toFixed(2)}:1 on its ${ground && ground !== page ? `background ${ground}` : `page ${page}`} in ${mode}; a border needs 3:1 to show as an edge`,
            color
              ? `${P} set ${data.name} ${/-color$/.test(x.thing) ? x.thing : `${x.thing.replace(/^(border|outline).*$/, '$1')}-color`} '${color}' --on ${t}${x.only && x.on === t ? ' --only' : ''}${modeFlag(mode)}`
              : null,
          );
          break;
        }
      }
    }
  }
  return [...out.values()];
}

/**
 * Track contrast problems this theme caused: a value a part draws on a
 * track (a progress bar's fill, a slider's thumb) below 3:1 against the
 * track at rest in a mode, where the base theme's was not as low. The fill
 * is how the value is read, so it needs 3:1 against what it sits on (WCAG
 * 1.4.11), as a control's edge does. A track is a part named for one (its
 * name ends in -track), and what it draws a value with is each part of its
 * component beside or inside it that paints a fill of its own. A fill
 * inside the track (a progress bar's) is read against the track alone; one
 * beside it (a slider's thumb, larger than the track) is lost only when it
 * reads neither on the track nor on the page.
 * Each fill reads its token where the parts around it point it (neutral's
 * progress track reads the muted fill, which its progress bar points at
 * the emphasized border). The fix is the nearest color for the track that
 * reaches 3:1, on the track alone, so the fill keeps the color it shows
 * everywhere else.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @param {{light: Record<string, string>, dark: Record<string, string>, components?: Record<string, any>}} base
 * @returns {ThemeProblem[]}
 */
function trackContrastProblems(ctx, data, res, base) {
  const map = /** @type {Record<string, any>} */ (ctx.C.MAP);
  const modeFlag = (/** @type {string} */ m) =>
    modesOf(data).length > 1 ? ` --mode ${m}` : '';
  /** The component a part belongs to. @param {string} t */
  const component = t => ctx.project.target.get(t)?.component ?? null;
  /** The parts that hold a part. @param {string} t */
  const holders = t =>
    Object.keys(map).filter(h => map[h]?.contains?.includes(t));
  /** The token a part fills itself with at rest, or null. @param {string} t */
  const fillToken = t =>
    ctx.C.partReads(t, 'background').find(
      r =>
        r.token &&
        r.when.includes('') &&
        r.props.some(p => /^background(-color)?$/.test(p)),
    )?.token ??
    ctx.C.partReads(t, 'background').find(
      r => r.token && r.props.some(p => /^background(-color)?$/.test(p)),
    )?.token ??
    null;
  /**
   * A token's color in a mode on a part: where the part or a part holding
   * it points the token at another value, that value, as the theme built
   * it (its own blocks) or the base theme draws it.
   * @param {string} token @param {string} t @param {'light' | 'dark'} m
   * @param {Record<string, string>} tokens @param {Record<string, any>} [own] part-scoped tokens
   * @param {Record<string, any>} [blocks] the base theme's part blocks
   */
  const colorOn = (token, t, m, tokens, own, blocks) => {
    const around = [t, ...holders(t)];
    let v = `var(${token})`;
    for (let i = 0; i < 6; i++) {
      const pair = /^light-dark\((.*)\)$/is.exec(v.trim());
      if (pair) {
        const halves = splitTop(pair[1], ',');
        if (halves.length === 2) v = halves[m === 'light' ? 0 : 1].trim();
      }
      const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(v.trim())?.[1];
      if (!ref) break;
      const scoped =
        around
          .map(
            a =>
              own?.[a]?.[ref] ??
              blocks?.[a]?.base?.[ref] ??
              Object.values(blocks?.[a] ?? {}).find(
                (/** @type {any} */ b) =>
                  b && typeof b === 'object' && typeof b[ref] === 'string',
              )?.[ref],
          )
          .find(x => typeof x === 'string' && x !== `var(${ref})`) ?? null;
      v = String(scoped ?? tokens[ref] ?? '');
    }
    const rgb = parseColor(v.trim());
    return rgb ? {rgb, alpha: alphaOf(v), value: v.trim()} : null;
  };
  /**
   * A part's own fill in a mode, as the theme sets it at rest (a later
   * setting wins), read in that mode, or null.
   * @param {string} t @param {'light' | 'dark'} m
   */
  const ownFill = (t, m) => {
    const hit = [...data.settings]
      .reverse()
      .find(
        x =>
          !x.state &&
          !x.when &&
          (!x.mode || x.mode === m) &&
          x.source === 'property' &&
          /^background(-color)?$/.test(x.thing) &&
          partsOf(ctx, x).includes(t),
      );
    if (!hit) return null;
    const halves = /^light-dark\((.*)\)$/is.exec(String(hit.value).trim());
    const one = halves
      ? (splitTop(halves[1], ',')[m === 'light' ? 0 : 1] ?? '').trim()
      : String(hit.value).trim();
    const ref = /^var\(\s*(--[\w-]+)/.exec(one)?.[1];
    const v = ref ? String(res[m][ref] ?? '') : one;
    const rgb = parseColor(v);
    return rgb ? {rgb, alpha: alphaOf(v), value: v} : null;
  };
  /** @type {ThemeProblem[]} */
  const out = [];
  const own = /** @type {any} */ (res).parts ?? {};
  for (const track of Object.keys(map).filter(t => /-track$/.test(t))) {
    if (!ctx.project.target.has(track)) continue;
    const trackToken = fillToken(track);
    if (!trackToken) continue;
    const fills = [
      ...new Set([
        ...(map[track]?.contains ?? []),
        ...holders(track).flatMap(h => map[h]?.contains ?? []),
      ]),
    ].filter(
      f =>
        f !== track &&
        !/-track$/.test(f) &&
        !holders(track).includes(f) &&
        component(f) != null &&
        component(f) === component(track) &&
        Boolean(fillToken(f)),
    );
    for (const fill of fills) {
      const fillTok = /** @type {string} */ (fillToken(fill));
      for (const m of modesOf(data)) {
        const mode = /** @type {'light' | 'dark'} */ (m);
        const page = parseColor(String(res[mode]['--color-background-body']));
        const basePage = parseColor(
          String(base[mode]['--color-background-body']),
        );
        const tr =
          ownFill(track, mode) ??
          colorOn(trackToken, track, mode, res[mode], own, base.components);
        const fi =
          ownFill(fill, mode) ??
          colorOn(fillTok, fill, mode, res[mode], own, base.components);
        const btr = colorOn(
          trackToken,
          track,
          mode,
          base[mode],
          undefined,
          base.components,
        );
        const bfi = colorOn(
          fillTok,
          fill,
          mode,
          base[mode],
          undefined,
          base.components,
        );
        if (!tr || !fi || !page) continue;
        const inside = Boolean(map[track]?.contains?.includes(fill));
        /** How well a fill reads where it sits. @param {any} f @param {any} t @param {[number, number, number]} pg */
        const reads = (f, t, pg) => {
          const g = compositeOver(t.rgb, t.alpha, pg);
          const onTrack = ratio(compositeOver(f.rgb, f.alpha, g), g);
          return inside
            ? onTrack
            : Math.max(onTrack, ratio(compositeOver(f.rgb, f.alpha, pg), pg));
        };
        const ground = compositeOver(tr.rgb, tr.alpha, page);
        const now = reads(fi, tr, page);
        const was = btr && bfi && basePage ? reads(bfi, btr, basePage) : null;
        if (now >= 3 || (was != null && was <= now)) continue;
        // The fix moves the side the theme moved: the track when its color
        // is not the base's (a border it follows), else the fill, on that
        // part alone, so the color it shows elsewhere stays.
        const trackMoved = !btr || hex(btr.rgb) !== hex(tr.rgb);
        const fillGround = inside
          ? ground
          : /** @type {[number, number, number]} */ (page);
        const color = trackMoved
          ? nearestReading(ground, [compositeOver(fi.rgb, fi.alpha, ground)], 3)
          : nearestReading(
              compositeOver(fi.rgb, fi.alpha, ground),
              [ground, ...(inside ? [] : [fillGround])],
              3,
            );
        out.push({
          key: `track|${track}|${fill}|${mode}`,
          text: `the ${fill} (${hex(fi.rgb)}) is ${now.toFixed(2)}:1 on the ${track} (${hex(ground)})${inside ? '' : ' and no better on the page'} in ${mode}; a value drawn on a track needs 3:1 to be read`,
          fix: `${P} set ${data.name} background-color '${color}' --on ${trackMoved ? track : fill}${modeFlag(mode)}`,
        });
      }
    }
  }
  return out;
}

/**
 * Floating edge problems: a panel that floats over the page (a menu, a
 * popover, a dialog) whose fill is within 1.1:1 of the page in a mode,
 * with no border and no shadow, has no edge to be seen by, whether the
 * surfaces dial or the theme's own settings drew it so. The fix is a
 * hairline border of the theme's border color on the panel.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @param {{light: Record<string, string>, dark: Record<string, string>, components?: Record<string, any>}} base
 * @returns {ThemeProblem[]}
 */
function floatingEdgeProblems(ctx, data, res, base) {
  const map = /** @type {Record<string, any>} */ (ctx.C.MAP);
  const own = /** @type {any} */ (res).parts ?? {};
  /** The latest setting at rest on a part, of one of some things. @param {string} t @param {RegExp} thing @param {'light' | 'dark'} [m] */
  const last = (t, thing, m) =>
    [...data.settings]
      .reverse()
      .find(
        x =>
          !x.state &&
          !x.when &&
          (!m || !x.mode || x.mode === m) &&
          thing.test(x.thing) &&
          (x.thing === 'surfaces' || partsOf(ctx, x).includes(t)),
      );
  /** A value in a mode: its half of light-dark(), its tokens read. @param {string} v @param {string} t @param {'light' | 'dark'} m */
  const read = (v, t, m) => {
    let x = String(v ?? '').trim();
    for (let i = 0; i < 6; i++) {
      const pair = /^light-dark\((.*)\)$/is.exec(x);
      if (pair) {
        const halves = splitTop(pair[1], ',');
        if (halves.length === 2) x = halves[m === 'light' ? 0 : 1].trim();
      }
      const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(x)?.[1];
      if (!ref) break;
      x = String(
        own[t]?.[ref] ?? base.components?.[t]?.base?.[ref] ?? res[m][ref] ?? '',
      ).trim();
    }
    return x;
  };
  /** The census value a part draws at rest for a property, or null. @param {string} t @param {string} prop */
  const atRest = (t, prop) => {
    const at = map[t]?.at?.[prop] ?? {};
    const k =
      Object.keys(at).find(x => !x.includes(' ') && !/variant=|=/.test(x)) ??
      Object.keys(at).find(x => !x.includes(' '));
    return k == null ? null : String(at[k]);
  };
  const surfaces = last('', /^surfaces$/)?.value ?? null;
  /** @type {ThemeProblem[]} */
  const out = [];
  for (const t of FLOATING_PANELS) {
    if (!ctx.project.target.has(t) || !map[t]) continue;
    // Its edge as the theme draws it: a border or a shadow of its own, the
    // surfaces dial's, else Core's (and the base theme's) at rest.
    const borderSet = last(t, /^border(-style|-width)?$/);
    const border = borderSet
      ? !/(^|\s)(none|hidden)(\s|$)|^0(px)?(\s|$)/.test(String(borderSet.value))
      : surfaces
        ? ['outlined', 'glass', 'flat'].includes(String(surfaces))
        : (() => {
            const style =
              base.components?.[t]?.base?.borderStyle ??
              atRest(t, 'border-style');
            const width =
              base.components?.[t]?.base?.borderWidth ??
              atRest(t, 'border-width');
            return (
              Boolean(style) &&
              !/none|hidden/.test(String(style)) &&
              !/^0(px)?$/.test(String(width ?? '1px').trim())
            );
          })();
    if (border) continue;
    for (const m of modesOf(data)) {
      const mode = /** @type {'light' | 'dark'} */ (m);
      const shadowSet = last(t, /^box-shadow$/, mode);
      const shadowValue = shadowSet
        ? String(shadowSet.value)
        : surfaces && ['raised', 'glass'].includes(String(surfaces))
          ? 'shadow'
          : surfaces
            ? 'none'
            : String(
                base.components?.[t]?.base?.boxShadow ??
                  atRest(t, 'box-shadow') ??
                  'none',
              );
      const shadow =
        shadowValue === 'shadow' ||
        !/^\s*(none|0 0 transparent)?\s*$/.test(read(shadowValue, t, mode));
      if (shadow) continue;
      const fillSet = last(t, /^background(-color)?$/, mode);
      const fillValue = fillSet
        ? String(fillSet.value)
        : String(
            base.components?.[t]?.base?.backgroundColor ??
              atRest(t, 'background-color') ??
              '',
          );
      const fill = parseColor(read(fillValue, t, mode));
      const page = parseColor(String(res[mode]['--color-background-body']));
      if (!fill || !page || alphaOf(read(fillValue, t, mode)) < 1) continue;
      const r = ratio(fill, page);
      if (r >= FLOATING_SHOWS) continue;
      out.push({
        key: `floating|${t}|${mode}`,
        text: `the ${t} (${hex(fill)}) is ${r.toFixed(2)}:1 on the page (${hex(page)}) in ${mode}, with no border or shadow: a panel floating over the page has no edge to be seen by`,
        fix: `${P} set ${data.name} border '1px solid var(--color-border)' --on ${t}`,
      });
      break;
    }
  }
  return out;
}

/**
 * Below this contrast with the page, a floating panel with no border or
 * shadow reads as the page itself.
 */
const FLOATING_SHOWS = 1.1;

/**
 * A button color the theme sets that also paints the buttons Core draws
 * inside a toast (its close button, an icon in a ghost button): measured on
 * the toast's own fill in each type and mode, where an icon needs 3:1. No
 * setting reaches the toast's buttons apart from the rest, so the problem
 * says so; its line is the nearest button color that reads both there and
 * on the page and surface (4.5:1), or none when no one color does.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @returns {ThemeProblem[]}
 */
function leakedButtonProblems(ctx, data, res) {
  const modes = modesOf(data);
  /** A value as one color in a mode. @param {unknown} v @param {'light' | 'dark'} m */
  const inMode = (v, m) => {
    let x = String(v ?? '').trim();
    for (let i = 0; i < 4; i++) {
      const pair = /^light-dark\((.*)\)$/is.exec(x);
      if (pair) {
        const halves = splitTop(pair[1], ',');
        if (halves.length === 2) x = halves[m === 'light' ? 0 : 1].trim();
      }
      const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(x);
      if (!ref) break;
      x = String(res[m][ref[1]] ?? '');
    }
    return x;
  };
  /** @param {string} v @param {[number, number, number]} under */
  const solid = (v, under) => {
    const c = parseColor(v);
    return c ? compositeOver(c, alphaOf(v), under) : null;
  };
  /** @type {Map<string, ThemeProblem>} */
  const out = new Map();
  for (const m of Object.keys(ctx.C.MAP).filter(t => autoMediaPart(ctx, t))) {
    const held = /** @type {string[]} */ (
      /** @type {any} */ (ctx.C.MAP[m])?.holdsVariants?.button ?? []
    );
    if (!held.length) continue;
    const reads = ctx.C.partReads(m, 'background') ?? [];
    const types = /** @type {string[]} */ ([
      ...(ctx.C.MAP[m]?.attrs?.type ?? []),
    ]);
    // The toast's fill in each type and page mode, with the scheme its
    // media surface draws what it holds in there: a setting for one mode
    // reaches the toast's buttons only where the surface draws that mode
    // (or takes no side, 'off', where the page's mode applies).
    /** @type {Array<{type: string, mode: 'light' | 'dark', scheme: 'light' | 'dark', value: string, rgb: [number, number, number]}>} */
    const fills = [];
    for (const m0 of modes) {
      const mode = /** @type {'light' | 'dark'} */ (m0);
      const page = parseColor(String(res[mode]['--color-background-body']));
      if (!page) continue;
      for (const type of ['', ...types]) {
        const cond = type ? `type=${type}` : '';
        const fillSet = [...data.settings]
          .reverse()
          .find(
            y =>
              y.source === 'property' &&
              /^background(-color)?$/.test(y.thing) &&
              !y.state &&
              (!y.mode || y.mode === mode) &&
              (!y.when || y.when === `type:${type}`) &&
              y.on &&
              partsOf(ctx, y).includes(m),
          );
        const read =
          reads.find(r => cond && r.when.includes(cond)) ??
          reads.find(r => r.when.includes(''));
        const value = fillSet
          ? inMode(fillSet.value, mode)
          : read
            ? inMode(`var(${read.token})`, mode)
            : '';
        if (/gradient\(|url\(/.test(value)) continue;
        const rgb = solid(value, page);
        if (!rgb) continue;
        const side = autoMediaSide(value, res[mode], {
          mode,
          error: type === 'error',
        });
        fills.push({
          type,
          mode,
          scheme: side === 'off' ? mode : side,
          value,
          rgb,
        });
      }
    }
    for (const scheme of /** @type {Array<'light' | 'dark'>} */ ([
      'light',
      'dark',
    ])) {
      const here = fills.filter(f => f.scheme === scheme);
      if (!here.length) continue;
      const x = [...data.settings]
        .reverse()
        .find(
          y =>
            y.source === 'property' &&
            y.thing === 'color' &&
            !y.state &&
            (!y.mode || y.mode === scheme) &&
            y.on &&
            partsOf(ctx, y).includes('button') &&
            (!y.when || held.some(v => y.when === `variant:${v}`)),
        );
      if (!x) continue;
      const page = parseColor(
        String(res[scheme]['--color-background-body'] ?? ''),
      );
      if (!page) continue;
      const color = solid(inMode(x.value, scheme), page);
      if (!color) continue;
      const failing = here.filter(f => ratio(color, f.rgb) < 3);
      if (!failing.length) continue;
      // The nearest color that reads on every one of those fills (3:1) and,
      // where the theme draws that mode, as text on its page and surface
      // (4.5:1), toward black or white; none when no one color does.
      const surface = solid(
        String(res[scheme]['--color-background-surface'] ?? ''),
        page,
      );
      const grounds = /** @type {Array<[number, number, number]>} */ (
        modes.includes(scheme) ? [page, surface].filter(Boolean) : []
      );
      /** @type {string | null} */
      let best = null;
      let steps = Infinity;
      for (const end of /** @type {Array<[number, number, number]>} */ ([
        [0, 0, 0],
        [255, 255, 255],
      ]))
        for (let i = 0; i <= 100 && i < steps; i++) {
          const c = /** @type {[number, number, number]} */ (
            color.map((v, k) => Math.round(v + ((end[k] - v) * i) / 100))
          );
          if (
            here.every(f => ratio(c, f.rgb) >= 3) &&
            grounds.every(g => ratio(c, g) >= 4.5)
          ) {
            best = hex(c);
            steps = i;
            break;
          }
        }
      for (const f of failing) {
        const where = `${m}${f.type ? ` (type ${f.type})` : ''}`;
        const key = `leak|button|${m}|${f.type}|${f.mode}`;
        if (out.has(key)) continue;
        out.set(key, {
          key,
          text: `your button color (${describe(x)}) also paints the close button in ${where}: it is ${ratio(color, f.rgb).toFixed(2)}:1 on the ${m}'s fill (${f.value}) in ${f.mode}, and an icon needs 3:1; no setting keeps the ${m}'s buttons apart${best ? '' : `, and no one button color reads on every ${m} and on the page`}`,
          fix: best
            ? `${P} set ${data.name} color '${best}' --on ${x.on}${x.only ? ' --only' : ''}${x.when ? ` --when ${x.when}` : ''}${x.mode || modes.length > 1 ? ` --mode ${scheme}` : ''}`
            : null,
        });
      }
    }
  }
  return [...out.values()];
}

/**
 * The peak opacity Core's loading placeholder pulses to (Skeleton climbs
 * from 0.25 to 0.925), and the contrast under which a placeholder at that
 * peak cannot be told from what it sits on.
 */
const PLACEHOLDER_PEAK = 0.925;
const PLACEHOLDER_SHOWS = 1.2;

/**
 * Whether a check is a note rather than a problem: what could not be
 * measured, a failure the base theme draws itself (no line of the theme's
 * makes it, and the base's own fix is its maker's), or a look worth a word
 * that fails nothing (a check marked `note`).
 * @param {{text: string, note?: boolean}} x
 */
export function isCheckNote(x) {
  return (
    Boolean(x.note) ||
    x.text.startsWith('not checked') ||
    x.text.startsWith("the base theme's ")
  );
}

/**
 * How close two button fills may look before a person cannot tell them
 * apart at a glance: their OKLab distance.
 */
const LOOKS_ALIKE = 0.1;

/**
 * Loading placeholders (the parts that paint --color-skeleton) a person
 * cannot see: under {@link PLACEHOLDER_SHOWS}:1 against the page or a
 * card's surface at their pulse's peak, in a mode. A problem where the
 * theme's own colors make it so, with the nearest placeholder color that
 * shows on both; a note where the base theme draws it so itself.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @returns {ThemeProblem[]}
 */
function placeholderProblems(ctx, data, res, base) {
  const TOKEN = '--color-skeleton';
  const parts = Object.keys(ctx.C.MAP).filter(t =>
    (ctx.C.partReads(t, 'background') ?? []).some(r => r.token === TOKEN),
  );
  if (!parts.length) return [];
  const modes = modesOf(data);
  /** @type {ThemeProblem[]} */
  const out = [];
  for (const m0 of modes) {
    const m = /** @type {'light' | 'dark'} */ (m0);
    const v = String(res[m][TOKEN] ?? '');
    const c0 = parseColor(v);
    const page = parseColor(String(res[m]['--color-background-body'] ?? ''));
    const surface = parseColor(
      String(res[m]['--color-background-surface'] ?? ''),
    );
    if (!c0 || !page) continue;
    const grounds = /** @type {Array<[number, number, number]>} */ (
      [page, surface].filter(Boolean)
    );
    const a = alphaOf(v) * PLACEHOLDER_PEAK;
    /** @param {[number, number, number]} c */
    const worst = c =>
      Math.min(...grounds.map(g => ratio(compositeOver(c, a, g), g)));
    const r = worst(c0);
    if (r >= PLACEHOLDER_SHOWS) continue;
    const same = [
      TOKEN,
      '--color-background-body',
      '--color-background-surface',
    ].every(k => String(res[m][k]) === String(base[m]?.[k]));
    const what = `the loading placeholder (${parts.slice(0, 3).join(', ')}, ${TOKEN} ${v}) is ${r.toFixed(2)}:1 on the page${surface ? ' or a surface' : ''} in ${m} at its brightest`;
    if (same) {
      out.push({
        key: `placeholder|base|${m}`,
        text: `the base theme's ${what.slice(4)}, so it barely shows; the base theme draws it so`,
        fix: null,
      });
      continue;
    }
    // The nearest color, toward black or white (whichever stands out on
    // the page), that shows on the page and the surface at the peak.
    const end = /** @type {[number, number, number]} */ (
      parseColor(plainOn(page))
    );
    let fix = /** @type {string | null} */ (null);
    for (let i = 0; i <= 100 && !fix; i++) {
      const c = /** @type {[number, number, number]} */ (
        c0.map((x, k) => Math.round(x + ((end[k] - x) * i) / 100))
      );
      if (worst(c) >= PLACEHOLDER_SHOWS) fix = hex(c);
    }
    out.push({
      key: `placeholder|${m}`,
      text: `${what}; a placeholder needs ${PLACEHOLDER_SHOWS}:1 to show`,
      fix: fix
        ? `${P} set ${data.name} ${TOKEN} '${fix}'${modes.length > 1 ? ` --mode ${m}` : ''}`
        : null,
    });
  }
  return out;
}

/**
 * Text contrast for the primary button the button style draws (`buttons
 * soft`: the accent's muted fill with accent text; `outline`: no fill, so
 * its accent text sits on the page and on a card's surface), in each mode.
 * A later color or fill setting on the primary button wins over the
 * style's, in the order the settings come. Below 4.5:1 is a problem, fixed
 * with the nearest color that reads on every ground it sits on there.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @returns {ThemeProblem[]}
 */
function buttonStyleProblems(ctx, data, res) {
  let at = -1;
  data.settings.forEach((x, i) => {
    if (x.source === 'dial' && x.thing === 'buttons' && !x.on) at = i;
  });
  const style = at >= 0 ? data.settings[at] : null;
  if (!style || !['soft', 'outline'].includes(String(style.value))) return [];
  const modes = modesOf(data);
  const modeFlag = (/** @type {string} */ m) =>
    modes.length > 1 ? ` --mode ${m}` : '';
  /** A value as one color in a mode. @param {unknown} v @param {'light' | 'dark'} m */
  const inMode = (v, m) => {
    let x = String(v ?? '').trim();
    for (let i = 0; i < 4; i++) {
      const pair = /^light-dark\((.*)\)$/is.exec(x);
      if (pair) {
        const halves = splitTop(pair[1], ',');
        if (halves.length === 2) x = halves[m === 'light' ? 0 : 1].trim();
      }
      const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(x);
      if (!ref) break;
      x = String(res[m][ref[1]] ?? '');
    }
    return x;
  };
  const drawn =
    style.value === 'soft'
      ? {fill: 'var(--color-accent-muted)', color: 'var(--color-text-accent)'}
      : {fill: 'transparent', color: 'var(--color-text-accent)'};
  /** A later setting of a property on the primary button, in a mode. @param {RegExp} thing @param {string} m */
  const later = (thing, m) =>
    [...data.settings.slice(at + 1)]
      .reverse()
      .find(
        y =>
          y.source === 'property' &&
          thing.test(y.thing) &&
          !y.state &&
          (!y.mode || y.mode === m) &&
          y.on &&
          (!y.when || y.when === 'variant:primary') &&
          partsOf(ctx, y).includes('button'),
      ) ?? null;
  /** @type {ThemeProblem[]} */
  const out = [];
  for (const m0 of modes) {
    const m = /** @type {'light' | 'dark'} */ (m0);
    const page = parseColor(String(res[m]['--color-background-body']));
    if (!page) continue;
    const fillSet = later(/^background(-color)?$/, m);
    const colorSet = later(/^color$/, m);
    const fillValue = inMode(fillSet ? fillSet.value : drawn.fill, m);
    const textValue = inMode(colorSet ? colorSet.value : drawn.color, m);
    if (/gradient\(|url\(/.test(`${fillValue}${textValue}`)) continue;
    const surface = parseColor(
      String(res[m]['--color-background-surface'] ?? ''),
    );
    const under = /** @type {Array<[number, number, number]>} */ (
      [page, surface].filter(Boolean)
    );
    const f0 = parseColor(fillValue);
    const a = f0 ? alphaOf(fillValue) : 0;
    const grounds = under.map(u => (f0 && a > 0 ? compositeOver(f0, a, u) : u));
    const fg0 = parseColor(textValue);
    if (!fg0 || !grounds.length) continue;
    const worst = grounds
      .map(g => ({g, r: ratio(compositeOver(fg0, alphaOf(textValue), g), g)}))
      .sort((x, y) => x.r - y.r)[0];
    if (worst.r >= 4.5) continue;
    const fg = compositeOver(fg0, alphaOf(textValue), worst.g);
    out.push({
      key: `button-style|${style.value}|${m}`,
      text: `text in button (variant primary, buttons ${style.value}) is ${worst.r.toFixed(2)}:1 in ${m} (${textValue} on ${fillValue === 'transparent' ? 'the page and surface' : fillValue}); text needs 4.5:1`,
      fix: `${P} set ${data.name} color '${nearestReading(fg, grounds, 4.5)}' --on button --when variant:primary${modeFlag(m)}`,
    });
  }
  return out;
}

/**
 * Text contrast for a part in one state or condition the theme styles on
 * its own (a selected row's fill, an info banner's fill, a selected nav
 * item's text color), which the census drew at rest: the part's text
 * measured on its fill in that state or condition, in each mode. The fill
 * is a fill the theme sets for it there, else the token its part data reads
 * there (as the theme sets it on the part there, or resolves it), else its
 * resting fill, else the page; the text likewise, else the theme's primary
 * text. Below 4.5:1 is a problem, fixed with the nearest color that reads
 * there, set on what draws the text, in that state or condition. Settings
 * whose text or fill cannot be read as one color come back unmeasured.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @returns {{problems: ThemeProblem[], unmeasured: Setting[]}}
 */
function scopedTextProblems(ctx, data, res) {
  const modes = modesOf(data);
  const modeFlag = (/** @type {string} */ m) =>
    modes.length > 1 ? ` --mode ${m}` : '';
  /** A value as one color in a mode. @param {unknown} v @param {'light' | 'dark'} m */
  const inMode = (v, m) => {
    let x = String(v ?? '').trim();
    for (let i = 0; i < 4; i++) {
      const pair = /^light-dark\((.*)\)$/is.exec(x);
      if (pair) {
        const halves = splitTop(pair[1], ',');
        if (halves.length === 2) x = halves[m === 'light' ? 0 : 1].trim();
      }
      const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(x);
      if (!ref) break;
      x = String(res[m][ref[1]] ?? '');
    }
    return x;
  };
  const FILL = /^background(-color)?$/;
  /** @param {Setting} x */
  const scopedColor = x =>
    Boolean(
      x.on &&
      (x.state || (x.when && !/^variant:/.test(x.when))) &&
      (/^(color|background|background-color)$/.test(x.thing) ||
        /^--color-/.test(x.thing)),
    );
  /** @type {Map<string, ThemeProblem>} */
  const out = new Map();
  /** @type {Setting[]} */
  const unmeasured = [];
  /** @type {Set<string>} */
  const done = new Set();
  for (const x of data.settings.filter(scopedColor)) {
    const st = x.state ? String(x.state) : null;
    const when = st ? null : String(x.when);
    for (const t of partsOf(ctx, x)) {
      const scopeKey = `${t}|${st ?? ''}|${when ?? ''}`;
      if (done.has(scopeKey)) continue;
      done.add(scopeKey);
      /** A part-data condition is this scope. @param {string} w */
      const inScope = w => {
        const terms = w.split(' ')[0].split(',');
        return st
          ? new RegExp(`(^|[\\s,])${st}=`).test(w)
          : terms.includes(String(when).replace(':', '='));
      };
      /** A setting is on this part in this scope (or at rest), in a mode. @param {Setting} y @param {string} m @param {boolean} scoped */
      const here = (y, m, scoped) =>
        Boolean(y.on) &&
        (!y.mode || y.mode === m) &&
        (scoped
          ? (y.state ?? null) === st && (st ? true : y.when === when)
          : !y.state && !y.when) &&
        partsOf(ctx, y).includes(t);
      /** The latest setting matching, scoped first, then at rest. @param {(y: Setting) => boolean} test @param {string} m */
      const latest = (test, m) =>
        [...data.settings].reverse().find(y => test(y) && here(y, m, true)) ??
        [...data.settings].reverse().find(y => test(y) && here(y, m, false)) ??
        null;
      /** The value of a token on this part in this scope, in a mode. @param {string} tok @param {'light' | 'dark'} m */
      const tokenValue = (tok, m) => {
        const set = latest(y => y.source === 'token' && y.thing === tok, m);
        return set ? inMode(set.value, m) : inMode(`var(${tok})`, m);
      };
      /** The part-data read for a group in this scope, else at rest. @param {string} group */
      const readOf = group => {
        const reads = ctx.C.partReads(t, group) ?? [];
        return (
          reads.find(r => r.when.some(inScope)) ??
          reads.find(r => r.when.includes('')) ??
          null
        );
      };
      for (const m0 of modes) {
        const m = /** @type {'light' | 'dark'} */ (m0);
        const page = parseColor(String(res[m]['--color-background-body']));
        if (!page) continue;
        const fillSet = latest(
          y => y.source === 'property' && FILL.test(y.thing),
          m,
        );
        const fillRead = readOf('background');
        const groundValue = fillSet
          ? inMode(fillSet.value, m)
          : fillRead
            ? tokenValue(fillRead.token, m)
            : String(res[m]['--color-background-body']);
        const colorSet = latest(
          y => y.source === 'property' && y.thing === 'color',
          m,
        );
        const textRead = readOf('text');
        const textToken = textRead?.token ?? '--color-text-primary';
        const textValue = colorSet
          ? inMode(colorSet.value, m)
          : tokenValue(textToken, m);
        if (/gradient\(|url\(/.test(`${groundValue}${textValue}`)) {
          unmeasured.push(x);
          continue;
        }
        const g0 = parseColor(groundValue);
        const fg0 = parseColor(textValue);
        if (!g0 || !fg0) {
          unmeasured.push(x);
          continue;
        }
        const ground = compositeOver(g0, alphaOf(groundValue), page);
        const fg = compositeOver(fg0, alphaOf(textValue), ground);
        const r = ratio(fg, ground);
        if (r >= 4.5) continue;
        const scope = st ? `--state ${st}` : `--when ${when}`;
        const label = st ? st : String(when).replace(':', ' ');
        const fix = nearestReading(fg, [ground], 4.5);
        // What draws the text: a color set there, else the token the text
        // reads, set on the part in that state or condition.
        const thing = colorSet || !textRead ? 'color' : textToken;
        const key = `scoped-text|${t}|${st ?? ''}|${when ?? ''}|${m}`;
        out.set(key, {
          key,
          text: `text in ${t} (${label}) is ${r.toFixed(2)}:1 in ${m} (${textValue} on ${t}'s ${fillSet ? groundValue : fillRead ? fillRead.token : 'page'} there); text needs 4.5:1`,
          fix: `${P} set ${data.name} ${thing} '${fix}' --on ${t} ${scope}${modeFlag(m)}`,
        });
      }
    }
  }
  return {problems: [...out.values()], unmeasured};
}

/**
 * Settings file text as data, or null when there is none or it is damaged.
 * @param {string | null} text
 * @returns {ThemeData | null}
 */
function parseSettings(text) {
  const data = settingsJson(text);
  return entriesReadable(data) ? data : null;
}

/**
 * A settings file's or an undo step's text as JSON, a byte-order mark
 * aside; undefined when there is no text or it does not parse. Every reader
 * of settings text reads it here.
 * @param {string | null | undefined} text
 * @returns {any}
 */
export function settingsJson(text) {
  if (text == null) return undefined;
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return undefined;
  }
}

/**
 * Whether settings data has its shape and every entry is an object with a
 * thing name: what a reader may go through entry by entry. Any other entry
 * (null, a number, text) is damage the file check names.
 * @param {any} data
 */
export function entriesReadable(data) {
  return (
    settingsShapeOk(data) &&
    data.settings.every(
      (/** @type {any} */ s) =>
        s != null &&
        typeof s === 'object' &&
        !Array.isArray(s) &&
        typeof s.thing === 'string',
    )
  );
}

/**
 * What a refusal of a damaged saved mode or base says: the value it reads
 * as when there is one (installed, or to install first), else that no
 * reader reads it. One text for show, compile and every change.
 * @param {string} slug
 * @param {any} data
 * @param {'mode' | 'base'} field
 * @param {ReturnType<typeof savedFieldRepairs>} fix
 */
export function savedFieldText(slug, data, field, fix) {
  const file = `themes/${slug}/${slug}.settings.json`;
  const saved = field === 'mode' ? data.mode : data.like;
  return fix.uninstalled
    ? `${file}: base "${saved}" reads as ${fix.uninstalled}, which this project has not installed. Install it, then set the base again. Nothing was changed.`
    : fix.readsAs
      ? `${file}: ${field} "${saved}" reads as ${fix.readsAs}. Set it again, so the file says so. Nothing was changed.`
      : `${file}: ${field} "${saved}" is no value the editor reads, and a change never drops it. Set it again. Nothing was changed.`;
}

/**
 * The lines that set a damaged saved mode or base again: the one repair
 * every command gives that damage (show, compile and each change). The
 * value it reads as when there is one, else each value it can be (each
 * mode; the base the theme was built on, when its module or history still
 * says it, else each installed base), never a default that would drop what
 * the file held. A built-in base not installed comes after its install.
 * @param {any} data
 * @param {string} cwd
 * @param {string} slug
 * @param {'mode' | 'base'} field
 * @returns {{values: string[], uninstalled: string | null, readsAs: string | null, run: Array<{name: string, reason: string}>}}
 *   `readsAs`: the one value the saved text reads as (a base in other
 *   letters or with a typo), which every reader takes
 */
export function savedFieldRepairs(data, cwd, slug, field) {
  const MODES = ['both', 'light-only', 'dark-only'];
  const meant = fieldsMeant(data);
  const values =
    field === 'mode'
      ? MODES.includes(meant.mode)
        ? [meant.mode]
        : MODES
      : LIKE.includes(meant.like)
        ? [meant.like]
        : (b => (b ? [b] : LIKE.filter(x => baseInstalled(cwd, x))))(
            builtOnBase(cwd, slug),
          );
  return {
    values,
    // A base read as one built-in base this project has not installed:
    // the refusal says so, and its install comes first.
    uninstalled:
      field === 'base' &&
      values.length === 1 &&
      LIKE.includes(values[0]) &&
      !baseInstalled(cwd, values[0])
        ? values[0]
        : null,
    readsAs:
      field === 'mode'
        ? MODES.includes(meant.mode)
          ? meant.mode
          : null
        : LIKE.includes(meant.like)
          ? meant.like
          : null,
    run: values.length
      ? values.flatMap(v =>
          field === 'base' && LIKE.includes(v)
            ? onBuiltInSteps(cwd, v, `${P} set ${slug} base ${v}`)
            : [
                {
                  name: `${P} set ${slug} ${field} ${v}`,
                  reason: 'do this instead',
                },
              ],
        )
      : [{name: `${P} how ${field}`, reason: 'do this instead'}],
  };
}

/**
 * Read a damaged mode or base the way a change reads it, in place: one
 * written in other letters, as a package name, as a mode word or with a
 * typo (`Dark-Only`, `@astryxdesign/theme-neutral`, `light`, `neutrl`) is
 * the value meant, as `set` reads it. Any other is refused for a change
 * (slug given), with the line that sets it; read for an undo step, it goes
 * back to its default. `like: "none"` is no base. The field a command sets
 * itself is left to that command.
 * @param {any} data
 * @param {string} cwd
 * @param {string} [fixing] `mode` or `base` when the command sets it
 * @param {string} [slug] the theme a change is made to
 * @returns {string[]} a note for each field read differently from the file
 */
export function readFields(data, cwd, fixing, slug) {
  /** @type {string[]} */
  const notes = [];
  const meant = fieldsMeant(data);
  // A field written as no value the reader can read: for a change (slug
  // given), refused with the line that sets it, never dropped on the way.
  // The lines offered set it again: the value it reads as when there is
  // one, else each value it can be (each installed base, each mode), never
  // a default that would drop what the file held.
  // A refusal about what the file holds, not what was typed: its lines
  // set the field again, and are not read against the typed value.
  const damaged = (/** @type {'mode' | 'base'} */ field) => {
    const fix = savedFieldRepairs(
      data,
      cwd,
      /** @type {string} */ (slug),
      field,
    );
    throw Object.assign(
      new AstryxError(
        savedFieldText(/** @type {string} */ (slug), data, field, fix),
        fix.run,
        ERROR_CODES.ERR_THEME_INVALID,
      ),
      {aboutSaved: true},
    );
  };
  if (
    fixing !== 'mode' &&
    !['both', 'light-only', 'dark-only'].includes(data.mode)
  ) {
    if (['both', 'light-only', 'dark-only'].includes(meant.mode)) {
      notes.push(
        `mode was written "${data.mode}", so it is saved as ${meant.mode}`,
      );
      data.mode = meant.mode;
    } else if (slug && data.mode != null && String(data.mode).trim()) {
      damaged('mode');
    } else {
      data.mode = 'both';
      notes.push('mode was missing or damaged, so it is both again');
    }
  }
  if (savedNoBase(data)) delete data.like;
  if (fixing !== 'base' && data.like != null && !LIKE.includes(data.like)) {
    if (LIKE.includes(meant.like) && baseInstalled(cwd, meant.like)) {
      notes.push(
        `base was written "${data.like}", so it is saved as ${meant.like}`,
      );
      data.like = meant.like;
    } else if (slug) {
      damaged('base');
    } else {
      delete data.like;
      notes.push('base was not a built-in theme, so it is none again');
    }
  }
  return notes;
}

/**
 * The text an undo step keeps for the settings before a change: the file
 * as the change read it (entry words and fields read as meant), so the
 * step back restores what the change started from and passes undo's check.
 * Text that reads as written is kept byte for byte.
 * @param {string} text
 * @param {string} cwd
 * @param {Record<string, string> | null} radii the whole-theme radii it was built with
 */
function stepText(text, cwd, radii) {
  const data = settingsJson(text);
  if (!entriesReadable(data)) return text;
  const asWritten = JSON.stringify(data);
  readAsMeant(data, cwd);
  return JSON.stringify(data) !== asWritten
    ? `${JSON.stringify(radii ? {...data, built: {radii}} : data, null, 2)}\n`
    : withBuilt(text, radii);
}

/** The file's own top-level fields. */
const TOP_FIELDS = ['name', 'mode', 'like', 'settings', 'lifted', 'palette'];
/** The top-level field a word the editor uses for it names (`base` is the like field: `set t base`). */
const TOP_FIELD_WORDS = /** @type {Record<string, string>} */ ({base: 'like'});

/**
 * What an entry as saved sets: its thing and scope, in any letters, so two
 * lists can be told apart without reading either.
 * @param {any} entry
 */
function savedEntryScope(entry) {
  if (!entry || typeof entry !== 'object') return JSON.stringify(entry);
  /** @type {Record<string, string>} */
  const at = {};
  for (const [k, v] of Object.entries(entry))
    at[k.trim().toLowerCase()] = String(v).trim().toLowerCase();
  return JSON.stringify(
    ['thing', 'on', 'when', 'state', 'mode', 'only'].map(k => at[k] ?? ''),
  );
}

/**
 * The file's top-level field names in other letters (`Like`, `Settings`,
 * `Mode`) are those fields, as an entry's are (entryFieldNames), in place.
 * A field written both ways keeps the editor's own, and a note says so; the
 * settings written both ways are one list, the editor's entry winning for a
 * thing and scope both hold, so no saved setting is lost without a word.
 * @param {any} data
 * @returns {string[]} a note for each name read
 */
function topFieldNames(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  /** @type {string[]} */
  const notes = [];
  for (const k of Object.keys(data)) {
    const lower = k.trim().toLowerCase();
    const field = TOP_FIELDS.find(f => f === lower) ?? TOP_FIELD_WORDS[lower];
    if (!field || field === k) continue;
    if (field in data) {
      if (
        field === 'settings' &&
        Array.isArray(data.settings) &&
        Array.isArray(data[k])
      ) {
        const held = new Set(data.settings.map(savedEntryScope));
        const more = data[k].filter(
          (/** @type {any} */ e) => !held.has(savedEntryScope(e)),
        );
        data.settings.push(...more);
        notes.push(
          `the settings file writes both "settings" and "${k}"; read as one list${more.length < data[k].length ? ', "settings" winning where both set one thing' : ''}`,
        );
      } else
        notes.push(
          `the settings file writes both "${field}" and "${k}"; "${field}" is read`,
        );
      delete data[k];
      continue;
    }
    data[field] = data[k];
    delete data[k];
    notes.push(
      TOP_FIELD_WORDS[lower]
        ? `the settings file writes the ${lower} as "${k}", read as ${field}`
        : `the settings file writes "${k}" in other letters, read as ${field}`,
    );
  }
  // A field the editor does not read (`theme`, `modes`) is not used, and
  // said, with the field it is a typo of.
  for (const k of Object.keys(data)) {
    if (TOP_FIELDS.includes(k)) continue;
    const near = TOP_FIELDS.filter(f => typoNear(k.trim().toLowerCase(), f));
    notes.push(
      `the settings file has "${k}", a field the editor does not read${near.length === 1 ? ` (it reads "${near[0]}")` : ''}, so it is not used`,
    );
  }
  return notes;
}

/**
 * Read settings data as a change reads it, in place: entry modes and
 * sources in other words, and a damaged mode or base (see
 * {@link readFields}). The settings file and every undo step are read
 * through here.
 * @param {any} data
 * @param {string} cwd
 * @param {string} [fixing] `mode` or `base` when the command sets it
 * @returns {string[]} a note for each thing read differently from the text
 */
export function readAsMeant(data, cwd, fixing) {
  readEntryWords(data);
  return [...entryNotes(data), ...readFields(data, cwd, fixing)];
}

/**
 * Whether `new` makes a theme again over these settings, keeping the file
 * aside: text that does not parse, or entries it cannot read (no thing, no
 * value, no source). The one rule both `new` and the refusals that offer
 * it read; any other damage is repaired by the lines its refusal names.
 * @param {unknown} data the parsed file (undefined when it does not parse)
 */
export function settingsRemade(data) {
  if (data === undefined) return true;
  // Entries saved in a form set reads are read, as the settings reader
  // reads them.
  // Its top-level fields and entries in other letters (`Settings`,
  // `Thing`) are read as every other command reads them.
  const copy = structuredClone(data);
  topFieldNames(copy);
  readTypedEntries(copy, []);
  return !settingsEntriesOk(copy);
}

/**
 * Whether every settings entry has the parts the editor reads (a thing, a
 * value and a source); one without is damage `new` keeps aside.
 * @param {any} data
 */
export function settingsEntriesOk(data) {
  return (
    entriesReadable(data) &&
    data.settings.every(
      (/** @type {any} */ s) =>
        'value' in s && ['dial', 'token', 'property'].includes(s.source),
    )
  );
}

/**
 * Whether settings data has the shape the editor reads: an object with a
 * settings list.
 * @param {any} data
 */
export function settingsShapeOk(data) {
  return (
    !!data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray(data.settings)
  );
}

/**
 * The settings as the file keeps them: a setting's `note` is what the
 * command that made it says in its result, not part of the setting.
 * @param {ThemeData} data
 * @returns {ThemeData}
 */
function savedForm(data) {
  return {
    ...data,
    settings: data.settings.map(s => {
      const entry = {...s};
      delete entry.note;
      return entry;
    }),
  };
}

/**
 * Every regular file under `dir` and the hash of its bytes; empty when
 * there is no folder.
 * @param {string} dir
 * @returns {Map<string, string>}
 */
function hashDir(dir) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const p of ownFiles(dir))
    out.set(p, createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
  return out;
}

/**
 * The value the base theme itself gives a part's property where a setting
 * applies (its variant and state), as the build keys part styles; null
 * when the base theme leaves it to Core.
 * @param {{light: Record<string, string>, components?: Record<string, any>}} base
 * @param {Ctx} ctx
 * @param {string} target
 * @param {string} prop camelCase
 * @param {{when?: string, state?: string}} s
 * @returns {string | null}
 */
export function baseComponent(base, ctx, target, prop, s) {
  const t = base.components?.[target];
  if (!t) return null;
  let b = t[s.when ?? 'base'];
  if (s.state) {
    const states = ctx.project.target.get(target)?.states ?? [];
    const slot = stateSlot(
      states,
      s.state,
      s.when,
      wrapsOneControl(ctx, target),
      ctx.project.target.get(target)?.stateValues,
    );
    b = slot.pseudo
      ? (t[slot.key]?.[slot.pseudo] ??
        t[slot.key]?.[stateSlot(states, s.state, s.when).pseudo ?? ''] ??
        t[slot.key]?.[`:${s.state}`])
      : t[slot.key];
  }
  const v = b?.[prop];
  return typeof v === 'string' ? v : null;
}

/**
 * The focus state a part's own styles key on: a part whose styled element
 * is a wrapper (a text input's box) shows focus only through
 * `focus-within`; null when it keys on none.
 * @param {Ctx} ctx
 * @param {string} part
 * @returns {string | null}
 */
export function focusStateOf(ctx, part) {
  const conds = JSON.stringify(ctx.C.MAP[part]?.own ?? {});
  for (const st of ['focus-within', 'focus-visible', 'focus'])
    if (conds.includes(`:${st}`)) return st;
  return null;
}

/**
 * The radius token a part's corners follow when Core draws its corners one
 * by one from that token by position (a button squares the joins inside a
 * button group; a button group's outer corners are its end buttons'), or
 * null. A radius for such a part is written as that
 * token on the part, so every position keeps its own corner; a radius
 * written on the part would override Core's per-corner rules.
 * @param {Ctx} ctx
 * @param {string} part
 * @returns {string | null}
 */
export function positionalCornerToken(ctx, part) {
  const own = ctx.C.MAP[part]?.own ?? {};
  for (const prop of [
    'border-start-start-radius',
    'border-start-end-radius',
    'border-end-start-radius',
    'border-end-end-radius',
  ]) {
    const e = own[prop];
    const token = Object.keys(e?.tokens ?? {}).find(t => /^--radius-/.test(t));
    if (token && (e.values ?? []).some((/** @type {string} */ v) => v === '0'))
      return token;
  }
  // A part with no corners of its own whose outer corners are the corners
  // Core draws by place on the parts inside it (a button group's first and
  // last buttons): the one token those read, set on the part.
  const inner = ctx.C.MAP[part]?.innerCorners ?? [];
  if (
    inner.length === 1 &&
    !Object.keys(own).some(k => /^border-.*radius$/.test(k))
  )
    return inner[0];
  return null;
}

/** The radius tokens the corners dial moves. */
export const DIAL_RADII = [
  '--radius-element',
  '--radius-inner',
  '--radius-container',
  '--radius-page',
];

/**
 * The parts that draw a part's corners: the part itself, or, when Core gives
 * it no radius of its own, the parts inside it that it has (a date-time
 * input's date and time boxes).
 * @param {Ctx} ctx
 * @param {string} part
 * @returns {string[]}
 */
export function cornerParts(ctx, part) {
  const rec = ctx.C.MAP[part];
  if (!rec || rec.own?.['border-radius']) return [part];
  const inner = (rec.contains ?? []).filter(
    (/** @type {string} */ t) =>
      ctx.C.MAP[t]?.own?.['border-radius'] &&
      t.startsWith(`${part}-`) &&
      ctx.project.target.has(t),
  );
  return inner.length ? inner : [part];
}

/** The table boxes CSS draws no padding on: rows, row groups and columns. */
const UNPADDED_BOXES = new Set([
  'tr',
  'thead',
  'tbody',
  'tfoot',
  'col',
  'colgroup',
]);

/**
 * The parts that take a part's padding: the part itself, or, when Core
 * renders it as a box CSS draws no padding on (a table row) and gives it no
 * other display, the parts inside it with padding of their own (its cells).
 * @param {Ctx} ctx
 * @param {string} part
 * @returns {string[]}
 */
export function paddedParts(ctx, part) {
  const rec = ctx.C.MAP[part];
  const tags = rec?.tags ?? [];
  if (
    !rec ||
    !tags.length ||
    !tags.every(t => UNPADDED_BOXES.has(t)) ||
    rec.own?.display
  )
    return [part];
  const inner = (rec.contains ?? []).filter(
    (/** @type {string} */ t) =>
      ctx.project.target.has(t) &&
      Object.keys(ctx.C.MAP[t]?.own ?? {}).some(k => /^padding/.test(k)),
  );
  return inner.length ? inner : [part];
}

/**
 * Whether a part is drawn as a radio's mark, as the part data records it:
 * a part with a checked state and a square box of a fixed size.
 * @param {any} C the part census
 * @param {string} part
 * @returns {boolean}
 */
export function radioMark(C, part) {
  const at = C.MAP[part]?.at ?? {};
  /** A fixed px size at rest. @param {string} k */
  const fixed = k =>
    Object.entries(at[k] ?? {}).find(
      ([sel, v]) => !/:/.test(sel) && /^\s*\d*\.?\d+px\s*$/.test(String(v)),
    )?.[1];
  const w = fixed('width');
  return (
    (C.MAP[part]?.attrs?.checked ?? []).length > 0 &&
    w != null &&
    String(w).trim() === String(fixed('height') ?? '').trim()
  );
}

/**
 * Whether a part is a radio's circle: a radio's mark (radioMark) whose
 * corners are 50% that no token reaches, in it and in every part inside it
 * (its dot). The circle marks a radio; it is no corner, so the corners
 * dial leaves it.
 * @param {any} C the part census
 * @param {string} part
 * @returns {boolean}
 */
export function radioCircle(C, part) {
  /** The radius values a part draws, in any rule. @param {string} t */
  const radii = t =>
    Object.entries(C.MAP[t]?.at ?? {})
      .filter(([prop]) => /radius$/.test(prop))
      .flatMap(([, rules]) => Object.values(rules ?? {}).map(String));
  /** A part and every part inside it. @param {string} t @returns {string[]} */
  const within = (t, seen = new Set()) => {
    if (seen.has(t)) return [];
    seen.add(t);
    return [
      t,
      ...(C.MAP[t]?.contains ?? []).flatMap((/** @type {string} */ k) =>
        within(k, seen),
      ),
    ];
  };
  const own = radii(part);
  return (
    radioMark(C, part) &&
    own.length > 0 &&
    own.every(v => v.trim() === '50%') &&
    within(part).every(k => radii(k).every(v => !/var\(/.test(v)))
  );
}

/**
 * The radius token a part's resting corners read. A part the census saw
 * closed (a menu, a popover) has none recorded: a container or menu reads
 * the container radius, like every Core surface; any other part reads the
 * element radius.
 * @param {Ctx} ctx
 * @param {string} part
 * @param {string} [when]
 * @returns {string}
 */
export function radiusTokenOf(ctx, part, when) {
  return (
    /var\((--radius-[\w-]+)\)/.exec(
      partDefault(ctx, part, 'borderRadius', when) ?? '',
    )?.[1] ??
    ctx.C.partReads(part, 'corners').find(
      (/** @type {any} */ x) =>
        x.props.includes('border-radius') && /^--radius-/.test(x.token),
    )?.token ??
    (['containers', 'menus'].includes(familyOf(part) ?? '')
      ? '--radius-container'
      : '--radius-element')
  );
}

/** The file a `new` keeps beside the files it writes until it is done. */
export const NEW_MARKER = '.astryx-new.json';

/**
 * Remove a `new` marker from a theme folder whose settings are whole: the
 * `new` that left it made the theme, and nothing is left to finish.
 * @param {string} dir
 */
export function clearNewMarker(dir) {
  // Fenced like every write under the theme lock.
  refuseIfLockLost();
  try {
    fs.rmSync(path.join(dir, NEW_MARKER), {force: true});
  } catch {
    // Read-only: the next writing command tries again.
  }
}

/**
 * The pseudo key a state writes in a part's styles. Core marks a disabled
 * button, link or tab with aria-disabled (it stays focusable). A form
 * control styled on a wrapper (a typeahead, a complex selector) has its
 * input or button inside marked, so it also matches a disabled form
 * control inside it (never a list row); an action part that holds
 * children (a button group, a segmented control) never does, so one
 * disabled child never makes the whole part look disabled.
 * @param {string} state
 * @param {boolean} [wrapsControl]
 * @returns {string}
 */
export function stateKey(state, wrapsControl = false) {
  const aria = ARIA_STATES[/** @type {keyof typeof ARIA_STATES} */ (state)];
  if (aria) return `:is(${aria.selector})`;
  if (state !== 'disabled') return `:${state}`;
  return wrapsControl
    ? ':is(:disabled,[aria-disabled="true"],:has(:is(input,button,select,textarea):is(:disabled,[aria-disabled="true"])))'
    : ':is(:disabled,[aria-disabled="true"])';
}

/**
 * The states Core paints from an ARIA attribute rather than a data
 * attribute of its own (a pagination's current page, a pressed or open
 * button): set names each as a state, and the build writes it as the
 * attribute.
 */
/**
 * The states a pointer or the keyboard puts a part in for a moment (hover,
 * focus, a press), as against the conditions a part holds (checked,
 * selected, disabled, invalid, open). Two moment states said together
 * ("hovered and pressed buttons") are each one; a list with a condition in
 * it ("the checked and disabled checkboxes") is the part in all of them at
 * once.
 */
export const MOMENT_STATES = [
  'hover',
  'focus',
  'focus-visible',
  'focus-within',
  'active',
  'pressed',
];

export const ARIA_STATES = {
  current: {
    attr: 'aria-current',
    selector: '[aria-current]:not([aria-current="false"])',
  },
  pressed: {attr: 'aria-pressed', selector: '[aria-pressed="true"]'},
  expanded: {attr: 'aria-expanded', selector: '[aria-expanded="true"]'},
};

/**
 * The ARIA states a part is painted in (any condition the part data holds
 * for it names the attribute).
 * @param {{MAP: Record<string, any>}} C
 * @param {string} part
 * @returns {string[]}
 */
export function ariaStates(C, part) {
  /** @type {Set<string>} */
  const found = new Set();
  for (const byCond of Object.values(C.MAP[part]?.at ?? {}))
    for (const cond of Object.keys(/** @type {object} */ (byCond)))
      for (const [name, {attr}] of Object.entries(ARIA_STATES))
        if (cond.includes(`${attr}=`)) found.add(name);
  return [...found];
}

/**
 * The states `set` takes on a part, before any is tested: its doc's, the
 * ones every part takes, and the ARIA states the part data paints it in
 * (less one its doc names as its own: a toggle button's isPressed is its
 * pressed state).
 * @param {Ctx} ctx
 * @param {string} part
 * @returns {string[]}
 */
export function partStates(ctx, part) {
  const t = ctx.project.target.get(part);
  if (!t) return [...COMMON_STATES];
  const own = new Set(
    t.states.map(st => st.replace(/^is(?=[A-Z])/, '').toLowerCase()),
  );
  return [
    ...new Set([
      ...t.states,
      ...COMMON_STATES,
      ...ariaStates(ctx.C, part).filter(a => !own.has(a)),
    ]),
  ];
}

/**
 * A state as typed, each of its `+` pieces read as the part's own name for
 * it (any case or dashes).
 * @param {Ctx} ctx
 * @param {string} part
 * @param {string} state
 * @returns {string}
 */
export function partState(ctx, part, state) {
  const states = partStates(ctx, part);
  const flat = (/** @type {string} */ x) =>
    x.replace(/[-_\s]/g, '').toLowerCase();
  // (A state's prop name, `isPressed`, or its ARIA attribute,
  // `aria-pressed`, names the state too.)
  const bare = (/** @type {string} */ x) =>
    flat(x.replace(/^is(?=[A-Z])|^is-(?=[a-z])/, '').replace(/^aria-/i, ''));
  /**
   * Each way a state is written, its letters only: as the part names it,
   * and as its prop or ARIA name (`ispressed`, `ariapressed`), so a name
   * typed in one case (ISPRESSED) is read too. The bare word of a state
   * the part names with its prop (toggle-button's isPressed) is no name of
   * it: `pressed` there is offered the part's own name.
   * @param {string} x
   */
  const forms = x => [flat(x), `is${bare(x)}`, `aria${bare(x)}`];
  // (Several at once in one order, the part's own, so either spelling is
  // one setting.)
  const pieces = state
    .split('+')
    .map(
      p =>
        states.find(x => flat(x) === flat(p)) ??
        states.find(x => flat(x) === bare(p)) ??
        states.find(x => forms(x).includes(flat(p))) ??
        p,
    );
  const at = (/** @type {string} */ p) =>
    states.includes(p) ? states.indexOf(p) : states.length;
  return [...new Set(pieces)].sort((a, b) => at(a) - at(b)).join('+');
}

/**
 * A saved entry's state on a part as `set` reads a typed one: each of its
 * pieces in the part's own spelling (toggle-button's `is-pressed` or
 * `ispressed` is its isPressed), or null when it reads as no state of the
 * part or as itself. The census half of the one state reader (the loader
 * reads what needs no census: case, a colon, a CSS state's words): the
 * saved-setting check and the build read the state through it, and leave
 * the entry as saved, so a build stamped from the settings matches the
 * file; a change saves the read state (readSavedStates).
 * @param {Ctx} ctx
 * @param {any} s
 * @returns {string | null}
 */
export function savedStateRead(ctx, s) {
  if (
    !s ||
    typeof s.on !== 'string' ||
    typeof s.state !== 'string' ||
    !ctx.project.target.has(s.on)
  )
    return null;
  const read = partState(ctx, s.on, s.state);
  const states = partStates(ctx, s.on);
  return read.split('+').every(p => states.includes(p)) ? read : null;
}

/**
 * Read each saved entry's state on a part in place, as savedStateRead
 * reads it, with a note: what a change does before it saves the settings,
 * so the file then holds the part's own spelling.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 */
export function readSavedStates(ctx, data) {
  for (const s of data.settings ?? []) {
    const read = savedStateRead(ctx, s);
    const was = SAVED_STATE.get(s) ?? s?.state;
    // (A state the loader put in its words, `selected + hover`, is noted
    // here too, with its spelling as saved.)
    if (!read || (read === s.state && was === s.state)) continue;
    if (!LOADED_STATE.has(s)) LOADED_STATE.set(s, String(s.state));
    ENTRY_NOTES.get(data)?.push(
      `${s.thing} on ${s.on} was saved with state ${JSON.stringify(was)}, read as ${read}`,
    );
    s.state = read;
  }
}

/**
 * The state an entry had as the theme was loaded, before readSavedStates
 * read it as the part's own; the stamp of a build is the settings as loaded,
 * so a build that only reads them (show) matches the file it read, and a
 * change that writes them forgets it (commitTheme), as the file then holds
 * the part's spelling.
 * @type {WeakMap<object, string>}
 */
const LOADED_STATE = new WeakMap();

/**
 * The settings as they were loaded: each state readSavedStates read put
 * back as the loader read it.
 * @param {ThemeData} data
 * @returns {ThemeData}
 */
function loadedForm(data) {
  return {
    ...data,
    settings: data.settings.map(s =>
      LOADED_STATE.has(s) ? {...s, state: LOADED_STATE.get(s)} : s,
    ),
  };
}

/**
 * Where a setting's state goes in the built theme: the style key (its
 * variant and every state Core writes as a key of its own, `checked+disabled`)
 * and the pseudo-class key under it for the rest, joined (`:hover`, an ARIA
 * state's attribute), or null for none.
 * @param {string[]} own the states Core writes as keys on the part
 * @param {string | undefined} state
 * @param {string | undefined} when
 * @param {boolean} [wrapsControl]
 * @param {Record<string, string>} [values] the value Core writes for each
 *   own state: a state that names a boolean prop is written `state:true`
 * @returns {{key: string, pseudo: string | null}}
 */
export function stateSlot(own, state, when, wrapsControl = false, values = {}) {
  const pieces = state ? String(state).split('+') : [];
  const keyed = pieces
    .filter(p => own.includes(p))
    .map(p => (values[p] && values[p] !== p ? `${p}:${values[p]}` : p));
  const pseudo = pieces
    .filter(p => !own.includes(p))
    .map(p => stateKey(p, wrapsControl))
    .join('');
  return {
    key: [...(when == null ? [] : [when]), ...keyed].join('+') || 'base',
    pseudo: pseudo || null,
  };
}

/**
 * The text color tokens Core's elements inside a part read for their own
 * color (a top nav heading's title span reads --color-text-primary itself),
 * so a color set on the part never reaches that text. Only the main and
 * supporting text colors count: the disabled, placeholder and accent ones
 * mark a state or a role, not the part's text. With `deep`, the parts inside
 * it count too (a top nav's heading and items).
 * @param {{MAP: Record<string, any>}} C
 * @param {string} part
 * @param {boolean} [deep]
 * @returns {string[]}
 */
export function innerTextTokens(C, part, deep = false) {
  const TEXT_ROLES = ['--color-text-primary', '--color-text-secondary'];
  /** @type {Set<string>} */
  const out = new Set();
  /** @param {Record<string, string[]> | undefined} reads */
  const add = reads => {
    for (const [tok, props] of Object.entries(reads ?? {}))
      if (TEXT_ROLES.includes(tok) && props.includes('color')) out.add(tok);
  };
  const rec = C.MAP[part];
  add(rec?.inside);
  if (deep)
    for (const inner of rec?.contains ?? []) {
      const r = C.MAP[inner];
      add(r?.inside);
      // A part's own color counts where it reads the token always, or for
      // a look of its own (a heading or a text's color role, `color=primary`
      // beside its level), never only in a state.
      for (const [tok, conds] of Object.entries(r?.own?.color?.tokens ?? {}))
        if (
          TEXT_ROLES.includes(tok) &&
          /** @type {string[]} */ (conds).some(
            w =>
              !w.trim() ||
              w.trim() === 'always' ||
              (!/\s/.test(w.trim()) &&
                !/(?:^|,)(?:disabled|selected|checked|readonly|aria-[\w-]+|status)=/.test(
                  w,
                )),
          )
        )
          out.add(tok);
    }
  return [...out].sort();
}

/**
 * The component docs of a part: its own component's, and the one named like
 * the part (tab is Tab, under TabList), each with its name, for the ones the
 * project has.
 * @param {Ctx} ctx
 * @param {string} part
 * @returns {Array<{name: string, doc: any}>}
 */
export function partComponentDocs(ctx, part) {
  const comps = /** @type {Record<string, any>} */ (
    ctx.project.components ?? {}
  );
  const pascal = part.replace(/(^|-)([a-z0-9])/g, (_, __, c) =>
    c.toUpperCase(),
  );
  return [ctx.project.target.get(part)?.component, pascal]
    .filter(n => n != null && comps[n])
    .map(n => ({
      name: /** @type {string} */ (n),
      doc: comps[/** @type {string} */ (n)],
    }));
}

/**
 * Whether a part's styled element wraps one control: its component (or the
 * one named like the part) is a form control (Core's own category) that
 * takes a disabled prop. An action part that holds children (a button
 * group) never does.
 * @param {Ctx} ctx
 * @param {string} target
 */
export function wrapsOneControl(ctx, target) {
  // One control: a form control with a disabled prop whose content is not
  // other elements (a radio list's items, an input group's or a field's
  // children each hold controls of their own).
  return partComponentDocs(ctx, target).some(
    ({doc: d}) =>
      /form/i.test(String(d.category ?? '')) &&
      Object.keys(d.props ?? {}).some(p => /disabled/i.test(p)) &&
      d.props?.children?.type !== 'ReactNode',
  );
}

/**
 * The whole-theme radius tokens a generated settings module writes, or null
 * when it writes none.
 * @param {string} source
 * @returns {Record<string, string> | null}
 */
export function radiiIn(source) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of source.matchAll(
    /^ {4}"(--radius-(?:element|inner|container|page))": "([^"]+)"/gm,
  ))
    out[m[1]] = m[2];
  return Object.keys(out).length ? out : null;
}

/**
 * A history step: the settings as they were, with the radii their build
 * showed (so a step back restores them exactly, also for a theme an earlier
 * editor built). A step an older CLI wrote has none, and is read as before.
 * @param {string} text
 * @param {Record<string, string> | null} radii
 */
function withBuilt(text, radii) {
  if (!radii) return text;
  const data = settingsJson(text);
  if (!settingsShapeOk(data)) return text;
  return `${JSON.stringify({...data, built: {radii}}, null, 2)}\n`;
}

/**
 * The radius, in px, the build writes for a radius token at a corners value
 * (a rung, or a size). The derived radii keep the base theme's own
 * proportions to the element radius (matcha's page is 3.5 times it), so a
 * bigger element radius never makes them smaller; a checkbox stays a
 * rounded square at pill, and a container or page at pill is half again as
 * round as at `round` (a fully round card is a capsule). Past 1000px a
 * radius is fully round.
 * @param {{light: Record<string, string>}} base the base theme's tokens
 * @param {string} value
 * @param {string} token
 * @returns {number}
 */
export function radiusAt(base, value, token) {
  const px = cornerPx(value) >= 1000 ? 9999 : cornerPx(value);
  const pill = px >= 9999;
  const el = lengthPx(base.light['--radius-element'] ?? '');
  /** @param {string} t @param {number} fallback */
  const ratio = (t, fallback) => {
    const v = lengthPx(base.light[t] ?? '');
    return el && v != null ? v / el : fallback;
  };
  const roundPx = CORNERS.find(([n]) => n === 'round')?.[1] ?? 16;
  // Inner corners (a checkbox) stay a rounded square: never rounder than
  // at round, so pill keeps round's and no step makes them smaller.
  if (token === '--radius-inner') {
    const inner = (/** @type {number} */ x) =>
      Math.round(x * Math.min(1, ratio(token, 0.6)));
    return Math.min(inner(roundPx), inner(pill ? roundPx : px));
  }
  // A container or page is never rounder than at pill, so pill never makes
  // one less round, and a size just under 1000px meets pill smoothly.
  if (token === '--radius-container') {
    const atPill = Math.max(24, 1.5 * roundPx * ratio(token, 1.25));
    return Math.round(
      pill ? atPill : Math.min(atPill, px * ratio(token, 1.25)),
    );
  }
  if (token === '--radius-page') {
    const atPill = Math.max(32, 1.5 * roundPx * ratio(token, 2.5));
    return Math.round(pill ? atPill : Math.min(atPill, px * ratio(token, 2.5)));
  }
  return pill ? 9999 : px;
}

/**
 * Whether a file is a module the editor generated (its first line is the
 * editor's header).
 * @param {string} file
 */
/**
 * Whether the editor made a theme's folder, though its settings may be
 * gone: a stopped `new` left its marker, or the folder holds what only the
 * editor writes (the generated settings module, an undo history, the theme
 * source with the header the editor wrote it with).
 * @param {string} cwd
 * @param {string} slug
 */
export function editorMadeFolder(cwd, slug) {
  const f = themeFiles(cwd, slug);
  const firstLine = (/** @type {string} */ file) => {
    try {
      return fs.readFileSync(file, 'utf8').split('\n', 1)[0];
    } catch {
      return '';
    }
  };
  return (
    fs.existsSync(path.join(f.dir, NEW_MARKER)) ||
    madeByEditor(f.settingsTs) ||
    // Only editor commands write the undo history.
    readHistory(f.history).steps.length > 0 ||
    firstLine(f.ts) ===
      `// The ${slug} theme. \`${P}\` wrote this file once and never changes it again.`
  );
}

/**
 * Whether a file carries the editor's generated header.
 * @param {string} file
 */
export function madeByEditor(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .startsWith(`// ${EDITOR_GENERATED_MARK}`);
  } catch {
    return false;
  }
}

/**
 * The files the editor writes for a theme, after `<slug>.`: the only ones a
 * change reads, hashes or puts back, and the only ones a stopped `new`
 * leaves (a designer's `<slug>.design.psd` beside them is never touched).
 */
export const EDITOR_SUFFIXES = [
  'settings.ts',
  'settings.json',
  'css',
  'css.d.ts',
  'js',
  'd.ts',
  'variants.d.ts',
  'history.json',
  'pictures.json',
];

/**
 * The pages and pictures the editor writes in a theme folder, by exact
 * name: the preview and the sheet, each section's sheet, and a picture of
 * each in each mode. A file of the user's named like one (`sheet-old.png`,
 * `preview-v.html`) is not one of them.
 */
export const EDITOR_PAGES = new Set([
  'preview.html',
  'sheet.html',
  ...SHOWCASE_GROUPS.map(g => `sheet-${g}.html`),
  ...['preview', 'sheet', ...SHOWCASE_GROUPS.map(g => `sheet-${g}`)].flatMap(
    b => [`${b}.png`, `${b}-dark.png`],
  ),
]);

/**
 * Whether a name in a theme folder is a page or picture the editor writes:
 * one of {@link EDITOR_PAGES}, or a picture its record says it wrote.
 * @param {string} n
 * @param {Record<string, unknown>} [recorded] the theme's pictures record
 */
export const isEditorPage = (n, recorded = {}) =>
  EDITOR_PAGES.has(n) || Object.hasOwn(recorded, n);

/**
 * Whether a name in a theme folder is a file the editor writes: the
 * theme's generated files, settings, history, picture record, pages and
 * pictures, and its color config.
 * @param {string} slug
 * @param {string} n
 * @param {Record<string, unknown>} [recorded] the theme's pictures record
 */
export const isEditorFile = (slug, n, recorded = {}) =>
  EDITOR_SUFFIXES.some(x => n === `${slug}.${x}`) ||
  isEditorPage(n, recorded) ||
  /^palette\.config(\.damaged(-\d+)?)?\.json$/.test(n);

/**
 * The files in a theme folder that the editor writes, by name: the
 * theme's generated files, its settings, history and pages, and its color
 * files. Anything else there (notes, a designer's source file, the
 * person's own tokens) is never read, hashed or put back.
 * `<slug>.theme.ts` is the person's file: it is listed only while it does
 * not exist yet, so the run that creates it can take it back.
 * @param {string} dir
 * @returns {string[]}
 */
function ownFiles(dir) {
  if (!fs.lstatSync(dir, {throwIfNoEntry: false})?.isDirectory()) return [];
  const slug = path.basename(dir);
  const recorded = readRecordIn(dir, slug);
  const mine = (/** @type {string} */ n) => isEditorFile(slug, n, recorded);
  /** @type {string[]} */
  const out = [];
  for (const e of fs.readdirSync(dir, {withFileTypes: true}))
    if (e.isFile() && mine(e.name)) out.push(path.join(dir, e.name));
  const tokens = path.join(dir, 'tokens');
  if (fs.lstatSync(tokens, {throwIfNoEntry: false})?.isDirectory())
    for (const e of fs.readdirSync(tokens, {withFileTypes: true}))
      if (e.isFile() && e.name.startsWith(`${slug}.palette`))
        out.push(path.join(tokens, e.name));
  return out;
}

/**
 * Run `fn`, and record in `wrote` every file under `dir` it created,
 * replaced or removed, with the hash of what it left (null: removed). Only
 * these files are ever put back if the change fails.
 * @template T
 * @param {string} dir
 * @param {Map<string, string | null>} wrote
 * @param {() => T} fn
 * @returns {Promise<Awaited<T>>}
 */
async function track(dir, wrote, fn) {
  const before = hashDir(dir);
  const theme = path.join(dir, `${path.basename(dir)}.theme.ts`);
  const themeWasThere = fs.existsSync(theme);
  try {
    return await fn();
  } finally {
    const after = hashDir(dir);
    // The theme source this run made is its own to take back.
    if (!themeWasThere && fs.existsSync(theme))
      after.set(
        theme,
        createHash('sha256').update(fs.readFileSync(theme)).digest('hex'),
      );
    for (const [p, h] of after) if (before.get(p) !== h) wrote.set(p, h);
    for (const p of before.keys()) if (!after.has(p)) wrote.set(p, null);
  }
}

/**
 * Put back what this command wrote in this run, and only that: a file it
 * created goes, and a file it replaced or removed gets the bytes it had.
 * A file someone else changed since this command wrote it is left as it is
 * and named. Writes are whole (a new file renamed into place), and one
 * failure does not stop the rest. A file put back gets its times back too,
 * and so does each folder of the snapshot, so a watcher sees no change.
 * @param {DirSnapshot} was the files and folders before
 * @param {Map<string, string | null>} wrote
 * @returns {{failed: string[], skipped: string[]}}
 */
function restoreWritten(was, wrote) {
  /** @type {string[]} */
  const failed = [];
  /** @type {string[]} */
  const skipped = [];
  for (const [p, h] of wrote) {
    try {
      const st = fs.lstatSync(p, {throwIfNoEntry: false});
      if (st?.isSymbolicLink()) {
        skipped.push(path.basename(p));
        continue;
      }
      const cur = st?.isFile()
        ? createHash('sha256').update(fs.readFileSync(p)).digest('hex')
        : null;
      if (cur !== h) {
        skipped.push(path.basename(p));
        continue;
      }
      const old = was.files.get(p);
      if (old) {
        // A folder the change removed (tokens/ once its palette went) comes
        // back with the file.
        fs.mkdirSync(path.dirname(p), {recursive: true});
        writeWhole(p, old.bytes);
        fs.utimesSync(p, old.atime / 1000, old.mtime / 1000);
      } else fs.rmSync(p, {force: true});
    } catch {
      failed.push(path.basename(p));
    }
  }
  // A file written again with the bytes it had (an output the build
  // writes on its own) gets its time back too, and so does each folder: a
  // file made and removed again, or renamed into place, changes its time.
  if (wrote.size) {
    for (const [p, old] of was.files)
      try {
        if (wrote.has(p)) continue;
        const st = fs.lstatSync(p, {throwIfNoEntry: false});
        if (
          st?.isFile() &&
          st.mtimeMs !== old.mtime &&
          fs.readFileSync(p).equals(old.bytes)
        )
          fs.utimesSync(p, old.atime / 1000, old.mtime / 1000);
      } catch {
        failed.push(path.basename(p));
      }
    for (const [dir, t] of was.folders)
      try {
        fs.utimesSync(dir, t.atime / 1000, t.mtime / 1000);
      } catch {
        // A folder the change removed and nothing brought back.
      }
  }
  return {failed, skipped};
}

/**
 * @typedef {object} DirSnapshot
 * @property {Map<string, {bytes: Buffer, atime: number, mtime: number}>} files
 *   each regular file, with its bytes and times (ms)
 * @property {Map<string, {atime: number, mtime: number}>} folders the folder
 *   and each folder those files are in, with its times (ms)
 */

/**
 * The bytes and times of every regular file under `dir`, and the times of
 * its folders, for putting back what a failed change wrote.
 * @param {string} dir
 * @returns {DirSnapshot}
 */
function snapshotDir(dir) {
  /** @type {DirSnapshot} */
  const out = {files: new Map(), folders: new Map()};
  /** @param {string} p */
  const times = p => {
    const st = fs.statSync(p);
    return {atime: st.atimeMs, mtime: st.mtimeMs};
  };
  for (const p of ownFiles(dir)) {
    out.files.set(p, {bytes: fs.readFileSync(p), ...times(p)});
    out.folders.set(path.dirname(p), times(path.dirname(p)));
  }
  if (fs.existsSync(dir)) out.folders.set(dir, times(dir));
  return out;
}

/**
 * Refuse a link anywhere the editor reads or writes a theme: `themes/`, the
 * theme folder, and every file and folder in it. The editor writes the
 * theme's own files only, never through a link to somewhere else.
 * @param {string} cwd
 * @param {string} slug
 */
export function refuseLinks(cwd, slug) {
  const f = themeFiles(cwd, slug);
  /** @param {string} p */
  const link = p => {
    // A path under a file (themes written as a file) is not a link: its
    // own refusal names it.
    /** @type {fs.Stats | undefined} */
    let st;
    try {
      st = fs.lstatSync(p, {throwIfNoEntry: false});
    } catch {
      return;
    }
    if (!st?.isSymbolicLink()) return;
    const rel = path.relative(cwd, p) || p;
    /** @type {string} */
    let target;
    try {
      target = fs.readlinkSync(p);
    } catch {
      target = '';
    }
    // Named, with where it points; nothing is removed or moved for the
    // user.
    const gone = !fs.existsSync(p);
    throw new AstryxError(
      `${rel} is a link to ${target || 'another file'}${gone ? ', which does not exist' : ''}; the editor reads and writes a theme's own files only, never through a link. ${gone ? `Put ${target || 'that file'} back, then put` : 'Put'} a copy of it in place of the link. Nothing was changed.`,
      [
        {
          name: `ls -l ${quoteCommandArgument(path.relative(cwd, p))}`,
          reason: 'shows where the link points',
        },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  };
  link(f.root);
  link(f.dir);
  // Only the files the editor reads or writes: a link to a file of the
  // user's (notes, a mockup) is theirs, and is left alone. A link at a
  // picture's name (to a file or to nothing) is never written through or
  // replaced: that one picture is skipped and named (`pictures`), so it
  // refuses nothing here.
  const recorded = readWrittenRecord(cwd, slug);
  // A link at a page's name (preview.html, the sheets) or at the record of
  // pictures is left alone the same way: that page or picture is not made,
  // and the result names it.
  const own = (/** @type {string} */ n) =>
    (isEditorFile(slug, n, recorded) &&
      !n.endsWith('.png') &&
      !isEditorPage(n, recorded) &&
      n !== `${slug}.pictures.json`) ||
    n === `${slug}.theme.ts` ||
    n === 'tokens';
  /** @type {string[]} */
  let names;
  try {
    names = fs.readdirSync(f.dir);
  } catch {
    return;
  }
  for (const n of names.filter(own)) {
    const p = path.join(f.dir, n);
    link(p);
    if (n === 'tokens') {
      /** @type {string[]} */
      let inner;
      try {
        inner = fs.readdirSync(p);
      } catch {
        inner = [];
      }
      for (const m of inner) link(path.join(p, m));
    }
  }
}

/**
 * What a build was made from: the settings and the CLI that built them, so
 * a build that no longer matches its settings file is found and made again.
 * @param {ThemeData} data
 */
export function settingsStamp(data) {
  // The settings as the file keeps them, so the stamp of a build matches
  // the file it was built from.
  const saved = savedForm(loadedForm(data));
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        like: saved.like ?? null,
        mode: saved.mode,
        settings: saved.settings,
      }),
    )
    .digest('hex')
    .slice(0, 16);
  return `${hash} (CLI ${cliVersion()})`;
}

/**
 * Why the theme's build does not match its settings, in words, or null when
 * it does: a file missing, another CLI version, settings changed since the
 * build (a hand edit), or a build left half done (a command stopped).
 * @param {string} cwd
 * @param {string} slug
 * @param {ThemeData} data
 * @returns {string | null}
 */
export function staleBuild(cwd, slug, data) {
  const f = themeFiles(cwd, slug);
  const files = builtFiles(cwd, slug, data);
  // An output that cannot be read (its permissions, or a folder in its
  // place) is refused by name: the build cannot replace it either. That
  // includes the files a build writes only for some themes.
  refuseUnreadable(cwd, [...files, ...builtFiles(cwd, slug, data, true)]);
  const missing = files.find(p => !fs.existsSync(p));
  if (missing) return `${path.relative(f.dir, missing)} was missing`;
  const ts = fs.readFileSync(f.settingsTs, 'utf8');
  const stamp =
    /\/\/ Built from settings ([0-9a-f]{16}) \(CLI ([^)]+)\)\./.exec(ts);
  const [hash] = settingsStamp(data).split(' ');
  if (stamp && stamp[1] === hash && stamp[2] !== cliVersion())
    return `it was built by CLI ${stamp[2]}, and this is ${cliVersion()}`;
  if (!stamp || stamp[1] !== hash)
    return `${slug}.settings.json does not match the build (a command stopped part way, a hand edit, or another tool)`;
  // A base theme updated since the build changes what the theme builds on.
  if (data.like) {
    const built = new RegExp(
      `// Built on @astryxdesign/theme-${data.like} ([^.\\s]+(?:\\.[^.\\s]+)*)\\.`,
    ).exec(ts)?.[1];
    const now = baseVersionOf(cwd, data.like);
    if (built && now && built !== now)
      return `@astryxdesign/theme-${data.like} is ${now} now, and the build was made on ${built}`;
  }
  // The generated module seals its own text: a hand edit inside it (the
  // file says not to) is built over from the settings, and said. Checked
  // after the stamps, whose reasons say more.
  if (moduleUnedited(ts) === false)
    return `${slug}.settings.ts was edited by hand, though it is generated from ${slug}.settings.json and says not to edit it`;
  // An own change to <slug>.theme.ts since the build (the file says it
  // wins over the settings) is built in.
  const source = /\/\/ Built with \S+\.theme\.ts ([0-9a-f]{16})\./.exec(ts);
  if (source && fs.existsSync(f.ts) && source[1] !== themeSourceHash(cwd, slug))
    return sourceChangedReason(slug);
  // By content, never by file times (an editor's re-save or a checkout
  // changes those): a generated module cut short, or built outputs whose
  // header names another CLI than the settings were written by (a build
  // stopped after the settings module was written).
  const builtBy = (/** @type {string} */ file) =>
    /^ \* CLI: @astryxdesign\/cli@(\S+)$/m.exec(
      fs.readFileSync(file, 'utf8').slice(0, 600),
    )?.[1] ?? null;
  if (
    !ts.trimEnd().endsWith('});') ||
    [f.css, f.js].some(file => {
      const by = builtBy(file);
      return by != null && by !== stamp[2];
    })
  )
    return 'the last build did not finish (a command stopped while building)';
  // Outputs another theme's build wrote over (`compile other.theme.ts --out
  // themes/g/g.css`): their header names another source.
  const builtFrom = (/** @type {string} */ file) =>
    /^ \* Source: (.+)$/m
      .exec(fs.readFileSync(file, 'utf8').slice(0, 600))?.[1]
      ?.trim() ?? null;
  for (const file of [f.css, f.js]) {
    const from = builtFrom(file);
    if (from != null && path.basename(from) !== path.basename(f.ts))
      return `${path.basename(file)} was built from ${from}, not ${slug}.theme.ts`;
  }
  // A built stylesheet cut short (a crash, a bad merge) is built again, as
  // an unreadable built module is.
  try {
    postcss.parse(fs.readFileSync(f.css, 'utf8'));
  } catch {
    return `${slug}.css is not valid CSS (cut short or damaged)`;
  }
  return null;
}

/**
 * Every file the editor's build of a theme writes, the one list staleness
 * reads: the generated settings module, the built stylesheet, module and
 * their types, and, with a color dial set, the generated color files.
 * @param {string} cwd
 * @param {string} slug
 * @param {ThemeData} data
 * @param {boolean} [some] the files a build writes only for some themes
 *   (the variants types, for a theme with component variants) instead
 * @returns {string[]}
 */
export function builtFiles(cwd, slug, data, some = false) {
  const f = themeFiles(cwd, slug);
  if (some) return [path.join(f.dir, `${slug}.variants.d.ts`)];
  const pal = paletteFiles(slug);
  const colors = data.settings.some(
    s => s.source === 'dial' && PALETTE_DIALS.includes(s.thing),
  )
    ? [pal.config, pal.palette, pal.refs, pal.receipt].map(p =>
        path.join(cwd, p),
      )
    : [];
  return [
    f.settingsTs,
    // The theme's own source: the editor writes it once, and every build
    // reads it, so one deleted by hand is written again.
    f.ts,
    f.css,
    f.js,
    path.join(f.dir, `${slug}.d.ts`),
    path.join(f.dir, `${slug}.css.d.ts`),
    ...colors,
  ];
}

/**
 * The file's stat, or undefined when it is not there. On Node 22.13 a folder
 * above the file that is a file throws ENOTDIR even with throwIfNoEntry
 * false; that file is not there either, as on later Node.
 * @param {string} file
 */
function statIfThere(file) {
  try {
    return fs.statSync(file, {throwIfNoEntry: false});
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'ENOTDIR') return undefined;
    throw e;
  }
}

/**
 * Refuse, by name, a built file that is there but cannot be read: its
 * permissions, or a folder where the file goes.
 * @param {string} cwd
 * @param {string[]} files
 */
function refuseUnreadable(cwd, files) {
  for (const file of files) {
    const st = statIfThere(file);
    if (!st) continue;
    const kind = irregularFileKind(file);
    if (kind && kind !== 'a folder') refuseIrregular(cwd, file, kind);
    const rel = shown(cwd, file);
    if (st.isDirectory())
      throw new AstryxError(
        `${rel} is a folder where the build writes a file, so the theme cannot be built. Move or rename the folder, then run the command again. Nothing was changed.`,
        [
          {
            name: `ls -la ${quoteCommandArgument(rel)}`,
            reason: 'see what is there',
          },
        ],
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    try {
      fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
    } catch (e) {
      const code = /** @type {any} */ (e)?.code ?? 'EACCES';
      throw new AstryxError(
        `${rel} cannot be read or replaced (${code}: its permissions), so the theme cannot be built. Give yourself read and write permission on it (chmod u+rw ${rel}), then run the command again. Nothing was changed.`,
        [
          {
            name: `ls -la ${quoteCommandArgument(rel)}`,
            reason: 'see its permissions',
          },
        ],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    }
  }
}

/**
 * Refuse a named pipe, a device or a socket where a file of the theme goes:
 * a read of one can wait for good, so no command opens it.
 * @param {string} cwd
 * @param {string} file
 * @param {string} kind what is there
 * @returns {never}
 */
function refuseIrregular(cwd, file, kind) {
  const rel = shown(cwd, file);
  throw new AstryxError(
    `${rel} is ${kind}, not a file, where the theme keeps a file, so no command reads or replaces it: remove it, then run the command again. Nothing was changed.`,
    [
      {
        name: `ls -la ${quoteCommandArgument(rel)}`,
        reason: 'see what is there',
      },
    ],
    ERROR_CODES.ERR_FILE_EXISTS,
  );
}

/**
 * The installed version of a base theme package, or null.
 * @param {string} cwd
 * @param {string} like
 */
function baseVersionOf(cwd, like) {
  const pkg = `@astryxdesign/theme-${like}`;
  try {
    // The package exports no package.json: find it above its built module.
    let dir = path.dirname(
      createRequire(path.join(cwd, 'package.json')).resolve(`${pkg}/built`),
    );
    for (let i = 0; i < 6; i++, dir = path.dirname(dir)) {
      const file = path.join(dir, 'package.json');
      if (!fs.existsSync(file)) continue;
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (json.name === pkg) return String(json.version ?? '') || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** The undo steps a theme keeps; older ones are dropped. */
export const HISTORY_STEPS = 80;

/**
 * A theme's undo history: the settings text before each change, oldest
 * first, and how many damaged steps were dropped. Every step after the
 * last damaged one is kept.
 * @param {string} file
 * @returns {{steps: string[], dropped: number}}
 */
export function readHistory(file) {
  if (!fs.existsSync(file)) return {steps: [], dropped: 0};
  // A history that cannot be read is not damaged: it is refused by name.
  const why = unreadableReason(file);
  if (why)
    throw new AstryxError(
      `${path.basename(file)} ${why}, so the undo history cannot be read. Give it back its place or its read permission; nothing was changed.`,
      [
        {
          name: `ls -la ${quoteCommandArgument(file)}`,
          reason: 'see what is there',
        },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  /** @type {unknown} */
  let h;
  try {
    h = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {steps: [], dropped: 1};
  }
  if (!Array.isArray(h)) return {steps: [], dropped: 1};
  const ok = (/** @type {unknown} */ x) => {
    try {
      return typeof x === 'string' && settingsShapeOk(settingsJson(x));
    } catch {
      return false;
    }
  };
  let last = -1;
  h.forEach((x, i) => {
    if (!ok(x)) last = i;
  });
  return {
    steps: /** @type {string[]} */ (h.slice(last + 1)),
    dropped: last + 1,
  };
}

/**
 * The custom properties a built stylesheet sets on its parts, by rule: the
 * selector and the property, with the value. The theme's own scope
 * (`:scope`, `:root`) is left out: resolvedTokens reads it.
 * @param {string | null} css
 * @returns {Map<string, string>}
 */
function partTokenValues(css) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!css) return out;
  try {
    postcss.parse(css).walkRules(rule => {
      if (/^(?::scope|:root|html\b)/.test(rule.selector.trim())) return;
      rule.each(node => {
        if (node.type === 'decl' && node.prop.startsWith('--'))
          out.set(`${rule.selector}\u0000${node.prop}`, node.value);
      });
    });
  } catch {
    // A stylesheet that does not parse lists no part token changes.
  }
  return out;
}

/**
 * Each part token whose built value changed between two stylesheets, as a
 * changedTokens line: the property, the rule it is set on, and each mode
 * whose half moved (the theme's own mode first).
 * @param {string | null} before
 * @param {string | null} after
 * @param {Array<'light' | 'dark'>} modes the modes the theme has
 * @returns {string[]}
 */
function partTokenChanges(before, after, modes) {
  if (!before || !after) return [];
  const was = partTokenValues(before);
  const now = partTokenValues(after);
  /** @param {string | undefined} v */
  const halves = v => {
    const m = /^light-dark\(([\s\S]*)\)$/i.exec(String(v ?? '').trim());
    const parts = m ? splitTop(m[1], ',').map(x => x.trim()) : null;
    return parts && parts.length === 2
      ? {light: parts[0], dark: parts[1]}
      : {light: v, dark: v};
  };
  /** @type {Array<'light' | 'dark'>} */
  const order = modes.includes('light') ? ['light', 'dark'] : ['dark', 'light'];
  /** @type {string[]} */
  const out = [];
  for (const key of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(key);
    const b = now.get(key);
    if (String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase())
      continue;
    const [selector, prop] = key.split('\u0000');
    const where = selector.replace(/\.astryx-/g, '').replace(/\s+/g, ' ');
    const [ha, hb] = [halves(a), halves(b)];
    const sides = order.filter(
      m =>
        String(ha[m] ?? '').toLowerCase() !== String(hb[m] ?? '').toLowerCase(),
    );
    const one =
      sides.length === 2 && ha.light === ha.dark && hb.light === hb.dark;
    for (const m of one ? [order[0]] : sides)
      out.push(
        `${prop} on ${where}${one ? '' : ` (${m})`}: ${ha[m] ?? 'unset'} -> ${hb[m] ?? 'unset'}`,
      );
  }
  return out;
}

/**
 * Write the settings, build, and on a failed build put back what was there.
 * Returns what changed in the resolved tokens and the lifted keys that are
 * new since the last build.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {ThemeData} data
 * @param {{history: boolean, historyAfter?: string[], radii?: Record<string, string> | null}} options
 *   `historyAfter`: the history to write with the change (a step back pops it);
 *   `radii`: the whole-theme radii the step being restored was built with
 */
export async function commitTheme(
  ctx,
  slug,
  data,
  {history, historyAfter, radii},
) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  refuseLinks(cwd, slug);
  await refuseThemeSource(cwd, slug);
  // The settings are written as they are now read (a saved state in the
  // part's own spelling): the build is stamped with what is written.
  for (const s of data.settings) LOADED_STATE.delete(s);
  const snapBefore = fs.existsSync(f.settings)
    ? fs.readFileSync(f.settings, 'utf8')
    : null;
  /** @type {string[]} */
  const notes = [];
  // The history is read and checked before anything is written.
  const read = history ? readHistory(f.history) : {steps: [], dropped: 0};
  const past = read.steps;
  if (read.dropped && !past.length)
    notes.push(
      `${path.basename(f.history)} was damaged, so a new undo history starts with this change (earlier steps cannot be undone)`,
    );
  else if (read.dropped)
    notes.push(
      `${read.dropped} damaged step${read.dropped > 1 ? 's' : ''} in ${path.basename(f.history)} ${read.dropped > 1 ? 'were' : 'was'} dropped; the ${past.length} after ${read.dropped > 1 ? 'them' : 'it'} can still be undone`,
    );
  // A change that leaves the settings as they were builds nothing and adds
  // no undo step.
  const same = (/** @type {ThemeData | null} */ a) =>
    a != null &&
    JSON.stringify({...savedForm(a), lifted: undefined}) ===
      JSON.stringify({...savedForm(data), lifted: undefined});
  // A no-op change still mends a build that does not match the settings
  // (an undo stopped part way): it is built again, with no new step.
  const noop = history && same(parseSettings(snapBefore));
  const stale =
    noop && fs.existsSync(f.js) ? staleBuild(cwd, slug, data) : null;
  // The no-op that mends one says what it built again.
  if (noop && stale)
    notes.push(
      `the build was not current (${stale}), so it was built again from the settings`,
    );
  if (noop && fs.existsSync(f.js) && !stale)
    return {
      changed: [],
      changedParts: [],
      res: {light: {}, dark: {}},
      problems: [],
      problemList: [],
      newProblems: [],
      warnings: [],
      lifted: [],
      notes,
      unchanged: true,
    };
  // A change over a build that does not match the saved settings (a hand
  // edit, a command stopped part way) is measured against a build of the
  // saved settings, never the stale one, and said, as show and a no-op
  // change say it.
  /** @type {ThemeData | null} */
  let saved = null;
  if (!noop && snapBefore && fs.existsSync(f.js))
    try {
      saved = loadTheme(cwd, slug);
    } catch {
      saved = null;
    }
  const staleBefore = saved ? staleBuild(cwd, slug, saved) : null;
  if (staleBefore)
    notes.push(
      `the build was not current (${staleBefore}), so the change is measured against the saved settings, built again`,
    );
  // With no last build (deleted, never committed), nothing is compared.
  if (snapBefore && !fs.existsSync(f.js))
    notes.push(
      `there was no last build (${path.basename(f.js)} is missing), so the token changes are not listed; the theme is built again`,
    );
  /** The built stylesheet the change is measured against. */
  const cssNow = () => {
    try {
      return fs.readFileSync(f.css, 'utf8');
    } catch {
      return null;
    }
  };
  let cssBefore = snapBefore && !staleBefore ? cssNow() : null;
  let resBefore =
    snapBefore && fs.existsSync(f.js) && !staleBefore
      ? await resolvedTokens(ctx, slug).catch(() => {
          // The last build is damaged: the change still stands, and the
          // result says why it lists no token changes.
          notes.push(
            `the last build (${path.basename(f.js)}) could not be read, so the token changes are not listed; the theme is built again`,
          );
          return null;
        })
      : null;
  // The settings before the change as the change read them (a base or a
  // part in other letters, a typo the reader takes), so the check measures
  // what was there, not the raw file.
  const before = parseSettings(snapBefore);
  if (before) readAsMeant(before, cwd);
  const liftedBefore = new Set(
    Array.isArray(before?.lifted) ? before.lifted : [],
  );
  // A change that leaves every color setting as it was keeps the shades the
  // theme already shows: a theme an earlier editor built keeps its colors
  // until a color, the mode or the base changes, and undo brings them back.
  /** @param {ThemeData | null} d */
  const colorKey = d =>
    d &&
    JSON.stringify({
      mode: d.mode ?? 'both',
      like: d.like ?? null,
      colors: d.settings.filter(
        x =>
          (x.source === 'dial' &&
            (PALETTE_DIALS.includes(x.thing) || x.thing === 'vibrancy')) ||
          (x.source === 'token' && isColorToken(x.thing)),
      ),
    });
  // A module edited by hand (it says "do not edit") keeps nothing: it is
  // built over from the settings, as its header says.
  const moduleNow =
    !staleBefore && fs.existsSync(f.settingsTs)
      ? fs.readFileSync(f.settingsTs, 'utf8')
      : null;
  ctx.keepStops =
    before &&
    colorKey(before) === colorKey(data) &&
    moduleNow &&
    moduleUnedited(moduleNow) !== false
      ? stopsIn(moduleNow)
      : null;
  // The same for the whole-theme radii: kept while corners and the base
  // stay as they are; a step back restores the radii it was built with.
  /** @param {ThemeData | null} d */
  const cornersKey = d =>
    d &&
    JSON.stringify({
      like: d.like ?? null,
      corners: d.settings.filter(x => x.thing === 'corners' && !x.on),
      // An exact radius token feeds the built radii too.
      tokens: d.settings.filter(
        x => x.source === 'token' && /^--radius-/.test(x.thing),
      ),
    });
  // A stale build keeps neither: the change is built from the settings.
  const radiiNow =
    moduleNow && moduleUnedited(moduleNow) !== false
      ? radiiIn(moduleNow)
      : null;
  ctx.keepRadii =
    radii ??
    (before && cornersKey(before) === cornersKey(data) ? radiiNow : null);
  // What this run writes is recorded as it writes it, so a failed change
  // puts back exactly that and nothing else.
  const rootMade = !fs.existsSync(f.root);
  const dirMade = !fs.existsSync(f.dir);
  const was = snapshotDir(f.dir);
  /** @type {Map<string, string | null>} */
  const wrote = new Map();
  ctx.wrote = wrote;
  fs.mkdirSync(f.dir, {recursive: true});
  /** @type {{warnings: string[], lifted: string[], notes: string[], removedPictures: string[]}} */
  let built;
  // The token loops the last build had, so a change that adds one (through
  // tokens the own source sets in a way no read of the file follows) is
  // refused once the build shows it.
  const loopsBefore = new Set(builtLoops(cwd, slug).map(l => l.key));
  // The app copy is written once the change is saved, never before.
  afterSave.add(ctx);
  try {
    refuseIfLockLost();
    // The saved settings built first (inside the rollback), so the change
    // is measured against what they show.
    if (staleBefore && saved) {
      await buildTheme(ctx, slug, saved);
      cssBefore = cssNow();
      resBefore = await resolvedTokens(ctx, slug).catch(() => {
        notes.push(
          `the last build (${path.basename(f.js)}) could not be read, so the token changes are not listed; the theme is built again`,
        );
        return null;
      });
    }
    try {
      built = await buildTheme(ctx, slug, data);
    } finally {
      ctx.keepStops = null;
    }
    // The build writes its outputs itself: a lock lost meanwhile is seen
    // before anything else is written.
    refuseIfLockLost();
    const loop = builtLoops(cwd, slug).find(l => !loopsBefore.has(l.key));
    if (loop)
      throw new AstryxError(
        `${loop.path.join(' reads ')}${loop.part ? ` on ${loop.part}` : ''}: the change makes these tokens read each other (with what ${slug}.theme.ts or the base theme sets), so they would have no value at all. Nothing was changed.`,
        [
          {
            name: `${P} how ${loop.path[0].replace(/^--/, '')}`,
            reason: 'see what it takes',
          },
        ],
        ERROR_CODES.ERR_THEME_BAD_VALUE,
      );
    data.lifted = built.lifted;
    // The undo step and the settings are part of the change: written whole,
    // inside the rollback, the settings first. A command stopped between
    // the two leaves the change saved with the history one step short (or,
    // for an undo, a top step equal to the settings, which undo skips),
    // never a step that undoes nothing or a lost step.
    await track(f.dir, wrote, () => {
      writeWhole(f.settings, `${JSON.stringify(savedForm(data), null, 2)}\n`);
      if (historyAfter)
        writeWhole(
          f.history,
          JSON.stringify(historyAfter.slice(-HISTORY_STEPS)),
        );
      else if (snapBefore && history && !noop)
        writeWhole(
          f.history,
          JSON.stringify(
            [...past, stepText(snapBefore, cwd, radiiNow)].slice(
              -HISTORY_STEPS,
            ),
          ),
        );
    });
    // Settings written whole: a `new` marker left beside them (a `new`
    // stopped after its theme was made) has nothing left to finish.
    clearNewMarker(f.dir);
    afterSave.delete(ctx);
    // The change is saved: its app copy follows. A copy that cannot be
    // written leaves the copy as it was; the change stands.
    try {
      afterBuild?.(ctx, slug, data);
    } catch (e) {
      if (/** @type {any} */ (e)?.lockLost) throw e;
    }
  } catch (e) {
    afterSave.delete(ctx);
    // A command that lost its lock while stopped owns none of these files
    // now: it puts nothing back and deletes nothing (that would undo the
    // other command's change).
    if (/** @type {any} */ (e)?.lockLost || !lockHeld()) {
      ctx.keepStops = null;
      if (/** @type {any} */ (e)?.lockLost) throw e;
      refuseIfLockLost();
    }
    const {failed, skipped} = restoreWritten(was, wrote);
    removeEmptyFolder(path.join(f.dir, 'tokens'));
    if (dirMade) removeEmptyFolder(f.dir);
    if (rootMade) removeEmptyFolder(f.root);
    if (failed.length || skipped.length)
      throw new AstryxError(
        `The change failed (${e instanceof Error ? e.message.split('\n')[0] : String(e)}). ${failed.length ? `These files could not be put back: ${failed.join(', ')}. ` : ''}${skipped.length ? `These files changed while it ran, so they were left as they are: ${skipped.join(', ')}. ` : ''}Run ${P} show ${slug} to rebuild from the settings.`,
        [{name: `${P} show ${slug}`, reason: 'do this next'}],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    const code = /** @type {any} */ (e)?.code;
    if (['EACCES', 'EPERM', 'ENOSPC', 'EROFS', 'EIO', 'EISDIR'].includes(code))
      throw new AstryxError(
        `Could not write the theme files (${code}), so the files were put back as they were. Free space or fix the permission, then run the command again. Nothing was changed.`,
        [
          {
            name: `ls -ld ${quoteCommandArgument(themeFiles(ctx.project.cwd, slug).dir)}`,
            reason: 'see who owns the theme folder',
          },
        ],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    // The color config's own refusals already name the file and the fix.
    if (
      e instanceof AstryxError &&
      (e.code === ERROR_CODES.ERR_UNKNOWN_THEME ||
        e.code === ERROR_CODES.ERR_THEME_INVALID ||
        e.code === ERROR_CODES.ERR_PALETTE_GENERATION ||
        e.code === ERROR_CODES.ERR_WRITE_FAILED ||
        e.code === ERROR_CODES.ERR_THEME_BUSY ||
        e.code === ERROR_CODES.ERR_THEME_BAD_VALUE)
    )
      throw e;
    // A folder where a built file goes: named for the editor, which has no
    // --out to pick.
    const folder =
      e instanceof AstryxError
        ? /^The output (.+) is a folder\./.exec(e.message)?.[1]
        : undefined;
    if (folder)
      throw new AstryxError(
        `${folder} is a folder, not a file, so the theme cannot be built. Put the file back in its place; nothing was changed.`,
        [
          {
            name: `ls -la ${quoteCommandArgument(folder)}`,
            reason: 'see what is there',
          },
        ],
        ERROR_CODES.ERR_THEME_INVALID,
      );
    const why = (e instanceof Error ? e.message : String(e))
      .split(`${cwd}${path.sep}`)
      .join('')
      .replace(/\s*Make sure all imports[^|]*$/s, '')
      .split('\n')
      .slice(0, 3)
      .join(' | ');
    const own = why.includes(path.basename(f.ts));
    throw new AstryxError(
      `The theme did not build, so the files were put back as they were: ${why}${own ? ` (${shown(cwd, f.ts)} is your own file: fix it, then run the command again)` : ''}. Nothing was changed.`,
      [
        own
          ? {
              name: `cat ${quoteCommandArgument(shown(cwd, f.ts))}`,
              reason: 'see your own file, then fix it',
            }
          : {
              name: `${P} show ${slug}`,
              reason: 'do this instead: see the settings as they are',
            },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  notes.push(...built.notes);
  // The change is saved from here on: a failure to check it is reported
  // as "saved, not checked", never as a failed change.
  /** @type {Record<'light' | 'dark', Record<string, string>>} */
  let res = {light: {}, dark: {}};
  /** @type {string[]} */
  const changed = [];
  /** @type {string[]} */
  const changedParts = [];
  /** @type {string[]} */
  let problems = [];
  /** @type {ThemeProblem[]} */
  let problemList = [];
  /** @type {ThemeProblem[]} */
  let newProblems = [];
  try {
    res = await resolvedTokens(ctx, slug);
    const modes = modesOf(data);
    if (resBefore) {
      /** @param {unknown} a @param {unknown} b */
      const same = (a, b) =>
        String(a).toLowerCase() === String(b).toLowerCase();
      // Both modes are compared: a theme that becomes one-mode changes what
      // the other mode's visitors see, though it no longer has that mode.
      // (The theme's own mode comes first: a dark-only theme lists its
      // dark changes before the light ones.)
      /** @type {Array<'light' | 'dark'>} */
      const order = modes.includes('light')
        ? ['light', 'dark']
        : ['dark', 'light'];
      for (const m of order) {
        const own = modes.includes(m);
        for (const k of Object.keys(res[m])) {
          // A change of letter case alone (#FFFFFF, #ffffff) is no change.
          if (same(resBefore[m][k], res[m][k])) continue;
          const modal = MODAL.has(ctx.C.typeOf(k));
          if (!modal && m === 'dark') continue;
          // A one-mode theme writes its mode on both sides: the other side
          // that moved with it says nothing new. A setting for the other
          // mode applies where Core draws that mode, so its change is named.
          if (
            modal &&
            !own &&
            same(resBefore[m][k], resBefore[modes[0]][k]) &&
            same(res[m][k], res[modes[0]][k])
          )
            continue;
          changed.push(
            `${k}${modal && (modes.length > 1 || !own) ? ` (${m})` : ''}: ${resBefore[m][k]} -> ${res[m][k]}`,
          );
        }
      }
    }
    // A token the built stylesheet sets on a part (a readable text color
    // on a selected row, a dropzone) moves with the dials too: each one
    // whose built value changed is listed, by its rule, in each mode.
    if (resBefore)
      changedParts.push(...partTokenChanges(cssBefore, cssNow(), modes));
    const found = await contrastProblems(ctx, data, res);
    problemList = found.filter(x => !isCheckNote(x));
    problems = problemList.map(x => x.text);
    // The problems this change made: the ones the settings before it did
    // not have, measured the same way.
    const had =
      before && resBefore
        ? new Set(
            (await contrastProblems(ctx, before, resBefore)).map(x => x.key),
          )
        : new Set();
    newProblems = problemList.filter(x => !had.has(x.key));
    // What cannot be measured is a note, not a problem; a failure the base
    // theme draws itself is said when this change brings it (show says it
    // every time), not after every change.
    notes.push(
      ...found
        .filter(
          x =>
            isCheckNote(x) &&
            (x.text.startsWith('not checked') || !had.has(x.key)),
        )
        .map(x => x.text),
    );
  } catch (e) {
    ctx.unchecked ??= `checking it failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return {
    changed,
    changedParts,
    res,
    problems,
    problemList,
    newProblems,
    warnings: built.warnings,
    lifted: built.lifted.filter(x => !liftedBefore.has(x)),
    notes,
    unchanged: false,
    // The theme and its tokens before this change, for what a caller says
    // of the change against them.
    before,
    resBefore,
  };
}

/**
 * The Fontsource package for a font family, in Fontsource's own naming: an
 * open font's own package as the editor's font table names it (Geist is
 * `@fontsource/geist-sans`); a variable family, which Fontsource names
 * `<Name> Variable`, from `@fontsource-variable/<name>`; else the family's
 * name with every run of other characters as one dash (`Open Sans` is
 * `@fontsource/open-sans`, `Mrs. Sheppards` is `@fontsource/mrs-sheppards`).
 * Null when the name gives no such package name (a name with no Latin
 * letters or digits).
 * @param {string} family
 * @returns {string | null}
 */
export function fontsourcePackageOf(family) {
  const name = cssUnescape(String(family).replace(/["']/g, '')).trim();
  const open = Object.values(OPEN_FONTS).find(
    f =>
      f.family.replace(/["']/g, '').trim().toLowerCase() === name.toLowerCase(),
  );
  if (open) return open.pkg;
  /** @param {string} n */
  const slug = n =>
    n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const variable = /^(.+?)\s+variable$/i.exec(name);
  const base = slug(variable ? variable[1] : name);
  if (!base) return null;
  return variable ? `@fontsource-variable/${base}` : `@fontsource/${base}`;
}

/**
 * The Fontsource package to suggest installing for a family: an open
 * font's own package (the editor's font table knows it is published); none
 * for a font a system ships (on any platform), which Fontsource does not
 * publish; else the family's package in Fontsource's naming, which
 * Fontsource may or may not publish (`known` false).
 * @param {string} family
 * @returns {{pkg: string, known: boolean} | null}
 */
export function fontsourceSuggestion(family) {
  const name = cssUnescape(String(family).replace(/["']/g, '')).trim();
  const open = Object.values(OPEN_FONTS).find(
    f =>
      f.family.replace(/["']/g, '').trim().toLowerCase() === name.toLowerCase(),
  );
  if (open) return {pkg: open.pkg, known: true};
  if (isSystemFamily(name)) return null;
  const pkg = fontsourcePackageOf(name);
  return pkg ? {pkg, known: false} : null;
}

/** @type {WeakMap<object, Set<string>>} */
const coreElementVarsByProject = new WeakMap();

/**
 * The custom properties Core's stylesheet sets on a component's own
 * element (not on the page root), once per project: a value a theme gives
 * one of them on the page never reaches the part.
 * @param {Ctx} ctx
 * @returns {Set<string>}
 */
export function coreElementVars(ctx) {
  const known = coreElementVarsByProject.get(ctx.project);
  if (known) return known;
  /** @type {Set<string>} */
  let vars = new Set();
  try {
    vars = elementCustomProperties(
      fs.readFileSync(
        ctx.project.req.resolve('@astryxdesign/core/astryx.css'),
        'utf8',
      ),
    );
  } catch {
    // No Core stylesheet to read: none known.
  }
  coreElementVarsByProject.set(ctx.project, vars);
  return vars;
}

/**
 * The font weights the app's text takes with the theme: Core's weight
 * tokens (`--font-weight-*`, which its components' text reads) as the
 * theme sets them, every `font-weight` and weight token the theme's build
 * writes (a `font` shorthand's weight too), each var() read through the
 * theme's own values and then Core's stylesheet, and the normal weight
 * (400). With `family`, only the weights text in that family takes: the
 * weight tokens, and each weight set beside that family (or, for a family
 * of the theme's font tokens, beside no family), never one only another
 * family's rule sets. Null before the theme has been built.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {string | null} [family]
 * @returns {number[] | null}
 */
export function builtFontWeights(ctx, slug, family = null) {
  /** @type {string} */
  let css;
  try {
    css = fs.readFileSync(themeFiles(ctx.project.cwd, slug).css, 'utf8');
  } catch {
    return null;
  }
  const own = customPropertyValues(css);
  // Core's stylesheet, which the app loads with the theme, gives the
  // default of every token the theme does not set.
  /** @type {Map<string, string[]>} */
  let core = new Map();
  try {
    core = customPropertyValues(
      fs.readFileSync(
        ctx.project.req.resolve('@astryxdesign/core/astryx.css'),
        'utf8',
      ),
    );
  } catch {
    // No Core stylesheet to read: the theme's own values only.
  }
  /** @param {string} name */
  const lookup = name => own.get(name) ?? core.get(name) ?? [];
  /** @type {Set<number>} */
  const weights = new Set([400]);
  const KEYWORDS = /** @type {Record<string, number>} */ ({
    normal: 400,
    bold: 700,
  });
  /** @param {string[]} values */
  const add = values => {
    for (const value of values.flatMap(v => expandFontVars(v, lookup)))
      for (const word of value.split(/[\s,]+/)) {
        const n = KEYWORDS[word.toLowerCase()] ?? Number(word);
        // Any weight from 1 to 1000 is one CSS reads (550 too).
        if (Number.isInteger(n) && n >= 1 && n <= 1000) weights.add(n);
      }
  };
  // The weight tokens (Core's, and every weight token the theme sets):
  // text anywhere reads them, whatever its family.
  const coreWeightTokens = [...core.keys()].filter(k =>
    /^--font-weight-/.test(k),
  );
  add([
    ...coreWeightTokens.flatMap(lookup),
    ...declarationValues(css, /^--.*-weight(-[a-z0-9]+)?$/),
  ]);
  /** The families a rule sets (a font shorthand's too), by lowercase name. @param {{families: string[], fonts: string[]}} rule */
  const familiesOf = rule =>
    [...rule.families, ...rule.fonts.map(fontShorthandFamilyList)]
      .flatMap(v => expandFontVars(v, lookup))
      .flatMap(namedFontFamilies)
      .map(x => x.toLowerCase());
  /** The weights a rule sets: its font-weight, and a font shorthand's. @param {{fonts: string[], weights: string[]}} rule */
  const weightsOf = rule => [
    ...rule.weights,
    ...rule.fonts.map(f => fontShorthandWeight(f) ?? 'normal'),
  ];
  // The families of the theme's font tokens: the text of a rule that sets
  // a weight and no family of its own shows one of them.
  const tokenFamilies = new Set(
    declarationValues(css, /^--font-family-/)
      .flatMap(v => expandFontVars(v, lookup))
      .flatMap(namedFontFamilies)
      .map(x => x.toLowerCase()),
  );
  const want = family?.toLowerCase() ?? null;
  for (const rule of fontRules(css)) {
    const fams = familiesOf(rule);
    // Each weight goes to the family it is set beside; with none, to the
    // theme's own families. Asked for no family: every weight.
    if (
      want == null ||
      fams.includes(want) ||
      (!fams.length && (tokenFamilies.has(want) || !tokenFamilies.size))
    )
      add(weightsOf(rule));
  }
  return [...weights].sort((a, b) => a - b);
}

/**
 * Whether the theme's last build sets italic text anywhere: a
 * `font-style` of italic or oblique, or a `font` shorthand's style, each
 * var() read through the theme's own values. A font package then loads
 * its italic faces beside the upright ones, or the browser draws a slanted
 * copy. False before the theme has been built.
 * @param {Ctx} ctx
 * @param {string} slug
 * @returns {boolean}
 */
export function builtItalic(ctx, slug) {
  /** @type {string} */
  let css;
  try {
    css = fs.readFileSync(themeFiles(ctx.project.cwd, slug).css, 'utf8');
  } catch {
    return false;
  }
  const own = customPropertyValues(css);
  /** @param {string} name */
  const lookup = name => own.get(name) ?? [];
  return fontRules(css).some(rule =>
    [
      ...rule.styles.flatMap(v => expandFontVars(v, lookup)),
      ...rule.fonts
        .flatMap(v => expandFontVars(v, lookup))
        .map(f => fontShorthandStyle(f) ?? ''),
    ].some(v => /^\s*(italic|oblique)\b/i.test(v)),
  );
}

/**
 * The font families the theme's last build names (its `--font-family-*`
 * tokens, every part's `font-family`, and a `font` shorthand's families), by lowercase name; null before the
 * theme has been built.
 * @param {Ctx} ctx
 * @param {string} slug
 * @returns {Map<string, string> | null}
 */
export function builtFontFamilies(ctx, slug) {
  const stacks = builtFontStacks(ctx, slug);
  if (!stacks) return null;
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const stack of stacks)
    for (const family of stack)
      if (!out.has(family.toLowerCase())) out.set(family.toLowerCase(), family);
  return out;
}

/**
 * Each font stack the theme's build writes, as the families it names in
 * order (see {@link builtFontFamilies}); null when the build is not there.
 * @param {Ctx} ctx
 * @param {string} slug
 * @returns {string[][] | null}
 */
export function builtFontStacks(ctx, slug) {
  /** @type {string} */
  let css;
  try {
    css = fs.readFileSync(themeFiles(ctx.project.cwd, slug).css, 'utf8');
  } catch {
    return null;
  }
  // Every family the build writes: the font tokens, a part's own
  // font-family, the families a `font` shorthand names last, and a family
  // held in the theme's own property that one of those reads.
  // A var() of the theme's own property reads as each value it sets.
  const own = customPropertyValues(css);
  const lists = [
    ...declarationValues(css, /^(--font-family-.*|font-family)$/),
    ...declarationValues(css, /^font$/).map(fontShorthandFamilyList),
  ].flatMap(value => expandFontVars(value, name => own.get(name) ?? []));
  return lists.map(value => namedFontFamilies(value));
}

/**
 * The font packages that load the families the theme builds: a font
 * setting's package while the build still uses its family, and the
 * installed @fontsource package of a family the theme's own source sets.
 * Font notes, the previews and the app copy all load fonts from this list.
 * For a new app that installs its own packages (`forNewApp`), every built
 * family that is an open font comes too, installed here or not.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{forNewApp?: boolean}} [opts]
 */
export function fontPackages(ctx, data, {forNewApp = false} = {}) {
  /** @type {Array<{pkg: string, family: string, installed: boolean, of: Setting | null}>} */
  const out = [];
  /** @param {string} pkg */
  const isInstalled = pkg => packageInstalled(ctx.project.cwd, pkg);
  /** An open font's package, which a new app installs. @param {string} pkg */
  const isOpen = pkg => Object.values(OPEN_FONTS).some(f => f.pkg === pkg);
  /** Whether a package loads its family where the fonts go. @param {string} pkg */
  const loads = pkg => isInstalled(pkg) || (forNewApp && isOpen(pkg));
  const built = builtFontFamilies(ctx, data.name);
  for (const s of data.settings) {
    if (s.thing !== 'font') continue;
    const {pkg: known, family} = fontOf(s.value);
    const name = family.replace(/["']/g, '');
    // A family the theme's own source replaced everywhere it was set is
    // not in the build: nothing loads it.
    if (built && !built.has(name.toLowerCase())) continue;
    // An installed @fontsource package of the family always loads it, even
    // for a family some systems ship.
    const own = fontsourcePackageOf(name);
    const pkg = known ?? (own && loads(own) ? own : null);
    if (!pkg || out.some(x => x.pkg === pkg)) continue;
    out.push({pkg, family: name, installed: isInstalled(pkg), of: s});
  }
  // A new app installs the package of each stack's first family, so a
  // browser never reaches a later one (a system face such as Roboto, there
  // for a platform with neither): only first families count for it.
  const families = forNewApp
    ? (builtFontStacks(ctx, data.name) ?? []).flatMap(stack =>
        stack.length ? [stack[0]] : [],
      )
    : [...(built?.values() ?? [])];
  for (const family of families) {
    const pkg = fontsourcePackageOf(family);
    if (!pkg || out.some(x => x.pkg === pkg) || !loads(pkg)) continue;
    out.push({pkg, family, installed: isInstalled(pkg), of: null});
  }
  return out;
}
