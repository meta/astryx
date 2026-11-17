// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The places `astryx init --to` puts the Astryx skill, and how a
 * project and the computer remember them.
 *
 * A place is one of:
 * - `agents-md`: the managed block in AGENTS.md and the agent files beside
 *   it. The default for a project, and the place when nothing is saved.
 * - `skills`: the project's skills folders,
 *   `.agents/skills/astryx-project/SKILL.md` and a copy at
 *   `.claude/skills/astryx-project/SKILL.md` (`PROJECT_SKILL_FOLDERS`). Each
 *   is a regular file: a link in a repository breaks in a checkout that does
 *   not make links. The two copies are one place: when either is a person's
 *   own, neither is written, so every agent reads one text.
 * - `user`: the computer-level skill (`computer-agent-text.mjs`).
 * - a folder: a folder inside the project gets the project skill,
 *   `<folder>/astryx-project/SKILL.md`, and is saved in the project's config;
 *   any other folder gets the computer-level skill, `<folder>/astryx/SKILL.md`,
 *   and is saved in the settings file.
 *
 * A folder is written as a path (`./team`, `../skills`, `~/team-skills`, an
 * absolute path), so a misspelled keyword is refused, not made a folder.
 *
 * The project skill is the managed block, byte for byte, under skill
 * frontmatter, with the hash line that tells an edited file from an older
 * rendering (`managed-skill-file.mjs`).
 *
 * @input  the `--to` list, the project root, the saved places
 * @output parsed places, the files each place holds, the project skill text
 * @position foundation/agent-docs — read by `init`
 */

import * as os from 'node:os';
import * as path from 'node:path';
import {
  MARKER_START,
  PROJECT_SKILL_FOLDERS,
  PROJECT_SKILL_NAME,
} from './agent-doc-state.mjs';
import {withHash} from './managed-skill-file.mjs';
import {PROJECT_PLACE_KEYWORDS} from '../../authoring/config/skill-places.mjs';

/**
 * The keywords `--to` takes besides a folder: the project place keywords
 * astryx.config accepts in `skills.to`, and `user`. One list, so the config
 * check and init never disagree.
 */
export const PLACE_KEYWORDS = Object.freeze([...PROJECT_PLACE_KEYWORDS, 'user']);

/** The project place that holds the block; the default. */
export const AGENTS_MD_PLACE = 'agents-md';

// The project skills folders and the project skill's name live in the leaf
// module, so the setup check reads them without loading this one.
export {PROJECT_SKILL_FOLDERS, PROJECT_SKILL_NAME} from './agent-doc-state.mjs';

/** The computer-level skill's name and folder name. */
export const COMPUTER_SKILL_NAME = 'astryx';

/**
 * When an agent loads the project skill; the frontmatter `description`. One
 * sentence.
 */
export const PROJECT_SKILL_DESCRIPTION =
  'This project builds its UI with Astryx, a design system and UI library, through the astryx command; use it whenever you build or change a page or any UI here (components, layout, styling, theming, a doctor finding), even when the request never says Astryx.';

/** The sentence every refusal of a place ends with. */
export const VALID_PLACES_HINT =
  'Valid places: agents-md (the AGENTS.md block, the default), skills (the project skills folders), user (this computer), or a folder written as a path, such as ./team-skills or ~/team-skills.';

/** A place `--to` named that cannot be used. */
export class SkillPlaceError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(`${message} ${VALID_PLACES_HINT}`);
    this.name = 'SkillPlaceError';
  }
}

/**
 * One parsed place. `scope`: `project` places are saved in the project's
 * config, `computer` places in the settings file. A folder carries its
 * absolute path and the text it is saved as: `./` and its path from the
 * project root, or, for a computer folder, `~/` and its path in the home
 * folder, else its absolute path.
 * @typedef {{scope: 'project', kind: 'agents-md' | 'skills'}
 *   | {scope: 'computer', kind: 'user'}
 *   | {scope: 'project' | 'computer', kind: 'folder', dir: string, saved: string}} SkillPlace
 */

/**
 * Whether `value` is written as a path rather than a word.
 * @param {string} value
 * @returns {boolean}
 */
function writtenAsPath(value) {
  return (
    value.startsWith('.') ||
    value.startsWith('~') ||
    value.includes('/') ||
    value.includes('\\') ||
    path.isAbsolute(value)
  );
}

/**
 * `value` as an absolute path: `~` is the home folder, a relative path is
 * from `cwd`.
 * @param {string} value
 * @param {string} cwd
 * @param {string} home
 * @returns {string}
 */
function absoluteFolder(value, cwd, home) {
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(home, value.slice(2));
  }
  return path.resolve(cwd, value);
}

/**
 * How a computer folder is saved: `~/` and its path in the home folder, else
 * its absolute path, so a later run finds it from any folder.
 * @param {string} dir absolute
 * @param {string} home
 * @returns {string}
 */
function homePath(dir, home) {
  return inside(dir, home) && dir !== home
    ? `~/${path.relative(home, dir).split(path.sep).join('/')}`
    : dir;
}

/**
 * The computer-level skill file of a folder saved outside any project, from
 * the text it is saved as (`~/<path>` or absolute).
 * @param {string} saved
 * @param {string} [home]
 * @returns {string}
 */
export function savedComputerFolderSkillFile(saved, home = os.homedir()) {
  return path.join(absoluteFolder(saved, home, home), COMPUTER_SKILL_NAME, 'SKILL.md');
}

/**
 * Whether `dir` is `root` or inside it.
 * @param {string} dir
 * @param {string} root
 * @returns {boolean}
 */
function inside(dir, root) {
  const rel = path.relative(root, dir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Split a `--to` value (a comma list, or several) into its names.
 * @param {string | readonly string[]} value
 * @returns {string[]}
 */
export function placeNames(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap(each => String(each).split(','))
    .map(each => each.trim())
    .filter(each => each.length > 0);
}

/**
 * Parse place names. A folder resolves from `cwd`; it is a project place
 * when it is inside `projectRoot`. Throws SkillPlaceError for an unknown
 * word, a project place with no project, and an empty list.
 * @param {readonly string[]} names
 * @param {{cwd: string, projectRoot: string | null, home?: string}} where
 * @returns {SkillPlace[]}
 */
export function parsePlaces(names, {cwd, projectRoot, home = os.homedir()}) {
  if (names.length === 0) throw new SkillPlaceError('`--to` needs a place.');
  /** @type {SkillPlace[]} */
  const places = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const name of names) {
    /** @type {SkillPlace} */
    let place;
    if (name === 'user') {
      place = {scope: 'computer', kind: 'user'};
    } else if (/** @type {readonly string[]} */ (PROJECT_PLACE_KEYWORDS).includes(name)) {
      if (projectRoot == null && name === 'skills') {
        throw new SkillPlaceError(
          '`--to skills` writes the project skills folders, and this folder is not in a project.',
        );
      }
      place = {scope: 'project', kind: /** @type {'agents-md' | 'skills'} */ (name)};
    } else if (writtenAsPath(name)) {
      const dir = absoluteFolder(name, cwd, home);
      if (projectRoot != null && inside(dir, projectRoot)) {
        const rel = path.relative(projectRoot, dir).split(path.sep).join('/');
        place = {
          scope: 'project',
          kind: 'folder',
          dir,
          saved: rel ? `./${rel}` : '.',
        };
      } else {
        place = {scope: 'computer', kind: 'folder', dir, saved: homePath(dir, home)};
      }
    } else {
      throw new SkillPlaceError(`Unknown place "${name}".`);
    }
    const key = placeKey(place);
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(place);
  }
  return places;
}

/**
 * The text a place is saved as.
 * @param {SkillPlace} place
 * @returns {string}
 */
export function savedName(place) {
  return place.kind === 'folder' ? place.saved : place.kind;
}

/**
 * A place's identity: two places with one key are one place.
 * @param {SkillPlace} place
 * @returns {string}
 */
function placeKey(place) {
  return place.kind === 'folder' ? `folder:${place.dir}` : place.kind;
}

/**
 * The project places saved in a config's `skills.to`, parsed; the default
 * (`agents-md`) when nothing is saved. A saved value that no longer parses
 * is left out, so a config written by a newer release still sets up the
 * places this one knows.
 * @param {{skills?: {to?: string | string[]}} | undefined} config
 * @param {string} projectRoot
 * @returns {SkillPlace[]}
 */
export function savedProjectPlaces(config, projectRoot) {
  const to = config?.skills?.to;
  if (to == null) return [{scope: 'project', kind: 'agents-md'}];
  /** @type {SkillPlace[]} */
  const places = [];
  for (const name of placeNames(to)) {
    try {
      places.push(
        ...parsePlaces([name], {cwd: projectRoot, projectRoot}).filter(
          place => place.scope === 'project',
        ),
      );
    } catch {
      // Not a place this release knows.
    }
  }
  return places;
}

/**
 * The value a project's `skills.to` is saved as: null (no key) for the
 * default alone, one name, or a list.
 * @param {readonly SkillPlace[]} projectPlaces
 * @returns {string | string[] | null}
 */
export function projectPlacesValue(projectPlaces) {
  const names = projectPlaces.map(savedName);
  if (names.length === 1 && names[0] === AGENTS_MD_PLACE) return null;
  return names.length === 1 ? /** @type {string} */ (names[0]) : names;
}

/**
 * The skill files a place holds, absolute. `agents-md` holds none: its files
 * are the agent docs. `user` holds the computer-level skill, which
 * `computer-agent-text.mjs` writes with its links.
 * @param {SkillPlace} place
 * @param {string | null} projectRoot
 * @returns {string[]}
 */
export function placeSkillFiles(place, projectRoot) {
  if (place.kind === 'skills' && projectRoot != null) {
    return PROJECT_SKILL_FOLDERS.map(folder =>
      path.join(projectRoot, folder, PROJECT_SKILL_NAME, 'SKILL.md'),
    );
  }
  if (place.kind === 'folder') {
    const name = place.scope === 'project' ? PROJECT_SKILL_NAME : COMPUTER_SKILL_NAME;
    return [path.join(place.dir, name, 'SKILL.md')];
  }
  return [];
}

/**
 * The project skill: the managed block under skill frontmatter, with the
 * hash line after the start marker.
 * @param {string} block the managed block, from its start marker to its end marker
 * @returns {string}
 */
export function renderProjectSkill(block) {
  if (!block.startsWith(MARKER_START)) {
    throw new Error('The project skill needs the managed block.');
  }
  return withHash(
    [
      '---',
      `name: ${PROJECT_SKILL_NAME}`,
      // Quoted: the description holds `: ` and `;`, which strict YAML parsers
      // can misread, and an agent tool that fails to parse drops the skill.
      `description: ${JSON.stringify(PROJECT_SKILL_DESCRIPTION)}`,
      '---',
      '',
      block,
      '',
    ].join('\n'),
  );
}
