// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(MultiSelector|InputGroup)/|apps/storybook/stories/MultiSelector\.stories)

/**
 * @file MultiSelectorTextSize.a11y.browser.spec.ts
 * @input The built Storybook's MultiSelector stories in Chromium and WebKit
 * @output Real-browser proof that the trigger holds its size token at the
 *   theme's text size, grows with a larger set text size instead of clipping
 *   its value, keeps the token when badges wrap in a narrow field and on a
 *   phone with a coarse pointer, and takes an InputGroup's row
 * @position Ongoing browser check for component:MultiSelector FR13 and
 *   spec:AST-102 FR4; jsdom computes no layout
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

async function open(page: Page, story: string, rootFontSize?: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-multiselector--${story}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await page
    .locator('#storybook-root .astryx-multi-selector')
    .first()
    .waitFor();
  if (rootFontSize != null) {
    // The person's set text size reaches the page as the root font size.
    await page.evaluate(size => {
      document.documentElement.style.fontSize = size;
    }, rootFontSize);
  }
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

/** Each trigger's control box, its size token, and whether content overflows it. */
async function readTriggers(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.astryx-multi-selector')].map(
      control => {
        const size = control.getAttribute('data-size') ?? 'md';
        const probe = document.createElement('div');
        probe.style.height = `var(--size-element-${size})`;
        probe.style.position = 'absolute';
        control.append(probe);
        const token = probe.getBoundingClientRect().height;
        probe.remove();
        return {
          size,
          grouped: control.closest('.astryx-input-group') != null,
          height:
            Math.round(control.getBoundingClientRect().height * 100) / 100,
          token,
          // Content taller than the control box overflows it.
          clipped: control.scrollHeight > control.clientHeight + 1,
        };
      },
    ),
  );
}

test('at the theme text size each trigger is exactly its size token', async ({
  page,
}) => {
  await open(page, 'sizes');
  const triggers = await readTriggers(page);
  expect(triggers.length).toBeGreaterThanOrEqual(3);
  for (const trigger of triggers) {
    expect(trigger.height).toBe(trigger.token);
  }
});

test('at 200% text size the trigger grows past its token and does not clip its value', async ({
  page,
}) => {
  await open(page, 'sizes', '200%');
  const triggers = await readTriggers(page);
  expect(triggers.length).toBeGreaterThanOrEqual(3);
  for (const trigger of triggers) {
    expect(trigger.height).toBeGreaterThan(trigger.token);
    expect(trigger.clipped).toBe(false);
  }
});

test('inside an InputGroup a secondary trigger takes the group row at both text sizes', async ({
  page,
}) => {
  for (const rootFontSize of [undefined, '200%']) {
    await open(page, 'secondary-in-input-group', rootFontSize);
    const row = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.astryx-multi-selector')]
        .filter(control => control.closest('.astryx-input-group') != null)
        .map(control => ({
          control: control.getBoundingClientRect().height,
          group: (
            control.closest('.astryx-input-group') as HTMLElement
          ).getBoundingClientRect().height,
        })),
    );
    expect(row.length).toBeGreaterThan(0);
    for (const {control, group} of row) {
      expect(Math.abs(control - group)).toBeLessThanOrEqual(2);
    }
  }
});

test('in a narrow field, badges that wrap keep the trigger at its token at the theme text size', async ({
  page,
}) => {
  await open(page, 'trigger-modes');
  const badges = page.getByRole('combobox', {name: 'Badges'});
  const read = await badges.evaluate(el => {
    const control = el.closest<HTMLElement>('.astryx-multi-selector');
    if (control == null) {
      throw new Error('no control box');
    }
    // Narrow the field so its badges wrap onto a second row.
    const field = control.closest<HTMLElement>('.astryx-field') ?? control;
    field.style.width = '150px';
    const size = control.getAttribute('data-size') ?? 'md';
    const probe = document.createElement('div');
    probe.style.height = `var(--size-element-${size})`;
    probe.style.position = 'absolute';
    control.append(probe);
    const token = probe.getBoundingClientRect().height;
    probe.remove();
    const rows = new Set(
      [...control.querySelectorAll<HTMLElement>('.astryx-badge')].map(badge =>
        Math.round(badge.getBoundingClientRect().top),
      ),
    );
    return {
      height: control.getBoundingClientRect().height,
      token,
      rows: rows.size,
    };
  });
  expect(read.rows).toBeGreaterThan(1);
  expect(read.height).toBe(read.token);
});

test.describe('on a phone with a coarse pointer', () => {
  test.use({viewport: {width: 390, height: 844}, hasTouch: true});

  test('each trigger is still exactly its size token at the theme text size', async ({
    page,
  }) => {
    await open(page, 'sizes');
    const triggers = await readTriggers(page);
    expect(triggers.length).toBeGreaterThanOrEqual(3);
    for (const trigger of triggers) {
      expect(trigger.height).toBe(trigger.token);
    }
  });
});
