// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contrast a theme keeps as designed: its `accepted` records, and
 * the rule a record covers a measured pair by. A record names the Core part
 * of the text, the part it is drawn on (`page` for none), the variant scope
 * it was accepted in (`when`: `prop:value`, joined with `+`), a mode,
 * the ratio accepted, and the two colors. It covers that pair at that ratio
 * or better while both colors stay the same (each channel within 3); a
 * record without both colors covers nothing. A theme file keeps its
 * records in a sibling `<theme>.accepted.json` that holds only the
 * `accepted` list.
 *
 * @input the text of a records file; a record and a measured pair
 * @output the records, checked; whether a record covers a pair
 * @position api/theme-edit — pure; read by the theme check
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {parseColor} from './_color.mjs';

/**
 * Contrast kept as designed.
 * @typedef {{part: string, ground: string, when?: string, mode: 'light' | 'dark', ratio: number, color?: string, groundColor?: string, reason: string}} AcceptRecord
 */

/** The records file beside a theme file. @param {string} theme the theme's name */
export const acceptedFileName = theme => `${theme}.accepted.json`;

/** How far apart, per channel, two colors may be and still be one. */
const SAME_COLOR = 3;

/** @param {string} a @param {string} b */
function sameColor(a, b) {
  const x = parseColor(a);
  const y = parseColor(b);
  return Boolean(
    x &&
    y &&
    x.every((v, i) => Math.abs(v - /** @type {number} */ (y[i])) <= SAME_COLOR),
  );
}

/**
 * Whether a record covers a measured pair: the same text part, ground and
 * mode, the same two colors, and a ratio at least as high.
 * @param {AcceptRecord} record
 * @param {Omit<AcceptRecord, 'reason'>} pair
 */
export function acceptCovers(record, pair) {
  return Boolean(
    record.part === pair.part &&
    record.ground === pair.ground &&
    (record.when ?? '') === (pair.when ?? '') &&
    record.mode === pair.mode &&
    pair.ratio + 0.005 >= record.ratio &&
    record.color &&
    record.groundColor &&
    pair.color &&
    pair.groundColor &&
    sameColor(record.color, pair.color) &&
    sameColor(record.groundColor, pair.groundColor),
  );
}

/**
 * The records of a records file, each checked: a file that is not
 * `{"accepted": [...]}` of whole records is refused, naming the file.
 * @param {string} text
 * @param {string} file the file's name, for the refusal
 * @returns {AcceptRecord[]}
 */
export function parseAccepted(text, file) {
  /** @param {string} why */
  const refuse = why =>
    new AstryxError(
      `${file}: ${why}. It holds only {"accepted": [{part, ground, when?, mode, ratio, color, groundColor, reason}]}.`,
      [],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw refuse(`it is not JSON (${/** @type {Error} */ (e).message})`);
  }
  const keys =
    data && typeof data === 'object' && !Array.isArray(data)
      ? Object.keys(data)
      : null;
  if (!keys || keys.join() !== 'accepted' || !Array.isArray(data.accepted))
    throw refuse('it is not one "accepted" list');
  return data.accepted.map((/** @type {any} */ r, /** @type {number} */ i) => {
    const ok =
      r &&
      typeof r === 'object' &&
      ['part', 'ground', 'reason'].every(
        k => typeof r[k] === 'string' && r[k] !== '',
      ) &&
      ['when', 'color', 'groundColor'].every(
        k => r[k] === undefined || typeof r[k] === 'string',
      ) &&
      (r.mode === 'light' || r.mode === 'dark') &&
      typeof r.ratio === 'number' &&
      Number.isFinite(r.ratio);
    if (!ok) throw refuse(`record ${i + 1} is not a whole record`);
    return /** @type {AcceptRecord} */ (r);
  });
}
