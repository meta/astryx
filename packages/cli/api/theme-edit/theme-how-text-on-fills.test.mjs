// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How measures a typed text color on the fill its part shows: a
 * primary button's own fill, a see-through look's page; it goes to the
 * mode it reads in. Also a part's gray text, Tailwind corner and text
 * classes, the far spacing rung, a table without vertical lines. Every
 * line offered is run.
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
  cwd = makeLinkedFixture('astryx-theme-how-text-on-fills-', FIXTURE_PACKAGES);
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

describe('text on fills', () => {
  it('white text on the primary button goes to the mode it reads in', async () => {
    const lines = writes(await how('q0', 'white text on the primary button'));
    expect(lines).toEqual([
      `set q0 color '#ffffff' --on button --when variant:primary --mode light`,
    ]);
    await follow(lines);
    expect(writes(await how('q0', 'black text on secondary buttons'))).toEqual([
      `set q0 color '#000000' --on button --when variant:secondary --mode light`,
    ]);
  }, 240_000);

  it("a part's gray text is that part's", async () => {
    expect(writes(await how('q0', 'ghost buttons gray text'))[0]).toMatch(
      /--on button --when variant:ghost/,
    );
  }, 240_000);
});

describe('class names and rungs', () => {
  it('Tailwind corners and text, the far rung, no vertical lines', async () => {
    expect(writes(await how('q0', 'rounded-md cards'))[0]).toBe(
      'set q0 border-radius 6px --on card',
    );
    // ("labels" said bare reads two parts; a form's labels are one.)
    expect(writes(await how('q0', 'text-sm form labels'))).toEqual([
      'set q0 font-size 14px --on field-label',
    ]);
    expect(writes(await how('q0', 'very compact'))).toEqual([
      'set q0 spacing tight',
    ]);
    expect(
      writes(await how('q0', 'tables without vertical borders'))[0],
    ).toMatch(/^set q0 border-inline 0 --on table/);
  }, 240_000);
});
