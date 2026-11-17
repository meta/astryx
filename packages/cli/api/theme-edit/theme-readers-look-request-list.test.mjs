// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's readers, testers: a one-line look request is
 * a list of asks through the readers (the theme's mode, a named color for
 * the accent or the page, density, contrast, fonts), each its line, with
 * the words no setting reads named; design color names ("terracotta",
 * "sage", "blue-gray") resolve through the color table; a light page is
 * the light page; a complaint says how a part looks now; "calmer" is less
 * saturated; a status's fill on one part also offers its dial; "almost
 * square" is the small corners; a shadow's size word picks its size.
 * Every line offered is run.
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
    'astryx-theme-readers-look-request-list-',
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

/** The one-step answer's commands, "all of it" when several. @param {Array<{text: string, commands: string[]}>} rs */
const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));

describe('a one-line look request', () => {
  it('a calm, Linear-like dark theme with a violet accent', async () => {
    const t = await fresh('b1');
    const rs = await how(
      t,
      'Give our project-management app a calm, Linear-like dark theme with a violet accent.',
    );
    const lines = top(rs);
    expect(lines).toContain(`set ${t} mode dark-only`);
    expect(lines).toContain(`set ${t} accent '#7c3aed'`);
    expect(lines.join(' ')).not.toMatch(/--mode dark/);
    expect(rs.map(r => r.text).join(' ')).toMatch(
      /not taken: [^:]*"calm", "linear-like"/,
    );
    await follow(lines);
  }, 240_000);

  it('cream background, terracotta accent, serif headings', async () => {
    const t = await fresh('b2');
    const rs = await how(
      t,
      'Make a warm, friendly theme for our recipe site: cream background, terracotta accent, serif headings.',
    );
    const lines = top(rs);
    expect(lines).toContain(
      `set ${t} --color-background-body '#fef3c7' --mode light`,
    );
    expect(lines).toContain(`set ${t} accent '#c2603d'`);
    expect(lines).toContain(`set ${t} font serif --on heading`);
    await follow(lines);
  }, 240_000);

  it('high-contrast compact enterprise theme in navy and white', async () => {
    const lines = top(
      await how(
        'q0',
        'high-contrast compact enterprise theme in navy and white',
      ),
    );
    expect(lines).toContain('set q0 spacing less');
    expect(lines).toContain(`set q0 accent '#1e3a8a'`);
    expect(lines.some(l => /--color-text-secondary/.test(l))).toBe(true);
    expect((await how('q0', 'navy'))[0].commands[0]).toBe(
      `set q0 accent '#1e3a8a'`,
    );
  }, 240_000);

  it('a list of colors for a part stays one ask', async () => {
    const lines = writes(
      await how('q0', 'make the buttons red, green and blue'),
    );
    expect(lines.join(' ')).not.toMatch(/\baccent\b/);
  }, 240_000);
});

describe('colors and complaints', () => {
  it('a blue-gray is a gray with blue in it', async () => {
    const lines = writes(await how('q0', 'make the neutral a blue-gray'));
    expect(lines[0]).toMatch(/^set q0 neutral '#[0-9a-f]{6}'$/);
    expect(lines[0]).not.toContain('#2563eb');
  }, 240_000);

  it('the error toast is too bright red; make it calmer', async () => {
    const t = await fresh('c1');
    const lines = top(
      await how(t, 'the error toast is too bright red; make it calmer'),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/--on toast --when type:error/);
    expect(lines.join(' ')).not.toContain('#dc2626');
    await follow(lines);
  }, 240_000);

  it('the main content area is white; make it cream', async () => {
    expect(
      writes(
        await how(
          'q0',
          'the main content area is white; make it cream too in light mode',
        ),
      ),
    ).toEqual([
      `set q0 background-color '#fef3c7' --on layout-content --mode light`,
    ]);
  }, 240_000);

  it('a status fill on one part offers its dial too', async () => {
    const rs = await how('q0', 'make the info banner navy');
    expect(rs[0].commands.filter(c => /^set /.test(c))).toEqual([
      `set q0 background-color '#1e3a8a' --on banner --when status:info`,
      `set q0 info '#1e3a8a'`,
    ]);
  }, 240_000);
});

describe('dials', () => {
  it('sharper corners, almost square: the small corners', async () => {
    expect(writes(await how('q0', 'sharper corners, almost square'))).toEqual([
      'set q0 corners small',
    ]);
  }, 240_000);

  it('a small or big shadow picks that size', async () => {
    expect(writes(await how('q0', 'give the cards a small shadow'))).toEqual([
      `set q0 box-shadow 'var(--shadow-low)' --on card`,
    ]);
    expect(writes(await how('q0', 'give the cards a big shadow'))).toEqual([
      `set q0 box-shadow 'var(--shadow-high)' --on card`,
    ]);
  }, 240_000);
});

describe('wild', () => {
  it('a role named with its value is that role: the accent text', async () => {
    const lines = writes(await how('q0', 'make the accent text #0033aa'));
    expect(lines[0]).toMatch(/^set q0 --color-text-accent '#0033aa'/);
  }, 240_000);

  it('a rounded font is a font, never corners', async () => {
    expect(writes(await how('q0', 'rounded font'))).toEqual([
      'set q0 font rounded',
    ]);
    const both = top(
      await how('q0', 'very round pill buttons and a rounded font'),
    );
    expect(both).toEqual([
      'set q0 corners pill --on button',
      'set q0 font rounded',
    ]);
  }, 240_000);

  it('a typed hex wins over off-white', async () => {
    const lines = writes(
      await how('q0', 'warm off-white page #f6f0e4 in light mode'),
    );
    expect(lines.join(' ')).not.toMatch(/#fafafa|neutral/);
    expect(lines[0]).toBe(
      `set q0 --color-background-body '#f6f0e4' --mode light`,
    );
  }, 240_000);

  it("the theme's mode in everyday words; right to left needs no change", async () => {
    expect(writes(await how('q0', 'light only'))).toEqual([
      'set q0 mode light-only',
    ]);
    expect(writes(await how('q0', 'no dark mode'))).toEqual([
      'set q0 mode light-only',
    ]);
    const rtl = await how('q0', 'right-to-left app for Arabic');
    expect(writes(rtl)).toEqual([]);
    expect(rtl.map(r => r.text).join(' ')).toMatch(/dir="rtl"/);
  }, 240_000);
});
