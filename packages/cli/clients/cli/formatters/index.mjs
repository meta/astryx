// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's human-output formatters.
 *
 * The mental model: `--json` is the source of truth, and the plain-text output
 * is just a human-readable projection of that same JSON. So the core renderers
 * take JSON-native values (objects, arrays of objects, string arrays) directly
 * and turn them into readable text — a command shouldn't have to hand-map every
 * field. `record(obj)` / `records(arr)` are the workhorses; you mostly just pick
 * which fields to show and in what order.
 *
 * Constraints (deliberately narrow):
 *   - Plain ASCII only. No color and no TTY detection. Long lines wrap at a
 *     fixed {@link WRAP_WIDTH}, never at the terminal's width, so output is
 *     byte-for-byte deterministic whether printed or piped to an agent.
 *   - Renderers return an opaque {@link Block}; `emit` accepts ONLY Blocks, so a
 *     stray string can't leak onto stdout (the compiler rejects `emit('x')`).
 *     `emit` is the one stdout sink; errors/warnings go to stderr via
 *     cli-error.mjs, never here.
 *   - Field names in the text mirror the JSON keys 1:1, so every field is
 *     greppable (`grep '^description:'`) and the two views stay in sync.
 */

import {humanLog} from '../../../foundation/response/json.mjs';

/**
 * Shared ASCII vocabulary — used here and by stderr diagnostics (cli-error.mjs)
 * so the whole CLI speaks one plain-text dialect. ASCII on purpose: renders
 * identically in every terminal, pager, and captured log.
 */
export const ARROW = '->';
export const BULLET = '-';
export const ERR = '!!';
export const WARN = '!';

/** The column long human-output lines wrap at. */
export const WRAP_WIDTH = 120;

/** The widest first column an inline record pads to; a longer value overhangs. */
const INLINE_LEAD_MAX = 32;

/**
 * Characters a terminal draws two columns wide: CJK ideographs and
 * punctuation, kana, hangul, and fullwidth forms. A line may break between
 * any two of them.
 */
const WIDE_CHAR =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u;

/**
 * How many terminal columns a string takes.
 * @param {string} s
 * @returns {number}
 */
export function displayWidth(s) {
  let width = 0;
  for (const ch of String(s)) width += WIDE_CHAR.test(ch) ? 2 : 1;
  return width;
}

/**
 * Cut a line to `width` columns, ending it with `...` when anything was cut.
 * @param {string} line
 * @param {number} width
 * @returns {string}
 */
function truncateToWidth(line, width) {
  if (displayWidth(line) <= width) return line;
  let out = '';
  let used = 0;
  for (const ch of line) {
    const w = WIDE_CHAR.test(ch) ? 2 : 1;
    if (used + w > width - 3) break;
    out += ch;
    used += w;
  }
  return `${out.trimEnd()}...`;
}

/**
 * An opaque, renderer-produced block of output. Nominal via a private field:
 * nothing outside this file can construct one, so `emit` can trust that whatever
 * it receives came from a renderer (a plain string is not assignable to Block).
 */
export class Block {
  /** @type {string} */
  #text;
  /** @param {string} text */
  constructor(text) {
    this.#text = text;
  }
  /** @returns {string} */
  toString() {
    return this.#text;
  }
}

/**
 * Anything `emit` accepts: a Block, or a falsy value so callers can inline
 * conditionals (`cond && section(...)`). Falsy entries are dropped; a raw string
 * is intentionally NOT assignable.
 * @typedef {Block | false | null | undefined} Emittable
 */

/**
 * Options shared by {@link record} and {@link records}.
 * @typedef {object} RecordOptions
 * @property {string[]} [fields] - Keys to show, in order. Missing/empty keys are
 *   skipped. Defaults to the object's own keys.
 * @property {string[]} [omit] - Keys to exclude (when `fields` is not given).
 * @property {Record<string, string>} [labels] - Rename a key for display.
 * @property {Record<string, (value: any) => string>} [format] - Transform a
 *   value before rendering (e.g. prefix a command with the package manager).
 * @property {'stacked' | 'inline'} [layout] - `stacked` (the default): one
 *   `key: value` line per field, a blank line between records. `inline`: one
 *   record per line, the first field in a padded column and the rest joined by
 *   ` - `, for a list a reader scans.
 * @property {'wrap' | 'truncate'} [overflow] - What an inline record longer
 *   than {@link WRAP_WIDTH} does: `wrap` (the default) continues under the
 *   first column; `truncate` cuts it to one line.
 * @property {(item: any) => boolean} [sizesColumn] - Which inline records the
 *   first column is sized from (default: all). A record left out keeps its
 *   place and overhangs a narrower column, so adding it changes no other line.
 */

/** @param {unknown} v @returns {boolean} */
function isEmpty(v) {
  return (
    v === null ||
    v === undefined ||
    v === '' ||
    (Array.isArray(v) && v.length === 0)
  );
}

/** @param {unknown} v @returns {string} */
function renderValue(v) {
  if (Array.isArray(v)) return v.map(x => String(x)).join(', ');
  return String(v);
}

/**
 * Normalize common non-ASCII typography to ASCII so human output stays plain and
 * consistent no matter what the source data contains (em/en dashes -> "-", curly
 * quotes -> straight, ellipsis -> "...", non-breaking space -> space). The
 * the verbatim renderer (code) deliberately skips this. `--json` is
 * unaffected — it always carries the original data.
 * @param {string} s
 * @returns {string}
 */
function toAscii(s) {
  return String(s)
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u00a0/g, ' ');
}

/**
 * Word-wrap text at `width`, keeping its own line breaks. A word longer than
 * the width stays whole on a line of its own. Continuation lines start with
 * `indent`.
 * @param {string} input
 * @param {{width?: number, indent?: string}} [options]
 * @returns {string}
 */
export function wrapText(input, {width = WRAP_WIDTH, indent = ''} = {}) {
  return String(input)
    .split('\n')
    .map(line => wrapLine(line, width, indent))
    .join('\n');
}

/**
 * @param {string} line
 * @param {number} width
 * @param {string} indent
 * @returns {string}
 */
function wrapLine(line, width, indent) {
  if (displayWidth(line) <= width) return line;
  const lead = /^\s*/.exec(line)?.[0] ?? '';
  // Tokens a line may break between: words, and each wide character on its
  // own, since CJK text has no spaces to break at. `gap` is what joined a
  // token to the one before it.
  /** @type {{text: string, gap: string}[]} */
  const tokens = [];
  let gap = '';
  let word = '';
  const flush = () => {
    if (word === '') return;
    tokens.push({text: word, gap});
    gap = '';
    word = '';
  };
  for (const ch of line.slice(lead.length)) {
    if (ch === ' ') {
      flush();
      gap = ' ';
    } else if (WIDE_CHAR.test(ch)) {
      flush();
      tokens.push({text: ch, gap});
      gap = '';
    } else {
      word += ch;
    }
  }
  flush();
  /** @type {string[]} */
  const out = [];
  let current = lead;
  tokens.forEach(({text: token, gap: before}, i) => {
    const joined = i === 0 ? current + token : current + before + token;
    if (i > 0 && displayWidth(joined) > width && current.trim() !== '') {
      out.push(current);
      current = indent + token;
    } else {
      current = joined;
    }
  });
  out.push(current);
  return out.join('\n');
}

/**
 * A group label, optionally with an explanatory subtitle rendered on the line(s)
 * directly beneath the heading (no blank line between). Whatever list/records
 * follow are separate blocks, so emit's blank line separates them from the
 * header + subtitle.
 * @param {string} heading
 * @param {string} [subtitle]
 * @returns {Block}
 */
export function section(heading, subtitle) {
  return new Block(toAscii(subtitle ? `${heading}\n${subtitle}` : String(heading)));
}

/**
 * A prose block, printed as-is (no wrapping). Multi-line strings kept verbatim.
 * @param {string} content
 * @returns {Block}
 */
export function text(content) {
  return new Block(toAscii(String(content)));
}

/**
 * A bulleted list of primitives (e.g. a string array). Each item is a string or
 * an array of lines (first line is the head, the rest hang-indent). For arrays
 * of OBJECTS use {@link records} instead.
 * @param {Array<string | string[]>} items
 * @returns {Block}
 */
export function list(items) {
  const hang = ' '.repeat(BULLET.length + 1);
  const rendered = items.map(item => {
    const lines = Array.isArray(item) ? item : String(item).split('\n');
    const [head = '', ...rest] = lines;
    return [`${BULLET} ${head}`, ...rest.map(l => `${hang}${l}`)].join('\n');
  });
  const multiline = rendered.some(r => r.includes('\n'));
  return new Block(toAscii(rendered.join(multiline ? '\n\n' : '\n')));
}

/**
 * Render a JSON object as aligned `key: value` lines — the readable projection
 * of that object. Values: strings as-is, arrays comma-joined, other primitives
 * String()'d; empty/missing fields are skipped. Field names mirror the JSON keys
 * so the output is greppable and maps 1:1 to `--json`.
 * @param {any} obj
 * @param {RecordOptions} [options]
 * @returns {Block}
 */
export function record(obj, options = {}) {
  const src = /** @type {Record<string, unknown>} */ (obj);
  const keys = (options.fields ?? Object.keys(src)).filter(
    k => !options.omit?.includes(k) && !isEmpty(src[k]),
  );
  /** @param {string} k */
  const label = k => options.labels?.[k] ?? k;
  const keyWidth = keys.reduce((max, k) => Math.max(max, label(k).length), 0);
  const lines = keys.map(k => {
    const fmt = options.format?.[k];
    const value = fmt ? fmt(src[k]) : renderValue(src[k]);
    return `${`${label(k)}:`.padEnd(keyWidth + 2)}${value}`;
  });
  return new Block(toAscii(lines.join('\n')));
}

/**
 * Render an array of JSON objects as {@link record}s, one per object, separated
 * by a blank line. The single easiest way to turn `data.results` (or any object
 * array) into readable text.
 * @param {any[]} items
 * @param {RecordOptions} [options]
 * @returns {Block}
 */
export function records(items, options = {}) {
  if (options.layout === 'inline') return inlineRecords(items, options);
  const blocks = items.map(o => record(o, options).toString()).filter(Boolean);
  return new Block(blocks.join('\n\n'));
}

/**
 * @param {any[]} items
 * @param {RecordOptions} options
 * @returns {Block}
 */
function inlineRecords(items, options) {
  const [lead, ...rest] = (options.fields ?? Object.keys(items[0] ?? {})).filter(
    k => !options.omit?.includes(k),
  );
  if (lead == null) return new Block('');
  /** @param {any} o @param {string} k */
  const value = (o, k) => {
    const fmt = options.format?.[k];
    return fmt ? fmt(o[k]) : renderValue(o[k]);
  };
  const leads = items.map(o => (isEmpty(o[lead]) ? '' : value(o, lead)));
  const sizes = options.sizesColumn ?? (() => true);
  const column = Math.min(
    Math.max(
      0,
      ...leads.filter((_, i) => sizes(items[i])).map(l => displayWidth(l)),
    ),
    INLINE_LEAD_MAX,
  );
  const indent = ' '.repeat(column + 2);
  const lines = items.map((o, i) => {
    const tail = toAscii(
      rest
        .filter(k => !isEmpty(o[k]))
        .map(k => value(o, k))
        .join(' - '),
    );
    if (tail === '') return toAscii(leads[i]);
    const head = toAscii(`${leads[i].padEnd(column)}  `);
    if (options.overflow === 'truncate') {
      return truncateToWidth(head + tail, WRAP_WIDTH);
    }
    // Wrap only the tail, so the padded first column survives the wrap.
    const [first, ...more] = wrapText(tail, {
      width: Math.max(20, WRAP_WIDTH - displayWidth(head)),
    }).split('\n');
    return [head + first, ...more.map(line => indent + line)].join('\n');
  });
  return new Block(lines.join('\n'));
}

/**
 * A verbatim block — source dumps, layout skeletons, or a markdown doc. Output
 * is byte-for-byte (NOT ASCII-normalized), so it survives piping
 * (`astryx template X > file.tsx`) and preserves doc/source content exactly.
 * @param {string} source
 * @param {{lang?: string}} [_options] - Reserved (intent label); output verbatim.
 * @returns {Block}
 */
export function code(source, _options = {}) {
  return new Block(String(source));
}

/**
 * @param {Emittable} b
 * @returns {b is Block}
 */
function isBlock(b) {
  return b instanceof Block;
}

/**
 * The one sanctioned way to write human output to stdout. Joins blocks with a
 * single blank line and hands the result to `humanLog`, which is a no-op in
 * `--json` mode (stdout carries only the envelope there). Accepts only Blocks
 * (plus falsy placeholders); a bare string will not type-check.
 * @param {Emittable[]} blocks
 * @returns {void}
 */
export function emit(...blocks) {
  const body = blocks
    .filter(isBlock)
    .map(b => b.toString())
    .filter(s => s.length > 0)
    .join('\n\n');
  humanLog(body);
}
