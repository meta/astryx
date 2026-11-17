// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fixture git repositories for the scripts' tests, written by one
 *   `git fast-import` however many commits, branches and refs they hold.
 * @input A repository path, the commits (ref, parent, message, files) and
 *   more refs to point at them.
 * @output Each named commit's hash.
 * @position Test support. Each git command is a process launch, and a loaded
 *   box makes every launch slow. So a fixture costs two launches: `git init`
 *   and the import.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SIGNATURE = 'Fixture <fixture@example.com>';

/**
 * @typedef {object} FixtureCommit
 * @property {string} ref The ref the commit moves, such as `refs/heads/main`.
 * @property {string} [name] A name for a later commit's `parent` and for the
 *   returned hashes.
 * @property {string} [parent] A named commit of this fixture, or any
 *   commit-ish the repository held before this import. Without it, the commit
 *   follows the last one on its ref in this import, or starts a new history.
 * @property {string[]} [merges] More parents, each named as `parent` is, for a
 *   merge commit. Its tree is the first parent's tree with `files` applied.
 * @property {string} [message]
 * @property {Record<string, string | null>} [files] Content by path; `null`
 *   deletes the path.
 * @property {boolean} [snapshot] The tree holds exactly `files`, with nothing
 *   kept from the parent.
 */

/**
 * Writes `commits` into the repository at `root` with one `git fast-import`.
 * It leaves the index and the working tree as they are.
 * @param {string} root
 * @param {FixtureCommit[]} commits
 * @param {Record<string, string>} [refs] More refs, each set to a named commit.
 * @returns {Record<string, string>} Each named commit's hash.
 */
export function importCommits(root, commits, refs = {}) {
  const time = `${Math.floor(Date.now() / 1000)} +0000`;
  /** @type {Map<string, number>} */
  const marks = new Map();
  /** @type {string[]} */
  const stream = [];
  commits.forEach((commit, index) => {
    const mark = index + 1;
    stream.push(
      `commit ${commit.ref}`,
      `mark :${mark}`,
      `author ${SIGNATURE} ${time}`,
      `committer ${SIGNATURE} ${time}`,
      data(commit.message ?? 'fixture'),
    );
    if (commit.parent !== undefined) {
      const parent = marks.get(commit.parent);
      // `^0` names the commit: fast-import refuses a branch that starts
      // from its own name.
      stream.push(
        `from ${parent === undefined ? `${commit.parent}^0` : `:${parent}`}`,
      );
    }
    for (const other of commit.merges ?? []) {
      const merged = marks.get(other);
      stream.push(
        `merge ${merged === undefined ? `${other}^0` : `:${merged}`}`,
      );
    }
    if (commit.snapshot) stream.push('deleteall');
    for (const [file, content] of Object.entries(commit.files ?? {})) {
      if (content === null) {
        stream.push(`D ${quoted(file)}`);
      } else {
        stream.push(`M 100644 inline ${quoted(file)}`, data(content));
      }
    }
    stream.push('');
    if (commit.name !== undefined) marks.set(commit.name, mark);
  });
  for (const [ref, name] of Object.entries(refs)) {
    stream.push(`reset ${ref}`, `from :${markOf(marks, name)}`, '');
  }
  const names = [...marks.keys()];
  for (const name of names) stream.push(`get-mark :${marks.get(name)}`);
  const hashes = execFileSync('git', ['-C', root, 'fast-import', '--quiet'], {
    input: `${stream.join('\n')}\n`,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  return Object.fromEntries(names.map((name, i) => [name, hashes[i]]));
}

/**
 * Creates a repository at `root` and writes `commits` into it: two process
 * launches in all.
 * @param {string} root
 * @param {FixtureCommit[]} commits
 * @param {{bare?: boolean, branch?: string, refs?: Record<string, string>}} [options]
 *   `branch` names the branch HEAD points at; it defaults to `main`.
 * @returns {Record<string, string>} Each named commit's hash.
 */
export function createRepository(
  root,
  commits,
  {bare = false, branch = 'main', refs = {}} = {},
) {
  execFileSync('git', [
    'init',
    '-q',
    ...(bare ? ['--bare'] : []),
    `--initial-branch=${branch}`,
    root,
  ]);
  return importCommits(root, commits, refs);
}

/**
 * Every file under `root` but `.git`, by path relative to `root`, for a
 * commit that records a working tree a test wrote.
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function workingTreeFiles(root) {
  /** @type {Record<string, string>} */
  const files = {};
  const pending = [''];
  while (pending.length > 0) {
    const relative = /** @type {string} */ (pending.pop());
    for (const entry of fs.readdirSync(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (child !== '.git') pending.push(child);
      } else if (entry.isFile()) {
        files[child] = fs.readFileSync(path.join(root, child), 'utf8');
      }
    }
  }
  return files;
}

/** @param {Map<string, number>} marks @param {string} name */
function markOf(marks, name) {
  const mark = marks.get(name);
  if (mark === undefined) throw new Error(`no fixture commit named ${name}`);
  return mark;
}

/** @param {string} text */
function data(text) {
  return `data ${Buffer.byteLength(text)}\n${text}`;
}

// fast-import needs C-style quotes for a path that starts with a quote or
// holds a line feed, and accepts them for any path.
/** @param {string} file */
function quoted(file) {
  return /[\s"\\]/.test(file) ? JSON.stringify(file) : file;
}
