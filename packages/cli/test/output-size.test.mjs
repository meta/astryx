// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Output size guard: the most-read default answers keep their recorded
 *   size, so a change cannot make them grow back unnoticed.
 *
 * @input Core's own catalog read from a fresh consumer project inside the
 *   repo, and the recorded sizes in `output-sizes.json`.
 * @output A failure for any case that grew more than 5% past its recorded
 *   size, shrank more than 10% below it, or newly passed its kind's budget.
 * @position Runs the real CLI in process through runCli, so it measures what
 *   an agent running the binary reads: standard output and standard error.
 *
 * When a size changes on purpose, record it with
 * `UPDATE_OUTPUT_SIZES=1 pnpm exec vitest run --project node packages/cli/test/output-size.test.mjs`
 * and say why in the pull request. A shrink is recorded too, so the answer
 * cannot grow back to its old size. docs/contributing/cli-conventions.md
 * says how to keep an answer short.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {runCli} from '../test-utils/run-cli.mjs';

const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');
const SIZES_FILE = path.join(CLI_ROOT, 'test', 'output-sizes.json');
const UPDATE = process.env.UPDATE_OUTPUT_SIZES === '1';

/**
 * Growth past the recorded size that still passes. A new prop or a reworded
 * sentence adds 1 to 2% to a component read; a new section, a repeated label
 * on every item or a longer default adds more, and those are what this catches
 * before they add up release after release.
 */
const GROW = 0.05;
/**
 * Shrink below the recorded size that still passes without a new record.
 * Smaller changes are wording; a larger one is a shortening, and recording it
 * keeps the answer from growing back to its old size.
 */
const SHRINK = 0.1;
/**
 * Slack in bytes, about one short sentence, so a short answer such as a hook
 * read or an error does not fail on a one-word change.
 */
const SLACK = 64;

/**
 * Bytes a default answer of each kind may print. A read is one artifact an
 * agent keeps beside its code; a list is scanned to pick one item; a report
 * says what one run did or found; an error names what went wrong and the next
 * step. An answer that needs more prints the first part and the command that
 * prints the rest.
 */
const BUDGET = {
  read: 16 * 1024,
  list: 12 * 1024,
  report: 4 * 1024,
  error: 2 * 1024,
};

/**
 * The most-read default answers: component and hook reads, docs topics,
 * search, and the lists agents open first. `build` has its own grader, so it
 * is not repeated here.
 * @type {{kind: keyof typeof BUDGET, args: string[], status?: number}[]}
 */
const CASES = [
  {kind: 'read', args: ['component', 'Button']},
  {kind: 'read', args: ['component', 'Table']},
  {kind: 'read', args: ['component', 'TextInput']},
  {kind: 'read', args: ['component', 'Selector']},
  {kind: 'read', args: ['component', 'Card']},
  {kind: 'read', args: ['component', 'Button', '--props']},
  {kind: 'read', args: ['hook', 'useToast']},
  {kind: 'read', args: ['docs', 'layout']},
  {kind: 'read', args: ['docs', 'tokens']},
  {kind: 'list', args: ['component']},
  {kind: 'list', args: ['docs']},
  {kind: 'list', args: ['search', 'button']},
  {kind: 'list', args: ['search', 'toast notification']},
  {kind: 'list', args: ['search', 'date picker']},
  {kind: 'list', args: ['template', '--list']},
  {kind: 'list', args: ['upgrade', '--list']},
  {kind: 'list', args: ['help']},
  {kind: 'report', args: ['doctor']},
];

/** @param {string[]} args */
const label = args => args.join(' ');

/** @type {Record<string, number>} */
const recorded = fs.existsSync(SIZES_FILE)
  ? JSON.parse(fs.readFileSync(SIZES_FILE, 'utf8'))
  : {};
/** @type {Record<string, number>} */
const measured = {};

let project = '';

beforeAll(() => {
  // A consumer project inside the repo, so Core resolves to this checkout.
  project = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-output-size-'));
  const deps = {
    '@astryxdesign/core': 'packages/core',
    '@astryxdesign/cli': 'packages/cli',
  };
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({
      name: 'output-size-consumer',
      version: '1.0.0',
      type: 'module',
      dependencies: Object.fromEntries(Object.keys(deps).map(n => [n, '*'])),
    }),
  );
  for (const [name, rel] of Object.entries(deps)) {
    const link = path.join(project, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(path.join(REPO_ROOT, rel), link);
  }
  fs.mkdirSync(path.join(project, 'src'));
});

afterAll(() => {
  if (project) fs.rmSync(project, {recursive: true, force: true});
  if (UPDATE) {
    const sorted = Object.fromEntries(
      CASES.map(c => label(c.args)).map(key => [key, measured[key]]),
    );
    fs.writeFileSync(SIZES_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  }
});

describe('output size guard', () => {
  it.each(CASES.map(c => [label(c.args), c]))(
    '%s',
    async (key, c) => {
      const result = await runCli(c.args, project);
      expect(result.status, result.stderr).toBe(c.status ?? 0);
      const bytes = Buffer.byteLength(result.stdout + result.stderr, 'utf8');
      measured[key] = bytes;
      if (UPDATE) return;

      const was = recorded[key];
      expect(
        was,
        `No recorded size for \`astryx ${key}\`: record it with UPDATE_OUTPUT_SIZES=1.`,
      ).toBeTypeOf('number');
      const budget = BUDGET[c.kind];
      const record =
        'Record the new size with UPDATE_OUTPUT_SIZES=1 and say why in the pull request.';
      expect(
        bytes,
        `\`astryx ${key}\` grew from ${was} to ${bytes} bytes. Shorten it (docs/contributing/cli-conventions.md, "Output: keep answers short"), or, when the growth is the point of the change: ${record}`,
      ).toBeLessThanOrEqual(Math.round(was * (1 + GROW)) + SLACK);
      expect(
        bytes,
        `\`astryx ${key}\` shrank from ${was} to ${bytes} bytes. ${record} Then it cannot grow back unnoticed.`,
      ).toBeGreaterThanOrEqual(Math.round(was * (1 - SHRINK)) - SLACK);
      if (was <= budget) {
        expect(
          bytes,
          `\`astryx ${key}\` passed the ${budget}-byte budget of a ${c.kind} (${bytes} bytes). Print less by default and point to the rest.`,
        ).toBeLessThanOrEqual(budget);
      }
    },
    60_000,
  );

  it('records a size for every case and no other', () => {
    if (UPDATE) return;
    expect(Object.keys(recorded).sort()).toEqual(
      CASES.map(c => label(c.args)).sort(),
    );
  });
});
