// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Environment adapter for init: for `init --user`, the home folder, the
 * settings file, the per-user state, and the search path (spec AST-081 FR7,
 * FR8); for `init --to`, the project's saved places, its config, and the
 * skill files each place holds; for the getting-started steps, the project's
 * install command (architecture:cli-surface INV21).
 *
 * @input  the home folder, the settings file, the search path
 * @output the computer-level agent text written or removed, with the setting
 *   and the links recorded
 * @position packages/cli/api/init — imported by the user and run leaves
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  COMPUTER_COMMAND,
  COMPUTER_INSTALL_STEP,
  astryxOnSearchPath,
  computerAgentCommand,
  displayHomePath,
  removeComputerAgentText,
  writeComputerAgentText,
} from '../../foundation/agent-docs/computer-agent-text.mjs';
import {
  computerAgentTextSettings,
  recordComputerAgentTextSettings,
} from '../../foundation/env/user-settings.mjs';
import {recordAgentTextWritten} from '../../foundation/release/global-state.mjs';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {installStepFor} from '../../foundation/discovery/template-needs.mjs';
import {writeFailed} from '../error.mjs';
export {STARTER_THEME} from '../../foundation/discovery/theme-discovery.mjs';
import {
  computerInstallStep,
  renderComputerAgentText,
} from '../../foundation/agent-docs/computer-agent-text.mjs';
import {resolveAgentDocsRoot} from '../../foundation/agent-docs/agent-docs-target.mjs';
import {renderAgentDocsBlock} from '../../foundation/agent-docs/agent-docs.mjs';
import {
  placeSkillFiles,
  projectPlacesValue,
  renderProjectSkill,
} from '../../foundation/agent-docs/skill-places.mjs';
import {
  keptReason,
  managedFileState,
  removeManagedFileIfOwned,
  writeManagedFile,
} from '../../foundation/agent-docs/managed-skill-file.mjs';
import {
  computerSkillFolders,
  recordComputerSkillFolders,
} from '../../foundation/env/user-settings.mjs';
import {setConfigValues} from '../../foundation/config/config-writer.mjs';
import {PathSafetyError, assertWithin} from '../../foundation/fs/path-safety.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

export {COMPUTER_COMMAND, COMPUTER_INSTALL_STEP, displayHomePath};
export {readProjectPlaces} from '../../foundation/agent-docs/skill-place-files.mjs';

// What the run leaf reads before it writes agent docs: the state of the files
// it is about to write.
export {
  inspectAgentDocs,
  resolveAgentPaths,
} from '../../foundation/agent-docs/agent-docs.mjs';

/**
 * Write or refresh the computer-level agent text, or remove it, and record
 * the setting and the links Astryx made; after a write, record the release
 * that wrote it.
 * @param {{remove: boolean}} options
 * @returns {{home: string, command: string, files: import('./init.type.mjs').InitUserFile[], cliOnSearchPath: boolean}}
 */
export function applyComputerAgentText({remove}) {
  const home = os.homedir();
  const command = computerAgentCommand();
  const recorded = computerAgentTextSettings().links;
  /** @type {import('./init.type.mjs').InitUserFile[]} */
  let files;
  try {
    if (remove) {
      files = removeComputerAgentText({home, links: recorded});
      recordComputerAgentTextSettings({install: false, links: []});
    } else {
      const written = writeComputerAgentText({home, command});
      files = written.rows;
      recordComputerAgentTextSettings({
        install: true,
        links: [...new Set([...recorded, ...written.links])],
      });
      recordAgentTextWritten(cliVersion());
    }
  } catch (err) {
    throw computerTextFailed(err, home, remove);
  }
  return {home, command, files, cliOnSearchPath: astryxOnSearchPath()};
}

/**
 * The nearest existing folder above `at`: where a refused recursive write
 * stopped, since the error names the path it was asked for.
 * @param {string} at
 * @returns {string}
 */
function nearestFolder(at) {
  let dir = path.dirname(at);
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

/**
 * The error for a computer-level agent text write or removal the file system
 * refused, as a read-only `~/.agents/skills`: the path, the errno, what had
 * already changed, and the step that fixes that errno. Any other error
 * passes through unchanged.
 * @param {unknown} err
 * @param {string} home
 * @param {boolean} remove
 * @returns {unknown}
 */
function computerTextFailed(err, home, remove) {
  const {code, path: at, removed, syscall} = /** @type {{code?: unknown, path?: unknown, removed?: string[], syscall?: unknown}} */ (
    err ?? {}
  );
  if (typeof code !== 'string' || typeof at !== 'string') return err;
  const again = remove ? 'astryx init --user --remove-agents' : 'astryx init --user';
  // An open that fails on a file that exists is refused by the file itself
  // (read-only, or owned by root after a sudo run); a mkdir, an unlink, or a
  // missing target is refused by the folder that holds it.
  const fix = syscall === 'open' && fs.existsSync(at) ? at : nearestFolder(at);
  /** @type {Record<string, string>} */
  const nextFor = {
    EACCES: `Give yourself write access to ${displayHomePath(fix, home)}, then run \`${again}\` again.`,
    EPERM: `Give yourself write access to ${displayHomePath(fix, home)}, then run \`${again}\` again.`,
    EROFS: `That folder is on a read-only file system; run \`${again}\` where your home folder can be written.`,
    ENOTDIR: `A file stands where a folder belongs on that path (such as ~/.agents being a file); move it aside, then run \`${again}\` again.`,
  };
  const next = nextFor[code];
  if (!next) return err;
  const done = (removed ?? []).map(file => displayHomePath(file, home));
  return writeFailed(at, home, err, [], {
    shown: `the computer-level agent text at ${displayHomePath(at, home)}`,
    what: remove ? 'remove' : 'write',
    outcome: remove
      ? done.length > 0
        ? `Already removed: ${done.join(', ')}.`
        : 'The computer-level agent text was not removed.'
      : 'The computer-level agent text was not written.',
    next,
  });
}

/**
 * The install step to print for `packages` in the project at `cwd`: the
 * install guidance its integrations give, else its package manager's command,
 * or `npm install` with a note when its lockfiles disagree.
 * @param {string[]} packages
 * @param {string} cwd
 * @returns {{line: string, note: string | null}}
 */
export function projectInstallStep(packages, cwd) {
  return installStepFor(packages, cwd);
}

/**
 * The project root a skill place belongs to, or null when no folder above
 * `cwd` has a package.json.
 * @param {string} cwd
 * @returns {string | null}
 */
export function skillProjectRoot(cwd) {
  return resolveAgentDocsRoot(cwd);
}


/**
 * Save the project places in `skills.to` of the project's config: no key for
 * the default alone, and no config file when nothing else is left in it. A
 * protected or dynamic config throws, before any file is written.
 * @param {string} projectRoot
 * @param {readonly import('../../foundation/agent-docs/skill-places.mjs').SkillPlace[]} places
 * @param {{check?: boolean}} [options] `check`: throw as the save would, and
 *   write nothing, so a run can stop before it changes any place
 */
export function saveProjectPlaces(projectRoot, places, {check = false} = {}) {
  let written;
  try {
    written = setConfigValues(projectRoot, [['skills.to', projectPlacesValue(places)]], {check});
  } catch (error) {
    // A protected config keeps the stable code every consumer-file writer
    // uses (spec:AST-040 FR4, FR6).
    const code = /** @type {{code?: unknown}} */ (error)?.code;
    const stable = [
      ERROR_CODES.ERR_CODEMOD_PROTECTED,
      ERROR_CODES.ERR_CODEMOD_PROTECTION_SOURCE,
    ].find(each => each === code);
    throw new AstryxError(
      error instanceof Error ? error.message : String(error),
      undefined,
      stable ?? ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
  // A config left holding nothing says what no config says, so it goes, as
  // after a move back to the default place in a project init gave a config.
  if (
    !check &&
    written.changed &&
    /^export default \{\};?\s*$/u.test(fs.readFileSync(written.file, 'utf8'))
  ) {
    fs.unlinkSync(written.file);
  }
}

/**
 * Refuse a project place whose skill files resolve outside the project, as
 * through a skills folder linked out of it, before anything is written.
 * @param {import('../../foundation/agent-docs/skill-places.mjs').SkillPlace} place
 * @param {string} projectRoot
 */
export function assertPlaceWithin(place, projectRoot) {
  for (const file of placeSkillFiles(place, projectRoot)) {
    try {
      assertWithin(path.relative(projectRoot, file), projectRoot, {label: 'skill file'});
    } catch (err) {
      if (!(err instanceof PathSafetyError)) throw err;
      throw new AstryxError(
        `${err.message} Astryx writes the project skill only inside the project; make that folder a real folder in the project, or choose another place with \`--to\`.`,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
  }
}

/**
 * The project skill's text for the project at `projectRoot`.
 * @param {string} projectRoot
 * @returns {Promise<string>}
 */
export async function projectSkillText(projectRoot) {
  return renderProjectSkill(await renderAgentDocsBlock(projectRoot));
}

/**
 * The computer-level skill's text, for a folder outside any project.
 * @param {string} command
 * @returns {string}
 */
export function computerSkillText(command) {
  return renderComputerAgentText({command, install: computerInstallStep()});
}

/**
 * Write `text` to each skill file of `place`. The copies of one place are
 * written together or not at all: when any is a person's own (edited, or not
 * Astryx's), each is kept, so every agent reads one text.
 * @param {import('../../foundation/agent-docs/skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @param {string} text
 * @returns {Array<{file: string, action: import('../../foundation/agent-docs/managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx' | 'pair-kept'}>}
 */
export function writeSkillPlace(place, projectRoot, text) {
  const files = placeSkillFiles(place, projectRoot);
  const states = files.map(file => ({file, state: managedFileState(file, text)}));
  const owned = (/** @type {string} */ state) => state === 'edited' || state === 'foreign';
  if (files.length > 1 && states.some(each => owned(each.state))) {
    return states.map(({file, state}) => ({
      file,
      action: /** @type {const} */ ('kept'),
      reason: owned(state) ? keptReason(/** @type {'edited' | 'foreign'} */ (state)) : /** @type {const} */ ('pair-kept'),
    }));
  }
  return files.map(file => ({file, ...writeManagedFile(file, text)}));
}

/**
 * Remove each skill file of `place` that is an unedited Astryx file.
 * @param {import('../../foundation/agent-docs/skill-places.mjs').SkillPlace} place
 * @param {string | null} projectRoot
 * @returns {Array<{file: string, action: import('../../foundation/agent-docs/managed-skill-file.mjs').ManagedFileAction, reason?: 'edited' | 'not-astryx'}>}
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
 * Add folders outside any project to the ones the settings file records.
 * @param {readonly string[]} folders as saved: `~/<path>` or absolute
 */
export function addComputerSkillFolders(folders) {
  const saved = computerSkillFolders();
  recordComputerSkillFolders([...new Set([...saved, ...folders])]);
}
