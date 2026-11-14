// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `template` subject's adapter for icon mapping (AST-084 FR9),
 * which reads the project's icon sets through the `Project` seam, and for the
 * not-found hint that names another lookup command.
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

/**
 * The unknown-template suggestions with the command that reads a component,
 * hook or docs topic of exactly that name in them, in the place
 * foundation/suggest/other-command.mjs gives it. The suggestions stay as they
 * are when no such entry exists or the check fails. The hint's modules load
 * only on this path.
 * @param {string} name
 * @param {import('../../foundation/response/base').Suggestion[]} suggestions
 * @param {string} cwd
 * @param {(suggestion: import('../../foundation/response/base').Suggestion) => Array<string | undefined>} namesOf
 *   the names the template matcher ranked a suggestion by: its id and its
 *   human name
 * @returns {Promise<import('../../foundation/response/base').Suggestion[] | undefined>}
 */
export async function withOtherCommandHint(name, suggestions, cwd, namesOf) {
  try {
    const [{findOtherCommand, withOtherCommand}, {docsEntryNames}] =
      await Promise.all([
        import('../../foundation/suggest/other-command.mjs'),
        import('../docs/_entry-names.mjs'),
      ]);
    const hint = await findOtherCommand(name, {
      from: 'template',
      cwd,
      docsNames: docsEntryNames,
    });
    return withOtherCommand(suggestions, hint, name, {
      from: 'template',
      namesOf,
    });
  } catch {
    return suggestions;
  }
}
