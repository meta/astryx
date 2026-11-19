// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Astryx's own docs write commands bare, and nothing tells a reader to
 * run the unscoped name through npx (RUNNER_COMMAND_ALLOWLIST says where a
 * runner is allowed, and why).
 *
 * The matcher is the one `doctor integration validate` holds integrations to
 * (runnerCommandsIn). Core's own docs are held one step further: outside the
 * named runner examples they do not write the scoped `npx @astryxdesign/cli`
 * either, because the docsite and the CLI add the runner.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {RUNNER_COMMAND_ALLOWLIST} from '../foundation/discovery/runner-allowlist.mjs';
import {runnerCommandsIn} from '../foundation/discovery/runner-commands.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
/** A download runner with the scoped package name, which Core's docs leave to the docsite. */
const SCOPED = new RegExp(
  String.raw`(?<![\w@/-])(?:npx|pnpm\s+dlx|yarn\s+dlx|bunx|bun\s+x|npm\s+exec)\s+@astryxdesign/cli(?:@[\w.-]+)?(?![\w/-])`,
  'gu',
);

const files = execFileSync(
  'git',
  ['ls-files', 'packages/core', 'packages/cli', 'README.md'],
  {cwd: REPO, encoding: 'utf8'},
)
  .split('\n')
  .filter(file => /\.(?:[cm]?[jt]sx?|md)$/u.test(file))
  .filter(file => !RUNNER_COMMAND_ALLOWLIST.skip.some(re => re.test(file)));

/**
 * @param {string} file
 * @param {(line: string) => string[]} find the commands a line writes
 */
function hits(file, find) {
  const text = fs.readFileSync(path.join(REPO, file), 'utf8');
  return text
    .split('\n')
    .flatMap((line, i) => find(line).map(each => `${file}:${i + 1}: ${each}`));
}

/** @param {string} line */
const unscoped = line =>
  runnerCommandsIn(line)
    .filter(each => each.download)
    .map(each => each.written);

/** @param {string} line */
const withRunner = line => [
  ...runnerCommandsIn(line).map(each => each.written),
  ...[...line.matchAll(SCOPED)].map(match => match[0]),
];

describe('runner commands in Astryx docs', () => {
  it('never runs the unscoped name through npx', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(file => hits(file, unscoped))).toEqual([]);
  });

  it('writes commands bare in docs, except the named runner examples', () => {
    const docs = files.filter(
      file =>
        (file.endsWith('.doc.mjs') || file === 'packages/core/docs.mjs') &&
        !(file in RUNNER_COMMAND_ALLOWLIST.runnerExamples),
    );
    expect(docs.length).toBeGreaterThan(100);
    expect(docs.flatMap(file => hits(file, withRunner))).toEqual([]);
  });

  it('names only files that exist', () => {
    for (const file of Object.keys(RUNNER_COMMAND_ALLOWLIST.runnerExamples)) {
      expect(fs.existsSync(path.join(REPO, file)), file).toBe(true);
    }
  });
});
