// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers: a part named as the color gives the color
 * it shows in the status or variant named, and its words are never the
 * change asked; a base theme's own literal is what a part shows; a part
 * that reads the same token as the reference takes nothing; a share of a
 * text's opacity is its text alpha; a pronoun names the parts named
 * before; "a third fainter" keeps two thirds; the verb that starts an ask
 * is no part; a status kept on a group writes back each member's look as
 * it shows it; a kept focus ring stays kept, in one mode too; a value
 * question reads a part's own axis (a toast's type); a way by an amount is
 * that amount of the way; a mode said with a typo is that mode everywhere;
 * an open part is its open state; a state's fill token is set in that
 * state. Every line offered is run.
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

import {butterTheme} from '../../../themes/butter/src/butterTheme';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-readers-part-named-color-',
    FIXTURE_PACKAGES,
  );
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

/** @param {string} name @param {string} [like] */
const fresh = async (name, like = 'neutral') => {
  await themeEditNew(name, {cwd, like});
  return name;
};

describe('a part named as the color', () => {
  it('gives the color it shows in the status or variant named', async () => {
    const t = await fresh('c1');
    const err = writes(
      await how(t, 'make the button background the color of the error banner'),
    );
    expect(err).toEqual([
      `set ${t} background-color 'var(--color-error-muted)' --on button`,
    ]);
    await follow(err);
    expect(
      writes(
        await how(
          t,
          'make the button background the same color as the success banner',
        ),
      ),
    ).toEqual([
      `set ${t} background-color 'var(--color-success-muted)' --on button`,
    ]);
    // (Neutral writes its destructive button's own fill: the muted error.)
    expect(
      writes(await how(t, 'make the badges the color of the danger buttons')),
    ).toEqual([
      `set ${t} background-color 'var(--color-error-muted)' --on badge`,
    ]);
  }, 240_000);

  it('its words are never the change asked: cards the button color are filled', async () => {
    const t = await fresh('c2');
    const lines = writes(await how(t, 'make the cards the button color'));
    expect(lines).toEqual([
      `set ${t} background-color 'var(--color-accent)' --on card`,
    ]);
    await follow(lines);
  }, 240_000);

  it('a part reading the same token as the reference takes nothing', async () => {
    const rs = await how('q0', 'make the buttons as round as the inputs');
    expect(writes(rs)).toEqual([]);
    expect(rs[0].text).toMatch(/already, as inputs does/);
  }, 240_000);
});

describe('values and amounts', () => {
  it("a base theme's own literal is what a part shows", async () => {
    const t = await fresh('v1', 'butter');
    const rs = await how(
      t,
      'what color is the secondary button text in dark mode?',
    );
    expect(rs[0].text).toMatch(
      /^button has color #fdee8c in dark mode \(secondary\)/,
    );
  }, 240_000);

  it("a value question reads a toast's type", async () => {
    const rs = await how('q0', 'what color are error toasts?');
    expect(rs[0].text).toMatch(/^toast has background-color \S+ \(error\) now/);
    expect(rs[0].text).not.toMatch(/#0A1317/i);
  }, 240_000);

  it("a share of a text's opacity, a third fainter, transparent by 40%", async () => {
    const t = await fresh('v2');
    const op = writes(await how(t, 'make the card text 25% of its opacity'));
    expect(op[0]).toBe(
      `set ${t} --color-text-primary '#00000040' --on card --mode light`,
    );
    await follow(op);
    const third = await how(t, 'make the card border a third fainter');
    expect(third[0].text).toContain('at 67% of its alpha');
    const by = await how(t, 'make the button text transparent by 40%');
    expect(by[0].text).toContain('alpha 40% lower');
    expect(writes(by).join('\n')).not.toMatch(/opacity|transparent --on/);
  }, 240_000);

  it('the secondary text on cards lighter: that token on the cards', async () => {
    const t = await fresh('v3');
    const lines = writes(
      await how(t, 'make the secondary text on cards 30% lighter'),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines)
      expect(l).toMatch(
        /^set v3 --color-text-secondary '#[0-9a-f]{6}' --on card --mode (light|dark)$/,
      );
    await follow(lines);
  }, 240_000);
});

describe('words', () => {
  it('a pronoun names the parts named before; the verb is no part', async () => {
    const rs = await how(
      'q0',
      'never make the buttons rounder than 6px and make them rounder',
    );
    expect(writes(rs).join('\n')).not.toMatch(/set q0 corners more$/m);
    const rm = writes(await how('q0', 'remove the shadow from everything'));
    expect(rm[0]).toBe('set q0 --shadow-low none');
  }, 240_000);

  it('a mode said with a typo, in a phrase, a label or before a comma', async () => {
    for (const [q, line] of [
      [
        'in drak mode, make the cards red',
        "set q0 background-color '#dc2626' --on card --when variant:default --mode dark",
      ],
      [
        'button background red (drak)',
        "set q0 background-color '#dc2626' --on button --mode dark",
      ],
    ])
      expect(writes(await how('q0', q))[0], q).toBe(line);
    const bare = await how('q0', 'button background (drak)');
    expect(bare[0].text).toMatch(
      /names button and what to look at, but no change/,
    );
  }, 240_000);

  it("an open part is its open state; a state's fill token is set in that state", async () => {
    expect(writes(await how('q0', 'make the open select red'))).toEqual([
      "set q0 background-color '#dc2626' --on selector --state expanded --only",
    ]);
    const t = await fresh('w1');
    const toggle = writes(
      await how(t, 'make the active toggle button background darker'),
    );
    expect(
      toggle.every(l =>
        / --on toggle-button --state active --mode (light|dark)$/.test(l),
      ),
    ).toBe(true);
    await follow(toggle);
  }, 240_000);
});

describe('keeps', () => {
  it('a kept focus ring stays kept, in one mode too', async () => {
    const t = await fresh('k1');
    const keep = writes(
      await how(
        t,
        'make the focus ring on inputs red but keep the invalid ones',
      ),
    );
    expect(keep).toContain(
      `set ${t} box-shadow none --on inputs --when status:error --state focus-within`,
    );
    await follow(keep);
    const dark = writes(
      await how(
        'q0',
        'make the focus ring on inputs red in dark mode except invalid ones',
      ),
    );
    expect(dark[0]).toBe(
      "set q0 box-shadow 'inset 0 0 0 2px light-dark(var(--color-accent-muted), #dc2626)' --on inputs --state focus-within",
    );
    expect(dark).toContain(
      'set q0 box-shadow none --on inputs --when status:error --state focus-within',
    );
  }, 240_000);

  it("a status kept on a group writes back each member's look as it shows it", async () => {
    const t = await fresh('k2', 'butter');
    const lines = writes(
      await how(t, 'make the input border red except the error ones'),
    );
    expect(lines[0]).toBe(`set ${t} border-color '#dc2626' --on inputs`);
    // Butter's own frame on a text input, as its theme writes it.
    const own = String(
      /** @type {any} */ (butterTheme).components['text-input'].base
        .borderColor,
    );
    expect(lines).toContain(
      `set ${t} border-color '${own}' --on text-input --when status:error --only`,
    );
    await follow(lines);
  }, 240_000);
});
