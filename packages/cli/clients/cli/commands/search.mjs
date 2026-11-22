// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file search command — unified ranked search with a stable result summary.
 *
 * One "I'm looking for X" entry point spanning components, hooks, docs topics,
 * templates (page + block), and themes. Results are ranked by relevance and
 * tagged with their domain, with a follow-up command so the user knows what to
 * run next.
 *
 * The command surface (description, args, flags) is sourced from the colocated
 * `search.doc.mjs` CommandDoc via `defineCommand`; this file supplies only the
 * action (parse flags -> call the api function -> render).
 *
 * Usage:
 *   astryx search button                 Ranked results across all domains
 *   astryx search dark mode              Every word is part of the query
 *   astryx search modal --type component Filter to a single domain
 *   astryx search forms --limit 5        Cap the result count
 *   astryx search button --verbose       Also print score / reason, whole descriptions
 *   astryx search button --json          Typed JSON envelope
 *
 * A query that asks for an icon also lists the installed icons that answer
 * it, last.
 */

import {
  getCliInvocation,
  formatCliCommand,
} from '../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {resultSetOf} from '../../../foundation/debug/index.mjs';
import {
  docText,
  emit,
  formatDeprecation,
  section,
  text,
  records,
} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {markNotReady} from '../lib/not-ready.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {search as searchApi} from '../../../api/search/search.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {firstSentence} from '../../../foundation/text/string-utils.mjs';
import {warnOnIntegrationIssues} from '../../../foundation/integrations/integration-warnings.mjs';
import {doc as searchCommand} from './search.doc.mjs';
import {doc as searchFn} from '../../../api/search/search.doc.mjs';

/**
 * @param {import('commander').Command} program
 */
export function registerSearch(program) {
  defineCommand(program, searchCommand, {
    fn: searchFn,
    action: async (
      /** @type {string[] | string} */ words,
      /** @type {{type?: import('../../../api/search/search.type.mjs').SearchDomain, limit?: string, verbose?: boolean}} */ options,
    ) => {
      const json = program.opts().json || false;
      // The query is variadic: `astryx search dark mode` is one query, "dark
      // mode". Taking only the first word dropped the rest without a word.
      const query = Array.isArray(words) ? words.join(' ') : words;

      try {
        const project = await Project.load(process.cwd());
        await warnOnIntegrationIssues(project, {json});
      } catch {
        // Never let the nudge break the command.
      }

      // Number(), not parseInt(): parseInt truncates `1.5` and `5abc` into
      // integers the API would reject. The API validates the value, so the
      // flag and `search({limit})` accept and refuse the same inputs.
      const limit = options.limit != null ? Number(options.limit) : 20;

      /** @type {import('../../../api/search/search.type.mjs').SearchResponse} */
      let result;
      try {
        result =
          /** @type {import('../../../api/search/search.type.mjs').SearchResponse} */ (
            await searchApi(query, {
              cwd: process.cwd(),
              type: options.type,
              limit,
            })
          );
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions,
          code: err.code,
        });
      }

      // The reported count is the number of MATCHES, not the number that
      // survived `--limit`. Reporting `results.length` would file the cap as
      // the answer, so "20 matches" and "200 matches, showing 20" would be the
      // same row in every usage query. The delivered payload stays bounded.
      const answered = resultSetOf(result.data.results, {
        count: result.data.matchCount,
        empty: result.data.matchCount === 0,
        // Nothing matched, so the results cannot say what was searched for —
        // the `--type` filter can, and an open search really did span them all.
        fallbackKind: options.type ?? 'mixed',
      });

      if (json) {
        jsonOut(result);
        return answered;
      }

      // ── Text output ──────────────────────────────────────────────
      const run = getCliInvocation();
      const addable = () => discoverAnswers(query, options.type);
      const {query: q, matchCount, results} = result.data;
      // When Core could not be had, an open search covers the rest alone. Say
      // so, on standard error and in the output, so the list does not read as
      // "Astryx has no such component".
      const partial = result.meta?.partial;
      if (partial) {
        console.error(
          `astryx: components, hooks, and templates were not searched: ${partial.reason}`,
        );
      }
      const note = partial
        ? [
            text(
              'Components, hooks, and templates need @astryxdesign/core, which could not be found (see the line above), so only the docs and themes were searched.',
            ),
          ]
        : [];

      const icons = iconBlock(result.data.icons);

      // No matches is a valid, successful outcome — clean message, exit 0.
      if (results.length === 0) {
        emit(
          text(`No results for "${q}".`),
          ...note,
          text(
            `Try a broader term, or browse: ${run} ${note.length > 0 ? 'docs' : 'component --list'}`,
          ),
          ...discoverHint(run, q, options.type, await addable()),
          ...icons,
        );
        return answered;
      }

      // The text view is just a projection of the JSON: one record per result,
      // fields in a fixed order (missing ones skipped), command prefixed for the
      // caller's package manager. Ranked order is preserved (best match first).
      const fields = options.verbose
        ? [
            'name',
            'section',
            'domain',
            'package',
            'title',
            'displayName',
            'kind',
            'deprecated',
            'score',
            'reason',
            'import',
            'description',
            'command',
            'parent',
          ]
        : [
            'name',
            'section',
            'domain',
            'package',
            'title',
            'displayName',
            'kind',
            'deprecated',
            'import',
            'description',
            'command',
            'parent',
          ];

      // The heading mirrors the JSON: `matchCount` is what matched, and the
      // records below are the slice `--limit` allowed. Saying only "(20)" when
      // 57 matched reads as "that is all there is".
      emit(
        section(
          matchCount > results.length
            ? `Results for "${q}" (${results.length} of ${matchCount})`
            : `Results for "${q}" (${results.length})`,
        ),
        records(results.map(withNotReadyKind), {
          fields,
          format: {
            command: formatCliCommand,
            parent: formatCliCommand,
            deprecated: formatDeprecation,
            // The text view keeps a description's first sentence. A
            // component, hook or doc result's command prints the whole doc;
            // --verbose and --json keep the description whole.
            description: (/** @type {string} */ value) =>
              docText(options.verbose ? value : firstSentence(value)),
          },
        }),
        ...note,
        ...discoverHint(run, q, options.type, await addable()),
        ...icons,
      );
      return answered;
    },
  });
}

/**
 * The icon section's text: one line per icon, its id, set and import line.
 * The set reads as the entry's `name` names it, so a set two packages ship
 * shows its package (`@acme/glyphs/glyphs`). The JSON has the score, reason
 * and command.
 * @param {import('../../../api/search/search.type.mjs').SearchIconSection | undefined} icons
 */
function iconBlock(icons) {
  if (!icons) return [];
  const {matchCount, results} = icons;
  return [
    section(
      matchCount > results.length
        ? `Icons (${results.length} of ${matchCount})`
        : `Icons (${results.length})`,
      results
        .map(
          icon =>
            `${icon.id} (${icon.name.slice(0, -icon.id.length - 1)}): ${icon.import}`,
        )
        .join('\n'),
    ),
  ];
}

/**
 * The text view of a result: an unready template's kind reads
 * `page (not ready)`. The JSON carries the same fact as `isReady: false`.
 * @param {import('../../../api/search/search.type.mjs').SearchResultEntry} result
 */
function withNotReadyKind(result) {
  return result.isReady === false
    ? {...result, kind: markNotReady(String(result.kind), false)}
    : result;
}

/**
 * Whether `astryx discover <query>` would list a match, read from the saved
 * copies of the discover catalogs, or null when that is not known. No
 * discover source is called. Never throws.
 * @param {string} query
 * @param {string | undefined} type
 * @returns {Promise<boolean | null>}
 */
async function discoverAnswers(query, type) {
  if (type === 'hook') return null;
  try {
    const discover = await import('../../../api/discover/discover.mjs');
    return await discover.wouldAnswer(query, {type});
  } catch {
    return null;
  }
}

/**
 * Search reads only what is installed. Point at `discover` for the packages
 * that could add more, except for hooks, which no integration adds. When the
 * saved copies of the discover catalogs say discover would list no match,
 * the line is left out.
 * @param {string} run - The caller's CLI invocation prefix.
 * @param {string} query
 * @param {string | undefined} type
 * @param {boolean | null} addable - {@link discoverAnswers}
 */
function discoverHint(run, query, type, addable) {
  if (type === 'hook' || addable === false) return [];
  // A search kept to one kind points at discover kept to the same kind,
  // which is what the saved copies were checked for.
  const kind = type ? ` --type ${type}` : '';
  return [
    text(
      `More in packages you could add: ${run} discover ${shellWord(query)}${kind}`,
    ),
  ];
}

/**
 * One shell word: the value itself when it is plain, else single-quoted.
 * @param {string} value
 */
function shellWord(value) {
  return /^[\w@./:-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, `'\\''`)}'`;
}

// Re-export the API for external consumers.
export {search, SEARCH_DOMAINS} from '../../../api/search/search.mjs';
