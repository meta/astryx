// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonPressRowTarget.interaction.browser.spec.ts
 * @input The built press feedback story of a Button whose `::after` covers
 *   its row, real touch input (Chromium CDP / WebKit's input command), and
 *   the interaction harness
 * @output Interaction proofs that a finger's press leaves a caller's
 *   row-wide `::after` where the caller put it: points on the row outside the
 *   Button hit the Button at rest, while the press is on and while it fades
 *   (both engines); a tap on the line under the Button activates it once
 *   (both engines, through the engine's own tap path), and so does a held
 *   press there (Chromium, which also clicks from a raw touch sequence)
 * @position Interaction evidence for privateAttributes/press.stylex.ts
 *   (`control`) as Button composes it
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const ROW_TARGET = 'core-press-feedback-touch--button-covering-its-row';
/** Long enough that the press is on before the lift. */
const HOLD_MS = 400;

interface Point {
  x: number;
  y: number;
}

/** What a point on the row hits, and the Button's press, in one state. */
interface HitState {
  press: string | null;
  hits: boolean[];
  layer: string;
}

async function openRow(page: Page) {
  await openStory(page, storybook(), ROW_TARGET);
  const driver = await touchDriver(page);
  const button = page.getByRole('button', {name: 'Open the conversation'});
  const line = page.getByText('Last message a minute ago', {exact: true});
  await expect(button).toBeVisible();
  const buttonBox = await button.boundingBox();
  const lineBox = await line.boundingBox();
  const rowBox = await button.evaluate(el => {
    const row = el.parentElement?.getBoundingClientRect();
    return row == null
      ? null
      : {x: row.x, y: row.y, width: row.width, height: row.height};
  });
  if (buttonBox == null || lineBox == null || rowBox == null) {
    throw new Error(
      `${ROW_TARGET}: the row, its Button or its line has no box`,
    );
  }
  // Two points on the row outside the Button's own box: the line under the
  // Button, and the row's far corner, inside its padding.
  const probes: Point[] = [
    {
      x: Math.round(lineBox.x + lineBox.width / 2),
      y: Math.round(lineBox.y + lineBox.height / 2),
    },
    {
      x: Math.round(rowBox.x + rowBox.width - 4),
      y: Math.round(rowBox.y + rowBox.height - 4),
    },
  ];
  for (const probe of probes) {
    const inside =
      probe.x >= buttonBox.x &&
      probe.x <= buttonBox.x + buttonBox.width &&
      probe.y >= buttonBox.y &&
      probe.y <= buttonBox.y + buttonBox.height;
    expect(inside, JSON.stringify({probe, buttonBox})).toBe(false);
  }
  return {driver, button, probes};
}

const openedCount = (page: Page) => page.getByText(/^Opened: \d+$/);

test('while a press is on and while it fades, points on the row outside the Button hit the Button, as at rest', async ({
  page,
}) => {
  const {driver, button, probes} = await openRow(page);
  // Every state the press passes through, read as the attribute changes. The
  // read before the press is the control: at rest the row is the containing
  // block of the Button's `::after`, so the row's points hit the Button.
  await button.evaluate((el, points) => {
    const states: HitState[] = [];
    const read = () => {
      states.push({
        press: el.getAttribute('data-astryx-press'),
        hits: points.map(
          point =>
            document.elementFromPoint(point.x, point.y)?.closest('button') ===
            el,
        ),
        layer: getComputedStyle(el, '::before').content,
      });
    };
    read();
    new MutationObserver(read).observe(el, {
      attributes: true,
      attributeFilter: ['data-astryx-press'],
    });
    (window as unknown as {__rowTarget: HitState[]}).__rowTarget = states;
  }, probes);
  await driver.play(tap(probes[0], {holdMs: HOLD_MS}));
  await expect
    .poll(async () => button.getAttribute('data-astryx-press'))
    .toBeNull();
  const states = await page.evaluate(
    () => (window as unknown as {__rowTarget: HitState[]}).__rowTarget,
  );
  const log = JSON.stringify({probes, states});
  expect(
    states.filter(state => state.press != null).map(state => state.press),
    log,
  ).toEqual(['on', 'fading']);
  for (const state of states) {
    expect(state.hits, log).toEqual(probes.map(() => true));
  }
  // The press still paints: the Button's press layer is there while it is on
  // and while it fades.
  for (const state of states.filter(entry => entry.press != null)) {
    expect(state.layer, log).toBe('""');
  }
});

test('a tap on the line under the Button activates the Button once', async ({
  page,
}) => {
  const {driver, button, probes} = await openRow(page);
  await expect(openedCount(page)).toHaveText('Opened: 0');
  await driver.tap(probes[0]);
  await expect
    .poll(async () => button.getAttribute('data-astryx-press'))
    .toBeNull();
  // Read once, after the press: a retried read could pass on its way to 2.
  expect(await openedCount(page).textContent()).toBe('Opened: 1');
});

test('a held press on the line under the Button, then the lift, activates the Button once', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'WebKit synthesises a click only from its own tap path, not from a raw touch sequence',
  );
  const {driver, button, probes} = await openRow(page);
  await expect(openedCount(page)).toHaveText('Opened: 0');
  await driver.play(tap(probes[0], {holdMs: HOLD_MS}));
  await expect
    .poll(async () => button.getAttribute('data-astryx-press'))
    .toBeNull();
  expect(await openedCount(page).textContent()).toBe('Opened: 1');
});
