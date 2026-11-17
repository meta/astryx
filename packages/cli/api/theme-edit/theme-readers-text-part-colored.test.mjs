// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers: a text part colored like a filled part
 * takes its fill, and a possessive paint ("the error inputs' border") is
 * that paint; a word for a look with no fill names the variant drawn with
 * none; a role the part lacks names WHICH parts so set refuses it by name;
 * see-through by a share on a part and fainter text theme-wide; the focus
 * ring of one variant stays on that variant; two excepts joined by "and"
 * keep each one. Every line offered is run.
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
    'astryx-theme-readers-text-part-colored-',
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

describe('a text part like a filled part', () => {
  it('takes the fill it shows; a possessive paint is that paint', async () => {
    const t = await fresh('a1');
    const head = writes(
      await how(t, 'make the headings the color of the danger buttons'),
    );
    // (Every heading element takes a heading's color, run together first.)
    expect(head.slice(0, 3)).toEqual([
      `set ${t} color 'var(--color-error-muted)' --on heading`,
      `set ${t} color 'var(--color-error-muted)' --on empty-state-title`,
      `set ${t} color 'var(--color-error-muted)' --on markdown-heading`,
    ]);
    await follow(head);
    const link = writes(
      await how(t, 'make the links the same color as the danger buttons'),
    );
    // (The links alone: their color prop's token, on links.)
    expect(link).toEqual([`set ${t} color 'var(--color-error-muted)' --on link`]);
    await follow(link);
    const div = writes(
      await how(t, "make the dividers the color of the error inputs' border"),
    );
    // (The divider draws its line in either of its two line colors.)
    expect(div).toEqual([
      `set ${t} --color-border 'var(--color-border-error)' --on divider`,
      `set ${t} --color-border-emphasized 'var(--color-border-error)' --on divider`,
    ]);
    await follow(div);
  }, 240_000);
});

describe('words that name which parts', () => {
  it('the transparent buttons are the ones drawn with no fill', async () => {
    const t = await fresh('b1');
    const lines = writes(await how(t, 'make the transparent buttons red'));
    expect(lines).toEqual([
      `set ${t} background-color '#dc2626' --on button --when variant:ghost`,
    ]);
    await follow(lines);
    expect(writes(await how(t, 'make the transparent cards red'))).toEqual([
      `set ${t} background-color '#dc2626' --on card --when variant:transparent`,
    ]);
  }, 240_000);

  it('a role the part lacks is refused by name, never every one', async () => {
    for (const q of [
      'make the success toasts green',
      "make the selector's primary variant red",
    ]) {
      const rs = await how('q0', q);
      expect(writes(rs), q).toEqual([]);
      expect(rs.map(r => r.text).join(' '), q).toMatch(
        /has no (?:(?:type|variant) "(?:success|primary)"|primary part)/,
      );
    }
  }, 240_000);
});

describe('amounts', () => {
  it('see-through by a share on a part; fainter text theme-wide', async () => {
    const t = await fresh('c1');
    for (const q of [
      'make the cards transparent by a quarter',
      'make the cards a quarter more transparent',
    ])
      expect(writes(await how(t, q)), q).toEqual([
        `set ${t} opacity 0.75 --on card`,
      ]);
    const text = await how(t, 'make the text a third fainter');
    expect(text[0].text).toContain('33% lower (× 0.67)');
    await follow(writes(text));
  }, 240_000);
});

describe('focus ring of a variant', () => {
  it('every line stays on that variant', async () => {
    const lines = writes(
      await how('q0', 'make the focus ring of the primary buttons blue'),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toContain('--when variant:primary');
  }, 240_000);
});

describe('two excepts joined by and', () => {
  it('keep each one', async () => {
    const t = await fresh('e1');
    const rs = await how(
      t,
      'make the inputs red except the disabled ones and the error ones',
    );
    const lines = writes(rs);
    expect(lines).toContain(
      `set ${t} background-color 'var(--color-background-surface)' --on text-input --when status:error --only`,
    );
    expect(
      lines.some(
        l => /--state disabled/.test(l) && !/--when status:error/.test(l),
      ),
    ).toBe(true);
    expect(
      lines.some(l => /--when status:error --state disabled/.test(l)),
    ).toBe(false);
    await follow(lines);
  }, 240_000);
});
