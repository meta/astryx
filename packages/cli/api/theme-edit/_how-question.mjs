// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A plain-words question for `how`, read clause by clause: the parts
 * it names (with a variant, size, state or mode), what to change about
 * them, the values typed in it, and whether it asks for more, less or none.
 * Each clause becomes the commands that do exactly that; `how` then keeps
 * only the commands `set` accepts and that change the theme.
 * @position api/theme-edit — imported only by _how.mjs
 */

import {
  COLOR_IN_VALUE,
  COLOR_NAMES,
  alphaOf,
  hex,
  parseColor,
  ratio,
} from './_color.mjs';
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
import {focusStateOf, innerTextTokens, partRuleTokens} from './_settings.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {cssProperties, keywordsOf, matchValue, splitTop} from './_css.mjs';

/** @typedef {import('./_how-commands.mjs').Step} Step */
/** @typedef {import('./_how-commands.mjs').MeasureIntent} MeasureIntent */

/**
 * One answer: what it does, and the ways to do it. Each option is a list of
 * steps run in order; most options are one step.
 * @typedef {{text: string, options: Step[][], sequence?: boolean, lookup?: string, intent?: MeasureIntent}} Draft
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
  // A part's name, never a near miss of "radius".
  'radio',
  'radios',
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
  // "a light tint of the accent": the accent mixed with see-through, so the
  // fill beneath shows (never the full accent).
  [
    /\b(?:light|soft|pale|subtle|faint) (?:tint|wash) of (?:the )?(?:accent|brand|primary)(?: colou?r)?\b/,
    'color-mix(in srgb, var(--color-accent) 15%, transparent)',
    'var(--color-text-accent)',
  ],
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
  const found = colorsFound(c);
  // "success green should be more minty": the color after "be" or "to"
  // is the one asked for.
  // A color written out (hex, rgb()...) beats a color word: "brand blue,
  // #0057ff" is #0057ff.
  const turn = /\b(to|be|into|become|instead)\b/.exec(c);
  const at = turn ? (turn.index ?? 0) : -1;
  return found
    .sort((a, b) => Number(b[0] > at) - Number(a[0] > at))
    .sort((a, b) => Number(Boolean(b[2])) - Number(Boolean(a[2])))
    .map(([, v]) => v);
}

/**
 * The colors written in a clause in the order written (a gradient's stops):
 * no color counts as the one asked for.
 * @param {string} c a clause, lower-case
 * @returns {string[]}
 */
function colorsWritten(c) {
  return colorsFound(c).map(([, v]) => v);
}

/**
 * Each color a clause writes, with where it starts and whether it is
 * written out (hex, a color function), sorted by where it starts.
 * @param {string} c a clause, lower-case
 * @returns {Array<[number, string, boolean?]>}
 */
function colorsFound(c) {
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
  return found.sort((a, b) => a[0] - b[0]);
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
  /(-?\d*\.?\d+(?:px|rem|em|%)?)\s*(?:border[\s-]+)?(?:radius|corners?)\b|\b(?:radius|corners?|rounded)\s*(?:values?\s+)?(?:are|is|of|at)?\s*:?\s*(?:to\s+)?(?:about\s+|around\s+)?(-?\d*\.?\d+(?:px|rem|em|%)?)(?:\b|(?<=%))(?!\s*(?:more\s+)?(?:steps?|sizes?|notches?|levels?)\b)/
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
 * Warmer or cooler: mix in a warm (amber) or cool (blue) tint and keep the
 * color's lightness, so the hue moves and the light/dark does not.
 * @param {string} color @param {'warm' | 'cool'} way @param {number} amount 0 to 1
 */
export function tempShift(color, way, amount) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const tint = way === 'warm' ? [255, 170, 80] : [80, 150, 255];
  const mixed = rgb.slice(0, 3).map((x, i) => x + (tint[i] - x) * amount);
  const lum = (/** @type {number[]} */ v) =>
    0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  const k = lum(mixed) > 0 ? lum(rgb) / lum(mixed) : 1;
  const out = mixed.map(x => Math.max(0, Math.min(255, x * k)));
  // Clipped at white: pull the brightest channel back so the hue still shows.
  return hex(out);
}

/**
 * The overlay made lighter or darker: only its alpha moves, by the amount
 * asked (a step is a quarter), and it never turns fully opaque or vanishes.
 * @param {string} now @param {{text: string, dir: string | null, neg: boolean}} c
 */
function overlayAlpha(now, c) {
  const rgb = parseColor(now);
  if (!rgb) return null;
  const a = alphaOf(now);
  // "more transparent / see-through", "fainter": a lower alpha, whatever
  // "more" says; "more opaque", "less transparent": a higher one.
  const seeThrough =
    /\b(transparent|see[- ]through|translucent|fainter|lighter|lighten|subtle|softer|weaker)\b/.test(
      c.text,
    ) && !/\bless (transparent|see[- ]through|translucent)\b/.test(c.text);
  const darker = seeThrough
    ? false
    : /\bless (transparent|see[- ]through|translucent)\b|\bmore opaque\b|\bopaquer\b/.test(
        c.text,
      ) ||
      (c.dir === 'more' && !c.neg && !/\blight(er|en)?\b/.test(noMode(c.text)));
  const amount = colorAmount(c.text, 0.25);
  const next = Math.max(
    0.05,
    Math.min(0.9, darker ? a * (1 + amount) : a * (1 - amount)),
  );
  const byte = Math.round(next * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex(rgb.slice(0, 3))}${byte}`;
}

/**
 * A box-shadow with each layer's blur scaled (the third length); offsets,
 * spread, inset and color stay. Null when no layer has a blur to scale.
 * @param {string} shadow @param {number} f
 */
export function blurScaled(shadow, f) {
  const layers = String(shadow).split(/,(?![^(]*\))/);
  let changed = false;
  const out = layers.map(layer => {
    // The lengths outside any function (a color's numbers are not
    // lengths): the third is the blur.
    let depth = 0;
    let count = 0;
    let res = '';
    const re = /[()]|-?\d*\.?\d+(?:px|rem|em)?(?![\w.%])/g;
    let last = 0;
    for (let m = re.exec(layer); m; m = re.exec(layer)) {
      const tok = m[0];
      if (tok === '(') depth++;
      else if (tok === ')') depth--;
      else if (
        (depth === 0 && /^-?\d/.test(tok)) ||
        (depth === 0 && /^-?\./.test(tok))
      ) {
        const before = layer[m.index - 1];
        if (m.index === 0 || /\s/.test(before ?? ' ')) {
          count++;
          if (count === 3) {
            const n = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(tok);
            if (n) {
              const unit = n[2] ?? 'px';
              const v = Number(n[1]) * f;
              res +=
                layer.slice(last, m.index) +
                `${Number(v.toFixed(unit === 'px' ? 2 : 3))}${unit}`;
              last = m.index + tok.length;
              changed = true;
            }
          }
        }
      }
    }
    return res + layer.slice(last);
  });
  return changed ? out.join(',') : null;
}

/**
 * The share a color amount gives ("30% lighter", "half as dark"): a
 * number from 0 to 0.9, or the fallback.
 * @param {string} text @param {number} fallback
 */
export function colorAmount(text, fallback) {
  const pct = /(\d{1,3}(?:\.\d+)?)\s?%/.exec(text);
  if (pct) return Math.min(0.9, Number(pct[1]) / 100);
  if (/\b(a (little|bit|touch)|slightly|a tad)\b/.test(text))
    return fallback / 2;
  if (/\b(much|a lot|way|far)\b/.test(text)) return Math.min(0.9, fallback * 2);
  return fallback;
}

/**
 * {@link shift} that keeps a see-through color see-through: its alpha
 * stays, only its hue moves. A see-through ink paints over the page, so
 * whether more of it is lighter is read against that page's color.
 * @param {string} color @param {number} amount
 * @param {string | null} [page] the page color it paints over (white when
 *   not given)
 */
export function shiftKeepAlpha(color, amount, page = null) {
  // rgb()/rgba()/hsl()/hwb()/lab()/oklch() with an alpha: the same color as
  // #rrggbbaa, so its alpha stays too.
  const fn =
    /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((.*)\)$/i.exec(
      String(color).trim(),
    )?.[1] ?? null;
  if (fn) {
    const alphaText =
      /\/\s*([\d.]+%?)\s*$/.exec(fn)?.[1] ??
      (/^\s*rgba|^\s*hsla/i.test(String(color).trim())
        ? /,\s*([\d.]+%?)\s*$/.exec(fn)?.[1]
        : undefined);
    const rgb = parseColor(color);
    if (alphaText && rgb) {
      const a = alphaText.endsWith('%')
        ? Number.parseFloat(alphaText) / 100
        : Number(alphaText);
      if (a >= 0 && a < 1) {
        const byte = Math.max(0, Math.min(255, Math.round(a * 255)));
        return shiftKeepAlpha(
          `${hex(rgb.slice(0, 3))}${byte.toString(16).padStart(2, '0')}`,
          amount,
          page,
        );
      }
    }
  }
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(String(color).trim());
  if (!m) return shift(color, amount);
  // A see-through ink: lighter means less of an ink darker than the page
  // (fainter) or more of one lighter than it (stronger); its hue stays.
  const rgb = parseColor(`#${m[1]}`) ?? [0, 0, 0];
  const under = (page ? parseColor(page) : null) ?? [255, 255, 255];
  const sum = (/** @type {number[]} */ v) => v[0] + v[1] + v[2];
  const darkInk =
    sum(rgb) < sum(under) || (sum(rgb) === sum(under) && sum(rgb) < 382);
  const k = Math.min(0.9, Math.abs(amount) * 2.5);
  const f = amount > 0 === darkInk ? 1 - k : 1 + k;
  const a = Math.max(1, Math.min(255, Math.round(parseInt(m[2], 16) * f)));
  return `#${m[1]}${a.toString(16).padStart(2, '0')}`;
}

/**
 * The color token a part reads at rest for a group (its fill or its text):
 * the variant asked for, else its main variant (primary, accent), else any
 * read at rest; never a pressed or hover overlay.
 * @param {Array<{token: string, when: string[]}>} reads
 * @param {string} [when] a variant asked for, `variant:primary`
 * @returns {string | null}
 */
export function restColorRead(reads, when) {
  const rest = reads.filter(
    r =>
      /^--color-/.test(r.token) &&
      !/overlay|transparent|tint/.test(r.token) &&
      r.when.some(w => !w.includes(':')),
  );
  const asked = when ? when.replace(':', '=') : null;
  return (
    (
      (asked ? rest.find(r => r.when.includes(asked)) : null) ??
      rest.find(r =>
        r.when.some(w => w === '' || /=(primary|accent)$/.test(w)),
      ) ??
      rest[0] ??
      null
    )?.token ?? null
  );
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
  // A fraction of a pixel is a real length (hi-dpi screens draw it): kept
  // to 0.01px, never rounded away to the same value or to 0.
  return `${m[2] === 'px' ? Number(n.toFixed(2)) : Number(n.toFixed(3))}${m[2]}`;
}

/**
 * The question without its amount words ("3 times", "2x", "x2", "×2",
 * "+50%", "50 percent", "by a factor of 2"), so a number in them is never
 * read as a length.
 * @param {string} text
 */
function withoutAmount(text) {
  return text
    .replace(/\bby a factor of \d*\.?\d+\b/g, ' ')
    .replace(
      /\b(scale|multiply)\b([^.]*?)\bby \d*\.?\d+\b(?!\s*(px|rem|em|%))/g,
      '$1$2',
    )
    .replace(/\b\d*\.?\d+(?:px)?\s*(?:times|x|×)(?=\s|$|\b)/g, ' ')
    .replace(/(^|\s)[x×]\s?\d*\.?\d+\b/g, ' ')
    .replace(/(^|[\s(])[+-]\s?\d{1,3}(?:\.\d+)?(?:px)?\s?(%|percent\b)/g, ' ')
    .replace(/(?:^|\s)0?\.\d+(?:px)?\s+(?=(the|of)\b)/g, ' ')
    .replace(
      /\b\d{1,3}(?:\.\d+)?(?:px)?\s?(%|percent\b)\s*(?=(bigger|larger|more|wider|taller|thicker|higher|roomier|smaller|less|tighter|narrower|thinner|shorter|lower|transparent|opaque|strength|of|as)\b)/g,
      ' ',
    );
}

/**
 * Scale each side of a box value (`4px 8px` by 2 is `8px 16px`); a 0 side
 * stays 0. Null when a side is not a length this scales.
 * @param {string} v @param {number} f
 */
function scaledBox(v, f) {
  const sides = String(v ?? '')
    .trim()
    .split(/\s+/);
  if (!sides.length || sides.length > 4) return null;
  const out = sides.map(x => (/^0(px|rem|em)?$/.test(x) ? x : scaled(x, f)));
  return out.every(Boolean) ? out.join(' ') : null;
}

/**
 * "half the radius on buttons and cards on hover": two parts joined by
 * "and" share everything around them (the ask before, the value and state
 * after), so each piece is the whole ask for its part: "half the radius on
 * buttons on hover and half the radius on cards on hover". Within one
 * sentence or comma piece, once.
 * @param {string} q
 * @param {Array<[RegExp, PartRef]>} partWords
 * @returns {string}
 */
function sharedAsk(q, partWords) {
  return (
    q
      // The same breaks clausesOf splits at: a full stop only before a space
      // or the end (never inside 0.5rem), a comma only outside parentheses.
      .split(/([;\n]|,(?![^(]*\))|\.(?=\s|$))/)
      .map(seg => {
        const m = /\s+and\s+/.exec(seg);
        if (!m || /\band\b/.test(seg.slice(m.index + m[0].length))) return seg;
        // "everything rounder except buttons and cards": both are excepted,
        // from one ask.
        if (/\bexcept\b/.test(seg.slice(0, m.index))) return seg;
        // "the card and dialog corners match": one ask about both.
        if (/\b(match|equally|alike|the same)\b/.test(seg)) return seg;
        const left = seg.slice(0, m.index);
        const right = seg.slice(m.index + m[0].length);
        for (const [re] of partWords) {
          const l = new RegExp(`(?:${re.source})\\s*$`).exec(left);
          if (!l) continue;
          for (const [re2] of partWords) {
            const r = new RegExp(`^\\s*(?:${re2.source})`).exec(right);
            if (!r) continue;
            const lead = left.slice(0, l.index);
            const tail = right.slice(r[0].length);
            // Only when something is shared: an ask on one side.
            if (!lead.trim() && !tail.trim()) return seg;
            // "the text bigger on buttons and cards red": the second part
            // has an ask of its own (a color, an aspect), so only the first
            // takes the ask before; nothing is shared.
            const tailAsk = tail
              .replace(
                /\b(?:on|when|while|in)\s+(?:hover|focus|press(?:ed)?|active|disabled|selected|dark mode|light mode)\b|\bto\s+\S+/g,
                ' ',
              )
              .trim();
            if (
              tailAsk &&
              (colorsIn(tailAsk).length || aspectsOf(tailAsk).length) &&
              (colorsIn(lead).length || aspectsOf(lead).length)
            )
              return seg;
            return `${lead}${l[0].trim()}${tail} and ${lead}${r[0].trim()}${tail}`;
          }
        }
        return seg;
      })
      .join('')
  );
}

/** The families each kind of ask may change. @type {Record<string, string[]>} */
const ASPECT_FAMILIES = {
  background: ['color', 'opacity'],
  text: ['color'],
  corners: ['radius'],
  spacing: ['space'],
  size: ['space', 'fontsize', 'border', 'radius'],
  border: ['border', 'color'],
  weight: ['weight'],
  opacity: ['opacity', 'color'],
  shadow: ['shadow', 'border', 'color'],
  fontsize: ['fontsize'],
};

/** A step count: "two steps bigger", "3 sizes smaller", "two notches rounder". */
const STEP_COUNT =
  /\b(two|three|four|five|2|3|4|5)\s+(?:more\s+)?(?:steps?|sizes?|notches?|levels?|(?:spacing\s+)?units?)\b/;
/** @type {Record<string, number>} */
const WORD_NUMBERS = {two: 2, three: 3, four: 4, five: 5};

/**
 * A color's hue in degrees, or null for one that does not read or a gray.
 * @param {string} color
 * @returns {number | null}
 */
export function hueOf(color) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(v => v / 255);
  const max = Math.max(r, g, b);
  const dlt = max - Math.min(r, g, b);
  if (dlt < 0.04) return null;
  const h =
    max === r
      ? ((g - b) / dlt) % 6
      : max === g
        ? (b - r) / dlt + 2
        : (r - g) / dlt + 4;
  return (h * 60 + 360) % 360;
}

/**
 * A color with its hue moved toward a target hue by up to `step` degrees;
 * lightness and saturation stay. Null for a color that does not read, or
 * a gray (no hue to move).
 * @param {string} color
 * @param {number} target degrees
 * @param {number} step degrees
 */
export function hueToward(color, target, step) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const dlt = max - min;
  if (dlt < 0.04) return null;
  const sat = dlt / (1 - Math.abs(2 * l - 1));
  let h =
    max === r
      ? ((g - b) / dlt) % 6
      : max === g
        ? (b - r) / dlt + 2
        : (r - g) / dlt + 4;
  h = (h * 60 + 360) % 360;
  let diff = ((target - h + 540) % 360) - 180;
  if (Math.abs(diff) > step) diff = Math.sign(diff) * step;
  const nh = (h + diff + 360) % 360;
  const cc = (1 - Math.abs(2 * l - 1)) * sat;
  const x = cc * (1 - Math.abs(((nh / 60) % 2) - 1));
  const m = l - cc / 2;
  const [r1, g1, b1] =
    nh < 60
      ? [cc, x, 0]
      : nh < 120
        ? [x, cc, 0]
        : nh < 180
          ? [0, cc, x]
          : nh < 240
            ? [0, x, cc]
            : nh < 300
              ? [x, 0, cc]
              : [cc, 0, x];
  return hex([r1 + m, g1 + m, b1 + m].map(v => Math.round(v * 255)));
}

/**
 * A color written with a new alpha, in the form it was written: a hex color
 * as 8-digit hex, a `/ alpha` or rgba()/hsla() alpha replaced, an opaque
 * color function given one.
 * @param {string} color
 * @param {number} a 0 to 1
 */
function withAlpha(color, a) {
  const c = color.trim();
  const round = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
  if (c.startsWith('#')) {
    const rgb = parseColor(c);
    if (!rgb) return color;
    return `${hex(rgb.slice(0, 3))}${Math.round(a * 255)
      .toString(16)
      .padStart(2, '0')}`;
  }
  const slash = /\/\s*[\d.]+(%?)\s*\)$/.exec(c);
  if (slash)
    return c.replace(
      /\/\s*[\d.]+%?\s*\)$/,
      slash[1] ? `/ ${Math.round(a * 1000) / 10}%)` : `/ ${round(a)})`,
    );
  const legacy =
    /^(rgba?|hsla?)\(([^,()]*),([^,()]*),([^,()]*)(?:,[^,()]*)?\)$/i.exec(c);
  if (legacy)
    return `${legacy[1].replace(/a$/i, '')}a(${legacy[2].trim()}, ${legacy[3].trim()}, ${legacy[4].trim()}, ${round(a)})`;
  return c.replace(/\)$/, ` / ${round(a)})`);
}

/**
 * A shadow with the alpha of each of its colors scaled (clamped to 0–1),
 * layers, offsets and blur kept; with a mode, only that half of each
 * light-dark() color.
 * @param {string} value
 * @param {number} k
 * @param {'light' | 'dark' | null} [mode]
 */
export function shadowAlphaScaled(value, k, mode = null) {
  /** @param {string} part */
  const scale = part =>
    part.replace(COLOR_IN_VALUE, c =>
      withAlpha(c, Math.max(0, Math.min(1, alphaOf(c) * k))),
    );
  if (!mode) return scale(value);
  // A named mode: that half of each light-dark() color; a color written as
  // one value becomes a light-dark() pair with only that mode's half scaled.
  const PAIR =
    /light-dark\(((?:[^(),]|\([^()]*\))*),\s*((?:[^(),]|\([^()]*\))*)\)/g;
  return value
    .split(/(light-dark\((?:[^(),]|\([^()]*\))*,\s*(?:[^(),]|\([^()]*\))*\))/g)
    .map(piece =>
      /^light-dark\(/.test(piece)
        ? piece.replace(
            PAIR,
            (_m, a, b) =>
              `light-dark(${mode === 'light' ? scale(a) : a}, ${mode === 'dark' ? scale(b) : b})`,
          )
        : piece.replace(COLOR_IN_VALUE, c => {
            const scaled = scale(c);
            if (scaled === c) return c;
            return mode === 'dark'
              ? `light-dark(${c}, ${scaled})`
              : `light-dark(${scaled}, ${c})`;
          }),
    )
    .join('');
}

/**
 * An example value of the right kind for a property, as words.
 * @param {string} prop
 */
function exampleOf(prop) {
  if (/colou?r|^background$|^fill$|^stroke$/.test(prop))
    return 'a color such as #2563eb';
  if (/weight/.test(prop)) return 'a weight such as 700';
  if (/opacity/.test(prop)) return 'a number from 0 to 1 such as 0.8';
  if (/family/.test(prop)) return 'a font such as Georgia, serif';
  if (/shadow/.test(prop))
    return 'a shadow such as 0 2px 8px rgb(0 0 0 / 0.15)';
  return 'a length such as 16px';
}

/**
 * A bound on a length the words give, or null: the way it holds (up: at
 * least or past it), whether the bound itself is outside it (strict), the
 * limit in px, and the words as written. One reader for "bigger than 4px",
 * "no bigger than 12px", "at least 2px", "at most 8px", "under 40px".
 * @param {string} t
 * @returns {{up: boolean, strict: boolean, limit: number, said: string} | null}
 */
function boundOf(t) {
  const UP =
    /^(bigger|larger|more|wider|roomier|rounder|thicker|taller|heavier|bolder)$/;
  const cmp =
    /\b(?:(no|not)\s+)?(bigger|larger|more|wider|roomier|rounder|thicker|taller|heavier|bolder|smaller|less|tighter|narrower|sharper|thinner|shorter|lighter)\s+than\s+(\d*\.?\d+)(px|rem)\b/i.exec(
      t,
    );
  if (cmp) {
    const way = UP.test(cmp[2].toLowerCase());
    return {
      up: cmp[1] ? !way : way,
      strict: !cmp[1],
      limit: Number(cmp[3]) * (cmp[4] === 'rem' ? 16 : 1),
      said: cmp[0],
    };
  }
  const word =
    /\b(at least|at most|under|below|over|above)\s+(\d*\.?\d+)(px|rem)\b/i.exec(
      t,
    );
  if (!word) return null;
  const w = word[1].toLowerCase();
  return {
    up: /^(at least|over|above)$/.test(w),
    strict: !/^at (least|most)$/.test(w),
    limit: Number(word[2]) * (word[3] === 'rem' ? 16 : 1),
    said: word[0],
  };
}

/**
 * The way a shadow ask moves its strength, or null: one reader for the
 * answer and the check. Mode words are no way ("stronger in light mode"),
 * and the word after "too" is what the answer moves away from.
 * @param {string} text
 * @returns {'more' | 'less' | null}
 */
function shadowWay(text) {
  const t = noMode(text).replace(/\btoo \w+/g, ' ');
  // Comparatives only: "a soft shadow" names a shadow, not a way.
  const less =
    /\b(softer|subtler|lighter|gentler|less|weaker|fainter|smaller)\b/.test(t);
  const more = /\b(stronger|deeper|heavier|bigger|darker|harder|more)\b/.test(
    t,
  );
  if (less && !more) return 'less';
  if (more && !less) return 'more';
  return null;
}

/**
 * A clause's words with its mode phrases taken out ("in light mode", "dark
 * theme", "in light"), so "darker … in light mode" reads as darker.
 * @param {string} t
 */
function noMode(t) {
  return String(t).replace(
    /\b(?:(?:in|for|on|but not in|except in) )?(?:light|dark)(?:[- ](?:mode|theme)s?)\b|\bin (?:light|dark)(?=\s*(?:[,;.!?]|$|and\b|only\b))/gi,
    ' ',
  );
}

/** A keep step for a part the change does not reach. */
const UNTOUCHED = /** @type {const} */ ('untouched');

/**
 * The part a clause measures against ("cards twice the padding of
 * buttons": buttons), by clause.
 * @type {WeakMap<object, string>}
 */
const compared = new WeakMap();

/**
 * An exact relative amount the words give ("half", "double", "twice",
 * "triple", "a third", "a quarter", "50%", "x0.8"), as a factor of the
 * theme's current value; null when the words give only a direction.
 * @param {string} text
 * @returns {number | null}
 */
export function exactFactor(text) {
  const t = text
    .toLowerCase()
    .replace(/½/g, ' 1/2 ')
    .replace(/¼/g, ' 1/4 ')
    .replace(/⅓/g, ' 1/3 ')
    .replace(/×/g, ' x ')
    .replace(/(\d)(?:px)?\s*percent\b/g, '$1%')
    .replace(/(\d)px(?=\s*(?:%|times|x\b))/g, '$1')
    .replace(/\s+/g, ' ');
  const SHRINK = /^(smaller|less|tighter|narrower|thinner|shorter|lower)$/;
  const GROW = /^(bigger|larger|more|wider|taller|thicker|higher|roomier)$/;
  /** A change by a share: "a quarter bigger", "+50%", "cut by a third". @param {number} share @param {boolean} down */
  const by = (share, down) => {
    const f = down ? 1 - share : 1 + share;
    return f >= 0 ? f : null;
  };
  const fraction = (/** @type {string} */ w) =>
    ({
      half: 0.5,
      'a half': 0.5,
      'a third': 1 / 3,
      'a quarter': 0.25,
      '1/2': 0.5,
      '1/3': 1 / 3,
      '1/4': 0.25,
    })[w] ?? null;
  // "half again as big": one and a half; "a third again": four thirds.
  if (/\bhalf again\b/.test(t)) return 1.5;
  const again = /\b(a third|a quarter|1\/3|1\/4) again\b/.exec(t);
  if (again) return /third|3/.test(again[1]) ? 4 / 3 : 1.25;
  // "a quarter bigger", "a third smaller", "cut by a third", "reduce by half".
  const share =
    /\b(a half|half|a third|a quarter|1\/2|1\/3|1\/4)\s+(bigger|larger|more|wider|taller|thicker|higher|smaller|less|tighter|narrower|thinner|shorter|lower)\b/.exec(
      t,
    );
  if (share) {
    const f = fraction(share[1]);
    if (f != null) return by(f, SHRINK.test(share[2]));
  }
  const cut =
    /\b(cut|reduce|lower|shrink|decrease|increase|raise|grow)\b[^.]*?\bby (a half|half|a third|a quarter|1\/2|1\/3|1\/4)\b/.exec(
      t,
    );
  if (cut) {
    const f = fraction(cut[2]);
    if (f != null) return by(f, !/^(increase|raise|grow)$/.test(cut[1]));
  }
  // "+50%", "-25%", "50% bigger", "100% smaller".
  const signed = /(^|[\s(])([+-])\s?(\d{1,3}(?:\.\d+)?)\s?%/.exec(t);
  if (signed) return by(Number(signed[3]) / 100, signed[2] === '-');
  const pctBy =
    /\b(\d{1,3}(?:\.\d+)?)\s?%\s*(bigger|larger|more|wider|taller|thicker|higher|roomier|smaller|less|tighter|narrower|thinner|shorter|lower)\b/.exec(
      t,
    );
  if (pctBy && Number(pctBy[1]) > 0)
    return by(Number(pctBy[1]) / 100, SHRINK.test(pctBy[2]));
  const pct = /\b(\d{1,3}(?:\.\d+)?)\s?%\s*(?:strength|of|as)\b/.exec(t);
  if (pct && Number(pct[1]) > 0) return Number(pct[1]) / 100;
  if (/\b(half|halve|halved|1\/2)\b/.test(t)) return 0.5;
  // "½ the padding" (read as 0.5 the padding).
  const lead = /(?:^|\s)(0?\.\d+)(?:px)?\s+(?:the|of)\b/.exec(t);
  if (lead) return Number(lead[1]);
  if (/\b(double|doubled|twice)\b/.test(t)) return 2;
  if (/\b(triple|tripled|three times)\b/.test(t)) return 3;
  if (/\b(quadruple|quadrupled|four times)\b/.test(t)) return 4;
  if (/\b(a third|1\/3)\b/.test(t)) return 1 / 3;
  if (/\b(a quarter|1\/4)\b/.test(t)) return 0.25;
  // "by a factor of 2", "scale … by 1.5", "multiply … by 2".
  const factor =
    /\bby a factor of (\d*\.?\d+)\b/.exec(t) ??
    /\b(?:scale|multiply)\b[^.]*?\bby (\d*\.?\d+)\b(?!\s*(?:px|rem|em|%))/.exec(
      t,
    );
  if (factor && Number(factor[1]) >= 0 && Number(factor[1]) <= 10)
    return Number(factor[1]);
  // "16 x 16", "24x24px": a size, never a factor.
  if (/\b\d*\.?\d+(?:px|rem|em)?\s*[x×]\s*\d*\.?\d+\b/.test(t)) return null;
  // "3 times bigger", "2 times smaller", "4 times", "2x", "1.5x", "x2".
  const nTimes =
    /\b(\d*\.?\d+)(?:px)?\s*(?:times|x)\b(?:\s+(bigger|larger|more|wider|taller|thicker|as|smaller|less|thinner|narrower))?/.exec(
      t,
    );
  if (nTimes && Number(nTimes[1]) >= 0 && Number(nTimes[1]) <= 20) {
    const n = Number(nTimes[1]);
    return nTimes[2] && SHRINK.test(nTimes[2]) ? (n > 0 ? 1 / n : null) : n;
  }
  const times = /(?:^|\s)x\s?(\d*\.?\d+)\b/.exec(t);
  if (times && Number(times[1]) >= 0 && Number(times[1]) <= 20)
    return Number(times[1]);
  void GROW;
  return null;
}

/**
 * @typedef {{on: string, when?: string, role?: string, level?: string, missing?: string}} PartRef
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
  // A context menu is its own part in Core (its items are the dropdown
  // menu's items, which it reuses).
  [/\b(context ?menus?|right[- ]click menus?)\b/, {on: 'context-menu'}],
  [/\b((dropdown )?menus?)\b/, {on: 'dropdown-menu'}],
  // A part's own header or footer ("dialog header", "card footer") is that
  // part's, never the app's top bar or footer.
  [
    /(?<!\b(?:dialog|modal|card|drawer|sheet|popover|panel|section|table|menu)s? )\bfooters?\b/,
    {on: 'layout-footer'},
  ],
  [/\b(side ?nav|sidebar|side ?panel)\b/, {on: 'side-nav'}],
  [
    /\b(app (name|title)|logo|site title|product name)\b/,
    {on: 'top-nav-heading'},
  ],
  [
    /(?<!\b(?:dialog|modal|card|drawer|sheet|popover|panel|section|table|menu)s? )\b(header|top ?bar|title ?bar|nav ?bar|app ?bar|masthead)\b/,
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
    /\b(toggles?|switch(?:e?s)?(?! (off|on|to|the|out|it|them|over|back|from)\b))\b/,
    {on: 'switch'},
  ],
  [/\b((table )?cells?)\b/, {on: 'table-cell'}],
  [/\b(table rows?|rows?|tables?)\b/, {on: 'table-row'}],
  [/\b(badges?|chips?|tags?)\b/, {on: 'badge'}],
  [/\bh([1-6])\b/, {on: 'heading'}],
  [/\b(headings?|titles?)\b/, {on: 'heading'}],
  [/\b(modals?|popups?)\b/, {on: 'dialog'}],
  [/\bcode\b/, {on: 'code', role: 'code'}],
  // Small, secondary and supporting text, captions and fine print: the
  // supporting text style, not the base size.
  [
    /\b((?:small|secondary|supporting|helper|hint|caption|muted) (?:text|copy)|fine print|captions?)\b/,
    {on: 'body', role: 'supporting'},
  ],
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
 * The words that lead a removal ("no shadow", "without borders", "remove
 * the outline", "nix the gap"), shared by the clause reader's negation and
 * every rewrite that reads a removal, so they cannot drift apart. A lead
 * governs a plain removable thing after "and" too ("no shadows and
 * borders", "remove the border and the shadow").
 */
const REMOVAL_VERBS =
  '(?:without|remove|removing|drop|get rid of|lose|ditch|kill|strip|nix|scrap)(?: all the| the| all| any)?';
const REMOVAL_LEAD = `(?:no|zero|${REMOVAL_VERBS})`;
/** The things a removal can take away. */
const REMOVABLE =
  '(?:shadows?|borders?|outlines?|padding|gaps?|backgrounds?|corners|radius|rounding|underlines?|gradients?|blur|margins?|spacing|focus rings?)';

/**
 * The words for parts: the overrides, then every theming target's name read
 * from Core's catalog, longest first; and the words a near miss is
 * corrected to.
 * @param {import('./_settings.mjs').Ctx} ctx
 */
export function partLexicon(ctx) {
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
      new RegExp(`\\b${key.replace(/-/g, '[\\s-]?')}(?:e?s)?\\b`),
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
  // Every group the editor knows, by its own name ("checks", "inputs"),
  // read from its groups table: set --on <group> takes the same words.
  /** @type {Array<[RegExp, PartRef]>} */
  const groups = Object.keys(FAMILIES).map(name => [
    new RegExp(`\\b${name.replace(/s$/, '')}s?\\b`),
    {on: name},
  ]);
  // A part's own sub-part named in words ("dialog header", "date range
  // input", "number inputs") is that catalog part, before any phrase of
  // one of its words. A sub-part Core does not have ("card header") is the
  // whole part, said in the answer.
  const keys = new Set(project.target.keys());
  /** @type {Array<[RegExp, PartRef]>} */
  const subParts = [];
  for (const key of keys) {
    if (key.includes('-')) continue;
    // "dialog close icon / button", "drawer header title": those parts.
    for (const [phrase, part] of [
      ['close (?:icon|button|x)', `${key}-header-close-icon`],
      ['header title', `${key}-header-title-block`],
    ])
      if (keys.has(part))
        subParts.push([
          new RegExp(`\\b${key}s?(?:'s)?\\s+${phrase}s?\\b`),
          {on: part},
        ]);
    for (const sub of ['header', 'footer', 'title']) {
      const real =
        sub === 'title' && keys.has(`${key}-header-title-block`)
          ? `${key}-header-title-block`
          : keys.has(`${key}-${sub}`)
            ? `${key}-${sub}`
            : null;
      // A phrase an override reads whole ("table header") keeps it.
      const phrase = `${key} ${sub}`;
      if (OVERRIDES.some(([re]) => re.exec(phrase)?.[0] === phrase)) continue;
      subParts.push([
        new RegExp(`\\b${key}s?[\\s-]${sub}s?\\b`),
        real ? {on: real} : {on: key, missing: `${key} ${sub}`},
      ]);
    }
  }
  const lex = {
    parts: [
      ...subParts,
      // A catalog name of two or more words said in full ("toggle
      // buttons", "code block header", "hover card") is that part.
      ...derived.filter(
        ([, x]) =>
          x.on.includes('-') &&
          // A phrase an override already reads whole ("progress bar",
          // "table header") keeps the override's part.
          !OVERRIDES.some(([re]) => {
            const phrase = x.on.replace(/-/g, ' ');
            return re.exec(phrase)?.[0] === phrase;
          }),
      ),
      /** @type {[RegExp, PartRef]} */ ([
        /\bselect(?:ion)?[\s-]?(?:box|menu|field|dropdown)(?:e?s)?\b/,
        {on: 'selector'},
      ]),
      // "inline code", "block quote": those parts, read whole (so their
      // first word is never a padding side).
      /** @type {[RegExp, PartRef]} */ ([/\binline[\s-]code\b/, {on: 'code'}]),
      /** @type {[RegExp, PartRef]} */ ([
        /\bblock[\s-]?quotes?\b/,
        {on: 'blockquote'},
      ]),
      // "date pickers": Core's date input.
      /** @type {[RegExp, PartRef]} */ ([
        /\bdate ?pickers?\b/,
        {on: 'date-input'},
      ]),
      ...OVERRIDES,
      ...derived,
      ...groups,
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
 * @property {Array<{on: string, when?: string, role?: string, level?: string, missing?: string}>} parts
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
    (!a.some(x =>
      ['case', 'italic', 'weight', 'family', 'fontsize', 'tracking'].includes(
        x,
      ),
    ) ||
      // "bold white text": a color word beside the text is its color too.
      new RegExp(
        `\\b(${Object.keys(HUES).join('|')}|white|black|gr[ae]y|#[0-9a-f]{3,8})\\b[^,;.]*\\btext\\b`,
      ).test(c))
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
  const pieces = (
    /\bswap\b/.test(q) ? q.replace(/\band\b/g, '&') : sharedAsk(q, partWords)
  )
    .split(
      // A font stack ("Georgia, serif") is one value, not two asks.
      /;|\.(?=\s|$)|,(?![^(]*\))(?!\s*(?:serif|sans-serif|monospace|system-ui|cursive|fantasy|ui-[a-z-]+)\b)|\b(?:and|with|but|then|plus|also|y|et|und|и)\b|\bwhile\b|(?=\bexcept\b)/,
    )
    .map(s => s.trim())
    .filter(Boolean);
  return pieces.map(text => {
    /** @type {Clause['parts']} */
    const parts = [];
    // A property name is not a part: "backdrop-filter" names no backdrop.
    let rest = ` ${text} `
      // "3 steps rounder": a count, never the stepper part.
      .replace(
        /\b(?:two|three|four|five|\d+)\s+(?:more\s+)?(?:steps?|notches?|levels?)\b/g,
        ' ',
      )
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
      if (p.on === 'heading' && /^h[1-6]$/.test(m[0])) p.level = m[1];
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
        if (new RegExp(`\\b${w}s?\\b`).test(rest)) {
          parts.push({on: w});
          break;
        }
    // "pill" names a corner shape, not a badge, when the clause is about shape.
    if (cornerWords || /\bpill( shaped)?\b/.test(text))
      for (let i = parts.length - 1; i >= 0; i--)
        if (parts[i].on === 'badge' && !/\b(badges?|chips?|tags?)\b/.test(text))
          parts.splice(i, 1);
    // "Space Grotesk headings": a font's name is a font, never its words.
    const aspects0 = aspectsOf(
      text
        .replace(new RegExp(`\\b(${FONT_NAMES})\\b`, 'g'), ' font ')
        .replace(/\bspace (mono|grotesk|grotesque)\b/g, ' font '),
    );
    // "padding 3 times bigger", "half the border width": the comparative
    // goes with the amount of the thing named, never a size change too.
    // "more transparent", "less opaque": the part's opacity, never its
    // background made transparent too.
    const seeThrough =
      /\b(more|less) (transparent|translucent|see-through|opaque)\b/.test(
        text,
      ) && parts.length > 0;
    const aspects = seeThrough
      ? ['opacity']
      : exactFactor(text) != null && aspects0.length > 1
        ? (() => {
            // An amount goes with the measured thing it names (padding,
            // corners, a font size…), never a size or motion change too.
            const SCALAR = [
              'spacing',
              'corners',
              'fontsize',
              'leading',
              'tracking',
              'opacity',
              'border',
            ];
            const named = aspects0.filter(a => SCALAR.includes(a));
            return named.length ? named : aspects0.filter(a => a !== 'size');
          })()
        : aspects0;
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
      new RegExp(
        `\\b(?:no|not|nothing|none of|don'?t|do not|never|avoid|${REMOVAL_VERBS}|none|shouldn'?t|should not|mustn'?t|turn off|turn (?:the|it|them) off|switch off|stop|unbold\\w*|unround\\w*|disable|(?:revert|undo|take back) (?:the|those|that|these|my|our|all)|(?:shadows?|borders?|underlines?|outlines?|gradients?|uppercase|caps) (?:off|out|gone))\\b`,
      ).test(
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
    // "half again", "a third again": more by that share, never less.
    const dir =
      /\bnot (\w+ ){0,2}enough\b|\b(half|a third|a quarter|1\/2|1\/3|1\/4) again\b/.test(
        text,
      )
        ? 'more'
        : /\bnot (so|as|that|too) (much|many)\b/.test(text) ||
            tooLess.test(text)
          ? 'less'
          : tooMore.test(text)
            ? 'more'
            : /\b(less|fewer|smaller|lower|reduce|decrease|shrink|minimi[sz]e|scale down|trim|softer|lighter|lighten|thinner|narrower|shorter|tight(en|er)?|dense(r)?|denser|compact|sharper|squarer|subtler|tone down|dimmer|halve|half|halved|least|minimum|min|minimal|barely|as little)\b|\bcut\b.*\bin half\b|\bx ?0?\.\d+\b|\b(knock|turn|dial|bring|tone)\b.*\bdown\b/.test(
                  text,
                )
              ? 'less'
              : /\b(more|bigger|larger|higher|increase|stronger|thicker|wider|taller|rounder|roomier|airy|spacious|bolder|heavier|darker|darken|warmer|cooler|loosen|open up|twice|double|a bit|a little|slightly|much)\b/.test(
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
        // A mode phrase in the value ("background: light mode #eee") is the
        // clause's mode, never part of the value.
        decl[m[1]] = noMode(m[2]).replace(/\s+/g, ' ').trim();
    let state = null;
    // A part whose name has a state word ("hover card") is the part, not
    // the state: read the state from the words left once parts are taken.
    const stateText = parts
      .filter(x => /hover|focus|active|disabled|selected|checked/.test(x.on))
      .reduce(
        (t, x) =>
          t.replace(
            new RegExp(`\\b${x.on.replace(/-/g, '[\\s-]?')}s?\\b`, 'g'),
            ' ',
          ),
        text,
      );
    for (const [re, s] of STATE_WORDS)
      if (re.test(stateText)) {
        state = s;
        break;
      }
    const mode =
      (/\bdark( mode| theme)?\b/.test(text) &&
        /\b(mode|theme|in dark)\b/.test(text)) ||
      // Only mode phrases: "all day" or "the selected day" is no mode.
      /\bnight (mode|theme)\b|\bat night\b|\boled\b|^dark\s*:/.test(text)
        ? 'dark'
        : /\blight (mode|theme)\b|\bin light(?=\s*(?:[,;.!?]|$|and\b|only\b))|\bday ?time\b|\bday (mode|theme)\b|\bin the day\b|^light\s*:/.test(
              text,
            )
          ? 'light'
          : null;
    // "except ghost", "except in the nav": an except clause without a part
    // is one too (a variant, or a place the answer says it cannot keep).
    const except =
      (parts.length > 0 || /^except\b/.test(text)) &&
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
        // "3 times bigger": the 3 is an amount, never a length.
        ...lengthsIn(withoutAmount(text)),
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
    // "cards with twice the padding of buttons": one comparison, not two
    // asks.
    .replace(
      /\bwith\s+(?=(?:twice|double|half|triple|three times)\s+(?:the\s+)?\w+\s+(?:of|than|as)\b)/gi,
      '',
    )
    // "just the headers bolder", "only the titles bigger": a scope, not a
    // break between asks.
    .replace(/(?<![-\w])(?:just|only)\s+(?=(?:the|my)\s+\w+\s+\w)/gi, '')
    // "headers bolder", "titles bigger": with a text word and no surface
    // word, the headings' type; with a surface word ("header background"),
    // the app header part.
    .replace(/\b(headers?|titles?)\b/gi, (m, _w, at, all) => {
      // The clause the word is in: from the last break before it (a comma,
      // semicolon, full stop or new line) to the next one after it.
      const head = String(all).slice(0, at);
      // A full stop breaks only before a space or the end (never 1.5rem).
      const breaks = [...head.matchAll(/[,;\n]|\.(?=\s|$)/g)];
      const from = breaks.length ? (breaks.at(-1)?.index ?? -1) + 1 : 0;
      const clause = String(all)
        .slice(from)
        .split(/[,;\n]|\.(?=\s|$)/)[0];
      const text =
        /\b(bold(er)?|bigger|smaller|larger|font|weight|size|serif|sans|italic|heavier|lighter|thinner|uppercase|letter[- ]?spacing|tracking|line[- ]?height)\b/i.test(
          clause,
        );
      const surface =
        /\b(background|bg|bar|border|sticky|height|shadow|color of the bar|padding|fixed)\b/i.test(
          clause,
        );
      // "table header", "accordion header", "card title": that part's own.
      // A place ("not in the header") is the header part too.
      const before = String(all).slice(Math.max(0, at - 16), at);
      const owned =
        /\b(table|column|accordion|card|dialog|modal|page|section|app|site|product|top ?nav|block|drawer|popover|panel|header)\s+$/i.test(
          before,
        ) || /\b(in|on|inside|into|across|of)\s+(the\s+|my\s+)?$/i.test(before);
      return text && !surface && !owned
        ? /s$/i.test(m)
          ? 'headings'
          : 'heading'
        : m;
    })
    // "focus ring on inputs only, at half strength": an amount alone after a
    // comma belongs to the ask before it.
    .replace(
      /,\s*(?=(?:at|with|by|to)?\s*(?:about\s+)?(?:half|double|twice|triple|a third|a quarter|\d{1,3}\s?%)(?:\s+(?:the\s+)?(?:strength|width|size|thickness|weight|intensity|as (?:much|strong|thick|wide)))?\s*(?:[;.\n]|$))/gi,
      ' ',
    )
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
    // Zero, none or no in any position is that property at 0 (or none):
    // "zero border on cards", "card corners zero", "opacity zero", "remove
    // the top padding", "padding left zero"; a shadow at 0 is no shadow.
    .replace(
      /\b(?:no|remove|get rid of|zero|drop)\s+(?:the\s+|all\s+)?(top|bottom|left|right|horizontal|vertical|side)\s+(padding|margin|spacing)\b/gi,
      '$1 $2 0',
    )
    .replace(
      /\b(?:no|remove|get rid of|drop)\s+(?:the\s+|all\s+)?(padding|margin)\s+(?:on\s+|at\s+)?(?:the\s+)?(top|bottom|left|right)\b/gi,
      '$2 $1 0',
    )
    .replace(
      /\bzero\s+(?:the\s+)?((?:border(?:[- ]?(?:width|radius))?|shadows?|drop shadows?|opacity|radius|corners?|corner radius|letter[- ]?spacing|tracking|padding|gaps?|margins?|spacing)\b)/gi,
      '$1 0',
    )
    .replace(/\b(?:to\s+)?zero\b(?![- ](?:state|width|height))/gi, m =>
      /^to/i.test(m) ? 'to 0' : '0',
    )
    .replace(
      /\b((?:drop )?shadows?)\s+(?:to\s+)?0(?![.\d]|px|rem|\s+\d)/gi,
      'no $1',
    )
    .replace(
      /\b(padding|margin)[- ](top|bottom|left|right)\s+(?:to\s+)?0(?![.\d])/gi,
      '$1-$2 0',
    )
    // One amount reader: every way of saying a share becomes the forms
    // exactFactor reads ("N% bigger", "N% of"). "up 20%" is 20% more, never
    // 20%; "2/3" and "two thirds" are that share of now; "twice as small"
    // is half.
    .replace(
      /\b(?:went |go(?:es)? |goes |going )?up (?:by )?(\d{1,3}(?:\.\d+)?)\s?(?:%|percent\b)/gi,
      '$1% bigger',
    )
    .replace(
      /\b(?:went |go(?:es)? |goes |going )?down (?:by )?(\d{1,3}(?:\.\d+)?)\s?(?:%|percent\b)/gi,
      '$1% smaller',
    )
    .replace(
      /\b(increas(?:e|es|ed|ing)|rais(?:e|es|ed|ing)|grow(?:s|n|ing)?|bump(?:ed)?(?: up)?|enlarg(?:e|ed)|boost(?:ed)?|decreas(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|lower(?:ed)?|shrink(?:s|ing)?|shrunk|cut|trim(?:med)?)\b((?:\s+(?!by\b)[a-z-]+){0,5}?)\s+(?:by\s+)?(\d{1,3}(?:\.\d+)?)\s?(?:%|percent\b)(?!\s*(?:of|as|bigger|smaller|larger|more|less)\b)/gi,
      (_m, verb, what, n) =>
        `make${what} ${n}% ${/^(decreas|reduc|lower|shrink|shrunk|cut|trim)/i.test(verb) ? 'smaller' : 'bigger'}`,
    )
    // "2 spacing units more": a count of steps, not a value.
    .replace(
      /\b(\d{1,2}|two|three|four|five) spacing units? (more|less|bigger|smaller)\b/gi,
      '$1 steps $2',
    )
    // "2 spacing units": that many of the spacing unit token, so it follows
    // the spacing dial.
    .replace(
      /\b(\d{1,2}(?:\.\d+)?|two|three|four|five|six|eight) spacing units?\b/gi,
      (_m, n) =>
        `calc(${{two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8}[String(n).toLowerCase()] ?? n} * var(--spacing-1))`,
    )
    // "a semi-transparent button background", "the badge background 30%
    // transparent": the fill's own color with that alpha (never the whole
    // part's opacity, never an overlay).
    .replace(
      /\b(?:semi[- ]?transparent|translucent|see[- ]through|half[- ]transparent)\s+((?:[a-z]+\s+){0,2})(background|fill)\b/gi,
      '$1background alpha 0.5',
    )
    .replace(
      /\b(background|fill)\s+(?:semi[- ]?transparent|translucent|see[- ]through|half[- ]transparent)\b/gi,
      'background alpha 0.5',
    )
    .replace(
      /\b(background|fill)\s+(\d{1,2})\s?%\s+transparent\b/gi,
      (_m, _b, n) =>
        `background alpha ${Number((1 - Number(n) / 100).toFixed(2))}`,
    )
    // See-through amounts are opacity amounts, never no fill: "semi
    // transparent" and "half transparent" are opacity 0.5, "10% transparent"
    // is opacity 0.9, "50% opacity" and "80% opaque" are that opacity.
    .replace(
      /\b(?:semi|half)[- ]?(?:transparent|see[- ]?through|translucent)\b/gi,
      'opacity 0.5',
    )
    .replace(
      /\b(\d{1,3}(?:\.\d+)?)\s?(?:%|percent\b)\s*(?:transparent|see[- ]?through|translucent|transparency)\b/gi,
      (m, n) =>
        Number(n) <= 100
          ? `opacity ${Number((1 - Number(n) / 100).toFixed(3))}`
          : m,
    )
    .replace(
      /\b(backgrounds?|bg|fills?)\s+(?:at\s+)?(\d{1,3}(?:\.\d+)?)\s?(?:%|percent\b)\s*(?:opacity|opaque)\b/gi,
      (m, layer, n) =>
        Number(n) <= 100
          ? `${layer} opacity ${Number((Number(n) / 100).toFixed(3))}`
          : m,
    )
    // "5% gray", "20% blue": that color at that alpha, a fill kept.
    .replace(
      /\b(\d{1,3}(?:\.\d+)?)\s?%\s+((?:light |dark )?(?:gr[ae]y|black|white|blue|red|green|yellow|orange|purple|pink|teal|cyan|indigo|violet|brown|navy)|#[0-9a-f]{3,8})\b(?!\s*(?:lighter|darker|more|less|bigger|smaller))/gi,
      (m, n, color) =>
        Number(n) <= 100
          ? `color-mix(in srgb, ${color.replace(/\s+/g, '').replace('grey', 'gray')} ${n}%, transparent)`
          : m,
    )
    .replace(/\bhalf as much again\b/gi, 'half again')
    // "card padding +4px", "radius -2px": a change by that length.
    .replace(
      /(?<!letter[- ]|line[- ])\b(padding|gaps?|radius|corners|font[- ]size|text[- ]size|spacing)\s+([+-])\s?(\d*\.?\d+)(px|rem|em)\b/gi,
      (_m, what, sign, n, unit) =>
        `${what} by ${n}${unit} ${sign === '-' ? 'less' : 'more'}`,
    )
    // "h1 twice as big as body text", "h3 the same size as h2", "h2 half
    // the size of h1": the other's size token times the amount, so it
    // follows that size.
    .replace(
      /\b(h[1-6])\s+(?:text\s+)?(?:(?:(twice|double|half|triple|three times|\d*\.?\d+\s?(?:x|times))\s+as\s+(?:big|large)\s+as)|(?:the\s+)?(same)\s+size\s+as|(?:(twice|double|half|triple)\s+the\s+size\s+of))\s+(?:the\s+)?(h[1-6]|body(?:\s+text)?|base\s+text)\b/gi,
      (m, level, amount, same, amount2, other) => {
        const f = same ? 1 : exactFactor(String(amount ?? amount2));
        if (f == null || f <= 0) return m;
        const tok = /^h/i.test(other)
          ? `--text-heading-${other.slice(1)}-size`
          : '--text-body-size';
        return f === 1
          ? `${level} font size var(${tok})`
          : `${level} font size calc(${Number(f.toFixed(3))} * var(${tok}))`;
      },
    )
    // "the nav links bolder and the active one blue": "the active one" is
    // the same parts in that state.
    .replace(
      /\b((?:[a-z]+ )?[a-z]+s)\b([^,;.\n]*?)\band the (active|selected|current|disabled|hovered|focused|checked|open) ones?\b/gi,
      '$1$2and the $3 $1',
    )
    // "the overlay behind dialogs": the overlay; the dialog is where it is.
    .replace(
      /\b(overlay|backdrop|scrim)\s+(?:behind|under|beneath|below|for|of|around)\s+(?:the\s+|a\s+)?(?:dialogs?|modals?|drawers?|sheets?)\b/gi,
      '$1',
    )
    // "the shadow sharper": less blur on the shadow, never sharper corners.
    .replace(
      /\b((?:drop |box )?shadows?)\s+((?:a (?:bit|little|touch) |slightly |much )?)sharper\b/gi,
      '$1 $2less blur',
    )
    .replace(/\bsharper\s+((?:drop |box )?shadows?)\b/gi, '$1 less blur')
    // "body text thinner": a thinner stroke, so a lighter weight; never the
    // border width.
    .replace(
      /\b(text|font|type(?:face)?|copy|letters|lettering|writing|headings?|labels?)\s+((?:a (?:bit|little|touch) |slightly |much )?)thinner\b/gi,
      '$1 weight $2lighter',
    )
    // "h1 800": a bare 100-900 after a heading level is its weight.
    .replace(
      /\b(h[1-6])\s+([1-9]00)(?:\s+weight)?\b(?!\s*(?:px|rem|em|%|ms)\b)/gi,
      '$1 weight $2',
    )
    // "h1 800 and the other headings 600": "the other headings" are the
    // levels not named, each with that ask.
    .replace(
      /(?:,\s*|\s+)(?:and\s+)?(?:all\s+)?(?:the\s+)?(?:other|rest of the|remaining)\s+(?:heading levels|headings)\b([^,;.\n]*)/gi,
      (m, rest, at, all) => {
        const named = new Set(
          [...String(all).matchAll(/\bh([1-6])\b/gi)].map(x => Number(x[1])),
        );
        if (!named.size || !String(rest).trim()) return m;
        const ask = String(rest)
          .trim()
          .replace(/^(?:weight\s+)?([1-9]00)(?:\s+weight)?$/i, 'weight $1');
        const levels = [1, 2, 3, 4, 5, 6].filter(n => !named.has(n));
        return levels.length
          ? `, ${levels.map(n => `h${n} ${ask}`).join(', ')}`
          : m;
      },
    )
    // "h2 through h4 bold": the ask for each level in the range.
    .replace(
      /\b(?:headings?\s+)?h([1-6])\s*(?:through|thru|to|until|-|\u2013)\s*h([1-6])\b([^,;.\n]*)/gi,
      (m, a, b, rest) => {
        const [lo, hi] = [Number(a), Number(b)].sort((x, y) => x - y);
        if (lo === hi || !rest.trim()) return m;
        return Array.from(
          {length: hi - lo + 1},
          (_, i) => `h${lo + i}${rest}`,
        ).join(', ');
      },
    )
    // No letter spacing is letter spacing 0.
    .replace(
      /\b(?:no|remove|without|get rid of|drop)\s+(?:the\s+|all\s+|any\s+)?(?:extra\s+)?(letter[- ]?spacing|tracking)\b/gi,
      '$1 0',
    )
    .replace(
      /\b(?:twice|two times) as (small|thin|narrow|short|tight)\b/gi,
      '50% of now',
    )
    .replace(
      /\b(two|three|four|five|2|3|4|5) (thirds|quarters|fourths|fifths)\b(?:\s+of)?/gi,
      (_m, n, d) => {
        const num = WORD_NUMBERS[String(n).toLowerCase()] ?? Number(n);
        /** @type {Record<string, number>} */
        const DENS = {thirds: 3, quarters: 4, fourths: 4, fifths: 5};
        const den = DENS[String(d).toLowerCase()] ?? 1;
        return num < den ? `${Number(((num / den) * 100).toFixed(3))}% of` : _m;
      },
    )
    .replace(/(?<![\d./#-])([1-9])\/([2-9])(?![\d./])(?:\s+of)?/g, (m, n, d) =>
      Number(n) < Number(d)
        ? `${Number(((Number(n) / Number(d)) * 100).toFixed(3))}% of`
        : m,
    )
    .replace(/\bflatten (?:the )?([a-z]+)/gi, 'make the $1 flat')
    .replace(/\b([a-z][a-z -]*?)\s*\+\+/gi, 'more $1')
    .replace(/\b([a-z][a-z -]*?)\s*--(?![a-z])/gi, 'less $1')
    .replace(/\b([a-z][a-z -]*?)\s*[:=]\s*(?:off|none|no)\b/gi, 'no $1');
  const segments = question
    .split(
      /\s*(?:,(?![^(]*\))|[;\n|]|\s[/+]\s(?![^(]*\))|\.{2,}|[.?!](?=\s)|\bjust\b|\bthen\b|\s[-\u2013\u2014]\s|\bstep \d+\b|\bbut\b(?= (?:make|set|change|use|give|turn|remove|add)\b)|\b(?:but|and)\b(?=\s+(?:don'?t|do not|never|leave|keep)\b)|(?<=\S)(?<!\b(?:don'?t|never|do not|not|to|please|and|you|we|i|let'?s|can|could|would|will))\s+(?=(?:make|set|change|give|turn) (?:it|them|the|my|this|that|those|these)\b)|(?<=\S)\s+(?=(?:do|does|will) \w+ (?:follow|match)\b))\s*/i,
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
    /^\s*(?:(?:please )?(?:don'?t|do not|never) (?:touch|change|make)|[\w -]+ (?:should|must|shall)(?:n'?t| not) (?:be|get|look|become)\b(?! (?:so|too|this|that) \w)|leave(?! (?:the )?(?:dark|light) mode\b)|keep (?:the )?[\w -]+ (?:alone|as is|as it is|unchanged|untouched|the same))\b/i;
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
      // A prohibition after an ask ("…, but leave inputs alone", "don't
      // touch inputs", "keep their hover the same") keeps what it names as
      // it is: an except of that ask.
      if (gated.includes(x) && EXCLUDE.test(x)) {
        const named = lex.parts
          .map(([re]) => re.exec(x.toLowerCase())?.[0])
          .find(Boolean);
        const state = /\b(hover|focus|pressed|active|disabled)\b/i.exec(x)?.[1];
        if (kept.length && (named || state))
          kept.push(named ? `except ${named}` : `except on ${state}`);
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
      // "muted ones", "the muted card": the muted variant, not a color ask.
      /(?<![-\w])(?:more )?(?:muted|pastel|duller|subdued|desaturated)(?![-\w])(?! (?:ones?|cards?|buttons?|badges?|variant)\b)/gi,
      'less saturated',
    )
    // "less sharp", "less thick", "less round": the opposite word.
    .replace(/\bless (?:sharp|square|angular|boxy)\b/gi, 'rounder')
    .replace(/\bless (?:round(?:ed)?|curved|soft)\b/gi, 'sharper')
    .replace(/\bless thick\b/gi, 'thinner')
    .replace(/\bless (?:big|large)\b/gi, 'smaller')
    .replace(/\bless (?:small|tiny)\b/gi, 'bigger')
    .replace(/\bless dark\b/gi, 'lighter')
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
    // A lone "½" with no unit after it is a share of now ("card padding
    // ½"), never 0.5px.
    .replace(
      /(\d*)(?:½|1\u20442)(?!\s*(?:rem|px|em|%|x\b|×|times\b))/g,
      (_, n) => (n ? `${n}½` : ' half '),
    )
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
      // (Never a count: "padding 2 steps more", "corners 3 notches".)
      /\b(padding|radius|corners|gap|margin)(\s*:?\s*)(\d+(?:\.\d+)?)(?![\d.%\w])(?!\s*(?:more\s+)?(?:steps?|sizes?|notches?|levels?|units?|spacing units?|x\b|×))/gi,
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
    // Other words for except: "besides cards", "save for cards", "but keep
    // cards as they are", "cards excepted", "without changing buttons".
    .replace(
      /\b(?:besides|save for|apart from|other than|excluding|with the exception of|without (?:changing|touching|affecting))\s+/gi,
      'except ',
    )
    .replace(
      /[,;]?\s*but (?:keep|leave) (?:the |my )?([a-z][a-z -]*?) (?:as (?:they are|it is|is)|alone|the same|unchanged|untouched)\b/gi,
      ' except $1',
    )
    .replace(/[,;]?\s*(?:the |my )?([a-z][a-z -]*?) excepted\b/gi, ' except $1')
    // "as well as" is "and"; "compared to", "relative to", "versus" compare.
    .replace(/\bas well as\b/gi, 'and')

    // "48px by 48px", "600px by 400px": a size, width by height.
    .replace(
      /\b(\d*\.?\d+(?:px|rem|em)?)\s+by\s+(\d*\.?\d+(?:px|rem|em)?)\b/gi,
      '$1x$2',
    )
    // "no shadow and no border on dialogs", "remove the border and the
    // shadow from cards": both removals on that part. The second item is a
    // removal only when it carries its own removal lead, or is a plain
    // removable noun the first lead governs ("no shadows and borders"); a
    // noun with an adjective ("rounded corners") is an ask of its own.
    // The part may come first, as an owner: "remove the card border and
    // shadow" (or "the card's border and shadow") is no border and no
    // shadow on cards.
    .replace(
      new RegExp(
        `\\b${REMOVAL_LEAD} (?:the |my |our )?([a-z][a-z-]*)(?:['’]s)? (${REMOVABLE}) and (?:the |its |their )?(${REMOVABLE})\\b(?! (?:on|from|for)\\b)`,
        'gi',
      ),
      (m, part, x, y) =>
        lex.parts.some(([re]) => re.test(` ${part} `))
          ? `no ${x} on ${part} and no ${y} on ${part}`
          : m,
    )
    .replace(
      new RegExp(
        `\\b${REMOVAL_LEAD} ([a-z]+(?: [a-z]+)?) and ${REMOVAL_LEAD} ([a-z]+(?: [a-z]+)?) (?:on|from|for) (?:the |my |all )?([a-z][a-z-]*s?)\\b`,
        'gi',
      ),
      'no $1 on $3 and no $2 on $3',
    )
    .replace(
      new RegExp(
        `\\b${REMOVAL_LEAD} ([a-z]+(?: [a-z]+)?) and (?:the )?(${REMOVABLE}) (?:on|from|for) (?:the |my |all )?([a-z][a-z-]*s?)\\b`,
        'gi',
      ),
      'no $1 on $3 and no $2 on $3',
    )
    // "no shadow and rounder corners on cards", "without shadows and
    // rounder corners on cards": the removal is on that part too (never the
    // whole theme); the second ask stays as it is.
    .replace(
      new RegExp(
        `\\b${REMOVAL_LEAD} (${REMOVABLE}) and (?!${REMOVAL_LEAD} )((?:[a-z#0-9]+ ){0,3}[a-z#0-9]+) (on|for) (?:the |my |all )?([a-z][a-z-]*s?)\\b`,
        'gi',
      ),
      'no $1 on $4 and $2 $3 $4',
    )
    // "slightly lighter than #000000", "lighter than black": a color that
    // much past the one named, never the named color itself.
    .replace(
      /\b(?:(a bit|slightly|a little|a touch|much|way|(\d{1,2})\s?%)\s+)?(lighter|darker) than (#[0-9a-f]{3,8}|[a-z]+)\b/gi,
      (m, amt, pct, way, ref) => {
        if (!ref.startsWith('#') && !parseColor(ref)) return m;
        const k = pct
          ? Number(pct) / 100
          : /much|way/i.test(String(amt ?? ''))
            ? 0.3
            : amt
              ? 0.08
              : 0.15;
        const v = shift(ref, /lighter/i.test(way) ? k : -k);
        return v ? v : m;
      },
    )
    // "rounder cards without shadows": the ask, and no shadow on that part
    // (never a reason to square anything).
    .replace(
      /\b(rounder|sharper|bigger|smaller|bolder|darker|lighter|taller|wider|roomier) ([a-z]+?)(s?) without (shadows?|borders?|outlines?)\b/gi,
      '$1 $2$3 and no $4 on $2$3',
    )
    .replace(
      /\b([a-z]+?)(s?) (rounder|sharper|bigger|smaller|bolder|darker|lighter|taller|wider|roomier) without (shadows?|borders?|outlines?)\b/gi,
      '$1$2 $3 and no $4 on $1$2',
    )
    // "more padding everywhere except dialogs": everything, but dialogs.
    .replace(
      /\beverywhere(?=\s+(?:except|but|besides|save)\b)/gi,
      'on everything',
    )
    // "headings 1 through 3 bolder", "h2-h4 red": those levels, as h-names,
    // for any property (sizes read the range themselves); a level the
    // question excepts is left out.
    .replace(
      /\b(?:headings?\s+(?:levels?\s+)?|h)([1-9])\s*(?:-|–|to|through|thru)\s*h?([1-9])\b(?!.*\b(?:bigger|smaller|larger|size|sizes)\b)/gi,
      (_m, a, b, at, whole) => {
        const [lo, hi] = [Number(a), Number(b)].sort((x, y) => x - y);
        const out = new Set(
          [
            ...String(whole)
              .slice(at)
              .matchAll(/\bexcept (?:for )?h([1-6])\b/gi),
          ].map(m => Number(m[1])),
        );
        const list = [];
        for (let i = lo; i <= Math.min(hi, 6); i++)
          if (!out.has(i)) list.push(`h${i}`);
        return list.length > 1
          ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
          : (list[0] ?? `heading level ${hi}`);
      },
    )
    // "h2 to h4", "h2-h4": heading levels 2 to 4.
    .replace(/\bh([1-6])\s*(?:-|–|to|through)\s*h([1-6])\b/gi, 'headings $1-$2')
    .replace(
      /\b(?:compared (?:to|with)|relative to|versus|vs\.?)\s+/gi,
      'than ',
    )
    // "don't let the text get smaller", "keep the text from getting
    // smaller", "I don't want bigger cards": prohibitions.
    .replace(
      /\b(?:don'?t|do not|never) let (?:the |my )?([a-z][a-z -]*?) (?:get|become|look|be) (\w+er)\b/gi,
      "don't make $1 $2",
    )
    .replace(
      /\bkeep (?:the |my )?([a-z][a-z -]*?) from (?:getting|becoming|looking) (\w+er)\b/gi,
      "don't make $1 $2",
    )
    .replace(
      /\bi (?:don'?t|do not) want (?:the |my )?(\w+er) ([a-z][a-z -]*)/gi,
      "don't make $2 $1",
    )
    // "make everything rounder; never round the inputs", "… and don't
    // change the cards": after an ask, the part keeps what it has.
    .replace(
      /\s*(?:[;.,]|\band\b|\bbut\b)\s*(?:but\s+)?(?:never|don'?t|do not) (?:round|change|touch|make) (?:the |my )?([a-z][a-z -]*?)(?: rounder| bigger| smaller| bolder| darker| lighter)?\s*$/gi,
      ' except $1',
    )
    // "never round the inputs": a prohibition of rounding them.
    .replace(
      /\bnever round (?:the |my )?([a-z][a-z -]*)/gi,
      'never make $1 rounder',
    )
    // "buttons shouldn't be so small": an ask the other way.
    .replace(
      /\b([a-z][a-z -]*?) (?:shouldn'?t|should not) be (?:so|this|that|too) (small|big|large|round|rounded|dark|light|thin|thick|tight|cramped)\b/gi,
      (_m, part, adj) =>
        `make ${part} ${/** @type {Record<string, string>} */ ({small: 'bigger', big: 'smaller', large: 'smaller', round: 'sharper', rounded: 'sharper', dark: 'lighter', light: 'darker', thin: 'thicker', thick: 'thinner', tight: 'roomier', cramped: 'roomier'})[adj.toLowerCase()]}`,
    )
    // "remove the padding and border from cards": two removals.
    .replace(
      /\b(remove|drop|get rid of) (?:the )?(\w+) and (?:the )?(\w+) (?:from|on) (?:the |my )?([a-z][a-z -]*)/gi,
      'no $2 on $4 and no $3 on $4',
    )
    // "black on secondary buttons": a color on a variant is its text.
    .replace(
      /\b(black|white|#[0-9a-f]{3,8}|red|blue|green|gray|grey) on (?:the )?(primary|secondary|ghost|destructive) buttons?\b/gi,
      '$1 text on $2 buttons',
    )
    // "inputs with errors", "inputs that have an error": the error status.
    .replace(
      /\b([a-z]+s?) (?:with|that have|that has|showing) (?:an )?(?:errors?|error states?)\b/g,
      '$1 in error state',
    )
    // "white text on primary": a variant of the buttons.
    .replace(
      /\b(on|for) (?:the )?(primary|secondary|ghost|destructive)\b(?! (?:ones?|buttons?|badges?|chips?|links?|tags?)\b)/g,
      '$1 $2 buttons',
    )
    // "dialog header and footer": both are the dialog's.
    .replace(
      /\b([a-z]+) (header|footer|title)s? and (header|footer|title)s?\b/g,
      '$1 $2 and $1 $3',
    )
    // "all buttons except primary ones rounder": the ask before the except.
    .replace(
      /^(.*?)\s+except\s+((?:the\s+)?(?:primary|secondary|ghost|destructive|danger)(?:\s+ones?|\s+buttons?)?)\s+(?!and\b|or\b|buttons?\b|ones?\b)(\S.*)$/i,
      '$1 $3 except $2',
    )
    .replace(
      /\b(apart from|other than|excluding|but not (on|in|for)|but not)\b/g,
      'except',
    )
    .replace(/\s+/g, ' ')
    .trim();
  // "cramped on mobile": the editor has no media conditions; the rest of
  // the ask is answered, with a note.
  const MEDIA_RE = new RegExp(
    String.raw`(?<!\bno |\bnot )\b(?:below|above|under|over|wider than|narrower than)\s+(?:\d{3,}px|\d+em)\b|\b(?:screens?|viewports?|windows?) (?:below|above|under|over|less than|more than|wider than|narrower than)\s+\d+(?:px|em|rem)\b|\b(?:on|for) (?:mobile|phones?|tablets?|desktops?|touch(?: screens?)?|small screens?|large screens?|wide screens?|landscape|portrait)\b|(?<!\bfine )\b(?:when )?print(?:ing)?\b|\b(?:the )?print version\b`,
    'g',
  );
  const media = MEDIA_RE.test(q);
  if (media) q = q.replace(MEDIA_RE, ' ').replace(/\s+/g, ' ').trim();
  const clauses = clausesOf(q, lex.parts);
  /** Parts a prohibition in the question keeps as they are. @type {string[]} */
  const prohibited = [];
  /** The clause each draft answers. @type {WeakMap<Draft, Clause>} */
  const draftClause = new WeakMap();
  /** Parts a symmetric "match" ask already answered for. @type {Set<string>} */
  const symDone = new Set();
  /** Places the question names that the editor cannot keep apart. @type {string[]} */
  const placeNotes = [];
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
  // "color #000" or "pink #db2777" after a clause that names what changes
  // but no color ("the border on inputs", "focus outline on text inputs"):
  // the color of that ask.
  for (let i = clauses.length - 1; i >= 1; i--) {
    const c = clauses[i];
    const prev = clauses[i - 1];
    const rest = c.text
      .replace(/#[0-9a-f]+|\b(?:rgba?|hsla?|oklch)\([^)]*\)/g, ' ')
      .split(/\s+/)
      .filter(
        w =>
          w &&
          !/^colou?rs?:?$/.test(w) &&
          !Object.hasOwn(HUES, w) &&
          !(w.length > 3 && parseColor(w)),
      );
    if (
      c.colors.length &&
      !rest.length &&
      !c.parts.length &&
      prev.aspects.length &&
      !prev.colors.length &&
      // (Only an ask with no value of its own: "border width is 2px, color
      // #000" is two asks.)
      !prev.lengths.length &&
      !Object.keys(prev.decl ?? {}).length
    ) {
      prev.colors = [...c.colors];
      prev.text = `${prev.text} ${c.text}`;
      clauses.splice(i, 1);
    } else if (
      c.colors.length &&
      !rest.length &&
      !c.parts.length &&
      prev.aspects.length
    ) {
      // After an ask with a value of its own: the color is a second ask
      // on the same thing ("border width is 2px, color #000").
      c.aspects = [...prev.aspects.filter(a => a !== 'size')];
      c.parts = prev.parts.map(p => ({...p}));
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
        // "blue card background", "red card borders": a color word before
        // a color ask is the color to give, not the blue or red variant.
        const colorAsk =
          Object.hasOwn(HUES, m[1]) &&
          c.aspects.some(x => ['background', 'border', 'text'].includes(x)) &&
          c.colors.length === 1;
        if (key && !colorAsk && nouns.some(([re]) => re.test(` ${m[2]} `))) {
          p.when = `${key}:${m[1]}`;
          break;
        }
      }
    }
  // "cards and dialogs with no shadow", "tooltips and toasts black": parts
  // listed before the ask all take it.
  // "headings twice as big", "dialog text twice as big": size words on
  // headings or on a part's text are the text size.
  for (const c of clauses)
    if (
      (!c.aspects.length ||
        (c.aspects.length === 1 &&
          c.aspects[0] === 'text' &&
          !c.colors.length)) &&
      c.parts.length &&
      /\b(big|bigger|small|smaller|large|larger)\b/.test(c.text) &&
      (c.parts.some(x => x.on === 'heading') || /\btext\b/.test(c.text))
    )
      c.aspects = ['fontsize'];
  // "2 steps more on cards" (from "2 spacing units more"): the spacing.
  for (const c of clauses)
    if (
      !c.aspects.length &&
      c.parts.length &&
      STEP_COUNT.test(c.text) &&
      /\b(more|less)\b/.test(c.text)
    )
      c.aspects = ['spacing'];
  // "bold, uppercase and 14px": a bare size in a list of text changes is
  // the text size.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    if (
      !c.aspects.length &&
      c.lengths.length === 1 &&
      /^\s*(?:and\s+)?\d*\.?\d+(?:px|rem|em|pt)\s*$/.test(c.text) &&
      clauses
        .slice(0, i)
        .some(x =>
          x.aspects.some(a =>
            ['weight', 'case', 'fontsize', 'text', 'family', 'font'].includes(
              a,
            ),
          ),
        )
    )
      c.aspects = ['fontsize'];
  }
  // An elided clause ("… and darker when pressed", "… and black on
  // secondary buttons", "all caps and smaller", "and half on ghost ones")
  // takes what it leaves out from the clause before: its part, and the
  // kind of change when it names none.
  for (let i = 1; i < clauses.length; i++) {
    const c = clauses[i];
    const prev = clauses[i - 1];
    if (c.except || prev.except || !prev.parts.length) continue;
    // Only a clause joined by "and" to the one before, with words of its
    // own beside a value ("4px" alone is the value of the clause before).
    if (
      !new RegExp(
        `\\band\\s+${c.text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ).test(q) ||
      /^\s*(?:at least\s+|about\s+)?\d*\.?\d+(?:px|rem|em|%)?\s*$/.test(c.text)
    )
      continue;
    const ownParts = c.parts.length > 0;
    const hasAsk =
      c.dir ||
      c.colors.length ||
      c.lengths.length ||
      exactFactor(c.text) != null;
    if (!hasAsk) continue;
    if (!c.parts.length) {
      const own = /\b(primary|secondary|ghost|destructive|muted)\b/.exec(
        c.text,
      )?.[1];
      c.parts = prev.parts.map(x => ({
        ...x,
        ...(own ? {when: `variant:${own}`} : {}),
      }));
    }
    if (!c.aspects.length && !ownParts) {
      const textish = prev.aspects.some(a =>
        ['text', 'case', 'fontsize', 'weight', 'family'].includes(a),
      );
      c.aspects = c.colors.length
        ? prev.aspects.includes('text')
          ? ['text']
          : [...prev.aspects]
        : textish && /\b(smaller|bigger|larger|tiny|huge)\b/.test(c.text)
          ? ['fontsize']
          : textish && /\b(lighter|darker)\b/.test(c.text)
            ? ['text']
            : [...prev.aspects];
    } else if (
      !ownParts &&
      c.aspects.length === 1 &&
      c.aspects[0] === 'size' &&
      !/\b(padding|room|spac)/.test(c.text) &&
      prev.aspects.some(a =>
        ['text', 'case', 'fontsize', 'weight', 'family'].includes(a),
      )
    )
      c.aspects = ['fontsize'];
    else if (
      !ownParts &&
      c.colors.length &&
      c.aspects.length === 1 &&
      c.aspects[0] === 'background' &&
      prev.aspects.includes('text') &&
      !/\b(background|bg|fill)\b/.test(c.text)
    )
      c.aspects = ['text'];
  }
  // An icon's color is its text color ("the close icon red").
  for (const c of clauses)
    if (
      c.parts.some(x => /-icon$/.test(x.on)) &&
      (c.aspects.includes('background') ||
        (!c.aspects.length && c.colors.length)) &&
      !/\b(background|bg|fill(ed)?)\b/.test(c.text)
    )
      c.aspects = c.aspects.length
        ? c.aspects.map(x => (x === 'background' ? 'text' : x))
        : ['text'];
  // "buttons inside cards", "links in the sidebar": the editor themes a
  // part everywhere; the place is said, never changed.
  for (const c of clauses) {
    const place =
      /\b(?:inside|within|in(?! (?:dark|light)\b))\s+(?:the\s+|a\s+|an\s+|my\s+)?([a-z][a-z -]*)$/.exec(
        c.text.replace(/\s+(?:on|when) \w+$/, ''),
      );
    if (!place || c.parts.length < 2) continue;
    const at = c.text.indexOf(place[0]);
    const inPlace = c.parts.filter(x =>
      lex.parts.some(
        ([re, y]) => y.on === x.on && (re.exec(c.text)?.index ?? -1) >= at,
      ),
    );
    if (!inPlace.length || inPlace.length === c.parts.length) continue;
    c.parts = c.parts.filter(x => !inPlace.includes(x));
    placeNotes.push(
      `the editor themes ${c.parts.map(x => x.on).join(', ')} everywhere: it cannot keep ${inPlace.map(x => x.on).join(', ')} apart, so this applies to every ${c.parts.map(x => x.on).join(', ')} (${inPlace.map(x => x.on).join(', ')} is not changed)`,
    );
  }
  // "except buttons and cards": the parts listed after an except clause are
  // excepted too.
  for (let i = 0; i < clauses.length - 1; i++) {
    if (!clauses[i].except) continue;
    while (
      i + 1 < clauses.length &&
      clauses[i + 1].parts.length &&
      !clauses[i + 1].aspects.length &&
      !clauses[i + 1].colors.length &&
      !clauses[i + 1].lengths.length &&
      !clauses[i + 1].dir &&
      !clauses[i + 1].except
    ) {
      clauses[i].parts.push(...clauses[i + 1].parts);
      clauses.splice(i + 1, 1);
    }
  }
  // The same for a part-only clause the reading put before the except
  // clause though the question says it after "except".
  {
    const exceptAt = q.search(/\bexcept\b/);
    const ex = clauses.find(x => x.except);
    if (ex && exceptAt >= 0)
      for (let i = clauses.length - 1; i >= 0; i--) {
        const x = clauses[i];
        if (
          x !== ex &&
          !x.except &&
          x.parts.length &&
          !x.aspects.length &&
          !x.colors.length &&
          !x.lengths.length &&
          !x.dir &&
          q.indexOf(x.text) > exceptAt
        ) {
          ex.parts.push(...x.parts);
          clauses.splice(i, 1);
        }
      }
  }
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
  // "lighter card backgrounds, in dark mode": a clause that only names a
  // mode, after an ask with none, scopes that ask.
  for (let i = clauses.length - 1; i > 0; i--) {
    const c = clauses[i];
    const prev = clauses[i - 1];
    if (
      c.mode &&
      !c.parts.length &&
      !c.aspects.length &&
      !c.colors.length &&
      !c.lengths.length &&
      !c.state &&
      !prev.mode &&
      (prev.parts.length || prev.aspects.length)
    ) {
      prev.mode = c.mode;
      clauses.splice(i, 1);
    }
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
  // The theme's own value (its settings applied), else the base theme's.
  /** @param {string} token @param {'light' | 'dark'} [mode] @param {number} [depth] @returns {string} */
  const current = (token, mode = 'light', depth = 0) => {
    const v =
      env.own?.[mode]?.[token] ??
      env.base[mode]?.[token] ??
      String(TOKENS[token] ?? '');
    // A token the theme points at another token reads as that token's value.
    const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(String(v).trim())?.[1];
    return ref && depth < 6 ? current(ref, mode, depth + 1) : v;
  };
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
  /**
   * Steps for a color worked out per variant: a part whose variants each
   * read a color of their own (primary on-accent text, secondary and ghost
   * main text) gets one step per variant, each from that variant's own
   * color (the base theme's own rule first), in each mode; never one color
   * for all. Null when the part has fewer than two such variants, or the
   * clause names one.
   * @param {string} on
   * @param {string} group
   * @param {string} prop the property the variants read
   * @param {string} thing what the steps set
   * @param {Record<string, string | undefined>} f
   * @param {(now: string, mode: 'light' | 'dark') => string | null} fn
   * @param {Clause} c
   * @returns {Step[] | null}
   */
  const byVariant = (on, group, prop, thing, f, fn, c) => {
    if (f.when || f.state) return null;
    /** @type {Map<string, string>} */
    const per = new Map();
    for (const r of C.partReads(one(on), group) ?? []) {
      if (!r.props.includes(prop) || !/^--color-/.test(r.token)) continue;
      if (/overlay|tint/.test(r.token)) continue;
      for (const w of r.when ?? []) {
        const m = /^([a-z]+)=([a-z0-9-]+)$/.exec(w);
        if (m && m[1] === 'variant' && !per.has(`${m[1]}:${m[2]}`))
          per.set(`${m[1]}:${m[2]}`, r.token);
      }
    }
    const camel = prop.replace(/-([a-z])/g, (_m, x) => x.toUpperCase());
    const baseRules = /** @type {any} */ (env.base).components?.[one(on)] ?? {};
    // A variant's own fill in the base theme, written as a literal or a
    // light-dark() pair: each mode steps from the color it shows.
    /** @type {Map<string, {light: string, dark: string}>} */
    const literal = new Map();
    for (const [when, rules] of Object.entries(baseRules)) {
      const v = String(/** @type {any} */ (rules)?.[camel] ?? '');
      // (Only a variant the part has: a base rule for a variant the part
      // does not take is never a --when.)
      if (
        !v ||
        !/^variant:/.test(when) ||
        !(C.variantValues(one(on)).variant ?? []).includes(when.slice(8))
      )
        continue;
      const t = /^var\(\s*(--color-[a-z0-9-]+)\s*\)$/.exec(v)?.[1];
      if (t) {
        per.set(when, t);
        continue;
      }
      const pair =
        /^light-dark\(\s*([^,()]+(?:\([^()]*\))?)\s*,\s*([^()]+(?:\([^()]*\))?)\s*\)$/.exec(
          v.trim(),
        );
      const light = (pair ? pair[1] : v).trim();
      const dark = (pair ? pair[2] : v).trim();
      if (parseColor(light) && parseColor(dark)) {
        per.delete(when);
        literal.set(when, {light, dark});
      }
    }
    if (new Set([...per.values(), ...literal.keys()]).size < 2) return null;
    /** @type {Step[]} */
    const out = [];
    for (const [when, token] of per)
      if (!literal.has(when))
        out.push(...perMode(token, thing, {...f, when}, fn, c));
    const modes = /** @type {Array<'light' | 'dark'>} */ (
      c.mode && modal
        ? [c.mode]
        : modal
          ? ['light', 'dark']
          : [env.data.mode === 'dark-only' ? 'dark' : 'light']
    );
    for (const [when, own] of literal)
      for (const m of modes) {
        const v = fn(own[m], m);
        if (v && v.toLowerCase() !== own[m].toLowerCase())
          out.push(set(thing, v, {...f, when, ...(modal ? {mode: m} : {})}));
      }
    return out.length ? out : null;
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
   * The stops of a gradient the clause names, in the order written ("from
   * #fff to #eef", "a blue to purple gradient"); null with fewer than two.
   * @param {Clause} c
   * @returns {string[] | null}
   */
  const gradientStops = c => {
    const named = colorsWritten(c.text);
    return named.length > 1 ? named.slice(0, 3) : null;
  };
  /**
   * Carry the clause's color mode into every step that takes --mode, and
   * say so when a step cannot: only colors and shadows differ by mode.
   * @param {Draft} d @param {Clause | null} c
   * @returns {Draft}
   */
  const withMode = (d, c) => {
    if (!c?.mode || !d.options.length) return d;
    if (d.options.every(o => o.every(st => st.thing === 'mode'))) return d;
    // A one-mode theme shows only its mode: an ask for the other mode
    // changes nothing anyone sees, whatever form the value takes.
    if (env.data.mode !== 'both') {
      const only = env.data.mode === 'light-only' ? 'light' : 'dark';
      if (only === c.mode) return d;
      return {
        text: `${env.slug} has only a ${only} mode, so it has no ${c.mode} mode to change; set mode both to give it one`,
        options: [],
        lookup: `${HOW} mode`,
      };
    }
    // A value that already holds the mode's change in its light-dark()
    // halves (a shadow's colors in one mode) needs no --mode.
    if (/** @type {any} */ (d).modeInValue) return d;
    // A shadow typed for one mode: its colors become light-dark() pairs,
    // transparent in the other mode, when the part shows no shadow there
    // (a shadow is the same in both modes otherwise).
    /** @param {Step} st @returns {Step} */
    const oneModeShadow = st => {
      if (st.verb !== 'set' || st.thing !== 'box-shadow' || !st.on || st.mode)
        return st;
      const other = c.mode === 'dark' ? 'light' : 'dark';
      // (At rest: a selected card's ring is no shadow of the plain card.)
      const read = C.partReads(one(st.on), 'shadow')?.find(
        r => r.props.includes('box-shadow') && r.when.includes(''),
      );
      const now =
        partValue(st.on, 'box-shadow') ??
        (read ? current(read.token, other) : 'none');
      if (now && !/^none$/i.test(String(now).trim())) return st;
      const v = String(st.value ?? '').replace(COLOR_IN_VALUE, col =>
        c.mode === 'dark'
          ? `light-dark(transparent, ${col})`
          : `light-dark(${col}, transparent)`,
      );
      return v === st.value ? st : {...st, value: v};
    };
    /** @param {Step} st */
    const modal = st => {
      if (st.mode) return true;
      if (st.verb !== 'set') return false;
      if (st.thing === 'box-shadow' && /light-dark\(/.test(st.value ?? ''))
        return true;
      if (st.thing.startsWith('--')) return C.typeOf(st.thing) === 'color';
      // A gradient goes per mode too, as a background image (the other
      // mode keeps its background color).
      if (/^background(-image)?$/.test(st.thing) && gradientOnly(st.value))
        return true;
      if (st.thing === 'background')
        return (
          parseColor(st.value ?? '') != null || /^var\(/.test(st.value ?? '')
        );
      return COLOR_PROPS.test(st.thing);
    };
    /** @param {string | undefined} v */
    const gradientOnly = v =>
      /gradient\(/i.test(v ?? '') && !/url\(|light-dark\(/i.test(v ?? '');
    const options = d.options
      .map(o => o.map(oneModeShadow))
      .filter(o => o.every(modal))
      .map(o =>
        o.map(st => {
          const one =
            st.thing === 'background' && gradientOnly(st.value)
              ? {...st, thing: 'background-image'}
              : st;
          return one.mode || one.thing === 'box-shadow'
            ? one
            : {...one, mode: c.mode ?? undefined};
        }),
      );
    if (options.length) return {...d, options};
    return {
      text: `${d.text}: this is the same in light and dark; set takes --mode only for colors, so it cannot be ${c.mode} mode only`,
      options: [],
    };
  };
  /** @type {Clause | null} */
  let clauseNow = null;
  /**
   * What a clause asks for, as the measured check reads it.
   * @param {Clause} c0
   * @param {string[]} keep parts (or `part@when|state|` prefixes) kept as they are
   * @returns {import('./_how-commands.mjs').MeasureIntent}
   */
  const intentOf = (c0, keep) => {
    const comparing =
      /\b(than(?!\s+-?\d)|as \w+ as(?!\s+-?\d)|same|match(?:es|ing)?|equal(?:ly)?|like the|compared to|versus|vs)\b/.test(
        c0.text,
      );
    const aspects = [
      ...c0.aspects,
      ...(/\bshadows?\b/.test(c0.text) ? ['shadow'] : []),
      ...(/\b(corners?|radius)\b/.test(c0.text) ? ['corners'] : []),
      ...(/\bborders?\b/.test(c0.text) ? ['border'] : []),
      ...(/\b(padding|gap|spacing)\b/.test(c0.text) ? ['spacing'] : []),
    ];
    const known = aspects.length && aspects.every(a => ASPECT_FAMILIES[a]);
    // "lighter" or "darker" with no size word asks for a color only.
    const colorOnly =
      /\b(lighter|lighten|darker|darken|brighter|paler|deeper)\b/.test(
        c0.text,
      ) &&
      !/\b(thick|thin|width|wide|bigger|smaller|weight|bold|font|text size|shadow|heav|headings?|up)\w*/.test(
        c0.text,
      );
    return {
      families: colorOnly
        ? ['color']
        : known
          ? [...new Set(aspects.flatMap(a => ASPECT_FAMILIES[a]))]
          : [],
      // A value after "than" is a bound, not the value to write.
      typed: [...c0.colors, ...c0.lengths].filter(
        v =>
          !new RegExp(
            `\\bthan\\s+${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            'i',
          ).test(c0.text),
      ),
      opacityDir:
        /\bmore (transparent|translucent|see-through)\b|\bless opaque\b/.test(
          c0.text,
        )
          ? 'less'
          : /\bless (transparent|translucent)\b|\bmore opaque\b/.test(c0.text)
            ? 'more'
            : null,
      dir: boundOf(c0.text)
        ? boundOf(c0.text)?.up
          ? /** @type {'more'} */ ('more')
          : /** @type {'less'} */ ('less')
        : comparing
          ? null
          : c0.dir,
      // (A bound such as "no bigger than 4px" is a target, never a
      // removal.)
      zero:
        !comparing &&
        !boundOf(c0.text) &&
        Boolean(c0.neg) &&
        new RegExp(`\\b(?:${REMOVAL_LEAD}|none)\\b`).test(c0.text) &&
        !/\b(not too|isn'?t|aren'?t|subtle|thinner|smaller|less)\b/.test(
          c0.text,
        ),
      // ("darker than the page" keeps its way: the part compared against
      // is a bound the measure holds; "the same color as" has no way.)
      lighter:
        (comparing &&
          !/\b(?:lighter|darker|brighter|paler|deeper) than\b(?!\s+-?\d|\s+#)/.test(
            c0.text,
          )) ||
        /\bcontrast\b/.test(c0.text)
          ? null
          : /\b(lighter|lighten|brighter|paler)\b/.test(c0.text)
            ? true
            : /\b(darker|darken|deeper)\b/.test(c0.text)
              ? false
              : null,
      subjects: c0.parts.map(x => x.on),
      keep: [...keep, ...prohibited],
      mode: /** @type {'light' | 'dark' | null} */ (c0.mode ?? null),
      shadowDir: /\bshadows?\b/.test(c0.text) ? shadowWay(c0.text) : null,
      contrast:
        /\b(contrast|too (?:light|dark|faint|pale)|can'?t (?:read|see)|hard to (?:read|see)|readab\w*|legib\w*|washed out)\b/.test(
          `${c0.text} ${String(question)
            .toLowerCase()
            .replace(/[\u2018\u2019]/g, "'")}`,
        ),
      bound: /\bthan\s+-?\d/.test(c0.text),
      // "lighter text in dark mode": with a mode named, lighter and darker
      // are the color itself, never contrast; the answer reads it so too.
      literal: Boolean(c0.mode) && /\b(darker|lighter)\b/.test(c0.text),
    };
  };
  /** @param {Draft} input */
  const push = input => {
    const d = withMode(input, clauseNow);
    // The measured check runs on the final commands (_how.mjs): each draft
    // carries what its clause asks for.
    if (clauseNow && !clauseNow.except && !d.intent)
      d.intent = intentOf(clauseNow, []);
    // A step given twice in one option runs once.
    const options = d.options
      .map(o =>
        o.filter(
          (st, i) =>
            o.findIndex(x => JSON.stringify(x) === JSON.stringify(st)) === i,
        ),
      )
      .filter(o => o.length);
    // "two steps bigger", "3 steps rounder", "two sizes bigger": a dial
    // step given N times, in order (each step moves from the one before).
    const stepCount = STEP_COUNT.exec(clauseNow?.text ?? '');
    const n = stepCount
      ? (WORD_NUMBERS[stepCount[1]] ?? Number(stepCount[1]))
      : 1;
    if (
      n > 1 &&
      options.length &&
      options[0].length === 1 &&
      options[0][0].verb === 'set' &&
      (options[0][0].value === 'more' || options[0][0].value === 'less')
    ) {
      options[0] = Array.from({length: n}, () => ({...options[0][0]}));
      d.sequence = true;
      d.text = d.text.replace(/\bone step\b/, `${n} steps, in order`);
      if (!/\bsteps, in order\b/.test(d.text))
        d.text = `${d.text} (${n} steps, in order)`;
    }
    // The caller reads what was kept.
    // A sub-part Core does not have: the answer is for the whole part.
    const missing = clauseNow?.parts.find(x => x.missing);
    if (missing && !d.text.startsWith('Core has no'))
      d.text = `Core has no ${missing.missing} part of its own, so this is for the whole ${missing.on}: ${d.text}`;
    input.text = d.text;
    input.options = options;
    const pushed = {
      text: d.text,
      options,
      ...(d.sequence && options.length ? {sequence: true} : {}),
      ...(d.lookup ? {lookup: d.lookup} : {}),
      ...(d.intent ? {intent: d.intent} : {}),
    };
    drafts.push(pushed);
    if (clauseNow) draftClause.set(pushed, clauseNow);
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
  // "primary buttons red and the secondary blue": a clause that names its
  // own variant keeps it, never the variant of the clause before.
  for (const c of clauses) {
    const own = /\b(primary|secondary|ghost|destructive|danger)\b/.exec(
      c.text,
    )?.[1];
    if (!own) continue;
    const want = `variant:${own === 'danger' ? 'destructive' : own}`;
    for (const p of c.parts)
      if (p.when?.startsWith('variant:') && p.when !== want) p.when = want;
  }
  /** @type {Array<{clause: Clause, steps: Step[]}>} */
  const tops = [];
  const recordTop = (/** @type {Clause} */ c, /** @type {Step[]} */ steps) => {
    if (steps.length) tops.push({clause: c, steps});
  };

  for (const c of clauses) {
    clauseNow = c;
    // "but don't make buttons rounder": a prohibition inside the question
    // changes nothing; it says what stays.
    if (
      /^\s*(?:(?:but|and)\s+)?(?:please\s+)?(?:don'?t|do not|never)\s+make\b|\b(?:should|must|shall)(?:n'?t| not)\s+(?:be|get|look|become)\b/.test(
        c.text,
      )
    ) {
      for (const p of c.parts) {
        seenPart(p.on);
        prohibited.push(p.on);
      }
      push({
        text: `"${c.text.trim()}" asks for no change, so nothing is set there; ${c.parts.map(p => p.on).join(', ') || 'it'} stays as it is`,
        options: [],
      });
      continue;
    }
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
      const priorOn = prior.steps.find(st => st.on)?.on ?? null;
      // "except primary ones", "except ghost": a variant of the part being
      // changed.
      const variant =
        /\b(primary|secondary|ghost|destructive|danger|muted|small|large|transparent|success|warning|info|neutral|error|outline|outlined|default|blue|green|red|gray|orange|purple|teal|pink|cyan)\b/.exec(
          c.text,
        )?.[1];
      const when = variant
        ? variant === 'small'
          ? 'size:sm'
          : variant === 'large'
            ? 'size:lg'
            : variantKey(
                priorOn,
                variant === 'danger' ? 'destructive' : variant,
              )
        : undefined;
      // "except on hover": that state of the part being changed.
      const exceptState =
        /\b(?:on |when )(hover(?:ed)?|focus(?:ed)?|pressed|active|disabled)\b/.exec(
          c.text,
        )?.[1];
      /** @type {Array<{on: string, when?: string, state?: string}>} */
      const excepted = [
        // "the primary button and cards": the variant names the first part.
        ...c.parts.map((x, i) =>
          i === 0 && when && !x.when
            ? {...x, when}
            : // "except h1": that heading level.
              /** @type {any} */ (x).level && !x.when
              ? {on: x.on, when: `level:${/** @type {any} */ (x).level}`}
              : x,
        ),
        ...(!c.parts.length && when && priorOn ? [{on: priorOn, when}] : []),
        ...(!c.parts.length && !when && exceptState && priorOn
          ? [
              {
                on: priorOn,
                state: exceptState
                  .replace(/^(hover|focus)ed$/, '$1')
                  .replace(/^pressed$/, 'active'),
              },
            ]
          : []),
      ];
      if (!excepted.length) {
        // "except in the nav": a place, not a part.
        push({
          text: `"${c.text}" names no part the editor can keep apart, so ${prior.clause.text} applies everywhere`,
          options: [],
        });
        continue;
      }
      /** @type {Step[]} */
      const keeps = [];
      /** @type {string[]} */
      const said = [];
      let cannotKeep = false;
      for (const p of excepted) {
        seenPart(p.on);
        const name = `${p.on}${p.when ? ` (${p.when.replace(':', ' ')})` : ''}${p.state ? ` when ${p.state}` : ''}`;
        // A part the words do not tell apart from the part being changed.
        if (!p.when && !p.state && p.on === priorOn) {
          said.push(
            `${name} is the part being changed, so it cannot be kept apart`,
          );
          continue;
        }
        // A new fill brings a text color that reads on it: a kept variant
        // keeps its text color too; a heading level kept from a text color
        // keeps both text tokens (a heading color writes both).
        const keep = [
          // A kept state of the part: each step's own variant and mode, in
          // that state.
          ...prior.steps.flatMap(st => {
            if (!p.state || p.when) return [keepAsIs(st, p)];
            /** @param {string | undefined} when */
            const inWhen = when => {
              const k = keepAsIs(st, {...p, ...(when ? {when} : {})});
              if (!k || k === UNTOUCHED) return k;
              const pin = /** @type {Step} */ (k);
              // In a state, the fill's color alone: a tint Core draws over
              // the fill as an image stays.
              return {
                ...pin,
                ...(pin.thing === 'background'
                  ? {thing: 'background-color'}
                  : {}),
                ...(st.mode ? {mode: st.mode} : {}),
              };
            };
            const k = inWhen(st.when);
            // A step on the whole part, kept in a state the part draws per
            // variant: each variant keeps, in that state, what it shows.
            if (k || st.when) return [k];
            return (C.variantValues(one(p.on)).variant ?? []).map(v =>
              inWhen(`variant:${v}`),
            );
          }),
          ...(p.when
            ? prior.steps
                .filter(st => /^background/.test(st.thing) && st.on)
                .map(st => keepAsIs({...st, thing: 'color'}, p))
            : []),
          // A part kept from a spacing change: each spacing property its
          // plain rule reads (or the base theme sets on it), at the value it
          // shows now; the part's spacing setting alone does not hold a gap
          // or height read from the shared tokens.
          ...(!p.when &&
          !p.state &&
          prior.steps.some(st => /^(spacing|--spacing-)/.test(st.thing))
            ? (() => {
                /** @type {Map<string, string>} */
                const now = new Map();
                const baseOwn =
                  /** @type {any} */ (env.base).components?.[one(p.on)]?.base ??
                  {};
                for (const [k, v] of Object.entries(baseOwn)) {
                  const prop = k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
                  if (/^(padding|gap)/.test(prop))
                    now.set(
                      prop,
                      String(v).replace(
                        /var\(\s*(--[a-z0-9-]+)\s*\)/g,
                        (m, t) => resolvedValue(t) || m,
                      ),
                    );
                }
                for (const g of ['spacing', 'size'])
                  for (const r of C.partReads(one(p.on), g) ?? []) {
                    if (
                      !r.when.some(
                        w =>
                          w === '' ||
                          /^variant=(default|primary)$/.test(w) ||
                          /^size=md$/.test(w),
                      )
                    )
                      continue;
                    for (const prop of r.props)
                      if (
                        /^(padding-block|padding-inline|gap|height|min-height)$/.test(
                          prop,
                        ) &&
                        !now.has(prop) &&
                        !(prop.startsWith('padding') && now.has('padding'))
                      )
                        now.set(prop, resolvedValue(r.token) ?? '');
                  }
                return [...now]
                  .filter(
                    ([, v]) =>
                      v && /^[\d.]+(px|rem|em)( [\d.]+(px|rem|em))*$/.test(v),
                  )
                  .slice(0, 4)
                  .map(([prop, v]) => set(prop, v, {on: p.on}));
              })()
            : []),
          ...(p.on === 'heading' &&
          /^level:/.test(p.when ?? '') &&
          prior.steps.some(st => st.thing === 'color')
            ? [
                set(
                  '--color-text-secondary',
                  textPin('--color-text-secondary'),
                  {on: p.on, when: p.when},
                ),
              ]
            : []),
        ];
        // A whole kept part whose base theme gives a variant or level its own
        // value for a property a pin writes: each such rule keeps its own
        // value too (a plain-rule pin would overwrite heading levels).
        if (!p.when && !p.state) {
          const rules = /** @type {Record<string, any>} */ (
            /** @type {any} */ (env.base).components?.[one(p.on)] ?? {}
          );
          for (const k of [...keep]) {
            if (!k || k === UNTOUCHED) continue;
            const pin = /** @type {Step} */ (k);
            if (pin.when || pin.state || pin.on !== p.on) continue;
            const camel = pin.thing.replace(/-([a-z])/g, (_m, x) =>
              x.toUpperCase(),
            );
            for (const [when, rule] of Object.entries(rules)) {
              if (!/^[a-z]+:[\w-]+$/.test(when)) continue;
              const own = rule?.[camel];
              if (typeof own !== 'string') continue;
              const v = own.replace(
                /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
                (m, t) => resolvedValue(t) || m,
              );
              keep.push(
                set(pin.thing, v, {
                  on: p.on,
                  when,
                  ...(pin.mode ? {mode: pin.mode} : {}),
                }),
              );
            }
          }
        }
        // A corner change that reaches the part, with no radius how can read
        // to pin: said, and no command that would change it anyway.
        const inGroup = (/** @type {string | undefined} */ on) =>
          !on || on === p.on || (FAMILIES[on] ?? []).includes(p.on);
        if (
          prior.steps.some(
            (st, i) =>
              keep[i] == null &&
              /^(corners|border-radius|--radius-)/.test(st.thing) &&
              inGroup(st.on),
          )
        ) {
          said.push(
            `${name} shows a radius how cannot read, so it cannot be kept apart`,
          );
          cannotKeep = true;
          continue;
        }
        if (keep.every(k => k === UNTOUCHED || k == null)) {
          said.push(
            keep.some(k => k === UNTOUCHED)
              ? `${name} reads none of what changes, so it keeps what it has`
              : `${name} has nothing this change sets to keep`,
          );
          continue;
        }
        // A group whose members have different values now: each member
        // keeps its own.
        const members = FAMILIES[p.on] ?? null;
        if (members && !p.when && !p.state) {
          const per = members.map(m => ({
            m,
            ks: prior.steps.map(st => keepAsIs(st, {on: m})),
          }));
          const same = (/** @type {any} */ a, /** @type {any} */ b) =>
            JSON.stringify(a?.value ?? null) ===
            JSON.stringify(b?.value ?? null);
          const differs = per.some(x => x.ks.some((k, i) => !same(k, keep[i])));
          if (differs) {
            for (const x of per)
              for (const k of x.ks)
                if (k && k !== UNTOUCHED)
                  keeps.push({.../** @type {Step} */ (k), on: x.m, only: true});
            said.push(`${name} keeps what each of them has now`);
            continue;
          }
        }
        for (const k of keep)
          if (k && k !== UNTOUCHED) keeps.push(/** @type {Step} */ (k));
        said.push(`${name} keeps what it has now`);
      }
      // The kept parts, or one variant or state of them (`part@when|`, in
      // every state, or `part@when|:state|`).
      const exceptKeep = excepted.map(p =>
        p.when || p.state
          ? `${p.on}@${p.when ?? 'base'}|${p.state ? `:${p.state}|` : ''}`
          : p.on,
      );
      // The clause's own answer (without the exception) is held to the
      // exception too, so it never stands as the answer that changes the
      // excepted part.
      for (const dr of drafts)
        if (draftClause.get(dr) === prior.clause) {
          if (dr.intent)
            dr.intent = {
              ...dr.intent,
              keep: [...dr.intent.keep, ...exceptKeep],
            };
          // An exception that cannot be kept: the plain answer would change
          // the excepted part too, so it is not offered.
          if (cannotKeep) dr.options = [];
        }
      push({
        text: `${prior.clause.text}, except ${said.join('; ')}`,
        options: cannotKeep ? [] : [[...prior.steps, ...keeps]],
        sequence: true,
        intent: intentOf(prior.clause, exceptKeep),
      });
      // The whole ask comes first, before the change alone.
      drafts.unshift(/** @type {Draft} */ (drafts.pop()));
      tops.pop();
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
            : `"${c.named.bad}" is not a value ${c.named.prop} takes; give ${exampleOf(c.named.prop)}`,
        options: [],
      });
      continue;
    }
    // "primary button text the same color as secondary button text",
    // "secondary buttons the same color as primary buttons": one variant
    // takes the other variant's own color (the token that variant reads),
    // so it follows both modes; the other variant is not changed.
    {
      const vv =
        /\b([a-z]+) ([a-z]+?)s?( text| background| border)? (?:the )?same colou?r as (?:the )?([a-z]+) ([a-z]+?)s?( text| background| border)?\b/.exec(
          c.text,
        );
      const part = vv && c.parts.length ? c.parts[0].on : null;
      if (vv && part && vv[1] !== vv[4]) {
        const what = (vv[3] ?? vv[6] ?? '').trim();
        const prop =
          what === 'text'
            ? 'color'
            : what === 'border'
              ? 'border-color'
              : 'background-color';
        const group =
          prop === 'color'
            ? 'text'
            : prop === 'border-color'
              ? 'border'
              : 'background';
        const k1 = variantKey(part, vv[1]);
        const k2 = variantKey(part, vv[4]);
        const w2 = k2.replace(':', '=');
        const read = C.partReads(one(part), group).find(
          r =>
            r.props.includes(prop) &&
            r.when.includes(w2) &&
            !/overlay|tint/.test(r.token),
        );
        if (read) {
          seenPart(part);
          const d = {
            text: `${part} (${vv[1]}) takes the ${prop} ${vv[4]} ${part}s have: var(${read.token}); ${vv[4]} is not changed`,
            options: [[set(prop, `var(${read.token})`, {on: part, when: k1})]],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
          continue;
        }
      }
    }
    // "background alpha 0.5": the part's own fill at that alpha, in each
    // mode from its own color.
    {
      const al = /\bbackground alpha (0?\.\d+|1)\b/.exec(c.text);
      if (al && c.parts.length) {
        const a = Number(al[1]);
        for (const p of c.parts) {
          seenPart(p.on);
          const {noState: _n, ...f} = flagsFor(c, p);
          // The fill the part shows at rest (its own value, else the token
          // its plain rule reads, never an overlay), mixed with
          // transparent: it follows both modes.
          const own = partValue(p.on, 'background-color');
          const tok = own
            ? null
            : restColorRead(C.partReads(one(p.on), 'background'));
          const base = own ?? (tok ? `var(${tok})` : null);
          const d = {
            text: base
              ? `${p.on}'s own fill (${base}) at ${a} alpha, in both modes`
              : `${p.on} has no fill of its own to make see-through`,
            options: base
              ? [
                  [
                    set(
                      'background-color',
                      `color-mix(in srgb, ${base} ${Math.round(a * 100)}%, transparent)`,
                      f,
                    ),
                  ],
                ]
              : [],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
        }
        continue;
      }
    }
    // "the dialog the same color as the page", "input background match the
    // page": the part takes the page's own color (the token the page is
    // painted with), so it follows both modes; the page is not changed.
    {
      const pageRef =
        /\b(?:(?:the )?same(?: colou?r| background)? as|match(?:es|ing)?|like) (?:the |my )?page(?: background| colou?r)?\b/.test(
          c.text,
        );
      const subject = c.parts.find(x => !['page', 'app-shell'].includes(x.on));
      if (pageRef && subject) {
        seenPart(subject.on);
        const {noState: _n, ...f} = flagsFor(c, subject);
        const d = {
          text: `${subject.on} takes the page's color: var(--color-background-body), in both modes (the page is not changed)`,
          options: [
            [set('background-color', 'var(--color-background-body)', f)],
          ],
          intent: {...intentOf(c, ['app-shell']), subjects: [subject.on]},
        };
        push(d);
        recordTop(c, d.options[0] ?? []);
        continue;
      }
    }
    // "heading level 9 bigger": headings go from 1 to 6.
    {
      const lvl = /\b(?:heading\s+level\s*|h)([7-9]|[1-9]\d)\b/.exec(c.text);
      if (lvl && /\bheading|\bh\d/.test(c.text)) {
        push({
          text: `there is no heading level ${lvl[1]}: headings go from 1 to 6, so nothing is changed`,
          options: [],
        });
        continue;
      }
    }
    // "card padding 0 steps more": no steps, nothing to change.
    if (
      /\b(?:0|zero|no)\s+(?:more\s+)?(?:steps?|notches?|levels?)\s+(?:more|less|bigger|smaller|rounder|sharper)\b/.test(
        c.text,
      )
    ) {
      push({
        text: `"${c.text.trim()}" asks for no steps, so nothing changes`,
        options: [],
      });
      continue;
    }
    // A bound on a length ("bigger than 4px", "at least 2px", "under 40px",
    // "no bigger than 12px"): held from the value now; nothing when the
    // part is already inside it.
    {
      const bound = boundOf(c.text);
      const prop = /\bgap\b/.test(c.text)
        ? 'gap'
        : /\b(padding|spacing|room)\b/.test(c.text)
          ? 'padding'
          : /\b(radius|corners?|rounder|sharper)\b/.test(c.text)
            ? 'border-radius'
            : /\b(text|font)\b/.test(c.text)
              ? 'font-size'
              : /\bborders?\b/.test(c.text)
                ? 'border-width'
                : null;
      if (bound && prop && c.parts.length) {
        const {up, strict, limit, said} = bound;
        for (const p of c.parts) {
          seenPart(p.on);
          const now = partPropNow(p.on, prop);
          const m = /^(\d*\.?\d+)(px|rem)?/.exec(String(now ?? ''));
          const nowPx = m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null;
          const {noState: _n, ...f} = flagsFor(c, p);
          const inside =
            nowPx != null &&
            (up
              ? strict
                ? nowPx > limit
                : nowPx >= limit
              : strict
                ? nowPx < limit
                : nowPx <= limit);
          if (inside) {
            push({
              text: `${p.on} has ${prop} ${now} now, already ${said}; nothing to change`,
              options: [],
            });
            continue;
          }
          const v = `${Math.max(0, Math.round(strict ? (up ? limit * 1.25 : limit * 0.8) : limit))}px`;
          const d = {
            text: `${prop} on ${p.on} ${said}: ${v}${now ? ` (now ${now})` : ''}`,
            options: [[set(prop, v, f)]],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
        }
        continue;
      }
    }
    // "avatars 24x24px", "icons 16 x 16": a size of that width and height.
    {
      const pair =
        /\b(\d*\.?\d+)(px|rem|em)?\s*[x×]\s*(\d*\.?\d+)(px|rem|em)?\b/.exec(
          c.text,
        );
      if (
        pair &&
        c.parts.length &&
        !/\b(padding|gap|margin|spacing|radius|corners?|border|shadow|outline)\b/.test(
          c.text,
        )
      ) {
        const unit = pair[4] ?? pair[2] ?? 'px';
        const w = `${pair[1]}${pair[2] ?? unit}`;
        const h = `${pair[3]}${unit}`;
        for (const p of c.parts) {
          seenPart(p.on);
          const {noState: _n, ...f} = flagsFor(c, p);
          const d = {
            text: `${p.on} ${w} by ${h}: its width and height`,
            options: [[set('width', w, f), set('height', h, f)]],
            sequence: true,
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
        }
        continue;
      }
    }
    // The parts the clause names, in the order the words name them.
    const inOrder = () =>
      [
        ...new Set([
          ...c.parts.map(x => x.on),
          ...lex.parts.filter(([re]) => re.test(c.text)).map(([, x]) => x.on),
        ]),
      ]
        .map(on => ({
          on,
          at: Math.min(
            ...lex.parts
              .filter(([, x]) => x.on === on)
              .map(([re]) => re.exec(c.text)?.index ?? Infinity),
          ),
        }))
        .sort((x, y) => x.at - y.at)
        .map(x => x.on);
    /** The color property a side of a comparison names. @param {string} t */
    const colorProp = t =>
      /\b(text|labels?|font|words?)\b/.test(t)
        ? 'color'
        : /\bborders?\b/.test(t)
          ? 'border-color'
          : /\b(background|fill|bg)\b/.test(t)
            ? 'background-color'
            : null;
    // "button text the same color as the card text", "input border the
    // same color as the button background", "dialog background match the
    // card background": that color property of the other part, onto the
    // first part's property the words name; the other part is not changed.
    {
      const cmp =
        /\b(?:(?:the )?same colou?r as|match(?:es|ing)?|colou?red like)\s+(?:the\s+|my\s+)?/.exec(
          c.text,
        );
      const ordered = cmp ? inOrder() : [];
      const left = cmp ? c.text.slice(0, cmp.index) : '';
      const right = cmp ? c.text.slice((cmp.index ?? 0) + cmp[0].length) : '';
      const subjectProp = cmp ? colorProp(left) : null;
      if (
        cmp &&
        ordered.length >= 2 &&
        (subjectProp || /colou?r/.test(cmp[0]))
      ) {
        const sp = subjectProp ?? 'background-color';
        const rp =
          colorProp(right) ?? (sp === 'color' ? 'color' : 'background-color');
        const [subjectOn, sourceOn] = ordered;
        const value = partPropNow(sourceOn, rp, true);
        if (value) {
          seenPart(subjectOn);
          seenPart(sourceOn);
          const d = {
            text: `${subjectOn}'s ${sp} takes ${sourceOn}'s ${rp}: ${value} (${sourceOn} is not changed)`,
            options: [[set(sp, value, {on: subjectOn})]],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
          continue;
        }
      }
    }
    // "the card and dialog corners match", "cards and dialogs equally
    // round", "buttons and inputs the same height": the second part takes
    // the first part's value, so they match; nothing new is written.
    {
      const sym =
        /\b(match|equally|alike|the same(?! \w+ as\b)(?: \w+)?)\s*$|\b(?:equally|the same) (round(?:ed)?|tall|high|padd(?:ed|ing)|big|bold)\b/.exec(
          c.text,
        );
      // The parts of the whole sentence ("the card and dialog corners
      // match" reads "the card" as a clause of its own).
      const sentence =
        q.split(/[;.\n]/).find(x => x.includes(c.text.trim())) ?? c.text;
      const ordered =
        sym && !/\b(as|than)\b/.test(sentence)
          ? lex.parts
              .map(([re, x]) => ({
                on: x.on,
                at: re.exec(sentence)?.index ?? -1,
              }))
              .filter(x => x.at >= 0)
              .sort((x, y) => x.at - y.at)
              .map(x => x.on)
              .filter((on, i, all) => all.indexOf(on) === i)
          : [];
      const prop = /round|corner|radius/.test(c.text)
        ? 'border-radius'
        : /\bpadd/.test(c.text)
          ? 'padding'
          : /\b(tall|height|high)\b/.test(c.text)
            ? 'height'
            : /\bcolou?r|\bborders?\b/.test(c.text)
              ? (colorProp(c.text) ?? 'background-color')
              : null;
      if (sym && ordered.length === 2 && prop) {
        const [sourceOn, subjectOn] = ordered;
        const value = partPropNow(sourceOn, prop, true);
        const has = partPropNow(subjectOn, prop, true);
        if (value) {
          seenPart(subjectOn);
          seenPart(sourceOn);
          const d =
            has && has === value
              ? {
                  text: `${sourceOn} and ${subjectOn} already have the same ${prop} (${value}), so nothing changes`,
                  options: [],
                }
              : {
                  text: `${subjectOn} takes ${sourceOn}'s ${prop} so they match: ${value} (${sourceOn} is not changed)`,
                  options: [[set(prop, value, {on: subjectOn})]],
                };
          push(d);
          recordTop(c, d.options[0] ?? []);
          // The clause that only named the first part asks nothing more.
          symDone.add(sourceOn);
          continue;
        }
        // Nothing to copy from: say so, never a new value for both.
        seenPart(subjectOn);
        seenPart(sourceOn);
        push({
          text: `${sourceOn} has no ${prop} of its own that how can read, so it cannot copy it onto ${subjectOn}; give the value for both (for example "${prop} 40px on ${sourceOn} and ${subjectOn}")`,
          options: [],
        });
        symDone.add(sourceOn);
        continue;
      }
    }
    // "cards as round as buttons", "card padding the same as button
    // padding", "make the cards match the buttons' corners", "inputs as
    // tall as buttons": the part named first takes the other part's value
    // of that property now, written out; the other part is not changed.
    {
      const measure =
        /\bas (round(?:ed)?|tall|high|bold|big|large) as\b|\bsame (corners?|radius|roundness|padding|height|font size|text size|weight) as\b|\b(?:match(?:es|ing)?|(?<!\b(?:i'?d|i|would|we'?d|you'?d)\s)like)\b[^.]*?\b(corners?|radius|padding|height)\b|\b(corners?|radius|padding|height)\b[^.]*?\b(?:bigger|larger|more|smaller|less|tighter|rounder|squarer) than\b|\b(rounder|squarer|sharper) than\b|\b(corners?|radius|padding|height)\b[^.]*?\b(?:the )?same as\b/.exec(
          c.text,
        );
      const word = measure ? (measure.slice(1).find(Boolean) ?? '') : '';
      const prop = /round|corner|radius/.test(word)
        ? 'border-radius'
        : /padding/.test(word)
          ? 'padding'
          : /tall|high|height/.test(word)
            ? 'height'
            : /bold|weight/.test(word)
              ? 'font-weight'
              : /big|large|size/.test(word)
                ? 'font-size'
                : null;
      // The parts as the words name them (the comparison's own part may have
      // been taken out of the clause's parts already).
      const named = [
        ...new Set([
          ...c.parts.map(x => x.on),
          ...lex.parts.filter(([re]) => re.test(c.text)).map(([, x]) => x.on),
        ]),
      ]
        .map(on => ({
          on,
          at: Math.min(
            ...lex.parts
              .filter(([, x]) => x.on === on)
              .map(([re]) => re.exec(c.text)?.index ?? Infinity),
          ),
        }))
        .sort((x, y) => x.at - y.at);
      const sourceOn =
        named.length >= 2 ? named[1].on : (compared.get(c) ?? null);
      const subjectOn = named[0]?.on ?? null;
      if (prop && subjectOn && sourceOn && subjectOn !== sourceOn) {
        const now = partPropNow(sourceOn, prop);
        // "twice as round as inputs": that amount of the other part's;
        // else the other part's own value, or the token it reads (so the
        // copy follows it).
        // "card padding bigger than button padding": a step past the other
        // part's value, never a copy of it.
        const past =
          /\b(bigger|larger|more|rounder|smaller|less|tighter|squarer|sharper) than\b/.exec(
            c.text,
          )?.[1];
        const pastFactor = past
          ? /^(smaller|less|tighter|squarer|sharper)$/.test(past)
            ? 0.8
            : 1.25
          : null;
        // "4px rounder than buttons": the other part's value and that much.
        const delta = past
          ? (c.lengths.find(l => /(px|rem|em)$/.test(l)) ?? null)
          : null;
        const factor = delta ? null : (exactFactor(c.text) ?? pastFactor);
        const value = delta
          ? `calc(${partPropNow(sourceOn, prop, true)} ${pastFactor && pastFactor < 1 ? '-' : '+'} ${delta})`
          : now && factor
            ? scaledBox(now, factor)
            : past
              ? null
              : partPropNow(sourceOn, prop, true);
        if (!value) {
          // Nothing to measure against: said, never a step on both.
          seenPart(subjectOn);
          seenPart(sourceOn);
          push({
            text: `${sourceOn} has no ${prop} of its own that how can read, so ${subjectOn} cannot take it; give the value (for example "${prop} 16px on ${subjectOn}")`,
            options: [],
          });
          continue;
        }
        if (value) {
          seenPart(subjectOn);
          seenPart(sourceOn);
          // The subject's own variant and the clause's state stay.
          const sub = c.parts.find(x => x.on === subjectOn);
          const sflags = {
            on: subjectOn,
            ...(sub?.when ? {when: sub.when} : {}),
            ...(c.state ? {state: c.state} : {}),
          };
          const d = {
            text:
              past && !exactFactor(c.text)
                ? `${subjectOn} ${prop} ${delta ?? 'a step'} ${pastFactor && pastFactor > 1 ? 'past' : 'under'} ${sourceOn}'s: ${value} (${sourceOn} has ${now} now and is not changed)`
                : `${subjectOn} takes ${factor ? `${factor} times ` : ''}${sourceOn}'s ${prop}: ${value} (${sourceOn} has ${now} now and is not changed)`,
            options: [[set(prop, value, sflags)]],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
          continue;
        }
      }
    }
    // "cards the same radius as buttons": the first part takes the second
    // part's value, read from the token the second part reads.
    const same = /\b(?:the )?same (\w+(?: \w+)?) as (?:the )?([a-z-]+)\b/.exec(
      c.text,
    );
    // "buttons twice as round as inputs": the part after "as" is only the
    // measure; the first part is the one that changes.
    const asAs =
      /\bas \w+ as (?:the )?([a-z-]+)/.exec(c.text) ??
      // "cards twice the padding of buttons": the same, by the measure.
      /\b(?:twice|double|half|triple|three times)\s+(?:the\s+)?\w+\s+(?:of|than|as)\s+(?:the\s+)?([a-z-]+)/.exec(
        c.text,
      );
    if (asAs && c.parts.length >= 2) {
      const after = (/** @type {{on: string}} */ p) =>
        lex.parts.some(
          ([re, x]) =>
            x.on === p.on && (re.exec(c.text)?.index ?? -1) > (asAs.index ?? 0),
        );
      const other = c.parts.find(p => after(p));
      if (other) compared.set(c, other.on);
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
    // "card radius 50%": a percent radius in CSS is a share of the box's
    // own size (an oval), not of the radius now. With "of now" or a
    // direction it is a factor (read above); alone it is refused with the
    // exact command that works.
    const pctRadius =
      /\b(?:radius|corners?|rounding)\b(?:\s+(?:to|at|of))?\s+(\d{1,3}(?:\.\d+)?)\s?%(?!\s*(?:of|as|bigger|smaller|larger|more|less|rounder|sharper)\b)/.exec(
        c.text,
      );
    if (pctRadius && !c.dir && exactFactor(c.text) == null && c.parts[0]) {
      const n = pctRadius[1];
      push({
        text: `a ${n}% radius in CSS is a share of the ${c.parts[0].on}'s own width and height (an oval or a circle), not ${n}% of the radius now; for ${n}% of the radius now: ${HOW} '${c.parts[0].on} radius ${n}% of now'; for a pill: ${P} set ${env.slug} corners pill --on ${c.parts[0].on}`,
        options: [],
        lookup: `${HOW} '${c.parts[0].on} radius ${n}% of now'`,
      });
      continue;
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
        // The clause's state and variant ("on hover", "primary") are kept,
        // and the move starts from that state's own radius.
        const {noState: _ns, ...pf} = flagsFor(c, c.parts[0]);
        const scopedRadius =
          pf.state || pf.when
            ? ([...env.data.settings]
                .reverse()
                .find(
                  st =>
                    st.thing === 'border-radius' &&
                    st.on === on &&
                    (st.state ?? null) === (pf.state ?? null) &&
                    (st.when ?? null) === (pf.when ?? null) &&
                    !st.mode,
                )?.value ?? null)
            : null;
        // A radius the theme set on the part in px moves from that value.
        const ownRadius = scopedRadius ?? partValue(on, 'border-radius');
        if (ownRadius && /^\d*\.?\d+px$/.test(ownRadius)) {
          const next = Math.max(0, parseFloat(ownRadius) + (down ? -n : n));
          const d = {
            text: `${on}'s corners ${down ? 'down' : 'up'} by ${n}px: from ${ownRadius} to ${next}px`,
            options: [[set('border-radius', `${next}px`, pf)]],
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
                  pf,
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
      // "the text 2px bigger": the base text size, now plus that; "borders
      // 1px thicker": the shared border width, now plus that.
      if (!c.parts.length) {
        const textAsk =
          /\b(text|font)\b/.test(c.text) &&
          !/\b(borders?|padding|gap|corners?|radius)\b/.test(c.text);
        const borderAsk =
          /\bborders?\b/.test(c.text) &&
          /\b(thick|thin|width|wide)\w*/.test(c.text);
        const tok = textAsk
          ? '--font-size-base'
          : borderAsk
            ? '--border-width'
            : null;
        const raw = tok ? String(current(tok) ?? '') : '';
        const m = /^(\d*\.?\d+)(px|rem)$/.exec(raw);
        if (tok && m) {
          const nowPx = Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
          const next = Math.max(
            0,
            Math.round((nowPx + (down ? -n : n)) * 100) / 100,
          );
          const d = textAsk
            ? {
                text: `the base text size ${down ? 'down' : 'up'} by ${n}px: from ${nowPx}px to ${next}px (every heading scales from it)`,
                options: [[set('text-size', String(next))]],
              }
            : {
                text: `the shared border width ${down ? 'down' : 'up'} by ${n}px: from ${raw} to ${next}px`,
                options: [[set('--border-width', `${next}px`)]],
              };
          push(d);
          recordTop(c, d.options[0] ?? []);
          continue;
        }
      }
      // Padding, gap or text size moved by a length: the value now plus or
      // minus it, each side on its own, exact.
      if (c.parts.length) {
        const on = c.parts[0].on;
        const {noState: _ns2, ...pf} = flagsFor(c, c.parts[0]);
        const prop = /\b(gaps?|between)\b/.test(c.text)
          ? 'gap'
          : /\bborders?\b/.test(c.text) &&
              /\b(thick|thin|width|wide)\w*/.test(c.text)
            ? 'border-width'
            : c.aspects.includes('fontsize') ||
                /\b(font|text)[- ]size\b/.test(c.text)
              ? 'font-size'
              : c.aspects.includes('spacing') || /\bpadding\b/.test(c.text)
                ? 'padding'
                : null;
        const level = /^level:([1-6])$/.exec(pf.when ?? '')?.[1];
        const now = !prop
          ? null
          : prop === 'font-size' && on === 'heading' && level
            ? (partValue(on, 'font-size') ??
              current(`--text-heading-${level}-size`))
            : prop === 'gap'
              ? (partValue(on, 'gap') ??
                (() => {
                  const r = C.partReads(one(on), 'spacing').find(x =>
                    x.props.some(q => /gap/.test(q)),
                  );
                  return r ? current(r.token) : null;
                })())
              : prop === 'padding'
                ? (partValue(on, 'padding') ?? paddingBoxNow(on))
                : prop === 'border-width'
                  ? (partValue(on, 'border-width') ??
                    (() => {
                      const r = C.partReads(one(on), 'border').find(x =>
                        x.props.includes('border-width'),
                      );
                      return r ? current(r.token) : current('--border-width');
                    })())
                  : partPropNow(on, prop);
        /** @param {string} v */
        const toPx = v => {
          const m = /^(\d*\.?\d+)(px|rem|em)$/.exec(v);
          return m ? Number(m[1]) * (m[2] === 'px' ? 1 : 16) : null;
        };
        const sides = now ? String(now).trim().split(/\s+/) : [];
        const moved = sides.map(x => {
          const px = toPx(x);
          return px == null
            ? null
            : `${Math.max(0, Math.round((px + (down ? -n : n)) * 100) / 100)}px`;
        });
        if (prop && sides.length && sides.length <= 4 && moved.every(Boolean)) {
          const next = moved.join(' ');
          const d = {
            text: `${prop}${pf.when || pf.state ? ` on ${on} (${[pf.when, pf.state].filter(Boolean).join(', ')})` : ` on ${on}`} ${down ? 'down' : 'up'} by ${n}px: from ${now} to ${next}`,
            options: [[set(prop, next, pf)]],
          };
          push(d);
          recordTop(c, d.options[0] ?? []);
          continue;
        }
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
      // A percent padding or gap is an amount of the one there now ("50%
      // bigger", "150%"), answered below: a CSS percent padding is half the
      // container's width.
      !(
        /^(padding|gap|row-gap|column-gap)$/.test(named.prop) &&
        /^\d*\.?\d+%$/.test(String(named.value).trim())
      ) &&
      // "padding 3 times bigger", "25% darker": an amount of what is there,
      // never the number as a value.
      !(
        exactFactor(c.text) != null &&
        withoutAmount(c.text) !== c.text.replace(/\s+/g, ' ')
      ) &&
      !(
        exactFactor(c.text) != null &&
        /^\d*\.?\d+%?$/.test(String(named.value).trim())
      ) &&
      !(
        /^\d*\.?\d+%$/.test(String(named.value).trim()) &&
        /\b(darker|lighter|brighter|bigger|smaller|larger)\b/.test(c.text)
      ) &&
      // A divider's thickness and color are its border tokens.
      !c.parts.some(p => p.on === 'divider') &&
      c.parts.length &&
      c.parts.every(p => TARGET.has(one(p.on)) || FAMILIES[p.on])
    ) {
      // "horizontal padding 20px", "padding top 12px": only those sides.
      const side = named.prop === 'padding' ? sideIn(c) : null;
      const prop = !side
        ? named.prop
        : /^(left|right|top|bottom)$/.test(side)
          ? `padding-${side}`
          : /^(vertical|block)/.test(side)
            ? 'padding-block'
            : 'padding-inline';
      const steps = c.parts.slice(0, 3).map(p => {
        const {noState: _n, ...f} = flagsFor(c, p);
        return {p, f, st: set(prop, named.value, {...f, ...modeOf(c)})};
      });
      // A property set cannot use on a part (a heading's color comes from
      // its prop) is answered the usual way, which says why.
      if (steps.every(({st}) => env.check([st]).ok)) {
        for (const {p, f, st} of steps) {
          seenPart(p.on);
          const d = {
            text: `${prop} on ${p.on}${f.state ? ` when ${f.state}` : ''}, as you wrote it`,
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
          // (Only when that value reads what the step writes: a token step
          // on a status that paints with its own token reaches nothing;
          // and never inside an answer run as one sequence.)
          const readsThere = (
            /** @type {string} */ vp,
            /** @type {string} */ v,
          ) =>
            !first ||
            !/^--/.test(first.thing) ||
            Object.keys(GROUPS).some(g =>
              (C.partReads(one(String(first.on)), g) ?? []).some(
                r =>
                  r.token === first.thing &&
                  r.when.some(w => w.split(' ').includes(`${vp}=${v}`)),
              ),
            );
          if (
            first?.on &&
            !first.when &&
            variant &&
            !d.sequence &&
            readsThere(variant[0], variant[1][0]) &&
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
   * A token's value now with every var() it reads written out.
   * @param {string} token
   */
  function resolvedValue(token) {
    let v = String(current(token) || '');
    for (let i = 0; i < 6 && /var\(/.test(v); i++)
      v = v.replace(
        /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*))?\)/gi,
        (_, t, fb) => String(current(t) || fb || ''),
      );
    return v.trim() || null;
  }

  /**
   * A part's padding box now from the base theme's rule, else from the
   * token Core reads for each side (a button is 8px block, 12px inline).
   * @param {string} part
   * @returns {string | null}
   */
  function paddingBoxNow(part) {
    const rule = partRuleTokens(
      ctx.project.cwd,
      env.slug,
      env.data.like,
      one(part),
    ).get('padding');
    if (rule) {
      const resolved = String(rule).replace(
        /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
        (m, t) => current(t) || m,
      );
      if (scaledBox(resolved, 1)) return resolved;
    }
    const reads = C.partReads(one(part), 'spacing').filter(r =>
      r.props.some(q => /^padding/.test(q)),
    );
    /** @param {RegExp} re */
    const sideTok = re =>
      reads.find(r => r.props.some(x => re.test(x)))?.token ?? null;
    const toks = [
      sideTok(/^padding-(block(-start)?|top)$/),
      sideTok(/^padding-(inline(-end)?|right)$/),
      sideTok(/^padding-(block(-end)?|bottom)$/),
      sideTok(/^padding-(inline(-start)?|left)$/),
    ];
    if (toks.some(Boolean)) {
      const box = toks.map(tk => (tk ? current(tk) || '0px' : '0px'));
      return box[0] === box[2] && box[1] === box[3]
        ? box[0] === box[1]
          ? box[0]
          : `${box[0]} ${box[1]}`
        : box.join(' ');
    }
    return partPropNow(part, 'padding');
  }

  /**
   * A part's value of a property now: its own setting, else the token its
   * plain rule reads for it, written out.
   * @param {string} part
   * @param {string} prop
   * @param {boolean} [live] the token itself (`var(--x)`) when the part has
   *   no setting of its own, so the copy follows it
   * @returns {string | null}
   */
  function partPropNow(part, prop, live = false) {
    const own = partValue(part, prop);
    if (own) return own;
    // A color: the text color (or fill) the part shows at rest.
    if (
      prop === 'color' ||
      prop === 'background-color' ||
      prop === 'border-color'
    ) {
      const group =
        prop === 'color'
          ? 'text'
          : prop === 'border-color'
            ? 'border'
            : 'background';
      // A part with no text color of its own shows the main text color.
      const token =
        restColorRead(C.partReads(one(part), group)) ??
        (group === 'text' ? '--color-text-primary' : null);
      if (!token) return null;
      return live ? `var(${token})` : resolvedValue(token);
    }
    // The part's plain rule as built (both sides of a two-value padding).
    if (prop === 'padding') {
      const rule = partRuleTokens(
        ctx.project.cwd,
        env.slug,
        env.data.like,
        one(part),
      ).get('padding');
      if (rule)
        return live
          ? String(rule)
          : String(rule).replace(
              /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
              (m, t) => resolvedValue(t) || m,
            );
    }
    const group = /** @type {Record<string, string>} */ ({
      'border-radius': 'corners',
      padding: 'spacing',
      height: 'spacing',
      'font-size': 'font',
      'font-weight': 'font',
    })[prop];
    if (!group) return null;
    const want =
      prop === 'padding'
        ? /^padding/
        : prop === 'height'
          ? /^(min-)?(block-size|height)$/
          : new RegExp(`^${prop}$`);
    const reads = C.partReads(one(part), group).filter(
      r => group === 'corners' || r.props.some(x => want.test(x)),
    );
    const read =
      reads.find(r => r.when.includes('')) ??
      reads.find(r => r.when.some(w => /=(primary|md|medium)$/.test(w))) ??
      reads[0];
    if (!read) return null;
    return live ? `var(${read.token})` : resolvedValue(read.token);
  }

  /**
   * The side word of a padding ask ("top", "horizontal", "block"), read with
   * the clause's part names taken out ("code block", "top nav" are parts,
   * not sides).
   * @param {Clause} c
   * @returns {string | undefined}
   */
  function sideIn(c) {
    const ons = new Set(c.parts.map(x => x.on));
    const text = lex.parts
      .filter(([, x]) => ons.has(x.on))
      .reduce((t, [re]) => t.replace(new RegExp(re.source, 'g'), ' '), c.text);
    // left/right/top/bottom/sides name a side anywhere; inline, block,
    // horizontal and vertical only beside the padding or margin they
    // qualify ("inline padding", "padding-inline", "padding 8px vertical"),
    // never as a word of a part's name ("inline code", "block quote").
    const plain = /\b(left|right|top|bottom|sides)\b/.exec(text)?.[1];
    if (plain) return plain;
    const axis =
      /\b(horizontal(?:ly)?|vertical(?:ly)?|inline|block)[\s-]+(?:padding|margin)\b/.exec(
        text,
      )?.[1] ??
      /\b(?:padding|margin)[\s-]+(?:(?:of\s+)?-?\d*\.?\d+(?:px|rem|em)?\s+)?(?:on\s+the\s+)?(horizontal(?:ly)?|vertical(?:ly)?|inline|block)\b/.exec(
        text,
      )?.[1];
    return axis;
  }

  /**
   * The `key:value` a part names a variant word by ("success" on a badge
   * is `variant:success`, or the part's own key for it), read from the
   * rules the part has; `variant:<word>` when none says.
   * @param {string | null} part
   * @param {string} word
   */
  function variantKey(part, word) {
    if (part)
      for (const g of Object.keys(GROUPS))
        for (const r of C.partReads(one(part), g) ?? [])
          for (const w of r.when ?? []) {
            const m = new RegExp(`(?:^|\\s)([a-z]+)=${word}(?:\\s|$)`).exec(w);
            if (m) return `${m[1]}:${word}`;
          }
    return `variant:${word}`;
  }

  /**
   * Whether a part reads a token in any of its rules.
   * @param {string} part
   * @param {string} token
   */
  function partReadsToken(part, token) {
    return Object.keys(GROUPS).some(g =>
      C.partReads(one(part), g).some(r => r.token === token),
    );
  }

  /**
   * A text token's value now, both modes in one value.
   * @param {string} tok
   */
  function textPin(tok) {
    const l = current(tok, 'light');
    const dk = current(tok, 'dark');
    return modal && l !== dk ? `light-dark(${l}, ${dk})` : l;
  }

  /**
   * The step that keeps one part as it is now when a step changes the whole
   * theme (or a group the part is in), or null when none can.
   * @param {Step} st
   * @param {{on: string, when?: string, state?: string}} p
   * @returns {Step | null | typeof UNTOUCHED}
   */
  function keepAsIs(st, p) {
    const flags = {
      on: p.on,
      ...(p.when ? {when: p.when} : {}),
      ...(p.state ? {state: p.state} : {}),
    };
    // A token the part never reads does not change it: nothing to keep.
    // (Only tokens a part never inherits: a text token reaches every part's
    // text through inheritance.)
    if (/^--(spacing|size)-/.test(st.thing) && !partReadsToken(p.on, st.thing))
      return UNTOUCHED;
    // A heading level kept from a text color set on all headings: a
    // heading's color is the text tokens on it, each kept at the value it
    // has now, written out per mode.
    if (
      st.thing === 'color' &&
      p.on === 'heading' &&
      /^level:/.test(p.when ?? '')
    )
      return set(
        '--color-text-primary',
        textPin('--color-text-primary'),
        flags,
      );
    // A border width kept from a whole-theme change: the width the part
    // shows now (its own, else the token it reads), written out.
    if (st.thing === '--border-width' || st.thing === 'border-width') {
      const read = C.partReads(one(p.on), 'border').find(r =>
        r.props.includes('border-width'),
      );
      if (!read && !partValue(p.on, 'border-width')) return UNTOUCHED;
      const now =
        partValue(p.on, 'border-width') ??
        (read ? resolvedValue(read.token) || current(read.token) : null);
      return now ? set('border-width', now, flags) : null;
    }
    // A filter (a hover darkening) kept on a variant: the filter it has now
    // in that state, none when it has none.
    if (st.thing === 'filter')
      return set('filter', partValue(p.on, 'filter') ?? 'none', {
        ...flags,
        ...(st.state && !p.state ? {state: st.state} : {}),
      });
    // A radius token reaches a part through its own variables too: pin the
    // radius it has now, as for the corners dial.
    if (/^--radius-/.test(st.thing))
      return keepAsIs({...st, thing: 'corners'}, p);
    // "all text bigger except buttons": the part's text size now.
    if (
      st.thing === 'text-size' ||
      st.thing === '--font-size-base' ||
      /^--text-[a-z-]+-size$/.test(st.thing)
    ) {
      const now = partPropNow(p.on, 'font-size');
      return now
        ? set('font-size', now, {
            ...flags,
            ...(p.state ? {state: p.state} : {}),
          })
        : null;
    }
    if (st.on && st.on !== p.on && !(FAMILIES[st.on] ?? []).includes(one(p.on)))
      return null;
    if (st.thing === 'corners' || st.thing === 'border-radius') {
      // What the part has now: its own setting, else the token it reads
      // (its plain rule first, else any rule's), never another token.
      const reads = C.partReads(one(p.on), 'corners');
      // A kept variant or size: the rule for it first.
      const wantWhen = p.when?.replace(':', '=');
      const read =
        (wantWhen ? reads.find(r => r.when.includes(wantWhen)) : undefined) ??
        reads.find(r => r.when.includes('')) ??
        reads[0];
      // The base theme's own radius for the part, written out, comes before
      // the token it reads.
      const baseOwn = /** @type {any} */ (env.base).components?.[one(p.on)]?.[
        p.when ?? 'base'
      ]?.borderRadius;
      // A part that shows a radius how cannot read (a part it renders, such
      // as a selectable card's card) has no pin: never an invented value.
      if (!partValue(p.on, 'border-radius') && !baseOwn && !read) return null;
      // A whole-theme corner change reaches the part only through the token
      // it reads: the token pinned on the part keeps every corner Core draws
      // from it (a button group's square inner joins), where a radius
      // written on the part would override them.
      if (!st.on && !partValue(p.on, 'border-radius') && !baseOwn && read) {
        const now = current(read.token);
        if (now) return set(read.token, now, flags);
      }
      return set(
        'border-radius',
        partValue(p.on, 'border-radius') ??
          (baseOwn
            ? String(baseOwn).replace(
                /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
                (m, t) => resolvedValue(t) || m,
              )
            : null) ??
          (read ? current(read.token) || `var(${read.token})` : null) ??
          '',
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
    ) {
      // The shadow it has now, written out (the tokens it reads may be set
      // to none in the same answer).
      // Its shadow at rest; none when it has none.
      const read = C.partReads(one(p.on), 'shadow').find(
        r => /^--shadow-/.test(r.token) && r.when.some(w => !w.includes(':')),
      );
      const now =
        partValue(p.on, 'box-shadow') ??
        (read ? resolvedValue(read.token) : 'none');
      return now ? set('box-shadow', now, flags) : null;
    }
    if (
      st.thing === 'headings' ||
      st.thing === '--text-body-weight' ||
      st.thing === 'font-weight'
    ) {
      // The weight it has now: its own, else the token it reads for it.
      const wantW = p.when?.replace(':', '=');
      const reads = C.partReads(one(p.on), 'font').filter(r =>
        r.props.includes('font-weight'),
      );
      const read =
        (wantW ? reads.find(r => r.when.includes(wantW)) : undefined) ??
        reads[0];
      // The base theme's own weight for that variant or level comes first.
      const ownW = /** @type {any} */ (env.base).components?.[one(p.on)]?.[
        p.when ?? 'base'
      ]?.fontWeight;
      if (typeof ownW === 'string' && !partValue(p.on, 'font-weight')) {
        const v = ownW.replace(
          /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
          (m, t) => resolvedValue(t) || m,
        );
        return set('font-weight', v, flags);
      }
      // Its own weight, else the token it reads, else the body weight it
      // inherits now.
      const now =
        partValue(p.on, 'font-weight') ??
        (read ? resolvedValue(read.token) : null) ??
        String(current('--text-body-weight') || '400');
      return set('font-weight', now, flags);
    }
    const group = /** @type {Record<string, string>} */ ({
      background: 'background',
      'background-color': 'background',
      color: 'text',
      'border-color': 'border',
      border: 'border',
    })[st.thing];
    if (group) {
      const want = p.when?.replace(':', '=');
      // The base theme's own rule for that variant comes first (it wins over
      // what Core reads).
      if (!p.state) {
        const camel = /** @type {Record<string, string>} */ ({
          background: 'backgroundColor',
          'background-color': 'backgroundColor',
          color: 'color',
          'border-color': 'borderColor',
          border: 'borderColor',
        })[st.thing];
        const baseOwn = camel
          ? /** @type {any} */ (env.base).components?.[one(p.on)]?.[
              p.when ?? 'base'
            ]?.[camel]
          : null;
        if (typeof baseOwn === 'string')
          return set(
            st.thing === 'border' ? 'border-color' : st.thing,
            baseOwn,
            flags,
          );
      }
      // A state kept: the token the part reads in that state for the
      // property the pin writes (never a tint drawn over the fill as an
      // image), else what it shows at rest.
      const pinProps =
        st.thing === 'color'
          ? ['color']
          : /^border/.test(st.thing)
            ? ['border-color']
            : ['background-color', 'background'];
      const inState = p.state
        ? C.partReads(one(p.on), group).find(
            r =>
              r.when.some(
                w => w.includes(`:${p.state}`) && !/::before/.test(w),
              ) &&
              r.props.some(x => pinProps.includes(x)) &&
              !/overlay|tint/.test(r.token),
          )
        : null;
      const read =
        inState ??
        C.partReads(one(p.on), group).find(r =>
          want ? r.when.includes(want) : r.when.includes(''),
        ) ??
        C.partReads(one(p.on), group).find(r =>
          p.when
            ? r.when.includes(`--when ${p.when}`) ||
              r.when.some(w => w.includes(p.when?.replace(':', '=') ?? ''))
            : r.when.includes(''),
        );
      // Never an overlay layer (a pressed or hover tint over the fill): the
      // variant's own fill, else none.
      if (read && /overlay|tint/.test(read.token)) {
        // Only the variant's own fill (a transparent card has none).
        const wantWhen = p.when?.replace(':', '=');
        const own = wantWhen
          ? (C.partReads(one(p.on), group).find(
              r =>
                r.when.includes(wantWhen) &&
                /^--color-/.test(r.token) &&
                !/overlay|tint/.test(r.token),
            )?.token ?? null)
          : restColorRead(C.partReads(one(p.on), group));
        return set(
          st.thing === 'border' ? 'border-color' : st.thing,
          own ? `var(${own})` : 'transparent',
          flags,
        );
      }
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
    /**
     * What a part has now for a property in this clause's state or variant
     * ("on hover"): that scope's own setting, else the plain one.
     */
    const nowIn = (/** @type {string} */ part, /** @type {string} */ prop) => {
      if (f.state || f.when) {
        const scoped = [...env.data.settings]
          .reverse()
          .find(
            st =>
              st.thing === prop &&
              st.on === part &&
              (st.state ?? null) === (f.state ?? null) &&
              (st.when ?? null) === (f.when ?? null) &&
              !st.mode,
          );
        if (scoped) return scoped.value;
      }
      return partValue(part, prop);
    };
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
      // "focus ring color like the links": the part after "like" (or "the
      // same as", "match") gives the ring its color; it is not a scope.
      const likeAt =
        /\b(?:like|same(?: colou?r)? as|(?:to )?match(?:es|ing)?)\s+(?:the\s+|my\s+)?/.exec(
          c.text,
        );
      /** @param {string} part */
      const partAt = part =>
        Math.min(
          ...lex.parts
            .filter(([, x]) => x.on === part)
            .map(([re]) => re.exec(c.text)?.index ?? Infinity),
        );
      const like = likeAt
        ? (c.parts
            .map(x => x.on)
            .find(
              x =>
                x &&
                x !== 'focus-ring' &&
                partAt(x) >= (likeAt.index ?? 0) + likeAt[0].length - 1,
            ) ?? null)
        : null;
      // "focus ring on inputs only": the ring's tokens set on that part or
      // group, so the other parts keep theirs.
      const scope =
        c.parts
          .map(x => x.on)
          .find(x => x && x !== 'focus-ring' && x !== like) ?? null;
      if (like) {
        // The color the part shows: its fill, or its text for a part with
        // no fill of its own (a link).
        // Its plain look: the main variant (primary, accent) at rest, else
        // any read at rest.
        /** @param {Array<{token: string, when: string[]}>} reads */
        const atRest = reads => {
          const rest = reads.filter(
            r =>
              /^--color-/.test(r.token) &&
              !/overlay|transparent|tint/.test(r.token) &&
              r.when.some(w => !w.includes(':')),
          );
          return (
            rest.find(r =>
              r.when.some(w => w === '' || /=(primary|accent)$/.test(w)),
            ) ??
            rest[0] ??
            null
          );
        };
        const fill = atRest(C.partReads(one(like), 'background'));
        const text = atRest(C.partReads(one(like), 'text'));
        const read = like === 'link' || !fill ? (text ?? fill) : fill;
        if (read)
          return {
            text: `the focus ring's color${scope ? ` on ${scope} only` : ''}, from ${like}: --focus-outline-color reads ${read.token} (now ${current(read.token) || 'unset'}), so it follows ${like}'s color`,
            options: [
              [
                set('--focus-outline-color', `var(${read.token})`, {
                  ...modeOf(c),
                  ...(scope ? {on: scope} : {}),
                }),
              ],
            ],
          };
      }
      const sc = scope ? {on: scope} : {};
      const scoped = scope ? ` on ${scope} only` : '';
      // "the focus ring lighter / darker": its color, from the color it has
      // now in each mode; never its width.
      if (
        !like &&
        !ringColor &&
        /\b(lighter|lighten|darker|darken|brighter|paler)\b/.test(c.text) &&
        !/\b(thick|thin|width|wide|bigger|smaller)\w*/.test(c.text)
      ) {
        const lighter = /\b(lighter|lighten|brighter|paler)\b/.test(c.text);
        const steps = perMode(
          '--focus-outline-color',
          '--focus-outline-color',
          sc,
          (now, m) =>
            shiftKeepAlpha(
              now,
              lighter ? 0.2 : -0.2,
              current('--color-background-body', m),
            ) ?? now,
          c,
        );
        if (steps.length)
          return {
            text: `the focus ring's color${scoped}, ${lighter ? 'lighter' : 'darker'}: --focus-outline-color${modesSaid(steps)}`,
            options: [steps],
            sequence: steps.length > 1,
          };
      }

      if (ringColor && c.lengths[0] && !c.neg)
        return {
          text: `the focus ring's width and color${scoped}: --focus-outline-width and --focus-outline-color`,
          options: [
            [
              set('--focus-outline-width', c.lengths[0], sc),
              set('--focus-outline-color', ringColor, {...modeOf(c), ...sc}),
            ],
          ],
          sequence: true,
        };
      // "remove the focus outline": a ring keyboard users need; set it to
      // nothing only on the ask, and say what that costs.
      if (c.neg || /\b(remove|hide|get rid of)\b/.test(c.text))
        return {
          text: `no focus ring${scoped}: --focus-outline-width 0px. Keyboard users then cannot see where they are, so keep a visible focus style another way`,
          options: [[set('--focus-outline-width', '0px', sc)]],
        };
      // "focus ring offset 2px": the gap between the part and its ring.
      if (/\boffset\b/.test(c.text))
        return c.lengths[0]
          ? {
              text: `the focus ring's offset${scoped}: --focus-outline-offset`,
              options: [[set('--focus-outline-offset', c.lengths[0], sc)]],
            }
          : null;
      if (
        (a === 'border' && !ringColor) ||
        a === 'size' ||
        a === 'spacing' ||
        /\b(thick|thin|width|strength|stronger|weaker|bolder|subtler)/.test(
          c.text,
        )
      ) {
        // From the theme's own width there (on the part when it sets one).
        const own = scope ? partValue(scope, '--focus-outline-width') : null;
        const now = own ?? current('--focus-outline-width');
        const exact = exactFactor(c.text);
        const factor = exact ?? (c.dir === 'less' ? 0.5 : 1.5);
        const w = c.lengths[0] ?? scaled(now, factor);
        const strength = /\bstrength\b/.test(c.text) && !c.lengths[0];
        return {
          text: `the focus ring's width${scoped || where}: --focus-outline-width ${w ?? ''}${!c.lengths[0] && now ? ` (now ${now})` : ''}${strength ? '; "strength" read as the width of the ring' : ''}${!c.lengths[0] && !exact && !c.dir ? '; no amount was given, so this is a guess: give a width (2px)' : ''}`,
          options: w ? [[set('--focus-outline-width', w, sc)]] : [],
        };
      }
      const color = colorFor(c, 'fill');
      if (c.neg)
        return {
          text: `the focus ring shows keyboard users where they are; it can be made subtle but not removed${scoped}`,
          options: [[set('--focus-outline-width', '1px', sc)]],
        };
      return color
        ? {
            text: `the focus ring's color${scoped}: --focus-outline-color`,
            options: [
              [set('--focus-outline-color', color, {...modeOf(c), ...sc})],
            ],
          }
        : null;
    }
    if (on === 'page') {
      const color = colorFor(c, 'fill');
      // "the page background lighter": the whole-theme answer, per mode.
      if (!color && a === 'background' && c.dir) return answerFor(c, null, a);
      // "page background", "a gradient on the page": the token for a color,
      // and the app shell (the part that paints the page) for a color or
      // a gradient, with example values to change.
      if (!color) {
        // Example values to change, one per mode the theme shows: a light
        // page in light mode and a dark one in dark mode, so text stays
        // readable in both.
        const gradient = /\bgradient\b/.test(c.text);
        const PAGE = {
          light: gradient
            ? 'linear-gradient(180deg, #f5f7fa, #e4ebf5)'
            : '#f5f7fa',
          dark: gradient
            ? 'linear-gradient(180deg, #14171c, #1c222b)'
            : '#14171c',
        };
        /** @type {('light' | 'dark')[]} */
        const shown =
          env.data.mode === 'dark-only'
            ? ['dark']
            : env.data.mode === 'light-only'
              ? ['light']
              : c.mode === 'light' || c.mode === 'dark'
                ? [c.mode]
                : ['light', 'dark'];
        const perMode = modal;
        /** @param {'light' | 'dark'} m */
        const flagsFor = m => (perMode ? {mode: m} : {});
        return {
          text: `the page background: background on app-shell (the page behind your parts, in every AppShell variant) for a color or a gradient; --color-background-body for the body color${perMode && shown.length > 1 ? ' (one value for each mode, so text stays readable in both)' : ''}`,
          options: [
            ...(gradient
              ? []
              : [
                  shown.map(m =>
                    set('--color-background-body', PAGE[m], flagsFor(m)),
                  ),
                ]),
            shown.map(m =>
              set(
                perMode
                  ? gradient
                    ? 'background-image'
                    : 'background-color'
                  : 'background',
                PAGE[m],
                {on: 'app-shell', ...flagsFor(m)},
              ),
            ),
          ],
        };
      }
      // "a blue gradient", "gradient from #fff to #eef": a gradient of the
      // colors named (one color runs to a lighter shade of it).
      if (/\bgradients?\b/.test(c.text)) {
        const stops = gradientStops(c) ?? [color, shift(color, 0.35) ?? color];
        return {
          text: `the page background: a gradient of ${stops.join(' to ')} on app-shell (the page behind your parts)`,
          options: [
            [
              set('background', `linear-gradient(${stops.join(', ')})`, {
                on: 'app-shell',
                ...modeOf(c),
              }),
            ],
          ],
        };
      }
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
      // "the divider lighter / darker": its color, never its thickness.
      if (
        !c.lengths[0] &&
        /\b(darker|lighter|darken|lighten)\b/.test(c.text) &&
        !/\b(thick|thin|width)/.test(c.text)
      ) {
        const lighter = /\blight(er|en)?\b/.test(noMode(c.text));
        const amount = colorAmount(c.text, 0.2);
        const steps = perMode(
          '--color-border',
          '--color-border',
          {on},
          (now, m) =>
            shiftKeepAlpha(
              now,
              lighter ? amount : -amount,
              current('--color-background-body', m),
            ),
          c,
        );
        if (steps.length)
          return {
            text: `a ${lighter ? 'lighter' : 'darker'} divider: --color-border, on the divider only${modesSaid(steps)}`,
            options: [steps],
            sequence: steps.length > 1,
          };
      }
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
              now => overlayAlpha(now, c),
              c,
            )
          : [];
      if (!steps.length) return null;
      return {
        text: `the dimmed layer behind dialogs and drawers: --color-overlay${typed ? '' : `, its alpha only${modesSaid(steps)}`}`,
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
      // A region of a part (a dialog's header) takes a fill of its own.
      !/-(header|footer|title-block)$/.test(on) &&
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
          : /\b(light(er)?|thin(ner)?)\b/.test(noMode(c.text))
            ? '300'
            : c.dir === 'less'
              ? '400'
              : '700');
      return {
        text: `body text weight: --text-body-weight (now ${current('--text-body-weight')})`,
        options: [[set('--text-body-weight', v)]],
      };
    }
    // Supporting text (small, secondary, captions, fine print): its own
    // size, weight and color tokens.
    if (p?.role === 'supporting') {
      // "the fine print smaller": a size of text is its text size.
      if (a === 'fontsize' || a === 'size') {
        const tok = '--text-supporting-size';
        const now = current(tok);
        const px = /\b(\d+(?:\.\d+)?)\s?px\b/.exec(c.text)?.[1];
        const factor =
          exactFactor(c.text) ??
          (c.dir === 'less' ? 1 / 1.125 : c.dir ? 1.125 : null);
        const v = px ? `${px}px` : factor != null ? scaled(now, factor) : null;
        return v
          ? {
              text: `the supporting text size (small and secondary text, captions): ${tok} ${v} (now ${now})`,
              options: [[set(tok, v)]],
            }
          : null;
      }
      if (a === 'weight') {
        const v =
          weightIn(c) ??
          (/\b(light(er)?|thin(ner)?)\b/.test(noMode(c.text)) ||
          c.dir === 'less'
            ? '300'
            : '600');
        return {
          text: `the supporting text weight: --text-supporting-weight (now ${current('--text-supporting-weight')})`,
          options: [[set('--text-supporting-weight', v)]],
        };
      }
      if (a === 'text') {
        const color = colorFor(c, 'text');
        if (color)
          return {
            text: 'the secondary text color: --color-text-secondary',
            options: [[set('--color-text-secondary', color, modeOf(c))]],
          };
      }
      // Anything else ("secondary text is too low contrast"): as asked of
      // the whole theme, which reads the secondary text words itself.
      return wholeTheme({...c, parts: []}, a);
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
    // An exact amount ("half", "double", "a third", "3 times", "25%
    // bigger") of a part's scalar value: that factor of what the part has
    // now (its own setting, else the token it reads), never a step.
    {
      const typed = on && !compared.get(c) ? exactFactor(c.text) : null;
      // "a bit more transparent": a step of the opacity there now.
      const seeStep =
        typed == null && a === 'opacity' && on
          ? /\bmore (transparent|translucent|see-through)\b|\bless opaque\b/.test(
              c.text,
            )
            ? 0.8
            : /\bless (transparent|translucent)\b|\bmore opaque\b/.test(c.text)
              ? 1.25
              : null
          : null;
      const amount = typed ?? seeStep;
      const borderWidth =
        a === 'border' &&
        /\b(border[- ]width|thick(er|ness)?|thin(ner)?)\b/.test(c.text);
      const prop =
        amount == null
          ? null
          : borderWidth
            ? 'border-width'
            : a === 'fontsize'
              ? 'font-size'
              : a === 'leading'
                ? 'line-height'
                : a === 'tracking'
                  ? 'letter-spacing'
                  : a === 'opacity'
                    ? 'opacity'
                    : a === 'size' && /\b(width|wider|narrower)\b/.test(c.text)
                      ? 'max-width'
                      : null;
      // "50% more transparent": the opacity loses that share; "less opaque"
      // already reads as a factor below 1.
      const opacityAmount =
        prop === 'opacity' &&
        typed != null &&
        /\bmore (transparent|translucent|see-through)\b|\bless opaque\b/.test(
          c.text,
        ) &&
        typed > 1
          ? 2 - typed
          : amount;
      // Every heading level scales from its own size (the font-size case).
      if (
        prop &&
        on &&
        opacityAmount != null &&
        !(prop === 'font-size' && on === 'heading' && !p?.level)
      ) {
        const amount = opacityAmount;
        const part = /** @type {string} */ (on);
        const group = C.groupOfProp(prop);
        const read = group
          ? C.partReads(one(part), group).find(r =>
              r.props.some(x => x === prop || x.startsWith(`${prop}-`)),
            )
          : null;
        const now =
          nowIn(part, prop) ??
          (prop === 'max-width' ? nowIn(part, 'width') : null) ??
          (read?.token ? current(read.token) : null);
        const n = Number(now);
        const value =
          now == null
            ? null
            : /^\d*\.?\d+$/.test(String(now).trim())
              ? String(
                  Number(
                    (prop === 'opacity'
                      ? Math.min(1, n * amount)
                      : n * amount
                    ).toFixed(3),
                  ),
                )
              : scaled(String(now), amount);
        if (value)
          return {
            text: `${prop}${where}: ${value} (now ${now})`,
            options: [[set(prop, value, f)]],
          };
      }
    }
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
        // An amount ("1.5x", "half") or a percent ("150%": of the line
        // height there now) is a factor, never a typed number.
        const pctLeading = /\b(\d{1,3}(?:\.\d+)?)(?:px)?\s?%/.exec(c.text);
        const leadFactor =
          exactFactor(c.text) ??
          (pctLeading ? Number(pctLeading[1]) / 100 : null);
        const n =
          leadFactor != null
            ? null
            : (/\b(normal)\b/.exec(c.text)?.[1] ??
              /(?:^|\s)(\d(?:\.\d+)?)(?![\d.]|\s*(px|rem|em|%|x\b|times\b))/.exec(
                c.text,
              )?.[1]);
        const tok =
          !on || on === 'body' || p?.role === 'body'
            ? '--text-body-leading'
            : null;
        // What it is now: the token, else the part's own line height.
        // A part with no line height of its own reads the body's.
        const now = tok
          ? current(tok)
          : on
            ? (nowIn(on, 'line-height') ??
              ('--text-body-leading' in TOKENS
                ? current('--text-body-leading')
                : null))
            : null;
        const numeric = now != null && /^\d*\.?\d+$/.test(String(now).trim());
        const value =
          n ??
          (numeric
            ? String(
                Number(
                  (
                    Number(now) * (leadFactor ?? (c.dir === 'less' ? 0.9 : 1.1))
                  ).toFixed(2),
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
          text: `line height${where}${numeric && !n ? ` (now ${now})` : ''}`,
          options: [[set('line-height', value, f)]],
        };
      }
      case 'corners': {
        const tall = tallIn(c.text);
        const tied = radiusIn(c.text);
        // "1.5 times bigger": an amount, never a radius.
        // A percent with an amount ("50% of now", "20% bigger") is an
        // amount too: a CSS percent radius is an ellipse.
        const typedPx =
          /\b\d*\.?\d+(px)?\s*(times|x)\s/.test(c.text) ||
          (exactFactor(c.text) != null &&
            !c.lengths.some(l => l !== tall && !/%$/.test(l)))
            ? null
            : ((tied && /^-?\d*\.?\d+$/.test(tied) ? `${tied}px` : tied) ??
              c.lengths.find(l => l !== tall) ??
              null);
        // A radius of 0 is square.
        const px = typedPx && parseFloat(typedPx) === 0 ? null : typedPx;
        const zero = Boolean(typedPx) && !px;
        // "half the corner radius on buttons": an exact amount of the
        // radius the part has now (its own setting, else the token it reads).
        // Not a comparison with another part ("twice as round as inputs"):
        // that amount is of the other part's radius.
        const cornerFactor =
          !typedPx &&
          on &&
          // "half as round" is an amount; "as round as buttons" compares.
          !compared.get(c) &&
          !/\b(as|than)\s+(the\s+)?\w+\s*$|\bas \w+ as\b/.test(
            c.text.replace(/\bas (round|rounded|sharp|curved)\s*$/, ''),
          )
            ? exactFactor(c.text)
            : null;
        // A part with a radius of its own: the dial does not move it (the
        // exact setting wins), so a step of that radius, said to be one.
        const ownRadius =
          on &&
          !typedPx &&
          cornerFactor == null &&
          c.dir &&
          !c.neg &&
          // (A state rule of the dial still applies over a plain radius.)
          !f.state
            ? partValue(on, 'border-radius')
            : null;
        const ownStep = ownRadius
          ? scaledBox(ownRadius, c.dir === 'less' ? 0.8 : 1.25)
          : null;
        if (ownStep)
          return {
            text: `corners${where}: border-radius ${ownStep} (now ${ownRadius}; a step, since your exact radius there wins over the corners dial)`,
            options: [[set('border-radius', ownStep, f)]],
          };
        if (cornerFactor != null) {
          const part = /** @type {string} */ (on);
          const read = C.partReads(one(part), 'corners')[0];
          // Else the part's plain rule as built (the base theme's radius
          // for it), its tokens read in this theme.
          const rule = partRuleTokens(
            ctx.project.cwd,
            env.slug,
            env.data.like,
            one(part),
          ).get('border-radius');
          const ruleNow = rule
            ? String(rule).replace(
                /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
                (_, t) => current(t) || _,
              )
            : null;
          const now =
            nowIn(part, 'border-radius') ??
            (read?.token ? current(read.token) : null) ??
            (ruleNow && scaled(ruleNow, 1) ? ruleNow : null);
          const value = now ? scaled(now, cornerFactor) : null;
          if (value)
            return {
              text: `corners${where}: border-radius ${value} (now ${now})`,
              options: [[set('border-radius', value, f)]],
            };
          // Nothing this can read: a step its way, said to be a step.
          if (cornerFactor !== 1)
            return {
              text: `corners${where}: corners ${cornerFactor < 1 ? 'less' : 'more'} (one step, not an exact amount: ${part} has no radius this can read; give one, such as border-radius 6px)`,
              options: [
                [set('corners', cornerFactor < 1 ? 'less' : 'more', f)],
              ],
            };
        }
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
        // "double the corner radius everywhere", "double --radius-element":
        // each radius token (or the one named) from its value now, exactly.
        const wholeFactor = !on && !px ? exactFactor(c.text) : null;
        if (wholeFactor != null) {
          const named = /--radius-[a-z]+/.exec(c.text)?.[0];
          const toks = named
            ? [named]
            : [
                '--radius-inner',
                '--radius-element',
                '--radius-container',
                '--radius-page',
              ];
          const steps = toks.flatMap(tk => {
            const nowTk = current(tk);
            const next = nowTk ? scaled(nowTk, wholeFactor) : null;
            return next ? [set(tk, next)] : [];
          });
          if (steps.length)
            return {
              text: `corners for the whole theme: ${toks.map(tk => `${tk} ${current(tk)}`).join(', ')}, each ×${Number(wholeFactor.toFixed(3))}`,
              options: [steps],
              sequence: steps.length > 1,
            };
        }
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
        const way = shadowWay(c.text);
        // "a soft shadow": no way, but a light shadow to give.
        const soft =
          way === 'less' ||
          (!way &&
            (c.dir === 'less' ||
              /\b(soft|subtle|light|gentle)\b/.test(noMode(c.text))));
        const strong = !soft && way === 'more';
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
          // Each shared shadow from its own layers: the alpha of its colors
          // scaled (bigger: its blur), in both modes or only the one named
          // (only that half of each light-dark() color), the rest kept.
          const bigger = /\b(bigger|larger|deeper|longer)\b/.test(c.text);
          const k = exactFactor(c.text) ?? (soft ? 0.6 : 1.5);
          const steps = ['--shadow-low', '--shadow-med', '--shadow-high']
            .filter(t => t in TOKENS)
            .map(t => {
              const now = current(t);
              if (!now || now === 'none') return null;
              const v =
                bigger && !c.mode
                  ? blurScaled(now, soft ? 0.67 : 1.5)
                  : shadowAlphaScaled(now, k, c.mode ?? null);
              return v && v !== now ? set(t, v) : null;
            })
            .filter(st => st != null);
          return {
            text: `${soft ? 'softer' : 'stronger'} shadows everywhere: each shared shadow from its own layers, ${bigger && !c.mode ? 'its blur scaled' : `its colors' alpha ×${k}`}${c.mode ? ` in ${c.mode} mode only` : ' in both modes'}`,
            options: steps.length ? [/** @type {Step[]} */ (steps)] : [],
            sequence: true,
            ...(c.mode ? {modeInValue: true} : {}),
          };
        }
        // The shadow the part shows now: its own, else the token it reads.
        const shadowTok = on
          ? (C.partReads(one(on), 'shadow').find(r =>
              /^--shadow-/.test(r.token),
            )?.token ??
            C.partReads(one(on), 'elevation').find(r =>
              /^--shadow-/.test(r.token),
            )?.token ??
            null)
          : null;
        const shadowOwn = on ? partValue(on, 'box-shadow') : null;
        const shadowNow = shadowOwn ?? (shadowTok ? current(shadowTok) : null);
        // "no blur on the dialog shadow", "zero blur": the same shadow with
        // its blur at 0 (offsets, spread and color kept), never no shadow.
        if (
          on &&
          /\b(?:no|zero|without|remove(?: the)?|0)\s+blur\b|\bblur\s+(?:to\s+)?0\b|\bzero[- ]blur\b/.test(
            c.text,
          )
        ) {
          const sharp =
            shadowNow && shadowNow !== 'none' ? blurScaled(shadowNow, 0) : null;
          return sharp
            ? {
                text: `the shadow${where} with no blur: offsets, spread and color kept (now ${shadowNow})`,
                options: [[set('box-shadow', sharp, f)]],
              }
            : {
                text: `${on} has no shadow now, so there is no blur to remove`,
                options: [],
              };
        }
        // "the dialog shadow darker / stronger / lighter": from the shadow
        // it shows now, the next shared shadow that way, else that shadow
        // with its colors' alpha moved (bigger: its blur).
        if (
          on &&
          !c.neg &&
          !/\b(blur|blurry|sharper|softer|heavy)\b/.test(c.text) &&
          (c.dir ||
            /\b(darker|lighter|stronger|subtler|weaker|bigger|larger|deeper|heavier)\b/.test(
              c.text,
            )) &&
          !typedShadow &&
          shadowNow &&
          shadowNow !== 'none'
        ) {
          const LADDER = ['--shadow-low', '--shadow-med', '--shadow-high'];
          const up =
            /\b(darker|stronger|bigger|larger|deeper|heavier|more)\b/.test(
              c.text,
            ) &&
            !/\b(lighter|softer|subtler|weaker|smaller|less)\b/.test(c.text);
          const i = shadowOwn ? -1 : LADDER.indexOf(String(shadowTok));
          const next = i >= 0 ? LADDER[i + (up ? 1 : -1)] : undefined;
          const bigger = /\b(bigger|larger)\b/.test(c.text);
          // "50% lighter / darker": its colors' alpha by that much.
          const pctS = /(\d{1,3})\s?%/.exec(c.text);
          const value = pctS
            ? shadowAlphaScaled(
                shadowNow,
                up ? 1 + Number(pctS[1]) / 100 : 1 - Number(pctS[1]) / 100,
              )
            : next
              ? `var(${next})`
              : bigger
                ? blurScaled(shadowNow, up ? 1.5 : 0.67)
                : shadowAlphaScaled(shadowNow, up ? 1.5 : 0.6);
          const moved =
            value && value !== shadowNow
              ? value
              : blurScaled(shadowNow, up ? 1.5 : 0.67);
          if (moved && moved !== shadowNow)
            return {
              text: `a ${up ? 'stronger' : 'softer'} shadow${where}${next ? `: ${next}, the next shared shadow that way` : ''} (now ${shadowOwn ?? `var(${shadowTok})`})`,
              options: [[set('box-shadow', moved, f)]],
            };
        }
        // "flat cards": no shadow on them ("too flat" asks for one).
        if (c.neg || (/\bflat\b/.test(c.text) && !/\btoo flat\b/.test(c.text)))
          return {
            text: `no shadow${where}`,
            options: [...undo(['box-shadow']), [set('box-shadow', 'none', f)]],
          };
        // "a sharper shadow" (read as less blur), "a softer shadow" on a
        // part: the blur of the shadow it has now, scaled; offsets, spread
        // and color stay.
        if (
          on &&
          (/\b(less|more) blur\b/.test(c.text) ||
            /\bsofter\b/.test(noMode(c.text).replace(/\btoo \w+/g, ' ')))
        ) {
          const sharpen = /\bless blur\b/.test(c.text);
          const tok =
            C.partReads(one(on), 'shadow').find(r => /^--shadow-/.test(r.token))
              ?.token ??
            C.partReads(one(on), 'elevation').find(r =>
              /^--shadow-/.test(r.token),
            )?.token ??
            null;
          const own = partValue(on, 'box-shadow');
          const nowShadow = own ?? (tok ? current(tok) : null);
          const factor = exactFactor(c.text) ?? (sharpen ? 0.5 : 2);
          const blurred = nowShadow ? blurScaled(nowShadow, factor) : null;
          if (blurred)
            return {
              text: `a ${sharpen ? 'sharper' : 'softer'} shadow${where}: its blur ×${Number(factor.toFixed(2))}, offsets, spread and color kept (now ${nowShadow})`,
              options: [[set('box-shadow', blurred, f)]],
            };
          if (sharpen)
            return {
              text: `${on} has no shadow now${tok || own ? ' with a blur' : ''} to make sharper`,
              options: [],
            };
        }
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
        // Already at the end of the shadow steps the way asked (a popover
        // at --shadow-high asked for a bigger one): its own blur steps that
        // way instead, so the answer changes what shows.
        const restShadow = C.partReads(one(on ?? ''), 'shadow')?.find(
          r =>
            r.props.includes('box-shadow') &&
            r.when.includes('') &&
            /^--shadow-/.test(r.token),
        )?.token;
        const shows =
          on && !f.state
            ? (partValue(on, 'box-shadow') ??
              (restShadow ? `var(${restShadow})` : null))
            : null;
        if ((soft || strong) && !glow && !design && shows === value) {
          const token = /^var\((--shadow-[a-z]+)\)$/.exec(value)?.[1];
          const stepped = token
            ? blurScaled(current(token), strong ? 1.5 : 1 / 1.5)
            : null;
          if (stepped)
            return {
              text: `a ${strong ? 'bigger' : 'softer'} shadow${where}: it is at ${value} already, so its blur ×${strong ? 1.5 : 0.67} (offsets, spread and color kept)`,
              options: [[set('box-shadow', stepped, f)]],
            };
        }
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
          // "the scrollbar thinner": Core has no scrollbar part; the border
          // width is not it.
          if (/\bscroll ?bars?\b/.test(c.text))
            return {
              text: 'Core has no scrollbar part, so the editor cannot change its width or color; scrollbar-width and scrollbar-color need your own CSS',
              options: [],
            };
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
          // An amount ("double", "half") of the width there now.
          const bwFactor = c.lengths[0] ? null : exactFactor(c.text);
          const bwNow = current('--border-width');
          const bwExact =
            bwFactor != null && bwNow ? scaled(bwNow, bwFactor) : null;
          if (bwExact)
            return {
              text: `the border width of the whole theme: --border-width ${bwExact} (now ${bwNow})`,
              options: [[set('--border-width', bwExact)]],
            };
          if (c.lengths[0] || c.dir)
            return {
              text: 'the border width of the whole theme: --border-width',
              options: [
                [
                  set(
                    '--border-width',
                    c.lengths[0] ??
                      // One pixel past the width there now (never a stock
                      // 1px or 2px that may move the other way).
                      (() => {
                        const m = /^(\d*\.?\d+)(px|rem)$/.exec(String(bwNow));
                        const px = m
                          ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1)
                          : 1;
                        return `${Math.max(c.dir === 'less' ? 0.5 : 1, Math.round((px + (c.dir === 'less' ? -1 : 1)) * 100) / 100)}px`;
                      })(),
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
        // "remove the top border", "no border on the right side": that side.
        const borderSide = /\b(top|bottom|left|right)\b/.exec(c.text)?.[1];
        if (c.neg && borderSide && !outline)
          return {
            text: `no ${borderSide} border${where}: border-${borderSide} none (the other sides keep theirs)`,
            options: [[set(`border-${borderSide}`, 'none', f)]],
          };
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
        // "the card border darker", "input borders a bit lighter": the
        // border's color, from the one the part shows now, never its width.
        if (
          !color &&
          !c.lengths[0] &&
          /\b(darker|lighter|darken|lighten)\b/.test(c.text) &&
          !/\b(thick|thin|width|wider)/.test(c.text)
        ) {
          const lighter = /\blight(er|en)?\b/.test(noMode(c.text));
          const amount = colorAmount(c.text, 0.2);
          const ownBorder = partValue(on, 'border-color');
          if (ownBorder && parseColor(ownBorder)) {
            const v = shiftKeepAlpha(ownBorder, lighter ? amount : -amount);
            if (v)
              return {
                text: `the border color${where}: ${v} (now ${ownBorder})`,
                options: [[set('border-color', v, f)]],
              };
          }
          const read =
            restColorRead(C.partReads(one(on), 'border'), f.when) ??
            '--color-border';
          // The token the border reads, on this part only: one value per
          // mode holds for every variant that reads it.
          const steps = perMode(
            read,
            read,
            {
              on,
              ...(f.state ? {state: f.state} : {}),
              ...(f.when ? {when: f.when} : {}),
            },
            // A border is a line drawn against the page: in dark mode, a
            // darker (stronger) border moves away from the dark page, as the
            // measured check reads it.
            (now, m) =>
              shiftKeepAlpha(
                now,
                (lighter ? amount : -amount) *
                  (m === 'dark' && !c.mode ? -1 : 1),
                current('--color-background-body', m),
              ),
            c,
          );
          if (steps.length)
            return {
              text: `a ${lighter ? 'lighter' : 'darker'} border color${where}: ${read}, on ${on} only${modesSaid(steps)}`,
              options: [steps],
              sequence: steps.length > 1,
            };
        }
        // A thicker or thinner border steps from the width the part shows
        // now (never a stock 2px or 1px that may be the width already), and
        // keeps the border color it reads.
        const bReads = C.partReads(one(on), 'border') ?? [];
        const bwRead = bReads.find(r => r.props.includes('border-width'));
        const bcRead = bReads.find(
          r =>
            r.props.includes('border-color') &&
            r.when.some(w => !w.includes(':')),
        );
        const bwNowRaw =
          partValue(on, 'border-width') ??
          (bwRead
            ? resolvedValue(bwRead.token) || current(bwRead.token)
            : null);
        const bwM = /^(\d*\.?\d+)(px|rem)$/.exec(String(bwNowRaw ?? ''));
        const bwNowPx = bwM
          ? Number(bwM[1]) * (bwM[2] === 'rem' ? 16 : 1)
          : null;
        // "thicker" and "thinner" step from the width now; "a thick
        // border" and "a thin border" name a width: 2px and 1px.
        const thicker = /\bthicker\b/.test(c.text) || c.dir === 'more';
        const thinner = /\bthinner\b/.test(c.text) || c.dir === 'less';
        const width =
          c.lengths[0] ??
          (thicker
            ? bwNowPx != null
              ? `${bwNowPx + 1}px`
              : '2px'
            : thinner
              ? bwNowPx != null
                ? `${Math.max(0.5, bwNowPx <= 1 ? bwNowPx / 2 : bwNowPx - 1)}px`
                : '1px'
              : /\bthick\b/.test(c.text)
                ? '2px'
                : /\bthin\b/.test(c.text)
                  ? '1px'
                  : null);
        const keptColor = bcRead
          ? `var(${bcRead.token})`
          : 'var(--color-border)';
        // "double the border width" is an amount, not the double style.
        const style =
          /\b(dashed|dotted)\b/.exec(c.text)?.[1] ??
          (/\bdouble\b/.test(c.text) &&
          !/\bdouble (the |its |their )?(border|width|thickness)\b/.test(c.text)
            ? 'double'
            : null);
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
              `${width ?? '1px'} ${style ?? 'solid'} ${color ?? keptColor}`,
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
        // A percent is an amount of the padding there now ("50% bigger",
        // "150%"), never a CSS percent padding (half the container's width).
        const pctLength =
          c.lengths.find(l => /%$/.test(l)) ??
          /\b(\d{1,3}(?:\.\d+)?)\s?%/.exec(c.text)?.[0] ??
          null;
        // "3 times bigger": the 3 is an amount, not a length.
        const px = exactFactor(c.text)
          ? null
          : c.lengths.find(l => !/%$/.test(l));
        const gap = /\b(gaps?|between)\b/.test(c.text);
        // The way the words give, if any.
        const way =
          /\b(cramped|crowded|airy|spacious|roomy)\b/.test(c.text) ||
          c.dir === 'more'
            ? 'more'
            : c.dir === 'less' || /\b(dense|compact|tight)\b/.test(c.text)
              ? 'less'
              : null;
        const value =
          /\b(dense|compact)\b/.test(c.text) && !c.dir
            ? 'compact'
            : (c.neg || /\b(zero|no|none|without)\b/.test(c.text)) &&
                /\b(padding|spac(e|es|ing)|gaps?|margins?)\b/.test(c.text) &&
                !/\bno (more|less)\b/.test(c.text)
              ? null
              : (way ?? 'more');
        // A length typed with no way named ("--space-4 to 18px", "spacing
        // 18px") is an exact amount the dial cannot take: never a step in a
        // way the words do not give.
        if (!on && px && !way && value === 'more')
          return {
            text: `the whole theme has no one spacing to set to ${px}: the spacing dial takes steps (more, less, compact); a spacing token takes a value (--spacing-4 ${px})`,
            options: [],
            lookup: `${HOW} spacing`,
          };
        if (!on)
          return value
            ? {
                text: `room in the whole theme: the spacing dial (padding, gaps and control heights together)${exactFactor(c.text) != null ? '; one step, not the exact amount asked: give a value for a token (--spacing-4 24px) for that' : ''}`,
                options: [[set('spacing', value)]],
              }
            : null;
        // "24x24px", "24 x 16px": a size, width by height, is an exact
        // value: padding block (the height) then inline (the width).
        const dims =
          /\b(\d*\.?\d+)(px|rem|em)?\s*[x\u00d7]\s*(\d*\.?\d+)(px|rem|em)\b/.exec(
            c.text,
          );
        if (dims) {
          const unit = dims[4];
          const w = `${Number(dims[1])}${dims[2] ?? unit}`;
          const h = `${Number(dims[3])}${unit}`;
          const box = w === h ? w : `${h} ${w}`;
          return {
            text: `${gap ? 'the gap' : 'padding'}${where}: ${box}${w === h ? '' : ` (${h} top and bottom, ${w} left and right)`}`,
            options: [[set(gap ? 'gap' : 'padding', box, f)]],
          };
        }
        // "double the padding on cards": an exact amount of the padding the
        // part has now, when the theme sets one; else the dial's step, and
        // the answer says the amount is a step.
        const padFactor =
          exactFactor(c.text) ??
          (pctLength && Number.parseFloat(pctLength) > 0
            ? Number.parseFloat(pctLength) / 100
            : null);
        /**
         * The padding (or gap) a part has now: its own setting, else the
         * token it reads, resolved in this theme.
         * @param {string} part
         */
        const padNow = part => {
          const own = nowIn(part, gap ? 'gap' : 'padding');
          if (own) return own;
          // Own side settings (padding-inline 20px) on top of what the part
          // has for the rest: one box, each side as it is now.
          if (!gap) {
            const block = nowIn(part, 'padding-block');
            const inline = nowIn(part, 'padding-inline');
            const sideOf = (/** @type {string} */ k) =>
              nowIn(part, `padding-${k}`);
            const sides = ['top', 'right', 'bottom', 'left'].map(sideOf);
            if (block || inline || sides.some(Boolean)) {
              const rest = padNow0(part);
              const restSides = rest
                ? (() => {
                    const v = String(rest).trim().split(/\s+/);
                    return [
                      v[0],
                      v[1] ?? v[0],
                      v[2] ?? v[0],
                      v[3] ?? v[1] ?? v[0],
                    ];
                  })()
                : null;
              if (restSides) {
                const [bt, bi] = [block, inline].map(x =>
                  x ? String(x).trim().split(/\s+/) : null,
                );
                const box = [
                  sides[0] ?? bt?.[0] ?? restSides[0],
                  sides[1] ?? bi?.[1] ?? bi?.[0] ?? restSides[1],
                  sides[2] ?? bt?.[1] ?? bt?.[0] ?? restSides[2],
                  sides[3] ?? bi?.[0] ?? restSides[3],
                ];
                const out =
                  box[0] === box[2] && box[1] === box[3]
                    ? box[0] === box[1]
                      ? box[0]
                      : `${box[0]} ${box[1]}`
                    : box.join(' ');
                return out;
              }
            }
          }
          return padNow0(part);
        };
        /** padNow without the part's own setting. @param {string} part */
        const padNow0 = part => {
          // The part's plain rule in the theme as built (the base theme's
          // card padding), its tokens read in this theme.
          const ruleMap = partRuleTokens(
            ctx.project.cwd,
            env.slug,
            env.data.like,
            one(part),
          );
          const rule = ruleMap.get(gap ? 'gap' : 'padding');
          /** A rule value with its tokens read in this theme. @param {unknown} x */
          const inTheme = x =>
            String(x).replace(
              /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
              (m, t) => current(t) || m,
            );
          // The base theme's own block and inline padding on the part (butter
          // writes those, not the shorthand), each side as built.
          const ruleBlock = gap ? null : ruleMap.get('padding-block');
          const ruleInline = gap ? null : ruleMap.get('padding-inline');
          if (rule) {
            const resolved = String(rule).replace(
              /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
              (_, t) => current(t) || _,
            );
            if (scaledBox(resolved, 1)) return resolved;
          }
          const reads = C.partReads(one(part), 'spacing').filter(r =>
            r.props.some(p => (gap ? /gap/ : /^padding/).test(p)),
          );
          // Each side from the token Core reads for it (a button's block and
          // inline padding differ; a badge has no block padding): one box.
          if (!gap) {
            /** @param {RegExp} re */
            const sideTok = re =>
              reads.find(r => r.props.some(x => re.test(x)))?.token ?? null;
            const toks = [
              sideTok(/^padding-(block(-start)?|top)$/),
              sideTok(/^padding-(inline(-end)?|right)$/),
              sideTok(/^padding-(block(-end)?|bottom)$/),
              sideTok(/^padding-(inline(-start)?|left)$/),
            ];
            if (toks.some(Boolean) || ruleBlock || ruleInline) {
              const [bw, iw] = [ruleBlock, ruleInline].map(x =>
                x ? splitTop(inTheme(x).trim(), ' ') : null,
              );
              const box = toks.map(tk => (tk ? current(tk) || '0px' : '0px'));
              if (bw) [box[0], box[2]] = [bw[0], bw[1] ?? bw[0]];
              if (iw) [box[3], box[1]] = [iw[0], iw[1] ?? iw[0]];
              return box[0] === box[2] && box[1] === box[3]
                ? box[0] === box[1]
                  ? box[0]
                  : `${box[0]} ${box[1]}`
                : box.join(' ');
            }
          }
          const read =
            reads.find(r => /^--spacing-/.test(r.token)) ?? reads[0] ?? null;
          return read?.token ? current(read.token) : null;
        };
        // "padding top 12px", "more padding on the left", "horizontal
        // padding 20px": only those sides.
        const sideWord = gap ? null : sideIn(c);
        if (sideWord) {
          const sideProp = /^(left|right|top|bottom)$/.test(sideWord)
            ? `padding-${sideWord}`
            : /^(vertical|block)/.test(sideWord)
              ? 'padding-block'
              : 'padding-inline';
          // Each side's own value now: the side setting, else that side of
          // the box the part has now (a button is 8px 16px: its left is 16px).
          const box = String(padNow(on) ?? '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          const sides4 = box.length
            ? [
                box[0],
                box[1] ?? box[0],
                box[2] ?? box[0],
                box[3] ?? box[1] ?? box[0],
              ]
            : null;
          const boxSide = sides4
            ? sideProp === 'padding-top'
              ? sides4[0]
              : sideProp === 'padding-right'
                ? sides4[1]
                : sideProp === 'padding-bottom'
                  ? sides4[2]
                  : sideProp === 'padding-left'
                    ? sides4[3]
                    : sideProp === 'padding-block'
                      ? sides4[0] === sides4[2]
                        ? sides4[0]
                        : `${sides4[0]} ${sides4[2]}`
                      : sides4[3] === sides4[1]
                        ? sides4[1]
                        : `${sides4[3]} ${sides4[1]}`
            : null;
          const nowSide = partValue(on, sideProp) ?? boxSide ?? null;
          // No, zero or none on a side: that side 0.
          if (!value && !px && !exactFactor(c.text))
            return {
              text: `no padding on ${sideWord === 'sides' ? 'the sides' : `the ${sideWord}`}${where}`,
              options: [[set(sideProp, '0px', f)]],
            };
          const factor = exactFactor(c.text) ?? (value === 'less' ? 0.8 : 1.25);
          const sideValue = px ?? (nowSide ? scaledBox(nowSide, factor) : null);
          if (sideValue)
            return {
              text: `padding on ${sideWord === 'sides' ? 'the sides' : `the ${sideWord}`}${where}: ${sideProp} ${sideValue}${!px && nowSide ? ` (now ${nowSide})` : ''}`,
              options: [[set(sideProp, sideValue, f)]],
            };
        }
        if (px) {
          const box = boxIn(c.text) ?? px;
          return {
            text: `${gap ? 'the gap' : 'padding'}${where}: ${box}`,
            options: [[set(gap ? 'gap' : 'padding', box, f)]],
          };
        }
        // A comparison ("twice the padding of buttons"): the amount is of
        // the other part's padding, when the theme sets one; else a step,
        // and the answer says so.
        const versus = compared.get(c) ?? null;
        if (padFactor != null && versus) {
          const now = padNow(versus);
          const exact = now ? scaledBox(now, padFactor) : null;
          return exact
            ? {
                text: `${gap ? 'the gap' : 'padding'}${where}: ${exact} (${versus} has ${now})`,
                options: [[set(gap ? 'gap' : 'padding', exact, f)]],
              }
            : {
                text: `room inside ${on}: spacing ${value ?? 'more'}; this theme sets no ${gap ? 'gap' : 'padding'} of its own on ${versus}, so this is a step, not an exact amount of ${versus}'s: give a value (24px) for one`,
                options: [[set('spacing', value ?? 'more', f)]],
              };
        }
        if (padFactor != null) {
          const now = padNow(on);
          const value = now ? scaledBox(now, padFactor) : null;
          if (value)
            return {
              text: `${gap ? 'the gap' : 'padding'}${where}: ${value} (now ${now})`,
              options: [[set(gap ? 'gap' : 'padding', value, f)]],
            };
        }
        // No amount, and the part has an exact padding of its own: the dial
        // does not move it (an exact setting wins), so a step of that
        // padding, said to be a step.
        const exactPad = !gap && value ? partValue(on, 'padding') : null;
        const stepped = exactPad
          ? scaledBox(exactPad, value === 'less' ? 0.8 : 1.25)
          : null;
        if (stepped)
          return {
            text: `padding${where}: ${stepped} (now ${exactPad}; a step, since your exact padding there wins over the spacing dial: give an amount, such as double or 24px, for an exact one)`,
            options: [[set('padding', stepped, f)]],
          };
        // An amount with nothing there now to take it of: a step its way,
        // said to be a step.
        if (padFactor && padFactor !== 1)
          return {
            text: `room inside ${on}: spacing ${padFactor < 1 ? 'less' : 'more'} (one step, not an exact amount: ${on} has no ${gap ? 'gap' : 'padding'} this can read; give a value, such as 8px, for one)`,
            options: [[set('spacing', padFactor < 1 ? 'less' : 'more', {on})]],
          };
        if (!value)
          return {
            text: `no ${gap ? 'gap' : 'padding'}${where}`,
            options: [[set(gap ? 'gap' : 'padding', '0px', f)]],
          };
        // A step in one state or variant ("on hover") stays there.
        const stepFlags = {
          on,
          ...(f.state ? {state: f.state} : {}),
          ...(f.when ? {when: f.when} : {}),
        };
        const stepOk = env.check([set('spacing', value, stepFlags)]).ok;
        // The dial takes no state: a step of the padding there now, in that
        // state, said to be a step.
        if (!stepOk && (f.state || f.when)) {
          const nowPad = padNow(on);
          const stepped = nowPad
            ? scaledBox(nowPad, value === 'less' ? 0.8 : 1.25)
            : null;
          if (stepped)
            return {
              text: `${gap ? 'the gap' : 'padding'}${where}: ${stepped} (now ${nowPad}; a step: give an amount, such as double or 24px, for an exact one)`,
              options: [[set(gap ? 'gap' : 'padding', stepped, f)]],
            };
        }
        return {
          text: `room inside ${on}: spacing ${value} (padding, gaps and heights inside it; one step${padFactor ? ', not an exact amount: give a value, such as 24px, for one' : ''})`,
          options: [[set('spacing', value, stepOk ? stepFlags : {on})]],
        };
      }
      case 'tracking': {
        const tight =
          c.dir === 'less' ||
          /\b(tight(en|er)?|narrow(er)?|less|condensed)\b/.test(c.text);
        const typedTrack =
          c.lengths.find(l => /em$/.test(l)) ??
          c.lengths[0] ??
          (/(?:^|\s)0(?![.\d%])/.test(c.text) ? '0' : undefined);
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
          /\b(light(er)?|thin(ner)?)\b/.test(noMode(c.text)) ||
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
          options: [
            [
              set(
                'font-family',
                // A stack given with the family ("Inter, sans-serif") whole.
                (g => (g ? `${family}, ${g[1]}` : family))(
                  /,\s*(serif|sans-serif|monospace|system-ui|cursive)\b/.exec(
                    c.text,
                  ),
                ),
                f,
              ),
            ],
          ],
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
        // An exact amount ("double", "half") of the size there now.
        const factor = exactFactor(c.text) ?? (c.dir === 'less' ? 1 / f2 : f2);
        // "headings 20% bigger", "headings twice as big": every heading
        // level from its own size, so the steps between them stay.
        // "headings 2-4 bigger", "h2 to h4": those levels only.
        const range =
          /\b(?:h|headings?\s*(?:levels?\s*)?)?([1-6])\s*(?:-|–|to|through)\s*h?([1-6])\b/.exec(
            c.text,
          );
        if (on === 'heading' && (!p?.level || range) && !f.state && !f.when) {
          const pct = /(\d{1,3}(?:\.\d+)?)\s?%/.exec(c.text);
          const amount =
            exactFactor(c.text) ??
            (pct
              ? c.dir === 'less'
                ? 1 - Number(pct[1]) / 100
                : 1 + Number(pct[1]) / 100
              : range && c.dir
                ? c.dir === 'less'
                  ? 1 / f2
                  : f2
                : null);
          if (amount && !(px && !pct && !exactFactor(c.text))) {
            const levels = Object.keys(TOKENS)
              .filter(t => /^--text-heading-\d-size$/.test(t))
              .filter(t => {
                if (!range) return true;
                const n = Number(/(\d)/.exec(t)?.[1]);
                const [lo, hi] = [Number(range[1]), Number(range[2])].sort();
                return n >= lo && n <= hi;
              })
              .sort();
            const steps = levels
              .map(t => {
                const now = resolvedValue(t);
                const v = now ? scaledBox(now, amount) : null;
                return v ? set(t, v) : null;
              })
              .filter(st => st != null);
            if (steps.length)
              return {
                text: `every heading level ${amount > 1 ? 'bigger' : 'smaller'} from its own size (x${Number(amount.toFixed(3))}): ${levels.join(', ')}`,
                options: [/** @type {Step[]} */ (steps)],
                sequence: true,
              };
          }
        }
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
            text: `the base text size: text-size (every heading scales from it)${!px && exactFactor(c.text) != null ? '; one step, not the exact amount asked: give a size (text-size 18) for that' : ''}`,
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
        // The next answer when the type dial also changes what was not
        // asked (its weights): each heading level's own size, scaled.
        const levelSizes = (/** @type {number} */ k) =>
          /** @type {Step[]} */ (
            Object.keys(TOKENS)
              .filter(t => /^--text-heading-\d-size$/.test(t))
              .sort()
              .map(t => {
                const now = resolvedValue(t);
                const v = now ? scaledBox(now, k) : null;
                return v ? set(t, v) : null;
              })
              .filter(st => st != null)
          );
        if (on === 'heading' && !f.when && !px)
          return c.dir === 'less'
            ? {
                text: 'smaller steps between heading sizes: type compact (x1.15), or each heading level smaller from its own size',
                options: [[set('type', 'compact')], levelSizes(0.85)].filter(
                  o => o.length,
                ),
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
                  levelSizes(1.15),
                ].filter(o => o.length),
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
              C.partReads(one(on), 'background')[0]?.token ??
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
        // "more opaque", "less see-through": opacity up from what the part
        // has now, never down.
        if (
          on &&
          /\b(more opaque|less (?:transparent|see[- ]?through|translucent)|opaquer)\b/.test(
            c.text,
          )
        ) {
          const nowOp = Number(partValue(on, 'opacity') ?? 1);
          return nowOp >= 1 || Number.isNaN(nowOp)
            ? {
                text: `${on} is fully opaque now (opacity 1): there is no more opaque to go`,
                options: [],
              }
            : {
                text: `more opaque${where}: opacity ${Number(Math.min(1, nowOp + (1 - nowOp) / 2).toFixed(2))} (now ${nowOp})`,
                options: [
                  [
                    set(
                      'opacity',
                      String(
                        Number(Math.min(1, nowOp + (1 - nowOp) / 2).toFixed(2)),
                      ),
                      f,
                    ),
                  ],
                ],
              };
        }
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
          ) &&
          !(
            /\b(wider|narrower|width)\b/.test(c.text) &&
            !/\bborder[- ]width\b/.test(c.text)
          )
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
        if (
          /\b(wider|narrower|width|wide)\b/.test(c.text) &&
          !/\bborder[- ]width\b/.test(c.text)
        ) {
          // "the sidebar wider", "20% wider": from the width the part has
          // now (its own setting, else its rule in the base theme), never a
          // made-up width.
          if (!c.lengths[0]) {
            const rule = partRuleTokens(
              ctx.project.cwd,
              env.slug,
              env.data.like,
              one(on),
            );
            /** @param {string} k */
            const widthNow = k =>
              partValue(on, k) ??
              rule.get(k) ??
              rule.get(
                k === 'width'
                  ? 'inline-size'
                  : k === 'max-width'
                    ? 'max-inline-size'
                    : 'min-inline-size',
              ) ??
              null;
            const wProp = ['width', 'max-width', 'min-width'].find(
              k =>
                widthNow(k) != null &&
                scaled(
                  String(widthNow(k))
                    .replace(
                      /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
                      (m, t) => current(t) || m,
                    )
                    .trim(),
                  1,
                ),
            );
            const wNow = wProp ? String(widthNow(wProp)) : null;
            const wFactor =
              exactFactor(c.text) ??
              (/\bnarrower\b/.test(c.text) || c.dir === 'less'
                ? /\b(a (bit|little|touch)|slightly)\b/.test(c.text)
                  ? 0.9
                  : 0.8
                : /\b(a (bit|little|touch)|slightly)\b/.test(c.text)
                  ? 1.1
                  : 1.25);
            const resolved = wNow
              ? wNow.replace(
                  /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
                  (m, t) => current(t) || m,
                )
              : null;
            const wNew = resolved ? scaled(resolved.trim(), wFactor) : null;
            if (wProp && wNew)
              return {
                text: `the width${where}: ${wProp} ${wNew} (now ${resolved})`,
                options: [[set(wProp, wNew, f)]],
              };
            if (
              /\b(wider|narrower)\b/.test(c.text) ||
              exactFactor(c.text) != null
            )
              return {
                text: `${on} has no width of its own to scale (it takes the width its content and container give it); give a width, such as max-width 480px`,
                options: [],
              };
          }
          // An amount ("20% wider", "twice as wide") with no width there to
          // take it of: said so, never a made-up cap.
          if (!c.lengths[0] && exactFactor(c.text) != null)
            return {
              text: `${on} has no width of its own to scale (it takes the width its content and container give it); give a width, such as max-width 480px`,
              options: [],
            };
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
        // No direction ("card padding", a bare "16px" after a comma): no
        // dial step, which would pick "bigger" for it.
        if (!c.dir) return null;
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
          const literal =
            Boolean(c.mode) && /\b(darker|lighter)\b/.test(c.text);
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
                text: literal
                  ? `${label}, ${/\bdarker\b/.test(c.text) ? 'darker' : 'lighter'}${modesSaid(steps)}`
                  : `${label}, ${more ? 'more' : 'less'} contrast with the page${modesSaid(steps)}`,
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
        // "card text lighter", "a bit darker": from the text color the part
        // shows now (its own, else the token it reads at rest).
        if (!color && c.dir && /\b(light|dark)(er)?\b/.test(c.text)) {
          const lighter = /\blight(er)?\b/.test(noMode(c.text));
          const amount = colorAmount(c.text, 0.2);
          const own = partValue(on, 'color');
          if (own && parseColor(own)) {
            const v = shiftKeepAlpha(own, lighter ? amount : -amount);
            if (v)
              return {
                text: `text color${where}: ${v} (now ${own})`,
                options: [[set('color', v, f)]],
              };
          }
          // A link's color comes from its color prop: the accent text token
          // it reads, made lighter or darker (it also colors other accent
          // text).
          if (on === 'link') {
            const steps = perMode(
              '--color-text-accent',
              '--color-text-accent',
              f.state ? {on, state: f.state} : {},
              (now, m) =>
                shiftKeepAlpha(
                  now,
                  lighter ? amount : -amount,
                  current('--color-background-body', m),
                ),
              c,
            );
            if (steps.length)
              return {
                text: `${lighter ? 'lighter' : 'darker'} links: --color-text-accent, the token a link reads (it also colors other accent text)${modesSaid(steps)}`,
                options: [steps],
                sequence: steps.length > 1,
              };
          }
          // A part that takes its color from a prop (a heading): the text
          // token on that part, as "red h1" sets it.
          const viaToken = !env.check([set('color', '#808080', f)]).ok;
          // A part with no text color of its own shows the main text color.
          const read =
            restColorRead(C.partReads(one(on), 'text'), f.when) ??
            '--color-text-primary';
          const perVariant = viaToken
            ? null
            : byVariant(
                on,
                'text',
                'color',
                'color',
                f,
                (now, m) =>
                  shiftKeepAlpha(
                    now,
                    lighter ? amount : -amount,
                    current('--color-background-body', m),
                  ),
                c,
              );
          if (perVariant)
            return {
              text: `${lighter ? 'lighter' : 'darker'} text${where}, each variant from its own color${modal ? (c.mode ? `, in ${c.mode} mode only` : ', in each mode') : ''}`,
              options: [perVariant],
              sequence: true,
            };
          if (read) {
            const steps = perMode(
              read,
              viaToken ? '--color-text-primary' : 'color',
              viaToken ? {...f, on} : f,
              (now, m) =>
                shiftKeepAlpha(
                  now,
                  lighter ? amount : -amount,
                  current('--color-background-body', m),
                ),
              c,
            );
            if (steps.length)
              return {
                text: `${lighter ? 'lighter' : 'darker'} text${where}, from ${read}${modesSaid(steps)}`,
                options: [steps],
                sequence: steps.length > 1,
              };
          }
        }
        if (!color) return null;
        // A part that takes its color from a prop (a heading): the text
        // token, on that part only.
        if (!env.check([set('color', color, f)]).ok)
          return {
            text: `the text color${where}: --color-text-primary on ${on} only (${on} takes its color from a prop, so a color property never shows)`,
            options: [
              [
                set('--color-text-primary', color, {
                  on,
                  // "red h1": that level only.
                  ...(f.when ? {when: f.when} : {}),
                  ...modeOf(c),
                }),
              ],
            ],
          };
        // A part holding parts whose text reads the text color tokens
        // itself (a top nav's heading and items), where a color property
        // never reaches that text: those tokens, on the part.
        const inner = innerTextTokens(C, one(on), true);
        if (
          inner.length &&
          !innerTextTokens(C, one(on)).length &&
          !f.state &&
          !f.when
        )
          return {
            text: `text color${where}: ${inner.join(' and ')} on ${on}, the text color tokens the parts inside it read`,
            options: [inner.map(tok => set(tok, color, {on, ...modeOf(c)}))],
            sequence: inner.length > 1,
          };
        return {
          text: `text color${where}: color`,
          options: [[set('color', color, {...f, ...modeOf(c)})]],
        };
      }
      case 'background': {
        // A state Core paints with an inline style from a token (a selected
        // table row's wash): that token, on the part in that state.
        const inlinePart = on ? one(on) : null;
        const inlineToken =
          inlinePart && f.state
            ? C.MAP[inlinePart]?.inline?.[f.state]?.['background-color']
            : null;
        const inlineColor = inlineToken ? colorFor(c, 'fill') : null;
        if (inlinePart && inlineToken && inlineColor)
          return {
            text: `the background${where}: ${inlineToken}, which Core paints ${inlinePart} with when ${f.state}`,
            options: [
              [
                set(inlineToken, inlineColor, {
                  on: inlinePart,
                  state: f.state,
                  ...modeOf(c),
                }),
              ],
            ],
          };
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
            : design
              ? {
                  text: `${on} has no ${design} this theme sets, so there is nothing to remove`,
                  options: [],
                  lookup: `${HOW} ${on}`,
                }
              : // "remove the card background": the fill it shows comes from
                // the base theme; no fill means see-through.
                {
                  text: `no background${where || ` on ${on}`}: transparent, so what is behind it shows`,
                  options: [[set('background-color', 'transparent', f)]],
                };
        }
        // "the button gradient darker": the part's own gradient, each color
        // stop stepped that way (angle, stops and positions kept).
        if (
          on &&
          design === 'gradient' &&
          /\b(darker|darken|lighter|lighten|brighter|deeper)\b/.test(c.text)
        ) {
          const ownGrad = [
            partValue(on, 'background'),
            partValue(on, 'background-image'),
          ].find(v => /gradient\(/.test(String(v ?? '')));
          if (ownGrad) {
            const lighter = /\b(lighter|lighten|brighter)\b/.test(c.text);
            const amount = colorAmount(c.text, 0.15);
            const stepped = String(ownGrad).replace(
              /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\([^)]*\)/gi,
              m => shiftKeepAlpha(m, lighter ? amount : -amount) ?? m,
            );
            if (stepped !== ownGrad)
              return {
                text: `the gradient${where}, each color ${lighter ? 'lighter' : 'darker'} (now ${ownGrad})`,
                options: [[set('background', stepped, f)]],
              };
          }
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
          const temp = /\b(warm(er)?|cool(er)?)\b/.exec(c.text)?.[1];
          if (temp) {
            const way = /^warm/.test(temp) ? 'warm' : 'cool';
            const steps = perMode(
              '--color-background-body',
              '--color-background-body',
              {},
              now => tempShift(now, way, colorAmount(c.text, 0.12)),
              c,
            );
            if (steps.length)
              return {
                text: `a ${way}er page background: --color-background-body, its hue toward ${way === 'warm' ? 'amber' : 'blue'} at the same lightness${modesSaid(steps)}`,
                options: [steps],
                sequence: steps.length > 1,
              };
          }
          if (!c.dir) return null;
          const lighter = /\blight(er)?|brighter\b/.test(noMode(c.text));
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
        // "a blue to purple gradient": the colors named, never a sample.
        const named = design === 'gradient' ? gradientStops(c) : null;
        if (named)
          return {
            text: `a gradient of ${named.join(' to ')}${where}`,
            options: [
              [set('background', `linear-gradient(${named.join(', ')})`, f)],
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
          const lighter = /\blight(er)?\b/.test(noMode(c.text));
          const reads = C.partReads(one(on), 'background');
          // "card background warmer": its hue toward warm or cool, at the
          // same lightness.
          const temp = /\b(warm(er)?|cool(er)?)\b/.exec(c.text)?.[1];
          const tempRead = temp
            ? (restColorRead(reads, f.when) ??
              (FAMILIES.containers.includes(one(on))
                ? '--color-background-card'
                : null))
            : null;
          if (temp && tempRead) {
            const way = /^warm/.test(temp) ? 'warm' : 'cool';
            const steps = perMode(
              tempRead,
              'background',
              f,
              now => tempShift(now, way, colorAmount(c.text, 0.12)),
              c,
            );
            if (steps.length)
              return {
                text: `a ${way}er background${where}, from ${tempRead}: its hue toward ${way === 'warm' ? 'amber' : 'blue'} at the same lightness${modesSaid(steps)}`,
                options: [steps],
                sequence: steps.length > 1,
              };
          }
          // The fill the part shows at rest (its main variant, or the one
          // asked for), never its pressed overlay.
          const read = C.MAP[one(on)]
            ? (restColorRead(reads, f.when) ??
              (FAMILIES.containers.includes(one(on))
                ? '--color-background-card'
                : null))
            : null;
          // The amount asked ("20% darker", "a bit lighter"), else a step.
          const pct = /(\d{1,3})\s?%/.exec(c.text);
          const amount = colorAmount(c.text, 0.12);
          // A fill of the theme's own on the part comes first.
          const ownFill =
            partValue(on, 'background-color') ?? partValue(on, 'background');
          // An own fill in both modes ("light-dark(#fff, #111)"): each half
          // stepped from its own color.
          const pair =
            /^light-dark\(\s*([^,()]+(?:\([^()]*\))?)\s*,\s*([^()]+(?:\([^()]*\))?)\s*\)$/.exec(
              String(ownFill ?? '').trim(),
            );
          const ownShifted = pair
            ? (() => {
                const l = shiftKeepAlpha(
                  pair[1].trim(),
                  lighter ? amount : -amount,
                  current('--color-background-body', 'light'),
                );
                const dk = shiftKeepAlpha(
                  pair[2].trim(),
                  lighter ? amount : -amount,
                  current('--color-background-body', 'dark'),
                );
                return l && dk ? `light-dark(${l}, ${dk})` : null;
              })()
            : ownFill && parseColor(ownFill)
              ? shiftKeepAlpha(ownFill, lighter ? amount : -amount)
              : null;
          if (ownShifted && !f.state)
            return {
              text: `${lighter ? 'a lighter' : 'a darker'} background${where}: ${ownShifted} (now ${ownFill})`,
              options: [[set('background-color', ownShifted, f)]],
            };
          // In a state, the token the part fills with there (a table row's
          // hover overlay), stepped from its value in each mode and set on
          // the part: Core reads it only in that state.
          // A part whose variants each fill differently keeps the per-part
          // step below: one token would not suit every variant.
          const stateRead =
            f.state && !C.variantValues(one(on))?.variant?.length
              ? reads.find(
                  r =>
                    /^--color-/.test(r.token) &&
                    r.when.some(w =>
                      new RegExp(`:${f.state}(?![-\\w])`).test(w),
                    ),
                )?.token
              : null;
          if (stateRead) {
            const steps = perMode(
              stateRead,
              stateRead,
              {...f, state: undefined},
              (now, m) =>
                shiftKeepAlpha(
                  now,
                  lighter ? amount : -amount,
                  current('--color-background-body', m),
                ),
              c,
            );
            if (steps.length)
              return {
                text: `${lighter ? 'a lighter' : 'a darker'} ${on}${where}: ${stateRead}, the fill ${on} shows there, stepped from its value now${modesSaid(steps)}`,
                options: [steps],
                sequence: steps.length > 1,
              };
          }
          // A part with no recorded fill: what its color is now is unknown,
          // so a brightness filter makes it darker or lighter from there.
          // The amount asked holds there too: "20% darker" is brightness 0.8.
          if (!read || f.state)
            return {
              text: `${lighter ? 'a lighter' : 'a darker'} ${on}${where}: a brightness filter, from whatever color it has now${pct ? ` (${lighter ? '+' : '-'}${pct[1]}%)` : ''}`,
              options: [
                [
                  set(
                    'filter',
                    `brightness(${pct ? Number((lighter ? 1 + amount : 1 - amount).toFixed(2)) : lighter ? 1.15 : 0.85})`,
                    f,
                  ),
                ],
              ],
            };
          const perVariant = byVariant(
            on,
            'background',
            'background-color',
            'background',
            f,
            (now, m) =>
              shiftKeepAlpha(
                now,
                lighter ? amount : -amount,
                current('--color-background-body', m),
              ),
            c,
          );
          if (perVariant)
            return {
              text: `${lighter ? 'a lighter' : 'a darker'} background${where}, from ${read} and each variant's own fill${modal ? (c.mode ? `, in ${c.mode} mode only` : ', in each mode') : ''}`,
              options: [perVariant],
              sequence: true,
            };
          const steps = perMode(
            read,
            'background',
            f,
            (now, m) =>
              shiftKeepAlpha(
                now,
                lighter ? amount : -amount,
                current('--color-background-body', m),
              ),
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
      !/\b(accent|text|background|colou?rs?)\b/.test(t) &&
      // An ask about the theme's modes, never "in dark mode" scoping
      // another change.
      (/\b(theme|app)\b/.test(t) ||
        !clauses.some(
          o =>
            o.text !== c.text &&
            (o.parts.length || o.colors.length || o.aspects.length),
        ))
    ) {
      if (env.data.mode === 'both' || env.data.mode === 'dark-only')
        return {
          text:
            env.data.mode === 'both'
              ? `${env.slug} has a dark mode already: every color it sets makes its dark shades too. The in-app preview switches between them.`
              : `${env.slug} is a dark-only theme: dark mode is the theme already`,
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
      // The accent each shown mode has: the editor seeds both modes from one
      // color, so a theme whose modes show accents of different hues has no
      // one color to keep.
      const shownModes = /** @type {Array<'light' | 'dark'>} */ (
        env.data.mode === 'dark-only'
          ? ['dark']
          : env.data.mode === 'light-only'
            ? ['light']
            : ['light', 'dark']
      );
      const accents = shownModes.map(m => current('--color-accent', m));
      const hues = accents.map(hueOf);
      if (
        hues.length > 1 &&
        hues[0] != null &&
        hues[1] != null &&
        Math.abs(((hues[0] - hues[1] + 540) % 360) - 180) > 30
      )
        return {
          text: `${help}. It works once the theme sets a color, but ${env.slug}'s accent is a different color in each mode (${accents.join(' in light, ')} in dark), and one accent color would give both modes the same hue; set the accent you want first`,
          options: [],
          lookup: `${HOW} accent`,
        };
      const now = parseColor(accents[0]);
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
    // "the accent cooler": warm and cool name a direction for the color
    // named, never the neutral besides it.
    if (
      found.length > 1 &&
      found.some(x => x.dial === 'neutral') &&
      !/\b(neutrals?|gr[ae]ys?)\b/.test(t)
    )
      found.splice(
        found.findIndex(x => x.dial === 'neutral'),
        1,
      );
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
    /** @type {Step | null} */
    let darkStep = null;
    let color =
      given &&
      !(
        dial === 'neutral' &&
        ['#9ca3af', '#e5e7eb', '#374151', '#f3f4f6'].includes(given)
      )
        ? given
        : null;
    // "a cooler / warmer accent": its hue moves toward blue or orange; its
    // lightness and strength stay.
    if (
      dial !== 'neutral' &&
      !color &&
      /\b(warm(er)?|cool(er)?)\b/.test(t) &&
      token
    ) {
      const warm =
        /\btoo cool\b|\bwarm(er)?\b/.test(t) && !/\btoo warm\b/.test(t);
      const now = String(current(token, 'light') || '');
      const moved = now ? hueToward(now, warm ? 30 : 220, 25) : null;
      if (!moved && now)
        return {
          text: `${dial} is a gray now (${now}), with no hue to move ${warm ? 'warmer' : 'cooler'}; give a color for it (for example "${dial} ${warm ? '#ea580c' : '#2563eb'}")`,
          options: [],
        };
      if (moved)
        return {
          text: `${dial}, ${warm ? 'warmer' : 'cooler'}: its hue moves toward ${warm ? 'orange' : 'blue'} (now ${now}); its lightness and strength stay, and the neutral grays are not changed`,
          options: [[set(dial, moved)]],
        };
    }
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
      // A dark-only theme shows only its dark value: the change starts there.
      color = shift(
        current(token, env.data.mode === 'dark-only' ? 'dark' : 'light'),
        lighter ? 0.2 : -0.2,
      );
      // The dark half the editor generates from that seed can move the
      // other way; the dark token is stepped the asked way from its own
      // value, in the same answer.
      if (modal && color && dial !== 'neutral' && dial !== 'secondary') {
        const darkNow = String(current(token, 'dark') || '');
        const darkNext = darkNow ? shift(darkNow, lighter ? 0.2 : -0.2) : null;
        if (darkNext && darkNext.toLowerCase() !== darkNow.toLowerCase())
          darkStep = set(token, darkNext, {mode: 'dark'});
      }
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
      text: `${dial}: the editor makes its light and dark shades from ${color}${darkStep ? `, and the dark ${token} steps from its own value the same way` : ''}`,
      options: darkStep
        ? [[set(dial, color), darkStep]]
        : [[set(dial, color)], [set(token, color)]],
      ...(darkStep ? {sequence: true} : {}),
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
    // An amount word is never a part ("more padding everywhere").
    if (
      /^(more|less|bigger|smaller|extra|some|no|much|little|lots|way|even|slightly)$/.test(
        m[1],
      )
    )
      return null;
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
  // The intent check: a part the question only compares against ("than
  // buttons", "as round as inputs", "the same color as the card") is never
  // changed. A command that would change it is dropped, and the answer
  // says so; never a wrong command.
  {
    /** @type {Set<string>} */
    const refs = new Set();
    /** @type {Set<string>} */
    const subjects = new Set();
    for (const c of clauses) {
      // "I would like …" is a wish, never a comparison.
      // Only comparison forms: "than", "as round as", "the same … as",
      // "match", "equal to", "rounded like buttons", "like the buttons
      // are". "Form controls like inputs and checkboxes" names examples of
      // the subject; "use red as the button background" gives a value for
      // that part; "such as" lists examples.
      const cmp =
        /\b(?:than|as \w+ as|match(?:es|ing)?|equal to|(?:the )?same (?:\w+ )?as|(?:(?:\w+(?:er|ed|ish|ly))|round|bold|dark|light|big|small|thick|thin|tall|wide|look|looks|styled|exactly|just) like(?= (?:the |my )?\w+(?: \w+)? (?:are|is|do|does|have|has)\b)?|like (?=(?:the |my )\w+(?: \w+)? (?:are|is|do|does|have|has)\b))\s+(?:the\s+|my\s+)?/.exec(
          lex.parts
            .reduce(
              // A part's name is never a comparative ("the container like
              // dialogs", "a header like cards"): masked, same length.
              (t, [re]) =>
                t.replace(new RegExp(re.source, 'g'), m =>
                  'x'.repeat(m.length),
                ),
              c.text,
            )
            .replace(/\b(?:i|we|you)(?: would|'d)? like(?: to| for)?\b/g, m =>
              ' '.repeat(m.length),
            ),
        );
      if (!cmp) continue;
      const after = (cmp.index ?? 0) + cmp[0].length;
      for (const [re, x] of lex.parts) {
        const m = re.exec(c.text);
        if (!m) continue;
        if (m.index >= after - 1) refs.add(x.on);
        else subjects.add(x.on);
      }
    }
    for (const sub of subjects) refs.delete(sub);
    for (const d of result)
      if (d.intent && refs.size)
        d.intent = {
          ...d.intent,
          keep: [...d.intent.keep, ...refs],
          than: [...refs],
        };
    if (refs.size)
      for (const d of result) {
        const before = d.options.map(o => o.length);
        d.options = d.options
          .map(o =>
            o.filter(
              st =>
                !(st.on && refs.has(st.on)) &&
                // The page is its body background token.
                !(
                  refs.has('page') &&
                  !st.on &&
                  st.thing === '--color-background-body'
                ),
            ),
          )
          .filter(o => o.length);
        if (d.options.map(o => o.length).join() !== before.join())
          d.text = `${d.text} (${[...refs].join(', ')} is only what the ask compares against, so it is not changed)`;
      }
  }
  // A question about what a part has now ("how much padding do buttons
  // have", "how rounded are cards", "what color is the button"): its value
  // now, as show reads it; never a change.
  const asked = valueAsked(question);
  // "how rounded are cards? make them 12px": the value now, then the ask.
  const followAsk = asked
    ? (/\?\s*(\S[\s\S]*)$/.exec(question)?.[1] ?? '')
    : '';
  if (asked && followAsk && isAsk(followAsk)) {
    const named0 = lex.parts
      .map(([re, x]) => ({
        at: re.exec(question.toLowerCase())?.index ?? -1,
        on: x.on,
      }))
      .filter(x => x.at >= 0)
      .sort((x, y) => x.at - y.at)[0]?.on;
    const now0 = named0 ? partPropNow(named0, asked) : null;
    const rest = draftAnswer(
      ctx,
      env,
      named0
        ? followAsk.replace(
            /\b(them|it|those|these)\b/i,
            `${named0} ${asked === 'border-radius' ? 'corners' : asked.replace(/-color$/, '').replace('-', ' ')}`,
          )
        : followAsk,
    );
    return {
      parts: rest.parts,
      aspects: rest.aspects,
      drafts: [
        ...(named0 && now0
          ? [{text: `${named0} has ${asked} ${now0} now`, options: []}]
          : []),
        ...rest.drafts,
      ],
    };
  }
  if (asked) {
    const named = lex.parts
      .map(([re, x]) => ({
        at: re.exec(question.toLowerCase())?.index ?? -1,
        on: x.on,
      }))
      .filter(x => x.at >= 0)
      .sort((x, y) => x.at - y.at)[0]?.on;
    // Else any rule of the part that sets the property (in the state the
    // question names first: "disabled buttons" read their disabled rule),
    // the token it reads written out; a variant or a mode the question
    // names reads that variant's own rule in that mode.
    const qWords = question.toLowerCase();
    const stateWord =
      /\b(disabled|hover(?:ed)?|focus(?:ed)?|pressed|active|selected|checked)\b/.exec(
        qWords,
      )?.[1];
    const anyRead = () => {
      if (!named) return null;
      const all = Object.keys(GROUPS).flatMap(
        g => C.partReads(one(named), g) ?? [],
      );
      const fits = all.filter(r => r.props.includes(asked));
      const pick =
        (stateWord &&
          fits.find(r =>
            r.when.some(w => w.includes(stateWord.replace(/ed$/, ''))),
          )) ||
        fits.find(r => r.when.some(w => !w.includes(':'))) ||
        fits[0];
      const v = pick ? resolvedValue(pick.token) || current(pick.token) : null;
      if (v) return v;
      if (asked === 'font-family') return current('--font-family-body') || null;
      return null;
    };
    const vWord = named
      ? (C.variantValues(one(named)).variant ?? []).find(v =>
          new RegExp(`\\b${v}\\b`).test(qWords),
        )
      : undefined;
    const qMode = /\bdark mode\b|\bin dark\b/.test(qWords)
      ? 'dark'
      : /\blight mode\b|\bin light\b/.test(qWords)
        ? 'light'
        : null;
    const variantNow = () => {
      if (!named || (!vWord && !qMode)) return null;
      const when = vWord ? `variant:${vWord}` : 'base';
      const camel = asked.replace(/-([a-z])/g, (_m, x) => x.toUpperCase());
      const own = /** @type {any} */ (env.base).components?.[one(named)]?.[
        when
      ]?.[camel];
      const tok =
        /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(String(own ?? ''))?.[1] ??
        Object.keys(GROUPS)
          .flatMap(g => C.partReads(one(named), g) ?? [])
          .find(
            r =>
              r.props.includes(asked) &&
              r.when.some(w =>
                vWord
                  ? w === `variant=${vWord}`
                  : w === '' || /^variant=(default|primary)$/.test(w),
              ),
          )?.token;
      // (Else any rule's token for the property: a heading reads its color
      // through its color prop.)
      const anyTok =
        tok ??
        Object.keys(GROUPS)
          .flatMap(g => C.partReads(one(named), g) ?? [])
          .find(r => r.props.includes(asked))?.token ??
        (asked === 'color' ? '--color-text-primary' : null);
      if (!anyTok) return null;
      const v = current(anyTok, qMode ?? 'light');
      return v
        ? `${v}${qMode ? ` in ${qMode} mode` : ''}${vWord ? ` (${vWord})` : ''}`
        : null;
    };
    const now = named
      ? (variantNow() ?? partPropNow(named, asked) ?? anyRead())
      : null;
    result.splice(0, result.length, {
      text: named
        ? now
          ? `${named} has ${asked} ${now} now (nothing is changed); to change it, ask for the change ("${asked === 'color' ? `${named} text red` : asked === 'border-color' ? `${named} border red` : /color|background/.test(asked) ? `${named} background red` : asked === 'font-weight' ? `${named} font-weight 700` : asked === 'opacity' ? `${named} opacity 0.8` : asked === 'font-family' ? `${named} font Georgia` : asked === 'box-shadow' ? `${named} shadow stronger` : `${named} ${asked} 12px`}")`
          : `${named} has no ${asked} of its own that how can read; ${HOW} ${named} lists what it reads`
        : `how changes a theme; ${P} show ${env.slug} lists what it has now`,
      options: [],
      lookup: named ? `${HOW} ${named}` : `${P} show ${env.slug}`,
    });
    return {parts: partsSeen, aspects: aspectsSeen, drafts: result};
  }
  // "don't make the cards bigger", "buttons should not be rounder": a
  // prohibition changes nothing; it says what stays.
  if (segments.length && segments.every(x => EXCLUDE.test(x))) {
    result.splice(0, result.length, {
      text: 'nothing to change: you asked for it not to change, so it stays as it is; ask for the change you want instead',
      options: [],
      lookup: partsSeen[0] ? `${HOW} ${partsSeen[0]}` : `${P} show ${env.slug}`,
    });
    return {parts: partsSeen, aspects: aspectsSeen, drafts: result};
  }
  for (const n of placeNotes) result.push({text: n, options: []});
  // A lookup for a part a "match" ask already answered for adds nothing.
  for (let i = result.length - 1; i >= 0; i--) {
    const d = result[i];
    if (
      !d.options.length &&
      d.lookup &&
      [...symDone].some(on => d.lookup === `${HOW} ${on}`)
    )
      result.splice(i, 1);
  }
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

/**
 * The property a question asks the value of ("how much padding …", "how
 * rounded are …", "what color is …"), or null when it is not one.
 * @param {string} q
 * @returns {string | null}
 */
export function valueAsked(q) {
  // Only the question part ("how rounded are cards? make them 12px").
  const t = q.toLowerCase().trim().split('?')[0];
  if (
    !/^(?:how (?:much|many|big|round(?:ed)?|thick|wide|tall|bold|dark|light|transparent|opaque)|what(?:(?:'s| is| are)(?: the| my)?(?: [a-z-]+){0,2}?|(?: the)?) (?:colou?r|size|padding|gap|spacing|radius|corner radius|font|weight|font size|shadow|border|opacity|font family|typeface|background|fill)|which (?:colou?r|font))\b/.test(
      t,
    )
  )
    return null;
  if (/\b(round|rounded|radius|corners?)\b/.test(t)) return 'border-radius';
  if (/\b(opacity|transparent|opaque)\b/.test(t)) return 'opacity';
  if (
    /\b(font family|typeface)\b|\bwhat(?:'s| is)?(?: the)? font\b(?! size| weight)|\bwhich font\b/.test(
      t,
    )
  )
    return 'font-family';
  if (/\bgap\b/.test(t)) return 'gap';
  if (/\b(padding|spacing|space|room)\b/.test(t)) return 'padding';
  if (/\bshadow\b/.test(t)) return 'box-shadow';
  if (/\b(background|fill|bg)\b/.test(t)) return 'background-color';
  if (/\bborder\b/.test(t))
    return /\bcolou?r\b/.test(t) ? 'border-color' : 'border-width';
  if (/\bfont size|text size|how big\b/.test(t)) return 'font-size';
  if (/\b(bold|weight)\b/.test(t)) return 'font-weight';
  // "what color is the primary button": a part with a fill is its fill,
  // unless the words name its text.
  if (
    /\b(colou?r|dark|light)\b/.test(t) &&
    !/\btext\b/.test(t) &&
    /\b(buttons?|cards?|badges?|dialogs?|banners?|inputs?|chips?|tags?)\b/.test(
      t,
    )
  )
    return 'background-color';
  if (/\b(colou?r|dark|light)\b/.test(t)) return 'color';
  return null;
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
