// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavigationStackHidden.interaction.browser.spec.ts
 * @input The built Storybook's NavigationStack spec demos, with real touch
 *   input in Chromium and WebKit on the phone profile
 * @output Proof that a retained screen takes no input, whatever its place in
 *   the DOM, and that after a re-push the screen on view's controls act on
 *   its own state while focus stays in it
 * @position High-fidelity lane for NavigationStack's draft record (FR4, FR9).
 *   Hit testing and focus need a real engine; jsdom has neither
 *
 * SYNC: The stories this reads are HiddenScreensTakeNoInput and
 *   RetainedScreens in apps/storybook/stories/NavigationStackSpecDemos.stories.tsx.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const card = (page: Page, key: string) =>
  page.locator(`[data-navigation-screen="${key}"]`);

/** Taps a row and waits for its screen to come to rest on top. */
async function open(page: Page, chat: string) {
  await page.getByRole('button', {name: chat, exact: true}).first().tap();
  await expect(card(page, `screen-${chat}`)).toHaveAttribute(
    'data-navigation-screen-state',
    'top',
  );
  await expect(card(page, `screen-${chat}`)).toHaveAttribute(
    'data-navigation-top',
  );
}

/** Taps Back and waits for the pop to end and the screen to be retained. */
async function back(page: Page, chat: string) {
  await page.locator('[data-navigation-back]').tap();
  await expect(card(page, `screen-${chat}`)).toHaveAttribute(
    'data-navigation-screen-state',
    'hidden',
  );
}

test('a retained screen after the screen on view in the DOM takes no tap, key or hit test', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'lab-navigationstack-spec-demos--hidden-screens-take-no-input',
  );
  await open(page, 'Chat 1');
  await back(page, 'Chat 1');

  // The retained screen comes after the root in the DOM.
  const after = await page.evaluate(() => {
    const root = document.querySelector('[data-navigation-screen="root"]');
    const kept = document.querySelector(
      '[data-navigation-screen="screen-Chat 1"]',
    );
    return root != null && kept != null
      ? Boolean(
          root.compareDocumentPosition(kept) & Node.DOCUMENT_POSITION_FOLLOWING,
        )
      : null;
  });
  expect(after).toBe(true);

  // A hit test over the root's probe names the root.
  const probe = card(page, 'root').locator('[data-hit-probe]');
  const box = await probe.boundingBox();
  if (box == null) {
    throw new Error('The probe has no box');
  }
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const hit = await page.evaluate(
    ([px, py]) =>
      document
        .elementFromPoint(px, py)
        ?.closest('[data-navigation-screen]')
        ?.getAttribute('data-navigation-screen') ?? null,
    [x, y] as const,
  );
  expect(hit).toBe('root');

  // A tap over it reaches the root, and the retained screen counts none.
  await page.touchscreen.tap(x, y);
  await expect(card(page, 'root').locator('[data-clicks]')).toHaveText('1');
  await expect(card(page, 'screen-Chat 1').locator('[data-clicks]')).toHaveText(
    '0',
  );

  // Tab never lands in the retained screen.
  for (let press = 0; press < 6; press++) {
    await page.keyboard.press('Tab');
    const inKept = await page.evaluate(
      () =>
        document.activeElement?.closest(
          '[data-navigation-screen="screen-Chat 1"]',
        ) != null,
    );
    expect(inKept).toBe(false);
  }
});

test('a finger scrolling over the screen on view scrolls it, with a retained screen after it in the DOM', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'native scrolling from injected touches is Chromium-only (harness README)',
  );
  await openStory(
    page,
    storybook(),
    'lab-navigationstack-spec-demos--hidden-screens-take-no-input',
  );
  await open(page, 'Chat 1');
  await back(page, 'Chat 1');
  const probe = card(page, 'root').locator('[data-hit-probe]');
  const box = await probe.boundingBox();
  if (box == null) {
    throw new Error('The probe has no box');
  }
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const scrolled = (key: string) =>
    page.evaluate(
      selector => document.querySelector(selector)?.scrollTop ?? 0,
      `[data-navigation-screen="${key}"] > div`,
    );
  const before = await scrolled('root');
  const keptBefore = await scrolled('screen-Chat 1');
  const driver = await touchDriver(page);
  await driver.play(drag({x, y: y + 120}, {x, y: y - 120}, {durationMs: 300}), {
    pacing: 'spacing',
  });
  await expect.poll(() => scrolled('root')).toBeGreaterThan(before);
  expect(await scrolled('screen-Chat 1')).toBe(keptBefore);
});

test('after a re-push, the screen on view’s controls act on its own state, and focus stays in it', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'lab-navigationstack-spec-demos--retained-screens',
  );
  await open(page, 'Chat 1');
  await back(page, 'Chat 1');
  await open(page, 'Chat 2');
  await back(page, 'Chat 2');
  await open(page, 'Chat 1');

  const chat1 = card(page, 'screen-Chat 1');
  const draft = chat1.getByRole('textbox', {name: 'Draft for Chat 1'});
  await draft.tap();
  await page.keyboard.type('follow-up');
  await chat1.getByRole('button', {name: 'Send'}).tap();

  await expect(chat1.getByRole('list', {name: 'Sent in Chat 1'})).toHaveText(
    'follow-up',
  );
  await expect(
    card(page, 'screen-Chat 2').locator('[data-sent] li'),
  ).toHaveCount(0);
  const focusIn = await page.evaluate(
    () =>
      document.activeElement
        ?.closest('[data-navigation-screen]')
        ?.getAttribute('data-navigation-screen') ?? null,
  );
  expect(focusIn).toBe('screen-Chat 1');
});
