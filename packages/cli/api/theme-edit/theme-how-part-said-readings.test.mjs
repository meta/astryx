// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads a part said beside a mode, a role or a look as that
 * part's: "the dark dashboard sidebar" is the sidebar's fill, "the delete
 * button red for destructive actions" the destructive button's, "heading
 * style: bold" the headings'; "from the images" is no picture to match;
 * "works in light and dark" is both modes on a one-mode theme; a look is
 * named for a thing by position ("stripe-like", "whatsapp theme"), and a
 * describing word keeps its meaning ("a calm theme").
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
    'astryx-theme-how-part-said-readings-',
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

/** The one-step answer's commands. @param {Array<{text: string, commands: string[]}>} rs */
const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));
/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');

describe("a part said beside a mode, a role or a look is that part's", () => {
  it("a dark or light product with a part after it is that part's look", async () => {
    for (const ask of [
      'the dark dashboard sidebar',
      'a light dashboard with a dark sidebar',
    ]) {
      const w = writes(await how('q0', ask));
      expect(
        w.some(c => /\bmode (?:dark|light)-only\b/.test(c)),
        ask,
      ).toBe(false);
      expect(
        w.some(c => /--on side-nav\b/.test(c)),
        ask,
      ).toBe(true);
    }
  });
  it("a role color said of a named part fills that part's role look only", async () => {
    expect(
      writes(
        await how('q0', 'make the delete button red for destructive actions'),
      )[0],
    ).toBe(
      `set q0 background-color '#dc2626' --on button --when variant:destructive`,
    );
  });
  it("a part's style before a colon is that part's look", async () => {
    const w = writes(await how('q0', 'heading style: bold'));
    expect(w).toContain('set q0 headings bold');
    expect(w.some(c => /--text-body-weight/.test(c))).toBe(false);
  });
  it('a shadow taken from the images is no picture to match and touches no shadow token', async () => {
    const rs = await how('q0', 'remove the shadow from the images');
    expect(writes(rs).some(c => /--shadow-/.test(c))).toBe(false);
  });
  it('a look named for a brand asks for its colors; a feel word is only not taken', async () => {
    // (By position: a word the editor does not hold, said as a look's
    // name, names a thing.)
    for (const ask of [
      'a stripe-like look',
      'whatsapp theme',
      'a spotify look',
      'make it look like Apple',
    ]) {
      const brand = await how('q0', ask);
      expect(
        brand.some(r => /never guesses a brand's colors/.test(r.text)),
        ask,
      ).toBe(true);
    }
    const calm = await how('q0', 'a calm theme');
    expect(calm.some(r => /never guesses a brand's colors/.test(r.text))).toBe(
      false,
    );
    expect(calm.some(r => /not taken: "calm"/.test(r.text))).toBe(true);
  });
  it('a variant of the part the ask names is read, never named as not taken', async () => {
    // (A likeness said with a state writes nothing and names the state; the
    // variant words are still read.)
    for (const ask of [
      'make ghost buttons look like primary buttons',
      'make ghost buttons look like primary buttons on hover',
    ]) {
      const rs = await how('q0', ask);
      expect(
        rs.some(r => /not taken: [^\n]*"(?:primary|ghost)"/.test(r.text)),
        ask,
      ).toBe(false);
    }
    expect(
      writes(
        await how('q0', 'make ghost buttons look like primary buttons'),
      ).some(c => / --on button --when variant:ghost/.test(c)),
    ).toBe(true);
  });
});
