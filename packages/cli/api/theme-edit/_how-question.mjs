// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A plain-words question for `how`, read clause by clause: the parts
 * it names (with a variant, size, state or mode), what to change about
 * them, the values typed in it, and whether it asks for more, less or none.
 * Each clause becomes the commands that do exactly that; `how` then keeps
 * only the commands `set` accepts and that change the theme.
 * @position api/theme-edit — imported only by _how.mjs
 */

import {COLOR_NAMES, hex, parseColor, ratio} from './_color.mjs';
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
  COLOR_PROPS,
  GROUPS,
  isSystemFamily,
  wordTable,
} from './_tables.mjs';
import {PALETTE_DIALS, isGraySeed, seedOf} from './_palette.mjs';
import {focusStateOf} from './_settings.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {cssProperties, keywordsOf, matchValue} from './_css.mjs';

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
    ['cuadrad[oa]s|carrés|eckige\\p{L}*', '四角|方形|네모', 'square'],
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
const SHORT = wordTable(
  /** @type {Record<string, string>} */ ({
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
    squre: 'square',
    sqaure: 'square',
    suqare: 'square',
    fnot: 'font',
    fnt: 'font',
  }),
);

/** Plain words that are never corrected, though one letter off a VOCAB word. */
const KEEP = new Set([
  'selection',
  'placeholder',
  'cursor',
  'tablets',
  'mobile',
  'printing',
  'lines',
  'block',
  'blocks',
  'blank',
  'blur',
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
const HUES = wordTable(
  /** @type {Record<string, string>} */ ({
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
  }),
);
/** A hue with light, pale or dark before it. */
const SHADED = wordTable(
  /** @type {Record<string, Record<string, string>>} */ ({
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
  }),
);

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
  [/\bdividers?\b/, {on: 'divider'}],
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
 * The part or group a plain word names, as how reads it (`checkboxes` is
 * the checks group, `panels` the containers), or null.
 * @param {string} word
 * @returns {string | null}
 */
export function partForWord(word) {
  const w = String(word ?? '')
    .trim()
    .toLowerCase();
  if (!w) return null;
  for (const [re, hit] of OVERRIDES)
    if (/** @type {RegExp} */ (re).test(w))
      return /** @type {{on: string}} */ (hit).on;
  return null;
}

/**
 * Target names in Core's catalog that are plain words a question uses for
 * something else ("more padding", "align the text").
 */
const NOT_PART_WORDS = new Set([
  'center',
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
      ...Object.keys(HUES).filter(w => w.length >= 5),
      ...[...project.target.keys()]
        .filter(key => !key.includes('-'))
        .flatMap(key => [key, `${key}s`]),
    ]),
  ];
  const lex = {
    parts: [
      ...OVERRIDES,
      ...derived,
      // "smaller labels on form fields": a field's label.
      /** @type {[RegExp, PartRef]} */ ([
        /(?<!\b(?:button|tab|badge|chip|nav|menu|link|checkbox|switch|radio)s? )\b(field |form |input )?labels?\b/,
        {on: 'field-label'},
      ]),
    ],
    vocab,
  };
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
  [
    /\b(press(ed|es)?|click(ed|s)?|tap(ped|s)?(?! targets?)|on press|on click|when i click)\b/,
    'active',
  ],
  [/\b(typing|type in|tab to|tabbing|keyboard focus)\b/, 'focus'],
  [/\b(after i check|once checked|i check)\b/, 'checked'],
  [/\b(picked|chosen|choose|pick)\b/, 'selected'],
  [/\b(invalid|errors? state|has an error|with an error)\b/, 'invalid'],
  [/\bvisited\b/, 'visited'],
  [/\b(opened|expanded)\b/, 'open'],
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
    // "body 16px regular": a weight word after a size.
    /\b\d+(\.\d+)?(px|rem|em|pt) (regular|normal|medium)\b|\b(body|text|headings?) (regular|normal)$/.test(
      c,
    ) ||
    /\bthin(ner)? (body |button |heading |label )?(font|text|type|letters|headings?|labels?|copy)\b/.test(
      c,
    ) ||
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
    /\b(text|font|body|headings?|titles?|labels?|h[1-6])\s+\d+(\.\d+)?(px|rem|em|pt)\b/.test(
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
  // "faster hover transitions", "fade in slower": motion, not opacity.
  if (
    /\b(transitions?|animations?|animate[sd]?|fade[sd]? (in|out)|motion)\b/.test(
      c,
    ) &&
    (/\b(fast(er)?|slow(er)?|quick(er)?|snappier|speed|duration|\d+(\.\d+)?m?s|off|no|none|disable|stop|remove)\b/.test(
      c,
    ) ||
      /\bfade[sd]?[- ](in|out)\b/.test(c))
  ) {
    a.splice(0, a.length);
    add('motion');
    return a;
  }
  if (
    // Washed-out colors are a vibrancy ask, not an opacity one.
    /\b(faded|fade|opacity|see-through|washed out(?! colou?rs?\b))\b/.test(c) ||
    // A percent is an opacity only beside an opacity word, never inside a
    // function or after a color ("#2563eb 0%" is a gradient stop).
    (/\d+%/.test(withoutFunctions(c)) &&
      /\b(transparent|translucent|opaque|alpha|visible)\b/.test(c) &&
      !a.includes('corners'))
  )
    add('opacity');
  if (/\b(scales? (down|up)|shrinks?|grows?|scale\s*:?\s*0?\.\d+)\b/.test(c))
    add('scale');
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
      // "when I tab to a link": the key, not the tab part.
      .replace(/\b(i |we |you )?tab(bing)? (to|through|into)\b/g, ' ')
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
    // "Space Grotesk headings": a font's name is a font, never its words.
    const aspects = aspectsOf(
      text
        .replace(new RegExp(`\\b(${FONT_NAMES})\\b`, 'g'), ' font ')
        .replace(/\bspace (mono|grotesk|grotesque)\b/g, ' font '),
    );
    // "orange not red" negates a color, not the change.
    const hue = Object.keys(HUES).join('|');
    const negText = text.replace(
      new RegExp(
        `\\b(not|no)\\s+((pure|plain|light|dark|pale|off)[\\s-]+)?(${hue})\\b`,
        'g',
      ),
      ' ',
    );
    // "shouldn't links be underlined?": a question that asks for it.
    const askedFor =
      /^(shouldn'?t|wouldn'?t|isn'?t|aren'?t|can'?t|couldn'?t) .*\?$/.test(
        text.trim(),
      ) ||
      (/^(shouldn'?t|wouldn'?t|isn'?t|aren'?t)\b/.test(text.trim()) &&
        /\?/.test(text));
    const neg =
      !askedFor &&
      /\b(no|not|nothing|none of|don'?t|do not|never|avoid|without|remove|removing|get rid of|lose|drop|ditch|nix|scrap|kill|none|shouldn'?t|should not|mustn'?t|turn off|turn (the|it|them) off|switch off|stop|unbold\w*|unround\w*|disable|(?:revert|undo|take back) (?:the|those|that|these|my|our|all)|(?:shadows?|borders?|underlines?|outlines?|gradients?|uppercase|caps) (?:off|out|gone))\b/.test(
        negText
          .replace(/\bdisabled\b/g, ' ')
          // "not round enough" asks for more; "not so much" for less.
          .replace(/\bnot (\w+ ){0,2}enough\b/g, ' ')
          .replace(/\bnot (so|as|that|too) (much|many)\b/g, ' '),
      ) &&
      !/\bno (wait|longer)\b/.test(negText);
    // "too X" asks for less X: too sharp is rounder, too heavy is lighter.
    const tooLess =
      /\btoo (big|large|round|rounded|roundy|bubbly|shadowy|bold|heavy|thick|dark|spacious|airy|bright|loud|strong|harsh|aggressive|intense|garish|saturated|much|wide|tall)\b/;
    const tooMore =
      /\btoo (small|cramped|tight|crowded|faded|light|thin|sharp|square|boxy|pointy|subtle|weak|narrow|dim|low|short)\b/;
    const dir = /\bnot (\w+ ){0,2}enough\b/.test(text)
      ? 'more'
      : /\bnot (so|as|that|too) (much|many)\b/.test(text) || tooLess.test(text)
        ? 'less'
        : tooMore.test(text)
          ? 'more'
          : /\b(less|fewer|smaller|lower|reduce|decrease|shrink|minimi[sz]e|scale down|trim|softer|lighter|lighten|thinner|narrower|shorter|tight(en|er)?|dense(r)?|denser|compact|sharper|squarer|subtler|tone down|dimmer|halve|half|halved|least|minimum|min|minimal|barely|as little)\b|\bcut\b.*\bin half\b|\bx ?0?\.\d+\b|\b(knock|turn|dial|bring|tone)\b.*\bdown\b/.test(
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
      // Only mode phrases: "all day" or "the selected day" is no mode.
      /\bnight (mode|theme)\b|\bat night\b|\boled\b|^dark\s*:/.test(text)
        ? 'dark'
        : /\blight (mode|theme)\b|\bday ?time\b|\bday (mode|theme)\b|\bin the day\b|^light\s*:/.test(
              text,
            )
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
export function namedProperty(text) {
  const props = cssProperties();
  const flat = text.replace(/\u2e34/g, ',');
  for (const m of flat.matchAll(
    /\b((?:border|outline)(?: (?:top|right|bottom|left))? (?:colou?r|width|style)|(?:min|max) (?:height|width)|line height|letter spacing|font (?:size|weight)|radius|[a-z]+(?:-[a-z]+)+|[a-z]+)(\s*:)?\s*/g,
  )) {
    const prop =
      PROPERTY_WORDS[m[1]] ??
      (/^(border|outline)( (top|right|bottom|left))? (colou?r|width|style)$/.test(
        m[1],
      )
        ? m[1].replace(/colour/, 'color').replace(/ /g, '-')
        : m[1]);
    // A property word right after another one ("border width") is part of
    // it, never a property of its own.
    if (
      /\b(border|outline)\s*$/.test(flat.slice(0, m.index ?? 0)) &&
      !m[1].startsWith('border') &&
      m[1] !== 'radius'
    )
      continue;
    if (!props.has(prop)) continue;
    // A plain word ("background", "padding") without a colon is a property
    // only before a value that is typed, not described.
    const plain = !m[2] && !/[- ]/.test(m[1]);
    // Without a colon, only these plain words name a property; others
    // ("inset", "fill") are design words.
    if (plain && !PLAIN_PROPERTIES.has(prop)) continue;
    // "shadow opacity", "border opacity": a layer's alpha, not the part's.
    if (
      prop === 'opacity' &&
      /\b(shadows?|backgrounds?|bg|borders?|outlines?)\s*$/.test(
        flat.slice(0, m.index ?? 0),
      )
    )
      continue;
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
    // "border 0 0 2px": lengths alone on a border are its widths, all kept.
    const lengths = tokens.filter(t => /^(0|\d*\.?\d+(px|rem|em))$/.test(t));
    if (
      /^(border|outline)$/.test(prop) &&
      lengths.length > 1 &&
      lengths.length === tokens.length &&
      matchValue(`${prop}-width`, tokens.join(' '))
    )
      return {prop: `${prop}-width`, value: tokens.join(' ')};
    for (let n = tokens.length; n > 0; n--) {
      const value = tokens
        .slice(0, n)
        .join(' ')
        .replace(/[.;,]+$/, '');
      // A font size of 0 hides the text.
      if (prop === 'font-size' && /^0(px|rem|em)?$/.test(value))
        return {prop, value: '', bad: value};
      if (!value || !matchValue(prop, value)) continue;
      // A value that drops typed words is not the one asked for: "border
      // 0 0 2px" is not "border 0".
      if (n < tokens.length && /^[-.\d#]/.test(tokens[n] ?? '')) break;
      return completeShorthand(prop, value);
    }
  }
  return null;
}

/**
 * A shorthand value made complete, so it does what was asked: a border or
 * outline with no line style draws nothing, and a text-decoration with
 * only a color takes the underline away. Lengths alone are the width, a
 * color alone is the color, and a width with a color gets a solid line.
 * @param {string} prop
 * @param {string} value
 * @returns {{prop: string, value: string}}
 */
function completeShorthand(prop, value) {
  const words = valueWords(value);
  const isLength = (/** @type {string} */ w) =>
    /^(0|-?\d*\.?\d+(px|rem|em|pt)|thin|medium|thick)$/.test(w) ||
    /^(calc|var)\(/.test(w);
  const isColor = (/** @type {string} */ w) =>
    Boolean(parseColor(w)) ||
    /^(var|color-mix|light-dark)\(/.test(w) ||
    w === 'transparent' ||
    w === 'currentcolor';
  const styled = words.some(w =>
    /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset|auto)$/.test(
      w,
    ),
  );
  // "border 0" takes the border away, as typed.
  if (/^(border|outline)$/.test(prop) && value === '0') return {prop, value};
  if (/^(border|outline)(-(top|right|bottom|left))?$/.test(prop) && !styled) {
    if (words.every(isLength))
      return {
        prop:
          prop === 'outline'
            ? 'outline-width'
            : `${prop.replace(/-(top|right|bottom|left)$/, '')}${/-(top|right|bottom|left)$/.test(prop) ? prop.slice(prop.lastIndexOf('-')) : ''}-width`,
        value,
      };
    if (words.every(isColor)) return {prop: `${prop}-color`, value};
    if (words.length === 2 && words.some(isLength) && words.some(isColor)) {
      const len = /** @type {string} */ (words.find(isLength));
      const col = /** @type {string} */ (words.find(isColor));
      return {prop, value: `${len} solid ${col}`};
    }
  }
  if (prop === 'text-decoration' && words.every(isColor))
    return {prop: 'text-decoration-color', value};
  return {prop, value};
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
const PROPERTY_WORDS = wordTable(
  /** @type {Record<string, string>} */ ({
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
  }),
);

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
const RESET_THINGS = wordTable(
  /** @type {Record<string, string[]>} */ ({
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
  }),
);

/** Words for a color the theme generates: the word, its dial, its token. */
const ROLE_DIALS = /** @type {Array<[RegExp, string, string]>} */ ([
  [/\b(accent|brand|primary colou?r)\b/, 'accent', '--color-accent'],
  [/\b(danger|errors?)\b/, 'danger', '--color-error'],
  [/\bsuccess\b/, 'success', '--color-success'],
  [/\bwarnings?\b/, 'warning', '--color-warning'],
  [/\binfo\b/, 'info', '--color-info'],
  [/\b(neutrals?|grays?|greys?)\b/, 'neutral', '--color-neutral'],
]);

/** Number words, longest phrase first. */
const NUMBER_WORDS = wordTable(
  /** @type {Record<string, number>} */ ({
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
    hundred: 100,
  }),
);
const NUMBER_WORDS_RE = new RegExp(
  `\\b(?:(?:one|a) and a half|half an?|an? quarter(?: of an?)?|an? half|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](?:one|two|three|four|five|six|seven|eight|nine)|${Object.keys(NUMBER_WORDS).join('|')})\\b(?=\\s*(?:-|\\s)?\\s*(?:px|pixels?|rem|em|pt|percent|%|radius|corners?|line height|times|x\\b|\\w+ (?:tall|wide|thick)|tall|wide|thick))`,
  'gi',
);
/** A number phrase as digits. @param {string} m */
function numberWord(m) {
  const w = m.toLowerCase().replace(/-/g, ' ');
  if (/and a half/.test(w)) return '1.5';
  if (/^(half|a half|an half)/.test(w)) return '0.5';
  if (/quarter/.test(w)) return '0.25';
  return String(w.split(' ').reduce((n, x) => n + (NUMBER_WORDS[x] ?? 0), 0));
}

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
  // "corners NaNpx": not a number; never a guess. After a CSS property the
  // property's own check says why.
  const notNumber = /\b(nan|-?infinity)(px|rem|em|%)?(?![a-z])/i.exec(question);
  const afterProperty = notNumber
    ? cssProperties().has(
        (
          /([a-z-]+)\s*:?\s*$/i.exec(question.slice(0, notNumber.index))?.[1] ??
          ''
        ).toLowerCase(),
      )
    : false;
  if (notNumber && !afterProperty)
    return {
      parts: [],
      aspects: [],
      drafts: [
        {
          text: `${notNumber[0]} is not a number a theme can use; give a number, like 8px`,
          options: [],
        },
      ],
    };
  // Sarcasm and dislike name the thing to drop: "enough with the shadows",
  // "nobody asked for borders", "who needs X", "shadows 👎".
  question = question
    .replace(/\b([a-z]+) (?:👎|❌)/gi, 'no $1')
    .replace(/(?:👎|❌)\s*([a-z]+)/gi, 'no $1')
    .replace(
      /\b(?:enough with|quit with|nobody asked for|no one asked for|who needs|get rid of all|(?:i )?loathe) (?:the |all the |these |those )?/gi,
      'no ',
    )
    .replace(/^\s*([a-z][a-z -]*?)\s*(?:👎|:-?\(|:thumbsdown:)\s*$/i, 'no $1')
    // "too dark, I hate it": the description is the ask.
    .replace(
      /[,.;!]?\s*(?:i )?(?:hate|dislike|can'?t stand) (?:it|this|that)\b[.!]*/gi,
      '',
    );
  // The gate works per clause: a clause that is a question, a "tell me",
  // a "stop …" or a "don't touch …" blocks only itself; the other clauses
  // are read, with the parts the blocked clause names.
  const GATE =
    /\b(tell me|explain|what does|how does|but not too|stop (making|turning|being|using)|don'?t (touch|change)(?! (the )?(dark|light) mode)|leave (?!(?:the )?(?:dark|light) mode)[a-z ]+ alone|who made|just what i wanted|eyes hurt|is a great)\b|^\s*(yeah|oh sure|sure|great|wow)\b|,\s*nice[.!]*\s*$/i;
  const QUESTION_CLAUSE =
    /^\s*(?!(?:can|could|would|will) you\b|why (?:are|is|aren'?t|isn'?t)\b[^?]*\bnot\b|why not\b|why don'?t (?:we|you)\b|what about\b|what if\b|how about\b|is it possible\b|is there a way\b|can we\b|could we\b)(what|whats|what's|which|why|where|who|when|is|are|does|do|did|can|could|should|will)\b[^?]*\?+!*\s*$|^\s*(?!why not\b|why don'?t (?:we|you)\b|what about\b|what if\b|why (?:are|is|aren'?t|isn'?t)\b[^?]*\bnot\b)(what|whats|what's|which|why|where)\b|^\s*(?!is it possible\b|is there a way\b)(are|is|does|did|would|should) (my|the|it|this|these|those|our|there|a|an|square|round|rounder|bigger|smaller|darker|lighter)\b/i;
  // "if you can", "if possible": politeness, not a condition. "no fewer
  // than 2px": a limit, the number.
  question = question
    .replace(
      /\b(?:if (?:you can|possible|you could|you don'?t mind|it'?s not too much trouble|it is not too much trouble)|when you get a chance)\b[,]?\s*/gi,
      '',
    )
    .replace(/\bno (?:less|fewer) than\s+(?=\d)/gi, '');
  // "dark page #0b0b0f", "dark.page=#…", "dark page: #…": the mode word
  // scopes the color. "dark mode only: accent #…" is that mode, not a
  // dark-only theme. Vocabulary that names a direction: nuke/kill/zap =
  // remove, sharpen = sharper, zero out = 0, flatten = flat, X++ / X-- =
  // more / less X, "X: off|none" = no X.
  question = question
    .replace(
      /\b(dark|light)[. ](page|background|body)( colou?r)?\s*[:=]?\s*(#[0-9a-f]{3,8})\b/gi,
      '$2 $4 in $1 mode',
    )
    .replace(/^\s*(dark|light) mode only\s*:\s*/i, 'in $1 mode: ')
    // "I need: 1. accent red 2. pill badges": inline list numbers are breaks,
    // not values.
    .replace(/(?:^|\s)\d{1,2}[.)]\s+(?=[a-z#])/gi, m =>
      (question.match(/(?:^|\s)\d{1,2}[.)]\s+[a-z#]/gi) ?? []).length >= 2
        ? '; '
        : m,
    )
    // "only when dark mode is on", "except in dark mode": the mode itself.
    .replace(
      /\b(?:only )?(?:when|while|whenever) (?:the )?(dark|light) mode is (?:on|active|enabled|used)\b/gi,
      'in $1 mode',
    )
    .replace(
      /\b(?:except|but not|not) (?:in |for |on )?dark(?: mode| theme)?\b(?! enough\b)|\b(?:don'?t|do not) (?:touch|change) (?:the )?dark mode\b|\b(?:leave|keep) (?:the )?dark mode (?:alone|as it is|as is|untouched)\b/gi,
      'in light mode',
    )
    .replace(
      /\b(?:except|but not|not) (?:in |for |on )?light(?: mode| theme)?\b(?! enough\b)|\b(?:don'?t|do not) (?:touch|change) (?:the )?light mode\b|\b(?:leave|keep) (?:the )?light mode (?:alone|as it is|as is|untouched)\b/gi,
      'in dark mode',
    )
    // Removal words in other languages and 🚫: none of it.
    .replace(/(?:🚫|⛔)\s*/gu, 'no ')
    .replace(
      /\b(?:rimuovi|togli|elimina|entferne|quita|retire)\b\s*(?:l'|la |le |il |lo |el |los |las |o |a |os |as |die |der |das |den )?/gi,
      'no ',
    )
    .replace(
      /\b(?:sans|sin|sem|ohne)\s+(?=(?:l'|la |le |el |o |a |den )?(?:ombres?|bordures?|sombras?|bordes?|bordas?|schatten|rand)\b)/gi,
      'no ',
    )
    // "those dialog shadows are heavy": too heavy, so lighter.
    .replace(
      /\b(?:are|is|look|looks|seem|seems) (?:so |very |way |kinda |pretty |quite )?(heavy|strong|harsh|loud|thick|dark|bright)\b/gi,
      'too $1',
    )
    .replace(/\b(dark|light)mode\b/gi, '$1 mode')
    .replace(/\b(?:nuke|kill|zap|axe)\b/gi, 'remove')
    .replace(
      /\bsharpen (?:the |all the |every |all )?([a-z]+)/gi,
      'make the $1 sharper',
    )
    .replace(/\bzero out (?:the )?([a-z ]+?)(?=$|[,;.])/gi, '$1 0')
    .replace(/\bflatten (?:the )?([a-z]+)/gi, 'make the $1 flat')
    .replace(/\b([a-z][a-z -]*?)\s*\+\+/gi, 'more $1')
    .replace(/\b([a-z][a-z -]*?)\s*--(?![a-z])/gi, 'less $1')
    .replace(/\b([a-z][a-z -]*?)\s*[:=]\s*(?:off|none|no)\b/gi, 'no $1');
  const segments = question
    .split(
      /\s*(?:,(?![^(]*\))|[;\n|]|\s[/+]\s(?![^(]*\))|\.{2,}|[.?!](?=\s)|\bjust\b|\bthen\b|\s[-\u2013\u2014]\s|\bstep \d+\b|\bbut\b(?= (?:make|set|change|use|give|turn|remove|add)\b)|(?<=\S)(?<!\b(?:don'?t|never|do not|not|to|please|and|you|we|i|let'?s|can|could|would|will))\s+(?=(?:make|set|change|give|turn) (?:it|them|the|my|this|that|those|these)\b)|(?<=\S)\s+(?=(?:do|does|will) \w+ (?:follow|match)\b))\s*/i,
    )
    .map(x => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''))
    .filter(x => x.trim());
  // "drop shadow: x 0, y 4, …", "card shadow: 0 1px …, 0 2px …": a label
  // with its value is one clause, commas and all.
  if (
    /^\s*[a-z][\w -]{0,30}:\s*[^?]*$/i.test(question) &&
    !/\n/.test(question) &&
    !/;/.test(question)
  )
    segments.splice(0, segments.length, question);
  // A clause writes only when it reads as a direct ask: an imperative, a
  // request, or a thing with a value or a direction; a condition, an
  // indirect question, a double negative or a statement of fact gets the
  // lookup instead. A wrong write is worse than no command.
  const CONDITION =
    /^\s*(?:if|unless|in case|provided|providing|only if|assuming|suppose|supposing|as long as|whenever|as soon as|once|given|in the event|should (?:the|it|they)|were (?:the|it|they)|otherwise|on condition)\b|\b(?:except if|on condition that|in the event)\b/i;
  const NOT_ASK =
    /\b(i wonder|wondering|curious|would like to know|let me see|help me understand|any idea|just checking|just asking|check if|check whether|can you check|look at|double check|idk|quick q|do you think)\b|\b(don'?t not|not without|not un-?(?:bold|round|rounded|flat|square|styled)\w*|never no|no lighter|no darker|not at all|isn'?t it time|weren'?t)\b|^\s*(?!(?:can|could|would|will) (?:you|i|we)\b|can (?:the|my|our|all) [\w -]+ be\b|is it possible\b|is there a way\b)(?:do|does|did|will|would|can(?!'t|not)|could|should|is|are)\b(?!n'?t)|^\s*checking\b|\bno less (?!than)|^\s*(would|could|should|does|do|is|are|will)\b[^.]*\b(work|look|be (?:a )?(?:good|better|too much|ok|okay)|good|better|accessible|clash|too much)\b[^.]*\??$|\bor\b[^.]*\?\s*$|^\s*how (?:would|round|big|dark|light|thick)\b|\b(right now|rn)\b(?!.*\b(make|set|change)\b)/i;
  const ASK_START =
    /^\s*(?:please |pls |ok,? |okay,? |also |and |now |so |anyway,? )*(?:make|set|change|use|give|turn|add|remove|increase|decrease|lighten|darken|round|square|put|switch|swap|replace|drop|ditch|kill|hide|bump|reduce|raise|lower|tighten|loosen|shrink|grow|enlarge|boost|soften|sharpen|undo|revert|reset|restore|bring|go|keep|let'?s|try|apply|get rid|take|knock|cut|paint|colou?r|fill|flatten|thicken|widen|narrow|underline|bold|unbold|uppercase|lowercase|no|without|stop|don'?t|never|avoid|less|more|bigger|smaller|rounder|sharper|darker|lighter|softer|bolder|thinner|thicker|wider|tighter|looser)\b|^\s*(?:can|could|would|will) (?:you|i|we)\b|^\s*can (?:the|my|our|all) [\w -]+ be\b|^\s*(?:i|we) (?:want|need|'d like|would like)\b|^\s*(?:i'd|id) like\b|^\s*please\b/i;
  // Strict: a clause writes only when it positively reads as an ask:
  // (a) an imperative from a closed verb list, after an optional politeness
  // prefix; (b) an assignment of a known thing ("<thing> <value>",
  // "<thing>: <value>"); (c) a bare comparative or style word with a part
  // ("rounder buttons", "serif headings"). Anything else is held back.
  const VETO =
    /^(?:don'?t|doesn'?t|isn'?t|aren'?t|won'?t|wouldn'?t|can'?t|shouldn'?t)\s+(?:the |my |our )?[a-z]+\s+(?:get|have|use|look|be|need|seem)\b|\b(no idea|who knows|not sure|no reason not|can'?t not|isn'?t wrong|not unlike|not never|wouldn'?t say no|can'?t say|it'?s not that|nobody said|hardly|imagine|picture|pretend|hypothetically|in theory|one day|might|toying|consider|someday|maybe|perhaps)\b|\b(?:don'?t|never|no)\b[^,;.]*\bnot\b|\bnever without\b/i;
  const POLITE =
    /^\s*(?:(?:please|pls|kindly|ok(?:ay)?|also|and|now|so|anyway|alright|hey|hi|then)[,\s]+|(?:can|could|would|will) (?:you|we|i) (?:please )?|i'?d like (?:you )?to |i'?d like |i (?:want|need|prefer) (?:you )?(?:to )?|we'?d (?:like|prefer) |we (?:want|need|prefer) |hoping for |my request is |let'?s (?:go with )?|lets (?:go with )?|how (?:about|'bout) |what about |why not |why don'?t we (?:go with )?|go ahead and |mind making |you'?d better |you can |you forgot to |only |just |everything |lol |umm+ |ugh,? |quick one:? |(?:way|much|much much|slightly|a bit|a little|a smidge|just slightly|even|super|really|very) |when (?:hovering|hovered|pressed|clicked|focused|i hover|i click|i tab to)(?: (?:on|over|a|an|the) [a-z]+)? |(?:the |our |my )?(?:designer|pm|client|boss|users?|marketing|legal|design spec|style guide|mockup|brand) (?:wants?|needs?|requires?|prefers?|asked for|said:?|says:?) |please and thank you:? |thank you:? |thanks:? |in (?:dark|light) mode[:,]?\s*|(?:dark|light) mode[:,]\s*)+/i;
  const VERB =
    /^(?:crank up|fix|make|set|change|use|turn|add|remove|drop|kill|increase|decrease|raise|lower|lighten|darken|round|sharpen|square|flatten|soften|tighten|loosen|beef up|bump|boost|tone down|thicken|thin|bold|unbold|underline|hide|put|switch|swap|replace|ditch|reduce|shrink|trim|minimi[sz]e|scale down|grow|enlarge|widen|narrow|paint|colou?r|fill|undo|revert|reset|restore|bring|go back|keep|apply|try|get rid|take|knock|cut|stop|don'?t|do not|never|avoid|no|without|scale|move|space|pad|center|align|uppercase|lowercase|italicize|enable|disable|switch)\b/i;
  const THING =
    /^(?:the |my |our |all |every |all the )?(?:--[a-z][\w-]*|accent|brand|primary|secondary|danger|success|warning|info|corners?|radius|border-radius|spacing|padding|gap|margin|density|headings?|titles?|text(?:-size)?|font(?:s|-size|-family|-weight)?|body|page|background|bg|vibrancy|shadows?|borders?|outlines?|underlines?|links?|mode|leading|line[- ]height|letter[- ]spacing|tracking|weight|focus(?: ring| outline)?|colou?rs?)\b/i;
  const STYLE =
    /^(?:muted|pastel|subdued|duller|vivid|saturated|desaturated|vibrant|\d+(?:\.\d+)?(?:px|rem|em|%)?|underlined?|more|less|extra|rounder|sharper|squarer|square|round(?:ed)?|pill|flat|serif|sans(?:-serif)?|mono(?:space)?|bold(?:er)?|italic|uppercase|lowercase|compact|roomy|dense|airy|tight(?:er)?|loose(?:r)?|wide(?:r)?|thin(?:ner)?|thick(?:er)?|big(?:ger)?|small(?:er)?|large(?:r)?|tiny|huge|dark(?:er)?|light(?:er)?|bright(?:er)?|soft(?:er)?|heav(?:y|ier)|no|without|#[0-9a-f]{3,8}|red|orange|yellow|green|teal|cyan|blue|indigo|purple|violet|pink|rose|gray|grey|black|white|navy|crimson|maroon)\b/i;
  const COPULA =
    /\b(is|are|was|were|has|have|had|isn'?t|aren'?t|doesn'?t|did|does|truly)\b|\?/i;
  // Clauses that only scope or give a value ("in dark mode", "on hover",
  // "4px", "at least 44px") join the ask next to them.
  const NEUTRAL =
    /^\s*(?:below|above|under|over)\s+\d+(?:px|em|rem)\s*$|^\s*(?:on|for) (?:mobile|phones?|tablets?|desktops?|print)\s*$|^\s*when printing\s*$|^\s*(?:(?:in|on) (?:the )?(?:dark|light) mode )?#[0-9a-f]{3,8}(?: in (?:dark|light)(?: mode)?)?\s*$|^\s*(?:leave|keep) (?:the )?(?:dark|light) mode (?:alone|as is|as it is|untouched)\s*$|^\s*(?:only |just )?(?:(?:in|on|for|when|while) )?(?:(?:the )?(?:dark|light) mode|hover(?:ed|ing)?|focus(?:ed)?|press(?:ed)?|click(?:ed)?|selected|checked|disabled)(?: only)?\s*$|^\s*(?:at (?:least|most) |about |around |roughly |maybe )?(?:-?\d*\.?\d+(?:px|rem|em|%|ms|s)?|#[0-9a-f]{3,8})\s*$/i;
  const isAsk = (/** @type {string} */ x) => {
    if (NEUTRAL.test(x)) return true;
    // A bare CSS value ("0 8px 10px -6px rgb(0 0 0 / 0.1)") continues the
    // clause before it.
    const bare = x.replace(
      /^\s*(?:like|e\.?g\.?|say|maybe|about|around|roughly)\s+/i,
      '',
    );
    if (
      /\d/.test(bare) &&
      !/[a-z]{3,}/i.test(
        bare.replace(
          /\b(?:px|rem|em|rgba?|hsla?|oklch|oklab|var|calc|inset)\b|\([^)]*\)/gi,
          '',
        ),
      )
    )
      return true;
    const low = x.toLowerCase().trim();
    // "card shadow: 0 1px 3px …", "Airbnb: accent #ff385c": a label and its
    // value; "setRadius(4)"; "shouldn't links be underlined?"; a question in
    // another language the editor translates.
    if (
      /^([a-z][\w -]{0,30}):\s*\S/.test(low) &&
      !/^(?:just )?(?:checking|question|quick q|q|fyi|todo|note|changes)\s*:|:\s*(?:are|is|do|does|what|which|how|why)\b/.test(
        low,
      ) &&
      !NOT_ASK.test(low) &&
      !CONDITION.test(low) &&
      !VETO.test(low) &&
      !/\?\s*$/.test(low)
    )
      return true;
    if (/^set[a-z]*\(|^shouldn'?t\b[^?]*\?\s*$/.test(low)) return true;
    // "I set the accent to red by mistake", "does nothing visible".
    if (
      /\b(by mistake|by accident|accidentally|does nothing|do nothing)\b/.test(
        low,
      )
    )
      return true;
    if (
      /\b(schatten|karten|ecken|knöpfe|entfernen|pulsanti|arrotondat\w*|ombra|ombre|bordure|cartes|esquinas|redond\w*|botones|boutons|arrondi\w*|rouges?|bleus?|verts?|sombra|couleur|tarjetas|espacio|angoli|cantos|botões)\b/.test(
        low,
      )
    )
      return true;
    // "I hate the shadows", "I can barely see the borders", "the client
    // wants …": a wish or a complaint about a named thing.
    if (
      /^(?:i|we|they|the client|the designer|stakeholders?|users?|the night shift)\b[^?]*\b(hate|want|wants|need|needs|like|prefer|barely see|can'?t see|think|wish)\b(?! to know)/.test(
        low,
      ) &&
      !VETO.test(low) &&
      !CONDITION.test(low) &&
      (aspectsOf(low).length > 0 ||
        lex.parts.some(([re]) => re.test(low)) ||
        /#[0-9a-f]{3,8}|\b(accent|colou?r|brand|grays?|font|purple|blue|red|green|orange|teal|pink|navy|black|white|yellow|violet)\b/.test(
          low,
        ))
    )
      return true;
    // Typos are read as the words they are near ("accnet" is accent).
    const t0 = x
      .toLowerCase()
      .trim()
      .replace(/[a-z]+/g, w => corrected(w, lex.vocab));
    // "our brand color is #0055ff": a value given for the brand; pasted CSS
    // ("html.dark .card { … }"); "X should be/look Y".
    if (
      /^(?:our|my|the) brand colou?r is #[0-9a-f]{3,8}\b|\{[^}]*:|\bshould (?:be|look|have|get|use|match|feel)\b(?![^?]*\?)/.test(
        t0,
      ) &&
      !CONDITION.test(t0) &&
      !VETO.test(t0)
    )
      return true;
    const raw = x.toLowerCase();
    if (
      [t0, raw].some(v => CONDITION.test(v) || NOT_ASK.test(v) || VETO.test(v))
    )
      return false;
    // Questions in a script how cannot read word by word keep their ask.
    if (/[^ -~]/.test(t0.replace(/[\u{1F000}-\u{1FFFF}\u2000-\u2BFF]/gu, '')))
      return true;
    if (
      VERB.test(
        raw
          .replace(POLITE, '')
          .replace(/^(?:the|my|our|all|every|a|an)\s+/, '')
          .trim(),
      )
    )
      return true;
    const t = t0
      .replace(POLITE, '')
      .replace(
        /^(?:the|my|our|all|every|all the|a|an|those|these|this|that)\s+/,
        '',
      )
      .trim();
    // "could the buttons be rounder", "can I get a serif font".
    if (
      /^(?:can|could) (?:the|my|our|all) [\w -]+ be\b|^(?:can|could) i (?:get|have)\b/.test(
        t0,
      )
    )
      return true;
    if (VERB.test(t)) return true;
    // "give buttons 8px corners": give a thing a value; "give me …" asks.
    if (/^give (?!me\b|us\b)/.test(t)) return true;
    const short = t.split(/\s+/).length <= 7;
    const part = lex.parts.some(([re]) => re.exec(t)?.index === 0);
    if ((THING.test(t) || part) && short && !COPULA.test(t)) return true;
    if (
      STYLE.test(t) &&
      short &&
      !COPULA.test(t) &&
      (THING.test(t.replace(STYLE, '').trim()) ||
        lex.parts.some(([re]) => re.test(t)) ||
        /\b(corners?|spacing|padding|shadows?|borders?|accent|headings?|text|font|page|background|colou?rs?|colou?rful|pastel|muted|subdued|vivid|saturated|washed out)\b/.test(
          t,
        ))
    )
      return true;
    // "why are my headings not bold", "I hate the purple": asks.
    if (/^why (?:are|is|aren'?t|isn'?t)\b.*\bnot\b/.test(t)) return true;
    if (/^(?:i )?(?:hate|dislike|(?:am )?not a fan of|don'?t like)\b/.test(t))
      return true;
    // A description of the look wanted ("stronger shadow on dialogs",
    // "headings are 600 weight", "the page is white") names a thing and asks
    // nothing back: an ask. An info request ("show me …") is a lookup.
    if (
      !/\?|\b(isn'?t|aren'?t|doesn'?t|don'?t|won'?t|wouldn'?t|did|does|was|were|could|might|should)\b/.test(
        t,
      ) &&
      !/^(?:i|we|you|it|this|that|there|they|(?:show|give|tell|remind|walk) (?:me|us))\b/.test(
        t,
      ) &&
      (aspectsOf(t).length > 0 ||
        lex.parts.some(([re]) => re.test(t)) ||
        /\b(accent|contrast|neutrals?|grays?|greys?|colou?rs?|font|fonts|everywhere|error|danger|success|warning|info|purple|blue|red|green|orange|teal|pink|navy|black|white|yellow|violet)\b/.test(
          t,
        ))
    )
      return true;
    return false;
  };
  // "don't touch the buttons", "leave the corners": an exclusion. It writes
  // nothing, and it gives nothing to the clause after it.
  const EXCLUDE =
    /^\s*(?:don'?t (?:touch|change)|do not (?:touch|change)|leave(?! (?:the )?(?:dark|light) mode\b)|keep (?:the )?[\w -]+ (?:alone|as is|as it is|unchanged|untouched|the same))\b/i;
  const blocked = (/** @type {string} */ x) =>
    EXCLUDE.test(x) ||
    (!/^\s*(?:please )?(?:can|could) (?:the|my|our|all) [\w -]+ be\b|^\s*(?:can|could) i (?:get|have)\b/i.test(
      x,
    ) &&
      (GATE.test(x) ||
        (QUESTION_CLAUSE.test(x) && !ASK_START.test(x.toLowerCase())) ||
        !isAsk(x)));
  const gated = segments.filter(blocked);
  // A condition holds back the whole question: the ask depends on it.
  // Sarcasm makes every clause unsure, not only the one with the marker.
  const SARCASM =
    /^\s*(yeah|oh sure|sure|great|wow|oh great|brilliant|perfect|cool cool|amazing|thrilled|nothing says)\b|\bjust what i wanted\b|,\s*nice[.!]*\s*$|\bis a great\b|\bsaid no one\b|\btruly\b|🙃/iu;
  // A hypothetical anywhere makes every clause one.
  const HYPOTHETICAL =
    /\b(imagine|picture|pretend|hypothetically|in theory|toying with)\b/i;
  // A tag question ("corners are 10px, eh", "cards have a shadow, right?")
  // asks back about the whole line.
  const TAG =
    /^(?:eh|right|correct|yeah|huh|no|isn'?t it|aren'?t they|are they|is it|are we|do they|does it|ok|okay)\s*[?!.]*$/i;
  const gateAll =
    segments.some(x => TAG.test(x.trim())) ||
    SARCASM.test(question) ||
    HYPOTHETICAL.test(question) ||
    (gated.length > 0 && gated.length === segments.length) ||
    segments.some(x => CONDITION.test(x.replace(/^[^:]*:\s*/, '')));
  if (gated.length && !gateAll) {
    // A held-back clause gives the next clause what it names: its part, and
    // the thing a "them" or "it" there stands for.
    /** @type {string[]} */
    const kept = [];
    let carry = '';
    let carryPart = '';
    for (const x of segments) {
      if (gated.includes(x) && EXCLUDE.test(x)) {
        carry = '';
        carryPart = '';
        continue;
      }
      if (gated.includes(x)) {
        const part = [
          ...lex.parts.map(([re]) => re.exec(x.toLowerCase())?.[0]),
          /\b(accent|brand|primary|secondary|danger|success|warning|info)\b/i.exec(
            x,
          )?.[0],
        ].find(Boolean);
        const thing =
          /\b(borders?|shadows?|radius|corners|padding|spacing|gap|font|underlines?|background)\b/i.exec(
            x,
          )?.[0];
        carry = [part, thing].filter(Boolean).join(' ');
        carryPart = part ?? '';
        continue;
      }
      if (carry && /\b(them|it)\b/i.test(x))
        kept.push(x.replace(/\b(them|it)\b/i, carry));
      else if (carryPart) kept.push(carryPart, x);
      else kept.push(x);
      carry = '';
      carryPart = '';
    }
    if (carryPart) kept.push(carryPart);
    question = kept.filter(Boolean).join(', ');
  }
  /** Family names written in quotes, kept as typed: qq<n>qq in the text. */
  const quoted = /** @type {string[]} */ ([]);
  let q = question
    .normalize('NFKC')
    // "more muted", "pastel", "duller", "subdued": less vivid colors (free
    // words only: never inside a token name like --color-background-muted).
    .replace(
      /(?<![-\w])less (?:muted|pastel|dull|subdued)(?![-\w])/gi,
      'more saturated',
    )
    .replace(
      /(?<![-\w])(?:more )?(?:muted|pastel|duller|subdued|desaturated)(?![-\w])/gi,
      'less saturated',
    )
    // "less light", "less heavy", "less tight", "less thin": one step back on
    // the same aspect.
    .replace(
      /\bless (?:light|thin|skinny)\b(?= (?:headings?|titles?|text|fonts?|weight)|\s*$)/gi,
      'bolder',
    )
    .replace(
      /\b(headings?|titles?|text|fonts?) (?:a bit |slightly )?less (?:light|thin)\b/gi,
      '$1 bolder',
    )
    .replace(/\bless heavy\b/gi, 'less bold')
    .replace(/\bless tight\b/gi, 'wider letter spacing')
    // "too dark" asks for lighter, "too light" for darker.
    .replace(/\btoo dark\b(?! mode)/gi, 'lighter')
    .replace(/\btoo light(?: gray| grey)?\b(?! mode)/gi, 'darker')
    // "no big gaps": less room.
    .replace(
      /\bno (?:big|large|huge) (?:gaps|spaces|spacing)\b/gi,
      'less spacing',
    )
    // "too airy", "headings too thin", "not bright enough": the other way.
    .replace(
      /\btoo (airy|spacious|roomy|loose|spread out)\b/gi,
      'tighter spacing',
    )
    .replace(
      /\b(headings?|titles?|fonts?) (?:are |is |look |looks )?too (thin|light|weak)\b|\b(text|labels?) (?:are |is |looks? )?too (thin)\b/gi,
      (_, a, _b, t) => `${a ?? t} bolder`,
    )
    .replace(
      /\bnot (bright|dark|bold|round|big|light|soft|warm|cool) enough\b/gi,
      (_, w) =>
        `${{bright: 'brighter', dark: 'darker', bold: 'bolder', round: 'rounder', big: 'bigger', light: 'lighter', soft: 'softer', warm: 'warmer', cool: 'cooler'}[/** @type {'bright'} */ (w.toLowerCase())]}`,
    )
    // "change only light to violet": light mode, not a light-only theme.
    .replace(
      /\b(?:change |set |make )?only (light|dark)(?: mode)? (?=to\b)/gi,
      'in $1 mode change ',
    )
    // "links not underlined until hover": none, then underlined on hover.
    .replace(
      /\b([a-z]+) (?:are |is )?not underlined until (?:you )?hover\w*/gi,
      '$1 no underline; $1 underlined on hover',
    )
    // "3 pixels sharper": pixels are px.
    .replace(/(\d+(?:\.\d+)?)\s*pixels?\b/gi, '$1px')
    // "take 2px off", "remove 4px from": an amount down.
    .replace(
      /\b(?:take|knock|shave|cut)\s+(\d+(?:\.\d+)?(?:px|rem|em))\s+off\b/gi,
      'minus $1 off',
    )
    .replace(
      /\bremove\s+(\d+(?:\.\d+)?(?:px|rem|em))\s+(?=from\b)/gi,
      'minus $1 ',
    )
    // "darkmode", "html.dark .card", "@media (prefers-color-scheme: dark)".
    .replace(/\b(dark|light)mode\b/gi, '$1 mode')
    .replace(
      /@media\s*\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)\s*\{/gi,
      'in $1 mode {',
    )
    .replace(
      /(?:\bhtml)?\.(dark|light)\s+(?=\.)|\[data-(?:theme|mode)=["']?(dark|light)["']?\]\s*/gi,
      (_, a, b) => `in ${a ?? b} mode `,
    )
    // "I hate the shadows", "skip the shadows", "not a fan of": none of it.
    // "I hate the shadows", "not a fan of the rounded buttons": none of it,
    // when that is the whole ask.
    .replace(
      /^\s*(?:i )?(?:hate|dislike|can'?t stand|don'?t like|am not a fan of|not a fan of|skip|ditch)(?: the)? ([^,.;?!]+?)[.!]?\s*$/i,
      'no $1',
    )
    // "pointer cursor on hover": the cursor, no state needed.
    .replace(
      /\bpointer cursor(?: on hover)?\b|\bcursor:?\s+pointer(?: on hover)?\b/gi,
      'cursor: pointer',
    )
    // "cards look flat": a complaint that asks for depth.
    .replace(
      /\b(look|looks|feel|feels|seem|seems) (?:too |so |very )?flat\b(?!.*\bshadow)/gi,
      'need more shadow',
    )
    // "darker while being clicked": the pressed state.
    .replace(
      /\b(darker|lighter) while being (clicked|pressed|tapped)\b/gi,
      'get $1 when clicked',
    )
    // "except in dark mode", "but not in dark mode", "leave dark mode alone":
    // the other mode.
    .replace(
      /\b(?:except|but not|not) (?:in |for |on )?dark(?: mode| theme)?\b(?! enough\b)|\b(?:leave|keep) dark mode (?:alone|as it is|as is|untouched)\b|\bdon'?t (?:touch|change) dark mode\b/gi,
      'in light mode',
    )
    .replace(
      /\b(?:except|but not|not) (?:in |for |on )?light(?: mode| theme)?\b(?! enough\b)|\b(?:leave|keep) light mode (?:alone|as it is|as is|untouched)\b|\bdon'?t (?:touch|change) light mode\b/gi,
      'in dark mode',
    )
    // "not pure black": a near-black; "not pure white": a near-white.
    .replace(/\bnot (?:pure |true |full )?black\b/gi, '#111111')
    .replace(/\bnot (?:pure |true |full )?white\b/gi, '#fafafa')
    // "dropdown shadow": the dropdown's menu, the part that floats.
    .replace(/\bdropdowns? (?=shadows?|elevation)/gi, 'dropdown-menu ')
    // "½rem": a fraction is a number.
    .replace(/(\d*)(?:½|1\u20442)/g, (_, n) => `${n ? Number(n) + 0.5 : '0.5'}`)
    .replace(
      /(\d*)(?:¼|1\u20444)/g,
      (_, n) => `${n ? Number(n) + 0.25 : '0.25'}`,
    )
    .replace(
      /(\d*)(?:¾|3\u20444)/g,
      (_, n) => `${n ? Number(n) + 0.75 : '0.75'}`,
    )
    // "radius sm", "setRadius(4)": the corner rungs and a number.
    .replace(/\bset-?radius\s*\(\s*(\d+(?:\.\d+)?)\s*\)/gi, 'corners $1px')
    .replace(
      /\b(?:radius|corners|rounded)[- ](xs|sm|md|lg|xl)\b/gi,
      (_, /** @type {string} */ r) =>
        `corners ${/** @type {Record<string, string>} */ ({xs: '4px', sm: '8px', md: '10px', lg: '12px', xl: '16px'})[r.toLowerCase()]}`,
    )
    // "midnight blue": the CSS named color.
    .replace(/\b([a-z]+) ([a-z]+)\b/gi, (m, a, b) =>
      COLOR_NAMES.includes(`${a}${b}`.toLowerCase()) &&
      !/^(dark|light)$/i.test(a)
        ? `${a}${b}`.toLowerCase()
        : m,
    )
    // "translateY(-2px) on hover": a transform.
    .replace(
      /(?<!transform\s*:?\s*)\b((?:translate[xyz]?|scale[xy]?|rotate)\([^)]*\))/gi,
      (_, fn) => `transform: ${fn.toLowerCase()}`,
    )
    // "#22c55e in light, #4ade80 in dark": the accent, per mode.
    .replace(
      /^\s*(#[0-9a-f]{3,8}) in (light|dark)(?: mode)?\s*(,|and|;)\s*(#[0-9a-f]{3,8}) in (light|dark)(?: mode)?\s*$/i,
      'accent $1 in $2 mode$3 accent $4 in $5 mode',
    )
    // ".btn-primary { … }": the primary button.
    .replace(
      /\.btn-(primary|secondary|ghost|destructive|danger)\b/g,
      (_, v) => `${v === 'danger' ? 'destructive' : v} button `,
    )
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
    // "no more than 2px": a limit, the number itself.
    .replace(/\b(?:no|not) more than\s+|\bat most\s+|\bmax(?:imum)? of\s+/g, '')
    // Numbers written as words are numbers.
    .replace(NUMBER_WORDS_RE, m => numberWord(m))
    // "less black", "not so white": a direction away from that color.
    .replace(
      /\b(?:slightly |a bit |a little )?(?:less|not so|not as) (black|dark)\b/g,
      'lighter',
    )
    .replace(
      /\b(?:slightly |a bit |a little )?(?:less|not so|not as) (white|bright)\b/g,
      'dimmer',
    )
    // "8 or so px", "about 8 px": the number.
    .replace(/\b(\d+(?:\.\d+)?)\s+or so\s+(?=px|rem|em|pixels?)/g, '$1 ')
    // "0.5 rem", "14 px": a number and its unit are one length.
    .replace(/\b(\d+(?:\.\d+)?)\s+(px|rem|em|pt|vh|vw|ch)\b/gi, '$1$2')
    // Typography words for the properties they name.
    .replace(
      /\btabular (numbers|numerals|figures|nums)\b/g,
      'font-variant-numeric: tabular-nums',
    )
    .replace(
      /\bbalance (?:the )?(?:(\w+) )?(?:line breaks|lines|wrapping)\b/g,
      '$1 text-wrap: balance',
    )
    // "hover does nothing visible": the effect is too subtle.
    .replace(
      /\b(?:does|do) nothing(?: visible)?\b|\bnothing happens\b/g,
      'is too subtle',
    )
    // "I can barely see the borders": too faint.
    .replace(
      /\b(?:i )?(?:can )?(?:barely|hardly) see (?:the )?(\w+)/g,
      '$1 too faint',
    )
    // "11pt": points as pixels (a point is 4/3 of a pixel).
    .replace(
      /\b(\d+(?:\.\d+)?)pt\b/gi,
      (_, n) => `${Math.round((Number(n) * 4) / 3)}px`,
    )
    // "a 1px border instead of a shadow": no shadow, and the border.
    .replace(
      /^(.*?)\binstead of (?:a |an |the )?([a-z]+(?: [a-z]+)?)\b/gim,
      (m, a, b) => (a.trim() ? `no ${b} ; ${a}` : m),
    )
    // "why are my headings not bold": the complaint asks for bold.
    .replace(/\bwhy (?:is|are|isn'?t|aren'?t)\b(.*?)\bnot\s+/gi, 'make$1 ')
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
    .replace(/[a-z]+/g, w => {
      const fixed = corrected(w, lex.vocab);
      return fixed;
    })
    // "buttons, but not bold": the "not" is about the buttons.
    .replace(
      /,?\s*\bbut not\s+(?=(bold|italic|uppercase|rounded|round|shadowed|underlined|bordered|faded|dark|light|bright|big|small|too \w+)\b)/g,
      ' not ',
    )
    // Tailwind classes: "border-2" is 2px, "rounded-full" a pill.
    .replace(/\bborder-(\d)\b/g, 'border width $1px')
    .replace(/\brounded-full\b/g, 'pill corners')
    .replace(/\brounded-none\b/g, 'square corners')
    // "1e3px" is 1000px.
    .replace(
      /\b(\d+(?:\.\d+)?)e([+-]?\d+)(px|rem|em)\b/gi,
      (_, n, e, u) => `${Number(n) * 10 ** Number(e)}${u}`,
    )
    // "not so round", "not that dark": one step less, not the opposite.
    .replace(
      /\bnot (?:so|that|as|too) (round(?:ed)?|bold|dark|big|bright|spacious|thick)\b/g,
      'less $1',
    )
    // "flat cards, not flat buttons": the second part stays as it is.
    .replace(/^(.*\b(\w{3,})\b.*?),\s*(?:but )?not \2 [a-z ]+$/, '$1')
    .replace(/\b(everything|everywhere|all) but\b/g, '$1 except')
    .replace(
      /\b(apart from|other than|excluding|but not (on|in|for)|but not)\b/g,
      'except',
    )
    .replace(/\s+/g, ' ')
    .trim();
  // "cramped on mobile": the editor has no media conditions; the rest of
  // the ask is answered, with a note.
  const MEDIA_RE = new RegExp(
    String.raw`(?<!\bno |\bnot )\b(?:below|above|under|over|wider than|narrower than)\s+(?:\d{3,}px|\d+em)\b|\b(?:screens?|viewports?|windows?) (?:below|above|under|over|less than|more than|wider than|narrower than)\s+\d+(?:px|em|rem)\b|\b(?:on|for) (?:mobile|phones?|tablets?|desktops?|touch(?: screens?)?|small screens?|large screens?|wide screens?|landscape|portrait)\b|\b(?:when )?print(?:ing)?\b|\b(?:the )?print version\b`,
    'g',
  );
  const media = MEDIA_RE.test(q);
  if (media) q = q.replace(MEDIA_RE, ' ').replace(/\s+/g, ' ').trim();
  const clauses = clausesOf(q, lex.parts);
  // "checkboxes green": the color a checked box fills with.
  for (const c of clauses)
    if (
      c.parts.length === 1 &&
      c.parts[0].on === 'checks' &&
      c.colors.length &&
      !c.state &&
      !c.named &&
      !/\b(border|outline|background|unchecked)\b/.test(c.text)
    )
      c.state = 'checked';
  // "labels on form fields": the label, not the field it sits on.
  for (const c of clauses)
    if (c.parts.some(p => p.on === 'field-label')) {
      // A checkbox's or switch's own label part, when Core has one.
      const own = c.parts
        .map(p => ({
          on:
            /** @type {Record<string, string>} */ ({
              checks: 'checkbox-label',
              checkbox: 'checkbox-label',
              switch: 'switch-label',
            })[p.on] ?? p.on,
        }))
        .filter(
          p =>
            /-label$/.test(p.on) && p.on !== 'field-label' && TARGET.has(p.on),
        );
      // "button labels": the label is the button's own text.
      const owner = c.parts.filter(
        p =>
          p.on !== 'field-label' &&
          ![
            'inputs',
            'field',
            'checks',
            'checkbox',
            'switch',
            'text-input',
          ].includes(p.on),
      );
      c.parts = own.length
        ? own
        : owner.length
          ? owner
          : c.parts.filter(p => p.on === 'field-label');
    }
  // "captions 12px": a clause led by a plural noun that names no part and
  // no change takes nothing from its neighbors.
  const unknownLead = (/** @type {Clause} */ c) => {
    const lead = /^(?:the |my |our |all )?([a-z]{4,}s)\b/.exec(c.text)?.[1];
    return Boolean(
      lead &&
      !c.parts.length &&
      !lex.vocab.includes(lead) &&
      !lex.vocab.includes(singular(lead)) &&
      !aspectsOf(lead).length &&
      !KEEP.has(lead),
    );
  };
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
  // "cards and dialogs with no shadow", "tooltips and toasts black": parts
  // listed before the ask all take it.
  for (let i = 0; i < clauses.length - 1; i++) {
    const c = clauses[i];
    const onlyParts = (/** @type {Clause} */ x) =>
      x.parts.length &&
      !x.aspects.length &&
      !x.colors.length &&
      !x.lengths.length &&
      !x.except &&
      !x.dir &&
      !lex.parts
        .reduce((t, [re]) => t.replace(re, ' '), ` ${x.text} `)
        .replace(/\b(the|a|an|all|every|both|my|our)\b/g, ' ')
        .trim();
    if (!onlyParts(c)) continue;
    let j = i + 1;
    while (j < clauses.length && onlyParts(clauses[j])) j++;
    const ask = clauses[j];
    if (
      !ask ||
      ask.except ||
      !(
        ask.aspects.length ||
        ask.colors.length ||
        ask.lengths.length ||
        ask.dir
      )
    )
      continue;
    const listed = clauses.slice(i, j).flatMap(x => x.parts);
    ask.parts = [...listed.map(p => ({...p})), ...ask.parts];
    for (const x of clauses.slice(i, j)) {
      x.parts = [];
      x.text = '';
    }
    i = j;
  }
  // "less padding on cards but more on buttons": a part with only a
  // direction takes the aspect of the clause before it.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    const prev = clauses[i - 1];
    if (
      c.parts.length &&
      c.dir &&
      !c.aspects.length &&
      !c.colors.length &&
      // "tooltips darker" is a color, never the border of the clause before.
      !/\b(dark|light|bright|dim)(er)?\b/.test(c.text) &&
      prev.aspects.length
    )
      c.aspects = [...prev.aspects];
  }
  // "thicker focus outline, 4px": a clause that is only a length is the
  // value of the clause before it, and the typed value wins over the
  // direction word.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    const prev = clauses[i - 1];
    if (
      c.lengths.length &&
      !c.parts.length &&
      !c.aspects.length &&
      !c.colors.length &&
      prev.aspects.length &&
      c.text
        .replace(
          /\b(at least|at most|about|around|roughly|or so|min(imum)?|max(imum)?)\b/g,
          '',
        )
        .replace(/-?\d*\.?\d+(px|rem|em)/g, '')
        .trim() === ''
    ) {
      prev.lengths = [...c.lengths, ...prev.lengths];
      prev.dir = null;
      prev.text = `${prev.text} ${c.lengths.join(' ')}`;
      c.lengths = [];
      c.text = '';
    }
  }
  // "every part bold except body text": the body is left as it is, so the
  // bold goes to the headings, not the body's weight.
  for (let i = 0; i < clauses.length - 1; i++) {
    const c = clauses[i];
    const next = clauses[i + 1];
    if (
      !c.parts.length &&
      c.aspects.includes('weight') &&
      next.except &&
      next.parts.some(p => p.on === 'body')
    ) {
      c.parts = [{on: 'heading'}];
      next.parts = [];
      next.text = '';
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
  // names a part, before one that says what to change, takes that ask
  // ("h1, h2, h3 { … }": read from the last, so each takes it in turn).
  for (let i = clauses.length - 2; i >= 0; i--) {
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
  // "make the divider 2px": a divider's length is its thickness.
  for (const c of clauses)
    if (
      c.parts.some(p => p.on === 'divider') &&
      !c.aspects.length &&
      c.lengths.length
    )
      c.aspects = ['size'];
  // "shadow opacity 0.2": the layer's alpha is the ask, not the layer.
  for (const c of clauses)
    if (
      /\b(shadows?|backgrounds?|bg|borders?|outlines?)\s+opacity\b/.test(c.text)
    )
      c.aspects = ['opacity'];
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
        c.aspects.push(
          // "headings red": a part that is only text has a text color.
          c.parts.every(p => ['heading', 'link'].includes(p.on))
            ? 'text'
            : 'background',
        );
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
      !unknownLead(c) &&
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
      !unknownLead(c) &&
      (c.lengths.length || /\b(stay|keep)\b/.test(c.text))
    ) {
      const from = prev?.aspects.length
        ? prev
        : next?.aspects.length
          ? next
          : null;
      // Only the aspects a length can set: "headings 32px bold, captions
      // 12px" gives captions a size, not the headings' bold.
      if (from)
        c.aspects = from.aspects.filter(
          a => !['weight', 'italic', 'case', 'family'].includes(a),
        );
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
  // "the same accent in light and dark": every mode, so no mode.
  if (
    /\b(light and dark|dark and light|both modes|every mode|all modes|same in (both|light and dark))\b/.test(
      q,
    )
  )
    for (const c of clauses) c.mode = null;
  // "only in dark mode, …": a clause that only names a mode scopes every
  // clause after it.
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    if (c.mode && !c.parts.length && !c.aspects.length && !c.colors.length) {
      // "don't touch dark mode, …": the other mode.
      const scope = c.neg ? (c.mode === 'dark' ? 'light' : 'dark') : c.mode;
      for (const o of c.neg ? clauses : clauses.slice(i + 1))
        if (o !== c) o.mode ??= scope;
      if (c.neg) {
        for (const o of clauses)
          if (o !== c && o.mode === c.mode) o.mode = scope;
        c.text = '';
      }
    }
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
  // The theme's own value (its settings applied), else the base theme's.
  const current = (token, mode = 'light') =>
    env.own?.[mode]?.[token] ??
    env.base[mode]?.[token] ??
    String(TOKENS[token] ?? '');
  /**
   * What the theme itself sets for a CSS property on a part (its plain
   * setting: no variant, state or mode), so a change by an amount starts
   * from the theme, not from Core.
   * @param {string} on @param {string} prop
   */
  const partValue = (on, prop) =>
    [...env.data.settings]
      .reverse()
      .find(
        st =>
          st.thing === prop &&
          st.on === on &&
          !st.when &&
          !st.state &&
          !st.mode,
      )?.value ?? null;
  /**
   * The theme's own whole-theme value for a dial (its last plain setting).
   * @param {string} thing
   */
  const ownDial = thing =>
    [...env.data.settings]
      .reverse()
      .find(
        st => st.thing === thing && !st.on && !st.when && !st.state && !st.mode,
      )?.value ?? null;
  /**
   * The text-size a step takes from the theme's own size: a number moves by
   * the dial's step of 2px; a named size steps with more/less.
   * @param {'more' | 'less'} dir
   */
  const textSizeStep = dir => {
    const own = ownDial('text-size');
    return own && /^\d+(\.\d+)?$/.test(own)
      ? String(Number(own) + (dir === 'less' ? -2 : 2))
      : dir;
  };
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
      // One member of a group ("the text area") is that member only; set
      // otherwise reaches the whole group.
      // (set spreads only the inputs and checks groups).
      ...(flags.on &&
      ['inputs', 'checks'].some(g =>
        (FAMILIES[g] ?? []).includes(/** @type {string} */ (flags.on)),
      )
        ? {only: true}
        : {}),
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
    // "cards the same radius as buttons": the first part takes the second
    // part's value, read from the token the second part reads.
    const same = /\b(?:the )?same (\w+(?: \w+)?) as (?:the )?([a-z-]+)\b/.exec(
      c.text,
    );
    // "buttons twice as round as inputs": the part after "as" is only the
    // measure; the first part is the one that changes.
    const asAs = /\bas \w+ as (?:the )?([a-z-]+)/.exec(c.text);
    if (asAs && c.parts.length >= 2) {
      const after = (/** @type {{on: string}} */ p) =>
        lex.parts.some(
          ([re, x]) =>
            x.on === p.on && (re.exec(c.text)?.index ?? -1) > (asAs.index ?? 0),
        );
      c.parts = c.parts.filter(p => !after(p));
    }
    // "focus ring the same color as the danger color": a role's token.
    const role = same ? ROLE_DIALS.find(([re]) => re.test(same[0])) : null;
    if (same && role && c.parts.length === 1) {
      const target = c.parts[0];
      const d =
        target.on === 'focus-ring'
          ? {
              text: `the focus ring takes the ${role[1]} color: --focus-outline-color reads ${role[2]}`,
              options: [[set('--focus-outline-color', `var(${role[2]})`)]],
            }
          : {
              text: `${target.on} takes the ${role[1]} color`,
              options: [
                [set('background', `var(${role[2]})`, {on: target.on})],
              ],
            };
      seenPart(target.on);
      push(d);
      recordTop(c, d.options[0] ?? []);
      continue;
    }
    if (same && c.parts.length >= 2) {
      // The part named first takes the value; the order is the question's.
      const at = (/** @type {{on: string}} */ p) =>
        Math.min(
          ...lex.parts
            .filter(([, x]) => x.on === p.on)
            .map(([re]) => re.exec(c.text)?.index ?? Infinity),
        );
      const [target, source] = [...c.parts].sort((x, y) => at(x) - at(y));
      const group =
        /** @type {Record<string, string>} */ ({
          corners: 'corners',
          radius: 'corners',
          color: 'background',
          background: 'background',
          border: 'border',
          shadow: 'shadow',
          padding: 'spacing',
          spacing: 'spacing',
          font: 'font',
        })[same[1].split(' ').pop() ?? ''] ??
        c.aspects.map(a => (a === 'family' ? 'font' : a)).find(a => GROUPS[a]);
      const reads = group ? C.partReads(one(source.on), group) : [];
      const read = reads.find(r => r.when.includes('')) ?? reads[0];
      const prop = read?.props[0];
      if (read && prop) {
        seenPart(target.on);
        seenPart(source.on);
        const d = {
          text: `${target.on} takes ${source.on}'s ${prop}: ${source.on} reads ${read.token} for it`,
          options: [[set(prop, `var(${read.token})`, {on: target.on})]],
        };
        push(d);
        recordTop(c, d.options[0] ?? []);
        continue;
      }
    }
    // "decrease the radius by 2px", "add 8px to the padding": a change from
    // the value now, never the new value itself.
    // "shrink headings by 20%": a change by a share, from the value now.
    const share = /\bby (\d+(?:\.\d+)?)%/.exec(c.text);
    if (
      share &&
      /\b(shrink|grow|increase|decrease|reduce|raise|lower|bigger|smaller|more|less)\b/.test(
        c.text,
      )
    ) {
      push({
        text: `set takes the new value, not a change by ${share[1]}%; look up what it is now, then set that value ${/\b(shrink|decrease|reduce|lower|smaller|less)\b/.test(c.text) ? 'minus' : 'plus'} ${share[1]}%`,
        options: [],
        lookup: c.parts[0]
          ? `${HOW} ${c.parts[0].on}`
          : `${P} show ${env.slug}`,
      });
      continue;
    }
    // "2px rounder", "8px larger", "4px wider": a change too.
    const COMPARATIVE =
      'more|less|bigger|smaller|rounder|sharper|squarer|larger|wider|narrower|taller|shorter|thicker|thinner|higher|lower|tighter|looser|roomier|airier|denser|bolder|heavier|lighter';
    // A weight moved by a number ("100 bolder"): set takes the new weight.
    const weightDelta = /\b(\d{2,3}) (bolder|heavier|lighter|thinner)\b/.exec(
      c.text,
    );
    if (weightDelta) {
      push({
        text: `set takes the new weight, not a change by ${weightDelta[1]}; look up the weight now, then set it ${/lighter|thinner/.test(weightDelta[2]) ? 'minus' : 'plus'} ${weightDelta[1]}`,
        options: [],
        lookup: c.parts[0]
          ? `${HOW} ${c.parts[0].on}`
          : `${P} show ${env.slug}`,
      });
      continue;
    }
    // Amounts in rem or em count at a 16px root.
    const delta = new RegExp(
      `\\b(?:by|add(?:ing)?|plus|minus|subtract(?:ing)?)\\s+(\\d*\\.?\\d+)(px|rem|em)\\b|\\b(\\d*\\.?\\d+)(px|rem|em) (?:${COMPARATIVE})\\b`,
    ).exec(c.text);
    if (
      delta &&
      new RegExp(
        `\\b(by|add|adding|plus|minus|subtract|subtracting|increase|decrease|reduce|${COMPARATIVE})\\b`,
      ).test(c.text)
    ) {
      const unit = delta[2] ?? delta[4];
      const n =
        Math.round(
          Number(delta[1] ?? delta[3]) * (unit === 'px' ? 1 : 16) * 100,
        ) / 100;
      const down =
        /\b(decrease|reduce|less|smaller|minus|subtract|subtracting|lower|shrink|sharper|squarer|narrower|shorter|thinner|tighter|denser|lighter)\b/.test(
          c.text,
        );
      const cornerAsk =
        c.aspects.includes('corners') ||
        /\b(rounder|sharper|squarer)\b/.test(c.text);
      // A part's corners: its radius token, moved by the amount.
      if (cornerAsk && c.parts.length) {
        const on = c.parts[0].on;
        const read = C.partReads(one(on), 'corners')[0];
        // A radius the theme set on the part in px moves from that value.
        const ownRadius = partValue(on, 'border-radius');
        if (ownRadius && /^\d*\.?\d+px$/.test(ownRadius)) {
          const next = Math.max(0, parseFloat(ownRadius) + (down ? -n : n));
          const d = {
            text: `${on}'s corners ${down ? 'down' : 'up'} by ${n}px: from ${ownRadius} to ${next}px`,
            options: [[set('border-radius', `${next}px`, {on})]],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
          continue;
        }
        if (read) {
          const d = {
            text: `${on}'s corners ${down ? 'down' : 'up'} by ${n}px: ${read.token} ${down ? '-' : '+'} ${n}px`,
            options: [
              [
                set(
                  'border-radius',
                  `max(0px, calc(var(${read.token}) ${down ? '-' : '+'} ${n}px))`,
                  {on},
                ),
              ],
            ],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
          continue;
        }
      }
      if (cornerAsk && !c.parts.length) {
        const now = parseFloat(current('--radius-element'));
        const nowPx = /rem$/.test(current('--radius-element')) ? now * 16 : now;
        const next = Math.max(
          0,
          Math.round((nowPx + (down ? -n : n)) * 100) / 100,
        );
        const d = {
          text: `corners ${down ? 'down' : 'up'} by ${n}px: from ${Math.round(nowPx * 100) / 100}px to ${next}px`,
          options: [[set('corners', `${next}px`)]],
        };
        push(d);
        recordTop(c, d.options[0] ?? []);
        continue;
      }
      push({
        text: `set takes the new value, not a change by ${n}px; look up what it is now, then set it ${down ? 'minus' : 'plus'} ${n}px`,
        options: [],
        lookup: c.parts[0]
          ? `${HOW} ${c.parts[0].on}`
          : `${P} show ${env.slug}`,
      });
      continue;
    }
    // "all corners like the buttons": every other radius token takes the
    // one the named part reads.
    if (
      c.parts.length === 1 &&
      c.aspects.includes('corners') &&
      /\b(all|every|other|everything|everywhere)\b/.test(c.text) &&
      /\b(like|match(es|ing)?|same as)\b/.test(c.text)
    ) {
      const source = c.parts[0].on;
      const read = C.partReads(one(source), 'corners')[0];
      if (read) {
        const others = Object.keys(TOKENS).filter(
          t =>
            /^--radius-/.test(t) &&
            t !== read.token &&
            !/^--radius-(none|full)$/.test(t),
        );
        const d = {
          text: `every corner like ${source}'s: the other radius tokens take ${read.token}, which ${source} reads`,
          options: [others.map(t => set(t, `var(${read.token})`))],
          sequence: others.length > 1,
        };
        push(d);
        recordTop(c, d.options[0] ?? []);
        continue;
      }
    }
    // "text on the accent color is hard to read": the on-accent text color,
    // the one of black or white that reads on the accent in each mode.
    if (
      /\btext on (?:the )?accent\b/.test(c.text) &&
      TOKENS['--color-on-accent'] !== undefined
    ) {
      const steps = /** @type {Array<'light' | 'dark'>} */ (['light', 'dark'])
        .filter(m => env.data.mode === 'both' || m === 'light')
        .map(m => {
          const acc = parseColor(current('--color-accent', m));
          const pick =
            acc && ratio(acc, [255, 255, 255]) >= ratio(acc, [0, 0, 0])
              ? '#ffffff'
              : '#000000';
          return set(
            '--color-on-accent',
            pick,
            env.data.mode === 'both' ? {mode: m} : {},
          );
        });
      const d = {
        text: 'the text on the accent: --color-on-accent, black or white, whichever reads better on the accent',
        options: [steps],
        sequence: steps.length > 1,
      };
      push(d);
      recordTop(c, d.options[0] ?? []);
      continue;
    }
    // "5 lines tall text box": a text area's height in lines.
    const lines = /\b(\d+) (?:lines?|rows?) (?:tall|high)\b/.exec(c.text);
    if (lines && TARGET.has('text-area')) {
      const d = {
        text: `a text area ${lines[1]} lines tall: min-height ${lines[1]}lh`,
        options: [[set('min-height', `${lines[1]}lh`, {on: 'text-area'})]],
      };
      push(d);
      recordTop(c, d.options[0] ?? []);
      continue;
    }
    // "outline offset 3px on focus": the focus ring's offset, not a border.
    if (
      !c.parts.length &&
      /\boutline[- ]offset\b/.test(c.text) &&
      c.lengths[0]
    ) {
      const d = {
        text: "the focus ring's offset: --focus-outline-offset",
        options: [[set('--focus-outline-offset', c.lengths[0])]],
      };
      push(d);
      recordTop(c, d.options[0] ?? []);
      continue;
    }
    // Placeholder, caret and selection colors.
    if (
      /\b(placeholders?|caret|cursor colou?r|colou?r (of )?the cursor|selection|selected text highlight|text highlight)\b/.test(
        c.text,
      ) &&
      !/\bloading placeholder/.test(c.text)
    ) {
      const color = colorFor(c, 'fill');
      const caret =
        /\bcaret\b|\bcursor colou?r\b|\bcolou?r (of )?the cursor\b/.test(
          c.text,
        );
      if (caret && color) {
        const on = c.parts[0]?.on ?? 'inputs';
        const d = {
          text: `the text cursor color on ${on}: caret-color`,
          options: [[set('caret-color', color, {on})]],
        };
        push(d);
        recordTop(c, d.options[0] ?? []);
        continue;
      }
      push({
        text: caret
          ? 'name the cursor color: caret-color takes a color'
          : `${/\bplaceholder/.test(c.text) ? 'placeholder text' : 'the text selection highlight'} has no setting: the editor themes parts, not ${/\bplaceholder/.test(c.text) ? '::placeholder' : '::selection'}; it takes your own CSS`,
        options: [],
        lookup: `${HOW} inputs`,
      });
      continue;
    }
    // "… and set --border-width 2px": a real token typed in a clause.
    // The value runs to the clause end ("--shadow-high 0 4px 12px black").
    const tok = /(?:^|\s)(--[a-z][a-z0-9-]*)\s*:?\s+([^;]+?)\s*$/.exec(c.text);
    if (tok && Object.hasOwn(TOKENS, tok[1])) {
      const d = {
        text: `the token ${tok[1]}, as you wrote it`,
        options: [
          [
            set(
              tok[1],
              tok[2].replace(/\s+(on|for|in|everywhere)\b.*$/, ''),
              modeOf(c),
            ),
          ],
        ],
      };
      push(d);
      recordTop(c, d.options[0] ?? []);
      continue;
    }
    // "error text red", "labels smaller": text that belongs to parts how
    // cannot pick alone is a lookup, never the whole theme's text.
    if (!c.parts.length && /\berror (text|messages?)\b/.test(c.text)) {
      const which = /\berror\b/.test(c.text) ? 'error text' : 'labels';
      push({
        text: `${which} belong to the parts that show them (an input's error message, a field's label); name the part, or look it up`,
        options: [],
        lookup: `${HOW} --list parts ${which === 'labels' ? 'label' : 'error'}`,
      });
      continue;
    }
    // A CSS property named with its value is set as named, on each part.
    const named = c.named;
    if (
      named &&
      !named.bad &&
      // A divider's thickness and color are its border tokens.
      !c.parts.some(p => p.on === 'divider') &&
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
    // "go back to the neutral theme", "start over": every setting.
    if (
      /\b(back to|reset to|revert to|restore) (the )?(neutral|base|original|default|plain) theme\b|\bstart over\b|\breset (the )?(whole )?theme\b|\b(remove|undo|clear|drop|revert) (all|every one of|each of) (my |the )?(changes|settings|edits|overrides)\b|\bundo everything\b/.test(
        c.text,
      )
    ) {
      const all = env.data.settings;
      return all.length
        ? {
            text: `take back every setting ${env.slug} has, one undo each, to its base theme (${env.data.like ?? 'none'})`,
            options: [
              all.map(
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
            sequence: all.length > 1,
          }
        : {
            text: `${env.slug} sets nothing, so it is its base theme as it is`,
            options: [],
          };
    }
    if (
      !/\b(reset|revert|restore|back to|default|original|what it was|standard|clear|no custom|remove the override|(remove|clear|drop|delete) (my |the )?(\w+ )?overrides?|by mistake|^undo|take back|like before|as before|the way (it|they) (was|were)|by accident|accidentally|put .* back|.* back to normal)\b/.test(
        c.text,
      ) ||
      /\bby default\b|\bthe last change\b|\beverything\b/.test(c.text) ||
      (c.colors.length > 0 &&
        !/\b(by mistake|by accident|accidentally)\b/.test(c.text)) ||
      OS_FONT.test(c.text)
    )
      return null;
    const role = ROLE_DIALS.find(([re]) => re.test(c.text));
    const things = [
      ...c.aspects.flatMap(a => RESET_THINGS[a] ?? []),
      ...(role ? [role[1], role[2]] : []),
    ];
    const on = c.parts[0]?.on;
    // "revert the cards to default": every setting on that part.
    if (!things.length && !on) return null;
    const matches = env.data.settings.filter(
      st =>
        (!things.length ||
          things.includes(st.thing) ||
          things.some(
            t => t.endsWith('*') && st.thing.startsWith(t.slice(0, -1)),
          )) &&
        (st.on ?? '') === (on ?? ''),
    );
    const what = role ? role[1] : (c.aspects[0] ?? 'everything');
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
      // "remove the focus outline": a ring keyboard users need; set it to
      // nothing only on the ask, and say what that costs.
      if (c.neg || /\b(remove|hide|get rid of)\b/.test(c.text))
        return {
          text: 'no focus ring: --focus-outline-width 0px. Keyboard users then cannot see where they are, so keep a visible focus style another way',
          options: [[set('--focus-outline-width', '0px')]],
        };
      // "focus ring offset 2px": the gap between the part and its ring.
      if (/\boffset\b/.test(c.text))
        return c.lengths[0]
          ? {
              text: "the focus ring's offset: --focus-outline-offset",
              options: [[set('--focus-outline-offset', c.lengths[0])]],
            }
          : null;
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
    if (a === 'motion') {
      // "turn off all animations", "no transition on links".
      if (c.neg || /\b(off|none)\b/.test(c.text)) {
        if (on)
          return {
            text: `no transition${where}`,
            options: [[set('transition', 'none', f)]],
          };
        return {
          text: 'no motion: every shared duration token at 0ms',
          options: [
            Object.keys(TOKENS)
              .filter(t => /^--duration-/.test(t))
              .map(t => set(t, '0ms')),
          ],
          sequence: true,
        };
      }
      const typedTime = /\b(\d+(?:\.\d+)?)(ms|s)\b/.exec(c.text);
      const typedMs = typedTime
        ? String(
            Math.round(
              Number(typedTime[1]) * (typedTime[2] === 's' ? 1000 : 1),
            ),
          )
        : undefined;
      if (typedMs && !on)
        return {
          text: `every motion at ${typedMs}ms: the shared duration tokens`,
          options: [
            ['--duration-fast', '--duration-medium', '--duration-slow']
              .filter(t => t in TOKENS)
              .map(t => set(t, `${typedMs}ms`)),
          ],
          sequence: true,
        };
      const slower = /\b(slow(er)?|longer)\b/.test(c.text);
      const ms =
        /\b(\d+)ms\b/.exec(c.text)?.[1] ??
        (/\b(\d*\.?\d+)s\b/.exec(c.text)?.[1] &&
          String(Number(/\b(\d*\.?\d+)s\b/.exec(c.text)?.[1]) * 1000));
      const own = on ? (C.MAP[one(on)]?.own ?? {}) : {};
      const moves = Object.keys(own).some(k =>
        /^(transition|animation)-duration$/.test(k),
      );
      if (on && !moves)
        return {
          text: `${on} has no motion of its own that set can change; the theme's motion speeds are the --duration-* tokens, which every part shares`,
          options: [],
          lookup: `${HOW} --duration-medium`,
        };
      if (!on) {
        const scale = slower ? 1.5 : 0.6;
        return {
          text: `${slower ? 'slower' : 'faster'} motion everywhere: the shared duration tokens`,
          options: [
            ['--duration-fast', '--duration-medium', '--duration-slow']
              .filter(t => t in TOKENS)
              .map(t =>
                set(t, `${Math.round(parseFloat(current(t)) * scale)}ms`),
              ),
          ],
          sequence: true,
        };
      }
      return {
        text: `${slower ? 'slower' : 'faster'} transitions${where}: transition-duration`,
        options: [
          [set('transition-duration', `${ms ?? (slower ? 300 : 100)}ms`, f)],
        ],
      };
    }
    // A divider draws with the border tokens: its thickness and color.
    if (
      on === 'divider' &&
      ['border', 'size', 'background', 'text'].includes(a)
    ) {
      const color = colorFor(c, 'fill');
      if (color && (a === 'background' || a === 'text' || a === 'border'))
        return {
          text: 'the divider color: --color-border, on the divider only',
          options: [[set('--color-border', color, {on, ...modeOf(c)})]],
        };
      const len =
        c.lengths[0] ??
        (c.dir === 'less'
          ? '1px'
          : c.dir || /\bthick/.test(c.text)
            ? '2px'
            : null);
      return len
        ? {
            text: 'the divider thickness: --border-width, on the divider only',
            options: [[set('--border-width', len, {on})]],
          }
        : null;
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
    // A part that reads no fill or text color token ("spinner in the accent
    // color") gets no fill it never had.
    if (
      a === 'background' &&
      on &&
      !f.state &&
      !/\b(stripe[sd]?|striped|zebra)\b/.test(c.text) &&
      C.MAP[one(on)] &&
      !Object.keys(C.MAP[one(on)].own ?? {}).some(k =>
        /^(background|background-color|background-image|color|fill|stroke|border-color|border|outline-color)$/.test(
          k,
        ),
      ) &&
      !/\b(background|bg|fill(ed)?|gradient)\b/.test(c.text)
    )
      return {
        text: `${on} reads no fill or text color token that set can change; its color comes from its own props`,
        options: [],
        lookup: `${HOW} ${on}`,
      };
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
            [
              set(
                'text-size',
                px ?? textSizeStep(c.dir === 'less' ? 'less' : 'more'),
              ),
            ],
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
            : /\b(pill|circular(?! (font|typeface))|circles?|fully round|max(imum)? round\w*|most round\w*|as round as possible)\b/.test(
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
        // A step ("bolder", "a bit lighter") moves one rung from the
        // headings rung the theme sets, never back to a fixed one.
        const ownRung = ownDial('headings');
        const rungs = Object.keys(HEADING_WEIGHTS);
        const stepAsk =
          !typedW &&
          !c.neg &&
          !/\btoo /.test(c.text) &&
          /\b(bolder|heavier|lighter|thinner|less bold)\b/.test(c.text);
        if (
          stepAsk &&
          ownRung &&
          rungs.includes(ownRung) &&
          ((!on && /\b(headings?|titles?)\b/.test(c.text)) ||
            (on === 'heading' && !f.when))
        ) {
          const next = rungs[rungs.indexOf(ownRung) + (light ? -1 : 1)];
          if (!next)
            return {
              text: `the headings are already ${light ? 'the lightest' : 'the boldest'} rung (${ownRung}), so nothing changes`,
              options: [],
            };
          return {
            text: `${next} headings: one rung ${light ? 'lighter' : 'bolder'} than ${ownRung}`,
            options: [[set('headings', next)]],
          };
        }
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
        // An exact --font-size-base wins over the text-size dial, so the
        // dial would change nothing there: step that token instead.
        const pinned = on
          ? null
          : ([...env.data.settings]
              .reverse()
              .find(
                st =>
                  st.source === 'token' &&
                  st.thing === '--font-size-base' &&
                  !st.on &&
                  !st.when &&
                  !st.state &&
                  !st.mode,
              )?.value ?? null);
        if (pinned != null) {
          const m = /^(\d*\.?\d+)(px|rem|em)$/i.exec(pinned.trim());
          const next = px
            ? px
            : m
              ? `${Math.round(parseFloat(m[1]) * factor * 100) / 100}${m[2].toLowerCase()}`
              : null;
          return next
            ? {
                text: `the base text size: --font-size-base, set exactly to ${pinned} (it wins over the text-size dial)`,
                options: [[set('--font-size-base', next)]],
              }
            : {
                text: `the base text size: --font-size-base is set exactly to ${pinned}, which wins over the text-size dial; remove it, then text-size changes the size`,
                options: [
                  [
                    /** @type {Step} */ ({
                      verb: 'undo',
                      thing: '--font-size-base',
                    }),
                    set(
                      'text-size',
                      textSizeStep(c.dir === 'less' ? 'less' : 'more'),
                    ),
                  ],
                ],
              };
        }
        if (!on)
          return {
            text: 'the base text size: text-size (every heading scales from it)',
            options: [
              [
                set(
                  'text-size',
                  px
                    ? String(
                        /r?em$/.test(px)
                          ? Math.round(parseFloat(px) * 16 * 100) / 100
                          : parseFloat(px),
                      )
                    : textSizeStep(c.dir === 'less' ? 'less' : 'more'),
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
        // The theme's own size on the part first; a part with no size token
        // of its own starts from the body size.
        const own = on ? partValue(on, 'font-size') : null;
        const now = own
          ? own
          : sizeTok
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
        if (/\bsmall caps\b/.test(c.text) && on)
          return {
            text: `small caps${where}: font-variant-caps`,
            options: [
              [set('font-variant-caps', c.neg ? 'normal' : 'small-caps', f)],
            ],
          };
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
        const layer =
          /\b(shadows?|backgrounds?|bg|borders?|outlines?)\s+opacity\b/.exec(
            c.text,
          )?.[1];
        const alpha =
          /\bopacity\s*:?\s*(0?\.\d+|0|1)\b(?!%)/.exec(c.text)?.[1] ??
          (Number(/\b(\d{1,3})%/.exec(withoutFunctions(c.text))?.[1] ?? NaN) /
            100 ||
            null);
        // "shadow opacity 0.2": the layer's own alpha, never the part's.
        if (layer && on) {
          const a =
            alpha == null ? (c.dir === 'less' ? 0.08 : 0.2) : Number(alpha);
          if (/^shadow/.test(layer))
            return {
              text: `a shadow at ${a} alpha${where}`,
              options: [[set('box-shadow', `0 1px 3px rgb(0 0 0 / ${a})`, f)]],
            };
          if (/^(background|bg)/.test(layer)) {
            const tok =
              C.partReads(one(on), 'background').find(r => r.when.includes(''))
                ?.token ??
              (FAMILIES.containers.includes(one(on))
                ? '--color-background-card'
                : null);
            return tok
              ? {
                  text: `the background at ${Math.round(a * 100)}%${where}, see-through to what is behind it`,
                  options: [
                    [
                      set(
                        'background-color',
                        `color-mix(in srgb, var(${tok}) ${Math.round(a * 100)}%, transparent)`,
                        f,
                      ),
                    ],
                  ],
                }
              : {
                  text: `${on} has no background color of its own to make see-through`,
                  options: [],
                };
          }
          return {
            text: `the border at ${Math.round(a * 100)}%${where}`,
            options: [
              [
                set(
                  'border-color',
                  `color-mix(in srgb, var(--color-border) ${Math.round(a * 100)}%, transparent)`,
                  f,
                ),
              ],
            ],
          };
        }
        const typedOpacity = /\bopacity\s*:?\s*(0?\.\d+|0|1)\b(?!%)/.exec(
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
        // "should not shrink when pressed": no scale.
        if (on && c.neg)
          return {
            text: `${on} keeps its size${where}: transform none`,
            options: [[set('transform', 'none', f)]],
          };
        return on
          ? {
              text: `${on} scales${where}: transform`,
              options: [
                [
                  set(
                    'transform',
                    /\bscale\s*:?\s*(0?\.\d+|1(\.\d+)?)\b/.test(c.text)
                      ? `scale(${/\bscale\s*:?\s*(0?\.\d+|1(?:\.\d+)?)\b/.exec(c.text)?.[1]})`
                      : /\b(up|grows?)\b/.test(c.text)
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
          (/\b(taller|shorter|height|bigger|larger|tap targets?|touch targets?)\b/.test(
            c.text,
          ) && !/\b(wider|narrower|width)\b/.test(c.text)
            ? c.lengths[0]
            : null);
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
        // "dim the white text": the color word names the text to change,
        // not the color to give it.
        const recolor =
          /\b(dim|dimmer|soften|darken|lighten|brighten|tone down)\b/.test(
            c.text,
          ) && !/#[0-9a-f]{3,8}\b|\(/.test(c.text);
        const color = recolor ? null : colorFor(c, 'text');
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
            /\b(less bright|dim|dimmer|soften|softer|lighter|less contrast|too dark)\b/.test(
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
        // A link's color in one state: the token, scoped to that state.
        if (on === 'link' && color && f.state)
          return {
            text: `the link color${where}: --color-text-accent on links in that state`,
            options: [
              [set('--color-text-accent', color, {...f, ...modeOf(c)})],
            ],
          };
        if (on === 'link' && color)
          return {
            text: `the link color: --color-text-accent, the token a link reads (it also colors other accent text)${f.state ? `; a link has no color of its own for ${f.state}, so this changes it in every state` : ''}`,
            options: [[set('--color-text-accent', color, modeOf(c))]],
          };
        if (!color) return null;
        // A part that takes its color from a prop (a heading): the text
        // token, on that part only.
        if (!env.check([set('color', color, f)]).ok)
          return {
            text: `the text color${where}: --color-text-primary on ${on} only (${on} takes its color from a prop, so a color property never shows)`,
            options: [[set('--color-text-primary', color, {on, ...modeOf(c)})]],
          };
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
            : {
                // The theme's own page is already at the end of the range.
                text: `the page background of ${env.slug} is already ${lighter ? 'as light' : 'as dark'} as it goes (${current('--color-background-body')}), so nothing changes`,
                options: [],
              };
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
      const ROLE_TOKEN = wordTable(
        /** @type {Record<string, string>} */ ({
          accent: '--color-accent',
          danger: '--color-error',
          success: '--color-success',
          warning: '--color-warning',
          info: '--color-info',
        }),
      );
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
      ) &&
      // "in dark mode only, cards #111111": the mode scopes the other ask.
      // "dark only" with no "mode" word describes the theme's look.
      (/\balways dark\b|\b(theme|app)\b/.test(t) ||
        !/\bmode\b|\bin dark\b/.test(t) ||
        // "… accent and dark mode only": the last ask, scoping nothing.
        (clauses.indexOf(c) === clauses.length - 1 &&
          !/\b(in|for)\b/.test(c.text)) ||
        !clauses.some(
          o =>
            o.text !== c.text &&
            (o.parts.length || o.colors.length || o.aspects.length),
        ))
    )
      return {
        text: 'a theme with only a dark mode: mode dark-only',
        options: [[set('mode', 'dark-only')]],
      };
    if (
      /\blight[- ]?(mode|theme)? only\b|\bonly light\b|\blight-only\b/.test(
        t,
      ) &&
      // "light only" removes dark mode only when the ask is about the
      // theme's modes, never beside another change.
      (/\b(theme|app)\b/.test(t) ||
        !clauses.some(
          o =>
            o.text !== c.text &&
            (o.parts.length || o.colors.length || o.aspects.length),
        ))
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
      // "More" goes with the word after it: more washed out, more muted
      // and more pastel are less vibrant; less muted is more.
      const dim =
        /\b(desaturat\w*|muted|dull|washed|pastel|gr[ae]yer|calm\w*|softer)\b/;
      const less =
        /\bless (desaturat\w*|muted|dull|washed|pastel|gr[ae]y\w*)\b/.test(t)
          ? false
          : dim.test(t) || (/\bless\b/.test(t) && !/\bmore\b/.test(t));
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
    const NATURAL = wordTable(
      /** @type {Record<string, string>} */ ({
        danger: HUES.red,
        success: HUES.green,
        warning: HUES.yellow,
        info: HUES.blue,
      }),
    );
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
    // Only the reads of the property the aspect is about (a weight question
    // never lists the size tokens).
    const prop = /** @type {Record<string, RegExp>} */ ({
      weight: /^font-weight$/,
      family: /^font-family$/,
      fontsize: /^font-size$/,
      tracking: /^letter-spacing$/,
      case: /^text-transform$/,
      italic: /^font-style$/,
    })[a];
    const toks = C.partReads(one(on), group)
      .filter(r => !prop || r.props.some(x => prop.test(x)))
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
      if (
        prior &&
        prior.clause !== clause &&
        prior.step.value !== st.value &&
        (prior.clause.mode ?? '') === (clause.mode ?? '')
      )
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
  // A confidence gate: a question, a "tell me", a "but not too" or a typo
  // read as a direction leaves how unsure which way to go; a wrong write is
  // worse than none, so it gives the lookup and asks for the ask.
  const unsure = gateAll;
  if (unsure && result.some(d => d.options.some(o => o.length))) {
    const part = partsSeen[0];
    result.splice(0, result.length, {
      text: `how is not sure which change you want; say it as an ask instead (for example "rounder cards" or "no shadows on buttons")`,
      options: [],
      lookup: part ? `${HOW} ${part}` : `${P} show ${env.slug}`,
    });
  }
  if (media)
    result.push({
      text: 'the theme editor has no screen-size, print or device conditions: this applies on every screen; a media query needs your own CSS',
      options: [],
    });
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
  const generic = new Set(keywordsOf('font-family'));
  const words = [...question.matchAll(/[A-Za-z][\w-]*/g)];
  /** @type {string | null} */
  let best = null;
  // The longest run of words, starting with a capital, that names one.
  for (let i = 0; i < words.length; i++) {
    if (!/^[A-Z]/.test(words[i][0])) continue;
    for (let n = Math.min(4, words.length - i); n >= 1; n--) {
      const run = words.slice(i, i + n);
      const gap = run.every(
        (w, k) =>
          k === 0 ||
          /^\s+$/.test(
            question.slice(
              /** @type {number} */ (run[k - 1].index) + run[k - 1][0].length,
              w.index,
            ),
          ),
      );
      if (!gap) continue;
      const name = run.map(w => w[0]).join(' ');
      const low = name.toLowerCase();
      if (
        generic.has(low) ||
        !new RegExp(`\\b${low}\\b`).test(c) ||
        !isSystemFamily(name)
      )
        continue;
      if (!best || name.length > best.length) best = name;
      break;
    }
  }
  return best;
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
    /^(a|an|the|my|our|this|that|any|some|same|another|different|new|nice|modern|bold|light|thin|heavy|big|small|serif|sans|sans-serif|mono|monospace|system|default|body|heading|headings|code|for|on|in|dark|light|night)$/i;
  const NAME =
    "([A-Z][\\w-]*(?:'[\\w-]+)*(?: (?:[A-Z][\\w-]*(?:'[\\w-]+)*|\\d+)){0,3})";
  /** @type {string | undefined} */
  let typed;
  for (const re of [
    new RegExp(
      `\\b(?:[Uu]se|[Ff]ont|[Tt]ypeface|[Tt]o|in)s?:?\\s+["']?${NAME}`,
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
