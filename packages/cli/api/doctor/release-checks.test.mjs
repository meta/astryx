// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file doctor's release checks (spec AST-081 FR10, FR11): the newest
 * release beside a project's or the global copy's, with the fix, and the
 * `astryx` commands on the search path.
 */

import {describe, expect, it} from 'vitest';
import {checkCliOnPath, checkNewestRelease} from './doctor.mjs';

const answeredBy = {cli: '0.7.1', core: '0.7.1', copy: 'project'};

/** @param {Partial<import('../../foundation/env/search-path.mjs').SearchPathCommand>} row */
const row = row => ({
  file: '/bin/astryx',
  astryx: true,
  cliRoot: '/lib/cli',
  version: '0.8.0',
  handsOff: true,
  ...row,
});

describe('checkNewestRelease', () => {
  it("names a project's install and upgrade commands", () => {
    const check = checkNewestRelease({
      nodeVersion: '24.0.0',
      answeredBy,
      latest: '0.7.3',
      projectLag: {
        root: '/app',
        current: '0.7.1',
        newest: '0.7.3',
        install: 'npm install @astryxdesign/core@0.7.3 @astryxdesign/cli@0.7.3',
        upgrade: 'npx astryx upgrade --from 0.7.1 --apply',
      },
    });
    expect(check).toEqual({
      id: 'newest-release',
      label: 'Newest release',
      status: 'info',
      message: 'This project uses Astryx 0.7.1; 0.7.3 is the newest.',
      fix: 'To upgrade, run: npm install @astryxdesign/core@0.7.3 @astryxdesign/cli@0.7.3, then npx astryx upgrade --from 0.7.1 --apply.',
    });
  });

  it('adds the last notice skip and a held state lock, for diagnosis', () => {
    const check = checkNewestRelease({
      nodeVersion: '24.0.0',
      answeredBy,
      latest: '0.7.1',
      lastNoticeSkip: {
        key: 'global',
        reason: 'already-shown',
        at: Date.UTC(2026, 9, 20, 18),
      },
      stateLock: {pid: 42, host: 'mac', since: Date.UTC(2026, 9, 20, 17)},
    });
    expect(check.message).toBe(
      'No newer release is known: the newest is 0.7.1. ' +
        'Last update notice skipped 2026-10-20T18:00:00.000Z (global): it had already printed that day. ' +
        "The state file's lock is held by process 42 on mac since 2026-10-20T17:00:00.000Z.",
    );
  });

  it('says when the last update check did not reach the registry, and why', () => {
    const check = checkNewestRelease({
      nodeVersion: '24.0.0',
      answeredBy,
      latest: null,
      lastCheckFailure: {
        at: Date.UTC(2026, 9, 20, 18),
        reason: 'npm-failed: ECONNREFUSED',
      },
    });
    expect(check.message).toContain(
      'The last update check, 2026-10-20T18:00:00.000Z, did not reach the registry: npm failed (ECONNREFUSED); its registry and proxy settings decide where it asks.',
    );
    expect(
      checkNewestRelease({
        nodeVersion: '24.0.0',
        answeredBy,
        latest: null,
        lastCheckFailure: {at: 0, reason: 'npm-missing'},
      }).message,
    ).toContain('did not reach the registry: npm could not be started.');
  });

  it("names the global copy's upgrade, after the Node the newest release needs", () => {
    const check = checkNewestRelease({
      nodeVersion: '22.13.0',
      answeredBy: {...answeredBy, copy: 'carried'},
      latest: '0.8.0',
      globalBehind: {
        current: '0.7.1',
        newest: '0.8.0',
        node: '>=99',
        command: 'pnpm add -g @astryxdesign/cli@latest',
      },
    });
    expect(check).toEqual({
      id: 'newest-release',
      label: 'Newest release',
      status: 'info',
      message:
        'A new release of Astryx is available: 0.7.1 → 0.8.0. The CLI installed for the computer stays on its release until you upgrade it.',
      fix: `To upgrade, install Node >=99 (this computer runs Node ${process.versions.node}), then run: pnpm add -g @astryxdesign/cli@latest.`,
    });
  });
});

describe('checkCliOnPath', () => {
  const base = {nodeVersion: '24.0.0', answeredBy, latest: null};

  it('passes for a release that hands off, and lists the later ones', () => {
    const check = checkCliOnPath({
      ...base,
      searchPathCommands: [
        row({}),
        row({file: '/other/astryx', version: '0.7.1', handsOff: false}),
      ],
    });
    expect(check).toMatchObject({
      status: 'pass',
      message:
        '`astryx` runs /bin/astryx (CLI 0.8.0). Later on the search path: /other/astryx (CLI 0.7.1).',
    });
  });

  it('warns about a first release that predates the hand-off, naming the replacement', () => {
    expect(
      checkCliOnPath({
        ...base,
        searchPathCommands: [row({version: '0.7.1', handsOff: false})],
      }),
    ).toMatchObject({
      status: 'warn',
      fix: 'To upgrade, run: `npm i -g @astryxdesign/cli@latest`.',
    });
  });

  it('warns about another program first, and informs when there is none', () => {
    expect(
      checkCliOnPath({
        ...base,
        searchPathCommands: [
          row({astryx: false, cliRoot: null, version: null, handsOff: null}),
        ],
      }),
    ).toMatchObject({status: 'warn'});
    expect(checkCliOnPath({...base, searchPathCommands: []})).toMatchObject({
      status: 'info',
      fix: 'To run the CLI in any folder, install it for the computer: `npm i -g @astryxdesign/cli`.',
    });
  });
});
