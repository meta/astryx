// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a printed `set` line reads: its arguments as a shell splits
 * them, and its setting (thing, value and scope flags). Pure text reading,
 * shared by the checks of offered lines.
 *
 * @position api/theme-edit — imported by _check.mjs and _vet.mjs
 */

import {P} from './_tables.mjs';

/**
 * Split a printed command into its arguments, as a POSIX shell reads them:
 * single quotes (with `'\''` for a quote inside), double quotes and
 * backslashes. `null` when the quotes do not close.
 * @param {string} line
 * @returns {string[] | null}
 */
export function splitCommand(line) {
  /** @type {string[]} */
  const out = [];
  let cur = '';
  let has = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) return null;
      cur += line.slice(i + 1, end);
      has = true;
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < line.length && line[j] !== '"'; j += 1) {
        if (line[j] === '\\' && j + 1 < line.length) j += 1;
        cur += line[j];
      }
      if (j >= line.length) return null;
      has = true;
      i = j;
    } else if (c === '\\' && i + 1 < line.length) {
      cur += line[i + 1];
      has = true;
      i += 1;
    } else if (/\s/.test(c)) {
      if (has) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

const VALUE_FLAGS = new Set(['on', 'when', 'state', 'mode']);

/**
 * Read a suggested `set <slug> <thing> <value> [flags]` line; `null` when it
 * is not one this check can read (another command or theme, a placeholder,
 * an unknown flag): such a line is kept as it is.
 * @param {string} name
 * @param {string} slug
 */
export function readSetLine(name, slug) {
  const prefix = `${P} set ${slug} `;
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  // A placeholder (`<a color>`, `…`) is a pattern, not a command to run.
  if (/<[^>]*>|…/.test(rest)) return null;
  const args = splitCommand(rest);
  if (!args || !args.length) return null;
  /** @type {string[]} */
  const pos = [];
  /** @type {{on?: string, when?: string, state?: string, mode?: string, only?: boolean}} */
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
    // A token (`--color-accent`) is the thing, not a flag.
    if (m && (VALUE_FLAGS.has(m[1]) || m[1] === 'only') && pos.length) {
      if (m[1] === 'only') {
        flags.only = true;
        continue;
      }
      const v = m[2] ?? args[(i += 1)];
      if (v == null) return null;
      /** @type {any} */ (flags)[m[1]] = v;
    } else if (m && pos.length) {
      // Some other flag (`--png`): not part of the setting.
      if (m[1] === 'png') continue;
      return null;
    } else pos.push(a);
  }
  if (pos.length > 2 || !pos.length) return null;
  return {thing: pos[0], value: pos[1] ?? '', flags};
}
