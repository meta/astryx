// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A plain-words question for `how`, read clause by clause: the parts
 * it names (with a variant, size, state or mode), what to change about
 * them, the values typed in it, and whether it asks for more, less or none.
 * Each clause becomes the commands that do exactly that; `how` then keeps
 * only the commands `set` accepts and that change the theme.
 * @position api/theme-edit — imported only by _how.mjs
 */

import {hex, parseColor} from './_color.mjs';
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
import {COLOR_PROPS} from './_tables.mjs';

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
      'botones?|boutons?|knöpfe|knopf|кнопк[аиу]|botões|botão|botao|pulsanti|bottoni',
      '按钮|ボタン|버튼',
      'buttons',
    ],
    ['tarjetas?|cartes|karten?|карточк[аи]', '卡片|カード', 'cards'],
    [
      'redondead[oa]s?|arrondi[es]*|abgerundet\\p{L}*|скругл\\p{L}*|arredondad\\p{L}*|arrotondat\\p{L}*',
      '圆|丸く|丸い|둥글게|둥근',
      'rounded',
    ],
    ['esquinas?|coins|ecken|углы', '角', 'corners'],
    ['sombras?|ombres?|schatten|тен[ьи]', '阴影|影', 'shadow'],
    ['entfernen|quitar|enlever|supprimer|убрать', '去掉|删除|消して', 'remove'],
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

/** Words a near miss is corrected to (one or two letters off). */
const VOCAB = [
  'button',
  'buttons',
  'card',
  'cards',
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
  'header',
  'banner',
  'input',
  'inputs',
  'dialog',
  'dialogs',
  'tooltip',
  'heading',
  'headings',
  'checkbox',
  'switch',
  'toggle',
  'table',
  'badge',
  'badges',
  'avatar',
  'avatars',
  'sidebar',
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
  'shadows',
  'rounded',
  'headers',
  'tables',
  'progress',
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
  'lighter',
  'brighter',
  'wider',
  'danger',
  'orange',
  'ranger',
  'rows',
  'darker',
  'thinner',
  'rounds',
  'should',
  'button',
  'buttons',
  'color',
  'colors',
  'italics',
  'border',
  'fonts',
  'title',
  'titles',
  'shade',
  'shades',
  'faded',
  'muted',
  'filled',
  'spaced',
  'wider',
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
  'header',
  'leader',
  'bigger',
  'cars',
  'care',
  'hard',
  'carts',
  'bottom',
  'botton',
  'inside',
  'tables',
  'colors',
  'colours',
  'sitch',
  'witch',
  'border',
  'sharper',
  'shadows',
  'smaller',
  'taller',
]);

/**
 * Edit distance where two swapped letters count as one edit, capped at 3.
 * @param {string} a @param {string} b
 */
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  /** @type {number[][]} */
  const d = Array.from({length: a.length + 1}, (_, i) =>
    Array.from({length: b.length + 1}, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return Math.min(3, d[a.length][b.length]);
}

/** @param {string} w */
function corrected(w) {
  if (SHORT[w]) return SHORT[w];
  if (w.length < 5 || KEEP.has(w) || VOCAB.includes(w) || !/^[a-z]+$/.test(w))
    return w;
  const limit = w.length >= 8 ? 2 : 1;
  let best = w;
  let bestD = limit + 1;
  for (const v of VOCAB) {
    const d = distance(w, v);
    if (d < bestD) [best, bestD] = [v, d];
  }
  return bestD <= limit ? best : w;
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
  const re =
    /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)|\b(?:(light|pale|dark)\s+)?([a-z]+)\b/g;
  for (const m of c.matchAll(re)) {
    const before = c.slice(Math.max(0, (m.index ?? 0) - 5), m.index);
    if (/\bnot\s*$|\bno\s*$/.test(before)) continue;
    const whole = m[0];
    if (whole.startsWith('#') || whole.includes('(')) {
      // A typed hex color keeps the case it is written in, as set stores it.
      if (parseColor(whole)) found.push([m.index ?? 0, whole, true]);
      continue;
    }
    const [shade, word] = [m[1], m[2]];
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
  'tomato',
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
  return new RegExp(`${one}(?:\\s*,\\s*${one})*`).exec(c)?.[0] ?? null;
}

/** A length tied to a height word ("40px tall", "height 40px"). @param {string} c */
const tallIn = c =>
  /\b(\d+(?:px|rem))\s+(?:tall|high)\b|\b(?:height|tall)\s*:?\s*(\d+(?:px|rem))\b/
    .exec(c)
    ?.slice(1)
    .find(Boolean) ?? null;

/** A length tied to a radius word ("8px radius", "radius: 8px"). @param {string} c */
const radiusIn = c =>
  /(-?\d*\.?\d+(?:px|rem|em)?)\s*(?:radius|corners?)\b|\b(?:radius|corners?|rounded)\s*:?\s*(?:to\s+)?(-?\d*\.?\d+(?:px|rem|em)?)\b/
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
  const w = /\b(semibold|semi-bold|medium|regular|normal)\b/.exec(c.text)?.[1];
  return w
    ? /** @type {Record<string, string>} */ ({
        semibold: '600',
        'semi-bold': '600',
        medium: '500',
        regular: '400',
        normal: '400',
      })[w]
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
 * Words for parts, longest phrase first. Each gives the part (or group),
 * and maybe a `--when` condition, a heading level or a font role.
 * @type {Array<[RegExp, {on: string, when?: string, role?: string, level?: string}]>}
 */
const PARTS = [
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
  [/\b(nav(igation)? (links?|items?)|menu items?)\b/, {on: 'top-nav-item'}],
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
  [/\b(primary|main) buttons?\b/, {on: 'button', when: 'variant:primary'}],
  [/\bsecondary buttons?\b/, {on: 'button', when: 'variant:secondary'}],
  [/\bghost buttons?\b/, {on: 'button', when: 'variant:ghost'}],
  [
    /\b(danger|destructive|delete) (buttons?|ones?|variant)\b/,
    {on: 'button', when: 'variant:destructive'},
  ],
  [/\bbuttons?\b/, {on: 'button'}],
  [/\bcards?\b/, {on: 'card'}],
  [/\b(panels?|windows?|boxes|tiles?|containers?)\b/, {on: 'containers'}],
  [/\b(banners?|alerts?|notices?|announcements?)\b/, {on: 'banner'}],
  [
    /\b(inputs?|text ?box(es)?|text ?fields?|form fields?|fields?)\b/,
    {on: 'inputs'},
  ],
  [/\b(checkbox(es)?|check ?marks?)\b/, {on: 'checks'}],
  [/\b(toggles?|switch(es)?)\b/, {on: 'switch'}],
  [/\b(table rows?|rows?|tables?)\b/, {on: 'table-row'}],
  [/\btabs?\b/, {on: 'tab'}],
  [/\b(badges?|chips?|tags?)\b/, {on: 'badge'}],
  [/\bh([1-4])\b/, {on: 'heading'}],
  [/\b(headings?|titles?)\b/, {on: 'heading'}],
  [/\b(dialogs?|modals?|popups?)\b/, {on: 'dialog'}],
  [/\btooltips?\b/, {on: 'tooltip'}],
  [/\btoasts?\b/, {on: 'toast'}],
  [/\bavatars?\b/, {on: 'avatar'}],
  [/\blinks?\b/, {on: 'link'}],
  [/\bcode\b/, {on: 'code', role: 'code'}],
  [/\bbody( text)?\b/, {on: 'body', role: 'body'}],
];

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
    /\b(round(ed|er|ness|ing)?|unround\w*|corners?|radius|radii|curv\w*|circular|circles?|pill( shaped)?|sharp(er)?|square(d|r)?)\b/.test(
      c,
    )
  )
    add('corners');
  if (
    /\b(shadows?|elevat\w*|depth|raised|lifts?|lifted|lifting|glow\w*|bevel\w*|sunken|inset|flat)\b/.test(
      c,
    )
  )
    add('shadow');
  if (
    /\b(borders?(?!-radius)|outlines?|strokes?|edges?|frames?|rings?)\b/.test(c)
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
    /\b(fonts?|typefaces?|serif|sans(-serif)?|mono(space|spaced)?)\b/.test(c) &&
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
    /\b\d+(px|rem) (text|font|labels?|type)\b/.test(c)
  )
    add('fontsize');
  if (
    (/\b(taller|shorter|wider|narrower|width|height|bigger|larger|smaller|tall)\b/.test(
      c,
    ) ||
      (/\b(thick(er)?|thin(ner)?)\b/.test(c) &&
        /\b(progress|underline|indicator)/.test(c))) &&
    !a.includes('fontsize') &&
    !a.includes('tracking')
  )
    add('size');
  if (!a.includes('family') && new RegExp(`\\b(${FONT_NAMES})\\b`).test(c))
    add('family');
  if (!a.length && /\b(thick(er)?|thin(ner)?)\b/.test(c)) add('border');
  if (
    /\b(faded|fade|opacity|see-through|washed out)\b/.test(c) ||
    /\d+%/.test(
      c.replace(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/g, ''),
    )
  )
    add('opacity');
  if (/\b(scales? (down|up)|shrinks?|grows?)\b/.test(c)) add('scale');
  if (
    /\b(text|writing|words|labels?|font colou?r|readable|links?)\b/.test(c) &&
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
 * @returns {Clause[]}
 */
function clausesOf(q) {
  // "swap X and Y" is one ask.
  const pieces = (/\bswap\b/.test(q) ? q.replace(/\band\b/g, '&') : q)
    .split(
      /;|\.(?=\s|$)|,(?![^(]*\))|\b(?:and|with|but|then|plus|also)\b|\bwhile\b|(?=\bexcept\b)/,
    )
    .map(s => s.trim())
    .filter(Boolean);
  return pieces.map(text => {
    /** @type {Clause['parts']} */
    const parts = [];
    let rest = ` ${text} `;
    const cornerWords = /\b(round|corner|radius|shape|circular)/.test(text);
    for (const [re, part] of PARTS) {
      const m = re.exec(rest);
      if (!m) continue;
      const p = {...part};
      if (p.on === 'heading' && /^h[1-4]$/.test(m[0])) p.level = m[1];
      parts.push(p);
      rest = rest.replace(re, ' ');
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
      new RegExp(`\\b(not|no)\\s+((light|dark|pale)\\s+)?(${hue})\\b`, 'g'),
      ' ',
    );
    const neg =
      /\b(no|not|don'?t|do not|never|without|remove|removing|get rid of|lose|drop|kill|none|shouldn'?t|should not|mustn'?t|turn off|turn (the|it|them) off|switch off|stop|unbold\w*|unround\w*|disable)\b/.test(
        negText.replace(/\bdisabled\b/g, ' '),
      ) && !/\bno (wait|longer)\b/.test(negText);
    // "too X" asks for less X: too sharp is rounder, too heavy is lighter.
    const tooLess =
      /\btoo (big|large|round|rounded|bold|heavy|thick|dark|spacious|airy|bright|loud|strong|harsh|much|wide|tall)\b/;
    const tooMore =
      /\btoo (small|cramped|tight|crowded|faded|light|thin|sharp|square|boxy|pointy|subtle|weak|narrow|dim|low|short)\b/;
    const dir = tooLess.test(text)
      ? 'less'
      : tooMore.test(text)
        ? 'more'
        : /\b(less|fewer|smaller|lower|reduce|softer|lighter|thinner|narrower|shorter|tight(er)?|dense(r)?|denser|compact|sharper|squarer|subtler|tone down|dimmer)\b/.test(
              text,
            )
          ? 'less'
          : /\b(more|bigger|larger|higher|increase|stronger|thicker|wider|taller|rounder|roomier|airy|spacious|bolder|heavier|darker|a bit|a little|slightly|much)\b/.test(
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
      /\bdark( mode| theme)?\b/.test(text) &&
      /\b(mode|theme|in dark)\b/.test(text)
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
      neg,
      dir,
      colors: colorsIn(text),
      bad: badHex(text),
      lengths: lengthsIn(text),
      state,
      mode,
      except,
      decl,
    };
  });
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
  let q = question
    .normalize('NFKC')
    .replace(/\p{Cc}/gu, ' ')
    // Code-shaped asks: camelCase keys, JSON and CSS punctuation, dotted
    // paths ("primaryColor=#3b82f6", {"accent": ...}, theme.colors.primary).
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[{}"`]/g, ' ')
    .replace(/(?<=[a-z])\.(?=[a-z])/gi, ' ')
    .replace(/(?<![\w-])\.(?=[a-z])/gi, ' ')
    .replace(/\s*=\s*/g, ' ')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");
  for (const [re, w] of TRANSLATE) q = q.replace(re, w);
  q = q
    .replace(/\bbutton-s\b/g, 'buttons')
    .replace(/[a-z]+/g, w => corrected(w))
    .replace(/\b(everything|everywhere|all) but\b/g, '$1 except')
    .replace(
      /\b(apart from|other than|excluding|but not (on|in|for)|but not)\b/g,
      'except',
    )
    .replace(/\s+/g, ' ')
    .trim();
  const clauses = clausesOf(q);
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
    // "brand blue, #0057ff": a clause that is only a color belongs to the
    // clause before it.
    if (
      prev &&
      !c.parts.length &&
      !c.aspects.length &&
      c.colors.length &&
      c.text
        .replace(/#[0-9a-f]+|\b(?:rgba?|hsla?|oklch)\([^)]*\)/g, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length <= 1
    ) {
      prev.colors = [...c.colors, ...prev.colors];
      c.colors = [];
      c.text = '';
    }
  }
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
   * The state a part takes for a state word, as `set` names it.
   * @param {string} on @param {string} word
   */
  const stateFor = (on, word) => {
    const t = TARGET.get(one(on));
    const states = [...(t?.states ?? []), ...COMMON_STATES];
    if (word === 'focus') {
      const conds = JSON.stringify(C.MAP[one(on)]?.own ?? {});
      for (const s of ['focus-within', 'focus-visible', 'focus'])
        if (conds.includes(`:${s}`)) return s;
      return 'focus-visible';
    }
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
    const options = d.options.filter(o => o.length);
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
      const color = colorFor(c, 'fill') ?? (c.neg ? null : null);
      if (!color) return null;
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
      const now = current('--color-overlay', c.mode ?? 'light');
      const value =
        colorFor(c, 'fill') ??
        (c.dir || c.neg
          ? stronger(now, c.dir === 'more' ? 1.5 : 0.6, c.mode ?? 'light')
          : null);
      if (!value) return null;
      return {
        text: `the dimmed layer behind dialogs and drawers: --color-overlay (now ${now})`,
        options: [[set('--color-overlay', value, modeOf(c))]],
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
        const font = fontIn(c.text, question);
        return font
          ? {
              text: `the ${p.role} font: font --on ${p.role}`,
              options: [[set('font', font, {on: p.role})]],
            }
          : null;
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
        const n = /\b(\d(?:\.\d+)?)\b(?!\s*(px|rem|em|%))/.exec(c.text)?.[1];
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
        const px =
          (tied && /^-?\d*\.?\d+$/.test(tied) ? `${tied}px` : tied) ??
          c.lengths.find(l => l !== tall) ??
          null;
        if (px?.startsWith('-'))
          return {
            text: `a radius cannot be negative ("${px}"); give a size of 0 or more`,
            options: [],
          };
        // "too sharp" asks for rounder, not square.
        const shapeText = c.text.replace(/\btoo \w+/g, ' ');
        const shape =
          c.neg || /\b(square(d)?|sharp)\b/.test(shapeText)
            ? 'square'
            : /\b(pill|circular|circles?|fully round)\b/.test(shapeText)
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
        if (!on)
          return {
            text: `corners${where}: the corners dial (sets the corner tokens together)`,
            options: [[set('corners', value)]],
          };
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
        const strong =
          /\b(strong(er)?|deep(er)?|heav(y|ier)|bigger|more)\b/.test(c.text);
        const soft = /\b(soft(er)?|subtle(r)?|light(er)?|gentle|less)\b/.test(
          c.text,
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
        if (c.neg)
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
            /\b(darker|lighter|subtle\w*|contrast|stronger|fainter|softer|visible|invisible)\b/.test(
              c.text,
            )
          ) {
            const now = current('--color-border', c.mode ?? 'light');
            const more =
              /\b(darker|stronger|more contrast|visible)\b/.test(c.text) &&
              !/\binvisible\b/.test(c.text);
            const value = stronger(now, more ? 2 : 0.5, c.mode ?? 'light');
            return value
              ? {
                  text: `the border color of the whole theme: --color-border (now ${now})`,
                  options: [[set('--color-border', value, modeOf(c))]],
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
        const tight = /\b(tight(er)?|narrow(er)?|less|condensed)\b/.test(
          c.text,
        );
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
        const font = fontIn(c.text, question);
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
            : C.partReads(one(on), 'font').find(r =>
                r.props.includes('font-size'),
              )?.token;
        const now = sizeTok ? current(sizeTok) : null;
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
        const pct = /\b(\d{1,3})%/.exec(c.text)?.[1];
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
        const tall = tallIn(c.text);
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
          const now = current(tok, c.mode ?? 'light');
          const darker =
            /\b(darker|too light|can'?t read|hard to read|unreadable|more contrast)\b/.test(
              c.text,
            );
          // "never use pure black": a near color that is not it.
          const avoid = c.neg && color;
          const value =
            (avoid
              ? (parseColor(color)?.reduce((x, y) => x + y, 0) ?? 0) < 384
                ? '#1f2937'
                : '#f9fafb'
              : color) ??
            (darker
              ? shift(now, c.mode === 'dark' ? 0.25 : -0.3)
              : /\b(less bright|dimmer|softer|lighter)\b/.test(c.text)
                ? shift(now, c.mode === 'dark' ? -0.15 : 0.25)
                : null);
          if (!value) return null;
          return {
            text: `${tok === '--color-text-secondary' ? 'secondary' : 'main'} text color${c.mode && modal ? ` in ${c.mode} mode` : ''}: ${tok} (now ${now})`,
            options: [[set(tok, value, modeOf(c))]],
          };
        }
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
          const now = current('--color-background-body', c.mode ?? 'light');
          const color =
            colorFor(c, 'fill') ??
            (c.dir
              ? shift(now, /\blight(er)?|brighter\b/.test(c.text) ? 0.5 : -0.06)
              : null);
          if (!color) return null;
          return {
            text: `the page background: --color-background-body${c.mode && modal ? ` in ${c.mode} mode` : ''}`,
            options: [[set('--color-background-body', color, modeOf(c))]],
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
          const tok =
            C.partReads(one(on), 'background').find(r => r.when.includes(''))
              ?.token ??
            (FAMILIES.containers.includes(one(on))
              ? '--color-background-card'
              : '--color-background-surface');
          const now = tok ? current(tok, c.mode ?? 'light') : null;
          const lighter = /\blight(er)?\b/.test(c.text);
          color = now ? shift(now, lighter ? 0.12 : -0.12) : null;
          if (color && f.state)
            return {
              text: `${lighter ? 'a lighter' : 'a darker'} background${where}`,
              options: [
                [set('filter', `brightness(${lighter ? 1.1 : 0.9})`, f)],
                [set('background-color', color, f)],
              ],
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
      const sec = current('--color-text-secondary');
      const border = current('--color-border');
      /** @type {Step[]} */
      const steps = [];
      const darkerSec = shift(sec, -0.35);
      if (darkerSec) steps.push(set('--color-text-secondary', darkerSec));
      const strongBorder = stronger(border, 2.5, 'light');
      if (strongBorder) steps.push(set('--color-border', strongBorder));
      return {
        text: `more contrast: darker secondary text (now ${sec}) and stronger borders (now ${border}), in light mode`,
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
    if (/\b(undo|revert|go back|take back)\b/.test(t))
      return {
        text: `undo ${env.slug} steps back one change; undo ${env.slug} <thing> removes one setting`,
        options: [],
        ...(env.exists ? {lookup: `${P} undo ${env.slug}`} : {}),
      };
    if (/\breset\b|\bstart over\b|\bback to (the )?defaults?\b/.test(t))
      return {
        text: `each undo ${env.slug} steps back one change; show ${env.slug} lists every setting, and undo ${env.slug} <thing> removes one`,
        options: [],
        ...(env.exists ? {lookup: `${P} show ${env.slug}`} : {}),
      };
    if (/\b(dark|light)\b/.test(t) && /\b(mode|theme|only)\b/.test(t))
      seenAspect('mode');
    if (/\bdark[- ]?(mode|theme)? only\b|\bonly dark\b|\bdark-only\b/.test(t))
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
        text: 'Every shade of every color, light and dark, with the tokens that use each, is on the Colors page of the in-app preview. It changes with every set.',
        options: [],
        ...(env.exists
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
    // A color the theme generates, named by its role.
    const roles = /** @type {Array<[RegExp, string, string]>} */ ([
      [
        /\b(accent|brand|primary colou?r|main colou?r|key colou?r)\b|\bprimary\s*:?\s*(?=#|rgb|hsl|oklch)/,
        'accent',
        '--color-accent',
      ],
      [/\b(errors?|danger|destructive)\b/, 'danger', '--color-error'],
      [/\b(success|positive)\b/, 'success', '--color-success'],
      [/\b(warnings?|caution)\b/, 'warning', '--color-warning'],
      [/\b(info|notices?)\b/, 'info', '--color-info'],
      [
        /\b(neutrals?|gr[ae]ys?|warm(er)?|cool(er)?)\b/,
        'neutral',
        '--color-neutral',
      ],
    ]);
    const role = roles.find(([re]) => re.test(t));
    if (role) {
      seenAspect('colors');
      const [, dial, token] = role;
      let color =
        c.colors.find(
          x =>
            !(
              dial === 'neutral' &&
              ['#9ca3af', '#e5e7eb', '#374151', '#f3f4f6'].includes(x)
            ),
        ) ?? null;
      if (dial === 'neutral' && !color)
        color = /\bwarm(er)?\b/.test(t)
          ? '#78716c'
          : /\bcool(er)?\b/.test(t)
            ? '#64748b'
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
      if (!color && c.dir) {
        const now = current(token, c.mode ?? 'light');
        const lighter = /\b(light(er)?|brighter|paler)\b/.test(t);
        color = shift(now, lighter ? 0.2 : -0.2);
        if (color && c.mode && modal)
          return {
            text: `${dial} in ${c.mode} mode: the exact token ${token} (now ${now}), only in ${c.mode} mode`,
            options: [[set(token, color, modeOf(c))]],
          };
      }
      // No color given: say how, and never pick one.
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
    return null;
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
    if (
      !C.MAP[one(on)] ||
      ![
        'text',
        'background',
        'border',
        'corners',
        'shadow',
        'spacing',
        'font',
        'size',
      ].includes(group)
    )
      return '';
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
    const all = [...last.values()].map(x => x.step);
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

/**
 * A font a clause names: a preset, an open font, or a family written with
 * capitals in the question.
 * @param {string} c the clause, lower-case
 * @param {string} question the question as typed
 */
function fontIn(c, question) {
  if (/\bmono(space|spaced)?\b/.test(c)) return 'mono';
  if (/\bsans(-serif)?\b/.test(c)) return 'system';
  if (/\bserif\b/.test(c)) return 'serif';
  for (const k of [...Object.keys(OPEN_FONTS), ...Object.keys(FONTS)]) {
    const words = k.replace(/-/g, ' ');
    if (new RegExp(`\\b${words}\\b`).test(c)) return k;
  }
  const typed =
    /\b(?:use|font|typeface)\s+["']?([A-Z][\w-]*(?: [A-Z][\w-]*)?)["']?/.exec(
      question,
    )?.[1];
  return typed ?? null;
}
