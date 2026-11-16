// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers, round 43: a share in words or figures, before or
 * after the way ("two thirds fainter", "fainter by a third", "1/3
 * fainter", "a fifth fainter", "a third more transparent"), is that share
 * less of a line or a fill; a reference named with its status or variant
 * ("the error banner color", "the color of the muted card", "the color of
 * the destructive button") is that look of it, never the part changed; a
 * base theme's own look for a variant is what it shows, and a see-through
 * fill gives the next paint it draws. Every line offered is run.
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
  cwd = makeLinkedFixture('astryx-theme-hunt-h-round43-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
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
const writes = rs =>
  rs.flatMap(r => r.commands).filter(c => /^(set|undo) /.test(c));

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

/** @param {string} name @param {string} [like] */
const fresh = async (name, like = 'neutral') => {
  await themeEditNew(name, {cwd, like});
  return name;
};

describe('a share of the way', () => {
  it('in words or figures, before or after the way', async () => {
    for (const [q, said] of [
      ['make the card text two thirds fainter', '67% lower (× 0.33)'],
      ['make the card text fainter by a third', '33% lower (× 0.67)'],
      ['make the card text 1/3 fainter', '33% lower (× 0.67)'],
      ['make the card text a fifth fainter', '20% lower (× 0.8)'],
      ['make the card text a third more see-through', '33% lower (× 0.67)'],
    ])
      expect((await how('q0', q))[0].text, q).toContain(said);
  }, 240_000);

  it('a fill more transparent by a share keeps the rest', async () => {
    const t = await fresh('s1');
    const fill = writes(
      await how(t, 'make the dialog background 20% more transparent'),
    );
    expect(fill).toEqual([
      `set ${t} background-color 'color-mix(in srgb, var(--color-background-surface) 80%, transparent)' --on dialog`,
    ]);
    await follow(fill);
    expect(
      writes(
        await how(t, 'make the card background a third more transparent'),
      )[0],
    ).toContain('var(--color-background-card) 67%, transparent');
  }, 240_000);
});

describe('a reference named with its look', () => {
  it('the error banner color, the success badge color', async () => {
    const t = await fresh('r1');
    const banner = writes(
      await how(t, 'make the cards the error banner color'),
    );
    expect(banner).toEqual([
      `set ${t} background-color 'var(--color-error-muted)' --on card`,
    ]);
    await follow(banner);
    expect(
      writes(await how(t, 'make the cards the success badge color')),
    ).toEqual([`set ${t} background-color 'var(--color-success)' --on card`]);
  }, 240_000);

  it('the same part as the reference: its look is read, the part changed whole', async () => {
    const t = await fresh('r2');
    const card = writes(
      await how(t, 'make the card background the color of the muted card'),
    );
    expect(card).toEqual([
      `set ${t} background-color 'var(--color-background-muted)' --on card`,
    ]);
    await follow(card);
    expect(
      writes(
        await how(
          t,
          'make the button background the color of the destructive button',
        ),
      ),
    ).toEqual([
      `set ${t} background-color 'var(--color-error-muted)' --on button`,
    ]);
  }, 240_000);

  it("a base theme's own look; a see-through fill gives the next paint", async () => {
    const t = await fresh('r3', 'butter');
    const q = await how(t, 'what is the background of the secondary button?');
    expect(q[0].text).toMatch(
      /^button has background-color transparent \(secondary\)/,
    );
    const lines = writes(
      await how(t, 'make the card background the secondary button color'),
    );
    expect(lines).toEqual([
      `set ${t} background-color 'light-dark(#225bff, #fdee8c)' --on card`,
    ]);
    await follow(lines);
  }, 240_000);
});
