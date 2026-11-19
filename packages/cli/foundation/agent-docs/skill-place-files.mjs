// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The skill places on disk: the project places a config saves, and the
 * skill files each place holds, checked to stay inside the project, read,
 * written, and removed under the managed file rules
 * (`managed-skill-file.mjs`). `init`, `upgrade`, and `doctor` share it.
 *
 * @input  a project root, a place, the text this release renders for it
 * @output the saved places, each file's state, and the write and remove rows
 * @position foundation/agent-docs — read by the init, upgrade, and doctor
 *   adapters
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findConfigPath} from '../config/config-path.mjs';
import {computerSkillFile, computerSkillLinks, copyStateOf} from './computer-agent-text.mjs';
import {computerAgentTextSettings} from '../env/user-settings.mjs';
import {PathSafetyError, assertWithin} from '../fs/path-safety.mjs';
import {loadModuleWithParser} from '../fs/module-loader.mjs';
import {parseConfig} from '../../authoring/config/parse.mjs';
import {
  COMPUTER_SKILL_NAME,
  PROJECT_SKILL_NAME,
  placeFolders,
  placeSkillFiles,
  savedProjectPlaces,
} from './skill-places.mjs';
import {formatCliCommand} from '../env/package-manager.mjs';
import {
  keptReason,
  managedFileState,
  removeManagedFileIfOwned,
  writeManagedFile,
} from './managed-skill-file.mjs';

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

/**
 * Why `file` belongs to another place, so it is never written or removed
 * through this one, or null when it is this place's:
 * - `computer-skill`: it is the computer-level skill
 *   (`~/.agents/skills/astryx/SKILL.md`), reached through a saved folder
 *   such as `~/.agents/skills`, or one of the links or managed copies the
 *   computer-level text made for it (a link that reaches that folder, or a
 *   folder in its table holding only an unedited Astryx skill file while the
 *   text is installed and the skill file exists), as
 *   through `~/.claude/skills`; `astryx init --remove --to user` removes it.
 * - `not-astryx`: in a project place, a skill folder that resolves outside
 *   the project (an integration skill's folder linked out; init refuses that
 *   for the project skill); a link inside the project joins copies that
 *   share one file, written once.
 * Any other file, a linked skill folder included, is read by its own
 * markers and hash: an unedited Astryx file is the place's own, and a file
 * Astryx did not write is kept.
 * A folder at an agent's skills path that the computer-level text never
 * made is the saved folder's own.
 * @param {string} file
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @returns {'computer-skill' | 'not-astryx' | null}
 */
function otherPlacesFile(file, place, projectRoot) {
  const dir = path.dirname(file);
  const realOf = (/** @type {string} */ p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return null;
    }
  };
  const at = realOf(dir);
  if (at == null) return null;
  const skillDir = path.dirname(computerSkillFile());
  const skillReal = fs.existsSync(computerSkillFile()) ? realOf(skillDir) : null;
  if (skillReal != null && at === skillReal) return 'computer-skill';
  // While the text is installed, a folder in its table that holds only an
  // unedited Astryx skill file is the copy it keeps there: Continue's, or
  // one where a link could not be made.
  if (skillReal != null && computerAgentTextSettings().install) {
    for (const place of computerSkillLinks()) {
      if (realOf(place.path) === at && copyStateOf(place.path, '') === 'differs') {
        return 'computer-skill';
      }
    }
  }
  if (place.scope !== 'computer') {
    const root = projectRoot == null ? null : realOf(projectRoot);
    const within = root != null && (at === root || at.startsWith(root + path.sep));
    return root == null || within ? null : 'not-astryx';
  }
  return null;
}

/**
 * A skill file's state, a file that belongs to another place
 * (otherPlacesFile) reading as one Astryx did not write for this place.
 * @param {string} file
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @returns {import('./managed-skill-file.mjs').ManagedFileState}
 */
function placeFileState(file, place, projectRoot, text) {
  return otherPlacesFile(file, place, projectRoot) ? 'foreign' : managedFileState(file, text);
}

/**
 * What writing `text` to `place` would do to each file one skill has there:
 * the Astryx skill, or an integration's (`skill`). The copies of one skill
 * are written together or not at all: when any is a person's own (edited, or
 * not Astryx's), each is kept, so every agent reads one text.
 * `writeSkillPlace` writes this plan, and `upgrade` reports it.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @param {string} [skill] an integration skill's name
 * @returns {Array<{file: string, state: import('./managed-skill-file.mjs').ManagedFileState, plan: 'current' | 'create' | 'update' | 'kept', reason?: 'edited' | 'not-astryx' | 'pair-kept' | 'computer-skill'}>}
 */
export function planSkillPlace(place, projectRoot, text, skill) {
  const files = placeSkillFiles(place, projectRoot, skill);
  const states = files.map(file => ({file, state: placeFileState(file, place, projectRoot, text)}));
  const owned = (/** @type {string} */ state) => state === 'edited' || state === 'foreign';
  const pairKept = files.length > 1 && states.some(each => owned(each.state));
  return states.map(({file, state}) => {
    if (owned(state)) {
      const reason = otherPlacesFile(file, place, projectRoot) ?? keptReason(/** @type {'edited' | 'foreign'} */ (state));
      return {file, state, plan: /** @type {const} */ ('kept'), reason};
    }
    if (pairKept) return {file, state, plan: /** @type {const} */ ('kept'), reason: /** @type {const} */ ('pair-kept')};
    return {
      file,
      state,
      plan: state === 'current' ? /** @type {const} */ ('current') : state === 'absent' ? /** @type {const} */ ('create') : /** @type {const} */ ('update'),
    };
  });
}

/**
 * Write `text` to each file one skill has in `place`, as `planSkillPlace`
 * plans it; an integration skill's rows name it.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @param {string} [skill] an integration skill's name
 * @returns {Array<{file: string, skill?: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx' | 'pair-kept' | 'computer-skill'}>}
 */
export function writeSkillPlace(place, projectRoot, text, skill) {
  const named = skill ? {skill} : {};
  const plan = planSkillPlace(place, projectRoot, text, skill);
  if (plan.some(each => each.reason === 'pair-kept')) {
    return plan.map(({file, reason}) => ({file, ...named, action: /** @type {const} */ ('kept'), reason}));
  }
  // Every copy must be writable before the first is written, so a refused
  // copy never leaves the place on two texts.
  for (const each of plan) {
    if (each.plan === 'create' || each.plan === 'update') assertWritable(each.file);
  }
  return plan.map(({file, plan: planned, reason}) =>
    planned === 'kept'
      ? {file, ...named, action: /** @type {const} */ ('kept'), reason}
      : {file, ...named, ...writeManagedFile(file, text)},
  );
}

/**
 * Throw when `file` cannot be written: the file itself, or the nearest folder
 * above it that exists, refuses writes.
 * @param {string} file
 */
function assertWritable(file) {
  let at = file;
  while (!fs.existsSync(at)) {
    const parent = path.dirname(at);
    if (parent === at) break;
    at = parent;
  }
  fs.accessSync(at, fs.constants.W_OK);
}

/**
 * Remove each skill file of `place` that is an unedited Astryx file, and
 * each folder that leaves empty, up to the folder the place names.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @returns {Array<{file: string, skill?: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx' | 'computer-skill'}>}
 */
export function removeSkillPlace(place, projectRoot) {
  // Folders the removal empties go too, below the folder the place names
  // (or the project root): that folder may be a person's, so it stays.
  const stop = place.kind !== 'folder' ? projectRoot : place.dir;
  // The integration skills Astryx wrote there go with the project skill;
  // their rows name the skill.
  const own = placeSkillFiles(place, projectRoot);
  const files = [...own, ...leftoverIntegrationSkills(place, projectRoot, new Set())];
  return files.map(file => {
    const named = own.includes(file) ? {} : {skill: path.basename(path.dirname(file))};
    const other = otherPlacesFile(file, place, projectRoot);
    if (other) return {file, ...named, action: /** @type {const} */ ('kept'), reason: other};
    const result = removeManagedFileIfOwned(file);
    if (result.action === 'removed' && stop)
      removeEmptyFolders(path.dirname(file), stop);
    return {file, ...named, ...result};
  });
}

/**
 * Remove `dir` and each folder above it while it is empty, stopping below
 * `stop`.
 * @param {string} dir
 * @param {string} stop
 */
function removeEmptyFolders(dir, stop) {
  let at = dir;
  while (at !== stop && !path.relative(stop, at).startsWith('..')) {
    try {
      fs.rmdirSync(at);
    } catch (error) {
      // Already gone: the file's own folder goes with the file.
      if (/** @type {{code?: string}} */ (error).code !== 'ENOENT') return;
    }
    at = path.dirname(at);
  }
}

/**
 * Whether `file` resolves inside the project, links included: a skills
 * folder linked out of it (such as `.claude` linked to `~/.claude`) holds
 * files that are not the project's.
 * @param {string} file
 * @param {string} projectRoot
 * @returns {boolean}
 */
export function resolvesInside(file, projectRoot) {
  try {
    assertWithin(path.relative(projectRoot, file), projectRoot, {label: 'skill file'});
    return true;
  } catch (err) {
    if (err instanceof PathSafetyError) return false;
    throw err;
  }
}

/**
 * Why a project place cannot be written: one of its skill files resolves
 * outside the project, as through a skills folder linked out of it (such as
 * `.claude` linked to `~/.claude`). Null when every file stays inside.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string} projectRoot
 * @returns {string | null}
 */
export function skillPlaceEscape(place, projectRoot) {
  for (const file of placeSkillFiles(place, projectRoot)) {
    try {
      assertWithin(path.relative(projectRoot, file), projectRoot, {label: 'skill file'});
    } catch (err) {
      if (err instanceof PathSafetyError) {
        return `${err.message} Astryx writes the project skill only inside the project; make that folder a real folder in the project, or choose another place with \`--to\`.`;
      }
      throw err;
    }
  }
  return null;
}

/**
 * The state of each file one skill has in `place` against `text`.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @param {string} [skill] an integration skill's name; the Astryx skill without it
 * @returns {Array<{file: string, state: import('./managed-skill-file.mjs').ManagedFileState}>}
 */
export function inspectSkillPlace(place, projectRoot, text, skill) {
  return placeSkillFiles(place, projectRoot, skill).map(file => ({
    file,
    state: placeFileState(file, place, projectRoot, text),
  }));
}

/**
 * What a receipt line says about a skill file a run kept as it is, by why
 * it was kept. `editedHint` says what a person does with a file they edited.
 * @param {'edited' | 'not-astryx' | 'pair-kept' | 'computer-skill' | 'not-written' | undefined} reason
 * @param {string} editedHint
 * @param {string} [cwd] the folder the command runs in, for the command a line names
 * @returns {string}
 */
export function keptText(reason, editedHint, cwd) {
  if (reason === 'edited') return `kept, edited since Astryx wrote it; ${editedHint}`;
  if (reason === 'computer-skill') {
    return `kept: it is the computer-level skill; \`${formatCliCommand('init --remove --to user', cwd)}\` removes it`;
  }
  if (reason === 'pair-kept') {
    return "kept: the other copy of this place is not Astryx's, so neither copy is written";
  }
  if (reason === 'not-written') return 'not written: a copy of this place could not be written, so neither was';
  return 'kept, not created by Astryx';
}

/**
 * The integration skills Astryx wrote in `place` that no loaded integration
 * declares any more, as after a package was removed: each skill folder whose
 * SKILL.md is an unedited Astryx file, other than the project and computer
 * skills and the names in `keep`.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {ReadonlySet<string>} keep
 * @returns {string[]} the SKILL.md files
 */
export function leftoverIntegrationSkills(place, projectRoot, keep) {
  /** @type {string[]} */
  const files = [];
  // Integration skills are written only into project places; a folder saved
  // for this computer may hold another project's, which stay.
  if (place.scope !== 'project') return files;
  for (const folder of placeFolders(place, projectRoot)) {
    let names;
    try {
      names = fs.readdirSync(folder);
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (name === PROJECT_SKILL_NAME || name === COMPUTER_SKILL_NAME || keep.has(name)) continue;
      const file = path.join(folder, name, 'SKILL.md');
      // Astryx writes integration skills as real folders: a linked skill
      // folder is someone else's, so the sweep never reaches through it.
      let linked;
      try {
        linked = fs.lstatSync(path.dirname(file)).isSymbolicLink();
      } catch {
        continue;
      }
      if (!linked && placeFileState(file, place, projectRoot, '') === 'differs') files.push(file);
    }
  }
  return files;
}

/**
 * Remove integration skill files, and each skill folder that leaves empty.
 * @param {readonly string[]} files
 * @returns {Array<{file: string, skill: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx'}>}
 */
export function removeIntegrationSkillFiles(files) {
  return files.map(file => ({
    file,
    skill: path.basename(path.dirname(file)),
    ...removeManagedFileIfOwned(file),
  }));
}
