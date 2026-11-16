// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads role words, sides and plain looks: a color "for
 * highlights" is the accent; "amber warnings" and status colors by hue are
 * the status colors; a status look that clashes names the status color;
 * chart colors name the data tokens; "no border except the bottom one"
 * keeps that side; a named color before a typed one is that value; a
 * blue-gray is the tinted gray; "clear" before errors is plain; less
 * contrast, a gentle dark mode, big type; deep and soft shades. Every line
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
    'astryx-theme-how-roles-and-sides-',
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

/** The one-step answer's commands. @param {Array<{text: string, commands: string[]}>} rs */
const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));
/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');

describe('roles', () => {
  it('highlights, warnings, a clash, charts', async () => {
    expect(writes(await how('q0', 'magenta #ff00e6 for highlights'))[0]).toBe(
      `set q0 accent '#ff00e6'`,
    );
    expect(
      top(
        await how(
          'q0',
          'dark only, chart-friendly palette, dense tables, amber warnings',
        ),
      ),
    ).toEqual([
      'set q0 mode dark-only',
      'set q0 spacing less --on table-row',
      `set q0 warning '#f59e0b'`,
    ]);
    const clash = await how(
      'q0',
      'the blue info banner clashes with the green',
    );
    expect(writes(clash)).toEqual([]);
    expect(texts(clash)).toMatch(/the info look is the info color/);
    const charts = await how('q0', 'chart colors');
    expect(texts(charts)).toMatch(/--color-data-categorical-/);
  }, 240_000);
});

describe('sides', () => {
  it('no border except the bottom one keeps that side', async () => {
    const lines = top(
      await how('q0', 'no border on inputs except the bottom one'),
    );
    expect(lines).toEqual([
      'set q0 border none --on inputs',
      "set q0 border-bottom '1px solid var(--color-border-emphasized)' --on inputs",
    ]);
    await follow(lines);
  }, 240_000);
});

describe('plain looks', () => {
  it('status colors by hue, a typed value, blue-gray, clear errors', async () => {
    expect(
      top(
        await how(
          'q0',
          'status colors green #15803d, amber #b45309, red #b91c1c',
        ),
      ),
    ).toEqual([
      `set q0 success '#15803d'`,
      `set q0 warning '#b45309'`,
      `set q0 danger '#b91c1c'`,
    ]);
    expect(
      writes(await how('q0', 'light gray fill #F1F2F4 on cards'))[0],
    ).toMatch(/background-color '#f1f2f4' --on card/);
    expect(writes(await how('q0', 'calm soft blue-gray'))[0]).toBe(
      `set q0 neutral '#617090'`,
    );
    expect(top(await how('q0', 'clear error messages, larger text'))).toEqual([
      'set q0 text-size more',
    ]);
  }, 240_000);

  it('less contrast, a gentle dark mode, big type, deep and soft shades', async () => {
    expect(writes(await how('q0', 'less contrast'))).toEqual([
      `set q0 --color-text-primary '#333333' --mode light`,
      `set q0 --color-text-primary '#cccccc' --mode dark`,
    ]);
    expect(top(await how('q0', 'gentle dark mode'))).toEqual([
      `set q0 --color-text-primary '#cccccc' --mode dark`,
      `set q0 --color-background-body '#292929' --mode dark`,
    ]);
    expect(writes(await how('q0', 'big readable text'))).toEqual([
      'set q0 text-size more',
    ]);
    expect(writes(await how('q0', 'deep teal accent'))[0]).toBe(
      `set q0 accent '#085952'`,
    );
    expect(writes(await how('q0', 'soft coral accent'))[0]).toBe(
      `set q0 accent '#f87171'`,
    );
  }, 240_000);
});
