// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file upgrade.list leaf — the available codemods, nothing run.
 *
 * Projects the registry walk (`_adapter.collectAllCodemods`) into the public
 * list entries (name/title/version/optional) and emits the human listing
 * through the shared `logger`. No cwd, no version detection, no side effects.
 */

import {CORE_PACKAGE, collectAllCodemods} from '../_adapter.mjs';
import {logger} from '../../logger.mjs';
import {toAscii} from '../../../assets/codemods/term-log.mjs';

/**
 * List every available codemod (oldest→newest).
 * @returns {Promise<import('../upgrade.type.mjs').UpgradeListResponse>}
 */
export async function list() {
  const codemods = await collectAllCodemods();
  logger.log(`Available codemods from ${CORE_PACKAGE}:`);
  for (const {name, title, pr, optional} of codemods) {
    logger.log(`  ${name} - ${toAscii(title)}${optional ? ' (optional)' : ''} (${pr})`);
  }
  logger.log('Done\n');
  return {
    type: 'upgrade.list',
    data: codemods.map(({name, title, version, optional}) => ({
      name,
      package: CORE_PACKAGE,
      title,
      version,
      optional,
    })),
  };
}
