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
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {
  AUTO_SPREAD,
  CORNERS,
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
  radiusAt,
  contrastProblems,
  describe,
  keyOf,
  loadTheme,
  maskedSettings,
  modesOf,
  nearest,
  partDefault,
  partsOf,
  undoArgs,
  withoutBadValues,
  NAME_RULE,
  readHistory,
  refuse,
  settingsProblem,
  resolvedTokens,
  shown,
  slugOk,
  themeFiles,
  buildTheme,
  staleBuild,
  EDITOR_SUFFIXES,
  themeSource,
  themeSourceProblem,
} from './_settings.mjs';
import {checkSetting, exampleOf, storedProblems} from './_check.mjs';
import {MODAL} from './_compiler.mjs';
import {
  PALETTE_DIALS,
  VIBRANCY_DEFAULT,
  paletteFiles,
  paletteMapping,
  paletteDialOf,
  paletteNotes,
} from './_palette.mjs';
import {renderPreview, renderSheet} from './_preview.mjs';
import {refreshPreviewRoute} from './_preview-app.mjs';
import {baseResolved, installLine} from './_project.mjs';
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
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';

const E = ERROR_CODES;

/**
 * @typedef {import('./theme-edit.type.mjs').ThemeEditChangeOptions} ChangeOptions
 */
/** The marker a `new` writes first and removes last. */
const NEW_MARKER = '.astryx-new.json';

/** Files a system or a tool puts in any folder; a folder of only these is empty. */
const FOLDER_JUNK = new Set(['.DS_Store', '.gitkeep', 'Thumbs.db']);

/**
 * What a stopped `new` left, when the folder holds its marker and only
 * files the editor writes for that name (its generated files, the source
 * exactly as it writes it, its pages, colors and temp files); null when
 * there is no marker or anything else is there. System files (.DS_Store)
 * stay.
 * @param {string} dir
 * @param {string} slug
 * @returns {string[] | null}
 */
function editorLeftovers(dir, slug) {
  if (!fs.existsSync(path.join(dir, NEW_MARKER))) return null;
  /** @type {string[]} */
  const files = [];
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
    if (e.isDirectory() && e.name === 'tokens') {
      for (const t of fs.readdirSync(p, {withFileTypes: true})) {
        if (!t.isFile() || !t.name.startsWith(`${slug}.palette`)) return null;
        files.push(path.join(p, t.name));
      }
      continue;
    }
    if (!e.isFile()) return null;
    if (e.name === `${slug}.theme.ts`) {
      // Only the source exactly as the editor writes it, never one changed
      // by hand.
      if (fs.readFileSync(p, 'utf8') !== themeSource(slug)) return null;
    } else if (!named(e.name)) return null;
    files.push(p);
  }
  return files;
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
    // The name as typed may be a theme that exists in another case.
    const exists = fs.existsSync(themeFiles(cwd, fixed).settings);
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `"${String(name ?? '').slice(0, 80)}" is not a theme name (${NAME_RULE})${exists ? `; ${fixed} is a theme here already` : ''}.`,
      {run: exists ? [`${P} show ${fixed}`] : [`${P} new ${fixed}`]},
    );
  }
  // A built-in theme's name would collide with the theme of that name the
  // app may also use.
  if (LIKE.includes(name))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} is a built-in theme; an editor theme needs a name of its own. To start from ${name}, build on it.`,
      {run: [`${P} new my-${name} --like ${name}`]},
    );
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
      run: [`${P} show ${name}`, `${P} set ${name} base neutral`],
    });
  // A `new` stopped part way (killed, out of memory) leaves its own marker
  // beside the files it wrote: only such a folder is cleared, and only
  // after every argument is checked. Anything else in the folder, or a
  // folder without the marker, is never touched.
  const left = fs.existsSync(f.dir) ? editorLeftovers(f.dir, name) : null;
  const holdsOther =
    fs.existsSync(f.dir) &&
    !left &&
    fs.readdirSync(f.dir).some(n => !FOLDER_JUNK.has(n));
  if (holdsOther)
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
  /** @type {import('./_settings.mjs').Ctx} */ (ctx).base = await baseResolved(
    ctx.project,
    data.like,
  );
  applyNewSettings(ctx, name, data, settings);
  /** @type {string[]} */
  const leftNotes = [];
  if (left && left.length) {
    for (const p of left) fs.rmSync(p, {force: true});
    try {
      fs.rmdirSync(path.join(f.dir, 'tokens'));
    } catch {
      // Not there, or it holds something else.
    }
    const shownLeft = left.filter(p => path.basename(p) !== NEW_MARKER);
    leftNotes.push(
      `cleared ${shownLeft.length} file${shownLeft.length === 1 ? '' : 's'} a stopped \`new\` left in themes/${name}/ (${shownLeft
        .slice(0, 4)
        .map(p => path.relative(f.dir, p))
        .join(', ')}${shownLeft.length > 4 ? ', …' : ''}), then made the theme`,
    );
  }
  // The marker goes first and comes off last: a `new` stopped between
  // leaves a folder the next `new` can prove it made.
  const dirMade = !fs.existsSync(f.dir);
  fs.mkdirSync(f.dir, {recursive: true});
  const marker = path.join(f.dir, NEW_MARKER);
  fs.writeFileSync(
    marker,
    JSON.stringify({pid: process.pid, started: Date.now()}),
  );
  /** @type {Awaited<ReturnType<typeof commitTheme>>} */
  let r;
  try {
    r = await commitTheme(ctx, name, data, {history: false});
  } catch (e) {
    fs.rmSync(marker, {force: true});
    if (dirMade)
      try {
        fs.rmdirSync(f.dir);
      } catch {
        // It holds something else now.
      }
    throw e;
  }
  fs.rmSync(marker, {force: true});
  const p = await previewAndRoute(ctx, name, data, png);
  /** @type {string[]} */
  const notes = [
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
            {
              run: [
                `${P} new ${slug} --${thing} ${quoteCommandArgument(s.value)}`,
              ],
            },
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
    .map(([k, v]) => `--${k} ${quoteCommandArgument(String(v))}`);
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
 * Refuse a theme whose saved exact tokens the type rules no longer take,
 * naming the undo that removes the one that fails.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} [skip]
 */
function refuseStoredTokens(ctx, slug, data, skip) {
  const bad = storedProblems(ctx, slug, data, skip);
  if (!bad.length) return;
  const one = bad.length === 1 ? bad[0] : null;
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
        ...(one && !one.scope
          ? [
              `${P} set ${slug} ${one.setting.thing} ${quoteCommandArgument(exampleOf(ctx.C.typeOf(one.setting.thing), one.setting.thing))}`,
            ]
          : []),
      ],
    },
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
  const {cwd = process.cwd(), png = false} = options;
  requireProject(cwd);
  // The setting this command changes or removes may be the bad one; any
  // other bad setting still refuses (or is left out when this fixes one).
  const target = /** @type {Partial<import('./_settings.mjs').Setting>} */ ({
    thing,
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
  if (sub !== 'undo') refuseStoredTokens(ctx, slug, data, thing);
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
  /** @type {import('./_settings.mjs').Setting} */
  let s;
  try {
    s = checkSetting(ctx, slug, data, thing, value, flags, sub === 'undo');
  } catch (e) {
    // A stored setting this Core no longer knows (a renamed part or
    // property, or a hand edit) can still be removed.
    const stored =
      sub === 'undo'
        ? data.settings.find(
            x =>
              x.thing === thing &&
              (x.on ?? null) === (flags.on ?? null) &&
              (x.when ?? null) === (flags.when ?? null) &&
              (x.state ?? null) === (flags.state ?? null) &&
              (x.mode ?? null) === (flags.mode ?? null),
          )
        : null;
    if (!stored) throw e;
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
        .replace(/^["']|["']$/g, '');
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
          `your ${data.settings.length} settings are kept`,
          ...otherModeNotes(data),
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
            x.on === s.on &&
            x.when === s.when &&
            x.state === s.state &&
            x.thing.startsWith(`${s.thing}-`) &&
            // Not part of border: its radius, collapse and spacing.
            !/^border-(radius|collapse|spacing)$|^border-[a-z]+-radius$/.test(
              x.thing,
            ),
        )
      : [];
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
  const styled = styledChanges(compiledBefore, compileTheme(ctx, data, base));
  const parts = partsOf(ctx, s);
  const kept =
    sub === 'set' && s.source === 'dial' && !s.on
      ? data.settings.filter(x => x.thing === s.thing && x.on).map(describe)
      : [];
  // The exact property a dial on a part competes with there.
  const DIAL_PROPERTY = /** @type {Record<string, RegExp>} */ ({
    corners: /radius$/,
    spacing: /^(padding|gap)(-|$)/,
  });
  const exactOver =
    sub === 'set' && s.source === 'dial' && s.on && DIAL_PROPERTY[s.thing]
      ? (data.settings.find(
          x =>
            x.source === 'property' &&
            DIAL_PROPERTY[s.thing].test(x.thing) &&
            x.on &&
            partsOf(ctx, x).some(t => partsOf(ctx, s).includes(t)) &&
            (x.when ?? '') === (s.when ?? '') &&
            (x.state ?? '') === (s.state ?? ''),
        ) ?? null)
      : null;
  /** @type {string[]} */
  const notes = [
    ...(covered.length ? [`replaces ${covered.map(describe).join(', ')}`] : []),
    ...(covers.length
      ? [
          `comes after ${covers.map(describe).join(', ')}, so ${covers.length > 1 ? 'those parts show' : `${covers[0].on} shows`} this value now; set ${covers.length > 1 ? 'one' : 'it'} again to make it win`,
        ]
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
          `${describe(exactOver)} is an exact property and wins over ${s.thing} there, so this shows only after \`${P} undo ${slug} ${undoArgs(exactOver)}\``,
        ]
      : []),
    // An accepted change that the theme already showed says so.
    ...(sub === 'set' &&
    !exactOver &&
    // With the last build unreadable, nothing was compared.
    !r.notes.some(n => n.includes('could not be read')) &&
    !r.unchanged &&
    !r.changed.length &&
    !styled.length &&
    !ctx.unchecked
      ? [
          `this changes nothing you see: the theme already shows ${describe(s)} (it is saved, and stays when the base theme changes)`,
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
  if (PALETTE_DIALS.includes(s.thing) && sub === 'set')
    notes.push(
      ...paletteNotes(
        paletteMapping(cwd, slug, data, base, ctx.project.core.tokenDefaults),
        s.thing,
        slug,
        modesOf(data),
      ),
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
    for (const [m, why] of maskedSettings(data))
      notes.push(`${describe(m)}: ${why}`);
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
  refuseStoredTokens(ctx, theme, data);
  // show renders its pages with the project's React: when that cannot
  // render, nothing is built or written, and the result says how to fix it.
  if (ctx.unchecked && !readOnly)
    refuse(
      E.ERR_RENDER_FAILED,
      `${theme} cannot be shown: ${ctx.unchecked} Nothing was written.`,
      {
        // Only a missing React is fixed by installing it; two copies or a
        // component that throws are named in the message.
        run:
          ctx.uncheckedCode === 'ERR_RENDER_MISSING_DEPENDENCY'
            ? [installLine(cwd, ['react', 'react-dom'])]
            : [`${P} show ${theme}`],
      },
    );
  const f = themeFiles(cwd, theme);
  // A build that does not match the settings (a command stopped mid-build,
  // a hand edit, another CLI) is made again from the settings, and said.
  const stale = staleBuild(cwd, theme, data);
  const brokenSource = themeSourceProblem(cwd, theme);
  if (stale && !brokenSource && !readOnly) await buildTheme(ctx, theme, data);
  // A built module that cannot be read (damaged by hand) is built again.
  /** @type {string | null} */
  let unreadable = null;
  const res = await resolvedTokens(ctx, theme).catch(async e => {
    if (e instanceof AstryxError || readOnly) throw e;
    unreadable = `${theme}.js could not be read (${e instanceof Error ? e.message.split('\n')[0] : String(e)}), so it was built again from the settings`;
    await buildTheme(ctx, theme, data);
    return resolvedTokens(ctx, theme);
  });
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
  const preview = readOnly
    ? shown(cwd, f.preview)
    : await renderPreview(ctx, theme, data);
  const previewStale = readOnly ? [] : await keepPreviewRoute(ctx, theme);
  const sheet = readOnly
    ? {file: shown(cwd, f.sheet), components: 0, skipped: []}
    : await renderSheet(ctx, theme, data, {group: section});
  const modes = modesOf(data);
  const shots =
    png && !readOnly
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
        ...(readOnly
          ? [
              `the theme lock could not be taken, so nothing was written: this is the last build as it is${stale ? ` (it does not match the settings: ${stale})` : ''}, and the pages were not made again`,
            ]
          : stale
            ? [
                `the build did not match ${theme}.settings.json (${stale}), so it was built again from the settings`,
              ]
            : []),
        ...(unreadable ? [unreadable] : []),
        ...(brokenSource
          ? [
              `${brokenSource}, so settings cannot take effect; put back the import, extends and name lines in ${theme}.theme.ts`,
            ]
          : []),
        ...checked.filter(x => x.startsWith('not checked')),
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
      partValues: partValues(
        Object.assign(ctx, {base: await baseResolved(ctx.project, data.like)}),
        data,
        res,
        modes[0],
      ),
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
  const masked = maskedSettings(data);
  return data.settings
    .filter(
      s =>
        s.source === 'dial' && s.on && ['corners', 'spacing'].includes(s.thing),
    )
    .map(s => {
      // A setting a later group setting covers shows that one's value.
      const hidden = masked.get(s);
      if (hidden) return `${describe(s)} -> not shown: ${hidden}`;
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
 * @returns {{vibrancy: number | null, colors: import('./theme-edit.type.mjs').ThemeEditColor[], colorNotes: string[]}}
 */
function colorsReport(pal, data) {
  if (!pal) return {vibrancy: null, colors: [], colorNotes: []};
  /** What the user set for each token exactly, in each mode. */
  const exactBy =
    /** @type {Record<string, {light?: string, dark?: string}>} */ ({});
  for (const s of data.settings)
    if (s.source === 'token' && !s.on && !s.when && !s.state)
      for (const m of s.mode ? [s.mode] : ['light', 'dark'])
        (exactBy[s.thing] ??= {})[/** @type {'light' | 'dark'} */ (m)] =
          s.value;
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
            exactBy[k]
              ? modes
                  .map(m =>
                    exactBy[k][m] != null
                      ? `${m} ${exactBy[k][m]} (your exact setting wins over the generated ${shade(v[m])})`
                      : `${m} ${shade(v[m])}`,
                  )
                  .join(', ')
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
  // base and mode are not settings in the list: undoing one goes back to
  // what the theme was made with (the oldest step the history keeps).
  if (thing === 'base' || thing === 'mode') {
    requireProject(cwd);
    const now = loadTheme(cwd, theme, thing);
    const [first] = readHistory(themeFiles(cwd, theme).history).steps;
    /** @type {any} */
    let made = now;
    try {
      if (first) made = JSON.parse(first.replace(/^\uFEFF/, ''));
    } catch {
      made = now;
    }
    const of = (/** @type {any} */ d) =>
      thing === 'base' ? (d?.like ?? 'none') : (d?.mode ?? 'both');
    if (of(made) === of(now))
      refuse(
        E.ERR_THEME_NOT_SET,
        `${thing} was never changed: it is ${of(now)}, as ${theme} was made.`,
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
  // A top step equal to the settings now (left by an undo stopped between
  // its two writes) changes nothing: skip it.
  const nowText = fs.readFileSync(f.settings, 'utf8');
  const same = (/** @type {string} */ a, /** @type {string} */ b) => {
    try {
      return (
        JSON.stringify({...JSON.parse(a.replace(/^\uFEFF/, '')), lifted: 0}) ===
        JSON.stringify({...JSON.parse(b.replace(/^\uFEFF/, '')), lifted: 0})
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
  const committed = await commitTheme(ctx, theme, prev, {
    history: false,
    historyAfter: history,
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
      stepsLeft: history.length,
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
