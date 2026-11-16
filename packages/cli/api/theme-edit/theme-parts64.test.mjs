// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A kept state where another of the part's own states was changed keeps
 * only where both hold; a long answer is cut only between whole asks, the
 * rest given as the next sequences; a tab's underline removed is its
 * indicator's fill; an input's focus ring is its box-shadow ring, and a
 * resting shadow on inputs keeps each render's own focus look; a part's
 * piece Core has no part for is named, never the whole part. Against real
 * bundled base themes; the browser case renders Core's inputs with Core's
 * built stylesheet in the Chromium the repository pins.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const require = createRequire(import.meta.url);

// The browser case runs only in the step that installs the pinned Chromium.
const BROWSER_STEP = process.env.ASTRYX_THEME_EDITOR_BROWSER === '1';

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-parts64-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** The first answer's commands, bare. @param {string} q @param {string} theme */
const top = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    text: (data.results ?? []).map(x => x.text).join('\n'),
    commands: (r?.commands ?? []).map(c => c.replace(/^.*? editor /, '')),
  };
};

/** Every answer's commands, bare. @param {string} q @param {string} theme */
const all = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return (data.results ?? []).map(x => ({
    text: x.text,
    commands: x.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

describe('a kept state', () => {
  it('keeps a checked, disabled box as Core draws it, and leaves an unchecked one alone', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    const r = await top(
      'make the checkbox green when checked but not when disabled',
      'c',
    );
    expect(r.commands).toContain(
      "set c background-color 'var(--color-accent)' --on checkbox-indicator --when checked:checked --state disabled --only",
    );
    // Never the unchecked resting fill under disabled alone.
    expect(
      r.commands.some(x =>
        /--color-background-surface.*--state disabled --only$/.test(x),
      ),
    ).toBe(false);
  }, 240_000);
});

describe('a long answer', () => {
  it('is cut only between whole asks, the rest as the next sequence', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const r = await all(
      'make the input border red in light mode and pink in dark mode',
      's',
    );
    const seqs = r.filter(x => /changes, in order/.test(x.text));
    expect(seqs).toHaveLength(2);
    // The light ask and every one of its status keeps in the first; the
    // dark one and its keeps in the second.
    expect(seqs[0].commands.every(x => /--mode light$/.test(x))).toBe(true);
    expect(seqs[1].commands.every(x => /--mode dark$/.test(x))).toBe(true);
    expect(
      seqs[1].commands.filter(x => /--when status:(warning|success)/.test(x)),
    ).toHaveLength(4);
  }, 240_000);
});

describe("a tab's underline", () => {
  it('removed is its indicator made transparent where it paints', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('u', {cwd, like: 'neutral'});
    for (const q of [
      'remove the underline from tabs',
      'make the tabs underline-less',
    ])
      expect((await top(q, 'u')).commands, q).toEqual([
        'set u background-color transparent --on tab-indicator --state selected',
      ]);
  }, 240_000);
});

describe("an input's focus ring", () => {
  it('is its box-shadow ring for a color, a width or a removal, and status fields keep none', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    const dark = await top(
      'make the focus ring on inputs red in dark mode',
      'f',
    );
    expect(dark.commands).toEqual([
      "set f box-shadow 'inset 0 0 0 2px light-dark(var(--color-accent-muted), #dc2626)' --on inputs --state focus-within",
      'set f box-shadow none --on inputs --when status:error --state focus-within',
      'set f box-shadow none --on inputs --when status:warning --state focus-within',
      'set f box-shadow none --on inputs --when status:success --state focus-within',
    ]);
    expect(
      (await top('make the input focus ring thicker', 'f')).commands[0],
    ).toBe(
      "set f box-shadow 'inset 0 0 0 3px var(--color-accent-muted)' --on inputs --state focus-within",
    );
    expect((await top('remove the input focus ring', 'f')).commands).toEqual([
      'set f box-shadow none --on inputs --state focus-within',
    ]);
  }, 240_000);
});

describe('a resting shadow on inputs', () => {
  it('keeps every status selector at none while focused, and composes a status-scoped write for that status only', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    await themeEditSet('n', 'box-shadow', 'none', {cwd, on: 'inputs'});
    expect(cssOf('n')).toMatch(
      /\.astryx-selector\[data-size="md"\]\[data-status="error"\]\[data-variant="input"\]:focus-within \{\s*box-shadow: none;/,
    );
    await themeEditNew('e', {cwd, like: 'neutral'});
    await themeEditSet('e', 'box-shadow', '0 2px 6px #0000004d', {
      cwd,
      on: 'inputs',
      when: 'status:error',
    });
    const css = cssOf('e');
    expect(css).toMatch(
      /\.astryx-text-input\[data-status="error"\]:focus-within \{\s*box-shadow: 0 2px 6px #0000004d;/,
    );
    // The plain field is not written at all.
    expect(css).not.toMatch(/\.astryx-text-input:focus-within/);
  }, 240_000);

  it.runIf(BROWSER_STEP)(
    'draws, while focused, the ring a plain field shows and none on status fields, in every case',
    async () => {
      if (unbuilt)
        throw new Error(`the base themes could not be built: ${unbuilt}`);
      const React = require('react');
      const {renderToStaticMarkup} = require('react-dom/server');
      const {Selector, TextInput} = await import('@astryxdesign/core');
      const {Theme, defineTheme} = await import('@astryxdesign/core/theme');
      const {chromium} = require('playwright');
      const coreCss = fs.readFileSync(
        require.resolve('@astryxdesign/core/astryx.css'),
        'utf8',
      );
      const resetCss = fs.readFileSync(
        require.resolve('@astryxdesign/core/reset.css'),
        'utf8',
      );
      await themeEditNew('b0', {cwd, like: 'neutral'});
      await themeEditNew('b1', {cwd, like: 'neutral'});
      await themeEditSet('b1', 'box-shadow', 'none', {cwd, on: 'inputs'});
      await themeEditNew('b2', {cwd, like: 'neutral'});
      await themeEditSet('b2', 'box-shadow', 'none', {
        cwd,
        on: 'inputs',
        when: 'status:error',
      });
      await themeEditNew('b3', {cwd, like: 'neutral'});
      for (const cmd of (
        await top('make the focus ring on inputs red in dark mode', 'b3')
      ).commands) {
        const m =
          /^set b3 box-shadow (?:'([^']*)'|(none)) --on inputs(?: --when (\S+))? --state focus-within$/.exec(
            cmd,
          );
        if (!m) throw new Error(`unexpected step: ${cmd}`);
        await themeEditSet('b3', 'box-shadow', m[1] ?? m[2], {
          cwd,
          on: 'inputs',
          state: 'focus-within',
          ...(m[3] ? {when: m[3]} : {}),
        });
      }
      const layered = (/** @type {string} */ slug) => {
        const built = cssOf(slug);
        return built.includes('@layer astryx-theme')
          ? built
          : `@layer astryx-theme {\n${built}\n}`;
      };
      const h = React.createElement;
      const error = {type: 'error', message: 'Required'};
      const markup = (/** @type {string} */ name, /** @type {string} */ mode) =>
        renderToStaticMarkup(
          h(
            Theme,
            {theme: defineTheme({name}), mode},
            h(
              'div',
              {'data-probe': 'plain'},
              h(TextInput, {label: 'Name', value: '', onChange() {}}),
            ),
            h(
              'div',
              {'data-probe': 'error'},
              h(TextInput, {
                label: 'Email',
                value: '',
                onChange() {},
                status: error,
              }),
            ),
            h(
              'div',
              {'data-probe': 'select'},
              h(Selector, {
                label: 'Size',
                options: [{value: 'a', label: 'A'}],
                value: 'a',
                onChange() {},
                status: error,
              }),
            ),
          ),
        );
      const browser = await chromium.launch({args: ['--no-sandbox']});
      try {
        const page = await browser.newPage();
        /** The box-shadow of each probe's field while it holds focus. */
        const focused = async (
          /** @type {string} */ name,
          /** @type {string} */ mode,
        ) => {
          await page.setContent(
            // (No transitions: a ring is read where it ends, not midway.)
            `<!doctype html><html><head><style>${resetCss}\n${coreCss}\n${layered(name)}\n*{transition:none!important}</style></head><body>${markup(name, mode)}</body></html>`,
          );
          /** @type {Record<string, string>} */
          const out = {};
          for (const [probe, box] of [
            ['plain', '.astryx-text-input'],
            ['error', '.astryx-text-input'],
            ['select', '.astryx-selector'],
          ]) {
            await page.focus(
              `[data-probe=${probe}] input, [data-probe=${probe}] button, [data-probe=${probe}] [tabindex="0"]`,
            );
            out[probe] = await page.$eval(
              `[data-probe=${probe}] ${box}`,
              el =>
                /** @type {any} */ (
                  el.ownerDocument.defaultView
                ).getComputedStyle(el).boxShadow,
            );
          }
          return out;
        };
        for (const mode of ['light', 'dark']) {
          const core = await focused('b0', mode);
          expect(core.error, mode).toBe('none');
          expect(core.select, mode).toBe('none');
          // No shadow: the plain ring stays, status fields keep none.
          expect(await focused('b1', mode), mode).toEqual(core);
          // No shadow on error fields: they stay none while focused.
          expect(await focused('b2', mode), mode).toEqual(core);
        }
        // The dark-mode ring: light is as Core draws it, every field.
        expect(await focused('b3', 'light')).toEqual(
          await focused('b0', 'light'),
        );
        const dark = await focused('b3', 'dark');
        expect(dark.plain).toMatch(/rgb\(220, 38, 38\)/);
        expect(dark.error).toBe('none');
        expect(dark.select).toBe('none');
      } finally {
        await browser.close();
      }
    },
    240_000,
  );
});

describe("a part's piece Core has no part for", () => {
  it("is named, never the whole part; a title drawn as the part's own text is the part, said so", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    for (const q of [
      'make the empty state icon bigger',
      'make the popover arrow red',
    ]) {
      const {data} = await themeEditHow(q, {cwd, theme: 'p'});
      const writes = (data.results ?? []).flatMap(x =>
        x.commands.filter(c => / editor set /.test(c)),
      );
      expect(writes, q).toEqual([]);
      expect(JSON.stringify(data), q).toMatch(
        /Core has no [a-z ]+ part of its own/,
      );
    }
    const alert = await top('make the alert title larger', 'p');
    expect(alert.commands).toEqual([
      expect.stringMatching(/^set p --text-label-size [\d.]+rem --on banner$/),
    ]);
    expect(alert.text).toMatch(
      // (Named by Core's part: an alert is the banner.)
      /Core has no banner title part of its own, so this is for the whole banner/,
    );
  }, 240_000);
});

describe("a toast's text token refused in one mode", () => {
  it('keeps the mode on the line it offers', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('t', '--color-text-primary', 'red', {
        cwd,
        on: 'toast',
        mode: 'dark',
      }),
    );
    expect(r.run.map(x => x.replace(/^.*? editor /, ''))).toEqual([
      'set t color red --on toast --mode dark',
    ]);
  }, 240_000);
});
