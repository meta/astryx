// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract for the Chromium selection's replay record
 *   (`.github/interaction-selection-replay.json`): one row a pull request,
 *   public data only, and no escape left without a reviewed note.
 * @position Node contract for spec:AST-030 FR31's replay evidence.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  failedInteractionJobs,
  failingSpecs,
  laneScope,
  reviewKey,
} from './interaction-selection-replay.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const record = JSON.parse(
  fs.readFileSync(
    path.join(root, '.github/interaction-selection-replay.json'),
    'utf8',
  ),
);
const SPEC = /^packages\/[^/]+\/src\/[^\s]+\.spec\.ts$/;

describe('the Chromium selection replay record', () => {
  it('has one row a pull request', () => {
    const numbers = record.rows.map(row => row.pr);
    expect(numbers.length).toBeGreaterThanOrEqual(150);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('holds only public data: pull request numbers, commits and spec paths', () => {
    // No link of any kind: a row names pull requests, commits and specs only.
    expect(JSON.stringify(record)).not.toMatch(/https?:\/\//i);
    for (const row of record.rows) {
      expect(
        Object.keys(row).filter(
          key =>
            ![
              'pr',
              'commit',
              'kind',
              'selection',
              'full_reason',
              'full_run_failures',
              'verdict',
            ].includes(key),
        ),
        String(row.pr),
      ).toEqual([]);
      expect(Number.isInteger(row.pr)).toBe(true);
      expect(row.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(['merge', 'head']).toContain(row.kind);
      if (Array.isArray(row.selection))
        for (const spec of row.selection) expect(spec).toMatch(SPEC);
      else expect(['full', 'out of scope']).toContain(row.selection);
      for (const spec of row.full_run_failures) expect(spec).toMatch(SPEC);
    }
  });

  it('leaves no failing spec outside a selection without a reviewed note', () => {
    for (const row of record.rows) {
      expect(row.verdict, String(row.pr)).not.toMatch(
        /^(escape|failures unknown)/,
      );
      if (!Array.isArray(row.selection)) continue;
      for (const spec of row.full_run_failures)
        if (!row.selection.includes(spec))
          expect(
            record.reviewed[reviewKey(row.pr, spec)],
            `#${row.pr} ${spec}`,
          ).toBeTruthy();
    }
  });

  it("replays with the Chromium lane's own scope", () => {
    const ci = yaml.parse(
      fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
    );
    const counter = ci.jobs['interaction-legs'];
    const scope = counter.steps.find(each => each.id === 'scope-chromium');
    expect(laneScope(ci).source).toBe(new RegExp(scope.with.paths).source);
    // Not another job's scope, such as the accessibility contracts'.
    const contracts = ci.jobs['pr-component-a11y-contracts'].steps.find(
      each => each.id === 'scope',
    );
    expect(laneScope(ci).source).not.toBe(
      new RegExp(contracts.with.paths).source,
    );
  });

  it('keys each reviewed note by its pull request and spec', () => {
    for (const key of Object.keys(record.reviewed))
      expect(key).toMatch(/^#\d+ packages\/[^/]+\/src\/\S+\.spec\.ts$/);
    expect(reviewKey(10816, 'a.spec.ts')).toBe('#10816 a.spec.ts');
  });
});

describe('failedInteractionJobs', () => {
  const commit = (oid, runs, extraSuites = 0) => ({
    commit: {
      oid,
      checkSuites: {
        totalCount: 1 + extraSuites,
        nodes: [{checkRuns: {totalCount: runs.length, nodes: runs}}],
      },
    },
  });

  it("reads every page of a pull request's commits, not only the newest", () => {
    const pages = {
      null: {
        pageInfo: {hasPreviousPage: true, startCursor: 'c2'},
        nodes: [commit('b', [{name: 'pr-interaction (2/4)', databaseId: 2}])],
      },
      c2: {
        pageInfo: {hasPreviousPage: false, startCursor: 'c1'},
        nodes: [
          commit('a', [
            {name: 'pr-interaction (1/4)', databaseId: 1},
            {name: 'test', databaseId: 9},
          ]),
        ],
      },
    };
    const asked = [];
    const jobs = failedInteractionJobs(1, before => {
      asked.push(before);
      return pages[before];
    });
    expect(asked).toEqual([null, 'c2']);
    expect(jobs.sort()).toEqual([1, 2]);
  });

  it('fails loudly when a commit has more check suites than one page lists', () => {
    expect(() =>
      failedInteractionJobs(1, () => ({
        pageInfo: {hasPreviousPage: false, startCursor: 'c1'},
        nodes: [commit('a', [], 40)],
      })),
    ).toThrow('more check suites than one page lists');
  });

  it('fails loudly when a suite has more failed check runs than one page lists', () => {
    expect(() =>
      failedInteractionJobs(1, () => ({
        pageInfo: {hasPreviousPage: false, startCursor: 'c1'},
        nodes: [
          {
            commit: {
              oid: 'a',
              checkSuites: {
                totalCount: 1,
                nodes: [{checkRuns: {totalCount: 60, nodes: []}}],
              },
            },
          },
        ],
      })),
    ).toThrow('more failed check runs than one page lists');
  });
});

describe('the replay selects as the lane does', () => {
  const source = fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'interaction-selection-replay.mjs',
    ),
    'utf8',
  );

  it("passes the lane's story rule, so a story-only change replays its narrow selection", () => {
    expect(source).toContain('storyScope: storyScopeFor({listed, read})');
    // The stories the rule reads are in the replayed tree.
    expect(source).toMatch(
      /git -C "\$\{ROOT\}" archive [^`]*apps\/storybook\/stories/,
    );
  });
});

describe('failingSpecs', () => {
  const LINE =
    'pr-interaction (1/4)\tRun\t2026-11-07T22:40:00Z   ✘  3 [chromium] › packages/core/src/A/__tests__/A.interaction.browser.spec.ts:12:3 › a';

  it('tries a log download again after a server error, and reads the failing specs', () => {
    const answers = [
      {status: 1, stdout: '', stderr: 'HTTP 502: Server Error'},
      {status: 0, stdout: `${LINE}\n`, stderr: ''},
    ];
    const waits = [];
    expect(
      failingSpecs(1, {
        run: () => answers.shift(),
        sleep: ms => waits.push(ms),
      }),
    ).toEqual(['packages/core/src/A/__tests__/A.interaction.browser.spec.ts']);
    expect(waits).toEqual([5000]);
  });

  it('gives up after four server errors in a row, with no wait after the last try', () => {
    const waits = [];
    let calls = 0;
    expect(
      failingSpecs(1, {
        run: () => {
          calls += 1;
          return {status: 1, stdout: '', stderr: 'HTTP 502: Server Error'};
        },
        sleep: ms => waits.push(ms),
      }),
    ).toBe(null);
    expect(calls).toBe(4);
    expect(waits).toEqual([5000, 10000, 15000]);
  });

  it('gives up at once on an error that is not a server error', () => {
    let calls = 0;
    expect(
      failingSpecs(1, {
        run: () => {
          calls += 1;
          return {status: 1, stdout: '', stderr: 'HTTP 404: Not Found'};
        },
        sleep: () => {},
      }),
    ).toBe(null);
    expect(calls).toBe(1);
  });
});
