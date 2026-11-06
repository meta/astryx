// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The docsite's door into the CLI's command picker.
 *
 * Docs write commands as bare `astryx ...`, and whoever shows a doc prefixes
 * them with the command its readers run. The CLI does that with the project's
 * invocation; the docsite does it with its own door name: `npx @astryxdesign/cli`,
 * which runs the CLI before any install (a bare `npx astryx` reaches an
 * unrelated package), and plain `astryx` on the global mode pages, whose
 * readers have installed it. Same monorepo-relative import as the
 * ShadCN registry generator: the door is not part of the CLI's public API.
 *
 * @position apps/docsite/scripts/lib — read by generate-data.mjs.
 */

export {runWithCliDoor} from '../../../../packages/cli/foundation/env/cli-command.mjs';
export {
  getCliInvocation,
  prefixCliCommands,
  runWithDocPackageManager,
} from '../../../../packages/cli/foundation/env/package-manager.mjs';

/** The command docsite pages show for running the CLI. */
export const DOCSITE_CLI_COMMAND = 'npx @astryxdesign/cli';

/**
 * The package manager docsite pages show `{@pm}` steps in: npm, the one every
 * Node install carries, as the install buttons do.
 */
export const DOCSITE_PACKAGE_MANAGER = 'npm';

/** The command the global mode pages show: their readers installed the CLI. */
export const GLOBAL_PAGE_CLI_COMMAND = 'astryx';

/** The page whose readers run the CLI they installed for their computer. */
export const GLOBAL_PAGE = 'global';
