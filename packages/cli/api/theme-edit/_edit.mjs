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
import {AstryxError} from '../error.mjs';
import {
  AUTO_SPREAD,
  FAMILIES,
  KEY_TOKENS,
  LIKE,
  P,
  familyOf,
} from './_tables.mjs';
import {
  commitTheme,
  compileTheme,
  contrastProblems,
  describe,
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
import {checkSetting} from './_check.mjs';
import {
  PALETTE_DIALS,
  paletteFiles,
  paletteMapping,
  paletteNotes,
  paletteToken,
} from './_palette.mjs';
import {renderPreview, renderSheet} from './_preview.mjs';
import {baseResolved} from './_project.mjs';
import {
  requireProject,
  context,
  pictures,
  fontNotes,
  styledChanges,
  previewAfter,
  checkGroup,
} from './_context.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const E = ERROR_CODES;

/**
 * @typedef {import('./theme-edit.type.mjs').ThemeEditChangeOptions} ChangeOptions
 */
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
  if (PALETTE_DIALS.includes(s.thing) && sub === 'set')
    notes.push(
      ...paletteNotes(
        paletteMapping(cwd, slug, data, base, ctx.project.core.tokenDefaults),
        s.thing,
        slug,
      ),
    );
  if (PALETTE_DIALS.includes(s.thing) && sub === 'undo')
    notes.push(
      `the ${s.thing} family and the tokens it fed are removed from the palette; they go back to the base theme's values`,
    );
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
  const pal = paletteMapping(
    cwd,
    theme,
    data,
    await baseResolved(ctx.project, data.like),
    ctx.project.core.tokenDefaults,
  );
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
      palette: pal && paletteReport(pal, data, theme),
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
 * The palette part of `show`: its files, each family with its seed and the
 * stops that feed each token, the contrast behind each stop choice, and the
 * tokens an exact token setting overrides.
 * @param {import('./_palette.mjs').PaletteMapping} pal
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} slug
 * @returns {import('./theme-edit.type.mjs').ThemeEditPaletteReport}
 */
function paletteReport(pal, data, slug) {
  const exact = new Set(
    data.settings.filter(s => s.source === 'token' && !s.on).map(s => s.thing),
  );
  const f = paletteFiles(slug);
  return {
    config: f.config,
    file: f.palette,
    receipt: f.receipt,
    families: pal.families.map(fam => ({
      family: fam.id,
      seed: fam.seed,
      value: fam.value,
      exactToken: paletteToken(fam.id),
      tokens: Object.fromEntries(
        Object.entries(pal.tokens)
          .filter(([, v]) => v.family === fam.id)
          .map(([k, v]) => [
            k,
            {
              light: `stop ${v.light.stop}${v.light.alpha ? ` at opacity ${v.light.alpha}` : ''} ${v.light.color}`,
              dark: `stop ${v.dark.stop}${v.dark.alpha ? ` at opacity ${v.dark.alpha}` : ''} ${v.dark.color}`,
            },
          ]),
      ),
    })),
    contrast: pal.contrast.map(
      c =>
        `${c.token} ${c.mode}: stop ${c.stop}${c.stop !== c.preferred ? ` (from ${c.preferred})` : ''} is ${c.ratio}:1 on ${c.against}, needs ${c.needs}:1: ${c.pass ? 'pass' : 'FAIL'}`,
    ),
    overridden: Object.keys(pal.tokens).filter(k => exact.has(k)),
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
