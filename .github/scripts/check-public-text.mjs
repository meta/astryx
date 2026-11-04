#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-public-text.mjs
 * @input `--base <sha> --head <sha> --hashes <file>`, run in a full clone. The
 *   PR_TITLE and PR_BODY environment variables, when set.
 * @output One error line for each finding: where it is and what kind it is,
 *   never the text it matched. Exit 0 with no finding, 1 with a finding, 2 when
 *   the range cannot be read.
 * @position Lint runs the base branch's copy on every pull request, over the
 *   commit messages and added lines between the merge base and the head
 *   (spec:AST-030 FR27).
 *
 * Two kinds of check. A shape check finds an internal identifier by its form.
 * A hash check compares each word, and each host's last two labels, with
 * salted SHA-256 digests, so the repository holds no internal name.
 */

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';

export const SALT = 'astryx-public-text:v1:';

export const POLICY =
  'docs/contributing/pull-requests.md#public-repository-boundary';

export const SHAPES = Object.freeze([
  {kind: 'an internal issue id', pattern: /\bkt-[a-z0-9]{4}\b/i},
  {kind: 'an internal change or task id', pattern: /\b[DT][0-9]{6,}\b/},
  {kind: 'an internal paste id', pattern: /\bP[0-9]{9,}\b/},
  {kind: 'an internal host', pattern: /\binternal[a-z]*\.(?:com|net)\b/i},
]);

const WORD = /[a-z0-9][a-z0-9-]*/g;
const HOST = /\b(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*\b/g;

/** The salted digest of one lowercase token. */
export function digest(token) {
  return createHash('sha256')
    .update(SALT + token.toLowerCase())
    .digest('hex');
}

/** The tokens of `text` that the hash check reads: words and hosts. */
export function tokens(text) {
  const lower = text.toLowerCase();
  const found = new Set(lower.match(WORD) ?? []);
  for (const host of lower.match(HOST) ?? []) {
    found.add(host.split('.').slice(-2).join('.'));
  }
  return found;
}

/**
 * The kinds of finding in one piece of text, without the text that matched.
 *
 * @param {string} text
 * @param {Set<string>} digests
 * @returns {string[]}
 */
export function findKinds(text, digests) {
  const kinds = SHAPES.filter(({pattern}) => pattern.test(text)).map(
    ({kind}) => kind,
  );
  for (const token of tokens(text)) {
    if (digests.has(digest(token))) {
      kinds.push('an internal name');
      break;
    }
  }
  return kinds;
}

/**
 * The added lines of a unified diff with no context lines, as
 * `{file, line, text}`.
 *
 * @param {string} diff
 */
export function addedLines(diff) {
  const added = [];
  let file = null;
  let line = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw === '+++ /dev/null' ? null : raw.replace(/^\+\+\+ b\//, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (file == null) continue;
    if (raw.startsWith('+')) {
      added.push({file, line, text: raw.slice(1)});
      line += 1;
    }
  }
  return added;
}

/**
 * Every finding in the pull request's public text.
 *
 * @param {{commits: {sha: string, message: string}[], diff: string,
 *   title?: string, body?: string, digests: Set<string>,
 *   skipFiles?: string[]}} input
 */
export function check({commits, diff, title, body, digests, skipFiles = []}) {
  const findings = [];
  for (const {sha, message} of commits) {
    for (const kind of findKinds(message, digests))
      findings.push({where: `commit ${sha.slice(0, 7)} message`, kind});
  }
  for (const [where, text] of [
    ['pull request title', title],
    ['pull request description', body],
  ]) {
    if (typeof text !== 'string') continue;
    for (const kind of findKinds(text, digests)) findings.push({where, kind});
  }
  for (const {file, line, text} of addedLines(diff)) {
    if (skipFiles.includes(file)) continue;
    for (const kind of findKinds(text, digests))
      findings.push({where: `${file}:${line}`, file, line, kind});
  }
  return findings;
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

/** Reads the range with git. Throws when it cannot be read whole. */
export function readRange(base, head) {
  if (
    !/^[0-9a-f]{7,64}$/i.test(base ?? '') ||
    !/^[0-9a-f]{7,64}$/i.test(head ?? '')
  )
    throw new Error('--base and --head must be commit shas');
  const log = git(['log', '--format=%H%x00%B%x1e', `${base}..${head}`]);
  const commits = log
    .split('\x1e')
    .map(entry => entry.replace(/^\n/, ''))
    .filter(Boolean)
    .map(entry => {
      const [sha, message = ''] = entry.split('\x00');
      return {sha, message};
    });
  if (commits.length === 0) throw new Error('the range has no commits');
  const diff = git([
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--no-renames',
    base,
    head,
  ]);
  return {commits, diff};
}

function main() {
  const args = readArgs(process.argv.slice(2));
  let digests;
  let range;
  try {
    digests = new Set(JSON.parse(fs.readFileSync(args.hashes, 'utf8')));
    range = readRange(args.base, args.head);
  } catch (error) {
    console.log(
      `::error title=Public text check::The check could not read the pull request's commits (${error.message.split('\n')[0]}). It does not pass a range it cannot read.`,
    );
    process.exit(2);
  }
  const findings = check({
    ...range,
    title: process.env.PR_TITLE,
    body: process.env.PR_BODY,
    digests,
    // The digests are hex, and the lockfile's integrity hashes are base64:
    // neither is text a person writes.
    skipFiles: ['.github/public-text-hashes.json', 'pnpm-lock.yaml'],
  });
  for (const {where, file, line, kind} of findings) {
    const at = file ? ` file=${file},line=${line},` : ' ';
    console.log(
      `::error${at}title=Public text check::${where} has ${kind}. Remove the reference there: public text must not carry internal identifiers, hosts or names (${POLICY}). If it is not clear what to remove, ask a maintainer.`,
    );
  }
  if (findings.length > 0) {
    console.log(
      `${findings.length} finding(s). Edit the file or the pull request description, or reword the commit, then push again.`,
    );
    process.exit(1);
  }
  console.log(
    `Checked ${range.commits.length} commit message(s) and the added lines: no internal identifiers.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
