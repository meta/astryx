// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What is wrong with the typography values a theme gives, judged by
 *       what Core builds from them.
 * @input A theme's raw `typography` input; the heading levels Core's input
 *        types take.
 * @output typographyValueProblem(): one field's problem; isHeadingLevel():
 *         a weights key as Core reads it; levelDuplicates(): two keys for
 *         one level; missingScaleFieldWhy(), typographyBlockWhy(),
 *         noLevelWhy() and noScaleWeightWhy(): the block rules' reasons;
 *         typographyInputProblems(): every problem in a typography block.
 * @position Shared by the editor, which refuses each problem, and by theme
 *           build, which warns it at its line: one judge for one file.
 */

import {writtenPrimitive} from './written-values.mjs';

/**
 * A type scale field as the number Core reads, or NaN: a number, or text
 * that is a number; any other value (a boolean, a symbol, an array) is no
 * number of pixels, whatever Number() would make of it.
 * @param {unknown} value
 */
const scaleNumber = value => {
  const v = writtenPrimitive(value);
  return typeof v === 'number'
    ? v
    : typeof v === 'string' && v.trim() !== ''
      ? Number(v)
      : NaN;
};

/**
 * A value the source writes that cannot be known without running it (a
 * call, a name from another module). On a block, as a key, it marks a block
 * the source reader could not read whole (a spread of such a value), so a
 * field it lacks may still be given.
 */
export const UNREAD = Symbol('unread');

/** Whether a block may hold fields the source reader could not see. @param {any} block */
const partial = block => Boolean(block?.[UNREAD]);

/** Whether a value is a plain block of fields. @param {unknown} value */
const isBlock = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The typography roles Core builds a font list and weights for. */
const ROLES = ['body', 'heading', 'code'];

/** A value as the source writes it. @param {unknown} value */
function describe(value) {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && !Number.isFinite(value))
    return String(value);
  if (typeof value === 'symbol') return String(value);
  if (typeof value === 'function') return 'a function';
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** The weight names Core reads as its weight tokens. */
const CORE_WEIGHT_NAMES = ['normal', 'medium', 'semibold', 'bold'];

/**
 * Whether text is a weight the browser reads where Core writes it: one of
 * Core's weight names, a CSS weight keyword in any case, a number from 1 to
 * 1000, a global keyword, or a function (a var(), a calc()).
 * @param {string} value
 */
function isFontWeight(value) {
  const v = value.trim();
  if (CORE_WEIGHT_NAMES.includes(v)) return true;
  if (/^(normal|bold|bolder|lighter|inherit|initial|unset|revert)$/i.test(v))
    return true;
  if (/^[a-z-]+\(.*\)$/i.test(v)) return true;
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i.test(v)) return false;
  const n = Number(v);
  return n >= 1 && n <= 1000;
}

/**
 * Core's weight name a slip is near (`semi-bold` is semibold), or null.
 * @param {string} value
 */
function nearWeightName(value) {
  const flat = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  return CORE_WEIGHT_NAMES.find(n => n === flat) ?? null;
}

/**
 * Why a weight given as text is no weight the browser reads, or null. The
 * editor judges the same text as the weight token it builds; theme build
 * judges it here.
 * @param {unknown} value
 * @returns {string | null}
 */
function weightTextProblem(value) {
  value = writtenPrimitive(value);
  if (typeof value !== 'string' || value === '' || isFontWeight(value))
    return null;
  const near = nearWeightName(value);
  return `"${value.trim()}" is no font weight, so the browser drops the weight Core writes from it and the text keeps the weight around it: write a number from 1 to 1000 in quotes, ${CORE_WEIGHT_NAMES.join(', ')} (Core's weight names), or a weight token, such as ${near ? `'${near}'` : "'600'"}`;
}

/**
 * Whether a key of a role's `weights` is a heading level as Core reads it:
 * Core takes `Number(key)`, so `1`, `'01'` and `'1.0'` are all level 1.
 * @param {string} key
 * @param {string[]} levels
 */
export function isHeadingLevel(key, levels) {
  const n = Number(String(key).trim());
  return String(key).trim() !== '' && levels.includes(String(n));
}

/**
 * What is wrong with one typography field, or null. Core writes a family
 * as it is, in double quotes when it holds a space, so a family with a
 * space must be one family name without quotes; one without a space is
 * written bare, so a quoted name (`"Lato"`) or a list with no space
 * (`Lato,serif`) builds what the browser reads. The scale's ratio is above
 * 1 and at most 4, its base a positive number of pixels.
 * @param {string} key the dotted field (`body.family`, `scale.ratio`)
 * @param {unknown} value
 * @returns {string | null}
 */
export function typographyValueProblem(key, value) {
  value = writtenPrimitive(value);
  const parts = key.split('.');
  const field = parts.at(-1);
  // A role and the scale are blocks: Core reads their fields, so a plain
  // value builds nothing (a role) or every size as NaNrem (a scale).
  if (
    parts.length === 1 &&
    ROLES.includes(field ?? '') &&
    value != null &&
    !isBlock(value)
  )
    return `typography.${field} is a block of fields, such as ${field}: {family: 'Inter'}, and Core reads nothing from ${describe(value)}, so it builds nothing`;
  if (parts.length === 1 && field === 'scale' && value && !isBlock(value))
    return `typography.scale is a block of a base and a ratio, such as scale: {base: 16, ratio: 1.2}, and Core reads ${describe(value)} as one with neither, so it builds every font size as NaNrem, which no page can use`;
  // A role's weights is a block of heading levels. Core reads any other
  // value by its entries: a text's letters, or an array's places, become
  // levels.
  if (field === 'weights' && parts.length === 2) {
    if (isBlock(value)) return null;
    const reads =
      typeof value === 'string' || Array.isArray(value)
        ? `reads ${describe(value)} by its ${typeof value === 'string' ? 'letters' : 'places'} as levels, which builds no weight you meant`
        : `finds no levels in ${describe(value)}, so it builds nothing`;
    return `typography.${key} takes a weight for each heading level, such as weights: {1: '800'}, and Core ${reads}; for one weight for every heading, use ${parts[0]}.weight`;
  }
  // A weight is typed as text. A number is a type mismatch: the theme's
  // types refuse it, while Core still writes a weight from 1 to 1000 that
  // the browser reads.
  if (field === 'weight' || parts.includes('weights')) {
    // Core skips an empty weight and keeps its own.
    if (value === '' || value === 0 || value === false)
      return `typography.${key} is empty, and Core skips an empty weight and keeps its default, so it builds nothing: give a weight, such as '600', or take it out`;
    if (typeof value === 'number' && value >= 1 && value <= 1000)
      return `a typography weight is text, and ${value} is a number: a type mismatch the theme's types refuse (Core still writes ${value}, which the browser reads as that weight); write '${value}' (or a weight token, such as 'var(--font-weight-bold)')`;
    if (typeof value !== 'string')
      return `a typography weight is text, and ${describe(value)} is ${typeof value === 'number' ? 'a number that is no weight (a weight is 1 to 1000)' : 'not text'}: a type mismatch the theme's types refuse, and no weight the browser reads; write '600' (or a weight token, such as 'var(--font-weight-bold)')`;
  }
  if (field === 'family') {
    if (typeof value !== 'string')
      return 'a typography family is a family name in quotes, such as "Inter"';
    const v = value.trim();
    if (/[;{}<>]/.test(v))
      return `"${v}" holds a ; { } < or >, so the CSS writer drops the whole declaration; give the family name alone, such as "Inter"`;
    // Only a family with a space is quoted by Core: one without is written
    // as it is, which the browser reads.
    if (v.includes(' ')) {
      const quoted = /^(["'])(.*)\1$/.exec(v);
      if (quoted && !/["',]/.test(quoted[2]))
        return `the family is written in quotes, and Core adds its own around a name with a space, so it builds ${JSON.stringify(`"${v}"`)}, a name no font has; write it without them: family: '${quoted[2]}'`;
      if (v.includes(','))
        return `a typography family with a space is one family name, which Core quotes whole ("${v}" is one family that exists nowhere); give the first as family and the rest as fallbacks, such as family: '${v
          .split(',')[0]
          .trim()
          .replace(
            /^["']|["']$/g,
            '',
          )}', fallbacks: '${v.split(',').slice(1).join(',').trim()}'`;
    }
    if (!v || /^[-+]?\d/.test(v) || /^(inherit|initial|unset|revert)$/i.test(v))
      return `"${v}" is no font family name; give one such as "Inter"`;
    return null;
  }
  if (field === 'ratio') {
    const n = scaleNumber(value);
    if (!Number.isFinite(n) || n <= 1 || n > 4)
      return `the type scale's ratio is how much each size grows over the last, a number above 1 and at most 4 (such as 1.2); ${describe(value)} makes ${n <= 0 ? 'sizes that are not numbers' : n <= 1 ? 'every size the same or smaller' : 'sizes no page can use'}`;
    return null;
  }
  if (field === 'base') {
    const n = scaleNumber(value);
    if (!Number.isFinite(n) || n <= 0) {
      // A size with a unit builds NaNrem: the number of pixels it means.
      const m = /^\s*([0-9.]+)\s*(px|rem|em)\s*$/i.exec(String(value));
      const px = m ? Number(m[1]) * (/^r?em$/i.test(m[2]) ? 16 : 1) : null;
      return `the type scale's base is the body size, a positive number of pixels${px ? `, so ${describe(value)} is base: ${px}` : ' (such as 16)'}; ${describe(value)} builds sizes no page can use${m ? ' (NaNrem)' : ''}`;
    }
    return null;
  }
  return null;
}

/**
 * Why a type scale with no base or no ratio builds no size a page can use.
 * @param {'base' | 'ratio'} field
 */
export const missingScaleFieldWhy = field =>
  `the type scale is given no ${field}, and Core reads the sizes from the base and the ratio together, so it builds every font size as NaNrem: add ${field === 'base' ? 'the body size in pixels, such as scale: {base: 16, ratio: …}' : 'the step between sizes, such as scale: {base: …, ratio: 1.2}'}`;

/**
 * Why a typography that is no block builds nothing.
 * @param {unknown} value
 */
export const typographyBlockWhy = value =>
  `typography is a block of roles and a scale, such as typography: {body: {family: 'Inter'}}, and Core reads nothing from ${describe(writtenPrimitive(value))}, so it builds nothing`;

/**
 * The keys of a role's weights that name a level another key names too
 * (`'01'` and `1`): Core keeps the one it reads last, so each other one
 * builds nothing.
 * @param {string} role
 * @param {Record<string, unknown>} weights
 * @param {string[]} levels
 * @returns {Array<{key: string, why: string}>}
 */
export function levelDuplicates(role, weights, levels) {
  /** @type {Map<number, string>} */
  const at = new Map();
  /** @type {Array<{key: string, why: string}>} */
  const out = [];
  for (const level of Object.keys(weights)) {
    if (!isHeadingLevel(level, levels)) continue;
    const n = Number(level.trim());
    const before = at.get(n);
    if (before !== undefined)
      out.push({
        key: before,
        why: `${before} and ${level} are both heading level ${n}, and Core keeps the one it reads last (${level}), so typography.${role}.weights.${before} builds nothing: keep one`,
      });
    at.set(n, level);
  }
  return out;
}

/**
 * Why a `weights` entry that is no heading level builds nothing.
 * @param {string} level
 * @param {string[]} levels
 * @param {string} key the dotted field
 */
export const noLevelWhy = (level, levels, key) =>
  `${level} is no heading level: Core reads weights for levels ${levels.join(', ')}, so typography.${key} builds nothing`;

/**
 * Why a role weight in a typography with no type scale builds nothing.
 * @param {string} key the dotted field (`body.weight`)
 * @param {string} role
 * @param {string} instead what to do instead
 */
export const noScaleWeightWhy = (key, role, instead) =>
  `Core writes a role's weight only from a type scale, and this typography has none, so ${key} builds nothing. Take it out and ${instead}; a type scale would also resize all text`;

/**
 * The weight tokens a role's weight is, without a type scale.
 * @param {string} role
 */
export const roleWeightTokens = role =>
  role === 'heading'
    ? '--text-heading-1-weight … --text-heading-6-weight'
    : `--text-${role}-weight`;

/**
 * Every problem in a theme's own typography block, by its path: a field
 * value (typographyValueProblem), a `weights` entry that is no heading
 * level, and a role weight with no type scale. A field Core does not take
 * is left to the field reader, which names it from the source.
 * @param {unknown} typography the raw `typography` input
 * @param {string[]} [levels] the heading levels Core's input takes
 * @returns {Array<{path: string[], why: string, value: unknown}>}
 */
export function typographyInputProblems(typography, levels = []) {
  /** @type {Array<{path: string[], why: string, value: unknown}>} */
  const out = [];
  if (typography == null || typography === UNREAD) return out;
  if (!isBlock(typography)) {
    out.push({
      path: ['typography'],
      why: typographyBlockWhy(typography),
      value: typography,
    });
    return out;
  }
  const t = /** @type {Record<string, any>} */ (typography);
  const noScale = !t.scale && !partial(t);
  /** Roles whose weights is no block: that is their reason. */
  const shapeless = new Set();
  for (const [block, fields] of Object.entries(t)) {
    if (fields === undefined || fields === UNREAD) continue;
    if (!isBlock(fields)) {
      const why = typographyValueProblem(block, fields);
      if (why) out.push({path: ['typography', block], why, value: fields});
      continue;
    }
    if (block === 'scale') {
      const missing = /** @type {const} */ (['base', 'ratio']).find(
        f => fields[f] === undefined,
      );
      if (missing && !partial(fields))
        out.push({
          path: ['typography', 'scale'],
          why: missingScaleFieldWhy(missing),
          value: fields,
        });
    }
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined || value === UNREAD) continue;
      if (field === 'weights' && !isBlock(writtenPrimitive(value))) {
        const why = typographyValueProblem(`${block}.weights`, value);
        if (why) {
          shapeless.add(block);
          out.push({path: ['typography', block, 'weights'], why, value});
        }
        continue;
      }
      // Without a type scale Core writes no role weight: that reason is
      // given below, for any weight.
      if (noScale && (field === 'weight' || field === 'weights')) continue;
      if (field === 'weights') {
        for (const [level, w] of Object.entries(value)) {
          if (w === UNREAD) continue;
          const key = `${block}.weights.${level}`;
          const why =
            levels.length && !isHeadingLevel(level, levels)
              ? noLevelWhy(level, levels, key)
              : (typographyValueProblem(key, w) ?? weightTextProblem(w));
          if (why)
            out.push({
              path: ['typography', block, 'weights', level],
              why,
              value: w,
            });
        }
        for (const d of levelDuplicates(block, value, levels))
          out.push({
            path: ['typography', block, 'weights', d.key],
            why: d.why,
            value: value[d.key],
          });
        continue;
      }
      const why =
        typographyValueProblem(`${block}.${field}`, value) ??
        (field === 'weight' ? weightTextProblem(value) : null);
      if (why) out.push({path: ['typography', block, field], why, value});
    }
  }
  if (noScale)
    for (const role of ROLES) {
      const r = t[role];
      if (!isBlock(r)) continue;
      for (const field of ['weight', 'weights']) {
        if (r[field] === undefined) continue;
        if (field === 'weights' && shapeless.has(role)) continue;
        const key = `${role}.${field}`;
        out.push({
          path: ['typography', role, field],
          value: r[field],
          why: noScaleWeightWhy(
            key,
            role,
            `give the weight as the ${roleWeightTokens(role)} token${role === 'heading' ? 's' : ''} in tokens, which changes only that weight`,
          ),
        });
      }
    }
  return out;
}
