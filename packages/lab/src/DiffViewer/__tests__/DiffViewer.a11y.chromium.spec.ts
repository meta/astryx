// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^apps/storybook/stories/DiffViewer\.stories\.tsx$

/**
 * @file DiffViewer.a11y.chromium.spec.ts
 * @input The built Lab/DiffViewer review-comments story in real Chromium
 * @output Evidence that each line-number button takes a press across at least
 *   24px of width, and that its press area stays in its own row, in unified
 *   and split view, LTR and RTL
 * @position Browser binding for the line-number target size. jsdom has no
 *   layout, so it cannot hit-test.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'lab-diffviewer--review-comments';
const MIN_TARGET_WIDTH = 24;
// Hit testing follows the pixel grid, so a 24px area can read one probe step
// short.
const PROBE_STEP = 0.25;
const VIEWPORT = {width: 1280, height: 1000};
const LINE_BUTTON = '#storybook-root button[data-diff-line-button]';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

interface ButtonReading {
  readonly label: string;
  /** The painted width of the line number. */
  readonly width: number;
  /** The width of the unbroken run of presses that reach the button. */
  readonly pressWidth: number;
  /** A press one pixel past the button's top or bottom edge reaches it. */
  readonly aboveHits: boolean;
  readonly belowHits: boolean;
}

/**
 * Hit-tests every line-number button in the viewport along its middle line.
 * A press reaches a button when the topmost element at that point is the
 * button or a part of it.
 */
function readButtons(page: Page): Promise<ButtonReading[]> {
  return page.evaluate(
    ({selector, minWidth, step}) => {
      const reaches = (button: Element, x: number, y: number) => {
        const element = document.elementFromPoint(x, y);
        return (
          element != null && (element === button || button.contains(element))
        );
      };
      return [...document.querySelectorAll<HTMLElement>(selector)]
        .filter(button => {
          const rect = button.getBoundingClientRect();
          return (
            rect.top > 1 &&
            rect.bottom < window.innerHeight - 1 &&
            rect.left > minWidth &&
            rect.right < window.innerWidth - minWidth
          );
        })
        .map(button => {
          const rect = button.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          let first: number | null = null;
          let last: number | null = null;
          for (let x = centerX - minWidth; x <= centerX + minWidth; x += step) {
            if (reaches(button, x, centerY)) {
              if (first == null) {
                first = x;
              }
              last = x;
            } else if (first != null) {
              break;
            }
          }
          return {
            label: button.getAttribute('aria-label') ?? '',
            width: rect.width,
            pressWidth: first == null || last == null ? 0 : last - first + step,
            aboveHits: reaches(button, centerX, rect.top - 1),
            belowHits: reaches(button, centerX, rect.bottom + 1),
          };
        });
    },
    {selector: LINE_BUTTON, minWidth: MIN_TARGET_WIDTH, step: PROBE_STEP},
  );
}

async function openStory(page: Page, globals?: string): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  const query = globals == null ? '' : `&globals=${globals}`;
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story${query}`,
    {waitUntil: 'load'},
  );
  await page.locator(LINE_BUTTON).first().waitFor();
  // Fonts set the width of a line number, so they load before any reading.
  await page.evaluate(() => document.fonts.ready);
}

function expectFullWidthTargets(
  buttons: ReadonlyArray<ButtonReading>,
  view: string,
): void {
  expect(
    buttons.length,
    `${view}: line-number buttons in view`,
  ).toBeGreaterThan(4);
  expect(
    buttons.some(button => button.width < MIN_TARGET_WIDTH),
    `${view}: a line number narrower than the target`,
  ).toBe(true);
  for (const button of buttons) {
    expect(
      button.pressWidth,
      `${view}, ${button.label}: press width`,
    ).toBeGreaterThanOrEqual(MIN_TARGET_WIDTH - PROBE_STEP);
    expect(button.aboveHits, `${view}, ${button.label}: row above`).toBe(false);
    expect(button.belowHits, `${view}, ${button.label}: row below`).toBe(false);
  }
}

for (const [direction, globals] of [
  ['ltr', undefined],
  ['rtl', 'direction:rtl'],
] as const) {
  test(`each line-number button takes a press across ${MIN_TARGET_WIDTH}px of width (${direction})`, async ({
    page,
  }) => {
    await openStory(page, globals);
    expectFullWidthTargets(await readButtons(page), `unified ${direction}`);

    await page.getByRole('button', {name: 'Split view'}).click();
    await page.getByRole('button', {name: 'Unified view'}).waitFor();
    expectFullWidthTargets(await readButtons(page), `split ${direction}`);
  });
}
