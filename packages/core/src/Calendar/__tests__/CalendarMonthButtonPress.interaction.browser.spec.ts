// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CalendarMonthButtonPress.interaction.browser.spec.ts
 * @input The built default Calendar story in a real browser
 * @output Proof that a held mouse press scales a month button with full
 *   motion and leaves it unscaled under reduced motion
 * @position Interaction evidence for the Calendar month buttons' press in
 *   packages/core/src/Calendar
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`a held press on a month button ${motion === 'reduce' ? 'does not scale it under reduced motion' : 'scales it'}`, async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: motion});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-calendar--default&viewMode=story`,
    );
    const next = page.getByRole('button', {name: 'Next month'});
    await next.waitFor();
    const box = await next.boundingBox();
    if (box == null) {
      throw new Error('no Next month button');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Let the press transition run to its end.
    await page.waitForTimeout(400);
    const transform = await next.evaluate(
      button => getComputedStyle(button).transform,
    );
    await page.mouse.up();
    if (motion === 'reduce') {
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
    } else {
      expect(transform).not.toBe('none');
      expect(transform).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
    }
  });
}
