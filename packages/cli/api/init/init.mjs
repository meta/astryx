// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file init API — dispatcher + barrel.
 *
 * `init(options, ctx)` is the non-interactive project setup entrypoint. It has
 * no prompts, so it behaves identically for humans, agents, CI, and piped I/O.
 * It routes to one of two leaves and returns that leaf's receipt:
 *   - `init.run`    (run/run.mjs)       — the default / `--features` / `--all`
 *                                         install path (agent-docs, theme +
 *                                         page-building guidance, template)
 *   - `init.remove` (remove/remove.mjs) — the `--remove-agents` path
 *   - `init.user`   (user/user.mjs)     — the `--user` path: the
 *                                         computer-level agent text, written
 *                                         or (with `--remove-agents`) removed
 *
 * This module also re-exports the leaf symbols the CLI + tests import by name
 * (`getNextSteps`) so api/index.mjs, the command handler
 * (cli/commands/init.mjs), and the test suite stay unchanged.
 */

import {run} from './run/run.mjs';
import {remove} from './remove/remove.mjs';
import {user} from './user/user.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

export {getNextSteps} from './run/run.mjs';

/**
 * Re-exported types so callers can keep referencing them off the init barrel
 * (e.g. cli/commands/init.mjs uses `import('../../api/init/init.mjs').InitOptions`).
 * The canonical shapes stay colocated in api/init/init.type.mjs.
 * @typedef {import('./init.type.mjs').InitOptions} InitOptions
 * @typedef {import('./init.type.mjs').InitRunData} InitRunData
 */

/**
 * Run the non-interactive init flow. Dispatches to the user leaf when
 * `--user` is set (it writes, or with `--remove-agents` removes, the
 * computer-level agent text and nothing in the folder), to the remove leaf
 * when `--remove-agents` is set, otherwise to the install (run) leaf, and
 * returns that leaf's receipt. Progress is emitted through `logger` (silent by
 * default); unknown feature or template names throw AstryxError with a stable
 * code.
 *
 * @param {InitOptions} [options]
 * @param {{cwd?: string}} [ctx]
 * @returns {Promise<import('./init.type.mjs').InitRunResponse | import('./init.type.mjs').InitRemoveResponse | import('./init.type.mjs').InitUserResponse>}
 */
export async function init(options = {}, {cwd = process.cwd()} = {}) {
  if (options.user) {
    // Its own path: fixed files in the home folder, never the project
    // agent-docs resolution, so it works the same in every folder.
    const refused = [
      options.features ? '--features' : null,
      options.all ? '--all' : null,
      options.agentDocsPath ? '--agent-docs-path' : null,
      options.agent ? '--agent' : null,
    ].filter(Boolean);
    if (refused.length > 0) {
      throw new AstryxError(
        `\`--user\` cannot be combined with ${refused.join(', ')}: it writes one skill file for every agent on the computer, linked into the folders agents read, with no features, agents, or path to choose.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    return user({remove: Boolean(options.removeAgents)});
  }
  if (options.removeAgents) {
    const ignored = [
      options.features ? '--features' : null,
      options.all ? '--all' : null,
      options.agent ? '--agent' : null,
      options.agentDocsPath ? '--agent-docs-path' : null,
    ].filter(Boolean);
    if (ignored.length > 0) {
      throw new AstryxError(
        `\`--remove-agents\` cannot be combined with ${ignored.join(', ')}: it removes the managed block and ignores install options.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    return remove({cwd});
  }
  if (options.all && options.features) {
    throw new AstryxError(
      '`--all` and `--features` cannot be used together: `--all` installs every feature, so a feature list is redundant.',
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  return run(options, {cwd});
}
