// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Turns a recording run's lines into the test-inputs record.
 * @input The `.jsonl` lines scripts/test-inputs/record.mjs wrote in one or
 *   more Node legs (one folder per leg), the checkout they ran in and its
 *   commit.
 * @output The record: for each test file, the repository folders whose files
 *   it read (`folders`), the folders it listed (`listed`: a change anywhere
 *   under one can change what it sees), the folders it checked as a whole
 *   (`checked`: they matter only by being there), the paths it probed for
 *   and found missing (`probed`: they matter once they exist), the package
 *   trees
 *   whose build it
 *   read (`trees`), and what it did that the record cannot see (`unseen`).
 * @position Main's full unit run merges its legs' lines with it and keeps the
 *   record as an artifact; a pull request selects its file-reading tests by it
 *   (scripts/test-inputs/select.mjs, spec:AST-030 FR13). Node built-ins only.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {folderOf} from './select.mjs';

export const RECORD_VERSION = 3;

/** Each owner's lines, joined. */
function byOwner(lines) {
  const owners = new Map();
  for (const line of lines) {
    let entry = owners.get(line.for);
    if (entry == null) {
      entry = {
        reads: new Set(),
        probes: new Set(),
        lists: new Set(),
        writes: new Set(),
        unseen: new Set(),
      };
      owners.set(line.for, entry);
    }
    for (const key of ['reads', 'probes', 'lists', 'writes', 'unseen']) {
      for (const value of line[key] ?? []) entry[key].add(value);
    }
  }
  return owners;
}

/** Whether `target` is `root` or lies under it. */
const within = (target, root) =>
  target === root || target.startsWith(`${root}/`);

/** Whether `target` or a folder above it is in `paths`. */
function underAny(target, paths) {
  for (let at = target; ; at = path.dirname(at)) {
    if (paths.has(at)) return true;
    if (path.dirname(at) === at) return false;
  }
}

/**
 * The record of one leg's lines.
 * @param {object[]} lines
 * @param {object} repo
 * @param {string} repo.root the checkout's real path
 * @param {Set<string>} repo.tracked tracked repository paths
 * @param {(paths: string[]) => Set<string>} repo.ignored the paths among these
 *   that git ignores (build output)
 */
export function mergeLeg(lines, {root, tracked, ignored}) {
  const owners = byOwner(lines);
  const steps = [...owners].filter(([owner]) => owner.startsWith('step:'));
  // A package's folder: the deepest one with a tracked package.json.
  const packageRoots = [...tracked]
    .filter(file => file.endsWith('/package.json'))
    .map(file => path.posix.dirname(file))
    .sort((a, b) => b.length - a.length);
  const packageOf = rel => packageRoots.find(dir => within(rel, dir)) ?? null;
  // A tracked file, or a folder that holds one: a write there (a test that
  // edits and restores a checkout file) never hides that it was read.
  const trackedDirs = new Set(['.']);
  for (const file of tracked) {
    for (
      let dir = path.posix.dirname(file);
      dir !== '.';
      dir = path.posix.dirname(dir)
    ) {
      if (trackedDirs.has(dir)) break;
      trackedDirs.add(dir);
    }
  }
  const inCheckout = rel =>
    rel != null && (tracked.has(rel) || trackedDirs.has(rel));
  const relative = target =>
    within(target, root) ? target.slice(root.length + 1) || '.' : null;
  const untracked = new Set();
  for (const [, entry] of owners) {
    for (const target of [...entry.reads, ...entry.lists]) {
      const rel = relative(target);
      if (rel != null && rel !== '.' && !tracked.has(rel)) untracked.add(rel);
    }
  }
  const built = ignored([...untracked]);

  // What each step made: a write to the checkout itself (a tracked file or
  // folder) or to the installed dependencies makes nothing a test reads.
  const producedBy = new Map(
    steps.map(([name, entry]) => [
      name,
      new Set(
        [...entry.writes].filter(target => {
          const rel = relative(target);
          return (
            !inCheckout(rel) && !(rel ?? '').split('/').includes('node_modules')
          );
        }),
      ),
    ]),
  );
  const memo = new Map();
  const inputsOf = (owner, entry, visiting = new Set()) => {
    if (memo.has(owner)) return memo.get(owner);
    visiting.add(owner);
    const folders = new Set();
    const listedFolders = new Set();
    const checked = new Set();
    const probed = new Set();
    const trees = new Set();
    const unseen = new Set(entry.unseen);
    const add = (target, listed) => {
      const rel = relative(target);
      // Installed dependencies follow the lockfile, whose change runs every
      // test.
      if (rel != null && rel.split('/').includes('node_modules')) return;
      // A package's build output: a bundler that built it reads where this
      // record cannot see, but only the package it builds.
      const pkg = rel != null && built.has(rel) ? packageOf(rel) : null;
      const made = !inCheckout(rel);
      if (made && underAny(target, entry.writes)) return;
      const step = !made
        ? null
        : steps.find(
            ([name]) =>
              name !== owner &&
              !visiting.has(name) &&
              underAny(target, producedBy.get(name)),
          );
      if (step != null) {
        const from = inputsOf(step[0], step[1], visiting);
        for (const value of from.folders) folders.add(value);
        for (const value of from.listed) listedFolders.add(value);
        for (const value of from.checked) checked.add(value);
        for (const value of from.probed) probed.add(value);
        for (const value of from.trees) trees.add(value);
        if (pkg != null) {
          if (from.unseen.length > 0) trees.add(`${pkg}/`);
        } else {
          for (const value of from.unseen) unseen.add(value);
        }
        return;
      }
      if (rel != null && built.has(rel)) {
        if (pkg == null) unseen.add(`reads ${rel}, built outside any package`);
        else trees.add(`${pkg}/`);
        return;
      }
      // Outside the checkout: a fixture the test made from what it read, or
      // the system.
      if (rel == null) return;
      // A listing changes with anything under the folder; a folder checked
      // as a whole (its `stat`) only when it comes or goes.
      if (listed) listedFolders.add(rel);
      else if (trackedDirs.has(rel) && !tracked.has(rel)) checked.add(rel);
      else folders.add(folderOf(rel));
    };
    // A path probed for and missing: what the test sees changes when it
    // comes to exist.
    for (const target of entry.probes) {
      const rel = relative(target);
      if (rel != null && !rel.split('/').includes('node_modules')) {
        probed.add(rel);
      }
    }
    for (const target of entry.reads) add(target, false);
    for (const target of entry.lists) add(target, true);
    visiting.delete(owner);
    const result = {
      folders: [...folders].sort(),
      listed: [...listedFolders].sort(),
      checked: [...checked].sort(),
      probed: [...probed].sort(),
      trees: [...trees].sort(),
      unseen: [...unseen].sort(),
    };
    memo.set(owner, result);
    return result;
  };

  const tests = {};
  for (const [owner, entry] of owners) {
    if (!owner.startsWith('step:')) tests[owner] = inputsOf(owner, entry);
  }
  return tests;
}

/** Every line of every `.jsonl` file in a folder, one file at a time. */
export function* readLines(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    for (const line of fs
      .readFileSync(path.join(dir, name), 'utf8')
      .split('\n')) {
      if (line) yield JSON.parse(line);
    }
  }
}

/**
 * The record of a run's legs, with each set of folders kept once: most
 * test files of one suite read the same folders.
 */
export function mergeLegs(legs, commit) {
  const sets = [];
  const setIds = new Map();
  const idOf = list => {
    const key = list.join('\n');
    if (!setIds.has(key)) {
      setIds.set(key, sets.length);
      sets.push(list);
    }
    return setIds.get(key);
  };
  const tests = {};
  for (const leg of legs) {
    for (const [test, inputs] of Object.entries(leg)) {
      tests[test] = {
        folders: idOf(inputs.folders),
        listed: idOf(inputs.listed),
        checked: idOf(inputs.checked),
        probed: idOf(inputs.probed),
        trees: inputs.trees,
        unseen: inputs.unseen,
      };
    }
  }
  return {version: RECORD_VERSION, commit, sets, tests};
}

/** A record as select.mjs reads it, with each test's folders spelled out. */
export function expandRecord(record) {
  if (record?.version !== RECORD_VERSION) {
    throw new Error(
      `test-inputs record version ${record?.version}, expected ${RECORD_VERSION}`,
    );
  }
  const tests = {};
  for (const [test, entry] of Object.entries(record.tests)) {
    tests[test] = {
      ...entry,
      folders: record.sets[entry.folders],
      listed: record.sets[entry.listed],
      checked: record.sets[entry.checked],
      probed: record.sets[entry.probed],
    };
  }
  return {commit: record.commit, tests};
}

// node scripts/test-inputs/merge.mjs --out <record.json> <leg folder>...
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  if (at === -1 || args.length < 3) {
    console.error(
      'usage: node scripts/test-inputs/merge.mjs --out <record.json> <leg folder>...',
    );
    process.exit(2);
  }
  const out = args[at + 1];
  const dirs = args.filter((_, index) => index !== at && index !== at + 1);
  const git = (gitArgs, input) =>
    execFileSync('git', gitArgs, {
      encoding: 'utf8',
      input,
      maxBuffer: 256 * 1024 * 1024,
    });
  const root = fs.realpathSync(git(['rev-parse', '--show-toplevel']).trim());
  const tracked = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean));
  const ignored = paths => {
    if (paths.length === 0) return new Set();
    let output = '';
    try {
      output = git(
        ['check-ignore', '--no-index', '--stdin', '-z'],
        `${paths.join('\0')}\0`,
      );
    } catch (error) {
      // Exit 1: none of the paths is ignored.
      if (error.status !== 1) throw error;
    }
    return new Set(output.split('\0').filter(Boolean));
  };
  const legs = dirs.map(dir =>
    mergeLeg(readLines(dir), {root, tracked, ignored}),
  );
  const record = mergeLegs(legs, git(['rev-parse', 'HEAD']).trim());
  fs.writeFileSync(out, JSON.stringify(record));
  console.log(
    `${Object.keys(record.tests).length} test files, ${record.sets.length} distinct folder sets, ` +
      `${Object.values(record.tests).filter(entry => entry.unseen.length > 0).length} that the record cannot see whole.`,
  );
}
