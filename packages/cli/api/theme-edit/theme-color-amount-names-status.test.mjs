// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How steps the color and the amount an ask names: a status banner
 * steps its own role's tokens; less visible borders are fainter, by the
 * share named; less blurry shadows are sharper; a part-less question about
 * the shadows, the text weight, the background or the borders' strength
 * reads the theme's value and never writes; "the color of the text" named
 * first is the text; a role color brighter steps the role; whole-theme
 * text takes a relative transparency; the page's density is the spacing
 * dial; and a heading level's size with "size" between takes the value.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-color-amount-names-status-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const how = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'ne'})
  );
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

describe('a status banner steps its own role', () => {
  it.each([
    ['make the warning banner darker', 'warning'],
    ['make the error banner lighter', 'error'],
    ['make the success banner darker', 'success'],
  ])(
    '%s',
    async (ask, status) => {
      const rs = await how(ask);
      expect(rs[0].text).toContain(`from --color-${status}-muted`);
      const w = writes(rs);
      expect(w.length).toBe(2);
      for (const c of w) expect(c).toContain(`--when status:${status}`);
    },
    120_000,
  );
});

describe('visibility and blur', () => {
  it('half as visible halves the border alpha; less visible is fainter; more visible is stronger', async () => {
    expect(writes(await how('make borders half as visible'))).toEqual([
      "set ne --color-border '#0000000a' --mode light",
      "set ne --color-border '#ffffff0d' --mode dark",
    ]);
    expect((await how('make borders less visible'))[0].text).toContain(
      'fainter',
    );
    expect((await how('make borders more visible'))[0].text).toContain(
      'stronger',
    );
  }, 120_000);

  it('less blurry shadows are sharper: blur halved, never fainter', async () => {
    const rs = await how('make shadows less blurry');
    expect(rs[0].text).toContain('sharper shadows everywhere');
    expect(rs[0].text).toContain('blur ×0.5');
  }, 120_000);
});

describe('part-less value questions', () => {
  it.each([
    ['how strong are the shadows', /^the shadows of ne are --shadow-low: /],
    [
      'how bold is the text',
      /^the body text weight of ne is 400 \(--text-body-weight\) now/,
    ],
    [
      'how dark is the background',
      /^the page background of ne is \S+ in light mode, \S+ in dark mode \(--color-background-body\) now/,
    ],
    [
      'how strong are the borders',
      /^the border color of ne is \S+ in light mode, \S+ in dark mode \(--color-border\) now/,
    ],
  ])(
    '%s: the value, nothing written',
    async (ask, text) => {
      const rs = await how(ask);
      expect(rs[0].text).toMatch(text);
      expect(writes(rs)).toEqual([]);
    },
    120_000,
  );
});

describe('words read as asked', () => {
  it('"the color of the text" named first is the text', async () => {
    expect(await how('make the color of the text darker')).toEqual(
      await how('make the text darker'),
    );
  }, 120_000);

  it('a role color brighter steps that role lighter', async () => {
    const w = writes(await how('make the danger color brighter'));
    expect(w[0]).toMatch(/^set ne danger '#[0-9a-f]{6}'$/);
    const darker = writes(await how('make the danger color darker'));
    expect(darker[0]).not.toEqual(w[0]);
  }, 120_000);

  it('whole-theme text takes a relative transparency', async () => {
    expect(writes(await how('make the text 50% more transparent'))).toEqual([
      "set ne --color-text-primary '#00000080' --mode light",
      "set ne --color-text-primary '#ffffff80' --mode dark",
      expect.stringMatching(
        /^set ne --color-text-secondary '#[0-9a-f]{6}80' --mode light$/,
      ),
      expect.stringMatching(
        /^set ne --color-text-secondary '#[0-9a-f]{6}80' --mode dark$/,
      ),
    ]);
  }, 120_000);

  it("the page's density is the spacing dial", async () => {
    expect(writes(await how('make the page less dense'))).toEqual([
      'set ne spacing more',
    ]);
    expect(writes(await how('make the page denser'))).toEqual([
      'set ne spacing less',
    ]);
  }, 120_000);

  it('a heading level\'s size with "size" between takes the value', async () => {
    // (The level's size token is offered beside it.)
    expect(writes(await how('make the h3 size 20px'))[0]).toBe(
      'set ne font-size 20px --on heading --when level:3',
    );
  }, 120_000);
});
