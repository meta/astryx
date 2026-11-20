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
 * only for staying that way. In a connected ButtonGroup the buttons keep the
 * group's 1px dividers in both modes, and in forced colors they also close the
 * group's outer edge, with no doubled seam.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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
        expect(edge.style).toBe('none');
      }
    });
  }
});

type Side = 'top' | 'right' | 'bottom' | 'left';

/** The computed border width of every side of every button in a group. */
async function groupBorders(
  page: Page,
  storyId: string,
  forcedColors: 'active' | 'none',
): Promise<ReadonlyArray<Record<Side, number>>> {
  await page.emulateMedia({forcedColors});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
    {
      waitUntil: 'load',
    },
  );
  const buttons = page.locator('#storybook-root [role="group"] .astryx-button');
  await buttons.first().waitFor({state: 'attached'});
  expect(
    await page.evaluate(() => matchMedia('(forced-colors: active)').matches),
  ).toBe(forcedColors === 'active');
  return buttons.evaluateAll(elements =>
    elements.map(element => {
      const computed = getComputedStyle(element);
      const width = (side: string) =>
        computed.getPropertyValue(`border-${side}-style`) === 'none'
          ? 0
          : parseFloat(computed.getPropertyValue(`border-${side}-width`));
      return {
        top: width('top'),
        right: width('right'),
        bottom: width('bottom'),
        left: width('left'),
      };
    }),
  );
}

const GROUPS = [
  {story: 'core-buttongroup--horizontal', orientation: 'horizontal'},
  {story: 'core-buttongroup--primary-variant', orientation: 'horizontal'},
  {story: 'core-buttongroup--vertical', orientation: 'vertical'},
] as const;

test.describe('Connected ButtonGroup', () => {
  for (const {story, orientation} of GROUPS) {
    // The seam side is the leading side of every button after the first.
    const [lead, trail, crossA, crossB]: ReadonlyArray<Side> =
      orientation === 'horizontal'
        ? ['left', 'right', 'top', 'bottom']
        : ['top', 'bottom', 'left', 'right'];

    test(`${story}: the dividers stay outside forced colors, with no outer edge`, async ({
      page,
    }) => {
      const borders = await groupBorders(page, story, 'none');
      expect(borders.length).toBeGreaterThan(1);
      borders.forEach((border, index) => {
        expect(border[lead], `button ${index} ${lead}`).toBe(
          index === 0 ? 0 : 1,
        );
        expect(border[trail], `button ${index} ${trail}`).toBe(0);
        expect(border[crossA], `button ${index} ${crossA}`).toBe(0);
        expect(border[crossB], `button ${index} ${crossB}`).toBe(0);
      });
    });

    test(`${story}: in forced colors the dividers stay and the group's outer edge closes, with no doubled seam`, async ({
      page,
    }) => {
      const borders = await groupBorders(page, story, 'active');
      const last = borders.length - 1;
      borders.forEach((border, index) => {
        expect(border[lead], `button ${index} ${lead}`).toBe(1);
        expect(border[trail], `button ${index} ${trail}`).toBe(
          index === last ? 1 : 0,
        );
        expect(border[crossA], `button ${index} ${crossA}`).toBe(1);
        expect(border[crossB], `button ${index} ${crossB}`).toBe(1);
      });
    });
  }
});
