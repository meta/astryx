// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page color said for a mode is measured against the theme's text
 * in that mode: a text token that would not read there takes a color that
 * does, in its own line, and every line offered is run. "instead of its
 * current color" names the value being replaced, never a "no" of its own,
 * so "light mode only" stays light.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
    'astryx-theme-how-page-text-reads-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('q0', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const how = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'q0'})
  );
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands
      .map(c => c.replace(/^.*? editor /, ''))
      .filter(c => /^set /.test(c)),
  }));
};

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

describe('page text reads', () => {
  it('a dark page the secondary text would not read on gets a readable secondary text line', async () => {
    // (An exact color is the page as typed; a color word for a mode's page
    // takes the page's own lightness there, so it reads.)
    const rs = await how('cream/beige background, dark mode page #92400e');
    const readable = rs.find(r => /^readable text on that page/.test(r.text));
    expect(readable?.text).toMatch(/--color-text-secondary .*#92400e/);
    expect(readable?.commands).toEqual([
      expect.stringMatching(
        /^set q0 --color-text-secondary '#[0-9a-f]{6}' --mode dark$/,
      ),
    ]);
    await follow(readable?.commands ?? []);
    // (The answer that runs the whole ask carries the line too.)
    expect(rs[0]?.commands).toContain(readable?.commands[0]);
  }, 240_000);

  it('a white page in dark mode takes dark text there', async () => {
    const rs = await how('page background #ffffff in dark mode');
    const readable = rs.find(r => /^readable text on that page/.test(r.text));
    // (A page color alone leaves the code block's own background, and its
    // title's color, as they are.)
    expect(readable?.commands.join('\n')).not.toMatch(/--color-syntax-/);
    expect(readable?.commands).toContain(
      "set q0 --color-text-primary '#000000' --mode dark",
    );
  }, 240_000);

  it('a text color typed for the mode beside the page is kept, never overwritten', async () => {
    for (const [ask, typed] of [
      [
        'page background #ffffff in dark mode, text #111111 in dark mode',
        '#111111',
      ],
      ['in dark mode, page #f5f5f5 and text #1a1a1a', '#1a1a1a'],
    ]) {
      const lines = (await how(ask)).flatMap(r => r.commands).join('\n');
      expect(lines).toContain(typed);
      expect(lines).not.toMatch(/--color-text-primary '#000000'/);
    }
  }, 240_000);

  it('a page that keeps the theme text readable gets no text line', async () => {
    const rs = await how('dark mode page #1e1e2e');
    expect(rs.some(r => /^readable text on that page/.test(r.text))).toBe(
      false,
    );
  }, 240_000);

  it('"light mode only … instead of its current color" writes the light page', async () => {
    const rs = await how(
      'Light mode only: the page background pure white instead of its current color. Keep the rest of our theme exactly as it is.',
    );
    const lines = rs[0]?.commands ?? [];
    expect(lines).toContain(
      "set q0 --color-background-body '#ffffff' --mode light",
    );
    expect(lines.some(c => /--mode dark/.test(c))).toBe(false);
  }, 240_000);
});
