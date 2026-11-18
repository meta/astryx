// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `set` takes a text look where the part's text actually reads it. A
 * color on a part that draws no text of its own (a top bar) goes into the
 * text color tokens the parts inside it read, so a dark top bar's labels
 * turn light and the result measures them that way. A link's color goes
 * into the token its color prop reads. A text size or weight on a part
 * whose text is drawn by elements that read one token for it goes into
 * that token. A text property an element inside the part sets by the
 * component's props is refused. A bare 0 inside calc() is saved as 0px. A refusal points at
 * the token that reaches the text, and a part name with a piece after it
 * points at the part that holds it. `how` keeps these asks to what they
 * say.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
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
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;
const css = () =>
  fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');

/**
 * The declarations of the compiled rules whose selector names a part's class.
 * @param {string} cls
 */
const declsOn = cls =>
  [...css().matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter(m => m[1].includes(cls))
    .map(m => m[2])
    .join('\n');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-set-text-reads-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const cli = async args =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

/** @param {string[]} args */
const set = args => cli([...ED, 'set', 't', ...args]);

/** @param {any} r */
const lines = r =>
  (r.suggestions ?? [])
    .map((/** @type {any} */ x) => String(x.name))
    .filter(x => / editor /.test(x))
    .map(x => x.replace(/^.*? editor /, ''));

/** Run an answer's line. @param {string} line */
const follow = async line =>
  cli([
    ...ED,
    .../** @type {string[]} */ (splitCommand(line.replace(/^.*? editor /, ''))),
  ]);

/** @param {string} q */
const answer = async q => (await themeEditHow(q, {cwd, theme: 't'})).data;

describe('a dark top bar', () => {
  it(
    'turns the labels inside it light, and measures them that way',
    async () => {
      fs.writeFileSync(file(), fresh);
      const data = await answer('dark gradient navbar');
      const steps = data.results[0].commands;
      expect(steps[0]).toMatch(
        /set t background 'linear-gradient\(#[0-9a-f]{6}, #[0-9a-f]{6}\)' --on app-shell-header/i,
      );
      /** @type {any} */
      let last = null;
      for (const line of steps) {
        last = await follow(line);
        expect(last.error).toBeUndefined();
      }
      const header = declsOn('.astryx-app-shell-header');
      expect(header).toMatch(/--color-text-primary: #ffffff/);
      expect(header).toMatch(/--color-text-secondary: #ffffff/);
      expect(JSON.stringify(last)).not.toMatch(
        /text in (top-nav-heading|top-nav-item|text) [^"]* is [\d.]+:1/,
      );
    },
    T,
  );

  it(
    'keeps a color on a part with text of its own as that color alone',
    async () => {
      fs.writeFileSync(file(), fresh);
      expect((await set(['color', '#123456', '--on', 'card'])).error).toBe(
        undefined,
      );
      expect(declsOn('.astryx-card')).not.toMatch(
        /--color-text-primary: #123456/,
      );
    },
    T,
  );
});

describe('a link color', () => {
  it(
    'goes into the token its color prop reads, on links alone',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await set(['color', '#0069d6', '--on', 'link']);
      expect(r.error).toBeUndefined();
      expect(declsOn('.astryx-link')).toMatch(/--color-text-accent: #0069d6/);
      expect(css()).not.toMatch(/:root[^{]*\{[^}]*--color-text-accent: #0069d6/);
    },
    T,
  );
});

describe('a text size or weight on a part that holds its text', () => {
  it(
    "goes into the one token that text reads: a banner's size, a code block's size, a top nav heading's weight",
    async () => {
      for (const [prop, value, on, cls, tok] of [
        ['font-size', '13px', 'banner', '.astryx-banner', '--text-label-size'],
        [
          'font-size',
          '12px',
          'code-block',
          '.astryx-code-block',
          '--text-code-size',
        ],
        [
          'font-weight',
          '200',
          'top-nav-heading',
          '.astryx-top-nav-heading',
          '--font-weight-semibold',
        ],
      ]) {
        fs.writeFileSync(file(), fresh);
        const r = await set([prop, value, '--on', on]);
        expect(r.error).toBeUndefined();
        expect(JSON.stringify(r)).toContain(
          `the value goes into ${tok} on ${on}`,
        );
        expect(declsOn(cls)).toContain(`${tok}: ${value}`);
      }
    },
    T,
  );

  it(
    'is refused with each token where the text reads several (a title and a subtitle)',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await set(['font-size', '20px', '--on', 'top-nav-heading']);
      expect(r.error).toMatch(/never reaches it/);
      expect(lines(r)).toEqual([
        "set t --text-large-size 20px --on top-nav-heading",
        "set t --text-supporting-size 20px --on top-nav-heading",
      ]);
    },
    T,
  );

  it(
    'that reads no token, holding parts that do, is offered their token on it',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await set(['--text-body-size', '13px', '--on', 'tab-list']);
      expect(r.error).toMatch(/the parts inside it read --text-label-size/);
      expect(lines(r)[0]).toBe("set t --text-label-size 13px --on tab-list");
      expect((await follow(lines(r)[0])).error).toBeUndefined();
    },
    T,
  );
});

describe('a bare 0 read inside calc()', () => {
  it(
    'is saved as 0px, and the result says so',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await set(['padding', '0', '--on', 'segmented-control']);
      expect(r.error).toBeUndefined();
      expect(JSON.stringify(r)).toMatch(/0 is saved as 0px/);
      expect(
        saved().find((/** @type {any} */ x) => x.on === 'segmented-control')
          ?.value,
      ).toBe('0px');
    },
    T,
  );
});

describe("a text property an element inside the part sets by the component's props", () => {
  it(
    'is refused, naming the values the props choose, and nothing is written',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await set(['white-space', 'pre-wrap', '--on', 'code-block']);
      expect(r.code).toBe('ERR_THEME_NO_EFFECT');
      expect(r.error).toMatch(/sets its own white-space \(pre or pre-wrap/);
      expect(fs.readFileSync(file(), 'utf8')).toBe(fresh);
    },
    T,
  );
});

describe('a part name with a piece after it', () => {
  it(
    'points at the part that holds it, with the tokens its text reads',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await set([
        'font-size',
        '20px',
        '--on',
        'top-nav-heading-title',
      ]);
      expect(r.error).toMatch(/drawn inside top-nav-heading/);
      expect(lines(r)).toEqual([
        "set t --text-large-size 20px --on top-nav-heading",
        "set t --text-supporting-size 20px --on top-nav-heading",
      ]);
    },
    T,
  );

  it(
    'a variant or a state after a part name is that part so, and any other rest is no piece of it',
    async () => {
      const primary = await set(['color', 'red', '--on', 'button-primary']);
      expect(primary.error).not.toMatch(/drawn inside/);
      expect(lines(primary)).toEqual([
        'set t color red --on button --when variant:primary',
      ]);
      const hover = await set(['color', 'red', '--on', 'link-hover']);
      expect(hover.error).not.toMatch(/drawn inside/);
      expect(lines(hover)).toEqual(['set t color red --on link --state hover']);
      // (A state a part takes is its state, even where the census lists it
      // with its values.)
      for (const [on, part, state] of [
        ['tab-selected', 'tab', 'selected'],
        ['switch-checked', 'switch', 'checked'],
      ])
        expect(lines(await set(['color', 'red', '--on', on])), on).toEqual([
          `set t color red --on ${part} --state ${state}`,
        ]);
      const panel = await set(['color', 'red', '--on', 'tab-panel']);
      expect(panel.error).not.toMatch(/drawn inside tab\b/);
      expect(lines(panel)).not.toContain('set t color red --on tab');
    },
    T,
  );
});

describe('a value of the wrong kind on a text part', () => {
  it(
    'is refused as no color, never as a color that would not show',
    async () => {
      const r = await set(['color', '12px', '--on', 'heading']);
      expect(r.error).toMatch(/takes a color; "12px" is not one/);
      expect(r.error).not.toMatch(/never shows/);
    },
    T,
  );
});

describe('a color for each side and a radius for each corner', () => {
  it(
    'are taken as typed',
    async () => {
      for (const args of [
        ['border-color', 'rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.25)', '--on', 'button', '--when', 'variant:primary'],
        ['border-color', '#eeeeee #eeeeee #dddddd', '--on', 'tab', '--state', 'hover'],
        ['border-color', '#dddddd #dddddd transparent', '--on', 'tab', '--state', 'selected'],
        ['border-radius', '0 0 6px 6px', '--on', 'menus'],
      ]) {
        fs.writeFileSync(file(), fresh);
        expect((await set(args)).error).toBeUndefined();
      }
    },
    T,
  );
});

describe('how keeps these asks to what they say', () => {
  it(
    'offers both readings of small uppercase labels, and never a zero border for a bordered strip',
    async () => {
      fs.writeFileSync(file(), fresh);
      const labels = JSON.stringify(await answer('uppercase small labels'));
      expect(labels).toMatch(/how badge/);
      expect(labels).toMatch(/how field-label/);
      const strip = JSON.stringify(
        await answer('pagination pages in one bordered strip'),
      );
      expect(strip).not.toMatch(/border-width 0/);
    },
    T,
  );
});
