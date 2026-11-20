// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTiming.interaction.browser.spec.ts
 * @input themeTiming.ts and the press release clock, bundled with esbuild
 *   onto a blank fixture page; Chromium and WebKit on the phone profile
 * @output Proof that readThemeTiming resolves a motion's timing as the
 *   browser resolves a transition. A hand-written `calc()` token, a nested
 *   theme scope and a tempo-scaled value give one length in both of its
 *   patterns. In one, the element's own transition carries the token. In the
 *   other, the token is read where the element is. That length is the
 *   element's computed transition. A `calc()` value resolves the same way
 *   for the press release clock and for a caller that needs the values. An
 *   easing that is not a cubic Bézier, `linear()` or `steps()`, plays as the
 *   browser plays it in both patterns. With no stylesheet, `--duration-exit`
 *   reads its declared default where the element is
 * @position Browser proof for themeTiming.ts, run by `pnpm test:interaction`;
 *   jsdom resolves no `calc()`
 */

import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {build} from 'esbuild';
import type * as ThemeTimingModule from './themeTimingBundle';
import {stylexDeclarations} from './stylexDeclarationsPlugin';

let script = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('./themeTimingBundle.ts', import.meta.url)),
    ],
    plugins: [stylexDeclarations],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'ThemeTiming',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
});

// A real navigation (not setContent): the page keeps its own window.
async function open(page: Page) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --duration-fast: 175ms; --ease-standard: cubic-bezier(0.24, 1, 0.4, 1); }
  .carrier {
    transition-property: color;
    transition-duration: var(--duration-fast);
    transition-timing-function: var(--ease-standard);
  }
</style>
<div id="theme">
  <div class="carrier" id="own"></div><div id="plain"></div>
  <div id="nested"><div class="carrier" id="own-nested"></div><div id="plain-nested"></div></div>
</div>
<script>${script}</script>`;
  await page.route('http://theme-timing.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://theme-timing.test/');
}

interface Reading {
  /** The carrier's computed transition-duration, in ms. */
  computed: number;
  /** readThemeTiming on the carrier's own transition, in ms. */
  own: number | null;
  /** readThemeTiming on the tokens, read on a plain sibling, in ms. */
  tokens: number | null;
  /** Both curves at a quarter and three quarters of their length. */
  ownAt: number[];
  tokensAt: number[];
}

/**
 * Sets the custom properties on the scopes and reads both patterns in the
 * outer scope and in the nested one.
 */
async function readBoth(
  page: Page,
  scopes: Record<string, Record<string, string>>,
): Promise<{outer: Reading; nested: Reading; probesLeft: number}> {
  return page.evaluate(scopes => {
    const byId = (id: string) => {
      const found = document.getElementById(id);
      if (found == null) {
        throw new Error(`the fixture has no #${id}`);
      }
      return found;
    };
    for (const [id, properties] of Object.entries(scopes)) {
      for (const [name, value] of Object.entries(properties)) {
        byId(id).style.setProperty(name, value);
      }
    }
    const {readThemeTiming} = (
      window as unknown as {ThemeTiming: typeof ThemeTimingModule}
    ).ThemeTiming;
    const ms = (seconds: number | undefined) =>
      seconds == null ? null : Math.round(seconds * 1e6) / 1e3;
    const samples = (curve: ReturnType<typeof readThemeTiming>) =>
      curve == null
        ? []
        : [0.25, 0.75].map(share => curve.at(share * curve.duration));
    const read = (ownId: string, plainId: string) => {
      const carrier = byId(ownId);
      const own = readThemeTiming(carrier);
      const tokens = readThemeTiming(byId(plainId), {
        duration: '--duration-fast',
        easing: '--ease-standard',
      });
      return {
        computed:
          Math.round(
            parseFloat(getComputedStyle(carrier).transitionDuration) * 1e6,
          ) / 1e3,
        own: ms(own?.duration),
        tokens: ms(tokens?.duration),
        ownAt: samples(own),
        tokensAt: samples(tokens),
      };
    };
    return {
      outer: read('own', 'plain'),
      nested: read('own-nested', 'plain-nested'),
      probesLeft: document.querySelectorAll('span').length,
    };
  }, scopes);
}

test('a hand-written calc() token times the motion as the transition resolves it, in both patterns', async ({
  page,
}) => {
  await open(page);
  const {outer, nested, probesLeft} = await readBoth(page, {
    theme: {'--duration-fast': 'calc(0.1s * 2)'},
  });
  for (const reading of [outer, nested]) {
    expect(reading.computed).toBe(200);
    expect(reading.own).toBe(200);
    expect(reading.tokens).toBe(200);
  }
  expect(probesLeft).toBe(0);
});

test('a nested theme scope and a tempo-scaled value resolve where the element is', async ({
  page,
}) => {
  await open(page);
  const {outer, nested} = await readBoth(page, {
    nested: {'--duration-fast': 'calc(175ms * 1.2)'},
  });
  expect([outer.computed, outer.own, outer.tokens]).toEqual([175, 175, 175]);
  expect([nested.computed, nested.own, nested.tokens]).toEqual([210, 210, 210]);
});

test('both patterns play the same easing, a calc() argument included', async ({
  page,
}) => {
  await open(page);
  const {outer} = await readBoth(page, {
    theme: {'--ease-standard': 'cubic-bezier(calc(0.25 * 2), 0, 0.5, 1)'},
  });
  expect(outer.ownAt).toHaveLength(2);
  expect(outer.tokensAt).toEqual(outer.ownAt);
});

test('an easing that is not a cubic Bézier plays as the browser plays it, in both patterns', async ({
  page,
}) => {
  await open(page);
  // The eased progress at a quarter and three quarters of the length.
  for (const [easing, expected] of [
    ['linear(0, 0.8 50%, 1)', [0.4, 0.9]],
    ['steps(3, jump-end)', [0, 2 / 3]],
  ] as const) {
    const {outer, nested} = await readBoth(page, {
      theme: {'--ease-standard': easing},
    });
    for (const at of [
      outer.ownAt,
      outer.tokensAt,
      nested.ownAt,
      nested.tokensAt,
    ]) {
      expect(at, easing).toHaveLength(2);
      at.forEach((value, i) =>
        expect(value, easing).toBeCloseTo(expected[i], 6),
      );
    }
  }
});

test('a duration that is not a positive length gives no curve in either pattern', async ({
  page,
}) => {
  await open(page);
  for (const value of ['0s', 'fast']) {
    const {outer} = await readBoth(page, {theme: {'--duration-fast': value}});
    expect([outer.own, outer.tokens]).toEqual([null, null]);
  }
});

/** The page's bundle. */
type Bundle = typeof ThemeTimingModule;

test('a calc() --duration-exit times the press release clock as its release animation resolves it', async ({
  page,
}) => {
  await open(page);
  const read = await page.evaluate(() => {
    const {pressFadeMs, readThemeTokens} = (
      window as unknown as {ThemeTiming: Bundle}
    ).ThemeTiming;
    const plain = document.querySelector<HTMLElement>('#plain');
    if (plain == null) {
      throw new Error('the fixture has no #plain');
    }
    plain.style.setProperty('--duration-exit', 'calc(0.1s * 2)');
    return {
      clock: pressFadeMs(plain),
      token: readThemeTokens(plain, {duration: '--duration-exit'}).ms,
    };
  });
  expect(read).toEqual({clock: 200, token: 200});
});

test('resolveTiming resolves calc() values for a caller that needs them', async ({
  page,
}) => {
  await open(page);
  const resolved = await page.evaluate(() => {
    const {resolveTiming} = (window as unknown as {ThemeTiming: Bundle})
      .ThemeTiming;
    return resolveTiming(document.body, {
      duration: 'calc(0.15s * 2)',
      easing: 'cubic-bezier(calc(0.25 * 2), 0, 0.5, 1)',
    });
  });
  expect(resolved).toEqual({ms: 300, points: [0.5, 0, 0.5, 1]});
});

test('with no stylesheet, --duration-exit reads its declared default where the element is', async ({
  page,
}) => {
  await open(page);
  const read = await page.evaluate(() => {
    const {readThemeTiming, readThemeTokens} = (
      window as unknown as {ThemeTiming: Bundle}
    ).ThemeTiming;
    document.querySelector('style')?.remove();
    const plain = document.querySelector<HTMLElement>('#plain');
    if (plain == null) {
      throw new Error('the fixture has no #plain');
    }
    const unset = readThemeTiming(plain, {
      duration: '--duration-exit',
      easing: '--ease-exit',
    });
    plain.style.setProperty('--duration-fast', '250ms');
    return {
      unsetMs: unset == null ? null : Math.round(unset.duration * 1000),
      fastMs: readThemeTokens(plain, {duration: '--duration-exit'}).ms,
    };
  });
  expect(read).toEqual({unsetMs: 175, fastMs: 250});
});
