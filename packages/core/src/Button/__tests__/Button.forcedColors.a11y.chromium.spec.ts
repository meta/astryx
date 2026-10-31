// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.forcedColors.a11y.chromium.spec.ts
 * @input Uses @playwright/test, the static Storybook server, and the checked-in
 *   `core-button--all-variants` story, in real Chromium with `forcedColors`
 *   emulated
 * @output Computed-border evidence that a solid Button keeps a visible edge
 *   when the platform removes its fill
 * @position The half of the forced-colors contract jsdom cannot honestly reach:
 *   jsdom has no `forced-colors` media feature, so only a browser can say what
 *   border a Button computes there. WCAG 1.4.11 (non-text contrast).
 *
 * `primary`, `secondary` and `destructive` are drawn as a fill with no border.
 * Forced colors discards the fill, so without a border the button is plain
 * text with no perceivable boundary. `ghost` is flat by design and is checked
 * only for staying that way.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY_ID = 'core-button--all-variants';
const SOLID_VARIANTS = ['primary', 'secondary', 'destructive'] as const;

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

interface Edge {
  readonly width: number;
  readonly style: string;
}

/** The computed border of every side of the first button of a variant. */
async function bordersOf(
  page: Page,
  variant: string,
): Promise<Record<'top' | 'right' | 'bottom' | 'left', Edge>> {
  return page
    .locator(`#storybook-root .astryx-button[data-variant="${variant}"]`)
    .first()
    .evaluate(element => {
      const computed = getComputedStyle(element);
      const edge = (side: 'Top' | 'Right' | 'Bottom' | 'Left') => ({
        width: parseFloat(computed.getPropertyValue(`border-${side}-width`)),
        style: computed.getPropertyValue(`border-${side}-style`),
      });
      return {
        top: edge('Top'),
        right: edge('Right'),
        bottom: edge('Bottom'),
        left: edge('Left'),
      };
    });
}

async function mount(
  page: Page,
  forcedColors: 'active' | 'none',
): Promise<void> {
  await page.emulateMedia({forcedColors});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await page
    .locator('#storybook-root .astryx-button')
    .first()
    .waitFor({state: 'attached'});
  // The emulation is only evidence if the page really is in forced colors.
  expect(
    await page.evaluate(() => matchMedia('(forced-colors: active)').matches),
  ).toBe(forcedColors === 'active');
}

test.describe('Button in forced colors', () => {
  for (const variant of SOLID_VARIANTS) {
    test(`${variant} keeps a visible border on every side`, async ({page}) => {
      await mount(page, 'active');
      const borders = await bordersOf(page, variant);
      for (const [side, edge] of Object.entries(borders)) {
        expect(edge.style, `${variant} ${side} border style`).not.toBe('none');
        expect(edge.style, `${variant} ${side} border style`).not.toBe(
          'hidden',
        );
        expect(
          edge.width,
          `${variant} ${side} border width`,
        ).toBeGreaterThanOrEqual(1);
      }
    });
  }

  test('ghost stays borderless', async ({page}) => {
    await mount(page, 'active');
    const borders = await bordersOf(page, 'ghost');
    for (const edge of Object.values(borders)) {
      expect(edge.width).toBe(0);
    }
  });
});

test.describe('Button outside forced colors', () => {
  for (const variant of [...SOLID_VARIANTS, 'ghost']) {
    test(`${variant} gains no border`, async ({page}) => {
      await mount(page, 'none');
      const borders = await bordersOf(page, variant);
      for (const edge of Object.values(borders)) {
        expect(edge.width).toBe(0);
      }
    });
  }
});
