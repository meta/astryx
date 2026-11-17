// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers: a fainter word before a
 * part's text with a color says which text; a bare color after an ask on a
 * part's text is that text's color (with "fainter and red", the red at
 * that alpha); a look word before a part ("borderless", "text-only") names
 * the variants drawn without that paint; "the destructive button the
 * primary button color" reads the primary look; a title block's title
 * alone; a share in words of darker or lighter; a shadow's label follows
 * its factor; a status word after a possessive is that look. Every line
 * offered is run.
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
    'astryx-theme-readers-fainter-word-part-',
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

/** @param {string} name */
const fresh = async name => {
  await themeEditNew(name, {cwd, like: 'neutral'});
  return name;
};

describe('text', () => {
  it("the card's fainter text red, and fainter and red", async () => {
    const t = await fresh('x1');
    const red = writes(await how(t, "make the card's fainter text red"));
    expect(red).toEqual([
      `set ${t} --color-text-secondary '#dc2626' --on card`,
    ]);
    await follow(red);
    expect(
      writes(await how(t, "make the card's fainter text fainter and red")),
    ).toEqual([`set ${t} --color-text-secondary '#dc262699' --on card`]);
    const big = writes(await how(t, 'make the card text bigger and red'));
    expect(
      big.some(l => /--color-text-primary '#dc2626' --on card/.test(l)),
    ).toBe(true);
  }, 240_000);

  it("a dialog's title alone", async () => {
    expect(writes(await how('q0', 'make the dialog title red'))).toEqual([
      `set q0 --color-text-primary '#dc2626' --on dialog-header-title-block`,
    ]);
  }, 240_000);
});

describe('looks', () => {
  it('borderless and text-only buttons are the variants drawn so', async () => {
    const t = await fresh('x7');
    const lines = writes(await how(t, 'make the borderless buttons red'));
    expect(lines.join(' ')).not.toMatch(/border none/);
    for (const l of lines) expect(l).toMatch(/--when variant:/);
    await follow(lines);
    expect(writes(await how(t, 'make the text-only buttons red'))).toEqual([
      `set ${t} color '#dc2626' --on button --when variant:ghost`,
    ]);
  }, 240_000);

  it('the destructive button the primary button color', async () => {
    expect(
      writes(
        await how('q0', 'make the destructive button the primary button color'),
      ),
    ).toEqual([
      `set q0 background-color 'var(--color-accent)' --on button --when variant:destructive`,
    ]);
  }, 240_000);

  it('a status word after a possessive is that look', async () => {
    // (The success color for the whole theme follows as the second line.)
    expect(
      writes(await how('q0', "make the badge's success background green")),
    ).toEqual([
      `set q0 background-color '#16a34a' --on badge --when variant:success`,
      `set q0 success '#16a34a'`,
    ]);
  }, 240_000);
});

describe('amounts', () => {
  it('a third darker is a third of the way; a third as strong is softer', async () => {
    const a = writes(await how('q0', 'make the cards a third darker'));
    const b = writes(await how('q0', 'make the cards darker by a third'));
    expect(a[0]).toMatch(
      /'#aaaaaa' --on card --when variant:default --mode light/,
    );
    expect(b[0]).toBe(a[0]);
    expect(
      (await how('q0', 'make the shadows a third as strong'))[0].text,
    ).toMatch(/^softer shadows/);
  }, 240_000);
});
