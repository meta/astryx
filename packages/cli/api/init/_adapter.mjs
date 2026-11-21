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
import {renderProjectAgentDocsBlock} from '../docs/_adapter.mjs';
import {
  savedName,
  projectPlacesValue,
  renderProjectSkill,
} from '../../foundation/agent-docs/skill-places.mjs';
import {
  computerSkillFolders,
  recordComputerSkillFolders,
} from '../../foundation/env/user-settings.mjs';
import {setConfigValues} from '../../foundation/config/config-writer.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

export {COMPUTER_COMMAND, COMPUTER_INSTALL_STEP, displayHomePath};
export {
  leftoverIntegrationSkills,
  readProjectPlaces,
  removeIntegrationSkillFiles,
  removeSkillPlace,
  writeSkillPlace,
} from '../../foundation/agent-docs/skill-place-files.mjs';
import {keptText, skillPlaceEscape} from '../../foundation/agent-docs/skill-place-files.mjs';
export {integrationSkillFiles as integrationSkillTexts} from '../docs/skills/skills.mjs';
import {projectIntegrationSkills} from '../docs/_adapter.mjs';

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
  const escape = skillPlaceEscape(place, projectRoot);
  if (escape) throw new AstryxError(escape, undefined, ERROR_CODES.ERR_PATH_TRAVERSAL);
}

/**
 * The project skill's text for the project at `projectRoot`.
 * @param {string} projectRoot
 * @returns {Promise<string>}
 */
export async function projectSkillText(projectRoot) {
  return renderProjectSkill(await renderProjectAgentDocsBlock(projectRoot));
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
 * Add folders outside any project to the ones the settings file records.
 * @param {readonly string[]} folders as saved: `~/<path>` or absolute
 */
export function addComputerSkillFolders(folders) {
  const saved = computerSkillFolders();
  recordComputerSkillFolders([...new Set([...saved, ...folders])]);
}

/**
 * Drop folders outside any project from the ones the settings file records.
 * @param {readonly string[]} folders as saved: `~/<path>` or absolute
 */
export function dropComputerSkillFolders(folders) {
  const drop = new Set(folders);
  const saved = computerSkillFolders();
  if (saved.some(each => drop.has(each))) {
    recordComputerSkillFolders(saved.filter(each => !drop.has(each)));
  }
}

/**
 * The folders outside any project the settings file records.
 * @returns {string[]}
 */
export function computerSkillFoldersSaved() {
  return computerSkillFolders();
}


/**
 * One receipt row, and its line, for one skill file a run wrote or removed.
 * Null for a file that was not there.
 * @param {import('../../foundation/agent-docs/skill-places.mjs').SkillPlace} place
 * @param {{file: string, action: string, reason?: 'edited' | 'not-astryx' | 'pair-kept' | 'computer-skill', skill?: string}} row
 * @param {(file: string) => string} shown the file as the receipt names it
 * @param {string} editedHint what a person does with a file they edited
 * @param {string} [cwd] the folder the command runs in, for the commands a line names
 * @returns {{entry: import('./init.type.mjs').InitSkillFile, line: string} | null}
 */
export function skillReceiptRow(place, row, shown, editedHint, cwd) {
  if (row.action === 'absent') return null;
  /** @type {import('./init.type.mjs').InitSkillFile} */
  const entry = {
    path: shown(row.file),
    place: savedName(place),
    action: /** @type {import('./init.type.mjs').InitSkillFile['action']} */ (row.action),
  };
  if (row.skill) entry.skill = row.skill;
  if (row.reason) entry.reason = row.reason;
  const line =
    entry.action === 'kept'
      ? `[skip] Astryx skill: ${entry.path} ${keptText(entry.reason, editedHint, cwd)}`
      : entry.action === 'unchanged'
        ? `[ok] Astryx skill: ${entry.path} already current, nothing changed`
        : `[ok] Astryx skill: ${entry.path} ${entry.action}`;
  return {entry, line};
}

/**
 * Why each skill the project's integrations declare was left out.
 * @param {string} projectRoot
 * @returns {Promise<Array<{package: string, message: string}>>}
 */
export async function integrationSkillProblems(projectRoot) {
  try {
    return (await projectIntegrationSkills(projectRoot)).problems;
  } catch {
    return [];
  }
}
