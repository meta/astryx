// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build command — thin wrapper with a stable result summary.
 *
 *   astryx build                  → the PLAYBOOK (how to build a page)
 *   astryx build "<what>"         → the TEMPLATE to start from (always one: the
 *                                   closest page, or the app shell), other
 *                                   templates, then blocks and components.
 *
 * All grouping/scoring lives in api/build; this file only parses flags and
 * renders. Command strings are prefixed for the caller's package manager here
 * (never in the API payload) via formatCliCommand/getCliInvocation.
 */

import {
  getCliInvocation,
  formatCliCommand,
} from '../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {resultSet, resultSetOf} from '../../../foundation/debug/index.mjs';
import {
  emit,
  section,
  text,
  list,
  record,
  records,
} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {firstSentence} from '../../../foundation/text/string-utils.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {build as buildApi} from '../../../api/build/build.mjs';
import {doc as buildCommand} from './build.doc.mjs';
import {doc as buildFn} from '../../../api/build/build.doc.mjs';

/**
 * Playbook commands as records whose field names are the JSON keys, so a
 * reader can grep `^command:`. The command is run with the caller's invocation.
 * @type {import('../formatters/index.mjs').RecordOptions}
 */
const COMMAND_RECORDS = {
  fields: ['command', 'purpose'],
  format: {command: command => formatCliCommand(command)},
};

/**
 * Emit the build playbook (shown when `build` is run with no query) — a
 * projection of the `build.help` data, so text and JSON carry the same steps.
 * @param {import('../../../api/build/build.type.mjs').BuildHelpResponse['data']} playbook
 */
function printPlaybook(playbook) {
  emit(
    section(playbook.title),
    ...playbook.steps.flatMap((step, i) => [
      section(`${i + 1}. ${step.title}`),
      records(step.commands, COMMAND_RECORDS),
      step.returns ? record({returns: step.returns}) : null,
    ]),
    section(`${playbook.steps.length + 1}. Rules (keep it on-system)`),
    list(playbook.rules),
    ...(playbook.related.length > 0
      ? [section('Related'), records(playbook.related, COMMAND_RECORDS)]
      : []),
  );
}

/**
 * @param {import('commander').Command} program
 */
export function registerBuild(program) {
  defineCommand(program, buildCommand, {
    fn: buildFn,
    action: async (
      /** @type {string | undefined} */ query,
      /** @type {{type?: import('../../../api/search/search.type.mjs').SearchDomain, limit?: string, verbose?: boolean}} */ options,
    ) => {
      const run = getCliInvocation();
      const json = program.opts().json || false;

      // No query → the playbook. Still routed through the API for the envelope.
      if (!query || !String(query).trim()) {
        const result =
          /** @type {import('../../../api/build/build.type.mjs').BuildHelpResponse} */ (
            await buildApi(undefined, {cwd: process.cwd()})
          );
        // The playbook is a document, not a lookup: one doc, always the same
        // one. Counting it as a result keeps "what did this run answer with"
        // true for the no-argument form too.
        const playbook = resultSet({count: 1, resultKind: 'doc'});
        if (json) {
          jsonOut(result);
          return playbook;
        }
        printPlaybook(result.data);
        return playbook;
      }

      // Arg validation stays in the CLI.
      // Parse --limit to a number; the API validates it (positive integer) and
      // throws ERR_INVALID_ARGUMENT, so we pass NaN through rather than
      // pre-rejecting with a generic code here (parity with `search`).
      const limit =
        options.limit != null ? Number(options.limit) : 60;

      /** @type {import('../../../api/build/build.type.mjs').BuildKitResponse} */
      let result;
      try {
        result =
          /** @type {import('../../../api/build/build.type.mjs').BuildKitResponse} */ (
            await buildApi(query, {
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

      const {
        query: q,
        hasResults,
        matchCount,
        directMatch,
        start,
        pages,
        blocks,
        domain,
        frame,
        foundation,
        hint,
      } = result.data;
      // The kit spans domains, so its kind comes from the pieces themselves.
      // `start` (which may be the fallback shell), `frame` and `foundation`
      // are deliberately excluded: they are not what the query matched.
      const answered = resultSetOf([...pages, ...blocks, ...domain], {
        count: matchCount,
        empty: !hasResults,
        directMatch,
        fallbackKind: options.type ?? 'mixed',
      });

      if (json) {
        jsonOut(result);
        return answered;
      }

      if (!hasResults && !start) {
        emit(
          text(`No matches for "${q}".`),
          text(`Try a broader term, or browse: ${run} component --list`),
        );
        return answered;
      }

      // Four sections, one job each: the TEMPLATE to scaffold, OTHER
      // TEMPLATES if its layout is wrong, BLOCKS for parts it lacks, and
      // COMPONENTS for the rest. Descriptions stop at their first sentence and
      // blocks and components share one command line in their heading; the
      // JSON and --verbose carry everything.
      const verbose = Boolean(options.verbose);
      /** @type {import('../formatters/index.mjs').RecordOptions} */
      const full = {
        fields: [
          'name',
          'package',
          'domain',
          'displayName',
          'score',
          'reason',
          'import',
          'description',
          'command',
        ],
        format: {command: formatCliCommand},
      };
      /** @param {string[]} fields */
      const brief = fields => ({
        fields,
        format: {command: formatCliCommand, description: firstSentence},
      });
      // Blocks and components are extras: the text names the top few, and
      // says how many more the JSON and --verbose carry.
      const TOP = 3;
      /** @param {unknown[]} items */
      const shown = items => (verbose ? items : items.slice(0, TOP));
      /** @param {unknown[]} items */
      const more = items =>
        !verbose && items.length > TOP
          ? ` (top ${TOP} of ${items.length}; --verbose for all)`
          : '';

      /** @type {import('../formatters/index.mjs').Block[]} */
      const out = [
        section(`Build kit for "${q}"`),
        text(
          start
            ? 'Start from the TEMPLATE, fill it with BLOCKS, and use COMPONENTS only for what is left.\n' +
                'Changing a page you already have? Keep it, and use only the blocks and components.'
            : 'This kit is narrowed by --type, so it names no template.',
        ),
      ];

      if (start) {
        out.push(
          section(
            'TEMPLATE',
            `${start.reason} ${
              start.basis === 'fallback'
                ? 'Scaffold it, then put blocks inside it.'
                : 'Scaffold it, then replace its content. Keep its layout and spacing.'
            }`,
          ),
          record(
            start,
            verbose
              ? {
                  fields: ['name', 'package', 'displayName', 'description', 'command'],
                  format: {command: formatCliCommand},
                }
              : brief(['name', 'package', 'description', 'command']),
          ),
          ...(start.notes ?? []).map(note => text(note)),
        );
        if (start.alternatives.length) {
          out.push(
            section(
              'OTHER TEMPLATES',
              `If the layout is wrong, scaffold one of these instead. All page templates: ${formatCliCommand('template --list --type page')}`,
            ),
            records(
              start.alternatives,
              verbose ? full : brief(['name', 'package', 'description', 'command']),
            ),
          );
        }
      }
      // Search's own page matches, so the text carries every field the JSON
      // does: one line by default, the full entries under --verbose.
      if (pages.length) {
        out.push(
          verbose
            ? section(
                'SEARCH MATCHES',
                'Page templates keyword search matched, best first.',
              )
            : text(
                `Keyword search matched these page templates: ${pages.map(p => `${p.name} (${p.package})`).join(', ')}.`,
              ),
        );
        if (verbose) out.push(records(pages, full));
      }
      if (blocks.length) {
        out.push(
          section(
            'BLOCKS',
            `Ready-made sections for parts the template lacks${more(blocks)}. Print one: ${formatCliCommand('template <name>')}`,
          ),
          records(
            shown(blocks),
            verbose ? full : brief(['name', 'package', 'description']),
          ),
        );
      }
      out.push(
        section(
          'COMPONENTS',
          `For what the template and blocks do not cover${more(domain)}. Read one: ${formatCliCommand('component <name>')}`,
        ),
        ...(domain.length
          ? [
              records(
                shown(domain),
                verbose ? full : brief(['name', 'package', 'description']),
              ),
            ]
          : []),
        record({frame, foundation}),
      );

      // Last, so it is the line the reader leaves with — and only when the kit
      // was thin enough that "the package has nothing" is the wrong conclusion.
      // The commands arrive bare and are rendered through the project's own
      // invocation, so they are runnable as printed.
      if (hint) {
        out.push(
          section(
            'FEW MATCHES',
            `${hint.reason}\nBrowse instead:\n${hint.commands
              .map(c => formatCliCommand(c))
              .join('\n')}`,
          ),
        );
      }

      emit(...out);
      return answered;
    },
  });
}
