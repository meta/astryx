// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A managed skill file: a file Astryx owns whole, such as a
 * `SKILL.md`, told apart from a file a person wrote by the Astryx markers,
 * and from an edited one by a hash of its text recorded inside them.
 *
 * - A file without the markers, an edited file, and a symlinked file are
 *   never changed or removed.
 * - An unedited Astryx file with another rendering is replaced.
 *
 * The computer-level skill (`computer-agent-text.mjs`) and the skill places
 * `astryx init --to` writes (`skill-places.mjs`) share these rules.
 *
 * @input  a path and the text this release renders for it, or a skill's name, description and text
 * @output the file's state, the write and remove actions, and the SKILL.md rendering
 * @position foundation/agent-docs — read by the computer-level skill and the
 *   skill places
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {MARKER_START, MARKER_END} from './agent-doc-state.mjs';

/** The line, right after the start marker, that records the file's hash. */
const HASH_LINE = /^<!-- astryx-managed sha256:([0-9a-f]{64}) -->\n/mu;

/**
 * The sha256 of a file's text without its hash line.
 * @param {string} text
 * @returns {string}
 */
function hashOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Insert the hash line after the start marker.
 * @param {string} text a rendering without a hash line
 * @returns {string}
 */
export function withHash(text) {
  const at = text.indexOf(MARKER_START);
  if (at === -1) return text;
  const lineEnd = text.indexOf('\n', at);
  const cut = lineEnd === -1 ? text.length : lineEnd + 1;
  return `${text.slice(0, cut)}<!-- astryx-managed sha256:${hashOf(text)} -->\n${text.slice(cut)}`;
}

/**
 * A SKILL.md file Astryx manages: skill frontmatter, then the text between
 * the Astryx markers, with the hash line after the start marker.
 * @param {{name: string, description: string, block: string}} skill
 *   `block`: the text from the start marker to the end marker
 * @returns {string}
 */
export function renderSkillFile({name, description, block}) {
  if (
    !block.startsWith(MARKER_START) ||
    !block.trimEnd().endsWith(MARKER_END)
  ) {
    throw new Error(
      'A managed skill file needs the managed block, inside the Astryx markers.',
    );
  }
  return withHash(
    [
      '---',
      `name: ${name}`,
      // Quoted: a description can hold `: ` and `;`, which strict YAML parsers
      // can misread, and an agent tool that fails to parse drops the skill.
      `description: ${JSON.stringify(description)}`,
      '---',
      '',
      block,
      '',
    ].join('\n'),
  );
}

/**
 * Whether a file with the markers is unedited: it carries a hash line, and
 * the hash matches the rest of its text.
 * @param {string} content
 * @returns {boolean}
 */
export function isUnedited(content) {
  const match = HASH_LINE.exec(content);
  if (!match) return false;
  return hashOf(content.replace(HASH_LINE, '')) === match[1];
}

/**
 * What is at one path of a managed file.
 * - `absent`: nothing there.
 * - `current`: an Astryx file with exactly this release's rendering.
 * - `differs`: an unedited Astryx file (its recorded hash matches) with
 *   another rendering, such as another release's.
 * - `edited`: an Astryx file (it has the markers) whose text no longer
 *   matches its recorded hash, or that records none: a person changed it.
 *   Never changed.
 * - `foreign`: a file without the Astryx markers, a symlink, or something
 *   other than a regular file. Never changed.
 * @typedef {'absent' | 'current' | 'differs' | 'edited' | 'foreign'} ManagedFileState
 */

/**
 * @param {string} content
 * @returns {boolean}
 */
export function hasMarkers(content) {
  const start = content.indexOf(MARKER_START);
  return start !== -1 && content.indexOf(MARKER_END, start) !== -1;
}

/**
 * The state of one path, read without following a symlinked file.
 * @param {string} file
 * @param {string} expected
 * @returns {ManagedFileState}
 */
export function managedFileState(file, expected) {
  /** @type {fs.Stats} */
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return 'absent';
  }
  if (!stat.isFile()) return 'foreign';
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return 'foreign';
  }
  if (!hasMarkers(content)) return 'foreign';
  if (content === expected) return 'current';
  return isUnedited(content) ? 'differs' : 'edited';
}

/**
 * Write `content` to `file` without following a symlink planted at it.
 * @param {string} file
 * @param {string} content
 */
export function writeNoFollow(file, content) {
  const flags =
    fs.constants.O_WRONLY |
    fs.constants.O_CREAT |
    fs.constants.O_TRUNC |
    (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(file, flags, 0o644);
  try {
    fs.writeFileSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Why a path was kept: a person edited it, or Astryx did not create it.
 * @param {ManagedFileState | 'linked' | 'dangling'} state
 * @returns {'edited' | 'not-astryx'}
 */
export const keptReason = state =>
  state === 'edited' ? 'edited' : 'not-astryx';

/**
 * Remove an unedited Astryx file, or a folder holding only one, and its
 * emptied folder.
 * @param {string} file
 */
export function removeManagedFile(file) {
  fs.unlinkSync(file);
  try {
    fs.rmdirSync(path.dirname(file));
  } catch {
    // The folder holds something else; leave it.
  }
}

/**
 * What a write or a removal did to one managed file. `created`: there was no
 * file. `updated`: an unedited Astryx file with another rendering was
 * replaced. `unchanged`: it already held this text. `removed`: an unedited
 * Astryx file was deleted. `absent`: nothing to remove. `kept`: left as it
 * is, because a person edited it or Astryx did not write it.
 * @typedef {'created' | 'updated' | 'unchanged' | 'removed' | 'absent' | 'kept'} ManagedFileAction
 */

/**
 * Write `expected` to `file` unless the file is current, edited, or not
 * Astryx's; its folder is created as needed.
 * @param {string} file
 * @param {string} expected
 * @returns {{action: ManagedFileAction, reason?: 'edited' | 'not-astryx'}}
 */
export function writeManagedFile(file, expected) {
  const state = managedFileState(file, expected);
  if (state === 'current') return {action: 'unchanged'};
  if (state === 'edited' || state === 'foreign') {
    return {action: 'kept', reason: keptReason(state)};
  }
  fs.mkdirSync(path.dirname(file), {recursive: true});
  writeNoFollow(file, expected);
  return {action: state === 'absent' ? 'created' : 'updated'};
}

/**
 * Remove `file` when it is an unedited Astryx file, and its emptied folder.
 * @param {string} file
 * @returns {{action: ManagedFileAction, reason?: 'edited' | 'not-astryx'}}
 */
export function removeManagedFileIfOwned(file) {
  const state = managedFileState(file, '');
  if (state === 'absent') return {action: 'absent'};
  if (state === 'edited' || state === 'foreign') {
    return {action: 'kept', reason: keptReason(state)};
  }
  removeManagedFile(file);
  return {action: 'removed'};
}
