// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Minimal non-interactive terminal output surface for codemods.
 *
 * @input  message strings from codemod runners
 * @output plain lines on stdout via humanLog (suppressed in --json mode)
 * @position lib — shared output helper, no side effects on import
 *
 * Codemod runners use it as `import * as p from './term-log.mjs'` and call
 * `p.log.step(...)`, `p.log.success(...)`, etc. All output routes through
 * `humanLog`, the CLI's stdout-discipline primitive, which is a no-op in
 * `--json` mode — so these human logs can never corrupt a JSON envelope.
 * Every line is plain ASCII: level prefixes are ASCII and typographic glyphs
 * in a message are transliterated before it is printed.
 *
 * The side-effecting API commands (upgrade/init/themeBuild) do NOT use this;
 * they write through the shared `logger` (api/logger.mjs).
 */

import {humanLog} from '../../foundation/response/json.mjs';

/** @type {Array<[RegExp, string]>} */
const ASCII_GLYPHS = [
  [/[\u2014\u2013]/g, '-'],
  [/\u2192/g, '->'],
  [/\u2713/g, '[ok]'],
  [/\u2717/g, '!!'],
  [/\u26a0\ufe0f?/g, '!'],
  [/\u2022/g, '-'],
  [/\u2026/g, '...'],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
  [/\u00a0/g, ' '],
];

/**
 * A message as plain ASCII: typographic glyphs become their ASCII spelling.
 * @param {unknown} msg
 * @returns {string}
 */
export function toAscii(msg) {
  let text = msg === undefined || msg === null ? '' : String(msg);
  for (const [glyph, ascii] of ASCII_GLYPHS) text = text.replace(glyph, ascii);
  return text;
}

/**
 * Human-facing log surface (the small `log` API codemods use). All lines go to
 * stdout via humanLog; the level prefixes are cosmetic. `--json` mode suppresses
 * every one of these, keeping machine-readable stdout clean.
 */
export const log = {
  /** @param {unknown} msg */
  message: (msg) => humanLog(toAscii(msg)),
  /** @param {unknown} msg */
  info: (msg) => humanLog(toAscii(msg)),
  /** @param {unknown} msg */
  step: (msg) => humanLog(toAscii(msg)),
  /** @param {unknown} msg */
  success: (msg) => humanLog(`[ok] ${toAscii(msg)}`),
  /** @param {unknown} msg */
  warn: (msg) => humanLog(`! ${toAscii(msg)}`),
  /** @param {unknown} msg */
  error: (msg) => humanLog(`!! ${toAscii(msg)}`),
};
