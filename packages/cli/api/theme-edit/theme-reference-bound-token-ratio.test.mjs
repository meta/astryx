// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads a reference as what it is, and holds a bound on every
 * token: after a ratio, the part after "on" is the ground; a status
 * banner's text steps its own role's text token; a part that reads a
 * property from several tokens answers each; the page is the whole theme
 * for a dial, and its colors are its body tokens; "as dark as" a part
 * takes that part's fill; striped rows step the token Core paints the
 * stripes with; outline buttons keep a width change; and a length bound on
 * the corners dial holds every radius the dial writes.
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
    'astryx-theme-reference-bound-token-ratio-',
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

describe('references', () => {
  it('after a ratio, the part after "on" is the ground, never written', async () => {
    const rs = await how('make the input border 3:1 contrast on the card');
    expect(rs[0].text).toContain('against --color-background-card');
    for (const c of writes(rs)) expect(c).not.toContain('--on card');
    const button = await how('make the button border 3:1 contrast on the card');
    for (const c of writes(button)) expect(c).not.toContain('--on card');
  }, 120_000);

  it('the page background is its body token', async () => {
    expect(
      writes(
        await how('make the card background equal to the page background'),
      ),
    ).toEqual([
      "set ne background-color 'var(--color-background-body)' --on card",
    ]);
  }, 120_000);

  it('"as dark as dialogs" takes the dialog\'s fill, never an invented color', async () => {
    expect(writes(await how('make cards as dark as dialogs'))).toEqual([
      "set ne background-color 'var(--color-background-surface)' --on card",
    ]);
  }, 120_000);
});

describe('status banner text', () => {
  it.each([
    ['make the error banner text darker', 'error'],
    ['make the warning banner text darker', 'warning'],
  ])(
    "%s steps its own role's text token",
    async (ask, status) => {
      const rs = await how(ask);
      expect(rs[0].text).toContain(`from --color-on-${status}-muted`);
      for (const c of writes(rs))
        expect(c).toContain(`--when status:${status}`);
    },
    120_000,
  );
});

describe('values read whole', () => {
  it("a heading's weight per token, never one for all", async () => {
    const rs = await how('what weight are the headings');
    expect(rs[0].text).toContain('700 (--text-heading-3-weight)');
    expect(rs[0].text).toContain('600 (--text-heading-1-weight)');
    expect(writes(rs)).toEqual([]);
  }, 120_000);
});

describe('dials and tokens', () => {
  it("the page density is the whole theme's spacing dial", async () => {
    expect(writes(await how('make the page density compact'))).toEqual([
      'set ne spacing compact',
    ]);
  }, 120_000);

  it('striped rows step the stripe token on the row', async () => {
    const w = writes(await how('make striped table rows lighter'));
    expect(w).toEqual([
      expect.stringMatching(
        /^set ne --color-background-muted '#[0-9a-f]{6}' --on table-row --mode light$/,
      ),
      expect.stringMatching(
        /^set ne --color-background-muted '#[0-9a-f]{6}' --on table-row --mode dark$/,
      ),
    ]);
  }, 120_000);

  it('outline buttons thicker: the outline look and a wider outline, never dropped', async () => {
    expect(writes(await how('make outline buttons thicker bordered'))).toEqual([
      'set ne buttons outline',
      'set ne border-width 2px --on button --when variant:primary',
    ]);
  }, 120_000);

  it('a corner bound holds every radius the dial writes', async () => {
    const rs = await how('make corners never more than 8px');
    expect(writes(rs)).toEqual([
      'set ne corners 8px',
      'set ne --radius-container 8px',
      'set ne --radius-page 8px',
    ]);
    expect(rs[0].text).toContain('held at 8px');
  }, 120_000);
});
