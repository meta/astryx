// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers, round 41: a typed share on a part's fainter text;
 * an exact amount on a height scales the control heights the part reads;
 * a state word is read by the one table of words for states (expanded, a
 * toggle's pressed); height questions are answered; a way word goes with the
 * thing named ("corners twice as tight"); an exact border width keeps the
 * borderless looks; typed tokens each with a way; a mode named in a
 * phrase or a label is read by the one mode reader. Every line offered is
 * run.
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
  cwd = makeLinkedFixture('astryx-theme-hunt-h-round41-', FIXTURE_PACKAGES);
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

describe('amounts as typed', () => {
  it("a part's text 30% fainter is 30% lower alpha", async () => {
    const t = await fresh('a1');
    const rs = await how(t, 'make the card text 30% fainter');
    expect(rs[0].text).toContain('30% lower (× 0.7)');
    expect(writes(rs)[0]).toBe(
      `set ${t} --color-text-primary '#000000b3' --on card --mode light`,
    );
    await follow(writes(rs));
  }, 240_000);

  it('twice as short, half as tall, twice as tall scale the control heights', async () => {
    const t = await fresh('a2');
    const short = writes(await how(t, 'make the buttons twice as short'));
    expect(short).toEqual([
      `set ${t} --size-element-md 16px --on button`,
      `set ${t} --size-element-sm 14px --on button`,
    ]);
    expect(writes(await how(t, 'make the buttons half as tall'))).toEqual(
      short,
    );
    const tall = writes(await how(t, 'make the buttons twice as tall'));
    expect(tall[0]).toBe(`set ${t} --size-element-md 64px --on button`);
    await follow(short);
  }, 240_000);

  it('an exact border width keeps the borderless looks, as thinner does', async () => {
    const t = await fresh('a3');
    const half = writes(await how(t, 'make the input border half as thick'));
    const thinner = writes(await how(t, 'make the input border thinner'));
    expect(half).toEqual(thinner);
    expect(half[0]).toBe(`set ${t} border-width 0.5px --on inputs`);
    await follow(half);
  }, 240_000);

  it('corners twice as tight: the corners only, with no line about room', async () => {
    const t = await fresh('a4');
    const rs = await how(t, 'make the button corners twice as tight');
    expect(rs.map(r => r.text).join('\n')).not.toMatch(/nothing is written/);
    // (Half the radius it has now.)
    expect(writes(rs)).toEqual([`set ${t} border-radius 0.313rem --on button`]);
    await follow(writes(rs));
  }, 240_000);
});

describe('states by the one table of words for them', () => {
  it("expanded is the part's expanded state; pressed is a toggle's isPressed", async () => {
    const t = await fresh('s1');
    const exp = writes(await how(t, 'button text bold when expanded'));
    expect(exp).toEqual([
      `set ${t} font-weight 700 --on button --state expanded`,
    ]);
    await follow(exp);
    const pressed = writes(
      await how(t, 'make the toggle button background red when pressed'),
    );
    expect(pressed).toEqual([
      `set ${t} background-color '#dc2626' --on toggle-button --state isPressed`,
    ]);
    // (A button's press is still its active state.)
    const press = writes(await how(t, 'make buttons darker when pressed'));
    expect(press.every(l => / --state active\b/.test(l))).toBe(true);
  }, 240_000);
});

describe('questions and words', () => {
  it('height questions are answered from the heights the part reads', async () => {
    for (const q of [
      'what is the height of buttons?',
      'how tall are the buttons?',
    ]) {
      const rs = await how('q0', q);
      expect(rs[0].text, q).toMatch(
        /^button has height 32px \(--size-element-md\)/,
      );
      expect(writes(rs)).toEqual([]);
    }
  }, 240_000);

  it("a mode named in a phrase or the editor's own label, typos that keep the letters too", async () => {
    for (const [q, mode] of [
      ['make the button background red in drak mode', 'dark'],
      ['make the button background red in ligth mode', 'light'],
      ['button background red (drak)', 'dark'],
      ['button background red [dark only]', 'dark'],
    ]) {
      expect(writes(await how('q0', q)), q).toEqual([
        `set q0 background-color '#dc2626' --on button --mode ${mode}`,
      ]);
    }
  }, 240_000);

  it('typed tokens, each with its own way', async () => {
    const t = await fresh('w1');
    const lines = writes(
      await how(t, 'make --color-accent darker and --color-error darker'),
    );
    expect(new Set(lines.map(l => l.split(' ')[2]))).toEqual(
      new Set(['--color-accent', '--color-error']),
    );
    await follow(lines);
  }, 240_000);
});
