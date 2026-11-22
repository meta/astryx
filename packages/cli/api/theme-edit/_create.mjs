// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The work behind `astryx experimental theme create <name> --traits`,
 * up to the check: turn a few typed traits into one complete theme file,
 * build it with the theme build, add it to the app and make it the app's
 * theme. The adapter then runs `theme check --fix` on it, which fills the
 * colors Core's palette generator makes from the colors the file sets.
 * Shape, type and space come from Core's own scales and the editor's dial
 * rungs. Only the subject's adapter imports this file.
 *
 * @input a theme name and its traits
 * @output the themeEdit.create envelope, without its check
 * @position api/theme-edit — adapter helper
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../foundation/fs/path-safety.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {LOCAL_THEME_ROOT} from '../../foundation/config/theme-state.mjs';
import {getCliInvocation} from '../../foundation/env/package-manager.mjs';
import {
  isThemeFolder,
  THEME_SLUG_RE,
} from '../../foundation/discovery/theme-discovery.mjs';
import {themeBuild, themeAdd, themeUse} from '../theme/theme.mjs';
import {context, coreApp} from './_context.mjs';
import {corePalette, packageInstalled} from './_project.mjs';
import {isColorToken} from './_compiler.mjs';
import {partForWord} from './_part-words.mjs';
import {
  camel,
  fontOf,
  fontsourceSuggestion,
  slugOk,
  spacingSteps,
  surfacePartStyles,
  surfaceVariantsOf,
} from './_settings.mjs';
import {NAME_RULE} from './_name-rule.mjs';
import {FLOATING_SURFACES, LIKE, SPACING, SURFACES} from './_tables.mjs';
import {
  alphaOf,
  compositeOver,
  hex,
  nearestLightness,
  oklabDistance,
  parseColor,
  plainOn,
  ratio,
} from './_color.mjs';
import {
  BAR_TINTS,
  CATEGORY_OR_CHART,
  INVERTED_SURFACES,
  menuParts,
} from './_look.mjs';
import {TEXT} from '../theme/palette/generate/mapping.mjs';
import {readTraits} from './_traits.mjs';
import {traitsThemeDoc, traitsThemeSource} from './_traits-source.mjs';

/** Token groups the file leaves to Core unless `tokens` sets one: motion is no trait. */
const LEFT_TO_CORE = /^--(?:duration|ease)-/;

/** The app's top bar, as the editor reads the words. */
const TOP_BAR = /** @type {string} */ (partForWord('top bar'));

/** The text and icon tokens the top bar gives its own text. */
const BAR_TEXT_TOKENS = ['--color-text-primary', '--color-icon-primary'];

/**
 * The quieter text tokens the bar sets for what it holds: a nav item at
 * rest reads them, and moves to the primary text under the pointer.
 */
const BAR_QUIET_TOKENS = ['--color-text-secondary', '--color-icon-secondary'];

/**
 * The least a bar's pointer tint moves the bar (in OKLab) to still show: a
 * step above the check's own threshold for a hover that shows.
 */
const BAR_TINT_SHOWS = 0.025;

/** How many steps a bar's tints take down toward the least that shows. */
const BAR_TINT_STEPS = 20;

/** @typedef {[number, number, number]} Rgb */

/** The contrast text needs to read: the palette's own measure. */
const TEXT_CONTRAST = TEXT;

/**
 * How far white stands out on a light bar's dark counterpart: room for its
 * quieter text and its pointer tints to read too.
 */
const BAR_DARK_CONTRAST = 7;

/**
 * Under this contrast with the page in its own mode, a bar's one color is
 * the page's own ground (a white bar on a white page).
 */
const GROUND_BAR_CONTRAST = 1.25;

/**
 * The tints a pointer or a press shows on the bar, set for what it holds:
 * the ones the check gives back to the parts inside a bar.
 */
const BAR_TINT_TOKENS = BAR_TINTS;

/** The density words and the spacing dial rung each one is. */
const DENSITY_RUNG = {compact: 'compact', normal: 'medium', roomy: 'roomy'};

/** @param {string} hex */
const isDark = hex => {
  const c = parseColor(hex);
  return c != null && plainOn(c) === '#ffffff';
};

/**
 * The halves a trait color gives. One color goes in the mode it belongs
 * to: a page, a surface or an edge in the mode of its own lightness; text
 * in the other one; an accent or a bar in both. A one-look theme puts it in
 * its look's mode.
 * @param {import('./_traits.mjs').TraitColor | undefined} c
 * @param {'ground' | 'text' | 'brand'} kind
 * @param {import('./_traits.mjs').Traits['look']} look
 * @returns {{light?: string, dark?: string}}
 */
function halves(c, kind, look) {
  if (!c) return {};
  if (c.one == null) return {light: c.light, dark: c.dark};
  if (look !== 'both') return {[look]: c.one};
  if (kind === 'brand') return {light: c.one, dark: c.one};
  const dark = isDark(c.one);
  return {[(kind === 'text' ? !dark : dark) ? 'dark' : 'light']: c.one};
}

/**
 * The readable one of white and black on a fill, as the check reads it.
 * @param {string} fill
 */
const textOn = fill => {
  const c = parseColor(fill);
  return c ? plainOn(c) : '#000000';
};

/**
 * A value for both modes: one value when the halves agree, else
 * light-dark().
 * @param {string} light
 * @param {string} dark
 */
const both = (light, dark) =>
  light === dark ? light : `light-dark(${light}, ${dark})`;

/**
 * The defineTheme input the traits describe, before Core resolves it into
 * explicit values.
 * @param {Awaited<ReturnType<typeof context>>} ctx
 * @param {import('./_traits.mjs').Traits} traits
 */
async function traitsInput(ctx, traits) {
  const core = ctx.project.core;
  const {project} = ctx;
  const look = traits.look;
  /** @type {Record<string, string | [string, string]>} */
  const tokens = {};
  /** @type {Record<string, Record<string, Record<string, string>>>} */
  const components = {};
  /** @type {string[]} What create changed from the traits, said in the result. */
  const notes = [];
  // Colors: the traits' colors, each in the mode it belongs to. The
  // palette Core's generator makes from the page (the neutral seed) and the
  // accent names the colors `theme check --fix` fills; the file leaves
  // those to it.
  const page = halves(traits.page, 'ground', look);
  const accent = halves(traits.accent, 'brand', look);
  const seedMode = look === 'dark' ? 'dark' : 'light';
  const neutralSeed = page[seedMode] ?? page.light ?? page.dark;
  const accentSeed = accent[seedMode] ?? accent.light ?? accent.dark;
  /** @type {any} */
  let palette;
  if (neutralSeed || accentSeed) {
    const {themePalette, PALETTE_RECIPE_V2} = await corePalette(project);
    palette = themePalette({
      ...(accentSeed ? {accent: accentSeed} : {}),
      ...(neutralSeed ? {neutral: neutralSeed} : {}),
      ...(PALETTE_RECIPE_V2 ? {recipe: PALETTE_RECIPE_V2} : {}),
    });
  }
  /** @type {Record<string, {light?: string, dark?: string}>} */
  const exact = {};
  /** @param {string[]} names @param {{light?: string, dark?: string}} h */
  const give = (names, h) => {
    for (const n of names) exact[n] = {...exact[n], ...h};
  };
  give(['--color-background-body'], page);
  give(
    [
      '--color-background-surface',
      '--color-background-card',
      '--color-background-popover',
    ],
    halves(traits.surface, 'ground', look),
  );
  give(['--color-text-primary'], halves(traits.text, 'text', look));
  give(['--color-accent'], accent);
  if (traits.borders?.color)
    // Lines and outlines; the stronger edge of checkboxes, switches and
    // fields is left for `theme check --fix`, which makes it show.
    give(['--color-border'], halves(traits.borders.color, 'ground', look));

  // Corners on Core's radius scale: buttons and fields get the px given,
  // the rest of the scale follows; a pill rounds buttons and fields fully.
  if (traits.corners === 'pill')
    tokens['--radius-element'] = core.expandRadiusScale({
      base: 4,
      multiplier: 1,
    })['--radius-full'];
  else if (typeof traits.corners === 'number')
    Object.assign(
      tokens,
      core.expandRadiusScale(
        traits.corners === 0
          ? {base: 4, multiplier: 0}
          : {base: traits.corners / 2, multiplier: 1},
      ),
    );
  if (traits.corners !== undefined)
    tokens['--radius-chat'] = 'var(--radius-container)';

  // Density: the spacing dial's rung, spread over Core's spacing steps.
  if (traits.density && traits.density !== 'normal') {
    const rung = DENSITY_RUNG[traits.density];
    const factor = SPACING.find(([n]) => n === rung)?.[1] ?? 1;
    /** @type {Array<[string, number]>} */
    const steps = Object.entries(core.spacingDefaults)
      .filter(([, v]) => /rem$/.test(String(v)))
      .map(([k, v]) => [k, Number.parseFloat(String(v)) * 16]);
    for (const [k, px] of spacingSteps(steps, factor, {}))
      tokens[k] = `${Number((px / 16).toFixed(4))}rem`;
  }

  // Type: Core's type scale and roles.
  /** @type {any} */
  const typography = {};
  const font = traits.font ?? {};
  if (font.size) {
    const sizes = core.textSizeDefaults;
    const base = Number.parseFloat(sizes['--font-size-base']) * 16;
    const xl2 = Number.parseFloat(sizes['--font-size-2xl']) * 16;
    typography.scale = {
      base: font.size,
      ratio: Math.round((xl2 / base) ** (1 / 3) * 100) / 100,
    };
  }
  // A font is its family and the editor's fallbacks for its kind, so a
  // page without the font still draws its kind of face.
  /** @param {string} value */
  const stack = value => {
    const {family, fallbacks} = fontOf(value);
    return {family, fallbacks};
  };
  if (font.body || font.bodyWeight)
    typography.body = {
      ...(font.body ? stack(font.body) : {}),
      ...(font.bodyWeight ? {weight: font.bodyWeight} : {}),
    };
  if (font.heading || font.headingWeight)
    typography.heading = {
      ...(font.heading ? stack(font.heading) : {}),
      ...(font.headingWeight ? {weight: font.headingWeight} : {}),
    };
  if (font.code) typography.code = stack(font.code);

  if (traits.borders?.width !== undefined)
    tokens['--border-width'] = `${traits.borders.width}px`;

  // Shadows on Core's own elevation steps: strong moves each resting step
  // up one, none takes resting shadows away. Overlays keep the high step,
  // so a menu still stands apart from what it opens over.
  const elevation = ['--shadow-low', '--shadow-med', '--shadow-high'];
  if (traits.shadows === 'none')
    for (const k of elevation.slice(0, 2)) tokens[k] = 'none';
  if (traits.shadows === 'strong')
    elevation.slice(0, 2).forEach((k, i) => {
      tokens[k] = String(core.shadowDefaults[elevation[i + 1]]);
    });

  // How containers sit on the page: the editor's surfaces dial, written
  // once and named by the parts the dial itself reaches. The panels that
  // float take the dial's floating rung where it has one, as the dial
  // gives it, so a flat menu keeps an edge.
  /** @type {Record<string, Record<string, string>>} */
  const shared = {};
  /** @type {Record<string, string[]>} the shared styles each part's base spreads */
  const sharedBy = {};
  /** @type {Record<string, Record<string, string[]>>} the shared styles a part's variant blocks spread */
  const sharedBlocks = {};
  /**
   * A look written as shared styles: the look itself and, apart, its fill,
   * which a surface with colored variants takes on its plain variants only
   * (a blue card stays blue).
   * @param {string} name @param {Record<string, string>} look
   * @returns {{frame: string, fill: string | null}}
   */
  const shareLook = (name, look) => {
    const {backgroundColor, ...frame} = look;
    shared[name] = frame;
    if (backgroundColor == null) return {frame: name, fill: null};
    const fill = name === 'surfaces' ? 'surfaceFill' : `${name}Fill`;
    shared[fill] = {backgroundColor};
    return {frame: name, fill};
  };
  /**
   * @param {string} part
   * @param {{frame: string, fill: string | null}} look
   * @param {{axis: string, plain: string[]} | null | undefined} keep
   */
  const nameLook = (part, look, keep) => {
    if (look.fill && keep) {
      sharedBy[part] = [look.frame];
      sharedBlocks[part] = Object.fromEntries(
        keep.plain.map(v => [
          `${keep.axis}:${v}`,
          [/** @type {string} */ (look.fill)],
        ]),
      );
    } else {
      sharedBy[part] = look.fill ? [look.frame, look.fill] : [look.frame];
      delete sharedBlocks[part];
    }
  };
  if (traits.surfaces) {
    // With no shadows, a panel that floats keeps the dial's floating edge,
    // so a menu still stands off the page.
    const floating =
      FLOATING_SURFACES[traits.surfaces] ??
      (traits.shadows === 'none'
        ? {...SURFACES[traits.surfaces], ...FLOATING_SURFACES.flat}
        : undefined);
    const plainLook = shareLook('surfaces', {...SURFACES[traits.surfaces]});
    const floatLook = floating
      ? shareLook('floatingSurfaces', {...floating})
      : null;
    // The dial's own rule: the parts it reaches, and how.
    for (const {part, kind, style, keep} of surfacePartStyles(
      ctx.C.MAP,
      x => project.target.has(x),
      traits.surfaces,
      floating ? {floating} : {},
    )) {
      if (kind === 'surface') nameLook(part, plainLook, keep);
      else if (kind === 'floating' && floatLook)
        nameLook(part, floatLook, keep);
      else
        components[part] = {
          ...components[part],
          base: {...components[part]?.base, ...style},
        };
    }
  }
  // With no shadows, every part with the menu fill keeps an edge of its
  // own (the dial's floating edge), so menus stand off the page and the
  // shadow tokens stay none.
  if (traits.shadows === 'none') {
    const floatLook = shared.floatingSurfaces
      ? {
          frame: 'floatingSurfaces',
          fill: shared.floatingSurfacesFill ? 'floatingSurfacesFill' : null,
        }
      : shareLook('floatingSurfaces', {...FLOATING_SURFACES.flat});
    for (const {part} of menuParts(ctx.C.MAP))
      if (
        project.target.has(part) &&
        !sharedBy[part]?.includes('floatingSurfaces')
      )
        nameLook(part, floatLook, surfaceVariantsOf(ctx.C.MAP, part));
  }

  // The top bar paints its own fill and text: everything drawn straight
  // on it reads the bar's text. A part inside it with a fill of its own (a
  // menu, a field, a button) gets the theme's own text back from
  // `theme check --fix`, which finds those parts in the part census.
  // A bar in one color that is the page's own color in its mode (a white
  // bar on a white page) is a ground: in the other mode it takes the
  // theme's surface there, and the theme's text reads on it in both, so
  // it sets no text of its own.
  const groundBar = (() => {
    const one = traits.bar?.background?.one;
    // A bar text of its own (other than the theme's text) paints the bar.
    const barText = traits.bar?.text;
    const themeText = traits.text?.one ?? traits.text?.light;
    if (
      !one ||
      barText?.light ||
      barText?.dark ||
      (barText?.one &&
        barText.one.toLowerCase() !== String(themeText ?? '').toLowerCase())
    )
      return null;
    const c = parseColor(one);
    if (!c) return null;
    const mode = plainOn(c) === '#000000' ? 'light' : 'dark';
    // A one-look theme has no other mode to give the bar's ground to.
    if (look !== 'both' && look !== mode) return null;
    const pageHere = page[mode] ?? (mode === 'light' ? '#ffffff' : null);
    const p = pageHere ? parseColor(pageHere) : null;
    return p && ratio(c, p) < GROUND_BAR_CONTRAST ? {one, mode} : null;
  })();
  if (groundBar) {
    const other = 'var(--color-background-surface)';
    components[TOP_BAR] = {
      base: {
        backgroundColor:
          groundBar.mode === 'light'
            ? both(groundBar.one, other)
            : both(other, groundBar.one),
      },
    };
  } else if (traits.bar) {
    const bg = halves(traits.bar.background, 'brand', look);
    const light = bg.light ?? bg.dark ?? '';
    // A light bar in one color takes, in dark, its own hue at the nearest
    // lightness that is dark and that white text reads on, so the page
    // does not look half painted there.
    const darkGiven =
      traits.bar.background?.one != null && look !== 'light'
        ? null
        : (bg.dark ?? null);
    const lightRgb = parseColor(light);
    // A bar is light by the check's own reading (the black or white that
    // reads best on it): in dark it takes a counterpart white text reads on.
    const lightBar = lightRgb != null && plainOn(lightRgb) === '#000000';
    const dark =
      darkGiven ??
      (lightRgb && lightBar
        ? hex(
            nearestLightness(
              lightRgb,
              c =>
                plainOn(c) === '#ffffff' &&
                ratio(c, [255, 255, 255]) >= BAR_DARK_CONTRAST,
            ) ?? [0, 0, 0],
          )
        : light);
    if (dark !== light && !darkGiven && look !== 'light')
      notes.push(
        `The bar ${light} is light, so in dark it is ${dark}: its own hue, dark enough for white text, so the page does not look half painted.`,
      );
    const given = traits.bar.text ? halves(traits.bar.text, 'brand', look) : {};
    // What a pointer or a press tints on the bar (the hover overlay, the
    // press overlay, the neutral track a nav item takes): black in light and
    // white in dark, as Core tints, so a menu the bar opens keeps its row
    // highlight in both; as strong on the bar as Core's is on its page.
    const coreLight = core.resolveThemeTokens(
      core.defineTheme({name: 'core'}),
      {mode: 'light'},
    );
    const corePage = /** @type {Rgb} */ (
      parseColor(String(coreLight['--color-background-body'])) ?? [
        255, 255, 255,
      ]
    );
    /** @param {string} value @param {Rgb} under */
    const shift = (value, under) => {
      const c = parseColor(value);
      return c
        ? oklabDistance(compositeOver(c, alphaOf(value), under), under)
        : 0;
    };
    /**
     * The alphas (of 255) a tint takes on a fill: the one that moves the fill
     * as far as Core's own moves its page, and the least that still shows.
     * @param {string} token @param {Rgb} under @param {string} ink
     */
    const alphasOf = (token, under, ink) => {
      const value = String(coreLight[token] ?? '');
      const step = shift(value, corePage);
      const at = (/** @type {number} */ a) =>
        `${ink}${Math.min(a, 255).toString(16).padStart(2, '0')}`;
      let full = Math.round(alphaOf(value) * 255);
      while (full < 255 && shift(at(full), under) < step) full += 1;
      let least = 1;
      while (least < full && shift(at(least), under) < BAR_TINT_SHOWS)
        least += 1;
      return {full, least, at};
    };
    /**
     * A mode's bar: its tints, and the text and quieter text that read on
     * the bar and on each tint over it. When no text reads at the full
     * tints, they come down toward the least that still shows.
     * @param {string} fill @param {'light' | 'dark'} m
     * @param {string | undefined} given
     */
    const barMode = (fill, m, given) => {
      const ink = m === 'light' ? '#000000' : '#ffffff';
      /** @param {Rgb} c @param {Rgb[]} gs */
      const low = (c, gs) => Math.min(...gs.map(g => ratio(c, g)));
      /**
       * The bar and its tints at step k of BAR_TINT_STEPS (0 the full
       * tints, the last the least that shows).
       * @param {Rgb} under @param {number} k
       */
      const at = (under, k) => {
        const values = BAR_TINT_TOKENS.map(token => {
          const t = alphasOf(token, under, ink);
          return t.at(
            Math.round(t.full - ((t.full - t.least) * k) / BAR_TINT_STEPS),
          );
        });
        const grounds = [
          under,
          ...values.map(
            v =>
              /** @type {Rgb} */ (
                compositeOver(
                  /** @type {Rgb} */ (parseColor(v)),
                  alphaOf(v),
                  under,
                )
              ),
          ),
        ];
        return {values, grounds};
      };
      /**
       * The strongest tints a text reads under on a bar: the text itself,
       * else its own hue at the nearest lightness that reads.
       * @param {Rgb} under @param {Rgb} want
       */
      const fit = (under, want) => {
        for (let k = 0; k <= BAR_TINT_STEPS; k++) {
          const {values, grounds} = at(under, k);
          if (low(want, grounds) >= TEXT_CONTRAST)
            return {values, grounds, text: want, k};
          const near = nearestLightness(
            want,
            c => low(c, grounds) >= TEXT_CONTRAST,
          );
          if (near) return {values, grounds, text: near, k};
        }
        return null;
      };
      let under = /** @type {Rgb} */ (parseColor(fill));
      const want = /** @type {Rgb} */ (parseColor(given ?? textOn(fill)));
      let best = fit(under, want);
      // When no lightness of the text's hue reads (for white, down to black:
      // white on a mid blue such as #3b82f6 becomes black in light), the
      // bar's lightness moves (its hue kept) to the nearest the text reads
      // on, under the least tint that shows, and says so.
      if (!best) {
        const moved = nearestLightness(
          under,
          c => low(want, at(c, BAR_TINT_STEPS).grounds) >= TEXT_CONTRAST,
        );
        if (moved) {
          if (look === 'both' || look === m)
            notes.push(
              `The bar's text ${given ?? hex(want)} does not read on the bar ${fill} in ${m}: the bar is written as ${hex(moved)}, its own hue at the nearest lightness that text reads on.`,
            );
          under = moved;
          best = fit(under, want);
        }
      }
      if (!best) {
        const {values, grounds} = at(under, BAR_TINT_STEPS);
        const text = /** @type {Rgb[]} */ ([
          [0, 0, 0],
          [255, 255, 255],
          want,
        ]).sort((a, b) => low(b, grounds) - low(a, grounds))[0];
        best = {values, grounds, text, k: BAR_TINT_STEPS};
      }
      const {values, grounds, text, k} = best;
      if (k > 0 && (look === 'both' || look === m))
        notes.push(
          `The bar's hover, press and track tints are lighter than Core's in ${m} (${values.join(', ')}), so its text reads on them.`,
        );
      const written = hex(text);
      if (given && written.toLowerCase() !== given.toLowerCase()) {
        const was = low(/** @type {Rgb} */ (parseColor(given)), grounds);
        const sameHue = nearestLightness(
          /** @type {Rgb} */ (parseColor(given)),
          c => low(c, grounds) >= TEXT_CONTRAST,
        );
        // (A mode a one-look theme never shows is not worth a note.)
        if (
          (look === 'both' || look === m) &&
          !notes.some(
            n =>
              n.startsWith(`The bar's text ${given} reads`) &&
              n.includes(` in ${m}:`),
          )
        )
          notes.push(
            `The bar's text ${given} reads ${was.toFixed(2)}:1 on its fill ${hex(under)} or a tint on it in ${m}: written as ${written}, ${sameHue ? 'the same hue at the nearest lightness that reads' : 'the black or white that reads best there'}.`,
          );
      }
      // The quieter text goes the way the text goes (lighter than the bar
      // for light text), at the nearest lightness that still reads.
      const lum = (/** @type {Rgb} */ x) => ratio(x, [0, 0, 0]);
      const up = lum(text) > lum(under);
      const quietRgb = nearestLightness(
        under,
        x =>
          (up ? lum(x) > lum(under) : lum(x) < lum(under)) &&
          low(x, grounds) >= TEXT_CONTRAST,
      );
      return {
        fill: hex(under),
        text: written,
        quiet: quietRgb ? hex(quietRgb) : written,
        tints: Object.fromEntries(
          BAR_TINT_TOKENS.map((t, n) => [t, values[n]]),
        ),
      };
    };
    const givenLight = given.light ?? given.dark;
    const givenDark = given.dark ?? given.light;
    const lightBarMode = barMode(light, 'light', givenLight);
    const darkBarMode = barMode(dark, 'dark', givenDark);
    const text = both(lightBarMode.text, darkBarMode.text);
    const quiet = both(lightBarMode.quiet, darkBarMode.quiet);
    /** @param {string} token */
    const tint = token =>
      both(lightBarMode.tints[token], darkBarMode.tints[token]);
    components[TOP_BAR] = {
      base: {
        backgroundColor: both(lightBarMode.fill, darkBarMode.fill),
        color: text,
        ...Object.fromEntries(BAR_TEXT_TOKENS.map(t => [t, text])),
        ...Object.fromEntries(BAR_QUIET_TOKENS.map(t => [t, quiet])),
        // What is on the bar tints under the pointer and the press with the
        // bar's own text color, as Core tints the page with its own.
        ...Object.fromEntries(BAR_TINT_TOKENS.map(t => [t, tint(t)])),
      },
    };
  }

  // Exact values win over every trait, token by token and part by part.
  for (const [name, v] of Object.entries(traits.tokens ?? {})) {
    if (isColorToken(name) || /^--shadow-/.test(name)) {
      exact[name] = Array.isArray(v)
        ? {light: v[0], dark: v[1]}
        : {light: v, dark: v};
      delete tokens[name];
    } else tokens[name] = Array.isArray(v) ? [v[0], v[1]] : v;
  }
  for (const [part, blocks] of Object.entries(traits.components ?? {}))
    for (const [block, css] of Object.entries(blocks)) {
      // A part's own exact base takes the group's style into its own lines.
      const names =
        block === 'base'
          ? (sharedBy[part] ?? [])
          : (sharedBlocks[part]?.[block] ?? []);
      const base = Object.assign({}, ...names.map(n => shared[n]));
      if (block === 'base') delete sharedBy[part];
      else if (sharedBlocks[part]) delete sharedBlocks[part][block];
      components[part] = {
        ...components[part],
        [block]: {...base, ...components[part]?.[block], ...css},
      };
    }

  // The colors no palette token covers (the neutral track, the tints)
  // come from Core's own color scale on the accent, as defineTheme's
  // `color` makes them.
  const color =
    accent.light || accent.dark
      ? {
          accent: /** @type {[string, string]} */ ([
            accent.light ?? accent.dark,
            accent.dark ?? accent.light,
          ]),
        }
      : null;
  return {
    tokens,
    exact,
    components,
    shared,
    sharedBy,
    sharedBlocks,
    typography,
    palette,
    color,
    notes,
  };
}

/**
 * The tokens of the theme the traits describe, as explicit values: a value
 * per mode for colors and shadows (one value when both agree), one value
 * for the rest, resolved by Core itself. A color the palette mapping makes
 * is left for `theme check --fix`, which fills it from the colors the file
 * sets and moves it until it reads, with the secondary text the palette
 * lifts on some parts; a color the traits give is written as given.
 * @param {any} core Core's theme module
 * @param {string} slug
 * @param {Awaited<ReturnType<typeof traitsInput>>} input
 */
function explicitTokens(core, slug, input) {
  const theme = core.defineTheme({
    name: slug,
    tokens: input.tokens,
    ...(Object.keys(input.typography).length
      ? {typography: input.typography}
      : {}),
    ...(input.palette ? {palette: input.palette} : {}),
    ...(input.color ? {color: input.color} : {}),
  });
  const light = core.resolveThemeTokens(theme, {mode: 'light'});
  const dark = core.resolveThemeTokens(theme, {mode: 'dark'});
  // The colors `theme check --fix` fills: the palette's, and the inverted
  // surfaces it sets as light or dark as the text Core draws on them needs.
  const filledByCheck = new Set([
    ...Object.keys(input.palette?.tokens ?? {}),
    ...INVERTED_SURFACES,
  ]);
  /** @type {Record<string, string | [string, string]>} */
  const out = {};
  for (const name of Object.keys(core.tokenDefaults)) {
    if (LEFT_TO_CORE.test(name) && !(name in input.tokens)) continue;
    // Chart and category colors grow from the theme's own colors in
    // `theme check --fix`, by the editor's own rule: never Core's copy.
    if (
      (filledByCheck.has(name) || CATEGORY_OR_CHART.test(name)) &&
      !input.exact[name]
    )
      continue;
    const modal = isColorToken(name) || /^--shadow-/.test(name);
    const l = input.exact[name]?.light ?? String(light[name]);
    const d = input.exact[name]?.dark ?? String(dark[name]);
    out[name] = modal && l !== d ? [l, d] : l;
  }
  return {
    tokens: out,
    components: input.components,
    shared: input.shared,
    sharedBy: input.sharedBy,
    sharedBlocks: input.sharedBlocks,
  };
}

/**
 * Read --traits: inline JSON, or a .json file holding it.
 * @param {unknown} value
 * @param {string} cwd
 */
function parseTraits(value, cwd) {
  if (value != null && typeof value === 'object') return value;
  const text = String(value ?? '').trim();
  const file = /\.json$/i.test(text) ? path.resolve(cwd, text) : null;
  try {
    return JSON.parse(file ? fs.readFileSync(file, 'utf8') : text);
  } catch (e) {
    throw new AstryxError(
      `--traits is not ${file ? `a readable JSON file (${path.relative(cwd, file)})` : 'valid JSON'}: ${/** @type {Error} */ (e).message}. Write it as '{"page": "#f7f5f0", "accent": "#c2410c", "corners": 4}'. Nothing was written.`,
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
}

/**
 * Write, build and add the theme the traits describe; the adapter checks
 * it next.
 * @param {string} name
 * @param {unknown} traitsValue the --traits value: JSON text, a .json file, or an object
 * @param {{cwd?: string}} [options]
 * @returns {Promise<{type: 'themeEdit.create', data: Omit<import('./theme-edit.type.mjs').ThemeEditCreateResponse['data'], 'check'>}>}
 */
export async function createFromTraits(name, traitsValue, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  // A name the app's theme folders take: no dash at the end or twice.
  if (!slugOk(name) || !THEME_SLUG_RE.test(name))
    throw new AstryxError(
      `"${name}" cannot name a theme: ${NAME_RULE}. Nothing was written.`,
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  if (LIKE.includes(name))
    throw new AstryxError(
      `"${name}" is a bundled theme's name: a theme of the app by that name would hide it. Pick another name. Nothing was written.`,
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  const traits = readTraits(parseTraits(traitsValue, cwd));
  const ctx = await context(cwd);
  const app = coreApp(cwd) ?? cwd;
  const slug = name;
  const exportName = `${camel(slug)}Theme`;
  const dir = path.join(app, LOCAL_THEME_ROOT, slug);
  const file = path.join(dir, `${exportName}.ts`);
  const docFile = path.join(dir, `${exportName}.doc.mjs`);
  const rel = (/** @type {string} */ p) =>
    path.relative(app, p).split(path.sep).join('/');
  const checkCommand = `${getCliInvocation(app)} experimental theme check ${slug}`;
  // The file is the person's once written: create never writes it again.
  // A theme folder of the app by that name, whatever its files are called.
  if (fs.existsSync(file) || (fs.existsSync(dir) && isThemeFolder(dir)))
    throw new AstryxError(
      `${rel(file)} is there already. Edit the file, then run \`${checkCommand}\`; or pick another name. Nothing was written.`,
      [{name: checkCommand, reason: 'check the theme after an edit'}],
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  if (fs.existsSync(path.join(app, 'themes', slug)))
    throw new AstryxError(
      `themes/${slug}/ is a theme the theme editor made, and its app copy lives in ${rel(dir)}/: create writes there too. Pick another name. Nothing was written.`,
      [],
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  for (const part of Object.keys(traits.components ?? {}))
    if (!ctx.project.target.has(part))
      throw new AstryxError(
        `"components.${part}" is no part this Core styles. Nothing was written.`,
        [
          {
            name: `${getCliInvocation(app)} experimental theme targets ${part}`,
            reason: 'the parts a theme can style',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
  for (const token of Object.keys(traits.tokens ?? {}))
    if (!Object.hasOwn(ctx.project.core.tokenDefaults, token))
      throw new AstryxError(
        `"tokens.${token}" is no token this Core reads. Nothing was written.`,
        [
          {
            name: `${getCliInvocation(app)} experimental theme editor how --list tokens`,
            reason: 'every token',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
  // Only a color or a shadow has a value for each mode.
  for (const [token, v] of Object.entries(traits.tokens ?? {}))
    if (Array.isArray(v) && !isColorToken(token) && !/^--shadow-/.test(token))
      throw new AstryxError(
        `"tokens.${token}" takes one value: only a color or a shadow token has a light and a dark value. Nothing was written.`,
        [],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );

  const input = await traitsInput(ctx, traits);
  const {tokens, components, shared, sharedBy, sharedBlocks} = explicitTokens(
    ctx.project.core,
    slug,
    input,
  );
  for (const target of [dir, file, docFile])
    try {
      assertWithin(path.relative(app, target), app, {label: 'theme file'});
    } catch (e) {
      if (!(e instanceof PathSafetyError)) throw e;
      throw new AstryxError(
        `${e.message} Nothing was written.`,
        [],
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
  const dirWas = fs.existsSync(dir);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    file,
    traitsThemeSource({
      slug,
      exportName,
      traits,
      tokens,
      components,
      shared,
      sharedBy,
      sharedBlocks,
      checkCommand,
    }),
  );
  fs.writeFileSync(docFile, traitsThemeDoc(slug, traits));

  // A build or add that refuses leaves nothing of the theme behind, so a
  // second run is not refused for a theme the app never took.
  /** @type {Awaited<ReturnType<typeof themeBuild>>} */
  let built;
  /** @type {Awaited<ReturnType<typeof themeAdd>>} */
  let added;
  try {
    built = await themeBuild(rel(file), {}, {cwd: app});
    added = await themeAdd(slug, {cwd: app});
  } catch (e) {
    for (const f of [file, docFile]) fs.rmSync(f, {force: true});
    if (!dirWas) fs.rmSync(dir, {recursive: true, force: true});
    throw e;
  }
  const used = await themeUse(slug, {cwd: app});

  return {
    type: 'themeEdit.create',
    data: {
      theme: slug,
      file: rel(file),
      look: traits.look,
      colors: 0,
      values: Object.keys(tokens).filter(k => !isColorToken(k)).length,
      parts: [
        ...new Set([
          ...Object.keys(components),
          ...Object.keys(sharedBy),
          ...Object.keys(sharedBlocks),
        ]),
      ].sort(),
      built:
        built && 'outputs' in built.data
          ? rel(path.resolve(app, built.data.outputs.css))
          : null,
      module: used.data.modulePath,
      firstAdd: added.data.change.firstAdd,
      notes: [
        ...input.notes,
        ...(added.data.notes ?? []),
        ...fontNotes(app, traits),
      ],
    },
  };
}

/**
 * The color tokens a theme file sets: what the file holds once the check
 * filled it.
 * @param {string} cwd
 * @param {string} file the theme file, from the app root
 */
export function colorsIn(cwd, file) {
  const app = coreApp(cwd) ?? cwd;
  const source = fs.readFileSync(path.join(app, file), 'utf8');
  return new Set(
    [...source.matchAll(/^\s*'(--[a-z0-9-]+)':/gm)]
      .map(m => m[1])
      .filter(isColorToken),
  ).size;
}

/**
 * How to load each font the traits name that no installed package loads:
 * the Fontsource package to install and import once, as the editor says it.
 * @param {string} app
 * @param {import('./_traits.mjs').Traits} traits
 * @returns {string[]}
 */
function fontNotes(app, traits) {
  /** @type {string[]} */
  const out = [];
  const values = [traits.font?.body, traits.font?.heading, traits.font?.code];
  for (const value of new Set(values)) {
    if (typeof value !== 'string') continue;
    const family = fontOf(value).family.replace(/["']/g, '');
    const hint = fontsourceSuggestion(family);
    if (!hint || packageInstalled(app, hint.pkg)) continue;
    out.push(
      `${family} is not loaded yet: install ${hint.pkg} and import it once in the app (\`import '${hint.pkg}';\`)${hint.known ? '' : ', if Fontsource publishes it'}; until then the page draws the fallback font.`,
    );
  }
  return out;
}
