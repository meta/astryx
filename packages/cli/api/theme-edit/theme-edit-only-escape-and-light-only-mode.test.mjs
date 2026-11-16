// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file --only always works as an escape from a group: on a member of a
 * group that spreads it keeps the change to that member, and on a part that
 * is styled on its own already it is taken and said. A menu's radio is kept
 * apart from every other radio: a square corners ask leaves its circle, and
 * a round ask on a menu radio the theme squared offers the undo that gives
 * the circle back. A one-mode theme reads its own mode named with --mode as
 * no --mode, light-only as dark-only.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-only-escape-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const cli = async args =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

/** @param {any} r */
const names = r =>
  (r.suggestions ?? []).map((/** @type {any} */ x) =>
    x.name.replace(/^.*? editor /, ''),
  );

/** @param {string} ask */
const how = async ask => {
  const r = await cli([...ED, 'how', ask, '--theme', 't']);
  /** @type {Array<{text: string, commands?: string[]}>} */
  const results = r.data?.results ?? [];
  return {
    texts: results.map(x => x.text),
    commands: results
      .flatMap(x => x.commands ?? [])
      .map(c => c.replace(/^.*? editor /, '')),
  };
};

describe('--only', () => {
  it(
    'keeps a change on a member of a group that spreads to that member',
    async () => {
      fs.writeFileSync(file(), fresh);
      const all = await cli([
        ...ED,
        'set',
        't',
        'box-shadow',
        'none',
        '--on',
        'date-time-input',
      ]);
      expect(all.data.parts.length).toBeGreaterThan(1);
      fs.writeFileSync(file(), fresh);
      const one = await cli([
        ...ED,
        'set',
        't',
        'box-shadow',
        'none',
        '--on',
        'date-time-input',
        '--only',
      ]);
      expect(one.data.parts).toEqual(['date-time-input']);
    },
    T,
  );

  for (const part of ['date-time-input-date-segment', 'card'])
    it(
      `is taken on ${part}, styled on its own already, and said`,
      async () => {
        fs.writeFileSync(file(), fresh);
        const r = await cli([
          ...ED,
          'set',
          't',
          'border-radius',
          '2px',
          '--on',
          part,
          '--only',
        ]);
        expect(r.error).toBeUndefined();
        expect(r.data.parts).toEqual([part]);
        expect(r.data.notes.join(' ')).toMatch(
          new RegExp(
            `${part} is styled on its own already .* so --only changes nothing`,
          ),
        );
        // Saved as the plain change, which an undo with --only also removes.
        expect(
          saved().find((/** @type {any} */ x) => x.on === part).only,
        ).toBeUndefined();
        const back = await cli([
          ...ED,
          'undo',
          't',
          'border-radius',
          '--on',
          part,
          '--only',
        ]);
        expect(back.error).toBeUndefined();
      },
      T,
    );

  it(
    'is refused on a group itself, which has no one member to keep to',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'border-radius',
        '4px',
        '--on',
        'inputs',
        '--only',
      ]);
      expect(r.error).toMatch(/--only is for one member of a group/);
    },
    T,
  );
});

describe("a menu's radio", () => {
  it(
    'keeps its circle under a square corners ask, and says so',
    async () => {
      fs.writeFileSync(file(), fresh);
      const a = await how('square corners but keep menu radios round');
      expect(a.texts.join(' ')).toMatch(
        /dropdown-menu-radio is a radio's circle, which the corners change leaves as it is/,
      );
      expect(a.texts.join(' ')).not.toMatch(/cannot be kept apart/);
      expect(a.commands).toContain('set t corners square');
    },
    T,
  );

  it(
    'offers the undo that gives the circle back when the theme squared it',
    async () => {
      fs.writeFileSync(file(), fresh);
      await cli([
        ...ED,
        'set',
        't',
        'border-radius',
        '0',
        '--on',
        'dropdown-menu-radio',
      ]);
      const r = await cli([
        ...ED,
        'set',
        't',
        'corners',
        'pill',
        '--on',
        'dropdown-menu-radio',
      ]);
      expect(r.error).toMatch(/undoing that gives the circle back/);
      expect(names(r)[0]).toBe('undo t border-radius --on dropdown-menu-radio');
      expect(
        (await cli([...ED, ...names(r)[0].split(' ')])).error,
      ).toBeUndefined();
    },
    T,
  );
});

describe("a one-mode theme's own --mode", () => {
  for (const [mode, own] of [
    ['light-only', 'light'],
    ['dark-only', 'dark'],
  ])
    it(
      `on a ${mode} theme is the same as no --mode`,
      async () => {
        fs.writeFileSync(file(), fresh);
        await cli([...ED, 'set', 't', 'mode', mode]);
        const r = await cli([
          ...ED,
          'set',
          't',
          '--color-border',
          '#888888',
          '--mode',
          own,
        ]);
        expect(r.error).toBeUndefined();
        expect(r.data.notes.join(' ')).toMatch(
          new RegExp(
            `t is ${mode}: --mode ${own} is its own mode, the same as no --mode`,
          ),
        );
        const back = await cli([
          ...ED,
          'undo',
          't',
          '--color-border',
          '--mode',
          own,
        ]);
        expect(back.error).toBeUndefined();
      },
      T,
    );
});
