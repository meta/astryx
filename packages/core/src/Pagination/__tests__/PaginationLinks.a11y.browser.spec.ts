// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Pagination/ ^apps/storybook/stories/Pagination

/**
 * @file PaginationLinks.a11y.browser.spec.ts
 * @input The `Core/Pagination` stories in a built Storybook: the compact
 *   variant with first and last buttons, the page link stories, and the page
 *   links of a client-side router that disables the control while it
 *   navigates. Driven by real keyboard and pointer input in Chromium and
 *   WebKit.
 * @output Real-engine proof that the browser follows the URL of the link
 *   that was activated, and that a Button control that becomes unavailable
 *   while it holds focus keeps that focus: a button stays the same element,
 *   and a page link's focus goes to the disabled button that replaces it and
 *   back to the link when the control is available again, with the ring after
 *   a key press and not after a pointer press
 *   (component:Pagination FR13, FR17, FR19; spec:AST-085 FR4).
 * @position Run with `pnpm test:a11y-contract`.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

async function openStory(page: Page, id: string): Promise<Locator> {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
  const landmark = page.getByRole('navigation', {name: 'Pagination'});
  await expect(landmark).toBeVisible();
  return landmark;
}

/** Focuses the control and activates it from the keyboard. */
async function pressEnterOn(page: Page, control: Locator): Promise<void> {
  await control.focus();
  await expect(control).toBeFocused();
  await page.keyboard.press('Enter');
}

/** The control holds focus, with the ring a key press calls for. */
async function expectKeyboardFocus(control: Locator): Promise<void> {
  await expect(control).toBeFocused();
  expect(await control.evaluate(node => node.matches(':focus-visible'))).toBe(
    true,
  );
  expect(
    await control.evaluate(node => node.ownerDocument.activeElement?.tagName),
  ).not.toBe('BODY');
}

test('the browser follows the URL of the Next or Previous link that was activated', async ({
  page,
}) => {
  const landmark = await openStory(page, 'core-pagination--page-links');
  const next = landmark.getByRole('link', {name: 'Go to next page'});
  await expect(next).toHaveAttribute('href', '#page-2');
  await pressEnterOn(page, next);
  await expect(page).toHaveURL(/#page-2$/);
  await expect(next).toHaveAttribute('href', '#page-3');

  await next.click();
  await expect(page).toHaveURL(/#page-3$/);
  await next.click();
  await expect(page).toHaveURL(/#page-4$/);

  const previous = landmark.getByRole('link', {name: 'Go to previous page'});
  await expect(previous).toHaveAttribute('href', '#page-3');
  await previous.click();
  await expect(page).toHaveURL(/#page-3$/);
  await pressEnterOn(page, previous);
  await expect(page).toHaveURL(/#page-2$/);
  await expect(
    landmark.getByRole('link', {name: 'Go to page 2', exact: true}),
  ).toHaveAttribute('aria-current', 'page');
});

test('a button control that reaches the last page keeps focus', async ({
  page,
}) => {
  const landmark = await openStory(
    page,
    'core-pagination--compact-variant-first-last',
  );
  const last = landmark.getByRole('button', {name: 'Go to last page'});
  await pressEnterOn(page, last);
  await expect(landmark.getByText('Page 10 of 10')).toBeVisible();
  await expect(last).toHaveAttribute('aria-disabled', 'true');
  await expectKeyboardFocus(last);

  // The control is in the tab order still: Shift+Tab leaves it for Next.
  await page.keyboard.press('Shift+Tab');
  await expect(
    landmark.getByRole('button', {name: 'Go to next page'}),
  ).toBeFocused();
});

test('a Next link that reaches the last page keeps focus on the button that replaces it', async ({
  page,
}) => {
  const landmark = await openStory(page, 'core-pagination--page-links-dots');
  const next = landmark.getByLabel('Go to next page');
  await next.focus();
  for (let target = 2; target <= 8; target += 1) {
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      landmark.getByRole('radio', {name: `Page ${target}`}),
    ).toBeChecked();
    await expect(page).toHaveURL(new RegExp(`#page-${target}$`));
  }
  const nextButton = landmark.getByRole('button', {name: 'Go to next page'});
  await expect(nextButton).toHaveAttribute('aria-disabled', 'true');
  await expectKeyboardFocus(nextButton);
  await expect(
    landmark.getByRole('link', {name: 'Go to next page'}),
  ).toHaveCount(0);
});

test('a Next link that a pointer click takes to the last page keeps focus without the ring', async ({
  page,
}) => {
  const landmark = await openStory(page, 'core-pagination--page-links-dots');
  const next = landmark.getByLabel('Go to next page');
  for (let target = 2; target <= 8; target += 1) {
    await next.click();
    await expect(page).toHaveURL(new RegExp(`#page-${target}$`));
  }
  const nextButton = landmark.getByRole('button', {name: 'Go to next page'});
  await expect(nextButton).toHaveAttribute('aria-disabled', 'true');
  await expect(nextButton).toBeFocused();
  expect(
    await nextButton.evaluate(node => node.matches(':focus-visible')),
  ).toBe(false);
});

test('a Previous link that reaches the first page keeps focus on the button that replaces it', async ({
  page,
}) => {
  const landmark = await openStory(page, 'core-pagination--page-links');
  await pressEnterOn(
    page,
    landmark.getByRole('link', {name: 'Go to page 2', exact: true}),
  );
  await expect(
    landmark.getByRole('link', {name: 'Go to page 2', exact: true}),
  ).toHaveAttribute('aria-current', 'page');

  await pressEnterOn(
    page,
    landmark.getByRole('link', {name: 'Go to previous page'}),
  );
  await expect(page).toHaveURL(/#page-1$/);
  const previousButton = landmark.getByRole('button', {
    name: 'Go to previous page',
  });
  await expect(previousButton).toHaveAttribute('aria-disabled', 'true');
  await expectKeyboardFocus(previousButton);
});

/**
 * Records which element holds focus after every change to the landmark, as
 * `TAG:name`. Returns a function that reads the records, with repeats
 * removed. The router finishes on a timer, so a check between its two
 * changes would race it; the records do not.
 */
async function recordFocusAfterEachChange(
  landmark: Locator,
): Promise<() => Promise<string[]>> {
  await landmark.evaluate(node => {
    const records: string[] = [];
    (window as unknown as {focusRecords: string[]}).focusRecords = records;
    new MutationObserver(() => {
      const active = node.ownerDocument.activeElement;
      const record = `${active?.tagName ?? 'NONE'}:${active?.getAttribute('aria-label') ?? ''}`;
      if (records.at(-1) !== record) {
        records.push(record);
      }
    }).observe(node, {subtree: true, childList: true, attributes: true});
  });
  return async () =>
    landmark.evaluate(
      () => (window as unknown as {focusRecords: string[]}).focusRecords,
    );
}

/**
 * After every change the control named `name` held the focus, and its last
 * elements were `lastTags` in that order.
 */
function expectFocusKept(
  records: string[],
  name: string,
  lastTags: string[],
): void {
  expect(records.filter(record => !record.endsWith(`:${name}`))).toEqual([]);
  expect(records.slice(-lastTags.length)).toEqual(
    lastTags.map(tag => `${tag}:${name}`),
  );
}

test.describe('page links of a client-side router that disables the control while it navigates', () => {
  const story = 'core-pagination--page-links-router';

  test('a Next link that reaches the last page keeps focus', async ({page}) => {
    const landmark = await openStory(page, story);
    const location = page.getByRole('status', {name: 'Location'});
    await expect(location).toHaveText('#/items/4');
    const focusRecords = await recordFocusAfterEachChange(landmark);
    await pressEnterOn(
      page,
      landmark.getByRole('link', {name: 'Go to next page'}),
    );
    await expect(location).toHaveText('#/items/5');

    const nextButton = landmark.getByRole('button', {name: 'Go to next page'});
    await expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    await expectKeyboardFocus(nextButton);
    // The other controls are links again.
    await expect(
      landmark.getByRole('link', {name: 'Go to previous page'}),
    ).toBeVisible();
    // Disabled while the router navigated, and unavailable after: the button
    // held the focus from the first change on.
    expectFocusKept(await focusRecords(), 'Go to next page', ['BUTTON']);
  });

  test('a Previous link keeps focus while it is a disabled button and when it is a link again', async ({
    page,
  }) => {
    const landmark = await openStory(page, story);
    const location = page.getByRole('status', {name: 'Location'});
    const focusRecords = await recordFocusAfterEachChange(landmark);
    await pressEnterOn(
      page,
      landmark.getByRole('link', {name: 'Go to previous page'}),
    );
    await expect(location).toHaveText('#/items/3');
    await expectKeyboardFocus(
      landmark.getByRole('link', {name: 'Go to previous page'}),
    );
    expectFocusKept(await focusRecords(), 'Go to previous page', [
      'BUTTON',
      'A',
    ]);
  });

  test('a page number link keeps focus while it is a disabled button and when it is a link again', async ({
    page,
  }) => {
    const landmark = await openStory(page, story);
    const location = page.getByRole('status', {name: 'Location'});
    const focusRecords = await recordFocusAfterEachChange(landmark);
    await pressEnterOn(
      page,
      landmark.getByRole('link', {name: 'Go to page 2', exact: true}),
    );
    await expect(location).toHaveText('#/items/2');
    const pageLink = landmark.getByRole('link', {
      name: 'Go to page 2',
      exact: true,
    });
    await expect(pageLink).toHaveAttribute('aria-current', 'page');
    await expectKeyboardFocus(pageLink);
    expectFocusKept(await focusRecords(), 'Go to page 2', ['BUTTON', 'A']);
  });

  test('a control that did not hold focus takes none', async ({page}) => {
    const landmark = await openStory(page, story);
    const location = page.getByRole('status', {name: 'Location'});
    const focusRecords = await recordFocusAfterEachChange(landmark);
    await pressEnterOn(
      page,
      landmark.getByRole('link', {name: 'Go to page 5', exact: true}),
    );
    await expect(location).toHaveText('#/items/5');
    // Next stopped being a link in the same changes. The focus stays on the
    // page link the key press was on.
    await expect(
      landmark.getByRole('button', {name: 'Go to next page'}),
    ).toHaveAttribute('aria-disabled', 'true');
    await expectKeyboardFocus(
      landmark.getByRole('link', {name: 'Go to page 5', exact: true}),
    );
    expectFocusKept(await focusRecords(), 'Go to page 5', ['BUTTON', 'A']);
  });
});
