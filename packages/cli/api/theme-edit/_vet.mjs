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
import {allowedLine} from './_normal.mjs';
import {P} from './_tables.mjs';
import {readSetLine, splitCommand} from './_set-line.mjs';

export {readSetLine, splitCommand};

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
  /** The refusal set gives a line, or null when it takes it. @param {string} name */
  const refusal = name => {
    const line = readSetLine(name, slug);
    if (!line) return null;
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
      return null;
    } catch (err) {
      if (err instanceof AstryxError) return err;
      throw err;
    }
  };
  // A refused line is followed through each repair its refusal offers that
  // passes the one gate (every case fix of one line in one pass: a part
  // and its variant), and offered as the line that works; a line its own
  // refusal offers again after a step (an install) works once that step
  // is done.
  /** @type {typeof list} */
  const kept = [];
  for (const s of list) {
    if (!readSetLine(s.name, slug)) {
      kept.push(s);
      continue;
    }
    const tried = new Set([s.name]);
    let now = s.name;
    for (;;) {
      const err = refusal(now);
      if (!err) {
        if (!kept.some(k => k.name === now)) kept.push({...s, name: now});
        break;
      }
      if ((err.suggestions ?? []).some(x => x.name === now)) {
        kept.push({...s, name: now});
        break;
      }
      const next = (err.suggestions ?? []).find(
        x => !tried.has(x.name) && repairGate('set', slug, s.name, x.name),
      );
      if (!next) break;
      now = next.name;
      tried.add(now);
    }
  }
  if (
    kept.length === list.length &&
    kept.every((k, i) => k.name === list[i].name)
  )
    return e;
  e.suggestions = kept.length
    ? kept
    : [{name: `${P} set --help`, reason: 'see what set takes'}];
  return e;
}

/**
 * Whether a line a refusal offers is a repair of the line refused, by the
 * one input gate: the same command and theme, no scope that was not typed
 * (never a stock part), and a value in place of the one typed only as an
 * exact reading of it.
 * @param {'set' | 'undo'} sub
 * @param {string} slug
 * @param {string} line the line refused
 * @param {string} name the line offered
 */
export function repairGate(sub, slug, line, name) {
  if (!name.startsWith(`${P} ${sub} ${slug} `)) return false;
  const toSet = (/** @type {string} */ l) =>
    sub === 'undo' ? l.replace(`${P} undo `, `${P} set `) : l;
  const was = readSetLine(toSet(line), slug);
  const next = readSetLine(toSet(name), slug);
  if (!was || !next) return true;
  const scopes = /** @type {const} */ (['on', 'when', 'state', 'mode']);
  if (scopes.some(k => next.flags[k] != null && was.flags[k] == null))
    return false;
  return (
    sub === 'undo' ||
    next.value === was.value ||
    allowedLine({offered: next.value, typed: was.value, thing: next.thing})
  );
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
 * @returns {Promise<{line: string, why: string | null, next?: import("../../foundation/response/base").Suggestion[]}>}
 *   `next`: the commands the last refusal offers (an install before the line, a look at the theme)
 */
export async function followLine(line, check, isRepair) {
  const tried = new Set([line]);
  let now = line;
  for (;;) {
    const refused = await check(now);
    if (!refused) return {line: now, why: null};
    // A refusal that offers the line itself after another step (an
    // install) says the line works once that is done: no other line is
    // followed in its place.
    const again = (refused.suggestions ?? []).some(x => x.name === now);
    const next = again
      ? undefined
      : (refused.suggestions ?? []).find(
          x => isRepair(x.name) && !tried.has(x.name),
        );
    if (!next)
      return {
        line: now,
        why: refused.message.replace(/\s*Nothing was changed\.$/, ''),
        next: refused.suggestions ?? [],
      };
    now = next.name;
    tried.add(now);
  }
}
