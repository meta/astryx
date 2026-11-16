// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What is wrong with the typography values a theme gives, judged by
 *       what Core builds from them.
 * @input A theme's raw `typography` input; the heading levels Core's input
 *        types take.
 * @output typographyValueProblem(): one field's problem; isHeadingLevel():
 *         a weights key as Core reads it; noLevelWhy() and
 *         noScaleWeightWhy(): the two block rules' reasons;
 *         typographyInputProblems(): every problem in a typography block.
 * @position Shared by the editor, which refuses each problem, and by theme
 *           build, which warns it at its line: one judge for one file.
 */

/**
 * A type scale field as the number Core reads, or NaN: a number, or text
 * that is a number; any other value (a boolean, a symbol, an array) is no
 * number of pixels, whatever Number() would make of it.
 * @param {unknown} value
 */
const scaleNumber = value =>
  typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : NaN;

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
  if (typeof value !== 'string' || isFontWeight(value)) return null;
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
  const field = key.split('.').pop();
  // A weight is typed as text. A number is a type mismatch: the theme's
  // types refuse it, while Core still writes a weight from 1 to 1000 that
  // the browser reads.
  if (field === 'weight' || key.split('.').includes('weights')) {
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
  if (!typography || typeof typography !== 'object') return out;
  const t = /** @type {Record<string, any>} */ (typography);
  for (const [block, fields] of Object.entries(t)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields))
      continue;
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (
        field === 'weights' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        for (const [level, w] of Object.entries(value)) {
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
        continue;
      }
      const why =
        typographyValueProblem(`${block}.${field}`, value) ??
        (field === 'weight' ? weightTextProblem(value) : null);
      if (why) out.push({path: ['typography', block, field], why, value});
    }
  }
  if (!t.scale)
    for (const role of ['body', 'heading', 'code']) {
      const r = t[role];
      if (!r || typeof r !== 'object') continue;
      for (const field of ['weight', 'weights']) {
        if (r[field] === undefined) continue;
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
