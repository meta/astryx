// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers, mediums and: what a color is read
 * on is the ground ("darker so it reads on the page", stepped to 3:1); a
 * page's color paints the main panel drawn over it in its second line; a
 * length beside a text look is the text's size; a ring said of the focused
 * state is the focus ring on those parts; only one side's border, and that
 * side's color alone; every text color measured for "all text 7:1";
 * "large text", "grayscale"; a fill typed on a part takes a text color its
 * label reads on; one-line looks: a deep shade, a quiet color the neutral,
 * "works in dark mode" scoping nothing, the mode the app opens in; a
 * purpose clause names no part; "a bit lighter" headings one rung; a color
 * before the part says how it looks now. Every line offered is run.
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
    'astryx-theme-readers-mediums-color-ground-',
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

/** The one-step answer's commands. @param {Array<{text: string, commands: string[]}>} rs */
const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));

describe('grounds and pages', () => {
  it('the warning color darker so it reads on the page', async () => {
    const lines = top(
      await how('q0', 'make the warning color darker so it reads on the page'),
    );
    expect(lines[0]).toMatch(/^set q0 warning '#[0-9a-f]{6}'$/);
  }, 240_000);

  it('the page in dark mode also offers the main panel drawn over it', async () => {
    const rs = await how('q0', 'page background #0b1020 in dark mode');
    expect(rs[0].commands.filter(c => /^set /.test(c))).toEqual([
      `set q0 --color-background-body '#0b1020' --mode dark`,
      `set q0 background-color '#0b1020' --on app-shell --mode dark`,
      `set q0 background-color '#0b1020' --on layout-content --mode dark`,
    ]);
  }, 240_000);
});

describe('text, rings and borders', () => {
  it('table header text uppercase 12px keeps the size', async () => {
    const t = await fresh('t1');
    const lines = top(await how(t, 'table header text uppercase 12px'));
    expect(lines).toEqual([
      `set ${t} text-transform uppercase --on table-header-cell`,
      `set ${t} font-size 12px --on table-header-cell`,
    ]);
    await follow(lines);
  }, 240_000);

  it('when inputs are focused, a ring: the inputs focus ring', async () => {
    const lines = writes(
      await how('q0', 'when inputs are focused, a 2px #4f46e5 ring'),
    );
    expect(lines[0]).toBe(
      `set q0 box-shadow 'inset 0 0 0 2px #4f46e5' --on inputs --state focus-within`,
    );
    expect(lines.join(' ')).not.toMatch(/--focus-outline-color/);
  }, 240_000);

  it('only a bottom border; a darker bottom edge', async () => {
    const t = await fresh('b1');
    const only = top(await how(t, 'inputs should have only a bottom border'));
    expect(only[0]).toBe(`set ${t} border none --on inputs`);
    expect(only[1]).toMatch(/^set \S+ border-bottom '1px solid /);
    await follow(only);
    const edge = writes(await how(t, 'slightly darker bottom edge on cards'));
    expect(edge).toEqual([
      `set ${t} border-bottom-color 'color-mix(in srgb, var(--color-border) 85%, black)' --on card`,
    ]);
    await follow(edge);
  }, 240_000);

  it('all text 7:1 measures every text color', async () => {
    const rs = await how('q0', 'all text at least 7:1 contrast');
    expect(rs[0].text).toContain(
      '--color-text-primary, --color-text-secondary, --color-text-accent',
    );
  }, 240_000);
});

describe('dials and labels', () => {
  it('large text, grayscale on a gray theme', async () => {
    expect(writes(await how('q0', 'large text'))).toEqual([
      'set q0 text-size more',
    ]);
    const g = await how('q0', 'grayscale');
    expect(writes(g)).toEqual([]);
    expect(g[0].text).toMatch(/no color to take out/);
  }, 240_000);
});

describe('one-line looks and purposes', () => {
  it('a deep green accent and a sand neutral', async () => {
    const lines = top(
      await how(
        'q0',
        'elegant, airy boutique hotel theme: deep green and sand',
      ),
    );
    expect(lines).toContain(`set q0 accent '#166534'`);
    expect(lines).toContain(`set q0 neutral '#d6c6a5'`);
  }, 240_000);

  it('a theme that works in dark mode scopes nothing to dark', async () => {
    const lines = top(
      await how(
        'q0',
        'clean, very readable docs site theme that works in dark mode with a teal brand color',
      ),
    );
    expect(lines).toContain(`set q0 accent '#0d9488'`);
    expect(lines.join(' ')).not.toMatch(/--mode dark/);
  }, 240_000);

  it('the app opens in dark mode: <Theme mode>, or dark-only', async () => {
    const rs = await how('q0', 'the app should open in dark mode by default');
    expect(rs[0].text).toContain('<Theme mode="dark">');
    expect(writes(rs)).toEqual(['set q0 mode dark-only']);
  }, 240_000);

  it('a purpose clause names no part; readable text is larger', async () => {
    const rs = await how(
      'q0',
      'make the selected sidebar item teal so readers see which page they are on',
    );
    expect(rs.map(r => r.text).join(' ')).not.toMatch(
      /page has no selected state/,
    );
    expect(writes(await how('q0', 'make text more readable'))).toEqual([
      'set q0 text-size more',
    ]);
  }, 240_000);

  it('headings a bit lighter is one rung', async () => {
    expect(
      top(
        await how(
          'q0',
          'corners a little less rounded everywhere, and headings a bit lighter',
        ),
      ),
    ).toEqual(['set q0 corners less', 'set q0 headings medium']);
  }, 240_000);

  it('a color before the part says how it looks now', async () => {
    expect(
      writes(await how('q0', 'make the brown dark content area deep green')),
    ).toEqual([`set q0 background-color '#166534' --on layout-content`]);
  }, 240_000);
});
