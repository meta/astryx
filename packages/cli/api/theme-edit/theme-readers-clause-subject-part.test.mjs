// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers: a clause after "and"
 * whose subject is no part takes none from the clause before; a part named
 * as the color reference gives the color it shows (a link's text, a card's
 * border); a color given to a token that is that color already is left; a
 * page's text in a part is the part's own, by role; a row line's color with its width says why the
 * width stays; a color bound how cannot measure is said, never a removal;
 * a value set on the part is what it has now. Every line offered is run.
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
    'astryx-theme-readers-clause-subject-part-',
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

describe('readers', () => {
  it('an unknown subject after "and" takes no part from the clause before', async () => {
    const rs = await how('q0', 'make the cards rounder and the gizmo red');
    expect(writes(rs)).toEqual(['set q0 corners more --on card']);
    expect(rs.map(r => r.text).join('\n')).toContain(
      'no part is called "gizmo"',
    );
  }, 240_000);

  it('a part named as the color gives the color it shows', async () => {
    const t = await fresh('r1');
    const links = writes(
      await how(t, 'make the buttons the same color as the links'),
    );
    expect(links).toEqual([
      `set ${t} background-color 'var(--color-text-accent)' --on button`,
    ]);
    await follow(links);
    const div = writes(await how(t, 'make the dividers the card border color'));
    expect(div).toEqual([
      `set ${t} --color-border-emphasized 'var(--color-border)' --on divider`,
    ]);
    await follow(div);
  }, 240_000);

  it("the muted text in cards fainter: the cards' secondary text only", async () => {
    const t = await fresh('r2');
    for (const q of [
      'make the muted text in cards fainter',
      'make the secondary text on cards fainter',
    ]) {
      const lines = writes(await how(t, q));
      expect(lines.length, q).toBeGreaterThan(0);
      for (const l of lines)
        expect(l).toMatch(
          /^set r2 --color-text-secondary '#[0-9a-f]{8}' --on card --mode (light|dark)$/,
        );
    }
    await follow(writes(await how(t, 'make the muted text in cards fainter')));
  }, 240_000);

  it('row dividers thicker and blue: the color, and why the width stays', async () => {
    const t = await fresh('r3');
    const rs = await how(t, 'make the table row dividers thicker and blue');
    expect(writes(rs)).toEqual([
      `set ${t} --color-border '#2563eb' --on table-row`,
    ]);
    expect(rs[0].text).toMatch(/their width is left as it is/);
    await follow(writes(rs));
  }, 240_000);

  it('a color bound how cannot measure is said, never a removal', async () => {
    const t = await fresh('r4');
    const rs = await how(t, 'make the cards red but never redder than #ff0000');
    expect(writes(rs).slice(0, 3)).toEqual(
      ['default', 'transparent', 'muted'].map(
        v =>
          `set ${t} background-color '#dc2626' --on card --when variant:${v}`,
      ),
    );
    expect(writes(rs).join('\n')).not.toMatch(/none/);
    expect(rs[0].text).toContain('"never redder than #ff0000" is not held');
    await follow(writes(rs));
  }, 240_000);

  it('a value set on the part is what it has now', async () => {
    const t = await fresh('r5');
    await themeEditSet(t, 'border-radius', '20px', {cwd, on: 'card'});
    const rs = await how(t, 'how round are the cards now?');
    expect(rs[0].text).toMatch(
      /^card has border-radius 20px \(set on card\) now/,
    );
    expect(writes(rs)).toEqual([]);
  }, 240_000);
});
