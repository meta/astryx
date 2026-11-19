// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The skill places a project saves, read from its astryx.config:
 * shared by `init` and `doctor`.
 *
 * @input  a project root
 * @output the saved places
 * @position foundation/agent-docs — read by the init and doctor adapters
 */

import {findConfigPath} from '../config/config-path.mjs';
import {loadModuleWithParser} from '../fs/module-loader.mjs';
import {parseConfig} from '../../authoring/config/parse.mjs';
import {savedProjectPlaces} from './skill-places.mjs';

/**
 * The project places saved in the project's config. Only the config is
 * loaded, not its integrations. A config that cannot be loaded saves none,
 * so init writes the default as before, and the agent docs report the load
 * error.
 * @param {string} projectRoot
 * @returns {Promise<import('./skill-places.mjs').SkillPlace[]>}
 */
export async function readProjectPlaces(projectRoot) {
  try {
    const configPath = findConfigPath(projectRoot);
    const config = configPath
      ? await loadModuleWithParser(configPath, parseConfig, {
          label: 'astryx.config',
          fresh: true,
        })
      : undefined;
    return savedProjectPlaces(config, projectRoot);
  } catch {
    return savedProjectPlaces(undefined, projectRoot);
  }
}
