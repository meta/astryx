// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListDividers.interaction.browser.spec.ts
 * @input The built List "Compact" story (dividers between pressable rows) in
 *   light and dark, real mouse and touch input, and the interaction harness
 * @output Proofs that a highlighted row keeps both of its dividers visible
 *   through its tint. The row is hovered or pressed by a mouse, or pressed
 *   by a finger under a coarse or a fine primary pointer. Each divider stands
 *   out from the tint beside it as it stands out from its row at rest.
 * @position Real-engine layer for List's dividers; the touch release is in
 *   ListRowPressPaths.interaction.browser.spec.ts
 */

// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from '@astryxdesign/a11y-spec/playwright';
import {
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-list--compact';
const SCHEMES = ['light', 'dark'] as const;
type Scheme = (typeof SCHEMES)[number];

/** How far a divider's contrast over the tint may drift from its rest. */
const CONTRAST_TOLERANCE = 0.05;

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The story at `scheme`, its three rows laid out. Rows are found inside the
 * story's root: Storybook's hidden error page has list items too.
 */
async function openList(page: Page, scheme: Scheme): Promise<void> {
  await page.goto(
    `${storybook()}/iframe.html?id=${STORY}&viewMode=story&globals=colorMode:${scheme}`,
  );
  await page
    .locator('#storybook-root li')
    .filter({hasText: 'Settings'})
    .first()
    .waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

const rowOf = (page: Page, label: string) =>
  page.locator('#storybook-root li').filter({hasText: label}).first();

/** The per-channel median of a one-CSS-pixel strip across the row's start. */
async function stripAt(page: Page, row: Locator, top: number): Promise<Rgb> {
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  const png = PNG.sync.read(
    await page.screenshot({
      clip: {x: box.x + 8, y: top, width: box.width / 2, height: 1},
    }),
  ) as {width: number; height: number; data: Uint8Array};
  const median = (offset: number) => {
    const values: number[] = [];
    for (let i = offset; i < png.data.length; i += 4) {
      values.push(png.data[i]);
    }
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return [median(0), median(1), median(2)];
}

/**
 * The two dividers of `row` and the surface beside each. They are the row
 * before's divider and `row`'s own, each one CSS pixel tall, and the strips
 * just inside `row`'s top and bottom edges.
 */
async function edgesOf(page: Page, above: Locator, row: Locator) {
  const box = await row.boundingBox();
  const width = await row.evaluate(el =>
    Number.parseFloat(getComputedStyle(el).borderBottomWidth),
  );
  if (box == null) {
    throw new Error('no row');
  }
  return {
    lineAbove: await stripAt(page, above, box.y - width),
    aboveInside: await stripAt(page, above, box.y - width - 3),
    insideTop: await stripAt(page, row, box.y + 2),
    insideBottom: await stripAt(page, row, box.y + box.height - width - 3),
    lineBelow: await stripAt(page, row, box.y + box.height - width),
  };
}

type Edges = Awaited<ReturnType<typeof edgesOf>>;

/** Each divider's contrast against the surface beside it. */
function contrasts(edges: Edges, beside: 'own row' | 'tint') {
  return {
    above: contrast(
      edges.lineAbove,
      beside === 'tint' ? edges.insideTop : edges.aboveInside,
    ),
    below: contrast(edges.lineBelow, edges.insideBottom),
  };
}

async function expectDividersDrawn(above: Locator, row: Locator) {
  for (const target of [above, row]) {
    const border = await target.evaluate(el => {
      const style = getComputedStyle(el);
      return {
        width: Number.parseFloat(style.borderBottomWidth),
        style: style.borderBottomStyle,
      };
    });
    expect(border.width).toBeGreaterThan(0);
    expect(border.style).toBe('solid');
  }
}

/**
 * Checks the highlighted row against the same row at rest. Its tint is
 * painted, and each divider stands out from the tint beside it as it stood
 * out from its row at rest.
 */
async function expectDividersThroughTint(
  page: Page,
  above: Locator,
  row: Locator,
  atRest: Edges,
  label: string,
) {
  await expectDividersDrawn(above, row);
  const highlighted = await edgesOf(page, above, row);
  const tintStep = Math.max(
    ...highlighted.insideTop.map((value, i) =>
      Math.abs(value - atRest.insideTop[i]),
    ),
  );
  expect(tintStep, `${label}: the tint is painted`).toBeGreaterThanOrEqual(3);
  const rest = contrasts(atRest, 'own row');
  const now = contrasts(highlighted, 'tint');
  for (const side of ['above', 'below'] as const) {
    expect(
      Math.abs(now[side] - rest[side]),
      `${label}: the divider ${side} reads ${now[side].toFixed(2)}:1 over the tint, ${rest[side].toFixed(2)}:1 at rest`,
    ).toBeLessThanOrEqual(CONTRAST_TOLERANCE);
  }
}

/** The same story with a mouse: the phone's viewport and scale, a fine pointer. */
async function withMouse<T>(
  browser: Browser,
  testInfo: TestInfo,
  run: (mousePage: Page) => Promise<T>,
): Promise<T> {
  const {viewport, deviceScaleFactor} = testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    hasTouch: false,
    isMobile: false,
  });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Longer than the hover tint's fade (the theme's fast duration). */
const SETTLE_MS = 400;

test.describe('a highlighted List row keeps both dividers visible through its tint', () => {
  for (const scheme of SCHEMES) {
    test(`${scheme}: hovered and pressed by a mouse`, async ({
      browser,
    }, testInfo) => {
      await withMouse(browser, testInfo, async page => {
        await openList(page, scheme);
        const above = rowOf(page, 'Notifications');
        const row = rowOf(page, 'Messages');
        const atRest = await edgesOf(page, above, row);
        const box = await row.boundingBox();
        if (box == null) {
          throw new Error('no row');
        }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(SETTLE_MS);
        await expectDividersThroughTint(page, above, row, atRest, 'hovered');
        await page.mouse.down();
        await page.waitForTimeout(SETTLE_MS);
        await expectDividersThroughTint(
          page,
          above,
          row,
          atRest,
          'mouse press',
        );
        await page.mouse.up();
      });
    });

    // A laptop's touch screen: no touch emulation, so the primary pointer
    // stays fine, and the touches arrive through CDP.
    test(`${scheme}: pressed by a finger where the primary pointer is fine`, async ({
      browser,
      browserName,
    }, testInfo) => {
      test.skip(
        browserName !== 'chromium',
        'a touch screen beside a fine primary pointer is emulated through CDP',
      );
      await withMouse(browser, testInfo, async page => {
        await openList(page, scheme);
        expect(
          await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
        ).toBe(false);
        const above = rowOf(page, 'Notifications');
        const row = rowOf(page, 'Messages');
        const atRest = await edgesOf(page, above, row);
        const box = await row.boundingBox();
        if (box == null) {
          throw new Error('no row');
        }
        const driver = await touchDriver(page);
        await driver.play(
          tap(
            {x: box.x + box.width / 2, y: box.y + box.height / 2},
            {holdMs: 800},
          ),
          {
            onEvent: async (_step, index) => {
              if (index !== 0) {
                return;
              }
              await expect
                .poll(async () =>
                  row.evaluate(el => el.getAttribute('data-astryx-press')),
                )
                .toBe('on');
              await expectDividersThroughTint(
                page,
                above,
                row,
                atRest,
                'finger press, fine pointer',
              );
            },
          },
        );
      });
    });

    test(`${scheme}: pressed by a finger`, async ({page}) => {
      await openList(page, scheme);
      test.skip(
        !(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)),
        'the press layer serves a touch screen',
      );
      const above = rowOf(page, 'Notifications');
      const row = rowOf(page, 'Messages');
      const atRest = await edgesOf(page, above, row);
      const box = await row.boundingBox();
      if (box == null) {
        throw new Error('no row');
      }
      const driver = await touchDriver(page);
      await driver.play(
        tap(
          {x: box.x + box.width / 2, y: box.y + box.height / 2},
          {holdMs: 800},
        ),
        {
          onEvent: async (_step, index) => {
            if (index !== 0) {
              return;
            }
            await expect
              .poll(async () =>
                row.evaluate(el => el.getAttribute('data-astryx-press')),
              )
              .toBe('on');
            await expectDividersThroughTint(
              page,
              above,
              row,
              atRest,
              'finger press',
            );
          },
        },
      );
    });
  }
});
