// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers, the lows: a joined answer drops a step
 * that alone changes nothing (written, it would pin that setting); "heavy
 * shadows" is how strong a shadow is, never a font weight; a part's text
 * color it already has is said so, never read as a prop.
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
    'astryx-theme-readers-joined-drops-alone-',
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

describe('lows', () => {
  it('a joined answer drops a step that changes nothing', async () => {
    const t = await fresh('n1');
    await themeEditSet(t, 'font', 'serif', {cwd});
    const rs = await how(t, 'serif headings and body, navy links');
    for (const r of rs)
      for (const c of r.commands)
        expect(c).not.toMatch(/font serif --on (heading|body)/);
    expect(rs.some(r => /^all of it/.test(r.text))).toBe(false);
  }, 240_000);

  it('no heavy shadows removes them and says nothing is unread', async () => {
    const rs = await how('q0', 'no heavy shadows');
    expect(writes(rs)).toEqual([
      'set q0 --shadow-low none',
      'set q0 --shadow-med none',
      'set q0 --shadow-high none',
    ]);
    expect(rs.map(r => r.text).join(' ')).not.toMatch(/nothing is written/);
  }, 240_000);

  it('a text color the part already has is said so', async () => {
    const t = await fresh('d1');
    await themeEditSet(t, 'color', '#b91c1c', {cwd, on: 'drawer'});
    const rs = await how(t, 'make the drawer text #b91c1c');
    expect(writes(rs)).toEqual([]);
    expect(rs.map(r => r.text).join(' ')).toMatch(/is #b91c1c already/);
    expect(rs.map(r => r.text).join(' ')).not.toMatch(
      /takes its color from a prop/,
    );
  }, 240_000);
});
