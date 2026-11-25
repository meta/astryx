// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tour.interaction.browser.spec.ts
 * @input The Core/Tour stories in a real browser
 * @output Tests for the callout's place, the ring, the backdrop, Tab, Escape
 *   and focus
 * @position Real-browser evidence for layout, the top layer and focus, which
 *   jsdom does not model.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const callout = (page: Page) => page.getByRole('dialog');
const state = (page: Page) => page.getByTestId('tour-state');
const ring = (page: Page) => page.locator('.astryx-tour-highlight');

async function start(page: Page, story: string) {
  await openStory(page, storybook(), `core-tour--${story}`);
  await page.getByRole('button', {name: 'Start tour'}).click();
  await expect(callout(page)).toBeVisible();
}

async function box(page: Page, name: string) {
  const found = await page
    .getByRole('button', {name, exact: true})
    .boundingBox();
  if (found == null) {
    throw new Error(`No box for ${name}`);
  }
  return found;
}

test('the callout sits beside the anchor and the ring surrounds it, step by step', async ({
  page,
}) => {
  await start(page, 'default');
  await expect(callout(page)).toHaveAccessibleName('Save your work');

  for (const [name, title] of [
    ['Save', 'Save your work'],
    ['Share', 'Share it'],
  ] as const) {
    await expect(callout(page)).toHaveAccessibleName(title);
    const anchor = await box(page, name);
    await expect
      .poll(async () => {
        const ringBox = await ring(page).boundingBox();
        return ringBox == null
          ? null
          : [
              Math.round(anchor.x - ringBox.x),
              Math.round(anchor.y - ringBox.y),
              Math.round(ringBox.width - anchor.width),
              Math.round(ringBox.height - anchor.height),
            ];
      })
      .toEqual([4, 4, 8, 8]);
    const surface = await callout(page).boundingBox();
    // Below the anchor, clear of the ring.
    expect(surface?.y).toBeGreaterThan(anchor.y + anchor.height + 4);
    expect(surface?.y).toBeLessThan(anchor.y + anchor.height + 40);
    if (name === 'Save') {
      await page.getByRole('button', {name: 'Next'}).click();
    }
  }
});

test('in a right-to-left subtree the ring surrounds the anchor', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-tour--default');
  await page.goto(`${page.url()}&globals=direction:rtl`);
  await page.getByRole('button', {name: 'Start tour'}).click();
  await expect(callout(page)).toBeVisible();
  await expect(callout(page)).toHaveCSS('direction', 'rtl');
  const anchor = await box(page, 'Save');
  await expect
    .poll(async () => {
      const ringBox = await ring(page).boundingBox();
      return ringBox == null
        ? null
        : [
            Math.round(anchor.x - ringBox.x),
            Math.round(anchor.y - ringBox.y),
            Math.round(ringBox.width - anchor.width),
            Math.round(ringBox.height - anchor.height),
          ];
    })
    .toEqual([4, 4, 8, 8]);
});

test('without a backdrop the page stays usable, and Escape ends the tour only from the callout or the anchor', async ({
  page,
}) => {
  await start(page, 'default');
  // Focus that the person placed on a control of the page stays there.
  await expect(page.getByRole('button', {name: 'Start tour'})).toBeFocused();

  // A press on the anchor reaches it and the tour keeps running.
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(state(page)).toContainText('saves: 1');
  await expect(callout(page)).toBeVisible();

  // Escape with focus on a control that is not the anchor does nothing.
  await page.getByRole('button', {name: 'After the tour'}).focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(callout(page)).toBeVisible();
  await expect(state(page)).toContainText('ended: none');

  // Escape with focus on the anchor ends the tour.
  await page.getByRole('button', {name: 'Save', exact: true}).focus();
  await page.keyboard.press('Escape');
  await expect(state(page)).toContainText('ended: escape');
  await expect(callout(page)).toHaveCount(0);
});

test('Tab leaves a callout without a backdrop and stays in one with a backdrop', async ({
  page,
}) => {
  await start(page, 'default');
  await page.getByRole('button', {name: 'Next'}).focus();
  await page.keyboard.press('Tab');
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document.activeElement?.closest('[role="dialog"]') == null &&
          document.activeElement !== document.body,
      ),
    )
    .toBe(true);
  // The callout's controls follow the step's anchor in the Tab order: Tab
  // from the anchor enters the callout, and Tab from its last control goes on
  // to the control after the anchor. Each step takes its own anchor's place.
  await page.getByRole('button', {name: 'Save', exact: true}).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Close tour'})).toBeFocused();
  await page.getByRole('button', {name: 'Next'}).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Share'})).toBeFocused();

  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Share it');
  await page.getByRole('button', {name: 'Save', exact: true}).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Share'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Close tour'})).toBeFocused();
  await page.getByRole('button', {name: 'Next'}).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Export'})).toBeFocused();

  await start(page, 'with-backdrop');
  await expect(callout(page)).toHaveAttribute('aria-modal', 'true');
  await page.getByRole('button', {name: 'Next'}).focus();
  for (let press = 0; press < 4; press++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') != null,
      ),
    ).toBe(true);
  }
});

test('a tooltip on the anchor does not take the callout out of the Tab order', async ({
  page,
}) => {
  await start(page, 'anchor-with-tooltip');
  const save = page.getByRole('button', {name: 'Save', exact: true});
  const closeTour = page.getByRole('button', {name: 'Close tour'});
  const tooltip = page
    .getByRole('tooltip')
    .filter({hasText: 'Saves your work'});
  // Keyboard focus on the anchor shows its tooltip while the callout is open.
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(closeTour).toBeFocused();
  await expect(tooltip).toBeHidden();

  await page.keyboard.press('Shift+Tab');
  await expect(save).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(closeTour).toBeFocused();
});

test('a press on the dimmed page, the anchor included, ends a backdrop tour', async ({
  page,
}) => {
  await start(page, 'with-backdrop');
  const anchor = await box(page, 'Save');
  await page.mouse.click(
    anchor.x + anchor.width / 2,
    anchor.y + anchor.height / 2,
  );
  await expect(state(page)).toContainText('ended: backdrop');
  await expect(state(page)).toContainText('saves: 0');
  await expect(callout(page)).toHaveCount(0);
});

test('a step with no anchor, and a step whose anchor is missing, show in the center with no ring', async ({
  page,
}) => {
  await start(page, 'centered-step');
  await expect(callout(page)).toHaveAccessibleName('Welcome');
  const expectCentered = async () => {
    await expect
      .poll(async () => {
        const surface = await callout(page).boundingBox();
        const viewport = page.viewportSize();
        if (surface == null || viewport == null) {
          return null;
        }
        return [
          Math.abs(surface.x + surface.width / 2 - viewport.width / 2) < 24,
          Math.abs(surface.y + surface.height / 2 - viewport.height / 2) < 24,
        ];
      })
      .toEqual([true, true]);
    await expect(ring(page)).toHaveCount(0);
  };
  await expectCentered();
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Save your work');
  await expect(ring(page)).toHaveCount(1);

  await start(page, 'missing-anchor');
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Share it');
  await expectCentered();
});

test('a step after a centered step follows its own anchor in view', async ({
  page,
}) => {
  await start(page, 'centered-step');
  await expect(callout(page)).toHaveAccessibleName('Welcome');
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Save your work');
  // The layer's alignment is `unsafe` only while its anchor is out of view.
  // This anchor is in view.
  const layer = callout(page).locator('xpath=ancestor::*[@popover][1]');
  await page.waitForTimeout(300);
  const alignment = await layer.evaluate(node => {
    const {justifySelf, alignSelf} = (node as HTMLElement).style;
    return `${justifySelf} ${alignSelf}`;
  });
  expect(alignment).not.toContain('unsafe');
});

test('an anchor out of view in a scrolling panel scrolls into view', async ({
  page,
}) => {
  await start(page, 'scrolled-anchor');
  await page.getByRole('button', {name: 'Next'}).click();
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Export');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const panel = document.querySelector('[data-testid="panel"]');
        const target = [...document.querySelectorAll('button')].find(
          item => item.textContent === 'Export',
        );
        if (panel == null || target == null) {
          return false;
        }
        const outer = panel.getBoundingClientRect();
        const inner = target.getBoundingClientRect();
        return inner.top >= outer.top && inner.bottom <= outer.bottom;
      }),
    )
    .toBe(true);
});

test('focus returns to the anchor when the tour ends from the callout', async ({
  page,
}) => {
  await start(page, 'default');
  await page.getByRole('button', {name: 'Close tour'}).click();
  await expect(state(page)).toContainText('ended: close');
  await expect(
    page.getByRole('button', {name: 'Save', exact: true}),
  ).toBeFocused();
});

test('an anchor far down the page scrolls into view, at once under reduced motion', async ({
  page,
}) => {
  const isInViewport = async () =>
    page.evaluate(() => {
      const target = [...document.querySelectorAll('button')].find(
        item => item.textContent === 'Export',
      );
      const box = target?.getBoundingClientRect();
      return box != null && box.top >= 0 && box.bottom <= window.innerHeight;
    });
  await start(page, 'anchor-below-fold');
  await page.getByRole('button', {name: 'Next'}).click();
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Export');
  await expect.poll(isInViewport).toBe(true);

  await page.emulateMedia({reducedMotion: 'reduce'});
  await start(page, 'anchor-below-fold');
  await page.getByRole('button', {name: 'Next'}).click();
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Export');
  // No animation to wait for: the anchor is in view in the same frame.
  expect(await isInViewport()).toBe(true);
});

test('without a backdrop, a step whose anchor leaves shows no surface and gives up focus, and returns with the anchor', async ({
  page,
}) => {
  await start(page, 'default');
  await page.getByRole('button', {name: 'Next'}).focus();
  // Removed from script, so the press itself moves no focus.
  await page.evaluate(() => {
    const remove = [...document.querySelectorAll('button')].find(
      item => item.textContent === 'Remove Save',
    );
    remove?.click();
  });
  await expect(callout(page)).toBeHidden();
  await expect(ring(page)).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') == null,
    ),
  ).toBe(true);
  await expect(state(page)).toContainText('active: save; ended: none');

  await page.getByRole('button', {name: 'Restore Save'}).click();
  await expect(callout(page)).toBeVisible();
  await expect(ring(page)).toHaveCount(1);
  const anchor = await box(page, 'Save');
  const surface = await callout(page).boundingBox();
  expect(surface?.y).toBeGreaterThan(anchor.y + anchor.height);
});

test('with a backdrop, a step whose anchor leaves shows centered and stays modal', async ({
  page,
}) => {
  await start(page, 'with-backdrop');
  // The backdrop covers the page, so the control is removed from script.
  await page.evaluate(() => {
    const remove = [...document.querySelectorAll('button')].find(
      item => item.textContent === 'Remove Save',
    );
    remove?.click();
  });
  await expect(ring(page)).toHaveCount(0);
  await expect(callout(page)).toBeVisible();
  await expect
    .poll(async () => {
      const surface = await callout(page).boundingBox();
      const viewport = page.viewportSize();
      return surface == null || viewport == null
        ? null
        : Math.abs(surface.x + surface.width / 2 - viewport.width / 2) < 24;
    })
    .toBe(true);
  await page.getByRole('button', {name: 'Next'}).focus();
  for (let press = 0; press < 3; press++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') != null,
      ),
    ).toBe(true);
  }
  // Still modal, and back beside the anchor when the anchor returns.
  await page.evaluate(() => {
    const restore = [...document.querySelectorAll('button')].find(
      item => item.textContent === 'Restore Save',
    );
    restore?.click();
  });
  await expect(ring(page)).toHaveCount(1);
  const anchor = await box(page, 'Save');
  await expect
    .poll(async () => (await callout(page).boundingBox())?.y ?? 0)
    .toBeGreaterThan(anchor.y + anchor.height);
  await page.keyboard.press('Escape');
  await expect(state(page)).toContainText('ended: escape');
});

for (const story of ['scrolled-anchor', 'scrolled-anchor-with-backdrop']) {
  test(`a callout whose anchor scrolls out of its panel is not painted, and returns with the anchor (${story})`, async ({
    page,
  }) => {
    // The anchor scrolls into view at once, so the panel's offset is final.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await start(page, story);
    await page.getByRole('button', {name: 'Next'}).click();
    await page.getByRole('button', {name: 'Next'}).click();
    await expect(callout(page)).toHaveAccessibleName('Export');
    await expect(ring(page)).toBeVisible();
    const panel = page.getByTestId('panel');

    // The browser stops painting a layer whose anchor a scrolling panel clips.
    // Its box and its `visibility` stay, so the test asks what is at its center.
    const isPainted = async () =>
      callout(page).evaluate(node => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return hit != null && node.contains(hit);
      });
    await expect.poll(isPainted).toBe(true);
    await expect(ring(page)).toHaveCSS(
      'position-visibility',
      'anchors-visible',
    );
    const shown = await panel.evaluate(node => node.scrollTop);

    await panel.evaluate(node => node.scrollTo({top: 0, behavior: 'instant'}));
    await expect.poll(isPainted).toBe(false);
    await expect(state(page)).toContainText('active: export; ended: none');

    await panel.evaluate(
      (node, top) => node.scrollTo({top, behavior: 'instant'}),
      shown,
    );
    await expect.poll(isPainted).toBe(true);
  });
}

test('the ring survives forced colors, and every control in the callout is at least 24 by 24', async ({
  page,
}) => {
  await start(page, 'default');
  await expect(ring(page)).toHaveCSS('outline-style', 'none');
  for (const control of await callout(page).getByRole('button').all()) {
    const size = await control.boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(24);
    expect(size?.height).toBeGreaterThanOrEqual(24);
  }

  await page.emulateMedia({forcedColors: 'active'});
  await expect(ring(page)).toHaveCSS('outline-style', 'solid');
  await expect(ring(page)).toHaveCSS('outline-width', '2px');
});

test('with a backdrop, focus is on the heading of each step', async ({
  page,
}) => {
  await start(page, 'with-backdrop');
  await expect(
    page.getByRole('heading', {name: 'Save your work'}),
  ).toBeFocused();
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(page.getByRole('heading', {name: 'Share it'})).toBeFocused();
  // The focus stays there: nothing takes it back after the step shows.
  await page.waitForTimeout(400);
  await expect(page.getByRole('heading', {name: 'Share it'})).toBeFocused();
});

test('a step that starts while focus stays on a page control is announced', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-tour--default');
  const startButton = page.getByRole('button', {name: 'Start tour'});
  // A press from the keyboard leaves focus on the control in every engine.
  await startButton.focus();
  await page.keyboard.press('Enter');
  await expect(callout(page)).toHaveAccessibleName('Save your work');
  await expect(startButton).toBeFocused();
  await expect(
    page.locator('[aria-live="polite"]').filter({hasText: 'Save your work'}),
  ).toHaveCount(1);
});

test('a step that prepares shows no callout and keeps focus where it was', async ({
  page,
}) => {
  await start(page, 'prepared-step');
  const next = page.getByRole('button', {name: 'Next'});
  await next.focus();
  await page.keyboard.press('Enter');
  // Preparing: the dialog reports busy, nothing of it is painted, and focus
  // has not moved to the page body.
  const layer = callout(page).locator('xpath=ancestor::*[@popover][1]');
  await expect(callout(page)).toHaveAttribute('aria-busy', 'true');
  await expect(layer).toHaveCSS('opacity', '0');
  await expect(next).toBeFocused();
  await expect(state(page)).toContainText('active: share');

  await expect(callout(page)).toHaveAccessibleName('Share it');
  await expect(callout(page)).not.toHaveAttribute('aria-busy');
  await expect(layer).toHaveCSS('opacity', '1');
  await expect(page.getByRole('heading', {name: 'Share it'})).toBeFocused();
});

test('Done does not end the tour while an earlier step prepares after Back', async ({
  page,
}) => {
  await start(page, 'prepared-step');
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Share it');
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Export');

  // Back starts the Share step, which prepares. The last step's Done control
  // is still there, unpainted. A press on it ends no tour.
  await page.getByRole('button', {name: 'Back'}).focus();
  await page.keyboard.press('Enter');
  await expect(callout(page)).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', {name: 'Done'}).focus();
  await page.keyboard.press('Enter');
  await expect(callout(page)).toHaveAccessibleName('Share it');
  await expect(state(page)).toContainText('active: share; ended: none');
});

for (const story of ['inside-layers', 'inside-layers-with-backdrop']) {
  test(`a step inside a modal dialog and one inside a popover show above their layer and stay usable (${story})`, async ({
    page,
  }) => {
    const tour = (name: string) => page.getByRole('dialog', {name});
    const isOnTop = async (name: string) =>
      tour(name).evaluate(node => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return hit != null && node.contains(hit);
      });
    await openStory(page, storybook(), `core-tour--${story}`);
    await page.getByRole('button', {name: 'Start tour'}).click();
    await expect(tour('Settings moved')).toBeVisible();

    // Into the modal dialog: the callout is painted over it, sits beside the
    // control in it, and its own controls work.
    await tour('Settings moved').getByRole('button', {name: 'Next'}).click();
    await expect(tour('Apply your changes')).toBeVisible();
    // Next held focus in the callout, and the callout mounted again inside
    // the dialog: focus is on the new step's heading.
    await expect(
      tour('Apply your changes').getByRole('heading', {
        name: 'Apply your changes',
      }),
    ).toBeFocused();
    await expect.poll(async () => isOnTop('Apply your changes')).toBe(true);
    const apply = await box(page, 'Apply');
    await expect
      .poll(
        async () => (await tour('Apply your changes').boundingBox())?.y ?? 0,
      )
      .toBeGreaterThan(apply.y + apply.height);
    await expect(ring(page)).toBeVisible();
    const inTour = async () =>
      page.evaluate(
        () => document.activeElement?.closest('.astryx-tour') != null,
      );
    if (story === 'inside-layers') {
      // Without a backdrop the control in the dialog stays usable, by
      // pointer and by keyboard: Tab from it enters the callout, and Tab
      // from the callout's last control stays inside the modal dialog.
      // The keyboard goes first: in WebKit the first Tab after a pointer
      // press on the anchor moves on in DOM order and skips the callout.
      const control = page.getByRole('button', {name: 'Apply', exact: true});
      await control.focus();
      await page.keyboard.press('Tab');
      expect(await inTour()).toBe(true);
      await tour('Apply your changes')
        .getByRole('button', {name: 'Next'})
        .focus();
      await page.keyboard.press('Tab');
      // The dialog's own close control comes next: focus left the callout
      // and stayed in the modal dialog.
      await expect(
        page.getByRole('button', {name: 'Close', exact: true}),
      ).toBeFocused();
      expect(await inTour()).toBe(false);
      await control.click();
      await expect(state(page)).toContainText('applied: 1');
    }

    // Into the popover.
    await tour('Apply your changes')
      .getByRole('button', {name: 'Next'})
      .click();
    await expect(tour('Filter the list')).toBeVisible();
    await expect.poll(async () => isOnTop('Filter the list')).toBe(true);
    const status = await box(page, 'Status');
    await expect
      .poll(async () => (await tour('Filter the list').boundingBox())?.y ?? 0)
      .toBeGreaterThan(status.y + status.height);
    await expect(ring(page)).toBeVisible();
    if (story === 'inside-layers') {
      // The popover holds Tab in its surface. The callout is in reach of it:
      // Tab from the control in the popover enters the callout and focus
      // stays there, and Tab from the callout's last control goes back into
      // the popover.
      await page.getByRole('button', {name: 'Status', exact: true}).focus();
      await page.keyboard.press('Tab');
      expect(await inTour()).toBe(true);
      await page.waitForTimeout(200);
      expect(await inTour()).toBe(true);
      await tour('Filter the list').getByRole('button', {name: 'Done'}).focus();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', {name: 'Status', exact: true}),
      ).toBeFocused();
      expect(await inTour()).toBe(false);
    }

    // Back out to the page, and the tour ends from its own control.
    await tour('Filter the list').getByRole('button', {name: 'Back'}).click();
    await expect(tour('Apply your changes')).toBeVisible();
    await expect.poll(async () => isOnTop('Apply your changes')).toBe(true);
    if (story === 'inside-layers-with-backdrop') {
      // A modal step inside the modal dialog keeps Tab in its callout.
      await tour('Apply your changes')
        .getByRole('button', {name: 'Next'})
        .focus();
      for (let press = 0; press < 5; press++) {
        await page.keyboard.press('Tab');
        expect(
          await page.evaluate(
            () => document.activeElement?.closest('.astryx-tour') != null,
          ),
        ).toBe(true);
      }
    }
    await tour('Apply your changes')
      .getByRole('button', {name: 'Close tour'})
      .click();
    await expect(state(page)).toContainText('ended: close');
  });
}

test('at a 320-pixel viewport the callout and its controls stay inside the page', async ({
  page,
}) => {
  await page.setViewportSize({width: 320, height: 640});
  await openStory(page, storybook(), 'core-tour--narrow-container');
  await page.getByRole('button', {name: 'Start tour'}).click();
  await expect(callout(page)).toBeVisible();
  for (const step of [0, 1, 2]) {
    const surface = await callout(page).boundingBox();
    expect(surface?.x).toBeGreaterThanOrEqual(0);
    expect((surface?.x ?? 0) + (surface?.width ?? 0)).toBeLessThanOrEqual(320);
    for (const control of await callout(page).getByRole('button').all()) {
      const size = await control.boundingBox();
      expect(size?.x).toBeGreaterThanOrEqual(0);
      expect((size?.x ?? 0) + (size?.width ?? 0)).toBeLessThanOrEqual(320);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (step < 2) {
      await callout(page).getByRole('button', {name: 'Next'}).click();
      await page.waitForTimeout(300);
    }
  }
});

test('long titles and bodies wrap inside a callout no wider than its limit', async ({
  page,
}) => {
  await start(page, 'long-text');
  const surface = await callout(page).boundingBox();
  expect(surface?.width).toBeLessThanOrEqual(320);
  const overflows = await callout(page).evaluate(
    node => node.scrollWidth > node.clientWidth + 1,
  );
  expect(overflows).toBe(false);
  await expect(
    callout(page).getByRole('button', {name: 'Continue to the next step'}),
  ).toBeVisible();
});
