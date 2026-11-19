// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The names astryx.config `skills.to` accepts: the project places
 * `astryx init --to` saves. Shared by the config schema and the CLI, so a
 * value the CLI would skip is refused at load, and `astryx doctor` fails the
 * config check on it.
 *
 * @input  one saved name
 * @output whether it names a project place, and why not
 * @position packages/cli/authoring/config — read by parse.mjs and
 *   foundation/agent-docs/skill-places.mjs
 */

/** The project place keywords. */
export const PROJECT_PLACE_KEYWORDS = Object.freeze(['agents-md', 'skills']);

/**
 * Why `name` is not a project place, or null when it is one: a keyword, or
 * a folder in the project written as `./` and its path, with no `..` part.
 * @param {string} name
 * @returns {string | null}
 */
export function projectPlaceProblem(name) {
  if (PROJECT_PLACE_KEYWORDS.includes(name)) return null;
  if (name === '.' || name.startsWith('./')) {
    return name.split(/[\\/]/u).includes('..')
      ? `"${name}" leaves the project; a folder in skills.to is inside the project.`
      : null;
  }
  if (name === 'user') {
    return '"user" is a place for the computer, not the project: `astryx init --to user` saves it in the settings file.';
  }
  return `"${name}" is not a place. Use 'agents-md', 'skills', or a folder in the project written as './<path>'.`;
}
