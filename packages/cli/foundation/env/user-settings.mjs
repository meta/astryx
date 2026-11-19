// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's per-user settings file (spec AST-081 FR8):
 * `astryx/settings.json` in the platform's per-user configuration folder.
 *
 * It holds the person's choices about the computer-level agent text:
 *
 * ```json
 * {
 *   "computerAgentText": {"install": true, "links": ["/home/me/.claude/skills/astryx"]},
 *   "skills": {"to": ["~/team-skills"]}
 * }
 * ```
 *
 * - `computerAgentText.install`: `false` after `astryx init --user
 *   --remove-agents`, `true` after `astryx init --user`. A missing file or
 *   value means install.
 * - `computerAgentText.links`: the links to the skill folder Astryx made, so
 *   removal removes exactly those.
 * - `skills.to`: the folders outside any project that `astryx init --to
 *   <folder>` put the computer-level skill in: `~/` and a path in the home
 *   folder, else an absolute path. The `user` place
 *   is `computerAgentText`, which every release reads.
 *
 * Only `astryx init --user`, `astryx init --to`, and the global copy's
 * refresh change it. No environment variable or option
 * does. A file that cannot be read or parsed counts as missing, and one that
 * cannot be written never fails a run.
 *
 * @input  the per-user configuration folder
 * @output the settings, and writes to them
 * @position packages/cli/foundation/env
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {userConfigDir} from './user-dirs.mjs';

/**
 * @typedef {object} ComputerAgentTextSettings
 * @property {boolean} install Whether the computer-level text is wanted.
 * @property {string[]} links The links to its skill folder Astryx made, so
 *   removal removes exactly those.
 */

/**
 * The settings file's path.
 * @param {string} [configDir]
 * @returns {string}
 */
export function settingsFile(configDir = userConfigDir()) {
  return path.join(configDir, 'settings.json');
}

/**
 * The whole settings object; `{}` when the file is missing or unreadable.
 * @param {string} [configDir]
 * @returns {Record<string, unknown>}
 */
export function readSettings(configDir = userConfigDir()) {
  try {
    const value = JSON.parse(fs.readFileSync(settingsFile(configDir), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

/**
 * The person's choices about the computer-level agent text.
 * @param {string} [configDir]
 * @returns {ComputerAgentTextSettings}
 */
export function computerAgentTextSettings(configDir = userConfigDir()) {
  const raw = readSettings(configDir).computerAgentText;
  const value =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};
  const links = Array.isArray(value.links)
    ? value.links.filter(link => typeof link === 'string')
    : [];
  return {install: value.install !== false, links};
}

/**
 * Record the person's choices about the computer-level agent text, keeping
 * every other setting. Returns whether the file was written.
 * @param {ComputerAgentTextSettings} choice
 * @param {string} [configDir]
 * @returns {boolean}
 */
export function recordComputerAgentTextSettings(
  choice,
  configDir = userConfigDir(),
) {
  const next = {
    ...readSettings(configDir),
    computerAgentText: {install: choice.install, links: choice.links},
  };
  return writeSettings(next, configDir);
}

/**
 * Write the whole settings object; returns whether the file was written.
 * @param {Record<string, unknown>} next
 * @param {string} configDir
 * @returns {boolean}
 */
function writeSettings(next, configDir) {
  const file = settingsFile(configDir);
  try {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The folders outside any project that hold the computer-level skill
 * (`~/team-skills`, or an absolute path).
 * @param {string} [configDir]
 * @returns {string[]}
 */
export function computerSkillFolders(configDir = userConfigDir()) {
  const raw = readSettings(configDir).skills;
  const to =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw).to
      : undefined;
  return Array.isArray(to) ? to.filter(each => typeof each === 'string') : [];
}

/**
 * Record the folders outside any project that hold the computer-level skill,
 * keeping every other setting. Returns whether the file was written.
 * @param {readonly string[]} folders
 * @param {string} [configDir]
 * @returns {boolean}
 */
export function recordComputerSkillFolders(
  folders,
  configDir = userConfigDir(),
) {
  const settings = readSettings(configDir);
  const raw = settings.skills;
  const skills =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return writeSettings(
    {...settings, skills: {...skills, to: [...folders]}},
    configDir,
  );
}
