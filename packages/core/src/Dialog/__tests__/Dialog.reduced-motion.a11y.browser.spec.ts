// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dialog.reduced-motion.a11y.browser.spec.ts
 * @input Built Dialog and AlertDialog stories in Chromium and WebKit, with
 *   reduced motion emulated and a coarse (touch) or fine (mouse) pointer
 * @output Browser evidence for docs/design/reduced-motion.md: on a touch
 *   screen the dialog's entrance is an opacity-only cross-fade of 200 ms or
 *   less (DR1, DR2); with a mouse it appears at once (DR3)
 * @position Cross-browser proof; jsdom computes no CSS animations.
 *
 * The checks are the record's Verification rows: the animations the browser
 * runs on the dialog as it opens, read when each starts (`animationstart`),
 * so a short cross-fade is caught however late the test looks.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

interface Case {
  story: string;
  opener: string;
  /** The dialog's role and name once open. */
  role: 'dialog' | 'alertdialog';
  name: string;
}

const cases: Case[] = [
  {
    story: 'core-dialog--default',
    opener: 'Open Modal',
    role: 'dialog',
    name: 'Modal Title',
  },
  {
    story: 'core-dialog--fullscreen',
    opener: 'Open Fullscreen Modal',
    role: 'dialog',
    name: 'Fullscreen Modal',
  },
  {
    story: 'core-alertdialog--delete',
    opener: 'Delete item',
    role: 'alertdialog',
    name: 'Delete item?',
  },
];

interface Entrance {
  /** Each animation the dialog ran as it opened, read when it started. */
  animations: {properties: string[]; durationMs: number; delayMs: number}[];
  /** The dialog's computed opacity at the first frame after it opened. */
  firstFrameOpacity: number;
}

/**
 * Opens the story's dialog and returns the animations the browser ran on it,
 * each read as it started, plus its opacity at the first frame after opening.
 */
async function openDialog(
  page: Page,
  {story, opener, role, name}: Case,
): Promise<Entrance> {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.getByRole('button', {name: opener}).waitFor();
  await page.evaluate(() => {
    const seen: Entrance['animations'] = [];
    (window as unknown as {__entrance: typeof seen}).__entrance = seen;
    document.addEventListener(
      'animationstart',
      event => {
        const target = event.target as Element;
        if (target.tagName !== 'DIALOG') {
          return;
        }
        for (const animation of target.getAnimations()) {
          const effect = animation.effect as KeyframeEffect;
          const timing = effect.getComputedTiming();
          const properties = new Set<string>();
          for (const keyframe of effect.getKeyframes()) {
            for (const key of Object.keys(keyframe)) {
              if (
                !['offset', 'computedOffset', 'easing', 'composite'].includes(
                  key,
                )
              ) {
                properties.add(key);
              }
            }
          }
          seen.push({
            properties: [...properties].sort(),
            durationMs: Number(timing.duration),
            delayMs: timing.delay ?? 0,
          });
        }
      },
      true,
    );
  });
  await page.getByRole('button', {name: opener}).click();
  const dialog = page.getByRole(role, {name});
  await expect(dialog).toBeVisible();
  const firstFrameOpacity = await dialog.evaluate(
    async element =>
      new Promise<number>(resolve => {
        requestAnimationFrame(() =>
          resolve(Number(getComputedStyle(element).opacity)),
        );
      }),
  );
  // Long enough for any entrance to have started and ended.
  await page.waitForTimeout(700);
  const animations = await page.evaluate(
    () =>
      (window as unknown as {__entrance: Entrance['animations']}).__entrance,
  );
  return {animations, firstFrameOpacity};
}

test.describe('with reduced motion on a touch screen (coarse pointer)', () => {
  test.use({hasTouch: true, isMobile: true});

  for (const dialogCase of cases) {
    test(`${dialogCase.story}: the dialog fades in where it lands, opacity only, in 200 ms or less (DR1, DR2)`, async ({
      page,
    }) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(true);
      const {animations} = await openDialog(page, dialogCase);
      // A cross-fade, not a change with no transition.
      expect(animations.length).toBeGreaterThan(0);
      for (const animation of animations) {
        expect(animation.properties).toEqual(['opacity']);
        expect(animation.delayMs + animation.durationMs).toBeLessThanOrEqual(
          200,
        );
      }
    });
  }
});

test.describe('with reduced motion and a mouse (fine pointer)', () => {
  for (const dialogCase of cases) {
    test(`${dialogCase.story}: the dialog appears at once, with no animated property (DR3)`, async ({
      page,
    }) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      expect(
        await page.evaluate(() => matchMedia('(pointer: fine)').matches),
      ).toBe(true);
      const {animations, firstFrameOpacity} = await openDialog(
        page,
        dialogCase,
      );
      expect(animations).toEqual([]);
      expect(firstFrameOpacity).toBe(1);
    });
  }
});

test.describe('without reduced motion on a touch screen', () => {
  test.use({hasTouch: true, isMobile: true});

  test('the standard dialog keeps its entrance: it rises and scales in as it fades', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'no-preference'});
    const {animations} = await openDialog(page, cases[0]);
    expect(animations).toHaveLength(1);
    expect(animations[0].properties).toEqual(['opacity', 'transform']);
    expect(animations[0].durationMs).toBeGreaterThan(200);
  });
});
