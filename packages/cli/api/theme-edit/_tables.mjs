// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The data behind `astryx experimental theme`: the dials and their
 * rungs, the part groups, the built-in themes a theme can build on, and the
 * words `how` understands. A new dial, rung, group or word is a table entry
 * here with a test, not new code.
 *
 * @position api/theme-edit — data read by the engine and the help text
 */

import {discoverBundledThemes} from '../../foundation/discovery/theme-discovery.mjs';
import {collectUnloadedFonts} from '../theme/build/font-warning.mjs';

/**
 * A lookup table that only answers for its own keys: a word typed by a
 * person (`constructor`, `__proto__`, `toString`) never reaches
 * `Object.prototype`. Plain objects inside it, in arrays too, get the same.
 * @template T
 * @param {T} table
 * @returns {T}
 */
export function wordTable(table) {
  /** @param {any} v @returns {any} */
  const own = v => {
    if (Array.isArray(v)) return v.map(own);
    if (
      !v ||
      typeof v !== 'object' ||
      Object.getPrototypeOf(v) !== Object.prototype
    )
      return v;
    const out = Object.create(null);
    for (const [k, x] of Object.entries(v)) out[k] = own(x);
    return out;
  };
  return own(table);
}

/** The command prefix every suggested command starts with. */
export const P = 'astryx experimental theme editor';

/**
 * Parts that take their color from a color prop, whose rule Core writes
 * after part styles: a color set on them never shows.
 */
export const COLOR_PROP_PARTS = ['text', 'heading', 'link'];

/** The lookup command: what a part reads, a setting, a question, a picture. */
export const HOW = `${P} how`;

/** The built-in themes a theme can build on (`new --like`, `set base`), neutral first. */
export const LIKE = discoverBundledThemes()
  .map(t => t.slug)
  .sort((a, b) => Number(b === 'neutral') - Number(a === 'neutral'));

/**
 * Groups of parts that should look alike. `--on <group>` styles every member.
 * @type {Record<string, string[]>}
 */
export const FAMILIES = wordTable({
  inputs: [
    'text-input',
    'text-area',
    'number-input',
    'date-input',
    'time-input',
    'date-time-input',
    'date-range-input',
    'selector',
    'multi-selector',
    'complex-selector',
    'typeahead',
    'tokenizer',
  ],
  containers: [
    'card',
    'dialog',
    'drawer',
    'popover',
    'hover-card',
    'bottom-sheet',
    'selectable-card',
    'clickable-card',
  ],
  checks: ['checkbox-indicator', 'radio-indicator'],
  menus: [
    'dropdown-menu',
    'selector-popup',
    'multi-selector-popup',
    'typeahead-dropdown',
    'context-menu',
  ],
});

/**
 * Groups whose members always look alike: styling one member styles them
 * all unless `--only` is given. Other groups spread only when `--on`
 * names the group itself.
 */
export const AUTO_SPREAD = ['inputs', 'checks'];

/** @param {string} target @returns {string | null} */
export const familyOf = target =>
  Object.entries(FAMILIES).find(([, members]) =>
    members.includes(target),
  )?.[0] ?? null;

/** @type {Array<[string, number]>} */
export const CORNERS = [
  ['square', 0],
  ['small', 8],
  ['medium', 10],
  ['large', 12],
  ['round', 16],
  ['pill', 9999],
];
/** @type {Array<[string, number]>} */
export const SPACING = [
  ['tight', 0.75],
  ['compact', 0.875],
  ['medium', 1],
  ['roomy', 1.125],
  ['spacious', 1.25],
];
/** @type {Array<[string, number]>} */
export const TEXT_SIZE = [
  ['small', 13],
  ['medium', 14],
  ['large', 15],
  ['larger', 16],
];

/** The type roles a font may be set for alone (`font <x> --on <role>`). */
export const FONT_ROLES = ['body', 'heading', 'code'];

/**
 * Font presets: the family, then its fallbacks.
 * @type {Record<string, [string, string]>}
 */
export const FONTS = wordTable({
  system: ['system-ui', '-apple-system, "Segoe UI", Roboto, sans-serif'],
  tahoma: ['Tahoma', 'Verdana, "Segoe UI", sans-serif'],
  verdana: ['Verdana', 'Tahoma, sans-serif'],
  segoe: ['Segoe UI', 'Tahoma, sans-serif'],
  helvetica: ['Helvetica', 'Arial, sans-serif'],
  georgia: ['Georgia', '"Times New Roman", serif'],
  serif: ['Georgia', '"Times New Roman", serif'],
  mono: ['ui-monospace', '"SF Mono", Menlo, Consolas, monospace'],
  courier: ['Courier New', 'Courier, monospace'],
  rounded: ['Nunito', '"Varela Round", system-ui, sans-serif'],
  comic: ['Comic Sans MS', '"Comic Neue", cursive'],
});
/** The CSS-wide keywords: valid in any declaration, never a value of their own. */
export const CSS_WIDE = [
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
];

/** CSS-wide keywords, and `default`, which font-family reserves: never a family, and invalid inside a list. */
export const CSS_WIDE_KEYWORDS = [...CSS_WIDE, 'default'];

/**
 * Whether a family needs no font file somewhere: a CSS generic family, or a
 * family on the theme build's own list of system fonts (the one list; the
 * build's font warning reads it).
 * @param {string} family without quotes
 */
export const isSystemFamily = family =>
  family.trim() !== '' &&
  collectUnloadedFonts({
    tokens: {'--font-family-body': JSON.stringify(family.trim())},
  }).length === 0;

/**
 * The families on that list that only one system ships, with that system:
 * fallback stacks name them on purpose, but as a theme's own font they do
 * not load everywhere.
 */
const ONE_SYSTEM_FAMILIES = new Map(
  Object.entries({
    macOS: [
      '-apple-system',
      'blinkmacsystemfont',
      'helvetica neue',
      'sf mono',
      'sf pro',
      'sf pro text',
      'sf pro display',
      'monaco',
      'menlo',
      'palatino',
      'lucida grande',
      'gill sans',
      'snell roundhand',
    ],
    Windows: [
      'segoe ui',
      'segoe ui emoji',
      'segoe ui symbol',
      'consolas',
      'cambria',
      'calibri',
      'lucida console',
      'brush script mt',
      'old english text mt',
    ],
    'Android and ChromeOS': ['roboto'],
    Linux: [
      'liberation mono',
      'liberation sans',
      'liberation serif',
      'dejavu sans',
      'dejavu sans mono',
    ],
  }).flatMap(([system, names]) => names.map(n => [n, system])),
);

/** @param {string} family */
const familyKey = family => family.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The one system that ships a family on the theme build's list, or null for
 * a family every desktop has (or none does).
 * @param {string} family without quotes
 */
export const oneSystemOf = family =>
  isSystemFamily(family)
    ? (ONE_SYSTEM_FAMILIES.get(familyKey(family)) ?? null)
    : null;

/**
 * Whether a family loads with no font file on every usual desktop: a CSS
 * generic, or a system family macOS and Windows both ship.
 * @param {string} family without quotes
 */
export const isDesktopFamily = family =>
  isSystemFamily(family) && !ONE_SYSTEM_FAMILIES.has(familyKey(family));

/**
 * Presets that show a font every desktop has, so no font file is needed:
 * the family itself, or (for one that ships on one system, such as Segoe
 * UI) the first fallback.
 */
export const SYSTEM_FONTS = Object.keys(FONTS).filter(k =>
  [FONTS[k][0], FONTS[k][1].split(',')[0].replace(/["']/g, '')].some(
    isDesktopFamily,
  ),
);

/**
 * Open fonts with a package that loads them: preset -> family. The package
 * is `@fontsource/<preset>` and the fallbacks follow the kind of font
 * (`-mono`, serif, sans), except where OPEN_FONT_PACKAGES says otherwise.
 * When the package is installed, previews show the font; the app loads it
 * by importing the package once.
 */
const OPEN_FONT_FAMILIES = wordTable({
  inter: 'Inter',
  roboto: 'Roboto',
  poppins: 'Poppins',
  figtree: 'Figtree',
  'dm-sans': 'DM Sans',
  manrope: 'Manrope',
  'space-grotesk': 'Space Grotesk',
  'ibm-plex-sans': 'IBM Plex Sans',
  'ibm-plex-mono': 'IBM Plex Mono',
  'jetbrains-mono': 'JetBrains Mono',
  nunito: 'Nunito',
  'source-serif': 'Source Serif 4',
  'mona-sans': 'Mona Sans',
  geist: 'Geist Sans',
  'geist-mono': 'Geist Mono',
});
/** Presets whose package is not named after them. */
const OPEN_FONT_PACKAGES = wordTable(
  /** @type {Record<string, string>} */ ({
    'source-serif': 'source-serif-4',
    geist: 'geist-sans',
  }),
);
/** @type {Record<string, {family: string, fallbacks: string, pkg: string}>} */
export const OPEN_FONTS = wordTable(
  Object.fromEntries(
    Object.entries(OPEN_FONT_FAMILIES).map(([key, family]) => [
      key,
      {
        family,
        fallbacks: key.endsWith('-mono')
          ? 'ui-monospace, monospace'
          : /serif/i.test(family)
            ? 'Georgia, serif'
            : 'system-ui, sans-serif',
        pkg: `@fontsource/${OPEN_FONT_PACKAGES[key] ?? key}`,
      },
    ]),
  ),
);

/**
 * Brand fonts no package loads, and the closest open font, for the warning
 * a theme that names one gets.
 * @type {Record<string, string>}
 */
export const CLOSEST_OPEN_FONT = wordTable({
  'sf pro': 'inter',
  'sf pro text': 'inter',
  'sf pro display': 'inter',
  'san francisco': 'inter',
  '-apple-system': 'inter',
  söhne: 'inter',
  sohne: 'inter',
  cereal: 'manrope',
  'airbnb cereal': 'manrope',
  circular: 'dm-sans',
  'gt walsheim': 'dm-sans',
  'helvetica neue': 'inter',
  'segoe ui variable': 'inter',
  'gg sans': 'nunito',
  whitney: 'nunito',
  graphik: 'inter',
  'proxima nova': 'figtree',
  avenir: 'nunito',
  'avenir next': 'nunito',
  futura: 'poppins',
  menlo: 'jetbrains-mono',
  'sf mono': 'jetbrains-mono',
});

/** Heading weights (`headings` dial): rung -> font-weight. */
export const HEADING_WEIGHTS = wordTable(
  /** @type {Record<string, string>} */ ({
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  }),
);
/** Heading letter spacing (`headings` dial): rung -> letter-spacing. */
export const HEADING_TRACKING = wordTable(
  /** @type {Record<string, string>} */ ({
    tight: '-0.02em',
    tighter: '-0.04em',
    normal: '0',
    wide: '0.02em',
  }),
);

/** The `surfaces` dial: how every container sits on the page. */
export const SURFACES = wordTable(
  /** @type {Record<string, Record<string, string>>} */ ({
    flat: {
      borderStyle: 'none',
      boxShadow: 'none',
      backgroundColor: 'var(--color-background-muted)',
    },
    outlined: {
      borderStyle: 'solid',
      borderWidth: '1px',
      borderColor: 'var(--color-border)',
      boxShadow: 'none',
    },
    raised: {borderStyle: 'none', boxShadow: 'var(--shadow-med)'},
    glass: {
      backgroundColor:
        'color-mix(in srgb, var(--color-background-card) 72%, transparent)',
      backdropFilter: 'blur(14px) saturate(1.4)',
      borderStyle: 'solid',
      borderWidth: '1px',
      borderColor: 'rgb(255 255 255 / 0.22)',
      boxShadow: 'var(--shadow-low)',
    },
  }),
);
/** The parts the `surfaces` dial moves. */
export const SURFACE_PARTS = [
  'card',
  'dialog',
  'popover',
  'drawer',
  'hover-card',
  'dropdown-menu',
  'selector-popup',
  'banner-frame',
];

/** The `type` dial: heading scale ratio, heading weight, heading letter spacing. */
export const TYPE_STYLES =
  /** @type {Record<string, {ratio: number, weight: string | null, tracking: string | null}>} */ ({
    compact: {ratio: 1.15, weight: '600', tracking: '0'},
    standard: {ratio: 1.2, weight: null, tracking: null},
    editorial: {ratio: 1.3, weight: '600', tracking: '-0.02em'},
    display: {ratio: 1.4, weight: '800', tracking: '-0.035em'},
  });

/**
 * @typedef {object} Dial
 * @property {string} help - What the dial does, its rungs, and where it applies.
 * @property {string} values - The values it takes, `|`-separated.
 * @property {string[]} examples - Commands after the prefix; `my` is the theme.
 * @property {string} words - Words `how` matches to the dial.
 */

/** @type {Record<string, Dial>} */
export const DIALS = wordTable({
  corners: {
    help:
      'How round corners are. Rungs: ' +
      CORNERS.map(
        ([n, v]) => `${n} (${v === 9999 ? 'fully round' : `${v}px`})`,
      ).join(', ') +
      ", or a size like 6px. Whole theme: sets the 4 corner tokens in the base theme's proportions (containers and pages at most as round as at pill; inner corners at most as round as at round). With --on <part or group>: that part's border-radius. Corners are a size, so they are the same in light and dark.",
    values: 'square|small|medium|large|round|pill|more|less|<size like 6px>',
    examples: [
      'set my corners pill',
      'set my corners more',
      'set my corners square --on button',
      'set my corners large --on containers',
    ],
    words:
      'round rounded radius corner corners curve curved circle circular pill sharp square border-radius bubbly soft',
  },
  spacing: {
    help:
      'How much room there is: padding, gaps and control heights together. Rungs: ' +
      SPACING.map(([n, f]) => `${n} (x${f})`).join(', ') +
      '. Whole theme: scales every spacing token and control height (a denser theme has shorter controls; the small, medium and large sizes stay apart and in order, none under 24px). With --on <part or group>: only inside it.',
    values: 'tight|compact|medium|roomy|spacious|more|less',
    examples: [
      'set my spacing compact',
      'set my spacing more',
      'set my spacing roomy --on card',
    ],
    words:
      'spacing space room roomy airy dense density compact tight padding gap gaps margin breathing cramped spread spacious',
  },
  accent: {
    help: 'The main brand color: primary buttons, links, selection and the focus ring. From the one color the editor generates its shades, light and dark, and points the accent tokens at them: --color-accent, --color-on-accent, --color-text-accent, --color-icon-accent, --color-accent-muted and --focus-outline-color. The fill keeps the exact color you gave in light, and in dark too when text on it reads at 4.5:1 and it stands out from the dark page at 3:1; otherwise dark mode uses shade 70, where the official themes put a dark fill, or the shade nearest it that passes both, and the result says so. Text on the fill is the neutral color\'s white or near-black (pure white or black without a neutral color), whichever reads on it. The fill never moves: when no text reads on it, or a pale fill does not stand out from the light page, the result says so. Other tokens move to a nearby shade when they must read: text at 4.5:1, the focus ring at 3:1. `how colors` explains it; the Colors preview page (`preview add`) shows every shade. For an exact color, set the token itself (set my --color-accent "#7c3aed"): an exact token always wins over the generated colors.',
    values: '<color>',
    examples: ['set my accent "#7c3aed"', 'set my accent rebeccapurple'],
    words:
      'accent brand primary main color colour key highlight link selection seed',
  },
  neutral: {
    help: 'The gray of the theme: surfaces (cards, panels, popovers, muted fills), text, icons, borders, skeletons and hover tints. The page background stays the base theme\'s (often a light gray), so a tinted gray never tints the page; the result names it, and for a white or off-white page set --color-background-body "#ffffff" (with --mode light in a theme with both modes). From the one color the editor generates light and dark shades; your exact color sits at its own shade in both modes, and the shades around it follow it. The surface, text, icon, border, skeleton and overlay tokens point at those shades. Secondary text and icons move to a shade that reads on the surfaces. Give a gray with a little color ("#64748b") for a cool or warm neutral; a strong color makes colored surfaces. `how colors` explains it.',
    values: '<color>',
    examples: ['set my neutral "#64748b"', 'set my neutral "#78716c"'],
    words:
      'neutral gray grey surface surfaces background text border tint warm cool slate stone',
  },
  success: {
    help: 'The success color (done, valid, positive). From it the editor generates light and dark shades, and --color-success, --color-on-success, --color-text-success, --color-icon-success, --color-success-muted, --color-on-success-muted and --color-border-success point at them. `how colors` explains it.',
    values: '<color>',
    examples: ['set my success "#16a34a"'],
    words: 'success green ok valid positive done status',
  },
  warning: {
    help: 'The warning color (caution). From it the editor generates light and dark shades, and the --color-warning tokens (fill, on, text, icon, muted, on-muted, border) point at them. `how colors` explains it.',
    values: '<color>',
    examples: ['set my warning "#f59e0b"'],
    words: 'warning caution yellow amber status',
  },
  danger: {
    help: 'The danger color (errors, destructive actions). From it the editor generates light and dark shades, and the --color-error tokens (fill, on, text, icon, muted, on-muted, border) point at them. `how colors` explains it.',
    values: '<color>',
    examples: ['set my danger "#dc2626"'],
    words: 'danger error destructive red invalid negative status',
  },
  info: {
    help: 'The info color (notices, help). From it the editor generates light and dark shades, and the --color-info tokens (fill, on, text, icon, muted, on-muted, border) point at them. `how colors` explains it.',
    values: '<color>',
    examples: ['set my info "#0284c7"'],
    words: 'info information notice help blue status',
  },
  vibrancy: {
    help: 'How saturated the generated colors are: 0 is gray, 100 the most vivid, 50 the default; more and less step by 10. Every color the theme sets (accent, neutral, success, warning, danger, info) is generated again; each exact color you gave stays as given at its own shade, and the shades around it get more or less color. more at 100 and less at 0 change nothing, so they are refused. The whole theme only, and only once the theme sets a color; undoing the last color removes vibrancy too.',
    values: '<0-100>|more|less',
    examples: ['set my vibrancy 70', 'set my vibrancy less'],
    words:
      'vibrancy vibrant saturation saturated colorful colourful vivid muted dull washed pastel intense',
  },
  font: {
    help:
      'The typeface. System presets (always show): ' +
      SYSTEM_FONTS.join(', ') +
      '. Open fonts with a loading package: ' +
      Object.keys(OPEN_FONTS).join(', ') +
      ' (previews show them when the package is installed; the result names the import line for the app). Also: rounded, comic, any family name in quotes, or a whole stack with commas ("Inter, Helvetica, sans-serif"). Whole theme: body and headings. With --on heading|body|code: only that role. An open font loads only once its package is installed (the result of set names the install line for your package manager, and the closest font that needs no install); any other font must be loaded by the app.',
    values: `${[...Object.keys(FONTS), ...Object.keys(OPEN_FONTS)].join('|')}|"<family or stack>"`,
    examples: [
      'set my font mono',
      'set my font serif --on heading',
      'set my font "Inter"',
    ],
    words:
      'font typeface type family letters serif sans mono monospace typography',
  },
  headings: {
    help:
      'How headings look, all levels and display sizes together. Weight: ' +
      Object.entries(HEADING_WEIGHTS)
        .map(([n, v]) => `${n} (${v})`)
        .join(', ') +
      '. Tracking (letter spacing): ' +
      Object.entries(HEADING_TRACKING)
        .map(([n, v]) => `${n} (${v})`)
        .join(', ') +
      '. Set one word at a time: weight words and tracking words are separate settings. headings always wins over type for weight and tracking, whatever the order. Whole theme only; for one heading level use font-weight --on heading --when level:<1-6>.',
    values: [
      ...Object.keys(HEADING_WEIGHTS),
      ...Object.keys(HEADING_TRACKING),
    ].join('|'),
    examples: ['set my headings bold', 'set my headings tight'],
    words:
      'heading headings title titles display headline bold heavy weight tracking letter spacing tight',
  },
  surfaces: {
    help: 'How panels (cards, dialogs, popovers, menus, the banner) sit on the page. flat: no border, no shadow, a tinted fill. outlined: a 1px border, no shadow. raised: no border, a soft shadow. glass: see-through fill with a blur and a faint light edge. Moves every container at once.',
    values: Object.keys(SURFACES).join('|'),
    examples: ['set my surfaces outlined', 'set my surfaces raised'],
    words:
      'surface surfaces panel panels flat outlined raised elevated glass frosted blur depth',
  },
  buttons: {
    help: 'The button style, all variants together. solid: filled primary (the default). outline: primary is an accent outline with accent text. soft: primary is a light accent tint with accent text. caps: solid with uppercase, bold, spaced labels that never shrink. Corners come from the corners dial (corners pill --on button).',
    values: 'solid|outline|soft|caps',
    examples: ['set my buttons outline', 'set my buttons caps'],
    words: 'cta solid outline outlined soft tint caps uppercase filled',
  },
  type: {
    help: 'The type personality: how far headings step up from body text and how they are set. compact: small steps (x1.15), semibold. standard: the default (x1.2). editorial: bigger steps (x1.3), tight tracking, semibold. display: big steps (x1.4), heavy weight, tighter tracking (a marketing feel). Text below the base size keeps its standard sizes, so small text stays readable. Works with text-size; a headings setting keeps its weight or tracking whatever the order. Phones (touch screens below 1024px wide) keep the base theme reading sizes.',
    values: Object.keys(TYPE_STYLES).join('|'),
    examples: ['set my type display', 'set my type editorial'],
    words:
      'typography personality editorial display marketing scale hierarchy hero',
  },
  'text-size': {
    help:
      'Base text size; every heading size scales from it. Rungs: ' +
      TEXT_SIZE.map(([n, v]) => `${n} (${v}px)`).join(', ') +
      ', or a number of pixels from 10 to 32. Phones (touch screens below 1024px wide) keep the base theme reading sizes.',
    values: 'small|medium|large|larger|more|less|<number>',
    examples: ['set my text-size small', 'set my text-size more'],
    words: 'text size font size small big large scale',
  },
  base: {
    help: `The built-in theme this theme builds on: ${LIKE.join(', ')}, or none. Changing it keeps all your settings.`,
    values: `${LIKE.join('|')}|none`,
    examples: ['set my base neutral', 'set my base none'],
    words: 'base start starting built-in extends foundation',
  },
  mode: {
    help: "Which color modes the theme supports. light-only / dark-only: the colors the theme sets get one value, its mode's shade; settings saved for the other mode stay saved but do not apply (the result names them); the in-app preview starts in that mode with no switch. both (default): colors without --mode apply to both; --mode light|dark sets one side, and the other side keeps the base theme's value.",
    values: 'both|light-only|dark-only',
    examples: ['set my mode dark-only'],
    words: 'mode light dark only night day scheme',
  },
});

/** CSS properties grouped by the aspect of a part they change. */
export const GROUPS = wordTable(
  /** @type {Record<string, string[]>} */ ({
    text: ['color', 'fill', '-webkit-text-fill-color', 'caret-color'],
    background: ['background-color', 'background-image', 'background'],
    border: [
      'border-color',
      'border-top-color',
      'border-bottom-color',
      'border-left-color',
      'border-right-color',
      'border-block-color',
      'border-inline-color',
      'border-width',
      'border-style',
      'outline-color',
    ],
    corners: [
      'border-radius',
      'border-start-start-radius',
      'border-start-end-radius',
      'border-end-start-radius',
      'border-end-end-radius',
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
    ],
    shadow: ['box-shadow'],
    spacing: [
      'padding',
      'padding-block',
      'padding-inline',
      'padding-top',
      'padding-bottom',
      'padding-inline-start',
      'padding-inline-end',
      'padding-left',
      'padding-right',
      'gap',
      'row-gap',
      'column-gap',
      'margin',
      'margin-block',
      'margin-inline',
    ],
    font: [
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'text-transform',
    ],
    size: [
      'height',
      'min-height',
      'width',
      'min-width',
      'block-size',
      'inline-size',
    ],
  }),
);

/** The CSS property that sets each aspect directly, whatever token it reads. */
export const DIRECT = wordTable(
  /** @type {Record<string, string>} */ ({
    text: 'color',
    background: 'background',
    border: 'border',
    corners: 'border-radius',
    shadow: 'box-shadow',
    spacing: 'padding',
    font: 'font-weight',
    size: 'min-height',
  }),
);

/** Properties whose value is one plain color. */
export const COLOR_PROPS =
  /^(color|background-color|border(-(top|right|bottom|left|block|inline))?-color|outline-color|fill|stroke|caret-color|text-decoration-color)$/;

/** Tokens `show` prints the resolved value of. */
export const KEY_TOKENS = [
  '--color-accent',
  '--color-text-accent',
  '--color-on-accent',
  '--color-background-body',
  '--color-background-surface',
  '--color-background-card',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-border',
  '--radius-element',
  '--radius-container',
  '--spacing-4',
  '--font-family-body',
];

/** The CSS properties `how --list properties` shows without a filter. */
export const COMMON_PROPERTIES = [
  'background',
  'background-color',
  'color',
  'border',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'box-shadow',
  'padding',
  'gap',
  'min-height',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-transform',
  'opacity',
  'outline',
];

/**
 * Words people use for a thing that is not a dial, token or property, and
 * the commands that do what they mean.
 * @type {Record<string, (value: string, on: string | undefined) => string[]>}
 */
export const THING_HINTS = wordTable({
  gradient: (v, on) => [
    `${P} set <theme> background "linear-gradient(${v || '#ffffff, #dddddd'})" --on ${on ?? '<part>'}`,
  ],
  bevel: (_v, on) => [
    `${P} set <theme> box-shadow "inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9ca3af" --on ${on ?? '<part>'}`,
  ],
  // The value given is carried (none, false and off are no shadow); the
  // sample only when none is.
  shadow: (v, on) => [
    `${P} set <theme> box-shadow ${/^(none|false|off|no|0)$/i.test(v.trim()) ? 'none' : v.trim() ? JSON.stringify(v.trim()) : '"0 2px 6px rgb(0 0 0 / 0.3)"'} --on ${on ?? '<part>'}`,
  ],
  radius: (v, on) => [
    `${P} set <theme> corners ${v || 'medium'}${on ? ` --on ${on}` : ''}`,
  ],
  rounded: (v, on) => [
    `${P} set <theme> corners ${/^(none|false|off|no|0)$/i.test(v.trim()) ? 'square' : /^(true|yes|on)?$/i.test(v.trim()) ? 'round' : v.trim()}${on ? ` --on ${on}` : ''}`,
  ],
  padding: (_v, on) => [
    `${P} set <theme> spacing roomy${on ? ` --on ${on}` : ''}`,
    `${P} set <theme> padding 12px --on ${on ?? '<part>'}`,
  ],
  density: () => [`${P} set <theme> spacing compact`],
  bold: (v, on) => [
    `${P} set <theme> font-weight ${/^(none|false|off|no|normal)$/i.test(v.trim()) ? 'normal' : 'bold'} --on ${on ?? '<part>'}`,
  ],
  'text-color': (_v, on) => [`${HOW} "text color on ${on ?? '<part>'}"`],
});

/** Sample values for design words in a `how` question. */
export const DESIGN = wordTable(
  /** @type {Record<string, string>} */ ({
    gradient: '"linear-gradient(#ffffff, #d1d5db)"',
    glossy: '"linear-gradient(#ffffff 0%, #c7d2fe 45%, #6366f1 100%)"',
    bevel: '"inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9ca3af"',
    raised: '"0 1px 2px rgb(0 0 0 / 0.3)"',
    flat: 'none',
    sunken: '"inset 1px 1px 2px rgb(0 0 0 / 0.3)"',
  }),
);

/**
 * Parts drawn by a Card (their class sits on the Card's own element), so
 * their padding is the card's padding variables.
 */
export const CARD_LIKE = ['clickable-card', 'selectable-card'];

/**
 * Parts whose theme class sits on a transparent wrapper while Core draws the
 * visible box on an inner element with no class of its own (see
 * /core-gaps: the composer body). Padding reaches the box only through the
 * part's padding variable; a surface (background, border, shadow) paints
 * the wrapper's square corners; a density re-sets the variable on the box.
 */
export const WRAPPED_PARTS = /** @type {Record<string, {box: string}>} */ ({
  'chat-composer': {box: 'the rounded composer body'},
});

/** States every part takes, beyond the ones its doc lists. */
export const COMMON_STATES = [
  'hover',
  'active',
  'focus',
  'focus-visible',
  'focus-within',
  'disabled',
];

// These tables are looked up by words people type: with no prototype,
// `constructor` or `__proto__` is never found in them.
for (const table of [
  FAMILIES,
  FONTS,
  OPEN_FONTS,
  CLOSEST_OPEN_FONT,
  HEADING_WEIGHTS,
  HEADING_TRACKING,
  SURFACES,
  TYPE_STYLES,
  DIALS,
  GROUPS,
  DIRECT,
  THING_HINTS,
  DESIGN,
])
  Object.setPrototypeOf(table, null);
