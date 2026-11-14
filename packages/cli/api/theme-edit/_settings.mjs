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
import {parse as parseModule} from '@babel/parser';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {coversProperty, cssNumber, longhandsOf} from './_css.mjs';
import postcss from 'postcss';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {themeFileImports} from '../../foundation/discovery/theme-discovery.mjs';
import {pathToFileURL} from 'node:url';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {AstryxError} from '../error.mjs';
import {logger} from '../logger.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {oneColorMode, themeBuildForReport} from '../theme/build/build.mjs';
import {
  AUTO_SPREAD,
  CORNERS,
  DIALS,
  FAMILIES,
  FONTS,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  LIKE,
  OPEN_FONTS,
  P,
  SPACING,
  SURFACES,
  SURFACE_PARTS,
  TEXT_SIZE,
  TYPE_STYLES,
  familyOf,
  WRAPPED_PARTS,
  CARD_LIKE,
} from './_tables.mjs';
import {cleanDialValue} from './_normal.mjs';
import {
  alphaOf,
  colorProblem,
  compositeOver,
  isColorValue,
  isSafeValue,
  parseColor,
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
  removeEmptyFolder,
  writeWhole,
  setOwnTokenReader,
  readWrittenRecord,
  writeWrittenRecord,
} from './_palette.mjs';
import {EDITOR_STAMP, pngTexts} from './_png.mjs';
import {MODAL, isColorToken} from './_compiler.mjs';
import {
  baseInstalled,
  baseModule,
  baseResolved,
  baseThemeFile,
} from './_project.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';

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

/** @typedef {{project: import('./_project.mjs').ThemeProject, C: import('./_compiler.mjs').Compiler, unchecked?: string | null, uncheckedCode?: string | null, wrote?: Map<string, string | null>, base?: {light: Record<string, string>, dark: Record<string, string>, components?: Record<string, any>}, keepStops?: Record<string, Record<'light' | 'dark', {family: string, stop: number, alpha?: string}>> | null, keepRadii?: Record<string, string> | null, sizeNotes?: string[], compileNotes?: string[], derived?: Record<string, Array<{property: string, vars?: string[], replaces?: boolean, expand?: string}>>}} Ctx */
/** @typedef {import('./_parts.mjs').PaintSide} PaintSide */
/** @typedef {import('./_parts.mjs').TextPair} TextPair */

/** What a theme name may be, in words. */
export const NAME_RULE =
  'lowercase letters, digits and dashes, starting with a letter, 64 characters at most, and not a name Windows reserves (con, prn, aux, nul, com1-com9, lpt1-lpt9)';

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
 * Whether a value fits what a dial takes, read from the dial's own list of
 * values: a named rung in any case, or a value of the kind it names (a size,
 * a color, a number). `set` still checks the value in full.
 * @param {string} dial
 * @param {string} value
 */
export function dialValueFits(dial, value) {
  const spec = DIALS[/** @type {keyof typeof DIALS} */ (dial)]?.values;
  if (!spec) return false;
  const v = String(value).trim();
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

/** @param {string} file @returns {string | null} */
const contentHash = file => {
  try {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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
    return pngTexts(fs.readFileSync(file))[EDITOR_STAMP] === slug;
  } catch {
    return false;
  }
}

/**
 * Adopt a picture an older editor took (before it recorded or stamped its
 * pictures) into the record: only while the theme has no record at all, the
 * name is one the editor writes, and the picture is the editor's 1280-pixel
 * wide window. Returns whether it was adopted.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} file
 */
export function adoptOlderPicture(cwd, slug, file) {
  if (fs.existsSync(themeFiles(cwd, slug).pictures)) return false;
  if (!/^(sheet|preview)(-[a-z-]+)?\.png$/.test(path.basename(file)))
    return false;
  /** @type {Buffer} */
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return false;
  }
  // The width in the PNG header: the editor takes a 1280-pixel window.
  if (
    bytes.length < 24 ||
    bytes.toString('latin1', 12, 16) !== 'IHDR' ||
    bytes.readUInt32BE(16) !== 1280
  )
    return false;
  recordWritten(cwd, slug, [file]);
  return true;
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
  for (const file of [f.settings, f.ts, f.history]) {
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
    .sort((a, b) => b.t - a.t || a.d.localeCompare(b.d))
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
  const limit = Math.max(2, Math.floor(x.length / 3));
  // Nearest by edit distance first (brand-drak is brand-dark, not brand); a
  // name one holds inside the other is near too, after the close ones.
  return [...list]
    .filter(c => c.length > 2)
    .map(c => {
      const d = levenshteinDistance(x, c);
      return /** @type {[string, number]} */ ([
        c,
        d <= limit ? d : c.includes(x) || x.includes(c) ? limit + 0.5 : d,
      ]);
    })
    .filter(([, s]) => s <= limit + 0.5)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([c]) => c);
}

/**
 * A refusal: nothing was changed, and the suggestions lead with the command
 * that does what the person wanted.
 * @param {string} code
 * @param {string} message
 * @param {{run?: string[], didYouMean?: string[], fix?: string, also?: string[]}} [extra]
 * @returns {never}
 */
export function refuse(code, message, extra = {}) {
  /** @type {Array<{name: string, reason: string}>} */
  const suggestions = [];
  for (const r of extra.run ?? []) {
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
    .replace(/\/.*$/, '')
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
  const m = /^(\d*\.?\d+)\s*(%?)$/.exec(v.trim());
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
  const mode = String(data?.mode ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  const like = String(data?.like ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@astryxdesign\/theme-/, '');
  return {mode, like};
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
    const words = String(slug ?? '')
      .split(/\s*[,;|]\s*/)
      .map(w => slugFor(w.trim()))
      .filter(Boolean);
    if (!same && words.length > 1) {
      const existing = words.filter(
        w => slugOk(w) && fs.existsSync(themeFiles(cwd, w).settings),
      );
      refuse(
        ERROR_CODES.ERR_INVALID_ARGUMENT,
        `"${String(slug ?? '').slice(0, 80)}" names more than one theme; a command takes one theme at a time.`,
        {
          run: existing.length
            ? existing.map(w => `${P} show ${w}`)
            : [`${P} new ${words[0]}`],
        },
      );
    }
    // An empty name (an unset variable, a lone dash): no theme to guess
    // from it, so the themes here are named instead of a new one.
    if (!same && !/[a-z0-9]/i.test(String(slug ?? ''))) {
      const have = fs.existsSync(themeFiles(cwd, 'x').root)
        ? fs
            .readdirSync(themeFiles(cwd, 'x').root)
            .filter(
              d => slugOk(d) && fs.existsSync(themeFiles(cwd, d).settings),
            )
            .sort()
        : [];
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
    if (!same && (stopped || madeByEditor(f.settingsTs)))
      refuse(
        ERROR_CODES.ERR_UNKNOWN_THEME,
        stopped
          ? `themes/${slug} was left by a \`new\` that was stopped part way, so it has no settings yet. Run new again to finish it; files you added there are kept.`
          : `themes/${slug} has lost its settings (${slug}.settings.json is gone), but the editor made it. Run new to make it again: your own files there are kept${fs.existsSync(f.history) ? `, and \`undo ${slug}\` then steps back to the settings from before the last change (the last change itself is not kept)` : ''}.`,
        {run: [`${P} new ${slug}`]},
      );
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
            `${P} new ${usableNewName(cwd, `my-${slug}`)}${LIKE.includes(slug) ? ` --like ${slug}` : ''}`,
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
  const recover = steps
    ? {
        text: `, or step back to the settings before the last change with ${P} undo ${slug} (the last change is then lost)`,
        run: [{name: `${P} undo ${slug}`, reason: 'do this instead'}],
      }
    : {
        text: `; or make the theme again with ${P} new ${slug}, which keeps the damaged file beside it and every file of yours`,
        run: [{name: `${P} new ${slug}`, reason: 'do this instead'}],
      };
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(
      fs.readFileSync(f.settings, 'utf8').replace(/^\uFEFF/, ''),
    );
  } catch {
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json is not valid JSON. Fix it by hand${recover.text}.`,
      recover.run,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  // Valid JSON of the wrong shape ([], {}, settings: null) is damage like
  // invalid JSON: `new` makes the theme again, keeping the file aside.
  if (!settingsShapeOk(data))
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json is damaged: ${settingsProblem(data) ?? 'it is not a settings object'}. Fix it by hand${steps ? `, step back to the settings before the last change with ${P} undo ${slug},` : ''} or make the theme again with ${P} new ${slug}, which keeps the damaged file beside it and every file of yours. Nothing was changed.`,
      [
        ...recover.run.filter(r => !/ new /.test(r.name)),
        {name: `${P} new ${slug}`, reason: 'do this instead'},
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  const problem = settingsProblem(data, skip);
  // A value made under looser rules is not damage: the command that
  // changes or removes that setting still works, with the other bad ones
  // left out of the build, so each listed fix runs on its own.
  const all = problem ? badSettings(data) : [];
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
        .map(s => valueProblem(s))
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
  const bad = problem && !fieldBroken ? badSetting(data) : null;
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
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json: ${problem}, a value the editor no longer accepts. Remove or change that setting; nothing else needs to change. Nothing was changed.`,
      [
        {name: `${P} undo ${slug} ${undoArgs(bad)}`, reason: 'do this instead'},
        // Only a set that replaces this very entry: `mode` and `base` set
        // the theme's own fields, not an entry in the list.
        ...(example && !['mode', 'base'].includes(bad.thing)
          ? [
              {
                name: `${P} set ${slug} ${undoArgs(bad).replace(bad.thing, `${bad.thing} ${quoteCommandArgument(example)}`)}`,
                reason: meant
                  ? 'or set the value it holds, cleaned'
                  : 'or give it a value it takes',
              },
            ]
          : []),
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  // A bad mode or base is fixed by setting it.
  // A value written in other letters (Dark-Only, Neutral) is the one meant.
  const {mode: modeMeant, like: likeMeant} = fieldsMeant(data);
  const fieldFix = /^(it has no mode|mode ")/.test(problem ?? '')
    ? `${P} set ${slug} mode ${['both', 'light-only', 'dark-only'].includes(modeMeant) ? modeMeant : 'both'}`
    : /^base "/.test(problem ?? '')
      ? `${P} set ${slug} base ${LIKE.includes(likeMeant) && baseInstalled(cwd, likeMeant) ? likeMeant : 'none'}`
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
    const field = /^base "/.test(problem) ? 'base' : 'mode';
    const fieldValue = fieldFix.split(' ').pop();
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json: ${problem}, and ${settingsProblem(data, alsoBad.thing) ?? `${alsoBad.thing} "${alsoBad.value}" is not a value it takes`}. Fix that setting first: ${meant ? 'either command below does' : 'the command below does'}, and saves the ${field} as ${fieldValue}. Nothing was changed.`,
      [
        ...(meant
          ? [
              {
                name: `${P} set ${slug} ${undoArgs(alsoBad).replace(alsoBad.thing, `${alsoBad.thing} ${quoteCommandArgument(meant)}`)}`,
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
      `themes/${slug}/${slug}.settings.json: ${problem}. ${fieldFix ? 'Set it again' : twice ? `Set it to one of its values or undo it, or fix it by hand${recover.text}` : `Fix it by hand${recover.text}`}. Nothing was changed.`,
      fieldFix
        ? [{name: fieldFix, reason: 'do this instead'}]
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
                  name: `${P} set ${slug} ${undoArgs(twice.setting).replace(twice.setting.thing, `${twice.setting.thing} ${quoteCommandArgument(String(v))}`)}`,
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
  for (const s of data.settings) {
    // A value or scope that is not text is a bad setting `undo` removes;
    // a setting with no name is damage.
    if (!s || typeof s.thing !== 'string' || !('value' in s))
      return 'a setting has no thing or value';
    if (!['dial', 'token', 'property'].includes(s.source))
      return `${s.thing} has no source (dial, token or property)`;
    if (s.mode != null && s.mode !== 'light' && s.mode !== 'dark')
      return `${s.thing} has mode "${s.mode}"`;
    const key = keyOf(s);
    // The command that changes or removes a setting listed twice keeps one
    // value, or none, so it fixes the list.
    if (keys.has(key) && !skips(s, skip))
      return `${describe({...s, value: '?'}).replace(' = ?', '')} is listed twice (${JSON.stringify(keys.get(key).value)}, ${JSON.stringify(s.value)})`;
    keys.set(key, s);
    if (skips(s, skip)) continue;
    const problem = valueProblem(s);
    if (problem) return problem;
  }
  return null;
}

/**
 * Whether a setting is the one a command changes or removes: by thing, or
 * by the whole identity (part, variant, state, mode) when one is given.
 * @param {any} s
 * @param {string | Partial<Setting> | undefined} skip
 */
function skips(s, skip) {
  if (!skip) return false;
  if (typeof skip === 'string') return s.thing === skip;
  return (
    s.thing === skip.thing &&
    (s.on ?? '') === (skip.on ?? '') &&
    (s.when ?? '') === (skip.when ?? '') &&
    (s.state ?? '') === (skip.state ?? '') &&
    (s.mode ?? '') === (skip.mode ?? '')
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
      s && typeof s.thing === 'string' && valueProblem(s),
  );
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
    ...(x.on ? [`--on ${quoteCommandArgument(String(x.on))}`] : []),
    ...(x.when ? [`--when ${quoteCommandArgument(String(x.when))}`] : []),
    ...(x.state ? [`--state ${quoteCommandArgument(String(x.state))}`] : []),
    ...(x.mode ? [`--mode ${quoteCommandArgument(String(x.mode))}`] : []),
    ...(x.only ? ['--only'] : []),
  ].join(' ');
}

/**
 * The first setting whose only problem is its value (made under looser
 * rules): `undo <theme> <undoArgs>` removes it.
 * @param {any} data
 * @returns {Setting | null}
 */
export function badSetting(data) {
  for (const s of Array.isArray(data?.settings) ? data.settings : [])
    if (s && typeof s.thing === 'string' && valueProblem(s)) return s;
  return null;
}

/**
 * The settings without those whose only problem is their value (made under
 * looser rules), and the ones left out.
 * @param {ThemeData} data
 * @returns {{data: ThemeData, dropped: Setting[]}}
 */
export function withoutBadValues(data) {
  const dropped = data.settings.filter(s => valueProblem(s));
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
 * @typedef {{token: string | null, key: string, line: number | null, kind: 'text' | 'number' | 'pair' | 'other', value?: string | number, halves?: Array<string | number | undefined>}} OwnTokenEntry
 */

/**
 * The entries of the top-level `tokens` map in a theme's own source, read
 * from its syntax tree, each with the line that sets it.
 * @param {string} cwd
 * @param {string} slug
 * @returns {OwnTokenEntry[]}
 */
export function ownTokenEntries(cwd, slug) {
  /** @type {OwnTokenEntry[]} */
  const detail = [];
  ownPageTokens(cwd, slug, detail);
  return detail;
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
  /** @type {string} */
  let code;
  try {
    code = fs.readFileSync(themeFiles(cwd, slug).ts, 'utf8');
  } catch {
    return out;
  }
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
  const def = unwrap(chosen.call.arguments[0]);
  if (def?.type !== 'ObjectExpression') return out;
  const tokensProp = def.properties.find(
    (/** @type {any} */ p) =>
      p.type === 'ObjectProperty' && !p.computed && keyOf(p.key) === 'tokens',
  );
  if (!tokensProp) return out;
  let unresolved = false;
  /** @param {any} node @param {number} depth */
  const collect = (node, depth) => {
    const obj = unwrap(node);
    if (obj?.type !== 'ObjectExpression' || depth > 20) {
      unresolved = true;
      return;
    }
    // Spreads and keys merge in order: a later one wins. A computed key
    // that is text (`['--radius-page']`) is read like a literal one.
    for (const p of obj.properties) {
      if (p.type === 'SpreadElement') collect(p.argument, depth + 1);
      else if (p.type === 'ObjectProperty') {
        const k = p.computed ? textOf(unwrap(p.key)) : keyOf(p.key);
        if (k?.startsWith('--')) out.set(k, textOf(unwrap(p.value)));
        else if (p.computed) unresolved = true;
        if (detail && (k?.startsWith('--') || p.computed))
          detail.push({
            token: k?.startsWith('--') ? k : null,
            key: code.slice(p.key.start, p.key.end),
            line: p.loc?.start?.line ?? null,
            ...valueShape(unwrap(p.value)),
          });
      } else unresolved = true;
    }
  };
  /**
   * What a token's value is, as written: text, a number, a [light, dark]
   * pair (each half's text, a number, or undefined), or something else.
   * @param {any} node
   * @returns {Pick<OwnTokenEntry, 'kind' | 'value' | 'halves'>}
   */
  const valueShape = node => {
    const t = textOf(node);
    if (t != null) return {kind: 'text', value: t};
    if (node?.type === 'NumericLiteral')
      return {kind: 'number', value: node.value};
    if (node?.type === 'ArrayExpression')
      return {
        kind: 'pair',
        halves: node.elements.map((/** @type {any} */ e) => {
          const h = unwrap(e);
          return (
            textOf(h) ?? (h?.type === 'NumericLiteral' ? h.value : undefined)
          );
        }),
      };
    return {kind: 'other'};
  };
  collect(tokensProp.value, 0);
  // A value no read of the file can resolve (a call, an import) is read
  // from the build (ownTokens), and checked again after the next one.
  void unresolved;
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
 * Whether the base theme's own source gives a part's rule a property, in a
 * state (`:hover`) or at rest, read from its module as written.
 * @param {string} cwd
 * @param {string | undefined} like
 * @param {string} part
 * @param {string} scope `base` or a variant such as `variant:secondary`
 * @param {string | null} state a state block (`:hover`), or null
 * @param {string} prop camelCase
 */
export function baseRuleHas(cwd, like, part, scope, state, prop) {
  const file = like ? baseModule(cwd, like) : null;
  if (!file) return false;
  try {
    const at = ['components', part, scope, ...(state ? [state] : [])];
    return blockOf(file, at).has(prop);
  } catch {
    return false;
  }
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
 * What is wrong with where a setting applies, or null: names only, as
 * `set` takes them.
 * @param {any} s
 * @returns {string | null}
 */
function scopeProblem(s) {
  if (s.on != null && !/^[a-z][a-z0-9-]*$/.test(s.on))
    return `${s.thing} is set on "${s.on}", which is not a part or group name`;
  if (s.state != null && !/^[a-z][a-zA-Z-]*$/.test(s.state))
    return `${s.thing} has state "${s.state}", which is not a state name`;
  if (s.when != null && !/^[\w-]+:[\w.-]+$/.test(s.when))
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
    // reads it, so a set or undo of the weight replaces it.
    s.thing === 'headings' ? (s.axis ?? 'weight') : (s.axis ?? ''),
    s.on ?? '',
    s.when ?? '',
    s.state ?? '',
    s.mode ?? '',
    s.only ? 'only' : '',
  ].join('|');

/** One line for a setting. @param {Setting} s */
export function describe(s) {
  const where = s.on
    ? ` on ${s.on}${s.only ? ' only' : ''}${s.when ? ` when ${s.when}` : ''}${s.state ? ` :${s.state}` : ''}`
    : ' (whole theme)';
  return `${s.thing} = ${s.value}${where}${s.mode ? ` [${s.mode} only]` : ''}`;
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
  if (FAMILIES[s.on]) return FAMILIES[s.on].filter(has);
  const fam = familyOf(s.on);
  if (fam && AUTO_SPREAD.includes(fam) && !s.only)
    return FAMILIES[fam].filter(has);
  return [s.on];
}

export {modesOf};

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
        : without(family, ['system-ui', 'sans-serif']),
    pkg: pkgOf(family),
  };
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
 * What a part reads for a property when the theme does not set it, so a
 * one-mode component setting keeps the other mode as it was.
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
  // A setting the editor no longer accepts never reaches the build.
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
  const baseSize = b0 ? Math.round(b0 * 16) : 14;
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
  /** The one-mode gradient layers each block holds, by mode. @type {WeakMap<object, {light: string[], dark: string[]}>} */
  const modeLayers = new WeakMap();
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
    let b = (t[s.when ?? 'base'] ??= {});
    if (s.state) {
      const tg = ctx.project.target.get(target);
      if (tg?.states.includes(s.state) && s.when == null) b = t[s.state] ??= {};
      else if (tg?.states.includes(s.state))
        b = t[`${s.when}+${s.state}`] ??= {};
      else b = b[stateKey(s.state, wrapsOneControl(ctx, target))] ??= {};
    }
    return b;
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
    if (s.state && tg?.states.includes(s.state)) return null;
    const [k, v] = s.when ? String(s.when).split(':') : [];
    return `.astryx-${target}${s.when ? `[data-${k}="${v}"]` : ''}${s.state ? stateKey(s.state, wrapsOneControl(ctx, target)) : ''}`;
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
    for (const [target, blocks] of Object.entries(theme.components ?? {})) {
      const keys = Object.keys(blocks);
      const ordered = keys.includes('base')
        ? ['base', ...keys.filter(k => k !== 'base')]
        : keys;
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
    if (!s.state || tg?.states.includes(s.state))
      return [block(s, target), dir];
    const parent = block({...s, state: undefined}, target);
    return [parent, `${stateKey(s.state, wrapsOneControl(ctx, target))}${dir}`];
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
    const b = block(s, target);
    // A gradient background for one mode: each layer's colors are painted
    // in that mode only (transparent in the other), as background images
    // beside the other mode's, so each mode keeps its own background color;
    // a gradient for both modes held before keeps showing in the other
    // mode. Which layers belong to which mode is recorded as they are
    // written, never read back from their stops.
    if (
      s.mode &&
      /^background(-image)?$/.test(kebab(prop)) &&
      /gradient\(/i.test(v)
    ) {
      let rec = modeLayers.get(b);
      if (!rec) {
        rec = {light: [], dark: []};
        for (const k of ['background', 'backgroundImage']) {
          const held = b[k];
          if (typeof held !== 'string' || !/gradient\(/i.test(held)) continue;
          rec.light.push(...maskLayers(held, 'light'));
          rec.dark.push(...maskLayers(held, 'dark'));
          if (k === 'backgroundImage') delete b[k];
        }
        modeLayers.set(b, rec);
      }
      rec[s.mode] = maskLayers(v, s.mode);
      const parts = [...rec.light, ...rec.dark].map(layerParts);
      for (const k of [
        'backgroundImage',
        'backgroundPosition',
        'backgroundSize',
        'backgroundRepeat',
      ])
        delete b[k];
      b.backgroundImage = parts.map(x => x.image).join(', ');
      if (parts.some(x => x.position || x.size || x.repeat)) {
        b.backgroundPosition = parts.map(x => x.position || '0% 0%').join(', ');
        b.backgroundSize = parts.map(x => x.size || 'auto').join(', ');
        b.backgroundRepeat = parts.map(x => x.repeat || 'repeat').join(', ');
      }
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
      // color in that mode and, in the other, exactly the value it shows
      // unset there (the base theme's, else Core's), so no variant takes
      // another's and the other mode stays as it was. The part's own rule
      // is left alone.
      // The property itself (a border color stays a border color); the
      // background shorthand is written as its color.
      const css = colorFamily(prop);
      const other = mode === 'light' ? 2 : 1;
      // What the part's own rule holds of it (an earlier setting for both
      // modes): the other half each variant keeps, before its unset value.
      const plainHeld = [
        css,
        ...(css === 'background-color' ? ['background'] : []),
      ]
        .map(k => b[camel(k)])
        .find(y => typeof y === 'string' && !/gradient\(|url\(/i.test(y));
      // The part's own background being an image (a gradient) covers any
      // color under it: the color is written, and the result says it does
      // not show.
      const plainImage =
        css === 'background-color'
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
        const vb = block({...s, when: `variant:${name}`}, target);
        // What the variant's rule already holds (a setting for the other
        // mode, or one for both) keeps its other half; else the value the
        // variant shows unset.
        // The background shorthand is the same property: its color counts,
        // and it is taken out so the color written here is in effect.
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
        const prev = family
          .map(k => vb[camel(k)])
          .find(y => typeof y === 'string');
        // In a state, what the state shows now in the other mode: its own
        // value there, else the resting color a setting gives the variant
        // or the part (a state that does not change the color shows the
        // resting one), else the unset value.
        /** @param {Record<string, any> | undefined} rule */
        const restOf = rule =>
          family
            .map(k => rule?.[camel(k)])
            .find(y => typeof y === 'string' && !/gradient\(|url\(/i.test(y));
        const rest = s.state
          ? (exactVariantValue(target, css, name, s.state, true) ??
            restOf(theme.components[target]?.[`variant:${name}`]) ??
            plainHeld ??
            restOf(theme.components[target]?.base))
          : plainHeld;
        const from = prev ?? rest ?? x;
        if (from == null) continue;
        for (const k of family) delete vb[camel(k)];
        const half = halfOf(from, other);
        vb[camel(css)] =
          mode === 'light'
            ? `light-dark(${v}, ${half})`
            : `light-dark(${half}, ${v})`;
        // A resting color written on the variant's rule would also hide the
        // hover the variant shows unset: that hover is written back as it
        // was, in both modes, unless a hover setting of the theme's own
        // gives it one.
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
          if (hover != null && hover !== x) {
            const hb = block(
              {...s, when: `variant:${name}`, state: 'hover', mode: undefined},
              target,
            );
            hb[camel(css)] ??= hover;
          }
        }
      }
      return;
    }
    if (mode && colorFamily(prop) === 'background-color') {
      // The background shorthand and its color are one property: the one
      // the rule holds (as a color) gives the other half and is replaced, so
      // one key carries both modes.
      const held = ['backgroundColor', 'background'].find(
        k => typeof b[k] === 'string' && !/gradient\(|url\(/i.test(b[k]),
      );
      if (held && held !== camel(prop)) {
        const was = b[held];
        delete b[held];
        b[camel(prop)] ??= was;
      }
    }
    // A color for one mode under the part's own gradient does not show:
    // the result says so.
    if (
      mode &&
      colorFamily(prop) === 'background-color' &&
      ['background', 'backgroundImage'].some(
        k => typeof b[k] === 'string' && /gradient\(|url\(/i.test(b[k]),
      )
    )
      (ctx.compileNotes ??= []).push(
        `${target}${s.when ? ` ${s.when}` : ''}${s.state ? ` :${s.state}` : ''} has a background image (a gradient) over its color, so the ${mode} color does not show until that background is a color`,
      );
    if (mode) {
      const prev = b[prop];
      // The other mode keeps exactly what it had: the value set for it, the
      // part's own, else what the property shows unset (light-dark() takes
      // colors only, so never inherit).
      // A token on the part: its own value in the other mode (the base
      // theme's, else Core's), never another color.
      const otherSide = mode === 'light' ? 'dark' : 'light';
      const tokenOther = prop.startsWith('--')
        ? (base[otherSide]?.[prop] ??
          /** @type {Record<string, string>} */ (TOKENS)[prop] ??
          null)
        : null;
      const other =
        prev ??
        tokenOther ??
        baseComponent(base, ctx, target, prop, s) ??
        partDefault(ctx, target, prop, s.when, s.state) ??
        (s.state
          ? baseComponent(base, ctx, target, prop, {...s, state: undefined})
          : null) ??
        partDefault(ctx, target, prop, s.when) ??
        (/^background/.test(kebab(prop)) ? 'transparent' : 'currentcolor');
      // At the top-level comma: a mode's color may hold commas itself.
      const split = (/** @type {string} */ x, /** @type {1 | 2} */ side) => {
        const inner = /^light-dark\((.*)\)$/s.exec(x.trim())?.[1];
        const halves = inner == null ? [] : splitTop(inner, ',');
        return halves.length === 2 ? halves[side - 1].trim() : x;
      };
      b[prop] =
        mode === 'light'
          ? `light-dark(${v}, ${prev ? split(prev, 2) : other})`
          : `light-dark(${prev ? split(prev, 1) : other}, ${v})`;
    } else b[prop] = v;
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
      const at = m =>
        exactText[m] ??
        (split ? split[m === 'light' ? 1 : 2].trim() : own) ??
        base[m]['--color-text-secondary'];
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
  // A font for one role (body, heading, code) comes after the whole-theme
  // font, so the role keeps its own font whatever the order.
  const roleFont = (/** @type {Setting} */ x) => x.thing === 'font' && !!x.on;
  const ordered = [
    ...data.settings.filter(x => x.source === 'dial' && !roleFont(x)),
    ...data.settings.filter(x => x.source === 'dial' && roleFont(x)),
    ...data.settings.filter(x => x.source !== 'dial'),
  ];
  // The shell regions a setting gives a background of their own keep it
  // when the page background paints the rest of the shell.
  const regionsWithOwnBackground = new Set(
    data.settings
      .filter(
        x =>
          x.source === 'property' &&
          /^background(-color|-image)?$/.test(kebab(x.thing)),
      )
      .flatMap(x => partsOf(ctx, x)),
  );
  /** @type {Record<string, any>[]} */
  const fixedToViewport = [];
  for (const s of ordered) {
    // A setting for the mode a one-mode theme does not have stays saved but
    // does not apply (maskedSettings names it).
    if (modeOnly && s.mode && s.mode !== modeOnly) continue;
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
          for (const t of parts) {
            // A rung on a part gives what the whole-theme rung gives the
            // radius token the part reads; an exact size is as given.
            putComp(
              {...s, mode: undefined},
              t,
              'borderRadius',
              rung || pill ? derived(radiusTokenOf(ctx, t, s.when)) : `${px}px`,
            );
          }
        else
          for (const token of [
            '--radius-element',
            '--radius-inner',
            '--radius-container',
            '--radius-page',
          ])
            // The radii the build already shows for this corners value (a
            // build by an earlier editor, or a step back) are kept, as the
            // colors are: they change only when corners or the base does.
            putTok(token, ctx.keepRadii?.[token] ?? derived(token));
      } else if (PALETTE_DIALS.includes(s.thing) || s.thing === 'vibrancy') {
        // The palette mapping above sets these tokens.
      } else if (s.thing === 'font') {
        const f = fontOf(s.value);
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
        for (const t of SURFACE_PARTS.filter(x => ctx.project.target.has(x)))
          Object.assign(block({...s, mode: undefined}, t), SURFACES[s.value]);
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
        if (ctx.project.target.has('layout-content')) {
          const lc = ((theme.components['layout-content'] ??= {}).base ??= {});
          const main = (lc[':where(.astryx-app-shell [role="main"])'] ??= {});
          if (!ownBackground(main)) main.backgroundColor = 'transparent';
        }
        // Written after every setting (below), so no background shorthand
        // in the same rule resets it.
        if (/gradient\(/.test(String(s.value)))
          for (const t of ['app-shell', ...pageParts])
            fixedToViewport.push(block({...s, mode: undefined}, t));
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
        const sides =
          wrappedPadding(t, s) ??
          containerSides(t, s) ??
          cornerRadii(t, s) ??
          boxSides(t, s);
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
  for (const [k, {light, dark}] of Object.entries(tok)) {
    const l = light ?? base.light[k] ?? TOKENS[k];
    const d = dark ?? base.dark[k] ?? TOKENS[k];
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
          when: {pointer: 'coarse', width: {below: 'lg'}},
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
 * A background's layers with each color painted in one mode only: a color
 * stop becomes light-dark(<color>, transparent) for light (the reverse for
 * dark), and a layer that is a color alone becomes a gradient of it, so
 * every layer is an image the other mode does not show.
 * @param {string} value
 * @param {'light' | 'dark'} mode
 * @returns {string[]}
 */
export function maskLayers(value, mode) {
  /** @param {string} c */
  const wrap = c =>
    mode === 'light'
      ? `light-dark(${c}, transparent)`
      : `light-dark(transparent, ${c})`;
  /** @param {string} w */
  const isColor = w =>
    !/^light-dark\(/i.test(w) &&
    (isColorValue(w) || /^var\(\s*--color-/i.test(w));
  return splitTop(value, ',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(layer => {
      const fn = /^((?:repeating-)?(?:linear|radial|conic)-gradient)\(/i.exec(
        layer,
      );
      if (!fn)
        return isColor(layer)
          ? `linear-gradient(${wrap(layer)}, ${wrap(layer)})`
          : layer;
      // The gradient's own arguments, up to its closing bracket; what
      // follows (position, size, repeat) stays as it is.
      let depth = 0;
      let end = fn[0].length - 1;
      for (let i = end; i < layer.length; i++) {
        if (layer[i] === '(') depth++;
        if (layer[i] === ')' && --depth === 0) {
          end = i;
          break;
        }
      }
      const args = splitTop(layer.slice(fn[0].length, end), ',').map(arg =>
        splitTop(arg.trim(), ' ')
          .map(w => (isColor(w.trim()) ? wrap(w.trim()) : w.trim()))
          .join(' '),
      );
      return `${fn[1]}(${args.join(', ')})${layer.slice(end + 1)}`;
    });
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
  const only =
    data.mode === 'light-only'
      ? 'light'
      : data.mode === 'dark-only'
        ? 'dark'
        : null;
  for (const s of data.settings)
    if (only && s.mode && s.mode !== only)
      out.set(
        s,
        `saved for ${s.mode} mode, which a ${data.mode} theme does not have, so it does not apply`,
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
      p => !p.startsWith('--') && !p.startsWith(':'),
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
  const out = {...theme, name: `${slug}-settings`};
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
function localModuleFile(dir, spec) {
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
 * Why `<slug>.theme.ts` cannot carry the settings, or null: it must import
 * `./<slug>.settings`, extend `<camel>Settings` and keep the name, or no
 * setting takes effect.
 * @param {string} cwd
 * @param {string} slug
 * @returns {string | null}
 */
export function themeSourceProblem(cwd, slug) {
  const f = themeFiles(cwd, slug);
  if (!fs.existsSync(f.ts)) return null;
  const code = fs
    .readFileSync(f.ts, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const settings = `${camel(slug)}Settings`;
  if (
    !new RegExp(`from\\s+['"]\\./${slug}\\.settings(\\.[jt]s)?['"]`).test(code)
  )
    return `${slug}.theme.ts does not import ./${slug}.settings`;
  if (!new RegExp(`extends\\s*:\\s*${settings}\\b`).test(code))
    return `${slug}.theme.ts no longer extends ${settings}`;
  if (!new RegExp(`name\\s*:\\s*(['"\`])${slug}\\1`).test(code))
    return `${slug}.theme.ts no longer names the theme '${slug}'`;
  return null;
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
export function refuseThemeSource(cwd, slug) {
  refuseThemeParse(cwd, slug);
  const why = themeSourceProblem(cwd, slug);
  if (why)
    throw new AstryxError(
      `${why}, so settings cannot take effect. Put back the import of ${camel(slug)}Settings from './${slug}.settings', extends: ${camel(slug)}Settings and name: '${slug}' in themes/${slug}/${slug}.theme.ts (your own changes stay below them). Nothing was changed.`,
      [{name: `${P} show ${slug}`, reason: 'see the theme as it is'}],
      ERROR_CODES.ERR_THEME_INVALID,
    );
}

/**
 * Refuse a [light, dark] pair the theme's own source gives a token that is
 * not a color (a font family, a size, a weight): the build would write
 * `light-dark()`, which browsers take only for colors. The editor refuses
 * `--mode` on those tokens for the same reason.
 * @param {Ctx} ctx
 * @param {string} cwd
 * @param {string} slug
 */
function refuseOwnPairs(ctx, cwd, slug) {
  const f = themeFiles(cwd, slug);
  /** @type {string[]} */
  const bad = [];
  try {
    const ast = /** @type {any} */ (
      parseModule(fs.readFileSync(f.ts, 'utf8'), {
        sourceType: 'module',
        plugins: ['typescript'],
      })
    );
    /** @param {any} node */
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'ObjectProperty' &&
        typeof (node.key?.value ?? node.key?.name) === 'string' &&
        String(node.key?.value ?? node.key?.name).startsWith('--') &&
        node.value?.type === 'ArrayExpression' &&
        node.value.elements.length === 2 &&
        // A pair holding a value that is not text is named by the value
        // checks, with the fix for that value.
        node.value.elements.every(
          (/** @type {any} */ e) =>
            e?.type === 'StringLiteral' || e?.type === 'TemplateLiteral',
        )
      ) {
        const k = String(node.key.value ?? node.key.name);
        const type = ctx.C.typeOf(k);
        // A size given as a bare number is named by the value check, with
        // the unit it needs.
        const unitless =
          type === 'size' &&
          node.value.elements.some(
            (/** @type {any} */ e) =>
              e?.type === 'StringLiteral' && /^\d*\.?\d+$/.test(e.value.trim()),
          );
        if (type !== 'color' && !unitless) bad.push(k);
      }
      for (const v of Object.values(node))
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object' && v.type) visit(v);
    };
    visit(ast.program);
  } catch {
    return;
  }
  if (bad.length)
    throw new AstryxError(
      ownPairMessage(slug, [...new Set(bad)]),
      [
        {
          name: `grep -n -- ${quoteCommandArgument(bad[0])} ${quoteCommandArgument(`themes/${slug}/${slug}.theme.ts`)}`,
          reason: 'see the line',
        },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
}

/**
 * The tokens that are not colors the theme as it builds now gives a
 * [light, dark] pair (light-dark()), however its file writes them (a
 * constant, `as const`, `satisfies`, a spread from an imported module):
 * read from a build made into the project's cache folder, never beside the
 * theme. Empty when it does not build there (the build names that itself).
 * @param {Ctx} ctx
 * @param {string} slug
 * @returns {Promise<string[]>}
 */
export async function builtPairs(ctx, slug) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  // The build writes only inside the project: the cache folder when it is
  // there, else a hidden folder in the theme's (removed after).
  const name = `.${slug}.pairs-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const inside = !path.relative(cwd, ctx.project.cacheDir).startsWith('..');
  const dir = path.join(inside ? ctx.project.cacheDir : f.dir, name);
  const silent = logger.silent;
  logger.setSilent(true);
  try {
    fs.mkdirSync(dir, {recursive: true});
    await themeBuildForReport(
      shown(cwd, f.ts),
      {out: path.relative(cwd, path.join(dir, `${slug}.css`))},
      {cwd},
      {compact: true},
    );
    const js = fs
      .readdirSync(dir)
      .find(n => n.endsWith('.js') && !n.endsWith('.d.js'));
    if (!js) return [];
    return [...topTokensOf(path.join(dir, js))]
      .filter(
        ([k, v]) =>
          /^light-dark\(/.test(String(v ?? '')) && ctx.C.typeOf(k) !== 'color',
      )
      .map(([k]) => k);
  } catch {
    return [];
  } finally {
    logger.setSilent(silent);
    fs.rmSync(dir, {recursive: true, force: true});
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
 * Generate the theme source, build it with the theme build, then repeat any
 * part setting a more specific rule would beat and build again.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {ThemeData} data
 * @returns {Promise<{warnings: string[], lifted: string[], notes: string[]}>} `notes`: what the color config kept or replaced of a hand edit
 */
export async function buildTheme(ctx, slug, data) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  refuseThemeSource(cwd, slug);
  refuseOwnPairs(ctx, cwd, slug);
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
  // of an older base, and the pictures the editor took of an older look.
  // Only a picture the editor recorded writing, unchanged since, goes: a
  // file of the user's is never touched. Section sheets stay, marked as
  // out of date like sheet.html.
  await step(() => {
    const pictures = fs.existsSync(f.dir)
      ? fs
          .readdirSync(f.dir)
          .filter(
            n =>
              /^(sheet|preview)(-[a-z-]+)?\.png$/.test(n) &&
              editorWrote(cwd, slug, path.join(f.dir, n)),
          )
      : [];
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
          ? theme.components[x.target][x.key]?.[x.state]
          : theme.components[x.target][x.key]) ?? {},
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
  return {warnings, lifted, notes};
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
        JSON.parse(fs.readFileSync(themeFiles(cwd, slug).settings, 'utf8')),
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
    // A theme source that does not load is named by its own checks; any
    // other failure means the outputs could not be compared: built again.
    const err = /** @type {any} */ (e);
    if (err instanceof AstryxError && err.code === ERROR_CODES.ERR_THEME_LOAD)
      return null;
    return `the outputs could not be checked (${String(err?.message ?? e)
      .split('\n')[0]
      .slice(0, 160)})`;
  } finally {
    logger.setSilent(silent);
  }
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
  if (!/^\s*(import|export)\b[^;]*\bfrom\s+['"]\.\.?\//m.test(code))
    try {
      fs.mkdirSync(ctx.project.cacheDir, {recursive: true});
      fs.writeFileSync(path.join(ctx.project.cacheDir, name), source);
      copy = path.join(ctx.project.cacheDir, name);
    } catch {
      // The cache folder is not writable: use the theme folder.
    }
  /** @type {Record<string, any>} */
  let mod;
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
  const t = Object.values(mod).find(
    v => v && typeof v === 'object' && typeof v.name === 'string',
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
    return `${slug}.theme.ts gives ${name} an object (${JSON.stringify(value)}); a token value is a CSS value in quotes, such as '8px' (only a color takes a [light, dark] pair).`;
  if (kind === 'unit') {
    const n = /** @type {unknown[]} */ (value).find(
      x => typeof x === 'number' && x !== 0,
    );
    return `${slug}.theme.ts gives ${name}, a size, a [light, dark] pair with a number without a unit (${/** @type {unknown[]} */ (value).join(', ')}); a size needs one, and is the same in light and dark, so give one value, such as '${n}px'.`;
  }
  const one = Array.isArray(value)
    ? value.find(x => typeof x !== 'string')
    : value;
  const example =
    typeof one === 'number'
      ? type === 'size'
        ? `'${one}px'`
        : `'${one}'`
      : null;
  const shape = Array.isArray(value)
    ? 'a [light, dark] pair of two CSS values in quotes'
    : 'a CSS value in quotes';
  return `${slug}.theme.ts gives ${name} the value ${JSON.stringify(value)}, which is not text: a token value is ${shape}${example ? ` (such as ${Array.isArray(value) ? `[${example}, ${example}]` : example})` : ''}.`;
}

/**
 * Contrast problems this theme caused: text below 4.5:1 that was not as low
 * in the base theme. A part's own color or background setting, or a token
 * set on that part, counts for that part.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} res
 * @returns {Promise<string[]>}
 */
export async function contrastProblems(ctx, data, res) {
  const base = await baseResolved(ctx.project, data.like);
  /** @param {PaintSide} side @param {'fg' | 'bg'} which @param {string} m @param {string} [when] */
  const override = (side, which, m, when) => {
    if (!side.target) return null;
    const props =
      which === 'fg' ? ['color'] : ['background', 'background-color'];
    const hit = [...data.settings]
      .reverse()
      .find(
        x =>
          partsOf(ctx, x).includes(/** @type {string} */ (side.target)) &&
          (!x.when || x.when === when) &&
          !x.state &&
          (!x.mode || x.mode === m) &&
          ((x.source === 'property' && props.includes(x.thing)) ||
            (x.source === 'token' && side.tokens.includes(x.thing))),
      );
    return hit?.value ?? null;
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
    const split = /^light-dark\((.*),\s*([^,]*)\)$/.exec(own.trim());
    const v = split ? split[m === 'dark' ? 2 : 1].trim() : own;
    const ref = /^var\((--[\w-]+)\)$/.exec(v);
    return ref ? res[/** @type {'light' | 'dark'} */ (m)][ref[1]] : v;
  };
  /** @type {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null} */
  const ofBase = (p, side, m) => {
    const target = p[side].target;
    if (!target) return null;
    const own =
      baseComponent(
        base,
        ctx,
        target,
        side === 'fg' ? 'color' : 'backgroundColor',
        {
          when: /** @type {any} */ (p).when,
        },
      ) ??
      (side === 'bg'
        ? baseComponent(base, ctx, target, 'background', {
            when: /** @type {any} */ (p).when,
          })
        : null);
    if (!own) return null;
    const ref = /^var\((--[\w-]+)\)$/.exec(own.trim());
    return ref
      ? (res[/** @type {'light' | 'dark'} */ (m)][ref[1]] ?? null)
      : own;
  };
  /** @type {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null} */
  const value = (p, side, m) => {
    const s = p[side];
    return (
      override(s, side, m, /** @type {any} */ (p).when) ??
      // The base theme's own part style (neutral's destructive button),
      // which Core's reads do not know.
      ofBase(p, side, m) ??
      (side === 'fg' ? onTint(p, m) : null) ??
      (s.tokens.length
        ? res[/** @type {'light' | 'dark'} */ (m)][s.tokens[0]]
        : s.raw)
    );
  };
  /** @type {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null} */
  const baseValue = (p, side, m) => {
    // Lifted text on the tint is held to 4.5:1, never excused by an
    // unlifted base pair.
    if (onTint(p, m) != null) return null;
    const s = p[side];
    return s.tokens.length
      ? base[/** @type {'light' | 'dark'} */ (m)][s.tokens[0]]
      : s.raw;
  };
  // The census renders each part once, with its default props: text on a
  // part whose variants each have their own colors (a destructive button)
  // is measured per variant too, from what each variant reads.
  /** @type {TextPair[]} */
  const variantPairs = [];
  for (const p of /** @type {any} */ (ctx).parts.pairs) {
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
      variantPairs.push(
        /** @type {any} */ ({
          ...p,
          text: `${p.text} (variant ${v})`,
          when: `variant:${v}`,
          fg: {...p.fg, tokens: [fgTok]},
          bg: {...p.bg, tokens: [bgTok]},
        }),
      );
    }
  }
  const {problems, more, unchecked} = ctx.C.contrast(
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
    variantPairs,
  );
  return [
    ...problems.map(
      x =>
        `text in ${x.part} ("${x.sample}") is ${x.ratio}:1 in ${x.mode} (${x.fg} on ${x.bgPart ?? 'the page'}'s ${x.bg}); text needs 4.5:1`,
    ),
    ...(more
      ? [`and ${more} more text pair${more > 1 ? 's' : ''} below 4.5:1`]
      : []),
    // Pairs styled for one variant or state are not measured yet.
    ...(() => {
      const scoped = data.settings.filter(
        x =>
          (x.on &&
            // A variant's own colors are measured with the variant pairs.
            (x.state || (x.when && !/^variant:/.test(x.when))) &&
            (/^(color|background|background-color)$/.test(x.thing) ||
              /^--color-/.test(x.thing))) ||
          // The button style recolors the primary button only.
          (x.thing === 'buttons' && ['soft', 'outline'].includes(x.value)),
      );
      return scoped.length
        ? [
            `not checked: text contrast for ${scoped
              .slice(0, 3)
              .map(describe)
              .join(
                '; ',
              )}${scoped.length > 3 ? ` and ${scoped.length - 3} more` : ''}, set for one variant or state`,
          ]
        : [];
    })(),
    ...(unchecked.length
      ? [
          `not checked: text on or in ${unchecked.slice(0, 3).join(', ')}${unchecked.length > 3 ? ` and ${unchecked.length - 3} more` : ''}, which the editor cannot read as one fixed color`,
        ]
      : []),
  ];
}

/**
 * Settings file text as data, or null when there is none or it is damaged.
 * @param {string | null} text
 * @returns {ThemeData | null}
 */
function parseSettings(text) {
  if (text == null) return null;
  try {
    const data = JSON.parse(text);
    return settingsShapeOk(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Whether every settings entry has the parts the editor reads (a thing, a
 * value and a source); one without is damage `new` keeps aside.
 * @param {any} data
 */
export function settingsEntriesOk(data) {
  return (
    settingsShapeOk(data) &&
    data.settings.every(
      (/** @type {any} */ s) =>
        s &&
        typeof s.thing === 'string' &&
        'value' in s &&
        ['dial', 'token', 'property'].includes(s.source),
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
    b = states.includes(s.state)
      ? t[s.when == null ? s.state : `${s.when}+${s.state}`]
      : (b?.[stateKey(s.state, wrapsOneControl(ctx, target))] ??
        b?.[stateKey(s.state)] ??
        b?.[`:${s.state}`]);
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
  if (state !== 'disabled') return `:${state}`;
  return wrapsControl
    ? ':is(:disabled,[aria-disabled="true"],:has(:is(input,button,select,textarea):is(:disabled,[aria-disabled="true"])))'
    : ':is(:disabled,[aria-disabled="true"])';
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
  try {
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!settingsShapeOk(data)) return text;
    return `${JSON.stringify({...data, built: {radii}}, null, 2)}\n`;
  } catch {
    return text;
  }
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
 * Whether a name in a theme folder is a file the editor writes: the
 * theme's generated files, settings, history, picture record, pages and
 * pictures, and its color config.
 * @param {string} slug
 * @param {string} n
 */
export const isEditorFile = (slug, n) =>
  EDITOR_SUFFIXES.some(x => n === `${slug}.${x}`) ||
  /^(preview(-[a-z]+)?\.(html|png)|sheet(-[a-z-]+)?\.(html|png)|palette\.config(\.damaged(-\d+)?)?\.json)$/.test(
    n,
  );

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
  const mine = (/** @type {string} */ n) => isEditorFile(slug, n);
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
 * failure does not stop the rest.
 * @param {Map<string, Buffer>} was the bytes before, for each file written
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
      const old = was.get(p);
      if (old) {
        // A folder the change removed (tokens/ once its palette went) comes
        // back with the file.
        fs.mkdirSync(path.dirname(p), {recursive: true});
        writeWhole(p, old);
      } else fs.rmSync(p, {force: true});
    } catch {
      failed.push(path.basename(p));
    }
  }
  return {failed, skipped};
}

/**
 * The bytes of every regular file under `dir`, for putting back what a
 * failed change wrote.
 * @param {string} dir
 * @returns {Map<string, Buffer>}
 */
function snapshotDir(dir) {
  /** @type {Map<string, Buffer>} */
  const out = new Map();
  for (const p of hashDir(dir).keys()) out.set(p, fs.readFileSync(p));
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
  // user's (notes, a mockup) is theirs, and is left alone.
  const own = (/** @type {string} */ n) =>
    isEditorFile(slug, n) || n === `${slug}.theme.ts` || n === 'tokens';
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
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        like: data.like ?? null,
        mode: data.mode,
        settings: data.settings,
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
    ? [pal.palette, pal.refs, pal.receipt].map(p => path.join(cwd, p))
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
      return (
        typeof x === 'string' &&
        Array.isArray(JSON.parse(x.replace(/^\uFEFF/, '')).settings)
      );
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
  refuseThemeSource(cwd, slug);
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
    JSON.stringify({...a, lifted: undefined}) ===
      JSON.stringify({...data, lifted: undefined});
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
      res: {light: {}, dark: {}},
      problems: [],
      warnings: [],
      lifted: [],
      notes,
      unchanged: true,
    };
  // With no last build (deleted, never committed), nothing is compared.
  if (snapBefore && !fs.existsSync(f.js))
    notes.push(
      `there was no last build (${path.basename(f.js)} is missing), so the token changes are not listed; the theme is built again`,
    );
  const resBefore =
    snapBefore && fs.existsSync(f.js)
      ? await resolvedTokens(ctx, slug).catch(() => {
          // The last build is damaged: the change still stands, and the
          // result says why it lists no token changes.
          notes.push(
            `the last build (${path.basename(f.js)}) could not be read, so the token changes are not listed; the theme is built again`,
          );
          return null;
        })
      : null;
  const before = parseSettings(snapBefore);
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
  const moduleNow = fs.existsSync(f.settingsTs)
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
  /** @type {{warnings: string[], lifted: string[], notes: string[]}} */
  let built;
  // The token loops the last build had, so a change that adds one (through
  // tokens the own source sets in a way no read of the file follows) is
  // refused once the build shows it.
  const loopsBefore = new Set(builtLoops(cwd, slug).map(l => l.key));
  // The app copy is written once the change is saved, never before.
  afterSave.add(ctx);
  try {
    refuseIfLockLost();
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
      writeWhole(f.settings, `${JSON.stringify(data, null, 2)}\n`);
      if (historyAfter)
        writeWhole(
          f.history,
          JSON.stringify(historyAfter.slice(-HISTORY_STEPS)),
        );
      else if (snapBefore && history && !noop)
        writeWhole(
          f.history,
          JSON.stringify(
            [...past, withBuilt(snapBefore, radiiNow)].slice(-HISTORY_STEPS),
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
  let problems = [];
  try {
    res = await resolvedTokens(ctx, slug);
    const modes = modesOf(data);
    if (resBefore) {
      /** @param {unknown} a @param {unknown} b */
      const same = (a, b) =>
        String(a).toLowerCase() === String(b).toLowerCase();
      // Both modes are compared: a theme that becomes one-mode changes what
      // the other mode's visitors see, though it no longer has that mode.
      for (const m of /** @type {const} */ (['light', 'dark'])) {
        const own = modes.includes(m);
        for (const k of Object.keys(res[m])) {
          // A change of letter case alone (#FFFFFF, #ffffff) is no change.
          if (same(resBefore[m][k], res[m][k])) continue;
          const modal = MODAL.has(ctx.C.typeOf(k));
          if (!modal && m === 'dark') continue;
          // A one-mode theme writes its mode on both sides: the other side
          // that moved with it says nothing new, and a setting made for the
          // mode it dropped (and what reads it) is named as not applied
          // instead.
          if (
            modal &&
            !own &&
            ((same(resBefore[m][k], resBefore[modes[0]][k]) &&
              same(res[m][k], res[modes[0]][k])) ||
              data.settings.some(
                x =>
                  x.source === 'token' &&
                  x.mode === m &&
                  (x.thing === k || same(x.value, resBefore[m][k])),
              ))
          )
            continue;
          changed.push(
            `${k}${modal && (modes.length > 1 || !own) ? ` (${m})` : ''}: ${resBefore[m][k]} -> ${res[m][k]}`,
          );
        }
      }
    }
    problems = await contrastProblems(ctx, data, res);
    // What cannot be measured is a note, not a problem.
    notes.push(...problems.filter(x => x.startsWith('not checked')));
    problems = problems.filter(x => !x.startsWith('not checked'));
  } catch (e) {
    ctx.unchecked ??= `checking it failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return {
    changed,
    res,
    problems,
    warnings: built.warnings,
    lifted: built.lifted.filter(x => !liftedBefore.has(x)),
    notes,
    unchanged: false,
  };
}

/** @param {Ctx} ctx @param {ThemeData} data */
export function fontPackages(ctx, data) {
  /** @type {Array<{pkg: string, family: string, installed: boolean, of: Setting}>} */
  const out = [];
  /** @param {string} pkg */
  const isInstalled = pkg => {
    try {
      ctx.project.req.resolve(`${pkg}/package.json`);
      return true;
    } catch {
      return false;
    }
  };
  for (const s of data.settings) {
    if (s.thing !== 'font') continue;
    const {pkg: known, family} = fontOf(s.value);
    const name = family.replace(/["']/g, '');
    // An installed @fontsource package of the family always loads it, even
    // for a family some systems ship.
    const own = `@fontsource/${name.toLowerCase().replace(/\s+/g, '-')}`;
    const pkg = known ?? (isInstalled(own) ? own : null);
    if (!pkg || out.some(x => x.pkg === pkg)) continue;
    out.push({pkg, family: name, installed: isInstalled(pkg), of: s});
  }
  return out;
}

export {partDefault};
