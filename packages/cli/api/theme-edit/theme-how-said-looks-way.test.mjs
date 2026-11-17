// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A look said as a word takes that word's way: a dark gradient is
 * dark, with text that reads on it; small labels are smaller; "labels"
 * said bare reads two parts and writes neither. Every line offered is run.
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
  cwd = makeLinkedFixture('astryx-theme-how-said-looks-way-', FIXTURE_PACKAGES);
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

/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');
/** @param {string} c */
const lum = c => {
  const h = c.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return (r + g + b) / 3;
};

describe('a look said as a word', () => {
  it('a dark gradient navbar is dark, with readable text', async () => {
    const lines = writes(await how('q0', 'dark gradient navbar'));
    const grad = lines.find(l => /linear-gradient/.test(l)) ?? '';
    const stops = grad.match(/#[0-9a-f]{6}/gi) ?? [];
    expect(stops.length).toBe(2);
    for (const s of stops) expect(lum(s)).toBeLessThan(80);
    expect(lines.some(l => /^set q0 color '#[0-9a-f]{6}' --on /i.test(l))).toBe(
      true,
    );
    await follow(lines);
  }, 240_000);

  it('small labels on form fields are smaller', async () => {
    const lines = writes(await how('q0', 'small labels on form fields'));
    const m = /font-size ([\d.]+)rem --on field-label/.exec(lines.join(' '));
    expect(Number(m?.[1])).toBeLessThan(0.875);
  }, 240_000);

  it('"labels" said bare offers both readings and writes neither', async () => {
    const rs = await how('q0', 'uppercase small labels');
    expect(writes(rs)).toEqual([]);
    expect(texts(rs)).toMatch(
      /"labels" reads two parts: the form field labels \(field-label\), or badges/,
    );
    expect(writes(await how('q0', 'form labels bold'))[0]).toMatch(
      /--on field-label/,
    );
  }, 240_000);
});
