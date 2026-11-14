// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The kinds of ask `editor how` lists in its help ("Asks how
 * understands"): every example there answers with a command, and a
 * question it cannot answer points to that list, which `--help` prints.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {doc} from '../../clients/cli/commands/experimental-theme-editor-how.doc.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const LABEL = 'Asks how understands: ';
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

/** Each listed ask, by its kind, read back from the help's examples. */
const asks = (doc.examples ?? [])
  .filter(e => e.label?.startsWith(LABEL))
  .map(e => {
    const quoted = /how "(.*)"$/.exec(e.cli)?.[1] ?? '';
    return [String(e.label).slice(LABEL.length), JSON.parse(`"${quoted}"`)];
  });

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-families-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the asks how lists', () => {
  it('lists every kind with one or two examples', () => {
    const kinds = new Map();
    for (const [kind] of asks) kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    expect(kinds.size).toBeGreaterThanOrEqual(8);
    for (const n of kinds.values()) expect([1, 2]).toContain(n);
  });

  it.each(asks)(
    '%s: %j answers with a command',
    async (_kind, ask) => {
      const {data} = /** @type {any} */ (
        await themeEditHow(ask, {cwd, theme: 'q'})
      );
      const commands = [
        ...(data.results ?? []).flatMap(
          (/** @type {any} */ r) => r.commands ?? [],
        ),
        ...(data.run ?? []),
      ];
      expect(data.hint ?? '', ask).toBe('');
      expect(commands.length, ask).toBeGreaterThan(0);
    },
    120_000,
  );
});

describe('a question how cannot answer', () => {
  it('points to the list, and that pointer prints it', async () => {
    const {data} = /** @type {any} */ (
      await themeEditHow('flibber the wombat sideways', {cwd, theme: 'q'})
    );
    expect(data.hint).toMatch(
      /See .*experimental theme editor how --help for the asks it understands\./,
    );
    expect(data.run[0]).toMatch(/ experimental theme editor how --help$/);
    const help = spawnSync(
      process.execPath,
      [BIN, 'experimental', 'theme', 'editor', 'how', '--help'],
      // From this checkout, so this CLI's own help prints.
      {cwd: path.resolve(import.meta.dirname, '../..'), encoding: 'utf8'},
    );
    expect(help.status).toBe(0);
    for (const [kind, ask] of asks) {
      expect(help.stdout).toContain(`${LABEL}${kind}`);
      expect(help.stdout).toContain(JSON.stringify(ask));
    }
  }, 120_000);
});
