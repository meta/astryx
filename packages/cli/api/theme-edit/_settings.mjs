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

import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {AstryxError} from '../error.mjs';
import {logger} from '../logger.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {themeBuildForReport} from '../theme/build/build.mjs';
import {
  AUTO_SPREAD,
  CORNERS,
  FAMILIES,
  FONTS,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  OPEN_FONTS,
  P,
  SPACING,
  SURFACES,
  SURFACE_PARTS,
  TEXT_SIZE,
  TYPE_STYLES,
  familyOf,
} from './_tables.mjs';
import {accentSet, parseColor, ratio} from './_color.mjs';
import {MODAL} from './_compiler.mjs';
import {baseResolved, baseThemeFile} from './_project.mjs';

/**
 * One setting the CLI owns.
 * @typedef {object} Setting
 * @property {string} thing - A dial, a token (`--color-accent`), or a CSS property.
 * @property {string} value
 * @property {'dial' | 'token' | 'property'} source
 * @property {string} [on] - A part, a family, or a typography role (font).
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
 */

/** @typedef {{project: import('./_project.mjs').ThemeProject, C: import('./_compiler.mjs').Compiler}} Ctx */

/** @param {string} s */
export const slugOk = s => /^[a-z][a-z0-9-]*$/.test(s ?? '');
/** @param {string} s */
export const kebab = s =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
/** @param {string} s */
export const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
/** Quote a value for a suggested command. @param {unknown} v */
export const q = v =>
  /[\s"#(]/.test(String(v)) ? `"${String(v).replace(/"/g, '\\"')}"` : String(v);

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

/** A path as the person sees it: relative to cwd. @param {string} cwd @param {string} f */
export const shown = (cwd, f) =>
  path.relative(cwd, f).split(path.sep).join('/');

/** @param {string} a @param {string} b */
function lev(a, b) {
  const d = Array.from({length: a.length + 1}, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  }
  return d[a.length][b.length];
}

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
          c.includes(x) || x.includes(c) ? 1 : lev(x, c),
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
 * @returns {ThemeData}
 */
export function loadTheme(cwd, slug) {
  if (!slugOk(slug))
    refuse(
      ERROR_CODES.ERR_INVALID_ARGUMENT,
      `"${slug ?? ''}" is not a theme name (lowercase letters, digits, dashes).`,
      {run: [`${P} new my-theme`]},
    );
  const f = themeFiles(cwd, slug);
  if (!fs.existsSync(f.settings)) {
    const have = fs.existsSync(f.root)
      ? fs
          .readdirSync(f.root)
          .filter(d => fs.existsSync(themeFiles(cwd, d).settings))
      : [];
    refuse(
      ERROR_CODES.ERR_UNKNOWN_THEME,
      `There is no theme "${slug}" made by this command (no themes/${slug}/${slug}.settings.json).`,
      {didYouMean: nearest(slug, have), run: [`${P} new ${slug}`]},
    );
  }
  try {
    return JSON.parse(fs.readFileSync(f.settings, 'utf8'));
  } catch (e) {
    throw new AstryxError(
      `themes/${slug}/${slug}.settings.json is not valid JSON (${e instanceof Error ? e.message : String(e)}). Fix it by hand, or run ${P} undo ${slug}.`,
      [],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
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
 * The parts a setting styles: the family when `--on` names one, the whole
 * family of an always-alike member unless `--only`, else the one part.
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

/** @param {ThemeData} d @returns {Array<'light' | 'dark'>} */
export const modesOf = d =>
  d.mode === 'light-only'
    ? ['light']
    : d.mode === 'dark-only'
      ? ['dark']
      : ['light', 'dark'];

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
  // Core quotes the family itself, so it is stored without quotes.
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
  if (v.includes(',')) {
    const parts = v
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
    return {
      family: unquote(parts[0]),
      fallbacks: parts.slice(1).join(', ') || 'system-ui, sans-serif',
      pkg: pkgOf(parts[0]),
    };
  }
  return {
    family: unquote(v),
    fallbacks: 'system-ui, sans-serif',
    pkg: pkgOf(v),
  };
}

/**
 * What a part reads for a property when the theme does not set it, so a
 * one-mode component setting keeps the other mode as it was.
 * @param {Ctx} ctx
 * @param {string} target
 * @param {string} prop camelCase or kebab-case
 * @param {string | undefined} when
 */
function partDefault(ctx, target, prop, when) {
  const k = kebab(prop);
  const g = ctx.C.groupOfProp(k === 'background' ? 'background-color' : k);
  const want = (/** @type {import('./_compiler.mjs').Read} */ x) =>
    x.props.some(
      p => p === k || (k === 'background' && p === 'background-color'),
    );
  const reads = g ? ctx.C.partReads(target, g).filter(want) : [];
  const wv = when ? when.replace(':', '=') : null;
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
  const TOKENS = ctx.project.core.tokenDefaults;
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
      const other = prev ?? partDefault(ctx, target, prop, s.when) ?? v;
      const split = (/** @type {string} */ x, /** @type {1 | 2} */ side) =>
        x.replace(/^light-dark\((.*),\s*(.*)\)$/, `$${side}`);
      b[prop] =
        s.mode === 'light'
          ? `light-dark(${v}, ${prev ? split(prev, 2) : other})`
          : `light-dark(${prev ? split(prev, 1) : other}, ${v})`;
    } else b[prop] = v;
  };
  const headingWeightTokens = Object.keys(TOKENS).filter(k =>
    /^--text-(heading|display)-\d-weight$/.test(k),
  );
  for (const s of data.settings) {
    const parts = partsOf(ctx, s);
    if (s.source === 'dial') {
      if (s.thing === 'corners') {
        const px = cornerPx(s.value);
        const val = (/** @type {number} */ x) =>
          px >= 9999 ? '9999px' : `${x}px`;
        if (parts.length)
          for (const t of parts)
            putComp({...s, mode: undefined}, t, 'borderRadius', val(px));
        else {
          putTok('--radius-element', val(px));
          putTok('--radius-inner', val(Math.round(px * 0.6)));
          putTok(
            '--radius-container',
            px >= 9999 ? '24px' : `${Math.round(px * 1.25)}px`,
          );
          putTok(
            '--radius-page',
            px >= 9999 ? '32px' : `${Math.round(px * 2.5)}px`,
          );
        }
      } else if (s.thing === 'accent') {
        for (const [k, v] of Object.entries(accentSet(s.value))) {
          if (parts.length)
            for (const t of parts)
              putComp(s, t, k, Array.isArray(v) ? v[0] : v);
          else
            putTok(
              k,
              s.mode
                ? Array.isArray(v)
                  ? s.mode === 'light'
                    ? v[0]
                    : v[1]
                  : v
                : v,
              s.mode,
            );
        }
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
        theme.typography.scale = {
          base: theme.typography.scale?.base ?? 14,
          ratio: T.ratio,
        };
        if (T.weight) for (const k of headingWeightTokens) putTok(k, T.weight);
        if (T.tracking)
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
        theme.typography.scale = {
          base: textPx(s.value),
          ratio: theme.typography.scale?.ratio ?? 1.2,
        };
      } else if (s.thing === 'spacing') {
        const f = SPACING.find(([n]) => n === s.value)?.[1] ?? 1;
        for (const [k, v] of Object.entries(
          /** @type {Record<string, string>} */ (TOKENS),
        )) {
          let nv = null;
          if (/^--spacing-/.test(k) && /rem$/.test(v))
            nv = `${Number((parseFloat(v) * f).toFixed(3))}rem`;
          if (/^--size-element-/.test(k) && /px$/.test(v))
            nv = `${Math.round(parseFloat(v) * f)}px`;
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
  for (const [k, {light, dark}] of Object.entries(tok)) {
    const l = light ?? base.light[k] ?? TOKENS[k];
    const d = dark ?? base.dark[k] ?? TOKENS[k];
    theme.tokens[k] = l === d ? l : [l, d];
  }
  if (!Object.keys(theme.tokens).length) delete theme.tokens;
  if (!Object.keys(theme.components).length) delete theme.components;
  return theme;
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
    for (const m of cssText.matchAll(re)) {
      for (const prop of props) {
        // A prop named for the property itself (weight for font-weight,
        // color for color) is the author's own choice: it keeps winning.
        const css = kebab(prop);
        if (css === m[1] || css.endsWith(`-${m[1]}`)) continue;
        if (new RegExp(`(^|[;\\s])${kebab(prop)}\\s*:`).test(m[3]))
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

/** The generated theme source. @param {string} slug @param {ThemeData} data @param {any} theme */
function settingsSource(slug, data, theme) {
  const like = data.like;
  return [
    `// Generated by \`${P}\` from ${slug}.settings.json on every change: do not edit.`,
    `// Change it with \`${P} set ${slug} ...\`; your own changes go in ${slug}.theme.ts.`,
    "import {defineTheme} from '@astryxdesign/core/theme';",
    ...(like
      ? [
          `import {${like}Theme as base} from '@astryxdesign/theme-${like}/built';`,
        ]
      : []),
    '',
    `export const ${camel(slug)}Settings = defineTheme({`,
    ...(like ? ['  extends: base,'] : []),
    ...JSON.stringify({...theme, name: `${slug}-settings`}, null, 2)
      .split('\n')
      .slice(1, -1),
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

/**
 * Generate the theme source, build it with the theme build, then repeat any
 * part setting a more specific rule would beat and build again.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {ThemeData} data
 * @returns {Promise<{warnings: string[], lifted: string[]}>}
 */
export async function buildTheme(ctx, slug, data) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  if (data.like) baseThemeFile(ctx.project, data.like);
  const theme = compileTheme(
    ctx,
    data,
    await baseResolved(ctx.project, data.like),
  );
  fs.mkdirSync(f.dir, {recursive: true});
  fs.writeFileSync(f.settingsTs, settingsSource(slug, data, theme));
  if (!fs.existsSync(f.ts)) fs.writeFileSync(f.ts, themeModuleSource(slug));
  let receipt = await runBuild(ctx, slug);
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
    fs.writeFileSync(f.settingsTs, settingsSource(slug, data, theme));
    receipt = await runBuild(ctx, slug);
  }
  // Font notices are reported by the font dial itself, once.
  const warnings = [
    ...(receipt?.data?.warnings ?? []),
    ...(receipt?.data?.notices ?? []),
  ]
    .map(String)
    .filter(w => !/^Font "/.test(w));
  return {warnings, lifted};
}

/** @param {Ctx} ctx @param {string} slug @returns {Promise<any>} */
async function runBuild(ctx, slug) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  const silent = logger.silent;
  logger.setSilent(true);
  try {
    const {receipt} = await themeBuildForReport(
      shown(cwd, f.ts),
      {out: shown(cwd, f.css)},
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
  const mod = await import(
    `${pathToFileURL(f.js).href}?t=${Date.now()}${Math.random()}`
  );
  const t = Object.values(mod).find(
    v => v && typeof v === 'object' && typeof v.name === 'string',
  );
  const {core} = ctx.project;
  return {
    light: core.resolveThemeTokens(t, {mode: 'light'}),
    dark: core.resolveThemeTokens(t, {mode: 'dark'}),
  };
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
  /** @param {import('./_parts.mjs').PaintSide} side @param {'fg' | 'bg'} which @param {string} m */
  const override = (side, which, m) => {
    if (!side.target) return null;
    const props =
      which === 'fg' ? ['color'] : ['background', 'background-color'];
    const hit = [...data.settings]
      .reverse()
      .find(
        x =>
          partsOf(ctx, x).includes(/** @type {string} */ (side.target)) &&
          !x.when &&
          !x.state &&
          (!x.mode || x.mode === m) &&
          ((x.source === 'property' && props.includes(x.thing)) ||
            (x.source === 'token' && side.tokens.includes(x.thing))),
      );
    return hit?.value ?? null;
  };
  /** @type {(p: import('./_parts.mjs').TextPair, side: 'fg' | 'bg', m: string) => string | null} */
  const value = (p, side, m) => {
    const s = p[side];
    return (
      override(s, side, m) ??
      (s.tokens.length
        ? res[/** @type {'light' | 'dark'} */ (m)][s.tokens[0]]
        : s.raw)
    );
  };
  /** @type {(p: import('./_parts.mjs').TextPair, side: 'fg' | 'bg', m: string) => string | null} */
  const baseValue = (p, side, m) => {
    const s = p[side];
    return s.tokens.length
      ? base[/** @type {'light' | 'dark'} */ (m)][s.tokens[0]]
      : s.raw;
  };
  return ctx.C.contrast(value, baseValue, modesOf(data), {
    parseColor,
    ratio,
  }).map(
    x =>
      `text in ${x.part} ("${x.sample}") is ${x.ratio}:1 in ${x.mode} (${x.fg} on ${x.bgPart ?? 'the page'}'s ${x.bg}); text needs 4.5:1`,
  );
}

/**
 * Write the settings, build, and on a failed build put back what was there.
 * Returns what changed in the resolved tokens and the lifted keys that are
 * new since the last build.
 * @param {Ctx} ctx
 * @param {string} slug
 * @param {ThemeData} data
 * @param {{history: boolean}} options
 */
export async function commitTheme(ctx, slug, data, {history}) {
  const {cwd} = ctx.project;
  const f = themeFiles(cwd, slug);
  const snapBefore = fs.existsSync(f.settings)
    ? fs.readFileSync(f.settings, 'utf8')
    : null;
  const resBefore =
    snapBefore && fs.existsSync(f.js)
      ? await resolvedTokens(ctx, slug).catch(() => null)
      : null;
  const liftedBefore = new Set(
    snapBefore ? (JSON.parse(snapBefore).lifted ?? []) : [],
  );
  fs.mkdirSync(f.dir, {recursive: true});
  /** @type {{warnings: string[], lifted: string[]}} */
  let built;
  try {
    built = await buildTheme(ctx, slug, data);
  } catch (e) {
    if (snapBefore) {
      fs.writeFileSync(f.settings, snapBefore);
      await buildTheme(ctx, slug, JSON.parse(snapBefore)).catch(() => null);
    } else fs.rmSync(f.dir, {recursive: true, force: true});
    if (e instanceof AstryxError && e.code === ERROR_CODES.ERR_UNKNOWN_THEME)
      throw e;
    const why = e instanceof Error ? e.message : String(e);
    throw new AstryxError(
      `The theme did not build, so the change was undone: ${why.split('\n').slice(0, 5).join(' | ')}`,
      [],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  data.lifted = built.lifted;
  fs.writeFileSync(f.settings, `${JSON.stringify(data, null, 2)}\n`);
  if (snapBefore && history) {
    const h = fs.existsSync(f.history)
      ? JSON.parse(fs.readFileSync(f.history, 'utf8'))
      : [];
    h.push(snapBefore);
    fs.writeFileSync(f.history, JSON.stringify(h.slice(-80)));
  }
  const res = await resolvedTokens(ctx, slug);
  /** @type {string[]} */
  const changed = [];
  const modes = modesOf(data);
  if (resBefore) {
    for (const m of modes) {
      for (const k of Object.keys(res[m])) {
        if (resBefore[m][k] === res[m][k]) continue;
        const modal = MODAL.has(ctx.C.typeOf(k));
        if (!modal && m === 'dark' && modes.length > 1) continue;
        changed.push(
          `${k}${modal && modes.length > 1 ? ` (${m})` : ''}: ${resBefore[m][k]} -> ${res[m][k]}`,
        );
      }
    }
  }
  return {
    changed,
    res,
    problems: await contrastProblems(ctx, data, res),
    warnings: built.warnings,
    lifted: built.lifted.filter(x => !liftedBefore.has(x)),
  };
}

/** @param {Ctx} ctx @param {ThemeData} data */
export function fontPackages(ctx, data) {
  /** @type {Array<{pkg: string, installed: boolean}>} */
  const out = [];
  for (const s of data.settings) {
    if (s.thing !== 'font') continue;
    const pkg = fontOf(s.value).pkg;
    if (!pkg || out.some(x => x.pkg === pkg)) continue;
    let installed = true;
    try {
      ctx.project.req.resolve(`${pkg}/package.json`);
    } catch {
      installed = false;
    }
    out.push({pkg, installed});
  }
  return out;
}

export {partDefault};
