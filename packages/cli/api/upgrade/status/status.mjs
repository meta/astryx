// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file upgrade.status leaf — the short-circuit results of the upgrade pipeline.
 *
 * Three status variants, each a projection of state the `run` leaf has already
 * resolved (via `_adapter.mjs`) at the point it decides not to run codemods:
 *   - `up_to_date`     — `--from` is >= the installed target and no `--force`.
 *   - `no_codemods`    — no core/integration codemods apply to the range.
 *   - `config_fixable` — DRY-RUN only: the config fails strict validation but a
 *     pending core CONFIG codemod would repair it; preview the fix, don't write.
 *
 * `no_codemods` and `config_fixable` also carry `cliBehindCore` when the
 * installed Core is newer than this CLI: the run cannot finish the upgrade, so
 * neither says it is done, and `logCliBehindCore` names the command that can.
 *
 * These builders own the exact human progress lines for their path (emitted via
 * the shared `logger`) and return the `upgrade.status` envelope; the caller
 * just returns what they hand back.
 */

import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';
import {logger} from '../../logger.mjs';

/**
 * `--from` is at/after the installed target (and no `--force`): nothing to run.
 * @param {{from: string, to: string, agentDocs: import('../upgrade.type.mjs').AgentDocsSummary, registryCompositions?: import('../upgrade.type.mjs').RegistryCompositionSummary}} data
 * @returns {import('../upgrade.type.mjs').UpgradeStatusResponse}
 */
export function statusUpToDate({from, to, agentDocs, registryCompositions}) {
  logger.log('[ok] Already up to date - no codemods to run.');
  logger.log('Use --force to run codemods anyway.');
  logger.log(registryCompositions?.ok === false ? 'Finished with unresolved registry items\n' : 'Done\n');
  return {
    type: 'upgrade.status',
    data: {
      status: 'up_to_date',
      from,
      to,
      agentDocs,
      ...(registryCompositions ? {registryCompositions} : {}),
    },
  };
}

/**
 * The one warning for a CLI older than the installed Core: it has no codemods
 * for the releases after its own version, and the pinned command does. The
 * command gets a line of its own, so it copies exactly, whatever quotes or
 * backticks its arguments carry. On Windows it is written for PowerShell, and
 * the warning says so.
 * @param {import('../upgrade.type.mjs').CliBehindCore} cliBehindCore
 * @param {string} to the installed Core version
 * @param {string} [platform] the `process.platform` the command was printed
 *   for, as `quoteCommandArgument` and `commandInFolder` take it
 */
export function logCliBehindCore({cliVersion, command}, to, platform = process.platform) {
  const shell = platform === 'win32' ? ' in PowerShell' : '';
  logger.warn(
    `This CLI (${cliVersion}) is older than the installed @astryxdesign/core (${to}): ` +
      `it has no codemods for releases after ${cliVersion}, so it cannot finish this upgrade. ` +
      `Run it${shell} with the CLI that matches your Core:`,
  );
  logger.warn(`  ${command}`);
}

/**
 * No core or integration codemods apply to the requested version range. When
 * the CLI is older than the installed Core, that only means this CLI has none:
 * the result carries `cliBehindCore` and the human lines say so.
 * @param {{from: string, to: string, agentDocs: import('../upgrade.type.mjs').AgentDocsSummary, registryCompositions?: import('../upgrade.type.mjs').RegistryCompositionSummary, cliBehindCore?: import('../upgrade.type.mjs').CliBehindCore | null}} data
 * @returns {import('../upgrade.type.mjs').UpgradeStatusResponse}
 */
export function statusNoCodemods({from, to, agentDocs, registryCompositions, cliBehindCore}) {
  if (cliBehindCore) logCliBehindCore(cliBehindCore, to);
  else logger.log('[ok] No codemods available for this version range.');
  logger.log(
    registryCompositions?.ok === false
      ? 'Finished with unresolved registry items\n'
      : cliBehindCore
        ? 'Upgrade incomplete\n'
        : 'Done\n',
  );
  return {
    type: 'upgrade.status',
    data: {
      status: 'no_codemods',
      from,
      to,
      agentDocs,
      ...(registryCompositions ? {registryCompositions} : {}),
      ...(cliBehindCore ? {cliBehindCore} : {}),
    },
  };
}

/**
 * DRY-RUN only: the consumer's astryx.config fails strict validation, but a
 * pending core CONFIG codemod previewed a change that would repair it. Preview
 * the fix + report the exact `--apply` command; integrations are skipped here.
 * @param {{from: string, to: string, configError: string, configCodemods: string[], agentDocs: import('../upgrade.type.mjs').AgentDocsSummary, cliBehindCore?: import('../upgrade.type.mjs').CliBehindCore | null}} data
 * @returns {import('../upgrade.type.mjs').UpgradeStatusResponse}
 */
export function statusConfigFixable({from, to, configError, configCodemods, agentDocs, cliBehindCore}) {
  const codemodFlags = configCodemods.map(name => `--codemod ${name}`).join(' ');
  const suggestedCommand = `astryx upgrade --from ${from} ${codemodFlags} --apply`;
  const guidance =
    'Your astryx.config currently fails strict validation, but a pending ' +
    'config codemod would repair it. This dry run previewed the fix without ' +
    'writing. Re-run with --apply to apply it, or run just the config codemod(s) ' +
    'now:';
  logger.warn(guidance);
  logger.log(`  ${formatCliCommand(suggestedCommand)}`);
  logger.log('Integrations are skipped in this preview; they will be processed on the --apply run.');
  if (cliBehindCore) logCliBehindCore(cliBehindCore, to);
  logger.log(cliBehindCore ? 'Upgrade incomplete\n' : 'Dry run complete\n');
  return {
    type: 'upgrade.status',
    data: {
      status: 'config_fixable',
      from,
      to,
      configError,
      configCodemods,
      suggestedCommand,
      message: guidance,
      note: 'Integrations are skipped in this preview; they will be processed on the --apply run.',
      agentDocs,
      ...(cliBehindCore ? {cliBehindCore} : {}),
    },
  };
}
