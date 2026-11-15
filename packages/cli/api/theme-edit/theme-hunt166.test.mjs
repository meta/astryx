// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show's `unreached`: a part counts as reached only when its fill and
 * its text color changed from the base (or a setting is on it); the most
 * visible parts come first, the text lists ten and how many more, and the
 * JSON lists them all.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt166-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'neutral', '#101010', {cwd});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('unreached', () => {
  it("lists a part whose fill stays the base's though its text changed, most visible first", async () => {
    const r = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    const list = /** @type {string[]} */ (r.unreached);
    for (const part of ['toast', 'tooltip', 'banner'])
      expect(list).toContain(part);
    // Overlays and feedback come first: in the ten the text names.
    for (const part of ['toast', 'tooltip', 'banner'])
      expect(list.indexOf(part)).toBeLessThan(10);
  }, 240_000);

  it('a setting on a part takes it off the list', async () => {
    await themeEditSet('t', 'background-color', '#222222', {cwd, on: 'toast'});
    const r = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    expect(r.unreached).not.toContain('toast');
  }, 240_000);

  it('the text names ten and how many more; the JSON names them all', async () => {
    const text = (
      await runCli(['experimental', 'theme', 'editor', 'show', 't'], {cwd})
    ).stdout;
    const line = text.split('\n').find(l => l.startsWith('unreached:')) ?? '';
    const json = JSON.parse(
      (
        await runCli(
          ['experimental', 'theme', 'editor', 'show', 't', '--json'],
          {cwd},
        )
      ).stdout,
    ).data.unreached;
    expect(json.length).toBeGreaterThan(10);
    expect(line).toContain(`and ${json.length - 10} more (show --json)`);
    expect(line.split(',').length).toBeLessThan(13);
    const set = (
      await runCli(
        ['experimental', 'theme', 'editor', 'set', 't', 'corners', 'pill'],
        {cwd},
      )
    ).stdout;
    expect(set).not.toContain('unreached');
  }, 240_000);
});
