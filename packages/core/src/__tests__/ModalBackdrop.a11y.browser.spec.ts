// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Dialog|AlertDialog|Drawer|MobileNav|BottomSheet)/|apps/storybook/stories/(Dialog|AlertDialog|Drawer|MobileNav|BottomSheet)\.stories)

/**
 * @file ModalBackdrop.a11y.browser.spec.ts
 * @input The Dialog, AlertDialog, Drawer, MobileNav and BottomSheet stories
 *   in a built Storybook, opened with real taps on a phone-sized touch
 *   viewport, in light and dark mode, with the base tokens and with the
 *   neutral theme, in Chromium and WebKit, under a finger (a coarse pointer)
 *   and with a mouse, and in forced colors
 * @output Browser evidence for the modal backdrop: under a finger and with a
 *   mouse, Dialog, AlertDialog, Drawer and MobileNav no longer blur the page
 *   behind them, while every modal `::backdrop` keeps the theme's
 *   `--color-overlay` (the base tokens' and a bundled theme's own);
 *   BottomSheet never blurred; in forced colors, under either pointer, each
 *   has one 1px edge (Dialog's border, the side panels' anchored-side
 *   border) and the outline stays the focus ring's; screenshots of an open
 *   Dialog per mode for the pull request
 * @position Cross-browser proof for the shared modal backdrop; jsdom drops
 *   `backdrop-filter` and paints nothing, so __tests__/modalBackdrop.test.tsx
 *   can only pin the declarations. WebKit here is desktop WebKit under
 *   Playwright, not iOS Safari; the real iOS Safari side is a simulator
 *   recording in the pull request.
 *
 * SYNC: When a component gains a modal ::backdrop, add it to MODALS.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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

test.use({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});

/** Each modal surface that dims the page, and the tap that opens it. */
const MODALS = [
  {name: 'Dialog', story: 'core-dialog--default', opener: 'Open Modal'},
  {
    name: 'AlertDialog',
    story: 'core-alertdialog--delete',
    opener: 'Delete item',
  },
  {name: 'Drawer', story: 'core-drawer--scrim', opener: 'With scrim'},
  {
    name: 'MobileNav',
    story: 'core-mobilenav--default',
    opener: 'Open Navigation',
  },
  {
    name: 'BottomSheet',
    story: 'core-bottomsheet--showcase',
    opener: 'Open sheet',
  },
] as const;

type Mode = 'light' | 'dark';

/** The dim with the base tokens, under every pointer: `--color-overlay`. */
const OVERLAY_DIM: Record<Mode, string> = {
  light: 'rgba(1, 18, 40, 0.4)',
  dark: 'rgba(17, 17, 18, 0.6)',
};

async function openModal(
  page: Page,
  modal: (typeof MODALS)[number],
  mode: Mode,
  theme: 'none' | 'neutral',
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${modal.story}&viewMode=story&globals=colorMode:${mode};astryxTheme:${theme}`,
  );
  const opener = page.getByRole('button', {name: modal.opener}).first();
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    await opener.tap();
  } else {
    await opener.click();
  }
  await expect(page.locator('dialog[open]').last()).toBeVisible();
}

/** The open modal's ::backdrop as the browser computes it. */
async function readBackdrop(
  page: Page,
): Promise<{color: string; filter: string}> {
  return page
    .locator('dialog[open]')
    .last()
    .evaluate(dialog => {
      const style = getComputedStyle(dialog, '::backdrop');
      return {
        color: style.backgroundColor,
        filter:
          style.backdropFilter ??
          (style as unknown as {webkitBackdropFilter?: string})
            .webkitBackdropFilter ??
          'none',
      };
    });
}

/**
 * The open modal's visible surface (the dialog, or MobileNav's drawer): its
 * outline, and its drawn side borders (solid and wider than 0), as
 * `side width`.
 */
async function readSurfaceEdge(
  page: Page,
  name: string,
): Promise<{outline: string; sides: string[]}> {
  return page
    .locator('dialog[open]')
    .last()
    .evaluate((dialog, isMobileNav) => {
      // MobileNav's dialog is a transparent full-viewport container; its
      // drawer panel (the focus target) is what the person sees.
      const surface = isMobileNav
        ? (dialog.querySelector('[tabindex="-1"]') ?? dialog)
        : dialog;
      const style = getComputedStyle(surface);
      return {
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        sides: (['left', 'right'] as const)
          .filter(
            side =>
              style.getPropertyValue(`border-${side}-style`) === 'solid' &&
              Number.parseFloat(
                style.getPropertyValue(`border-${side}-width`),
              ) > 0,
          )
          .map(
            side => `${side} ${style.getPropertyValue(`border-${side}-width`)}`,
          ),
      };
    }, name === 'MobileNav');
}

for (const modal of MODALS) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${modal.name} keeps the overlay colour under a finger in ${mode} mode, unblurred`, async ({
      page,
    }) => {
      await openModal(page, modal, mode, 'none');
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(true);
      const backdrop = await readBackdrop(page);
      expect(backdrop.color).toBe(OVERLAY_DIM[mode]);
      expect(backdrop.filter).toBe('none');
    });
  }

  test(`${modal.name} keeps the neutral theme's own dim under a finger, unblurred`, async ({
    page,
  }) => {
    await openModal(page, modal, 'light', 'neutral');
    const backdrop = await readBackdrop(page);
    // neutral's overlay: black at 50 %.
    expect(backdrop.color).toBe('rgba(0, 0, 0, 0.5)');
    expect(backdrop.filter).toBe('none');
  });
}

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  for (const modal of MODALS.filter(m => m.name !== 'MobileNav')) {
    test(`${modal.name} keeps the overlay colour, unblurred`, async ({
      page,
    }) => {
      await openModal(page, modal, 'dark', 'none');
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const backdrop = await readBackdrop(page);
      expect(backdrop.color).toBe(OVERLAY_DIM.dark);
      expect(backdrop.filter).toBe('none');
    });
  }
});

test.describe('forced colors', () => {
  test.use({colorScheme: 'light'});

  for (const modal of MODALS.filter(m => m.name !== 'BottomSheet')) {
    test(`${modal.name} has one 1px edge under a finger, where no blur sets it apart`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== 'chromium',
        'forced-colors emulation is Chromium-only in Playwright',
      );
      await page.emulateMedia({forcedColors: 'active'});
      await openModal(page, modal, 'light', 'none');
      const edge = await readSurfaceEdge(page, modal.name);
      if (modal.name === 'Drawer' || modal.name === 'MobileNav') {
        // The side panel's border facing the page is its edge; no outline
        // doubles it.
        expect(edge.outline, JSON.stringify(edge)).toMatch(/^none /);
        expect(edge.sides, JSON.stringify(edge)).toHaveLength(1);
        expect(edge.sides[0], JSON.stringify(edge)).toMatch(/ 1px$/);
      } else {
        // Dialog's border is its edge, on every side; its outline stays the
        // focus ring's (none until keyboard focus).
        expect(edge, JSON.stringify(edge)).toEqual({
          outline: 'none 0px',
          sides: ['left 1px', 'right 1px'],
        });
      }
    });
  }

  test.describe('with a mouse', () => {
    test.use({hasTouch: false, isMobile: false});

    for (const modal of MODALS.filter(
      m => m.name === 'Dialog' || m.name === 'Drawer',
    )) {
      test(`${modal.name} has the same one 1px edge`, async ({
        page,
        browserName,
      }) => {
        test.skip(
          browserName !== 'chromium',
          'forced-colors emulation is Chromium-only in Playwright',
        );
        await page.emulateMedia({forcedColors: 'active'});
        await openModal(page, modal, 'light', 'none');
        expect(
          await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
        ).toBe(false);
        const edge = await readSurfaceEdge(page, modal.name);
        expect(edge, JSON.stringify(edge)).toEqual(
          modal.name === 'Drawer'
            ? {
                outline: expect.stringMatching(/^none /),
                sides: [expect.stringMatching(/ 1px$/)],
              }
            : {outline: 'none 0px', sides: ['left 1px', 'right 1px']},
        );
      });
    }
  });
});

test('the media scrim keeps --color-overlay', async ({page}) => {
  // Overlay's dark scrim keeps text legible over media; it is not a modal
  // dim and keeps the overlay colour.
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-overlay--bottom-strip&viewMode=story&globals=colorMode:light;astryxTheme:none`,
  );
  const scrim = page.locator('.astryx-overlay-scrim').first();
  await expect(scrim).toBeAttached();
  expect(
    await scrim.evaluate(element => getComputedStyle(element).backgroundColor),
  ).toBe('rgba(1, 18, 40, 0.4)');
});

const EVIDENCE = process.env.MODAL_BACKDROP_EVIDENCE_DIR ?? '';
test('evidence: an open Dialog over a page under a finger, per mode', async ({
  page,
}, testInfo) => {
  test.skip(EVIDENCE === '', 'evidence capture runs on request');
  fs.mkdirSync(EVIDENCE, {recursive: true});
  for (const mode of ['light', 'dark'] as const) {
    await openModal(page, MODALS[0], mode, 'none');
    // The page under the dim, with the open dialog: the viewport, no chrome.
    await page.screenshot({
      path: path.join(EVIDENCE, `${testInfo.project.name}-dialog-${mode}.png`),
      animations: 'disabled',
    });
  }
});
