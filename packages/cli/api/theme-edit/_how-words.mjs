// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The word tables the how reader reads: hues people name, states a
 * word names, words of the languages the docs ship, and the design words
 * a near miss is corrected to.
 * @position api/theme-edit — a leaf read by _how-question.mjs
 */

import {wordTable} from './_tables.mjs';

/**
 * Words of other languages the docs ship, and the English word each means.
 * Matched as whole words, or anywhere for scripts without spaces.
 * @type {Array<[RegExp, string]>}
 */
export const TRANSLATE = /** @type {Array<[RegExp, string]>} */ (
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
    // ("eckiger": more angular, a step, never all the way square.)
    ['eckiger(?:e[nrs]?)?', '(?!)', 'sharper'],
    ['cuadrad[oa]s|carrés|eckig(?:e\\p{L}*)?', '四角|方形|네모', 'square'],
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
    // "sans" is a typeface word before serif, font, the end of its clause
    // or a text size that ends it or comes before a text word ("system sans
    // 16px", "system sans."), or after a kind of typeface ("humanist
    // sans"); before any other word it is "without" ("a design system sans
    // shadows", "buttons sans 2px borders").
    [
      'sin|(?<!(?<!\\p{L})(?:humanist|geometric|grotesque|grotesk)[\\s-]+)sans(?![\\s-]*(serif|fonts?|typefaces?|\\d*\\.?\\d+\\s?(?:px|pt|rem|em)\\s*(?:[,.;!?)]|$|(?:text|type|body|copy)\\b)|[,.;!?)]|$))|ohne|без|sem|senza',
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

/** Design words a near miss is corrected to, beside the one-word part names. */
export const DESIGN_WORDS = [
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

/** Hues people name, as fills a part can take. */
export const HUES = wordTable(
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
    silver: '#c0c0c0',
    // (The color names designers use for a palette, beside the hues.)
    terracotta: '#c2603d',
    sage: '#87a96b',
    rust: '#b7410e',
    mustard: '#d4a017',
    olive: '#6b8e23',
    burgundy: '#800020',
    maroon: '#7f1d1d',
    coral: '#f87171',
    salmon: '#fa8072',
    sand: '#d6c6a5',
    sky: '#38bdf8',
    taupe: '#8b7d6b',
    slate: '#64748b',
    emerald: '#059669',
    forest: '#166534',
    ruby: '#be123c',
    plum: '#7e22ce',
    lavender: '#c4b5fd',
    peach: '#fdba74',
    ivory: '#fffff0',
    khaki: '#c3b091',
    ochre: '#cc7722',
    copper: '#b87333',
    gold: '#ca8a04',
    bronze: '#a16207',
    mauve: '#b784a7',
    tan: '#d2b48c',
    paper: '#f7f3e9',
    // (Names said in two words, joined by the reader into one: "off-white",
    // "ink blue", "grass green", "safety orange", "blue-gray".)
    offwhite: '#faf8f3',
    inkblue: '#1e3a5f',
    grassgreen: '#4caf50',
    safetyorange: '#ff6700',
    bluegray: '#64748b',
  }),
);

/** States a word names. */
export const STATE_WORDS = /** @type {Array<[RegExp, string]>} */ ([
  [/\b(hover(ed|ing)?|mouse ?over)\b/, 'hover'],
  [/\b(focus(ed|ing)?|on focus)\b/, 'focus'],
  [/\b(disabled|inactive)\b/, 'disabled'],
  // (A switch's "on color", "on state": its checked look.)
  [
    /\b(checked|ticked|when on|turned on|toggled on|is on|on[- ](?:colou?r|state|look))\b/,
    'checked',
  ],
  [
    /\b(selected|active (tab|nav|item|link|page))\b|\bactive\b(?=.*\b(nav|tab|item)\b)/,
    'selected',
  ],
  // ("Pressed" is its own word: a toggle's pressed state, else active.)
  [/\b(press(ed|es)?|on press)\b/, 'pressed'],
  [
    /\b(click(ed|s)?|tap(ped|s)?(?! targets?)|on click|when i click|active)\b/,
    'active',
  ],
  [/\b(typing|type in|tab to|tabbing|keyboard focus)\b/, 'focus'],
  [/\b(after i check|once checked|i check)\b/, 'checked'],
  // ("Blue selection" said of a part: its selected items. The text
  // highlight, said with no part, is read before states are.)
  [/\b(picked|chosen|choose|pick|selections?)\b/, 'selected'],
  [
    /\b(invalid|errors? state|has an error|with an error|with errors|in (?:an )?error(?: state)?|erroring|errored)\b/,
    'invalid',
  ],
  // ("valid inputs", "fields in a success state": the success status.)
  [/\b(valid|validated|in (?:a )?success(?: state)?)\b/, 'valid'],
  // ("after visiting", "once you've been there": the visited look.)
  [
    /\b(visited|(?:after|once|when) (?:i'?ve |you'?ve |they'?ve )?(?:visiting|visited|been (?:there|clicked)))\b/,
    'visited',
  ],
  // ("The open select", "when open": a part shown open.)
  [
    /\bopened\b|\b(?:when|while|once|if) (?:it'?s |they'?re |it is |they are )?open\b|\bthe open\b/,
    'open',
  ],
  [/\bexpanded\b/, 'expanded'],
  // (The option a list points at, by keyboard or pointer.)
  [/\b(highlighted|keyboard[- ]highlighted)\b/, 'highlighted'],
  // (A page or step shown as the one you are on: aria-current.)
  [/\bcurrent\b/, 'current'],
  // Words for states a part may not have: the answer says so.
  [/\bread-?only\b/, 'readonly'],
  [/\bindeterminate\b/, 'indeterminate'],
  [
    /\bloading\b(?! (bars?|placeholders?|skeletons?|spinners?|states?|indicators?))/,
    'loading',
  ],
  [
    /\b(unchecked|not checked|unticked|when off|turned off|toggled off|switched off|is off)\b/,
    'unchecked',
  ],
  [/\b(unselected|not selected|non-selected)\b/, 'unselected'],
]);
