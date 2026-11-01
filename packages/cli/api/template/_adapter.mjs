// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `template` subject's adapter for icon mapping (AST-084 FR9):
 * reads the project's icon sets through the `Project` seam.
 *
 * @position api/template — adapter read by the template dispatcher
 */

import {Project} from '../../foundation/config/project.mjs';
import {NO_ICON_SETS} from '../../foundation/discovery/template-icons.mjs';

/**
 * The installed icon sets and the project's choice. A project the CLI cannot
 * read has no icon set, so templates are written unchanged.
 * @param {string} cwd
 * @returns {Promise<{sets: import('../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet[], choice: import('../../foundation/discovery/icon-set-discovery.mjs').IconSetChoice}>}
 */
export async function loadTemplateIconSets(cwd) {
  try {
    const project = await Project.load(cwd);
    const {sets, choice} = await project.iconSets();
    // Icon sets are experimental (spec:AST-017 FR27): a copied template
    // follows one only when the project opts in with `experimental.iconSet`.
    if (!choice.configured) return NO_ICON_SETS;
    return {sets, choice};
  } catch (error) {
    return {
      sets: [],
      choice: {
        status: 'none',
        reason: `The project could not be read, so no icon set applies: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
