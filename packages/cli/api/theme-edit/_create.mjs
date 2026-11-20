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
import {themeBuild, themeAdd, themeUse} from '../theme/theme.mjs';
import {context, coreApp} from './_context.mjs';
import {corePalette, packageInstalled} from './_project.mjs';
import {isColorToken} from './_compiler.mjs';
import {partForWord} from './_part-words.mjs';
import {
  fontOf,
  fontsourceSuggestion,
  slugOk,
  spacingSteps,
} from './_settings.mjs';
import {NAME_RULE} from './_name-rule.mjs';
import {
  FAMILIES,
  FLOATING_SURFACES,
  LIKE,
  SPACING,
  SURFACES,
} from './_tables.mjs';
import {
  alphaOf,
  compositeOver,
  nearestReadingLightness,
  oklabDistance,
  parseColor,
  plainOn,
} from './_color.mjs';
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
 * How far the bar's quieter text stands out on its fill: readable text,
 * a step short of the bar's own text so a hover still shows.
 */
const BAR_QUIET_CONTRAST = 5;

/** The tints a pointer or a press shows on the bar, set for what it holds. */
const BAR_TINT_TOKENS = [
  '--color-overlay-hover',
  '--color-overlay-pressed',
  '--color-neutral',
];

/**
 * The part groups the surfaces trait styles: one shared style per group in
 * the theme file, so a later change to how containers sit is one line.
 */
const SURFACE_GROUPS = ['containers', 'menus'];

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
  // once for the groups it reaches. A panel that floats over the page (an
  // overlay or opener by its component's own doc, or a member of the
  // menus group) takes the dial's floating rung
  // where it has one, so a flat menu keeps an edge.
  /** @type {Record<string, Record<string, string>>} */
  const shared = {};
  /** @type {Record<string, string>} */
  const sharedBy = {};
  if (traits.surfaces) {
    const floats = (/** @type {string} */ part) => {
      const info =
        project.components[project.target.get(part)?.component ?? ''];
      return Boolean(
        info?.overlay || info?.opens || FAMILIES.menus?.includes(part),
      );
    };
    const floating = FLOATING_SURFACES[traits.surfaces];
    shared.surfaces = {...SURFACES[traits.surfaces]};
    if (floating) shared.floatingSurfaces = {...floating};
    for (const part of SURFACE_GROUPS.flatMap(g => FAMILIES[g] ?? []))
      if (project.target.has(part))
        sharedBy[part] =
          floating && floats(part) ? 'floatingSurfaces' : 'surfaces';
  }

  // The top bar paints its own fill and text: everything drawn straight
  // on it reads the bar's text. A part inside it with a fill of its own (a
  // menu, a field, a button) gets the theme's own text back from
  // `theme check --fix`, which finds those parts in the part census.
  if (traits.bar) {
    const bg = halves(traits.bar.background, 'brand', look);
    const light = bg.light ?? bg.dark ?? '';
    const dark = bg.dark ?? bg.light ?? '';
    const given = traits.bar.text ? halves(traits.bar.text, 'brand', look) : {};
    const text = both(
      given.light ?? given.dark ?? textOn(light),
      given.dark ?? given.light ?? textOn(dark),
    );
    // The quieter text: the bar's own hue at the nearest lightness that
    // still reads on the bar.
    /** @param {string} fill */
    const quietOn = fill => {
      const c = parseColor(fill);
      return c ? nearestReadingLightness(c, [c], BAR_QUIET_CONTRAST) : fill;
    };
    const quiet = both(quietOn(light), quietOn(dark));
    // What a pointer or a press tints on the bar (the hover overlay, the
    // press overlay, the neutral track a nav item takes): the bar's
    // readable black or white, at the alpha that changes the bar as much
    // as Core's own value changes Core's own page in light.
    const coreLight = core.resolveThemeTokens(
      core.defineTheme({name: 'core'}),
      {mode: 'light'},
    );
    const corePage = /** @type {[number, number, number]} */ (
      parseColor(String(coreLight['--color-background-body'])) ?? [
        255, 255, 255,
      ]
    );
    /** @param {string} token @param {string} fill */
    const tintOn = (token, fill) => {
      const value = String(coreLight[token] ?? '');
      const own = parseColor(value);
      const ink = textOn(fill);
      const under = parseColor(fill);
      const over = parseColor(ink);
      if (!own || !under || !over) return value;
      const step = oklabDistance(
        compositeOver(own, alphaOf(value), corePage),
        corePage,
      );
      let a = Math.round(alphaOf(value) * 255);
      while (
        a < 255 &&
        oklabDistance(compositeOver(over, a / 255, under), under) < step
      )
        a += 1;
      return `${ink}${a.toString(16).padStart(2, '0')}`;
    };
    /** @param {string} token */
    const tint = token => both(tintOn(token, light), tintOn(token, dark));
    components[TOP_BAR] = {
      base: {
        backgroundColor: both(light, dark),
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
      const base =
        block === 'base' && sharedBy[part] ? shared[sharedBy[part]] : {};
      if (block === 'base') delete sharedBy[part];
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
    typography,
    palette,
    color,
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
  const filledByCheck = new Set(Object.keys(input.palette?.tokens ?? {}));
  /** @type {Record<string, string | [string, string]>} */
  const out = {};
  for (const name of Object.keys(core.tokenDefaults)) {
    if (LEFT_TO_CORE.test(name) && !(name in input.tokens)) continue;
    if (filledByCheck.has(name) && !input.exact[name]) continue;
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
  if (!slugOk(name))
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
  const exportName = `${slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}Theme`;
  const dir = path.join(app, LOCAL_THEME_ROOT, slug);
  const file = path.join(dir, `${exportName}.ts`);
  const docFile = path.join(dir, `${exportName}.doc.mjs`);
  const rel = (/** @type {string} */ p) =>
    path.relative(app, p).split(path.sep).join('/');
  const checkCommand = `${getCliInvocation(app)} experimental theme check ${slug}`;
  // The file is the person's once written: create never writes it again.
  if (fs.existsSync(file))
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
  const {tokens, components, shared, sharedBy} = explicitTokens(
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
      checkCommand,
    }),
  );
  if (!fs.existsSync(docFile))
    fs.writeFileSync(docFile, traitsThemeDoc(slug, traits));

  const built = await themeBuild(rel(file), {}, {cwd: app});
  const added = await themeAdd(slug, {cwd: app});
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
        ...new Set([...Object.keys(components), ...Object.keys(sharedBy)]),
      ].sort(),
      built:
        built && 'outputs' in built.data
          ? rel(path.resolve(app, built.data.outputs.css))
          : null,
      module: used.data.modulePath,
      firstAdd: added.data.change.firstAdd,
      notes: [...(added.data.notes ?? []), ...fontNotes(app, traits)],
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
