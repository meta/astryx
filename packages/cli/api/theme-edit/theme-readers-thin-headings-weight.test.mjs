// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers, s: thin headings are a
 * weight; an app's own custom properties are read by their role; "reader"
 * is a word, never "header"; "<color> text on a <color> page" is each its
 * own; a muted text color goes to the mode it reads in; a dark-only
 * theme's page needs no mode; a pasted brand lead names no accent; glass
 * words, a rung said with a way, gridlines, big buttons; a side before a
 * border and a width before it; a dialog's own edge; a size beside a way;
 * text looks run in turn; a fill whose text would not read takes a
 * readable-text line beside it; show's missed list leads only an ask
 * about that look. Every line offered is run.
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
    'astryx-theme-readers-thin-headings-weight-',
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

describe('wild wrong writes', () => {
  it('thin elegant headings are a light weight, never a border', async () => {
    const lines = top(
      await how('q0', 'thin elegant headings with wide letter spacing'),
    );
    expect(lines[0]).toBe('set q0 headings light');
    expect(lines.join(' ')).not.toMatch(/border/);
  }, 240_000);

  it("an app's own custom properties are read by their role", async () => {
    const t = await fresh('v1');
    const lines = top(
      await how(
        t,
        '--brand-primary: #4f46e5; --brand-bg: #f9fafb; --brand-text: #111827; --brand-radius: 6px',
      ),
    );
    expect(lines).toEqual([
      `set ${t} accent '#4f46e5'`,
      `set ${t} --color-background-body '#f9fafb' --mode light`,
      `set ${t} --color-text-primary '#111827' --mode light`,
      `set ${t} corners 6px`,
    ]);
    await follow(lines);
  }, 240_000);

  it('a reader app is no header; text on a page is each its own', async () => {
    const r = await how('q0', 'book reader app: huge text');
    expect(writes(r).join(' ')).not.toMatch(/app-shell-header/);
    expect(top(await how('q0', 'green text on a black page'))).toEqual([
      `set q0 --color-background-body '#000000' --mode dark`,
      `set q0 --color-text-primary '#16a34a' --mode dark`,
    ]);
  }, 240_000);

  it('a secondary text color goes to the mode it reads in', async () => {
    expect(writes(await how('q0', 'secondary text #9ca3af'))).toEqual([
      `set q0 --color-text-secondary '#9ca3af' --mode dark`,
    ]);
  }, 240_000);

  it('a brand lead names no accent', async () => {
    const lines = top(
      await how('q0', 'luxury fashion brand: black and ivory, gold accent'),
    );
    expect(lines).toContain(`set q0 accent '#ca8a04'`);
    expect(lines.join(' ')).not.toMatch(/accent '#000000'/);
  }, 240_000);
});

describe('wild mediums and lows', () => {
  it("a dark-only theme's page needs no mode", async () => {
    expect(top(await how('q0', 'dark only, page #0b0b10'))).toEqual([
      'set q0 mode dark-only',
      `set q0 --color-background-body '#0b0b10'`,
    ]);
  }, 240_000);

  it('glass, a rung with a way, gridlines, big buttons', async () => {
    expect(writes(await how('q0', 'frosted glass look'))).toEqual([
      'set q0 surfaces glass',
    ]);
    expect(writes(await how('q0', 'tight dense spacing'))).toEqual([
      'set q0 spacing tight',
    ]);
    expect(
      writes(await how('q0', 'show gridlines between table cells'))[0],
    ).toMatch(/--on table-cell$/);
    expect(writes(await how('q0', 'big buttons'))).toEqual([
      'set q0 spacing more --on button',
    ]);
  }, 240_000);
});

describe('clones', () => {
  it('a side before a border, a width before it, a dialog edge', async () => {
    const t = await fresh('c1');
    const side = writes(await how(t, 'inputs: bottom border 1px #49454f'));
    expect(side).toEqual([
      `set ${t} border-bottom '1px solid #49454f' --on inputs`,
    ]);
    await follow(side);
    expect(writes(await how(t, 'buttons 1px border rgba(0,0,0,0.2)'))).toEqual([
      `set ${t} border '1px solid rgba(0,0,0,0.2)' --on button`,
    ]);
    expect(writes(await how(t, 'dialogs with a 1px border #23252a'))).toEqual([
      `set ${t} border '1px solid #23252a' --on dialog`,
    ]);
  }, 240_000);

  it('a size beside a way; an example keeps the way; text looks in turn', async () => {
    expect(top(await how('q0', 'make the text bigger, 17px like iOS'))).toEqual(
      ['set q0 text-size 17'],
    );
    expect(
      top(await how('q0', 'make the corners a little rounder, like 1 or 2 px')),
    ).toEqual(['set q0 corners more']);
    expect(top(await how('q0', 'badges uppercase bold'))).toEqual([
      'set q0 text-transform uppercase --on badge',
      'set q0 font-weight 700 --on badge',
    ]);
  }, 240_000);
});

describe('a fill and its text', () => {
  it('a fill whose text would not read takes a readable-text line beside it', async () => {
    const t = await fresh('f1');
    const rs = await how(t, 'make the primary button #0064E0');
    expect(rs[0].commands.filter(c => /^set /.test(c))).toEqual([
      `set ${t} background-color '#0064e0' --on button --when variant:primary`,
    ]);
    expect(rs[1].text).toMatch(/^readable text on that fill/);
    expect(rs[1].commands.filter(c => /^set /.test(c))).toEqual([
      `set ${t} color '#ffffff' --on button --when variant:primary --mode dark`,
    ]);
    await follow(
      [...rs[0].commands, ...rs[1].commands].filter(c => /^set /.test(c)),
    );
    const reads = await how(t, 'make the cards red');
    expect(reads.some(r => /^readable text on that fill/.test(r.text))).toBe(
      false,
    );
  }, 240_000);
});
