// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme-edit subject's adapter: the work behind `astryx experimental
 * theme editor`, and its only access to the environment (files, the installed Core,
 * the renderer). theme-edit.mjs is the public API over it.
 *
 *   themeEditNew('brand', {like: 'neutral'})           themeEdit.new
 *   themeEditSet('brand', 'corners', 'pill')            themeEdit.set
 *   themeEditUndo('brand')                              themeEdit.undo (one step)
 *   themeEditUndo('brand', {thing: 'corners'})          themeEdit.undo (one setting)
 *   themeEditShow('brand')                              themeEdit.show
 *   themeEditPreviewAdd('a sales dashboard')            themeEdit.previewAdd
 *   themeEditPreviewList()                              themeEdit.previewList
 *   themeEditPreviewRemove('components')                themeEdit.previewRemove
 *   themeEditHow('banner')                              themeEdit.how
 *   themeEditHow('white text in the banner')            themeEdit.how (a question)
 *   themeEditHow('target.png', {at: ['4,8']})           themeEdit.how (a picture)
 *   themeEditHow('accent', {list: 'tokens'})            themeEdit.how (a list)
 *
 * Every change is checked first against what the installed Core's parts
 * really read; a change that cannot take effect is refused and nothing is
 * written. An accepted change rebuilds the theme with the theme build and
 * writes a preview.
 *
 * @input a theme name and a change, a question, or a picture
 * @output themeEdit.* envelopes
 * @position api/theme-edit — adapter for api/theme-edit/theme-edit.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AstryxError} from '../error.mjs';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../foundation/fs/path-safety.mjs';
import {CSS_PROPERTIES} from './_css-properties.mjs';
import {
  AUTO_SPREAD,
  CLOSEST_OPEN_FONT,
  COMMON_PROPERTIES,
  DIALS,
  FAMILIES,
  GROUPS,
  KEY_TOKENS,
  LIKE,
  OPEN_FONTS,
  HOW,
  P,
  SYSTEM_FONTS,
  familyOf,
} from './_tables.mjs';
import {accentSet} from './_color.mjs';
import {colorsAt, decodePng, mainColors} from './_png.mjs';
import {makeCompiler} from './_compiler.mjs';
import {openProject, installLine} from './_project.mjs';
import {partData} from './_parts.mjs';
import {
  commitTheme,
  compileTheme,
  contrastProblems,
  describe,
  fontOf,
  fontPackages,
  keyOf,
  loadTheme,
  modesOf,
  nearest,
  partsOf,
  refuse,
  resolvedTokens,
  shown,
  slugOk,
  themeFiles,
  buildTheme,
} from './_settings.mjs';
import {ASPECTS, answerHow, checkSetting, wholeThemeTokens} from './_check.mjs';
import {MODAL} from './_compiler.mjs';
import {
  SHOWCASE_GROUPS,
  componentsPageSource,
  overviewPageSource,
  previewRouteSource,
  renderPreview,
  renderSheet,
  screenshot,
  themeImports,
} from './_preview.mjs';
import {build} from '../build/build.mjs';
import {template} from '../template/template.mjs';
import {analyzeTemplateNeeds} from '../../foundation/discovery/template-needs.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';
import {baseResolved} from './_project.mjs';

const E = ERROR_CODES;

/**
 * @typedef {import('./theme-edit.type.mjs').ThemeEditChangeOptions} ChangeOptions
 */

/**
 * Refuse outside a project: a theme is written into an app, and every check
 * reads the app's own Core.
 * @param {string} cwd
 */
function requireProject(cwd) {
  if (!isOutsideProject(cwd)) return;
  throw new AstryxError(
    'No package.json found. astryx experimental theme works inside an app project, which it writes the theme into and whose installed Core it checks every change against. Nothing was written.',
    [],
    E.ERR_PROJECT_REQUIRED,
  );
}

/** @param {string} cwd */
async function context(cwd) {
  requireProject(cwd);
  const project = await openProject(cwd);
  const parts = await partData(project);
  return {project, C: makeCompiler(project, parts), parts};
}

/**
 * Pictures of HTML files, on request.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {Array<{html: string, png: string}>} shots
 * @param {Array<'light' | 'dark'>} modes
 * @returns {Promise<{files: string[], problem: string | null}>}
 */
async function pictures(project, shots, modes) {
  /** @type {string[]} */
  const files = [];
  for (const {html, png} of shots) {
    for (const m of modes) {
      const out =
        modes.length > 1 && m === 'dark'
          ? png.replace(/\.png$/, '-dark.png')
          : png;
      const r = await screenshot(project, html, out, m);
      if (!r.ok) return {files, problem: r.reason};
      files.push(r.file);
    }
  }
  return {files, problem: null};
}

/**
 * Font notes for the settings: the import line for an open font, the
 * install line when its package is missing, and a warning for a family no
 * package loads, naming the closest open font.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
function fontNotes(ctx, data) {
  /** @type {string[]} */
  const notes = [];
  for (const {pkg, installed} of fontPackages(ctx, data)) {
    notes.push(
      installed
        ? `the app loads this font with one import: import '${pkg}';`
        : `${pkg} is not installed, so previews fall back to the next font: ${installLine(ctx.project.cwd, [pkg])}; then the app imports it once: import '${pkg}';`,
    );
  }
  for (const s of data.settings) {
    if (
      s.thing !== 'font' ||
      SYSTEM_FONTS.includes(s.value) ||
      OPEN_FONTS[s.value] ||
      fontOf(s.value).pkg ||
      s.value === 'rounded' ||
      s.value === 'comic'
    )
      continue;
    const family = fontOf(s.value).family.replace(/["']/g, '').toLowerCase();
    const near = CLOSEST_OPEN_FONT[family];
    notes.push(
      `"${fontOf(s.value).family.replace(/["']/g, '')}" is not a system font and no package loads it: the app must load it, or it falls back.${near ? ` The closest open font is ${near}: ${P} set ${data.name} font ${near}${s.on ? ` --on ${s.on}` : ''}` : ''}`,
    );
  }
  return notes;
}

/**
 * The accent note: accent text in each mode, made readable in the direction
 * that mode needs, while buttons keep the color exactly.
 * @param {string} value
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {'light' | 'dark' | undefined} only
 */
function accentNote(value, data, only) {
  const a = accentSet(value);
  const ta = /** @type {string[]} */ (
    [].concat(/** @type {any} */ (a['--color-text-accent']))
  );
  if (ta.length < 2) return null;
  const modes = only ? [only] : modesOf(data);
  /** @type {string[]} */
  const parts = [];
  if (modes.includes('light') && ta[0].toLowerCase() !== value.toLowerCase())
    parts.push(
      `in light, accent-colored text is ${ta[0]} (darker, so it reads at 4.5:1 on light surfaces)`,
    );
  if (modes.includes('dark') && ta[1].toLowerCase() !== value.toLowerCase())
    parts.push(
      `in dark, accent-colored text and icons are ${ta[1]} (lighter, so they read at 4.5:1 on dark surfaces)`,
    );
  return parts.length
    ? `${parts.join('; ')}; buttons and fills keep ${value} exactly`
    : null;
}

/**
 * What a change did to part styles (component settings), one line each.
 * @param {any} before
 * @param {any} after
 * @returns {string[]}
 */
function styledChanges(before, after) {
  /** @type {string[]} */
  const out = [];
  const a = before?.components ?? {};
  const b = after?.components ?? {};
  for (const target of new Set([...Object.keys(a), ...Object.keys(b)])) {
    for (const key of new Set([
      ...Object.keys(a[target] ?? {}),
      ...Object.keys(b[target] ?? {}),
    ])) {
      const x = a[target]?.[key] ?? {};
      const y = b[target]?.[key] ?? {};
      for (const prop of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (JSON.stringify(x[prop]) === JSON.stringify(y[prop])) continue;
        const name = prop.startsWith('--')
          ? prop
          : prop.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
        out.push(
          `${target}${key === 'base' ? '' : ` ${key}`}: ${name} ${y[prop] === undefined ? '(removed)' : typeof y[prop] === 'string' ? y[prop] : JSON.stringify(y[prop])}`,
        );
      }
    }
  }
  const ta = JSON.stringify(before?.typography ?? {});
  const tb = JSON.stringify(after?.typography ?? {});
  if (ta !== tb) {
    for (const role of ['body', 'heading', 'code']) {
      const x = after?.typography?.[role];
      if (
        JSON.stringify(before?.typography?.[role] ?? null) !==
        JSON.stringify(x ?? null)
      )
        out.push(
          `typography ${role}: ${
            x
              ? Object.entries(x)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')
              : '(removed)'
          }`,
        );
    }
    if (
      JSON.stringify(before?.typography?.scale ?? null) !==
      JSON.stringify(after?.typography?.scale ?? null)
    )
      out.push(
        `typography scale: base ${after?.typography?.scale?.base ?? 'default'}`,
      );
  }
  return out;
}

/**
 * Previews after a change: the sample page always, pictures on request.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {boolean} png
 */
async function previewAfter(ctx, slug, data, png) {
  const preview = await renderPreview(ctx, slug, data);
  const f = themeFiles(ctx.project.cwd, slug);
  const shots = png
    ? await pictures(
        ctx.project,
        [{html: f.preview, png: f.previewPng}],
        modesOf(data),
      )
    : {files: [], problem: null};
  return {preview, pictures: shots.files, pictureProblem: shots.problem};
}

/**
 * Start a theme in themes/<name>/, optionally on a built-in theme.
 * @experimental
 * @param {string} name
 * @param {import('./theme-edit.type.mjs').ThemeEditNewOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditNewResponse>}
 */
export async function themeEditNew(name, options = {}) {
  const {cwd = process.cwd(), like, png = false} = options;
  requireProject(cwd);
  if (!slugOk(name))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `"${name ?? ''}" is not a theme name (lowercase letters, digits, dashes, starting with a letter).`,
      {run: [`${P} new my-theme`]},
    );
  const f = themeFiles(cwd, name);
  if (fs.existsSync(f.settings))
    refuse(E.ERR_FILE_EXISTS, `Theme "${name}" already exists.`, {
      run: [`${P} show ${name}`, `${P} set ${name} base <theme>`],
    });
  if (fs.existsSync(f.dir) && fs.readdirSync(f.dir).length)
    refuse(
      E.ERR_FILE_EXISTS,
      `themes/${name}/ already holds files this command did not make; choose another name.`,
      {run: [`${P} new ${name}-2`]},
    );
  if (like && !LIKE.includes(like))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `--like takes ${LIKE.join(', ')}, not "${like}".`,
      {didYouMean: nearest(like, LIKE)},
    );
  const ctx = await context(cwd);
  /** @type {import('./_settings.mjs').ThemeData} */
  const data = {name, ...(like ? {like} : {}), mode: 'both', settings: []};
  const r = await commitTheme(ctx, name, data, {history: false});
  const p = await previewAfter(ctx, name, data, png);
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
      problems: r.problems,
      ...p,
    },
  };
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
 * @param {'set' | 'undo'} sub
 * @param {string} slug
 * @param {string} thing
 * @param {string | undefined} value
 * @param {ChangeOptions} options
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
async function change(sub, slug, thing, value, options) {
  const {cwd = process.cwd(), png = false} = options;
  requireProject(cwd);
  const data = loadTheme(cwd, slug);
  const ctx = await context(cwd);
  const flags = {
    on: options.on,
    when: options.when,
    state: options.state,
    mode: options.mode,
    only: options.only,
  };
  const s = checkSetting(ctx, slug, data, thing, value, flags, sub === 'undo');
  const base = await baseResolved(ctx.project, data.like);
  const compiledBefore = compileTheme(ctx, data, base);
  if (sub === 'set' && (s.thing === 'base' || s.thing === 'mode')) {
    const before = s.thing === 'base' ? (data.like ?? 'none') : data.mode;
    if (s.thing === 'base') {
      if (s.value === 'none') delete data.like;
      else data.like = s.value;
    } else
      data.mode = /** @type {'both' | 'light-only' | 'dark-only'} */ (s.value);
    const r = await commitTheme(ctx, slug, data, {history: true});
    const p = await previewAfter(ctx, slug, data, png);
    return {
      type: 'themeEdit.set',
      data: {
        theme: slug,
        action: 'set',
        setting: s,
        replaced: null,
        was: before,
        parts: [],
        family: null,
        changedTokens: r.changed,
        styled: [],
        kept: [],
        lifted: r.lifted,
        notes: [`your ${data.settings.length} settings are kept`],
        problems: r.problems,
        warnings: r.warnings,
        ...p,
      },
    };
  }
  const k = keyOf(s);
  const prevIdx = data.settings.findIndex(x => keyOf(x) === k);
  const prev = prevIdx >= 0 ? data.settings[prevIdx] : null;
  if (sub === 'undo') {
    if (!prev) {
      const near = data.settings.filter(x => x.thing === s.thing).map(describe);
      refuse(
        E.ERR_THEME_NOT_SET,
        `The theme does not set ${describe({...s, value: '?'}).replace(' = ?', '')}.`,
        {
          also: near.length
            ? [`settings for ${s.thing}: ${near.join('; ')}`]
            : [],
          run: [`${P} show ${slug}`],
        },
      );
    }
    data.settings.splice(prevIdx, 1);
  } else if (prev) data.settings[prevIdx] = s;
  else data.settings.push(s);
  const r = await commitTheme(ctx, slug, data, {history: true});
  const styled = styledChanges(compiledBefore, compileTheme(ctx, data, base));
  const parts = partsOf(ctx, s);
  const kept =
    sub === 'set' && s.source === 'dial' && !s.on
      ? data.settings.filter(x => x.thing === s.thing && x.on).map(describe)
      : [];
  /** @type {string[]} */
  const notes = [];
  const fam = s.on
    ? FAMILIES[s.on]
      ? s.on
      : parts.length > 1
        ? familyOf(s.on)
        : null
    : null;
  if (s.note) notes.push(s.note);
  if (s.thing === 'accent' && sub === 'set' && !s.on) {
    const n = accentNote(s.value, data, s.mode);
    if (n) notes.push(n);
  }
  if (s.thing === 'font' && sub === 'set')
    notes.push(...fontNotes(ctx, {...data, settings: [s]}));
  const p = await previewAfter(ctx, slug, data, png);
  return {
    type: sub === 'set' ? 'themeEdit.set' : 'themeEdit.undo',
    data: {
      theme: slug,
      action: sub,
      setting:
        sub === 'set'
          ? s
          : /** @type {import('./_settings.mjs').Setting} */ (prev),
      replaced: sub === 'set' ? prev : null,
      was: null,
      parts,
      family: fam
        ? {
            name: fam,
            members: parts,
            onlyHint: !FAMILIES[s.on ?? ''] && AUTO_SPREAD.includes(fam),
          }
        : null,
      changedTokens: r.changed,
      styled,
      kept,
      lifted: r.lifted,
      notes,
      problems: r.problems,
      warnings: r.warnings,
      ...p,
    },
  };
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
  const {cwd = process.cwd(), png = false, group} = options;
  requireProject(cwd);
  checkGroup(group);
  const data = loadTheme(cwd, theme);
  const ctx = await context(cwd);
  const f = themeFiles(cwd, theme);
  if (!fs.existsSync(f.js)) await buildTheme(ctx, theme, data);
  const res = await resolvedTokens(ctx, theme);
  const problems = await contrastProblems(ctx, data, res);
  const preview = await renderPreview(ctx, theme, data);
  const sheet = await renderSheet(ctx, theme, data, {group});
  const modes = modesOf(data);
  const shots = png
    ? await pictures(
        ctx.project,
        [
          {html: f.preview, png: f.previewPng},
          {html: f.sheet, png: f.sheetPng},
        ],
        modes,
      )
    : {files: [], problem: null};
  return {
    type: 'themeEdit.show',
    data: {
      theme,
      like: data.like ?? null,
      mode: data.mode,
      settings: data.settings.map(s => ({...s, parts: partsOf(ctx, s)})),
      resolved: Object.fromEntries(
        KEY_TOKENS.map(k => [
          k,
          Object.fromEntries(modes.map(m => [m, res[m][k] ?? null])),
        ]),
      ),
      problems,
      notes: fontNotes(ctx, data),
      preview,
      sheet: sheet.file,
      sheetComponents: sheet.components,
      skipped: sheet.skipped,
      pictures: shots.files,
      pictureProblem: shots.problem,
    },
  };
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
  if (thing != null)
    return change('undo', theme, thing, options.value, options);
  requireProject(cwd);
  // A damaged settings file is what undo recovers from: the last history
  // entry replaces it without the current file being read.
  /** @type {import('./_settings.mjs').ThemeData | null} */
  let current = null;
  try {
    current = loadTheme(cwd, theme);
  } catch (e) {
    if (!(e instanceof AstryxError && e.code === E.ERR_THEME_INVALID)) throw e;
  }
  const f = themeFiles(cwd, theme);
  const history = fs.existsSync(f.history)
    ? JSON.parse(fs.readFileSync(f.history, 'utf8'))
    : [];
  if (!history.length)
    refuse(
      E.ERR_THEME_NOTHING_TO_UNDO,
      `Nothing to undo: ${theme} has no earlier change.`,
      {run: [`${P} show ${theme}`]},
    );
  const ctx = await context(cwd);
  const prevText = history.pop();
  const prev = /** @type {import('./_settings.mjs').ThemeData} */ (
    JSON.parse(prevText)
  );
  await commitTheme(ctx, theme, prev, {history: false});
  fs.writeFileSync(f.history, JSON.stringify(history));
  /** @type {string[]} */
  const undone = current
    ? []
    : [
        `the damaged ${theme}.settings.json is replaced by the settings before the last change`,
      ];
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
  if (current && (current.like ?? 'none') !== (prev.like ?? 'none'))
    undone.push(
      `base ${current.like ?? 'none'} is back to ${prev.like ?? 'none'}`,
    );
  if (current && current.mode !== prev.mode)
    undone.push(`mode ${current.mode} is back to ${prev.mode}`);
  const p = await previewAfter(ctx, theme, prev, png);
  return {
    type: 'themeEdit.undo',
    data: {
      theme,
      action: 'step',
      undone,
      settings: prev.settings.length,
      stepsLeft: history.length,
      ...p,
    },
  };
}

/** @param {string | undefined} group */
function checkGroup(group) {
  if (group != null && !SHOWCASE_GROUPS.includes(group))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--group takes ${SHOWCASE_GROUPS.join(', ')}, not "${group}".`,
      {didYouMean: nearest(group, SHOWCASE_GROUPS)},
    );
}

/** The preview's data file: the pages it shows and the files it wrote. */
const PREVIEW_DATA = 'theme-preview.json';
const PREVIEW = 'astryx experimental theme preview';

/**
 * @typedef {{id: string, label: string, file: string}} PreviewPage
 * @typedef {{version: 1, theme: string | null, pages: PreviewPage[], files: string[]}} PreviewData
 */

/**
 * Where the preview route lives. `--path` names it (inside the project);
 * else an existing preview in the app's routes folder; else the routes
 * folder of a Next app router (`app/` or `src/app/`); else
 * `./theme-preview/` at the project root, with no app around it.
 * @param {string} cwd
 * @param {string | undefined} where
 * @param {{optional?: boolean}} [opts] `optional`: null instead of a refusal when there is no routes folder
 * @returns {{dir: string, app: string | null}} `app`: the routes folder, when the route is in one
 */
function previewDir(cwd, where, opts = {}) {
  const routes = ['app', path.join('src', 'app')]
    .map(r => path.join(cwd, r))
    .filter(r => fs.existsSync(r) && fs.statSync(r).isDirectory());
  const appOf = (/** @type {string} */ dir) =>
    routes.find(r => dir.startsWith(r + path.sep)) ?? null;
  if (where != null) {
    try {
      const dir = assertWithin(path.resolve(cwd, where), cwd, {
        allowAbsolute: true,
        label: '--path',
      });
      return {dir, app: appOf(dir)};
    } catch (e) {
      if (e instanceof PathSafetyError)
        refuse(
          E.ERR_PATH_TRAVERSAL,
          `--path ${where} is outside the project; put the preview inside the folder you run the command from.`,
        );
      throw e;
    }
  }
  const candidates = routes.map(r => path.join(r, 'theme-preview'));
  const known = candidates.find(d => fs.existsSync(path.join(d, PREVIEW_DATA)));
  const dir = known ?? candidates[0];
  if (!dir && opts.optional) return /** @type {any} */ (null);
  if (!dir)
    refuse(
      E.ERR_NOT_FOUND,
      'No app routes folder here (app/ or src/app/), so there is no app to put the preview in.',
      {
        run: [
          `${PREVIEW} add --path <dir>   (a folder inside your app's routes)`,
          `${PREVIEW} app <dir>          (a new starter app with the preview in it)`,
        ],
      },
    );
  return {dir, app: appOf(dir)};
}

const CLI_PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const STARTER = path.join(CLI_PACKAGE, 'assets', 'preview-app');
/** Starter files a folder may already have: they are the app's own, so never replaced. */
const STARTER_KEEP = new Set(['package.json', '.gitignore']);
/** What the starter's own package.json depends on. */
const STARTER_DEPENDENCIES = Object.keys(
  JSON.parse(fs.readFileSync(path.join(STARTER, 'package.json'), 'utf8'))
    .dependencies,
);

/**
 * `file` when it is inside `root`, also through links; else a refusal.
 * @param {string} file absolute
 * @param {string} root absolute
 * @param {string} what what the path is, for the refusal
 * @returns {string}
 */
function confined(file, root, what) {
  try {
    return assertWithin(file, root, {allowAbsolute: true, label: what});
  } catch (e) {
    if (e instanceof PathSafetyError)
      refuse(
        E.ERR_PATH_TRAVERSAL,
        `${what} ${file} is outside ${root}; nothing was written or removed.`,
      );
    throw e;
  }
}

/**
 * The files a new starter app (Next.js app router, Core and the neutral
 * theme) writes into `where`, with `extra` files beside them, checked before
 * anything is written: every file stays inside the folder, also through
 * links; with `overwrite`, a protected file there is refused and the app's
 * own package.json and .gitignore are kept.
 * @param {string} cwd
 * @param {string} where
 * @param {boolean} overwrite
 * @param {(root: string) => Array<{rel: string, text: string}>} extra files relative to the app folder
 * @param {Record<string, string>} dependencies added to the starter's package.json
 * @returns {{root: string, writes: Array<{file: string, text: string}>, kept: string[]}}
 */
function planStarterApp(cwd, where, overwrite, extra, dependencies) {
  /** @type {string} */
  let root;
  try {
    root = assertWithin(path.resolve(cwd, where), cwd, {
      allowAbsolute: true,
      label: 'the app folder',
    });
  } catch (e) {
    if (e instanceof PathSafetyError)
      refuse(
        E.ERR_PATH_TRAVERSAL,
        `${where} is outside the current folder; make the app inside the folder you run the command from.`,
      );
    throw e;
  }
  if (fs.existsSync(root) && fs.readdirSync(root).length && !overwrite)
    refuse(
      E.ERR_FILE_EXISTS,
      `${shown(cwd, root) || '.'} exists and is not empty; a starter app goes into a new or empty folder (--overwrite replaces its files).`,
    );
  /** @type {Array<{file: string, text: string}>} */
  const writes = [];
  /** @type {string[]} */
  const kept = [];
  /** @param {string} from */
  const walk = from => {
    for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
      const src = path.join(from, entry.name);
      if (entry.isDirectory()) walk(src);
      else if (entry.name !== 'README.md') {
        const rel = path.relative(STARTER, src);
        const name = rel === 'gitignore' ? '.gitignore' : rel;
        const file = confined(
          path.join(root, name),
          root,
          'a starter app file',
        );
        if (STARTER_KEEP.has(name) && fs.existsSync(file)) {
          kept.push(shown(cwd, file));
          continue;
        }
        const text = fs.readFileSync(src, 'utf8');
        writes.push({
          file,
          text:
            rel === 'package.json'
              ? starterPackageJson(text, dependencies)
              : text,
        });
      }
    }
  };
  walk(STARTER);
  for (const x of extra(root))
    writes.push({
      file: confined(path.join(root, x.rel), root, 'an app file'),
      text: x.text,
    });
  const existing = writes.map(w => w.file).filter(f => fs.existsSync(f));
  if (existing.length) {
    /** @type {ReturnType<typeof createFileProtectionResolver>} */
    let resolver;
    try {
      resolver = createFileProtectionResolver(cwd);
    } catch (e) {
      refuse(
        E.ERR_FILE_EXISTS,
        `Could not read this project's file protection (${e instanceof Error ? e.message : String(e)}), so no existing file is replaced; nothing was written.`,
      );
    }
    const blocked = existing.flatMap(f => {
      const protection = resolver.classify(f)[0];
      return protection ? [`${shown(cwd, f)} (${protection.declaration})`] : [];
    });
    if (blocked.length)
      refuse(
        E.ERR_FILE_EXISTS,
        `${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} protected, so never replaced, even with --overwrite; nothing was written. Choose another app folder.`,
      );
  }
  return {root, writes, kept: kept.sort()};
}

/**
 * The starter's package.json with the Astryx packages pinned to this CLI's
 * release, and `dependencies` added.
 * @param {string} text
 * @param {Record<string, string>} dependencies
 */
function starterPackageJson(text, dependencies) {
  const pinned = text.replaceAll('{{astryxVersion}}', cliVersion());
  if (!Object.keys(dependencies).length) return pinned;
  const pkg = JSON.parse(pinned);
  pkg.dependencies = Object.fromEntries(
    Object.entries({...pkg.dependencies, ...dependencies}).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Write a planned starter app. No install runs here.
 * @param {string} cwd
 * @param {{writes: Array<{file: string, text: string}>}} plan
 * @returns {string[]} the files written
 */
function writeStarterApp(cwd, plan) {
  for (const w of plan.writes) {
    fs.mkdirSync(path.dirname(w.file), {recursive: true});
    fs.writeFileSync(w.file, w.text);
  }
  return plan.writes.map(w => shown(cwd, w.file)).sort();
}

/** @param {string} dir @returns {PreviewData | null} */
function readPreview(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, PREVIEW_DATA), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * A preview file, checked: inside the route folder, also through links, and
 * not a file there that the preview did not write, which is never replaced.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {string} rel relative to dir
 * @returns {string} the absolute file
 */
function previewFile(cwd, dir, data, rel) {
  const file = confined(path.join(dir, rel), dir, 'a preview file');
  const key = rel.split(path.sep).join('/');
  if (fs.existsSync(file) && !data.files.includes(key))
    refuse(
      E.ERR_FILE_EXISTS,
      `${shown(cwd, file)} exists and the preview did not write it; it is never replaced. Move it, or put the preview elsewhere with --path.`,
    );
  return file;
}

/**
 * Write one file of the preview, checked as {@link previewFile} checks it.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {string} rel relative to dir
 * @param {string} text
 */
function writePreviewFile(cwd, dir, data, rel, text) {
  const file = previewFile(cwd, dir, data, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  const key = rel.split(path.sep).join('/');
  if (!data.files.includes(key)) data.files.push(key);
}

/** The themes this command made, by name. @param {string} cwd */
function editedThemes(cwd) {
  const root = path.join(cwd, 'themes');
  return fs.existsSync(root)
    ? fs
        .readdirSync(root)
        .filter(d => fs.existsSync(themeFiles(cwd, d).settings))
        .sort()
    : [];
}

/**
 * Write the route and the data file from the page list.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 */
async function writeRoute(cwd, dir, data) {
  /** @type {{name: string, module: string, css: string[]} | null} */
  let theme = null;
  if (data.theme) {
    const t = loadTheme(cwd, data.theme);
    const ctx = await context(cwd);
    if (!fs.existsSync(themeFiles(cwd, data.theme).js))
      await buildTheme(ctx, data.theme, t);
    const ti = themeImports(ctx, data.theme, t, dir);
    theme = {name: data.theme, module: ti.module, css: ti.css};
  }
  writePreviewFile(
    cwd,
    dir,
    data,
    'page.tsx',
    previewRouteSource({pages: data.pages, theme}),
  );
  if (!data.files.includes(PREVIEW_DATA)) data.files.push(PREVIEW_DATA);
  fs.writeFileSync(
    path.join(dir, PREVIEW_DATA),
    `${JSON.stringify(data, null, 2)}\n`,
  );
}

/**
 * How to open the preview, from where it is.
 * @param {string} cwd
 * @param {{dir: string, app: string | null}} at
 */
function openLine(cwd, at) {
  if (at.app)
    return `open /${path.relative(at.app, at.dir).split(path.sep).join('/')} in the running app`;
  return `no app routes folder (app/ or src/app/) was found, so the preview is in ${shown(cwd, at.dir)}/; a starter app around it is not set up yet: serve page.tsx from a route of your app, or move it there with --path`;
}

/**
 * Add pages to the in-app theme preview, and write the preview route the
 * first time. With a description, the build ranking picks the template
 * pages that fit it best (`top` of them); `template` names one instead.
 * With neither, the default pages: the sample app page and every component.
 * Every check runs before the first write, so a refusal changes nothing.
 * @experimental
 * @param {string} [description]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAddOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAddResponse>}
 */
export async function themeEditPreviewAdd(description, options = {}) {
  const {cwd = process.cwd(), top = 1} = options;
  if (isOutsideProject(cwd))
    refuse(
      E.ERR_PROJECT_REQUIRED,
      'No package.json here, so there is no app to put the preview in.',
      {
        run: [
          `${PREVIEW} add --path <dir>   (run in your app: a folder inside its routes)`,
          `${PREVIEW} app <dir>          (a new starter app with the preview in it)`,
        ],
      },
    );
  const words = (description ?? '').trim();
  if (words && options.template != null)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      '--template names the page; a description asks the ranking to pick one, so drop one of them.',
    );
  if (!Number.isInteger(top) || top < 1 || top > 3)
    refuse(E.ERR_INVALID_ARGUMENT, `--top takes 1, 2 or 3, not "${top}".`);
  const at = previewDir(cwd, options.path);
  const data = readPreview(at.dir) ?? {
    version: 1,
    theme: null,
    pages: [],
    files: [],
  };
  /** @type {string[]} */
  const notes = [];
  if (options.theme != null) {
    loadTheme(cwd, options.theme);
    data.theme = options.theme;
  } else if (!data.theme) {
    const themes = editedThemes(cwd);
    data.theme = themes.length === 1 ? themes[0] : null;
  }
  if (data.theme) loadTheme(cwd, data.theme);
  const project = await openProject(cwd);
  /** @type {Array<{id: string, label: string, source?: string, template?: string}>} */
  const add = [];
  /** @type {Array<{page: string, missingPackages: string[], installCommand: string | null}>} */
  const skipped = [];
  if (!words && options.template == null) {
    add.push(
      {id: 'overview', label: 'Overview', source: overviewPageSource(project)},
      {
        id: 'components',
        label: 'Components',
        source: componentsPageSource(project).source,
      },
    );
  } else {
    /** @type {Array<{name: string, displayName: string}>} */
    let picks;
    if (options.template != null)
      picks = [{name: options.template, displayName: options.template}];
    else {
      const kit =
        /** @type {import('../build/build.type.mjs').BuildKitResponse} */ (
          await build(words, {cwd})
        );
      const start = kit.data.start;
      picks = start ? [start, ...start.alternatives].slice(0, top) : [];
      if (!picks.length)
        refuse(
          E.ERR_NOT_FOUND,
          `No page template to show for "${words}": this project has none.`,
          {run: [`${PREVIEW} add`]},
        );
    }
    for (const pick of picks) {
      const shownTemplate =
        /** @type {import('../template/template.type.mjs').TemplateShowResponse} */ (
          await template(pick.name, {cwd, type: 'page'})
        );
      const needs = analyzeTemplateNeeds(shownTemplate.data.source, cwd);
      if (needs.missingPackages.length) {
        skipped.push({
          page: pick.name,
          missingPackages: needs.missingPackages,
          installCommand: needs.installCommand,
        });
        continue;
      }
      add.push({id: pick.name, label: pick.displayName, template: pick.name});
    }
  }
  for (const s of skipped)
    notes.push(
      `the ${s.page} page needs ${s.missingPackages.join(', ')}, so it was not added${s.installCommand ? `: ${s.installCommand}, then add it again` : ''}`,
    );
  if (!add.length)
    refuse(
      E.ERR_DEP_MISSING,
      `No page was added: ${skipped.map(s => `the ${s.page} page needs ${s.missingPackages.join(', ')}`).join('; ')}. Nothing was written.`,
      {
        run: skipped.flatMap(s => (s.installCommand ? [s.installCommand] : [])),
      },
    );
  for (const page of add)
    previewFile(cwd, at.dir, data, `pages/${page.id}.tsx`);
  previewFile(cwd, at.dir, data, 'page.tsx');
  previewFile(cwd, at.dir, data, PREVIEW_DATA);

  /** @type {string[]} */
  const added = [];
  for (const page of add) {
    const file = `pages/${page.id}`;
    if (page.template != null) {
      const target = previewFile(cwd, at.dir, data, `${file}.tsx`);
      await template(page.template, {
        cwd,
        type: 'page',
        targetPath: path.relative(cwd, target),
        overwrite: true,
      });
      if (!data.files.includes(`${file}.tsx`)) data.files.push(`${file}.tsx`);
    } else
      writePreviewFile(
        cwd,
        at.dir,
        data,
        `${file}.tsx`,
        /** @type {string} */ (page.source),
      );
    if (!data.pages.some(x => x.id === page.id)) {
      data.pages.push({id: page.id, label: page.label, file});
      added.push(page.id);
    }
  }
  await writeRoute(cwd, at.dir, data);
  return {
    type: 'themeEdit.previewAdd',
    data: {
      folder: shown(cwd, at.dir),
      theme: data.theme,
      added,
      skipped,
      notes,
      pages: data.pages.map(x => x.id),
      files: data.files.map(f => shown(cwd, path.join(at.dir, f))),
      open: openLine(cwd, at),
    },
  };
}

/**
 * Make a new starter app (Next.js app router, Core and the neutral theme,
 * with the Astryx packages pinned to this CLI's release) in `dir`, with the
 * theme preview route and its default pages inside. With `theme`, the theme
 * folder is copied into the app and the pages wear it. No install runs.
 * Every check runs before the first write, so a refusal changes nothing.
 * @experimental
 * @param {string} dir
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAppOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAppResponse>}
 */
export async function themeEditPreviewApp(dir, options = {}) {
  const {cwd = process.cwd(), overwrite = false} = options;
  if (typeof dir !== 'string' || !dir.trim())
    refuse(
      E.ERR_INVALID_ARGUMENT,
      'Name the folder for the new app: a new or empty folder inside the current one.',
      {run: [`${PREVIEW} app <dir>`]},
    );
  const slug = options.theme ?? null;
  const theme = slug == null ? null : loadTheme(cwd, slug);
  // A new app has no Core installed yet: its pages come from this CLI's own
  // Core when the current folder has none.
  const project = await openProject(cwd).catch(() => openProject(CLI_PACKAGE));
  /** @type {Record<string, string>} */
  const dependencies = {};
  /** @type {Array<{rel: string, text: string}>} */
  const themeCopy = [];
  /** @type {{name: string, module: string, css: string[]} | null} */
  let routeTheme = null;
  const routeDir = path.join('src', 'app', 'theme-preview');
  if (slug != null && theme) {
    const from = themeFiles(cwd, slug);
    if (!fs.existsSync(from.js) || !fs.existsSync(from.css))
      await buildTheme(await context(cwd), slug, theme);
    const to = themeFiles('', slug);
    // The theme and its build, with the type declarations the build writes;
    // not its history, preview pages or pictures.
    const skip = new Set(
      [
        from.history,
        from.preview,
        from.sheet,
        from.previewPng,
        from.sheetPng,
      ].map(f => path.basename(f)),
    );
    for (const entry of fs.readdirSync(from.dir, {withFileTypes: true}))
      if (entry.isFile() && !skip.has(entry.name))
        themeCopy.push({
          rel: path.join(to.dir, entry.name),
          text: fs.readFileSync(path.join(from.dir, entry.name), 'utf8'),
        });
    if (theme.like && theme.like !== 'neutral')
      dependencies[`@astryxdesign/theme-${theme.like}`] = cliVersion();
    /** @param {string} rel */
    const fromRoute = rel => {
      const r = path.relative(routeDir, rel).split(path.sep).join('/');
      return r.startsWith('.') ? r : `./${r}`;
    };
    const fonts = fontPackages(await context(cwd), theme).filter(
      x => x.installed,
    );
    for (const font of fonts)
      dependencies[font.pkg] = readVersion(project, font.pkg) ?? 'latest';
    routeTheme = {
      name: slug,
      module: fromRoute(to.js),
      css: [fromRoute(to.css), ...fonts.map(x => `${x.pkg}/index.css`)],
    };
  }
  /** @type {PreviewData} */
  const data = {version: 1, theme: slug, pages: [], files: []};
  /** @type {Array<{rel: string, text: string}>} */
  const preview = [];
  for (const [id, label, source] of /** @type {const} */ ([
    ['overview', 'Overview', overviewPageSource(project)],
    ['components', 'Components', componentsPageSource(project).source],
  ])) {
    data.pages.push({id, label, file: `pages/${id}`});
    preview.push({rel: `pages/${id}.tsx`, text: source});
  }
  preview.push({
    rel: 'page.tsx',
    text: previewRouteSource({pages: data.pages, theme: routeTheme}),
  });
  data.files = [...preview.map(x => x.rel), PREVIEW_DATA];
  preview.push({rel: PREVIEW_DATA, text: `${JSON.stringify(data, null, 2)}\n`});
  const plan = planStarterApp(
    cwd,
    dir,
    overwrite,
    () => [
      ...themeCopy,
      ...preview.map(x => ({rel: path.join(routeDir, x.rel), text: x.text})),
    ],
    dependencies,
  );
  const files = writeStarterApp(cwd, plan);
  const folder = shown(cwd, plan.root) || '.';
  /** @type {string[]} */
  const notes = [];
  if (plan.kept.length)
    notes.push(
      `kept the app's own ${plan.kept.join(', ')}: the starter needs ${[...STARTER_DEPENDENCIES, ...Object.keys(dependencies)].join(', ')} in package.json`,
    );
  return {
    type: 'themeEdit.previewApp',
    data: {
      folder,
      theme: slug,
      pages: data.pages.map(x => x.id),
      files,
      notes,
      open: `cd ${folder} && npm install && npm run dev, then open /theme-preview`,
    },
  };
}

/**
 * The installed version of a package, as the project resolves it.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} pkg
 * @returns {string | null}
 */
function readVersion(project, pkg) {
  try {
    return JSON.parse(
      fs.readFileSync(project.req.resolve(`${pkg}/package.json`), 'utf8'),
    ).version;
  } catch {
    return null;
  }
}

/**
 * The pages of the in-app theme preview. With no preview, and with no
 * routes folder for one, the list is empty.
 * @experimental
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewListResponse>}
 */
export async function themeEditPreviewList(options = {}) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  const at = previewDir(cwd, options.path, {optional: true});
  const data = at && readPreview(at.dir);
  return {
    type: 'themeEdit.previewList',
    data: {
      folder: at && data ? shown(cwd, at.dir) : null,
      theme: data?.theme ?? null,
      pages: (data?.pages ?? []).map(x => ({id: x.id, label: x.label})),
    },
  };
}

/**
 * Remove one page from the in-app theme preview, or with no page the whole
 * preview: only the files it wrote are deleted, and only inside the route
 * folder.
 * @experimental
 * @param {string} [page]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewRemoveResponse>}
 */
export async function themeEditPreviewRemove(page, options = {}) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  const at = previewDir(cwd, options.path);
  const data = readPreview(at.dir);
  if (!data)
    refuse(
      E.ERR_NOT_FOUND,
      `There is no theme preview in ${shown(cwd, at.dir)}/ (no ${PREVIEW_DATA}).`,
      {run: [`${PREVIEW} add`]},
    );
  // theme-preview.json is a file anyone can edit: every path in it must
  // stay in the route folder before anything is removed.
  const inside = (/** @type {string} */ rel) =>
    confined(path.join(at.dir, rel), at.dir, `${PREVIEW_DATA} names`);
  for (const rel of data.files) inside(rel);
  for (const p of data.pages) inside(`${p.file}.tsx`);
  /** @param {string} rel */
  const drop = rel => {
    const file = inside(rel);
    fs.rmSync(file, {force: true});
    return shown(cwd, file);
  };
  if (page != null && data.pages.length > 1) {
    const one = data.pages.find(x => x.id === page);
    if (!one)
      refuse(E.ERR_NOT_FOUND, `The preview has no page "${page}".`, {
        didYouMean: nearest(
          page,
          data.pages.map(x => x.id),
        ),
        run: [`${PREVIEW} list`],
      });
    data.pages = data.pages.filter(x => x !== one);
    const rel = `${one.file}.tsx`;
    data.files = data.files.filter(f => f !== rel);
    const removed = [drop(rel)];
    await writeRoute(cwd, at.dir, data);
    return {
      type: 'themeEdit.previewRemove',
      data: {
        folder: shown(cwd, at.dir),
        removed,
        pages: data.pages.map(x => x.id),
      },
    };
  }
  if (page != null && !data.pages.some(x => x.id === page))
    refuse(E.ERR_NOT_FOUND, `The preview has no page "${page}".`, {
      run: [`${PREVIEW} list`],
    });
  const removed = data.files.map(drop);
  for (const sub of [path.join(at.dir, 'pages'), at.dir])
    try {
      fs.rmdirSync(sub);
    } catch {
      // Not empty: something there is not the preview's.
    }
  return {
    type: 'themeEdit.previewRemove',
    data: {folder: shown(cwd, at.dir), removed, pages: []},
  };
}

/** What `how --list` takes. */
const HOW_LISTS = ['dials', 'tokens', 'parts', 'families', 'properties'];

/**
 * Explain anything a theme change can name, or answer a question about one:
 * a part (what it reads for each aspect, its variants, states and the parts
 * inside it), a family (its members), a setting (a dial's rungs, a token's
 * type and readers, a CSS property), an aspect (colors, text, corners...: the
 * whole-theme tokens and dial), a plain-words question (exact commands), a
 * PNG picture (its main colors, or the color at points), or with `list` a
 * list of dials, tokens, parts, families or CSS properties.
 * @experimental
 * @param {string} subject a part, family, setting, aspect, question, or PNG file; with `list`, a filter
 * @param {import('./theme-edit.type.mjs').ThemeEditHowOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditHowResponse>}
 */
export async function themeEditHow(subject, options = {}) {
  const {cwd = process.cwd(), list, at = [], count} = options;
  requireProject(cwd);
  const t = (subject ?? '').trim();
  if (list != null) {
    if (at.length)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        '--at reads a picture; --list lists names, so drop one of them.',
      );
    return {
      type: 'themeEdit.how',
      data: {kind: 'list', subject: t, ...(await listItems(list, t, cwd))},
    };
  }
  if (/\.png$/i.test(t))
    return {
      type: 'themeEdit.how',
      data: {kind: 'picture', subject: t, ...pictureColors(t, cwd, at, count)},
    };
  if (at.length)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      '--at reads the color at points of a PNG picture; name the picture first.',
      {run: [`${HOW} picture.png --at "40,20"`]},
    );
  if (count != null)
    refuse(E.ERR_INVALID_ARGUMENT, 'A count applies only to a picture.', {
      run: [`${HOW} picture.png ${count}`],
    });
  if (!t) {
    refuse(
      E.ERR_MISSING_ARGUMENT,
      'Name a part, a family, a setting, an aspect, a question in quotes, or a PNG picture.',
      {
        run: [
          `${HOW} card`,
          `${HOW} "white text in the banner"`,
          `${HOW} --list dials`,
        ],
      },
    );
  }
  const ctx = await context(cwd);
  const {C} = ctx;
  if (FAMILIES[t]) {
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'family',
        subject: t,
        family: t,
        members: FAMILIES[t],
        spreads: AUTO_SPREAD.includes(t),
        lines: [
          `${t} (family): ${FAMILIES[t].join(', ')}`,
          AUTO_SPREAD.includes(t)
            ? `  styling one of them styles all (--only to opt out); ${HOW} <one of them> for details`
            : `  --on ${t} styles all of them; --on <one of them> styles just that one`,
        ],
      },
    };
  }
  if (ctx.project.target.has(t)) {
    const fam = familyOf(t);
    const lines = [...C.explain(t, P)];
    if (fam)
      lines.push(
        AUTO_SPREAD.includes(fam)
          ? `  family: ${fam} (styling ${t} styles all of: ${FAMILIES[fam].join(', ')}; --only to opt out)`
          : `  family: ${fam} (--on ${fam} styles all of: ${FAMILIES[fam].join(', ')})`,
      );
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'part',
        subject: t,
        family: fam,
        variants: C.variantValues(t),
        states: ctx.project.target.get(t)?.states ?? [],
        reads: Object.fromEntries(
          Object.keys(GROUPS).map(g => [g, C.partReads(t, g)]),
        ),
        contains: C.MAP[t]?.contains ?? [],
        lines,
      },
    };
  }
  if (ASPECTS.includes(t)) {
    const aspects = t === 'colors' ? ['text', 'background', 'border'] : [t];
    const results = aspects.flatMap(a => wholeThemeTokens(ctx, a));
    const dial = /** @type {Record<string, string>} */ ({
      corners: 'corners',
      spacing: 'spacing',
      font: 'font',
      size: 'text-size',
    })[t];
    if (t === 'colors' || t === 'text' || t === 'background')
      results.unshift({
        text: DIALS.accent.help,
        commands: DIALS.accent.examples.map(e => `${P} ${e}`),
      });
    if (dial)
      results.unshift({
        text: DIALS[dial].help,
        commands: DIALS[dial].examples.map(e => `${P} ${e}`),
      });
    results.push({
      text: `for one part: ${HOW} <part> lists what it reads for ${t}`,
      commands: [`${HOW} button`],
    });
    return {
      type: 'themeEdit.how',
      data: {kind: 'aspect', subject: t, results, lines: []},
    };
  }
  if (DIALS[t]) {
    const d = DIALS[t];
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'setting',
        subject: t,
        source: 'dial',
        values: d.values,
        lines: [
          `${t} (dial): ${d.values}`,
          `  ${d.help}`,
          ...d.examples.map(e => `  e.g. ${P} ${e}`),
        ],
      },
    };
  }
  if (t.startsWith('--') && t in ctx.project.core.tokenDefaults) {
    const readers = C.anyReader(t);
    const type = C.typeOf(t);
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'setting',
        subject: t,
        source: 'token',
        tokenType: type,
        default: String(ctx.project.core.tokenDefaults[t]),
        readBy: readers,
        lines: [
          `${t} (token): a ${type}, default ${ctx.project.core.tokenDefaults[t]}${MODAL.has(type) ? '; may differ in light and dark (--mode)' : '; the same in light and dark'}`,
          `  read by ${readers.length} part${readers.length === 1 ? '' : 's'}${readers.length ? `: ${readers.slice(0, 12).join(', ')}${readers.length > 12 ? ', ...' : ''}` : ' (setting it changes nothing)'}`,
          `  e.g. ${P} set <theme> ${t} <value>${readers[0] ? `   or only inside one part: --on ${readers[0]}` : ''}`,
        ],
      },
    };
  }
  if (CSS_PROPERTIES.has(t)) {
    const setters = Object.keys(C.MAP).filter(p => t in C.MAP[p].own);
    return {
      type: 'themeEdit.how',
      data: {
        kind: 'setting',
        subject: t,
        source: 'property',
        setBy: setters,
        lines: [
          `${t} (CSS property): set it on a part or a family with --on; any CSS value works.`,
          `  parts that set it now: ${setters.length ? `${setters.slice(0, 12).join(', ')}${setters.length > 12 ? ', ...' : ''}` : 'none (it still applies when you set it)'}`,
          `  e.g. ${P} set <theme> ${t} <value> --on ${setters[0] ?? '<part>'}`,
        ],
      },
    };
  }
  const h = answerHow(ctx, t);
  return {
    type: 'themeEdit.how',
    data: {
      kind: 'question',
      subject: t,
      understood: {parts: h.parts, aspects: h.aspects},
      results: h.results,
      lines: [],
    },
  };
}

/**
 * The items of `how --list`.
 * @param {string} kind
 * @param {string} filter
 * @param {string} cwd
 * @returns {Promise<{list: string, items: Array<Record<string, unknown>>, common?: boolean}>}
 */
async function listItems(kind, filter, cwd) {
  if (!HOW_LISTS.includes(kind))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--list takes ${HOW_LISTS.join(', ')}${kind ? `, not "${kind}"` : ''}.`,
      {
        didYouMean: kind ? nearest(kind, HOW_LISTS) : [],
        run: [`${HOW} --list dials`],
      },
    );
  const f = (/** @type {string} */ x) =>
    x.toLowerCase().includes(filter.toLowerCase());
  if (kind === 'dials')
    return {
      list: kind,
      items: Object.entries(DIALS)
        .filter(([k]) => f(k))
        .map(([name, d]) => ({
          name,
          values: d.values,
          help: d.help,
          examples: d.examples.map(e => `${P} ${e}`),
        })),
    };
  if (kind === 'families')
    return {
      list: kind,
      items: Object.entries(FAMILIES)
        .filter(([k, v]) => f(k) || v.some(f))
        .map(([name, members]) => ({
          name,
          members,
          spreads: AUTO_SPREAD.includes(name),
        })),
    };
  if (kind === 'properties') {
    const props = filter
      ? [...CSS_PROPERTIES].filter(x => f(x)).slice(0, 60)
      : COMMON_PROPERTIES;
    return {list: kind, items: props.map(name => ({name})), common: !filter};
  }
  const ctx = await context(cwd);
  const {C} = ctx;
  if (kind === 'tokens') {
    const toks = Object.keys(ctx.project.core.tokenDefaults).filter(k => f(k));
    return {
      list: kind,
      items: toks.map(k => ({
        name: k,
        type: C.typeOf(k),
        default: String(ctx.project.core.tokenDefaults[k]),
        readBy: C.anyReader(k).length,
      })),
    };
  }
  const targets = ctx.project.targets.filter(x => f(x.key) || f(x.component));
  return {
    list: kind,
    items: targets.map(x => ({
      name: x.key,
      component: x.component,
      family: familyOf(x.key),
      variants: C.variantValues(x.key),
      states: x.states,
      recorded: Boolean(C.MAP[x.key]),
    })),
  };
}

/**
 * Read `--at` points: "x,y;x,y", "x,y x,y", repeated, or a flat "a,b,c,d".
 * @param {string[]} at
 */
export function parsePoints(at) {
  const nums = at
    .join(' ')
    .split(/[^\d]+/)
    .filter(Boolean)
    .map(Number);
  if (nums.length % 2)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--at takes x,y pairs; "${at.join(' ')}" has an odd count of numbers.`,
      {run: [`${HOW} picture.png --at "40,20;300,180"`]},
    );
  /** @type {Array<{x: number, y: number}>} */
  const points = [];
  for (let i = 0; i < nums.length; i += 2)
    points.push({x: nums[i], y: nums[i + 1]});
  return points;
}

/**
 * The main colors of a PNG picture, or the exact color at points.
 * @param {string} file
 * @param {string} cwd
 * @param {string[]} at
 * @param {number | undefined} count
 */
function pictureColors(file, cwd, at, count = 14) {
  const abs = path.resolve(cwd, file);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
    throw new AstryxError(`${file} does not exist.`, [], E.ERR_FILE_NOT_FOUND);
  if (!Number.isInteger(count) || count <= 0)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `The count must be a positive whole number, not "${count}".`,
    );
  /** @type {import('./_png.mjs').Picture} */
  let pic;
  try {
    pic = decodePng(fs.readFileSync(abs));
  } catch (e) {
    throw new AstryxError(
      `Could not read ${file} as a PNG picture: ${e instanceof Error ? e.message : String(e)}.`,
      [],
      E.ERR_INVALID_ARGUMENT,
    );
  }
  if (at.length)
    return {
      file,
      width: pic.width,
      height: pic.height,
      colors: null,
      points: colorsAt(pic, parsePoints(at)),
    };
  return {
    file,
    width: pic.width,
    height: pic.height,
    colors: mainColors(pic, count),
    points: null,
  };
}
