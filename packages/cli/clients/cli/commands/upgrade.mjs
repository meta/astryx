// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file upgrade command — thin wrapper around api/upgrade.
 *
 * `astryx upgrade` runs codemods that migrate source between Astryx versions and
 * refreshes the managed agent-docs block. All logic lives in api/upgrade; this
 * handler only parses flags, wires the progress logger (term output in human
 * mode, silent in --json), and renders the result / exit code.
 *
 * Consumers bump/install their Astryx packages first, then run:
 *   astryx upgrade --from <old-version> --path <source-dir> --apply
 */

import {jsonOut, jsonError} from '../../../foundation/response/json.mjs';
import {emit, section, records} from '../formatters/index.mjs';
import {logger} from '../../../api/logger.mjs';
import {AstryxError} from '../../../api/error.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {upgrade as upgradeApi} from '../../../api/upgrade/upgrade.mjs';
import {doc as upgradeCommand} from './upgrade.doc.mjs';
import {doc as upgradeFn} from '../../../api/upgrade/upgrade.doc.mjs';
import {NO_RESULT_SET, resultSet} from '../../../foundation/debug/index.mjs';

/**
 * The codemod list as text: a heading that says how many codemods there are
 * and names their package when they share one, then each version with one
 * line per codemod, its name and title, and `(optional)` on a codemod that
 * runs only on request. When codemods come from more than one package, every
 * line names its package.
 * @param {import('../../../api/upgrade/upgrade.type.mjs').UpgradeListResponse['data']} codemods
 * @returns {import('../formatters/index.mjs').Block[]}
 */
function codemodListBlocks(codemods) {
  const packages = new Set(codemods.map(c => c.package));
  const shared = packages.size === 1 ? [...packages][0] : null;
  /** @type {Map<string, typeof codemods>} */
  const byVersion = new Map();
  for (const c of codemods) {
    byVersion.set(c.version, [...(byVersion.get(c.version) ?? []), c]);
  }
  const count = `${codemods.length} codemod${codemods.length === 1 ? '' : 's'}`;
  return [
    section(
      'Available codemods',
      `${count}${shared ? ` from ${shared}` : ''}, oldest first`,
    ),
    ...[...byVersion].flatMap(([version, group]) => [
      section(version),
      records(
        group.map(c => ({
          name: c.name,
          title: c.title,
          optional: c.optional ? '(optional)' : undefined,
          package: shared ? undefined : c.package,
        })),
        {fields: ['name', 'title', 'optional', 'package'], layout: 'inline'},
      ),
    ]),
  ];
}

/**
 * @param {import('commander').Command} program
 */
export function registerUpgrade(program) {
  const cmd = defineCommand(program, upgradeCommand, {
    fn: upgradeFn,
    action:
      /**
       * @param {import('../../../api/upgrade/upgrade.mjs').UpgradeOptions} options
       * @param {import('commander').Command} command
       */
      async (options, command) => {
        const json = program.opts().json || false;
        const isList = Boolean(options.list);
        // Silence the logger for --list so the handler renders from the
        // result (parity with --json), and for --json as before.
        // Re-enable on error so handled failures still print.
        logger.setSilent(json || isList);

        /** @type {import('../../../api/upgrade/upgrade.type.mjs').UpgradeListResponse | import('../../../api/upgrade/upgrade.type.mjs').UpgradeRegistryResponse | import('../../../api/upgrade/upgrade.type.mjs').UpgradeStatusResponse | import('../../../api/upgrade/upgrade.type.mjs').UpgradeRunResponse} */
        let result;
        // `--path` shows its default in help, but a path nobody typed is the
        // project's src, not one read from this folder: leave it unset.
        const apiOptions =
          command.getOptionValueSource('path') === 'default'
            ? {...options, path: undefined}
            : options;
        try {
          result = await upgradeApi(apiOptions, {cwd: process.cwd()});
        } catch (e) {
          // Re-enable the logger so the error is visible in text mode.
          // For --list the logger was silent; for other modes the API
          // already printed the error before throwing.
          logger.setSilent(json);
          if (e instanceof AstryxError) {
            if (json) {
              // A failed migration still names the files it already changed.
              jsonError(
                e.message,
                undefined,
                e.code,
                /** @type {any} */ (e).receipt,
              );
            } else {
              // The logger was silent only for --list; replay the error there.
              // Non-list failures were already printed by the API.
              if (isList) logger.error(e.message);
              process.exitCode = 1;
            }
            return NO_RESULT_SET;
          }
          throw e;
        }

        if (json) jsonOut(result);
        else if (result.type === 'upgrade.list') {
          // Render the list from the result, not the API logger, so the text
          // carries the same fields the JSON does. One line per codemod under
          // its version: the list gains a line per codemod each release, not a
          // five-line record.
          emit(...codemodListBlocks(result.data));
        }

        const registrySummary =
          result.type === 'upgrade.registry'
            ? result.data
            : result.type === 'upgrade.run'
              ? result.data.registryCompositions
              : result.type === 'upgrade.status' &&
                  'registryCompositions' in result.data
                ? result.data.registryCompositions
                : undefined;
        if (registrySummary && !registrySummary.ok) process.exitCode = 1;
        if (result.type === 'upgrade.run' && result.data.complete === false) {
          process.exitCode = 1;
        }

        // `--list` is the one lookup here: which migrations exist for the
        // range. Everything else migrates the project — an effect, reported by
        // the receipt rather than counted.
        return result.type === 'upgrade.list'
          ? resultSet({count: result.data.length, resultKind: 'migration'})
          : NO_RESULT_SET;
      },
  });

  // `--integration` is a repeatable value flag: multiple flags accumulate into
  // the string[] the API expects. defineCommand builds a plain value option
  // (its [] default comes from the doc), so restore the collector coercion that
  // the previous inline `.option(..., fn, [])` supplied. Help output is
  // unaffected — only parse-time value assembly.
  const integration = cmd.options.find(o => o.long === '--integration');
  if (integration) {
    integration.argParser(
      /** @param {string} value @param {string[]} previous */
      (value, previous) => [...(previous ?? []), value],
    );
  }
}
