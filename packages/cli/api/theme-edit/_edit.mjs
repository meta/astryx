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
  DIALS,
  FAMILIES,
  KEY_TOKENS,
  LIKE,
  P,
  SPACING,
  TYPE_STYLES,
  familyOf,
} from './_tables.mjs';
import {
  commitTheme,
  compileTheme,
  cornerPx,
  contrastProblems,
  describe,
  keyOf,
  loadTheme,
  maskedSettings,
  modesOf,
  nearest,
  partDefault,
  partsOf,
  q,
  withoutBadValues,
  readHistory,
  refuse,
  settingsProblem,
  resolvedTokens,
  shown,
  slugOk,
  themeFiles,
  buildCurrent,
  buildTheme,
} from './_settings.mjs';
import {checkSetting} from './_check.mjs';
import {MODAL} from './_compiler.mjs';
import {
  PALETTE_DIALS,
  VIBRANCY_DEFAULT,
  paletteFiles,
  paletteMapping,
  paletteNotes,
} from './_palette.mjs';
import {renderPreview, renderSheet} from './_preview.mjs';
import {refreshPreviewRoute} from './_preview-app.mjs';
import {baseResolved} from './_project.mjs';
import {
  requireProject,
  context,
  pictures,
  fontNotes,
  styledChanges,
  previewAfter,
  checkSection,
} from './_context.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const E = ERROR_CODES;

/**
 * @typedef {import('./theme-edit.type.mjs').ThemeEditChangeOptions} ChangeOptions
 */
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
  const {cwd = process.cwd(), like, png = false, settings = {}} = options;
  requireProject(cwd);
  if (!slugOk(name)) {
    const fixed =
      String(name ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^[^a-z]+/, '')
        .replace(/-+$/, '')
        .slice(0, 64) || 'my-theme';
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `"${String(name ?? '').slice(0, 80)}" is not a theme name (lowercase letters, digits and dashes, starting with a letter, 64 characters at most).`,
      {run: [`${P} new ${fixed}`]},
    );
  }
  const f = themeFiles(cwd, name);
  // A link or a file where the theme goes is never written through or
  // replaced.
  for (const [p, what] of /** @type {const} */ ([
    [f.root, 'themes/'],
    [f.dir, `themes/${name}`],
  ])) {
    const st = fs.lstatSync(p, {throwIfNoEntry: false});
    if (st && (st.isSymbolicLink() || !st.isDirectory()))
      refuse(
        E.ERR_FILE_EXISTS,
        `${what} is ${st.isSymbolicLink() ? 'a link' : 'a file'}, so a theme is not made there.`,
        {run: [`${P} new ${name}-copy`]},
      );
  }
  if (fs.existsSync(f.settings))
    refuse(E.ERR_FILE_EXISTS, `Theme "${name}" already exists.`, {
      run: [`${P} show ${name}`, `${P} set ${name} base <theme>`],
    });
  if (fs.existsSync(f.dir) && fs.readdirSync(f.dir).length)
    refuse(
      E.ERR_FILE_EXISTS,
      `themes/${name}/ already holds files this command did not make; choose another name.`,
      {run: [`${P} new ${name}-copy`]},
    );
  if (like != null && !LIKE.includes(like))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `--like takes a built-in theme (${LIKE.join(', ')}), not "${like}"${fs.existsSync(themeFiles(cwd, String(like)).settings) ? `; ${like} is a theme made here, and a new theme builds only on a built-in one` : ''}.`,
      {
        didYouMean: nearest(String(like).toLowerCase(), LIKE),
        run: [`${P} new ${name}`],
      },
    );
  const ctx = await context(cwd);
  /** @type {import('./_settings.mjs').ThemeData} */
  const data = {name, ...(like ? {like} : {}), mode: 'both', settings: []};
  applyNewSettings(ctx, name, data, settings);
  const r = await commitTheme(ctx, name, data, {history: false});
  const p = await previewAndRoute(ctx, name, data, png);
  /** @type {string[]} */
  const notes = data.settings.some(s => s.thing === 'font')
    ? fontNotes(ctx, data)
    : [];
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
 */
function applyNewSettings(ctx, slug, data, settings) {
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
    for (const value of Array.isArray(given) ? given : [given]) {
      /** @type {import('./_settings.mjs').Setting} */
      let s;
      try {
        s = checkSetting(ctx, slug, data, thing, String(value), {}, false);
      } catch (e) {
        throw asNewRefusal(e, slug, settings);
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
            {run: [`${P} new ${slug} --${thing} ${q(s.value)}`]},
          );
        data.settings.push(s);
      }
    }
  }
}

/**
 * A refusal from a setting `new` was given, with its suggestions turned
 * into `new` commands: the theme does not exist yet, so a `set` would fail.
 * @param {unknown} e
 * @param {string} slug
 * @param {Record<string, string | string[] | undefined>} settings
 */
function asNewRefusal(e, slug, settings) {
  if (!(e instanceof AstryxError)) return e;
  const flags = Object.entries(settings)
    .filter(([, v]) => v != null)
    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map(x => [k, x]))
    .map(([k, v]) => `--${k} ${q(v)}`);
  const setPrefix = `${P} set ${slug} `;
  e.suggestions = (e.suggestions ?? []).map(s => {
    if (s.name === `${P} set --help`) return {...s, name: `${P} new --help`};
    if (!s.name.startsWith(setPrefix)) return s;
    const [thing, ...rest] = s.name.slice(setPrefix.length).split(' ');
    if (thing.startsWith('--') || !DIALS[thing]) return s;
    const keep = flags.filter(f => !f.startsWith(`--${thing} `));
    return {
      ...s,
      name: [`${P} new ${slug}`, ...keep, `--${thing} ${rest.join(' ')}`].join(
        ' ',
      ),
    };
  });
  return e;
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
  return {...p, previewStale: await keepPreviewRoute(ctx, slug)};
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
  const data = loadTheme(cwd, slug, thing);
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
    const p = await previewAndRoute(ctx, slug, data, png);
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
        styled: [],
        kept: [],
        lifted: r.lifted,
        notes: [
          ...(r.unchanged
            ? [`no change: ${s.thing} is already ${s.value}`]
            : []),
          ...r.notes,
          `your ${data.settings.length} settings are kept`,
          ...otherModeNotes(data),
        ],
        problems: r.problems,
        warnings: r.warnings,
        ...p,
      },
    };
  }
  const k = keyOf(s);
  const prevIdx = data.settings.findIndex(x => keyOf(x) === k);
  /** @type {string | null} */
  let vibrancyGone = null;
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
  const notes = [
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
  if (PALETTE_DIALS.includes(s.thing) && sub === 'set')
    notes.push(
      ...paletteNotes(
        paletteMapping(cwd, slug, data, base, ctx.project.core.tokenDefaults),
        s.thing,
        slug,
        modesOf(data),
      ),
    );
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
          ? `; for a white or off-white page: ${P} set ${slug} --color-background-body "#ffffff"${modes.length > 1 ? ' --mode light' : ''}`
          : `; for another page color: ${P} set ${slug} --color-background-body "<color>"`
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
    for (const [m, why] of maskedSettings(data))
      notes.push(`${describe(m)}: ${why}`);
  if (s.thing === 'type' && sub === 'set' && TYPE_STYLES[s.value].ratio > 1.2)
    notes.push(
      'text below the base size keeps its standard sizes, so small text stays readable',
    );
  const p = await previewAndRoute(ctx, slug, data, png);
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
      replaced: sub === 'set' ? prev : null,
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
      .map(d => `${P} set ${slug} ${d} "${base.light[word[d]] ?? '<color>'}"`)
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
  const {cwd = process.cwd(), png = false, section} = options;
  requireProject(cwd);
  checkSection(section);
  const data = loadTheme(cwd, theme);
  const ctx = await context(cwd);
  const f = themeFiles(cwd, theme);
  // A build that does not match the settings (a command stopped mid-build,
  // a hand edit, another CLI) is made again from the settings, and said.
  const stale = !buildCurrent(cwd, theme, data);
  if (stale) await buildTheme(ctx, theme, data);
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
  const previewStale = await keepPreviewRoute(ctx, theme);
  const sheet = await renderSheet(ctx, theme, data, {group: section});
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
      settings: data.settings.map(s => {
        const masked = maskedSettings(data).get(s);
        return {...s, parts: partsOf(ctx, s), ...(masked ? {masked} : {})};
      }),
      notes: [
        ...(stale
          ? [
              `the build did not match ${theme}.settings.json (a command stopped while building, or a hand edit), so it was built again from the settings`,
            ]
          : []),
        ...fontNotes(ctx, data),
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
      partValues: partValues(ctx, data, res, modes[0]),
      ...colorsReport(pal, data),
      problems,
      preview,
      previewStale,
      sheet: sheet.file,
      sheetComponents: sheet.components,
      skipped: sheet.skipped,
      pictures: shots.files,
      pictureProblem: shots.problem,
      colorFiles: pal ? colorFiles(theme) : null,
    },
  };
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
  return data.settings
    .filter(
      s =>
        s.source === 'dial' && s.on && ['corners', 'spacing'].includes(s.thing),
    )
    .map(s => {
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
          const token =
            /var\((--[\w-]+)\)/.exec(
              partDefault(ctx, t, 'borderRadius', undefined) ?? '',
            )?.[1] ??
            // Every variant reads it (none is the resting one).
            ctx.C.partReads(t, 'corners').find(x =>
              x.props.includes('border-radius'),
            )?.token ??
            (['containers', 'menus'].includes(familyOf(t) ?? '')
              ? '--radius-container'
              : 'unknown');
          byToken.set(token, [...(byToken.get(token) ?? []), t]);
        }
        const whole = [...byToken]
          .map(
            ([token, ts]) =>
              `${token === 'unknown' ? 'unknown' : `${token} ${res[mode][token] ?? 'unset'}`}${byToken.size > 1 ? ` for ${ts.join(', ')}` : ''}`,
          )
          .join('; ');
        return `${describe(s)} -> border-radius ${px >= 9999 ? 'fully round' : `${px}px`} on ${listed} (whole theme: ${whole})`;
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
 * @returns {{vibrancy: number | null, colors: import('./theme-edit.type.mjs').ThemeEditColor[], colorNotes: string[]}}
 */
function colorsReport(pal, data) {
  if (!pal) return {vibrancy: null, colors: [], colorNotes: []};
  const exact = new Set(
    data.settings.filter(s => s.source === 'token' && !s.on).map(s => s.thing),
  );
  /** @param {import('./_palette.mjs').StopRef} r */
  const shade = r =>
    r.family === 'black' || r.family === 'white'
      ? `${r.family} ${r.color}`
      : `${r.family ? `${r.family} ` : ''}${r.stop}${r.alpha ? ` at opacity ${r.alpha}` : ''} ${r.color}${r.exact ? ' (your exact color)' : ''}`;
  /** What the user set for each token exactly, by mode when it differs. */
  const exactValue = /** @type {Record<string, string>} */ ({});
  for (const s of data.settings)
    if (s.source === 'token' && !s.on)
      exactValue[s.thing] = [
        ...(exactValue[s.thing] ? [exactValue[s.thing]] : []),
        s.mode ? `${s.mode} ${s.value}` : s.value,
      ].join(', ');
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
            exact.has(k)
              ? `${exactValue[k]} (your exact setting wins over the generated ${shades(v)})`
              : shades(v),
          ]),
      ),
    })),
    colorNotes: [
      ...pal.notes,
      ...pal.contrast
        .filter(c => modes.includes(c.mode))
        .filter(c => c.note || !c.pass || c.stop !== c.preferred)
        .map(c =>
          c.note
            ? c.note
            : c.pass
              ? `${c.token} ${c.mode}: shade ${c.stop}, not ${c.preferred}, so it reads at ${c.ratio}:1 on ${c.against}`
              : `${c.token} ${c.mode}: only ${c.ratio}:1 on ${c.against} at shade ${c.stop} (needs ${c.needs}:1)`,
        ),
    ],
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
  const {steps: history, dropped} = readHistory(f.history);
  if (!history.length && dropped)
    refuse(
      E.ERR_THEME_INVALID,
      `${theme}.history.json is damaged, so there is no step to go back to.`,
      {
        fix: `delete ${shown(cwd, f.history)}: the next change starts a new history, and your settings stay as they are`,
        run: [`${P} show ${theme}`],
      },
    );
  if (!history.length)
    refuse(
      E.ERR_THEME_NOTHING_TO_UNDO,
      `Nothing to undo: ${theme} has no earlier change.`,
      {run: [`${P} show ${theme}`]},
    );
  const ctx = await context(cwd);
  const prevText = /** @type {string} */ (history.pop());
  let prev = /** @type {import('./_settings.mjs').ThemeData} */ (
    JSON.parse(prevText.replace(/^\uFEFF/, ''))
  );
  // A step always restores into this theme, whatever name it holds.
  prev.name = theme;
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
          fix: `delete ${shown(cwd, f.history)}: the next change starts a new history, and your settings stay as they are`,
          run: [`${P} show ${theme}`],
        },
      );
    prev = repaired.data;
    leftOut = repaired.dropped;
  }
  // The popped history is written with the change, inside its rollback.
  await commitTheme(ctx, theme, prev, {history: false, historyAfter: history});
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
      stepsLeft: history.length,
      ...p,
    },
  };
}
