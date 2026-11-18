// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input Built Storybook with real RichTextEditor and Lexical image decorators.
 * @output Repeated decorator deselection and editor teardown remain error-free.
 * @position Browser E2E regression for renderer-owned corrective portals.
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
for (const isReadOnly of [false, true]) {
  for (const direction of ['ltr', 'rtl']) {
    test(`RichTextEditor decorator lifecycle (${direction}, read-only=${isReadOnly})`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      const story = isReadOnly ? 'integrated-read-only' : 'integrated-editor';
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-tooltip--${story}&viewMode=story&globals=direction:${direction}`,
      );
      const editor = page.getByRole('textbox', {name: 'Image editor'});
      await expect(editor).toHaveAttribute(
        'contenteditable',
        String(!isReadOnly),
      );
      const image = page.getByRole('img', {name: 'Selectable landscape'});
      const trigger = page.getByRole('button', {name: 'Smaller', exact: true});
      const tooltip = page.getByRole('tooltip', {name: 'Narrow it'});
      let tooltipId: string;
      const expectTooltipRemoved = async () => {
        await expect(tooltip).toHaveCount(0);
        await expect
          .poll(async () =>
            page.evaluate(
              id => document.getElementById(id) === null,
              tooltipId,
            ),
          )
          .toBe(true);
      };
      const showTooltip = async () => {
        await image.click();
        await trigger.hover();
        await expect(tooltip).toBeVisible();
        tooltipId = (await tooltip.getAttribute('id')) ?? '';
        expect(tooltipId).not.toBe('');
        expect(
          await trigger.evaluate(element => {
            const id = element.getAttribute('aria-describedby');
            const popup = id && document.getElementById(id);
            return (
              !!popup &&
              !document.querySelector('[data-lexical-editor]')?.contains(popup)
            );
          }),
        ).toBe(true);
      };
      await showTooltip();
      await testInfo.attach('selected', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      if (!isReadOnly) {
        for (let cycle = 0; cycle < 3; cycle++) {
          await page
            .getByText('Click this text to deselect the image.', {exact: true})
            .click();
          await expect(trigger).toHaveCount(0);
          await expectTooltipRemoved();
          await expect(image).toBeVisible();
          expect(errors).toEqual([]);
          await showTooltip();
        }
      }
      await page.getByRole('button', {name: 'Toggle editor'}).click();
      await expect(editor).toHaveCount(0);
      await expect(image).toHaveCount(0);
      await expectTooltipRemoved();
      await testInfo.attach('unmounted', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.getByRole('button', {name: 'Outside control'}).hover();
      await expect(
        page.getByRole('tooltip', {name: 'Outside the editor'}),
      ).toBeVisible();
      expect(errors).toEqual([]);
      await testInfo.attach('console-errors', {
        body: JSON.stringify(errors),
        contentType: 'application/json',
      });
    });
  }
}
