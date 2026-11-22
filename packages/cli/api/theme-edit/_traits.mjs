// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The traits `astryx experimental theme create <name> --traits`
 * takes: a short, typed description of a look. This module reads the JSON
 * a person typed into one checked object, or refuses it with the field and
 * what it takes. It reads nothing from the disk.
 *
 * @input the parsed JSON value of --traits
 * @output {@link Traits}
 * @position api/theme-edit — read by the create helper (_create.mjs)
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {TRAIT_FIELDS} from './_trait-fields.mjs';

export {TRAIT_FIELDS};

/**
 * A color a trait gives: `one` color, which create places in the mode
 * it belongs to, or a color per mode. A half left out comes from the
 * generated palette.
 * @typedef {{one?: string, light?: string, dark?: string}} TraitColor
 */

/**
 * The traits, read and checked.
 * @typedef {object} Traits
 * @property {'light' | 'dark' | 'both'} look - One look for the app, or a light and a dark look.
 * @property {TraitColor} [page]
 * @property {TraitColor} [surface]
 * @property {TraitColor} [text]
 * @property {TraitColor} [accent]
 * @property {{background: TraitColor, text?: TraitColor}} [bar]
 * @property {{body?: string, heading?: string, code?: string, size?: number, headingWeight?: number, bodyWeight?: number}} [font]
 * @property {number | 'pill'} [corners]
 * @property {'compact' | 'normal' | 'roomy'} [density]
 * @property {{width?: number, color?: TraitColor}} [borders]
 * @property {'none' | 'soft' | 'strong'} [shadows]
 * @property {'flat' | 'outlined' | 'raised'} [surfaces]
 * @property {Record<string, string | [string, string]>} [tokens]
 * @property {Record<string, Record<string, Record<string, string>>>} [components]
 */

/** The field names, in order. */
export const TRAIT_NAMES = TRAIT_FIELDS.map(([name]) => name);

/** What a color field takes, said once for every refusal. */
const COLOR_TAKES =
  'a hex color ("#c2410c") or {"light": "#hex", "dark": "#hex"}';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Refuse a traits value: nothing is written.
 * @param {string} message
 * @returns {never}
 */
function refuse(message) {
  throw new AstryxError(
    `${message} Nothing was written.`,
    [
      {
        name: 'astryx experimental theme create --help',
        reason: 'every trait field and what it takes',
      },
    ],
    ERROR_CODES.ERR_INVALID_ARGUMENT,
  );
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * Refuse keys outside `allowed` in an object field.
 * @param {string} field
 * @param {Record<string, unknown>} value
 * @param {readonly string[]} allowed
 */
function onlyKeys(field, value, allowed) {
  const unknown = Object.keys(value).filter(k => !allowed.includes(k));
  if (unknown.length)
    refuse(
      `"${field}" takes ${allowed.map(k => `"${k}"`).join(', ')}; not ${unknown.map(k => `"${k}"`).join(', ')}.`,
    );
}

/**
 * @param {string} field
 * @param {unknown} value
 * @returns {TraitColor}
 */
function color(field, value) {
  if (typeof value === 'string') {
    if (!HEX.test(value.trim()))
      refuse(
        `"${field}" is ${JSON.stringify(value)}; it takes ${COLOR_TAKES}.`,
      );
    return {one: value.trim().toLowerCase()};
  }
  if (!isObject(value))
    refuse(`"${field}" is ${JSON.stringify(value)}; it takes ${COLOR_TAKES}.`);
  onlyKeys(field, value, ['light', 'dark']);
  /** @type {TraitColor} */
  const out = {};
  for (const mode of /** @type {const} */ (['light', 'dark'])) {
    const half = value[mode];
    if (half === undefined) continue;
    if (typeof half !== 'string' || !HEX.test(half.trim()))
      refuse(
        `"${field}.${mode}" is ${JSON.stringify(half)}; it takes a hex color ("#c2410c").`,
      );
    out[mode] = half.trim().toLowerCase();
  }
  if (!out.light && !out.dark)
    refuse(`"${field}" gives no color; it takes ${COLOR_TAKES}.`);
  return out;
}

/**
 * @param {string} field
 * @param {unknown} value
 * @param {readonly string[]} words
 */
function word(field, value, words) {
  if (typeof value !== 'string' || !words.includes(value))
    refuse(
      `"${field}" is ${JSON.stringify(value)}; it takes ${words.map(w => `"${w}"`).join(' | ')}.`,
    );
  return value;
}

/**
 * @param {string} field
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 */
function number(field, value, min, max) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    refuse(
      `"${field}" is ${JSON.stringify(value)}; it takes a number from ${min} to ${max}.`,
    );
  return value;
}

/**
 * @param {string} field
 * @param {unknown} value
 */
function fontName(field, value) {
  if (typeof value !== 'string' || !value.trim() || /[;{}<>]/.test(value))
    refuse(
      `"${field}" is ${JSON.stringify(value)}; it takes a font name, such as "Inter", or a font list.`,
    );
  return value.trim();
}

/**
 * @param {string} field
 * @param {unknown} value
 */
function weight(field, value) {
  number(field, value, 100, 900);
  if (/** @type {number} */ (value) % 100 !== 0)
    refuse(
      `"${field}" is ${value}; it takes a weight in hundreds, 100 to 900.`,
    );
  return /** @type {number} */ (value);
}

/**
 * Read the traits a person typed. A field the traits do not take is
 * refused with the list of fields; a field with a value it does not take
 * is refused with what it takes.
 * @param {unknown} input the parsed --traits JSON
 * @returns {Traits}
 */
export function readTraits(input) {
  if (!isObject(input))
    refuse(
      `--traits takes a JSON object, such as '{"page": "#f7f5f0", "accent": "#c2410c", "corners": 4}'; got ${Array.isArray(input) ? 'a list' : JSON.stringify(input)}.`,
    );
  const unknown = Object.keys(input).filter(
    k => !(/** @type {readonly string[]} */ (TRAIT_NAMES).includes(k)),
  );
  if (unknown.length)
    refuse(
      `Unknown trait field${unknown.length > 1 ? 's' : ''}: ${unknown.map(k => `"${k}"`).join(', ')}. Traits take: ${TRAIT_NAMES.join(', ')}. Any other value goes in "tokens" or "components".`,
    );
  /** @type {Traits} */
  const traits = {
    look: /** @type {Traits['look']} */ (
      input.look === undefined
        ? 'both'
        : word('look', input.look, ['light', 'dark', 'both'])
    ),
  };
  for (const field of /** @type {const} */ ([
    'page',
    'surface',
    'text',
    'accent',
  ]))
    if (input[field] !== undefined) traits[field] = color(field, input[field]);
  if (input.bar !== undefined) {
    const bar = input.bar;
    if (!isObject(bar))
      refuse(
        `"bar" takes {"background": color, "text": color}; got ${JSON.stringify(bar)}.`,
      );
    onlyKeys('bar', bar, ['background', 'text']);
    if (bar.background === undefined)
      refuse('"bar" needs a "background" color.');
    traits.bar = {background: color('bar.background', bar.background)};
    if (bar.text !== undefined) traits.bar.text = color('bar.text', bar.text);
  }
  if (input.font !== undefined) {
    const font = input.font;
    if (!isObject(font))
      refuse(
        `"font" takes {"body", "heading", "code", "size", "headingWeight", "bodyWeight"}; got ${JSON.stringify(font)}.`,
      );
    onlyKeys('font', font, [
      'body',
      'heading',
      'code',
      'size',
      'headingWeight',
      'bodyWeight',
    ]);
    /** @type {NonNullable<Traits['font']>} */
    const out = {};
    for (const role of /** @type {const} */ (['body', 'heading', 'code']))
      if (font[role] !== undefined)
        out[role] = fontName(`font.${role}`, font[role]);
    if (font.size !== undefined)
      out.size = number('font.size', font.size, 10, 24);
    if (font.headingWeight !== undefined)
      out.headingWeight = weight('font.headingWeight', font.headingWeight);
    if (font.bodyWeight !== undefined)
      out.bodyWeight = weight('font.bodyWeight', font.bodyWeight);
    traits.font = out;
  }
  if (input.corners !== undefined)
    traits.corners =
      input.corners === 'pill'
        ? 'pill'
        : typeof input.corners === 'number'
          ? number('corners', input.corners, 0, 64)
          : refuse(
              `"corners" is ${JSON.stringify(input.corners)}; it takes px on buttons and fields (0 = square) or "pill".`,
            );
  if (input.density !== undefined)
    traits.density = /** @type {Traits['density']} */ (
      word('density', input.density, ['compact', 'normal', 'roomy'])
    );
  if (input.borders !== undefined) {
    const borders = input.borders;
    if (!isObject(borders))
      refuse(
        `"borders" takes {"width": px, "color": color}; got ${JSON.stringify(borders)}.`,
      );
    onlyKeys('borders', borders, ['width', 'color']);
    traits.borders = {};
    if (borders.width !== undefined)
      traits.borders.width = number('borders.width', borders.width, 0, 8);
    if (borders.color !== undefined)
      traits.borders.color = color('borders.color', borders.color);
  }
  if (input.shadows !== undefined)
    traits.shadows = /** @type {Traits['shadows']} */ (
      word('shadows', input.shadows, ['none', 'soft', 'strong'])
    );
  if (input.surfaces !== undefined)
    traits.surfaces = /** @type {Traits['surfaces']} */ (
      word('surfaces', input.surfaces, ['flat', 'outlined', 'raised'])
    );
  if (input.tokens !== undefined) traits.tokens = exactTokens(input.tokens);
  if (input.components !== undefined)
    traits.components = exactComponents(input.components);
  return traits;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string | [string, string]>}
 */
function exactTokens(value) {
  if (!isObject(value))
    refuse(
      `"tokens" takes {"--token": value | [light, dark]}; got ${JSON.stringify(value)}.`,
    );
  /** @type {Record<string, string | [string, string]>} */
  const out = {};
  for (const [name, v] of Object.entries(value)) {
    if (!/^--[a-z0-9-]+$/.test(name))
      refuse(
        `"tokens" key "${name}" is no token name; a token is written "--color-accent".`,
      );
    if (
      Array.isArray(v) &&
      v.length === 2 &&
      v.every(x => typeof x === 'string' && x.trim())
    )
      out[name] = [String(v[0]).trim(), String(v[1]).trim()];
    else if (typeof v === 'string' && v.trim()) out[name] = v.trim();
    else
      refuse(
        `"tokens.${name}" is ${JSON.stringify(v)}; it takes a CSS value or [light, dark].`,
      );
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {Record<string, Record<string, Record<string, string>>>}
 */
function exactComponents(value) {
  const takes = '{"<part>": {"base" | "<state>": {"cssProperty": "value"}}}';
  if (!isObject(value))
    refuse(`"components" takes ${takes}; got ${JSON.stringify(value)}.`);
  /** @type {Record<string, Record<string, Record<string, string>>>} */
  const out = {};
  for (const [part, blocks] of Object.entries(value)) {
    if (!isObject(blocks))
      refuse(
        `"components.${part}" takes {"base" | "<state>": {css}}; got ${JSON.stringify(blocks)}.`,
      );
    out[part] = {};
    for (const [key, css] of Object.entries(blocks)) {
      if (!isObject(css))
        refuse(
          `"components.${part}.${key}" takes {"cssProperty": "value"}; got ${JSON.stringify(css)}.`,
        );
      out[part][key] = {};
      for (const [prop, v] of Object.entries(css)) {
        // A component's private variables are not part of a theme.
        if (prop.startsWith('--_'))
          refuse(
            `"components.${part}.${key}.${prop}" is a component's private variable; a theme sets public tokens and CSS properties.`,
          );
        if (typeof v !== 'string' && typeof v !== 'number')
          refuse(
            `"components.${part}.${key}.${prop}" takes a CSS value; got ${JSON.stringify(v)}.`,
          );
        out[part][key][prop] = String(v);
      }
    }
  }
  return out;
}

/**
 * The traits as one JSON line, for the theme file's header. A color given
 * once is written once.
 * @param {Traits} traits
 */
export function traitsJson(traits) {
  /** @param {unknown} v @returns {unknown} */
  const plain = v => {
    if (!isObject(v)) return v;
    if (typeof v.one === 'string') return v.one;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  };
  // JSON leaves U+2028 and U+2029 as they are, and either would end the
  // line comment the traits are written in.
  return JSON.stringify(plain(traits))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
