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
import {PathSafetyError, assertWithin} from '../fs/path-safety.mjs';
import {loadModuleWithParser} from '../fs/module-loader.mjs';
import {parseConfig} from '../../authoring/config/parse.mjs';
import {placeSkillFiles, savedProjectPlaces} from './skill-places.mjs';
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
 * What writing `text` to `place` would do to each of its skill files. The
 * copies of one place are written together or not at all: when any is a
 * person's own (edited, or not Astryx's), each is kept, so every agent reads
 * one text. `writeSkillPlace` writes this plan, and `upgrade` reports it.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @returns {Array<{file: string, state: import('./managed-skill-file.mjs').ManagedFileState, plan: 'current' | 'create' | 'update' | 'kept', reason?: 'edited' | 'not-astryx' | 'pair-kept'}>}
 */
export function planSkillPlace(place, projectRoot, text) {
  const files = placeSkillFiles(place, projectRoot);
  const states = files.map(file => ({file, state: managedFileState(file, text)}));
  const owned = (/** @type {string} */ state) => state === 'edited' || state === 'foreign';
  const pairKept = files.length > 1 && states.some(each => owned(each.state));
  return states.map(({file, state}) => {
    if (owned(state)) {
      return {file, state, plan: /** @type {const} */ ('kept'), reason: keptReason(/** @type {'edited' | 'foreign'} */ (state))};
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
 * Write `text` to each skill file of `place`, as `planSkillPlace` plans it.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @returns {Array<{file: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx' | 'pair-kept'}>}
 */
export function writeSkillPlace(place, projectRoot, text) {
  const plan = planSkillPlace(place, projectRoot, text);
  if (plan.some(each => each.reason === 'pair-kept')) {
    return plan.map(({file, reason}) => ({file, action: /** @type {const} */ ('kept'), reason}));
  }
  // Every copy must be writable before the first is written, so a refused
  // copy never leaves the place on two texts.
  for (const each of plan) {
    if (each.plan === 'create' || each.plan === 'update') assertWritable(each.file);
  }
  return plan.map(({file}) => ({file, ...writeManagedFile(file, text)}));
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
 * Remove each skill file of `place` that is an unedited Astryx file.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @returns {Array<{file: string, action: import('./managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx'}>}
 */
export function removeSkillPlace(place, projectRoot) {
  // Folders the removal empties go too, up to the folder the place names, or
  // the project root for the skills folders.
  const stop = place.kind === 'folder' ? place.dir : projectRoot;
  return placeSkillFiles(place, projectRoot).map(file => {
    const result = removeManagedFileIfOwned(file);
    if (result.action === 'removed' && stop)
      removeEmptyFolders(path.dirname(file), stop);
    return {file, ...result};
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
 * The state of each skill file of `place` against `text`.
 * @param {import('./skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @returns {Array<{file: string, state: import('./managed-skill-file.mjs').ManagedFileState}>}
 */
export function inspectSkillPlace(place, projectRoot, text) {
  return placeSkillFiles(place, projectRoot).map(file => ({
    file,
    state: managedFileState(file, text),
  }));
}

/**
 * What a receipt line says about a skill file a run kept as it is, by why
 * it was kept. `editedHint` says what a person does with a file they edited.
 * @param {'edited' | 'not-astryx' | 'pair-kept' | 'not-written' | undefined} reason
 * @param {string} editedHint
 * @returns {string}
 */
export function keptText(reason, editedHint) {
  if (reason === 'edited') return `kept, edited since Astryx wrote it; ${editedHint}`;
  if (reason === 'pair-kept') {
    return "kept: the other copy of this place is not Astryx's, so neither copy is written";
  }
  if (reason === 'not-written') return 'not written: a copy of this place could not be written, so neither was';
  return 'kept, not created by Astryx';
}
