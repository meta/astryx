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

import {parseFeatures, run} from './run/run.mjs';
import {remove} from './remove/remove.mjs';
import {user} from './user/user.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  SkillPlaceError,
  parsePlaces,
  placeNames,
} from '../../foundation/agent-docs/skill-places.mjs';
import {readProjectPlaces, skillProjectRoot} from './_adapter.mjs';

export {getNextSteps, getWorkflowSteps} from './run/run.mjs';

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
  if (options.to !== undefined) return initTo(options, cwd);
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
  return run(options, {cwd});
}

/**
 * `init --to`: parse the places, refuse what cannot combine with them, and
 * write each. `--to user` alone is `--user`: the same leaf and receipt.
 * @param {InitOptions} options
 * @param {string} cwd
 * @returns {Promise<import('./init.type.mjs').InitRunResponse | import('./init.type.mjs').InitUserResponse>}
 */
async function initTo(options, cwd) {
  const refused = [
    options.user ? '--user' : null,
    options.removeAgents ? '--remove-agents' : null,
  ].filter(Boolean);
  if (refused.length > 0) {
    throw new AstryxError(
      `\`--to\` cannot be combined with ${refused.join(', ')}: \`--to user\` is the computer-level skill, and \`--remove-agents\` removes instead of writing.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const projectRoot = skillProjectRoot(cwd);
  let places;
  try {
    places = parsePlaces(placeNames(options.to ?? []), {cwd, projectRoot});
  } catch (err) {
    if (err instanceof SkillPlaceError) {
      throw new AstryxError(
        err.message,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    throw err;
  }
  if (places.length === 1 && places[0]?.kind === 'user') {
    // The computer-level skill alone, as `--user`: nothing in the folder.
    const refused = [
      options.features ? '--features' : null,
      options.all ? '--all' : null,
      options.agentDocsPath ? '--agent-docs-path' : null,
      options.agent ? '--agent' : null,
    ].filter(Boolean);
    if (refused.length > 0) {
      throw new AstryxError(
        `\`--to user\` cannot be combined with ${refused.join(', ')}: it writes one skill file for every agent on the computer, linked into the folders agents read, with no features, agents, or path to choose.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    return user({remove: false});
  }
  const features = parseFeatures(options) ?? ['agents'];
  if (!features.includes('agents')) {
    throw new AstryxError(
      '`--to` says where the agent docs go, and `--features` leaves out agents: add agents to `--features`, or leave `--to` out.',
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const previous = projectRoot ? await readProjectPlaces(projectRoot) : null;
  return run(options, {cwd, places: {places, projectRoot, previous}});
}
