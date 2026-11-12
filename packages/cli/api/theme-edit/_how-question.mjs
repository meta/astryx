// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A plain-words question for `how`, read clause by clause: the parts
 * it names (with a variant, size, state or mode), what to change about
 * them, the values typed in it, and whether it asks for more, less or none.
 * Each clause becomes the commands that do exactly that; `how` then keeps
 * only the commands `set` accepts and that change the theme.
 * @position api/theme-edit — imported only by _how.mjs
 */

import {hex, parseColor, ratio} from './_color.mjs';
import {
  DESIGN,
  DIALS,
  HEADING_WEIGHTS,
  P,
  FAMILIES,
  FONTS,
  HOW,
  OPEN_FONTS,
  COMMON_STATES,
} from './_tables.mjs';
import {PALETTE_DIALS, isGraySeed, seedOf} from './_palette.mjs';
import {focusStateOf} from './_settings.mjs';
import {COLOR_PROPS, GROUPS} from './_tables.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {SYSTEM_FAMILIES} from '../theme/build/font-warning.mjs';
import {cssProperties, matchValue} from './_css.mjs';

/** @typedef {import('./_how-commands.mjs').Step} Step */

/**
 * One answer: what it does, and the ways to do it. Each option is a list of
 * steps run in order; most options are one step.
 * @typedef {{text: string, options: Step[][], sequence?: boolean, lookup?: string}} Draft
 */

/**
 * Words of other languages the docs ship, and the English word each means.
 * Matched as whole words, or anywhere for scripts without spaces.
 * @type {Array<[RegExp, string]>}
 */
const TRANSLATE = /** @type {Array<[RegExp, string]>} */ (
  [
    [
      'botones?|boutons?|knöpfe|knopf|кнопк[аиу]|botões|botão|botao|pulsanti|bottoni|الأزرار|أزرار|زر|बटन',
      '按钮|ボタン|버튼',
      'buttons',
    ],
    [
      'tarjetas?|cartes|karten?|карточк[аи]|schede|carte',
      '卡片|カード|카드',
      'cards',
    ],
    [
      'redondead[oa]s?|redond[oa]s|arrondi[es]*|abgerundet\\p{L}*|скругл\\p{L}*|arredondad\\p{L}*|arrotondat\\p{L}*|مستدير\\p{L}*|गोल',
      '圆|丸く|丸い|둥글게|둥근',
      'rounded',
    ],
    ['esquinas?|coins|ecken|углы', '角', 'corners'],
    [
      'sombras?|ombres?|ombra|ombre|schatten|тен[ьи]|ظل',
      '阴影|影|그림자',
      'shadow',
    ],
    [
      'entfernen|quitar|enlever|supprimer|убрать|togliere|rimuovere|remover|हटाओ',
      '去掉|删除|消して|없애',
      'remove',
    ],
    ['цвет\\p{L}*|colore|farbe', '颜色|色', 'color'],
    ['акцент\\p{L}*', '强调', 'accent'],
    ['más|mais|mehr|più|более', '更', 'more'],
    // "sans" is a typeface word before serif or font.
    [
      'sin|sans(?![\\s-]*(serif|fonts?|typefaces?))|ohne|без|sem|senza',
      '没有|无',
      'without',
    ],
    [
      'bordes?|bordures?|rand|rahmen|границ\\p{L}*|bordas?|bordi',
      '边框|枠線',
      'border',
    ],
    ['azul(es)?|bleus?|blaue?n?|син\\p{L}*|blu', '蓝色?|青い|青く|青', 'blue'],
    ['rojos?|rouges?|rote?n?|красн\\p{L}*', '红色?|赤い', 'red'],
    ['verdes?|verts?|grüne?n?|зелён\\p{L}*', '绿色?|緑', 'green'],
  ].map(([words, cjk, en]) => [
    new RegExp(`(?<!\\p{L})(?:${words})(?!\\p{L})|${cjk}`, 'gu'),
    ` ${en} `,
  ])
);

/**
 * Words a near miss is corrected to (one or two letters off), besides the
 * one-word target names Core's catalog gives (partLexicon): design words,
 * and the words the part overrides read.
 */
const DESIGN_WORDS = [
  'leading',
  'header',
  'headers',
  'input',
  'inputs',
  'checkbox',
  'toggle',
  'sidebar',
  'progress',
  'shadow',
  'shadows',
  'border',
  'borders',
  'background',
  'rounded',
  'rounder',
  'corners',
  'radius',
  'padding',
  'spacing',
  'gradient',
  'color',
  'colour',
  'bigger',
  'smaller',
  'darker',
  'lighter',
  'thicker',
  'italic',
  'uppercase',
  'compact',
  'accent',
  'remove',
  'outline',
];

/** Short forms people type, and the word each means. */
const SHORT = /** @type {Record<string, string>} */ ({
  btn: 'button',
  btns: 'buttons',
  bttn: 'button',
  bttns: 'buttons',
  brdr: 'border',
  bdr: 'border',
  hdr: 'header',
  rad: 'radius',
  dlg: 'dialog',
  txt: 'text',
  clr: 'color',
  shdw: 'shadow',
});

/** Plain words that are never corrected, though one letter off a VOCAB word. */
const KEEP = new Set([
  'lines',
  'shadowy',
  'times',
  'remote',
  'reverse',
  'access',
  'accept',
  'tablet',
  'outlined',
  'shadowed',
  'process',
  'agent',
  'tighter',
  'tight',
  'brighter',
  'wider',
  'danger',
  'orange',
  'ranger',
  'rows',
  'thinner',
  'rounds',
  'should',
  'colors',
  'italics',
  'fonts',
  'title',
  'titles',
  'shade',
  'shades',
  'faded',
  'muted',
  'filled',
  'spaced',
  'bolder',
  'cord',
  'board',
  'order',
  'boarder',
  'hover',
  'heavier',
  'later',
  'darken',
  'ladder',
  'leader',
  'cars',
  'care',
  'hard',
  'carts',
  'bottom',
  'botton',
  'inside',
  'colours',
  'sitch',
  'witch',
  'sharper',
  'taller',
]);

/**
 * A word with a near miss corrected: two swapped letters count as one edit.
 * @param {string} w
 * @param {string[]} vocab
 */
function corrected(w, vocab) {
  if (SHORT[w]) return SHORT[w];
  // A state word ("selected") is read as a state, never corrected.
  if (
    w.length < 5 ||
    KEEP.has(w) ||
    vocab.includes(w) ||
    !/^[a-z]+$/.test(w) ||
    STATE_WORDS.some(([re]) => re.test(w))
  )
    return w;
  const limit = w.length >= 8 ? 2 : 1;
  let best = w;
  let bestD = limit + 1;
  for (const v of vocab) {
    const d = levenshteinDistance(w, v, 2, {swaps: true});
    if (d < bestD) [best, bestD] = [v, d];
  }
  return bestD <= limit ? best : w;
}

/** A stop on a gray family: "gray-50", "slate 100", "zinc-900". */
const GRAY_STOP =
  /\b(gr[ae]y|slate|zinc|neutral|stone)[\s-]?(50|[1-9]00|950)\b/g;

/**
 * The color at a stop of a gray family, in OKLCH: the lightness the common
 * 50-950 gray scales give each stop, with the family's slight hue.
 * @param {string} family @param {number} stop
 */
function grayStop(family, stop) {
  const L = /** @type {Record<number, number>} */ ({
    50: 0.985,
    100: 0.967,
    200: 0.928,
    300: 0.872,
    400: 0.707,
    500: 0.551,
    600: 0.446,
    700: 0.373,
    800: 0.278,
    900: 0.21,
    950: 0.13,
  })[stop];
  // Grays are near neutral at the light and dark ends, tinted most in
  // the middle.
  const [base, hue] = /** @type {Record<string, [number, number]>} */ ({
    gray: [0.03, 264],
    grey: [0.03, 264],
    slate: [0.05, 257],
    zinc: [0.015, 286],
    neutral: [0, 0],
    stone: [0.012, 56],
  })[family];
  const chroma = Number(
    (base * Math.min(1, 2 * Math.min(L, 1 - L))).toFixed(4),
  );
  return hex(
    /** @type {number[]} */ (parseColor(`oklch(${L} ${chroma} ${hue})`)),
  );
}

/** Hues people name, as fills a part can take. */
const HUES = /** @type {Record<string, string>} */ ({
  red: '#dc2626',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#65a30d',
  green: '#16a34a',
  mint: '#34d399',
  minty: '#34d399',
  teal: '#0d9488',
  cyan: '#0891b2',
  blue: '#2563eb',
  navy: '#1e3a8a',
  indigo: '#4f46e5',
  purple: '#7c3aed',
  charcoal: '#333333',
  violet: '#7c3aed',
  pink: '#db2777',
  magenta: '#c026d3',
  brown: '#92400e',
  gray: '#9ca3af',
  grey: '#9ca3af',
  black: '#000000',
  white: '#ffffff',
  cream: '#fef3c7',
  beige: '#f5f5dc',
});
/** A hue with light, pale or dark before it. */
const SHADED = /** @type {Record<string, Record<string, string>>} */ ({
  light: {
    gray: '#e5e7eb',
    grey: '#e5e7eb',
    blue: '#dbeafe',
    green: '#dcfce7',
    red: '#fee2e2',
    yellow: '#fef9c3',
    purple: '#ede9fe',
    pink: '#fce7f3',
    orange: '#ffedd5',
  },
  pale: {gray: '#f3f4f6', grey: '#f3f4f6', blue: '#eff6ff', green: '#f0fdf4'},
  dark: {
    gray: '#374151',
    grey: '#374151',
    blue: '#1e40af',
    green: '#166534',
    red: '#991b1b',
    purple: '#5b21b6',
  },
});

/** The color tokens a word for a color the theme uses names. */
const THEME_COLOR_WORDS = /** @type {Array<[RegExp, string, string]>} */ ([
  [
    /\b(accent|brand|primary) colou?r(ed)?\b|\bin (the )?accent\b|\baccent\b/,
    'var(--color-accent)',
    'var(--color-text-accent)',
  ],
]);

/**
 * The colors written in a clause, in order: hex, color functions, CSS color
 * names and hues (with light, pale or dark), skipping any after "not".
 * @param {string} c a clause, lower-case
 * @returns {string[]}
 */
function colorsIn(c) {
  /** @type {Array<[number, string, boolean?]>} */
  const found = [];
  // "gray-50", "zinc 900": a stop on a gray family, by its lightness.
  for (const m of c.matchAll(GRAY_STOP))
    found.push([m.index ?? 0, grayStop(m[1], Number(m[2])), true]);
  const re =
    /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\([^)]*\)|\b(?:(light|pale|dark|subtle|soft)\s+)?([a-z]+)\b/g;
  for (const m of c
    .replace(GRAY_STOP, s => ' '.repeat(s.length))
    .matchAll(re)) {
    const before = c.slice(Math.max(0, (m.index ?? 0) - 12), m.index);
    // "charcoal text instead of black": the color after "instead of" is
    // the one to move away from.
    if (/\bnot\s*$|\bno\s*$|\binstead of\s*$|\brather than\s*$/.test(before))
      continue;
    const whole = m[0];
    if (whole.startsWith('#') || whole.includes('(')) {
      // A typed hex color keeps the case it is written in, as set stores it.
      // A color-mix() is kept as typed; set checks it.
      if (parseColor(whole) || /^color-mix\(/.test(whole))
        found.push([m.index ?? 0, whole, true]);
      continue;
    }
    const shade = m[1] === 'subtle' || m[1] === 'soft' ? 'pale' : m[1];
    const word = m[2];
    if (shade && SHADED[shade]?.[word]) {
      found.push([m.index ?? 0, SHADED[shade][word]]);
      continue;
    }
    if (HUES[word])
      found.push([(m.index ?? 0) + (shade ? shade.length + 1 : 0), HUES[word]]);
    else if (word.length > 3 && !NOT_COLORS.has(word) && parseColor(word))
      found.push([
        m.index ?? 0,
        hex(/** @type {number[]} */ (parseColor(word))),
      ]);
  }
  // "success green should be more minty": the color after "be" or "to"
  // is the one asked for.
  // A color written out (hex, rgb()...) beats a color word: "brand blue,
  // #0057ff" is #0057ff.
  const turn = /\b(to|be|into|become|instead)\b/.exec(c);
  const at = turn ? (turn.index ?? 0) : -1;
  return found
    .sort((a, b) => a[0] - b[0])
    .sort((a, b) => Number(b[0] > at) - Number(a[0] > at))
    .sort((a, b) => Number(Boolean(b[2])) - Number(Boolean(a[2])))
    .map(([, v]) => v);
}

/**
 * A hex color written with the wrong number of digits ("#12345").
 * @param {string} c
 */
const badHex = c =>
  [...c.matchAll(/(?<![\w&])#([0-9a-f]+)\b/g)]
    .map(m => m[0])
    .find(h => ![3, 4, 6, 8].includes(h.length - 1)) ?? null;

/**
 * A fill a clause names with dark or light alone ("make the header dark").
 * @param {string} c
 */
function toneIn(c) {
  const t = c.replace(
    /\b(dark|light)[- ](mode|theme)s?\b|\bin (dark|light)\b/g,
    ' ',
  );
  if (/\bdark\b(?!er)/.test(t)) return '#1f2937';
  if (/\blight\b(?!er)/.test(t)) return '#f3f4f6';
  return null;
}
/** CSS color names that are also plain words in a question. */
const NOT_COLORS = new Set([
  'chocolate',
  'linen',
  'snow',
  'tan',
  'peru',
  'plum',
  'gold',
  'silver',
  'salmon',
  'thistle',
  'orchid',
  'wheat',
  'bisque',
  'moccasin',
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
]);

/** Lengths written in a clause, in order. @param {string} c */
const lengthsIn = c =>
  [...c.matchAll(/(?<![\w#.])-?(\d*\.?\d+)(px|rem|em)\b/g)].map(m => m[0]);

/** Two to four lengths in a row, as one value ("12px 20px"). @param {string} c */
const boxIn = c =>
  /(?<![\w#.])(-?\d*\.?\d+(?:px|rem|em)(?:\s+-?\d*\.?\d+(?:px|rem|em)){1,3})\b/.exec(
    c,
  )?.[1] ?? null;

/**
 * A box-shadow value written out: offsets, then a blur, spread and color,
 * several separated by commas.
 * @param {string} c
 */
function shadowIn(c) {
  const one =
    '(?:inset\\s+)?-?\\d*\\.?\\d+(?:px)?\\s+-?\\d*\\.?\\d+(?:px)?(?:\\s+-?\\d*\\.?\\d+(?:px)?){0,2}\\s+(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|oklch)\\([^)]*\\)|[a-z]+)';
  return (
    new RegExp(`${one}(?:\\s*[,\u2e34]\\s*${one})*`)
      .exec(c)?.[0]
      .replace(/\u2e34/g, ',') ?? null
  );
}

/** A length tied to a height word ("40px tall", "height 40px"). @param {string} c */
const tallIn = c =>
  /\b(\d+(?:px|rem))\s+(?:tall|high)\b|\b(?:height|tall)\s*:?\s*(\d+(?:px|rem))\b/
    .exec(c)
    ?.slice(1)
    .find(Boolean) ?? null;

/** A length tied to a radius word ("8px radius", "radius: 8px"). @param {string} c */
const radiusIn = c =>
  /(-?\d*\.?\d+(?:px|rem|em|%)?)\s*(?:border[\s-]+)?(?:radius|corners?)\b|\b(?:radius|corners?|rounded)\s*(?:values?\s+)?(?:are|is|of|at)?\s*:?\s*(?:to\s+)?(?:about\s+|around\s+)?(-?\d*\.?\d+(?:px|rem|em|%)?)(?:\b|(?<=%))/
    .exec(c)
    ?.slice(1)
    .find(Boolean) ?? null;

/**
 * Make a color lighter or darker by mixing in white or black.
 * @param {string} color @param {number} amount -1 (darker) to 1 (lighter)
 */
function shift(color, amount) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const to = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  return hex(rgb.map(c => c + (to - c) * a));
}

/**
 * A color made stronger or fainter: a see-through color (#00000014) keeps
 * its hue and scales its alpha; an opaque one moves toward black or white.
 * @param {string} color @param {number} f above 1 stronger, below 1 fainter
 * @param {'light' | 'dark'} mode
 */
function stronger(color, f, mode) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(String(color).trim());
  if (m) {
    const a = Math.max(1, Math.min(255, Math.round(parseInt(m[2], 16) * f)));
    return `#${m[1]}${a.toString(16).padStart(2, '0')}`;
  }
  const away = mode === 'dark' ? 1 : -1;
  return shift(color, (f > 1 ? 0.25 : -0.25) * away);
}

/**
 * A font weight written in a clause: a number from 100 to 900, or a weight
 * word ("semibold").
 * @param {{text: string}} c
 */
function weightIn(c) {
  const n = /\b([1-9]00)\b(?!\s*(px|ms|%))/.exec(c.text)?.[1];
  if (n) return n;
  const w = /\b(semi-?bold|medium|regular|normal)\b/.exec(c.text)?.[1];
  return w
    ? HEADING_WEIGHTS[w === 'normal' ? 'regular' : w.replace('-', '')]
    : null;
}

/** Scale a CSS length. @param {string} v @param {number} f */
function scaled(v, f) {
  const m = /^(\d*\.?\d+)(px|rem|em)$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]) * f;
  return `${m[2] === 'px' ? Math.round(n) : Number(n.toFixed(3))}${m[2]}`;
}

/**
 * @typedef {{on: string, when?: string, role?: string, level?: string}} PartRef
 */

/**
 * Phrases for parts that Core's catalog cannot give: groups, variants,
 * font roles, phrases of several words, and words two components share.
 * They are read before the catalog's names and doc keywords
 * (partLexicon), longest phrase first.
 * @type {Array<[RegExp, PartRef]>}
 */
const OVERRIDES = [
  [
    /\baccordions? (headers?|triggers?|titles?|headings?)\b/,
    {on: 'collapsible-trigger'},
  ],
  [/\baccordions?\b/, {on: 'collapsible'}],
  [/\bcombo ?box(es)?\b/, {on: 'complex-selector'}],
  [/\bnotifications?\b/, {on: 'toast'}],
  [/\b(focus (ring|outline)s?)\b/, {on: 'focus-ring'}],
  [/\b((modal |dialog )?(overlay|scrim|backdrop))\b/, {on: 'overlay'}],
  [/\bicons?\b/, {on: 'icons'}],
  [
    /\b(table header|column headers?|table headings?)\b/,
    {on: 'table-header-cell'},
  ],
  [
    /\b(tabs? (underline|indicator)s?|underline (of|on|under) (the )?tabs?)\b/,
    {on: 'tab-indicator'},
  ],
  [/\b(status dots?)\b/, {on: 'status-dot'}],
  [/\b(progress( bar)?( fill)?|loading bar)\b/, {on: 'progress-bar-fill'}],
  [
    /\b((side ?nav|sidebar)( nav(igation)?)? (links?|items?))\b/,
    {on: 'side-nav-item'},
  ],
  [
    /\b((dropdown |context )?menu (items?|options?|entries)|dropdown items?)\b/,
    {on: 'dropdown-menu-item'},
  ],
  [/\b(nav(igation)? (links?|items?))\b/, {on: 'top-nav-item'}],
  [/\b((dropdown |context )?menus?)\b/, {on: 'dropdown-menu'}],
  [/\bfooters?\b/, {on: 'layout-footer'}],
  [/\b(side ?nav|sidebar|side ?panel)\b/, {on: 'side-nav'}],
  [
    /\b(app (name|title)|logo|site title|product name)\b/,
    {on: 'top-nav-heading'},
  ],
  [
    /\b(header|top ?bar|title ?bar|nav ?bar|app ?bar|masthead)\b/,
    {on: 'app-shell-header'},
  ],
  [/\b(page|app background|whole background|body background)\b/, {on: 'page'}],
  [/\b(radio( buttons?)?|radios)\b/, {on: 'radio-indicator'}],
  [/\b(primary|main) buttons?\b/, {on: 'button', when: 'variant:primary'}],
  [/\bsecondary buttons?\b/, {on: 'button', when: 'variant:secondary'}],
  [/\bghost buttons?\b/, {on: 'button', when: 'variant:ghost'}],
  [
    /\b(danger|destructive|delete) (buttons?|ones?|variant)\b/,
    {on: 'button', when: 'variant:destructive'},
  ],
  [/\b(panels?|windows?|boxes|tiles?|containers?)\b/, {on: 'containers'}],
  [/\b(banners?|alerts?|notices?|announcements?)\b/, {on: 'banner'}],
  [/\b(text ?areas?|multi-?line (inputs?|fields?))\b/, {on: 'text-area'}],
  [
    /\b(select (dropdowns?|menus?|box(es)?|inputs?)|selects|dropdowns?|pickers?|select(?! (the|a|an|all|any|one|which|what|it|them)\b))\b/,
    {on: 'selector'},
  ],
  [/\b(skeletons?( loaders?)?|loading placeholders?)\b/, {on: 'skeleton'}],
  [
    /\b(inputs?|text ?box(es)?|text ?fields?|form fields?|fields?)\b/,
    {on: 'inputs'},
  ],
  [/\b(checkbox(es)?|check ?marks?)\b/, {on: 'checks'}],
  // "switch off", "switch the buttons to" are the verb, not the part.
  [
    /\b(toggles?|switch(es)?(?! (off|on|to|the|out|it|them|over|back|from)\b))\b/,
    {on: 'switch'},
  ],
  [/\b((table )?cells?)\b/, {on: 'table-cell'}],
  [/\b(table rows?|rows?|tables?)\b/, {on: 'table-row'}],
  [/\b(badges?|chips?|tags?)\b/, {on: 'badge'}],
  [/\bh([1-4])\b/, {on: 'heading'}],
  [/\b(headings?|titles?)\b/, {on: 'heading'}],
  [/\b(modals?|popups?)\b/, {on: 'dialog'}],
  [/\bcode\b/, {on: 'code', role: 'code'}],
  [/\bbody( text)?\b/, {on: 'body', role: 'body'}],
];

/**
 * Target names in Core's catalog that are plain words a question uses for
 * something else ("more padding", "align the text").
 */
const NOT_PART_WORDS = new Set([
  'center',
  'divider',
  'grid',
  'item',
  'layout',
  'list',
  'outline',
  'section',
  'stack',
  'step',
  'token',
]);

/** A word without its plural ending. @param {string} w */
const singular = w =>
  /(x|ch|sh|ss)es$/.test(w)
    ? w.slice(0, -2)
    : /[^s]s$/.test(w)
      ? w.slice(0, -1)
      : w;

/** @type {WeakMap<object, {parts: Array<[RegExp, PartRef]>, vocab: string[]}>} */
const lexicons = new WeakMap();

/**
 * The words for parts: the overrides, then every theming target's name read
 * from Core's catalog, longest first; and the words a near miss is
 * corrected to.
 * @param {import('./_settings.mjs').Ctx} ctx
 */
function partLexicon(ctx) {
  const {project} = ctx;
  const known = lexicons.get(project);
  if (known) return known;
  // A one-word name how reads as something else is never a part's name:
  // "text" is an aspect, "overlay" and "code" have overrides.
  const other = (/** @type {string} */ w) =>
    NOT_PART_WORDS.has(w) ||
    aspectsOf(w).includes(w) ||
    Object.hasOwn(DIALS, w) ||
    OVERRIDES.some(([re]) => re.test(` ${w} `) || re.test(` ${w}s `));
  /** @type {Array<[RegExp, PartRef]>} */
  const derived = [...project.target.keys()]
    .filter(key => key.includes('-') || !other(key))
    .sort((x, y) => y.length - x.length)
    .map(key => [
      new RegExp(`\\b${key.replace(/-/g, '[\\s-]?')}s?\\b`),
      {on: key},
    ]);
  // Near misses are corrected to one-word part names and design words.
  const vocab = [
    ...new Set([
      ...DESIGN_WORDS,
      ...[...project.target.keys()]
        .filter(key => !key.includes('-'))
        .flatMap(key => [key, `${key}s`]),
    ]),
  ];
  const lex = {parts: [...OVERRIDES, ...derived], vocab};
  lexicons.set(project, lex);
  return lex;
}

/** Words for a color the theme generates. */
const ROLE_WORDS =
  /\b(accent|brand|primary colou?r|main colou?r|key colou?r|errors?|danger|destructive|success|positive|warnings?|caution|info|notices?|neutrals?)\b|\bprimary\s*:?\s*(?=#|rgb|hsl|oklch)/;

/** States a word names. */
const STATE_WORDS = /** @type {Array<[RegExp, string]>} */ ([
  [/\b(hover(ed|ing)?|mouse ?over)\b/, 'hover'],
  [/\b(focus(ed|ing)?|on focus)\b/, 'focus'],
  [/\b(disabled|inactive)\b/, 'disabled'],
  [/\b(checked|ticked|when on|turned on|toggled on|is on)\b/, 'checked'],
  [
    /\b(selected|active (tab|nav|item|link|page))\b|\bactive\b(?=.*\b(nav|tab|item)\b)/,
    'selected',
  ],
  [/\b(pressed|clicked|tapped|on press|on click)\b/, 'active'],
  [/\b(invalid|errors? state|has an error|with an error)\b/, 'invalid'],
  // Words for states a part may not have: the answer says so.
  [/\bread-?only\b/, 'readonly'],
  [
    /\bloading\b(?! (bars?|placeholders?|skeletons?|spinners?|states?|indicators?))/,
    'loading',
  ],
  [/\b(unchecked|not checked|unticked)\b/, 'unchecked'],
]);

/**
 * One clause, read.
 * @typedef {object} Clause
 * @property {string} text
 * @property {Array<{on: string, when?: string, role?: string, level?: string}>} parts
 * @property {string[]} aspects
 * @property {boolean} neg
 * @property {'more' | 'less' | null} dir
 * @property {string[]} colors
 * @property {string | null} bad - a hex color written with the wrong number of digits
 * @property {string[]} lengths
 * @property {string | null} state
 * @property {'light' | 'dark' | null} mode
 * @property {boolean} except - "but not on X": X keeps what the clause before does
 * @property {Record<string, string>} decl - CSS written as `prop: value`
 * @property {string[]} [quoted] - family names the clause writes in quotes
 * @property {{prop: string, value: string, bad?: string} | null} named - a CSS property the clause names, with its value as typed
 */

/**
 * The aspects a clause asks about, by its words. Order is the answer order.
 * @param {string} text
 */
function aspectsOf(text) {
  // A part's name is not an aspect: "text input" asks about an input.
  const c = text.replace(
    /\btext ?(inputs?|fields?|box(es)?|areas?)\b/g,
    'inputs',
  );
  /** @type {string[]} */
  const a = [];
  const add = (/** @type {string} */ x) => {
    if (!a.includes(x)) a.push(x);
  };
  if (/\b(letter ?spacing|tracking|kerning)\b/.test(c)) add('tracking');
  if (
    /\b(round(ed|er|ness|ing)?|unround\w*|corners?|radius|radii|curv\w*|circular(?! (font|typeface))|circles?|pill( shaped)?|sharp(er)?|square(d|r)?)\b/.test(
      // "Feedback round 2" is not a corner.
      c.replace(/\bround \d+\b/g, ' '),
    )
  )
    add('corners');
  if (
    /\b(shadows?|shadowy|elevat\w*|depth|raised|lifts?|lifted|lifting|glow\w*|bevel\w*|sunken|inset|flat)\b/.test(
      c,
    )
  )
    add('shadow');
  if (
    /\b(borders?(?![\s-]*radius)|outlines?|strokes?|edges?|frames?|rings?)\b/.test(
      c,
    )
  )
    add('border');
  if (/\bunderlined?\b|\bunderlines\b/.test(c) && !/\btabs?\b/.test(c))
    add('underline');
  if (/\bline ?height|\bleading\b|\bline spacing\b/.test(c)) add('leading');
  if (
    !a.includes('tracking') &&
    /\b(padding|spacing|space|spaced|gaps?|margins?|room(y|ier)?|airy|breathing|dense|denser|density|compact|tight(er)?|cramped|crowded|spacious|packed)\b/.test(
      c,
    )
  )
    add('spacing');
  if (
    /\b(uppercase|upper case|all caps|caps|lowercase|capitali[sz]ed?)\b/.test(c)
  )
    add('case');
  if (/\bitalics?\b/.test(c)) add('italic');
  if (
    /\b(bold(er)?|unbold\w*|weight|heav(y|ier)|semibold)\b/.test(c) ||
    /\bthin(ner)? (font|text|type|letters|headings?|labels?)\b/.test(c) ||
    (/\blight(er)?\b/.test(c) &&
      /\b(headings?|titles?|font|weight)\b/.test(c) &&
      !/\b(text|colou?r|mode|background|bg)\b/.test(c))
  )
    add('weight');
  if (
    /\b(fonts?|typefaces?|serif|sans(-serif)?|sanz|mono(space|spaced)?)\b/.test(
      c,
    ) &&
    !/\bfont ?size\b/.test(c) &&
    !/\bfont ?weight\b|\b(bold|heav|light(er)?|thin)\w* fonts?\b|\bfonts? weight/.test(
      c,
    ) &&
    !/\bfont (colou?r)\b/.test(c)
  )
    add('family');
  if (
    /\b(font ?size|text ?size|(bigger|larger|smaller|huge|tiny|big|small) (text|font|headings?|titles?|labels?)|(text|font|headings?|titles?|labels?|h[1-6]) (bigger|larger|smaller))\b/.test(
      c,
    ) ||
    (/\b(bigger|larger|smaller)\b/.test(c) &&
      /\b(text|font|headings?|titles?|h[1-6]|body)\b/.test(c)) ||
    /\b\d+(px|rem) (text|font|labels?|type)\b/.test(c) ||
    /\b(text|font|headings?|titles?|labels?|h[1-6])\s+\d+(\.\d+)?(px|rem|em|pt)\b/.test(
      c,
    ) ||
    /\b(text|font|type)( is)? (way |far |much )?too (small|tiny|big|large)\b|\btoo (small|tiny) to read\b/.test(
      c,
    ) ||
    /\bbody (text|copy|font)\s+\d+(\.\d+)?(px|rem)\b/.test(c)
  )
    add('fontsize');
  if (
    (/\b(taller|shorter|wider|narrower|width|(?<!line )height|bigger|larger|smaller|tall|too (small|tiny|big|large))\b/.test(
      c,
    ) ||
      (/\b(thick(er)?|thin(ner)?)\b/.test(c) &&
        /\b(progress|underline|indicator)/.test(c))) &&
    !a.includes('fontsize') &&
    !a.includes('tracking') &&
    // "a bigger shadow" is a stronger shadow, not a bigger part.
    !(
      a.includes('shadow') &&
      !/\b(taller|shorter|wider|narrower|width|height|tall)\b/.test(c)
    )
  )
    add('size');
  if (
    !a.includes('family') &&
    new RegExp(`\\b(${FONT_NAMES})\\b`).test(c.replace(/\bsanz\b/g, 'sans'))
  )
    add('family');
  if (!a.length && /\b(thick(er)?|thin(ner)?)\b/.test(c)) add('border');
  if (
    /\b(faded|fade|opacity|see-through|washed out)\b/.test(c) ||
    // A percent is an opacity only beside an opacity word, never inside a
    // function or after a color ("#2563eb 0%" is a gradient stop).
    (/\d+%/.test(withoutFunctions(c)) &&
      /\b(transparent|translucent|opaque|alpha|visible)\b/.test(c) &&
      !a.includes('corners'))
  )
    add('opacity');
  if (/\b(scales? (down|up)|shrinks?|grows?)\b/.test(c)) add('scale');
  if (
    (/\b(text|writing|words|labels?|font colou?r|readable|links?|body copy)\b/.test(
      c,
    ) ||
      // "heading color red": a part that is only text has a text color.
      /\b(headings?|titles?|h[1-6]) colou?rs?\b/.test(c) ||
      /\b(buttons?|links?) colou?r\b/.test(c)) &&
    !a.some(x =>
      ['case', 'italic', 'weight', 'family', 'fontsize', 'tracking'].includes(
        x,
      ),
    )
  )
    add('text');
  if (
    /\b(background|bg|fill(ed)?|gradient|glossy|tint(ed)?|stripes|striped|zebra|transparent)\b/.test(
      c,
    )
  )
    add('background');
  return a;
}

/** Font names a question can name, as words. */
const FONT_NAMES = [...Object.keys(OPEN_FONTS), ...Object.keys(FONTS)]
  .filter(k => !['system', 'serif', 'mono', 'rounded', 'comic'].includes(k))
  .map(k => k.replace(/-/g, ' '))
  .join('|');

/**
 * Read a question into clauses.
 * @param {string} q lower-case, translated, corrected
 * @param {Array<[RegExp, PartRef]>} partWords
 * @returns {Clause[]}
 */
function clausesOf(q, partWords) {
  // "swap X and Y" is one ask.
  const pieces = (/\bswap\b/.test(q) ? q.replace(/\band\b/g, '&') : q)
    .split(
      /;|\.(?=\s|$)|,(?![^(]*\))|\b(?:and|with|but|then|plus|also|y|et|und|и)\b|\bwhile\b|(?=\bexcept\b)/,
    )
    .map(s => s.trim())
    .filter(Boolean);
  return pieces.map(text => {
    /** @type {Clause['parts']} */
    const parts = [];
    // A property name is not a part: "backdrop-filter" names no backdrop.
    let rest = ` ${text} `
      .replace(/\bvar\([^)]*\)|--[a-z][\w-]*/g, ' ')
      .replace(/\b[a-z]+(?:-[a-z]+)+\b/g, m =>
        cssProperties().has(m) ? ' ' : m,
      );
    const cornerWords = /\b(round|corner|radius|shape|circular)/.test(text);
    for (const [re, part] of partWords) {
      const m = re.exec(rest);
      if (!m) continue;
      const p = {...part};
      if (p.on === 'heading' && /^h[1-4]$/.test(m[0])) p.level = m[1];
      // "the error banner": one status of the banner.
      const status =
        /\b(error|danger|warning|success|info)\s+(banners?|alerts?|notices?)\b/.exec(
          rest,
        )?.[1];
      if (p.on === 'banner' && status)
        p.when = `status:${status === 'danger' ? 'error' : status}`;
      parts.push(p);
      rest = rest.replace(re, ' ');
    }
    // "list rounder": a catalog name that is also a plain word is the part
    // when the clause names no other part and asks for a shape change.
    const shapeAsk =
      /\b(round\w*|corners?|radius|shadows?|borders?|padding|bold\w*|bigger|smaller|taller|wider)\b/;
    if (!parts.length && shapeAsk.test(text))
      for (const w of NOT_PART_WORDS)
        if (new RegExp(`\\b${w}s?\\b`).test(text)) {
          parts.push({on: w});
          break;
        }
    // "pill" names a corner shape, not a badge, when the clause is about shape.
    if (cornerWords || /\bpill( shaped)?\b/.test(text))
      for (let i = parts.length - 1; i >= 0; i--)
        if (parts[i].on === 'badge' && !/\b(badges?|chips?|tags?)\b/.test(text))
          parts.splice(i, 1);
    const aspects = aspectsOf(text);
    // "orange not red" negates a color, not the change.
    const hue = Object.keys(HUES).join('|');
    const negText = text.replace(
      new RegExp(
        `\\b(not|no)\\s+((pure|plain|light|dark|pale|off)[\\s-]+)?(${hue})\\b`,
        'g',
      ),
      ' ',
    );
    const neg =
      /\b(no|not|nothing|none of|don'?t|do not|never|without|remove|removing|get rid of|lose|drop|ditch|nix|scrap|kill|none|shouldn'?t|should not|mustn'?t|turn off|turn (the|it|them) off|switch off|stop|unbold\w*|unround\w*|disable|(?:revert|undo|take back) (?:the|those|that|these|my|our|all)|(?:shadows?|borders?|underlines?|outlines?|gradients?|uppercase|caps) (?:off|out|gone))\b/.test(
        negText
          .replace(/\bdisabled\b/g, ' ')
          // "not round enough" asks for more; "not so much" for less.
          .replace(/\bnot (\w+ ){0,2}enough\b/g, ' ')
          .replace(/\bnot (so|as|that|too) (much|many)\b/g, ' '),
      ) && !/\bno (wait|longer)\b/.test(negText);
    // "too X" asks for less X: too sharp is rounder, too heavy is lighter.
    const tooLess =
      /\btoo (big|large|round|rounded|roundy|bubbly|shadowy|bold|heavy|thick|dark|spacious|airy|bright|loud|strong|harsh|much|wide|tall)\b/;
    const tooMore =
      /\btoo (small|cramped|tight|crowded|faded|light|thin|sharp|square|boxy|pointy|subtle|weak|narrow|dim|low|short)\b/;
    const dir = /\bnot (\w+ ){0,2}enough\b/.test(text)
      ? 'more'
      : /\bnot (so|as|that|too) (much|many)\b/.test(text) || tooLess.test(text)
        ? 'less'
        : tooMore.test(text)
          ? 'more'
          : /\b(less|fewer|smaller|lower|reduce|softer|lighter|lighten|thinner|narrower|shorter|tight(en|er)?|dense(r)?|denser|compact|sharper|squarer|subtler|tone down|dimmer|halve|half|halved)\b|\bcut\b.*\bin half\b|\bx ?0?\.\d+\b|\b(knock|turn|dial|bring|tone)\b.*\bdown\b/.test(
                text,
              )
            ? 'less'
            : /\b(more|bigger|larger|higher|increase|stronger|thicker|wider|taller|rounder|roomier|airy|spacious|bolder|heavier|darker|darken|loosen|open up|twice|double|a bit|a little|slightly|much)\b/.test(
                  text,
                )
              ? 'more'
              : null;
    /** @type {Record<string, string>} */
    const decl = {};
    for (const m of text.matchAll(
      /\b([a-z]+(?:-[a-z]+)*)\s*:\s*([^;,]+?)(?=\s+(?:on|for|in)\s+(?:the\s+)?[a-z]+\s*$|$)/g,
    ))
      if (
        /^(box-shadow|background(-color)?|color|border(-[a-z]+)*|padding|margin|gap|font-[a-z]+|letter-spacing|text-transform|opacity|width|height|min-height|max-width)$/.test(
          m[1],
        )
      )
        decl[m[1]] = m[2].trim();
    let state = null;
    for (const [re, s] of STATE_WORDS)
      if (re.test(text)) {
        state = s;
        break;
      }
    const mode =
      (/\bdark( mode| theme)?\b/.test(text) &&
        /\b(mode|theme|in dark)\b/.test(text)) ||
      /\bnight( mode| theme)\b/.test(text)
        ? 'dark'
        : /\blight (mode|theme)\b/.test(text)
          ? 'light'
          : null;
    const except =
      parts.length > 0 &&
      (/^except\b/.test(text) ||
        (neg &&
          aspects.length === 0 &&
          /\b(not|except)( for| on| in| the)* [a-z]/.test(negText)));
    return {
      text,
      parts,
      aspects,
      named: namedProperty(text),
      neg,
      dir,
      colors: colorsIn(text),
      bad: badHex(text),
      // A typed clamp() or calc() is a length, kept whole.
      lengths: [
        ...(text.match(/\b(?:clamp|calc|min|max)\([^)]*\)/g) ?? []),
        ...lengthsIn(text),
      ],
      state,
      mode,
      except,
      decl,
    };
  });
}

/**
 * A CSS property the clause names, with its value kept whole ("caret-color
 * #2563eb", "transition: background-color 150ms ease", "border-radius 12px
 * 12px 0 0"). The value runs to the end of the clause or the part it is
 * for, and is the longest start of it the property's grammar accepts.
 * Plain words that are also properties ("color", "padding") count only
 * with a colon; the aspect words read those.
 * @param {string} text
 * @returns {{prop: string, value: string, bad?: string} | null}
 */
function namedProperty(text) {
  const props = cssProperties();
  const flat = text.replace(/\u2e34/g, ',');
  for (const m of flat.matchAll(
    /\b(border colou?r|(?:min|max) (?:height|width)|line height|letter spacing|font (?:size|weight)|radius|[a-z]+(?:-[a-z]+)+|[a-z]+)(\s*:)?\s*/g,
  )) {
    const prop = PROPERTY_WORDS[m[1]] ?? m[1];
    if (!props.has(prop)) continue;
    // A plain word ("background", "padding") without a colon is a property
    // only before a value that is typed, not described.
    const plain = !m[2] && !m[1].includes('-');
    // Without a colon, only these plain words name a property; others
    // ("inset", "fill") are design words.
    if (!m[2] && !m[1].includes('-') && !PLAIN_PROPERTIES.has(prop)) continue;
    const rest = flat
      .slice((m.index ?? 0) + m[0].length)
      .replace(/^(?:to|of|is|=)\s+/, '')
      .replace(
        /\s+(?:on|for|in|when|while|if)\s+(?:the\s+|all\s+|every\s+)?[a-z][\w-]*.*$/,
        '',
      )
      .trim();
    const tokens = valueWords(rest);
    // "padding NaNpx": a length the property cannot take.
    if (
      tokens[0] &&
      /^(?:nan|[\d.]+[a-z]*)(px|rem|em)$/.test(tokens[0]) &&
      !matchValue(prop, tokens[0])
    )
      return {prop, value: '', bad: tokens[0]};
    if (
      plain &&
      (!/^(?:[-.\d#]|[a-z-]+\(|transparent\b|none\b|normal\b|currentcolor\b)/.test(
        rest,
      ) ||
        // "a #e5e7eb border" has no width: the border answer gives one.
        (prop === 'border' && /^#/.test(rest)))
    )
      continue;
    for (let n = tokens.length; n > 0; n--) {
      const value = tokens
        .slice(0, n)
        .join(' ')
        .replace(/[.;,]+$/, '');
      // A font size of 0 hides the text.
      if (prop === 'font-size' && /^0(px|rem|em)?$/.test(value))
        return {prop, value: '', bad: value};
      if (value && matchValue(prop, value)) return {prop, value};
    }
  }
  return null;
}

/** Plain words that name a property without a colon, before a typed value. */
const PLAIN_PROPERTIES = new Set([
  'background',
  'opacity',
  'border',
  'border-radius',
  'border-color',
  'padding',
  'margin',
  'gap',
  'filter',
  'width',
  'height',
  'min-height',
  'max-height',
  'min-width',
  'max-width',
  'line-height',
  'letter-spacing',
  'font-size',
  'font-weight',
  'outline',
  'transition',
  'transform',
]);

/** Words people write for a CSS property. */
const PROPERTY_WORDS = /** @type {Record<string, string>} */ ({
  radius: 'border-radius',
  'min height': 'min-height',
  'max height': 'max-height',
  'min width': 'min-width',
  'max width': 'max-width',
  'line height': 'line-height',
  'letter spacing': 'letter-spacing',
  'font size': 'font-size',
  'font weight': 'font-weight',
  'border color': 'border-color',
  'border colour': 'border-color',
});

/**
 * The words of a value, with each function call kept whole, nested calls
 * included ("linear-gradient(135deg, rgba(0,0,0,.1) 0%, #fff 100%)").
 * @param {string} rest
 * @returns {string[]}
 */
function valueWords(rest) {
  /** @type {string[]} */
  const out = [];
  let word = '';
  let depth = 0;
  for (const ch of rest) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && !depth) {
      if (word) out.push(word);
      word = '';
    } else word += ch;
  }
  if (word) out.push(word);
  return out;
}

/**
 * Text with every CSS function call taken out, nested calls included.
 * @param {string} text
 */
function withoutFunctions(text) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' && (depth || /[\w-]$/.test(out))) {
      if (!depth) out = out.replace(/[\w-]+$/, '');
      depth++;
    } else if (ch === ')' && depth) depth--;
    else if (!depth) out += ch;
  }
  return out;
}

/** The settings each aspect names, for a reset; `*` matches a prefix. */
const RESET_THINGS = /** @type {Record<string, string[]>} */ ({
  corners: ['corners', 'border-radius', '--radius-*'],
  spacing: ['spacing', 'padding', 'gap', 'margin', '--spacing-*'],
  family: ['font', 'font-family', '--font-family-*'],
  background: ['background', 'background-color'],
  text: ['color', '--color-text-*'],
  shadow: ['box-shadow', 'surfaces', '--shadow-*'],
  border: [
    'border',
    'border-width',
    'border-color',
    '--border-width',
    '--color-border',
  ],
  weight: ['headings', 'font-weight', '--text-body-weight'],
  fontsize: ['text-size', 'type', 'font-size'],
  leading: ['line-height', '--text-body-leading'],
  tracking: ['letter-spacing'],
});

/** Words for a color the theme generates: the word, its dial, its token. */
const ROLE_DIALS = /** @type {Array<[RegExp, string, string]>} */ ([
  [/\b(accent|brand|primary colou?r)\b/, 'accent', '--color-accent'],
  [/\b(danger|errors?)\b/, 'danger', '--color-error'],
  [/\bsuccess\b/, 'success', '--color-success'],
  [/\bwarnings?\b/, 'warning', '--color-warning'],
  [/\binfo\b/, 'info', '--color-info'],
  [/\b(neutrals?|grays?|greys?)\b/, 'neutral', '--color-neutral'],
]);

/**
 * Whether a few words name a color or a font, for "swap A for B".
 * @param {string} words lower-case
 * @returns {'color' | 'font' | undefined}
 */
function valueKind(words) {
  const w = words.trim();
  if (parseColor(w) || Object.hasOwn(HUES, w)) return 'color';
  const slug = w.replace(/\s+/g, '-');
  if (
    Object.hasOwn(OPEN_FONTS, slug) ||
    Object.hasOwn(FONTS, slug) ||
    Object.values(OPEN_FONTS).some(f => f.family.toLowerCase() === w) ||
    Object.values(FONTS).some(f => String(f[0]).toLowerCase() === w)
  )
    return 'font';
  return undefined;
}

/**
 * Answer a plain-words question with drafts of commands.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_how-commands.mjs').HowTheme} env
 * @param {string} question
 * @returns {{parts: string[], aspects: string[], drafts: Draft[]}}
 */
export function draftAnswer(ctx, env, question) {
  const {C} = ctx;
  const TARGET = ctx.project.target;
  const TOKENS = ctx.project.core.tokenDefaults;
  const lex = partLexicon(ctx);
  /** Family names written in quotes, kept as typed: qq<n>qq in the text. */
  const quoted = /** @type {string[]} */ ([]);
  let q = question
    .normalize('NFKC')
    // Markup and comment text are not part of the ask.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/\*\/[\s\S]*?\/\*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(
      /(?<=\bfont(?:[ -]family)?\s*:?\s*)'((?:[^'\\]|\\.){2,40})'|["\u201c]([^"\u201d\n]{2,40})["\u201d]/gi,
      (m, a, b, off, all) => {
        const name = String(a ?? b)
          .replace(/\\(.)/g, '$1')
          .trim();
        // Only a font name after a font word ("font 'O\'Reilly Sans'",
        // headings use "Playfair Display") is kept as typed; other quoted
        // text is read as words.
        const fontWord =
          a != null ||
          /\b(font(?:[ -]family)?|typeface|family|uses?)\s*:?\s*$/i.test(
            String(all).slice(Math.max(0, off - 30), off),
          ) ||
          /^\s*(font|typeface)\b/i.test(String(all).slice(off + m.length));
        if (!fontWord || !/^[A-Za-z][A-Za-z0-9 '.-]{1,38}$/.test(name))
          return m;
        quoted.push(name);
        return ` qq${quoted.length - 1}qq `;
      },
    )
    // Each line of a list is its own ask: a "no" on one line never reaches
    // the next.
    .replace(/^[ \t]*(?:[-*\u2022\u25e6]|\d+[.)])[ \t]+/gm, '')
    .replace(/\s*[\r\n]+\s*/g, ' ; ')
    // "1) square corners 2) no shadows": a marker is a break, never a
    // value. "N)" is a marker anywhere; "N." only at the start or after a
    // break, so "radius 8. Shadows off." keeps its 8.
    .replace(/(^|\s)\d{1,2}\)(?=\s)/g, ' ; ')
    .replace(/(^|;)\s*\d{1,2}\.(?=\s)/g, ' ; ')
    // "primary=#7c3aed radius=10": each key=value pair is its own ask.
    .replace(/\s+(?=[a-z][\w-]*\s*=\s*\S)/gi, ' ; ')
    .replace(/\p{Cc}/gu, ' ')
    // Code-shaped asks: camelCase keys, JSON and CSS punctuation, dotted
    // paths ("primaryColor=#3b82f6", {"accent": ...}, theme.colors.primary).
    // Font names keep their words: "JetBrains" is one word, and the "Sans"
    // of "IBM Plex Sans" is not the French "without".
    .replace(/\bJetBrains\b/g, 'Jetbrains')
    .replace(/(?<=\b[A-Z][\w-]*\s)Sans\b/g, 'Sanz')
    .replace(/\bNaN/g, 'nan')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[{}"`]/g, ' ')
    .replace(/(?<=[a-z])\.(?=[a-z])/gi, ' ')
    .replace(/(?<![\w-])\.(?=[a-z])/gi, ' ')
    .replace(/\s*=\s*/g, ' ')
    .replace(/\bon\s*:\s*/g, 'on ')
    // Near-white and near-black are their own colors.
    .replace(/\boff[- ]?white\b/gi, '#fafafa')
    .replace(/\boff[- ]?black\b/gi, '#111111')
    // "match the header color to the sidebar": the first part is the one to
    // change.
    .replace(
      /\bmatch\s+(?:the\s+)?(.+?)\s+to\s+(?:the\s+)?[a-z][a-z -]*?(?=\s*[(,;.]|\s*$)/gi,
      '$1',
    )
    // "0.5 rem", "14 px": a number and its unit are one length.
    .replace(/\b(\d+(?:\.\d+)?)\s+(px|rem|em|pt|vh|vw|ch)\b/gi, '$1$2')
    // "button padding 8", "radius 10": a bare number there is pixels.
    .replace(
      /\b(padding|radius|corners|gap|margin)(\s*:?\s*)(\d+(?:\.\d+)?)(?![\d.%\w])/gi,
      '$1$2$3px',
    )
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    // CSS property names read as their words.
    .replace(
      /\b(letter|line|font)-(spacing|height|size|weight|family)\b/g,
      '$1 $2',
    )
    // "12 pixels", "8 px" are lengths.
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:pixels?|px)\b/g, '$1px')
    // A drop shadow is a shadow, not a "drop".
    .replace(/\bdrop[- ]shadows?\b(?!\s*\()/g, 'shadow')
    // "x 0, y 4, blur 6, spread -1, rgba(...)": one shadow value.
    .replace(
      /\bx\s*:?\s*(-?\d+)(?:px)?\s*,?\s*y\s*:?\s*(-?\d+)(?:px)?(?:\s*,?\s*blur\s*:?\s*(-?\d+)(?:px)?)?(?:\s*,?\s*spread\s*:?\s*(-?\d+)(?:px)?)?\s*,?\s*(#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([^)]*\))/g,
      (_, x, y, b, sp, col) =>
        [x, y, b, sp]
          .filter(v => v != null)
          .map(v => (v === '0' ? '0' : `${v}px`))
          .join(' ') + ` ${col}`,
    )
    // A shadow's layers stay one value: the comma between them is not a
    // clause break.
    .replace(
      /(\)|#[0-9a-f]{3,8}\b)\s*,\s*(?=(?:inset\s+)?-?\d+(?:px)?\s+-?\d)/g,
      '$1\u2e34 ',
    )
    // "font-family: Georgia, serif": the font list is one value.
    .replace(
      /(\bfont[- ]family\s*:?\s*[^,;]+?)\s*,\s*(?=(?:serif|sans-serif|monospace|system-ui|cursive|ui-monospace|ui-sans-serif|ui-serif)\b)/g,
      '$1\u2e34 ',
    )
    // "rounder? or maybe not. actually yes": the ask stands.
    .replace(
      /[?.!]?\s*\b(?:or )?maybe not\b[.?!,]*\s*(?:actually|ok(?:ay)?|no wait)?,?\s*(?:yes|do it)\b[.!]*/g,
      '. ',
    )
    // "the gray text fails contrast": gray text is the secondary text,
    // when no color is typed for it.
    .replace(
      /\b(gr[ae]y|muted) text\b(?![^;,]*(#[0-9a-f]{3}|\brgb|\bhsl))/g,
      'secondary text',
    )
    // "replace the shadow on cards with a border": no shadow, and a border.
    .replace(
      /\b(?:replace|swap)\s+(?:out\s+)?(?:the\s+)?((?:shadows?|borders?|gradients?|underlines?|outlines?)\b[^,;]*?)\s+(?:with|for)\s+/g,
      'no $1 ; ',
    )
    // "swap Inter for Manrope", "replace red with #e11d48": B is the ask,
    // but only when A and B are the same kind of value. "Replace the shadow
    // with a border" keeps both words.
    .replace(
      /\b(?:swap|replace|switch)\s+(?:out\s+)?(?:the\s+)?([^,;]+?)\s+(?:for|with)\s+(?=(#[0-9a-f]{3,8}\b|[a-z][\w-]*(?:\s+[a-z][\w-]*)?))/g,
      (m, a, b) => {
        const kind = valueKind(a) ?? null;
        const bKind = valueKind(b) ?? valueKind(b.split(/\s+/)[0]);
        return kind && kind === bKind ? 'use ' : m;
      },
    )
    // "bg #fff text #000": a new color after a color starts a new ask.
    .replace(
      /(#[0-9a-f]{3,8}|\))\s+(?!(?:to|into|and|or|vs|than|then)\b)(?=[a-z][\w-]*\s*:?\s*(?:#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch)\())/g,
      '$1 ; ',
    )
    // "#0d6efd primary": the color belongs to the word after it, when that
    // word has no color of its own.
    .replace(
      /(#[0-9a-f]{3,8}|(?:rgba?|hsla?|oklch)\([^)]*\))\s+(primary|secondary|accent|brand|danger|error|success|warning|info|neutral|bg|background|text|border|links?)\b(?!\s*:?\s*(?:#|rgba?\(|hsla?\(|oklch\())/g,
      '$2 $1',
    );
  for (const [re, w] of TRANSLATE) q = q.replace(re, w);
  q = q
    // "bordes redondeados": rounded edges are corners.
    .replace(/\bborders?\s+rounded\b/g, 'rounded corners')
    .replace(/\bbutton-s\b/g, 'buttons')
    .replace(/[a-z]+/g, w => corrected(w, lex.vocab))
    .replace(/\b(everything|everywhere|all) but\b/g, '$1 except')
    .replace(
      /\b(apart from|other than|excluding|but not (on|in|for)|but not)\b/g,
      'except',
    )
    .replace(/\s+/g, ' ')
    .trim();
  const clauses = clausesOf(q, lex.parts);
  for (const c of clauses) {
    c.quoted = [...c.text.matchAll(/qq(\d+)qq/g)].map(
      m => quoted[Number(m[1])],
    );
    c.text = c.text
      .replace(/\s*qq\d+qq\s*/g, ' font ')
      .replace(/\s+/g, ' ')
      .trim();
    if (c.quoted.length && !c.aspects.includes('family'))
      c.aspects.push('family');
  }
  // The generic family after a quoted one is its fallback, not a second ask.
  for (let i = 1; i < clauses.length; i++)
    if (
      clauses[i - 1].quoted?.length &&
      /^(monospace|mono|sans ?-?serif|serif|system-ui|cursive)$/.test(
        clauses[i].text,
      )
    ) {
      clauses[i].text = '';
      clauses[i].aspects = [];
    }
  for (const c of clauses)
    if (!c.aspects.includes('shadow') && shadowIn(c.text))
      c.aspects.push('shadow');
  // "color #000" after a clause about borders is the border's color.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    const word = c.text
      .replace(/#[0-9a-f]+|\b(?:rgba?|hsla?|oklch)\([^)]*\)/g, '')
      .trim();
    if (
      c.colors.length &&
      /^colou?rs?:?$/.test(word) &&
      clauses[i - 1].aspects.length
    ) {
      c.aspects = [...clauses[i - 1].aspects.filter(a => a !== 'size')];
      c.parts = clauses[i - 1].parts.map(p => ({...p}));
    }
  }
  // "success badge", "error toasts": a value of the part's variant, type
  // or status right before the part.
  for (const c of clauses)
    for (const p of c.parts) {
      const member = FAMILIES[p.on] ? FAMILIES[p.on][0] : p.on;
      if (p.when || !C.MAP[member]) continue;
      const vals = C.variantValues(member);
      const nouns = lex.parts.filter(([, x]) => x.on === p.on && !x.when);
      for (const m of c.text.matchAll(/\b([a-z]+)\s+([a-z]+)\b/g)) {
        const key = ['variant', 'type', 'status', 'tone', 'color'].find(k =>
          (vals[k] ?? []).includes(m[1]),
        );
        if (key && nouns.some(([re]) => re.test(` ${m[2]} `))) {
          p.when = `${key}:${m[1]}`;
          break;
        }
      }
    }
  // "no shadows on cards and dialogs": a clause that only names a part
  // takes the ask of the clause before it.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    const prev = clauses[i - 1];
    if (
      c.parts.length &&
      !c.aspects.length &&
      !c.colors.length &&
      !c.lengths.length &&
      !c.except &&
      prev.aspects.length &&
      prev.parts.length &&
      !lex.parts
        .reduce((t, [re]) => t.replace(re, ' '), ` ${c.text} `)
        .replace(/\b(the|a|an|all|every|on|for|too|both)\b/g, ' ')
        .trim()
    ) {
      c.aspects = [...prev.aspects];
      c.neg = prev.neg;
      c.dir ??= prev.dir;
      c.text = `${prev.text.replace(/\bon\b.*$/, '')} ${c.text}`;
    }
  }
  // "the cards and the dialogs both need 16px radius": a clause that only
  // names a part, before one that says what to change, takes that ask.
  for (let i = 0; i < clauses.length - 1; i++) {
    const c = clauses[i];
    const next = clauses[i + 1];
    if (
      c.parts.length &&
      !c.aspects.length &&
      !c.colors.length &&
      !c.lengths.length &&
      !c.except &&
      next.aspects.length &&
      next.parts.length &&
      !lex.parts
        .reduce((t, [re]) => t.replace(re, ' '), ` ${c.text} `)
        .replace(/\b(the|a|an|all|every|on|for|both)\b/g, ' ')
        .trim()
    ) {
      const parts = c.parts;
      Object.assign(c, {...next, parts, text: next.text});
    }
  }
  // "BORDER-RADIUS: 8PX; ON: CARD": a clause that is only "on <part>" names
  // the part of the clause before it.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    if (
      c.parts.length &&
      !c.aspects.length &&
      /^on\b/.test(c.text) &&
      !clauses[i - 1].parts.length
    ) {
      clauses[i - 1].parts = c.parts;
      c.parts = [];
      c.text = '';
    }
  }
  // "buttons feel heavy, lighten them up", "the hierarchy is flat, headings
  // need more weight": a clause that only describes the problem, before
  // one that says what to do, asks for nothing itself; the fix takes its
  // part and aspect when it names none.
  for (let i = 0; i < clauses.length - 1; i++) {
    const c = clauses[i];
    const next = clauses[i + 1];
    const describes =
      /\b(is|are|feels?|looks|seems?|fails?)\b/.test(c.text) &&
      /\b(too|so|very|really|kind of|feels?|seems?|fails?|cramped|flat|heavy|crowded|cluttered|busy|boring|bland|dull|harsh|loud|weak|hard|ugly|off)\b/.test(
        c.text,
      ) &&
      !/\d/.test(c.text) &&
      !/^(make|set|use|give|add|remove|change|put)\b/.test(c.text) &&
      !/#[0-9a-f]{3,8}\b|\(/.test(c.text) &&
      !c.lengths.length;
    if (!describes || !(next.aspects.length || next.dir) || next.colors.length)
      continue;
    if (!next.aspects.length)
      next.aspects = c.aspects.filter(
        a => a !== 'shadow' || !/\bflat\b/.test(c.text),
      );
    if (!next.parts.length) next.parts = c.parts.map(p => ({...p}));
    next.text =
      `${next.text} ${c.text.replace(/\b(is|are|feels?|looks?|seems?)\b.*$/, '')}`.trim();
    if (/\bcontrast\b/.test(c.text)) next.text += ' contrast';
    c.text = '';
    c.parts = [];
    c.aspects = [];
    c.colors = [];
  }
  // "Arial everywhere", "code blocks should use Menlo": a family named with
  // its capitals is a font ask; so is the system font by name.
  for (const c of clauses)
    if (
      !c.aspects.includes('family') &&
      (systemFamilyIn(c.text, question) || OS_FONT.test(c.text))
    )
      c.aspects.push('family');
  // "the table ... a header" is the table's header row.
  if (/\b(tables?|rows?|zebra)\b/.test(q))
    for (const c of clauses)
      for (const p of c.parts)
        if (p.on === 'app-shell-header') p.on = 'table-header-cell';
  // A clause that is only a color ("brand blue, #0057ff") belongs to the
  // clause before it; a clause with any other word ("accent #fff") does not.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    const rest = c.text
      .replace(/#[0-9a-f]+|\b(?:rgba?|hsla?|oklch)\([^)]*\)/g, '')
      .replace(/\b(the|a|an|it|its|is|like|please|pls|thanks|ok)\b/g, '')
      .trim();
    if (c.colors.length && !rest && !c.parts.length && !c.aspects.length) {
      clauses[i - 1].colors = [...c.colors, ...clauses[i - 1].colors];
      c.colors = [];
      c.text = '';
    }
  }
  // A clause that names a color the theme generates with no color ("LGTM
  // except the accent") gives that role to the next clause with only a
  // color ("make it #6d28d9"); so does "the purple" for the brand color.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    const prev = clauses[i - 1];
    if (
      c.colors.length &&
      !c.parts.length &&
      !c.aspects.length &&
      !ROLE_WORDS.test(c.text) &&
      // The color before is one the question moves away from ("I hate the
      // purple"), or one for the other mode ("in light mode … in dark mode").
      (!prev.colors.length ||
        prev.neg ||
        /\b(hate|dislike|not a fan|tired of|sick of|too)\b/.test(prev.text) ||
        Boolean(c.mode && prev.mode && c.mode !== prev.mode)) &&
      !prev.parts.length
    ) {
      const role =
        ROLE_WORDS.exec(prev.text)?.[0] ??
        (new RegExp(`\\bthe (${Object.keys(HUES).join('|')})\\b`).test(
          prev.text,
        )
          ? 'accent'
          : null);
      if (role) {
        c.text = `${role} ${c.text}`;
        // "the danger red is too bright, use #b91c1c": the typed color is
        // the target, so the clause before it asks for nothing of its own.
        if (
          !/#[0-9a-f]{3,8}\b/.test(prev.text) &&
          prev.dir &&
          !prev.parts.length
        ) {
          prev.text = '';
          prev.colors = [];
          prev.aspects = [];
        }
      }
    }
  }
  // "nav items" in a question about the sidebar are the side nav's; an
  // underline on tabs is the tab indicator.
  const side = /\b(side ?nav|sidebar|side ?panel)\b/.test(q);
  for (const c of clauses)
    for (const p of c.parts) {
      if (side && p.on === 'top-nav-item') p.on = 'side-nav-item';
      if (p.on === 'tab' && /\bunderline/.test(c.text)) p.on = 'tab-indicator';
    }
  // A clause with no part takes the part of the clause before it ("a dark
  // card with white text"); one with values but no aspect takes the aspect
  // of a neighbor ("cards: 8px radius; buttons: 4px").
  const fillAspect = () => {
    for (const c of clauses)
      if (
        c.parts.length &&
        !c.aspects.length &&
        !c.except &&
        (c.colors.length ||
          THEME_COLOR_WORDS.some(([re]) => re.test(c.text)) ||
          /\b(darker|lighter|brighter|colou?r(ed)?)\b/.test(c.text) ||
          (!c.neg && toneIn(c.text)))
      )
        c.aspects.push('background');
  };
  fillAspect();
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    const prev = clauses[i - 1];
    const next = clauses[i + 1];
    const before = clauses
      .slice(0, i)
      .reverse()
      .find(x => x.parts.length && !x.except);
    if (
      !c.parts.length &&
      before &&
      !c.except &&
      // "per the brand guide" names no part; "accent text" does.
      !(ROLE_WORDS.test(c.text) && !c.aspects.length) &&
      // "Circular font" after "12px cards" is the theme's font.
      !(c.aspects.length && c.aspects.every(a => a === 'family')) &&
      // "serif headings, no shadows": a type part does not take a shadow,
      // corner or border ask.
      !(
        before.parts.every(p => ['heading', 'body', 'code'].includes(p.on)) &&
        c.aspects.length &&
        c.aspects.every(a =>
          ['shadow', 'corners', 'border', 'spacing'].includes(a),
        )
      ) &&
      (c.aspects.length || c.colors.length || c.lengths.length)
    ) {
      c.parts = before.parts.map(p => ({...p}));
      c.state ??= before.state;
    }
    if (
      !c.aspects.length &&
      !ROLE_WORDS.test(c.text) &&
      (c.lengths.length || /\b(stay|keep)\b/.test(c.text))
    ) {
      const from = prev?.aspects.length
        ? prev
        : next?.aspects.length
          ? next
          : null;
      if (from) c.aspects = [...from.aspects];
    }
    // "in dark mode, cards are #1c1c1e": a clause that only names the mode
    // gives it to the clauses after it.
    if (
      !c.mode &&
      prev?.mode &&
      (!c.parts.length || (!prev.parts.length && !prev.aspects.length))
    )
      c.mode = prev.mode;
    // "on focus, inputs get a 2px outline": a clause that only names a state
    // gives it to the clause after it.
    if (
      !c.state &&
      prev?.state &&
      !prev.parts.length &&
      !prev.aspects.length &&
      c.parts.length
    )
      c.state = prev.state;
  }
  // "when hovering a card, lift it with a bigger shadow": a clause that only
  // names a part and a state, beside clauses that say what to change, asks
  // for nothing of its own.
  for (const c of clauses)
    if (
      c.parts.length &&
      c.state &&
      !c.aspects.length &&
      !c.colors.length &&
      !c.lengths.length &&
      clauses.some(o => o !== c && o.aspects.length)
    ) {
      c.parts = [];
      c.text = '';
    }
  // The tab's text is on the tab, not on its underline.
  for (const c of clauses)
    for (const p of c.parts)
      if (
        p.on === 'tab-indicator' &&
        c.aspects.includes('text') &&
        !/\bunderline|indicator\b/.test(c.text)
      )
        p.on = 'tab';
  fillAspect();
  const modal = env.data.mode === 'both';
  const modeOf = (/** @type {Clause} */ c) =>
    c.mode && modal ? {mode: c.mode} : {};
  /** @type {Draft[]} */
  const drafts = [];
  /** @type {string[]} */
  const partsSeen = [];
  /** @type {string[]} */
  const aspectsSeen = [];
  const seenPart = (/** @type {string} */ p) => {
    if (!partsSeen.includes(p)) partsSeen.push(p);
  };
  const seenAspect = (/** @type {string} */ a) => {
    if (!aspectsSeen.includes(a)) aspectsSeen.push(a);
  };
  /** @param {string} token @param {'light' | 'dark'} [mode] */
  const current = (token, mode = 'light') =>
    env.base[mode]?.[token] ?? String(TOKENS[token] ?? '');
  /** The member a group's checks read. @param {string} on */
  const one = on => (FAMILIES[on] ? FAMILIES[on][0] : on);
  /**
   * Steps for a color how works out from the one a token has now. On a
   * theme with both modes there is one step per mode, each from that mode's
   * own value, so a change made for light never lands on dark; with the
   * clause's mode, only that one. A mode whose value would not change gets
   * no step.
   * @param {string} token the token whose value the new color starts from
   * @param {string} thing what the step sets (the token, or a property)
   * @param {Record<string, string | undefined>} flags
   * @param {(now: string, mode: 'light' | 'dark') => string | null} fn
   * @param {Clause} c
   * @returns {Step[]}
   */
  const perMode = (token, thing, flags, fn, c) => {
    const modes = /** @type {Array<'light' | 'dark'>} */ (
      c.mode && modal
        ? [c.mode]
        : modal
          ? ['light', 'dark']
          : [env.data.mode === 'dark-only' ? 'dark' : 'light']
    );
    /** @type {Step[]} */
    const out = [];
    for (const m of modes) {
      const now = current(token, m);
      const v = fn(now, m);
      if (v && v.toLowerCase() !== now.toLowerCase())
        out.push(set(thing, v, {...flags, ...(modal ? {mode: m} : {})}));
    }
    return out;
  };
  /** How the mode of a set of per-mode steps reads in a sentence. @param {Step[]} steps */
  const modesSaid = steps =>
    modal && steps.length
      ? steps.length > 1
        ? ', each mode from its own value'
        : ` in ${steps[0].mode} mode only (the other mode keeps its value)`
      : '';
  /**
   * The state a part takes for a state word, as `set` names it.
   * @param {string} on @param {string} word
   */
  const stateFor = (on, word) => {
    const t = TARGET.get(one(on));
    const states = [...(t?.states ?? []), ...COMMON_STATES];
    if (word === 'focus')
      return focusStateOf(/** @type {any} */ ({C}), one(on)) ?? 'focus-visible';
    if (word === 'invalid') return null;
    return states.includes(word) ? word : null;
  };
  /** @param {Clause} c @param {{on: string, when?: string, level?: string}} p */
  const flagsFor = (c, p) => {
    /** @type {{on?: string, when?: string, state?: string, noState?: string}} */
    const f = {on: p.on};
    if (p.when) f.when = p.when;
    if (p.level) f.when = `level:${p.level}`;
    const vals = C.variantValues(one(p.on));
    if (!f.when && vals.size) {
      const size = /\b(small|sm)\b/.test(c.text)
        ? ['sm', 'small']
        : /\b(large|lg)\b/.test(c.text)
          ? ['lg', 'large']
          : [];
      const hit = size.find(s => vals.size.includes(s));
      if (hit) f.when = `size:${hit}`;
    }
    if (
      c.state === 'invalid' &&
      (vals.status ?? []).includes('error') &&
      !f.when
    )
      f.when = 'status:error';
    else if (c.state) {
      const st = stateFor(p.on, c.state);
      if (st) f.state = st;
      else f.noState = c.state;
    }
    return f;
  };
  /** A setting the theme already has for the thing on the part. @param {string[]} things @param {string | undefined} on */
  const existing = (things, on) =>
    env.data.settings.filter(
      s => things.includes(s.thing) && (s.on ?? '') === (on ?? ''),
    );
  /**
   * Carry the clause's color mode into every step that takes --mode, and
   * say so when a step cannot: only colors and shadows differ by mode.
   * @param {Draft} d @param {Clause | null} c
   * @returns {Draft}
   */
  const withMode = (d, c) => {
    if (!c?.mode || !d.options.length) return d;
    if (d.options.every(o => o.every(st => st.thing === 'mode'))) return d;
    if (env.data.mode !== 'both') {
      const only = env.data.mode === 'light-only' ? 'light' : 'dark';
      if (only === c.mode) return d;
      return {
        text: `${env.slug} has only a ${only} mode, so it has no ${c.mode} mode to change; set mode both to give it one`,
        options: [],
        lookup: `${HOW} mode`,
      };
    }
    /** @param {Step} st */
    const modal = st => {
      if (st.mode) return true;
      if (st.verb !== 'set') return false;
      if (st.thing.startsWith('--')) return C.typeOf(st.thing) === 'color';
      if (st.thing === 'background')
        return (
          parseColor(st.value ?? '') != null || /^var\(/.test(st.value ?? '')
        );
      return COLOR_PROPS.test(st.thing);
    };
    const options = d.options
      .filter(o => o.every(modal))
      .map(o =>
        o.map(st => (st.mode ? st : {...st, mode: c.mode ?? undefined})),
      );
    if (options.length) return {...d, options};
    return {
      text: `${d.text}: this is the same in light and dark; set takes --mode only for colors, so it cannot be ${c.mode} mode only`,
      options: [],
    };
  };
  /** @type {Clause | null} */
  let clauseNow = null;
  /** @param {Draft} input */
  const push = input => {
    const d = withMode(input, clauseNow);
    // A step given twice in one option runs once.
    const options = d.options
      .map(o =>
        o.filter(
          (st, i) =>
            o.findIndex(x => JSON.stringify(x) === JSON.stringify(st)) === i,
        ),
      )
      .filter(o => o.length);
    // The caller reads what was kept.
    input.text = d.text;
    input.options = options;
    drafts.push({
      text: d.text,
      options,
      ...(d.sequence && options.length ? {sequence: true} : {}),
      ...(d.lookup ? {lookup: d.lookup} : {}),
    });
  };
  const set = (
    /** @type {string} */ thing,
    /** @type {string} */ value,
    /** @type {Record<string, string | undefined>} */ flags = {},
  ) =>
    /** @type {Step} */ ({
      verb: 'set',
      thing,
      value,
      ...Object.fromEntries(Object.entries(flags).filter(([, v]) => v)),
    });
  /** A color for the clause, for a fill or a text color. @param {Clause} c @param {'fill' | 'text'} kind */
  const colorFor = (c, kind) => {
    for (const [re, fill, text] of THEME_COLOR_WORDS)
      if (re.test(c.text)) return kind === 'fill' ? fill : text;
    // "fails contrast on white": the color after "on" is what the text sits
    // on, never the text's own color.
    if (kind === 'text') {
      const own = colorsIn(
        c.text.replace(
          /\b(on|against|over)\s+(a\s+|the\s+)?((light|dark|pale)\s+)?(#[0-9a-f]+|[a-z]+)(\s+(background|bg|page|surface|cards?))?/g,
          ' ',
        ),
      );
      if (c.colors.length && !own.length) return null;
      if (own.length) return own[0];
    }
    if (kind === 'text' && !c.colors.length) {
      if (/\bdark (text|labels?|writing|words)\b/.test(c.text))
        return '#111827';
      if (/\blight (text|labels?|writing|words)\b/.test(c.text))
        return '#f9fafb';
    }
    return c.colors[0] ?? null;
  };
  /** @type {Array<{clause: Clause, steps: Step[]}>} */
  const tops = [];
  const recordTop = (/** @type {Clause} */ c, /** @type {Step[]} */ steps) => {
    if (steps.length) tops.push({clause: c, steps});
  };

  for (const c of clauses) {
    clauseNow = c;
    // "reset the corners to default", "revert the font": take back what the
    // theme sets for it, as undo does.
    const back = resetAnswer(c);
    if (back) {
      push(back);
      recordTop(c, back.options[0] ?? []);
      continue;
    }
    if (c.except) {
      const prior = tops[tops.length - 1];
      if (!prior) continue;
      for (const p of c.parts) {
        seenPart(p.on);
        const keep = prior.steps
          .map(st => keepAsIs(st, p))
          .filter(x => x != null);
        if (!keep.length) {
          push({
            text: `${p.on} keeps what it has: a setting --on ${p.on} wins over a whole-theme one there, but this change has no setting for ${p.on} to keep`,
            options: [],
            lookup: `${HOW} ${p.on}`,
          });
          continue;
        }
        push({
          text: `${prior.clause.text}, except ${p.on}, which keeps what it has now`,
          options: [[...prior.steps, .../** @type {Step[]} */ (keep)]],
          sequence: true,
        });
        // The whole ask comes first, before the change alone.
        drafts.unshift(/** @type {Draft} */ (drafts.pop()));
        tops.pop();
      }
      continue;
    }
    // A color the theme generates, named by its role ("error background",
    // "slightly darker accent"), is that color, not a part's fill.
    if (
      !c.parts.length &&
      c.aspects.every(a => a === 'background' || a === 'text') &&
      ROLE_WORDS.test(c.text) &&
      !/\b(text|labels?)\b/.test(c.text)
    ) {
      const whole = wholeTheme({...c, aspects: []});
      if (whole) {
        seenAspect('colors');
        push(whole);
        recordTop(c, whole.options[0] ?? []);
        continue;
      }
    }
    for (const a of c.aspects) seenAspect(a);
    for (const p of c.parts) seenPart(p.on);
    if (c.named?.bad) {
      push({
        text:
          c.named.prop === 'font-size'
            ? 'a font size of 0 hides the text; give a size above 0'
            : `"${c.named.bad}" is not a value ${c.named.prop} takes; give a length such as 16px`,
        options: [],
      });
      continue;
    }
    // A CSS property named with its value is set as named, on each part.
    const named = c.named;
    if (
      named &&
      !named.bad &&
      c.parts.length &&
      c.parts.every(p => TARGET.has(one(p.on)) || FAMILIES[p.on])
    ) {
      const steps = c.parts.slice(0, 3).map(p => {
        const {noState: _n, ...f} = flagsFor(c, p);
        return {p, f, st: set(named.prop, named.value, {...f, ...modeOf(c)})};
      });
      // A property set cannot use on a part (a heading's color comes from
      // its prop) is answered the usual way, which says why.
      if (steps.every(({st}) => env.check([st]).ok)) {
        for (const {p, f, st} of steps) {
          seenPart(p.on);
          const d = {
            text: `${named.prop} on ${p.on}${f.state ? ` when ${f.state}` : ''}, as you wrote it`,
            options: [[st]],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
        }
        continue;
      }
      if (named.prop === 'color')
        c.aspects = [
          'text',
          ...c.aspects.filter(x => x !== 'background' && x !== 'text'),
        ];
    }
    // A hover effect with nothing more said: a slightly darker part.
    if (c.parts.length && !c.aspects.length && c.state === 'hover' && !c.neg)
      c.aspects.push('background');
    // A part with no aspect: what it reads.
    if (c.parts.length && !c.aspects.length) {
      for (const p of c.parts.slice(0, 2))
        if (TARGET.has(one(p.on)))
          drafts.push({
            text: `what ${p.on} reads`,
            options: [],
            lookup: `${HOW} ${p.on}`,
          });
      continue;
    }
    // "combobox rounder": a word a component's doc lists, as the subject of
    // a shape change with no part named, is a part how cannot name; it is
    // never a whole-theme change.
    const unknown = !c.parts.length && unknownPart(c.text);
    if (unknown) {
      push({
        text: `no part is called "${unknown.word}"${unknown.parts.length ? `; the closest parts: ${unknown.parts.join(', ')}` : ''}. Name one of them, or list the parts`,
        options: [],
        lookup: unknown.parts.length
          ? `${HOW} ${unknown.parts[0]}`
          : `${HOW} --list parts`,
      });
      continue;
    }
    const targets = c.parts.length ? c.parts : [null];
    for (const p of targets.slice(0, 3)) {
      for (const a of c.aspects.slice(0, 3)) {
        const d = answerFor(c, p, a);
        if (d && p && d.options.length) {
          d.text += readsNote(p.on, a);
          // A part with variants: without --when the change reaches all.
          const first = d.options[0]?.[0];
          const variant = Object.entries(C.variantValues(one(p.on))).find(
            ([k, vals]) =>
              ['status', 'variant', 'tone', 'type'].includes(k) &&
              vals.length > 1,
          );
          if (
            first?.on &&
            !first.when &&
            variant &&
            ['text', 'background', 'border'].includes(a)
          ) {
            const [vp, vals] = variant;
            d.text += `; ${p.on} has ${vp} ${vals.join('|')}, and without --when the change reaches every ${vp}; for one, add --when ${vp}:${vals[0]}`;
            d.options.push([{...first, when: `${vp}:${vals[0]}`}]);
          }
        }
        if (d) {
          push(d);
          recordTop(c, d.options[0] ?? []);
        }
      }
      if (!c.aspects.length && !p) {
        const whole = wholeTheme(c);
        if (whole) {
          push(whole);
          recordTop(c, whole.options[0] ?? []);
        }
      }
    }
  }

  /**
   * The undo steps for a clause that asks to go back to the base value of a
   * setting the theme has ("reset the corners", "the accent back to what it
   * was", "clear the card background override"), or null when it does not
   * ask that.
   * @param {Clause} c
   * @returns {Draft | null}
   */
  function resetAnswer(c) {
    if (
      !/\b(reset|revert|restore|back to|default|original|what it was|standard|clear|no custom|remove the override)\b/.test(
        c.text,
      ) ||
      /\bby default\b|\bthe last change\b|\beverything\b/.test(c.text) ||
      c.colors.length > 0 ||
      OS_FONT.test(c.text)
    )
      return null;
    const role = ROLE_DIALS.find(([re]) => re.test(c.text));
    const things = [
      ...c.aspects.flatMap(a => RESET_THINGS[a] ?? []),
      ...(role ? [role[1], role[2]] : []),
    ];
    if (!things.length) return null;
    const on = c.parts[0]?.on;
    const matches = env.data.settings.filter(
      st =>
        (things.includes(st.thing) ||
          things.some(
            t => t.endsWith('*') && st.thing.startsWith(t.slice(0, -1)),
          )) &&
        (st.on ?? '') === (on ?? ''),
    );
    const what = role ? role[1] : c.aspects[0];
    if (!matches.length)
      return {
        text: `${env.slug} sets nothing for ${what}${on ? ` on ${on}` : ''}, so it already uses the base value`,
        options: [],
      };
    return {
      text: `take back what ${env.slug} sets for ${what}${on ? ` on ${on}` : ''}: undo restores the base value`,
      options: [
        matches.map(
          st =>
            /** @type {Step} */ ({
              verb: 'undo',
              thing: st.thing,
              ...(st.on ? {on: st.on} : {}),
              ...(st.when ? {when: st.when} : {}),
              ...(st.state ? {state: st.state} : {}),
              ...(st.mode ? {mode: st.mode} : {}),
            }),
        ),
      ],
      sequence: matches.length > 1,
    };
  }

  /**
   * The step that keeps one part as it is now when a step changes the whole
   * theme (or a group the part is in), or null when none can.
   * @param {Step} st
   * @param {{on: string, when?: string}} p
   * @returns {Step | null}
   */
  function keepAsIs(st, p) {
    const flags = {on: p.on, ...(p.when ? {when: p.when} : {})};
    if (st.on && st.on !== p.on && !(FAMILIES[st.on] ?? []).includes(one(p.on)))
      return null;
    if (st.thing === 'corners') {
      const read = C.partReads(one(p.on), 'corners').find(r =>
        r.when.includes(''),
      );
      return set(
        'border-radius',
        read
          ? current(read.token) || `var(${read.token})`
          : current('--radius-element'),
        flags,
      );
    }
    if (st.thing === 'spacing') {
      const now =
        [...env.data.settings]
          .reverse()
          .find(x => x.thing === 'spacing' && (x.on ?? '') === (p.on ?? ''))
          ?.value ?? 'medium';
      return set('spacing', now, {on: p.on});
    }
    if (
      /^--shadow-/.test(st.thing) ||
      st.thing === 'box-shadow' ||
      st.thing === 'surfaces'
    )
      return set('box-shadow', 'none', flags);
    if (
      st.thing === 'headings' ||
      st.thing === '--text-body-weight' ||
      st.thing === 'font-weight'
    )
      return set(
        'font-weight',
        String(current('--text-body-weight') || '400'),
        flags,
      );
    const group = /** @type {Record<string, string>} */ ({
      background: 'background',
      'background-color': 'background',
      color: 'text',
      'border-color': 'border',
      border: 'border',
    })[st.thing];
    if (group) {
      const want = p.when?.replace(':', '=');
      const read =
        C.partReads(one(p.on), group).find(r =>
          want ? r.when.includes(want) : r.when.includes(''),
        ) ??
        C.partReads(one(p.on), group).find(r =>
          p.when
            ? r.when.includes(`--when ${p.when}`) ||
              r.when.some(w => w.includes(p.when?.replace(':', '=') ?? ''))
            : r.when.includes(''),
        );
      if (read)
        return set(
          st.thing === 'border' ? 'border-color' : st.thing,
          `var(${read.token})`,
          flags,
        );
    }
    return null;
  }

  /**
   * The commands for one part (or the whole theme) and one aspect.
   * @param {Clause} c
   * @param {{on: string, when?: string, role?: string, level?: string} | null} p
   * @param {string} a
   * @returns {Draft | null}
   */
  function answerFor(c, p, a) {
    if (c.bad)
      return {
        text: `"${c.bad}" is not a color: a hex color has 3, 4, 6 or 8 digits after the #. Give the color again.`,
        options: [],
      };
    const on = p?.on;
    const {noState, ...f} = p ? flagsFor(c, p) : {};
    if (noState && on) {
      const t = TARGET.get(one(on));
      return {
        text: `${on} has no ${noState} state that set can name (its states: ${[...(t?.states ?? []), ...COMMON_STATES].join(', ')}), so a change would reach every ${on}`,
        options: [],
        lookup: `${HOW} ${on}`,
      };
    }
    const where = on
      ? ` on ${on}${f.when ? ` (${f.when.replace(':', ' ')})` : ''}${f.state ? ` when ${f.state}` : ''}`
      : ' for the whole theme';
    const undo = (/** @type {string[]} */ things) =>
      existing(things, on).map(s => [
        /** @type {Step} */ ({
          verb: 'undo',
          thing: s.thing,
          ...(on ? {on} : {}),
          ...(s.when ? {when: s.when} : {}),
          ...(s.state ? {state: s.state} : {}),
          ...(s.mode ? {mode: s.mode} : {}),
        }),
      ]);
    if (on === 'focus-ring') {
      const ringColor = colorFor(c, 'fill');
      if (ringColor && c.lengths[0] && !c.neg)
        return {
          text: "the focus ring's width and color: --focus-outline-width and --focus-outline-color",
          options: [
            [
              set('--focus-outline-width', c.lengths[0]),
              set('--focus-outline-color', ringColor, modeOf(c)),
            ],
          ],
          sequence: true,
        };
      if (
        (a === 'border' && !ringColor) ||
        a === 'size' ||
        a === 'spacing' ||
        /\b(thick|thin|width)/.test(c.text)
      ) {
        const w =
          c.lengths[0] ??
          scaled(
            current('--focus-outline-width'),
            c.dir === 'less' ? 0.5 : 1.5,
          ) ??
          '3px';
        return {
          text: `the focus ring's width${where}: --focus-outline-width`,
          options: [[set('--focus-outline-width', w)]],
        };
      }
      const color = colorFor(c, 'fill');
      if (c.neg)
        return {
          text: 'the focus ring shows keyboard users where they are; it can be made subtle but not removed',
          options: [[set('--focus-outline-width', '1px')]],
        };
      return color
        ? {
            text: `the focus ring's color: --focus-outline-color`,
            options: [[set('--focus-outline-color', color, modeOf(c))]],
          }
        : null;
    }
    if (on === 'page') {
      const color = colorFor(c, 'fill');
      // "the page background lighter": the whole-theme answer, per mode.
      if (!color)
        return a === 'background' && c.dir ? answerFor(c, null, a) : null;
      return {
        text: `the page background: --color-background-body${c.mode && modal ? ` in ${c.mode} mode` : ''}`,
        options: [
          [set('--color-background-body', color, modeOf(c))],
          [set('background', color, {on: 'app-shell'})],
        ],
      };
    }
    if (on === 'icons') {
      const color = colorFor(c, 'fill');
      if (!color) return null;
      return {
        text: 'icon colors: --color-icon-primary for most icons, --color-icon-secondary for quieter ones',
        options: [
          [set('--color-icon-primary', color, modeOf(c))],
          [set('--color-icon-secondary', color, modeOf(c))],
        ],
      };
    }
    if (on === 'overlay') {
      const typed = colorFor(c, 'fill');
      const steps = typed
        ? [set('--color-overlay', typed, modeOf(c))]
        : c.dir || c.neg
          ? perMode(
              '--color-overlay',
              '--color-overlay',
              {},
              (now, m) => stronger(now, c.dir === 'more' ? 1.5 : 0.6, m),
              c,
            )
          : [];
      if (!steps.length) return null;
      return {
        text: `the dimmed layer behind dialogs and drawers: --color-overlay${typed ? '' : modesSaid(steps)}`,
        options: [steps],
        sequence: steps.length > 1,
      };
    }
    if (p?.role === 'body' && a === 'weight') {
      const v =
        weightIn(c) ??
        (c.neg
          ? '400'
          : /\b(light(er)?|thin(ner)?)\b/.test(c.text)
            ? '300'
            : c.dir === 'less'
              ? '400'
              : '700');
      return {
        text: `body text weight: --text-body-weight (now ${current('--text-body-weight')})`,
        options: [[set('--text-body-weight', v)]],
      };
    }
    if (p?.role && (a === 'family' || a === 'fontsize')) {
      if (a === 'family') {
        const font = fontIn(c, question);
        if (!font) return null;
        // set font --on body moves the heading font too in this release, so
        // the body alone takes its token.
        if (p.role === 'body' && env.bodyFontReachesHeadings) {
          const stack = FONTS[font]
            ? `${FONTS[font][0].includes(' ') ? `"${FONTS[font][0]}"` : FONTS[font][0]}, ${FONTS[font][1]}`
            : OPEN_FONTS[font]
              ? `"${OPEN_FONTS[font].family}", ${OPEN_FONTS[font].fallbacks}`
              : /[\s,]/.test(font) && !font.includes(',')
                ? `"${font}"`
                : font;
          return {
            text: 'the body font alone: --font-family-body (font --on body also changes the headings in this release)',
            options: [[set('--font-family-body', stack)]],
          };
        }
        return {
          text: `the ${p.role} font: font --on ${p.role}`,
          options: [[set('font', font, {on: p.role})]],
        };
      }
      if (p.role === 'body') {
        const px = /\b(\d+)px\b/.exec(c.text)?.[1];
        return {
          text: 'the body text size: text-size (every heading scales from it)',
          options: [
            [set('text-size', px ?? (c.dir === 'less' ? 'less' : 'more'))],
          ],
        };
      }
    }
    if (p?.role === 'body' && a !== 'leading')
      return wholeTheme({...c, parts: []}, a);
    switch (a) {
      case 'underline': {
        if (!on) return null;
        const value = c.neg ? 'none' : 'underline';
        return {
          text: `${c.neg ? 'no underline' : 'underlined'}${where}: text-decoration`,
          options: [[set('text-decoration', value, f)]],
        };
      }
      case 'leading': {
        const n =
          /\b(normal)\b/.exec(c.text)?.[1] ??
          /\b(\d(?:\.\d+)?)\b(?!\s*(px|rem|em|%))/.exec(c.text)?.[1];
        const tok =
          !on || on === 'body' || p?.role === 'body'
            ? '--text-body-leading'
            : null;
        const now = tok ? current(tok) : null;
        const value =
          n ??
          (now && /^\d*\.?\d+$/.test(now)
            ? String(
                Number(
                  (Number(now) * (c.dir === 'less' ? 0.9 : 1.1)).toFixed(2),
                ),
              )
            : c.dir === 'less'
              ? '1.3'
              : '1.6');
        if (tok)
          return {
            text: `body line height: --text-body-leading${now ? ` (now ${now})` : ''}`,
            options: [[set(tok, value)]],
          };
        return {
          text: `line height${where}`,
          options: [[set('line-height', value, f)]],
        };
      }
      case 'corners': {
        const tall = tallIn(c.text);
        const tied = radiusIn(c.text);
        const typedPx =
          (tied && /^-?\d*\.?\d+$/.test(tied) ? `${tied}px` : tied) ??
          c.lengths.find(l => l !== tall) ??
          null;
        // A radius of 0 is square.
        const px = typedPx && parseFloat(typedPx) === 0 ? null : typedPx;
        const zero = Boolean(typedPx) && !px;
        // "revert the rounded corners": take back what the theme sets.
        if (/\b(revert|undo|take back)\b/.test(c.text)) {
          const back = existing(['corners', 'border-radius'], on);
          if (back.length)
            return {
              text: `take back the corners this theme sets${where}`,
              options: back.map(x => [
                /** @type {Step} */ ({
                  verb: 'undo',
                  thing: x.thing,
                  ...(on ? {on} : {}),
                  ...(x.when ? {when: x.when} : {}),
                  ...(x.state ? {state: x.state} : {}),
                }),
              ]),
            };
        }
        if (px?.startsWith('-'))
          return {
            text: `a radius cannot be negative ("${px}"); give a size of 0 or more`,
            options: [],
          };
        // "too sharp" asks for rounder, not square.
        const shapeText = c.text.replace(/\btoo \w+/g, ' ');
        const shape =
          zero || c.neg || /\b(square(d)?|sharp)\b/.test(shapeText)
            ? 'square'
            : /\b(pill|circular(?! (font|typeface))|circles?|fully round)\b/.test(
                  shapeText,
                )
              ? 'pill'
              : null;
        const value =
          px ??
          shape ??
          (/\b(stay|keep)\b/.test(c.text)
            ? null
            : c.dir === 'less'
              ? 'less'
              : c.dir === 'more' || /\brounder\b/.test(c.text)
                ? 'more'
                : 'round');
        if (!value) return null;
        if (!on) {
          // The corners dial takes pixels: a rem or em size is converted at
          // 16px to the rem.
          const dial = /^\d*\.?\d+r?em$/.test(value)
            ? `${Math.round(parseFloat(value) * 16 * 100) / 100}px`
            : value;
          return {
            text: `corners${where}: the corners dial (sets the corner tokens together)${dial !== value ? `, ${value} as ${dial}` : ''}`,
            options: [[set('corners', dial)]],
          };
        }
        if (px)
          return {
            text: `corners${where}: border-radius ${px}`,
            options: [[set('border-radius', px, f)], [set('corners', px, f)]],
          };
        return {
          text: `corners${where}: corners ${value}`,
          options: [[set('corners', value, f)]],
        };
      }
      case 'shadow': {
        const typedShadow = c.decl['box-shadow'] ?? shadowIn(c.text);
        if (typedShadow && on && !c.neg)
          return {
            text: `the shadow you wrote${where}`,
            options: [[set('box-shadow', typedShadow, f)]],
          };
        if (typedShadow && !on && !c.neg)
          return {
            text: 'the shadow you wrote, as the shared medium shadow most panels use: --shadow-med',
            options: [[set('--shadow-med', typedShadow, modeOf(c))]],
          };
        // Another clause writes the shadow out: that one answers.
        if (!typedShadow && !on && !c.neg && shadowIn(q)) return null;
        // "too strong" asks for softer: the word after "too" is what to
        // move away from.
        const shadowText = c.text.replace(/\btoo \w+/g, ' ');
        const soft =
          c.dir === 'less' ||
          /\b(soft(er)?|subtle(r)?|light(er)?|gentle|less)\b/.test(shadowText);
        const strong =
          !soft &&
          /\b(strong(er)?|deep(er)?|heav(y|ier)|bigger|more)\b/.test(
            shadowText,
          );
        if (!on) {
          if (c.neg || /\bflat\b/.test(c.text))
            return {
              text: /\bflat\b/.test(c.text)
                ? 'flat panels: no border, no shadow, a tinted fill (the surfaces dial); or only the shadows off'
                : 'no shadows: set each shared shadow token to none',
              options: /\bflat\b/.test(c.text)
                ? [[set('surfaces', 'flat')]]
                : [
                    ['--shadow-low', '--shadow-med', '--shadow-high']
                      .filter(t => t in TOKENS)
                      .map(t => set(t, 'none')),
                  ],
              sequence: !/\bflat\b/.test(c.text),
            };
          if (/\b(raised|elevated|lifted)\b/.test(c.text))
            return {
              text: 'raised panels: a soft shadow, no border (the surfaces dial)',
              options: [[set('surfaces', 'raised')]],
            };
          const shades = soft
            ? [
                '0 1px 2px rgb(0 0 0 / 0.05)',
                '0 2px 6px rgb(0 0 0 / 0.07)',
                '0 6px 16px rgb(0 0 0 / 0.1)',
              ]
            : [
                '0 2px 4px rgb(0 0 0 / 0.12)',
                '0 6px 14px rgb(0 0 0 / 0.18)',
                '0 14px 32px rgb(0 0 0 / 0.26)',
              ];
          return {
            text: `${soft ? 'softer' : 'stronger'} shadows everywhere: the three shared shadow tokens, light to strong`,
            options: [
              ['--shadow-low', '--shadow-med', '--shadow-high']
                .filter(t => t in TOKENS)
                .map((t, i) => set(t, shades[i], modeOf(c))),
            ],
            sequence: true,
          };
        }
        // "flat cards": no shadow on them ("too flat" asks for one).
        if (c.neg || (/\bflat\b/.test(c.text) && !/\btoo flat\b/.test(c.text)))
          return {
            text: `no shadow${where}`,
            options: [...undo(['box-shadow']), [set('box-shadow', 'none', f)]],
          };
        const design = Object.keys(DESIGN).find(
          d =>
            ['bevel', 'raised', 'sunken'].includes(d) &&
            new RegExp(`\\b${d}`).test(c.text.replace(/\bbeveled\b/, 'bevel')),
        );
        const glow = /\bglow/.test(c.text);
        if (/\blift/.test(c.text) && !f.state && on) f.state = 'hover';
        const value = glow
          ? `0 0 12px 2px ${c.colors[0] ?? 'var(--color-accent)'}`
          : design
            ? DESIGN[design].replace(/^"|"$/g, '')
            : `var(${soft ? '--shadow-low' : strong || /\blift/.test(c.text) ? '--shadow-high' : '--shadow-med'})`;
        return {
          text: `${glow ? 'a glow' : 'shadow'}${where}: box-shadow`,
          options: [[set('box-shadow', value, f)]],
        };
      }
      case 'border': {
        if (on === 'tab-indicator') return answerFor(c, p, 'size');
        const outline =
          /\boutlines?\b/.test(c.text) && !/\bborders?\b/.test(c.text);
        if (!on) {
          const color = colorFor(c, 'fill');
          if (c.neg)
            return {
              text: 'no borders: the shared border width to 0',
              options: [[set('--border-width', '0px')]],
            };
          if (color)
            return {
              text: 'the border color of the whole theme: --color-border',
              options: [[set('--color-border', color, modeOf(c))]],
            };
          // Darker, lighter, subtler or more contrast asks for the color.
          if (
            /\b(darker|lighter|subtle\w*|contrast|stronger|fainter|softer|visible|invisible|too (dark|light|faint|strong|harsh|heavy))\b/.test(
              c.text,
            )
          ) {
            // "too light" asks for stronger borders, "too dark" for fainter.
            const more =
              (/\b(darker|stronger|more contrast|visible|too (light|faint|subtle))\b/.test(
                c.text,
              ) &&
                !/\binvisible\b/.test(c.text)) ||
              false;
            const steps = perMode(
              '--color-border',
              '--color-border',
              {},
              (now, m) => stronger(now, more ? 2 : 0.5, m),
              c,
            );
            return steps.length
              ? {
                  text: `the border color of the whole theme: --color-border, ${more ? 'stronger' : 'fainter'}${modesSaid(steps)}`,
                  options: [steps],
                  sequence: steps.length > 1,
                }
              : null;
          }
          if (c.lengths[0] || c.dir)
            return {
              text: 'the border width of the whole theme: --border-width',
              options: [
                [
                  set(
                    '--border-width',
                    c.lengths[0] ?? (c.dir === 'less' ? '1px' : '2px'),
                  ),
                ],
              ],
            };
          return null;
        }
        if (/\brings?\b/.test(c.text)) {
          const color = colorFor(c, 'fill');
          const w = c.lengths[0];
          const fl = {...f, state: f.state ?? 'focus-visible'};
          /** @type {Step[]} */
          const steps = [
            ...(color ? [set('outline-color', color, fl)] : []),
            ...(w ? [set('outline-width', w, fl)] : []),
            ...(c.neg ? [set('outline', 'none', fl)] : []),
          ];
          return steps.length
            ? {
                text: `the focus ring${where}: the outline`,
                options: [steps],
                sequence: steps.length > 1,
              }
            : null;
        }
        if (c.neg)
          return {
            text: `no ${outline ? 'outline' : 'border'}${where}`,
            options: [
              ...undo([
                'border',
                'border-color',
                'border-width',
                'border-style',
                'outline',
              ]),
              [set('border', 'none', f)],
              ...(outline ? [[set('outline', 'none', f)]] : []),
            ],
          };
        const color = colorFor(c, 'fill');
        const width =
          c.lengths[0] ??
          (/\b(thick(er)?)\b/.test(c.text) || c.dir === 'more'
            ? '2px'
            : /\bthin(ner)?\b/.test(c.text) || c.dir === 'less'
              ? '1px'
              : null);
        const style = /\b(dashed|dotted|double)\b/.exec(c.text)?.[1] ?? null;
        const side = /\b(top|bottom|left|right)\b/.exec(c.text)?.[1];
        const prop = side ? `border-${side}` : 'border';
        const own = C.MAP[one(on)]?.own ?? {};
        const hasBorder = 'border-style' in own || 'border-width' in own;
        if (hasBorder && !side) {
          /** @type {Step[][]} */
          const opts = [];
          if (color && !width && !style)
            opts.push([set('border-color', color, {...f, ...modeOf(c)})]);
          if (width && !color && !style)
            opts.push([set('border-width', width, f)]);
          if (style && !color && !width)
            opts.push([set('border-style', style, f)]);
          opts.push([
            set(
              prop,
              `${width ?? '1px'} ${style ?? 'solid'} ${color ?? 'var(--color-border)'}`,
              f,
            ),
          ]);
          return {text: `the border${where}`, options: opts};
        }
        return {
          text: `a border${where}: ${prop}`,
          options: [
            [
              set(
                prop,
                `${width ?? '1px'} ${style ?? 'solid'} ${color ?? 'var(--color-border)'}`,
                f,
              ),
            ],
          ],
        };
      }
      case 'spacing': {
        const px = c.lengths[0];
        const gap = /\b(gaps?|between)\b/.test(c.text);
        const value =
          /\b(dense|compact)\b/.test(c.text) && !c.dir
            ? 'compact'
            : c.neg && /\b(padding|space|gap|margin)\b/.test(c.text)
              ? null
              : /\b(cramped|crowded|airy|spacious|roomy)\b/.test(c.text) ||
                  c.dir === 'more'
                ? 'more'
                : c.dir === 'less' || /\b(dense|compact|tight)\b/.test(c.text)
                  ? 'less'
                  : 'more';
        if (!on)
          return value
            ? {
                text: 'room in the whole theme: the spacing dial (padding, gaps and control heights together)',
                options: [[set('spacing', value)]],
              }
            : null;
        if (px) {
          const box = boxIn(c.text) ?? px;
          return {
            text: `${gap ? 'the gap' : 'padding'}${where}: ${box}`,
            options: [[set(gap ? 'gap' : 'padding', box, f)]],
          };
        }
        if (!value)
          return {
            text: `no padding${where}`,
            options: [[set('padding', '0px', f)]],
          };
        return {
          text: `room inside ${on}: spacing ${value} (padding, gaps and heights inside it)`,
          options: [[set('spacing', value, {on})]],
        };
      }
      case 'tracking': {
        const tight =
          c.dir === 'less' ||
          /\b(tight(en|er)?|narrow(er)?|less|condensed)\b/.test(c.text);
        const typedTrack = c.lengths.find(l => /em$/.test(l)) ?? c.lengths[0];
        const value = typedTrack ?? (tight ? '-0.02em' : '0.04em');
        if (!on || on === 'heading')
          return {
            text: `letter spacing${where}`,
            options: [
              ...(on ? [[set('letter-spacing', value, f)]] : []),
              ...(typedTrack
                ? []
                : [[set('headings', tight ? 'tight' : 'wide')]]),
            ],
          };
        return {
          text: `letter spacing${where}`,
          options: [[set('letter-spacing', value, f)]],
        };
      }
      case 'weight': {
        const typedW = weightIn(c);
        const light =
          /\b(light(er)?|thin(ner)?)\b/.test(c.text) ||
          (c.dir === 'less' && !c.neg);
        const value =
          typedW ??
          (c.neg
            ? '400'
            : light
              ? /\btoo /.test(c.text)
                ? '400'
                : '300'
              : '700');
        const rung = Object.entries(HEADING_WEIGHTS).find(
          ([, v]) => v === value,
        )?.[0];
        if (
          (!on && /\b(headings?|titles?)\b/.test(c.text)) ||
          (on === 'heading' && !f.when)
        )
          return {
            text: `${rung ?? value} headings: the headings dial, or font-weight on the part`,
            options: [
              ...(rung ? [[set('headings', rung)]] : []),
              [set('font-weight', value, {...f, on: 'heading'})],
            ],
          };
        if (!on)
          return {
            text: `body text weight: --text-body-weight (now ${current('--text-body-weight')})`,
            options: [[set('--text-body-weight', value)]],
          };
        return {
          text: `${rung ?? value} text${where}: font-weight ${value}`,
          options: [[set('font-weight', value, f)]],
        };
      }
      case 'family': {
        const font = fontIn(c, question);
        if (!font) return null;
        if (!on)
          return {
            text: `the typeface of the whole theme: font ${font}`,
            options: [[set('font', font)]],
          };
        if (on === 'heading')
          return {
            text: 'the heading font: font --on heading',
            options: [[set('font', font, {on: 'heading'})]],
          };
        const family = FONTS[font]?.[0] ?? OPEN_FONTS[font]?.family ?? font;
        return {
          text: `the font${where}: font-family`,
          options: [[set('font-family', family, f)]],
        };
      }
      case 'fontsize': {
        // A size of 0 hides the text: refused by name, never made bigger.
        if (/\b(font|text) size\s*:?\s*0(px|rem|em)?\b(?!\.)/.test(c.text))
          return {
            text: 'a font size of 0 hides the text; give a size above 0',
            options: [],
          };
        const px = c.lengths[0];
        const f2 = /\bmuch\b/.test(c.text) ? 1.5 : 1.25;
        const factor = c.dir === 'less' ? 1 / f2 : f2;
        if (!on)
          return {
            text: 'the base text size: text-size (every heading scales from it)',
            options: [
              [
                set(
                  'text-size',
                  px
                    ? String(parseFloat(px))
                    : c.dir === 'less'
                      ? 'less'
                      : 'more',
                ),
              ],
            ],
          };
        if (on === 'heading' && !f.when && !px)
          return c.dir === 'less'
            ? {
                text: 'smaller steps between heading sizes: type compact (x1.15)',
                options: [[set('type', 'compact')]],
              }
            : {
                text: 'bigger steps between heading sizes: the type dial',
                options: [
                  [
                    set(
                      'type',
                      /\bmuch\b/.test(c.text) ? 'display' : 'editorial',
                    ),
                  ],
                  [set('text-size', 'more')],
                ],
              };
        const sizeTok =
          on === 'heading' && p?.level
            ? `--text-heading-${p.level}-size`
            : (C.partReads(one(on), 'font').find(r =>
                r.props.includes('font-size'),
              )?.token ??
              Object.keys(C.MAP[one(on)]?.own?.['font-size']?.tokens ?? {})[0]);
        // A part with no size token of its own starts from the body size.
        const now = sizeTok
          ? current(sizeTok)
          : on !== 'heading' && '--text-body-size' in TOKENS
            ? current('--text-body-size')
            : null;
        const value = px ?? (now ? scaled(now, factor) : null);
        if (!value) return null;
        return {
          text: `the text size${where}: font-size ${value}${now && !px ? ` (now ${now})` : ''}`,
          options: [
            [set('font-size', value, f)],
            ...(sizeTok && on === 'heading' ? [[set(sizeTok, value)]] : []),
          ],
        };
      }
      case 'case': {
        const value = c.neg
          ? 'none'
          : /\blower/.test(c.text)
            ? 'lowercase'
            : /\bcapitali/.test(c.text)
              ? 'capitalize'
              : 'uppercase';
        if (!on) return null;
        return {
          text: `${value} text${where}: text-transform`,
          options: [
            [set('text-transform', value, f)],
            ...(on === 'button' && value === 'uppercase'
              ? [[set('buttons', 'caps')]]
              : []),
          ],
        };
      }
      case 'italic':
        return on
          ? {
              text: `italic text${where}: font-style`,
              options: [[set('font-style', c.neg ? 'normal' : 'italic', f)]],
            }
          : null;
      case 'opacity': {
        const typedOpacity = /\bopacity\s*:?\s*(0|1|0?\.\d+)\b(?!%)/.exec(
          c.text,
        )?.[1];
        if (typedOpacity && on)
          return {
            text: `opacity${where}: ${typedOpacity}`,
            options: [[set('opacity', typedOpacity, f)]],
          };
        const pct = /\b(\d{1,3})%/.exec(withoutFunctions(c.text))?.[1];
        if (pct && on)
          return Number(pct) > 100
            ? {text: `opacity runs from 0% to 100%, not ${pct}%`, options: []}
            : {
                text: `opacity${where}: ${pct}%`,
                options: [[set('opacity', String(Number(pct) / 100), f)]],
              };
        return on
          ? {
              text: `${c.neg || f.state === 'disabled' ? 'less faded' : 'more see-through'}${where}: opacity`,
              options: [
                [
                  set(
                    'opacity',
                    c.neg ||
                      f.state === 'disabled' ||
                      /\btoo faded\b/.test(c.text)
                      ? '0.8'
                      : '0.6',
                    f,
                  ),
                ],
              ],
            }
          : null;
      }
      case 'scale':
        return on
          ? {
              text: `${on} scales${where}: transform`,
              options: [
                [
                  set(
                    'transform',
                    /\b(up|grows?)\b/.test(c.text)
                      ? 'scale(1.03)'
                      : 'scale(0.97)',
                    f,
                  ),
                ],
              ],
            }
          : null;
      case 'size': {
        if (!on) return null;
        // A heading's size is its type size.
        if (on === 'heading' && !c.lengths.length)
          return answerFor(c, p, 'fontsize');
        const tall =
          tallIn(c.text) ??
          (/\b(taller|shorter|height)\b/.test(c.text) ? c.lengths[0] : null);
        if (tall)
          return {
            text: `the height${where}: min-height ${tall}`,
            options: [[set('min-height', tall, f)], [set('height', tall, f)]],
          };
        if (on === 'progress-bar-fill' || on === 'progress-bar-track')
          return {
            text: 'the progress bar thickness: the height of its track',
            options: [
              [
                set(
                  'height',
                  c.lengths[0] ??
                    (c.dir === 'less' || /\bthin/.test(c.text) ? '2px' : '8px'),
                  {on: 'progress-bar-track'},
                ),
              ],
            ],
          };
        if (/\b(wider|narrower|width)\b/.test(c.text)) {
          const w =
            c.lengths[0] ??
            (/\bnarrower\b/.test(c.text) || c.dir === 'less'
              ? '400px'
              : '720px');
          return {
            text: `the width${where}`,
            options: [
              [set('width', `min(${w}, 100%)`, f)],
              [set('max-width', w, f)],
            ],
          };
        }
        if (on === 'tab-indicator')
          return {
            text: 'the tab underline height',
            options: [
              [
                set(
                  'height',
                  c.lengths[0] ?? (c.dir === 'less' ? '1px' : '3px'),
                  f,
                ),
              ],
            ],
          };
        return {
          text: `${c.dir === 'less' ? 'smaller' : 'bigger'} ${on}: spacing ${c.dir === 'less' ? 'less' : 'more'} --on ${on} sets its padding and control height`,
          options: [
            [set('spacing', c.dir === 'less' ? 'less' : 'more', {on})],
            ...(c.lengths[0] ? [[set('min-height', c.lengths[0], f)]] : []),
          ],
        };
      }
      case 'text': {
        const color = colorFor(c, 'text');
        const tok = /\bsecondary\b/.test(c.text)
          ? '--color-text-secondary'
          : '--color-text-primary';
        if (!on) {
          const label = `${tok === '--color-text-secondary' ? 'secondary' : 'main'} text color: ${tok}`;
          // "never use pure black": where the token is that color, a near
          // color that is not it; a mode where it is not keeps its value.
          if (c.neg && color) {
            const avoid = parseColor(color);
            const steps = perMode(
              tok,
              tok,
              {},
              now => {
                const n = parseColor(now);
                if (
                  !avoid ||
                  !n ||
                  n.some((x, i) => Math.abs(x - avoid[i]) > 2)
                )
                  return null;
                return avoid.reduce((x, y) => x + y, 0) < 384
                  ? '#1f2937'
                  : '#f9fafb';
              },
              c,
            );
            return steps.length
              ? {
                  text: `${label}, off ${color}${modesSaid(steps)}`,
                  options: [steps],
                  sequence: steps.length > 1,
                }
              : {
                  text: `${label} is not ${color} in any mode, so nothing changes`,
                  options: [],
                };
          }
          if (color) {
            // A text color for both modes that one mode's page would make
            // unreadable is set for the other mode only.
            const rgb = parseColor(color);
            const readable = /** @type {Array<'light' | 'dark'>} */ ([
              'light',
              'dark',
            ]).filter(m => {
              const page = parseColor(current('--color-background-body', m));
              return !rgb || !page || ratio(rgb, page) >= 3;
            });
            if (
              !c.mode &&
              modal &&
              readable.length === 1 &&
              // Asked for every mode, or with its own page color: as asked.
              !/\b(everywhere|both modes|all modes|always|in every mode)\b/.test(
                q,
              ) &&
              !/\b(bg|background|page)\b/.test(q)
            )
              return {
                text: `${label} in ${readable[0]} mode only: on the ${readable[0] === 'light' ? 'dark' : 'light'} page ${color} would not be readable`,
                options: [[set(tok, color, {mode: readable[0]})]],
              };
            return {
              text: `${label}${c.mode && modal ? ` in ${c.mode} mode` : ''}`,
              options: [[set(tok, color, modeOf(c))]],
            };
          }
          // More contrast moves text away from its page: darker on light,
          // lighter on dark. Less contrast moves it toward the page.
          // "knock the contrast down" asks for less contrast.
          const down = c.dir === 'less' && /\bcontrast\b/.test(c.text);
          const more =
            !down &&
            /\b(darker|darken|too light|can'?t read|hard to read|unreadable|(more|better|higher|low|fails?|failing|enough) contrast|contrast)\b/.test(
              c.text,
            ) &&
            !/\bless contrast\b/.test(c.text);
          const less =
            down ||
            /\b(less bright|dimmer|softer|lighter|less contrast|too dark)\b/.test(
              c.text,
            );
          if (!more && !less) return null;
          const literal = /\b(darker|lighter)\b/.test(c.text) && c.mode;
          const steps = perMode(
            tok,
            tok,
            {},
            (now, m) => {
              const toward = literal
                ? /\bdarker\b/.test(c.text)
                  ? -1
                  : 1
                : (m === 'dark' ? 1 : -1) * (more ? 1 : -1);
              return shift(now, toward * (more ? 0.3 : 0.2));
            },
            c,
          );
          return steps.length
            ? {
                text: `${label}, ${more ? 'more' : 'less'} contrast with the page${modesSaid(steps)}`,
                options: [steps],
                sequence: steps.length > 1,
              }
            : {
                text: `${label} is already ${more ? 'as far from the page as it goes' : 'as close to the page as it should go'} (${current(tok, 'light')} in light${modal ? `, ${current(tok, 'dark')} in dark` : ''}), so nothing changes`,
                options: [],
              };
        }
        // A link's color comes from its color prop, so no part style
        // reaches it: the accent text token is what a link reads, in every
        // state.
        if (on === 'link' && color)
          return {
            text: `the link color: --color-text-accent, the token a link reads (it also colors other accent text)${f.state ? `; a link has no color of its own for ${f.state}, so this changes it in every state` : ''}`,
            options: [[set('--color-text-accent', color, modeOf(c))]],
          };
        if (!color) return null;
        return {
          text: `text color${where}: color`,
          options: [[set('color', color, {...f, ...modeOf(c)})]],
        };
      }
      case 'background': {
        if (/\bstripe[sd]?\b|\bstriped\b|\bzebra\b/.test(c.text))
          return {
            text: 'striped rows need a style on every other row, and set has no condition for that; a row background colors every row',
            options: [],
          };
        const design = /\bglossy\b/.test(c.text)
          ? 'glossy'
          : /\bgradient\b/.test(c.text)
            ? 'gradient'
            : null;
        if (c.neg && on) {
          const undos = undo([
            'background',
            'background-image',
            'background-color',
          ]);
          return undos.length
            ? {
                text: `take back the ${design ?? 'background'} this theme sets${where}`,
                options: undos,
              }
            : {
                text: `${on} has no ${design ?? 'background'} this theme sets, so there is nothing to remove`,
                options: [],
                lookup: `${HOW} ${on}`,
              };
        }
        if (!on && c.neg && /\bgradients?\b/.test(c.text)) {
          const grads = env.data.settings.filter(x =>
            /gradient\(/.test(x.value),
          );
          return grads.length
            ? {
                text: 'take back every gradient this theme sets',
                options: [
                  grads.map(
                    x =>
                      /** @type {Step} */ ({
                        verb: 'undo',
                        thing: x.thing,
                        ...(x.on ? {on: x.on} : {}),
                        ...(x.when ? {when: x.when} : {}),
                        ...(x.state ? {state: x.state} : {}),
                        ...(x.mode ? {mode: x.mode} : {}),
                      }),
                  ),
                ],
                sequence: grads.length > 1,
              }
            : {
                text: `${env.slug} sets no gradient, so there is nothing to remove`,
                options: [],
              };
        }
        if (!on) {
          const color = colorFor(c, 'fill');
          if (color)
            return {
              text: `the page background: --color-background-body${c.mode && modal ? ` in ${c.mode} mode` : ''}`,
              options: [[set('--color-background-body', color, modeOf(c))]],
            };
          if (!c.dir) return null;
          const lighter = /\blight(er)?|brighter\b/.test(c.text);
          const steps = perMode(
            '--color-background-body',
            '--color-background-body',
            {},
            (now, m) => {
              const v = shift(
                now,
                lighter
                  ? m === 'dark'
                    ? 0.06
                    : 0.5
                  : m === 'dark'
                    ? -0.3
                    : -0.06,
              );
              // White cannot get lighter, nor black darker.
              const sum = (/** @type {string | null} */ x) =>
                (x &&
                  parseColor(x)
                    ?.slice(0, 3)
                    .reduce((p, q) => p + q, 0)) ??
                0;
              return v && (lighter ? sum(v) > sum(now) : sum(v) < sum(now))
                ? v
                : null;
            },
            c,
          );
          return steps.length
            ? {
                text: `a ${lighter ? 'lighter' : 'darker'} page background: --color-background-body${modesSaid(steps)}`,
                options: [steps],
                sequence: steps.length > 1,
              }
            : null;
        }
        if (c.decl.background || c.decl['background-color'])
          return {
            text: `the background you wrote${where}`,
            options: [
              [
                set(
                  'background',
                  c.decl.background ?? c.decl['background-color'],
                  f,
                ),
              ],
            ],
          };
        // "from #f58529 to #dd2a7b": the gradient written in the question.
        // "from #a to #b", "#a 0% to #b 100%": the stops as typed.
        const ends =
          /\bfrom\s+(\S+)\s+(?:to|into)\s+(\S+)/.exec(c.text) ??
          /(#[0-9a-f]{3,8}(?:\s+\d+%)?)\s+(?:to|into)\s+(#[0-9a-f]{3,8}(?:\s+\d+%)?)/.exec(
            c.text,
          );
        const stop = (/** @type {string} */ x) => parseColor(x.split(/\s+/)[0]);
        if (design && ends && stop(ends[1]) && stop(ends[2]))
          return {
            text: `a gradient from ${ends[1]} to ${ends[2]}${where}`,
            options: [
              [set('background', `linear-gradient(${ends[1]}, ${ends[2]})`, f)],
            ],
          };
        if (design)
          return {
            text: `a ${design} fill${where}`,
            options: [
              [set('background', DESIGN[design].replace(/^"|"$/g, ''), f)],
            ],
          };
        /** @type {string | null} */
        let color =
          (/\btransparent\b/.test(c.text) ? 'transparent' : null) ??
          colorFor(c, 'fill') ??
          (c.dir ? null : toneIn(c.text));
        if (on === 'tab-indicator' && color && c.lengths[0])
          return {
            text: `the tab underline${where}: its color and height`,
            options: [
              [set('background', color, f), set('height', c.lengths[0], {on})],
            ],
            sequence: true,
          };
        if (!color && c.dir) {
          const lighter = /\blight(er)?\b/.test(c.text);
          const reads = C.partReads(one(on), 'background');
          const read = C.MAP[one(on)]
            ? (reads.find(r => r.when.includes(''))?.token ??
              (FAMILIES.containers.includes(one(on))
                ? '--color-background-card'
                : reads[0]?.token))
            : null;
          // A part with no recorded fill: what its color is now is unknown,
          // so a brightness filter makes it darker or lighter from there.
          if (!read || f.state)
            return {
              text: `${lighter ? 'a lighter' : 'a darker'} ${on}${where}: a brightness filter, from whatever color it has now`,
              options: [
                [set('filter', `brightness(${lighter ? 1.15 : 0.85})`, f)],
              ],
            };
          const steps = perMode(
            read,
            'background',
            f,
            now => shift(now, lighter ? 0.12 : -0.12),
            c,
          );
          if (steps.length)
            return {
              text: `${lighter ? 'a lighter' : 'a darker'} background${where}, from ${read}${modesSaid(steps)}`,
              options: [steps],
              sequence: steps.length > 1,
            };
        }
        if (!color && f.state === 'hover')
          return {
            text: `a slightly darker ${on}${where}`,
            options: [
              [
                set(
                  'filter',
                  `brightness(${/\bdark/.test(c.text) ? 0.9 : 0.95})`,
                  f,
                ),
              ],
            ],
          };
        if (!color) return null;
        return {
          text: `the background${where}${c.mode && modal ? ` in ${c.mode} mode` : ''}`,
          options: [[set('background', color, {...f, ...modeOf(c)})]],
        };
      }
      default:
        return null;
    }
  }

  /**
   * A whole-theme answer for a clause that names no part or aspect: a
   * color the theme generates, vibrancy, the color modes.
   * @param {Clause} c
   * @param {string} [aspect]
   * @returns {Draft | null}
   */
  function wholeTheme(c, aspect) {
    if (aspect) return answerFor(c, null, aspect);
    const t = c.text;
    if (c.bad)
      return {
        text: `"${c.bad}" is not a color: a hex color has 3, 4, 6 or 8 digits after the #. Give the color again.`,
        options: [],
      };
    if (/\bswap\b/.test(t)) {
      const ROLE_TOKEN = /** @type {Record<string, string>} */ ({
        accent: '--color-accent',
        danger: '--color-error',
        success: '--color-success',
        warning: '--color-warning',
        info: '--color-info',
      });
      const named = Object.keys(ROLE_TOKEN).filter(r =>
        new RegExp(`\\b${r === 'danger' ? '(danger|error)' : r}\\b`).test(t),
      );
      if (named.length === 2) {
        const [x, y] = named;
        const cx = current(ROLE_TOKEN[x]);
        const cy = current(ROLE_TOKEN[y]);
        if (parseColor(cx) && parseColor(cy)) {
          seenAspect('colors');
          return {
            text: `${x} takes ${y}'s color (${cy}) and ${y} takes ${x}'s (${cx})`,
            options: [[set(x, cy), set(y, cx)]],
            sequence: true,
          };
        }
      }
    }
    if (/\b(more|higher|high|better) contrast\b|\bcontrast mode\b/.test(t)) {
      // Away from the page in each mode: darker on light, lighter on dark.
      const steps = [
        ...perMode(
          '--color-text-secondary',
          '--color-text-secondary',
          {},
          (now, m) => shift(now, m === 'dark' ? 0.35 : -0.35),
          c,
        ),
        ...perMode(
          '--color-border',
          '--color-border',
          {},
          (now, m) => stronger(now, 2.5, m),
          c,
        ),
      ];
      return {
        text: `more contrast: secondary text further from the page and stronger borders${modal && !c.mode ? ', in light and in dark mode, each from its own value' : c.mode ? ` in ${c.mode} mode` : ''}`,
        options: [steps],
        sequence: steps.length > 1,
      };
    }
    if (/\b(apply|use|want|make it) (a )?dark (theme|look|ui)\b/.test(t))
      return {
        text:
          env.data.mode === 'both'
            ? `${env.slug} has a dark mode already, which the app shows when the system asks for it; for a theme that is always dark: mode dark-only`
            : 'a theme that is always dark: mode dark-only',
        options: [[set('mode', 'dark-only')]],
      };
    if (/\b(undo|revert|go back|take back)\b/.test(t) && !c.colors.length)
      return env.undoSteps
        ? {
            text: `undo ${env.slug} steps back one change (${env.undoSteps} can be undone); undo ${env.slug} <thing> removes one setting`,
            options: [],
            lookup: `${P} undo ${env.slug}`,
          }
        : {
            text: `${env.slug} has no change to undo yet; show ${env.slug} lists its settings`,
            options: [],
            ...(env.exists ? {lookup: `${P} show ${env.slug}`} : {}),
          };
    if (/\breset\b|\bstart over\b|\bback to (the )?defaults?\b/.test(t))
      return {
        text: `each undo ${env.slug} steps back one change; show ${env.slug} lists every setting, and undo ${env.slug} <thing> removes one`,
        options: [],
        ...(env.exists ? {lookup: `${P} show ${env.slug}`} : {}),
      };
    if (/\b(dark|light)\b/.test(t) && /\b(mode|theme|only)\b/.test(t))
      seenAspect('mode');
    if (
      /\bdark[- ]?(mode|theme)? only\b|\bonly dark\b|\bdark-only\b|\bdark by default\b|\bdefault(s)? to dark\b|\balways dark\b/.test(
        t,
      )
    )
      return {
        text: 'a theme with only a dark mode: mode dark-only',
        options: [[set('mode', 'dark-only')]],
      };
    if (
      /\blight[- ]?(mode|theme)? only\b|\bonly light\b|\blight-only\b/.test(t)
    )
      return {
        text: 'a theme with only a light mode: mode light-only',
        options: [[set('mode', 'light-only')]],
      };
    if (
      /\b(support|add|enable|want|need)\b.*\bdark\b|\bdark mode\b/.test(t) &&
      !c.colors.length &&
      !/\b(accent|text|background|colou?rs?)\b/.test(t)
    ) {
      if (env.data.mode === 'both')
        return {
          text: `${env.slug} has a dark mode already: every color it sets makes its dark shades too. The in-app preview switches between them.`,
          options: [],
        };
      return {
        text: 'light and dark modes both: mode both',
        options: [[set('mode', 'both')]],
      };
    }
    const vib =
      /\b(colou?rful|saturat\w*|desaturat\w*|vivid|vibran\w*|muted|dull|washed|pastel|intense|pop|punch\w*|gr[ae]yer)\b/.test(
        t,
      );
    if (vib && c.colors.length && ROLE_WORDS.test(t)) {
      const named = roleAnswer(c);
      if (named) return named;
    }
    if (vib) {
      seenAspect('colors');
      const less =
        /\b(less|desaturat\w*|muted|dull|washed|pastel|gr[ae]yer|calm\w*|softer)\b/.test(
          t,
        ) && !/\bmore\b/.test(t);
      const step = set('vibrancy', less ? 'less' : 'more');
      const colored = (/** @type {string} */ v) => !isGraySeed(seedOf(v));
      const hasColor = env.data.settings.some(
        x => PALETTE_DIALS.includes(x.thing) && colored(x.value),
      );
      const help =
        'vibrancy sets how saturated every generated color is (0 is gray, 100 the most vivid, 50 the default)';
      if (hasColor)
        return {
          text: `${help}; ${less ? 'less' : 'more'} steps it by 10.`,
          options: [[step]],
        };
      if (less)
        return {
          text: `${help}, and every color ${env.slug} has is a gray, so there is no color to take out.`,
          options: [],
          lookup: `${HOW} colors`,
        };
      const now = parseColor(current('--color-accent'));
      if (now && colored(hex(now)))
        return {
          text: `${help}. It works once the theme sets a color, so the first command sets accent to the color it has now.`,
          options: [[set('accent', hex(now)), step]],
          sequence: true,
        };
      // No color to saturate, and none was asked for: never pick one.
      return {
        text: `${help}, and every color ${env.slug} has is a gray, so there is nothing to saturate yet. Set a color first: how accent shows how.`,
        options: [],
        lookup: `${HOW} accent`,
      };
    }
    if (
      /\b(shades?|swatch(es)?|ramps?|all (the )?colou?rs|every colou?r|see (the )?colou?rs)\b/.test(
        t,
      )
    ) {
      seenAspect('colors');
      return {
        text: `Every shade of every color, light and dark, with the tokens that use each, is on the Colors page of the in-app preview. It changes with every set.${env.previewDamage ? ` The preview cannot be changed now: ${env.previewDamage}` : ''}`,
        options: [],
        ...(env.exists && !env.previewDamage
          ? {
              lookup: `astryx experimental theme preview add --theme ${env.slug}`,
            }
          : {}),
      };
    }
    if (
      /\b(exact|one token|single token|specific token|override)\b/.test(t) &&
      /\bcolou?rs?\b/.test(t)
    ) {
      seenAspect('colors');
      return {
        text: 'An exact color for one token: set the token itself. It always wins over the generated colors, whatever order you set them in. Add --mode light|dark for one mode, or --on <part> for one part.',
        options: [
          [set('--color-accent', '#7c3aed')],
          ...(modal
            ? [[set('--color-text-primary', '#111827', {mode: 'light'})]]
            : []),
        ],
        lookup: `${HOW} --list tokens`,
      };
    }
    if (/\bstatus(es)? colou?rs?\b|\bstatus\b/.test(t) && !c.colors.length) {
      seenAspect('colors');
      return {
        text: 'Status colors are four settings: danger (errors and destructive actions: the --color-error tokens), success, warning and info. Each one makes its light and dark shades from one color: set <color> <value>. how <color> shows each.',
        options: [],
        lookup: `${HOW} danger`,
      };
    }
    if (
      /\bdark\b/.test(t) &&
      /\bcolou?rs?\b/.test(t) &&
      !c.colors.length &&
      !ROLE_WORDS.test(t)
    ) {
      seenAspect('colors');
      return {
        text: 'Each color you set makes its dark shades too, so dark mode follows by itself. For one token in dark mode only, set it with --mode dark; for a theme with only a dark mode, set mode dark-only.',
        options: [],
        lookup: `${HOW} colors`,
      };
    }
    const named = roleAnswer(c);
    if (named) return named;
    // A color with nothing else named, in a question about a look ("Duolingo
    // vibes: green #58cc02"), is the brand color.
    if (
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/.test(c.text) &&
      !c.parts.length &&
      !c.aspects.length &&
      !c.lengths.length &&
      c.text
        .replace(/#[0-9a-f]+|\b(?:rgba?|hsla?|oklch)\([^)]*\)/g, '')
        .replace(new RegExp(`\\b(${Object.keys(HUES).join('|')})\\b`, 'g'), '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length <= 2 &&
      /\b(look|vibes?|style|like|feel|brand|theme)\b/.test(
        question.toLowerCase(),
      )
    )
      return roleAnswer({...c, text: `accent ${c.text}`});
    return null;
  }

  /**
   * The colors the theme generates that a clause names, each with its own
   * color: the color right after the word, or right before it when nothing
   * follows ("#0d6efd primary"). A color is used once.
   * @param {Clause} c
   * @returns {Draft | null}
   */
  function roleAnswer(c) {
    const t = c.text;
    const ROLES = /** @type {Array<[RegExp, string, string]>} */ ([
      [
        /\b(accent|brand|primary|main colou?r|key colou?r)\b/g,
        'accent',
        '--color-accent',
      ],
      [/\b(errors?|danger|destructive)\b/g, 'danger', '--color-error'],
      [/\b(success|positive)\b/g, 'success', '--color-success'],
      [/\b(warnings?|caution)\b/g, 'warning', '--color-warning'],
      [/\b(info|notices?)\b/g, 'info', '--color-info'],
      [
        /\b(neutrals?|gr[ae]ys?|warm(er)?|cool(er)?)\b/g,
        'neutral',
        '--color-neutral',
      ],
      [/\bsecondary\b(?! (text|buttons?))/g, 'secondary', ''],
    ]);
    /** @type {Array<{at: number, dial: string, token: string}>} */
    const found = [];
    for (const [re, dial, token] of ROLES)
      for (const m of t.matchAll(re))
        if (!found.some(x => x.dial === dial))
          found.push({at: m.index ?? 0, dial, token});
    if (!found.length) return null;
    found.sort((x, y) => x.at - y.at);
    seenAspect('colors');
    // Each color written in the clause, where it is.
    const placed = [
      ...t.matchAll(
        /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/g,
      ),
    ]
      .filter(m => parseColor(m[0]))
      .map(m => ({at: m.index ?? 0, color: m[0], used: false}));
    const hues = c.colors.filter(x => !placed.some(p => p.color === x));
    /** @type {Draft[]} */
    const answers = [];
    for (let i = 0; i < found.length; i++) {
      const {at, dial, token} = found[i];
      const end = found[i + 1]?.at ?? Infinity;
      const after = placed.find(p => !p.used && p.at > at && p.at < end);
      const before = [...placed].reverse().find(p => !p.used && p.at < at);
      const pick = after ?? (found.length === 1 || !after ? before : undefined);
      if (pick) pick.used = true;
      answers.push(
        one1(
          dial,
          token,
          pick?.color ?? (found.length === 1 ? hues[0] : undefined) ?? null,
          c,
        ),
      );
    }
    const doing = answers.filter(x => x.options.length);
    if (doing.length > 1)
      return {
        text: doing.map(x => x.text).join('; '),
        options: [doing.map(x => x.options[0][0])],
        sequence: true,
      };
    return doing[0] ?? answers[0];
  }

  /**
   * One color the theme generates, set from a clause.
   * @param {string} dial @param {string} token @param {string | null} given @param {Clause} c
   * @returns {Draft}
   */
  function one1(dial, token, given, c) {
    const t = c.text;
    if (dial === 'secondary')
      return given
        ? {
            text: `no setting is a second brand color; for secondary buttons, their fill: background ${given} --on button --when variant:secondary`,
            options: [
              [
                set('background', given, {
                  on: 'button',
                  when: 'variant:secondary',
                }),
              ],
            ],
          }
        : {text: 'no setting is a second brand color', options: []};
    let color =
      given &&
      !(
        dial === 'neutral' &&
        ['#9ca3af', '#e5e7eb', '#374151', '#f3f4f6'].includes(given)
      )
        ? given
        : null;
    if (dial === 'neutral' && !color)
      // "too warm" asks for cooler, "too cool" for warmer.
      color = /\btoo warm\b|\bcool(er)?\b/.test(t)
        ? '#64748b'
        : /\btoo cool\b|\bwarm(er)?\b/.test(t)
          ? '#78716c'
          : null;
    // "make the error red darker": the hue names the color; the change is darker.
    const NATURAL = /** @type {Record<string, string>} */ ({
      danger: HUES.red,
      success: HUES.green,
      warning: HUES.yellow,
      info: HUES.blue,
    });
    if (c.dir && color && (color === NATURAL[dial] || color === HUES.amber))
      color = null;
    if (!color && c.dir && !/\btoo (warm|cool)\b/.test(t)) {
      // "too dark" asks for lighter, "too bright" for darker.
      const lighter =
        /\btoo dark\b/.test(t) ||
        /\b(light(er)?|brighter|paler)\b/.test(
          t.replace(/\btoo (light|bright|pale)\b/g, ' '),
        );
      if (c.mode && modal) {
        const steps = perMode(
          token,
          token,
          {},
          now => shift(now, lighter ? 0.2 : -0.2),
          c,
        );
        return {
          text: `${dial} in ${c.mode} mode only: the exact token ${token}`,
          options: steps.length ? [steps] : [],
        };
      }
      color = shift(current(token, 'light'), lighter ? 0.2 : -0.2);
    }
    if (!color)
      return {
        text: `${DIALS[dial].help} Give the color: set ${env.slug} ${dial} <color>.`,
        options: [],
        lookup: `${HOW} ${dial}`,
      };
    if (c.mode && modal)
      return {
        text: `${dial} in ${c.mode} mode only: the exact token ${token}`,
        options: [[set(token, color, modeOf(c))]],
      };
    return {
      text: `${dial}: the editor makes its light and dark shades from ${color}`,
      options: [[set(dial, color)], [set(token, color)]],
    };
  }

  /**
   * A part word how cannot name: the clause starts with a word a component
   * doc lists as a keyword, or a near catalog name, and asks for a shape
   * change. Gives the word and the parts of the components that list it.
   * @param {string} text
   * @returns {{word: string, parts: string[]} | null}
   */
  function unknownPart(text) {
    const m =
      /^(?:the |a |an |my |our |all |every )?([a-z]+)\b(?: [a-z]+)? (?:rounder|rounded|bolder|bold|bigger|smaller|taller|wider|darker|lighter|padding|shadow|border|corners?|radius)\b/.exec(
        text,
      );
    if (!m) return null;
    const word = singular(m[1]);
    // A word how reads as a change ("border radius") is not a part.
    if (aspectsOf(word).length || aspectsOf(m[1]).length) return null;
    const owners = Object.values(ctx.project.components)
      .filter(info =>
        (info.keywords ?? []).some(
          k => singular(String(k).toLowerCase()) === word,
        ),
      )
      .map(info => info.targets[0]?.className.replace(/^astryx-/, ''))
      .filter(t => t && TARGET.has(t));
    return owners.length
      ? {word, parts: [...new Set(owners)].slice(0, 4)}
      : null;
  }

  /**
   * The tokens a part reads for an aspect, for the answer's text.
   * @param {string} on @param {string} a
   */
  function readsNote(on, a) {
    const group =
      /** @type {Record<string, string>} */ ({
        weight: 'font',
        family: 'font',
        fontsize: 'font',
        tracking: 'font',
        case: 'font',
        italic: 'font',
      })[a] ?? a;
    if (!C.MAP[one(on)] || !Object.hasOwn(GROUPS, group)) return '';
    // Reads that always apply first; partReads sorts them so.
    const toks = C.partReads(one(on), group)
      .map(r => r.token)
      .slice(0, 4);
    return toks.length ? `; ${one(on)} reads ${toks.join(', ')} for it` : '';
  }

  /** @type {Draft[]} */
  const result = [];
  // Several changes in one question: one answer that runs them all first,
  // with repeats dropped and a step dropped when a later one replaces it.
  // Two clauses that set one thing two ways contradict each other: they are
  // offered as choices, not run in turn.
  /** @param {Step} st */
  const idOf = st =>
    [
      st.verb,
      st.thing,
      st.on ?? '',
      st.when ?? '',
      st.state ?? '',
      st.mode ?? '',
    ].join('|');
  /** @type {Map<string, {step: Step, clause: Clause}>} */
  const last = new Map();
  /** @type {Array<[Step, Step]>} */
  const clashes = [];
  for (const {clause, steps} of tops)
    for (const st of steps) {
      const prior = last.get(idOf(st));
      if (prior && prior.clause !== clause && prior.step.value !== st.value)
        clashes.push([prior.step, st]);
      last.delete(idOf(st));
      last.set(idOf(st), {step: st, clause});
    }
  const MAX_STEPS = 12;
  if (clashes.length) {
    const [a, b] = clashes[0];
    result.push({
      text: `the question asks for ${a.thing} ${a.value} and ${b.thing} ${b.value}${a.on ? ` on ${a.on}` : ''}, which contradict each other; pick one`,
      options: [[a], [b]],
    });
  } else if (last.size > 1 && clauses.length > 1) {
    // The page never takes the color the text takes in the same mode.
    const all = [...last.values()]
      .map(x => x.step)
      .filter(
        (st, i, list) =>
          !(
            st.thing === '--color-background-body' &&
            list.some(
              t =>
                t.thing === '--color-text-primary' &&
                String(t.value).toLowerCase() ===
                  String(st.value).toLowerCase() &&
                (!t.mode || !st.mode || t.mode === st.mode),
            )
          ),
      );
    result.push({
      text:
        all.length > MAX_STEPS
          ? `the first ${MAX_STEPS} of ${all.length} changes, in order; ask again for the rest`
          : 'all of it, in order',
      options: [all.slice(0, MAX_STEPS)],
      sequence: true,
    });
  }
  result.push(...drafts.slice(0, clashes.length ? 0 : undefined));
  return {parts: partsSeen, aspects: aspectsSeen, drafts: result};
}

/** Words for the operating system's own font. */
const OS_FONT =
  /^(mac|macos|apple|windows|ios|android|os)$|\b(mac|macos|apple|windows|ios|android|os|system)('s)?( default| own| native)?( ui)? (font|typeface)\b|\bdefault (mac|apple|windows|system|os) (font|typeface)\b/i;

/**
 * A family a clean machine already has (the editor's font check reads the
 * same list), named in the clause and written with its capitals in the
 * question, as typed there.
 * @param {string} c the clause, lower-case
 * @param {string} question
 */
function systemFamilyIn(c, question) {
  for (const name of [...SYSTEM_FAMILIES].sort((x, y) => y.length - x.length)) {
    if (!/^[a-z]/.test(name) || !new RegExp(`\\b${name}\\b`).test(c)) continue;
    const typed = new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'i').exec(
      question,
    )?.[0];
    if (typed && /^[A-Z]/.test(typed)) return typed;
  }
  return null;
}

/**
 * A font a clause names: a preset, an open font, or a family written with
 * capitals in the question.
 * @param {{text: string, quoted?: string[]}} cl the clause, lower-case
 * @param {string} question the question as typed
 */
function fontIn(cl, question) {
  const c = cl.text.replace(/\bsanz\b/g, 'sans');
  // A family written in quotes, as typed: a shipped font when it names one.
  for (const name of cl.quoted ?? []) {
    const low = name.toLowerCase();
    const slug =
      Object.keys(OPEN_FONTS).find(
        k =>
          OPEN_FONTS[k].family.toLowerCase() === low ||
          k === low.replace(/\s+/g, '-'),
      ) ??
      Object.keys(FONTS).find(
        k => k === low || FONTS[k][0].toLowerCase() === low,
      );
    return slug ?? name;
  }
  // A shipped font named in the clause, the longest name first, so "Geist
  // Mono" is not Geist and "DM Sans" is not the generic sans.
  const shipped = [...Object.keys(OPEN_FONTS), ...Object.keys(FONTS)].sort(
    (x, y) => y.length - x.length,
  );
  // The generic stacks are read last, so "sans-serif" is not "serif".
  const known = shipped.find(
    k =>
      !['system', 'serif', 'mono'].includes(k) &&
      new RegExp(`\\b${k.replace(/-/g, '[\\s-]')}\\b`).test(c),
  );
  // A name as typed, up to four words ("Source Sans 3", "Roboto Slab"):
  // after "use" or "font", or before "font"; one this clause names.
  const GENERIC =
    /^(a|an|the|my|our|this|that|any|some|same|another|different|new|nice|modern|bold|light|thin|heavy|big|small|serif|sans|sans-serif|mono|monospace|system|default|body|heading|headings|code|for|on|in)$/i;
  const NAME =
    "([A-Z][\\w-]*(?:'[\\w-]+)*(?: (?:[A-Z][\\w-]*(?:'[\\w-]+)*|\\d+)){0,3})";
  /** @type {string | undefined} */
  let typed;
  for (const re of [
    new RegExp(
      `\\b(?:[Uu]se|[Ff]ont|[Tt]ypeface|[Tt]o)s?:?\\s+["']?${NAME}`,
      'g',
    ),
    new RegExp(`\\b${NAME}\\s+(?:font|typeface)\\b`, 'g'),
    // "Plus Jakarta Sans as the main font", "Arial everywhere", "Fira
    // Code for monospace".
    new RegExp(
      `(?:^|[\\s,;:])${NAME}\\s+(?:as|for|everywhere|throughout|across)\\b`,
      'g',
    ),
  ]) {
    for (const m of question.matchAll(re)) {
      const name = m[1].replace(/ (Font|Typeface)$/, '');
      if (GENERIC.test(name.split(' ')[0]) || OS_FONT.test(name)) continue;
      // "Plus Jakarta Sans": a clause break word may start the name.
      const low = name.toLowerCase();
      if (
        c.includes(low) ||
        (low.split(' ').length > 2 && c.includes(low.replace(/^\S+ /, '')))
      ) {
        typed = name;
        break;
      }
    }
    if (typed) break;
  }
  // "Roboto Mono" is not Roboto: a longer typed name wins over a shipped
  // one inside it.
  if (
    typed &&
    (!known || typed.replace(/\s+/g, '-').toLowerCase().length > known.length)
  )
    return typed;
  if (known) return known;
  // "the default Mac font": the system font.
  if (OS_FONT.test(c)) return 'system';
  // A family every machine has, named with its capitals ("use Menlo").
  const local = systemFamilyIn(c, question);
  if (local) return local;
  if (/\bmono(space|spaced)?\b/.test(c)) return 'mono';
  if (/\bsans(-serif)?\b/.test(c)) return 'system';
  if (/\bserif\b/.test(c)) return 'serif';
  if (/\bsystem(-ui)?\b/.test(c)) return 'system';
  return null;
}
