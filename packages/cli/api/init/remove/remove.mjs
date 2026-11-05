// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file init.remove leaf — the `--remove-agents` path behind `astryx init`.
 *
 * `remove(ctx)` deletes the managed agent-docs block from every agent-doc file
 * at the project root, where init writes it, and in the working folder, and
 * returns an `init.remove` receipt. The removal engine lives in
 * foundation/agent-docs; this leaf only wires the cwd.
 *
 * Note: removeAgentDocs() still logs its own per-file lines via humanLog
 * (shared lib behavior) — so a programmatic remove is not perfectly silent yet.
 * Threading a logger through agent-docs is a separate cleanup.
 */

import {removeProjectAgentDocs} from '../../../foundation/agent-docs/agent-docs.mjs';
import {logger} from '../../logger.mjs';

/**
 * Remove the managed agent-docs block and return an `init.remove` receipt.
 * Progress is emitted through the shared `logger` (silent by default).
 *
 * @param {{cwd?: string}} [ctx]
 * @returns {Promise<import('../init.type.mjs').InitRemoveResponse>}
 */
export async function remove({cwd = process.cwd()} = {}) {
  /** @type {string[]} */
  const skipped = [];
  const removedFrom = removeProjectAgentDocs(cwd, {
    onSkipped: (rel, reason) => skipped.push(`${rel} (${reason})`),
  });
  if (skipped.length > 0) {
    // Below the project root, as install does there (0.7.x touched only the
    // working folder): a root agent file outside the project is left alone.
    logger.warn(
      `Note: Left as ${skipped.length === 1 ? 'it is' : 'they are'}: ${skipped.join('; ')}. ` +
        'To remove the Astryx block there, delete it by hand.',
    );
  }
  const removed = removedFrom.length > 0;
  logger.log(
    removed
      ? '[ok] AI agent docs removed.'
      : '[ok] Nothing to remove: no Astryx agent-docs block was found.',
  );
  return {type: 'init.remove', data: {removed}};
}
