// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a command answered with — the one shape every command returns.
 *
 * ## Why a return type and not a call
 *
 * Reporting a result used to be something a command opted INTO: it called
 * `recordResultSummary(...)` on its way out, or it didn't, and nothing noticed
 * the difference. Two commands did; the rest reported nothing, and a run log
 * full of nulls cannot tell "this command has no results" from "this command
 * forgot". A new command inherited the silence by default.
 *
 * So the descriptor is the command's RETURN VALUE. `defineCommand` types every
 * action as returning a {@link CommandResult}, which makes the compiler ask the
 * question: a new command does not typecheck until each of its exits says what
 * it answered with. The converter records it centrally — one place stamps the
 * run log — so no command has to remember anything at all.
 *
 * ## Why a union rather than optional fields
 *
 * `none` is a declaration, not an absence. `astryx theme build` has nothing to
 * count, and writing that down is a visible choice a reviewer can question;
 * leaving a field off is not. Only `results` carries a count, so a command
 * cannot half-report — and a null `resultKind` on a completed run now means
 * exactly one thing: nobody reported, which is a bug rather than a shrug.
 *
 * @input a command action's return value
 * @output a result descriptor the recorder stamps onto the run's event
 * @position packages/cli/foundation/debug — the command-to-recorder contract
 */

/**
 * The kinds a result SET can carry — every {@link DebugResultKind} except
 * `none`, which is the other branch of the union and never labels a set.
 *
 * @typedef {Exclude<import('../../authoring/debug/type').DebugResultKind, 'none'>} ResultSetKind
 */

/**
 * A command that answered by looking something up.
 *
 * @typedef {object} CommandResultSet
 * @property {'results'} kind
 * @property {number} count How many results MATCHED, counted before `--limit`,
 *   score floors, or presentation grouping. Not the size of the slice that was
 *   printed: recording the cap would make "matched 20" and "matched 200, showed
 *   20" the same row in every query anyone writes.
 * @property {ResultSetKind} resultKind What the results are. Derive it from the
 *   results themselves (see {@link resultSetOf}) when a command spans domains.
 * @property {boolean} [empty] Whether the underlying match set was empty.
 *   Defaults to `count === 0`; pass it only when the command's own notion of
 *   "found nothing" differs from a zero count.
 * @property {boolean} [directMatch] Whether the command resolved the exact
 *   thing that was asked for, rather than listing or suggesting. Omit it for a
 *   command that defines no such notion — a bare list has nothing to match.
 */

/**
 * A command whose work is an effect: it builds, writes, upgrades, validates, or
 * diagnoses. There is no set to count, and saying so is the point.
 *
 * @typedef {object} CommandNoResultSet
 * @property {'none'} kind
 */

/**
 * What every command action returns.
 * @typedef {CommandResultSet | CommandNoResultSet} CommandResult
 */

/**
 * The declaration for a command that answers with an effect rather than a
 * result set. Frozen and shared — it carries no per-run state.
 *
 * @type {CommandNoResultSet}
 */
export const NO_RESULT_SET = Object.freeze({kind: 'none'});

/**
 * Declare a result set.
 *
 * @param {object} summary
 * @param {number} summary.count Matches before any limit — see {@link CommandResultSet}.
 * @param {ResultSetKind} summary.resultKind
 * @param {boolean} [summary.empty]
 * @param {boolean} [summary.directMatch]
 * @returns {CommandResultSet}
 */
export function resultSet({count, resultKind, empty, directMatch}) {
  /** @type {CommandResultSet} */
  const set = {kind: 'results', count, resultKind};
  if (typeof empty === 'boolean') set.empty = empty;
  if (typeof directMatch === 'boolean') set.directMatch = directMatch;
  return set;
}

/** The result kinds a surfaced item may tag itself with, via its `domain`. */
const ITEM_KINDS = new Set(['component', 'template', 'doc', 'hook']);

/**
 * Declare a result set whose kind comes from the results themselves — for the
 * commands that answer across domains (`search`, `build`).
 *
 * The items are only trusted to name the kind when they ARE the whole match
 * set. A bounded slice is not the answer: `search button --limit 1` surfaces
 * one component out of 240 mixed matches, and reading the kind off that slice
 * would file the same query under a different kind at every `--limit` — the
 * same lie about a cap that `count` refuses to tell.
 *
 * So a partial or empty answer falls back to what the run was looking FOR: the
 * `--type` filter when one was given, `mixed` when the search was open. "Asked
 * for components, found none" is a fact worth keeping, and "asked across
 * everything, showed the top 20" is honestly mixed.
 *
 * @param {ReadonlyArray<{domain?: unknown}>} items The surfaced results.
 * @param {object} summary
 * @param {number} summary.count The total matched, before any cap.
 * @param {ResultSetKind} summary.fallbackKind What the run was looking for —
 *   used whenever the items cannot speak for the whole set.
 * @param {boolean} [summary.empty]
 * @param {boolean} [summary.directMatch]
 * @returns {CommandResultSet}
 */
export function resultSetOf(items, {count, fallbackKind, empty, directMatch}) {
  const surfaced = Array.isArray(items) ? items : [];
  const kinds = new Set(
    surfaced
      .map(item => item?.domain)
      .filter(kind => typeof kind === 'string' && ITEM_KINDS.has(kind)),
  );
  const whole = surfaced.length >= count;
  const resultKind =
    !whole || kinds.size === 0
      ? fallbackKind
      : kinds.size === 1
        ? /** @type {ResultSetKind} */ (kinds.values().next().value)
        : 'mixed';
  return resultSet({count, resultKind, empty, directMatch});
}
