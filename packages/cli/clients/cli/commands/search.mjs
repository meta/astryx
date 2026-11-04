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
 *   astryx search button --verbose       Also print score / reason
 *   astryx search button --json          Typed JSON envelope
 */

import {
  getCliInvocation,
  formatCliCommand,
} from '../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {resultSetOf} from '../../../foundation/debug/index.mjs';
import {emit, section, text, records} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {search as searchApi} from '../../../api/search/search.mjs';
import {Project} from '../../../foundation/config/project.mjs';
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

      // No matches is a valid, successful outcome — clean message, exit 0.
      if (results.length === 0) {
        emit(
          text(`No results for "${q}".`),
          ...note,
          text(
            `Try a broader term, or browse: ${run} ${note.length > 0 ? 'docs' : 'component --list'}`,
          ),
          ...discoverHint(run, q, options.type),
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
        records(results, {
          fields,
          format: {command: formatCliCommand, parent: formatCliCommand},
        }),
        ...note,
        ...discoverHint(run, q, options.type),
      );
      return answered;
    },
  });
}

/**
 * Search reads only what is installed. Point at `discover` for the packages
 * that could add more, except for hooks, which no integration adds.
 * @param {string} run - The caller's CLI invocation prefix.
 * @param {string} query
 * @param {string | undefined} type
 */
function discoverHint(run, query, type) {
  if (type === 'hook') return [];
  return [
    text(`More in packages you could add: ${run} discover ${shellWord(query)}`),
  ];
}

/**
 * One shell word: the value itself when it is plain, else single-quoted.
 * @param {string} value
 */
function shellWord(value) {
  return /^[\w@./:-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

// Re-export the API for external consumers.
export {search, SEARCH_DOMAINS} from '../../../api/search/search.mjs';
