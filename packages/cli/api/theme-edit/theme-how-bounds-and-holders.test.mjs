// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's answers: a typed value no page could show is not written,
 * with the range that reads; the room between items is the gap of the
 * part that holds them; a visited link has no state set can name; a
 * selected tab's underline said with "with"; a date picker's selected
 * date; the joined answer sets the page token in each mode; a
 * readable-text line names no empty mode; white text on the header goes
 * to the mode it reads in; a weight word before a size word is a weight;
 * a rung set "instead of" another is one ask. Every line offered is run.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-bounds-and-holders-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('q0', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} ask */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

/** @param {Array<{commands: string[]}>} rs */
// (The readable-text line set's own check adds beside a fill is measured
// on its own: these asks read the rest.)
const writes = rs =>
  rs
    .filter(r => !/^readable text on that fill/.test(r.text))
    .flatMap(r => r.commands)
    .filter(c => /^(set|undo) /.test(c));

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

/** @param {string} name */
const fresh = async name => {
  await themeEditNew(name, {cwd, like: 'neutral'});
  return name;
};

/** The one-step answer's commands. @param {Array<{text: string, commands: string[]}>} rs */
const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));
/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');

describe('values and holders', () => {
  it('a value no page could show is not written, with the range that reads', async () => {
    let rs = await how('q0', 'line height 0');
    expect(writes(rs)).toEqual([]);
    expect(texts(rs)).toMatch(/line height reads between 0\.5 and 4/);
    rs = await how('q0', 'padding 99999px on buttons');
    expect(writes(rs)).toEqual([]);
    expect(texts(rs)).toMatch(/reads up to 512px/);
    expect(writes(await how('q0', 'line height 1.6'))).toEqual([
      'set q0 --text-body-leading 1.6',
    ]);
  }, 240_000);

  // "More" room between the items, with no amount, is a step up of the
  // holder's own gap, never the items' padding.
  it.each([
    'list items more spacing between them',
    'a little more space between list items',
    'more space between list items',
  ])(
    "%s steps up the list's gap",
    async question => {
      const rs = await how('q0', question);
      expect(writes(rs)).toEqual([
        expect.stringMatching(/^set q0 gap \S+ --on list$/),
      ]);
      expect(texts(rs)).toMatch(
        /the room between list-items is list's gap: \S+ \(now /,
      );
    },
    240_000,
  );
  // A gap of 0 has no step up: still asked for a value.
  it('a zero gap is not stepped', async () => {
    const t = await fresh('g0');
    await follow([`set ${t} gap 0px --on list`]);
    const rs = await how(t, 'a little more space between list items');
    expect(writes(rs)).toEqual([]);
    expect(texts(rs)).toMatch(/the room between list-items is list's gap/);
  }, 240_000);
  // No way, another way, or an exact amount said: still asked for a value.
  it.each([
    'space between list items',
    'less space between list items',
    'double the space between list items',
  ])(
    '%s names the gap for a value',
    async question => {
      const rs = await how('q0', question);
      expect(writes(rs)).toEqual([]);
      expect(texts(rs)).toMatch(/the room between list-items is list's gap/);
    },
    240_000,
  );

  it('a visited link has no state set can name', async () => {
    const rs = await how('q0', 'links purple after visiting');
    expect(writes(rs)).toEqual([]);
    expect(texts(rs)).toMatch(/link has no visited state/);
  }, 240_000);

  it('a selected tab\'s underline said with "with"; a date picker\'s selected date', async () => {
    const t = await fresh('u1');
    const lines = writes(
      await how(t, 'selected tab with a 2px #635bff underline'),
    );
    expect(lines).toEqual([
      `set ${t} background-color '#635bff' --on tab-indicator --state selected`,
      `set ${t} height 2px --on tab-indicator --state selected`,
    ]);
    await follow(lines);
    expect(
      texts(await how('q0', 'the selected date in the date picker black')),
    ).toMatch(/the selected day is calendar-day's/);
  }, 240_000);
});

describe('the page and its text', () => {
  it('the joined answer sets the page token in each mode, the frame left as it is', async () => {
    const t = await fresh('p1');
    const lines = top(
      await how(
        t,
        'page background #191919 in dark mode and #ffffff in light mode',
      ),
    );
    expect(lines).toEqual([
      `set ${t} --color-background-body '#191919' --mode dark`,
      `set ${t} --color-background-body '#ffffff' --mode light`,
    ]);
    await follow(lines);
  }, 240_000);

  it('white text on the header goes to the mode it reads in; no empty mode', async () => {
    const t = await fresh('w1');
    const rs = await how(t, 'bold white text in the header');
    expect(writes(rs)).toContain(
      `set ${t} --color-text-primary '#ffffff' --on app-shell-header --mode dark`,
    );
    expect(texts(rs)).toMatch(
      /in dark mode only: app-shell-header is #ffffff in light mode/,
    );
    await follow(writes(rs));
    const d = await fresh('w2');
    await themeEditSet(d, 'mode', 'dark-only', {cwd});
    expect(texts(await how(d, 'make the primary button #0064E0'))).not.toMatch(
      /\(\)/,
    );
  }, 240_000);
});

describe('weights', () => {
  it('a weight word before a size word is a weight; a rung instead of another', async () => {
    expect(writes(await how('q0', 'buttons font weight medium'))).toEqual([
      'set q0 font-weight 500 --on button',
    ]);
    expect(
      writes(await how('q0', 'headings semibold instead of bold'))[0],
    ).toBe('set q0 headings semibold');
  }, 240_000);
});
