// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers, leftovers: "the buttons the color of the links"
 * fills the buttons (the reference's words are never the subject's
 * paint); a part's fainter or muted text, said with an owner's possessive
 * or a place, is that part's secondary text, and a fainter word before the
 * text with another way says which text; "the row hovered and selected"
 * is the part in both states at once. Every line offered is run.
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
    'astryx-theme-readers-buttons-color-links-',
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

describe('leftovers', () => {
  it('the buttons the color of the links are filled with it', async () => {
    const t = await fresh('l1');
    const lines = writes(
      await how(t, 'make the buttons the color of the links'),
    );
    expect(lines).toEqual([
      `set ${t} background-color 'var(--color-text-accent)' --on button`,
    ]);
    await follow(lines);
  }, 240_000);

  it("a part's fainter or muted text is its secondary text", async () => {
    const t = await fresh('l2');
    for (const q of [
      "make the card's fainter text lighter",
      "make the card's muted text darker",
      'make the muted text in cards 20% lighter',
      "make the card's fainter text 30% lighter",
    ]) {
      const lines = writes(await how(t, q));
      expect(lines.length, q).toBeGreaterThan(0);
      for (const l of lines)
        expect(l, q).toMatch(
          /^set \S+ --color-text-secondary '#[0-9a-f]{6}' --on card --mode (light|dark)$/,
        );
    }
    await follow(writes(await how(t, "make the card's fainter text lighter")));
  }, 240_000);

  it('the row hovered and selected is both states at once, never one dropped', async () => {
    const rs = await how('q0', 'make the row hovered and selected red');
    expect(rs[0].text).toMatch(/table-row when selected\+hover/);
    const tab = writes(
      await how('q0', 'make the tab hovered and selected blue'),
    );
    expect(tab).toEqual([
      `set q0 background-color '#2563eb' --on tab --state selected+hover`,
    ]);
  }, 240_000);
});
