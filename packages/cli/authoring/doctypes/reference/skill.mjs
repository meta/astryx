// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The rules a doc's `skill` follows: its name is the skill's folder
 * name and its description is what an agent matches a task against. Shared by
 * the skill places, which leave out a skill that breaks one, and by the
 * integration checks, which warn about it before the package is published.
 *
 * @input  a doc's `skill` value
 * @output why it cannot be a skill, or null
 * @position authoring/doctypes/reference — read by the docs adapter and the
 *   integration checks
 */

/** The longest skill name, as agents that read SKILL.md accept it. */
export const MAX_SKILL_NAME = 64;

/** The longest skill description, as every agent reads it whole. */
export const MAX_SKILL_DESCRIPTION = 1024;

/** Names the CLI's own skills use. */
export const RESERVED_SKILL_NAMES = Object.freeze(['astryx', 'astryx-project']);

import {invalidAgentDocLine} from '../../integration/schema.mjs';

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Why `skill` cannot be a skill, or null when it can. Its description goes
 * into every consuming app's agent-docs block, so it follows the rules of a
 * block line (no marker text, no control characters, one line), up to
 * MAX_SKILL_DESCRIPTION code points.
 * @param {unknown} skill a doc's `skill` value, of any shape
 * @returns {string | null}
 */
export function skillProblem(skill) {
  if (skill == null || typeof skill !== 'object' || Array.isArray(skill)) {
    return 'skill must be an object with a name and a description';
  }
  const {name, description} = /** @type {{name?: unknown, description?: unknown}} */ (skill);
  if (typeof name !== 'string') return 'skill needs a name, a string';
  if (!SKILL_NAME.test(name)) {
    return `skill name "${name}" must be lowercase letters and digits, in words joined by single hyphens (such as "acme-entities")`;
  }
  if (name.length > MAX_SKILL_NAME) {
    return `skill name "${name}" is longer than ${MAX_SKILL_NAME} characters`;
  }
  if (RESERVED_SKILL_NAMES.includes(name)) {
    return `skill name "${name}" is the name of an Astryx skill; choose a name of your own, such as your package name`;
  }
  if (typeof description !== 'string' || description.trim() === '') {
    return `skill "${name}" needs a description that says when to use it`;
  }
  const line = invalidAgentDocLine(description, MAX_SKILL_DESCRIPTION);
  return line ? `skill "${name}" description ${line}` : null;
}
