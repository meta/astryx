// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Tokenizer core/PowerSearch ^packages/core/src/internal/SheetConfirmation ^apps/storybook/stories/(Tokenizer|PowerSearch)

/**
 * @file BottomSheetRefusedDismissal.a11y.browser.spec.ts
 * @input The Tokenizer and PowerSearch sheet stories in a built Storybook, on
 *   a phone viewport with touch; the swipe is real touch input through the
 *   interaction harness.
 * @output Real-engine proof that a sheet whose dismissal its host refuses — a
 *   swipe, a scrim tap or Escape on a changed draft opens the discard
 *   confirmation — keeps its scrim while the confirmation is open, keeps it
 *   after Keep editing, and leaves with it on Discard.
 * @position Chromium and WebKit. The scrim is the sheet dialog's `::backdrop`,
 *   whose opacity the drag thins on the compositor and the host restores; only
 *   a shipping engine computes the pseudo-element's style.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {drag, touchDriver} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test.use({viewport: {width: 390, height: 844}, hasTouch: true});

interface SheetFixture {
  readonly name: string;
  readonly story: string;
  /** The sheet dialog's accessible name. */
  readonly sheetLabel: string;
  /** The control that reopens the sheet, and takes focus back after a close. */
  trigger(page: Page): ReturnType<Page['locator']>;
  /** One edit, so the draft differs from the selection at open. */
  dirty(page: Page): Promise<void>;
  /** Where Keep editing puts focus. */
  readonly focusAfterKeepEditing: string;
}

const FIXTURES: ReadonlyArray<SheetFixture> = [
  {
    name: 'Tokenizer',
    story: 'core-tokenizer--sheet-presentation',
    sheetLabel: 'Tags',
    trigger: page => page.getByRole('button', {name: 'Tags'}),
    dirty: async page => {
      await page.getByRole('checkbox', {name: 'Tag 03'}).tap();
      await expect(
        page.getByRole('checkbox', {name: 'Tag 03'}),
      ).toHaveAttribute('aria-checked', 'true');
    },
    focusAfterKeepEditing: 'Search Tags',
  },
  {
    name: 'PowerSearch',
    story: 'core-powersearch--sheet-presentation',
    sheetLabel: 'Filters',
    trigger: page => page.locator('button[aria-haspopup="dialog"]').first(),
    dirty: async page => {
      const remove = page
        .getByRole('button', {name: /^Remove .* filter$/})
        .first();
      const name = (await remove.getAttribute('aria-label')) ?? '';
      await remove.tap();
      await expect(page.getByRole('button', {name})).toHaveCount(0);
    },
    focusAfterKeepEditing: 'Add filter',
  },
];

type ClosePath = 'swipe' | 'scrim' | 'escape';
const CLOSE_PATHS: ReadonlyArray<ClosePath> = ['swipe', 'scrim', 'escape'];

interface ScrimReading {
  readonly open: boolean;
  readonly modal: boolean;
  /** The sheet dialog's `::backdrop` opacity, computed. */
  readonly opacity: number;
  /** The panel's transform at rest is the identity. */
  readonly panelAtRest: boolean;
}

function sheetDialog(page: Page, fixture: SheetFixture) {
  return page.locator(`dialog[aria-label="${fixture.sheetLabel}"]`);
}

async function readScrim(
  page: Page,
  fixture: SheetFixture,
): Promise<ScrimReading> {
  return sheetDialog(page, fixture).evaluate(node => {
    const dialog = node as HTMLDialogElement;
    const panel = dialog.querySelector<HTMLElement>('[tabindex="-1"]');
    const transform =
      panel == null ? 'none' : getComputedStyle(panel).transform;
    return {
      open: dialog.open,
      modal: dialog.matches(':modal'),
      opacity: Number(getComputedStyle(dialog, '::backdrop').opacity),
      panelAtRest:
        transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)',
    };
  });
}

/** The sheet's own motion has ended: its entrance, or a return to rest. */
async function waitForSheetRest(page: Page, fixture: SheetFixture) {
  const dialog = sheetDialog(page, fixture);
  await expect
    .poll(async () =>
      dialog.evaluate(
        node =>
          node
            .getAnimations({subtree: true})
            .filter(animation => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
}

async function openDirtySheet(page: Page, fixture: SheetFixture) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${fixture.story}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await fixture.trigger(page).waitFor({state: 'visible'});
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await fixture.trigger(page).tap();
  await expect(
    page.getByRole('dialog', {name: fixture.sheetLabel}),
  ).toBeVisible();
  await waitForSheetRest(page, fixture);
  await fixture.dirty(page);
  const before = await readScrim(page, fixture);
  expect(before).toEqual({
    open: true,
    modal: true,
    opacity: 1,
    panelAtRest: true,
  });
}

/** Asks to close the sheet by `path`; the changed draft then asks first. */
async function requestClose(
  page: Page,
  fixture: SheetFixture,
  path: ClosePath,
) {
  const panel = sheetDialog(page, fixture).locator('[tabindex="-1"]').first();
  const box = await panel.boundingBox();
  if (box == null) {
    throw new Error('The sheet panel has no box');
  }
  const x = Math.round(box.x + box.width / 2);
  if (path === 'swipe') {
    // A finger on the grabber, pulled past the dismiss line and lifted: the
    // live drag thins the scrim with the sheet's travel.
    const driver = await touchDriver(page);
    const from = {x, y: Math.round(box.y + 12)};
    const to = {x, y: Math.round(Math.min(box.y + box.height, 844 - 8))};
    await driver.play(drag(from, to, {durationMs: 320}), {pacing: 'spacing'});
  } else if (path === 'scrim') {
    // The dialog above the panel is the scrim.
    await page.touchscreen.tap(x, Math.max(12, Math.round(box.y - 40)));
  } else {
    // A tooltip a focused control shows would take the press first (the
    // dismissal stack's order), so the press starts from the sheet's panel,
    // once that tooltip has gone.
    await panel.focus();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
}

const confirmation = (page: Page) =>
  page.getByRole('alertdialog', {name: 'Discard changes?'});

for (const fixture of FIXTURES) {
  for (const path of CLOSE_PATHS) {
    test(`${fixture.name}: the scrim stays while the confirmation a ${path} opened is up, and after Keep editing`, async ({
      page,
    }) => {
      await openDirtySheet(page, fixture);
      await requestClose(page, fixture, path);
      await expect(confirmation(page)).toBeVisible();
      await expect(
        page.getByRole('button', {name: 'Keep editing'}),
      ).toBeFocused();

      // The sheet stayed presented and modal, with its backdrop painting.
      // After a swipe the panel returns to rest and the scrim with it, over
      // the sheet's own motion, so the reading waits for that rest.
      await waitForSheetRest(page, fixture);
      await expect
        .poll(async () => readScrim(page, fixture), {
          message: `the ${fixture.name} sheet's scrim while the confirmation is open`,
        })
        .toEqual({open: true, modal: true, opacity: 1, panelAtRest: true});

      await page.getByRole('button', {name: 'Keep editing'}).tap();
      await expect(confirmation(page)).toHaveCount(0);
      await expect(
        page.getByRole('dialog', {name: fixture.sheetLabel}),
      ).toBeVisible();
      await expect(
        page.getByRole(fixture.name === 'Tokenizer' ? 'textbox' : 'button', {
          name: fixture.focusAfterKeepEditing,
        }),
      ).toBeFocused();
      // Keep editing changes nothing of the sheet's own presentation.
      expect(await readScrim(page, fixture)).toEqual({
        open: true,
        modal: true,
        opacity: 1,
        panelAtRest: true,
      });
    });
  }

  test(`${fixture.name}: Discard after a swipe closes the sheet with its exit, and focus returns to the trigger`, async ({
    page,
  }) => {
    await openDirtySheet(page, fixture);
    await requestClose(page, fixture, 'swipe');
    await expect(confirmation(page)).toBeVisible();
    await waitForSheetRest(page, fixture);
    await page.getByRole('button', {name: 'Discard changes'}).tap();
    await expect(confirmation(page)).toHaveCount(0);
    // The exit runs: the dialog is still presented for a moment, then gone,
    // and the backdrop has faded with it.
    await expect(
      page.locator(`dialog[aria-label="${fixture.sheetLabel}"][open]`),
    ).toHaveCount(0, {timeout: 5000});
    await expect(fixture.trigger(page)).toBeFocused();
  });
}
