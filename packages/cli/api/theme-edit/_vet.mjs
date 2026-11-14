// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one place every `set` command a refusal suggests is checked
 * before it is shown: each runs through the same check `set` uses (in
 * memory, nothing written, nothing built), and one `set` would refuse is
 * dropped, so a "do this instead" never leads to a second refusal.
 *
 * @position api/theme-edit — imported by _edit.mjs
 */

import {AstryxError} from '../error.mjs';
import {checkSetting} from './_check.mjs';
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

/**
 * Drop each `set` suggestion of a refusal that `set` itself would refuse,
 * checked against the theme as it is now (a copy: nothing is changed). Any
 * other suggestion is kept. When every suggestion goes, the refusal points
 * at `set --help`.
 * @template T
 * @param {T} e the error thrown
 * @param {import('./_settings.mjs').Ctx | null | undefined} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData | null | undefined} data
 * @returns {T}
 */
export function vetSuggestions(e, ctx, slug, data) {
  if (!(e instanceof AstryxError) || !ctx || !data) return e;
  const list = e.suggestions ?? [];
  if (!list.length) return e;
  const kept = list.filter(s => {
    const line = readSetLine(s.name, slug);
    if (!line) return true;
    try {
      checkSetting(
        ctx,
        slug,
        structuredClone(data),
        line.thing,
        line.value,
        line.flags,
        false,
      );
      return true;
    } catch {
      return false;
    }
  });
  if (kept.length === list.length) return e;
  e.suggestions = kept.length
    ? kept
    : [{name: `${P} set --help`, reason: 'see what set takes'}];
  return e;
}

/**
 * Follow a suggested command before it is offered: `check` runs the line as
 * its command would (in memory, nothing written) and gives null when it
 * runs, else the refusal. The refusal's own repair (its first suggestion
 * `isRepair` takes that was not tried) replaces the line, until the line
 * runs or no repair is offered; `why` then names what is still refused.
 * Every refusal-suggested `set`, `undo`, `new` and `compile` that is a
 * repair of a typed command goes through here.
 * @param {string} line
 * @param {(line: string) => Promise<AstryxError | null> | AstryxError | null} check
 * @param {(name: string) => boolean} isRepair
 * @returns {Promise<{line: string, why: string | null}>}
 */
export async function followLine(line, check, isRepair) {
  const tried = new Set([line]);
  let now = line;
  for (;;) {
    const refused = await check(now);
    if (!refused) return {line: now, why: null};
    const next = (refused.suggestions ?? []).find(
      x => isRepair(x.name) && !tried.has(x.name),
    );
    if (!next)
      return {
        line: now,
        why: refused.message.replace(/\s*Nothing was changed\.$/, ''),
      };
    now = next.name;
    tried.add(now);
  }
}
