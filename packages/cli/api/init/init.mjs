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
 *   - `init.remove` (remove/remove.mjs) — the `--remove` path (`--remove-agents` is the same option)
 *   - `init.user`   (user/user.mjs)     — the `--user` path: the
 *                                         computer-level agent text, written
 *                                         or (with `--remove`) removed
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
import {savedName} from '../../foundation/agent-docs/skill-places.mjs';
import {
  computerSkillFoldersSaved,
  readProjectPlaces,
  skillProjectRoot,
} from './_adapter.mjs';

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
 * `--user` is set (it writes, or with `--remove` removes, the
 * computer-level agent text and nothing in the folder), to the remove leaf
 * when `--remove` (or `--remove-agents`) is set, otherwise to the install (run) leaf, and
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
    if (options.once) {
      throw new AstryxError(
        '`--once` cannot be combined with `--user`: the computer-level skill is kept current by the CLI installed for the computer, so it is never a one-off copy.',
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    return user({remove: Boolean(options.removeAgents || options.remove)});
  }
  if (options.removeAgents || options.remove) {
    const flag = options.remove ? '--remove' : '--remove-agents';
    const ignored = [
      options.features ? '--features' : null,
      options.all ? '--all' : null,
      options.agent ? '--agent' : null,
      options.agentDocsPath ? '--agent-docs-path' : null,
      options.once ? '--once' : null,
    ].filter(Boolean);
    if (ignored.length > 0) {
      throw new AstryxError(
        `\`${flag}\` cannot be combined with ${ignored.join(', ')}: it removes the Astryx skill and the managed block from the saved places, and takes no install options.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    return remove({cwd});
  }
  if (options.once) {
    throw new AstryxError(
      '`--once` needs `--to`: it writes a copy to the places `--to` names and saves none of them.',
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  return run(options, {cwd});
}

/**
 * `init --to`: parse the places, refuse what cannot combine with them, and
 * write each. `--to user` alone is `--user`: the same leaf and receipt.
 * @param {InitOptions} options
 * @param {string} cwd
 * @returns {Promise<import('./init.type.mjs').InitRunResponse | import('./init.type.mjs').InitRemoveResponse | import('./init.type.mjs').InitUserResponse>}
 */
async function initTo(options, cwd) {
  if (options.user) {
    throw new AstryxError(
      '`--to` cannot be combined with `--user`: `--to user` is the computer-level skill.',
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const removing = Boolean(options.remove || options.removeAgents);
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
  if (removing) return removeFrom(options, places, cwd, projectRoot);
  if (options.once && places.some(place => place.kind === 'user')) {
    throw new AstryxError(
      '`--once` cannot be combined with `--to user`: the computer-level skill is kept current by the CLI installed for the computer, so it is never a one-off copy.',
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
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
  // A one-off copy moves the project off nothing and saves nothing, so it
  // goes only to a place nothing keeps current: never the block, and never
  // a place a project or this computer already saves.
  if (options.once) {
    const saved = new Set([
      ...(projectRoot ? (await readProjectPlaces(projectRoot)).map(savedName) : []),
      ...computerSkillFoldersSaved(),
    ]);
    const kept = places
      .filter(place => place.kind === 'agents-md' || saved.has(savedName(place)))
      .map(savedName);
    if (kept.length > 0) {
      throw new AstryxError(
        `\`--once\` writes a copy nothing keeps current, and ${kept.join(', ')} ${kept.length === 1 ? 'is' : 'are'} kept current (the AGENTS.md block, or a saved place): name another folder, or leave \`--once\` out.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  }
  const previous = projectRoot && !options.once ? await readProjectPlaces(projectRoot) : null;
  return run(options, {
    cwd,
    places: {places, projectRoot, previous, once: Boolean(options.once), named: true},
  });
}

/**
 * `init --remove --to <places>`: remove the skill from the places named and
 * drop them from what is saved. `--to user` alone is `--user --remove`.
 * @param {InitOptions} options
 * @param {import('../../foundation/agent-docs/skill-places.mjs').SkillPlace[]} places
 * @param {string} cwd
 * @param {string | null} projectRoot
 * @returns {Promise<import('./init.type.mjs').InitRemoveResponse | import('./init.type.mjs').InitUserResponse>}
 */
async function removeFrom(options, places, cwd, projectRoot) {
  const flag = options.remove ? '--remove' : '--remove-agents';
  const ignored = [
    options.features ? '--features' : null,
    options.all ? '--all' : null,
    options.agent ? '--agent' : null,
    options.agentDocsPath ? '--agent-docs-path' : null,
    options.once ? '--once' : null,
  ].filter(Boolean);
  if (ignored.length > 0) {
    throw new AstryxError(
      `\`${flag}\` cannot be combined with ${ignored.join(', ')}: it removes the skill from the places \`--to\` names and ignores install options.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (places.length === 1 && places[0]?.kind === 'user') return user({remove: true});
  return remove({cwd, places, projectRoot});
}
