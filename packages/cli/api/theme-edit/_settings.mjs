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

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {AstryxError} from '../error.mjs';
import {logger} from '../logger.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {themeBuildForReport} from '../theme/build/build.mjs';
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
} from './_tables.mjs';
import {
  alphaOf,
  compositeOver,
  isColorValue,
  isSafeValue,
  parseColor,
  ratio,
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
  writeWhole,
} from './_palette.mjs';
import {MODAL, isColorToken} from './_compiler.mjs';
import {baseResolved, baseThemeFile} from './_project.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';

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

/** @typedef {{project: import('./_project.mjs').ThemeProject, C: import('./_compiler.mjs').Compiler, unchecked?: string | null, uncheckedCode?: string | null, wrote?: Map<string, string | null>, base?: {light: Record<string, string>, dark: Record<string, string>, components?: Record<string, any>}}} Ctx */
/** @typedef {import('./_parts.mjs').PaintSide} PaintSide */
/** @typedef {import('./_parts.mjs').TextPair} TextPair */

/** What a theme name may be, in words. */
export const NAME_RULE =
  'lowercase letters, digits and dashes, starting with a letter, 64 characters at most';

/** A theme name: lowercase letters, digits and dashes, starting with a letter, 64 characters at most. @param {string} s */
export const slugOk = s =>
  typeof s === 'string' && s.length <= 64 && /^[a-z][a-z0-9-]*$/.test(s);
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
    sheetPng: path.join(dir, 'sheet.png'),
  };
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
  return [...list]
    .filter(c => c.length > 2)
    .map(
      c =>
        /** @type {[string, number]} */ ([
          c,
          c.includes(x) || x.includes(c) ? 1 : levenshteinDistance(x, c),
        ]),
    )
    .filter(([, s]) => s <= Math.max(2, Math.floor(x.length / 3)))
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
  if (!slugOk(slug)) {
    // A path or a capital letter typed for a theme that exists names it.
    const plain = String(slug ?? '')
      .toLowerCase()
      .replace(/^.*themes[\\/]/, '')
      .replace(/[\\/].*$/, '');
    const same =
      slugOk(plain) && fs.existsSync(themeFiles(cwd, plain).settings)
        ? plain
        : null;
    refuse(
      ERROR_CODES.ERR_INVALID_ARGUMENT,
      `"${String(slug ?? '').slice(0, 80)}" is not a theme name (${NAME_RULE}).`,
      same
        ? {didYouMean: [same], run: [`${P} show ${same}`]}
        : {run: [`${P} new my-theme`]},
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
    // A `new` that was stopped part way left its marker: `new` finishes it.
    if (!same && fs.existsSync(path.join(f.dir, '.astryx-new.json')))
      refuse(
        ERROR_CODES.ERR_UNKNOWN_THEME,
        `themes/${slug} was left by a \`new\` that was stopped part way, so it has no settings yet. Run new again to finish it.`,
        {run: [`${P} new ${slug}`]},
      );
    if (!same && (other || LIKE.includes(slug)))
      refuse(
        ERROR_CODES.ERR_UNKNOWN_THEME,
        `${other ? `${other[1]} is a theme the editor did not make (written by hand, or ejected)` : `${slug} is a built-in theme`}, so the editor does not change it. Make an editor theme with its own name instead${LIKE.includes(slug) ? `, on top of ${slug}` : ''}.`,
        {
          run: [
            `${P} new my-${slug}${LIKE.includes(slug) ? ` --like ${slug}` : ''}`,
          ],
        },
      );
    refuse(
      ERROR_CODES.ERR_UNKNOWN_THEME,
      `There is no theme "${slug}" made by this command (no themes/${slug}/${slug}.settings.json).`,
      {
        didYouMean: same ? [same] : nearest(slug, have),
        run: same ? [`${P} show ${same}`] : [`${P} new ${slug}`],
      },
    );
  }
  refuseLinks(cwd, slug);
  // undo is offered only when there is a step to go back to.
  const steps = readHistory(f.history).steps.length;
  const recover = steps
    ? {
        text: `, or step back to the settings before the last change with ${P} undo ${slug} (the last change is then lost)`,
        run: [{name: `${P} undo ${slug}`, reason: 'do this instead'}],
      }
    : {text: '; there is no earlier step to go back to', run: []};
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(
      fs.readFileSync(f.settings, 'utf8').replace(/^\uFEFF/, ''),
    );
  } catch (e) {
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json is not valid JSON (${e instanceof Error ? e.message : String(e)}). Fix it by hand${recover.text}.`,
      recover.run,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
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
  const bad = problem ? badSetting(data) : null;
  if (problem && bad && settingsProblem(data, bad.thing) !== problem) {
    // A value it takes, for a dial; a color for a color token.
    const example = DIALS[bad.thing]
      ? DIALS[bad.thing].values.split('|').find(w => !w.startsWith('<'))
      : isColorToken(bad.thing)
        ? '#1f2937'
        : null;
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json: ${problem}, a value the editor no longer accepts. Remove or change that setting; nothing else needs to change. Nothing was changed.`,
      [
        {name: `${P} undo ${slug} ${undoArgs(bad)}`, reason: 'do this instead'},
        ...(example
          ? [
              {
                name: `${P} set ${slug} ${undoArgs(bad).replace(bad.thing, `${bad.thing} ${quoteCommandArgument(example)}`)}`,
                reason: 'or give it a value it takes',
              },
            ]
          : []),
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  // A bad mode or base is fixed by setting it.
  const fieldFix = /^(it has no mode|mode ")/.test(problem ?? '')
    ? `${P} set ${slug} mode both`
    : /^base "/.test(problem ?? '')
      ? `${P} set ${slug} base none`
      : null;
  if (problem)
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json: ${problem}. ${fieldFix ? 'Set it again' : `Fix it by hand${recover.text}`}. Nothing was changed.`,
      fieldFix
        ? [{name: fieldFix, reason: 'do this instead'}, ...recover.run]
        : recover.run,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  return data;
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
  // `set <theme> mode` and `set <theme> base` fix their own field.
  const fixing = typeof skip === 'string' ? skip : skip?.thing;
  const field = fixing === 'mode' || fixing === 'base';
  if (!field && !['both', 'light-only', 'dark-only'].includes(data.mode))
    return data.mode == null
      ? 'it has no mode'
      : `mode "${data.mode}" is not both, light-only or dark-only`;
  if (!field && data.like != null && !LIKE.includes(data.like))
    return `base "${data.like}" is not a built-in theme (${LIKE.join(', ')})`;
  if (!Array.isArray(data.settings)) return 'settings is not a list';
  const keys = new Set();
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
    if (keys.has(key)) return `${describe(s)} is listed twice`;
    keys.add(key);
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
function valueProblem(s) {
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
 * What is wrong with where a setting applies, or null: names only, as
 * `set` takes them.
 * @param {any} s
 * @returns {string | null}
 */
function scopeProblem(s) {
  if (s.on != null && !/^[a-z][a-z0-9-]*$/.test(s.on))
    return `${s.thing} is set on "${s.on}", which is not a part or group name`;
  if (s.state != null && !/^[a-z][a-z-]*$/.test(s.state))
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
    s.axis ?? '',
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
  const m = /^\s*(-?\d+(?:\.\d+)?|-?\.\d+)\s*(px|rem|em)?\s*$/i.exec(String(v));
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
  const family = unquote(parts[0] ?? v);
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
 * A font family name as CSS reads it. A name that is a sequence of CSS
 * identifiers stays bare; any other is quoted, or the browser drops the
 * whole font (`3Dumb`, `My/Font`, `a.b`). Core quotes a family that has
 * a space itself, so such a name is quoted here only as a fallback
 * (`spaced`), where Core writes the list as given.
 * @param {string} name without quotes
 * @param {boolean} [spaced]
 */
export function cssFamily(name, spaced = false) {
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
 * The settings, as a `defineTheme` object.
 * @param {Ctx} ctx
 * @param {ThemeData} data
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @returns {any}
 */
export function compileTheme(ctx, data, base) {
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
  /** @type {Record<string, {light?: string, dark?: string}>} */
  const tok = {};
  /** @param {string} name @param {string | [string, string]} v @param {string} [mode] */
  const putTok = (name, v, mode) => {
    const t = (tok[name] ??= {});
    // A one-mode theme writes the value of its mode to both sides.
    if (Array.isArray(v) && modeOnly) {
      t.light = t.dark = v[modeOnly === 'light' ? 0 : 1];
      return;
    }
    if (Array.isArray(v)) {
      if (!mode || mode === 'light') t.light = v[0];
      if (!mode || mode === 'dark') t.dark = v[1];
      return;
    }
    if (!MODAL.has(ctx.C.typeOf(name)) || modeOnly || !mode) {
      t.light = v;
      t.dark = v;
      return;
    }
    t[/** @type {'light' | 'dark'} */ (mode)] = v;
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
      else b = b[`:${s.state}`] ??= {};
    }
    return b;
  };
  /** @param {Setting} s @param {string} target @param {string} prop @param {string} v */
  const putComp = (s, target, prop, v) => {
    const b = block(s, target);
    if (s.mode && !modeOnly) {
      const prev = b[prop];
      // The other mode keeps exactly what it had: the value set for it, the
      // part's own, else what the property shows unset (light-dark() takes
      // colors only, so never inherit).
      const other =
        prev ??
        baseComponent(base, ctx, target, prop, s) ??
        partDefault(ctx, target, prop, s.when, s.state) ??
        (s.state
          ? baseComponent(base, ctx, target, prop, {...s, state: undefined})
          : null) ??
        partDefault(ctx, target, prop, s.when) ??
        (/^background/.test(kebab(prop)) ? 'transparent' : 'currentcolor');
      const split = (/** @type {string} */ x, /** @type {1 | 2} */ side) =>
        x.replace(/^light-dark\((.*),\s*(.*)\)$/, `$${side}`);
      b[prop] =
        s.mode === 'light'
          ? `light-dark(${v}, ${prev ? split(prev, 2) : other})`
          : `light-dark(${prev ? split(prev, 1) : other}, ${v})`;
    } else b[prop] = v;
  };
  // Palette stops go first, so an exact token setting always wins over them.
  const pal = paletteMapping(ctx.project.cwd, data.name, data, base, TOKENS);
  for (const [k, v] of Object.entries(pal?.tokens ?? {}))
    putTok(k, [v.light.color, v.dark.color]);
  // Secondary text lifted on the parts the official neutral theme lifts it
  // on, each for what it sits on. It is written into the very block the
  // base theme lifts it in, so it replaces the base's lift. A setting of it
  // on the part (no --when or --state) wins there, per mode, so a numbered
  // citation shows what `--on citation` set.
  for (const [target, key, ground] of pal?.lift ? LIFT_PARTS : []) {
    const lift = pal?.lift?.[ground];
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
      liftValue(value, modeOnly);
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
            const token = /^var\((--radius-[\w-]+)\)$/.exec(
              partDefault(ctx, t, 'borderRadius', s.when) ?? '',
            )?.[1];
            putComp(
              {...s, mode: undefined},
              t,
              'borderRadius',
              rung || pill ? derived(token ?? '--radius-element') : `${px}px`,
            );
          }
        else
          for (const token of [
            '--radius-element',
            '--radius-inner',
            '--radius-container',
            '--radius-page',
          ])
            putTok(token, derived(token));
      } else if (PALETTE_DIALS.includes(s.thing) || s.thing === 'vibrancy') {
        // The palette mapping above sets these tokens.
      } else if (s.thing === 'font') {
        const f = fontOf(s.value);
        theme.typography ??= {};
        for (const r of s.on ? [s.on] : ['body', 'heading'])
          theme.typography[r] = {
            ...(theme.typography[r] ?? {}),
            family: f.family,
            fallbacks: f.fallbacks,
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
        for (const [k, core] of Object.entries(
          /** @type {Record<string, string>} */ (TOKENS),
        )) {
          const v = base.light[k] ?? core;
          let nv = null;
          if (/^--spacing-/.test(k) && /rem$/.test(v))
            nv = `${Number((parseFloat(v) * f).toFixed(3))}rem`;
          // A control never gets smaller than 24px, the smallest target a
          // pointer can use comfortably.
          if (/^--size-element-/.test(k) && /px$/.test(v))
            nv = `${Math.max(Math.min(24, parseFloat(v)), Math.round(parseFloat(v) * f))}px`;
          if (nv === null) continue;
          if (parts.length) for (const t of parts) block(s, t)[k] = nv;
          else putTok(k, nv);
        }
      }
    } else if (s.source === 'token') {
      if (parts.length) for (const t of parts) putComp(s, t, s.thing, s.value);
      else putTok(s.thing, s.value, s.mode);
    } else if (s.source === 'property') {
      for (const t of parts) putComp(s, t, camel(s.thing), s.value);
    }
  }
  // A one-mode theme looks the same whatever the system asks for: every
  // color the theme does not set takes its mode's value from the base (or
  // Core) on both sides.
  if (modeOnly)
    for (const k of Object.keys(/** @type {Record<string, string>} */ (TOKENS)))
      if (MODAL.has(ctx.C.typeOf(k)) && !tok[k]) {
        const v = base[modeOnly]?.[k];
        if (v && !/var\(/.test(v)) putTok(k, v);
      }
  // A scale steeper than the standard one enlarges the headings; the steps
  // below the base text size keep the standard ratio, so small text stays
  // readable. An exact token setting still wins.
  const scale = theme.typography?.scale;
  if (scale && scale.ratio > STANDARD_RATIO)
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
    theme.tokens[k] = l === d ? l : [l, d];
  }
  // Base themes set the type tokens again for phones (a coarse pointer
  // below the lg width); an exact font family is written there too, so it
  // applies on every screen. Sizes are not: phones keep their reading base.
  const phone = Object.fromEntries(
    data.settings
      .filter(
        x =>
          x.source === 'token' &&
          !x.on &&
          !x.mode &&
          // Families only: phones keep their own reading sizes.
          /^--font-family/.test(x.thing) &&
          !(modeOnly && x.mode && x.mode !== modeOnly),
      )
      .map(x => [x.thing, x.value]),
  );
  if (Object.keys(phone).length)
    theme.adaptations = {
      rules: [
        {
          when: {pointer: 'coarse', width: {below: 'lg'}},
          value: {tokens: phone},
        },
      ],
    };
  if (!Object.keys(theme.tokens).length) delete theme.tokens;
  if (!Object.keys(theme.components).length) delete theme.components;
  return theme;
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
 * @returns {Map<Setting, string>}
 */
export function maskedSettings(data) {
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
 * @returns {Array<{target: string, key: string, prop: string, value: string}>}
 */
export function findOverrides(cssText, theme) {
  /** @type {Array<{target: string, key: string, prop: string, value: string}>} */
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
    // (background after background-color) is the one in effect.
    // border-radius, border-collapse and border-spacing are not part of
    // border.
    const NOT_LONGHAND =
      /^border-(radius|collapse|spacing)|^border-[a-z]+-radius$/;
    /** @param {string} a @param {string} b */
    const sameProperty = (a, b) => {
      const [x, y] = [kebab(a), kebab(b)];
      if (NOT_LONGHAND.test(x) || NOT_LONGHAND.test(y)) return x === y;
      return x.startsWith(`${y}-`) || y.startsWith(`${x}-`) || x === y;
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
 */
function settingsSource(slug, data, theme, pal, cwd = '') {
  const like = data.like;
  const REF = '@@palette:';
  /** @param {string} family @param {'light' | 'dark'} m @param {import('./_palette.mjs').StopRef} r */
  const refOf = (family, m, r) =>
    r.family === 'black' || r.family === 'white'
      ? `${REF}${r.family}`
      : `${REF}${r.family ?? family}.${m}.${r.stop}${r.alpha ? `+${r.alpha}` : ''}`;
  const out = {...theme, name: `${slug}-settings`};
  const only =
    data.mode === 'light-only'
      ? 'light'
      : data.mode === 'dark-only'
        ? 'dark'
        : null;
  if (pal && theme.tokens) {
    out.tokens = {...theme.tokens};
    for (const [k, v] of Object.entries(pal.tokens)) {
      const now = theme.tokens[k];
      // A one-mode theme reads one shade, its mode's, on both sides.
      if (only) {
        if (now === v[only].color)
          out.tokens[k] = refOf(v.family, only, v[only]);
        continue;
      }
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
      const literal = liftValue(lift, only);
      /** A shade of the neutral palette as a reference; a color as it is. @param {'light' | 'dark'} m */
      const one = m => {
        const r = /** @type {any} */ (lift[m]);
        return r.family === 'literal' ? r.color : refOf('neutral', m, r);
      };
      const refs = only
        ? one(only)
        : `light-dark(${one('light')}, ${one('dark')})`;
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
  return [
    `// Generated by \`${P}\` from ${slug}.settings.json on every change: do not edit.`,
    `// Built from settings ${settingsStamp(data)}.`,
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
  ].join('\n');
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
 * Refuse a build whose theme source cannot carry the settings, naming the
 * lines that put it back.
 * @param {string} cwd
 * @param {string} slug
 */
export function refuseThemeSource(cwd, slug) {
  const why = themeSourceProblem(cwd, slug);
  if (why)
    throw new AstryxError(
      `${why}, so settings cannot take effect. Put back the import of ${camel(slug)}Settings from './${slug}.settings', extends: ${camel(slug)}Settings and name: '${slug}' in themes/${slug}/${slug}.theme.ts (your own changes stay below them). Nothing was changed.`,
      [{name: `${P} show ${slug}`, reason: 'see the theme as it is'}],
      ERROR_CODES.ERR_THEME_INVALID,
    );
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
  if (data.like) baseThemeFile(ctx.project, data.like);
  const base = await baseResolved(ctx.project, data.like);
  const theme = compileTheme(ctx, data, base);
  const pal = paletteMapping(
    cwd,
    slug,
    data,
    base,
    ctx.project.core.tokenDefaults,
  );
  fs.mkdirSync(f.dir, {recursive: true});
  // Each write is recorded for a rollback; the time between them is not.
  /** @type {<T>(fn: () => T) => Promise<Awaited<T>>} */
  const step = fn => track(f.dir, ctx.wrote ?? new Map(), fn);
  /** @type {string[]} */
  let notes = [];
  await step(() => {
    notes = syncPalette(cwd, slug, data, base);
    writeAtomic(f.settingsTs, settingsSource(slug, data, theme, pal, cwd));
    syncPaletteRefs(cwd, slug, fs.readFileSync(f.settingsTs, 'utf8'), pal);
    if (!fs.existsSync(f.ts)) writeAtomic(f.ts, themeModuleSource(slug));
  });
  // Files an earlier build wrote that this one may not: the variants types
  // of an older base, and section sheets of an older look.
  await step(() => {
    for (const file of [
      path.join(f.dir, `${slug}.variants.d.ts`),
      ...(fs.existsSync(f.dir)
        ? fs
            .readdirSync(f.dir)
            // Section sheets, and every picture: all show the look before
            // this build. The full sheet and the preview page are written
            // again by the commands that make them.
            .filter(n =>
              /^(sheet-[a-z-]+\.html|(sheet|preview)(-[a-z-]+)?\.png)$/.test(n),
            )
            .map(n => path.join(f.dir, n))
        : []),
    ])
      fs.rmSync(file, {force: true});
  });
  let receipt = await step(() => runBuild(ctx, slug));
  const found = findOverrides(fs.readFileSync(f.css, 'utf8'), theme).filter(
    x => !(theme.components[x.target][x.key] ?? {})[x.prop],
  );
  /** @type {string[]} */
  const lifted = [];
  if (found.length) {
    for (const x of found) {
      const t = theme.components[x.target];
      (t[x.key] ??= {})[x.prop] ??= x.value;
      lifted.push(`${x.target} ${x.key} ${kebab(x.prop)}`);
    }
    await step(() => {
      writeAtomic(f.settingsTs, settingsSource(slug, data, theme, pal, cwd));
      syncPaletteRefs(cwd, slug, fs.readFileSync(f.settingsTs, 'utf8'), pal);
    });
    receipt = await step(() => runBuild(ctx, slug));
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
  return {warnings, lifted, notes};
}

/** @param {Ctx} ctx @param {string} slug @returns {Promise<any>} */
async function runBuild(ctx, slug) {
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
    );
    return receipt;
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
  const out = {
    light: core.resolveThemeTokens(t, {mode: 'light'}),
    dark: core.resolveThemeTokens(t, {mode: 'dark'}),
  };
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
          `not checked: text on or in ${unchecked.slice(0, 3).join(', ')}${unchecked.length > 3 ? ` and ${unchecked.length - 3} more` : ''}, which ${unchecked.length === 1 ? 'is' : 'are'} not a fixed color`,
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
    return JSON.parse(text);
  } catch {
    return null;
  }
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
      : b?.[`:${s.state}`];
  }
  const v = b?.[prop];
  return typeof v === 'string' ? v : null;
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
  if (token === '--radius-inner')
    return pill ? 6 : Math.round(px * Math.min(1, ratio(token, 0.6)));
  if (token === '--radius-container')
    return Math.round(
      pill
        ? Math.max(24, 1.5 * roundPx * ratio(token, 1.25))
        : px * ratio(token, 1.25),
    );
  if (token === '--radius-page')
    return Math.round(
      pill
        ? Math.max(32, 1.5 * roundPx * ratio(token, 2.5))
        : px * ratio(token, 2.5),
    );
  return pill ? 9999 : px;
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
];

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
  const mine = (/** @type {string} */ n) =>
    EDITOR_SUFFIXES.some(x => n === `${slug}.${x}`) ||
    /^(preview(-[a-z]+)?\.(html|png)|sheet(-[a-z-]+)?\.(html|png)|palette\.config(\.damaged(-\d+)?)?\.json)$/.test(
      n,
    );
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
      if (old) writeWhole(p, old);
      else fs.rmSync(p, {force: true});
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
    if (fs.lstatSync(p, {throwIfNoEntry: false})?.isSymbolicLink())
      throw new AstryxError(
        `${path.relative(cwd, p) || p} is a link; the editor writes a theme's own files only, never through a link. Replace the link with a copy of what it points to. Nothing was changed.`,
        [
          {
            name: `cp -rL ${quoteCommandArgument(path.relative(cwd, p))} ${quoteCommandArgument(`${path.relative(cwd, p)}.copy`)}`,
            reason: 'copy what it points to, then put the copy in its place',
          },
        ],
        ERROR_CODES.ERR_THEME_INVALID,
      );
  };
  link(f.root);
  link(f.dir);
  /** @param {string} d */
  const walk = d => {
    if (!fs.lstatSync(d, {throwIfNoEntry: false})?.isDirectory()) return;
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, e.name);
      link(p);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(f.dir);
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
 * Whether the theme's build was made, whole, from these settings by this
 * CLI (a command stopped mid-build, or settings edited by hand, leave it
 * behind).
 * @param {string} cwd
 * @param {string} slug
 * @param {ThemeData} data
 */
export function buildCurrent(cwd, slug, data) {
  return staleBuild(cwd, slug, data) == null;
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
  // The generated colors are part of the build when a color dial is set.
  const colors = data.settings.some(
    s => s.source === 'dial' && PALETTE_DIALS.includes(s.thing),
  )
    ? [path.join(cwd, paletteFiles(slug).palette)]
    : [];
  const missing = [f.js, f.css, f.settingsTs, ...colors].find(
    p => !fs.existsSync(p),
  );
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
  if (
    !ts.trimEnd().endsWith('});') ||
    fs.statSync(f.css).mtimeMs < fs.statSync(f.settingsTs).mtimeMs - 1000
  )
    return 'the last build did not finish (a command stopped while building)';
  return null;
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

/** @param {string} dir */
function removeIfEmpty(dir) {
  try {
    fs.rmdirSync(dir);
  } catch {
    // Not empty, or gone already.
  }
}

/** The undo steps a theme keeps; older ones are dropped. */
export const HISTORY_STEPS = 80;

/**
 * Write a file whole: a new file beside it, renamed into place.
 * @param {string} file
 * @param {string} text
 */
export function writeAtomic(file, text) {
  writeWhole(file, text);
}

/**
 * A theme's undo history: the settings text before each change, oldest
 * first, and how many damaged steps were dropped. Every step after the
 * last damaged one is kept.
 * @param {string} file
 * @returns {{steps: string[], dropped: number}}
 */
export function readHistory(file) {
  if (!fs.existsSync(file)) return {steps: [], dropped: 0};
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
 * @param {{history: boolean, historyAfter?: string[]}} options
 *   `historyAfter`: the history to write with the change (a step back pops it)
 */
export async function commitTheme(ctx, slug, data, {history, historyAfter}) {
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
  if (history && same(parseSettings(snapBefore)) && fs.existsSync(f.js))
    return {
      changed: [],
      res: {light: {}, dark: {}},
      problems: [],
      warnings: [],
      lifted: [],
      notes,
      unchanged: true,
    };
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
  const liftedBefore = new Set(before?.lifted ?? []);
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
  try {
    built = await buildTheme(ctx, slug, data);
    data.lifted = built.lifted;
    // The undo step and the settings are part of the change: written whole,
    // inside the rollback, the settings first. A command stopped between
    // the two leaves the change saved with the history one step short (or,
    // for an undo, a top step equal to the settings, which undo skips),
    // never a step that undoes nothing or a lost step.
    await track(f.dir, wrote, () => {
      writeAtomic(f.settings, `${JSON.stringify(data, null, 2)}\n`);
      if (historyAfter)
        writeAtomic(
          f.history,
          JSON.stringify(historyAfter.slice(-HISTORY_STEPS)),
        );
      else if (snapBefore && history)
        writeAtomic(
          f.history,
          JSON.stringify([...past, snapBefore].slice(-HISTORY_STEPS)),
        );
    });
  } catch (e) {
    const {failed, skipped} = restoreWritten(was, wrote);
    removeIfEmpty(path.join(f.dir, 'tokens'));
    if (dirMade) removeIfEmpty(f.dir);
    if (rootMade) removeIfEmpty(f.root);
    if (failed.length || skipped.length)
      throw new AstryxError(
        `The change failed (${e instanceof Error ? e.message.split('\n')[0] : String(e)}). ${failed.length ? `These files could not be put back: ${failed.join(', ')}. ` : ''}${skipped.length ? `These files changed while it ran, so they were left as they are: ${skipped.join(', ')}. ` : ''}Run ${P} show ${slug} to rebuild from the settings.`,
        [{name: `${P} show ${slug}`, reason: 'do this next'}],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    const code = /** @type {any} */ (e)?.code;
    if (['EACCES', 'EPERM', 'ENOSPC', 'EROFS', 'EIO', 'EISDIR'].includes(code))
      throw new AstryxError(
        `Could not write the theme files (${code}), so the change was undone. Free space or fix the permission, then run the command again.`,
        [],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    // The color config's own refusals already name the file and the fix.
    if (
      e instanceof AstryxError &&
      (e.code === ERROR_CODES.ERR_UNKNOWN_THEME ||
        e.code === ERROR_CODES.ERR_THEME_INVALID ||
        e.code === ERROR_CODES.ERR_PALETTE_GENERATION ||
        e.code === ERROR_CODES.ERR_WRITE_FAILED)
    )
      throw e;
    const why = (e instanceof Error ? e.message : String(e))
      .split(`${cwd}${path.sep}`)
      .join('')
      .replace(/\s*Make sure all imports[^|]*$/s, '')
      .split('\n')
      .slice(0, 3)
      .join(' | ');
    const own = why.includes(path.basename(f.ts));
    throw new AstryxError(
      `The theme did not build, so the change was undone: ${why}${own ? ` (${shown(cwd, f.ts)} is your own file: fix it, then run the command again)` : ''}`,
      [
        {
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
      for (const m of modes) {
        for (const k of Object.keys(res[m])) {
          // A change of letter case alone (#FFFFFF, #ffffff) is no change.
          if (
            String(resBefore[m][k]).toLowerCase() ===
            String(res[m][k]).toLowerCase()
          )
            continue;
          const modal = MODAL.has(ctx.C.typeOf(k));
          if (!modal && m === 'dark' && modes.length > 1) continue;
          changed.push(
            `${k}${modal && modes.length > 1 ? ` (${m})` : ''}: ${resBefore[m][k]} -> ${res[m][k]}`,
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
  /** @type {Array<{pkg: string, family: string, installed: boolean}>} */
  const out = [];
  for (const s of data.settings) {
    if (s.thing !== 'font') continue;
    const {pkg, family} = fontOf(s.value);
    if (!pkg || out.some(x => x.pkg === pkg)) continue;
    let installed = true;
    try {
      ctx.project.req.resolve(`${pkg}/package.json`);
    } catch {
      installed = false;
    }
    out.push({pkg, family: family.replace(/["']/g, ''), installed});
  }
  return out;
}

export {partDefault};
