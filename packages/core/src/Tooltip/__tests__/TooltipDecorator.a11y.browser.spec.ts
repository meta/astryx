// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipDecorator.a11y.browser.spec.ts
 * @input A built Storybook and the real Lexical decorator fixture.
 * @output Tooltips survive editor mutation reconciliation and unmount cleanly.
 * @position Browser-only regression for corrective layer portals in editors.
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

for (const direction of ['ltr', 'rtl']) {
  test(`selected decorator controls keep their tooltips and unmount cleanly (${direction})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-tooltip--decorator-selection&viewMode=story&globals=direction:${direction}`,
    );
    const image = page.getByRole('img', {name: 'Selectable landscape'});
    const smaller = page.getByRole('button', {name: 'Smaller', exact: true});
    const text = page.getByText('Click this text to deselect the image.', {
      exact: true,
    });

    for (let cycle = 0; cycle < 2; cycle++) {
      await image.click();
      await expect(smaller).toBeVisible();
      await smaller.hover();
      await expect(
        page.getByRole('tooltip', {name: 'Narrow it'}),
      ).toBeVisible();
      await text.click();
      await expect(smaller).toHaveCount(0);
      await expect(page.getByRole('tooltip', {name: 'Narrow it'})).toHaveCount(
        0,
      );
      await expect(image).toBeVisible();
      expect(errors).toEqual([]);
    }

    await image.click();
    await smaller.hover();
    await expect(page.getByRole('tooltip', {name: 'Narrow it'})).toBeVisible();
    await page.getByRole('button', {name: 'Toggle editor'}).click();
    await expect(image).toHaveCount(0);
    await expect(page.getByRole('tooltip', {name: 'Narrow it'})).toHaveCount(0);
    await page.getByRole('button', {name: 'Outside control'}).hover();
    await expect(
      page.getByRole('tooltip', {name: 'Outside the editor'}),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('read-only editor controls keep their tooltip and release it on unmount', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--decorator-read-only&viewMode=story`,
  );
  await expect(
    page.getByRole('textbox', {name: 'Image editor'}),
  ).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('img', {name: 'Selectable landscape'}).click();
  await page.getByRole('button', {name: 'Smaller', exact: true}).hover();
  await expect(page.getByRole('tooltip', {name: 'Narrow it'})).toBeVisible();
  await page.getByRole('button', {name: 'Toggle editor'}).click();
  await expect(page.getByRole('textbox', {name: 'Image editor'})).toHaveCount(
    0,
  );
  await expect(page.getByRole('tooltip', {name: 'Narrow it'})).toHaveCount(0);
  expect(errors).toEqual([]);
});
