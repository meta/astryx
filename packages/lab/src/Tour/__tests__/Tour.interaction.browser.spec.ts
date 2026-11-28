// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tour.interaction.browser.spec.ts
 * @input The Lab/Tour stories in a real browser
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
  await openStory(page, storybook(), `lab-tour--${story}`);
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
  await openStory(page, storybook(), 'lab-tour--default');
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
  const startTour = page.getByRole('button', {name: 'Start tour'});
  const save = page.getByRole('button', {name: 'Save', exact: true});
  const share = page.getByRole('button', {name: 'Share'});
  const closeTour = page.getByRole('button', {name: 'Close tour'});
  const next = page.getByRole('button', {name: 'Next'});
  // The callout's controls come right before the step's anchor in the Tab
  // order. Forward: the control before the anchor, the callout, the anchor,
  // the control after it.
  await startTour.focus();
  await page.keyboard.press('Tab');
  await expect(closeTour).toBeFocused();
  await next.focus();
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(share).toBeFocused();
  // Backward: the same stops in the other order.
  await page.keyboard.press('Shift+Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(next).toBeFocused();
  await closeTour.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(startTour).toBeFocused();
  // Shift+Tab from the heading, which is no tab stop, leaves the same way.
  await callout(page).getByRole('heading').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(startTour).toBeFocused();

  // Each step takes the place before its own anchor.
  await next.click();
  await expect(callout(page)).toHaveAccessibleName('Share it');
  await startTour.focus();
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeTour).toBeFocused();
  await next.focus();
  await page.keyboard.press('Tab');
  await expect(share).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Export'})).toBeFocused();
  await share.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(next).toBeFocused();

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
  const next = page.getByRole('button', {name: 'Next'});
  const tooltip = page
    .getByRole('tooltip')
    .filter({hasText: 'Saves your work'});
  // Keyboard focus on the anchor shows its tooltip while the callout is open.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Close tour'})).toBeFocused();
  await next.focus();
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(next).toBeFocused();
  await expect(tooltip).toBeHidden();

  // After the tooltip has shown and hidden, the callout still comes before
  // the anchor, from both sides.
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Share'})).toBeFocused();
  await expect(tooltip).toBeHidden();
  await page.keyboard.press('Shift+Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(next).toBeFocused();
});

test('a menu that the anchor opens does not take the callout out of the Tab order', async ({
  page,
}) => {
  await start(page, 'anchor-with-menu');
  const startTour = page.getByRole('button', {name: 'Start tour'});
  const filters = page.getByRole('button', {name: 'Filters'});
  const done = page.getByRole('button', {name: 'Done'});
  const order = async () => {
    await startTour.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', {name: 'Close tour'})).toBeFocused();
    await done.focus();
    await page.keyboard.press('Tab');
    await expect(filters).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(done).toBeFocused();
  };
  await order();

  // By keyboard: the menu opens and closes, and the callout stays open.
  await filters.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(callout(page)).toBeVisible();
  await expect(filters).toBeFocused();
  await order();

  // By pointer.
  await filters.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(callout(page)).toBeVisible();
  await order();
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

  // No tab stop of the step is left on the page: Tab goes from the control
  // before the anchor's place to the control after it.
  await page.getByRole('button', {name: 'Start tour'}).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Share'})).toBeFocused();

  await page.getByRole('button', {name: 'Restore Save'}).click();
  await expect(callout(page)).toBeVisible();
  await expect(ring(page)).toHaveCount(1);
  const anchor = await box(page, 'Save');
  const surface = await callout(page).boundingBox();
  expect(surface?.y).toBeGreaterThan(anchor.y + anchor.height);
  // The callout is before the anchor again.
  await page.getByRole('button', {name: 'Start tour'}).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Close tour'})).toBeFocused();
  await page.getByRole('button', {name: 'Next'}).focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', {name: 'Save', exact: true}),
  ).toBeFocused();
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
  test(`while a scrolling panel clips its anchor, a callout is not painted in Chromium and WebKit and is painted in Firefox, and it shows with the anchor again (${story})`, async ({
    page,
    browserName,
  }) => {
    // The anchor scrolls into view at once, so the panel's offset is final.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await start(page, story);
    await page.getByRole('button', {name: 'Next'}).click();
    await page.getByRole('button', {name: 'Next'}).click();
    await expect(callout(page)).toHaveAccessibleName('Export');
    await expect(ring(page)).toBeVisible();
    const panel = page.getByTestId('panel');

    // Chromium and WebKit stop painting a layer whose anchor a scrolling
    // panel clips. Firefox keeps painting a layer that is a popover. The
    // layer's box and its `visibility` stay, so the test asks what is at its
    // center.
    const hidesClipped = browserName !== 'firefox';
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
    if (hidesClipped) {
      await expect.poll(isPainted).toBe(false);
    } else {
      // Two frames after the scroll, the callout is still painted.
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      expect(await isPainted()).toBe(true);
    }
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
  await openStory(page, storybook(), 'lab-tour--default');
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
    await openStory(page, storybook(), `lab-tour--${story}`);
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
      // Without a backdrop every control of the dialog stays in reach of
      // Tab, and the callout comes right before its control. Tab from the
      // dialog's last control wraps to its first, so focus stays in the
      // modal dialog.
      const control = page.getByRole('button', {name: 'Apply', exact: true});
      const reset = page.getByRole('button', {name: 'Reset'});
      const closeDialog = page.getByRole('button', {
        name: 'Close',
        exact: true,
      });
      const closeTour = tour('Apply your changes').getByRole('button', {
        name: 'Close tour',
      });
      const next = tour('Apply your changes').getByRole('button', {
        name: 'Next',
      });
      await closeDialog.focus();
      await page.keyboard.press('Tab');
      await expect(closeTour).toBeFocused();
      await next.focus();
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(reset).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(closeDialog).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(reset).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(control).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(next).toBeFocused();
      await closeTour.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(closeDialog).toBeFocused();
      // The pointer goes last: after a pointer press WebKit does not move
      // focus for Shift+Tab.
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
      // The popover holds Tab in its surface, and the callout is in reach
      // of it: the callout comes first, then the popover's two controls,
      // and Tab wraps between the ends.
      const status = page.getByRole('button', {name: 'Status', exact: true});
      const closePopover = page.getByRole('button', {name: 'Close popover'});
      const closeTour = tour('Filter the list').getByRole('button', {
        name: 'Close tour',
      });
      const done = tour('Filter the list').getByRole('button', {name: 'Done'});
      await status.focus();
      await page.keyboard.press('Tab');
      await expect(closePopover).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(closeTour).toBeFocused();
      await page.waitForTimeout(200);
      expect(await inTour()).toBe(true);
      await done.focus();
      await page.keyboard.press('Tab');
      await expect(status).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(done).toBeFocused();
      await closeTour.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(closePopover).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(status).toBeFocused();
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
  await openStory(page, storybook(), 'lab-tour--narrow-container');
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
  // Firefox reports a box at a fractional x with a float error in its width.
  expect(surface?.width).toBeLessThan(320.01);
  const overflows = await callout(page).evaluate(
    node => node.scrollWidth > node.clientWidth + 1,
  );
  expect(overflows).toBe(false);
  await expect(
    callout(page).getByRole('button', {name: 'Continue to the next step'}),
  ).toBeVisible();
});

async function cardBox(page: Page) {
  const found = await page.getByTestId('card').boundingBox();
  if (found == null) {
    throw new Error('No box for the card');
  }
  return found;
}

test('the callout sits below a card that cannot take focus, and the ring surrounds the card', async ({
  page,
}) => {
  await start(page, 'card-anchor');
  await expect(callout(page)).toHaveAccessibleName('Your revenue');
  const card = await cardBox(page);
  await expect
    .poll(async () => {
      const ringBox = await ring(page).boundingBox();
      return ringBox == null
        ? null
        : [
            Math.round(card.x - ringBox.x),
            Math.round(card.y - ringBox.y),
            Math.round(ringBox.width - card.width),
            Math.round(ringBox.height - card.height),
          ];
    })
    .toEqual([4, 4, 8, 8]);
  const surface = await callout(page).boundingBox();
  expect(surface?.y).toBeGreaterThan(card.y + card.height + 4);
  expect(surface?.y).toBeLessThan(card.y + card.height + 40);
  expect(Math.abs((surface?.x ?? 0) - card.x)).toBeLessThanOrEqual(1);
});

test('Tab leaves the callout of a step whose anchor cannot take focus, and the callout stays', async ({
  page,
}) => {
  await start(page, 'card-anchor');
  await callout(page).getByRole('button', {name: 'Next'}).focus();
  await page.keyboard.press('Tab');
  await expect
    .poll(async () =>
      callout(page).evaluate(node => node.contains(document.activeElement)),
    )
    .toBe(false);
  await expect(callout(page)).toBeVisible();
  await expect(state(page)).toContainText('active: revenue; ended: none');
  // The callout comes before the card, so before the first control in it.
  await expect(page.getByRole('button', {name: 'Refresh'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(callout(page).getByRole('button', {name: 'Next'})).toBeFocused();
  await page.getByRole('button', {name: 'Start tour'}).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Close tour'})).toBeFocused();
});

// Chromium and WebKit place an anchored layer from its anchor's box after
// transforms. A press does not scale a control that a shown step points at,
// so the callout and the ring stay in place.
test('a held press on an anchor that scales leaves the callout and the ring in place', async ({
  page,
}) => {
  await start(page, 'card-anchor');
  await callout(page).getByRole('button', {name: 'Next'}).click();
  await expect(callout(page)).toHaveAccessibleName('Refresh it');
  const refresh = await box(page, 'Refresh');
  const before = {
    callout: await callout(page).boundingBox(),
    ring: await ring(page).boundingBox(),
  };
  await page.mouse.move(
    refresh.x + refresh.width / 2,
    refresh.y + refresh.height / 2,
  );
  await page.mouse.down();
  // Long enough for the press scale to finish.
  await page.waitForTimeout(400);
  const held = {
    callout: await callout(page).boundingBox(),
    ring: await ring(page).boundingBox(),
  };
  await page.mouse.up();
  for (const part of ['callout', 'ring'] as const) {
    const was = before[part];
    const now = held[part];
    if (was == null || now == null) {
      throw new Error(`No box for the ${part}`);
    }
    expect(Math.abs(now.x - was.x)).toBeLessThan(0.05);
    expect(Math.abs(now.y - was.y)).toBeLessThan(0.05);
    expect(Math.abs(now.width - was.width)).toBeLessThan(0.05);
    expect(Math.abs(now.height - was.height)).toBeLessThan(0.05);
  }
  await expect(state(page)).toContainText('refreshes: 1');
  await expect(callout(page)).toBeVisible();
});

test('under a coarse pointer the close control has a touch target 44 pixels high', async ({
  page,
}) => {
  await start(page, 'card-anchor');
  const close = callout(page).getByRole('button', {name: 'Close tour'});
  await expect(close).toBeVisible();
  const isCoarse = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!isCoarse, 'the hit area grows only under a coarse pointer');
  // A point 21 pixels above the button's center is inside a 44-pixel target
  // and outside the 28-pixel button.
  const hitsClose = await close.evaluate(button => {
    const bounds = button.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2 - 21;
    return document.elementFromPoint(x, y)?.closest('button') === button;
  });
  expect(hitsClose).toBe(true);
});

async function openPlacement(page: Page, args: string) {
  // Wide enough for a callout beside the anchor.
  await page.setViewportSize({width: 1000, height: 714});
  await openStory(page, storybook(), 'lab-tour--placement');
  await page.goto(`${page.url()}&args=${args}`);
  await expect(callout(page)).toBeVisible();
  const anchor = await box(page, 'Target');
  const surface = await callout(page).boundingBox();
  if (surface == null) {
    throw new Error('No box for the callout');
  }
  return {anchor, surface};
}

for (const placement of ['below', 'above', 'start', 'end'] as const) {
  test(`with placement ${placement} the callout sits on that side of the anchor, clear of the ring`, async ({
    page,
  }) => {
    const {anchor, surface} = await openPlacement(
      page,
      `placement:${placement};alignment:center`,
    );
    const gaps = {
      below: surface.y - (anchor.y + anchor.height),
      above: anchor.y - (surface.y + surface.height),
      start: anchor.x - (surface.x + surface.width),
      end: surface.x - (anchor.x + anchor.width),
    };
    expect(gaps[placement]).toBeGreaterThan(4);
    expect(gaps[placement]).toBeLessThan(40);
  });
}

for (const alignment of ['start', 'center', 'end'] as const) {
  test(`with alignment ${alignment} a callout below the anchor lines up with that part of it`, async ({
    page,
  }) => {
    const {anchor, surface} = await openPlacement(
      page,
      `placement:below;alignment:${alignment}`,
    );
    const offsets = {
      start: surface.x - anchor.x,
      center: surface.x + surface.width / 2 - (anchor.x + anchor.width / 2),
      end: surface.x + surface.width - (anchor.x + anchor.width),
    };
    expect(Math.abs(offsets[alignment])).toBeLessThanOrEqual(1);
  });
}

// A step puts one empty element in the page, before the tab stop through
// which the person reaches the anchor. It must not change a first-child
// rule, a roving tab stop, or the size of any box around the anchor.
const SIBLING_STEPS: ReadonlyArray<
  [step: string, before: string, after: string]
> = [
  ['group-first', 'Start tour', 'Copy'],
  ['group-middle', 'Start tour', 'Copy'],
  ['group-last', 'Start tour', 'Copy'],
  ['toolbar-first', 'Copy', 'Back'],
  ['input-first', 'Back', 'Query'],
  ['input-second', 'Go', 'Amount'],
  ['tab-first', 'Amount', 'Home'],
  ['tab-second', 'Amount', 'Home'],
  ['item-first', 'Home', 'After the tour'],
  ['item-second', 'Home', 'After the tour'],
  ['cell-first', 'Home', 'After the tour'],
  ['cell-second', 'Home', 'After the tour'],
];

test('a step changes no box around its anchor, and its callout comes before the tab stop that reaches the anchor', async ({
  page,
}) => {
  await openStory(page, storybook(), 'lab-tour--anchors-among-siblings');
  await expect(page.getByRole('button', {name: 'Start tour'})).toBeVisible();
  const emptyTabStops = async () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('span[tabindex]:empty')].filter(
          span => span.closest('[role="dialog"]') == null,
        ).length,
    );
  // Every box, border, corner, spacing and color under the story's root.
  // Layers are left out: a keyboard hint shows while focus is in a toolbar.
  const boxes = async () =>
    page.getByTestId('siblings').evaluate(root =>
      [...root.querySelectorAll('*')]
        .filter(
          element =>
            !element.matches('span[tabindex]:empty') &&
            element.closest('[popover]') == null,
        )
        .map(element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return [
            element.tagName,
            rect.x.toFixed(1),
            rect.y.toFixed(1),
            rect.width.toFixed(1),
            rect.height.toFixed(1),
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomLeftRadius,
            style.borderBottomRightRadius,
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
            style.margin,
            style.padding,
            style.backgroundColor,
            style.color,
          ].join(' ');
        }),
    );
  const stop = (name: string) => {
    if (name === 'Start tour' || name === 'After the tour') {
      return page.getByRole('button', {name, exact: true});
    }
    const root = page.getByTestId('siblings');
    if (name === 'Query' || name === 'Amount') {
      return root.getByRole('textbox', {name});
    }
    return name === 'Home'
      ? root.locator('[data-tab-value="home"]')
      : root.getByRole('button', {name, exact: true});
  };
  const stopsBefore = await emptyTabStops();
  const boxesBefore = await boxes();

  await page.getByRole('button', {name: 'Start tour'}).click();
  for (const [step, before, after] of SIBLING_STEPS) {
    await expect(callout(page)).toHaveAccessibleName(step);
    await expect.poll(emptyTabStops).toBe(stopsBefore + 1);
    expect(await boxes(), step).toEqual(boxesBefore);

    await callout(page).getByRole('button', {name: 'Close tour'}).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(stop(before), `before ${step}`).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      callout(page).getByRole('button', {name: 'Close tour'}),
    ).toBeFocused();
    const last = callout(page).getByRole('button', {name: /^(Next|Done)$/});
    await last.focus();
    await page.keyboard.press('Tab');
    await expect(stop(after), `after ${step}`).toBeFocused();
    await last.click();
  }
  await expect(callout(page)).toHaveCount(0);
  expect(await emptyTabStops()).toBe(stopsBefore);
  expect(await boxes()).toEqual(boxesBefore);
});
