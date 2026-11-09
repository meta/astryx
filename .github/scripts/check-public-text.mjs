#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-public-text.mjs
 * @input `--base <sha> --head <sha> --hashes <file> [--pr-json <file>]`, run
 *   in a clone that holds the range. `--pr-json` is the pull request as the
 *   REST API or the event payload gives it, for its title and description.
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
import {pathToFileURL} from 'node:url';

import {readDiff} from '../../scripts/lib/review-diff.mjs';

export const SALT = 'astryx-public-text:v1:';

export const POLICY =
  'docs/contributing/pull-requests.md#public-repository-boundary';

export const SHAPES = Object.freeze([
  {kind: 'an internal issue id', pattern: /\bkt-[a-z0-9]{4}\b/i},
  // Not after `#`: an upper-case hex colour after `#` is no id.
  {kind: 'an internal change or task id', pattern: /(?<!#)\b[DT][0-9]{6,}\b/},
  {kind: 'an internal paste id', pattern: /\bP[0-9]{9,}\b/},
  {kind: 'an internal host', pattern: /\binternal[a-z]*\.(?:com|net)\b/i},
]);

const WORD = /[A-Za-z0-9][A-Za-z0-9-]*/g;
const HOST = /\b(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*\b/g;
// Between a lower-case letter or digit and an upper-case one, and before the
// last capital of a run that starts a word: `useNameSession`, `HTTPServer`.
const CAMEL_PART = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;

/** The salted digest of one lowercase token. */
export function digest(token) {
  return createHash('sha256')
    .update(SALT + token.toLowerCase())
    .digest('hex');
}

/**
 * The tokens of `text` that the hash check reads: each word, each part of a
 * hyphenated or camel-case word, and each host's last two labels.
 */
export function tokens(text) {
  const found = new Set();
  for (const word of text.match(WORD) ?? []) {
    found.add(word.toLowerCase());
    for (const part of word.split('-')) {
      if (part === '') continue;
      found.add(part.toLowerCase());
      for (const piece of part.split(CAMEL_PART))
        found.add(piece.toLowerCase());
    }
  }
  for (const host of text.toLowerCase().match(HOST) ?? []) {
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

/** The added lines of a unified diff, as `{file, line, text}`. */
export function addedLines(diff) {
  return readDiff(diff).everyAddedLine;
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

const SHA = /^[0-9a-f]{7,64}$/i;

/** Reads the range with git. Throws when it cannot be read whole. */
export function readRange(base, head) {
  if (!SHA.test(base ?? '') || !SHA.test(head ?? ''))
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
  return {commits, diff: readDiffBetween(base, head)};
}

/**
 * Reads exactly the pull request's commits from the commit list GitHub
 * reports (one `{"sha", "message"}` JSON object a line), and its added lines
 * from the diff between the base branch tip and the merge of the head into it.
 * A shallow clone cannot misplace the merge base here, so the base branch's
 * own commits are never read as the pull request's. Throws when the list is
 * empty or unreadable.
 */
export function readPullRequestRange(commitsText, diffBase, diffHead) {
  if (!SHA.test(diffBase ?? '') || !SHA.test(diffHead ?? ''))
    throw new Error('--diff-base and --diff-head must be commit shas');
  const commits = commitsText
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const {sha, message} = JSON.parse(line);
      if (!SHA.test(sha ?? '') || typeof message !== 'string')
        throw new Error('a listed commit has no sha or message');
      return {sha, message};
    });
  if (commits.length === 0) throw new Error('the commit list is empty');
  return {commits, diff: readDiffBetween(diffBase, diffHead)};
}

function readDiffBetween(base, head) {
  // `--text` and `--no-textconv`: a path marked binary in `.gitattributes`
  // shows its added lines too. Renames are found, so a moved file shows only
  // the lines its move changed.
  const diff = git([
    // Paths come unquoted, so a non-ASCII path reads as it is.
    '-c',
    'core.quotePath=false',
    'diff',
    '--text',
    '--no-textconv',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--find-renames',
    base,
    head,
  ]);
  if (readDiff(diff).unreadable)
    throw new Error('a changed file has a path the check cannot read');
  return diff;
}

/**
 * The title and description from the pull request JSON: the REST API's pull
 * request, or an event payload that holds one under `pull_request`.
 */
export function readPullRequest(text) {
  const json = JSON.parse(text);
  const pr = json.pull_request ?? json;
  if (typeof pr.title !== 'string')
    throw new Error('the pull request JSON has no title');
  return {title: pr.title, body: typeof pr.body === 'string' ? pr.body : ''};
}

function main() {
  const args = readArgs(process.argv.slice(2));
  let digests;
  let range;
  let pr = {};
  try {
    digests = new Set(JSON.parse(fs.readFileSync(args.hashes, 'utf8')));
    range =
      args['commits-json'] != null
        ? readPullRequestRange(
            fs.readFileSync(args['commits-json'], 'utf8'),
            args['diff-base'],
            args['diff-head'],
          )
        : readRange(args.base, args.head);
    if (args['pr-json'] != null)
      pr = readPullRequest(fs.readFileSync(args['pr-json'], 'utf8'));
  } catch (error) {
    console.log(
      `::error title=Public text check::The check could not read the pull request's commits, the digests or the description (${error.message.split('\n')[0]}). It does not pass what it cannot read.`,
    );
    process.exit(2);
  }
  const findings = check({
    ...range,
    title: pr.title,
    body: pr.body,
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
