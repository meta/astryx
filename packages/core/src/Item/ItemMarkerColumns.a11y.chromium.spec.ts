// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Item core/List core/Markdown core/DropdownMenu ^apps/storybook/stories/Item

/**
 * @file ItemMarkerColumns.a11y.chromium.spec.ts
 * @input Built Item marker anatomy, mixed task, and selectable menu stories
 * @output Minimal DOM counts and unchanged row pixels at rest/open, fine/coarse
 * @position Item/List browser regression; receipts and captures stay in test outputs
 */

import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {basename, join} from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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
test.afterAll(async () => storybook?.close());

async function open(page: Page, story: string, dir: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=direction:${dir};colorMode:light;astryxTheme:neutral`,
  );
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
}

async function capture(
  page: Page,
  selector: string,
  name: string,
  file: string,
) {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const geometry = await target.evaluate(root => {
    const origin = root.getBoundingClientRect();
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x - origin.x,
        y: box.y - origin.y,
        width: box.width,
        height: box.height,
      };
    };
    return {
      bodyElements: document.body.querySelectorAll('*').length,
      componentElements: root.querySelectorAll('*').length,
      rows: Array.from(root.querySelectorAll('.astryx-item')).map(row => ({
        case:
          row.closest('[data-marker-case]')?.getAttribute('data-marker-case') ??
          row.getAttribute('role') ??
          'task',
        children: row.children.length,
        elements: row.querySelectorAll('*').length,
        rect: rect(row),
        slots: Array.from(
          row.querySelectorAll(
            '[data-anatomy-slot], input, [role="checkbox"], [role="radio"]',
          ),
        ).map(slot => ({
          name:
            slot.getAttribute('data-anatomy-slot') ??
            slot.getAttribute('role') ??
            slot.tagName,
          rect: rect(slot),
        })),
        startIsDirect:
          row.querySelector('[data-anatomy-slot="start"]')?.parentElement
            ?.parentElement === row,
      })),
    };
  });
  const image = await target.screenshot({path: file});
  return {
    name,
    ...geometry,
    pixelSha256: createHash('sha256').update(image).digest('hex'),
  };
}

for (const pointer of ['fine', 'coarse'] as const) {
  for (const dir of ['ltr', 'rtl'] as const) {
    test(`numbered marker scope preserves row pixels (${pointer}, ${dir})`, async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({
        viewport: {width: 1280, height: 900},
        hasTouch: pointer === 'coarse',
      });
      const page = await context.newPage();
      try {
        const states: Awaited<ReturnType<typeof capture>>[] = [];
        await open(page, 'core-item--marker-anatomy', dir);
        expect(
          await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
        ).toBe(pointer === 'coarse');
        const fixture = '[data-marker-anatomy]';
        states.push(
          await capture(
            page,
            fixture,
            'anatomy-rest',
            testInfo.outputPath('anatomy-rest.png'),
          ),
        );
        await page.getByRole('button', {name: 'Toggle marker menu'}).click();
        await expect(page.getByRole('menuitem')).toBeVisible();
        await page.mouse.move(1200, 850);
        states.push(
          await capture(
            page,
            fixture,
            'anatomy-open',
            testInfo.outputPath('anatomy-open.png'),
          ),
        );

        await open(page, 'a11y-menu--dropdown-selectable', dir);
        states.push(
          await capture(
            page,
            '[data-a11y-activations]',
            'menu-rest',
            testInfo.outputPath('menu-rest.png'),
          ),
        );
        await page.getByRole('button', {name: 'View', exact: true}).click();
        await expect(page.getByRole('menuitemcheckbox')).toBeVisible();
        await expect(page.getByRole('menuitemradio')).toHaveCount(2);
        await page.mouse.move(1200, 850);
        states.push(
          await capture(
            page,
            '[role="menu"]',
            'menu-open',
            testInfo.outputPath('menu-open.png'),
          ),
        );

        await open(page, 'richtext-richtexteditor--markdown-parity', dir);
        const task =
          '[data-parity-surface="markdown"] [data-parity-block="list-task-mixed"]';
        states.push(
          await capture(
            page,
            task,
            'mixed-task',
            testInfo.outputPath('mixed-task.png'),
          ),
        );
        await writeFile(
          testInfo.outputPath('receipt.json'),
          JSON.stringify({pointer, dir, states}, null, 2),
        );

        for (const state of states.filter(state =>
          state.name.startsWith('anatomy'),
        )) {
          for (const row of state.rows) {
            expect(row.children, row.case).toBe(
              row.case === 'numbered'
                ? 2
                : row.case === 'unmarked-item'
                  ? 3
                  : 4,
            );
            expect(row.startIsDirect, row.case).toBe(row.case !== 'numbered');
          }
        }
        // Before/after pixels are compared only when the retained local receipt
        // is supplied. CI keeps the structural proof and emits its own receipt.
        const before = process.env.ASTRYX_MARKER_ANATOMY_BEFORE;
        if (before != null) {
          const prior = JSON.parse(
            await readFile(
              join(before, basename(testInfo.outputDir), 'receipt.json'),
              'utf8',
            ),
          ) as {states: typeof states};
          for (const state of states) {
            const previous = prior.states.find(
              value => value.name === state.name,
            );
            expect(previous, state.name).toBeDefined();
            expect(state.pixelSha256, `${state.name}: unchanged pixels`).toBe(
              previous?.pixelSha256,
            );
            expect(
              state.rows.map(row => row.rect),
              `${state.name}: unchanged geometry`,
            ).toEqual(previous?.rows.map(row => row.rect));
          }
        }
      } finally {
        await context.close();
      }
    });
  }
}
