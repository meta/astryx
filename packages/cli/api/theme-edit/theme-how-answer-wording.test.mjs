// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What `how` says matches what it writes: the words it repeats keep
 * the ask's own words, a color said as how something looks now is never
 * the value, a color said against the one it replaces is one ask, two parts
 * listed with a word describing the second share the ask, a near color off
 * a pure one takes the theme's neutral, and a one-line look keeps its page,
 * text and font.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {pluralOf} from './_normal.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-wording-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const how = async ask => {
  const r = JSON.parse(
    (await runCli([...ED, 'how', ask, '--theme', 't', '--json'], cwd)).stdout,
  );
  /** @type {Array<{text: string, commands?: string[]}>} */
  const results = r.data?.results ?? [];
  return {
    texts: results.map(x => x.text),
    commands: results
      .flatMap(x => x.commands ?? [])
      .map(c => c.replace(/^.*? editor /, '')),
    hint: String(r.data?.hint ?? ''),
  };
};

describe('the words an answer repeats', () => {
  it(
    'keep no bare "when" once the state is read, and plurals are words',
    async () => {
      const a = await how('switches: track #e5e7eb when off');
      expect(a.texts[0]).toMatch(
        /^switches: track #e5e7eb, except switch when checked/,
      );
      const b = await how('the switch track should be #e5e7eb when it is off');
      expect(b.texts[0]).not.toMatch(/\bwhen it,|\bwhen,/);
      const c = await how('checkboxes: background #f6f8fa when unchecked');
      expect(c.texts[0]).not.toMatch(/#f6f8fa when,/);
    },
    T,
  );

  it(
    'a keep said first ends at a whole verb, never inside "background"',
    async () => {
      const a = await how(
        'keep the switches and the background #f6f8fa when disabled',
      );
      expect(a.texts.join(' ')).not.toMatch(/read "round/);
      expect(a.commands.join(' ')).toMatch(/#f6f8fa/);
    },
    T,
  );

  it('a part name takes its English plural', () => {
    expect(pluralOf('switch')).toBe('switches');
    expect(pluralOf('box')).toBe('boxes');
    expect(pluralOf('body')).toBe('bodies');
    expect(pluralOf('card')).toBe('cards');
  });
});

describe('a color said as how something looks now', () => {
  it(
    '"too bright blue" is the color moved away from, never the value',
    async () => {
      const a = await how(
        'the info banner background is too bright blue, I want it muted',
      );
      expect(a.commands.join(' ')).not.toMatch(/#2563eb/);
    },
    T,
  );

  it(
    '"is still gray in dark mode" writes no gray: the part is looked up',
    async () => {
      const a = await how(
        'the main content area background is still gray in dark mode',
      );
      expect(a.commands.join(' ')).not.toMatch(/#9e9e9e/);
      expect(a.commands).toContain('how layout-content');
    },
    T,
  );
});

describe('a color said against the one it replaces', () => {
  it(
    '"navy, not bright blue" is navy, with no line about blue',
    async () => {
      const a = await how(
        'info banner and draft badge should be navy, not bright blue',
      );
      const all = a.texts.join(' ');
      expect(all).not.toMatch(/is #2563eb in any mode/);
      // Both parts listed take the ask, the second with its describing word.
      expect(a.commands.join(' ')).toMatch(/'#1e3a8a' --on banner/);
      expect(a.commands.join(' ')).toMatch(/'#1e3a8a' --on badge/);
      // The info color for the whole theme is offered.
      expect(a.commands.join(' ')).toMatch(/ info '#1e3a8a'/);
    },
    T,
  );
});

describe('a near color off a pure one', () => {
  it(
    "is tinted with the theme's neutral",
    async () => {
      await runCli([...ED, 'set', 't', 'neutral', '#7c6a9a'], cwd);
      const a = await how('never use pure white for text, it glares at night');
      await runCli([...ED, 'undo', 't', 'neutral'], cwd);
      const line = a.commands.find(c => /--color-text-primary/.test(c)) ?? '';
      const hex = /'#([0-9a-f]{6})'/.exec(line)?.[1] ?? '';
      expect(hex).not.toBe('');
      const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
      // Off white, and leaning to the purple: blue over green.
      expect(Math.min(r, g, b)).toBeLessThan(250);
      expect(b).toBeGreaterThan(g);
    },
    T,
  );
});

describe('a one-line look', () => {
  it(
    'keeps its page, text color and font, with no "nothing is written" note',
    async () => {
      const a = await how(
        'terminal hacker look: green #33ff33 text on black, monospace font everywhere, dark only',
      );
      const cmds = a.commands.join(' ');
      expect(cmds).toMatch(/--color-background-body '#000000'/);
      expect(cmds).toMatch(/--color-text-primary '#33ff33'/);
      expect(cmds).toMatch(/font mono/);
      expect(cmds).toMatch(/mode dark-only/);
      expect(a.texts.join(' ')).not.toMatch(/so nothing is written/);
    },
    T,
  );

  it(
    '"text on black" reads the color under the text as the page, and a font stack stays one value',
    async () => {
      const a = await how('green text on black');
      expect(a.commands.join(' ')).toMatch(/--color-background-body '#000000'/);
      const b = await how('font Georgia, serif');
      expect(b.commands).toContain('set t font georgia');
    },
    T,
  );
});
