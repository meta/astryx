// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What real command runs report as their result — end to end.
 *
 * These drive the actual CLI and read the event that came out of it, so they
 * cover the whole path: a command's returned descriptor, the converter that
 * stamps it, and the recorder that seals it. The per-command contract itself is
 * a typecheck (see lib/define-command.mjs); this is the proof the numbers that
 * arrive are the right ones.
 *
 * @input real command runs against this repo
 * @output the result counts, kinds, empty states, and direct matches recorded
 * @position packages/cli/clients/cli/commands — debug result integration
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  begin,
  finish,
  resetRecorder,
  setEventHandler,
} from '../../../foundation/debug/recorder.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);
const SLOW = 30_000;

/** @param {string[]} args */
async function runWithDebug(args) {
  resetRecorder();
  begin({argv: args, cliVersion: 'test'});
  const run = await runCli(args, REPO);
  /** @type {any[]} */
  const events = [];
  setEventHandler(event => events.push(event));
  finish({exitCode: run.status});
  expect(events).toHaveLength(1);
  return {run, event: events[0]};
}

afterEach(() => resetRecorder());

describe('DebugEvent result summary', () => {
  it(
    'distinguishes a successful search with no results',
    async () => {
      const {event} = await runWithDebug([
        'search',
        'zzqqxx_definitely_no_match',
      ]);
      expect(event.outcome).toBe('ok');
      expect(event.output).toMatchObject({
        resultCount: 0,
        emptyResult: true,
        // An open search really did span every domain, and saying so beats a
        // null that cannot be told apart from a command that never reported.
        resultKind: 'mixed',
        directMatch: null,
      });
    },
    SLOW,
  );

  it(
    'records the match total, not the --limit cap, for a filtered search',
    async () => {
      const {run, event} = await runWithDebug([
        '--json',
        'search',
        'button',
        '--type',
        'component',
        '--limit',
        '2',
      ]);
      const response = JSON.parse(run.stdout);
      // The regression: the recorded count was the length of the LIMITED list,
      // so every capped run filed "2" and no usage query could tell a query
      // that matched twice from one that matched fifty.
      expect(response.data.results).toHaveLength(2);
      expect(response.data.matchCount).toBeGreaterThan(2);
      expect(event.output).toMatchObject({
        resultCount: response.data.matchCount,
        emptyResult: false,
        resultKind: 'component',
        directMatch: null,
      });
    },
    SLOW,
  );

  it(
    'records build count, kind, and direct-match state',
    async () => {
      const {run, event} = await runWithDebug(['--json', 'build', 'dashboard']);
      const response = JSON.parse(run.stdout);
      const results = [
        ...response.data.pages,
        ...response.data.blocks,
        ...response.data.domain,
      ];
      const domains = new Set(results.map(result => result.domain));
      const resultKind =
        domains.size === 0
          ? 'mixed'
          : domains.size === 1
            ? domains.values().next().value
            : 'mixed';
      expect(event.output).toMatchObject({
        resultCount: response.data.matchCount,
        emptyResult: !response.data.hasResults,
        resultKind,
        directMatch: response.data.directMatch,
      });
    },
    SLOW,
  );

  it(
    'keeps text build nonempty when raw matches are filtered from the kit',
    async () => {
      const {run, event} = await runWithDebug([
        'build',
        'color',
        '--type',
        'doc',
      ]);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('Build kit for');
      expect(event.output).toMatchObject({
        emptyResult: false,
        // Every raw match was filtered out of the printed kit, so the kind
        // falls back to what was asked for — `--type doc`.
        resultKind: 'doc',
        directMatch: false,
      });
      expect(event.output.resultCount).toBeGreaterThan(0);
    },
    SLOW,
  );

  it(
    'reports a lookup that resolved exactly one thing',
    async () => {
      const {event} = await runWithDebug(['docs', 'tokens']);
      expect(event.outcome).toBe('ok');
      expect(event.output).toMatchObject({
        resultCount: 1,
        emptyResult: false,
        resultKind: 'doc',
        directMatch: true,
      });
    },
    SLOW,
  );

  it(
    'reports a list as the size of the list',
    async () => {
      const {run, event} = await runWithDebug(['--json', 'template', '--list']);
      const response = JSON.parse(run.stdout);
      expect(response.data.length).toBeGreaterThan(0);
      expect(event.output).toMatchObject({
        resultCount: response.data.length,
        emptyResult: false,
        resultKind: 'template',
        directMatch: null,
      });
    },
    SLOW,
  );

  it(
    'only claims a direct match when the filter resolved one component',
    async () => {
      // The trap: a filter is a substring search, so its mere presence proves
      // nothing — `theme targets a` matches every target there is. Claiming a
      // direct match there would make every fuzzy run a false positive in the
      // one query these fields exist to answer.
      const loose = await runWithDebug(['theme', 'targets', 'But']);
      expect(loose.event.output).toMatchObject({
        resultKind: 'theme',
        directMatch: false,
      });
      expect(loose.event.output.resultCount).toBeGreaterThan(0);

      const exact = await runWithDebug(['theme', 'targets', 'Button']);
      expect(exact.event.output).toMatchObject({
        resultKind: 'theme',
        directMatch: true,
      });

      const unfiltered = await runWithDebug(['theme', 'targets']);
      expect(unfiltered.event.output.directMatch).toBe(null);
    },
    SLOW,
  );

  it(
    'reports help as a run with no result set',
    async () => {
      const {event} = await runWithDebug(['--help']);
      expect(event.output.helpDisplayed).toBe(true);
      expect(event.output.resultKind).toBe('none');
    },
    SLOW,
  );
});
