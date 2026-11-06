// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTempo.interaction.browser.spec.ts
 * @input The motion source (animator, springs) bundled with esbuild onto a
 *   blank page, and the built Storybook's `Core/Theme motion tempo` story;
 *   Chromium and WebKit on the phone profile
 * @output Proof that the springs follow the tempo of the theme they play
 *   in. A spring the animator plays inside a scope at tempo 1.5 is
 *   inherited through a nested element. At 1.5 × t it draws what the same
 *   spring draws at t outside the scope. A page that imports only the
 *   springs and the engine, and never registers them, plays at its tempo
 *   too. Finger tracking draws the same in both. Under three real themes that set only `motion.tempo`, the
 *   animated-layout glide lasts 0.75, 1 and 1.5 times as long, with a
 *   finger or a mouse. A theme with only a duration scale, nested in one at
 *   tempo 1.5, glides on its own duration token
 * @position Browser proof for themeTempo.ts and resolveMotion.ts, run by
 *   `pnpm test:interaction`; the unit proofs are resolveMotion.test.ts
 */

import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {build} from 'esbuild';
import {expandMotionScale} from '../../theme/expandMotionScale';
import type * as MotionBundle from './motionBundle';

declare const Motion: typeof MotionBundle;

let script = '';
let storybook: StaticServer | undefined;

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./motionBundle.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'Motion',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

const TRAVEL = 300;

// A real navigation (not setContent): the page keeps its own window. Each
// scope writes the private property a theme that sets `tempo` writes.
async function openScopes(page: Page, {register = true} = {}) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; background: #fff; }
  .box { position: relative; width: 48px; height: 48px; margin: 8px 0; background: #36c; }
  .slow { --_astryx-motion-tempo: 1.5; }
  .quick { --_astryx-motion-tempo: 0.75; }
</style>
<div class="box" id="base"></div>
<div class="slow"><section><div class="box" id="slowed"></div></section></div>
<div class="quick"><section><div class="box" id="quick"></div></section></div>
<script>${script}</script>
${register ? '<script>Motion.registerSpringsTable();</script>' : ''}`;
  await page.route('http://tempo.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://tempo.test/');
}

/**
 * Plays `role` on the base box and the `scaled` one. Reads each one's travel,
 * paused at each of `times` (ms), the scaled box at its time times `scale`.
 */
async function travels(
  page: Page,
  role: 'settle' | 'fingerTracking',
  times: number[],
  scale: number,
  scaled: 'slowed' | 'quick' = 'slowed',
): Promise<{base: number; slowed: number}[]> {
  return page.evaluate(
    async ({role, times, scale, travel, scaled}) => {
      const boxes = ['base', scaled].map(
        id => document.getElementById(id) as HTMLElement,
      );
      const handles = boxes.map(box =>
        Motion.createMotionEngine(box).animate(
          {x: travel},
          {spring: Motion.springs[role]},
        ),
      );
      // From rest, the animations start in the frame after the call.
      await Promise.all(handles.map(async handle => handle.started));
      const [base, slowed] = boxes.map(box => {
        const [animation] = box.getAnimations();
        animation.pause();
        return animation;
      });
      const xOf = (box: HTMLElement) =>
        Number.parseFloat(getComputedStyle(box).translate || '0');
      return times.map(t => {
        base.currentTime = t;
        slowed.currentTime = t * scale;
        return {base: xOf(boxes[0]), slowed: xOf(boxes[1])};
      });
    },
    {role, times, scale, travel: TRAVEL, scaled},
  );
}

test.describe('the springs follow the theme tempo (spec:AST-108 FR3)', () => {
  test('a spring inside a tempo 1.5 scope draws at 1.5 × t what it draws at t outside it', async ({
    page,
  }) => {
    await openScopes(page);
    const read = await travels(page, 'settle', [40, 120, 240, 400], 1.5);
    // The boxes are on screen and moving, so the comparison is not vacuous.
    expect(read[0].base).toBeGreaterThan(5);
    expect(read[0].base).toBeLessThan(TRAVEL - 5);
    for (const {base, slowed} of read) {
      expect(Math.abs(slowed - base)).toBeLessThan(1.5);
    }
  });

  test('a page that imports only the springs and the engine, with no register call, plays settle at 0.75 and 1.5 × t', async ({
    page,
  }) => {
    // A page whose only motion is one spring role, as a Lightbox is.
    for (const [scaled, scale] of [
      ['slowed', 1.5],
      ['quick', 0.75],
    ] as const) {
      await openScopes(page, {register: false});
      const read = await travels(page, 'settle', [40, 120, 240], scale, scaled);
      expect(read[0].base).toBeGreaterThan(5);
      expect(read[0].base).toBeLessThan(TRAVEL - 5);
      for (const {base, slowed} of read) {
        expect(Math.abs(slowed - base), scaled).toBeLessThan(1.5);
      }
    }
  });

  test('finger tracking plays as measured inside the scope (FR4)', async ({
    page,
  }) => {
    await openScopes(page);
    const read = await travels(page, 'fingerTracking', [20, 60, 120], 1);
    expect(read[0].base).toBeGreaterThan(5);
    for (const {base, slowed} of read) {
      expect(Math.abs(slowed - base)).toBeLessThan(1.5);
    }
  });
});

const STORY = 'core-theme-motion-tempo--three-tempos';
const NESTED_STORY = 'core-theme-motion-tempo--nested-duration-scale';

async function openStory(page: Page, story: string, rowCount: number) {
  await page.goto(
    `${storybook?.origin ?? ''}/iframe.html?id=${story}&viewMode=story`,
  );
  const rows = page.locator('section[data-tempo], section[data-row]');
  await expect(rows).toHaveCount(rowCount);
  // Every row is on screen, so no ratio below compares empty rows.
  for (const height of await rows.evaluateAll(sections =>
    sections.map(section => section.getBoundingClientRect().height),
  )) {
    expect(height).toBeGreaterThan(0);
  }
}

/** The glide's length for the content after the Collapsible in `row`. */
async function glideMs(page: Page, row: string): Promise<number> {
  const section = page.locator(row);
  await section.getByRole('button', {name: 'Shipping details'}).click();
  const after = section.locator('[data-after-collapsible]');
  await expect
    .poll(async () => after.evaluate(element => element.getAnimations().length))
    .toBeGreaterThan(0);
  return after.evaluate(element => {
    const glide = element
      .getAnimations()
      .find(animation =>
        (animation.effect as KeyframeEffect)
          .getKeyframes()
          .some(frame => typeof frame.translate === 'string'),
      );
    return Number(glide?.effect?.getTiming().duration);
  });
}

/** The glide's length in each tempo row, against the tempo 1 row. */
async function tempoRatios(page: Page) {
  const atOne = await glideMs(page, 'section[data-tempo="1"]');
  expect(atOne).toBeGreaterThan(300);
  return {
    quick: (await glideMs(page, 'section[data-tempo="0.75"]')) / atOne,
    slow: (await glideMs(page, 'section[data-tempo="1.5"]')) / atOne,
  };
}

test('the glide under three themes lasts 0.75, 1 and 1.5 times as long', async ({
  page,
}) => {
  await openStory(page, STORY, 3);
  const {quick, slow} = await tempoRatios(page);
  expect(quick).toBeCloseTo(0.75, 2);
  expect(slow).toBeCloseTo(1.5, 2);
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('the glide under three themes lasts 0.75, 1 and 1.5 times as long', async ({
    page,
  }) => {
    await openStory(page, STORY, 3);
    // A fine pointer in this context, before anything is checked.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const {quick, slow} = await tempoRatios(page);
    expect(quick).toBeCloseTo(0.75, 2);
    expect(slow).toBeCloseTo(1.5, 2);
  });
});

test('a duration scale nested in a tempo theme glides on its own duration token', async ({
  page,
}) => {
  await openStory(page, NESTED_STORY, 3);
  // Each row's `--duration-medium`, in ms, as its theme writes it.
  const tokenMs = async (row: string) =>
    page.evaluate(
      selector =>
        Number.parseFloat(
          getComputedStyle(
            document.querySelector(selector) as Element,
          ).getPropertyValue('--duration-medium'),
        ),
      row,
    );
  // Each row glides on the `--duration-medium` of the theme it is in.
  for (const row of ['plain', 'outer', 'nested']) {
    const selector = `section[data-row="${row}"]`;
    expect(await glideMs(page, selector), row).toBeCloseTo(
      await tokenMs(selector),
      1,
    );
  }
  // The nested scale's own value: the outer tempo is not on it.
  const own = expandMotionScale({fast: 130, medium: 310, ratio: 0.75});
  expect(await tokenMs('section[data-row="nested"]')).toBe(
    Number.parseFloat(own['--duration-medium']),
  );
});
